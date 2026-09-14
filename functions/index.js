const {onDocumentUpdated, onDocumentCreated} = require('firebase-functions/v2/firestore');
const { COLLECTIONS } = require('./config/collections');
const {onCall, onRequest, HttpsError} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {logger} = require('firebase-functions');
const admin = require('firebase-admin');
const stripe = require('./stripe');
const pushNotifications = require('./pushNotifications');
const emailService = require('./emailService');
const testEmailSystem = require('./testEmailSystem');
const manualEmailSend = require('./manualEmailSend');
const emailAutomation = require('./emailAutomation');
const quickEmailTest = require('./quickEmailTest');
const stripeWebhooks = require('./stripeWebhooks');
const founderOffer = require('./founderOffer');
const manualSyncSubscription = require('./manualSyncSubscription');
const subscriptionReconciliationAdmin = require('./subscriptionReconciliationAdmin');
const recoverLifetimePurchases = require('./recoverLifetimePurchases');
const easypost = require('./easypost');
const googlePlayBilling = require('./googlePlayBilling');
const googlePlayWebhooks = require('./googlePlayWebhooks');
const appleInAppPurchase = require('./appleInAppPurchase');
const adminManualAppleGrant = require('./adminManualAppleGrant');
const adminManualAndroidGrant = require('./adminManualAndroidGrant');
const adminManualStripeGrant = require('./adminManualStripeGrant');
const syncMyStripeSubscription = require('./syncMyStripeSubscription');
const adminGrantFreeMonth = require('./adminGrantFreeMonth');
const squarespaceWebhooks = require('./squarespaceWebhooks');
const squarespacePolling = require('./squarespacePolling');
const physicalStore = require('./physicalStore');
const digitalDownloads = require('./digitalDownloads');
const inventorySync = require('./inventorySync');
const manualProcessSquarespaceOrder = require('./manualProcessSquarespaceOrder');
const getUserActivityHistory = require('./getUserActivityHistory');
const adminRevokeAndRestoreTrial = require('./adminRevokeAndRestoreTrial');
// Test webhook email simulation
const testWebhookSimulation = require('./testWebhookSimulation');
const emailQueue = require('./emailQueue');
const recaptcha = require('./recaptcha');

// ==================== GHOST WORKER AI AUTOMATION ====================
const ghostWorker = require('./ghostWorker');
const telegramBot = require('./telegramBot');

// ==================== SHARE INCENTIVE ====================
const shareVerification = require('./shareVerification');

// ==================== SYNC HEALTH CHECK ====================
const syncHealthCheck = require('./syncHealthCheck');

// ==================== TRIAL LIFECYCLE NOTIFICATIONS ====================
const trialNotifications = require('./trialNotifications');

// ==================== PUSH NOTIFICATION ENGINE (engagement, orders, subscriptions) ====================
const pushNotificationEngine = require('./pushNotificationEngine');
const researchReminderScheduler = require('./researchReminderScheduler');

// ==================== POST-DOWNGRADE WIN-BACK EMAILS ====================
const postDowngradeEmails = require('./postDowngradeEmails');

// ==================== AI PRODUCT DESCRIPTION GENERATOR ====================
const generateProductDescriptionModule = require('./generateProductDescription');

// ==================== SHOP INQUIRIES (custom / wholesale / group) ====================
const shopInquiries = require('./shopInquiries');
const shopReviewRequests = require('./shopReviewRequests');

admin.initializeApp();

// ==================== ADMIN VERIFICATION ====================
const { ADMIN_EMAILS, verifyAdmin, ensureAdmin } = require('./adminAuth');

// Research+ Wave one-off migration (founder tier stamping).
const researchPlusMigration = require('./researchPlusMigration');
exports.migrateFoundersToTier = researchPlusMigration.migrateFoundersToTier;
// Founding Member badge stamping — runs across ALL users, free + paid.
exports.stampFoundingMembers = researchPlusMigration.stampFoundingMembers;

// Research+ Wave: AI Research callables (chat, prefill, analyze stack).
// Stubs enforce auth, tier, quota, PII sanitization; real provider wiring
// lands in a follow-up deploy.
const aiResearch = require('./aiResearch');
exports.aiResearchChat = aiResearch.aiResearchChat;
exports.aiResearchChatStream = aiResearch.aiResearchChatStream;
exports.aiResearchPrefillProtocol = aiResearch.aiResearchPrefillProtocol;
exports.aiResearchAnalyzeStack = aiResearch.aiResearchAnalyzeStack;

const pipGemini = require('./pipGemini');
exports.aiPipGeminiResearch = pipGemini.aiPipGeminiResearch;
exports.aiPipGeminiResearchStream = pipGemini.aiPipGeminiResearchStream;
exports.aiPipGeminiPrefill = pipGemini.aiPipGeminiPrefill;
exports.logPipQueryClient = pipGemini.logPipQueryClient;

// Half-life backfill: one-time AI migration (Gemini + Google Search grounding).
// Separate quota from PiP chat — available to all authenticated users.
const halfLifeBackfill = require('./halfLifeBackfill');
exports.aiBackfillProtocolHalfLives = halfLifeBackfill.aiBackfillProtocolHalfLives;

// Research+ Wave: Referral callables (get + redeem codes).
// Rewards are stamped onto user records; Stripe layer applies credits.
const redeemReferralFns = require('./redeemReferral');
exports.getMyReferralCode = redeemReferralFns.getMyReferralCode;
exports.redeemReferral = redeemReferralFns.redeemReferral;

// Research+ Wave: Partner invite callables (send, accept, remove).
const partnerInvite = require('./partnerInvite');
exports.sendPartnerInvite = partnerInvite.sendPartnerInvite;
exports.acceptPartnerInvite = partnerInvite.acceptPartnerInvite;
exports.removePartner = partnerInvite.removePartner;

// Import and export the Stripe functions individually
exports.createCheckoutSession = stripe.createCheckoutSession;
exports.createPortalSession = stripe.createPortalSession;
exports.cancelSubscription = stripe.cancelSubscription;
exports.updatePaymentMethod = stripe.updatePaymentMethod;
exports.generateInvoiceReceipt = stripe.generateInvoiceReceipt;
exports.getStripeSubscriptions = stripe.getStripeSubscriptions;
exports.getFounderOfferStatus = founderOffer.getFounderOfferStatus;

// Google Play Billing Functions
exports.verifyGooglePlayPurchase = googlePlayBilling.verifyGooglePlayPurchase;
exports.googlePlayWebhook = googlePlayWebhooks.googlePlayWebhook;

// Physical Store (Planner Shop) Functions
exports.createPhysicalCheckoutSession = physicalStore.createPhysicalCheckoutSession;
exports.getPhysicalOrderSession = physicalStore.getPhysicalOrderSession;
exports.digitalDownload = digitalDownloads.digitalDownload;
exports.serveDigitalDownloadFile = digitalDownloads.digitalDownload;
exports.getDigitalDownloadInfo = digitalDownloads.getDigitalDownloadInfo;
exports.redeemDigitalDownload = digitalDownloads.redeemDigitalDownload;
exports.getSessionDigitalDownloads = digitalDownloads.getSessionDigitalDownloads;
exports.adminResendDigitalDownload = digitalDownloads.adminResendDigitalDownload;

// Shipping Labels & Fulfillment Functions
const shippingLabels = require('./shippingLabels');
exports.createShippingLabel = shippingLabels.createShippingLabel;
exports.purchaseShippingLabel = shippingLabels.purchaseShippingLabel;
exports.registerShopOrderEasyPostTracker = shippingLabels.registerShopOrderEasyPostTracker;
exports.easypostTrackerWebhook = shippingLabels.easypostTrackerWebhook;
exports.printPackingSlip = shippingLabels.printPackingSlip;
exports.bulkCreateShippingLabels = shippingLabels.bulkCreateShippingLabels;
exports.sendReviewRequestEmails = shippingLabels.sendReviewRequestEmails;

// Inventory Sync & Marketplace Webhook Functions
exports.etsyOrderWebhook = inventorySync.etsyOrderWebhook;
exports.tiktokOrderWebhook = inventorySync.tiktokOrderWebhook;
exports.onStockUpdated = inventorySync.onStockUpdated;

// Marketplace admin (OAuth, sync, credentials)
const marketplaces = require('./marketplaces');
exports.getMarketplaceStatus = marketplaces.getMarketplaceStatus;
exports.startMarketplaceOAuth = marketplaces.startMarketplaceOAuth;
exports.marketplaceOAuthCallback = marketplaces.marketplaceOAuthCallback;
exports.disconnectMarketplace = marketplaces.disconnectMarketplace;
exports.saveMarketplaceAppCredentials = marketplaces.saveMarketplaceAppCredentials;
exports.syncAllMarketplaceStock = marketplaces.syncAllMarketplaceStock;

const etsyOrders = require('./etsyOrders');
exports.syncEtsyOrders = etsyOrders.syncEtsyOrders;
exports.scheduledEtsyOrderSync = etsyOrders.scheduledEtsyOrderSync;

const {
  getEtsyWebhookStatus,
  saveEtsyWebhookConfig,
} = require('./etsyWebhookAdmin');
exports.getEtsyWebhookStatus = getEtsyWebhookStatus;
exports.saveEtsyWebhookConfig = saveEtsyWebhookConfig;

// Manual order entry
const manualOrder = require('./manualOrder');
exports.createManualOrder = manualOrder.createManualOrder;

const shopOrderAdmin = require('./shopOrderAdmin');
exports.cancelShopOrder = shopOrderAdmin.cancelShopOrder;
exports.refundShopOrder = shopOrderAdmin.refundShopOrder;
exports.deleteShopOrder = shopOrderAdmin.deleteShopOrder;
exports.backfillShopOrderNumbers = shopOrderAdmin.backfillShopOrderNumbers;
exports.syncShopOrderFromStripe = shopOrderAdmin.syncShopOrderFromStripe;

const marketingContacts = require('./marketingContacts');
exports.updateShopMarketingOptIn = marketingContacts.updateShopMarketingOptIn;
exports.unsubscribeShopMarketingContact = marketingContacts.unsubscribeShopMarketingContact;

// Squarespace physical order import
const squarespacePhysicalImport = require('./squarespacePhysicalImport');
exports.importSquarespacePhysicalOrders = squarespacePhysicalImport.importSquarespacePhysicalOrders;
exports.resetSquarespaceImport = squarespacePhysicalImport.resetSquarespaceImport;

const csvOrderImport = require('./csvOrderImport');
exports.importOrdersFromCsv = csvOrderImport.importOrdersFromCsv;

// Google Merchant Center Shopping Feed & Sitemap
const shoppingFeed = require('./shoppingFeed');
exports.shoppingFeed = shoppingFeed.shoppingFeed;
const sitemapFn = require('./sitemap');
exports.sitemap = sitemapFn.sitemap;

// Squarespace Webhook Functions
exports.squarespaceWebhook = squarespaceWebhooks.squarespaceWebhook;

// Squarespace Polling Functions
exports.pollSquarespaceOrders = squarespacePolling.pollSquarespaceOrders;

// Manual Squarespace Order Processing
exports.manualProcessSquarespaceOrder = manualProcessSquarespaceOrder.manualProcessSquarespaceOrder;

// Apple In-App Purchase Functions
exports.verifyAppleReceipt = appleInAppPurchase.verifyAppleReceipt;
exports.appleWebhook = appleInAppPurchase.appleWebhook;
exports.adminManualAppleGrant = adminManualAppleGrant.adminManualAppleGrant;
exports.adminManualAndroidGrant = adminManualAndroidGrant.adminManualAndroidGrant;
exports.adminManualStripeGrant = adminManualStripeGrant.adminManualStripeGrant;
exports.syncMyStripeSubscription = syncMyStripeSubscription.syncMyStripeSubscription;
exports.adminGrantFreeMonth = adminGrantFreeMonth.adminGrantFreeMonth;

// Revenue metrics API (admin only — token email or Firestore role/email)
exports.getRevenueMetrics = onCall({
  cors: true,
}, async (request) => {
  await ensureAdmin(request);

  const db = admin.firestore();
  try {
    const subSnapshot = await db.collection('userSubscriptions').get();
    let activeMonthly = 0, activeAnnual = 0, activeLifetime = 0;
    let canceled = 0, expired = 0, trialing = 0;
    let monthlyRevenue = 0, annualRevenue = 0;
    const providerCounts = { stripe: 0, googleplay: 0, apple: 0 };

    for (const doc of subSnapshot.docs) {
      const sub = doc.data()?.subscription;
      if (!sub) continue;

      const raw = (sub.paymentProvider || 'stripe').toLowerCase().replace(/\s/g, '');
      const provider = raw === 'google' || raw === 'google_play' ? 'googleplay' : (raw === 'apple' || raw === 'app_store' ? 'apple' : 'stripe');
      if (providerCounts[provider] !== undefined) providerCounts[provider]++;

      switch (sub.status) {
        case 'active':
          if (sub.interval === 'month' || sub.interval === 'monthly') {
            activeMonthly++;
            monthlyRevenue += sub.amount || 0;
          } else if (sub.interval === 'year' || sub.interval === 'annual') {
            activeAnnual++;
            annualRevenue += sub.amount || 0;
          } else if (sub.interval === 'lifetime') {
            activeLifetime++;
          }
          break;
        case 'canceled': canceled++; break;
        case 'expired': expired++; break;
        case 'trialing': trialing++; break;
      }
    }

    const mrr = monthlyRevenue + (annualRevenue / 12);
    const totalActive = activeMonthly + activeAnnual + activeLifetime;
    const totalUsers = subSnapshot.size;
    const conversionRate = totalUsers > 0 ? ((totalActive / totalUsers) * 100).toFixed(1) : 0;
    const churnRate = totalUsers > 0 ? (((canceled + expired) / totalUsers) * 100).toFixed(1) : 0;

    return {
      mrr: Math.round(mrr * 100) / 100,
      totalActive,
      activeMonthly,
      activeAnnual,
      activeLifetime,
      trialing,
      canceled,
      expired,
      totalUsers,
      conversionRate: parseFloat(conversionRate),
      churnRate: parseFloat(churnRate),
      providerBreakdown: providerCounts,
    };
  } catch (error) {
    logger.error('❌ Revenue metrics error:', error);
    throw new HttpsError('internal', error.message);
  }
});

// Admin user profile (server-side read so it works regardless of Firestore rules)
exports.getAdminUserProfile = onCall({ cors: true }, async (request) => {
  await ensureAdmin(request);
  const userId = request.data?.userId;
  if (!userId || typeof userId !== 'string') {
    throw new HttpsError('invalid-argument', 'User ID is required');
  }
  const db = admin.firestore();
  const [userSnap, subscriptionSnap] = await Promise.all([
    db.collection('users').doc(userId).get(),
    db.collection('userSubscriptions').doc(userId).get()
  ]);
  if (!userSnap.exists) {
    throw new HttpsError('not-found', 'Researcher record not found');
  }
  const userData = userSnap.data();
  const subscriptionDoc = subscriptionSnap.exists ? subscriptionSnap.data() : {};
  const { coalesceSubscriptionForAdmin, enrichSubscriptionFromStripe } = require('./adminSubscriptionEnrich');
  let subscriptionData = coalesceSubscriptionForAdmin(subscriptionDoc, userData);
  subscriptionData = await enrichSubscriptionFromStripe(subscriptionData, userData, userId, db);
  const extensionHistory = [];
  if (Array.isArray(userData.trialExtensionHistory)) {
    extensionHistory.push(...userData.trialExtensionHistory);
  }
  if (Array.isArray(subscriptionDoc.trialExtensionHistory)) {
    extensionHistory.push(...subscriptionDoc.trialExtensionHistory);
  }
  const dedupedHistoryMap = new Map();
  extensionHistory.forEach((entry) => {
    if (!entry) return;
    const key = entry.newEnd || `${entry.extendedAt || ''}-${entry.addedDays || ''}`;
    if (!dedupedHistoryMap.has(key)) dedupedHistoryMap.set(key, entry);
  });
  const combinedHistory = Array.from(dedupedHistoryMap.values()).sort((a, b) => {
    const aTime = new Date(a.extendedAt || a.newEnd || 0).getTime();
    const bTime = new Date(b.extendedAt || b.newEnd || 0).getTime();
    return bTime - aTime;
  });
  return {
    id: userId,
    uid: userId,
    email: userData.email,
    displayName: userData.displayName,
    photoURL: userData.photoURL || null,
    createdAt: userData.createdAt,
    lastActive: userData.lastActive,
    lastLoginAt: userData.lastLoginAt || null,
    inviteCodeUsed: userData.inviteCodeUsed,
    isActive: userData.isActive,
    deviceInfo: userData.deviceInfo || null,
    engagement: userData.engagement || null,
    milestones: userData.milestones || null,
    subscription: subscriptionData,
    trialEndDate: userData.trialEndDate || null,
    trialExtensionHistory: combinedHistory
  };
});

// EasyPost Tracking Functions
exports.createEasyPostTracker = easypost.createEasyPostTracker;
exports.getEasyPostTrackerStatus = easypost.getEasyPostTrackerStatus;
exports.easyPostWebhook = easypost.easyPostWebhook;

// Email Queue Admin Functions
exports.getEmailQueueStats = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      verifyAdmin(request); // Admin only — email queue is internal
      const stats = await emailQueue.getQueueStats();
      return { success: true, stats };
    } catch (error) {
      logger.error('Error getting email queue stats:', error);
      return { success: false, error: error.message };
    }
  }
);

exports.processEmailQueueManually = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      verifyAdmin(request); // Admin only — manual email processing
      const result = await emailQueue.processEmailQueue();
      return { success: true, ...result };
    } catch (error) {
      logger.error('Error manually processing email queue:', error);
      return { success: false, error: error.message };
    }
  }
);

// Admin Functions - Use Admin SDK to bypass client-side security rules
exports.adminGrantLifetimeAccess = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      // Verify admin via Firebase Auth email (no more password in client code)
      verifyAdmin(request);
      const { userId, email, reason, grantedBy } = request.data;
      
      if (!email) {
        throw new Error('email is required');
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      logger.info('🎁 Admin granting lifetime access to:', normalizedEmail, userId || 'no userId (pre-grant)');
      
      // Use Admin SDK to write directly (bypasses security rules)
      const db = admin.firestore();
      
      // If userId is provided, grant access to existing user
      // If userId is not provided, create a pre-grant that will be applied when user signs up
      if (userId) {
        // User exists - grant access immediately
        logger.info('✅ User exists, granting lifetime access immediately');
        
        // Create lifetime access document
        await db.collection('lifetimeAccess').doc(userId).set({
          userId,
          email: normalizedEmail,
          hasLifetimeAccess: true,
          reason: reason || 'Beta tester',
          grantedBy: grantedBy || 'admin',
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'active',
          metadata: {
            isBetaTester: (reason || '').toLowerCase().includes('beta'),
            isFounder: (reason || '').toLowerCase().includes('founder'),
            isManualGrant: true
          }
        }, { merge: true });
        
        // Update user document
        await db.collection('users').doc(userId).set({
          subscription: {
            hasLifetimeAccess: true,
            lifetimeReason: reason || 'Beta tester',
            lifetimeGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
            plan: 'lifetime',
            status: 'active'
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // CRITICAL: Also write to userSubscriptions collection (where app reads from)
        const subscriptionData = {
          hasLifetimeAccess: true,
          interval: 'lifetime',
          status: 'active',
          plan: 'lifetime',
          lifetimeReason: reason || 'Beta tester',
          lifetimeGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
          currentPeriodEnd: null, // Lifetime has no end date
          currentPeriodStart: admin.firestore.FieldValue.serverTimestamp(),
          userId: userId,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('userSubscriptions').doc(userId).set({
          subscription: subscriptionData
        }, { merge: true });
      } else {
        // User doesn't exist yet - create pre-grant that will be applied on signup
        logger.info('⚠️ User does not exist yet, creating pre-grant for email:', normalizedEmail);
        
        // Create a pre-grant document keyed by email (not userId)
        // This will be checked when the user signs up
        await db.collection('lifetimeAccessPreGrants').doc(normalizedEmail).set({
          email: normalizedEmail,
          hasLifetimeAccess: true,
          reason: reason || 'Beta tester',
          grantedBy: grantedBy || 'admin',
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'pending', // Will be activated when user signs up
          metadata: {
            isBetaTester: (reason || '').toLowerCase().includes('beta'),
            isFounder: (reason || '').toLowerCase().includes('founder'),
            isManualGrant: true,
            isPreGrant: true
          }
        }, { merge: true });
        
        logger.info('✅ Pre-grant created - will be applied when user signs up');
      }
      
      logger.info('✅ Lifetime access granted successfully');
      
      return { 
        success: true, 
        message: `Lifetime access granted to ${email}` 
      };
    } catch (error) {
      logger.error('❌ Error granting lifetime access:', error);
      throw new Error(`Failed to grant lifetime access: ${error.message}`);
    }
  }
);

exports.adminRevokeLifetimeAccess = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      verifyAdmin(request);
      const { userId, reason } = request.data;
      
      if (!userId) {
        throw new Error('userId is required');
      }
      
      logger.info('🚫 Admin revoking lifetime access for:', userId);
      
      const db = admin.firestore();
      
      // Update lifetime access document
      await db.collection('lifetimeAccess').doc(userId).update({
        hasLifetimeAccess: false,
        status: 'revoked',
        revokedAt: admin.firestore.FieldValue.serverTimestamp(),
        revokedBy: 'admin',
        revocationReason: reason || 'Manual revocation'
      });
      
      // Update user document
      await db.collection('users').doc(userId).update({
        'subscription.hasLifetimeAccess': false,
        'subscription.status': 'revoked',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      logger.info('✅ Lifetime access revoked successfully');
      
      return { 
        success: true, 
        message: `Lifetime access revoked for user ${userId}` 
      };
    } catch (error) {
      logger.error('❌ Error revoking lifetime access:', error);
      throw new Error(`Failed to revoke lifetime access: ${error.message}`);
    }
  }
);

/**
 * User-callable: extend own trial by 7 days, one-time only.
 * Used when user taps "extend trial" from email or push (no in-app banner).
 */
const EXTEND_TRIAL_DAYS = 7;
const DEFAULT_TRIAL_DAYS = 14;

exports.extendTrial = onCall(
  { cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Sign in to extend your trial.');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();
    const now = new Date();
    const userRef = db.collection('users').doc(uid);
    const subRef = db.collection('userSubscriptions').doc(uid);

    const [userSnap, subSnap] = await Promise.all([userRef.get(), subRef.get()]);
    if (!userSnap.exists) {
      throw new HttpsError('not-found', 'User not found.');
    }
    const userData = userSnap.data() || {};
    const subData = subSnap.exists ? subSnap.data() : {};
    const subscription = subData.subscription || userData.subscription || {};

    // Already used the one-time extension
    const extensionCount = userData.trialExtensions ?? (Array.isArray(userData.trialExtensionHistory) ? userData.trialExtensionHistory.length : 0);
    if (extensionCount >= 1) {
      return { success: false, extended: false, reason: 'already_used', message: 'You\'ve already used your one-time extension.' };
    }

    // Paid subscribers cannot "extend" trial
    const isPaid = subscription.status === 'active' && ['month', 'monthly', 'year', 'annual', 'lifetime'].some(
      (x) => (subscription.interval || '').toLowerCase().includes(x) || (subscription.plan || '').toLowerCase().includes(x)
    );
    if (subscription.hasLifetimeAccess || isPaid) {
      return { success: true, extended: false, reason: 'has_paid', message: 'You already have an active subscription.' };
    }

    // Current trial end: from subscription, user.trialEndDate, or createdAt + 14 days
    let currentEnd = null;
    if (subscription.currentPeriodEnd) {
      const parsed = new Date(subscription.currentPeriodEnd);
      if (!isNaN(parsed.getTime())) currentEnd = parsed;
    }
    if (!currentEnd && userData.trialEndDate) {
      const t = userData.trialEndDate?.toDate ? userData.trialEndDate.toDate() : new Date(userData.trialEndDate);
      if (!isNaN(t.getTime())) currentEnd = t;
    }
    if (!currentEnd && userData.createdAt) {
      const created = userData.createdAt?.toDate ? userData.createdAt.toDate() : new Date(userData.createdAt);
      currentEnd = new Date(created.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    }
    if (!currentEnd) currentEnd = new Date(now.getTime() + DEFAULT_TRIAL_DAYS * 24 * 60 * 60 * 1000);

    const newEndDate = new Date(currentEnd.getTime() + EXTEND_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const newEndIso = newEndDate.toISOString();
    const extensionEntry = {
      extendedAt: now.toISOString(),
      addedDays: EXTEND_TRIAL_DAYS,
      oldEnd: currentEnd.toISOString(),
      newEnd: newEndIso,
      source: 'user_one_time'
    };

    const updatedSub = {
      ...subscription,
      plan: '14-Day Research Trial',
      interval: 'trial',
      status: 'trialing',
      startedAt: subscription.startedAt || subscription.currentPeriodStart || now.toISOString(),
      currentPeriodStart: subscription.currentPeriodStart || subscription.startedAt || now.toISOString(),
      currentPeriodEnd: newEndIso,
      trialExtendedAt: now.toISOString(),
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    };
    const subHistory = Array.isArray(subData.trialExtensionHistory) ? [...subData.trialExtensionHistory] : [];
    subHistory.push(extensionEntry);
    const userHistory = Array.isArray(userData.trialExtensionHistory) ? [...userData.trialExtensionHistory] : [];
    userHistory.push(extensionEntry);

    await Promise.all([
      subRef.set({
        subscription: updatedSub,
        trialExtensionHistory: subHistory
      }, { merge: true }),
      userRef.set({
        subscription: { ...(userData.subscription || {}), ...updatedSub },
        trialEndDate: admin.firestore.Timestamp.fromDate(newEndDate),
        trialExtensions: 1,
        trialExtensionHistory: userHistory,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true })
    ]);

    logger.info(`Trial extended by user ${uid}; new end ${newEndIso}`);
    return { success: true, extended: true, newEndDate: newEndIso, daysAdded: EXTEND_TRIAL_DAYS };
  }
);

exports.adminExtendTrialPeriod = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      const adminEmail = verifyAdmin(request);
      const { userId, days, note } = request.data;
      
      if (!userId) {
        throw new Error('userId is required');
      }
      
      if (!days || days <= 0) {
        throw new Error('days must be a positive number');
      }
      
      logger.info(`⏰ Admin extending trial for user ${userId} by ${days} days`);
      
      const db = admin.firestore();
      const now = new Date();
      
      // Get existing subscription data
      const userRef = db.collection('users').doc(userId);
      const subscriptionRef = db.collection('userSubscriptions').doc(userId);
      
      const [userDoc, subscriptionDoc] = await Promise.all([
        userRef.get(),
        subscriptionRef.get()
      ]);
      
      const userData = userDoc.data() || {};
      const subscriptionData = subscriptionDoc.data() || {};
      const existingSubscription = subscriptionData.subscription || userData.subscription || {};
      
      // Calculate new end date
      let currentEnd = now;
      if (existingSubscription.currentPeriodEnd) {
        const parsedEnd = new Date(existingSubscription.currentPeriodEnd);
        if (!isNaN(parsedEnd.getTime()) && parsedEnd > now) {
          currentEnd = parsedEnd;
        }
      }
      
      const newEndDate = new Date(currentEnd.getTime() + days * 24 * 60 * 60 * 1000);
      const newEndIso = newEndDate.toISOString();
      
      // Create extension history entry
      const extensionEntry = {
        extendedAt: now.toISOString(),
        extendedBy: adminEmail || 'admin@thepepplanner.com',
        addedDays: days,
        note: note || '',
        oldEnd: currentEnd.toISOString(),
        newEnd: newEndIso
      };
      
      // Update subscription - explicitly reactivate trial
      const updatedSubscription = {
        ...existingSubscription,
        plan: '14-Day Research Trial',
        interval: 'trial',
        status: 'trialing', // Force status to trialing
        startedAt: existingSubscription.startedAt || existingSubscription.currentPeriodStart || now.toISOString(),
        currentPeriodStart: existingSubscription.currentPeriodStart || existingSubscription.startedAt || now.toISOString(),
        currentPeriodEnd: newEndIso,
        paymentMethod: existingSubscription.paymentMethod || null,
        adminExtended: true,
        // Remove any expired/canceled flags
        canceled_at: admin.firestore.FieldValue.delete(),
        cancel_at: admin.firestore.FieldValue.delete(),
        cancel_at_period_end: false,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      };
      
      logger.info(`📊 Setting subscription status to: ${updatedSubscription.status}`);
      logger.info(`📅 New trial end date: ${newEndIso}`);
      
      // Get existing history
      const subscriptionHistory = Array.isArray(subscriptionData.trialExtensionHistory)
        ? [...subscriptionData.trialExtensionHistory]
        : [];
      subscriptionHistory.push(extensionEntry);
      
      const userHistory = Array.isArray(userData.trialExtensionHistory)
        ? [...userData.trialExtensionHistory]
        : [];
      userHistory.push(extensionEntry);
      
      // Update both collections - force reactivate trial
      await Promise.all([
        subscriptionRef.set({
          subscription: updatedSubscription,
          trialExtensionHistory: subscriptionHistory
        }, { merge: true }),
        
        userRef.set({
          subscription: {
            ...(userData.subscription || {}),
            plan: updatedSubscription.plan,
            interval: 'trial',
            status: 'trialing', // Force status to trialing
            currentPeriodEnd: newEndIso,
            currentPeriodStart: updatedSubscription.currentPeriodStart,
            adminExtended: true,
            // Remove any expired/canceled flags
            canceled_at: admin.firestore.FieldValue.delete(),
            cancel_at: admin.firestore.FieldValue.delete(),
            cancel_at_period_end: false,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
          },
          trialEndDate: admin.firestore.Timestamp.fromDate(newEndDate),
          trialExtensionHistory: userHistory,
          // Clear any trial expired flags at user level
          trialExpired: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true })
      ]);
      
      logger.info(`✅ Trial extended successfully. New end date: ${newEndIso}`);
      
      // Send trial extension notification email
      try {
        const userEmail = userData.email;
        const userName = userData.displayName || userData.name || null;
        
        if (userEmail) {
          logger.info(`📧 Sending trial extension email to ${userEmail}`);
          await emailService.sendTrialExtensionEmail(
            userEmail,
            userName,
            days,
            newEndIso,
            note || null
          );
          logger.info(`✅ Trial extension email sent successfully to ${userEmail}`);
        } else {
          logger.warn('⚠️ User email not found, skipping trial extension email');
        }
      } catch (emailError) {
        // Log but don't fail the function if email fails
        logger.error('❌ Failed to send trial extension email:', emailError);
        logger.error('❌ Email error details:', emailError.message);
        // Trial extension still succeeded, email is just a notification
      }
      
      return { 
        success: true, 
        message: `Trial extended by ${days} days`,
        newEndDate: newEndIso,
        extensionEntry
      };
    } catch (error) {
      logger.error('❌ Error extending trial:', error);
      throw new Error(`Failed to extend trial: ${error.message}`);
    }
  }
);

// Manual Subscription Sync - Admin function to resync subscriptions from Stripe
exports.manualSyncSubscription = manualSyncSubscription.manualSyncSubscription;
exports.adminRunSubscriptionReconciliation = subscriptionReconciliationAdmin.adminRunSubscriptionReconciliation;
exports.getAdminSubscriptionReconciliationLog = subscriptionReconciliationAdmin.getAdminSubscriptionReconciliationLog;
exports.scanAndFixSubscriptions = subscriptionReconciliationAdmin.scanAndFixSubscriptions;

// User activity and communications (admin User Detail modal)
exports.getUserActivityHistory = getUserActivityHistory.getUserActivityHistory;
exports.getUserCommunications = getUserActivityHistory.getUserCommunications;

// Admin manual: revoke lifetime access + restore remaining trial days
exports.adminRevokeAndRestoreTrial = adminRevokeAndRestoreTrial.adminRevokeAndRestoreTrial;

// Audit Lifetime Access - Read-only function to find conflicting lifetime grants
const auditLifetimeAccess = require('./auditLifetimeAccess');
exports.auditLifetimeAccess = auditLifetimeAccess.auditLifetimeAccess;

// Audit Stale / Legacy-only userData — Meagan-class cloud sync failures (read-only)
const auditStaleUserData = require('./auditStaleUserData');
exports.auditStaleUserData = auditStaleUserData.auditStaleUserData;

