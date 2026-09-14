import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Pill, Check, PenNib, TestTube, Syringe, SprayBottle, HandPalm, Sun, Moon, DotsThreeVertical, ArrowCounterClockwise, SkipForward, CalendarCheck, CalendarBlank } from '@phosphor-icons/react';
import { X } from 'lucide-react';
import InjectionSiteSelector from '../common/InjectionSiteSelector';
import GlassmorphismDatePicker from '../common/GlassmorphismDatePicker';
import { getChromeGradient, isColorDark } from '../../utils/recon';
import { penColors } from '../../utils/penColors';
import { isInjectionSiteTrackingEnabled } from '../../utils/injectionSiteSettings';
import { OWNER_SELF, darkenHex as accentMultiply } from '../../utils/buddies';
import { toKey } from '../calendar/MonthGrid';
import DoseStatusChip from '../common/DoseStatusChip';
import { getDoseStatusChipInfo } from '../../utils/doseStatusChip';
import { getLocalDateString } from '../../utils/date';
import useBlockingOverlayClear from '../../hooks/useBlockingOverlayClear';
import useSpotlightTransition from '../../hooks/useSpotlightTransition';

/** One-time eye-catcher on the dose ⋮ menu (reschedule / skip / catch-up). */
const RESCHEDULE_SPOTLIGHT_KEY = 'tpp_reschedule_menu_spotlight_done_v1';

function isScheduleMenuEligible(task, {
    timeSlot,
    scheduleActionsDisabled,
    onSlotMove,
    onSkipDose,
    onRescheduleToTomorrow,
    onRescheduleToDate,
    onUndoSkip,
    onClearCatchUp,
}) {
    const isOneOff = !!(task?.isOneOff || task?.type === 'one_off');
    return (
        !isOneOff &&
        !scheduleActionsDisabled &&
        !!timeSlot &&
        !!(onSlotMove || onSkipDose || onRescheduleToTomorrow || onRescheduleToDate || onUndoSkip || onClearCatchUp) &&
        (task?.time === 'AM' || task?.time === 'PM')
    );
}

function markRescheduleSpotlightDone() {
    try {
        localStorage.setItem(RESCHEDULE_SPOTLIGHT_KEY, '1');
    } catch {
        /* ignore */
    }
}

function isRescheduleSpotlightDone() {
    try {
        return localStorage.getItem(RESCHEDULE_SPOTLIGHT_KEY) === '1';
    } catch {
        return true;
    }
}

const colorMap = penColors.reduce((acc, c) => ({ ...acc, [c.hex.toLowerCase()]: c.name }), {});

