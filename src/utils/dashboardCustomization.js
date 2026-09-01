import { isNative } from './platform';

// Dashboard customization utilities
export const WIDGET_TYPES = {
  TASKS: 'tasks',
  UPCOMING_ORDER: 'upcoming_order', 
  UPCOMING_BUYS: 'upcoming_buys',
  PENDING_VENDORS: 'pending_vendors',
  DONT_FORGET: 'dont_forget',
  ANALYTICS: 'analytics',
  COMPLIANCE: 'compliance',
  SPENDING: 'spending',
  LEAD_TIME: 'lead_time',
  INVENTORY: 'inventory',
  BADGES: 'badges',
  GOALS: 'goals_only',
  METRICS: 'metrics_only',
  SUPPLEMENTS: 'supplements',
  QUICK_ACTIONS: 'quick_actions',
  WATER_TRACKER: 'water_tracker',
  GLOSSARY: 'glossary',
  NOTES: 'notes',
  INJECTION_HISTORY: 'injection_history',
  TIPS: 'tips',
  WISHLIST: 'wishlist',
  ACTIVE_PROTOCOLS_NOTES: 'active_protocols_notes'
};

/**
 * Types that no longer render as movable dashboard widgets
 * (home redesign / feature retired). Hidden from Manage Widgets.
 */
export const RETIRED_DASHBOARD_WIDGET_TYPES = new Set([
  WIDGET_TYPES.UPCOMING_BUYS,
  WIDGET_TYPES.PENDING_VENDORS,
  WIDGET_TYPES.DONT_FORGET,
  WIDGET_TYPES.SPENDING,
  WIDGET_TYPES.LEAD_TIME,
  WIDGET_TYPES.INVENTORY,
  WIDGET_TYPES.BADGES,
  WIDGET_TYPES.GOALS,
  WIDGET_TYPES.METRICS,
  WIDGET_TYPES.SUPPLEMENTS,
  WIDGET_TYPES.QUICK_ACTIONS,
  WIDGET_TYPES.WATER_TRACKER,
  WIDGET_TYPES.NOTES,
  WIDGET_TYPES.TIPS,
  WIDGET_TYPES.WISHLIST,
  WIDGET_TYPES.COMPLIANCE,
  WIDGET_TYPES.GLOSSARY,
  WIDGET_TYPES.INJECTION_HISTORY,
  WIDGET_TYPES.ACTIVE_PROTOCOLS_NOTES,
  'goals_only',
  'metrics_only',
  'glossary',
  'injection_history',
  'active_protocols_notes',
  // NOTE: protocols_card is NOT retired — it is a pinned Advanced-mode home card
  // rendered outside WidgetFactory. Do not add it here or loadDashboardLayout will
  // force-disable it and the Active Protocols card disappears.
]);

/** Only these types appear in Manage Widgets (actual dashboard surface). */
export const MANAGEABLE_DASHBOARD_WIDGET_TYPES = new Set([
  WIDGET_TYPES.TASKS,
  WIDGET_TYPES.UPCOMING_ORDER,
  WIDGET_TYPES.ANALYTICS,
]);

/** Bump to force Manage modal remount after widget-surface changes. */
export const MANAGE_WIDGETS_VERSION = 2;

export const WIDGET_SIZES = {
  SMALL: 'small',      // 1x1
  MEDIUM: 'medium',    // 2x1 
  TALL: 'tall',        // 1x2
  LARGE: 'large',      // 2x2
  WIDE: 'wide',        // 3x1
  FULL: 'full'         // full width
};

/**
 * Get responsive size configuration based on screen width
 * Automatically adjusts widget sizing for mobile, tablet, and desktop
 */
