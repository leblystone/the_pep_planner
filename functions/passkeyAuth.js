/**
 * Passkey (WebAuthn) authentication Cloud Functions.
 *
 * Ceremony flow:
 *  - Registration (authenticated): generate options → client creates credential → verify & store
 *  - Login (public): generate options → client asserts → verify → mint Firebase custom token
 *
 * Collections:
 *  - passkeyChallenges/{challengeId}  — short-lived challenges (5 min)
 *  - passkeyCredentials/{credentialId} — public keys owned by a user
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const admin = require('firebase-admin');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const RP_ID = 'thepepplanner.app';
const RP_NAME = 'The Pep Planner';
const ORIGIN = 'https://thepepplanner.app';
/** Android native Credential Manager origin (apk-key-hash form) is also accepted when present. */
const EXTRA_ORIGINS = [
  // SHA-256 fingerprints from public/.well-known/assetlinks.json → base64url apk-key-hash
  // Upload / debug keystore
  'android:apk-key-hash:OBrpOT6le8yYXanBbWiKiAsWgUN_WqWYI8YzjkKTKF0',
  // Google Play App Signing key
  'android:apk-key-hash:rCvC9lXha2RQDhKkj5Mo2KYVx7gt5OOjHD_t0OT5Ao8',
];

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function db() {
  return admin.firestore();
}

function requireAuth(request) {
  if (!request.auth?.uid) {
    throw new HttpsError('unauthenticated', 'You must be signed in.');
  }
  return request.auth.uid;
}

function expectedOrigins() {
  return [ORIGIN, ...EXTRA_ORIGINS];
}

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64Url(str) {
  return Buffer.from(str, 'base64url');
}

/**
 * Persist a challenge and return its Firestore id.
 */
async function storeChallenge({ type, uid, challenge, userHandle }) {
  const ref = db().collection('passkeyChallenges').doc();
  await ref.set({
    type,
    uid: uid || null,
    challenge,
    userHandle: userHandle || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
  });
  return ref.id;
}

async function consumeChallenge(challengeId, expectedType) {
  if (!challengeId) {
    throw new HttpsError('invalid-argument', 'Missing challengeId.');
  }
  const ref = db().collection('passkeyChallenges').doc(challengeId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Challenge not found or already used.');
  }
  const data = snap.data();
  if (data.type !== expectedType) {
    throw new HttpsError('invalid-argument', 'Challenge type mismatch.');
  }
  if (Date.now() > (data.expiresAt || 0)) {
    await ref.delete().catch(() => {});
    throw new HttpsError('deadline-exceeded', 'Challenge expired. Please try again.');
  }
  // One-time use
  await ref.delete().catch(() => {});
  return data;
}

/**
 * List existing credentials for a user (for excluding during registration).
 */
async function getUserCredentials(uid) {
  const snap = await db()
    .collection('passkeyCredentials')
    .where('uid', '==', uid)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─── Registration ────────────────────────────────────────────────────────────

exports.generatePasskeyRegistrationOptions = onCall(
  { cors: true },
  async (request) => {
    const uid = requireAuth(request);
    const email = request.auth.token.email || uid;
    const nickname = (request.data?.nickname || '').toString().slice(0, 64);

    const existing = await getUserCredentials(uid);
    const excludeCredentials = existing.map((c) => ({
      id: c.credentialId,
      transports: c.transports || undefined,
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userID: new TextEncoder().encode(uid),
      userName: email,
      userDisplayName: email,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
        authenticatorAttachment: 'platform',
      },
    });

    const challengeId = await storeChallenge({
      type: 'registration',
      uid,
      challenge: options.challenge,
      userHandle: uid,
    });

    logger.info('Passkey registration options generated', { uid, challengeId });
    return { options, challengeId, nickname };
  }
);

exports.verifyPasskeyRegistration = onCall(
  { cors: true },
  async (request) => {
    const uid = requireAuth(request);
    const { challengeId, response, nickname } = request.data || {};

    if (!response) {
      throw new HttpsError('invalid-argument', 'Missing registration response.');
    }

    const challengeData = await consumeChallenge(challengeId, 'registration');
    if (challengeData.uid !== uid) {
      throw new HttpsError('permission-denied', 'Challenge does not belong to this user.');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: expectedOrigins(),
        expectedRPID: RP_ID,
        requireUserVerification: true,
      });
    } catch (err) {
      logger.error('Passkey registration verify failed', err);
      throw new HttpsError('invalid-argument', err.message || 'Registration verification failed.');
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new HttpsError('invalid-argument', 'Registration could not be verified.');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const credentialId = credential.id;

    await db().collection('passkeyCredentials').doc(credentialId).set({
      uid,
      credentialId,
      publicKey: toBase64Url(credential.publicKey),
      counter: credential.counter ?? 0,
      deviceType: credentialDeviceType || 'singleDevice',
      backedUp: !!credentialBackedUp,
      transports: response.response?.transports || credential.transports || [],
      nickname: (nickname || 'This device').toString().slice(0, 64),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logger.info('Passkey registered', { uid, credentialId });
    return { success: true, credentialId };
  }
);

// ─── Login (discoverable / usernameless) ─────────────────────────────────────

exports.generatePasskeyLoginOptions = onCall(
  { cors: true },
  async () => {
    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      userVerification: 'required',
      // Empty allowCredentials → discoverable (resident key) flow
      allowCredentials: [],
    });

    const challengeId = await storeChallenge({
      type: 'authentication',
      challenge: options.challenge,
    });

    logger.info('Passkey login options generated', { challengeId });
    return { options, challengeId };
  }
);

