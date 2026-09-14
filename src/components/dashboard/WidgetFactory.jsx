import React, { useState, useEffect } from 'react';
import { WIDGET_TYPES } from '../../utils/dashboardCustomization';
import TasksWidget from './widgets/TasksWidget';
import UpcomingOrderWidget from './widgets/UpcomingOrderWidget';
import UpcomingBuysWidget from './widgets/UpcomingBuysWidget';
import PendingVendorsWidget from './widgets/PendingVendorsWidget';
import DontForgetWidget from './widgets/DontForgetWidget';
import AnalyticsWidget from './widgets/AnalyticsWidget';
import ComplianceWidget from './widgets/ComplianceWidget';
import SpendingWidget from './widgets/SpendingWidget';
import LeadTimeWidget from './widgets/LeadTimeWidget';
import InventoryWidget from './widgets/InventoryWidget';
import BadgesWidget from './widgets/BadgesWidget';
import GoalsOnlyWidget from './widgets/GoalsOnlyWidget';
import MetricsWidget from './widgets/MetricsWidget';
import SupplementsWidget from './widgets/SupplementsWidget';
import QuickActionsWidget from './widgets/QuickActionsWidget';
import WaterTrackerWidget from './widgets/WaterTrackerWidget';
import GlossaryWidget from './widgets/GlossaryWidget';
import NotesWidget from './widgets/NotesWidget';
import InjectionHistoryWidget from './widgets/InjectionHistoryWidget';
import TipsWidget from './widgets/TipsWidget';
import WishlistWidget from './widgets/WishlistWidget';
import ActiveProtocolsNotesWidget from './widgets/ActiveProtocolsNotesWidget';