export function getResponsiveSizeConfig(screenWidth) {
  // Mobile (< 640px) - Single column layout
  if (screenWidth < 640) {
    return {
      columnsCount: 1,
      columnWidth: '100%',
      gapSize: '1rem',
      sizeMap: {
        [WIDGET_SIZES.SMALL]: { cols: 1, rows: 1 },
        [WIDGET_SIZES.MEDIUM]: { cols: 1, rows: 1 },
        [WIDGET_SIZES.TALL]: { cols: 1, rows: 1 },
        [WIDGET_SIZES.LARGE]: { cols: 1, rows: 1 },
        [WIDGET_SIZES.WIDE]: { cols: 1, rows: 1 },
        [WIDGET_SIZES.FULL]: { cols: 1, rows: 1 }
      }
    };
  }
  
  // Tablet (640px - 1024px) - 2-3 column layout
  if (screenWidth < 1024) {
    return {
      columnsCount: 2,
      columnWidth: 'calc(50% - 0.5rem)',
      gapSize: '1rem',
      sizeMap: {
        [WIDGET_SIZES.SMALL]: { cols: 1, rows: 1 },
        [WIDGET_SIZES.MEDIUM]: { cols: 2, rows: 1 },
        [WIDGET_SIZES.TALL]: { cols: 1, rows: 2 },
        [WIDGET_SIZES.LARGE]: { cols: 2, rows: 2 },
        [WIDGET_SIZES.WIDE]: { cols: 2, rows: 1 },
        [WIDGET_SIZES.FULL]: { cols: 2, rows: 1 }
      }
    };
  }

  // Native tablet (>= 1024px on iOS/Android) - 3 column layout
  // No sidebar on native apps, so use tablet-optimized grid
  if (isNative() && screenWidth < 1280) {
    return {
      columnsCount: 3,
      columnWidth: 'calc(33.333% - 0.667rem)',
      gapSize: '1rem',
      sizeMap: {
        [WIDGET_SIZES.SMALL]: { cols: 1, rows: 1 },
        [WIDGET_SIZES.MEDIUM]: { cols: 2, rows: 1 },
        [WIDGET_SIZES.TALL]: { cols: 1, rows: 2 },
        [WIDGET_SIZES.LARGE]: { cols: 2, rows: 2 },
        [WIDGET_SIZES.WIDE]: { cols: 3, rows: 1 },
        [WIDGET_SIZES.FULL]: { cols: 3, rows: 1 }
      }
    };
  }

  // Desktop (>= 1024px) - Full grid layout
  return {
    columnsCount: 6,
    columnWidth: 'calc(16.666% - 0.833rem)',
    gapSize: '1rem',
    sizeMap: {
      [WIDGET_SIZES.SMALL]: { cols: 1, rows: 1 },
      [WIDGET_SIZES.MEDIUM]: { cols: 2, rows: 1 },
      [WIDGET_SIZES.TALL]: { cols: 1, rows: 2 },
      [WIDGET_SIZES.LARGE]: { cols: 2, rows: 2 },
      [WIDGET_SIZES.WIDE]: { cols: 3, rows: 1 },
      [WIDGET_SIZES.FULL]: { cols: 6, rows: 1 }
    }
  };
}

/** Lean default dashboard for Simple (GLP-1 / single-peptide) mode */
export const SIMPLE_WIDGETS = [
  {
    id: 'tasks',
    type: WIDGET_TYPES.TASKS,
    title: 'Today\'s Research',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 0, y: 0 },
    enabled: true,
    settings: {
      showCompleted: true,
      groupByTime: true
    }
  },
  {
    id: 'quick_actions',
    type: WIDGET_TYPES.QUICK_ACTIONS,
    title: 'Quick Actions',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 2, y: 0 },
    enabled: true,
    settings: {}
  },
  {
    id: 'supplements',
    type: WIDGET_TYPES.SUPPLEMENTS,
    title: 'Supplements',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 3, y: 0 },
    enabled: true,
    settings: {
      showSchedule: true
    }
  },
  {
    id: 'active_protocols_notes',
    type: WIDGET_TYPES.ACTIVE_PROTOCOLS_NOTES,
    title: 'Active Research',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 4, y: 0 },
    enabled: true,
    settings: {}
  },
  {
    id: 'upcoming_order',
    type: WIDGET_TYPES.UPCOMING_ORDER,
    title: 'Incoming Peptides',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 0, y: 1 },
    enabled: true,
    settings: {
      showTracking: true,
      autoRefresh: true
    }
  },
  {
    id: 'inventory',
    type: WIDGET_TYPES.INVENTORY,
    title: 'Stockpile',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 2, y: 1 },
    enabled: true,
    settings: {}
  },
  {
    id: 'tips',
    type: WIDGET_TYPES.TIPS,
    title: 'Helpful Tips',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 0, y: 2 },
    enabled: true,
    settings: {}
  },
];

