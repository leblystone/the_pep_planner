const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
require('dotenv').config();

const { getMarketplaceTokens, refreshTokenIfNeeded } = require('./marketplaceTokens');

function getRawBody(req) {
  if (typeof req.rawBody !== 'undefined') return req.rawBody;
  return Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
}

/**
 * Etsy Open API v3 webhook signature (Svix-style).
 * Headers: webhook-id, webhook-timestamp, webhook-signature
 * Secret: whsec_<base64>
 */
function verifyEtsyWebhookSignature(req) {
  const secretRaw = (process.env.ETSY_WEBHOOK_SECRET || '').trim();
  if (!secretRaw) {
    logger.error('ETSY_WEBHOOK_SECRET not set — rejecting webhook');
    return false;
  }

  const webhookId = req.headers['webhook-id'];
  const webhookTimestamp = req.headers['webhook-timestamp'];
  const webhookSignature = req.headers['webhook-signature'];
  if (!webhookId || !webhookTimestamp || !webhookSignature) {
    logger.warn('Etsy webhook missing signature headers');
    return false;
  }

  // Reject stale / future timestamps (±5 minutes)
  const ts = Number(webhookTimestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) {
    logger.warn('Etsy webhook timestamp out of range', { webhookTimestamp });
    return false;
  }

  const secretPart = secretRaw.startsWith('whsec_') ? secretRaw.slice('whsec_'.length) : secretRaw;
  let secretBytes;
  try {
    secretBytes = Buffer.from(secretPart, 'base64');
  } catch {
    return false;
  }

  const rawBody = getRawBody(req);
  const signedContent = `${webhookId}.${webhookTimestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');

  // Header may be "v1,<sig>" or comma-separated versioned signatures
  const candidates = String(webhookSignature)
    .split(' ')
    .flatMap((part) => part.split(','))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => (s.startsWith('v1,') ? s.slice(3) : s.includes('=') ? s.split('=')[1] : s));

  return candidates.some((candidate) => {
    try {
      const a = Buffer.from(expected);
      const b = Buffer.from(candidate);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });
}

/**
 * TikTok developer-style webhook signature (TikTok-Signature: t=...,s=...).
 * Falls back to HMAC of raw body with app secret when only a bare signature header is present.
 */
function verifyTikTokWebhookSignature(req) {
  const secret = (
    process.env.TIKTOK_APP_SECRET ||
    process.env.TIKTOK_CLIENT_SECRET ||
    ''
  ).trim();
  if (!secret) {
    logger.error('TIKTOK_APP_SECRET not set — rejecting webhook');
    return false;
  }

  const header =
    req.headers['tiktok-signature'] ||
    req.headers['TikTok-Signature'] ||
    req.headers['webhook-signature'] ||
    req.headers['Webhook-Signature'];
  if (!header || typeof header !== 'string') {
    logger.warn('TikTok webhook missing signature header');
    return false;
  }

  const rawBody = getRawBody(req);
  const rawStr = rawBody.toString('utf8');

  // Format: t=<unix>,s=<hex>
  if (header.includes('t=') && header.includes('s=')) {
    const parts = Object.fromEntries(
      header.split(',').map((p) => {
        const [k, ...rest] = p.trim().split('=');
        return [k, rest.join('=')];
      })
    );
    const t = parts.t;
    const s = parts.s;
    if (!t || !s) return false;
    if (Math.abs(Date.now() / 1000 - Number(t)) > 300) {
      logger.warn('TikTok webhook timestamp out of range', { t });
      return false;
    }
    const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawStr}`).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(s, 'hex'));
    } catch {
      return false;
    }
  }

  // Bare hex HMAC of raw body
  const expectedBody = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    const provided = header.replace(/^sha256=/i, '').trim();
    return crypto.timingSafeEqual(Buffer.from(expectedBody, 'hex'), Buffer.from(provided, 'hex'));
  } catch {
    return false;
  }
}

