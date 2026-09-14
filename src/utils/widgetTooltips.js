// Tooltip content for each widget type
// Format: { title, body } where body lines use [icon-name] text
// Icons match the widget header icons from Lucide React
export const WIDGET_TOOLTIPS = {
  tasks: {
    title: "About Today's Research",
    body: `Check off today's scheduled doses, split by AM/PM. Delivery icons show how each dose is taken — pens include color and name. Completing an injection can prompt for the injection site.`,
  },

  upcoming_order: {
    title: 'About Incoming Orders',
    body: `[Truck] Real time tracking for orders
[Truck] Edit tracking numbers in the orders page`,
  },

  upcoming_buys: {
    title: 'About Upcoming Buys',
    body: `[ShoppingCart] Don't miss a buy
[ShoppingCart] Track upcoming group buys with host and vendor details`,
  },

  pending_vendors: {
    title: 'About Pending Vendors',
    body: `[BookAlert] Complete new vendors profile that were added during a protocol, order, or stockpile`,
  },

  dont_forget: {
    title: "About Don't Forget",
    body: `[ClipboardList] Follow-ups, ending protocols, and incomplete profiles
[ClipboardList] Shows what's missing and which item needs it
[ClipboardList] Simple mode only nudges fields you can edit in that mode
[ClipboardList] Tap a row to take action, or X to dismiss`,
  },

  analytics: {
    title: 'About Analytics',
    body: `[TrendingUp] Quick snapshot of your research consistency, spending, and protocols`,
  },

  badges: {
    title: 'About Badges',
    body: `[Award] Track your achievement progress and unlock badges as you reach research milestones. Celebrate your consistency and dedication`,
  },

  goals_only: {
    title: 'About Goals',
    body: `[Target] Set goals for your research
[Target] Monitor progress of set goal`,
  },

  compliance: {
    title: 'About Consistency',
    body: `[CheckCircle] Compliance based on what is scheduled vs what has been marked as completed
[CheckCircle] Day streak of how many days full research scheduled is completed`,
  },

  spending: {
    title: 'About Spending',
    body: `[DollarSign] 30 day spending
[DollarSign] Last 90 day
[DollarSign] Overall spent on research peptides`,
  },

  lead_time: {
    title: 'About Lead Time',
    body: `[Truck] Track average delivery times and vendor performance. Identify which vendors provide the fastest and most reliable shipping`,
  },

  inventory: {
    title: 'About Inventory',
    body: `[Package] Monitor your the top 3 in your stockpile
[Package] Monitor your lowest 2 peptides`,
  },

  metrics_only: {
    title: 'About Metrics',
    body: `[Activity] Record and track body metrics over the last 7 days`,
  },

  supplements: {
    title: 'About Supplements',
    body: `[Pill] Manage supplements that are not labeled 'peptides'
[Pill] Oral, Injection, and Powder organization
[Pill] Syncs with Today's Research and the Calendar`,
  },

  quick_actions: {
    title: 'About Quick Actions',
    body: `[Zap] Essential Research Actions
[Zap] Reconstitute opens up peptide calculator
[Zap] Orders opens up a new order
[Zap] Vendors opens up a new vendor
[Zap] Protocol opens up a new protocol`,
  },

  water_tracker: {
    title: 'About Water Tracker',
    body: `[Droplets] Track daily water intake with custom goals`,
  },

  glossary: {
    title: 'About Glossary',
    body: `[BookOpen] Quickly look up broad info on a peptide or compound`,
  },

  notes: {
    title: 'About Notes',
    body: `[FileText] Quick note-taking for research observations and ideas. Capture thoughts, side effects, or important findings during your research`,
  },

  injection_history: {
    title: 'About Injection History',
    body: `[Pipette] Track your injection sites and history for better rotation. Monitor injection locations to prevent site fatigue and ensure proper administration`,
  },

  tips: {
    title: 'About Tips',
    body: `[Lightbulb] Rotating tips to help you discover app features and functionality. Learn new ways to make the app work for your research`,
  },

  wishlist: {
    title: 'About Wishlist',
    body: `[Heart] Track research items you want to purchase or investigate
[Heart] Build a list of peptides, supplements, or equipment for future research`,
  },

  active_protocols_notes: {
    title: 'About Active Protocols',
    body: `See your active research protocols at a glance. Log side effects or notes from home, tap a protocol for full details, or open View all for the complete list.`,
  },

  as_needed: {
    title: 'About As Needed',
    body: `Log a dose outside your schedule? These are protocols you take only when needed — not on a fixed schedule. Tap + to log a dose, or ⋮ to remove one from this list.`,
  },
};
