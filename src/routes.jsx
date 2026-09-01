import React from 'react'
import { createBrowserRouter, Navigate, useSearchParams } from 'react-router-dom'
import App from './App.jsx'
import NotFound from './pages/NotFound.jsx'
import AppRouteError from './components/common/AppRouteError.jsx'
import Rover from './pages/Rover.jsx'
import ProtectedRoute from './components/common/ProtectedRoute.jsx'
import { lazyWithRetry } from './utils/lazyWithRetry.jsx'

// TEST COMPONENT - Remove in production
import ErrorBoundaryTest from './components/test/ErrorBoundaryTest.jsx'

/** Preserve query string when redirecting legacy shop sub-routes into Products views. */
function ShopProductsViewRedirect({ view }) {
  const [searchParams] = useSearchParams();
  const next = new URLSearchParams(searchParams);
  next.set('view', view);
  return <Navigate to={`/admin/shop/products?${next.toString()}`} replace />;
}

const LandingWrapper = lazyWithRetry(() => import('./components/common/LandingWrapper.jsx'), 'LandingWrapper')
const Landing = lazyWithRetry(() => import('./pages/Landing.jsx'), 'Landing')
const Home = lazyWithRetry(() => import('./pages/Home.jsx'), 'Home')
const Dashboard = lazyWithRetry(() => import('./pages/CustomizableDashboard.jsx'), 'CustomizableDashboard')
const InsightsPage = lazyWithRetry(() => import('./pages/InsightsPage.jsx'), 'InsightsPage')
const Orders = lazyWithRetry(() => import('./pages/Orders.jsx'), 'Orders')
const Protocols = lazyWithRetry(() => import('./pages/Protocols.jsx'), 'Protocols')
const Vendors = lazyWithRetry(() => import('./pages/Vendors.jsx'), 'Vendors')
const Calendar = lazyWithRetry(() => import('./pages/Calendar.jsx'), 'Calendar')
const Day = lazyWithRetry(() => import('./pages/Day.jsx'), 'Day')
const Stockpile = lazyWithRetry(() => import('./pages/Stockpile.jsx'), 'Stockpile')
const Recon = lazyWithRetry(() => import('./pages/Recon.jsx'), 'Recon')
const AnnouncementsRedirect = lazyWithRetry(() => import('./pages/AnnouncementsRedirect.jsx'), 'AnnouncementsRedirect')
const SupportRedirect = lazyWithRetry(() => import('./pages/SupportRedirect.jsx'), 'SupportRedirect')
const Settings = lazyWithRetry(() => import('./pages/Settings.jsx'), 'Settings')
const SettingsNotifications = lazyWithRetry(() => import('./pages/SettingsNotifications.jsx'), 'SettingsNotifications')
const SettingsAppearance = lazyWithRetry(() => import('./pages/SettingsAppearance.jsx'), 'SettingsAppearance')
const SettingsPreferences = lazyWithRetry(() => import('./pages/SettingsPreferences.jsx'), 'SettingsPreferences')
const SettingsPrivacy = lazyWithRetry(() => import('./pages/SettingsPrivacy.jsx'), 'SettingsPrivacy')
const SettingsData = lazyWithRetry(() => import('./pages/SettingsData.jsx'), 'SettingsData')
// Research+ Wave: in-app Help Center
const SettingsHelp = lazyWithRetry(() => import('./pages/settings/SettingsHelp.jsx'), 'SettingsHelp')
// Research+ Wave: legacy /app/ai → Ask PiP modal
const PipChatRedirect = lazyWithRetry(() => import('./pages/PipChatRedirect.jsx'), 'PipChatRedirect')
// Community Center — public directory (opt-in, admin-curated)
const CommunityCenter = lazyWithRetry(() => import('./pages/CommunityCenter.jsx'), 'CommunityCenter')
// Research+ Wave: Buddy System
const AccountBuddy = lazyWithRetry(() => import('./pages/AccountBuddy.jsx'), 'AccountBuddy')
const AccountProfile = lazyWithRetry(() => import('./pages/AccountProfile.jsx'), 'AccountProfile')
const AccountSubscription = lazyWithRetry(() => import('./pages/AccountSubscription.jsx'), 'AccountSubscription')
const LifetimeBilling = lazyWithRetry(() => import('./pages/LifetimeBilling.jsx'), 'LifetimeBilling')
const AccountLegal = lazyWithRetry(() => import('./pages/AccountLegal.jsx'), 'AccountLegal')
const Login = lazyWithRetry(() => import('./pages/Login.jsx'), 'Login')
const Imports = lazyWithRetry(() => import('./pages/Imports.jsx'), 'Imports')
const Goals = lazyWithRetry(() => import('./pages/Goals.jsx'), 'Goals')
const Supplements = lazyWithRetry(() => import('./pages/Supplements.jsx'), 'Supplements')
const WishlistPage = lazyWithRetry(() => import('./pages/Wishlist.jsx'), 'WishlistPage')
const Badges = lazyWithRetry(() => import('./pages/Badges.jsx'), 'Badges')
// Admin panel - router-based layout (Option B)
const AdminLayout = lazyWithRetry(() => import('./pages/admin/AdminLayout.jsx'), 'AdminLayout')
// Standalone lightweight mobile support inbox (does NOT mount heavy AdminProvider)
const MobileSupport = lazyWithRetry(() => import('./pages/MobileSupport.jsx'), 'MobileSupport')
// Overview components
const AdminOverviewDashboard = lazyWithRetry(() => import('./pages/admin/AdminOverviewDashboard.jsx'), 'AdminOverviewDashboard')
const AdminAnalytics = lazyWithRetry(() => import('./pages/admin/AdminAnalytics.jsx'), 'AdminAnalytics')
const AdminRevenue = lazyWithRetry(() => import('./pages/admin/AdminRevenue.jsx'), 'AdminRevenue')
const AdminSyncErrors = lazyWithRetry(() => import('./pages/admin/AdminSyncErrors.jsx'), 'AdminSyncErrors')
// Legacy components (still used within new structure)
const AdminContact = lazyWithRetry(() => import('./pages/admin/AdminContact.jsx'), 'AdminContact')
// Users components
const AdminUsersShell = lazyWithRetry(() => import('./pages/admin/AdminUsersShell.jsx'), 'AdminUsersShell')
const AdminUsersSubscriptions = lazyWithRetry(() => import('./pages/admin/AdminUsersSubscriptions.jsx'), 'AdminUsersSubscriptions')
const AdminUsersLifetime = lazyWithRetry(() => import('./pages/admin/AdminUsersLifetime.jsx'), 'AdminUsersLifetime')
const AdminUsersAnnual = lazyWithRetry(() => import('./pages/admin/AdminUsersAnnual.jsx'), 'AdminUsersAnnual')
const AdminUsersExpiredTrials = lazyWithRetry(() => import('./pages/admin/AdminUsersExpiredTrials.jsx'), 'AdminUsersExpiredTrials')
// Content components
// Content (hidden from nav — routes redirect to dashboard)
// Comms components
const AdminCommsAnnouncements = lazyWithRetry(() => import('./pages/admin/AdminCommsAnnouncements.jsx'), 'AdminCommsAnnouncements')
const AdminCommsEmails = lazyWithRetry(() => import('./pages/admin/AdminCommsEmails.jsx'), 'AdminCommsEmails')
const AdminCommsNotifications = lazyWithRetry(() => import('./pages/admin/AdminCommsNotifications.jsx'), 'AdminCommsNotifications')
// Settings components
const AdminSettingsSecurity = lazyWithRetry(() => import('./pages/admin/AdminSettingsSecurity.jsx'), 'AdminSettingsSecurity')
const AdminSettingsDeletions = lazyWithRetry(() => import('./pages/admin/AdminSettingsDeletions.jsx'), 'AdminSettingsDeletions')
const AdminSettingsVersion = lazyWithRetry(() => import('./pages/admin/AdminSettingsVersion.jsx'), 'AdminSettingsVersion')
const AdminSettingsAgreements = lazyWithRetry(() => import('./pages/admin/AdminSettingsAgreements.jsx'), 'AdminSettingsAgreements')
const AdminSettingsFlags = lazyWithRetry(() => import('./pages/admin/AdminSettingsFlags.jsx'), 'AdminSettingsFlags')
const AdminSettingsSubscriptions = lazyWithRetry(() => import('./pages/admin/AdminSettingsSubscriptions.jsx'), 'AdminSettingsSubscriptions')
const AdminAICosts = lazyWithRetry(() => import('./pages/admin/AdminAICosts.jsx'), 'AdminAICosts')
const AdminPipInsights = lazyWithRetry(() => import('./pages/admin/AdminPipInsights.jsx'), 'AdminPipInsights')
const AdminShopProducts = lazyWithRetry(() => import('./pages/admin/AdminShopProducts.jsx'), 'AdminShopProducts')
const AdminShopOrders = lazyWithRetry(() => import('./pages/admin/AdminShopOrders.jsx'), 'AdminShopOrders')
const AdminShopMarketing = lazyWithRetry(() => import('./pages/admin/AdminShopMarketing.jsx'), 'AdminShopMarketing')
const ShopReviews = lazyWithRetry(() => import('./pages/ShopReviews.jsx'), 'ShopReviews')
const ShopWriteReview = lazyWithRetry(() => import('./pages/ShopWriteReview.jsx'), 'ShopWriteReview')
const AdminShopInquiries = lazyWithRetry(() => import('./pages/admin/AdminShopInquiries.jsx'), 'AdminShopInquiries')
const AdminDiscover = lazyWithRetry(() => import('./pages/admin/AdminDiscover.jsx'), 'AdminDiscover')
const WebDiscover = lazyWithRetry(() => import('./pages/WebDiscover.jsx'), 'WebDiscover')
// Beta/launch pages removed for App Store compliance
const CoverLanding = lazyWithRetry(() => import('./pages/CoverLanding.jsx'), 'CoverLanding')
const About = lazyWithRetry(() => import('./pages/About.jsx'), 'About')
const Shop = lazyWithRetry(() => import('./pages/Shop.jsx'), 'Shop')
const ShopProduct = lazyWithRetry(() => import('./pages/ShopProduct.jsx'), 'ShopProduct')
const ShopSuccess = lazyWithRetry(() => import('./pages/ShopSuccess.jsx'), 'ShopSuccess')
const ShopCustom = lazyWithRetry(() => import('./pages/ShopCustom.jsx'), 'ShopCustom')
const ShopWholesale = lazyWithRetry(() => import('./pages/ShopWholesale.jsx'), 'ShopWholesale')
const ShopGroupDiscounts = lazyWithRetry(() => import('./pages/ShopGroupDiscounts.jsx'), 'ShopGroupDiscounts')
const ShopVault = lazyWithRetry(() => import('./pages/ShopVault.jsx'), 'ShopVault')
const OrderStatus = lazyWithRetry(() => import('./pages/OrderStatus.jsx'), 'OrderStatus')
const DigitalDownload = lazyWithRetry(() => import('./pages/DigitalDownload.jsx'), 'DigitalDownload')
const Features = lazyWithRetry(() => import('./pages/Features.jsx'), 'Features')
const Pricing = lazyWithRetry(() => import('./pages/Pricing.jsx'), 'Pricing')
const Contact = lazyWithRetry(() => import('./pages/Contact.jsx'), 'Contact')
const Privacy = lazyWithRetry(() => import('./pages/Privacy.jsx'), 'Privacy')
const MarketingUnsubscribe = lazyWithRetry(() => import('./pages/MarketingUnsubscribe.jsx'), 'MarketingUnsubscribe')
const Terms = lazyWithRetry(() => import('./pages/Terms.jsx'), 'Terms')
const CancellationPolicy = lazyWithRetry(() => import('./pages/CancellationPolicy.jsx'), 'CancellationPolicy')
const ResourcesPage = lazyWithRetry(() => import('./pages/Resources.jsx'), 'Resources')
const FAQ = lazyWithRetry(() => import('./pages/FAQ.jsx'), 'FAQ')
const DeleteAccount = lazyWithRetry(() => import('./pages/DeleteAccount.jsx'), 'DeleteAccount')
const ResetPassword = lazyWithRetry(() => import('./pages/ResetPassword.jsx'), 'ResetPassword')
const VerifyEmail = lazyWithRetry(() => import('./pages/VerifyEmail.jsx'), 'VerifyEmail')
const ActivateAccount = lazyWithRetry(() => import('./pages/ActivateAccount.jsx'), 'ActivateAccount')
const RedeemLifetime = lazyWithRetry(() => import('./pages/RedeemLifetime.jsx'), 'RedeemLifetime')
const RedeemAnnual = lazyWithRetry(() => import('./pages/RedeemAnnual.jsx'), 'RedeemAnnual')
const TestAnnualCheckout = lazyWithRetry(() => import('./pages/TestAnnualCheckout.jsx'), 'TestAnnualCheckout')
// TrialExpired + SubscriptionExpired removed — no more hard lockouts. Users stay
// in-app on the free tier. Any old links redirect to the subscription page.

