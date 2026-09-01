/**
 * Admin manual email send — real customer data, production Resend path.
 */
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { ensureAdmin } = require('./adminAuth');
const emailService = require('./emailService');
const emailTemplates = require('./emailTemplates');
const shopEmails = require('./shopEmails');
const {
  fetchWeeklyPayloadForUserId,
} = require('./weeklyResearchSummary');

const BLOCKED_TEMPLATES = new Set(['squarespaceActivation']);

const SHOP_TEMPLATE_KEYS = new Set([
  'shopOrderConfirmation',
  'shopOrderOwner',
  'shopDigitalDownload',
  'shopOrderShipped',
  'shopOrderDelivered',
  'shopAbandonedCart',
  'shopReviewRequest',
  'shopReviewInvite',
]);

const BILLING_KEYS = new Set([
  'subscription',
  'paymentFailed',
  'paymentSuccessful',
  'subscriptionCancelled',
  'renewalReminder',
  'trialEnding',
  'trialExtension',
]);

const TOKEN_KEYS = new Set([
  'verification',
  'passwordReset',
  'magicLink',
  'unregisteredMagicLink',
]);

const EMAIL_CHANGE_KEYS = new Set([
  'emailChangeNotification',
  'emailChangeVerification',
  'emailChangeVerificationWithLink',
]);

function normalizeEmail(email) {
  return email ? String(email).trim().toLowerCase() : '';
}

function manualLogOptions(recipient, templateKey, adminUid) {
  return {
    logToHistory: true,
    sentBy: 'admin',
    isManual: true,
    sentByAdmin: adminUid || null,
    userId: recipient.userId || null,
    recipientName: recipient.displayName || null,
    templateKey,
    type: templateKey,
  };
}

