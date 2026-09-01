import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit,
  serverTimestamp,
  increment,
  addDoc,
  Timestamp,
  onSnapshot,
  runTransaction,
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut,
  sendEmailVerification, 
  onAuthStateChanged,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  linkWithCredential,
  EmailAuthProvider,
  isSignInWithEmailLink,
  signInWithEmailLink
} from 'firebase/auth';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth } from '../config/firebase.js';
import { encryptUserData, decryptUserData, hashPassword } from '../utils/encryption.js';
import { getCurrentDeviceInfo } from '../utils/deviceDetection.js';
import { COLLECTIONS } from '../config/collections.js';

// ============================================================================
// AUTHENTICATION
// ============================================================================

/**
 * Check if user should be granted founder status (first 100 users)
 * Only grants founder status for users who sign up on or after November 4, 2025
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Whether user is a founder
 */
export async function checkAndAssignFounderStatus(userId) {
  try {
    // Define the founder program start date (November 4, 2025 at 00:00:00 UTC)
    const FOUNDER_PROGRAM_START_DATE = new Date('2025-11-04T00:00:00Z');
    const now = new Date();
    
    // Check if we're past the founder program start date
    if (now < FOUNDER_PROGRAM_START_DATE) {
      console.log('⏰ Founder program has not started yet (starts Nov 4, 2025)');
      return false;
    }
    
    // Get current founder count from analytics
    const analyticsRef = doc(db, 'analytics', 'founderCount');
    const analyticsDoc = await getDoc(analyticsRef);
    
    let currentFounderCount = 0;
    if (analyticsDoc.exists()) {
      currentFounderCount = analyticsDoc.data().totalFounders || 0;
    }
    
    // Check if we've already granted 100 founder badges
    if (currentFounderCount >= 100) {
      console.log('🏁 Founder program full (100/100 badges granted)');
      return false;
    }
    
    // Increment founder count
    const newFounderCount = currentFounderCount + 1;
    await setDoc(analyticsRef, {
      totalFounders: newFounderCount,
      lastUpdated: serverTimestamp()
    }, { merge: true });
    
    // Also track in user count for backwards compatibility
    const userCountRef = doc(db, 'analytics', 'userCount');
    await setDoc(userCountRef, {
      totalUsers: increment(1),
      lastUpdated: serverTimestamp()
    }, { merge: true });
    
    // Grant founder status
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      isFounder: true,
      founderNumber: newFounderCount,
      founderGrantedAt: serverTimestamp(),
      registeredAt: serverTimestamp()
    }, { merge: true });
    
    console.log(`🎉 Founder badge granted! User is founder #${newFounderCount}/100`);
    
    return true;
  } catch (error) {
    console.error('Error checking founder status:', error);
    return false;
  }
}

/**
 * Check if a user exists with the given email
 * @param {string} email - User email
 * @returns {Promise<boolean>} - Whether user exists
 */
export async function checkUserExists(email) {
  try {
    console.log('🔍 Firebase: Checking sign-in methods for:', email);
    console.log('🔍 Firebase: Using project:', auth.app.options.projectId);
    console.log('🔍 Firebase: Auth domain:', auth.app.options.authDomain);
    
    const signInMethods = await fetchSignInMethodsForEmail(auth, email);
    console.log('🔍 Firebase: Sign-in methods found:', signInMethods);
    console.log('🔍 Firebase: Sign-in methods length:', signInMethods.length);
    
    const authExists = signInMethods.length > 0;
    console.log('🔍 Firebase: User exists in AUTH?', authExists);
    
    // Check Firestore by querying users collection by email
    // Note: users collection uses UID as doc ID, so we need to query by email field
    let firestoreExists = false;
    let firestoreUserDoc = null;
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
      const querySnapshot = await getDocs(q);
      firestoreExists = !querySnapshot.empty;
      console.log('🔍 Firebase: User exists in FIRESTORE?', firestoreExists);
      if (firestoreExists && !querySnapshot.empty) {
        firestoreUserDoc = querySnapshot.docs[0];
        console.log('🔍 Firebase: User data in Firestore:', firestoreUserDoc.data());
      }
    } catch (firestoreError) {
      console.log('🔍 Firebase: Could not check Firestore:', firestoreError.message);
    }
    
    // If user exists in either place, consider them as existing
    // This handles cases where user was created but there's a sync issue
    const exists = authExists || firestoreExists;
    
    console.log('🔍 Firebase: Final user exists decision:', exists, '(auth:', authExists, ', firestore:', firestoreExists, ')');
    
    return exists;
  } catch (error) {
    console.error('❌ Firebase: Error checking user existence:', error);
    console.error('❌ Firebase: Error details:', {
      code: error.code,
      message: error.message,
      projectId: auth.app.options.projectId
    });
    return false;
  }
}

/**
 * Get detailed account status for an email
 * @param {string} email - User email
 * @returns {Promise<{existsInAuth: boolean, existsInFirestore: boolean, hasPassword: boolean, details: any}>}
 */
export async function getAccountStatus(email) {
  try {
    const status = {
      existsInAuth: false,
      existsInFirestore: false,
      hasPassword: false,
      firestoreDoc: null,
      signInMethods: [],
      details: {}
    };
    
    // Check Firebase Auth
    try {
      const signInMethods = await fetchSignInMethodsForEmail(auth, email);
      status.existsInAuth = signInMethods.length > 0;
      status.signInMethods = signInMethods;
      status.hasPassword = signInMethods.includes('password');
    } catch (authError) {
      console.error('Error checking auth:', authError);
    }
    
    // Check Firestore
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase()));
      const querySnapshot = await getDocs(q);
      status.existsInFirestore = !querySnapshot.empty;
      if (status.existsInFirestore && !querySnapshot.empty) {
        status.firestoreDoc = querySnapshot.docs[0].data();
        status.details.uid = querySnapshot.docs[0].id;
        status.details.createdAt = status.firestoreDoc.createdAt;
        status.details.lastActive = status.firestoreDoc.lastActive;
      }
    } catch (firestoreError) {
      console.error('Error checking Firestore:', firestoreError);
    }
    
    return status;
  } catch (error) {
    console.error('Error getting account status:', error);
    return {
      existsInAuth: false,
      existsInFirestore: false,
      hasPassword: false,
      details: { error: error.message }
    };
  }
}

/**
 * Get user's founder status from Firebase
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} - Whether user is a founder
 */
export async function getUserFounderStatus(userId) {
  try {
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data().isFounder || false;
    }
    return false;
  } catch (error) {
    console.error('Error getting founder status:', error);
    return false;
  }
}

/**
 * Register a new user with email and password
 */
export async function registerUser(email, password, inviteCode) {
  try {
    // Create Firebase Auth user (with timeout to prevent hanging on Simulator / poor network)
    const userCredential = await Promise.race([
      createUserWithEmailAndPassword(auth, email, password),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('auth/network-timeout')), 30000)
      ),
    ]);
    const user = userCredential.user;
    
    console.log('✅ Firebase Auth user created:', user.uid);
    
    // Get device information
    const deviceInfo = getCurrentDeviceInfo();
    
    // Try to create user document in Firestore (non-blocking)
    // onUserCreated may also send welcome + verification emails when this write succeeds.
    const userData = {
      email: email.toLowerCase(),
      uid: user.uid,
      createdAt: serverTimestamp(),
      lastActive: serverTimestamp(),
      isActive: true,
      emailVerified: user.emailVerified,
      deviceInfo: deviceInfo,
      // Used so web email-verify can send native signups back into the app
      verificationReturnTo: deviceInfo?.isNative ? 'native' : 'web',
    };
    
    try {
      console.log('🔥 Attempting to save user to Firestore...');
      // Add timeout to prevent hanging
      await Promise.race([
        setDoc(doc(db, 'users', user.uid), userData, { merge: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Firestore timeout')), 3000))
      ]);
      console.log('✅ User document saved to Firestore');
    } catch (firestoreError) {
      console.warn('⚠️ Firestore save failed (offline?), continuing anyway:', firestoreError.message);
      // Don't block registration if Firestore is unavailable
    }

    // Always request a custom verification email from the client.
    // Do not rely only on onUserCreated — that trigger never runs if the Firestore
    // write above timed out or failed, which left new users stuck with no email.
    try {
      const functions = getFunctions(undefined, 'us-central1');
      const sendVerification = httpsCallable(functions, 'sendCustomVerificationEmail');
      const { getVerificationReturnTo } = await import('../utils/deepLinks');
      await sendVerification({ returnTo: getVerificationReturnTo() });
      console.log('✅ Verification email requested after signup');
      try {
        sessionStorage.setItem('tpp_verification_email_sent', '1');
      } catch (_) {}
    } catch (verifyEmailError) {
      console.warn('⚠️ Verification email request failed (user can resend):', verifyEmailError?.message || verifyEmailError);
    }
    
    // Track registration analytics (non-blocking)
    try {
      await updateAnalytics('userRegistration');
    } catch (analyticsError) {
      console.warn('⚠️ Analytics tracking failed:', analyticsError);
    }

    // Per-user engagement: count first day (non-blocking)
    try {
      const { trackEngagement } = await import('../utils/engagementTracking');
      const { setPendingGapResult } = await import('../utils/reengagement');
      trackEngagement(user.uid, 'login')
        .then((gap) => {
          if (gap) setPendingGapResult(user.uid, gap);
        })
        .catch(() => {});
    } catch (_) {}

    return { user, userData };
  } catch (error) {
    console.error('❌ Registration failed:', error);
    throw error;
  }
}

/**
 * Sign in existing user.
 *
 * On native iOS/Android: calls the Capacitor Firebase Authentication plugin first.
 * That plugin uses the native Firebase iOS SDK (URLSession), which bypasses WKWebView's
 * HTTP/TLS transport — the layer that produces "nw_read…Operation timed out" in the Simulator.
 * We then also sign in via the JS SDK in the background so auth.currentUser is hydrated for
 * Firestore security rules. Both fire in parallel; we wait for whichever resolves first.
 *
 * On web: standard JS SDK path.
 */
