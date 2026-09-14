import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAdmin } from '../../context/AdminContext';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp, getFirestore, getDoc, where, getDocs, limit, getCountFromServer } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import { COLLECTIONS } from '../../config/collections';
import { closeSupportTicketFromWorkQueue, updateFeedback, getAdminMessagesHistoryForEmail, replyToFeedbackViaTicket, subscribeToTicketMessages } from '../../services/firebase';
import AdminLoader from './AdminLoader';
import CustomDropdown from '../common/inputs/CustomDropdown';
import UserReportsInbox from './UserReportsInbox';
import WorkQueueToolsPanels from './WorkQueueToolsPanels';
// Admin password removed — cloud functions verify admin via Firebase Auth email token
import { 
  Clock, Copy, CheckCircle, WarningCircle, X, PaperPlaneTilt, 
  ChatCircle, Wrench, ArrowSquareOut, ClockCounterClockwise, 
  CurrencyDollar, Calendar, TrendUp, FileText,
  CaretDown, CaretUp, Info, User, Envelope, CreditCard, Trash, ShieldCheck,
  MagnifyingGlass, Plus, Link, GitCommit
} from '@phosphor-icons/react';

// GitHub config — read once from env vars (set in .env.local, gitignored)
const GH_CONFIG = {
  owner: import.meta.env.VITE_GITHUB_OWNER || '',
  repo: import.meta.env.VITE_GITHUB_REPO || '',
  token: import.meta.env.VITE_GITHUB_TOKEN || '',
  branch: import.meta.env.VITE_GITHUB_BRANCH || 'main'
};

// Commit audit helpers — module level so no stale closure issues
const AUDIT_STOP_WORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with',
  'is','it','be','as','by','this','that','was','are','from','fix','fixes',
  'fixed','update','updates','updated','add','adds','added','remove','removes',
  'removed','change','changes','changed','merge','branch','main','refactor',
  'cleanup','hotfix','wip','bump','v','version','pr','feat','chore','build',
  'ci','test','docs','style','perf','revert','release'
]);

function auditTokenize(str) {
  if (!str) return new Set();
  return new Set(
    str.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !AUDIT_STOP_WORDS.has(w))
  );
}

function auditScoreMatch(commitMsg, ticket) {
  const cTokens = auditTokenize(commitMsg);
  const tTokens = new Set([
    ...auditTokenize(ticket.subject),
    ...auditTokenize(ticket.originalMessage),
  ]);
  if (!cTokens.size || !tTokens.size) return 0;
  let matches = 0;
  for (const w of cTokens) { if (tTokens.has(w)) matches++; }
  return matches / Math.max(cTokens.size, tTokens.size);
}

// Quick response templates
const QUICK_RESPONSES = [
  {
    id: 'working',
    label: '🔧 Working On It',
    message: "We're actively working on this and will update you as soon as we have more info!\n\nThe Pep Planner Team"
  },
  {
    id: 'resolved',
    label: '✅ Resolved!',
    message: "Great news - this has been fixed! Give it a try and let us know if you run into anything else.\n\nThe Pep Planner Team"
  },
  {
    id: 'need-info',
    label: '❓ Need Info',
    message: "Could you share a bit more detail? A screenshot or steps to reproduce would help us track this down faster.\n\nThe Pep Planner Team"
  },
  {
    id: 'known-issue',
    label: '🐛 Known Issue',
    message: "We've identified this as a known issue and it's on our fix list. Thanks for the report - we'll update you when it's resolved!\n\nThe Pep Planner Team"
  }
];

const plainStatusLabel = (id) => {
  const res = QUICK_RESPONSES.find(r => r.id === id);
  if (!res) return '';
  return res.label.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '').trim();
};

const ADMIN_STATUS_OPTIONS = [
  { value: '', label: 'Set status' },
  ...QUICK_RESPONSES.map(r => ({ value: r.id, label: plainStatusLabel(r.id) })),
];

// Tooltip component
const Tooltip = ({ text, children }) => {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <div
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        style={{ cursor: 'help', display: 'inline-flex', alignItems: 'center' }}
      >
        {children}
      </div>
      {show && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: '8px',
          padding: '8px 12px',
          backgroundColor: '#1F2937',
          color: '#fff',
          borderRadius: '6px',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          zIndex: 10000,
          maxWidth: '250px',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          {text}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: '50%',
            transform: 'translateX(-50%)',
            borderWidth: '6px',
            borderStyle: 'solid',
            borderColor: '#1F2937 transparent transparent transparent'
          }} />
        </div>
      )}
    </div>
  );
};

// Cache helpers — sessionStorage survives page refreshes; module var avoids
// re-parsing JSON on same-session navigation (component unmount/remount)
// v2 = open-only queue (no full-collection + N+1 enrichment)
const _WQ_KEY = 'wq_cache_v2_open';
const _WQ_CLOSED_KEY = 'wq_cache_v2_closed';
const _COSTS_KEY = 'wq_costs_v2';
const _WQ_CLOSED_TS_KEY = 'wq_cache_v2_closed_ts'; // when the closed list was last fetched
// Closed list TTL: 5 minutes. After this, clicking the Closed tab always
// re-fetches from Firestore so finished tickets are never stale.
const _CLOSED_CACHE_TTL_MS = 5 * 60 * 1000;

function _tsToMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v?.toDate === 'function') return v.toDate().getTime();
  if (typeof v?.toMillis === 'function') return v.toMillis();
  const sec = v?.seconds ?? v?._seconds;
  if (typeof sec === 'number') {
    const nano = v.nanoseconds ?? v._nanoseconds ?? 0;
    return sec * 1000 + Math.floor(nano / 1e6);
  }
  return null;
}

function _serializeTickets(tickets) {
  return tickets.map(t => ({
    ...t,
    timestamp: _tsToMs(t.timestamp),
    markedFixedAt: _tsToMs(t.markedFixedAt),
  }));
}

