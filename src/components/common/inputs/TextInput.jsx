import React, { useState } from 'react'

export default function TextInput({
  label,
  value,
  onChange,
  placeholder,
  theme,
  name,
  type = 'text',
  onFocus,
  onBlur,
  dense = false,
  multiline = false,
  rows = 3,
  uppercase = false,
  customShadow = null,
  outlined = false,
  customTextColor = null,
  maxLength = null,
  prefix = null,
  /** When true, hide text prefix until the field is focused or has a value (avoids clashing with placeholder). */
  hidePrefixUntilActive = false,
  /** Absolute right adornment inside the outlined field (e.g. compact icon picker). Single-line outlined only. */
  suffix = null,
  /** Outlined-only: placeholder-only styling; label kept for accessibility (sr-only). */
  minimalOutline = false,
  step = null,
  autoFocus = false,
  autoComplete = null,
}) {
  const [isFocused, setIsFocused] = useState(false);
  // Ensure value is always a string to prevent controlled/uncontrolled warnings
  const safeValue = value != null ? String(value) : '';
  const hasValue = safeValue && safeValue.trim() !== '';
  const isLabelActive = isFocused || hasValue;
  const showPrefix = !!prefix && (!hidePrefixUntilActive || isFocused || hasValue);
  const useMinimalFloating = !!(outlined && minimalOutline && !multiline);
  const outlinedPlaceholder = useMinimalFloating ? (placeholder ?? label ?? '') : (isLabelActive ? placeholder : ' ');
  return (
    <>
      <style>{`
        .themed-input:focus {
          box-shadow: ${theme.isDark 
            ? `0 0 0 2px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.35)` 
            : `0 0 0 2px ${theme.primaryLight}, 0 2px 8px rgba(0,0,0,0.08)`};
        }
        .themed-textarea:focus {
          box-shadow: ${theme.isDark 
            ? `0 0 0 2px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.35)` 
            : `0 0 0 2px ${theme.primaryLight}, 0 2px 8px rgba(0,0,0,0.08)`};
        }
        /* Hide number input spinners (Chrome, Safari, Edge, Opera) */
        input[type=number].no-spin::-webkit-inner-spin-button,
        input[type=number].no-spin::-webkit-outer-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        /* Firefox */
        input[type=number].no-spin {
          -moz-appearance: textfield;
        }
        /* Keep placeholder in normal case even when input is uppercase */
        .themed-input-uppercase::placeholder,
        .themed-textarea-uppercase::placeholder {
          text-transform: none !important;
        }
        
        /* Force text color for autofilled inputs */
        .outlined-input:-webkit-autofill,
        .outlined-input:-webkit-autofill:hover,
        .outlined-input:-webkit-autofill:focus,
        .outlined-input:-webkit-autofill:active {
          -webkit-text-fill-color: ${customTextColor || (theme.isDark ? '#ffffff' : '#181A18')} !important;
          -webkit-box-shadow: 0 0 0px 1000px ${theme.isDark ? (theme.inputBackground || theme.cardBackground || '#222831') : (theme.inputBackground || '#fff')} inset !important;
          box-shadow: 0 0 0px 1000px ${theme.isDark ? (theme.inputBackground || theme.cardBackground || '#222831') : (theme.inputBackground || '#fff')} inset !important;
        }
        /* Outlined input styles */
        .outlined-input-wrapper {
          position: relative;
        }
        .outlined-input-label {
          position: absolute;
          left: ${dense ? '12px' : '16px'};
          top: ${dense ? '10px' : '14px'};
          pointer-events: none;
          transition: all 0.2s ease;
          color: ${theme.textLight || theme.text};
          font-size: ${dense ? '0.9375rem' : '1rem'};
          font-weight: 500;
          z-index: 3;
        }
        .outlined-input-label.active {
          top: -8px;
          left: 12px;
          font-size: 0.875rem;
          padding: 0 4px;
          background: ${theme.isDark ? (theme.cardBackground || '#222831') : (theme.inputBackground || '#fff')};
          color: ${theme.isDark ? 'rgba(160, 180, 153, 0.85)' : theme.primary};
          font-weight: 500;
        }
        .outlined-input:focus + .outlined-input-label,
        .outlined-input:not(:placeholder-shown) + .outlined-input-label {
          top: -8px;
          left: 12px;
          font-size: 0.875rem;
          padding: 0 4px;
          background: ${theme.isDark ? (theme.cardBackground || '#222831') : (theme.inputBackground || '#fff')};
          color: ${theme.isDark ? 'rgba(160, 180, 153, 0.85)' : theme.primary};
          font-weight: 500;
        }
      `}</style>
      {outlined ? (
        <div className="outlined-input-wrapper w-full min-w-0">
          {showPrefix && (
            <span
              style={{
                position: 'absolute',
                left: dense ? '12px' : '13px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'auto',
                color: customTextColor || (theme.isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.4)'),
                fontSize: dense ? '0.875rem' : '1rem',
                fontWeight: 500,
                zIndex: 2,
              }}
            >
              {prefix}
            </span>
          )}
          {multiline ? (
            <textarea
              name={name || `outlined-input-${label?.replace(/\s+/g, '-').toLowerCase()}`}
              id={name || `outlined-input-${label?.replace(/\s+/g, '-').toLowerCase()}`}
              value={safeValue}
              rows={rows}
              autoFocus={autoFocus}
              autoComplete={autoComplete || undefined}
              onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
              onFocus={(e) => {
                setIsFocused(true);
                if (onFocus) onFocus(e);
              }}
              onBlur={(e) => {
                setIsFocused(false);
                if (onBlur) onBlur(e);
              }}
              placeholder={outlinedPlaceholder}
              aria-label={label || placeholder}
              className={`w-full min-w-0 ${dense ? 'p-2 text-sm' : 'p-3'} rounded-lg transition-all focus:outline-none outlined-input ${uppercase ? 'themed-input-uppercase' : ''} resize-y`}
              style={{ 
                boxSizing: 'border-box',
                border: `1px solid ${isFocused 
                  ? (theme.isDark ? 'rgba(255,255,255,0.25)' : theme.primary) 
                  : (theme.isDark ? 'rgba(255,255,255,0.1)' : '#ddd9d0')}`,
                backgroundColor: theme.isDark ? (theme.inputBackground || theme.cardBackground || '#222831') : (theme.inputBackground || '#fff'), 
                color: customTextColor ? customTextColor : (theme.isDark ? '#ffffff' : '#181A18'),
                boxShadow: customShadow || (theme.isDark ? '0 2px 4px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.07), inset 0 1px 2px rgba(0,0,0,0.04)'),
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                overflowWrap: 'break-word',
                textTransform: uppercase ? 'uppercase' : 'none'
              }}
            />
          ) : (
            <input
              name={name || `outlined-input-${label?.replace(/\s+/g, '-').toLowerCase()}`}
              id={name || `outlined-input-${label?.replace(/\s+/g, '-').toLowerCase()}`}
              type={type}
              value={safeValue}
              step={step || undefined}
              autoFocus={autoFocus}
              autoComplete={autoComplete || undefined}
              onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
              onFocus={(e) => {
                setIsFocused(true);
                if (onFocus) onFocus(e);
              }}
              onBlur={(e) => {
                setIsFocused(false);
                if (onBlur) onBlur(e);
              }}
              placeholder={outlinedPlaceholder}
              aria-label={label || placeholder}
              maxLength={maxLength}
              className={`w-full min-w-0 ${dense ? 'p-2 text-sm' : 'p-3'} rounded-lg transition-all focus:outline-none outlined-input ${uppercase ? 'themed-input-uppercase' : ''} ${type === 'number' ? 'no-spin' : ''}`}
              style={{ 
                boxSizing: 'border-box',
                border: `1px solid ${isFocused 
                  ? (theme.isDark ? 'rgba(255,255,255,0.25)' : theme.primary) 
                  : (theme.isDark ? 'rgba(255,255,255,0.1)' : '#ddd9d0')}`,
                backgroundColor: theme.isDark ? (theme.inputBackground || theme.cardBackground || '#222831') : (theme.inputBackground || '#fff'), 
                color: customTextColor ? customTextColor : (theme.isDark ? '#ffffff' : '#181A18'),
                boxShadow: customShadow || (theme.isDark ? '0 2px 4px rgba(0,0,0,0.25)' : '0 1px 3px rgba(0,0,0,0.07), inset 0 1px 2px rgba(0,0,0,0.04)'),
                textTransform: uppercase ? 'uppercase' : 'none',
                overflowWrap: 'break-word',
                wordBreak: 'break-word',
                ...(showPrefix ? { paddingLeft: dense ? '3rem' : '3.5rem' } : {}),
                ...(suffix ? { paddingRight: dense ? '3.125rem' : '3.5rem' } : {}),
              }}
            />
          )}
          {label && useMinimalFloating && (
            <label htmlFor={name || `outlined-input-${label?.replace(/\s+/g, '-').toLowerCase()}`} className="sr-only">
              {label}
            </label>
          )}
          {label && !useMinimalFloating && (
            <label 
              htmlFor={name || `outlined-input-${label?.replace(/\s+/g, '-').toLowerCase()}`}
              className={`outlined-input-label ${isLabelActive ? 'active' : ''}`}
            >
              {label}
            </label>
          )}
          {suffix && !multiline && (
            <div
              className="flex items-center shrink-0"
              style={{
                position: 'absolute',
                right: dense ? 6 : 8,
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 2,
                pointerEvents: 'auto',
              }}
            >
              {suffix}
            </div>
          )}
        </div>
      ) : (
      <label className="block w-full">
        {label && <span id={`${name || 'input'}-label`} className={`block ${dense ? 'text-xs' : 'text-sm'} font-medium mb-1`} style={{ color: theme.text }}>{label}</span>}
        {multiline ? (
          <textarea
            name={name}
            value={safeValue}
            rows={rows}
            autoComplete={autoComplete || undefined}
            onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            aria-label={label || placeholder}
            aria-describedby={label ? `${name || 'input'}-label` : undefined}
            className={`w-full ${dense ? 'p-2 text-sm' : 'p-3'} rounded-lg transition-all focus:outline-none themed-textarea ${uppercase ? 'themed-textarea-uppercase' : ''} resize-y`}
            style={{
              border: theme.isDark ? '1px solid rgba(255,255,255,0.08)' : `1px solid ${theme.border}`,
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : (theme.inputBackground || '#fff'),
              color: theme.text,
              boxShadow: theme.isDark ? 'inset 0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.08), inset 0 1px 2px rgba(0,0,0,0.04)',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              overflowWrap: 'break-word',
              textTransform: uppercase ? 'uppercase' : 'none'
            }}
          />
        ) : (
          <input
            name={name}
            type={type}
            value={safeValue}
            autoComplete={autoComplete || undefined}
            onChange={e => onChange(uppercase ? e.target.value.toUpperCase() : e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={placeholder}
            aria-label={label || placeholder}
            aria-describedby={label ? `${name || 'input'}-label` : undefined}
            maxLength={maxLength}
            className={`w-full ${dense ? 'p-2 text-sm' : 'p-3'} rounded-lg transition-all focus:outline-none themed-input ${uppercase ? 'themed-input-uppercase' : ''} ${type === 'number' ? 'no-spin' : ''}`}
            style={{ 
              border: theme.isDark ? '1px solid rgba(255,255,255,0.08)' : `1px solid ${theme.border}`,
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : (theme.inputBackground || '#fff'), 
              color: theme.text,
              boxShadow: customShadow || (theme.isDark ? 'inset 0 1px 3px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.08), inset 0 1px 2px rgba(0,0,0,0.04)'),
              textTransform: uppercase ? 'uppercase' : 'none'
            }}
          />
        )}
      </label>
      )}
    </>
  )
}