// Debug function to check user's actual subscription data in Firestore
exports.debugUserSubscription = onCall(
  { cors: true },
  async (request) => {
    try {
      verifyAdmin(request);
      const { userId } = request.data;
      
      const db = admin.firestore();
      
      // Get both documents
      const [userDoc, subDoc] = await Promise.all([
        db.collection('users').doc(userId).get(),
        db.collection('userSubscriptions').doc(userId).get()
      ]);
      
      const result = {
        userId,
        usersCollection: userDoc.exists() ? {
          email: userDoc.data().email,
          subscription: userDoc.data().subscription,
          trialEndDate: userDoc.data().trialEndDate,
          trialExpired: userDoc.data().trialExpired
        } : null,
        userSubscriptionsCollection: subDoc.exists() ? subDoc.data() : null
      };
      
      logger.info('📊 Debug subscription data:', result);
      return result;
    } catch (error) {
      logger.error('❌ Error debugging subscription:', error);
      throw error;
    }
  }
);

// Recover Lifetime Purchases - Find and fix users who paid but don't have lifetime access
exports.recoverLifetimePurchases = recoverLifetimePurchases.recoverLifetimePurchases;

// Research reminder cron — new cost-efficient queue-based scheduler (researchReminderScheduler.js)
exports.scheduledResearchReminders = researchReminderScheduler.scheduledResearchReminders;

