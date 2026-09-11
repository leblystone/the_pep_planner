/**
 * Shared Stripe → Firestore subscription sync (manual admin + daily reconciliation).
 */
const admin = require('firebase-admin');

function periodIso(unixSeconds) {
  if (!unixSeconds) return null;
  return new Date(unixSeconds * 1000).toISOString();
}

/**
 * Pick the Stripe subscription that best represents the user's access.
 */
function pickStripeSubscription(subscriptions) {
  if (!subscriptions?.length) return null;
  return (
    subscriptions.find((s) => s.cancel_at_period_end) ||
    subscriptions.find((s) => s.status === 'active' || s.status === 'trialing') ||
    subscriptions[0]
  );
}

/**
 * Build Firestore subscription payload from a Stripe subscription object.
 */
async function buildSubscriptionRecordFromStripe(stripe, stripeSubscription, customerId) {
  const subscriptionData = {
    status: stripeSubscription.status,
    stripeSubscriptionId: stripeSubscription.id,
    stripeCustomerId: customerId,
    paymentProvider: 'stripe',
    source: 'stripe',
    platform: 'stripe',
    currentPeriodStart: periodIso(stripeSubscription.current_period_start),
    currentPeriodEnd: periodIso(stripeSubscription.current_period_end),
    cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end === true,
    cancel_at_period_end: stripeSubscription.cancel_at_period_end === true,
    cancelAt: periodIso(stripeSubscription.cancel_at),
    created: periodIso(stripeSubscription.created),
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  };

  const item = stripeSubscription.items?.data?.[0];
  const price = item?.price;
  if (price) {
    subscriptionData.plan = price.nickname || price.product || 'Monthly Subscription';
    subscriptionData.interval = price.recurring?.interval || 'month';
    subscriptionData.amount = price.unit_amount;
    subscriptionData.currency = price.currency;
    subscriptionData.priceId = price.id;
  }

  if (stripeSubscription.latest_invoice) {
    try {
      const invoice = await stripe.invoices.retrieve(stripeSubscription.latest_invoice);
      subscriptionData.latestInvoiceId = invoice.id;
      subscriptionData.latestInvoiceStatus = invoice.status;
      subscriptionData.latestInvoiceAmountDue = invoice.amount_due;
    } catch (_) {
      /* non-fatal */
    }
  }

  return subscriptionData;
}

async function writeSubscriptionToFirestore(db, userId, subscriptionData) {
  const ts = admin.firestore.FieldValue.serverTimestamp();
  await db.collection('userSubscriptions').doc(userId).set(
    {
      subscription: subscriptionData,
      lastUpdated: ts,
      lastReconciledAt: ts,
    },
    { merge: true }
  );

  await db.collection('users').doc(userId).set(
    {
      stripeCustomerId: subscriptionData.stripeCustomerId,
      subscription: subscriptionData,
      updatedAt: ts,
    },
    { merge: true }
  );
}

