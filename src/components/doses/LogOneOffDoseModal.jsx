import React, { useEffect, useMemo, useState } from 'react';
import BottomSheet from '../common/BottomSheet';
import TextInput from '../common/inputs/TextInput';
import CombinedDosageInput from '../common/inputs/CombinedDosageInput';
import GlassmorphismDatePicker from '../common/GlassmorphismDatePicker';
import InjectionSiteSelector from '../common/InjectionSiteSelector';
import ExpandableTooltip from '../ui/ExpandableTooltip';
import { Syringe, Loader2, Check, MapPin, X, AlertCircle } from 'lucide-react';
import { getLocalDateString } from '../../utils/date';
import { prepareItemForSave } from '../../utils/userDataSave';
import { useAppContext } from '../../context/AppContext';
import {
  buildAsNeededProtocolFromOneOff,
  findExistingAsNeededProtocol,
} from '../../utils/oneOffDoses';
import { recordInjectionSite } from '../../utils/injectionTracking';
import { isInjectionSiteTrackingEnabled } from '../../utils/injectionSiteSettings';

const DELIVERY_OPTIONS = [
  { id: 'pipette', label: 'Syringe' },
  { id: 'pen', label: 'Pen' },
  { id: 'nasal', label: 'Nasal' },
  { id: 'topical', label: 'Topical' },
];

