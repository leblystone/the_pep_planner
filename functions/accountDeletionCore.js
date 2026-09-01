/**
 * Shared account deletion execution (used by immediate admin delete + scheduled processor).
 */
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const emailService = require('./emailService');

const PACKAGE_NAME = 'com.thepepplanner.app';

const PROVIDER_LABELS = {
  stripe: 'Stripe',
  google_play: 'Google Play',
  apple: 'Apple',
  squarespace: 'Squarespace',
};

function normalizeSub(subscriptionDocData) {
  if (!subscriptionDocData) return null;
  return subscriptionDocData.subscription || subscriptionDocData;
}

function parseDate(value) {
  if (!value) return null;
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch (_) {
    return null;
  }
}

/**
 * Best date to delete after billing period ends.
 */
function resolveScheduledDeleteAt(subscriptionDocData) {
  const sub = normalizeSub(subscriptionDocData);
  if (!sub) return null;

  const periodEnd = parseDate(sub.currentPeriodEnd);
  const cancelAt = parseDate(sub.cancelAt);
  const candidate = periodEnd || cancelAt;
  if (!candidate) return null;

  const now = Date.now();
  if (candidate.getTime() <= now + 60 * 60 * 1000) {
    return null;
  }
  return candidate;
}

async function cancelStripeAtPeriodEnd(stripeSubId) {
  if (!stripeSubId) return { ok: false, reason: 'no_stripe_id' };
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey || stripeSecretKey === 'sk_test_fallback_key') {
    return { ok: false, reason: 'stripe_not_configured' };
  }
  const stripe = require('stripe')(stripeSecretKey);
  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId);
  if (!['active', 'trialing', 'past_due'].includes(stripeSubscription.status)) {
    return { ok: true, reason: 'already_inactive' };
  }
  await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: true });
  return { ok: true, reason: 'cancel_at_period_end' };
}

async function revertStripeCancelAtPeriodEnd(stripeSubId) {
  if (!stripeSubId) return;
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) return;
  const stripe = require('stripe')(stripeSecretKey);
  const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId);
  if (stripeSubscription.cancel_at_period_end) {
    await stripe.subscriptions.update(stripeSubId, { cancel_at_period_end: false });
  }
}

function resolveStripeSubscriptionId(sub, subscriptionDocData) {
  const candidates = [
    sub?.stripeSubscriptionId,
    sub?.id,
    subscriptionDocData?.stripeSubscriptionId,
    subscriptionDocData?.subscription?.stripeSubscriptionId,
    subscriptionDocData?.subscription?.id,
  ];
  for (const candidate of candidates) {
    if (candidate && String(candidate).startsWith('sub_')) {
      return String(candidate);
    }
  }
  return null;
}

async function resolveStripeSubscriptionIdAsync(sub, subscriptionDocData, userId, db) {
  const direct = resolveStripeSubscriptionId(sub, subscriptionDocData);
  if (direct) return direct;

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey || stripeSecretKey === 'sk_test_fallback_key') {
    return null;
  }

  let customerId =
    sub?.stripeCustomerId ||
    subscriptionDocData?.stripeCustomerId ||
    subscriptionDocData?.subscription?.stripeCustomerId ||
    null;

  if (!customerId && userId && db) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists) {
        const u = userDoc.data();
        customerId = u.stripeCustomerId || u.customerId || u.subscription?.stripeCustomerId || null;
      }
    } catch (err) {
      logger.warn(`⚠️ Could not load user for Stripe lookup: ${err.message}`);
    }
  }

  if (!customerId && userId && db) {
    try {
      const authUser = await admin.auth().getUser(userId);
      if (authUser.email) {
        const stripe = require('stripe')(stripeSecretKey);
        const customers = await stripe.customers.list({ email: authUser.email, limit: 1 });
        if (customers.data.length > 0) {
          customerId = customers.data[0].id;
        }
      }
    } catch (err) {
      logger.warn(`⚠️ Stripe customer email lookup failed: ${err.message}`);
    }
  }

  if (!customerId) return null;

  try {
    const stripe = require('stripe')(stripeSecretKey);
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });
    const active =
      subscriptions.data.find((s) => ['active', 'trialing', 'past_due'].includes(s.status)) ||
      subscriptions.data[0];
    return active?.id && String(active.id).startsWith('sub_') ? active.id : null;
  } catch (err) {
    logger.warn(`⚠️ Stripe subscription list failed: ${err.message}`);
    return null;
  }
}

