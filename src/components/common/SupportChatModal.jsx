import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Send, Loader, User, ShieldCheck, RotateCcw, Camera, CheckCheck, MessageSquare } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';
import {
  getFirestore,
  collection,
  doc,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { reopenTicket, closeTicketByUser, getUserTickets } from '../../services/firebase';

/**
 * SupportChatModal — unified chronological thread across ALL of a user's tickets.
 *
 * Props:
 *   ticket        — The "active" ticket (used for the chip entry point; null-safe).
 *                   If allTickets is provided, this is only used to highlight the most
 *                   recent context and mark the reply target.
 *   allTickets    — Optional array of all the user's tickets. When provided the modal
 *                   shows a single merged, chronological thread across all of them.
 *   onClose       — Close handler.
 *   theme         — Theme object from parent.
 *   onMarkRead    — Called when the modal opens to clear the unread badge.
 *   onTicketUpdate — Called after reopen / close so parent can refresh.
 *   embedded      — When true, renders inline (no fixed overlay/backdrop) so it can
 *                   live inside another modal instead of stacking a second one.
 *   allowCollapse — When embedded, whether to show a close/collapse affordance.
 */
export default function SupportChatModal({
  ticket: initialTicket,
  allTickets: allTicketsProp,
  onClose,
  theme,
  onMarkRead,
  onTicketUpdate,
  /** Dev-only: skip Firestore and render these messages instead */
  isDevPreview = false,
  devPreviewMessages = null,
  embedded = false,
  allowCollapse = true,
}) {
  const { user } = useAppContext();

  // All tickets we're threading together
  const [tickets, setTickets] = useState(() => {
    if (allTicketsProp?.length) return allTicketsProp;
    if (initialTicket) return [initialTicket];
    return [];
  });

  // Flat merged messages — each annotated with _ticketId / _ticketNumber / _ticketType
  const [allMessages, setAllMessages] = useState(() => {
    if (isDevPreview && Array.isArray(devPreviewMessages)) {
      const t = allTicketsProp?.[0] || initialTicket;
      return devPreviewMessages.map((m) => ({
        ...m,
        _ticketId: t?.id || 'dev-preview',
        _ticketNumber: t?.ticketNumber || 'PREV01',
        _ticketType: t?.type || 'support',
        _ticketStatus: t?.status || 'open',
      }));
    }
    return [];
  });
  const [loading, setLoading] = useState(!(isDevPreview && Array.isArray(devPreviewMessages)));

  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  const messagesEndRef = useRef(null);
  const messagesByTicket = useRef(new Map());
  const ticketsRef = useRef(tickets);
  ticketsRef.current = tickets;
  const ticketIdsKey = tickets.map((t) => `${t.id}:${t.status || ''}`).join(',');

  const ticketsSignature = (list) =>
    (list || []).map((t) => `${t.id}:${t.status || ''}`).join('|');
  const tsToMs = (ts) => {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts?.toMillis === 'function') return ts.toMillis();
    if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    const sec = ts?.seconds ?? ts?._seconds;
    if (typeof sec === 'number') {
      const nano = ts.nanoseconds ?? ts._nanoseconds ?? 0;
      return sec * 1000 + Math.floor(nano / 1e6);
    }
    return 0;
  };

  // Sync ticket metadata (including status) from parent live inbox subscription.
  useEffect(() => {
    if (!allTicketsProp?.length) return;
    if (ticketsSignature(allTicketsProp) === ticketsSignature(tickets)) return;
    setTickets(allTicketsProp);
  }, [allTicketsProp, tickets]);

  // Live status from Firestore ticket docs (admin close / reopen must reflect immediately).
  const ticketDocIdsKey = tickets.map((t) => t.id).join(',');
  useEffect(() => {
    if (isDevPreview || !ticketDocIdsKey) return undefined;
    const db = getFirestore();
    const ids = ticketDocIdsKey.split(',').filter(Boolean);
    const unsubs = ids.map((ticketId) =>
      onSnapshot(doc(db, 'supportTickets', ticketId), (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? { ...t, ...data, id: ticketId } : t))
        );
      })
    );
    return () => unsubs.forEach((fn) => fn());
  }, [isDevPreview, ticketDocIdsKey]);

  // If no tickets were passed at all, try fetching from Firestore by user email.
  // Skip when embedded — parent deliberately scopes the thread (open ticket vs history).
  useEffect(() => {
    if (isDevPreview || embedded || tickets.length > 0 || !user?.email) return;
    getUserTickets(user.email)
      .then((fetched) => {
        if (fetched?.length) setTickets(fetched);
      })
      .catch(console.error);
  }, [user?.email, tickets.length, isDevPreview, embedded]);

  // Subscribe to messages for ALL tickets simultaneously.
  // Important: do NOT permanently skip tickets via a ref across effect cleanups —
  // React Strict Mode (and ticket-list refreshes) unsubscribe then remount the
  // effect; skipping would leave the thread empty forever ("No messages yet").
  useEffect(() => {
    if (isDevPreview) return undefined;
    if (!tickets.length) {
      setAllMessages([]);
      setLoading(false);
      return undefined;
    }

    const db = getFirestore();
    const unsubscribers = [];
    let cancelled = false;
    setLoading(true);
    messagesByTicket.current.clear();

    const rebuild = () => {
      if (cancelled) return;
      const flat = [];
      for (const msgs of messagesByTicket.current.values()) flat.push(...msgs);
      flat.sort((a, b) => tsToMs(a.createdAt) - tsToMs(b.createdAt));
      setAllMessages(flat);
    };

    for (const ticket of tickets) {
      const messagesRef = collection(db, 'supportTickets', ticket.id, 'messages');
      const q = query(messagesRef, orderBy('createdAt', 'asc'));

      const unsub = onSnapshot(
        q,
        (snapshot) => {
          if (cancelled) return;
          const liveTicket = ticketsRef.current.find((t) => t.id === ticket.id) || ticket;
          const msgs = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
            _ticketId: ticket.id,
            _ticketNumber: liveTicket.ticketNumber || ticket.id.slice(-6).toUpperCase(),
            _ticketType: liveTicket.type || ticket.type || 'support',
            _ticketStatus: liveTicket.status,
          }));
          messagesByTicket.current.set(ticket.id, msgs);
          rebuild();
          setLoading(false);
        },
        (error) => {
          console.error('SupportChatModal message load error:', error);
          if (!cancelled) setLoading(false);
        }
      );
      unsubscribers.push(unsub);
    }

    return () => {
      cancelled = true;
      unsubscribers.forEach((fn) => fn());
      messagesByTicket.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDevPreview, ticketIdsKey]);

  // When ticket status flips (e.g. admin closed), refresh message badges without re-subscribing.
  useEffect(() => {
    if (!tickets.length) return;
    const statusById = new Map(tickets.map((t) => [t.id, t.status]));
    let changed = false;
    for (const [ticketId, msgs] of messagesByTicket.current.entries()) {
      const status = statusById.get(ticketId);
      if (!status || !msgs?.length) continue;
      if (msgs[0]?._ticketStatus === status) continue;
      messagesByTicket.current.set(
        ticketId,
        msgs.map((m) => ({ ...m, _ticketStatus: status }))
      );
      changed = true;
    }
    if (!changed) return;
    const flat = [];
    for (const msgs of messagesByTicket.current.values()) flat.push(...msgs);
    flat.sort((a, b) => tsToMs(a.createdAt) - tsToMs(b.createdAt));
    setAllMessages(flat);
  }, [tickets]);

  // Scroll to bottom whenever messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [allMessages]);

  // Mark as read on open
  useEffect(() => {
    if (onMarkRead) onMarkRead();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The "active" ticket to reply to — open ticket with the most recent message in the merged thread
  const replyTarget = useMemo(() => {
    const isOpen = (t) => t.status === 'new' || t.status === 'in-progress' || t.status === 'open';
    const openTickets = tickets.filter(isOpen);

    if (openTickets.length === 0) {
      return null;
    }

    if (openTickets.length === 1) return openTickets[0];

    let bestTicketId = null;
    let bestMs = -1;
    for (const msg of allMessages) {
      const tid = msg._ticketId;
      if (!openTickets.some((t) => t.id === tid)) continue;
      const ms = tsToMs(msg.createdAt);
      if (ms >= bestMs) {
        bestMs = ms;
        bestTicketId = tid;
      }
    }

    if (bestTicketId) {
      return openTickets.find((t) => t.id === bestTicketId) || openTickets[0];
    }
    return openTickets[0];
  }, [tickets, allMessages]);

  const allClosed = tickets.length > 0 && tickets.every(
    (t) => t.status === 'closed' || t.status === 'resolved'
  );

  const handleSendMessage = async () => {
    if (isDevPreview) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Dev preview — replies are disabled', type: 'info' },
      }));
      return;
    }
    if (!newMessage.trim() || !replyTarget?.id || !user) return;
    setSending(true);
    try {
      const isClosed =
        replyTarget.status === 'closed' || replyTarget.status === 'resolved';
      if (isClosed) {
        await reopenTicket(replyTarget.id);
        if (onTicketUpdate) onTicketUpdate();
      }

      const db = getFirestore();
      const messagesRef = collection(db, 'supportTickets', replyTarget.id, 'messages');
      await addDoc(messagesRef, {
        message: newMessage.trim(),
        text: newMessage.trim(),
        senderType: 'user',
        senderName: user.displayName || user.email,
        senderEmail: user.email,
        createdAt: serverTimestamp(),
      });
      // Keep ticket sorted for admin mobile inbox / work queue
      try {
        await updateDoc(doc(db, 'supportTickets', replyTarget.id), {
          lastMessageAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (_) { /* non-fatal */ }
      // Own message just bumped lastMessageAt — re-seed lastRead so it isn't
      // mistaken for an unread admin/ghost-worker reply (badge/nudge/toast).
      try {
        localStorage.setItem(`ticket_${replyTarget.id}_lastRead`, new Date().toISOString());
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent('tpp:support-inbox-changed'));
      setNewMessage('');
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Message sent!', type: 'success' },
      }));
    } catch (error) {
      console.error('Error sending message:', error);
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Failed to send. Please try again.', type: 'error' },
      }));
    } finally {
      setSending(false);
    }
  };

  const handleReopenTicket = async () => {
    if (isDevPreview) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Dev preview — reopen is disabled', type: 'info' },
      }));
      return;
    }
    const target = tickets.slice().sort((a, b) => {
      const ta = tsToMs(a.lastMessageAt || a.updatedAt || a.createdAt);
      const tb = tsToMs(b.lastMessageAt || b.updatedAt || b.createdAt);
      return tb - ta;
    })[0];
    if (!target?.id || !user) return;
    setReopening(true);
    try {
      await reopenTicket(target.id);
      if (onTicketUpdate) onTicketUpdate();
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Request reopened!', type: 'success' },
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Failed to reopen. Please try again.', type: 'error' },
      }));
    } finally {
      setReopening(false);
    }
  };

  const handleCloseTicket = async () => {
    if (isDevPreview) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Dev preview — close is disabled', type: 'info' },
      }));
      return;
    }
    if (!replyTarget?.id || !user) return;
    setClosing(true);
    try {
      await closeTicketByUser(replyTarget.id);
      setConfirmClose(false);
      if (onTicketUpdate) onTicketUpdate();
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Ticket closed. Thanks for reaching out!', type: 'success' },
      }));
    } catch (error) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Failed to close. Please try again.', type: 'error' },
      }));
    } finally {
      setClosing(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatMsgDate = (ts) => {
    const ms = tsToMs(ts);
    if (!ms) return 'Today';
    const d = new Date(ms);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // TYPE LABEL helpers
  const typeLabel = (type) => {
    if (type === 'bug') return 'Bug Report';
    if (type === 'suggestion') return 'Suggestion';
    return 'Support Request';
  };
  const typeColor = (type) => {
    if (type === 'bug') return { bg: '#FEE2E2', color: '#DC2626' };
    if (type === 'suggestion') return { bg: '#D1FAE5', color: '#065F46' };
    return { bg: '#DBEAFE', color: '#1D4ED8' };
  };

  // Build render list: insert ticket-context dividers when the ticket changes
  const renderItems = useMemo(() => {
    const items = [];
    let lastTicketId = null;
    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      if (msg._ticketId !== lastTicketId) {
        lastTicketId = msg._ticketId;
        const tc = typeColor(msg._ticketType);
        const ticketMsgs = allMessages.filter((m) => m._ticketId === msg._ticketId);
        const firstTs = ticketMsgs[0]?.createdAt;
        items.push({
          type: 'divider',
          key: `divider-${msg._ticketId}`,
          ticketNumber: msg._ticketNumber,
          ticketType: msg._ticketType,
          ticketStatus: msg._ticketStatus,
          tc,
          date: firstTs,
        });
      }
      items.push({ type: 'message', key: msg.id, msg });
    }
    return items;
  }, [allMessages]);

  const messagesContent = (
    <>
      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader size={22} className="animate-spin" style={{ color: theme.primary }} />
          <span className="ml-2 text-sm" style={{ color: theme.textLight }}>Loading…</span>
        </div>
      ) : allMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <MessageSquare size={36} style={{ color: theme.textLight, opacity: 0.3 }} />
          <p className="text-sm text-center" style={{ color: theme.textLight }}>
            No messages yet. Start the conversation below!
          </p>
        </div>
      ) : (
        renderItems.map((item) => {
          if (item.type === 'divider') {
            return (
              <div key={item.key} className="flex items-center gap-3 py-3">
                <div className="flex-1 h-px" style={{ backgroundColor: theme.border }} />
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      padding: '3px 8px',
                      borderRadius: '999px',
                      backgroundColor: item.tc.bg,
                      color: item.tc.color,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {typeLabel(item.ticketType)}
                  </span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: '600',
                      color: theme.textLight,
                    }}
                  >
                    #{item.ticketNumber}
                  </span>
                  {item.date && (
                    <span style={{ fontSize: '11px', color: theme.textLight }}>
                      · {formatMsgDate(item.date)}
                    </span>
                  )}
                  {(item.ticketStatus === 'closed' || item.ticketStatus === 'resolved') && (
                    <span
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '999px',
                        backgroundColor: theme.isDark ? '#ffffff10' : '#00000010',
                        color: theme.textLight,
                      }}
                    >
                      closed
                    </span>
                  )}
                </div>
                <div className="flex-1 h-px" style={{ backgroundColor: theme.border }} />
              </div>
            );
          }

          // Message bubble
          const { msg } = item;
          const isAdmin =
            msg.senderType === 'admin' ||
            msg.senderType === 'ghost-worker' ||
            msg.senderEmail?.includes('admin') ||
            msg.senderEmail?.includes('thepepplanner.com');

          return (
            <div
              key={item.key}
              className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}
            >
              <div
                className={`max-w-[75%] rounded-xl p-3 ${isAdmin ? 'rounded-tl-none' : 'rounded-tr-none'}`}
                style={{
                  backgroundColor: isAdmin ? theme.primary + '15' : theme.accent,
                  borderLeft: isAdmin ? `3px solid ${theme.primary}` : 'none',
                  borderRight: !isAdmin ? `3px solid ${theme.primary}` : 'none',
                }}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {isAdmin ? (
                    <ShieldCheck size={13} style={{ color: theme.primary }} />
                  ) : (
                    <User size={13} style={{ color: theme.primary }} />
                  )}
                  <span className="text-xs font-semibold" style={{ color: theme.primary }}>
                    {isAdmin ? 'The Pep Planner Team' : 'You'}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed" style={{ color: theme.text }}>
                  {msg.message || msg.text}
                </p>
                {msg.imageUrls?.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {msg.imageUrls.map((url, idx) => (
                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer">
                        <img
                          src={url}
                          alt={`Screenshot ${idx + 1}`}
                          className="rounded-lg border"
                          style={{ maxHeight: '200px', objectFit: 'contain', borderColor: theme.border }}
                          loading="lazy"
                        />
                      </a>
                    ))}
                  </div>
                )}
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] opacity-50" style={{ color: theme.textLight }}>
                    {formatMsgDate(msg.createdAt)}
                  </span>
                  {/* Small ticket tag on each message so the reference is always visible */}
                  <span
                    style={{
                      fontSize: '10px',
                      opacity: 0.45,
                      color: theme.textLight,
                      fontFamily: 'monospace',
                    }}
                  >
                    #{msg._ticketNumber}
                  </span>
                </div>
              </div>
            </div>
          );
        })
      )}

      <div ref={messagesEndRef} />
    </>
  );

  const footerContent = allClosed ? (
    /* All tickets closed */
    <div className="space-y-2">
      <p className="text-xs text-center" style={{ color: theme.textLight }}>
        All requests are closed. Need help with something new?
      </p>
      <button
        onClick={handleReopenTicket}
        disabled={reopening}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
        style={{
          backgroundColor: 'transparent',
          color: theme.primary,
          border: `1px solid ${theme.primary}40`,
        }}
      >
        {reopening ? <Loader size={14} className="animate-spin" /> : <RotateCcw size={14} />}
        Reopen most recent request
      </button>
    </div>
  ) : (
    /* Active reply area */
    <>
      {replyTarget && tickets.length > 1 && (
        <p className="text-[11px] mb-2 opacity-60" style={{ color: theme.textLight }}>
          Replying to #{replyTarget.ticketNumber || replyTarget.id.slice(-6).toUpperCase()}
        </p>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Reply…"
          rows={2}
          className="flex-1 px-3 py-2 rounded-lg border text-sm resize-none"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.background,
            color: theme.text,
          }}
          disabled={sending}
        />
        <button
          onClick={handleSendMessage}
          disabled={!newMessage.trim() || sending}
          className="p-3 rounded-lg flex items-center gap-2 disabled:opacity-50 transition-all"
          style={{ backgroundColor: '#D2691E', color: '#FFFFFF' }}
        >
          {sending ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p className="text-[10px] opacity-60" style={{ color: theme.textLight }}>
          We'll notify you when we respond
        </p>
        {confirmClose ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] opacity-70" style={{ color: theme.textLight }}>Resolved?</span>
            <button
              onClick={handleCloseTicket}
              disabled={closing}
              className="px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 disabled:opacity-50"
              style={{ backgroundColor: (theme.success || '#10B981') + '20', color: theme.success || '#10B981' }}
            >
              {closing ? <Loader size={10} className="animate-spin" /> : <CheckCheck size={10} />}
              Yes
            </button>
            <button
              onClick={() => setConfirmClose(false)}
              disabled={closing}
              className="px-2 py-0.5 rounded text-[10px] font-medium"
              style={{ color: theme.textLight }}
            >
              No
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmClose(true)}
            className="text-[10px] flex items-center gap-1 opacity-60 hover:opacity-90 transition-opacity"
            style={{ color: theme.textLight }}
          >
            <CheckCheck size={10} />
            Issue resolved?
          </button>
        )}
      </div>
    </>
  );

  if (embedded) {
    const isLive = !allClosed;
    return (
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.6)',
        }}
      >
        {/* Compact header */}
        <div
          className="flex items-center justify-between gap-2 px-3.5 py-2.5 flex-shrink-0"
          style={{ borderBottom: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}` }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2 w-2 flex-shrink-0">
              {isLive && (
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
                  style={{ backgroundColor: theme.success || '#16A34A' }}
                />
              )}
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ backgroundColor: isLive ? (theme.success || '#16A34A') : theme.textLight }}
              />
            </span>
            <span className="text-[13px] font-semibold truncate" style={{ color: theme.text }}>
              {tickets.length > 1
                ? `Past conversations · ${tickets.length} threads`
                : replyTarget?.ticketNumber
                  ? `#${replyTarget.ticketNumber} · Support`
                  : 'Support conversation'}
            </span>
            {allClosed && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  color: theme.textLight,
                }}
              >
                closed
              </span>
            )}
          </div>
          {allowCollapse && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:opacity-70 transition-opacity flex-shrink-0"
              style={{ color: theme.textLight }}
              aria-label="Hide conversation"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Messages (compact) */}
        <div
          className="overflow-y-auto px-3.5 py-3 space-y-2.5"
          style={{ maxHeight: 260, backgroundColor: theme.isDark ? 'rgba(0,0,0,0.1)' : 'rgba(0,0,0,0.015)' }}
        >
          {messagesContent}
        </div>

        {/* Footer (compact) */}
        <div
          className="px-3.5 py-3 flex-shrink-0"
          style={{ borderTop: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}` }}
        >
          {footerContent}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10002] p-4">
      <div
        className="rounded-xl shadow-2xl w-full max-w-2xl flex flex-col"
        style={{
          backgroundColor: theme.cardBackground,
          maxHeight: '85vh',
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0"
          style={{ borderColor: theme.border }}
        >
          <div>
            <h2 className="text-base font-semibold" style={{ color: theme.primaryDark }}>
              Your Support History
            </h2>
            <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>
              {isDevPreview
                ? 'Dev preview — mock thread (not saved)'
                : `${tickets.length} report${tickets.length !== 1 ? 's' : ''} — all messages in one place`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:opacity-70 transition-opacity"
            style={{ color: theme.textLight }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-3"
          style={{ backgroundColor: theme.background }}
        >
          {messagesContent}
        </div>

        {/* Footer */}
        <div
          className="px-5 py-4 border-t flex-shrink-0"
          style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}
        >
          {footerContent}
        </div>
      </div>
    </div>
  );
}
