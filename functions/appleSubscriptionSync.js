/**
 * Apple App Store Server API → Firestore subscription sync (admin reconciliation).
 * Uses In-App Purchase key (Key ID / Issuer ID / .p8) via @apple/app-store-server-library.
 */
const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const {
  AppStoreServerAPIClient,
  Environment,
} = require('@apple/app-store-server-library');

const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.thepepplanner.app';

const PLAN_MAPPING = {
  'apple.monthly': { key: 'monthly', name: 'Monthly', interval: 'month', tier: 'founder' },
  'apple.annual': { key: 'annual', name: 'Annual', interval: 'year', tier: 'founder' },
  'lifetime.apple': { key: 'lifetime', name: 'Lifetime Access', interval: 'lifetime', tier: 'founder' },
  'apple.researchplus.monthly': {
    key: 'researchPlusMonthly',
    name: 'Research+ Monthly',
    interval: 'month',
    tier: 'research_plus',
  },
  'apple.researchplus.annual': {
    key: 'researchPlusAnnual',
    name: 'Research+ Annual',
    interval: 'year',
    tier: 'research_plus',
  },
  'apple.researchplus.lifetime': {
    key: 'researchPlusLifetime',
    name: 'Research+ Lifetime',
    interval: 'lifetime',
    tier: 'research_plus',
  },
};

/** App Store subscription status codes */
const STATUS = {
  ACTIVE: 1,
  EXPIRED: 2,
  BILLING_RETRY: 3,
  BILLING_GRACE: 4,
  REVOKED: 5,
};

function hasAppleApiCredentials() {
  return !!(
    process.env.APPLE_APP_STORE_KEY_ID &&
    process.env.APPLE_APP_STORE_ISSUER_ID &&
    process.env.APPLE_APP_STORE_PRIVATE_KEY
  );
}

function getSigningKey() {
  const raw = process.env.APPLE_APP_STORE_PRIVATE_KEY || '';
  // Secrets sometimes store escaped newlines
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}

function createClient(environment) {
  if (!hasAppleApiCredentials()) return null;
  return new AppStoreServerAPIClient(
    getSigningKey(),
    process.env.APPLE_APP_STORE_KEY_ID,
    process.env.APPLE_APP_STORE_ISSUER_ID,
    BUNDLE_ID,
    environment
  );
}

/**
 * Decode a JWS payload without verifying the signature.
 * Safe here because payloads come from authenticated App Store Server API over HTTPS.
 */