function toTitleCase(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function getDefaultForm(dateKey, prefilledProtocol) {
  if (prefilledProtocol) {
    const pep = Array.isArray(prefilledProtocol.peptides) ? prefilledProtocol.peptides[0] : null;
    return {
      peptideName: pep?.name || prefilledProtocol.name || '',
      dose: { amount: pep?.dosage?.amount || '', unit: pep?.dosage?.unit || 'mg' },
      dateKey: dateKey || getLocalDateString(),
      timeSlot: (pep?.frequency?.time?.[0]) || 'AM',
      deliveryMethod: pep?.deliveryMethod || 'pipette',
      notes: '',
      injectionSite: '',
    };
  }
  return {
    peptideName: '',
    dose: { amount: '', unit: 'mg' },
    dateKey: dateKey || getLocalDateString(),
    timeSlot: 'AM',
    deliveryMethod: 'pipette',
    notes: '',
    injectionSite: '',
  };
}

const ONE_OFF_DOSE_TOOLTIP = `[Pipette] A one-off dose is a single shot you log without starting a protocol.
[CheckCircle] Use it for random or as-needed doses so you don't start/stop a schedule every day.
[Zap] After logging, you can optionally save it as an as-needed protocol for next time.`;

/**
 * Log a one-off dose (no protocol). After save, optionally promote to an as-needed protocol.
 * Pass `prefilledProtocol` to pre-populate the form from an existing as-needed protocol.
 */
export default function LogOneOffDoseModal({
  open,
  onClose,
  theme,
  defaultDateKey,
  prefilledProtocol,
}) {
  const {
    stockpile,
    oneOffDoses,
    setOneOffDoses,
    addProtocol,
    protocols,
  } = useAppContext();

  const [form, setForm] = useState(() => getDefaultForm(defaultDateKey, prefilledProtocol));
  const [isSaving, setIsSaving] = useState(false);
  const [step, setStep] = useState('form'); // form | promote | existing
  const [savedDose, setSavedDose] = useState(null);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [showSitePicker, setShowSitePicker] = useState(false);
  // Protocol that already exists for the logged peptide
  const [existingProtocol, setExistingProtocol] = useState(null);
  // BUG FIX #14: Prevent double-save from React Strict Mode or double-click
  const saveInProgressRef = React.useRef(false);

  useEffect(() => {
    if (!open) return;
    setForm(getDefaultForm(defaultDateKey || getLocalDateString(), prefilledProtocol));
    setStep('form');
    setSavedDose(null);
    setIsSaving(false);
    setShowNameSuggestions(false);
    setShowSitePicker(false);
    setExistingProtocol(null);
    // BUG FIX #14: Reset save guard when modal opens
    saveInProgressRef.current = false;
  }, [open, defaultDateKey, prefilledProtocol]);

  const nameSuggestions = useMemo(() => {
    const names = new Set();
    (stockpile || []).forEach((item) => {
      const n = (item?.name || item?.peptideName || '').trim();
      if (n) names.add(n);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [stockpile]);

  const filteredSuggestions = useMemo(() => {
    if (!showNameSuggestions) return [];
    const q = (form.peptideName || '').trim().toLowerCase();
    if (!q || q.length < 1) return [];
    // Hide exact matches so picking a name dismisses the list
    return nameSuggestions
      .filter((n) => {
        const lower = n.toLowerCase();
        return lower.includes(q) && lower !== q;
      })
      .slice(0, 6);
  }, [form.peptideName, nameSuggestions, showNameSuggestions]);

  const handleClose = () => {
    setStep('form');
    setSavedDose(null);
    onClose?.();
  };

  const handleSave = async () => {
    // BUG FIX #14: Prevent double-save (React Strict Mode, double-click, etc.)
    if (saveInProgressRef.current) {
      console.warn('⚠️ Save already in progress, ignoring duplicate call');
      return;
    }

    const name = (form.peptideName || '').trim();
    if (!name) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Enter a peptide name', type: 'error' } }));
      return;
    }
    if (!form.dose?.amount || String(form.dose.amount).trim() === '') {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Enter a dose', type: 'error' } }));
      return;
    }

    saveInProgressRef.current = true;
    setIsSaving(true);
    try {
      const entry = prepareItemForSave(
        {
          peptideName: name,
          dose: String(form.dose.amount).trim(),
          unit: form.dose.unit || 'mg',
          dateKey: form.dateKey || getLocalDateString(),
          timeSlot: form.timeSlot || 'AM',
          deliveryMethod: form.deliveryMethod || '',
          notes: (form.notes || '').trim(),
          injectionSite: (form.injectionSite || '').trim(),
          // Link directly to the protocol when launched from an as-needed protocol row
          protocolId: prefilledProtocol?.id || null,
          createdAt: new Date().toISOString(),
        },
        { isNew: true }
      );

      // BUG FIX #14: Only use prev parameter to prevent stale closure issues
      setOneOffDoses((prev) => {
        const currentList = Array.isArray(prev) ? prev : [];
        return [entry, ...currentList].slice(0, 2000);
      });

      if (
        isInjectionSiteTrackingEnabled() &&
        entry.injectionSite &&
        (entry.deliveryMethod === 'pipette' || entry.deliveryMethod === 'syringe' || entry.deliveryMethod === 'pen' || entry.deliveryMethod === 'injection')
      ) {
        try {
          const [y, m, d] = String(entry.dateKey).split('-').map(Number);
          const dateObj = new Date(y, (m || 1) - 1, d || 1);
          recordInjectionSite(
            {
              name: entry.peptideName,
              type: 'one_off',
              dose: entry.dose,
              unit: entry.unit,
              deliveryMethod: entry.deliveryMethod,
            },
            entry.injectionSite,
            dateObj,
            entry.timeSlot
          );
        } catch (e) {
          console.warn('One-off injection site record failed:', e);
        }
      }

      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'One-off dose logged', type: 'success' } }));
      setSavedDose(entry);

      // BUG FIX #13: Close modal immediately after success to prevent stuck state
      // Auto-promote to protocol in background if appropriate (optional future enhancement)
      handleClose();

      // Optional: Check if an as-needed protocol already exists for this peptide
      // (Could show a non-blocking toast suggesting to create a protocol instead)
      // const existing = findExistingAsNeededProtocol(protocols, name);
      // if (!prefilledProtocol && !existing) {
      //   // Future: Could show a subtle toast: "Want to save as protocol for next time?"
      // }
    } catch (error) {
      console.error('Failed to log one-off dose:', error);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Failed to log dose', type: 'error' } }));
    } finally {
      setIsSaving(false);
      saveInProgressRef.current = false;
    }
  };

  const handlePromoteYes = () => {
    if (!savedDose) {
      handleClose();
      return;
    }
    try {
      const protocol = buildAsNeededProtocolFromOneOff(savedDose);
      addProtocol(protocol);
      setOneOffDoses((prev) =>
        (Array.isArray(prev) ? prev : []).map((d) =>
          d && d.id === savedDose.id
            ? prepareItemForSave({ ...d, protocolId: protocol.id }, { isNew: false })
            : d
        )
      );
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: { message: 'As-needed protocol created', type: 'success' },
        })
      );
    } catch (error) {
      console.error('Failed to promote one-off to protocol:', error);
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: { message: 'Dose saved, but protocol create failed', type: 'error' },
        })
      );
    }
    handleClose();
  };

  const handlePromoteNo = () => {
    handleClose();
  };

  const showInjectionSite =
    isInjectionSiteTrackingEnabled() &&
    (form.deliveryMethod === 'pipette' ||
      form.deliveryMethod === 'syringe' ||
      form.deliveryMethod === 'pen' ||
      form.deliveryMethod === 'injection');

  // Already has an as-needed protocol — just acknowledge and close
  if (step === 'existing') {
    return (
      <BottomSheet
        open={open}
        onClose={handleClose}
        title="Dose logged"
        theme={theme}
        fitContent
        footer={
          <div className="w-full flex justify-end">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-3 rounded-full text-sm font-semibold flex items-center gap-2"
              style={{
                background: theme?.primaryDark || theme?.primary || '#445952',
                color: theme?.textOnPrimary || '#fff',
                border: 'none',
              }}
            >
              <Check size={16} />
              Got it
            </button>
          </div>
        }
      >
        <div className="px-0.5 py-1 space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle size={16} style={{ color: theme?.primary || '#445952', flexShrink: 0, marginTop: 2 }} />
            <p className="text-sm leading-snug" style={{ color: theme?.text }}>
              An as-needed protocol for <span className="font-semibold">{savedDose?.peptideName}</span> already exists.
            </p>
          </div>
          <p className="text-xs leading-snug pl-6" style={{ color: theme?.textLight }}>
            Your dose was logged. You can track future doses directly from the <span className="font-medium">As Needed</span> section in Today&apos;s Research.
          </p>
        </div>
      </BottomSheet>
    );
  }

  if (step === 'promote') {
    return (
      <BottomSheet
        open={open}
        onClose={handlePromoteNo}
        title="Save as protocol?"
        theme={theme}
        fitContent
        footer={
          <div className="w-full flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handlePromoteNo}
              className="px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ backgroundColor: 'transparent', color: theme?.text || '#111827', border: 'none' }}
            >
              No thanks
            </button>
            <button
              type="button"
              onClick={handlePromoteYes}
              className="px-6 py-3 rounded-full text-sm font-semibold flex items-center gap-2"
              style={{
                background: theme?.primaryDark || theme?.primary || '#445952',
                color: theme?.textOnPrimary || '#fff',
                border: 'none',
              }}
            >
              <Check size={16} />
              Yes, add protocol
            </button>
          </div>
        }
      >
        <div className="px-0.5 py-1 space-y-2">
          <p className="text-sm leading-snug" style={{ color: theme?.text }}>
            Add this as an as-needed protocol?
          </p>
          <p className="text-xs leading-snug" style={{ color: theme?.textLight }}>
            Keeps {savedDose?.peptideName || 'this peptide'} available without daily calendar spam.
          </p>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title="Log one-off dose"
      titleExtra={<ExpandableTooltip content={ONE_OFF_DOSE_TOOLTIP} theme={theme} position="left" />}
      theme={theme}
      maxHeight="90vh"
      fitContent
      footer={
        <div className="w-full flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
            style={{
              backgroundColor: 'transparent',
              color: theme?.text || '#111827',
              border: 'none',
              opacity: isSaving ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 rounded-full text-sm font-semibold flex items-center gap-2 disabled:opacity-75"
            style={{
              background: theme?.primaryDark || theme?.primary || '#445952',
              color: theme?.textOnPrimary || '#fff',
              border: 'none',
            }}
          >
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Syringe size={15} />}
            Log dose
          </button>
        </div>
      }
    >
      <div className="space-y-2 px-0.5 pb-1">
        {/* Peptide + Dose */}
        <div className="space-y-2">
          <div className="relative">
            <TextInput
              label="Peptide"
              value={form.peptideName}
              onChange={(v) => {
                setShowNameSuggestions(true);
                setForm((prev) => ({ ...prev, peptideName: v }));
              }}
              onFocus={() => {
                if ((form.peptideName || '').trim()) setShowNameSuggestions(true);
              }}
              theme={theme}
              placeholder="e.g. PT-141"
              outlined
              dense
              minimalOutline
            />
            {filteredSuggestions.length > 0 && (
              <div
                className="absolute left-0 right-0 z-20 mt-1 rounded-lg border overflow-hidden shadow-lg"
                style={{ borderColor: theme?.border, backgroundColor: theme?.cardBackground || theme?.secondary || '#fff' }}
              >
                {filteredSuggestions.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:opacity-80"
                    style={{ color: theme?.text }}
                    onClick={() => {
                      setShowNameSuggestions(false);
                      setForm((prev) => ({ ...prev, peptideName: name }));
                    }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <CombinedDosageInput
            value={form.dose}
            onChange={(dose) => setForm((prev) => ({ ...prev, dose }))}
            theme={theme}
            deliveryMethod={form.deliveryMethod}
            outlined
          />
        </div>

        {/* When + how — single compact card */}
        <div
          className="rounded-xl p-2.5 space-y-2"
          style={{
            backgroundColor: theme?.isDark ? 'rgba(255,255,255,0.04)' : `${theme?.primary || '#445952'}0a`,
            border: `1px solid ${theme?.isDark ? 'rgba(255,255,255,0.06)' : `${theme?.primary || '#445952'}14`}`,
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
            <div className="min-w-0">
              <label className="block text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: theme?.textLight }}>
                Date
              </label>
              <GlassmorphismDatePicker
                value={form.dateKey}
                onChange={(v) => setForm((prev) => ({ ...prev, dateKey: v }))}
                theme={theme}
                compact
                outlined
              />
            </div>
            <div className="flex-shrink-0">
              <label className="block text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: theme?.textLight }}>
                Time
              </label>
              <div
                className="inline-flex rounded-lg p-0.5 gap-0.5"
                style={{ backgroundColor: theme?.isDark ? '#1a2028' : 'rgba(255,255,255,0.85)' }}
              >
                {['AM', 'PM'].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, timeSlot: slot }))}
                    className="px-2.5 py-1.5 text-[11px] font-bold rounded-md"
                    style={{
                      backgroundColor: form.timeSlot === slot ? (theme?.primaryDark || theme?.primary || '#445952') : 'transparent',
                      color: form.timeSlot === slot ? '#fff' : theme?.textLight,
                    }}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: theme?.textLight }}>
              Delivery
            </label>
            <div
              className="grid grid-cols-4 gap-1 rounded-lg p-0.5"
              style={{ backgroundColor: theme?.isDark ? '#1a2028' : 'rgba(255,255,255,0.85)' }}
            >
              {DELIVERY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, deliveryMethod: opt.id }))}
                  className="py-1.5 text-[11px] font-semibold rounded-md truncate"
                  style={{
                    backgroundColor: form.deliveryMethod === opt.id ? (theme?.primaryDark || theme?.primary || '#445952') : 'transparent',
                    color: form.deliveryMethod === opt.id ? '#fff' : theme?.textLight,
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {showInjectionSite && (
            <div className="flex items-center gap-1.5 pt-0.5">
              <button
                type="button"
                onClick={() => setShowSitePicker(true)}
                className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-all"
                style={{
                  border: `1px solid ${form.injectionSite ? (theme?.primary || '#445952') : (theme?.border || '#ddd')}`,
                  backgroundColor: form.injectionSite
                    ? (theme?.isDark ? `${theme.primary}18` : `${theme.primary}12`)
                    : (theme?.isDark ? 'rgba(255,255,255,0.03)' : '#fff'),
                  color: form.injectionSite ? theme?.text : theme?.textLight,
                }}
              >
                <MapPin size={14} style={{ color: theme?.primary || '#445952', flexShrink: 0 }} />
                <span className="truncate font-medium">
                  {form.injectionSite ? toTitleCase(form.injectionSite) : 'Select injection site'}
                </span>
              </button>
              {form.injectionSite ? (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, injectionSite: '' }))}
                  className="p-1.5 rounded-md flex-shrink-0"
                  style={{ color: theme?.textLight, backgroundColor: theme?.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
                  aria-label="Clear injection site"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          )}
        </div>

        <TextInput
          label="Notes"
          value={form.notes}
          onChange={(v) => setForm((prev) => ({ ...prev, notes: v }))}
          theme={theme}
          placeholder="Optional note"
          outlined
          dense
          minimalOutline
          multiline
          rows={1}
        />
      </div>

      <InjectionSiteSelector
        taskName={form.peptideName?.trim() || 'One-off dose'}
        task={null}
        theme={theme}
        isVisible={showSitePicker}
        onConfirm={(site) => {
          setShowSitePicker(false);
          setForm((prev) => ({ ...prev, injectionSite: site || '' }));
        }}
        onCancel={() => setShowSitePicker(false)}
      />
    </BottomSheet>
  );
}
