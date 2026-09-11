import React, { Suspense, useState, useEffect, useCallback, useMemo } from 'react'
import { Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import MobileNav from './components/layout/MobileSidebar'
import BottomNavigation from './components/navigation/BottomNavigation'
import GlobalFAB from './components/common/GlobalFAB'
import Topbar from './components/layout/Topbar'
import { themes, defaultThemeName } from './theme/themes'
import './styles/App.css';
import { Capacitor } from '@capacitor/core';
import { ensureNativePushRegistration, flushPendingFcmToken } from './utils/fcmToken';
import { StatusBar, Style } from '@capacitor/status-bar';
import OnboardingFlow from './components/onboarding/OnboardingFlow';
import WelcomeBackFlow from './components/reengagement/WelcomeBackFlow';
import ModeNudgeToast from './components/onboarding/ModeNudgeToast';
import UpgradeChecklistModal from './components/onboarding/UpgradeChecklistModal';
import { useAppContext } from './context/AppContext';
import { ONBOARDING_STEPS, setLocalTrackingMode, normalizeTrackingMode } from './utils/trackingMode';
import { useFirebase } from './context/FirebaseContext';
import { isAccountCreatedBeforeLocalToday } from './utils/subscriptionPlans';
import { DEV_TEST_UID, getDevOverride } from './utils/devSubscriptionOverride';
import { hasBetaLifetimeAccess } from './utils/betaAccess'; // Keep for existing beta users
import SuccessModal from './components/ui/SuccessModal';
// Beta pages no longer needed - app is live
// import BetaEnded from './pages/BetaEnded';
// import BetaClosed from './pages/BetaClosed';
import FeedbackModal from './components/common/FeedbackModal';
import InstallInstructionsModal from './components/common/InstallInstructionsModal';
import PwaUnsupportedModal from './components/common/PwaUnsupportedModal';
import NotificationPermissionPrompt from './components/common/NotificationPermissionPrompt';
import AndroidPermissionPrompt from './components/common/AndroidPermissionPrompt';
import NativeFirstLaunchPermission from './components/common/NativeFirstLaunchPermission';
import IOSInstallPrompt from './components/common/IOSInstallPrompt';
import FirstLaunchDisclaimer from './components/legal/FirstLaunchDisclaimer';
import './utils/debugUtils'; // Load debug utilities globally
import { useSubscriptionAccess, useTierAccess } from './utils/useSubscriptionAccess'
import { handleCheckoutReturn } from './utils/checkoutNavigation';
import SubscriptionModal from './components/common/SubscriptionModal';
import SubscriptionGuard from './components/common/SubscriptionGuard';
import TrialEndedModal, { hasSeenTrialEndedModal, markTrialEndedModalShown } from './components/common/TrialEndedModal';
import UpgradeModal from './components/common/UpgradeModal';
import SupportModal from './components/common/SupportModal';
import { ModernToastContainer } from './components/ui/ModernToast';
import HydrationGoalCelebration from './components/dashboard/HydrationGoalCelebration';
import GoalCelebration from './components/dashboard/GoalCelebration';
import DailyUnlockCelebration from './components/dashboard/DailyUnlockCelebration';
import StreakMilestoneCelebration from './components/dashboard/StreakMilestoneCelebration';
import { useBackButtonHandler } from './utils/useBackButtonHandler';
import UpdatePromptModal from './components/common/UpdatePromptModal';
import { checkForUpdates } from './utils/versionChecker';
import { logDataBleedDiagnostic } from './utils/dataBleedDiagnostic';
import DataRecoveryBanner from './components/common/DataRecoveryBanner';
import FeatureAnnouncementModal, { FEATURE_ANNOUNCEMENT_AUTO_SHOW_ENABLED, shouldShowAnnouncement } from './components/common/FeatureAnnouncementModal';
import { initTimezoneAutoUpdate } from './utils/timezoneAutoUpdate';
import ReConsentModal from './components/legal/ReConsentModal';
import { needsReconsentAsync, recordAgreement, AGREEMENT_TYPES, AGREEMENT_VERSIONS } from './services/agreementTracking';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import NotesModal from './components/notes/NotesModal';
import BottomSheet from './components/common/BottomSheet';
import AnnouncementsSheet from './components/announcements/AnnouncementsSheet';
import DontForgetWidget from './components/dashboard/widgets/DontForgetWidget';
import ExpandableTooltip from './components/ui/ExpandableTooltip';
import { WIDGET_TOOLTIPS } from './utils/widgetTooltips';
import { ListChecks } from '@phosphor-icons/react';
import PageIntroModal from './components/common/PageIntroModal';
import PageLoader from './components/ui/PageLoader';
import { usePageIntro } from './hooks/usePageIntro';
// referrals.js is kept for future use but link-based auto-redeem is not active.
// Referrals work via social media share cards (screenshot-based sharing).


// Mock update data for testing (local development only)
const mockUpdates = {
  optional: {
    currentVersion: "1.0.5",
    latestVersion: "1.0.6",
    urgency: "optional",
    isRequired: false,
    releaseNotes: "Bug fixes and performance improvements\nSmall UI tweaks\nBetter error handling",
    storeUrls: { ios: "https://apps.apple.com/us/app/the-pep-planner/id6759207981", android: "https://play.google.com/store/apps/details?id=com.thepepplanner.app" }
  },
  recommended: {
    currentVersion: "1.0.5",
    latestVersion: "1.1.0",
    urgency: "recommended",
    isRequired: false,
    releaseNotes: "Fixed those pesky bugs from yesterday\nMade the dashboard even prettier\nProtocols load faster now\nLots of small improvements you'll love",
    storeUrls: { ios: "https://apps.apple.com/us/app/the-pep-planner/id6759207981", android: "https://play.google.com/store/apps/details?id=com.thepepplanner.app" }
  },
  critical: {
    currentVersion: "1.0.5",
    latestVersion: "2.0.0",
    minimumVersion: "1.0.6",
    urgency: "critical",
    isRequired: true,
    releaseNotes: "Important security updates to keep your data safe\nFixed critical issues\nYour app will be safer and faster",
    storeUrls: { ios: "https://apps.apple.com/us/app/the-pep-planner/id6759207981", android: "https://play.google.com/store/apps/details?id=com.thepepplanner.app" }
  }
};

/** Bump when shipping a new “what’s new” tour so users who dismissed an older id see the next one */
const FEATURE_ANNOUNCEMENT_ID = 'v2.0-rebuild-2026-05';

/** Default `/app` main gradient for dark themes when `theme.mainGradient` is omitted (softDark). */
const DEFAULT_DARK_MAIN_GRADIENT =
  'linear-gradient(180deg, #2f3845 0%, #1c222c 50%, #151a22 100%)';

function App() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  const [themeName] = useState(() => {
    try {
      let savedTheme = localStorage.getItem('tpprover_theme') || defaultThemeName;
      // Migrate old twilight / pastel keys to pearlescent
      if (savedTheme === 'twilight' || savedTheme === 'pastel') {
        savedTheme = 'pearlescent';
        localStorage.setItem('tpprover_theme', 'pearlescent');
      }
      // Migrate users from deprecated themes to sage theme
      if (savedTheme === 'beekeeper' || savedTheme === 'mauve' || savedTheme === 'taupe') {
        localStorage.setItem('tpprover_theme', defaultThemeName);
        return defaultThemeName;
      }
      // Ensure the theme exists in the themes object
      if (themes[savedTheme]) {
        return savedTheme;
      }
      return defaultThemeName;
    } catch {
      return defaultThemeName;
    }
  });
  const theme = themes[themeName]
  const { hasMockData, user, protocols, vendors, stockpile, subscription } = useAppContext();
  const { firebaseUser } = useFirebase();
  /** Sync with subscription dev toolbar (test account only). */
  const [devSubOverride, setDevSubOverride] = useState(() => getDevOverride(firebaseUser?.uid));
  useEffect(() => {
    const uid = firebaseUser?.uid;
    const sync = () => setDevSubOverride(getDevOverride(uid));
    sync();
    window.addEventListener('tpp:dev-override-changed', sync);
    return () => window.removeEventListener('tpp:dev-override-changed', sync);
  }, [firebaseUser?.uid]);

  const {
    subscriptionInterval,
    subscriptionStatus,
    isLoading,
    isReadOnly,
    isDowngraded,
  } = useSubscriptionAccess();
  const { tier } = useTierAccess();

  /**
   * Softer page-1 copy only for long-time accounts still on a paid/founder tier.
   * Free / lapsed / downgraded / expired → full 4-bullet Research+ pitch (incl. founder lapsed).
   */
  const announcementAudienceLegacyBeforeToday = useMemo(() => {
    if (subscriptionStatus === 'trialing') return false;
    if (isDowngraded) return false;
    if (tier === 'free') return false;
    if (subscriptionStatus === 'expired') return false;
    const docStatus = String(subscription?.status ?? '').toLowerCase();
    if (docStatus === 'expired' || docStatus === 'unpaid') return false;
    if (
      import.meta.env.DEV &&
      firebaseUser?.uid === DEV_TEST_UID &&
      devSubOverride === 'founder_lapsed'
    ) {
      return false;
    }
    const bySignupDate = isAccountCreatedBeforeLocalToday(user, firebaseUser);
    const byFounderDevPreview =
      import.meta.env.DEV &&
      firebaseUser?.uid === DEV_TEST_UID &&
      devSubOverride === 'founder_active';
    return bySignupDate || byFounderDevPreview;
  }, [user, firebaseUser, devSubOverride, subscriptionStatus, isDowngraded, tier, subscription?.status]);
  const { intro: pageIntro, dismiss: dismissPageIntro, replay: replayPageIntro } = usePageIntro();
  const [showReConsentModal, setShowReConsentModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [showActionItemsSheet, setShowActionItemsSheet] = useState(false);
  const [showAnnouncementsSheet, setShowAnnouncementsSheet] = useState(false);
  const [userNotes, setUserNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tpprover_user_notes') || '[]'); } catch { return []; }
  });
  const saveUserNotes = useCallback((notes) => {
    setUserNotes(notes);
    localStorage.setItem('tpprover_user_notes', JSON.stringify(notes));
  }, []);

  useEffect(() => {
    const onNotesUpdated = (e) => {
      if (Array.isArray(e.detail?.notes)) setUserNotes(e.detail.notes);
    };
    window.addEventListener('tpp:user-notes-updated', onNotesUpdated);
    return () => window.removeEventListener('tpp:user-notes-updated', onNotesUpdated);
  }, []);

  // Signal Capgo that the JS bundle loaded successfully — prevents auto-rollback.
  // Save a pre-OTA snapshot first so users have a restore point for the old bundle.
  useEffect(() => {
    const signalReady = async () => {
      try {
        const userStr = localStorage.getItem('tpprover_user');
        const parsedUser = userStr ? JSON.parse(userStr) : null;
        if (parsedUser?.uid) {
          const { saveCloudSnapshot } = await import('./services/cloudStorage');
          const snapshotData = {};
          const keys = [
            'tpprover_protocols', 'tpprover_orders', 'tpprover_stockpile',
            'tpprover_vendors', 'tpprover_supplements', 'tpprover_recon_items',
            'tpprover_recon_history', 'tpprover_metrics', 'tpprover_scheduled_buys',
            'tpprover_calendar_notes', 'tpprover_injection_history'
          ];
          keys.forEach(k => {
            try { const v = localStorage.getItem(k); if (v) snapshotData[k.replace('tpprover_', '')] = JSON.parse(v); } catch {}
          });
          await Promise.race([
            saveCloudSnapshot(parsedUser.uid, snapshotData, 'pre-ota-update'),
            new Promise(resolve => setTimeout(resolve, 5000))
          ]);
        }
      } catch { /* best-effort; never block app readiness */ }
      CapacitorUpdater.notifyAppReady();
    };
    signalReady();
  }, []);

  // Load Firestore-backed feature flags (admin kill-switches) on mount.
  useEffect(() => {
    import('./services/remoteFlags').then(({ loadRemoteFlags }) => {
      loadRemoteFlags().catch(() => { /* offline or no Firestore access — use defaults */ });
    });
  }, []);

  // Note: referral sharing is social-media / share-card based.
  // Users share screenshots of their tracking data to promote the app visually.
  // The link-based auto-redeem flow has been removed per product decision.

  // Global listener so Research Notes can be opened from any page via Topbar
  useEffect(() => {
    const handler = () => setShowNotesModal(true);
    window.addEventListener('tpp:open-research-notes', handler);
    return () => window.removeEventListener('tpp:open-research-notes', handler);
  }, []);

  // Global To-Do / Action Items sheet (Topbar ClipboardList) — must work on every /app route
  useEffect(() => {
    const handler = () => setShowActionItemsSheet(true);
    window.addEventListener('tpp:open-action-items', handler);
    return () => window.removeEventListener('tpp:open-action-items', handler);
  }, []);

  // Global Announcements bottom sheet (Topbar newspaper icon + /app/announcements redirect)
  useEffect(() => {
    const handler = () => setShowAnnouncementsSheet(true);
    window.addEventListener('tpp:open-announcements', handler);
    return () => window.removeEventListener('tpp:open-announcements', handler);
  }, []);

  // Apply dark mode class + data-theme on <html> for ALL themes (enables [data-theme="pearlescent"] CSS)
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', themeName);
    if (theme.isDark) {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
  }, [theme, themeName]);

  // Initialize status bar on mount - disable overlay so WebView starts below status bar
  useEffect(() => {
    const initStatusBar = async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        await StatusBar.setOverlaysWebView({ overlay: false });
        await StatusBar.show();

        // Android 15+ (API 35) may enforce edge-to-edge despite opt-out.
        // Detect if overlay is still active and apply a manual safe area.
        if (Capacitor.getPlatform() === 'android') {
          await new Promise(r => setTimeout(r, 150));
          try {
            const info = await StatusBar.getInfo();
            if (info.overlays) {
              document.documentElement.style.setProperty('--android-safe-area-top', '36px');
            }
          } catch {
            // getInfo not available - apply safe default for Android
            document.documentElement.style.setProperty('--android-safe-area-top', '36px');
          }
        }
      } catch (e) {
        console.warn('StatusBar init error:', e);
        if (Capacitor.getPlatform() === 'android') {
          document.documentElement.style.setProperty('--android-safe-area-top', '36px');
        }
      }
    };
    initStatusBar();
  }, []);

  // Update status bar style based on theme (mobile apps only)
  useEffect(() => {
    const updateStatusBar = async () => {
      if (!Capacitor.isNativePlatform()) return;

      try {
        const isDarkTheme = theme.isDark;
        const statusBarStyle = isDarkTheme ? Style.Dark : Style.Light;
        const statusBarBgColor = isDarkTheme
          ? (theme.statusBarColor ?? '#12161e')
          : theme.background;

        await StatusBar.setStyle({ style: statusBarStyle });
        await StatusBar.setBackgroundColor({ color: statusBarBgColor });
      } catch (error) {
        console.warn('Status bar update skipped:', error.message);
      }
    };

    updateStatusBar();
  }, [theme]);

  // Auto-update timezone when it changes (travel, daylight saving)
  useEffect(() => {
    const cleanup = initTimezoneAutoUpdate();
    return cleanup;
  }, []);

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingResumeStep, setOnboardingResumeStep] = useState(ONBOARDING_STEPS.SPLASH);
  // null until the user explicitly picks Simple/Advanced — never default to 'simple'
  // or the chooser mounts pre-selected and looks "skipped".
  const [onboardingTrackingMode, setOnboardingTrackingMode] = useState(null);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);
  const [welcomeBackGap, setWelcomeBackGap] = useState(null);
  const [showTrialEndedModal, setShowTrialEndedModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // One-time "trial ended" modal — fires once per user account on their first
  // login after the trial wraps up. Gated by localStorage so it never repeats.
  useEffect(() => {
    if (isLoading) return;
    if (!isDowngraded) return;
    const uid = user?.uid;
    if (!uid) return;
    if (hasSeenTrialEndedModal(uid)) return;
    const t = setTimeout(() => {
      markTrialEndedModalShown(uid);
      setShowTrialEndedModal(true);
    }, 1200);
    return () => clearTimeout(t);
  }, [isLoading, isDowngraded, user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();
  const [showDemoBanner, setShowDemoBanner] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isPwaSupported, setIsPwaSupported] = useState(false);
  const [isPwaInstalled, setIsPwaInstalled] = useState(false);
  const [showDemoSuccessModal, setShowDemoSuccessModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showUnsupportedModal, setShowUnsupportedModal] = useState(false);
  const [topbarTabs, setTopbarTabs] = useState(null);
  const [topbarAutoSave, setTopbarAutoSave] = useState(null);
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [showFeatureAnnouncement, setShowFeatureAnnouncement] = useState(false);
  const [featureAnnouncementDevPreview, setFeatureAnnouncementDevPreview] = useState(false);
  const [devPageLoaderPreview, setDevPageLoaderPreview] = useState(null); // null | 'route' | 'fullscreen'

  // Hardware back button handler for mobile apps
  useBackButtonHandler();

  // Check for app updates on launch (NATIVE APPS ONLY - not PWA)
  // PWA users get instant updates automatically via service worker
  // They only see the FeatureAnnouncementModal (What's New modal)
  useEffect(() => {
    const performUpdateCheck = async () => {
      try {
        // SAFETY CHECK: Only check for updates on native apps (Android/iOS)
        // checkForUpdates() returns null for PWA, but double-check here for clarity
        const isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
        if (!isNative) {
          return; // PWA users never see UpdatePromptModal
        }
        
        const update = await checkForUpdates();
        if (update) {
          console.log('📱 Native app update available - showing update prompt');
          setUpdateInfo(update);
          setShowUpdatePrompt(true);
        }
      } catch (error) {
        console.error('Error checking for updates:', error);
      }
    };
    
    // Check after a short delay to not interfere with initial load
    const timeoutId = setTimeout(performUpdateCheck, 2000);
    return () => clearTimeout(timeoutId);
  }, []);

  // What's New auto-show — gated by FEATURE_ANNOUNCEMENT_AUTO_SHOW_ENABLED.
  // Topbar preview still works regardless.
  useEffect(() => {
    if (!FEATURE_ANNOUNCEMENT_AUTO_SHOW_ENABLED) return undefined;
    const checkFeatureAnnouncement = () => {
      if (showUpdatePrompt) return; // store update takes priority
      if (shouldShowAnnouncement(FEATURE_ANNOUNCEMENT_ID)) {
        const timeoutId = setTimeout(() => {
          setFeatureAnnouncementDevPreview(false);
          setShowFeatureAnnouncement(true);
        }, 3000);
        return () => clearTimeout(timeoutId);
      }
    };
    return checkFeatureAnnouncement();
  }, [showUpdatePrompt]);

  // Initialize push notifications on app start (if user is logged in and permissions granted)
  useEffect(() => {
    const uid = firebaseUser?.uid;
    if (!uid) return;

    // Expose UID for token helpers (avoids email-keyed Firestore docs)
    try {
      window.__TPP_AUTH_UID__ = uid;
    } catch {
      // ignore
    }

    const initializePushNotifications = async () => {
      try {
        // Flush token captured before login (first-launch permission flow)
        await flushPendingFcmToken(uid);

        if (!Capacitor.isNativePlatform()) return;

        console.log('📱 Ensuring FCM registration for', uid);
        const result = await ensureNativePushRegistration(uid);
        if (!result?.save?.success && result?.error) {
          console.warn('📱 Push registration result:', result.error || result);
        }
      } catch (error) {
        console.warn('Push notifications initialization skipped:', error.message);
      }
    };

    const timeoutId = setTimeout(initializePushNotifications, 2000);
    return () => clearTimeout(timeoutId);
  }, [firebaseUser?.uid]);

  // Native push tap → navigate / open Support modal
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;
    let cancelled = false;

    const routeFromPushData = (data = {}) => {
      const path = String(data.path || data.appUrl || '').trim();
      const templateType = String(data.templateType || data._templateType || data.tag || '').trim();
      const isSupport =
        templateType === 'supportTicketReply' ||
        path.includes('/app/support') ||
        path === '/support';

      if (isSupport) {
        window.dispatchEvent(new CustomEvent('tpp:open-support'));
        try {
          navigate('/app/dashboard', { replace: false });
        } catch {
          /* ignore */
        }
        return;
      }

      if (path.startsWith('/')) {
        try {
          navigate(path);
        } catch {
          /* ignore */
        }
      }
    };

    (async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        if (cancelled) return;
        handle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
          const data = action?.notification?.data || {};
          routeFromPushData(data);
        });
      } catch (err) {
        console.warn('📱 Push action listener not available:', err?.message || err);
      }
    })();

    return () => {
      cancelled = true;
      try {
        handle?.remove?.();
      } catch {
        /* ignore */
      }
    };
  }, [navigate]);

  // Test function to trigger update modal
  const testUpdateModal = useCallback((type = 'recommended') => {
    const mockData = mockUpdates[type] || mockUpdates.recommended;
    console.log('🧪 Testing update prompt:', type, mockData);
    setUpdateInfo(mockData);
    setShowUpdatePrompt(true);
  }, []);

  // TEST HELPER: Manual test trigger (remove in production)
  useEffect(() => {
    window.testUpdatePrompt = testUpdateModal;
    window.testWelcomeModal = () => {
      console.log('🧪 Testing onboarding flow');
      setOnboardingResumeStep(ONBOARDING_STEPS.SPLASH);
      setOnboardingTrackingMode(null);
      setShowOnboarding(true);
    };
    window.testOnboardingFlow = () => {
      setOnboardingResumeStep(ONBOARDING_STEPS.SPLASH);
      setOnboardingTrackingMode(null);
      setShowOnboarding(true);
    };
    window.testFeatureAnnouncement = () => {
      console.log('🧪 Testing feature announcement');
      setFeatureAnnouncementDevPreview(true);
      setShowFeatureAnnouncement(true);
    };
    window.testTrialEndedModal = () => {
      console.log('🧪 Testing trial ended modal');
      setShowTrialEndedModal(true);
    };
    // Utility to reset announcement (for testing)
    window.resetFeatureAnnouncement = async () => {
      const { resetAnnouncement } = await import('./components/common/FeatureAnnouncementModal');
      resetAnnouncement(FEATURE_ANNOUNCEMENT_ID);
      console.log('✅ Feature announcement reset - refresh to see it again');
    };
    // Test error boundary
    window.testErrorBoundary = () => {
      console.log('🧪 Triggering error boundary...');
      throw new Error('Test error - This will trigger the ChunkErrorBoundary');
    };
  }, [testUpdateModal]);

  // Dev-only: preview update-related modals from Topbar (see Topbar "Update modals" menu)
  useEffect(() => {
    if (!import.meta.env.DEV) return undefined;
    let pageLoaderTimer;
    const closeOtherUpdatePreviews = () => {
      setShowUpdatePrompt(false);
      setUpdateInfo(null);
      setShowFeatureAnnouncement(false);
      setFeatureAnnouncementDevPreview(false);
      setShowReConsentModal(false);
    };
    const showPageLoaderPreview = (mode) => {
      clearTimeout(pageLoaderTimer);
      setDevPageLoaderPreview(mode);
      pageLoaderTimer = setTimeout(() => setDevPageLoaderPreview(null), 2000);
    };
    const onPreview = (e) => {
      const kind = e.detail?.kind;
      closeOtherUpdatePreviews();
      switch (kind) {
        case 'store-optional':
          testUpdateModal('optional');
          break;
        case 'store-recommended':
          testUpdateModal('recommended');
          break;
        case 'store-critical':
          testUpdateModal('critical');
          break;
        case 'feature-announcement':
          setFeatureAnnouncementDevPreview(true);
          setShowFeatureAnnouncement(true);
          break;
        case 'reconsent':
          setShowReConsentModal(true);
          break;
        case 'page-intro':
          replayPageIntro();
          break;
        case 'onboarding':
          setOnboardingResumeStep(ONBOARDING_STEPS.SPLASH);
          setOnboardingTrackingMode(null);
          setShowOnboarding(true);
          break;
        case 'page-loader':
          showPageLoaderPreview('route');
          break;
        case 'page-loader-fullscreen':
          showPageLoaderPreview('fullscreen');
          break;
        default:
          break;
      }
    };
    window.addEventListener('tpp:dev-preview-user-update-modal', onPreview);
    return () => {
      clearTimeout(pageLoaderTimer);
      window.removeEventListener('tpp:dev-preview-user-update-modal', onPreview);
    };
  }, [testUpdateModal, replayPageIntro]);

  // App is now live - no beta restrictions

  useEffect(() => {
    // Force onboarding if query param is present
    if (searchParams.get('testWelcome') === 'true' || searchParams.get('testOnboarding') === 'true') {
      setOnboardingResumeStep(ONBOARDING_STEPS.SPLASH);
      setOnboardingTrackingMode(null);
      setShowOnboarding(true);
    }
    if (searchParams.get('replayOnboarding') === 'true') {
      setOnboardingResumeStep(ONBOARDING_STEPS.SPLASH);
      setOnboardingTrackingMode(null);
      setShowOnboarding(true);
    }
  }, [searchParams]);

  // Replay onboarding from Settings
  useEffect(() => {
    const onReplay = () => {
      setOnboardingResumeStep(ONBOARDING_STEPS.SPLASH);
      setOnboardingTrackingMode(null);
      setShowOnboarding(true);
    };
    window.addEventListener('tpp:replay-onboarding', onReplay);
    return () => window.removeEventListener('tpp:replay-onboarding', onReplay);
  }, []);

  useEffect(() => {
    // A simple check for service worker support can be an indicator of PWA capability.
    if ('serviceWorker' in navigator) {
        setIsPwaSupported(true);
    }

    // Check if the app is running in standalone mode (i.e., installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
        setIsPwaInstalled(true);
    }
  }, []);

  // Handle checkout return navigation at the App level
  useEffect(() => {
    handleCheckoutReturn(navigate, searchParams);
  }, [navigate, searchParams]);

  // Data bleed diagnostic in development mode
  useEffect(() => {
    if (import.meta.env.DEV && user) {
      // Run diagnostic after a short delay to allow data to load
      const timeoutId = setTimeout(() => {
        logDataBleedDiagnostic();
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [user]);

  useEffect(() => {
    // First-run onboarding for new Firebase users
    if (!user) return;

    const checkOnboarding = async () => {
      try {
        const initialLoadInProgress = sessionStorage.getItem('tpp_initial_data_loading');
        if (initialLoadInProgress === 'true') {
          setTimeout(checkOnboarding, 200);
          return;
        }

        // Prefer live Firebase user over localStorage token — token can lag a tick after signup.
        const isFirebaseUser =
          Boolean(user?.uid) ||
          localStorage.getItem('tpprover_auth_token') === 'firebase_token';
        const { loadUserState } = await import('./services/cloudStorage');

        if (user?.uid) {
          const userState = await loadUserState(user.uid);
          const hasOnboarded = userState?.hasOnboarded || false;
          const resumeStep = userState?.onboardingStep || ONBOARDING_STEPS.SPLASH;
          // Only treat an explicit simple/advanced cloud value as a real chooser pick.
          // Do NOT use normalizeTrackingMode() here — it coerces missing → 'simple'.
          const rawMode = userState?.trackingMode;
          const hasExplicitModeChoice =
            rawMode === 'simple' ||
            rawMode === 'advanced' ||
            rawMode === 'single_focus' ||
            rawMode === 'multi_protocol' ||
            rawMode === 'guided';
          const mode = hasExplicitModeChoice ? normalizeTrackingMode(rawMode) : null;
          const pastChooserSteps = [
            ONBOARDING_STEPS.FIRST_PROTOCOL,
            ONBOARDING_STEPS.SETUP_CHECKLIST,
            ONBOARDING_STEPS.TRIAL_PRICING,
          ];
          const hasSelectedMode =
            hasExplicitModeChoice &&
            (resumeStep === ONBOARDING_STEPS.DONE || pastChooserSteps.includes(resumeStep));

          if (hasSelectedMode) {
            setLocalTrackingMode(mode, { source: 'hydrate' });
            setOnboardingTrackingMode(mode);
          } else {
            // Reset to null for users who haven't selected yet, so the chooser doesn't pre-select
            setOnboardingTrackingMode(null);
          }

          if (hasOnboarded || resumeStep === ONBOARDING_STEPS.DONE) {
            return;
          }

          // ─── Old-user grandfather gate ───────────────────────────────────────
          // The ONLY users we skip here are genuinely old accounts (> 7 days) that
          // have evidence they already used the app (trackingMode saved in cloud).
          // This covers users who existed before onboarding was introduced.
          //
          // We do NOT use a short age window (e.g. 15 min) because new users who
          // confirm email and log back in minutes/hours later would be incorrectly
          // flagged as "existing" and silently skipped.
          const creationTime = user?.metadata?.creationTime
            ? new Date(user.metadata.creationTime).getTime()
            : null;
          const accountAgeMs = creationTime ? Date.now() - creationTime : 0;
          const isEstablishedOldUser =
            accountAgeMs > 7 * 24 * 60 * 60 * 1000 && // older than 7 days
            hasExplicitModeChoice;                       // AND already has a mode saved

          if (isEstablishedOldUser) {
            // Pre-onboarding existing user — grandfather them in silently.
            try {
              const { saveUserState } = await import('./services/cloudStorage');
              await saveUserState(user.uid, { hasOnboarded: true });
            } catch { /* non-critical */ }
            return;
          }

          // ─── Everyone else who hasn't onboarded: show the flow ───────────────
          // This covers:
          //   • Brand new signups (just signed up, < 15 min old)
          //   • Users who confirmed email and logged back in (any age < 7 days)
          //   • Users mid-flow resuming from another device
          sessionStorage.removeItem('tpp_welcome_shown');

          if (isFirebaseUser) {
            // Determine start step:
            //   - If resuming a mid-flow step (past SPLASH, not DONE) → resume it,
            //     but clamp to RESEARCHER_TYPE if they passed chooser without a real pick.
            //   - Otherwise always start at SPLASH.
            const isResumingInProgress =
              resumeStep &&
              resumeStep !== ONBOARDING_STEPS.SPLASH &&
              resumeStep !== ONBOARDING_STEPS.DONE;

            let startStep = ONBOARDING_STEPS.SPLASH;
            if (isResumingInProgress) {
              if (pastChooserSteps.includes(resumeStep) && !hasExplicitModeChoice) {
                startStep = ONBOARDING_STEPS.RESEARCHER_TYPE;
              } else {
                startStep = resumeStep;
              }
            }

            console.log('✅ Showing onboarding', {
              startStep,
              accountAgeDays: creationTime ? +(accountAgeMs / 86400000).toFixed(1) : 'unknown',
              hasExplicitModeChoice,
              isResumingInProgress,
            });

            setOnboardingResumeStep(startStep);
            setShowOnboarding(true);
          }
        }
      } catch (error) {
        console.error('❌ Failed to check onboarding state:', error);
      }
    };

    const timeoutId = setTimeout(checkOnboarding, 300);
    return () => clearTimeout(timeoutId);
  }, [user]);

  // Welcome-back / re-engagement: returning users inactive 30+ days
  useEffect(() => {
    if (!user?.uid) {
      setShowWelcomeBack(false);
      setWelcomeBackGap(null);
      return;
    }
    if (showOnboarding) return;

    let cancelled = false;

    const evaluateGap = async (gap) => {
      if (cancelled || !gap || !user?.uid) return;
      try {
        const { loadUserState } = await import('./services/cloudStorage');
        const { shouldShowWelcomeBack } = await import('./utils/reengagement');
        const userState = await loadUserState(user.uid);
        if (cancelled) return;
        if (!userState?.hasOnboarded) return;
        if (shouldShowWelcomeBack(gap, userState?.reengagement)) {
          setWelcomeBackGap(gap);
          setShowWelcomeBack(true);
        }
      } catch (e) {
        console.warn('Welcome-back check failed:', e);
      }
    };

    const setup = async () => {
      const {
        subscribeToGapResult,
        getPendingGapResult,
        setPendingGapResult,
      } = await import('./utils/reengagement');

      const unsub = subscribeToGapResult((gap) => {
        if (gap?.uid === user.uid) evaluateGap(gap);
      }, user.uid);

      const pending = getPendingGapResult(user.uid);
      if (pending) {
        evaluateGap(pending);
      } else {
        // Session restore path — loginUser may not have run
        try {
          const { trackEngagement } = await import('./utils/engagementTracking');
          const gap = await trackEngagement(user.uid, 'login');
          if (gap && !cancelled) {
            setPendingGapResult(user.uid, gap);
          }
        } catch (_) {}
      }

      return unsub;
    };

    let unsub = () => {};
    setup().then((fn) => {
      if (typeof fn === 'function') unsub = fn;
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [user?.uid, showOnboarding]);

  // Re-consent: show modal when user has not accepted current ToS/Privacy versions (uses Firebase for cross-device)
  // Suppressed while onboarding is open (user just agreed during signup) and for
  // accounts younger than 24 hours (agreement was just recorded moments ago — even
  // if localStorage was cleared mid-redirect, Firebase will confirm it).
  useEffect(() => {
    if (!user?.uid || !location.pathname.startsWith('/app')) return;
    if (showOnboarding) return; // don't stack on top of onboarding
    const creationTime = user?.metadata?.creationTime
      ? new Date(user.metadata.creationTime).getTime()
      : null;
    const accountAgeMs = creationTime ? Date.now() - creationTime : Infinity;
    if (accountAgeMs < 24 * 60 * 60 * 1000) return; // < 24 h old — just signed up
    let cancelled = false;
    needsReconsentAsync(user?.email ?? null).then((needed) => {
      if (!cancelled) setShowReConsentModal(needed);
    });
    return () => { cancelled = true; };
  }, [user?.uid, user?.email, user?.metadata?.creationTime, location.pathname, showOnboarding]);

  const handleReConsentAgree = async () => {
    try {
      await recordAgreement(
        AGREEMENT_TYPES.TERMS_UPDATE,
        AGREEMENT_VERSIONS.TERMS_OF_SERVICE,
        { contentUpdateDate: AGREEMENT_VERSIONS.TERMS_OF_SERVICE.split('-')[1] + '-' + AGREEMENT_VERSIONS.TERMS_OF_SERVICE.split('-')[2] },
        user?.email
      );
      await recordAgreement(
        AGREEMENT_TYPES.PRIVACY_UPDATE,
        AGREEMENT_VERSIONS.PRIVACY_POLICY,
        { contentUpdateDate: AGREEMENT_VERSIONS.PRIVACY_POLICY.split('-')[1] + '-' + AGREEMENT_VERSIONS.PRIVACY_POLICY.split('-')[2] },
        user?.email
      );
      setShowReConsentModal(false);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Thanks for accepting our updated Terms and Privacy Policy.', type: 'success' } }));
    } catch (error) {
      console.error('Error recording re-consent:', error);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Something went wrong. Please try again.', type: 'error' } }));
    }
  };

  useEffect(() => {
    const bannerDismissed = localStorage.getItem('tpprover_sample_banner_dismissed');
    const dataCleared = localStorage.getItem('tpprover_sample_data_cleared');
    
    // Show banner if there's mock data and it hasn't been dismissed or cleared
    if (hasMockData && bannerDismissed !== 'true' && dataCleared !== 'true') {
        setShowDemoBanner(true);
    } else {
        setShowDemoBanner(false);
    }
  }, [hasMockData]);

  // Listen for demo data success events from banner
  useEffect(() => {
    const handleDemoSuccess = () => {
      setShowDemoSuccessModal(true);
    };
    window.addEventListener('sample-data-cleared', handleDemoSuccess);
    return () => window.removeEventListener('sample-data-cleared', handleDemoSuccess);
  }, []);


  // App is now live - no beta restrictions
  // Beta testers maintain their lifetime access

  // Capture PWA install prompt for later use
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Listen for topbar tabs from pages
  useEffect(() => {
    const handleSetTabs = (event) => {
      setTopbarTabs(event.detail);
    };
    const handleClearTabs = () => {
      setTopbarTabs(null);
    };
    const handleSetAutoSave = (event) => {
      setTopbarAutoSave(event.detail.autoSaveIndicator);
    };
    const handleClearAutoSave = () => {
      setTopbarAutoSave(null);
    };
    const handleOpenSupport = () => {
      setShowSupportModal(true);
    };
    window.addEventListener('tpp:set-topbar-tabs', handleSetTabs);
    window.addEventListener('tpp:clear-topbar-tabs', handleClearTabs);
    window.addEventListener('tpp:set-topbar-autosave', handleSetAutoSave);
    window.addEventListener('tpp:clear-topbar-autosave', handleClearAutoSave);
    window.addEventListener('tpp:open-support', handleOpenSupport);
    return () => {
      window.removeEventListener('tpp:set-topbar-tabs', handleSetTabs);
      window.removeEventListener('tpp:clear-topbar-tabs', handleClearTabs);
      window.removeEventListener('tpp:set-topbar-autosave', handleSetAutoSave);
      window.removeEventListener('tpp:clear-topbar-autosave', handleClearAutoSave);
      window.removeEventListener('tpp:open-support', handleOpenSupport);
    };
  }, []);

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
    sessionStorage.setItem('tpp_welcome_shown', 'true');
  };

  const handleWelcomeBackComplete = () => {
    setShowWelcomeBack(false);
    setWelcomeBackGap(null);
  };

  const handleWelcomeBackDecline = () => {
    setShowWelcomeBack(false);
    setWelcomeBackGap(null);
  };

  const handleWelcomeBackDismiss = () => {
    setShowWelcomeBack(false);
    // Keep gap so it can reappear next session via pending status
  };


  const glossaryTerm = new URLSearchParams(window.location.search).get('glossary');

  const handleModalInstall = () => {
    setShowInstallModal(false);
    if (installPrompt) {
      installPrompt.prompt();
    }
  };

  return (
    <div className={`app-layout h-screen flex font-sans antialiased w-full max-w-full overflow-x-hidden ${Capacitor.isNativePlatform() ? 'native-app' : ''}`} style={{ backgroundColor: theme.background, boxSizing: 'border-box' }}>
      <Sidebar theme={theme} installPrompt={installPrompt} isPwaSupported={isPwaSupported} isPwaInstalled={isPwaInstalled} onSupportClick={() => setShowSupportModal(true)} />
        <div className="relative flex-1 flex flex-col min-w-0 w-full max-w-full overflow-hidden" style={{
          boxSizing: 'border-box',
        }}>
          <div className="absolute top-0 left-0 right-0 z-30">
            <Topbar 
              theme={theme} 
              onMenuClick={() => setMobileMenuOpen(true)}
              tabs={topbarTabs?.tabs}
              activeTab={topbarTabs?.activeTab}
              onTabChange={topbarTabs?.onTabChange}
              onActionClick={topbarTabs?.onActionClick}
              actionItems={topbarTabs?.actionItems}
              actionDisabled={topbarTabs?.actionDisabled}
              autoSaveIndicator={topbarAutoSave}
              showSampleData={showDemoBanner}
            />
          </div>

          <main className={`flex-1 main-content min-h-0 w-full max-w-full relative ${location.pathname.includes('/calendar') ? 'overflow-hidden flex flex-col calendar-page' : location.pathname.includes('/insights') ? 'overflow-hidden flex flex-col insights-page min-h-0' : 'overflow-y-auto'}`} 
            style={{ 
              background: location.pathname.startsWith('/app')
                ? (theme.isDark 
                    ? (theme.mainGradient ?? DEFAULT_DARK_MAIN_GRADIENT)
                    : theme.lightMainGradient
                      ? theme.lightMainGradient
                      : theme.name === 'Sage'
                        ? 'linear-gradient(180deg, #DAE0DB 0%, #D2DAD4 25%, #CCD5CD 50%, #D2DAD4 75%, #DAE0DB 100%)'
                        : `linear-gradient(180deg, ${theme.accent} 0%, ${theme.primaryLight}BB 30%, ${theme.primary}88 55%, ${theme.primaryLight}BB 75%, ${theme.accent} 100%)`)
                : theme.background, 
              color: theme.text, 
              minWidth: 0, 
              boxSizing: 'border-box',
              paddingTop: Capacitor.isNativePlatform() ? 'calc(3.5rem + var(--safe-area-top, 0px))' : '3.5rem',
              paddingBottom: location.pathname.startsWith('/app') 
                ? (location.pathname.includes('/calendar') 
                    ? 'calc(4.5rem + env(safe-area-inset-bottom, 0px))' 
                    : '4.5rem') 
                : '0'
            }}>
            
            <Suspense fallback={<PageLoader theme={theme} />}>
              <SubscriptionGuard>
                <div
                  className={
                    location.pathname.includes('/insights')
                      ? 'flex flex-col flex-1 min-h-0 w-full min-w-0 overflow-hidden h-full'
                      : 'contents'
                  }
                >
                  <Outlet context={{ theme, installPrompt }} />
                </div>
              </SubscriptionGuard>
            </Suspense>
            {devPageLoaderPreview === 'route' && (
              <div
                className="absolute inset-0 z-40 flex items-center justify-center"
                style={{
                  background: theme.isDark
                    ? (theme.mainGradient ?? 'rgba(0,0,0,0.85)')
                    : (theme.background || '#F5F5F0'),
                  paddingTop: Capacitor.isNativePlatform() ? 'calc(3.5rem + var(--safe-area-top, 0px))' : '3.5rem',
                  paddingBottom: '4.5rem',
                }}
              >
                <PageLoader theme={theme} />
              </div>
            )}
          </main>
          {devPageLoaderPreview === 'fullscreen' && (
            <div className="fixed inset-0 z-[10000]">
              <PageLoader theme={theme} fullScreen />
            </div>
          )}
          
          {/* Bottom Navigation - Mobile & Tablet Only - Only show on protected /app routes */}
          {location.pathname.startsWith('/app') && (
            <div className="absolute bottom-0 left-0 right-0 z-[9995]">
              <BottomNavigation theme={theme} />
            </div>
          )}

          {/* Global FAB — quick actions on all /app pages */}
          {location.pathname.startsWith('/app') && (
            <GlobalFAB theme={theme} />
          )}
        </div>
      <MobileNav 
        theme={theme} 
        open={mobileMenuOpen} 
        onClose={() => setMobileMenuOpen(false)}
        onSupportClick={() => setShowSupportModal(true)}
      />
      <OnboardingFlow
        key={showOnboarding ? `onboarding-${user?.uid || 'anon'}-${onboardingResumeStep}` : 'onboarding-closed'}
        open={showOnboarding}
        theme={theme}
        userId={user?.uid}
        initialStep={onboardingResumeStep}
        initialTrackingMode={onboardingTrackingMode}
        onComplete={handleOnboardingComplete}
      />
      <WelcomeBackFlow
        open={showWelcomeBack}
        theme={theme}
        userId={user?.uid}
        lastGapDate={welcomeBackGap?.previousLastActiveDate}
        daysAway={welcomeBackGap?.daysSinceLastActive}
        onComplete={handleWelcomeBackComplete}
        onDecline={handleWelcomeBackDecline}
        onDismiss={handleWelcomeBackDismiss}
      />
      <ModeNudgeToast theme={theme} />
      <UpgradeChecklistModal theme={theme} />
      <TrialEndedModal
        open={showTrialEndedModal}
        onClose={() => setShowTrialEndedModal(false)}
        onSubscribe={() => setShowUpgradeModal(true)}
        theme={theme}
      />
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        theme={theme}
      />
      <SuccessModal
        open={showDemoSuccessModal}
        onClose={() => setShowDemoSuccessModal(false)}
        title="Sample Data Removed!"
        message="All sample data has been successfully removed. Your personal entries remain safe and intact."
        theme={theme}
      />
      <FeedbackModal 
        open={showFeedbackModal} 
        onClose={() => setShowFeedbackModal(false)} 
        theme={theme} 
      />
      <InstallInstructionsModal 
        open={showInstallModal} 
        onClose={() => setShowInstallModal(false)} 
        onInstall={handleModalInstall} 
        theme={theme} 
      />
      <PwaUnsupportedModal 
        open={showUnsupportedModal} 
        onClose={() => setShowUnsupportedModal(false)} 
        theme={theme} 
      />
      <FirstLaunchDisclaimer 
        open={false} 
        onAccept={() => {}} 
      />
      {/* Native first launch permission - shows IMMEDIATELY on first app open from Play Store/App Store */}
      <NativeFirstLaunchPermission theme={theme} />
      {/* PWA notification prompt - for web users, shows after 2 minutes */}
      <NotificationPermissionPrompt theme={theme} />
      {/* Android follow-up prompt - only shows if first launch was dismissed and user is logged in */}
      <AndroidPermissionPrompt theme={theme} />
      <IOSInstallPrompt theme={theme} />
      <SubscriptionModal 
        isOpen={showSubscriptionModal}
        onClose={() => setShowSubscriptionModal(false)}
        theme={theme}
        currentPlan={subscriptionInterval}
      />
      <SupportModal 
        open={showSupportModal}
        onClose={() => setShowSupportModal(false)}
        theme={theme}
      />
      
      {/* NATIVE APPS ONLY: Update prompt modal for App Store/Play Store updates */}
      {/* PWA users never see this - they get automatic updates via service worker */}
      <UpdatePromptModal
        open={showUpdatePrompt}
        onClose={() => setShowUpdatePrompt(false)}
        updateInfo={updateInfo}
        theme={theme}
      />
      
      {/* ALL USERS: Feature announcement modal (What's New style) */}
      {/* This is the ONLY update-related modal PWA users see */}
      <FeatureAnnouncementModal
        open={showFeatureAnnouncement}
        onClose={() => {
          setShowFeatureAnnouncement(false);
          setFeatureAnnouncementDevPreview(false);
        }}
        announcementId={FEATURE_ANNOUNCEMENT_ID}
        previewMode={featureAnnouncementDevPreview}
        audienceLegacyBeforeToday={announcementAudienceLegacyBeforeToday}
        theme={theme}
      />
      
      {/* Re-consent: existing users must accept updated ToS/Privacy after legal/version update */}
      <ReConsentModal
        open={showReConsentModal}
        onClose={() => setShowReConsentModal(false)}
        onAgree={handleReConsentAgree}
        theme={theme}
      />

      {/* Global To-Do sheet — same content as dashboard; opens from Topbar on any page */}
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
          vendors={vendors || []}
          stockpile={stockpile || []}
          protocols={protocols || []}
          onCompleteVendor={() => {
            setShowActionItemsSheet(false);
            navigate('/app/vendors');
          }}
          onViewAllVendors={() => {
            setShowActionItemsSheet(false);
            navigate('/app/vendors');
          }}
          onOpenFollowUp={(protocolId, historyId) => {
            setShowActionItemsSheet(false);
            navigate('/app/protocols', {
              state: {
                openFollowUpProtocolId: protocolId,
                openFollowUpHistoryId: historyId,
              },
            });
          }}
          onEditStockpileItem={(item) => {
            setShowActionItemsSheet(false);
            navigate('/app/stockpile', { state: { openStockpileId: item?.id } });
          }}
          onClose={() => setShowActionItemsSheet(false)}
          isReadOnly={isReadOnly}
          onUpgrade={() => setShowSubscriptionModal(true)}
          hideHeader
        />
      </BottomSheet>

      <AnnouncementsSheet
        open={showAnnouncementsSheet}
        onClose={() => setShowAnnouncementsSheet(false)}
        theme={theme}
      />

      {/* Global Research Notes modal — available on every page */}
      <NotesModal
        isOpen={showNotesModal}
        onClose={() => setShowNotesModal(false)}
        theme={theme}
        notes={userNotes}
        onNotesChange={saveUserNotes}
        protocols={protocols || []}
      />
      
      {/* First-view page intro modal */}
      <PageIntroModal
        intro={pageIntro}
        onDismiss={dismissPageIntro}
        theme={theme}
      />

      {/* Post-update data recovery banner */}
      <DataRecoveryBanner theme={theme} />

      {/* Toast Notifications */}
      <ModernToastContainer theme={theme} />

      {/* Celebration popups (also previewable from Topbar phone menu) */}
      <HydrationGoalCelebration theme={theme} />
      <GoalCelebration theme={theme} />
      <DailyUnlockCelebration theme={theme} />
      <StreakMilestoneCelebration theme={theme} />

    </div>
  )
}

export default App