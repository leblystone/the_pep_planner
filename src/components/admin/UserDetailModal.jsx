import React, { useMemo, useState, useEffect } from 'react';
import { X, Users, Envelope, Calendar, Clock, CreditCard, Medal, Gift, Shield, Book, Coffee, CircleNotch, Copy, Check, DeviceMobile, Desktop, Code, Warning, ArrowsClockwise, ChatCircle, PaperPlaneTilt, Siren, Bug, ClockCounterClockwise, ArrowSquareOut, Globe, DeviceTablet, Fire, Pulse, CheckCircle } from '@phosphor-icons/react';
import { createAdminMessage, createSupportTicket, debugUserSubscription, fetchUserActivityHistory, fetchUserCommunications, adminRevokeAndRestoreTrial, getAdminUserProfileViaCallable, adminRunSubscriptionReconciliation } from '../../services/firebase';
import { calcTrialEndFallback } from '../../utils/trialDays';
import { detectDevice } from '../../utils/deviceDetection';
import { resolveAdminBillingContext } from '../../utils/adminHelpers';
import { getAdminRenewalOutlook, isSubscriptionCancelingRenewal } from '../../utils/renewalDate';
import { AdminSectionHelp, AdminCollapsibleSection } from './adminUi';
import { Link } from 'react-router-dom';

