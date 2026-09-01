/**
 * Admin-triggered subscription reconciliation (Stripe, Google Play, Apple).
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const {
  runDailyStripeReconciliation,
  syncUserSubscriptionFromStripe,
} = require('./stripeSubscriptionSync');
const {
  runGooglePlayReconciliation,
  syncUserGooglePlayFromStore,
} = require('./googlePlaySubscriptionSync');
const {
  runAppleReconciliation,
  syncUserAppleFromStore,
  hasAppleApiCredentials,
} = require('./appleSubscriptionSync');
const {
  newRunId,
  fetchReconciliationLogs,
} = require('./subscriptionReconciliationLog');

const ADMIN_EMAILS = [
  'lebrockmaldonado@gmail.com',
  'contact@thepepplanner.com',
  'thepepplanner@gmail.com',
];

async function ensureAdmin(request) {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication required');
  }
  const callerEmail = (request.auth.token && request.auth.token.email) || '';
  if (callerEmail && ADMIN_EMAILS.includes(callerEmail.toLowerCase())) return;
  const db = admin.firestore();
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  const data = userDoc.exists ? userDoc.data() : {};
  const docEmail = (data.email || '').toLowerCase();
  if (ADMIN_EMAILS.includes(docEmail) || data.role === 'admin') return;
  throw new HttpsError('permission-denied', 'Admin access required');
}

async function runPlatformReconciliation(db, platform, options = {}) {
  if (platform === 'stripe') {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) {
      throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY not configured');
    }
    const stripe = require('stripe')(stripeKey);
    return runDailyStripeReconciliation(db, stripe, options);
  }
  if (platform === 'googleplay' || platform === 'google_play') {
    if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY) {
      throw new HttpsError('failed-precondition', 'GOOGLE_PLAY_SERVICE_ACCOUNT_KEY not configured');
    }
    return runGooglePlayReconciliation(db, options);
  }
  if (platform === 'apple') {
    if (!hasAppleApiCredentials()) {
      throw new HttpsError(
        'failed-precondition',
        'Apple App Store Server API credentials not configured (KEY_ID / ISSUER_ID / PRIVATE_KEY)'
      );
    }
    return runAppleReconciliation(db, options);
  }
  throw new HttpsError('invalid-argument', 'platform must be stripe, googleplay, or apple');
}

async function syncSingleUser(db, platform, userId, logContext) {
  const opts = { logContext, forceLog: true, changeType: 'manual_sync' };
  if (platform === 'stripe') {
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) throw new HttpsError('failed-precondition', 'STRIPE_SECRET_KEY not configured');
    const stripe = require('stripe')(stripeKey);
    return syncUserSubscriptionFromStripe(db, stripe, userId, opts);
  }
  if (platform === 'googleplay' || platform === 'google_play') {
    return syncUserGooglePlayFromStore(db, userId, opts);
  }
  if (platform === 'apple') {
    if (!hasAppleApiCredentials()) {
      throw new HttpsError(
        'failed-precondition',
        'Apple App Store Server API credentials not configured (KEY_ID / ISSUER_ID / PRIVATE_KEY)'
      );
    }
    return syncUserAppleFromStore(db, userId, opts);
  }
  throw new HttpsError('invalid-argument', 'platform must be stripe, googleplay, or apple');
}

const APPLE_API_SECRETS = [
  'APPLE_APP_STORE_KEY_ID',
  'APPLE_APP_STORE_ISSUER_ID',
  'APPLE_APP_STORE_PRIVATE_KEY',
];

exports.adminRunSubscriptionReconciliation = onCall(
  {
    cors: true,
    timeoutSeconds: 540,
    memory: '1GiB',
    secrets: APPLE_API_SECRETS,
  },
  async (request) => {
    await ensureAdmin(request);
    const { platform = 'all', userId } = request.data || {};
    const db = admin.firestore();
    const runBy = request.auth.token?.email || request.auth.uid;
    const trigger = userId ? 'manual_user' : 'manual_bulk';
    const runId = newRunId(trigger);
    const logContext = { runId, trigger, runBy };

    if (userId) {
      const plat = platform === 'all' ? 'stripe' : platform;
      if (platform === 'all') {
        const results = {};
        let logged = 0;
        for (const p of ['stripe', 'googleplay', 'apple']) {
          try {
            results[p] = await syncSingleUser(db, p, userId, logContext);
            if (results[p].logged) logged++;
          } catch (e) {
            results[p] = { success: false, error: e.message };
          }
        }
        const logs = await fetchReconciliationLogs(db, { runId, limit: 20 });
        return { success: true, userId, runId, logged, results, logs };
      }
      const result = await syncSingleUser(db, plat, userId, logContext);
      const logs = await fetchReconciliationLogs(db, { runId, limit: 10 });
      return { success: result.success !== false, userId, platform: plat, runId, logs, ...result };
    }

    const platforms =
      platform === 'all' ? ['stripe', 'googleplay', 'apple'] : [platform];

    const summary = {};
    let totalLogged = 0;
    for (const p of platforms) {
      try {
        summary[p] = await runPlatformReconciliation(db, p, { maxUsers: 2000, logContext });
        totalLogged += summary[p].logged || 0;
      } catch (e) {
        summary[p] = { error: e.message };
        logger.error(`Reconciliation failed for ${p}`, e);
      }
    }

    const logs = await fetchReconciliationLogs(db, { runId, limit: 100 });

    const ts = admin.firestore.FieldValue.serverTimestamp();

    // Persist run history — every run recorded regardless of changes
    await db.collection('reconciliationRuns').add({
      runId,
      trigger,
      runBy,
      platforms,
      summary,
      totalLogged,
      ranAt: ts,
    });

    await db.collection('systemMetrics').doc('subscriptionReconciliation').set(
      {
        lastManualRunAt: ts,
        lastManualRunBy: runBy,
        lastRunId: runId,
        summary,
        totalLogged,
      },
      { merge: true }
    );

    return { success: true, runId, totalLogged, summary, logs };
  }
);

exports.getAdminSubscriptionReconciliationLog = onCall(
  { cors: true },
  async (request) => {
    await ensureAdmin(request);
    const { limit = 50, runId } = request.data || {};
    const db = admin.firestore();
    const logs = await fetchReconciliationLogs(db, { limit, runId });
    return { success: true, logs };
  }
);
