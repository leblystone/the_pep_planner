import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  collection, query, orderBy, limit, onSnapshot, doc,
  where, getDocs, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import {
  PaperPlaneTilt, CaretLeft, CheckCircle, ArrowsClockwise,
  ChatCircle, SignOut, Envelope, Clock,
} from '@phosphor-icons/react';
import { db, auth } from '../config/firebase';
import { COLLECTIONS } from '../config/collections';
import {
  loginUser, addTicketMessage, updateTicketStatus, subscribeToTicketMessages,
} from '../services/firebase';
import {
  isAdminPanelEmail,
  isAdminMfaFresh,
  markAdminMfaVerified,
  clearAdminMfaSession,
} from '../utils/adminSession';
import { getTwoFactorSettings, verifyAndConsumeBackupCode } from '../services/twoFactorAuth';
import { verifyTOTPCode, isValidCodeFormat } from '../utils/totp';

// Standalone, mobile-first admin support inbox.
// Kept intentionally lightweight: it does NOT mount AdminProvider (which eagerly
// loads analytics, users, shop, lifetime, gifts, etc). It only reads open support
// tickets so it opens fast on a phone. Replies go through the addTicketMessage
// cloud function so the user still gets the normal in-app + email + push reply.

const THEME = {
  bg: '#f5f5f0',
  card: '#ffffff',
  border: '#dde6de',
  text: '#2f3b3a',
  textLight: '#6b7d7a',
  primary: '#4a7c59',
  primaryDark: '#2d5a3a',
  send: '#a0522d',
  danger: '#b3261e',
  userBubble: '#eef2ee',
  adminBubble: '#4a7c59',
};

const QUICK_REPLIES = [
  { id: 'working', label: 'Working on it', message: "We're actively working on this and will update you as soon as we have more info!\n\nThe Pep Planner Team" },
  { id: 'resolved', label: 'Resolved', message: "Great news - this has been fixed! Give it a try and let us know if you run into anything else.\n\nThe Pep Planner Team" },
  { id: 'need-info', label: 'Need info', message: "Could you share a bit more detail? A screenshot or steps to reproduce would help us track this down faster.\n\nThe Pep Planner Team" },
  { id: 'known', label: 'Known issue', message: "We've identified this as a known issue and it's on our fix list. Thanks for the report - we'll update you when it's resolved!\n\nThe Pep Planner Team" },
];

const CLOSED_STATUSES = new Set(['closed', 'resolved']);

function toMs(ts) {
  if (!ts) return 0;
  if (typeof ts === 'number') return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  const sec = ts.seconds ?? ts._seconds;
  if (typeof sec === 'number') {
    const nano = ts.nanoseconds ?? ts._nanoseconds ?? 0;
    return sec * 1000 + Math.floor(nano / 1e6);
  }
  return 0;
}