export const DEFAULT_WIDGETS = [
  // Row 0
  {
    id: 'tasks',
    type: WIDGET_TYPES.TASKS,
    title: 'Today\'s Research',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 0, y: 0 },
    enabled: true,
    settings: {
      showCompleted: true,
      groupByTime: true
    }
  },
  {
    id: 'quick_actions',
    type: WIDGET_TYPES.QUICK_ACTIONS,
    title: 'Quick Actions',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 2, y: 0 },
    enabled: true,
    settings: {}
  },
  {
    id: 'supplements',
    type: WIDGET_TYPES.SUPPLEMENTS,
    title: 'Supplements',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 3, y: 0 },
    enabled: true,
    settings: {
      showSchedule: true
    }
  },
  {
    id: 'active_protocols_notes',
    type: WIDGET_TYPES.ACTIVE_PROTOCOLS_NOTES,
    title: 'Active Research',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 4, y: 0 },
    enabled: true,
    settings: {
      // No maxItems limit - show all active protocols
    }
  },
  // Row 1 - Inventory moved here
  {
    id: 'inventory',
    type: WIDGET_TYPES.INVENTORY,
    title: 'Stockpile',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 0, y: 1 },
    enabled: true,
    settings: {}
  },
  {
    id: 'upcoming_order',
    type: WIDGET_TYPES.UPCOMING_ORDER,
    title: 'Incoming Peptides',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 2, y: 1 },
    enabled: true,
    settings: {
      showTracking: true,
      autoRefresh: true
    }
  },
  {
    id: 'goals_only',
    type: 'goals_only',
    title: 'Goals',
    size: WIDGET_SIZES.SMALL,
    position: { x: 4, y: 1 },
    enabled: false, // Retired from dashboard home
    settings: {
      maxItems: 5
    }
  },
  {
    id: 'spending',
    type: WIDGET_TYPES.SPENDING,
    title: 'Spending',
    size: WIDGET_SIZES.SMALL,
    position: { x: 5, y: 1 },
    enabled: false,
    settings: {}
  },
  // Row 2 - Wishlist before Upcoming Buys
  {
    id: 'compliance',
    type: WIDGET_TYPES.COMPLIANCE,
    title: 'Research Consistency',
    size: WIDGET_SIZES.SMALL,
    position: { x: 0, y: 2 },
    enabled: false,
    settings: {}
  },
  {
    id: 'wishlist',
    type: WIDGET_TYPES.WISHLIST,
    title: 'Wishlist',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 1, y: 2 },
    enabled: true,
    settings: {
      maxItems: 3
    }
  },
  {
    id: 'dont_forget',
    type: WIDGET_TYPES.DONT_FORGET,
    title: "To-Do",
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 3, y: 2 },
    enabled: false, // Retired from dashboard — opens from topbar sheet instead
    settings: {}
  },
  {
    id: 'upcoming_buys',
    type: WIDGET_TYPES.UPCOMING_BUYS,
    title: 'Upcoming Buys',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 4, y: 2 },
    enabled: false, // Retired from dashboard home — managed on Orders
    settings: {
      maxItems: 3
    }
  },
  {
    id: 'notes',
    type: WIDGET_TYPES.NOTES,
    title: 'Research Notes',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 5, y: 2 },
    enabled: true,
    settings: {}
  },
  {
    id: 'water_tracker',
    type: WIDGET_TYPES.WATER_TRACKER,
    title: 'Hydration',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 5, y: 2 },
    enabled: true,
    settings: {
      defaultGoal: 8
    }
  },
  {
    id: 'metrics_only',
    type: 'metrics_only',
    title: 'Bio-Metrics',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 0, y: 3 },
    enabled: true,
    settings: {
      maxItems: 3
    }
  },
  {
    id: 'analytics',
    type: WIDGET_TYPES.ANALYTICS,
    title: 'Analytics',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 5, y: 0 },
    enabled: true,
    settings: {}
  },
  // Row 3
  {
    id: 'glossary',
    type: WIDGET_TYPES.GLOSSARY,
    title: 'Research Glossary',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 2, y: 3 },
    enabled: false, // Hidden - Under construction
    settings: {
      showRecent: true,
      showFavorites: true
    }
  },
  // Optional widgets (disabled by default but available for customization)
  {
    id: 'pending_vendors',
    type: WIDGET_TYPES.PENDING_VENDORS,
    title: 'Pending Vendors',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 0, y: 4 },
    enabled: false, // Hidden by default as it only shows when needed
    settings: {}
  },
  // Tips widget - always at the bottom
  {
    id: 'tips',
    type: WIDGET_TYPES.TIPS,
    title: 'Helpful Tips',
    size: WIDGET_SIZES.MEDIUM,
    position: { x: 0, y: 10 },
    enabled: true,
    settings: {
      rotationInterval: 20
    }
  }
];

export function getWidgetsForTrackingMode(mode) {
  if (mode === 'simple' || mode === 'single_focus' || mode === 'guided') {
    return SIMPLE_WIDGETS.map((w) => ({ ...w, settings: { ...(w.settings || {}) }, position: { ...(w.position || {}) } }));
  }
  return ensureProtocolsCardWidget(
    DEFAULT_WIDGETS.map((w) => ({ ...w, settings: { ...(w.settings || {}) }, position: { ...(w.position || {}) } }))
  );
}

