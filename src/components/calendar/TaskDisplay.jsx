import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Pill, Check, PenTool, Beaker, Pipette, SprayCan, Hand, MoreVertical, Sun, Moon, SkipForward, CalendarArrowUp, Undo2, CalendarDays } from 'lucide-react';
import InjectionSiteSelector from '../common/InjectionSiteSelector';
import GlassmorphismDatePicker from '../common/GlassmorphismDatePicker';
import { getChromeGradient } from '../../utils/recon';
import { penColors } from '../../utils/penColors';
import { isTaskCompleted, generateTaskId } from '../../utils/taskCompletion';
import { OWNER_SELF, darkenHex, getBuddyCardTint } from '../../utils/buddies';
import DoseStatusChip from '../common/DoseStatusChip';
import { getDoseStatusChipInfo } from '../../utils/doseStatusChip';

// Delivery icon component
const DeliveryIcon = ({ task, theme, size = 14 }) => {
  if (task.type === 'peptide') {
    // Check both deliveryMethod and delivery fields, with fallback
    const deliveryMethod = task.deliveryMethod || task.delivery || 'injection';
    const deliveryLower = String(deliveryMethod).toLowerCase();
    
    if (deliveryLower === 'pen') {
      return <PenTool size={size} style={{ color: theme.textLight }} />;
    }
    if (deliveryLower === 'syringe' || deliveryLower === 'pipette' || deliveryLower === 'injection') {
      return <Pipette size={size} style={{ color: theme.textLight }} />;
    }
    if (deliveryLower === 'nasal') {
      return <SprayCan size={size} style={{ color: theme.textLight }} />;
    }
    if (deliveryLower === 'topical') {
      return <Hand size={size} style={{ color: theme.textLight }} />;
    }
    // Default fallback for peptides (typically injected)
    return <Pipette size={size} style={{ color: theme.textLight }} />;
  }
  
  if (task.type === 'supplement') {
    // Match TasksList logic: check both delivery and deliveryMethod
    const delivery = String(task.delivery || task.deliveryMethod || '').toLowerCase();
    if (delivery === 'injection' || delivery === 'syringe') {
      return <Pipette size={size} style={{ color: theme.textLight }} />;
    }
    if (delivery === 'powder') {
      return <Beaker size={size} style={{ color: theme.textLight }} />;
    }
    if (delivery === 'pill' || delivery === 'oral') {
      return <Pill size={size} style={{ color: theme.textLight }} />;
    }
    // Default to pill for supplements
    return <Pill size={size} style={{ color: theme.textLight }} />;
  }
  
  return null;
};

// Pen color resolution function
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
};

// Main TaskDisplay component
// Styled to match Today's Research widget (TasksList) for visual consistency
const SIZE_STYLES = {
  compact: {
    row: 'py-2 sm:py-2.5',
    name: 'text-xs sm:text-sm',
    dose: 'text-xs sm:text-sm',
    penType: 'text-[10px] sm:text-xs',
    icon: 12,
    menuIcon: 14,
    checkbox: 'w-5 h-5 sm:w-6 sm:h-6',
    checkIcon: 14,
    checkIconSm: 'sm:w-[18px] sm:h-[18px]',
  },
  normal: {
    row: 'py-2.5 sm:py-3',
    name: 'text-sm sm:text-base',
    dose: 'text-sm sm:text-base',
    penType: 'text-xs sm:text-sm',
    icon: 14,
    menuIcon: 16,
    checkbox: 'w-6 h-6 sm:w-7 sm:h-7',
    checkIcon: 16,
    checkIconSm: 'sm:w-[20px] sm:h-[20px]',
  },
  detailed: {
    row: 'py-3 sm:py-3.5',
    name: 'text-base sm:text-lg',
    dose: 'text-sm sm:text-base',
    penType: 'text-xs sm:text-sm',
    icon: 16,
    menuIcon: 18,
    checkbox: 'w-7 h-7',
    checkIcon: 18,
    checkIconSm: 'sm:w-[22px] sm:h-[22px]',
  },
};

