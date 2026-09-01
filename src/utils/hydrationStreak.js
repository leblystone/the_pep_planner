/**
 * Hydration goal streak: consecutive calendar days the user met their daily intake goal.
 * Stored in localStorage (tpprover_hydration_streak_v1), independent of water tracker shape.
 */

import { getLocalDateString } from './date';

export const HYDRATION_STREAK_STORAGE_KEY = 'tpprover_hydration_streak_v1';

function formatDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysToKey(dateKey, deltaDays) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  return formatDateKey(dt);
}

function normalizeState(state) {
  const src = state && typeof state === 'object' ? state : {};
  const streak = typeof src.streak === 'number' && src.streak >= 0 ? src.streak : 0;
  const lastCountedDate = typeof src.lastCountedDate === 'string' ? src.lastCountedDate : null;
  const updatedAt = src.updatedAt || null;
  return updatedAt ? { streak, lastCountedDate, updatedAt } : { streak, lastCountedDate };
}

function getStateTimestamp(state) {
  if (!state || typeof state !== 'object') return 0;
  if (typeof state.updatedAt === 'number') return state.updatedAt;
  if (typeof state.updatedAt === 'string') {
    const n = new Date(state.updatedAt).getTime();
    if (!Number.isNaN(n)) return n;
  }
  if (typeof state.lastCountedDate === 'string') {
    const n = new Date(`${state.lastCountedDate}T00:00:00`).getTime();
    if (!Number.isNaN(n)) return n;
  }
  return 0;
}

/**
 * A streak stays alive only if the last goal-met day was today or yesterday.
 * Anything older means at least one full day was missed → streak is broken.
 */
export function reconcileHydrationStreakState(state, todayKey = getLocalDateString()) {
  const s = normalizeState(state);
  if (s.streak <= 0) {
    return s.lastCountedDate
      ? { streak: 0, lastCountedDate: null, updatedAt: s.updatedAt || new Date().toISOString() }
      : s;
  }
  if (!s.lastCountedDate) {
    return { streak: 0, lastCountedDate: null, updatedAt: s.updatedAt || new Date().toISOString() };
  }

  const yesterday = addDaysToKey(todayKey, -1);
  if (s.lastCountedDate === todayKey || s.lastCountedDate === yesterday) {
    return s;
  }

  return {
    streak: 0,
    lastCountedDate: null,
    updatedAt: new Date().toISOString(),
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(HYDRATION_STREAK_STORAGE_KEY);
    if (!raw) return { streak: 0, lastCountedDate: null };
    return normalizeState(JSON.parse(raw));
  } catch {
    return { streak: 0, lastCountedDate: null };
  }
}

/** Load + expire stale streaks. Optionally persist the broken state so UI/cloud stay honest. */
function loadReconciledState({ persist = true } = {}) {
  const loaded = loadState();
  const reconciled = reconcileHydrationStreakState(loaded);
  const changed =
    reconciled.streak !== loaded.streak ||
    reconciled.lastCountedDate !== loaded.lastCountedDate;
  if (persist && changed) {
    saveState(reconciled, { dispatch: true, source: 'reconcile' });
  }
  return reconciled;
}

// Cloud sync happens through AppContext's guarded, queued auto-sync, triggered
// by the 'tpp:hydration-streak-updated' event — never write directly to
// Firestore here (a direct read-modify-write would bypass the isInitialLoad
// guard and can race with the main auto-sync).
function saveState(state, { dispatch = false, source } = {}) {
  try {
    localStorage.setItem(HYDRATION_STREAK_STORAGE_KEY, JSON.stringify(state));
    localStorage.setItem('tpprover_hydration_streak_lastUpdate', String(Date.now()));

    if (dispatch && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tpp:hydration-streak-updated', { detail: { streak: state.streak, source } }));
    }
  } catch {
    /* ignore quota */
  }
}

