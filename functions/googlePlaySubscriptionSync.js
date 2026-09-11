/**
 * Google Play → Firestore subscription sync (admin reconciliation).
 */
const admin = require('firebase-admin');
const { google } = require('googleapis');
const { logger } = require('firebase-functions');

const PACKAGE_NAME = 'com.thepepplanner.app';

function getPlayClient() {
  const keyValue = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
  if (!keyValue) return null;
  try {
    const credentials = JSON.parse(keyValue.trim().replace(/\r?\n/g, ''));
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    return google.androidpublisher({ version: 'v3', auth });
  } catch (e) {
    logger.error('Google Play client init failed', e.message);
    return null;
  }
}

// All known product IDs — try both prefixes for v1 lookups
const KNOWN_PRODUCT_IDS = [
  'm.thepepplanner.app.researchmonthly',
  'm.thepepplanner.app.researchannual',
  'm.thepepplanner.app.researchlifetime',
  'com.thepepplanner.app.researchmonthly',
  'com.thepepplanner.app.researchannual',
  'com.thepepplanner.app.researchlifetime',
];

function getAlternateProductId(pid) {
  if (!pid) return null;
  if (pid.startsWith('com.')) return pid.replace('com.', 'm.');
  if (pid.startsWith('m.')) return pid.replace('m.', 'com.');
  return null;
}

async function fetchGooglePlaySubscription(productId, purchaseToken) {
  const client = getPlayClient();
  if (!client) {
    logger.error('Google Play client is null — GOOGLE_PLAY_SERVICE_ACCOUNT_KEY missing or invalid');
    return { error: 'google_play_client_null' };
  }

  // Try v2 API first — only needs the token, auto-detects subscription
  let v2Error = null;
  if (client.purchases.subscriptionsv2) {
    try {
      const v2 = await client.purchases.subscriptionsv2.get({
        packageName: PACKAGE_NAME,
        token: purchaseToken,
      });
      if (v2.data) return { version: 'v2', data: v2.data };
    } catch (v2Err) {
      v2Error = v2Err.message;
      logger.warn('subscriptionsv2.get failed, trying v1:', v2Err.message);
    }
  } else {
    v2Error = 'subscriptionsv2 not available in googleapis SDK';
  }

  // v1 — try stored productId first, then alternate prefix, then brute-force all known IDs
  const idsToTry = [];
  if (productId) idsToTry.push(productId);
  const alt = getAlternateProductId(productId);
  if (alt) idsToTry.push(alt);
  for (const known of KNOWN_PRODUCT_IDS) {
    if (!idsToTry.includes(known)) idsToTry.push(known);
  }

  let lastV1Error = null;
  for (const tryId of idsToTry) {
    try {
      const response = await client.purchases.subscriptions.get({
        packageName: PACKAGE_NAME,
        subscriptionId: tryId,
        token: purchaseToken,
      });
      if (response.data) {
        logger.info(`v1 lookup succeeded with productId: ${tryId}`);
        return { version: 'v1', data: response.data, resolvedProductId: tryId };
      }
    } catch (e) {
      lastV1Error = e.message || String(e);
    }
  }

  const errorMsg = `All lookups failed. v2: ${v2Error || 'n/a'}. v1 (tried ${idsToTry.length} IDs): ${lastV1Error || 'n/a'}`;
  logger.error(`Google Play fetch failed for token ${purchaseToken?.slice(0, 20)}… — ${errorMsg}`);
  return { error: errorMsg };
}

// v2 subscription states → our status
const V2_STATE_MAP = {
  SUBSCRIPTION_STATE_ACTIVE: 'active',
  SUBSCRIPTION_STATE_EXPIRED: 'expired',
  SUBSCRIPTION_STATE_CANCELED: 'canceled',
  SUBSCRIPTION_STATE_IN_GRACE_PERIOD: 'active',
  SUBSCRIPTION_STATE_ON_HOLD: 'past_due',
  SUBSCRIPTION_STATE_PAUSED: 'paused',
  SUBSCRIPTION_STATE_PENDING: 'pending',
};

