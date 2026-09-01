import React, { useState, useEffect } from 'react'
import { formatMMDDYYYY } from '../../pages/../utils/date'
import { Pill, ShoppingCart, TestTube, CheckCircle, PenNib, Syringe, SprayBottle, HandPalm, FileText, Flag, Heartbeat } from '@phosphor-icons/react'
import { isTaskCompleted, generateTaskId } from '../../utils/taskCompletion'
import { getChromeGradient } from '../../utils/recon'
import { penColors } from '../../utils/penColors'
import { areWashoutIconsEnabled, areGroupBuysEnabled } from '../../utils/featureSettings'
import { getNotesForDate } from '../../utils/protocolHistory'
import { getCalendarNoteText } from '../../utils/calendarNotesMigration'
import { loadSideEffects } from '../../utils/sideEffectsLog'
import BadgeBump from '../ui/BadgeBump'

// Helper function to get supplement icon based on delivery method
function getSupplementIcon(delivery, className = "h-3 w-3") {
    switch (String(delivery || '').toLowerCase()) {
        case 'injection': return <Syringe className={className} weight="duotone" />;
        case 'powder': return <TestTube className={className} weight="duotone" />;
        case 'pill':
        case 'oral':
        default: return <Pill className={className} weight="duotone" />;
    }
}

// Helper function to get pen color
const getResolvedPenColor = (penColor) => {
  if (!penColor) return '#9ca3af';
  const raw = String(penColor || '').trim();
  // Type safety: ensure raw is a string before calling startsWith
  if (typeof raw !== 'string' || !raw) return '#9ca3af';
  const isHex = raw.startsWith('#');
  if (isHex) return raw;
  
  const foundColor = penColors.find(color => 
    color.name.toLowerCase() === raw.toLowerCase()
  );
  
  return foundColor ? foundColor.hex : '#9ca3af';
};

// Helper function to get delivery icon for peptides
function getPeptideDeliveryIcon(item, className = "h-3 w-3") {
    if (typeof item === 'object' && item.deliveryMethod) {
        switch (item.deliveryMethod) {
            case 'pen': return <PenNib className={className} weight="duotone" />;
            case 'syringe':
            case 'pipette': return <Syringe className={className} weight="duotone" />;
            case 'nasal': return <SprayBottle className={className} weight="duotone" />;
            case 'topical': return <HandPalm className={className} weight="duotone" />;
            default: return <Syringe className={className} weight="duotone" />;
        }
    }
    return <Syringe className={className} weight="duotone" />;
}

function doseCountBubbleStyle(theme) {
    return {
        backgroundColor: theme?.isDark
            ? (theme.secondary || 'rgba(160, 180, 153, 0.18)')
            : (theme.secondary || '#EFF2EE'),
        color: theme?.primaryDark || theme?.primary || '#5F7F76',
        border: `1.5px solid ${theme?.isDark
            ? `${theme.primaryLight || theme.primary}40`
            : `${theme.primaryLight || theme.primary}55`}`,
        boxShadow: theme?.isDark ? '0 1px 2px rgba(0,0,0,0.35)' : '0 1px 2px rgba(95, 127, 118, 0.12)',
    };
}

function ActivityIconWithCount({ count, theme, badgeClassName = '-top-2 -right-2.5', children }) {
    if (!count) return null;
    return (
        <div className="relative inline-flex items-center justify-center">
            {children}
            {count > 1 && (
                <BadgeBump
                    count={count}
                    max={99}
                    className={`absolute ${badgeClassName} pointer-events-none text-[11px] sm:text-xs font-bold`}
                    style={{
                        ...doseCountBubbleStyle(theme),
                        minWidth: 20,
                        height: 20,
                        paddingLeft: 4,
                        paddingRight: 4,
                    }}
                />
            )}
        </div>
    );
}

