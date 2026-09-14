import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PresentationChart, CaretRight, Clock, Pulse, CurrencyDollar, Flask, Archive } from '@phosphor-icons/react';
import ExpandableTooltip from '../../ui/ExpandableTooltip';
import { WIDGET_TOOLTIPS } from '../../../utils/widgetTooltips';
import { formatCurrency } from '../../../utils/currencyUtils';
import { calculateScheduledTasksForDate } from '../../../utils/calendarTasks';
import { getTaskCompletion, generateTaskId } from '../../../utils/taskCompletion';
import { toKey } from '../../calendar/MonthGrid';
import { useAppContext } from '../../../context/AppContext';
import { filterAccountHolderRecords } from '../../../utils/buddies';

function useLocal(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function countDayTasks(day, protocols, supplements, reconItems, taskCompletion) {
  const dateKey = toKey(day);
  const scheduledData = calculateScheduledTasksForDate(day, protocols, supplements, reconItems);
  let planned = 0, done = 0;
  Object.keys(scheduledData.bySlot || {}).forEach(timeSlot => {
    const slot = scheduledData.bySlot[timeSlot];
    (slot.peptides || []).forEach(pep => {
      const taskId = generateTaskId({ type: 'peptide', name: pep.name || 'Peptide', dose: pep.dose || '', unit: pep.unit || '', time: timeSlot, protocolId: pep.protocolId, peptideId: pep.peptideId });
      planned++;
      const td = taskCompletion[dateKey]?.[timeSlot]?.[taskId];
      if (td === true || (td && typeof td === 'object' && td.completed)) done++;
    });
    (slot.supplements || []).forEach(supp => {
      const taskId = generateTaskId({ type: 'supplement', name: supp.name || 'Supplement', dose: supp.dose || '', unit: supp.unit || '', time: timeSlot });
      planned++;
      const td = taskCompletion[dateKey]?.[timeSlot]?.[taskId];
      if (td === true || (td && typeof td === 'object' && td.completed)) done++;
    });
  });
  return { planned, done };
}

/** Compute how many days until a protocol's end date (negative = already past). Returns null if no-end. */
function protocolDaysLeft(p) {
  if (!p.active || !p.startDate) return null;
  const d = p.duration || {};
  if (d.noEnd || !d.count || !d.unit) return null;
  const start = new Date(p.startDate);
  const end = new Date(start);
  const unit = String(d.unit).toLowerCase();
  if (unit === 'day') end.setDate(end.getDate() + Number(d.count));
  else if (unit === 'week') end.setDate(end.getDate() + Number(d.count) * 7);
  else if (unit === 'month') end.setMonth(end.getMonth() + Number(d.count));
  return Math.ceil((end - new Date()) / 86400000);
}

const PERIOD_OPTIONS = [7, 14, 30];

const AnalyticsWidget = ({ widget, theme }) => {
  const navigate = useNavigate();
  const { protocols: ctxProtocols, supplements: ctxSupplements, reconItems: ctxReconItems, orders: ctxOrders, stockpile: ctxStockpile } = useAppContext();
  const reconItems = ctxReconItems || [];
  const orders = ctxOrders || [];
  const protocols = useMemo(() => filterAccountHolderRecords(ctxProtocols || []), [ctxProtocols]);
  const supplements = useMemo(() => filterAccountHolderRecords(ctxSupplements || []), [ctxSupplements]);
  const stockpile = useMemo(() => filterAccountHolderRecords(ctxStockpile || []), [ctxStockpile]);
  const protocolHistory = useLocal('tpprover_protocol_history', []);
  const [taskCompletion, setTaskCompletion] = useState(() => getTaskCompletion());
  const [periodDays, setPeriodDays] = useState(30);

  useEffect(() => {
    const refresh = () => setTaskCompletion(getTaskCompletion());
    window.addEventListener('tpp:task-completion-changed', refresh);
    const interval = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('tpp:task-completion-changed', refresh);
      clearInterval(interval);
    };
  }, []);

  const complianceData = useMemo(() => {
    let planned = 0, done = 0;
    const last7 = [];

    for (let i = periodDays - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const r = countDayTasks(d, protocols, supplements, reconItems, taskCompletion);
      planned += r.planned;
      done += r.done;
      if (i < 7) {
        last7.push({ date: d, planned: r.planned, done: r.done, completed: r.planned === 0 || r.done === r.planned });
      }
    }
    const pct = planned > 0 ? Math.round((done / planned) * 100) : 0;

    return { pct, hasData: planned > 0, last7, dosesLogged: done };
  }, [protocols, supplements, reconItems, taskCompletion, periodDays]);

  const spendingData = useMemo(() => {
    const now = new Date();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const periodStart = new Date(); periodStart.setDate(periodStart.getDate() - periodDays);
    let lastMonthSpend = 0, totalSpend = 0, periodSpend = 0;
    const ordersWithCosts = new Set();

    // Spend by compound
    const byCompound = {};

    orders.forEach(order => {
      let itemsCost = 0;
      const settings = JSON.parse(localStorage.getItem('tpprover_settings') || '{}');
      const includeShipping = settings.orders?.includeShippingInCosts ?? true;
      const shippingCost = includeShipping ? (parseFloat(order.shippingCost) || 0) : 0;

      if (order.items && order.items.length > 0) {
        order.items.forEach(item => {
          const cost = (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1);
          itemsCost += cost;
          const name = item.name || 'Other';
          byCompound[name] = (byCompound[name] || 0) + cost;
        });
      } else if (order.cost) {
        itemsCost = parseFloat(String(order.cost).replace(/[^0-9.]/g, '')) || 0;
        const name = order.peptide || 'Other';
        byCompound[name] = (byCompound[name] || 0) + itemsCost;
      }

      const totalCost = itemsCost + shippingCost;
      if (totalCost > 0) {
        ordersWithCosts.add(order.id);
        const orderDate = order.date ? new Date(order.date) : null;
        totalSpend += totalCost;
        if (orderDate && orderDate >= lastMonthStart && orderDate <= lastMonthEnd) lastMonthSpend += totalCost;
        if (orderDate && orderDate >= periodStart) periodSpend += totalCost;
      }
    });

    stockpile.forEach(stockItem => {
      const costPerVial = parseFloat(stockItem.cost) || 0;
      const quantity = parseFloat(stockItem.quantity) || 0;
      const stockItemTotal = costPerVial * quantity;
      if (stockItemTotal > 0 && !(stockItem.orderId && ordersWithCosts.has(stockItem.orderId))) {
        totalSpend += stockItemTotal;
        const purchaseDate = stockItem.purchaseDate ? new Date(stockItem.purchaseDate) : null;
        if (purchaseDate && purchaseDate >= lastMonthStart && purchaseDate <= lastMonthEnd) lastMonthSpend += stockItemTotal;
        if (purchaseDate && purchaseDate >= periodStart) periodSpend += stockItemTotal;
      }
    });

    const avgDailySpend = periodSpend / periodDays;

    const compoundList = Object.entries(byCompound)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return { lastMonthSpend, periodSpend, totalSpend, avgDailySpend, compoundList };
  }, [orders, stockpile, periodDays]);

  const inventoryData = useMemo(() => {
    const stockpileValue = stockpile.reduce((s, item) =>
      s + (parseFloat(item.cost) || 0) * (parseFloat(item.quantity) || 0), 0);
    return { stockpileValue };
  }, [stockpile]);

  const protocolData = useMemo(() => {
    const active = protocols.filter(p => p.active !== false).length;
    const completed = (protocolHistory || []).filter(h => h.endDate && !h.isMock).length;

    // Protocols ending within 14 days
    const endingSoon = protocols
      .filter(p => p.active !== false)
      .map(p => ({ ...p, daysLeft: protocolDaysLeft(p) }))
      .filter(p => p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 14)
      .sort((a, b) => a.daysLeft - b.daysLeft);

    return { active, completed, endingSoon };
  }, [protocols, protocolHistory]);

  const getComplianceColor = (pct) => {
    if (pct >= 90) return theme.primary;
    if (pct >= 70) return theme.isDark ? 'rgba(217, 167, 60, 0.85)' : '#d97706';
    return theme.isDark ? 'rgba(197, 130, 100, 0.9)' : '#b5684a';
  };

  const subtleBg = theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';
  const badgeColor = theme.primaryDark || theme.text;
  const badgeBase = (theme.primaryDark || theme.primary);

  const secondaryStats = [
    {
      label: 'Spent',
      value: formatCurrency(spendingData.periodSpend ?? spendingData.lastMonthSpend),
      Icon: CurrencyDollar,
    },
    {
      label: 'Doses',
      value: complianceData.hasData ? String(complianceData.dosesLogged) : '—',
      Icon: Pulse,
    },
    {
      label: 'Stockpile Value',
      value: formatCurrency(inventoryData.stockpileValue),
      Icon: Archive,
    },
    {
      label: 'Active Protocols',
      value: String(protocolData.active),
      Icon: Flask,
    },
  ];

  return (
    <div
      className="h-full min-h-0 flex flex-col cursor-pointer transition-opacity hover:opacity-95"
      onClick={() => navigate('/app/insights?tab=research')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate('/app/insights?tab=research'); }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 widget-separator" style={{ borderColor: theme.isDark ? 'transparent' : 'rgba(47, 59, 58, 0.4)' }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold flex items-center gap-2 min-w-0" style={{ color: theme.text }}>
            Analytics
            <PresentationChart size={22} weight="duotone" style={{ color: theme.primary }} />
          </h3>
          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <div
              className="flex items-center gap-0.5 p-0.5 rounded-full"
              style={{ backgroundColor: badgeBase + '14' }}
              role="group"
              aria-label="Analytics time range"
            >
              {PERIOD_OPTIONS.map((days) => {
                const selected = periodDays === days;
                return (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setPeriodDays(days)}
                    className="text-[12px] font-bold px-2.5 py-1.5 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 border-0 tabular-nums leading-none"
                    style={{
                      backgroundColor: selected ? badgeBase + '28' : 'transparent',
                      color: badgeColor,
                      boxShadow: selected ? `0 0 0 2px ${badgeBase}30` : 'none',
                    }}
                    aria-pressed={selected}
                    aria-label={`Last ${days} days`}
                  >
                    {days}d
                  </button>
                );
              })}
            </div>
            <ExpandableTooltip content={WIDGET_TOOLTIPS.analytics} theme={theme} />
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4 py-3 flex flex-col gap-3">
        {/* Consistency hero — no nested card */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textLight }}>
            Consistency
          </span>
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-baseline gap-2 flex-shrink-0">
              <span
                className="text-3xl font-bold tabular-nums leading-none"
                style={{ color: complianceData.hasData ? getComplianceColor(complianceData.pct) : theme.textLight }}
              >
                {complianceData.hasData ? `${complianceData.pct}%` : '—'}
              </span>
            </div>

            {/* 7-day strip — fills remaining card width beside % */}
            {complianceData.hasData && (
              <div className="flex flex-1 min-w-0 items-center justify-between">
                {complianceData.last7.map((day) => {
                  const label = ['S', 'M', 'T', 'W', 'T', 'F', 'S'][day.date.getDay()];
                  const hasTasks = day.planned > 0;
                  const isComplete = day.completed && hasTasks;
                  const isPartial = hasTasks && !day.completed && day.done > 0;
                  const isToday = toKey(day.date) === toKey(new Date());

                  return (
                    <div key={day.date.toISOString()} className="flex flex-1 flex-col items-center gap-1.5">
                      <span
                        className="text-[11px] font-bold leading-none"
                        style={{ color: isToday ? theme.primary : theme.textLight, opacity: isToday ? 1 : 0.75 }}
                      >
                        {label}
                      </span>
                      <div
                        style={{
                          width: isToday ? 14 : 12,
                          height: isToday ? 14 : 12,
                          borderRadius: '50%',
                          backgroundColor: !hasTasks
                            ? (theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)')
                            : isComplete
                              ? theme.primary
                              : isPartial
                                ? (theme.isDark ? 'rgba(217,167,60,0.5)' : '#d9770640')
                                : 'transparent',
                          border: !hasTasks || isComplete
                            ? 'none'
                            : `2px solid ${theme.isDark ? 'rgba(197,130,100,0.5)' : '#b5684a50'}`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 2x2 Secondary Grid */}
        <div className="grid grid-cols-2 gap-2">
          {secondaryStats.map((stat) => {
            const Icon = stat.Icon;
            return (
              <div
                key={stat.label}
                className="flex items-center gap-2.5 p-3 rounded-xl transition-colors"
                style={{ backgroundColor: subtleBg, border: `1px solid ${theme.border}` }}
              >
                <Icon size={28} weight="duotone" style={{ color: theme.primary, flexShrink: 0 }} aria-hidden />
                <div className="flex flex-col min-w-0 gap-0.5">
                  <span className="text-lg font-bold tabular-nums truncate leading-tight" style={{ color: theme.text }}>
                    {stat.value}
                  </span>
                  <span className="text-xs font-medium text-ellipsis overflow-hidden whitespace-nowrap" style={{ color: theme.textLight }}>
                    {stat.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Ending soon */}
        {protocolData.endingSoon.length > 0 && (
          <div
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-[11px] mt-1"
            style={{ backgroundColor: theme.isDark ? 'rgba(217,119,6,0.12)' : 'rgba(217,119,6,0.08)' }}
          >
            <div className="flex items-center gap-1.5 min-w-0">
              <Clock size={13} weight="bold" style={{ color: '#d97706', flexShrink: 0 }} />
              <span className="truncate font-medium" style={{ color: theme.text }}>
                {protocolData.endingSoon[0].protocolName || 'Protocol'} ending
              </span>
            </div>
            <span className="font-semibold flex-shrink-0" style={{ color: '#d97706' }}>
              {protocolData.endingSoon[0].daysLeft === 0 ? 'Today' : `${protocolData.endingSoon[0].daysLeft}d`}
            </span>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 mt-auto pt-2">
          <span className="text-sm font-semibold" style={{ color: theme.isDark ? theme.textLight : theme.primary, opacity: 0.9 }}>
            View Insights
          </span>
          <CaretRight size={14} weight="bold" style={{ color: theme.isDark ? theme.textLight : theme.primary, opacity: 0.9 }} />
        </div>
      </div>
    </div>
  );
};

export default AnalyticsWidget;