// ---- OLD CRON BELOW — kept for reference only, no longer active ----
// eslint-disable-next-line no-unused-vars
const _oldScheduledResearchReminders_INACTIVE = async (event) => {
  logger.info('🔬 Running scheduled research reminders (15-minute check)...');
  
  try {
    const now = new Date();
    const currentHourUTC = now.getUTCHours();
    
    // Get all users who have push notifications enabled
    // Query for users with fcmToken (if they have a token, notifications are enabled)
    // Then filter in code for push: true OR pushEnabled: true (backward compatibility)
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .get();
    
    // Filter users with push notifications enabled (check multiple fields for backward compatibility)
    const usersWithPushEnabled = usersSnapshot.docs.filter(doc => {
      const userData = doc.data();
      const notificationSettings = userData.notificationSettings || {};
      const hasPushEnabled = 
        notificationSettings.push === true ||
        notificationSettings.pushEnabled === true ||
        !!userData.fcmToken; // If they have a token, notifications are enabled
      return hasPushEnabled;
    });

    logger.info(`📱 Found ${usersWithPushEnabled.length} users with push notifications enabled (out of ${usersSnapshot.size} total)`);
    
    const promises = [];
    
    for (const userDoc of usersWithPushEnabled) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Get user's timezone settings (default to America/New_York if not set)
      const userSettings = userData.settings || {};
      const userTimezone = userSettings.region?.timeZone || 'America/New_York';
      
      // Get user's custom reminder times (AM and/or PM)
      const reminderTimeAM = userData.notificationSettings?.researchReminderTimeAM || '08:00';
      const reminderTimePM = userData.notificationSettings?.researchReminderTimePM || '18:00';
      const remindersAMEnabled = userData.notificationSettings?.researchRemindersAM === true;
      const remindersPMEnabled = userData.notificationSettings?.researchRemindersPM === true;
      
      // Get current time in user's timezone
      const now = new Date();
      const userTimeString = now.toLocaleString("en-US", {
        timeZone: userTimezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      const [currentHour, currentMinute] = userTimeString.split(':').map(Number);
      
      // FIRST: Check if user has tasks scheduled for today (regardless of reminder settings)
      // Protocols are stored in userData collection as a single document (not subcollection)
      const userDataDoc = await admin.firestore()
        .collection('userData')
        .doc(userId)
        .get();
      
      const userDataObj = userDataDoc.data();
      const protocols = userDataObj?.protocols || [];
      const supplements = userDataObj?.supplements || [];

      const todayPeptides = [];
      const todaySupplements = [];
      
      // Get today's date in user's timezone (userTimezone already declared above)
      const userDateString = now.toLocaleString("en-US", {
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const [month, day, year] = userDateString.split('/');
      const userToday = new Date(year, month - 1, day); // User's local "today" at midnight
      userToday.setHours(0, 0, 0, 0);
      
      // Get peptides from active protocols
      for (const protocol of protocols) {
        
        // Skip protocols explicitly marked as inactive/stopped
        if (protocol.active === false) continue;
        
        // Check if protocol is active today (in user's timezone)
        // Must have a start date; end date is optional (ongoing protocols have no end date)
        if (protocol.startDate) {
          const startDate = new Date(protocol.startDate);
          startDate.setHours(0, 0, 0, 0);
          const endDate = protocol.endDate ? new Date(protocol.endDate) : null;
          if (endDate) endDate.setHours(23, 59, 59, 999);
          
          // Match client-side logic: started AND (no end date OR end date hasn't passed)
          if (userToday >= startDate && (!endDate || userToday <= endDate)) {
            // Add protocol tasks to today's list
            // Some protocols don't have AM/PM scheduling - they just have tasks scheduled for the day
            if (protocol.peptides) {
              protocol.peptides.forEach(peptide => {
                if (peptide.frequency && peptide.frequency.time) {
                  peptide.frequency.time.forEach(time => {
                    todayPeptides.push({
                      name: peptide.name || 'Peptide',
                      dose: peptide.dosage?.amount || '',
                      unit: peptide.dosage?.unit || 'mcg',
                      time: time,
                      type: 'peptide',
                      // Per-peptide custom reminder support
                      customReminder: peptide.frequency.customReminder === true,
                      reminderTime: peptide.frequency.reminderTime || null
                    });
                  });
                }
              });
            }
          }
        }
      }

      // Get supplements scheduled for today (in user's timezone)
      const dayOfWeek = userToday.getDay();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const currentDayName = dayNames[dayOfWeek];

      for (const supplement of supplements) {
        // Check if supplement is scheduled for today
        const isScheduledToday = !supplement.days || 
                                 supplement.days.length === 0 || 
                                 supplement.days.some(day => {
                                   const normalizedDay = day.toLowerCase();
                                   const normalizedCurrentDay = currentDayName.toLowerCase();
                                   return normalizedDay === normalizedCurrentDay || 
                                          normalizedDay === normalizedCurrentDay.substring(0, 3);
                                 });

        if (isScheduledToday) {
          // Get time slots for supplement
          const schedule = Array.isArray(supplement.schedule) ? supplement.schedule : 
                          (supplement.schedule === 'PM' ? ['PM'] : ['AM']);
          
          schedule.forEach(time => {
            todaySupplements.push({
              name: supplement.name || 'Supplement',
              dose: supplement.dose || '',
              time: time,
              type: 'supplement'
            });
          });
        }
      }

      const totalItems = todayPeptides.length + todaySupplements.length;

      // If no items today, skip this user
      if (totalItems === 0) {
        continue;
      }

      // NEW: Filter out completed tasks
      // Load task completion data from Firestore (stored in userData collection)
      const taskCompletion = userDataObj?.taskCompletion || {};
      const todayKey = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`; // YYYY-MM-DD format
      const todayCompletionData = taskCompletion[todayKey] || {};
      
      // Helper function to generate task ID (must match client-side generateTaskId)
      const generateTaskId = (task) => {
        const { name, dose, unit, type, time } = task;
        const normalizedName = (name || '').trim();
        const normalizedDose = (dose || '').trim();
        const normalizedUnit = (unit || '').trim();
        const normalizedType = (type || '').trim();
        const normalizedTime = (time || '').trim();
        const taskId = `${normalizedType}-${normalizedName}-${normalizedDose}-${normalizedUnit}-${normalizedTime}`;
        return taskId.toLowerCase().replace(/\s+/g, '-');
      };
      
      // Helper function to check if task is completed
      const isTaskCompleted = (taskId, timeSlot) => {
        const taskData = todayCompletionData[timeSlot]?.[taskId];
        // Handle both old format (boolean) and new format (object with timestamp)
        if (taskData === true) return true;
        if (taskData && typeof taskData === 'object' && taskData.completed === true) return true;
        return false;
      };
      
      // Filter out completed AM tasks
      const incompletePeptidesAM = todayPeptides.filter(peptide => {
        if (peptide.time !== 'AM') return false; // Only AM peptides
        const taskId = generateTaskId(peptide);
        return !isTaskCompleted(taskId, 'AM');
      });
      
      const incompleteSupplementsAM = todaySupplements.filter(supplement => {
        if (supplement.time !== 'AM') return false; // Only AM supplements
        const taskId = generateTaskId(supplement);
        return !isTaskCompleted(taskId, 'AM');
      });
      
      // Filter out completed PM tasks
      const incompletePeptidesPM = todayPeptides.filter(peptide => {
        if (peptide.time !== 'PM') return false; // Only PM peptides
        const taskId = generateTaskId(peptide);
        return !isTaskCompleted(taskId, 'PM');
      });
      
      const incompleteSupplementsPM = todaySupplements.filter(supplement => {
        if (supplement.time !== 'PM') return false; // Only PM supplements
        const taskId = generateTaskId(supplement);
        return !isTaskCompleted(taskId, 'PM');
      });

      // Helper function to check if current time matches target time (within 15-minute window)
      const isWithinWindow = (targetHour, targetMinute) => {
        if (currentHour !== targetHour) return false;
        const roundedCurrentMinute = Math.floor(currentMinute / 15) * 15;
        const roundedTargetMinute = Math.floor(targetMinute / 15) * 15;
        return roundedCurrentMinute === roundedTargetMinute;
      };
      
      // Helper: build notification body from a list of peptides/supplements
      // Caps at 3 items to keep push notifications concise (iOS ~178 chars, Android ~240 chars)
      const buildNotificationBody = (peptides, supplements, label) => {
        const peptideNames = peptides.map(p => {
          const dose = p.dose && p.unit ? ` (${p.dose} ${p.unit})` : '';
          return `${p.name}${dose}`;
        });
        const supplementNameList = supplements.map(s => s.name);
        const allItems = [...peptideNames, ...supplementNameList];
        
        if (allItems.length === 0) return null;
        
        if (allItems.length <= 3) {
          return `${label}: ${allItems.join(', ')}`;
        } else {
          const shown = allItems.slice(0, 3).join(', ');
          const remaining = allItems.length - 3;
          return `${label}: ${shown} +${remaining} more`;
        }
      };
      
      // ───────────────────────────────────────────────────
      // STEP A: Per-peptide custom reminders (specific time)
      // ───────────────────────────────────────────────────
      const allIncompletePeptides = [...incompletePeptidesAM, ...incompletePeptidesPM];
      const customTimePeptides = allIncompletePeptides.filter(p => p.customReminder && p.reminderTime);
      
      // Group custom-reminder peptides by their reminder time
      const peptidesByCustomTime = {};
      for (const peptide of customTimePeptides) {
        const time = peptide.reminderTime;
        if (!peptidesByCustomTime[time]) peptidesByCustomTime[time] = [];
        peptidesByCustomTime[time].push(peptide);
      }
      
      // Send one notification per unique custom time that matches now
      for (const [customTime, peptides] of Object.entries(peptidesByCustomTime)) {
        const [cHour, cMinute] = customTime.split(':').map(Number);
        if (isWithinWindow(cHour, cMinute)) {
          const body = buildNotificationBody(peptides, [], 'Reminder');
          if (body) {
            const customNotifData = {
              title: `🔔 ${peptides.length === 1 ? peptides[0].name : 'Research'} Reminder`,
              body: body,
              peptides: peptides,
              supplements: [],
              peptideCount: peptides.length,
              supplementCount: 0,
              appUrl: 'https://thepepplanner.com/app/dashboard'
            };
            logger.info(`🔔 Sending custom-time reminder for user ${userId} at ${customTime}: ${peptides.map(p => p.name).join(', ')}`);
            promises.push(
              pushNotifications.sendPushNotificationByType(userId, 'researchReminders', customNotifData)
            );
          }
        }
      }
      
      // ───────────────────────────────────────────────────
      // STEP B: Global AM/PM reminders (for non-custom peptides + supplements)
      // ───────────────────────────────────────────────────
      // Exclude peptides that have custom reminders (they're handled above)
      const globalPeptidesAM = incompletePeptidesAM.filter(p => !p.customReminder || !p.reminderTime);
      const globalPeptidesPM = incompletePeptidesPM.filter(p => !p.customReminder || !p.reminderTime);
      
      const [amHour, amMinute] = reminderTimeAM.split(':').map(Number);
      const [pmHour, pmMinute] = reminderTimePM.split(':').map(Number);
      
      const matchesAM = remindersAMEnabled && isWithinWindow(amHour, amMinute);
      const matchesPM = remindersPMEnabled && isWithinWindow(pmHour, pmMinute);
      
      let shouldSendNotification = false;
      let notificationType = '';
      let notificationPeptides = [];
      let notificationSupplements = [];
      
      if (matchesAM && (globalPeptidesAM.length > 0 || incompleteSupplementsAM.length > 0)) {
        shouldSendNotification = true;
        notificationType = 'AM';
        notificationPeptides = globalPeptidesAM;
        notificationSupplements = incompleteSupplementsAM;
      } else if (matchesPM && (globalPeptidesPM.length > 0 || incompleteSupplementsPM.length > 0)) {
        shouldSendNotification = true;
        notificationType = 'PM';
        notificationPeptides = globalPeptidesPM;
        notificationSupplements = incompleteSupplementsPM;
      }
      
      if (!shouldSendNotification) {
        if (matchesAM || matchesPM) {
          logger.info(`✅ Skipping user ${userId}: All ${notificationType || 'global'} tasks completed or handled by custom reminders`);
        } else if (Object.keys(peptidesByCustomTime).length === 0) {
          logger.info(`⏭️ Skipping user ${userId}: Not the right time (current: ${currentHour}:${String(currentMinute).padStart(2, '0')}, target AM: ${amHour}:${String(amMinute).padStart(2, '0')}, target PM: ${pmHour}:${String(pmMinute).padStart(2, '0')})`);
        }
        continue;
      }
      
      const timeLabel = notificationType === 'AM' ? 'Morning' : 'Evening';
      let notificationTitle = notificationType === 'AM' ? '☀️ Morning Research Reminder' : '🌙 Evening Research Reminder';
      let notificationBody = buildNotificationBody(notificationPeptides, notificationSupplements, `${timeLabel} research`);
      
      if (!notificationBody) {
        logger.info(`✅ Skipping user ${userId}: No items to include in ${notificationType} notification`);
        continue;
      }
      
      logger.info(`⏰ Sending ${notificationType} reminder for user ${userId} in timezone ${userTimezone} (${notificationPeptides.length} peptides, ${notificationSupplements.length} supplements)`);
      
      // Check for custom template override from Firestore
      const templateType = notificationType === 'AM' ? 'researchReminderAM' : 'researchReminderPM';
      try {
        const templateDoc = await admin.firestore().collection('notificationTemplates').doc(templateType).get();
        if (templateDoc.exists) {
          const template = templateDoc.data();
          notificationTitle = template.title || notificationTitle;
          
          // Support new template variables
          if (template.body) {
            const peptideNames = notificationPeptides.map(p => p.name);
            const supplementNameList = notificationSupplements.map(s => s.name);
            let templateBody = template.body
              .replace(/{peptideCount}/g, notificationPeptides.length.toString())
              .replace(/{supplementCount}/g, notificationSupplements.length.toString())
              .replace(/{peptideList}/g, peptideNames.join(', ') || 'none')
              .replace(/{supplementList}/g, supplementNameList.join(', ') || 'none');
            
            // Only use template body if it has real content after replacement
            if (templateBody.trim()) {
              notificationBody = templateBody;
            }
          }
          
          logger.info(`✅ Using custom ${templateType} notification template from Firestore`);
        }
      } catch (error) {
        logger.warn(`⚠️ Could not load notification template ${templateType}:`, error.message);
      }

      // Send global AM/PM notification
      const notificationData = {
        title: notificationTitle,
        body: notificationBody,
        peptides: notificationPeptides,
        supplements: notificationSupplements,
        peptideCount: notificationPeptides.length,
        supplementCount: notificationSupplements.length,
        appUrl: 'https://thepepplanner.com/app/dashboard'
      };

      promises.push(
        pushNotifications.sendPushNotificationByType(userId, 'researchReminders', notificationData)
      );
    }

    // ───────────────────────────────────────────────────
    // STEP C: Titration Dose Change Notifications
    // Runs once daily (at 8:00 AM user-local or AM reminder time)
    // Compares today's titration dose vs yesterday's; sends alert when dose changes
    // ───────────────────────────────────────────────────
    for (const userDoc of usersWithPushEnabled) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      const userSettings = userData.settings || {};
      const userTimezone = userSettings.region?.timeZone || 'America/New_York';
      const reminderTimeAMForTitration = userData.notificationSettings?.researchReminderTimeAM || '08:00';
      const [titHour, titMinute] = reminderTimeAMForTitration.split(':').map(Number);

      // Get current time in user's timezone
      const nowForTitration = new Date();
      const userTimeStr = nowForTitration.toLocaleString("en-US", {
        timeZone: userTimezone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
      const [curH, curM] = userTimeStr.split(':').map(Number);

      // Only run this check at the user's AM reminder window
      if (curH !== titHour || Math.floor(curM / 15) * 15 !== Math.floor(titMinute / 15) * 15) {
        continue;
      }

      // Get user data
      const titrationUserDataDoc = await admin.firestore().collection('userData').doc(userId).get();
      const titrationUserData = titrationUserDataDoc.data();
      const titrationProtocols = titrationUserData?.protocols || [];

      // Get today and yesterday in user's timezone
      const userDateStr = nowForTitration.toLocaleString("en-US", {
        timeZone: userTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
      const [tM, tD, tY] = userDateStr.split('/');
      const today = new Date(tY, tM - 1, tD);
      today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // Helper functions for titration calculation (mirrors client-side calendarTasks.js)
      const getPhaseDays = (phase) => {
        const unit = String(phase.durationUnit || 'day').toLowerCase();
        if (unit === 'ongoing') return 0;
        const count = Number(phase.durationCount) || 0;
        if (unit.includes('week')) return count * 7;
        if (unit.includes('month')) return count * 30;
        return count;
      };

      const getElapsedDays = (protocol, peptide, targetDate) => {
        const startDate = new Date(protocol.startDate);
        startDate.setHours(0, 0, 0, 0);
        const target = new Date(targetDate);
        target.setHours(0, 0, 0, 0);
        let elapsed = Math.floor((target - startDate) / (1000 * 60 * 60 * 24));
        if (elapsed < 0) return null;
        elapsed += (Number(peptide.titrationDaysOffset) || 0);
        if (peptide.titrationHeldAt) {
          const held = new Date(peptide.titrationHeldAt);
          held.setHours(0, 0, 0, 0);
          const heldDays = Math.floor((held - startDate) / (1000 * 60 * 60 * 24));
          if (heldDays >= 0) elapsed = heldDays + (Number(peptide.titrationDaysOffset) || 0);
        }
        return Math.max(0, elapsed);
      };

      const getDoseForDate = (protocol, peptide, targetDate) => {
        const isFixed = peptide.dosageScheduleType === 'fixed' || !peptide.titration || !Array.isArray(peptide.titration) || peptide.titration.length === 0;
        if (isFixed) return { dose: peptide.dosage?.amount || '', unit: peptide.dosage?.unit || '' };
        const daysElapsed = getElapsedDays(protocol, peptide, targetDate);
        if (daysElapsed === null) return { dose: peptide.dosage?.amount || '', unit: peptide.dosage?.unit || '' };
        let cumulativeDays = 0;
        for (let i = 0; i < peptide.titration.length; i++) {
          const phase = peptide.titration[i];
          const isLast = i === peptide.titration.length - 1;
          let pDays = getPhaseDays(phase);
          if (pDays <= 0) { if (isLast) return { dose: phase.dose || '', unit: phase.doseUnit || '' }; pDays = 1; }
          if (daysElapsed < cumulativeDays + pDays) return { dose: phase.dose || '', unit: phase.doseUnit || '' };
          cumulativeDays += pDays;
        }
        const lastPhase = peptide.titration[peptide.titration.length - 1];
        return { dose: lastPhase.dose || '', unit: lastPhase.doseUnit || '' };
      };

      for (const protocol of titrationProtocols) {
        if (protocol.active === false || !protocol.startDate) continue;
        const startDate = new Date(protocol.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = protocol.endDate ? new Date(protocol.endDate) : null;
        if (endDate) endDate.setHours(23, 59, 59, 999);
        if (today < startDate || (endDate && today > endDate)) continue;

        if (!protocol.peptides) continue;
        for (const peptide of protocol.peptides) {
          if (!peptide.titration || !Array.isArray(peptide.titration) || peptide.titration.length < 2) continue;
          if (peptide.dosageScheduleType === 'fixed') continue;

          const todayDose = getDoseForDate(protocol, peptide, today);
          const yesterdayDose = getDoseForDate(protocol, peptide, yesterday);

          if (String(todayDose.dose) !== String(yesterdayDose.dose) || String(todayDose.unit) !== String(yesterdayDose.unit)) {
            const oldDoseStr = `${yesterdayDose.dose} ${yesterdayDose.unit}`.trim();
            const newDoseStr = `${todayDose.dose} ${todayDose.unit}`.trim();
            const peptideName = peptide.name || 'Peptide';

            logger.info(`📈 Titration dose change for user ${userId}: ${peptideName} ${oldDoseStr} → ${newDoseStr}`);

            const titrationNotifData = {
              title: `📈 Dose Change Today!`,
              body: `Your ${peptideName} dose changes today: ${oldDoseStr} → ${newDoseStr}. Check your protocol for details.`,
              appUrl: 'https://thepepplanner.com/app/protocols'
            };

            promises.push(
              pushNotifications.sendPushNotificationByType(userId, 'researchReminders', titrationNotifData)
            );
          }
        }
      }
    }

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    logger.info(`✅ Research reminders sent: ${successful}/${results.length}`);
    return { success: true, sent: successful, total: results.length };
    
  } catch (error) {
    logger.error('❌ Error in scheduled research reminders:', error);
    return { success: false, error: error.message };
  }
};
// ---- END OLD CRON ----

// Real-time order status changes on userData doc (replaces broken userdata/orders subcollection triggers)
exports.onUserDataOrdersUpdated = pushNotificationEngine.onUserDataOrdersUpdated;

// Manual notification trigger (for testing)
exports.sendTestNotification = onCall(async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new Error('User must be authenticated');
  }

  const userId = request.auth.uid;
  const { type, testData } = request.data;

  logger.info(`🧪 Sending test notification to ${userId}: ${type}`);

  const notificationData = {
    title: `Test ${type} Notification`,
    body: 'This is a test notification from The Pep Planner',
    ...testData
  };

  return pushNotifications.sendPushNotificationByType(userId, type, notificationData);
});

/**
 * Client fallback: persist FCM token via Admin SDK (bypasses broken client write rules).
 * Auth required — token is always written to the caller's own users/{uid} doc.
 */
exports.registerFcmToken = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new Error('User must be authenticated');
  }
  const userId = request.auth.uid;
  const token = typeof request.data?.token === 'string' ? request.data.token.trim() : '';
  if (!token || token.length < 20) {
    throw new Error('Invalid FCM token');
  }

  const deviceInfo =
    request.data?.deviceInfo && typeof request.data.deviceInfo === 'object'
      ? request.data.deviceInfo
      : null;

  const payload = {
    fcmToken: token,
    pushToken: token,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (deviceInfo) payload.deviceInfo = deviceInfo;

  await admin.firestore().collection('users').doc(userId).set(payload, { merge: true });
  logger.info(`registerFcmToken: saved token for ${userId}`);
  return { success: true };
});

/**
 * Admin: push delivery tracker (UID / type / trigger / status / time — no title/body).
 */
exports.getPushDeliveryLog = onCall(
  { cors: true },
  async (request) => {
    const adminEmails = [
      'lebrockmaldonado@gmail.com',
      'contact@thepepplanner.com',
      'thepepplanner@gmail.com',
    ];
    const userEmail = request.auth?.token?.email;
    if (!userEmail || !adminEmails.includes(userEmail.toLowerCase())) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    // days: look back N calendar days (preferred for "are reminders working?").
    // limit alone is a recent-N-events cap and can miss older days on busy accounts.
    const daysRaw = request.data?.days;
    const days = daysRaw != null && daysRaw !== '' ? Math.min(Math.max(Number(daysRaw) || 0, 0), 90) : 0;
    const defaultLimit = days > 0 ? 2000 : 100;
    const limitN = Math.min(Math.max(Number(request.data?.limit) || defaultLimit, 1), 2000);
    const statusFilter = request.data?.status || null;
    const prefTypeFilter = request.data?.prefType || null;
    const triggerFilter = request.data?.trigger || null;
    const userIdFilter = request.data?.userId || null;

    const col = admin
      .firestore()
      .collection(pushNotifications.PUSH_DELIVERY_LOG || 'pushDeliveryLog');

    let q = col.orderBy('sentAt', 'desc');
    if (days > 0) {
      const since = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      );
      // Same-field where + orderBy — no composite index required.
      q = col.where('sentAt', '>=', since).orderBy('sentAt', 'desc');
    }
    q = q.limit(limitN);

    // Prefer simple query + client-side filter when multiple filters (avoids composite indexes).
    const snap = await q.get();
    let entries = snap.docs.map((doc) => {
      const d = doc.data() || {};
      return {
        id: doc.id,
        userId: d.userId || null,
        prefType: d.prefType || null,
        templateType: d.templateType || null,
        trigger: d.trigger || null,
        slot: d.slot || null,
        status: d.status || null,
        error: d.error || null,
        sentAt: d.sentAt?.toDate?.()?.toISOString?.() || d.sentAt || null,
      };
    });

    if (statusFilter && statusFilter !== 'all') {
      entries = entries.filter((e) => e.status === statusFilter);
    }
    if (prefTypeFilter && prefTypeFilter !== 'all') {
      entries = entries.filter((e) => e.prefType === prefTypeFilter);
    }
    if (triggerFilter && triggerFilter !== 'all') {
      entries = entries.filter((e) => (e.trigger || '').includes(String(triggerFilter)));
    }
    if (userIdFilter) {
      const needle = String(userIdFilter).trim().toLowerCase();
      entries = entries.filter((e) => (e.userId || '').toLowerCase().includes(needle));
    }

    return {
      success: true,
      count: entries.length,
      days: days || null,
      limit: limitN,
      entries,
    };
  }
);

/**
 * Test function to manually trigger research reminders
 * Useful for testing without waiting for the scheduled time
 */
exports.testResearchReminders = onCall(async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new Error('User must be authenticated');
  }

  // Check if user is admin (optional - remove if you want any user to test)
  const adminEmail = 'lebrockmaldonado@gmail.com';
  const userEmail = request.auth.token.email;
  
  if (userEmail !== adminEmail) {
    throw new Error('Unauthorized: Admin access required');
  }

  logger.info('🧪 Manually triggering research reminders test...');

  try {
    const now = new Date();
    
    // Get all users who have notifications enabled
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('notificationSettings.researchReminders', '==', true)
      .get();

    logger.info(`📋 Found ${usersSnapshot.size} users with research reminders enabled`);

    const promises = [];
    const results = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Get user's timezone settings (default to America/New_York if not set)
      const userSettings = userData.settings || {};
      const userTimezone = userSettings.region?.timeZone || 'America/New_York';
      
      logger.info(`⏰ Checking user ${userId} in timezone ${userTimezone}`);
      
      // Get user's protocols and check for scheduled tasks today
      // Protocols live as a field on the userData doc, not a subcollection
      const userDataDoc = await admin.firestore().collection('userData').doc(userId).get();
      const protocols = userDataDoc.exists ? (userDataDoc.data()?.protocols || []) : [];

      const todayTasks = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const protocol of protocols) {
        // Check if protocol is active today
        if (protocol.startDate) {
          const startDate = new Date(protocol.startDate);
          startDate.setHours(0, 0, 0, 0);
          const endDate = protocol.endDate ? new Date(protocol.endDate) : null;
          if (endDate) endDate.setHours(23, 59, 59, 999);

          if (today >= startDate && (!endDate || today <= endDate)) {
            if (protocol.peptides) {
              protocol.peptides.forEach(peptide => {
                if (peptide.frequency && peptide.frequency.time) {
                  peptide.frequency.time.forEach(time => {
                    todayTasks.push({
                      name: peptide.name || 'Peptide',
                      dose: peptide.dosage?.amount || '',
                      unit: peptide.dosage?.unit || 'mcg',
                      time: time
                    });
                  });
                }
              });
            }
          }
        }
      }

      // Send reminder if there are tasks today (skip timezone check for testing)
      if (todayTasks.length > 0) {
        const notificationData = {
          title: 'Research Reminder (Test)',
          body: `You have ${todayTasks.length} research task(s) scheduled for today`,
          tasks: todayTasks,
          appUrl: 'https://thepepplanner.com/app/dashboard'
        };

        const promise = pushNotifications.sendPushNotificationByType(userId, 'researchReminders', notificationData)
          .then(result => ({ userId, success: result.success, tasks: todayTasks.length }))
          .catch(error => ({ userId, success: false, error: error.message }));
        
        promises.push(promise);
      } else {
        results.push({ userId, skipped: true, reason: 'No tasks today' });
      }
    }

    const notificationResults = await Promise.allSettled(promises);
    const successful = notificationResults.filter(r => r.status === 'fulfilled' && r.value.success).length;
    
    const finalResults = [
      ...results,
      ...notificationResults.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason })
    ];
    
    logger.info(`✅ Test completed: ${successful}/${promises.length} notifications sent`);
    
    return { 
      success: true, 
      sent: successful, 
      total: promises.length,
      usersChecked: usersSnapshot.size,
      results: finalResults
    };
    
  } catch (error) {
    logger.error('❌ Error in test research reminders:', error);
    return { success: false, error: error.message };
  }
});

// Debug notification function
const debugNotifications = require('./debugNotifications');
exports.debugNotifications = debugNotifications.debugNotifications;

// Admin notification functions
exports.sendAdminNotification = onCall(async (request) => {
  // Verify user is authenticated and is admin
  if (!request.auth) {
    throw new Error('User must be authenticated');
  }

  // Check if user is admin (your email)
  const adminEmail = 'lebrockmaldonado@gmail.com';
  const userEmail = request.auth.token.email;
  
  if (userEmail !== adminEmail) {
    throw new Error('Unauthorized: Admin access required');
  }

  const { 
    targetType, // 'specific', 'all', 'active', 'inactive', 'premium'
    targetEmail, // for specific user targeting
    notification 
  } = request.data;

  logger.info(`🔧 Admin sending notification - Type: ${targetType}, From: ${userEmail}`);

  try {
    let results = [];

    if (targetType === 'specific' && targetEmail) {
      // Send to specific user by email
      const userSnapshot = await admin.firestore()
        .collection('users')
        .where('email', '==', targetEmail.toLowerCase())
        .limit(1)
        .get();

      if (userSnapshot.empty) {
        throw new Error(`User not found: ${targetEmail}`);
      }

      const userDoc = userSnapshot.docs[0];
      const userId = userDoc.id;
      
      const result = await pushNotifications.sendPushNotification(
        userId,
        notification.title,
        notification.body,
        {
          source: 'admin',
          timestamp: Date.now(),
          ...notification.data
        }
      );

      results.push({ userId, email: targetEmail, ...result });

    } else if (targetType === 'test_admin') {
      // Send test notification to admin (you)
      // Try to find admin user by email query first
      let adminSnapshot = await admin.firestore()
        .collection('users')
        .where('email', '==', adminEmail)
        .limit(1)
        .get();
      
      // If not found, try to get the current requesting user's document
      if (adminSnapshot.empty) {
        const adminUserId = request.auth.uid;
        if (adminUserId) {
          const adminDoc = await admin.firestore().collection('users').doc(adminUserId).get();
          if (adminDoc.exists) {
            adminSnapshot = adminDoc;
          }
        }
      }

      if (!adminSnapshot.empty) {
        const adminDoc = Array.isArray(adminSnapshot.docs) ? adminSnapshot.docs[0] : adminSnapshot;
        const adminUserId = adminDoc.id;
        
        // Determine notification type based on notification ID or content
        let notificationType = 'push'; // Default to checking main push setting
        if (notification.data?.notificationId) {
          const typeMap = {
            'lowStock': 'lowStockAlerts',
            'researchReminders': 'researchReminders', 
            'groupBuys': 'groupBuys',
            'orderStatusUpdates': 'orderStatusUpdates',
            'washoutReminders': 'washoutReminders',
            'cycleReminders': 'cycleReminders'
          };
          notificationType = typeMap[notification.data.notificationId] || 'push';
        }

        const result = await pushNotifications.sendPushNotificationByType(
          adminUserId,
          notificationType,
          {
            title: notification.title,
            body: notification.body,
            data: {
              source: 'admin-test',
              timestamp: Date.now(),
              ...notification.data
            }
          }
        );

        results.push({ userId: adminUserId, email: adminEmail, ...result });
      }

    } else if (targetType === 'all') {
      // Send to all users with push notifications enabled
      const usersSnapshot = await admin.firestore()
        .collection('users')
        .where('notificationSettings.push', '==', true)
        .get();

      const promises = [];
      
      for (const userDoc of usersSnapshot.docs) {
        const userId = userDoc.id;
        promises.push(
          pushNotifications.sendPushNotification(
            userId,
            notification.title,
            notification.body,
            {
              source: 'admin-broadcast',
              timestamp: Date.now(),
              ...notification.data
            }
          ).then(result => ({ userId, ...result }))
        );
      }

      const allResults = await Promise.allSettled(promises);
      results = allResults.map((result, index) => ({
        userId: usersSnapshot.docs[index].id,
        success: result.status === 'fulfilled' ? result.value.success : false,
        error: result.status === 'rejected' ? result.reason.message : result.value.error
      }));
    }

    const successful = results.filter(r => r.success).length;
    
    logger.info(`✅ Admin notification sent: ${successful}/${results.length} successful`);
    
    return {
      success: true,
      sent: successful,
      total: results.length,
      results: results.slice(0, 10) // Limit returned results for large broadcasts
    };

  } catch (error) {
    logger.error('❌ Admin notification failed:', error);
    throw new Error(`Admin notification failed: ${error.message}`);
  }
});

// Get admin notification stats
exports.getAdminNotificationStats = onCall(async (request) => {
  // Verify user is authenticated and is admin
  if (!request.auth) {
    throw new Error('User must be authenticated');
  }

  const adminEmail = 'lebrockmaldonado@gmail.com';
  const userEmail = request.auth.token.email;
  
  if (userEmail !== adminEmail) {
    throw new Error('Unauthorized: Admin access required');
  }

  try {
    // Get total users
    const totalUsersSnapshot = await admin.firestore()
      .collection('users')
      .get();

    // Get active users (logged in within last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const activeUsersSnapshot = await admin.firestore()
      .collection('users')
      .where('lastLoginAt', '>=', sevenDaysAgo)
      .get();

    // Count users with push notifications enabled by checking multiple fields
    // Some users have notificationSettings.push, others have notificationSettings.pushEnabled
    // Also check if fcmToken exists (which means they have notifications enabled)
    let usersWithPushEnabled = 0;
    
    totalUsersSnapshot.docs.forEach(doc => {
      const userData = doc.data();
      const notificationSettings = userData.notificationSettings || {};
      
      // Check various ways notifications might be enabled
      const hasPushEnabled = 
        notificationSettings.push === true ||
        notificationSettings.pushEnabled === true ||
        !!userData.fcmToken ||
        !!userData.pushToken;
      
      if (hasPushEnabled) {
        usersWithPushEnabled++;
      }
    });

    return {
      totalUsers: totalUsersSnapshot.size,
      usersWithPushEnabled: usersWithPushEnabled,
      activeUsers: activeUsersSnapshot.size,
      pushEnabledPercentage: totalUsersSnapshot.size > 0 
        ? Math.round((usersWithPushEnabled / totalUsersSnapshot.size) * 100)
        : 0
    };

  } catch (error) {
    logger.error('❌ Failed to get admin notification stats:', error);
    throw new Error(`Failed to get stats: ${error.message}`);
  }
});

// Test email system function
exports.testEmailSystem = testEmailSystem.testEmailSystem;
exports.sendManualEmail = manualEmailSend.sendManualEmail;

// Generate email preview HTML (for admin panel - single source of truth)
exports.generateEmailPreview = onCall(
  { cors: true },
  async (request) => {
    const { template, variables } = request.data;
    
    if (!template) {
      throw new Error('Template data is required');
    }
    
    try {
      // Use the same function that generates actual emails
      const html = emailService.generateEmailHTML(template, variables || {});
      return { success: true, html };
    } catch (error) {
      logger.error('❌ Error generating email preview:', error);
      return { success: false, error: error.message };
    }
  }
);

// Quick email test function
exports.quickEmailTest = quickEmailTest.quickEmailTest;

// Test Squarespace activation email
const testSquarespaceEmail = require('./testSquarespaceEmail');
exports.testSquarespaceActivationEmail = testSquarespaceEmail.testSquarespaceActivationEmail;

// Email Automation Functions
exports.onSubscriptionConfirmed = emailAutomation.onSubscriptionConfirmed;
exports.onPaymentFailed = emailAutomation.onPaymentFailed;
exports.onPaymentSuccessful = emailAutomation.onPaymentSuccessful;
exports.onSubscriptionCancelled = emailAutomation.onSubscriptionCancelled;

// Test Resend API key validity
exports.testResendConnection = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    try {
      const resendApiKey = process.env.RESEND_API_KEY?.trim().replace(/\r?\n/g, '');
      
      logger.info('🔑 Testing Resend API key...');
      logger.info('🔑 API Key length:', resendApiKey ? resendApiKey.length : 0);
      logger.info('🔑 API Key starts with re_:', resendApiKey ? resendApiKey.startsWith('re_') : false);
      
      if (!resendApiKey) {
        throw new Error('Resend API key not configured');
      }
      
      if (!resendApiKey.startsWith('re_') || resendApiKey.length < 30) {
        throw new Error('Invalid Resend API key format');
      }
      
      // Test with a simple API call
      const { Resend } = require('resend');
      const resend = new Resend(resendApiKey);
      
      // Test by getting API keys (this validates the key)
      const response = await resend.apiKeys.list();
      
      logger.info('✅ Resend API key is valid');
      logger.info('📊 API keys count:', response.data?.length || 0);
      
      return { 
        success: true, 
        message: 'Resend API key is valid',
        apiKeysCount: response.data?.length || 0
      };
      
    } catch (error) {
      logger.error('❌ Resend API key test failed:', error);
      return { 
        success: false, 
        message: error.message,
        error: error.code || 'Unknown error'
      };
    }
  }
);
exports.checkTrialEndingSoon = emailAutomation.checkTrialEndingSoon;
exports.checkRenewalReminders = emailAutomation.checkRenewalReminders;
exports.sendWeeklyResearchReminders = emailAutomation.sendWeeklyResearchReminders;
exports.testEmailAutomation = emailAutomation.testEmailAutomation;
exports.getEmailStats = emailAutomation.getEmailStats;

// Daily reconciliation: full Stripe → Firestore sync when data is missing or drifted
const { runDailyStripeReconciliation } = require('./stripeSubscriptionSync');
exports.dailyReconciliation = onSchedule({
  schedule: '0 4 * * *', // 4 AM UTC daily
  timeZone: 'UTC',
  memory: '1GiB',
  timeoutSeconds: 540,
}, async () => {
  logger.info('🔄 Running daily Stripe/Firestore reconciliation (full sync on drift)...');
  const db = admin.firestore();
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    logger.error('❌ STRIPE_SECRET_KEY not available for reconciliation');
    return;
  }
  const stripeClient = require('stripe')(stripeSecretKey);
  try {
    const { newRunId } = require('./subscriptionReconciliationLog');
    const runId = newRunId('daily_scheduled');
    const summary = await runDailyStripeReconciliation(db, stripeClient, {
      logContext: { runId, trigger: 'daily_scheduled', runBy: 'system' },
    });
    logger.info('✅ Daily reconciliation complete', summary);
    return summary;
  } catch (error) {
    logger.error('❌ Reconciliation failed:', error);
    throw error;
  }
});

// Nightly Google Play → Firestore reconciliation (2 AM UTC, offset from Stripe job)
const { runGooglePlayReconciliation } = require('./googlePlaySubscriptionSync');
exports.dailyGooglePlayReconciliation = onSchedule({
  schedule: '0 2 * * *', // 2 AM UTC daily
  timeZone: 'UTC',
  memory: '1GiB',
  timeoutSeconds: 540,
  secrets: ['GOOGLE_PLAY_SERVICE_ACCOUNT_KEY'],
}, async () => {
  logger.info('🔄 Running daily Google Play/Firestore reconciliation...');
  const db = admin.firestore();
  if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY) {
    logger.warn('⚠️ GOOGLE_PLAY_SERVICE_ACCOUNT_KEY not set — skipping Google Play reconciliation');
    return;
  }
  try {
    const { newRunId } = require('./subscriptionReconciliationLog');
    const runId = newRunId('daily_googleplay');
    const summary = await runGooglePlayReconciliation(db, {
      logContext: { runId, trigger: 'daily_googleplay', runBy: 'system' },
    });
    logger.info('✅ Google Play reconciliation complete', summary);
    return summary;
  } catch (error) {
    logger.error('❌ Google Play reconciliation failed:', error);
    throw error;
  }
});

// Nightly Apple App Store Server API → Firestore reconciliation (3 AM UTC)
const { runAppleReconciliation, hasAppleApiCredentials } = require('./appleSubscriptionSync');
exports.dailyAppleReconciliation = onSchedule({
  schedule: '0 3 * * *', // 3 AM UTC daily (between Google Play 2 AM and Stripe 4 AM)
  timeZone: 'UTC',
  memory: '1GiB',
  timeoutSeconds: 540,
  secrets: [
    'APPLE_APP_STORE_KEY_ID',
    'APPLE_APP_STORE_ISSUER_ID',
    'APPLE_APP_STORE_PRIVATE_KEY',
  ],
}, async () => {
  logger.info('🔄 Running daily Apple App Store/Firestore reconciliation...');
  const db = admin.firestore();
  if (!hasAppleApiCredentials()) {
    logger.warn('⚠️ Apple App Store Server API credentials not set — skipping');
    return;
  }
  try {
    const { newRunId } = require('./subscriptionReconciliationLog');
    const runId = newRunId('daily_apple');
    const summary = await runAppleReconciliation(db, {
      logContext: { runId, trigger: 'daily_apple', runBy: 'system' },
    });
    logger.info('✅ Apple reconciliation complete', summary);
    return summary;
  } catch (error) {
    logger.error('❌ Apple reconciliation failed:', error);
    throw error;
  }
});

// Stripe Webhook Handler
exports.stripeWebhook = stripeWebhooks.stripeWebhook;
exports.shopStripeWebhook = stripeWebhooks.shopStripeWebhook;

// Test webhook email simulation (safe testing)
exports.testWebhookEmails = testWebhookSimulation.testWebhookEmails;

// Custom password reset function (for authenticated users)
exports.sendCustomPasswordResetEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    // Verify user is authenticated
    if (!request.auth) {
      throw new Error('User must be authenticated');
    }

    const userId = request.auth.uid;
    
    // Get user's email from Firebase Auth
    const userRecord = await admin.auth().getUser(userId);
    const userEmail = userRecord.email;

    logger.info(`🔐 Sending custom password reset email to: ${userEmail}`);

    try {
      // Generate a custom password reset token
      const resetToken = require('crypto').randomBytes(32).toString('hex');
      
      // Store the token in Firestore with expiration (1 hour)
      const tokenRef = admin.firestore().collection('passwordResetTokens').doc(resetToken);
      await tokenRef.set({
        userId,
        userEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        used: false
      });

      // Send custom password reset email via Resend
      await emailService.sendCustomPasswordResetEmail(userEmail, resetToken);
      
      logger.info(`✅ Custom password reset email sent to: ${userEmail}`);
      return { success: true, message: 'Password reset email sent' };
      
    } catch (error) {
      logger.error('❌ Failed to send custom password reset email:', error);
      throw new Error('Failed to send password reset email');
    }
  }
);

// Password reset for unauthenticated users (forgot password flow)
// This uses your custom email templates via Resend
exports.requestPasswordReset = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const { email } = request.data;

    if (!email) {
      throw new HttpsError('invalid-argument', 'Email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();
    logger.info(`🔐 Requesting password reset for: ${normalizedEmail}`);

    try {
      // Find user by email using Admin SDK (works even if account is disabled)
      let userRecord;
      try {
        userRecord = await admin.auth().getUserByEmail(normalizedEmail);
      } catch (authError) {
        if (authError.code === 'auth/user-not-found') {
          // Don't reveal if user exists - return success anyway for security
          logger.info(`ℹ️ User not found for email: ${normalizedEmail} (returning success for security)`);
          return { success: true, message: 'If an account exists, a password reset email has been sent' };
        }
        throw authError;
      }

      const userId = userRecord.uid;
      logger.info(`✅ Found user for password reset: ${userId}`);

      // Generate a custom password reset token
      const resetToken = require('crypto').randomBytes(32).toString('hex');
      
      // Store the token in Firestore with expiration (1 hour)
      const tokenRef = admin.firestore().collection('passwordResetTokens').doc(resetToken);
      await tokenRef.set({
        userId,
        userEmail: normalizedEmail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        used: false
      });

      // Prefer branded Resend email; fall back to Firebase Auth email if Resend fails
      // (e.g. sending domain not verified — otherwise users see "check inbox" with nothing delivered).
      const sent = await emailService.sendCustomPasswordResetEmail(normalizedEmail, resetToken);
      if (!sent) {
        const { sendFirebasePasswordResetEmail } = require('./firebaseAuthEmailFallback');
        await sendFirebasePasswordResetEmail(normalizedEmail);
        logger.info(`✅ Password reset sent via Firebase fallback to: ${normalizedEmail}`);
      } else {
        logger.info(`✅ Custom password reset email sent to: ${normalizedEmail}`);
      }
      return { success: true, message: 'Password reset email sent' };
      
    } catch (error) {
      logger.error('❌ Failed to send password reset email:', error);
      // Last-resort Firebase OOB so lockouts are recoverable even when Resend is fully down
      try {
        const { sendFirebasePasswordResetEmail } = require('./firebaseAuthEmailFallback');
        await sendFirebasePasswordResetEmail(normalizedEmail);
        logger.info(`✅ Password reset sent via Firebase catch-fallback to: ${normalizedEmail}`);
      } catch (fallbackErr) {
        logger.error('❌ Firebase password-reset fallback also failed:', fallbackErr);
      }
      // Don't reveal if user exists - return success anyway for security
      return { success: true, message: 'If an account exists, a password reset email has been sent' };
    }
  }
);

// Custom email verification function
exports.sendCustomVerificationEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to request a verification email');
  }

  const userId = request.auth.uid;
  
  // Get user's email from Firebase Auth
  const userRecord = await admin.auth().getUser(userId);
  const userEmail = userRecord.email;

  // Where the user should return after clicking the email link in a browser.
  // native = reopen the iOS/Android app; web = stay in browser dashboard.
  const requestedReturnTo = request.data?.returnTo === 'native' ? 'native' : 'web';
  let returnTo = requestedReturnTo;
  try {
    const userDoc = await admin.firestore().collection('users').doc(userId).get();
    const deviceInfo = userDoc.exists ? userDoc.data()?.deviceInfo : null;
    if (deviceInfo?.isNative === true || deviceInfo?.platform === 'ios' || deviceInfo?.platform === 'android' || userDoc.exists && userDoc.data()?.verificationReturnTo === 'native') {
      // Prefer original signup surface (native app) so browser verify can reopen the app
      returnTo = 'native';
    }
    if (requestedReturnTo === 'native') {
      returnTo = 'native';
    }
    // Persist for later token/resend fallbacks
    if (userDoc.exists) {
      await userDoc.ref.set({ verificationReturnTo: returnTo }, { merge: true });
    }
  } catch (lookupErr) {
    logger.warn('Could not resolve verification returnTo from user doc:', lookupErr?.message || lookupErr);
  }

  logger.info(`📧 Sending custom verification email to: ${userEmail} (returnTo=${returnTo})`);

  try {
    // Generate a custom verification token
    const verificationToken = require('crypto').randomBytes(32).toString('hex');
    
    // Store the token in Firestore with expiration (1 hour)
    const tokenRef = admin.firestore().collection('verificationTokens').doc(verificationToken);
    await tokenRef.set({
      userId,
      userEmail,
      returnTo,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      used: false
    });

    // Send custom verification email via Resend
    await emailService.sendCustomVerificationEmail(userEmail, verificationToken, { returnTo });
    
    logger.info(`✅ Custom verification email sent to: ${userEmail}`);
    return { success: true, message: 'Verification email sent', returnTo };
  } catch (error) {
    logger.error('❌ Failed to send custom verification email:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    throw new HttpsError('internal', 'Failed to send verification email. Please try again.');
  }
});

// Verify email with custom token
exports.verifyEmailWithToken = onCall(
  {
    cors: true
  },
  async (request) => {
  const { token } = request.data;

  if (!token) {
    logger.error('❌ Verification failed: No token provided');
    throw new HttpsError('invalid-argument', 'Verification token is required');
  }

  logger.info(`🔍 Verifying email with token: ${token.substring(0, 8)}...`);

  try {
    // Get the token from Firestore
    const tokenRef = admin.firestore().collection('verificationTokens').doc(token);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      logger.error(`❌ Verification failed: Token not found in Firestore: ${token.substring(0, 8)}...`);
      throw new HttpsError('not-found', 'Invalid verification token. Please request a new verification email.');
    }

    const tokenData = tokenDoc.data();
    
    if (!tokenData) {
      logger.error(`❌ Verification failed: Token data is null for token: ${token.substring(0, 8)}...`);
      throw new HttpsError('invalid-argument', 'Invalid verification token. Please request a new verification email.');
    }
    
    // Check if token is expired
    if (tokenData.expiresAt) {
      const expiresAt = tokenData.expiresAt.toDate ? tokenData.expiresAt.toDate() : new Date(tokenData.expiresAt);
      if (new Date() > expiresAt) {
        logger.error(`❌ Verification failed: Token expired for user: ${tokenData.userId}`);
        throw new HttpsError('deadline-exceeded', 'Verification link has expired. Please request a new verification email.');
      }
    }

    if (!tokenData.userId) {
      logger.error(`❌ Verification failed: Token missing userId: ${token.substring(0, 8)}...`);
      throw new HttpsError('invalid-argument', 'Invalid verification token. Please request a new verification email.');
    }

    // Check if email is already verified FIRST (before checking if token is used)
    // This allows us to show a friendly "Already Verified" message even if they click a used link
    let userRecord;
    let alreadyVerified = false;
    try {
      userRecord = await admin.auth().getUser(tokenData.userId);
      if (userRecord.emailVerified) {
        alreadyVerified = true;
        logger.info(`ℹ️ Email already verified for user: ${tokenData.userId}`);
      }
    } catch (authError) {
      logger.warn(`⚠️ Could not check verification status:`, authError);
    }

    // Check if token is already used
    if (tokenData.used) {
      // If email is already verified, show friendly message instead of error
      if (alreadyVerified) {
        logger.info(`✅ Email already verified and token was used - showing friendly message`);
        return { 
          success: true, 
          alreadyVerified: true,
          returnTo: tokenData.returnTo || 'web',
          message: 'Your email is already verified. You\'re all set!' 
        };
      }
      // Otherwise, show error for used token
      logger.warn(`⚠️ Verification failed: Token already used for user: ${tokenData.userId}`);
      throw new HttpsError('already-exists', 'This verification link has already been used.');
    }

    // Mark token as used FIRST (before updating user) to prevent race conditions
    await tokenRef.update({ 
      used: true, 
      usedAt: admin.firestore.FieldValue.serverTimestamp() 
    });

    logger.info(`📝 Token marked as used for user: ${tokenData.userId}`);

    // If already verified, return early with a friendly message
    if (alreadyVerified) {
      logger.info(`✅ Email already verified for user: ${tokenData.userId}, returning early`);
      return { 
        success: true, 
        alreadyVerified: true,
        returnTo: tokenData.returnTo || 'web',
        message: 'Your email is already verified. You\'re all set!' 
      };
    }

    // Update user's email verification status in Firebase Auth (CRITICAL: This is what the frontend checks)
    try {
      await admin.auth().updateUser(tokenData.userId, {
        emailVerified: true
      });
      logger.info(`✅ Firebase Auth emailVerified set to true for user: ${tokenData.userId}`);
    } catch (authError) {
      logger.error(`❌ Failed to update Firebase Auth for user ${tokenData.userId}:`, authError);
      // Continue to update Firestore even if Auth update fails
    }

    // Update user's email verification status in Firestore (for record keeping)
    try {
      const userRef = admin.firestore().collection('users').doc(tokenData.userId);
      await userRef.update({ 
        emailVerified: true,
        emailVerifiedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      logger.info(`✅ Firestore emailVerified set to true for user: ${tokenData.userId}`);
    } catch (firestoreError) {
      logger.error(`❌ Failed to update Firestore for user ${tokenData.userId}:`, firestoreError);
      // Don't fail the whole operation if Firestore update fails
    }

    // Resolve where the user should continue after verifying (native app vs web).
    // Prefer token value; fall back to user profile for older tokens.
    let returnTo = tokenData.returnTo === 'native' ? 'native' : 'web';
    if (!tokenData.returnTo) {
      try {
        const userSnap = await admin.firestore().collection('users').doc(tokenData.userId).get();
        const data = userSnap.exists ? userSnap.data() : null;
        if (
          data?.verificationReturnTo === 'native' ||
          data?.deviceInfo?.isNative === true ||
          data?.deviceInfo?.platform === 'ios' ||
          data?.deviceInfo?.platform === 'android'
        ) {
          returnTo = 'native';
        }
      } catch (fallbackErr) {
        logger.warn('Could not resolve returnTo fallback:', fallbackErr?.message || fallbackErr);
      }
    }

    logger.info(`✅ Email verified successfully for user: ${tokenData.userId} (returnTo=${returnTo})`);
    return {
      success: true,
      message: 'Email verified successfully',
      returnTo,
    };
    
  } catch (error) {
    // If it's already an HttpsError, re-throw it
    if (error instanceof HttpsError) {
      throw error;
    }
    
    logger.error('❌ Failed to verify email:', error);
    logger.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Convert to HttpsError for proper client-side handling
    throw new HttpsError('internal', 'Failed to verify email. Please try again or request a new verification email.');
  }
});

// Verify password reset token
exports.verifyResetToken = onCall(
  {
    cors: true
  },
  async (request) => {
    const { token } = request.data;

    if (!token) {
      throw new Error('Reset token is required');
    }

    logger.info(`🔍 Verifying password reset token: ${token}`);

    try {
      // Get the token from Firestore
      const tokenRef = admin.firestore().collection('passwordResetTokens').doc(token);
      const tokenDoc = await tokenRef.get();

      if (!tokenDoc.exists) {
        throw new Error('Invalid password reset token');
      }

      const tokenData = tokenDoc.data();
      
      // Check if token is expired
      if (new Date() > tokenData.expiresAt.toDate()) {
        throw new Error('Password reset token has expired');
      }

      // Check if token is already used
      if (tokenData.used) {
        throw new Error('Password reset token has already been used');
      }

      logger.info(`✅ Password reset token is valid for user: ${tokenData.userId}`);
      return { success: true, message: 'Token is valid' };
      
    } catch (error) {
      logger.error('❌ Failed to verify password reset token:', error);
      return { success: false, message: error.message };
    }
  }
);

// Activate Squarespace subscription (auto-create account + auto-login)
exports.activateSquarespaceSubscription = onCall(
  {
    cors: true
  },
  async (request) => {
    const { token } = request.data;
    
    if (!token) {
      throw new Error('Activation token is required');
    }
    
    logger.info(`🔍 Activating Squarespace subscription with token: ${token.substring(0, 8)}...`);
    
    try {
      // Get pending grant
      const grantRef = admin.firestore()
        .collection('pendingSubscriptions')
        .doc(token);
      const grantDoc = await grantRef.get();
      
      if (!grantDoc.exists) {
        logger.warn(`⚠️ Invalid activation token: ${token.substring(0, 8)}...`);
        throw new HttpsError('not-found', 'Invalid activation link. Please request a new activation email.');
      }
      
      const grant = grantDoc.data();
      
      // Check if grant is expired
      if (grant.expiresAt && grant.expiresAt.toDate() < new Date()) {
        logger.warn(`⚠️ Activation token expired: ${token.substring(0, 8)}...`);
        throw new HttpsError('deadline-exceeded', 'Activation link has expired. Please contact support at contact@thepepplanner.com');
      }
      
      // Check if already activated
      if (grant.status === 'activated') {
        logger.info(`✅ Subscription already activated for token: ${token.substring(0, 8)}...`);
        // Return success but indicate it was already activated
        return { 
          success: true, 
          message: 'Account already activated',
          alreadyActivated: true
        };
      }
      
      // Check if user already exists (race condition protection)
      let userId = await findUserIdByEmail(grant.email);
      let isNewUser = false;
      
      if (!userId) {
        // Auto-create Firebase Auth account
        logger.info(`👤 Creating new user account for: ${grant.email}`);
        const userRecord = await admin.auth().createUser({
          email: grant.email,
          emailVerified: true, // Trust Squarespace verification
          displayName: grant.customerName || null
        });
        
        userId = userRecord.uid;
        isNewUser = true;
        
        // Create user document in Firestore
        await admin.firestore().collection('users').doc(userId).set({
          email: grant.email,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'squarespace',
          squarespaceOrderId: grant.orderId
        });
        
        logger.info(`✅ User account created: ${userId}`);
      }
      
      // Grant subscription immediately
      const now = new Date();
      let periodEnd = null;
      
      if (grant.plan === 'monthly') {
        periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
      } else if (grant.plan === 'annual') {
        periodEnd = new Date(now);
        periodEnd.setFullYear(periodEnd.getFullYear() + 1);
      } else if (grant.plan === 'lifetime') {
        periodEnd = null; // Lifetime never expires
      }
      
      const subscriptionData = {
        plan: grant.plan,
        interval: grant.plan === 'lifetime' ? 'lifetime' : grant.plan === 'monthly' ? 'month' : 'year',
        status: 'active',
        source: 'squarespace',
        squarespaceOrderId: grant.orderId,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: periodEnd?.toISOString() || null,
        hasLifetimeAccess: grant.plan === 'lifetime',
        cancelAtPeriodEnd: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Write to userSubscriptions collection
      await admin.firestore()
        .collection('userSubscriptions')
        .doc(userId)
        .set({
          subscription: subscriptionData,
          userId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      
      // Update users collection
      await admin.firestore()
        .collection('users')
        .doc(userId)
        .set({
          subscription: subscriptionData,
          email: grant.email,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      
      // Mark grant as activated
      await grantRef.update({
        status: 'activated',
        activatedAt: admin.firestore.FieldValue.serverTimestamp(),
        activatedBy: userId
      });
      
      logger.info(`✅ Subscription granted: ${grant.plan} to ${grant.email} (userId: ${userId})`);
      
      // Generate custom token for auto-login
      const customToken = await admin.auth().createCustomToken(userId);
      
      return {
        success: true,
        customToken,
        isNewUser,
        plan: grant.plan
      };
      
    } catch (error) {
      logger.error('❌ Failed to activate Squarespace subscription:', error);
      
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to activate subscription: ${error.message}`);
    }
  }
);

// Helper function to find user by email (used by activation function)
async function findUserIdByEmail(email) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : null;
  if (!normalized) {
    return null;
  }

  const snapshot = await admin.firestore()
    .collection('users')
    .where('email', '==', normalized)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  return snapshot.docs[0].id;
}

// Reset password with custom token
exports.resetPasswordWithToken = onCall(
  {
    cors: true
  },
  async (request) => {
    const { token, newPassword } = request.data;

    if (!token || !newPassword) {
      throw new Error('Token and new password are required');
    }

    logger.info(`🔐 Resetting password with token: ${token}`);

    try {
      // Get the token from Firestore
      const tokenRef = admin.firestore().collection('passwordResetTokens').doc(token);
      const tokenDoc = await tokenRef.get();

      if (!tokenDoc.exists) {
        throw new Error('Invalid password reset token');
      }

      const tokenData = tokenDoc.data();
      
      // Check if token is expired
      if (new Date() > tokenData.expiresAt.toDate()) {
        throw new Error('Password reset token has expired');
      }

      // Check if token is already used
      if (tokenData.used) {
        throw new Error('Password reset token has already been used');
      }

      // Update user's password using Firebase Admin SDK
      await admin.auth().updateUser(tokenData.userId, {
        password: newPassword
      });

      // Mark token as used
      await tokenRef.update({ 
        used: true, 
        usedAt: admin.firestore.FieldValue.serverTimestamp() 
      });

      logger.info(`✅ Password reset successfully for user: ${tokenData.userId}`);
      return { success: true, message: 'Password reset successfully' };
      
    } catch (error) {
      logger.error('❌ Failed to reset password:', error);
      return { success: false, message: error.message };
    }
  }
);

// 📧 Email Functions

// Import and export diagnostic function
const diagnoseEmailIssue = require('./diagnoseEmailIssue');
exports.diagnoseEmailSystem = diagnoseEmailIssue.diagnoseEmailSystem;

// ==================== GHOST WORKER AI AUTOMATION ====================
// Background AI support automation with multi-model routing

// Main Ghost Worker trigger (watches supportTickets collection)
exports.ghostWorkerTriage = ghostWorker.ghostWorkerTriage;
exports.ghostWorkerOnNewMessage = ghostWorker.ghostWorkerOnNewMessage;

// Admin functions
exports.getGhostWorkerStats = ghostWorker.getGhostWorkerStats;
exports.overrideGhostWorkerRouting = ghostWorker.overrideGhostWorkerRouting;

// Testing function (test on existing tickets)
exports.testGhostWorkerOnTicket = ghostWorker.testGhostWorkerOnTicket;

// Telegram integration
// exports.checkDailyBudget = telegramBot.checkDailyBudget; // DISABLED - no hourly alerts needed
exports.sendDailyDigest = telegramBot.sendDailyDigest;
exports.handleTelegramCallback = telegramBot.handleTelegramCallback;

// Test Telegram connectivity
exports.testTelegramConnection = onCall(
  {
    cors: true,
    secrets: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']
  },
  async (request) => {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      
      if (!botToken || !chatId) {
        return {
          success: false,
          error: 'Telegram credentials not configured',
          details: {
            botToken: botToken ? 'SET' : 'MISSING',
            chatId: chatId ? 'SET' : 'MISSING'
          },
          fix: 'Run: firebase functions:secrets:set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID'
        };
      }
      
      // Try to send a test message
      const testMessage = `🧪 *Telegram Test*\n\n✅ Connection successful!\n\nTimestamp: ${new Date().toISOString()}`;
      
      await telegramBot.sendTelegramMessage(botToken, chatId, testMessage);
      
      return {
        success: true,
        message: 'Test message sent successfully to Telegram',
        botToken: `${botToken.substring(0, 10)}...${botToken.substring(botToken.length - 4)}`,
        chatId: chatId
      };
      
    } catch (error) {
      logger.error('Telegram test failed:', error);
      return {
        success: false,
        error: error.message,
        stack: error.stack
      };
    }
  }
);

// Emergency controls
exports.pauseGhostWorker = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      // TODO: Add admin authentication
      const db = admin.firestore();
      
      await db.collection('_config').doc('ghostWorker').set({
        enabled: false,
        pausedAt: admin.firestore.FieldValue.serverTimestamp(),
        pausedBy: request.auth?.email || 'admin',
        reason: request.data.reason || 'Manual pause'
      }, { merge: true });
      
      logger.info('🛑 Ghost Worker paused via admin');
      
      return {
        success: true,
        message: 'Ghost Worker has been paused'
      };
    } catch (error) {
      logger.error('Error pausing Ghost Worker:', error);
      throw new Error('Failed to pause Ghost Worker');
    }
  }
);

exports.resumeGhostWorker = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      // TODO: Add admin authentication
      const db = admin.firestore();
      
      await db.collection('_config').doc('ghostWorker').set({
        enabled: true,
        resumedAt: admin.firestore.FieldValue.serverTimestamp(),
        resumedBy: request.auth?.email || 'admin'
      }, { merge: true });
      
      logger.info('▶️ Ghost Worker resumed via admin');
      
      return {
        success: true,
        message: 'Ghost Worker has been resumed'
      };
    } catch (error) {
      logger.error('Error resuming Ghost Worker:', error);
      throw new Error('Failed to resume Ghost Worker');
    }
  }
);

