import React, { useState } from 'react';

export default function CrimpCapColorInput({ value, onChange, theme, customShadow = null, customTextColor = null }) {
  const [isFocused, setIsFocused] = useState(false);
  const raw = value || '';
  const parts = raw.split(/\s*\/\s*/);
  const crimpPart = parts[0]?.trim() ?? '';
  const capPart = parts[1]?.trim() ?? '';
  const hasValue = !!(crimpPart || capPart);
  const isLabelActive = isFocused || hasValue;

  const borderColor = isFocused ? theme.primary : (theme.isDark ? (theme.border || '#71809650') : '#f0eee7');
  const focusShadow = theme.isDark
    ? `0 0 0 2px ${theme.primary}40, 0 2px 8px rgba(0,0,0,0.4)`
    : `0 0 0 2px ${theme.primaryLight}, 0 1px 3px rgba(0,0,0,0.1)`;
  const baseShadow = customShadow || (theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : '0 1px 2px rgba(0,0,0,0.05)');
  const boxShadow = isFocused ? `${focusShadow}, ${baseShadow}` : baseShadow;
  const labelBg = theme.isDark ? (theme.cardBackground || '#0f172a') : (theme.inputBackground || '#fff');
  const inputColor = customTextColor || (theme.isDark ? theme.text : '#181A18');
  // Only show placeholders when label is floated up; otherwise they overlap the label and cause ghosting
  const showPlaceholders = isLabelActive;

  return (
    <div className="relative w-full">
      <div
        className="flex items-center rounded-lg w-full transition-all duration-200"
        style={{
          border: `1px solid ${borderColor}`,
          backgroundColor: theme.isDark ? (theme.inputBackground || theme.cardBackground || '#0f172a') : (theme.inputBackground || '#fff'),
          boxShadow,
        }}
      >
        <input
          className="flex-1 min-w-0 border-0 outline-none text-sm font-medium py-3 px-3 bg-transparent"
          style={{ color: inputColor }}
          name="crimp-color"
          autoComplete="off"
          value={crimpPart}
          onChange={e => onChange([e.target.value.trim(), capPart].filter(Boolean).join(' / '))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={showPlaceholders ? 'Crimp' : ' '}
          aria-label="Crimp color"
        />
        <span className="text-sm font-medium opacity-60 shrink-0 px-0.5" style={{ color: theme.text }}>/</span>
        <input
          className="flex-1 min-w-0 border-0 outline-none text-sm font-medium py-3 px-3 bg-transparent"
          style={{ color: inputColor }}
          name="cap-color"
          autoComplete="off"
          value={capPart}
          onChange={e => onChange([crimpPart, e.target.value.trim()].filter(Boolean).join(' / '))}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={showPlaceholders ? 'Cap' : ' '}
          aria-label="Cap color"
        />
      </div>
      <label
        className="pointer-events-none absolute z-10 transition-all duration-200 ease-out"
        style={{
          left: isLabelActive ? 12 : 16,
          top: isLabelActive ? -10 : 14,
          fontSize: isLabelActive ? '0.75rem' : '1rem',
          padding: isLabelActive ? '0 4px' : 0,
          background: isLabelActive ? labelBg : 'transparent',
          color: isLabelActive ? theme.primary : (theme.textLight || theme.text),
          fontWeight: 500,
        }}
      >
        Crimp / Cap color
      </label>
    </div>
  );
}
