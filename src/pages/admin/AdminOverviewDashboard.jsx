import React, { useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { useAdmin } from '../../context/AdminContext';
import WorkQueue from '../../components/admin/WorkQueue';

export default function AdminOverviewDashboard() {
  const { theme, setTopbarAction, setFullBleed } = useOutletContext();
  const {
    feedback,
    loading,
    loadFeedback,
    handleUpdateFeedback,
    handleDeleteFeedback,
    handleRespondToFeedback,
  } = useAdmin();

  const handleRefresh = async () => {
    // WorkQueue has its own live snapshot — only refresh feedback here.
    await loadFeedback(true, { openOnly: true });
  };

  // This is the default landing tab, so load open feedback as soon as we mount.
  // (Cached after the first load — see AdminContext's *LoadedRef guards.)
  useEffect(() => {
    loadFeedback(false, { openOnly: true });
  }, [loadFeedback]);

  // Full-bleed so the inbox can use the full main column (no max-w-7xl gutters).
  useEffect(() => {
    if (setFullBleed) setFullBleed(true);
    return () => { if (setFullBleed) setFullBleed(false); };
  }, [setFullBleed]);

  // Register the Refresh chip in the topbar while this page is mounted
  useEffect(() => {
    if (!setTopbarAction) return;
    setTopbarAction(
      <button
        onClick={handleRefresh}
        disabled={loading.feedback}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity disabled:opacity-50"
        style={{
          backgroundColor: theme.primary + '15',
          border: `1px solid ${theme.primary}30`,
          color: theme.primary,
        }}
      >
        <ArrowsClockwise size={13} className={loading.feedback ? 'animate-spin' : ''} />
        Refresh
      </button>
    );
    return () => setTopbarAction(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading.feedback, setTopbarAction]);

  const toDate = (v) => {
    if (!v) return null;
    if (v?.toDate?.()) return v.toDate();
    if (typeof v?.toMillis === 'function') return new Date(v.toMillis());
    if (typeof v === 'number' && v > 0) return new Date(v);
    if (typeof v?.seconds === 'number') return new Date(v.seconds * 1000);
    return null;
  };

  const feedbackWithType = (feedback || []).map((f) => {
    const d = toDate(f.submittedAt) || toDate(f.createdAt) || toDate(f.timestamp);
    return {
      ...f,
      _type: f.type || 'suggestion',
      _id: `feedback-${f.id}`,
      _date: d || new Date(),
      _status: f.status || 'new',
      _email: f.userEmail || 'Unknown',
      _preview: f.message || f.feedback || 'No message',
      adminStatus: f.adminStatus || null,
      adminNotes: f.adminNotes || '',
      adminReadAt: f.adminReadAt || null,
      adminMarkedUnread: f.adminMarkedUnread === true,
    };
  });

  const handleMarkReviewed = async (item) => {
    await handleUpdateFeedback(item.id, { status: 'reviewed' });
    window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Marked as reviewed', type: 'success' } }));
  };

  const handleMarkResolved = async (item) => {
    await handleUpdateFeedback(item.id, { status: 'resolved' });
    window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: '✓ Resolved — removed from queue', type: 'success' } }));
  };

  const handleDelete = async (item) => {
    const deleted = await handleDeleteFeedback(item?.id);
    if (!deleted) return;
    window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Feedback deleted', type: 'success' } }));
  };

  const handleReply = async (item, replyText) => {
    await handleRespondToFeedback(item, replyText);
  };

  return (
    <WorkQueue
        theme={theme}
        feedbackItems={feedbackWithType}
        onFeedbackMarkReviewed={handleMarkReviewed}
        onFeedbackMarkResolved={handleMarkResolved}
        onFeedbackDelete={handleDelete}
        onFeedbackReply={handleReply}
    />
  );
}
