import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import BottomSheet from '../common/BottomSheet';
import TextInput from '../common/inputs/TextInput';
import {
    IconContext,
    PlusCircle,
    Lock,
    BookOpen,
    CalendarDots,
    ArrowsSplit,
    GitMerge,
    TestTube,
    CaretDown,
    CaretRight,
    Check,
    Spinner,
    Clock,
    FileText,
    MagnifyingGlass,
} from '@phosphor-icons/react';
import PeptideSubForm from './PeptideSubForm';


import SchedulingPreview from './SchedulingPreview';
import AutoSaveIndicator from '../common/AutoSaveIndicator';
import useAutoSave from '../../utils/useAutoSave';
import { generateId } from '../../utils/string';
import OwnerSelect from '../buddy/OwnerSelect';
import { OWNER_SELF } from '../../utils/buddies';
import {
    PURPOSE_ICON_OPTIONS,
    inferPurposeIconId,
    getPurposeIconComponent,
    PURPOSE_ICON_WEIGHT,
} from '../../utils/protocolPurposeIcons';
import { searchCommonProtocolNames } from '../../data/commonProtocolNames';

/** Header display only — keeps stored protocol name unchanged in the form. */
function titleWithoutEmoji(text) {
    if (!text || typeof text !== 'string') return text;
    try {
        const cleaned = text.replace(/\p{Extended_Pictographic}/gu, '').replace(/\uFE0F/g, '').replace(/\s{2,}/g, ' ').trim();
        return cleaned || text;
    } catch {
        return text;
    }
}

const EDITOR_SECTION_ORDER = ['info', 'peptides', 'duration', 'notes'];

/**
 * Accordion card — defined at module level so React never remounts it on parent re-render,
 * which would steal focus from any focused child input.
 */
function AccordionCard({
    sectionKey,
    icon: Icon,
    title,
    subtitle,
    children,
    optional,
    expandedSections,
    toggleSection,
    theme,
    isComplete = false,
    summary = '',
    isCreate = false,
    onNext,
    isLastSection = false,
}) {
    const isOpen = expandedSections.has(sectionKey);
    const optionalPillBg = theme.isDark ? theme.primary + '25' : theme.primary + '12';
    const optionalPillText = theme.primary;
    const showSummary = !isOpen && isComplete && !!summary;
    return (
        <div
            className="rounded-lg border"
            style={{
                borderColor: isComplete ? `${theme.primary}60` : theme.border,
                backgroundColor: theme.cardBackground,
            }}
        >
            <button
                type="button"
                onClick={() => toggleSection(sectionKey)}
                className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
            >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                    {isComplete && !isOpen ? (
                        <Check size={24} weight="duotone" style={{ color: theme.primary }} className="flex-shrink-0" />
                    ) : (
                        <Icon size={24} style={{ color: theme.primary }} className="flex-shrink-0" />
                    )}
                    <div className="flex flex-col gap-0.5 text-left min-w-0">
                        <div className="flex items-center gap-2">
                            <h4 className="text-base font-semibold" style={{ color: theme.text }}>{title}</h4>
                            {optional && (
                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full" style={{ color: optionalPillText, backgroundColor: optionalPillBg }}>opt</span>
                            )}
                        </div>
                        {showSummary ? (
                            <span className="text-[10px] font-medium truncate" style={{ color: theme.textLight }}>{summary}</span>
                        ) : subtitle ? (
                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>{subtitle}</span>
                        ) : null}
                    </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                    {isOpen
                        ? <CaretDown size={22} style={{ color: theme.textLight }} />
                        : <CaretRight size={22} style={{ color: theme.textLight }} />}
                </div>
            </button>
            <div
                className="grid transition-[grid-template-rows,opacity] duration-300 ease-out"
                style={{
                    gridTemplateRows: isOpen ? '1fr' : '0fr',
                    opacity: isOpen ? 1 : 0,
                }}
            >
                <div className="overflow-hidden min-h-0">
                <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: theme.border }}>
                    {children}
                    {isCreate && isOpen && !isLastSection && typeof onNext === 'function' && (
                        <div className="mt-3 pt-3 border-t" style={{ borderColor: theme.border }}>
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onNext();
                                }}
                                className="w-full py-2.5 rounded-lg text-sm font-semibold uppercase tracking-wider transition-all active:scale-[0.99]"
                                style={{
                                    backgroundColor: theme.primary,
                                    color: theme.textOnPrimary || '#ffffff',
                                }}
                            >
                                Next
                            </button>
                        </div>
                    )}
                </div>
                </div>
            </div>
        </div>
    );
}

