import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

/**
 * Modern custom dropdown component with floating menu.
 * Uses a portal to escape backdrop-filter / mask stacking contexts
 * (e.g. content-section cards on iOS / dark mode) so the menu is never clipped.
 */
export default function CustomDropdown({ 
    label, 
    value, 
    onChange, 
    options = [], 
    placeholder = "Select...",
    theme,
    outlined = false,
    customShadow = false,
    /** Above BottomSheet / Modal (z-[10002]) so menus stay visible in admin sheets */
    menuZIndex = 10050,
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState({});
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);

    const calcMenuStyle = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        const gap = 6;
        const preferredMax = 240;
        const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
        const spaceAbove = rect.top - gap - 8;
        const openUp = spaceBelow < Math.min(preferredMax, 160) && spaceAbove > spaceBelow;
        const maxHeight = Math.max(120, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow));

        setMenuStyle({
            position: 'fixed',
            left: rect.left,
            width: rect.width,
            zIndex: menuZIndex,
            maxHeight,
            ...(openUp
                ? { top: 'auto', bottom: window.innerHeight - rect.top + gap }
                : { top: rect.bottom + gap, bottom: 'auto' }),
        });
    }, [menuZIndex]);

    // Close dropdown when clicking/touching outside
    useEffect(() => {
        const handleOutside = (event) => {
            if (
                dropdownRef.current && !dropdownRef.current.contains(event.target) &&
                !(event.target.closest && event.target.closest('[data-dropdown-menu]'))
            ) {
                setIsOpen(false);
            }
        };
        const handleClose = () => setIsOpen(false);
        // Scroll events don't bubble, but capture:true on window still sees them.
        // Closing on *every* scroll made the menu dismiss while scrolling its own list
        // (e.g. EmailTemplateManager "Choose template" with 40 options).
        const handleScroll = (event) => {
            const target = event.target;
            if (menuRef.current && (menuRef.current === target || menuRef.current.contains(target))) {
                return;
            }
            setIsOpen(false);
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleOutside);
            document.addEventListener('touchstart', handleOutside);
            window.addEventListener('scroll', handleScroll, { passive: true, capture: true });
            window.addEventListener('resize', handleClose, { passive: true });
        }

        return () => {
            document.removeEventListener('mousedown', handleOutside);
            document.removeEventListener('touchstart', handleOutside);
            window.removeEventListener('scroll', handleScroll, { capture: true });
            window.removeEventListener('resize', handleClose);
        };
    }, [isOpen]);

    const selectedOption = options.find(opt => opt.value === value);
    const displayText = selectedOption ? selectedOption.label : (placeholder || '(Optional)');

    return (
        <div ref={dropdownRef} className="relative">
            {label && (
                <label className="text-sm font-medium mb-2 block" style={{ color: theme.text }}>
                    {label}
                </label>
            )}
            
            {/* Dropdown Button */}
            <button
                ref={buttonRef}
                type="button"
                onClick={() => {
                    if (!isOpen) calcMenuStyle();
                    setIsOpen(!isOpen);
                }}
                onMouseDown={(e) => {
                    // Prevent any parent blur events on mobile
                    e.preventDefault();
                }}
                onTouchStart={(e) => {
                    // Prevent any parent blur events on touch devices
                    e.preventDefault();
                }}
                className={`w-full ${outlined ? 'px-4 py-3.5' : 'px-3 py-2'} text-sm border ${outlined ? 'rounded-xl' : 'rounded-md'} flex items-center justify-between transition-all duration-200 touch-manipulation ${outlined ? 'hover:shadow-md' : 'hover:border-gray-400'} overflow-hidden`}
                style={{
                    borderColor: isOpen 
                        ? (theme.isDark ? 'rgba(255,255,255,0.25)' : theme.primary) 
                        : (theme.isDark ? 'rgba(255,255,255,0.08)' : theme.border),
                    backgroundColor: outlined ? (theme.isDark ? '#1f2937' : '#ffffff') : theme.cardBackground,
                    color: value ? (outlined && !theme.isDark ? '#181A18' : theme.text) : theme.textLight,
                    WebkitTapHighlightColor: 'transparent',
                    fontWeight: '500',
                    boxShadow: outlined && customShadow 
                        ? (isOpen 
                            ? (theme.isDark 
                                ? `0 0 0 2px rgba(255,255,255,0.12), 0 4px 12px rgba(0,0,0,0.5)` 
                                : `0 0 0 2px ${theme.primary}20, 0 4px 12px rgba(0,0,0,0.15)`)
                            : (theme.isDark 
                                ? '0 2px 8px rgba(0,0,0,0.4)' 
                                : '0 1px 3px rgba(0,0,0,0.1)'))
                        : (isOpen && outlined
                            ? (theme.isDark 
                                ? `0 0 0 2px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.4)` 
                                : `0 0 0 2px ${theme.primaryLight}, 0 1px 3px rgba(0,0,0,0.1)`)
                            : 'none')
                }}
            >
                <span className="flex items-center gap-2.5 min-w-0 flex-1">
                    {selectedOption?.icon && <span className="flex-shrink-0">{selectedOption.icon}</span>}
                    <span className="truncate text-left">{displayText}</span>
                </span>
                <ChevronDown 
                    size={18} 
                    className={`transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    style={{ color: isOpen ? (theme.isDark ? 'rgba(255,255,255,0.7)' : theme.primary) : theme.textLight }}
                />
            </button>

            {/* Dropdown Menu — rendered via portal so it escapes any clipping stacking context */}
            {isOpen && createPortal(
                <div
                    ref={menuRef}
                    data-dropdown-menu
                    style={{
                        ...menuStyle,
                        overflow: 'hidden',
                        pointerEvents: 'auto',
                    }}
                >
                    <div 
                        className="py-2 border rounded-xl shadow-xl overflow-x-hidden h-full flex flex-col"
                        style={{ 
                            borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : theme.border,
                            backgroundColor: theme.cardBackground,
                            boxShadow: theme.isDark 
                                ? '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)' 
                                : '0 10px 25px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05)',
                            maxHeight: 'inherit',
                        }}
                    >
                        <div
                            className="overflow-y-auto overflow-x-hidden min-h-0"
                            style={{ maxHeight: 'inherit', overscrollBehavior: 'contain' }}
                        >
                            {options && options.length > 0 ? options.map((option, index) => {
                                const isSelected = value === option.value;
                                const prevGroup = index > 0 ? options[index - 1]?.group : null;
                                const showGroup = option.group && option.group !== prevGroup;
                                return (
                                    <React.Fragment key={option.value}>
                                        {showGroup && (
                                            <div
                                                className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wide"
                                                style={{ color: theme.textLight }}
                                            >
                                                {option.group}
                                            </div>
                                        )}
                                        <button
                                            type="button"
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                            }}
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onChange(option.value);
                                                setIsOpen(false);
                                            }}
                                            onMouseEnter={(e) => {
                                                if (!isSelected) {
                                                    e.currentTarget.style.backgroundColor = theme.isDark ? '#374151' : '#f3f4f6';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isSelected) {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                }
                                            }}
                                            className="w-full px-4 py-3 text-sm text-left flex items-center justify-between transition-all duration-150 touch-manipulation overflow-hidden"
                                            style={{
                                                backgroundColor: isSelected ? (theme.isDark ? 'rgba(255,255,255,0.08)' : theme.primary + '15') : 'transparent',
                                                color: theme.text,
                                                WebkitTapHighlightColor: 'transparent',
                                                borderRadius: '0.5rem',
                                                margin: '2px 4px'
                                            }}
                                        >
                                            <span className="flex items-center gap-3 font-medium min-w-0 flex-1">
                                                {option.icon && <span className="flex-shrink-0">{option.icon}</span>}
                                                <span className="truncate">{option.label}</span>
                                            </span>
                                            {isSelected && (
                                                <Check size={18} style={{ color: theme.isDark ? 'rgba(255,255,255,0.7)' : theme.primary }} className="flex-shrink-0" />
                                            )}
                                        </button>
                                    </React.Fragment>
                                );
                            }) : (
                                <div className="px-4 py-3 text-sm text-center" style={{ color: theme.textLight }}>
                                    No options available
                                </div>
                            )}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

