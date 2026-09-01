import React, { useState, useCallback, useRef, useEffect } from 'react';
import BottomSheet from '../common/BottomSheet';
import { logSideEffect, updateSideEffect, deleteSideEffect } from '../../utils/sideEffectsLog';
import {
  SmileyWink, Syringe, WarningCircle, BatteryLow,
  Skull, Headphones, Balloon, MoonStars,
  Brain, PencilSimple,
} from '@phosphor-icons/react';

const EFFECTS = [
    { id: 'none',      label: 'Feeling great',     Icon: SmileyWink,         color: '#22c55e' },
    { id: 'pip',       label: 'PIP / Soreness',     Icon: Syringe,            color: '#f97316' },
    { id: 'isr',       label: 'ISR / Redness',      Icon: WarningCircle,  color: '#ef4444' },
    { id: 'fatigue',   label: 'Fatigue',             Icon: BatteryLow,         color: '#a855f7' },
    { id: 'nausea',    label: 'Nausea',              Icon: Skull,              color: '#eab308' },
    { id: 'headache',  label: 'Headache',            Icon: Headphones,         color: '#f97316' },
    { id: 'bloating',  label: 'Bloating',            Icon: Balloon,            color: '#64748b' },
    { id: 'insomnia',  label: 'Insomnia',            Icon: MoonStars,          color: '#6366f1' },
    { id: 'mood',      label: 'Mood change',         Icon: Brain,              color: '#8b5cf6' },
    { id: 'other',     label: 'Other',               Icon: PencilSimple,       color: '#94a3b8' },
];

const SEVERITY = [
    { id: 'mild',     label: 'Mild',     color: '#22c55e', bg: '#22c55e18' },
    { id: 'moderate', label: 'Moderate', color: '#f59e0b', bg: '#f59e0b18' },
    { id: 'severe',   label: 'Severe',   color: '#ef4444', bg: '#ef444418' },
];

const STEP_PICK  = 'pick';
const STEP_DETAIL = 'detail';

function toastSideEffectLogged(message) {
    window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message, type: 'success' },
    }));
}