function relTime(ts) {
  const ms = toMs(ts);
  if (!ms) return '';
  const s = (Date.now() - ms) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function MobileSupport() {
  const [searchParams, setSearchParams] = useSearchParams();

  // ---- Auth ----
  const [authState, setAuthState] = useState('checking'); // checking | out | in | mfa
  const [adminEmail, setAdminEmail] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [mfaPending, setMfaPending] = useState(null); // { uid, password }
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [verifyingMfa, setVerifyingMfa] = useState(false);

  // ---- Data ----
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(searchParams.get('ticketId') || null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [closing, setClosing] = useState(false);
  const [flash, setFlash] = useState(null);

  const endRef = useRef(null);

  const showFlash = useCallback((message, type = 'success') => {
    setFlash({ message, type });
    setTimeout(() => setFlash(null), 2600);
  }, []);

  // Keep admin auth in sync with Firebase Auth + 3-day MFA session
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const allowed = user && isAdminPanelEmail(user.email);
      const fresh = allowed && isAdminMfaFresh(user.uid);
      if (fresh) {
        setAuthState('in');
        setAdminEmail(user.email.toLowerCase());
        setMfaPending(null);
        return;
      }
      if (!user) {
        clearAdminMfaSession();
        setMfaPending(null);
        setAuthState('out');
        setAdminEmail('');
        return;
      }
      // Signed in but MFA not fresh — don't wipe mid-authenticator step
      if (!allowed) {
        clearAdminMfaSession();
        setMfaPending(null);
        setAuthState('out');
        setAdminEmail('');
        return;
      }
      setAdminEmail('');
      setAuthState((prev) => (prev === 'mfa' ? 'mfa' : 'out'));
    });
    return unsub;
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    const lower = email.trim().toLowerCase();
    if (!lower) { setLoginError('Please enter your email'); return; }
    if (!isAdminPanelEmail(lower)) { setLoginError('This email is not authorized'); return; }
    setLoggingIn(true);
    try {
      await loginUser(lower, password);
      const user = auth.currentUser;
      if (!user || user.email?.toLowerCase() !== lower) {
        setLoginError('Authentication failed - please try again');
        return;
      }
      const twoFactorSettings = await getTwoFactorSettings(user.uid, password);
      if (
        !twoFactorSettings?.enabled ||
        twoFactorSettings.method !== 'authenticator' ||
        !twoFactorSettings.secret
      ) {
        setLoginError('Enable authenticator under Account → Security first.');
        clearAdminMfaSession();
        return;
      }
      setMfaSecret(twoFactorSettings.secret);
      setMfaPending({ uid: user.uid, password });
      setMfaCode('');
      setAuthState('mfa');
      setPassword('');
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setLoginError('Incorrect email or password.');
      } else {
        setLoginError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleMfaVerify = async (e) => {
    e.preventDefault();
    if (!mfaPending) return;
    setLoginError('');
    setVerifyingMfa(true);
    try {
      const code = mfaCode.trim();
      let isValid = false;
      if (isValidCodeFormat(code) && mfaSecret) {
        isValid = verifyTOTPCode(mfaSecret, code);
      }
      if (!isValid) {
        isValid = await verifyAndConsumeBackupCode(mfaPending.uid, code, mfaPending.password);
      }
      if (!isValid) {
        setLoginError('Invalid authenticator code.');
        return;
      }
      markAdminMfaVerified(mfaPending.uid);
      setAdminEmail(auth.currentUser?.email?.toLowerCase() || '');
      setMfaPending(null);
      setMfaSecret('');
      setMfaCode('');
      setAuthState('in');
    } catch (err) {
      setLoginError(err.message || 'Verification failed.');
    } finally {
      setVerifyingMfa(false);
    }
  };

  const handleLogout = () => {
    clearAdminMfaSession();
    setMfaPending(null);
    setMfaSecret('');
    auth.signOut().catch(() => {});
  };

  // Subscribe to recent tickets (single-field orderBy = auto-indexed, capped small)
  useEffect(() => {
    if (authState !== 'in') return;
    setTicketsLoading(true);
    const q = query(collection(db, 'supportTickets'), orderBy('lastMessageAt', 'desc'), limit(40));
    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTickets(rows);
      setTicketsLoading(false);
    }, (err) => {
      console.error('MobileSupport tickets error:', err);
      setTicketsLoading(false);
      showFlash('Could not load tickets', 'error');
    });
    return unsub;
  }, [authState, showFlash]);

  // Subscribe to the selected ticket doc + its messages
  useEffect(() => {
    if (authState !== 'in' || !selectedId) {
      setSelectedTicket(null);
      setMessages([]);
      return;
    }
    const unsubDoc = onSnapshot(doc(db, 'supportTickets', selectedId), (d) => {
      setSelectedTicket(d.exists() ? { id: d.id, ...d.data() } : null);
    });
    const unsubMsgs = subscribeToTicketMessages(selectedId, (msgs) => setMessages(msgs));
    return () => { unsubDoc(); unsubMsgs && unsubMsgs(); };
  }, [authState, selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedId]);

  const openTicket = (id) => {
    setSelectedId(id);
    setReply('');
    setSearchParams({ ticketId: id }, { replace: true });
  };

  const backToList = () => {
    setSelectedId(null);
    setReply('');
    setSearchParams({}, { replace: true });
  };

  const sendReply = async (text) => {
    const msg = (text ?? reply).trim();
    if (!msg || !selectedTicket) return;
    setSending(true);
    try {
      // Cloud function: writes the message AND sends the user email + push reply.
      await addTicketMessage({
        ticketId: selectedTicket.id,
        senderType: 'admin',
        senderEmail: adminEmail || 'support@thepepplanner.com',
        senderName: 'The Pep Planner Team',
        message: msg,
      });
      setReply('');
      showFlash('Reply sent');
    } catch (err) {
      console.error('Failed to send reply:', err);
      showFlash(err.message || 'Failed to send', 'error');
    } finally {
      setSending(false);
    }
  };

  const resolveTicket = async () => {
    if (!selectedTicket) return;
    setClosing(true);
    try {
      await updateTicketStatus(selectedTicket.id, 'resolved');
      // Keep the desktop Work Queue in sync (it builds from ai_worker_logs).
      try {
        const logsSnap = await getDocs(
          query(collection(db, COLLECTIONS.USER_REPORTS_QUEUE), where('ticketId', '==', selectedTicket.id))
        );
        await Promise.all(
          logsSnap.docs.map((d) => updateDoc(d.ref, { markedFixed: true, markedFixedAt: serverTimestamp() }))
        );
      } catch (e) {
        console.warn('Could not sync work queue logs:', e?.message);
      }
      showFlash('Ticket resolved');
      backToList();
    } catch (err) {
      console.error('Failed to resolve ticket:', err);
      showFlash(err.message || 'Failed to resolve', 'error');
    } finally {
      setClosing(false);
    }
  };

  const openTickets = tickets.filter((t) => !CLOSED_STATUSES.has((t.status || '').toLowerCase()));

  // ---------- Render ----------
  if (authState === 'checking') {
    return (
      <div style={{ ...styles.screen, alignItems: 'center', justifyContent: 'center' }}>
        <ArrowsClockwise size={28} className="animate-spin" style={{ color: THEME.primary }} />
      </div>
    );
  }

  if (authState === 'out' || authState === 'mfa') {
    return (
      <div style={{ ...styles.screen, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        {authState === 'mfa' ? (
          <form onSubmit={handleMfaVerify} style={styles.loginCard}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <ChatCircle size={40} weight="duotone" style={{ color: THEME.primary }} />
              <h1 style={{ fontSize: 18, fontWeight: 800, color: THEME.text, margin: '10px 0 2px' }}>Support Inbox</h1>
              <p style={{ fontSize: 13, color: THEME.textLight, margin: 0 }}>Authenticator code</p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, '').slice(0, 12))}
              placeholder="6-digit code"
              style={{ ...styles.input, textAlign: 'center', letterSpacing: '0.2em', fontWeight: 700 }}
              required
              disabled={verifyingMfa}
              autoFocus
            />
            {loginError && <div style={styles.errorBox}>{loginError}</div>}
            <button type="submit" disabled={verifyingMfa || !mfaCode.trim()} style={styles.primaryBtn}>
              {verifyingMfa ? 'Verifying…' : 'Verify & enter'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthState('out');
                setMfaPending(null);
                setMfaSecret('');
                setMfaCode('');
                setLoginError('');
                clearAdminMfaSession();
              }}
              style={{ ...styles.primaryBtn, background: 'transparent', color: THEME.textLight, marginTop: 8, boxShadow: 'none' }}
            >
              Back
            </button>
          </form>
        ) : (
          <form onSubmit={handleLogin} style={styles.loginCard}>
            <div style={{ textAlign: 'center', marginBottom: 18 }}>
              <ChatCircle size={40} weight="duotone" style={{ color: THEME.primary }} />
              <h1 style={{ fontSize: 18, fontWeight: 800, color: THEME.text, margin: '10px 0 2px' }}>Support Inbox</h1>
              <p style={{ fontSize: 13, color: THEME.textLight, margin: 0 }}>Password + authenticator · 3-day session</p>
            </div>
            <input
              type="email" inputMode="email" autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="Admin email" style={styles.input} required disabled={loggingIn}
            />
            <input
              type="password" autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Password" style={styles.input} required disabled={loggingIn}
            />
            {loginError && <div style={styles.errorBox}>{loginError}</div>}
            <button type="submit" disabled={loggingIn} style={styles.primaryBtn}>
              {loggingIn ? 'Signing in…' : 'Continue'}
            </button>
          </form>
        )}
      </div>
    );
  }

  // Detail view
  if (selectedId) {
    const t = selectedTicket;
    return (
      <div style={styles.screen}>
        <header style={styles.header}>
          <button onClick={backToList} style={styles.iconBtn} aria-label="Back">
            <CaretLeft size={22} style={{ color: THEME.text }} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={styles.headerTitle}>{t?.subject || t?.ticketNumber || 'Ticket'}</div>
            <div style={styles.headerSub}>
              <Envelope size={12} /> {t?.userEmail || 'unknown'}
            </div>
          </div>
          <button onClick={resolveTicket} disabled={closing} style={styles.resolveBtn}>
            <CheckCircle size={16} weight="fill" /> {closing ? '…' : 'Resolve'}
          </button>
        </header>

        <div style={styles.thread}>
          {messages.length === 0 && (
            <div style={styles.emptyThread}>No messages yet.</div>
          )}
          {messages.map((m) => {
            const isAdmin = m.senderType === 'admin';
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
                <div style={{ ...styles.bubble, ...(isAdmin ? styles.bubbleAdmin : styles.bubbleUser) }}>
                  <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {m.message || m.text || ''}
                  </div>
                  <div style={{ ...styles.bubbleTime, color: isAdmin ? 'rgba(255,255,255,0.7)' : THEME.textLight }}>
                    {relTime(m.createdAt)}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div style={styles.composer}>
          <div style={styles.quickRow}>
            {QUICK_REPLIES.map((q) => (
              <button key={q.id} onClick={() => sendReply(q.message)} disabled={sending} style={styles.quickChip}>
                {q.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              value={reply} onChange={(e) => setReply(e.target.value)}
              placeholder="Type a reply…" rows={1} style={styles.replyInput}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(); }
              }}
            />
            <button onClick={() => sendReply()} disabled={sending || !reply.trim()} style={styles.sendBtn} aria-label="Send">
              <PaperPlaneTilt size={20} weight="fill" />
            </button>
          </div>
        </div>

        {flash && <div style={{ ...styles.flash, background: flash.type === 'error' ? THEME.danger : THEME.primaryDark }}>{flash.message}</div>}
      </div>
    );
  }

  // List view
  return (
    <div style={styles.screen}>
      <header style={styles.header}>
        <div style={{ flex: 1 }}>
          <div style={styles.headerTitle}>Support Inbox</div>
          <div style={styles.headerSub}>{openTickets.length} open</div>
        </div>
        <button onClick={handleLogout} style={styles.iconBtn} aria-label="Sign out">
          <SignOut size={20} style={{ color: THEME.textLight }} />
        </button>
      </header>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {ticketsLoading ? (
          <div style={styles.centerNote}>
            <ArrowsClockwise size={22} className="animate-spin" style={{ color: THEME.primary }} />
          </div>
        ) : openTickets.length === 0 ? (
          <div style={styles.centerNote}>
            <CheckCircle size={30} weight="duotone" style={{ color: THEME.primary }} />
            <div style={{ marginTop: 8 }}>All caught up.</div>
          </div>
        ) : (
          openTickets.map((t) => {
            const waiting = toMs(t.lastMessageAt) > toMs(t.lastAdminMessageAt);
            return (
              <button key={t.id} onClick={() => openTicket(t.id)} style={styles.listItem}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {waiting && <span style={styles.unreadDot} />}
                  <span style={styles.listSubject}>{t.subject || t.ticketNumber || 'Support request'}</span>
                </div>
                <div style={styles.listMeta}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.userEmail || 'unknown'}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                    <Clock size={11} /> {relTime(t.lastMessageAt)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {flash && <div style={{ ...styles.flash, background: flash.type === 'error' ? THEME.danger : THEME.primaryDark }}>{flash.message}</div>}
    </div>
  );
}

const styles = {
  screen: {
    display: 'flex', flexDirection: 'column',
    height: '100vh', maxWidth: 640, margin: '0 auto',
    background: THEME.bg, color: THEME.text,
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    position: 'relative',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '12px 14px', background: THEME.card,
    borderBottom: `1px solid ${THEME.border}`, position: 'sticky', top: 0, zIndex: 5,
  },
  headerTitle: { fontSize: 16, fontWeight: 800, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  headerSub: { fontSize: 12, color: THEME.textLight, display: 'flex', alignItems: 'center', gap: 4 },
  iconBtn: { background: 'transparent', border: 'none', padding: 6, cursor: 'pointer', display: 'inline-flex' },
  resolveBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
    background: THEME.primary, color: '#fff', border: 'none',
    padding: '8px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  listItem: {
    display: 'block', width: '100%', textAlign: 'left',
    padding: '14px 16px', background: THEME.card, border: 'none',
    borderBottom: `1px solid ${THEME.border}`, cursor: 'pointer',
  },
  listSubject: { fontSize: 15, fontWeight: 700, color: THEME.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  listMeta: { display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4, fontSize: 12, color: THEME.textLight },
  unreadDot: { width: 9, height: 9, borderRadius: 999, background: THEME.send, flexShrink: 0 },
  centerNote: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 48, color: THEME.textLight, fontSize: 14 },
  thread: { flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  emptyThread: { textAlign: 'center', color: THEME.textLight, fontSize: 13, padding: 24 },
  bubble: { maxWidth: '82%', padding: '10px 12px', borderRadius: 14, fontSize: 14, lineHeight: 1.4 },
  bubbleUser: { background: THEME.userBubble, color: THEME.text, borderBottomLeftRadius: 4 },
  bubbleAdmin: { background: THEME.adminBubble, color: '#fff', borderBottomRightRadius: 4 },
  bubbleTime: { fontSize: 10, marginTop: 4, textAlign: 'right' },
  composer: { background: THEME.card, borderTop: `1px solid ${THEME.border}`, padding: 10, position: 'sticky', bottom: 0 },
  quickRow: { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8 },
  quickChip: {
    flexShrink: 0, background: THEME.bg, color: THEME.primaryDark,
    border: `1px solid ${THEME.border}`, borderRadius: 999,
    padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  replyInput: {
    flex: 1, resize: 'none', maxHeight: 120,
    border: `1px solid ${THEME.border}`, borderRadius: 18,
    padding: '10px 14px', fontSize: 15, fontFamily: 'inherit', outline: 'none',
    background: THEME.bg, color: THEME.text,
  },
  sendBtn: {
    flexShrink: 0, width: 44, height: 44, borderRadius: 999,
    background: THEME.send, color: '#fff', border: 'none',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  loginCard: {
    width: '100%', maxWidth: 360, background: THEME.card,
    padding: 24, borderRadius: 16, border: `1px solid ${THEME.border}`,
    boxShadow: '0 4px 20px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: 10,
  },
  input: {
    width: '100%', padding: '13px 14px', borderRadius: 10,
    border: `1px solid ${THEME.border}`, fontSize: 15, background: THEME.bg, color: THEME.text, outline: 'none',
  },
  primaryBtn: {
    width: '100%', padding: 13, borderRadius: 10, border: 'none',
    background: THEME.primary, color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 4,
  },
  errorBox: { background: '#b3261e15', color: THEME.danger, border: '1px solid #b3261e30', borderRadius: 10, padding: '10px 12px', fontSize: 13 },
  flash: {
    position: 'fixed', left: '50%', bottom: 90, transform: 'translateX(-50%)',
    color: '#fff', padding: '10px 18px', borderRadius: 999, fontSize: 13, fontWeight: 600,
    boxShadow: '0 4px 14px rgba(0,0,0,0.2)', zIndex: 50,
  },
};
