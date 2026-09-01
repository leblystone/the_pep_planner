/**
 * Fallback auth emails via Firebase Identity Toolkit when Resend is down
 * (e.g. sending domain not verified).
 *
 * Uses Google's OOB email delivery — unbranded, but reliable for account recovery.
 * Web API key is the same public client key already shipped in the app.
 */
const { logger } = require('firebase-functions');

// Public Firebase Web API key (also in src/config/appConfig.js) — required for Identity Toolkit OOB.
const DEFAULT_WEB_API_KEY = 'AIzaSyDzGVtlnIk0QzUSgK6o41KGpYKk6opdgcE';

function getWebApiKey() {
  return process.env.FIREBASE_WEB_API_KEY || DEFAULT_WEB_API_KEY;
}

async function sendFirebaseOobEmail(payload) {
  const apiKey = getWebApiKey();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'the-pep-planner/firebase-oob-fallback',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Firebase OOB failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

/**
 * Send Firebase's default password-reset email.
 */
async function sendFirebasePasswordResetEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  logger.warn(`⚠️ Resend unavailable — falling back to Firebase password reset for ${normalized}`);
  return sendFirebaseOobEmail({
    requestType: 'PASSWORD_RESET',
    email: normalized,
  });
}

/**
 * Send Firebase's default email-link (passwordless) sign-in email.
 * @param {string} email
 * @param {import('firebase-admin/auth').ActionCodeSettings} [actionCodeSettings]
 */
async function sendFirebaseEmailSignInLink(email, actionCodeSettings) {
  const normalized = String(email).trim().toLowerCase();
  logger.warn(`⚠️ Resend unavailable — falling back to Firebase email sign-in for ${normalized}`);
  return sendFirebaseOobEmail({
    requestType: 'EMAIL_SIGNIN',
    email: normalized,
    continueUrl: actionCodeSettings?.url || 'https://thepepplanner.app/magic-link',
    canHandleCodeInApp: actionCodeSettings?.handleCodeInApp !== false,
    ...(actionCodeSettings?.iOS?.bundleId
      ? { iOSBundleId: actionCodeSettings.iOS.bundleId }
      : {}),
    ...(actionCodeSettings?.android?.packageName
      ? {
          androidPackageName: actionCodeSettings.android.packageName,
          androidInstallApp: !!actionCodeSettings.android.installApp,
          androidMinimumVersion: actionCodeSettings.android.minimumVersion || undefined,
        }
      : {}),
  });
}

module.exports = {
  sendFirebasePasswordResetEmail,
  sendFirebaseEmailSignInLink,
};