// Send welcome email when new user is created
exports.onUserCreated = onDocumentCreated(
  {
    document: 'users/{userId}',
    secrets: ['RESEND_API_KEY']
  },
  async (event) => {
  logger.info('🔥 onUserCreated trigger FIRED!');
  logger.info('📋 Event data:', JSON.stringify(event.data ? 'exists' : 'null'));
  logger.info('📋 Event params:', JSON.stringify(event.params));
  
  const userData = event.data?.data();
  const userId = event.params.userId;
  
  logger.info(`📋 User ID from params: ${userId}`);
  logger.info(`📋 User data exists: ${!!userData}`);
  logger.info(`📋 User data keys: ${userData ? Object.keys(userData).join(', ') : 'none'}`);
  
  // Validate email exists
  if (!userData || !userData.email) {
    logger.error(`❌ New user created without email: ${userId}`);
    logger.error(`❌ User data: ${JSON.stringify(userData)}`);
    return null;
  }
  
  const userEmail = userData.email.toLowerCase().trim();
  const userName = userData.displayName || null;
  
  logger.info(`👋 New user created: ${userId} (${userEmail})`);
  logger.info(`📧 Will send welcome and verification emails to: ${userEmail}`);
  
  try {
    // Check for pre-granted lifetime access (granted before user signed up)
    const db = admin.firestore();
    const preGrantRef = db.collection('lifetimeAccessPreGrants').doc(userEmail);
    const preGrantDoc = await preGrantRef.get();
    
    if (preGrantDoc.exists) {
      const preGrant = preGrantDoc.data();
      logger.info(`🎁 Found pre-granted lifetime access for: ${userEmail}`);
      
      if (preGrant.status === 'pending' && preGrant.hasLifetimeAccess) {
        // Apply the pre-grant to the new user
        logger.info(`✅ Applying pre-granted lifetime access to user: ${userId}`);
        
        // Create lifetime access document
        await db.collection('lifetimeAccess').doc(userId).set({
          userId,
          email: userEmail,
          hasLifetimeAccess: true,
          reason: preGrant.reason || 'Beta tester',
          grantedBy: preGrant.grantedBy || 'admin',
          grantedAt: preGrant.grantedAt || admin.firestore.FieldValue.serverTimestamp(),
          status: 'active',
          metadata: preGrant.metadata || {}
        }, { merge: true });
        
        // Update user document
        await db.collection('users').doc(userId).set({
          subscription: {
            hasLifetimeAccess: true,
            lifetimeReason: preGrant.reason || 'Beta tester',
            lifetimeGrantedAt: preGrant.grantedAt || admin.firestore.FieldValue.serverTimestamp(),
            plan: 'lifetime',
            status: 'active'
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        // Write to userSubscriptions collection
        const subscriptionData = {
          hasLifetimeAccess: true,
          interval: 'lifetime',
          status: 'active',
          plan: 'lifetime',
          lifetimeReason: preGrant.reason || 'Beta tester',
          lifetimeGrantedAt: preGrant.grantedAt || admin.firestore.FieldValue.serverTimestamp(),
          currentPeriodEnd: null,
          currentPeriodStart: preGrant.grantedAt || admin.firestore.FieldValue.serverTimestamp(),
          userId: userId,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        };
        
        await db.collection('userSubscriptions').doc(userId).set({
          subscription: subscriptionData
        }, { merge: true });
        
        // Mark pre-grant as applied
        await preGrantRef.update({
          status: 'applied',
          appliedAt: admin.firestore.FieldValue.serverTimestamp(),
          appliedToUserId: userId
        });
        
        logger.info(`✅ Pre-granted lifetime access applied successfully to: ${userId}`);
      }
    } else {
      // ═══════════════════════════════════════════════════════════════════════
      // NEW USER TRIAL INITIALIZATION (CRITICAL FIX)
      // ═══════════════════════════════════════════════════════════════════════
      // No pre-granted lifetime access → initialize 14-day Research+ trial.
      // This is the source of truth for new-user trial entitlement. Without it,
      // new signups fall through to Free plan immediately, which violates the
      // product requirement: "New signup = 14-day Research+ trial then Free."
      
      logger.info(`🎁 Initializing 14-day Research+ trial for new user: ${userId}`);
      
      const now = new Date();
      const TRIAL_DAYS = 14; // 14-day trial for all new signups after 2026-03-10
      const trialEnd = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      
      const trialSubscription = {
        status: 'trialing',
        interval: 'trial',
        plan: '14-Day Research Trial',
        tier: 'research_plus', // Give full Research+ features during trial
        startedAt: now.toISOString(),
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: trialEnd.toISOString(),
        userId: userId,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        trialStartedAt: now.toISOString(),
        trialDays: TRIAL_DAYS,
      };
      
      // Write to users collection (embedded subscription)
      await db.collection('users').doc(userId).set({
        subscription: trialSubscription,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      
      // Write to userSubscriptions collection (canonical subscription source)
      await db.collection('userSubscriptions').doc(userId).set({
        subscription: trialSubscription,
      }, { merge: true });
      
      logger.info(`✅ 14-day Research+ trial initialized for ${userId} (expires: ${trialEnd.toISOString()})`);
    }
    
    // Send welcome email
    logger.info(`📧 Attempting to send welcome email to: ${userEmail}`);
    logger.info(`📧 User ID: ${userId}, User Name: ${userName || 'null'}`);

    
    const welcomeEmailSent = await emailService.sendWelcomeEmail(userEmail, userName, {
      userId: userId,
      sentBy: 'system'
    });
    
    logger.info(`📧 sendWelcomeEmail returned: ${welcomeEmailSent}`);
    
    // Note: sendWelcomeEmail now logs to emailHistory automatically via sendEmail
    // But we'll keep this as a backup in case logToHistory fails
    if (!welcomeEmailSent) {
      logger.error(`❌ Failed to send welcome email to: ${userEmail}`);
      
      // Log failed attempt as backup (sendEmail should have already logged it)
      try {
        await db.collection('emailHistory').add({
          type: 'welcome',
          recipientEmail: userEmail,
          recipientName: userName,
          userId: userId,
          subject: 'Welcome to The Pep Planner! 🎉',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'system',
          error: 'sendWelcomeEmail returned false'
        });
      } catch (logError) {
        logger.error('❌ Failed to log welcome email failure:', logError);
      }
    }
    
    // Send custom verification email
    logger.info(`📧 Generating verification token for: ${userEmail}`);
    const verificationToken = require('crypto').randomBytes(32).toString('hex');
    const returnTo =
      userData?.deviceInfo?.isNative === true ||
      userData?.deviceInfo?.platform === 'ios' ||
      userData?.deviceInfo?.platform === 'android' ||
      userData?.verificationReturnTo === 'native'
        ? 'native'
        : 'web';
    
    // Store the token in Firestore with expiration (1 hour)
    const tokenRef = admin.firestore().collection('verificationTokens').doc(verificationToken);
    await tokenRef.set({
      userId,
      userEmail: userEmail,
      returnTo,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      used: false
    });
    logger.info(`✅ Verification token stored for: ${userEmail} (returnTo=${returnTo})`);

    // Send custom verification email via Resend
    logger.info(`📧 Attempting to send verification email to: ${userEmail}`);
    logger.info(`📧 Verification token generated: ${verificationToken.substring(0, 10)}...`);
    
    const verificationEmailSent = await emailService.sendCustomVerificationEmail(userEmail, verificationToken, {
      userId: userId,
      recipientName: userName,
      sentBy: 'system',
      returnTo,
    });
    
    logger.info(`📧 sendCustomVerificationEmail returned: ${verificationEmailSent}`);
    
    // Note: sendCustomVerificationEmail should log to emailHistory automatically
    // But we'll keep this as a backup in case it fails
    if (!verificationEmailSent) {
      logger.error(`❌ Failed to send verification email to: ${userEmail}`);
      
      // Log failed attempt as backup
      try {
        await db.collection('emailHistory').add({
          type: 'verification',
          recipientEmail: userEmail,
          recipientName: userName,
          userId: userId,
          subject: 'Verify your email for The Pep Planner',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'system',
          error: 'sendCustomVerificationEmail returned false'
        });
      } catch (logError) {
        logger.error('❌ Failed to log verification email failure:', logError);
      }
    }
    
  } catch (error) {
    logger.error('❌ Failed to send emails:', error);
    logger.error('❌ Error details:', {
      message: error.message,
      stack: error.stack,
      userId: userId,
      userEmail: userEmail
    });
    
    // Log error to email history
    try {
      await admin.firestore().collection('emailHistory').add({
        type: 'welcome',
        recipientEmail: userEmail,
        recipientName: userName,
        userId: userId,
        subject: 'Welcome to The Pep Planner! 🎉',
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'error',
        error: error.message,
        sentBy: 'system'
      });
    } catch (logError) {
      logger.error('❌ Failed to log email error to history:', logError);
    }
    // Don't fail the function if email fails
  }
  
  return null;
});

// Trial ending reminders are handled by emailAutomation.checkTrialEndingSoon
// (removed duplicate scheduledTrialReminders)

// Shared logic for the win-back campaign — used by both the scheduled and manual triggers
async function runWinBackCampaign(db, sentBy = 'scheduled') {
  logger.info(`📧 Running win-back campaign (triggered by: ${sentBy})...`);

  const now = new Date();
  const fourteenDaysAgo = new Date(now);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
  const oneEightyDaysAgo = new Date(now);
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);
  const sixtyDaysAgo = new Date(now);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

  // Pre-fetch all win-back emails — query on type only (no composite index needed), filter date in JS
  const recentWinBackSnap = await db.collection('emailHistory')
    .where('type', '==', 'winBack')
    .get();
  const recentWinBackEmails = new Set(
    recentWinBackSnap.docs
      .filter(d => {
        const sentAt = d.data().sentAt;
        if (!sentAt) return false;
        const date = sentAt.toDate ? sentAt.toDate() : new Date(sentAt);
        return date >= sixtyDaysAgo;
      })
      .map(d => d.data().recipientEmail)
      .filter(Boolean)
  );
  logger.info(`📬 Pre-loaded ${recentWinBackEmails.size} recent win-back recipients (60-day dedup set)`);

  // Query all users — filter in JS since subscription.status is inconsistent
  const usersSnapshot = await db.collection('users').get();
  logger.info(`📊 Total users scanned: ${usersSnapshot.size}`);

  let sent = 0;
  let skipped = 0;

  for (const userDoc of usersSnapshot.docs) {
    const userData = userDoc.data();
    const userEmail = userData.email;
    const userId = userDoc.id;
    const subscription = userData.subscription || {};

    if (!userEmail) { skipped++; continue; }

    // Skip admin accounts
    if (userData.role === 'admin') { skipped++; continue; }

    // Skip lifetime access
    if (subscription.hasLifetimeAccess || subscription.interval === 'lifetime') { skipped++; continue; }

    // Skip users with active paid subscriptions
    if (subscription.status === 'active' &&
        subscription.plan &&
        !['30-Day Research Trial', '7-Day Free Trial'].includes(subscription.plan)) {
      skipped++; continue;
    }

    // Skip users who EVER had a paid subscription (payment history indicators)
    const hasPaymentHistory =
      subscription.stripeSubscriptionId ||
      subscription.stripeCustomerId ||
      subscription.paymentMethodId ||
      subscription.paymentProvider ||
      (subscription.platform && ['stripe', 'google-play', 'apple', 'squarespace'].includes(subscription.platform)) ||
      subscription.googlePlayPurchaseToken ||
      subscription.appleTransactionId ||
      subscription.customerId;
    if (hasPaymentHistory) { skipped++; continue; }

    // Skip if plan name indicates paid subscription
    const plan = (subscription.plan || '').toLowerCase();
    const paidPlanIndicators = ['monthly', 'annual', 'yearly', 'year', 'lifetime', 'subscription'];
    if (paidPlanIndicators.some(ind => plan.includes(ind) && !plan.includes('trial'))) {
      if (!plan.includes('trial') && !plan.includes('free')) { skipped++; continue; }
    }

    // Determine trial end date (same logic as ExpiredTrialManager)
    let trialEndDate = null;
    if (subscription.currentPeriodEnd) {
      trialEndDate = subscription.currentPeriodEnd.toDate
        ? subscription.currentPeriodEnd.toDate()
        : new Date(subscription.currentPeriodEnd);
    } else if (userData.trialEndDate) {
      trialEndDate = userData.trialEndDate.toDate
        ? userData.trialEndDate.toDate()
        : new Date(userData.trialEndDate);
    } else if (userData.createdAt) {
      const created = userData.createdAt.toDate
        ? userData.createdAt.toDate()
        : new Date(userData.createdAt);
      trialEndDate = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);
    }

    if (!trialEndDate || isNaN(trialEndDate.getTime())) { skipped++; continue; }

    // Skip users whose trial is still active
    if (trialEndDate > now) { skipped++; continue; }

    // Must be in the 14–180 day expired window
    if (trialEndDate > fourteenDaysAgo || trialEndDate < oneEightyDaysAgo) { skipped++; continue; }

    // Skip if already received a win-back in the last 60 days (O(1) Set lookup — no Firestore read)
    if (recentWinBackEmails.has(userEmail)) { skipped++; continue; }

    try {
      const userName = userData.displayName || userEmail.split('@')[0];
      const emailSent = await emailService.sendWinBackEmail(userEmail, userName, null);

      if (!emailSent) {
        logger.warn(`⚠️ Win-back email failed (Resend rejected) for ${userEmail}`);
        skipped++;
        continue;
      }

      // Only grant trial extension and log history if email actually sent
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);

      await db.collection('userSubscriptions').doc(userId).set({
        subscription: {
          status: 'trialing',
          currentPeriodEnd: trialEnd.toISOString(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          winBackTrialGranted: true,
          winBackTrialGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      }, { merge: true });

      await db.collection('users').doc(userId).set({
        subscription: {
          status: 'trialing',
          currentPeriodEnd: trialEnd.toISOString(),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        }
      }, { merge: true });

      await db.collection('emailHistory').add({
        type: 'winBack',
        recipientEmail: userEmail,
        userId,
        sentAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'sent',
        sentBy,
        trialExtended: true,
        trialEndDate: trialEnd.toISOString(),
      });

      recentWinBackEmails.add(userEmail);
      sent++;
      logger.info(`✅ Win-back sent to ${userEmail} (${sent} so far)`);
    } catch (emailError) {
      logger.warn(`⚠️ Exception sending win-back to ${userEmail}: ${emailError.message}`);
      skipped++;
    }

    // 300ms between every email + 2s pause every 10 to stay under Resend rate limits
    await new Promise(r => setTimeout(r, 300));
    if (sent % 10 === 0 && sent > 0) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  logger.info(`✅ Win-back campaign complete. Sent: ${sent}, Skipped: ${skipped}`);
  return { success: true, sent, skipped };
}

// Win-back campaign: email churned users (canceled/expired) whose access ended 14–180 days ago
exports.bulkWinBackCampaign = onSchedule({
  schedule: '0 17 * * 5', // Every Friday at 10 AM Mountain Time (17:00 UTC)
  timeZone: 'UTC',
  memory: '1GiB',
  timeoutSeconds: 540,
  secrets: ['RESEND_API_KEY'],
}, async (event) => {
  const db = admin.firestore();
  try {
    return await runWinBackCampaign(db, 'scheduled');
  } catch (error) {
    logger.error('❌ Win-back campaign failed:', error);
    return { success: false, error: error.message };
  }
});

// Manual admin trigger for the win-back campaign — bypasses the Friday schedule
exports.manualTriggerWinBackCampaign = onCall({
  cors: true,
  memory: '1GiB',
  timeoutSeconds: 540,
  secrets: ['RESEND_API_KEY'],
}, async (request) => {
  verifyAdmin(request);
  logger.info(`🔧 Win-back campaign manually triggered by admin: ${request.auth.token.email}`);
  const db = admin.firestore();
  try {
    return await runWinBackCampaign(db, 'manual');
  } catch (error) {
    logger.error('❌ Manual win-back campaign failed:', error);
    return { success: false, error: error.message };
  }
});

// One-time admin function: grant 14-day trial to all lapsed trial users
exports.grantBulkTrialExtension = onCall({
  cors: true,
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Must be authenticated');
  const db = admin.firestore();
  const userDoc = await db.collection('users').doc(request.auth.uid).get();
  if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
    throw new HttpsError('permission-denied', 'Admin access required');
  }

  const now = new Date();
  const oneEightyDaysAgo = new Date(now);
  oneEightyDaysAgo.setDate(oneEightyDaysAgo.getDate() - 180);

  const usersSnapshot = await db.collection('users')
    .where('subscription.status', 'in', ['canceled', 'expired', 'trialing'])
    .get();

  let granted = 0;
  let skipped = 0;
  const paidIntervals = ['monthly', 'annual', 'yearly', 'lifetime'];

  for (const doc of usersSnapshot.docs) {
    const userData = doc.data();
    const sub = userData.subscription || {};
    const userId = doc.id;

    if (sub.hasLifetimeAccess) { skipped++; continue; }
    if (paidIntervals.includes(sub.interval)) { skipped++; continue; }
    if (sub.status === 'active' && sub.interval !== 'trial') { skipped++; continue; }

    // Skip if trial is still active
    if (sub.status === 'trialing') {
      const trialEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
      if (trialEnd && trialEnd > now) { skipped++; continue; }
    }

    // Skip if already has a win-back trial that's still active
    const subDoc = await db.collection('userSubscriptions').doc(userId).get();
    if (subDoc.exists) {
      const subData = subDoc.data()?.subscription || {};
      if (subData.winBackTrialGranted && subData.currentPeriodEnd) {
        const existingEnd = new Date(subData.currentPeriodEnd);
        if (existingEnd > now) { skipped++; continue; }
      }
    }

    // Check time window
    const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
    const createdAt = userData.createdAt ? new Date(userData.createdAt) : null;
    const relevantDate = periodEnd || createdAt;
    if (!relevantDate || relevantDate > now || relevantDate < oneEightyDaysAgo) {
      skipped++;
      continue;
    }

    // Grant 14-day trial
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);

    await db.collection('userSubscriptions').doc(userId).set({
      subscription: {
        status: 'trialing',
        currentPeriodEnd: trialEnd.toISOString(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        winBackTrialGranted: true,
        winBackTrialGrantedAt: admin.firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true });

    await db.collection('users').doc(userId).set({
      subscription: {
        status: 'trialing',
        currentPeriodEnd: trialEnd.toISOString(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      }
    }, { merge: true });

    granted++;
  }

  logger.info(`✅ Bulk trial extension complete. Granted: ${granted}, Skipped: ${skipped}`);
  return { success: true, granted, skipped };
});

// Server-side trial expiry enforcement
// Marks expired trials as 'expired' in Firestore so users can't abuse client-side logic
exports.enforceTrialExpiry = onSchedule({
  schedule: '0 */6 * * *', // Every 6 hours
  timeZone: 'UTC',
  memory: '256MiB',
  timeoutSeconds: 120,
}, async (event) => {
  logger.info('🔒 Running server-side trial expiry enforcement...');
  
  try {
    const db = admin.firestore();
    const now = new Date();
    
    const usersSnapshot = await db.collection('users')
      .where('subscription.status', '==', 'trialing')
      .get();

    let enforced = 0;
    const batch = db.batch();
    let batchCount = 0;

    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const subscription = userData.subscription || {};
      const endDate = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd) : null;
      
      if (endDate && endDate < now) {
        const userId = userDoc.id;
        const expiredPayload = {
          status: 'expired',
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        };

        batch.set(db.collection('userSubscriptions').doc(userId), {
          subscription: expiredPayload
        }, { merge: true });
        batch.set(db.collection('users').doc(userId), {
          subscription: expiredPayload
        }, { merge: true });

        enforced++;
        batchCount += 2;

        // Firestore batch limit is 500 operations
        if (batchCount >= 498) {
          await batch.commit();
          batchCount = 0;
        }
      }
    }

    if (batchCount > 0) {
      await batch.commit();
    }

    logger.info(`✅ Trial expiry enforcement complete. Enforced: ${enforced}`);
    return { success: true, enforced };
  } catch (error) {
    logger.error('❌ Error in trial expiry enforcement:', error);
    return { success: false, error: error.message };
  }
});

// Scheduled function to send survey emails 3 days after trial expires
exports.scheduledTrialExpiredSurvey = onSchedule({
  schedule: '0 * * * *', // Run hourly to check all user timezones
  timeZone: 'UTC',
  secrets: ['RESEND_API_KEY', 'LOGO_URL']
}, async (event) => {
  logger.info('📊 Running scheduled trial expired survey check (hourly check)...');
  
  try {
    const emailService = require('./emailService');
    const db = admin.firestore();
    const now = new Date();
    
    // Find all users with expired trials (status is 'trialing' but trial ended)
    const usersSnapshot = await db
      .collection('users')
      .where('subscription.status', '==', 'trialing')
      .get();
    
    let eligibleUsers = 0;
    const promises = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const subscription = userData.subscription || {};
      
      if (subscription.currentPeriodEnd) {
        const trialEndDate = new Date(subscription.currentPeriodEnd);
        
        // Check if trial expired exactly 3 days ago (within 24-hour window)
        const daysSinceExpiration = Math.floor((now - trialEndDate) / (1000 * 60 * 60 * 24));
        
        if (daysSinceExpiration === 3 && trialEndDate < now) {
          // Check if we already sent this survey (check emailHistory)
          const emailHistoryQuery = await db
            .collection('emailHistory')
            .where('recipientEmail', '==', userData.email)
            .where('type', '==', 'trialExpiredSurvey')
            .get();
          
          if (emailHistoryQuery.empty) {
            eligibleUsers++;
            promises.push(
              emailService.sendTrialExpiredSurveyEmail(
                userData.email,
                userData.displayName || userData.email?.split('@')[0] || 'there',
                null // Will use default survey link from template
              )
              .then(async (success) => {
                if (success) {
                  // Log to email history
                  await db.collection('emailHistory').add({
                    type: 'trialExpiredSurvey',
                    recipientEmail: userData.email,
                    recipientName: userData.displayName || null,
                    subject: 'Quick Survey: Help Us Improve The Pep Planner 📊',
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'sent',
                    sentBy: 'scheduled',
                    trialEndDate: trialEndDate,
                    daysSinceExpiration: 3
                  });
                }
                return success;
              })
          );
          }
        }
      }
    }
    
    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
    
    logger.info(`✅ Trial expired survey emails sent: ${successful}/${eligibleUsers} eligible users`);
    return { success: true, sent: successful, eligible: eligibleUsers };
    
  } catch (error) {
    logger.error('❌ Error in scheduled trial expired survey:', error);
    return { success: false, error: error.message };
  }
});

// DEPRECATED: trial ending at 7 days — replaced by trial milestones + subscription lifecycle cron
exports.scheduledTrialEndingPushNotification = onSchedule({
  schedule: '0 10 * * *',
  timeZone: 'UTC',
  secrets: []
}, async () => {
  logger.info('scheduledTrialEndingPushNotification: deprecated (use sendTrialMilestoneNotifications + scheduledSubscriptionLifecyclePush)');
  return { success: true, deprecated: true };
});

/* Legacy trial-ending push body removed — kept schedule stub to avoid deploy delete errors.
exports.scheduledTrialEndingPushNotification_LEGACY = onSchedule({
  schedule: '0 10 * * *',
  timeZone: 'UTC',
  secrets: []
}, async (event) => {
  logger.info('🔔 Running scheduled trial ending push notification check (day 23)...');
  
  try {
    const pushNotifications = require('./pushNotifications');
    const db = admin.firestore();
    const now = new Date();
    
    // Find all users with active trials
    const usersSnapshot = await db
      .collection('users')
      .where('subscription.status', '==', 'trialing')
      .get();
    
    let eligibleUsers = 0;
    let sentCount = 0;
    let skippedCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userData = userDoc.data();
      const userId = userDoc.id;
      const subscription = userData.subscription || {};
      
      if (!subscription.currentPeriodEnd) {
        continue;
      }
      
      const trialEndDate = new Date(subscription.currentPeriodEnd);
      const daysLeft = Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24));
      
      // Send notification if exactly 23 days left (7 days remaining)
      if (daysLeft === 7) {
        eligibleUsers++;
        
        // Check if user has billing notifications enabled
        const notificationSettings = await pushNotifications.getUserNotificationSettings(userId);
        const billingEnabled = notificationSettings?.billing !== false; // Default to true if not set
        
        if (!billingEnabled) {
          logger.info(`⏭️ Skipping trial ending push notification for ${userData.email} - billing notifications disabled`);
          skippedCount++;
          continue;
        }
        
        // Check if push notifications are enabled
        if (!notificationSettings?.push) {
          logger.info(`⏭️ Skipping trial ending push notification for ${userData.email} - push notifications disabled`);
          skippedCount++;
          continue;
        }
        
        // Check if we already sent this notification (prevent duplicates)
        const notificationHistoryQuery = await db
          .collection('notificationHistory')
          .where('userId', '==', userId)
          .where('type', '==', 'trial_ending_push')
          .where('daysLeft', '==', 7)
          .get();
        
        if (!notificationHistoryQuery.empty) {
          logger.info(`⏭️ Skipping trial ending push notification for ${userData.email} - already sent`);
          skippedCount++;
          continue;
        }
        
        // Load notification template from Firestore (if available) or use default
        let notificationTitle = '⏰ Trial Ending Soon';
        let notificationBody = `Your 30-day trial ends in 7 days. Subscribe to keep your research data!`;
        
        try {
          const templateDoc = await db.collection('notificationTemplates').doc('trialEnding').get();
          if (templateDoc.exists) {
            const template = templateDoc.data();
            notificationTitle = template.title || notificationTitle;
            notificationBody = template.body || notificationBody;
            // Replace variables
            notificationBody = notificationBody.replace(/{daysLeft}/g, '7');
            logger.info('✅ Using custom trial ending notification template from Firestore');
          }
        } catch (error) {
          logger.warn('⚠️ Could not load notification template from Firestore, using default');
        }
        
        // Send push notification
        const notificationData = {
          title: notificationTitle,
          body: notificationBody,
          data: {
            type: 'trial_ending',
            daysLeft: 7,
            clickAction: 'https://thepepplanner.com/app/account',
            appUrl: '/app/account'
          }
        };
        
        const result = await pushNotifications.sendPushNotificationByType(userId, 'billing', notificationData);
        
        if (result.success) {
          sentCount++;
          // Log to notification history
          await db.collection('notificationHistory').add({
            type: 'trial_ending_push',
            userId: userId,
            userEmail: userData.email,
            daysLeft: 7,
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'sent',
            sentBy: 'scheduled'
          });
          logger.info(`✅ Trial ending push notification sent to ${userData.email}`);
        } else {
          logger.warn(`⚠️ Failed to send trial ending push notification to ${userData.email}: ${result.error}`);
        }
      }
    }
    
    logger.info(`✅ Trial ending push notifications: ${sentCount} sent, ${skippedCount} skipped, ${eligibleUsers} eligible`);
    return { success: true, sent: sentCount, skipped: skippedCount, eligible: eligibleUsers };
    
  } catch (error) {
    logger.error('❌ Error in scheduled trial ending push notification:', error);
    return { success: false, error: error.message };
  }
});
*/

// Send custom announcement email (for maintenance, downtime, etc.)
exports.sendCustomAnnouncementEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const { userEmail, userName } = request.data;

    if (!userEmail) {
      throw new Error('userEmail is required');
    }

    logger.info(`📢 Sending custom announcement email to: ${userEmail}`);

    try {
      const emailService = require('./emailService');
      const success = await emailService.sendCustomAnnouncementEmail(userEmail, userName);
      
      const db = admin.firestore();
      
      if (success) {
        logger.info(`✅ Custom announcement email sent successfully to: ${userEmail}`);
        
        // Log to email history
        await db.collection('emailHistory').add({
          type: 'announcement',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: 'Important Announcement - The Pep Planner',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'sent',
          sentBy: 'admin'
        });
        
        return { success: true, message: 'Custom announcement email sent successfully' };
      } else {
        logger.warn(`⚠️ Failed to send custom announcement email to: ${userEmail}`);
        
        // Log failed attempt
        await db.collection('emailHistory').add({
          type: 'announcement',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: 'Important Announcement - The Pep Planner',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'admin'
        });
        
        return { success: false, message: 'Failed to send email' };
      }
    } catch (error) {
      logger.error(`❌ Error sending custom announcement email: ${error.message}`);
      throw new Error('Failed to send custom announcement email');
    }
  }
);

// Send trial expired survey email (callable from admin panel)
exports.sendTrialExpiredSurveyEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const { userEmail, userName, surveyLink } = request.data;

    if (!userEmail) {
      throw new Error('userEmail is required');
    }

    logger.info(`📊 Sending trial expired survey email to: ${userEmail}`);

    try {
      const emailService = require('./emailService');
      const success = await emailService.sendTrialExpiredSurveyEmail(userEmail, userName, surveyLink);
      
      const db = admin.firestore();
      
      if (success) {
        logger.info(`✅ Trial expired survey email sent successfully to: ${userEmail}`);
        
        // Log to email history
        await db.collection('emailHistory').add({
          type: 'trialExpiredSurvey',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: 'Quick Survey: Help Us Improve The Pep Planner 📊',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'sent',
          sentBy: 'admin'
        });
        
        return { success: true, message: 'Trial expired survey email sent successfully' };
      } else {
        logger.warn(`⚠️ Failed to send trial expired survey email to: ${userEmail}`);
        
        // Log failed attempt
        await db.collection('emailHistory').add({
          type: 'trialExpiredSurvey',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: 'Quick Survey: Help Us Improve The Pep Planner 📊',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'admin'
        });
        
        return { success: false, message: 'Failed to send email' };
      }
    } catch (error) {
      logger.error(`❌ Error sending trial expired survey email: ${error.message}`);
      throw new Error('Failed to send trial expired survey email');
    }
  }
);

// Send account deletion email
exports.sendAccountDeletionEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const { userEmail, userName } = request.data;

    if (!userEmail) {
      throw new Error('userEmail is required');
    }

    logger.info(`📧 Sending account deletion email to: ${userEmail}`);

    try {
      const db = admin.firestore();
      const emailService = require('./emailService');
      const success = await emailService.sendAccountDeletionEmail(userEmail, userName);
      
      if (success) {
        logger.info(`✅ Account deletion email sent successfully to: ${userEmail}`);
        
        // Log to email history
        await db.collection('emailHistory').add({
          type: 'account_deletion',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: 'Account Deletion Confirmation - The Pep Planner',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'sent',
          sentBy: 'admin'
        });
        
        return { success: true, message: 'Account deletion email sent successfully' };
      } else {
        logger.warn(`⚠️ Failed to send account deletion email to: ${userEmail}`);
        
        // Log failed attempt
        await db.collection('emailHistory').add({
          type: 'account_deletion',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: 'Account Deletion Confirmation - The Pep Planner',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'admin'
        });
        
        return { success: false, message: 'Failed to send email' };
      }
    } catch (error) {
      logger.error(`❌ Error sending account deletion email: ${error.message}`);
      throw new Error('Failed to send account deletion email');
    }
  }
);

/**
 * Legacy callable: NO-OP. Email change flow now uses requestEmailChangeVerification only.
 * Kept so old clients do not error; no email is sent from this path.
 */
exports.sendEmailChangeNotification = onCall(
  { cors: true },
  async (request) => {
    if (request.auth && request.data?.oldEmail && request.data?.newEmail) {
      logger.info(`📧 [Legacy no-op] sendEmailChangeNotification called for ${request.data.oldEmail} -> ${request.data.newEmail}; use requestEmailChangeVerification instead.`);
    }
    return { success: true, message: 'Use requestEmailChangeVerification for email change flow.' };
  }
);

/**
 * Legacy callable: NO-OP. Email change flow now uses requestEmailChangeVerification only (sends one email with link).
 * Kept so old clients do not error; no email is sent from this path.
 */
exports.sendEmailChangeVerificationNotification = onCall(
  { cors: true },
  async (request) => {
    if (request.auth && request.data?.newEmail && request.data?.oldEmail) {
      logger.info(`📧 [Legacy no-op] sendEmailChangeVerificationNotification called for ${request.data.newEmail}; use requestEmailChangeVerification instead.`);
    }
    return { success: true, message: 'Use requestEmailChangeVerification for email change flow.' };
  }
);

