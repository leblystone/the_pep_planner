import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle, Warning, WarningCircle, Info, X } from '@phosphor-icons/react';
import { loadSettings } from '../../utils/settingsHelpers';

/** Strip emoji from message so toast shows clean text with type-based icon only. */
const stripEmoji = (text) => {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const ModernToast = ({ message, type, onClose, theme, duration = 4000, anchor = 'bottom', actionEvent = null }) => {
  const displayMessage = stripEmoji(message);
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  // Top-anchored (desktop): swipe up to dismiss. Bottom (mobile): swipe down.
  const dismissOutward = anchor === 'top';

  useEffect(() => {
    const fadeInTimer = setTimeout(() => {
      setIsVisible(true);
    }, 10);

    const dismissTimer = setTimeout(() => {
      setIsLeaving(true);
      setTimeout(onClose, 300);
    }, duration);

    return () => {
      clearTimeout(fadeInTimer);
      clearTimeout(dismissTimer);
    };
  }, [onClose, message, type, duration]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 200);
  };

  const handleActionClick = (e) => {
    if (!actionEvent) return;
    // Ignore if this was a drag-dismiss gesture
    if (Math.abs(dragY) > 8) return;
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent(actionEvent));
    handleClose();
  };

  const handleDragStart = (clientY) => {
    setIsDragging(true);
    setStartY(clientY);
  };

  const handleDragMove = (clientY) => {
    if (!isDragging) return;
    const deltaY = clientY - startY;
    if (dismissOutward ? deltaY < 0 : deltaY > 0) {
      setDragY(deltaY);
    }
  };

  const handleDragEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);

    const shouldDismiss = dismissOutward ? dragY < -50 : dragY > 50;
    if (shouldDismiss) {
      setIsLeaving(true);
      setTimeout(onClose, 200);
    } else {
      setDragY(0);
    }
  };

  const handleTouchStart = (e) => {
    handleDragStart(e.touches[0].clientY);
  };

  const handleTouchMove = (e) => {
    handleDragMove(e.touches[0].clientY);
  };

  const handleTouchEnd = () => {
    handleDragEnd();
  };

  const handleMouseDown = (e) => {
    handleDragStart(e.clientY);
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const deltaY = e.clientY - startY;
    if (dismissOutward ? deltaY < 0 : deltaY > 0) {
      setDragY(deltaY);
    }
  }, [isDragging, startY, dismissOutward]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    const shouldDismiss = dismissOutward ? dragY < -50 : dragY > 50;
    if (shouldDismiss) {
      setIsLeaving(true);
      setTimeout(onClose, 200);
    } else {
      setDragY(0);
    }
  }, [isDragging, dragY, onClose, dismissOutward]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const getIcon = () => {
    const props = { size: 18, weight: 'duotone', 'aria-hidden': true };
    switch (type) {
      case 'success':
        return <CheckCircle {...props} />;
      case 'error':
        return <WarningCircle {...props} />;
      case 'warning':
        return <Warning {...props} />;
      case 'info':
      default:
        return <Info {...props} />;
    }
  };

  /** Accent color for left bar + icon only (card stays white). */
  const getAccent = () => {
    switch (type) {
      case 'success':
        return theme.primary || '#7F9E95';
      case 'error':
        return theme.error || '#DC2626';
      case 'warning':
        return theme.warning || '#F59E0B';
      case 'info':
      default:
        return theme.info || theme.secondary || '#7A5C75';
    }
  };

  const accent = getAccent();
  const cardBg = theme.cardBackground || '#FFFFFF';
  const textColor = theme.text || '#1F2937';
  const borderColor = theme.border || '#E5E7EB';

  return (
    <div
      className={`max-w-sm w-full px-4 ${
        isLeaving
          ? (anchor === 'top' ? 'tpp-toast-exit-top' : 'tpp-toast-exit')
          : isVisible
            ? (anchor === 'top' ? 'tpp-toast-enter-top' : 'tpp-toast-enter')
            : ''
      }`}
      style={{
        transform: isDragging ? `translateY(${dragY}px)` : undefined,
        transition: isDragging ? 'none' : undefined,
        cursor: isDragging ? 'grabbing' : (actionEvent ? 'pointer' : 'grab'),
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onClick={actionEvent ? handleActionClick : undefined}
      role={actionEvent ? 'button' : undefined}
      tabIndex={actionEvent ? 0 : undefined}
      onKeyDown={
        actionEvent
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleActionClick(e);
              }
            }
          : undefined
      }
    >
      <div
        className="relative overflow-hidden select-none flex items-start gap-3 pl-4 pr-3 py-3"
        style={{
          backgroundColor: cardBg,
          border: `1px solid ${borderColor}`,
          borderRadius: '12px',
          boxShadow: theme.isDark
            ? '0 8px 24px -4px rgba(0, 0, 0, 0.4), 0 4px 8px -2px rgba(0, 0, 0, 0.25)'
            : '0 8px 24px -4px rgba(0, 0, 0, 0.12), 0 4px 8px -2px rgba(0, 0, 0, 0.06)',
        }}
      >
        {/* Left accent bar */}
        <div
          className="absolute left-0 top-0 bottom-0"
          style={{ backgroundColor: accent, width: 4 }}
          aria-hidden
        />

        <div className="flex-shrink-0 mt-0.5" style={{ color: accent }}>
          {getIcon()}
        </div>

        <p
          className="flex-1 text-sm font-medium leading-relaxed min-w-0"
          style={{ color: textColor }}
        >
          {displayMessage}
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClose();
          }}
          className="flex-shrink-0 p-1 rounded-full transition-colors -mr-0.5"
          style={{ color: theme.textLight || '#9CA3AF' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = theme.secondary || (theme.isDark ? '#3A3F47' : '#F3F4F6');
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
          aria-label="Dismiss"
        >
          <X size={14} weight="bold" aria-hidden />
        </button>
      </div>
    </div>
  );
};

