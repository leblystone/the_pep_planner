const crypto = require('crypto');
const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
require('dotenv').config();

const {
  getMarketplaceTokens,
  saveMarketplaceToken,
  refreshTokenIfNeeded,
} = require('./marketplaceTokens');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'tpp-splendide';
const FUNCTIONS_BASE = `https://us-central1-${PROJECT_ID}.cloudfunctions.net`;
const OAUTH_CALLBACK_URL = `${FUNCTIONS_BASE}/marketplaceOAuthCallback`;
const BASE_URL = process.env.BASE_URL || 'https://thepepplanner.app';
const ADMIN_RETURN_URL = `${BASE_URL}/admin/shop/products?view=marketplaces`;

const ADMIN_EMAILS = [
  'lebrockmaldonado@gmail.com',
  'contact@thepepplanner.com',
  'thepepplanner@gmail.com',
];

const ETSY_SCOPES = 'listings_w transactions_r shops_r email_r';
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function requireAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const email = (request.auth.token.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) {
    throw new HttpsError('permission-denied', 'Admin access required');
  }
  return email;
}

function base64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pkceChallenge(verifier) {
  return base64Url(crypto.createHash('sha256').update(verifier).digest());
}

async function getAppCredentials(platform) {
  const envMap = {
    etsy: {
      clientId: process.env.ETSY_CLIENT_ID,
      clientSecret: process.env.ETSY_CLIENT_SECRET,
    },
    tiktok: {
      clientId: process.env.TIKTOK_APP_KEY || process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_APP_SECRET || process.env.TIKTOK_CLIENT_SECRET,
    },
  };

  const fromEnv = envMap[platform];
  if (fromEnv?.clientId && fromEnv?.clientSecret) {
    return { clientId: fromEnv.clientId.trim(), clientSecret: fromEnv.clientSecret.trim() };
  }

  const snap = await admin.firestore().doc('_config/marketplaceAppCredentials').get();
  if (!snap.exists) return null;
  const data = snap.data()[platform];
  if (!data?.clientId || !data?.clientSecret) return null;
  return { clientId: data.clientId, clientSecret: data.clientSecret };
}