// Launch Configuration
const IS_APP_BLOCKED = false; // Set to false when ready to launch

// Component to redirect blocked routes
const LaunchRedirect = () => <Navigate to="/countdown" replace />;

const routerOpts = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true,
  },
};

export const router = createBrowserRouter([
  {
    path: '/',
    element: <LandingWrapper />,
    errorElement: <NotFound />,
  },
  {
    path: '/login',
    element: IS_APP_BLOCKED ? <LaunchRedirect /> : <Login />,
    errorElement: <NotFound />,
  },
  {
    // Magic-link email sign-in callback — handled by Login.jsx's isMagicLinkUrl check
    path: '/magic-link',
    element: IS_APP_BLOCKED ? <LaunchRedirect /> : <Login />,
    errorElement: <NotFound />,
  },
  {
    path: '/admin',
    element: IS_APP_BLOCKED ? <LaunchRedirect /> : <AdminLayout />,
    errorElement: <NotFound />,
    children: [
      // Default redirect to new Overview Dashboard
      { index: true, element: <Navigate to="/admin/overview/dashboard" replace /> },
      
      // Overview section (new structure)
      { path: 'overview/dashboard', element: <AdminOverviewDashboard /> },
      { path: 'overview/support', element: <Navigate to="/admin/overview/dashboard" replace /> },
      { path: 'overview/contact', element: <AdminContact /> },
      { path: 'overview/analytics', element: <AdminAnalytics /> },
      { path: 'overview/revenue', element: <AdminRevenue /> },
      { path: 'overview/automation', element: <Navigate to="/admin/overview/dashboard" replace /> },
      { path: 'overview/sync-errors', element: <AdminSyncErrors /> },
      
      // Legacy routes - redirect to new structure for backward compatibility
      { path: 'analytics', element: <Navigate to="/admin/overview/analytics" replace /> },
      { path: 'ghost-worker', element: <Navigate to="/admin/overview/dashboard" replace /> },
      { path: 'work-queue', element: <Navigate to="/admin/overview/dashboard" replace /> }, // Work queue is on dashboard
      { path: 'feedback', element: <Navigate to="/admin/overview/dashboard" replace /> },
      { path: 'contact', element: <Navigate to="/admin/overview/contact" replace /> },
      
      // Users section (master-detail shell)
      {
        path: 'users',
        element: <AdminUsersShell />,
        children: [
          { path: 'subscriptions', element: <AdminUsersSubscriptions /> },
          { path: 'lifetime', element: <AdminUsersLifetime /> },
          { path: 'annual', element: <AdminUsersAnnual /> },
          { path: 'expired-trials', element: <AdminUsersExpiredTrials /> },
          { index: true, element: <Navigate to="/admin/users/subscriptions" replace /> },
        ],
      },
      
      // Content section (hidden — redirect to dashboard)
      { path: 'content', element: <Navigate to="/admin/overview/dashboard" replace /> },
      { path: 'improvements', element: <Navigate to="/admin/overview/dashboard" replace /> },
      
      // Shop section
      { path: 'shop/products', element: <AdminShopProducts /> },
      { path: 'shop/reviews', element: <ShopProductsViewRedirect view="reviews" /> },
      { path: 'shop/orders', element: <AdminShopOrders /> },
      { path: 'shop/marketing', element: <AdminShopMarketing /> },
      { path: 'shop/marketplaces', element: <ShopProductsViewRedirect view="marketplaces" /> },
      { path: 'shop/inquiries', element: <AdminShopInquiries /> },
      { path: 'shop/waitlist', element: <ShopProductsViewRedirect view="waitlist" /> },
      { path: 'shop', element: <Navigate to="/admin/shop/products" replace /> },

      // Discover moderation
      { path: 'discover', element: <AdminDiscover /> },
      
      // Comms section
      { path: 'comms/emails', element: <AdminCommsEmails /> },
      { path: 'comms/triggers', element: <Navigate to="/admin/comms/emails?view=triggers" replace /> },
      { path: 'comms/history', element: <Navigate to="/admin/comms/emails?view=history" replace /> },
      { path: 'comms/notification-tracker', element: <Navigate to="/admin/comms/notifications" replace /> },
      { path: 'comms/announcements', element: <AdminCommsAnnouncements /> },
      { path: 'comms/notifications', element: <AdminCommsNotifications /> },
      { path: 'comms', element: <Navigate to="/admin/comms/emails" replace /> },
      // Legacy comms routes - redirect to new structure
      { path: 'comms/push', element: <Navigate to="/admin/comms/notifications" replace /> },
      { path: 'comms/in-app', element: <Navigate to="/admin/comms/notifications" replace /> },

      // AI / PiP
      { path: 'ai/insights', element: <AdminPipInsights /> },
      { path: 'ai/costs', element: <AdminAICosts /> },

      // Settings section
      { path: 'settings/security', element: <AdminSettingsSecurity /> },
      { path: 'settings/deletions', element: <AdminSettingsDeletions /> },
      { path: 'settings/version', element: <AdminSettingsVersion /> },
      { path: 'settings/agreements', element: <AdminSettingsAgreements /> },
      { path: 'settings/flags', element: <AdminSettingsFlags /> },
      { path: 'settings/subscriptions', element: <AdminSettingsSubscriptions /> },
      { path: 'settings/ai-costs', element: <Navigate to="/admin/ai/costs" replace /> },
      { path: 'settings', element: <Navigate to="/admin/settings/security" replace /> },
    ],
  },
  {
    // Fast, phone-friendly support inbox. Deep link: /admin-support?ticketId=<id>
    path: '/admin-support',
    element: IS_APP_BLOCKED ? <LaunchRedirect /> : <MobileSupport />,
    errorElement: <NotFound />,
  },
  {
    path: '/launch-coming-soon',
    element: <Navigate to="/" replace />,
    errorElement: <NotFound />,
  },
  {
    path: '/countdown',
    element: <Navigate to="/" replace />,
    errorElement: <NotFound />,
  },
  {
    path: '/test-countdown',
    element: <CoverLanding />,
    errorElement: <NotFound />,
  },
  {
    path: '/original-landing',
    element: <Landing />,
    errorElement: <NotFound />,
  },
  {
    path: '/about',
    element: <About />,
    errorElement: <NotFound />,
  },
  {
    path: '/discover',
    element: <WebDiscover />,
    errorElement: <NotFound />,
  },
  {
    path: '/shop',
    element: <Shop />,
    errorElement: <NotFound />,
  },
  {
    path: '/shop/reviews',
    element: <ShopReviews />,
    errorElement: <NotFound />,
  },
  {
    path: '/shop/review',
    element: <ShopWriteReview />,
    errorElement: <NotFound />,
  },
  {
    path: '/shop/products/:slug',
    element: <ShopProduct />,
    errorElement: <NotFound />,
  },
  {
    path: '/shop/success',
    element: <ShopSuccess />,
    errorElement: <NotFound />,
  },
  {
    path: '/shop/custom',
    element: <ShopCustom />,
    errorElement: <NotFound />,
  },
  {
    path: '/custom-pep-planners',
    element: <Navigate to="/shop/custom" replace />,
  },
  {
    path: '/shop/wholesale',
    element: <ShopWholesale />,
    errorElement: <NotFound />,
  },
  {
    path: '/bulk-wholesale',
    element: <Navigate to="/shop/wholesale" replace />,
  },
  {
    path: '/shop/group-discounts',
    element: <ShopGroupDiscounts />,
    errorElement: <NotFound />,
  },
  {
    path: '/shop/vault',
    element: <ShopVault />,
    errorElement: <NotFound />,
  },
  {
    path: '/the-vault',
    element: <Navigate to="/shop/vault" replace />,
  },
  {
    path: '/order/:sessionId',
    element: <OrderStatus />,
    errorElement: <NotFound />,
  },
  {
    path: '/downloads/:token',
    element: <DigitalDownload />,
    errorElement: <NotFound />,
  },
  {
    path: '/features',
    element: <Features />,
    errorElement: <NotFound />,
  },
  {
    path: '/pricing',
    element: <Pricing />,
    errorElement: <NotFound />,
  },
  {
    path: '/privacy',
    element: <Privacy />,
    errorElement: <NotFound />,
  },
  {
    path: '/unsubscribe',
    element: <MarketingUnsubscribe />,
    errorElement: <NotFound />,
  },
  {
    path: '/terms',
    element: <Terms />,
    errorElement: <NotFound />,
  },
  {
    path: '/cancellation-policy',
    element: <CancellationPolicy />,
    errorElement: <NotFound />,
  },
  {
    path: '/delete-account',
    element: <DeleteAccount />,
    errorElement: <NotFound />,
  },
  {
    path: '/blog',
    element: <Navigate to="/resources" replace />,
    errorElement: <NotFound />,
  },
  {
    path: '/resources',
    element: <ResourcesPage />,
    errorElement: <NotFound />,
  },
  {
    path: '/faq',
    element: <FAQ />,
    errorElement: <NotFound />,
  },
  {
    path: '/contact',
    element: <Contact />,
    errorElement: <NotFound />,
  },
  {
    path: '/reset-password',
    element: <ResetPassword />,
    errorElement: <NotFound />,
  },
  {
    path: '/verify-email',
    element: <VerifyEmail />,
    errorElement: <NotFound />,
  },
  {
    path: '/verify-email-required',
    // Legacy URL — same shell lives at /verify-email
    element: <Navigate to="/verify-email" replace />,
    errorElement: <NotFound />,
  },
  {
    path: '/activate',
    element: <ActivateAccount />,
    errorElement: <NotFound />,
  },
  {
    path: '/research-lifetime',
    element: <RedeemLifetime />,
    errorElement: <NotFound />,
  },
  {
    path: '/research-annual',
    element: <RedeemAnnual />,
    errorElement: <NotFound />,
  },
  {
    path: '/test-annual-checkout',
    element: <TestAnnualCheckout />,
    errorElement: <NotFound />,
  },
  {
    path: '/share/:type/share/:encodedData',
    element: <Rover />,
    errorElement: <NotFound />,
  },
  {
    path: '/account',
    element: <Navigate to="/app/settings" replace />,
    errorElement: <NotFound />,
  },
  {
    path: '/app',
    element: IS_APP_BLOCKED ? <LaunchRedirect /> : <ProtectedRoute />,
    errorElement: <AppRouteError />,
    children: [
      {
        path: '',
        element: <App />,
        // No errorElement - let ChunkErrorBoundary catch errors
        children: [
          { path: 'account', element: <Navigate to="/app/settings" replace /> },
          { path: 'account/profile', element: <AccountProfile /> },
          { path: 'account/subscription', element: <AccountSubscription /> },
          { path: 'account/subscription/lifetime-billing', element: <LifetimeBilling /> },
          { path: 'account/security', element: <Navigate to="/app/account/profile" replace /> },
          { path: 'account/legal', element: <AccountLegal /> },
          { path: 'trial-expired', element: <Navigate to="/app/account/subscription" replace /> },
          { path: 'subscription-expired', element: <Navigate to="/app/account/subscription" replace /> },
          { path: 'dashboard', element: <Dashboard /> },
          { path: 'wishlist', element: <Navigate to="/app/orders" state={{ activeTab: 'wishlist' }} replace /> },
          { path: 'insights', element: <InsightsPage /> },
          { path: 'dashboard/analytics', element: <Navigate to="/app/insights?tab=research" replace /> },
          { path: 'orders', element: <Orders /> },
          { path: 'protocols', element: <Protocols /> },
          { path: 'vendors', element: <Vendors /> },
          { path: 'calendar', element: <Calendar /> },
          { path: 'calendar/day', element: <Day /> },
          { path: 'recon', element: <Recon /> },
          { path: 'stockpile', element: <Stockpile /> },
          { path: 'announcements', element: <AnnouncementsRedirect /> },
          { path: 'support', element: <SupportRedirect /> },
          { path: 'goals', element: <Goals /> },
          { path: 'supplements', element: <Supplements /> },
          { path: 'medications', element: <Navigate to="/app/supplements?tab=meds" replace /> },
          { path: 'bio-metrics', element: <Navigate to="/app/insights?tab=metrics" replace /> },
          { path: 'settings', element: <Settings /> },
          { path: 'settings/notifications', element: <SettingsNotifications /> },
          { path: 'settings/appearance', element: <SettingsAppearance /> },
          { path: 'settings/preferences', element: <SettingsPreferences /> },
          { path: 'settings/privacy', element: <SettingsPrivacy /> },
          { path: 'settings/legal', element: <Navigate to="/app/account/legal" replace /> },
          { path: 'settings/data', element: <SettingsData /> },
          { path: 'settings/help', element: <SettingsHelp /> },
          { path: 'community', element: <CommunityCenter /> },
          { path: 'ai', element: <PipChatRedirect /> },
          { path: 'account/buddy', element: <AccountBuddy /> },
          { path: 'imports', element: <Imports /> },
          { path: 'badges', element: <Badges /> },
          { path: 'test-error', element: <ErrorBoundaryTest /> },
          { path: 'beta-survey', element: <Navigate to="/app/dashboard" replace /> },
          { path: 'launch-coming-soon', element: <Navigate to="/app/dashboard" replace /> },
          { index: true, element: <Navigate to="/app/dashboard" replace /> },
        ]
      }
    ]
  }
], routerOpts)