function parsePeriodEnd(val) {
  if (!val) return null;
  if (val?.toDate) return val.toDate();
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * True when Firestore should be overwritten from Stripe.
 */
function subscriptionNeedsSync(firestoreSub, stripeSub) {
  if (!firestoreSub || !firestoreSub.stripeSubscriptionId) return true;
  if (firestoreSub.status !== stripeSub.status) return true;
  const fsCancel = firestoreSub.cancelAtPeriodEnd === true || firestoreSub.cancel_at_period_end === true;
  if (fsCancel !== (stripeSub.cancel_at_period_end === true)) return true;

  const fsEnd = parsePeriodEnd(firestoreSub.currentPeriodEnd);
  const stripeEnd = stripeSub.current_period_end
    ? new Date(stripeSub.current_period_end * 1000)
    : null;
  if (fsEnd && stripeEnd) {
    const fsDay = fsEnd.toISOString().slice(0, 10);
    const stripeDay = stripeEnd.toISOString().slice(0, 10);
    if (fsDay !== stripeDay) return true;
  } else if (!fsEnd && stripeEnd) return true;

  if (firestoreSub.stripeSubscriptionId !== stripeSub.id) return true;
  return false;
}

/**
 * Resolve Stripe customer id for a user.
 */
async function resolveStripeCustomerId(stripe, db, userId, hints = {}) {
  if (hints.stripeCustomerId) return hints.stripeCustomerId;

  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.exists ? userDoc.data() : {};
  if (userData.stripeCustomerId) return userData.stripeCustomerId;

  const subDoc = await db.collection('userSubscriptions').doc(userId).get();
  const sub = subDoc.exists ? subDoc.data()?.subscription : null;
  if (sub?.stripeCustomerId) return sub.stripeCustomerId;

  if (userData.email) {
    const customers = await stripe.customers.list({ email: userData.email, limit: 1 });
    if (customers.data[0]) return customers.data[0].id;
  }

  return null;
}

/**
 * Full Stripe → Firestore sync for one user (same as admin "Sync from Stripe").
 */
async function syncUserSubscriptionFromStripe(db, stripe, userId, hints = {}) {
  const logContext = hints.logContext || {};
  const subDoc = await db.collection('userSubscriptions').doc(userId).get();
  const beforeSub = subDoc.exists ? subDoc.data()?.subscription : null;

  const customerId = await resolveStripeCustomerId(stripe, db, userId, hints);
  if (!customerId) {
    return { success: false, userId, reason: 'no_stripe_customer' };
  }

  const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
  const stripeSubscription = pickStripeSubscription(list.data);
  if (!stripeSubscription) {
    return { success: false, userId, reason: 'no_stripe_subscription', customerId };
  }

  const subscriptionData = await buildSubscriptionRecordFromStripe(stripe, stripeSubscription, customerId);
  await writeSubscriptionToFirestore(db, userId, subscriptionData);

  let logged = false;
  if (logContext.runId) {
    const { logIfSubscriptionChanged } = require('./subscriptionReconciliationLog');
    logged = await logIfSubscriptionChanged(db, {
      runId: logContext.runId,
      userId,
      platform: 'stripe',
      beforeSub,
      afterSub: subscriptionData,
      trigger: logContext.trigger,
      runBy: logContext.runBy,
      changeType: hints.changeType,
      forceLog: hints.forceLog,
    });
  }

  return {
    success: true,
    userId,
    customerId,
    subscriptionId: stripeSubscription.id,
    status: stripeSubscription.status,
    cancelAtPeriodEnd: subscriptionData.cancelAtPeriodEnd,
    logged,
  };
}

/**
 * Collect user IDs that should be checked against Stripe daily.
 */
async function collectStripeLinkedUserIds(db) {
  const ids = new Set();

  const subSnap = await db.collection('userSubscriptions').get();
  for (const doc of subSnap.docs) {
    const sub = doc.data()?.subscription;
    if (
      sub?.stripeSubscriptionId ||
      sub?.stripeCustomerId ||
      sub?.paymentProvider === 'stripe' ||
      sub?.source === 'stripe' ||
      sub?.platform === 'stripe'
    ) {
      ids.add(doc.id);
    }
    if (!sub?.stripeSubscriptionId && !sub?.status && doc.data()?.stripeCustomerId) {
      ids.add(doc.id);
    }
  }

  try {
    const usersWithStripe = await db.collection('users').where('stripeCustomerId', '>', '').select().get();
    for (const doc of usersWithStripe.docs) ids.add(doc.id);
  } catch (_) {
    /* index may be missing; userSubscriptions scan still covers most accounts */
  }

  return Array.from(ids);
}

/**
 * Daily reconciliation: sync all Stripe-linked users when data is missing or drifted.
 */
async function runDailyStripeReconciliation(db, stripe, options = {}) {
  const maxUsers = options.maxUsers ?? 2000;
  const userIds = await collectStripeLinkedUserIds(db);
  const toProcess = userIds.slice(0, maxUsers);

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let driftDetected = 0;
  let logged = 0;
  const details = [];
  if (options.logContext) {
    options.logContext.onLogged = () => { logged += 1; };
  }

  for (const userId of toProcess) {
    try {
      const userDoc = await db.collection('users').doc(userId).get();
      const email = userDoc.exists ? (userDoc.data()?.email || userId) : userId;

      const subDoc = await db.collection('userSubscriptions').doc(userId).get();
      const firestoreSub = subDoc.exists ? subDoc.data()?.subscription : null;

      let stripeSub = null;
      const customerId = await resolveStripeCustomerId(stripe, db, userId);
      if (customerId) {
        const subId = firestoreSub?.stripeSubscriptionId;
        if (subId) {
          try {
            stripeSub = await stripe.subscriptions.retrieve(subId);
          } catch (e) {
            if (e.code !== 'resource_missing') throw e;
          }
        }
        if (!stripeSub) {
          const list = await stripe.subscriptions.list({ customer: customerId, status: 'all', limit: 10 });
          stripeSub = pickStripeSubscription(list.data);
        }
      }

      if (!stripeSub) {
        skipped++;
        continue;
      }

      const needsSync = subscriptionNeedsSync(firestoreSub, stripeSub);
      if (!needsSync) {
        skipped++;
        continue;
      }

      driftDetected++;
      const changeType = !firestoreSub?.stripeSubscriptionId ? 'missing_restored' : 'drift_corrected';
      const result = await syncUserSubscriptionFromStripe(db, stripe, userId, {
        stripeCustomerId: customerId,
        changeType,
        logContext: options.logContext,
      });
      if (result.success) {
        synced++;
        if (result.logged) options.logContext?.onLogged?.();
        details.push({ userId, email, outcome: 'synced', status: result.status || 'synced' });
      } else {
        failed++;
        details.push({ userId, email, outcome: 'failed', reason: result.reason });
      }
    } catch (err) {
      failed++;
      details.push({ userId, outcome: 'failed', reason: 'exception', error: err.message });
      console.warn(`Reconciliation failed for ${userId}:`, err.message);
    }
  }

  await db.collection('systemMetrics').doc('stripeReconciliation').set(
    {
      lastRunAt: admin.firestore.FieldValue.serverTimestamp(),
      usersScanned: toProcess.length,
      usersTotal: userIds.length,
      synced,
      skipped,
      failed,
      driftDetected,
      logged,
      truncated: userIds.length > maxUsers,
      runId: options.logContext?.runId || null,
    },
    { merge: true }
  );

  return {
    usersScanned: toProcess.length,
    synced,
    skipped,
    failed,
    driftDetected,
    logged,
    truncated: userIds.length > maxUsers,
    details,
  };
}

module.exports = {
  buildSubscriptionRecordFromStripe,
  writeSubscriptionToFirestore,
  syncUserSubscriptionFromStripe,
  collectStripeLinkedUserIds,
  runDailyStripeReconciliation,
  subscriptionNeedsSync,
};