function RevokeAndRestoreTrialAction({ user, theme }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleRevoke = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await adminRevokeAndRestoreTrial(user.uid || user.id, reason || 'Refund confirmed — admin manual revocation');
      setResult({ type: 'success', data: res });
      window.dispatchEvent(new CustomEvent('tpp:admin:user-subscription-synced', { detail: { userId: user.uid || user.id } }));
    } catch (e) {
      setResult({ type: 'error', message: e.message || 'Failed' });
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
        style={{ backgroundColor: theme.error + '15', color: theme.error, border: `1px solid ${theme.error}30` }}
      >
        <ArrowsClockwise size={12} />
        Stripe refunded but account not updated? Revoke &amp; Restore Trial
      </button>
    );
  }

  return (
    <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: theme.error + '10', border: `1px solid ${theme.error}30` }}>
      <div className="flex items-start gap-2">
        <Warning size={14} style={{ color: theme.error }} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-xs font-bold" style={{ color: theme.error }}>Revoke Lifetime &amp; Restore Trial</p>
          <p className="text-[11px] mt-0.5" style={{ color: theme.textLight }}>
            Use when Stripe confirmed a refund but the webhook didn&apos;t fire. This will revoke lifetime access, calculate remaining trial days, and put the account back into trial.
          </p>
        </div>
      </div>
      <textarea
        value={reason}
        onChange={e => setReason(e.target.value)}
        placeholder="Reason / notes (e.g. Refund confirmed in Stripe on Feb 28)"
        rows={2}
        className="w-full text-xs p-2 rounded-lg resize-none"
        style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}`, outline: 'none' }}
      />
      {result?.type === 'success' && (
        <div className="p-2 rounded text-xs" style={{ backgroundColor: theme.success + '15', color: theme.success, border: `1px solid ${theme.success}30` }}>
          ✅ Done — {result.data.trialDaysRestored > 0 ? `${result.data.trialDaysRestored} trial day(s) restored.` : 'No trial days remaining.'} {result.data.trialRestoredNote} Refreshing...
        </div>
      )}
      {result?.type === 'error' && (
        <div className="p-2 rounded text-xs" style={{ backgroundColor: theme.error + '15', color: theme.error }}>
          ❌ {result.message}
        </div>
      )}
      <div className="flex gap-2">
        <button
          onClick={handleRevoke}
          disabled={loading}
          className="flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-60"
          style={{ backgroundColor: theme.error, color: '#fff' }}
        >
          {loading ? <CircleNotch size={12} className="animate-spin" /> : <ArrowsClockwise size={12} />}
          {loading ? 'Processing...' : 'Confirm Revoke & Restore'}
        </button>
        <button
          onClick={() => setOpen(false)}
          className="px-3 py-2 rounded-lg text-xs font-semibold"
          style={{ backgroundColor: theme.background, color: theme.textLight, border: `1px solid ${theme.border}` }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function UserHeaderUID({ user, theme }) {
  const [copied, setCopied] = useState(false);
  const uid = user.uid || user.id || 'N/A';
  const copy = () => {
    navigator.clipboard.writeText(uid);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col gap-1 mb-2">
      <p className="text-sm flex items-center gap-1.5" style={{ color: theme.textLight }}>
        <Envelope size={12} className="opacity-60" />
        {user.email}
      </p>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-50" style={{ color: theme.textLight }}>UID:</span>
        <code className="text-[10px] font-mono px-1.5 py-0.5 rounded truncate max-w-[160px]"
          style={{ backgroundColor: theme.background, color: theme.textLight, border: `1px solid ${theme.border}60` }}>
          {uid}
        </code>
        <button onClick={copy} className="p-1 rounded flex-shrink-0 transition-all"
          style={{ backgroundColor: theme.info + '20' }} title="Copy UID">
          {copied
            ? <Check size={11} style={{ color: theme.success }} />
            : <Copy size={11} style={{ color: theme.info }} />}
        </button>
      </div>
    </div>
  );
}

export default function UserDetailModal({
  user,
  onClose,
  theme: enhancedTheme,
  onExtendTrial,
  isExtendingTrial = false,
  isLoadingDetails = false,
  adminPassword = null,
  mode = 'modal',
  compact = false,
  reportContext = null,
}) {
  // Safety check
  if (!user) {
    console.error('❌ UserDetailModal: No user provided!');
    return null;
  }

  React.useEffect(() => {
    if (mode !== 'modal') return undefined;
    document.body.style.overflow = 'hidden';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mode]);

  // Check if user has lifetime access
  const [extensionDays, setExtensionDays] = useState('3');
  const [extensionNote, setExtensionNote] = useState('');
  const [localMessage, setLocalMessage] = useState(null);
  const [localMessageType, setLocalMessageType] = useState('success');
  
  // Support response state
  const [showOneWayModal, setShowOneWayModal] = useState(false);
  const [showTwoWayModal, setShowTwoWayModal] = useState(false);
  const [oneWayMessage, setOneWayMessage] = useState('');
  const [twoWayMessage, setTwoWayMessage] = useState('');
  const [twoWaySubject, setTwoWaySubject] = useState('');
  const [isSendingSupport, setIsSendingSupport] = useState(false);
  
  // Debug state
  const [isDebugging, setIsDebugging] = useState(false);

  // Auto-fix stale lifetime flags when status is refunded/revoked/disputed
  const [autoSyncStatus, setAutoSyncStatus] = useState(null); // null | 'syncing' | 'done' | 'error'
  React.useEffect(() => {
    const status = user.subscription?.status;
    const staleLifetime = user.subscription?.hasLifetimeAccess || user.subscription?.interval === 'lifetime';
    const isStale = ['refunded', 'revoked', 'disputed'].includes(status) && staleLifetime;
    if (!isStale || !user.subscription?.stripeCustomerId) return;

    let cancelled = false;
    setAutoSyncStatus('syncing');
    (async () => {
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const syncFn = httpsCallable(getFunctions(), 'manualSyncSubscription');
        await syncFn({ userId: user.uid || user.id });
        if (!cancelled) {
          setAutoSyncStatus('done');
          window.dispatchEvent(new CustomEvent('tpp:admin:user-subscription-synced', { detail: { userId: user.uid || user.id } }));
        }
      } catch (e) {
        if (!cancelled) setAutoSyncStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Tabs: summary | billing | profile | activity | comms
  const [activeTab, setActiveTab] = useState(reportContext ? 'billing' : 'summary');
  const [activityEvents, setActivityEvents] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [communications, setCommunications] = useState({ emails: [], adminMessages: [], supportTickets: [] });
  const [commsLoading, setCommsLoading] = useState(false);

  const hasLifetimeAccess = user.subscription?.hasLifetimeAccess || user.subscription?.interval === 'lifetime';

  // Refresh cancel-at-period-end from Stripe when Firestore is stale
  const [billingUserOverride, setBillingUserOverride] = useState(null);
  const [billingStripeSyncing, setBillingStripeSyncing] = useState(false);
  const billingUser = billingUserOverride ? { ...user, ...billingUserOverride } : user;
  useEffect(() => {
    setBillingUserOverride(null);
    setBillingStripeSyncing(false);
  }, [user?.uid, user?.id]);

  // Re-fetch profile after any sync button completes — no page reload needed
  useEffect(() => {
    const uid = user?.uid || user?.id;
    if (!uid) return;
    const handler = async (e) => {
      if (e.detail?.userId !== uid) return;
      try {
        const profile = await getAdminUserProfileViaCallable(uid);
        if (profile?.subscription) setBillingUserOverride(profile);
      } catch (_) {}
    };
    window.addEventListener('tpp:admin:user-subscription-synced', handler);
    return () => window.removeEventListener('tpp:admin:user-subscription-synced', handler);
  }, [user?.uid, user?.id]);

  useEffect(() => {
    const uid = user?.uid || user?.id;
    const sub = user?.subscription;
    if (!uid || !sub) return;
    const hasStripe =
      sub.stripeCustomerId ||
      user.stripeCustomerId ||
      sub.stripeSubscriptionId ||
      sub.paymentProvider === 'stripe' ||
      sub.source === 'stripe' ||
      sub.platform === 'stripe' ||
      (sub.status === 'active' && sub.latestInvoiceId);
    if (!hasStripe) return;
    if (isSubscriptionCancelingRenewal(sub)) return;
    if (!['active', 'trialing'].includes(sub.status)) return;

    let cancelled = false;
    setBillingStripeSyncing(true);
    (async () => {
      try {
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const syncFn = httpsCallable(getFunctions(), 'manualSyncSubscription');
        const syncResult = await syncFn({ userId: uid, stripeCustomerId: sub.stripeCustomerId || user.stripeCustomerId });
        if (cancelled) return;
        const profile = await getAdminUserProfileViaCallable(uid);
        if (!cancelled && profile?.subscription) {
          setBillingUserOverride(profile);
        } else if (!cancelled && syncResult.data?.success === false) {
          console.warn('Stripe sync:', syncResult.data?.message);
        }
      } catch (e) {
        console.warn('Could not refresh Stripe cancel status:', e?.message);
        try {
          const profile = await getAdminUserProfileViaCallable(uid);
          if (!cancelled && profile?.subscription) {
            setBillingUserOverride(profile);
          }
        } catch (_) {}
      } finally {
        if (!cancelled) setBillingStripeSyncing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [
    user?.uid,
    user?.id,
    user?.subscription?.status,
    user?.subscription?.cancelAtPeriodEnd,
    user?.subscription?.stripeCustomerId,
    user?.stripeCustomerId,
  ]);

  // Get account status - using same logic as UserTable for consistency
  const getSubscriptionStatus = () => {
    const now = new Date();
    const subUser = billingUser;

    // Check active PAID subscription first — never show "Trial" for paid users
    if (hasLifetimeAccess) {
      return { 
        label: 'Lifetime Access', 
        color: '#FFD700', 
        bgColor: '#FFD70020', 
        borderColor: '#FFD70040' 
      };
    }

    const sub = subUser.subscription;
    
    // Check for active paid subscription
    if (sub?.status === 'active' && sub?.plan) {
      const canceling = isSubscriptionCancelingRenewal(sub);
      const cancelStyle = {
        color: enhancedTheme.warning,
        bgColor: enhancedTheme.warning + '20',
        borderColor: enhancedTheme.warning + '45',
      };
      const withCancel = (label, style) =>
        canceling ? { label: `${label} · Not renewing`, ...cancelStyle } : style;

      if (sub.platform === 'squarespace' && sub.planType === 'annual') {
        return withCancel('Annual', { label: 'Annual', color: enhancedTheme.success, bgColor: enhancedTheme.success + '20', borderColor: enhancedTheme.success + '40' });
      }
      if (sub.platform === 'squarespace' || sub.platform === 'stripe') {
        return withCancel('Monthly', { label: 'Monthly', color: '#3B82F6', bgColor: '#3B82F620', borderColor: '#3B82F640' });
      }
      if (sub.platform === 'google-play') {
        return withCancel('Google Play', { label: 'Google Play', color: enhancedTheme.success, bgColor: enhancedTheme.success + '20', borderColor: enhancedTheme.success + '40' });
      }
      if (sub.platform === 'apple') {
        return withCancel('AppleLogo', { label: 'AppleLogo', color: enhancedTheme.success, bgColor: enhancedTheme.success + '20', borderColor: enhancedTheme.success + '40' });
      }
      return withCancel('Active', { label: 'Active', color: enhancedTheme.success, bgColor: enhancedTheme.success + '20', borderColor: enhancedTheme.success + '40' });
    }

    if (isSubscriptionCancelingRenewal(sub)) {
      return {
        label: 'Not renewing',
        color: enhancedTheme.warning,
        bgColor: enhancedTheme.warning + '20',
        borderColor: enhancedTheme.warning + '45',
      };
    }
    
    // Check for refunded / disputed / revoked
    if (sub?.status === 'refunded') {
      return { label: 'Refunded', color: enhancedTheme.error, bgColor: enhancedTheme.error + '20', borderColor: enhancedTheme.error + '40' };
    }
    if (sub?.status === 'disputed') {
      return { label: 'Disputed', color: enhancedTheme.error, bgColor: enhancedTheme.error + '20', borderColor: enhancedTheme.error + '40' };
    }
    if (sub?.status === 'revoked') {
      return { label: 'Revoked', color: enhancedTheme.error, bgColor: enhancedTheme.error + '20', borderColor: enhancedTheme.error + '40' };
    }

    // Check for expired subscription (skip if still in paid window after cancel-at-period-end)
    if (
      (sub?.status === 'canceled' && !isSubscriptionCancelingRenewal(sub)) ||
      sub?.status === 'expired' ||
      sub?.status === 'past_due'
    ) {
      return { label: 'Subscription Expired', color: enhancedTheme.error, bgColor: enhancedTheme.error + '20', borderColor: enhancedTheme.error + '40' };
    }

    // No paid subscription — check trial
    let trialEndDate = null;
    if (user.trialEndDate) {
      trialEndDate = coerceAdminDate(user.trialEndDate);
    } else if (sub?.status === 'trialing' && sub?.currentPeriodEnd) {
      trialEndDate = coerceAdminDate(sub.currentPeriodEnd);
    } else if (user.createdAt) {
      const createdDate = coerceAdminDate(user.createdAt);
      if (createdDate) trialEndDate = calcTrialEndFallback(createdDate);
    }
    if (trialEndDate) {
      if (trialEndDate > now) {
        const daysLeft = Math.ceil((trialEndDate - now) / (1000 * 60 * 60 * 24));
        return { label: `Trial (${daysLeft}d left)`, color: '#F59E0B', bgColor: '#F59E0B20', borderColor: '#F59E0B40' };
      }
      return { label: 'Trial Expired', color: enhancedTheme.error, bgColor: enhancedTheme.error + '20', borderColor: enhancedTheme.error + '40' };
    }
    return { label: 'Unknown', color: '#9CA3AF', bgColor: '#9CA3AF20', borderColor: '#9CA3AF40' };
  };

  const subscriptionStatusDisplay = getSubscriptionStatus();
  const isLifetimeGranted = user.subscription?.lifetimeReason && !user.subscription?.paymentMethodId;
  const subscriptionStatus = user.subscription?.status || 'unknown';
  const subscriptionPlan = user.subscription?.plan?.name || user.subscription?.plan || 'No subscription';
  const subscriptionInterval = user.subscription?.interval || 'N/A';

  const trialEndDate = useMemo(() => {
    if (!user) return null;
    return (
      coerceAdminDate(user.subscription?.currentPeriodEnd) ||
      coerceAdminDate(user.trialEndDate) ||
      null
    );
  }, [user]);

  const trialDaysRemaining = useMemo(() => {
    if (!trialEndDate) return null;
    const diff = trialEndDate.getTime() - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, [trialEndDate]);

  const trialStatusLabel = user.subscription?.status || (trialEndDate ? (trialEndDate.getTime() > Date.now() ? 'trialing' : 'expired') : 'unknown');
  const trialPlanName = subscriptionPlan !== 'No subscription' ? subscriptionPlan : 'Research Trial';
  const extensionHistory = useMemo(() => {
    if (!Array.isArray(user.trialExtensionHistory)) return [];
    return [...user.trialExtensionHistory].sort((a, b) => {
      const aTime = new Date(a.extendedAt || a.newEnd || 0).getTime();
      const bTime = new Date(b.extendedAt || b.newEnd || 0).getTime();
      return bTime - aTime;
    });
  }, [user.trialExtensionHistory]);

  const handleExtendTrialClick = async () => {
    if (!onExtendTrial || !user) {
      return;
    }

    const parsedDays = Number(extensionDays);
    if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
      setLocalMessage('Enter at least one full day to extend research access.');
      setLocalMessageType('error');
      return;
    }

    try {
      setLocalMessage(null);
      await onExtendTrial({
        userId: user.uid || user.id,
        days: parsedDays,
        note: extensionNote.trim()
      });
      setLocalMessage('✅ Trial extended! The researcher MUST log out and log back in (or refresh their browser) to see their reactivated trial access.');
      setLocalMessageType('success');
      setExtensionNote('');
    } catch (error) {
      setLocalMessage(error.message || 'Unable to extend the research trial right now.');
      setLocalMessageType('error');
    }
  };

  const handleSendOneWayMessage = async () => {
    if (!oneWayMessage.trim() || !user?.email) {
      setLocalMessage('Please enter a message.');
      setLocalMessageType('error');
      return;
    }

    setIsSendingSupport(true);
    setLocalMessage(null);
    
    try {
      // No password needed — cloud function verifies admin via Firebase Auth token
      await createAdminMessage(user.email, oneWayMessage.trim(), { source: 'one-way' });
      setLocalMessage('One-way support message sent successfully! 📨');
      setLocalMessageType('success');
      setOneWayMessage('');
      setShowOneWayModal(false);
      
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'One-way message sent! The user will see it in their dashboard.', type: 'success' }
      }));
    } catch (error) {
      console.error('❌ Failed to send one-way message:', error);
      setLocalMessage(error.message || 'Failed to send message. Please try again.');
      setLocalMessageType('error');
      
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Failed to send message', type: 'error' }
      }));
    } finally {
      setIsSendingSupport(false);
    }
  };

  const handleSendTwoWayMessage = async () => {
    if (!twoWayMessage.trim() || !twoWaySubject.trim() || !user?.email) {
      setLocalMessage('Please enter both a subject and message.');
      setLocalMessageType('error');
      return;
    }

    setIsSendingSupport(true);
    setLocalMessage(null);
    
    try {
      await createSupportTicket({
        userId: user.uid || user.id || null,
        userEmail: user.email,
        userName: user.displayName || user.email?.split('@')[0] || 'App User',
        type: 'support',
        subject: twoWaySubject.trim(),
        message: twoWayMessage.trim(),
        metadata: {
          createdBy: 'admin',
          userAgent: 'Admin Panel',
          url: window.location.href
        }
      });
      
      setLocalMessage('Two-way support ticket created successfully! 🎫');
      setLocalMessageType('success');
      setTwoWayMessage('');
      setTwoWaySubject('');
      setShowTwoWayModal(false);
      
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Support ticket created! The user can now respond.', type: 'success' }
      }));
    } catch (error) {
      console.error('❌ Failed to create support ticket:', error);
      setLocalMessage(error.message || 'Failed to create ticket. Please try again.');
      setLocalMessageType('error');
      
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Failed to create ticket', type: 'error' }
      }));
    } finally {
      setIsSendingSupport(false);
    }
  };

  const trialEndDisplay = trialEndDate
    ? trialEndDate.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : 'Not scheduled';
  const trialDaysText = trialDaysRemaining === null
    ? 'No active trial'
    : trialDaysRemaining === 0
      ? 'Expired'
      : `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} remaining`;
  const disableExtendAction = isExtendingTrial || isLoadingDetails;
  const extensionButtonLabel = isExtendingTrial ? 'Adding Time…' : 'Add Research Time';

  const isPanel = mode === 'panel';
  const shellClass = isPanel
    ? `flex flex-col w-full h-full min-h-0 overflow-hidden ${compact ? '' : 'rounded-xl border'}`
    : 'fixed inset-0 bg-black bg-opacity-50 z-50 backdrop-blur-sm flex items-start justify-center overflow-y-auto';
  const shellStyle = isPanel
    ? {
        backgroundColor: enhancedTheme.cardBackground,
        borderColor: enhancedTheme.border,
        border: compact ? 'none' : `1px solid ${enhancedTheme.border}`,
      }
    : { paddingTop: '2rem', paddingBottom: '2rem', paddingLeft: '1rem', paddingRight: '1rem' };
  const innerClass = isPanel
    ? 'flex flex-col relative w-full h-full min-h-0 overflow-hidden'
    : 'bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto relative';

  return (
    <div className={shellClass} style={shellStyle}>
      <div className={innerClass} 
        style={{ 
          backgroundColor: enhancedTheme.cardBackground,
          border: `1px solid ${enhancedTheme.border}`,
          boxShadow: `0 20px 60px ${enhancedTheme.primary}20`
        }}>
        {!isPanel && (
          <>
            <div className="absolute top-0 right-0 opacity-5 pointer-events-none">
              <Coffee size={150} style={{ color: enhancedTheme.accent }} />
            </div>
            <div className="absolute bottom-0 left-0 opacity-5 pointer-events-none">
              <Book size={120} style={{ color: enhancedTheme.primary }} />
            </div>
          </>
        )}

        {/* Header — slim bar in Support compact mode to save vertical space */}
        {compact ? (
          <div
            className={`px-3 py-2 border-b flex justify-between items-center relative z-10 ${isPanel ? 'flex-shrink-0' : ''}`}
            style={{
              borderColor: enhancedTheme.border,
              backgroundColor: enhancedTheme.background,
            }}
          >
            <p className="text-xs font-semibold" style={{ color: enhancedTheme.primaryDark }}>
              Account tools
            </p>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md hover:opacity-80"
              style={{
                backgroundColor: enhancedTheme.cardBackground,
                border: `1px solid ${enhancedTheme.border}`,
              }}
              title="Close account tools"
            >
              <X size={14} style={{ color: enhancedTheme.textLight }} />
            </button>
          </div>
        ) : (
          <div
            className={`p-4 border-b flex justify-between items-center relative z-10 ${isPanel ? 'flex-shrink-0' : ''}`}
            style={{
              borderColor: enhancedTheme.border + '40',
              background: `linear-gradient(135deg, ${enhancedTheme.primaryLight}08 0%, ${enhancedTheme.cardBackground} 100%)`,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
                style={{ 
                  background: `linear-gradient(135deg, ${enhancedTheme.primary} 0%, ${enhancedTheme.primaryDark} 100%)`,
                  boxShadow: `0 4px 15px ${enhancedTheme.primary}40`
                }}>
                <Users size={20} style={{ color: '#FFFFFF' }} />
              </div>
              <div>
                <h2 className="font-bold text-xl" style={{ color: enhancedTheme.primaryDark }}>
                  User Details
                </h2>
                <p className="text-xs flex items-center gap-1.5" style={{ color: enhancedTheme.textLight }}>
                  <Book size={10} className="opacity-60" />
                  View user information
                </p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="p-2 rounded-lg hover:scale-110 transition-transform duration-200"
              style={{ 
                backgroundColor: enhancedTheme.background,
                border: `1px solid ${enhancedTheme.border}40`
              }}
            >
              <X size={18} style={{ color: enhancedTheme.textLight }} />
            </button>
          </div>
        )}
 
        <div
          className={`${compact ? 'p-3' : 'p-4'} space-y-3 relative z-10 flex-1 min-h-0 ${
            isPanel ? 'overflow-y-auto overflow-x-hidden overscroll-y-contain' : ''
          }`}
        >
          {reportContext && !compact && (
            <div
              className="p-2.5 rounded-lg flex items-start justify-between gap-2 text-xs"
              style={{ backgroundColor: enhancedTheme.info + '12', border: `1px solid ${enhancedTheme.info}35` }}
            >
              <div>
                <p className="font-semibold" style={{ color: enhancedTheme.info }}>
                  Linked report
                  {reportContext.ticketNumber ? ` #${reportContext.ticketNumber}` : ''}
                </p>
                <p style={{ color: enhancedTheme.textLight }}>
                  Account loaded from {reportContext.source || 'support'} — fix billing here while you reply in the thread.
                </p>
              </div>
              <Link
                to={`/admin/users/subscriptions?uid=${encodeURIComponent(user.uid || user.id || '')}${reportContext.ticketId ? `&ticketId=${encodeURIComponent(reportContext.ticketId)}` : ''}`}
                className="shrink-0 font-semibold underline"
                style={{ color: enhancedTheme.primary }}
              >
                Open in Users
              </Link>
            </div>
          )}
          {reportContext && compact && (
            <div className="flex items-center justify-between gap-2 text-[10px]" style={{ color: enhancedTheme.textLight }}>
              <span>
                From report{reportContext.ticketNumber ? ` #${reportContext.ticketNumber}` : ''}
              </span>
              <Link
                to={`/admin/users/subscriptions?uid=${encodeURIComponent(user.uid || user.id || '')}${reportContext.ticketId ? `&ticketId=${encodeURIComponent(reportContext.ticketId)}` : ''}`}
                className="font-semibold underline shrink-0"
                style={{ color: enhancedTheme.primary }}
              >
                Open in Users
              </Link>
            </div>
          )}
          {/* User Info Header */}
          {compact ? (
            <div
              className="rounded-lg border p-2.5"
              style={{ borderColor: enhancedTheme.border, backgroundColor: enhancedTheme.background }}
            >
              <div className="flex items-center gap-2.5">
                <img
                  className="h-10 w-10 rounded-lg border shrink-0"
                  src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=${enhancedTheme.primary.replace('#', '')}&color=ffffff`}
                  alt=""
                  style={{ borderColor: enhancedTheme.primary }}
                />
                <div className="flex-1 min-w-0">
                  <UserHeaderUID user={user} theme={enhancedTheme} />
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold inline-flex items-center gap-1"
                      style={{
                        backgroundColor: subscriptionStatusDisplay.bgColor,
                        color: subscriptionStatusDisplay.color,
                        border: `1px solid ${subscriptionStatusDisplay.borderColor}`,
                      }}
                    >
                      {subscriptionStatusDisplay.label}
                    </span>
                    <span className="text-[10px]" style={{ color: enhancedTheme.textLight }}>
                      Joined{' '}
                      {user.createdAt?.toDate
                        ? new Date(user.createdAt.toDate()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'N/A'}
                      {' · '}
                      Active{' '}
                      {user.lastActive?.toDate
                        ? new Date(user.lastActive.toDate()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div
                className="relative rounded-xl p-3 overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${enhancedTheme.primaryLight}10 0%, ${enhancedTheme.accent}08 100%)`,
                  border: `1px solid ${enhancedTheme.border}40`,
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      className="h-16 w-16 rounded-xl shadow-lg border-2"
                      src={user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=${enhancedTheme.primary.replace('#', '')}&color=ffffff`}
                      alt=""
                      style={{ borderColor: enhancedTheme.primary }}
                    />
                    <div
                      className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center shadow-md"
                      style={{ backgroundColor: subscriptionStatusDisplay.color }}
                    >
                      <div className="w-2 h-2 rounded-full bg-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <UserHeaderUID user={user} theme={enhancedTheme} />
                    <span
                      className="px-3 py-1 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5"
                      style={{
                        backgroundColor: subscriptionStatusDisplay.bgColor,
                        color: subscriptionStatusDisplay.color,
                        border: `1px solid ${subscriptionStatusDisplay.borderColor}`,
                      }}
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: subscriptionStatusDisplay.color }} />
                      {subscriptionStatusDisplay.label}
                    </span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-xl" style={{ backgroundColor: enhancedTheme.background, border: `1px solid ${enhancedTheme.border}40` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar size={14} style={{ color: enhancedTheme.info }} />
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: enhancedTheme.textLight }}>Registered</p>
                  </div>
                  <p className="text-sm font-medium" style={{ color: enhancedTheme.text }}>
                    {user.createdAt?.toDate
                      ? new Date(user.createdAt.toDate()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'N/A'}
                  </p>
                </div>
                <div className="p-3 rounded-xl" style={{ backgroundColor: enhancedTheme.background, border: `1px solid ${enhancedTheme.border}40` }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} style={{ color: enhancedTheme.warning }} />
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: enhancedTheme.textLight }}>Last Active</p>
                  </div>
                  <p className="text-sm font-medium" style={{ color: enhancedTheme.text }}>
                    {user.lastActive?.toDate
                      ? new Date(user.lastActive.toDate()).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'N/A'}
                  </p>
                </div>
              </div>
            </>
          )}

          {/* Tab bar */}
          <div
            className="flex gap-0.5 p-1 rounded-xl border overflow-x-auto"
            style={{ borderColor: enhancedTheme.border, backgroundColor: enhancedTheme.background, scrollbarWidth: 'none' }}
          >
            {[
              { id: 'summary', label: 'Summary', icon: Users },
              { id: 'billing', label: 'Billing', icon: CreditCard },
              { id: 'profile', label: 'Profile', icon: DeviceMobile },
              { id: 'activity', label: compact ? 'Activity' : 'Pulse Log', icon: ClockCounterClockwise },
              { id: 'comms', label: compact ? 'Comms' : 'Communications', icon: ChatCircle },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex-1 min-w-0 flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                  compact ? 'text-[10px]' : 'text-xs'
                }`}
                style={{
                  backgroundColor: activeTab === id ? enhancedTheme.primary : 'transparent',
                  color: activeTab === id ? '#FFFFFF' : enhancedTheme.textLight,
                }}
              >
                <Icon size={compact ? 12 : 14} className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>

          {/* Tab: Summary — status + quick actions only */}
          {activeTab === 'summary' && (
            <>
              <SubscriptionLifecycleSummary user={billingUser} theme={enhancedTheme} subscriptionStatusDisplay={subscriptionStatusDisplay} syncingStripe={billingStripeSyncing} />

              <button
                type="button"
                onClick={() => setActiveTab('billing')}
                className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition-opacity hover:opacity-90"
                style={{
                  borderColor: enhancedTheme.border,
                  backgroundColor: enhancedTheme.background,
                  color: enhancedTheme.primary,
                }}
              >
                <span className="flex items-center gap-2">
                  <ArrowsClockwise size={14} />
                  Sync, grants & subscription tools
                </span>
                <span style={{ color: enhancedTheme.textLight }}>Open →</span>
              </button>

              <div
                className="rounded-xl border p-3"
                style={{ borderColor: enhancedTheme.border, backgroundColor: enhancedTheme.cardBackground }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Shield size={14} style={{ color: enhancedTheme.warning }} />
                  <h4 className="font-bold text-sm" style={{ color: enhancedTheme.primaryDark }}>Quick actions</h4>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowOneWayModal(true)}
                    className="p-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2"
                    style={{ backgroundColor: enhancedTheme.info, color: '#FFFFFF' }}
                  >
                    <ChatCircle size={14} />
                    Message
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowTwoWayModal(true)}
                    className="p-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2"
                    style={{ backgroundColor: enhancedTheme.primary, color: enhancedTheme.textOnPrimary || '#FFFFFF' }}
                  >
                    <PaperPlaneTilt size={14} />
                    Ticket
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Tab: Billing — channel first, then targeted fixes */}
          {activeTab === 'billing' && (
            <>
              <BillingContextBanner user={billingUser} theme={enhancedTheme} />
              <SubscriptionLifecycleSummary
                user={billingUser}
                theme={enhancedTheme}
                subscriptionStatusDisplay={subscriptionStatusDisplay}
                syncingStripe={billingStripeSyncing}
                compact={compact}
              />
              <SubscriptionFixesSection
                user={billingUser}
                theme={enhancedTheme}
                defaultOpen={!!compact}
              />

          <AdminCollapsibleSection
            title="Trial extension & access details"
            icon={Medal}
            theme={enhancedTheme}
            defaultOpen={false}
          >
          <div className="relative z-10 space-y-3">
              {/* Auto-sync status indicator */}
              {autoSyncStatus === 'syncing' && (
                <div className="mb-3 p-2.5 rounded-lg flex items-center gap-2"
                  style={{ backgroundColor: enhancedTheme.info + '12', border: `1px solid ${enhancedTheme.info}30` }}>
                  <CircleNotch size={13} style={{ color: enhancedTheme.info }} className="animate-spin flex-shrink-0" />
                  <p className="text-xs" style={{ color: enhancedTheme.textLight }}>
                    Detected stale data — auto-syncing with Stripe...
                  </p>
                </div>
              )}
              {autoSyncStatus === 'done' && (
                <div className="mb-3 p-2.5 rounded-lg flex items-center gap-2"
                  style={{ backgroundColor: enhancedTheme.success + '12', border: `1px solid ${enhancedTheme.success}30` }}>
                  <Check size={13} style={{ color: enhancedTheme.success }} className="flex-shrink-0" />
                  <p className="text-xs" style={{ color: enhancedTheme.textLight }}>
                    Synced — refreshing...
                  </p>
                </div>
              )}
              {autoSyncStatus === 'error' && (
                <div className="mb-3 p-2.5 rounded-lg flex items-center gap-2"
                  style={{ backgroundColor: enhancedTheme.warning + '12', border: `1px solid ${enhancedTheme.warning}30` }}>
                  <Warning size={13} style={{ color: enhancedTheme.warning }} className="flex-shrink-0" />
                  <p className="text-xs" style={{ color: enhancedTheme.textLight }}>
                    Auto-sync failed — use Force Sync in debug panel
                  </p>
                </div>
              )}
              {hasLifetimeAccess ? (
                <div className="space-y-2">
                  <div className="p-3 rounded-lg"
                    style={{ 
                      backgroundColor: isLifetimeGranted ? '#A3B18A20' : enhancedTheme.success + '15',
                      border: `1px solid ${isLifetimeGranted ? '#A3B18A40' : enhancedTheme.success + '30'}`
                    }}>
                    <div className="flex items-center gap-2 mb-1">
                      {isLifetimeGranted ? (
                        <Gift size={16} style={{ color: '#A3B18A' }} />
                      ) : (
                        <Medal size={16} style={{ color: enhancedTheme.success }} />
                      )}
                      <span className="text-sm font-semibold" style={{ color: enhancedTheme.text }}>
                        {isLifetimeGranted ? 'Lifetime Granted' : 'Lifetime Access'}
                      </span>
                    </div>
                    {isLifetimeGranted && user.subscription?.lifetimeReason && (
                      <p className="text-xs flex items-center gap-1.5" style={{ color: enhancedTheme.textLight }}>
                        <Book size={10} />
                        Reason: {user.subscription.lifetimeReason}
                      </p>
                    )}
                    {!isLifetimeGranted && (
                      <p className="text-xs flex items-center gap-1.5" style={{ color: enhancedTheme.textLight }}>
                        <Coffee size={10} />
                        Purchased lifetime access
                      </p>
                    )}
                  </div>
                  {/* Manual revoke + trial restore — for when Stripe webhook doesn't fire */}
                  <RevokeAndRestoreTrialAction user={user} theme={enhancedTheme} />
                </div>
              ) : subscriptionPlan !== 'No subscription' ? (
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 rounded-lg"
                    style={{ backgroundColor: enhancedTheme.background + '60' }}>
                    <span className="text-xs font-medium" style={{ color: enhancedTheme.textLight }}>Plan</span>
                    <p className="text-sm font-semibold" style={{ color: enhancedTheme.text }}>{subscriptionPlan}</p>
                  </div>
                  <div className="p-2 rounded-lg"
                    style={{ backgroundColor: enhancedTheme.background + '60' }}>
                    <span className="text-xs font-medium" style={{ color: enhancedTheme.textLight }}>Billing</span>
                    <p className="text-sm font-semibold" style={{ color: enhancedTheme.text }}>{subscriptionInterval}</p>
                  </div>
                  <div className="p-2 rounded-lg"
                    style={{ backgroundColor: enhancedTheme.background + '60' }}>
                    <span className="text-xs font-medium" style={{ color: enhancedTheme.textLight }}>Status</span>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold inline-block mt-1"
                      style={{
                        backgroundColor: subscriptionStatus === 'active' ? enhancedTheme.success + '20' : enhancedTheme.warning + '20',
                        color: subscriptionStatus === 'active' ? enhancedTheme.success : enhancedTheme.warning
                      }}>
                      {subscriptionStatus}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="p-3 rounded-lg text-center"
                  style={{ backgroundColor: enhancedTheme.background + '60' }}>
                  <p className="text-sm flex items-center justify-center gap-2" style={{ color: enhancedTheme.textLight }}>
                    <Book size={14} className="opacity-60" />
                    No active subscription on file
                  </p>
                  <p className="text-xs mt-1 flex items-center justify-center gap-1.5" style={{ color: enhancedTheme.textLight }}>
                    <Coffee size={10} />
                    Use the banner above — web (Stripe), iOS (App Store), or Android (Play)
                  </p>
                </div>
              )}
          </div>

          {!hasLifetimeAccess && (
            <div className="rounded-xl border p-3" 
              style={{ 
                borderColor: enhancedTheme.border,
                backgroundColor: enhancedTheme.cardBackground
              }}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ 
                    background: `linear-gradient(135deg, ${enhancedTheme.warning} 0%, ${enhancedTheme.warning}DD 100%)`,
                    boxShadow: `0 2px 8px ${enhancedTheme.warning}30`
                  }}>
                  <Clock size={14} style={{ color: '#FFFFFF' }} />
                </div>
                <h4 className="font-bold text-sm" style={{ color: enhancedTheme.primaryDark }}>Trial Controls</h4>
              </div>

              {isLoadingDetails ? (
                <div className="flex items-center justify-center gap-2 py-4 text-sm" style={{ color: enhancedTheme.textLight }}>
                  <CircleNotch size={16} className="animate-spin" />
                  <span>Loading...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded-lg" 
                      style={{ 
                        backgroundColor: enhancedTheme.background,
                        border: `1px solid ${enhancedTheme.border}30`
                      }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: enhancedTheme.textLight }}>Ends</p>
                      <p className="text-sm font-semibold" style={{ color: enhancedTheme.text }}>{trialEndDisplay}</p>
                      <p className="text-xs" style={{ color: enhancedTheme.textLight }}>{trialDaysText}</p>
                    </div>
                    <div className="p-2 rounded-lg" 
                      style={{ 
                        backgroundColor: enhancedTheme.background,
                        border: `1px solid ${enhancedTheme.border}30`
                      }}>
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: enhancedTheme.textLight }}>Status</p>
                      <p className="text-sm font-semibold capitalize" style={{ color: enhancedTheme.text }}>{trialStatusLabel}</p>
                      <p className="text-xs" style={{ color: enhancedTheme.textLight }}>{trialPlanName}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: enhancedTheme.textLight }}>Days to add</label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={extensionDays}
                        onChange={(e) => setExtensionDays(e.target.value)}
                        className="w-20 px-2 py-1.5 rounded border text-sm"
                        style={{ borderColor: enhancedTheme.border, backgroundColor: enhancedTheme.background, color: enhancedTheme.text }}
                        disabled={disableExtendAction}
                      />
                      <button
                        onClick={handleExtendTrialClick}
                        disabled={disableExtendAction}
                        className="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
                        style={{ 
                          backgroundColor: enhancedTheme.warning,
                          color: '#FFFFFF',
                          boxShadow: `0 4px 15px ${enhancedTheme.warning}30`
                        }}
                      >
                        {extensionButtonLabel}
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="Optional note for audit trail"
                      value={extensionNote}
                      onChange={(e) => setExtensionNote(e.target.value)}
                      className="w-full px-2 py-1.5 rounded border text-xs"
                      style={{ borderColor: enhancedTheme.border, backgroundColor: enhancedTheme.background, color: enhancedTheme.text }}
                      disabled={disableExtendAction}
                    />
                    {localMessage && (
                      <div className="px-2 py-1.5 rounded text-xs" 
                        style={{ 
                          backgroundColor: localMessageType === 'error' ? '#fef2f2' : enhancedTheme.success + '20',
                          color: localMessageType === 'error' ? '#b91c1c' : enhancedTheme.success,
                          border: `1px solid ${localMessageType === 'error' ? '#fecaca' : enhancedTheme.success + '40'}`
                        }}
                      >
                        {localMessage}
                      </div>
                    )}
                    <p className="text-[10px]" style={{ color: enhancedTheme.textLight }}>
                      User may need to sign out and back in to sync.
                    </p>
                  </div>

                  {extensionHistory.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: enhancedTheme.textLight }}>Extension history</p>
                      <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1">
                        {extensionHistory.map((entry, index) => {
                          const newEnd = entry.newEnd ? new Date(entry.newEnd) : null;
                          const entryLabel = newEnd && !Number.isNaN(newEnd.getTime())
                            ? newEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Unknown end date';
                          return (
                            <div key={`${entry.newEnd || index}-${index}`} className="p-2 rounded-lg" 
                              style={{ backgroundColor: enhancedTheme.background, border: `1px solid ${enhancedTheme.border}30` }}>
                              <div className="text-xs font-semibold" style={{ color: enhancedTheme.text }}>
                                +{entry.addedDays} day{entry.addedDays === 1 ? '' : 's'} • {entryLabel}
                              </div>
                              <p className="text-[10px]" style={{ color: enhancedTheme.textLight }}>
                                Extended by {entry.extendedBy || 'admin'} at {entry.extendedAt ? new Date(entry.extendedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'unknown time'}
                              </p>
                              {entry.note && (
                                <p className="text-[10px] mt-0.5" style={{ color: enhancedTheme.textLight }}>
                                  Note: {entry.note}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </AdminCollapsibleSection>

              <SubscriptionDebugSection user={user} theme={enhancedTheme} />
            </>
          )}

          {activeTab === 'profile' && (
            <>
              <TechnicalDetailsSection user={user} theme={enhancedTheme} />
              <EngagementSection user={user} theme={enhancedTheme} />
            </>
          )}

          {activeTab === 'activity' && (
            <ActivityLogTab
              user={user}
              theme={enhancedTheme}
              events={activityEvents}
              loading={activityLoading}
              onLoad={() => {
                if (activityEvents.length === 0 && !activityLoading) {
                  setActivityLoading(true);
                  fetchUserActivityHistory(user.uid || user.id)
                    .then((data) => { if (data?.events) setActivityEvents(data.events); })
                    .catch(() => setActivityEvents([]))
                    .finally(() => setActivityLoading(false));
                }
              }}
            />
          )}

          {activeTab === 'comms' && (
            <CommunicationsTab
              user={user}
              theme={enhancedTheme}
              data={communications}
              loading={commsLoading}
              onLoad={() => {
                const empty = communications.emails.length === 0 && communications.adminMessages.length === 0 && communications.supportTickets.length === 0;
                if (!empty || commsLoading) return;
                setCommsLoading(true);
                fetchUserCommunications(user.uid || user.id)
                  .then((data) => {
                    setCommunications({
                      emails: data?.emails || [],
                      adminMessages: data?.adminMessages || [],
                      supportTickets: data?.supportTickets || []
                    });
                  })
                  .catch(() => setCommunications({ emails: [], adminMessages: [], supportTickets: [] }))
                  .finally(() => setCommsLoading(false));
              }}
            />
          )}
          
          {/* One-Way Message Modal */}
          {showOneWayModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
                style={{ 
                  backgroundColor: enhancedTheme.cardBackground,
                  border: `1px solid ${enhancedTheme.border}`
                }}>
                <div className="p-6 border-b flex justify-between items-center"
                  style={{ borderColor: enhancedTheme.border }}>
                  <div className="flex items-center gap-2">
                    <ChatCircle size={20} style={{ color: enhancedTheme.info }} />
                    <h3 className="text-lg font-bold" style={{ color: enhancedTheme.primaryDark }}>
                      PaperPlaneTilt One-Way Message
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowOneWayModal(false);
                      setOneWayMessage('');
                    }}
                    className="p-2 rounded-lg hover:opacity-70"
                    style={{ backgroundColor: enhancedTheme.background }}
                  >
                    <X size={18} style={{ color: enhancedTheme.textLight }} />
                  </button>
                </div>
                
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: enhancedTheme.text }}>
                      Message to {user.email}
                    </label>
                    <textarea
                      value={oneWayMessage}
                      onChange={(e) => setOneWayMessage(e.target.value)}
                      rows={6}
                      className="w-full p-3 rounded-lg border text-sm"
                      style={{ 
                        borderColor: enhancedTheme.border, 
                        backgroundColor: enhancedTheme.background, 
                        color: enhancedTheme.text 
                      }}
                      placeholder="Type your message here. This will appear as a 'From the Team' notification in the user's dashboard."
                    />
                    <p className="text-xs mt-2" style={{ color: enhancedTheme.textLight }}>
                      This is a one-way message. The user will see it in their dashboard but cannot reply directly.
                    </p>
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowOneWayModal(false);
                        setOneWayMessage('');
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-semibold border"
                      style={{ borderColor: enhancedTheme.border, color: enhancedTheme.text }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendOneWayMessage}
                      disabled={!oneWayMessage.trim() || isSendingSupport}
                      className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      style={{ backgroundColor: enhancedTheme.info, color: '#FFFFFF' }}
                    >
                      {isSendingSupport ? (
                        <>
                          <CircleNotch size={14} className="animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <PaperPlaneTilt size={14} />
                          PaperPlaneTilt Message
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Two-Way Support Ticket Modal */}
          {showTwoWayModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-[60] backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative"
                style={{ 
                  backgroundColor: enhancedTheme.cardBackground,
                  border: `1px solid ${enhancedTheme.border}`
                }}>
                <div className="p-6 border-b flex justify-between items-center"
                  style={{ borderColor: enhancedTheme.border }}>
                  <div className="flex items-center gap-2">
                    <PaperPlaneTilt size={20} style={{ color: enhancedTheme.primary }} />
                    <h3 className="text-lg font-bold" style={{ color: enhancedTheme.primaryDark }}>
                      Open Support Ticket
                    </h3>
                  </div>
                  <button
                    onClick={() => {
                      setShowTwoWayModal(false);
                      setTwoWayMessage('');
                      setTwoWaySubject('');
                    }}
                    className="p-2 rounded-lg hover:opacity-70"
                    style={{ backgroundColor: enhancedTheme.background }}
                  >
                    <X size={18} style={{ color: enhancedTheme.textLight }} />
                  </button>
                </div>
                
                <div className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: enhancedTheme.text }}>
                      Subject
                    </label>
                    <input
                      type="text"
                      value={twoWaySubject}
                      onChange={(e) => setTwoWaySubject(e.target.value)}
                      className="w-full p-3 rounded-lg border text-sm"
                      style={{ 
                        borderColor: enhancedTheme.border, 
                        backgroundColor: enhancedTheme.background, 
                        color: enhancedTheme.text 
                      }}
                      placeholder="e.g., Account Question, Feature Request, etc."
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2" style={{ color: enhancedTheme.text }}>
                      Initial Message
                    </label>
                    <textarea
                      value={twoWayMessage}
                      onChange={(e) => setTwoWayMessage(e.target.value)}
                      rows={6}
                      className="w-full p-3 rounded-lg border text-sm"
                      style={{ 
                        borderColor: enhancedTheme.border, 
                        backgroundColor: enhancedTheme.background, 
                        color: enhancedTheme.text 
                      }}
                      placeholder="Type your initial message here. The user will be able to reply to this ticket."
                    />
                    <p className="text-xs mt-2" style={{ color: enhancedTheme.textLight }}>
                      This creates a support ticket that allows two-way conversation. The user can respond to your message.
                    </p>
                  </div>
                  
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => {
                        setShowTwoWayModal(false);
                        setTwoWayMessage('');
                        setTwoWaySubject('');
                      }}
                      className="px-4 py-2 rounded-lg text-sm font-semibold border"
                      style={{ borderColor: enhancedTheme.border, color: enhancedTheme.text }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSendTwoWayMessage}
                      disabled={!twoWayMessage.trim() || !twoWaySubject.trim() || isSendingSupport}
                      className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                      style={{ backgroundColor: enhancedTheme.primary, color: enhancedTheme.textOnPrimary || '#FFFFFF' }}
                    >
                      {isSendingSupport ? (
                        <>
                          <CircleNotch size={14} className="animate-spin" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <PaperPlaneTilt size={14} />
                          Create Ticket
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Subscription Lifecycle Summary - at-a-glance status, trial bar, billing dates, provider links
function SubscriptionLifecycleSummary({ user, theme, subscriptionStatusDisplay, syncingStripe = false, compact = false }) {
  const sub = user.subscription || {};
  const now = new Date();
  const isPaid = sub.status === 'active' && (
    sub.hasLifetimeAccess ||
    /lifetime|annual|year|monthly|month|google-play|apple/i.test([sub.plan, sub.billing, sub.interval, sub.platform].filter(Boolean).join(' '))
  );
  let trialEndDate = null;
  if (!isPaid) {
    if (user.trialEndDate) trialEndDate = user.trialEndDate?.toDate?.() || new Date(user.trialEndDate);
    else if (sub.status === 'trialing' && sub.currentPeriodEnd) trialEndDate = sub.currentPeriodEnd?.toDate?.() || new Date(sub.currentPeriodEnd);
    else if (user.createdAt) {
      const created = user.createdAt?.toDate?.() || new Date(user.createdAt);
      trialEndDate = calcTrialEndFallback(created);
    }
  }
  const trialDaysTotal = trialEndDate && user.createdAt ? Math.ceil((trialEndDate - (user.createdAt?.toDate?.() || new Date(user.createdAt))) / (24 * 60 * 60 * 1000)) : 14;
  const trialDaysLeft = trialEndDate && trialEndDate > now ? Math.ceil((trialEndDate - now) / (24 * 60 * 60 * 1000)) : 0;
  const trialDaysUsed = trialDaysTotal - trialDaysLeft;
  const trialProgress = trialDaysTotal > 0 ? Math.min(100, (trialDaysUsed / trialDaysTotal) * 100) : 0;

  const stripeCustomerId = sub.stripeCustomerId || user.stripeCustomerId;
  const source = sub.paymentProvider || sub.source;
  const stripeUrl = stripeCustomerId ? `https://dashboard.stripe.com/customers/${stripeCustomerId}` : null;
  const googlePlayUrl = (source === 'google_play' || source === 'googleplay') ? 'https://play.google.com/console/developers' : null;
  const appStoreUrl = (source === 'apple' || source === 'appstore') ? 'https://appstoreconnect.apple.com' : null;

  const lastBilledRaw = sub.latestInvoice?.createdAt || sub.lastPaymentDate;
  const lastBilled = lastBilledRaw ? (lastBilledRaw.toDate ? lastBilledRaw.toDate() : new Date(lastBilledRaw)) : null;
  const renewalOutlook = getAdminRenewalOutlook(sub);
  const showPeriodEnd =
    renewalOutlook.dateText &&
    (sub.status === 'active' || sub.status === 'canceling' || (sub.status === 'canceled' && renewalOutlook.canceling));

  return (
    <div className={`rounded-xl border relative overflow-hidden ${compact ? 'p-3' : 'p-4'}`}
      style={{ borderColor: theme.border, backgroundColor: theme.cardBackground, background: `linear-gradient(135deg, ${theme.cardBackground} 0%, ${theme.info}08 100%)` }}>
      <div className={`flex items-center gap-2 ${compact ? 'mb-2' : 'mb-3'}`}>
        <CreditCard size={16} style={{ color: theme.info }} />
        <h4 className="font-bold text-sm" style={{ color: theme.primaryDark }}>Subscription Lifecycle</h4>
      </div>
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium" style={{ color: theme.textLight }}>Status</span>
          <span className="px-2 py-1 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: subscriptionStatusDisplay.bgColor, color: subscriptionStatusDisplay.color, border: `1px solid ${subscriptionStatusDisplay.borderColor}` }}>
            {subscriptionStatusDisplay.label}
          </span>
        </div>
        {syncingStripe && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs" style={{ color: theme.textLight }}>
            <CircleNotch size={13} className="animate-spin" />
            Checking Stripe for cancel / renew status…
          </div>
        )}
        {renewalOutlook.statusNote && (
          <div
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: theme.warning + '18', color: theme.warning, border: `1px solid ${theme.warning}35` }}
          >
            <Warning size={14} weight="fill" />
            {renewalOutlook.statusNote}
          </div>
        )}
        {!isPaid && trialEndDate && trialEndDate > now && (
          <div>
            <div className="flex justify-between text-xs mb-1" style={{ color: theme.textLight }}>
              <span>Trial</span>
              <span>{trialDaysLeft}d left</span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: theme.background }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${trialProgress}%`, backgroundColor: theme.warning }} />
            </div>
          </div>
        )}
        {lastBilled && !Number.isNaN(lastBilled.getTime()) && (
          <div className="flex justify-between text-xs">
            <span style={{ color: theme.textLight }}>Last billed</span>
            <span style={{ color: theme.text }}>{lastBilled.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
        )}
        {showPeriodEnd && (
          <div className="space-y-0.5">
            <div className="flex justify-between text-xs gap-2">
              <span style={{ color: theme.textLight }}>{renewalOutlook.rowLabel}</span>
              <span
                className="font-semibold text-right"
                style={{ color: renewalOutlook.canceling ? theme.warning : theme.text }}
              >
                {renewalOutlook.dateText}
              </span>
            </div>
            {renewalOutlook.detail && (
              <p className="text-[10px] text-right font-medium" style={{ color: theme.warning }}>
                {renewalOutlook.detail}
              </p>
            )}
            {!renewalOutlook.canceling && (
              <p className="text-[10px] text-right" style={{ color: theme.textLight }}>
                Auto-renew expected
              </p>
            )}
          </div>
        )}
        {(sub.status === 'refunded' ||
          sub.status === 'expired' ||
          (sub.status === 'canceled' && !renewalOutlook.canceling)) && (
          <div className="text-xs" style={{ color: theme.error }}>{sub.status}</div>
        )}
        <div className="flex flex-wrap gap-2 pt-1 border-t" style={{ borderColor: theme.border }}>
          {stripeUrl && (
            <a href={stripeUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: theme.info + '20', color: theme.info }}>
              <ArrowSquareOut size={12} /> Stripe
            </a>
          )}
          {googlePlayUrl && (
            <a href={googlePlayUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: theme.success + '20', color: theme.success }}>
              <ArrowSquareOut size={12} /> Google Play
            </a>
          )}
          {appStoreUrl && (
            <a href={appStoreUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: theme.primary + '20', color: theme.primary }}>
              <ArrowSquareOut size={12} /> App Storefront
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// Derive lifecycle milestones from user + already-fetched events
function buildLifecycleMilestones(user, events) {
  const now = new Date();
  const sub = user.subscription || {};
  const milestones = [];

  const registered = user.createdAt?.toDate ? user.createdAt.toDate() : user.createdAt ? new Date(user.createdAt) : null;
  if (registered && !Number.isNaN(registered.getTime())) {
    milestones.push({ key: 'registered', label: 'Registered', date: registered, color: 'info', icon: '👤' });
  }

  // Trial window
  let trialEnd = user.trialEndDate?.toDate ? user.trialEndDate.toDate() : user.trialEndDate ? new Date(user.trialEndDate) : null;
  if (!trialEnd && user.subscription?.currentPeriodEnd) {
    trialEnd = user.subscription.currentPeriodEnd?.toDate ? user.subscription.currentPeriodEnd.toDate() : new Date(user.subscription.currentPeriodEnd);
  }
  if (!trialEnd && registered) trialEnd = calcTrialEndFallback(registered);
  if (trialEnd && !Number.isNaN(trialEnd.getTime())) {
    const expired = trialEnd <= now;
    milestones.push({ key: 'trial_end', label: expired ? 'Trial Ended' : 'Trial Ends', date: trialEnd, color: expired ? 'warning' : 'info', icon: '⏳' });
  }

  // Find first conversion (payment success / subscription created) from events
  const conversionTypes = ['invoice.payment_succeeded', 'customer.subscription.created', 'subscription_change'];
  const conversionStatuses = ['active'];
  let conversionDate = null;
  for (const ev of [...events].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))) {
    const t = ev.timestamp ? new Date(ev.timestamp) : null;
    if (!t || Number.isNaN(t.getTime())) continue;
    const isConversion =
      (ev.type === 'payment' && (ev.metadata?.type === 'invoice.payment_succeeded' || ev.title?.toLowerCase().includes('payment succeeded'))) ||
      (ev.type === 'subscription_change' && ev.severity === 'success' && t > (registered || new Date(0)));
    if (isConversion && (!conversionDate || t < conversionDate)) conversionDate = t;
  }
  if (!conversionDate && sub.status === 'active' && sub.currentPeriodStart) {
    const d = new Date(sub.currentPeriodStart);
    if (!Number.isNaN(d.getTime())) conversionDate = d;
  }
  if (conversionDate) {
    const daysIntoTrial = registered ? Math.round((conversionDate - registered) / (24 * 60 * 60 * 1000)) : null;
    milestones.push({
      key: 'converted',
      label: 'Converted',
      sublabel: daysIntoTrial != null ? `Day ${daysIntoTrial} of trial` : null,
      date: conversionDate,
      color: 'success',
      icon: '✅',
      highlight: true
    });
  }

  // Refund / cancellation / revoke
  const endStatuses = { refunded: { label: 'Refunded', icon: '↩️', color: 'error' }, revoked: { label: 'Revoked', icon: '🚫', color: 'error' }, disputed: { label: 'Disputed', icon: '⚠️', color: 'error' }, canceled: { label: 'Canceled', icon: '✖️', color: 'warning' }, expired: { label: 'Expired', icon: '⌛', color: 'warning' } };
  if (endStatuses[sub.status]) {
    // Try to find when it happened from events
    let endDate = null;
    for (const ev of events) {
      if (['error', 'warning'].includes(ev.severity) && ev.type !== 'communication') {
        const t = ev.timestamp ? new Date(ev.timestamp) : null;
        if (t && !Number.isNaN(t.getTime())) { endDate = t; break; }
      }
    }
    if (!endDate) endDate = now;
    milestones.push({ key: 'ended', ...endStatuses[sub.status], date: endDate });
  }

  milestones.sort((a, b) => a.date - b.date);
  return milestones;
}

// Pulse Log tab - chronological event timeline
function ActivityLogTab({ user, theme, events, loading, onLoad }) {
  const calledRef = React.useRef(false);
  React.useEffect(() => {
    if (!calledRef.current) {
      calledRef.current = true;
      onLoad();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const severityColors = { success: theme.success, info: theme.info, warning: theme.warning, error: theme.error };
  const milestones = useMemo(() => buildLifecycleMilestones(user, events), [user, events]);

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const fmtTs = (d) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

  const colorMap = { success: theme.success, info: theme.info, warning: theme.warning, error: theme.error };

  return (
    <div className="space-y-3">
      {/* Subscription Lifecycle */}
      <div className="rounded-xl border p-4"
        style={{ borderColor: theme.border, backgroundColor: theme.cardBackground, background: `linear-gradient(135deg, ${theme.cardBackground} 0%, ${theme.primary}06 100%)` }}>
        <div className="flex items-center gap-2 mb-4">
          <CreditCard size={15} style={{ color: theme.primary }} />
          <h4 className="font-bold text-sm" style={{ color: theme.primaryDark }}>Subscription Lifecycle</h4>
        </div>

        {milestones.length === 0 ? (
          <p className="text-xs" style={{ color: theme.textLight }}>No lifecycle data available.</p>
        ) : (
          <>
            {/* Horizontal milestone track */}
            <div className="relative flex items-start gap-0 overflow-x-auto pb-1">
              {milestones.map((m, i) => {
                const col = colorMap[m.color] || theme.textLight;
                return (
                  <div key={m.key} className="flex items-start min-w-0" style={{ flex: '1 1 0' }}>
                    <div className="flex flex-col items-center w-full">
                      {/* Node */}
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-base shrink-0 shadow-sm"
                        style={{ backgroundColor: col + (m.highlight ? 'FF' : '22'), border: `2px solid ${col}`, fontSize: 14 }}>
                        {m.icon}
                      </div>
                      {/* Connector line */}
                      {i < milestones.length - 1 && (
                        <div className="absolute" style={{ top: 15, left: `calc(${(i + 0.5) * (100 / milestones.length)}% + 16px)`, width: `calc(${100 / milestones.length}% - 32px)`, height: 2, backgroundColor: theme.border }} />
                      )}
                      <div className="text-center mt-1.5 px-0.5 w-full">
                        <div className="text-[10px] font-bold leading-tight" style={{ color: col }}>{m.label}</div>
                        {m.sublabel && <div className="text-[9px] mt-0.5 font-semibold px-1 py-0.5 rounded-full inline-block" style={{ backgroundColor: col + '20', color: col }}>{m.sublabel}</div>}
                        <div className="text-[9px] mt-0.5" style={{ color: theme.textLight }}>{fmt(m.date)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Conversion stat callout */}
            {(() => {
              const reg = milestones.find(m => m.key === 'registered');
              const conv = milestones.find(m => m.key === 'converted');
              if (!reg || !conv) return null;
              const days = Math.round((conv.date - reg.date) / (24 * 60 * 60 * 1000));
              return (
                <div className="mt-3 p-2.5 rounded-lg flex items-center gap-2"
                  style={{ backgroundColor: theme.success + '12', border: `1px solid ${theme.success}30` }}>
                  <Medal size={14} style={{ color: theme.success }} />
                  <span className="text-xs" style={{ color: theme.text }}>
                    Converted <span className="font-bold" style={{ color: theme.success }}>Day {days}</span> after registration
                    {days <= 7 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: theme.success + '20', color: theme.success }}>Fast convert</span>}
                    {days > 7 && days <= 20 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: theme.warning + '20', color: theme.warning }}>Mid-trial</span>}
                    {days > 20 && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: theme.info + '20', color: theme.info }}>Late convert</span>}
                  </span>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {/* Chronological event list */}
      <div className="rounded-xl border p-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
        <div className="flex items-center gap-2 mb-4">
          <ClockCounterClockwise size={15} style={{ color: theme.primary }} />
          <h4 className="font-bold text-sm" style={{ color: theme.primaryDark }}>Event Timeline</h4>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-8 gap-2" style={{ color: theme.textLight }}>
            <CircleNotch size={20} className="animate-spin" />
            <span>Loading activity...</span>
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm py-4" style={{ color: theme.textLight }}>No activity events found.</p>
        ) : (
          <div className="space-y-0 max-h-[52vh] overflow-y-auto">
            {events.map((ev) => (
              <div key={ev.id} className="flex gap-3 py-3 border-b last:border-b-0" style={{ borderColor: theme.border }}>
                <div className="w-2 rounded-full shrink-0 mt-1.5" style={{ backgroundColor: severityColors[ev.severity] || theme.textLight }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: theme.text }}>{ev.title}</div>
                  {ev.description && <div className="text-xs mt-0.5" style={{ color: theme.textLight }}>{ev.description}</div>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase" style={{ color: theme.textLight }}>{fmtTs(ev.timestamp)}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: theme.background, color: theme.textLight }}>{ev.source}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Communications tab - emails, admin messages, support tickets
function CommunicationsTab({ user, theme, data, loading, onLoad }) {
  const calledRef = React.useRef(false);
  React.useEffect(() => {
    if (!calledRef.current) {
      calledRef.current = true;
      onLoad();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const { emails, adminMessages, supportTickets } = data;
  return (
    <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
      <div className="flex items-center gap-2">
        <ChatCircle size={18} style={{ color: theme.primary }} />
        <h4 className="font-bold" style={{ color: theme.primaryDark }}>Communications</h4>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2" style={{ color: theme.textLight }}>
          <CircleNotch size={20} className="animate-spin" />
          <span>Loading...</span>
        </div>
      ) : (
        <>
          {emails.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textLight }}>Emails sent</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {emails.slice(0, 30).map((e) => (
                  <div key={e.id} className="p-2 rounded-lg text-xs" style={{ backgroundColor: theme.background }}>
                    <span className="font-medium" style={{ color: theme.text }}>{e.type}</span>
                    {e.subject && <span className="ml-1" style={{ color: theme.textLight }}> – {e.subject}</span>}
                    <div style={{ color: theme.textLight }}>{e.sentAt ? new Date(e.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''} · {e.status}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {adminMessages.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textLight }}>Admin messages</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {adminMessages.slice(0, 20).map((m) => (
                  <div key={m.id} className="p-2 rounded-lg text-xs" style={{ backgroundColor: theme.background }}>
                    <div style={{ color: theme.text }}>{m.message?.slice(0, 80)}{m.message?.length > 80 ? '...' : ''}</div>
                    <div style={{ color: theme.textLight }}>{m.createdAt ? new Date(m.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {supportTickets.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase mb-2" style={{ color: theme.textLight }}>Support tickets</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {supportTickets.slice(0, 20).map((t) => (
                  <div key={t.id} className="p-2 rounded-lg text-xs" style={{ backgroundColor: theme.background }}>
                    <span className="font-medium" style={{ color: theme.text }}>#{t.ticketNumber}</span>
                    <span className="ml-1" style={{ color: theme.textLight }}>{t.subject}</span>
                    <div style={{ color: theme.textLight }}>{t.status} · {t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {emails.length === 0 && adminMessages.length === 0 && supportTickets.length === 0 && (
            <p className="text-sm py-4" style={{ color: theme.textLight }}>No communications found.</p>
          )}
        </>
      )}
    </div>
  );
}

function SyncPlatformButton({ user, theme, platform, label, accent }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    const userId = user.uid || user.id;
    setIsSyncing(true);
    setResult(null);
    try {
      const data = await adminRunSubscriptionReconciliation({ platform, userId });
      const row = data.results?.[platform] || data;
      if (data.success !== false && row.success !== false && !row.error && !row.reason?.includes('no_')) {
        setResult({ type: 'success', message: row.message || `✅ ${label} synced` });
        window.dispatchEvent(new CustomEvent('tpp:admin:user-subscription-synced', { detail: { userId } }));
      } else {
        setResult({ type: 'error', message: row.error || row.reason || row.note || 'Sync failed' });
      }
    } catch (error) {
      setResult({ type: 'error', message: error.message || `Failed to sync ${label}` });
    } finally {
      setIsSyncing(false);
    }
  };

  const color = accent || '#7F9E95';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={isSyncing}
        className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ backgroundColor: color, color: '#fff' }}
      >
        {isSyncing ? (
          <>
            <CircleNotch size={16} className="animate-spin" />
            Syncing…
          </>
        ) : (
          <>
            <ArrowsClockwise size={16} />
            Sync from {label}
          </>
        )}
      </button>
      {result && (
        <p className="text-xs p-2 rounded" style={{ color: result.type === 'success' ? color : '#b91c1c' }}>
          {result.message}
        </p>
      )}
    </div>
  );
}

function SyncAllPlatformsButton({ user, theme }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState(null);
  const [detail, setDetail] = useState(null);

  const handleSync = async () => {
    const userId = user.uid || user.id;
    setIsSyncing(true);
    setResult(null);
    setDetail(null);
    try {
      const data = await adminRunSubscriptionReconciliation({ platform: 'all', userId });
      setResult({ type: 'success', message: '✅ Sync complete' });
      setDetail(data.results || null);
      window.dispatchEvent(new CustomEvent('tpp:admin:user-subscription-synced', { detail: { userId } }));
    } catch (error) {
      setResult({ type: 'error', message: error.message || 'Sync failed' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div
      className="p-3 rounded-lg border flex flex-col gap-2"
      style={{ borderColor: theme.border, backgroundColor: theme.background + '80' }}
    >
      <p className="text-xs font-semibold" style={{ color: theme.text }}>
        Sync this user from all stores now
      </p>
      <button
        type="button"
        onClick={handleSync}
        disabled={isSyncing}
        className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        style={{ backgroundColor: theme.primaryDark, color: '#fff' }}
      >
        {isSyncing ? (
          <>
            <CircleNotch size={16} className="animate-spin" />
            Syncing all…
          </>
        ) : (
          <>
            <ArrowsClockwise size={16} />
            Stripe + Android + iOS
          </>
        )}
      </button>
      {result && (
        <p className="text-xs" style={{ color: result.type === 'success' ? theme.success : theme.error }}>
          {result.message}
        </p>
      )}
      {detail && (
        <div className="space-y-1 mt-1">
          {Object.entries(detail).map(([platform, row]) => {
            const REASON_LABELS = {
              no_google_play_token: 'no Play token on file — use Manual Play grant ↓',
              google_play_api_failed: 'Google Play API call failed',
              no_stripe_customer: 'not a Stripe customer',
              no_stripe_subscription: 'no Stripe subscription found',
              no_apple_subscription: 'no Apple subscription on file',
              apple_api_failed: 'Apple API call failed',
            };
            const hasError = !!row?.error;
            const synced = (row?.synced ?? 0) > 0 || (row?.normalizedOnly ?? 0) > 0;
            const label = platform === 'stripe' ? 'Stripe' : platform === 'googleplay' ? 'Google Play' : platform === 'apple' ? 'Apple' : platform;
            let statusColor = theme.textLight;
            let msg;
            if (hasError) {
              msg = `⚠ ${row.error}`;
              statusColor = theme.error;
            } else if (row?.success === true && row?.status) {
              msg = `✅ Found: ${row.status}${row.logged ? ' — change logged' : ' — no drift'}`;
              statusColor = theme.success;
            } else if (row?.success === false && row?.reason) {
              msg = REASON_LABELS[row.reason] || `no data (${row.reason})`;
            } else if (synced) {
              msg = `✅ ${(row.synced ?? row.normalizedOnly ?? 0)} updated`;
              statusColor = theme.success;
            } else if (row?.skipped != null) {
              msg = `no changes (${row.usersScanned ?? 0} scanned)`;
            } else {
              msg = row?.note || 'no data returned';
            }
            return (
              <div key={platform} className="flex items-start gap-1.5 text-[10px]" style={{ color: statusColor }}>
                <span className="font-semibold shrink-0" style={{ minWidth: 72 }}>{label}:</span>
                <span>{msg}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Sync from Stripe Button Component (forceRefresh = show as "Force refresh" when user already has subscription data)
function SyncFromStripeButton({ user, theme, forceRefresh = false }) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [result, setResult] = useState(null);

  const handleSync = async () => {
    setIsSyncing(true);
    setResult(null);

    try {
      const userId = user.uid || user.id;
      
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const syncFunction = httpsCallable(functions, 'manualSyncSubscription');
      
      const payload = { userId };
      
      const response = await syncFunction(payload);
      
      if (response.data.success) {
        setResult({
          type: 'success',
          message: `✅ Success! Synced subscription: ${response.data.plan} (${response.data.interval})`
        });
        window.dispatchEvent(new CustomEvent('tpp:admin:user-subscription-synced', { detail: { userId } }));
      } else {
        setResult({
          type: 'error',
          message: response.data.message || 'Sync failed'
        });
      }
    } catch (error) {
      console.error('Sync error:', error);
      setResult({
        type: 'error',
        message: error.message || 'Failed to sync subscription from Stripe'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="p-3 rounded-lg flex flex-col gap-3"
      style={{ backgroundColor: theme.warning + '10', border: `1px solid ${theme.warning}30` }}>
      {!forceRefresh && (
        <div className="flex items-start gap-2">
          <Siren size={16} style={{ color: theme.warning }} className="mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: theme.warning }}>EMPTY SUBSCRIPTION DATA</p>
            <p className="text-xs mt-1" style={{ color: theme.textLight }}>
              This user has no subscription data in Firestore. If they have a paid subscription in Stripe, click below to sync it.
              A daily job (4:00 AM UTC) also reconciles Stripe → Firestore for missing or drifted records.
            </p>
          </div>
        </div>
      )}
      {forceRefresh && (
        <p className="text-xs" style={{ color: theme.textLight }}>
          Overwrite Firestore with current data from Stripe (e.g. after a refund or status change).
        </p>
      )}
      <button
        onClick={handleSync}
        disabled={isSyncing}
        className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ 
          backgroundColor: theme.warning,
          color: '#FFFFFF',
          boxShadow: `0 4px 15px ${theme.warning}30`
        }}
      >
        {isSyncing ? (
          <>
            <CircleNotch size={16} className="animate-spin" />
            Syncing from Stripe...
          </>
        ) : (
          <>
            <ArrowsClockwise size={16} />
            {forceRefresh ? 'Force Refresh from Stripe' : 'Sync Subscription from Stripe'}
          </>
        )}
      </button>

      {result && (
        <div className="p-3 rounded text-xs"
          style={{ 
            backgroundColor: result.type === 'success' ? theme.success + '20' : theme.error + '20',
            color: result.type === 'success' ? theme.success : theme.error,
            border: `1px solid ${result.type === 'success' ? theme.success + '40' : theme.error + '40'}`
          }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

// Apple IAP Manual Grant Button — for iOS users whose StoreKit purchase didn't sync to Firestore
const APPLE_PRODUCT_OPTIONS = [
  { value: 'apple.researchplus.annual',   label: 'Research+ Annual' },
  { value: 'apple.researchplus.monthly',  label: 'Research+ Monthly' },
  { value: 'apple.researchplus.lifetime', label: 'Research+ Lifetime' },
  { value: 'apple.annual',               label: 'Founder Annual (legacy)' },
  { value: 'apple.monthly',              label: 'Founder Monthly (legacy)' },
  { value: 'lifetime.apple',             label: 'Founder Lifetime (legacy)' },
];

function SyncAppleIAPButton({ user, theme }) {
  const [isGranting, setIsGranting] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState('apple.researchplus.annual');
  const [reason, setReason] = useState('');

  const handleGrant = async () => {
    if (!window.confirm(`Manually grant "${selectedProduct}" to ${user.email || user.uid}? This writes directly to Firestore.`)) return;
    setIsGranting(true);
    setResult(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const grantFn = httpsCallable(getFunctions(), 'adminManualAppleGrant');
      const response = await grantFn({
        userId: user.uid || user.id,
        productId: selectedProduct,
        reason: reason || 'Manual admin grant — receipt verification failed after StoreKit purchase',
      });
      setResult({ type: 'success', message: `✅ ${response.data.message}` });
      window.dispatchEvent(new CustomEvent('tpp:admin:user-subscription-synced', { detail: { userId: user.uid || user.id } }));
    } catch (error) {
      console.error('Apple IAP grant error:', error);
      setResult({ type: 'error', message: error.message || 'Failed to grant Apple IAP subscription' });
    } finally {
      setIsGranting(false);
    }
  };

  return (
    <div className="p-3 rounded-lg flex flex-col gap-3"
      style={{ backgroundColor: theme.info + '10', border: `1px solid ${theme.info}30` }}>
      <div className="flex items-start gap-2">
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>🍎</span>
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: theme.info }}>APPLE IAP — MANUAL GRANT</p>
          <p className="text-xs mt-1" style={{ color: theme.textLight }}>
            StoreKit purchase succeeded but Firestore was never updated. Select the product the user purchased and grant access.
          </p>
        </div>
      </div>

      <select
        value={selectedProduct}
        onChange={e => setSelectedProduct(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border"
        style={{
          backgroundColor: theme.cardBackground,
          borderColor: theme.border,
          color: theme.text,
        }}
      >
        {APPLE_PRODUCT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label} — {opt.value}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Reason / note (optional)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border"
        style={{
          backgroundColor: theme.cardBackground,
          borderColor: theme.border,
          color: theme.text,
        }}
      />

      <button
        onClick={handleGrant}
        disabled={isGranting}
        className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: theme.info, color: '#FFFFFF', boxShadow: `0 4px 15px ${theme.info}30` }}
      >
        {isGranting ? (
          <>
            <CircleNotch size={16} className="animate-spin" />
            Granting…
          </>
        ) : (
          <>
            <ArrowsClockwise size={16} />
            Grant Apple IAP Subscription
          </>
        )}
      </button>

      {result && (
        <div className="p-3 rounded text-xs"
          style={{
            backgroundColor: result.type === 'success' ? theme.success + '20' : theme.error + '20',
            color: result.type === 'success' ? theme.success : theme.error,
            border: `1px solid ${result.type === 'success' ? theme.success + '40' : theme.error + '40'}`,
          }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

// Stripe Manual Grant Button — for web users whose Stripe webhook failed after checkout
const STRIPE_PLAN_OPTIONS = [
  { value: 'price_1TS5D250b3cktl9XYpr3bhT2', label: 'Research+ Annual' },
  { value: 'price_1TS5C550b3cktl9XUg2Uvg5d', label: 'Research+ Monthly' },
  { value: 'price_1TS5DS50b3cktl9Xb3gNyL2d', label: 'Research+ Lifetime' },
];

function AdminStripeGrantButton({ user, theme }) {
  const [isGranting, setIsGranting] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedPriceId, setSelectedPriceId] = useState('price_1TS5D250b3cktl9XYpr3bhT2');
  const [reason, setReason] = useState('');

  const handleGrant = async () => {
    if (!window.confirm(`Manually grant Stripe plan "${selectedPriceId}" to ${user.email || user.uid}? This writes directly to Firestore.`)) return;
    setIsGranting(true);
    setResult(null);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const grantFn = httpsCallable(getFunctions(), 'adminManualStripeGrant');
      const response = await grantFn({
        userId: user.uid || user.id,
        priceId: selectedPriceId,
        reason: reason || 'Manual admin grant — Stripe webhook failed after checkout',
      });
      setResult({ type: 'success', message: `✅ ${response.data.message}` });
      window.dispatchEvent(new CustomEvent('tpp:admin:user-subscription-synced', { detail: { userId: user.uid || user.id } }));
    } catch (error) {
      console.error('Stripe manual grant error:', error);
      setResult({ type: 'error', message: error.message || 'Failed to grant Stripe subscription' });
    } finally {
      setIsGranting(false);
    }
  };

  return (
    <div className="p-3 rounded-lg flex flex-col gap-3"
      style={{ backgroundColor: theme.primary + '10', border: `1px solid ${theme.primary}30` }}>
      <div className="flex items-start gap-2">
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>💳</span>
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: theme.primary }}>STRIPE — MANUAL GRANT</p>
          <p className="text-xs mt-1" style={{ color: theme.textLight }}>
            Stripe checkout succeeded but the webhook never reached Firestore. Select the plan the user paid for and grant access.
          </p>
        </div>
      </div>

      <select
        value={selectedPriceId}
        onChange={e => setSelectedPriceId(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border"
        style={{ backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.text }}
      >
        {STRIPE_PLAN_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label} — {opt.value}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Reason / note (optional)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border"
        style={{ backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.text }}
      />

      <button
        onClick={handleGrant}
        disabled={isGranting}
        className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: theme.primary, color: '#FFFFFF', boxShadow: `0 4px 15px ${theme.primary}30` }}
      >
        {isGranting ? (
          <>
            <CircleNotch size={16} className="animate-spin" />
            Granting…
          </>
        ) : (
          <>
            <ArrowsClockwise size={16} />
            Grant Stripe Subscription
          </>
        )}
      </button>

      {result && (
        <div className="p-3 rounded text-xs"
          style={{
            backgroundColor: result.type === 'success' ? theme.success + '20' : theme.error + '20',
            color: result.type === 'success' ? theme.success : theme.error,
            border: `1px solid ${result.type === 'success' ? theme.success + '40' : theme.error + '40'}`,
          }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

// Android (Google Play) Manual Grant Button — for Android users whose IAP webhook failed
const ANDROID_PRODUCT_OPTIONS = [
  { value: 'm.thepepplanner.app.researchannual',   label: 'Research+ Annual' },
  { value: 'm.thepepplanner.app.researchmonthly',  label: 'Research+ Monthly' },
  { value: 'm.thepepplanner.app.researchlifetime', label: 'Research+ Lifetime' },
];

function AdminAndroidGrantButton({ user, theme }) {
  const [isGranting, setIsGranting] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState('m.thepepplanner.app.researchannual');
  const [reason, setReason] = useState('');
  const [purchaseToken, setPurchaseToken] = useState('');

  const handleGrant = async () => {
    if (!window.confirm(`Manually grant Android plan "${selectedProduct}" to ${user.email || user.uid}? This writes directly to Firestore.`)) return;
    setIsGranting(true);
    setResult(null);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const grantFn = httpsCallable(getFunctions(), 'adminManualAndroidGrant');
      const response = await grantFn({
        userId: user.uid || user.id,
        productId: selectedProduct,
        purchaseToken: purchaseToken.trim() || undefined,
        reason: reason || 'Manual admin grant — Google Play webhook failed after purchase',
      });
      setResult({ type: 'success', message: `✅ ${response.data.message}` });
      window.dispatchEvent(new CustomEvent('tpp:admin:user-subscription-synced', { detail: { userId: user.uid || user.id } }));
    } catch (error) {
      console.error('Android manual grant error:', error);
      setResult({ type: 'error', message: error.message || 'Failed to grant Android subscription' });
    } finally {
      setIsGranting(false);
    }
  };

  return (
    <div className="p-3 rounded-lg flex flex-col gap-3"
      style={{ backgroundColor: '#3DDC8410', border: '1px solid #3DDC8430' }}>
      <div className="flex items-start gap-2">
        <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2 }}>🤖</span>
        <div className="flex-1">
          <p className="text-sm font-semibold" style={{ color: '#3DDC84' }}>ANDROID — MANUAL GRANT</p>
          <p className="text-xs mt-1" style={{ color: theme.textLight }}>
            Google Play purchase succeeded but the RTDN webhook never updated Firestore. Select the product the user purchased and grant access.
          </p>
        </div>
      </div>

      <select
        value={selectedProduct}
        onChange={e => setSelectedProduct(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border"
        style={{ backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.text }}
      >
        {ANDROID_PRODUCT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label} — {opt.value}</option>
        ))}
      </select>

      <input
        type="text"
        placeholder="Purchase token from Play Console (recommended)"
        value={purchaseToken}
        onChange={e => setPurchaseToken(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border font-mono"
        style={{ backgroundColor: theme.cardBackground, borderColor: '#3DDC8460', color: theme.text }}
      />
      <input
        type="text"
        placeholder="Reason / note (optional)"
        value={reason}
        onChange={e => setReason(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm border"
        style={{ backgroundColor: theme.cardBackground, borderColor: theme.border, color: theme.text }}
      />

      <button
        onClick={handleGrant}
        disabled={isGranting}
        className="px-4 py-2 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ backgroundColor: '#3DDC84', color: '#000000', boxShadow: '0 4px 15px #3DDC8430' }}
      >
        {isGranting ? (
          <>
            <CircleNotch size={16} className="animate-spin" />
            Granting…
          </>
        ) : (
          <>
            <ArrowsClockwise size={16} />
            Grant Android Subscription
          </>
        )}
      </button>

      {result && (
        <div className="p-3 rounded text-xs"
          style={{
            backgroundColor: result.type === 'success' ? theme.success + '20' : theme.error + '20',
            color: result.type === 'success' ? theme.success : theme.error,
            border: `1px solid ${result.type === 'success' ? theme.success + '40' : theme.error + '40'}`,
          }}>
          {result.message}
        </div>
      )}
    </div>
  );
}

function BillingContextBanner({ user, theme }) {
  const ctx = useMemo(() => resolveAdminBillingContext(user), [user]);
  const channelStyles = {
    web: { bg: theme.info + '14', border: theme.info + '40', color: theme.info },
    ios_native: { bg: '#6366f114', border: '#6366f140', color: '#4338ca' },
    android_native: { bg: '#22c55e14', border: '#22c55e40', color: '#15803d' },
    unknown: { bg: theme.warning + '12', border: theme.warning + '35', color: theme.warning },
  };
  const styleKey = ctx.displayChannel || ctx.channel;
  const st = channelStyles[styleKey] || channelStyles.unknown;
  const badgeChannel = ctx.channel !== 'unknown' ? ctx.channel : ctx.likelySurface;

  return (
    <div className="rounded-xl border p-3 space-y-2" style={{ borderColor: st.border, backgroundColor: st.bg }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider opacity-70" style={{ color: st.color }}>
            {ctx.channel === 'unknown' ? 'Billing channel' : 'Where they pay'}
          </p>
          <p className="text-lg font-bold leading-tight mt-0.5" style={{ color: theme.text }}>
            {ctx.channelLabel}
          </p>
          <p className="text-xs font-semibold mt-1" style={{ color: theme.textLight }}>
            {ctx.storeLabel}
          </p>
        </div>
        <span
          className="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md shrink-0"
          style={{ backgroundColor: theme.cardBackground, color: st.color, border: `1px solid ${st.border}` }}
        >
          {badgeChannel === 'web' ? 'Stripe' : badgeChannel === 'ios_native' ? 'Apple IAP' : badgeChannel === 'android_native' ? 'Play IAP' : '?'}
        </span>
      </div>
      <p className="text-[11px] leading-snug" style={{ color: theme.textLight }}>
        {ctx.channelDetail}
      </p>
      <p className="text-[10px]" style={{ color: theme.textLight }}>
        Last seen on: <span style={{ color: theme.text, fontWeight: 600 }}>{ctx.deviceLabel}</span>
        <span className="opacity-60"> — device only; billing channel above is what matters for grants.</span>
      </p>
      {badgeChannel === 'android_native' && (
        <p className="text-[10px] font-semibold mt-1" style={{ color: '#15803d' }}>
          Run <em>Subscription sync → Step 1</em> below first. If that finds nothing, follow Step 2 to collect their Play order ID.
        </p>
      )}
      {badgeChannel === 'ios_native' && (
        <p className="text-[10px] font-semibold mt-1" style={{ color: '#4338ca' }}>
          Run <em>Subscription sync → Step 1</em> below first. If that finds nothing, follow Step 2 to collect their App Store transaction ID.
        </p>
      )}
    </div>
  );
}

function SubscriptionFixesSection({ user, theme, defaultOpen = false }) {
  const subscription = user.subscription || {};
  const ctx = useMemo(() => resolveAdminBillingContext(user), [user]);
  const hasNoMeaningfulSub =
    !subscription.status ||
    Object.keys(subscription).length === 0 ||
    Object.values(subscription).every((v) => v === undefined || v === null);

  const showStripe = ctx.showStripeTools;
  const showApple = ctx.showAppleTools;
  const showAndroid = ctx.showAndroidTools;

  // Detect which store IDs are missing — these are why sync can't auto-fix
  const missingStripe = !subscription.stripeCustomerId && !subscription.customerId && !subscription.stripeSubscriptionId;
  const missingPlay = !subscription.googlePlayPurchaseToken;
  const missingApple = !subscription.appStoreTransactionId && !subscription.originalTransactionId && !subscription.appStoreProductId;

  const missingItems = [
    showStripe && missingStripe && {
      store: 'Stripe',
      color: theme.info,
      missing: 'stripeCustomerId',
      ask: 'Ask the user for the email they used at checkout. Search that email in the Stripe dashboard to find their customer ID.',
    },
    showAndroid && missingPlay && {
      store: 'Google Play',
      color: '#3DDC84',
      missing: 'googlePlayPurchaseToken',
      ask: 'Ask the user to go to Google Play → Subscriptions and share their Order ID. You can also find it in the Play Console under the user\'s email.',
    },
    showApple && missingApple && {
      store: 'Apple App Store',
      color: '#4338ca',
      missing: 'appStoreTransactionId',
      ask: 'Ask the user to go to Settings → Apple ID → Subscriptions and share their receipt or transaction date. Search their email in App Store Connect.',
    },
  ].filter(Boolean);

  return (
    <AdminCollapsibleSection
      title="Subscription sync"
      icon={ArrowsClockwise}
      theme={theme}
      defaultOpen={defaultOpen || hasNoMeaningfulSub}
    >
      {/* Step 1: Sync — always the first action */}
      <div className="space-y-1 mb-1">
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: theme.textLight }}>
          Step 1 — Pull current status from all stores
        </p>
        <p className="text-[10px]" style={{ color: theme.textLight }}>
          This reads the user's current subscription directly from Stripe, Google Play, and Apple and writes the correct status to Firestore. Run this first.
        </p>
      </div>
      <SyncAllPlatformsButton user={user} theme={theme} />

      {/* Step 2: If sync returned nothing — explain what's missing and what to collect */}
      {missingItems.length > 0 && (
        <AdminCollapsibleSection
          title={`Step 2 — Why sync may return nothing (${missingItems.length} missing link${missingItems.length > 1 ? 's' : ''})`}
          theme={theme}
          defaultOpen={false}
        >
          <div className="space-y-3">
            <p className="text-[11px]" style={{ color: theme.textLight }}>
              Sync reads from the stores using IDs that should have been saved when the user purchased. If those IDs are missing from Firestore, sync can't find their subscription. Here's what's missing and how to collect it:
            </p>
            {missingItems.map(({ store, color, missing, ask }) => (
              <div key={store} className="p-2.5 rounded-lg space-y-1" style={{ backgroundColor: color + '10', border: `1px solid ${color}30` }}>
                <p className="text-[11px] font-semibold" style={{ color }}>
                  {store} — <code className="text-[10px]">{missing}</code> not on file
                </p>
                <p className="text-[11px]" style={{ color: theme.textLight }}>{ask}</p>
                <p className="text-[10px] mt-1" style={{ color: theme.textLight }}>
                  Once you have the ID, use the emergency override below to save it alongside the grant so future syncs will work automatically.
                </p>
              </div>
            ))}
          </div>
        </AdminCollapsibleSection>
      )}

      {/* Step 3: Emergency override — only when you have confirmed purchase info */}
      <AdminCollapsibleSection
        title="Step 3 — Emergency override (last resort)"
        theme={theme}
        defaultOpen={false}
      >
        <div className="space-y-3">
          <div className="p-2.5 rounded-lg" style={{ backgroundColor: theme.error + '08', border: `1px solid ${theme.error}25` }}>
            <p className="text-[11px] font-semibold" style={{ color: theme.error }}>Only use this when:</p>
            <ul className="mt-1 space-y-0.5 list-disc list-inside" style={{ color: theme.textLight }}>
              <li className="text-[10px]">You've confirmed the purchase with the user</li>
              <li className="text-[10px]">You have the purchase token, transaction ID, or Stripe customer ID</li>
              <li className="text-[10px]">Sync ran and found nothing because the IDs were missing</li>
            </ul>
            <p className="text-[10px] mt-1.5" style={{ color: theme.textLight }}>
              Saving the purchase ID alongside the grant means automatic sync will work going forward — don't skip it.
            </p>
          </div>
          {showStripe && (
            <AdminCollapsibleSection title="Stripe manual grant" theme={theme} defaultOpen={false}>
              <AdminStripeGrantButton user={user} theme={theme} />
            </AdminCollapsibleSection>
          )}
          {showApple && (
            <AdminCollapsibleSection title="App Store manual grant" theme={theme} defaultOpen={false}>
              <SyncAppleIAPButton user={user} theme={theme} />
            </AdminCollapsibleSection>
          )}
          {showAndroid && (
            <AdminCollapsibleSection title="Google Play manual grant" theme={theme} defaultOpen={false}>
              <AdminAndroidGrantButton user={user} theme={theme} />
            </AdminCollapsibleSection>
          )}
        </div>
      </AdminCollapsibleSection>
    </AdminCollapsibleSection>
  );
}

/** Coerce Firestore Timestamp / serialized {_seconds} / Date / ms into a Date, or null. */
function coerceAdminDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object') {
    if (typeof value.toDate === 'function') {
      try {
        const d = value.toDate();
        return d instanceof Date && !Number.isNaN(d.getTime()) ? d : null;
      } catch {
        /* fall through */
      }
    }
    if (typeof value.toMillis === 'function') {
      try {
        const d = new Date(value.toMillis());
        return Number.isNaN(d.getTime()) ? null : d;
      } catch {
        /* fall through */
      }
    }
    const sec = value.seconds ?? value._seconds;
    if (typeof sec === 'number') {
      const nano = value.nanoseconds ?? value._nanoseconds ?? 0;
      const d = new Date(sec * 1000 + Math.floor(nano / 1e6));
      return Number.isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

/** Safe string for debug <code> cells — never pass raw Timestamp objects to React. */
function formatDebugValue(value) {
  if (value == null || value === '') return 'undefined';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const asDate = coerceAdminDate(value);
  if (asDate) return asDate.toISOString();
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

// Subscription Debug Component
function SubscriptionDebugSection({ user, theme }) {
  const subscription = user.subscription || {};

  const getStatusColor = () => {
    if (subscription.status === 'active' && subscription.interval !== 'trial') {
      return theme.success;
    } else if (subscription.status === 'trialing' || subscription.interval === 'trial') {
      return theme.info;
    } else if (subscription.status === 'canceled' || subscription.status === 'expired' || subscription.status === 'refunded' || subscription.status === 'disputed' || subscription.status === 'revoked') {
      return theme.error;
    }
    return theme.textLight;
  };

  return (
    <AdminCollapsibleSection title="Subscription debug data" icon={Shield} theme={theme} defaultOpen={false}>
            <div className="space-y-3">
            {/* Status Overview */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: theme.background + '60', border: `1px solid ${getStatusColor()}30` }}>
              <div className="text-xs font-semibold mb-2" style={{ color: theme.textLight }}>STATUS ANALYSIS:</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span style={{ color: theme.textLight }}>subscription.status:</span>
                  <code className="px-2 py-0.5 rounded font-mono" style={{ backgroundColor: theme.background, color: getStatusColor() }}>
                    {formatDebugValue(subscription.status)}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textLight }}>subscription.interval:</span>
                  <code className="px-2 py-0.5 rounded font-mono" style={{ backgroundColor: theme.background, color: theme.text }}>
                    {formatDebugValue(subscription.interval)}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textLight }}>subscription.plan:</span>
                  <code className="px-2 py-0.5 rounded font-mono" style={{ backgroundColor: theme.background, color: theme.text }}>
                    {formatDebugValue(
                      typeof subscription.plan === 'object' && subscription.plan != null
                        ? (subscription.plan.name || subscription.plan.id || subscription.plan)
                        : subscription.plan
                    )}
                  </code>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: theme.textLight }}>subscription.currentPeriodEnd:</span>
                  <code className="px-2 py-0.5 rounded font-mono text-[10px]" style={{ backgroundColor: theme.background, color: theme.text }}>
                    {formatDebugValue(subscription.currentPeriodEnd)}
                  </code>
                </div>
              </div>
            </div>

            {/* What Admin Panel Sees */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: theme.info + '10', border: `1px solid ${theme.info}30` }}>
              <div className="text-xs font-semibold mb-2" style={{ color: theme.info }}>WHAT ADMIN PANEL CHECKS:</div>
              <div className="space-y-1 text-[11px]" style={{ color: theme.text }}>
                <div>✓ Lifetime: hasLifetimeAccess={String(!!subscription.hasLifetimeAccess)} OR interval='lifetime'</div>
                <div>✓ Subscribed: status='active' AND plan exists = {String(subscription.status === 'active' && !!subscription.plan)}</div>
                <div>✓ Trialing: Has valid currentPeriodEnd and not expired</div>
                <div>✓ Refunded/Disputed/Revoked: status in ['refunded','disputed','revoked'] = {String(['refunded', 'disputed', 'revoked'].includes(subscription.status))}</div>
              </div>
            </div>

            {/* What User App Sees */}
            <div className="p-3 rounded-lg" style={{ backgroundColor: theme.success + '10', border: `1px solid ${theme.success}30` }}>
              <div className="text-xs font-semibold mb-2" style={{ color: theme.success }}>WHAT USER APP CHECKS:</div>
              <div className="space-y-1 text-[11px]" style={{ color: theme.text }}>
                <div>✓ Active Subscription: status='active' AND interval≠'trial' = {String(subscription.status === 'active' && subscription.interval !== 'trial')}</div>
                <div>✓ Lifetime: interval='lifetime' = {String(subscription.interval === 'lifetime')}</div>
                <div>✓ Trialing: status='trialing' = {String(subscription.status === 'trialing')}</div>
                <div>✓ No access: status in ['refunded','disputed','revoked'] = {String(['refunded', 'disputed', 'revoked'].includes(subscription.status))}</div>
              </div>
            </div>

            {/* Raw JSON */}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold mb-2 hover:opacity-80" style={{ color: theme.textLight }}>
                Full Raw Subscription Object
              </summary>
              <pre className="mt-2 p-3 rounded text-[10px] overflow-auto max-h-60" 
                style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }}>
                {JSON.stringify(subscription, null, 2)}
              </pre>
            </details>

            {/* Stripe IDs */}
            {(subscription.stripeCustomerId || subscription.stripeSubscriptionId) && (
              <div className="p-3 rounded-lg" style={{ backgroundColor: theme.background + '60' }}>
                <div className="text-xs font-semibold mb-2" style={{ color: theme.textLight }}>STRIPE IDENTIFIERS:</div>
                <div className="space-y-1 text-[10px] font-mono">
                  {subscription.stripeCustomerId && (
                    <div>Customer: {subscription.stripeCustomerId}</div>
                  )}
                  {subscription.stripeSubscriptionId && (
                    <div>Subscription: {subscription.stripeSubscriptionId}</div>
                  )}
                </div>
              </div>
            )}

            {/* Action needed */}
            {subscription.status === 'active' && subscription.interval === 'trial' && (
              <div className="p-3 rounded-lg flex items-start gap-2"
                style={{ backgroundColor: theme.error + '10', border: `1px solid ${theme.error}30` }}>
                <Siren size={14} style={{ color: theme.error }} className="mt-0.5" />
                <div>
                  <p className="text-xs font-semibold" style={{ color: theme.error }}>ISSUE DETECTED</p>
                  <p className="text-[11px] mt-1" style={{ color: theme.textLight }}>
                    User has status='active' but interval='trial'. This should be status='trialing' for trials or interval='month'/'year' for paid subscriptions.
                  </p>
                </div>
              </div>
            )}

            {(!subscription.status || Object.keys(subscription).length === 0) && (
              <p className="text-[11px] mt-2 px-1" style={{ color: theme.textLight }}>
                No subscription data in Firestore. Use <strong>Subscription sync → Step 1</strong> above to pull from Stripe, Google Play, or Apple. If sync finds nothing, Step 2 explains what IDs are missing.
              </p>
            )}

          </div>
    </AdminCollapsibleSection>
  );
}

// Engagement & Milestone Section
function EngagementSection({ user, theme }) {
  const engagement = user.engagement || {};
  const milestones = user.milestones || {};

  const streak = engagement.currentStreak ?? 0;
  const longestStreak = engagement.longestStreak ?? 0;
  const totalActiveDays = engagement.totalActiveDays ?? 0;
  const loginCount = engagement.loginCount ?? 0;

  const milestoneList = [
    { key: 'onboardingCompleted', label: 'Completed tour' },
    { key: 'firstProtocolCreated', label: 'First protocol' },
    { key: 'firstOrderAdded', label: 'First order' },
    { key: 'firstStockpileItem', label: 'First stockpile item' },
    { key: 'firstCalendarView', label: 'Viewed calendar' },
    { key: 'sevenDayStreak', label: '7-day streak' },
  ];

  const hasAnyEngagement = streak > 0 || totalActiveDays > 0 || loginCount > 0 || milestoneList.some(m => milestones[m.key]);

  return (
    <div className="rounded-xl border p-4 relative overflow-hidden"
      style={{
        borderColor: theme.border,
        backgroundColor: theme.cardBackground,
        background: `linear-gradient(135deg, ${theme.cardBackground} 0%, ${theme.success}05 100%)`
      }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${theme.success} 0%, ${theme.success}DD 100%)`, boxShadow: `0 2px 8px ${theme.success}30` }}>
          <Pulse size={14} style={{ color: '#FFFFFF' }} />
        </div>
        <h4 className="font-bold text-sm" style={{ color: theme.primaryDark }}>Engagement</h4>
        {!hasAnyEngagement && (
          <span className="text-[10px] ml-auto px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.border + '40', color: theme.textLight }}>
            No data yet
          </span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {[
          { label: 'Current streak', value: streak > 0 ? `${streak}d` : '—', icon: <Fire size={14} />, color: streak >= 7 ? '#F59E0B' : theme.textLight },
          { label: 'Longest streak', value: longestStreak > 0 ? `${longestStreak}d` : '—', icon: <Fire size={14} />, color: theme.textLight },
          { label: 'Active days', value: totalActiveDays > 0 ? totalActiveDays : '—', icon: <Pulse size={14} />, color: theme.info },
          { label: 'Logins', value: loginCount > 0 ? loginCount : '—', icon: <Users size={14} />, color: theme.textLight },
        ].map(stat => (
          <div key={stat.label} className="flex flex-col items-center justify-center gap-0.5 p-2 rounded-xl text-center"
            style={{ backgroundColor: theme.background + '80', border: `1px solid ${theme.border}40` }}>
            <div style={{ color: stat.color }}>{stat.icon}</div>
            <span className="text-sm font-bold" style={{ color: theme.text }}>{stat.value}</span>
            <span className="text-[10px]" style={{ color: theme.textLight }}>{stat.label}</span>
          </div>
        ))}
      </div>

      {/* Milestones */}
      <div className="grid grid-cols-2 gap-1">
        {milestoneList.map(({ key, label }) => {
          const hit = !!milestones[key];
          const ts = milestones[key]?.toDate ? milestones[key].toDate() : milestones[key] ? new Date(milestones[key]) : null;
          return (
            <div key={key} className="flex items-center gap-1.5 px-2 py-1 rounded-lg"
              style={{ backgroundColor: hit ? theme.success + '12' : theme.border + '20', border: `1px solid ${hit ? theme.success + '30' : theme.border + '20'}` }}>
              <CheckCircle size={12} style={{ color: hit ? theme.success : theme.border, flexShrink: 0 }} />
              <span className="text-xs truncate" style={{ color: hit ? theme.text : theme.textLight }}>{label}</span>
              {hit && ts && (
                <span className="text-[10px] ml-auto shrink-0" style={{ color: theme.textLight }}>
                  {ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Technical Details Component
function TechnicalDetailsSection({ user, theme }) {
  const raw = user.deviceInfo || {};
  const deviceInfo =
    raw.userAgent && (!raw.deviceType || String(raw.deviceType).toLowerCase() === 'unknown')
      ? { ...raw, ...detectDevice(raw.userAgent) }
      : raw;
  const deviceType = (deviceInfo.deviceType || 'unknown').toLowerCase();
  const mobileOS = (deviceInfo.mobileOS || '').toLowerCase();
  const browser = deviceInfo.browser || 'Unknown';
  const hasDeviceData = !!(deviceInfo.deviceType && deviceType !== 'unknown') || !!(deviceInfo.userAgent && deviceInfo.userAgent.length > 8);

  const DeviceIcon = deviceType === 'mobile' ? DeviceMobile : deviceType === 'tablet' ? DeviceTablet : Desktop;
  const deviceColor = deviceType === 'mobile' ? theme.info : deviceType === 'tablet' ? theme.warning : theme.success;

  const OsIcon = () => {
    if (mobileOS.includes('ios') || mobileOS.includes('mac')) {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
      );
    }
    if (mobileOS.includes('android')) {
      return (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M17.523 15.341c-.606 0-1.096-.49-1.096-1.096s.49-1.096 1.096-1.096 1.096.49 1.096 1.096-.49 1.096-1.096 1.096m-11.046 0c-.606 0-1.096-.49-1.096-1.096s.49-1.096 1.096-1.096 1.096.49 1.096 1.096-.49 1.096-1.096 1.096m11.405-6.836l2.18-3.774a.453.453 0 0 0-.166-.619.453.453 0 0 0-.619.166l-2.207 3.822C15.375 7.432 13.739 7 12 7c-1.739 0-3.375.432-4.07 1.1L5.723 4.278a.453.453 0 0 0-.619-.166.453.453 0 0 0-.166.619l2.18 3.774C4.98 9.657 3.5 11.549 3.5 13.744V15h17v-1.256c0-2.195-1.48-4.087-3.618-5.239"/>
        </svg>
      );
    }
    return <Globe size={20} />;
  };

  const cards = [
    {
      label: 'Device',
      value: deviceType === 'unknown' ? 'Unknown' : deviceType.charAt(0).toUpperCase() + deviceType.slice(1),
      icon: <DeviceIcon size={20} />,
      color: deviceColor,
    },
    {
      label: 'OS / Platform',
      value: deviceInfo.mobileOS || (deviceType === 'desktop' ? 'Desktop' : 'Unknown'),
      icon: <OsIcon />,
      color: mobileOS.includes('ios') || mobileOS.includes('mac') ? '#555' : mobileOS.includes('android') ? '#3DDC84' : theme.textLight,
    },
    {
      label: 'Browser',
      value: browser,
      icon: <Globe size={20} />,
      color: theme.primary,
    },
  ];

  return (
    <div className="rounded-xl border p-4 relative overflow-hidden"
      style={{ 
        borderColor: theme.border,
        backgroundColor: theme.cardBackground,
        background: `linear-gradient(135deg, ${theme.cardBackground} 0%, ${theme.info}05 100%)`
      }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${theme.info} 0%, ${theme.info}DD 100%)`, boxShadow: `0 2px 8px ${theme.info}30` }}>
          <Code size={14} style={{ color: '#FFFFFF' }} />
        </div>
        <h4 className="font-bold text-sm" style={{ color: theme.primaryDark }}>Technical Details</h4>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cards.map(({ label, value, icon, color }) => (
          <div key={label} className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl text-center"
            style={{ backgroundColor: theme.background + '80', border: `1px solid ${theme.border}40` }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ backgroundColor: color + '18', color }}>
              {icon}
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: theme.textLight }}>{label}</span>
            <span className="text-xs font-bold leading-tight" style={{ color: theme.text }}>{value}</span>
          </div>
        ))}
      </div>

      {/* No device info warning */}
      {!hasDeviceData && (
        <div className="mt-3 p-3 rounded-lg flex items-start gap-2"
          style={{ backgroundColor: theme.warning + '10', border: `1px solid ${theme.warning}30` }}>
          <Coffee size={14} style={{ color: theme.warning }} className="mt-0.5" />
          <div>
            <p className="text-xs font-semibold" style={{ color: theme.warning }}>Device info not available</p>
            <p className="text-[11px] mt-1" style={{ color: theme.textLight }}>
              This user registered before device tracking was implemented. Device info will be captured on their next login.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline panel variant (Users shell + Support account rail) */
export function UserDetailPanel(props) {
  return <UserDetailModal {...props} mode="panel" />;
}