const TaskDisplay = ({
  task, 
  theme, 
  date, 
  timeSlot, 
  onToggle, 
  size = 'compact', // 'compact', 'normal', 'detailed'
  showCheckbox = true,
  showPenDetails = true,
  dateKey: dateKeyOverride,
  disableInjectionSelector = false,
  // Schedule action handlers (optional – show ⋮ menu when provided)
  onSlotMove,
  onSkipDose,
  onUndoSkip,
  onRescheduleToDate,
  onClearCatchUp,
  isViewingToday = false,
  viewDateKey,
  scheduleActionsDisabled = false,
}) => {
  const styles = SIZE_STYLES[size] || SIZE_STYLES.normal;
  // Prefer an explicit date key if provided to avoid timezone parsing issues
  const dateKey = dateKeyOverride || (date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` : '');
  const taskId = generateTaskId(task);
  const isSkipped = !!(task._skipped || task.skipped);
  const isRescheduled = !!(task._rescheduled || task.rescheduled || task.movedFromProtocolSlot);
  const isCatchUp = !!(task._extraSlot || task.isCatchUp);
  const isInactiveDose = isSkipped || !!(task._rescheduled || task.rescheduled);
  const statusChip = getDoseStatusChipInfo(task, { viewDateKey: viewDateKey || dateKey });
  
  // State to track completion status - this will trigger re-renders
  const [isCompleted, setIsCompleted] = useState(() => {
    return dateKey ? isTaskCompleted(taskId, dateKey, timeSlot) : (task.completed || false);
  });
  const [showInjectionSelector, setShowInjectionSelector] = useState(false);

  // ⋮ menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickDateValue, setPickDateValue] = useState('');
  const menuBtnRef = useRef(null);

  const openScheduleMenu = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (menuOpen) { setMenuOpen(false); return; }
    const btn = menuBtnRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPos({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right });
    }
    setMenuOpen(true);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen && !showDatePicker) return;
    const close = () => {
      setMenuOpen(false);
      setShowDatePicker(false);
    };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menuOpen, showDatePicker]);

  const showScheduleMenu = !scheduleActionsDisabled && (onSlotMove || onSkipDose || onRescheduleToDate || onUndoSkip || onClearCatchUp);
  
  // Update completion status when props change or when global event fires
  useEffect(() => {
    const checkCompletion = () => {
      const completed = dateKey ? isTaskCompleted(taskId, dateKey, timeSlot) : (task.completed || false);
      setIsCompleted(completed);
    };
    
    // Check immediately
    checkCompletion();
    
    // Listen for task completion events to update
    const handleTaskCompletionChange = () => {
      checkCompletion();
    };
    
    window.addEventListener('tpp:task-completion-changed', handleTaskCompletionChange);
    
    return () => {
      window.removeEventListener('tpp:task-completion-changed', handleTaskCompletionChange);
    };
  }, [dateKey, taskId, timeSlot, task.completed, task.name]);

  const handleToggle = () => {
    if (isInactiveDose) return;
    // Check if this is an injection task that's not completed
    const deliveryMethod = task.deliveryMethod || task.delivery;
    const isInjection = deliveryMethod === 'syringe' || deliveryMethod === 'pipette' || deliveryMethod === 'pen' || deliveryMethod === 'injection';
    
    // If injection selector is disabled, let parent handle it
    if (isInjection && !isCompleted && !disableInjectionSelector) {
      setShowInjectionSelector(true);
    } else if (onToggle) {
      onToggle(task, date);
    }
  };

  const handlePickDate = (value) => {
    setPickDateValue(value);
    if (!value || !onRescheduleToDate) return;
    setShowDatePicker(false);
    setMenuOpen(false);
    onRescheduleToDate(task, viewDateKey || dateKey, value);
  };

  const isPM = timeSlot === 'PM';

  const isBuddy = task.ownerId && task.ownerId !== OWNER_SELF;
  const accent = task.protocolAccentHex;
  const bw = isBuddy ? '4px' : '3px';

  // Left border: buddy rows = darker + thicker accent line (matches Today's Research / TasksList)
  let borderLeftColor;
  if (accent) {
    const line = isBuddy ? darkenHex(accent, 0.5) : accent;
    borderLeftColor = `${bw} solid ${isCompleted || isInactiveDose ? `${line}55` : line}`;
  } else if (isBuddy) {
    borderLeftColor = `${bw} solid ${theme.isDark ? 'rgba(45,58,52,0.95)' : 'rgba(32,48,40,0.92)'}`;
  } else {
    borderLeftColor = isPM
      ? `3px solid ${theme.isDark ? 'rgba(160, 180, 153, 0.5)' : theme.primaryDark || 'rgba(75, 95, 88, 0.5)'}`
      : `3px solid ${theme.isDark ? 'rgba(160, 180, 153, 0.2)' : theme.primary + '40'}`;
  }

  let buddyRowBg = 'transparent';
  let buddyRowShadow;
  const buddyText = isBuddy && !isCompleted && !isInactiveDose ? 'rgba(255,255,255,0.9)' : undefined;
  const buddyTextMuted = isBuddy && (isCompleted || isInactiveDose) ? 'rgba(255,255,255,0.35)' : undefined;
  if (isBuddy) {
    const tint = getBuddyCardTint(accent, theme?.isDark);
    if (tint.backgroundColor) {
      buddyRowBg = isCompleted || isInactiveDose
        ? (theme.isDark ? `${tint.backgroundColor}99` : `${tint.backgroundColor}bb`)
        : tint.backgroundColor;
      buddyRowShadow = isCompleted || isInactiveDose ? undefined : tint.boxShadow;
    } else {
      buddyRowBg = isCompleted || isInactiveDose
        ? (theme.isDark ? 'rgba(36,44,40,0.4)' : 'rgba(32,44,38,0.07)')
        : (theme.isDark ? 'rgba(36,44,40,0.55)' : 'rgba(32,44,38,0.11)');
    }
  }

  // Checkbox color: PM gets darker shade (matches Today's Research)
  const checkboxBg = isCompleted
    ? (isPM
        ? (theme.isDark ? '#a0b499' : (theme.primaryDark || '#3d5a4c'))
        : (theme.isDark ? '#6b7f65' : theme.primary))
    : 'transparent';
  const checkboxBorder = isCompleted
    ? (isPM
        ? (theme.isDark ? '#a0b499' : (theme.primaryDark || '#3d5a4c'))
        : (theme.isDark ? '#6b7f65' : theme.primary))
    : `${theme.primaryLight}60`;

  const mutedColor = buddyTextMuted ?? buddyText ?? (isCompleted || isInactiveDose ? (theme.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af') : theme.text);

  return (
    <div 
      className={`flex items-center justify-between gap-2 ${styles.row} px-3 min-w-0 transition-all duration-200 ${isBuddy ? 'rounded-xl' : ''}`}
      style={{ 
        backgroundColor: buddyRowBg,
        borderLeft: borderLeftColor,
        boxShadow: buddyRowShadow ?? (isBuddy
          ? `inset 0 0 0 1px ${theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`
          : undefined),
        opacity: isInactiveDose ? 0.72 : 1,
      }}
    >
      {/* Left: Task name */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 overflow-hidden">
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            <div className={`font-semibold ${styles.name} truncate ${isCompleted || isInactiveDose ? 'line-through decoration-2' : ''}`} style={{ color: mutedColor }}>
              {task.name}
            </div>
            {statusChip && (
              <DoseStatusChip
                label={statusChip.label}
                explanation={statusChip.explanation}
                theme={theme}
              />
            )}
          </div>
        </div>
      </div>

      {/* Right: Details + Checkbox */}
      <div className={`text-right flex items-center gap-1 sm:gap-2 flex-shrink-0 ${isCompleted || isInactiveDose ? 'line-through decoration-2' : ''}`} style={{ color: mutedColor }}>
        {/* Dose and units */}
        <div className="text-right">
          <div className={`font-medium ${styles.dose} whitespace-nowrap`} style={{ color: mutedColor }}>
            {task.dose}{task.unit ? ` ${task.unit}` : ''}
          </div>
        </div>

        {/* Pen color and type (if pen delivery or penColor present) */}
        {task.penColor && showPenDetails && (
          <div className="flex items-center gap-0.5 sm:gap-1">
            <div 
              className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full shadow-sm flex-shrink-0"
              style={{ 
                border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`,
                background: isCompleted || isInactiveDose ? (theme.isDark ? 'rgba(255,255,255,0.15)' : '#d1d5db') : getChromeGradient(getResolvedPenColor(task.penColor)),
                opacity: isCompleted || isInactiveDose ? 0.5 : 1
              }}
              title={`Pen Color: ${task.penColor || 'Default'}`}
            />
            {task.penType && (
              <span className={`${styles.penType} font-medium hidden xs:inline`} style={{ color: isCompleted || isInactiveDose ? (theme.isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af') : theme.textLight }}>
                {task.penType.toUpperCase()}
              </span>
            )}
          </div>
        )}

        {/* Delivery method icon */}
        <div className="flex-shrink-0" style={{ opacity: isCompleted || isInactiveDose ? 0.5 : 1 }}>
          <DeliveryIcon task={task} theme={theme} size={styles.icon} />
        </div>

        {/* ⋮ schedule menu button */}
        {showScheduleMenu && (
          <button
            ref={menuBtnRef}
            type="button"
            className="p-1 rounded-md touch-manipulation flex-shrink-0"
            style={{ color: theme.textLight }}
            onClick={openScheduleMenu}
            aria-label="Schedule options"
            title="Schedule options"
          >
            <MoreVertical size={styles.menuIcon} />
          </button>
        )}

        {/* Checkbox - Matching Today's Research widget design exactly */}
        {showCheckbox && !isInactiveDose && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleToggle();
            }}
            className={`${styles.checkbox} rounded-sm border-2 relative flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 cursor-pointer touch-manipulation`}
            style={{
              borderColor: checkboxBorder,
              backgroundColor: checkboxBg,
              borderRadius: '4px',
              minWidth: '20px',
              minHeight: '20px',
              WebkitTapHighlightColor: 'transparent'
            }}
            title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
          >
            {isCompleted && (
              <Check 
                size={styles.checkIcon} 
                className={`${styles.checkIconSm} absolute text-white`} 
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

      {/* ⋮ portal dropdown */}
      {menuOpen && showScheduleMenu && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 9999, pointerEvents: 'none' }}
        >
          {(() => {
            const MENU_W = 220;
            const GAP = 6;
            const menuLeft = Math.min(
              Math.max(8, (menuPos.right || menuPos.left || 0) - MENU_W),
              window.innerWidth - MENU_W - 8
            );
            const preferAbove = (menuPos.top || 0) - GAP > 48;
            return (
          <div
            role="menu"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              ...(preferAbove
                ? { bottom: window.innerHeight - (menuPos.top || 0) + GAP }
                : { top: (menuPos.bottom || 0) + GAP }),
              left: menuLeft,
              width: MENU_W,
              backgroundColor: theme.cardBackground,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
              padding: '4px 0',
              pointerEvents: 'all',
            }}
          >
            {/* Same-day slot moves */}
            {!isInactiveDose && !isCatchUp && isViewingToday && onSlotMove && (
              <>
                {timeSlot === 'AM' && (
                  <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                    style={{ color: theme.text }}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSlotMove(task, 'PM'); }}
                  >
                    <Moon size={13} />
                    <span>Move to PM today</span>
                  </button>
                )}
                {timeSlot === 'PM' && (
                  <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                    style={{ color: theme.text }}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSlotMove(task, 'AM'); }}
                  >
                    <Sun size={13} />
                    <span>Move to AM today</span>
                  </button>
                )}
              </>
            )}
            {!isInactiveDose && onRescheduleToDate && (
              <>
                {isViewingToday && (
                  <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                    style={{ color: theme.text }}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRescheduleToDate(task, viewDateKey || dateKey, 'tomorrow'); }}
                  >
                    <CalendarArrowUp size={13} />
                    <span>Reschedule to tomorrow</span>
                  </button>
                )}
                {!isViewingToday && (
                  <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                    style={{ color: theme.text }}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onRescheduleToDate(task, viewDateKey || dateKey, 'today'); }}
                  >
                    <CalendarArrowUp size={13} />
                    <span>Reschedule to today</span>
                  </button>
                )}
                <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                  style={{ color: theme.text }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDatePicker(true);
                  }}
                >
                  <CalendarDays size={13} />
                  <span>Choose a date…</span>
                </button>
                {showDatePicker && (
                  <div className="px-2 pb-2" onClick={(e) => e.stopPropagation()}>
                    <GlassmorphismDatePicker
                      value={pickDateValue}
                      onChange={handlePickDate}
                      theme={theme}
                      compact
                      preferOpenAbove
                      placeholder="Pick date"
                      label=""
                    />
                  </div>
                )}
              </>
            )}
            {/* Skip */}
            {!isInactiveDose && !isCatchUp && onSkipDose && (
              <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                style={{ color: theme.text }}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSkipDose(task, viewDateKey || dateKey); }}
              >
                <SkipForward size={13} />
                <span>Skip this dose</span>
              </button>
            )}
            {(isSkipped || task._rescheduled || task.rescheduled) && onUndoSkip && (
              <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                style={{ color: theme.text }}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onUndoSkip(task, viewDateKey || dateKey); }}
              >
                <Undo2 size={13} />
                <span>{isSkipped ? 'Undo skip' : 'Undo reschedule'}</span>
              </button>
            )}
            {isCatchUp && onClearCatchUp && (
              <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                style={{ color: theme.text }}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onClearCatchUp(task, viewDateKey || dateKey); }}
              >
                <Undo2 size={13} />
                <span>Remove catch-up</span>
              </button>
            )}
            {/* Restore if moved */}
            {!isInactiveDose && task.movedFromProtocolSlot && onSlotMove && isViewingToday && (
              <button type="button" className="w-full px-3 py-2 text-left text-xs flex items-center gap-2 hover:opacity-80"
                style={{ color: theme.text }}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onSlotMove(task, task.movedFromProtocolSlot); }}
              >
                <Undo2 size={13} />
                <span>Restore protocol time</span>
              </button>
            )}
          </div>
            );
          })()}
        </div>,
        document.body
      )}
      
      <InjectionSiteSelector
        taskName={task.name}
        task={task}
        onConfirm={() => {
          if (onToggle) {
            onToggle(task, date);
          }
          setShowInjectionSelector(false);
        }}
        onCancel={() => setShowInjectionSelector(false)}
        theme={theme}
        isVisible={showInjectionSelector}
      />
    </div>
  );
};

export default TaskDisplay;
