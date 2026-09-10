import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconContext } from '@phosphor-icons/react';
import { useAppContext } from '../../context/AppContext';
import { useSubscriptionAccess } from '../../utils/useSubscriptionAccess';
import useAutoSave from '../../utils/useAutoSave';
import BottomSheet from '../common/BottomSheet';
import TextInput from '../common/inputs/TextInput';
import VendorSuggestInput from '../vendors/VendorSuggestInput';
import CrimpCapColorInput from './CrimpCapColorInput';
import AutoSaveIndicator from '../common/AutoSaveIndicator';
import GlassmorphismDatePicker from '../common/GlassmorphismDatePicker';
import DocumentationUpload from '../common/DocumentationUpload';
import VialScannerModal from '../common/VialScannerModal';
import COAPrefillBanner from '../common/COAPrefillBanner';
import ConfirmationModal from '../ui/ConfirmationModal';
import { prepareItemForSave } from '../../utils/userDataSave';
import { generateId } from '../../utils/string';
import { isConvertibleUnit, convertForStorage } from '../../utils/unitConversion';
import { appendStockEvent } from '../../utils/stockHistory';
import { mergeCOAIntoForm } from '../../utils/coaParser';
import { TestTube, PackageOpen, ChevronDown, ChevronRight, ImageUp, Boxes, ScanLine } from 'lucide-react';
import {
  PURPOSE_ICON_OPTIONS,
  PURPOSE_ICON_WEIGHT,
  getPurposeIconComponent,
  inferPurposeIconFromCompound,
} from '../../utils/protocolPurposeIcons';

const EMPTY_STOCKPILE_FORM = {
  name: '', mg: '', quantity: '', vendor: '', vendorId: null, purity: '', capColor: '', batchNumber: '', date: '', cost: '', priceUnit: 'vial', documentation: [], mgUnit: 'mg', unit: 'vial', purposeIcon: null,
};

