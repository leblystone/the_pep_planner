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
    invoker: 'public',
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
  { invoker: "public" },
  async (request) => {
    await ensureAdmin(request);
    const { limit = 50, runId } = request.data || {};
    const db = admin.firestore();
    const logs = await fetchReconciliationLogs(db, { limit, runId });
    return { success: true, logs };
  }
);

/**
 * Scans all userSubscriptions for Android users who have no purchase token stored.
 * These are invisible to the normal reconciliation and need manual token seeding.
 */
/**
 * One-button scan & auto-repair for ALL platforms.
 *
 * 1. Finds orphaned Android users (no purchaseToken) → cross-references
 *    webhookFailures by obfuscatedExternalAccountId (Firebase UID) → seeds
 *    the token automatically → re-syncs from Google Play.
 * 2. Finds orphaned Apple users (no originalTransactionId) → cross-references
 *    webhookFailures by timing heuristic → seeds when confident → re-syncs.
 * 3. Runs the normal reconciliation on all platforms to catch drift.
 * 4. Saves a full report to Firestore so results persist.
 */
exports.scanAndFixSubscriptions = onCall(
  { invoker: 'public', timeoutSeconds: 300, memory: '1GiB' },
  async (request) => {
    await ensureAdmin(request);
    const db = admin.firestore();
    const scannedBy = request.auth?.token?.email || request.auth?.uid || 'admin';

    const report = {
      android: { orphansFound: 0, autoRepaired: 0, stillOrphaned: 0, resynced: 0, details: [] },
      apple: { orphansFound: 0, autoRepaired: 0, stillOrphaned: 0, resynced: 0, details: [] },
      reconciliation: null,
    };

    // --- ANDROID: find orphans + auto-repair from webhookFailures ---
    try {
      const subSnap = await db.collection('userSubscriptions').get();

      const androidOrphans = [];
      for (const doc of subSnap.docs) {
        const sub = doc.data()?.subscription || {};
        const isAndroid =
          sub.paymentProvider === 'google_play' ||
          sub.paymentProvider === 'googleplay' ||
          sub.source === 'googleplay' ||
          sub.platform === 'google-play' ||
          sub.platform === 'googleplay';
        if (isAndroid && !sub.googlePlayPurchaseToken) {
          androidOrphans.push({ userId: doc.id, email: sub.userEmail || sub.email || null });
        }
      }

      report.android.orphansFound = androidOrphans.length;

      if (androidOrphans.length > 0) {
        // Pull ALL google_play webhook failures that have a token + UID
        const failSnap = await db.collection('webhookFailures')
          .where('source', '==', 'google_play')
          .get();

        const tokenByUid = {};
        const tokenByToken = {};
        for (const fdoc of failSnap.docs) {
          const fd = fdoc.data();
          if (fd.purchaseToken && fd.obfuscatedExternalAccountId) {
            tokenByUid[fd.obfuscatedExternalAccountId] = fd.purchaseToken;
          }
          if (fd.purchaseToken) {
            tokenByToken[fdoc.id] = fd;
          }
        }

        for (const orphan of androidOrphans) {
          const token = tokenByUid[orphan.userId];
          if (token) {
            // Auto-seed the token
            await db.collection('userSubscriptions').doc(orphan.userId).set(
              { subscription: { googlePlayPurchaseToken: token } },
              { merge: true }
            );
            report.android.autoRepaired++;
            report.android.details.push({ userId: orphan.userId, email: orphan.email, action: 'token_seeded' });

            // Re-sync from Google Play
            try {
              await syncUserGooglePlayFromStore(db, orphan.userId, { logContext: { runBy: scannedBy } });
              report.android.resynced++;
            } catch (syncErr) {
              report.android.details.push({ userId: orphan.userId, email: orphan.email, action: 'sync_failed', error: syncErr.message });
            }
          } else {
            report.android.stillOrphaned++;
            report.android.details.push({ userId: orphan.userId, email: orphan.email, action: 'no_token_found' });
          }
        }
      }
    } catch (err) {
      report.android.error = err.message;
    }

    // --- APPLE: find orphans + auto-repair from webhookFailures ---
    try {
      const subSnap = await db.collection('userSubscriptions').get();

      const appleOrphans = [];
      for (const doc of subSnap.docs) {
        const sub = doc.data()?.subscription || {};
        const isApple =
          sub.paymentProvider === 'apple' ||
          sub.paymentProvider === 'apple_iap' ||
          sub.source === 'apple' ||
          sub.source === 'apple_iap' ||
          sub.platform === 'apple';
        if (isApple && !sub.appleOriginalTransactionId && !sub.appleTransactionId) {
          appleOrphans.push({ userId: doc.id, email: sub.userEmail || sub.email || null });
        }
      }

      report.apple.orphansFound = appleOrphans.length;

      if (appleOrphans.length > 0 && hasAppleApiCredentials()) {
        // For Apple we can't match by UID (Apple doesn't send it).
        // But we CAN try to re-sync using the App Store Server API's
        // "look up by user" if we have appAccountToken set on purchase.
        // Failing that, mark as still orphaned — Apple privacy limits auto-repair.
        for (const orphan of appleOrphans) {
          try {
            const syncResult = await syncUserAppleFromStore(db, orphan.userId, { logContext: { runBy: scannedBy } });
            if (syncResult.success && syncResult.originalTransactionId) {
              report.apple.autoRepaired++;
              report.apple.resynced++;
              report.apple.details.push({ userId: orphan.userId, email: orphan.email, action: 'synced_from_api' });
            } else {
              report.apple.stillOrphaned++;
              report.apple.details.push({ userId: orphan.userId, email: orphan.email, action: syncResult.reason || 'no_txn_id' });
            }
          } catch (syncErr) {
            report.apple.stillOrphaned++;
            report.apple.details.push({ userId: orphan.userId, email: orphan.email, action: 'sync_failed', error: syncErr.message });
          }
        }
      } else if (appleOrphans.length > 0) {
        report.apple.stillOrphaned = appleOrphans.length;
        report.apple.note = 'Apple API credentials not configured — cannot auto-repair.';
      }
    } catch (err) {
      report.apple.error = err.message;
    }

    // --- Run full reconciliation for users that DO have tokens ---
    try {
      const reconResult = {};
      reconResult.stripe = await runDailyStripeReconciliation(db, { maxUsers: 500 });
      try { reconResult.googleplay = await runGooglePlayReconciliation(db, { maxUsers: 500 }); }
      catch (e) { reconResult.googleplay = { error: e.message }; }
      if (hasAppleApiCredentials()) {
        try { reconResult.apple = await runAppleReconciliation(db, { maxUsers: 500 }); }
        catch (e) { reconResult.apple = { error: e.message }; }
      }
      report.reconciliation = reconResult;
    } catch (err) {
      report.reconciliation = { error: err.message };
    }

    // Save the full report so it persists across page loads
    const ts = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('subscriptionScans').doc('latest_repair').set({
      scannedAt: ts,
      scannedBy,
      report,
    });

    return { success: true, report, scannedBy };
  }
);

