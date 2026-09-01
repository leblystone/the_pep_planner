/**
 * Apple In-App Purchase Verification
 * Verifies Apple App Store purchases and syncs subscription status to Firestore.
 * Handles App Store Server Notifications V2.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { SignedDataVerifier, Environment } = require('@apple/app-store-server-library');
const emailService = require('./emailService');
const adminAlerts = require('./adminAlerts');
const { APPLE_ROOT_CA_G3_DER } = require('./appleRootCerts');

const FieldValue = admin.firestore.FieldValue;
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.thepepplanner.app';

/**
 * Cryptographically verify App Store Server Notification V2 signedPayload.
 * Tries Production then Sandbox. Requires APPLE_APP_APPLE_ID for Production.
 */
async function verifyAndDecodeAppleNotification(signedPayload) {
  const appAppleIdRaw = process.env.APPLE_APP_APPLE_ID;
  const appAppleId = appAppleIdRaw ? Number(appAppleIdRaw) : undefined;
  const enableOnlineChecks = true;
  const errors = [];

  const attempts = [];
  if (appAppleId && Number.isFinite(appAppleId)) {
    attempts.push({ environment: Environment.PRODUCTION, appAppleId });
  } else {
    logger.warn('⚠️ APPLE_APP_APPLE_ID not set — Production ASN verification unavailable');
  }
  attempts.push({ environment: Environment.SANDBOX, appAppleId: undefined });

  for (const attempt of attempts) {
    try {
      const verifier = new SignedDataVerifier(
        [APPLE_ROOT_CA_G3_DER],
        enableOnlineChecks,
        attempt.environment,
        BUNDLE_ID,
        attempt.appAppleId
      );
      const decoded = await verifier.verifyAndDecodeNotification(signedPayload);
      return { decoded, environment: attempt.environment };
    } catch (err) {
      errors.push(`${attempt.environment}: ${err.message}`);
    }
  }

  const detail = errors.join(' | ') || 'unknown verification failure';
  const error = new Error(`Apple notification signature verification failed (${detail})`);
  error.code = 'APPLE_SIGNATURE_INVALID';
  throw error;
}

// Accounts created before this date are grandfathered founders.
const FOUNDERS_CUTOFF_MS = new Date('2026-05-05T00:00:00.000Z').getTime();

/**
 * Returns 'founder' if the user's account predates the founder cutoff and
 * baseTier is a paid tier. Falls back to baseTier on any error.
 */
async function resolveUserTier(userId, baseTier, db) {
  if (!baseTier || baseTier === 'free') return baseTier;
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return baseTier;
    const raw = userDoc.data().createdAt;
    if (!raw) return baseTier;
    const createdMs = raw?.toDate ? raw.toDate().getTime() : new Date(raw).getTime();
    if (isNaN(createdMs)) return baseTier;
    if (createdMs < FOUNDERS_CUTOFF_MS) {
      logger.info(`👑 Founder tier resolved for pre-cutoff user ${userId}`);
      return 'founder';
    }
    return baseTier;
  } catch (e) {
    logger.warn(`⚠️ Could not resolve user tier for ${userId}: ${e.message}`);
    return baseTier;
  }
}

async function verifyAppleReceipt(receiptData, production = true) {
  const endpoint = production
    ? 'https://buy.itunes.apple.com/verifyReceipt'
    : 'https://sandbox.itunes.apple.com/verifyReceipt';

  const sharedSecret = process.env.APPLE_APP_STORE_SHARED_SECRET;
  if (!sharedSecret) {
    throw new Error('APPLE_APP_STORE_SHARED_SECRET not configured');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receiptData,
      password: sharedSecret,
    }),
  });

  const result = await response.json();

  // 21007 means receipt is from sandbox but we tried production
  if (result.status === 21007 && production) {
    return verifyAppleReceipt(receiptData, false);
  }

  return result;
}

