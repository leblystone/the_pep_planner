/**
 * Google Play Real-time Developer Notifications (RTDN) Webhook Handler
 * Handles subscription lifecycle events from Google Play
 */

const { onRequest } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const { google } = require('googleapis');
const emailService = require('./emailService');
const FieldValue = admin.firestore.FieldValue;

// Research+ product ID → tier/planKey map. Keep in sync with src/config/googlePlayBilling.js
// Both prefixes accepted to handle old (com.) and current (m.) package naming
const GP_RP_PRODUCT_MAP = {
  'm.thepepplanner.app.researchmonthly':    { tier: 'research_plus', planKey: 'researchPlusMonthly',  interval: 'month' },
  'm.thepepplanner.app.researchannual':     { tier: 'research_plus', planKey: 'researchPlusAnnual',   interval: 'year'  },
  'm.thepepplanner.app.researchlifetime':   { tier: 'research_plus', planKey: 'researchPlusLifetime', interval: 'lifetime' },
  'com.thepepplanner.app.researchmonthly':  { tier: 'research_plus', planKey: 'researchPlusMonthly',  interval: 'month' },
  'com.thepepplanner.app.researchannual':   { tier: 'research_plus', planKey: 'researchPlusAnnual',   interval: 'year'  },
  'com.thepepplanner.app.researchlifetime': { tier: 'research_plus', planKey: 'researchPlusLifetime', interval: 'lifetime' },
};

function getTierFromGooglePlayProductId(productId) {
  return productId ? (GP_RP_PRODUCT_MAP[productId] || null) : null;
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

const NOTIFICATION_TYPES = {
  SUBSCRIPTION_RECOVERED: 1,
  SUBSCRIPTION_RENEWED: 2,
  SUBSCRIPTION_CANCELED: 3,
  SUBSCRIPTION_PURCHASED: 4,
  SUBSCRIPTION_ON_HOLD: 5,
  SUBSCRIPTION_IN_GRACE_PERIOD: 6,
  SUBSCRIPTION_RESTARTED: 7,
  SUBSCRIPTION_PRICE_CHANGE_CONFIRMED: 8,
  SUBSCRIPTION_DEFERRED: 9,
  SUBSCRIPTION_PAUSED: 10,
  SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED: 11,
  SUBSCRIPTION_REVOKED: 12,
  SUBSCRIPTION_EXPIRED: 13,
  ONE_TIME_PRODUCT_PURCHASED: 20,
  ONE_TIME_PRODUCT_CANCELED: 21,
};

// ─── Shared Trial Helpers ────────────────────────────────────────────────────

/**
 * Snapshot remaining trial days into a document at purchase time.
 * Called when a subscription or lifetime purchase is first recorded.
 */
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

    const daysRemaining = trialEnd && trialEnd > now
      ? Math.ceil((trialEnd - now) / (24 * 60 * 60 * 1000))
      : 0;

    return {
      trialDaysRemainingAtPurchase: daysRemaining,
      trialEndDateAtPurchase: trialEnd ? trialEnd.toISOString() : null,
    };
  } catch (e) {
    logger.warn(`⚠️ Could not snapshot trial for ${userId}: ${e.message}`);
    return null;
  }
}

/**
 * Calculate and return trial restoration fields.
 * Reads the lifetimeAccess doc for a snapshot, falls back to computing from createdAt.
 */
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
    const created = userData.createdAt?.toDate ? userData.createdAt.toDate()
      : userData.createdAt ? new Date(userData.createdAt) : null;
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

// ─── Webhook Handler ─────────────────────────────────────────────────────────