export const WIDGET_METADATA = {
  [WIDGET_TYPES.TASKS]: {
    title: 'Today\'s Research',
    description: 'View and manage your daily supplement and peptide tasks',
    icon: 'CheckSquare',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'showCompleted', label: 'Show completed tasks', type: 'boolean', default: true },
      { key: 'groupByTime', label: 'Group by time slot', type: 'boolean', default: true }
    ]
  },
  [WIDGET_TYPES.UPCOMING_ORDER]: {
    title: 'Incoming Peptides',
    description: 'Shows while you have an active order, then for 3 days after delivery',
    icon: 'Package',
    availableSizes: [WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'showTracking', label: 'Show tracking info', type: 'boolean', default: true },
      { key: 'autoRefresh', label: 'Auto-refresh tracking', type: 'boolean', default: true }
    ]
  },
  [WIDGET_TYPES.UPCOMING_BUYS]: {
    title: 'Upcoming Buys',
    description: 'View scheduled group buys and purchases',
    icon: 'ShoppingCart',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'maxItems', label: 'Max items to show', type: 'number', default: 3, min: 1, max: 10 }
    ]
  },
  [WIDGET_TYPES.PENDING_VENDORS]: {
    title: 'Pending Vendors',
    description: 'Complete vendor information for auto-created vendors',
    icon: 'Users',
    availableSizes: [WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: []
  },
  [WIDGET_TYPES.DONT_FORGET]: {
    title: "To-Do",
    description: 'Follow-ups, ending protocols, and missing profile details — with what is missing and for which item',
    icon: 'ClipboardList',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: []
  },
  [WIDGET_TYPES.ANALYTICS]: {
    title: 'Analytics',
    description: 'Quick snapshot of consistency, spending, and protocols. Tap to open full analytics.',
    icon: 'TrendingUp',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM],
    settings: []
  },
  [WIDGET_TYPES.BADGES]: {
    title: 'Your Badges',
    description: 'Track your achievement progress',
    icon: 'Award',
    availableSizes: [WIDGET_SIZES.MEDIUM, WIDGET_SIZES.WIDE, WIDGET_SIZES.FULL],
    settings: [
      { key: 'showProgress', label: 'Show progress bar', type: 'boolean', default: true }
    ]
  },
  [WIDGET_TYPES.GOALS]: {
    title: 'Goals & Metrics',
    description: 'Track your research goals and body metrics',
    icon: 'Target',
    availableSizes: [WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'showMetrics', label: 'Show body metrics', type: 'boolean', default: true },
      { key: 'showGoals', label: 'Show goals', type: 'boolean', default: true },
      { key: 'maxItems', label: 'Max items to show', type: 'number', default: 5, min: 1, max: 10 }
    ]
  },
  [WIDGET_TYPES.COMPLIANCE]: {
    title: 'Research Consistency',
    description: 'Track your supplement compliance and streaks',
    icon: 'CheckCircle',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM],
    settings: []
  },
  [WIDGET_TYPES.SPENDING]: {
    title: 'Spending',
    description: 'Monitor your monthly and total spending',
    icon: 'DollarSign',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM],
    settings: []
  },
  [WIDGET_TYPES.LEAD_TIME]: {
    title: 'Average Delivery',
    description: 'Track delivery times and vendor performance',
    icon: 'Truck',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM],
    settings: []
  },
  [WIDGET_TYPES.INVENTORY]: {
    title: 'Stockpile',
    description: 'Monitor stock levels and low inventory alerts',
    icon: 'Archive',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM],
    settings: []
  },
  ['goals_only']: {
    title: 'Goals',
    description: 'Track and manage your research goals',
    icon: 'Target',
    availableSizes: [WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'maxItems', label: 'Max items to show', type: 'number', default: 5, min: 1, max: 10 }
    ]
  },
  ['metrics_only']: {
    title: 'Bio-Metrics',
    description: 'Record and track your body metrics',
    icon: 'Activity',
    availableSizes: [WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'maxItems', label: 'Max items to show', type: 'number', default: 3, min: 1, max: 10 }
    ]
  },
  [WIDGET_TYPES.SUPPLEMENTS]: {
    title: 'Supplements',
    description: 'Manage your supplement schedule',
    icon: 'Pill',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'showSchedule', label: 'Show schedule', type: 'boolean', default: true }
    ]
  },
  [WIDGET_TYPES.QUICK_ACTIONS]: {
    title: 'Quick Actions',
    description: 'Essential actions: reconstitute, add to stockpile, add vendor, add protocol',
    icon: 'Zap',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM],
    settings: []
  },
  [WIDGET_TYPES.WATER_TRACKER]: {
    title: 'Hydration',
    description: 'Track daily water intake with customizable goals',
    icon: 'Droplets',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM],
    settings: [
      { key: 'defaultGoal', label: 'Default daily goal (glasses)', type: 'number', default: 8, min: 1, max: 20 }
    ]
  },
  [WIDGET_TYPES.GLOSSARY]: {
    title: 'Research Glossary',
    description: 'Comprehensive inline peptide research tool with search, browse, and notes',
    icon: 'BookOpen',
    availableSizes: [WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE, WIDGET_SIZES.WIDE, WIDGET_SIZES.FULL],
    settings: [
      { key: 'showRecent', label: 'Show recent searches', type: 'boolean', default: true },
      { key: 'showFavorites', label: 'Show favorite entries', type: 'boolean', default: true }
    ]
  },
  [WIDGET_TYPES.NOTES]: {
    title: 'Research Notes',
    description: 'Quick note-taking for research observations and ideas',
    icon: 'FileText',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: []
  },
  [WIDGET_TYPES.INJECTION_HISTORY]: {
    title: 'View History',
    description: 'Track your injection sites and history for better rotation',
    icon: 'Pipette',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM],
    settings: [
      { key: 'showRecent', label: 'Number of recent injections to show', type: 'number', default: 5, min: 1, max: 20 }
    ]
  },
  [WIDGET_TYPES.TIPS]: {
    title: 'Helpful Tips',
    description: 'Rotating tips to help you discover app features and functionality',
    icon: 'Lightbulb',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'rotationInterval', label: 'Rotation interval (seconds)', type: 'number', default: 20, min: 10, max: 60 }
    ]
  },
  [WIDGET_TYPES.WISHLIST]: {
    title: 'Wishlist',
    description: 'Track research items you want to purchase or investigate',
    icon: 'Heart',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [
      { key: 'maxItems', label: 'Max items to show', type: 'number', default: 3, min: 1, max: 10 }
    ]
  },
  [WIDGET_TYPES.ACTIVE_PROTOCOLS_NOTES]: {
    title: 'Active Research',
    description: 'View all active research protocols and add notes. View All opens the Protocols page.',
    icon: 'FlaskConical',
    availableSizes: [WIDGET_SIZES.SMALL, WIDGET_SIZES.MEDIUM, WIDGET_SIZES.LARGE],
    settings: [] // No limit - always show all active protocols
  }
};

