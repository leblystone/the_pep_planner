// src/utils/notificationTemplates.js
import { loadSettings } from './settingsHelpers';
import { db } from '../config/firebase';
import { doc, setDoc, collection, getDocs } from 'firebase/firestore';

/**
 * Templates editable from the admin panel. Most are read server-side by Firebase
 * Functions (FCM) — edits apply to all users on next send. `notificationsEnabledConfirmation`
 * is the one exception: it's fired directly by the client (local/PWA notification) the
 * moment a user grants notification permission, but is still admin-editable — the client
 * reads the live Firestore doc at send time, same pattern as the server-side templates.
 */
export const SERVER_PUSH_TEMPLATE_IDS = new Set([
  'notificationsEnabledConfirmation',
  'lowStock',
  'orderStatusUpdate',
  'orderCarrierPickup',
  'orderOnTheWay',
  'orderOutForDelivery',
  'orderDelivered',
  'washoutReminder',
  'cycleReminder',
  'cycleEndReminder',
  'researchReminderAM',
  'researchReminderPM',
  'researchReminderAMComplete',
  'researchReminderPMComplete',
  'researchReminderCustom',
  'titrationDoseChange',
  'inactiveUser',
  'unreadAnnouncements',
  'groupBuyReminder',
  'supportTicketReply',
  'researchPlusExpiringSoon',
  'paymentFailedSoon',
]);

/** Legacy / email-only template IDs (removed from push admin; ignored if still in Firestore). */
export const DEPRECATED_PUSH_TEMPLATE_IDS = new Set([
  'orderArrived',
  'researchReminder',
  'trialEnding',
  'trialExtensionOffer',
  'freePlanActive',
  'researchPlusWinback',
]);