function normalizePaymentProvider(sub, subscriptionDocData = null) {
  if (!sub) return null;
  const raw = String(sub.paymentProvider || sub.platform || '')
    .toLowerCase()
    .replace(/\s/g, '_');
  const stripeSubId = resolveStripeSubscriptionId(sub, subscriptionDocData);
  const hasStripeCustomer = !!(
    sub.stripeCustomerId ||
    subscriptionDocData?.stripeCustomerId ||
    subscriptionDocData?.subscription?.stripeCustomerId
  );

  if (['google', 'google_play', 'googleplay', 'android'].includes(raw)) return 'google_play';
  if (['apple', 'app_store', 'appstore', 'ios'].includes(raw)) return 'apple';
  if (raw === 'squarespace') return 'squarespace';
  if (raw === 'stripe' && (stripeSubId || hasStripeCustomer)) return 'stripe';
  if (sub.googlePlayPurchaseToken) return 'google_play';
  if (sub.appleOriginalTransactionId || sub.appleTransactionId) return 'apple';
  if (stripeSubId) return 'stripe';
  return null;
}

function getProviderLabel(provider) {
  return PROVIDER_LABELS[provider] || provider || 'Unknown';
}

/**
 * Live billing snapshot for admin schedule UI + scheduling logic.
 */
function getSubscriptionBillingSnapshot(subscriptionDocData) {
  const sub = normalizeSub(subscriptionDocData);
  if (!sub) {
    return {
      provider: null,
      providerLabel: 'None',
      status: null,
      interval: null,
      currentPeriodEnd: null,
      stripeSubId: null,
      gpToken: null,
      gpProductId: null,
      hasApple: false,
      canSchedule: false,
      scheduleBlockReason: 'No subscription on file',
      scheduledDeleteAt: null,
    };
  }

  const provider = normalizePaymentProvider(sub, subscriptionDocData);
  const status = (sub.status || '').toLowerCase();
  const interval = (sub.interval || '').toLowerCase();
  const periodEnd = parseDate(sub.currentPeriodEnd);
  const cancelAt = parseDate(sub.cancelAt);
  const billingEnd = periodEnd || cancelAt;

  const stripeSubId = resolveStripeSubscriptionId(sub, subscriptionDocData);
  const gpToken = sub.googlePlayPurchaseToken || null;
  const gpProductId = sub.googlePlayProductId || null;
  const hasApple = !!(sub.appleOriginalTransactionId || sub.appleTransactionId);

  const inferredProvider =
    provider ||
    (stripeSubId ? 'stripe' : null) ||
    (gpToken && gpProductId ? 'google_play' : null) ||
    (hasApple ? 'apple' : null);

  let scheduleBlockReason = null;
  let canSchedule = false;

  if (interval === 'lifetime' || sub.hasLifetimeAccess === true) {
    scheduleBlockReason = 'Lifetime access — use immediate delete';
  } else if (['expired', 'canceled', 'cancelled', 'revoked'].includes(status)) {
    scheduleBlockReason = 'Subscription already ended — use immediate delete';
  } else if (!billingEnd) {
    scheduleBlockReason = 'No billing period end date on file';
  } else if (billingEnd.getTime() <= Date.now() + 60 * 60 * 1000) {
    scheduleBlockReason = 'Billing period ends within 1 hour — use immediate delete';
  } else if (!inferredProvider) {
    scheduleBlockReason = 'No Stripe, Google Play, or Apple subscription found';
  } else {
    canSchedule = true;
  }

  return {
    provider: inferredProvider,
    providerLabel: getProviderLabel(inferredProvider),
    status: sub.status || null,
    interval: sub.interval || null,
    currentPeriodEnd: billingEnd ? billingEnd.toISOString() : null,
    stripeSubId,
    gpToken,
    gpProductId,
    hasApple,
    canSchedule,
    scheduleBlockReason,
    scheduledDeleteAt: canSchedule ? billingEnd : null,
    cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
  };
}

