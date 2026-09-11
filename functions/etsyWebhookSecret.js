const admin = require('firebase-admin');
const { logger } = require('firebase-functions');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || 'tpp-splendide';
const ETSY_WEBHOOK_URL = `https://us-central1-${PROJECT_ID}.cloudfunctions.net/etsyOrderWebhook`;
const CONFIG_DOC = '_config/etsyWebhook';

/** Recommended Etsy webhook events for shop order + inventory sync. */
const ETSY_WEBHOOK_EVENTS = ['order.paid', 'order.canceled', 'order.shipped'];

let cachedSecret = null;
let cacheExpiresAt = 0;

async function getEtsyWebhookSecret() {
  const fromEnv = (process.env.ETSY_WEBHOOK_SECRET || '').trim().replace(/\r?\n/g, '');
  if (fromEnv) return fromEnv;

  if (cachedSecret && Date.now() < cacheExpiresAt) return cachedSecret;

  try {
    const snap = await admin.firestore().doc(CONFIG_DOC).get();
    const secret = snap.exists ? String(snap.data()?.signingSecret || '').trim() : '';
    cachedSecret = secret;
    cacheExpiresAt = Date.now() + 60_000;
    return secret;
  } catch (err) {
    logger.error('Failed to load Etsy webhook secret from Firestore:', err);
    return '';
  }
}

function maskWebhookSecret(secret) {
  if (!secret) return null;
  if (secret.length <= 12) return 'whsec_••••';
  return `${secret.slice(0, 10)}…${secret.slice(-4)}`;
}

function invalidateEtsyWebhookSecretCache() {
  cachedSecret = null;
  cacheExpiresAt = 0;
}

module.exports = {
  ETSY_WEBHOOK_URL,
  ETSY_WEBHOOK_EVENTS,
  CONFIG_DOC,
  getEtsyWebhookSecret,
  maskWebhookSecret,
  invalidateEtsyWebhookSecretCache,
};
