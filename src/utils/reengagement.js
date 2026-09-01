/**
 * Re-engagement / welcome-back helpers.
 * Detects 30+ day inactivity gaps and coordinates the WelcomeBackFlow prompt.
 */

export const REENGAGEMENT_THRESHOLD_DAYS = 30;

/** @type {Map<string, { previousLastActiveDate: string|null, daysSinceLastActive: number|null, uid: string }>} */
const pendingByUid = new Map();

/** @type {Set<(result: { previousLastActiveDate: string|null, daysSinceLastActive: number|null, uid: string }) => void>} */
const listeners = new Set();

/**
 * Publish a login gap result so App.jsx can react regardless of which auth path fired.
 * @param {string} uid
 * @param {{ previousLastActiveDate?: string|null, daysSinceLastActive?: number|null }|null|undefined} gap
 */
export function setPendingGapResult(uid, gap) {
  if (!uid || !gap) return;
  const result = {
    uid,
    previousLastActiveDate: gap.previousLastActiveDate ?? null,
    daysSinceLastActive:
      typeof gap.daysSinceLastActive === 'number' ? gap.daysSinceLastActive : null,
  };
  pendingByUid.set(uid, result);
  listeners.forEach((cb) => {
    try {
      cb(result);
    } catch (_) {}
  });
}

/**
 * @param {string} uid
 * @returns {{ previousLastActiveDate: string|null, daysSinceLastActive: number|null, uid: string }|null}
 */
export function getPendingGapResult(uid) {
  if (!uid) return null;
  return pendingByUid.get(uid) || null;
}

/**
 * Subscribe to gap results. Immediately receives any already-pending result for optional uid.
 * @param {(result: { previousLastActiveDate: string|null, daysSinceLastActive: number|null, uid: string }) => void} cb
 * @param {string} [uid] - if provided, replay pending result for this uid on subscribe
 * @returns {() => void} unsubscribe
 */
export function subscribeToGapResult(cb, uid) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  if (uid) {
    const pending = pendingByUid.get(uid);
    if (pending) {
      try {
        cb(pending);
      } catch (_) {}
    }
  }
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Whether the Welcome Back flow should open for this gap + persisted userState.reengagement.
 * @param {{ previousLastActiveDate?: string|null, daysSinceLastActive?: number|null }|null} gapResult
 * @param {{ lastGapDate?: string, status?: string }|null|undefined} reengagementState
 * @returns {boolean}
 */
export function shouldShowWelcomeBack(gapResult, reengagementState) {
  if (!gapResult) return false;
  const days = gapResult.daysSinceLastActive;
  if (typeof days !== 'number' || days < REENGAGEMENT_THRESHOLD_DAYS) return false;
  const gapDate = gapResult.previousLastActiveDate;
  if (!gapDate) return false;

  const state = reengagementState || null;
  if (
    state &&
    state.lastGapDate === gapDate &&
    (state.status === 'completed' || state.status === 'declined')
  ) {
    return false;
  }
  return true;
}

/**
 * Build a userState.reengagement patch object.
 * @param {'pending'|'completed'|'declined'} status
 * @param {string} lastGapDate
 * @returns {object}
 */
export function buildReengagementState(status, lastGapDate) {
  const now = new Date().toISOString();
  return {
    lastGapDate: lastGapDate || null,
    status,
    promptedAt: now,
    completedAt: status === 'completed' ? now : null,
  };
}