function formatMoney(amount, currency = 'USD') {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  const n = Number(amount);
  const sym = currency === 'USD' ? '$' : '';
  return `${sym}${n.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return null;
  try {
    const d = value.toDate ? value.toDate() : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (_) {
    return null;
  }
}

function normalizeProvider(raw) {
  const p = String(raw || 'stripe').toLowerCase().replace(/\s/g, '');
  if (p === 'google' || p === 'google_play' || p === 'googleplay') return 'google_play';
  if (p === 'apple' || p === 'app_store' || p === 'appstore') return 'apple';
  return 'stripe';
}

function planLabelWithProvider(planName, provider) {
  const base = planName || 'Research Subscription';
  if (provider === 'google_play') return `${base} (Google Play)`;
  if (provider === 'apple') return `${base} (App Store)`;
  return base;
}

async function findUserIdByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const snap = await db.collection('users').where('email', '==', normalized).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
}

async function resolveRecipient(db, { userId, userEmail }) {
  if (userId) {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      throw new HttpsError('not-found', 'User not found for the provided UID');
    }
    const data = userDoc.data();
    const email = normalizeEmail(data.email) || normalizeEmail(userEmail);
    if (!email) {
      throw new HttpsError('failed-precondition', 'User has no email on file');
    }
    return {
      userId,
      email,
      displayName: data.displayName || email.split('@')[0],
      userDoc: data,
    };
  }

  const email = normalizeEmail(userEmail);
  if (!email) {
    throw new HttpsError('invalid-argument', 'userId or userEmail is required');
  }

  const resolvedId = await findUserIdByEmail(db, email);
  if (resolvedId) {
    const userDoc = await db.collection('users').doc(resolvedId).get();
    const data = userDoc.data() || {};
    return {
      userId: resolvedId,
      email,
      displayName: data.displayName || email.split('@')[0],
      userDoc: data,
    };
  }

  return {
    userId: null,
    email,
    displayName: email.split('@')[0],
    userDoc: null,
  };
}

async function loadSubscription(db, userId) {
  if (!userId) return null;
  const snap = await db.collection('userSubscriptions').doc(userId).get();
  if (!snap.exists) return null;
  const data = snap.data();
  return data.subscription || data;
}

function subscriptionBillingFields(sub, overrides = {}) {
  const provider = normalizeProvider(sub?.paymentProvider);
  const planName = planLabelWithProvider(
    overrides.planName || sub?.planName || sub?.plan || 'Research Subscription',
    provider
  );
  const interval = overrides.interval || sub?.interval || 'month';
  let amount = overrides.amount;
  if (!amount && sub?.amount != null) {
    amount = formatMoney(sub.amount, sub.currency || 'USD');
  }
  if (!amount) amount = '$8.99';

  const endDate =
    overrides.endDate ||
    formatDate(sub?.currentPeriodEnd) ||
    formatDate(sub?.trialEndDate) ||
    formatDate(sub?.cancelAt);

  let daysLeft = overrides.daysLeft;
  if (daysLeft == null && sub?.trialEndDate) {
    const end = sub.trialEndDate.toDate ? sub.trialEndDate.toDate() : new Date(sub.trialEndDate);
    daysLeft = Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
  }
  if (daysLeft == null) daysLeft = 3;

  return { planName, interval, amount, endDate, daysLeft, provider };
}

async function getLatestPhysicalOrder(db, email, orderIdOverride) {
  if (orderIdOverride) {
    const doc = await db.collection('physicalOrders').doc(orderIdOverride).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  }
  if (!email) return null;
  const normalized = normalizeEmail(email);
  let snap = await db
    .collection('physicalOrders')
    .where('customerEmail', '==', normalized)
    .limit(25)
    .get();
  if (snap.empty) {
    snap = await db
      .collection('physicalOrders')
      .where('email', '==', normalized)
      .limit(25)
      .get();
  }
  if (snap.empty) return null;
  const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  docs.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
    const tb = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
    return tb - ta;
  });
  return docs[0];
}

function buildPhysicalOrderBodyHtml(order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const lineItemsHtml = shopEmails.buildOrderItemsTableHtml(items);
  const totalCents = order.amountTotal ?? items.reduce((s, li) => s + (li.amountTotal || 0), 0);
  const currency = (order.currency || 'usd').toUpperCase();
  const totalFormatted = `$${(totalCents / 100).toFixed(2)} ${currency}`;
  const totalHtml = shopEmails.buildOrderTotalHtml(totalFormatted);

  const address = order.shippingAddress;
  let shippingHtml = '';
  if (address) {
    const lines = [
      order.shippingName,
      address.line1,
      address.line2,
      [address.city, address.state, address.postal_code].filter(Boolean).join(', '),
      address.country,
    ]
      .filter(Boolean)
      .join('<br/>');
    shippingHtml = shopEmails.buildShippingBlockHtml(lines);
  }

  let trackingHtml = '';
  if (order.trackingNumber || order.carrier) {
    trackingHtml = shopEmails.buildTrackingBlockHtml(order.carrier, order.trackingNumber);
  }

  return `${lineItemsHtml}${totalHtml}${shippingHtml}${trackingHtml}`;
}

async function sendViaTemplateFallback(templateKey, recipient, vars, logOpts) {
  const customTemplate = await emailService.loadEmailTemplate(templateKey);
  const subject =
    customTemplate?.subject || `The Pep Planner — ${templateKey}`;
  const html = emailService.generateEmailHTML(customTemplate || {}, {
    userName: recipient.displayName,
    userEmail: recipient.email,
    ...vars,
  });
  return emailService.sendEmail(recipient.email, subject, html, logOpts);
}

async function sendShopManual(templateKey, recipient, overrides, logOpts) {
  const db = admin.firestore();
  const ownerEmail =
    process.env.PLANNER_ORDER_NOTIFICATION_EMAIL || 'lebrockmaldonado@gmail.com';

  if (templateKey === 'shopOrderOwner') {
    const order = await getLatestPhysicalOrder(db, recipient.email, overrides.orderId);
    const customerName = order?.customerName || recipient.displayName || 'Guest';
    const customerEmail = order?.customerEmail || order?.email || recipient.email;
    const totalFormatted = order
      ? `$${((order.amountTotal || 0) / 100).toFixed(2)} ${(order.currency || 'usd').toUpperCase()}`
      : overrides.orderTotal || '';
    const orderStatusUrl = order
      ? `${shopEmails.SHOP_BASE}/order/${order.id}`
      : `${shopEmails.SHOP_BASE}/shop`;
    const bodyHtml = order
      ? `<p style="font-size:14px;color:#555;margin:0 0 12px"><strong>Customer:</strong> ${customerName} (${customerEmail})</p>${buildPhysicalOrderBodyHtml(order)}`
      : overrides.bodyHtml || '';

    const fallback = shopEmails.DEFAULTS[templateKey];
    const custom = await emailService.loadEmailTemplate(templateKey);
    const merged = { ...fallback, ...(custom || {}) };
    const vars = {
      customerName,
      orderTotal: totalFormatted,
      orderStatusUrl,
      sessionId: order?.id || '',
      userEmail: ownerEmail,
      userName: 'Admin',
    };
    const subject = merged.subject
      .replace(/%CUSTOMERNAME%/g, customerName)
      .replace(/%ORDERTOTAL%/g, totalFormatted);
    const html = emailService.generateEmailHTML({ ...merged, bodyHtml }, vars);
    return emailService.sendEmail(ownerEmail, subject, html, {
      ...logOpts,
      recipientName: 'Shop Owner',
      type: 'shopOrderOwner',
    });
  }

  const order = await getLatestPhysicalOrder(db, recipient.email, overrides.orderId);
  const customerName = order?.customerName || recipient.displayName || 'there';
  const orderId = order?.id || overrides.orderId || '';
  const orderStatusUrl = orderId
    ? `${shopEmails.SHOP_BASE}/order/${orderId}`
    : `${shopEmails.SHOP_BASE}/shop`;
  const totalFormatted = order
    ? `$${((order.amountTotal || 0) / 100).toFixed(2)} ${(order.currency || 'usd').toUpperCase()}`
    : overrides.orderTotal || '';

  let bodyHtml = order ? buildPhysicalOrderBodyHtml(order) : overrides.bodyHtml || '';
  if (templateKey === 'shopReviewRequest' || templateKey === 'shopReviewInvite') {
    bodyHtml = (bodyHtml || '') + shopEmails.buildReviewLinksHtml();
  }

  const fallback = shopEmails.DEFAULTS[templateKey];
  if (!fallback) {
    throw new HttpsError('invalid-argument', `Unknown shop template: ${templateKey}`);
  }
  const custom = await emailService.loadEmailTemplate(templateKey);
  const merged = { ...fallback, ...(custom || {}) };
  const vars = {
    customerName,
    orderStatusUrl,
    orderTotal: totalFormatted,
    sessionId: orderId,
    reviewUrl: overrides.reviewUrl || orderStatusUrl,
    userEmail: recipient.email,
    userName: customerName,
  };

  const applyVars = (text) => {
    let r = text || '';
    Object.entries(vars).forEach(([k, v]) => {
      r = r.replace(new RegExp(`%${k.toUpperCase()}%`, 'gi'), v != null ? String(v) : '');
      r = r.replace(new RegExp(`%${k}%`, 'gi'), v != null ? String(v) : '');
    });
    return r;
  };

  const subject = applyVars(merged.subject || fallback.subject);
  const html = emailService.generateEmailHTML({ ...merged, bodyHtml }, vars);
  return emailService.sendEmail(recipient.email, subject, html, logOpts);
}

async function routeManualSend(templateKey, recipient, overrides, adminUid) {
  const db = admin.firestore();
  const logOpts = manualLogOptions(recipient, templateKey, adminUid);

  if (BLOCKED_TEMPLATES.has(templateKey)) {
    throw new HttpsError(
      'failed-precondition',
      'squarespaceActivation cannot be sent manually without a fresh activation token'
    );
  }

  if (SHOP_TEMPLATE_KEYS.has(templateKey)) {
    return sendShopManual(templateKey, recipient, overrides, logOpts);
  }

  const sub = recipient.userId ? await loadSubscription(db, recipient.userId) : null;
  const billing = subscriptionBillingFields(sub, overrides);

  if (TOKEN_KEYS.has(templateKey)) {
    if (templateKey === 'verification') {
      if (!recipient.userId) {
        throw new HttpsError('failed-precondition', 'Verification email requires a registered user UID');
      }
      const token = crypto.randomBytes(32).toString('hex');
      await db.collection('verificationTokens').doc(token).set({
        userId: recipient.userId,
        userEmail: recipient.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        used: false,
      });
      return emailService.sendCustomVerificationEmail(recipient.email, token, {
        ...logOpts,
        sentBy: 'admin',
        isManual: true,
      });
    }
    if (templateKey === 'passwordReset') {
      let uid = recipient.userId;
      if (!uid) {
        try {
          const rec = await admin.auth().getUserByEmail(recipient.email);
          uid = rec.uid;
        } catch (e) {
          if (e.code === 'auth/user-not-found') {
            throw new HttpsError('not-found', 'No Firebase account for this email');
          }
          throw e;
        }
      }
      const token = crypto.randomBytes(32).toString('hex');
      await db.collection('passwordResetTokens').doc(token).set({
        userId: uid,
        userEmail: recipient.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        used: false,
      });
      const sent = await emailService.sendCustomPasswordResetEmail(recipient.email, token);
      if (!sent) {
        const { sendFirebasePasswordResetEmail } = require('./firebaseAuthEmailFallback');
        await sendFirebasePasswordResetEmail(recipient.email);
      }
      return true;
    }
    if (templateKey === 'magicLink') {
      let exists = false;
      try {
        await admin.auth().getUserByEmail(recipient.email);
        exists = true;
      } catch (e) {
        if (e.code !== 'auth/user-not-found') throw e;
      }
      if (!exists) {
        const sent = await emailService.sendUnregisteredMagicLinkEmail(recipient.email);
        if (!sent) {
          throw new HttpsError('internal', 'Email failed to send — Resend domain may not be verified');
        }
        return true;
      }
      const { getMagicLinkActionCodeSettings, toUniversalMagicLink } = require('./magicLinkUtils');
      const actionCodeSettings = getMagicLinkActionCodeSettings();
      const firebaseLink = await admin.auth().generateSignInWithEmailLink(
        recipient.email,
        actionCodeSettings
      );
      const sent = await emailService.sendMagicLinkEmail(
        recipient.email,
        toUniversalMagicLink(firebaseLink)
      );
      if (!sent) {
        const { sendFirebaseEmailSignInLink } = require('./firebaseAuthEmailFallback');
        await sendFirebaseEmailSignInLink(recipient.email, actionCodeSettings);
      }
      return true;
    }
    if (templateKey === 'unregisteredMagicLink') {
      return emailService.sendUnregisteredMagicLinkEmail(recipient.email);
    }
  }

  if (EMAIL_CHANGE_KEYS.has(templateKey)) {
    const oldEmail = overrides.oldEmail || recipient.email;
    const newEmail = overrides.newEmail || recipient.email;
    if (templateKey === 'emailChangeNotification') {
      return emailService.sendEmailChangeNotification(oldEmail, newEmail, new Date().toISOString(), logOpts);
    }
    if (templateKey === 'emailChangeVerificationWithLink') {
      const link = overrides.verificationLink || `${process.env.BASE_URL || 'https://thepepplanner.app'}/app/account`;
      return emailService.sendEmailChangeVerificationWithLink(newEmail, oldEmail, link, logOpts);
    }
    if (templateKey === 'emailChangeVerification') {
      return emailService.sendEmailChangeVerificationNotification(newEmail, oldEmail, logOpts);
    }
    return emailService.sendEmailChangeNotification(oldEmail, newEmail, new Date().toISOString(), logOpts);
  }

  if (templateKey === 'weeklyReminder') {
    const { firstName, summary } = recipient.userId
      ? await fetchWeeklyPayloadForUserId(db, recipient.userId)
      : await require('./weeklyResearchSummary').fetchWeeklyPayloadForEmail(db, recipient.email);

    let tplOverrides = {};
    try {
      const savedTpl = await emailService.loadEmailTemplate('weeklyReminder');
      if (savedTpl) {
        tplOverrides = {
          heading: savedTpl.heading,
          greeting: savedTpl.greeting,
          ctaText: savedTpl.ctaText,
          ctaLink: savedTpl.ctaLink,
          postCtaNote: savedTpl.postCtaNote,
        };
      }
    } catch (_) {}

    const subject = 'Your Weekly Research Summary - The Pep Planner';
    const html = emailTemplates.weeklyResearchReminderEmail(firstName, summary, tplOverrides);
    return emailService.sendEmail(recipient.email, subject, html, logOpts);
  }

  if (BILLING_KEYS.has(templateKey)) {
    switch (templateKey) {
      case 'subscription':
        return emailService.sendSubscriptionConfirmationEmail(
          recipient.email,
          billing.planName,
          billing.interval,
          billing.amount
        );
      case 'paymentFailed':
        return emailService.sendPaymentFailedEmail(
          recipient.email,
          billing.amount,
          'USD',
          overrides.invoiceUrl || overrides.receiptUrl || 'https://thepepplanner.app/app/account'
        );
      case 'paymentSuccessful':
        return emailService.sendPaymentSuccessfulEmail(
          recipient.email,
          billing.amount,
          'USD',
          overrides.receiptUrl || overrides.invoiceUrl || 'https://thepepplanner.app/app/account'
        );
      case 'subscriptionCancelled':
        return emailService.sendSubscriptionCancelledEmail(
          recipient.email,
          billing.planName,
          billing.endDate || 'the end of your billing period'
        );
      case 'renewalReminder':
        return emailService.sendRenewalReminderEmail(recipient.email, billing.planName);
      case 'trialEnding':
        return emailService.sendTrialEndingEmail(recipient.email, billing.daysLeft);
      case 'trialExtension':
        return emailService.sendTrialExtensionEmail(
          recipient.email,
          recipient.displayName,
          overrides.daysAdded || 7,
          overrides.newEndDate || billing.endDate || new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-US'),
          overrides.adminNote || null
        );
      default:
        break;
    }
  }

  switch (templateKey) {
    case 'welcome':
      return emailService.sendWelcomeEmail(recipient.email, recipient.displayName, logOpts);
    case 'lifetimeAccessGranted':
      return emailService.sendLifetimeAccessGrantedEmail(
        recipient.email,
        overrides.reason || 'Manual grant'
      );
    case 'manualLifetimeGrant':
      return emailService.sendLifetimeAccessEmail(
        recipient.email,
        recipient.displayName,
        overrides.reason || 'Manual grant'
      );
    case 'squarespaceActivated': {
      const planKey =
        overrides.planKey ||
        (billing.interval === 'year' ? 'annual' : billing.interval === 'month' ? 'monthly' : 'lifetime');
      return emailService.sendSquarespaceSubscriptionActivatedEmail(
        recipient.email,
        recipient.displayName,
        planKey
      );
    }
    case 'customAnnouncement':
      return emailService.sendCustomAnnouncementEmail(recipient.email, recipient.displayName);
    case 'accountDeletion':
      return emailService.sendAccountDeletionEmail(recipient.email, recipient.displayName);
    case 'accountDeletionRequestConfirmation':
      return emailService.sendAccountDeletionRequestConfirmation(recipient.email, recipient.displayName);
    case 'accountDeletionScheduled': {
      const scheduledAt =
        overrides.scheduledDeleteAt != null
          ? new Date(overrides.scheduledDeleteAt)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      return emailService.sendAccountDeletionScheduledEmail(
        recipient.email,
        recipient.displayName,
        scheduledAt,
        { paymentProvider: overrides.paymentProvider || 'stripe' }
      );
    }
    case 'inDepthRequest':
      return emailService.sendInDepthRequestEmail(
        recipient.email,
        recipient.displayName,
        overrides.customContent || null
      );
    case 'inviteEmail':
      return emailService.sendInviteEmail(
        recipient.email,
        recipient.displayName,
        overrides.inviteLink || 'https://thepepplanner.app/signup',
        overrides.customContent || null
      );
    case 'trialExpiredSurvey':
      return emailService.sendTrialExpiredSurveyEmail(
        recipient.email,
        recipient.displayName,
        overrides.surveyLink ||
          'https://docs.google.com/forms/d/e/1FAIpQLSfWCDthbS9tBOY-L-XhF4hzYcC6Dd3eXr9cDFANc7-uVJx-eg/viewform?usp=header'
      );
    case 'winBack':
      return emailService.sendWinBackEmail(
        recipient.email,
        recipient.displayName,
        overrides.promoCode || null
      );
    case 'disputeNotification':
      return emailService.sendDisputeNotificationEmail(
        recipient.email,
        overrides.reason || 'Payment dispute',
        billing.amount || '$0.00'
      );
    case 'disputeStatusUpdate':
      return emailService.sendDisputeStatusUpdateEmail(
        recipient.email,
        overrides.status || 'updated',
        overrides.reason || 'Dispute status update'
      );
    case 'disputeResolution':
      return emailService.sendDisputeResolutionEmail(
        recipient.email,
        overrides.status || 'resolved',
        overrides.reason || 'Dispute resolved'
      );
    case 'supportTicketReply':
      return emailService.sendSupportTicketReplyEmail(
        recipient.email,
        overrides.ticketSubject || 'Support request',
        overrides.adminMessage || overrides.message || 'Thank you for contacting us.',
        overrides.ticketId || 'manual'
      );
    default:
      return sendViaTemplateFallback(templateKey, recipient, {
        planName: billing.planName,
        amount: billing.amount,
        endDate: billing.endDate,
        ...overrides,
      }, logOpts);
  }
}

const MANUAL_EMAIL_CORS = [
  /^https:\/\/thepepplanner\.app$/,
  /^https:\/\/www\.thepepplanner\.app$/,
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
];

exports.sendManualEmail = onCall(
  {
    cors: MANUAL_EMAIL_CORS,
    secrets: ['RESEND_API_KEY', 'LOGO_URL'],
  },
  async (request) => {
    await ensureAdmin(request);

    const { templateKey, userId, userEmail, overrides = {} } = request.data || {};

    if (!templateKey || typeof templateKey !== 'string') {
      throw new HttpsError('invalid-argument', 'templateKey is required');
    }

    if (!userId && !userEmail) {
      throw new HttpsError('invalid-argument', 'userId or userEmail is required');
    }

    const db = admin.firestore();
    const recipient = await resolveRecipient(db, { userId, userEmail });

    logger.info(
      `📧 Manual send: template=${templateKey} to=${recipient.email} userId=${recipient.userId || 'guest'} by=${request.auth.uid}`
    );

    const success = await routeManualSend(
      templateKey,
      recipient,
      overrides || {},
      request.auth.uid
    );

    if (!success) {
      throw new HttpsError(
        'internal',
        'Email failed to send. Check Resend domain verification (thepepplanner.app) — recent failures show the sending domain is not verified.'
      );
    }

    return {
      success: true,
      message: `${templateKey} sent to ${recipient.email}`,
      recipientEmail: recipient.email,
      userId: recipient.userId,
    };
  }
);