async function etsyClientId() {
  const fromEnv = (process.env.ETSY_CLIENT_ID || '').trim();
  if (fromEnv) return fromEnv;
  // Fallback: read from Firestore (saved via Admin → Marketplaces → API Credentials)
  const snap = await admin.firestore().doc('_config/marketplaceAppCredentials').get();
  return (snap.exists && snap.data()?.etsy?.clientId) ? snap.data().etsy.clientId.trim() : '';
}

async function etsyApiGet(url, token) {
  const apiKey = await etsyClientId();
  const resp = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      Authorization: `Bearer ${token.accessToken}`,
      'Content-Type': 'application/json',
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
    throw err;
  }
  return data;
}

/** Etsy webhooks send resource_url; older payloads may include transactions inline. */
async function resolveEtsyOrderPayload(payload) {
  const inlineTx = payload.transactions || payload.Transactions || [];
  if (inlineTx.length) {
    return {
      receiptId: payload.receipt_id || payload.id,
      transactions: inlineTx,
      eventType: payload.event_type || 'legacy',
    };
  }

  if (!payload.resource_url) {
    return { receiptId: null, transactions: [], eventType: payload.event_type || null };
  }

  const tokens = await getMarketplaceTokens();
  const token = await refreshTokenIfNeeded('etsy') || tokens.etsy;
  if (!token?.accessToken) {
    throw new Error('Etsy shop not connected — connect in Admin → Marketplaces first');
  }

  const receiptUrl = String(payload.resource_url).trim();
  const receipt = await etsyApiGet(receiptUrl, token);
  const receiptId =
    receipt.receipt_id
    || (receiptUrl.match(/\/receipts\/(\d+)/)?.[1])
    || null;

  let transactions = receipt.transactions;
  if (!Array.isArray(transactions) || !transactions.length) {
    const txData = await etsyApiGet(`${receiptUrl.replace(/\/$/, '')}/transactions`, token);
    transactions = txData.results || txData.transactions || [];
  }

  return {
    receiptId: receiptId || receipt.receipt_id,
    transactions,
    eventType: payload.event_type || null,
  };
}
const {
  updateEtsyListingStock,
  updateTikTokProductStock,
} = require('./marketplaces');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function decrementStock(productId, qty = 1) {
  const db = admin.firestore();
  return db.runTransaction(async (t) => {
    const ref = db.collection('shopProducts').doc(productId);
    const doc = await t.get(ref);
    if (!doc.exists) throw new Error(`Product ${productId} not found`);
    const current = doc.data().stock || 0;
    const newStock = current - qty;
    if (newStock < 0) throw new Error(`Insufficient stock for ${productId}: have ${current}, need ${qty}`);
    t.update(ref, { stock: newStock, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
    return newStock;
  });
}

async function decrementStockByPriceId(priceId, qty = 1) {
  const db = admin.firestore();
  const snap = await db.collection('shopProducts').where('stripePriceId', '==', priceId).limit(1).get();
  if (snap.empty) {
    logger.warn(`No product found for priceId: ${priceId}`);
    return null;
  }
  const productDoc = snap.docs[0];
  return { productId: productDoc.id, newStock: await decrementStock(productDoc.id, qty) };
}

async function syncStockToAllPlatforms(productId) {
  const db = admin.firestore();
  const doc = await db.collection('shopProducts').doc(productId).get();
  if (!doc.exists) {
    return { productId, etsy: null, tiktok: null, error: 'Product not found' };
  }

  const product = doc.data();
  const stock = product.stock || 0;
  const platformIds = product.platformIds || {};
  const etsyListingId = String(platformIds.etsy || '').trim();
  const tiktokProductId = String(platformIds.tiktok || '').trim();
  const tokens = await getMarketplaceTokens();
  const results = { productId, etsy: null, tiktok: null };

  if (etsyListingId) {
    if (!tokens.etsy?.accessToken) {
      results.etsy = { ok: false, listingId: etsyListingId, error: 'Etsy not connected — connect in Admin → Marketplaces' };
      logger.warn(`Skipping Etsy sync for ${productId}: shop not connected`);
    } else {
      try {
        const etsyToken = await refreshTokenIfNeeded('etsy');
        await updateEtsyListingStock(etsyListingId, stock, etsyToken || tokens.etsy);
        results.etsy = { ok: true, listingId: etsyListingId, stock };
        logger.info(`Synced stock to Etsy listing ${etsyListingId}: ${stock}`);
      } catch (err) {
        results.etsy = { ok: false, listingId: etsyListingId, error: err.message };
        logger.error(`Failed to sync to Etsy for ${productId}:`, err);
      }
    }
  }

  if (tiktokProductId) {
    if (!tokens.tiktok?.accessToken) {
      results.tiktok = { ok: false, productId: tiktokProductId, error: 'TikTok not connected — connect in Admin → Marketplaces' };
      logger.warn(`Skipping TikTok sync for ${productId}: shop not connected`);
    } else {
      try {
        const tiktokToken = await refreshTokenIfNeeded('tiktok');
        await updateTikTokProductStock(tiktokProductId, stock, tiktokToken || tokens.tiktok);
        results.tiktok = { ok: true, productId: tiktokProductId, stock };
        logger.info(`Synced stock to TikTok product ${tiktokProductId}: ${stock}`);
      } catch (err) {
        results.tiktok = { ok: false, productId: tiktokProductId, error: err.message };
        logger.error(`Failed to sync to TikTok for ${productId}:`, err);
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// HTTP Endpoints — Marketplace Order Webhooks
// ---------------------------------------------------------------------------

exports.etsyOrderWebhook = onRequest(
  { cors: false },
  async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    if (!verifyEtsyWebhookSignature(req)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body || {};
    logger.info('Received Etsy order webhook', {
      event_type: payload.event_type,
      shop_id: payload.shop_id,
    });

    const eventType = payload.event_type || '';
    if (eventType === 'order.canceled') {
      logger.info('Etsy order.canceled received — stock restore not implemented yet');
      res.status(200).json({ ok: true, message: 'Cancel acknowledged' });
      return;
    }

    // Detect Etsy test payloads (shop_id: 42 is always used in webhook portal tests)
    const shopId = payload.shop_id;
    const resourceUrl = payload.resource_url || '';
    const isTestPayload =
      shopId === 42 ||
      resourceUrl.includes('/shops/12345/') ||
      resourceUrl.includes('/receipts/54321');
    if (isTestPayload) {
      logger.info('Etsy test webhook received — acknowledging without processing');
      res.status(200).json({ ok: true, message: 'Test webhook acknowledged' });
      return;
    }

    const { receiptId, transactions } = await resolveEtsyOrderPayload(payload);

    if (!transactions.length) {
      logger.warn('Etsy webhook had no transactions to process', { receiptId, eventType });
      res.status(200).json({ ok: true, message: 'No transactions' });
      return;
    }

    const db = admin.firestore();
    const results = [];

    for (const txn of transactions) {
      const etsyListingId = String(txn.listing_id);
      const qty = txn.quantity || 1;

      const snap = await db.collection('shopProducts')
        .where('platformIds.etsy', '==', etsyListingId)
        .limit(1)
        .get();

      if (snap.empty) {
        logger.warn(`No shopProduct found for Etsy listing ${etsyListingId}`);
        results.push({ etsyListingId, status: 'not_found' });
        continue;
      }

      const productDoc = snap.docs[0];
      try {
        const newStock = await decrementStock(productDoc.id, qty);
        await syncStockToAllPlatforms(productDoc.id);
        results.push({ etsyListingId, productId: productDoc.id, newStock, status: 'decremented' });
      } catch (err) {
        logger.error(`Failed to decrement stock for Etsy listing ${etsyListingId}:`, err);
        results.push({ etsyListingId, productId: productDoc.id, status: 'error', error: err.message });
      }
    }

    await db.collection('physicalOrders').add({
      source: 'etsy',
      externalOrderId: String(receiptId),
      payload,
      results,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`Etsy order ${receiptId} processed`, { results });
    res.status(200).json({ ok: true, results });
  } catch (err) {
    logger.error('etsyOrderWebhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

exports.tiktokOrderWebhook = onRequest(
  { cors: false },
  async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    if (!verifyTikTokWebhookSignature(req)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body;
    logger.info('Received TikTok order webhook', { payload });

    const orderId = payload.order_id || payload.data?.order_id;
    const items = payload.item_list || payload.data?.item_list || [];

    if (!items.length) {
      logger.warn('TikTok webhook had no items to process');
      res.status(200).json({ ok: true, message: 'No items' });
      return;
    }

    const db = admin.firestore();
    const results = [];

    for (const item of items) {
      const tiktokProductId = String(item.product_id || item.id);
      const qty = item.quantity || 1;

      const snap = await db.collection('shopProducts')
        .where('platformIds.tiktok', '==', tiktokProductId)
        .limit(1)
        .get();

      if (snap.empty) {
        logger.warn(`No shopProduct found for TikTok product ${tiktokProductId}`);
        results.push({ tiktokProductId, status: 'not_found' });
        continue;
      }

      const productDoc = snap.docs[0];
      try {
        const newStock = await decrementStock(productDoc.id, qty);
        await syncStockToAllPlatforms(productDoc.id);
        results.push({ tiktokProductId, productId: productDoc.id, newStock, status: 'decremented' });
      } catch (err) {
        logger.error(`Failed to decrement stock for TikTok product ${tiktokProductId}:`, err);
        results.push({ tiktokProductId, productId: productDoc.id, status: 'error', error: err.message });
      }
    }

    await db.collection('physicalOrders').add({
      source: 'tiktok',
      externalOrderId: String(orderId),
      payload,
      results,
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info(`TikTok order ${orderId} processed`, { results });
    res.status(200).json({ ok: true, results });
  } catch (err) {
    logger.error('tiktokOrderWebhook error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Firestore Trigger — Stock Change Detection
// ---------------------------------------------------------------------------

exports.onStockUpdated = onDocumentUpdated('shopProducts/{productId}', async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const productId = event.params.productId;

  const oldStock = before.stock ?? 0;
  const newStock = after.stock ?? 0;

  if (oldStock === newStock) return;

  logger.info(`Stock changed for ${productId}: ${oldStock} → ${newStock}`);

  try {
    await syncStockToAllPlatforms(productId);
  } catch (err) {
    logger.error(`Failed to sync platforms after stock change for ${productId}:`, err);
  }

  const restockThreshold = after.restockThreshold || 5;
  if (newStock <= restockThreshold) {
    const adminEmail = process.env.PLANNER_ORDER_NOTIFICATION_EMAIL || 'lebrockmaldonado@gmail.com';
    const emailService = require('./emailService');
    try {
      await emailService.sendEmailWithQueue(
        adminEmail,
        `⚠️ Low Stock Alert: ${after.name || productId}`,
        `<h2>Low Stock Alert</h2>
         <p>Product <strong>${after.name || productId}</strong> is running low.</p>
         <ul>
           <li>Current stock: <strong>${newStock}</strong></li>
           <li>Restock threshold: <strong>${restockThreshold}</strong></li>
         </ul>
         <p>Please reorder soon.</p>`,
        { priority: 'high', type: 'restockAlert' }
      );
      logger.info(`Restock alert sent for ${productId} (stock: ${newStock})`);
    } catch (err) {
      logger.error(`Failed to send restock alert for ${productId}:`, err);
    }
  }

  const notifyMeAdmin = require('./notifyMeAdmin');
  if (oldStock <= 0 && newStock > 0) {
    try {
      const db = admin.firestore();
      await notifyMeAdmin.sendNotifyMeAlertsForProduct(db, productId, { sentBy: 'auto-restock' });
    } catch (err) {
      logger.error(`Failed to process notify-me restock alerts for ${productId}:`, err);
    }
  }
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

exports.decrementStock = decrementStock;
exports.decrementStockByPriceId = decrementStockByPriceId;
exports.syncStockToAllPlatforms = syncStockToAllPlatforms;