export async function loginUser(email, password) {
  try {
    let user;

    let isNativePlatform = false;
    try {
      const { Capacitor } = await import('@capacitor/core');
      isNativePlatform = Capacitor.isNativePlatform();
    } catch (_) {}

    if (isNativePlatform) {
      const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');

      // Race: native plugin (URLSession) vs web SDK (WKWebView). Whichever wins first
      // provides the user object. The other resolves later and hydrates auth.currentUser.
      const NATIVE_MS = 30000;
      const WEB_MS = 30000;

      let nativeUserInfo = null;
      let webUser = null;

      const nativePromise = FirebaseAuthentication.signInWithEmailAndPassword({ email, password })
        .then(r => { nativeUserInfo = r?.user ?? null; return nativeUserInfo; });

      const webPromise = new Promise((resolve, reject) => {
        signInWithEmailAndPassword(auth, email, password)
          .then(cred => { webUser = cred.user; resolve(cred.user); })
          .catch(reject);
        setTimeout(() => reject(new Error('Firebase login timeout')), WEB_MS);
      });

      const nativeWithTimeout = new Promise((resolve, reject) => {
        nativePromise.then(resolve).catch(reject);
        setTimeout(() => reject(new Error('Firebase login timeout')), NATIVE_MS);
      });

      // Try both; if web SDK fails due to WKWebView network issues, native result is the fallback.
      const result = await Promise.any([webPromise, nativeWithTimeout]).catch(() => null);

      if (result) {
        user = result;
        // Ensure the slower path also finishes in background (hydrates auth.currentUser if web was slow).
        webPromise.catch(() => {});
        nativeWithTimeout.catch(() => {});
      } else {
        // Both failed — rethrow a clear error.
        throw new Error('Firebase login timeout');
      }

    } else {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      user = userCredential.user;
    }

    // Post-sign-in work fires in background — never blocks the returned user promise.
    const deviceInfo = getCurrentDeviceInfo();
    void Promise.resolve()
      .then(async () => {
        try {
          await Promise.race([
            updateDoc(doc(db, 'users', user.uid), {
              lastActive: serverTimestamp(),
              deviceInfo,
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Login Firestore timeout')), 8000))
          ]);
        } catch (firestoreError) {
          console.warn('⚠️ Login metadata update failed:', firestoreError?.message || firestoreError);
        }
        try { await updateAnalytics('userLogin'); } catch (_) {}
        try {
          const { trackEngagement } = await import('../utils/engagementTracking');
          const { setPendingGapResult } = await import('../utils/reengagement');
          trackEngagement(user.uid, 'login')
            .then((gap) => {
              if (gap) setPendingGapResult(user.uid, gap);
            })
            .catch(() => {});
        } catch (_) {}
      })
      .catch(() => {});

    return user;
  } catch (error) {
    console.error('Login failed:', {
      code: error?.code,
      message: error?.message,
      name: error?.name,
    });
    throw error;
  }
}

/**
 * Sign out current user
 */
export async function logoutUser() {
  // On native, sign out via the Capacitor plugin first (matches how we sign in).
  // The web SDK signOut requires a WKWebView network round-trip which can hang on
  // the iOS Simulator — give it a 5s cap then force-complete regardless.
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      try {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        await Promise.race([
          FirebaseAuthentication.signOut(),
          new Promise(r => setTimeout(r, 3000)),
        ]);
      } catch (_) {}
    }
  } catch (_) {}

  try {
    await Promise.race([
      signOut(auth),
      new Promise((_, reject) => setTimeout(() => reject(new Error('signOut timeout')), 5000)),
    ]);
  } catch (error) {
    // Even if the network call fails or times out, treat logout as successful.
    // The user's local session is cleared below by the caller.
    if (!error.message?.includes('signOut timeout')) {
      console.error('Logout failed:', error);
    }
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback);
}

// ============================================================================
// SOCIAL / PASSWORDLESS ENCRYPTION KEY
// ============================================================================

/**
 * For Google/magic-link/passkey users who have no password, we generate a
 * random key on first sign-in and store it in users/{uid}.socialEncKey.
 * Subsequent sign-ins retrieve it so we can still encrypt/decrypt userdata.
 */
export async function getOrCreateSocialEncKey(uid) { // exported so link flow can pre-seed the key
  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);
    if (snap.exists() && snap.data().socialEncKey) {
      return snap.data().socialEncKey;
    }
    // Generate a new random key (32-char hex)
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    const key = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
    await setDoc(userRef, { socialEncKey: key }, { merge: true });
    return key;
  } catch (error) {
    console.error('getOrCreateSocialEncKey failed:', error);
    throw error;
  }
}

// ============================================================================
// GOOGLE SIGN-IN
// ============================================================================

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');

/**
 * Sign in (or sign up) with Google.
 * Returns { user, isNewUser, encKey }.
 * Throws { code: 'auth/account-exists-with-different-credential', credential }
 * when the email already belongs to an email/password account so the caller
 * can show an account-link modal.
 */
export async function signInWithGoogle() {
  if (typeof auth.authStateReady === 'function') {
    await auth.authStateReady();
  }

  let result;

  // Detect native Capacitor platform (Android / iOS)
  let isNativePlatform = false;
  try {
    const { Capacitor } = await import('@capacitor/core');
    isNativePlatform = Capacitor.isNativePlatform();
  } catch (_) {}

  if (isNativePlatform) {
    // Native path: shows device account picker, never opens Chrome or reveals any URL
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const nativeResult = await FirebaseAuthentication.signInWithGoogle();
    const idToken = nativeResult.credential?.idToken;
    if (!idToken) throw new Error('No ID token returned from native Google Sign-In');
    const { signInWithCredential } = await import('firebase/auth');
    result = await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } else {
    // Web / PWA path
    try {
      result = await signInWithPopup(auth, googleProvider);
    } catch (error) {
      throw error;
    }
  }

  const user = result.user;
  const isNewUser = result._tokenResponse?.isNewUser ?? false;
  const deviceInfo = getCurrentDeviceInfo();

  // Ensure user document exists
  await setDoc(doc(db, 'users', user.uid), {
    email: (user.email || '').toLowerCase(),
    uid: user.uid,
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    provider: 'google',
    lastActive: serverTimestamp(),
    deviceInfo,
    ...(isNewUser ? { createdAt: serverTimestamp(), isActive: true, emailVerified: true } : {})
  }, { merge: true });

  const encKey = await getOrCreateSocialEncKey(user.uid);
  return { user, isNewUser, encKey };
}

/**
 * Complete Google redirect sign-in flow (if one is pending).
 * Returns null when there's no redirect result.
 */
export async function completeGoogleRedirectSignIn() {
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;

  const user = result.user;
  const isNewUser = result._tokenResponse?.isNewUser ?? false;
  const deviceInfo = getCurrentDeviceInfo();

  await setDoc(doc(db, 'users', user.uid), {
    email: (user.email || '').toLowerCase(),
    uid: user.uid,
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    provider: 'google',
    lastActive: serverTimestamp(),
    deviceInfo,
    ...(isNewUser ? { createdAt: serverTimestamp(), isActive: true, emailVerified: true } : {})
  }, { merge: true });

  const encKey = await getOrCreateSocialEncKey(user.uid);
  return { user, isNewUser, encKey };
}

/**
 * Link an existing email/password account to a pending Google credential.
 * Call this when signInWithGoogle throws account-exists.
 */
export async function linkGoogleToPasswordAccount(email, password, googleCredential) {
  const emailCred = EmailAuthProvider.credential(email, password);
  const result = await signInWithEmailAndPassword(auth, email, password);
  await linkWithCredential(result.user, googleCredential);
  return result.user;
}

// ============================================================================
// MAGIC LINK (PASSWORDLESS EMAIL)
// ============================================================================

/**
 * Send a branded sign-in magic link via our Cloud Function (Resend).
 * The Cloud Function generates the Firebase link via Admin SDK and delivers
 * it through our custom TPP email template — no default Firebase email is sent.
 * Saves the email to localStorage so the completion page can read it.
 */
export async function sendMagicLink(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const functions = getFunctions();
  const sendMagicLinkFn = httpsCallable(functions, 'sendMagicLinkEmail');
  await sendMagicLinkFn({ email: normalizedEmail });
  localStorage.setItem('tpp_magic_link_email', normalizedEmail);
}

/**
 * Returns true if the current URL is a Firebase magic-link callback.
 */
export function isMagicLinkUrl(href = window.location.href) {
  return isSignInWithEmailLink(auth, href);
}

/**
 * Complete magic-link sign-in.
 * Pass the email explicitly (from localStorage or user input) and the full href.
 * Returns { user, isNewUser, encKey }.
 */
export async function completeMagicLink(email, href = window.location.href) {
  const result = await signInWithEmailLink(auth, email.toLowerCase().trim(), href);
  const user = result.user;
  const isNewUser = result._tokenResponse?.isNewUser ?? false;
  const deviceInfo = getCurrentDeviceInfo();

  await setDoc(doc(db, 'users', user.uid), {
    email: (user.email || '').toLowerCase(),
    uid: user.uid,
    lastActive: serverTimestamp(),
    deviceInfo,
    // Only stamp provider/createdAt fields on brand-new accounts so existing
    // email+password users don't have their provider field overwritten.
    ...(isNewUser ? { provider: 'magiclink', createdAt: serverTimestamp(), isActive: true, emailVerified: true } : {})
  }, { merge: true });

  localStorage.removeItem('tpp_magic_link_email');
  const encKey = await getOrCreateSocialEncKey(user.uid);
  return { user, isNewUser, encKey };
}

// ============================================================================
// USER DATA (ENCRYPTED)
// ============================================================================

/**
 * Save user's private data (encrypted)
 */
export async function saveUserData(userId, userData, password) {
  try {
    const encryptedData = encryptUserData(userData, password);
    
    await setDoc(doc(db, 'userdata', userId), encryptedData, { merge: true });
    
    // Update analytics (anonymous)
    await updateAnalytics('dataSaved', userData);
    
    return true;
  } catch (error) {
    console.error('Failed to save user data:', error);
    throw error;
  }
}

/**
 * Load user's private data (decrypt)
 */
export async function loadUserData(userId, password) {
  try {
    const docRef = doc(db, 'userdata', userId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return null; // No data yet
    }
    
    const encryptedData = docSnap.data();
    
    // Fail fast if password is missing and data is encrypted
    if (!password && encryptedData && encryptedData.data && encryptedData.salt) {
      throw new Error('Password required for decryption');
    }
    
    // If no password and no encrypted data, return null (no data)
    if (!password && (!encryptedData || !encryptedData.data)) {
      return null;
    }
    
    const userData = decryptUserData(encryptedData, password);
    
    return userData;
  } catch (error) {
    // Only log decryption errors in development
    if (import.meta.env.DEV) {
      console.error('Failed to load user data:', error);
    }
    throw error;
  }
}

// ============================================================================
// ADMIN DATA (PUBLIC)
// ============================================================================

/**
 * Get all announcements
 */
export async function getAnnouncements() {
  try {
    const q = query(collection(db, 'announcements'), orderBy('date', 'desc'));
    const querySnapshot = await getDocs(q);
    const announcements = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data() || {};
      // Normalize date so consumers never choke on Firestore Timestamps after JSON cache round-trips
      let date = data.date;
      if (date?.toDate) {
        try {
          date = date.toDate().toISOString();
        } catch {
          /* keep original */
        }
      } else if (typeof date?.seconds === 'number') {
        date = new Date(date.seconds * 1000).toISOString();
      }
      announcements.push({ id: docSnap.id, ...data, date });
    });
    return announcements;
  } catch (error) {
    console.error('Failed to get announcements:', error);
    throw error;
  }
}

/**
 * Save announcement
 */
