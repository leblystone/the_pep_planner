/**
 * Google Play Billing Verification
 * Verifies Google Play purchases and syncs subscription status to Firestore
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const { google } = require('googleapis');
const emailService = require('./emailService');

// Initialize Google Play Developer API client
// Note: You'll need to set up service account credentials in environment variables
// Set via: firebase functions:secrets:set GOOGLE_PLAY_SERVICE_ACCOUNT_KEY
let SERVICE_ACCOUNT_KEY = null;

// Load service account key from Firebase Functions secrets
// The secret is automatically injected as an environment variable when the function is called
function loadServiceAccountKey() {
  try {
    const keyValue = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY;
    if (keyValue) {
      // Remove any extra whitespace/newlines
      const cleaned = keyValue.trim().replace(/\r?\n/g, '');
      SERVICE_ACCOUNT_KEY = JSON.parse(cleaned);
      logger.info('✅ Google Play service account key loaded successfully');
      return true;
    } else {
      logger.warn('⚠️ GOOGLE_PLAY_SERVICE_ACCOUNT_KEY not found in environment');
      return false;
    }
  } catch (error) {
    logger.error('❌ Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_KEY:', error.message);
    return false;
  }
}

let playDeveloperClient = null;

function getPlayDeveloperClient() {
  // Try to load the key if not already loaded
  if (!SERVICE_ACCOUNT_KEY) {
    const loaded = loadServiceAccountKey();
    if (!loaded) {
      logger.warn('⚠️ Google Play service account key not configured');
      return null;
    }
  }

  if (playDeveloperClient) {
    return playDeveloperClient;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: SERVICE_ACCOUNT_KEY,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });

    playDeveloperClient = google.androidpublisher({
      version: 'v3',
      auth,
    });

    return playDeveloperClient;
  } catch (error) {
    logger.error('❌ Failed to initialize Google Play Developer client:', error);
    return null;
  }
}

/**
 * Verify the RSA signature of a Google Play purchase.
 * Uses the Base64 RSA public key from Play Console (Monetization > Licensing).
 * @param {string} originalJson - The raw JSON purchase data signed by Google
 * @param {string} signature - The Base64-encoded RSA signature
 * @returns {{ valid: boolean, reason?: string }}
 */
function verifyPurchaseSignature(originalJson, signature) {
  const licenseKey = process.env.GOOGLE_PLAY_LICENSE_KEY;

  if (!licenseKey) {
    logger.warn('⚠️ GOOGLE_PLAY_LICENSE_KEY not configured — skipping signature check');
    return { valid: true, reason: 'key_not_configured' };
  }

  if (!originalJson || !signature) {
    logger.error('❌ Missing originalJson or signature for verification');
    return { valid: false, reason: 'missing_data' };
  }

  try {
    const pemKey =
      '-----BEGIN PUBLIC KEY-----\n' +
      licenseKey.match(/.{1,64}/g).join('\n') +
      '\n-----END PUBLIC KEY-----';

    const verifier = crypto.createVerify('SHA1');
    verifier.update(originalJson);

    const isValid = verifier.verify(pemKey, signature, 'base64');

    if (!isValid) {
      logger.error('❌ Google Play purchase signature is INVALID — possible tampering');
    } else {
      logger.info('✅ Google Play purchase signature verified');
    }

    return { valid: isValid, reason: isValid ? 'verified' : 'invalid_signature' };
  } catch (error) {
    logger.error('❌ Signature verification threw an error:', error.message);
    return { valid: false, reason: `verification_error: ${error.message}` };
  }
}

/**
 * Verify Google Play purchase token
 * @param {string} packageName - App package name
 * @param {string} productId - Product/SKU ID
 * @param {string} purchaseToken - Purchase token from Google Play
 * @param {string} productType - 'subs' for subscriptions, 'inapp' for one-time purchases
 * @returns {Promise<Object>} Verified purchase data
 */
async function verifyPurchaseToken(packageName, productId, purchaseToken, productType) {
  const client = getPlayDeveloperClient();
  if (!client) {
    throw new Error('Google Play Developer API client not available');
  }

  try {
    if (productType === 'subs') {
      const response = await client.purchases.subscriptions.get({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
      });

      return {
        verified: true,
        purchaseType: 'subscription',
        data: response.data,
      };
    } else {
      const response = await client.purchases.products.get({
        packageName,
        productId,
        token: purchaseToken,
      });

      return {
        verified: true,
        purchaseType: 'product',
        data: response.data,
      };
    }
  } catch (error) {
    logger.error('❌ Failed to verify purchase token:', error);
    throw new Error(`Purchase verification failed: ${error.message}`);
  }
}

/**
 * Acknowledge a Google Play purchase
 * @param {string} packageName - App package name
 * @param {string} productId - Product/SKU ID
 * @param {string} purchaseToken - Purchase token from Google Play
 * @param {string} productType - 'subs' for subscriptions, 'inapp' for one-time purchases
 * @param {Object} purchaseData - Purchase data from verification
 */
