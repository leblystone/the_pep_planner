/**
 * Side effects log — persists to localStorage, syncs between AI chat and manual entry.
 *
 * Schema per entry:
 *   id: string
 *   date: 'YYYY-MM-DD'
 *   effect: string  (effect id, e.g. 'headache', 'pip', 'nausea', or free text)
 *   label: string   (display label)
 *   severity: 'mild' | 'moderate' | 'severe' | null
 *   notes: string | null
 *   protocolId: string | null
 *   protocolName: string | null
 *   source: 'ai_chat' | 'manual'
 *   createdAt: ISO string
 */

const STORAGE_KEY = 'tpprover_side_effects';
const MAX_ENTRIES = 1000;

function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function loadSideEffects() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

export function saveSideEffects(entries) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify((entries || []).slice(0, MAX_ENTRIES)));
    } catch { /* noop */ }
}

/**
 * Log a side effect entry. Returns the saved entry.
 */
export function logSideEffect({ effect, label, severity = null, notes = null, protocolId = null, protocolName = null, date = null, source = 'manual' }) {
    const entry = {
        id: `se_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        date: date || today(),
        effect: effect || 'other',
        label: label || effect || 'Unknown',
        severity,
        notes: notes || null,
        protocolId: protocolId || null,
        protocolName: protocolName || null,
        source,
        createdAt: new Date().toISOString(),
    };
    const existing = loadSideEffects();
    saveSideEffects([entry, ...existing]);
    window.dispatchEvent(new CustomEvent('tpp:side-effects-updated', { detail: entry }));
    return entry;
}

export function deleteSideEffect(id) {
    const updated = loadSideEffects().filter(e => e.id !== id);
    saveSideEffects(updated);
    window.dispatchEvent(new CustomEvent('tpp:side-effects-updated'));
}

/**
 * Update an existing side effect entry. Returns the updated entry or null.
 */
export function updateSideEffect(id, updates = {}) {
    const existing = loadSideEffects();
    const idx = existing.findIndex(e => e.id === id);
    if (idx === -1) return null;
    const updated = {
        ...existing[idx],
        ...updates,
        id: existing[idx].id,
        createdAt: existing[idx].createdAt,
        updatedAt: new Date().toISOString(),
    };
    existing[idx] = updated;
    saveSideEffects(existing);
    window.dispatchEvent(new CustomEvent('tpp:side-effects-updated', { detail: updated }));
    return updated;
}

/**
 * Get entries for a specific date.
 */
export function getSideEffectsForDate(dateStr) {
    return loadSideEffects().filter(e => e.date === dateStr);
}

/**
 * Get entries for a specific protocol.
 */
export function getSideEffectsForProtocol(protocolId) {
    return loadSideEffects().filter(e => e.protocolId === protocolId);
}

/**
 * Get a summary of the most frequently logged effects (for pattern display).
 * Returns [{ effect, label, count }] sorted by count desc.
 */
export function getSideEffectPatterns(limitDays = 90) {
    const days = typeof limitDays === 'number' && Number.isFinite(limitDays) ? limitDays : 90;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth()+1).padStart(2,'0')}-${String(cutoff.getDate()).padStart(2,'0')}`;

    const recent = loadSideEffects().filter(e => e.date >= cutoffStr && e.effect !== 'none');
    const counts = {};
    recent.forEach(e => {
        const key = e.effect;
        if (!counts[key]) counts[key] = { effect: e.effect, label: e.label, count: 0, lastDate: e.date };
        counts[key].count++;
        if (e.date > counts[key].lastDate) counts[key].lastDate = e.date;
    });

    return Object.values(counts).sort((a, b) => b.count - a.count);
}