export async function saveAnnouncement(announcement) {
  try {
    const announcementData = {
      ...announcement,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    if (announcement.id) {
      // Update existing (setDoc with merge handles missing docs gracefully)
      await setDoc(doc(db, 'announcements', announcement.id), {
        ...announcement,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } else {
      // Create new
      const docRef = doc(collection(db, 'announcements'));
      await setDoc(docRef, announcementData);
    }
    
    return true;
  } catch (error) {
    console.error('Failed to save announcement:', error);
    throw error;
  }
}

/**
 * Delete announcement
 */
export async function deleteAnnouncement(id) {
  try {
    await deleteDoc(doc(db, 'announcements', id));
    return true;
  } catch (error) {
    console.error('Failed to delete announcement:', error);
    throw error;
  }
}

/**
 * Get global reaction counts for a list of announcement post IDs.
 * Returns { [postId]: { helpful: N, love: N, exciting: N, noted: N } }
 */
export async function getAnnouncementReactionCounts(postIds) {
  if (!postIds?.length) return {};
  try {
    const snaps = await Promise.all(
      postIds.map((id) => getDoc(doc(db, 'announcement_reactions', id)))
    );
    const result = {};
    snaps.forEach((snap, i) => {
      if (snap.exists()) result[postIds[i]] = snap.data();
    });
    return result;
  } catch (error) {
    console.error('Failed to get announcement reaction counts:', error);
    return {};
  }
}

/**
 * Get the current user's reactions across all announcements.
 * Returns { [postId]: { helpful: true, love: false, ... } }
 */
export async function getMyAnnouncementReactions(userId) {
  if (!userId) return {};
  try {
    const snap = await getDoc(doc(db, 'announcement_user_reactions', userId));
    return snap.exists() ? snap.data() : {};
  } catch (error) {
    console.error('Failed to get user announcement reactions:', error);
    return {};
  }
}

/**
 * Toggle a reaction for the current user on an announcement.
 * Atomically increments/decrements the global count.
 * Returns the new toggled state (true = reacted, false = un-reacted).
 */
/**
 * Admin: adjust global reaction count (seed engagement or correct counts).
 * @param {string} postId
 * @param {string} reactionId - helpful | love | exciting | noted
 * @param {number} delta - positive to add, negative to remove
 */
export async function adjustAnnouncementReactionCount(postId, reactionId, delta = 1) {
  if (!postId || !reactionId || !delta) return;
  const ref = doc(db, 'announcement_reactions', postId);
  if (delta < 0) {
    const snap = await getDoc(ref);
    const current = snap.exists() ? Number(snap.data()?.[reactionId] || 0) : 0;
    const next = Math.max(0, current + delta);
    await setDoc(ref, { [reactionId]: next }, { merge: true });
    return next;
  }
  await setDoc(ref, { [reactionId]: increment(delta) }, { merge: true });
  const snap = await getDoc(ref);
  return snap.exists() ? Number(snap.data()?.[reactionId] || 0) : delta;
}

export async function toggleAnnouncementReaction(postId, reactionId, userId) {
  if (!userId || !postId || !reactionId) return false;
  try {
    const userRef = doc(db, 'announcement_user_reactions', userId);
    const userSnap = await getDoc(userRef);
    const userData = userSnap.exists() ? userSnap.data() : {};
    const postReactions = userData[postId] || {};
    const hasReacted = postReactions[reactionId] === true;
    const newState = !hasReacted;

    await setDoc(userRef, {
      [postId]: { ...postReactions, [reactionId]: newState }
    }, { merge: true });

    await setDoc(
      doc(db, 'announcement_reactions', postId),
      { [reactionId]: increment(newState ? 1 : -1) },
      { merge: true }
    );

    return newState;
  } catch (error) {
    console.error('Failed to toggle announcement reaction:', error);
    throw error;
  }
}

/**
 * Get feature flags for admin
 */
export async function getFeatureFlags() {
  try {
    const docRef = doc(db, 'config', 'featureFlags');
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      return {};
    }
    
    return docSnap.data();
  } catch (error) {
    console.error('Failed to get feature flags:', error);
    throw error;
  }
}

/**
 * Update a specific feature flag
 */
export async function updateFeatureFlag(key, value) {
  try {
    const docRef = doc(db, 'config', 'featureFlags');
    await updateDoc(docRef, { [key]: value });
    return true;
  } catch (error) {
    console.error('Failed to update feature flag:', error);
    throw error;
  }
}

// ============================================================================
// ANALYTICS (ANONYMOUS)
// ============================================================================

/**
 * Update anonymous analytics
 */
async function updateAnalytics(action, data = {}) {
  try {
    // Skip analytics for native apps (only track PWA usage)
    // Native apps have their own analytics through Google Play/App Store
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (Capacitor.isNativePlatform()) {
        return; // Silently skip analytics for native apps
      }
    } catch {
      // Capacitor not available, continue with web analytics
    }
    
    const analyticsRef = doc(db, 'analytics', 'usage');
    
    const updates = {};
    
    switch (action) {
      case 'dataSaved':
        if (data.protocols) updates['featureUsage.protocolsCreated'] = increment(data.protocols.length || 0);
        if (data.orders) updates['featureUsage.ordersTracked'] = increment(data.orders.length || 0);
        if (data.vendors) updates['featureUsage.vendorsAdded'] = increment(data.vendors.length || 0);
        if (data.stockpile) updates['featureUsage.stockpileItems'] = increment(data.stockpile.length || 0);
        if (data.reconItems) updates['featureUsage.reconCalculations'] = increment(data.reconItems.length || 0);
        if (data.calendarNotes) updates['featureUsage.calendarEntries'] = increment(Object.keys(data.calendarNotes).length || 0);
        break;
      case 'userActive':
        updates['activeUsers'] = increment(1);
        updates['dailyActiveUsers'] = increment(1);
        break;
      case 'userLogin':
        updates['totalLogins'] = increment(1);
        updates['dailyLogins'] = increment(1);
        break;
      case 'userRegistration':
        updates['totalRegistrations'] = increment(1);
        updates['dailyRegistrations'] = increment(1);
        break;
    }
    
    if (Object.keys(updates).length > 0) {
      await updateDoc(analyticsRef, {
        ...updates,
        lastUpdated: serverTimestamp()
      });
    }
  } catch (error) {
    // Don't throw analytics errors - they shouldn't break the app
    console.error('Analytics update failed:', error);
  }
}

/**
 * Get analytics data for admin
 */
export async function getAnalytics() {
  try {
    const docRef = doc(db, 'analytics', 'usage');
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) {
      
      // Get current user count to initialize with real data
      let currentUserCount = 0;
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        currentUserCount = usersSnapshot.size;
      } catch (userError) {
        console.warn('Could not get user count for analytics initialization:', userError.message);
      }
      
      // Create initial analytics document with realistic estimates
      const initialData = {
        totalUsers: currentUserCount,
        activeUsers: Math.max(1, Math.floor(currentUserCount * 0.4)), // Estimate 40% active
        featureUsage: {
          protocolsCreated: Math.floor(currentUserCount * 2.5), // Estimate usage based on user count
          ordersTracked: Math.floor(currentUserCount * 1.8),
          vendorsAdded: Math.floor(currentUserCount * 1.2),
          stockpileItems: Math.floor(currentUserCount * 3.1),
          reconCalculations: Math.floor(currentUserCount * 4.2),
          calendarEntries: Math.floor(currentUserCount * 2.8)
        },
        totalLogins: Math.floor(currentUserCount * 8.5), // Estimate login frequency
        dailyLogins: Math.max(1, Math.floor(currentUserCount * 0.3)),
        totalRegistrations: currentUserCount,
        dailyRegistrations: Math.max(0, Math.floor(currentUserCount * 0.1)),
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp()
      };
      
      try {
        await setDoc(docRef, initialData);
        return initialData;
      } catch (createError) {
        console.warn('⚠️ Could not create analytics collection, returning default data:', createError.message);
        return initialData;
      }
    }
    
    return docSnap.data();
  } catch (error) {
    console.error('Failed to get analytics:', error);
    throw error;
  }
}

/**
 * Get user list for admin (basic info only)
 */
export async function getUserList() {
  try {
    const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const users = [];
    
    // Fetch all user subscriptions in parallel
    const userIds = [];
    const userDataMap = {};
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      userIds.push(doc.id);
      userDataMap[doc.id] = {
        id: doc.id,
        uid: doc.id,
        email: userData.email,
        displayName: userData.displayName,
        photoURL: userData.photoURL,
        createdAt: userData.createdAt,
        lastActive: userData.lastActive,
        inviteCodeUsed: userData.inviteCodeUsed,
        isActive: userData.isActive,
        deviceInfo: userData.deviceInfo,
        subscription: userData.subscription || null,
        trialEndDate: userData.trialEndDate || null,
        trialExtensionHistory: userData.trialExtensionHistory || []
      };
      });
    
    // Fetch subscriptions from userSubscriptions collection
    const subscriptionPromises = userIds.map(async (userId) => {
      try {
        const subscriptionDoc = await getDoc(doc(db, 'userSubscriptions', userId));
        if (subscriptionDoc.exists()) {
          const subData = subscriptionDoc.data();
          return { userId, subscription: subData.subscription || subData };
        }
      } catch (err) {
        // Suppress permission errors - these are expected when admin doesn't have access to all user subscriptions
        if (err.code !== 'permission-denied' && err.code !== 'permissions-denied') {
          console.warn(`Failed to fetch subscription for ${userId}:`, err);
        }
      }
      return { userId, subscription: null };
    });
    
    const subscriptions = await Promise.all(subscriptionPromises);
    
    // Merge subscription data
    subscriptions.forEach(({ userId, subscription }) => {
      if (subscription && userDataMap[userId]) {
        const existing = userDataMap[userId].subscription;
        const cancelAtPeriodEnd =
          subscription.cancelAtPeriodEnd === true ||
          subscription.cancel_at_period_end === true ||
          existing?.cancelAtPeriodEnd === true ||
          existing?.cancel_at_period_end === true;
        // Merge subscription data (prioritize userSubscriptions collection)
        userDataMap[userId].subscription = {
          ...(existing || {}),
          ...subscription,
          ...(cancelAtPeriodEnd ? { cancelAtPeriodEnd: true, cancel_at_period_end: true } : {}),
        };
        
        // Also set trialEndDate if available in subscription
        if (subscription.currentPeriodEnd && !userDataMap[userId].trialEndDate) {
          userDataMap[userId].trialEndDate = subscription.currentPeriodEnd;
        }
      }
    });
    
    return Object.values(userDataMap);
  } catch (error) {
    console.error('Failed to get user list:', error);
    throw error;
  }
}

/**
 * Fetch comprehensive profile data for admin review, including subscription + extension history
 * @param {string} userId
 * @returns {Promise<Object>}
 */
export async function getAdminUserProfile(userId) {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const userRef = doc(db, 'users', userId);
    const subscriptionRef = doc(db, 'userSubscriptions', userId);

    const [userSnap, subscriptionSnap] = await Promise.all([
      getDoc(userRef),
      getDoc(subscriptionRef)
    ]);

    if (!userSnap.exists()) {
      throw new Error('Researcher record not found');
    }

    const userData = userSnap.data();
    const subscriptionDoc = subscriptionSnap.exists() ? subscriptionSnap.data() : {};
    let subscriptionData = subscriptionDoc.subscription || userData.subscription || null;
    if (subscriptionData) {
      const userSub = userData.subscription;
      const cancelAtPeriodEnd =
        subscriptionData.cancelAtPeriodEnd === true ||
        subscriptionData.cancel_at_period_end === true ||
        userSub?.cancelAtPeriodEnd === true ||
        userSub?.cancel_at_period_end === true;
      if (userSub && userSub !== subscriptionData) {
        subscriptionData = { ...userSub, ...subscriptionData };
      }
      if (cancelAtPeriodEnd) {
        subscriptionData = { ...subscriptionData, cancelAtPeriodEnd: true, cancel_at_period_end: true };
      }
    }

    const extensionHistory = [];
    if (Array.isArray(userData.trialExtensionHistory)) {
      extensionHistory.push(...userData.trialExtensionHistory);
    }
    if (Array.isArray(subscriptionDoc.trialExtensionHistory)) {
      extensionHistory.push(...subscriptionDoc.trialExtensionHistory);
    }

    // Deduplicate entries by newEnd timestamp to avoid duplicates when both collections contain the same data
    const dedupedHistoryMap = new Map();
    extensionHistory.forEach((entry) => {
      if (!entry) return;
      const key = entry.newEnd || `${entry.extendedAt || ''}-${entry.addedDays || ''}`;
      if (!dedupedHistoryMap.has(key)) {
        dedupedHistoryMap.set(key, entry);
      }
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
  } catch (error) {
    console.error('❌ Failed to load admin user profile:', error);
    throw error;
  }
}

/**
 * Fetch admin user profile via callable (uses server-side read; works regardless of Firestore rules).
 * Use this in admin panel so profile loads don't depend on client rules.
 */
export async function getAdminUserProfileViaCallable(userId) {
  if (!userId) throw new Error('User ID is required');
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'getAdminUserProfile');
  const result = await fn({ userId });
  return result.data;
}