function mapApplePurchaseToSubscription(transaction, productId, options = {}) {
  const { userId, userEmail } = options;

  const planMapping = {
    // Legacy / Founder product IDs (grandfathered)
    'apple.monthly':  { key: 'monthly',   name: 'Monthly',        interval: 'month',    tier: 'founder' },
    'apple.annual':   { key: 'annual',    name: 'Annual',         interval: 'year',     tier: 'founder' },
    'lifetime.apple': { key: 'lifetime',  name: 'Lifetime Access',interval: 'lifetime', tier: 'founder' },
    // Research+ product IDs (2.0 — new signups)
    'apple.researchplus.monthly':  { key: 'researchPlusMonthly',  name: 'Research+ Monthly',  interval: 'month',    tier: 'research_plus' },
    'apple.researchplus.annual':   { key: 'researchPlusAnnual',   name: 'Research+ Annual',   interval: 'year',     tier: 'research_plus' },
    'apple.researchplus.lifetime': { key: 'researchPlusLifetime', name: 'Research+ Lifetime', interval: 'lifetime', tier: 'research_plus' },
  };

  const planDetails = planMapping[productId] || { key: productId, name: productId, interval: 'month', tier: 'research_plus' };

  const subscriptionData = {
    userId,
    userEmail,
    status: 'active',
    tier: planDetails.tier,
    plan: planDetails.name,
    planKey: planDetails.key,
    interval: planDetails.interval,
    paymentProvider: 'apple',
    appleProductId: productId,
    appleTransactionId: transaction.transaction_id || transaction.transactionId,
    appleOriginalTransactionId: transaction.original_transaction_id || transaction.originalTransactionId,
    lastUpdated: FieldValue.serverTimestamp(),
  };

  if (transaction.expires_date_ms || transaction.expiresDate) {
    subscriptionData.currentPeriodEnd = new Date(parseInt(transaction.expires_date_ms || transaction.expiresDate));
  }

  if (transaction.purchase_date_ms || transaction.purchaseDate) {
    subscriptionData.currentPeriodStart = new Date(parseInt(transaction.purchase_date_ms || transaction.purchaseDate));
  }

  if (planDetails.interval === 'lifetime' || !subscriptionData.currentPeriodEnd) {
    subscriptionData.hasLifetimeAccess = true;
    subscriptionData.lifetimeReason = 'apple_store_purchase';
    subscriptionData.currentPeriodEnd = null;
  }

  return subscriptionData;
}

async function snapshotTrialOnPurchase(userId, db) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return null;
    const userData = userDoc.data();
    const now = new Date();
    let trialEnd = null;
    if (userData.trialEndDate?.toDate) trialEnd = userData.trialEndDate.toDate();
    else if (userData.trialEndDate) trialEnd = new Date(userData.trialEndDate);
    else if (userData.createdAt) {
      const created = userData.createdAt?.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
      trialEnd = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);
    }
    const daysRemaining = trialEnd && trialEnd > now ? Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000)) : 0;
    return { trialDaysRemainingAtPurchase: daysRemaining, trialEndDateAtPurchase: trialEnd ? trialEnd.toISOString() : null };
  } catch (e) {
    logger.warn(`⚠️ Could not snapshot trial for ${userId}: ${e.message}`);
    return null;
  }
}

