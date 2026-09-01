/**
 * TPP Push Notification System
 * Handles push notifications via Firebase Cloud Messaging (FCM)
 */

const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const emailService = require('./emailService');

/** Ops inboxes for push-delivery diagnostics (matches admin list in index.js). */
const ADMIN_PUSH_ALERT_EMAILS = [
  'lebrockmaldonado@gmail.com',
  'contact@thepepplanner.com',
  'thepepplanner@gmail.com',
];

const STALE_TOKEN_ADMIN_EMAIL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/** Internal meta keys — stripped from FCM payload; used only for admin delivery log. */
const PUSH_META_KEYS = new Set(['_trigger', '_prefType', '_slot', '_templateType', '_skipLog']);

const PUSH_DELIVERY_LOG = 'pushDeliveryLog';

/**
 * Admin delivery audit — UID + type + trigger + status only (no title/body/email).
 */
async function logPushDelivery({
  userId,
  prefType = null,
  templateType = null,
  trigger = 'unknown',
  slot = null,
  status = 'failed',
  error = null,
}) {
  try {
    await admin.firestore().collection(PUSH_DELIVERY_LOG).add({
      userId: String(userId || ''),
      prefType: prefType || null,
      templateType: templateType || null,
      trigger: String(trigger || 'unknown').slice(0, 120),
      slot: slot || null,
      status, // sent | failed | skipped
      error: error ? String(error).slice(0, 160) : null,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    logger.warn('push_delivery_log_failed', { userId, message: e.message });
  }
}

function extractPushMeta(data = {}) {
  const trigger = data._trigger || data.source || 'unknown';
  const prefType = data._prefType || null;
  const slot = data._slot || null;
  const templateType = data._templateType || data.templateType || null;
  const skipLog = data._skipLog === true;
  const cleanData = {};
  for (const [k, v] of Object.entries(data)) {
    if (PUSH_META_KEYS.has(k)) continue;
    cleanData[k] = v;
  }
  return { trigger, prefType, slot, templateType, skipLog, cleanData };
}


function staleTokenAdminEmailCooldownPassed(lastSent) {
  if (!lastSent) return true;
  try {
    const ms = typeof lastSent.toDate === 'function' ? lastSent.toDate().getTime() : new Date(lastSent).getTime();
    if (!Number.isFinite(ms)) return true;
    return Date.now() - ms >= STALE_TOKEN_ADMIN_EMAIL_COOLDOWN_MS;
  } catch {
    return true;
  }
}

/**
 * Email admins when a user's FCM token was invalid so push could not deliver.
 * Throttled per user so dev/prod flip-flops do not flood inboxes.
 */
async function maybeEmailAdminsStaleFcmToken({ userId, userEmail, errorCode, pushTitle, pushBody }) {
  const subject = `[TPP] Push failed — stale device token (${userId})`;
  const safeTitle = String(pushTitle || '').slice(0, 200);
  const safeBody = String(pushBody || '').slice(0, 500);
  const html = `
    <p><strong>A push notification did not reach the user</strong> because Firebase rejected the device token (it is expired or from another build).</p>
    <ul>
      <li><strong>User ID (Firestore):</strong> ${escapeHtml(userId)}</li>
      <li><strong>Account email (if known):</strong> ${escapeHtml(userEmail || '—')}</li>
      <li><strong>FCM error code:</strong> ${escapeHtml(errorCode)}</li>
      <li><strong>Notification title:</strong> ${escapeHtml(safeTitle)}</li>
      <li><strong>Notification body:</strong> ${escapeHtml(safeBody)}</li>
    </ul>
    <p>The bad token was removed from Firestore. After the user opens the app again, a fresh token should register and pushes should resume.</p>
    <p style="color:#666;font-size:12px;">You get at most one of these emails per user per 24 hours.</p>
  `;

  let anySent = false;
  for (const to of [...new Set(ADMIN_PUSH_ALERT_EMAILS)]) {
    try {
      const ok = await emailService.sendEmail(to, subject, html, {
        type: 'push_stale_token_alert',
        userId,
      });
      if (ok) anySent = true;
    } catch (e) {
      logger.error('fcm_stale_token_admin_email_failed', { to, userId, message: e.message });
    }
  }
  return anySent;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Send push notification via FCM
 */
async function sendPushNotification(userId, title, body, data = {}) {
  /** Set after user doc load — readable in catch for stale-token admin email (try block scopes const). */
  let cachedUserForStaleEmail = null;
  const meta = extractPushMeta(data || {});
  const fcmData = meta.cleanData;

  const finishLog = async (status, error = null) => {
    if (meta.skipLog) return;
    await logPushDelivery({
      userId,
      prefType: meta.prefType,
      templateType: meta.templateType || fcmData.tag || null,
      trigger: meta.trigger,
      slot: meta.slot,
      status,
      error,
    });
  };

  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      await finishLog('failed', 'User not found');
      throw new Error('User not found');
    }

    const userData = userDoc.data();
    cachedUserForStaleEmail = {
      email: userData.email || null,
      fcmLastStaleTokenAdminEmailAt: userData.fcmLastStaleTokenAdminEmailAt || null,
    };
    const fcmToken = userData.fcmToken;

    if (!fcmToken) {
      await finishLog('failed', 'No FCM token');
      return { success: false, error: 'No FCM token' };
    }

    const message = {
      token: fcmToken,
      notification: {
        title,
        body
      },
      data: {
        ...fcmData,
        timestamp: Date.now().toString(),
        click_action: fcmData.clickAction || fcmData.path || 'FLUTTER_NOTIFICATION_CLICK',
        path: fcmData.path || fcmData.appUrl?.replace(/^https?:\/\/[^\/]+/, '') || '/app/dashboard'
      },
      webpush: {
        notification: {
          title,
          body,
          icon: '/logo192.png',
          badge: '/logo192.png',
          tag: fcmData.tag || 'default',
          requireInteraction: false,
          data: {
            ...fcmData,
            url: fcmData.clickAction || fcmData.path || 'https://thepepplanner.com/app/dashboard',
            path: fcmData.path || fcmData.appUrl?.replace(/^https?:\/\/[^\/]+/, '') || '/app/dashboard'
          }
        },
        fcm_options: {
          link: fcmData.clickAction || fcmData.path || 'https://thepepplanner.com/app/dashboard'
        }
      },
      android: {
        notification: {
          icon: 'ic_stat_notification',
          color: '#A3B18A',
          sound: 'default'
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    await admin.messaging().send(message);
    await finishLog('sent');
    return { success: true };
  } catch (error) {
    console.error(`❌ Failed to send push notification to ${userId}:`, error);

    // If the token is stale or invalid, remove it from Firestore so the next
    // app launch will register a fresh token and notifications resume automatically.
    const staleTokenErrors = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
      'messaging/mismatched-credential',
    ];
    if (staleTokenErrors.includes(error.code)) {
      console.warn(`⚠️ Stale FCM token detected for ${userId} — clearing from Firestore so it re-registers on next app open`);
      // Structured log: filter Cloud Logging with text `fcm_stale_token_cleared` or jsonPayload.userId
      logger.warn('fcm_stale_token_cleared', {
        userId,
        errorCode: error.code,
        errorMessage: error.message
      });
      let clearedOk = false;
      try {
        await admin.firestore().collection('users').doc(userId).update({
          fcmToken: admin.firestore.FieldValue.delete(),
          pushToken: admin.firestore.FieldValue.delete(),
          fcmStaleTokenCleanups: admin.firestore.FieldValue.increment(1),
          fcmLastStaleTokenAt: admin.firestore.FieldValue.serverTimestamp(),
          fcmLastStaleTokenErrorCode: error.code
        });
        clearedOk = true;
        logger.info('fcm_stale_token_cleared_ok', { userId, errorCode: error.code });
      } catch (cleanupError) {
        console.error(`❌ Failed to clear stale token for ${userId}:`, cleanupError);
        logger.error('fcm_stale_token_clear_failed', {
          userId,
          errorCode: error.code,
          cleanupMessage: cleanupError.message
        });
      }

      if (clearedOk && staleTokenAdminEmailCooldownPassed(cachedUserForStaleEmail?.fcmLastStaleTokenAdminEmailAt)) {
        const emailed = await maybeEmailAdminsStaleFcmToken({
          userId,
          userEmail: (cachedUserForStaleEmail?.email || '').toLowerCase() || null,
          errorCode: error.code,
          pushTitle: title,
          pushBody: body,
        });
        if (emailed) {
          try {
            await admin.firestore().collection('users').doc(userId).update({
              fcmLastStaleTokenAdminEmailAt: admin.firestore.FieldValue.serverTimestamp(),
            });
          } catch (stampErr) {
            logger.warn('fcm_stale_token_admin_email_stamp_failed', { userId, message: stampErr.message });
          }
        }
      }

      await finishLog('failed', error.code || error.message);
      return {
        success: false,
        error: error.message,
        staleTokenCleared: clearedOk,
        staleTokenErrorCode: error.code
      };
    }

    // Avoid double-log when we already logged "User not found" above
    if (error.message !== 'User not found') {
      await finishLog('failed', error.message);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Check user notification preferences
 */
async function getUserNotificationSettings(userId) {
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return null;
    }

    const userData = userDoc.data();
    const notificationSettings = userData.notificationSettings || {};
    
    // For researchReminders, check legacy flag OR new AM/PM flags
    const researchRemindersEnabled = 
      notificationSettings.researchReminders === true ||
      notificationSettings.researchRemindersAM === true ||
      notificationSettings.researchRemindersPM === true;
    
    const settings = {
      push: notificationSettings.push === true || notificationSettings.pushEnabled === true, // Check both for backward compatibility
      billing: notificationSettings.billing === true,
      subscription:
        notificationSettings.subscription === true ||
        notificationSettings.billing === true,
      engagement: notificationSettings.engagement !== false,
      researchReminders: researchRemindersEnabled,
      researchRemindersAM: notificationSettings.researchRemindersAM === true,
      researchRemindersPM: notificationSettings.researchRemindersPM === true,
      groupBuys: notificationSettings.groupBuys === true,
      lowStockAlerts: notificationSettings.lowStockAlerts === true,
      orderStatusUpdates: notificationSettings.orderStatusUpdates === true,
      washoutReminders: notificationSettings.washoutReminders === true,
      cycleReminders: notificationSettings.cycleReminders === true
    };
    
    
    return settings;
  } catch (error) {
    console.error(`❌ Failed to get notification settings for ${userId}:`, error);
    return null;
  }
}

/**
 * Send push notification based on user preferences
 */
async function sendPushNotificationByType(userId, type, notificationData) {
  try {
    const settings = await getUserNotificationSettings(userId);
    if (!settings) {
      await logPushDelivery({
        userId,
        prefType: type,
        trigger: notificationData?.data?._trigger || notificationData?._trigger || `pref:${type}`,
        slot: notificationData?.data?._slot || notificationData?._slot || null,
        templateType: notificationData?.data?._templateType || notificationData?.tag || null,
        status: 'skipped',
        error: 'No settings found',
      });
      return { success: false, error: 'No settings found' };
    }

    // Check if push notifications are enabled and the specific type is enabled
    const typeEnabled =
      type === 'engagement' || type === 'subscription'
        ? settings[type] !== false
        : settings[type] === true;
    if (!settings.push || !typeEnabled) {
      await logPushDelivery({
        userId,
        prefType: type,
        trigger: notificationData?.data?._trigger || notificationData?._trigger || `pref:${type}`,
        slot: notificationData?.data?._slot || notificationData?._slot || null,
        templateType: notificationData?.data?._templateType || notificationData?.tag || null,
        status: 'skipped',
        error: 'Notifications disabled',
      });
      return { success: false, error: 'Notifications disabled' };
    }

    const { title, body, data = {}, appUrl, tag, path: dataPath, _trigger, _slot, _templateType } = notificationData;
    const mergedData = { ...data };
    if (appUrl) mergedData.appUrl = appUrl;
    if (tag) mergedData.tag = tag;
    if (dataPath) mergedData.path = dataPath;
    mergedData._prefType = type;
    if (_trigger) mergedData._trigger = _trigger;
    else if (!mergedData._trigger) mergedData._trigger = `pref:${type}`;
    if (_slot) mergedData._slot = _slot;
    if (_templateType) mergedData._templateType = _templateType;
    return await sendPushNotification(userId, title, body, mergedData);
    
  } catch (error) {
    console.error(`❌ Failed to send push notification to ${userId}:`, error);
    await logPushDelivery({
      userId,
      prefType: type,
      trigger: `pref:${type}`,
      status: 'failed',
      error: error.message,
    });
    return { success: false, error: error.message };
  }
}

/**
 * Send notification to multiple users
 */
async function sendBulkPushNotification(userIds, title, body, data = {}) {
  const results = [];
  
  for (const userId of userIds) {
    const result = await sendPushNotification(userId, title, body, data);
    results.push({ userId, ...result });
  }
  
  const successful = results.filter(r => r.success).length;
  
  return { success: true, results, successful, total: userIds.length };
}

/**
 * Send notification to all users with a specific setting enabled
 */
async function sendNotificationToUsersWithSetting(settingType, title, body, data = {}) {
  try {
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('notificationSettings.push', '==', true)
      .where(`notificationSettings.${settingType}`, '==', true)
      .get();

    const userIds = usersSnapshot.docs.map(doc => doc.id);
    
    if (userIds.length === 0) {
      return { success: true, sent: 0, total: 0 };
    }

    return await sendBulkPushNotification(userIds, title, body, data);
    
  } catch (error) {
    console.error(`❌ Failed to send notification to users with ${settingType}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Default notification templates (mirrors client-side defaults in src/utils/notificationTemplates.js)
 * Used as fallback when Firestore templates haven't been customized
 */
const DEFAULT_TEMPLATES = {
  lowStock: {
    title: "🔬 Stock Running Low!",
    body: "You're down to {count} vials of {peptideName}. Time to reorder?",
    actionUrl: "/app/stockpile"
  },
  orderStatusUpdate: {
    title: "📋 Order Update!",
    body: "Your {peptideName} order status changed to: {status}. {additionalMessage}",
    actionUrl: "/app/orders"
  },
  washoutReminder: {
    title: "⏰ Washout Period Reminder",
    body: "Your {protocolName} protocol ended {daysAgo} days ago. Time to start your washout period!",
    actionUrl: "/app/protocols"
  },
  cycleReminder: {
    title: "🔄 Cycle Coming Up!",
    body: "Your {protocolName} cycle is starting in {daysUntil} days! Ready to confirm it for your schedule?",
    actionUrl: "/app/protocols"
  },
  cycleEndReminder: {
    title: "🏁 Cycle Ending Soon!",
    body: "Your {protocolName} cycle ends in {daysUntil} days. Time to plan your next phase!",
    actionUrl: "/app/protocols"
  },
  researchReminderAM: {
    title: "☀️ Morning Research Reminder",
    body: "You have {peptideCount} peptide(s) and {supplementCount} supplement(s) scheduled for this morning.",
    actionUrl: "/app/dashboard"
  },
  researchReminderPM: {
    title: "🌙 Evening Research Reminder",
    body: "You have {peptideCount} peptide(s) and {supplementCount} supplement(s) scheduled for this evening.",
    actionUrl: "/app/dashboard"
  },
  researchReminderAMComplete: {
    title: "☀️ Morning research done",
    body: "Everything on your morning list is complete. Nice work!",
    actionUrl: "/app/dashboard"
  },
  researchReminderPMComplete: {
    title: "✅ Research is done for today",
    body: "Research is done for today. Great work!",
    actionUrl: "/app/dashboard"
  },
  titrationDoseChange: {
    title: "📈 Dose Change Today!",
    body: "Your {peptideName} dose changes today: {oldDose} → {newDose}. Check your protocol for details.",
    actionUrl: "/app/protocols"
  },
  orderCarrierPickup: {
    title: "📦 Pep order picked up!",
    body: "Your pep order has been picked up by the carrier! Tracking is live in Orders.",
    actionUrl: "/app/orders"
  },
  orderOnTheWay: {
    title: "🚚 Pep order on the way!",
    body: "Your {peptideName} shipment is in transit. Tap to track it.",
    actionUrl: "/app/orders"
  },
  orderOutForDelivery: {
    title: "🏃 Out for delivery!",
    body: "Your pep order is out for delivery today. Almost there!",
    actionUrl: "/app/orders"
  },
  orderDelivered: {
    title: "📬 Check your mailbox!",
    body: "Looks like the goodies have arrived. Don't forget to add them to your stockpile!",
    actionUrl: "/app/stockpile"
  },
  supportTicketReply: {
    title: "Pep Support💬",
    body: "New reply from the Pep Planner team! 🥼",
    actionUrl: "/app/support"
  },
  inactiveUser: {
    title: "Your research is still here",
    body: "Your protocols and data are waiting whenever you're ready to jump back in.",
    actionUrl: "/app/dashboard"
  },
  unreadAnnouncements: {
    title: "📣 Updates waiting for you",
    body: "You have {count} unread announcements from The Pep Planner.",
    actionUrl: "/app/announcements"
  },
  groupBuyReminder: {
    title: "👥 Group buy in 2 days!",
    body: "{peptideName} group buy closes in {daysUntil} days. Don't miss it!",
    actionUrl: "/app/orders"
  },
  researchPlusExpiringSoon: {
    title: "⏳ Research+ trial ending soon",
    body: "Your Research+ trial ends in {daysLeft} days. Subscribe to keep unlimited protocols and cloud sync.",
    actionUrl: "/app/account"
  },
  paymentFailedSoon: {
    title: "Update payment ASAP",
    body: "Your Research+ plan will end soon — we haven't received your subscription payment. Update payment to keep access.",
    actionUrl: "/app/account/subscription"
  },
  researchReminderCustom: {
    title: "🔔 {peptideName} Reminder",
    body: "Time for your scheduled research.",
    actionUrl: "/app/dashboard"
  }
};

/**
 * Load a notification template from Firestore, falling back to hardcoded defaults
 * @param {string} templateType - Template ID (e.g. 'lowStock', 'orderStatusUpdate')
 * @param {Object} variables - Key-value pairs to replace in title/body (e.g. { peptideName: 'BPC-157' })
 * @returns {Object} { title, body, actionUrl } with variables replaced
 */
async function getNotificationTemplate(templateType, variables = {}) {
  let template = DEFAULT_TEMPLATES[templateType] || { title: 'Notification', body: '' };

  try {
    const templateDoc = await admin.firestore()
      .collection('notificationTemplates')
      .doc(templateType)
      .get();

    if (templateDoc.exists) {
      const firestoreTemplate = templateDoc.data();
      template = {
        title: firestoreTemplate.title || template.title,
        body: firestoreTemplate.body || template.body,
        actionUrl: firestoreTemplate.actionUrl || template.actionUrl
      };
    }
  } catch (error) {
    console.warn(`⚠️ Could not load template '${templateType}' from Firestore, using default:`, error.message);
  }

  // Replace variables in title and body
  let processedTitle = template.title || '';
  let processedBody = template.body || '';

  Object.keys(variables).forEach(key => {
    const placeholder = new RegExp(`\\{${key}\\}`, 'g');
    processedTitle = processedTitle.replace(placeholder, String(variables[key] ?? ''));
    processedBody = processedBody.replace(placeholder, String(variables[key] ?? ''));
  });

  return {
    title: processedTitle,
    body: processedBody,
    actionUrl: template.actionUrl || '/app/dashboard'
  };
}

/**
 * Push a support-ticket alert to ONE admin phone only.
 * Hardcoded to lebrockmaldonado@gmail.com — never broadcast to users or other admins.
 * Deep-links into the lightweight mobile support inbox.
 */
const ADMIN_SUPPORT_ALERT_EMAIL = 'lebrockmaldonado@gmail.com';

async function sendAdminSupportTicketAlertPush({
  ticketId,
  ticketNumber = '',
  subject = '',
  preview = '',
  ticketType = '',
  kind = 'new', // 'new' | 'reply'
} = {}) {
  if (!ticketId) {
    return { success: false, error: 'ticketId required' };
  }

  try {
    const snap = await admin.firestore()
      .collection('users')
      .where('email', '==', ADMIN_SUPPORT_ALERT_EMAIL)
      .limit(1)
      .get();

    if (snap.empty) {
      logger.warn(`Admin support alert: no users doc for ${ADMIN_SUPPORT_ALERT_EMAIL}`);
      return { success: false, error: 'admin user not found' };
    }

    const userId = snap.docs[0].id;
    const path = `/admin-support?ticketId=${encodeURIComponent(ticketId)}`;
    const url = `https://thepepplanner.com${path}`;
    const numberLabel = ticketNumber ? ` ${ticketNumber}` : '';

    let title;
    if (kind === 'reply') {
      title = `💬 Ticket reply${numberLabel}`;
    } else {
      const type = String(ticketType || '').toLowerCase();
      if (type === 'bug') {
        title = `🐛 New Bug Alert${numberLabel}`;
      } else if (type === 'suggestion' || type === 'feature' || type === 'feedback') {
        title = `💡 New Feature Request${numberLabel}`;
      } else {
        title = `🎫 New Support Ticket${numberLabel}`;
      }
    }
    const body = String(preview || subject || 'Open support inbox to reply').slice(0, 140);

    const result = await sendPushNotification(userId, title, body, {
      path,
      clickAction: url,
      url,
      ticketId: String(ticketId),
      ticketNumber: String(ticketNumber || ''),
      tag: `support-ticket-${ticketId}`,
      source: 'admin-support-alert',
    });

    logger.info(`Admin support alert push → ${ADMIN_SUPPORT_ALERT_EMAIL} (${kind}):`, result);
    return result;
  } catch (error) {
    logger.warn(`Admin support alert push failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendPushNotification,
  sendPushNotificationByType,
  sendBulkPushNotification,
  sendNotificationToUsersWithSetting,
  getUserNotificationSettings,
  getNotificationTemplate,
  sendAdminSupportTicketAlertPush,
  logPushDelivery,
  ADMIN_SUPPORT_ALERT_EMAIL,
  DEFAULT_TEMPLATES,
  PUSH_DELIVERY_LOG,
};