/** Normalized intake for a day (dashboard uses `amount`, legacy widget uses `glasses`). */
export function getWaterDayAmount(day) {
  if (!day || typeof day !== 'object') return 0;
  const a = day.amount ?? day.glasses;
  const n = Number(a);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function getWaterDayGoal(day, fallbackGoal) {
  const g = Number(day?.goal);
  if (Number.isFinite(g) && g > 0) return g;
  const fb = Number(fallbackGoal);
  return Number.isFinite(fb) && fb > 0 ? fb : 64;
}

/** Count calendar days in the tracker where intake met or exceeded goal. */
export function countHydrationGoalDays(waterData) {
  let n = 0;
  for (const [, v] of Object.entries(waterData || {})) {
    if (!v || typeof v !== 'object') continue;
    const a = getWaterDayAmount(v);
    const g = getWaterDayGoal(v, 0);
    if (g > 0 && a >= g) n++;
  }
  return n;
}

export function getHydrationStreak() {
  return loadReconciledState().streak;
}

export function getHydrationStreakState() {
  return loadReconciledState();
}

export function getHydrationStreakStateForSave() {
  const state = loadReconciledState();
  // Persist explicit zeros (with updatedAt) so cloud doesn't resurrect a broken streak
  if (state.streak > 0 || state.lastCountedDate || state.updatedAt) return state;
  return {};
}

/**
 * Merge two hydration streak states — the one with the more recent lastCountedDate wins,
 * then falls back to updatedAt, then higher streak count.
 * Both sides are reconciled first so expired streaks can't win.
 */
export function mergeHydrationStreak(localState, cloudState) {
  const local = reconcileHydrationStreakState(normalizeState(localState));
  const cloud = reconcileHydrationStreakState(normalizeState(cloudState));

  const getDateTs = (s) => {
    if (!s || typeof s.lastCountedDate !== 'string') return 0;
    const n = new Date(`${s.lastCountedDate}T00:00:00`).getTime();
    return Number.isNaN(n) ? 0 : n;
  };

  const localDateTs = getDateTs(local);
  const cloudDateTs = getDateTs(cloud);
  if (localDateTs > cloudDateTs) return local;
  if (cloudDateTs > localDateTs) return cloud;
  if ((local.streak || 0) > (cloud.streak || 0)) return local;
  if ((cloud.streak || 0) > (local.streak || 0)) return cloud;

  const localTs = getStateTimestamp(local);
  const cloudTs = getStateTimestamp(cloud);
  if (localTs > cloudTs) return local;
  if (cloudTs > localTs) return cloud;
  return local;
}

export function restoreHydrationStreakFromCloud(cloudState) {
  const merged = mergeHydrationStreak(loadState(), cloudState);
  const reconciled = reconcileHydrationStreakState(merged);
  saveState(reconciled, { dispatch: true, source: 'cloud-sync' });
  return reconciled;
}

/**
 * @returns {{ streak: number, lastCountedDate: string|null, streakStartDate: string|null }}
 */
export function getHydrationStreakData() {
  const state = loadReconciledState();
  let streakStartDate = null;
  if (state.lastCountedDate && state.streak > 0) {
    streakStartDate = addDaysToKey(state.lastCountedDate, -(state.streak - 1));
  }
  return { streak: state.streak, lastCountedDate: state.lastCountedDate, streakStartDate };
}

/**
 * When intake meets or exceeds goal, count at most once per calendar day toward streak.
 * @returns {{ streak: number, incremented: boolean, celebrated: boolean }}
 */
export function maybeRegisterHydrationGoalMet(dateKey, amount, goal) {
  const g = Number(goal) || 0;
  const a = Number(amount) || 0;
  // Expire first so a stale counter doesn't get incremented as if unbroken
  const state = loadReconciledState();
  if (g <= 0 || a < g) {
    return { streak: state.streak, incremented: false, celebrated: false };
  }
  if (state.lastCountedDate === dateKey) {
    return { streak: state.streak, incremented: false, celebrated: false };
  }

  const yesterday = addDaysToKey(dateKey, -1);
  let nextStreak;
  if (state.lastCountedDate === null) {
    nextStreak = 1;
  } else if (state.lastCountedDate === yesterday) {
    nextStreak = state.streak + 1;
  } else {
    nextStreak = 1;
  }

  const newState = { streak: nextStreak, lastCountedDate: dateKey, updatedAt: new Date().toISOString() };
  saveState(newState);
  try {
    window.dispatchEvent(new CustomEvent('tpp:hydration-streak-updated', { detail: { streak: nextStreak, dateKey } }));
  } catch {
    /* non-browser */
  }
  return { streak: nextStreak, incremented: true, celebrated: true };
}

/**
 * After updating water tracker for a day, run streak + one-time daily celebration if goal newly met.
 * @param {string} dateKey YYYY-MM-DD
 * @param {object} dayEntry tracker row for that day
 */
export function tryHydrationGoalRewards(dateKey, dayEntry) {
  const amt = getWaterDayAmount(dayEntry);
  const g = getWaterDayGoal(dayEntry, 0);
  const res = maybeRegisterHydrationGoalMet(dateKey, amt, g);
  // tpp:hydration-goal-complete is now dispatched only from Goals.jsx when a
  // linkedType:'hydrationStreak' goal is auto-completed, so the celebration
  // popup fires only when the user actually finishes their streak goal.
  return res;
}