exports.googlePlayWebhook = onRequest(
  {
    cors: true,
    invoker: 'public',
    secrets: ['RESEND_API_KEY']
  },
  async (request, response) => {
    logger.info('📥 Received Google Play RTDN notification');

    try {
      const pubsubMessage = request.body.message;
      if (!pubsubMessage || !pubsubMessage.data) {
        logger.warn('⚠️ Invalid Pub/Sub message format');
        return response.status(400).json({ error: 'Invalid message format' });
      }

      const decodedData = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
      const notification = JSON.parse(decodedData);
      logger.info('📦 Decoded notification:', JSON.stringify(notification));

      if (notification.subscriptionNotification) {
        await handleSubscriptionNotification(notification.subscriptionNotification);
      } else if (notification.oneTimeProductNotification) {
        await handleOneTimeProductNotification(notification.oneTimeProductNotification);
      } else if (notification.testNotification) {
        logger.info('✅ Test notification from Google Play');
      } else {
        logger.warn('⚠️ Unknown notification type');
      }

      response.status(200).json({ received: true });
    } catch (error) {
      logger.error('❌ Error processing Google Play notification:', error);
      const isTransient = error.code === 'UNAVAILABLE' || error.code === 'DEADLINE_EXCEEDED' || error.message?.includes('ECONNRESET');
      if (isTransient) {
        response.status(500).json({ error: error.message, retryable: true });
      } else {
        await admin.firestore().collection('webhookFailures').add({
          source: 'google_play',
          error: error.message,
          stack: error.stack,
          timestamp: FieldValue.serverTimestamp(),
        });
        response.status(200).json({ error: error.message });
      }
    }
  }
);