/**
 * Request email change verification: sends ONE branded email to the new address WITH the verification link.
 * Replaces the old flow (Firebase native email + instructional email). User must be authenticated and
 * should have re-authenticated with password before calling (client enforces that).
 */
exports.requestEmailChangeVerification = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'You must be logged in to change your email.');
    }

    const { newEmail } = request.data;
    const currentEmail = (request.auth.token.email || '').toLowerCase().trim();
    const normalizedNew = (newEmail || '').toLowerCase().trim();

    if (!normalizedNew) {
      throw new HttpsError('invalid-argument', 'newEmail is required');
    }
    if (!currentEmail) {
      throw new HttpsError('invalid-argument', 'Could not determine current email.');
    }
    if (currentEmail === normalizedNew) {
      throw new HttpsError('invalid-argument', 'New email must be different from current email.');
    }

    logger.info(`📧 Request email change verification: ${currentEmail} -> ${normalizedNew}`);

    try {
      const userRecord = await admin.auth().getUser(request.auth.uid);
      const displayName = userRecord.displayName || null;
      const userId = userRecord.uid;

      const actionCodeSettings = {
        url: 'https://thepepplanner.com/app/account/profile',
        handleCodeInApp: false
      };
      const verificationLink = await admin.auth().generateVerifyAndChangeEmailLink(
        currentEmail,
        normalizedNew,
        actionCodeSettings
      );

      const sent = await emailService.sendEmailChangeVerificationWithLink(
        normalizedNew,
        currentEmail,
        verificationLink,
        { userId, recipientName: displayName, sentBy: 'system' }
      );
      if (!sent) {
        logger.warn(`⚠️ Failed to send verification email to ${normalizedNew}`);
        return { success: false, message: 'Failed to send verification email.' };
      }

      try {
        await emailService.sendEmailChangeNotification(
          currentEmail,
          normalizedNew,
          new Date().toISOString(),
          { userId, recipientName: displayName, sentBy: 'system' }
        );
      } catch (notificationErr) {
        logger.warn('Failed to send security notification to old email:', notificationErr);
      }

      logger.info(`✅ Email change verification sent to ${normalizedNew}`);
      return { success: true, message: 'Verification email sent.' };
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        throw new HttpsError('already-exists', 'This email address is already in use by another account.');
      }
      logger.error('❌ requestEmailChangeVerification error:', error);
      throw new HttpsError('internal', error.message || 'Failed to send verification email.');
    }
  }
);

/**
 * Admin-only: Resend email change verification link to the NEW email via Resend (bypasses Firebase native email).
 * Use when the user did not receive Firebase's verification email (e.g. spam, deliverability).
 * Generates the link with Firebase Admin generateVerifyAndChangeEmailLink and sends it in a branded email.
 */
exports.resendEmailChangeVerificationLink = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    verifyAdmin(request);
    const { currentEmail, newEmail } = request.data;

    if (!currentEmail || !newEmail) {
      throw new HttpsError('invalid-argument', 'currentEmail and newEmail are required');
    }

    const normalizedCurrent = currentEmail.toLowerCase().trim();
    const normalizedNew = newEmail.toLowerCase().trim();
    if (normalizedCurrent === normalizedNew) {
      throw new HttpsError('invalid-argument', 'currentEmail and newEmail must be different');
    }

    logger.info(`📧 [Admin] Resending email change verification link: ${normalizedCurrent} -> ${normalizedNew}`);

    try {
      const userRecord = await admin.auth().getUserByEmail(normalizedCurrent);
      const userId = userRecord.uid;
      const displayName = userRecord.displayName || null;

      const actionCodeSettings = {
        url: 'https://thepepplanner.com/app/account/profile',
        handleCodeInApp: false
      };
      const verificationLink = await admin.auth().generateVerifyAndChangeEmailLink(
        normalizedCurrent,
        normalizedNew,
        actionCodeSettings
      );

      const success = await emailService.sendEmailChangeVerificationWithLink(
        normalizedNew,
        normalizedCurrent,
        verificationLink,
        { userId, recipientName: displayName, sentBy: 'admin' }
      );

      if (success) {
        logger.info(`✅ Email change verification link sent to ${normalizedNew}`);
        return { success: true, message: 'Verification email sent to ' + normalizedNew };
      }
      logger.warn(`⚠️ Failed to send email change verification to ${normalizedNew}`);
      return { success: false, message: 'Failed to send verification email' };
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        throw new HttpsError('not-found', 'No user found with current email: ' + normalizedCurrent);
      }
      logger.error('❌ resendEmailChangeVerificationLink error:', error);
      throw new HttpsError('internal', error.message || 'Failed to resend verification link');
    }
  }
);

// Check and clean up blocked account (for admin use)
// This function can see disabled accounts that client SDK cannot
exports.checkAndCleanBlockedAccount = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      verifyAdmin(request);
      const { email } = request.data;
      
      if (!email) {
        throw new Error('Email is required');
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      logger.info(`🔍 Checking blocked account for: ${normalizedEmail}`);
      
      let userRecord = null;
      let userId = null;
      
      // Try to find user by email using Admin SDK (can see disabled accounts)
      try {
        userRecord = await admin.auth().getUserByEmail(normalizedEmail);
        userId = userRecord.uid;
        logger.info(`✅ Found user in Firebase Auth: ${userId}`);
        logger.info(`   Disabled: ${userRecord.disabled || false}`);
        logger.info(`   Email verified: ${userRecord.emailVerified || false}`);
        logger.info(`   Created: ${userRecord.metadata.creationTime}`);
        logger.info(`   Last sign in: ${userRecord.metadata.lastSignInTime || 'Never'}`);
      } catch (authError) {
        if (authError.code === 'auth/user-not-found') {
          logger.info('ℹ️ User not found in Firebase Auth');
        } else {
          logger.error('❌ Error checking Firebase Auth:', authError);
          throw authError;
        }
      }
      
      // Check Firestore
      let firestoreDoc = null;
      try {
        const db = admin.firestore();
        const userQuery = await db.collection('users')
          .where('email', '==', normalizedEmail)
          .limit(1)
          .get();
        
        if (!userQuery.empty) {
          firestoreDoc = userQuery.docs[0];
          logger.info(`✅ Found user in Firestore: ${firestoreDoc.id}`);
        } else {
          logger.info('ℹ️ User not found in Firestore');
        }
      } catch (firestoreError) {
        logger.error('❌ Error checking Firestore:', firestoreError);
      }
      
      const result = {
        email: normalizedEmail,
        existsInAuth: !!userRecord,
        existsInFirestore: !!firestoreDoc,
        userId: userId,
        firestoreId: firestoreDoc?.id || null,
        disabled: userRecord?.disabled || false,
        emailVerified: userRecord?.emailVerified || false,
        canDelete: false,
        message: ''
      };
      
      // Determine if we can delete
      if (userRecord && !firestoreDoc) {
        result.canDelete = true;
        result.message = 'Account exists in Auth but not Firestore - can be safely deleted';
      } else if (userRecord && firestoreDoc) {
        result.canDelete = true;
        result.message = 'Account exists in both Auth and Firestore - can be deleted (will remove both)';
      } else if (!userRecord && firestoreDoc) {
        result.canDelete = true;
        result.message = 'Account exists only in Firestore - can be deleted';
      } else {
        result.message = 'Account not found in Auth or Firestore - may be propagation delay';
      }
      
      return result;
    } catch (error) {
      logger.error('❌ Error checking blocked account:', error);
      throw new Error(`Failed to check account: ${error.message}`);
    }
  }
);

// Delete blocked account (for admin use)
exports.deleteBlockedAccount = onCall(
  {
    cors: true
  },
  async (request) => {
    try {
      verifyAdmin(request);
      const { email, deleteFirestore = true } = request.data;
      
      if (!email) {
        throw new Error('Email is required');
      }
      
      const normalizedEmail = email.toLowerCase().trim();
      logger.info(`🗑️ Deleting blocked account for: ${normalizedEmail}`);
      
      const db = admin.firestore();
      let deletedAuth = false;
      let deletedFirestore = false;
      let userId = null;
      
      // Delete from Firebase Auth
      try {
        const userRecord = await admin.auth().getUserByEmail(normalizedEmail);
        userId = userRecord.uid;
        await admin.auth().deleteUser(userId);
        deletedAuth = true;
        logger.info(`✅ Deleted user from Firebase Auth: ${userId}`);
      } catch (authError) {
        if (authError.code === 'auth/user-not-found') {
          logger.info('ℹ️ User not found in Firebase Auth (may already be deleted)');
        } else {
          logger.error('❌ Error deleting from Firebase Auth:', authError);
          throw authError;
        }
      }
      
      // Delete from Firestore
      if (deleteFirestore) {
        try {
          // Try to find by email
          const userQuery = await db.collection('users')
            .where('email', '==', normalizedEmail)
            .limit(1)
            .get();
          
          if (!userQuery.empty) {
            const firestoreId = userQuery.docs[0].id;
            await db.collection('users').doc(firestoreId).delete();
            deletedFirestore = true;
            logger.info(`✅ Deleted user from Firestore: ${firestoreId}`);
          } else if (userId) {
            // Try by UID if we have it
            try {
              await db.collection('users').doc(userId).delete();
              deletedFirestore = true;
              logger.info(`✅ Deleted user from Firestore by UID: ${userId}`);
            } catch (e) {
              logger.info('ℹ️ User not found in Firestore (may already be deleted)');
            }
          } else {
            logger.info('ℹ️ User not found in Firestore');
          }
        } catch (firestoreError) {
          logger.error('❌ Error deleting from Firestore:', firestoreError);
          // Don't throw - Auth deletion is more important
        }
      }
      
      return {
        success: true,
        email: normalizedEmail,
        deletedFromAuth: deletedAuth,
        deletedFromFirestore: deletedFirestore,
        message: `Account deleted successfully. Auth: ${deletedAuth ? 'Yes' : 'No'}, Firestore: ${deletedFirestore ? 'Yes' : 'No'}`
      };
    } catch (error) {
      logger.error('❌ Error deleting blocked account:', error);
      throw new Error(`Failed to delete account: ${error.message}`);
    }
  }
);

// Send account deletion request notification to admin
exports.sendAccountDeletionRequestToAdmin = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const { userEmail, userName, dataSummary } = request.data;

    if (!userEmail) {
      throw new Error('userEmail is required');
    }

    logger.info(`📧 Sending account deletion request notification for: ${userEmail}`);

    try {
      const emailService = require('./emailService');
      const success = await emailService.sendAccountDeletionRequestToAdmin(userEmail, userName, dataSummary);
      
      if (success) {
        logger.info(`✅ Account deletion request notification sent successfully for: ${userEmail}`);
        return { success: true, message: 'Account deletion request notification sent successfully' };
      } else {
        logger.warn(`⚠️ Failed to send account deletion request notification for: ${userEmail}`);
        return { success: false, message: 'Failed to send notification email' };
      }
    } catch (error) {
      logger.error(`❌ Error sending account deletion request notification: ${error.message}`);
      throw new Error('Failed to send account deletion request notification');
    }
  }
);

/**
 * Submit account deletion request
 * Creates a pending deletion request for admin approval
 */
exports.submitAccountDeletionRequest = onCall(
  {
    cors: true
  },
  async (request) => {
    // Verify user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to request account deletion');
    }

    const userId = request.auth.uid;
    const userEmail = request.auth.token.email;
    const { dataSummary, userName, source } = request.data;

    logger.info(`📝 Account deletion request submitted by: ${userEmail} (${userId}) from: ${source || 'unknown'}`);

    try {
      const db = admin.firestore();
      
      // Check if there's already a pending or scheduled request
      const existingRequestQuery = await db.collection('accountDeletionRequests')
        .where('userId', '==', userId)
        .where('status', 'in', ['pending', 'scheduled'])
        .get();

      if (!existingRequestQuery.empty) {
        const existing = existingRequestQuery.docs[0].data();
        const msg =
          existing.status === 'scheduled'
            ? 'You already have a scheduled account deletion. Contact support if you need to change this.'
            : 'You already have a pending deletion request. An admin will review it shortly.';
        logger.info(`⚠️ User ${userEmail} already has a ${existing.status} deletion request`);
        return {
          success: true,
          message: msg,
          alreadyExists: true,
          status: existing.status,
        };
      }

      // Get user info
      let userRecord;
      let displayName = userName || null;
      try {
        userRecord = await admin.auth().getUser(userId);
        displayName = userRecord.displayName || userName || userEmail.split('@')[0];
      } catch (error) {
        logger.warn(`⚠️ Could not fetch user record: ${error.message}`);
      }

      // Get subscription info (userSubscriptions stores nested { subscription: { status, interval, ... } })
      let subscriptionInfo = null;
      try {
        const subscriptionDoc = await db.collection('userSubscriptions').doc(userId).get();
        if (subscriptionDoc.exists) {
          subscriptionInfo = subscriptionDoc.data();
        }
      } catch (error) {
        logger.warn(`⚠️ Could not fetch subscription info: ${error.message}`);
      }

      // Normalize: read from nested .subscription when present (canonical structure)
      const sub = subscriptionInfo?.subscription || subscriptionInfo;
      const subStatus = sub?.status;
      const subInterval = sub?.interval;
      const stripeSubId = sub?.stripeSubscriptionId || subscriptionInfo?.stripeSubscriptionId || null;
      const gpToken = sub?.googlePlayPurchaseToken || subscriptionInfo?.googlePlayPurchaseToken || null;
      const gpProductId = sub?.googlePlayProductId || subscriptionInfo?.googlePlayProductId || null;
      const hasApplePaid = sub?.paymentProvider === 'apple' && (sub?.appleOriginalTransactionId || sub?.appleTransactionId);

      // Shared: only "paid" status/interval (exclude trialing, trial, expired, canceled)
      const paidIntervals = ['month', 'monthly', 'year', 'annual'];
      const isPaidStatus = sub && subStatus !== 'trialing' && subStatus !== 'expired' &&
        subStatus !== 'canceled' && subStatus !== 'cancelled' && subInterval !== 'trial' &&
        ((subStatus === 'active' && paidIntervals.includes(subInterval)) || subInterval === 'lifetime' || (sub?.hasLifetimeAccess === true && subInterval === 'lifetime'));

      // "Paid (will be cancelled)" when user has a real paid subscription on Stripe, Google Play, or Apple
      const hasStripePaid = !!(stripeSubId && isPaidStatus);
      const hasGooglePlayPaid = !!(gpToken && gpProductId && isPaidStatus);
      const hasApplePaidSubscription = !!(hasApplePaid && isPaidStatus);
      const isPaidActivePlan = hasStripePaid || hasGooglePlayPaid || hasApplePaidSubscription;

      const {
        getSubscriptionBillingSnapshot,
        normalizePaymentProvider: normalizeDeletionProvider,
      } = require('./accountDeletionCore');
      const billingSnapshot = getSubscriptionBillingSnapshot(subscriptionInfo);
      const resolvedProvider =
        billingSnapshot.provider || normalizeDeletionProvider(sub);

      // Display status for admin (from normalized sub); avoid showing 'unknown' when we have no useful sub
      const displayStatus = (subStatus || subscriptionInfo?.status || null) ? (subStatus || subscriptionInfo?.status) : (subscriptionInfo ? 'none' : 'unknown');

      // Create deletion request
      const deletionRequest = {
        userId: userId,
        userEmail: userEmail,
        userName: displayName,
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending', // pending, approved, rejected, scheduled
        source: source || 'settings',
        dataSummary: dataSummary || {},
        subscriptionInfo: subscriptionInfo ? {
          hasSubscription: isPaidActivePlan || billingSnapshot.canSchedule,
          canSchedule: billingSnapshot.canSchedule,
          stripeSubscriptionId: stripeSubId,
          status: displayStatus,
          paymentProvider: resolvedProvider,
          interval: subInterval || null,
          currentPeriodEnd: billingSnapshot.currentPeriodEnd || sub?.currentPeriodEnd || null,
          cancelAt: sub?.cancelAt || null,
          hasGooglePlay: !!(gpToken && gpProductId),
          hasApple: billingSnapshot.hasApple,
          scheduleBlockReason: billingSnapshot.scheduleBlockReason || null,
        } : {
          hasSubscription: false,
          canSchedule: false,
          status: 'none'
        }
      };

      const docRef = await db.collection('accountDeletionRequests').add(deletionRequest);
      logger.info(`✅ Deletion request created: ${docRef.id} for user: ${userEmail}`);

      // Also create a work queue item for admin visibility
      try {
        await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).add({
          ticketId: docRef.id,
          ticketNumber: docRef.id.slice(-6).toUpperCase(),
          type: 'account_deletion_request',
          subject: 'Account Deletion Request',
          userName: displayName,
          userEmail: userEmail,
          originalMessage: `User requested account deletion from ${source || 'settings'}. ${dataSummary?.totalItems ? `Has ${dataSummary.totalItems} items of data.` : ''}`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          route: 'admin_review',
          confidence: 1.0,
          reasoning: 'Manual account deletion request requires admin approval',
          adminNotes: '',
          markedFixed: false,
          followUpSent: false,
          executionCost: 0,
          userAccountInfo: {
            userId: userId,
            email: userEmail,
            displayName: displayName,
            subscriptionStatus: displayStatus,
            hasActiveSubscription: isPaidActivePlan
          }
        });
        logger.info(`✅ Work queue item created for deletion request`);
      } catch (error) {
        logger.warn(`⚠️ Could not create work queue item: ${error.message}`);
        // Don't fail the request if work queue creation fails
      }

      // Send admin notification email (pass normalized subscription so "Active Subscription" matches Deletions tab)
      try {
        const emailService = require('./emailService');
        await emailService.sendAccountDeletionRequestAdminNotification(
          userEmail,
          displayName,
          dataSummary,
          subscriptionInfo ? { hasSubscription: isPaidActivePlan, status: displayStatus } : null,
          source
        );
        logger.info(`✅ Admin notification email sent for deletion request`);
      } catch (error) {
        logger.warn(`⚠️ Could not send admin notification email: ${error.message}`);
        // Don't fail the request if email sending fails
      }

      // Send user confirmation email
      try {
        const emailService = require('./emailService');
        await emailService.sendAccountDeletionRequestConfirmation(
          userEmail,
          displayName
        );
        logger.info(`✅ User confirmation email sent for deletion request`);
      } catch (error) {
        logger.warn(`⚠️ Could not send user confirmation email: ${error.message}`);
        // Don't fail the request if email sending fails
      }

      return {
        success: true,
        message: 'Your account deletion request has been submitted. An admin will review it within 24-48 hours.',
        requestId: docRef.id
      };
    } catch (error) {
      logger.error(`❌ Error creating deletion request: ${error.message}`);
      throw new HttpsError('internal', `Failed to submit deletion request: ${error.message}`);
    }
  }
);

/**
 * Automated account deletion function
 * Allows users to delete their own account and all associated data
 */
exports.deleteUserAccount = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    // Verify user is authenticated
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated to delete account');
    }

    const userId = request.auth.uid;
    const userEmail = request.auth.token.email;

    logger.info(`🗑️ Starting account deletion for user: ${userEmail} (${userId})`);

    try {
      const db = admin.firestore();
      const auth = admin.auth();
      
      // STEP 1: Get user info BEFORE any deletion (needed for email)
      let userRecord;
      let userName = null;
      try {
        userRecord = await auth.getUser(userId);
        userName = userRecord.displayName || userEmail.split('@')[0];
      } catch (error) {
        logger.warn(`⚠️ Could not fetch user record: ${error.message}`);
        userName = userEmail.split('@')[0]; // Fallback to email username
      }

      // STEP 2: Get subscription info BEFORE deletion (needed for email)
      let subscriptionInfo = null;
      try {
        const subscriptionDoc = await db.collection('userSubscriptions').doc(userId).get();
        if (subscriptionDoc.exists) {
          subscriptionInfo = subscriptionDoc.data();
        }
      } catch (error) {
        logger.warn(`⚠️ Could not fetch subscription info: ${error.message}`);
      }

      // STEP 3: Cancel active subscriptions on all platforms
      const subData = subscriptionInfo?.subscription || subscriptionInfo;
      
      // Stripe
      const stripeSubId = subData?.stripeSubscriptionId || subscriptionInfo?.stripeSubscriptionId;
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
      
      // Google Play
      const gpToken = subData?.googlePlayPurchaseToken;
      const gpProductId = subData?.googlePlayProductId;
      if (gpToken && gpProductId) {
        try {
          const { google } = require('googleapis');
          const keyValue = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
          if (keyValue) {
            const serviceAccountKey = JSON.parse(keyValue.trim().replace(/\r?\n/g, ''));
            const auth = new google.auth.GoogleAuth({
              credentials: serviceAccountKey,
              scopes: ['https://www.googleapis.com/auth/androidpublisher'],
            });
            const client = google.androidpublisher({ version: 'v3', auth });
            await client.purchases.subscriptions.revoke({
              packageName: 'com.thepepplanner.app',
              subscriptionId: gpProductId,
              token: gpToken,
            });
            logger.info(`✅ Revoked Google Play subscription for user ${userId}`);
          }
        } catch (error) {
          logger.warn(`⚠️ Could not revoke Google Play subscription: ${error.message}`);
        }
      }

      // STEP 4: Delete ALL Firestore data first — only send confirmation after account is actually gone
      // A) Collections keyed by userId (direct doc delete)
      const userIdCollections = [
        'users',
        'userData',
        'userdata', // Handle both cases for backwards compatibility
        'userSubscriptions',
        'userPreferences',
        'userState',
        'lifetimeAccess',
        'userSecurity',              // 2FA settings
        'userNotificationSettings',  // Notification preferences
      ];

      const deleteByIdPromises = userIdCollections.map(async (collectionName) => {
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
      });

      await Promise.all(deleteByIdPromises);

      // B) Collections keyed by other IDs — query by email or userId field
      const queryDeleteConfigs = [
        { collection: 'notifications', field: 'userEmail', value: userEmail },
        { collection: 'adminMessages', field: 'userEmail', value: userEmail },
        { collection: 'feedback', field: 'userEmail', value: userEmail },
        { collection: 'user_agreements', field: 'userEmail', value: userEmail },
      ];

      const queryDeletePromises = queryDeleteConfigs.map(async ({ collection: colName, field, value }) => {
        try {
          const snap = await db.collection(colName).where(field, '==', value).get();
          if (!snap.empty) {
            const delBatch = db.batch();
            snap.docs.forEach(d => delBatch.delete(d.ref));
            await delBatch.commit();
            logger.info(`✅ Deleted ${snap.size} ${colName} docs for user`);
          }
        } catch (error) {
          logger.warn(`⚠️ Error deleting ${colName}: ${error.message}`);
        }
      });

      await Promise.all(queryDeletePromises);

      // C) Push subscriptions (may be keyed by subscriptionId, query by userId or endpoint)
      try {
        // Try by userId field first
        let pushSnap = await db.collection('pushSubscriptions').where('userId', '==', userId).get();
        if (pushSnap.empty) {
          // Fallback: try by email
          pushSnap = await db.collection('pushSubscriptions').where('userEmail', '==', userEmail).get();
        }
        if (!pushSnap.empty) {
          const pushBatch = db.batch();
          pushSnap.docs.forEach(d => pushBatch.delete(d.ref));
          await pushBatch.commit();
          logger.info(`✅ Deleted ${pushSnap.size} push subscriptions for user`);
        }
      } catch (error) {
        logger.warn(`⚠️ Error deleting push subscriptions: ${error.message}`);
      }

      // D) Support tickets + messages subcollection
      try {
        const ticketSnap = await db.collection('supportTickets')
          .where('userEmail', '==', userEmail).get();
        if (!ticketSnap.empty) {
          for (const ticketDoc of ticketSnap.docs) {
            const messagesSnap = await ticketDoc.ref.collection('messages').get();
            if (!messagesSnap.empty) {
              const msgBatch = db.batch();
              messagesSnap.docs.forEach(d => msgBatch.delete(d.ref));
              await msgBatch.commit();
            }
            await ticketDoc.ref.delete();
          }
          logger.info(`✅ Deleted ${ticketSnap.size} support tickets + messages for user`);
        }
      } catch (error) {
        logger.warn(`⚠️ Error deleting support tickets: ${error.message}`);
      }

      // STEP 6: Delete from Firebase Auth — account is now fully gone (cannot log in)
      try {
        await auth.deleteUser(userId);
        logger.info(`✅ Deleted user from Firebase Auth: ${userId}`);
      } catch (error) {
        logger.error(`❌ Error deleting user from Firebase Auth: ${error.message}`);
        throw new HttpsError('internal', `Failed to delete user from authentication: ${error.message}`);
      }

      logger.info(`✅ Account deletion completed successfully for: ${userEmail} (${userId})`);

      // STEP 7: Send confirmation email only AFTER data and Auth are deleted (so we only say "deleted" when it's true)
      let goodbyeEmailSentAt = null;
      logger.info(`📧 Sending goodbye email to: ${userEmail} (account already fully deleted)`);
      try {
        const emailService = require('./emailService');
        await emailService.sendAccountDeletionEmail(userEmail, userName);
        goodbyeEmailSentAt = admin.firestore.Timestamp.now();
        logger.info(`✅ Account deletion confirmation email sent to: ${userEmail}`);
      } catch (error) {
        logger.error(`❌ Could not send confirmation email: ${error.message}`);
        // Don't fail — deletion already succeeded; user just won't get the email
      }

      // Log deletion to Firestore for admin tracking (after email so we can store goodbyeEmailSentAt)
      try {
        await db.collection('accountDeletions').add({
          userId: userId,
          userEmail: userEmail,
          userName: userName,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          deletionType: 'self_service',
          deletedBy: userId, // User deleted their own account
          goodbyeEmailSentAt: goodbyeEmailSentAt || null,
          subscriptionCancelled: subscriptionInfo?.stripeSubscriptionId ? true : false,
          stripeSubscriptionId: subscriptionInfo?.stripeSubscriptionId || null,
          dataSummary: {
            hadSubscription: !!subscriptionInfo,
            hadLifetimeAccess: false // Could check lifetimeAccess collection if needed
          }
        });
        logger.info(`✅ Deletion logged to accountDeletions collection`);
      } catch (error) {
        logger.warn(`⚠️ Could not log deletion to Firestore: ${error.message}`);
      }

      return {
        success: true,
        message: 'Account and all associated data have been permanently deleted'
      };
    } catch (error) {
      logger.error(`❌ Error during account deletion: ${error.message}`);
      
      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to delete account: ${error.message}`);
    }
  }
);

// Send in-depth request email
exports.sendInDepthRequestEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const { userEmail, userName, customContent } = request.data;

    if (!userEmail) {
      throw new Error('userEmail is required');
    }

    logger.info(`📧 Sending in-depth request email to: ${userEmail}`);

    try {
      const db = admin.firestore();
      const emailService = require('./emailService');
      const success = await emailService.sendInDepthRequestEmail(userEmail, userName, customContent);
      
      const emailSubject = customContent?.subject || 'In-Depth Request - The Pep Planner';
      
      if (success) {
        logger.info(`✅ In-depth request email sent successfully to: ${userEmail}`);
        
        // Log to email history
        await db.collection('emailHistory').add({
          type: 'in_depth_request',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: emailSubject,
          customContent: customContent || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'sent',
          sentBy: 'admin'
        });
        
        return { success: true, message: 'In-depth request email sent successfully' };
      } else {
        logger.warn(`⚠️ Failed to send in-depth request email to: ${userEmail}`);
        
        // Log failed attempt
        await db.collection('emailHistory').add({
          type: 'in_depth_request',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: emailSubject,
          customContent: customContent || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'admin'
        });
        
        return { success: false, message: 'Failed to send email' };
      }
    } catch (error) {
      logger.error(`❌ Error sending in-depth request email: ${error.message}`);
      throw new Error('Failed to send in-depth request email');
    }
  }
);

// Send invite email
exports.sendInviteEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const { userEmail, userName, inviteLink, customContent } = request.data;

    if (!userEmail) {
      throw new Error('userEmail is required');
    }

    logger.info(`📧 Sending invite email to: ${userEmail}`);

    try {
      const db = admin.firestore();
      const emailService = require('./emailService');
      const success = await emailService.sendInviteEmail(userEmail, userName, inviteLink, customContent);
      
      const emailSubject = customContent?.subject || 'You\'re Invited to The Pep Planner! 🎉';
      
      if (success) {
        logger.info(`✅ Invite email sent successfully to: ${userEmail}`);
        
        // Log to email history
        await db.collection('emailHistory').add({
          type: 'invite',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: emailSubject,
          inviteLink: inviteLink || null,
          customContent: customContent || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'sent',
          sentBy: 'admin'
        });
        
        return { success: true, message: 'Invite email sent successfully' };
      } else {
        logger.warn(`⚠️ Failed to send invite email to: ${userEmail}`);
        
        // Log failed attempt
        await db.collection('emailHistory').add({
          type: 'invite',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: emailSubject,
          inviteLink: inviteLink || null,
          customContent: customContent || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'admin'
        });
        
        return { success: false, message: 'Failed to send email' };
      }
    } catch (error) {
      logger.error(`❌ Error sending invite email: ${error.message}`);
      throw new Error('Failed to send invite email');
    }
  }
);

// Resend email from history
exports.resendEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY', 'LOGO_URL']
  },
  async (request) => {
    const { emailHistoryId, type, recipientEmail, recipientName, subject, customContent, inviteLink, reason } = request.data;

    if (!recipientEmail || !type) {
      throw new Error('recipientEmail and type are required');
    }

    logger.info(`📧 Resending ${type} email to: ${recipientEmail}`);
    logger.info(`📧 Resend will use custom templates from Firestore if available`);

    try {
      const db = admin.firestore();
      const emailService = require('./emailService');
      let success = false;

      // Call the appropriate email service function based on type
      // These functions automatically load custom templates from Firestore
      switch (type) {
        case 'account_deletion':
          logger.info(`📧 Resending account deletion email - will load 'accountDeletion' template`);
          success = await emailService.sendAccountDeletionEmail(recipientEmail, recipientName);
          break;
        case 'in_depth_request':
          logger.info(`📧 Resending in-depth request email - will load 'inDepthRequest' template`);
          success = await emailService.sendInDepthRequestEmail(recipientEmail, recipientName, customContent);
          break;
        case 'invite':
          logger.info(`📧 Resending invite email - will load 'inviteEmail' template`);
          success = await emailService.sendInviteEmail(recipientEmail, recipientName, inviteLink, customContent);
          break;
        case 'lifetime_access':
          logger.info(`📧 Resending lifetime access email - will load 'manualLifetimeGrant' or 'lifetimeAccessGranted' template`);
          success = await emailService.sendLifetimeAccessEmail(recipientEmail, recipientName, reason);
          break;
        case 'announcement':
          logger.info(`📧 Resending announcement email - will load 'customAnnouncement' template`);
          success = await emailService.sendCustomAnnouncementEmail(recipientEmail, recipientName);
          break;
        case 'trialExpiredSurvey':
          logger.info(`📧 Resending trial expired survey email - will load 'trialExpiredSurvey' template`);
          // Extract surveyLink from customContent or use default
          const surveyLink = customContent?.surveyLink || inviteLink || 'https://docs.google.com/forms/d/e/1FAIpQLSfWCDthbS9tBOY-L-XhF4hzYcC6Dd3eXr9cDFANc7-uVJx-eg/viewform?usp=header';
          success = await emailService.sendTrialExpiredSurveyEmail(recipientEmail, recipientName, surveyLink);
          break;
        case 'welcome':
          logger.info(`📧 Resending welcome email - will load 'welcome' template`);
          success = await emailService.sendWelcomeEmail(recipientEmail, recipientName);
          break;
        case 'verification':
          logger.info(`📧 Resending verification email - will load 'verification' template`);
          // For verification, we need a token - can't resend without it
          logger.warn(`⚠️ Cannot resend verification email without token. Use sendCustomVerificationEmail instead.`);
          throw new Error('Cannot resend verification email - token required. Use verification resend from account page.');
        case 'password_reset':
          logger.info(`📧 Resending password reset email - will load 'passwordReset' template`);
          // For password reset, we need a token - can't resend without it
          logger.warn(`⚠️ Cannot resend password reset email without token.`);
          throw new Error('Cannot resend password reset email - token required.');
        default:
          // For unsupported types, try to send a generic email using the subject and customContent
          logger.warn(`⚠️ Unsupported email type for resend: ${type}. Attempting generic send.`);
          if (subject && customContent?.mainMessage) {
            // Use the base sendEmail function with the HTML from customContent
            const html = customContent.html || customContent.mainMessage;
            success = await emailService.sendEmail(recipientEmail, subject, html);
          } else {
            throw new Error(`Unsupported email type for resend: ${type}. Missing subject or content.`);
          }
          break;
      }

      if (success) {
        logger.info(`✅ Email resent successfully to: ${recipientEmail}`);
        
        // Log resend to email history
        await db.collection('emailHistory').add({
          type: type,
          recipientEmail: recipientEmail,
          recipientName: recipientName || null,
          subject: subject || 'Resent Email',
          customContent: customContent || null,
          inviteLink: inviteLink || null,
          reason: reason || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'sent',
          sentBy: 'admin',
          isResend: true,
          originalEmailHistoryId: emailHistoryId || null
        });
        
        return { success: true, message: 'Email resent successfully' };
      } else {
        logger.warn(`⚠️ Failed to resend email to: ${recipientEmail}`);
        
        // Log failed resend attempt
        await db.collection('emailHistory').add({
          type: type,
          recipientEmail: recipientEmail,
          recipientName: recipientName || null,
          subject: subject || 'Resent Email',
          customContent: customContent || null,
          inviteLink: inviteLink || null,
          reason: reason || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'admin',
          isResend: true,
          originalEmailHistoryId: emailHistoryId || null
        });
        
        return { success: false, message: 'Failed to resend email' };
      }
    } catch (error) {
      logger.error(`❌ Error resending email: ${error.message}`);
      logger.error(`❌ Error stack: ${error.stack}`);
      
      // Log error to email history
      try {
        const db = admin.firestore();
        await db.collection('emailHistory').add({
          type: type,
          recipientEmail: recipientEmail,
          recipientName: recipientName || null,
          subject: subject || 'Resent Email',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'admin',
          isResend: true,
          originalEmailHistoryId: emailHistoryId || null,
          error: error.message
        });
      } catch (logError) {
        logger.error('❌ Failed to log resend error to history:', logError);
      }
      
      return { 
        success: false, 
        message: `Failed to resend email: ${error.message}`,
        error: error.message
      };
    }
  }
);

// Send lifetime access granted email
exports.sendLifetimeAccessEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY', 'LOGO_URL']
  },
  async (request) => {
    const { userEmail, userName, reason } = request.data;

    if (!userEmail) {
      throw new Error('userEmail is required');
    }

    logger.info(`📧 Sending lifetime access email to: ${userEmail}`);
    logger.info(`📧 Email params: userName=${userName}, reason=${reason}`);

    try {
      const db = admin.firestore();
      const emailService = require('./emailService');
      const success = await emailService.sendLifetimeAccessEmail(userEmail, userName, reason);
      
      if (success) {
        logger.info(`✅ Lifetime access email sent successfully to: ${userEmail}`);
        
        // Log to email history
        await db.collection('emailHistory').add({
          type: 'lifetime_access',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: 'Lifetime Access Granted - The Pep Planner',
          reason: reason || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'sent',
          sentBy: 'admin'
        });
        
        return { success: true, message: 'Lifetime access email sent successfully' };
      } else {
        logger.warn(`⚠️ Failed to send lifetime access email to: ${userEmail}`);
        
        // Log failed attempt
        await db.collection('emailHistory').add({
          type: 'lifetime_access',
          recipientEmail: userEmail,
          recipientName: userName || null,
          subject: 'Lifetime Access Granted - The Pep Planner',
          reason: reason || null,
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          status: 'failed',
          sentBy: 'admin'
        });
        
        return { success: false, message: 'Failed to send email' };
      }
    } catch (error) {
      logger.error(`❌ Error sending lifetime access email: ${error.message}`);
      logger.error(`❌ Error stack: ${error.stack}`);
      logger.error(`❌ Full error:`, error);
      // Return error details instead of throwing to avoid INTERNAL error
      return { 
        success: false, 
        message: `Failed to send lifetime access email: ${error.message}`,
        error: error.message
      };
    }
  }
);

// ===== CONTACT FORM FUNCTION =====

// Handle contact form submissions from landing page
exports.submitContactForm = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const { name, email, subject, message, recaptchaToken, source } = request.data;

    if (!name || !email || !subject || !message) {
      throw new Error('All fields are required');
    }

    // Determine source (default to 'app' if not provided)
    const contactSource = source || 'app';

    // Verify reCAPTCHA if token is provided
    if (recaptchaToken) {
      const recaptchaResult = await recaptcha.verifyRecaptchaWithEnforcement(
        recaptchaToken,
        0.5, // Minimum score threshold
        'contact', // Expected action
        request.rawRequest?.ip || null
      );

      if (!recaptchaResult.success) {
        logger.warn(`❌ reCAPTCHA verification failed for contact form: ${recaptchaResult.error}`);
        // In production, you might want to reject the request
        // For now, we'll log and continue (graceful degradation)
      } else {
        logger.info(`✅ reCAPTCHA verified for contact form (score: ${recaptchaResult.score})`);
      }
    } else {
      logger.warn('⚠️ Contact form submitted without reCAPTCHA token');
    }

    logger.info(`📧 Contact form submission from: ${email} (${name})`);

    try {
      // Escape HTML to prevent XSS
      const escapeHtml = (text) => {
        const map = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
      };

      const safeName = escapeHtml(name);
      const safeEmail = escapeHtml(email);
      const safeSubject = escapeHtml(subject);
      const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
      const safeSource = escapeHtml(contactSource);

      // Store in Firestore (contactSubmissions collection)
      const db = admin.firestore();
      const submissionRef = await db.collection('contactSubmissions').add({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        subject: subject.trim(),
        message: message.trim(),
        source: contactSource, // 'app', 'landing', 'squarespace', 'login', etc.
        status: 'unread',
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        repliedAt: null,
        notes: null
      });

      logger.info(`💾 Contact submission saved to Firestore with ID: ${submissionRef.id} from source: ${contactSource}`);

      // Format the email HTML
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f0;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2F3B3A; margin-bottom: 20px;">Contact Form Message Received</h2>
            <div style="margin-bottom: 20px;">
              <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">From:</strong> ${safeName}</p>
              <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">Email:</strong> ${safeEmail}</p>
              <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">Subject:</strong> ${safeSubject}</p>
              <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">Source:</strong> ${safeSource}</p>
            </div>
            <div style="background-color: #F5F5F0; padding: 15px; border-radius: 4px; margin-top: 20px;">
              <p style="color: #2F3B3A; margin: 0;">${safeMessage}</p>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #DDE6DE;">
              <p style="color: #6B7D7A; font-size: 12px; margin: 0;">This message was sent from The Pep Planner contact form.</p>
            </div>
          </div>
        </div>
      `;

      // Send email using the emailService
      const success = await emailService.sendEmail(
        'contact@thepepplanner.com', // Contact form submissions go here
        `Contact Form: ${safeSubject}`, // Include subject in email subject line
        emailHtml
      );

      if (success) {
        logger.info(`✅ Contact form email sent successfully from: ${email}`);
        return { success: true, message: 'Message sent successfully' };
      } else {
        logger.warn(`⚠️ Failed to send contact form email from: ${email}`);
        return { success: false, message: 'Failed to send email' };
      }
    } catch (error) {
      logger.error(`❌ Error sending contact form email: ${error.message}`);
      throw new Error('Failed to send contact form message');
    }
  }
);

