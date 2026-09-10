import React, { useState, useEffect, useMemo, useRef } from 'react';
import BottomSheet from '../common/BottomSheet';
import {
    CaretRight,
    CaretDown,
    CheckCircle,
    Check,
    CalendarBlank,
    Flask,
    TestTube,
    X,
    Warning,
    Stack,
    CirclesThree,
    Syringe,
    Pen,
    Drop,
    Hand,
    SprayBottle,
} from '@phosphor-icons/react';
import OwnerSelect from '../buddy/OwnerSelect';
import { OWNER_SELF } from '../../utils/buddies';
import SearchableDropdown from '../common/SearchableDropdown';
import { ReconCalculatorPanel } from '../recon/ReconCalculatorPanel';
import { penColors } from '../../utils/penColors';
import { formatMMDDYYYY, getLocalDateString, getLocalTimestamp } from '../../utils/date';
import { formatCurrency } from '../../utils/currencyUtils';
import TextInput from '../common/inputs/TextInput';
import VendorSuggestInput from '../vendors/VendorSuggestInput';
import AutoSaveIndicator from '../common/AutoSaveIndicator';
import { appendStockEvent } from '../../utils/stockHistory';
import GlassmorphismDatePicker from '../common/GlassmorphismDatePicker';
import ColorSwatchDropdown from '../common/inputs/ColorSwatchDropdown';
import { generateId } from '../../utils/string';
import { calculateRecon } from '../../utils/recon';
import { prepareItemForSave } from '../../utils/userDataSave';
import { useAppContext } from '../../context/AppContext';
import SchedulingPreview from './SchedulingPreview';
import VisualSchedulePreview from './VisualSchedulePreview';
import ExpandableTooltip from '../ui/ExpandableTooltip';
import ModernTooltip from '../ui/ModernTooltip';