// Grid layout utilities
export const GRID_COLS = 4;
export const GRID_ROWS = 10;

/**
 * Get widget size configuration with responsive support
 * @param {string} size - Widget size constant from WIDGET_SIZES
 * @param {number} screenWidth - Current screen width (optional, defaults to window width)
 * @returns {object} { w: width in grid units, h: height in grid units }
 */
export const getSizeConfig = (size, screenWidth = null) => {
  const width = screenWidth || (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const responsiveConfig = getResponsiveSizeConfig(width);
  
  // For mobile/tablet (and native tablet), return responsive sizing
  const useResponsive = width < 1024 || (isNative() && width < 1280);
  if (useResponsive && responsiveConfig.sizeMap[size]) {
    return { 
      w: responsiveConfig.sizeMap[size].cols, 
      h: responsiveConfig.sizeMap[size].rows 
    };
  }
  
  // Desktop sizing (original behavior)
  switch (size) {
    case WIDGET_SIZES.SMALL:
      return { w: 1, h: 1 };
    case WIDGET_SIZES.MEDIUM:
      return { w: 2, h: 1 };
    case WIDGET_SIZES.TALL:
      return { w: 1, h: 2 };
    case WIDGET_SIZES.LARGE:
      return { w: 2, h: 2 };
    case WIDGET_SIZES.WIDE:
      return { w: 3, h: 1 };
    case WIDGET_SIZES.FULL:
      return { w: 4, h: 2 };
    default:
      return { w: 2, h: 1 };
  }
};

// Storage utilities
export const STORAGE_KEY = 'tpprover_dashboard_layout';

/** Pinned Active Protocols card — Advanced home only; not in Manage Widgets. */
export const PROTOCOLS_CARD_WIDGET = {
  id: 'protocols_card',
  type: 'protocols_card',
  enabled: true,
  size: WIDGET_SIZES.MEDIUM,
  position: { x: 0, y: -1 },
};

/**
 * Ensure the Active Protocols card exists and stays enabled.
 * Hidden in Simple mode at render time; must not be force-disabled by layout load.
 */
export function ensureProtocolsCardWidget(widgets) {
  const list = Array.isArray(widgets) ? [...widgets] : [];
  const idx = list.findIndex((w) => w.id === 'protocols_card' || w.type === 'protocols_card');
  if (idx === -1) {
    list.unshift({ ...PROTOCOLS_CARD_WIDGET });
  } else {
    list[idx] = { ...list[idx], enabled: true, type: 'protocols_card', id: 'protocols_card' };
  }
  return list;
}

export const loadDashboardLayout = () => {
  try {
    // Check if we need to force a reset due to widget size updates
    const layoutVersion = localStorage.getItem('tpprover_dashboard_version');
    const currentVersion = '3.13'; // UPDATED: Active Research widget widened to MEDIUM
    
    if (layoutVersion !== currentVersion) {
      localStorage.setItem('tpprover_dashboard_version', currentVersion);
      localStorage.removeItem(STORAGE_KEY);
      return ensureProtocolsCardWidget(DEFAULT_WIDGETS);
    }
    
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      
      // CRITICAL FIX: Remove duplicate widgets from saved layouts
      const cleanedParsed = removeDuplicateWidgets(parsed);
      
      // Merge with defaults for any missing widgets
      const merged = mergeDashboardLayouts(DEFAULT_WIDGETS, cleanedParsed);
      
      // Remove badges and lead_time widgets (features not implemented yet)
      const filtered = merged.filter(w => 
        w.type !== WIDGET_TYPES.BADGES && w.type !== WIDGET_TYPES.LEAD_TIME
      );

      // Force-disable widgets retired from the dashboard surface
      for (const w of filtered) {
        if (RETIRED_DASHBOARD_WIDGET_TYPES.has(w.type) || RETIRED_DASHBOARD_WIDGET_TYPES.has(w.id)) {
          w.enabled = false;
        }
      }
      
      // Ensure wishlist widget is present (for users upgrading to version 3.4+)
      const hasWishlist = filtered.some(w => w.id === 'wishlist' || w.type === WIDGET_TYPES.WISHLIST);
      if (!hasWishlist) {
        const wishlistWidget = DEFAULT_WIDGETS.find(w => w.id === 'wishlist');
        if (wishlistWidget) {
          filtered.push(wishlistWidget);
        }
      }
      
      // Ensure active protocols notes widget is present (for users upgrading to version 3.5+)
      const hasActiveProtocolsNotes = filtered.some(w => w.id === 'active_protocols_notes' || w.type === WIDGET_TYPES.ACTIVE_PROTOCOLS_NOTES);
      if (!hasActiveProtocolsNotes) {
        const activeProtocolsNotesWidget = DEFAULT_WIDGETS.find(w => w.id === 'active_protocols_notes');
        if (activeProtocolsNotesWidget) {
          filtered.push(activeProtocolsNotesWidget);
        }
      }
      
      // Ensure Action Items widget is present (for users upgrading to version 3.8+)
      const hasDontForget = filtered.some(w => w.id === 'dont_forget' || w.type === WIDGET_TYPES.DONT_FORGET);
      if (!hasDontForget) {
        const dontForgetWidget = DEFAULT_WIDGETS.find(w => w.id === 'dont_forget');
        if (dontForgetWidget) {
          filtered.push(dontForgetWidget);
        }
      }
      
      // Ensure supplements widget is present and in third position (for users upgrading to version 3.9+)
      let supplementsWidget = filtered.find(w => w.id === 'supplements' || w.type === WIDGET_TYPES.SUPPLEMENTS);
      if (supplementsWidget) {
        // Force update position to third position (x:3, y:0)
        supplementsWidget.position = { x: 3, y: 0 };
        supplementsWidget.enabled = true;
      } else {
        // Add supplements widget if it doesn't exist
        const defaultSupplementsWidget = DEFAULT_WIDGETS.find(w => w.id === 'supplements');
        if (defaultSupplementsWidget) {
          filtered.push(defaultSupplementsWidget);
          supplementsWidget = defaultSupplementsWidget;
        }
      }
      
      // Ensure inventory widget is moved to row 1 when supplements is in third position
      const inventoryWidget = filtered.find(w => w.id === 'inventory' || w.type === WIDGET_TYPES.INVENTORY);
      if (inventoryWidget && supplementsWidget && supplementsWidget.position?.x === 3) {
        inventoryWidget.position = { x: 0, y: 1 };
      }

      // Force-enable Hydration & Bio-Metrics widgets (quick-action surfaces on dashboard)
      const quickActionIds = ['water_tracker', 'metrics_only'];
      for (const id of quickActionIds) {
        const w = filtered.find(x => x.id === id);
        if (w) { w.enabled = true; }
      }
      
      return ensureProtocolsCardWidget(compactGrid(filtered));
    }
  } catch (error) {
    console.warn('Failed to load dashboard layout:', error);
  }
  return ensureProtocolsCardWidget(DEFAULT_WIDGETS);
};