async function acknowledgePurchase(packageName, productId, purchaseToken, productType, purchaseData) {
  // Check if already acknowledged
  const isAlreadyAcknowledged = purchaseData.acknowledgementState === 1;
  
  if (isAlreadyAcknowledged) {
    logger.info('✅ Purchase already acknowledged, skipping');
    return;
  }

  const client = getPlayDeveloperClient();
  if (!client) {
    logger.warn('⚠️ Cannot acknowledge purchase - Google Play Developer API client not available');
    return;
  }

  try {
    if (productType === 'subs') {
      await client.purchases.subscriptions.acknowledge({
        packageName,
        subscriptionId: productId,
        token: purchaseToken,
      });
      logger.info('✅ Subscription acknowledged successfully');
    } else {
      await client.purchases.products.acknowledge({
        packageName,
        productId,
        token: purchaseToken,
      });
      logger.info('✅ One-time purchase acknowledged successfully');
    }
  } catch (error) {
    logger.error('❌ Failed to acknowledge purchase:', error);
    // Don't throw - acknowledgement failure shouldn't block the entire flow
    // The client can retry acknowledgement later
  }
}

/**
 * Map Google Play purchase to subscription format
 * @param {Object} verifiedPurchase - Verified purchase data
 * @param {string} productId - Product ID
 * @param {Object} options - Additional options
 * @returns {Object} Subscription data for Firestore
 */
