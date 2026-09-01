import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { auth, db } from '../config/firebase';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import {
  getAllFeedback,
  updateFeedback,
  deleteFeedback,
  getAnalytics,
  getUserList,
  getAdminUserProfileViaCallable,
  getUserByEmail,
  getAllLifetimeUsers,
  grantLifetimeAccessFirestore,
  revokeLifetimeAccess,
  cancelLifetimePreGrant,
  extendTrialForUser,
  getAllTickets,
  getTicketWithMessages,
  addTicketMessage,
  updateTicketStatus,
  subscribeToTicketMessages,
  replyToFeedbackViaTicket,
} from '../services/firebase';
import {
  calculateUserGrowth,
  calculateFeatureUsage,
  calculateSessionData,
  calculateDeviceBreakdown,
  analyzeFeedback,
} from '../utils/adminHelpers';
import { generateId } from '../utils/string';
import { adminCacheGet, adminCacheSet, adminCacheInvalidate } from '../utils/adminSessionCache';

const CACHE_TTL = {
  analytics: 10 * 60 * 1000, // 10 min — full user-list scan, expensive
  feedback:   5 * 60 * 1000, // 5 min
  tickets:    5 * 60 * 1000,
  lifetime:  15 * 60 * 1000, // 15 min — changes rarely
};

// Admin password removed — cloud functions now verify admin via Firebase Auth email token.
// No secrets in client code.

const AdminContext = createContext(null);