async function calcTrialRestoration(userId, db) {
  const now = new Date();
  const [lifetimeDoc, userDoc] = await Promise.all([
    db.collection('lifetimeAccess').doc(userId).get(),
    db.collection('users').doc(userId).get(),
  ]);
  const lifetimeData = lifetimeDoc.exists ? lifetimeDoc.data() : null;
  const userData = userDoc.exists ? userDoc.data() : null;
  let restoredTrialEndDate = null;
  let trialDaysRestored = 0;
  let trialRestoredNote = '';
  const snapshotDays = lifetimeData?.trialDaysRemainingAtPurchase;
  if (snapshotDays != null && snapshotDays > 0) {
    restoredTrialEndDate = new Date(now.getTime() + snapshotDays * 24 * 60 * 60 * 1000);
    trialDaysRestored = snapshotDays;
    trialRestoredNote = `${snapshotDays} day(s) restored from purchase-time snapshot.`;
  } else if (userData) {
    const created = userData.createdAt?.toDate ? userData.createdAt.toDate() : userData.createdAt ? new Date(userData.createdAt) : null;
    let originalTrialEnd = null;
    if (userData.trialEndDate?.toDate) originalTrialEnd = userData.trialEndDate.toDate();
    else if (userData.trialEndDate) originalTrialEnd = new Date(userData.trialEndDate);
    else if (created) originalTrialEnd = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);
    if (originalTrialEnd && created) {
      const purchasedAt = lifetimeData?.grantedAt?.toDate ? lifetimeData.grantedAt.toDate() : now;
      const daysConsumed = Math.max(0, Math.floor((purchasedAt - created) / (24 * 60 * 60 * 1000)));
      const totalDays = Math.round((originalTrialEnd - created) / (24 * 60 * 60 * 1000));
      const daysRemaining = Math.max(0, totalDays - daysConsumed);
      if (daysRemaining > 0) {
        restoredTrialEndDate = new Date(now.getTime() + daysRemaining * 24 * 60 * 60 * 1000);
        trialDaysRestored = daysRemaining;
        trialRestoredNote = `${daysRemaining} of ${totalDays} day(s) restored (${daysConsumed} used before purchase).`;
      } else {
        trialRestoredNote = 'Trial fully elapsed before purchase; no days to restore.';
      }
    }
  }
  return { restoredTrialEndDate, trialDaysRestored, trialRestoredNote };
}