const PeptideLinkerRow = ({ peptide, peptideId, stockpile, linkedVialId, onSelectVial, onSaveNew, onSkip, onUnlink, onEditVial, theme, isSinglePeptide = false }) => {
    const [action, setAction] = useState(null); // 'select', 'add', 'edit'
    const [quickAddForm, setQuickAddForm] = useState({ mg: '', quantity: '', vendor: '' });

    const vialOptions = useMemo(() => {
        const peptideName = (peptide.name || '').toLowerCase();

        return stockpile
            .map(item => {
                const name = item.name || 'Unnamed compound';
                const vendor = item.vendor || 'Vendor not set';
                const quantity = Number(item.quantity) || 1;
                const cost = Number(item.cost) || 0;
                const priceUnit = (item.priceUnit || 'vial').toLowerCase();
                // Cost is stored as "cost per [priceUnit]" in stockpile (e.g. cost per vial). Only divide by quantity when it's total cost (legacy).
                const costPerVial = (priceUnit === 'vial') ? cost : (quantity > 0 ? cost / quantity : 0);
                const mgDisplay = item.mg ? `${item.mg}mg` : 'Amount not set';
                const capDisplay = item.capColor ? `${item.capColor} cap` : '';
                const costDisplay = costPerVial ? `${formatCurrency(costPerVial)}/vial` : 'Cost not set';

                return {
                    value: item.id,
                    label: [name, vendor, mgDisplay, capDisplay, costDisplay].filter(Boolean).join(' • '),
                    _matchScore: (name || '').toLowerCase() === peptideName ? 0 : 1
                };
            })
            .sort((a, b) => {
                if (a._matchScore !== b._matchScore) return a._matchScore - b._matchScore;
                return a.label.localeCompare(b.label);
            })
            .map(({ _matchScore, ...option }) => option);
    }, [stockpile, peptide]);

    const isSkipped = linkedVialId === 'skipped';

    // When a vial is already linked, show a calm confirmation — one primary action to change it.
    if (!action && linkedVialId && !isSkipped) {
        const selectedVial = stockpile.find(item => item.id === linkedVialId);
        const isNewlyAdded = selectedVial?.notes?.includes('Added during protocol start');
        const amountLabel = selectedVial?.mg != null && selectedVial.mg !== ''
            ? `${selectedVial.mg} ${selectedVial.mgUnit || 'mg'}`
            : null;
        const vendorLabel = (selectedVial?.vendor || '').trim();
        const linkedDetail = [amountLabel, vendorLabel ? `from ${vendorLabel}` : null].filter(Boolean).join(' · ');
        return (
            <div className="p-3 rounded-xl" style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : (theme.primary + '10'),
                border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : `${theme.primary}22`}`,
            }}>
                <div className="flex items-start gap-3">
                    <CheckCircle size={20} weight="duotone" className="flex-shrink-0 mt-0.5" style={{ color: theme.primary }} />
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm" style={{ color: theme.text }}>{peptide.name}</p>
                        <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                            {linkedDetail ? `Linked · ${linkedDetail}` : 'Linked to stockpile'}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setAction('select')}
                                className="px-3 py-1.5 text-xs rounded-lg font-semibold transition-all active:scale-95"
                                style={{ backgroundColor: theme.primary, color: '#ffffff' }}
                            >
                                Change vial
                            </button>
                            {isNewlyAdded && onEditVial && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedVial) {
                                            setQuickAddForm({
                                                mg: selectedVial.mg || '',
                                                quantity: selectedVial.quantity || '',
                                                vendor: selectedVial.vendor || ''
                                            });
                                            setAction('edit');
                                        }
                                    }}
                                    className="text-xs font-medium hover:underline px-1"
                                    style={{ color: theme.textLight }}
                                >
                                    Edit details
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => onUnlink(peptideId)}
                                className="text-xs font-medium hover:underline px-1"
                                style={{ color: theme.textLight }}
                            >
                                Unlink
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (action === 'add' || action === 'edit') {
        const isEdit = action === 'edit';
        const selectedVial = stockpile.find(item => item.id === linkedVialId);
        
        const handleSave = () => {
            if (isEdit && selectedVial && onEditVial) {
                onEditVial(peptideId, selectedVial.id, { ...quickAddForm, name: peptide.name });
            } else {
                onSaveNew(peptideId, { ...quickAddForm, name: peptide.name });
            }
            setAction(null);
        };
        
         return (
            <div className="p-3 rounded-md" style={{ 
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.02)',
                boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : 'none'
            }}>
                <p className="font-semibold text-sm mb-2" style={{ color: theme.text }}>
                    {isEdit ? `Edit ${peptide.name} in Stockpile` : `Add ${peptide.name} to Stockpile`}
                </p>
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <TextInput label="mg (per vial)" value={quickAddForm.mg} onChange={v => setQuickAddForm(f => ({...f, mg: v}))} theme={theme} placeholder="e.g., 10" outlined={true} customTextColor={theme.isDark ? null : "#181A18"} customShadow />
                        <TextInput label="Quantity (vials)" value={quickAddForm.quantity} onChange={v => setQuickAddForm(f => ({...f, quantity: v}))} theme={theme} placeholder="e.g., 1" outlined={true} customTextColor={theme.isDark ? null : "#181A18"} customShadow />
                    </div>
                    <VendorSuggestInput label="Vendor" value={quickAddForm.vendor} onChange={v => setQuickAddForm(f => ({...f, vendor: v}))} theme={theme} />
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                     <button onClick={() => setAction(null)} className="px-3 py-1.5 text-xs rounded-lg font-medium transition-all" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : theme.secondary, color: theme.isDark ? '#ffffff' : theme.text }}>Cancel</button>
                     <button onClick={handleSave} className="px-3 py-1.5 text-xs rounded-lg font-medium transition-all" style={{ backgroundColor: theme.primary, color: '#ffffff' }}>{isEdit ? 'Save Changes' : 'Save & Link'}</button>
                </div>
            </div>
        );
    }

    if (action === 'select') {
        return (
            <div className="p-3 rounded-xl" style={{ 
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.cardBackground,
                border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : theme.border}`,
            }}>
                <p className="font-semibold text-sm mb-1" style={{ color: theme.text }}>{peptide.name}</p>
                <p className="text-xs mb-2" style={{ color: theme.textLight }}>Pick a vial from your stockpile</p>
                <SearchableDropdown
                    options={vialOptions}
                    onChange={(vialId) => {
                        onSelectVial(peptideId, vialId);
                        setAction(null);
                    }}
                    theme={theme}
                    placeholder="Type to search your stockpile..."
                    idleMessage="Start typing to search your stockpile."
                    emptyMessage="No stockpile entries found. Keep typing to refine your search."
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                    <button type="button" onClick={() => setAction(null)} className="text-xs hover:underline" style={{ color: theme.textLight }}>Cancel</button>
                    <button type="button" onClick={() => setAction('add')} className="text-xs font-medium hover:underline" style={{ color: theme.primary }}>
                        Or add a new vial
                    </button>
                </div>
            </div>
        );
    }

    if (isSkipped) {
        return (
            <div className="p-3 rounded-md" style={{ 
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.02)',
                boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : 'none'
            }}>
                 <div className="flex items-center justify-between">
                    <div>
                        <p className="font-semibold text-sm" style={{ color: theme.text }}>{peptide.name}</p>
                        <p className="text-xs mt-1" style={{ color: theme.textLight }}>
                            Skipped - manual tracking
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => onUnlink(peptideId)} className="text-xs hover:underline" style={{ color: theme.textLight }}>Undo</button>
                    </div>
                </div>
            </div>
        );
    }
    
    // Default view — one clear primary action
    return (
        <div className="p-3 rounded-xl" style={{ 
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.cardBackground,
            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : theme.border}`,
        }}>
            <p className="font-semibold text-sm mb-1 break-words" style={{ color: theme.text }}>{peptide.name}</p>
            <p className="text-xs mb-3" style={{ color: theme.textLight }}>Link a stockpile vial for this peptide</p>
            <div className="flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    onClick={() => setAction('select')}
                    className="px-3 py-1.5 text-xs rounded-lg font-semibold transition-all shrink-0 whitespace-nowrap active:scale-95"
                    style={{ backgroundColor: theme.primary, color: '#ffffff' }}
                >
                    Select from stockpile
                </button>
                <button
                    type="button"
                    onClick={() => setAction('add')}
                    className="text-xs font-medium hover:underline px-1 shrink-0"
                    style={{ color: theme.textLight }}
                >
                    Add new
                </button>
                {!isSinglePeptide && (
                    <button
                        type="button"
                        onClick={() => onSkip(peptideId)}
                        className="text-xs font-medium hover:underline px-1 shrink-0"
                        style={{ color: theme.textLight }}
                    >
                        Skip
                    </button>
                )}
            </div>
        </div>
    );
};


export default function StartProtocolWizard({ open, onClose, protocol, stockpile, setStockpile, theme, onStart }) {
    const { setReconItems } = useAppContext() || {};
    // ACCORDION STATE - No more stages!
    const [expandedSections, setExpandedSections] = useState({
        preview: true, // Auto-expand preview to show schedule
        linking: false, // Collapse optional linking section
        recon: false,
        delivery: false
    });
    
    const [linkedData, setLinkedData] = useState({});
    const [startDate, setStartDate] = useState(() => getLocalDateString());
    const [ownerId, setOwnerId] = useState(() => protocol?.ownerId || OWNER_SELF);
    const [reconStrategy, setReconStrategy] = useState(null); // 'separate' | 'blended'
    const [reconComplete, setReconComplete] = useState(false); // Track if recon was completed
    // Units/dose from last saved recon in this wizard — stamped onto peptides at start
    const [savedReconDose, setSavedReconDose] = useState(null); // { unitsPerDose, dose, doseUnit }
    // User chose Skip on recon — show Delivery Method instead (mutually exclusive with recon)
    const [reconSkipped, setReconSkipped] = useState(false);
    const [skippedPeptideDeliveryMethods, setSkippedPeptideDeliveryMethods] = useState({}); // Store delivery method info for skipped peptides
    const [penTypeDropdownOpen, setPenTypeDropdownOpen] = useState({}); // Track which peptide's dropdown is open
    const penTypeDropdownRefs = useRef({});
    const hasInteractedRef = useRef(false);

    // Close dropdowns when clicking outside (supports both mouse and touch)
    useEffect(() => {
        const handleClickOutside = (event) => {
            Object.keys(penTypeDropdownOpen).forEach(peptideId => {
                if (penTypeDropdownRefs.current[peptideId] && !penTypeDropdownRefs.current[peptideId].contains(event.target)) {
                    setPenTypeDropdownOpen(prev => ({
                        ...prev,
                        [peptideId]: false
                    }));
                }
            });
        };

        if (Object.keys(penTypeDropdownOpen).some(key => penTypeDropdownOpen[key])) {
            // Support both mouse and touch events for mobile compatibility
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('touchstart', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
                document.removeEventListener('touchstart', handleClickOutside);
            };
        }
    }, [penTypeDropdownOpen]);

    const adjustStockpileAfterRecon = React.useCallback((usageList) => {
        if (!Array.isArray(usageList) || usageList.length === 0) return;

        const usageMap = usageList.reduce((acc, usage) => {
            if (!usage || !usage.stockpileId) return acc;
            const qty = Number(usage.quantityUsed) || 1;
            acc[usage.stockpileId] = (acc[usage.stockpileId] || 0) + qty;
            return acc;
        }, {});

        if (Object.keys(usageMap).length === 0) return;

        setStockpile(prev => {
            let changed = false;
            const updated = prev.map(item => {
                const usedQty = usageMap[item.id];
                if (!usedQty) return item;

                const currentQty = Number(item.quantity) || 0;
                const nextQty = Math.max(0, currentQty - usedQty);

                if (nextQty === currentQty) {
                    return item;
                }

                changed = true;

                try {
                    appendStockEvent({
                        type: 'used',
                        name: item.name,
                        mg: item.mg,
                        vendor: item.vendor,
                        prevQty: currentQty,
                        nextQty,
                        source: 'protocol'
                    });
                } catch (error) {
                    console.warn('Failed to append stock event after protocol recon:', error);
                }

                return { ...item, quantity: String(nextQty) };
            });

            return changed ? updated : prev;
        });
    }, [setStockpile]);

    // Auto-save wizard state
    const storageKey = `tpprover_start_protocol_draft_${protocol?.id || 'new'}`;
    const [isSaving, setIsSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState(null);
    const autoSaveTimeoutRef = React.useRef(null);
    const previousStateRef = React.useRef(null);
    const isRestoringRef = React.useRef(false);
    const openSessionInitializedRef = React.useRef(false);
    /** Latest wizard fields for synchronous draft flush when the sheet closes */
    const wizardStateRef = React.useRef({
        expandedSections,
        linkedData,
        startDate,
        reconStrategy,
        reconComplete,
        reconSkipped,
        skippedPeptideDeliveryMethods,
    });

    React.useEffect(() => {
        wizardStateRef.current = {
            expandedSections,
            linkedData,
            startDate,
            reconStrategy,
            reconComplete,
            reconSkipped,
            skippedPeptideDeliveryMethods,
        };
    });

    // Auto-save effect
    useEffect(() => {
        if (!open || !protocol) return;
        if (isRestoringRef.current) {
            isRestoringRef.current = false;
            return;
        }

        const currentState = {
            expandedSections,
            linkedData,
            startDate,
            reconStrategy,
            reconComplete,
            reconSkipped,
            skippedPeptideDeliveryMethods
        };

        // Skip if data hasn't changed
        if (JSON.stringify(currentState) === JSON.stringify(previousStateRef.current)) {
            return;
        }

        // Skip if form is empty
        if (!currentState.linkedData || Object.keys(currentState.linkedData).length === 0) {
            return;
        }

        // Clear existing timeout
        if (autoSaveTimeoutRef.current) {
            clearTimeout(autoSaveTimeoutRef.current);
        }

        setIsSaving(true);

        // Auto-save after delay
        autoSaveTimeoutRef.current = setTimeout(() => {
            try {
                const saveData = {
                    data: currentState,
                    timestamp: getLocalTimestamp()
                };
                localStorage.setItem(storageKey, JSON.stringify(saveData));
                setLastSaved(new Date());
                previousStateRef.current = currentState;
            } catch (error) {
                console.warn('Failed to auto-save wizard state:', error);
            } finally {
                setIsSaving(false);
            }
        }, 2000);

        return () => {
            if (autoSaveTimeoutRef.current) {
                clearTimeout(autoSaveTimeoutRef.current);
            }
        };
    }, [expandedSections, linkedData, startDate, reconStrategy, reconComplete, reconSkipped, skippedPeptideDeliveryMethods, open, protocol, storageKey]);

    const clearSavedData = React.useCallback(() => {
        try {
            localStorage.removeItem(storageKey);
            setLastSaved(null);
            previousStateRef.current = null;
        } catch (error) {
            console.warn('Failed to clear saved data:', error);
        }
    }, [storageKey]);

    const markAsSubmitted = React.useCallback(() => {
        clearSavedData();
    }, [clearSavedData]);

    const persistDraftNow = React.useCallback(() => {
        try {
            if (!protocol?.id) return;
            const s = wizardStateRef.current;
            if (!s.linkedData || Object.keys(s.linkedData).length === 0) return;
            localStorage.setItem(storageKey, JSON.stringify({ data: s, timestamp: getLocalTimestamp() }));
            setLastSaved(new Date());
        } catch (e) {
            console.warn('Failed to persist protocol wizard draft:', e);
        }
    }, [protocol?.id, storageKey]);

    const finishClose = React.useCallback((opts = {}) => {
        if (!opts.skipPersist) {
            persistDraftNow();
        }
        onClose();
    }, [persistDraftNow, onClose]);

    const applyFreshWizardState = React.useCallback(() => {
        if (!protocol?.peptides?.length) return;
        isRestoringRef.current = true;
        const today = getLocalDateString();
        const resumeAnchor = protocol?.heldAt && protocol?.startDate ? protocol.startDate : today;
        const initialData = {};
        protocol.peptides.forEach((pep, index) => {
            const peptideId = pep.id || `peptide-${index}`;
            const uniqueKey = initialData[peptideId] ? `peptide-${index}` : peptideId;
            initialData[uniqueKey] = { status: 'pending' };
        });
        setLinkedData(initialData);
        setStartDate(resumeAnchor);
        setOwnerId(protocol?.ownerId || OWNER_SELF);
        setReconStrategy(null);
        setReconComplete(false);
        setReconSkipped(false);
        setSavedReconDose(null);
        setSkippedPeptideDeliveryMethods({});
        setExpandedSections({ preview: true, linking: false, recon: false, delivery: false });
        previousStateRef.current = {
            expandedSections: { preview: true, linking: false, recon: false, delivery: false },
            linkedData: initialData,
            startDate: resumeAnchor,
            reconStrategy: null,
            reconComplete: false,
            reconSkipped: false,
            skippedPeptideDeliveryMethods: {},
        };
    }, [protocol]);

    const handleStartFresh = React.useCallback(() => {
        clearSavedData();
        applyFreshWizardState();
        window.dispatchEvent(new CustomEvent('tpp:toast', {
            detail: { message: 'Starting fresh — previous draft cleared.', type: 'info' },
        }));
    }, [clearSavedData, applyFreshWizardState]);

    // Load saved draft or initialize fresh state only when modal first opens.
    // Run once per open session so parent re-renders (e.g. after Save & Link) don't overwrite state with stale draft.
    useEffect(() => {
        if (!open) {
            openSessionInitializedRef.current = false;
            return;
        }
        if (openSessionInitializedRef.current || !protocol) return;
        openSessionInitializedRef.current = true;

        try {
            const saved = localStorage.getItem(storageKey);
            if (saved) {
                const parsedData = JSON.parse(saved);
                const savedState =
                    parsedData?.data && typeof parsedData.data === 'object' && !Array.isArray(parsedData.data)
                        ? parsedData.data
                        : typeof parsedData === 'object' && parsedData !== null && parsedData.linkedData
                          ? parsedData
                          : null;
                const linked = savedState?.linkedData;
                const hasLinkedDraft =
                    linked &&
                    typeof linked === 'object' &&
                    !Array.isArray(linked) &&
                    Object.keys(linked).length > 0;
                if (savedState && hasLinkedDraft) {
                    isRestoringRef.current = true;
                    const dateToUse = savedState.startDate || getLocalDateString();
                    setStartDate(dateToUse);
                    if (savedState.expandedSections) setExpandedSections(savedState.expandedSections);
                    setLinkedData(linked);
                    if (savedState.reconStrategy !== undefined) setReconStrategy(savedState.reconStrategy);
                    if (savedState.reconComplete !== undefined) setReconComplete(savedState.reconComplete);
                    if (savedState.reconSkipped !== undefined) setReconSkipped(savedState.reconSkipped);
                    if (savedState.skippedPeptideDeliveryMethods) setSkippedPeptideDeliveryMethods(savedState.skippedPeptideDeliveryMethods);
                    if (savedState.ownerId) setOwnerId(savedState.ownerId);
                    const mergedPrev = {
                        expandedSections: savedState.expandedSections || { preview: true, linking: false, recon: false, delivery: false },
                        linkedData: linked,
                        startDate: dateToUse,
                        reconStrategy: savedState.reconStrategy ?? null,
                        reconComplete: savedState.reconComplete ?? false,
                        reconSkipped: savedState.reconSkipped ?? false,
                        skippedPeptideDeliveryMethods: savedState.skippedPeptideDeliveryMethods || {},
                    };
                    previousStateRef.current = mergedPrev;
                    wizardStateRef.current = mergedPrev;
                    setLastSaved(new Date(parsedData.timestamp || Date.now()));
                    return;
                }
            }
        } catch (e) {
            console.warn('Failed to load saved draft:', e);
        }

        isRestoringRef.current = true;
        const today = getLocalDateString();
        // After free-plan hold: keep the original start anchor so titration / calendar days stay coherent (user can still edit).
        const resumeAnchor =
            protocol?.heldAt && protocol?.startDate ? protocol.startDate : today;
        const initialData = {};
        protocol.peptides.forEach((p, index) => {
            const peptideId = p.id || `peptide-${index}`;
            const uniqueKey = initialData[peptideId] ? `peptide-${index}` : peptideId;
            initialData[uniqueKey] = { status: 'pending' };
        });
        const freshExpanded = { preview: true, linking: false, recon: false, delivery: false };
        const freshPrev = {
            expandedSections: freshExpanded,
            linkedData: initialData,
            startDate: resumeAnchor,
            reconStrategy: null,
            reconComplete: false,
            reconSkipped: false,
            skippedPeptideDeliveryMethods: {},
        };
        setLinkedData(initialData);
        setStartDate(resumeAnchor);
        setReconStrategy(null);
        setReconComplete(false);
        setReconSkipped(false);
        setSavedReconDose(null);
        setSkippedPeptideDeliveryMethods({});
        setExpandedSections(freshExpanded);
        previousStateRef.current = freshPrev;
        wizardStateRef.current = freshPrev;
    }, [open, protocol, storageKey]);

    const handleSelectVial = React.useCallback((peptideId, vialId) => {
        hasInteractedRef.current = true;
        setLinkedData(prev => {
            const updated = {};
            Object.keys(prev).forEach(key => {
                updated[key] = { ...prev[key] };
            });
            updated[peptideId] = { status: 'linked', vialId };
            return updated;
        });

        // Log linked_to_protocol event
        const vial = stockpile.find(item => item.id === vialId);
        if (vial) {
            appendStockEvent({
                type: 'linked_to_protocol',
                name: vial.name,
                mg: vial.mg,
                vendor: vial.vendor,
                stockpileId: vialId,
                source: 'protocol',
                protocolId: protocol?.id || null
            });
        }
    }, [stockpile, protocol]);

    const handleUnlinkPeptide = (peptideId) => {
        hasInteractedRef.current = true;
        setLinkedData(prev => {
            const updated = {};
            Object.keys(prev).forEach(key => {
                updated[key] = { ...prev[key] };
            });
            updated[peptideId] = { status: 'pending' };
            return updated;
        });
        // Clear delivery method data if peptide is unlinked
        setSkippedPeptideDeliveryMethods(prev => {
            const updated = { ...prev };
            delete updated[peptideId];
            return updated;
        });
    };

    const handleSkipPeptide = (peptideId) => {
        hasInteractedRef.current = true;
        setLinkedData(prev => {
            const updated = {};
            Object.keys(prev).forEach(key => {
                updated[key] = { ...prev[key] };
            });
            updated[peptideId] = { status: 'skipped' };
            return updated;
        });
    };

    const handleSaveNewAndLink = (peptideId, newItemData) => {
        hasInteractedRef.current = true;
        const newItem = {
            id: `stock-${generateId()}`,
            ...newItemData,
            notes: "Added during protocol start. Review details."
        };
        
        const updatedStockpile = [newItem, ...stockpile];
        setStockpile(updatedStockpile);

        setLinkedData(prev => {
            const updated = {};
            Object.keys(prev).forEach(key => {
                updated[key] = { ...prev[key] };
            });
            updated[peptideId] = { status: 'linked', vialId: newItem.id };
            // Persist draft immediately so listener re-renders or remounts don't overwrite with stale draft
            try {
                const draftState = {
                    expandedSections,
                    linkedData: updated,
                    startDate,
                    reconStrategy,
                    reconComplete,
                    reconSkipped,
                    skippedPeptideDeliveryMethods
                };
                localStorage.setItem(storageKey, JSON.stringify({ data: draftState, timestamp: getLocalTimestamp() }));
                previousStateRef.current = draftState;
            } catch (e) {
                console.warn('Failed to persist draft after Save & Link:', e);
            }
            return updated;
        });
    };

    const handleEditVial = (peptideId, vialId, updatedData) => {
        const updatedStockpile = stockpile.map(item => {
            if (item.id === vialId) {
                return {
                    ...item,
                    ...updatedData,
                    notes: "Added during protocol start. Review details."
                };
            }
            return item;
        });
        setStockpile(updatedStockpile);
        
        // Update linkedData to ensure it still references the vial
        setLinkedData(prev => {
            const updated = { ...prev };
            if (updated[peptideId] && updated[peptideId].status === 'linked') {
                updated[peptideId] = { ...updated[peptideId], vialId: vialId };
            }
            return updated;
        });
    };

    const handleSkipAllVials = () => {
        hasInteractedRef.current = true;
        // Skip all peptides
        const updated = {};
        protocol.peptides.forEach((p, index) => {
            const peptideId = p.id || `peptide-${index}`;
            updated[peptideId] = { status: 'skipped' };
        });
        setLinkedData(updated);
        // Collapse linking, expand delivery (no vials to reconstitute)
        setExpandedSections({ preview: false, linking: false, recon: false, delivery: true });
    };

    const toggleSection = (section) => {
        setExpandedSections(prev => ({
            ...prev,
            [section]: !prev[section]
        }));
    };

    const linkedPeptides = useMemo(() => {
        if (!protocol) return [];
        return protocol.peptides.filter((p, index) => {
            const peptideId = p.id || `peptide-${index}`;
            return linkedData[peptideId]?.status === 'linked';
        });
    }, [linkedData, protocol]);

    const skippedPeptides = useMemo(() => {
        if (!protocol) return [];
        return protocol.peptides
            .map((p, index) => {
                const peptideId = p.id || `peptide-${index}`;
                return { ...p, peptideId, originalIndex: index };
            })
            .filter(item => linkedData[item.peptideId]?.status === 'skipped');
    }, [linkedData, protocol]);

    const needsReconStrategy = useMemo(() => {
        // Check if multiple unique peptide names exist
        const uniquePeptideNames = new Set(
            linkedPeptides.map(p => (p.name || '').toLowerCase().trim()).filter(Boolean)
        );
        return uniquePeptideNames.size > 1;
    }, [linkedPeptides]);

    // Get completion status for sections
    const linkingComplete = useMemo(() => {
        if (!protocol) return false;
        return protocol.peptides.every((p, index) => {
            const peptideId = p.id || `peptide-${index}`;
            const status = linkedData[peptideId]?.status;
            return status === 'linked' || status === 'skipped';
        });
    }, [linkedData, protocol]);

    // Delivery Method is mutually exclusive with recon for linked vials:
    // - After recon: linked peptides already have delivery from the calculator
    // - After skip recon (reconSkipped): linked vials need delivery here
    // - BUG #6 FIX: Manual (skipped-link) peptides don't need delivery - they're tracked manually
    const peptidesNeedingDelivery = useMemo(() => {
        if (!protocol?.peptides?.length) return [];
        return protocol.peptides
            .map((p, index) => {
                const peptideId = p.id || `peptide-${index}`;
                return { peptide: p, peptideId, status: linkedData[peptideId]?.status };
            })
            .filter(({ status }) => {
                // BUG #6 FIX: Skipped-link peptides (manual tracking) don't require delivery method
                if (status === 'skipped') return false;
                if (status === 'linked') {
                    if (reconComplete) return false;
                    return reconSkipped;
                }
                return false;
            });
    }, [protocol, linkedData, reconComplete, reconSkipped]);

    const deliveryComplete = useMemo(() => {
        // Linked vials: must finish recon OR skip it before start
        if (linkedPeptides.length > 0 && !reconComplete && !reconSkipped) return false;
        if (peptidesNeedingDelivery.length === 0) return true;
        return peptidesNeedingDelivery.every(({ peptideId }) => {
            const deliveryData = skippedPeptideDeliveryMethods[peptideId];
            if (!deliveryData) return true; // default syringe/subq
            if (deliveryData.deliveryMethod === 'pipette') return !!deliveryData.administrationRoute;
            if (deliveryData.deliveryMethod === 'pen') return !!deliveryData.penType && !!deliveryData.penColor;
            return true;
        });
    }, [linkedPeptides.length, reconComplete, reconSkipped, peptidesNeedingDelivery, skippedPeptideDeliveryMethods]);

    // Focus-mode auto-advance: only after user interaction (not draft restore)
    useEffect(() => {
        if (!open) {
            hasInteractedRef.current = false;
        }
    }, [open]);

    useEffect(() => {
        if (!hasInteractedRef.current || !linkingComplete) return;
        if (linkedPeptides.length > 0) {
            setExpandedSections(prev => ({ ...prev, linking: false, preview: false, recon: true }));
        } else {
            // All skipped — no recon step
            setExpandedSections(prev => ({ ...prev, linking: false, preview: false, recon: false, delivery: true }));
        }
    }, [linkingComplete, linkedPeptides.length]);

    useEffect(() => {
        if (!hasInteractedRef.current) return;
        if (reconComplete || reconSkipped) {
            setExpandedSections(prev => ({ ...prev, recon: false, delivery: true }));
        }
    }, [reconComplete, reconSkipped]);

    // Validate protocol has required fields
    const protocolValid = useMemo(() => {
        if (!protocol) return false;
        // Must have a name
        if (!protocol.protocolName && !protocol.name) return false;
        // Must have peptides
        if (!protocol.peptides || protocol.peptides.length === 0) return false;
        // All peptides must have names
        if (!protocol.peptides.every(p => p.name)) return false;
        return true;
    }, [protocol]);

    const canStart = linkingComplete && deliveryComplete && protocolValid;

    if (!protocol) return null;

    const { _wizardResumeFromHold: _resumeHold, ...protocolForStart } = protocol;
    const resumeFromHold = !!_resumeHold;
    const sheetTitle = resumeFromHold
        ? `Resume setup: ${protocol.protocolName || protocol.name || 'Unnamed'}`
        : `Start Protocol: ${protocol.protocolName || protocol.name || 'Unnamed'}`;

    return (
        <BottomSheet
            open={open}
            onClose={finishClose}
            title={sheetTitle}
            theme={theme}
            maxHeight="90vh"
            titleExtra={<AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} compact />}
            footer={
                <div className="w-full space-y-2">
                    {/* Warning tip above buttons */}
                        {!canStart && (
                        <div className="text-xs text-center py-1 flex items-center justify-center gap-1" style={{ color: theme.textLight }}>
                            {!linkingComplete && <><Warning size={12} weight="duotone" /> Complete vial linking or skip all peptides</>}
                            {linkingComplete && !deliveryComplete && linkedPeptides.length > 0 && !reconComplete && !reconSkipped && (
                                <><Warning size={12} weight="duotone" /> Use Peptide Calculator or skip to continue</>
                            )}
                            {linkingComplete && !deliveryComplete && (reconSkipped || peptidesNeedingDelivery.length > 0) && (reconComplete || reconSkipped || linkedPeptides.length === 0) && (
                                <><Warning size={12} weight="duotone" /> Set delivery method for remaining peptides</>
                            )}
                        </div>
                    )}
                    
                    {/* Two CTAs side by side */}
                    <div className="flex gap-3">
                        <button 
                            type="button"
                            onClick={() => finishClose()} 
                            className="py-2.5 text-sm font-medium transition-opacity hover:opacity-70" 
                            style={{ 
                                color: theme.textLight || theme.text, 
                                background: 'none',
                                border: 'none',
                                padding: 0
                            }}
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={() => {
                                // Final validation before starting
                                if (!protocol || !protocol.protocolName && !protocol.name) {
                                    window.dispatchEvent(new CustomEvent('tpp:toast', { 
                                        detail: { message: 'Protocol must have a name', type: 'error' } 
                                    }));
                                    return;
                                }
                                if (!protocol.peptides || protocol.peptides.length === 0) {
                                    window.dispatchEvent(new CustomEvent('tpp:toast', { 
                                        detail: { message: 'Protocol must have at least one peptide', type: 'error' } 
                                    }));
                                    return;
                                }
                                if (!startDate) {
                                    window.dispatchEvent(new CustomEvent('tpp:toast', { 
                                        detail: { message: 'Please select a start date', type: 'error' } 
                                    }));
                                    return;
                                }
                                
                                markAsSubmitted();
                                const enrichedLinkedData = { ...linkedData };
                                const defaultDelivery = { deliveryMethod: 'pipette', administrationRoute: 'subq', penType: '', penColor: '' };
                                // Apply delivery method for ALL peptides (linked + skipped)
                                protocol.peptides.forEach((p, index) => {
                                    const peptideId = p.id || `peptide-${index}`;
                                    if (enrichedLinkedData[peptideId]) {
                                        enrichedLinkedData[peptideId] = {
                                            ...enrichedLinkedData[peptideId],
                                            deliveryMethod: skippedPeptideDeliveryMethods[peptideId] || defaultDelivery
                                        };
                                    }
                                });

                                // Patch peptide objects so ProtocolCard can read penColor / deliveryMethod / units
                                const patchedPeptides = protocol.peptides.map((pep, index) => {
                                    const peptideId = pep.id || `peptide-${index}`;
                                    const dm = enrichedLinkedData[peptideId]?.deliveryMethod;
                                    const next = dm ? {
                                        ...pep,
                                        deliveryMethod: dm.deliveryMethod || pep.deliveryMethod,
                                        penColor: dm.penColor || pep.penColor,
                                        penType: dm.penType || pep.penType,
                                        administrationRoute: dm.administrationRoute || pep.administrationRoute,
                                    } : { ...pep };

                                    // Stamp syringe/pen units from wizard recon so they show on card + vial editor
                                    if (savedReconDose?.unitsPerDose > 0 && !(String(next.unitValue || '').trim())) {
                                        next.unitValue = String(savedReconDose.unitsPerDose);
                                    }
                                    // Keep dosage in sync if user edited dose in the recon calculator
                                    if (savedReconDose?.dose != null && savedReconDose.dose !== '') {
                                        const isTitration = next.dosageScheduleType !== 'fixed'
                                            && Array.isArray(next.titration)
                                            && next.titration.length > 0;
                                        if (!isTitration) {
                                            next.dosage = {
                                                ...(next.dosage || {}),
                                                amount: savedReconDose.dose,
                                                unit: savedReconDose.doseUnit || next.dosage?.unit || 'mcg',
                                            };
                                        }
                                    }
                                    return next;
                                });
                                
                                const protocolToStart = {
                                    ...protocolForStart,
                                    startDate,
                                    active: true,
                                    linkedItems: enrichedLinkedData,
                                    peptides: patchedPeptides,
                                    ownerId: ownerId || OWNER_SELF
                                };
                                
                                onStart(protocolToStart);
                                finishClose({ skipPersist: true });
                            }}
                            disabled={!canStart}
                            className="flex-1 py-2.5 rounded-lg text-sm font-bold transition-all"
                            style={{ 
                                backgroundColor: canStart ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.1)' : theme.secondary), 
                                color: canStart ? '#ffffff' : theme.textLight,
                                opacity: canStart ? 1 : 0.5,
                                cursor: canStart ? 'pointer' : 'not-allowed'
                            }}
                        >
                            {resumeFromHold ? 'Finish & activate' : 'Start Protocol'}
                        </button>
                    </div>
                </div>
            }
        >
            <div className="space-y-4">
                {resumeFromHold && (
                    <div
                        className="rounded-lg border px-3 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                        style={{
                            borderColor: `${theme.primary}55`,
                            backgroundColor: theme.isDark ? `${theme.primary}14` : `${theme.primary}12`,
                        }}
                    >
                        <p className="text-xs leading-snug" style={{ color: theme.text }}>
                            <span className="font-semibold">Continue where you left off.</span>{' '}
                            Your setup auto-saves on this device until you finish — or choose Start over for a clean slate.
                        </p>
                        <button
                            type="button"
                            onClick={handleStartFresh}
                            className="text-xs font-bold uppercase tracking-wide shrink-0 px-3 py-1.5 rounded-lg transition-opacity hover:opacity-90"
                            style={{
                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)',
                                color: theme.primary,
                                border: `1px solid ${theme.primary}40`,
                            }}
                        >
                            Start over
                        </button>
                    </div>
                )}
                {/* Start Date - Compact Inline */}
                <div className="flex items-center gap-3 py-2">
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <CalendarBlank size={16} weight="duotone" style={{ color: theme.primary }} />
                        <span className="text-sm font-semibold" style={{ color: theme.text }}>Start</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <GlassmorphismDatePicker
                            value={startDate}
                            onChange={(dateString) => setStartDate(dateString)}
                            theme={theme}
                            placeholder="Start Date"
                            Icon={CalendarBlank}
                            iconWeight="duotone"
                        />
                    </div>
                </div>

                {/* Who is this run for? - Buddy OwnerSelect */}
                <OwnerSelect
                    value={ownerId}
                    onChange={setOwnerId}
                    label="Who is this for?"
                    theme={theme}
                />

                {/* Schedule Preview - Collapsible */}
                <div className="rounded-lg border" style={{ 
                    borderColor: theme.border,
                    backgroundColor: theme.cardBackground 
                }}>
                    <button
                        type="button"
                        onClick={() => toggleSection('preview')}
                        className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                    >
                        <div className="flex items-center gap-2">
                            <CalendarBlank size={18} weight="duotone" style={{ color: theme.primary }} />
                            <h4 className="text-sm font-medium" style={{ color: theme.text }}>
                                Schedule Preview
                            </h4>
                        </div>
                        {expandedSections.preview ? (
                            <CaretDown size={18} weight="duotone" style={{ color: theme.textLight }} />
                        ) : (
                            <CaretRight size={18} weight="duotone" style={{ color: theme.textLight }} />
                        )}
                    </button>
                    <div 
                        className="transition-all duration-300 ease-in-out"
                        style={{
                            maxHeight: expandedSections.preview ? '500px' : '0',
                            opacity: expandedSections.preview ? 1 : 0,
                            overflow: expandedSections.preview ? 'visible' : 'hidden'
                        }}
                    >
                        <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: theme.border }}>
                            <VisualSchedulePreview 
                                protocol={protocol} 
                                startDate={startDate}
                                theme={theme} 
                                daysToShow={7}
                            />
                        </div>
                    </div>
                </div>

                {/* SECTION 1: Link Vials (Accordion) */}
                <div className="rounded-lg border" style={{ 
                    borderColor: linkingComplete ? `${theme.primary}60` : theme.border,
                    backgroundColor: theme.cardBackground 
                }}>
                    <button
                        type="button"
                        onClick={() => toggleSection('linking')}
                        className="w-full p-4 flex items-center justify-between hover:opacity-80 transition-opacity"
                    >
                        <div className="flex items-center gap-3 flex-1">
                            {linkingComplete ? (
                                <Check size={24} weight="duotone" style={{ color: theme.primary }} className="flex-shrink-0" />
                            ) : (
                                <TestTube size={24} weight="duotone" style={{ color: theme.primary }} className="flex-shrink-0" />
                            )}
                            <div className="flex flex-col gap-0.5 flex-1 text-left min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-base font-semibold" style={{ color: theme.text }}>
                                        Link Vials to Protocol
                                    </h4>
                                    <ModernTooltip text="About linking vials" position="top" theme={theme}>
                                        <span
                                            className="inline-flex"
                                            onClick={(e) => e.stopPropagation()}
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            <ExpandableTooltip
                                                content={`[Package] Link each peptide to a stockpile vial for tracking.\n[CheckCircle] Or skip to track that peptide manually.`}
                                                theme={theme}
                                                controlSize={32}
                                                title="Linking vials"
                                            />
                                        </span>
                                    </ModernTooltip>
                                </div>
                                {!expandedSections.linking && (
                                    <span className="text-[10px] font-medium" style={{ color: theme.textLight }}>
                                        {linkingComplete 
                                            ? `${Object.values(linkedData).filter(d => d.status === 'linked').length} vials linked, ${skippedPeptides.length} skipped`
                                            : 'Click to link vials from stockpile or skip for manual tracking'
                                        }
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider" style={{ 
                                backgroundColor: linkingComplete ? `${theme.primary}20` : theme.secondary, 
                                color: linkingComplete ? theme.primary : theme.textLight 
                            }}>
                                {linkingComplete ? 'Complete' : 'Optional'}
                            </span>
                            {expandedSections.linking ? (
                                <CaretDown size={20} weight="duotone" style={{ color: theme.textLight }} />
                            ) : (
                                <CaretRight size={20} weight="duotone" style={{ color: theme.textLight }} />
                            )}
                        </div>
                    </button>

                    {/* Linking Content */}
                    <div 
                        className="transition-all duration-300 ease-in-out"
                        style={{
                            maxHeight: expandedSections.linking ? '2000px' : '0',
                            opacity: expandedSections.linking ? 1 : 0,
                            overflow: expandedSections.linking ? 'visible' : 'hidden'
                        }}
                    >
                        <div className="px-4 pb-4 pt-2 border-t space-y-3" style={{ borderColor: theme.border }}>
                            <div className="space-y-3">
                                {protocol.peptides.map((p, index) => {
                                    const peptideId = p.id || `peptide-${index}`;
                                    return (
                                        <PeptideLinkerRow
                                            key={peptideId}
                                            peptide={p}
                                            peptideId={peptideId}
                                            stockpile={stockpile}
                                            linkedVialId={linkedData[peptideId]?.status === 'linked' ? linkedData[peptideId].vialId : (linkedData[peptideId]?.status === 'skipped' ? 'skipped' : null)}
                                            onSelectVial={handleSelectVial}
                                            onSaveNew={handleSaveNewAndLink}
                                            onEditVial={handleEditVial}
                                            onSkip={handleSkipPeptide}
                                            onUnlink={handleUnlinkPeptide}
                                            theme={theme}
                                            isSinglePeptide={protocol.peptides.length === 1}
                                        />
                                    );
                                })}
                            </div>

                            {/* Demoted skip link — bottom of section, not a primary CTA */}
                            {!linkingComplete && (
                                <button
                                    type="button"
                                    onClick={handleSkipAllVials}
                                    className="w-full text-center text-xs py-2 hover:underline transition-opacity"
                                    style={{ color: theme.textLight, background: 'none', border: 'none' }}
                                >
                                    {protocol.peptides.length === 1 ? 'Skip linking and track manually' : 'Skip all and track manually'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* SECTION 2: Peptide Calculator (Accordion - Only if vials linked) */}
                {linkedPeptides.length > 0 && (
                    <div className="rounded-lg border" style={{ 
                        borderColor: reconComplete
                            ? `${theme.primary}60`
                            : reconSkipped
                                ? `${theme.textLight}40`
                                : theme.border,
                        backgroundColor: theme.cardBackground 
                    }}>
                        <button
                            type="button"
                            onClick={() => toggleSection('recon')}
                            className="w-full p-4 flex items-center justify-between hover:opacity-80 transition-opacity"
                        >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                                {reconComplete ? (
                                    <Check size={24} weight="duotone" style={{ color: theme.primary }} className="flex-shrink-0" />
                                ) : (
                                    <Flask size={24} weight="duotone" style={{ color: theme.primary }} className="flex-shrink-0" />
                                )}
                                <div className="flex flex-col gap-0.5 flex-1 text-left min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-base font-semibold" style={{ color: theme.text }}>
                                            Peptide Calculator
                                        </h4>
                                    </div>
                                    {!expandedSections.recon && !reconSkipped && (
                                        <span className="text-[10px] font-medium" style={{ color: theme.textLight }}>
                                            {reconComplete 
                                                ? `Calculated for ${linkedPeptides.length} vial(s)`
                                                : 'Calculate reconstitution & delivery, or skip'
                                            }
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 relative z-[1]">
                                {reconSkipped ? (
                                    <span
                                        className="inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider"
                                        style={{
                                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
                                            color: theme.textLight,
                                            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}`,
                                        }}
                                    >
                                        Skipped
                                    </span>
                                ) : (
                                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider" style={{ 
                                        backgroundColor: reconComplete ? `${theme.primary}20` : theme.secondary, 
                                        color: reconComplete ? theme.primary : theme.textLight 
                                    }}>
                                        {reconComplete ? 'Complete' : 'Choose'}
                                    </span>
                                )}
                                {expandedSections.recon ? (
                                    <CaretDown size={20} weight="duotone" style={{ color: theme.textLight }} />
                                ) : (
                                    <CaretRight size={20} weight="duotone" style={{ color: theme.textLight }} />
                                )}
                            </div>
                        </button>

                        {/* Recon Content */}
                        <div 
                            className="transition-all duration-300 ease-in-out"
                            style={{
                                maxHeight: expandedSections.recon ? '3000px' : '0',
                                opacity: expandedSections.recon ? 1 : 0,
                                overflow: expandedSections.recon ? 'visible' : 'hidden'
                            }}
                        >
                            <div className="px-4 pb-4 pt-2 border-t space-y-3" style={{ borderColor: theme.border }}>
                                {/* Skip Button at Top */}
                                <button
                                    onClick={() => {
                                        hasInteractedRef.current = true;
                                        setReconComplete(false);
                                        setReconSkipped(true);
                                        setExpandedSections(prev => ({ ...prev, recon: false, delivery: true }));
                                    }}
                                    className="w-full px-4 py-2 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                                    style={{ 
                                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : theme.secondary, 
                                        color: theme.text,
                                        border: `1px dashed ${theme.isDark ? 'rgba(255,255,255,0.12)' : theme.border}`
                                    }}
                                >
                                    <X size={14} weight="duotone" className="inline mr-1" />
                                    Skip - I'll do this later
                                </button>
                                
                                {/* Recon Strategy Selection (if needed) */}
                                {needsReconStrategy && !reconStrategy && (
                                    <div className="space-y-2">
                                        <p className="text-sm text-center italic" style={{ color: theme.textLight }}>
                                            You have multiple peptides. Mix them or keep separate?
                                        </p>
                                        <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { key: 'separate', name: 'Separately', icon: Stack, description: 'Individual vials' },
                                                { key: 'blended', name: 'Blended', icon: CirclesThree, description: 'Mixed together' }
                                            ].map(option => {
                                                const Icon = option.icon;
                                                return (
                                                    <button
                                                        key={option.key}
                                                        type="button"
                                                        onClick={() => setReconStrategy(option.key)}
                                                        className="flex flex-col items-center justify-center p-3 rounded-lg transition-all"
                                                        style={{
                                                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff',
                                                            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                                                            color: theme.text
                                                        }}
                                                    >
                                                        <Icon size={18} weight="duotone" />
                                                        <span className="text-xs font-medium mt-1">{option.name}</span>
                                                        <span className="text-xs opacity-60">{option.description}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Recon Calculator (if strategy selected or only one peptide) */}
                                {(reconStrategy || linkedPeptides.length === 1) && (
                                    <div className="mt-3">
                                        <ReconCalculatorPanel
                                            theme={theme}
                                            prefill={{
                                                peptides: linkedPeptides.map((p, index) => {
                                                    const peptideId = p.id || `peptide-${index}`;
                                                    const vialId = linkedData[peptideId]?.vialId;
                                                    const vial = stockpile.find(item => item.id === vialId);
                                                    if (!vial) return { id: peptideId, name: p.name, mg: '', dose: '', doseUnit: 'mcg', stockpileId: null, quantityUsed: 1 };
                                                    // Cost per vial: stockpile stores cost per priceUnit; when priceUnit is 'vial', use as-is
                                                    const vialPriceUnit = (vial.priceUnit || 'vial').toLowerCase();
                                                    const rawCost = Number(vial.cost) || 0;
                                                    const quantity = Number(vial.quantity) || 1;
                                                    const singleVialCost = (vialPriceUnit === 'vial') ? rawCost : (quantity > 0 ? rawCost / quantity : 0);
                                                    // Dose: use phase 1 (first titration) or fixed dosage; match unit (mcg, mg, IU, etc.)
                                                    const firstPhase = p.titration?.[0];
                                                    const doseAmount = firstPhase?.dose ?? p.dosage?.amount;
                                                    const doseUnit = (firstPhase?.doseUnit || p.dosage?.unit || 'mcg').trim() || 'mcg';
                                                    const doseStr = (doseAmount != null && doseAmount !== '') ? String(doseAmount) : '';
                                                    return {
                                                        id: peptideId, 
                                                        name: p.name, 
                                                        mg: vial.mg,
                                                        mgUnit: vial.mgUnit || 'mg',
                                                        dose: doseStr, 
                                                        doseUnit,
                                                        cost: singleVialCost, 
                                                        costPerMg: vial.costPerMg || '',
                                                        vendor: vial.vendor,
                                                        vendorId: vial.vendorId || null,
                                                        stockpileId: vial.id,
                                                        quantityUsed: 1,
                                                        unit: vial.unit,
                                                        orderId: vial.orderId || null,
                                                        documentation: vial.documentation || [],
                                                        capColor: vial.capColor || '',
                                                        penColor: skippedPeptideDeliveryMethods[peptideId]?.penColor || '',
                                                    };
                                                }),
                                                protocolName: protocol.protocolName,
                                                reconStrategy: reconStrategy || 'separate'
                                            }}
                                            noCard={true}
                                            reconStrategy={reconStrategy || 'separate'}
                                            allowRemovePeptide={false}
                                            allowAddPeptide={false}
                                            hideHeader={true}
                                            inlineVendorDate={true}
                                            onSave={(reconData) => {
                                                const newReconId = `recon-${generateId()}`;
                                                const peptidesWithDetails = reconData.peptides.map(p => {
                                                    const originalPrefill = linkedPeptides.find(lp => {
                                                        const lpId = lp.id || `peptide-${linkedPeptides.indexOf(lp)}`;
                                                        return lpId === p.id;
                                                    });
                                                    const peptideId = originalPrefill?.id || p.id;
                                                    const vial = stockpile.find(item => item.id === linkedData[peptideId]?.vialId);
                                                    const vialPriceUnit = vial ? (vial.priceUnit || 'vial').toLowerCase() : 'vial';
                                                    const rawCost = vial ? Number(vial.cost) || 0 : 0;
                                                    const quantity = vial ? Number(vial.quantity) || 1 : 1;
                                                    const cost = (vialPriceUnit === 'vial') ? rawCost : (quantity > 0 ? rawCost / quantity : 0);
                                                    return { 
                                                        ...p, 
                                                        cost, 
                                                        vendor: vial?.vendor || p.vendor || '', 
                                                        vendorId: vial?.vendorId || p.vendorId || null,
                                                        stockpileId: p.stockpileId || vial?.id || null,
                                                        quantityUsed: p.quantityUsed || 1
                                                    };
                                                });

                                                const reconDate = new Date().toISOString();
                                                // Match ReconCalculatorPanel: mg/dose live on peptides, not top-level form
                                                const totalMg = (peptidesWithDetails || []).reduce(
                                                    (sum, p) => sum + (Number(p.mg) || 0),
                                                    0
                                                );
                                                const firstPep = peptidesWithDetails?.[0] || {};
                                                const doseForCalc = firstPep.dose ?? reconData.dose;
                                                const doseUnitForCalc = firstPep.doseUnit || reconData.doseUnit || 'mcg';
                                                const reconCalc = calculateRecon({
                                                    mg: totalMg || Number(reconData.mg) || 0,
                                                    water: reconData.water,
                                                    dose: doseForCalc,
                                                    doseUnit: doseUnitForCalc,
                                                    iuConversionFactor: firstPep.iuConversionFactor || 0.001,
                                                });
                                                const unitsRounded = reconCalc.unitsPerDose > 0
                                                    ? Math.round(reconCalc.unitsPerDose)
                                                    : 0;
                                                const newReconItem = prepareItemForSave({ 
                                                    ...reconData,
                                                    mg: totalMg || reconData.mg,
                                                    dose: doseForCalc,
                                                    doseUnit: doseUnitForCalc,
                                                    id: newReconId, 
                                                    protocolId: protocol.id,
                                                    name: protocol.protocolName,
                                                    reconStrategy: reconStrategy || 'separate',
                                                    peptides: peptidesWithDetails,
                                                    date: reconDate,
                                                    dateAcquired: reconDate,
                                                    units: unitsRounded > 0 ? String(unitsRounded) : (reconData.units || ''),
                                                    unitsPerDose: reconCalc.unitsPerDose,
                                                    dosesPerVial: reconCalc.dosesPerVial,
                                                }, { isNew: true });

                                                // Persist via AppContext so ProtocolCard / calendar see units immediately
                                                // (localStorage-only writes get overwritten by stale reconItems state)
                                                if (typeof setReconItems === 'function') {
                                                    setReconItems(prev => [newReconItem, ...(Array.isArray(prev) ? prev : [])]);
                                                } else {
                                                    try {
                                                        const raw = localStorage.getItem('tpprover_recon_items');
                                                        const items = raw ? JSON.parse(raw) : [];
                                                        localStorage.setItem('tpprover_recon_items', JSON.stringify([newReconItem, ...items]));
                                                    } catch (e) { console.error("Failed to save new recon item", e); }
                                                }

                                                setSavedReconDose({
                                                    unitsPerDose: unitsRounded,
                                                    dose: doseForCalc,
                                                    doseUnit: doseUnitForCalc,
                                                });

                                                // Carry delivery from recon — don't ask again in Delivery Method section
                                                const reconDelivery = {
                                                    deliveryMethod: reconData.deliveryMethod || 'pipette',
                                                    administrationRoute: reconData.administrationRoute || 'subq',
                                                    penType: reconData.penType || '',
                                                    penColor: reconData.penColor || '',
                                                };
                                                setSkippedPeptideDeliveryMethods(prev => {
                                                    const next = { ...prev };
                                                    linkedPeptides.forEach((p, index) => {
                                                        const peptideId = p.id || `peptide-${index}`;
                                                        next[peptideId] = { ...reconDelivery };
                                                    });
                                                    return next;
                                                });

                                                adjustStockpileAfterRecon(peptidesWithDetails);

                                                let updatedLinkedData = { ...linkedData };
                                                linkedPeptides.forEach((p, index) => {
                                                    const peptideId = p.id || `peptide-${index}`;
                                                    updatedLinkedData[peptideId] = { ...updatedLinkedData[peptideId], reconId: newReconId };
                                                });
                                                setLinkedData(updatedLinkedData);
                                                hasInteractedRef.current = true;
                                                setReconComplete(true);
                                                setReconSkipped(false);
                                                setExpandedSections(prev => ({ ...prev, recon: false, delivery: true }));
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* SECTION 3: Delivery Method — only when recon was skipped (or for manual/skipped vials) */}
                {peptidesNeedingDelivery.length > 0 && (
                <div className="rounded-lg border" style={{ 
                    borderColor: deliveryComplete ? `${theme.primary}60` : theme.border,
                    backgroundColor: theme.cardBackground,
                    opacity: linkingComplete ? 1 : 0.5
                }}>
                    <button
                        type="button"
                        onClick={() => {
                            if (linkingComplete) {
                                toggleSection('delivery');
                            }
                        }}
                        disabled={!linkingComplete}
                        className="w-full p-4 flex items-center justify-between transition-opacity"
                        style={{
                            cursor: linkingComplete ? 'pointer' : 'not-allowed',
                            opacity: linkingComplete ? 1 : 0.5
                        }}
                    >
                            <div className="flex items-center gap-3 flex-1">
                                {deliveryComplete ? (
                                    <Check size={24} weight="duotone" style={{ color: theme.primary }} className="flex-shrink-0" />
                                ) : (
                                    <Drop size={24} weight="duotone" style={{ color: theme.primary }} className="flex-shrink-0" />
                                )}
                            <div className="flex flex-col gap-0.5 flex-1 text-left min-w-0">
                                <div className="flex items-center gap-2">
                                    <h4 className="text-base font-semibold" style={{ color: theme.text }}>
                                        Delivery Method
                                    </h4>
                                </div>
                                {!expandedSections.delivery && (
                                    <span className="text-[10px] font-medium" style={{ color: theme.textLight }}>
                                        {!linkingComplete 
                                            ? 'Complete vial linking first'
                                            : deliveryComplete 
                                                ? `${peptidesNeedingDelivery.length} peptide(s) configured`
                                                : reconComplete
                                                    ? `Set delivery for ${peptidesNeedingDelivery.length} manual peptide(s)`
                                                    : `Set delivery method (or reconstitute above)`
                                        }
                                    </span>
                                )}
                            </div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium uppercase tracking-wider" style={{ 
                                    backgroundColor: deliveryComplete ? `${theme.primary}20` : `${theme.primary}40`, 
                                    color: deliveryComplete ? theme.primary : theme.text 
                                }}>
                                    {deliveryComplete ? 'Complete' : 'Required'}
                                </span>
                                {expandedSections.delivery ? (
                                    <CaretDown size={20} weight="duotone" style={{ color: theme.textLight }} />
                                ) : (
                                    <CaretRight size={20} weight="duotone" style={{ color: theme.textLight }} />
                                )}
                            </div>
                        </button>

                        {/* Delivery Content */}
                        <div 
                            className="transition-all duration-300 ease-in-out"
                            style={{
                                maxHeight: expandedSections.delivery && linkingComplete ? '3000px' : '0',
                                opacity: expandedSections.delivery && linkingComplete ? 1 : 0,
                                overflow: expandedSections.delivery && linkingComplete ? 'visible' : 'hidden'
                            }}
                        >
                            <div className="px-4 pb-4 pt-2 border-t space-y-4" style={{ borderColor: theme.border }}>
                                {!linkingComplete ? (
                                    <p className="text-sm text-center italic mb-2" style={{ color: theme.textLight }}>
                                        Complete vial linking or skip all peptides to configure delivery methods
                                    </p>
                                ) : (
                                    peptidesNeedingDelivery.map(({ peptide: p, peptideId, status: linkStatus }) => {
                                    const deliveryData = skippedPeptideDeliveryMethods[peptideId] || {
                                        deliveryMethod: 'pipette',
                                        administrationRoute: 'subq',
                                        penType: '',
                                        penColor: ''
                                    };
                                    
                                    return (
                                        <div key={peptideId} className="p-3 rounded-xl space-y-3" style={{ 
                                            backgroundColor: theme.cardBackground || (theme.isDark ? 'transparent' : '#ffffff'),
                                            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'}`,
                                        }}>
                                            <h5 className="font-semibold text-sm pb-2 border-b flex items-center gap-2" style={{ color: theme.text, borderColor: theme.border }}>
                                                <span>{p.name}</span>
                                                {linkStatus === 'linked' && (
                                                    <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${theme.primary}20`, color: theme.primary }}>Linked</span>
                                                )}
                                                {linkStatus === 'skipped' && (
                                                    <span className="text-[9px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', color: theme.textLight }}>Manual</span>
                                                )}
                                            </h5>
                                            
                                            {/* Delivery Method Selection */}
                                            <div>
                                                <label className="block text-[10px] font-semibold uppercase tracking-[0.15em] opacity-50 mb-2" style={{ color: theme.text }}>
                                                    Delivery Method
                                                </label>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {[
                                                        { key: 'pipette', icon: Syringe, label: 'Syringe' },
                                                        { key: 'pen', icon: Pen, label: 'Pen' },
                                                        { key: 'nasal', icon: SprayBottle, label: 'Nasal' },
                                                        { key: 'topical', icon: Hand, label: 'Topical' }
                                                    ].map(method => {
                                                        const Icon = method.icon;
                                                        const isSelected = deliveryData.deliveryMethod === method.key;
                                                        return (
                                                            <button
                                                                key={method.key}
                                                                type="button"
                                                                onClick={() => {
                                                                    setSkippedPeptideDeliveryMethods(prev => ({
                                                                        ...prev,
                                                                        [peptideId]: {
                                                                            ...deliveryData,
                                                                            deliveryMethod: method.key
                                                                        }
                                                                    }));
                                                                }}
                                                                className="flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl transition-all active:scale-95"
                                                                style={{
                                                                    backgroundColor: isSelected
                                                                        ? '#3a5550'
                                                                        : (theme.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff'),
                                                                    color: isSelected ? '#fff' : theme.text,
                                                                    border: isSelected
                                                                        ? '1px solid #2f4541'
                                                                        : `1px solid ${theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
                                                                    boxShadow: isSelected
                                                                        ? '0 2px 8px rgba(58,85,80,0.35)'
                                                                        : 'none',
                                                                }}
                                                            >
                                                                <Icon size={18} weight="duotone" />
                                                                <span className="text-[11px] font-semibold">{method.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            
                                            {/* Administration Route for Syringe */}
                                            {deliveryData.deliveryMethod === 'pipette' && (() => {
                                                const routes = ['subq', 'im', 'iv'];
                                                const selectedIndex = Math.max(0, routes.indexOf(deliveryData.administrationRoute || 'subq'));
                                                return (
                                                <div>
                                                    <label className="block text-[10px] font-semibold uppercase tracking-[0.15em] opacity-50 mb-2" style={{ color: theme.text }}>
                                                        Route
                                                    </label>
                                                    <div
                                                        className="relative grid p-1 rounded-full"
                                                        style={{
                                                            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                                                            backgroundColor: theme.isDark
                                                                ? 'rgba(255,255,255,0.08)'
                                                                : 'rgba(47,59,58,0.09)',
                                                            boxShadow: theme.isDark
                                                                ? 'inset 0 2px 4px rgba(0,0,0,0.35)'
                                                                : 'inset 0 2px 5px rgba(47,59,58,0.12), 0 1px 0 rgba(255,255,255,0.7)',
                                                        }}
                                                    >
                                                        <div
                                                            className="absolute top-1 bottom-1 left-1 rounded-full pointer-events-none transition-transform duration-300 ease-out"
                                                            style={{
                                                                width: 'calc((100% - 8px) / 3)',
                                                                transform: `translateX(calc(${selectedIndex} * 100%))`,
                                                                backgroundColor: '#3a5550',
                                                                boxShadow: '0 2px 8px rgba(58,85,80,0.35)',
                                                            }}
                                                            aria-hidden
                                                        />
                                                        {routes.map((route) => {
                                                            const isSelected = deliveryData.administrationRoute === route;
                                                            return (
                                                                <button
                                                                    key={route}
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSkippedPeptideDeliveryMethods(prev => ({
                                                                            ...prev,
                                                                            [peptideId]: {
                                                                                ...deliveryData,
                                                                                administrationRoute: route
                                                                            }
                                                                        }));
                                                                    }}
                                                                    className="relative z-[1] py-2.5 rounded-full text-xs font-bold uppercase transition-colors active:scale-95"
                                                                    style={{
                                                                        color: isSelected ? '#fff' : (theme.isDark ? 'rgba(255,255,255,0.45)' : 'rgba(47,59,58,0.45)'),
                                                                        backgroundColor: 'transparent',
                                                                    }}
                                                                >
                                                                    {route.toUpperCase()}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                );
                                            })()}
                                            
                                            {/* Pen Details */}
                                            {deliveryData.deliveryMethod === 'pen' && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    {/* Pen Type */}
                                                    <div className="relative" ref={el => penTypeDropdownRefs.current[peptideId] = el}>
                                                        <label className="block text-[10px] font-black uppercase tracking-[0.15em] opacity-40 mb-2" style={{ color: theme.text }}>
                                                            Pen Type
                                                        </label>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPenTypeDropdownOpen(prev => ({
                                                    ...prev,
                                                    [peptideId]: !prev[peptideId]
                                                }));
                                            }}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onTouchStart={(e) => e.preventDefault()}
                                            className="w-full px-3 py-2 text-sm border rounded-lg flex items-center justify-between transition-all relative z-20 touch-manipulation"
                                            style={{
                                                borderColor: penTypeDropdownOpen[peptideId] ? theme.primary : theme.border,
                                                backgroundColor: theme.cardBackground,
                                                color: deliveryData.penType ? theme.text : theme.textLight
                                            }}
                                                        >
                                                            <span>
                                                                {deliveryData.penType ? (
                                                                    deliveryData.penType === 'bird-pen' ? 'Bird Pen' : 
                                                                    deliveryData.penType === 'v1' ? 'V1' : 
                                                                    deliveryData.penType === 'v2' ? 'V2' : 
                                                                    deliveryData.penType === 'v3' ? 'V3' : 
                                                                    deliveryData.penType.charAt(0).toUpperCase() + deliveryData.penType.slice(1)
                                                                ) : 'Select pen type'}
                                                            </span>
                                                            <CaretDown 
                                                                size={16}
                                                                weight="duotone"
                                                                className={`transition-transform duration-200 ${penTypeDropdownOpen[peptideId] ? 'rotate-180' : ''}`}
                                                                style={{ color: theme.textLight }}
                                                            />
                                                        </button>
                                                        {penTypeDropdownOpen[peptideId] && (
                                                            <div 
                                                                className="absolute z-[10003] left-0 right-0 bottom-full mb-1 rounded-lg shadow-lg border overflow-y-auto max-h-[min(50vh,17.5rem)]"
                                                                style={{
                                                                    backgroundColor: theme.isDark ? 'rgba(30,30,40,0.95)' : '#ffffff',
                                                                    borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : theme.border,
                                                                    boxShadow: '0 -10px 25px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.04)'
                                                                }}
                                                            >
                                                                {[
                                                                    { value: 'savvio', label: 'Savvio' },
                                                                    { value: 'novo', label: 'Novo' },
                                                                    { value: 'v1', label: 'V1' },
                                                                    { value: 'v2', label: 'V2' },
                                                                    { value: 'v3', label: 'V3' },
                                                                    { value: 'bird-pen', label: 'Bird Pen' },
                                                                    { value: 'luxura', label: 'Luxura' },
                                                                    { value: 'gansulin', label: 'Gansulin' },
                                                                    { value: 'other', label: 'Other' }
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
                                                                            onClick={(e) => {
                                                                                e.preventDefault();
                                                                                e.stopPropagation();
                                                                                setSkippedPeptideDeliveryMethods(prev => ({
                                                                                    ...prev,
                                                                                    [peptideId]: {
                                                                                        ...deliveryData,
                                                                                        penType: option.value
                                                                                    }
                                                                                }));
                                                                                setPenTypeDropdownOpen(prev => ({
                                                                                    ...prev,
                                                                                    [peptideId]: false
                                                                                }));
                                                                            }}
                                                                            className="w-full text-left px-3 py-2 text-sm transition-all"
                                                                            style={{
                                                                                color: deliveryData.penType === option.value ? theme.primary : theme.text,
                                                                                backgroundColor: 'transparent'
                                                                            }}
                                                                            onMouseEnter={(e) => {
                                                                                e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                                                                                e.currentTarget.style.color = theme.primary;
                                                                            }}
                                                                            onMouseLeave={(e) => {
                                                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                                                e.currentTarget.style.color = deliveryData.penType === option.value ? theme.primary : theme.text;
                                                                            }}
                                                                        >
                                                                            {option.label}
                                                                        </button>
                                                                    </React.Fragment>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Pen Color */}
                                                    <div>
                                                        <label className="block text-[10px] font-black uppercase tracking-[0.15em] opacity-40 mb-2" style={{ color: theme.text }}>
                                                            Pen Color
                                                        </label>
                                                        <ColorSwatchDropdown
                                                            value={penColors.find(p => p.name === deliveryData.penColor)?.hex || '#9ca3af'}
                                                            onChange={(hex) => {
                                                                const selectedColor = penColors.find(p => p.hex === hex);
                                                                if (selectedColor) {
                                                                    setSkippedPeptideDeliveryMethods(prev => ({
                                                                        ...prev,
                                                                        [peptideId]: {
                                                                            ...deliveryData,
                                                                            penColor: selectedColor.name
                                                                        }
                                                                    }));
                                                                }
                                                            }}
                                                            colors={penColors}
                                                            theme={theme}
                                                            placeholder="Select color"
                                                        />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </BottomSheet>
    );
}