// ===== SUPPORT TICKET SYSTEM =====
// (ADMIN_EMAILS already declared at top of file)

// Get all tickets for admin dashboard (server-side, bypasses Firestore rules)
exports.getAllTicketsAdmin = onCall(
  { cors: true },
  async (request) => {
    verifyAdmin(request);
    try {
      const db = admin.firestore();
      let snapshot;
      let usedOrderBy = true;
      try {
        snapshot = await db.collection('supportTickets')
          .orderBy('lastMessageAt', 'desc')
          .get();
      } catch (orderByError) {
        logger.warn('⚠️ orderBy failed, falling back to simple query:', orderByError.message);
        snapshot = await db.collection('supportTickets').get();
        usedOrderBy = false;
      }
      const tickets = [];
      snapshot.forEach((doc) => {
        tickets.push({ id: doc.id, ...doc.data() });
      });
      if (!usedOrderBy && tickets.length > 0) {
        tickets.sort((a, b) => {
          const aTime = a.lastMessageAt?.toMillis?.() ?? a.createdAt?.toMillis?.() ?? 0;
          const bTime = b.lastMessageAt?.toMillis?.() ?? b.createdAt?.toMillis?.() ?? 0;
          return bTime - aTime;
        });
      }
      return { tickets };
    } catch (error) {
      logger.error('❌ getAllTicketsAdmin error:', error);
      throw new HttpsError('internal', error.message || 'Failed to fetch tickets');
    }
  }
);

/**
 * Helper function to delete all images associated with a support ticket
 * @param {string} ticketId - The ticket ID
 * @param {Firestore} db - Firestore database instance
 */
async function deleteTicketImages(ticketId, db) {
  try {
    const bucket = admin.storage().bucket();
    const messagesRef = db.collection('supportTickets').doc(ticketId).collection('messages');
    const messagesSnapshot = await messagesRef.get();
    
    const deletePromises = [];
    
    messagesSnapshot.forEach((doc) => {
      const messageData = doc.data();
      if (messageData.imageStoragePaths && Array.isArray(messageData.imageStoragePaths)) {
        messageData.imageStoragePaths.forEach((storagePath) => {
          if (storagePath) {
            const file = bucket.file(storagePath);
            deletePromises.push(
              file.delete().catch((error) => {
                // If file doesn't exist, that's okay (already deleted)
                if (error.code === 404 || error.code === 'storage/object-not-found') {
                  logger.info(`ℹ️ Image already deleted or doesn't exist: ${storagePath}`);
                  return;
                }
                // Log other errors but don't fail the entire operation
                logger.warn(`⚠️ Error deleting image ${storagePath}:`, error.message);
              })
            );
          }
        });
      }
    });
    
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
      logger.info(`✅ Deleted ${deletePromises.length} image(s) for ticket ${ticketId}`);
    }
  } catch (error) {
    logger.error(`❌ Error in deleteTicketImages for ticket ${ticketId}:`, error);
    throw error;
  }
}

// Create a new support ticket
/**
 * Ensure a support ticket is visible in the admin User Reports queue.
 * Upserts an open (markedFixed=false) ai_worker_logs row: refreshes timestamp/message,
 * clears admin read flags, and creates a row when none exists.
 * Used when appending to an open ticket (emails previously fired without queue updates)
 * and when admins manually pull a missed ticket.
 */
async function ensureTicketInWorkQueue(db, FieldValue, opts) {
  const {
    ticketId,
    ticketNumber,
    ticketType = 'support',
    subject = 'Support Request',
    userName = 'Unknown',
    userEmail = '',
    originalMessage = '',
    reasoning = 'Queued for admin review',
    urgency = 'medium',
    requestNumber = null,
    userAccountInfo = null,
    addedManually = false,
    autoQueued = false,
  } = opts || {};

  if (!ticketId) {
    throw new Error('ensureTicketInWorkQueue: ticketId is required');
  }

  const openLogs = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE)
    .where('ticketId', '==', ticketId)
    .where('markedFixed', '==', false)
    .limit(5)
    .get();

  const bumpFields = {
    originalMessage: originalMessage || '',
    timestamp: FieldValue.serverTimestamp(),
    adminReadAt: null,
    adminMarkedUnread: true,
    markedFixed: false,
    markedFixedAt: null,
    reasoning,
    subject: subject || 'Support Request',
    ...(requestNumber ? { latestRequestNumber: requestNumber } : {}),
  };

  if (!openLogs.empty) {
    // Refresh the newest open log; close any duplicate open rows for the same ticket
    const sorted = openLogs.docs.slice().sort((a, b) => {
      const ta = a.data().timestamp?.toMillis?.() ?? 0;
      const tb = b.data().timestamp?.toMillis?.() ?? 0;
      return tb - ta;
    });
    const primary = sorted[0];
    await primary.ref.update(bumpFields);
    for (let i = 1; i < sorted.length; i++) {
      await sorted[i].ref.update({
        markedFixed: true,
        markedFixedAt: FieldValue.serverTimestamp(),
        adminNotes: `Duplicate open queue row closed; kept ${primary.id}`,
      });
    }
    return { logId: primary.id, created: false, updated: true };
  }

  const logRef = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).add({
    ticketId,
    ticketNumber: ticketNumber || ticketId.slice(-6).toUpperCase(),
    ticketType,
    subject: subject || 'Support Request',
    userName,
    userEmail,
    originalMessage: originalMessage || '',
    timestamp: FieldValue.serverTimestamp(),
    route: addedManually ? 'manual' : (autoQueued ? null : 'append'),
    confidence: addedManually ? 100 : null,
    reasoning,
    complexity: addedManually ? 'unknown' : null,
    urgency,
    keywords: [],
    executionModel: addedManually ? 'manual' : null,
    executionCost: 0,
    triageCost: 0,
    totalCost: 0,
    responseGenerated: false,
    responsePosted: false,
    responseContent: null,
    markedFixed: false,
    humanOverride: !!addedManually,
    addedManually: !!addedManually,
    ...(addedManually ? { addedManuallyAt: FieldValue.serverTimestamp() } : {}),
    autoQueued: !!autoQueued,
    adminReadAt: null,
    adminMarkedUnread: true,
    ...(requestNumber ? { latestRequestNumber: requestNumber } : {}),
    ...(userAccountInfo ? { userAccountInfo } : {}),
  });

  return { logId: logRef.id, created: true, updated: false };
}

exports.createSupportTicket = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required to create a support ticket');
    }

    const {
      userId: clientUserId,
      userEmail: clientUserEmail,
      userName: clientUserName,
      type,
      subject,
      message,
      imageUrls,
      imageStoragePaths,
      metadata,
    } = request.data;

    if (!type || !message) {
      throw new HttpsError('invalid-argument', 'Type and message are required');
    }

    const callerEmail = (request.auth.token.email || '').toLowerCase().trim();
    const isCallerAdmin = ADMIN_EMAILS.includes(callerEmail);

    // Admins may open tickets on behalf of another email; everyone else is locked to their auth identity
    let userEmail;
    let userId;
    let userName;
    if (isCallerAdmin && clientUserEmail) {
      userEmail = String(clientUserEmail).toLowerCase().trim();
      userId = clientUserId || null;
      userName = clientUserName || userEmail.split('@')[0];
    } else {
      if (!callerEmail) {
        throw new HttpsError('failed-precondition', 'Authenticated account must have an email');
      }
      userEmail = callerEmail;
      userId = request.auth.uid;
      userName = clientUserName || request.auth.token.name || callerEmail.split('@')[0];
    }

    logger.info(`🎫 Creating support ticket from: ${userEmail} (type: ${type})`);

    try {
      const db = admin.firestore();
      const FieldValue = admin.firestore.FieldValue;
      const normalizedEmail = userEmail.toLowerCase().trim();

      // Check for existing OPEN ticket for this user (combine multiple requests into one thread)
      const existingOpen = await db.collection('supportTickets')
        .where('userEmail', '==', normalizedEmail)
        .where('status', 'in', ['new', 'in-progress', 'open'])
        .limit(1)
        .get();

      if (!existingOpen.empty) {
        const existingDoc = existingOpen.docs[0];
        const existingId = existingDoc.id;
        const existingData = existingDoc.data();
        const existingNumber = existingData.ticketNumber || `Z${existingId.slice(-6).toUpperCase()}`;

        // Get next request number for this thread (for display: "Ticket Z005, requests #Z005, #Z006")
        const counterRef = db.collection('_counters').doc('supportTickets');
        let requestNumber;
        await db.runTransaction(async (transaction) => {
          const counterDoc = await transaction.get(counterRef);
          let currentCount = (counterDoc.exists && counterDoc.data().count != null) ? counterDoc.data().count : 4;
          if (currentCount === 0) currentCount = 4;
          else currentCount++;
          requestNumber = `Z${String(currentCount).padStart(3, '0')}`;
          transaction.set(counterRef, { count: currentCount, lastUpdated: FieldValue.serverTimestamp() }, { merge: true });
        });

        const requestNumbers = Array.isArray(existingData.requestNumbers) ? [...existingData.requestNumbers, requestNumber] : [existingData.ticketNumber || existingNumber, requestNumber];

        const messageRef = db.collection('supportTickets').doc(existingId).collection('messages').doc();
        const messageData = {
          messageId: messageRef.id,
          ticketId: existingId,
          senderType: 'user',
          senderEmail: normalizedEmail,
          senderName: userName || userEmail.split('@')[0],
          message: message,
          createdAt: FieldValue.serverTimestamp(),
          read: false,
          requestNumber: requestNumber,
        };
        if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) messageData.imageUrls = imageUrls;
        if (imageStoragePaths && Array.isArray(imageStoragePaths) && imageStoragePaths.length > 0) messageData.imageStoragePaths = imageStoragePaths;

        await messageRef.set(messageData);
        await db.collection('supportTickets').doc(existingId).update({
          updatedAt: FieldValue.serverTimestamp(),
          lastMessageAt: FieldValue.serverTimestamp(),
          requestNumbers: requestNumbers,
          // Clear ticket-level admin read so mobile/admin lists treat this as new activity
          adminReadAt: null,
        });

        // CRITICAL: appended messages used to email without touching ai_worker_logs.
        // That left new Z### request numbers invisible on the User Reports dashboard.
        try {
          const queueResult = await ensureTicketInWorkQueue(db, FieldValue, {
            ticketId: existingId,
            ticketNumber: existingNumber,
            ticketType: existingData.type || type || 'support',
            subject: existingData.subject || `Support Request - ${type || 'support'}`,
            userName: userName || userEmail.split('@')[0],
            userEmail: normalizedEmail,
            originalMessage: message,
            reasoning: `New user request ${requestNumber} appended to open ticket ${existingNumber}`,
            urgency: (existingData.type || type) === 'bug' ? 'high' : 'medium',
            requestNumber,
            userAccountInfo: existingData.userAccountInfo || null,
            autoQueued: true,
          });
          logger.info(
            `✅ Queue ${queueResult.created ? 'created' : 'updated'} for appended request ${requestNumber} on ${existingNumber} (log ${queueResult.logId})`
          );
        } catch (queueError) {
          logger.error(
            `⚠️ Failed to queue appended message on ticket ${existingId} (${requestNumber}):`,
            queueError.message
          );
          // Keep ticket+email path alive, but this is the failure mode that hid reports
        }

        const escapeHtml = (text) => {
          const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
          return String(text).replace(/[&<>"']/g, (m) => map[m]);
        };
        const safeName = escapeHtml(userName || userEmail.split('@')[0]);
        const safeEmail = escapeHtml(userEmail);
        const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');
        const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f0;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2F3B3A; margin-bottom: 20px;">📩 New message on existing ticket</h2>
            <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">Ticket #:</strong> ${existingNumber} (requests: ${requestNumbers.join(', ')})</p>
            <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">From:</strong> ${safeName}</p>
            <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">Email:</strong> ${safeEmail}</p>
            <div style="background-color: #F5F5F0; padding: 15px; border-radius: 4px; margin-top: 20px;">
              <p style="color: #2F3B3A; margin: 0;">${safeMessage}</p>
            </div>
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #DDE6DE;">
              <p style="color: #6B7D7A; font-size: 12px; margin: 0;">Reply in the admin panel. This message was added to the same thread.</p>
            </div>
          </div>
        </div>`;
        try {
          const emailTimeout = new Promise((resolve) => setTimeout(() => resolve(false), 8000));
          await Promise.race([
            emailService.sendEmail('contact@thepepplanner.com', `📩 New message on ticket ${existingNumber}`, emailHtml),
            emailTimeout
          ]);
        } catch (e) {
          logger.warn('Appended-ticket email failed:', e.message);
        }
        logger.info(`✅ Appended message to existing ticket: ${existingId} (${existingNumber}), request ref: ${requestNumber}`);
        return { success: true, ticketId: existingId, ticketNumber: existingNumber, appended: true, requestNumber };
      }

      // No open ticket — create new ticket
      const counterRef = db.collection('_counters').doc('supportTickets');
      let ticketNumber;
      
      await db.runTransaction(async (transaction) => {
        const counterDoc = await transaction.get(counterRef);
        let currentCount = 0;
        
        if (counterDoc.exists) {
          currentCount = counterDoc.data().count || 0;
        }
        
        if (currentCount === 0) {
          currentCount = 4;
        } else {
          currentCount++;
        }
        ticketNumber = `Z${String(currentCount).padStart(3, '0')}`;
        
        transaction.set(counterRef, {
          count: currentCount,
          lastUpdated: FieldValue.serverTimestamp()
        }, { merge: true });
      });

      logger.info(`🎫 Generated ticket number: ${ticketNumber}`);

      // Search for user account by email
      let userAccountInfo = null;
      try {
        const usersSnapshot = await db.collection('users')
          .where('email', '==', userEmail.toLowerCase().trim())
          .limit(1)
          .get();
        
        if (!usersSnapshot.empty) {
          const userDoc = usersSnapshot.docs[0];
          const userData = userDoc.data();
          
          userAccountInfo = {
            userId: userDoc.id,
            email: userData.email,
            subscriptionStatus: userData.subscriptionStatus || 'none',
            subscriptionType: userData.subscriptionType || null,
            createdAt: userData.createdAt,
            lastLoginAt: userData.lastLoginAt || null,
            displayName: userData.displayName || null,
          };
          
          logger.info(`✅ Found user account for ${userEmail}: ${userData.subscriptionStatus} (${userData.subscriptionType || 'none'})`);
        } else {
          logger.info(`ℹ️ No user account found for ${userEmail} - may be a new/anonymous user`);
        }
      } catch (userSearchError) {
        logger.error(`⚠️ Error searching for user account:`, userSearchError);
        // Continue without user info - don't fail ticket creation
      }

      // Create ticket document
      const ticketRef = db.collection('supportTickets').doc();
      const ticketData = {
        ticketId: ticketRef.id,
        ticketNumber: ticketNumber,
        requestNumbers: [ticketNumber], // Combined thread: all request refs (e.g. Z005, Z006)
        userId: userId || userAccountInfo?.userId || null,
        userEmail: normalizedEmail,
        userName: userName || userEmail.split('@')[0],
        type: type,
        subject: subject || `Support Request - ${type}`,
        status: 'new',
        priority: type === 'bug' ? 'high' : 'normal',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        lastMessageAt: FieldValue.serverTimestamp(),
        metadata: metadata || {},
        userAccountInfo: userAccountInfo,
      };

      await ticketRef.set(ticketData);

      // Create initial message in messages subcollection
      const messageRef = ticketRef.collection('messages').doc();
      const messageData = {
        messageId: messageRef.id,
        ticketId: ticketRef.id,
        senderType: 'user',
        senderEmail: userEmail.toLowerCase().trim(),
        senderName: userName || userEmail.split('@')[0],
        message: message,
        createdAt: FieldValue.serverTimestamp(),
        read: false
      };
      
      // Add image URLs and storage paths if provided
      if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
        messageData.imageUrls = imageUrls;
      }
      if (imageStoragePaths && Array.isArray(imageStoragePaths) && imageStoragePaths.length > 0) {
        messageData.imageStoragePaths = imageStoragePaths;
      }
      
      await messageRef.set(messageData);

      // === AUTO-QUEUE: immediately add to work queue bypassing Ghosty ===
      // Ghosty may be paused, erroring, or slow — every ticket must land in queue regardless.
      try {
        await ensureTicketInWorkQueue(db, FieldValue, {
          ticketId: ticketRef.id,
          ticketNumber: ticketNumber,
          ticketType: type,
          subject: subject || `Support Request - ${type}`,
          userName: userName || userEmail.split('@')[0],
          userEmail: normalizedEmail,
          originalMessage: message,
          reasoning: 'Auto-queued on ticket creation',
          urgency: type === 'bug' ? 'high' : 'medium',
          userAccountInfo: userAccountInfo || null,
          autoQueued: true,
        });
        logger.info(`✅ Auto-queued ticket ${ticketRef.id} (${ticketNumber}) in work queue`);
      } catch (queueError) {
        logger.error(`⚠️ Failed to auto-queue ticket ${ticketRef.id}:`, queueError.message);
        // Don't fail ticket creation if queue write fails
      }

      // Send email notification to admin
      const escapeHtml = (text) => {
        const map = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
      };

      const safeName = escapeHtml(userName || userEmail.split('@')[0]);
      const safeEmail = escapeHtml(userEmail);
      const safeType = escapeHtml(type);
      const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

      // Build image HTML if images are provided
      let imagesHtml = '';
      if (imageUrls && Array.isArray(imageUrls) && imageUrls.length > 0) {
        imagesHtml = `
          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #DDE6DE;">
            <p style="color: #2F3B3A; font-weight: 600; margin-bottom: 10px;">Attached Images (${imageUrls.length}):</p>
            <div style="display: flex; flex-wrap: wrap; gap: 10px;">
              ${imageUrls.map((url, index) => `
                <div style="margin-bottom: 10px;">
                  <a href="${url}" target="_blank" style="display: block; text-decoration: none;">
                    <img src="${url}" alt="Support ticket image ${index + 1}" style="max-width: 200px; max-height: 200px; border-radius: 4px; border: 1px solid #DDE6DE;" />
                    <p style="color: #6B7D7A; font-size: 11px; margin-top: 4px; text-align: center;">Image ${index + 1}</p>
                  </a>
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f5f5f0;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2F3B3A; margin-bottom: 20px;">🎫 New Support Request Created</h2>
            <div style="margin-bottom: 20px;">
              <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">Ticket #:</strong> ${ticketNumber}</p>
              <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">From:</strong> ${safeName}</p>
              <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">Email:</strong> ${safeEmail}</p>
              <p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">Type:</strong> ${safeType}</p>
              ${userId ? `<p style="color: #6B7D7A; margin: 5px 0;"><strong style="color: #2F3B3A;">User ID:</strong> ${userId}</p>` : ''}
            </div>
            <div style="background-color: #F5F5F0; padding: 15px; border-radius: 4px; margin-top: 20px;">
              <p style="color: #2F3B3A; margin: 0;">${safeMessage}</p>
            </div>
            ${imagesHtml}
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #DDE6DE;">
              <p style="color: #6B7D7A; font-size: 12px; margin: 0;">This is a notification email. Please respond to this ticket in the admin panel.</p>
            </div>
          </div>
        </div>
      `;

      try {
        const emailTimeout = new Promise((resolve) => setTimeout(() => resolve(false), 8000));
        await Promise.race([
          emailService.sendEmail(
            'contact@thepepplanner.com',
            `🎫 New ${safeType} Request: ${ticketNumber}`,
            emailHtml
          ),
          emailTimeout
        ]);
      } catch (emailError) {
        logger.warn(`⚠️ Admin notification email failed (ticket still created): ${emailError.message}`);
      }

      logger.info(`✅ Support ticket created: ${ticketRef.id} (${ticketNumber})`);
      return { 
        success: true, 
        ticketId: ticketRef.id,
        ticketNumber: ticketNumber,
        message: 'Ticket created successfully' 
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`❌ Error creating support ticket: ${error.message}`);
      logger.error(`❌ Error stack: ${error.stack}`);
      throw new HttpsError(
        'internal',
        'Failed to create support ticket',
        error.message
      );
    }
  }
);

// Add message to a ticket (admin-only; users reply via SupportChatModal / createSupportTicket)
exports.addTicketMessage = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const adminEmail = verifyAdmin(request);
    const { ticketId, message } = request.data;

    if (!ticketId || !message) {
      throw new HttpsError('invalid-argument', 'Ticket ID and message are required');
    }

    const senderType = 'admin';
    const senderEmail = adminEmail;
    const senderName = request.auth.token.name || 'The Pep Planner Team';

    logger.info(`💬 Adding message to ticket: ${ticketId} (from: ${senderType})`);

    try {
      const db = admin.firestore();
      const FieldValue = admin.firestore.FieldValue;

      const ticketRef = db.collection('supportTickets').doc(ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket not found');
      }

      const ticketData = ticketDoc.data();

      // Create message in messages subcollection
      const messageRef = ticketRef.collection('messages').doc();
      await messageRef.set({
        messageId: messageRef.id,
        ticketId: ticketId,
        senderType,
        senderEmail,
        senderName,
        message: message,
        createdAt: FieldValue.serverTimestamp(),
        read: false
      });

      // Update ticket
      const updateData = {
        updatedAt: FieldValue.serverTimestamp(),
        lastMessageAt: FieldValue.serverTimestamp(),
        lastAdminMessageAt: FieldValue.serverTimestamp(),
      };

      // If admin is responding, mark as in-progress if it was new
      if (ticketData.status === 'new') {
        updateData.status = 'in-progress';
      }

      await ticketRef.update(updateData);

      // Send email when admin replies (mobile push is handled by
      // onSupportTicketAdminReplyUserPush so WorkQueue / callable share one path)
      try {
        const userEmail = ticketData.userEmail;
        const ticketSubject = ticketData.subject || 'Support Request';
        if (userEmail) {
          await emailService.sendSupportTicketReplyEmail(userEmail, ticketSubject, message, ticketId);
          logger.info(`📧 Ticket reply notification sent to ${userEmail}`);
        }
      } catch (emailError) {
        logger.warn(`⚠️ Failed to send ticket reply email (non-fatal):`, emailError);
      }

      logger.info(`✅ Message added to ticket: ${ticketId}`);
      return { 
        success: true, 
        messageId: messageRef.id,
        message: 'Message sent successfully' 
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`❌ Error adding message to ticket: ${error.message}`);
      throw new HttpsError('internal', 'Failed to add message to ticket');
    }
  }
);

/**
 * Admin-only support inbox push.
 * Fires on every new ticket message. Only notifies lebrockmaldonado@gmail.com
 * when senderType === 'user'. Admin replies never trigger this.
 * Deep-links to /admin-support?ticketId=… for the mobile inbox.
 */
exports.onSupportTicketUserMessageAdminAlert = onDocumentCreated(
  {
    document: 'supportTickets/{ticketId}/messages/{messageId}',
  },
  async (event) => {
    try {
      const messageData = event.data?.data?.() ?? null;
      if (!messageData) return;
      if (messageData.senderType !== 'user') return;

      const senderEmail = String(messageData.senderEmail || '').toLowerCase().trim();
      // Belt-and-suspenders: never alert yourself for your own outbound
      if (senderEmail === pushNotifications.ADMIN_SUPPORT_ALERT_EMAIL) return;

      const { ticketId } = event.params;
      const db = admin.firestore();
      const ticketSnap = await db.collection('supportTickets').doc(ticketId).get();
      if (!ticketSnap.exists) return;

      const ticket = ticketSnap.data() || {};
      // First message ≈ new ticket; anything after = user reply
      const msgCountSnap = await db
        .collection('supportTickets')
        .doc(ticketId)
        .collection('messages')
        .limit(2)
        .get();
      const kind = msgCountSnap.size <= 1 ? 'new' : 'reply';

      await pushNotifications.sendAdminSupportTicketAlertPush({
        ticketId,
        ticketNumber: ticket.ticketNumber || '',
        subject: ticket.subject || '',
        preview: messageData.message || messageData.text || '',
        kind,
      });
    } catch (error) {
      logger.warn(`onSupportTicketUserMessageAdminAlert failed (non-fatal): ${error.message}`);
    }
  }
);

/**
 * User mobile/web push: "Support has responded!"
 * Fires when a human admin posts a message on a ticket (WorkQueue / addTicketMessage).
 * Ghosty is retired from user-facing sends and does not trigger this.
 * Deep-links to /app/support → Support modal.
 */
