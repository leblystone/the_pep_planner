import React, { useState, useEffect, useCallback, useRef } from 'react'
import BottomSheet from '../common/BottomSheet'
import { ReconCalculatorPanel } from './ReconCalculatorPanel'
import ShareVialCardModal from './ShareVialCardModal'
import { useAppContext } from '../../context/AppContext'
import { useSubscriptionAccess } from '../../utils/useSubscriptionAccess'
import { appendStockEvent } from '../../utils/stockHistory'
import { prepareItemForSave } from '../../utils/userDataSave'
import useAutoSave from '../../utils/useAutoSave'
import AutoSaveIndicator from '../common/AutoSaveIndicator'
import { FilePlus, Info, Share2, Bookmark } from 'lucide-react'
import { penColors } from '../../utils/penColors'

export default function ReconCalculatorModal({ open, onClose, theme, prefill }) {
  const { setReconItems, setStockpile } = useAppContext();
  const { isReadOnly } = useSubscriptionAccess();
  const hasLoadedRef = useRef(false);
  const [form, setForm] = useState({
    peptides: [{ id: 1, name: '', mg: '', mgUnit: 'mg', dose: '', doseUnit: 'mcg' }],
    vendor: '',
    vendorId: null,
    water: '',
    deliveryMethod: 'pipette',
    administrationRoute: 'subq',
    penType: '',
    penColor: '',
    cost: ''
  });
  
  // Auto-save functionality - only saves to localStorage, not to recon items
  // Drafts are saved to recon items only when modal closes
  const { isSaving, lastSaved, clearSavedData, markAsSubmitted } = useAutoSave(
    `recon_form_new`,
    form,
    setForm,
    2000, // 2 second delay
    null // No callback - we'll save drafts manually when closing
  );
  
  // State for save operations
  const [isSavingToRecon, setIsSavingToRecon] = useState(false);
  const [saveError, setSaveError] = useState(null);
  // Calculated results for fixed footer (units/dose, doses/vial, cost/dose)
  const [calcSummary, setCalcSummary] = useState({ unitsPerDose: 0, dosesPerVial: 0, costPerDose: '' });
  const [calcObject, setCalcObject] = useState(null);
  // Share vial card
  const [shareVialOpen, setShareVialOpen] = useState(false);
  
  // Only initialize form data when modal opens if no autosaved data was loaded
  useEffect(() => {
    if (open && prefill && !hasLoadedRef.current) {
      const initialData = {
        peptides: prefill.peptides || [{ id: 1, name: '', mg: '', mgUnit: 'mg', dose: '', doseUnit: 'mcg' }],
        vendor: prefill.vendor || '',
        vendorId: prefill.vendorId || null,
        water: prefill.water || '',
        deliveryMethod: prefill.deliveryMethod || 'pipette',
        administrationRoute: prefill.administrationRoute || 'subq',
        penType: prefill.penType || '',
        penColor: prefill.penColor || '',
        cost: prefill.cost || ''
      };
      // Ensure peptides is always an array and has mgUnit
      if (!initialData.peptides || !Array.isArray(initialData.peptides)) {
        initialData.peptides = [{ id: 1, name: '', mg: '', mgUnit: 'mg', dose: '', doseUnit: 'mcg' }];
      } else {
        // Ensure all peptides have mgUnit
        initialData.peptides = initialData.peptides.map(p => ({
          ...p,
          mgUnit: p.mgUnit || 'mg'
        }));
      }
      setForm(initialData);
      hasLoadedRef.current = true;
    } else if (!open) {
      // Reset the flag when modal closes
      hasLoadedRef.current = false;
    }
  }, [open, prefill]);

  const handleSave = async (data) => {
    try {
      setIsSavingToRecon(true);
      setSaveError(null);
      
      const peptideNames = data.peptides.map(p => p.name || 'Unnamed').join(' + ');
      const totalMg = data.peptides.reduce((sum, p) => sum + (Number(p.mg) || 0), 0);
      const totalDose = data.peptides.reduce((sum, p) => {
        const dose = Number(p.dose) || 0;
        return p.doseUnit === 'mg' ? sum + (dose * 1000) : sum + dose;
      }, 0);

      const newItem = {
        id: Date.now(),
        peptide: peptideNames,
        mg: totalMg,
        dose: totalDose, // This is now total mcg for calculation purposes
        vendor: data.vendor,
        water: data.water,
        deliveryMethod: data.deliveryMethod,
        administrationRoute: data.administrationRoute,
        penType: data.penType,
        penColor: data.penColor,
        cost: data.cost,
        date: new Date().toISOString(),
        peptides: data.peptides, // Save the full peptide list
        notes: '',
        isDraft: false
      };
      
      // Remove any draft versions of this item when saving as complete
      // Keep all existing vials - multiple vials per peptide name are allowed (distinct lot/date)
      setReconItems(prev => {
        const filtered = prev.filter(item => !item.isDraft);
        return [newItem, ...filtered];
      });

      // Deplete stockpile quantities for any linked vials
      const usageMap = (data.peptides || []).reduce((acc, pep) => {
        if (!pep?.stockpileId) return acc;
        const qty = Number(pep.quantityUsed) || 1;
        acc[pep.stockpileId] = (acc[pep.stockpileId] || 0) + qty;
        return acc;
      }, {});

      if (Object.keys(usageMap).length > 0 && setStockpile) {
        setStockpile(prev => {
          let changed = false;
          const updated = prev.map(item => {
            const usedQty = usageMap[item.id];
            if (!usedQty) return item;
            const currentQty = Number(item.quantity) || 0;
            const nextQty = Math.max(0, currentQty - usedQty);
            if (nextQty === currentQty) return item;
            changed = true;
            try {
              appendStockEvent({
                type: 'used',
                name: item.name,
                mg: item.mg,
                vendor: item.vendor,
                prevQty: currentQty,
                nextQty,
                source: 'recon'
              });
            } catch (e) { /* non-critical */ }
            return prepareItemForSave({ ...item, quantity: String(nextQty) });
          });
          return changed ? updated : prev;
        });
      }

      markAsSubmitted();
      onClose();
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Reconstitution saved!', type: 'success' } }));
    } catch (error) {
      console.error('❌ Failed to save reconstitution:', error);
      setSaveError('Failed to save reconstitution. Please try again.');
    } finally {
      setIsSavingToRecon(false);
    }
  };

  // Save draft to recon items list
  const saveDraft = useCallback(() => {
    if (!form || !form.peptides) return;
    
    const hasData = form.peptides?.some(p => p.name) || form.vendor || form.water > 0;
    if (!hasData) return;
    
    const isComplete = form.peptides?.every(p => p.name && p.mg && p.dose) && form.water > 0;
    if (isComplete) return; // Don't save complete forms as drafts
    
    try {
      const peptideNames = form.peptides?.map(p => p.name || 'Unnamed').filter(Boolean).join(' + ') || 'Draft';
      const totalMg = form.peptides?.reduce((sum, p) => sum + (Number(p.mg) || 0), 0) || 0;
      const totalDose = form.peptides?.reduce((sum, p) => {
        const dose = Number(p.dose) || 0;
        return p.doseUnit === 'mg' ? sum + (dose * 1000) : sum + dose;
      }, 0) || 0;

      const draftItem = {
        id: `draft_${Date.now()}`,
        peptide: peptideNames,
        mg: totalMg,
        dose: totalDose,
        vendor: form.vendor || '',
        water: form.water || 0,
        deliveryMethod: form.deliveryMethod || 'pipette',
        administrationRoute: form.administrationRoute,
        penType: form.penType,
        penColor: form.penColor,
        cost: form.cost || '',
        date: new Date().toISOString(),
        peptides: form.peptides || [],
        notes: '',
        isDraft: true
      };
      
      setReconItems(prev => {
        // Remove any existing drafts matching this form
        const existingDraftIndex = prev.findIndex(item => item.isDraft && item.peptide === draftItem.peptide);
        const filtered = existingDraftIndex >= 0 
          ? prev.filter((_, idx) => idx !== existingDraftIndex)
          : prev.filter(item => !item.isDraft || item.id !== draftItem.id);
        return [draftItem, ...filtered];
      });
    } catch (error) {
      console.warn('Failed to save draft:', error);
    }
  }, [form, setReconItems]);

  // Auto-save draft before closing if there's meaningful data
  const handleClose = async () => {
    // Save as draft if there's incomplete data
    if (!isSavingToRecon) {
      saveDraft();
    }
    
    markAsSubmitted();
    clearSavedData();
    onClose();
  };

  // Get primary action gradient for save button
  const getPrimaryActionGradient = (saving) => {
    const secondaryColor = theme?.secondary || '#d1d5db';
    if (saving) {
      return `linear-gradient(135deg, ${secondaryColor} 0%, ${secondaryColor} 100%)`;
    }
    return `linear-gradient(135deg, ${theme?.primary} 0%, ${theme?.primaryDark || theme?.primary} 100%)`;
  };
  const primaryActionDefaultShadow = theme?.isDark ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.1)';
  const primaryActionHoverShadow = theme?.isDark ? '0 10px 25px rgba(0, 0, 0, 0.5)' : '0 10px 25px rgba(0, 0, 0, 0.15)';

  // Get current delivery method and pen color from form
  const [deliveryMethod, setDeliveryMethod] = useState('pipette');
  const [penColor, setPenColor] = useState('#9ca3af');
  
  // Sync delivery method and pen color from form when it changes
  useEffect(() => {
    if (form?.deliveryMethod) {
      setDeliveryMethod(form.deliveryMethod);
    }
    if (form?.penColor) {
      setPenColor(form.penColor);
    }
  }, [form?.deliveryMethod, form?.penColor]);

  // Prepare save button data
  const handleSaveClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!form || !form.peptides) {
      console.error('Form data is missing!');
      return;
    }
    
    // Convert hex color to name before saving
    const selectedPenColor = penColors.find(p => p.hex === penColor);
    const penColorName = deliveryMethod === 'pen' ? selectedPenColor?.name : undefined;
    
    // Convert form data to save format
    const dataToSave = {
      ...form,
      peptides: (form.peptides || []).map(pep => ({
        ...pep,
        stockpileId: pep.stockpileId || null,
        quantityUsed: pep.quantityUsed || 1
      })),
      vendorId: form.vendorId || null,
      deliveryMethod: form.deliveryMethod || deliveryMethod,
      administrationRoute: (form.deliveryMethod || deliveryMethod) === 'pipette' ? (form.administrationRoute || 'subq') : undefined,
      penType: (form.deliveryMethod || deliveryMethod) === 'pen' ? (form.penType || '') : undefined,
      penColor: penColorName || form.penColor || '',
      cost: form.cost || '',
      dateAcquired: form.dateAcquired || ''
    };
    
    await handleSave(dataToSave);
  };

  return (
    <BottomSheet 
      open={open} 
      onClose={handleClose} 
      title="Peptide Calculator"
      seamlessContent={true}
      titleExtra={
        <AutoSaveIndicator 
          isSaving={isSaving || isSavingToRecon} 
          lastSaved={lastSaved} 
          onClearForm={clearSavedData} 
          theme={theme}
          compact={true}
          iconOnly={true}
        />
      }
      theme={theme}
      maxHeight="90vh"
      footer={
        <div className="w-full flex flex-col gap-3">
          {/* Stats strip */}
          <div className="flex items-center rounded-2xl overflow-hidden"
            style={{
              backgroundColor: theme.isDark ? `${theme.primary}15` : `${theme.primary}0f`,
              border: `1px solid ${theme.primary}20`,
            }}
          >
            {[
              { label: 'UNITS/DOSE', value: typeof calcSummary.unitsPerDose === 'number' ? calcSummary.unitsPerDose.toFixed(0) : '–' },
              { label: 'DOSES/VIAL', value: typeof calcSummary.dosesPerVial === 'number' ? calcSummary.dosesPerVial : '–' },
              { label: 'COST/DOSE',  value: calcSummary.costPerDose || '–' },
            ].map(({ label, value }, i, arr) => (
              <div key={label} className="flex-1 text-center py-2.5"
                style={i < arr.length - 1 ? { borderRight: `1px solid ${theme.primary}20` } : {}}>
                <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5"
                  style={{ color: theme.textLight, opacity: 0.7 }}>{label}</div>
                <div className="text-[1.1rem] font-black leading-none tabular-nums"
                  style={{ color: theme.primary }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Error */}
          {saveError && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl border" style={{
              backgroundColor: theme.isDark ? 'rgba(220,38,38,0.1)' : '#fef2f2',
              borderColor: theme.error || '#ef4444',
            }}>
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: theme.error || '#ef4444' }} />
              <span className="text-xs font-medium" style={{ color: theme.error || '#ef4444' }}>{saveError}</span>
            </div>
          )}

          {/* Action row: share | draft | save */}
          <div className="flex items-center gap-2">
            {!isReadOnly && (
              <button type="button" onClick={() => setShareVialOpen(true)}
                className="flex shrink-0 items-center justify-center w-10 h-10 rounded-xl border transition-all duration-200 active:scale-95 hover:scale-105"
                style={{
                  backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}0f`,
                  color: theme.primary, borderColor: `${theme.primary}30`,
                }} title="Share vial card">
                <Share2 size={16} strokeWidth={2} />
              </button>
            )}
            {!isReadOnly && (
              <button type="button" onClick={() => { saveDraft(); onClose(); }}
                className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-200 active:scale-[0.98]"
                style={{ color: theme.textLight, backgroundColor: 'transparent', borderColor: theme.border }}>
                <Bookmark size={14} strokeWidth={2} />
                Draft
              </button>
            )}
            <button type="button" onClick={handleSaveClick}
              disabled={isSavingToRecon || isReadOnly}
              className="flex flex-[2] items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all duration-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                background: getPrimaryActionGradient(isSavingToRecon || isReadOnly),
                color: (isSavingToRecon || isReadOnly) ? (theme?.text || '#111827') : (theme?.textOnPrimary || '#ffffff'),
                boxShadow: (isSavingToRecon || isReadOnly) ? 'none' : `0 2px 8px ${theme.primary}40`,
              }} title={isReadOnly ? 'Upgrade to save' : 'Save calculation'}>
              <FilePlus size={15} />
              {isSavingToRecon ? 'Saving…' : isReadOnly ? 'Upgrade to Save' : 'Save Calculation'}
            </button>
          </div>

          {/* Disclaimer */}
          <p className="text-[9px] text-center flex items-center justify-center gap-1 opacity-35" style={{ color: theme.text }}>
            <Info size={9} className="shrink-0" />
            For research purposes only. Always verify calculations.
          </p>
        </div>
      }
    >
      <ReconCalculatorPanel 
        theme={theme} 
        prefill={prefill}
        isReadOnly={isReadOnly}
        onSave={null}
        noCard={true}
        compact={true}
        formData={form}
        setFormData={(newForm) => {
          setForm(newForm);
          if (newForm?.deliveryMethod) setDeliveryMethod(newForm.deliveryMethod);
          if (newForm?.penColor) setPenColor(newForm.penColor);
        }}
        reconStrategy={null}
        hideSaveButton={true}
        onOpenShare={() => setShareVialOpen(true)}
        onCalcUpdate={(calc, costPerDose) => {
          setCalcObject(calc ?? null);
          setCalcSummary({
            unitsPerDose: calc?.unitsPerDose ?? 0,
            dosesPerVial: calc?.dosesPerVial ?? 0,
            costPerDose: costPerDose ?? ''
          });
        }}
      />
      <ShareVialCardModal
        open={shareVialOpen}
        onClose={() => setShareVialOpen(false)}
        theme={theme}
        form={form}
        calc={calcObject}
        costPerDose={calcSummary.costPerDose}
        currentPeptideIndex={0}
        deliveryMethod={deliveryMethod}
        administrationRoute={form.administrationRoute}
        penType={form.penType}
        penColor={penColor}
      />
    </BottomSheet>
  )
}