/** Darken a hex color by blending with black (ratio 0–1, e.g. 0.15 = 15% darker) */
function darkenHex(hex, ratio = 0.15) {
    if (!hex || typeof hex !== 'string') return hex;
    const clean = hex.replace(/^#/, '');
    if (clean.length !== 6 && clean.length !== 8) return hex;
    const r = Math.max(0, Math.round(parseInt(clean.slice(0, 2), 16) * (1 - ratio)));
    const g = Math.max(0, Math.round(parseInt(clean.slice(2, 4), 16) * (1 - ratio)));
    const b = Math.max(0, Math.round(parseInt(clean.slice(4, 6), 16) * (1 - ratio)));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
// Preferred display names to match Reconstitution UI exactly
const penLabelOverrides = {
    '#f59e0b': 'Gold', // Amber -> Gold
    '#ffd700': 'Gold',
    '#d4af37': 'Gold',
};
// Name → Hex mapping to harmonize with Recon page constants
const penNameToHex = {
    Gold: '#B8860B',
    Silver: '#C0C0C0',
    Black: '#000000',
    Purple: '#800080',
    'Hot Pink': '#FF69B4',
    'Light Pink': '#FFB6C1',
    'Dark Blue': '#00008B',
    'Light Blue': '#ADD8E6',
    Teal: '#0080B0',
    'Lime Green': '#32CD32',
    Yellow: '#FFFF00',
    White: '#FFFFFF',
    Brown: '#8B4513',
    Burgundy: '#800020',
};

const TaskIcon = ({ type, delivery, theme }) => {
    if (type === 'peptide') {
        return <Syringe size={14} weight="duotone" className="sm:w-[18px] sm:h-[18px]" style={{ color: theme.text }} />;
    }
    if (type === 'supplement') {
        const deliveryLower = String(delivery || '').toLowerCase();
        switch (deliveryLower) {
            case 'injection':
            case 'syringe':
                return <Syringe size={14} weight="duotone" className="sm:w-[18px] sm:h-[18px]" style={{ color: theme.text }} />;
            case 'powder':
                return <TestTube size={14} weight="duotone" className="sm:w-[18px] sm:h-[18px]" style={{ color: theme.text }} />;
            case 'oral':
            case 'pill':
            default:
                return <Pill size={14} className="sm:w-[18px] sm:h-[18px]" style={{ color: theme.text }} />;
        }
    }
    return <div className="w-3.5 h-3.5 sm:w-4 sm:h-4" />;
};


export default function TasksList({
    tasks,
    theme,
    onToggle,
    setInjectionTask,
    onSlotMove,
    onResetSlotMove,
    onSkipDose,
    onUndoSkip,
    onRescheduleToTomorrow,
    onRescheduleToDate,
    onClearCatchUp,
    scheduleActionsDisabled = false,
}) {
    const [spotlightTaskId, setSpotlightTaskId] = useState(null);
    const overlaysClear = useBlockingOverlayClear();

    const menuEligibility = useMemo(() => ({
        scheduleActionsDisabled,
        onSlotMove,
        onSkipDose,
        onRescheduleToTomorrow,
        onRescheduleToDate,
        onUndoSkip,
        onClearCatchUp,
    }), [
        scheduleActionsDisabled,
        onSlotMove,
        onSkipDose,
        onRescheduleToTomorrow,
        onRescheduleToDate,
        onUndoSkip,
        onClearCatchUp,
    ]);

    const dismissSpotlight = useCallback(() => {
        markRescheduleSpotlightDone();
        setSpotlightTaskId(null);
    }, []);

    // Hide (don't dismiss permanently) while an auto-popup covers the UI
    useEffect(() => {
        if (!overlaysClear && spotlightTaskId) {
            setSpotlightTaskId(null);
        }
    }, [overlaysClear, spotlightTaskId]);

    // One-time spotlight on the first dose that has the ⋮ schedule menu
    useEffect(() => {
        if (!overlaysClear) return undefined;
        if (!tasks?.length) return undefined;
        if (isRescheduleSpotlightDone()) return undefined;

        const ordered = (() => {
            const am = tasks.filter((t) => t.time === 'AM');
            const pm = tasks.filter((t) => t.time === 'PM');
            const hour = new Date().getHours();
            const pmFirst = hour >= 14 || hour < 2;
            return pmFirst ? [...pm, ...am] : [...am, ...pm];
        })();

        const target = ordered.find((t) =>
            isScheduleMenuEligible(t, { ...menuEligibility, timeSlot: t.time })
        );
        if (!target?.id) return undefined;

        const show = setTimeout(() => setSpotlightTaskId(target.id), 900);
        return () => clearTimeout(show);
    }, [tasks, menuEligibility, overlaysClear]);

    // Dev preview — force the spotlight again
    useEffect(() => {
        const onPreview = () => {
            try {
                localStorage.removeItem(RESCHEDULE_SPOTLIGHT_KEY);
            } catch {
                /* ignore */
            }
            const ordered = (tasks || []).filter((t) => t.time === 'AM' || t.time === 'PM');
            const target = ordered.find((t) =>
                isScheduleMenuEligible(t, { ...menuEligibility, timeSlot: t.time })
            );
            if (target?.id) setSpotlightTaskId(target.id);
        };
        window.addEventListener('tpp:dev-preview-reschedule-spotlight', onPreview);
        return () => window.removeEventListener('tpp:dev-preview-reschedule-spotlight', onPreview);
    }, [tasks, menuEligibility]);

    if (!tasks || tasks.length === 0) {
        return <p className="text-[10px] sm:text-xs text-center py-2 sm:py-3 px-2" style={{ color: theme.textLight }}>No research scheduled for today.</p>;
    }

    const amTasks = tasks.filter(t => t.time === 'AM');
    const pmTasks = tasks.filter(t => t.time === 'PM');
    const otherTasks = tasks.filter(t => t.time !== 'AM' && t.time !== 'PM');

    // Time-based ordering logic
    // 2:00 AM to 1:59 PM: Show AM first
    // 2:00 PM to 1:59 AM: Show PM first
    const now = new Date();
    const currentHour = now.getHours();
    const showPMFirst = currentHour >= 14 || currentHour < 2; // 2 PM (14:00) to 1:59 AM
    

    const renderTimeSection = (sectionTasks, timeLabel, isSecondSection) => {
        if (sectionTasks.length === 0) return null;
        return (
            <div>
                {isSecondSection && (
                    <div className="widget-separator" style={{ marginBottom: '0.5rem', paddingBottom: '0.25rem' }}></div>
                )}
                <TaskListSection
                    tasks={sectionTasks}
                    theme={theme}
                    onToggle={onToggle}
                    setInjectionTask={setInjectionTask}
                    timeSlot={timeLabel}
                    onSlotMove={onSlotMove}
                    onResetSlotMove={onResetSlotMove}
                    onSkipDose={onSkipDose}
                    onUndoSkip={onUndoSkip}
                    onRescheduleToTomorrow={onRescheduleToTomorrow}
                    onRescheduleToDate={onRescheduleToDate}
                    onClearCatchUp={onClearCatchUp}
                    scheduleActionsDisabled={scheduleActionsDisabled}
                    spotlightTaskId={spotlightTaskId}
                    onDismissSpotlight={dismissSpotlight}
                />
            </div>
        );
    };

    return (
        <div className="space-y-1.5 sm:space-y-2 relative">
            {otherTasks.length > 0 && (
                <TaskListSection
                    tasks={otherTasks}
                    theme={theme}
                    onToggle={onToggle}
                    setInjectionTask={setInjectionTask}
                    timeSlot={null}
                    onSlotMove={onSlotMove}
                    onResetSlotMove={onResetSlotMove}
                    onSkipDose={onSkipDose}
                    onUndoSkip={onUndoSkip}
                    onRescheduleToTomorrow={onRescheduleToTomorrow}
                    onRescheduleToDate={onRescheduleToDate}
                    onClearCatchUp={onClearCatchUp}
                    scheduleActionsDisabled={scheduleActionsDisabled}
                    spotlightTaskId={spotlightTaskId}
                    onDismissSpotlight={dismissSpotlight}
                />
            )}
            
            {showPMFirst ? (
                // PM first (2:00 PM to 1:59 AM)
                <>
                    {renderTimeSection(pmTasks, 'PM', false)}
                    {renderTimeSection(amTasks, 'AM', pmTasks.length > 0)}
                </>
            ) : (
                // AM first (2:00 AM to 1:59 PM)
                <>
                    {renderTimeSection(amTasks, 'AM', false)}
                    {renderTimeSection(pmTasks, 'PM', amTasks.length > 0)}
                </>
            )}
        </div>
    );
}

const TaskListSection = ({
    tasks,
    theme,
    onToggle,
    setInjectionTask,
    timeSlot,
    onSlotMove,
    onResetSlotMove,
    onSkipDose,
    onUndoSkip,
    onRescheduleToTomorrow,
    onRescheduleToDate,
    onClearCatchUp,
    scheduleActionsDisabled,
    spotlightTaskId = null,
    onDismissSpotlight,
}) => {
    const clickTimers = useRef({});
    const [openMenuTaskId, setOpenMenuTaskId] = useState(null);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const [menuVisible, setMenuVisible] = useState(false);
    const [menuPreferAbove, setMenuPreferAbove] = useState(false);
    const [checkPopIds, setCheckPopIds] = useState(new Set());
    const [justCompletedIds, setJustCompletedIds] = useState(new Set());
    const [showDatePickerFor, setShowDatePickerFor] = useState(null);
    const [pickDateValue, setPickDateValue] = useState('');
    const [spotlightAnchor, setSpotlightAnchor] = useState(null);
    const menuBtnRefs = useRef({});
    const menuCloseTimer = useRef(null);
    const spotlightTipRef = useRef(null);
    const latchedSpotlightAnchor = useRef(null);
    const spotlightOpen = !!(spotlightTaskId && tasks?.some((t) => t.id === spotlightTaskId));
    const spotlightTransition = useSpotlightTransition(spotlightOpen);
    if (spotlightAnchor) latchedSpotlightAnchor.current = spotlightAnchor;
    const portalAnchor = spotlightAnchor || (spotlightTransition.mounted ? latchedSpotlightAnchor.current : null);

    const clearMenuCloseTimer = () => {
        if (menuCloseTimer.current) {
            clearTimeout(menuCloseTimer.current);
            menuCloseTimer.current = null;
        }
    };

    const closeMenu = useCallback(() => {
        setMenuVisible(false);
        setShowDatePickerFor(null);
        clearMenuCloseTimer();
        menuCloseTimer.current = setTimeout(() => {
            setOpenMenuTaskId(null);
            menuCloseTimer.current = null;
        }, 160);
    }, []);

    const triggerCheckPop = (taskId) => {
        setCheckPopIds((prev) => new Set(prev).add(taskId));
        setJustCompletedIds((prev) => new Set(prev).add(taskId));
        setTimeout(() => {
            setCheckPopIds((prev) => {
                const next = new Set(prev);
                next.delete(taskId);
                return next;
            });
            setJustCompletedIds((prev) => {
                const next = new Set(prev);
                next.delete(taskId);
                return next;
            });
        }, 400);
    };

    const openMenu = useCallback((e, taskId) => {
        e.preventDefault();
        e.stopPropagation();
        if (spotlightTaskId && onDismissSpotlight) onDismissSpotlight();

        if (openMenuTaskId === taskId && menuVisible) {
            closeMenu();
            return;
        }

        clearMenuCloseTimer();
        const btn = menuBtnRefs.current[taskId];
        let preferAbove = false;
        if (btn) {
            const rect = btn.getBoundingClientRect();
            // Viewport coords only — portal menu uses position:fixed
            setMenuPosition({
                top: rect.top,
                bottom: rect.bottom,
                left: rect.left,
                right: rect.right,
            });
            // Prefer opening below the ⋮; only flip above if not enough room
            const MENU_H_EST = 220;
            const spaceBelow = window.innerHeight - rect.bottom - 6;
            preferAbove = spaceBelow < MENU_H_EST && rect.top > spaceBelow;
            setMenuPreferAbove(preferAbove);
        }

        const switching = openMenuTaskId !== null && openMenuTaskId !== taskId;
        setOpenMenuTaskId(taskId);
        setShowDatePickerFor(null);
        if (switching) {
            setMenuVisible(false);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setMenuVisible(true));
            });
        } else {
            setMenuVisible(false);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setMenuVisible(true));
            });
        }
    }, [openMenuTaskId, menuVisible, spotlightTaskId, onDismissSpotlight, closeMenu]);

    useEffect(() => {
        const close = () => {
            if (openMenuTaskId !== null) closeMenu();
        };
        window.addEventListener('click', close);
        window.addEventListener('scroll', close, true);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('scroll', close, true);
        };
    }, [openMenuTaskId, closeMenu]);

    useEffect(() => () => clearMenuCloseTimer(), []);

    // Keep callout glued to the ⋮ button while the spotlight is active
    useEffect(() => {
        if (!spotlightTaskId) {
            setSpotlightAnchor(null);
            return undefined;
        }
        const measure = () => {
            const btn = menuBtnRefs.current[spotlightTaskId];
            if (!btn) {
                setSpotlightAnchor(null);
                return;
            }
            const r = btn.getBoundingClientRect();
            setSpotlightAnchor({
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
    }, [spotlightTaskId, tasks]);

    // Click / tap outside the tip (or its ⋮) dismisses the one-time spotlight
    useEffect(() => {
        if (!spotlightTaskId || !onDismissSpotlight) return undefined;

        const onPointerDown = (e) => {
            const tip = spotlightTipRef.current;
            const btn = menuBtnRefs.current[spotlightTaskId];
            const target = e.target;
            if (tip && tip.contains(target)) return;
            if (btn && (btn === target || btn.contains(target))) return;
            onDismissSpotlight();
        };

        // Defer so the show animation / same-frame taps don't instantly clear it
        const attach = setTimeout(() => {
            document.addEventListener('pointerdown', onPointerDown, true);
        }, 50);

        return () => {
            clearTimeout(attach);
            document.removeEventListener('pointerdown', onPointerDown, true);
        };
    }, [spotlightTaskId, onDismissSpotlight]);

    if (!tasks || tasks.length === 0) return null;

    const primary = theme?.primary || '#7F9E95';
    const tipBg = theme?.isDark ? 'rgba(20,25,33,0.98)' : '#ffffff';
    const tipText = theme?.text || '#1f2937';
    const tipBorder = theme?.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
    const showSpotlightPortal = !!(spotlightTransition.mounted && portalAnchor);

    return (
        <div>
            <ul className="space-y-1.5">
                {tasks.map((task, index) => {
                    const isBuddyTask = task.ownerId && task.ownerId !== OWNER_SELF;
                    const borderAccent = task.protocolAccentHex;
                    const bw = isBuddyTask ? '4px' : '3px';
                    let borderLeft;
                    if (borderAccent) {
                        const lineColor = isBuddyTask ? darkenHex(borderAccent, 0.26) : borderAccent;
                        borderLeft = `${bw} solid ${task.completed ? `${lineColor}55` : lineColor}`;
                    } else if (isBuddyTask) {
                        borderLeft = `${bw} solid ${theme.isDark ? 'rgba(45,58,52,0.95)' : 'rgba(32,48,40,0.92)'}`;
                    } else {
                        borderLeft = timeSlot === 'PM'
                          ? `3px solid ${theme.isDark ? 'rgba(160, 180, 153, 0.5)' : theme.primaryDark || 'rgba(75, 95, 88, 0.5)'}`
                          : `3px solid ${theme.isDark ? 'rgba(160, 180, 153, 0.2)' : theme.primary + '40'}`;
                    }

                    let buddyRowBg = 'transparent';
                    if (isBuddyTask) {
                        if (borderAccent && /^#[0-9A-Fa-f]{6}$/i.test(borderAccent)) {
                            const d = accentMultiply(borderAccent, 0.62);
                            buddyRowBg = task.completed
                                ? (theme.isDark ? `${d}28` : `${d}0c`)
                                : (theme.isDark ? `${d}38` : `${d}16`);
                        } else {
                            buddyRowBg = task.completed
                                ? (theme.isDark ? 'rgba(36,44,40,0.4)' : 'rgba(32,44,38,0.07)')
                                : (theme.isDark ? 'rgba(36,44,40,0.55)' : 'rgba(32,44,38,0.11)');
                        }
                    }
                    const isSkipped = !!(task._skipped || task.skipped);
                    const isRescheduled = !!(task._rescheduled || task.rescheduled || task.movedFromProtocolSlot);
                    const isCatchUp = !!(task._extraSlot || task.isCatchUp);
                    const isInactiveDose = isSkipped || !!(task._rescheduled || task.rescheduled);
                    const isOneOff = !!(task.isOneOff || task.type === 'one_off');
                    const statusChip = getDoseStatusChipInfo(task, { viewDateKey: getLocalDateString() });
                    const showScheduleMenu =
                        !isOneOff &&
                        !scheduleActionsDisabled &&
                        timeSlot &&
                        (onSlotMove || onSkipDose || onRescheduleToTomorrow || onRescheduleToDate || onUndoSkip || onClearCatchUp) &&
                        (task.time === 'AM' || task.time === 'PM');
                    const otherSlot = task.time === 'AM' ? 'PM' : task.time === 'PM' ? 'AM' : null;
                    const isSpotlightTarget = showScheduleMenu && spotlightTaskId === task.id;
                    const isMenuOpen = showScheduleMenu && openMenuTaskId === task.id;
                    const menuBtnAccent = isMenuOpen || isSpotlightTarget;

                    return (
                    <li 
                        key={task.id ? `${task.id}-${index}` : index} 
                        className={`flex items-center justify-between gap-2 py-2.5 sm:py-3 px-3 min-w-0 transition-all duration-200 ${isBuddyTask ? 'rounded-xl' : ''}${justCompletedIds.has(task.id) ? ' tpp-task-just-completed' : ''}`} 
                        style={{ 
                            backgroundColor: buddyRowBg,
                            borderLeft,
                            opacity: isInactiveDose ? 0.72 : 1,
                            boxShadow: isBuddyTask
                                ? (index < tasks.length - 1
                                    ? `inset 0 -1px 0 ${theme.isDark ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.06)'}, 0 1px 0 ${theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)'}`
                                    : `inset 0 0 0 1px ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`)
                                : (index < tasks.length - 1 
                                    ? `0 1px 0 ${theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(127, 158, 149, 0.08)'}` 
                                    : 'none'),
                        }}
                    >
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
                            <div className="flex-1 min-w-0 overflow-hidden">
                                <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                                    <div className={`font-semibold text-sm sm:text-base truncate ${task.completed || isInactiveDose ? 'line-through decoration-2' : ''}`} style={{ color: task.completed || isInactiveDose ? (theme.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af') : theme.text }}>
                                        {task.name}
                                    </div>
                                    {statusChip && (
                                        <DoseStatusChip
                                            label={statusChip.label}
                                            explanation={statusChip.explanation}
                                            theme={theme}
                                        />
                                    )}
                                    {/* Time chip - PM chip darker to match PM row differentiation */}
                                    {task.time && (
                                        <div 
                                            className="px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md text-xs sm:text-sm font-semibold text-white whitespace-nowrap flex-shrink-0"
                                            style={{ 
                                                backgroundColor: task.completed || isInactiveDose
                                                    ? (theme.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af') 
                                                    : (task.time === 'PM' 
                                                        ? (theme.isDark ? 'rgba(160, 180, 153, 0.85)' : theme.primaryDark) 
                                                        : (theme.isDark ? 'rgba(107, 127, 101, 0.7)' : `${theme.primary}B0`)),
                                                color: (task.time === 'PM' && theme.isDark && !task.completed && !isInactiveDose) ? '#1a2020' : '#ffffff',
                                                opacity: task.completed || isInactiveDose ? 0.6 : 1
                                            }}
                                        >
                                            {task.time}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        
                        <div className={`text-right flex items-center gap-1.5 sm:gap-2.5 flex-shrink-0 ${task.completed ? 'line-through decoration-2' : ''}`} style={{ color: task.completed ? (theme.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af') : undefined }}>
                            <div className="text-right">
                                <div className="font-medium text-sm sm:text-base whitespace-nowrap" style={{ color: task.completed ? (theme.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af') : theme.text }}>
                                    {task.dose}{task.unit ? ` ${task.unit}` : ''}
                                </div>
                            </div>
                            {/* Show pen color and type if penColor is set, regardless of delivery method */}
                            {/* This matches Calendar behavior where pen color is shown when available */}
                            {task.penColor && (
                                <div className="flex items-center gap-1 sm:gap-1.5">
                                    <div 
                                        className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full shadow-sm flex-shrink-0" 
                                        style={{ 
                                            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                                            background: task.completed ? (theme.isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db') : getChromeGradient(getResolvedPenColor(task.penColor)),
                                            opacity: task.completed ? 0.5 : 1
                                        }}
                                        title={`Pen Color: ${task.penColor || 'Default'}`}
                                    />
                                    {task.penType && (
                                        <span className="text-xs sm:text-sm font-medium hidden xs:inline" style={{ color: task.completed ? (theme.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af') : theme.textLight }}>
                                            {task.penType.toUpperCase()}
                                        </span>
                                    )}
                                </div>
                            )}
                            <div className="flex-shrink-0" style={{ opacity: task.completed ? 0.5 : 1 }}>
                                <DeliveryIcon task={task} theme={theme} />
                            </div>

                            {showScheduleMenu && (
                                <div className={`flex-shrink-0 relative ${isSpotlightTarget ? 'z-[40]' : ''}`}>
                                    {isSpotlightTarget && (
                                        <span
                                            aria-hidden
                                            className="tpp-reschedule-spotlight-ring pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
                                            style={{
                                                width: 34,
                                                height: 34,
                                                boxShadow: `0 0 0 2px ${primary}`,
                                            }}
                                        />
                                    )}
                                    <button
                                        ref={el => { menuBtnRefs.current[task.id] = el; }}
                                        type="button"
                                        className={`p-1 rounded-md touch-manipulation relative transition-all duration-150 active:scale-90 ${isSpotlightTarget ? 'tpp-reschedule-spotlight-btn' : ''}`}
                                        style={{
                                            color: menuBtnAccent ? primary : theme.textLight,
                                            backgroundColor: isMenuOpen
                                                ? (theme.isDark ? `${primary}44` : `${primary}2e`)
                                                : isSpotlightTarget
                                                    ? (theme.isDark ? `${primary}33` : `${primary}22`)
                                                    : 'transparent',
                                            boxShadow: isMenuOpen
                                                ? `inset 0 0 0 1.5px ${primary}`
                                                : 'none',
                                        }}
                                        aria-expanded={isMenuOpen}
                                        onClick={(e) => openMenu(e, task.id)}
                                        aria-label="Schedule options"
                                        title="Schedule options"
                                    >
                                        <DotsThreeVertical size={22} weight="bold" className="sm:w-6 sm:h-6" />
                                    </button>
                                </div>
                            )}
                            
                            {!isInactiveDose && (
                            <button
                                type="button"
                                disabled={isOneOff}
                                onMouseDown={(e) => {
                                    // Prevent blur events on mobile
                                    e.preventDefault();
                                }}
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (isOneOff) return;
                                    
                                    // Prevent rapid-fire clicks (debounce)
                                    const lastClick = clickTimers.current[task.id];
                                    const now = Date.now();
                                    
                                    if (lastClick && (now - lastClick) < 300) {
                                        return; // Ignore clicks within 300ms
                                    }
                                    clickTimers.current[task.id] = now;
                                    
                                    // Check if this is an injection task that's not completed
                                    const deliveryMethod = task.deliveryMethod || task.delivery;
                                    const isInjection = deliveryMethod === 'syringe' || deliveryMethod === 'pipette' || deliveryMethod === 'pen' || deliveryMethod === 'injection';
                                    
                                    // Only show injection site selector if tracking is enabled AND it's an injection task
                                    if (isInjection && !task.completed && isInjectionSiteTrackingEnabled()) {
                                        setInjectionTask(task);
                                    } else {
                                        if (!task.completed) triggerCheckPop(task.id);
                                        onToggle(task);
                                    }
                                }}
                                className={`w-6 h-6 sm:w-7 sm:h-7 rounded-sm border-2 relative flex items-center justify-center flex-shrink-0 transition-all ${isOneOff ? 'cursor-default' : 'hover:scale-110 cursor-pointer'} touch-manipulation${checkPopIds.has(task.id) ? ' tpp-task-check-pop' : ''}`}
                                style={{
                                    borderColor: task.completed 
                                        ? (timeSlot === 'PM' 
                                            ? (theme.isDark ? '#a0b499' : (theme.primaryDark || '#3d5a4c')) 
                                            : (theme.isDark ? '#6b7f65' : theme.primary)) 
                                        : `${theme.primaryLight}60`,
                                    backgroundColor: task.completed 
                                        ? (timeSlot === 'PM' 
                                            ? (theme.isDark ? '#a0b499' : (theme.primaryDark || '#3d5a4c')) 
                                            : (theme.isDark ? '#6b7f65' : theme.primary)) 
                                        : 'transparent',
                                    borderRadius: '4px',
                                    minWidth: '24px',
                                    minHeight: '24px',
                                    WebkitTapHighlightColor: 'transparent',
                                    boxShadow: theme.isDark 
                                        ? 'inset 0 2px 4px rgba(0, 0, 0, 0.35)' 
                                        : 'inset 0 2px 4px rgba(0, 0, 0, 0.12)',
                                    opacity: isOneOff ? 0.95 : 1,
                                }}
                                title={isOneOff ? 'One-off dose logged' : (task.completed ? 'Mark as incomplete' : 'Mark as complete')}
                            >
                                {task.completed && (
                                    <Check 
                                        size={16} 
                                        className="sm:w-5 sm:h-5 absolute text-white" 
                                        style={{ 
                                            strokeWidth: 2.5,
                                            top: '-3px',
                                            right: '-3px'
                                        }}
                                    />
                                )}
                            </button>
                            )}
                        </div>
                    </li>
                    );
                })}
            </ul>

            {showSpotlightPortal && createPortal(
                <div
                    className={`fixed z-[10040] pointer-events-none ${spotlightTransition.tipClass}`}
                    style={{
                        top: Math.max(8, portalAnchor.top - 8),
                        left: Math.max(8, Math.min(
                            portalAnchor.left - 236,
                            window.innerWidth - 236
                        )),
                        width: 220,
                    }}
                    role="status"
                    aria-live="polite"
                >
                    <div
                        ref={spotlightTipRef}
                        className="pointer-events-auto rounded-xl shadow-2xl border px-3.5 pt-3 pb-3.5 relative text-center"
                        style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                    >
                        <span
                            aria-hidden
                            className="absolute top-4 -right-1.5 w-3 h-3 rotate-45 border-r border-t"
                            style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                        />
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDismissSpotlight?.();
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
                                Reschedule Dose
                            </p>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <style>{`
                @keyframes tppRescheduleRing {
                    0%, 100% { transform: translate(-50%, -50%) scale(1); opacity: 0.95; }
                    50% { transform: translate(-50%, -50%) scale(1.35); opacity: 0.25; }
                }
                .tpp-reschedule-spotlight-ring {
                    animation: tppRescheduleRing 1.4s ease-out infinite;
                }
                @keyframes tppRescheduleBtn {
                    0%, 100% { transform: scale(1); }
                    40% { transform: scale(1.12); }
                    70% { transform: scale(1.04); }
                }
                .tpp-reschedule-spotlight-btn {
                    animation: tppRescheduleBtn 1.4s ease-in-out infinite;
                }
            `}</style>

            {/* Portal dropdown — rendered at document.body level to escape overflow:hidden */}
            {openMenuTaskId !== null && (() => {
                const activeTask = tasks.find(t => t.id === openMenuTaskId);
                if (!activeTask) return null;
                const otherS = activeTask.time === 'AM' ? 'PM' : activeTask.time === 'PM' ? 'AM' : null;
                const activeSkipped = !!(activeTask._skipped || activeTask.skipped);
                const activeRescheduled = !!(activeTask._rescheduled || activeTask.rescheduled);
                const activeCatchUp = !!(activeTask._extraSlot || activeTask.isCatchUp);
                const activeInactive = activeSkipped || activeRescheduled;
                const MENU_W = 240;
                const GAP = 6;
                const menuLeft = Math.min(
                    Math.max(8, (menuPosition.right || menuPosition.left || 0) - MENU_W),
                    window.innerWidth - MENU_W - 8
                );
                const originY = menuPreferAbove ? 'bottom' : 'top';
                const menuItemClass =
                    'w-full min-h-[44px] px-3.5 py-2.5 text-left text-sm flex items-center gap-2.5 touch-manipulation transition-colors active:opacity-80';
                const menuItemHoverBg = theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                return createPortal(
                    <div
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            width: '100vw',
                            height: '100vh',
                            zIndex: 9999,
                            pointerEvents: 'none',
                        }}
                    >
                        <div
                            role="menu"
                            onClick={(e) => e.stopPropagation()}
                            className="tpp-dose-menu"
                            style={{
                                position: 'fixed',
                                ...(menuPreferAbove
                                    ? { bottom: window.innerHeight - (menuPosition.top || 0) + GAP }
                                    : { top: (menuPosition.bottom || 0) + GAP }),
                                left: menuLeft,
                                width: MENU_W,
                                backgroundColor: theme.cardBackground,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '12px',
                                boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                                padding: '6px 0',
                                pointerEvents: menuVisible ? 'all' : 'none',
                                opacity: menuVisible ? 1 : 0,
                                transform: menuVisible
                                    ? 'scale(1) translateY(0)'
                                    : `scale(0.94) translateY(${menuPreferAbove ? '6px' : '-6px'})`,
                                transformOrigin: `${originY} right`,
                                transition: 'opacity 160ms ease, transform 160ms cubic-bezier(0.22, 1, 0.36, 1)',
                                willChange: 'opacity, transform',
                            }}
                        >
                            {!activeInactive && !activeCatchUp && otherS && onSlotMove && (
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    style={{ color: theme.text }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = menuItemHoverBg; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeMenu();
                                        onSlotMove(activeTask, otherS);
                                    }}
                                >
                                    {otherS === 'AM' ? <Sun size={18} weight="duotone" /> : <Moon size={18} weight="duotone" />}
                                    <span>Move to {otherS} today</span>
                                </button>
                            )}
                            {!activeInactive && (onRescheduleToTomorrow || onRescheduleToDate) && (
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    style={{ color: theme.text }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = menuItemHoverBg; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeMenu();
                                        if (onRescheduleToDate) {
                                            onRescheduleToDate(activeTask, toKey(new Date()), 'tomorrow');
                                        } else if (onRescheduleToTomorrow) {
                                            onRescheduleToTomorrow(activeTask);
                                        }
                                    }}
                                >
                                    <CalendarCheck size={18} weight="duotone" />
                                    <span>Reschedule to tomorrow</span>
                                </button>
                            )}
                            {!activeInactive && onRescheduleToDate && (
                                <>
                                    <button
                                        type="button"
                                        className={menuItemClass}
                                        style={{ color: theme.text }}
                                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = menuItemHoverBg; }}
                                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowDatePickerFor(activeTask.id);
                                        }}
                                    >
                                        <CalendarBlank size={18} weight="duotone" />
                                        <span>Choose a date…</span>
                                    </button>
                                    {showDatePickerFor === activeTask.id && (
                                        <div className="px-2 pb-2" onClick={(e) => e.stopPropagation()}>
                                            <GlassmorphismDatePicker
                                                value={pickDateValue}
                                                onChange={(value) => {
                                                    setPickDateValue(value);
                                                    if (!value) return;
                                                    setShowDatePickerFor(null);
                                                    closeMenu();
                                                    onRescheduleToDate(activeTask, toKey(new Date()), value);
                                                }}
                                                theme={theme}
                                                compact
                                                preferOpenAbove={false}
                                                placeholder="Pick date"
                                            />
                                        </div>
                                    )}
                                </>
                            )}
                            {!activeInactive && !activeCatchUp && onSkipDose && (
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    style={{ color: theme.text }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = menuItemHoverBg; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeMenu();
                                        onSkipDose(activeTask);
                                    }}
                                >
                                    <SkipForward size={18} weight="duotone" />
                                    <span>Skip this dose</span>
                                </button>
                            )}
                            {activeInactive && onUndoSkip && (
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    style={{ color: theme.text }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = menuItemHoverBg; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeMenu();
                                        onUndoSkip(activeTask);
                                    }}
                                >
                                    <ArrowCounterClockwise size={18} weight="duotone" />
                                    <span>{activeSkipped ? 'Undo skip' : 'Undo reschedule'}</span>
                                </button>
                            )}
                            {activeCatchUp && onClearCatchUp && (
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    style={{ color: theme.text }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = menuItemHoverBg; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeMenu();
                                        onClearCatchUp(activeTask);
                                    }}
                                >
                                    <ArrowCounterClockwise size={18} weight="duotone" />
                                    <span>Remove catch-up</span>
                                </button>
                            )}
                            {!activeInactive && activeTask.movedFromProtocolSlot && onResetSlotMove && (
                                <button
                                    type="button"
                                    className={menuItemClass}
                                    style={{ color: theme.text }}
                                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = menuItemHoverBg; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        closeMenu();
                                        onResetSlotMove(activeTask);
                                    }}
                                >
                                    <ArrowCounterClockwise size={18} weight="duotone" />
                                    <span>Restore protocol time</span>
                                </button>
                            )}
                        </div>
                    </div>,
                    document.body
                );
            })()}
        </div>
    )
};

const DeliveryIcon = ({ task, theme }) => {
    const iconProps = {
        size: 24,
        weight: 'duotone',
        className: 'sm:w-[26px] sm:h-[26px]',
        style: { color: theme.textLight },
    };

    // Handle peptide delivery methods
    if (task.type === 'peptide') {
        // If penColor is set, show pen icon (matches Calendar behavior)
        // This handles cases where deliveryMethod is 'pipette' but penColor is set
        if (task.penColor || task.deliveryMethod === 'pen') {
            return <PenNib {...iconProps} />;
        }
        if (task.deliveryMethod === 'syringe' || task.deliveryMethod === 'pipette') {
            return <Syringe {...iconProps} />;
        }
        if (task.deliveryMethod === 'nasal') {
            return <SprayBottle {...iconProps} />;
        }
        if (task.deliveryMethod === 'topical') {
            return <HandPalm {...iconProps} />;
        }
    }
    
    // Handle supplement delivery methods
    if (task.type === 'supplement') {
        const delivery = String(task.delivery || task.deliveryMethod || '').toLowerCase();
        if (delivery === 'injection' || delivery === 'syringe') {
            return <Syringe {...iconProps} />;
        }
        if (delivery === 'powder') {
            return <TestTube {...iconProps} />;
        }
        if (delivery === 'pill' || delivery === 'oral') {
            return <Pill {...iconProps} />;
        }
    }
    
    return null;
}

const getResolvedPenColor = (penColor) => {
    if (!penColor) return '#9ca3af';
    const raw = String(penColor || '').trim();
    // Type safety: ensure raw is a string before calling startsWith
    if (typeof raw !== 'string' || !raw) return '#9ca3af';
    const isHex = raw.startsWith('#');
    if (isHex) return raw;
    
    // Find color by name in penColors array
    const foundColor = penColors.find(color => 
        color.name.toLowerCase() === raw.toLowerCase()
    );
    
    return foundColor ? foundColor.hex : '#9ca3af';
}