async function syncAppleSubscriptionToFirestore(userId, userEmail, subscriptionData, opts = {}) {
  const db = admin.firestore();

  // Resolve founder tier before writing — pre-cutoff accounts get 'founder' even
  // when buying a Research+ product ID.
  if (subscriptionData.tier && subscriptionData.tier !== 'free') {
    subscriptionData.tier = await resolveUserTier(userId, subscriptionData.tier, db);
  }

  const batch = db.batch();
  const subRef = db.collection('userSubscriptions').doc(userId);
  const userRef = db.collection('users').doc(userId);

  batch.set(subRef, {
    subscription: subscriptionData,
    lastUpdated: FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(userRef, {
    subscription: subscriptionData,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const historyRef = subRef.collection('history').doc();
  batch.set(historyRef, {
    eventType: opts.eventType || 'apple_subscription_update',
    title: opts.title || 'Apple subscription updated',
    description: opts.description || '',
    severity: opts.severity || 'info',
    status: subscriptionData.status,
    source: 'apple_iap',
    eventTimestamp: FieldValue.serverTimestamp(),
    appleProductId: subscriptionData.appleProductId || null,
    appleTransactionId: subscriptionData.appleTransactionId || null,
    currentPeriodEnd: subscriptionData.currentPeriodEnd || null,
  });

  if (subscriptionData.hasLifetimeAccess) {
    // Snapshot trial days before granting
    const snapshot = await snapshotTrialOnPurchase(userId, db);
    const lifetimeRef = db.collection('lifetimeAccess').doc(userId);
    batch.set(lifetimeRef, {
      userId,
      email: userEmail,
      reason: 'apple_store_purchase',
      grantedBy: 'apple-in-app-purchase',
      grantedAt: FieldValue.serverTimestamp(),
      status: 'active',
      trialDaysRemainingAtPurchase: snapshot?.trialDaysRemainingAtPurchase ?? null,
      trialEndDateAtPurchase: snapshot?.trialEndDateAtPurchase ?? null,
      metadata: {
        appleProductId: subscriptionData.appleProductId,
        appleTransactionId: subscriptionData.appleTransactionId,
        appleOriginalTransactionId: subscriptionData.appleOriginalTransactionId,
      },
    }, { merge: true });

    // History: trial on hold
    const trialHoldRef = subRef.collection('history').doc();
    batch.set(trialHoldRef, {
      eventType: 'trial_on_hold',
      status: 'active',
      title: 'Trial paused — Apple lifetime purchase',
      description: snapshot?.trialDaysRemainingAtPurchase != null
        ? `${snapshot.trialDaysRemainingAtPurchase} trial day(s) remaining at purchase. Restorable if refunded.`
        : 'Trial state snapshotted at Apple lifetime purchase.',
      trialDaysRemainingAtPurchase: snapshot?.trialDaysRemainingAtPurchase ?? null,
      trialEndDateAtPurchase: snapshot?.trialEndDateAtPurchase ?? null,
      source: 'apple_iap',
      severity: 'info',
      eventTimestamp: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();
  logger.info(`✅ Apple subscription synced for user ${userId}`);
}

async function findUserByAppleTransactionId(originalTransactionId) {
  const db = admin.firestore();
  const query = await db.collection('userSubscriptions')
    .where('subscription.appleOriginalTransactionId', '==', originalTransactionId)
    .limit(1)
    .get();

  if (!query.empty) {
    const doc = query.docs[0];
    return { userId: doc.id, ...doc.data() };
  }
  return null;
}

// --- App Store Server Notifications V2 Webhook ---

exports.appleWebhook = onRequest(
  {
    cors: true,
    invoker: 'public',
    secrets: ['RESEND_API_KEY', 'APPLE_APP_APPLE_ID'],
  },
  async (request, response) => {
    logger.info('📥 Received Apple App Store notification');

    try {
      const { signedPayload } = request.body;

      if (!signedPayload) {
        logger.warn('⚠️ No signedPayload in notification');
        return response.status(400).json({ error: 'Missing signedPayload' });
      }

      let decodedNotification;
      try {
        const verified = await verifyAndDecodeAppleNotification(signedPayload);
        decodedNotification = verified.decoded;
        logger.info(`✅ Apple notification signature verified (${verified.environment})`);
      } catch (verifyErr) {
        logger.error('❌ Apple notification signature invalid:', verifyErr.message);
        return response.status(401).json({ error: 'Invalid signature' });
      }

      const notificationType = decodedNotification.notificationType;
      const subtype = decodedNotification.subtype;

      logger.info(`📥 Apple notification: ${notificationType} (subtype: ${subtype})`);

      // Prefer cryptographically verified transaction info from the library
      let transactionInfo = decodedNotification.data?.decodedTransactionInfo || null;
      if (!transactionInfo && decodedNotification.data?.signedTransactionInfo) {
        // Library usually attaches decoded fields; fall back only if present after verify
        try {
          const appAppleIdRaw = process.env.APPLE_APP_APPLE_ID;
          const appAppleId = appAppleIdRaw ? Number(appAppleIdRaw) : undefined;
          const verifier = new SignedDataVerifier(
            [APPLE_ROOT_CA_G3_DER],
            true,
            Environment.PRODUCTION,
            BUNDLE_ID,
            appAppleId
          );
          transactionInfo = await verifier.verifyAndDecodeTransaction(
            decodedNotification.data.signedTransactionInfo
          );
        } catch (_) {
          try {
            const sandboxVerifier = new SignedDataVerifier(
              [APPLE_ROOT_CA_G3_DER],
              true,
              Environment.SANDBOX,
              BUNDLE_ID
            );
            transactionInfo = await sandboxVerifier.verifyAndDecodeTransaction(
              decodedNotification.data.signedTransactionInfo
            );
          } catch (txErr) {
            logger.warn('⚠️ Could not verify nested transaction info:', txErr.message);
          }
        }
      }

      if (!transactionInfo) {
        logger.warn('⚠️ Could not decode verified transaction info');
        return response.status(200).json({ received: true });
      }

      const originalTransactionId = transactionInfo.originalTransactionId;
      const userRecord = await findUserByAppleTransactionId(String(originalTransactionId));

      if (!userRecord) {
        logger.warn(`⚠️ No user found for Apple originalTransactionId: ${originalTransactionId}`);
        // Log to webhookFailures so admin can review and manually link the user
        try {
          const db = admin.firestore();
          await db.collection('webhookFailures').add({
            platform: 'apple',
            notificationType,
            subtype: subtype || null,
            originalTransactionId: String(originalTransactionId),
            productId: transactionInfo.productId || null,
            reason: 'no_user_found',
            rawPayload: JSON.stringify({ notificationType, subtype, originalTransactionId, productId: transactionInfo.productId }),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (logErr) {
          logger.error('❌ Failed to log Apple webhook failure:', logErr.message);
        }
        return response.status(200).json({ received: true });
      }

      const userId = userRecord.userId;
      const userEmail = userRecord.subscription?.userEmail;
      const db = admin.firestore();

      switch (notificationType) {
        case 'DID_RENEW':
        case 'SUBSCRIBED': {
          const subData = mapApplePurchaseToSubscription(transactionInfo, transactionInfo.productId, { userId, userEmail });
          await syncAppleSubscriptionToFirestore(userId, userEmail, subData, {
            eventType: notificationType === 'DID_RENEW' ? 'subscription_renewed' : 'subscription_started',
            title: notificationType === 'DID_RENEW' ? 'Subscription renewed' : 'Subscription started',
            severity: 'success',
          });
          if (userEmail) await emailService.sendPaymentSuccessfulEmail(userEmail, null, 'USD', null);
          break;
        }

        case 'DID_CHANGE_RENEWAL_STATUS': {
          const autoRenew = subtype !== 'AUTO_RENEW_DISABLED';
          const renewalPayload = { cancelAtPeriodEnd: !autoRenew, lastUpdated: FieldValue.serverTimestamp() };
          await db.collection('userSubscriptions').doc(userId).set({ subscription: renewalPayload }, { merge: true });
          await db.collection('users').doc(userId).set({ subscription: renewalPayload }, { merge: true });
          // History
          await db.collection('userSubscriptions').doc(userId).collection('history').add({
            eventType: 'renewal_status_changed',
            title: autoRenew ? 'Auto-renew enabled' : 'Auto-renew disabled',
            description: autoRenew ? 'Subscription will renew automatically.' : 'Subscription set to cancel at end of period.',
            status: autoRenew ? 'active' : 'canceling',
            severity: autoRenew ? 'success' : 'warning',
            source: 'apple_iap',
            eventTimestamp: FieldValue.serverTimestamp(),
          });
          break;
        }

        case 'DID_FAIL_TO_RENEW': {
          const failStatus = subtype === 'GRACE_PERIOD' ? 'grace_period' : 'past_due';
          const failPayload = { status: failStatus, billingStatus: 'payment_failed', lastUpdated: FieldValue.serverTimestamp() };
          await db.collection('userSubscriptions').doc(userId).set({ subscription: failPayload }, { merge: true });
          await db.collection('users').doc(userId).set({ subscription: failPayload }, { merge: true });
          await db.collection('userSubscriptions').doc(userId).collection('history').add({
            eventType: 'payment_failed',
            title: failStatus === 'grace_period' ? 'Payment failed — in grace period' : 'Payment failed — past due',
            description: 'Apple subscription renewal payment failed.',
            status: failStatus,
            severity: 'error',
            source: 'apple_iap',
            eventTimestamp: FieldValue.serverTimestamp(),
          });
          if (userEmail) await emailService.sendPaymentFailedEmail(userEmail, null, 'USD', null);
          break;
        }

        case 'EXPIRED': {
          const expPayload = { status: 'expired', hasLifetimeAccess: false, interval: null, plan: null, lastUpdated: FieldValue.serverTimestamp() };
          await db.collection('userSubscriptions').doc(userId).set({ subscription: expPayload }, { merge: true });
          await db.collection('users').doc(userId).set({ subscription: expPayload }, { merge: true });
          await db.collection('userSubscriptions').doc(userId).collection('history').add({
            eventType: 'subscription_expired',
            title: 'Subscription expired',
            description: 'Apple subscription expired — access ended.',
            status: 'expired',
            severity: 'warning',
            source: 'apple_iap',
            eventTimestamp: FieldValue.serverTimestamp(),
          });
          break;
        }

        case 'REFUND': {
          // Restore trial days
          const { restoredTrialEndDate, trialDaysRestored, trialRestoredNote } = await calcTrialRestoration(userId, db);

          const refundedSub = {
            status: restoredTrialEndDate ? 'trialing' : 'refunded',
            hasLifetimeAccess: false,
            interval: restoredTrialEndDate ? 'trial' : null,
            plan: null,
            refundedAt: FieldValue.serverTimestamp(),
            lastUpdated: FieldValue.serverTimestamp(),
            ...(restoredTrialEndDate && {
              currentPeriodEnd: restoredTrialEndDate.toISOString(),
              trialRestoredAt: FieldValue.serverTimestamp(),
              trialRestoredDays: trialDaysRestored,
            }),
          };

          const refundBatch = db.batch();
          const refundSubRef = db.collection('userSubscriptions').doc(userId);
          const refundUserRef = db.collection('users').doc(userId);

          refundBatch.set(refundSubRef, { subscription: refundedSub, lastUpdated: FieldValue.serverTimestamp() }, { merge: true });
          const refundUserUpdate = { subscription: refundedSub, updatedAt: FieldValue.serverTimestamp() };
          if (restoredTrialEndDate) refundUserUpdate.trialEndDate = restoredTrialEndDate;
          refundBatch.set(refundUserRef, refundUserUpdate, { merge: true });

          const lifetimeDocSnap = await db.collection('lifetimeAccess').doc(userId).get();
          if (lifetimeDocSnap.exists) {
            refundBatch.update(db.collection('lifetimeAccess').doc(userId), { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedReason: 'apple_refund' });
          }

          // History: refund event
          refundBatch.set(refundSubRef.collection('history').doc(), {
            eventType: 'apple_refund',
            title: 'Apple refund — access revoked',
            description: `App Store refund processed. Transaction: ${transactionInfo.transactionId || originalTransactionId}`,
            status: 'refunded',
            severity: 'error',
            source: 'apple_iap',
            eventTimestamp: FieldValue.serverTimestamp(),
          });

          // History: trial restoration
          refundBatch.set(refundSubRef.collection('history').doc(), {
            eventType: restoredTrialEndDate ? 'trial_restored' : 'trial_expired_no_restore',
            title: restoredTrialEndDate ? `Trial restored — ${trialDaysRestored} day(s)` : 'Refunded — no trial days to restore',
            description: trialRestoredNote,
            status: refundedSub.status,
            trialDaysRestored,
            restoredTrialEndDate: restoredTrialEndDate ? restoredTrialEndDate.toISOString() : null,
            severity: restoredTrialEndDate ? 'success' : 'warning',
            source: 'apple_iap',
            eventTimestamp: FieldValue.serverTimestamp(),
          });

          await refundBatch.commit();
          adminAlerts.alertRefund(userId, userEmail, null, 'apple').catch(() => {});
          logger.info(`🚫 Apple refund processed for user ${userId}. Trial restored: ${trialDaysRestored} day(s).`);
          if (userEmail) await emailService.sendDisputeNotificationEmail(userEmail, 'App Store refund', null);
          break;
        }

        case 'REVOKE': {
          // Restore trial on revocation too
          const { restoredTrialEndDate: revokeTrialEnd, trialDaysRestored: revokeDays, trialRestoredNote: revokeNote } = await calcTrialRestoration(userId, db);

          const revokedSub = {
            status: 'revoked',
            hasLifetimeAccess: false,
            interval: revokeTrialEnd ? 'trial' : null,
            plan: null,
            lastUpdated: FieldValue.serverTimestamp(),
            ...(revokeTrialEnd && { currentPeriodEnd: revokeTrialEnd.toISOString(), trialRestoredAt: FieldValue.serverTimestamp(), trialRestoredDays: revokeDays }),
          };
          const revokeBatch = db.batch();
          const revokeSubRef = db.collection('userSubscriptions').doc(userId);
          revokeBatch.set(revokeSubRef, { subscription: revokedSub, lastUpdated: FieldValue.serverTimestamp() }, { merge: true });
          const revokeUserUpdate = { subscription: revokedSub, updatedAt: FieldValue.serverTimestamp() };
          if (revokeTrialEnd) revokeUserUpdate.trialEndDate = revokeTrialEnd;
          revokeBatch.set(db.collection('users').doc(userId), revokeUserUpdate, { merge: true });

          revokeBatch.set(revokeSubRef.collection('history').doc(), {
            eventType: 'apple_revoke',
            title: 'Apple subscription revoked',
            description: 'App Store subscription revoked by Apple.',
            status: 'revoked', severity: 'error', source: 'apple_iap',
            eventTimestamp: FieldValue.serverTimestamp(),
          });
          revokeBatch.set(revokeSubRef.collection('history').doc(), {
            eventType: revokeTrialEnd ? 'trial_restored' : 'trial_expired_no_restore',
            title: revokeTrialEnd ? `Trial restored — ${revokeDays} day(s)` : 'Revoked — no trial days to restore',
            description: revokeNote,
            status: revokedSub.status, trialDaysRestored: revokeDays,
            restoredTrialEndDate: revokeTrialEnd ? revokeTrialEnd.toISOString() : null,
            severity: revokeTrialEnd ? 'success' : 'warning', source: 'apple_iap',
            eventTimestamp: FieldValue.serverTimestamp(),
          });

          await revokeBatch.commit();
          if (userEmail) await emailService.sendDisputeNotificationEmail(userEmail, 'App Store subscription revoked', null);
          break;
        }

        default:
          logger.info(`🤷 Unhandled Apple notification: ${notificationType}`);
      }

      response.status(200).json({ received: true, notificationType });
    } catch (error) {
      logger.error(`❌ Error processing Apple webhook: ${error.message}`, error);

      const isTransient = error.code === 'UNAVAILABLE' || error.code === 'DEADLINE_EXCEEDED';
      if (isTransient) {
        response.status(500).json({ error: error.message, retryable: true });
      } else {
        await admin.firestore().collection('webhookFailures').add({
          source: 'apple',
          error: error.message,
          stack: error.stack,
          timestamp: FieldValue.serverTimestamp(),
        });
        response.status(200).json({ received: true, processed: false, error: error.message });
      }
    }
  }
);

// --- Client Receipt Verification ---

exports.verifyAppleReceipt = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY', 'APPLE_APP_STORE_SHARED_SECRET'],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be authenticated.');
    }

    const { receiptData, transactionId, originalTransactionId, productId, userId, userEmail } = request.data;

    if (!receiptData) {
      throw new HttpsError('invalid-argument', 'receiptData is required');
    }

    const resolvedUserId = userId || request.auth.uid;

    logger.info(`🔍 Verifying Apple receipt for user ${resolvedUserId}`);

    try {
      const verificationResult = await verifyAppleReceipt(receiptData);

      if (verificationResult.status !== 0) {
        throw new HttpsError('failed-precondition', `Receipt verification failed: status ${verificationResult.status}`);
      }

      const latestReceiptInfo = verificationResult.latest_receipt_info;
      if (!latestReceiptInfo || latestReceiptInfo.length === 0) {
        throw new HttpsError('failed-precondition', 'No receipt info found');
      }

      const latestTransaction = latestReceiptInfo[latestReceiptInfo.length - 1];
      const resolvedProductId = productId || latestTransaction.product_id;

      const subscriptionData = mapApplePurchaseToSubscription(latestTransaction, resolvedProductId, {
        userId: resolvedUserId,
        userEmail,
      });

      await syncAppleSubscriptionToFirestore(resolvedUserId, userEmail, subscriptionData);

      if (userEmail) {
        try {
          await emailService.sendSubscriptionConfirmedEmail(userEmail, subscriptionData.plan || 'Premium Plan');
        } catch (emailError) {
          logger.error('❌ Failed to send subscription email:', emailError);
        }
      }

      return { success: true, subscription: subscriptionData };
    } catch (error) {
      logger.error('❌ Error verifying Apple receipt:', error);
      throw new HttpsError('internal', `Failed to verify receipt: ${error.message}`);
    }
  }
);
