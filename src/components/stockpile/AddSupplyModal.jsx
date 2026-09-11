import React, { useState, useEffect } from 'react';
import BottomSheet from '../common/BottomSheet';
import { ChevronLeft, ChevronRight, Check, Zap, Plus, Minus } from 'lucide-react';
import { generateId } from '../../utils/string';
import { SUPPLY_CATEGORY_CONFIG } from './SupplyCard';
import OwnerSelect from '../buddy/OwnerSelect';
import { OWNER_SELF } from '../../utils/buddies';
import { isSimpleMode, getLocalTrackingMode } from '../../utils/trackingMode';

// ─── Category list — keys drive wizard config, icon/color come from SUPPLY_CATEGORY_CONFIG ──

export const SUPPLY_CATEGORIES_LIST = [
  { key: 'syringe',          autoTrack: 'pipette', unit: 'each' },
  { key: 'pen_needle',       autoTrack: 'pen',     unit: 'each' },
  { key: 'bac_water',        autoTrack: 'recon',   unit: 'vial' },
  { key: 'sterile_water',    autoTrack: 'recon',   unit: 'vial' },
  { key: 'saline',           autoTrack: 'recon',   unit: 'vial' },
  { key: 'filter',           autoTrack: 'recon',   unit: 'each' },
  { key: 'sterile_vial',     autoTrack: null,      unit: 'each' },
  { key: 'alcohol_swab',     autoTrack: null,      unit: 'each' },
  { key: 'gloves',           autoTrack: null,      unit: 'each' },
  { key: 'sharps_container', autoTrack: null,      unit: 'each' },
  { key: 'nasal_spray',      autoTrack: null,      unit: 'each' },
  { key: 'custom',           autoTrack: null,      unit: 'each' },
];

// ─── Sub-field configuration per category ────────────────────────────────────