async function cancelGooglePlayAtPeriodEnd(gpToken, gpProductId) {
  if (!gpToken || !gpProductId) {
    return { ok: false, reason: 'no_google_play_ids' };
  }
  const keyValue = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
  if (!keyValue) {
    return { ok: false, reason: 'google_play_not_configured' };
  }
  try {
    const { google } = require('googleapis');
    const serviceAccountKey = JSON.parse(keyValue.trim().replace(/\r?\n/g, ''));
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccountKey,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
    const client = google.androidpublisher({ version: 'v3', auth });

    // Use subscriptionsv2.cancel — the v1 cancel API ignores cancellationType
    // in the client library; v2 is required to stop renewals (not revoke immediately).
    try {
      await client.purchases.subscriptionsv2.cancel({
        packageName: PACKAGE_NAME,
        token: gpToken,
        requestBody: {
          cancellationContext: {
            cancellationType: 'USER_REQUESTED_STOP_RENEWALS',
          },
        },
      });
      return { ok: true, reason: 'google_play_stop_renewals' };
    } catch (v2Err) {
      // v2 may not be available on older googleapis versions — fall back to v1
      logger.warn(`⚠️ subscriptionsv2.cancel failed (${v2Err.message}), trying v1 fallback`);
      await client.purchases.subscriptions.cancel({
        packageName: PACKAGE_NAME,
        subscriptionId: gpProductId,
        token: gpToken,
      });
      return { ok: true, reason: 'google_play_stop_renewals_v1' };
    }
  } catch (error) {
    const msg = error?.response?.data?.error?.message || error.message || 'google_play_cancel_failed';
    logger.warn(`⚠️ Google Play cancel at period end failed: ${msg}`);
    return { ok: false, reason: msg };
  }
}

async function setAppleScheduleFlags(db, userId) {
  const ref = db.collection('userSubscriptions').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, reason: 'no_subscription_doc' };
  }
  const note =
    'Account deletion scheduled by admin. User must cancel auto-renew in App Store for deletion to proceed on schedule.';
  const data = snap.data();
  if (data?.subscription) {
    await ref.update({
      'subscription.cancelAtPeriodEnd': true,
      'subscription.platformScheduleNote': note,
      'subscription.scheduledDeletionPending': true,
      scheduledDeletionPending: true,
    });
  } else {
    await ref.update({
      cancelAtPeriodEnd: true,
      platformScheduleNote: note,
      scheduledDeletionPending: true,
    });
  }
  return {
    ok: true,
    reason: 'firestore_only',
    warning:
      'Apple has no server API to stop auto-renew. User must cancel in Settings → Apple ID → Subscriptions. Deletion runs after subscription ends.',
  };
}

async function clearAppleScheduleFlags(db, userId) {
  const ref = db.collection('userSubscriptions').doc(userId);
  const snap = await ref.get();
  if (!snap.exists) return;
  const data = snap.data();
  if (data?.subscription) {
    await ref.update({
      'subscription.platformScheduleNote': admin.firestore.FieldValue.delete(),
      'subscription.scheduledDeletionPending': admin.firestore.FieldValue.delete(),
      scheduledDeletionPending: admin.firestore.FieldValue.delete(),
    });
  } else {
    await ref.update({
      platformScheduleNote: admin.firestore.FieldValue.delete(),
      scheduledDeletionPending: admin.firestore.FieldValue.delete(),
    });
  }
}

/**
 * Platform-specific "cancel at period end" when admin schedules deletion.
 */
async function schedulePlatformCancellation({
  snapshot,
  userId,
  db,
  subscriptionDocData = null,
}) {
  const provider = snapshot.provider;
  if (!provider) {
    return {
      provider: null,
      ok: false,
      action: 'none',
      warning: 'No billing platform detected',
    };
  }

  if (provider === 'stripe') {
    let stripeSubId = snapshot.stripeSubId;
    if (!stripeSubId && userId && db) {
      const sub = normalizeSub(subscriptionDocData);
      stripeSubId = await resolveStripeSubscriptionIdAsync(
        sub,
        subscriptionDocData,
        userId,
        db
      );
      if (stripeSubId) {
        try {
          const ref = db.collection('userSubscriptions').doc(userId);
          const snap = await ref.get();
          if (snap.exists && snap.data()?.subscription) {
            await ref.update({ 'subscription.stripeSubscriptionId': stripeSubId });
          } else {
            await ref.set(
              { subscription: { stripeSubscriptionId: stripeSubId } },
              { merge: true }
            );
          }
          logger.info(`✅ Backfilled stripeSubscriptionId ${stripeSubId} for ${userId}`);
        } catch (persistErr) {
          logger.warn(`⚠️ Could not persist stripeSubscriptionId: ${persistErr.message}`);
        }
      }
    }

    if (!stripeSubId) {
      return {
        provider: 'stripe',
        ok: false,
        action: 'missing_stripe_subscription_id',
        warning:
          'Could not find Stripe subscription ID. Use Sync in user profile or cancel at period end in Stripe Dashboard, then retry.',
      };
    }

    const result = await cancelStripeAtPeriodEnd(stripeSubId);
    return {
      provider: 'stripe',
      ok: result.ok,
      action: result.reason || 'stripe_cancel',
      warning: result.ok ? null : 'Stripe could not set cancel at period end',
      stripeSubscriptionId: stripeSubId,
    };
  }

  if (provider === 'google_play' && snapshot.gpToken && snapshot.gpProductId) {
    const result = await cancelGooglePlayAtPeriodEnd(snapshot.gpToken, snapshot.gpProductId);
    return {
      provider: 'google_play',
      ok: result.ok,
      action: result.reason || 'google_play_cancel',
      warning: result.ok
        ? null
        : `Google Play could not stop renewals: ${result.reason || 'unknown error'}`,
    };
  }

  if (provider === 'apple') {
    const result = await setAppleScheduleFlags(db, userId);
    return {
      provider: 'apple',
      ok: result.ok,
      action: result.reason || 'firestore_only',
      warning: result.warning || null,
    };
  }

  return {
    provider,
    ok: false,
    action: 'unsupported_provider',
    warning: `Scheduling not supported for provider: ${provider}`,
  };
}