/** All push/in-app templates — mirrored in functions/pushNotifications.js */
const DEFAULT_TEMPLATES = {
  notificationsEnabledConfirmation: {
    title: '🔔 Loud & Clear!',
    body: "Notifications are ON and working perfectly. You're all set!",
    actionText: 'Notification Settings',
    actionUrl: '/app/settings/notifications',
  },
  lowStock: {
    title: '🔬 Stock Running Low!',
    body: "You're down to {count} vials of {peptideName}. Time to reorder?",
    actionText: 'Check Stockpile',
    actionUrl: '/app/stockpile',
  },
  orderStatusUpdate: {
    title: '📋 Order Update!',
    body: 'Your {peptideName} order status changed to: {status}. {additionalMessage}',
    actionText: 'View Order',
    actionUrl: '/app/orders',
  },
  orderCarrierPickup: {
    title: '📦 Pep order picked up!',
    body: 'Your pep order has been picked up by the carrier! Tracking is live in Orders.',
    actionText: 'Track Order',
    actionUrl: '/app/orders',
  },
  orderOnTheWay: {
    title: '🚚 Pep order on the way!',
    body: 'Your {peptideName} shipment is in transit. Tap to track it.',
    actionText: 'Track Order',
    actionUrl: '/app/orders',
  },
  orderOutForDelivery: {
    title: '🏃 Out for delivery!',
    body: 'Your pep order is out for delivery today. Almost there!',
    actionText: 'Track Order',
    actionUrl: '/app/orders',
  },
  orderDelivered: {
    title: '📬 Check your mailbox!',
    body: "Looks like the goodies have arrived. Don't forget to add them to your stockpile!",
    actionText: 'Update Stockpile',
    actionUrl: '/app/stockpile',
  },
  washoutReminder: {
    title: '⏰ Washout Period Reminder',
    body: 'Your {protocolName} protocol ended {daysAgo} days ago. Time to start your washout period!',
    actionText: 'View Protocol',
    actionUrl: '/app/protocols',
  },
  cycleReminder: {
    title: '🔄 Cycle Coming Up!',
    body: 'Your {protocolName} cycle is starting in {daysUntil} days! Ready to confirm it for your schedule?',
    actionText: 'Confirm Cycle',
    actionUrl: '/app/protocols',
  },
  cycleEndReminder: {
    title: '🏁 Cycle Ending Soon!',
    body: 'Your {protocolName} cycle ends in {daysUntil} days. Time to plan your next phase!',
    actionText: 'View Protocol',
    actionUrl: '/app/protocols',
  },
  researchReminderAM: {
    title: '☀️ Morning Research Reminder',
    body: 'Morning research: {peptideList}',
    actionText: 'View Schedule',
    actionUrl: '/app/dashboard',
  },
  researchReminderPM: {
    title: '🌙 Evening Research Reminder',
    body: 'Evening research: {peptideList}',
    actionText: 'View Schedule',
    actionUrl: '/app/dashboard',
  },
  researchReminderAMComplete: {
    title: '☀️ Morning research done',
    body: 'Everything on your morning list is complete. Nice work!',
    actionText: 'View Schedule',
    actionUrl: '/app/dashboard',
  },
  researchReminderPMComplete: {
    title: '✅ Research is done for today',
    body: 'Research is done for today. Great work!',
    actionText: 'View Schedule',
    actionUrl: '/app/dashboard',
  },
  researchReminderCustom: {
    title: '🔔 {peptideName} Reminder',
    body: 'Time for your scheduled research.',
    actionText: 'View Schedule',
    actionUrl: '/app/dashboard',
  },
  titrationDoseChange: {
    title: '📈 Dose Change Today!',
    body: 'Your {peptideName} dose changes today: {oldDose} → {newDose}. Check your protocol for details.',
    actionText: 'View Protocol',
    actionUrl: '/app/protocols',
  },
  inactiveUser: {
    title: 'Your research is still here',
    body: "Your protocols and data are waiting whenever you're ready to jump back in.",
    actionText: 'Open Dashboard',
    actionUrl: '/app/dashboard',
  },
  unreadAnnouncements: {
    title: '📣 Updates waiting for you',
    body: 'You have {count} unread announcements from The Pep Planner.',
    actionText: 'Read Updates',
    actionUrl: '/app/announcements',
  },
  groupBuyReminder: {
    title: '👥 Group buy in 2 days!',
    body: "{peptideName} group buy closes in {daysUntil} days. Don't miss it!",
    actionText: 'View Group Buy',
    actionUrl: '/app/orders',
  },
  supportTicketReply: {
    title: '💬 Support has responded!',
    body: 'You have a new reply on your support request{subjectSuffix}. Tap to open the conversation.',
    actionText: 'Open Support',
    actionUrl: '/app/support',
  },
  researchPlusExpiringSoon: {
    title: '⏳ Research+ trial ending soon',
    body: 'Your Research+ trial ends in {daysLeft} days. Subscribe to keep unlimited protocols and cloud sync.',
    actionText: 'Subscribe',
    actionUrl: '/app/account/subscription',
  },
  paymentFailedSoon: {
    title: 'Update payment ASAP',
    body: "Your Research+ plan will end soon — we haven't received your subscription payment. Update payment to keep access.",
    actionText: 'Update Payment',
    actionUrl: '/app/account/subscription',
  },
};

export function getNotificationTemplate(type, variables = {}) {
  try {
    const customTemplates = JSON.parse(localStorage.getItem('tpp_notification_templates') || '{}');
    const template = customTemplates[type] || DEFAULT_TEMPLATES[type];

    if (!template) {
      console.warn(`No notification template found for type: ${type}`);
      return DEFAULT_TEMPLATES.researchReminderAM;
    }

    let processedTemplate = { ...template };

    Object.keys(variables).forEach((key) => {
      const placeholder = `{${key}}`;
      processedTemplate.title = processedTemplate.title?.replace(new RegExp(placeholder, 'g'), variables[key] || '');
      processedTemplate.body = processedTemplate.body?.replace(new RegExp(placeholder, 'g'), variables[key] || '');
    });

    return processedTemplate;
  } catch (error) {
    console.error('Error loading notification template:', error);
    return DEFAULT_TEMPLATES.researchReminderAM;
  }
}

export function filterToServerPushTemplates(templates) {
  return Object.fromEntries(
    Object.entries(templates || {}).filter(([id]) => SERVER_PUSH_TEMPLATE_IDS.has(id))
  );
}

