import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Menu, Upload, FileText, Plus, X, Smartphone, FlaskConical } from 'lucide-react';
import { GearSix, Notepad } from '@phosphor-icons/react';
import { motion } from 'framer-motion';
import { useFirebase } from '../../context/FirebaseContext';
import { useLocation, useNavigate } from 'react-router-dom';
import GlossaryQuickModal from '../glossary/GlossaryQuickModal';
import { useAppContext } from '../../context/AppContext.jsx';
import { useAnnouncementsUnseen } from '../../hooks/useAnnouncementsUnseen';
import { Capacitor } from '@capacitor/core';
import { getActionItemCount } from '../../utils/actionItems';
import { useIsSimpleMode } from '../../hooks/useIsSimpleMode';
import { DEV_TEST_UID, getDevOverride, setDevOverride, DEV_STATES, DEV_STATE_META } from '../../utils/devSubscriptionOverride';
import { DEV_UI_PAGES, DEV_VERIFY_EMAIL_PREVIEWS } from '../../utils/devUiPreview';
import SyncStatusIndicator from '../ui/SyncStatusIndicator';
import { NATIVE_STORE_UPDATE_PROMPT_ENABLED } from '../../utils/versionChecker';
import { FEATURE_ANNOUNCEMENT_AUTO_SHOW_ENABLED } from '../common/FeatureAnnouncementModal';
import useBlockingOverlayClear from '../../hooks/useBlockingOverlayClear';
import useSpotlightTransition from '../../hooks/useSpotlightTransition';

/** Matches GlobalFAB / bottom-sheet spring feel */
const TAB_INDICATOR_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 };
/** Same accent as GlobalFAB (`FAB_COLOR`) */
const TAB_INDICATOR_COLOR = '#3a5550';

/** One-time eye-catcher on Vendors → Communities + Discover tabs */
const COMMUNITIES_SPOTLIGHT_KEY = 'tpp_communities_discover_spotlight_done_v1';
/** One-time eye-catcher on Settings gear — Simple & Advanced Mode */
const SETTINGS_MODE_SPOTLIGHT_KEY = 'tpp_settings_mode_spotlight_done_v1';
/** One-time eye-catcher on Supplements → Medication tab */
const MEDICATION_TAB_SPOTLIGHT_KEY = 'tpp_medication_tab_spotlight_done_v1';
/** One-time eye-catcher on Inventory → Supplies tab */
const SUPPLIES_TAB_SPOTLIGHT_KEY = 'tpp_supplies_tab_spotlight_done_v1';

function isCommunitiesSpotlightDone() {
  try {
    return localStorage.getItem(COMMUNITIES_SPOTLIGHT_KEY) === '1';
  } catch {
    return true;
  }
}

function markCommunitiesSpotlightDone() {
  try {
    localStorage.setItem(COMMUNITIES_SPOTLIGHT_KEY, '1');
  } catch {
    /* ignore */
  }
}

function isSettingsModeSpotlightDone() {
  try {
    return localStorage.getItem(SETTINGS_MODE_SPOTLIGHT_KEY) === '1';
  } catch {
    return true;
  }
}

function markSettingsModeSpotlightDone() {
  try {
    localStorage.setItem(SETTINGS_MODE_SPOTLIGHT_KEY, '1');
  } catch {
    /* ignore */
  }
}

function isMedicationTabSpotlightDone() {
  try {
    return localStorage.getItem(MEDICATION_TAB_SPOTLIGHT_KEY) === '1';
  } catch {
    return true;
  }
}

function markMedicationTabSpotlightDone() {
  try {
    localStorage.setItem(MEDICATION_TAB_SPOTLIGHT_KEY, '1');
  } catch {
    /* ignore */
  }
}

function isSuppliesTabSpotlightDone() {
  try {
    return localStorage.getItem(SUPPLIES_TAB_SPOTLIGHT_KEY) === '1';
  } catch {
    return true;
  }
}

function markSuppliesTabSpotlightDone() {
  try {
    localStorage.setItem(SUPPLIES_TAB_SPOTLIGHT_KEY, '1');
  } catch {
    /* ignore */
  }
}