function decodeJwsPayload(jws) {
  if (!jws || typeof jws !== 'string') return null;
  try {
    const parts = jws.split('.');
    if (parts.length < 2) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch (e) {
    logger.warn('Failed to decode Apple JWS payload', e.message);
    return null;
  }
}

function mapStatusCode(statusCode, expiresDateMs) {
  const now = Date.now();
  switch (statusCode) {
    case STATUS.ACTIVE:
    case STATUS.BILLING_GRACE:
      return 'active';
    case STATUS.BILLING_RETRY:
      return 'past_due';
    case STATUS.REVOKED:
      return 'revoked';
    case STATUS.EXPIRED:
      return 'expired';
    default:
      if (expiresDateMs && expiresDateMs > now) return 'active';
      return 'expired';
  }
}

function mapAppleTransactionToSubscription(txn, renewal, statusCode, existing = {}) {
  const productId = txn.productId || existing.appleProductId;
  const planDetails =
    PLAN_MAPPING[productId] || {
      key: productId || 'apple',
      name: productId || 'Apple',
      interval: 'month',
      tier: existing.tier || 'research_plus',
    };

  const expiresMs = txn.expiresDate ? Number(txn.expiresDate) : null;
  const purchaseMs = txn.purchaseDate ? Number(txn.purchaseDate) : null;
  const autoRenewOn = renewal?.autoRenewStatus === 1 || renewal?.autoRenewStatus === '1';
  const cancelAtPeriodEnd =
    renewal?.autoRenewStatus === 0 ||
    renewal?.autoRenewStatus === '0' ||
    (renewal && renewal.autoRenewStatus != null && !autoRenewOn);

  const isLifetime =
    planDetails.interval === 'lifetime' ||
    productId?.includes?.('lifetime') ||
    existing.hasLifetimeAccess === true;

  const status = isLifetime
    ? 'active'
    : mapStatusCode(statusCode, expiresMs);

  const subscriptionData = {
    ...existing,
    status,
    tier: planDetails.tier,
    plan: planDetails.name,
    planKey: planDetails.key,
    interval: planDetails.interval,
    paymentProvider: 'apple',
    source: 'apple',
    platform: 'apple',
    appleProductId: productId || existing.appleProductId || null,
    appleTransactionId: txn.transactionId || existing.appleTransactionId || null,
    appleOriginalTransactionId:
      txn.originalTransactionId || existing.appleOriginalTransactionId || null,
    currentPeriodStart: purchaseMs ? new Date(purchaseMs).toISOString() : existing.currentPeriodStart || null,
    currentPeriodEnd: expiresMs ? new Date(expiresMs).toISOString() : existing.currentPeriodEnd || null,
    cancelAtPeriodEnd: !!cancelAtPeriodEnd && !isLifetime,
    isAutoRenewing: isLifetime ? false : !!autoRenewOn,
    autoRenewing: isLifetime ? false : !!autoRenewOn,
    appleEnvironment: txn.environment || existing.appleEnvironment || null,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    lastStoreSyncedAt: new Date().toISOString(),
  };

  if (isLifetime) {
    subscriptionData.hasLifetimeAccess = true;
    subscriptionData.lifetimeReason = existing.lifetimeReason || 'apple_store_purchase';
    subscriptionData.currentPeriodEnd = null;
    subscriptionData.cancelAtPeriodEnd = false;
  }

  if (renewal?.expirationIntent != null) {
    subscriptionData.appleExpirationIntent = renewal.expirationIntent;
  }

  return subscriptionData;
}

/**
 * Pick the best lastTransactions entry (prefer active / grace / retry).
 */
function pickBestLastTransaction(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return null;
  const all = [];
  for (const group of groups) {
    for (const lt of group.lastTransactions || []) {
      all.push(lt);
    }
  }
  if (all.length === 0) return null;
  const rank = (s) => {
    if (s === STATUS.ACTIVE) return 0;
    if (s === STATUS.BILLING_GRACE) return 1;
    if (s === STATUS.BILLING_RETRY) return 2;
    if (s === STATUS.EXPIRED) return 3;
    if (s === STATUS.REVOKED) return 4;
    return 5;
  };
  all.sort((a, b) => rank(a.status) - rank(b.status));
  return all[0];
}

async function fetchSubscriptionStatuses(originalTransactionId) {
  const errors = [];
  for (const env of [Environment.PRODUCTION, Environment.SANDBOX]) {
    const client = createClient(env);
    if (!client) return null;
    try {
      const response = await client.getAllSubscriptionStatuses(originalTransactionId);
      const best = pickBestLastTransaction(response?.data);
      if (!best) {
        errors.push(`${env}: no_transactions`);
        continue;
      }
      const txn = decodeJwsPayload(best.signedTransactionInfo);
      const renewal = decodeJwsPayload(best.signedRenewalInfo);
      if (!txn) {
        errors.push(`${env}: decode_failed`);
        continue;
      }
      return {
        txn,
        renewal,
        statusCode: best.status,
        environment: env === Environment.PRODUCTION ? 'Production' : 'Sandbox',
      };
    } catch (e) {
      const msg = e?.httpStatusCode ? `${env}: HTTP ${e.httpStatusCode}` : `${env}: ${e.message}`;
      errors.push(msg);
      // 404 / not found → try other environment
      if (e?.httpStatusCode === 404 || /not found/i.test(e.message || '')) continue;
      logger.warn(`Apple getAllSubscriptionStatuses failed (${env})`, e.message);
    }
  }
  logger.warn('Apple subscription lookup failed for', originalTransactionId, errors.join('; '));
  return null;
}

async function writeAppleSubscription(db, userId, subscriptionData) {
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

async function resolveAppleOriginalTransactionId(db, userId) {
  const subDoc = await db.collection('userSubscriptions').doc(userId).get();
  const sub = subDoc.exists ? subDoc.data()?.subscription : null;
  const userDoc = await db.collection('users').doc(userId).get();
  const userSub = userDoc.exists ? userDoc.data()?.subscription : null;
  const merged = { ...(userSub || {}), ...(sub || {}) };
  const originalTransactionId =
    merged.appleOriginalTransactionId ||
    merged.originalTransactionId ||
    null;
  return { originalTransactionId, merged };
}

/**
 * Sync one user's Apple subscription from App Store Server API into Firestore.
 * Falls back to Firestore normalize-only if credentials are missing or lookup fails without an originalTransactionId.
 */
async function syncUserAppleFromStore(db, userId, options = {}) {
  const logContext = options.logContext || {};
  const subDoc = await db.collection('userSubscriptions').doc(userId).get();
  const beforeSub = subDoc.exists ? subDoc.data()?.subscription : null;

  const { originalTransactionId, merged } = await resolveAppleOriginalTransactionId(db, userId);
  const isApple = isAppleSub(merged);

  if (!isApple) {
    return { success: false, userId, reason: 'no_apple_subscription' };
  }

  if (!hasAppleApiCredentials()) {
    return {
      success: false,
      userId,
      reason: 'apple_api_credentials_missing',
      note: 'Set APPLE_APP_STORE_KEY_ID, APPLE_APP_STORE_ISSUER_ID, APPLE_APP_STORE_PRIVATE_KEY',
    };
  }

  if (!originalTransactionId) {
    // Admin-granted Apple access has no store transaction — normalize flags only
    const normalized = {
      ...merged,
      paymentProvider: 'apple',
      platform: 'apple',
      cancelAtPeriodEnd:
        merged.cancelAtPeriodEnd === true ||
        merged.status === 'canceling' ||
        merged.isAutoRenewing === false,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    };
    await writeAppleSubscription(db, userId, normalized);
    let logged = false;
    if (logContext.runId) {
      const { logIfSubscriptionChanged } = require('./subscriptionReconciliationLog');
      logged = await logIfSubscriptionChanged(db, {
        runId: logContext.runId,
        userId,
        platform: 'apple',
        beforeSub,
        afterSub: normalized,
        trigger: logContext.trigger,
        runBy: logContext.runBy,
        changeType: 'apple_normalized_no_txn',
        note: 'No appleOriginalTransactionId — admin grant or incomplete record; normalized only.',
        forceLog: options.forceLog,
      });
    }
    return {
      success: true,
      userId,
      normalizedOnly: true,
      reason: 'no_original_transaction_id',
      cancelAtPeriodEnd: normalized.cancelAtPeriodEnd,
      logged,
    };
  }

  const store = await fetchSubscriptionStatuses(String(originalTransactionId));
  if (!store) {
    return { success: false, userId, reason: 'apple_api_failed', originalTransactionId };
  }

  const subscriptionData = mapAppleTransactionToSubscription(
    store.txn,
    store.renewal,
    store.statusCode,
    merged
  );
  subscriptionData.appleEnvironment = store.environment;

  await writeAppleSubscription(db, userId, subscriptionData);

  let logged = false;
  if (logContext.runId) {
    const { logIfSubscriptionChanged } = require('./subscriptionReconciliationLog');
    logged = await logIfSubscriptionChanged(db, {
      runId: logContext.runId,
      userId,
      platform: 'apple',
      beforeSub,
      afterSub: subscriptionData,
      trigger: logContext.trigger,
      runBy: logContext.runBy,
      changeType: options.changeType || 'apple_store_synced',
      forceLog: options.forceLog,
    });
  }

  return {
    success: true,
    userId,
    status: subscriptionData.status,
    cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
    originalTransactionId,
    environment: store.environment,
    logged,
  };
}

function isAppleSub(sub) {
  if (!sub) return false;
  return (
    sub.appleOriginalTransactionId ||
    sub.appleTransactionId ||
    sub.appleProductId ||
    sub.paymentProvider === 'apple' ||
    sub.platform === 'apple' ||
    sub.source === 'apple' ||
    sub.source === 'apple_iap' ||
    sub.paymentProvider === 'apple_iap'
  );
}

async function collectAppleUserIds(db) {
  const ids = new Set();

  // Primary: userSubscriptions collection
  const subSnap = await db.collection('userSubscriptions').get();
  for (const doc of subSnap.docs) {
    if (isAppleSub(doc.data()?.subscription)) ids.add(doc.id);
  }

  // Fallback: users collection (some older accounts never got a userSubscriptions doc)
  if (ids.size < 50) {
    const usersSnap = await db.collection('users').get();
    for (const doc of usersSnap.docs) {
      if (!ids.has(doc.id) && isAppleSub(doc.data()?.subscription)) {
        ids.add(doc.id);
      }
    }
  }

  return Array.from(ids);
}

async function runAppleReconciliation(db, options = {}) {
  const maxUsers = options.maxUsers ?? 500;
  const userIds = (await collectAppleUserIds(db)).slice(0, maxUsers);
  let synced = 0;
  let failed = 0;
  let skipped = 0;
  let normalizedOnly = 0;
  let logged = 0;
  if (options.logContext) {
    options.logContext.onLogged = () => {
      logged += 1;
    };
  }

  if (!hasAppleApiCredentials()) {
    return {
      usersScanned: 0,
      synced: 0,
      failed: 0,
      skipped: 0,
      logged: 0,
      error: 'apple_api_credentials_missing',
    };
  }

  const details = [];
  for (const userId of userIds) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const email = userDoc.exists ? (userDoc.data()?.email || userId) : userId;

      const subDoc = await db.collection('userSubscriptions').doc(userId).get();
      const beforeSub = subDoc.exists ? subDoc.data()?.subscription : null;
      const changeType = beforeSub?.lastStoreSyncedAt ? 'drift_corrected' : 'missing_restored';

      const result = await syncUserAppleFromStore(db, userId, {
        logContext: options.logContext,
        changeType,
      });
      if (result.success) {
        synced++;
        if (result.normalizedOnly) normalizedOnly++;
        if (result.logged) options.logContext?.onLogged?.();
        details.push({ userId, email, outcome: 'synced', status: result.status || 'synced' });
      } else if (
        result.reason === 'no_apple_subscription' ||
        result.reason === 'no_original_transaction_id'
      ) {
        skipped++;
      } else {
        failed++;
        details.push({ userId, email, outcome: 'failed', reason: result.reason });
      }
    } catch (e) {
      failed++;
      details.push({ userId, outcome: 'failed', reason: 'exception', error: e.message });
      logger.warn(`Apple sync failed for ${userId}`, e.message);
    }
  }

  return {
    usersScanned: userIds.length,
    synced,
    normalizedOnly,
    skipped,
    failed,
    logged,
    details,
    note: 'Synced via App Store Server API (Production then Sandbox).',
  };
}

module.exports = {
  hasAppleApiCredentials,
  syncUserAppleFromStore,
  runAppleReconciliation,
  collectAppleUserIds,
};