export async function saveNotificationTemplate(type, template) {
  if (!SERVER_PUSH_TEMPLATE_IDS.has(type)) {
    console.warn(`Refusing to save non-FCM template: ${type}`);
    return { success: false, firestore: false, error: `Unknown template: ${type}` };
  }
  try {
    const customTemplates = JSON.parse(localStorage.getItem('tpp_notification_templates') || '{}');
    customTemplates[type] = template;
    localStorage.setItem('tpp_notification_templates', JSON.stringify(customTemplates));

    try {
      await setDoc(
        doc(db, 'notificationTemplates', type),
        {
          title: template.title || '',
          body: template.body || '',
          actionText: template.actionText || '',
          actionUrl: template.actionUrl || '',
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
      return { success: true, firestore: true };
    } catch (firestoreError) {
      console.warn('⚠️ Could not save notification template to Firestore:', firestoreError);
      return {
        success: true,
        firestore: false,
        error: firestoreError?.message || 'Firestore write failed',
      };
    }
  } catch (error) {
    console.error('Error saving notification template:', error);
    return { success: false, firestore: false, error: error.message };
  }
}

export function getAllTemplates() {
  try {
    const customTemplates = JSON.parse(localStorage.getItem('tpp_notification_templates') || '{}');
    return filterToServerPushTemplates({ ...DEFAULT_TEMPLATES, ...customTemplates });
  } catch (error) {
    console.error('Error loading all templates:', error);
    return { ...DEFAULT_TEMPLATES };
  }
}

/** Load production templates from Firestore (admin panel source of truth). */
export async function loadAllTemplatesFromFirestore() {
  const merged = { ...DEFAULT_TEMPLATES };
  try {
    const snap = await getDocs(collection(db, 'notificationTemplates'));
    snap.forEach((d) => {
      const data = d.data();
      if (data?.title || data?.body) {
        merged[d.id] = {
          title: data.title ?? merged[d.id]?.title,
          body: data.body ?? merged[d.id]?.body,
          actionText: data.actionText ?? merged[d.id]?.actionText,
          actionUrl: data.actionUrl ?? merged[d.id]?.actionUrl,
        };
      }
    });
  } catch (e) {
    console.warn('Could not load notification templates from Firestore:', e);
  }
  try {
    const local = JSON.parse(localStorage.getItem('tpp_notification_templates') || '{}');
    Object.assign(merged, local);
  } catch (_) {
    /* ignore */
  }
  return filterToServerPushTemplates(merged);
}

export function resetTemplatesToDefault() {
  try {
    localStorage.removeItem('tpp_notification_templates');
    return true;
  } catch (error) {
    console.error('Error resetting templates:', error);
    return false;
  }
}

export function isNotificationEnabled(type) {
  try {
    const settings = loadSettings();
    return settings?.notifications?.[type] !== false;
  } catch (error) {
    console.error('Error checking notification setting:', error);
    return true;
  }
}

export function getNotificationVariables(type, data = {}) {
  switch (type) {
    case 'lowStock':
      return { count: data.count || 0, peptideName: data.peptideName || 'your peptide' };
    case 'orderStatusUpdate':
    case 'orderCarrierPickup':
    case 'orderOnTheWay':
    case 'orderOutForDelivery':
    case 'orderDelivered':
      return {
        peptideName: data.peptideName || 'your peptide',
        status: data.status || 'unknown',
        additionalMessage: data.additionalMessage || '',
        carrier: data.carrier || 'the carrier',
      };
    case 'washoutReminder':
      return { protocolName: data.protocolName || 'your protocol', daysAgo: data.daysAgo || 0 };
    case 'cycleReminder':
    case 'cycleEndReminder':
      return { protocolName: data.protocolName || 'your protocol', daysUntil: data.daysUntil || 0 };
    case 'researchPlusExpiringSoon':
      return { daysLeft: data.daysLeft || 7 };
    case 'unreadAnnouncements':
      return { count: data.count || 5 };
    case 'groupBuyReminder':
      return { peptideName: data.peptideName || 'Group buy', daysUntil: data.daysUntil || 2 };
    case 'supportTicketReply':
      return {
        subject: data.subject || 'Support',
        subjectSuffix: data.subjectSuffix || (data.subject ? `: ${data.subject}` : ''),
      };
    default:
      return data;
  }
}

export { DEFAULT_TEMPLATES };