async function revertPlatformCancellation({ snapshot, storedPlatformSchedule, userId, db }) {
  if (snapshot.provider === 'stripe' && snapshot.stripeSubId) {
    if (storedPlatformSchedule?.ok || storedPlatformSchedule?.action === 'cancel_at_period_end') {
      try {
        await revertStripeCancelAtPeriodEnd(snapshot.stripeSubId);
      } catch (err) {
        logger.warn(`⚠️ Stripe revert failed: ${err.message}`);
      }
    }
    return;
  }
  if (snapshot.provider === 'apple' && userId && db) {
    try {
      await clearAppleScheduleFlags(db, userId);
    } catch (err) {
      logger.warn(`⚠️ Could not clear Apple schedule flags: ${err.message}`);
    }
  }
  // Google Play: renewals cannot be restored via API after cancel — admin note only
}

async function cancelSubscriptionsImmediate(subscriptionDocData) {
  const sub = normalizeSub(subscriptionDocData);
  const stripeSubId = resolveStripeSubscriptionId(sub, subscriptionDocData);

  if (stripeSubId) {
    try {
      const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
      if (stripeSecretKey) {
        const stripe = require('stripe')(stripeSecretKey);
        const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubId);
        if (['active', 'trialing', 'past_due'].includes(stripeSubscription.status)) {
          await stripe.subscriptions.cancel(stripeSubId);
          logger.info(`✅ Cancelled Stripe subscription: ${stripeSubId}`);
        }
      }
    } catch (error) {
      logger.warn(`⚠️ Could not cancel Stripe subscription: ${error.message}`);
    }
  }

  const gpToken = sub?.googlePlayPurchaseToken;
  const gpProductId = sub?.googlePlayProductId;
  if (gpToken && gpProductId) {
    try {
      const { google } = require('googleapis');
      const keyValue = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
      if (keyValue) {
        const serviceAccountKey = JSON.parse(keyValue.trim().replace(/\r?\n/g, ''));
        const authClient = new google.auth.GoogleAuth({
          credentials: serviceAccountKey,
          scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });
        const client = google.androidpublisher({ version: 'v3', auth: authClient });
        await client.purchases.subscriptions.revoke({
          packageName: 'com.thepepplanner.app',
          subscriptionId: gpProductId,
          token: gpToken,
        });
        logger.info('✅ Revoked Google Play subscription');
      }
    } catch (error) {
      logger.warn(`⚠️ Could not revoke Google Play subscription: ${error.message}`);
    }
  }
}

