import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CaretLeft } from '@phosphor-icons/react';
import { hapticsLight, hapticsMedium } from '../../utils/haptics';

/**
 * BottomSheet Component - Mobile-optimized modal that slides up from bottom
 * Automatically switches to centered modal on desktop (>768px)
 * 
 * Props:
 * - open: boolean - controls visibility
 * - onClose: function - called when sheet is closed
 * - onBack: function (optional) - shows back button
 * - title: string - header title
 * - titleExtra: ReactNode (optional) - extra content in header
 * - theme: object - theme configuration
 * - children: ReactNode - modal content
 * - footer: ReactNode (optional) - footer content
 * - maxHeight: string (optional) - max height (default: '90vh')
 * - fitContent: boolean (optional) - when true, sheet height fits content (no extra vertical space)
 * - seamlessContent: boolean (optional) - when true, no borders between header/content/footer so content doesn't look like a nested card
 * - snapPoints: array (optional) - snap positions for dragging [0.5, 0.9]
 * - hideHeader: boolean (optional) - hide built-in header (content supplies its own)
 * - maxWidthClass: string (optional) - Tailwind max-width on desktop (default md:max-w-lg)
 */
export default function BottomSheet({ 
  open, 
  onClose, 
  onBack, 
  title, 
  titleSuffix,
  titleExtra, 
  theme, 
  children, 
  footer, 
  maxHeight = '90vh',
  fitContent = false,
  seamlessContent = false,
  snapPoints = [0.9], // Default to single snap point at 90% height
  centerTitle = false,
  contentStyle = {},
  hideHeader = false,
  maxWidthClass = 'md:max-w-lg',
  /** Tailwind z-index class — raise when nesting above onboarding overlays */
  zIndexClass = 'z-[10002]',
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [dragStart, setDragStart] = useState(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const sheetRef = useRef(null);
  const animationTimeoutRef = useRef(null);
  const rafRef = useRef(null);

  // Detect mobile/desktop
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Sync with open prop - with smooth animations
  useEffect(() => {
    // Clear any pending animations
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }

    if (open) {
      // If already rendered and open, skip animation to prevent lag on content updates
      if (shouldRender && internalOpen) {
        return;
      }
      
      // Opening: render first with initial state (off-screen)
      setShouldRender(true);
      
      // Only animate if not already open (prevents re-animation when content updates)
      if (!internalOpen) {
        setInternalOpen(false); // Start closed
        
        // Wait for DOM to render initial state, then animate
        // Triple RAF ensures the browser has painted the initial state
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = requestAnimationFrame(() => {
              setInternalOpen(true);
              hapticsLight();
            });
          });
        });
      } else {
        // Already open, just ensure it stays open
        setInternalOpen(true);
      }
    } else {
      // Closing: ensure smooth animation
      // Reset drag state first for clean animation
      setDragOffset(0);
      setIsDragging(false);
      setDragStart(null);
      
      // Force a reflow to ensure the element is in the right state
      if (sheetRef.current) {
        // Trigger a reflow by reading a layout property
        void sheetRef.current.offsetHeight;
      }
      
      // Double RAF ensures the browser is ready and the transition is applied
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = requestAnimationFrame(() => {
          setInternalOpen(false);
          // Wait for animation to complete before removing from DOM
          animationTimeoutRef.current = setTimeout(() => {
            setShouldRender(false);
          }, 500); // Match transition duration
        });
      });
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [open]);

  // Prevent body scroll when open
  useEffect(() => {
    if (!internalOpen) return;
    
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    
    // Dispatch modal open event
    window.dispatchEvent(new CustomEvent('tpp:modal-open'));
    
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [internalOpen]);

  // Handle drag gestures for mobile
  const handleTouchStart = (e) => {
    if (!isMobile) return;
    const touch = e.touches[0];
    setDragStart(touch.clientY);
    setIsDragging(true);
    hapticsLight();
  };

  const handleTouchMove = (e) => {
    if (!isMobile || dragStart === null) return;
    const touch = e.touches[0];
    const offset = Math.max(0, touch.clientY - dragStart);
    setDragOffset(offset);
  };

  const handleTouchEnd = () => {
    if (!isMobile) return;
    
    // Close if dragged down more than 100px
    if (dragOffset > 100) {
      hapticsMedium();
      // Reset drag state before closing for smooth animation
      setIsDragging(false);
      setDragStart(null);
      setDragOffset(0);
      // Call onClose - the useEffect will handle the smooth animation
      onClose();
    } else {
      // Snap back to original position
      setIsDragging(false);
      hapticsLight();
      setDragStart(null);
      setDragOffset(0);
    }
  };

  const handleBackdropClick = () => {
    hapticsMedium();
    // Reset any drag state before closing
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragOffset(0);
    }
    // Call onClose - the useEffect will handle the smooth animation
    onClose();
  };

  if (!shouldRender) return null;

  // Theme-aware styling - dark uses dark slate, light uses card background
  const headerBackground = theme?.isDark ? 'rgba(24, 28, 36, 0.98)' : (theme?.cardBackground || '#FFFFFF');
  const headerTextColor = theme?.text || '#000000';
  
  // Calculate transition based on open state for smoother animations
  const sheetTransition = isMobile 
    ? `transform ${internalOpen ? '500ms' : '450ms'} ${internalOpen ? 'cubic-bezier(0.32, 0.72, 0, 1)' : 'cubic-bezier(0.4, 0.0, 0.2, 1)'}${fitContent ? ', height 220ms cubic-bezier(0.22, 1, 0.36, 1)' : ''}`
    : `transform 400ms cubic-bezier(0.32, 0.72, 0, 1), opacity 400ms cubic-bezier(0.32, 0.72, 0, 1)${fitContent ? ', height 220ms cubic-bezier(0.22, 1, 0.36, 1)' : ''}`;
  
  const backdropTransition = `opacity ${internalOpen ? '500ms' : '450ms'} ${internalOpen ? 'cubic-bezier(0.32, 0.72, 0, 1)' : 'cubic-bezier(0.4, 0.0, 0.2, 1)'}`;
  const containerTransition = backdropTransition;

  const content = (
    <div 
      className={`fixed inset-0 ${zIndexClass} flex items-end md:items-center md:justify-center overflow-hidden`}
      style={{
        opacity: internalOpen ? 1 : 0,
        pointerEvents: internalOpen ? 'auto' : 'none',
        transition: containerTransition
      }}
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{
          opacity: internalOpen ? 1 : 0,
          transition: containerTransition
        }}
        onClick={handleBackdropClick}
      />
      
      {/* Bottom Sheet (mobile) / Centered Modal (desktop) */}
      <div 
        ref={sheetRef}
        className={`
          relative w-full bg-white rounded-t-3xl md:rounded-2xl overflow-hidden
          ${fitContent ? 'flex flex-col h-auto min-h-0' : 'flex flex-col'}
          ${maxWidthClass} md:mx-4
        `}
        style={{ 
          backgroundColor: theme?.isDark ? 'rgba(24, 28, 36, 0.98)' : (theme?.cardBackground || '#FFFFFF'),
          // fitContent: size to content (fit-content avoids flex+maxHeight stretching to full vh)
          // BUG #10 FIX: Use dvh (dynamic viewport height) on mobile to account for keyboard
          ...(fitContent
            ? { height: 'auto', maxHeight: isMobile ? '90dvh' : maxHeight }
            : { height: isMobile ? '90dvh' : maxHeight, maxHeight: isMobile ? '90dvh' : maxHeight }),
          boxShadow: theme?.isDark 
            ? '0 -10px 40px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.08)' 
            : '0 -10px 40px rgba(0,0,0,0.2)',
          transform: isMobile 
            ? `translate3d(0, ${internalOpen ? (isDragging ? `${dragOffset}px` : '0') : '100%'}, 0)`
            : `scale(${internalOpen ? 1 : 0.95})`,
          opacity: isMobile ? 1 : (internalOpen ? 1 : 0),
          transition: isDragging ? 'none' : sheetTransition,
          willChange: fitContent ? 'transform, height' : 'transform',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle (mobile only) */}
        {isMobile && (
          <div 
            className="flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              className="w-12 h-1 rounded-full opacity-40"
              style={{ backgroundColor: theme?.text || '#000' }}
            />
          </div>
        )}

        {/* Header - match content horizontal padding when seamless so no inner "frame" */}
        {!hideHeader && (
        <div 
          className={`flex items-center py-3 flex-shrink-0 ${seamlessContent ? 'px-4 sm:px-5' : 'px-6 border-b'} ${centerTitle ? 'justify-center relative' : 'justify-between'}`}
          style={{ 
            backgroundColor: headerBackground,
            color: headerTextColor,
            ...(seamlessContent ? {} : { borderColor: theme?.isDark ? 'rgba(255,255,255,0.06)' : (theme?.border || 'rgba(0,0,0,0.1)') })
          }}
        >
          {centerTitle ? (
            <>
              {/* Left side - Back button */}
              {onBack && (
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    hapticsLight();
                    if (isDragging) {
                      setIsDragging(false);
                      setDragStart(null);
                      setDragOffset(0);
                    }
                    onBack();
                  }}
                  className="absolute left-4 p-1 rounded-full transition-colors touch-manipulation hover:bg-black/10 dark:hover:bg-white/10" 
                  style={{ 
                    color: headerTextColor,
                    WebkitTapHighlightColor: 'transparent'
                  }}
                >
                  <CaretLeft size={20} weight="regular" />
                </button>
              )}
              
              {/* Centered title */}
              <h3 className="text-xl font-bold tracking-tight text-center flex items-center justify-center gap-1.5" style={{ color: headerTextColor }}>
                {title}
                {titleSuffix && (
                  <span className="text-sm font-normal opacity-55 tracking-normal">{titleSuffix}</span>
                )}
              </h3>
              
              {/* Right side - Close button */}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  hapticsLight();
                  if (isDragging) {
                    setIsDragging(false);
                    setDragStart(null);
                    setDragOffset(0);
                  }
                  onClose();
                }}
                className="absolute right-4 p-1 rounded-full transition-colors touch-manipulation hover:bg-black/10 dark:hover:bg-white/10"
                style={{ 
                  color: headerTextColor,
                  WebkitTapHighlightColor: 'transparent'
                }}
              >
                <X size={20} weight="regular" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {onBack && (
                  <button 
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      hapticsLight();
                      if (isDragging) {
                        setIsDragging(false);
                        setDragStart(null);
                        setDragOffset(0);
                      }
                      onBack();
                    }}
                    className="p-1 rounded-full -ml-2 transition-colors touch-manipulation hover:bg-black/10 dark:hover:bg-white/10" 
                    style={{ 
                      color: headerTextColor,
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    <CaretLeft size={20} weight="regular" />
                  </button>
                )}
                <h3 className="text-xl font-bold tracking-tight flex items-center gap-1.5 min-w-0 flex-1" style={{ color: headerTextColor }}>
                  {title}
                  {titleSuffix && (
                    <span className="text-sm font-normal opacity-55 tracking-normal">{titleSuffix}</span>
                  )}
                </h3>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {titleExtra && (
                  <div className="text-sm flex-shrink-0 max-w-[55%]">
                    {titleExtra}
                  </div>
                )}
                <button 
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    hapticsMedium();
                    if (isDragging) {
                      setIsDragging(false);
                      setDragStart(null);
                      setDragOffset(0);
                    }
                    onClose();
                  }}
                  className="p-1.5 rounded-full transition-colors touch-manipulation hover:bg-black/10 dark:hover:bg-white/10" 
                  style={{ 
                    color: headerTextColor,
                    WebkitTapHighlightColor: 'transparent'
                  }}
                >
                  <X size={24} weight="regular" />
                </button>
              </div>
            </>
          )}
        </div>
        )}

        {/* Content - use minimal padding when seamlessContent so content doesn't look like a nested card */}
        <div 
          data-seamless={seamlessContent ? 'true' : undefined}
          className={`overflow-x-hidden ${
            fitContent ? 'min-h-0 flex-shrink overflow-y-auto px-5 pt-5 pb-4 sm:px-8 sm:pt-6 sm:pb-5' 
              : seamlessContent ? 'flex-1 overflow-y-auto bottom-sheet-seamless-content' 
              : 'flex-1 px-4 pt-4 pb-0 sm:px-6 sm:pt-6 overflow-y-auto'
          }`}
          style={{ 
            backgroundColor: theme?.isDark ? 'rgba(24, 28, 36, 0.98)' : (theme?.cardBackground || '#FFFFFF'),
            // Reserve header + footer so the fixed footer never gets clipped under maxHeight
            // BUG #10 FIX: Use dvh for mobile to account for keyboard, with vh fallback
            ...(fitContent ? { 
              maxHeight: isMobile 
                ? `min(calc(90dvh - 9rem), calc(${maxHeight} - 9rem))` 
                : `calc(${maxHeight} - 9rem)` 
            } : {}),
            ...(seamlessContent ? { 
              boxShadow: 'none', 
              border: 'none',
              paddingLeft: 0,
              paddingRight: 0,
              paddingTop: '0.5rem',
              paddingBottom: '0.75rem'
            } : {}),
            ...contentStyle
          }}
        >
          {children}
        </div>

        {/* Footer - match content horizontal padding when seamless so no inner "frame" */}
        {footer && (
          <div 
            className={`py-3 flex items-center justify-end gap-3 flex-shrink-0 ${seamlessContent ? 'px-4 sm:px-5' : fitContent ? 'px-5 sm:px-8 border-t' : 'px-6 border-t'}`}
            style={{ 
              backgroundColor: theme?.isDark ? 'rgba(24, 28, 36, 0.98)' : (theme?.surface || '#ffffff'),
              ...(seamlessContent ? {} : { borderColor: theme?.isDark ? 'rgba(255,255,255,0.06)' : (theme?.border || 'rgba(0,0,0,0.1)') }),
              // Add bottom padding for Android navigation bar on mobile devices
              // Only adds extra padding when safe-area-bottom is detected (e.g., Samsung with gesture nav)
              // Devices without overlap (e.g., Pixel) will just get normal 0.75rem padding
              paddingBottom: isMobile 
                ? `max(0.75rem, calc(0.75rem + var(--safe-area-bottom, 0px)))`
                : '0.75rem'
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