export default function ProtocolEditorModal({ open, onClose, onSave, onDelete, theme, protocol, isReadOnly = false, onUpgrade, embedded = false }) {

    const createEmpty = () => ({
        protocolName: '',
        purpose: '',
        protocolType: 'separate', // 'separate' | 'blended'
        peptides: [{ id: generateId(), frequency: { type: 'daily', time: ['AM'] }, unitValue: '', halfLife: { value: '', unit: 'hours' } }],
        duration: { count: '', unit: 'weeks', noEnd: false },
        washout: { enabled: false, duration: '', unit: 'weeks' },
        notes: '',
        ownerId: OWNER_SELF,
        purposeIcon: '',
    });

    const [form, setForm] = useState(createEmpty);
    const formRef = useRef(form);
    formRef.current = form; // Always have latest for embedded save
    const [isSavingToProtocols, setIsSavingToProtocols] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [isDurationFocused, setIsDurationFocused] = useState(false);
    const [isWashoutFocused, setIsWashoutFocused] = useState(false);
    const [isDurationUnitDropdownOpen, setIsDurationUnitDropdownOpen] = useState(false);
    const [isWashoutUnitDropdownOpen, setIsWashoutUnitDropdownOpen] = useState(false);
    // Accordion state: track which peptides are expanded
    const [expandedPeptides, setExpandedPeptides] = useState(new Set()); // Will be set in useEffect
    /** Which accordion sections are expanded. New protocols start with 'info' open. */
    const [expandedSections, setExpandedSections] = useState(new Set(['info']));
    const isCreateMode = !protocol?.id;
    const toggleSection = (key) => setExpandedSections(prev => {
        const next = new Set(prev);
        next.has(key) ? next.delete(key) : next.add(key);
        return next;
    });
    const advanceSection = useCallback((currentKey) => {
        const idx = EDITOR_SECTION_ORDER.indexOf(currentKey);
        if (idx < 0) return;
        const nextKey = EDITOR_SECTION_ORDER[idx + 1];
        setExpandedSections(() => {
            const next = new Set();
            if (nextKey) next.add(nextKey);
            return next;
        });
    }, []);

    const sectionComplete = useMemo(() => {
        const peptides = form.peptides || [];
        const namedWithDose = peptides.length > 0 && peptides.every((p) => {
            const nameOk = !!(p.name || '').trim();
            const amount = p.dosage?.amount ?? p.dose ?? p.titration?.[0]?.dose;
            const doseOk = amount != null && String(amount).trim() !== '';
            return nameOk && doseOk;
        });
        return {
            info: !!(form.protocolName || '').trim(),
            peptides: namedWithDose,
            duration: true,
            notes: true,
        };
    }, [form.protocolName, form.peptides]);

    const sectionSummaries = useMemo(() => {
        const name = titleWithoutEmoji((form.protocolName || '').trim());
        const purpose = (form.purpose || '').trim();
        const infoParts = [name, purpose].filter(Boolean);
        const peptideNames = (form.peptides || [])
            .map((p) => (p.name || '').trim())
            .filter(Boolean);
        let peptidesSummary = '';
        if (peptideNames.length === 0) {
            peptidesSummary = '';
        } else if (peptideNames.length === 1) {
            peptidesSummary = peptideNames[0];
        } else {
            peptidesSummary = `${peptideNames.length} peptides — ${peptideNames.join(', ')}`;
        }
        let durationSummary = 'Ongoing';
        if (form.duration?.noEnd) {
            durationSummary = 'Ongoing';
        } else if (form.duration?.count) {
            const unit = form.duration.unit || 'weeks';
            durationSummary = `${form.duration.count} ${unit}`;
        } else {
            durationSummary = '(not set)';
        }
        const notesRaw = (form.notes || '').trim();
        const notesSummary = notesRaw
            ? (notesRaw.length > 40 ? `${notesRaw.slice(0, 40)}…` : notesRaw)
            : '(none)';
        return {
            info: infoParts.join(' · '),
            peptides: peptidesSummary,
            duration: durationSummary,
            notes: notesSummary,
        };
    }, [form.protocolName, form.purpose, form.peptides, form.duration, form.notes]);

    /** When true, purpose icon id follows keyword inference from Purpose / Goal. */
    const [purposeIconFollowsGoal, setPurposeIconFollowsGoal] = useState(true);
    const [purposeIconMenuOpen, setPurposeIconMenuOpen] = useState(false);
    const [showProtocolNameSuggestions, setShowProtocolNameSuggestions] = useState(false);
    const [protocolNamePlacement, setProtocolNamePlacement] = useState(null);
    const protocolNameAnchorRef = useRef(null);
    const protocolNamePortalRef = useRef(null);

    const protocolNameQuery = String(form.protocolName || '').trim();
    const protocolNameSuggestions = useMemo(
        () => (showProtocolNameSuggestions && protocolNameQuery
            ? searchCommonProtocolNames(protocolNameQuery, 10)
            : []),
        [protocolNameQuery, showProtocolNameSuggestions]
    );
    const [purposeMenuPlacement, setPurposeMenuPlacement] = useState(null);
    const purposeIconAnchorRef = useRef(null);
    const purposeMenuPortalRef = useRef(null);
    const [durationUnitPlacement, setDurationUnitPlacement] = useState(null);
    const [washoutUnitPlacement, setWashoutUnitPlacement] = useState(null);
    const durationUnitAnchorRef = useRef(null);
    const washoutUnitAnchorRef = useRef(null);
    const durationUnitPortalRef = useRef(null);
    const washoutUnitPortalRef = useRef(null);
    /** Latest protocol prop without re-running hydration when only the object reference changes (fixes focus loss while typing). */
    const protocolLatestRef = useRef(protocol);
    protocolLatestRef.current = protocol;
    const protocolHydrateKey = open
        ? `${embedded ? 'emb' : 'sheet'}:${protocol?.id ?? 'new'}`
        : null;
    const terracottaGradient = 'linear-gradient(135deg, #c87a5c 0%, #b5684a 100%)';
    const terracottaHoverGradient = 'linear-gradient(135deg, #b5684a 0%, #a35a3f 100%)';
    
    // Auto-save functionality with protocol persistence
    // When embedded, use separate key so we never load stale draft (parent owns the data)
    const storageKey = embedded
        ? `tpprover_protocol_draft_embedded_${protocol?.id || 'new'}`
        : `tpprover_protocol_draft_${protocol?.id || 'new'}`;
    const { isSaving, lastSaved, clearSavedData, markAsSubmitted } = useAutoSave(
        storageKey, 
        form, 
        setForm, 
        2000, // 2 second delay
        async (formData) => {
            // Auto-save to protocols list if there's meaningful data
            const hasProtocolName = formData?.protocolName && formData.protocolName.trim().length > 0;
            const hasPeptides = formData?.peptides && formData.peptides.length > 0 && 
                formData.peptides.some(p => p.name && p.name.trim().length > 0);
            const hasNotes = formData?.notes && formData.notes.trim().length > 0;
            
            if (formData && (hasProtocolName || hasPeptides || hasNotes)) {
                try {
                    if (protocol?.id) {
                        // Event is dispatched by useAutoSave hook automatically for existing protocols
                    } else {
                        // For new protocols, we don't auto-save to the protocols list yet
                        // Just keep the localStorage draft for now
                    }
                } catch (error) {
                    console.warn('Auto-save to protocols failed:', error);
                }
            } else {
                // Insufficient data for auto-save - skip
            }
        }
    );
    

    useEffect(() => {
        if (!protocolHydrateKey) return;

        const protocolSource = protocolLatestRef.current;

        // IMPORTANT: Clear any stale localStorage draft when loading fresh protocol data
        // This prevents old drafts from overwriting updated protocol data
        if (protocolSource?.id) {
            try {
                localStorage.removeItem(`tpprover_protocol_draft_${protocolSource.id}`);
                if (embedded) localStorage.removeItem(`tpprover_protocol_draft_embedded_${protocolSource.id}`);
            } catch (e) {
                console.warn('Failed to clear stale draft:', e);
            }
        }

        let initialData = protocolSource ? { ...createEmpty(), ...protocolSource } : createEmpty();
        
        // Migration: protocol may use legacy 'name' instead of 'protocolName'
        if (initialData.name && !initialData.protocolName) {
            initialData.protocolName = initialData.name;
        }
        
        // Clean duration data on load to prevent corruption
        if (initialData.duration && initialData.duration.count !== '') {
            // Keep it simple - just ensure it's a string for the input
            initialData.duration.count = String(initialData.duration.count);
        }

        // Migration logic for old single-peptide protocols
        if (initialData.name && (!initialData.peptides || initialData.peptides.length === 0)) {
            const legacyPeptide = {
                id: initialData.id || Date.now(),
                name: initialData.name,
                dosage: initialData.dosage,
                frequency: initialData.frequency || { type: 'daily', time: ['AM'] },
                titration: initialData.titration,
            };
            initialData.peptides = [legacyPeptide];

            // Clean up old top-level fields
            delete initialData.name;
            delete initialData.dosage;
            delete initialData.frequency;
            delete initialData.titration;
        }

        if (!initialData.peptides || initialData.peptides.length === 0) {
            initialData.peptides = [{ id: generateId(), frequency: { type: 'daily', time: ['AM'] }, unitValue: '', halfLife: { value: '', unit: 'hours' } }];
        }

        // Map blendMode to protocolType for form state
        if (initialData.blendMode) {
            initialData.protocolType = initialData.blendMode;
        }
        
        // Auto-set to 'separate' if only 1 peptide (can't be blended with just one)
        if (initialData.peptides && initialData.peptides.length === 1) {
            initialData.protocolType = 'separate';
        }

        // If it's a blended protocol, ensure sharedFrequency exists and all peptides have it
        if (initialData.blendMode === 'blended' && initialData.peptides.length > 0) {
            const firstFreq = initialData.peptides[0].frequency;
            const shared = firstFreq && (firstFreq.type || firstFreq.time) 
                ? firstFreq 
                : { type: 'daily', time: ['AM'] };
            initialData.sharedFrequency = shared;
            initialData.peptides = initialData.peptides.map(p => ({
                ...p,
                frequency: shared
            }));
        }


        // Normalize units for editor display (Day/Week/Month) and hydrate washout.duration from count
        const toEditorUnit = (u) => {
            const s = String(u || '').toLowerCase();
            if (s.includes('day')) return 'Day';
            if (s.includes('week')) return 'Week';
            if (s.includes('month')) return 'Month';
            return 'Week';
        };
        try {
            initialData.duration = initialData.duration || {};
            if (initialData.duration.unit) {
                initialData.duration.unit = toEditorUnit(initialData.duration.unit);
            } else {
                initialData.duration.unit = 'Week';
            }
            // Ensure duration.count is always a string (never undefined)
            if (initialData.duration.count === undefined || initialData.duration.count === null) {
                initialData.duration.count = '';
            } else {
                initialData.duration.count = String(initialData.duration.count);
            }
            // Ensure duration.noEnd is always a boolean
            if (initialData.duration.noEnd === undefined || initialData.duration.noEnd === null) {
                initialData.duration.noEnd = false;
            }
            
            initialData.washout = initialData.washout || {};
            if (initialData.washout.unit) {
                initialData.washout.unit = toEditorUnit(initialData.washout.unit);
            }
            // Ensure washout.duration is always a string (never undefined)
            if (initialData.washout.duration === undefined || initialData.washout.duration === null) {
                initialData.washout.duration = '';
            } else {
                initialData.washout.duration = String(initialData.washout.duration);
            }
            // Ensure washout.enabled is always a boolean
            if (initialData.washout.enabled === undefined || initialData.washout.enabled === null) {
                initialData.washout.enabled = false;
            }
            if (initialData.washout.enabled && initialData.washout.duration === '' && (initialData.washout.count != null && initialData.washout.count !== '')) {
                initialData.washout.duration = String(initialData.washout.count);
            }
        } catch {}
        
        // Normalize peptide data to ensure all input values are defined
        if (initialData.peptides && Array.isArray(initialData.peptides)) {
            initialData.peptides = initialData.peptides.map(peptide => {
                const normalized = { ...peptide };
                // Preserve peptide name (ensure we don't lose it from legacy or alternate structures)
                if (!normalized.name && peptide.name) normalized.name = peptide.name;
                // Migrate legacy scalar dosage to { amount, unit } format
                if (normalized.dosage !== undefined && normalized.dosage !== null) {
                    if (typeof normalized.dosage === 'number' || typeof normalized.dosage === 'string') {
                        normalized.dosage = { amount: String(normalized.dosage), unit: 'mcg' };
                    } else if (normalized.dosage && typeof normalized.dosage === 'object') {
                        normalized.dosage = {
                            amount: normalized.dosage.amount !== undefined && normalized.dosage.amount !== null ? String(normalized.dosage.amount) : '',
                            unit: normalized.dosage.unit || 'mcg'
                        };
                    }
                }
                // Ensure unitValue is always a string
                if (normalized.unitValue === undefined || normalized.unitValue === null) {
                    normalized.unitValue = '';
                }
                // Normalize frequency.time to ensure it's always a valid array
                // Preserve user's selection (AM or PM) - don't force default to AM
                if (normalized.frequency) {
                    if (!normalized.frequency.time || !Array.isArray(normalized.frequency.time) || normalized.frequency.time.length === 0) {
                        // Only default to AM if time is completely missing
                        normalized.frequency.time = ['AM'];
                    } else {
                        // Ensure time array only contains valid values (AM or PM)
                        normalized.frequency.time = normalized.frequency.time.filter(t => t === 'AM' || t === 'PM');
                        // If filtering removed all values, default to AM
                        if (normalized.frequency.time.length === 0) {
                            normalized.frequency.time = ['AM'];
                        }
                    }
                }
                // Ensure halfLife is always a valid object
                if (!normalized.halfLife || typeof normalized.halfLife !== 'object') {
                    normalized.halfLife = { value: '', unit: 'hours' };
                } else {
                    normalized.halfLife = {
                        value: normalized.halfLife.value !== undefined && normalized.halfLife.value !== null ? String(normalized.halfLife.value) : '',
                        unit: normalized.halfLife.unit || 'hours'
                    };
                }
                // Normalize titration steps
                if (normalized.titration && Array.isArray(normalized.titration)) {
                    normalized.titration = normalized.titration.map(step => ({
                        ...step,
                        dose: step.dose === undefined || step.dose === null ? '' : String(step.dose),
                        durationCount: step.durationCount === undefined || step.durationCount === null ? '' : String(step.durationCount),
                        doseUnit: step.doseUnit || 'mcg',
                        durationUnit: step.durationUnit || 'days'
                    }));
                }
                return normalized;
            });
        }
        
        const inferFromPurposeInit = inferPurposeIconId(initialData.purpose || '');
        if (!initialData.purposeIcon || !PURPOSE_ICON_OPTIONS.some(o => o.id === initialData.purposeIcon)) {
            initialData.purposeIcon = inferFromPurposeInit || 'research';
        }
        const iconFollowsPurpose =
            !inferFromPurposeInit || initialData.purposeIcon === inferFromPurposeInit;

        // DEBUG: Log what's being loaded into the form
        console.log('🔴 FORM INIT - peptides frequency:', initialData.peptides?.map(p => ({ name: p.name, time: p.frequency?.time })));
        
        setForm(initialData);
        setShowProtocolNameSuggestions(false);
        setProtocolNamePlacement(null);
        setPurposeIconFollowsGoal(iconFollowsPurpose);
        setPurposeIconMenuOpen(false);
        setPurposeMenuPlacement(null);
        
        // Initialize expanded peptides - collapse all by default
        // This applies to both new protocols and existing protocols being edited
        setExpandedPeptides(new Set()); // All peptides collapsed by default
        // New protocols → open the first section so user knows where to start
        if (!embedded) setExpandedSections(protocolSource?.id ? new Set() : new Set(['info']));
    }, [protocolHydrateKey, embedded]);

    useEffect(() => {
        if (!open || !purposeIconFollowsGoal) return undefined;
        const inferred = inferPurposeIconId(form.purpose || '');
        if (!inferred) return undefined;
        const t = window.setTimeout(() => {
            setForm((prev) => (prev.purposeIcon === inferred ? prev : { ...prev, purposeIcon: inferred }));
        }, 280);
        return () => window.clearTimeout(t);
    }, [open, purposeIconFollowsGoal, form.purpose]);

    useEffect(() => {
        if (!open) {
            setPurposeIconMenuOpen(false);
            setPurposeMenuPlacement(null);
        }
    }, [open]);

    const togglePurposeIconMenu = useCallback(() => {
        setPurposeIconMenuOpen((prev) => {
            if (prev) {
                setPurposeMenuPlacement(null);
                return false;
            }
            const anchor = purposeIconAnchorRef.current;
            if (anchor && typeof window !== 'undefined') {
                const r = anchor.getBoundingClientRect();
                setPurposeMenuPlacement({
                    top: r.bottom + 6,
                    right: Math.max(8, window.innerWidth - r.right),
                    width: Math.min(260, Math.max(168, window.innerWidth - 16)),
                });
            }
            return true;
        });
    }, []);

    useLayoutEffect(() => {
        if (!purposeIconMenuOpen || !purposeIconAnchorRef.current) return undefined;
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

    useEffect(() => {
        if (!purposeIconMenuOpen) return undefined;
        const onDocMouseDown = (e) => {
            if (purposeIconAnchorRef.current?.contains(e.target)) return;
            if (purposeMenuPortalRef.current?.contains(e.target)) return;
            setPurposeIconMenuOpen(false);
            setPurposeMenuPlacement(null);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [purposeIconMenuOpen]);

    // Position + outside-click for the Duration / Washout unit dropdowns.
    // Portaled to document.body so the panel isn't clipped by the AccordionCard's overflow-hidden.
    useLayoutEffect(() => {
        if (!isDurationUnitDropdownOpen || !durationUnitAnchorRef.current) {
            setDurationUnitPlacement(null);
            return undefined;
        }
        const anchor = durationUnitAnchorRef.current;
        const sync = () => {
            const r = anchor.getBoundingClientRect();
            setDurationUnitPlacement({
                top: r.bottom + 4,
                right: Math.max(8, window.innerWidth - r.right),
                minWidth: Math.max(100, r.width),
            });
        };
        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('scroll', sync, true);
        };
    }, [isDurationUnitDropdownOpen]);

    useLayoutEffect(() => {
        if (!isWashoutUnitDropdownOpen || !washoutUnitAnchorRef.current) {
            setWashoutUnitPlacement(null);
            return undefined;
        }
        const anchor = washoutUnitAnchorRef.current;
        const sync = () => {
            const r = anchor.getBoundingClientRect();
            setWashoutUnitPlacement({
                top: r.bottom + 4,
                right: Math.max(8, window.innerWidth - r.right),
                minWidth: Math.max(100, r.width),
            });
        };
        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('scroll', sync, true);
        };
    }, [isWashoutUnitDropdownOpen]);

    useEffect(() => {
        if (!isDurationUnitDropdownOpen) return undefined;
        const onDocMouseDown = (e) => {
            if (durationUnitAnchorRef.current?.contains(e.target)) return;
            if (durationUnitPortalRef.current?.contains(e.target)) return;
            setIsDurationUnitDropdownOpen(false);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [isDurationUnitDropdownOpen]);

    useEffect(() => {
        if (!isWashoutUnitDropdownOpen) return undefined;
        const onDocMouseDown = (e) => {
            if (washoutUnitAnchorRef.current?.contains(e.target)) return;
            if (washoutUnitPortalRef.current?.contains(e.target)) return;
            setIsWashoutUnitDropdownOpen(false);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [isWashoutUnitDropdownOpen]);

    // Protocol name suggestions — portaled so AccordionCard overflow doesn't clip them
    const showProtocolNameMenu =
        showProtocolNameSuggestions &&
        protocolNameSuggestions.length > 0 &&
        !isReadOnly;

    useLayoutEffect(() => {
        if (!showProtocolNameMenu || !protocolNameAnchorRef.current) {
            setProtocolNamePlacement(null);
            return undefined;
        }
        const anchor = protocolNameAnchorRef.current;
        const sync = () => {
            const r = anchor.getBoundingClientRect();
            setProtocolNamePlacement({
                top: r.bottom + 4,
                left: r.left,
                width: r.width,
            });
        };
        sync();
        window.addEventListener('resize', sync);
        window.addEventListener('scroll', sync, true);
        return () => {
            window.removeEventListener('resize', sync);
            window.removeEventListener('scroll', sync, true);
        };
    }, [showProtocolNameMenu, protocolNameQuery, protocolNameSuggestions.length]);

    useEffect(() => {
        if (!showProtocolNameMenu) return undefined;
        const onDocMouseDown = (e) => {
            if (protocolNameAnchorRef.current?.contains(e.target)) return;
            if (protocolNamePortalRef.current?.contains(e.target)) return;
            setShowProtocolNameSuggestions(false);
        };
        document.addEventListener('mousedown', onDocMouseDown);
        return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [showProtocolNameMenu]);
    
    const handleChange = (field, value) => {
        if (field === 'protocolName') {
            const typed = String(value || '').trim();
            setShowProtocolNameSuggestions(typed.length > 0);
        }
        setForm(prev => {
            const newState = { ...prev, [field]: value };
            if (field === 'protocolName') {
                const newPeptides = [...(prev.peptides || [])];
                if (newPeptides.length > 0) {
                    newPeptides[0] = { ...newPeptides[0], name: value };
                    newState.peptides = newPeptides;
                }
            }
            
            if (field === 'protocolType' && value === 'blended' && prev.peptides && prev.peptides.length > 0) {
                newState.sharedFrequency = prev.peptides[0].frequency || { type: 'daily', time: ['AM'] };
                newState.peptides = newState.peptides.map(p => ({
                    ...p,
                    frequency: newState.sharedFrequency
                }));
            }
            
            return newState;
        });
    };

    const handlePeptideChange = (index, updatedPeptide) => {
        setForm(prev => {
            const newPeptides = [...(prev.peptides || [])];
            newPeptides[index] = updatedPeptide;
            const newState = { ...prev, peptides: newPeptides };
            
            if (prev.protocolType === 'blended' && index === 0 && updatedPeptide.frequency) {
                newState.sharedFrequency = updatedPeptide.frequency;
                newState.peptides = newState.peptides.map((p, i) => 
                    i === 0 ? p : { ...p, frequency: updatedPeptide.frequency }
                );
            }
            
            return newState;
        });
    };

    const handleSharedFrequencyChange = (field, value) => {
        setForm(prev => {
            const base = prev.sharedFrequency || { type: 'daily', time: ['AM'] };
            let newFreq = { ...base, [field]: value };
            if (field === 'type') {
                if (value !== 'weekly') newFreq.days = [];
                if (value !== 'cycle') { newFreq.onDays = ''; newFreq.offDays = ''; }
                if (!newFreq.time?.length) newFreq.time = ['AM'];
            }
            if (field === 'time' && (!Array.isArray(newFreq.time) || newFreq.time.length === 0)) {
                newFreq.time = ['AM'];
            }
            const newState = { ...prev, sharedFrequency: newFreq };
            newState.peptides = newState.peptides.map(p => ({ ...p, frequency: newFreq }));
            return newState;
        });
    };

    const handleSharedFrequencyTimeToggle = (t) => {
        setForm(prev => {
            const base = prev.sharedFrequency || { type: 'daily', time: ['AM'] };
            const current = Array.isArray(base.time) && base.time.length > 0 ? base.time : ['AM'];
            const next = current.includes(t) ? current.filter(x => x !== t) : [...current, t];
            const newTime = next.length === 0 ? (t === 'AM' ? ['PM'] : ['AM']) : next;
            const newFreq = { ...base, time: newTime };
            const newState = { ...prev, sharedFrequency: newFreq };
            newState.peptides = newState.peptides.map(p => ({ ...p, frequency: newFreq }));
            return newState;
        });
    };

    const handleSharedFrequencyToggleDay = (day) => {
        const dayMap = { 'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu', 'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun' };
        const norm = (d) => dayMap[d] || d;
        setForm(prev => {
            const base = prev.sharedFrequency || { type: 'weekly', time: ['AM'], days: [] };
            const current = (base.days || []).map(norm);
            const newDays = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
            const newFreq = { ...base, type: 'weekly', days: newDays };
            if (!newFreq.time?.length) newFreq.time = ['AM'];
            const newState = { ...prev, sharedFrequency: newFreq };
            newState.peptides = newState.peptides.map(p => ({ ...p, frequency: newFreq }));
            return newState;
        });
    };

    const addPeptide = () => {
        setForm(prev => {
            let newPeptideFrequency = { type: 'daily', time: ['AM'] };
            if (prev.protocolType === 'blended' && prev.peptides && prev.peptides.length > 0) {
                newPeptideFrequency = prev.sharedFrequency || prev.peptides[0].frequency || { type: 'daily', time: ['AM'] };
            }
            
            const newState = {
                ...prev,
                peptides: [...(prev.peptides || []), { id: generateId(), frequency: newPeptideFrequency, unitValue: '', halfLife: { value: '', unit: 'hours' } }]
            };
            
            if (newState.peptides.length === 1) {
                newState.protocolType = 'separate';
            }
            
            const newIndex = newState.peptides.length - 1;
            setExpandedPeptides(prev => new Set([...prev, newIndex]));
            
            return newState;
        });
    };

    const togglePeptideExpanded = (index) => {
        setExpandedPeptides(prev => {
            const newSet = new Set(prev);
            if (newSet.has(index)) {
                newSet.delete(index);
            } else {
                newSet.add(index);
            }
            return newSet;
        });
    };

    const removePeptide = (index) => {
        setForm(prev => {
            const newState = {
                ...prev,
                peptides: prev.peptides.filter((_, i) => i !== index)
            };
            
            if (newState.peptides.length === 1) {
                newState.protocolType = 'separate';
            }
            
            setExpandedPeptides(prevExpanded => {
                const newExpanded = new Set();
                prevExpanded.forEach(expandedIndex => {
                    if (expandedIndex < index) {
                        newExpanded.add(expandedIndex);
                    } else if (expandedIndex > index) {
                        newExpanded.add(expandedIndex - 1);
                    }
                });
                if (newExpanded.size === 0 && newState.peptides.length > 0) {
                    newExpanded.add(0);
                }
                return newExpanded;
            });
            
            return newState;
        });
    };

    const handleDurationChange = (field, value) => {
        setForm(prev => {
            const processedValue = field === 'count' ? String(value) : value;
            return {
                ...prev,
                duration: { ...prev.duration, [field]: processedValue }
            };
        });
    };

    const handleWashoutChange = (field, value) => {
        setForm(prev => ({
            ...prev,
            washout: { ...prev.washout, [field]: value }
        }));
    };

    const handleFinalSave = async () => {
        if (isReadOnly) {
            if (onUpgrade) {
                onUpgrade();
            }
            return;
        }
        try {
            setIsSavingToProtocols(true);
            setSaveError(null);
            
            const fromEditorUnit = (u) => {
                const s = String(u || '').toLowerCase();
                if (s.includes('day')) return 'day';
                if (s.includes('week')) return 'week';
                if (s.includes('month')) return 'month';
                return s || 'week';
            };
            // Use formRef when embedded to avoid stale closure (listener captures initial form)
            const formToSave = embedded ? formRef.current : form;
            const finalForm = { ...formToSave };

            {
                const pid = finalForm.purposeIcon;
                const validPid = pid && PURPOSE_ICON_OPTIONS.some((o) => o.id === pid);
                finalForm.purposeIcon = validPid ? pid : (inferPurposeIconId(finalForm.purpose || '') || 'research');
            }

            // Map protocolType to blendMode for consistency with rest of app
            finalForm.blendMode = finalForm.protocolType;

            // If blended, sync the shared frequency back to all peptides
            if (finalForm.blendMode === 'blended') {
                finalForm.peptides = finalForm.peptides.map(p => ({
                    ...p,
                    frequency: finalForm.sharedFrequency
                }));
            }
            
            // Ensure dosage units match delivery method
            finalForm.peptides = finalForm.peptides.map(p => {
                const deliveryMethod = p.deliveryMethod || 'pipette';
                const dosage = p.dosage || { amount: '', unit: 'mcg' };
                
                // If delivery method is syringe/pen but unit is sprays, default to mcg
                if ((deliveryMethod === 'pipette' || deliveryMethod === 'pen') && dosage.unit === 'sprays') {
                    return {
                        ...p,
                        dosage: { ...dosage, unit: 'mcg' }
                    };
                }
                // If delivery method is nasal but unit is not sprays, default to sprays
                if (deliveryMethod === 'nasal' && dosage.unit !== 'sprays') {
                    return {
                        ...p,
                        dosage: { ...dosage, unit: 'sprays' }
                    };
                }
                // If no unit is set and delivery method is syringe/pen, default to mcg
                if ((deliveryMethod === 'pipette' || deliveryMethod === 'pen') && !dosage.unit) {
                    return {
                        ...p,
                        dosage: { ...dosage, unit: 'mcg' }
                    };
                }
                return p;
            });

            if (finalForm.duration) {
                // Validate duration count
                let cleanCount = finalForm.duration.count;
                if (!finalForm.duration.noEnd && cleanCount !== '') {
                    const numValue = parseFloat(cleanCount);
                    if (isNaN(numValue) || numValue <= 0 || numValue > 999) {
                        setSaveError('Please enter a valid duration count (1-999)');
                        return;
                    }
                    cleanCount = numValue;
                }
                
                finalForm.duration = {
                    ...finalForm.duration,
                    unit: fromEditorUnit(finalForm.duration.unit),
                    count: finalForm.duration.noEnd ? '' : cleanCount
                };
            }
            if (finalForm.washout) {
                if (finalForm.washout.duration) {
                    finalForm.washout.count = finalForm.washout.duration;
                    delete finalForm.washout.duration;
                }
                finalForm.washout = {
                    ...finalForm.washout,
                    unit: fromEditorUnit(finalForm.washout.unit)
                };
            }
            
            // When embedded (editing active protocol), ensure protocol id and active-only fields are passed
            if (embedded && protocol?.id) {
                finalForm.id = protocol.id;
                finalForm.active = protocol.active;
                finalForm.startDate = protocol.startDate ?? finalForm.startDate;
                finalForm.endDate = protocol.endDate ?? finalForm.endDate;
                finalForm.linkedItems = finalForm.linkedItems ?? protocol.linkedItems;
                finalForm.emoji = finalForm.emoji ?? protocol.emoji;
            }
            
            await onSave?.(finalForm);
            
            // Only clear auto-save and close modal after successful save
            markAsSubmitted();
            onClose();
        } catch (error) {
            console.error('❌ Failed to save protocol:', error);
            setSaveError('Failed to save protocol. Please try again.');
        } finally {
            setIsSavingToProtocols(false);
        }
    };

    // Close handler - auto-save handles all changes, so no confirmation needed
    const handleClose = () => {
        // Auto-save is handling all changes, so we can close without confirmation
        // For new protocols, data is auto-saved to localStorage
        // For existing protocols, data is auto-saved to both localStorage and the protocols list
        onClose();
    };

    // Listen for save event when embedded - handleFinalSave uses formRef.current to avoid stale closure
    useEffect(() => {
        if (!embedded) return;
        const handleSaveEvent = () => handleFinalSave();
        window.addEventListener('tpp:save-embedded-editor', handleSaveEvent);
        return () => window.removeEventListener('tpp:save-embedded-editor', handleSaveEvent);
    }, [embedded]);

    // Main content — all sections are accordion cards matching the app's native row style
    const editorContent = (
        <IconContext.Provider value={{ weight: 'duotone' }}>
        <div className="space-y-3 relative">

                {/* ── 1. Protocol Info ─────────────────────────────────────────── */}
                <AccordionCard
                    sectionKey="info"
                    icon={BookOpen}
                    title="Protocol Info"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                    theme={theme}
                    isComplete={sectionComplete.info}
                    summary={sectionSummaries.info}
                    isCreate={isCreateMode}
                    onNext={() => advanceSection('info')}
                >
                    <div className="space-y-3 pt-1">
                    <div className="relative" ref={protocolNameAnchorRef}>
                    <TextInput
                        name="protocol-editor-protocol-name"
                        label="Protocol name"
                        value={form.protocolName || ''}
                        onChange={v => handleChange('protocolName', v)}
                        placeholder="e.g. BPC-157, CJC + Ipa…"
                        theme={theme}
                        outlined={true}
                        customTextColor={theme.isDark ? null : "#181A18"}
                        customShadow
                        suffix={(
                            <div
                                ref={purposeIconAnchorRef}
                                className={isReadOnly ? 'opacity-55 pointer-events-none' : ''}
                            >
                                <button
                                    type="button"
                                    disabled={isReadOnly}
                                    onClick={togglePurposeIconMenu}
                                    className="flex items-center justify-center rounded-lg w-11 h-11 p-0 border-0 cursor-pointer outline-none transition-transform touch-manipulation active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-offset-1"
                                    style={{
                                        backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}12`,
                                        color: theme.primary,
                                    }}
                                    aria-expanded={purposeIconMenuOpen}
                                    aria-haspopup="listbox"
                                    title="Purpose icon - tap to change"
                                    aria-label="Purpose icon menu"
                                >
                                    {(() => {
                                        const TriggerIcon = getPurposeIconComponent(form.purposeIcon);
                                        return (
                                            <TriggerIcon
                                                size={24}
                                                weight={PURPOSE_ICON_WEIGHT}
                                                style={{ color: theme.primary }}
                                                aria-hidden
                                            />
                                        );
                                    })()}
                                </button>
                            </div>
                        )}
                    />
                    </div>
                    <TextInput
                        name="protocol-editor-purpose"
                        label="Purpose / Goal"
                        value={form.purpose || ''}
                        onChange={v => handleChange('purpose', v)}
                        placeholder="e.g. Weight loss, cognition, healing"
                        theme={theme}
                        outlined={true}
                        customTextColor={theme.isDark ? null : "#181A18"}
                        customShadow
                    />
                    <OwnerSelect
                        value={form.ownerId}
                        onChange={(ownerId) => handleChange('ownerId', ownerId)}
                        theme={theme}
                        label="Who is this for?"
                    />
                    </div>
                </AccordionCard>

                {/* ── 2. Peptides ──────────────────────────────────────────────── */}
                <AccordionCard
                    sectionKey="peptides"
                    icon={TestTube}
                    title="Peptide(s)"
                    subtitle="Dose, Delivery & Schedule"
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                    theme={theme}
                    isComplete={sectionComplete.peptides}
                    summary={sectionSummaries.peptides}
                    isCreate={isCreateMode}
                    onNext={() => advanceSection('peptides')}
                >
                    <div className="space-y-2 pt-1">

                    {/* Protocol Type - Only show when 2+ peptides */}
                    {form.peptides && form.peptides.length > 1 && (
                        <div className="w-full">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-[0.15em] opacity-40 ml-1" style={{ color: theme.text }}>Type</span>
                                <div className="inline-flex w-full rounded-lg p-1 gap-1" style={{ backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}12`, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)' }}>
                                    {[
                                        { key: 'separate', name: 'Separate', icon: ArrowsSplit },
                                        { key: 'blended', name: 'Blended', icon: GitMerge }
                                    ].map(option => {
                                        const Icon = option.icon;
                                        const isSelected = form.protocolType === option.key;
                                        return (
                                            <button
                                                key={option.key}
                                                type="button"
                                                onClick={() => handleChange('protocolType', option.key)}
                                                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md transition-all text-[10px] font-bold uppercase tracking-wider active:scale-95"
                                                style={{
                                                    backgroundColor: isSelected ? '#445952' : 'transparent',
                                                    color: isSelected ? '#fff' : theme.textLight,
                                                    boxShadow: isSelected ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.08)' : 'none'
                                                }}
                                            >
                                                <Icon size={18} />
                                                {option.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Shared Settings + Frequency & Schedule for Blended Protocols */}
                    {form.protocolType === 'blended' && form.peptides?.length > 1 && (
                        <div className="space-y-2">
                            <div className="p-2 rounded-lg border text-xs" 
                                 style={{ borderColor: theme.primary + '20', backgroundColor: theme.primary + '05' }}>
                                <p className="font-medium" style={{ color: theme.text }}>
                                    <span className="font-bold uppercase mr-1" style={{ color: theme.primary }}>Blended:</span>
                                    All peptides share the same delivery method and schedule.
                                </p>
                            </div>
                            {/* Blend-level Frequency & Schedule - always visible so schedule is set and shown on cards */}
                            <div className="p-2.5 rounded-lg border space-y-2" style={{ borderColor: theme.border }}>
                                <span className="text-xs font-black uppercase tracking-[0.15em] opacity-60" style={{ color: theme.text }}>
                                    Frequency & Schedule
                                </span>
                                <div className="inline-flex w-full flex-wrap rounded-lg p-1 gap-1" style={{ backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}12`, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)' }}>
                                    {['daily', 'weekly', 'custom', 'cycle', 'as_needed'].map(type => (
                                        <button key={type} type="button"
                                            onClick={() => handleSharedFrequencyChange('type', type)}
                                            className="flex-1 min-w-[4.5rem] py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-all active:scale-95"
                                            style={{
                                                backgroundColor: (form.sharedFrequency?.type || 'daily') === type ? '#445952' : 'transparent',
                                                color: (form.sharedFrequency?.type || 'daily') === type ? '#fff' : theme.textLight,
                                                boxShadow: (form.sharedFrequency?.type || 'daily') === type ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.08)' : 'none'
                                            }}
                                        >
                                            {type === 'custom' ? 'X Days' : type === 'weekly' ? 'Select Days' : type === 'as_needed' ? 'As Needed' : type}
                                        </button>
                                    ))}
                                </div>
                                {form.sharedFrequency?.type === 'as_needed' && (
                                    <p className="text-[11px] leading-snug" style={{ color: theme.textLight }}>
                                        No automatic daily tasks. Log doses when taken from Today or Calendar.
                                    </p>
                                )}
                                {form.sharedFrequency?.type === 'cycle' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        <TextInput label="On" value={form.sharedFrequency.onDays || ''} onChange={v => handleSharedFrequencyChange('onDays', v)} theme={theme} placeholder="5" type="number" outlined={true} compact={true} />
                                        <TextInput label="Off" value={form.sharedFrequency.offDays || ''} onChange={v => handleSharedFrequencyChange('offDays', v)} theme={theme} placeholder="2" type="number" outlined={true} compact={true} />
                                    </div>
                                )}
                                {form.sharedFrequency?.type === 'weekly' && (
                                    <div className="flex flex-wrap gap-1">
                                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                                            const days = form.sharedFrequency?.days || [];
                                            const dayMap = { 'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu', 'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun' };
                                            const norm = d => dayMap[d] || d;
                                            const isSelected = days.some(d => norm(d) === day || d === day);
                                            return (
                                                <button key={day} type="button" onClick={() => handleSharedFrequencyToggleDay(day)}
                                                    className="flex-1 min-w-[35px] py-1 text-xs font-bold rounded-md transition-all active:scale-95"
                                                    style={{
                                                        backgroundColor: isSelected ? '#445952' : (theme.isDark ? '#1f2937' : '#f5f4f0'),
                                                        border: isSelected ? '1px solid #3B4240' : `1px solid ${theme.border}`,
                                                        color: isSelected ? '#fff' : theme.textLight,
                                                        boxShadow: isSelected ? 'inset 0 2px 4px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.1)' : 'inset 0 1px 3px rgba(0,0,0,0.06)'
                                                    }}
                                                >
                                                    {day[0]}
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {form.sharedFrequency?.type === 'custom' && (
                                    <div className="flex items-center justify-center gap-2">
                                        <span className="text-sm font-semibold" style={{ color: theme.text }}>Every</span>
                                        <div className="w-20">
                                            <TextInput label="" value={form.sharedFrequency.customDays || ''} onChange={v => handleSharedFrequencyChange('customDays', v)} theme={theme} placeholder="3" type="number" outlined={true} customTextColor={theme.isDark ? null : '#181A18'} customShadow />
                                        </div>
                                        <span className="text-sm font-semibold" style={{ color: theme.text }}>Days</span>
                                    </div>
                                )}
                                <div className="inline-flex w-full rounded-lg p-1 gap-1" style={{ backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}12`, boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)' }}>
                                    {['AM', 'PM'].map(t => {
                                        const active = Array.isArray(form.sharedFrequency?.time) ? form.sharedFrequency.time.includes(t) : (t === 'AM');
                                        return (
                                            <button key={t} type="button" onClick={() => handleSharedFrequencyTimeToggle(t)}
                                                className="flex-1 py-1 text-xs font-bold rounded-md transition-all active:scale-95"
                                                style={{
                                                    backgroundColor: active ? '#6B7F77' : 'transparent',
                                                    color: active ? '#fff' : theme.textLight,
                                                    boxShadow: active ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.08)' : 'none'
                                                }}
                                            >
                                                {t}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Peptide List - Accordion Cards */}
                    <div className="space-y-2">
                        {form.peptides?.map((p, index) => {
                            const isExpanded = expandedPeptides.has(index);
                            const peptideName = p.name || `Peptide ${index + 1}`;
                            const dosageSummary = p.titration && p.titration.length > 0 
                                ? `${p.titration.length} phase${p.titration.length > 1 ? 's' : ''} titration`
                                : p.dosage?.amount 
                                    ? `${p.dosage.amount} ${p.dosage.unit || 'mcg'}`
                                    : 'No dosage set';
                            // For blended protocols, use shared/blend-level frequency (no masking - show real schedule or Not set)
                            const freq = form.protocolType === 'blended' 
                                ? (form.sharedFrequency || form.peptides?.[0]?.frequency || p.frequency)
                                : p.frequency;
                            const frequencySummary = freq?.type === 'daily' 
                                ? `Daily ${freq?.time?.join('/') || 'AM'}`
                                : freq?.type === 'weekly'
                                    ? (() => {
                                        const days = freq?.days || [];
                                        const dayStr = days.length > 0 ? days.join(', ') : '(no days)';
                                        const timeStr = freq?.time && Array.isArray(freq.time) && freq.time.length > 0 
                                            ? ` ${freq.time.join('/')}` : '';
                                        return `Weekly (${dayStr})${timeStr}`;
                                    })()
                                    : freq?.type === 'cycle'
                                        ? (() => {
                                            const cycleStr = `Cycle: ${freq?.onDays || '-'} on / ${freq?.offDays || '-'} off`;
                                            const timeStr = freq?.time && Array.isArray(freq.time) && freq.time.length > 0 
                                                ? ` ${freq.time.join('/')}` 
                                                : '';
                                            return cycleStr + timeStr;
                                        })()
                                        : freq?.type === 'custom'
                                            ? (() => {
                                                const days = freq?.customDays || 'X';
                                                const timeStr = freq?.time && Array.isArray(freq.time) && freq.time.length > 0 
                                                    ? ` ${freq.time.join('/')}` 
                                                    : ' AM';
                                                return `Every ${days} days${timeStr}`;
                                            })()
                                            : freq?.type || 'Not set';
                            
                            return (
                                <div 
                                    key={p.id || index} 
                                    className="rounded-lg border transition-all"
                                    style={{ 
                                        borderColor: isExpanded ? theme.primary + '40' : theme.border,
                                        backgroundColor: isExpanded ? theme.cardBackground : (theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.01)'),
                                        boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 2px rgba(0,0,0,0.1)' : 'inset 0 2px 4px rgba(0,0,0,0.06), inset 0 1px 2px rgba(0,0,0,0.04)'
                                    }}
                                >
                                    {/* Accordion Header */}
                                    <button
                                        type="button"
                                        onClick={() => togglePeptideExpanded(index)}
                                        className="w-full p-3 flex items-center justify-between hover:opacity-90 transition-opacity text-left"
                                    >
                                        <div className="flex items-stretch gap-3 flex-1 min-w-0">
                                            {/* Peptide color rail — matches vial / card language */}
                                            <div
                                                className="w-1 rounded-full flex-shrink-0 self-stretch min-h-[44px]"
                                                style={{ backgroundColor: p.capColor || theme.primary, opacity: p.capColor ? 1 : 0.45 }}
                                            />
                                            <div className="flex items-start gap-2 flex-1 min-w-0">
                                                {isExpanded ? (
                                                    <CaretDown size={20} style={{ color: theme.textLight }} className="flex-shrink-0 mt-1" />
                                                ) : (
                                                    <CaretRight size={20} style={{ color: theme.textLight }} className="flex-shrink-0 mt-1" />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-[15px] leading-tight truncate" style={{ color: theme.text }}>
                                                        {peptideName}
                                                    </div>
                                                    {!isExpanded && (
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                            <span
                                                                className="inline-flex items-center text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md"
                                                                style={{
                                                                    backgroundColor: theme.primary + '18',
                                                                    color: theme.primary,
                                                                    border: `1px solid ${theme.primary}28`,
                                                                }}
                                                            >
                                                                {dosageSummary}
                                                            </span>
                                                            <span
                                                                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-md max-w-[min(100%,200px)]"
                                                                style={{
                                                                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                                    color: theme.textLight,
                                                                }}
                                                            >
                                                                <Clock size={14} className="flex-shrink-0 opacity-70" />
                                                                <span className="truncate">{frequencySummary}</span>
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        {form.peptides.length > 1 && (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removePeptide(index);
                                                }}
                                                className="ml-2 px-2 py-1 text-xs font-medium rounded hover:bg-red-50 transition-colors flex-shrink-0"
                                                style={{ color: '#ef4444' }}
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </button>

                                    {/* Accordion Content */}
                                    <div 
                                        className="overflow-hidden transition-all duration-300 ease-in-out"
                                        style={{
                                            maxHeight: isExpanded ? '2000px' : '0',
                                            opacity: isExpanded ? 1 : 0
                                        }}
                                    >
                                        <div className="px-3 pb-2 pt-1 border-t" style={{ borderColor: theme.border }}>
                                            <PeptideSubForm
                                                item={p}
                                                index={index}
                                                onChange={(updated) => handlePeptideChange(index, updated)}
                                                onRemove={() => removePeptide(index)}
                                                protocolType={form.protocolType}
                                                isFirstPeptide={index === 0}
                                                theme={theme}
                                                isOnlyItem={form.peptides.length === 1}
                                                linkedItems={form.linkedItems}
                                                onLinkedItemsChange={(next) => handleChange('linkedItems', next)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Add Peptide Button */}
                    <div className="flex justify-center pt-1">
                        <button
                            type="button"
                            onClick={addPeptide}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-[0.98] hover:opacity-85"
                            style={{ 
                                backgroundColor: theme.isDark
                                    ? `${theme.primary || '#7F9E95'}22`
                                    : `${theme.primary || '#7F9E95'}14`,
                                color: theme.primary || '#7F9E95',
                                border: `1px solid ${theme.isDark ? `${theme.primary || '#7F9E95'}45` : `${theme.primary || '#7F9E95'}35`}`,
                            }}
                        >
                            <PlusCircle size={16} />
                            <span className="uppercase tracking-wider">Add Peptide</span>
                        </button>
                    </div>
                    </div>
                </AccordionCard>

                {/* ── 3. Duration ──────────────────────────────────────────────── */}
                <AccordionCard
                    sectionKey="duration"
                    icon={CalendarDots}
                    title="Duration"
                    subtitle="Timeline & Washout"
                    optional
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                    theme={theme}
                    isComplete={sectionComplete.duration}
                    summary={sectionSummaries.duration}
                    isCreate={isCreateMode}
                    onNext={() => advanceSection('duration')}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={form.duration?.noEnd} onChange={e => handleDurationChange('noEnd', e.target.checked)} className="sr-only peer" />
                                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all" style={{backgroundColor: form.duration?.noEnd ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.12)' : theme.secondary) }}></div>
                                    </label>
                                    <span className="text-sm" style={{ color: theme.text }}>No end date</span>
                                </div>
                            </div>
                            {!form.duration?.noEnd && (
                            <div className="relative">
                                    {/* Combined Input with Dropdown Selector */}
                                <div 
                                    className="flex items-stretch rounded-lg"
                                    style={{ 
                                            border: `1px solid ${isDurationFocused ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.1)' : '#f0eee7')}`,
                                        boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                                            backgroundColor: theme.isDark ? 'rgba(0,0,0,0.2)' : (theme.inputBackground || '#fff')
                                    }}
                                >
                                    <input 
                                        type="text"
                                        id="duration-input"
                                            value={form.duration?.count ?? ''}
                                        onChange={e => handleDurationChange('count', e.target.value)}
                                        onFocus={() => setIsDurationFocused(true)}
                                            onBlur={(e) => {
                                                setTimeout(() => {
                                                    const relatedTarget = e.relatedTarget || document.activeElement;
                                                    const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]');
                                                    if (!isClickingDropdown && !isDurationUnitDropdownOpen) {
                                                        setIsDurationFocused(false);
                                                    }
                                                }, 150);
                                            }}
                                        placeholder=" "
                                            className="flex-1 py-3 outline-none min-w-0 rounded-l-lg"
                                        style={{ 
                                            backgroundColor: 'transparent',
                                            color: theme.isDark ? theme.text : '#181A18',
                                                border: 'none',
                                                paddingLeft: '12px',
                                                paddingRight: '8px'
                                        }}
                                    />
                                    
                                        {/* Unit Dropdown Button — panel rendered via portal */}
                                        <button
                                            type="button"
                                            ref={durationUnitAnchorRef}
                                            onClick={() => setIsDurationUnitDropdownOpen(!isDurationUnitDropdownOpen)}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onTouchStart={(e) => e.preventDefault()}
                                            className="flex items-center justify-between gap-2 px-3 py-3 flex-shrink-0 rounded-r-lg relative cursor-pointer transition-all border-none outline-none"
                                            data-dropdown-container
                                        style={{ 
                                            borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.1)' : `1px solid #f0eee7`,
                                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : (theme.cardBackground || '#f9fafb'),
                                                color: theme.isDark ? theme.text : '#181A18',
                                                minWidth: '90px'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.04)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.1)' : (theme.cardBackground || '#f9fafb');
                                            }}
                                        >
                                            <span className="text-sm font-semibold">
                                                {form.duration?.unit || 'Week'}
                                            </span>
                                            <CaretDown size={16} style={{ color: 'inherit' }} />
                                        </button>
                                </div>
                                <label 
                                    htmlFor="duration-input"
                                    className="absolute pointer-events-none transition-all"
                                    style={{
                                            fontSize: (isDurationFocused || (form.duration?.count && form.duration.count.trim())) ? '0.75rem' : '0.9375rem',
                                            top: (isDurationFocused || (form.duration?.count && form.duration.count.trim())) ? '-8px' : '14px',
                                            left: (isDurationFocused || (form.duration?.count && form.duration.count.trim())) ? '12px' : '16px',
                                            padding: (isDurationFocused || (form.duration?.count && form.duration.count.trim())) ? '0 4px' : '0',
                                            background: (isDurationFocused || (form.duration?.count && form.duration.count.trim())) ? (theme.isDark ? 'rgba(0,0,0,0.2)' : (theme.inputBackground || '#fff')) : 'transparent',
                                            color: (isDurationFocused || (form.duration?.count && form.duration.count.trim())) ? theme.primary : (theme.textLight || theme.text),
                                        fontWeight: 500
                                    }}
                                >
                                    Duration
                                </label>
                            </div>
                            )}
                        </div>
                        
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={form.washout?.enabled} onChange={e => handleWashoutChange('enabled', e.target.checked)} className="sr-only peer" />
                                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all" style={{backgroundColor: form.washout?.enabled ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.12)' : theme.secondary)}}></div>
                                    </label>
                                    <span className="text-sm" style={{ color: theme.text }}>Enable washout</span>
                                </div>
                            </div>
                            {form.washout?.enabled && (
                            <div className="relative">
                                    {/* Combined Input with Dropdown Selector */}
                                <div 
                                    className="flex items-stretch rounded-lg"
                                    style={{ 
                                            border: `1px solid ${isWashoutFocused ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.1)' : '#f0eee7')}`,
                                        boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                                            backgroundColor: theme.isDark ? 'rgba(0,0,0,0.2)' : (theme.inputBackground || '#fff')
                                    }}
                                >
                                    <input 
                                        type="text"
                                        id="washout-input"
                                            value={form.washout?.duration ?? ''}
                                        onChange={e => handleWashoutChange('duration', e.target.value)}
                                        onFocus={() => setIsWashoutFocused(true)}
                                            onBlur={(e) => {
                                                setTimeout(() => {
                                                    const relatedTarget = e.relatedTarget || document.activeElement;
                                                    const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]');
                                                    if (!isClickingDropdown && !isWashoutUnitDropdownOpen) {
                                                        setIsWashoutFocused(false);
                                                    }
                                                }, 150);
                                            }}
                                        placeholder=" "
                                            className="flex-1 py-3 outline-none min-w-0 rounded-l-lg"
                                        style={{ 
                                            backgroundColor: 'transparent',
                                            color: theme.isDark ? theme.text : '#181A18',
                                                border: 'none',
                                                paddingLeft: '12px',
                                                paddingRight: '8px'
                                        }}
                                    />
                                    
                                        {/* Unit Dropdown Button — panel rendered via portal */}
                                        <button
                                            type="button"
                                            ref={washoutUnitAnchorRef}
                                            onClick={() => setIsWashoutUnitDropdownOpen(!isWashoutUnitDropdownOpen)}
                                            onMouseDown={(e) => e.preventDefault()}
                                            onTouchStart={(e) => e.preventDefault()}
                                            className="flex items-center justify-between gap-2 px-3 py-3 flex-shrink-0 rounded-r-lg relative cursor-pointer transition-all border-none outline-none"
                                            data-dropdown-container
                                        style={{ 
                                            borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.1)' : `1px solid #f0eee7`,
                                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : (theme.cardBackground || '#f9fafb'),
                                                color: theme.isDark ? theme.text : '#181A18',
                                                minWidth: '90px'
                                            }}
                                            onMouseEnter={(e) => {
                                                e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.04)';
                                            }}
                                            onMouseLeave={(e) => {
                                                e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.1)' : (theme.cardBackground || '#f9fafb');
                                            }}
                                        >
                                            <span className="text-sm font-semibold">
                                                {form.washout?.unit || 'Week'}
                                            </span>
                                            <CaretDown size={16} style={{ color: 'inherit' }} />
                                        </button>
                                </div>
                                <label 
                                    htmlFor="washout-input"
                                    className="absolute pointer-events-none transition-all"
                                    style={{
                                            fontSize: (isWashoutFocused || (form.washout?.duration && form.washout.duration.trim())) ? '0.75rem' : '0.9375rem',
                                            top: (isWashoutFocused || (form.washout?.duration && form.washout.duration.trim())) ? '-8px' : '14px',
                                            left: (isWashoutFocused || (form.washout?.duration && form.washout.duration.trim())) ? '12px' : '16px',
                                            padding: (isWashoutFocused || (form.washout?.duration && form.washout.duration.trim())) ? '0 4px' : '0',
                                            background: (isWashoutFocused || (form.washout?.duration && form.washout.duration.trim())) ? (theme.isDark ? 'rgba(0,0,0,0.2)' : (theme.inputBackground || '#fff')) : 'transparent',
                                            color: (isWashoutFocused || (form.washout?.duration && form.washout.duration.trim())) ? theme.primary : (theme.textLight || theme.text),
                                        fontWeight: 500
                                    }}
                                >
                                    Washout Period
                                </label>
                            </div>
                            )}
                        </div>
                    </div>
                    </AccordionCard>

                {/* ── 4. Notes & Preview ───────────────────────────────────────── */}
                <AccordionCard
                    sectionKey="notes"
                    icon={FileText}
                    title="Notes & Preview"
                    subtitle="Additional Details"
                    optional
                    expandedSections={expandedSections}
                    toggleSection={toggleSection}
                    theme={theme}
                    isComplete={sectionComplete.notes}
                    summary={sectionSummaries.notes}
                    isCreate={isCreateMode}
                    isLastSection
                >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start pt-1">
                        <div className="space-y-3">
                            <TextInput 
                                label="Notes"
                                value={form.notes || ''} 
                                onChange={v => handleChange('notes', v)} 
                                theme={theme} 
                                placeholder="Add any personal notes for this protocol..." 
                                multiline 
                                rows={3}
                                outlined={true}
                                customTextColor={theme.isDark ? null : "#181A18"}
                                customShadow
                            />
                        </div>
                        {form.peptides && form.peptides.length > 0 && form.peptides.some(p => p.name) && (
                            <div className="space-y-3">
                                <div className="flex items-center gap-2 mb-2">
                                    <BookOpen size={22} style={{ color: theme.primary }} />
                                    <span className="text-sm font-semibold" style={{ color: theme.text }}>Preview</span>
                                </div>
                                <SchedulingPreview protocol={form} theme={theme} />
                            </div>
                        )}
                    </div>
                </AccordionCard>

                {/* ── 5. Delete ────────────────────────────────────────────────── */}
                {form?.id && onDelete && (
                    <div className="rounded-lg border p-3" style={{ borderColor: theme.isDark ? 'rgba(200,122,92,0.3)' : 'rgba(181,104,74,0.25)', backgroundColor: theme.isDark ? 'rgba(200,122,92,0.1)' : 'rgba(200,122,92,0.06)' }}>
                        <div className="flex items-center justify-between">
                            <div className="flex-1">
                                <div className="text-sm font-semibold mb-0.5" style={{ color: theme.isDark ? '#e8a88a' : '#a35a3f' }}>Delete Entire Protocol</div>
                                <div className="text-xs" style={{ color: theme.isDark ? '#d4977d' : '#8b4d36' }}>This action cannot be undone.</div>
                            </div>
                            <button
                                onClick={() => onDelete?.(form)}
                                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-95 ml-3"
                                style={{ background: 'linear-gradient(135deg, #c87a5c 0%, #b5684a 100%)', color: '#ffffff', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15), inset 0 1px 2px rgba(0,0,0,0.1)' }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                )}
            
                {/* Lockout Overlay - Covers entire modal */}
                {isReadOnly && (
                    <div className="absolute inset-0 backdrop-blur-md flex items-center justify-center z-50 rounded-lg" style={{ backgroundColor: theme.isDark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.6)' }}>
                        <div className="text-center p-6 max-w-md">
                            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
                                <Lock size={40} style={{ color: theme.primary }} />
                            </div>
                            <h3 className="text-xl font-semibold mb-2" style={{ color: theme.isDark ? theme.text : theme.primaryDark }}>
                                Trial has ended
                            </h3>
                            <p className="text-sm mb-4" style={{ color: theme.text }}>
                                Upgrade to continue creating and managing protocols
                            </p>
                            <button
                                onClick={() => {
                                    if (onUpgrade) {
                                        onUpgrade();
                                    } else {
                                        window.location.href = '/app/account';
                                    }
                                }}
                                className="px-6 py-2.5 rounded-lg font-semibold transition-all hover:opacity-90"
                                style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}
                            >
                                Choose a Plan
                            </button>
                        </div>
                    </div>
                )}
        </div>
        </IconContext.Provider>
    );

    const renderUnitDropdownPortal = (placement, portalRef, currentUnit, onSelect) => (
        createPortal(
            <div
                ref={portalRef}
                role="listbox"
                className="fixed rounded-lg shadow-lg border overflow-hidden"
                style={{
                    top: placement.top,
                    right: placement.right,
                    minWidth: placement.minWidth,
                    zIndex: 10100,
                    backgroundColor: theme.isDark ? '#1f2937' : '#ffffff',
                    borderColor: theme.border,
                    boxShadow: theme.isDark ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.15)',
                }}
            >
                {['Day', 'Week', 'Month'].map((unit, idx) => (
                    <React.Fragment key={unit}>
                        {idx > 0 && (
                            <div className="h-px mx-2" style={{ backgroundColor: theme.border }} />
                        )}
                        <button
                            type="button"
                            role="option"
                            aria-selected={currentUnit === unit}
                            onMouseDown={(e) => e.preventDefault()}
                            onTouchStart={(e) => e.preventDefault()}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSelect(unit);
                            }}
                            className="w-full text-left px-3 py-2 text-sm transition-all touch-manipulation"
                            style={{
                                color: currentUnit === unit ? theme.primary : theme.text,
                                backgroundColor: 'transparent',
                                WebkitTapHighlightColor: 'transparent',
                            }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                                e.currentTarget.style.color = theme.primary;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.backgroundColor = 'transparent';
                                e.currentTarget.style.color = currentUnit === unit ? theme.primary : theme.text;
                            }}
                        >
                            {unit}
                        </button>
                    </React.Fragment>
                ))}
            </div>,
            document.body,
        )
    );

    const durationUnitPortal =
        isDurationUnitDropdownOpen && durationUnitPlacement && typeof document !== 'undefined'
            ? renderUnitDropdownPortal(
                durationUnitPlacement,
                durationUnitPortalRef,
                form.duration?.unit || 'Week',
                (unit) => {
                    handleDurationChange('unit', unit);
                    setIsDurationUnitDropdownOpen(false);
                },
            )
            : null;

    const washoutUnitPortal =
        isWashoutUnitDropdownOpen && washoutUnitPlacement && typeof document !== 'undefined'
            ? renderUnitDropdownPortal(
                washoutUnitPlacement,
                washoutUnitPortalRef,
                form.washout?.unit || 'Week',
                (unit) => {
                    handleWashoutChange('unit', unit);
                    setIsWashoutUnitDropdownOpen(false);
                },
            )
            : null;

    const purposeIconPortal =
        purposeIconMenuOpen && purposeMenuPlacement && typeof document !== 'undefined'
            ? createPortal(
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
                                        setPurposeIconFollowsGoal(false);
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
            )
            : null;

    const protocolNamePortal =
        showProtocolNameMenu && protocolNamePlacement && typeof document !== 'undefined'
            ? createPortal(
                <div
                    ref={protocolNamePortalRef}
                    role="listbox"
                    className="fixed rounded-xl overflow-hidden max-h-48 overflow-y-auto"
                    style={{
                        top: protocolNamePlacement.top,
                        left: protocolNamePlacement.left,
                        width: protocolNamePlacement.width,
                        zIndex: 10100,
                        backgroundColor: theme.isDark ? '#1a2028' : '#fff',
                        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                        boxShadow: theme.isDark
                            ? '0 12px 40px rgba(0,0,0,0.55)'
                            : '0 12px 32px rgba(0,0,0,0.16)',
                    }}
                >
                    {protocolNameSuggestions.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            role="option"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                                handleChange('protocolName', item.name);
                                setShowProtocolNameSuggestions(false);
                            }}
                            className="w-full text-left px-3.5 py-3 text-base flex items-start gap-2.5 hover:opacity-90"
                            style={{
                                color: theme.text,
                                borderBottom: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                            }}
                        >
                            <MagnifyingGlass size={16} className="mt-0.5 shrink-0 opacity-40" />
                            <span>
                                <span className="font-semibold text-[15px] leading-snug">{item.name}</span>
                                {item.category && (
                                    <span className="block text-xs opacity-55 mt-0.5">{item.category}</span>
                                )}
                            </span>
                        </button>
                    ))}
                </div>,
                document.body,
            )
            : null;

    // If embedded, return just the content without the BottomSheet wrapper
    if (embedded) {
        return (
            <>
                {editorContent}
                {purposeIconPortal}
                {durationUnitPortal}
                {washoutUnitPortal}
                {protocolNamePortal}
            </>
        );
    }

    // Otherwise, render with full BottomSheet modal
    return (
        <>
        <BottomSheet 
            open={open}
            onClose={handleClose}
            onBack={handleClose}
            title={
                form?.protocolName?.trim()
                    ? (form?.id
                        ? `Editing: ${titleWithoutEmoji(form.protocolName)}`
                        : `New: ${titleWithoutEmoji(form.protocolName)}`)
                    : (form?.id ? 'Edit Protocol' : 'New Protocol')
            }
            titleExtra={
                <AutoSaveIndicator 
                    isSaving={isSaving}
                    lastSaved={lastSaved}
                    theme={theme}
                    compact={true}
                    iconOnly={true}
                />
            }
            theme={theme}
            maxHeight="90vh"
            fitContent={true}
            footer={
                <div className="w-full flex items-center justify-between gap-3">
                    <button
                        type="button"
                        onClick={handleClose}
                        className="px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-70"
                        style={{
                            backgroundColor: 'transparent',
                            color: theme?.textLight || theme?.text || '#111827',
                            border: 'none'
                        }}
                    >
                        Cancel
                    </button>
                    <div className="flex items-center gap-3 ml-auto">
                        {saveError && (
                            <span className="text-sm font-medium" style={{ color: theme?.error || '#b91c1c' }}>
                                {saveError}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={handleFinalSave}
                            disabled={isSavingToProtocols || isReadOnly}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-75 whitespace-nowrap min-w-fit flex items-center justify-center gap-2"
                            style={{
                                backgroundColor: (isSavingToProtocols || isReadOnly)
                                    ? (theme?.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')
                                    : (theme?.primary || '#7F9E95'),
                                color: (isSavingToProtocols || isReadOnly)
                                    ? (theme?.textLight || theme?.text || '#111827')
                                    : (theme?.textOnPrimary || '#ffffff'),
                                border: 'none',
                            }}
                            title={isReadOnly ? "Upgrade to save protocols" : "Save protocol changes"}
                        >
                            {isSavingToProtocols ? (
                                <>
                                    <Spinner size={18} className="animate-spin" />
                                    <span>Saving…</span>
                                </>
                            ) : isReadOnly ? (
                                <>
                                    <Lock size={18} />
                                    <span>Upgrade to Save</span>
                                </>
                            ) : (
                                <>
                                    <Check size={18} />
                                    <span>Save Protocol</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            }
        >
            {editorContent}
        </BottomSheet>
        {purposeIconPortal}
        {durationUnitPortal}
        {washoutUnitPortal}
        {protocolNamePortal}
        </>
    );
}