export const saveDashboardLayout = (widgets, { userId } = {}) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
  } catch (error) {
    console.error('Failed to save dashboard layout:', error);
  }

  // Fire-and-forget cloud sync for cross-device persistence
  if (userId) {
    syncDashboardLayoutToCloud(userId, widgets).catch((err) => {
      console.warn('Failed to sync dashboard layout to cloud:', err);
    });
  }
};

/**
 * Persist dashboard layout into userPreferences.dashboardLayout
 */
export async function syncDashboardLayoutToCloud(userId, widgets) {
  if (!userId || !widgets) return false;
  const { saveUserPreferences, loadUserPreferences } = await import('../services/cloudStorage');
  const existing = (await loadUserPreferences(userId)) || {};
  return saveUserPreferences(userId, {
    ...existing,
    dashboardLayout: widgets,
    dashboardLayoutUpdatedAt: new Date().toISOString(),
  });
}

/**
 * Load dashboard layout from cloud preferences if present.
 * Returns merged widgets or null if cloud has nothing useful.
 */
export async function loadDashboardLayoutFromCloud(userId) {
  if (!userId) return null;
  try {
    const { loadUserPreferences } = await import('../services/cloudStorage');
    const prefs = await loadUserPreferences(userId);
    if (Array.isArray(prefs?.dashboardLayout) && prefs.dashboardLayout.length > 0) {
      const cleaned = removeDuplicateWidgets(prefs.dashboardLayout);
      const merged = mergeDashboardLayouts(DEFAULT_WIDGETS, cleaned);
      const filtered = merged.filter(w =>
        w.type !== WIDGET_TYPES.BADGES && w.type !== WIDGET_TYPES.LEAD_TIME
      );
      for (const w of filtered) {
        if (RETIRED_DASHBOARD_WIDGET_TYPES.has(w.type) || RETIRED_DASHBOARD_WIDGET_TYPES.has(w.id)) {
          w.enabled = false;
        }
      }
      const withProtocolsCard = ensureProtocolsCardWidget(filtered);
      // Mirror into localStorage so offline / subsequent loads stay in sync
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(withProtocolsCard));
      } catch {
        /* ignore */
      }
      return compactGrid(withProtocolsCard);
    }
  } catch (error) {
    console.warn('Failed to load dashboard layout from cloud:', error);
  }
  return null;
}

// Remove duplicate widgets from saved layouts (cleanup function)
export const removeDuplicateWidgets = (widgets) => {
  const seenIds = new Set();
  const seenTypes = new Set();
  const duplicateTypes = new Set(['compliance', 'spending', 'lead_time']); // Known duplicates
  
  return widgets.filter(widget => {
    // Remove duplicates by ID (primary check)
    if (seenIds.has(widget.id)) {
      return false;
    }
    seenIds.add(widget.id);
    
    // For known problematic types, also check by type
    if (duplicateTypes.has(widget.id) || duplicateTypes.has(widget.type)) {
      const key = widget.id || widget.type;
      if (seenTypes.has(key)) {
        return false;
      }
      seenTypes.add(key);
    }
    
    return true; // Keep widget
  });
};