export default function AddToStockpileBottomSheet({ open, onClose, theme, onUpgrade, editItem = null, wishlistPrefill = null, onAddSupply = null, autoOpenScanner = false, zIndexClass }) {
  const { vendors, addVendor, setStockpile } = useAppContext();
  const { isReadOnly } = useSubscriptionAccess();
  const isEditing = !!editItem;
  const [form, setForm] = useState(() => ({ ...EMPTY_STOCKPILE_FORM }));
  const [isAmountFocused, setIsAmountFocused] = useState(false);
  const [isQuantityFocused, setIsQuantityFocused] = useState(false);
  const [isPriceFocused, setIsPriceFocused] = useState(false);
  const [isAmountUnitDropdownOpen, setIsAmountUnitDropdownOpen] = useState(false);
  const [isUnitDropdownOpen, setIsUnitDropdownOpen] = useState(false);
  const [isPriceUnitDropdownOpen, setIsPriceUnitDropdownOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [isSavingToStockpile, setIsSavingToStockpile] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [purposeIconMenuOpen, setPurposeIconMenuOpen] = useState(false);
  const [purposeMenuPlacement, setPurposeMenuPlacement] = useState(null);
  const [purposeIconFollowsName, setPurposeIconFollowsName] = useState(true);
  const [showVialScanner, setShowVialScanner] = useState(false);
  const [coaPrefill, setCoaPrefill] = useState(null);
  const [coaParsing, setCoaParsing] = useState(false);
  const purposeIconAnchorRef = useRef(null);
  const purposeMenuPortalRef = useRef(null);

  const { isSaving, lastSaved, clearSavedData, markAsSubmitted, updateFormData } = useAutoSave(
    'tpprover_stockpile_form_draft',
    form,
    setForm,
    2000,
    async () => {}
  );

  // When opened from Inventory "Scan Vial", launch the camera after the sheet mounts
  useEffect(() => {
    if (!open || !autoOpenScanner || editItem) return undefined;
    const timer = setTimeout(() => setShowVialScanner(true), 280);
    return () => clearTimeout(timer);
  }, [open, autoOpenScanner, editItem]);

  // Pre-fill: edit existing, wishlist acquire → new stockpile, or blank new entry
  useEffect(() => {
    if (!open) {
      setForm({ ...EMPTY_STOCKPILE_FORM });
      setCoaPrefill(null);
      setCoaParsing(false);
      setShowVialScanner(false);
      return;
    }
    if (editItem) {
      setPurposeIconFollowsName(!editItem.purposeIcon);
      setForm({
        name: editItem.name || '',
        mg: editItem.mg || '',
        quantity: editItem.quantity || '',
        vendor: editItem.vendor || '',
        vendorId: editItem.vendorId || null,
        purity: editItem.purity || '',
        capColor: editItem.capColor || '',
        batchNumber: editItem.batchNumber || '',
        date: editItem.date || '',
        cost: editItem.cost || editItem.price || '',
        priceUnit: editItem.priceUnit || 'vial',
        documentation: editItem.documentation || [],
        mgUnit: editItem.mgUnit || 'mg',
        unit: editItem.unit || 'vial',
        purposeIcon: editItem.purposeIcon || null,
      });
    } else if (wishlistPrefill) {
      clearSavedData();
      const vName = (wishlistPrefill.vendor || '').trim();
      const vHit = (vendors || []).find((v) => (v.name || '').trim().toLowerCase() === vName.toLowerCase());
      setForm({
        ...EMPTY_STOCKPILE_FORM,
        name: wishlistPrefill.name || '',
        mg: wishlistPrefill.mg || '',
        quantity: wishlistPrefill.quantity || '1',
        vendor: vName,
        vendorId: vHit ? vHit.id : null,
        cost: wishlistPrefill.cost || '',
        mgUnit: wishlistPrefill.mgUnit || 'mg',
        unit: wishlistPrefill.unit || 'vial',
      });
    } else {
      setForm({ ...EMPTY_STOCKPILE_FORM });
    }
  }, [open, editItem, wishlistPrefill, vendors, clearSavedData]);

  const getPrimaryActionGradient = (saving) => {
    const secondaryColor = theme?.secondary || '#d1d5db';
    if (saving) return `linear-gradient(135deg, ${secondaryColor} 0%, ${secondaryColor} 100%)`;
    return `linear-gradient(135deg, ${theme?.primary} 0%, ${theme?.primaryDark || theme?.primary} 100%)`;
  };
  const primaryActionDefaultShadow = theme?.isDark ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.1)';

  const handleClose = () => {
    setShowAdvanced(false);
    const hasData = form && (form.name || form.mg || form.vendor || form.quantity);
    if (hasData && !isSavingToStockpile) {
      setShowCloseConfirmation(true);
      return;
    }
    clearSavedData();
    onClose();
  };

  const handleConfirmClose = () => {
    clearSavedData();
    setShowCloseConfirmation(false);
    setShowAdvanced(false);
    onClose();
  };

  useEffect(() => {
    if (!isAmountUnitDropdownOpen && !isUnitDropdownOpen && !isPriceUnitDropdownOpen) return;
    const handleClickOutside = (event) => {
      const isClickInside = event.target.closest('[data-dropdown-container]');
      if (!isClickInside) {
        setIsAmountUnitDropdownOpen(false);
        setIsUnitDropdownOpen(false);
        setIsPriceUnitDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [isAmountUnitDropdownOpen, isUnitDropdownOpen, isPriceUnitDropdownOpen]);

  // Auto-detect purpose icon from compound name (debounced)
  useEffect(() => {
    if (!purposeIconFollowsName) return;
    const timer = setTimeout(() => {
      const inferred = inferPurposeIconFromCompound(form.name);
      setForm(prev => ({ ...prev, purposeIcon: inferred }));
    }, 280);
    return () => clearTimeout(timer);
  }, [form.name, purposeIconFollowsName]);

  // Icon menu positioning
  useLayoutEffect(() => {
    if (!purposeIconMenuOpen || !purposeIconAnchorRef.current) return;
    const anchor = purposeIconAnchorRef.current;
    const sync = () => {
      const r = anchor.getBoundingClientRect();
      setPurposeMenuPlacement({
        top: r.bottom + 6,
        right: Math.max(8, window.innerWidth - r.right),
        width: Math.min(260, Math.max(168, window.innerWidth - 16)),
      });
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [purposeIconMenuOpen]);

  // Close icon menu on outside click
  useEffect(() => {
    if (!purposeIconMenuOpen) return;
    const onDocMouseDown = (e) => {
      if (purposeIconAnchorRef.current?.contains(e.target)) return;
      if (purposeMenuPortalRef.current?.contains(e.target)) return;
      setPurposeIconMenuOpen(false);
      setPurposeMenuPlacement(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [purposeIconMenuOpen]);

  const togglePurposeIconMenu = () => {
    setPurposeIconMenuOpen(prev => !prev);
    if (purposeIconMenuOpen) setPurposeMenuPlacement(null);
  };

  return (
    <>
      <ConfirmationModal
        open={showCloseConfirmation}
        onClose={() => setShowCloseConfirmation(false)}
        onConfirm={handleConfirmClose}
        title="Unsaved Changes"
        message="You have unsaved changes. Are you sure you want to close without saving?"
        confirmText="Close Without Saving"
        cancelText="Cancel"
        type="warning"
        theme={theme}
      />
      <BottomSheet 
        open={open} 
        onClose={handleClose} 
        title={isEditing ? 'Complete Stockpile Entry' : 'Add to Stockpile'} 
        titleExtra={
          <div className="flex items-center gap-2">
            <AutoSaveIndicator 
              isSaving={isSaving || isSavingToStockpile}
              lastSaved={lastSaved}
              theme={theme}
              compact={true}
              iconOnly={true}
            />
            {(isSaving || isSavingToStockpile) && (
              <span className="text-xs opacity-75" style={{ color: theme.textOnPrimary }}>
                {isSavingToStockpile ? 'Saving...' : 'Auto-saving...'}
              </span>
            )}
          </div>
        }
        theme={theme}
        maxHeight="90vh"
        zIndexClass={zIndexClass}
        footer={(
        <div className="w-full flex items-center justify-end gap-3">
          <button 
            onClick={async () => { 
              try {
                setIsSavingToStockpile(true);
                setSaveError(null);
                
                if (isReadOnly) {
                  onUpgrade && onUpgrade();
                  return;
                }
                
                // Validate required fields
                if (!form.name || !form.name.trim()) {
                  setSaveError('Peptide name is required');
                  setIsSavingToStockpile(false);
                  return;
                }
                
                if (!form.mg || form.mg.trim() === '') {
                  setSaveError('Vial amount is required');
                  setIsSavingToStockpile(false);
                  return;
                }
                
                if (!form.quantity || form.quantity.trim() === '') {
                  setSaveError('Quantity is required');
                  setIsSavingToStockpile(false);
                  return;
                }
                
                // Auto-create new vendor if it doesn't exist
                if (form.vendor && !vendors.some(v => v.name.toLowerCase() === form.vendor.toLowerCase())) {
                    addVendor({ name: form.vendor, isStub: true });
                }

                const finalVendor = (vendors || []).find(v => v.name === form.vendor);

                if (isEditing) {
                  // UPDATE existing item — strip the "Added during protocol" note
                  let updatedItem = prepareItemForSave({
                    ...editItem,
                    ...form,
                    id: editItem.id,
                    vendorId: finalVendor ? finalVendor.id : (editItem.vendorId || null),
                    notes: (editItem.notes || '')
                      .replace('Added during protocol start', '')
                      .replace('Added during protocol edit', '')
                      .trim(),
                  }, { isNew: false });
                  if (isConvertibleUnit(updatedItem.unit)) {
                    const converted = convertForStorage(updatedItem.quantity, updatedItem.unit);
                    updatedItem.quantity = converted.quantity;
                    updatedItem.unit = converted.unit;
                  }
                  setStockpile(prev => prev.map(s => s.id === editItem.id ? updatedItem : s));
                } else {
                  let itemToAdd = prepareItemForSave({ 
                    ...form, 
                    id: generateId(), 
                    vendorId: finalVendor ? finalVendor.id : null
                  }, { isNew: true });
                  if (isConvertibleUnit(itemToAdd.unit)) {
                    const converted = convertForStorage(itemToAdd.quantity, itemToAdd.unit);
                    itemToAdd.quantity = converted.quantity;
                    itemToAdd.unit = converted.unit;
                  }
                  setStockpile(prev => [itemToAdd, ...prev]);
                }

                // Log event
                const savedName = form.name;
                appendStockEvent({
                  type: isEditing ? 'updated' : 'created',
                  name: savedName,
                  mg: form.mg,
                  vendor: form.vendor,
                  quantity: form.quantity,
                  unit: form.unit || 'vial',
                  source: 'manual'
                });

                markAsSubmitted(); // Clear auto-save data
                
                // Reset form first
                setForm({ ...EMPTY_STOCKPILE_FORM });
                
                // Reset advanced toggle for next entry
                setShowAdvanced(false);
                
                // Show success notification
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                  detail: { 
                    message: isEditing ? `✅ ${savedName} updated!` : `✅ ${savedName} added to stockpile!`, 
                    type: 'success' 
                  } 
                }));
                
                // Reset saving state immediately
                setIsSavingToStockpile(false);
                
                // Close modal - use requestAnimationFrame to ensure it happens after React state updates
                requestAnimationFrame(() => {
                  onClose();
                });
              } catch (error) {
                console.error('❌ Failed to save stockpile item:', error);
                setSaveError('Failed to save stockpile item. Please try again.');
                setIsSavingToStockpile(false);
              }
            }} 
            disabled={isSavingToStockpile || isReadOnly || !form.name?.trim() || !form.mg?.trim() || !form.quantity?.trim()}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:shadow-none disabled:opacity-75 whitespace-nowrap min-w-fit" 
            style={{ 
              background: getPrimaryActionGradient(isSavingToStockpile || isReadOnly),
              color: (isSavingToStockpile || isReadOnly) ? (theme?.text || '#111827') : (theme?.textOnPrimary || '#ffffff'),
              border: 'none',
              boxShadow: (isSavingToStockpile || isReadOnly) ? 'none' : primaryActionDefaultShadow
            }}
            onMouseEnter={(e) => {
              if (isSavingToStockpile || isReadOnly) return;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = theme.isDark ? '0 10px 25px rgba(0, 0, 0, 0.5)' : '0 10px 25px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = (isSavingToStockpile || isReadOnly) ? 'none' : primaryActionDefaultShadow;
              e.currentTarget.style.background = getPrimaryActionGradient(isSavingToStockpile || isReadOnly);
            }}
            title={isReadOnly ? "Upgrade to save stockpile items" : "Save stockpile changes"}
          >
            {isSavingToStockpile ? 'Saving…' : (isReadOnly ? 'Save Changes (Upgrade Required)' : 'Save Changes')}
          </button>
        </div>
      )}>
        <div className="space-y-2">
          {/* Switch to supply */}
          {!isEditing && onAddSupply && (
            <button
              type="button"
              onClick={() => { onClose(); setTimeout(onAddSupply, 200); }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all mb-1"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                border: `1px solid ${theme.border}`,
                color: theme.textLight,
              }}
            >
              <Boxes size={15} />
              Adding a supply item? Tap here →
            </button>
          )}

          {/* Error Display */}
          {saveError && (
            <div className="p-2 rounded-lg border" style={{ backgroundColor: theme.isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)', borderColor: theme.isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)' }}>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                <span className="text-sm font-medium" style={{ color: theme.isDark ? '#fca5a5' : '#991b1b' }}>{saveError}</span>
              </div>
            </div>
          )}
          
          {/* VIAL DETAILS Section Header */}
          <div className="flex items-center gap-2 mb-1">
            <TestTube size={28} style={{ color: theme.primary }} />
            <div className="flex flex-col gap-0.5">
              <h4 className="text-base font-semibold tracking-wide" style={{ color: theme.text }}>Details</h4>
              <div className="flex items-center gap-2 ml-1">
                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                <span className="text-[10px] font-medium uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                  Vial Amount & Quantity
                </span>
              </div>
            </div>
          </div>

          {/* Main form */}
          <div className="space-y-2">
            <TextInput 
              label="Peptide Name" 
              value={form.name}
              onChange={v => updateFormData({ name: v })} 
              placeholder="e.g., BPC-157, Lipo-C" 
              theme={theme}
              customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
              outlined={true}
              customTextColor={theme.isDark ? null : "#181A18"}
              autoComplete="off"
              prefix={(
                <div ref={purposeIconAnchorRef}>
                  <button
                    type="button"
                    onClick={togglePurposeIconMenu}
                    className="flex items-center justify-center rounded-lg w-9 h-9 p-0 border-0 cursor-pointer outline-none transition-transform touch-manipulation active:scale-[0.94]"
                    style={{
                      backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}12`,
                      color: theme.primary,
                    }}
                    aria-expanded={purposeIconMenuOpen}
                    aria-haspopup="listbox"
                    title={form.purposeIcon ? `Category: tap to change` : 'Tap to set category icon'}
                    aria-label="Purpose icon menu"
                  >
                    <IconContext.Provider value={{ weight: 'duotone' }}>
                      {(() => {
                        const TriggerIcon = getPurposeIconComponent(form.purposeIcon);
                        return <TriggerIcon size={20} weight={PURPOSE_ICON_WEIGHT} style={{ color: theme.primary }} aria-hidden />;
                      })()}
                    </IconContext.Provider>
                  </button>
                </div>
              )}
              suffix={(
                <button
                  type="button"
                  onClick={() => setShowVialScanner(true)}
                  className="flex items-center justify-center rounded-lg w-9 h-9 p-0 border-0 cursor-pointer outline-none transition-transform touch-manipulation active:scale-[0.94]"
                  style={{
                    backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}12`,
                    color: theme.primary,
                  }}
                  title="Scan vial label (read text)"
                  aria-label="Scan vial label and read text"
                >
                  <ScanLine size={18} aria-hidden />
                </button>
              )}
            />
            {/* Vial Amount & Quantity on same row */}
            <div className="grid grid-cols-2 gap-2">
              <div className="relative" data-dropdown-container>
                <div 
                  className="flex items-stretch rounded-lg"
                  style={{ 
                    border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : '#f0eee7'}`,
                    boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : (theme.inputBackground || '#fff')
                  }}
                >
                <input 
                  type="text"
                  id="amount-input"
                  name="stockpile-amount"
                  autoComplete="off"
                  value={form.mg || ''} 
                  onChange={e => updateFormData({ mg: e.target.value })} 
                  onFocus={() => setIsAmountFocused(true)}
                  onBlur={(e) => {
                    setTimeout(() => {
                      const relatedTarget = e.relatedTarget || document.activeElement
                      const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]')
                      if (!isClickingDropdown && !isAmountUnitDropdownOpen) {
                        setIsAmountFocused(false)
                      }
                    }, 150)
                  }}
                  placeholder=" "
                  className="flex-1 py-2 outline-none min-w-0 rounded-l-lg"
                  style={{
                    backgroundColor: 'transparent',
                    color: theme.isDark ? theme.text : '#181A18',
                    border: 'none',
                    paddingLeft: '12px',
                    paddingRight: '8px'
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsAmountUnitDropdownOpen(prev => !prev);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onTouchStart={(e) => e.preventDefault()}
                  className="flex items-center justify-between gap-1 px-2 py-2 flex-shrink-0 rounded-r-lg relative cursor-pointer transition-all border-none outline-none"
                  style={{ 
                    borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.12)' : `1px solid #f0eee7`,
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.cardBackground || '#f9fafb'),
                    color: theme.isDark ? theme.text : '#181A18',
                    minWidth: '48px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.12)' : '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.cardBackground || '#f9fafb');
                  }}
                >
                  <span className="text-sm font-semibold">
                    {(form.mgUnit || 'mg')}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                </div>
                {/* Dropdown panel: right-aligned, compact (mg/mL/g/IU) */}
                <div 
                  className="absolute right-0 top-full z-50 mt-1 rounded-lg shadow-lg border overflow-hidden transition-all duration-200"
                  data-dropdown-container
                  style={{
                    opacity: isAmountUnitDropdownOpen ? 1 : 0,
                    visibility: isAmountUnitDropdownOpen ? 'visible' : 'hidden',
                    pointerEvents: isAmountUnitDropdownOpen ? 'auto' : 'none',
                    backgroundColor: theme.isDark ? 'rgba(30,40,55,0.98)' : '#ffffff',
                    borderColor: theme.border,
                    minWidth: '52px',
                    boxShadow: theme.isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)'
                  }}
                >
                  {[
                    { value: 'mg', label: 'mg' },
                    { value: 'mL', label: 'mL' },
                    { value: 'g', label: 'g' },
                    { value: 'IU', label: 'IU' }
                  ].map((option, optIdx) => (
                    <React.Fragment key={option.value}>
                      {optIdx > 0 && (
                        <div 
                          className="h-px mx-1.5"
                          style={{ backgroundColor: theme.border }}
                        />
                      )}
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onTouchStart={(e) => e.preventDefault()}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          updateFormData({ mgUnit: option.value });
                          setIsAmountUnitDropdownOpen(false);
                        }}
                        className="w-full text-left px-2 py-1.5 text-sm transition-all touch-manipulation"
                        style={{
                          color: (form.mgUnit || 'mg') === option.value ? theme.primary : theme.text,
                          backgroundColor: 'transparent',
                          WebkitTapHighlightColor: 'transparent'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                          e.currentTarget.style.color = theme.primary;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                          e.currentTarget.style.color = (form.mgUnit || 'mg') === option.value ? theme.primary : theme.text;
                        }}
                      >
                        {option.label}
                      </button>
                    </React.Fragment>
                  ))}
                </div>
              <label 
                htmlFor="amount-input"
                className="absolute pointer-events-none transition-all"
                style={{
                  fontSize: (isAmountFocused || (form.mg && form.mg.trim())) ? '0.75rem' : '0.9375rem',
                  top: (isAmountFocused || (form.mg && form.mg.trim())) ? '-8px' : '14px',
                  left: (isAmountFocused || (form.mg && form.mg.trim())) ? '12px' : '16px',
                  padding: (isAmountFocused || (form.mg && form.mg.trim())) ? '0 4px' : '0',
                  background: (isAmountFocused || (form.mg && form.mg.trim())) ? (theme.isDark ? (theme.cardBackground || 'rgba(15,23,42,1)') : (theme.inputBackground || '#fff')) : 'transparent',
                  color: (isAmountFocused || (form.mg && form.mg.trim())) ? theme.primary : (theme.textLight || theme.text),
                  fontWeight: 500
                }}
              >
                Vial Amount
              </label>
            </div>
            <div className="relative" data-dropdown-container>
              <div 
                className="flex items-stretch rounded-lg"
                style={{ 
                  border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : '#f0eee7'}`,
                  boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : (theme.inputBackground || '#fff')
                }}
              >
                <input 
                  type="text"
                  id="quantity-input"
                  name="stockpile-quantity"
                  autoComplete="off"
                  value={form.quantity || ''} 
                  onChange={e => updateFormData({ quantity: e.target.value })} 
                  onFocus={() => setIsQuantityFocused(true)}
                  onBlur={(e) => {
                    setTimeout(() => {
                      const relatedTarget = e.relatedTarget || document.activeElement
                      const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]')
                      if (!isClickingDropdown && !isUnitDropdownOpen) {
                        setIsQuantityFocused(false)
                      }
                    }, 150)
                  }}
                  placeholder=" "
                  className="flex-1 px-3 py-2 outline-none min-w-0 rounded-l-lg"
                  style={{
                    backgroundColor: 'transparent',
                    color: theme.isDark ? theme.text : '#181A18',
                    border: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsUnitDropdownOpen(prev => !prev);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  onTouchStart={(e) => e.preventDefault()}
                  className="flex items-center justify-between gap-1 px-2 py-2 flex-shrink-0 rounded-r-lg relative cursor-pointer transition-all border-none outline-none"
                  style={{ 
                    borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.12)' : `1px solid #f0eee7`,
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.cardBackground || '#f9fafb'),
                    color: theme.isDark ? theme.text : '#181A18',
                    minWidth: '56px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.12)' : '#f3f4f6';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.cardBackground || '#f9fafb');
                  }}
                >
                  <span className="text-sm font-semibold truncate max-w-[3.5rem]">
                    {(() => {
                      const unit = (form.unit || 'vial').toLowerCase();
                      const quantity = Number(form.quantity) || 1;
                      if (unit === 'vial') {
                        return quantity === 1 ? 'Vial' : 'Vials';
                      } else if (unit === 'kit') {
                        return quantity === 1 ? 'Kit' : 'Kits';
                      } else if (unit === 'bottle') {
                        return quantity === 1 ? 'Bottle' : 'Bottles';
                      } else if (unit === 'tablets') {
                        return 'Tablets';
                      }
                      return unit.charAt(0).toUpperCase() + unit.slice(1);
                    })()}
                  </span>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
              {/* Dropdown panel: right-aligned, compact */}
              <div 
                className="absolute right-0 top-full z-50 mt-1 rounded-lg shadow-lg border overflow-hidden transition-all duration-200"
                data-dropdown-container
                style={{
                  opacity: isUnitDropdownOpen ? 1 : 0,
                  visibility: isUnitDropdownOpen ? 'visible' : 'hidden',
                  pointerEvents: isUnitDropdownOpen ? 'auto' : 'none',
                  backgroundColor: theme.isDark ? 'rgba(30,40,55,0.98)' : '#ffffff',
                  borderColor: theme.border,
                  minWidth: '72px',
                  boxShadow: theme.isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)'
                }}
              >
                {[
                  { value: 'vial', label: 'Vial' },
                  { value: 'kit', label: 'Kit' },
                  { value: 'bottle', label: 'Bottle' },
                  { value: 'tablets', label: 'Tablets' }
                ].map((option, optIdx) => (
                  <React.Fragment key={option.value}>
                    {optIdx > 0 && (
                      <div 
                        className="h-px mx-1.5"
                        style={{ backgroundColor: theme.border }}
                      />
                    )}
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onTouchStart={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        updateFormData({ unit: option.value });
                        setIsUnitDropdownOpen(false);
                      }}
                      className="w-full text-left px-2 py-1.5 text-sm transition-all touch-manipulation"
                      style={{
                        color: (form.unit || 'vial') === option.value ? theme.primary : theme.text,
                        backgroundColor: 'transparent',
                        WebkitTapHighlightColor: 'transparent'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                        e.currentTarget.style.color = theme.primary;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                        e.currentTarget.style.color = (form.unit || 'vial') === option.value ? theme.primary : theme.text;
                      }}
                    >
                      {option.label}
                    </button>
                  </React.Fragment>
                ))}
              </div>
              <label
                htmlFor="quantity-input"
                className="absolute pointer-events-none transition-all"
                style={{
                  fontSize: (isQuantityFocused || (form.quantity && form.quantity.trim())) ? '0.75rem' : '0.9375rem',
                  top: (isQuantityFocused || (form.quantity && form.quantity.trim())) ? '-8px' : '14px',
                  left: (isQuantityFocused || (form.quantity && form.quantity.trim())) ? '12px' : '16px',
                  padding: (isQuantityFocused || (form.quantity && form.quantity.trim())) ? '0 4px' : '0',
                  background: (isQuantityFocused || (form.quantity && form.quantity.trim())) ? (theme.isDark ? (theme.cardBackground || 'rgba(15,23,42,1)') : (theme.inputBackground || '#fff')) : 'transparent',
                  color: (isQuantityFocused || (form.quantity && form.quantity.trim())) ? theme.primary : (theme.textLight || theme.text),
                  fontWeight: 500
                }}
              >
                Quantity
              </label>
            </div>
            </div>
          </div>
          
          {/* ORDER DETAILS Section Header */}
          <div className="flex items-center gap-2 mb-1">
            <PackageOpen size={28} style={{ color: theme.primary }} />
            <div className="flex flex-col gap-0.5">
              <h4 className="text-base font-semibold tracking-wide" style={{ color: theme.text }}>Order Details</h4>
              <div className="flex items-center gap-2 ml-1">
                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                <span className="text-[10px] font-medium uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                  Purchase Information
                </span>
              </div>
            </div>
          </div>
          
          <VendorSuggestInput label="Vendor" value={form.vendor} onChange={v => updateFormData({ vendor: v })} placeholder="e.g., Pharm..." theme={theme} autoComplete="off" />
          
          {/* Cost per - under Order Details */}
          <div className="relative" data-dropdown-container>
            <div 
              className="flex items-stretch rounded-lg"
              style={{ 
                border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : '#f0eee7'}`,
                boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : (theme.inputBackground || '#fff')
              }}
            >
              <input 
                type="text"
                id="price-input"
                name="stockpile-cost"
                autoComplete="off"
                value={form.cost || ''} 
                onChange={e => updateFormData({ cost: e.target.value })} 
                onFocus={() => setIsPriceFocused(true)}
                onBlur={(e) => {
                  setTimeout(() => {
                    const relatedTarget = e.relatedTarget || document.activeElement
                    const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]')
                    if (!isClickingDropdown && !isPriceUnitDropdownOpen) {
                      setIsPriceFocused(false)
                    }
                  }, 150)
                }}
                placeholder=" "
                className="flex-1 py-2 outline-none min-w-0 rounded-l-lg"
                style={{
                  backgroundColor: 'transparent',
                  color: theme.isDark ? theme.text : '#181A18',
                  border: 'none',
                  paddingLeft: '12px',
                  paddingRight: '8px'
                }}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsPriceUnitDropdownOpen(prev => !prev);
                }}
                onMouseDown={(e) => e.preventDefault()}
                onTouchStart={(e) => e.preventDefault()}
                className="flex items-center justify-between gap-2 px-3 py-3 flex-shrink-0 rounded-r-lg relative cursor-pointer transition-all border-none outline-none"
                style={{ 
                  borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.12)' : `1px solid #f0eee7`,
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.cardBackground || '#f9fafb'),
                  color: theme.isDark ? theme.text : '#181A18',
                  minWidth: '72px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.12)' : '#f3f4f6';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.cardBackground || '#f9fafb');
                }}
              >
                <span className="text-sm font-semibold">
                  {(() => {
                    const unit = (form.priceUnit || 'vial').toLowerCase();
                    if (unit === 'vial') return 'Vial';
                    if (unit === 'mg') return 'mg';
                    if (unit === 'g') return 'g';
                    if (unit === 'iu' || unit === 'IU') return 'IU';
                    if (unit === 'tablet') return 'Tablet';
                    return unit.charAt(0).toUpperCase() + unit.slice(1);
                  })()}
                </span>
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
            {/* Dropdown panel: right-aligned, compact width */}
            <div 
              className="absolute right-0 top-full z-50 mt-1 rounded-lg shadow-lg border overflow-hidden transition-all duration-200"
              data-dropdown-container
              style={{
                opacity: isPriceUnitDropdownOpen ? 1 : 0,
                visibility: isPriceUnitDropdownOpen ? 'visible' : 'hidden',
                pointerEvents: isPriceUnitDropdownOpen ? 'auto' : 'none',
                backgroundColor: theme.isDark ? 'rgba(30,40,55,0.98)' : '#ffffff',
                borderColor: theme.border,
                minWidth: '88px',
                boxShadow: theme.isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)'
              }}
            >
              {[
                { value: 'vial', label: 'Vial' },
                { value: 'bottle', label: 'Bottle' },
                { value: 'mg', label: 'mg' },
                { value: 'g', label: 'g' },
                { value: 'iu', label: 'IU' },
                { value: 'tablet', label: 'Tablet' }
              ].map((option, optIdx) => (
                <React.Fragment key={option.value}>
                  {optIdx > 0 && (
                    <div 
                      className="h-px mx-2"
                      style={{ backgroundColor: theme.border }}
                    />
                  )}
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onTouchStart={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      updateFormData({ priceUnit: option.value });
                      setIsPriceUnitDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-sm transition-all touch-manipulation"
                    style={{
                      color: (form.priceUnit || 'vial') === option.value ? theme.primary : theme.text,
                      backgroundColor: 'transparent',
                      WebkitTapHighlightColor: 'transparent'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                      e.currentTarget.style.color = theme.primary;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = (form.priceUnit || 'vial') === option.value ? theme.primary : theme.text;
                    }}
                  >
                    {option.label}
                  </button>
                </React.Fragment>
              ))}
            </div>
            <label 
              htmlFor="price-input"
              className="absolute pointer-events-none transition-all"
              style={{
                fontSize: (isPriceFocused || (form.cost && String(form.cost).trim())) ? '0.75rem' : '0.9375rem',
                top: (isPriceFocused || (form.cost && String(form.cost).trim())) ? '-8px' : '14px',
                left: (isPriceFocused || (form.cost && String(form.cost).trim())) ? '12px' : '16px',
                padding: (isPriceFocused || (form.cost && String(form.cost).trim())) ? '0 4px' : '0',
                background: (isPriceFocused || (form.cost && String(form.cost).trim())) ? (theme.isDark ? (theme.cardBackground || 'rgba(15,23,42,1)') : (theme.inputBackground || '#fff')) : 'transparent',
                color: (isPriceFocused || (form.cost && String(form.cost).trim())) ? theme.primary : (theme.textLight || theme.text),
                fontWeight: 500
              }}
            >
              Cost per ($)
            </label>
          </div>
          
          {/* Advanced Options Accordion - At the end, matching protocol modal style */}
          <div className="rounded-lg border transition-all" style={{ 
            borderColor: showAdvanced ? theme.primary + '40' : theme.border,
            backgroundColor: showAdvanced ? theme.cardBackground : (theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)')
          }}>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0 text-left">
                {showAdvanced ? (
                  <ChevronDown size={16} style={{ color: theme.textLight }} className="flex-shrink-0" />
                ) : (
                  <ChevronRight size={16} style={{ color: theme.textLight }} className="flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: theme.text }}>
                    Advanced Options
                  </div>
                  {!showAdvanced && (
                    <div className="text-xs mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: theme.textLight }}>
                      <span>Purity, Cap Color, Batch #, Date, Documentation</span>
                    </div>
                  )}
                </div>
              </div>
            </button>

            {/* Advanced Content - Collapsible */}
            <div 
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                maxHeight: showAdvanced ? '1000px' : '0',
                opacity: showAdvanced ? 1 : 0
              }}
            >
              <div className="px-3 pt-5 pb-3 border-t space-y-3" style={{ borderColor: theme.border }}>
                <CrimpCapColorInput
                  value={form.capColor || ''}
                  onChange={v => updateFormData({ capColor: v })}
                  theme={theme}
                  customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                  customTextColor={theme.isDark ? null : '#181A18'}
                />
                
                {/* Purity & Batch Number in two columns */}
                <div className="grid grid-cols-2 gap-2">
                  <TextInput 
                    label="Purity %" 
                    value={form.purity} 
                    onChange={v => updateFormData({ purity: v })} 
                    placeholder="e.g., 98 (default: 99%)" 
                    theme={theme} 
                    outlined={true} 
                    customTextColor={theme.isDark ? null : "#181A18"} 
                    customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    autoComplete="off"
                  />
                  <TextInput 
                    label="Batch #" 
                    value={form.batchNumber} 
                    onChange={v => updateFormData({ batchNumber: v })} 
                    placeholder="# XXX" 
                    theme={theme} 
                    uppercase={true} 
                    outlined={true} 
                    customTextColor={theme.isDark ? null : "#181A18"} 
                    customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    autoComplete="off"
                  />
                </div>
                
                {/* Date Acquired */}
                <GlassmorphismDatePicker
                  value={form.date}
                  onChange={(dateString) => updateFormData({ date: dateString })}
                  theme={theme}
                  placeholder="Date Acquired"
                />
                
                {/* EXTRA DETAILS Section Header */}
                <div className="flex items-center gap-2 mb-1">
                  <ImageUp size={28} style={{ color: theme.primary }} />
                  <div className="flex flex-col gap-0.5">
                    <h4 className="text-base font-semibold tracking-wide" style={{ color: theme.text }}>Extra Details</h4>
                    <div className="flex items-center gap-2 ml-1">
                      <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                      <span className="text-[10px] font-medium uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                        Documentation
                      </span>
                    </div>
                  </div>
                </div>
                
                {/* Documentation Upload */}
                <div className="mt-3">
                  <DocumentationUpload
                    documentation={form.documentation}
                    onChange={(documentation) => updateFormData({ documentation })}
                    theme={theme}
                    title=""
                    description="Upload images or links for received peptide documentation (photos of received vials, condition notes, quality check notes, etc.)"
                    placeholder="Add photos, screenshots, or files that correlate with this peptide."
                    allowImages={true}
                    allowLinks={true}
                    onCOADetected={(fields) => setCoaPrefill(fields)}
                    onCOAParsing={setCoaParsing}
                  />
                </div>
              </div>
            </div>
          </div>

          {(coaParsing || coaPrefill) && (
            <div className="pt-1">
              <COAPrefillBanner
                loading={coaParsing && !coaPrefill}
                fields={coaPrefill}
                theme={theme}
                onApply={() => {
                  if (!coaPrefill) return;
                  const merged = mergeCOAIntoForm(form, coaPrefill);
                  updateFormData(merged);
                  setCoaPrefill(null);
                  setShowAdvanced(true);
                  window.dispatchEvent(new CustomEvent('tpp:toast', {
                    detail: { message: '✅ COA fields applied', type: 'success' },
                  }));
                }}
                onDismiss={() => setCoaPrefill(null)}
              />
            </div>
          )}
      </div>
      </BottomSheet>
      <VialScannerModal
        open={showVialScanner}
        onClose={() => setShowVialScanner(false)}
        theme={theme}
        onScan={(fields) => {
          if (!fields) return;
          const patch = {};
          if (fields.name) patch.name = fields.name;
          if (fields.mg) patch.mg = fields.mg;
          if (fields.mgUnit) patch.mgUnit = fields.mgUnit;
          if (fields.batchNumber) patch.batchNumber = fields.batchNumber;
          if (fields.vendor) {
            patch.vendor = fields.vendor;
            const vHit = (vendors || []).find(
              (v) => (v.name || '').trim().toLowerCase() === String(fields.vendor).trim().toLowerCase()
            );
            if (vHit) patch.vendorId = vHit.id;
          }
          if (fields.purity) patch.purity = fields.purity;
          if (Object.keys(patch).length) {
            updateFormData(patch);
            if (patch.batchNumber || patch.purity) setShowAdvanced(true);
            window.dispatchEvent(new CustomEvent('tpp:toast', {
              detail: { message: '✅ Label text applied', type: 'success' },
            }));
          } else {
            window.dispatchEvent(new CustomEvent('tpp:toast', {
              detail: { message: 'Read text, but no fields could be mapped', type: 'info' },
            }));
          }
        }}
      />
      {purposeIconMenuOpen && purposeMenuPlacement && typeof document !== 'undefined' && createPortal(
        <IconContext.Provider value={{ weight: 'duotone' }}>
          <div
            ref={purposeMenuPortalRef}
            role="listbox"
            className="fixed overflow-y-auto rounded-2xl border shadow-2xl p-2"
            style={{
              top: purposeMenuPlacement.top,
              right: purposeMenuPlacement.right,
              width: purposeMenuPlacement.width,
              maxHeight: 'min(52vh, 340px)',
              zIndex: 10100,
              backgroundColor: theme.cardBackground,
              borderColor: theme.border,
              boxShadow: theme.isDark
                ? '0 20px 60px rgba(0,0,0,0.65)'
                : '0 20px 50px rgba(0,0,0,0.18)',
            }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest opacity-40 pb-1.5 px-1" style={{ color: theme.text }}>
              Category
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {PURPOSE_ICON_OPTIONS.map((opt) => {
                const OptionIcon = opt.Icon;
                const isSelected = form.purposeIcon === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    title={opt.label}
                    aria-label={opt.label}
                    className="flex items-center justify-center rounded-xl aspect-square border-0 cursor-pointer outline-none transition-transform touch-manipulation active:scale-[0.92]"
                    style={{
                      backgroundColor: isSelected ? `${opt.color}30` : `${opt.color}14`,
                      boxShadow: isSelected ? `0 0 0 2px ${opt.color}` : undefined,
                    }}
                    onClick={() => {
                      setPurposeIconFollowsName(false);
                      setForm(prev => ({ ...prev, purposeIcon: opt.id }));
                      setPurposeIconMenuOpen(false);
                      setPurposeMenuPlacement(null);
                    }}
                  >
                    <OptionIcon
                      size={26}
                      weight={PURPOSE_ICON_WEIGHT}
                      style={{ color: opt.color, flexShrink: 0 }}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </IconContext.Provider>,
        document.body,
      )}
    </>
  );
}