function pickVisibleEl(...els) {
  for (const el of els) {
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function DevLiveDot({ live, title }) {
  return (
    <span
      className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
      title={title || (live ? 'Live in production' : 'Disabled in production')}
      style={{
        backgroundColor: live ? '#22c55e' : '#ef4444',
        boxShadow: live
          ? '0 0 0 2px rgba(34,197,94,0.25)'
          : '0 0 0 2px rgba(239,68,68,0.25)',
      }}
      aria-label={live ? 'Live' : 'Disabled'}
    />
  );
}
export default function Topbar({ onMenuClick, theme, tabs, activeTab, onTabChange, onActionClick, actionItems, actionDisabled, autoSaveIndicator }) {
  const location = useLocation();
  const navigate = useNavigate();
  // Handle both /page and /app/page routing patterns
  const pathParts = location.pathname.split('/').filter(Boolean);
  const seg = pathParts[0] === 'app' ? (pathParts[1] || 'dashboard') : (pathParts[0] || 'dashboard');
  const onDashboard = seg === 'dashboard' || location.pathname === '/app' || location.pathname === '/app/' || location.pathname.includes('/dashboard');

  const { user, vendors = [], stockpile = [], protocols = [] } = useAppContext();
  const { firebaseUser } = useFirebase();
  const { unseenCount: unseenAnnouncementCount } = useAnnouncementsUnseen();
  const simpleMode = useIsSimpleMode();
  const overlaysClear = useBlockingOverlayClear();
  const [dismissedTick, setDismissedTick] = useState(0);
  useEffect(() => {
    const bump = () => setDismissedTick((n) => n + 1);
    window.addEventListener('tpp:action-items-dismissed-changed', bump);
    return () => window.removeEventListener('tpp:action-items-dismissed-changed', bump);
  }, []);
  const computedActionItemCount = useMemo(
    () => getActionItemCount({ vendors, stockpile, protocols, simpleMode }),
    [vendors, stockpile, protocols, simpleMode, dismissedTick]
  );


  // Expanding action menu (multi-item add button)
  const [showActionMenu, setShowActionMenu] = useState(false);
  const desktopActionMenuRef = React.useRef(null);
  const mobileActionMenuRef = React.useRef(null);
  const isInsideActionMenu = (target) => {
    if (!target) return false;
    return (
      desktopActionMenuRef.current?.contains(target) ||
      mobileActionMenuRef.current?.contains(target)
    );
  };

  // Dev-only: preview store / "what's new" / re-consent / page intro modals
  const [showDevUpdateMenu, setShowDevUpdateMenu] = useState(false);
  const devUpdateMenuRef = React.useRef(null);
  const showDevUpdatePreview =
    import.meta.env.DEV &&
    location.pathname.startsWith('/app') &&
    firebaseUser?.uid === DEV_TEST_UID;

  // Dev-only: subscription state switcher (replaces the floating DevToolbar)
  const [showDevSubMenu, setShowDevSubMenu] = useState(false);
  const devSubMenuRef = React.useRef(null);
  const [devSubCurrent, setDevSubCurrent] = useState(() => getDevOverride(firebaseUser?.uid));
  const showDevSubPicker =
    import.meta.env.DEV &&
    location.pathname.startsWith('/app') &&
    firebaseUser?.uid === DEV_TEST_UID;
  useEffect(() => {
    if (!showActionMenu) return;
    const handle = (e) => {
      if (!isInsideActionMenu(e.target)) {
        setShowActionMenu(false);
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [showActionMenu]);

  useEffect(() => {
    if (!showDevUpdateMenu) return;
    const handle = (e) => {
      if (devUpdateMenuRef.current && !devUpdateMenuRef.current.contains(e.target)) {
        setShowDevUpdateMenu(false);
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [showDevUpdateMenu]);

  useEffect(() => {
    if (!showDevSubMenu) return;
    const handle = (e) => {
      if (devSubMenuRef.current && !devSubMenuRef.current.contains(e.target)) {
        setShowDevSubMenu(false);
      }
    };
    document.addEventListener('mousedown', handle);
    document.addEventListener('touchstart', handle);
    return () => {
      document.removeEventListener('mousedown', handle);
      document.removeEventListener('touchstart', handle);
    };
  }, [showDevSubMenu]);

  // Keep sub picker in sync when override changes from elsewhere
  useEffect(() => {
    const uid = firebaseUser?.uid;
    const sync = () => setDevSubCurrent(getDevOverride(uid));
    window.addEventListener('tpp:dev-override-changed', sync);
    return () => window.removeEventListener('tpp:dev-override-changed', sync);
  }, [firebaseUser?.uid]);

  // Close menu when tabs/page changes
  useEffect(() => { setShowActionMenu(false); }, [activeTab, tabs]);
  useEffect(() => { setShowDevUpdateMenu(false); setShowDevSubMenu(false); }, [location.pathname, activeTab, tabs]);

  // Action items badge count
  const [actionItemCount, setActionItemCount] = useState(0);
  useEffect(() => {
    setActionItemCount(computedActionItemCount);
  }, [computedActionItemCount]);

  useEffect(() => {
    const handler = (e) => {
      const n = e.detail?.count;
      if (typeof n === 'number') setActionItemCount(n);
    };
    window.addEventListener('tpp:action-item-count', handler);
    return () => window.removeEventListener('tpp:action-item-count', handler);
  }, []);

  const ANNOUNCEMENTS_INTRO_KEY = 'tpp_announcements_icon_onboarding_done_v1';
  const [showAnnouncementsIntro, setShowAnnouncementsIntro] = useState(false);
  const [announcementsBuzz, setAnnouncementsBuzz] = useState(false);

  const markAnnouncementsIntroDone = () => {
    try {
      localStorage.setItem(ANNOUNCEMENTS_INTRO_KEY, '1');
    } catch {
      /* ignore */
    }
    setShowAnnouncementsIntro(false);
    setAnnouncementsBuzz(false);
  };

  // One-time nudge: toast + short buzz on the newspaper icon (first app use after this shipped).
  useEffect(() => {
    if (!firebaseUser) return undefined;
    let tShow;
    let tBuzz;
    let tToast;
    try {
      if (localStorage.getItem(ANNOUNCEMENTS_INTRO_KEY)) return undefined;
    } catch {
      return undefined;
    }
    tShow = setTimeout(() => {
      setShowAnnouncementsIntro(true);
      setAnnouncementsBuzz(true);
      tBuzz = setTimeout(() => setAnnouncementsBuzz(false), 2200);
      tToast = setTimeout(() => {
        setShowAnnouncementsIntro(false);
        try {
          localStorage.setItem(ANNOUNCEMENTS_INTRO_KEY, '1');
        } catch {
          /* ignore */
        }
      }, 8000);
    }, 1200);
    return () => {
      clearTimeout(tShow);
      clearTimeout(tBuzz);
      clearTimeout(tToast);
    };
  }, [firebaseUser]);

  // Dismiss intro when the sheet opens from anywhere (Topbar or deep link).
  useEffect(() => {
    const onOpen = () => markAnnouncementsIntroDone();
    window.addEventListener('tpp:open-announcements', onOpen);
    return () => window.removeEventListener('tpp:open-announcements', onOpen);
  }, []);

  // One-time Communities + Discover tab spotlight (Vendors | Communities | Discover)
  const hasSpotlightTabs = useMemo(() => {
    if (!Array.isArray(tabs)) return false;
    const values = new Set(tabs.map((t) => t?.value));
    return values.has('community') && values.has('index');
  }, [tabs]);
  const [showCommunitiesSpotlight, setShowCommunitiesSpotlight] = useState(false);
  const [communitiesSpotlightAnchor, setCommunitiesSpotlightAnchor] = useState(null);
  const communityTabMobileRef = useRef(null);
  const communityTabDesktopRef = useRef(null);
  const discoverTabMobileRef = useRef(null);
  const discoverTabDesktopRef = useRef(null);
  const communitiesTipRef = useRef(null);

  const dismissCommunitiesSpotlight = useCallback(() => {
    markCommunitiesSpotlightDone();
    setShowCommunitiesSpotlight(false);
  }, []);

  const getVisibleSpotlightTabs = useCallback(() => {
    const community = pickVisibleEl(communityTabMobileRef.current, communityTabDesktopRef.current);
    const discover = pickVisibleEl(discoverTabMobileRef.current, discoverTabDesktopRef.current);
    return { community, discover };
  }, []);

  const communitiesTx = useSpotlightTransition(showCommunitiesSpotlight);
  const latchedCommunitiesAnchor = useRef(null);
  if (communitiesSpotlightAnchor) latchedCommunitiesAnchor.current = communitiesSpotlightAnchor;
  const communitiesPortalAnchor =
    communitiesSpotlightAnchor || (communitiesTx.mounted ? latchedCommunitiesAnchor.current : null);

  useEffect(() => {
    if (!communitiesTx.mounted) setCommunitiesSpotlightAnchor(null);
  }, [communitiesTx.mounted]);

  useEffect(() => {
    if (!overlaysClear || !hasSpotlightTabs || !firebaseUser) return undefined;
    if (isCommunitiesSpotlightDone()) return undefined;
    const t = setTimeout(() => setShowCommunitiesSpotlight(true), 900);
    return () => clearTimeout(t);
  }, [hasSpotlightTabs, firebaseUser, overlaysClear]);

  useEffect(() => {
    if (!hasSpotlightTabs) setShowCommunitiesSpotlight(false);
  }, [hasSpotlightTabs]);

  useEffect(() => {
    if (!overlaysClear && showCommunitiesSpotlight) {
      setShowCommunitiesSpotlight(false);
    }
  }, [overlaysClear, showCommunitiesSpotlight]);

  useEffect(() => {
    const onPreview = () => {
      try {
        localStorage.removeItem(COMMUNITIES_SPOTLIGHT_KEY);
      } catch {
        /* ignore */
      }
      if (hasSpotlightTabs) setShowCommunitiesSpotlight(true);
    };
    window.addEventListener('tpp:dev-preview-communities-spotlight', onPreview);
    return () => window.removeEventListener('tpp:dev-preview-communities-spotlight', onPreview);
  }, [hasSpotlightTabs]);

  useEffect(() => {
    if (!showCommunitiesSpotlight) {
      return undefined;
    }
    const measure = () => {
      const { community, discover } = getVisibleSpotlightTabs();
      if (!community && !discover) {
        setCommunitiesSpotlightAnchor(null);
        return;
      }
      const rects = [community, discover].filter(Boolean).map((el) => el.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      setCommunitiesSpotlightAnchor({
        top,
        bottom,
        left,
        right,
        width: right - left,
        height: bottom - top,
      });
    };
    measure();
    const t = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [showCommunitiesSpotlight, tabs, getVisibleSpotlightTabs]);

  useEffect(() => {
    if (!showCommunitiesSpotlight) return undefined;
    const onPointerDown = (e) => {
      const tip = communitiesTipRef.current;
      const { community, discover } = getVisibleSpotlightTabs();
      const target = e.target;
      if (tip && tip.contains(target)) return;
      if (community && (community === target || community.contains(target))) return;
      if (discover && (discover === target || discover.contains(target))) return;
      dismissCommunitiesSpotlight();
    };
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 50);
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [showCommunitiesSpotlight, dismissCommunitiesSpotlight, getVisibleSpotlightTabs]);

  // One-time Settings gear spotlight — Simple & Advanced Mode (first app open)
  const [showSettingsModeSpotlight, setShowSettingsModeSpotlight] = useState(false);
  const [settingsModeSpotlightAnchor, setSettingsModeSpotlightAnchor] = useState(null);
  const settingsBtnRef = useRef(null);
  const settingsModeTipRef = useRef(null);

  const dismissSettingsModeSpotlight = useCallback(() => {
    markSettingsModeSpotlightDone();
    setShowSettingsModeSpotlight(false);
  }, []);

  const settingsModeTx = useSpotlightTransition(showSettingsModeSpotlight);
  const latchedSettingsModeAnchor = useRef(null);
  if (settingsModeSpotlightAnchor) latchedSettingsModeAnchor.current = settingsModeSpotlightAnchor;
  const settingsModePortalAnchor =
    settingsModeSpotlightAnchor || (settingsModeTx.mounted ? latchedSettingsModeAnchor.current : null);

  useEffect(() => {
    if (!settingsModeTx.mounted) setSettingsModeSpotlightAnchor(null);
  }, [settingsModeTx.mounted]);

  useEffect(() => {
    if (!overlaysClear || !firebaseUser) return undefined;
    if (isSettingsModeSpotlightDone()) return undefined;
    const t = setTimeout(() => setShowSettingsModeSpotlight(true), 1400);
    return () => clearTimeout(t);
  }, [firebaseUser, overlaysClear]);

  useEffect(() => {
    if (!overlaysClear && showSettingsModeSpotlight) {
      setShowSettingsModeSpotlight(false);
    }
  }, [overlaysClear, showSettingsModeSpotlight]);

  useEffect(() => {
    const onPreview = () => {
      try {
        localStorage.removeItem(SETTINGS_MODE_SPOTLIGHT_KEY);
      } catch {
        /* ignore */
      }
      setShowSettingsModeSpotlight(true);
    };
    window.addEventListener('tpp:dev-preview-settings-mode-spotlight', onPreview);
    return () => window.removeEventListener('tpp:dev-preview-settings-mode-spotlight', onPreview);
  }, []);

  useEffect(() => {
    if (!showSettingsModeSpotlight) {
      return undefined;
    }
    const measure = () => {
      const btn = settingsBtnRef.current;
      if (!btn) {
        setSettingsModeSpotlightAnchor(null);
        return;
      }
      const r = btn.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        setSettingsModeSpotlightAnchor(null);
        return;
      }
      setSettingsModeSpotlightAnchor({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      });
    };
    measure();
    const t = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [showSettingsModeSpotlight]);

  useEffect(() => {
    if (!showSettingsModeSpotlight) return undefined;
    const onPointerDown = (e) => {
      const tip = settingsModeTipRef.current;
      const btn = settingsBtnRef.current;
      const target = e.target;
      if (tip && tip.contains(target)) return;
      if (btn && (btn === target || btn.contains(target))) return;
      dismissSettingsModeSpotlight();
    };
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 50);
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [showSettingsModeSpotlight, dismissSettingsModeSpotlight]);

  // One-time Medication tab spotlight (Supplements | Medication)
  const hasMedicationTab = useMemo(() => {
    if (!Array.isArray(tabs)) return false;
    return tabs.some((t) => t?.value === 'meds');
  }, [tabs]);
  const [showMedicationTabSpotlight, setShowMedicationTabSpotlight] = useState(false);
  const [medicationTabSpotlightAnchor, setMedicationTabSpotlightAnchor] = useState(null);
  const medicationTabMobileRef = useRef(null);
  const medicationTabDesktopRef = useRef(null);
  const medicationTabTipRef = useRef(null);

  const dismissMedicationTabSpotlight = useCallback(() => {
    markMedicationTabSpotlightDone();
    setShowMedicationTabSpotlight(false);
  }, []);

  const getVisibleMedicationTab = useCallback(
    () => pickVisibleEl(medicationTabMobileRef.current, medicationTabDesktopRef.current),
    []
  );

  const medicationTabTx = useSpotlightTransition(showMedicationTabSpotlight);
  const latchedMedicationTabAnchor = useRef(null);
  if (medicationTabSpotlightAnchor) latchedMedicationTabAnchor.current = medicationTabSpotlightAnchor;
  const medicationTabPortalAnchor =
    medicationTabSpotlightAnchor || (medicationTabTx.mounted ? latchedMedicationTabAnchor.current : null);

  useEffect(() => {
    if (!medicationTabTx.mounted) setMedicationTabSpotlightAnchor(null);
  }, [medicationTabTx.mounted]);

  useEffect(() => {
    if (!overlaysClear || !hasMedicationTab || !firebaseUser) return undefined;
    if (isMedicationTabSpotlightDone()) return undefined;
    const t = setTimeout(() => setShowMedicationTabSpotlight(true), 1000);
    return () => clearTimeout(t);
  }, [hasMedicationTab, firebaseUser, overlaysClear]);

  useEffect(() => {
    if (!hasMedicationTab) setShowMedicationTabSpotlight(false);
  }, [hasMedicationTab]);

  useEffect(() => {
    if (!overlaysClear && showMedicationTabSpotlight) {
      setShowMedicationTabSpotlight(false);
    }
  }, [overlaysClear, showMedicationTabSpotlight]);

  useEffect(() => {
    const onPreview = () => {
      try {
        localStorage.removeItem(MEDICATION_TAB_SPOTLIGHT_KEY);
      } catch {
        /* ignore */
      }
      if (hasMedicationTab) setShowMedicationTabSpotlight(true);
    };
    window.addEventListener('tpp:dev-preview-medication-tab-spotlight', onPreview);
    return () => window.removeEventListener('tpp:dev-preview-medication-tab-spotlight', onPreview);
  }, [hasMedicationTab]);

  useEffect(() => {
    if (!showMedicationTabSpotlight) {
      return undefined;
    }
    const measure = () => {
      const el = getVisibleMedicationTab();
      if (!el) {
        setMedicationTabSpotlightAnchor(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        setMedicationTabSpotlightAnchor(null);
        return;
      }
      setMedicationTabSpotlightAnchor({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      });
    };
    measure();
    const t = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [showMedicationTabSpotlight, tabs, getVisibleMedicationTab]);

  useEffect(() => {
    if (!showMedicationTabSpotlight) return undefined;
    const onPointerDown = (e) => {
      const tip = medicationTabTipRef.current;
      const tab = getVisibleMedicationTab();
      const target = e.target;
      if (tip && tip.contains(target)) return;
      if (tab && (tab === target || tab.contains(target))) return;
      dismissMedicationTabSpotlight();
    };
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 50);
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [showMedicationTabSpotlight, dismissMedicationTabSpotlight, getVisibleMedicationTab]);

  // One-time Supplies tab spotlight (Stockpile / Inventory)
  const hasSuppliesTab = useMemo(() => {
    if (!Array.isArray(tabs)) return false;
    return tabs.some((t) => t?.value === 'supplies');
  }, [tabs]);
  const [showSuppliesTabSpotlight, setShowSuppliesTabSpotlight] = useState(false);
  const [suppliesTabSpotlightAnchor, setSuppliesTabSpotlightAnchor] = useState(null);
  const suppliesTabMobileRef = useRef(null);
  const suppliesTabDesktopRef = useRef(null);
  const suppliesTabTipRef = useRef(null);

  const dismissSuppliesTabSpotlight = useCallback(() => {
    markSuppliesTabSpotlightDone();
    setShowSuppliesTabSpotlight(false);
  }, []);

  const getVisibleSuppliesTab = useCallback(
    () => pickVisibleEl(suppliesTabMobileRef.current, suppliesTabDesktopRef.current),
    []
  );

  const suppliesTabTx = useSpotlightTransition(showSuppliesTabSpotlight);
  const latchedSuppliesTabAnchor = useRef(null);
  if (suppliesTabSpotlightAnchor) latchedSuppliesTabAnchor.current = suppliesTabSpotlightAnchor;
  const suppliesTabPortalAnchor =
    suppliesTabSpotlightAnchor || (suppliesTabTx.mounted ? latchedSuppliesTabAnchor.current : null);

  useEffect(() => {
    if (!suppliesTabTx.mounted) setSuppliesTabSpotlightAnchor(null);
  }, [suppliesTabTx.mounted]);

  useEffect(() => {
    if (!overlaysClear || !hasSuppliesTab || !firebaseUser) return undefined;
    if (isSuppliesTabSpotlightDone()) return undefined;
    const t = setTimeout(() => setShowSuppliesTabSpotlight(true), 1000);
    return () => clearTimeout(t);
  }, [hasSuppliesTab, firebaseUser, overlaysClear]);

  useEffect(() => {
    if (!hasSuppliesTab) setShowSuppliesTabSpotlight(false);
  }, [hasSuppliesTab]);

  useEffect(() => {
    if (!overlaysClear && showSuppliesTabSpotlight) {
      setShowSuppliesTabSpotlight(false);
    }
  }, [overlaysClear, showSuppliesTabSpotlight]);

  useEffect(() => {
    const onPreview = () => {
      try {
        localStorage.removeItem(SUPPLIES_TAB_SPOTLIGHT_KEY);
      } catch {
        /* ignore */
      }
      if (hasSuppliesTab) setShowSuppliesTabSpotlight(true);
    };
    window.addEventListener('tpp:dev-preview-supplies-tab-spotlight', onPreview);
    return () => window.removeEventListener('tpp:dev-preview-supplies-tab-spotlight', onPreview);
  }, [hasSuppliesTab]);

  useEffect(() => {
    if (!showSuppliesTabSpotlight) {
      return undefined;
    }
    const measure = () => {
      const el = getVisibleSuppliesTab();
      if (!el) {
        setSuppliesTabSpotlightAnchor(null);
        return;
      }
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) {
        setSuppliesTabSpotlightAnchor(null);
        return;
      }
      setSuppliesTabSpotlightAnchor({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      });
    };
    measure();
    const t = setTimeout(measure, 50);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [showSuppliesTabSpotlight, tabs, getVisibleSuppliesTab]);

  useEffect(() => {
    if (!showSuppliesTabSpotlight) return undefined;
    const onPointerDown = (e) => {
      const tip = suppliesTabTipRef.current;
      const tab = getVisibleSuppliesTab();
      const target = e.target;
      if (tip && tip.contains(target)) return;
      if (tab && (tab === target || tab.contains(target))) return;
      dismissSuppliesTabSpotlight();
    };
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
    }, 50);
    return () => {
      clearTimeout(attach);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [showSuppliesTabSpotlight, dismissSuppliesTabSpotlight, getVisibleSuppliesTab]);

  // Only apply safe area padding for native apps (Android/iOS), not PWA/web
  const isNative = Capacitor.isNativePlatform();
  // Native apps always use mobile layout (even on iPad)
  const lgHidden = isNative ? '' : 'lg:hidden';
  const lgShow = isNative ? 'hidden' : 'hidden lg:flex';
  const lgBlock = isNative ? 'hidden' : 'hidden lg:block';
  
  return (
    <>
      <header 
        className={`backdrop-blur-xl border-b flex items-center px-3 ${isNative ? '' : 'lg:px-6'} relative transition-all duration-300 topbar-header ${isNative ? 'topbar-native' : ''} glass-bar`} 
        style={{ 
          paddingTop: isNative ? 'calc(var(--safe-area-top, 0px) + 0.375rem)' : '0.5rem',
          paddingBottom: '0.5rem',
          minHeight: isNative ? 'calc(3rem + var(--safe-area-top, 0px))' : '3rem',
          borderColor: theme.name === 'Pearlescent'
            ? 'rgba(107, 163, 200, 0.32)'
            : theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
          boxShadow: theme.name === 'Pearlescent'
            ? '0 1px 4px rgba(107, 163, 200, 0.14), inset 0 0.5px 0 rgba(255, 255, 255, 0.7)'
            : theme.isDark
            ? '0 1px 3px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            : '0 1px 3px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
        }}
      >
        {/* Left section */}
        <div className="flex items-center gap-1.5 lg:gap-2 flex-shrink-0">
          {/* Desktop: hamburger for sidebar toggle */}
          <button 
            type="button"
            onMouseDown={(e) => { e.preventDefault(); }}
            onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onMenuClick(); }}
            className={`${lgBlock} no-shadow p-1.5 touch-manipulation rounded-lg transition-all duration-200 hover:scale-105 active:scale-95`} 
            style={{ color: theme.text, WebkitTapHighlightColor: 'transparent', backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)' }}
            aria-label="Open navigation menu"
            aria-expanded="false"
          >
            <Menu size={22} />
          </button>

          {/* Research Notes — left side, always visible */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('tpp:open-research-notes'))}
            className="p-1.5 rounded-lg no-shadow transition-all duration-200 hover:scale-110 active:scale-95 hover:opacity-80 touch-manipulation"
            style={{
              color: theme.primaryDark || theme.primary,
              backgroundColor: 'transparent',
              WebkitTapHighlightColor: 'transparent',
            }}
            aria-label="Research notes"
          >
            <Notepad size={24} weight="duotone" aria-hidden />
          </button>
        </div>
          
        {/* Tabs in Topbar - Center position - Desktop */}
        {tabs && tabs.length > 0 && (
          <div className={`${lgShow} items-center gap-4 absolute left-1/2 transform -translate-x-1/2`}>
            {tabs.map(tab => {
              const isActive = activeTab === tab.value;
              const isCommunityTab = tab.value === 'community';
              const isDiscoverTab = tab.value === 'index';
              const isMedicationTab = tab.value === 'meds';
              const isSuppliesTab = tab.value === 'supplies';
              const communitiesSpotlightHere = showCommunitiesSpotlight && (isCommunityTab || isDiscoverTab);
              const medicationSpotlightHere = showMedicationTabSpotlight && isMedicationTab;
              const suppliesSpotlightHere = showSuppliesTabSpotlight && isSuppliesTab;
              const spotlightHere = communitiesSpotlightHere || medicationSpotlightHere || suppliesSpotlightHere;
              const tabRef = isCommunityTab
                ? communityTabDesktopRef
                : isDiscoverTab
                  ? discoverTabDesktopRef
                  : isMedicationTab
                    ? medicationTabDesktopRef
                    : isSuppliesTab
                      ? suppliesTabDesktopRef
                      : undefined;
              return (
              <button
                key={tab.value}
                ref={tabRef}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (communitiesSpotlightHere) dismissCommunitiesSpotlight();
                  if (medicationSpotlightHere) dismissMedicationTabSpotlight();
                  if (suppliesSpotlightHere) dismissSuppliesTabSpotlight();
                  onTabChange(tab.value);
                }}
                className={`px-3 text-sm uppercase tracking-[0.14em] transition-colors duration-200 relative whitespace-nowrap touch-manipulation inline-flex items-center justify-center ${communitiesSpotlightHere ? 'tpp-communities-spotlight-btn' : ''} ${medicationSpotlightHere ? 'tpp-medication-tab-spotlight-btn' : ''} ${suppliesSpotlightHere ? 'tpp-supplies-tab-spotlight-btn' : ''}`}
                style={{
                  color: spotlightHere ? (theme.primary || TAB_INDICATOR_COLOR) : (isActive ? theme.text : theme.textLight),
                  fontWeight: isActive || spotlightHere ? 700 : 500,
                  opacity: isActive || spotlightHere ? 1 : 0.55,
                  WebkitTapHighlightColor: 'transparent',
                  minHeight: 44,
                  minWidth: 44,
                }}
              >
                {tab.label}
                {isActive && (
                  <motion.span
                    layoutId="activeTabDesktop"
                    className="absolute left-2 right-2 rounded-full pointer-events-none"
                    style={{
                      backgroundColor: TAB_INDICATOR_COLOR,
                      height: 2.5,
                      bottom: 6,
                      boxShadow: `0 0 8px ${TAB_INDICATOR_COLOR}50`,
                    }}
                    transition={TAB_INDICATOR_SPRING}
                  />
                )}
              </button>
              );
            })}
            {onActionClick && (
              <div 
                className="h-6 w-px mx-2" 
                style={{ backgroundColor: theme.border }}
              />
            )}
            {(onActionClick || actionItems?.length) && (
              <div className="relative" ref={desktopActionMenuRef}>
                <button 
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (actionItems?.length) {
                      setShowActionMenu(v => !v);
                    } else {
                      onActionClick?.();
                    }
                  }}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 touch-manipulation" 
                  style={{ 
                    color: actionDisabled ? theme.textLight : '#ffffff', 
                    backgroundColor: actionDisabled ? theme.border : (showActionMenu ? theme.primaryDark || theme.primary : theme.primary),
                    border: 'none',
                    opacity: actionDisabled ? 0.4 : 1,
                    cursor: actionDisabled ? 'not-allowed' : 'pointer',
                    boxShadow: actionDisabled ? 'none' : 'inset 0 2px 4px rgba(0, 0, 0, 0.15), inset 0 1px 2px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.10)',
                    WebkitTapHighlightColor: 'transparent'
                  }} 
                  disabled={actionDisabled}
                  title="Add New"
                >
                  <Plus className="h-4 w-4 transition-transform duration-200" strokeWidth={2.5} style={{ transform: showActionMenu ? 'rotate(45deg)' : 'rotate(0deg)' }} />
                </button>
                {showActionMenu && actionItems?.length > 0 && (
                  <div
                    className="absolute right-0 top-10 z-50 rounded-xl border overflow-hidden"
                    style={{
                      minWidth: '160px',
                      backgroundColor: theme.isDark ? theme.cardBackground : '#ffffff',
                      borderColor: theme.border,
                      boxShadow: theme.isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.14)',
                    }}
                  >
                    {actionItems.map((item, i) => (
                      <button
                        key={item.label}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setShowActionMenu(false);
                          item.onClick?.();
                        }}
                        className="w-full text-left px-4 py-3 text-sm font-medium transition-colors touch-manipulation"
                        style={{
                          color: theme.text,
                          backgroundColor: 'transparent',
                          borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
                          WebkitTapHighlightColor: 'transparent',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.06)' : `${theme.primary}10`; e.currentTarget.style.color = theme.primary; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = theme.text; }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        
        {/* Spacer to push icons to the right when no tabs */}
        {(!tabs || tabs.length === 0) && <div className="flex-1" />}
        
        {/* Mobile tabs - minimal underline style */}
        {tabs && tabs.length > 0 && (
          <div 
            className={`${lgHidden} flex items-center gap-1 flex-1 overflow-x-auto mobile-tabs-container`} 
            style={{ 
              scrollbarWidth: 'none', 
              msOverflowStyle: 'none',
              minWidth: 0,
              // Responsive padding - adjusted via CSS media queries below
              // Base padding for larger phones, media queries handle smaller screens
              paddingRight: 'calc(8rem + env(safe-area-inset-right, 0px))',
              marginRight: '0.25rem',
              // Ensure tabs container respects right-side button space
              maxWidth: 'calc(100% - 9rem)',
              WebkitOverflowScrolling: 'touch'
            }}
          >
            <style>{`
              .mobile-tabs-container::-webkit-scrollbar {
                display: none;
              }
            `}</style>
            {tabs.map(tab => {
              const isActive = activeTab === tab.value;
              const isCommunityTab = tab.value === 'community';
              const isDiscoverTab = tab.value === 'index';
              const isMedicationTab = tab.value === 'meds';
              const isSuppliesTab = tab.value === 'supplies';
              const communitiesSpotlightHere = showCommunitiesSpotlight && (isCommunityTab || isDiscoverTab);
              const medicationSpotlightHere = showMedicationTabSpotlight && isMedicationTab;
              const suppliesSpotlightHere = showSuppliesTabSpotlight && isSuppliesTab;
              const spotlightHere = communitiesSpotlightHere || medicationSpotlightHere || suppliesSpotlightHere;
              const tabRef = isCommunityTab
                ? communityTabMobileRef
                : isDiscoverTab
                  ? discoverTabMobileRef
                  : isMedicationTab
                    ? medicationTabMobileRef
                    : isSuppliesTab
                      ? suppliesTabMobileRef
                      : undefined;
              return (
              <button
                key={tab.value}
                ref={tabRef}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                }}
                onTouchStart={(e) => {
                  if (e.cancelable) {
                    e.preventDefault();
                  }
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (communitiesSpotlightHere) dismissCommunitiesSpotlight();
                  if (medicationSpotlightHere) dismissMedicationTabSpotlight();
                  if (suppliesSpotlightHere) dismissSuppliesTabSpotlight();
                  onTabChange(tab.value);
                }}
                className={`px-3 text-[13px] uppercase tracking-[0.14em] transition-colors duration-200 relative whitespace-nowrap flex-shrink-0 touch-manipulation inline-flex items-center justify-center ${communitiesSpotlightHere ? 'tpp-communities-spotlight-btn' : ''} ${medicationSpotlightHere ? 'tpp-medication-tab-spotlight-btn' : ''} ${suppliesSpotlightHere ? 'tpp-supplies-tab-spotlight-btn' : ''}`}
                style={{
                  color: spotlightHere ? (theme.primary || TAB_INDICATOR_COLOR) : (isActive ? theme.text : theme.textLight),
                  fontWeight: isActive || spotlightHere ? 700 : 500,
                  opacity: isActive || spotlightHere ? 1 : 0.55,
                  WebkitTapHighlightColor: 'transparent',
                  lineHeight: '1.15rem',
                  minHeight: 44,
                  minWidth: 44,
                }}
              >
                {tab.label}
                {isActive && (
                  <motion.span
                    layoutId="activeTab"
                    className="absolute left-2.5 right-2.5 rounded-full pointer-events-none"
                    style={{
                      backgroundColor: TAB_INDICATOR_COLOR,
                      height: 2.5,
                      bottom: 6,
                      boxShadow: `0 0 8px ${TAB_INDICATOR_COLOR}50`,
                    }}
                    transition={TAB_INDICATOR_SPRING}
                  />
                )}
              </button>
              );
            })}
          </div>
        )}
        
        <div className="flex items-center gap-1.5 lg:gap-2 flex-shrink-0 ml-auto" style={{ minWidth: 0 }}>
          {/* Mobile Add button — hidden on mobile; GlobalFAB handles it there */}
          {tabs && tabs.length > 0 && (onActionClick || actionItems?.length) && (
            <div className="hidden relative flex-shrink-0" ref={mobileActionMenuRef}>
              <button 
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (actionItems?.length) {
                    setShowActionMenu(v => !v);
                  } else {
                    onActionClick?.();
                  }
                }}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-200 touch-manipulation"
                style={{ 
                  color: actionDisabled ? theme.textLight : '#ffffff', 
                  backgroundColor: actionDisabled ? theme.border : (showActionMenu ? theme.primaryDark || theme.primary : theme.primary),
                  border: 'none',
                  opacity: actionDisabled ? 0.4 : 1,
                  cursor: actionDisabled ? 'not-allowed' : 'pointer',
                  boxShadow: actionDisabled ? 'none' : 'inset 0 2px 4px rgba(0, 0, 0, 0.15), inset 0 1px 2px rgba(0, 0, 0, 0.1), 0 2px 6px rgba(0, 0, 0, 0.10)',
                  WebkitTapHighlightColor: 'transparent'
                }} 
                disabled={actionDisabled}
                title="Add New"
              >
                <Plus className="h-4 w-4 transition-transform duration-200" strokeWidth={2.5} style={{ transform: showActionMenu ? 'rotate(45deg)' : 'rotate(0deg)' }} />
              </button>
              {showActionMenu && actionItems?.length > 0 && (
                <div
                  className="absolute right-0 top-10 z-50 rounded-xl border overflow-hidden"
                  style={{
                    minWidth: '160px',
                    backgroundColor: theme.isDark ? theme.cardBackground : '#ffffff',
                    borderColor: theme.border,
                    boxShadow: theme.isDark ? '0 8px 24px rgba(0,0,0,0.5)' : '0 8px 24px rgba(0,0,0,0.14)',
                  }}
                >
                  {actionItems.map((item, i) => (
                    <button
                      key={item.label}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowActionMenu(false);
                        item.onClick?.();
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-medium transition-colors touch-manipulation"
                      style={{
                        color: theme.text,
                        backgroundColor: 'transparent',
                        borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.06)' : `${theme.primary}10`; e.currentTarget.style.color = theme.primary; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = theme.text; }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Auto Save Indicator */}
          {autoSaveIndicator && (
            <div className="mr-2">
              {autoSaveIndicator}
            </div>
          )}
          {/* Dev-only: subscription state picker */}
          {showDevSubPicker && (
            <div className="relative flex-shrink-0" ref={devSubMenuRef}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDevSubMenu((v) => !v);
                }}
                className="p-1.5 rounded-lg no-shadow transition-all duration-200 hover:scale-110 active:scale-95 touch-manipulation"
                style={{
                  color: DEV_STATE_META[devSubCurrent]?.dot ?? '#7F9E95',
                  backgroundColor: `${DEV_STATE_META[devSubCurrent]?.dot ?? '#7F9E95'}22`,
                  WebkitTapHighlightColor: 'transparent',
                }}
                title="Dev: subscription state"
                aria-label="Dev menu: subscription state"
                aria-expanded={showDevSubMenu}
              >
                <FlaskConical className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
              {showDevSubMenu && (
                <div
                  className="absolute right-0 top-full mt-1 z-[200] rounded-xl border overflow-hidden"
                  style={{
                    minWidth: '180px',
                    backgroundColor: 'rgba(15,15,15,0.97)',
                    borderColor: 'rgba(255,255,255,0.10)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  }}
                  role="menu"
                >
                  <div
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide border-b"
                    style={{ color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    Subscription state
                  </div>
                  {DEV_STATES.map((state, i) => {
                    const m = DEV_STATE_META[state];
                    const active = state === devSubCurrent;
                    return (
                      <button
                        key={state}
                        type="button"
                        role="menuitem"
                        onMouseDown={(e) => e.preventDefault()}
                        onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDevOverride(state);
                          setShowDevSubMenu(false);
                        }}
                        className="w-full text-left px-3 py-2.5 text-xs font-medium transition-colors touch-manipulation flex items-center gap-2"
                        style={{
                          color: active ? '#fff' : 'rgba(255,255,255,0.55)',
                          backgroundColor: active ? `${m.dot}22` : 'transparent',
                          borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                          WebkitTapHighlightColor: 'transparent',
                          fontWeight: active ? 700 : 400,
                          outline: active ? `1.5px solid ${m.dot}55` : 'none',
                          outlineOffset: '-1.5px',
                        }}
                      >
                        <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: active ? m.dot : 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {showDevUpdatePreview && (
            <div className="relative flex-shrink-0" ref={devUpdateMenuRef}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDevUpdateMenu((v) => !v);
                }}
                className="p-1.5 rounded-lg no-shadow transition-all duration-200 hover:scale-110 active:scale-95 touch-manipulation"
                style={{
                  color: theme.warning ?? theme.primary,
                  backgroundColor: theme.isDark ? 'rgba(250, 204, 21, 0.12)' : 'rgba(250, 204, 21, 0.2)',
                  WebkitTapHighlightColor: 'transparent',
                }}
                title="Dev: preview modals & UI pages"
                aria-label="Dev menu: preview modals and UI pages"
                aria-expanded={showDevUpdateMenu}
              >
                <Smartphone className="h-5 w-5" strokeWidth={2} aria-hidden />
              </button>
              {showDevUpdateMenu && (
                <div
                  className="absolute right-0 top-full mt-1 z-[200] rounded-xl border overflow-hidden max-h-[min(70vh,420px)] overflow-y-auto"
                  style={{
                    minWidth: '220px',
                    backgroundColor: 'rgba(15,15,15,0.97)',
                    borderColor: 'rgba(255,255,255,0.10)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  }}
                  role="menu"
                >
                  <div
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide border-b flex items-center justify-between gap-2"
                    style={{ color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    <span>Preview update UX</span>
                    <span className="flex items-center gap-2 font-medium normal-case tracking-normal">
                      <span className="inline-flex items-center gap-1">
                        <DevLiveDot live />
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>live</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <DevLiveDot live={false} />
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>off</span>
                      </span>
                    </span>
                  </div>
                  {[
                    {
                      kind: 'store-optional',
                      label: 'Store prompt · optional',
                      live: NATIVE_STORE_UPDATE_PROMPT_ENABLED,
                      liveHint: 'NATIVE_STORE_UPDATE_PROMPT_ENABLED',
                    },
                    {
                      kind: 'store-recommended',
                      label: 'Store prompt · recommended',
                      live: NATIVE_STORE_UPDATE_PROMPT_ENABLED,
                      liveHint: 'NATIVE_STORE_UPDATE_PROMPT_ENABLED',
                    },
                    {
                      kind: 'store-critical',
                      label: 'Store prompt · required',
                      live: NATIVE_STORE_UPDATE_PROMPT_ENABLED,
                      liveHint: 'NATIVE_STORE_UPDATE_PROMPT_ENABLED',
                    },
                    {
                      kind: 'feature-announcement',
                      label: "What's New modal",
                      live: FEATURE_ANNOUNCEMENT_AUTO_SHOW_ENABLED,
                      liveHint: 'FEATURE_ANNOUNCEMENT_AUTO_SHOW_ENABLED (auto-show)',
                    },
                    { kind: 'reconsent', label: 'Legal re-consent', live: true },
                    { kind: 'page-intro', label: 'Page intro (this route)', live: true },
                    { kind: 'onboarding', label: 'Onboarding walkthrough', live: true },
                    { kind: 'toast-success', label: 'Toast · success', toast: { type: 'success', message: 'Toast preview — success (sage)' }, live: true },
                    { kind: 'toast-error', label: 'Toast · error', toast: { type: 'error', message: 'Toast preview — error (red)' }, live: true },
                    { kind: 'toast-warning', label: 'Toast · warning', toast: { type: 'warning', message: 'Toast preview — warning' }, live: true },
                    { kind: 'toast-info', label: 'Toast · info', toast: { type: 'info', message: 'Toast preview — info' }, live: true },
                    { kind: 'page-loader', label: 'Page loader · route', live: true },
                    { kind: 'page-loader-fullscreen', label: 'Page loader · full screen', live: true },
                    { kind: 'nudge-usage-calc', label: 'Nudge · usage · Calculator', nudge: { type: 'usage', path: '/app/recon' }, live: true },
                    { kind: 'nudge-usage-analytics', label: 'Nudge · usage · Analytics', nudge: { type: 'usage', path: '/app/insights' }, live: true },
                    { kind: 'nudge-usage-goals', label: 'Nudge · usage · Goals', nudge: { type: 'usage', path: '/app/goals' }, live: true },
                    { kind: 'nudge-discovery-calc', label: 'Nudge · discovery · Calculator', nudge: { type: 'discovery', path: '/app/recon' }, live: true },
                    { kind: 'nudge-discovery-analytics', label: 'Nudge · discovery · Analytics', nudge: { type: 'discovery', path: '/app/insights' }, live: true },
                    { kind: 'nudge-discovery-goals', label: 'Nudge · discovery · Goals', nudge: { type: 'discovery', path: '/app/goals' }, live: true },
                    { kind: 'upgrade-checklist', label: 'Advanced Mode nudge', checklist: true, mode: 'advanced', live: true },
                    { kind: 'simple-mode-nudge', label: 'Simple Mode nudge', checklist: true, mode: 'simple', live: true },
                    { kind: 'reschedule-spotlight', label: 'Spotlight · reschedule ⋮', rescheduleSpotlight: true, live: true },
                    { kind: 'communities-spotlight', label: 'Spotlight · Communities & Discover', communitiesSpotlight: true, live: true },
                    { kind: 'settings-mode-spotlight', label: 'Spotlight · Simple & Advanced Mode (gear)', settingsModeSpotlight: true, live: true },
                    { kind: 'user-settings-mode-spotlight', label: 'Spotlight · User Settings (modes)', userSettingsModeSpotlight: true, live: true },
                    { kind: 'medication-tab-spotlight', label: 'Spotlight · Medication tab', medicationTabSpotlight: true, live: true },
                    { kind: 'supplies-tab-spotlight', label: 'Spotlight · Supplies tab', suppliesTabSpotlight: true, live: true },
                    { kind: 'scan-label-spotlight', label: 'Spotlight · Scan Label', scanLabelSpotlight: true, live: true },
                    { kind: 'order-placed', label: 'Incoming order · Placed', orderStatusStep: 1, live: true },
                    { kind: 'order-transit', label: 'Incoming order · In Transit', orderStatusStep: 2, live: true },
                    { kind: 'order-delivered', label: 'Incoming order · Delivered', orderStatusStep: 3, live: true },
                  ].map((item, i) => (
                    <button
                      key={item.kind}
                      type="button"
                      role="menuitem"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowDevUpdateMenu(false);
                        if (item.toast) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:toast', { detail: item.toast })
                          );
                          return;
                        }
                        if (item.nudge) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-mode-nudge', { detail: item.nudge })
                          );
                          return;
                        }
                        if (item.checklist) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:show-upgrade-checklist', {
                              detail: { mode: item.mode || 'advanced' },
                            })
                          );
                          return;
                        }
                        if (item.rescheduleSpotlight) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-reschedule-spotlight')
                          );
                          return;
                        }
                        if (item.communitiesSpotlight) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-communities-spotlight')
                          );
                          return;
                        }
                        if (item.settingsModeSpotlight) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-settings-mode-spotlight')
                          );
                          return;
                        }
                        if (item.userSettingsModeSpotlight) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-user-settings-mode-spotlight')
                          );
                          return;
                        }
                        if (item.medicationTabSpotlight) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-medication-tab-spotlight')
                          );
                          return;
                        }
                        if (item.suppliesTabSpotlight) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-supplies-tab-spotlight')
                          );
                          return;
                        }
                        if (item.scanLabelSpotlight) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-scan-label-spotlight')
                          );
                          return;
                        }
                        if (item.orderStatusStep) {
                          window.dispatchEvent(
                            new CustomEvent('tpp:dev-preview-order-status', {
                              detail: { step: item.orderStatusStep },
                            })
                          );
                          return;
                        }
                        window.dispatchEvent(
                          new CustomEvent('tpp:dev-preview-user-update-modal', { detail: { kind: item.kind } })
                        );
                      }}
                      className="w-full text-left px-3 py-2.5 text-xs font-medium transition-colors touch-manipulation flex items-center gap-2"
                      style={{
                        color: 'rgba(255,255,255,0.55)',
                        backgroundColor: 'transparent',
                        borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                    >
                      <DevLiveDot
                        live={item.live !== false}
                        title={item.liveHint || (item.live !== false ? 'Live in production' : 'Disabled in production')}
                      />
                      <span className="flex-1 min-w-0">{item.label}</span>
                    </button>
                  ))}
                  <div
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide border-t border-b"
                    style={{ color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    Popup modals
                  </div>
                  {[
                    {
                      kind: 'popup-advanced-mode',
                      label: 'Advanced Mode nudge',
                      event: 'tpp:show-upgrade-checklist',
                      detail: { mode: 'advanced', devPreview: true },
                    },
                    {
                      kind: 'popup-simple-mode',
                      label: 'Simple Mode nudge',
                      event: 'tpp:show-upgrade-checklist',
                      detail: { mode: 'simple', devPreview: true },
                    },
                    {
                      kind: 'popup-hydration-day1',
                      label: 'Hydration · day 1 (streak start)',
                      event: 'tpp:show-hydration-celebration',
                      detail: { streak: 1, devPreview: true },
                    },
                    {
                      kind: 'popup-hydration-daily',
                      label: 'Hydration · daily goal hit (streak)',
                      event: 'tpp:show-hydration-celebration',
                      detail: { streak: 4, devPreview: true },
                    },
                    {
                      kind: 'popup-hydration-long',
                      label: 'Hydration · long streak',
                      event: 'tpp:show-hydration-celebration',
                      detail: { streak: 14, devPreview: true },
                    },
                    {
                      kind: 'popup-goal-weight',
                      label: 'Goal · weight',
                      event: 'tpp:show-goal-celebration',
                      detail: { linkedType: 'weight', linkedTarget: 180, text: 'Reach a target weight', devPreview: true },
                    },
                    {
                      kind: 'popup-goal-streak',
                      label: 'Goal · research streak',
                      event: 'tpp:show-goal-celebration',
                      detail: { linkedType: 'streak', linkedTarget: 30, text: 'Build a daily research streak', devPreview: true },
                    },
                    {
                      kind: 'popup-goal-protocols',
                      label: 'Goal · protocols',
                      event: 'tpp:show-goal-celebration',
                      detail: { linkedType: 'completedProtocols', linkedTarget: 3, text: 'Finish N protocols', devPreview: true },
                    },
                    {
                      kind: 'popup-goal-budget',
                      label: 'Goal · budget',
                      event: 'tpp:show-goal-celebration',
                      detail: { linkedType: 'spendBudget', linkedTarget: 500, text: 'Stay under a spending budget', devPreview: true },
                    },
                    {
                      kind: 'popup-goal-stock',
                      label: 'Goal · stockpile',
                      event: 'tpp:show-goal-celebration',
                      detail: { linkedType: 'lowStockCleared', text: 'Clear every low-stock item', devPreview: true },
                    },
                    {
                      kind: 'popup-goal-manual',
                      label: 'Goal · manual',
                      event: 'tpp:show-goal-celebration',
                      detail: { linkedType: null, text: 'My custom research goal', devPreview: true },
                    },
                    {
                      kind: 'popup-daily-unlock',
                      label: 'Daily tasks unlock',
                      event: 'tpp:daily-tasks-unlock',
                      detail: { streak: 12, devPreview: true },
                    },
                    {
                      kind: 'popup-streak-7',
                      label: 'Streak milestone · 7 days',
                      event: 'tpp:streak-milestone',
                      detail: { streak: 7, devPreview: true },
                    },
                    {
                      kind: 'popup-streak-30',
                      label: 'Streak milestone · 30 days',
                      event: 'tpp:streak-milestone',
                      detail: { streak: 30, devPreview: true },
                    },
                    {
                      kind: 'popup-streak-90',
                      label: 'Streak milestone · 90 days',
                      event: 'tpp:streak-milestone',
                      detail: { streak: 90, devPreview: true },
                    },
                  ].map((item, i) => (
                    <button
                      key={item.kind}
                      type="button"
                      role="menuitem"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowDevUpdateMenu(false);
                        window.dispatchEvent(
                          new CustomEvent(item.event, { detail: item.detail })
                        );
                      }}
                      className="w-full text-left px-3 py-2.5 text-xs font-medium transition-colors touch-manipulation"
                      style={{
                        color: 'rgba(255,255,255,0.55)',
                        backgroundColor: 'transparent',
                        borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                    >
                      {item.label}
                    </button>
                  ))}
                  <div
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide border-t border-b"
                    style={{ color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    Verify email · /verify-email
                  </div>
                  {DEV_VERIFY_EMAIL_PREVIEWS.map((item, i) => (
                    <button
                      key={item.path}
                      type="button"
                      role="menuitem"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowDevUpdateMenu(false);
                        navigate(item.path);
                      }}
                      className="w-full text-left px-3 py-2.5 text-xs font-medium transition-colors touch-manipulation"
                      style={{
                        color: 'rgba(255,255,255,0.55)',
                        backgroundColor: 'transparent',
                        borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                    >
                      {item.label}
                    </button>
                  ))}
                  <div
                    className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide border-t border-b"
                    style={{ color: 'rgba(255,255,255,0.35)', borderColor: 'rgba(255,255,255,0.08)' }}
                  >
                    UI pages (no app route)
                  </div>
                  {DEV_UI_PAGES.map((item, i) => (
                    <button
                      key={item.path}
                      type="button"
                      role="menuitem"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => { if (e.cancelable) e.preventDefault(); }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowDevUpdateMenu(false);
                        navigate(item.path);
                      }}
                      className="w-full text-left px-3 py-2.5 text-xs font-medium transition-colors touch-manipulation"
                      style={{
                        color: 'rgba(255,255,255,0.55)',
                        backgroundColor: 'transparent',
                        borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                        WebkitTapHighlightColor: 'transparent',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#fff'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {/* Sync status — subtle grey, next to settings */}
          <SyncStatusIndicator theme={theme} />
          <button
            ref={settingsBtnRef}
            type="button"
            onClick={() => {
              if (showSettingsModeSpotlight) dismissSettingsModeSpotlight();
              navigate('/app/settings');
            }}
            className={`p-1.5 lg:p-2 rounded-lg no-shadow transition-all duration-200 hover:scale-110 active:scale-95 hover:opacity-80 touch-manipulation relative ${showSettingsModeSpotlight ? 'tpp-settings-mode-spotlight-btn' : ''}`}
            style={{
              color: showSettingsModeSpotlight ? (theme.primary || theme.text) : theme.text,
              backgroundColor: showSettingsModeSpotlight
                ? (theme.isDark ? `${theme.primary}33` : `${theme.primary}18`)
                : 'transparent',
              WebkitTapHighlightColor: 'transparent'
            }}
            aria-label="Settings"
          >
            <GearSix size={24} weight="duotone" aria-hidden />
          </button>
          
        </div>
      </header>

      {communitiesTx.mounted && communitiesPortalAnchor && createPortal(
        (() => {
          const primary = theme?.primary || '#7F9E95';
          const tipBg = theme?.isDark ? 'rgba(20,25,33,0.98)' : '#ffffff';
          const tipText = theme?.text || '#1f2937';
          const tipBorder = theme?.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
          const tipW = 210;
          const padX = 2;
          const padY = 0;
          const ovalLeft = Math.max(4, communitiesPortalAnchor.left - padX);
          const ovalTop = Math.max(4, communitiesPortalAnchor.top - padY);
          const ovalW = communitiesPortalAnchor.width + padX * 2;
          const ovalH = Math.max(communitiesPortalAnchor.height + padY * 2 - 6, 30);
          // Center tip under Communities + Discover span
          const tipLeft = Math.max(
            8,
            Math.min(
              communitiesPortalAnchor.left + communitiesPortalAnchor.width / 2 - tipW / 2,
              window.innerWidth - tipW - 8
            )
          );
          return (
            <>
              <div
                aria-hidden
                className={`fixed z-[10039] pointer-events-none ${communitiesTx.ovalClass}`}
                style={{
                  top: ovalTop,
                  left: ovalLeft,
                  width: ovalW,
                  height: ovalH,
                }}
              >
                <div
                  className="tpp-communities-spotlight-oval w-full h-full"
                  style={{
                    borderRadius: 9999,
                    boxShadow: `0 0 0 2px ${primary}`,
                  }}
                />
              </div>
              <div
                className={`fixed z-[10040] pointer-events-none ${communitiesTx.tipClass}`}
                style={{
                  top: communitiesPortalAnchor.bottom + 8,
                  left: tipLeft,
                  width: tipW,
                }}
                role="status"
                aria-live="polite"
              >
                <div
                  ref={communitiesTipRef}
                  className="pointer-events-auto rounded-xl shadow-2xl border px-3.5 pt-3 pb-3.5 relative text-center"
                  style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                >
                  <span
                    aria-hidden
                    className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border-l border-t"
                    style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissCommunitiesSpotlight();
                    }}
                    className="absolute top-2 right-2 p-0.5 opacity-40 hover:opacity-70 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" style={{ color: tipText }} />
                  </button>
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-md"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(90,110,101,0.85)' : '#4a5f56',
                        color: 'rgba(255,255,255,0.95)',
                      }}
                    >
                      New
                    </span>
                    <p className="text-sm font-semibold leading-snug" style={{ color: tipText }}>
                      Communities & Discover
                    </p>
                  </div>
                </div>
              </div>
            </>
          );
        })(),
        document.body
      )}

      {settingsModeTx.mounted && settingsModePortalAnchor && createPortal(
        (() => {
          const primary = theme?.primary || '#7F9E95';
          const tipBg = theme?.isDark ? 'rgba(20,25,33,0.98)' : '#ffffff';
          const tipText = theme?.text || '#1f2937';
          const tipBorder = theme?.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
          const tipW = 200;
          const pad = 2;
          const gearCx =
            settingsModePortalAnchor.left + settingsModePortalAnchor.width / 2;
          const gearCy =
            settingsModePortalAnchor.top + settingsModePortalAnchor.height / 2;
          const ovalSize = Math.max(settingsModePortalAnchor.width, settingsModePortalAnchor.height) + pad * 2;
          const ovalLeft = gearCx - ovalSize / 2;
          const ovalTop = gearCy - ovalSize / 2;
          // Keep tip near the right edge (gear lives there); arrow tracks the gear center
          let tipLeft = gearCx - tipW + 36;
          tipLeft = Math.max(8, Math.min(tipLeft, window.innerWidth - tipW - 8));
          const arrowLeft = Math.max(14, Math.min(gearCx - tipLeft, tipW - 14));
          return (
            <>
              <div
                aria-hidden
                className={`fixed z-[10039] pointer-events-none ${settingsModeTx.ovalClass}`}
                style={{
                  top: ovalTop,
                  left: ovalLeft,
                  width: ovalSize,
                  height: ovalSize,
                }}
              >
                <div
                  className="tpp-settings-mode-spotlight-oval w-full h-full"
                  style={{
                    borderRadius: 9999,
                    boxShadow: `0 0 0 2px ${primary}`,
                  }}
                />
              </div>
              <div
                className={`fixed z-[10040] pointer-events-none ${settingsModeTx.tipClass}`}
                style={{
                  top: settingsModePortalAnchor.bottom + 10,
                  left: tipLeft,
                  width: tipW,
                }}
                role="status"
                aria-live="polite"
              >
                <div
                  ref={settingsModeTipRef}
                  className="pointer-events-auto rounded-xl shadow-2xl border px-3.5 pt-3 pb-3.5 relative text-center"
                  style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                >
                  <span
                    aria-hidden
                    className="absolute -top-1.5 w-3 h-3 rotate-45 border-l border-t"
                    style={{
                      backgroundColor: tipBg,
                      borderColor: tipBorder,
                      left: arrowLeft,
                      transform: 'translateX(-50%) rotate(45deg)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissSettingsModeSpotlight();
                    }}
                    className="absolute top-2 right-2 p-0.5 opacity-40 hover:opacity-70 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" style={{ color: tipText }} />
                  </button>
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-md"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(90,110,101,0.85)' : '#4a5f56',
                        color: 'rgba(255,255,255,0.95)',
                      }}
                    >
                      New
                    </span>
                    <p className="text-sm font-semibold leading-snug" style={{ color: tipText }}>
                      Simple & Advanced Mode
                    </p>
                  </div>
                </div>
              </div>
            </>
          );
        })(),
        document.body
      )}

      {medicationTabTx.mounted && medicationTabPortalAnchor && createPortal(
        (() => {
          const primary = theme?.primary || '#7F9E95';
          const tipBg = theme?.isDark ? 'rgba(20,25,33,0.98)' : '#ffffff';
          const tipText = theme?.text || '#1f2937';
          const tipBorder = theme?.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
          const tipW = 150;
          const padX = 2;
          const padY = 0;
          const tabCx = medicationTabPortalAnchor.left + medicationTabPortalAnchor.width / 2;
          const ovalLeft = Math.max(4, medicationTabPortalAnchor.left - padX);
          const ovalTop = Math.max(4, medicationTabPortalAnchor.top - padY);
          const ovalW = medicationTabPortalAnchor.width + padX * 2;
          const ovalH = Math.max(medicationTabPortalAnchor.height + padY * 2 - 6, 30);
          let tipLeft = tabCx - tipW / 2;
          tipLeft = Math.max(8, Math.min(tipLeft, window.innerWidth - tipW - 8));
          const arrowLeft = Math.max(14, Math.min(tabCx - tipLeft, tipW - 14));
          return (
            <>
              <div
                aria-hidden
                className={`fixed z-[10039] pointer-events-none ${medicationTabTx.ovalClass}`}
                style={{
                  top: ovalTop,
                  left: ovalLeft,
                  width: ovalW,
                  height: ovalH,
                }}
              >
                <div
                  className="tpp-medication-tab-spotlight-oval w-full h-full"
                  style={{
                    borderRadius: 9999,
                    boxShadow: `0 0 0 2px ${primary}`,
                  }}
                />
              </div>
              <div
                className={`fixed z-[10040] pointer-events-none ${medicationTabTx.tipClass}`}
                style={{
                  top: medicationTabPortalAnchor.bottom + 8,
                  left: tipLeft,
                  width: tipW,
                }}
                role="status"
                aria-live="polite"
              >
                <div
                  ref={medicationTabTipRef}
                  className="pointer-events-auto rounded-xl shadow-2xl border px-3.5 pt-3 pb-3.5 relative text-center"
                  style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                >
                  <span
                    aria-hidden
                    className="absolute -top-1.5 w-3 h-3 rotate-45 border-l border-t"
                    style={{
                      backgroundColor: tipBg,
                      borderColor: tipBorder,
                      left: arrowLeft,
                      transform: 'translateX(-50%) rotate(45deg)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissMedicationTabSpotlight();
                    }}
                    className="absolute top-2 right-2 p-0.5 opacity-40 hover:opacity-70 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" style={{ color: tipText }} />
                  </button>
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-md"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(90,110,101,0.85)' : '#4a5f56',
                        color: 'rgba(255,255,255,0.95)',
                      }}
                    >
                      New
                    </span>
                    <p className="text-sm font-semibold leading-snug" style={{ color: tipText }}>
                      Medication
                    </p>
                  </div>
                </div>
              </div>
            </>
          );
        })(),
        document.body
      )}

      {suppliesTabTx.mounted && suppliesTabPortalAnchor && createPortal(
        (() => {
          const primary = theme?.primary || '#7F9E95';
          const tipBg = theme?.isDark ? 'rgba(20,25,33,0.98)' : '#ffffff';
          const tipText = theme?.text || '#1f2937';
          const tipBorder = theme?.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
          const tipW = 140;
          const padX = 2;
          const padY = 0;
          const tabCx = suppliesTabPortalAnchor.left + suppliesTabPortalAnchor.width / 2;
          const ovalLeft = Math.max(4, suppliesTabPortalAnchor.left - padX);
          const ovalTop = Math.max(4, suppliesTabPortalAnchor.top - padY);
          const ovalW = suppliesTabPortalAnchor.width + padX * 2;
          const ovalH = Math.max(suppliesTabPortalAnchor.height + padY * 2 - 6, 30);
          let tipLeft = tabCx - tipW / 2;
          tipLeft = Math.max(8, Math.min(tipLeft, window.innerWidth - tipW - 8));
          const arrowLeft = Math.max(14, Math.min(tabCx - tipLeft, tipW - 14));
          return (
            <>
              <div
                aria-hidden
                className={`fixed z-[10039] pointer-events-none ${suppliesTabTx.ovalClass}`}
                style={{
                  top: ovalTop,
                  left: ovalLeft,
                  width: ovalW,
                  height: ovalH,
                }}
              >
                <div
                  className="tpp-supplies-tab-spotlight-oval w-full h-full"
                  style={{
                    borderRadius: 9999,
                    boxShadow: `0 0 0 2px ${primary}`,
                  }}
                />
              </div>
              <div
                className={`fixed z-[10040] pointer-events-none ${suppliesTabTx.tipClass}`}
                style={{
                  top: suppliesTabPortalAnchor.bottom + 8,
                  left: tipLeft,
                  width: tipW,
                }}
                role="status"
                aria-live="polite"
              >
                <div
                  ref={suppliesTabTipRef}
                  className="pointer-events-auto rounded-xl shadow-2xl border px-3.5 pt-3 pb-3.5 relative text-center"
                  style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                >
                  <span
                    aria-hidden
                    className="absolute -top-1.5 w-3 h-3 rotate-45 border-l border-t"
                    style={{
                      backgroundColor: tipBg,
                      borderColor: tipBorder,
                      left: arrowLeft,
                      transform: 'translateX(-50%) rotate(45deg)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      dismissSuppliesTabSpotlight();
                    }}
                    className="absolute top-2 right-2 p-0.5 opacity-40 hover:opacity-70 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" style={{ color: tipText }} />
                  </button>
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-md"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(90,110,101,0.85)' : '#4a5f56',
                        color: 'rgba(255,255,255,0.95)',
                      }}
                    >
                      New
                    </span>
                    <p className="text-sm font-semibold leading-snug" style={{ color: tipText }}>
                      Supplies
                    </p>
                  </div>
                </div>
              </div>
            </>
          );
        })(),
        document.body
      )}

      <style>{`
        .topbar-header {
          /* Height handled inline with safe area calculations */
        }
        @media (min-width: 1024px) {
          .topbar-header:not(.topbar-native) {
            min-height: 3rem !important; /* lg:h-12 for desktop */
            padding-top: 0px !important; /* No safe area padding on desktop */
          }
        }
        /* Responsive tab spacing for mobile devices */
        @media (max-width: 374px) {
          .mobile-tabs-container {
            padding-right: calc(9rem + env(safe-area-inset-right, 0px)) !important;
            max-width: calc(100% - 10rem) !important;
          }
        }
        @media (min-width: 375px) and (max-width: 413px) {
          .mobile-tabs-container {
            padding-right: calc(8.5rem + env(safe-area-inset-right, 0px)) !important;
            max-width: calc(100% - 9.5rem) !important;
          }
        }
        @media (min-width: 414px) and (max-width: 767px) {
          .mobile-tabs-container {
            padding-right: calc(8rem + env(safe-area-inset-right, 0px)) !important;
            max-width: calc(100% - 9rem) !important;
          }
        }
        @keyframes sway {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(-3deg); }
          75% { transform: rotate(3deg); }
        }
        .animate-sway {
          animation: sway 2s ease-in-out infinite;
        }
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
        .animate-breathe {
          animation: breathe 2s ease-in-out infinite;
        }
        @keyframes tppAnnBuzz {
          0%, 100% { transform: rotate(0deg) scale(1); }
          20% { transform: rotate(-10deg) scale(1.05); }
          40% { transform: rotate(8deg) scale(1.05); }
          60% { transform: rotate(-6deg) scale(1.02); }
          80% { transform: rotate(4deg) scale(1.02); }
        }
        .tpp-ann-buzz {
          animation: tppAnnBuzz 0.45s ease-in-out 4;
        }
        @keyframes tppCommunitiesOval {
          0%, 100% { transform: scale(1, 1); opacity: 0.95; }
          50% { transform: scale(1.025, 1.06); opacity: 0.4; }
        }
        .tpp-communities-spotlight-oval {
          animation: tppCommunitiesOval 1.4s ease-out infinite;
          transform-origin: center center;
        }
        @keyframes tppCommunitiesBtn {
          0%, 100% { transform: scale(1); }
          40% { transform: scale(1.03); }
          70% { transform: scale(1.01); }
        }
        .tpp-communities-spotlight-btn {
          animation: tppCommunitiesBtn 1.4s ease-in-out infinite;
        }
        @keyframes tppSettingsModeOval {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.2); opacity: 0.3; }
        }
        .tpp-settings-mode-spotlight-oval {
          animation: tppSettingsModeOval 1.4s ease-out infinite;
          transform-origin: center center;
        }
        @keyframes tppSettingsModeBtn {
          0%, 100% { transform: scale(1); }
          40% { transform: scale(1.08); }
          70% { transform: scale(1.03); }
        }
        .tpp-settings-mode-spotlight-btn {
          animation: tppSettingsModeBtn 1.4s ease-in-out infinite;
        }
        @keyframes tppMedicationTabOval {
          0%, 100% { transform: scale(1, 1); opacity: 0.95; }
          50% { transform: scale(1.025, 1.06); opacity: 0.4; }
        }
        .tpp-medication-tab-spotlight-oval {
          animation: tppMedicationTabOval 1.4s ease-out infinite;
          transform-origin: center center;
        }
        @keyframes tppMedicationTabBtn {
          0%, 100% { transform: scale(1); }
          40% { transform: scale(1.03); }
          70% { transform: scale(1.01); }
        }
        .tpp-medication-tab-spotlight-btn {
          animation: tppMedicationTabBtn 1.4s ease-in-out infinite;
        }
        @keyframes tppSuppliesTabOval {
          0%, 100% { transform: scale(1, 1); opacity: 0.95; }
          50% { transform: scale(1.025, 1.06); opacity: 0.4; }
        }
        .tpp-supplies-tab-spotlight-oval {
          animation: tppSuppliesTabOval 1.4s ease-out infinite;
          transform-origin: center center;
        }
        @keyframes tppSuppliesTabBtn {
          0%, 100% { transform: scale(1); }
          40% { transform: scale(1.03); }
          70% { transform: scale(1.01); }
        }
        .tpp-supplies-tab-spotlight-btn {
          animation: tppSuppliesTabBtn 1.4s ease-in-out infinite;
        }
      `}</style>
    </>
  );
}


