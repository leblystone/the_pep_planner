import React, { Suspense, useState, useEffect } from 'react';
import PageLoader from '../../components/ui/PageLoader';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  Book,
  Chalkboard,
  SignOut,
  CircleNotch,
  Coffee,
  Wine,
  Sparkle,
  Users,
  Stack,
  EnvelopeOpen,
  GearSix,
  Storefront,
  List,
  X,
} from '@phosphor-icons/react';
import { IconContext, ADMIN_ICON_CONTEXT, SECONDARY_TAB_ICON_MAP } from '../../components/admin/adminIcons';
import { auth } from '../../config/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { loginUser } from '../../services/firebase';
import { themes } from '../../theme/themes';
import { ADMIN_BASE, adminPrimaryTabs } from '../../config/adminRoutes';
import pipAvatar from '../../assets/PiP.png';
import { AdminProvider } from '../../context/AdminContext';
import AdminThemeToggle from '../../components/admin/AdminThemeToggle';
import { ModernToastContainer } from '../../components/ui/ModernToast';
import {
  applyAdminDocumentTheme,
  applyMainAppDocumentTheme,
  getAdminThemeName,
  setAdminThemeName,
} from '../../utils/adminThemeStorage';
import {
  isAdminPanelEmail,
  isAdminMfaFresh,
  markAdminMfaVerified,
  clearAdminMfaSession,
  adminMfaDaysRemaining,
} from '../../utils/adminSession';
import { getTwoFactorSettings, verifyAndConsumeBackupCode } from '../../services/twoFactorAuth';
import { verifyTOTPCode, isValidCodeFormat } from '../../utils/totp';

