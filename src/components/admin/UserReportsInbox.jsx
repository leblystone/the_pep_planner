import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  CircleNotch, PaperPlaneTilt, CheckCircle, ChatCircle, MagnifyingGlass,
  CaretDown, CaretUp, CaretLeft, CaretRight, User, ShieldCheck, X, Wrench, List,
  EnvelopeSimple, Bug, Lightbulb, Lifebuoy, Trash, ArrowLeft, Smiley, Clock, NotePencil,
} from '@phosphor-icons/react';
import { UserDetailPanel } from './UserDetailModal';
import { AdminSpinner } from './adminUi';

export const TYPE_PILL = {
  Bug: { bg: '#FEE2E2', color: '#DC2626', icon: Bug },
  Suggestion: { bg: '#D1FAE5', color: '#065F46', icon: Lightbulb },
  Support: { bg: '#DBEAFE', color: '#1D4ED8', icon: Lifebuoy },
  Deletion: { bg: '#FFEDD5', color: '#C2410C', icon: Trash },
};

export function ChipButton({
  children,
  active,
  onClick,
  disabled,
  loading,
  variant = 'default',
  style = {},
  title,
}) {
  const t = style;
  const variants = {
    default: {
      bg: active ? '#4a7c5920' : 'transparent',
      color: active ? '#2d5a3a' : '#6B7280',
      border: active ? '1px solid #4a7c5960' : '1px solid #E5E7EB',
    },
    primary: {
      bg: active ? '#2d5a3a' : '#2d5a3a15',
      color: active ? '#fff' : '#2d5a3a',
      border: `1px solid ${active ? '#2d5a3a' : '#2d5a3a40'}`,
    },
    danger: {
      bg: active ? '#DC2626' : '#FEF2F2',
      color: active ? '#fff' : '#991B1B',
      border: `1px solid ${active ? '#DC2626' : '#FECACA'}`,
    },
    success: {
      bg: active ? '#0d9668' : '#F0FDF4',
      color: active ? '#fff' : '#166534',
      border: `1px solid ${active ? '#0d9668' : '#86EFAC'}`,
    },
    send: {
      bg: '#a0522d',
      color: '#fff',
      border: '1px solid #a0522d',
    },
  };
  const v = variants[variant] || variants.default;
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 14px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: '600',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled || loading ? 0.55 : 1,
        backgroundColor: v.bg,
        color: v.color,
        border: v.border,
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
        ...t,
      }}
    >
      {loading && <CircleNotch size={14} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} />}
      {children}
    </button>
  );
}

/** Segmented Open / Closed — matches Notifications Tracking / Templates control */
export function OpenClosedToggle({ showHistory, setShowHistory, openCount, closedCount, theme }) {
  const trackBg = theme.isDark ? 'rgba(255,255,255,0.06)' : '#e8eaed';
  const inactiveColor = theme.text || '#374151';

  return (
    <div
      role="tablist"
      aria-label="Open or closed reports"
      style={{
        display: 'flex',
        width: '100%',
        padding: '4px',
        borderRadius: '12px',
        backgroundColor: trackBg,
        border: `1px solid ${theme.border}`,
        gap: '4px',
      }}
    >
      {[
        { id: 'open', label: 'Open', count: openCount, active: !showHistory, Icon: ChatCircle, onClick: () => setShowHistory(false) },
        { id: 'closed', label: 'Closed', count: closedCount, active: showHistory, Icon: CheckCircle, onClick: () => setShowHistory(true) },
      ].map(({ id, label, count, active, Icon, onClick }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active}
          onClick={onClick}
          style={{
            flex: 1,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '8px 10px',
            borderRadius: '8px',
            border: 'none',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease, color 0.15s ease',
            backgroundColor: active ? (theme.primary || '#2d5a3a') : 'transparent',
            color: active ? '#fff' : inactiveColor,
          }}
        >
          <Icon size={16} weight={active ? 'fill' : 'regular'} />
          <span>{label}</span>
          <span style={{ fontSize: '11px', opacity: active ? 0.9 : 0.65, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
        </button>
      ))}
    </div>
  );
}

export function TypePill({ typeLabel }) {
  const pill = TYPE_PILL[typeLabel] || TYPE_PILL.Support;
  const Icon = pill.icon || Lifebuoy;
  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: '700',
        padding: '2px 8px',
        borderRadius: '999px',
        backgroundColor: pill.bg,
        color: pill.color,
        textTransform: 'uppercase',
        letterSpacing: '0.02em',
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
      }}
    >
      <Icon size={10} weight="bold" />
      {typeLabel}
    </span>
  );
}

export function ConfirmChip({ label, confirmLabel, armed, onArm, onConfirm, loading, variant = 'danger' }) {
  return (
    <ChipButton
      variant={armed ? variant : 'default'}
      active={armed}
      loading={loading}
      onClick={() => (armed ? onConfirm() : onArm())}
      style={armed ? {} : { color: '#991B1B', borderColor: '#FECACA', backgroundColor: '#FEF2F2' }}
    >
      {armed ? confirmLabel : label}
    </ChipButton>
  );
}