/**
 * Admin: run subscription reconciliation now (Stripe / Google Play / Apple / all).
 * @param {{ platform?: 'stripe'|'googleplay'|'apple'|'all', userId?: string }} opts
 */
export async function adminRunSubscriptionReconciliation(opts = {}) {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'adminRunSubscriptionReconciliation');
  const result = await fn(opts);
  return result.data;
}

/** Admin: subscription reconciliation audit log (missing restored / drift fixed). */
export async function getAdminSubscriptionReconciliationLog(opts = {}) {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'getAdminSubscriptionReconciliationLog');
  const result = await fn(opts);
  return result.data;
}

export async function scanAndFixSubscriptions() {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'scanAndFixSubscriptions', { timeout: 300000 });
  const result = await fn({});
  return result.data;
}

/**
 * Fetch aggregated activity history for a user (admin User Detail modal - Activity Log tab).
 * @param {string} userId - Firebase user ID
 * @param {number} [limit=100] - Max events to return
 * @returns {Promise<{ success: boolean, events: Array }>}
 */
export async function fetchUserActivityHistory(userId, limit = 100) {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'getUserActivityHistory');
  const result = await fn({ userId, limit });
  return result.data;
}

/**
 * Fetch communications (emails, admin messages, support tickets) for a user (admin User Detail modal - Communications tab).
 * @param {string} userId - Firebase user ID
 * @returns {Promise<{ success: boolean, emails: Array, adminMessages: Array, supportTickets: Array }>}
 */
export async function fetchUserCommunications(userId) {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'getUserCommunications');
  const result = await fn({ userId });
  return result.data;
}

/**
 * Manually revoke lifetime access for a user and restore their remaining trial days.
 * Used when Stripe webhooks fail to deliver a refund/cancellation event.
 */
export async function adminRevokeAndRestoreTrial(userId, reason = '', refundAmount = null) {
  const functions = getFunctions();
  const fn = httpsCallable(functions, 'adminRevokeAndRestoreTrial');
  const result = await fn({ userId, reason, refundAmount });
  return result.data;
}

/**
 * User-callable: claim the one-time 7-day trial extension.
 * Calls the extendTrial Cloud Function (guarded server-side to one use).
 * @returns {Promise<{ extended: boolean, newEndDate?: string, reason?: string }>}
 */
export async function claimTrialExtension() {
  const fns = getFunctions();
  const fn = httpsCallable(fns, 'extendTrial');
  const result = await fn({});
  return result.data;
}

/**
 * Extend a researcher's trial access window
 * @param {string} userId
 * @param {number} additionalDays
 * @param {string} [note]
 * @param {string} [adminEmail]
 * @returns {Promise<{ newEnd: string }>} new end date ISO string
 */
export async function extendTrialForUser(userId, additionalDays, note = '', adminEmail = 'admin@thepepplanner.com') {
  try {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const days = Number(additionalDays);
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error('Extension days must be greater than zero');
    }

    console.log(`⏰ Calling Cloud Function to extend trial for ${userId} by ${days} days`);

    // Call the Cloud Function (uses Admin SDK to bypass client permissions)
    const functions = getFunctions();
    const extendTrialFunction = httpsCallable(functions, 'adminExtendTrialPeriod');
    
    const result = await extendTrialFunction({
      userId,
      days,
      note,
      adminEmail
    });

    console.log('✅ Trial extended successfully via Cloud Function:', result.data);
    
    return {
      newEnd: result.data.newEndDate,
      extensionEntry: result.data.extensionEntry
    };
  } catch (error) {
    console.error('❌ Failed to extend trial access:', error);
    throw error;
  }
}

/**
 * Debug function to check user's subscription data in Firestore
 * @param {string} userId - User ID to check
 * @returns {Promise<Object>} Raw subscription data from both collections
 */
export async function debugUserSubscription(userId) {
  try {
    console.log(`🔍 Debugging subscription for user: ${userId}`);
    
    const functions = getFunctions();
    const debugFunction = httpsCallable(functions, 'debugUserSubscription');
    
    const result = await debugFunction({
      userId
    });
    
    console.log('📊 Raw Firestore data:', result.data);
    return result.data;
  } catch (error) {
    console.error('❌ Failed to debug subscription:', error);
    throw error;
  }
}

/**
 * Get a specific user by email (optimized for admin lifetime grant)
 * @param {string} email - User email to search for
 * @returns {Promise<Object|null>} User object or null if not found
 */
export async function getUserByEmail(email) {
  try {
    if (!email) {
      throw new Error('Email is required');
    }

    const normalizedEmail = email.toLowerCase().trim();
    
    // Query Firestore for user with matching email
    const q = query(
      collection(db, 'users'), 
      where('email', '==', normalizedEmail),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const userDoc = querySnapshot.docs[0];
    const userData = userDoc.data();
    const userId = userDoc.id;
    
    // Also fetch subscription data from userSubscriptions collection
    let subscriptionStatus = userData.subscriptionStatus;
    let subscriptionType = userData.subscriptionType;
    
    try {
      const subDoc = await getDoc(doc(db, 'userSubscriptions', userId));
      if (subDoc.exists()) {
        const subData = subDoc.data();
        
        // Subscription data is nested inside a 'subscription' object
        const sub = subData.subscription || {};
        
        // Check multiple possible field names for status
        subscriptionStatus = sub.status || 
                            sub.subscriptionStatus || 
                            sub.subscription_status ||
                            subData.status || 
                            subData.subscriptionStatus || 
                            subscriptionStatus;
        
        // Check multiple possible field names for type/plan
        subscriptionType = sub.plan ||  // ← This is where it is!
                          sub.type || 
                          sub.subscriptionType || 
                          sub.subscription_type ||
                          sub.planType ||
                          subData.type || 
                          subData.subscriptionType || 
                          subData.plan ||
                          subscriptionType;
      }
    } catch (error) {
      // Silently handle subscription fetch errors (permission issues are expected for some users)
    }
    
    return {
      userId: userId,
      id: userId,
      uid: userId,
      email: userData.email,
      displayName: userData.displayName,
      photoURL: userData.photoURL || null,
      createdAt: userData.createdAt,
      lastActive: userData.lastActive,
      lastLoginAt: userData.lastLoginAt,
      inviteCodeUsed: userData.inviteCodeUsed,
      isActive: userData.isActive,
      deviceInfo: userData.deviceInfo || null,
      engagement: userData.engagement || null,
      milestones: userData.milestones || null,
      subscription: userData.subscription,
      subscriptionStatus: subscriptionStatus,
      subscriptionType: subscriptionType
    };
  } catch (error) {
    console.error('Failed to get user by email:', error);
    throw error;
  }
}

// ============================================================================
// FEEDBACK SYSTEM
// ============================================================================

/**
 * Submit feedback from users
 * @param {Object} feedbackData - The feedback data
 * @returns {Promise<string>} - The feedback document ID
 */
export async function submitFeedback(feedbackData) {
  try {
    const functions = getFunctions();
    const submitFeedbackFn = httpsCallable(functions, 'submitFeedback', { timeout: 30000 });
    
    const result = await submitFeedbackFn(feedbackData);
    
    if (result.data.success) {
      return result.data.feedbackId;
    } else {
      throw new Error(result.data.message || 'Failed to submit feedback');
    }
  } catch (error) {
    console.error('❌ Failed to submit feedback:', error);
    throw error;
  }
}

/**
 * Get all feedback for admin view
 * @returns {Promise<Array>} - Array of feedback items
 */
export async function getAllFeedback({ openOnly = false } = {}) {
  try {
    const feedbackRef = collection(db, 'feedback');
    // Open inbox only needs actionable feedback — skip resolved docs on dashboard load.
    const q = openOnly
      ? query(feedbackRef, where('status', 'in', ['new', 'reviewed', 'responded']))
      : query(feedbackRef, orderBy('submittedAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const feedback = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      feedback.push({
        id: docSnap.id,
        ...data,
        message: data.message ?? data.feedback ?? ''
      });
    });

    if (openOnly) {
      feedback.sort((a, b) => {
        const ta = a.submittedAt?.toDate?.()?.getTime?.() ?? a.submittedAt ?? 0;
        const tb = b.submittedAt?.toDate?.()?.getTime?.() ?? b.submittedAt ?? 0;
        return tb - ta;
      });
    }
    
    return feedback;
  } catch (error) {
    console.error('❌ Failed to get feedback:', error);
    throw error;
  }
}

/**
 * Update feedback status and admin notes
 * @param {string} feedbackId - The feedback document ID
 * @param {Object} updates - Updates to apply
 * @returns {Promise<void>}
 */
export async function updateFeedback(feedbackId, updates) {
  try {
    const feedbackRef = doc(db, 'feedback', feedbackId);
    await updateDoc(feedbackRef, {
      ...updates,
      updatedAt: serverTimestamp()
    });
    
  } catch (error) {
    console.error('❌ Failed to update feedback:', error);
    throw error;
  }
}

/**
 * Delete feedback
 * @param {string} feedbackId - The feedback document ID
 * @returns {Promise<void>}
 */
export async function deleteFeedback(feedbackId) {
  try {
    const feedbackRef = doc(db, 'feedback', feedbackId);
    await deleteDoc(feedbackRef);
    
  } catch (error) {
    console.error('❌ Failed to delete feedback:', error);
    throw error;
  }
}

/**
 * Respond to feedback and notify user
 * @param {string} feedbackId - The feedback document ID
 * @param {string} responseText - Admin's response
 * @param {string} userEmail - Email of the feedback submitter
 * @returns {Promise<void>}
 */
export async function respondToFeedback(feedbackId, responseText, userEmail) {
  try {
    if (!userEmail) {
      throw new Error('User email is required to send feedback response');
    }

    // Update feedback with response
    const feedbackRef = doc(db, 'feedback', feedbackId);
    await updateDoc(feedbackRef, {
      adminResponse: responseText,
      responseDate: serverTimestamp(),
      status: 'responded'
    });

    // Create in-app notification for the user (with fallback if permissions fail)
    try {
      const notificationRef = collection(db, 'notifications');
      await addDoc(notificationRef, {
        userEmail: userEmail.toLowerCase(),
        type: 'feedback_response',
        title: 'Response to Your Feedback',
        message: responseText,
        isRead: false,
        createdAt: serverTimestamp(),
        feedbackId: feedbackId
      });
    } catch (notificationError) {
      console.warn('⚠️ Could not create notification (permissions issue):', notificationError.message);
      console.log('📧 Feedback response saved but user notification failed - consider updating Firebase rules');
    }

  } catch (error) {
    console.error('❌ Failed to send feedback response:', error);
    throw error;
  }
}

