import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  X, 
  CheckSquare, 
  CheckCircle,
  Zap, 
  Truck, 
  ShoppingCart, 
  BookOpen, 
  BookAlert,
  Package, 
  DollarSign, 
  Pill, 
  Droplets, 
  FlaskConical, 
  Lightbulb, 
  Heart, 
  BarChart3, 
  Award, 
  Target, 
  Activity, 
  Pipette, 
  FileText 
} from 'lucide-react';
import { SealQuestion } from '@phosphor-icons/react';

// Icon mapping for tooltip bullets - matches widget header icons
const ICON_MAP = {
  'CheckSquare': CheckSquare,
  'CheckCircle': CheckCircle,
  'Zap': Zap,
  'Truck': Truck,
  'ShoppingCart': ShoppingCart,
  'BookOpen': BookOpen,
  'BookAlert': BookAlert,
  'Package': Package,
  'DollarSign': DollarSign,
  'Pill': Pill,
  'Droplets': Droplets,
  'FlaskConical': FlaskConical,
  'Lightbulb': Lightbulb,
  'Heart': Heart,
  'BarChart3': BarChart3,
  'Award': Award,
  'Target': Target,
  'Activity': Activity,
  'Pipette': Pipette,
  'FileText': FileText,
};

const ExpandableTooltip = ({ content, theme, position = 'left', controlSize, title }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const buttonRef = useRef(null);
  const tooltipRef = useRef(null);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });

  const body = typeof content === 'string' ? content : (content?.body || '');
  const resolvedTitle = title || (typeof content === 'object' && content?.title) || 'About this widget';

  // Update position when expanded or window resizes
  useEffect(() => {
    if (!isExpanded) return;

    // Calculate tooltip position based on button position
    const updateTooltipPosition = () => {
      if (!buttonRef.current || !tooltipRef.current) return;

      const buttonRect = buttonRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight
      };

      let top = 0;
      let left = 0;

      // Position to the left of button by default
      if (position === 'left') {
        left = buttonRect.left - tooltipRect.width - 8;
        top = buttonRect.top;
        
        // If tooltip would go off left edge, position to the right
        if (left < 8) {
          left = buttonRect.right + 8;
        }
        
        // Adjust vertically if tooltip would go off screen
        if (top + tooltipRect.height > viewport.height - 8) {
          top = viewport.height - tooltipRect.height - 8;
        }
        if (top < 8) {
          top = 8;
        }
      } else {
        // Position to the right of button
        left = buttonRect.right + 8;
        top = buttonRect.top;
        
        // If tooltip would go off right edge, position to the left
        if (left + tooltipRect.width > viewport.width - 8) {
          left = buttonRect.left - tooltipRect.width - 8;
        }
        
        // Adjust vertically if tooltip would go off screen
        if (top + tooltipRect.height > viewport.height - 8) {
          top = viewport.height - tooltipRect.height - 8;
        }
        if (top < 8) {
          top = 8;
        }
      }

      setTooltipPosition({ top, left });
    };

    // Use requestAnimationFrame to ensure tooltip is rendered before calculating position
    const rafId = requestAnimationFrame(() => {
      updateTooltipPosition();
    });

    const handleResize = () => updateTooltipPosition();
    const handleScroll = () => updateTooltipPosition();
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isExpanded, position]);

  // Close tooltip when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        buttonRef.current && 
        !buttonRef.current.contains(event.target) &&
        tooltipRef.current &&
        !tooltipRef.current.contains(event.target)
      ) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isExpanded]);

  if (!content) return null;

  return (
    <>
      <button
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
        className={`rounded-full transition-all hover:opacity-80 focus:outline-none flex items-center justify-center flex-shrink-0 ${controlSize ? '' : 'p-1'}`}
        style={{ 
          color: theme.textLight,
          backgroundColor: isExpanded ? theme.secondary : 'transparent',
          ...(controlSize
            ? { width: controlSize, height: controlSize, padding: 0 }
            : {}),
        }}
        aria-label="Show help"
      >
        <SealQuestion
          size={controlSize ? Math.round(controlSize * 0.75) : 20}
          weight="duotone"
          color={theme.primary}
        />
      </button>

      {isExpanded && createPortal(
        <div
          ref={tooltipRef}
          className="fixed z-[2147483647] p-2.5 rounded-lg shadow-lg"
          style={{
            backgroundColor: theme.isDark ? '#1f2937' : theme.cardBackground,
            border: `1px solid ${theme.isDark ? '#374151' : theme.border}`,
            color: theme.text,
            top: `${tooltipPosition.top}px`,
            left: `${tooltipPosition.left}px`,
            minWidth: '200px',
            maxWidth: 'min(280px, calc(100vw - 2rem))',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            pointerEvents: 'auto'
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <SealQuestion size={18} weight="duotone" color={theme.primary} />
              <span className="text-xs font-semibold" style={{ color: theme.text }}>
                {resolvedTitle}
              </span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(false);
              }}
              className="p-0.5 rounded hover:opacity-70 transition-opacity"
              style={{ color: theme.textLight }}
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>
          <div 
            className="text-xs leading-tight"
            style={{ color: theme.textLight, wordWrap: 'break-word', overflowWrap: 'break-word' }}
          >
            {body.split('\n').map((line, index) => {
              if (!line.trim()) return null;
              
              // Check if line starts with [IconName] format
              const iconMatch = line.match(/^\[([^\]]+)\]\s*(.+)$/);
              
              if (iconMatch) {
                const [, iconName, text] = iconMatch;
                const IconComponent = ICON_MAP[iconName];
                
                return (
                  <div key={index} className="flex items-start gap-1.5 mb-1">
                    {IconComponent && (
                      <IconComponent 
                        size={13} 
                        className="flex-shrink-0 mt-0.5" 
                        style={{ color: theme.primary }} 
                      />
                    )}
                    <span className="break-words" style={{ wordBreak: 'break-word' }}>{text.trim()}</span>
                  </div>
                );
              }
              
              // Regular line without icon
              return (
                <div key={index} className="mb-1 break-words" style={{ wordBreak: 'break-word' }}>
                  {line.trim()}
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default ExpandableTooltip;