function mapPurchaseToSubscription(verifiedPurchase, productId, options = {}) {
  const { purchaseType, data } = verifiedPurchase;
  const { userId, userEmail } = options;

  // Determine plan details from product ID — both m. and com. prefixes accepted
  const planMapping = {
    'm.thepepplanner.app.researchmonthly':    { key: 'researchPlusMonthly',  name: 'Research+ Monthly',  interval: 'month',    tier: 'research_plus' },
    'm.thepepplanner.app.researchannual':     { key: 'researchPlusAnnual',   name: 'Research+ Annual',   interval: 'year',     tier: 'research_plus' },
    'm.thepepplanner.app.researchlifetime':   { key: 'researchPlusLifetime', name: 'Research+ Lifetime', interval: 'lifetime', tier: 'research_plus' },
    'com.thepepplanner.app.researchmonthly':  { key: 'researchPlusMonthly',  name: 'Research+ Monthly',  interval: 'month',    tier: 'research_plus' },
    'com.thepepplanner.app.researchannual':   { key: 'researchPlusAnnual',   name: 'Research+ Annual',   interval: 'year',     tier: 'research_plus' },
    'com.thepepplanner.app.researchlifetime': { key: 'researchPlusLifetime', name: 'Research+ Lifetime', interval: 'lifetime', tier: 'research_plus' },
  };

  const planDetails = planMapping[productId] || {
    key: productId,
    name: productId,
    interval: purchaseType === 'product' ? 'lifetime' : 'month',
    tier: null,
  };

  const subscriptionData = {
    userId,
    status: 'active',
    plan: planDetails.name,
    planKey: planDetails.key,
    ...(planDetails.tier && { tier: planDetails.tier }),
    interval: planDetails.interval,
    paymentProvider: 'google_play',
    googlePlayProductId: productId,
    googlePlayPurchaseToken: data.purchaseToken || options.purchaseToken,
    googlePlayOrderId: data.orderId || options.orderId,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (purchaseType === 'subscription') {
    // Subscription-specific fields
    subscriptionData.currentPeriodStart = data.startTimeMillis
      ? new Date(parseInt(data.startTimeMillis))
      : admin.firestore.FieldValue.serverTimestamp();
    subscriptionData.currentPeriodEnd = data.expiryTimeMillis
      ? new Date(parseInt(data.expiryTimeMillis))
      : null;
    subscriptionData.isAutoRenewing = data.autoRenewing === true;
    subscriptionData.cancelReason = data.cancelReason || null;
    subscriptionData.canceledAt = data.canceledAt || null;
  } else {
    // One-time purchase (lifetime)
    subscriptionData.hasLifetimeAccess = true;
    subscriptionData.lifetimeReason = 'google_play_purchase';
    subscriptionData.currentPeriodStart = data.purchaseTimeMillis
      ? new Date(parseInt(data.purchaseTimeMillis))
      : admin.firestore.FieldValue.serverTimestamp();
    subscriptionData.currentPeriodEnd = null; // Lifetime never expires
  }

  return subscriptionData;
}

/**
 * Verify Google Play Purchase
 * Callable Firebase function that verifies a Google Play purchase and syncs it to Firestore
 */
exports.verifyGooglePlayPurchase = onCall(
  {
    cors: true,
    secrets: ['GOOGLE_PLAY_SERVICE_ACCOUNT_KEY', 'GOOGLE_PLAY_LICENSE_KEY', 'RESEND_API_KEY'],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const {
      purchaseToken,
      orderId,
      packageName = 'com.thepepplanner.app',
      signature,
      originalJson,
      products,
      userId,
      userEmail,
      purchaseTime,
    } = request.data;

    if (!purchaseToken || !products || !Array.isArray(products) || products.length === 0) {
      throw new HttpsError('invalid-argument', 'purchaseToken and products are required');
    }

    const resolvedUserId = userId || request.auth.uid;
    if (!resolvedUserId) {
      throw new HttpsError('invalid-argument', 'userId is required');
    }

    logger.info(`🔍 Verifying Google Play purchase for user ${resolvedUserId}`);

    try {
      // Step 1: Verify the client-side RSA signature (tamper detection)
      const sigResult = verifyPurchaseSignature(originalJson, signature);
      if (!sigResult.valid) {
        logger.error(`🚨 Signature verification FAILED for user ${resolvedUserId}: ${sigResult.reason}`);
        throw new HttpsError('permission-denied', 'Purchase signature verification failed — possible tampering detected');
      }

      const productId = products[0];
      const productType = productId.includes('lifetime') ? 'inapp' : 'subs';

      // Step 2: Verify the purchase token with Google Play server-side API
      const verifiedPurchase = await verifyPurchaseToken(
        packageName,
        productId,
        purchaseToken,
        productType
      );

      if (!verifiedPurchase.verified) {
        throw new HttpsError('failed-precondition', 'Purchase verification failed');
      }

      // Validate purchase state from Google's API response
      const purchaseData = verifiedPurchase.data;
      if (productType === 'subs') {
        // paymentState: 0=pending, 1=received, 2=free_trial, 3=pending_deferred
        if (purchaseData.paymentState === 0) {
          throw new HttpsError('failed-precondition', 'Subscription payment is still pending');
        }
        // cancelReason: 0=user, 1=system (billing issue), 2=replaced, 3=developer
        if (purchaseData.cancelReason !== undefined && purchaseData.cancelReason !== null) {
          logger.warn(`⚠️ Subscription has cancelReason: ${purchaseData.cancelReason}`);
        }
      } else {
        // purchaseState: 0=purchased, 1=canceled, 2=pending
        if (purchaseData.purchaseState === 1) {
          throw new HttpsError('failed-precondition', 'Purchase has been canceled/refunded');
        }
        if (purchaseData.purchaseState === 2) {
          throw new HttpsError('failed-precondition', 'Purchase is still pending');
        }
      }

      // Idempotency: check if this purchase was already verified
      const existingPurchase = await admin.firestore()
        .collection('userSubscriptions').doc(resolvedUserId).get();
      if (existingPurchase.exists) {
        const existingSub = existingPurchase.data()?.subscription;
        if (existingSub?.googlePlayPurchaseToken === purchaseToken && existingSub?.status === 'active') {
          logger.info(`ℹ️ Purchase already verified for user ${resolvedUserId}, returning existing`);
          return { success: true, subscription: existingSub, alreadyVerified: true };
        }
      }

      await acknowledgePurchase(packageName, productId, purchaseToken, productType, purchaseData);

      // Map to subscription format
      const subscriptionData = mapPurchaseToSubscription(verifiedPurchase, productId, {
        userId: resolvedUserId,
        userEmail,
        purchaseToken,
        orderId,
      });

      const db = admin.firestore();

      // Update userSubscriptions collection
      await db.collection('userSubscriptions').doc(resolvedUserId).set(
        {
          subscription: subscriptionData,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // Update users collection
      await db.collection('users').doc(resolvedUserId).set(
        {
          subscription: subscriptionData,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      // If lifetime, also update lifetimeAccess collection
      if (subscriptionData.hasLifetimeAccess) {
        await db.collection('lifetimeAccess').doc(resolvedUserId).set(
          {
            userId: resolvedUserId,
            email: userEmail,
            reason: 'google_play_purchase',
            grantedBy: 'google-play-billing',
            grantedAt: admin.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            metadata: {
              googlePlayProductId: productId,
              googlePlayOrderId: orderId,
              purchaseToken,
            },
          },
          { merge: true }
        );
      }

      logger.info(`✅ Google Play purchase verified and synced for user ${resolvedUserId}`);

      // Send subscription confirmation email
      if (userEmail) {
        try {
          logger.info(`📧 Sending subscription confirmation email to ${userEmail}`);
          const planName = subscriptionData.plan || 'Premium Plan';
          await emailService.sendSubscriptionConfirmedEmail(userEmail, planName);
          logger.info(`✅ Subscription confirmation email sent to ${userEmail}`);
        } catch (emailError) {
          logger.error('❌ Failed to send subscription confirmation email:', emailError);
          // Don't fail the whole function if email fails
        }
      }

      return {
        success: true,
        subscription: subscriptionData,
      };
    } catch (error) {
      logger.error('❌ Error verifying Google Play purchase:', error);
      throw new HttpsError('internal', `Failed to verify purchase: ${error.message}`);
    }
  }
);