export default function UserReportsInbox({
  theme: t,
  typeCounts: _typeCounts,
  showHistory,
  setShowHistory,
  openCount,
  closedCount,
  filteredItems,
  selectedUserEmail,
  onSelectUser,
  selectedQueueItem,
  onSelectItem,
  selectedTicket,
  ticketMessages,
  fromTheTeamMessages = [],
  fromTheTeamLoading = false,
  formatRelativeTime,
  getTierBadge,
  showTools,
  setShowTools,
  toolsContent,
  reopenedBanner,
  customMessage,
  setCustomMessage,
  onSendReply,
  sending,
  adminNotes,
  setAdminNotes,
  savingNotes,
  onCloseTicket,
  onCloseFromThread,
  closingTicket,
  closeArmed,
  setCloseArmed,
  deleteArmed,
  setDeleteArmed,
  onDelete,
  deleting,
  onMarkReviewed,
  markingReviewed,
  onMarkUnread,
  onMarkRead,
  selectedIsUnread,
  isFeedback,
  conversationEndRef,
  selectedUser = null,
  hasSelectedUser = false,
  isLoadingUserDetails = false,
  userSelectionError = null,
  activeReportContext = null,
  onAccountClose,
  onExtendTrial,
  isExtendingTrial = false,
}) {
  const LEFT_PANEL_WIDTH = 280;
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [accountExpanded, setAccountExpanded] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [listSearch, setListSearch] = useState('');
  /** Quick filter from summary cards: all | unread | bug | suggestion | support | recent7 */
  const [quickFilter, setQuickFilter] = useState('all');
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(max-width: 1023px)');
    const onChange = () => setIsNarrow(mq.matches);
    onChange();
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const showListPane = !isNarrow || !selectedUserEmail;
  const showDetailPane = !isNarrow || Boolean(selectedUserEmail);

  const handleSelectUser = useCallback(
    (email) => {
      onSelectUser(email);
      // Desktop: collapse list to focus the conversation; narrow uses full drill-down
      if (!isNarrow) setLeftPanelCollapsed(true);
    },
    [onSelectUser, isNarrow]
  );

  const handleBackToList = useCallback(() => {
    if (typeof onAccountClose === 'function') onAccountClose();
    onSelectUser(null);
    setLeftPanelCollapsed(false);
    setAccountExpanded(false);
    setMobileToolsOpen(false);
    setNotesOpen(false);
  }, [onAccountClose, onSelectUser]);

  useEffect(() => {
    if (!selectedUserEmail) setLeftPanelCollapsed(false);
  }, [selectedUserEmail]);

  useEffect(() => {
    setAccountExpanded(false);
    setMobileToolsOpen(false);
    setNotesOpen(false);
  }, [selectedUserEmail]);

  // Reset desktop collapse when switching to narrow drill-down
  useEffect(() => {
    if (isNarrow) setLeftPanelCollapsed(false);
  }, [isNarrow]);

  const itemKey = (item) =>
    item.kind === 'feedback' ? `fb-${item.raw?.id}` : `sq-${item.raw?.logId}`;

  const selectedKey = selectedQueueItem ? itemKey(selectedQueueItem) : null;

  useEffect(() => {
    setNotesOpen(false);
    setCloseArmed(false);
  }, [selectedKey, setCloseArmed]);

  const hasExistingNotes = Boolean(typeof adminNotes === 'string' && adminNotes.trim());
  const closeLabel = selectedQueueItem?.ticketNumber
    ? `Close #${selectedQueueItem.ticketNumber}`
    : 'Close report';
  const closeConfirmLabel = selectedQueueItem?.ticketNumber
    ? `Tap again to close #${selectedQueueItem.ticketNumber}`
    : 'Tap again to close this report';

  const renderNotesBlock = (compact = false) => {
    if (!selectedQueueItem) return null;
    if (!notesOpen && !hasExistingNotes) {
      return (
        <ChipButton
          onClick={() => setNotesOpen(true)}
          style={{ padding: compact ? '5px 10px' : '6px 12px', fontSize: '11px' }}
          title="Add an internal note"
        >
          <NotePencil size={14} />
          Add a note
        </ChipButton>
      );
    }
    if (!notesOpen && hasExistingNotes) {
      return (
        <button
          type="button"
          onClick={() => setNotesOpen(true)}
          title="Edit note"
          style={{
            width: '100%',
            textAlign: 'left',
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            backgroundColor: t.background || '#F9FAFB',
            cursor: 'pointer',
            font: 'inherit',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: t.textLight, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <NotePencil size={12} /> Note
            </span>
            <span style={{ fontSize: 10, color: t.primary, fontWeight: 600 }}>Edit</span>
          </div>
          <p style={{ margin: 0, fontSize: 12, color: t.text, lineHeight: 1.45, whiteSpace: 'pre-wrap',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {adminNotes}
          </p>
        </button>
      );
    }
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: t.textLight }}>Internal note</label>
          <button
            type="button"
            onClick={() => setNotesOpen(false)}
            style={{ border: 'none', background: 'none', color: t.textLight, fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
          >
            Done
          </button>
        </div>
        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          rows={compact ? 3 : 4}
          autoFocus
          placeholder="Where you left off, what you’re waiting on…"
          style={{
            width: '100%',
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${t.border}`,
            fontSize: 12,
            lineHeight: 1.5,
            color: t.text,
            backgroundColor: compact ? (t.background || '#F9FAFB') : t.cardBackground,
            resize: 'vertical',
            boxSizing: 'border-box',
            fontFamily: 'inherit',
          }}
        />
        {savingNotes && (
          <span style={{ fontSize: 10, color: t.primary, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CircleNotch size={10} style={{ animation: 'spin 1s linear infinite' }} /> Saving…
          </span>
        )}
      </div>
    );
  };

  const renderReportActions = ({ forMobileSheet = false } = {}) => {
    if (!selectedQueueItem) {
      return (
        <p style={{ fontSize: 12, color: t.textLight, margin: 0 }}>
          {forMobileSheet ? 'Select a report first.' : 'Loading reports…'}
        </p>
      );
    }
    const isClosed = Boolean(selectedTicket?.markedFixed) || showHistory;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {!isClosed && (
            <ConfirmChip
              label={closeLabel}
              confirmLabel={closeConfirmLabel}
              armed={closeArmed}
              onArm={() => setCloseArmed(true)}
              onConfirm={onCloseTicket}
              loading={closingTicket}
              variant="success"
            />
          )}
          {isFeedback && selectedQueueItem.feedbackStatus === 'new' && onMarkReviewed && (
            <ChipButton loading={markingReviewed} onClick={onMarkReviewed} style={{ fontSize: 11 }}>
              Mark reviewed
            </ChipButton>
          )}
          {selectedIsUnread && onMarkRead && (
            <ChipButton onClick={onMarkRead} style={{ fontSize: 11 }} title="Mark as read">
              Mark read
            </ChipButton>
          )}
          {!selectedIsUnread && onMarkUnread && (
            <ChipButton onClick={onMarkUnread} style={{ fontSize: 11 }} title="Mark as unread">
              Mark unread
            </ChipButton>
          )}
        </div>

        {renderNotesBlock(forMobileSheet)}

        {onDelete && (
          <div style={{ paddingTop: 4, borderTop: `1px solid ${t.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#991B1B', marginBottom: 8, textTransform: 'uppercase' }}>
              Danger zone
            </div>
            <ConfirmChip
              label={selectedQueueItem.typeLabel === 'Deletion' ? 'Process deletion' : 'Delete report'}
              confirmLabel="Tap again to delete"
              armed={deleteArmed}
              onArm={() => setDeleteArmed(true)}
              onConfirm={onDelete}
              loading={deleting}
            />
          </div>
        )}
      </div>
    );
  };

  // ── Helpers mirrored from SupportChatModal ──────────────────────────────────
  const tsToMs = (ts) => {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (typeof ts?.toMillis === 'function') return ts.toMillis();
    if (typeof ts?.toDate === 'function') return ts.toDate().getTime();
    if (ts instanceof Date) return ts.getTime();
    const sec = ts.seconds ?? ts._seconds;
    if (typeof sec === 'number') {
      const nano = ts.nanoseconds ?? ts._nanoseconds ?? 0;
      return sec * 1000 + Math.floor(nano / 1e6);
    }
    return 0;
  };

  const msgTypeLabel = (type) => {
    if (type === 'bug') return 'Bug Report';
    if (type === 'suggestion') return 'Suggestion';
    return 'Support Request';
  };
  const msgTypeColor = (type) => {
    if (type === 'bug') return { bg: '#FEE2E2', color: '#DC2626' };
    if (type === 'suggestion') return { bg: '#D1FAE5', color: '#065F46' };
    return { bg: '#DBEAFE', color: '#1D4ED8' };
  };
  const formatMsgDate = (ts) => {
    const ms = tsToMs(ts);
    if (!ms) return '';
    const d = new Date(ms);
    const diffDays = Math.floor((Date.now() - d) / 86400000);
    if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  // Group filteredItems by user email for the left column
  const poolItems = useMemo(() => filteredItems || [], [filteredItems]);

  const sevenDaysAgoMs = useMemo(() => Date.now() - 7 * 24 * 60 * 60 * 1000, []);

  const quickCounts = useMemo(() => {
    let unread = 0;
    let bug = 0;
    let suggestion = 0;
    let support = 0;
    let recent7 = 0;
    for (const item of poolItems) {
      if (item.unread) unread += 1;
      if (item.typeCategory === 'bug') bug += 1;
      if (item.typeCategory === 'suggestion') suggestion += 1;
      if (item.typeCategory === 'support') support += 1;
      if ((item.dateMs || 0) >= sevenDaysAgoMs) recent7 += 1;
    }
    return {
      all: poolItems.length,
      unread,
      bug,
      suggestion,
      support,
      recent7,
    };
  }, [poolItems, sevenDaysAgoMs]);

  const scopedItems = useMemo(() => {
    if (quickFilter === 'unread') return poolItems.filter((item) => item.unread);
    if (quickFilter === 'bug') return poolItems.filter((item) => item.typeCategory === 'bug');
    if (quickFilter === 'suggestion') return poolItems.filter((item) => item.typeCategory === 'suggestion');
    if (quickFilter === 'support') return poolItems.filter((item) => item.typeCategory === 'support');
    if (quickFilter === 'recent7') return poolItems.filter((item) => (item.dateMs || 0) >= sevenDaysAgoMs);
    return poolItems;
  }, [poolItems, quickFilter, sevenDaysAgoMs]);

  const userGroups = useMemo(() => {
    const groups = new Map();
    for (const item of scopedItems) {
      const email = item.email?.trim().toLowerCase() || 'unknown';
      if (!groups.has(email)) {
        groups.set(email, {
          email: item.email || email,
          items: [],
          lastActivity: 0,
          hasUnread: false,
          unreadCount: 0,
        });
      }
      const g = groups.get(email);
      g.items.push(item);
      if (item.dateMs > g.lastActivity) g.lastActivity = item.dateMs;
      if (item.unread) {
        g.hasUnread = true;
        g.unreadCount += 1;
      }
    }
    return [...groups.values()].sort((a, b) => {
      // Unread users float above read ones (Gmail-ish), then by recency
      if (a.hasUnread !== b.hasUnread) return a.hasUnread ? -1 : 1;
      return b.lastActivity - a.lastActivity;
    });
  }, [scopedItems]);

  const selectedGroup = useMemo(
    () => userGroups.find((g) => g.email?.trim().toLowerCase() === selectedUserEmail) || null,
    [userGroups, selectedUserEmail]
  );

  const visibleUserGroups = useMemo(() => {
    const needle = listSearch.trim().toLowerCase();
    if (!needle) return userGroups;
    return userGroups.filter((g) => (g.email || '').toLowerCase().includes(needle));
  }, [userGroups, listSearch]);

  const applyQuickFilter = useCallback(
    (next) => {
      if (next === 'all') {
        setQuickFilter('all');
        if (showHistory) setShowHistory(false);
        return;
      }
      setQuickFilter((prev) => (prev === next ? 'all' : next));
    },
    [showHistory, setShowHistory]
  );

  // Auto-select newest unread (else newest) report so actions/reply always have context
  useEffect(() => {
    if (!selectedUserEmail || !selectedGroup?.items?.length) return;
    const stillValid = selectedQueueItem && selectedGroup.items.some((i) => itemKey(i) === itemKey(selectedQueueItem));
    if (stillValid) return;
    const pick = selectedGroup.items.find((i) => i.unread) || selectedGroup.items[0];
    if (pick) onSelectItem(pick);
  }, [selectedUserEmail, selectedGroup, selectedQueueItem, onSelectItem]);

  // One blended timeline: all ticket messages + openers for feedback not yet linked to a ticket
  const renderItems = useMemo(() => {
    const items = [];
    let lastTicketId = null;
    const coveredTicketIds = new Set();
    const coveredFeedbackIds = new Set();

    for (let i = 0; i < (ticketMessages || []).length; i++) {
      const msg = ticketMessages[i];
      if (msg._ticketId !== lastTicketId) {
        lastTicketId = msg._ticketId;
        coveredTicketIds.add(msg._ticketId);
        if (msg._feedbackId) coveredFeedbackIds.add(msg._feedbackId);
        const tc = msgTypeColor(msg._ticketType);
        const ticketMsgs = ticketMessages.filter((m) => m._ticketId === msg._ticketId);
        items.push({
          type: 'divider',
          key: `divider-${msg._ticketId || i}-${items.length}`,
          ticketId: msg._ticketId || null,
          feedbackId: msg._feedbackId || null,
          ticketNumber: msg._ticketNumber,
          ticketType: msg._ticketType,
          ticketStatus: msg._ticketStatus,
          tc,
          date: ticketMsgs[0]?.createdAt,
        });
      }
      items.push({ type: 'message', key: msg.id || `msg-${i}`, msg });
    }

    // Unlinked feedback still needs to appear in the blend
    for (const item of selectedGroup?.items || []) {
      if (item.kind !== 'feedback') continue;
      const fbId = item.raw?.id || item.raw?._rawFeedback?.id;
      const linked = item.raw?._rawFeedback?.linkedTicketId || item.raw?.ticketId;
      if (linked && coveredTicketIds.has(linked)) continue;
      if (fbId && coveredFeedbackIds.has(fbId)) continue;
      const typeKey = (item.typeCategory === 'suggestion' ? 'suggestion' : 'bug');
      const tc = msgTypeColor(typeKey);
      items.push({
        type: 'divider',
        key: `divider-fb-${fbId || item.dateMs}`,
        ticketId: linked || null,
        feedbackId: fbId || null,
        ticketNumber: item.ticketNumber || null,
        ticketType: typeKey,
        ticketStatus: item.feedbackStatus || 'new',
        tc,
        date: item.dateMs ? new Date(item.dateMs) : null,
      });
      items.push({
        type: 'message',
        key: `synth-fb-${fbId || item.dateMs}`,
        msg: {
          message: item.message,
          text: item.message,
          senderType: 'user',
          createdAt: item.dateMs ? new Date(item.dateMs) : null,
          _ticketType: typeKey,
          _synthetic: true,
          _queueKey: itemKey(item),
        },
      });
    }

    items.sort((a, b) => {
      const ta = a.type === 'divider'
        ? tsToMs(a.date)
        : tsToMs(a.msg?.createdAt);
      const tb = b.type === 'divider'
        ? tsToMs(b.date)
        : tsToMs(b.msg?.createdAt);
      if (ta !== tb) return ta - tb;
      if (a.type === 'divider' && b.type !== 'divider') return -1;
      if (b.type === 'divider' && a.type !== 'divider') return 1;
      return 0;
    });

    return items;
  }, [ticketMessages, selectedGroup]);

  const showConversationPane = Boolean(selectedUserEmail);
  const stackDetailPanes = isNarrow && showDetailPane;
  const listOnlyDesktop = !isNarrow && !showConversationPane;
  const listOnlyLayout = !showConversationPane;
  const panelShadow = t.isDark ? '0 4px 16px rgba(0,0,0,0.2)' : '0 4px 16px rgba(47,59,58,0.05)';
  const panelCardStyle = {
    border: `1px solid ${t.border}`,
    borderRadius: '16px',
    boxShadow: panelShadow,
    overflow: 'hidden',
    backgroundColor: t.cardBackground || t.surface || '#fff',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: stackDetailPanes ? 'column' : 'row',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        width: '100%',
        maxWidth: 'none',
        flex: 1,
        margin: 0,
        padding: '8px',
        gap: '8px',
        boxSizing: 'border-box',
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        border: 0,
        overflow: 'hidden',
        backgroundColor: t.background || '#F9FAFB',
      }}
    >
      {/* Expand rail — desktop only when user list is collapsed */}
      {!isNarrow && leftPanelCollapsed && (
        <button
          type="button"
          onClick={() => setLeftPanelCollapsed(false)}
          title="Show all user reports"
          style={{
            width: '36px',
            flexShrink: 0,
            border: `1px solid ${t.border}`,
            borderRadius: '16px',
            backgroundColor: t.cardBackground || '#fff',
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            color: t.primary,
            transition: 'background 0.15s',
            boxShadow: panelShadow,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = t.primary + '12'; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = t.cardBackground || '#fff'; }}
        >
          <CaretRight size={18} weight="bold" />
          <List size={16} />
        </button>
      )}

      {/* ═══ COL 1 — User List ═══════════════════════════════════════════════ */}
      {showListPane && (
      <div
        style={{
          width: isNarrow || listOnlyLayout
            ? '100%'
            : (leftPanelCollapsed ? 0 : Math.max(LEFT_PANEL_WIDTH, 300)),
          minWidth: isNarrow || listOnlyLayout
            ? 0
            : (leftPanelCollapsed ? 0 : Math.max(LEFT_PANEL_WIDTH, 300)),
          flex: isNarrow || listOnlyLayout ? '1 1 auto' : undefined,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          opacity: (!isNarrow && leftPanelCollapsed) ? 0 : 1,
          pointerEvents: (!isNarrow && leftPanelCollapsed) ? 'none' : 'auto',
          transition: isNarrow
            ? 'none'
            : 'width 0.28s cubic-bezier(0.4, 0, 0.2, 1), min-width 0.28s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease',
          ...panelCardStyle,
        }}
      >
        {/* Funnel header — Notifications tracker language */}
        <div
          style={{
            padding: '14px',
            borderBottom: `1px solid ${t.border}`,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            backgroundColor: t.cardBackground || t.surface || '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '7px',
                  borderRadius: '12px',
                  backgroundColor: `${t.primary || '#2d5a3a'}18`,
                  flexShrink: 0,
                }}
              >
                <Lifebuoy size={18} weight="regular" style={{ color: t.primary }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: t.text, lineHeight: 1.2 }}>User Reports</div>
                <div style={{ fontSize: '11px', color: t.textLight, marginTop: '2px' }}>
                  {visibleUserGroups.length} user{visibleUserGroups.length !== 1 ? 's' : ''}
                  {listSearch.trim() ? ' match' : ''}
                </div>
              </div>
            </div>

            <div style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, maxWidth: listOnlyLayout ? '480px' : '280px' }}>
              <MagnifyingGlass
                size={15}
                weight="regular"
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: t.textLight,
                  pointerEvents: 'none',
                }}
              />
              <input
                type="search"
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                placeholder="Search by email…"
                style={{
                  width: '100%',
                  padding: '8px 10px 8px 32px',
                  borderRadius: '999px',
                  border: `1px solid ${t.border}`,
                  backgroundColor: t.isDark ? 'rgba(255,255,255,0.04)' : '#F9FAFB',
                  color: t.text,
                  fontSize: '12px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  boxShadow: t.isDark ? '0 1px 4px rgba(0,0,0,0.25)' : '0 1px 4px rgba(0,0,0,0.06)',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <ChipButton
                active={showTools}
                onClick={() => setShowTools((v) => !v)}
                style={{
                  padding: '7px 12px',
                  fontSize: '11px',
                  borderRadius: '999px',
                  boxShadow: t.isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.08)',
                }}
                title="Admin tools"
              >
                <Wrench size={13} weight="regular" /> Tools {showTools ? <CaretUp size={12} /> : <CaretDown size={12} />}
              </ChipButton>
              {!isNarrow && selectedUserEmail && (
                <button
                  type="button"
                  onClick={() => setLeftPanelCollapsed(true)}
                  title="Hide list and focus on this user"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '7px 10px',
                    borderRadius: '999px',
                    border: `1px solid ${t.border}`,
                    backgroundColor: t.cardBackground,
                    color: t.textLight,
                    fontSize: '11px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    boxShadow: t.isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.08)',
                  }}
                >
                  <CaretLeft size={12} />
                  Hide
                </button>
              )}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: listOnlyLayout
                ? 'repeat(auto-fit, minmax(140px, 1fr))'
                : '1fr 1fr',
              gap: '8px',
            }}
          >
            {[
              {
                key: 'all',
                label: 'Open',
                value: openCount,
                color: t.primary || '#2d5a3a',
                Icon: ChatCircle,
                active: quickFilter === 'all' && !showHistory,
              },
              {
                key: 'unread',
                label: 'Unread',
                value: quickCounts.unread,
                color: '#3b82f6',
                Icon: EnvelopeSimple,
                active: quickFilter === 'unread',
              },
              {
                key: 'bug',
                label: 'Bugs',
                value: quickCounts.bug,
                color: '#ef4444',
                Icon: Bug,
                active: quickFilter === 'bug',
              },
              {
                key: 'suggestion',
                label: 'Features',
                value: quickCounts.suggestion,
                color: '#065F46',
                Icon: Lightbulb,
                active: quickFilter === 'suggestion',
              },
              {
                key: 'support',
                label: 'Support',
                value: quickCounts.support,
                color: '#1D4ED8',
                Icon: Lifebuoy,
                active: quickFilter === 'support',
              },
              {
                key: 'recent7',
                label: 'Last 7d',
                value: quickCounts.recent7,
                color: '#0d9488',
                Icon: Clock,
                active: quickFilter === 'recent7',
              },
            ].map(({ key, label, value, color, Icon, active }) => (
              <button
                key={key}
                type="button"
                onClick={() => applyQuickFilter(key)}
                aria-pressed={active}
                title={
                  key === 'all'
                    ? 'Show all open reports'
                    : key === 'recent7'
                      ? 'Show reports from the last 7 days'
                      : `Filter to ${label.toLowerCase()} reports`
                }
                style={{
                  borderRadius: '16px',
                  border: active ? `1.5px solid ${color}` : `1px solid ${t.border}`,
                  backgroundColor: active
                    ? `${color}14`
                    : t.isDark
                      ? 'rgba(255,255,255,0.03)'
                      : '#fff',
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: t.isDark
                    ? '0 4px 16px rgba(0,0,0,0.2)'
                    : '0 4px 16px rgba(47,59,58,0.05)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  font: 'inherit',
                  width: '100%',
                  transition: 'border-color 0.15s ease, background-color 0.15s ease',
                }}
              >
                <div
                  style={{
                    flexShrink: 0,
                    padding: '7px',
                    borderRadius: '12px',
                    backgroundColor: `${color}18`,
                    display: 'flex',
                  }}
                >
                  <Icon size={16} weight={active ? 'fill' : 'regular'} style={{ color }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '10px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: active ? color : t.textLight,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      fontVariantNumeric: 'tabular-nums',
                      color: t.text,
                      lineHeight: 1.15,
                      marginTop: '2px',
                    }}
                  >
                    {value}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <OpenClosedToggle
            showHistory={showHistory}
            setShowHistory={setShowHistory}
            openCount={openCount}
            closedCount={closedCount}
            theme={t}
          />
        </div>

        {showTools && (
          <div
            style={{
              padding: '10px 12px',
              borderBottom: `1px solid ${t.border}`,
              maxHeight: '32vh',
              overflowY: 'auto',
              flexShrink: 0,
              backgroundColor: t.cardBackground,
            }}
          >
            {toolsContent}
          </div>
        )}

        {/* User rows — one per unique email */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visibleUserGroups.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: t.textLight, fontSize: '13px' }}>
              {listSearch.trim() ? (
                <p style={{ margin: 0 }}>No users match “{listSearch.trim()}”.</p>
              ) : showHistory ? (
                <p style={{ margin: 0 }}>No closed reports.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                  <Smiley size={28} weight="regular" style={{ color: t.primary, opacity: 0.45 }} />
                  <p style={{ margin: 0, fontWeight: 500 }}>All caught up</p>
                </div>
              )}
            </div>
          ) : (
            visibleUserGroups.map((group) => {
              const normalizedEmail = group.email?.trim().toLowerCase();
              const isSelected = normalizedEmail === selectedUserEmail;
              return (
                <button
                  key={group.email}
                  type="button"
                  onClick={() => handleSelectUser(group.email)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: '16px',
                    border: `1px solid ${isSelected ? (t.primary || '#2d5a3a') : t.border}`,
                    backgroundColor: isSelected
                      ? `${t.primary}12`
                      : (t.cardBackground || t.surface || '#fff'),
                    cursor: 'pointer',
                    transition: 'background 0.12s, border-color 0.12s, box-shadow 0.12s',
                    boxShadow: t.isDark
                      ? '0 4px 16px rgba(0,0,0,0.2)'
                      : '0 4px 16px rgba(47,59,58,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px', marginBottom: '6px' }}>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: group.hasUnread ? '700' : '600',
                      color: t.text,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      flex: 1,
                    }}>
                      {group.email}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
                      {group.hasUnread && (
                        <span
                          title={`${group.unreadCount} unread`}
                          style={{
                            minWidth: '18px',
                            height: '18px',
                            padding: '0 5px',
                            borderRadius: '999px',
                            backgroundColor: t.primary,
                            color: '#fff',
                            fontSize: '10px',
                            fontWeight: '700',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {group.unreadCount}
                        </span>
                      )}
                      <span style={{ fontSize: '10px', color: t.textLight, fontWeight: group.hasUnread ? '600' : '400' }}>
                        {formatRelativeTime(group.lastActivity)}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: t.textLight, fontWeight: group.hasUnread ? '600' : '400' }}>
                      {group.items.length} report{group.items.length !== 1 ? 's' : ''}
                      {group.hasUnread ? ` · ${group.unreadCount} unread` : ''}
                    </span>
                    <span style={{ fontSize: '10px', color: t.textLight, opacity: 0.5 }}>·</span>
                    {[...new Set(group.items.map((i) => i.typeLabel))].slice(0, 3).map((label) => (
                      <TypePill key={label} typeLabel={label} />
                    ))}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      )}

      {/* ═══ COL 2 — Report switcher + slim actions ═══ */}
      {showDetailPane && !listOnlyDesktop && (
      <div
        style={{
          flex: stackDetailPanes ? '0 0 auto' : '0 0 300px',
          width: stackDetailPanes ? '100%' : '300px',
          minWidth: stackDetailPanes ? 0 : 260,
          maxWidth: stackDetailPanes ? '100%' : 320,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          position: stackDetailPanes ? 'relative' : undefined,
          zIndex: stackDetailPanes ? 2 : undefined,
          ...panelCardStyle,
          backgroundColor: t.background || '#F9FAFB',
        }}
      >
        {isNarrow && selectedUserEmail ? (
          <div
            style={{
              padding: '10px 12px',
              borderBottom: `1px solid ${t.border}`,
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              backgroundColor: t.cardBackground || '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={handleBackToList}
                title="Back to user list"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: `1px solid ${t.border}`,
                  backgroundColor: t.background || '#F9FAFB',
                  color: t.text,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <ArrowLeft size={16} weight="bold" />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedGroup?.email || selectedUserEmail}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  {selectedQueueItem && (() => {
                    const badge = getTierBadge(selectedQueueItem.userAccountInfo);
                    return badge ? (
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 999, fontWeight: 600, backgroundColor: badge.bg, color: badge.fg }}>
                        {badge.label}
                      </span>
                    ) : null;
                  })()}
                  <span style={{ fontSize: 11, color: t.textLight }}>
                    {selectedGroup?.items.length ?? 0} report{(selectedGroup?.items.length ?? 0) !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
              <ChipButton
                active={mobileToolsOpen}
                onClick={() => setMobileToolsOpen((v) => !v)}
                style={{ padding: '8px 10px', fontSize: 11, flexShrink: 0 }}
                title="Report actions"
              >
                <Wrench size={14} />
                Tools
              </ChipButton>
              <ChipButton
                active={accountExpanded}
                onClick={() => setAccountExpanded(true)}
                style={{ padding: '8px 10px', fontSize: 11, flexShrink: 0 }}
                title="Account tools"
              >
                <User size={14} weight={accountExpanded ? 'fill' : 'duotone'} />
              </ChipButton>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                paddingBottom: 2,
              }}
            >
              {(selectedGroup?.items || []).map((item) => {
                const key = itemKey(item);
                const isSelected = key === selectedKey;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectItem(item)}
                    title={item.message}
                    style={{
                      flex: '0 0 auto',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '5px 9px',
                      borderRadius: 999,
                      border: `1px solid ${isSelected ? t.primary : t.border}`,
                      backgroundColor: isSelected ? `${t.primary}18` : t.background || '#F9FAFB',
                      cursor: 'pointer',
                    }}
                  >
                    {item.unread && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: t.primary, flexShrink: 0 }} />
                    )}
                    <TypePill typeLabel={item.typeLabel} />
                    <span style={{ fontSize: 10, fontWeight: 700, color: isSelected ? t.primary : t.textLight }}>
                      {item.ticketNumber ? `#${item.ticketNumber}` : 'New'}
                    </span>
                  </button>
                );
              })}
            </div>
            {reopenedBanner}
          </div>
        ) : null}
        {!isNarrow && reopenedBanner}

        {!selectedUserEmail ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: t.textLight, padding: '24px' }}>
            <ChatCircle size={32} style={{ opacity: 0.2, marginBottom: '10px' }} />
            <p style={{ fontSize: '13px', fontWeight: '500', margin: 0, textAlign: 'center' }}>Select a user to view their reports</p>
          </div>
        ) : !isNarrow ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '12px 14px', borderBottom: `1px solid ${t.border}`, flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                {leftPanelCollapsed && (
                  <button
                    type="button"
                    onClick={() => setLeftPanelCollapsed(false)}
                    title="Show all users"
                    style={{
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '28px',
                      height: '28px',
                      borderRadius: '6px',
                      border: `1px solid ${t.border}`,
                      backgroundColor: t.cardBackground,
                      color: t.primary,
                      cursor: 'pointer',
                    }}
                  >
                    <CaretRight size={14} weight="bold" />
                  </button>
                )}
                <div style={{ fontSize: '13px', fontWeight: '700', color: t.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {selectedGroup?.email || selectedUserEmail}
                </div>
                <ChipButton
                  active={accountExpanded}
                  onClick={() => setAccountExpanded(true)}
                  style={{ padding: '5px 10px', fontSize: 11, flexShrink: 0 }}
                  title="Open account tools"
                >
                  <User size={14} weight="duotone" />
                  Account
                </ChipButton>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                {selectedQueueItem && (() => {
                  const badge = getTierBadge(selectedQueueItem.userAccountInfo);
                  return badge ? (
                    <span style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '999px', fontWeight: '600', backgroundColor: badge.bg, color: badge.fg }}>
                      {badge.label}
                    </span>
                  ) : null;
                })()}
                <span style={{ fontSize: '11px', color: t.textLight }}>
                  {selectedGroup?.items.length ?? 0} report{(selectedGroup?.items.length ?? 0) !== 1 ? 's' : ''}
                </span>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  padding: '10px 14px',
                  borderBottom: `1px solid ${t.border}`,
                }}
              >
                {(selectedGroup?.items || []).map((item) => {
                  const key = itemKey(item);
                  const isSelected = key === selectedKey;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSelectItem(item)}
                      title={item.message}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 10px',
                        borderRadius: '10px',
                        border: `1px solid ${isSelected ? t.primary : t.border}`,
                        backgroundColor: isSelected ? `${t.primary}12` : t.cardBackground,
                        cursor: 'pointer',
                        textAlign: 'left',
                        font: 'inherit',
                        width: '100%',
                      }}
                    >
                      {item.unread && (
                        <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: t.primary, flexShrink: 0 }} />
                      )}
                      <TypePill typeLabel={item.typeLabel} />
                      <span style={{ fontSize: '12px', fontWeight: 700, color: isSelected ? t.primary : t.text, flexShrink: 0 }}>
                        {item.ticketNumber ? `#${item.ticketNumber}` : 'New'}
                      </span>
                      <span style={{ fontSize: '11px', color: t.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                        {item.message || item.subject || ''}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div style={{ padding: '14px' }}>
                {renderReportActions()}
              </div>
            </div>
          </div>
        ) : null}

        {/* Mobile tools sheet */}
        {isNarrow && selectedUserEmail && mobileToolsOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 80,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end',
              backgroundColor: 'rgba(0,0,0,0.4)',
            }}
            onClick={() => setMobileToolsOpen(false)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-label="Report actions"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxHeight: '78vh',
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                backgroundColor: t.cardBackground || '#fff',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                padding: '12px 14px calc(16px + env(safe-area-inset-bottom, 0px))',
                boxShadow: '0 -8px 28px rgba(0,0,0,0.18)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>
                  {selectedQueueItem?.ticketNumber ? `Report #${selectedQueueItem.ticketNumber}` : 'Report actions'}
                </div>
                <button
                  type="button"
                  onClick={() => setMobileToolsOpen(false)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    border: `1px solid ${t.border}`,
                    backgroundColor: t.background || '#F9FAFB',
                    color: t.textLight,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  aria-label="Close tools"
                >
                  <X size={16} />
                </button>
              </div>
              {renderReportActions({ forMobileSheet: true })}
            </div>
          </div>
        )}
      </div>
      )}

      {/* ═══ COL 3 — Conversation + Reply (chat-first on narrow) ═══ */}
      {showDetailPane && showConversationPane && selectedUserEmail && (
      <div
        style={{
          flex: stackDetailPanes ? '1 1 auto' : '1 1 0',
          minWidth: stackDetailPanes ? 0 : 320,
          maxWidth: '100%',
          width: stackDetailPanes ? '100%' : undefined,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          ...panelCardStyle,
        }}
      >
          <>
            {/* Scrollable conversation thread */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: isNarrow ? '12px 14px' : '14px 16px',
                backgroundColor: t.background || '#F9FAFB',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              {/* One blended inbox for this user */}
              {renderItems.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ fontSize: '13px', color: t.textLight, textAlign: 'center' }}>
                    {fromTheTeamLoading ? 'Loading conversation…' : 'No messages yet — reply below to start their Support inbox thread.'}
                  </p>
                </div>
              ) : (
                renderItems.map((item) => {
                  if (item.type === 'divider') {
                    const isClosed = item.ticketStatus === 'closed' || item.ticketStatus === 'resolved';
                    const canCloseHere = !isClosed && !showHistory && typeof onCloseFromThread === 'function'
                      && (item.ticketId || item.feedbackId);
                    return (
                      <div key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0' }}>
                        <div style={{ flex: 1, height: '1px', backgroundColor: t.border }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'center' }}>
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '3px 8px', borderRadius: '999px', backgroundColor: item.tc.bg, color: item.tc.color, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                            {msgTypeLabel(item.ticketType)}
                          </span>
                          {item.ticketNumber && (
                            <span style={{ fontSize: '12px', fontWeight: '700', color: t.text }}>#{item.ticketNumber}</span>
                          )}
                          {item.date && <span style={{ fontSize: '11px', color: t.textLight }}>· {formatMsgDate(item.date)}</span>}
                          {isClosed && (
                            <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '999px', backgroundColor: t.isDark ? '#ffffff10' : '#00000010', color: t.textLight }}>
                              closed
                            </span>
                          )}
                          {canCloseHere && (
                            <ChipButton
                              variant="success"
                              onClick={() => onCloseFromThread({ ticketId: item.ticketId, feedbackId: item.feedbackId })}
                              loading={closingTicket}
                              style={{ padding: '3px 10px', fontSize: 10 }}
                              title={item.ticketNumber ? `Close #${item.ticketNumber}` : 'Close this report'}
                            >
                              <CheckCircle size={12} />
                              Close
                            </ChipButton>
                          )}
                        </div>
                        <div style={{ flex: 1, height: '1px', backgroundColor: t.border }} />
                      </div>
                    );
                  }
                  const { msg } = item;
                  const isAdmin =
                    msg.senderType === 'admin' || msg.senderType === 'ghost-worker' ||
                    msg.senderEmail?.includes('admin') || msg.senderEmail?.includes('thepepplanner.com');
                  const msgDate = formatMsgDate(msg.createdAt);
                  const requestRef = msg.requestNumber || null;
                  return (
                    <div key={item.key} style={{ display: 'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
                      <div
                        style={{
                          maxWidth: '80%', padding: '10px 14px', borderRadius: '12px',
                          borderTopLeftRadius: isAdmin ? '12px' : '3px',
                          borderTopRightRadius: isAdmin ? '3px' : '12px',
                          backgroundColor: isAdmin ? (t.primary + '15') : (t.accent || t.primary + '20'),
                          borderLeft: !isAdmin ? `3px solid ${t.primary}` : 'none',
                          borderRight: isAdmin ? `3px solid ${t.primary}` : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '5px', flexWrap: 'wrap' }}>
                          {isAdmin ? <ShieldCheck size={12} style={{ color: t.primary }} /> : <User size={12} style={{ color: t.primary }} />}
                          <span style={{ fontSize: '10px', fontWeight: '600', color: t.primary }}>
                            {isAdmin ? 'The Pep Planner Team' : 'User'}
                          </span>
                          {requestRef && (
                            <span style={{ fontSize: '10px', fontWeight: 700, color: t.textLight }}>· #{requestRef}</span>
                          )}
                          {msgDate && <span style={{ fontSize: '10px', color: t.textLight, opacity: 0.6, marginLeft: '4px' }}>{msgDate}</span>}
                        </div>
                        <p style={{ fontSize: '13px', margin: 0, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: t.text }}>
                          {msg.message || msg.text}
                        </p>
                        {msg.imageUrls?.length > 0 && (
                          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {msg.imageUrls.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`Screenshot ${i + 1}`} style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain', borderRadius: '8px', border: `1px solid ${t.border}` }} loading="lazy" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={conversationEndRef} />
            </div>

            {/* Reply composer — pinned to bottom */}
            <div
              style={{
                borderTop: `1px solid ${t.border}`,
                padding: isNarrow ? '10px 12px calc(10px + env(safe-area-inset-bottom, 0px))' : '12px 16px',
                flexShrink: 0,
                backgroundColor: t.cardBackground,
              }}
            >
              <div
                style={{
                  position: 'relative',
                  borderRadius: '12px',
                  border: `1px solid ${t.border}`,
                  backgroundColor: t.cardBackground,
                  opacity: selectedQueueItem ? 1 : 0.5,
                }}
              >
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={
                    selectedQueueItem
                      ? `Reply on ${selectedQueueItem.ticketNumber ? `#${selectedQueueItem.ticketNumber}` : 'this report'}…`
                      : 'Select a report to reply…'
                  }
                  rows={isNarrow ? 2 : 3}
                  disabled={!selectedQueueItem}
                  style={{
                    width: '100%',
                    padding: isNarrow ? '10px 12px 44px' : '12px 14px 48px',
                    borderRadius: '12px',
                    border: 'none',
                    outline: 'none',
                    fontSize: '13px',
                    lineHeight: 1.5,
                    color: t.text,
                    backgroundColor: 'transparent',
                    resize: 'none',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                    display: 'block',
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    right: '8px',
                    bottom: '8px',
                  }}
                >
                  <ChipButton
                    variant="send"
                    onClick={onSendReply}
                    disabled={!customMessage.trim() || !selectedQueueItem}
                    loading={sending}
                    style={{ padding: '7px 16px' }}
                  >
                    <PaperPlaneTilt size={14} /> Reply
                  </ChipButton>
                </div>
              </div>
            </div>
          </>
      </div>
      )}

      {/* Account tools — slide-over drawer (keeps conversation visible) */}
      {accountExpanded && selectedUserEmail && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 90,
            display: 'flex',
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.35)',
          }}
          onClick={() => setAccountExpanded(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label="Account tools"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: isNarrow ? '100%' : 'min(420px, 92vw)',
              maxWidth: '100%',
              height: '100%',
              backgroundColor: t.cardBackground || '#fff',
              borderLeft: isNarrow ? 'none' : `1px solid ${t.border}`,
              boxShadow: isNarrow ? 'none' : '-12px 0 40px rgba(0,0,0,0.18)',
              display: 'flex',
              flexDirection: 'column',
              minHeight: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '12px 14px',
                borderBottom: `1px solid ${t.border}`,
                flexShrink: 0,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.text }}>Account tools</div>
                <div style={{ fontSize: 11, color: t.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {selectedGroup?.email || selectedUserEmail}
                  {activeReportContext?.ticketNumber ? ` · #${activeReportContext.ticketNumber}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAccountExpanded(false)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: `1px solid ${t.border}`,
                  backgroundColor: t.background || '#F9FAFB',
                  color: t.textLight,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
                aria-label="Close account tools"
              >
                <X size={16} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
              {isLoadingUserDetails && !hasSelectedUser && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 0' }}>
                  <AdminSpinner size={24} />
                </div>
              )}
              {userSelectionError && !hasSelectedUser && (
                <p style={{ padding: '12px 14px', fontSize: '12px', margin: 0, color: t.error || '#EF4444' }}>
                  {userSelectionError}
                </p>
              )}
              {!hasSelectedUser && !isLoadingUserDetails && !userSelectionError && (
                <p style={{ padding: '16px 14px', fontSize: '12px', textAlign: 'center', color: t.textLight, margin: 0 }}>
                  Select a report to load account tools
                </p>
              )}
              {hasSelectedUser && selectedUser && (
                <UserDetailPanel
                  user={selectedUser}
                  onClose={() => setAccountExpanded(false)}
                  theme={t}
                  compact
                  reportContext={activeReportContext}
                  onExtendTrial={onExtendTrial}
                  isExtendingTrial={isExtendingTrial}
                  isLoadingDetails={isLoadingUserDetails}
                />
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
