/**
 * Engagement & lifecycle push notifications (FCM).
 * Cron schedulers + helpers for orders, subscriptions, re-engagement.
 */

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const pushNotifications = require('./pushNotifications');

const INACTIVE_DAYS = 14;
const UNREAD_ANNOUNCEMENTS_THRESHOLD = 5;
const GROUP_BUY_DAYS_BEFORE = 2;

/** EasyPost raw status → push template id (granular tracking). */
function easypostRawToPushTemplate(rawStatus, previousRaw) {
  const s = (rawStatus || '').toLowerCase();
  const prev = (previousRaw || '').toLowerCase();
  if (s === 'delivered') return 'orderDelivered';
  if (s === 'out_for_delivery') return 'orderOutForDelivery';
  if (s === 'in_transit') {
    if (prev === 'pre_transit' || prev === 'unknown' || prev === '' || !prev) return 'orderCarrierPickup';
    return 'orderOnTheWay';
  }
  if (s === 'pre_transit') return 'orderCarrierPickup';
  return null;
}

/** Manual order status string → template id. */
function manualStatusToPushTemplate(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('deliver')) return 'orderDelivered';
  if (s.includes('out for delivery')) return 'orderOutForDelivery';
  if (s.includes('carrier') || s.includes('picked up')) return 'orderCarrierPickup';
  if (s.includes('ship') || s.includes('transit') || s.includes('way')) return 'orderOnTheWay';
  if (s.includes('arriv')) return 'orderDelivered';
  return 'orderStatusUpdate';
}

async function wasNotificationSent(userId, type, dedupeKey = null) {
  const db = admin.firestore();
  let q = db.collection('notificationHistory').where('userId', '==', userId).where('type', '==', type);
  if (dedupeKey != null) {
    q = q.where('dedupeKey', '==', String(dedupeKey));
  }
  const snap = await q.limit(1).get();
  return !snap.empty;
}

async function recordNotificationSent(userId, type, extra = {}) {
  await admin.firestore().collection('notificationHistory').add({
    userId,
    type,
    sentAt: admin.firestore.FieldValue.serverTimestamp(),
    ...extra,
  });
}

async function sendTemplatedPush(userId, prefType, templateId, variables, dataExtra = {}) {
  const template = await pushNotifications.getNotificationTemplate(templateId, variables);
  const notificationData = {
    title: template.title,
    body: template.body,
    path: template.actionUrl || dataExtra.path || '/app/dashboard',
    clickAction: `https://thepepplanner.com${template.actionUrl || dataExtra.path || '/app/dashboard'}`,
    appUrl: template.actionUrl || dataExtra.path || '/app/dashboard',
    templateType: templateId,
    _trigger: dataExtra._trigger || `engine:${templateId}`,
    _templateType: templateId,
    ...dataExtra,
  };
  return pushNotifications.sendPushNotificationByType(userId, prefType, notificationData);
}

/**
 * Send order tracking push (deduped by template + orderId).
 */
async function sendOrderTrackingPush(userId, order, templateId, rawStatus = null) {
  const orderId = order.id || order.orderId;
  const dedupeKey = `${templateId}_${orderId}`;
  if (await wasNotificationSent(userId, templateId, dedupeKey)) {
    return { success: false, skipped: true, reason: 'dedupe' };
  }
  const peptideName =
    order.peptideName || order.name || order.items?.[0]?.name || 'your pep order';
  const result = await sendTemplatedPush(
    userId,
    'orderStatusUpdates',
    templateId,
    { peptideName, status: order.status || '', carrier: order.carrier || 'the carrier' },
    { orderId, trackingPhase: templateId, easypostStatus: rawStatus, path: '/app/orders' }
  );
  if (result.success) {
    await recordNotificationSent(userId, templateId, { dedupeKey, orderId });
  }
  return result;
}

/**
 * Called from EasyPost webhook after order status update.
 */
async function handleEasyPostTrackingPush(userId, order, rawStatus, previousRaw) {
  const templateId = easypostRawToPushTemplate(rawStatus, previousRaw);
  if (!templateId) return null;
  return sendOrderTrackingPush(userId, order, templateId, rawStatus);
}

/**
 * Diff orders array on userData doc update — manual status changes.
 */