/**
 * @param {string} [desktopSidebarHalf='3rem'] - Half of desktop sidebar width so toast
 *   centers over the main content column (app sidebar is lg:w-24 → 3rem).
 */
const ModernToastContainer = ({ theme, desktopSidebarHalf = '3rem' }) => {
  const [toasts, setToasts] = useState([]);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    const handleToast = (event) => {
      const settings = loadSettings();
      const toastEnabled = settings?.features?.toastNotifications ?? true;

      if (!toastEnabled) {
        return;
      }

      const { message, type = 'info', duration, actionEvent } = event.detail;

      const newToast = {
        id: Date.now() + Math.random(),
        message,
        type,
        ...(duration !== undefined && { duration }),
        ...(actionEvent ? { actionEvent } : {}),
      };

      setToasts((prev) => {
        const next = [...prev, newToast];
        return next.slice(-3);
      });
    };

    window.addEventListener('tpp:toast', handleToast);
    return () => window.removeEventListener('tpp:toast', handleToast);
  }, []);

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  const anchor = isDesktop ? 'top' : 'bottom';

  return (
    <div
      className={`fixed z-[10050] flex items-center gap-2 pointer-events-none max-w-sm w-full ${
        isDesktop ? 'flex-col' : 'flex-col-reverse'
      }`}
      style={
        isDesktop
          ? {
              // Below topbar (main content paddingTop is 3.5rem), centered over main column
              top: 'calc(3.5rem + 0.75rem)',
              left: `calc(50% + ${desktopSidebarHalf})`,
              transform: 'translateX(-50%)',
              bottom: 'auto',
            }
          : {
              bottom: 'calc(5.5rem + var(--safe-area-bottom, 0px))',
              left: '50%',
              transform: 'translateX(-50%)',
              top: 'auto',
            }
      }
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto w-full">
          <ModernToast
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
            theme={theme}
            duration={toast.duration}
            anchor={anchor}
            actionEvent={toast.actionEvent}
          />
        </div>
      ))}
    </div>
  );
};

export { ModernToast, ModernToastContainer };