function DoseIconGroup({ peptideDoseCount, supplementDoseCount, buyCount, groupBuysEnabled, theme, iconColor, className = '' }) {
    const totalDoseCount = peptideDoseCount + supplementDoseCount;
    const hasIcons = peptideDoseCount > 0 || supplementDoseCount > 0 || (groupBuysEnabled && buyCount > 0);
    if (!hasIcons) return null;

    return (
        <div className={`flex flex-col items-center gap-0.5 ${className}`}>
            <div className="flex items-center justify-center gap-1">
                {peptideDoseCount > 0 && (
                    <Syringe size={24} weight="duotone" style={{ color: iconColor }} />
                )}
                {supplementDoseCount > 0 && (
                    <Pill size={24} weight="duotone" style={{ color: iconColor }} />
                )}
                {groupBuysEnabled && buyCount > 0 && (
                    <ShoppingCart size={24} weight="duotone" style={{ color: iconColor }} />
                )}
            </div>
            {totalDoseCount > 1 && (
                <span
                    className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold tabular-nums leading-none"
                    style={doseCountBubbleStyle(theme)}
                >
                    {totalDoseCount}
                </span>
            )}
        </div>
    );
}

function DayIndicatorBadge({ theme, title, children, variant = 'neutral' }) {
    const sideFxAccent = theme.primaryDark || theme.primary || '#5F7F76';
    const isSideFx = variant === 'sideFx';

    return (
        <span
            className="inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 rounded border leading-none"
            style={isSideFx ? {
                backgroundColor: theme.isDark ? `${sideFxAccent}28` : `${sideFxAccent}20`,
                borderColor: theme.isDark ? `${sideFxAccent}45` : `${sideFxAccent}35`,
            } : {
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
                borderColor: theme.isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db',
                color: theme.isDark ? theme.text : '#1f2937',
            }}
            title={title}
        >
            {children}
        </span>
    );
}

function getMonthDays(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1)
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const days = []
  
  // Get week starts on setting
  const weekStartsOn = (() => {
    try {
      const settings = JSON.parse(localStorage.getItem('tpprover_settings') || '{}');
      return settings.region?.weekStartsOn || 'monday';
    } catch {
      return 'monday';
    }
  })();
  
  const firstWeekday = start.getDay() // 0-6 (0=Sunday, 6=Saturday)
  
  // Calculate padding days before the first day
  let paddingDays = 0;
  if (weekStartsOn === 'sunday') {
    // No padding if Sunday start (day 0)
    paddingDays = firstWeekday;
  } else {
    // Monday start: Sunday (0) needs 1 day of padding
    // Monday (1) needs 0 days of padding
    // Tuesday (2) needs 1 day of padding, etc.
    paddingDays = (firstWeekday + 6) % 7;
  }
  
  for (let i = 0; i < paddingDays; i++) days.push(null)
  for (let d = 1; d <= end.getDate(); d++) days.push(new Date(date.getFullYear(), date.getMonth(), d))
  return days
}

// Helper function to check if a peptide is completed
function isPeptideCompleted(peptide, date, timeSlot) {
  const task = {
    name: typeof peptide === 'object' ? peptide.name : peptide,
    dose: typeof peptide === 'object' ? peptide.dose : '',
    unit: typeof peptide === 'object' ? peptide.unit : '',
    type: 'peptide',
    time: timeSlot,
    protocolId: peptide?.protocolId,
    peptideId: peptide?.peptideId
  };
  const taskId = generateTaskId(task);
  const dateKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  return isTaskCompleted(taskId, dateKey, timeSlot);
}

function MetricIndicator({ metric, theme }) {
    const indicatorColor = {
        'Good': theme.success,
        'High': theme.error,
        'Great': theme.success,
        'Bad': theme.error,
        'Low': theme.warning,
    }[metric.value] || theme.textLight;

    return <div className="w-2 h-2 rounded-full" style={{ backgroundColor: indicatorColor }} title={`${metric.type}: ${metric.value}`} />;
}