exports.onSupportTicketAdminReplyUserPush = onDocumentCreated(
  {
    document: 'supportTickets/{ticketId}/messages/{messageId}',
  },
  async (event) => {
    try {
      const messageData = event.data?.data?.() ?? null;
      if (!messageData) return;

      const senderType = String(messageData.senderType || '').toLowerCase().trim();
      // Ghosty is retired from user-facing sends — only human admin replies notify the user.
      if (senderType !== 'admin') return;

      const { ticketId } = event.params;
      const db = admin.firestore();
      const ticketSnap = await db.collection('supportTickets').doc(ticketId).get();
      if (!ticketSnap.exists) {
        logger.warn('support_reply_push_skipped_missing_ticket', { ticketId });
        return;
      }

      const ticket = ticketSnap.data() || {};
      let userId = ticket.userId || ticket.userAccountInfo?.userId || null;

      if (!userId && ticket.userEmail) {
        const email = String(ticket.userEmail).toLowerCase().trim();
        const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
        if (!usersSnap.empty) userId = usersSnap.docs[0].id;
      }

      if (!userId) {
        logger.warn('support_reply_push_skipped_no_user', {
          ticketId,
          userEmail: ticket.userEmail || null,
        });
        return;
      }

      const ticketSubject =
        ticket.ticketNumber
          ? `#${ticket.ticketNumber}`
          : (ticket.subject || 'Support Request');

      const result = await pushNotificationEngine.sendSupportTicketReplyPush(
        userId,
        ticketSubject,
        ticketId
      );
      logger.info('support_reply_push_result', {
        ticketId,
        userId,
        success: !!result?.success,
        error: result?.error || null,
      });
    } catch (error) {
      logger.warn(`onSupportTicketAdminReplyUserPush failed (non-fatal): ${error.message}`);
    }
  }
);

// Submit feedback (bug report or suggestion)
exports.submitFeedback = onCall(
  {
    cors: true
  },
  async (request) => {
    const { type, message, userEmail, userId, userAgent, url, timestamp } = request.data;

    if (!message || !type) {
      throw new Error('Message and type are required');
    }

    logger.info(`📝 Feedback submitted: ${type} from ${userEmail || 'anonymous'}`);

    try {
      const db = admin.firestore();
      const FieldValue = admin.firestore.FieldValue;

      // Create feedback document
      const feedbackRef = db.collection('feedback').doc();
      const feedbackData = {
        id: feedbackRef.id,
        type: type, // 'bug' or 'suggestion'
        message: message,
        userEmail: userEmail || 'anonymous',
        userId: userId || null,
        status: 'new',
        submittedAt: FieldValue.serverTimestamp(),
        userAgent: userAgent || '',
        url: url || '',
        timestamp: timestamp || new Date().toISOString(),
        adminNotes: ''
      };

      await feedbackRef.set(feedbackData);

      logger.info(`✅ Feedback created: ${feedbackRef.id}`);

      // === AUTO-QUEUE feedback in work queue so it surfaces in admin panel ===
      try {
        await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).add({
          feedbackId: feedbackRef.id,
          ticketId: null,
          ticketNumber: `F-${feedbackRef.id.slice(-6).toUpperCase()}`,
          ticketType: type === 'bug' ? 'bug' : 'feedback',
          subject: type === 'bug' ? `Bug Report: ${message.slice(0, 60)}` : `Suggestion: ${message.slice(0, 60)}`,
          userName: userEmail ? userEmail.split('@')[0] : 'Anonymous',
          userEmail: userEmail || 'anonymous',
          originalMessage: message,
          timestamp: FieldValue.serverTimestamp(),
          route: null,
          confidence: null,
          reasoning: 'Auto-queued from feedback submission',
          complexity: null,
          urgency: type === 'bug' ? 'high' : 'low',
          keywords: [],
          executionModel: null,
          executionCost: 0,
          triageCost: 0,
          totalCost: 0,
          responseGenerated: false,
          responsePosted: false,
          responseContent: null,
          markedFixed: false,
          humanOverride: false,
          addedManually: false,
          autoQueued: true,
          isFeedback: true,
        });
        logger.info(`✅ Auto-queued feedback ${feedbackRef.id} in work queue`);
      } catch (queueError) {
        logger.error(`⚠️ Failed to auto-queue feedback ${feedbackRef.id}:`, queueError.message);
      }

      return { 
        success: true, 
        feedbackId: feedbackRef.id,
        message: 'Feedback submitted successfully' 
      };
    } catch (error) {
      logger.error(`❌ Error submitting feedback: ${error.message}`);
      throw new Error('Failed to submit feedback');
    }
  }
);

// Update ticket status
exports.updateTicketStatus = onCall(
  {
    cors: true
  },
  async (request) => {
    verifyAdmin(request);
    const { ticketId, status, adminNotes } = request.data;

    if (!ticketId || !status) {
      throw new Error('Ticket ID and status are required');
    }

    logger.info(`🔄 Updating ticket status: ${ticketId} -> ${status}`);

    try {
      const db = admin.firestore();
      const FieldValue = admin.firestore.FieldValue;

      const ticketRef = db.collection('supportTickets').doc(ticketId);
      
      // Get current ticket data to check previous status
      const ticketDoc = await ticketRef.get();
      const currentStatus = ticketDoc.exists ? ticketDoc.data().status : null;
      
      const updateData = {
        status: status,
        updatedAt: FieldValue.serverTimestamp()
      };
      
      // Add admin notes if provided
      if (adminNotes) {
        updateData.adminNotes = adminNotes;
      }

      // When ticket is closed/resolved, mark as unread and set closedAt timestamp
      if (status === 'closed' || status === 'resolved') {
        updateData.userReadAt = null; // Mark as unread for user
        updateData.closedAt = FieldValue.serverTimestamp();
        updateData.customerReopened = false; // Clear the reopened tag
        logger.info(`📌 Ticket ${ticketId} marked as closed - user will see unread notification`);
        
        // Delete images from storage when ticket is closed
        try {
          await deleteTicketImages(ticketId, db);
          logger.info(`🗑️ Deleted images for closed ticket: ${ticketId}`);
        } catch (imageDeleteError) {
          // Log error but don't fail the status update
          logger.error(`⚠️ Error deleting images for ticket ${ticketId}:`, imageDeleteError);
        }
      }
      
      // When admin reopens ticket from closed/resolved to in-progress, clear countdown fields
      if (status === 'in-progress' && (currentStatus === 'closed' || currentStatus === 'resolved')) {
        updateData.userReadAt = null; // Reset read status
        updateData.closedAt = null; // Clear closed timestamp
        updateData.customerReopened = false; // Clear the reopened tag (admin reopened, not customer)
        logger.info(`🔄 Ticket ${ticketId} reopened from closed - countdown fields cleared`);
      }

      await ticketRef.update(updateData);

      logger.info(`✅ Ticket status updated: ${ticketId} -> ${status}`);
      return { 
        success: true, 
        message: 'Ticket status updated successfully' 
      };
    } catch (error) {
      logger.error(`❌ Error updating ticket status: ${error.message}`);
      throw new Error('Failed to update ticket status');
    }
  }
);

// Close support ticket from work queue (bypasses Firestore rules; updates ticket + ai_worker_logs)
// Work queue can include items that are not real support tickets (e.g. account_deletion_request);
// we always require the log to exist and update it first so the row moves to archive.
exports.closeSupportTicketFromWorkQueue = onCall(
  {
    cors: true
  },
  async (request) => {
    verifyAdmin(request);
    const { ticketId, logId, adminNotes } = request.data;

    if (!ticketId || !logId) {
      throw new HttpsError('invalid-argument', 'ticketId and logId are required');
    }

    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    try {
      const ticketRef = db.collection('supportTickets').doc(ticketId);
      const logRef = db.collection(COLLECTIONS.USER_REPORTS_QUEUE).doc(logId);

      const [ticketSnap, logSnap] = await Promise.all([ticketRef.get(), logRef.get()]);

      if (!logSnap.exists) {
        throw new HttpsError('not-found', `Work queue log ${logId} not found`);
      }

      // Always update the log first so the work queue row moves to archive even if ticket update fails
      await logRef.update({
        markedFixed: true,
        markedFixedAt: FieldValue.serverTimestamp(),
        adminNotes: adminNotes != null ? String(adminNotes) : null
      });

      if (!ticketSnap.exists) {
        // No support ticket doc (e.g. account_deletion_request or orphan log) — log only
        logger.info(`✅ Closed work queue log ${logId} (no support ticket ${ticketId})`);
        return { success: true, message: 'Closed from work queue' };
      }

      // Update support ticket so user-facing "support request" shows as closed and disappears 24h after viewing
      await ticketRef.update({
        status: 'closed',
        closedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        userReadAt: null,
        customerReopened: false
      });

      try {
        await deleteTicketImages(ticketId, db);
      } catch (imageErr) {
        logger.warn('deleteTicketImages failed for closed ticket:', imageErr.message);
      }

      logger.info(`✅ Closed ticket ${ticketId} from work queue`);
      return { success: true, message: 'Ticket closed' };
    } catch (error) {
      if (error && error.code) throw error;
      logger.error('closeSupportTicketFromWorkQueue:', error.message);
      throw new HttpsError('internal', error.message || 'Failed to close ticket');
    }
  }
);

// Manually add a missed support ticket to the work queue (admin action)
exports.addTicketToWorkQueue = onCall(
  { cors: true },
  async (request) => {
    try {
      verifyAdmin(request);
      const { ticketId, ticketNumber: ticketNumberInput, feedbackId } = request.data || {};

      const db = admin.firestore();
      const FieldValue = admin.firestore.FieldValue;

      // Feedback / bug reports (F-####) — separate from supportTickets
      if (feedbackId) {
        const feedbackRef = db.collection('feedback').doc(feedbackId);
        const feedbackSnap = await feedbackRef.get();
        if (!feedbackSnap.exists) {
          throw new HttpsError('not-found', `Feedback ${feedbackId} not found`);
        }
        const feedback = feedbackSnap.data();
        const displayNumber = `F-${feedbackId.slice(-6).toUpperCase()}`;

        const openLogs = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE)
          .where('feedbackId', '==', feedbackId)
          .where('markedFixed', '==', false)
          .limit(1)
          .get();

        if (!openLogs.empty) {
          await openLogs.docs[0].ref.update({
            originalMessage: feedback.message || '',
            timestamp: FieldValue.serverTimestamp(),
            adminReadAt: null,
            adminMarkedUnread: true,
            markedFixed: false,
            markedFixedAt: null,
            reasoning: 'Manually re-queued feedback by admin',
          });
          return {
            success: true,
            logId: openLogs.docs[0].id,
            feedbackId,
            ticketNumber: displayNumber,
            created: false,
            updated: true,
            isFeedback: true,
          };
        }

        const logRef = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).add({
          feedbackId,
          ticketId: null,
          ticketNumber: displayNumber,
          ticketType: feedback.type === 'bug' ? 'bug' : 'feedback',
          subject: feedback.type === 'bug'
            ? `Bug Report: ${(feedback.message || '').slice(0, 60)}`
            : `Suggestion: ${(feedback.message || '').slice(0, 60)}`,
          userName: feedback.userEmail ? String(feedback.userEmail).split('@')[0] : 'Anonymous',
          userEmail: feedback.userEmail || 'anonymous',
          originalMessage: feedback.message || '',
          timestamp: FieldValue.serverTimestamp(),
          route: 'manual',
          confidence: 100,
          reasoning: 'Manually added feedback to queue by admin',
          urgency: feedback.type === 'bug' ? 'high' : 'low',
          keywords: [],
          executionModel: 'manual',
          executionCost: 0,
          triageCost: 0,
          totalCost: 0,
          responseGenerated: false,
          responsePosted: false,
          responseContent: null,
          markedFixed: false,
          humanOverride: true,
          addedManually: true,
          addedManuallyAt: FieldValue.serverTimestamp(),
          autoQueued: false,
          isFeedback: true,
          adminReadAt: null,
          adminMarkedUnread: true,
        });

        logger.info(`✅ Admin manually added feedback ${feedbackId} to work queue as log ${logRef.id}`);
        return {
          success: true,
          logId: logRef.id,
          feedbackId,
          ticketNumber: displayNumber,
          created: true,
          updated: false,
          isFeedback: true,
        };
      }

      let resolvedTicketId = ticketId || null;
      let ticketSnap = null;

      // Allow lookup by ticketNumber / requestNumber when ticketId is missing
      // (admin UI "Add Missed" may pass either).
      if (!resolvedTicketId && ticketNumberInput) {
        const term = String(ticketNumberInput).trim().toUpperCase();
        let byNumber = await db.collection('supportTickets')
          .where('ticketNumber', '==', term)
          .limit(1)
          .get();
        if (byNumber.empty) {
          byNumber = await db.collection('supportTickets')
            .where('requestNumbers', 'array-contains', term)
            .limit(1)
            .get();
        }
        if (byNumber.empty) {
          throw new HttpsError(
            'not-found',
            `No support ticket found for "${term}". If this is an F-#### bug/suggestion, look under Feedback — those are not support tickets.`
          );
        }
        resolvedTicketId = byNumber.docs[0].id;
        ticketSnap = byNumber.docs[0];
      }

      if (!resolvedTicketId) {
        throw new HttpsError('invalid-argument', 'ticketId, ticketNumber, or feedbackId is required');
      }

      const ticketRef = db.collection('supportTickets').doc(resolvedTicketId);
      if (!ticketSnap) {
        ticketSnap = await ticketRef.get();
      }
      if (!ticketSnap.exists) {
        throw new HttpsError('not-found', `Ticket ${resolvedTicketId} not found`);
      }
      const ticket = ticketSnap.data();

      // Get latest user message for context
      let latestMsg = '';
      let latestRequestNumber = null;
      try {
        const msgs = await ticketRef.collection('messages')
          .orderBy('createdAt', 'desc')
          .limit(10)
          .get();
        const userMsg = msgs.docs.find(d => d.data().senderType === 'user');
        latestMsg = userMsg?.data()?.message || userMsg?.data()?.text || '';
        latestRequestNumber = userMsg?.data()?.requestNumber || null;
      } catch (msgErr) {
        logger.warn(`addTicketToWorkQueue: could not load messages for ${resolvedTicketId}:`, msgErr.message);
      }

      // Re-open the ticket
      await ticketRef.update({
        status: 'open',
        reopenedByAdmin: true,
        adminReadAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const queueResult = await ensureTicketInWorkQueue(db, FieldValue, {
        ticketId: resolvedTicketId,
        ticketNumber: ticket.ticketNumber || resolvedTicketId.slice(-6).toUpperCase(),
        ticketType: ticket.type || 'support',
        subject: ticket.subject || 'Support Request',
        userName: ticket.userName || ticket.userDisplayName || 'Unknown',
        userEmail: ticket.userEmail || '',
        originalMessage: latestMsg || ticket.subject || '',
        reasoning: 'Manually added to queue by admin',
        urgency: ticket.type === 'bug' ? 'high' : 'medium',
        requestNumber: latestRequestNumber,
        userAccountInfo: ticket.userAccountInfo || null,
        addedManually: true,
      });

      logger.info(
        `✅ Admin manually added ticket ${resolvedTicketId} to work queue as log ${queueResult.logId} (created=${queueResult.created})`
      );
      return {
        success: true,
        logId: queueResult.logId,
        ticketId: resolvedTicketId,
        ticketNumber: ticket.ticketNumber || null,
        created: queueResult.created,
        updated: queueResult.updated,
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`❌ addTicketToWorkQueue failed:`, error.message, error.stack);
      throw new HttpsError(
        'internal',
        `Failed to add ticket to work queue: ${error.message || 'unknown error'}`
      );
    }
  }
);

/**
 * Merge all pending tickets from a user into a single thread.
 * Moves every message from secondary tickets into the primary (oldest open) ticket,
 * then marks the secondary tickets as 'merged' and closes their work queue logs.
 */
exports.mergeUserTickets = onCall(
  { cors: true },
  async (request) => {
    verifyAdmin(request);
    const { userEmail } = request.data;
    if (!userEmail) throw new HttpsError('invalid-argument', 'userEmail is required');

    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    // Find all non-closed tickets for this user
    const snap = await db.collection('supportTickets')
      .where('userEmail', '==', userEmail.toLowerCase().trim())
      .where('status', 'in', ['new', 'in-progress', 'open'])
      .get();

    if (snap.empty) throw new HttpsError('not-found', 'No open tickets found for this user');
    if (snap.size === 1) return { success: true, message: 'Only one ticket — nothing to merge' };

    // Sort oldest first — primary is the oldest ticket
    const tickets = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis?.() ?? 0;
        const tb = b.createdAt?.toMillis?.() ?? 0;
        return ta - tb;
      });

    const primary = tickets[0];
    const secondaries = tickets.slice(1);
    const primaryRef = db.collection('supportTickets').doc(primary.id);

    logger.info(`🔀 Merging ${secondaries.length} tickets into primary ${primary.ticketNumber} for ${userEmail}`);

    // Collect all requestNumbers across all tickets
    const allRequestNumbers = [...(primary.requestNumbers || [primary.ticketNumber])];

    for (const secondary of secondaries) {
      const secondaryRef = db.collection('supportTickets').doc(secondary.id);

      // Copy all messages from secondary → primary (preserving original timestamps)
      const msgsSnap = await secondaryRef.collection('messages').orderBy('createdAt', 'asc').get();
      for (const msgDoc of msgsSnap.docs) {
        const msgData = msgDoc.data();
        const newMsgRef = primaryRef.collection('messages').doc();
        await newMsgRef.set({
          ...msgData,
          messageId: newMsgRef.id,
          ticketId: primary.id,
          mergedFromTicket: secondary.ticketNumber || secondary.id,
        });
      }

      // Accumulate request numbers
      if (Array.isArray(secondary.requestNumbers)) {
        allRequestNumbers.push(...secondary.requestNumbers);
      } else if (secondary.ticketNumber) {
        allRequestNumbers.push(secondary.ticketNumber);
      }

      // Mark secondary as merged
      await secondaryRef.update({
        status: 'closed',
        mergedInto: primary.id,
        mergedIntoTicketNumber: primary.ticketNumber,
        mergedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Close any open work queue logs for secondary tickets
      const logsSnap = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE)
        .where('ticketId', '==', secondary.id)
        .where('markedFixed', '==', false)
        .get();
      for (const logDoc of logsSnap.docs) {
        await logDoc.ref.update({
          markedFixed: true,
          markedFixedAt: FieldValue.serverTimestamp(),
          adminNotes: `Merged into #${primary.ticketNumber}`,
        });
      }

      logger.info(`   ✅ Merged ${secondary.ticketNumber} (${msgsSnap.size} messages) into ${primary.ticketNumber}`);
    }

    // Update primary ticket with all request numbers and latest timestamp
    const deduped = [...new Set(allRequestNumbers)];
    await primaryRef.update({
      requestNumbers: deduped,
      updatedAt: FieldValue.serverTimestamp(),
      lastMessageAt: FieldValue.serverTimestamp(),
      status: 'open',
    });

    // Ensure primary has one clean work queue log entry (upsert)
    const existingLog = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE)
      .where('ticketId', '==', primary.id)
      .where('markedFixed', '==', false)
      .limit(1)
      .get();

    if (existingLog.empty) {
      await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).add({
        ticketId: primary.id,
        ticketNumber: primary.ticketNumber,
        ticketType: primary.type || 'support',
        subject: primary.subject || 'Support Request',
        userName: primary.userName || primary.userEmail?.split('@')[0] || 'Unknown',
        userEmail: primary.userEmail || userEmail,
        originalMessage: primary.subject || '',
        timestamp: FieldValue.serverTimestamp(),
        route: 'manual',
        confidence: 100,
        reasoning: `Merged ${secondaries.length} tickets into this thread`,
        urgency: 'medium',
        keywords: [],
        executionModel: 'manual',
        executionCost: 0,
        triageCost: 0,
        totalCost: 0,
        responseGenerated: false,
        responsePosted: false,
        responseContent: null,
        markedFixed: false,
        humanOverride: true,
        addedManually: true,
        autoQueued: false,
      });
    }

    logger.info(`✅ Merge complete: ${secondaries.length} tickets merged into ${primary.ticketNumber}`);
    return {
      success: true,
      primaryTicketId: primary.id,
      primaryTicketNumber: primary.ticketNumber,
      mergedCount: secondaries.length,
      message: `${secondaries.length} tickets merged into #${primary.ticketNumber}`,
    };
  }
);

/**
 * One-shot HTTP endpoint: merges ALL split tickets across all users.
 * Protected by a secret key. Hit once, then it's done.
 * URL: /mergeAllSplitTicketsOnce?secret=tpp-merge-2026
 */
exports.mergeAllSplitTicketsOnce = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.query.secret !== 'tpp-merge-2026') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const db = admin.firestore();
    const FieldValue = admin.firestore.FieldValue;

    try {
      const snap = await db.collection('supportTickets')
        .where('status', 'in', ['new', 'in-progress', 'open'])
        .get();

      const byEmail = new Map();
      snap.forEach(doc => {
        const data = doc.data();
        const email = data.userEmail?.toLowerCase().trim();
        if (!email) return;
        if (!byEmail.has(email)) byEmail.set(email, []);
        byEmail.get(email).push({ id: doc.id, ...data });
      });

      const toMerge = [...byEmail.entries()].filter(([, tickets]) => tickets.length > 1);
      const report = [];

      for (const [userEmail, tickets] of toMerge) {
        tickets.sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
        const primary = tickets[0];
        const secondaries = tickets.slice(1);
        const primaryRef = db.collection('supportTickets').doc(primary.id);
        const allRequestNumbers = [...(primary.requestNumbers || [primary.ticketNumber])];

        for (const secondary of secondaries) {
          const secondaryRef = db.collection('supportTickets').doc(secondary.id);
          const msgsSnap = await secondaryRef.collection('messages').orderBy('createdAt', 'asc').get();
          for (const msgDoc of msgsSnap.docs) {
            const newMsgRef = primaryRef.collection('messages').doc();
            await newMsgRef.set({ ...msgDoc.data(), messageId: newMsgRef.id, ticketId: primary.id, mergedFromTicket: secondary.ticketNumber || secondary.id });
          }
          if (Array.isArray(secondary.requestNumbers)) allRequestNumbers.push(...secondary.requestNumbers);
          else if (secondary.ticketNumber) allRequestNumbers.push(secondary.ticketNumber);

          await secondaryRef.update({ status: 'closed', mergedInto: primary.id, mergedIntoTicketNumber: primary.ticketNumber, mergedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });

          const logsSnap = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).where('ticketId', '==', secondary.id).where('markedFixed', '==', false).get();
          for (const logDoc of logsSnap.docs) {
            await logDoc.ref.update({ markedFixed: true, markedFixedAt: FieldValue.serverTimestamp(), adminNotes: `Merged into #${primary.ticketNumber}` });
          }
        }

        await primaryRef.update({ requestNumbers: [...new Set(allRequestNumbers)], status: 'open', updatedAt: FieldValue.serverTimestamp(), lastMessageAt: FieldValue.serverTimestamp() });

        const existingLog = await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).where('ticketId', '==', primary.id).where('markedFixed', '==', false).limit(1).get();
        if (existingLog.empty) {
          await db.collection(COLLECTIONS.USER_REPORTS_QUEUE).add({ ticketId: primary.id, ticketNumber: primary.ticketNumber, ticketType: primary.type || 'support', subject: primary.subject || 'Support Request', userName: primary.userName || userEmail.split('@')[0], userEmail, originalMessage: primary.subject || '', timestamp: FieldValue.serverTimestamp(), route: 'manual', confidence: 100, reasoning: `Merged ${secondaries.length} tickets into this thread`, urgency: 'medium', keywords: [], executionModel: 'manual', executionCost: 0, triageCost: 0, totalCost: 0, responseGenerated: false, responsePosted: false, responseContent: null, markedFixed: false, humanOverride: true, addedManually: true, autoQueued: false });
        }

        report.push({ email: userEmail, primary: primary.ticketNumber, merged: secondaries.map(s => s.ticketNumber) });
        logger.info(`✅ Merged ${secondaries.length} tickets into #${primary.ticketNumber} for ${userEmail}`);
      }

      return res.json({ success: true, usersProcessed: report.length, report });
    } catch (err) {
      logger.error('mergeAllSplitTicketsOnce error:', err);
      return res.status(500).json({ error: err.message });
    }
  }
);

// Reopen a closed ticket (user action)
exports.reopenTicket = onCall(
  {
    cors: true
  },
  async (request) => {
    const { ticketId } = request.data;

    if (!ticketId) {
      throw new Error('Ticket ID is required');
    }

    // Ensure user is authenticated
    if (!request.auth) {
      throw new Error('Authentication required');
    }

    logger.info(`🔓 User reopening ticket: ${ticketId}`);

    try {
      const db = admin.firestore();
      const FieldValue = admin.firestore.FieldValue;

      const ticketRef = db.collection('supportTickets').doc(ticketId);
      const ticketDoc = await ticketRef.get();

      if (!ticketDoc.exists) {
        throw new Error('Ticket not found');
      }

      const ticketData = ticketDoc.data();

      // Verify the user owns this ticket
      const callerEmail = (request.auth.token.email || '').toLowerCase().trim();
      if ((ticketData.userEmail || '').toLowerCase() !== callerEmail &&
          ticketData.userId !== request.auth.uid) {
        throw new HttpsError('permission-denied', 'Not authorized to reopen this ticket');
      }

      // Only allow reopening closed/resolved tickets
      if (ticketData.status !== 'closed' && ticketData.status !== 'resolved') {
        throw new Error('Only closed tickets can be reopened');
      }

      // Reopen the ticket by setting status to 'in-progress' and marking as customer reopened
      await ticketRef.update({
        status: 'in-progress',
        closedAt: null,
        userReadAt: null,
        adminReadAt: null, // Mark as unread for admin
        updatedAt: FieldValue.serverTimestamp(),
        reopenedAt: FieldValue.serverTimestamp(),
        reopenedBy: request.auth.token.email || request.auth.uid,
        customerReopened: true // Tag for admin to see
      });

      // Put it back on the User Reports dashboard (previously reopen only flipped ticket status)
      try {
        await ensureTicketInWorkQueue(db, FieldValue, {
          ticketId,
          ticketNumber: ticketData.ticketNumber || ticketId.slice(-6).toUpperCase(),
          ticketType: ticketData.type || 'support',
          subject: ticketData.subject || 'Support Request',
          userName: ticketData.userName || ticketData.userEmail?.split('@')[0] || 'Unknown',
          userEmail: ticketData.userEmail || '',
          originalMessage: ticketData.subject || 'Customer reopened ticket',
          reasoning: 'Customer reopened closed ticket',
          urgency: ticketData.type === 'bug' ? 'high' : 'medium',
          userAccountInfo: ticketData.userAccountInfo || null,
          autoQueued: true,
        });
      } catch (queueError) {
        logger.error(`⚠️ Failed to re-queue reopened ticket ${ticketId}:`, queueError.message);
      }

      logger.info(`✅ Ticket reopened successfully: ${ticketId}`);
      return { 
        success: true, 
        message: 'Ticket reopened successfully' 
      };
    } catch (error) {
      logger.error(`❌ Error reopening ticket: ${error.message}`);
      throw new Error(error.message || 'Failed to reopen ticket');
    }
  }
);

// Mark ticket as read by user
exports.markTicketAsRead = onCall(
  {
    cors: true
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Authentication required');
    }

    const { ticketId } = request.data;

    if (!ticketId) {
      throw new HttpsError('invalid-argument', 'Ticket ID is required');
    }

    logger.info(`👁️ Marking ticket as read: ${ticketId}`);

    try {
      const db = admin.firestore();
      const FieldValue = admin.firestore.FieldValue;

      const ticketRef = db.collection('supportTickets').doc(ticketId);
      const ticketDoc = await ticketRef.get();
      if (!ticketDoc.exists) {
        throw new HttpsError('not-found', 'Ticket not found');
      }

      const ticketData = ticketDoc.data();
      const callerEmail = (request.auth.token.email || '').toLowerCase().trim();
      const ownsTicket =
        (ticketData.userEmail || '').toLowerCase() === callerEmail ||
        ticketData.userId === request.auth.uid;
      const isCallerAdmin = ADMIN_EMAILS.includes(callerEmail);

      if (!ownsTicket && !isCallerAdmin) {
        throw new HttpsError('permission-denied', 'Not authorized to update this ticket');
      }

      await ticketRef.update({
        userReadAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      });

      logger.info(`✅ Ticket marked as read: ${ticketId}`);
      return { 
        success: true, 
        message: 'Ticket marked as read successfully' 
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error(`❌ Error marking ticket as read: ${error.message}`);
      throw new HttpsError('internal', 'Failed to mark ticket as read');
    }
  }
);

// ===== ADMIN MESSAGES FUNCTIONS =====

// Create admin message (one-way message from admin to user)
exports.createAdminMessage = onCall(
  {
    cors: true,
    region: 'us-central1'
  },
  async (request) => {
    try {
      verifyAdmin(request);
      const { userEmail, message, source } = request.data || {};

      if (!userEmail || !message) {
        logger.error('❌ Missing required fields:', { userEmail: !!userEmail, message: !!message });
        throw new HttpsError('invalid-argument', 'User email and message are required');
      }

      logger.info(`📨 Creating admin message for: ${userEmail}`);

      const db = admin.firestore();
      const FieldValue = admin.firestore.FieldValue;

      // Create admin message document (one-way dashboard letter — not CRM ticket replies)
      const messageRef = db.collection('adminMessages').doc();
      const messageData = {
        messageId: messageRef.id,
        userEmail: userEmail.toLowerCase().trim(),
        message: message.trim(),
        createdAt: FieldValue.serverTimestamp(),
        userReadAt: null, // Initially unread
        createdBy: 'admin',
        source: source === 'one-way' || !source ? 'one-way' : String(source),
      };

      await messageRef.set(messageData);

      logger.info(`✅ Admin message created: ${messageRef.id}`);
      return { 
        success: true, 
        messageId: messageRef.id,
        message: 'Admin message created successfully' 
      };
    } catch (error) {
      logger.error(`❌ Error creating admin message: ${error.message}`, error);
      if (error instanceof HttpsError) {
        throw error;
      }
      throw new HttpsError('internal', `Failed to create admin message: ${error.message}`);
    }
  }
);

// ===== SECURITY MANAGEMENT FUNCTIONS =====