export const mergeDashboardLayouts = (defaultWidgets, savedWidgets) => {
  const savedMap = new Map(savedWidgets.map(w => [w.id, w]));
  
  const mergedWidgets = defaultWidgets.map(defaultWidget => {
    const savedWidget = savedMap.get(defaultWidget.id);
    if (savedWidget) {
      // Merge settings, keeping defaults for missing settings
      const mergedSettings = { ...defaultWidget.settings, ...savedWidget.settings };
      const merged = { ...defaultWidget, ...savedWidget, settings: mergedSettings };
      
      // Force widen widgets that were previously SMALL to MEDIUM (desktop cleanup v3.12)
      const widenToMedium = ['quick_actions', 'inventory', 'analytics', 'dont_forget', 'upcoming_buys', 'notes', 'water_tracker', 'active_protocols_notes'];
      if (widenToMedium.includes(merged.id)) {
        merged.size = WIDGET_SIZES.MEDIUM;
      }
      
      // Force update supplements widget position to third position (x:3, y:0)
      if (merged.id === 'supplements' || merged.type === WIDGET_TYPES.SUPPLEMENTS) {
        merged.position = { x: 3, y: 0 };
      }
      
      // Force update inventory widget position to first position of row 1 (x:0, y:1)
      // This ensures inventory moves to where supplements was, making supplements the third widget
      if (merged.id === 'inventory' || merged.type === WIDGET_TYPES.INVENTORY) {
        merged.position = { x: 0, y: 1 };
      }
      
      return merged;
    }
    // If default widget doesn't exist in saved layout, add it (for new widgets like wishlist)
    return defaultWidget;
  });

  // Also check for any saved widgets that aren't in defaults (user-added custom widgets)
  // and add them back
  const defaultIds = new Set(defaultWidgets.map(w => w.id));
  const additionalWidgets = savedWidgets.filter(w => !defaultIds.has(w.id));
  
  // Apply grid compaction to remove empty spaces
  return compactGrid([...mergedWidgets, ...additionalWidgets]);
};

// Grid compaction function to eliminate empty spaces
export const compactGrid = (widgets) => {
  if (!widgets || widgets.length === 0) return widgets;

  // Filter only enabled widgets
  const enabledWidgets = widgets.filter(w => w.enabled);
  const disabledWidgets = widgets.filter(w => !w.enabled);

  // Sort by current position (y first, then x) to maintain relative order
  // Tips widget always goes last
  enabledWidgets.sort((a, b) => {
    // Tips widget always goes last
    if (a.type === WIDGET_TYPES.TIPS) return 1;
    if (b.type === WIDGET_TYPES.TIPS) return -1;
    
    const aY = a.position?.y || 0;
    const bY = b.position?.y || 0;
    if (aY !== bY) return aY - bY;
    const aX = a.position?.x || 0;
    const bX = b.position?.x || 0;
    return aX - bX;
  });

  // Create a grid to track occupied spaces
  const grid = [];
  const GRID_COLS = 6; // 6-column grid

  // Get widget dimensions based on size (matching getSizeConfig)
  const getWidgetDimensions = (size) => {
    switch (size) {
      case WIDGET_SIZES.SMALL: return { width: 1, height: 1 };
      case WIDGET_SIZES.MEDIUM: return { width: 2, height: 1 };
      case WIDGET_SIZES.TALL: return { width: 1, height: 2 };
      case WIDGET_SIZES.LARGE: return { width: 2, height: 2 };
      case WIDGET_SIZES.WIDE: return { width: 3, height: 1 };
      case WIDGET_SIZES.FULL: return { width: 4, height: 2 };
      default: return { width: 2, height: 1 };
    }
  };

  // Helper functions for grid management
  const isPositionAvailable = (x, y, width, height) => {
    // Check bounds
    if (x < 0 || y < 0 || x + width > GRID_COLS) return false;
    
    // Check if position is already occupied
    for (let row = y; row < y + height; row++) {
      for (let col = x; col < x + width; col++) {
        if (grid[row] && grid[row][col]) return false;
      }
    }
    return true;
  };

  const markPositionOccupied = (x, y, width, height) => {
    for (let row = y; row < y + height; row++) {
      if (!grid[row]) grid[row] = [];
      for (let col = x; col < x + width; col++) {
        grid[row][col] = true;
      }
    }
  };

  // Separate Tips widget to always place it at the bottom
  const tipsWidget = enabledWidgets.find(w => w.type === WIDGET_TYPES.TIPS);
  const otherWidgets = enabledWidgets.filter(w => w.type !== WIDGET_TYPES.TIPS);
  
  // Reposition widgets to eliminate gaps (excluding Tips)
  const compactedWidgets = otherWidgets.map(widget => {
    const { width, height } = getWidgetDimensions(widget.size);
    
    // Find the first available position starting from top-left
    let bestY = 0, bestX = 0, found = false;

    for (let y = 0; y < 50 && !found; y++) { // Max 50 rows
      for (let x = 0; x <= GRID_COLS - width && !found; x++) {
        if (isPositionAvailable(x, y, width, height)) {
          bestX = x; bestY = y; found = true;
        }
      }
    }

    markPositionOccupied(bestX, bestY, width, height);
    return { ...widget, position: { x: bestX, y: bestY } };
  });

  // Add Tips widget at the bottom (highest y position)
  const result = [...compactedWidgets];
  if (tipsWidget) {
    // Find the highest y position and place Tips below it
    const maxY = compactedWidgets.length > 0 
      ? Math.max(...compactedWidgets.map(w => (w.position?.y || 0) + getWidgetDimensions(w.size).height))
      : 0;
    const tipsDimensions = getWidgetDimensions(tipsWidget.size);
    result.push({ 
      ...tipsWidget, 
      position: { x: 0, y: maxY } 
    });
  }

  return [...result, ...disabledWidgets];
};

