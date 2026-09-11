const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

const {
  ETSY_WEBHOOK_URL,
  ETSY_WEBHOOK_EVENTS,
  CONFIG_DOC,
  getEtsyWebhookSecret,
  maskWebhookSecret,
  invalidateEtsyWebhookSecretCache,
} = require('./etsyWebhookSecret');

const ADMIN_EMAILS = [
  'lebrockmaldonado@gmail.com',
  'contact@thepepplanner.com',
  'thepepplanner@gmail.com',
];

function requireAdmin(request) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Authentication required');
  const email = (request.auth.token.email || '').toLowerCase();
  if (!ADMIN_EMAILS.includes(email)) throw new HttpsError('permission-denied', 'Admin access required');
  return email;
}

exports.getEtsyWebhookStatus = onCall({ cors: true }, async (request) => {
  requireAdmin(request);

  const snap = await admin.firestore().doc(CONFIG_DOC).get();
  const data = snap.exists ? snap.data() : {};
  const envSecret = (process.env.ETSY_WEBHOOK_SECRET || '').trim();
  const firestoreSecret = String(data.signingSecret || '').trim();
  const secret = envSecret || firestoreSecret;

  return {
    webhookUrl: ETSY_WEBHOOK_URL,
    events: ETSY_WEBHOOK_EVENTS,
    secretConfigured: !!secret,
    secretSource: envSecret ? 'env' : (firestoreSecret ? 'admin' : null),
    secretPreview: maskWebhookSecret(secret),
    updatedAt: data.updatedAt || null,
    updatedBy: data.updatedBy || null,
    portalUrl: 'https://www.etsy.com/developers/your-apps',
  };
});

exports.saveEtsyWebhookConfig = onCall({ cors: true }, async (request) => {
  const adminEmail = requireAdmin(request);
  const { signingSecret } = request.data || {};
  const secret = String(signingSecret || '').trim();

  if (!secret) {
    throw new HttpsError('invalid-argument', 'Signing secret is required');
  }
  if (!secret.startsWith('whsec_')) {
    throw new HttpsError(
      'invalid-argument',
      'Etsy signing secrets start with whsec_ — copy the full secret from Etsy Developer → Webhook portal',
    );
  }

  await admin.firestore().doc(CONFIG_DOC).set(
    {
      signingSecret: secret,
      webhookUrl: ETSY_WEBHOOK_URL,
      events: ETSY_WEBHOOK_EVENTS,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: adminEmail,
    },
    { merge: true },
  );

  invalidateEtsyWebhookSecretCache();

  return {
    ok: true,
    webhookUrl: ETSY_WEBHOOK_URL,
    secretPreview: maskWebhookSecret(secret),
  };
});
