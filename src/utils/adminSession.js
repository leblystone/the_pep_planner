/**
 * Admin panel MFA session helpers.
 * Password login + existing account authenticator; MFA re-check every 3 days.
 */

export const ADMIN_PANEL_EMAILS = ['lebrockmaldonado@gmail.com'];

const MFA_AT_KEY = 'tpp_admin_mfa_verified_at';
const MFA_UID_KEY = 'tpp_admin_mfa_uid';
/** 3 days */
export const ADMIN_MFA_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export function isAdminPanelEmail(email) {
  if (!email) return false;
  return ADMIN_PANEL_EMAILS.includes(String(email).trim().toLowerCase());
}

export function getAdminMfaVerifiedAt() {
  try {
    const raw = localStorage.getItem(MFA_AT_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function getAdminMfaUid() {
  try {
    return localStorage.getItem(MFA_UID_KEY) || null;
  } catch {
    return null;
  }
}

export function isAdminMfaFresh(uid) {
  const at = getAdminMfaVerifiedAt();
  if (!at) return false;
  if (Date.now() - at > ADMIN_MFA_TTL_MS) return false;
  if (uid) {
    const storedUid = getAdminMfaUid();
    if (storedUid && storedUid !== uid) return false;
  }
  return true;
}

export function markAdminMfaVerified(uid) {
  try {
    localStorage.setItem(MFA_AT_KEY, String(Date.now()));
    if (uid) localStorage.setItem(MFA_UID_KEY, uid);
    localStorage.setItem('tpp_admin_auth', 'true');
  } catch {
    /* ignore */
  }
}

export function clearAdminMfaSession() {
  try {
    localStorage.removeItem(MFA_AT_KEY);
    localStorage.removeItem(MFA_UID_KEY);
    localStorage.removeItem('tpp_admin_auth');
  } catch {
    /* ignore */
  }
}

export function adminMfaDaysRemaining() {
  const at = getAdminMfaVerifiedAt();
  if (!at) return 0;
  const left = ADMIN_MFA_TTL_MS - (Date.now() - at);
  if (left <= 0) return 0;
  return Math.ceil(left / (24 * 60 * 60 * 1000));
}