// Get security data (unverified and suspicious accounts)
exports.getSecurityData = onCall(
  {
    cors: true
  },
  async (request) => {
    // Admin check
    const adminEmails = ['lebrockmaldonado@gmail.com', 'contact@thepepplanner.com', 'thepepplanner@gmail.com'];
    const userEmail = request.auth?.token?.email;
    
    if (!userEmail || !adminEmails.includes(userEmail.toLowerCase())) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const db = admin.firestore();
      const auth = admin.auth();
      
      // Get all users from Firestore
      const usersSnapshot = await db.collection('users').get();
      const allUsers = [];
      
      for (const doc of usersSnapshot.docs) {
        const userData = doc.data();
        try {
          const authUser = await auth.getUser(doc.id);
          allUsers.push({
            uid: doc.id,
            email: authUser.email,
            emailVerified: authUser.emailVerified,
            disabled: authUser.disabled,
            createdAt: userData.createdAt,
            lastActive: userData.lastActive,
            displayName: userData.displayName || authUser.displayName,
            subscription: userData.subscription
          });
        } catch (error) {
          // User might not exist in Auth
          allUsers.push({
            uid: doc.id,
            email: userData.email,
            emailVerified: false,
            disabled: false,
            createdAt: userData.createdAt,
            lastActive: userData.lastActive,
            displayName: userData.displayName,
            subscription: userData.subscription
          });
        }
      }

      // Filter unverified accounts
      const unverifiedAccounts = allUsers.filter(user => !user.emailVerified && !user.disabled);
      
      // Filter suspicious accounts - ONLY truly suspicious patterns
      const suspiciousAccounts = allUsers.filter(user => {
        if (user.disabled) return false;
        if (user.emailVerified) return false; // Skip verified users
        
        // Check for disposable email (HIGH PRIORITY - definitely suspicious)
        const disposableDomains = [
          'passmail.net', '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 
          'tempmail.com', 'throwaway.email', 'temp-mail.org', 'getnada.com', 
          'mohmal.com', 'yopmail.com', 'maildrop.cc', 'sharklasers.com',
          'grr.la', 'guerrillamailblock.com', 'pokemail.net', 'spam4.me',
          'bccto.me', 'chitthi.in', 'dispostable.com', 'meltmail.com',
          'mintemail.com', 'mytemp.email', 'tempail.com', 'tempr.email',
          'tmpmail.org', 'trashmail.com', 'trashmailer.com', 'emailondeck.com',
          'fakeinbox.com', 'getairmail.com', 'inboxkitten.com', 'mailcatch.com',
          'mailsac.com', 'mytrashmail.com', 'throwawaymail.com', 'tmpmail.net',
          'mailnesia.com', 'melt.li', 'nada.email', 'spamgourmet.com',
          'tempmailo.com', 'zoho.com'
        ];
        const domain = user.email?.split('@')[1]?.toLowerCase();
        const isDisposable = domain && disposableDomains.includes(domain);
        if (isDisposable) return true;
        
        // Check for bot-like email patterns (contains app name + random numbers)
        const emailLower = user.email?.toLowerCase() || '';
        if (emailLower.includes('thepepplanner') || emailLower.includes('pepplanner')) {
          // If email contains app name with random numbers, it's suspicious
          if (/\d{3,}/.test(emailLower)) return true;
        }
        
        // Only flag as suspicious if:
        // 1. Never logged in AND created more than 14 days ago
        // 2. OR inactive for more than 90 days (increased from 60)
        const now = new Date();
        let daysSinceCreation = 0;
        let daysSinceActive = 0;
        
        if (user.createdAt) {
          const created = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
          daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
        }
        
        if (user.lastActive) {
          const lastActive = user.lastActive.toDate ? user.lastActive.toDate() : new Date(user.lastActive);
          daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
        } else {
          // Never active - use creation date
          daysSinceActive = daysSinceCreation;
        }
        
        // Suspicious if: never used AND old (14+ days) OR inactive for 90+ days (increased threshold)
        if (!user.lastActive && daysSinceCreation > 14) return true;
        if (daysSinceActive > 90) return true; // Changed from 60 to 90 days
        
        return false;
      });
      
      // Add extra metadata for frontend display
      const enrichedUnverified = unverifiedAccounts.map(user => {
        const domain = user.email?.split('@')[1]?.toLowerCase();
        const disposableDomains = [
          'passmail.net', '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 
          'tempmail.com', 'throwaway.email', 'temp-mail.org', 'getnada.com', 
          'mohmal.com', 'yopmail.com', 'maildrop.cc', 'sharklasers.com',
          'grr.la', 'guerrillamailblock.com', 'pokemail.net', 'spam4.me',
          'bccto.me', 'chitthi.in', 'dispostable.com', 'meltmail.com',
          'mintemail.com', 'mytemp.email', 'tempail.com', 'tempr.email',
          'tmpmail.org', 'trashmail.com', 'trashmailer.com', 'emailondeck.com',
          'fakeinbox.com', 'getairmail.com', 'inboxkitten.com', 'mailcatch.com',
          'mailsac.com', 'mytrashmail.com', 'throwawaymail.com', 'tmpmail.net',
          'mailnesia.com', 'melt.li', 'nada.email', 'spamgourmet.com',
          'tempmailo.com', 'zoho.com'
        ];
        
        const now = new Date();
        let daysSinceCreation = 0;
        let daysSinceActive = 0;
        
        if (user.createdAt) {
          const created = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
          daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
        }
        
        if (user.lastActive) {
          const lastActive = user.lastActive.toDate ? user.lastActive.toDate() : new Date(user.lastActive);
          daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
        }
        
        return {
          ...user,
          isDisposableEmail: domain && disposableDomains.includes(domain),
          daysSinceCreation: Math.floor(daysSinceCreation),
          daysSinceActive: Math.floor(daysSinceActive),
          hasSubscription: user.subscription?.status === 'active' || user.subscription?.status === 'trialing'
        };
      });
      
      const enrichedSuspicious = suspiciousAccounts.map(user => {
        const domain = user.email?.split('@')[1]?.toLowerCase();
        const disposableDomains = [
          'passmail.net', '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 
          'tempmail.com', 'throwaway.email', 'temp-mail.org', 'getnada.com', 
          'mohmal.com', 'yopmail.com', 'maildrop.cc', 'sharklasers.com',
          'grr.la', 'guerrillamailblock.com', 'pokemail.net', 'spam4.me',
          'bccto.me', 'chitthi.in', 'dispostable.com', 'meltmail.com',
          'mintemail.com', 'mytemp.email', 'tempail.com', 'tempr.email',
          'tmpmail.org', 'trashmail.com', 'trashmailer.com', 'emailondeck.com',
          'fakeinbox.com', 'getairmail.com', 'inboxkitten.com', 'mailcatch.com',
          'mailsac.com', 'mytrashmail.com', 'throwawaymail.com', 'tmpmail.net',
          'mailnesia.com', 'melt.li', 'nada.email', 'spamgourmet.com',
          'tempmailo.com', 'zoho.com'
        ];
        
        const now = new Date();
        let daysSinceCreation = 0;
        let daysSinceActive = 0;
        
        if (user.createdAt) {
          const created = user.createdAt.toDate ? user.createdAt.toDate() : new Date(user.createdAt);
          daysSinceCreation = (now - created) / (1000 * 60 * 60 * 24);
        }
        
        if (user.lastActive) {
          const lastActive = user.lastActive.toDate ? user.lastActive.toDate() : new Date(user.lastActive);
          daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
        }
        
        return {
          ...user,
          isDisposableEmail: domain && disposableDomains.includes(domain),
          daysSinceCreation: Math.floor(daysSinceCreation),
          daysSinceActive: Math.floor(daysSinceActive),
          hasSubscription: user.subscription?.status === 'active' || user.subscription?.status === 'trialing'
        };
      });

      // Get blocked accounts
      const blockedAccounts = allUsers.filter(user => user.disabled);

      logger.info(`📊 Security data: ${enrichedUnverified.length} unverified, ${enrichedSuspicious.length} suspicious, ${blockedAccounts.length} blocked`);

      return {
        success: true,
        unverifiedAccounts: enrichedUnverified,
        suspiciousAccounts: enrichedSuspicious,
        blockedAccounts
      };
    } catch (error) {
      logger.error(`❌ Error getting security data: ${error.message}`);
      throw new HttpsError('internal', `Failed to get security data: ${error.message}`);
    }
  }
);

// Block a user (disable their account)
exports.blockUser = onCall(
  {
    cors: true
  },
  async (request) => {
    const adminEmails = ['lebrockmaldonado@gmail.com', 'contact@thepepplanner.com', 'thepepplanner@gmail.com'];
    const userEmail = request.auth?.token?.email;
    
    if (!userEmail || !adminEmails.includes(userEmail.toLowerCase())) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { userId, email } = request.data;
    
    if (!userId || !email) {
      throw new HttpsError('invalid-argument', 'User ID and email are required');
    }

    try {
      const auth = admin.auth();
      
      // Disable the user in Firebase Auth
      await auth.updateUser(userId, { disabled: true });
      
      logger.info(`🚫 User blocked: ${email} (${userId})`);
      
      return {
        success: true,
        message: 'User blocked successfully'
      };
    } catch (error) {
      logger.error(`❌ Error blocking user: ${error.message}`);
      throw new HttpsError('internal', `Failed to block user: ${error.message}`);
    }
  }
);

// Terminate a user (permanently delete account)
exports.terminateUser = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY']
  },
  async (request) => {
    const adminEmails = ['lebrockmaldonado@gmail.com', 'contact@thepepplanner.com', 'thepepplanner@gmail.com'];
    const userEmail = request.auth?.token?.email;
    
    if (!userEmail || !adminEmails.includes(userEmail.toLowerCase())) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { userId, email } = request.data;
    
    if (!userId || !email) {
      throw new HttpsError('invalid-argument', 'User ID and email are required');
    }

    logger.info(`🗑️ Admin terminating user account: ${email} (${userId})`);

    try {
      const auth = admin.auth();
      const db = admin.firestore();
      
      // STEP 1: Get user info BEFORE any deletion (needed for email)
      let userRecord;
      let userName = null;
      try {
        userRecord = await auth.getUser(userId);
        userName = userRecord.displayName || email.split('@')[0];
      } catch (error) {
        logger.warn(`⚠️ Could not fetch user record: ${error.message}`);
        userName = email.split('@')[0]; // Fallback to email username
      }

      // STEP 2: Get subscription info BEFORE deletion (needed for email)
      let subscriptionInfo = null;
      try {
        const subscriptionDoc = await db.collection('userSubscriptions').doc(userId).get();
        if (subscriptionDoc.exists) {
          subscriptionInfo = subscriptionDoc.data();
        }
      } catch (error) {
        logger.warn(`⚠️ Could not fetch subscription info: ${error.message}`);
      }

      // STEP 3: Cancel Stripe subscription FIRST (stop billing before anything else)
      if (subscriptionInfo?.stripeSubscriptionId) {
        try {
          const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
          if (stripeSecretKey && stripeSecretKey !== 'sk_test_fallback_key') {
            const stripe = require('stripe')(stripeSecretKey);
            const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionInfo.stripeSubscriptionId);
            
            if (stripeSubscription.status === 'active' || stripeSubscription.status === 'trialing') {
              await stripe.subscriptions.cancel(subscriptionInfo.stripeSubscriptionId);
              logger.info(`✅ Cancelled Stripe subscription: ${subscriptionInfo.stripeSubscriptionId}`);
            }
          } else {
            logger.warn(`⚠️ STRIPE_SECRET_KEY not configured, skipping subscription cancellation`);
          }
        } catch (error) {
          logger.warn(`⚠️ Could not cancel Stripe subscription: ${error.message}`);
          // Continue with deletion even if subscription cancellation fails
        }
      }

      // STEP 4: Delete ALL Firestore data first — only send confirmation after account is actually gone
      const userIdCols = [
        'users', 'userData', 'userdata', 'userSubscriptions',
        'userPreferences', 'userState', 'lifetimeAccess',
        'userSecurity', 'userNotificationSettings',
      ];
      await Promise.all(userIdCols.map(async (col) => {
        try {
          const ref = db.collection(col).doc(userId);
          const snap = await ref.get();
          if (snap.exists) { await ref.delete(); logger.info(`✅ Deleted ${col} for ${userId}`); }
        } catch (e) { logger.warn(`⚠️ Error deleting ${col}: ${e.message}`); }
      }));

      // Query-based deletions
      const qConfigs = [
        { col: 'notifications', field: 'userEmail', val: email },
        { col: 'adminMessages', field: 'userEmail', val: email },
        { col: 'feedback', field: 'userEmail', val: email },
        { col: 'user_agreements', field: 'userEmail', val: email },
      ];
      await Promise.all(qConfigs.map(async ({ col, field, val }) => {
        try {
          const snap = await db.collection(col).where(field, '==', val).get();
          if (!snap.empty) {
            const b = db.batch(); snap.docs.forEach(d => b.delete(d.ref)); await b.commit();
            logger.info(`✅ Deleted ${snap.size} ${col} docs`);
          }
        } catch (e) { logger.warn(`⚠️ Error deleting ${col}: ${e.message}`); }
      }));

      // Push subscriptions
      try {
        let pSnap = await db.collection('pushSubscriptions').where('userId', '==', userId).get();
        if (pSnap.empty) pSnap = await db.collection('pushSubscriptions').where('userEmail', '==', email).get();
        if (!pSnap.empty) { const b = db.batch(); pSnap.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
      } catch (e) { logger.warn(`⚠️ Error deleting push subscriptions: ${e.message}`); }

      // Support tickets + messages
      try {
        const tSnap = await db.collection('supportTickets').where('userEmail', '==', email).get();
        for (const t of tSnap.docs) {
          const m = await t.ref.collection('messages').get();
          if (!m.empty) { const b = db.batch(); m.docs.forEach(d => b.delete(d.ref)); await b.commit(); }
          await t.ref.delete();
        }
        if (!tSnap.empty) logger.info(`✅ Deleted ${tSnap.size} support tickets`);
      } catch (e) { logger.warn(`⚠️ Error deleting tickets: ${e.message}`); }

      // STEP 6: Delete from Firebase Auth — account is now fully gone (cannot log in)
      try {
        await auth.deleteUser(userId);
        logger.info(`✅ Deleted user from Firebase Auth: ${userId}`);
      } catch (error) {
        logger.error(`❌ Error deleting user from Firebase Auth: ${error.message}`);
        throw new HttpsError('internal', `Failed to delete user from authentication: ${error.message}`);
      }

      logger.info(`✅ Admin account termination completed successfully for: ${email} (${userId})`);

      // STEP 7: Send confirmation email only AFTER data and Auth are deleted (so we only say "deleted" when it's true)
      let goodbyeEmailSentAt = null;
      logger.info(`📧 Sending goodbye email to: ${email} (account already fully deleted)`);
      try {
        const emailService = require('./emailService');
        await emailService.sendAccountDeletionEmail(email, userName);
        goodbyeEmailSentAt = admin.firestore.Timestamp.now();
        logger.info(`✅ Account deletion confirmation email sent to: ${email}`);
      } catch (error) {
        logger.error(`❌ Could not send confirmation email: ${error.message}`);
        // Don't fail — deletion already succeeded; user just won't get the email
      }

      // Log deletion to Firestore for admin tracking (after email so we can store goodbyeEmailSentAt)
      try {
        const adminEmail = request.auth?.token?.email;
        await db.collection('accountDeletions').add({
          userId: userId,
          userEmail: email,
          userName: userName,
          deletedAt: admin.firestore.FieldValue.serverTimestamp(),
          deletionType: 'admin_terminated',
          deletedBy: adminEmail || 'unknown_admin',
          goodbyeEmailSentAt: goodbyeEmailSentAt || null,
          subscriptionCancelled: subscriptionInfo?.stripeSubscriptionId ? true : false,
          stripeSubscriptionId: subscriptionInfo?.stripeSubscriptionId || null,
          dataSummary: {
            hadSubscription: !!subscriptionInfo,
            hadLifetimeAccess: false // Could check lifetimeAccess collection if needed
          }
        });
        logger.info(`✅ Deletion logged to accountDeletions collection`);
      } catch (error) {
        logger.warn(`⚠️ Could not log deletion to Firestore: ${error.message}`);
      }
      
      return {
        success: true,
        message: 'User account and all associated data have been permanently deleted'
      };
    } catch (error) {
      logger.error(`❌ Error terminating user: ${error.message}`);
      
      // If it's already an HttpsError, re-throw it
      if (error instanceof HttpsError) {
        throw error;
      }
      
      throw new HttpsError('internal', `Failed to terminate user: ${error.message}`);
    }
  }
);

// Alias for admin panel (AccountDeletionRequests calls adminTerminateUser)
exports.adminTerminateUser = exports.terminateUser;

// Get auto-cleanup settings
exports.getAutoCleanupSettings = onCall(
  {
    cors: true
  },
  async (request) => {
    const adminEmails = ['lebrockmaldonado@gmail.com', 'contact@thepepplanner.com', 'thepepplanner@gmail.com'];
    const userEmail = request.auth?.token?.email;
    
    if (!userEmail || !adminEmails.includes(userEmail.toLowerCase())) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    try {
      const db = admin.firestore();
      const settingsDoc = await db.collection('config').doc('autoCleanup').get();
      
      if (settingsDoc.exists) {
        const data = settingsDoc.data();
        return {
          success: true,
          enabled: data.enabled || false,
          days: data.days || 30
        };
      }
      
      return {
        success: true,
        enabled: false,
        days: 30
      };
    } catch (error) {
      logger.error(`❌ Error getting auto-cleanup settings: ${error.message}`);
      throw new HttpsError('internal', `Failed to get settings: ${error.message}`);
    }
  }
);

// Update auto-cleanup settings
exports.updateAutoCleanupSettings = onCall(
  {
    cors: true
  },
  async (request) => {
    const adminEmails = ['lebrockmaldonado@gmail.com', 'contact@thepepplanner.com', 'thepepplanner@gmail.com'];
    const userEmail = request.auth?.token?.email;
    
    if (!userEmail || !adminEmails.includes(userEmail.toLowerCase())) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { enabled, days } = request.data;
    
    try {
      const db = admin.firestore();
      await db.collection('config').doc('autoCleanup').set({
        enabled: enabled || false,
        days: days || 30,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      logger.info(`⚙️ Auto-cleanup settings updated: enabled=${enabled}, days=${days}`);
      
      return {
        success: true,
        message: 'Settings updated successfully'
      };
    } catch (error) {
      logger.error(`❌ Error updating auto-cleanup settings: ${error.message}`);
      throw new HttpsError('internal', `Failed to update settings: ${error.message}`);
    }
  }
);

// Run auto-cleanup manually
// NOTE: Auto-cleanup function removed - manual review is safer for user retention
// Use admin panel auditing system to manually identify and remove suspicious accounts
// If you need to delete a specific user, use Firebase Console or create a targeted admin function

// ============================================================================
// Scheduled Low Stock Alerts
// Checks each user's stockpile data daily and sends a push notification
// using the admin-editable 'lowStock' template from Firestore
// ============================================================================
exports.scheduledLowStockAlerts = onSchedule({
  schedule: '0 14 * * *', // Daily at 2 PM UTC (~9-10 AM US)
  timeZone: 'UTC',
  secrets: []
}, async (event) => {
  logger.info('📦 Running scheduled low stock alert check...');
  
  try {
    const pushNotifications = require('./pushNotifications');
    const db = admin.firestore();
    
    // Get all users with push notifications enabled and lowStockAlerts enabled
    const usersSnapshot = await db
      .collection('users')
      .where('notificationSettings.push', '==', true)
      .where('notificationSettings.lowStockAlerts', '==', true)
      .get();
    
    let checkedCount = 0;
    let sentCount = 0;
    let skippedCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      checkedCount++;
      
      try {
        // Load user's stockpile data from userData collection
        const userDataDoc = await db.collection('userData').doc(userId).get();
        if (!userDataDoc.exists) continue;
        
        const userData = userDataDoc.data();
        const stockpile = userData?.stockpile || [];
        
        if (stockpile.length === 0) continue;
        
        // Get user's low stock threshold from settings (default: 3)
        const userSettings = userDoc.data()?.settings || {};
        const threshold = userSettings?.orders?.lowStockThreshold || 3;
        
        // Find items running low
        const lowStockItems = stockpile.filter(item => {
          const quantity = Number(item.quantity) || 0;
          return quantity <= threshold && quantity > 0;
        });
        
        if (lowStockItems.length === 0) continue;
        
        // Use the first low-stock item for the template variables
        const primaryItem = lowStockItems[0];
        const template = await pushNotifications.getNotificationTemplate('lowStock', {
          count: primaryItem.quantity || 1,
          peptideName: primaryItem.name || 'your peptide'
        });
        
        // If multiple items are low, adjust the body
        let body = template.body;
        if (lowStockItems.length > 1) {
          body += ` (+ ${lowStockItems.length - 1} more item${lowStockItems.length > 2 ? 's' : ''})`;
        }
        
        const notificationData = {
          title: template.title,
          body: body,
          data: {
            type: 'low_stock',
            itemCount: lowStockItems.length,
            path: template.actionUrl || '/app/stockpile',
            clickAction: `https://thepepplanner.com${template.actionUrl || '/app/stockpile'}`,
            appUrl: `https://thepepplanner.com${template.actionUrl || '/app/stockpile'}`
          }
        };
        
        const result = await pushNotifications.sendPushNotificationByType(userId, 'lowStockAlerts', notificationData);
        if (result.success) {
          sentCount++;
        } else {
          skippedCount++;
        }
      } catch (userError) {
        logger.warn(`⚠️ Error checking low stock for user ${userId}:`, userError.message);
        skippedCount++;
      }
    }
    
    logger.info(`✅ Low stock alerts complete: checked ${checkedCount}, sent ${sentCount}, skipped ${skippedCount}`);
  } catch (error) {
    logger.error('❌ Error in scheduled low stock alerts:', error);
  }
});

// ============================================================================
// Scheduled Cycle & Washout Reminders
// Checks each user's protocols daily and sends push notifications for:
// - washoutReminder: protocol ended X days ago, time for washout
// - cycleReminder: next cycle starting in X days
// - cycleEndReminder: current cycle ending in X days
// Uses admin-editable templates from Firestore
// ============================================================================
exports.scheduledCycleReminders = onSchedule({
  schedule: '0 13 * * *', // Daily at 1 PM UTC (~8-9 AM US)
  timeZone: 'UTC',
  secrets: []
}, async (event) => {
  logger.info('🔄 Running scheduled cycle & washout reminder check...');
  
  try {
    const pushNotifications = require('./pushNotifications');
    const db = admin.firestore();
    
    // Get all users with push notifications enabled
    const usersSnapshot = await db
      .collection('users')
      .where('notificationSettings.push', '==', true)
      .get();
    
    let checkedCount = 0;
    let sentCount = 0;
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userSettings = userDoc.data() || {};
      const notificationSettings = userSettings.notificationSettings || {};
      checkedCount++;
      
      try {
        // Load user's protocol data
        const userDataDoc = await db.collection('userData').doc(userId).get();
        if (!userDataDoc.exists) continue;
        
        const userData = userDataDoc.data();
        const protocols = userData?.protocols || [];
        
        if (protocols.length === 0) continue;
        
        // Get user timezone for correct "today"
        const userTimezone = userSettings.settings?.region?.timeZone || 'America/New_York';
        const now = new Date();
        const userDateString = now.toLocaleString("en-US", {
          timeZone: userTimezone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        const [month, day, year] = userDateString.split('/');
        const today = new Date(year, month - 1, day);
        today.setHours(0, 0, 0, 0);
        
        for (const protocol of protocols) {
          if (!protocol.startDate) continue;
          if (protocol.active === false) continue; // Skip stopped/ended protocols
          
          const protocolName = protocol.protocolName || protocol.name || 'your protocol';
          const startDate = new Date(protocol.startDate);
          startDate.setHours(0, 0, 0, 0);
          const endDate = protocol.endDate ? new Date(protocol.endDate) : null;
          if (endDate) endDate.setHours(23, 59, 59, 999);
          
          // --- Washout Reminders (protocol ended recently) ---
          if (notificationSettings.washoutReminders !== false && endDate) {
            const daysSinceEnd = Math.floor((today - endDate) / (1000 * 60 * 60 * 24));
            
            // Send washout reminder if protocol ended 1-3 days ago
            if (daysSinceEnd >= 1 && daysSinceEnd <= 3) {
              const template = await pushNotifications.getNotificationTemplate('washoutReminder', {
                protocolName,
                daysAgo: daysSinceEnd
              });
              
              const result = await pushNotifications.sendPushNotificationByType(userId, 'washoutReminders', {
                title: template.title,
                body: template.body,
                data: {
                  type: 'washout_reminder',
                  protocolName,
                  path: template.actionUrl || '/app/protocols',
                  clickAction: `https://thepepplanner.com${template.actionUrl || '/app/protocols'}`,
                  appUrl: `https://thepepplanner.com${template.actionUrl || '/app/protocols'}`
                }
              });
              if (result.success) sentCount++;
            }
          }
          
          // --- Cycle Reminders (for cycle-based protocols) ---
          // Only for protocols ACTIVE today - skip ended protocols (prevents "rogue" notifications)
          const isProtocolActiveToday = today >= startDate && (!endDate || today <= endDate);
          if (isProtocolActiveToday && notificationSettings.cycleReminders !== false && protocol.peptides) {
            for (const peptide of protocol.peptides) {
              if (peptide.frequency?.type !== 'cycle') continue;
              
              const onDays = Number(peptide.frequency.onDays) || 0;
              const offDays = Number(peptide.frequency.offDays) || 0;
              const cycleLength = onDays + offDays;
              
              if (cycleLength <= 0) continue;
              
              const daysSinceStart = Math.floor((today - startDate) / (1000 * 60 * 60 * 24));
              if (daysSinceStart < 0) continue; // Protocol hasn't started yet
              
              const currentCycleDay = daysSinceStart % cycleLength;
              
              // Cycle ending soon (within 3 days of off period)
              if (currentCycleDay >= onDays - 3 && currentCycleDay < onDays) {
                const daysUntilOff = onDays - currentCycleDay;
                const template = await pushNotifications.getNotificationTemplate('cycleEndReminder', {
                  protocolName,
                  daysUntil: daysUntilOff
                });
                
                const result = await pushNotifications.sendPushNotificationByType(userId, 'cycleReminders', {
                  title: template.title,
                  body: template.body,
                  data: {
                    type: 'cycle_end_reminder',
                    protocolName,
                    path: template.actionUrl || '/app/protocols',
                    clickAction: `https://thepepplanner.com${template.actionUrl || '/app/protocols'}`,
                    appUrl: `https://thepepplanner.com${template.actionUrl || '/app/protocols'}`
                  }
                });
                if (result.success) sentCount++;
              }
              
              // Off period ending soon (next cycle starting within 3 days)
              if (currentCycleDay >= onDays && currentCycleDay >= cycleLength - 3) {
                const daysUntilNext = cycleLength - currentCycleDay;
                const template = await pushNotifications.getNotificationTemplate('cycleReminder', {
                  protocolName,
                  daysUntil: daysUntilNext
                });
                
                const result = await pushNotifications.sendPushNotificationByType(userId, 'cycleReminders', {
                  title: template.title,
                  body: template.body,
                  data: {
                    type: 'cycle_reminder',
                    protocolName,
                    path: template.actionUrl || '/app/protocols',
                    clickAction: `https://thepepplanner.com${template.actionUrl || '/app/protocols'}`,
                    appUrl: `https://thepepplanner.com${template.actionUrl || '/app/protocols'}`
                  }
                });
                if (result.success) sentCount++;
              }
            }
          }
        }
      } catch (userError) {
        logger.warn(`⚠️ Error checking cycles for user ${userId}:`, userError.message);
      }
    }
    
    logger.info(`✅ Cycle reminders complete: checked ${checkedCount} users, sent ${sentCount} notifications`);
  } catch (error) {
    logger.error('❌ Error in scheduled cycle reminders:', error);
  }
});

// Process email queue every hour
exports.processEmailQueue = onSchedule({
  schedule: '0 * * * *', // Every hour
  timeZone: 'UTC',
}, async (event) => {
  logger.info('📧 Processing email queue...');
  try {
    const result = await emailQueue.processEmailQueue();
    logger.info(`✅ Email queue processed: ${result.processed} sent, ${result.failed} failed, ${result.remaining} quota remaining`);
    return result;
  } catch (error) {
    logger.error('❌ Error processing email queue:', error);
    throw error;
  }
});

// ==================== PASSWORDLESS MAGIC LINK ====================
// Generates a Firebase sign-in link via Admin SDK and delivers it
// through our branded Resend email — no default Firebase email sent.
// Unregistered emails receive a friendly "we've never met" email with
// a signup CTA instead of being silently dropped.
exports.sendMagicLinkEmail = onCall(
  {
    cors: true,
    secrets: ['RESEND_API_KEY'],
  },
  async (request) => {
    const { email } = request.data;

    if (!email || typeof email !== 'string') {
      throw new HttpsError('invalid-argument', 'A valid email address is required.');
    }

    const normalizedEmail = email.toLowerCase().trim();
    logger.info(`🔑 Magic link requested for: ${normalizedEmail}`);

    try {
      // Check if an account exists for this email.
      // Both branches return { success: true } so the frontend always shows
      // neutral "check your inbox" messaging regardless of outcome.
      let accountExists = false;
      try {
        await admin.auth().getUserByEmail(normalizedEmail);
        accountExists = true;
      } catch (lookupError) {
        if (lookupError.code !== 'auth/user-not-found') {
          // Unexpected error — surface it
          throw lookupError;
        }
      }

      if (accountExists) {
        const { getMagicLinkActionCodeSettings, toUniversalMagicLink } = require('./magicLinkUtils');
        const actionCodeSettings = getMagicLinkActionCodeSettings();
        const firebaseLink = await admin.auth().generateSignInWithEmailLink(
          normalizedEmail,
          actionCodeSettings
        );
        // Rewrite auth-domain URL → https://thepepplanner.app/magic-link?...
        // so Universal/App Links open the native app instead of a browser tab.
        const signInLink = toUniversalMagicLink(firebaseLink);
        const sent = await emailService.sendMagicLinkEmail(normalizedEmail, signInLink);
        if (!sent) {
          const { sendFirebaseEmailSignInLink } = require('./firebaseAuthEmailFallback');
          await sendFirebaseEmailSignInLink(normalizedEmail, actionCodeSettings);
          logger.info(`✅ Magic link sent via Firebase fallback to: ${normalizedEmail}`);
        } else {
          logger.info(`✅ Magic link sent to existing user: ${normalizedEmail}`);
        }
      } else {
        const sent = await emailService.sendUnregisteredMagicLinkEmail(normalizedEmail);
        if (!sent) {
          // Can't invent an account — but don't pretend Resend succeeded.
          logger.warn(`⚠️ Unregistered magic-link email failed (Resend down) for ${normalizedEmail}`);
          throw new HttpsError('internal', 'Failed to send sign-in link. Please try again.');
        }
        logger.info(`👋 Unregistered magic link email sent to: ${normalizedEmail}`);
      }

      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to send magic link email:', error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('internal', 'Failed to send sign-in link. Please try again.');
    }
  }
);

// ==================== SHARE INCENTIVE VERIFICATION ====================
exports.verifyShareScreenshot = shareVerification.verifyShareScreenshot;

// ==================== SYNC HEALTH CHECK ====================
exports.syncHealthCheck = syncHealthCheck.syncHealthCheck;

// ==================== TRIAL LIFECYCLE NOTIFICATIONS ====================
exports.sendTrialMilestoneNotifications = trialNotifications.sendTrialMilestoneNotifications;
exports.seedTrialNotificationConfig = trialNotifications.seedTrialNotificationConfig;

// ==================== ENGAGEMENT & LIFECYCLE PUSH ====================
exports.scheduledInactiveUserPush = pushNotificationEngine.scheduledInactiveUserPush;
exports.scheduledUnreadAnnouncementsPush = pushNotificationEngine.scheduledUnreadAnnouncementsPush;
exports.scheduledGroupBuyReminder = pushNotificationEngine.scheduledGroupBuyReminder;
exports.scheduledSubscriptionLifecyclePush = pushNotificationEngine.scheduledSubscriptionLifecyclePush;

// ==================== POST-DOWNGRADE WIN-BACK EMAILS ====================
exports.onSubscriptionDowngrade = postDowngradeEmails.onSubscriptionDowngrade;
exports.processScheduledWinBackEmails = postDowngradeEmails.processScheduledWinBackEmails;

// ==================== AI PRODUCT DESCRIPTION GENERATOR ====================
exports.generateProductDescription = generateProductDescriptionModule.generateProductDescription;

// ==================== SHOP INQUIRIES ====================
exports.onShopInquiryCreated = shopInquiries.onShopInquiryCreated;
exports.requestShopReviewLink = shopReviewRequests.requestShopReviewLink;
exports.getShopReviewToken = shopReviewRequests.getShopReviewToken;
exports.submitVerifiedShopReview = shopReviewRequests.submitVerifiedShopReview;

// ==================== SCHEDULED ACCOUNT DELETIONS ====================
const accountDeletionScheduler = require('./accountDeletionScheduler');
exports.adminPreviewDeletionSchedule = accountDeletionScheduler.adminPreviewDeletionSchedule;
exports.adminScheduleAccountDeletion = accountDeletionScheduler.adminScheduleAccountDeletion;
exports.adminRetryScheduledBilling = accountDeletionScheduler.adminRetryScheduledBilling;
exports.adminCancelScheduledDeletion = accountDeletionScheduler.adminCancelScheduledDeletion;
exports.processScheduledAccountDeletions = accountDeletionScheduler.processScheduledAccountDeletions;

// ==================== RESEARCH REMINDER SCHEDULER ====================
exports.onUserResearchReminderSync = researchReminderScheduler.onUserResearchReminderSync;
exports.onUserDataResearchReminderSync = researchReminderScheduler.onUserDataResearchReminderSync;
exports.fixResearchReminderDefaults = researchReminderScheduler.fixResearchReminderDefaults;

// ==================== PASSKEY (FACE ID / FINGERPRINT) AUTH ====================
const passkeyAuth = require('./passkeyAuth');
exports.generatePasskeyRegistrationOptions = passkeyAuth.generatePasskeyRegistrationOptions;
exports.verifyPasskeyRegistration = passkeyAuth.verifyPasskeyRegistration;
exports.generatePasskeyLoginOptions = passkeyAuth.generatePasskeyLoginOptions;
exports.verifyPasskeyLogin = passkeyAuth.verifyPasskeyLogin;
exports.listPasskeys = passkeyAuth.listPasskeys;
exports.removePasskey = passkeyAuth.removePasskey;

// ==================== COMMUNITY DISCOVER ====================
const discoverVendors = require('./discoverVendors');
exports.discoverApi = discoverVendors.discoverApi;