// ============================================================================
// SUPPORT TICKET SYSTEM
// ============================================================================

/**
 * Ensure a feedback report has a linked support ticket thread (lazy create on first CRM reply).
 * Does NOT use createSupportTicket (avoids merging into an unrelated open support ticket).
 * @param {Object} feedbackItem - Feedback doc (id, userEmail, type/message fields)
 * @returns {Promise<string>} ticketId
 */
export async function ensureFeedbackTicket(feedbackItem) {
  const feedbackId = feedbackItem?.id;
  if (!feedbackId) throw new Error('feedback id required');

  const feedbackRef = doc(db, 'feedback', feedbackId);
  const snap = await getDoc(feedbackRef);
  if (!snap.exists()) throw new Error('Feedback not found');
  const data = snap.data() || {};

  if (data.linkedTicketId) return data.linkedTicketId;

  const email = String(
    feedbackItem.userEmail || feedbackItem._email || data.userEmail || data.email || ''
  ).toLowerCase().trim();
  if (!email) throw new Error('Feedback has no user email');

  const typeRaw = String(
    feedbackItem._type || feedbackItem.type || data.type || 'bug'
  ).toLowerCase();
  const type = typeRaw.includes('suggest') ? 'suggestion' : 'bug';
  const message = String(
    feedbackItem.message || feedbackItem.feedback || data.message || data.feedback || ''
  ).trim();
  const userName =
    feedbackItem.userName || data.userName || email.split('@')[0];
  const userId = feedbackItem.userId || data.userId || null;

  let ticketNumber;
  try {
    const counterRef = doc(db, '_counters', 'supportTickets');
    await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let currentCount = counterDoc.exists() ? (counterDoc.data().count || 0) : 0;
      if (currentCount === 0) currentCount = 4;
      else currentCount += 1;
      ticketNumber = `Z${String(currentCount).padStart(3, '0')}`;
      transaction.set(
        counterRef,
        { count: currentCount, lastUpdated: serverTimestamp() },
        { merge: true }
      );
    });
  } catch (err) {
    console.warn('Ticket counter unavailable, using feedback-based number:', err?.message);
    ticketNumber = `F${feedbackId.slice(-6).toUpperCase()}`;
  }

  const ticketRef = await addDoc(collection(db, 'supportTickets'), {
    ticketNumber,
    userEmail: email,
    userId,
    userName,
    type,
    subject: type === 'suggestion' ? 'Suggestion' : 'Bug Report',
    status: 'in-progress',
    feedbackId,
    source: 'feedback',
    skipGhostWorker: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastMessageAt: serverTimestamp(),
    createdBy: 'admin-crm',
  });

  if (message) {
    await addDoc(collection(db, 'supportTickets', ticketRef.id, 'messages'), {
      message,
      text: message,
      senderType: 'user',
      senderEmail: email,
      senderName: userName,
      createdAt: serverTimestamp(),
      seededFromFeedback: true,
    });
  }

  await updateDoc(feedbackRef, {
    linkedTicketId: ticketRef.id,
    updatedAt: serverTimestamp(),
  });

  try {
    const queueSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.USER_REPORTS_QUEUE),
        where('feedbackId', '==', feedbackId),
        limit(10)
      )
    );
    await Promise.all(
      queueSnap.docs.map((d) =>
        updateDoc(d.ref, {
          ticketId: ticketRef.id,
          ticketNumber,
        })
      )
    );
  } catch (err) {
    console.warn('Could not update queue ticketId for feedback:', err?.message);
  }

  return ticketRef.id;
}

/**
 * Reply to a bug/suggestion via its linked support ticket (unified user inbox).
 * Creates the ticket on first reply. Does not write adminMessages.
 * @returns {Promise<{ ticketId: string, messageId: string }>}
 */
export async function replyToFeedbackViaTicket(feedbackItem, responseText) {
  const text = String(responseText || '').trim();
  if (!text) throw new Error('Response text required');
  if (!feedbackItem?.id) throw new Error('feedback id required');

  const ticketId = await ensureFeedbackTicket(feedbackItem);

  const msgRef = await addDoc(collection(db, 'supportTickets', ticketId, 'messages'), {
    message: text,
    text,
    senderType: 'admin',
    senderName: 'The Pep Planner Team',
    senderEmail: 'support@thepepplanner.com',
    createdAt: serverTimestamp(),
    sentVia: 'work-queue-feedback',
  });

  await updateDoc(doc(db, 'supportTickets', ticketId), {
    lastMessageAt: serverTimestamp(),
    lastAdminMessageAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'in-progress',
  });

  await updateFeedback(feedbackItem.id, {
    status: 'reviewed',
    adminResponse: text,
    responseDate: new Date(),
    linkedTicketId: ticketId,
  });

  try {
    const queueSnap = await getDocs(
      query(
        collection(db, COLLECTIONS.USER_REPORTS_QUEUE),
        where('feedbackId', '==', feedbackItem.id),
        limit(10)
      )
    );
    await Promise.all(
      queueSnap.docs.map((d) =>
        updateDoc(d.ref, {
          ticketId,
          followUpSent: true,
          followUpMessage: text,
          followUpAt: serverTimestamp(),
        })
      )
    );
  } catch (_) { /* non-fatal */ }

  return { ticketId, messageId: msgRef.id };
}

/**
 * Create a new support ticket
 * @param {Object} ticketData - The ticket data
 * @returns {Promise<string>} - The ticket ID
 */
export async function createSupportTicket(ticketData) {
  try {
    const functions = getFunctions();
    const createTicket = httpsCallable(functions, 'createSupportTicket', { timeout: 30000 });
    
    const result = await createTicket(ticketData);
    
    if (result.data.success) {
      return result.data.ticketId;
    } else {
      throw new Error(result.data.message || 'Failed to create ticket');
    }
  } catch (error) {
    console.error('❌ Failed to create support ticket:', error);
    throw error;
  }
}

/**
 * Add a message to a support ticket
 * @param {Object} messageData - The message data
 * @returns {Promise<string>} - The message ID
 */
export async function addTicketMessage(messageData) {
  try {
    const functions = getFunctions();
    const addMessage = httpsCallable(functions, 'addTicketMessage');
    
    const result = await addMessage(messageData);
    
    if (result.data.success) {
      return result.data.messageId;
    } else {
      throw new Error(result.data.message || 'Failed to add message');
    }
  } catch (error) {
    console.error('❌ Failed to add ticket message:', error);
    throw error;
  }
}

/**
 * Get all tickets for a user
 * @param {string} userEmail - User's email
 * @returns {Promise<Array>} - Array of tickets
 */
