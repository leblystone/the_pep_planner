import React from 'react';

const GOALS_KEY = 'tpprover_user_goals';
const GOALS_KEY_LEGACY = 'tpprover_goals';

function readGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      return [];
    }
    const legacy = localStorage.getItem(GOALS_KEY_LEGACY);
    if (legacy) {
      const parsed = JSON.parse(legacy);
      if (Array.isArray(parsed) && parsed.length > 0) {
        localStorage.setItem(GOALS_KEY, legacy);
        try { localStorage.removeItem(GOALS_KEY_LEGACY); } catch {}
        return parsed;
      }
    }
    return [];
  } catch (error) {
    console.error('Error reading goals from localStorage:', error);
    return [];
  }
}

/**
 * Goals stored in tpprover_user_goals and synced to cloud.
 * Use this instead of useLocalStorage('tpprover_goals') so goals sync across devices.
 */
export function useSyncedGoals() {
  const [goals, setGoals] = React.useState(() => {
    const initial = readGoals();
    return Array.isArray(initial) ? initial : [];
  });
  const instanceIdRef = React.useRef(`goals-hook-${Date.now()}-${Math.random()}`);
  const lastSerializedRef = React.useRef(JSON.stringify(goals));

  React.useEffect(() => {
    try {
      const safeGoals = Array.isArray(goals) ? goals : [];
      const serialized = JSON.stringify(safeGoals);
      lastSerializedRef.current = serialized;
      localStorage.setItem(GOALS_KEY, serialized);
      window.dispatchEvent(new CustomEvent('tpp:user-goals-updated', {
        detail: { goals: safeGoals, source: 'useSyncedGoals', instanceId: instanceIdRef.current }
      }));
    } catch (error) {
      console.error('Error saving goals to localStorage:', error);
    }
  }, [goals]);

  React.useEffect(() => {
    const onUpdated = (event) => {
      // Ignore events emitted by this same hook instance to prevent update loops.
      if (event?.detail?.instanceId === instanceIdRef.current) return;

      const incomingGoals = Array.isArray(event?.detail?.goals) ? event.detail.goals : readGoals();
      const nextSerialized = JSON.stringify(incomingGoals);

      // Skip no-op updates to avoid unnecessary renders/churn.
      if (nextSerialized === lastSerializedRef.current) return;
      lastSerializedRef.current = nextSerialized;
      setGoals(incomingGoals);
    };
    window.addEventListener('tpp:user-goals-updated', onUpdated);
    window.addEventListener('tpp:cloud-data-loaded', onUpdated);
    return () => {
      window.removeEventListener('tpp:user-goals-updated', onUpdated);
      window.removeEventListener('tpp:cloud-data-loaded', onUpdated);
    };
  }, []);

  return [goals, setGoals];
}

// Lightweight localStorage hook used in several pages
export default function useLocalStorage(key, initialValue) {
  const [value, setValue] = React.useState(() => {
    try {
      const item = localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch {
      return initialValue
    }
  })
  React.useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
  }, [key, value])
  return [value, setValue]
}