exports.verifyPasskeyLogin = onCall(
  { cors: true },
  async (request) => {
    const { challengeId, response } = request.data || {};
    if (!response) {
      throw new HttpsError('invalid-argument', 'Missing authentication response.');
    }

    const challengeData = await consumeChallenge(challengeId, 'authentication');

    const credentialId = response.id;
    if (!credentialId) {
      throw new HttpsError('invalid-argument', 'Missing credential id.');
    }

    const credRef = db().collection('passkeyCredentials').doc(credentialId);
    const credSnap = await credRef.get();
    if (!credSnap.exists) {
      throw new HttpsError('not-found', 'No passkey found for this device. Please enroll in Account settings first.');
    }

    const cred = credSnap.data();

    // Prefer userHandle from assertion when present
    let uid = cred.uid;
    const userHandleB64 = response.response?.userHandle;
    if (userHandleB64) {
      try {
        const handleUid = Buffer.from(userHandleB64, 'base64url').toString('utf8');
        if (handleUid && handleUid !== uid) {
          // Credential must match the handle's user
          throw new HttpsError('permission-denied', 'Passkey does not match this account.');
        }
      } catch (e) {
        if (e instanceof HttpsError) throw e;
        // ignore decode errors — fall back to stored uid
      }
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: expectedOrigins(),
        expectedRPID: RP_ID,
        requireUserVerification: true,
        credential: {
          id: cred.credentialId,
          publicKey: fromBase64Url(cred.publicKey),
          counter: cred.counter || 0,
          transports: cred.transports || undefined,
        },
      });
    } catch (err) {
      logger.error('Passkey login verify failed', err);
      throw new HttpsError('invalid-argument', err.message || 'Authentication verification failed.');
    }

    if (!verification.verified) {
      throw new HttpsError('invalid-argument', 'Authentication could not be verified.');
    }

    const newCounter = verification.authenticationInfo?.newCounter ?? cred.counter ?? 0;
    await credRef.update({
      counter: newCounter,
      lastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const customToken = await admin.auth().createCustomToken(uid);
    let email = null;
    try {
      const userRecord = await admin.auth().getUser(uid);
      email = userRecord.email || null;
    } catch (_) {
      // ignore
    }

    logger.info('Passkey login success', { uid, credentialId });
    return { success: true, customToken, uid, email };
  }
);

// ─── Manage ──────────────────────────────────────────────────────────────────

exports.listPasskeys = onCall(
  { cors: true },
  async (request) => {
    const uid = requireAuth(request);
    const creds = await getUserCredentials(uid);
    return {
      passkeys: creds.map((c) => ({
        credentialId: c.credentialId,
        nickname: c.nickname || 'Device',
        deviceType: c.deviceType || null,
        createdAt: c.createdAt?.toDate?.()?.toISOString?.() || null,
        lastUsedAt: c.lastUsedAt?.toDate?.()?.toISOString?.() || null,
      })),
    };
  }
);

exports.removePasskey = onCall(
  { cors: true },
  async (request) => {
    const uid = requireAuth(request);
    const { credentialId } = request.data || {};
    if (!credentialId) {
      throw new HttpsError('invalid-argument', 'credentialId is required.');
    }

    const ref = db().collection('passkeyCredentials').doc(credentialId);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Passkey not found.');
    }
    if (snap.data().uid !== uid) {
      throw new HttpsError('permission-denied', 'Not your passkey.');
    }

    await ref.delete();
    logger.info('Passkey removed', { uid, credentialId });
    return { success: true };
  }
);