async function saveOAuthState(state, payload) {
  await admin.firestore().doc(`_config/oauth_${state}`).set({
    ...payload,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function consumeOAuthState(state) {
  const ref = admin.firestore().doc(`_config/oauth_${state}`);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.delete();
  const data = snap.data();
  const created = data.createdAt?.toDate?.() || new Date(0);
  if (Date.now() - created.getTime() > OAUTH_STATE_TTL_MS) return null;
  return data;
}

function redirectHtml(targetUrl, message) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Marketplace</title></head>
<body><p>${message}</p><script>window.location.replace(${JSON.stringify(targetUrl)});</script>
<noscript><a href="${targetUrl}">Continue</a></noscript></body></html>`;
}

// ---------------------------------------------------------------------------
// Etsy API
// ---------------------------------------------------------------------------

async function etsyFetch(path, token, options = {}) {
  const resp = await fetch(`https://openapi.etsy.com/v3${path}`, {
    ...options,
    headers: {
      'x-api-key': (await getAppCredentials('etsy'))?.clientId || process.env.ETSY_CLIENT_ID || '',
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!resp.ok) {
    const err = new Error(data.error || data.message || `Etsy API ${resp.status}`);
    err.status = resp.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function fetchEtsyShopId(token) {
  if (token.shopId) return token.shopId;
  const me = await etsyFetch('/application/users/me', token);
  const userId = me.user_id;
  const shops = await etsyFetch(`/application/users/${userId}/shops`, token);
  const shopId = shops.results?.[0]?.shop_id;
  if (!shopId) throw new Error('No Etsy shop found on this account');
  return shopId;
}

async function updateEtsyListingStock(listingId, stock, token) {
  const refreshed = await refreshTokenIfNeeded('etsy') || token;
  const accessToken = refreshed.accessToken;
  const activeToken = { ...token, accessToken };

  const inventory = await etsyFetch(`/application/listings/${listingId}/inventory`, activeToken);
  const products = (inventory.products || []).map((product) => ({
    ...product,
    offerings: (product.offerings || []).map((offering) => ({
      ...offering,
      quantity: Math.max(0, stock),
      is_enabled: stock > 0,
    })),
  }));

  if (!products.length) {
    throw new Error(`Etsy listing ${listingId} has no inventory products to update`);
  }

  await etsyFetch(`/application/listings/${listingId}/inventory`, activeToken, {
    method: 'PUT',
    body: JSON.stringify({ products, sku_on_property: inventory.sku_on_property }),
  });

  return { listingId, stock };
}

// ---------------------------------------------------------------------------
// TikTok Shop API
// ---------------------------------------------------------------------------

async function tiktokSignedRequest(path, method, body, credentials, token) {
  const timestamp = Math.floor(Date.now() / 1000);
  const appKey = credentials.clientId;
  const appSecret = credentials.clientSecret;
  const accessToken = token.accessToken;
  const shopCipher = token.shopCipher || '';
  const shopId = token.shopId ? String(token.shopId) : '';

  const params = new URLSearchParams({
    app_key: appKey,
    timestamp: String(timestamp),
    version: '202309',
    access_token: accessToken,
  });
  if (shopCipher) params.set('shop_cipher', shopCipher);
  if (shopId) params.set('shop_id', shopId);

  const sortedKeys = [...params.keys()].sort();
  const paramStr = sortedKeys.map((k) => `${k}${params.get(k)}`).join('');
  const bodyStr = method !== 'GET' && body ? JSON.stringify(body) : '';
  const signInput = `${appSecret}${path}${paramStr}${bodyStr}${appSecret}`;
  const sign = crypto.createHmac('sha256', appSecret).update(signInput).digest('hex');

  params.set('sign', sign);

  const url = `https://open-api.tiktokglobalshop.com${path}?${params.toString()}`;
  const resp = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-tts-access-token': accessToken,
    },
    body: bodyStr || undefined,
  });

  const data = await resp.json();
  if (!resp.ok || data.code !== 0) {
    const err = new Error(data.message || `TikTok API error ${data.code}`);
    err.data = data;
    throw err;
  }
  return data.data;
}

async function updateTikTokProductStock(productId, stock, token) {
  const credentials = await getAppCredentials('tiktok');
  if (!credentials) throw new Error('TikTok app credentials not configured');

  const refreshed = await refreshTokenIfNeeded('tiktok') || token;
  if (!refreshed?.accessToken) throw new Error('TikTok shop not connected');
  if (!refreshed.shopCipher) {
    throw new Error('TikTok shop_cipher missing — reconnect TikTok in Admin → Marketplaces');
  }

  const qty = Math.max(0, Number(stock) || 0);
  const productData = await tiktokSignedRequest(
    `/product/202309/products/${productId}`,
    'GET',
    null,
    credentials,
    refreshed,
  );

  const skus = productData?.skus || [];
  if (!skus.length) {
    throw new Error(`TikTok product ${productId} has no SKUs to update`);
  }

  const updateSkus = skus.map((sku) => {
    const skuId = sku.id || sku.sku_id;
    if (!skuId) throw new Error(`TikTok product ${productId} has a SKU without an id`);

    const existingInventory = sku.stock_infos || sku.inventory || [];
    const inventory = existingInventory.length
      ? existingInventory.map((inv) => {
          const entry = { quantity: qty };
          const warehouseId = inv.warehouse_id || inv.warehouseId;
          if (warehouseId) entry.warehouse_id = warehouseId;
          return entry;
        })
      : [{ quantity: qty }];

    return { id: String(skuId), inventory };
  });

  await tiktokSignedRequest(
    `/product/202309/products/${productId}/inventory/update`,
    'POST',
    { skus: updateSkus },
    credentials,
    refreshed,
  );

  return { productId, stock: qty, skuCount: updateSkus.length };
}

// ---------------------------------------------------------------------------
// Callable + HTTP exports
// ---------------------------------------------------------------------------

exports.getMarketplaceStatus = onCall({ cors: true }, async (request) => {
  requireAdmin(request);
  const tokens = await getMarketplaceTokens();

  const status = {};
  for (const platform of ['etsy', 'tiktok']) {
    const t = tokens[platform];
    status[platform] = {
      connected: !!(t && t.accessToken),
      shopName: t?.shopName || null,
      shopId: t?.shopId || null,
      connectedAt: t?.updatedAt || null,
    };
  }
  return { status, oauthCallbackUrl: OAUTH_CALLBACK_URL };
});

exports.startMarketplaceOAuth = onCall({ cors: true }, async (request) => {
  requireAdmin(request);
  const { platform } = request.data || {};
  if (!['etsy', 'tiktok'].includes(platform)) {
    throw new HttpsError('invalid-argument', 'platform must be etsy or tiktok');
  }

  const credentials = await getAppCredentials(platform);
  if (!credentials?.clientId) {
    throw new HttpsError(
      'failed-precondition',
      `${platform} API credentials not configured. Set ETSY_CLIENT_ID/ETSY_CLIENT_SECRET or TIKTOK_APP_KEY/TIKTOK_APP_SECRET in Cloud Functions env, or save credentials in admin.`,
    );
  }

  const state = crypto.randomBytes(24).toString('hex');
  const verifier = base64Url(crypto.randomBytes(32));

  await saveOAuthState(state, {
    platform,
    codeVerifier: verifier,
    adminEmail: request.auth.token.email,
  });

  let authUrl;
  if (platform === 'etsy') {
    const params = new URLSearchParams({
      response_type: 'code',
      redirect_uri: OAUTH_CALLBACK_URL,
      scope: ETSY_SCOPES,
      client_id: credentials.clientId,
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: 'S256',
    });
    authUrl = `https://www.etsy.com/oauth/connect?${params.toString()}`;
  } else {
    const params = new URLSearchParams({
      app_key: credentials.clientId,
      state,
      redirect_uri: OAUTH_CALLBACK_URL,
      grant_type: 'authorized_code',
    });
    authUrl = `https://auth.tiktok-shops.com/oauth/authorize?${params.toString()}`;
  }

  return { authUrl, state };
});

exports.marketplaceOAuthCallback = onRequest({ cors: false }, async (req, res) => {
  try {
    const { code, state, error, error_description: errorDesc } = req.query;
    const fail = (msg) => {
      res.status(200).send(redirectHtml(
        `${ADMIN_RETURN_URL}?oauth=error&message=${encodeURIComponent(msg)}`,
        msg,
      ));
    };

    if (error) {
      fail(errorDesc || error);
      return;
    }
    if (!code || !state) {
      fail('Missing authorization code');
      return;
    }

    const pending = await consumeOAuthState(String(state));
    if (!pending) {
      fail('OAuth session expired — try connecting again');
      return;
    }

    const { platform, codeVerifier } = pending;
    const credentials = await getAppCredentials(platform);
    if (!credentials) {
      fail('App credentials not configured');
      return;
    }

    let tokenPayload;

    if (platform === 'etsy') {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: credentials.clientId,
        redirect_uri: OAUTH_CALLBACK_URL,
        code: String(code),
        code_verifier: codeVerifier,
      });
      const resp = await fetch('https://api.etsy.com/v3/public/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
      const data = await resp.json();
      if (!resp.ok) {
        logger.error('Etsy token exchange failed', data);
        fail(data.error || 'Etsy authorization failed');
        return;
      }

      const expiresAt = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + (data.expires_in || 3600) * 1000),
      );

      tokenPayload = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
        tokenType: data.token_type,
      };

      // Fetch shop info — if this fails, still save the token (shop info is just display metadata)
      try {
        const me = await etsyFetch('/application/users/me', tokenPayload);
        const shops = await etsyFetch(`/application/users/${me.user_id}/shops`, tokenPayload);
        const shop = shops.results?.[0];
        tokenPayload.shopId = shop?.shop_id || null;
        tokenPayload.shopName = shop?.shop_name || null;
      } catch (shopErr) {
        logger.warn('Could not fetch Etsy shop info after token exchange (non-fatal):', shopErr.message);
        tokenPayload.shopId = null;
        tokenPayload.shopName = null;
      }
    } else {
      const resp = await fetch('https://auth.tiktok-shops.com/api/v2/token/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_key: credentials.clientId,
          app_secret: credentials.clientSecret,
          auth_code: String(code),
          grant_type: 'authorized_code',
        }),
      });
      const data = await resp.json();
      if (data.code !== 0 || !data.data?.access_token) {
        logger.error('TikTok token exchange failed', data);
        fail(data.message || 'TikTok authorization failed');
        return;
      }

      const d = data.data;
      tokenPayload = {
        accessToken: d.access_token,
        refreshToken: d.refresh_token,
        expiresAt: admin.firestore.Timestamp.fromDate(
          new Date(Date.now() + (d.access_token_expire_in || 86400) * 1000),
        ),
        shopCipher: d.shop_cipher || d.cipher,
        shopName: d.seller_name || d.shop_name || null,
        shopId: d.shop_id || null,
      };
    }

    await saveMarketplaceToken(platform, tokenPayload);

    res.status(200).send(redirectHtml(
      `${ADMIN_RETURN_URL}?oauth=${platform}&status=success`,
      'Connected! Redirecting…',
    ));
  } catch (err) {
    logger.error('marketplaceOAuthCallback error:', err);
    res.status(200).send(redirectHtml(
      `${ADMIN_RETURN_URL}?oauth=error&message=${encodeURIComponent(err.message)}`,
      err.message,
    ));
  }
});