async function executeFullAccountDeletion({
  userId,
  email,
  deletedBy = 'admin',
  deletionType = 'admin_terminated',
  requestId = null,
}) {
  const db = admin.firestore();
  const auth = admin.auth();

  let userName = email.split('@')[0];
  try {
    const userRecord = await auth.getUser(userId);
    userName = userRecord.displayName || userName;
  } catch (error) {
    logger.warn(`⚠️ Could not fetch user record: ${error.message}`);
  }

  let subscriptionInfo = null;
  try {
    const subscriptionDoc = await db.collection('userSubscriptions').doc(userId).get();
    if (subscriptionDoc.exists) {
      subscriptionInfo = subscriptionDoc.data();
    }
  } catch (error) {
    logger.warn(`⚠️ Could not fetch subscription info: ${error.message}`);
  }

  await cancelSubscriptionsImmediate(subscriptionInfo);

  const userIdCollections = [
    'users',
    'userData',
    'userdata',
    'userSubscriptions',
    'userPreferences',
    'userState',
    'lifetimeAccess',
    'userSecurity',
    'userNotificationSettings',
  ];

  await Promise.all(
    userIdCollections.map(async (collectionName) => {
      try {
        const docRef = db.collection(collectionName).doc(userId);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          await docRef.delete();
          logger.info(`✅ Deleted ${collectionName} for user ${userId}`);
        }
      } catch (error) {
        logger.warn(`⚠️ Error deleting ${collectionName}: ${error.message}`);
      }
    })
  );

  const queryDeleteConfigs = [
    { collection: 'notifications', field: 'userEmail', value: email },
    { collection: 'adminMessages', field: 'userEmail', value: email },
    { collection: 'feedback', field: 'userEmail', value: email },
    { collection: 'user_agreements', field: 'userEmail', value: email },
  ];

  await Promise.all(
    queryDeleteConfigs.map(async ({ collection: colName, field, value }) => {
      try {
        const snap = await db.collection(colName).where(field, '==', value).get();
        if (!snap.empty) {
          const delBatch = db.batch();
          snap.docs.forEach((d) => delBatch.delete(d.ref));
          await delBatch.commit();
        }
      } catch (error) {
        logger.warn(`⚠️ Error deleting ${colName}: ${error.message}`);
      }
    })
  );

  try {
    let pushSnap = await db.collection('pushSubscriptions').where('userId', '==', userId).get();
    if (pushSnap.empty) {
      pushSnap = await db.collection('pushSubscriptions').where('userEmail', '==', email).get();
    }
    if (!pushSnap.empty) {
      const pushBatch = db.batch();
      pushSnap.docs.forEach((d) => pushBatch.delete(d.ref));
      await pushBatch.commit();
    }
  } catch (error) {
    logger.warn(`⚠️ Error deleting push subscriptions: ${error.message}`);
  }

  try {
    const ticketSnap = await db.collection('supportTickets').where('userEmail', '==', email).get();
    for (const ticketDoc of ticketSnap.docs) {
      const messagesSnap = await ticketDoc.ref.collection('messages').get();
      if (!messagesSnap.empty) {
        const msgBatch = db.batch();
        messagesSnap.docs.forEach((d) => msgBatch.delete(d.ref));
        await msgBatch.commit();
      }
      await ticketDoc.ref.delete();
    }
  } catch (error) {
    logger.warn(`⚠️ Error deleting support tickets: ${error.message}`);
  }

  await auth.deleteUser(userId);
  logger.info(`✅ Deleted user from Firebase Auth: ${userId}`);

  let goodbyeEmailSentAt = null;
  try {
    await emailService.sendAccountDeletionEmail(email, userName);
    goodbyeEmailSentAt = admin.firestore.Timestamp.now();
  } catch (error) {
    logger.error(`❌ Could not send account deletion email: ${error.message}`);
  }

  const sub = normalizeSub(subscriptionInfo);
  await db.collection('accountDeletions').add({
    userId,
    userEmail: email,
    userName,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletionType,
    deletedBy,
    requestId: requestId || null,
    goodbyeEmailSentAt: goodbyeEmailSentAt || null,
    subscriptionCancelled: !!(sub?.stripeSubscriptionId || sub?.googlePlayPurchaseToken),
    stripeSubscriptionId: sub?.stripeSubscriptionId || null,
    dataSummary: {
      hadSubscription: !!subscriptionInfo,
      hadLifetimeAccess: false,
    },
  });

  return { userName, goodbyeEmailSentAt };
}

module.exports = {
  normalizeSub,
  parseDate,
  resolveScheduledDeleteAt,
  resolveStripeSubscriptionId,
  resolveStripeSubscriptionIdAsync,
  normalizePaymentProvider,
  getProviderLabel,
  getSubscriptionBillingSnapshot,
  cancelStripeAtPeriodEnd,
  revertStripeCancelAtPeriodEnd,
  cancelGooglePlayAtPeriodEnd,
  schedulePlatformCancellation,
  revertPlatformCancellation,
  cancelSubscriptionsImmediate,
  executeFullAccountDeletion,
};
