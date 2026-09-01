/**
 * Admin panel route config — single source of truth for nav + routes.
 * Drives both React Router paths and AdminLayout primary/secondary nav.
 */

export const ADMIN_BASE = '/admin';

/** Primary tabs (top-level nav). Each can have optional `children` for secondary nav. */
export const adminPrimaryTabs = [
  {
    id: 'overview',
    label: 'Dashboard',
    path: `${ADMIN_BASE}/overview/dashboard`,
    icon: 'LayoutDashboard',
    children: [
      { id: 'dashboard', label: 'Dashboard', path: `${ADMIN_BASE}/overview/dashboard` },
      { id: 'analytics', label: 'Analytics', path: `${ADMIN_BASE}/overview/analytics` },
      { id: 'revenue', label: 'Revenue', path: `${ADMIN_BASE}/overview/revenue` },
      { id: 'sync-errors', label: 'Sync Errors', path: `${ADMIN_BASE}/overview/sync-errors` },
      { id: 'contact', label: 'Contact', path: `${ADMIN_BASE}/overview/contact` },
    ],
  },
  {
    id: 'users',
    label: 'Users',
    path: `${ADMIN_BASE}/users/subscriptions`,
    icon: 'Users',
    children: [
      { id: 'subscriptions', label: 'All Users', path: `${ADMIN_BASE}/users/subscriptions` },
      { id: 'lifetime', label: 'Lifetime', path: `${ADMIN_BASE}/users/lifetime` },
      { id: 'annual', label: 'Annual', path: `${ADMIN_BASE}/users/annual` },
      { id: 'expired-trials', label: 'Expired Trials', path: `${ADMIN_BASE}/users/expired-trials` },
    ],
  },
  {
    id: 'shop',
    label: 'Shop',
    path: `${ADMIN_BASE}/shop/products`,
    icon: 'ShoppingBag',
    children: [
      { id: 'orders', label: 'Orders', path: `${ADMIN_BASE}/shop/orders`, icon: 'ShoppingCart' },
      { id: 'products', label: 'Products', path: `${ADMIN_BASE}/shop/products`, icon: 'Package' },
      { id: 'marketing', label: 'Marketing', path: `${ADMIN_BASE}/shop/marketing`, icon: 'Megaphone' },
      { id: 'inquiries', label: 'Inquiries', path: `${ADMIN_BASE}/shop/inquiries`, icon: 'ChatCircle' },
    ],
  },
  {
    id: 'comms',
    label: 'Communications',
    path: `${ADMIN_BASE}/comms/emails`,
    icon: 'MailOpen',
    children: [
      { id: 'announcements', label: 'Announcements', path: `${ADMIN_BASE}/comms/announcements` },
      { id: 'emails', label: 'Email', path: `${ADMIN_BASE}/comms/emails` },
      { id: 'notifications', label: 'Notifications', path: `${ADMIN_BASE}/comms/notifications` },
    ],
  },
  {
    id: 'discover',
    label: 'Discover',
    path: `${ADMIN_BASE}/discover`,
    icon: 'Storefront',
    children: [
      { id: 'moderation', label: 'Moderation', path: `${ADMIN_BASE}/discover` },
    ],
  },
  {
    id: 'ai',
    label: 'AI / PiP',
    path: `${ADMIN_BASE}/ai/insights`,
    icon: 'PiP',
    children: [
      { id: 'insights', label: 'Insights', path: `${ADMIN_BASE}/ai/insights` },
      { id: 'costs', label: 'Costs', path: `${ADMIN_BASE}/ai/costs` },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    path: `${ADMIN_BASE}/settings/security`,
    icon: 'Sliders',
    children: [
      { id: 'security', label: 'Security', path: `${ADMIN_BASE}/settings/security` },
      { id: 'deletions', label: 'Deletions', path: `${ADMIN_BASE}/settings/deletions` },
      { id: 'version', label: 'Version', path: `${ADMIN_BASE}/settings/version` },
      { id: 'agreements', label: 'Legal', path: `${ADMIN_BASE}/settings/agreements` },
      { id: 'flags', label: '⚡ Kill Switches', path: `${ADMIN_BASE}/settings/flags` },
      { id: 'subscriptions', label: 'Subscriptions', path: `${ADMIN_BASE}/settings/subscriptions` },
    ],
  },
];

/** Default redirect when visiting /admin */
export const adminDefaultPath = `${ADMIN_BASE}/overview/dashboard`;

/** All leaf paths (for redirects, etc.) */
export const adminPaths = {
  // Overview paths
  overviewDashboard: `${ADMIN_BASE}/overview/dashboard`,
  overviewSupport: `${ADMIN_BASE}/overview/dashboard`, // redirect: support removed, use dashboard
  overviewContact: `${ADMIN_BASE}/overview/contact`,
  overviewAnalytics: `${ADMIN_BASE}/overview/analytics`,
  overviewRevenue: `${ADMIN_BASE}/overview/revenue`,
  overviewAutomation: `${ADMIN_BASE}/overview/dashboard`, // Ghosty removed — legacy alias
  overviewSyncErrors: `${ADMIN_BASE}/overview/sync-errors`,
  // Legacy paths for backward compatibility
  analytics: `${ADMIN_BASE}/overview/analytics`,
  ghostWorker: `${ADMIN_BASE}/overview/dashboard`,
  workQueue: `${ADMIN_BASE}/overview/dashboard`,
  feedback: `${ADMIN_BASE}/overview/dashboard`,
  contact: `${ADMIN_BASE}/overview/contact`,
  // Users paths
  usersSubscriptions: `${ADMIN_BASE}/users/subscriptions`,
  usersLifetime: `${ADMIN_BASE}/users/lifetime`,
  usersAnnual: `${ADMIN_BASE}/users/annual`,
  usersExpiredTrials: `${ADMIN_BASE}/users/expired-trials`,
  // Content paths (hidden from nav — legacy redirects)
  content: `${ADMIN_BASE}/overview/dashboard`,
  improvements: `${ADMIN_BASE}/overview/dashboard`,
  // Comms paths
  commsEmails: `${ADMIN_BASE}/comms/emails`,
  commsTriggers: `${ADMIN_BASE}/comms/emails?view=triggers`,
  commsHistory: `${ADMIN_BASE}/comms/emails?view=history`,
  commsNotificationTracker: `${ADMIN_BASE}/comms/notifications`,
  commsNotifications: `${ADMIN_BASE}/comms/notifications`,
  commsAnnouncements: `${ADMIN_BASE}/comms/announcements`,
  // Discover
  discover: `${ADMIN_BASE}/discover`,
  // Legacy comms paths
  commsPush: `${ADMIN_BASE}/comms/notifications`,
  commsInApp: `${ADMIN_BASE}/comms/announcements`,
  // Settings paths
  settingsSecurity: `${ADMIN_BASE}/settings/security`,
  settingsDeletions: `${ADMIN_BASE}/settings/deletions`,
  settingsVersion: `${ADMIN_BASE}/settings/version`,
  settingsAgreements: `${ADMIN_BASE}/settings/agreements`,
  settingsFlags: `${ADMIN_BASE}/settings/flags`,
  settingsSubscriptions: `${ADMIN_BASE}/settings/subscriptions`,
  aiInsights: `${ADMIN_BASE}/ai/insights`,
  aiCosts: `${ADMIN_BASE}/ai/costs`,
  settingsAiCosts: `${ADMIN_BASE}/ai/costs`, // legacy alias
};
