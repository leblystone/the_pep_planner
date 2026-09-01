import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { ChevronUp, ChevronDown, Flame, HelpCircle } from 'lucide-react';
import { ListChecks } from '@phosphor-icons/react';
import {
  Drop,
  Scales,
  TrendUp,
  TrendDown,
  Check,
} from '@phosphor-icons/react';
import SideEffectsQuickSheet from '../components/sideeffects/SideEffectsQuickSheet';
import ProtocolNotesSheet from '../components/sideeffects/ProtocolNotesSheet';
import { loadSideEffects } from '../utils/sideEffectsLog';
import { getProtocolAccentHex } from '../utils/protocolColors';
import { useAppContext } from '../context/AppContext';
import { useBadgeStats } from '../utils/badges';
import { useSubscriptionAccess, useTierAccess } from '../utils/useSubscriptionAccess';
import DashboardWidget from '../components/dashboard/DashboardWidget';
import DashboardCustomizer from '../components/dashboard/DashboardCustomizer';
import WidgetFactory from '../components/dashboard/WidgetFactory';
// Toast notifications now handled globally in App.jsx
import useLocalStorage, { useSyncedGoals } from '../utils/hooks';
import { 
  loadDashboardLayout, 
  saveDashboardLayout,
  loadDashboardLayoutFromCloud,
  ensureProtocolsCardWidget,
  PROTOCOLS_CARD_WIDGET,
  MANAGE_WIDGETS_VERSION,
  getSizeConfig,
  WIDGET_TYPES,
} from '../utils/dashboardCustomization';
import ActiveProtocolsHomeCard from '../components/dashboard/ActiveProtocolsHomeCard';
import { fixDataInconsistencies, diagnoseDashboardData } from '../utils/dataCleanup';
import { getLocalDateString } from '../utils/date';
import { getMergedMetricForDay, upsertMetricForDay, metricDateKey } from '../utils/metricsDisplay';
import { generateTaskId, toggleTaskCompletion, isTaskCompleted, getCalendarDone, migrateTaskCompletionSlot } from '../utils/taskCompletion';
import { setSlotMoveOverride, setSkipOverride, setExtraOverride, clearSkipOverride, clearExtraOverride } from '../utils/taskScheduleOverrides';
import { maybeIncrementStreakForAllTasksComplete, dispatchStreakIncrementEvents } from '../utils/taskStreak';
import { tryHydrationGoalRewards, getHydrationStreak } from '../utils/hydrationStreak';
import { toKey } from '../components/calendar/MonthGrid';
import { calculateScheduledTasksForDate } from '../utils/calendarTasks';
import { areAnalyticsEnabled, areGroupBuysEnabled } from '../utils/featureSettings';
import { isInjectionSiteTrackingEnabled } from '../utils/injectionSiteSettings';

// Import modals that might be needed
import ReconCalculatorModal from '../components/recon/ReconCalculatorModal';
import OCRImportModal from '../components/import/OCRImportModal';
import OrderDetailsModal from '../components/orders/OrderDetailsModal';
import ProtocolEditorModal from '../components/protocols/ProtocolEditorModal';
import QuickStartProtocolModal from '../components/protocols/QuickStartProtocolModal';
import GuidedProtocolWalkthrough from '../components/onboarding/GuidedProtocolWalkthrough';
import { getLocalTrackingMode, isSimpleMode } from '../utils/trackingMode';
import LogOneOffDoseModal from '../components/doses/LogOneOffDoseModal';
import { saveProtocolHistoryEntry } from '../utils/protocolHistory';
import { oneOffDoseToDisplayTask, getOneOffDosesForDate } from '../utils/oneOffDoses';
import VendorDetailsModal from '../components/vendors/VendorDetailsModal';
import GoalModal from '../components/research/GoalModal';
import BodyMetricsModal from '../components/research/BodyMetricsModal';
import SupplementEditorModal from '../components/dashboard/SupplementEditorModal';
import BadgesModal from '../components/badges/BadgesModal';
import AddScheduledBuyModal from '../components/orders/AddScheduledBuyModal';
import AddWishlistItemModal from '../components/dashboard/AddWishlistItemModal';
import AddToStockpileBottomSheet from '../components/stockpile/AddToStockpileBottomSheet';
import BottomSheet from '../components/common/BottomSheet';
import DontForgetWidget from '../components/dashboard/widgets/DontForgetWidget';
import ExpandableTooltip from '../components/ui/ExpandableTooltip';
import { WIDGET_TOOLTIPS } from '../utils/widgetTooltips';
import ProtocolFollowUpModal from '../components/protocols/ProtocolFollowUpModal';
import ConversionWidget from '../components/dashboard/ConversionWidget';
import UpgradeModal from '../components/common/UpgradeModal';
import DashboardTipsBanner from '../components/dashboard/DashboardTipsBanner';
import DashboardBioCheckIn from '../components/dashboard/DashboardBioCheckIn';
import { ensurePublicOrderNumbers, getNextPublicOrderNumber } from '../utils/orderNumbers';
import { saveAppData } from '../services/cloudStorage';
import { useFirebase } from '../context/FirebaseContext';
import { recordDeletion } from '../utils/deletionTracking';
import { generateId } from '../utils/string';
import { prepareItemForSave } from '../utils/userDataSave';
import { buildOrderPrefillFromWishlistItem, buildStockpilePrefillFromWishlistItem } from '../utils/wishlistAcquirePrefill';
import { markWishlistItemAcquired } from '../utils/wishlistHistory';

const WATER_CARD_BLUE = '#3b9ed8';

/** Blend hex toward white (ratio 0–1) for a slightly lifted sage stop on the lightest FAB. */
function lightenHex(hex, ratio = 0.2) {
  if (!hex || typeof hex !== 'string') return hex;
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 6 && clean.length !== 8) return hex;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  const lr = Math.min(255, Math.round(r + (255 - r) * ratio));
  const lg = Math.min(255, Math.round(g + (255 - g) * ratio));
  const lb = Math.min(255, Math.round(b + (255 - b) * ratio));
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