/** Desktop month cells: fixed name caps by breakpoint (no height-based jitter). */
function useMonthCellDisplayLimits() {
  const [nameLimit, setNameLimit] = useState(0);

  useEffect(() => {
    const update = () => {
      const w = window.innerWidth;
      if (w < 1024) {
        setNameLimit(0);
        return;
      }
      setNameLimit(w >= 1536 ? 4 : 3);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return nameLimit;
}

export default function MonthGrid({ date, entries = {}, scheduled = {}, onDayClick, theme, protocolTimelines = [], calendarBump = 0, todayPulse = false, planChangeDayKey = null, planChangeTitle = '' }) {
  const [forceRender, setForceRender] = useState(0);
  const [sideEffects, setSideEffects] = useState(() => loadSideEffects());
  const nameLimit = useMonthCellDisplayLimits();
  const sideFxAccent = theme.primaryDark || theme.primary || '#5F7F76';
  
  // Listen for task completion events to force re-render
  useEffect(() => {
    const handleTaskCompletionChange = (e) => {
      console.log('📡 MonthGrid received task completion event:', e.detail);
      setForceRender(prev => prev + 1);
    };
    
    window.addEventListener('tpp:task-completion-changed', handleTaskCompletionChange);
    
    return () => {
      window.removeEventListener('tpp:task-completion-changed', handleTaskCompletionChange);
    };
  }, []);

  useEffect(() => {
    const refreshSideEffects = () => setSideEffects(loadSideEffects());
    window.addEventListener('tpp:side-effects-updated', refreshSideEffects);
    return () => window.removeEventListener('tpp:side-effects-updated', refreshSideEffects);
  }, []);
  
  const days = Array.isArray(getMonthDays(date)) ? getMonthDays(date) : [];
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
      weeks.push(days.slice(i, i + 7));
  }

  // Get week starts on setting and build appropriate headers
  const weekStartsOn = (() => {
    try {
      const settings = JSON.parse(localStorage.getItem('tpprover_settings') || '{}');
      return settings.region?.weekStartsOn || 'monday';
    } catch {
      return 'monday';
    }
  })();
  
  const weekdayHeaders = weekStartsOn === 'sunday' 
    ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  
  // Check if washout icons should be shown
  const showWashoutIcons = areWashoutIconsEnabled();
  // Check if group buys are enabled
  const groupBuysEnabled = areGroupBuysEnabled();
  
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="grid grid-cols-7 text-xs mb-1 flex-shrink-0" style={{ color: theme.textLight }}>
        {weekdayHeaders.map(d => <div key={d} className="px-1 py-0.5 sm:px-1.5 md:px-2 text-center">
            <span className="hidden sm:inline text-xs md:text-sm">{d}</span>
            <span className="sm:hidden text-xs">{d.charAt(0)}</span>
        </div>)}
      </div>
      <div className="flex flex-col gap-1 sm:gap-1.5 md:gap-2 flex-1 min-h-0">
        {weeks.map((week, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2 relative flex-1 min-h-0">
                

                {week.map((d, i) => {
                    const key = d ? toKey(d) : ''
                    const entryText = d && entries[key] ? 
                        getCalendarNoteText(entries, key).slice(0, 40) : ''
                    const daySideEffects = d ? sideEffects.filter((e) => e.date === key) : []
                    const sched = (d && scheduled[key]) || {}
                    const peptides = Array.from(new Set([
                        ...(sched.bySlot?.AM?.peptides || []), 
                        ...(sched.bySlot?.PM?.peptides || [])
                    ]))
                    const allSupplements = [
                        ...(sched.bySlot?.AM?.supplements || []),
                        ...(sched.bySlot?.PM?.supplements || [])
                    ];
                    const peptideDoseCount = (sched.bySlot?.AM?.peptides?.length || 0) + (sched.bySlot?.PM?.peptides?.length || 0);
                    const supplementDoseCount = allSupplements.length;
                    const hasWashout = showWashoutIcons && sched.washout && sched.washout.length > 0;
                    // Get unique delivery methods for icon display
                    const deliveryMethods = [...new Set(allSupplements.map(s => typeof s === 'object' ? s.delivery : 'oral'))];
                    const primaryDelivery = deliveryMethods[0] || 'oral';
                    // Count regular orders and group buys (if enabled)
                    const regularBuys = sched.buys || 0;
                    const groupBuysCount = groupBuysEnabled ? (sched.groupBuys?.length || 0) : 0;
                    const buyCount = regularBuys + groupBuysCount;
                    const dayGoals = sched.goals || []
                    const completedGoals = dayGoals.filter(g => g.completed).length
                    const totalGoals = dayGoals.length
                    
                    // Calculate actual task completion status
                    let totalTasks = 0;
                    let completedTasks = 0;
                    
                    // Count tasks from bySlot structure
                    if (sched.bySlot) {
                        Object.keys(sched.bySlot).forEach(timeSlot => {
                            const slot = sched.bySlot[timeSlot];
                            if (slot.peptides) {
                                slot.peptides.forEach(peptide => {
                                    const task = {
                                        name: typeof peptide === 'object' ? peptide.name : peptide,
                                        dose: typeof peptide === 'object' ? peptide.dose : '',
                                        unit: typeof peptide === 'object' ? peptide.unit : '',
                                        type: 'peptide',
                                        time: timeSlot,
                                        protocolId: peptide?.protocolId,
                                        peptideId: peptide?.peptideId
                                    };
                                    const taskId = generateTaskId(task);
                                    const dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                                    totalTasks++;
                                    if (isTaskCompleted(taskId, dateKey, timeSlot)) {
                                        completedTasks++;
                                    }
                                });
                            }
                            if (slot.supplements) {
                                slot.supplements.forEach(supplement => {
                                    const task = {
                                        name: typeof supplement === 'object' ? supplement.name : supplement,
                                        dose: typeof supplement === 'object' ? supplement.dose : '',
                                        unit: typeof supplement === 'object' ? supplement.unit : '',
                                        type: 'supplement',
                                        time: timeSlot
                                    };
                                    const taskId = generateTaskId(task);
                                    const dateKey = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                                    totalTasks++;
                                    if (isTaskCompleted(taskId, dateKey, timeSlot)) {
                                        completedTasks++;
                                    }
                                });
                            }
                        });
                    }
                    
                    // Determine if all tasks are completed
                    const allTasksCompleted = totalTasks > 0 && completedTasks === totalTasks;
                    
                    const hasActivity = peptideDoseCount > 0 || supplementDoseCount > 0 || buyCount > 0 || totalGoals > 0;
                    const isToday = d && new Date().toDateString() === d.toDateString();
                    
                    const iconColor = theme.isDark ? '#a8b5a0' : '#73796D';

                    const peptideNames = peptides.map(p => typeof p === 'object' ? (p.name || '') : p).filter(Boolean);
                    const supplementNames = allSupplements.map(s => typeof s === 'object' ? (s.name || '') : s).filter(Boolean);
                    const allTaskNames = [...new Set([...peptideNames, ...supplementNames])];
                    const visibleTaskNames = nameLimit > 0 ? allTaskNames.slice(0, nameLimit) : [];
                    const hiddenTaskCount = Math.max(0, allTaskNames.length - visibleTaskNames.length);
                    const showDesktopNames = nameLimit > 0 && allTaskNames.length > 0;
                    const showDesktopIconsOnly = nameLimit > 0 && !showDesktopNames && hasActivity;

                    return (
                        <button key={i} className={`p-1 sm:p-2 md:p-3 rounded-lg text-left hover:shadow-md transition-all duration-200 flex flex-col relative h-full min-h-0 overflow-hidden ${allTasksCompleted ? 'opacity-60' : ''} ${isToday && todayPulse ? 'animate-pulse' : ''} ${hasWashout ? 'max-sm:shadow-[inset_0_0_0_1.5px_rgba(200,122,92,0.28)]' : ''}`} style={{ 
                            border: isToday 
                              ? `1.5px solid ${theme.isDark ? theme.primary + '50' : theme.primary + '45'}`
                              : `1px solid ${allTasksCompleted ? (theme.isDark ? '#4b5563' : '#D1D5DB') : theme.border}`,
                            background: d ? (
                                isToday
                                  ? (theme.isDark
                                      ? `linear-gradient(180deg, ${theme.primary}40 0%, ${theme.primary}15 40%, rgba(31,41,55,0.95) 100%)`
                                      : `linear-gradient(180deg, ${theme.primary}30 0%, ${theme.primary}14 45%, rgba(255,255,255,0.95) 100%)`)
                                  : allTasksCompleted ? (theme.isDark ? '#1f2937' : '#F3F4F6')
                                  : hasActivity ? (theme.isDark ? '#1f2937' : theme.primary + '05')
                                  : theme.isDark ? '#111827' : theme.cardBackground
                            ) : 'transparent',
                            boxShadow: isToday 
                              ? (theme.isDark 
                                  ? `0 0 12px ${theme.primary}20, 0 0 0 1px ${theme.primary}18, inset 0 1px 0 ${theme.primary}10` 
                                  : `0 0 12px ${theme.primary}15, 0 0 0 1px ${theme.primary}12, inset 0 1px 0 ${theme.primary}08`)
                              : (todayPulse && isToday ? `0 0 0 3px ${theme.primary}40` : 'none'),
                        }} onClick={() => d && onDayClick?.(d)} disabled={!d}>
                            <div className="flex flex-col h-full min-h-0 relative">
                                {/* Date row */}
                                <div className="flex items-start justify-between mb-1">
                                    <span className={`text-sm sm:text-base md:text-xl font-bold ${isToday ? 'bg-white rounded-full w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 flex justify-center items-center text-xs sm:text-sm md:text-xl' : ''}`} style={{ 
                                        backgroundColor: isToday ? theme.primary : 'transparent',
                                        color: isToday ? theme.textOnPrimary : (d ? (theme.isDark ? theme.text : theme.primaryDark) : theme.textLight),
                                        boxShadow: isToday ? `0 2px 8px ${theme.primary}40` : 'none',
                                    }}>
                                        {d ? d.getDate() : ''}
                                    </span>
                                </div>

                                {/* Trial / subscription ended marker (free plan) */}
                                {d && planChangeDayKey && key === planChangeDayKey && (
                                    <div
                                        className="absolute bottom-1 left-1 z-[1] inline-flex items-center justify-center rounded px-0.5 py-px"
                                        style={{
                                            backgroundColor: theme.isDark ? 'rgba(212,160,48,0.22)' : 'rgba(212,160,48,0.35)',
                                            border: `1px solid ${theme.isDark ? 'rgba(212,160,48,0.45)' : 'rgba(180,130,40,0.5)'}`,
                                        }}
                                        title={planChangeTitle || 'Plan changed'}
                                    >
                                        <Flag size={10} weight="fill" style={{ color: '#B8860B' }} aria-hidden />
                                    </div>
                                )}
                                {d && (
                                    <div className="absolute top-1 right-1 hidden sm:block">
                                        {allTasksCompleted ? (
                                            <CheckCircle 
                                                size={14}
                                                className="sm:size-4 md:size-5 flex-shrink-0" 
                                                weight="fill"
                                                style={{ color: '#4CAF50' }}
                                                title="All tasks completed"
                                            />
                                        ) : (
                                            <div 
                                                className="w-2 h-2 sm:w-2.5 sm:h-2.5 md:w-3 md:h-3 rounded-full flex-shrink-0" 
                                                style={{ backgroundColor: '#73796D' }}
                                                title={`${completedTasks}/${totalTasks} tasks completed`}
                                            />
                                        )}
                                    </div>
                                )}

                                {/* Icons under the number */}
                                {d && (
                                    <>
                                        <DoseIconGroup
                                            peptideDoseCount={peptideDoseCount}
                                            supplementDoseCount={supplementDoseCount}
                                            buyCount={buyCount}
                                            groupBuysEnabled={groupBuysEnabled}
                                            theme={theme}
                                            iconColor={iconColor}
                                            className="sm:hidden mx-auto mt-1 py-0.5"
                                        />
                                        {/* Tablet: same grouped icons + combined total */}
                                        <DoseIconGroup
                                            peptideDoseCount={peptideDoseCount}
                                            supplementDoseCount={supplementDoseCount}
                                            buyCount={buyCount}
                                            groupBuysEnabled={groupBuysEnabled}
                                            theme={theme}
                                            iconColor={iconColor}
                                            className="hidden sm:flex lg:hidden mx-auto mt-1 py-0.5"
                                        />
                                        {/* Desktop fallback when day has activity but no task labels */}
                                        {showDesktopIconsOnly && (
                                            <div className="hidden lg:flex justify-center items-center gap-2 mt-1">
                                                <ActivityIconWithCount count={peptideDoseCount} theme={theme} badgeClassName="-top-1.5 -right-2.5">
                                                    <Syringe className="w-5 h-5" weight="duotone" style={{ color: iconColor }} />
                                                </ActivityIconWithCount>
                                                <ActivityIconWithCount count={supplementDoseCount} theme={theme} badgeClassName="-top-1.5 -right-2.5">
                                                    <Pill className="w-5 h-5" weight="duotone" style={{ color: iconColor }} />
                                                </ActivityIconWithCount>
                                                {groupBuysEnabled && (
                                                    <ActivityIconWithCount count={buyCount} theme={theme} badgeClassName="-top-1.5 -right-2.5">
                                                        <ShoppingCart className="w-5 h-5" weight="duotone" style={{ color: iconColor }} />
                                                    </ActivityIconWithCount>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Desktop: compact single-column task list */}
                                {showDesktopNames && (
                                    <div className="hidden lg:block mt-1.5 min-w-0">
                                        <ul className="flex flex-col gap-0.5 min-w-0">
                                            {visibleTaskNames.map((name, idx) => (
                                                <li
                                                    key={`name-${idx}`}
                                                    className="px-1.5 py-0.5 rounded text-[10px] leading-snug truncate"
                                                    style={{
                                                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : theme.secondary,
                                                        color: theme.text,
                                                    }}
                                                    title={name}
                                                >
                                                    {name}
                                                </li>
                                            ))}
                                            {hiddenTaskCount > 0 && (
                                                <li
                                                    className="px-1.5 py-0.5 rounded text-[10px] leading-snug truncate font-medium"
                                                    style={{
                                                        backgroundColor: 'transparent',
                                                        color: theme.textLight,
                                                        border: `1px dashed ${theme.isDark ? 'rgba(255,255,255,0.15)' : theme.border}`,
                                                    }}
                                                    title="Click this day to see the full schedule"
                                                >
                                                    +{hiddenTaskCount} more
                                                </li>
                                            )}
                                        </ul>
                                    </div>
                                )}

                                <div className="mt-auto flex-shrink-0 w-full min-w-0">
                                {/* Bottom indicators — side effects & notes on mobile; washout badge tablet+ */}
                                {(daySideEffects.length > 0 || entryText) && (
                                    <div className="flex items-center justify-center gap-2 max-w-full min-w-0 sm:hidden py-0.5">
                                        {entryText && (
                                            <FileText
                                                size={18}
                                                weight="duotone"
                                                style={{ color: iconColor }}
                                                title={entryText}
                                            />
                                        )}
                                        {daySideEffects.length > 0 && (
                                            <Heartbeat
                                                size={18}
                                                weight="duotone"
                                                style={{ color: sideFxAccent }}
                                                title={`Side effects (${daySideEffects.length}): ${daySideEffects.map((e) => e.label || e.effect).join(', ')}`}
                                            />
                                        )}
                                    </div>
                                )}
                                {(hasWashout || daySideEffects.length > 0 || entryText) && (
                                    <div className="hidden sm:flex flex-wrap items-center justify-start gap-1.5 max-w-full min-w-0">
                                        {hasWashout && (
                                            <DayIndicatorBadge
                                                theme={theme}
                                                title={`Washout: ${sched.washout.map(w => typeof w === 'object' && w !== null ? w.name : w).join(', ')}`}
                                            >
                                                <span className="text-[9px] sm:text-[10px] font-bold leading-none">W</span>
                                            </DayIndicatorBadge>
                                        )}
                                        {entryText && (
                                            <DayIndicatorBadge theme={theme} title={entryText}>
                                                <FileText className="w-2.5 h-2.5 sm:w-3 sm:h-3" weight="bold" />
                                            </DayIndicatorBadge>
                                        )}
                                        {daySideEffects.length > 0 && (
                                            <DayIndicatorBadge
                                                theme={theme}
                                                variant="sideFx"
                                                title={`Side effects (${daySideEffects.length}): ${daySideEffects.map((e) => e.label || e.effect).join(', ')}`}
                                            >
                                                <Heartbeat className="w-2.5 h-2.5 sm:w-3 sm:h-3" weight="duotone" style={{ color: sideFxAccent }} />
                                            </DayIndicatorBadge>
                                        )}
                                    </div>
                                )}
                                </div>
                            </div>
                        </button>
                    )
                })}
            </div>
        ))}
        </div>
    </div>
  )
}

export function toKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}


