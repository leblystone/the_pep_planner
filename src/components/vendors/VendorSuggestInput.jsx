import React from 'react'
import TextInput from '../common/inputs/TextInput'
import { useAppContext } from '../../context/AppContext'

export default function VendorSuggestInput({ label = 'Vendor', value, onChange, placeholder = 'Vendor', theme, maxLength = null, autoComplete = null }) {
  const { vendors: contextVendors } = useAppContext()
  const vendors = contextVendors || []
  const [q, setQ] = React.useState(value || '')
  const [open, setOpen] = React.useState(false)
  React.useEffect(() => { setQ(value || '') }, [value])

  const list = React.useMemo(() => {
    const s = (q || '').toLowerCase()
    if (!s) return []
    const uniq = Array.from(new Set(vendors.map(v => v.name || v))) // Handle both objects and strings
    return uniq.filter(v => typeof v === 'string' && v.toLowerCase().includes(s)).slice(0, 6)
  }, [q, vendors])

  return (
    <div className="relative">
      <TextInput 
        label={label} 
        value={q} 
        onChange={(v) => { setQ(v); onChange?.(v); setOpen(true) }} 
        placeholder={placeholder} 
        theme={theme} 
        onFocus={() => setOpen(true)} 
        onBlur={(e) => {
          // Delay blur to allow dropdown clicks to register on mobile
          setTimeout(() => {
            const relatedTarget = e.relatedTarget || document.activeElement;
            const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]');
            if (!isClickingDropdown && !open) {
              setOpen(false);
            }
          }, 150);
        }} 
        outlined={true} 
        customTextColor={theme.isDark ? null : "#181A18"} 
        customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'} 
        maxLength={maxLength}
        autoComplete={autoComplete}
      />
      {open && list.length > 0 && (
        <div 
          className="absolute z-10 mt-1 w-full rounded-md border shadow" 
          data-dropdown-container
          style={{ 
            borderColor: theme?.border,
            backgroundColor: theme?.isDark ? '#1f2937' : '#ffffff'
          }}
        >
          {list.map(v => (
            <button 
              key={v} 
              type="button" 
              className="w-full text-left px-3 py-2 touch-manipulation transition-colors" 
              style={{ 
                WebkitTapHighlightColor: 'transparent',
                color: theme?.isDark ? theme?.text : '#181A18',
                backgroundColor: 'transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme?.isDark ? '#374151' : '#f3f4f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              onMouseDown={(e) => {
                // Prevent input blur on mobile
                e.preventDefault();
              }}
              onTouchStart={(e) => {
                // Prevent input blur on touch devices
                e.preventDefault();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onChange?.(v);
                setQ(v);
                setOpen(false);
              }}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}