function diffOrderChanges(beforeOrders = [], afterOrders = []) {
  const beforeMap = new Map((beforeOrders || []).map((o) => [o.id, o]));
  const changes = [];
  for (const after of afterOrders || []) {
    if (!after?.id) continue;
    const before = beforeMap.get(after.id);
    if (!before) continue;
    if ((before.status || '') !== (after.status || '')) {
      changes.push({ before, after });
    }
  }
  return changes;
}

exports.onUserDataOrdersUpdated = onDocumentUpdated('userData/{userId}', async (event) => {
  const before = event.data?.before?.data() || {};
  const after = event.data?.after?.data() || {};
  const userId = event.params.userId;

  const orderChanges = diffOrderChanges(before.orders, after.orders);
  for (const { before: b, after: a } of orderChanges) {
    if (a.statusSource === 'tracking') continue;
    const templateId = manualStatusToPushTemplate(a.status);
    await sendOrderTrackingPush(userId, a, templateId);
  }
  return null;
});

/** Inactive users — no app activity for INACTIVE_DAYS. */
exports.scheduledInactiveUserPush = onSchedule(
  { schedule: '0 11 * * *', timeZone: 'UTC' },
  async () => {
    const db = admin.firestore();
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - INACTIVE_DAYS);

    const usersSnap = await db.collection('users').get();
    let sent = 0;

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const user = userDoc.data();
      const lastActive = user.lastActive?.toDate?.() || (user.lastActive ? new Date(user.lastActive) : null);
      if (!lastActive || lastActive >= cutoff) continue;

      const type = 'inactiveUser';
      // Dedup within a 60-day window — allows re-sending if user goes inactive again later
      const dedupeKey = `inactiveUser_${new Date().toISOString().slice(0, 7)}`; // YYYY-MM per month
      if (await wasNotificationSent(userId, type, dedupeKey)) continue;

      const result = await sendTemplatedPush(userId, 'engagement', type, {}, {
        path: '/app/dashboard',
      });
      if (result.success) {
        await recordNotificationSent(userId, type, { dedupeKey });
        sent++;
      }
    }
    logger.info(`inactive_user_push: sent ${sent}`);
  }
);

/** 5+ unread announcements (Firestore announcements vs user engagement timestamp). */
exports.scheduledUnreadAnnouncementsPush = onSchedule(
  { schedule: '0 12 * * *', timeZone: 'UTC' },
  async () => {
    const db = admin.firestore();
    const announcementsSnap = await db.collection('announcements').orderBy('date', 'desc').get();
    if (announcementsSnap.empty) return;

    const announcements = announcementsSnap.docs.map((d) => ({
      id: d.id,
      date: d.data().date ? new Date(d.data().date).getTime() : 0,
    }));

    const usersSnap = await db.collection('users').get();
    let sent = 0;

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const seenAt =
        userDoc.data().engagement?.announcementsLastSeenAt?.toDate?.()?.getTime() ||
        (userDoc.data().engagement?.announcementsLastSeenAt
          ? new Date(userDoc.data().engagement.announcementsLastSeenAt).getTime()
          : 0);

      const unread = announcements.filter((a) => a.date > seenAt).length;
      if (unread < UNREAD_ANNOUNCEMENTS_THRESHOLD) continue;

      const type = 'unreadAnnouncements';
      if (await wasNotificationSent(userId, type)) continue;

      const result = await sendTemplatedPush(
        userId,
        'engagement',
        type,
        { count: unread },
        { path: '/app/announcements' }
      );
      if (result.success) {
        await recordNotificationSent(userId, type, { unreadCount: unread });
        sent++;
      }
    }
    logger.info(`unread_announcements_push: sent ${sent}`);
  }
);

/** Group buy — T-2 days before closeDate (or legacy date). */
exports.scheduledGroupBuyReminder = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'UTC' },
  async () => {
    const db = admin.firestore();
    const target = new Date();
    target.setDate(target.getDate() + GROUP_BUY_DAYS_BEFORE);
    const targetKey = target.toISOString().slice(0, 10);

    const userDataSnap = await db.collection('userData').get();
    let sent = 0;

    for (const docSnap of userDataSnap.docs) {
      const userId = docSnap.id;
      const buys = docSnap.data().scheduledBuys || [];
      for (const buy of buys) {
        const eventDate = buy.closeDate || buy.date || buy.openDate;
        if (!eventDate) continue;
        const dateKey = String(eventDate).slice(0, 10);
        if (dateKey !== targetKey) continue;

        const dedupeKey = `group_buy_t2_${buy.id || dateKey}`;
        const type = 'groupBuyReminder';
        if (await wasNotificationSent(userId, type, dedupeKey)) continue;

        const peptideName = buy.item || buy.peptide || buy.peptideName || buy.name || 'Group buy';
        const result = await sendTemplatedPush(
          userId,
          'groupBuys',
          type,
          { peptideName, daysUntil: GROUP_BUY_DAYS_BEFORE },
          { path: '/app/orders', buyId: buy.id }
        );
        if (result.success) {
          await recordNotificationSent(userId, type, { dedupeKey });
          sent++;
        }
      }
    }
    logger.info(`group_buy_t2_push: sent ${sent}`);
  }
);