function mapGooglePlayToSubscription(productId, purchaseToken, fetchResult) {
  // Use the resolved product ID from v1 brute-force if available
  const resolvedId = fetchResult.resolvedProductId || productId;
  if (fetchResult.version === 'v2') {
    return mapV2(resolvedId, purchaseToken, fetchResult.data);
  }
  return mapV1(resolvedId, purchaseToken, fetchResult.data);
}

function resolveInterval(pid) {
  const id = (pid || '').toLowerCase();
  if (id.includes('lifetime')) return 'lifetime';
  if (id.includes('annual') || id.includes('year')) return 'year';
  return 'month';
}

function mapV2(fallbackProductId, purchaseToken, data) {
  const line = data.lineItems?.[0] || {};
  const realProductId = line.productId || data.latestOrderId?.split('..')[0] || fallbackProductId;

  const expiryTime = line.expiryTime ? new Date(line.expiryTime) : null;
  const startTime = data.startTime ? new Date(data.startTime) : null;
  const autoRenew = !!line.autoRenewingPlan;
  const status = V2_STATE_MAP[data.subscriptionState] || 'unknown';

  return {
    status,
    plan: realProductId,
    interval: resolveInterval(realProductId),
    paymentProvider: 'googleplay',
    source: 'googleplay',
    platform: 'google-play',
    googlePlayProductId: realProductId,
    googlePlayPurchaseToken: purchaseToken,
    currentPeriodStart: startTime ? startTime.toISOString() : null,
    currentPeriodEnd: expiryTime ? expiryTime.toISOString() : null,
    cancelAtPeriodEnd: !autoRenew,
    isAutoRenewing: autoRenew,
    cancelReason: null,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    lastStoreSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

function mapV1(productId, purchaseToken, data) {
  const expiryMs = data.expiryTimeMillis ? parseInt(data.expiryTimeMillis, 10) : 0;
  const now = Date.now();
  const autoRenew = data.autoRenewing === true;
  let status = 'active';
  if (expiryMs && expiryMs <= now) status = 'expired';
  if (data.cancelReason != null && data.cancelReason !== 0) status = 'canceled';

  return {
    status,
    plan: productId,
    interval: resolveInterval(productId),
    paymentProvider: 'googleplay',
    source: 'googleplay',
    platform: 'google-play',
    googlePlayProductId: productId,
    googlePlayPurchaseToken: purchaseToken,
    currentPeriodStart: data.startTimeMillis
      ? new Date(parseInt(data.startTimeMillis, 10)).toISOString()
      : null,
    currentPeriodEnd: expiryMs ? new Date(expiryMs).toISOString() : null,
    cancelAtPeriodEnd: !autoRenew,
    isAutoRenewing: autoRenew,
    cancelReason: data.cancelReason ?? null,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    lastStoreSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
}

async function writeGooglePlaySubscription(db, userId, subscriptionData) {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('userSubscriptions').doc(userId).set(
    { subscription: subscriptionData, lastUpdated: ts, lastReconciledAt: ts },
    { merge: true }
  );
  await db.collection('users').doc(userId).set(
    { subscription: subscriptionData, updatedAt: ts },
    { merge: true }
  );
}

async function resolveGooglePlayCredentials(db, userId) {
  const subDoc = await db.collection('userSubscriptions').doc(userId).get();
  const sub = subDoc.exists ? subDoc.data()?.subscription : null;
  const userDoc = await db.collection('users').doc(userId).get();
  const userSub = userDoc.exists ? userDoc.data()?.subscription : null;
  const merged = { ...(userSub || {}), ...(sub || {}) };
  const token = merged.googlePlayPurchaseToken;
  const productId = merged.googlePlayProductId || null;
  // v2 API only needs the token — productId is optional
  if (token) return { token, productId };
  return null;
}

async function syncUserGooglePlayFromStore(db, userId, options = {}) {
  const logContext = options.logContext || {};
  const subDoc = await db.collection('userSubscriptions').doc(userId).get();
  const beforeSub = subDoc.exists ? subDoc.data()?.subscription : null;

  const creds = await resolveGooglePlayCredentials(db, userId);
  if (!creds) {
    return { success: false, userId, reason: 'no_google_play_token' };
  }
  const fetchResult = await fetchGooglePlaySubscription(creds.productId, creds.token);
  if (!fetchResult || fetchResult.error) {
    return { success: false, userId, reason: 'google_play_api_failed', error: fetchResult?.error || 'null response' };
  }
  const subscriptionData = mapGooglePlayToSubscription(creds.productId, creds.token, fetchResult);
  await writeGooglePlaySubscription(db, userId, subscriptionData);

  let logged = false;
  if (logContext.runId) {
    const { logIfSubscriptionChanged } = require('./subscriptionReconciliationLog');
    logged = await logIfSubscriptionChanged(db, {
      runId: logContext.runId,
      userId,
      platform: 'googleplay',
      beforeSub,
      afterSub: subscriptionData,
      trigger: logContext.trigger,
      runBy: logContext.runBy,
      changeType: options.changeType,
      forceLog: options.forceLog,
    });
  }

  return {
    success: true,
    userId,
    status: subscriptionData.status,
    cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
    logged,
  };
}

async function collectGooglePlayUserIds(db) {
  const ids = new Set();
  const subSnap = await db.collection('userSubscriptions').get();
  for (const doc of subSnap.docs) {
    const sub = doc.data()?.subscription;
    if (sub?.googlePlayPurchaseToken && sub?.googlePlayProductId) ids.add(doc.id);
    if (
      sub?.paymentProvider === 'googleplay' ||
      sub?.source === 'googleplay' ||
      sub?.platform === 'google-play'
    ) {
      if (sub?.googlePlayPurchaseToken) ids.add(doc.id);
    }
  }
  return Array.from(ids);
}

async function runGooglePlayReconciliation(db, options = {}) {
  const maxUsers = options.maxUsers ?? 500;
  const userIds = (await collectGooglePlayUserIds(db)).slice(0, maxUsers);
  let synced = 0;
  let failed = 0;
  let skipped = 0;
  let logged = 0;
  let firstError = null;
  const details = [];
  if (options.logContext) {
    options.logContext.onLogged = () => { logged += 1; };
  }

  for (const userId of userIds) {
    try {
      // Grab email for the report
      const userDoc = await db.collection('users').doc(userId).get();
      const email = userDoc.exists ? (userDoc.data()?.email || userId) : userId;

      const subDoc = await db.collection('userSubscriptions').doc(userId).get();
      const beforeSub = subDoc.exists ? subDoc.data()?.subscription : null;
      const changeType = !beforeSub?.googlePlayPurchaseToken ? 'missing_restored' : 'drift_corrected';

      const result = await syncUserGooglePlayFromStore(db, userId, {
        logContext: options.logContext,
        changeType,
      });
      if (result.success) {
        synced++;
        if (result.logged) options.logContext?.onLogged?.();
        details.push({ userId, email, outcome: 'synced', status: result.status, cancelAtPeriodEnd: result.cancelAtPeriodEnd });
      } else if (result.reason === 'no_google_play_token') {
        skipped++;
      } else {
        failed++;
        if (!firstError) firstError = result.error || result.reason || 'unknown';
        details.push({ userId, email, outcome: 'failed', reason: result.reason, error: result.error });
      }
    } catch (e) {
      failed++;
      if (!firstError) firstError = e.message;
      details.push({ userId, outcome: 'failed', reason: 'exception', error: e.message });
      logger.warn(`Google Play sync failed for ${userId}`, e.message);
    }
  }

  return { usersScanned: userIds.length, synced, skipped, failed, logged, firstError, details };
}

module.exports = {
  syncUserGooglePlayFromStore,
  runGooglePlayReconciliation,
  collectGooglePlayUserIds,
};