export default function CustomizableDashboard() {
  const { theme } = useOutletContext();
  const navigate = useNavigate();
  const { isReadOnly } = useSubscriptionAccess();
  const { caps: tierCaps } = useTierAccess();
  const capsEnforced = tierCaps?.enforced ?? false;
  const { firebaseUser } = useFirebase();
  const { 
    scheduledBuys,
    setScheduledBuys, 
    orders, 
    setOrders, 
    vendors, 
    setVendors,
    addVendor,
    protocols,
    setProtocols,
    addProtocol, 
    supplements, 
    addSupplement, 
    updateSupplement, 
    deleteSupplement,
    subscription,
    reconItems,
    reconHistory,
    calendarNotes,
    stockpile,
    setStockpile,
    metrics,
    setMetrics,
    oneOffDoses,
    medications,
  } = useAppContext();

  const activeProtocols = (protocols || []).filter(p => p.active !== false);

  // Active protocols that are fully "as needed" — shown in Today's Research as tappable log buttons
  const asNeededProtocols = React.useMemo(() =>
    (protocols || []).filter((p) => {
      if (p.active === false) return false;
      const peptides = Array.isArray(p.peptides) ? p.peptides : [];
      return peptides.length > 0 && peptides.every((pep) => (pep.frequency?.type || '') === 'as_needed');
    }),
    [protocols]
  );

  // Dashboard customization state
  const [widgets, setWidgets] = useState(() => ensureProtocolsCardWidget(loadDashboardLayout()));
  const [showCustomizer, setShowCustomizer] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);
  const [groupBuysEnabled, setGroupBuysEnabled] = useState(true);
  const [injectionSiteTrackingEnabled, setInjectionSiteTrackingEnabled] = useState(true);
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 1024);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handle = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', handle);
    return () => mq.removeEventListener('change', handle);
  }, []);

  useEffect(() => {
    const reloadLayout = () => setWidgets(ensureProtocolsCardWidget(loadDashboardLayout()));
    window.addEventListener('tpp:dashboard-layout-changed', reloadLayout);
    window.addEventListener('tpp:tracking-mode-changed', reloadLayout);
    return () => {
      window.removeEventListener('tpp:dashboard-layout-changed', reloadLayout);
      window.removeEventListener('tpp:tracking-mode-changed', reloadLayout);
    };
  }, []);

  // Hydrate layout from cloud when signed in (cross-device)
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      const cloudWidgets = await loadDashboardLayoutFromCloud(uid);
      if (cancelled) return;
      if (cloudWidgets) {
        setWidgets(ensureProtocolsCardWidget(cloudWidgets));
      } else {
        // Seed cloud with current local layout so other devices can pick it up
        const local = ensureProtocolsCardWidget(loadDashboardLayout());
        saveDashboardLayout(local, { userId: uid });
      }
    })();
    return () => { cancelled = true; };
  }, [firebaseUser?.uid]);

  // Dashboard data state
  const [todaysTasks, setTodaysTasks] = useState([]);
  // Toast notifications now handled globally
  const [goals, setGoals] = useSyncedGoals();
  // metrics and setMetrics are now from useAppContext() above
  const [calendarBump, setCalendarBump] = useState(0);

  // Modal states
  const [showRecon, setShowRecon] = useState(false);
  const [reconPrefill, setReconPrefill] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [showNewVendor, setShowNewVendor] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showNewProtocol, setShowNewProtocol] = useState(false);
  const [showQuickStartProtocol, setShowQuickStartProtocol] = useState(false);
  const [showGuidedWalkthrough, setShowGuidedWalkthrough] = useState(false);
  const useGuidedCreate = isSimpleMode(getLocalTrackingMode());
  const [showLogOneOffDose, setShowLogOneOffDose] = useState(false);
  const [logOneOffPrefill, setLogOneOffPrefill] = useState(null);
  const [showGoal, setShowGoal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [editingMetric, setEditingMetric] = useState(null);
  const [showBackButton, setShowBackButton] = useState(false);
  const [onBackToAllEntries, setOnBackToAllEntries] = useState(null);

  const openMetricAdd = useCallback(() => {
    const existing = getMergedMetricForDay(metrics, getLocalDateString());
    setEditingMetric(existing || null);
    setShowMetrics(true);
    setShowBackButton(false);
    setOnBackToAllEntries(null);
  }, [metrics]);

  const openMetricEdit = useCallback((metric, onReopen) => {
    const dateKey = metricDateKey(metric) || metric?.date;
    setEditingMetric(dateKey ? (getMergedMetricForDay(metrics, dateKey) || metric) : metric);
    setShowMetrics(true);
    if (onReopen) {
      setShowBackButton(true);
      setOnBackToAllEntries(() => onReopen);
    } else {
      setShowBackButton(false);
      setOnBackToAllEntries(null);
    }
  }, [metrics]);
  const [showAddSupplement, setShowAddSupplement] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState(null);
  const [showBadges, setShowBadges] = useState(false);
  const [showAddBuyModal, setShowAddBuyModal] = useState(false);
  const [editingScheduledBuy, setEditingScheduledBuy] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [sideEffectProtocol, setSideEffectProtocol] = useState(null);
  const [notesProtocol, setNotesProtocol] = useState(null);
  const [allSideEffects, setAllSideEffects] = useState(() => loadSideEffects());
  const [showStockpileAdd, setShowStockpileAdd] = useState(false);
  const [wishlistStockpilePrefill, setWishlistStockpilePrefill] = useState(null);
  const [newOrderDraftFromWishlist, setNewOrderDraftFromWishlist] = useState(null);
  const [newOrderModalKey, setNewOrderModalKey] = useState(0);
  const [showAddWishlistModal, setShowAddWishlistModal] = useState(false);
  const [editingWishlistItem, setEditingWishlistItem] = useState(null);
  const [wishlist, setWishlist] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('tpprover_wishlist') || '[]');
    } catch {
      return [];
    }
  });

  const [fabOpen, setFabOpen] = useState(false);

  const openBlankNewOrder = useCallback(() => {
    setNewOrderDraftFromWishlist(null);
    setNewOrderModalKey((k) => k + 1);
    setShowNewOrder(true);
  }, []);

  const handleWishlistAcquire = useCallback((item, destination) => {
    if (isReadOnly) {
      setShowUpgradeModal(true);
      return;
    }
    if (!item?.id) return;
    const next = markWishlistItemAcquired(item);
    setWishlist(next);
    if (destination === 'order') {
      const draft = buildOrderPrefillFromWishlistItem(item);
      setNewOrderDraftFromWishlist(draft);
      setNewOrderModalKey((k) => k + 1);
      setShowNewOrder(true);
    } else {
      setWishlistStockpilePrefill(buildStockpilePrefillFromWishlistItem(item));
      setShowStockpileAdd(true);
    }
  }, [isReadOnly]);

  // FAB speed-dial
  const fabClosing = false; // kept for code compat — close is now instant
  const beginFabClose = useCallback(() => { setFabOpen(false); }, []);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onBp = () => {
      if (mq.matches) setFabOpen(false);
    };
    onBp();
    mq.addEventListener('change', onBp);
    return () => mq.removeEventListener('change', onBp);
  }, []);

  const fabDark = theme.primaryDark || theme.primary;
  const fabMid = theme.primary;
  const fabLight = theme.primaryLight || theme.primary;
  const lift = theme.isDark ? 0.1 : 0.18;
  const fabLightA = lightenHex(fabLight, lift * 0.55);
  const fabLightB = lightenHex(fabLight, lift);
  // Satellites top → bottom: darkest … lightest (Start Protocol → Add Stockpile)
  const fabSatelliteGradients = [
    `linear-gradient(152deg, ${fabDark} 0%, ${fabMid} 58%, ${fabMid} 100%)`,
    `linear-gradient(152deg, ${fabDark} 0%, ${fabMid} 36%, ${fabLight} 100%)`,
    `linear-gradient(152deg, ${fabMid} 0%, ${fabLight} 52%, ${fabLightA} 100%)`,
    `linear-gradient(152deg, ${fabMid} 0%, ${fabLight} 32%, ${fabLightB} 100%)`,
  ];
  const fabMainGradient = fabSatelliteGradients[0];
  const fabInsetBevel = theme.isDark
    ? 'inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.45)'
    : 'inset 0 1px 0 rgba(255,255,255,0.42), inset 0 -2px 0 rgba(0,0,0,0.12)';
  const fabMainDropShadow = theme.isDark ? '0 4px 18px rgba(0,0,0,0.5)' : '0 4px 16px rgba(0,0,0,0.22)';
  const fabSatelliteDropShadow = theme.isDark ? '0 2px 10px rgba(0,0,0,0.45)' : '0 2px 10px rgba(0,0,0,0.14)';

  // Research Notes modal is now handled globally in App.jsx

  // vendorNames removed — use `vendors` from AppContext instead

  // Check analytics, group buys, and injection site tracking settings on mount and when they change
  useEffect(() => {
    const checkSettings = () => {
      setAnalyticsEnabled(areAnalyticsEnabled());
      setGroupBuysEnabled(areGroupBuysEnabled());
      setInjectionSiteTrackingEnabled(isInjectionSiteTrackingEnabled());
    };
    
    // Check on mount
    checkSettings();
    
    // Listen for settings changes (cross-tab)
    const handleStorageChange = (e) => {
      if (e.key === 'tpprover_settings' || !e.key) {
        checkSettings();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Also check periodically in case settings changed in same window
    // Reduced frequency to every 2 seconds for better performance
    const interval = setInterval(checkSettings, 2000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Incoming Peptides (Advanced): show only while an order is active, plus 3 days after delivery
  const incomingOrders = useMemo(() => {
    if (!orders || orders.length === 0) return [];

    const startOfLocalDay = (value) => {
      const d = value instanceof Date ? new Date(value) : new Date(value);
      if (Number.isNaN(d.getTime())) return null;
      d.setHours(0, 0, 0, 0);
      return d;
    };

    const cutoff = startOfLocalDay(new Date());
    if (!cutoff) return [];
    cutoff.setDate(cutoff.getDate() - 3);

    const activeOrders = orders.filter((o) => {
      const status = (o.status || '').toLowerCase();
      if (status.includes('cancel')) return false;

      const isDelivered = status.includes('delivered');
      if (!isDelivered) return true; // Order Placed / In Transit / Shipped

      // Delivered: keep on dashboard for 3 extra days, then drop
      const deliveredRaw = o.deliveryDate || o.dateDelivered || o.deliveredAt;
      const deliveredDay = deliveredRaw ? startOfLocalDay(deliveredRaw) : null;
      if (!deliveredDay) return false;
      return deliveredDay >= cutoff;
    });

    if (activeOrders.length === 0) return [];

    activeOrders.sort((a, b) => {
      const dateA = new Date(a.deliveryDate || a.shipDate || a.date || 0);
      const dateB = new Date(b.deliveryDate || b.shipDate || b.date || 0);
      return dateA - dateB;
    });

    return activeOrders.map((o) => ({
      id: o.id,
      peptide: o.items?.[0]?.name || 'Unknown Item',
      mg: o.items?.[0]?.mg || 'N/A',
      vendor: o.vendorName || o.vendor || 'Unknown Vendor',
      status: o.status || 'Order Placed',
      shipDate: o.shipDate || o.date,
      deliveryDate: o.deliveryDate,
      date: o.date,
      tracking: o.tracking,
    }));
  }, [orders]);

  const incomingOrder = incomingOrders.length > 0 ? incomingOrders[0] : null;

  const pendingVendors = useMemo(() => {
    return vendors.filter(vendor => vendor.isStub === true);
  }, [vendors]);

  // Action-items sheet state (opened from Topbar ClipboardList icon)
  const [showActionItemsSheet, setShowActionItemsSheet] = useState(false);

  // To-Do inline modals — open directly without leaving the page
  const [toDoFollowUp, setToDoFollowUp] = useState(null); // { protocolId, historyId }
  const [toDoStockpileItem, setToDoStockpileItem] = useState(null); // stockpile item object

  // Quick-action cards: water + weight

  // Read hydration prefs from settings
  const hydrationPrefs = useMemo(() => {
    try {
      const s = JSON.parse(localStorage.getItem('tpprover_settings') || '{}');
      return { unit: s.hydration?.unit || 'oz', cupSize: s.hydration?.cupSize || 8, dailyGoal: s.hydration?.dailyGoal || 64 };
    } catch { return { unit: 'oz', cupSize: 8, dailyGoal: 64 }; }
  }, []);

  const [waterData, setWaterData] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tpprover_water_tracker') || '{}'); } catch { return {}; }
  });
  const [hydrationStreakN, setHydrationStreakN] = useState(() => getHydrationStreak());
  useEffect(() => {
    const sync = () => setHydrationStreakN(getHydrationStreak());
    window.addEventListener('tpp:hydration-streak-updated', sync);
    window.addEventListener('tpp:hydration-goal-complete', sync);
    return () => {
      window.removeEventListener('tpp:hydration-streak-updated', sync);
      window.removeEventListener('tpp:hydration-goal-complete', sync);
    };
  }, []);

  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const todayWater = waterData[today] || { amount: 0, goal: hydrationPrefs.dailyGoal, unit: hydrationPrefs.unit };
  const todayWaterAmt = Number(todayWater.amount ?? todayWater.glasses ?? 0) || 0;
  const waterPct = Math.min(todayWaterAmt / (todayWater.goal || hydrationPrefs.dailyGoal), 1);

  const addWater = useCallback((amount) => {
    const updated = { ...waterData };
    const prev = updated[today] || {};
    const prevAmt = Number(prev.amount ?? prev.glasses ?? 0) || 0;
    const goal = prev.goal > 0 ? prev.goal : hydrationPrefs.dailyGoal;
    const unit = prev.unit || hydrationPrefs.unit;
    const newAmt = Math.max(0, prevAmt + amount);
    const dayData = {
      ...prev,
      amount: newAmt,
      glasses: newAmt,
      goal,
      unit,
    };
    updated[today] = dayData;
    setWaterData(updated);
    localStorage.setItem('tpprover_water_tracker', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('tpp:water-tracker-updated', { detail: { waterData: updated } }));
    tryHydrationGoalRewards(today, dayData);
  }, [waterData, today, hydrationPrefs]);

  const commitMetricsUpdate = useCallback(async (updatedMetrics) => {
    setMetrics(updatedMetrics);
    if (!firebaseUser) return;
    try {
      const userId = firebaseUser.uid;
      const appData = {
        protocols: protocols || [],
        reconItems: reconItems || [],
        reconHistory: reconHistory || [],
        supplements: supplements || [],
        orders: orders || [],
        metrics: updatedMetrics,
        vendors: vendors || [],
        calendarNotes: calendarNotes || {},
        stockpile: stockpile || [],
        scheduledBuys: scheduledBuys || [],
      };
      await saveAppData(userId, appData, { skipMerge: true });
    } catch (error) {
      console.error('Error syncing metrics from check-in:', error);
    }
  }, [firebaseUser, protocols, reconItems, reconHistory, supplements, orders, vendors, calendarNotes, stockpile, scheduledBuys, setMetrics]);

  const lastWeight = useMemo(() => {
    const entries = (metrics || []).filter(m => (m.type || '').toLowerCase().includes('weight') || (m.label || '').toLowerCase().includes('weight'));
    if (!entries.length) return null;
    return entries.sort((a, b) => new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0))[0];
  }, [metrics]);

  /** Change vs previous logged weight (for Weight card footer). */
  const weightChange = useMemo(() => {
    const entries = (metrics || [])
      .filter(m => (m.type || '').toLowerCase().includes('weight') || (m.label || '').toLowerCase().includes('weight'))
      .map(m => {
        const raw = m.value ?? m.weight;
        const value = typeof raw === 'number' ? raw : parseFloat(raw);
        return {
          value: Number.isFinite(value) ? value : null,
          unit: m.unit || 'lbs',
          ts: new Date(m.date || m.createdAt || 0).getTime() || 0,
        };
      })
      .filter(e => e.value != null && e.value > 0)
      .sort((a, b) => b.ts - a.ts);

    if (entries.length < 2) return null;
    const current = entries[0];
    const previous = entries[1];
    if (!(previous.value > 0)) return null;

    const delta = current.value - previous.value;
    const pct = (delta / previous.value) * 100;
    return {
      delta,
      pct,
      unit: current.unit || previous.unit || 'lbs',
      direction: delta === 0 ? 'flat' : delta < 0 ? 'down' : 'up',
    };
  }, [metrics]);

  const [weightInput, setWeightInput] = useState('');
  useEffect(() => {
    const handler = () => setShowActionItemsSheet(true);
    window.addEventListener('tpp:open-action-items', handler);
    return () => window.removeEventListener('tpp:open-action-items', handler);
  }, []);

  useEffect(() => {
    const handler = () => setAllSideEffects(loadSideEffects());
    window.addEventListener('tpp:side-effects-updated', handler);
    return () => window.removeEventListener('tpp:side-effects-updated', handler);
  }, []);

  // Filter mock scheduled buys when sample data is cleared.
  // AppContext already loads scheduledBuys from localStorage/Firebase on init and
  // keeps it in sync, so we only need to handle the sample-data-cleared event here.
  useEffect(() => {
    const handleSampleDataCleared = () => {
      setScheduledBuys(prev => prev.filter(b => {
        if (b.isMock) return false;
        const mockVendors = ['BioTech Solutions', 'Peptide Research Co', 'Research Labs Pro'];
        if (mockVendors.includes(b.vendor)) return false;
        if (b.id === 201 || b.id === 202 || b.id === 203) return false;
        const mockItems = ['Tirzepatide Bulk Order', 'BPC-157 Research Batch', 'Epithalon + Thymalin Stack'];
        if (mockItems.includes(b.item)) return false;
        return true;
      }));
    };

    window.addEventListener('sample-data-cleared', handleSampleDataCleared);

    return () => {
      window.removeEventListener('sample-data-cleared', handleSampleDataCleared);
    };
  }, [setScheduledBuys]);

  // Load and sync wishlist data
  // Wishlist is NOT in AppContext state, so we reload from localStorage when
  // cloud data arrives or when a local update event fires.
  useEffect(() => {
    const loadWishlist = () => {
      try {
        const raw = localStorage.getItem('tpprover_wishlist');
        if (raw) {
          const items = JSON.parse(raw);
          setWishlist(items);
        } else {
          setWishlist([]);
        }
      } catch (error) {
        console.error('Error loading wishlist:', error);
        setWishlist([]);
      }
    };

    loadWishlist();

    const handleWishlistUpdated = (e) => {
      if (e.detail?.wishlist) {
        setWishlist(e.detail.wishlist);
      } else {
        loadWishlist();
      }
    };

    const handleCloudDataLoaded = () => {
      loadWishlist();
    };

    window.addEventListener('tpp:wishlist-updated', handleWishlistUpdated);
    window.addEventListener('tpp:cloud-data-loaded', handleCloudDataLoaded);

    const handleStorageChange = (e) => {
      if (e.key === 'tpprover_wishlist') {
        loadWishlist();
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('tpp:wishlist-updated', handleWishlistUpdated);
      window.removeEventListener('tpp:cloud-data-loaded', handleCloudDataLoaded);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  // Listen for protocol history updates to refresh active protocols notes
  useEffect(() => {
    const handleProtocolHistoryUpdate = () => {
      // Force re-render of widgets that depend on protocol history
      // The widget will automatically refresh when protocols prop updates
    };

    window.addEventListener('tpp:protocol-history-updated', handleProtocolHistoryUpdate);
    return () => {
      window.removeEventListener('tpp:protocol-history-updated', handleProtocolHistoryUpdate);
    };
  }, []);

  // Quick Actions event listeners
  useEffect(() => {
    const handleOpenRecon = () => setShowRecon(true);
    const handleOpenOrder = () => {
      openBlankNewOrder();
    };
    const handleOpenVendor = () => {
      setEditingVendor(null);
      setShowNewVendor(true);
    };
    const handleOpenProtocol = () => {
      setShowNewProtocol(true);
    };
    // Manage widgets / layout customization deferred for this release
    const handleDashboardCustomize = () => {};
    const handleDashboardSettings = () => {};
    const handleGroupBuyDeletedInQuickActions = () => {
      // No-op: context scheduledBuys is already updated by the delete handler
    };

    window.addEventListener('tpp:openRecon', handleOpenRecon);
    window.addEventListener('tpp:openOrder', handleOpenOrder);
    window.addEventListener('tpp:openVendor', handleOpenVendor);
    window.addEventListener('tpp:openProtocol', handleOpenProtocol);
    window.addEventListener('tpp:dashboard-customize', handleDashboardCustomize);
    window.addEventListener('tpp:dashboard-settings', handleDashboardSettings);
    window.addEventListener('tpp:group-buy-deleted', handleGroupBuyDeletedInQuickActions);

    return () => {
      window.removeEventListener('tpp:openRecon', handleOpenRecon);
      window.removeEventListener('tpp:openOrder', handleOpenOrder);
      window.removeEventListener('tpp:openVendor', handleOpenVendor);
      window.removeEventListener('tpp:openProtocol', handleOpenProtocol);
      window.removeEventListener('tpp:dashboard-customize', handleDashboardCustomize);
      window.removeEventListener('tpp:dashboard-settings', handleDashboardSettings);
      window.removeEventListener('tpp:group-buy-deleted', handleGroupBuyDeletedInQuickActions);
    };
  }, [openBlankNewOrder]);

  // Listen for autosave changes to protocols
  useEffect(() => {
    const handleAutosaveChange = () => {

      // Force task regeneration by updating calendarBump
      setCalendarBump(Date.now());
    };

    // Listen for autosave events
    window.addEventListener('tpp:protocol-autosaved', handleAutosaveChange);
    
    return () => {
      window.removeEventListener('tpp:protocol-autosaved', handleAutosaveChange);
    };
  }, []);

  // Generate today's tasks from supplements and protocols
  // CRITICAL: Use Calendar's shared logic to ensure perfect sync
  useEffect(() => {
    // CRITICAL: Use Calendar's EXACT date calculation method to ensure perfect sync
    // Calendar uses: toKey(new Date()) which extracts year/month/day from current date
    const calendarRawDate = new Date();
    const finalToday = new Date(calendarRawDate.getFullYear(), calendarRawDate.getMonth(), calendarRawDate.getDate());
    finalToday.setHours(0, 0, 0, 0);
    
    try {
      // Get today's scheduled tasks using the same logic as Calendar
      const scheduledData = calculateScheduledTasksForDate(finalToday, protocols, supplements, reconItems, medications, capsEnforced);
      
      // Get the date key for today to check completion status
      const todayKey = toKey(finalToday);
      
      const tasks = [];
      
      // Convert Calendar's scheduled data format to Dashboard task format
      // Process peptides and supplements from all time slots
      Object.keys(scheduledData.bySlot || {}).forEach(timeSlot => {
        const slot = scheduledData.bySlot[timeSlot];
        
        // Process peptides
        if (slot.peptides && Array.isArray(slot.peptides)) {
          slot.peptides.forEach(pep => {
            // CRITICAL: Preserve ALL fields exactly as Calendar provides them
            // Do NOT use fallbacks that might override Calendar's data
            const pepProto = protocols.find(pr => pr.id === pep.protocolId);
            const task = {
              id: `${pep.protocolId || 'protocol'}-${pep.name || 'Peptide'}-${timeSlot}`,
              type: 'peptide',
              name: pep.name || 'Peptide',
              dose: pep.dose || '',
              unit: pep.unit || '',
              time: timeSlot,
              protocolId: pep.protocolId,
              peptideId: pep.peptideId,
              ownerId: pepProto?.ownerId,
              completed: false,
              deliveryMethod: pep.deliveryMethod || pep.delivery || 'pipette',
              delivery: pep.delivery || pep.deliveryMethod || 'pipette',
              penColor: pep.penColor,
              penType: pep.penType,
              protocolName: pep.name,
              administrationRoute: pep.administrationRoute,
              protocolAccentHex: getProtocolAccentHex(pepProto || { id: pep.protocolId }),
              movedFromProtocolSlot: pep._movedFromSlot || null,
              _skipped: !!pep._skipped,
              _rescheduled: !!pep._rescheduled,
              _extraSlot: !!pep._extraSlot,
              _fromDateKey: pep._fromDateKey || null,
              _toDateKey: pep._toDateKey || null,
              _toSlot: pep._toSlot || null,
              _extraId: pep._extraId || null,
              isCatchUp: !!pep._extraSlot,
              skipped: !!pep._skipped,
              rescheduled: !!pep._rescheduled,
            };
            
            // Generate stable task ID and check completion status for today's date
            const taskId = generateTaskId(task);
            const wasCompleted = isTaskCompleted(taskId, todayKey, timeSlot);
            task.completed = wasCompleted;
            task.stableTaskId = taskId;
            if (pep._extraSlot) {
              task.id = `${task.id}-catchup-${pep._fromDateKey || pep._extraId || 'x'}`;
            }
            tasks.push(task);
          });
        }
        
        // Process supplements
        if (slot.supplements && Array.isArray(slot.supplements)) {
          slot.supplements.forEach(supp => {
            const supFull = supplements.find((s) => s.id === supp.id);
            const task = {
              id: `${supp.id || 'supplement'}-${timeSlot}`,
              type: 'supplement',
              name: supp.name || 'Supplement',
              dose: supp.dose || '',
              unit: supp.unit || '',
              delivery: supp.delivery || supp.deliveryMethod || 'oral',
              time: timeSlot,
              ownerId: supFull?.ownerId || supp?.ownerId,
              completed: false,
              movedFromProtocolSlot: supp._movedFromSlot || null,
              _skipped: !!supp._skipped,
              _rescheduled: !!supp._rescheduled,
              _extraSlot: !!supp._extraSlot,
              _fromDateKey: supp._fromDateKey || null,
              _toDateKey: supp._toDateKey || null,
              _toSlot: supp._toSlot || null,
              _extraId: supp._extraId || null,
              isCatchUp: !!supp._extraSlot,
              skipped: !!supp._skipped,
              rescheduled: !!supp._rescheduled,
            };
            
            // Generate stable task ID and check completion status for today's date
            const taskId = generateTaskId(task);
            const wasCompleted = isTaskCompleted(taskId, todayKey, timeSlot);
            task.completed = wasCompleted;
            task.stableTaskId = taskId;
            if (supp._extraSlot) {
              task.id = `${task.id}-catchup-${supp._fromDateKey || supp._extraId || 'x'}`;
            }
            tasks.push(task);
          });
        }
      });

      // Append logged one-off doses for today
      const todayKeyForOneOff = toKey(finalToday);
      getOneOffDosesForDate(todayKeyForOneOff, oneOffDoses || []).forEach((dose) => {
        const display = oneOffDoseToDisplayTask(dose);
        if (display) tasks.push(display);
      });

      // Sort tasks: unchecked first, then checked, then by type, then by name
      tasks.sort((a, b) => {
        // First, sort by completion status (unchecked first, then checked)
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        // Then by type (peptides first)
        if (a.type === 'peptide' && b.type !== 'peptide') return -1
        if (a.type !== 'peptide' && b.type === 'peptide') return 1
        // Finally by name
        return a.name.localeCompare(b.name)
      });
      
      setTodaysTasks(tasks);
    } catch (error) {
      console.error('❌ CustomizableDashboard: Error generating tasks', error);
      console.error('Error stack:', error.stack);
      setTodaysTasks([]);
    }
  }, [supplements, medications, protocols, reconItems, calendarBump, oneOffDoses, capsEnforced]);

  // Gamification: streak + unlock celebration when all tasks for today are complete
  useEffect(() => {
    const dateKey = toKey(new Date());
    const schedulable = (todaysTasks || []).filter((t) => !t.isOneOff && t.type !== 'one_off');
    const res = maybeIncrementStreakForAllTasksComplete(schedulable, dateKey);
    if (res.incremented) {
      dispatchStreakIncrementEvents(res.streak, true);
    }
  }, [todaysTasks]);

  // Save layout when widgets change
  useEffect(() => {
    saveDashboardLayout(widgets);
  }, [widgets]);

  // Toast utility - now uses global toast system
  const addToast = (message, type = 'success') => {
    window.dispatchEvent(new CustomEvent('tpp:toast', { 
      detail: { message, type } 
    }));
  };

  // Widget management functions
  const handleUpdateWidgets = (newWidgets) => {
    setWidgets(newWidgets);
    saveDashboardLayout(newWidgets, { userId: firebaseUser?.uid });
  };

  // Task management - using unified completion system

  const handleTaskToggle = (taskOrId, date = new Date()) => {
    // Handle both task object and task ID
    let task;
    if (typeof taskOrId === 'string' || typeof taskOrId === 'number') {
      // If ID was passed, find the task
      task = todaysTasks.find(t => t.id === taskOrId || t.stableTaskId === taskOrId);
      if (!task) {
        console.warn('Task not found for ID:', taskOrId);
        return;
      }
    } else {
      task = taskOrId;
    }
    
    // Check if this is a syringe or pen delivery method
    const deliveryMethod = task.deliveryMethod || task.delivery;
    const isInjection = deliveryMethod === 'syringe' || deliveryMethod === 'pipette' || deliveryMethod === 'pen' || deliveryMethod === 'injection';
    
    // Injection confirmation is now handled inline in the task components
    
    const dateKey = toKey(date);
    const taskId = task.stableTaskId || generateTaskId(task);
    const currentlyCompleted = isTaskCompleted(taskId, dateKey, task.time);
    const newCompletedState = !currentlyCompleted;

    // Toggle in the unified system (this will dispatch the global event)
    toggleTaskCompletion(taskId, newCompletedState, dateKey, task.time, task.deliveryMethod || task.delivery || null);
    
    // CRITICAL: Update protection timestamp to prevent listener from overwriting
    // This prevents the real-time listener from replacing data for 30 seconds
    try {
      const now = Date.now();
      localStorage.setItem('tpprover_protocols_lastUpdate', String(now));
    } catch (e) {
      console.warn('⚠️ Failed to save task toggle protection timestamp:', e);
    }
    
    // Update local state to reflect the change immediately (for visual feedback)
    setTodaysTasks(prev => prev.map(t => {
      const tTaskId = t.stableTaskId || generateTaskId(t);
      if (tTaskId === taskId || t.id === task.id) {
        return { ...t, completed: newCompletedState };
      }
      return t;
    }));
    
    // Add a slight delay before re-sorting to let user see the check mark
    setTimeout(() => {
      setTodaysTasks(prev => {
        // Re-sort the tasks: unchecked first, then checked, then by type, then by name
        const sortedTasks = [...prev].sort((a, b) => {
          // First, sort by completion status (unchecked first, then checked)
          if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
          }
          // Then by type (peptides first)
          if (a.type === 'peptide' && b.type !== 'peptide') return -1
          if (a.type !== 'peptide' && b.type === 'peptide') return 1
          // Finally by name
          return a.name.localeCompare(b.name)
        });
        
        return sortedTasks;
      });
    }, 800); // 800ms delay - enough to see the check mark but not too long
  };

  // Listen for task completion changes from all views (including this one)
  useEffect(() => {
    const handleTaskCompletionChange = (event) => {
      const { taskId, completed, date, timeSlot, source } = event.detail;
      
      // If this is a cloud sync event, regenerate all tasks from scratch
      if (source === 'cloud-sync') {
        setCalendarBump(Date.now());
        return;
      }
      
      // Get today's date key for comparison
      const todayKey = toKey(new Date());
      
      // Update tasks in todaysTasks if they match
      setTodaysTasks(prev => prev.map(task => {
        const taskIdFromTask = task.stableTaskId || generateTaskId(task);
        // Match by taskId and ensure date/timeSlot match
        if (taskIdFromTask === taskId) {
          // If date matches today and timeSlot matches (or timeSlot not specified)
          if (date === todayKey && (!timeSlot || timeSlot === task.time)) {
            return { ...task, completed };
          }
        }
        return task;
      }));
      
      // Also trigger a full refresh to catch any other changes
      // This ensures tasks are regenerated with latest completion status
      // Use a small delay to let the immediate update above take effect first
      setTimeout(() => {
        setCalendarBump(Date.now());
      }, 100);
    };

    window.addEventListener('tpp:task-completion-changed', handleTaskCompletionChange);
    window.addEventListener('tpp:schedule-overrides-changed', () => setCalendarBump(Date.now()));
    return () => {
      window.removeEventListener('tpp:task-completion-changed', handleTaskCompletionChange);
      window.removeEventListener('tpp:schedule-overrides-changed', () => setCalendarBump(Date.now()));
    };
  }, []);

  const getTodayScheduleKey = useCallback(() => {
    const d = new Date();
    return toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  }, []);

  const handleSlotMove = useCallback((task, toSlot) => {
    if (isReadOnly) return;
    const fromSlot = task.time;
    if (!fromSlot || fromSlot === toSlot) return;
    const dateKey = getTodayScheduleKey();
    if (task.type === 'peptide') {
      setSlotMoveOverride(dateKey, {
        type: 'peptide',
        protocolId: task.protocolId,
        peptideId: task.peptideId,
        name: task.name,
        fromSlot,
        toSlot,
      });
    } else {
      setSlotMoveOverride(dateKey, {
        type: 'supplement',
        name: task.name,
        fromSlot,
        toSlot,
      });
    }
    migrateTaskCompletionSlot(dateKey, task, fromSlot, toSlot);
    setCalendarBump(Date.now());
  }, [isReadOnly, getTodayScheduleKey]);

  const handleResetSlotMove = useCallback((task) => {
    if (isReadOnly || !task.movedFromProtocolSlot) return;
    const original = task.movedFromProtocolSlot;
    const current = task.time;
    const dateKey = getTodayScheduleKey();
    if (task.type === 'peptide') {
      setSlotMoveOverride(dateKey, {
        type: 'peptide',
        protocolId: task.protocolId,
        peptideId: task.peptideId,
        name: task.name,
        fromSlot: original,
        toSlot: original,
      });
    } else {
      setSlotMoveOverride(dateKey, {
        type: 'supplement',
        name: task.name,
        fromSlot: original,
        toSlot: original,
      });
    }
    migrateTaskCompletionSlot(dateKey, task, current, original);
    setCalendarBump(Date.now());
  }, [isReadOnly, getTodayScheduleKey]);

  const handleSkipDose = useCallback((task) => {
    if (isReadOnly) return;
    const dateKey = getTodayScheduleKey();
    const slot = task.time;
    if (task.type === 'peptide') {
      setSkipOverride(dateKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, slot });
    } else {
      setSkipOverride(dateKey, { type: 'supplement', name: task.name, slot });
    }
    setCalendarBump(Date.now());
  }, [isReadOnly, getTodayScheduleKey]);

  const handleUndoSkip = useCallback((task) => {
    if (isReadOnly) return;
    const dateKey = getTodayScheduleKey();
    const slot = task.time;
    if (task.type === 'peptide') {
      clearSkipOverride(dateKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, slot });
    } else {
      clearSkipOverride(dateKey, { type: 'supplement', name: task.name, slot });
    }
    setCalendarBump(Date.now());
  }, [isReadOnly, getTodayScheduleKey]);

  const handleRescheduleToTomorrow = useCallback((task) => {
    if (isReadOnly) return;
    const todayKey = getTodayScheduleKey();
    const tomorrowDate = new Date();
    tomorrowDate.setDate(tomorrowDate.getDate() + 1);
    const tomorrowKey = `${tomorrowDate.getFullYear()}-${String(tomorrowDate.getMonth() + 1).padStart(2, '0')}-${String(tomorrowDate.getDate()).padStart(2, '0')}`;
    const slot = task.time;
    if (task.type === 'peptide') {
      setSkipOverride(todayKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, slot, reason: 'rescheduled', toDateKey: tomorrowKey, toSlot: slot });
      setExtraOverride(tomorrowKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, slot, dose: task.dose, unit: task.unit, deliveryMethod: task.deliveryMethod, penColor: task.penColor, penType: task.penType, fromDateKey: todayKey });
    } else {
      setSkipOverride(todayKey, { type: 'supplement', name: task.name, slot, reason: 'rescheduled', toDateKey: tomorrowKey, toSlot: slot });
      setExtraOverride(tomorrowKey, { type: 'supplement', name: task.name, slot, dose: task.dose, unit: task.unit, delivery: task.delivery || task.deliveryMethod, fromDateKey: todayKey });
    }
    setCalendarBump(Date.now());
  }, [isReadOnly, getTodayScheduleKey]);

  const handleRescheduleToDate = useCallback((task, fromDateKey, targetLabel) => {
    if (isReadOnly) return;
    const todayKey = getTodayScheduleKey();
    const sourceKey = fromDateKey || todayKey;
    let toDateKey;
    if (targetLabel === 'today') toDateKey = todayKey;
    else if (targetLabel === 'tomorrow') {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      toDateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    } else {
      toDateKey = targetLabel;
    }
    if (!toDateKey || toDateKey === sourceKey) return;
    const slot = task.time;
    if (task.type === 'peptide') {
      setSkipOverride(sourceKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, slot, reason: 'rescheduled', toDateKey, toSlot: slot });
      setExtraOverride(toDateKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, slot, dose: task.dose, unit: task.unit, deliveryMethod: task.deliveryMethod, penColor: task.penColor, penType: task.penType, fromDateKey: sourceKey });
    } else {
      setSkipOverride(sourceKey, { type: 'supplement', name: task.name, slot, reason: 'rescheduled', toDateKey, toSlot: slot });
      setExtraOverride(toDateKey, { type: 'supplement', name: task.name, slot, dose: task.dose, unit: task.unit, delivery: task.delivery || task.deliveryMethod, fromDateKey: sourceKey });
    }
    setCalendarBump(Date.now());
  }, [isReadOnly, getTodayScheduleKey]);

  const handleClearCatchUp = useCallback((task) => {
    if (isReadOnly) return;
    const dateKey = getTodayScheduleKey();
    const slot = task.time;
    clearExtraOverride(dateKey, {
      type: task.type === 'peptide' ? 'peptide' : 'supplement',
      protocolId: task.protocolId,
      peptideId: task.peptideId,
      name: task.name,
      slot,
      fromDateKey: task._fromDateKey,
      id: task._extraId,
    });
    setCalendarBump(Date.now());
  }, [isReadOnly, getTodayScheduleKey]);

  // Goal management
  const handleGoalToggle = (goalId) => {
    setGoals(prev => prev.map(g => 
      g.id === goalId ? prepareItemForSave({ ...g, completed: !g.completed }) : g
    ));
  };

  // Filter enabled widgets - use array order for drag-and-drop, not position sorting
  // Also filter out analytics widgets if analytics is disabled
  // And filter out group buy widgets if group buys are disabled
  const simpleMode = isSimpleMode(getLocalTrackingMode());

  const enabledWidgets = widgets.filter(w => {
    if (!w.enabled) return false;

    // Fully retired widget types — never render regardless of saved layout or mode
    const alwaysHidden = [
      WIDGET_TYPES.COMPLIANCE,   // Research Consistency
      WIDGET_TYPES.SPENDING,     // Spending
      WIDGET_TYPES.LEAD_TIME,    // Average Delivery
    ];
    if (alwaysHidden.includes(w.type)) return false;

    // In Simple mode, hide advanced widgets
    if (simpleMode) {
      const simpleHidden = [
        WIDGET_TYPES.ANALYTICS,
        WIDGET_TYPES.UPCOMING_ORDER,
      ];
      if (simpleHidden.includes(w.type)) return false;
    }

    // Advanced: Incoming Peptides only when there is an active order (or ≤3 days post-delivery)
    if (w.type === WIDGET_TYPES.UPCOMING_ORDER && incomingOrders.length === 0) {
      return false;
    }
    
    // Hide analytics-related widgets when analytics is disabled (Advanced mode)
    if (!analyticsEnabled && w.type === WIDGET_TYPES.ANALYTICS) {
      return false;
    }
    
    // Hide group buy widget when group buys are disabled
    if (!groupBuysEnabled && w.type === WIDGET_TYPES.UPCOMING_BUYS) {
      return false;
    }
    
    // Hide injection history widget when injection site tracking is disabled
    if (!injectionSiteTrackingEnabled && w.type === WIDGET_TYPES.INJECTION_HISTORY) {
      return false;
    }

    // protocols_card renders as a hardcoded card outside WidgetFactory — never go through the grid
    if (w.type === 'protocols_card') return false;
    
    return true;
  });

  // Sort enabled widgets by saved position (drag-reorder deferred for a later release)
  const enabledWidgetsForGrid = enabledWidgets.slice().sort((a, b) => {
    // Tips widget always goes last
    if (a.type === WIDGET_TYPES.TIPS) return 1;
    if (b.type === WIDGET_TYPES.TIPS) return -1;
    
    // Sort by position to maintain layout order after compaction
    const aY = a.position?.y || 0;
    const bY = b.position?.y || 0;
    if (aY !== bY) return aY - bY;
    const aX = a.position?.x || 0;
    const bX = b.position?.x || 0;
    return aX - bX;
  });

  // ── Home section: pin TASKS widget at top, hide from main grid ──────────
  const homeHiddenTypes = new Set([
    WIDGET_TYPES.TASKS,
    WIDGET_TYPES.METRICS,
    WIDGET_TYPES.NOTES,
    WIDGET_TYPES.QUICK_ACTIONS,
    WIDGET_TYPES.GOALS,
    WIDGET_TYPES.WISHLIST,
    WIDGET_TYPES.INVENTORY,
    WIDGET_TYPES.SPENDING,
    WIDGET_TYPES.SUPPLEMENTS,
    WIDGET_TYPES.BADGES,
    WIDGET_TYPES.LEAD_TIME,
    WIDGET_TYPES.UPCOMING_BUYS,
    WIDGET_TYPES.DONT_FORGET,
    WIDGET_TYPES.PENDING_VENDORS,
    WIDGET_TYPES.COMPLIANCE,
    WIDGET_TYPES.TIPS,
    WIDGET_TYPES.WATER_TRACKER,
    WIDGET_TYPES.HYDRATION,
  ]);
  const topTasksWidget = enabledWidgetsForGrid.find(w => w.type === WIDGET_TYPES.TASKS) || null;
  const mainGridWidgets = enabledWidgetsForGrid.filter(w => !homeHiddenTypes.has(w.type));

  return (
    <>
      {/* Tips Banner - Compact header tips for new users */}
      <DashboardTipsBanner theme={theme} />

      {/* ── Unified dashboard grid — all items same width ─────────────────── */}
      <div
        className="w-full max-w-full min-w-0 px-0 md:px-6 lg:px-8"
        style={{ paddingBottom: 'calc(3.5rem + 0.75rem)' }}
      >
        <div className="dashboard-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 sm:gap-5 auto-rows-min py-3" style={{ fontFamily: 'Poppins, sans-serif' }}>

          {/* Today's Research — pinned first, never remove */}
          {topTasksWidget && (
            <DashboardWidget
              key={`top-${topTasksWidget.id}`}
              widget={topTasksWidget}
              theme={theme}
              gridClassName="col-span-1 sm:col-span-2"
              style={{ minHeight: '260px', maxHeight: '420px' }}
            >
              <WidgetFactory
                widget={topTasksWidget}
                theme={theme}
                tasks={todaysTasks}
                incomingOrder={incomingOrder}
                incomingOrders={incomingOrders}
                upcomingBuys={scheduledBuys}
                pendingVendors={pendingVendors}
                vendors={vendors}
                stockpile={stockpile}
                goals={goals}
                metrics={metrics}
                supplements={supplements}
                isReadOnly={isReadOnly}
                onUpgrade={() => setShowUpgradeModal(true)}
                onTaskToggle={handleTaskToggle}
                onSlotMove={handleSlotMove}
                onResetSlotMove={handleResetSlotMove}
                onSkipDose={handleSkipDose}
                onUndoSkip={handleUndoSkip}
                onRescheduleToTomorrow={handleRescheduleToTomorrow}
                onRescheduleToDate={handleRescheduleToDate}
                onClearCatchUp={handleClearCatchUp}
                onOpenQuickStart={() => {
                  if (useGuidedCreate) setShowGuidedWalkthrough(true);
                  else setShowQuickStartProtocol(true);
                }}
                onOpenLogOneOff={() => setShowLogOneOffDose(true)}
                onOpenFullSetup={() => setShowNewProtocol(true)}
                onOpenStockpileAdd={() => setShowStockpileAdd(true)}
                onNewOrder={openBlankNewOrder}
                asNeededProtocols={asNeededProtocols}
                onLogAsNeeded={(protocol) => { setLogOneOffPrefill(protocol); setShowLogOneOffDose(true); }}
                onAddBuy={() => { setEditingScheduledBuy(null); setShowAddBuyModal(true); }}
                onOpenBuy={(buy) => { setEditingScheduledBuy({ ...buy, item: buy.item || buy.name || buy.peptideName }); setShowAddBuyModal(true); }}
                wishlist={wishlist}
                onAddWishlistItem={() => { setEditingWishlistItem(null); setShowAddWishlistModal(true); }}
                onEditWishlistItem={(item) => { setEditingWishlistItem(item); setShowAddWishlistModal(true); }}
                onWishlistAcquire={handleWishlistAcquire}
                protocols={protocols}
                onAddProtocolNote={() => window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'))}
                onViewAllVendors={() => navigate('/app/vendors')}
                onCompleteVendor={(vendor) => { setEditingVendor(vendor); setShowNewVendor(true); }}
                onGoalToggle={handleGoalToggle}
                onAddGoal={() => setShowGoal(true)}
                onAddMetric={openMetricAdd}
                onEditGoal={(goal) => { setEditingGoal(goal); setShowGoal(true); }}
                onEditMetric={openMetricEdit}
                onAddSupplement={() => setShowAddSupplement(true)}
                onEditSupplement={(supplement) => { setEditingSupplement(supplement); setShowAddSupplement(true); }}
                onDeleteSupplement={(id) => { if (deleteSupplement) deleteSupplement(id); }}
              />
            </DashboardWidget>
          )}

          {/* Active Protocols — Advanced mode only, pinned right after Today's Research */}
          {!simpleMode && (
            <DashboardWidget
              key="home-protocols"
              widget={widgets.find(w => w.id === 'protocols_card') || PROTOCOLS_CARD_WIDGET}
              theme={theme}
              gridClassName="col-span-1 sm:col-span-2"
            >
              <ActiveProtocolsHomeCard
                theme={theme}
                protocols={protocols}
                allSideEffects={allSideEffects}
                navigate={navigate}
                onSideEffect={setSideEffectProtocol}
                onNotes={setNotesProtocol}
              />
            </DashboardWidget>
          )}

          {/* Regular widgets (Analytics, Compliance, etc.) */}
          {mainGridWidgets.map((widget, index) => {
              // Desktop only: use the widget's configured size directly (no overrides)
              const effectiveSize = widget.size;
              const sizeConfig = getSizeConfig(effectiveSize);
              
              // Map grid width to CSS classes
              let gridClasses = '';
              switch (sizeConfig.w) {
                case 1:
                  gridClasses = 'col-span-1';
                  break;
                case 2:
                  gridClasses = 'col-span-2';
                  break;
                case 3:
                  gridClasses = 'col-span-3';
                  break;
                case 4:
                  gridClasses = 'col-span-4';
                  break;
                default:
                  gridClasses = 'col-span-2';
              }
              
              // Set consistent min and max height based on grid height
              let minHeight = '';
              let maxHeight = '';
              switch (sizeConfig.h) {
                case 1:
                  minHeight = '200px';
                  maxHeight = '280px';
                  break;
                case 2:
                  minHeight = '300px';
                  maxHeight = '400px';
                  break;
                case 3:
                  minHeight = '450px';
                  maxHeight = '600px';
                  break;
                default:
                  minHeight = '200px';
                  maxHeight = '280px';
              }
              if (widget.type === WIDGET_TYPES.ANALYTICS) {
                if (sizeConfig.h === 1) {
                  minHeight = '340px';
                  maxHeight = '460px';
                } else if (sizeConfig.h === 2) {
                  minHeight = '460px';
                  maxHeight = '600px';
                }
              }
              
              return (
                  <DashboardWidget
                    key={`${widget.id}-${widget.position?.x}-${widget.position?.y}-${widget.enabled}`}
                    widget={widget}
                    theme={theme}
                    gridClassName={gridClasses}
                    style={{ minHeight, maxHeight }}
                  >
                    <WidgetFactory
                      widget={widget}
                      theme={theme}
                      tasks={todaysTasks}
                      incomingOrder={incomingOrder}
                      incomingOrders={incomingOrders}
                      upcomingBuys={(() => {
                        // Additional safety filter: remove mock buys if sample data was cleared
                        const sampleDataCleared = localStorage.getItem('tpprover_sample_data_cleared') === 'true';
                        if (!sampleDataCleared) return scheduledBuys;
                        return scheduledBuys.filter(buy => {
                          if (buy.isMock) return false;
                          const mockVendors = ['BioTech Solutions', 'Peptide Research Co', 'Research Labs Pro'];
                          if (mockVendors.includes(buy.vendor)) return false;
                          if (buy.id === 201 || buy.id === 202 || buy.id === 203) return false;
                          const mockItems = ['Tirzepatide Bulk Order', 'BPC-157 Research Batch', 'Epithalon + Thymalin Stack'];
                          if (mockItems.includes(buy.item || buy.name)) return false;
                          return true;
                        });
                      })()}
                      pendingVendors={pendingVendors}
                      vendors={vendors}
                      stockpile={stockpile}
                      goals={goals}
                      metrics={metrics}
                      supplements={supplements}
                      isReadOnly={isReadOnly}
                      onUpgrade={() => setShowUpgradeModal(true)}
                      onTaskToggle={handleTaskToggle}
                      onOpenQuickStart={() => {
                  if (useGuidedCreate) setShowGuidedWalkthrough(true);
                  else setShowQuickStartProtocol(true);
                }}
                onOpenLogOneOff={() => setShowLogOneOffDose(true)}
                      onOpenFullSetup={() => setShowNewProtocol(true)}
                      onOpenStockpileAdd={() => setShowStockpileAdd(true)}
                      onNewOrder={openBlankNewOrder}
                      asNeededProtocols={asNeededProtocols}
                      onLogAsNeeded={(protocol) => { setLogOneOffPrefill(protocol); setShowLogOneOffDose(true); }}
                      onAddBuy={() => { setEditingScheduledBuy(null); setShowAddBuyModal(true); }}
                      onOpenBuy={(buy) => { setEditingScheduledBuy({ ...buy, item: buy.item || buy.name || buy.peptideName }); setShowAddBuyModal(true); }}
                      wishlist={wishlist}
                      onAddWishlistItem={() => { setEditingWishlistItem(null); setShowAddWishlistModal(true); }}
                      onEditWishlistItem={(item) => { setEditingWishlistItem(item); setShowAddWishlistModal(true); }}
                      onWishlistAcquire={handleWishlistAcquire}
                      protocols={protocols}
                      onAddProtocolNote={(protocolId) => {
                        // Refresh protocol notes if needed
                        window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
                      }}
                      onViewAllVendors={() => navigate('/app/vendors')}
                      onCompleteVendor={(vendor) => {
                        setEditingVendor(vendor);
                        setShowNewVendor(true);
                      }}
                      onGoalToggle={handleGoalToggle}
                      onAddGoal={() => setShowGoal(true)}
                      onAddMetric={openMetricAdd}
                      onEditGoal={(goal) => {
                        setEditingGoal(goal);
                        setShowGoal(true);
                      }}
                      onEditMetric={openMetricEdit}
                      onAddSupplement={() => setShowAddSupplement(true)}
                      onEditSupplement={(supplement) => {
                        setEditingSupplement(supplement);
                        setShowAddSupplement(true);
                      }}
                      onDeleteSupplement={(supplementId) => {
                        if (deleteSupplement) {
                          deleteSupplement(supplementId);
                        }
                      }}
                    />
                  </DashboardWidget>
              );
            })}
            
            {/* ConversionWidget temporarily removed - will be re-added with proper IAP support */}

            {/* ── Quick-action cards: Water + Weight — always side by side ─── */}
            <div className="col-span-1 sm:col-span-2 grid grid-cols-2 gap-3">

            {/* Water card */}
            <div
              className="col-span-1 rounded-2xl overflow-hidden relative cursor-pointer touch-manipulation"
              style={{ backgroundColor: theme.cardBackground, boxShadow: theme.isDark ? '0 2px 12px rgba(0,0,0,0.28)' : '0 2px 12px rgba(0,0,0,0.07)', minHeight: 110 }}
              onClick={() => navigate('/app/insights?tab=hydration')}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/app/insights?tab=hydration'); }}
            >
              <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none" style={{ zIndex: 0 }}>
                <div
                  className="absolute bottom-0 left-0 right-0 transition-[height] duration-700 ease-out"
                  style={{ height: `${Math.max(waterPct * 100, 4)}%` }}
                >
                  <div className="absolute inset-x-0 -top-3 h-6 overflow-hidden">
                    <svg viewBox="0 0 200 12" preserveAspectRatio="none" className="w-[200%] h-full animate-wave" style={{ opacity: 0.7 }}>
                      <path d="M0,6 C30,0 70,12 100,6 C130,0 170,12 200,6 L200,12 L0,12 Z" fill={WATER_CARD_BLUE} />
                    </svg>
                  </div>
                  <div className="absolute inset-0" style={{ backgroundColor: WATER_CARD_BLUE, opacity: 0.18 }} />
                </div>
              </div>
              <div className="relative z-10 p-3 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: theme.textLight }}>Water</span>
                    <Drop size={18} weight="duotone" color={WATER_CARD_BLUE} aria-hidden />
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {hydrationStreakN > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full" style={{ backgroundColor: theme.primary + '22', color: theme.primary }}>
                        <Flame size={13} weight="fill" />{hydrationStreakN}d
                      </span>
                    )}
                    <span className="text-base font-bold tabular-nums leading-tight" style={{ color: WATER_CARD_BLUE }}>
                      {todayWaterAmt}<span className="text-sm font-semibold" style={{ color: theme.textLight }}>/{todayWater.goal || hydrationPrefs.dailyGoal} {hydrationPrefs.unit}</span>
                    </span>
                  </div>
                </div>
                <div className="flex-1 flex items-center">
                  <div className="flex items-center gap-1.5 w-full">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); addWater(-hydrationPrefs.cupSize); }}
                      disabled={todayWaterAmt <= 0}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold touch-manipulation active:scale-90 transition-transform disabled:opacity-30"
                      style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)', color: theme.text }}
                    >−</button>
                    <span className="flex-1 text-center text-lg font-semibold" style={{ color: theme.textLight }}>+{hydrationPrefs.cupSize} {hydrationPrefs.unit}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); addWater(hydrationPrefs.cupSize); }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-base font-bold touch-manipulation active:scale-90 transition-transform"
                      style={{ backgroundColor: `${WATER_CARD_BLUE}28`, color: WATER_CARD_BLUE }}
                    >+</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Weight card — number entry + Save (no +/- nudging) */}
            {(() => {
              const unit = lastWeight?.unit || 'lbs';
              const lastValStr = lastWeight?.value != null && lastWeight.value !== ''
                ? String(lastWeight.value)
                : (lastWeight?.weight != null && lastWeight.weight !== '' ? String(lastWeight.weight) : '');
              const parsed = parseFloat(weightInput);
              const hasValidInput = weightInput !== '' && !Number.isNaN(parsed) && parsed > 0;
              const isDirty = hasValidInput && weightInput !== lastValStr;
              // Explicit greens/reds — theme.success is often coral/muted, not a clear "loss" green.
              const changeColor = !weightChange
                ? theme.textLight
                : weightChange.direction === 'down'
                  ? (theme.isDark ? '#34D399' : '#059669')
                  : weightChange.direction === 'up'
                    ? (theme.isDark ? '#F87171' : '#DC2626')
                    : theme.textLight;
              const ChangeIcon = weightChange?.direction === 'down'
                ? TrendDown
                : weightChange?.direction === 'up'
                  ? TrendUp
                  : null;
              const fmtDelta = (n) => {
                if (!Number.isFinite(n)) return '—';
                if (Math.abs(n) < 0.05) return '0';
                const rounded = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
                return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(rounded)}`;
              };
              const fmtPct = (n) => {
                if (!Number.isFinite(n)) return '—';
                if (Math.abs(n) < 0.05) return '0%';
                const rounded = Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
                return `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(rounded)}%`;
              };
              const saveWeightEntry = () => {
                const val = parseFloat(weightInput);
                if (!val || val <= 0) return;
                setMetrics((prev) =>
                  upsertMetricForDay(
                    prev || [],
                    {
                      type: 'weight',
                      label: 'Weight',
                      value: val,
                      weight: val,
                      unit,
                      date: getLocalDateString(),
                    },
                    { keepId: getMergedMetricForDay(prev || [], getLocalDateString())?.id || generateId() }
                  )
                );
                setWeightInput('');
                window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: `✓ ${val} ${unit} logged`, type: 'success' } }));
              };
              return (
                <div
                  className="col-span-1 rounded-2xl overflow-hidden relative cursor-pointer touch-manipulation"
                  style={{ backgroundColor: theme.cardBackground, boxShadow: theme.isDark ? '0 2px 12px rgba(0,0,0,0.28)' : '0 2px 12px rgba(0,0,0,0.07)', minHeight: 110 }}
                  onClick={() => navigate('/app/insights?tab=metrics')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    // Don't navigate when typing / saving in the weight field
                    if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'BUTTON') return;
                    if (e.key === 'Enter' || e.key === ' ') navigate('/app/insights?tab=metrics');
                  }}
                >
                  <div className="p-3 h-full flex flex-col">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold uppercase tracking-wide" style={{ color: theme.textLight }}>Weight</span>
                        <Scales size={18} weight="duotone" color={theme.primary} aria-hidden />
                      </div>
                      {lastWeight?.date && (
                        <span className="text-[10px]" style={{ color: theme.textLight }}>
                          {new Date(lastWeight.date.length === 10 ? lastWeight.date + 'T00:00:00' : lastWeight.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </div>
                    <div
                      className="rounded-xl px-2.5 py-2 flex items-center gap-1.5 border"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : `${theme.primary}10`,
                        borderColor: `${theme.primary}38`,
                        boxShadow: theme.isDark ? 'inset 0 1px 0 rgba(255,255,255,0.06)' : `inset 0 1px 2px ${theme.primary}14`,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="0"
                        aria-label="Weight entry"
                        placeholder={lastValStr || 'Log New'}
                        value={weightInput}
                        onChange={(e) => setWeightInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return;
                          e.preventDefault();
                          e.stopPropagation();
                          saveWeightEntry();
                        }}
                        className="min-w-0 flex-1 bg-transparent text-xl font-bold tabular-nums outline-none w-full"
                        style={{ color: theme.text }}
                      />
                      <span className="text-[11px] font-semibold flex-shrink-0 self-baseline" style={{ color: theme.primary, opacity: 0.85 }}>{unit}</span>
                      {isDirty && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            saveWeightEntry();
                          }}
                          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center touch-manipulation active:scale-90 transition-transform"
                          style={{ backgroundColor: theme.primary, color: '#fff' }}
                          aria-label="Save weight"
                          title="Save"
                        >
                          <Check size={16} weight="bold" aria-hidden />
                        </button>
                      )}
                    </div>

                    {/* Footer: % change + absolute change vs previous log */}
                    <div className="mt-2 flex items-center justify-between gap-2">
                      {weightChange ? (
                        <>
                          <span
                            className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums"
                            style={{ color: changeColor }}
                            aria-label={`${fmtPct(weightChange.pct)} since last weigh-in`}
                          >
                            {ChangeIcon && <ChangeIcon size={12} weight="bold" aria-hidden />}
                            {fmtPct(weightChange.pct)}
                          </span>
                          <span
                            className="inline-flex items-center text-[11px] font-semibold tabular-nums"
                            style={{ color: changeColor }}
                            aria-label={`${fmtDelta(weightChange.delta)} ${weightChange.unit} since last weigh-in`}
                          >
                            {fmtDelta(weightChange.delta)} {weightChange.unit}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] w-full text-center" style={{ color: theme.textLight, opacity: 0.75 }}>
                          Log again to track change
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            </div>{/* end water+weight row */}

            <div className="col-span-1 sm:col-span-2 w-full">
              <DashboardBioCheckIn
                theme={theme}
                metrics={metrics}
                onCommit={commitMetricsUpdate}
                isReadOnly={isReadOnly}
              />
            </div>

          </div>

        {enabledWidgets.length === 0 && (
          <div className="text-center py-12 px-3 sm:px-5 md:px-6 lg:px-8">
            <p className="text-lg mb-4" style={{ color: theme.textLight }}>
              No widgets enabled.
            </p>
          </div>
        )}
      </div>

      {/* Manage Widgets deferred for this release — keep modal wired but closed */}
      {false && (
      <DashboardCustomizer
        key={`manage-widgets-v${MANAGE_WIDGETS_VERSION}`}
        widgets={widgets}
        onUpdateWidgets={handleUpdateWidgets}
        theme={theme}
        isOpen={showCustomizer}
        onClose={() => setShowCustomizer(false)}
      />
      )}

      {/* Action Items Sheet — opened from Topbar ClipboardList icon */}
      <BottomSheet
        open={showActionItemsSheet}
        onClose={() => setShowActionItemsSheet(false)}
        title={
          <span className="flex items-center gap-2">
            To-Do
            <ListChecks size={26} weight="duotone" style={{ color: theme.primary }} />
          </span>
        }
        titleExtra={<ExpandableTooltip content={WIDGET_TOOLTIPS.dont_forget} theme={theme} />}
        theme={theme}
        fitContent
        maxHeight="85vh"
      >
        <DontForgetWidget
          widget={{ id: 'dont_forget', type: 'dont_forget' }}
          theme={theme}
          vendors={vendors}
          stockpile={stockpile}
          protocols={protocols}
          onCompleteVendor={(vendor) => { setShowActionItemsSheet(false); setEditingVendor(vendor); setShowNewVendor(true); }}
          onViewAllVendors={() => { setShowActionItemsSheet(false); navigate('/app/vendors'); }}
          onOpenFollowUp={(protocolId, historyId) => { setShowActionItemsSheet(false); setToDoFollowUp({ protocolId, historyId }); }}
          onEditStockpileItem={(item) => { setShowActionItemsSheet(false); setToDoStockpileItem(item); }}
          onClose={() => setShowActionItemsSheet(false)}
          isReadOnly={isReadOnly}
          onUpgrade={() => setShowUpgradeModal(true)}
          hideHeader
        />
      </BottomSheet>

      {/* To-Do: Follow-up assessment — opens inline without page navigation */}
      {toDoFollowUp && (() => {
        const protocol = (protocols || []).find(p => p.id === toDoFollowUp.protocolId);
        if (!protocol) return null;
        return (
          <ProtocolFollowUpModal
            open={!!toDoFollowUp}
            onClose={() => setToDoFollowUp(null)}
            protocol={protocol}
            historyEntryId={toDoFollowUp.historyId}
            theme={theme}
          />
        );
      })()}

      {/* To-Do: Complete incomplete stockpile entry — pre-filled edit form */}
      <AddToStockpileBottomSheet
        open={!!toDoStockpileItem}
        onClose={() => setToDoStockpileItem(null)}
        theme={theme}
        editItem={toDoStockpileItem}
        onUpgrade={() => setShowUpgradeModal(true)}
      />


      <ReconCalculatorModal
        open={showRecon}
        onClose={() => setShowRecon(false)}
        theme={theme}
        prefillData={reconPrefill}
      />

      <OCRImportModal 
        open={showImport} 
        onClose={() => setShowImport(false)} 
        theme={theme} 
        onImport={() => addToast('Import saved', 'success')} 
      />

      <VendorDetailsModal
        open={!!editingVendor || showNewVendor}
        onClose={() => { setEditingVendor(null); setShowNewVendor(false); }}
        theme={theme}
        vendor={editingVendor}
        isReadOnly={isReadOnly}
        onUpgrade={() => setShowUpgradeModal(true)}
        onSave={(v) => {
          // When user manually saves (completes profile), remove stub status
          // Use addVendor to ensure proper syncing with Orders page and vendor list
          const vendorId = v.id || editingVendor?.id || generateId();
          addVendor({ ...v, id: vendorId, isStub: false, needsCompletion: false });
          setEditingVendor(null);
          setShowNewVendor(false);
        }}
      />

      <AddToStockpileBottomSheet
        open={!!showStockpileAdd}
        onClose={() => {
          setShowStockpileAdd(false);
          setWishlistStockpilePrefill(null);
        }}
        theme={theme}
        wishlistPrefill={wishlistStockpilePrefill}
      />

      <OrderDetailsModal
        key={`new-order-${newOrderModalKey}`}
        open={!!showNewOrder}
        onClose={() => {
          setShowNewOrder(false);
          setNewOrderDraftFromWishlist(null);
        }}
        order={newOrderDraftFromWishlist}
        theme={theme}
        vendors={vendors}
        isReadOnly={isReadOnly}
        onUpgrade={() => setShowUpgradeModal(true)}
        onSave={(o) => {
          const category = o.category || 'domestic';
          setOrders(prev => {
            const normalizedPrev = ensurePublicOrderNumbers(prev);
            const nextNumber = getNextPublicOrderNumber(normalizedPrev);
            const newOrder = { 
              ...o, 
              id: o.id || generateId(), 
              category, 
              type: category,
              publicOrderNumber: nextNumber
            };
            return [newOrder, ...normalizedPrev];
          });
          if (o.vendor) {
            setVendors(prev => {
              const existing = prev.find(v => v.name === o.vendor);
              if (existing) return prev;
              return [...prev, { id: generateId(), name: o.vendor }];
            });
          }
          setShowNewOrder(false);
          setNewOrderDraftFromWishlist(null);
        }}
        onDelete={() => {
          setShowNewOrder(false);
          setNewOrderDraftFromWishlist(null);
        }}
      />

      <GoalModal
        open={showGoal}
        onClose={() => { setShowGoal(false); setEditingGoal(null); }}
        theme={theme}
        goal={editingGoal}
        onSave={(goal) => {
          if (editingGoal) {
            const updated = prepareItemForSave({ ...editingGoal, ...goal });
            setGoals(prev => prev.map(g => g.id === editingGoal.id ? updated : g));
          } else {
            const newGoal = prepareItemForSave(goal, { isNew: true });
            setGoals(prev => [...prev, newGoal]);
          }
          setShowGoal(false);
          setEditingGoal(null);
        }}
        onDelete={(form) => {
          if (!form?.id) return;
          const goalToDelete = goals.find(g => g.id === form.id);
          // CRITICAL: Record deletion tombstone BEFORE removing locally, otherwise the
          // next cloud merge sees a "missing" local item vs. an existing server item
          // and treats it as un-deleted, silently reviving it on sync/login.
          if (goalToDelete) {
            recordDeletion('goals', goalToDelete.id, goalToDelete);
          } else {
            recordDeletion('goals', form.id);
          }
          setGoals(prev => prev.filter(g => g.id !== form.id));
          setShowGoal(false);
          setEditingGoal(null);
        }}
      />

      <BodyMetricsModal
        open={showMetrics}
        onClose={() => { 
          setShowMetrics(false); 
          setEditingMetric(null);
          setShowBackButton(false);
          setOnBackToAllEntries(null);
        }}
        theme={theme}
        metric={editingMetric}
        showBackButton={showBackButton}
        onBack={onBackToAllEntries}
        onDelete={async (metricData) => {
          if (editingMetric?.id) {
            const metricToDelete = editingMetric;
            console.log('🗑️ Deleting metric:', metricToDelete.name || 'Unknown');
            
            // Record deletion with item snapshot for restore functionality
            const { recordDeletion } = require('../utils/deletionTracking');
            recordDeletion('metrics', editingMetric.id, metricToDelete);
            
            // Remove from local state
            const updatedMetrics = metrics.filter(m => m.id !== editingMetric.id);
            setMetrics(updatedMetrics);
            setShowMetrics(false);
            setEditingMetric(null);
            
            // CRITICAL: Force immediate cloud sync with skipMerge to ensure deletion persists
            if (firebaseUser) {
              try {
                const userId = firebaseUser.uid;
                const appData = {
                  protocols: protocols || [],
                  reconItems: reconItems || [],
                  reconHistory: reconHistory || [],
                  supplements: supplements || [],
                  orders: orders || [],
                  metrics: updatedMetrics, // Use updated metrics with deletion
                  vendors: vendors || [],
                  calendarNotes: calendarNotes || {},
                  stockpile: stockpile || [],
                  scheduledBuys: scheduledBuys || []
                };
                
                const syncResult = await saveAppData(userId, appData, { skipMerge: true });
                if (syncResult) {
                  console.log('✅ Deleted metric synced to cloud immediately');
                } else {
                  console.error('❌ Failed to sync deleted metric to cloud');
                }
              } catch (error) {
                console.error('❌ Error syncing deleted metric to cloud:', error);
              }
            }
            
            // If we have a back callback, use it to return to view all modal
            if (onBackToAllEntries) {
              setTimeout(() => {
                onBackToAllEntries();
              }, 100);
            }
            setShowBackButton(false);
            setOnBackToAllEntries(null);
          }
        }}
        onSave={async (metric) => {
          const now = new Date().toISOString();
          const keepId = editingMetric?.id || metric?.id || generateId();
          const payload = { ...metric, id: keepId };
          delete payload._dayEntryIds;
          const updatedMetrics = upsertMetricForDay(metrics, payload, { keepId, now });
          const dateKey = metricDateKey(payload) || payload.date;
          if (dateKey) {
            const keptIds = new Set(updatedMetrics.filter((m) => metricDateKey(m) === dateKey).map((m) => m.id));
            (metrics || []).forEach((m) => {
              if (metricDateKey(m) === dateKey && m.id && !keptIds.has(m.id)) {
                recordDeletion('metrics', m.id, m);
              }
            });
          }

          setMetrics(updatedMetrics);
          setShowMetrics(false);
          setEditingMetric(null);
          setShowBackButton(false);
          setOnBackToAllEntries(null);
          
          // CRITICAL: Sync to Firebase to persist changes
          if (firebaseUser) {
            try {
              const userId = firebaseUser.uid;
              const appData = {
                protocols: protocols || [],
                reconItems: reconItems || [],
                reconHistory: reconHistory || [],
                supplements: supplements || [],
                orders: orders || [],
                metrics: updatedMetrics,
                vendors: vendors || [],
                calendarNotes: calendarNotes || {},
                stockpile: stockpile || [],
                scheduledBuys: scheduledBuys || []
              };
              
              const syncResult = await saveAppData(userId, appData, { skipMerge: true });
              if (syncResult) {
                console.log('✅ Saved metric synced to cloud immediately');
              } else {
                console.error('❌ Failed to sync saved metric to cloud');
              }
            } catch (error) {
              console.error('❌ Error syncing saved metric to cloud:', error);
            }
          }
          
          // If we have a back callback, use it to return to view all modal
          if (onBackToAllEntries) {
            setTimeout(() => {
              onBackToAllEntries();
            }, 100);
          }
        }}
      />

      <AddScheduledBuyModal
        open={showAddBuyModal}
        onClose={() => { setShowAddBuyModal(false); setEditingScheduledBuy(null); }}
        theme={theme}
        buy={editingScheduledBuy}
        onSave={(buy) => {
          const isEdit = buy.id && true;
          const newBuy = prepareItemForSave({
            ...buy,
            name: buy.item || buy.name,
            peptideName: buy.item || buy.peptideName,
          }, { isNew: !isEdit });
          
          setScheduledBuys(prev => {
            const exists = buy.id && prev.some(b => b.id === buy.id);
            let updated;
            if (exists) {
              updated = prev.map(b => b.id === buy.id ? prepareItemForSave({ ...b, ...newBuy }) : b);
            } else {
              updated = [...prev, newBuy];
            }
            
            // Save to localStorage immediately
            try {
              localStorage.setItem('tpprover_scheduled_buys', JSON.stringify(updated));
              // Also set the protection timestamp
              localStorage.setItem('tpprover_scheduledBuys_lastUpdate', String(Date.now()));
            } catch (e) {
              console.error('Failed to save scheduled buys to localStorage:', e);
            }
            
            // Dispatch event to trigger cloud sync protection
            window.dispatchEvent(new CustomEvent('tpp:scheduled-buys-updated', {
              detail: { scheduledBuys: updated }
            }));
            
            return updated;
          });
          
          setShowAddBuyModal(false);
          addToast(buy.id ? 'Scheduled buy updated' : 'Scheduled buy added', 'success');
        }}
        onDelete={(buyId) => {
          // Record deletion in persistent tracking to prevent restoration
          recordDeletion('scheduledBuys', String(buyId));
          
          // Delete the scheduled buy
          setScheduledBuys(prev => {
            const updated = prev.filter(b => b.id !== buyId);
            
            // Save to localStorage immediately
            try {
              localStorage.setItem('tpprover_scheduled_buys', JSON.stringify(updated));
              // Set the protection timestamp
              localStorage.setItem('tpprover_scheduledBuys_lastUpdate', String(Date.now()));
            } catch (e) {
              console.error('Failed to save scheduled buys to localStorage:', e);
            }
            
            // Dispatch event to trigger cloud sync protection
            window.dispatchEvent(new CustomEvent('tpp:scheduled-buys-updated', {
              detail: { scheduledBuys: updated }
            }));
            
            return updated;
          });
          
          setShowAddBuyModal(false);
          addToast('Scheduled buy deleted', 'success');
        }}
      />

      <AddWishlistItemModal
        open={showAddWishlistModal}
        onClose={() => { setShowAddWishlistModal(false); setEditingWishlistItem(null); }}
        theme={theme}
        item={editingWishlistItem ?? null}
        onSave={(item) => {
          if (isReadOnly) {
            setShowUpgradeModal(true);
            return;
          }
          
          const newItem = prepareItemForSave(
            { ...item, createdAt: item.createdAt || new Date().toISOString() },
            { isNew: !item.id }
          );
          
          setWishlist(prev => {
            const isEdit = item.id && prev.some(i => i.id === item.id);
            let updated;
            if (isEdit) {
              updated = prev.map(i => i.id === item.id ? prepareItemForSave({ ...i, ...newItem }) : i);
            } else {
              updated = [...prev, newItem];
            }
            
            // Save to localStorage immediately
            try {
              localStorage.setItem('tpprover_wishlist', JSON.stringify(updated));
              localStorage.setItem('tpprover_wishlist_lastUpdate', String(Date.now()));
            } catch (e) {
              console.error('Failed to save wishlist to localStorage:', e);
            }
            
            // Dispatch event to trigger updates
            window.dispatchEvent(new CustomEvent('tpp:wishlist-updated', {
              detail: { wishlist: updated }
            }));
            
            return updated;
          });
          
          setShowAddWishlistModal(false);
          setEditingWishlistItem(null);
          window.dispatchEvent(new CustomEvent('tpp:toast', { 
            detail: { message: item.id ? 'Wishlist item updated' : 'Item added to wishlist', type: 'success' } 
          }));
        }}
        onDelete={(item) => {
          if (isReadOnly) {
            setShowUpgradeModal(true);
            return;
          }
          if (!item?.id) return;
          setWishlist((prev) => {
            const updated = prev.filter((i) => String(i.id) !== String(item.id));
            try {
              localStorage.setItem('tpprover_wishlist', JSON.stringify(updated));
              localStorage.setItem('tpprover_wishlist_lastUpdate', String(Date.now()));
            } catch (e) {
              console.error('Failed to save wishlist to localStorage:', e);
            }
            window.dispatchEvent(new CustomEvent('tpp:wishlist-updated', {
              detail: { wishlist: updated }
            }));
            return updated;
          });
          recordDeletion('wishlist', String(item.id), item);
          setShowAddWishlistModal(false);
          setEditingWishlistItem(null);
          window.dispatchEvent(new CustomEvent('tpp:toast', {
            detail: { message: 'Wishlist item deleted', type: 'success' }
          }));
        }}
      />

      <SupplementEditorModal
        open={showAddSupplement}
        onClose={() => { setShowAddSupplement(false); setEditingSupplement(null); }}
        theme={theme}
        supplement={editingSupplement}
        onSave={async (supplement) => {
          // Handle delete case directly
          if (supplement._delete && supplement.id) {
            await deleteSupplement(supplement.id);
            setShowAddSupplement(false);
            setEditingSupplement(null);
            addToast('Supplement deleted', 'success');
            return;
          }
          
          // Handle save/update
          if (editingSupplement) {
            await updateSupplement(supplement);
            addToast('Supplement saved', 'success');
          } else {
            addSupplement(supplement);
            addToast('Supplement added', 'success');
          }
          setShowAddSupplement(false);
          setEditingSupplement(null);
        }}
      />

      <LogOneOffDoseModal
        open={showLogOneOffDose}
        onClose={() => { setShowLogOneOffDose(false); setLogOneOffPrefill(null); }}
        theme={theme}
        defaultDateKey={getLocalDateString()}
        prefilledProtocol={logOneOffPrefill}
      />

      <QuickStartProtocolModal
        open={showQuickStartProtocol}
        onClose={() => setShowQuickStartProtocol(false)}
        theme={theme}
        onSave={async (protocolData) => {
          const finalProtocol = prepareItemForSave({ ...protocolData }, { isNew: true });
          addProtocol(finalProtocol);
          const now = new Date();
          const historyEntry = {
            id: generateId(),
            protocolId: finalProtocol.id,
            startDate: finalProtocol.startDate,
            endDate: null,
            status: 'active',
            notes: [],
            createdAt: now,
            protocolData: {
              protocolName: finalProtocol.protocolName,
              peptides: finalProtocol.peptides || [],
              linkedItems: finalProtocol.linkedItems || {}
            }
          };
          saveProtocolHistoryEntry(historyEntry);
          window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: `${finalProtocol.protocolName} started successfully!`, type: 'success' } }));
          setShowQuickStartProtocol(false);
        }}
      />

      <GuidedProtocolWalkthrough
        open={showGuidedWalkthrough}
        onClose={() => setShowGuidedWalkthrough(false)}
        presentation="sheet"
        theme={theme}
        onSave={async (protocolData) => {
          const finalProtocol = prepareItemForSave({ ...protocolData }, { isNew: true });
          addProtocol(finalProtocol);
          saveProtocolHistoryEntry({
            id: generateId(),
            protocolId: finalProtocol.id,
            startDate: finalProtocol.startDate,
            endDate: null,
            status: 'active',
            notes: [],
            createdAt: new Date(),
            protocolData: {
              protocolName: finalProtocol.protocolName,
              peptides: finalProtocol.peptides || [],
              linkedItems: finalProtocol.linkedItems || {},
            },
          });
          window.dispatchEvent(new CustomEvent('tpp:toast', {
            detail: { message: `${finalProtocol.protocolName} started successfully!`, type: 'success' },
          }));
          setShowGuidedWalkthrough(false);
        }}
      />

      <ProtocolEditorModal
        open={showNewProtocol}
        onClose={() => setShowNewProtocol(false)}
        theme={theme}
        isReadOnly={isReadOnly}
        onUpgrade={() => setShowUpgradeModal(true)}
        onSave={(protocol) => {
          const cleaned = prepareItemForSave({ id: generateId(), ...protocol, active: false, startDate: protocol.startDate || '' }, { isNew: true });
          addProtocol(cleaned);
          setShowNewProtocol(false);
          window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Protocol created', type: 'success' } }));
        }}
      />

      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        theme={theme}

      />

      {/* Toast notifications now handled globally in App.jsx */}

      {/* ── FAB Speed Dial (mobile / tablet only — desktop uses widgets + top bar) ─ */}

      {/* Side Effects Quick Sheet */}
      <SideEffectsQuickSheet
        open={!!sideEffectProtocol}
        onClose={() => setSideEffectProtocol(null)}
        theme={theme}
        protocol={sideEffectProtocol?.id ? sideEffectProtocol : null}
        protocols={activeProtocols}
      />

      {/* Protocol Notes Sheet */}
      <ProtocolNotesSheet
        open={!!notesProtocol}
        onClose={() => setNotesProtocol(null)}
        theme={theme}
        protocol={notesProtocol?.id ? notesProtocol : null}
        protocols={activeProtocols}
      />
    </>
  );
}