export default function SideEffectsQuickSheet({ open, onClose, theme, protocol = null, protocols = [], date = null, logSource = 'manual', editEntry = null }) {
    const [step, setStep]               = useState(STEP_PICK);
    const [selected, setSelected]       = useState(null);
    const [severity, setSeverity]       = useState(null);
    const [notes, setNotes]             = useState('');
    const [otherText, setOtherText]     = useState('');
    const [animDir, setAnimDir]         = useState('forward');
    const [linkedProtocol, setLinkedProtocol] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const contentRef = useRef(null);

    const primary = theme?.primary || '#7F9E95';

    // Sync form when sheet opens (new log vs edit)
    useEffect(() => {
        if (!open) return;
        if (editEntry) {
            const knownEffect = EFFECTS.find((e) => e.id === editEntry.effect);
            if (knownEffect && knownEffect.id !== 'other') {
                setSelected(knownEffect);
                setOtherText('');
            } else {
                setSelected(EFFECTS.find((e) => e.id === 'other'));
                setOtherText(editEntry.label || editEntry.effect || '');
            }
            setSeverity(SEVERITY.find((s) => s.id === editEntry.severity) || null);
            setNotes(editEntry.notes || '');
            setStep(STEP_DETAIL);
            setAnimDir('forward');
            const linked = editEntry.protocolId
                ? protocols.find((p) => p.id === editEntry.protocolId) || null
                : (protocol || null);
            setLinkedProtocol(linked);
        } else {
            setStep(STEP_PICK);
            setSelected(null);
            setSeverity(null);
            setNotes('');
            setOtherText('');
            setAnimDir('forward');
            setLinkedProtocol(protocol || null);
        }
        setConfirmDelete(false);
    }, [open, editEntry, protocol, protocols]);

    const reset = useCallback(() => {
        setStep(STEP_PICK);
        setSelected(null);
        setSeverity(null);
        setNotes('');
        setOtherText('');
        setAnimDir('forward');
        setLinkedProtocol(null);
        setConfirmDelete(false);
    }, []);

    const handleClose = useCallback(() => {
        reset();
        onClose?.();
    }, [reset, onClose]);

    const handlePickEffect = useCallback((effect) => {
        setSelected(effect);
        if (effect.id === 'none') {
            logSideEffect({
                effect: 'none',
                label: 'Feeling great',
                severity: null,
                notes: null,
                protocolId: linkedProtocol?.id || null,
                protocolName: linkedProtocol?.protocolName || null,
                date: date || null,
                source: logSource,
            });
            toastSideEffectLogged('Nice — feeling great logged. Keep it up!');
            reset();
            onClose?.();
        } else {
            setAnimDir('forward');
            setStep(STEP_DETAIL);
        }
    }, [linkedProtocol, date, logSource, reset, onClose]);

    const handleBack = useCallback(() => {
        setAnimDir('back');
        setStep(STEP_PICK);
    }, []);

    const handleSave = useCallback(() => {
        const effectLabel = selected?.id === 'other' ? (otherText.trim() || 'Other') : selected?.label;
        const payload = {
            effect: selected?.id === 'other' ? (otherText.trim() || 'other') : selected?.id,
            label: effectLabel,
            severity: severity?.id || null,
            notes: notes.trim() || null,
            protocolId: linkedProtocol?.id || null,
            protocolName: linkedProtocol?.protocolName || null,
        };
        if (editEntry?.id) {
            updateSideEffect(editEntry.id, {
                ...payload,
                date: editEntry.date || date || null,
            });
            toastSideEffectLogged(`${effectLabel} updated.`);
        } else {
            logSideEffect({
                ...payload,
                date: date || null,
                source: logSource,
            });
            toastSideEffectLogged(`${effectLabel} saved. PiP will track patterns over time.`);
        }
        reset();
        onClose?.();
    }, [selected, severity, notes, otherText, linkedProtocol, date, logSource, editEntry, reset, onClose]);

    const handleDelete = useCallback(() => {
        if (!editEntry?.id) return;
        if (confirmDelete) {
            deleteSideEffect(editEntry.id);
            toastSideEffectLogged('Side effect removed.');
            setConfirmDelete(false);
            reset();
            onClose?.();
        } else {
            setConfirmDelete(true);
        }
    }, [confirmDelete, editEntry, reset, onClose]);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = 0;
        }
    }, [step]);

    const stepTitle = editEntry
        ? (step === STEP_DETAIL ? 'Edit Side Effect' : 'Log a Side Effect')
        : (step === STEP_DETAIL ? 'Severity & Notes' : 'Log a Side Effect');

    return (
        <BottomSheet
            open={open}
            onClose={handleClose}
            onBack={step === STEP_DETAIL ? handleBack : undefined}
            title={stepTitle}
            theme={theme}
            fitContent
            seamlessContent={false}
        >
            <style>{`
                @keyframes se-slide-in-right {
                    from { opacity: 0; transform: translateX(40px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                @keyframes se-slide-in-left {
                    from { opacity: 0; transform: translateX(-40px); }
                    to   { opacity: 1; transform: translateX(0); }
                }
                .se-step-forward { animation: se-slide-in-right 0.25s ease-out both; }
                .se-step-back    { animation: se-slide-in-left 0.25s ease-out both; }
            `}</style>

            <div ref={contentRef} className="px-4 pb-6 pt-2">

                {/* Step 1 — Pick effect */}
                {step === STEP_PICK && (
                    <div
                        key="pick"
                        className={animDir === 'back' ? 'se-step-back' : 'se-step-forward'}
                    >
                        <div className="grid grid-cols-2 gap-2">
                            {EFFECTS.map((e) => {
                                const EIcon = e.Icon;
                                return (
                                    <button
                                        key={e.id}
                                        type="button"
                                        onClick={() => handlePickEffect(e)}
                                        className="flex items-center gap-2.5 rounded-xl px-3 py-3 text-left border transition-all active:scale-[0.97] touch-manipulation"
                                        style={{
                                            backgroundColor: theme?.cardBackground || '#fff',
                                            borderColor: theme?.border || 'rgba(0,0,0,0.08)',
                                            color: theme?.text,
                                        }}
                                    >
                                        <div
                                            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                                            style={{ backgroundColor: `${e.color}18`, color: e.color }}
                                        >
                                            <EIcon size={20} weight="duotone" />
                                        </div>
                                        <span className="text-[13px] font-medium leading-tight">{e.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Step 2 — Severity + notes */}
                {step === STEP_DETAIL && selected && (
                    <div
                        key="detail"
                        className={animDir === 'back' ? 'se-step-back' : 'se-step-forward'}
                    >
                        <div className="space-y-4">
                            {/* Selected effect header */}
                            <div className="flex items-center gap-3 rounded-xl px-3.5 py-3" style={{ backgroundColor: `${selected.color}14`, border: `1px solid ${selected.color}30` }}>
                                <div
                                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                                    style={{ backgroundColor: `${selected.color}22`, color: selected.color }}
                                >
                                    <selected.Icon size={22} weight="duotone" />
                                </div>
                                <span className="text-sm font-bold" style={{ color: selected.color }}>{selected.label}</span>
                            </div>

                            {/* Severity toggle */}
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: theme?.textLight }}>How bad?</p>
                                <div className="flex gap-2">
                                    {SEVERITY.map((s) => {
                                        const active = severity?.id === s.id;
                                        return (
                                            <button
                                                key={s.id}
                                                type="button"
                                                onClick={() => setSeverity(active ? null : s)}
                                                className="flex-1 rounded-xl py-3 text-sm font-bold transition-all duration-200 active:scale-[0.97] touch-manipulation"
                                                style={{
                                                    backgroundColor: active ? `${s.color}20` : (theme?.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'),
                                                    color: active ? s.color : theme?.textLight,
                                                    boxShadow: active
                                                        ? `inset 0 0 0 2px ${s.color}, 0 2px 8px ${s.color}25`
                                                        : 'inset 0 1px 3px rgba(0,0,0,0.06)',
                                                }}
                                            >
                                                {s.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* "Other" text input */}
                            {selected.id === 'other' && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: theme?.textLight }}>What is it?</p>
                                    <input
                                        type="text"
                                        value={otherText}
                                        onChange={(e) => setOtherText(e.target.value)}
                                        placeholder="Describe the effect…"
                                        className="w-full rounded-xl px-3.5 py-2.5 text-sm border outline-none transition-colors"
                                        style={{
                                            backgroundColor: theme?.cardBackground || '#fff',
                                            borderColor: theme?.border || 'rgba(0,0,0,0.12)',
                                            color: theme?.text,
                                        }}
                                    />
                                </div>
                            )}

                            {/* Notes */}
                            <div>
                                <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: theme?.textLight }}>Notes (optional)</p>
                                <textarea
                                    rows={2}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Timing, duration, anything relevant…"
                                    className="w-full rounded-xl px-3.5 py-2.5 text-sm border outline-none resize-none transition-colors"
                                    style={{
                                        backgroundColor: theme?.cardBackground || '#fff',
                                        borderColor: theme?.border || 'rgba(0,0,0,0.12)',
                                        color: theme?.text,
                                    }}
                                />
                            </div>

                            {/* Protocol picker */}
                            {protocols.length > 0 && (
                                <div>
                                    <p className="text-[11px] font-bold uppercase tracking-widest mb-1.5" style={{ color: theme?.textLight }}>Link to protocol (optional)</p>
                                    <select
                                        value={linkedProtocol?.id || ''}
                                        onChange={(e) => {
                                            const found = protocols.find(p => p.id === e.target.value);
                                            setLinkedProtocol(found || null);
                                        }}
                                        className="w-full rounded-xl px-3.5 py-2.5 text-sm border outline-none transition-colors appearance-none"
                                        style={{
                                            backgroundColor: theme?.cardBackground || '#fff',
                                            borderColor: theme?.border || 'rgba(0,0,0,0.12)',
                                            color: theme?.text,
                                        }}
                                    >
                                        <option value="">— No specific protocol —</option>
                                        {protocols.map(p => (
                                            <option key={p.id} value={p.id}>{p.protocolName}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Save / Update + Delete (edit) */}
                            <div className={`flex items-center gap-3 w-full pt-1 ${editEntry ? 'justify-between' : 'justify-end'}`}>
                                {editEntry ? (
                                    <button
                                        type="button"
                                        onClick={handleDelete}
                                        className={`py-2 text-sm font-medium transition-all touch-manipulation underline-offset-2 hover:underline ${confirmDelete ? 'tap-confirm-pop underline' : ''}`}
                                        style={{ color: confirmDelete ? '#8B5335' : '#C67A5C' }}
                                    >
                                        {confirmDelete ? 'Tap again to confirm' : 'Delete'}
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    className="shrink-0 px-6 py-2 rounded-xl text-sm font-bold text-white active:scale-[0.98] transition-all"
                                    style={{ backgroundColor: primary, boxShadow: `0 2px 8px ${primary}40` }}
                                >
                                    {editEntry ? 'Update' : 'Save'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </BottomSheet>
    );
}