const CATEGORY_CONFIG = {
  syringe: {
    fields: [
      {
        key: 'volume',
        label: 'Volume',
        options: ['0.3mL', '0.5mL', '1mL', '3mL', '5mL', '10mL'],
        default: '1mL',
      },
      {
        key: 'gauge',
        label: 'Gauge',
        options: ['27G', '28G', '29G', '30G', '31G'],
        default: '29G',
      },
      {
        key: 'syringeType',
        label: 'Type',
        options: ['Fixed Needle (Insulin)', 'Luer Lock', 'Luer Slip'],
        optionValues: ['fixed', 'luerlock', 'luerslip'],
        default: 'fixed',
      },
    ],
    buildName: (f) => {
      const typeLabel =
        f.syringeType === 'luerlock' ? ' Luer Lock' :
        f.syringeType === 'luerslip' ? ' Luer Slip' :
        ' Insulin';
      return `${f.volume || '1mL'}${typeLabel} Syringe ${f.gauge || '29G'}`;
    },
  },
  pen_needle: {
    fields: [
      { key: 'length', label: 'Length',      options: ['4mm','5mm','6mm','8mm','12mm'], default: '4mm' },
      { key: 'gauge',  label: 'Gauge',       options: ['29G','30G','31G','32G'],         default: '32G' },
    ],
    buildName: (f) => `Pen Needle ${f.length || '4mm'} x ${f.gauge || '32G'}`,
  },
  bac_water: {
    fields: [
      { key: 'volume', label: 'Volume per vial', options: ['10mL','20mL','30mL'], default: '30mL' },
    ],
    buildName: (f) => `Bacteriostatic Water ${f.volume || '30mL'}`,
  },
  sterile_water: {
    fields: [
      { key: 'volume', label: 'Volume per vial', options: ['10mL','20mL','30mL'], default: '10mL' },
    ],
    buildName: (f) => `Sterile Water ${f.volume || '10mL'}`,
  },
  saline: {
    fields: [
      { key: 'volume', label: 'Volume', options: ['10mL','20mL','30mL','100mL'], default: '10mL' },
    ],
    buildName: (f) => `Sterile Saline 0.9% ${f.volume || '10mL'}`,
  },
  filter: {
    fields: [
      { key: 'poreSize',  label: 'Pore Size',  options: ['0.22μm','0.45μm'],         default: '0.22μm' },
      { key: 'membrane',  label: 'Membrane',   options: ['PES','PTFE','PVDF','MCE'],  default: 'PES' },
      { key: 'diameter',  label: 'Diameter',   options: ['4mm','13mm','25mm'],        default: '13mm' },
    ],
    buildName: (f) => `Syringe Filter ${f.poreSize || '0.22μm'} ${f.membrane || 'PES'} ${f.diameter || '13mm'}`,
  },
  sterile_vial: {
    fields: [
      { key: 'volume', label: 'Volume', options: ['2mL','5mL','10mL','20mL'], default: '10mL' },
    ],
    buildName: (f) => `Sterile Vial ${f.volume || '10mL'}`,
  },
  alcohol_swab: {
    fields: [
      { key: 'packCount', label: 'Pack Count', options: ['50','100','200'], default: '100' },
    ],
    buildName: (f) => `Alcohol Swabs ×${f.packCount || '100'}`,
  },
  gloves: {
    fields: [
      { key: 'size',     label: 'Size',      options: ['XS','S','M','L','XL'], default: 'M' },
      { key: 'boxCount', label: 'Box Count', options: ['50','100'],            default: '100' },
    ],
    buildName: (f) => `Nitrile Gloves ${f.size || 'M'} ×${f.boxCount || '100'}`,
  },
  sharps_container: {
    fields: [
      { key: 'containerSize', label: 'Size', options: ['1 quart','1 gallon','2 gallon'], default: '1 quart' },
    ],
    buildName: (f) => `Sharps Container ${f.containerSize || '1 quart'}`,
  },
  nasal_spray: {
    fields: [
      { key: 'volume', label: 'Volume', options: ['1mL','2mL','5mL','10mL'], default: '5mL' },
    ],
    buildName: (f) => `Nasal Spray Bottle ${f.volume || '5mL'}`,
  },
  custom: {
    fields: [],
    buildName: (f) => f.customName || '',
  },
};

const AUTO_TRACK_OPTIONS = [
  {
    value: null,
    label: 'None — manual only',
    desc: 'Update quantity yourself when you use supplies.',
  },
  {
    value: 'pipette',
    label: 'Syringe dose logged',
    desc: 'Deduct 1 when any syringe-delivery dose is checked off.',
  },
  {
    value: 'pen',
    label: 'Pen dose logged',
    desc: 'Deduct 1 when any pen-delivery dose is checked off.',
  },
  {
    value: 'recon',
    label: 'Reconstitution saved',
    desc: 'Deduct 1 each time a reconstitution is saved.',
  },
];

// ─── Helper: chip selector ────────────────────────────────────────────────────