exports.disconnectMarketplace = onCall({ cors: true }, async (request) => {
  requireAdmin(request);
  const { platform } = request.data || {};
  if (!['etsy', 'tiktok'].includes(platform)) {
    throw new HttpsError('invalid-argument', 'platform must be etsy or tiktok');
  }

  await admin.firestore().doc('_config/marketplaceTokens').set(
    { [platform]: admin.firestore.FieldValue.delete() },
    { merge: true },
  );

  return { ok: true, platform };
});

exports.saveMarketplaceAppCredentials = onCall({ cors: true }, async (request) => {
  requireAdmin(request);
  const { platform, clientId, clientSecret } = request.data || {};
  if (!['etsy', 'tiktok'].includes(platform)) {
    throw new HttpsError('invalid-argument', 'platform must be etsy or tiktok');
  }
  if (!clientId?.trim() || !clientSecret?.trim()) {
    throw new HttpsError('invalid-argument', 'clientId and clientSecret are required');
  }

  await admin.firestore().doc('_config/marketplaceAppCredentials').set(
    {
      [platform]: {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: request.auth.token.email,
      },
    },
    { merge: true },
  );

  return { ok: true };
});

exports.syncAllMarketplaceStock = onCall({ cors: true }, async (request) => {
  requireAdmin(request);
  try {
    const { syncStockToAllPlatforms } = require('./inventorySync');

    const snap = await admin.firestore().collection('shopProducts').get();
    const results = [];

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const platformIds = data.platformIds || {};
      const hasEtsy = String(platformIds.etsy || '').trim();
      const hasTiktok = String(platformIds.tiktok || '').trim();
      if (!hasEtsy && !hasTiktok) {
        results.push({ productId: docSnap.id, name: data.name, status: 'skipped', reason: 'no platform IDs' });
        continue;
      }

      const syncResult = await syncStockToAllPlatforms(docSnap.id);
      const platformErrors = [];
      if (syncResult.etsy?.ok === false) platformErrors.push(`Etsy: ${syncResult.etsy.error}`);
      if (syncResult.tiktok?.ok === false) platformErrors.push(`TikTok: ${syncResult.tiktok.error}`);

      const syncedPlatforms = [
        syncResult.etsy?.ok && 'etsy',
        syncResult.tiktok?.ok && 'tiktok',
      ].filter(Boolean);

      if (platformErrors.length) {
        results.push({
          productId: docSnap.id,
          name: data.name,
          status: syncedPlatforms.length ? 'partial' : 'error',
          stock: data.stock ?? 0,
          syncedPlatforms,
          error: platformErrors.join(' · '),
          platforms: syncResult,
        });
      } else if (syncedPlatforms.length) {
        results.push({
          productId: docSnap.id,
          name: data.name,
          status: 'synced',
          stock: data.stock ?? 0,
          syncedPlatforms,
          platforms: syncResult,
        });
      } else {
        results.push({
          productId: docSnap.id,
          name: data.name,
          status: 'skipped',
          reason: 'no linked platforms to sync',
        });
      }
    }

    const synced = results.filter((r) => r.status === 'synced').length;
    const partial = results.filter((r) => r.status === 'partial').length;
    const errors = results.filter((r) => r.status === 'error').length;
    const skipped = results.filter((r) => r.status === 'skipped').length;
    const errorSamples = results
      .filter((r) => r.status === 'error' || r.status === 'partial')
      .slice(0, 5)
      .map((r) => ({ name: r.name, error: r.error }));

    // Use Timestamp.now() for history — serverTimestamp() cannot be used inside arrayUnion
    const syncedAt = admin.firestore.Timestamp.now();
    const syncRecord = {
      syncedAt,
      synced,
      partial,
      errors,
      skipped,
      errorSamples,
      triggeredBy: request.auth?.token?.email || 'admin',
    };
    await admin.firestore().doc('_config/stockSyncHistory').set(
      {
        lastSync: syncRecord,
        history: admin.firestore.FieldValue.arrayUnion(syncRecord),
      },
      { merge: true },
    );

    return { ok: true, synced, partial, errors, skipped, errorSamples, results };
  } catch (err) {
    logger.error('syncAllMarketplaceStock failed:', err);
    throw new HttpsError('internal', err.message || 'Stock sync failed');
  }
});

exports.updateEtsyListingStock = updateEtsyListingStock;
exports.updateTikTokProductStock = updateTikTokProductStock;
exports.etsyFetch = etsyFetch;
exports.fetchEtsyShopId = fetchEtsyShopId;