export const resetDashboardLayout = () => {
  localStorage.removeItem(STORAGE_KEY);
  return DEFAULT_WIDGETS;
};

// Widget position utilities
export const findEmptyPosition = (widgets, size) => {
  const { w, h } = getSizeConfig(size);
  const occupied = new Set();
  
  // Mark all occupied positions
  widgets.forEach(widget => {
    const { w: widgetW, h: widgetH } = getSizeConfig(widget.size);
    for (let x = widget.position.x; x < widget.position.x + widgetW; x++) {
      for (let y = widget.position.y; y < widget.position.y + widgetH; y++) {
        occupied.add(`${x},${y}`);
      }
    }
  });
  
  // Find first empty position that fits
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x <= GRID_COLS - w; x++) {
      let canFit = true;
      for (let dx = 0; dx < w && canFit; dx++) {
        for (let dy = 0; dy < h && canFit; dy++) {
          if (occupied.has(`${x + dx},${y + dy}`)) {
            canFit = false;
          }
        }
      }
      if (canFit) {
        return { x, y };
      }
    }
  }
  
  // If no space found, place at end
  return { x: 0, y: Math.max(...widgets.map(w => w.position.y + getSizeConfig(w.size).h), 0) };
};

export const validateWidgetPosition = (widget, widgets, excludeId = null) => {
  const { w, h } = getSizeConfig(widget.size);
  const { x, y } = widget.position;
  
  // Check bounds
  if (x < 0 || y < 0 || x + w > GRID_COLS) {
    return false;
  }
  
  // Check for overlaps
  const otherWidgets = widgets.filter(w => w.id !== excludeId);
  for (const other of otherWidgets) {
    const { w: otherW, h: otherH } = getSizeConfig(other.size);
    const { x: otherX, y: otherY } = other.position;
    
    // Check if rectangles overlap
    if (!(x >= otherX + otherW || x + w <= otherX || y >= otherY + otherH || y + h <= otherY)) {
      return false;
    }
  }
  
  return true;
};

// ─── Mode-aware layout switching ───────────────────────────────────────────────

const MODE_LAYOUT_KEY = {
  advanced: 'tpprover_dashboard_layout_advanced',
  simple: 'tpprover_dashboard_layout_simple',
  single_focus: 'tpprover_dashboard_layout_simple',
  guided: 'tpprover_dashboard_layout_simple',
};

function _modeKey(mode) {
  return MODE_LAYOUT_KEY[String(mode).toLowerCase()] || null;
}

/**
 * Back up the current shared dashboard layout for `fromMode`, then restore
 * (or default) the layout for `toMode` and write it to the shared key.
 *
 * Call this instead of `saveDashboardLayout(getWidgetsForTrackingMode(next))`
 * whenever the tracking mode changes so each mode keeps its own layout.
 */
export function switchModeDashboardLayout(fromMode, toMode) {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    const fromKey = _modeKey(fromMode);
    if (fromKey && currentRaw) {
      localStorage.setItem(fromKey, currentRaw);
    }

    const toKey = _modeKey(toMode);
    let nextWidgets = null;
    if (toKey) {
      const saved = localStorage.getItem(toKey);
      if (saved) {
        try { nextWidgets = JSON.parse(saved); } catch { nextWidgets = null; }
      }
    }
    if (!nextWidgets) {
      nextWidgets = getWidgetsForTrackingMode(toMode);
    }

    // Advanced mode always pins Active Protocols after Today's Research
    const toNormalized = String(toMode).toLowerCase();
    if (toNormalized === 'advanced' || toNormalized === 'multi_protocol') {
      nextWidgets = ensureProtocolsCardWidget(nextWidgets);
    }

    saveDashboardLayout(nextWidgets);
    return nextWidgets;
  } catch (err) {
    console.warn('switchModeDashboardLayout failed, falling back to defaults', err);
    let fallback = getWidgetsForTrackingMode(toMode);
    const toNormalized = String(toMode).toLowerCase();
    if (toNormalized === 'advanced' || toNormalized === 'multi_protocol') {
      fallback = ensureProtocolsCardWidget(fallback);
    }
    saveDashboardLayout(fallback);
    return fallback;
  }
}