function ChipSelector({ label, options, value, onChange, theme, optionValues }) {
  return (
    <div>
      <p
        className="text-xs font-semibold mb-2 uppercase tracking-wide"
        style={{ color: theme.textLight }}
      >
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt, i) => {
          const val = optionValues ? optionValues[i] : opt;
          const selected = value === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => onChange(val)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95"
              style={{
                backgroundColor: selected
                  ? theme.primary
                  : theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                color: selected ? (theme.textOnPrimary || '#fff') : theme.text,
                border: `1px solid ${selected ? 'transparent' : theme.border}`,
              }}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AddSupplyModal({ open, onClose, theme, onSave, editSupply = null, zIndexClass }) {
  const simpleMode = isSimpleMode(getLocalTrackingMode());
  const isEditing = !!editSupply;

  const [step, setStep] = useState(1);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [subFields, setSubFields] = useState({});
  const [customName, setCustomName] = useState('');
  const [brand, setBrand] = useState('');
  const [nameOverride, setNameOverride] = useState('');
  const [quantity, setQuantity] = useState('10');
  const [unit, setUnit] = useState('each');
  const [lowThreshold, setLowThreshold] = useState('5');
  const [autoTrackTrigger, setAutoTrackTrigger] = useState(null);
  const [notes, setNotes] = useState('');
  const [ownerId, setOwnerId] = useState(OWNER_SELF);

  // Reset / prefill on open
  useEffect(() => {
    if (!open) {
      setStep(1);
      setSelectedCategory(null);
      setSubFields({});
      setCustomName('');
      setBrand('');
      setNameOverride('');
      setQuantity('10');
      setUnit('each');
      setLowThreshold('5');
      setAutoTrackTrigger(null);
      setNotes('');
      setOwnerId(OWNER_SELF);
      return;
    }

    if (editSupply) {
      const cat = SUPPLY_CATEGORIES_LIST.find(c => c.key === editSupply.category)
        || SUPPLY_CATEGORIES_LIST[11]; // fallback custom
      setSelectedCategory(cat);

      // Reconstruct sub-fields from flat supply props
      const sf = {};
      ['volume','gauge','syringeType','length','poreSize','membrane','diameter',
       'packCount','size','boxCount','containerSize'].forEach(k => {
        if (editSupply[k] !== undefined) sf[k] = editSupply[k];
      });
      setSubFields(sf);

      setCustomName(editSupply.name || '');
      setBrand(editSupply.brand || '');
      setNameOverride(editSupply.name || '');
      setQuantity(String(editSupply.quantity ?? 0));
      setUnit(editSupply.unit || cat.unit || 'each');
      setLowThreshold(String(editSupply.lowThreshold ?? 5));
      setAutoTrackTrigger(editSupply.autoTrack?.trigger ?? null);
      setNotes(editSupply.notes || '');
      setOwnerId(editSupply.ownerId || OWNER_SELF);
      setStep(2); // skip category step when editing
    }
  }, [open, editSupply]);

  // Pick category and move to step 2
  const handleCategorySelect = (cat) => {
    setSelectedCategory(cat);

    // Initialise sub-field defaults for this category
    const config = CATEGORY_CONFIG[cat.key];
    const defaults = {};
    (config?.fields || []).forEach(f => {
      defaults[f.key] = f.optionValues
        ? f.optionValues[f.optionValues.indexOf(f.default) >= 0 ? f.optionValues.indexOf(f.default) : 0] || f.optionValues[0]
        : f.default || f.options[0];
    });
    setSubFields(defaults);
    setUnit(cat.unit || 'each');
    setAutoTrackTrigger(null); // always default to manual
    setStep(2);
  };

  const getAutoName = () => {
    if (!selectedCategory) return '';
    const config = CATEGORY_CONFIG[selectedCategory.key];
    if (!config) return '';
    if (selectedCategory.key === 'custom') return customName;
    return config.buildName({ ...subFields });
  };

  const displayName = nameOverride || getAutoName();

  const handleSave = () => {
    const supplyItem = {
      id: editSupply?.id || generateId(),
      type: 'supply',
      category: selectedCategory.key,
      name: displayName || selectedCategory.label,
      quantity: Math.max(0, Number(quantity) || 0),
      unit,
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      lowThreshold: Math.max(0, Number(lowThreshold) || 0),
      autoTrack: autoTrackTrigger ? { trigger: autoTrackTrigger } : null,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      date: editSupply?.date || new Date().toISOString().split('T')[0],
      ownerId: ownerId || OWNER_SELF,
      ...subFields,
    };
    onSave(supplyItem);
    onClose();
  };

  const canProceed =
    step === 1 ? !!selectedCategory :
    step === 2 ? (selectedCategory?.key !== 'custom' || customName.trim()) :
    Number(quantity) >= 0;

  const selectedCatCfg = selectedCategory
    ? (SUPPLY_CATEGORY_CONFIG[selectedCategory.key] || SUPPLY_CATEGORY_CONFIG.custom)
    : null;

  const stepTitle = isEditing
    ? 'Edit Supply'
    : step === 1 ? 'Choose Supply Type'
    : step === 2 ? `Configure ${selectedCatCfg?.label || 'Supply'}`
    : 'Quantity & Tracking';

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={stepTitle}
      theme={theme}
      maxHeight="90vh"
      fitContent
      zIndexClass={zIndexClass}
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          {/* Back button */}
          {step > (isEditing ? 2 : 1) ? (
            <button
              onClick={() => setStep(s => s - 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all"
              style={{
                color: theme.textLight,
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              }}
            >
              <ChevronLeft size={16} />
              Back
            </button>
          ) : (
            <div />
          )}

          {/* Next / Save */}
          {step < 3 ? (
            <button
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark || theme.primary})`,
                color: theme.textOnPrimary || '#fff',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -2px 3px rgba(0,0,0,0.18)',
              }}
            >
              Next
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={!canProceed}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark || theme.primary})`,
                color: theme.textOnPrimary || '#fff',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.18), inset 0 -2px 3px rgba(0,0,0,0.18)',
              }}
            >
              <Check size={16} />
              {isEditing ? 'Save Changes' : 'Add Supply'}
            </button>
          )}
        </div>
      }
    >
      {/* Step progress dots */}
      {!isEditing && (
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3].map(s => (
            <div
              key={s}
              className="h-2 rounded-full transition-all duration-300"
              style={{
                width: s === step ? '24px' : '8px',
                backgroundColor: s <= step
                  ? theme.primary
                  : theme.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)',
              }}
            />
          ))}
        </div>
      )}

      {/* ── Step 1: Category grid ──────────────────────────────────── */}
      {step === 1 && (
        <div className="grid grid-cols-3 gap-3">
          {SUPPLY_CATEGORIES_LIST.map(cat => {
            const catCfg = SUPPLY_CATEGORY_CONFIG[cat.key] || SUPPLY_CATEGORY_CONFIG.custom;
            const { Icon, color: iconColor, label } = catCfg;
            const isSelected = selectedCategory?.key === cat.key;
            return (
              <button
                key={cat.key}
                type="button"
                onClick={() => handleCategorySelect(cat)}
                className="flex flex-col items-center gap-2.5 py-4 px-2 rounded-xl transition-all active:scale-95"
                style={{
                  backgroundColor: isSelected
                    ? `${iconColor}18`
                    : theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.025)',
                  border: `1px solid ${isSelected ? iconColor : theme.border}`,
                }}
              >
                <Icon
                  size={32}
                  weight={isSelected ? 'fill' : 'duotone'}
                  color={iconColor}
                />
                <span
                  className="text-[11px] font-medium text-center leading-tight"
                  style={{ color: isSelected ? iconColor : theme.text }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Step 2: Sub-field configuration ───────────────────────── */}
      {step === 2 && selectedCategory && (() => {
        const config = CATEGORY_CONFIG[selectedCategory.key];
        return (
          <div className="space-y-5">
            {/* Category-specific chip selectors */}
            {(config?.fields || []).map((field) => (
              <ChipSelector
                key={field.key}
                label={field.label}
                options={field.options}
                value={
                  subFields[field.key] !== undefined
                    ? subFields[field.key]
                    : (field.optionValues ? field.optionValues[0] : field.options[0])
                }
                onChange={val => setSubFields(prev => ({ ...prev, [field.key]: val }))}
                theme={theme}
                optionValues={field.optionValues}
              />
            ))}

            {/* Custom name input */}
            {selectedCategory.key === 'custom' && (
              <div>
                <p
                  className="text-xs font-semibold mb-2 uppercase tracking-wide"
                  style={{ color: theme.textLight }}
                >
                  Supply Name
                </p>
                <input
                  type="text"
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="e.g., Mixing Vial, IV Catheter..."
                  className="w-full px-4 py-3 rounded-xl border text-sm"
                  style={{
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                    borderColor: theme.border,
                    color: theme.text,
                    outline: 'none',
                  }}
                />
              </div>
            )}

            {/* Brand (optional) */}
            <div>
              <p
                className="text-xs font-semibold mb-2 uppercase tracking-wide"
                style={{ color: theme.textLight }}
              >
                Brand{' '}
                <span className="normal-case font-normal opacity-60">(optional)</span>
              </p>
              <input
                type="text"
                value={brand}
                onChange={e => setBrand(e.target.value)}
                placeholder="e.g., BD, Norm-Ject, Millex..."
                className="w-full px-4 py-3 rounded-xl border text-sm"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                  borderColor: theme.border,
                  color: theme.text,
                  outline: 'none',
                }}
              />
            </div>

            {/* Auto-generated name preview */}
            {selectedCategory.key !== 'custom' && (
              <div
                className="px-4 py-3 rounded-xl"
                style={{
                  backgroundColor: `${theme.primary}10`,
                  border: `1px solid ${theme.primary}25`,
                }}
              >
                <p
                  className="text-[10px] font-semibold uppercase tracking-wide mb-1"
                  style={{ color: theme.primary }}
                >
                  Name preview
                </p>
                <p className="text-sm font-medium" style={{ color: theme.text }}>
                  {getAutoName() || '—'}
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Step 3: Quantity & tracking ───────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          {/* Editable name */}
          <div>
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: theme.textLight }}
            >
              Supply Name
            </p>
            <input
              type="text"
              value={nameOverride !== '' ? nameOverride : getAutoName()}
              onChange={e => setNameOverride(e.target.value)}
              placeholder="Name..."
              className="w-full px-4 py-3 rounded-xl border text-sm"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                borderColor: theme.border,
                color: theme.text,
                outline: 'none',
              }}
            />
          </div>

          {/* Quantity stepper */}
          <div>
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: theme.textLight }}
            >
              Quantity on Hand
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity(q => String(Math.max(0, Number(q) - 1)))}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              >
                <Minus size={16} />
              </button>
              <input
                type="number"
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                min="0"
                className="flex-1 text-center text-2xl font-bold px-4 py-2.5 rounded-xl border"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                  borderColor: theme.border,
                  color: theme.primary,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => setQuantity(q => String(Number(q) + 1))}
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                }}
              >
                <Plus size={16} />
              </button>
              <span
                className="text-sm font-medium min-w-[40px]"
                style={{ color: theme.textLight }}
              >
                {unit}
              </span>
            </div>
          </div>

          {/* Low stock threshold */}
          <div>
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: theme.textLight }}
            >
              Low-stock alert when at or below
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={lowThreshold}
                onChange={e => setLowThreshold(e.target.value)}
                min="0"
                className="w-28 text-center px-4 py-3 rounded-xl border text-sm font-medium"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                  borderColor: theme.border,
                  color: theme.text,
                  outline: 'none',
                }}
              />
              <span className="text-sm" style={{ color: theme.textLight }}>
                {unit}
              </span>
            </div>
          </div>

          {/* Auto-track */}
          {!simpleMode && (
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              border: `1px solid ${autoTrackTrigger !== null ? '#818cf8' : theme.border}`,
              boxShadow: autoTrackTrigger !== null
                ? '0 0 0 3px rgba(129,140,248,0.12)'
                : 'none',
              transition: 'box-shadow 0.25s, border-color 0.25s',
            }}
          >
            {/* Section header banner */}
            <div
              className="flex items-center gap-2.5 px-4 py-3"
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(167,139,250,0.08))',
                borderBottom: `1px solid rgba(129,140,248,0.2)`,
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'rgba(99,102,241,0.2)' }}
              >
                <Zap size={14} style={{ color: '#818cf8' }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-none" style={{ color: '#818cf8' }}>
                  Smart Tracking
                </p>
                <p className="text-[11px] mt-0.5 leading-snug" style={{ color: theme.textLight }}>
                  Auto-deduct when doses or recons are logged
                </p>
              </div>
              {autoTrackTrigger !== null && (
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: 'rgba(99,102,241,0.2)', color: '#818cf8' }}
                >
                  ON
                </span>
              )}
            </div>

            {/* Options */}
            <div className="p-3 space-y-2">
              {/* Manual option first — default */}
              {(() => {
                const opt = AUTO_TRACK_OPTIONS[0]; // null / manual
                const selected = autoTrackTrigger === opt.value;
                return (
                  <button
                    key="manual"
                    type="button"
                    onClick={() => setAutoTrackTrigger(opt.value)}
                    className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border transition-all text-left"
                    style={{
                      backgroundColor: selected
                        ? theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)'
                        : 'transparent',
                      borderColor: selected ? theme.border : theme.border,
                      opacity: 1,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                      style={{
                        border: `2px solid ${selected ? theme.text : theme.textLight}`,
                        backgroundColor: selected ? theme.text : 'transparent',
                      }}
                    >
                      {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: theme.text }}>
                        {opt.label}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                        {opt.desc}
                      </p>
                    </div>
                  </button>
                );
              })()}

              {/* Divider + smart options — only shown if category supports auto-track */}
              {(() => {
                const catAutoTrack = selectedCategory?.autoTrack ?? null;
                const matchingOpts = AUTO_TRACK_OPTIONS.slice(1).filter(o => o.value === catAutoTrack);

                if (!catAutoTrack || matchingOpts.length === 0) {
                  return (
                    <p
                      className="text-[11px] text-center px-3 pb-1"
                      style={{ color: theme.textLight, opacity: 0.6 }}
                    >
                      No smart option available for this supply type.
                    </p>
                  );
                }

                return (
                  <>
                    <div className="flex items-center gap-2 px-1">
                      <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(129,140,248,0.2)' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#818cf8' }}>
                        Smart option
                      </span>
                      <div className="flex-1 h-px" style={{ backgroundColor: 'rgba(129,140,248,0.2)' }} />
                    </div>

                    {matchingOpts.map(opt => {
                      const selected = autoTrackTrigger === opt.value;
                      return (
                        <button
                          key={String(opt.value)}
                          type="button"
                          onClick={() => setAutoTrackTrigger(opt.value)}
                          className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border transition-all text-left"
                          style={{
                            backgroundColor: selected
                              ? 'rgba(99,102,241,0.1)'
                              : theme.isDark ? 'rgba(129,140,248,0.04)' : 'rgba(99,102,241,0.03)',
                            borderColor: selected ? '#818cf8' : 'rgba(129,140,248,0.2)',
                          }}
                        >
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                            style={{
                              border: `2px solid ${selected ? '#818cf8' : 'rgba(129,140,248,0.5)'}`,
                              backgroundColor: selected ? '#818cf8' : 'transparent',
                            }}
                          >
                            {selected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium" style={{ color: selected ? '#818cf8' : theme.text }}>
                              {opt.label}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                              {opt.desc}
                            </p>
                          </div>
                          {selected && (
                            <Zap size={13} className="flex-shrink-0 mt-0.5" style={{ color: '#818cf8' }} />
                          )}
                        </button>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </div>
          )}

          {/* Who is this for? — only shows when a buddy is configured */}
          {!simpleMode && (
          <OwnerSelect
            value={ownerId}
            onChange={setOwnerId}
            theme={theme}
            label="Who is this for?"
          />
          )}

          {/* Notes */}
          {!simpleMode && (
          <div>
            <p
              className="text-xs font-semibold mb-2 uppercase tracking-wide"
              style={{ color: theme.textLight }}
            >
              Notes{' '}
              <span className="normal-case font-normal opacity-60">(optional)</span>
            </p>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Storage notes, reorder link, preferred brand..."
              rows={2}
              className="w-full px-4 py-3 rounded-xl border text-sm resize-none"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : '#fff',
                borderColor: theme.border,
                color: theme.text,
                outline: 'none',
              }}
            />
          </div>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
