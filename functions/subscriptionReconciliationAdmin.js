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
  { invoker: 'public', timeoutSeconds: 300, memory: '1GiB', secrets: APPLE_API_SECRETS },
  async (request) => {
    await ensureAdmin(request);
    const db = admin.firestore();
    const scannedBy = request.auth?.token?.email || request.auth?.uid || 'admin';

    // Diagnostics — report which credentials are available
    const diagnostics = {
      stripeKey: !!process.env.STRIPE_SECRET_KEY,
      googlePlayKey: !!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY,
      appleKeyId: !!process.env.APPLE_APP_STORE_KEY_ID,
      appleIssuerId: !!process.env.APPLE_APP_STORE_ISSUER_ID,
      applePrivateKey: !!process.env.APPLE_APP_STORE_PRIVATE_KEY,
    };

    const report = {
      diagnostics,
      android: { orphansFound: 0, autoRepaired: 0, stillOrphaned: 0, resynced: 0, details: [] },
      apple: { orphansFound: 0, autoRepaired: 0, stillOrphaned: 0, resynced: 0, details: [] },
      reconciliation: null,
    };

    // --- ANDROID: find orphans + auto-repair from webhookFailures ---
    try {
      const subSnap = await db.collection('userSubscriptions').get();
      const usersSnap = await db.collection('users').get();

      // Build maps of all users
      const userSubMap = {};
      for (const doc of subSnap.docs) {
        userSubMap[doc.id] = doc.data()?.subscription || {};
      }
      const userEmailMap = {};
      for (const doc of usersSnap.docs) {
        userEmailMap[doc.id] = doc.data()?.email || null;
      }
      const allUserIds = new Set([...Object.keys(userSubMap), ...Object.keys(userEmailMap)]);

      // Users already tagged as Android but missing token
      const androidOrphans = [];
      for (const [uid, sub] of Object.entries(userSubMap)) {
        const isAndroid =
          sub.paymentProvider === 'google_play' ||
          sub.paymentProvider === 'googleplay' ||
          sub.source === 'googleplay' ||
          sub.platform === 'google-play' ||
          sub.platform === 'googleplay';
        if (isAndroid && !sub.googlePlayPurchaseToken) {
          androidOrphans.push({ userId: uid, email: sub.userEmail || sub.email || userEmailMap[uid] || null });
        }
      }

      // Pull ALL google_play webhook failures
      const failSnap = await db.collection('webhookFailures')
        .where('source', '==', 'google_play')
        .get();
      logger.info(`📋 Android orphan scan: ${androidOrphans.length} tagged orphans, ${failSnap.size} webhook failures`);

      const tokenByUid = {};
      const unclaimedTokens = []; // tokens without obfuscatedExternalAccountId
      for (const fdoc of failSnap.docs) {
        const fd = fdoc.data();
        if (fd.purchaseToken && fd.obfuscatedExternalAccountId) {
          tokenByUid[fd.obfuscatedExternalAccountId] = fd.purchaseToken;
        } else if (fd.purchaseToken && !fd.obfuscatedExternalAccountId) {
          unclaimedTokens.push(fd.purchaseToken);
        }
      }

      // RESOLVE UNCLAIMED TOKENS: call v2 API to discover which user owns each token
      const { getPlayClient, PACKAGE_NAME } = (() => {
        try {
          const gps = require('./googlePlaySubscriptionSync');
          return { getPlayClient: gps.getPlayClient || null, PACKAGE_NAME: 'com.thepepplanner.app' };
        } catch (_) { return { getPlayClient: null, PACKAGE_NAME: 'com.thepepplanner.app' }; }
      })();

      // Also try the play client directly for unclaimed tokens
      let playClient = null;
      try {
        const keyValue = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
        if (keyValue) {
          const { google } = require('googleapis');
          const serviceAccountKey = JSON.parse(keyValue.trim().replace(/\r?\n/g, ''));
          const auth = new google.auth.GoogleAuth({ credentials: serviceAccountKey, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
          playClient = google.androidpublisher({ version: 'v3', auth });
        }
      } catch (_) {}

      if (playClient && unclaimedTokens.length > 0) {
        logger.info(`🔍 Resolving ${unclaimedTokens.length} unclaimed tokens via v2 API...`);
        for (const token of unclaimedTokens) {
          try {
            const v2 = await playClient.purchases.subscriptionsv2.get({
              packageName: 'com.thepepplanner.app',
              token,
            });
            const uid = v2.data?.externalAccountIdentifiers?.obfuscatedExternalAccountId;
            if (uid && allUserIds.has(uid) && !tokenByUid[uid]) {
              tokenByUid[uid] = token;
              logger.info(`✅ Resolved unclaimed token → user ${uid}`);
            }
          } catch (e) {
            // Token expired or invalid — skip
          }
        }
      }

      // REVERSE LOOKUP: match webhook UIDs to users not tagged as Android
      for (const [uid, token] of Object.entries(tokenByUid)) {
        if (!allUserIds.has(uid)) continue;
        const existingSub = userSubMap[uid] || {};
        const alreadyHasToken = !!existingSub.googlePlayPurchaseToken;
        const alreadyOrphan = androidOrphans.some(o => o.userId === uid);
        if (!alreadyHasToken && !alreadyOrphan) {
          androidOrphans.push({
            userId: uid,
            email: userEmailMap[uid] || existingSub.userEmail || existingSub.email || null,
            fromReverseLookup: true,
          });
        }
      }

      report.android.orphansFound = androidOrphans.length;
      logger.info(`🔧 Android: ${androidOrphans.length} total orphans (incl reverse lookup), ${Object.keys(tokenByUid).length} tokens resolved`);

      if (androidOrphans.length > 0) {
        for (const orphan of androidOrphans) {
          const token = tokenByUid[orphan.userId];
          if (token) {
            await db.collection('userSubscriptions').doc(orphan.userId).set(
              { subscription: {
                googlePlayPurchaseToken: token,
                paymentProvider: 'googleplay',
                source: 'googleplay',
                platform: 'google-play',
              } },
              { merge: true }
            );
            report.android.autoRepaired++;
            report.android.details.push({
              userId: orphan.userId, email: orphan.email,
              action: 'token_seeded',
              reverseLookup: !!orphan.fromReverseLookup,
            });

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
      logger.error('Android orphan scan error:', err);
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
        for (const orphan of appleOrphans) {
          report.apple.details.push({ userId: orphan.userId, email: orphan.email, action: 'no_txn_id' });
        }
      }
    } catch (err) {
      report.apple.error = err.message;
    }

    // --- Run full reconciliation for users that DO have tokens ---
    const reconResult = {};
    for (const platform of ['stripe', 'googleplay', 'apple']) {
      try {
        reconResult[platform] = await runPlatformReconciliation(db, platform, { maxUsers: 500 });
      } catch (e) {
        reconResult[platform] = { error: e.message };
      }
    }
    report.reconciliation = reconResult;

    // Strip undefined values — Firestore rejects them
    function stripUndefined(obj) {
      if (Array.isArray(obj)) return obj.map(stripUndefined);
      if (obj && typeof obj === 'object' && !(obj instanceof Date) && typeof obj.toDate !== 'function') {
        const clean = {};
        for (const [k, v] of Object.entries(obj)) {
          if (v !== undefined) clean[k] = stripUndefined(v);
        }
        return clean;
      }
      return obj;
    }

    const cleanReport = stripUndefined(report);

    // Save the full report so it persists across page loads
    const ts = admin.firestore.FieldValue.serverTimestamp();
    await db.collection('subscriptionScans').doc('latest_repair').set({
      scannedAt: ts,
      scannedBy,
      report: cleanReport,
    });

    return { success: true, report: cleanReport, scannedBy };
  }
);