export async function getUserTickets(userEmail) {
  try {
    const ticketsRef = collection(db, 'supportTickets');
    const q = query(
      ticketsRef,
      where('userEmail', '==', userEmail.toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    
    const tickets = [];
    querySnapshot.forEach((doc) => {
      tickets.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Sort in memory instead of requiring Firestore index
    tickets.sort((a, b) => {
      const aTime = a.lastMessageAt?.toDate?.() || a.lastMessageAt || new Date(0);
      const bTime = b.lastMessageAt?.toDate?.() || b.lastMessageAt || new Date(0);
      return bTime - aTime;
    });
    
    return tickets;
  } catch (error) {
    console.error('❌ Failed to get user tickets:', error);
    throw error;
  }
}

/**
 * Subscribe to a user's support tickets in real time (e.g. when admin closes a ticket, user sees it immediately)
 * @param {string} userEmail - User's email
 * @param {function(Array)} callback - Called with tickets array whenever data changes
 * @returns {function} - Unsubscribe function
 */
export function subscribeUserTickets(userEmail, callback) {
  const ticketsRef = collection(db, 'supportTickets');
  const q = query(
    ticketsRef,
    where('userEmail', '==', userEmail.toLowerCase())
  );
  return onSnapshot(q, (querySnapshot) => {
    const tickets = [];
    querySnapshot.forEach((docSnap) => {
      tickets.push({
        id: docSnap.id,
        ...docSnap.data()
      });
    });
    tickets.sort((a, b) => {
      const aTime = a.lastMessageAt?.toDate?.() || a.lastMessageAt || new Date(0);
      const bTime = b.lastMessageAt?.toDate?.() || b.lastMessageAt || new Date(0);
      return bTime - aTime;
    });
    callback(tickets);
  }, (err) => {
    console.error('❌ subscribeUserTickets error:', err);
  });
}

/**
 * Get a single ticket with messages
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<Object>} - The ticket with messages
 */
export async function getTicketWithMessages(ticketId) {
  try {
    const ticketRef = doc(db, 'supportTickets', ticketId);
    const ticketDoc = await getDoc(ticketRef);
    
    if (!ticketDoc.exists) {
      throw new Error('Ticket not found');
    }
    
    const ticket = {
      id: ticketDoc.id,
      ...ticketDoc.data()
    };
    
    // Get messages
    const messagesRef = collection(ticketRef, 'messages');
    const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));
    const messagesSnapshot = await getDocs(messagesQuery);
    
    ticket.messages = [];
    messagesSnapshot.forEach((msgDoc) => {
      ticket.messages.push({
        id: msgDoc.id,
        ...msgDoc.data()
      });
    });
    
    return ticket;
  } catch (error) {
    console.error('❌ Failed to get ticket with messages:', error);
    throw error;
  }
}

/**
 * Subscribe to ticket messages (real-time)
 * @param {string} ticketId - The ticket ID
 * @param {Function} callback - Callback function for updates
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToTicketMessages(ticketId, callback) {
  const ticketRef = doc(db, 'supportTickets', ticketId);
  const messagesRef = collection(ticketRef, 'messages');
  const messagesQuery = query(messagesRef, orderBy('createdAt', 'asc'));
  
  return onSnapshot(messagesQuery, (snapshot) => {
    const messages = [];
    snapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data()
      });
    });
    callback(messages);
  });
}

/**
 * Get all tickets for admin view
 * @returns {Promise<Array>} - Array of tickets
 */
/**
 * Restore Firestore Timestamp-like objects from callable response (serialized as plain objects)
 */
function restoreTicketTimestamps(ticket) {
  const ts = (obj) => {
    if (!obj || (obj.toDate && typeof obj.toDate === 'function')) return obj;
    const sec = obj.seconds ?? obj._seconds;
    if (typeof sec === 'number') {
      const nano = obj.nanoseconds ?? obj._nanoseconds ?? 0;
      return Timestamp.fromMillis(sec * 1000 + Math.floor(nano / 1e6));
    }
    return obj;
  };
  ['createdAt', 'updatedAt', 'lastMessageAt', 'closedAt'].forEach((k) => {
    if (ticket[k]) ticket[k] = ts(ticket[k]);
  });
  const uai = ticket.userAccountInfo;
  if (uai) {
    ['createdAt', 'lastLoginAt'].forEach((k) => {
      if (uai[k]) uai[k] = ts(uai[k]);
    });
  }
  return ticket;
}

export async function getAllTickets() {
  try {
    const functions = getFunctions();
    const getAllTicketsAdmin = httpsCallable(functions, 'getAllTicketsAdmin');
    const result = await getAllTicketsAdmin();
    const tickets = (result.data?.tickets || []).map(restoreTicketTimestamps);
    
    const ticketsNeedingEnrichment = tickets.filter(
      (t) => !t.userAccountInfo && t.userEmail
    );
    
    // Enrich tickets with user account info if missing
    for (const ticket of ticketsNeedingEnrichment) {
      try {
        const userAccount = await getUserByEmail(ticket.userEmail);
        if (userAccount) {
          const ticketIndex = tickets.findIndex((t) => t.id === ticket.id);
          if (ticketIndex !== -1) {
            tickets[ticketIndex].userAccountInfo = {
              userId: userAccount.id,
              email: userAccount.email,
              subscriptionStatus: userAccount.subscriptionStatus || 'none',
              subscriptionType: userAccount.subscriptionType || null,
              createdAt: userAccount.createdAt,
              lastLoginAt: userAccount.lastLoginAt || null,
              displayName: userAccount.displayName || null,
            };
          }
        }
      } catch (enrichError) {
        console.warn(`⚠️ Failed to enrich ticket ${ticket.id}:`, enrichError.message);
      }
    }
    
    return tickets;
  } catch (error) {
    console.error('❌ Failed to get all tickets:', error);
    console.error('❌ Error details:', {
      code: error.code,
      message: error.message
    });
    throw error;
  }
}

/**
 * Update ticket status (admin only)
 * @param {string} ticketId - The ticket ID
 * @param {string} status - New status
 * @param {Object} additionalData - Optional additional data
 * @returns {Promise<void>}
 */
export async function updateTicketStatus(ticketId, status, additionalData = {}) {
  try {
    const functions = getFunctions();
    const updateStatus = httpsCallable(functions, 'updateTicketStatus');

    // No password needed — cloud function verifies admin via Firebase Auth token
    const result = await updateStatus({
      ticketId,
      status,
      ...additionalData
    });
    
    if (!result.data.success) {
      throw new Error(result.data.message || 'Failed to update ticket status');
    }
  } catch (error) {
    console.error('❌ Failed to update ticket status:', error);
    throw error;
  }
}

/**
 * Close support ticket from work queue (Cloud Function; bypasses Firestore rules)
 * @param {string} ticketId - Support ticket ID
 * @param {string} logId - ai_worker_logs document ID
 * @param {string} adminNotes - Optional admin notes
 */
export async function closeSupportTicketFromWorkQueue(ticketId, logId, adminNotes) {
  const functions = getFunctions();
  const closeTicket = httpsCallable(functions, 'closeSupportTicketFromWorkQueue');
  // No password needed — cloud function verifies admin via Firebase Auth token
  const result = await closeTicket({ ticketId, logId, adminNotes });
  if (!result.data?.success) {
    throw new Error(result.data?.message || 'Failed to close ticket');
  }
  return result.data;
}

/**
 * Mark ticket as read by user
 * @param {string} ticketId - The ticket ID
 * @returns {Promise<void>}
 */
export async function markTicketAsRead(ticketId) {
  try {
    const functions = getFunctions();
    const markAsRead = httpsCallable(functions, 'markTicketAsRead');
    
    const result = await markAsRead({ ticketId });
    
    if (!result.data.success) {
      throw new Error(result.data.message || 'Failed to mark ticket as read');
    }
  } catch (error) {
    console.error('❌ Failed to mark ticket as read:', error);
    throw error;
  }
}

/**
 * Close a support ticket initiated by the user (direct Firestore write; mirrors message send pattern)
 * @param {string} ticketId - The ticket ID to close
 * @returns {Promise<void>}
 */
export async function closeTicketByUser(ticketId) {
  try {
    const { getFirestore, doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
    const db = getFirestore();
    const ticketRef = doc(db, 'supportTickets', ticketId);
    await updateDoc(ticketRef, {
      status: 'closed',
      closedAt: serverTimestamp(),
      closedBy: 'user',
    });
    console.log('🔒 Ticket closed by user:', ticketId);
  } catch (error) {
    console.error('❌ Failed to close ticket by user:', error);
    throw error;
  }
}

/**
 * Reopen a closed support ticket (user action)
 * @param {string} ticketId - The ticket ID to reopen
 * @returns {Promise<void>}
 */
export async function reopenTicket(ticketId) {
  try {
    const functions = getFunctions();
    const reopen = httpsCallable(functions, 'reopenTicket');
    
    const result = await reopen({ ticketId });
    
    if (!result.data.success) {
      throw new Error(result.data.message || 'Failed to reopen ticket');
    }
    
    console.log('🔓 Ticket reopened successfully:', ticketId);
    return result.data;
  } catch (error) {
    console.error('❌ Failed to reopen ticket:', error);
    throw error;
  }
}

// ============================================================================
// GENERAL CONTACT FORM (PRE-AUTH INQUIRIES)
// ============================================================================

/**
 * Submit a general contact form (for non-authenticated users)
 * @param {Object} contactData - The contact form data
 * @returns {Promise<Object>} - The result
 */
export async function submitContactForm(contactData) {
  try {
    const functions = getFunctions();
    const submitContact = httpsCallable(functions, 'submitContactForm');
    
    const result = await submitContact(contactData);
    
    if (result.data.success) {
      return result.data;
    } else {
      throw new Error(result.data.message || 'Failed to submit contact form');
    }
  } catch (error) {
    console.error('❌ Failed to submit contact form:', error);
    throw error;
  }
}

// ============================================================================
// ADMIN MESSAGES (ONE-WAY MESSAGES FROM ADMIN TO USERS)
// ============================================================================

/**
 * Get admin messages for a user
 * @param {string} userEmail - User's email
 * @returns {Promise<Array>} - Array of admin messages
 */
export async function getUserAdminMessages(userEmail) {
  try {
    const messagesRef = collection(db, 'adminMessages');
    
    // Try to query with orderBy, but fallback to simple query if index doesn't exist
    let querySnapshot;
    try {
      const q = query(
        messagesRef,
        where('userEmail', '==', userEmail.toLowerCase()),
        orderBy('createdAt', 'desc')
      );
      querySnapshot = await getDocs(q);
    } catch (orderByError) {
      // If orderBy fails (likely missing index), try without orderBy
      console.warn('⚠️ Admin messages orderBy query failed, trying without orderBy:', orderByError.message);
      const q = query(
        messagesRef,
        where('userEmail', '==', userEmail.toLowerCase())
      );
      querySnapshot = await getDocs(q);
    }
    
    const messages = [];
    // Optimize: Calculate once outside the loop
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const message = {
        id: doc.id,
        ...data
      };

      // Unified inbox: CRM replies go to SupportChatModal tickets.
      // From the Team chip keeps true one-way pushes + legacy untagged letters.
      const src = message.source || null;
      if (src && src !== 'one-way') return;
      
      // Check if message should be shown (unread or read within 24 hours)
      if (!message.userReadAt || message.userReadAt === null) {
        // Unread - always show
        messages.push(message);
      } else {
        // Check if read within last 24 hours (optimized timestamp comparison)
        const readAt = message.userReadAt?.toMillis 
          ? message.userReadAt.toMillis() 
          : (message.userReadAt?.toDate ? message.userReadAt.toDate().getTime() : new Date(message.userReadAt).getTime());
        
        if (readAt >= twentyFourHoursAgo) {
          messages.push(message);
        }
      }
    });
    
    // Sort manually if we couldn't use orderBy (most recent first)
    // Optimize: Only sort if needed and use efficient timestamp comparison
    if (messages.length > 0) {
      messages.sort((a, b) => {
        const aTime = a.createdAt?.toMillis ?? 
                     (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
        const bTime = b.createdAt?.toMillis ?? 
                     (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
        return bTime - aTime; // Descending order (most recent first)
      });
    }
    return messages;
  } catch (error) {
    console.error('❌ Failed to get admin messages:', error);
    console.error('❌ Error details:', {
      code: error.code,
      message: error.message
    });
    throw error;
  }
}

/**
 * Admin inbox: all "From the Team" pushes for a user (no unread/24h filter).
 * Sorted oldest → newest for conversation display.
 * @param {string} userEmail
 * @returns {Promise<Array>}
 */
export async function getAdminMessagesHistoryForEmail(userEmail) {
  if (!userEmail?.trim()) return [];
  const email = userEmail.toLowerCase().trim();
  const messagesRef = collection(db, 'adminMessages');
  let querySnapshot;
  try {
    const q = query(
      messagesRef,
      where('userEmail', '==', email),
      orderBy('createdAt', 'asc')
    );
    querySnapshot = await getDocs(q);
  } catch (orderByError) {
    console.warn('⚠️ Admin message history orderBy failed, falling back:', orderByError.message);
    const q = query(messagesRef, where('userEmail', '==', email));
    querySnapshot = await getDocs(q);
  }

  const messages = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  messages.sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.()
      ?? (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt?.seconds ?? a.createdAt?._seconds ?? 0) * 1000);
    const bTime = b.createdAt?.toMillis?.()
      ?? (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt?.seconds ?? b.createdAt?._seconds ?? 0) * 1000);
    return aTime - bTime;
  });
  return messages;
}

/**
 * Mark admin message as read
 * @param {string} messageId - The message ID
 * @returns {Promise<void>}
 */
export async function markAdminMessageAsRead(messageId) {
  try {
    const messageRef = doc(db, 'adminMessages', messageId);
    await updateDoc(messageRef, {
      userReadAt: serverTimestamp()
    });
  } catch (error) {
    console.error('❌ Failed to mark admin message as read:', error);
    throw error;
  }
}

/**
 * Delete an admin message (admin only)
 * @param {string} messageId - The message ID
 * @returns {Promise<void>}
 */
