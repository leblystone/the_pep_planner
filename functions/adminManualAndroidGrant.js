/**
 * adminManualAndroidGrant
 *
 * Admin-callable function to manually write a Google Play subscription to Firestore.
 * Used when the Google Play webhook failed after a successful in-app purchase
 * (e.g. RTDN delivery failure, acknowledgment error, service account misconfiguration).
 *
 * Mirrors the GP_RP_PRODUCT_MAP in googlePlayWebhooks.js — keep in sync.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');

const FieldValue = admin.firestore.FieldValue;

const ADMIN_EMAILS = [
  'lebrockmaldonado@gmail.com',
  'contact@thepepplanner.com',
  'thepepplanner@gmail.com',
];

const FOUNDERS_CUTOFF_MS = new Date('2026-05-05T00:00:00.000Z').getTime();

// Keep in sync with googlePlayWebhooks.js GP_RP_PRODUCT_MAP
const PLAN_MAPPING = {
  'm.thepepplanner.app.researchmonthly':  { key: 'researchPlusMonthly',  name: 'Research+ Monthly',  interval: 'month',    tier: 'research_plus' },
  'm.thepepplanner.app.researchannual':   { key: 'researchPlusAnnual',   name: 'Research+ Annual',   interval: 'year',     tier: 'research_plus' },
  'm.thepepplanner.app.researchlifetime': { key: 'researchPlusLifetime', name: 'Research+ Lifetime', interval: 'lifetime', tier: 'research_plus' },
};

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

exports.adminManualAndroidGrant = onCall(
  { invoker: "public" },
  async (request) => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
    const callerEmail = request.auth.token.email;
    if (!callerEmail || !ADMIN_EMAILS.includes(callerEmail.toLowerCase())) {
      throw new HttpsError('permission-denied', 'Admin access required');
    }

    const { userId, productId, purchaseToken, reason, adminNote } = request.data;
    if (!userId) throw new HttpsError('invalid-argument', 'userId is required');

    const resolvedProductId = productId || 'm.thepepplanner.app.researchannual';
    const planDetails = PLAN_MAPPING[resolvedProductId];

    if (!planDetails) {
      throw new HttpsError(
        'invalid-argument',
        `Unknown product ID: ${resolvedProductId}. Valid IDs: ${Object.keys(PLAN_MAPPING).join(', ')}`
      );
    }

    const db = admin.firestore();

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) throw new HttpsError('not-found', `User ${userId} not found`);
    const userEmail = userDoc.data().email || null;

    const resolvedTier = await resolveUserTier(userId, planDetails.tier, db);

    const now = new Date();
    const periodEnd = planDetails.interval === 'year'
      ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
      : planDetails.interval === 'month'
        ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        : null;

    const subscriptionData = {
      userId,
      userEmail,
      status: 'active',
      tier: resolvedTier,
      plan: planDetails.name,
      planKey: planDetails.key,
      interval: planDetails.interval,
      paymentProvider: 'google_play',
      googlePlayProductId: resolvedProductId,
      ...(purchaseToken ? { googlePlayPurchaseToken: purchaseToken } : {}),
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      hasLifetimeAccess: planDetails.interval === 'lifetime',
      adminGranted: true,
      adminGrantedAt: FieldValue.serverTimestamp(),
      adminGrantedBy: callerEmail,
      adminGrantReason: reason || 'Manual admin grant — Google Play webhook failed after purchase',
      adminNote: adminNote || null,
      lastUpdated: FieldValue.serverTimestamp(),
    };

    const batch = db.batch();
    const subRef = db.collection('userSubscriptions').doc(userId);
    const userRef = db.collection('users').doc(userId);

    batch.set(subRef, { subscription: subscriptionData, lastUpdated: FieldValue.serverTimestamp() }, { merge: true });
    batch.set(userRef, { subscription: subscriptionData, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    batch.set(subRef.collection('history').doc(), {
      eventType: 'admin_manual_android_grant',
      title: `Admin manually granted ${planDetails.name}`,
      description: `Admin override: ${reason || 'Google Play webhook failed after purchase'}. Product: ${resolvedProductId}. Tier: ${resolvedTier}. Granted by: ${callerEmail}.`,
      severity: 'warning',
      status: 'active',
      source: 'admin_manual',
      adminGrantedBy: callerEmail,
      googlePlayProductId: resolvedProductId,
      eventTimestamp: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    logger.info(`✅ Admin manually granted Android subscription for user ${userId} (product: ${resolvedProductId}, tier: ${resolvedTier}) by ${callerEmail}`);

    return {
      success: true,
      userId,
      productId: resolvedProductId,
      tier: resolvedTier,
      plan: planDetails.name,
      interval: planDetails.interval,
      periodEnd: periodEnd ? periodEnd.toISOString() : null,
      message: `Granted ${planDetails.name} (${resolvedTier}) to ${userEmail}`,
    };
  }
);

