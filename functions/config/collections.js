/**
 * Firestore collection name constants — single source of truth for Cloud Functions.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Several collections have names inherited from earlier features (notably Ghosty,
 * the AI support worker that was retired). The names in Firestore cannot be
 * changed without a full data migration, so we keep the original paths but expose
 * them here under clearer names. Any Cloud Function that touches Firestore should
 * import from here instead of hard-coding a string.
 *
 * MAPPING: code constant → actual Firestore collection path
 * ----------------------------------------------------------
 * USER_REPORTS_QUEUE  →  "ai_worker_logs"
 *   The admin User Reports inbox. One document per support ticket / feedback /
 *   deletion request that lands in the work queue. Originally written by the
 *   Ghosty AI worker; now written directly by these functions on every new
 *   submission regardless of Ghosty. The Firestore path is "ai_worker_logs" —
 *   there is intentionally NO collection named "userReportsQueue" in the console.
 */

// Callers use: const { COLLECTIONS } = require('./config/collections');
// Keep this shape aligned with src/config/collections.js (export const COLLECTIONS).
module.exports = {
  COLLECTIONS: {
    // ─── User Reports / Work Queue ─────────────────────────────────────────────
    /**
     * Firestore path: "ai_worker_logs"
     * One document per queued user report (support, feedback, deletion).
     * Written here on ticket/feedback/deletion creation; read by admin dashboard.
     * The path is legacy (Ghosty era) — the collection was never renamed in Firestore.
     */
    USER_REPORTS_QUEUE: 'ai_worker_logs',

    // ─── Other collections (add as needed) ─────────────────────────────────────
    SUPPORT_TICKETS:    'supportTickets',
    FEEDBACK:           'feedback',

    // Passkey / WebAuthn (Face ID & Fingerprint sign-in)
    PASSKEY_CREDENTIALS: 'passkeyCredentials',
    PASSKEY_CHALLENGES:  'passkeyChallenges',
  },
};