function AdminLayout() {
  const [adminThemeName, setAdminThemeNameState] = useState(getAdminThemeName);
  const theme = themes[adminThemeName] || themes.sage;

  const handleAdminThemeChange = (name) => {
    setAdminThemeName(name);
    setAdminThemeNameState(name);
    applyAdminDocumentTheme(name);
  };

  useEffect(() => {
    applyAdminDocumentTheme(adminThemeName);
    return () => applyMainAppDocumentTheme();
  }, [adminThemeName]);
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  /** After password: need authenticator code (uses existing account 2FA). */
  const [mfaPending, setMfaPending] = useState(null); // { uid, email, password }
  const [mfaCode, setMfaCode] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);

  // Firebase session + 3-day MFA freshness. Password alone is not enough.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const ok =
        user &&
        isAdminPanelEmail(user.email) &&
        isAdminMfaFresh(user.uid);
      if (ok) {
        setIsAuthenticated(true);
        setMfaPending(null);
      } else {
        // Don't clear mfaPending mid-verify — only drop session flags
        if (!user) {
          clearAdminMfaSession();
          setMfaPending(null);
        } else if (!isAdminPanelEmail(user.email)) {
          clearAdminMfaSession();
          setMfaPending(null);
        } else if (!isAdminMfaFresh(user.uid)) {
          // Expired MFA while still signed in — require password + code again
          clearAdminMfaSession();
        }
        setIsAuthenticated(false);
      }
      setAuthChecking(false);
    });
    return unsub;
  }, []);

  // Re-check MFA expiry while the panel stays open (e.g. laptop left unlocked)
  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const tick = () => {
      const user = auth.currentUser;
      if (!user || !isAdminPanelEmail(user.email) || !isAdminMfaFresh(user.uid)) {
        clearAdminMfaSession();
        setIsAuthenticated(false);
        setLoginError('Admin session expired — sign in again with your authenticator.');
      }
    };
    const id = setInterval(tick, 60 * 1000);
    return () => clearInterval(id);
  }, [isAuthenticated]);

  const finishAdminUnlock = (uid) => {
    markAdminMfaVerified(uid);
    setIsAuthenticated(true);
    setMfaPending(null);
    setMfaSecret('');
    setMfaCode('');
    setEmail('');
    setPassword('');
    setLoginError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    setIsLoggingIn(true);
    try {
      if (!email.trim()) {
        setLoginError('Please enter your email address');
        return;
      }
      const emailLower = email.trim().toLowerCase();
      if (!isAdminPanelEmail(emailLower)) {
        setLoginError('This email is not authorized for admin access');
        return;
      }
      await loginUser(emailLower, password);
      const user = auth.currentUser;
      if (!user || user.email?.toLowerCase() !== emailLower) {
        setLoginError('Authentication failed - please try again');
        return;
      }

      // Reuse the same authenticator already enabled on this account
      const twoFactorSettings = await getTwoFactorSettings(user.uid, password);
      if (
        !twoFactorSettings?.enabled ||
        twoFactorSettings.method !== 'authenticator' ||
        !twoFactorSettings.secret
      ) {
        setLoginError(
          'Authenticator is required for admin. Enable it under Account → Security on the main app, then try again.'
        );
        clearAdminMfaSession();
        return;
      }

      setMfaSecret(twoFactorSettings.secret);
      setMfaPending({ uid: user.uid, email: emailLower, password });
      setMfaCode('');
      setLoginError('');
    } catch (err) {
      console.error('Admin login error:', err);
      if (err.code === 'auth/user-not-found') {
        setLoginError('Account not found. Create an account with this email first, then try again.');
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setLoginError('Incorrect email or password. Use the same password as the main app, or reset it in Firebase.');
      } else if (err.code === 'auth/network-request-failed') {
        setLoginError('Network blocked — Firebase Auth could not connect. Try: (1) disable browser extensions/adblockers, (2) use a different browser, or (3) ensure the API key in Google Cloud Console allows thepepplanner.app as an HTTP referrer.');
      } else {
        setLoginError(err.message || 'Login failed. Please try again.');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleMfaVerify = async (e) => {
    e.preventDefault();
    if (!mfaPending) return;
    setLoginError('');
    setIsVerifyingMfa(true);
    try {
      const code = mfaCode.trim();
      if (!code) {
        setLoginError('Enter the 6-digit code from your authenticator app');
        return;
      }

      let isValid = false;
      if (isValidCodeFormat(code) && mfaSecret) {
        isValid = verifyTOTPCode(mfaSecret, code);
      }
      if (!isValid) {
        isValid = await verifyAndConsumeBackupCode(
          mfaPending.uid,
          code,
          mfaPending.password
        );
      }
      if (!isValid) {
        setLoginError('Invalid authenticator code. Try again.');
        return;
      }
      finishAdminUnlock(mfaPending.uid);
    } catch (err) {
      console.error('Admin MFA error:', err);
      setLoginError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setMfaPending(null);
    setMfaSecret('');
    clearAdminMfaSession();
    sessionStorage.clear();
    auth.signOut().catch(() => {});
    window.location.href = ADMIN_BASE;
  };

  const pathname = location.pathname;
  const hour = new Date().getHours();
  const isEvening = hour >= 18;
  const isMorning = hour < 12;
  const TimeIcon = isMorning ? Coffee : isEvening ? Wine : Sparkle;
  const timeMessage = isMorning ? 'Good morning' : isEvening ? 'Good evening' : 'Good afternoon';
  const timeColor = theme.primary;

  if (authChecking) {
    return (
      <IconContext.Provider value={ADMIN_ICON_CONTEXT}>
        <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.background }}>
          <CircleNotch className="animate-spin" size={28} style={{ color: theme.primary }} />
        </div>
      </IconContext.Provider>
    );
  }

  if (!isAuthenticated) {
    return (
      <IconContext.Provider value={ADMIN_ICON_CONTEXT}>
      <div
        className="min-h-screen flex items-center justify-center relative overflow-hidden"
        style={{ backgroundColor: theme.background }}
      >
        <div className="absolute top-10 right-10 opacity-[0.04]">
          <Book size={120} style={{ color: theme.primary }} />
        </div>
        <div className="absolute bottom-10 left-10 opacity-[0.04]">
          <Chalkboard size={100} weight="duotone" style={{ color: theme.primaryLight }} />
        </div>
        <div
          className="max-w-md w-full p-8 rounded-lg border shadow-lg relative z-10"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.cardBackground,
            boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
          }}
        >
          <div className="text-center mb-8">
            <div className="mx-auto mb-2">
              <img src="/tpp_logo.png" alt="The Pep Planner" className="w-16 h-16 object-contain" />
            </div>
            <h1 className="text-lg font-bold mb-2" style={{ color: theme.text }}>
              The Pep Planner
            </h1>
            <p className="text-sm" style={{ color: theme.textLight }}>
              Admin Panel
            </p>
            <p className="text-xs mt-2" style={{ color: theme.textLight }}>
              {mfaPending
                ? 'Enter the code from your authenticator app (same as account login)'
                : 'Password + authenticator. Session lasts 3 days.'}
            </p>
          </div>

          {mfaPending ? (
            <form onSubmit={handleMfaVerify} className="space-y-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\s/g, '').slice(0, 12))}
                placeholder="6-digit code"
                className="w-full p-4 rounded-lg border focus:outline-none focus:ring-2 tracking-[0.2em] text-center text-lg font-semibold"
                style={{
                  borderColor: theme.border,
                  backgroundColor: theme.cardBackground,
                  color: theme.text,
                }}
                required
                disabled={isVerifyingMfa}
                autoFocus
              />
              {loginError && (
                <div
                  className="px-4 py-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: theme.error + '15',
                    color: theme.error,
                    border: `1px solid ${theme.error}30`,
                  }}
                >
                  {loginError}
                </div>
              )}
              <button
                type="submit"
                disabled={isVerifyingMfa || !mfaCode.trim()}
                className="w-full p-4 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark} 100%)`,
                  color: '#FFF',
                  border: `1px solid ${theme.border}`,
                }}
              >
                {isVerifyingMfa ? (
                  <>
                    <CircleNotch className="animate-spin" size={22} />
                    <span>Verifying…</span>
                  </>
                ) : (
                  'Verify & enter'
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMfaPending(null);
                  setMfaSecret('');
                  setMfaCode('');
                  setLoginError('');
                  clearAdminMfaSession();
                }}
                className="w-full py-2 text-xs font-medium opacity-60 hover:opacity-100"
                style={{ color: theme.text }}
              >
                Back to password
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Admin email"
                className="w-full p-4 rounded-lg border mb-3 focus:outline-none focus:ring-2"
                style={{
                  borderColor: loginError && !email.trim() ? theme.error : theme.border,
                  backgroundColor: theme.cardBackground,
                  color: theme.text,
                }}
                required
                disabled={isLoggingIn}
                autoComplete="email"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Firebase account password"
                className="w-full p-4 rounded-lg border focus:outline-none focus:ring-2"
                style={{
                  borderColor: loginError && email.trim() ? theme.error : theme.border,
                  backgroundColor: theme.cardBackground,
                  color: theme.text,
                }}
                required
                disabled={isLoggingIn}
                autoComplete="current-password"
              />
              {loginError && (
                <div
                  className="px-4 py-3 rounded-lg text-sm"
                  style={{
                    backgroundColor: theme.error + '15',
                    color: theme.error,
                    border: `1px solid ${theme.error}30`,
                  }}
                >
                  {loginError}
                </div>
              )}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full p-4 rounded-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark} 100%)`,
                  color: '#FFF',
                  border: `1px solid ${theme.border}`,
                }}
              >
                {isLoggingIn ? (
                  <>
                    <CircleNotch className="animate-spin" size={22} />
                    <span>Authenticating...</span>
                  </>
                ) : (
                  'Continue'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
      </IconContext.Provider>
    );
  }

  const currentGroup = adminPrimaryTabs.find((g) =>
    g.children?.some((c) => c.path === pathname || pathname.startsWith(c.path + '/'))
  );
  const secondaryTabs = currentGroup?.children ?? [];

  return (
    <IconContext.Provider value={ADMIN_ICON_CONTEXT}>
    <AdminProvider>
      <AdminAuthenticatedLayout
        theme={theme}
        themeName={adminThemeName}
        onThemeChange={handleAdminThemeChange}
        pathname={pathname}
        secondaryTabs={secondaryTabs}
        timeColor={timeColor}
        TimeIcon={TimeIcon}
        timeMessage={timeMessage}
        handleLogout={handleLogout}
      />
    </AdminProvider>
    </IconContext.Provider>
  );
}

const SIDEBAR_WIDTH = 240;

const iconMap = {
  LayoutDashboard: Chalkboard,
  Chalkboard,
  Users,
  Layers: Stack,
  Stack,
  ShoppingBag: Storefront,
  Storefront,
  MailOpen: EnvelopeOpen,
  EnvelopeOpen,
  Sliders: GearSix,
  GearSix,
};

function SecondaryTabContent({ tab, theme, isActive }) {
  const Icon = tab.icon ? SECONDARY_TAB_ICON_MAP[tab.icon] : null;
  const iconColor =
    tab.id === 'sync-errors'
      ? theme.error || '#DC2626'
      : isActive
        ? theme.primary
        : theme.textLight;
  return (
    <span className="flex items-center gap-2">
      {Icon && <Icon size={18} weight="duotone" style={{ color: iconColor, flexShrink: 0 }} />}
      <span
        style={{
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          fontSize: '12px',
          fontWeight: isActive ? 600 : 500,
        }}
      >
        {tab.label}
      </span>
    </span>
  );
}

function AdminAuthenticatedLayout({
  theme,
  themeName,
  onThemeChange,
  pathname,
  secondaryTabs,
  timeColor,
  TimeIcon,
  timeMessage,
  handleLogout,
}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [topbarAction, setTopbarAction] = React.useState(null);
  const [fullBleed, setFullBleed] = React.useState(false);
  React.useEffect(() => setSidebarOpen(false), [pathname]);

  return (
    <div
      className="h-screen max-h-screen w-screen flex overflow-hidden"
      style={{ backgroundColor: theme.background }}
    >
      {/* Mobile backdrop when sidebar open */}
      <div
        className={`fixed inset-0 z-10 lg:hidden transition-opacity duration-300 ease-in-out ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
        onClick={() => setSidebarOpen(false)}
        aria-hidden={!sidebarOpen}
      />

      {/* Fixed left sidebar */}
      <aside
        className={`fixed left-0 top-0 bottom-0 flex flex-col flex-shrink-0 z-20 border-r overflow-y-auto transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{
          width: SIDEBAR_WIDTH,
          backgroundColor: theme.cardBackground ?? '#f8f9fa',
          borderColor: theme.border,
          boxShadow: theme.isDark ? '2px 0 12px rgba(0,0,0,0.35)' : '2px 0 8px rgba(0,0,0,0.04)',
        }}
      >
        <div className="p-4 border-b flex-shrink-0" style={{ borderColor: theme.border }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <img src="/tpp_logo.png" alt="The Pep Planner" className="w-9 h-9 object-contain flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-sm font-bold leading-tight" style={{ color: theme.text }}>
                  The Pep Planner
                </h1>
                <p className="text-[10px]" style={{ color: theme.textLight }}>
                  Admin
                </p>
              </div>
            </div>
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg flex-shrink-0 transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ color: theme.text, '--tw-ring-color': theme.primary }}
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
            >
              <X size={24} weight="regular" />
            </button>
          </div>
          <div
            className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs"
            style={{ backgroundColor: timeColor + '18', color: timeColor }}
          >
            <TimeIcon size={18} weight="regular" />
            <span>{timeMessage}</span>
          </div>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {adminPrimaryTabs.map((tab) => {
            const defaultPath = tab.children?.length ? tab.children[0].path : tab.path;
            const isActive = tab.children
              ? tab.children.some((c) => c.path === pathname || pathname.startsWith(c.path + '/'))
              : pathname === tab.path;
            const Icon = tab.icon === 'PiP' ? null : iconMap[tab.icon] || Chalkboard;
            return (
              <NavLink
                key={tab.id}
                to={defaultPath}
                end={!tab.children?.length}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ease-out hover:scale-[1.01] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                style={{
                  backgroundColor: isActive ? theme.primary : 'transparent',
                  color: isActive ? (theme.textOnPrimary ?? '#fff') : theme.text,
                }}
              >
                {tab.icon === 'PiP' ? (
                  <img
                    src={pipAvatar}
                    alt=""
                    aria-hidden
                    className="w-[22px] h-[22px] rounded-md object-cover flex-shrink-0"
                    style={
                      isActive
                        ? { boxShadow: '0 0 0 1px rgba(255,255,255,0.35)' }
                        : { border: `1px solid ${theme.border}` }
                    }
                  />
                ) : (
                  <Icon size={22} weight="duotone" />
                )}
                <span
                  style={{
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    fontSize: '12px',
                    fontWeight: isActive ? 600 : 500,
                  }}
                >
                  {tab.label}
                </span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-2 border-t flex flex-col gap-1 flex-shrink-0" style={{ borderColor: theme.border }}>
          <div className="px-1 pb-1">
            <AdminThemeToggle theme={theme} themeName={themeName} onThemeChange={onThemeChange} />
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title={`Admin MFA session · ~${adminMfaDaysRemaining()} day(s) left`}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{
              backgroundColor: theme.error + '15',
              color: theme.error,
              border: `1px solid ${theme.error}30`,
            }}
          >
            <SignOut size={20} weight="duotone" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content: sub-pages on top, then page content */}
      <div
        className="flex-1 flex flex-col min-w-0 min-h-0 h-full max-h-screen overflow-hidden lg:ml-[240px]"
      >
        {/* Sub-page tabs at top of main content (with menu button on mobile) */}
        <div
          className="flex-shrink-0 border-b px-3 lg:px-6 overflow-x-auto flex items-center gap-2"
          style={{
            backgroundColor: theme.cardBackground,
            borderColor: theme.border,
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          <button
            type="button"
            className="lg:hidden p-2 rounded-lg flex-shrink-0 transition-all duration-150 ease-out hover:scale-[1.02] active:scale-[0.97] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ color: theme.text, backgroundColor: theme.background, '--tw-ring-color': theme.primary }}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <List size={24} weight="regular" />
          </button>
          {secondaryTabs.length > 0 ? (
            <div className="flex items-center gap-6 py-2 min-w-max flex-1 overflow-x-auto">
              {secondaryTabs.map((t) => {
                const isActive = pathname === t.path;
                const isDisabled = t.disabled === true;
                if (isDisabled) {
                  return (
                    <span
                      key={t.id}
                      className="px-2 pb-2 pt-3 text-sm font-medium whitespace-nowrap relative cursor-not-allowed opacity-60"
                      style={{
                        color: theme.textLight ?? '#9a9a9a',
                        fontWeight: 500,
                      }}
                      title="Unavailable"
                    >
                      <SecondaryTabContent tab={t} theme={theme} isActive={false} />
                    </span>
                  );
                }
                return (
                  <NavLink
                    key={t.id}
                    to={t.path}
                    className="px-2 pb-2 pt-3 text-sm font-medium whitespace-nowrap relative"
                    style={{
                      color: isActive ? theme.text : theme.textLight,
                      fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <SecondaryTabContent tab={t} theme={theme} isActive={isActive} />
                    {isActive && (
                      <span
                        className="absolute bottom-0 left-0 right-0 rounded-full"
                        style={{
                          backgroundColor: theme.primary,
                          height: 3,
                          boxShadow: `0 0 8px ${theme.primary}60`,
                        }}
                      />
                    )}
                  </NavLink>
                );
              })}
            </div>
          ) : (
            <div className="py-2 flex-1" />
          )}
          {/* Page-level action slot — pages register via setTopbarAction from outlet context */}
          {topbarAction && (
            <div className="flex-shrink-0 pl-3 pr-1">{topbarAction}</div>
          )}
        </div>

        <main
          className={`flex-1 flex flex-col min-w-0 min-h-0 relative z-10 ${
            fullBleed ? 'overflow-hidden' : 'overflow-y-auto'
          }`}
        >
          {fullBleed ? (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden w-full">
              <Suspense fallback={<PageLoader theme={theme} />}>
                <Outlet context={{ theme, setTopbarAction, setFullBleed }} />
              </Suspense>
            </div>
          ) : (
            <div className="flex-1 p-4 lg:p-6">
              <div className="mx-auto max-w-7xl w-full">
                <Suspense fallback={<PageLoader theme={theme} />}>
                  <Outlet context={{ theme, setTopbarAction, setFullBleed }} />
                </Suspense>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Admin is a sibling of App — without this, tpp:toast events never render */}
      <ModernToastContainer theme={theme} desktopSidebarHalf="120px" />
    </div>
  );
}

export default AdminLayout;