const WidgetFactory = ({ widget, theme, isReadOnly, onUpgrade, ...props }) => {
  const [groupBuysEnabled, setGroupBuysEnabled] = useState(true);
  
  // Check if group buys are enabled
  useEffect(() => {
    import('../../utils/featureSettings').then(({ areGroupBuysEnabled }) => {
      setGroupBuysEnabled(areGroupBuysEnabled());
    });
  }, []);
  
  // Don't render UpcomingBuysWidget if group buys are disabled
  if (widget.type === WIDGET_TYPES.UPCOMING_BUYS && !groupBuysEnabled) {
    return null;
  }
  
  switch (widget.type) {
    case WIDGET_TYPES.TASKS:
      return (
        <TasksWidget 
          widget={widget} 
          theme={theme} 
          tasks={props.tasks}
          onToggle={props.onTaskToggle}
          onSlotMove={props.onSlotMove}
          onResetSlotMove={props.onResetSlotMove}
          onSkipDose={props.onSkipDose}
          onUndoSkip={props.onUndoSkip}
          onRescheduleToTomorrow={props.onRescheduleToTomorrow}
          onRescheduleToDate={props.onRescheduleToDate}
          onClearCatchUp={props.onClearCatchUp}
          scheduleActionsDisabled={props.isReadOnly}
          onOpenQuickStart={props.onOpenQuickStart}
          onOpenFullSetup={props.onOpenFullSetup}
          onOpenLogOneOff={props.onOpenLogOneOff}
          asNeededProtocols={props.asNeededProtocols}
          onLogAsNeeded={props.onLogAsNeeded}
          onRemoveAsNeeded={props.onRemoveAsNeeded}
        />
      );
      
    case WIDGET_TYPES.UPCOMING_ORDER:
      return (
        <UpcomingOrderWidget 
          widget={widget} 
          theme={theme} 
          order={props.incomingOrder}
          orders={Array.isArray(props.incomingOrders) ? props.incomingOrders : undefined}
          onNewOrder={props.onNewOrder}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );
      
    case WIDGET_TYPES.UPCOMING_BUYS:
      return (
        <UpcomingBuysWidget 
          widget={widget} 
          theme={theme} 
          buys={props.upcomingBuys}
          onAdd={props.onAddBuy}
          onOpenBuy={props.onOpenBuy}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );
      
    case WIDGET_TYPES.PENDING_VENDORS:
      // Same content as To-Do sheet: follow-ups, ending soon, incomplete stockpile/vendors (mode-aware)
      return (
        <DontForgetWidget
          widget={widget}
          theme={theme}
          vendors={props.vendors}
          stockpile={props.stockpile}
          onCompleteVendor={props.onCompleteVendor}
          onViewAllVendors={props.onViewAllVendors}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );

    case WIDGET_TYPES.DONT_FORGET:
      return (
        <DontForgetWidget 
          widget={widget} 
          theme={theme} 
          vendors={props.vendors}
          stockpile={props.stockpile}
          onCompleteVendor={props.onCompleteVendor}
          onViewAllVendors={props.onViewAllVendors}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );
      
    case WIDGET_TYPES.ANALYTICS:
      return (
        <AnalyticsWidget 
          widget={widget} 
          theme={theme} 
        />
      );

    case WIDGET_TYPES.COMPLIANCE:
      return (
        <ComplianceWidget 
          widget={widget} 
          theme={theme} 
        />
      );

    case WIDGET_TYPES.SPENDING:
      return (
        <SpendingWidget 
          widget={widget} 
          theme={theme} 
        />
      );

    case WIDGET_TYPES.LEAD_TIME:
      return (
        <LeadTimeWidget 
          widget={widget} 
          theme={theme} 
        />
      );

    case WIDGET_TYPES.INVENTORY:
      return (
        <InventoryWidget 
          widget={widget} 
          theme={theme}
          onOpenStockpileAdd={props.onOpenStockpileAdd}
        />
      );
      
    case WIDGET_TYPES.BADGES:
      return (
        <BadgesWidget 
          widget={widget} 
          theme={theme} 
        />
      );
      
    case WIDGET_TYPES.GOALS:
      return (
        <GoalsOnlyWidget 
          widget={widget} 
          theme={theme} 
          goals={props.goals}
          onGoalToggle={props.onGoalToggle}
          onAddGoal={props.onAddGoal}
          onEditGoal={props.onEditGoal}
        />
      );

    case 'goals_only':
      return (
        <GoalsOnlyWidget 
          widget={widget} 
          theme={theme} 
          goals={props.goals}
          onGoalToggle={props.onGoalToggle}
          onAddGoal={props.onAddGoal}
          onEditGoal={props.onEditGoal}
        />
      );

    case 'metrics_only':
      return (
        <MetricsWidget 
          widget={widget} 
          theme={theme} 
          metrics={props.metrics}
          onAddMetric={props.onAddMetric}
          onEditMetric={props.onEditMetric}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );
      
    case WIDGET_TYPES.SUPPLEMENTS:
      return (
        <SupplementsWidget 
          widget={widget} 
          theme={theme} 
          supplements={props.supplements || []}
          onAddSupplement={props.onAddSupplement}
          onEditSupplement={props.onEditSupplement}
          onDeleteSupplement={props.onDeleteSupplement}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );

    case WIDGET_TYPES.QUICK_ACTIONS:
      return (
        <QuickActionsWidget 
          widget={widget} 
          theme={theme}
        />
      );

    case WIDGET_TYPES.WATER_TRACKER:
      return (
        <WaterTrackerWidget 
          widget={widget} 
          theme={theme}
        />
      );

    case WIDGET_TYPES.GLOSSARY:
      return (
        <GlossaryWidget 
          widget={widget} 
          theme={theme}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );

    case WIDGET_TYPES.NOTES:
      return (
        <NotesWidget 
          widget={widget} 
          theme={theme}
          protocols={props.protocols}
        />
      );
      
    case WIDGET_TYPES.INJECTION_HISTORY:
      return (
        <InjectionHistoryWidget 
          widget={widget} 
          theme={theme}
        />
      );

    case WIDGET_TYPES.TIPS:
      return (
        <TipsWidget 
          widget={widget} 
          theme={theme}
        />
      );

    case WIDGET_TYPES.WISHLIST:
      return (
        <WishlistWidget 
          widget={widget} 
          theme={theme} 
          wishlist={props.wishlist}
          onAdd={props.onAddWishlistItem}
          onEdit={props.onEditWishlistItem}
          onAcquire={props.onWishlistAcquire}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );

    case WIDGET_TYPES.ACTIVE_PROTOCOLS_NOTES:
      return (
        <ActiveProtocolsNotesWidget 
          widget={widget} 
          theme={theme} 
          protocols={props.protocols}
          onAddNote={props.onAddProtocolNote}
          onOpenQuickStart={props.onOpenQuickStart}
          onOpenFullSetup={props.onOpenFullSetup}
          isReadOnly={isReadOnly}
          onUpgrade={onUpgrade}
        />
      );
      
    default:
      return (
        <div className="h-full flex flex-col p-4">
          <div className={`px-4 py-3 ${theme.isDark ? '' : 'border-b'}`} style={{ borderColor: theme.isDark ? 'transparent' : theme.border }}>
            <h3 className="text-base font-bold flex items-center gap-2" style={{ color: theme.text }}>
              {widget.title || 'Unknown Widget'}
              <span className="text-xs font-normal px-2 py-1 rounded" style={{ backgroundColor: theme.error + '20', color: theme.error }}>
                Unknown Type
              </span>
            </h3>
          </div>
          <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
            <div className="mb-4">
              <div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: theme.error + '20' }}>
                <span className="text-2xl">⚠️</span>
              </div>
            </div>
            <p className="text-sm font-medium mb-2" style={{ color: theme.text }}>
              Unknown Widget Type
            </p>
            <p className="text-xs mb-1" style={{ color: theme.textLight }}>
              Type: <code className="px-2 py-1 rounded" style={{ backgroundColor: theme.isDark ? '#374151' : '#f3f4f6', color: theme.text }}>{widget.type || 'undefined'}</code>
            </p>
            <p className="text-xs" style={{ color: theme.textLight }}>
              ID: <code className="px-2 py-1 rounded" style={{ backgroundColor: theme.isDark ? '#374151' : '#f3f4f6', color: theme.text }}>{widget.id || 'undefined'}</code>
            </p>
            <p className="text-xs mt-4 px-4" style={{ color: theme.textLight }}>
              This widget type is not recognized. Please check your dashboard configuration or contact support.
            </p>
          </div>
        </div>
      );
  }
};

export default WidgetFactory;