async function handleSubscriptionNotification(notification) {
  const { subscriptionId, purchaseToken, notificationType } = notification;
  logger.info(`📱 Subscription notification: ${subscriptionId}, type: ${notificationType}`);

  const subscriptionDetails = await getSubscriptionDetails(subscriptionId, purchaseToken);
  if (!subscriptionDetails) {
    logger.error('❌ Could not retrieve subscription details');
    return;
  }

  const db = admin.firestore();

  // Primary lookup: find existing user with this token already saved
  let userDoc = null;
  const tokenQuery = await db.collection('userSubscriptions')
    .where('subscription.googlePlayPurchaseToken', '==', purchaseToken)
    .limit(1).get();

  if (!tokenQuery.empty) {
    userDoc = tokenQuery.docs[0];
  }

  // Fallback: on first purchase the token isn't saved yet.
  // Google Play includes obfuscatedExternalAccountId when the app sets it at purchase initiation.
  // The app should pass the Firebase UID there — use it to find the user directly.
  if (!userDoc && subscriptionDetails?.obfuscatedExternalAccountId) {
    const uid = subscriptionDetails.obfuscatedExternalAccountId;
    logger.info(`🔍 Token lookup empty — trying obfuscatedExternalAccountId: ${uid}`);
    const byUidDoc = await db.collection('userSubscriptions').doc(uid).get();
    if (byUidDoc.exists) {
      userDoc = byUidDoc;
      logger.info(`✅ Found user via obfuscatedExternalAccountId: ${uid}`);
    }
  }

  // Last resort: save unmatched token for admin review so it isn't silently lost
  if (!userDoc) {
    logger.warn(`⚠️ No user found for purchase token: ${purchaseToken} (notificationType: ${notificationType})`);
    await db.collection('webhookFailures').add({
      source: 'google_play',
      error: `No user found for purchase token: ${purchaseToken}`,
      notificationType,
      subscriptionId,
      purchaseToken,
      obfuscatedExternalAccountId: subscriptionDetails?.obfuscatedExternalAccountId || null,
      timestamp: FieldValue.serverTimestamp(),
      note: 'Token saved here for admin recovery. Use adminManualAndroidGrant to link to the correct user.',
    });
    return;
  }

  const userId = userDoc.id;
  const userEmail = userDoc.data().subscription?.userEmail || userDoc.data().email;
  logger.info(`👤 Found user: ${userId} (${userEmail})`);

  switch (notificationType) {
    case NOTIFICATION_TYPES.SUBSCRIPTION_PURCHASED:
      await handleSubscriptionPurchased(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_RENEWED:
      await handleSubscriptionRenewed(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_CANCELED:
      await handleSubscriptionCanceled(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_EXPIRED:
      await handleSubscriptionExpired(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_ON_HOLD:
      await handleSubscriptionOnHold(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_IN_GRACE_PERIOD:
      await handleSubscriptionGracePeriod(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_RECOVERED:
      await handleSubscriptionRecovered(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_PAUSED:
      await handleSubscriptionPaused(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_REVOKED:
      await handleSubscriptionRevoked(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_RESTARTED:
      await handleSubscriptionRestarted(userId, userEmail, subscriptionDetails, db);
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_PRICE_CHANGE_CONFIRMED:
      logger.info(`💲 Price change confirmed for user ${userId}`);
      await updateSubscriptionStatus(userId, 'active', subscriptionDetails, db, { eventType: 'price_change_confirmed', title: 'Price change confirmed', severity: 'info' });
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_DEFERRED:
      logger.info(`⏭️ Subscription deferred for user ${userId}`);
      await updateSubscriptionStatus(userId, 'active', subscriptionDetails, db, { eventType: 'subscription_deferred', title: 'Renewal deferred', severity: 'info' });
      break;
    case NOTIFICATION_TYPES.SUBSCRIPTION_PAUSE_SCHEDULE_CHANGED:
      logger.info(`📅 Pause schedule changed for user ${userId}`);
      await updateSubscriptionStatus(userId, userDoc.data().subscription?.status || 'active', subscriptionDetails, db, { eventType: 'pause_schedule_changed', title: 'Pause schedule changed', severity: 'info' });
      break;
    default:
      logger.info(`ℹ️ Unhandled notification type: ${notificationType}`);
  }
}

async function handleOneTimeProductNotification(notification) {
  const { sku, purchaseToken, notificationType } = notification;
  logger.info(`🛍️ One-time product notification: ${sku}, type: ${notificationType}`);

  if (notificationType === NOTIFICATION_TYPES.ONE_TIME_PRODUCT_CANCELED) {
    logger.warn(`⚠️ One-time product canceled/refunded: ${sku}, token: ${purchaseToken}`);
    const db = admin.firestore();

    let userId = null;
    let userEmail = null;

    const subQuery = await db.collection('userSubscriptions')
      .where('subscription.googlePlayPurchaseToken', '==', purchaseToken).limit(1).get();
    if (!subQuery.empty) {
      userId = subQuery.docs[0].id;
      userEmail = subQuery.docs[0].data()?.subscription?.userEmail;
    }

    if (!userId) {
      const lifetimeQuery = await db.collection('lifetimeAccess')
        .where('metadata.googlePlayPurchaseToken', '==', purchaseToken).limit(1).get();
      if (!lifetimeQuery.empty) {
        userId = lifetimeQuery.docs[0].id;
        userEmail = lifetimeQuery.docs[0].data()?.email;
      }
    }

    if (!userId) {
      logger.warn(`⚠️ Could not find user for refunded one-time product: ${sku}`);
      await db.collection('webhookFailures').add({
        source: 'google_play',
        error: `No user found for refunded one-time product token: ${purchaseToken}`,
        sku,
        timestamp: FieldValue.serverTimestamp(),
      });
      return;
    }

    // Restore trial days
    const { restoredTrialEndDate, trialDaysRestored, trialRestoredNote } = await calcTrialRestoration(userId, db);

    const refundedSubscription = {
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

    const batch = db.batch();
    const subRef = db.collection('userSubscriptions').doc(userId);
    const userRef = db.collection('users').doc(userId);

    batch.set(subRef, { subscription: refundedSubscription, lastUpdated: FieldValue.serverTimestamp() }, { merge: true });
    const userUpdate = { subscription: refundedSubscription, updatedAt: FieldValue.serverTimestamp() };
    if (restoredTrialEndDate) userUpdate.trialEndDate = restoredTrialEndDate;
    batch.set(userRef, userUpdate, { merge: true });

    // Revoke lifetime doc
    const lifetimeRef = db.collection('lifetimeAccess').doc(userId);
    const lifetimeDoc = await lifetimeRef.get();
    if (lifetimeDoc.exists) {
      batch.update(lifetimeRef, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedReason: 'google_play_refund', refundPurchaseToken: purchaseToken });
    }

    // History: refund event
    const histRefund = subRef.collection('history').doc();
    batch.set(histRefund, {
      eventType: 'google_play_refund',
      status: 'refunded',
      title: 'Google Play refund — access revoked',
      description: `One-time product refunded. SKU: ${sku}`,
      source: 'google_play_webhook',
      severity: 'error',
      eventTimestamp: FieldValue.serverTimestamp(),
    });

    // History: trial restoration
    const histTrial = subRef.collection('history').doc();
    batch.set(histTrial, {
      eventType: restoredTrialEndDate ? 'trial_restored' : 'trial_expired_no_restore',
      status: refundedSubscription.status,
      title: restoredTrialEndDate ? `Trial restored — ${trialDaysRestored} day(s)` : 'Refunded — no trial days to restore',
      description: trialRestoredNote,
      trialDaysRestored,
      restoredTrialEndDate: restoredTrialEndDate ? restoredTrialEndDate.toISOString() : null,
      source: 'google_play_webhook',
      severity: restoredTrialEndDate ? 'success' : 'warning',
      eventTimestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();
    logger.info(`🚫 Lifetime revoked for user ${userId} via Google Play refund. Trial restored: ${trialDaysRestored} day(s).`);

    if (userEmail) {
      await emailService.sendDisputeNotificationEmail(userEmail, 'Google Play refund', null);
    }
  }
}

async function getSubscriptionDetails(subscriptionId, purchaseToken) {
  try {
    const keyValue = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
    if (!keyValue) { logger.error('❌ GOOGLE_PLAY_SERVICE_ACCOUNT_KEY not configured'); return null; }
    const serviceAccountKey = JSON.parse(keyValue.trim().replace(/\r?\n/g, ''));
    const auth = new google.auth.GoogleAuth({ credentials: serviceAccountKey, scopes: ['https://www.googleapis.com/auth/androidpublisher'] });
    const client = google.androidpublisher({ version: 'v3', auth });
    const response = await client.purchases.subscriptions.get({ packageName: 'com.thepepplanner.app', subscriptionId, token: purchaseToken });
    return response.data;
  } catch (error) {
    logger.error('❌ Failed to get subscription details:', error);
    return null;
  }
}

// ─── Subscription State Handlers ─────────────────────────────────────────────

async function handleSubscriptionPurchased(userId, userEmail, details, db) {
  logger.info(`✅ Subscription purchased: ${userId}`);
  // Snapshot trial days before overwriting status
  const snapshot = await snapshotTrialOnPurchase(userId, db);
  if (snapshot) {
    await db.collection('userSubscriptions').doc(userId).set({
      subscription: { trialDaysRemainingAtPurchase: snapshot.trialDaysRemainingAtPurchase, trialEndDateAtPurchase: snapshot.trialEndDateAtPurchase }
    }, { merge: true });
  }
  await updateSubscriptionStatus(userId, 'active', details, db, { eventType: 'subscription_purchased', title: 'Subscription purchased', severity: 'success', extraHistory: snapshot ? { trialDaysRemainingAtPurchase: snapshot.trialDaysRemainingAtPurchase } : {} });
  if (userEmail) await emailService.sendSubscriptionConfirmedEmail(userEmail, 'Premium Plan (Google Play)');
  // Write trial_on_hold entry
  if (snapshot?.trialDaysRemainingAtPurchase != null) {
    await db.collection('userSubscriptions').doc(userId).collection('history').add({
      eventType: 'trial_on_hold',
      status: 'active',
      title: 'Trial paused — Google Play subscription started',
      description: `${snapshot.trialDaysRemainingAtPurchase} trial day(s) remaining at time of purchase. Restorable if refunded.`,
      trialDaysRemainingAtPurchase: snapshot.trialDaysRemainingAtPurchase,
      trialEndDateAtPurchase: snapshot.trialEndDateAtPurchase,
      source: 'google_play_webhook',
      severity: 'info',
      eventTimestamp: FieldValue.serverTimestamp(),
    });
  }
}

async function handleSubscriptionRenewed(userId, userEmail, details, db) {
  logger.info(`🔄 Subscription renewed: ${userId}`);
  await updateSubscriptionStatus(userId, 'active', details, db, { eventType: 'subscription_renewed', title: 'Subscription renewed', severity: 'success' });
  if (userEmail) await emailService.sendPaymentSuccessfulEmail(userEmail, null, 'USD', null);
}

async function handleSubscriptionCanceled(userId, userEmail, details, db) {
  logger.info(`❌ Subscription canceled: ${userId}`);
  const expiryDate = details.expiryTimeMillis ? new Date(parseInt(details.expiryTimeMillis)).toISOString().split('T')[0] : 'end of billing period';
  await updateSubscriptionStatus(userId, 'canceled', details, db, {
    eventType: 'subscription_canceled',
    title: 'Subscription canceled',
    description: `Access through ${expiryDate}`,
    severity: 'warning',
    clearStaleFields: true,
  });
  if (userEmail) await emailService.sendSubscriptionCancelledEmail(userEmail, 'Premium Plan (Google Play)', expiryDate);
}

async function handleSubscriptionExpired(userId, userEmail, details, db) {
  logger.info(`⏰ Subscription expired: ${userId}`);
  await updateSubscriptionStatus(userId, 'expired', details, db, { eventType: 'subscription_expired', title: 'Subscription expired', severity: 'warning', clearStaleFields: true });
}

async function handleSubscriptionOnHold(userId, userEmail, details, db) {
  logger.info(`⚠️ Subscription on hold: ${userId}`);
  await updateSubscriptionStatus(userId, 'on_hold', details, db, { eventType: 'subscription_on_hold', title: 'Subscription on hold — payment issue', severity: 'error' });
  if (userEmail) await emailService.sendPaymentFailedEmail(userEmail, null, 'USD', null);
}

async function handleSubscriptionGracePeriod(userId, userEmail, details, db) {
  logger.info(`⏳ Subscription in grace period: ${userId}`);
  await updateSubscriptionStatus(userId, 'grace_period', details, db, { eventType: 'subscription_grace_period', title: 'In grace period', severity: 'warning' });
  if (userEmail) await emailService.sendPaymentFailedEmail(userEmail, null, 'USD', null);
}

async function handleSubscriptionRecovered(userId, userEmail, details, db) {
  logger.info(`✅ Subscription recovered: ${userId}`);
  await updateSubscriptionStatus(userId, 'active', details, db, { eventType: 'subscription_recovered', title: 'Subscription recovered', severity: 'success' });
  if (userEmail) await emailService.sendPaymentSuccessfulEmail(userEmail, null, 'USD', null);
}

async function handleSubscriptionPaused(userId, userEmail, details, db) {
  logger.info(`⏸️ Subscription paused: ${userId}`);
  await updateSubscriptionStatus(userId, 'paused', details, db, { eventType: 'subscription_paused', title: 'Subscription paused', severity: 'warning' });
}

async function handleSubscriptionRevoked(userId, userEmail, details, db) {
  logger.info(`🚫 Subscription revoked: ${userId}`);

  // Restore trial on revocation (same as refund — access is being taken away)
  const { restoredTrialEndDate, trialDaysRestored, trialRestoredNote } = await calcTrialRestoration(userId, db);

  await updateSubscriptionStatus(userId, 'revoked', details, db, {
    eventType: 'subscription_revoked',
    title: 'Subscription revoked by Google Play',
    severity: 'error',
    clearStaleFields: true,
    extraSubscription: restoredTrialEndDate ? { interval: 'trial', currentPeriodEnd: restoredTrialEndDate.toISOString(), trialRestoredAt: FieldValue.serverTimestamp(), trialRestoredDays: trialDaysRestored } : {},
    extraUserUpdate: restoredTrialEndDate ? { trialEndDate: restoredTrialEndDate } : {},
  });

  // Write trial restoration history
  await db.collection('userSubscriptions').doc(userId).collection('history').add({
    eventType: restoredTrialEndDate ? 'trial_restored' : 'trial_expired_no_restore',
    status: restoredTrialEndDate ? 'trialing' : 'revoked',
    title: restoredTrialEndDate ? `Trial restored — ${trialDaysRestored} day(s)` : 'Revoked — no trial days to restore',
    description: trialRestoredNote,
    trialDaysRestored,
    restoredTrialEndDate: restoredTrialEndDate ? restoredTrialEndDate.toISOString() : null,
    source: 'google_play_webhook',
    severity: restoredTrialEndDate ? 'success' : 'warning',
    eventTimestamp: FieldValue.serverTimestamp(),
  });

  if (userEmail) await emailService.sendDisputeNotificationEmail(userEmail, 'Google Play subscription revoked', null);
}

async function handleSubscriptionRestarted(userId, userEmail, details, db) {
  logger.info(`▶️ Subscription restarted: ${userId}`);
  await updateSubscriptionStatus(userId, 'active', details, db, { eventType: 'subscription_restarted', title: 'Subscription restarted', severity: 'success' });
  if (userEmail) await emailService.sendSubscriptionConfirmedEmail(userEmail, 'Premium Plan (Google Play)');
}

// ─── Core Update Helper ───────────────────────────────────────────────────────

/**
 * Update subscription status in Firestore with full audit history.
 * @param {string} eventType  - machine-readable event type for activity log
 * @param {string} title      - human-readable title for activity log
 * @param {string} [description]
 * @param {string} severity   - 'success' | 'info' | 'warning' | 'error'
 * @param {boolean} clearStaleFields - if true, clear hasLifetimeAccess/interval/plan
 * @param {object} extraHistory - extra fields to add to history doc
 * @param {object} extraSubscription - extra fields to merge into subscription
 * @param {object} extraUserUpdate - extra fields for the users doc update
 */
async function updateSubscriptionStatus(userId, status, details, db, opts = {}) {
  const { eventType = 'subscription_change', title = 'Subscription updated', description = '', severity = 'info', clearStaleFields = false, extraHistory = {}, extraSubscription = {}, extraUserUpdate = {} } = opts;

  // Derive tier + planKey from product ID so frontend resolves correctly
  const tierInfo = getTierFromGooglePlayProductId(details.productId || details.sku || null);
  const resolvedTier = tierInfo?.tier
    ? await resolveUserTier(userId, tierInfo.tier, db)
    : null;

  // Always persist the purchase token and product ID so future syncs and RTDNs can find this user
  const productId = details.productId || details.sku || null;
  const purchaseToken = details.purchaseToken || details.linkedPurchaseToken || null;
  const tierInfo2 = productId ? getTierFromGooglePlayProductId(productId) : null;
  const interval = tierInfo2?.interval || (tierInfo?.interval) || null;

  const subscriptionData = {
    status,
    lastUpdated: FieldValue.serverTimestamp(),
    isAutoRenewing: details.autoRenewing === true,
    paymentProvider: 'google_play',
    ...(resolvedTier && { tier: resolvedTier, planKey: tierInfo.planKey }),
    ...(interval && { interval }),
    ...(productId && { googlePlayProductId: productId }),
    ...(purchaseToken && { googlePlayPurchaseToken: purchaseToken }),
    ...(clearStaleFields && { hasLifetimeAccess: false, plan: null }),
    ...extraSubscription,
  };

  if (details.expiryTimeMillis) subscriptionData.currentPeriodEnd = new Date(parseInt(details.expiryTimeMillis));
  if (details.startTimeMillis) subscriptionData.currentPeriodStart = new Date(parseInt(details.startTimeMillis));

  const batch = db.batch();
  const subRef = db.collection('userSubscriptions').doc(userId);
  const userRef = db.collection('users').doc(userId);

  batch.set(subRef, { subscription: subscriptionData, lastUpdated: FieldValue.serverTimestamp() }, { merge: true });
  batch.set(userRef, { subscription: subscriptionData, updatedAt: FieldValue.serverTimestamp(), ...extraUserUpdate }, { merge: true });

  const historyRef = subRef.collection('history').doc();
  batch.set(historyRef, {
    eventType,
    title,
    description,
    status,
    severity,
    source: 'google_play_webhook',
    eventTimestamp: FieldValue.serverTimestamp(),
    currentPeriodEnd: subscriptionData.currentPeriodEnd || null,
    isAutoRenewing: subscriptionData.isAutoRenewing,
    ...extraHistory,
  });

  await batch.commit();
  logger.info(`✅ Updated subscription to "${status}" for user ${userId} [${eventType}]`);
}
