import React, { useEffect, useMemo, useState } from 'react';
import BottomSheet from '../common/BottomSheet';
import TextInput from '../common/inputs/TextInput';
import CombinedDosageInput from '../common/inputs/CombinedDosageInput';
import GlassmorphismDatePicker from '../common/GlassmorphismDatePicker';
import InjectionSiteSelector from '../common/InjectionSiteSelector';
import ExpandableTooltip from '../ui/ExpandableTooltip';
import { Loader2, Check, AlertCircle } from 'lucide-react';
import { Syringe, Pen, SprayBottle, Hand } from '@phosphor-icons/react';
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
  { id: 'pipette', label: 'Syringe', Icon: Syringe },
  { id: 'pen', label: 'Pen', Icon: Pen },
  { id: 'nasal', label: 'Nasal', Icon: SprayBottle },
  { id: 'topical', label: 'Topical', Icon: Hand },
];

function isInjectionDelivery(method) {
  return method === 'pipette' || method === 'syringe' || method === 'pen' || method === 'injection';
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

const ONE_OFF_DOSE_TOOLTIP = {
  title: 'About One-Off Dose',
  body: `[Pipette] A one-off dose is a single shot you log without starting a protocol.
[CheckCircle] Use it for random or as-needed doses so you don't start/stop a schedule every day.
[Zap] After logging, you can optionally save it as an as-needed protocol for next time.`,
};

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

  useEffect(() => {
    if (!open) return;
    setForm(getDefaultForm(defaultDateKey || getLocalDateString(), prefilledProtocol));
    setStep('form');
    setSavedDose(null);
    setIsSaving(false);
    setShowNameSuggestions(false);
    setShowSitePicker(false);
    setExistingProtocol(null);
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
    const name = (form.peptideName || '').trim();
    if (!name) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Enter a peptide name', type: 'error' } }));
      return;
    }
    if (!form.dose?.amount || String(form.dose.amount).trim() === '') {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Enter a dose', type: 'error' } }));
      return;
    }

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

      setOneOffDoses((prev) => [entry, ...(Array.isArray(prev) ? prev : oneOffDoses || [])].slice(0, 2000));

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

      // If pre-filled from an existing protocol, skip promote entirely
      if (prefilledProtocol) {
        handleClose();
        return;
      }

      // Check if an as-needed protocol already exists for this peptide
      const existing = findExistingAsNeededProtocol(protocols, name);
      if (existing) {
        setExistingProtocol(existing);
        setStep('existing');
      } else {
        setStep('promote');
      }
    } catch (error) {
      console.error('Failed to log one-off dose:', error);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Failed to log dose', type: 'error' } }));
    } finally {
      setIsSaving(false);
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

  const handleDeliverySelect = (id) => {
    setForm((prev) => ({
      ...prev,
      deliveryMethod: id,
      injectionSite: isInjectionDelivery(id) ? prev.injectionSite : '',
    }));
    if (isInjectionSiteTrackingEnabled() && isInjectionDelivery(id)) {
      setShowSitePicker(true);
    }
  };

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
        <div className="w-full flex items-center justify-end">
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
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : null}
            Log dose
          </button>
        </div>
      }
    >
      <div className="space-y-2 px-0.5 pb-1">
        {/* Peptide + Dose — one row */}
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-2 items-start">
          <div className="relative min-w-0">
            <TextInput
              label="Peptide Name"
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

          <div className="min-w-0">
            <CombinedDosageInput
              value={form.dose}
              onChange={(dose) => setForm((prev) => ({ ...prev, dose }))}
              theme={theme}
              deliveryMethod={form.deliveryMethod}
              outlined
            />
          </div>
        </div>

        {/* When + how */}
        <div
          className="rounded-xl p-3.5 space-y-2.5"
          style={{
            backgroundColor: theme?.isDark ? 'rgba(255,255,255,0.04)' : `${theme?.primary || '#445952'}0a`,
            border: `1px solid ${theme?.isDark ? 'rgba(255,255,255,0.06)' : `${theme?.primary || '#445952'}14`}`,
          }}
        >
          <div className="grid grid-cols-2 gap-2.5 items-end">
            <div className="min-w-0">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: theme?.textLight }}>
                Date
              </label>
              <GlassmorphismDatePicker
                value={form.dateKey}
                onChange={(v) => setForm((prev) => ({ ...prev, dateKey: v }))}
                theme={theme}
                outlined
              />
            </div>
            <div className="min-w-0">
              <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: theme?.textLight }}>
                Time
              </label>
              <div
                className="flex w-full rounded-lg p-1 gap-0.5"
                style={{ backgroundColor: theme?.isDark ? '#1a2028' : 'rgba(255,255,255,0.85)' }}
              >
                {['AM', 'PM'].map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, timeSlot: slot }))}
                    className="flex-1 px-3 py-2 text-xs font-bold rounded-md"
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
            <label className="block text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: theme?.textLight }}>
              Delivery
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {DELIVERY_OPTIONS.map(({ id, label, Icon }) => {
                const selected = form.deliveryMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => handleDeliverySelect(id)}
                    className="flex flex-col items-center justify-center gap-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
                    style={{
                      backgroundColor: selected
                        ? (theme?.primaryDark || theme?.primary || '#445952')
                        : (theme?.isDark ? '#1f2937' : '#f5f4f0'),
                      color: selected ? '#fff' : theme?.text,
                      border: selected
                        ? `1px solid ${theme?.primaryDark || '#3B4240'}`
                        : `1px solid ${theme?.border || '#e5e7eb'}`,
                      boxShadow: selected
                        ? 'inset 0 2px 4px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.1)'
                        : 'inset 0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <Icon size={18} weight="duotone" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
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