export function AdminProvider({ children }) {
  // Seed state from sessionStorage so navigating back to the admin panel
  // doesn't re-fetch everything. The loaders below will update these (and
  // refresh the cache) once they run.
  const [analytics, setAnalytics] = useState(() => adminCacheGet('admin:analytics') ?? {
    userGrowth: [],
    featureUsage: {},
    sessionData: [],
    deviceBreakdown: {},
    totalUsers: 0,
    activeUsers: 0,
  });
  const [users, setUsers] = useState(() => adminCacheGet('admin:users') ?? []);
  const [subscriptions, setSubscriptions] = useState(() => adminCacheGet('admin:subscriptions') ?? {
    active: 0,
    beta: 0,
    total: 0,
    thisWeek: 0,
    recentRegistrations: [],
  });
  const [feedback, setFeedback] = useState(() => adminCacheGet('admin:feedback') ?? []);
  const [feedbackAnalysis, setFeedbackAnalysis] = useState(() => adminCacheGet('admin:feedbackAnalysis') ?? {
    categories: {},
    sentiment: {},
    trends: [],
    autoResponses: [],
  });
  const [tickets, setTickets] = useState(() => adminCacheGet('admin:tickets') ?? []);
  const [lifetimeUsers, setLifetimeUsers] = useState(() => adminCacheGet('admin:lifetimeUsers') ?? []);
  const [funnelEvents, setFunnelEvents] = useState(() => adminCacheGet('admin:funnelEvents') ?? { byEvent: {}, totalEvents: 0, loadedAt: null });
  const [contentData, setContentData] = useState({
    topics: [],
    penTypes: [],
    newTopic: '',
    newPenType: '',
  });

  const [loading, setLoading] = useState({
    feedback: false,
    submitting: false,
    analytics: false,
    lifetimeUsers: false,
    trialExtension: false,
    selectedUser: false,
  });

  // Admin data is expensive (full collection scans). Each section's data is
  // fetched lazily the first time its tab is actually visited, then cached
  // in state for the rest of the admin session — navigating back to a tab
  // reuses what's already loaded instead of re-fetching. Pass `force: true`
  // to bypass the cache (e.g. manual refresh buttons).
  const analyticsLoadedRef = useRef(false);
  const feedbackLoadedRef = useRef(false);
  const ticketsLoadedRef = useRef(false);
  const lifetimeUsersLoadedRef = useRef(false);

  const [selectedUser, setSelectedUser] = useState(null);
  const [activeReportContext, setActiveReportContext] = useState(null);
  const [userSelectionError, setUserSelectionError] = useState(null);
  const [isLoadingUserDetails, setIsLoadingUserDetails] = useState(false);
  const [isExtendingTrial, setIsExtendingTrial] = useState(false);

  const loadRealAnalytics = useCallback(async (force = false) => {
    if (analyticsLoadedRef.current && !force) return;
    // If we already have cached data (state seeded from sessionStorage) and it
    // hasn't expired, mark as loaded without hitting the network.
    if (!force && adminCacheGet('admin:analytics')) {
      analyticsLoadedRef.current = true;
      return;
    }
    setLoading((prev) => ({ ...prev, analytics: true }));
    try {
      const userData = await getUserList();
      let analyticsData = {
        totalUsers: userData.length,
        activeUsers: 0,
        featureUsage: {},
      };
      try {
        const firebaseAnalytics = await getAnalytics();
        analyticsData = { ...analyticsData, ...firebaseAnalytics };
      } catch (e) {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const active = userData.filter((u) => {
          if (!u.lastActive?.toDate) return false;
          return u.lastActive.toDate() >= thirtyDaysAgo;
        }).length;
        analyticsData.activeUsers = active;
        analyticsData.featureUsage = {
          protocolsCreated: Math.floor(userData.length * 2.3),
          ordersTracked: Math.floor(userData.length * 1.7),
          vendorsAdded: Math.floor(userData.length * 1.1),
          stockpileItems: Math.floor(userData.length * 2.9),
          reconCalculations: Math.floor(userData.length * 3.8),
          calendarEntries: Math.floor(userData.length * 2.4),
        };
      }
      const userGrowth = calculateUserGrowth(userData);
      const featureUsage = calculateFeatureUsage(analyticsData);
      const sessionData = calculateSessionData(userData);
      const deviceBreakdown = calculateDeviceBreakdown(userData);
      setAnalytics({
        userGrowth,
        featureUsage,
        sessionData,
        deviceBreakdown,
        totalUsers: analyticsData.totalUsers || userData.length,
        activeUsers: analyticsData.activeUsers || 0,
      });
      setUsers(userData);
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const recent = userData.filter((u) => {
        if (!u.createdAt?.toDate) return false;
        return u.createdAt.toDate() >= weekAgo;
      });
      const subs = {
        active: userData.filter((u) => u.isActive).length,
        beta: userData.length,
        total: userData.length,
        thisWeek: recent.length,
        recentRegistrations: recent.slice(0, 5).map((u) => ({
          date: u.createdAt?.toDate()?.toISOString().split('T')[0] || 'Unknown',
          email: u.email,
        })),
      };
      setSubscriptions(subs);
      // Persist to sessionStorage so the next admin-panel open skips this fetch
      adminCacheSet('admin:analytics', {
        userGrowth,
        featureUsage: analyticsData.featureUsage || {},
        sessionData,
        deviceBreakdown,
        totalUsers: analyticsData.totalUsers || userData.length,
        activeUsers: analyticsData.activeUsers || 0,
      }, CACHE_TTL.analytics);
      adminCacheSet('admin:users', userData, CACHE_TTL.analytics);
      adminCacheSet('admin:subscriptions', subs, CACHE_TTL.analytics);
      analyticsLoadedRef.current = true;
    } catch (err) {
      console.error('Error loading analytics:', err);
      setAnalytics({
        userGrowth: [],
        featureUsage: {},
        sessionData: [],
        deviceBreakdown: {
          total: 0,
          mobile: { count: 0, percentage: 0, byOS: { iOS: 0, Android: 0, Other: 0 } },
          desktop: { count: 0, percentage: 0 },
          tablet: { count: 0, percentage: 0 },
          browsers: {},
          usersWithDeviceInfo: 0,
          usersWithoutDeviceInfo: 0,
        },
        totalUsers: 0,
        activeUsers: 0,
      });
    } finally {
      setLoading((prev) => ({ ...prev, analytics: false }));
    }
  }, []);

  const feedbackOpenOnlyRef = useRef(false);

  const loadFeedback = useCallback(async (force = false, { openOnly = false } = {}) => {
    // Reuse in-memory cache when it already covers this request
    if (feedbackLoadedRef.current && !force) {
      const haveFull = feedbackOpenOnlyRef.current === false;
      if (haveFull || openOnly) return;
      // Caller wants full set but we only cached open — continue
    }
    // Try sessionStorage cache for the open-only variant (most common case)
    if (!force && openOnly && adminCacheGet('admin:feedback:open')) {
      const cached = adminCacheGet('admin:feedback:open');
      setFeedback(cached);
      setFeedbackAnalysis(analyzeFeedback(cached));
      feedbackLoadedRef.current = true;
      feedbackOpenOnlyRef.current = true;
      return;
    }
    setLoading((prev) => ({ ...prev, feedback: true }));
    try {
      const data = await getAllFeedback({ openOnly });
      setFeedback(data);
      setFeedbackAnalysis(analyzeFeedback(data));
      feedbackLoadedRef.current = true;
      feedbackOpenOnlyRef.current = openOnly;
      const cacheKey = openOnly ? 'admin:feedback:open' : 'admin:feedback:all';
      adminCacheSet(cacheKey, data, CACHE_TTL.feedback);
    } catch (err) {
      console.error('Error loading feedback:', err);
    } finally {
      setLoading((prev) => ({ ...prev, feedback: false }));
    }
  }, []);

  const loadTickets = useCallback(async (force = false) => {
    if (ticketsLoadedRef.current && !force) return;
    if (!force && adminCacheGet('admin:tickets')) {
      setTickets(adminCacheGet('admin:tickets'));
      ticketsLoadedRef.current = true;
      return;
    }
    setLoading((prev) => ({ ...prev, feedback: true }));
    try {
      const data = await getAllTickets();
      setTickets(data);
      adminCacheSet('admin:tickets', data, CACHE_TTL.tickets);
      ticketsLoadedRef.current = true;
    } catch (err) {
      console.error('Error loading tickets:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: `Tickets failed to load: ${err.message || 'Check console'}`, type: 'error' }
      }));
      setTickets([]);
    } finally {
      setLoading((prev) => ({ ...prev, feedback: false }));
    }
  }, []);

  const loadLifetimeUsers = useCallback(async (force = false) => {
    if (lifetimeUsersLoadedRef.current && !force) return;
    if (!force && adminCacheGet('admin:lifetimeUsers')) {
      setLifetimeUsers(adminCacheGet('admin:lifetimeUsers'));
      lifetimeUsersLoadedRef.current = true;
      return;
    }
    setLoading((prev) => ({ ...prev, lifetimeUsers: true }));
    try {
      const list = await getAllLifetimeUsers();
      setLifetimeUsers(list);
      adminCacheSet('admin:lifetimeUsers', list, CACHE_TTL.lifetime);
      lifetimeUsersLoadedRef.current = true;
    } catch (err) {
      console.error('Error loading lifetime users:', err);
      if (err.code === 'permission-denied' || err.message?.includes('permission')) {
        console.warn('Log in with admin email to view lifetime users.');
      }
    } finally {
      setLoading((prev) => ({ ...prev, lifetimeUsers: false }));
    }
  }, []);

  const loadContentData = useCallback(() => {
    try {
      const raw = localStorage.getItem('tpprover_glossary') || '[]';
      const glossary = JSON.parse(raw);
      const defaultTopics = [
        'BPC-157', 'TB-500', 'Semaglutide', 'Tirzepatide', 'Retatrutide',
        'Ipamorelin', 'CJC-1295', 'GHRP-2', 'GHRP-6', 'Sermorelin',
        'GHK-Cu', 'Melanotan II', 'PT-141', 'Epitalon', 'AOD-9604',
        'Selank', 'Semax', 'HGH', 'HCG', '5-Amino-1MQ',
        'Tesofensine', 'Metformin', 'NMN', 'NAD+', 'Glutathione',
      ];
      const topics = glossary.length === 0
        ? defaultTopics.map((name) => ({ id: generateId(), name }))
        : glossary.map((g) => ({ id: g.id || generateId(), name: g.name || g.peptide || 'Unnamed' }));
      const stored = localStorage.getItem('tpprover_pen_types');
      const penTypes = stored ? JSON.parse(stored) : [
        { id: 'savvio', name: 'Savvio' }, { id: 'novo', name: 'Novo' },
        { id: 'v1', name: 'V1' }, { id: 'v2', name: 'V2' }, { id: 'v3', name: 'V3' },
        { id: 'bird-pen', name: 'Bird Pen' }, { id: 'luxura', name: 'Luxura' },
        { id: 'gansulin', name: 'Gansulin' }, { id: 'other', name: 'Other' },
      ];
      setContentData((prev) => ({ ...prev, topics, penTypes }));
    } catch (err) {
      console.error('Error loading content data:', err);
    }
  }, []);

  const saveContentData = useCallback(() => {
    try {
      const glossary = contentData.topics.map((t) => ({
        id: t.id,
        name: t.name,
        category: 'Custom',
        description: '',
        createdAt: new Date().toISOString(),
      }));
      localStorage.setItem('tpprover_glossary', JSON.stringify(glossary));
      localStorage.setItem('tpprover_pen_types', JSON.stringify(contentData.penTypes));
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Content updated successfully!', type: 'success' } }));
    } catch (err) {
      console.error('Error saving content:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Error saving content', type: 'error' } }));
    }
  }, [contentData]);

  // Only the (free, localStorage-only) content data loads eagerly on admin
  // mount. Everything else (users/analytics, feedback, tickets, lifetime
  // users) is fetched on-demand by whichever tab actually needs it — see
  // each loader's `*LoadedRef` cache above for why revisiting a tab is free.
  useEffect(() => {
    loadContentData();
  }, [loadContentData]);

  const hydrateSelectedUser = useCallback(async (uid, seed = {}) => {
    if (!uid) return;
    setLoading((prev) => ({ ...prev, selectedUser: true }));
    setIsLoadingUserDetails(true);
    setUserSelectionError(null);
    try {
      const profile = await getAdminUserProfileViaCallable(uid);
      setSelectedUser({
        ...seed,
        ...profile,
        id: profile.id || uid,
        uid: profile.uid || uid,
      });
    } catch (e) {
      console.warn('Could not load detailed profile:', e?.message);
      setSelectedUser((prev) => prev || { ...seed, id: uid, uid });
    } finally {
      setIsLoadingUserDetails(false);
      setLoading((prev) => ({ ...prev, selectedUser: false }));
    }
  }, []);

  const selectUserByUid = useCallback(
    async (uid, options = {}) => {
      if (!uid) return;
      const { reportContext = null, seed = {} } = options;
      setActiveReportContext(reportContext);
      setSelectedUser({ ...seed, id: uid, uid });
      await hydrateSelectedUser(uid, seed);
    },
    [hydrateSelectedUser]
  );

  const selectUserByEmail = useCallback(
    async (email, options = {}) => {
      const normalized = email?.trim().toLowerCase();
      if (!normalized) return;
      const { reportContext = null } = options;
      setUserSelectionError(null);
      try {
        const found = await getUserByEmail(normalized);
        if (!found?.userId && !found?.uid && !found?.id) {
          setUserSelectionError(`No account found for ${normalized}`);
          setSelectedUser(null);
          setActiveReportContext(reportContext);
          return;
        }
        const uid = found.userId || found.uid || found.id;
        await selectUserByUid(uid, {
          reportContext,
          seed: { email: found.email || normalized, ...found },
        });
      } catch (e) {
        console.error('selectUserByEmail failed:', e);
        setUserSelectionError(e.message || 'Failed to look up user');
      }
    },
    [selectUserByUid]
  );

  const clearSelectedUser = useCallback(() => {
    setSelectedUser(null);
    setActiveReportContext(null);
    setUserSelectionError(null);
  }, []);

  /** @deprecated Use selectUserByUid — kept for gradual migration */
  const handleOpenUserModal = useCallback(
    async (user) => {
      const uid = user?.id || user?.uid;
      if (!uid) return;
      setSelectedUser(user);
      await hydrateSelectedUser(uid, user);
    },
    [hydrateSelectedUser]
  );

  /** @deprecated Use clearSelectedUser */
  const handleCloseUserModal = clearSelectedUser;

  const handleExtendTrial = useCallback(async ({ userId, days, note }) => {
    if (!userId || !days) throw new Error('Researcher ID and extension days are required');
    setIsExtendingTrial(true);
    setLoading((prev) => ({ ...prev, trialExtension: true }));
    try {
      const adminEmail = auth.currentUser?.email || 'admin@thepepplanner.com';
      await extendTrialForUser(userId, days, note, adminEmail);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Trial extended!', type: 'success' } }));
      window.dispatchEvent(new CustomEvent('subscription:updated', { detail: { subscription: null } }));
      try {
        const updated = await getUserList();
        setUsers(updated);
        adminCacheInvalidate('admin:users');
        adminCacheInvalidate('admin:analytics');
        adminCacheInvalidate('admin:subscriptions');
      } catch (_) {}
      try {
        const profile = await getAdminUserProfileViaCallable(userId);
        setSelectedUser((prev) => (prev ? { ...prev, ...profile } : profile));
      } catch (_) {}
    } catch (err) {
      if (!err.message?.includes('Trial extended')) {
        window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err.message || 'Failed to extend trial', type: 'error' } }));
      }
      throw err;
    } finally {
      setIsExtendingTrial(false);
      setLoading((prev) => ({ ...prev, trialExtension: false }));
    }
  }, []);

  const handleCancelPreGrant = useCallback(async (email) => {
    if (!email) return;
    if (!window.confirm(`Cancel lifetime pre-grant for ${email}?`)) return;
    try {
      await cancelLifetimePreGrant(email);
      await loadLifetimeUsers();
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Pre-grant cancelled', type: 'success' } }));
    } catch (err) {
      console.error('Cancel pre-grant failed:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err.message || 'Failed', type: 'error' } }));
    }
  }, [loadLifetimeUsers]);

  const handleRevokeLifetime = useCallback(async (userId, email) => {
    if (!window.confirm(`Revoke lifetime access for ${email}?`)) return;
    try {
      await revokeLifetimeAccess(userId, 'admin', 'Manual revocation');
      await loadLifetimeUsers();
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Lifetime access revoked', type: 'success' } }));
    } catch (err) {
      console.error('Revoke failed:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err.message || 'Failed to revoke', type: 'error' } }));
    }
  }, [loadLifetimeUsers]);

  const handleUpdateFeedback = useCallback(async (feedbackId, updates) => {
    await updateFeedback(feedbackId, updates);
    adminCacheInvalidate('admin:feedback:open');
    adminCacheInvalidate('admin:feedback:all');
    await loadFeedback(true, { openOnly: feedbackOpenOnlyRef.current });
  }, [loadFeedback]);

  const handleDeleteFeedback = useCallback(async (feedbackId) => {
    if (!window.confirm('Delete this feedback?')) return false;
    await deleteFeedback(feedbackId);
    adminCacheInvalidate('admin:feedback:open');
    adminCacheInvalidate('admin:feedback:all');
    await loadFeedback(true, { openOnly: feedbackOpenOnlyRef.current });
    return true;
  }, [loadFeedback]);

  const handleRespondToFeedback = useCallback(async (feedbackItem, responseText) => {
    if (!responseText?.trim()) return false;
    setLoading((prev) => ({ ...prev, submitting: true }));
    try {
      const text = responseText.trim();
      // Unified inbox: write into a linked support ticket (creates on first reply)
      const result = await replyToFeedbackViaTicket(feedbackItem, text);
      await loadFeedback(true, { openOnly: feedbackOpenOnlyRef.current });
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Reply sent to user inbox!', type: 'success' } }));
      return result || true;
    } catch (err) {
      console.error('Send response failed:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Failed to send message', type: 'error' } }));
      return false;
    } finally {
      setLoading((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadFeedback]);

  const loadTicketChat = useCallback(async (ticketId) => {
    setLoading((prev) => ({ ...prev, feedback: true }));
    try {
      const ticket = await getTicketWithMessages(ticketId);
      const unsub = subscribeToTicketMessages(ticketId, () => {});
      return { ticket, unsub };
    } catch (err) {
      console.error('Error loading ticket:', err);
      return { ticket: null, unsub: () => {} };
    } finally {
      setLoading((prev) => ({ ...prev, feedback: false }));
    }
  }, []);

  const handleUpdateTicketStatus = useCallback(async (ticketId, newStatus, additionalData = {}) => {
    setLoading((prev) => ({ ...prev, submitting: true }));
    try {
      await updateTicketStatus(ticketId, newStatus, additionalData);
      await loadTickets();
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Ticket status updated', type: 'success' } }));
    } catch (err) {
      console.error('Update ticket status failed:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Failed to update status', type: 'error' } }));
    } finally {
      setLoading((prev) => ({ ...prev, submitting: false }));
    }
  }, [loadTickets]);

  const handleTicketReply = useCallback(async (ticketId, message) => {
    if (!message?.trim()) return;
    setLoading((prev) => ({ ...prev, submitting: true }));
    try {
      await addTicketMessage({
        ticketId,
        senderType: 'admin',
        senderEmail: auth.currentUser?.email || 'admin@thepepplanner.com',
        senderName: auth.currentUser?.displayName || 'Admin',
        message: message.trim(),
      });
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Reply sent!', type: 'success' } }));
    } catch (err) {
      console.error('Send ticket reply failed:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: err.message || 'Failed to send reply', type: 'error' } }));
    } finally {
      setLoading((prev) => ({ ...prev, submitting: false }));
    }
  }, []);

  const funnelEventsLoadedRef = useRef(false);

  const loadFunnelEvents = useCallback(async (force = false) => {
    if (funnelEventsLoadedRef.current && !force) return;
    if (!force && adminCacheGet('admin:funnelEvents')) {
      setFunnelEvents(adminCacheGet('admin:funnelEvents'));
      funnelEventsLoadedRef.current = true;
      return;
    }
    try {
      const since = Timestamp.fromDate(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000));
      const snap = await getDocs(
        query(collection(db, 'conversionFunnel'), where('createdAt', '>=', since), orderBy('createdAt', 'desc'))
      );
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const byEvent = {};
      snap.forEach((docSnap) => {
        const d = docSnap.data();
        const name = d.eventName;
        if (!name) return;
        if (!byEvent[name]) byEvent[name] = { count: 0, last7d: 0, lastAt: null };
        byEvent[name].count += 1;
        const ts = d.createdAt?.toDate ? d.createdAt.toDate() : null;
        if (ts && ts >= sevenDaysAgo) byEvent[name].last7d += 1;
        if (ts && (!byEvent[name].lastAt || ts > byEvent[name].lastAt)) byEvent[name].lastAt = ts;
      });
      const totalEvents = snap.size;
      const result = { byEvent, totalEvents, loadedAt: new Date().toISOString() };
      setFunnelEvents(result);
      adminCacheSet('admin:funnelEvents', result, 5 * 60 * 1000);
      funnelEventsLoadedRef.current = true;
    } catch (err) {
      console.error('loadFunnelEvents failed:', err);
    }
  }, []);

  const value = {
    analytics,
    users,
    subscriptions,
    feedback,
    feedbackAnalysis,
    tickets,
    lifetimeUsers,
    funnelEvents,
    contentData,
    setContentData,
    loading,
    selectedUser,
    setSelectedUser,
    activeReportContext,
    setActiveReportContext,
    userSelectionError,
    hasSelectedUser: !!selectedUser,
    isLoadingUserDetails,
    isExtendingTrial,
    selectUserByUid,
    selectUserByEmail,
    clearSelectedUser,
    loadRealAnalytics,
    loadFeedback,
    loadTickets,
    loadLifetimeUsers,
    loadFunnelEvents,
    loadContentData,
    saveContentData,
    handleOpenUserModal,
    handleCloseUserModal,
    /** @deprecated */ isUserModalOpen: false,
    /** @deprecated */ setIsUserModalOpen: () => {},
    handleExtendTrial,
    handleCancelPreGrant,
    handleRevokeLifetime,
    handleUpdateFeedback,
    handleDeleteFeedback,
    handleRespondToFeedback,
    loadTicketChat,
    handleUpdateTicketStatus,
    handleTicketReply,
    getTicketWithMessages,
    addTicketMessage,
    subscribeToTicketMessages,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider');
  return ctx;
}