function getSubscriptionState(user, subDoc) {
  const sub = subDoc?.subscription || subDoc || user.subscription || {};
  const status = (sub.status || '').toLowerCase();
  const interval = (sub.interval || '').toLowerCase();
  const periodEnd = sub.currentPeriodEnd
    ? sub.currentPeriodEnd.toDate
      ? sub.currentPeriodEnd.toDate()
      : new Date(sub.currentPeriodEnd)
    : null;
  const isTrialing = ['trialing', 'trial'].includes(status) || interval === 'trial';
  const isPaid =
    ['active', 'past_due'].includes(status) &&
    !isTrialing &&
    (sub.plan === 'research_plus' || sub.plan === 'Research+' || sub.planId?.includes?.('research'));
  const isFree = !isTrialing && !isPaid;
  return { sub, status, periodEnd, isTrialing, isPaid, isFree };
}

/** Subscription lifecycle pushes — trial-focused only.
 *  - researchPlusExpiringSoon: push for trial users at 3 days left (paid → email only)
 *  - freePlanActive / researchPlusWinback: email only (no push — less naggy)
 *  Payment-failed stays on push via sendPaymentFailedPush.
 */
exports.scheduledSubscriptionLifecyclePush = onSchedule(
  { schedule: '0 10 * * *', timeZone: 'UTC' },
  async () => {
    const db = admin.firestore();
    const now = new Date();
    const usersSnap = await db.collection('users').get();
    let sent = 0;

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const user = userDoc.data();
      let subDoc = null;
      try {
        const s = await db.collection('userSubscriptions').doc(userId).get();
        if (s.exists) subDoc = s.data();
      } catch (_) {
        /* ignore */
      }

      const { periodEnd, isTrialing } = getSubscriptionState(user, subDoc);

      // Trial only — paid "ending soon" stays email-side so we don't nag subscribers.
      if (periodEnd && isTrialing) {
        const daysLeft = Math.ceil((periodEnd - now) / 86400000);
        if (daysLeft === 3) {
          const type = 'researchPlusExpiringSoon';
          if (!(await wasNotificationSent(userId, type))) {
            const result = await sendTemplatedPush(userId, 'subscription', type, { daysLeft: 3 }, {
              path: '/app/account',
            });
            if (result.success) {
              await recordNotificationSent(userId, type);
              sent++;
            }
          }
        }
      }
    }
    logger.info(`subscription_lifecycle_push: sent ${sent} (trial expiring only; free/winback email-only)`);
  }
);

exports.sendSupportTicketReplyPush = async (userId, ticketSubject, ticketId) => {
  if (!userId) return { success: false, error: 'no userId' };
  const type = 'supportTicketReply';
  const subject = ticketSubject || 'Support';
  const subjectSuffix = ticketSubject ? `: ${ticketSubject}` : '';
  return sendTemplatedPush(
    userId,
    'engagement',
    type,
    { subject, subjectSuffix },
    { path: '/app/support', ticketId, templateType: type }
  );
};

exports.sendPaymentFailedPush = async (userId) => {
  if (!userId) return { success: false, error: 'no userId' };
  const type = 'paymentFailedSoon';
  if (await wasNotificationSent(userId, type)) {
    return { success: false, skipped: true };
  }
  const result = await sendTemplatedPush(userId, 'subscription', type, {}, {
    path: '/app/account/subscription',
  });
  if (result.success) await recordNotificationSent(userId, type);
  return result;
};

module.exports.handleEasyPostTrackingPush = handleEasyPostTrackingPush;
module.exports.sendOrderTrackingPush = sendOrderTrackingPush;
module.exports.easypostRawToPushTemplate = easypostRawToPushTemplate;