function _loadCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function _loadCostsCache() {
  try {
    const raw = sessionStorage.getItem(_COSTS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

/** Returns the cached closed list only if it is still within TTL, else null. */
function _loadClosedCache() {
  try {
    const ts = sessionStorage.getItem(_WQ_CLOSED_TS_KEY);
    if (!ts || Date.now() - Number(ts) > _CLOSED_CACHE_TTL_MS) return null;
    const raw = sessionStorage.getItem(_WQ_CLOSED_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function _saveOpenCache(tickets, costs) {
  try {
    sessionStorage.setItem(_WQ_KEY, JSON.stringify(_serializeTickets(tickets)));
    sessionStorage.setItem(_COSTS_KEY, JSON.stringify(costs));
  } catch {} // ignore storage quota errors
}

function _saveClosedCache(tickets) {
  try {
    sessionStorage.setItem(_WQ_CLOSED_KEY, JSON.stringify(_serializeTickets(tickets)));
    sessionStorage.setItem(_WQ_CLOSED_TS_KEY, String(Date.now()));
  } catch {}
}

/** Map a Firestore ai_worker_logs doc → queue item (no extra network). */
function logDocToItem(logDoc) {
  const log = logDoc.data();
  const cost = log.executionCost || log.cost?.total || log.totalCost || 0;
  return {
    logId: logDoc.id,
    ticketId: log.ticketId,
    ticketNumber: log.ticketNumber || log.ticketId?.slice(-6)?.toUpperCase() || 'N/A',
    subject: log.subject || 'Support Request',
    type: log.type || log.ticketType || 'support',
    userName: log.userName || 'Unknown',
    userEmail: log.userEmail || '',
    originalMessage: log.originalMessage || log.ticketMessage || '',
    timestamp: log.timestamp,
    route: log.route,
    confidence: log.confidence,
    reasoning: log.reasoning || log.routingReasoning || '',
    responseContent: log.responseContent || '',
    responsePosted: log.responsePosted || false,
    adminNotes: log.adminNotes || '',
    adminStatus: log.adminStatus || null,
    adminReadAt: log.adminReadAt || null,
    adminMarkedUnread: log.adminMarkedUnread === true,
    linkedCommits: Array.isArray(log.linkedCommits) ? log.linkedCommits : [],
    markedFixed: log.markedFixed || false,
    markedFixedAt: log.markedFixedAt,
    followUpSent: log.followUpSent || false,
    followUpMessage: log.followUpMessage || '',
    executionCost: cost,
    userAccountInfo: log.userAccountInfo || null,
    requestNumbers: Array.isArray(log.requestNumbers) ? log.requestNumbers : undefined,
  };
}

function dedupeTicketsByTicketId(tickets) {
  const byTicket = new Map();
  for (const item of tickets) {
    const tid = item.ticketId || item.logId;
    const existing = byTicket.get(tid);
    const itemTime = item.timestamp?.toDate?.()?.getTime?.() ?? item.timestamp ?? 0;
    const existingTime = existing?.timestamp?.toDate?.()?.getTime?.() ?? existing?.timestamp ?? 0;
    const itemCommits = Array.isArray(item.linkedCommits) ? item.linkedCommits : [];
    const existingCommits = Array.isArray(existing?.linkedCommits) ? existing.linkedCommits : [];
    const seenSha = new Set();
    const merged = [];
    for (const c of [...existingCommits, ...itemCommits]) {
      const sha = c?.sha ?? c?.commit?.sha ?? '';
      if (sha && !seenSha.has(sha)) { seenSha.add(sha); merged.push(c); }
    }
    if (!existing || itemTime >= existingTime) {
      byTicket.set(tid, { ...item, linkedCommits: merged });
    } else {
      byTicket.set(tid, { ...existing, linkedCommits: merged });
    }
  }
  return Array.from(byTicket.values()).sort((a, b) => {
    const ta = a.timestamp?.toDate?.()?.getTime?.() ?? a.timestamp ?? 0;
    const tb = b.timestamp?.toDate?.()?.getTime?.() ?? b.timestamp ?? 0;
    return ta - tb;
  });
}

function computeCostsFromTickets(tickets) {
  let todayCost = 0, weekCost = 0, monthCost = 0, allTimeCost = 0;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  for (const item of tickets) {
    const logDate = item.timestamp?.toDate?.() || new Date(item.timestamp || 0);
    const cost = item.executionCost || 0;
    allTimeCost += cost;
    if (logDate >= monthStart) monthCost += cost;
    if (logDate >= weekStart) weekCost += cost;
    if (logDate >= todayStart) todayCost += cost;
  }
  return { today: todayCost, week: weekCost, month: monthCost, allTime: allTimeCost };
}

// Module-level vars avoid re-parsing JSON on navigation (component unmount/remount).
// _wqClosedCache uses the TTL-aware loader so stale finished-ticket lists are
// never served — it returns null if the cache is older than _CLOSED_CACHE_TTL_MS.
let _wqCache = _loadCache(_WQ_KEY);
let _wqClosedCache = _loadClosedCache(); // TTL-aware — null when expired
let _costsCache = _loadCostsCache();
let _backfillRan = false;

export default function WorkQueue({ theme, feedbackItems, onFeedbackMarkReviewed, onFeedbackMarkResolved, onFeedbackDelete, onFeedbackReply }) {
  const defaultTheme = {
    text: '#1F2937',
    textLight: '#6B7280',
    background: '#F9FAFB',
    cardBackground: '#FFFFFF',
    border: '#E5E7EB',
    primary: '#4a7c59',
    primaryDark: '#2d5a3a',
    btnSend: '#a0522d',
    btnSuccess: '#0d9668'
  };
  const t = theme || defaultTheme;
  const btnPrimary = t.primaryDark || '#2d5a3a';
  const btnSend = t.btnSend || '#a0522d';
  const btnSuccess = t.btnSuccess || '#0d9668';

  const [searchParams] = useSearchParams();
  const {
    selectedUser,
    hasSelectedUser,
    isLoadingUserDetails,
    userSelectionError,
    activeReportContext,
    selectUserByEmail,
    selectUserByUid,
    clearSelectedUser,
    handleExtendTrial,
    isExtendingTrial,
  } = useAdmin();

  // State — initialise from module-level cache so re-mounts are instant
  const [workQueue, setWorkQueue] = useState(() => _wqCache ?? []);
  const [closedQueue, setClosedQueue] = useState(() => _wqClosedCache ?? []);
  // Seed from cache only when TTL is still valid. Otherwise null so the badge
  // shows "?" until getCountFromServer returns the real count.
  const [closedCountHint, setClosedCountHint] = useState(
    () => (_wqClosedCache ? _wqClosedCache.length : null)
  );
  const [closedLoading, setClosedLoading] = useState(false);
  const [loading, setLoading] = useState(_wqCache === null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adminStatus, setAdminStatusLocal] = useState(null);
  // Optimistic overlay for feedback docs (adminReadAt / adminStatus / adminNotes)
  // until AdminContext reloads the feedback list.
  const [feedbackMeta, setFeedbackMeta] = useState({});
  const [linkedCommits, setLinkedCommitsLocal] = useState([]);
  const [commitsFetching, setCommitsFetching] = useState(false);
  const [commitsList, setCommitsList] = useState([]);
  const [showCommitsDropdown, setShowCommitsDropdown] = useState(false);
  const [manualCommitText, setManualCommitText] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  
  const [costs, setCosts] = useState(() => _costsCache ?? {
    today: 0,
    week: 0,
    month: 0,
    allTime: 0
  });
  const [allMessages, setAllMessages] = useState([]);
  const conversationEndRef = useRef(null);
  const [justClosedTicket, setJustClosedTicket] = useState(null);
  const [uidCopySuccess, setUidCopySuccess] = useState(false);
  const [reopenedTickets, setReopenedTickets] = useState([]);
  const [showAddMissed, setShowAddMissed] = useState(false);
  const [addMissedSearch, setAddMissedSearch] = useState('');
  const [addMissedResult, setAddMissedResult] = useState(null);
  const [addMissedError, setAddMissedError] = useState('');
  const [addMissedSearching, setAddMissedSearching] = useState(false);
  const [addMissedAdding, setAddMissedAdding] = useState(false);
  const [showBacklogScan, setShowBacklogScan] = useState(false);
  const [backlogScanning, setBacklogScanning] = useState(false);
  const [backlogResults, setBacklogResults] = useState(null);
  const [expandedBacklogItems, setExpandedBacklogItems] = useState({});
  const [backlogMessages, setBacklogMessages] = useState({});
  const [expandedUserGroups, setExpandedUserGroups] = useState({});
  const [replyingToFeedbackId, setReplyingToFeedbackId] = useState(null);
  const [feedbackReplyText, setFeedbackReplyText] = useState('');
  const [sendingFeedbackReply, setSendingFeedbackReply] = useState(false);
  const [showCommitAudit, setShowCommitAudit] = useState(false);
  const [commitAuditRunning, setCommitAuditRunning] = useState(false);
  const [commitAuditResults, setCommitAuditResults] = useState(null);
  const [commitAuditDays, setCommitAuditDays] = useState(365);
  const [linkingNoMatchSha, setLinkingNoMatchSha] = useState(null);
  const [selectedLogIdForNoMatch, setSelectedLogIdForNoMatch] = useState('');
  const [selectedQueueItem, setSelectedQueueItem] = useState(null);
  const [selectedUserEmail, setSelectedUserEmail] = useState(null);
  const [fromTheTeamMessages, setFromTheTeamMessages] = useState([]);
  const [fromTheTeamLoading, setFromTheTeamLoading] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [closeArmed, setCloseArmed] = useState(false);
  const [closingTicket, setClosingTicket] = useState(false);
  const [deletingReport, setDeletingReport] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);

  const [loadError, setLoadError] = useState(null);

  // Open queue only — no full-collection scan, no per-row ticket/user N+1 fetches.
  // Log docs already carry email / subject / admin fields for the inbox.
  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.USER_REPORTS_QUEUE),
      where('markedFixed', '==', false)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setLoadError(null);
      const tickets = snapshot.docs.map(logDocToItem);
      const deduped = dedupeTicketsByTicketId(tickets);
      _costsCache = computeCostsFromTickets(deduped);
      _wqCache = deduped;
      _saveOpenCache(deduped, _costsCache);
      setWorkQueue(deduped);
      setCosts(_costsCache);
      setLoading(false);

      // If a ticket was reopened server-side, remove it from the closed cache immediately
      setClosedQueue((prev) => {
        if (!prev?.length) return prev;
        const openTicketIds = new Set(deduped.map((t) => t.ticketId).filter(Boolean));
        const openLogIds = new Set(deduped.map((t) => t.logId));
        const next = prev.filter(
          (t) => !(openLogIds.has(t.logId) || (t.ticketId && openTicketIds.has(t.ticketId)))
        );
        if (next.length === prev.length) return prev;
        _wqClosedCache = next;
        _saveClosedCache(next);
        setClosedCountHint((hint) => (typeof hint === 'number' ? Math.max(0, hint - (prev.length - next.length)) : hint));
        return next;
      });

      // One-time backfill: assign adminStatus to old tickets that had replies but no status set
      if (!_backfillRan) {
        _backfillRan = true;
        const needsBackfill = deduped.filter(t => t.followUpSent && !t.adminStatus);
        if (needsBackfill.length > 0) {
          console.log(`[Backfill] Auto-assigning adminStatus to ${needsBackfill.length} old tickets`);
          const inferStatus = (msg = '') => {
            const m = msg.toLowerCase();
            if (m.includes('resolved') || m.includes('fixed') || m.includes('complete') || m.includes('taken care')) return 'resolved';
            if (m.includes('need') || m.includes('info') || m.includes('clarif') || m.includes('more detail')) return 'need-info';
            if (m.includes('known issue') || m.includes('known bug') || m.includes('aware')) return 'known-issue';
            return 'working';
          };
          needsBackfill.forEach(async (t) => {
            const status = inferStatus(t.followUpMessage);
            try {
              await updateDoc(doc(db, COLLECTIONS.USER_REPORTS_QUEUE, t.logId), { adminStatus: status });
              setWorkQueue(prev => prev.map(item =>
                item.logId === t.logId ? { ...item, adminStatus: status } : item
              ));
            } catch (e) {
              console.error(`[Backfill] Failed for ${t.logId}:`, e);
            }
          });
        }
      }
    }, (err) => {
      console.error('Work queue snapshot error:', err);
      setLoadError(err?.message || 'Failed to load user reports');
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Cheap closed count for the Closed tab badge (no docs downloaded)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getCountFromServer(
          query(collection(db, COLLECTIONS.USER_REPORTS_QUEUE), where('markedFixed', '==', true))
        );
        if (!cancelled) setClosedCountHint(snap.data().count);
      } catch (err) {
        console.warn('[WorkQueue] closed count failed:', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Closed history — only when the Closed tab is opened (capped at 200).
  // _wqClosedCache is TTL-aware: it is null when the cache has expired (>5 min),
  // so every tab-open after the TTL triggers a fresh Firestore fetch. Within the
  // TTL, the cached list is shown instantly and no network call is made.
  useEffect(() => {
    if (!showHistory) return undefined;
    if (_wqClosedCache?.length) {
      // Cache still valid — use it. getCountFromServer already corrected the badge.
      setClosedQueue(_wqClosedCache);
      return undefined;
    }
    let cancelled = false;
    setClosedLoading(true);
    (async () => {
      try {
        let snap;
        try {
          snap = await getDocs(query(
            collection(db, COLLECTIONS.USER_REPORTS_QUEUE),
            where('markedFixed', '==', true),
            orderBy('markedFixedAt', 'desc'),
            limit(200)
          ));
        } catch (indexErr) {
          // Fallback if composite index missing
          snap = await getDocs(query(
            collection(db, COLLECTIONS.USER_REPORTS_QUEUE),
            where('markedFixed', '==', true),
            limit(200)
          ));
        }
        if (cancelled) return;
        const tickets = snap.docs.map(logDocToItem);
        const deduped = dedupeTicketsByTicketId(tickets).sort((a, b) => {
          const dateA = a.markedFixedAt?.toDate?.() || new Date(a.markedFixedAt || 0);
          const dateB = b.markedFixedAt?.toDate?.() || new Date(b.markedFixedAt || 0);
          return dateB - dateA;
        });
        _wqClosedCache = deduped;
        _saveClosedCache(deduped);
        setClosedQueue(deduped);
        setClosedCountHint(deduped.length);
      } catch (err) {
        console.error('[WorkQueue] closed load failed:', err);
      } finally {
        if (!cancelled) setClosedLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [showHistory]);


  // Watch for tickets re-opened by users (replied to a closed ticket)
  // These won't have a pending ai_worker_logs entry yet if Ghosty hasn't processed them
  useEffect(() => {
    const ticketsRef = collection(db, 'supportTickets');
    const q = query(ticketsRef, where('reopenedByUser', '==', true), where('status', '==', 'open'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setReopenedTickets(items);
    }, () => {
      setReopenedTickets([]);
    });
    return () => unsubscribe();
  }, []);

  // Live messages — ALL tickets for the selected user (support + feedback-linked), one timeline
  useEffect(() => {
    setAllMessages([]);
    const userEmail = selectedUserEmail?.trim().toLowerCase();
    if (!userEmail) return undefined;

    const messagesByTicket = new Map();
    const subscribed = new Set();
    const unsubscribers = [];
    let cancelled = false;

    const tsToMs = (ts) => {
      if (!ts) return 0;
      if (ts.toMillis) return ts.toMillis();
      if (ts.seconds) return ts.seconds * 1000;
      if (ts instanceof Date) return ts.getTime();
      return 0;
    };
    const rebuild = () => {
      if (cancelled) return;
      const flat = [];
      for (const msgs of messagesByTicket.values()) flat.push(...msgs);
      flat.sort((a, b) => tsToMs(a.createdAt) - tsToMs(b.createdAt));
      setAllMessages(flat);
    };

    const subscribeTicket = (ticketId, meta = {}) => {
      if (!ticketId || subscribed.has(ticketId)) return;
      subscribed.add(ticketId);
      const messagesRef = collection(db, 'supportTickets', ticketId, 'messages');
      const q = query(messagesRef, orderBy('createdAt', 'asc'));
      unsubscribers.push(
        onSnapshot(
          q,
          (snapshot) => {
            messagesByTicket.set(
              ticketId,
              snapshot.docs.map((d) => ({
                id: d.id,
                ...d.data(),
                _ticketId: ticketId,
                _ticketNumber: meta.ticketNumber || ticketId.slice(-6).toUpperCase(),
                _ticketType: meta.type || meta.ticketType || 'support',
                _ticketStatus: meta.status || meta.adminStatus || 'open',
                _feedbackId: meta.feedbackId || null,
              }))
            );
            rebuild();
          },
          (err) => console.error('Error loading ticket messages:', err)
        )
      );
    };

    // Queue logs (open + closed)
    for (const t of [...(workQueueRef.current || []), ...(closedQueue || [])]) {
      if (t.userEmail?.trim().toLowerCase() !== userEmail || !t.ticketId) continue;
      subscribeTicket(t.ticketId, {
        ticketNumber: t.ticketNumber,
        type: t.type || t.ticketType || 'support',
        status: t.status,
        adminStatus: t.adminStatus,
      });
    }

    // Feedback docs with linked tickets
    for (const f of feedbackItems || []) {
      const email = (f._email || f.userEmail || '').trim().toLowerCase();
      if (email !== userEmail) continue;
      const tid = f.linkedTicketId;
      if (!tid) continue;
      const typeRaw = String(f._type || f.type || 'bug').toLowerCase();
      subscribeTicket(tid, {
        ticketNumber: tid.slice(-6).toUpperCase(),
        type: typeRaw.includes('suggest') ? 'suggestion' : 'bug',
        status: f._status || f.status,
        feedbackId: f.id,
      });
    }

    // Authoritative: every supportTickets doc for this email
    let cancelledQuery = false;
    getDocs(query(collection(db, 'supportTickets'), where('userEmail', '==', userEmail)))
      .then((snap) => {
        if (cancelled || cancelledQuery) return;
        snap.docs.forEach((d) => {
          const data = d.data() || {};
          subscribeTicket(d.id, {
            ticketNumber: data.ticketNumber,
            type: data.type || 'support',
            status: data.status,
            feedbackId: data.feedbackId || null,
          });
        });
      })
      .catch((err) => console.warn('Could not list user tickets for blend:', err?.message));

    return () => {
      cancelled = true;
      cancelledQuery = true;
      unsubscribers.forEach((fn) => fn());
    };
  // Re-run when queue/feedback sets change so newly linked tickets join the blend
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUserEmail, workQueue, closedQueue, feedbackItems]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages]);

  // Backlog scan + commit audit are manual-only (Tools panel). Auto-running them
  // on every dashboard load was a major source of initial slowness.

  const searchMissedTicket = async () => {
    const raw = addMissedSearch.trim();
    if (!raw) return;
    setAddMissedSearching(true);
    setAddMissedResult(null);
    setAddMissedError('');
    try {
      const firestore = getFirestore();
      // Normalize: accept "z100", "Z100", "100", "F-ABC123"
      let term = raw.toUpperCase();
      if (/^\d+$/.test(term)) term = `Z${term.padStart(3, '0')}`;
      else if (/^Z\d+$/.test(term)) term = `Z${term.slice(1).padStart(3, '0')}`;

      // Feedback / bug reports use F-#### ids — those are not supportTickets
      if (term.startsWith('F')) {
        const feedbackIdSuffix = term.replace(/^F-?/, '');
        const fromCache = (feedbackItems || []).find((f) => {
          const id = String(f.id || '').toUpperCase();
          const display = `F-${id.slice(-6)}`;
          return id.endsWith(feedbackIdSuffix) || display === term || `F${id.slice(-6)}` === term;
        });
        if (fromCache) {
          setAddMissedResult({
            id: fromCache.id,
            isFeedback: true,
            ticketNumber: `F-${String(fromCache.id).slice(-6).toUpperCase()}`,
            userEmail: fromCache.userEmail,
            subject: fromCache.type === 'bug' ? 'Bug Report' : 'Suggestion',
            status: fromCache.status,
            type: fromCache.type,
            message: fromCache.message,
          });
          return;
        }
        // Fallback: direct doc id if they pasted a full feedback id
        if (feedbackIdSuffix.length > 6) {
          const direct = await getDoc(doc(firestore, 'feedback', raw.replace(/^F-?/i, '')));
          if (direct.exists()) {
            const data = direct.data();
            setAddMissedResult({
              id: direct.id,
              isFeedback: true,
              ticketNumber: `F-${direct.id.slice(-6).toUpperCase()}`,
              userEmail: data.userEmail,
              subject: data.type === 'bug' ? 'Bug Report' : 'Suggestion',
              status: data.status,
              type: data.type,
              message: data.message,
            });
            return;
          }
        }
        setAddMissedError(`No feedback found for "${term}". Bug/suggestion reports use F- numbers, not Z- tickets.`);
        return;
      }

      // Search by ticketNumber first
      const byNumber = await getDocs(
        query(collection(firestore, 'supportTickets'), where('ticketNumber', '==', term))
      );
      if (!byNumber.empty) {
        const d = byNumber.docs[0];
        setAddMissedResult({ id: d.id, ...d.data() });
        return;
      }
      // Fallback: search by requestNumbers array (appended Z### refs on a parent ticket)
      const byRequest = await getDocs(
        query(collection(firestore, 'supportTickets'), where('requestNumbers', 'array-contains', term))
      );
      if (!byRequest.empty) {
        const d = byRequest.docs[0];
        const data = d.data();
        setAddMissedResult({
          id: d.id,
          ...data,
          _matchedRequestNumber: term,
          _note: term !== data.ticketNumber
            ? `${term} is a request on parent ticket ${data.ticketNumber}`
            : undefined,
        });
        return;
      }
      setAddMissedError(
        `No ticket found for "${term}". Tip: appended requests share a parent ticket — try the parent Z### from the email, or run Backlog Scan.`
      );
    } catch (err) {
      const code = err?.code || '';
      const msg = err?.message || String(err);
      setAddMissedError(
        code === 'permission-denied'
          ? 'Search failed: admin permission denied. Sign in with an admin account and refresh.'
          : `Search failed: ${msg}`
      );
    } finally {
      setAddMissedSearching(false);
    }
  };

  const addMissedTicketToQueue = async () => {
    if (!addMissedResult) return;
    setAddMissedAdding(true);
    setAddMissedError('');
    try {
      const addToQueue = httpsCallable(functions, 'addTicketToWorkQueue');
      const payload = addMissedResult.isFeedback
        ? { feedbackId: addMissedResult.id }
        : { ticketId: addMissedResult.id, ticketNumber: addMissedResult.ticketNumber };
      const result = await addToQueue(payload);
      if (!result.data?.success) throw new Error(result.data?.message || 'Failed to add ticket');

      const ticket = addMissedResult;
      const label = ticket.isFeedback
        ? ticket.ticketNumber
        : (ticket._matchedRequestNumber && ticket._matchedRequestNumber !== ticket.ticketNumber
          ? `${ticket._matchedRequestNumber} (parent ${ticket.ticketNumber})`
          : `#${ticket.ticketNumber || ticket.id.slice(-6)}`);
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: `${ticket.isFeedback ? 'Feedback' : 'Ticket'} ${label} added to user reports ✓`, type: 'success' }
      }));
      setShowAddMissed(false);
      setAddMissedSearch('');
      setAddMissedResult(null);
      setAddMissedError('');
    } catch (err) {
      const msg = err?.message || String(err);
      setAddMissedError('Failed to add: ' + msg.replace(/^FirebaseError:\s*/i, ''));
    } finally {
      setAddMissedAdding(false);
    }
  };

  const toggleBacklogItem = async (itemId) => {
    const isExpanding = !expandedBacklogItems[itemId];
    setExpandedBacklogItems(prev => ({ ...prev, [itemId]: isExpanding }));
    if (isExpanding && !backlogMessages[itemId]) {
      try {
        const firestore = getFirestore();
        const msgsSnap = await getDocs(
          query(collection(firestore, 'supportTickets', itemId, 'messages'), orderBy('createdAt', 'asc'))
        );
        const userMsg = msgsSnap.docs.find(d => d.data().senderType === 'user');
        setBacklogMessages(prev => ({
          ...prev,
          [itemId]: userMsg?.data()?.message || userMsg?.data()?.text || '(no message content)'
        }));
      } catch {
        setBacklogMessages(prev => ({ ...prev, [itemId]: '(could not load message)' }));
      }
    }
  };

  const runBacklogScan = async () => {
    setBacklogScanning(true);
    setBacklogResults(null);
    try {
      const firestore = getFirestore();
      // Build a map: ticketId → { latestLogTimestamp, isMarkedFixed }
      // Include BOTH open and closed queue rows so "replied after close" is accurate.
      const logMap = new Map();
      const considerLog = (item) => {
        if (!item.ticketId) return;
        const itemTs = item.timestamp?.toDate?.()?.getTime?.()
          ?? (typeof item.timestamp === 'number' ? item.timestamp : 0);
        const fixedAt = item.markedFixedAt?.toDate?.()?.getTime?.()
          ?? (typeof item.markedFixedAt === 'number' ? item.markedFixedAt : 0);
        const existing = logMap.get(item.ticketId);
        const ts = Math.max(itemTs || 0, fixedAt || 0);
        if (!existing || ts > (existing.ts ?? 0)) {
          logMap.set(item.ticketId, { ts, markedFixed: !!item.markedFixed });
        } else if (existing && item.markedFixed === false) {
          // Prefer an open row when timestamps are equal / close
          logMap.set(item.ticketId, { ...existing, markedFixed: false });
        }
      };
      for (const item of workQueue) considerLog(item);
      for (const item of closedQueue) considerLog(item);

      // Scan supportTickets with any activity in last 90 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const snap = await getDocs(
        query(
          collection(firestore, 'supportTickets'),
          where('lastMessageAt', '>=', cutoff),
          orderBy('lastMessageAt', 'desc')
        )
      );

      const missed = [];
      for (const d of snap.docs) {
        const data = d.data();
        // Skip fully closed/merged tickets with no open work left
        if (data.status === 'merged') continue;
        const lastMsgTs = data.lastMessageAt?.toDate?.()?.getTime() ?? 0;
        const logEntry = logMap.get(d.id);

        // Missed if: no log at all, OR log is marked fixed and user sent a message after it was fixed
        const noLog = !logEntry;
        const repliedAfterClose = logEntry?.markedFixed && lastMsgTs > (logEntry.ts ?? 0);

        if (noLog || repliedAfterClose) {
          // Check if it's already pending in our queue
          const alreadyPending = workQueue.some(q => q.ticketId === d.id && !q.markedFixed);
          if (!alreadyPending) {
            missed.push({
              id: d.id,
              ticketNumber: data.ticketNumber,
              requestNumbers: data.requestNumbers || [],
              userEmail: data.userEmail,
              subject: data.subject,
              status: data.status,
              lastMessageAt: data.lastMessageAt,
              reason: noLog
                ? 'Never landed in User Reports queue (email may still have been sent)'
                : 'User replied after ticket was closed in queue',
            });
          }
        }
      }
      setBacklogResults(missed);
      // Results stored silently — panel stays collapsed until manually opened
    } catch (err) {
      setBacklogResults({ error: err?.message || 'Scan failed' });
    } finally {
      setBacklogScanning(false);
    }
  };

  const pendingTickets = workQueue;
  const completedTickets = closedQueue;

  const openTicket = (ticket) => {
    setSelectedTicket(ticket);
    setAdminNotes(ticket.adminNotes || '');
    setAdminStatusLocal(ticket.adminStatus || null);
    setLinkedCommitsLocal(Array.isArray(ticket.linkedCommits) ? ticket.linkedCommits : []);
    setCustomMessage('');
    setDeleteArmed(false);
    setCloseArmed(false);
  };

  const resolveUserForItem = useCallback(
    (item) => {
      if (!item) return;
      const info = item.userAccountInfo;
      const uid = info?.userId || info?.uid || info?.id;
      const email = item.email || item.raw?.userEmail;
      const reportContext = {
        ticketId: item.raw?.ticketId,
        ticketNumber: item.ticketNumber,
        type: item.typeLabel,
        source: item.kind === 'feedback' ? 'feedback' : 'support',
      };
      if (uid) {
        selectUserByUid(uid, { reportContext, seed: { email } });
      } else if (email) {
        selectUserByEmail(email, { reportContext });
      }
    },
    [selectUserByUid, selectUserByEmail]
  );

  const selectUser = useCallback(
    (email) => {
      const normalized = email?.trim().toLowerCase() || null;
      setSelectedUserEmail(normalized);
      setSelectedQueueItem(null);
      setSelectedTicket(null);
      setAdminNotes('');
      setAdminStatusLocal(null);
      setLinkedCommitsLocal([]);
      setCustomMessage('');
      setDeleteArmed(false);
      setCloseArmed(false);
      if (normalized) {
        selectUserByEmail(normalized, { reportContext: { source: 'support' } });
      } else {
        clearSelectedUser();
      }
    },
    [selectUserByEmail, clearSelectedUser]
  );

  const closeModal = () => {
    setSelectedQueueItem(null);
    setSelectedTicket(null);
    setAdminNotes('');
    setAdminStatusLocal(null);
    setLinkedCommitsLocal([]);
    setCustomMessage('');
    setShowCommitsDropdown(false);
    setCommitsList([]);
    setManualCommitText('');
    setDeleteArmed(false);
    setCloseArmed(false);
    setFromTheTeamMessages([]);
  };

  /** Back to the Open User Reports list (clears conversation + user selection). */
  const returnToReportsList = useCallback(() => {
    closeModal();
    setSelectedUserEmail(null);
    clearSelectedUser();
    setShowHistory(false);
  }, [clearSelectedUser]);

  const getMs = (ts) => {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (ts instanceof Date) return ts.getTime();
    if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
    if (typeof ts?.toMillis === 'function') return ts.toMillis();
    const sec = ts?.seconds ?? ts?._seconds;
    if (typeof sec === 'number') {
      const nano = ts.nanoseconds ?? ts._nanoseconds ?? 0;
      return sec * 1000 + Math.floor(nano / 1e6);
    }
    return 0;
  };

  const getTypeCategory = (typeLabel) => {
    if (typeLabel === 'Bug') return 'bug';
    if (typeLabel === 'Suggestion') return 'suggestion';
    if (typeLabel === 'Deletion') return 'deletion';
    return 'support';
  };

  const isItemUnread = (adminReadAt, { adminStatus, adminNotes, adminMarkedUnread } = {}) => {
    if (adminMarkedUnread) return true;
    if (adminReadAt != null && adminReadAt !== false) return false;
    // Legacy items touched before read-tracking: treat as read so the inbox isn’t flooded
    if (adminStatus || (typeof adminNotes === 'string' && adminNotes.trim())) return false;
    return true;
  };

  const patchFeedbackMeta = useCallback((feedbackId, patch) => {
    if (!feedbackId) return;
    setFeedbackMeta((prev) => ({
      ...prev,
      [feedbackId]: { ...(prev[feedbackId] || {}), ...patch },
    }));
  }, []);

  const markItemRead = useCallback(async (item) => {
    if (!item) return;
    const readAt = new Date();
    const patch = { adminReadAt: readAt, adminMarkedUnread: false };
    try {
      if (item.kind === 'support' && item.raw?.logId) {
        await updateDoc(doc(db, COLLECTIONS.USER_REPORTS_QUEUE, item.raw.logId), {
          adminReadAt: serverTimestamp(),
          adminMarkedUnread: false,
        });
        setWorkQueue((prev) =>
          prev.map((t) => (t.logId === item.raw.logId ? { ...t, ...patch } : t))
        );
        setSelectedTicket((prev) =>
          prev?.logId === item.raw.logId ? { ...prev, ...patch } : prev
        );
      } else if (item.kind === 'feedback' && item.raw?.id) {
        await updateFeedback(item.raw.id, {
          adminReadAt: serverTimestamp(),
          adminMarkedUnread: false,
        });
        patchFeedbackMeta(item.raw.id, patch);
        setSelectedTicket((prev) =>
          prev?.id === item.raw.id ? { ...prev, ...patch } : prev
        );
      }
      setSelectedQueueItem((prev) =>
        prev && (
          (prev.kind === 'support' && prev.raw?.logId === item.raw?.logId) ||
          (prev.kind === 'feedback' && prev.raw?.id === item.raw?.id)
        )
          ? { ...prev, ...patch, unread: false }
          : prev
      );
    } catch (err) {
      console.error('[markItemRead] failed:', err);
    }
  }, [patchFeedbackMeta]);

  const markItemUnread = useCallback(async (item) => {
    if (!item) return;
    const patch = { adminReadAt: null, adminMarkedUnread: true };
    try {
      if (item.kind === 'support' && item.raw?.logId) {
        await updateDoc(doc(db, COLLECTIONS.USER_REPORTS_QUEUE, item.raw.logId), patch);
        setWorkQueue((prev) =>
          prev.map((t) => (t.logId === item.raw.logId ? { ...t, ...patch } : t))
        );
        setSelectedTicket((prev) =>
          prev?.logId === item.raw.logId ? { ...prev, ...patch } : prev
        );
      } else if (item.kind === 'feedback' && item.raw?.id) {
        await updateFeedback(item.raw.id, patch);
        patchFeedbackMeta(item.raw.id, patch);
        setSelectedTicket((prev) =>
          prev?.id === item.raw.id ? { ...prev, ...patch } : prev
        );
      }
      setSelectedQueueItem((prev) =>
        prev && (
          (prev.kind === 'support' && prev.raw?.logId === item.raw?.logId) ||
          (prev.kind === 'feedback' && prev.raw?.id === item.raw?.id)
        )
          ? { ...prev, ...patch, unread: true }
          : prev
      );
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Marked unread', type: 'success' } }));
    } catch (err) {
      console.error('[markItemUnread] failed:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Could not mark unread', type: 'error' } }));
    }
  }, [patchFeedbackMeta]);

  const buildUnifiedItems = useCallback(() => {
    const items = [];
    const tickets = showHistory ? completedTickets : pendingTickets;

    for (const ticket of tickets) {
      const email = (ticket.userEmail || ticket.logId || 'unknown').trim().toLowerCase();
      const typeLabel =
        ticket.type === 'account_deletion_request' ? 'Deletion'
        : ticket.type === 'bug' ? 'Bug'
        : ticket.type === 'suggestion' ? 'Suggestion'
        : 'Support';
      const adminReadAt = ticket.adminReadAt || null;
      const adminMarkedUnread = ticket.adminMarkedUnread === true;
      const adminStatus = ticket.adminStatus || null;
      const adminNotes = ticket.adminNotes || '';
      items.push({
        kind: 'support',
        email: ticket.userEmail || email,
        ticketNumber: ticket.ticketNumber,
        dateMs: getMs(ticket.timestamp) || getMs(ticket.markedFixedAt),
        message: ticket.subject || ticket.originalMessage || '(no message)',
        typeLabel,
        typeCategory: getTypeCategory(typeLabel),
        adminStatus,
        adminNotes,
        adminReadAt,
        adminMarkedUnread,
        unread: isItemUnread(adminReadAt, { adminStatus, adminNotes, adminMarkedUnread }),
        feedbackStatus: null,
        raw: ticket,
        userAccountInfo: ticket.userAccountInfo,
      });
    }

    if (!showHistory) {
      for (const f of (feedbackItems || []).filter((x) => x._status !== 'resolved')) {
        const d = f._date instanceof Date ? f._date : new Date(f._date || 0);
        const email = (f._email || 'unknown').trim().toLowerCase();
        const typeLabel = f._type === 'bug' ? 'Bug' : 'Suggestion';
        const meta = feedbackMeta[f.id] || {};
        const adminStatus = meta.adminStatus !== undefined ? meta.adminStatus : (f.adminStatus || null);
        const adminNotes = meta.adminNotes !== undefined ? meta.adminNotes : (f.adminNotes || '');
        const adminReadAt = meta.adminReadAt !== undefined ? meta.adminReadAt : (f.adminReadAt || null);
        const adminMarkedUnread = meta.adminMarkedUnread !== undefined
          ? meta.adminMarkedUnread
          : (f.adminMarkedUnread === true);
        items.push({
          kind: 'feedback',
          email: f._email || email,
          ticketNumber: null,
          dateMs: d.getTime(),
          message: f._preview || f.message || f.feedback || '(no message)',
          typeLabel,
          typeCategory: getTypeCategory(typeLabel),
          adminStatus,
          adminNotes,
          adminReadAt,
          adminMarkedUnread,
          unread: isItemUnread(adminReadAt, { adminStatus, adminNotes, adminMarkedUnread }),
          feedbackStatus: f._status || 'new',
          raw: {
            _isFeedback: true,
            _feedbackType: f._type,
            _feedbackStatus: f._status,
            _rawFeedback: f,
            id: f.id,
            logId: `feedback-${f.id}`,
            userEmail: f._email,
            timestamp: d,
            subject: f._preview,
            adminStatus,
            adminNotes,
            adminReadAt,
            adminMarkedUnread,
          },
          userAccountInfo: null,
        });
      }
    }

    return items.sort((a, b) => b.dateMs - a.dateMs);
  }, [showHistory, pendingTickets, completedTickets, feedbackItems, feedbackMeta]);

  const allUnifiedItems = useMemo(() => buildUnifiedItems(), [buildUnifiedItems]);

  const typeCounts = useMemo(() => {
    const counts = { all: allUnifiedItems.length, unread: 0, bug: 0, suggestion: 0, support: 0, deletion: 0 };
    for (const item of allUnifiedItems) {
      if (item.unread) counts.unread++;
      if (counts[item.typeCategory] !== undefined) counts[item.typeCategory]++;
    }
    return counts;
  }, [allUnifiedItems]);

  const filteredItems = allUnifiedItems;

  const ticketIdDeepLink = searchParams.get('ticketId');
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (!ticketIdDeepLink || deepLinkHandled.current || allUnifiedItems.length === 0) return;
    const match = allUnifiedItems.find((i) => i.raw?.ticketId === ticketIdDeepLink);
    if (match) {
      deepLinkHandled.current = true;
      selectQueueItem(match);
    }
  }, [ticketIdDeepLink, allUnifiedItems]);

  const openCount =
    pendingTickets.length + (feedbackItems || []).filter((f) => f._status !== 'resolved').length;
  const closedCount = closedCountHint ?? completedTickets.length;

  const getTierBadge = (info) => {
    if (!info) return null;
    let status = (info.subscriptionStatus || info.status || '').toLowerCase();
    let type = (info.subscriptionType || info.plan || info.type || '').toLowerCase();
    const sub = info.subscription;
    if (sub && typeof sub === 'object') {
      if (!status) status = (sub.status || sub.subscriptionStatus || sub.subscription_status || '').toLowerCase();
      if (!type) type = (sub.plan || sub.type || sub.subscriptionType || sub.subscription_type || sub.planType || '').toLowerCase();
    }
    const isLifetime = type === 'lifetime' || (sub?.plan && String(sub.plan).toLowerCase().includes('lifetime'));
    const isMonthly = type === 'monthly' || (sub?.plan && /monthly|month/i.test(String(sub.plan)));
    let label = '—';
    if (isLifetime) label = 'Lifetime';
    else if (isMonthly) label = 'Monthly';
    else if (type === 'annual') label = 'Annual';
    else if (status === 'trialing') label = 'Trial';
    else if (status === 'active') label = 'Active';
    else if (status) label = status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ');
    const bg = isLifetime ? '#8B5CF620' : isMonthly ? '#3B82F620' : '#6B728020';
    const fg = isLifetime ? '#8B5CF6' : isMonthly ? '#3B82F6' : '#6B7280';
    return { bg, fg, label };
  };

  const selectQueueItem = (item) => {
    setSelectedQueueItem(item);
    setSelectedUserEmail(item.email?.trim().toLowerCase() || null);
    setDeleteArmed(false);
    setCloseArmed(false);
    resolveUserForItem(item);
    if (item.kind === 'support') {
      openTicket(item.raw);
    } else {
      const fb = item.raw?._rawFeedback;
      const notes = item.adminNotes || fb?.adminNotes || '';
      const status = item.adminStatus || fb?.adminStatus || null;
      setSelectedTicket({
        ...item.raw,
        adminNotes: notes,
        adminStatus: status,
        adminReadAt: item.adminReadAt ?? fb?.adminReadAt ?? null,
      });
      setAdminNotes(notes);
      setAdminStatusLocal(status);
      setLinkedCommitsLocal([]);
      setCustomMessage('');
    }
    // Gmail-style: opening a report marks it read
    if (item.unread) {
      markItemRead(item);
    }
  };

  useEffect(() => {
    if (!selectedQueueItem) return;
    const still = allUnifiedItems.some((i) => {
      if (i.kind !== selectedQueueItem.kind) return false;
      if (i.kind === 'feedback') return i.raw?.id === selectedQueueItem.raw?.id;
      return i.raw?.logId === selectedQueueItem.raw?.logId;
    });
    if (!still) returnToReportsList();
  }, [allUnifiedItems, selectedQueueItem, returnToReportsList]);

  // Keep selectedQueueItem.unread in sync when underlying data updates
  useEffect(() => {
    if (!selectedQueueItem) return;
    const match = allUnifiedItems.find((i) => {
      if (i.kind !== selectedQueueItem.kind) return false;
      if (i.kind === 'feedback') return i.raw?.id === selectedQueueItem.raw?.id;
      return i.raw?.logId === selectedQueueItem.raw?.logId;
    });
    if (!match) return;
    if (
      match.unread !== selectedQueueItem.unread ||
      match.adminStatus !== selectedQueueItem.adminStatus ||
      match.adminNotes !== selectedQueueItem.adminNotes
    ) {
      setSelectedQueueItem((prev) => (prev ? { ...prev, ...match, raw: match.raw } : prev));
    }
  }, [allUnifiedItems, selectedQueueItem]);

  // Load conversation for suggestion/bug: ticket thread when linked, else legacy From the Team
  useEffect(() => {
    if (selectedQueueItem?.kind !== 'feedback') {
      setFromTheTeamMessages([]);
      setFromTheTeamLoading(false);
      return undefined;
    }
    const fb = selectedQueueItem.raw?._rawFeedback || {};
    const linkedTicketId = fb.linkedTicketId || selectedQueueItem.raw?.ticketId || null;
    const email = selectedQueueItem.email?.trim();
    let cancelled = false;
    setFromTheTeamLoading(true);

    if (linkedTicketId) {
      // Live ticket thread (unified inbox)
      const unsub = subscribeToTicketMessages(linkedTicketId, (msgs) => {
        if (cancelled) return;
        const mapped = (msgs || []).map((m, i) => ({
          id: m.id || `tm-${i}`,
          message: m.message || m.text || '',
          createdAt: m.createdAt,
          userEmail: email,
          senderType: m.senderType,
          seededFromFeedback: Boolean(m.seededFromFeedback),
        }));
        setFromTheTeamMessages(mapped);
        setFromTheTeamLoading(false);
      });
      return () => {
        cancelled = true;
        if (typeof unsub === 'function') unsub();
      };
    }

    if (!email) {
      setFromTheTeamMessages([]);
      setFromTheTeamLoading(false);
      return undefined;
    }
    getAdminMessagesHistoryForEmail(email)
      .then((msgs) => {
        if (!cancelled) setFromTheTeamMessages(Array.isArray(msgs) ? msgs : []);
      })
      .catch((err) => {
        console.warn('Failed to load From the Team history:', err);
        if (!cancelled) setFromTheTeamMessages([]);
      })
      .finally(() => {
        if (!cancelled) setFromTheTeamLoading(false);
      });
    return () => { cancelled = true; };
  }, [
    selectedQueueItem?.kind,
    selectedQueueItem?.email,
    selectedQueueItem?.raw?.id,
    selectedQueueItem?.raw?._rawFeedback?.linkedTicketId,
    selectedQueueItem?.raw?.ticketId,
  ]);

  const handleSendReplyUnified = async () => {
    if (!selectedQueueItem || !customMessage.trim()) return;
    if (selectedQueueItem.kind === 'feedback') {
      setSending(true);
      const sentText = customMessage.trim();
      try {
        const fb = selectedQueueItem.raw?._rawFeedback || selectedQueueItem.raw;
        const result = await (onFeedbackReply
          ? onFeedbackReply(fb, sentText)
          : replyToFeedbackViaTicket(fb, sentText).then(() => true));
        if (result === false) return;
        const ticketId =
          (typeof result === 'object' && result?.ticketId) ||
          fb?.linkedTicketId ||
          null;
        setCustomMessage('');
        setSelectedQueueItem((prev) => {
          if (!prev || prev.kind !== 'feedback') return prev;
          const rawFb = prev.raw?._rawFeedback || {};
          const prior = Array.isArray(rawFb.adminReplies) ? rawFb.adminReplies : [];
          const nextReply = { message: sentText, createdAt: new Date().toISOString() };
          return {
            ...prev,
            feedbackStatus: 'reviewed',
            raw: {
              ...prev.raw,
              ticketId: ticketId || prev.raw?.ticketId || null,
              _feedbackStatus: 'reviewed',
              _rawFeedback: {
                ...rawFb,
                status: 'reviewed',
                adminResponse: sentText,
                responseDate: new Date(),
                linkedTicketId: ticketId || rawFb.linkedTicketId || null,
                adminReplies: [...prior, nextReply],
              },
            },
          };
        });
        // Optimistic bubble until ticket subscription catches up
        setFromTheTeamMessages((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}`,
            message: sentText,
            createdAt: new Date(),
            userEmail: selectedQueueItem.email,
            senderType: 'admin',
          },
        ]);
      } catch (err) {
        window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err?.message || 'Failed to send', type: 'error' } }));
      } finally {
        setSending(false);
      }
    } else {
      const ticketId = selectedTicket?.ticketId || selectedQueueItem?.raw?.ticketId;
      if (!ticketId) {
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: {
            message: 'This report isn’t linked to a support ticket, so the reply can’t be sent.',
            type: 'error',
          },
        }));
        return;
      }
      await sendMessage();
    }
  };

  const handleCloseFromPanel = async () => {
    if (!selectedQueueItem && !selectedUserEmail) return;
    setClosingTicket(true);
    try {
      const email = (selectedUserEmail || selectedQueueItem?.email || '').trim().toLowerCase();
      if (!email) return;

      // Close every open report for this user (support + feedback), not just the selected one.
      const groupItems = (allUnifiedItems || []).filter(
        (i) => (i.email || '').trim().toLowerCase() === email
      );
      if (groupItems.length === 0) {
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: { message: 'No open reports to close for this user', type: 'info' },
        }));
        return;
      }

      const closedTicketIds = new Set();
      let closedCount = 0;

      for (const item of groupItems) {
        if (item.kind === 'feedback') {
          const fb = feedbackDocFromQueueItem(item);
          if (fb?.id && onFeedbackMarkResolved) {
            await onFeedbackMarkResolved(fb);
            closedCount += 1;
          }
          continue;
        }

        const ticket = item.raw;
        if (!ticket?.logId) continue;
        const tid = ticket.ticketId || null;

        // One cloud close per ticketId; still mark any extra log rows locally.
        if (tid && closedTicketIds.has(tid)) {
          await updateDoc(doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId), {
            markedFixed: true,
            markedFixedAt: serverTimestamp(),
            ...(adminNotes ? { adminNotes } : {}),
          });
          applyClosedToLocalQueue(ticket);
          closedCount += 1;
          continue;
        }

        await closeTicketInline(ticket, null, { silent: true, notes: adminNotes });
        if (tid) closedTicketIds.add(tid);
        closedCount += 1;
      }

      returnToReportsList();
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: {
          message: closedCount > 1
            ? `Closed ${closedCount} reports for this user`
            : 'Closed this user’s report',
          type: 'success',
        },
      }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err?.message || 'Failed', type: 'error' } }));
    } finally {
      setClosingTicket(false);
    }
  };

  const handleDeleteFromPanel = async () => {
    if (!selectedQueueItem) return;
    setDeletingReport(true);
    try {
      if (selectedQueueItem.kind === 'feedback') {
        const fb = feedbackDocFromQueueItem(selectedQueueItem);
        if (onFeedbackDelete && fb?.id) await onFeedbackDelete(fb);
      } else if (selectedQueueItem.typeLabel === 'Deletion') {
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: { message: 'Process account deletions from Settings → Deletions', type: 'info' },
        }));
      } else {
        await closeTicketInline(selectedQueueItem.raw);
      }
      closeModal();
      setDeleteArmed(false);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err?.message || 'Delete failed', type: 'error' } }));
    } finally {
      setDeletingReport(false);
    }
  };

  const handleMarkReviewedPanel = async () => {
    if (!selectedQueueItem || selectedQueueItem.kind !== 'feedback') return;
    setMarkingReviewed(true);
    try {
      const fb = feedbackDocFromQueueItem(selectedQueueItem);
      if (onFeedbackMarkReviewed && fb?.id) await onFeedbackMarkReviewed(fb);
    } catch (err) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err?.message || 'Failed', type: 'error' } }));
    } finally {
      setMarkingReviewed(false);
    }
  };

  const handleQuickResponse = (response) => {
    const next = (adminStatus ?? selectedTicket?.adminStatus) === response.id ? null : response.id;
    saveAdminStatus(next);
    if (next) setCustomMessage(response.message);
  };

  const selectedTicketRef = useRef(null);
  const selectedQueueItemRef = useRef(null);
  const workQueueRef = useRef(workQueue);
  useEffect(() => { selectedTicketRef.current = selectedTicket; }, [selectedTicket]);
  useEffect(() => { selectedQueueItemRef.current = selectedQueueItem; }, [selectedQueueItem]);
  useEffect(() => { workQueueRef.current = workQueue; }, [workQueue]);

  const saveAdminStatus = async (status) => {
    const ticket = selectedTicketRef.current;
    const queueItem = selectedQueueItemRef.current;
    if (!ticket && !queueItem) { console.warn('[saveAdminStatus] no ticket ref'); return; }
    setAdminStatusLocal(status);
    try {
      if (queueItem?.kind === 'feedback' && queueItem.raw?.id) {
        await updateFeedback(queueItem.raw.id, { adminStatus: status });
        patchFeedbackMeta(queueItem.raw.id, { adminStatus: status });
        setSelectedTicket((prev) => (prev ? { ...prev, adminStatus: status } : null));
        setSelectedQueueItem((prev) => (prev ? { ...prev, adminStatus: status } : null));
      } else if (ticket?.logId && !ticket?._isFeedback) {
        const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId);
        await updateDoc(logRef, { adminStatus: status });
        setWorkQueue((prev) =>
          prev.map((t) => (t.logId === ticket.logId ? { ...t, adminStatus: status } : t))
        );
        setSelectedTicket((prev) => (prev ? { ...prev, adminStatus: status } : null));
        setSelectedQueueItem((prev) => (prev ? { ...prev, adminStatus: status } : null));
      }
    } catch (error) {
      console.error('[saveAdminStatus] failed:', error);
    }
  };

  /** Update status from the list row without opening the modal */
  const saveAdminStatusForTicket = async (ticket, status) => {
    if (!ticket?.logId) return;
    try {
      const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId);
      await updateDoc(logRef, { adminStatus: status });
      setWorkQueue(prev => prev.map(t =>
        t.logId === ticket.logId ? { ...t, adminStatus: status } : t
      ));
      if (selectedTicket?.logId === ticket.logId) {
        setSelectedTicket(prev => prev ? { ...prev, adminStatus: status } : null);
        setAdminStatusLocal(status);
      }
    } catch (error) {
      console.error('[saveAdminStatusForTicket] failed:', error);
    }
  };

  const saveLinkedCommits = async (commits) => {
    const ticket = selectedTicketRef.current;
    if (!ticket) return;
    setLinkedCommitsLocal(commits);
    try {
      const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId);
      await updateDoc(logRef, { linkedCommits: commits });
      setWorkQueue(prev => {
        const next = prev.map(t =>
          t.logId === ticket.logId ? { ...t, linkedCommits: commits } : t
        );
        _wqCache = next;
         _saveOpenCache(next, _costsCache);
        return next;
      });
      setSelectedTicket(prev => prev ? { ...prev, linkedCommits: commits } : null);
    } catch (error) {
      console.error('Failed to save linked commits:', error);
    }
  };

  const runCommitAudit = async (days) => {
    const auditDays = days || commitAuditDays || 365;
    const branch = GH_CONFIG.branch;
    console.log('[CommitAudit] starting — days:', auditDays, 'branch:', branch, 'owner:', GH_CONFIG.owner, 'repo:', GH_CONFIG.repo, 'token set:', !!GH_CONFIG.token);

    if (!GH_CONFIG.owner || !GH_CONFIG.repo || !GH_CONFIG.token) {
      console.warn('[CommitAudit] GH_CONFIG missing values — check .env.local and restart dev server');
      alert('GitHub credentials not found. Make sure .env.local has VITE_GITHUB_OWNER, VITE_GITHUB_REPO, VITE_GITHUB_TOKEN and that you restarted the dev server.');
      return;
    }

    setCommitAuditRunning(true);
    setCommitAuditResults(null);

    try {
      const since = new Date(Date.now() - auditDays * 24 * 60 * 60 * 1000).toISOString();
      console.log('[CommitAudit] fetching commits since', since, 'on branch', branch);
      let page = 1;
      let allCommits = [];
      const maxPages = 10; // GitHub caps at 300 commits; we fetch up to 1000 (10×100)
      while (page <= maxPages) {
        const url = `https://api.github.com/repos/${GH_CONFIG.owner}/${GH_CONFIG.repo}/commits?sha=${branch}&since=${since}&per_page=100&page=${page}`;
        console.log('[CommitAudit] GET', url);
        const res = await fetch(url, { headers: { Authorization: `Bearer ${GH_CONFIG.token}` } });
        if (!res.ok) throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
        const batch = await res.json();
        if (!Array.isArray(batch) || batch.length === 0) break;
        allCommits = [...allCommits, ...batch];
        console.log('[CommitAudit] fetched', allCommits.length, 'commits so far');
        if (batch.length < 100) break;
        page++;
      }

      console.log('[CommitAudit] total commits:', allCommits.length, '| total tickets:', workQueueRef.current.length);
      const SCORE_THRESHOLD = 0.12;
      const linked = [];
      const noMatch = [];

      for (const commit of allCommits) {
        const sha7 = commit.sha?.slice(0, 7) || commit.sha;
        const msg = (commit.commit?.message || '').split('\n')[0].slice(0, 120);
        const commitUrl = commit.html_url || null;
        const commitDate = commit.commit?.author?.date || new Date().toISOString();

        let best = null;
        let bestScore = 0;
        for (const ticket of workQueueRef.current) {
          const score = auditScoreMatch(msg, ticket);
          if (score > bestScore) { bestScore = score; best = ticket; }
        }

        if (best && bestScore >= SCORE_THRESHOLD) {
          const entry = { sha: sha7, message: msg, url: commitUrl, linkedAt: commitDate, autoLinked: true };
          const currentBest = workQueueRef.current.find(t => t.logId === best.logId);
          const already = (currentBest?.linkedCommits || []).some(lc => lc.sha === sha7);
          if (!already) {
            try {
              const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, best.logId);
              const updatedCommits = [...(currentBest?.linkedCommits || []), entry];
              await updateDoc(logRef, { linkedCommits: updatedCommits });
              setWorkQueue(prev => {
                const next = prev.map(t =>
                  t.logId === best.logId ? { ...t, linkedCommits: updatedCommits } : t
                );
                workQueueRef.current = next;
                _wqCache = next;
                 _saveOpenCache(next, _costsCache);
                return next;
              });
              linked.push({ commit: { sha: sha7, msg, url: commitUrl, date: commitDate }, ticket: best, score: bestScore, skipped: false });
              console.log('[CommitAudit] linked', sha7, '→ ticket', best.ticketNumber, 'score', (bestScore*100).toFixed(0)+'%');
            } catch (err) {
              console.error('[CommitAudit] Firestore write failed for', sha7, err);
              linked.push({ commit: { sha: sha7, msg, url: commitUrl, date: commitDate }, ticket: best, score: bestScore, skipped: true, error: err?.message });
            }
          } else {
            linked.push({ commit: { sha: sha7, msg, url: commitUrl, date: commitDate }, ticket: best, score: bestScore, skipped: true, reason: 'already linked' });
          }
        } else {
          noMatch.push({ sha: sha7, msg, url: commitUrl, date: commitDate, bestScore });
        }
      }

      console.log('[CommitAudit] done — linked:', linked.length, 'noMatch:', noMatch.length);
      setCommitAuditResults({ linked, noMatch, totalCommits: allCommits.length, days: auditDays, ranAt: new Date().toISOString() });
    } catch (err) {
      console.error('[CommitAudit] failed:', err);
      alert(`Commit audit failed: ${err.message}`);
    } finally {
      setCommitAuditRunning(false);
    }
  };

  const linkNoMatchCommitToTicket = async (ticket, noMatchEntry) => {
    const entry = {
      sha: noMatchEntry.sha?.slice(0, 7) || noMatchEntry.sha,
      message: noMatchEntry.msg || '',
      url: noMatchEntry.url || null,
      linkedAt: noMatchEntry.date || new Date().toISOString(),
      autoLinked: false
    };
    try {
      const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId);
      const updatedCommits = [...(ticket.linkedCommits || []), entry];
      await updateDoc(logRef, { linkedCommits: updatedCommits });
      setWorkQueue(prev => {
        const next = prev.map(t =>
          t.logId === ticket.logId ? { ...t, linkedCommits: updatedCommits } : t
        );
        workQueueRef.current = next;
        _wqCache = next;
         _saveOpenCache(next, _costsCache);
        return next;
      });
      setCommitAuditResults(prev => prev ? {
        ...prev,
        noMatch: prev.noMatch.filter(c => (c.sha?.slice(0, 7) || c.sha) !== entry.sha)
      } : null);
      setLinkingNoMatchSha(null);
      setSelectedLogIdForNoMatch('');
    } catch (err) {
      console.error('[linkNoMatchCommitToTicket]', err);
    }
  };

  const saveAdminNotes = async (notes) => {
    const ticket = selectedTicketRef.current;
    const queueItem = selectedQueueItemRef.current;
    if (!ticket && !queueItem) return;
    setSaving(true);
    try {
      if (queueItem?.kind === 'feedback' && queueItem.raw?.id) {
        await updateFeedback(queueItem.raw.id, { adminNotes: notes });
        patchFeedbackMeta(queueItem.raw.id, { adminNotes: notes });
        setSelectedTicket((prev) => (prev ? { ...prev, adminNotes: notes } : null));
      } else if (ticket?.logId && !ticket?._isFeedback) {
        const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId);
        await updateDoc(logRef, { adminNotes: notes });
        setWorkQueue((prev) =>
          prev.map((t) => (t.logId === ticket.logId ? { ...t, adminNotes: notes } : t))
        );
        setSelectedTicket((prev) => (prev ? { ...prev, adminNotes: notes } : null));
      }
    } catch (error) {
      console.error('Failed to save notes:', error);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!selectedTicket || adminNotes === selectedTicket.adminNotes) return;
    
    const timer = setTimeout(() => {
      saveAdminNotes(adminNotes);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, [adminNotes, selectedTicket, saveAdminNotes]);

  const sendMessage = async () => {
    if (!selectedTicket || !customMessage.trim()) return;

    const ticketId = String(
      selectedTicket.ticketId ||
      selectedQueueItem?.raw?.ticketId ||
      selectedQueueItem?.raw?._rawFeedback?.linkedTicketId ||
      ''
    ).trim();
    if (!ticketId) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: {
          message: 'This report isn’t linked to a support ticket, so the reply can’t be sent.',
          type: 'error',
        },
      }));
      return;
    }

    const logId = selectedTicket.logId || selectedQueueItem?.raw?.logId || null;
    const sentText = customMessage.trim();

    setSending(true);
    try {
      const firestore = getFirestore();
      const messagesRef = collection(firestore, 'supportTickets', ticketId, 'messages');

      await addDoc(messagesRef, {
        message: sentText,
        text: sentText,
        senderType: 'admin',
        senderName: 'The Pep Planner Team',
        senderEmail: 'support@thepepplanner.com',
        createdAt: serverTimestamp(),
        sentVia: 'work-queue'
      });

      const ticketRef = doc(firestore, 'supportTickets', ticketId);
      await updateDoc(ticketRef, {
        lastMessageAt: serverTimestamp(),
        lastAdminMessageAt: serverTimestamp(),
        status: 'in-progress'
      });

      if (logId) {
        const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, logId);
        await updateDoc(logRef, {
          followUpSent: true,
          followUpMessage: sentText,
          followUpAt: serverTimestamp()
        });

        setWorkQueue(prev => prev.map(t =>
          t.logId === logId
            ? { ...t, followUpSent: true, followUpMessage: sentText }
            : t
        ));
      }

      setSelectedTicket(prev => (prev
        ? { ...prev, ticketId, followUpSent: true, followUpMessage: sentText }
        : prev
      ));

      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Message sent! 📨', type: 'success' }
      }));

      setCustomMessage('');
    } catch (error) {
      console.error('Failed to send message:', error);
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Failed to send message', type: 'error' }
      }));
    } finally {
      setSending(false);
    }
  };

  const closeTicket = async () => {
    if (!selectedTicket?.logId) return;
    
    setSending(true);
    try {
      // 1. Call cloud function if ticketId is available (updates supportTickets doc)
      if (selectedTicket.ticketId) {
        let cfOk = false;
        try {
          await closeSupportTicketFromWorkQueue(
            selectedTicket.ticketId,
            selectedTicket.logId,
            adminNotes
          );
          cfOk = true;
        } catch (cfErr) {
          console.warn('[closeTicket] cloud function failed, falling back to direct Firestore update:', cfErr);
        }

        // Always patch the user-facing ticket doc — admin rules allow this even if CF partially failed
        try {
          await updateDoc(doc(db, 'supportTickets', selectedTicket.ticketId), {
            status: 'closed',
            closedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            userReadAt: null,
            customerReopened: false,
            reopenedByUser: false,
          });
        } catch (ticketErr) {
          if (!cfOk) {
            console.error('[closeTicket] supportTickets update failed:', ticketErr);
            throw ticketErr;
          }
          console.warn('[closeTicket] supportTickets update failed after CF success:', ticketErr);
        }
      }

      // 2. Always mark the primary log entry as fixed in Firestore
      const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, selectedTicket.logId);
      await updateDoc(logRef, { markedFixed: true, markedFixedAt: serverTimestamp(), adminNotes });

      // 3. Mark all sibling log entries with the same ticketId as fixed
      //    (prevents them from reappearing when onSnapshot refires)
      if (selectedTicket.ticketId) {
        const siblingQ = query(collection(db, COLLECTIONS.USER_REPORTS_QUEUE), where('ticketId', '==', selectedTicket.ticketId));
        const siblingSnap = await getDocs(siblingQ);
        await Promise.all(
          siblingSnap.docs
            .filter(d => d.id !== selectedTicket.logId)
            .map(d => updateDoc(d.ref, { markedFixed: true, markedFixedAt: serverTimestamp() }))
        );
      }

      // 4. Update local state immediately so UI doesn't flicker
      applyClosedToLocalQueue(selectedTicket);

      const closed = { ticketId: selectedTicket.ticketId, ticketNumber: selectedTicket.ticketNumber };
      returnToReportsList();
      setJustClosedTicket(closed);
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: `#${selectedTicket.ticketNumber} closed`, type: 'success' }
      }));
    } catch (error) {
      console.error('Failed to close ticket:', error);
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: error?.message || 'Failed to close ticket', type: 'error' }
      }));
    } finally {
      setSending(false);
    }
  };

  const copyUserId = () => {
    const uid = selectedTicket?.userAccountInfo?.userId || selectedTicket?.userAccountInfo?.uid || selectedTicket?.userAccountInfo?.id;
    if (!uid) return;
    navigator.clipboard.writeText(uid);
    setUidCopySuccess(true);
    window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'User ID copied!', type: 'success' } }));
    setTimeout(() => setUidCopySuccess(false), 2000);
  };

  const reopenTicket = async (ticket) => {
    try {
      const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId);
      await updateDoc(logRef, { markedFixed: false, markedFixedAt: null });
      const reopened = { ...ticket, markedFixed: false, markedFixedAt: null };
      setClosedQueue((prev) => {
        const next = prev.filter((t) => t.logId !== ticket.logId);
        _wqClosedCache = next;
        _saveClosedCache(next);
        return next;
      });
      setWorkQueue((prev) => {
        const next = [...prev.filter((t) => t.logId !== ticket.logId), reopened];
        _wqCache = next;
        _costsCache = computeCostsFromTickets(next);
        _saveOpenCache(next, _costsCache);
        return next;
      });
      setClosedCountHint((c) => (typeof c === 'number' && c > 0 ? c - 1 : c));
    } catch (error) {
      console.error('Failed to reopen:', error);
    }
  };

  const feedbackDocFromQueueItem = (item) => {
    const raw = item?.raw;
    return raw?._rawFeedback || raw;
  };

  const applyClosedToLocalQueue = (ticket) => {
    const closedItem = { ...ticket, markedFixed: true, markedFixedAt: new Date() };
    setWorkQueue((prev) => {
      const next = prev.filter(
        (t) => !(t.logId === ticket.logId || (ticket.ticketId && t.ticketId === ticket.ticketId))
      );
      _wqCache = next;
      _costsCache = computeCostsFromTickets(next);
      _saveOpenCache(next, _costsCache);
      setCosts(_costsCache);
      return next;
    });
    setClosedQueue((prev) => {
      const next = [closedItem, ...prev.filter((t) => t.logId !== ticket.logId)];
      _wqClosedCache = next;
      _saveClosedCache(next);
      return next;
    });
    setClosedCountHint((c) => (typeof c === 'number' ? c + 1 : c));
  };

  const closeTicketInline = async (ticket, e, options = {}) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const silent = options.silent === true;
    const notes = typeof options.notes === 'string' ? options.notes : '';
    if (!ticket?.logId) {
      if (!silent) {
        window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Cannot close: missing queue log id', type: 'error' } }));
      }
      return;
    }
    try {
      if (ticket.ticketId) {
        try {
          await closeSupportTicketFromWorkQueue(ticket.ticketId, ticket.logId, notes);
        } catch (cfErr) {
          console.warn('[closeTicketInline] cloud close failed, updating logs in Firestore:', cfErr);
        }
      }

      const logRef = doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId);
      await updateDoc(logRef, {
        markedFixed: true,
        markedFixedAt: serverTimestamp(),
        ...(notes ? { adminNotes: notes } : {}),
      });

      if (ticket.ticketId) {
        const siblingQ = query(collection(db, COLLECTIONS.USER_REPORTS_QUEUE), where('ticketId', '==', ticket.ticketId));
        const siblingSnap = await getDocs(siblingQ);
        await Promise.all(
          siblingSnap.docs
            .filter(d => d.id !== ticket.logId)
            .map(d => updateDoc(d.ref, { markedFixed: true, markedFixedAt: serverTimestamp() }))
        );
      }

      applyClosedToLocalQueue(ticket);
      if (!silent) {
        window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: `#${ticket.ticketNumber} closed`, type: 'success' } }));
      }
    } catch (err) {
      console.error('[closeTicketInline] failed:', err);
      if (!silent) {
        window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err?.message || 'Failed to close', type: 'error' } }));
      }
      throw err;
    }
  };

  const closeQueueItem = async (item, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      if (item.kind === 'support') {
        await closeTicketInline(item.raw, e);
      } else if (onFeedbackMarkResolved) {
        const fb = feedbackDocFromQueueItem(item);
        if (!fb?.id) {
          window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Cannot resolve: missing feedback id', type: 'error' } }));
          return;
        }
        await onFeedbackMarkResolved(fb);
      }
    } catch (err) {
      console.error('[closeQueueItem] failed:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err?.message || 'Action failed', type: 'error' } }));
    }
  };

  const closeAllForUser = async (items, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    let closed = 0;
    let failed = 0;
    for (const item of items) {
      try {
        if (item.kind === 'support') {
          const ticket = item.raw;
          if (!ticket?.logId) { failed++; continue; }
          if (ticket.ticketId) {
            try {
              await closeSupportTicketFromWorkQueue(ticket.ticketId, ticket.logId, '');
            } catch (cfErr) {
              console.warn('[closeAllForUser] cloud close failed:', cfErr);
            }
          }
          await updateDoc(doc(db, COLLECTIONS.USER_REPORTS_QUEUE, ticket.logId), {
            markedFixed: true,
            markedFixedAt: serverTimestamp(),
          });
          if (ticket.ticketId) {
            const siblingQ = query(collection(db, COLLECTIONS.USER_REPORTS_QUEUE), where('ticketId', '==', ticket.ticketId));
            const siblingSnap = await getDocs(siblingQ);
            await Promise.all(
              siblingSnap.docs
                .filter(d => d.id !== ticket.logId)
                .map(d => updateDoc(d.ref, { markedFixed: true, markedFixedAt: serverTimestamp() }))
            );
          }
          applyClosedToLocalQueue(ticket);
          closed++;
        } else if (onFeedbackMarkResolved) {
          const fb = feedbackDocFromQueueItem(item);
          if (!fb?.id) { failed++; continue; }
          await onFeedbackMarkResolved(fb);
          closed++;
        }
      } catch (err) {
        failed++;
        console.error('closeAllForUser item failed:', err);
      }
    }
    const msg = failed > 0
      ? `Closed ${closed} item(s); ${failed} failed`
      : `Closed ${closed} item(s) for this user`;
    window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: msg, type: failed > 0 ? 'warning' : 'success' } }));
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = date?.toDate?.() || new Date(date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatRelativeTime = (date) => {
    if (!date) return '';
    const d = date?.toDate?.() || new Date(date);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(date);
  };

  const renderDateChip = (date) => {
    if (!date) return null;
    const d = date instanceof Date ? date : (date?.toDate?.() || new Date(date));
    if (!d || isNaN(d.getTime())) return null;
    const label = formatRelativeTime(d);
    const diffDays = Math.floor((new Date() - d) / (1000 * 60 * 60 * 24));
    let bg, fg;
    if (diffDays === 0) { bg = '#D1FAE5'; fg = '#065F46'; }
    else if (diffDays <= 2) { bg = '#FEF9C3'; fg = '#854D0E'; }
    else if (diffDays <= 6) { bg = '#FED7AA'; fg = '#9A3412'; }
    else { bg = '#F1F5F9'; fg = '#475569'; }
    return (
      <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '10px', fontWeight: '700', backgroundColor: bg, color: fg, whiteSpace: 'nowrap' }}>
        📅 {label}
      </span>
    );
  };

  const handleFeedbackReplyInQueue = async (feedbackItem) => {
    if (!feedbackReplyText.trim() || !onFeedbackReply) return;
    setSendingFeedbackReply(true);
    try {
      await onFeedbackReply(feedbackItem._rawFeedback, feedbackReplyText.trim());
      setReplyingToFeedbackId(null);
      setFeedbackReplyText('');
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Message sent! User will see it as "From the Team".', type: 'success' } }));
    } catch (err) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err?.message || 'Failed to send', type: 'error' } }));
    } finally {
      setSendingFeedbackReply(false);
    }
  };


  if (loading) {
    return <AdminLoader theme={t} message="Loading user reports…" />;
  }

  if (loadError) {
    return (
      <div style={{ padding: '32px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚠️</div>
        <div style={{ fontWeight: '600', color: '#DC2626', marginBottom: '6px' }}>User reports failed to load</div>
        <div style={{ fontSize: '12px', color: t.textLight, marginBottom: '16px', fontFamily: 'monospace', backgroundColor: '#FEF2F2', padding: '8px 12px', borderRadius: '6px', display: 'inline-block' }}>
          {loadError}
        </div>
        <div style={{ fontSize: '12px', color: t.textLight }}>
          Check Firestore rules for <code>{COLLECTIONS.USER_REPORTS_QUEUE}</code> (User Reports Queue) collection, then refresh the page.
        </div>
      </div>
    );
  }

  const formatRelativeTimeMs = (dateMs) => {
    if (!dateMs) return '';
    return formatRelativeTime(new Date(dateMs));
  };

  const reopenedBanner = reopenedTickets.length > 0 ? (
    <div style={{ padding: '10px 14px', backgroundColor: '#FFF7ED', borderBottom: '1px solid #FED7AA', fontSize: '12px', color: '#92400E' }}>
      <strong>{reopenedTickets.length}</strong> reopened ticket(s) waiting for Ghosty — they will appear in Open shortly.
    </div>
  ) : null;

  const toolsContent = (
    <WorkQueueToolsPanels
      t={t}
      GH_CONFIG={GH_CONFIG}
      showBacklogScan={showBacklogScan}
      setShowBacklogScan={setShowBacklogScan}
      backlogScanning={backlogScanning}
      runBacklogScan={runBacklogScan}
      backlogResults={backlogResults}
      expandedBacklogItems={expandedBacklogItems}
      toggleBacklogItem={toggleBacklogItem}
      backlogMessages={backlogMessages}
      showAddMissed={showAddMissed}
      setShowAddMissed={setShowAddMissed}
      addMissedSearch={addMissedSearch}
      setAddMissedSearch={setAddMissedSearch}
      searchMissedTicket={searchMissedTicket}
      addMissedSearching={addMissedSearching}
      addMissedError={addMissedError}
      addMissedResult={addMissedResult}
      addMissedTicketToQueue={addMissedTicketToQueue}
      addMissedAdding={addMissedAdding}
      showCommitAudit={showCommitAudit}
      setShowCommitAudit={setShowCommitAudit}
      commitAuditDays={commitAuditDays}
      setCommitAuditDays={setCommitAuditDays}
      commitAuditRunning={commitAuditRunning}
      runCommitAudit={runCommitAudit}
      commitAuditResults={commitAuditResults}
      setCommitAuditResults={setCommitAuditResults}
      workQueue={workQueue}
      linkingNoMatchSha={linkingNoMatchSha}
      setLinkingNoMatchSha={setLinkingNoMatchSha}
      selectedLogIdForNoMatch={selectedLogIdForNoMatch}
      setSelectedLogIdForNoMatch={setSelectedLogIdForNoMatch}
      linkNoMatchCommitToTicket={linkNoMatchCommitToTicket}
      openTicket={openTicket}
    />
  );

  const isFeedbackSelected = selectedQueueItem?.kind === 'feedback';

  return (
    <div style={{ padding: 0, width: '100%', maxWidth: '100%', height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', flex: 1, boxSizing: 'border-box' }}>
      <UserReportsInbox
        theme={t}
        typeCounts={typeCounts}
        showHistory={showHistory}
        setShowHistory={setShowHistory}
        openCount={openCount}
        closedCount={closedCount}
        filteredItems={filteredItems}
        selectedUserEmail={selectedUserEmail}
        onSelectUser={selectUser}
        selectedQueueItem={selectedQueueItem}
        onSelectItem={selectQueueItem}
        selectedTicket={selectedTicket}
        ticketMessages={allMessages}
        fromTheTeamMessages={fromTheTeamMessages}
        fromTheTeamLoading={fromTheTeamLoading}
        formatRelativeTime={formatRelativeTimeMs}
        getTierBadge={getTierBadge}
        showTools={showTools}
        setShowTools={setShowTools}
        toolsContent={toolsContent}
        reopenedBanner={reopenedBanner}
        adminStatus={adminStatus ?? selectedTicket?.adminStatus}
        adminStatusOptions={ADMIN_STATUS_OPTIONS}
        onStatusChange={saveAdminStatus}
        quickResponses={QUICK_RESPONSES}
        onQuickResponse={handleQuickResponse}
        customMessage={customMessage}
        setCustomMessage={setCustomMessage}
        onSendReply={handleSendReplyUnified}
        sending={sending || sendingFeedbackReply}
        adminNotes={adminNotes}
        setAdminNotes={setAdminNotes}
        savingNotes={saving}
        onCloseTicket={handleCloseFromPanel}
        closingTicket={closingTicket || sending}
        closeArmed={closeArmed}
        setCloseArmed={setCloseArmed}
        deleteArmed={deleteArmed}
        setDeleteArmed={setDeleteArmed}
        onDelete={handleDeleteFromPanel}
        deleting={deletingReport}
        onMarkReviewed={isFeedbackSelected && onFeedbackMarkReviewed ? handleMarkReviewedPanel : null}
        markingReviewed={markingReviewed}
        onMarkUnread={selectedQueueItem ? () => markItemUnread(selectedQueueItem) : null}
        onMarkRead={selectedQueueItem ? () => markItemRead(selectedQueueItem) : null}
        selectedIsUnread={Boolean(selectedQueueItem?.unread)}
        isFeedback={isFeedbackSelected}
        conversationEndRef={conversationEndRef}
        plainStatusLabel={plainStatusLabel}
        selectedUser={selectedUser}
        hasSelectedUser={hasSelectedUser}
        isLoadingUserDetails={isLoadingUserDetails}
        userSelectionError={userSelectionError}
        activeReportContext={activeReportContext}
        onAccountClose={clearSelectedUser}
        onExtendTrial={handleExtendTrial}
        isExtendingTrial={isExtendingTrial}
      />

      {justClosedTicket && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001,
            padding: '16px',
          }}
          onClick={() => setJustClosedTicket(null)}
        >
          <div
            style={{
              backgroundColor: t.cardBackground,
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '360px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
              border: `1px solid ${t.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '20px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: t.text }}>Ticket closed</h3>
              <p style={{ margin: '8px 0 0', fontSize: '14px', color: t.textLight }}>#{justClosedTicket.ticketNumber}</p>
            </div>
            <button
              type="button"
              onClick={() => setJustClosedTicket(null)}
              style={{
                width: '100%',
                padding: '10px 16px',
                backgroundColor: t.primary,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Done
            </button>
          </div>
        </div>
      )}

    </div>
  );
}