export async function deleteAdminMessage(messageId) {
  try {
    console.log('🗑️ Attempting to delete admin message:', messageId);
    const messageRef = doc(db, 'adminMessages', messageId);
    
    // First check if document exists
    const messageDoc = await getDoc(messageRef);
    if (!messageDoc.exists()) {
      console.warn('⚠️ Message does not exist:', messageId);
      return; // Already deleted
    }
    
    console.log('🗑️ Message exists, deleting:', messageId);
    await deleteDoc(messageRef);
    console.log('✅ Admin message deleted successfully:', messageId);
    
    // Verify deletion
    const verifyDoc = await getDoc(messageRef);
    if (verifyDoc.exists()) {
      console.error('❌ Message still exists after deletion!');
      throw new Error('Message was not deleted');
    } else {
      console.log('✅ Deletion verified - message no longer exists');
    }
  } catch (error) {
    console.error('❌ Failed to delete admin message:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    throw error;
  }
}

/**
 * Get all admin messages (admin only)
 * @returns {Promise<Array>} - Array of all admin messages
 */
export async function getAllAdminMessages() {
  try {
    const messagesRef = collection(db, 'adminMessages');
    const q = query(messagesRef, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    
    const messages = [];
    querySnapshot.forEach((doc) => {
      messages.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return messages;
  } catch (error) {
    console.error('❌ Failed to get all admin messages:', error);
    throw error;
  }
}

/**
 * Delete all admin messages for a specific user (admin only)
 * @param {string} userEmail - User's email
 * @returns {Promise<number>} - Number of messages deleted
 */
export async function deleteAllAdminMessagesForUser(userEmail) {
  try {
    const messagesRef = collection(db, 'adminMessages');
    const q = query(messagesRef, where('userEmail', '==', userEmail.toLowerCase()));
    const querySnapshot = await getDocs(q);
    
    let deletedCount = 0;
    for (const docSnapshot of querySnapshot.docs) {
      try {
        await deleteDoc(doc(db, 'adminMessages', docSnapshot.id));
        deletedCount++;
        console.log('✅ Deleted message:', docSnapshot.id);
      } catch (error) {
        console.error('❌ Failed to delete message', docSnapshot.id, ':', error);
      }
    }
    
    console.log(`✅ Deleted ${deletedCount} message(s) for ${userEmail}`);
    return deletedCount;
  } catch (error) {
    console.error('❌ Failed to delete messages for user:', error);
    throw error;
  }
}

/**
 * Create an admin message (admin only, via cloud function)
 * @param {string} userEmail - User's email
 * @param {string} message - Message content
 * @returns {Promise<string>} - The message ID
 */
export async function createAdminMessage(userEmail, message, options = {}) {
  try {
    const functions = getFunctions();
    const createMessage = httpsCallable(functions, 'createAdminMessage');
    
    console.log('📨 Calling createAdminMessage function...');
    const result = await createMessage({
      userEmail: userEmail.toLowerCase(),
      message: message.trim(),
      source: options.source || 'one-way',
    });
    
    console.log('📨 Function response:', result);
    
    if (!result.data || !result.data.success) {
      throw new Error(result.data?.message || 'Failed to create admin message');
    }
    
    return result.data.messageId;
  } catch (error) {
    console.error('❌ Failed to create admin message:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    console.error('❌ Full error:', error);
    
    // Provide helpful error message
    if (error.code === 'functions/not-found' || error.code === 'functions/internal') {
      const helpfulError = new Error('Admin message function not deployed. Please deploy Firebase functions first.');
      helpfulError.code = error.code;
      throw helpfulError;
    }
    
    if (error.code === 'functions/unavailable') {
      const helpfulError = new Error('Firebase functions are unavailable. Please check your connection and try again.');
      helpfulError.code = error.code;
      throw helpfulError;
    }
    
    // Handle CORS or MIME type errors
    if (error.message && error.message.includes('MIME type') || error.message && error.message.includes('CORS')) {
      const helpfulError = new Error('Function deployment issue. Please redeploy: firebase deploy --only functions:createAdminMessage');
      helpfulError.code = 'functions/deployment-error';
      throw helpfulError;
    }
    
    throw error;
  }
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

/**
 * Get notifications for a user
 * @param {string} userEmail - User's email
 * @returns {Promise<Array>} - Array of notifications
 */
export async function getUserNotifications(userEmail) {
  try {
    // console.log('🔔 Firebase: Getting notifications for email:', userEmail.toLowerCase());
    // Temporarily remove orderBy to avoid index requirement
    const q = query(
      collection(db, 'notifications'),
      where('userEmail', '==', userEmail.toLowerCase()),
      limit(50)
    );
    const querySnapshot = await getDocs(q);
    const notifications = [];
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      const readAt = data.readAt?.toDate ? data.readAt.toDate() : null;
      
      // Auto-delete notifications that have been read and are older than 24 hours
      if (data.isRead && readAt && readAt < twentyFourHoursAgo) {
        console.log('🔔 Auto-deleting old read notification:', doc.id);
        deleteDoc(doc.ref).catch(error => 
          console.error('Failed to delete old notification:', error)
        );
        return; // Skip adding to notifications array
      }
      
      notifications.push({
        id: doc.id,
        ...data
      });
    });
    
    // Sort notifications by createdAt (newest first) on the client side
    notifications.sort((a, b) => {
      const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return bTime - aTime; // Descending order (newest first)
    });
    
    // console.log('🔔 Firebase: Found', notifications.length, 'notifications:', notifications);
    return notifications;
  } catch (error) {
    console.error('❌ Failed to get user notifications:', error);
    return [];
  }
}

/**
 * Mark notification as read
 * @param {string} notificationId - The notification document ID
 * @returns {Promise<void>}
 */
export async function markNotificationAsRead(notificationId) {
  try {
    const notificationRef = doc(db, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      isRead: true,
      readAt: serverTimestamp()
    });
  } catch (error) {
    console.error('❌ Failed to mark notification as read:', error);
    throw error;
  }
}

// ============================================================================
// LIFETIME ACCESS MANAGEMENT
// ============================================================================

/**
 * Grant lifetime access to a user in Firestore
 * @param {string} userId - User ID (UID from Firebase Auth)
 * @param {string} email - User email
 * @param {string} reason - Reason for granting access
 * @param {string} grantedBy - Admin who granted access
 * @returns {Promise<boolean>}
 */
export async function grantLifetimeAccessFirestore(userId, email, reason = 'Beta tester', grantedBy = 'system') {
  try {
    console.log('🎁 Granting lifetime access to:', email, userId);
    
    const lifetimeRef = doc(db, 'lifetimeAccess', userId);
    await setDoc(lifetimeRef, {
      userId,
      email: email.toLowerCase(),
      hasLifetimeAccess: true,
      reason,
      grantedBy,
      grantedAt: serverTimestamp(),
      status: 'active',
      metadata: {
        isBetaTester: reason.toLowerCase().includes('beta'),
        isFounder: reason.toLowerCase().includes('founder'),
        isManualGrant: grantedBy !== 'system'
      }
    }, { merge: true });
    
    // Also update user document
    const userRef = doc(db, 'users', userId);
    const grantedAt = serverTimestamp();
    await setDoc(userRef, {
      subscription: {
        hasLifetimeAccess: true,
        lifetimeReason: reason,
        lifetimeGrantedAt: grantedAt,
        plan: 'lifetime',
        status: 'active'
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    // CRITICAL: Also write to userSubscriptions collection (where app reads from)
    const subscriptionRef = doc(db, 'userSubscriptions', userId);
    await setDoc(subscriptionRef, {
      subscription: {
        hasLifetimeAccess: true,
        interval: 'lifetime',
        status: 'active',
        plan: 'lifetime',
        lifetimeReason: reason,
        lifetimeGrantedAt: grantedAt,
        currentPeriodEnd: null, // Lifetime has no end date
        currentPeriodStart: grantedAt,
        userId: userId,
        lastUpdated: serverTimestamp()
      }
    }, { merge: true });
    
    return true;
  } catch (error) {
    console.error('❌ Failed to grant lifetime access:', error);
    throw error;
  }
}

/**
 * Check if user has lifetime access in Firestore
 * @param {string} userId - User ID
 * @returns {Promise<Object|null>}
 */
export async function checkLifetimeAccessFirestore(userId) {
  try {
    const lifetimeRef = doc(db, 'lifetimeAccess', userId);
    const lifetimeDoc = await getDoc(lifetimeRef);
    
    if (lifetimeDoc.exists() && lifetimeDoc.data().hasLifetimeAccess) {
      return {
        hasAccess: true,
        ...lifetimeDoc.data()
      };
    }
    
    // Fallback: Check user document subscription field
    const userRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists() && userDoc.data().subscription?.hasLifetimeAccess) {
      return {
        hasAccess: true,
        reason: userDoc.data().subscription.lifetimeReason || 'Unknown',
        grantedAt: userDoc.data().subscription.lifetimeGrantedAt
      };
    }
    
    return null;
  } catch (error) {
    console.error('❌ Failed to check lifetime access:', error);
    return null;
  }
}

/**
 * Get all users with lifetime access
 * @returns {Promise<Array>}
 */
export async function getAllLifetimeUsers() {
  try {
    const users = [];

    // Active lifetime access documents (users who already exist)
    const lifetimeRef = collection(db, 'lifetimeAccess');
    const lifetimeQuery = query(lifetimeRef, where('hasLifetimeAccess', '==', true));
    
    const lifetimeSnapshot = await getDocs(lifetimeQuery);

    lifetimeSnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data() || {};
      users.push({
        id: docSnapshot.id,
        userId: docSnapshot.id,
        email: data.email || '',
        reason: data.reason || '',
        grantedAt: data.grantedAt || data.lifetimeGrantedAt || null,
        grantedBy: data.grantedBy || 'admin',
        status: data.status || 'active',
        hasLifetimeAccess: data.hasLifetimeAccess ?? true,
        activatedAt: data.activatedAt || data.appliedAt || null,
        isPreGrant: false,
        source: 'lifetimeAccess'
      });
    });

    // Pre-grants for emails (both pending and applied)
    const preGrantRef = collection(db, 'lifetimeAccessPreGrants');
    
    // Get ALL pre-grants (not just pending) so we can see activated ones too
    const preGrantSnapshot = await getDocs(preGrantRef);

    preGrantSnapshot.forEach(docSnapshot => {
      const data = docSnapshot.data() || {};
      const email = data.email || docSnapshot.id || '';
      const status = data.status || 'pending';
      
      // ⚠️ SECURITY CHECK: Flag suspicious wildcard emails
      if (email.includes('*') || email === '' || email.length < 3) {
        console.warn('🚨 SUSPICIOUS PRE-GRANT DETECTED:', {
          docId: docSnapshot.id,
          email,
          status,
          reason: data.reason
        });
      }
      
      users.push({
        id: `pregrant-${docSnapshot.id}`,
        preGrantId: docSnapshot.id,
        email: email.toLowerCase(),
        reason: data.reason || '',
        grantedAt: data.grantedAt || null,
        grantedBy: data.grantedBy || 'admin',
        status: status,
        hasLifetimeAccess: data.hasLifetimeAccess ?? true,
        activatedAt: data.appliedAt || null,
        appliedToUserId: data.appliedToUserId || null,
        isPreGrant: true,
        source: 'preGrant'
      });
    });

    // Sort by grant date (newest first)
    const getTimestampValue = (value) => {
      if (!value) return 0;
      if (typeof value.toMillis === 'function') return value.toMillis();
      if (typeof value.seconds === 'number') return value.seconds * 1000;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    };

    users.sort((a, b) => getTimestampValue(b.grantedAt) - getTimestampValue(a.grantedAt));

    return users;
  } catch (error) {
    console.error('❌ Failed to get lifetime users:', error);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error message:', error.message);
    console.error('❌ Current user:', auth.currentUser?.email || 'NOT LOGGED IN');
    
    // If permission denied, show helpful message
    if (error.code === 'permission-denied') {
      console.error('🚫 PERMISSION DENIED: You must be logged into Firebase with an admin email!');
      console.error('🚫 Admin emails: lebrockmaldonado@gmail.com, contact@thepepplanner.com');
      console.error('🚫 Current user:', auth.currentUser?.email || 'NOT LOGGED IN');
    }
    
    return [];
  }
}

/**
 * Revoke lifetime access
 * @param {string} userId - User ID
 * @param {string} revokedBy - Admin who revoked access
 * @param {string} reason - Reason for revocation
 * @returns {Promise<boolean>}
 */
export async function revokeLifetimeAccess(userId, revokedBy = 'admin', reason = 'Manual revocation') {
  try {
    const lifetimeRef = doc(db, 'lifetimeAccess', userId);
    await updateDoc(lifetimeRef, {
      hasLifetimeAccess: false,
      status: 'revoked',
      revokedAt: serverTimestamp(),
      revokedBy,
      revocationReason: reason
    });
    
    // Update user document
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'subscription.hasLifetimeAccess': false,
      'subscription.status': 'revoked',
      updatedAt: serverTimestamp()
    });
    
    console.log('🚫 Lifetime access revoked for:', userId);
    return true;
  } catch (error) {
    console.error('❌ Failed to revoke lifetime access:', error);
    throw error;
  }
}

/**
 * Bulk import lifetime users from localStorage data
 * @param {Array} lifetimeUsers - Array of {email, uid, reason}
 * @returns {Promise<{success: number, failed: number}>}
 */
export async function bulkImportLifetimeUsers(lifetimeUsers) {
  let success = 0;
  let failed = 0;
  
  for (const user of lifetimeUsers) {
    try {
      await grantLifetimeAccessFirestore(
        user.uid || user.userId,
        user.email,
        user.reason || 'Beta tester - migrated from localStorage',
        'migration-script'
      );
      success++;
    } catch (error) {
      console.error('Failed to import user:', user.email, error);
      failed++;
    }
  }
  
  return { success, failed };
}

export async function cancelLifetimePreGrant(email) {
  try {
    if (!email) {
      throw new Error('Email is required to cancel pre-grant');
    }

    const normalizedEmail = email.toLowerCase().trim();
    const preGrantDocRef = doc(db, 'lifetimeAccessPreGrants', normalizedEmail);
    await deleteDoc(preGrantDocRef);
    console.log('🗑️ Cancelled lifetime pre-grant for:', normalizedEmail);
    return true;
  } catch (error) {
    console.error('❌ Failed to cancel lifetime pre-grant:', error);
    throw error;
  }
}

// ============================================================================
// LIFETIME CODES (Physical Kit Redemption)
// ============================================================================

/**
 * Generate a random 6-character alphanumeric code
 * @returns {string} - 6-character code
 */
function generateLifetimeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars: I, O, 1, 0
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create lifetime codes for physical kits
 * @param {number} count - Number of codes to generate
 * @param {string} batchName - Optional batch name for tracking
 * @returns {Promise<Array>} - Array of generated codes
 */
export async function createLifetimeCodes(count, batchName = '') {
  try {
    const existingCodes = await getLifetimeCodes();
    const existingCodeSet = new Set(existingCodes.map(c => c.code));
    const createdCodes = [];
    const batchId = `BATCH-${Date.now()}`;
    
    for (let i = 0; i < count; i++) {
      // Generate unique code
      let code = generateLifetimeCode();
      let attempts = 0;
      while (existingCodeSet.has(code) && attempts < 100) {
        code = generateLifetimeCode();
        attempts++;
      }
      
      if (attempts >= 100) {
        throw new Error('Failed to generate unique code after 100 attempts');
      }
      
      // Create code document in Firestore
      const codeData = {
        code,
        used: false,
        usedBy: null,
        usedByUid: null,
        usedAt: null,
        batchId,
        batchName: batchName || `Batch ${new Date().toLocaleDateString()}`,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.email || 'admin',
        expiresAt: null // No expiration by default
      };
      
      await setDoc(doc(db, 'lifetimeCodes', code), codeData);
      existingCodeSet.add(code);
      createdCodes.push({ ...codeData, code });
    }
    
    console.log(`✅ Created ${createdCodes.length} lifetime codes in batch ${batchId}`);
    return createdCodes;
  } catch (error) {
    console.error('❌ Failed to create lifetime codes:', error);
    throw error;
  }
}

/**
 * Get all lifetime codes
 * @returns {Promise<Array>} - Array of code objects
 */
export async function getLifetimeCodes() {
  try {
    const codesRef = collection(db, 'lifetimeCodes');
    const codesSnapshot = await getDocs(codesRef);
    
    const codes = [];
    codesSnapshot.forEach(doc => {
      codes.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Sort by creation date (newest first)
    codes.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
      const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
      return bTime - aTime;
    });
    
    return codes;
  } catch (error) {
    console.error('❌ Failed to get lifetime codes:', error);
    return [];
  }
}

/**
 * Delete a lifetime code (only unused codes)
 * @param {string} code - Code to delete
 * @returns {Promise<boolean>}
 */
export async function deleteLifetimeCode(code) {
  try {
    const codeRef = doc(db, 'lifetimeCodes', code);
    const codeDoc = await getDoc(codeRef);
    
    if (!codeDoc.exists()) {
      throw new Error('Code not found');
    }
    
    if (codeDoc.data().used) {
      throw new Error('Cannot delete a code that has been redeemed');
    }
    
    await deleteDoc(codeRef);
    console.log('🗑️ Deleted lifetime code:', code);
    return true;
  } catch (error) {
    console.error('❌ Failed to delete lifetime code:', error);
    throw error;
  }
}

/**
 * Delete all unused codes in a batch
 * @param {string} batchId - Batch ID to delete
 * @returns {Promise<{deleted: number, skipped: number}>}
 */
export async function deleteLifetimeCodeBatch(batchId) {
  try {
    const codesRef = collection(db, 'lifetimeCodes');
    const q = query(codesRef, where('batchId', '==', batchId));
    const snapshot = await getDocs(q);
    
    let deleted = 0;
    let skipped = 0;
    
    for (const docSnap of snapshot.docs) {
      if (!docSnap.data().used) {
        await deleteDoc(docSnap.ref);
        deleted++;
      } else {
        skipped++;
      }
    }
    
    console.log(`🗑️ Deleted ${deleted} codes from batch, skipped ${skipped} used codes`);
    return { deleted, skipped };
  } catch (error) {
    console.error('❌ Failed to delete batch:', error);
    throw error;
  }
}

// ============================================================================
// ANNUAL CODES (Physical Kit Redemption - 1 Year Access)
// ============================================================================

/**
 * Generate a random 6-character alphanumeric code for annual subscription
 * @returns {string} - 6-character code
 */
function generateAnnualCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create new annual subscription codes
 * @param {number} count - Number of codes to generate
 * @param {string} batchName - Optional name for the batch
 * @returns {Promise<Array>} - Array of created codes
 */
export async function createAnnualCodes(count, batchName = '') {
  try {
    const existingCodes = await getAnnualCodes();
    const existingCodeSet = new Set(existingCodes.map(c => c.code));
    const createdCodes = [];
    const batchId = `ANNUAL-${Date.now()}`;
    
    for (let i = 0; i < count; i++) {
      // Generate unique code
      let code = generateAnnualCode();
      let attempts = 0;
      while (existingCodeSet.has(code) && attempts < 100) {
        code = generateAnnualCode();
        attempts++;
      }
      
      if (attempts >= 100) {
        throw new Error('Failed to generate unique code after 100 attempts');
      }
      
      // Create code document in Firestore
      const codeData = {
        code,
        used: false,
        usedBy: null,
        usedByUid: null,
        usedAt: null,
        batchId,
        batchName: batchName || `Annual Batch ${new Date().toLocaleDateString()}`,
        createdAt: serverTimestamp(),
        createdBy: auth.currentUser?.email || 'admin',
        type: 'annual',
        durationYears: 1 // 1 year subscription
      };
      
      const codeRef = doc(db, 'annualCodes', code);
      await setDoc(codeRef, codeData);
      
      existingCodeSet.add(code);
      createdCodes.push({ ...codeData, code });
    }
    
    console.log(`✅ Created ${createdCodes.length} annual codes in batch ${batchId}`);
    return createdCodes;
  } catch (error) {
    console.error('❌ Failed to create annual codes:', error);
    throw error;
  }
}

/**
 * Get all annual codes
 * @returns {Promise<Array>}
 */
export async function getAnnualCodes() {
  try {
    const codesRef = collection(db, 'annualCodes');
    const codesSnapshot = await getDocs(codesRef);
    
    const codes = [];
    codesSnapshot.forEach(doc => {
      codes.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Sort by creation date (newest first)
    codes.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || 0;
      const bTime = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || 0;
      return bTime - aTime;
    });
    
    return codes;
  } catch (error) {
    console.error('❌ Failed to get annual codes:', error);
    return [];
  }
}

/**
 * Delete an annual code (only unused codes)
 * @param {string} code - Code to delete
 * @returns {Promise<boolean>}
 */
export async function deleteAnnualCode(code) {
  try {
    const codeRef = doc(db, 'annualCodes', code);
    const codeDoc = await getDoc(codeRef);
    
    if (!codeDoc.exists()) {
      throw new Error('Code not found');
    }
    
    if (codeDoc.data().used) {
      throw new Error('Cannot delete a code that has been redeemed');
    }
    
    await deleteDoc(codeRef);
    console.log('🗑️ Deleted annual code:', code);
    return true;
  } catch (error) {
    console.error('❌ Failed to delete annual code:', error);
    throw error;
  }
}

/**
 * Delete all unused annual codes in a batch
 * @param {string} batchId - Batch ID to delete
 * @returns {Promise<{deleted: number, skipped: number}>}
 */
export async function deleteAnnualCodeBatch(batchId) {
  try {
    const codesRef = collection(db, 'annualCodes');
    const q = query(codesRef, where('batchId', '==', batchId));
    const snapshot = await getDocs(q);
    
    let deleted = 0;
    let skipped = 0;
    
    for (const docSnap of snapshot.docs) {
      if (!docSnap.data().used) {
        await deleteDoc(docSnap.ref);
        deleted++;
      } else {
        skipped++;
      }
    }
    
    console.log(`🗑️ Deleted ${deleted} annual codes from batch, skipped ${skipped} used codes`);
    return { deleted, skipped };
  } catch (error) {
    console.error('❌ Failed to delete annual batch:', error);
    throw error;
  }
}

/**
 * Grant annual subscription access via Firestore
 * @param {string} userId - User ID
 * @param {string} email - User email
 * @param {string} reason - Reason for grant
 * @param {string} grantedBy - Who granted access
 * @returns {Promise<object>} - Subscription details with expiration
 */
export async function grantAnnualAccessFirestore(userId, email, reason = 'Annual Kit Redemption', grantedBy = 'annual-kit') {
  try {
    console.log('📅 Granting annual access to:', email, userId);
    
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    
    // Update user document
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      subscription: {
        plan: 'annual',
        interval: 'year',
        status: 'active',
        source: grantedBy,
        reason,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: expiresAt.toISOString(),
        redeemedAt: now.toISOString()
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    // Write to userSubscriptions collection (where app reads from)
    const subscriptionRef = doc(db, 'userSubscriptions', userId);
    await setDoc(subscriptionRef, {
      subscription: {
        id: `annual_kit_${Date.now()}`,
        plan: 'annual',
        interval: 'year',
        status: 'active',
        source: grantedBy,
        currentPeriodStart: now.toISOString(),
        currentPeriodEnd: expiresAt.toISOString(),
        redeemedAt: now.toISOString()
      },
      userId,
      updatedAt: serverTimestamp()
    }, { merge: true });
    
    console.log(`✅ Annual access granted until ${expiresAt.toLocaleDateString()}`);
    
    return {
      plan: 'annual',
      interval: 'year',
      status: 'active',
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: expiresAt.toISOString()
    };
  } catch (error) {
    console.error('❌ Failed to grant annual access:', error);
    throw error;
  }
}
