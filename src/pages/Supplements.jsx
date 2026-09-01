import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useOutletContext, useNavigate, useSearchParams } from 'react-router-dom';
import { Pill, Plus, Search, Sun, Moon, AlertTriangle, Lock, ArrowRight, Download } from 'lucide-react';
import { Syringe, Flask, Pill as PhPill, Prescription } from '@phosphor-icons/react';
import { useAppContext } from '../context/AppContext';
import { getBuddyCardTint, OWNER_SELF } from '../utils/buddies';
import { useSubscriptionAccess, useTierAccess } from '../utils/useSubscriptionAccess';
import SupplementEditorModal from '../components/dashboard/SupplementEditorModal';
import MedicationEditorModal from '../components/medications/MedicationEditorModal';
import UpgradeModal from '../components/common/UpgradeModal';
import ChooseActiveSupplementModal from '../components/supplements/ChooseActiveSupplementModal';
import { exportToCSV } from '../utils/export';
import {
  addMedication,
  updateMedication,
  deleteMedication,
  getMedications,
  displayMedicationName,
  moveSupplementToMedication,
  medicationToSupplementDraft,
} from '../utils/medications';
import { useIsSimpleMode } from '../hooks/useIsSimpleMode';

const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Labels for chips: daily, or sorted abbreviated weekdays */
function getDayChipLabels(supplement) {
  const days = Array.isArray(supplement.days) ? supplement.days : [];
  if (days.length === 0 || days.length === 7) return ['Daily'];
  const sorted = [...days].sort((a, b) => DAY_ORDER.indexOf(a) - DAY_ORDER.indexOf(b));
  return sorted;
}

const DELIVERY_ICON_CONFIG = {
  injection: { Icon: Syringe, color: '#8ea5a0' },
  syringe: { Icon: Syringe, color: '#8ea5a0' },
  powder: { Icon: Flask, color: '#8ba4c0' },
  oral: { Icon: PhPill, color: '#9ca3af' },
};

function DeliveryIcon({ delivery, size = 16, color, weight = 'duotone' }) {
  const d = String(delivery || 'oral').toLowerCase();
  const cfg = DELIVERY_ICON_CONFIG[d] || DELIVERY_ICON_CONFIG.oral;
  const Icon = cfg.Icon;
  return <Icon size={size} color={color || cfg.color} weight={weight} />;
}

/**
 * held      — paused by free-plan cap (greyed out, locked)
 * slotOpen  — active slot is empty, so a held card can be resumed immediately
 * onSwap    — called when user wants to swap this held supplement with the active one
 */
function SupplementCard({ supplement, theme, onEdit, held = false, slotOpen = false, onSwap, onConfirmStillTaking, onStopTaking }) {
  const simpleMode = useIsSimpleMode();
  const isBuddyOwned = supplement.ownerId && supplement.ownerId !== OWNER_SELF;
  const needsReconfirm = !held && !!supplement.needsReconfirm;

  const schedule = Array.isArray(supplement.schedule) ? supplement.schedule : [];
  const hasAM = schedule.includes('AM');
  const hasPM = schedule.includes('PM');
  // Simple mode: don't surface advanced delivery method — default oral icon only
  const deliveryKey = simpleMode ? 'oral' : String(supplement.delivery || 'oral').toLowerCase();

  const iconCfg = DELIVERY_ICON_CONFIG[deliveryKey] || DELIVERY_ICON_CONFIG.oral;
  const tint = held ? (theme.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)') : iconCfg.color;

  // Buddy tint: darker version of the supplement's own delivery icon color
  const buddyTint = isBuddyOwned ? getBuddyCardTint(iconCfg.color, theme?.isDark) : {};

  const handleClick = () => {
    if (!held) { onEdit(supplement); return; }
    if (slotOpen) { onSwap?.(supplement, 'resume'); return; }
    onSwap?.(supplement, 'swap');
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group relative text-left rounded-[20px] p-3.5 transition-all duration-300 hover:-translate-y-0.5 active:scale-95 flex flex-col justify-between ${isBuddyOwned ? 'buddy-owned-supplement' : ''}`}
      style={{
        backgroundColor: held
          ? (theme.isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.02)')
          : isBuddyOwned ? buddyTint.backgroundColor
          : (theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.95)'),
        border: held
          ? `1px dashed ${theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)'}`
          : needsReconfirm
            ? `1px solid rgba(245,158,11,0.45)`
          : isBuddyOwned ? `1px solid ${iconCfg.color}55`
          : `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
        boxShadow: held ? 'none' : isBuddyOwned ? buddyTint.boxShadow : (theme.isDark ? '0 4px 12px rgba(0,0,0,0.2)' : '0 4px 16px rgba(0,0,0,0.04)'),
        opacity: held ? 0.65 : 1,
        minHeight: '110px',
      }}
    >
      {/* Hover glow (only on active cards) */}
      {!held && (
        <div
          className="absolute inset-0 rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
          style={{ background: `radial-gradient(circle at top right, ${theme.primary}15 0%, transparent 60%)` }}
        />
      )}

      {/* Lock badge top-right on held cards */}
      {held && (
        <div className="absolute top-2.5 right-2.5 z-20">
          <Lock size={11} style={{ color: theme.textLight }} />
        </div>
      )}

      <div className="relative z-10 w-full flex items-start gap-3 mb-2">
        <DeliveryIcon delivery={deliveryKey} size={28} color={tint} weight="duotone" />
        <div className="flex-1 min-w-0 pt-0.5 pr-4">
          <h3
            className="font-bold text-sm truncate"
            style={{ color: held ? theme.textLight : theme.text }}
          >
            {supplement.name || 'Untitled'}
          </h3>
          {supplement.dose && (
            <p className="text-xs truncate mt-0.5" style={{ color: theme.textLight }}>
              {supplement.dose}{supplement.unit ? ` ${supplement.unit}` : ''}
            </p>
          )}
        </div>
      </div>

      <div
        className="relative z-10 mt-auto pt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t"
        style={{ borderColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
      >
        {held ? (
          /* Held footer: Paused label + swap/resume action */
          <div className="w-full flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold" style={{ color: theme.textLight }}>
              Paused
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: slotOpen
                  ? `${theme.primary}22`
                  : (theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                color: slotOpen ? theme.primary : theme.textLight,
              }}
            >
              {slotOpen ? 'Tap to resume' : 'Tap to swap'}
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-1 min-w-0 flex-1">
              {getDayChipLabels(supplement).map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium tabular-nums"
                  style={{
                    color: theme.textLight,
                    backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}0d`,
                    border: `1px solid ${theme.border}`,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="flex gap-1 shrink-0 items-center">
              {hasAM && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                  style={{
                    backgroundColor: theme.isDark ? `${theme.primaryLight || theme.primary}70` : theme.primary,
                    color: theme.textOnPrimary,
                    border: `1px solid ${theme.primaryDark || theme.primary}`,
                  }}
                >
                  <Sun size={11} strokeWidth={2} aria-hidden />
                  AM
                </span>
              )}
              {hasPM && (
                <span
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                  style={{
                    backgroundColor: theme.primaryDark || theme.primary,
                    color: theme.textOnPrimary,
                    border: `1px solid ${theme.isDark ? `${theme.primary}90` : (theme.primaryDark || theme.primary)}`,
                  }}
                >
                  <Moon size={11} strokeWidth={2} aria-hidden />
                  PM
                </span>
              )}
              {!hasAM && !hasPM && (
                <span className="text-[10px] font-medium" style={{ color: theme.textLight }}>
                  Unscheduled
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {needsReconfirm && (
        <div
          className="relative z-20 mt-2 flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <span
            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}
          >
            <AlertTriangle size={9} />
            Reconfirm
          </span>
          <button
            type="button"
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${theme.primary}22`, color: theme.primary }}
            onClick={(e) => {
              e.stopPropagation();
              onConfirmStillTaking?.(supplement);
            }}
          >
            Still Taking
          </button>
          <button
            type="button"
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              color: theme.textLight,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStopTaking?.(supplement);
            }}
          >
            Stop
          </button>
        </div>
      )}
    </button>
  );
}

function MedicationCard({ medication, theme, onEdit, onConfirmStillTaking, onStopTaking }) {
  const simpleMode = useIsSimpleMode();
  const needsReconfirm = !!medication.needsReconfirm;
  const schedule = Array.isArray(medication.schedule) ? medication.schedule : [];
  const hasAM = schedule.includes('AM');
  const hasPM = schedule.includes('PM');
  const doseLabel = simpleMode
    ? (medication.dose || '')
    : [medication.dose, medication.unit].filter(Boolean).join(' ');
  const delivery = simpleMode ? 'oral' : (medication.delivery || 'oral');
  const iconCfg = DELIVERY_ICON_CONFIG[String(delivery).toLowerCase()] || DELIVERY_ICON_CONFIG.oral;

  return (
    <button
      type="button"
      onClick={() => onEdit(medication)}
      className="group relative text-left rounded-[20px] p-3.5 transition-all duration-300 hover:-translate-y-0.5 active:scale-95 flex flex-col justify-between"
      style={{
        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.95)',
        border: needsReconfirm
          ? '1px solid rgba(245,158,11,0.45)'
          : `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
        boxShadow: theme.isDark ? '0 4px 12px rgba(0,0,0,0.2)' : '0 4px 16px rgba(0,0,0,0.04)',
        minHeight: '110px',
      }}
    >
      <div
        className="absolute inset-0 rounded-[20px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{ background: `radial-gradient(circle at top right, ${theme.primary}15 0%, transparent 60%)` }}
      />

      <div className="relative z-10 w-full flex items-start gap-3 mb-2">
        <DeliveryIcon delivery={delivery} size={28} color={iconCfg.color} weight="duotone" />
        <div className="flex-1 min-w-0 pt-0.5 pr-4">
          <h3 className="font-bold text-sm truncate" style={{ color: theme.text }}>
            {displayMedicationName(medication)}
          </h3>
          {doseLabel && (
            <p className="text-xs truncate mt-0.5" style={{ color: theme.textLight }}>
              {doseLabel}
            </p>
          )}
        </div>
      </div>

      <div
        className="relative z-10 mt-auto pt-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-2 border-t"
        style={{ borderColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
      >
        <div className="flex flex-wrap gap-1 min-w-0 flex-1">
          {getDayChipLabels(medication).map((label) => (
            <span
              key={label}
              className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium tabular-nums"
              style={{
                color: theme.textLight,
                backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}0d`,
                border: `1px solid ${theme.border}`,
              }}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="flex gap-1 shrink-0 items-center">
          {hasAM && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
              style={{
                backgroundColor: theme.isDark ? `${theme.primaryLight || theme.primary}70` : theme.primary,
                color: theme.textOnPrimary,
                border: `1px solid ${theme.primaryDark || theme.primary}`,
              }}
            >
              <Sun size={11} strokeWidth={2} aria-hidden />
              AM
            </span>
          )}
          {hasPM && (
            <span
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
              style={{
                backgroundColor: theme.primaryDark || theme.primary,
                color: theme.textOnPrimary,
                border: `1px solid ${theme.isDark ? `${theme.primary}90` : (theme.primaryDark || theme.primary)}`,
              }}
            >
              <Moon size={11} strokeWidth={2} aria-hidden />
              PM
            </span>
          )}
          {!hasAM && !hasPM && (
            <span className="text-[10px] font-medium" style={{ color: theme.textLight }}>
              Unscheduled
            </span>
          )}
        </div>
      </div>

      {needsReconfirm && (
        <div
          className="relative z-20 mt-2 flex items-center gap-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: 'rgba(245,158,11,0.14)', color: '#f59e0b' }}
          >
            <AlertTriangle size={9} />
            Reconfirm
          </span>
          <button
            type="button"
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{ backgroundColor: `${theme.primary}22`, color: theme.primary }}
            onClick={(e) => {
              e.stopPropagation();
              onConfirmStillTaking?.(medication);
            }}
          >
            Still Taking
          </button>
          <button
            type="button"
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
            style={{
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
              color: theme.textLight,
            }}
            onClick={(e) => {
              e.stopPropagation();
              onStopTaking?.(medication);
            }}
          >
            Stop
          </button>
        </div>
      )}
    </button>
  );
}

export default function Supplements() {
  const { theme } = useOutletContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { supplements, addSupplement, updateSupplement, deleteSupplement, medications, setMedications } = useAppContext();
  const { isReadOnly, isDowngraded } = useSubscriptionAccess();
  const { canAddSupplement, canAddMedication, caps } = useTierAccess();

  const activeTab = searchParams.get('tab') === 'meds' ? 'meds' : 'supplements';
  const setActiveTab = useCallback((tab) => {
    setSearch('');
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tab === 'meds') next.set('tab', 'meds');
      else next.delete('tab');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const [showEditor, setShowEditor] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState(null);
  const [showMedEditor, setShowMedEditor] = useState(false);
  const [editingMedication, setEditingMedication] = useState(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [search, setSearch] = useState('');
  const [showChooseModal, setShowChooseModal] = useState(false);
  const [showSlotOpenModal, setShowSlotOpenModal] = useState(false);
  const [swapTarget, setSwapTarget] = useState(null);
  const prevIsDowngradedRef = useRef(null);

  const organized = useMemo(() => {
    const list = Array.isArray(supplements) ? supplements : [];
    const active = [];
    const heldByFreePlan = [];
    list.forEach((s) => {
      if (!s || s.archived || s.deleted) return;
      if (caps.enforced && s.heldByFreePlan === true) {
        heldByFreePlan.push(s);
      } else if (s.active === false) {
        // Treat user-paused as held-like for display consistency on free
        if (caps.enforced) heldByFreePlan.push(s);
      } else {
        active.push(s);
      }
    });
    const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' });
    active.sort(byName);
    heldByFreePlan.sort(byName);
    return { active, heldByFreePlan };
  }, [supplements, caps.enforced]);

  // If free caps are enforced and we have >1 active supplements, force a choice.
  useEffect(() => {
    if (caps.enforced && organized.active.length > 1) setShowChooseModal(true);
  }, [caps.enforced, organized.active.length]);

  // Slot-open: if active slot is empty and held supplements exist, offer resume.
  useEffect(() => {
    if (caps.enforced && organized.active.length === 0 && organized.heldByFreePlan.length > 0) {
      setShowSlotOpenModal(true);
    }
  }, [caps.enforced, organized.active.length, organized.heldByFreePlan.length]);

  // When user resubscribes, clear held flags so everything returns to normal.
  useEffect(() => {
    if (prevIsDowngradedRef.current === true && isDowngraded === false) {
      (supplements || []).filter(s => s?.heldByFreePlan === true).forEach(s => {
        updateSupplement({ ...s, heldByFreePlan: false, active: true });
      });
    }
    prevIsDowngradedRef.current = isDowngraded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDowngraded]);

  const { filteredItems, totalCount } = useMemo(() => {
    const list = (supplements || []).filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        (s.name || '').toLowerCase().includes(q) ||
        (s.dose || '').toLowerCase().includes(q) ||
        (s.delivery || '').toLowerCase().includes(q)
      );
    });

    return {
      filteredItems: list,
      totalCount: (supplements || []).length,
    };
  }, [supplements, search]);

  const handleAdd = useCallback(() => {
    if (isReadOnly) { setShowUpgrade(true); return; }
    if (activeTab === 'meds') {
      if (!canAddMedication) { setShowUpgrade(true); return; }
      setEditingMedication(null);
      setShowMedEditor(true);
      return;
    }
    if (!canAddSupplement) { setShowUpgrade(true); return; }
    setEditingSupplement(null);
    setShowEditor(true);
  }, [isReadOnly, canAddSupplement, canAddMedication, activeTab]);

  const openAddSupplement = useCallback(() => {
    if (isReadOnly || !canAddSupplement) { setShowUpgrade(true); return; }
    setEditingSupplement(null);
    setShowEditor(true);
  }, [isReadOnly, canAddSupplement]);

  const openAddMedication = useCallback(() => {
    if (isReadOnly || !canAddMedication) { setShowUpgrade(true); return; }
    setEditingMedication(null);
    setShowMedEditor(true);
  }, [isReadOnly, canAddMedication]);

  const handleEdit = (supplement) => {
    if (isReadOnly) { setShowUpgrade(true); return; }
    setEditingSupplement(supplement);
    setShowEditor(true);
  };

  const handleEditMedication = (medication) => {
    if (isReadOnly) { setShowUpgrade(true); return; }
    setEditingMedication(medication);
    setShowMedEditor(true);
  };

  const refreshMedications = useCallback(() => {
    setMedications(getMedications());
  }, [setMedications]);

  const handleMedicationSave = async (data) => {
    if (data?._delete && data.id) {
      deleteMedication(data.id);
      refreshMedications();
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Medication deleted', type: 'success' } }));
    } else if (data?.id && editingMedication?.id) {
      updateMedication(data.id, { ...data, needsReconfirm: false });
      refreshMedications();
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Medication updated', type: 'success' } }));
    } else {
      addMedication(data);
      refreshMedications();
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Medication added', type: 'success' } }));
    }
    setShowMedEditor(false);
    setEditingMedication(null);
  };

  const organizedMedications = useMemo(() => {
    const list = Array.isArray(medications) ? medications : [];
    const active = [];
    const heldByFreePlan = [];
    list.forEach((m) => {
      if (!m || m.archived || m.deleted) return;
      if (caps.enforced && m.heldByFreePlan === true) {
        heldByFreePlan.push(m);
      } else {
        active.push(m);
      }
    });
    const byName = (a, b) => displayMedicationName(a).localeCompare(displayMedicationName(b), undefined, { sensitivity: 'base' });
    active.sort(byName);
    heldByFreePlan.sort(byName);
    return { active, heldByFreePlan };
  }, [medications, caps.enforced]);

  const filteredMedications = useMemo(() => {
    const list = Array.isArray(medications) ? medications : [];
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? list
      : list.filter((m) =>
          [m.name, m.brandName, m.genericName, m.dose, m.notes]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        );
    return [...filtered].sort((a, b) =>
      displayMedicationName(a).localeCompare(displayMedicationName(b), undefined, { sensitivity: 'base' })
    );
  }, [medications, search]);

  // Called from held SupplementCard — action is 'resume' (slot open) or 'swap'
  const handleSwap = useCallback((heldSupplement, action) => {
    if (action === 'resume') {
      // Slot is open — just activate the held one
      updateSupplement({ ...heldSupplement, heldByFreePlan: false, active: true });
      return;
    }
    // Slot occupied — store the target and show a confirm
    setSwapTarget(heldSupplement);
  }, [updateSupplement]);

  const confirmSwap = useCallback(() => {
    if (!swapTarget) return;
    // Pause all currently active supplements
    organized.active.forEach((s) => {
      updateSupplement({ ...s, active: false, heldByFreePlan: true, heldAt: new Date().toISOString() });
    });
    // Activate the chosen one
    updateSupplement({ ...swapTarget, heldByFreePlan: false, active: true });
    setSwapTarget(null);
  }, [swapTarget, organized.active, updateSupplement]);

  // Medication hold/swap helpers (mirrors supplement swap logic)
  const handleMedSwap = useCallback((heldMedication, action) => {
    if (action === 'resume') {
      updateMedication(heldMedication.id, { ...heldMedication, heldByFreePlan: false, active: true });
      refreshMedications();
      return;
    }
    // Pause all active medications then activate the held one
    organizedMedications.active.forEach((m) => {
      updateMedication(m.id, { ...m, heldByFreePlan: true, active: false, heldAt: new Date().toISOString() });
    });
    updateMedication(heldMedication.id, { ...heldMedication, heldByFreePlan: false, active: true });
    refreshMedications();
  }, [organizedMedications.active, refreshMedications]);

  const handleSave = async (supplement) => {
    if (supplement._delete && supplement.id) {
      await deleteSupplement(supplement.id);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Supplement deleted', type: 'success' } }));
    } else if (editingSupplement) {
      await updateSupplement({ ...supplement, needsReconfirm: false });
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Supplement updated', type: 'success' } }));
    } else {
      addSupplement(supplement);
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Supplement added', type: 'success' } }));
    }
    setShowEditor(false);
    setEditingSupplement(null);
  };

  const handleMoveToMedication = useCallback(async (supplementDraft) => {
    if (isReadOnly) {
      setShowUpgrade(true);
      return;
    }
    const name = String(supplementDraft?.name || '').trim();
    if (!name) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Add a name before moving to Medication', type: 'error' },
      }));
      return;
    }

    const sourceId = supplementDraft?.id || editingSupplement?.id || null;
    const medication = moveSupplementToMedication({
      ...supplementDraft,
      id: sourceId,
    });

    if (!medication) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Could not move to Medication', type: 'error' },
      }));
      return;
    }

    if (sourceId) {
      await deleteSupplement(sourceId);
    }

    refreshMedications();
    setShowEditor(false);
    setEditingSupplement(null);
    setActiveTab('meds');
    setEditingMedication(medication);
    setShowMedEditor(true);
    window.dispatchEvent(new CustomEvent('tpp:toast', {
      detail: { message: 'Moved to Medication', type: 'success' },
    }));
  }, [isReadOnly, editingSupplement?.id, deleteSupplement, refreshMedications, setActiveTab]);

  const handleMoveToSupplement = useCallback(async (medicationDraft) => {
    if (isReadOnly) {
      setShowUpgrade(true);
      return;
    }
    if (!canAddSupplement) {
      setShowUpgrade(true);
      return;
    }

    const sourceId = medicationDraft?.id || editingMedication?.id || null;
    const existing = sourceId
      ? (medications || []).find((m) => m.id === sourceId)
      : null;

    const draft = medicationToSupplementDraft({
      ...existing,
      ...medicationDraft,
      id: sourceId,
      sourceSupplementId: existing?.sourceSupplementId || medicationDraft?.sourceSupplementId,
    });

    if (!draft) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Add a name before moving to Supplements', type: 'error' },
      }));
      return;
    }

    addSupplement(draft);

    if (sourceId) {
      deleteMedication(sourceId);
      refreshMedications();
    }

    setShowMedEditor(false);
    setEditingMedication(null);
    setActiveTab('supplements');
    setEditingSupplement(draft);
    setShowEditor(true);
    window.dispatchEvent(new CustomEvent('tpp:toast', {
      detail: { message: 'Moved to Supplements', type: 'success' },
    }));
  }, [
    isReadOnly,
    canAddSupplement,
    editingMedication?.id,
    medications,
    addSupplement,
    refreshMedications,
    setActiveTab,
  ]);

  const hasAny = totalCount > 0;

  useEffect(() => {
    const onFabAddSupplement = () => openAddSupplement();
    const onFabAddMedication = () => openAddMedication();
    window.addEventListener('tpp:fab-add-supplement', onFabAddSupplement);
    window.addEventListener('tpp:fab-add-medication', onFabAddMedication);
    return () => {
      window.removeEventListener('tpp:fab-add-supplement', onFabAddSupplement);
      window.removeEventListener('tpp:fab-add-medication', onFabAddMedication);
    };
  }, [openAddSupplement, openAddMedication]);

  useEffect(() => {
    const tabs = [
      { value: 'supplements', label: 'Supplements' },
      { value: 'meds', label: 'Medication' },
    ];
    window.dispatchEvent(new CustomEvent('tpp:set-topbar-tabs', {
      detail: {
        tabs,
        activeTab,
        onTabChange: setActiveTab,
        actionItems: [
          {
            label: 'Add Supplement',
            Icon: PhPill,
            onClick: () => window.dispatchEvent(new CustomEvent('tpp:fab-add-supplement')),
          },
          {
            label: 'Add Medication',
            Icon: Prescription,
            onClick: () => window.dispatchEvent(new CustomEvent('tpp:fab-add-medication')),
          },
        ],
        actionDisabled: isReadOnly,
      }
    }));
    return () => {
      window.dispatchEvent(new CustomEvent('tpp:clear-topbar-tabs'));
    };
  }, [isReadOnly, activeTab, setActiveTab]);

  return (
    <section className="page-bg px-2 sm:px-4 py-4 !min-h-0">
      {activeTab === 'meds' ? (
        <>
          {(medications?.length || 0) >= 4 && (
            <div className="relative mb-6">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: theme.textLight }} />
              <input
                type="text"
                placeholder="Search medications…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-3 rounded-[16px] text-sm transition-all focus:outline-none focus:ring-2"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                  boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
                }}
              />
            </div>
          )}

          {/* ── Free-plan held medications banner ────────────────── */}
          {caps.enforced && organizedMedications.heldByFreePlan.length > 0 && (
            <div
              className="rounded-2xl px-4 py-3.5 mb-4"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
                border: `1px solid ${theme.border}`,
                boxShadow: theme.isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
              }}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Lock size={12} style={{ color: theme.textLight }} />
                    <p className="text-sm font-semibold" style={{ color: theme.text }}>
                      {organizedMedications.heldByFreePlan.length} medication{organizedMedications.heldByFreePlan.length > 1 ? 's' : ''} paused
                    </p>
                  </div>
                  <p className="text-xs" style={{ color: theme.textLight }}>
                    {organizedMedications.active.length > 0 ? 'Tap a paused card to swap it with your active one' : 'Tap a paused card to resume it'} — your data is always yours
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowUpgrade(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95 shrink-0"
                  style={{ backgroundColor: theme.primary, color: theme.textOnPrimary || '#fff' }}
                >
                  Upgrade
                  <ArrowRight size={12} />
                </button>
              </div>
              {/* Held medication cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mt-3">
                {organizedMedications.heldByFreePlan.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleMedSwap(m, organizedMedications.active.length === 0 ? 'resume' : 'swap')}
                    className="text-left rounded-2xl p-3 transition-all opacity-60 hover:opacity-80 active:scale-95"
                    style={{
                      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                      border: `1px dashed ${theme.border}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <Lock size={11} style={{ color: theme.textLight }} />
                      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: theme.textLight }}>Paused</span>
                    </div>
                    <p className="text-sm font-bold truncate" style={{ color: theme.text }}>{displayMedicationName(m)}</p>
                    {m.dose && <p className="text-xs mt-0.5 truncate" style={{ color: theme.textLight }}>{m.dose}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(medications?.length || 0) === 0 ? (
            <div
              className="rounded-[24px] p-10 text-center"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.6)',
                border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`,
              }}
            >
              <div
                className="w-14 h-14 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary}20 0%, ${theme.primary}05 100%)`,
                  border: `1px solid ${theme.primary}25`,
                }}
              >
                <Pill size={26} style={{ color: theme.primary }} />
              </div>
              <p className="text-base font-bold mb-1" style={{ color: theme.text }}>
                No medications yet
              </p>
              <p className="text-sm mb-6" style={{ color: theme.textLight }}>
                Log common name-brand or generic meds you track alongside research
              </p>
              <button
                type="button"
                onClick={handleAdd}
                className="inline-flex items-center gap-1.5 px-6 py-3 rounded-[14px] text-sm font-bold transition-all active:scale-95 btn-primary-inset"
                style={{ backgroundColor: theme.primary, color: theme.textOnPrimary || '#fff' }}
              >
                <Plus size={15} strokeWidth={3} />
                Add Medication
              </button>
            </div>
          ) : filteredMedications.length === 0 ? (
            <div
              className="rounded-[20px] p-8 text-center"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.6)',
                border: `1px solid ${theme.border}`,
              }}
            >
              <Search size={28} className="mx-auto mb-3 opacity-30" style={{ color: theme.text }} />
              <p className="text-sm font-medium" style={{ color: theme.textLight }}>
                No medications match &quot;{search}&quot;
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {filteredMedications.map((m) => (
                <MedicationCard
                  key={m.id}
                  medication={m}
                  theme={theme}
                  onEdit={handleEditMedication}
                  onConfirmStillTaking={(med) => {
                    if (isReadOnly) { setShowUpgrade(true); return; }
                    const updated = updateMedication(med.id, { needsReconfirm: false });
                    if (updated) {
                      setMedications((prev) =>
                        (prev || []).map((x) => (x.id === med.id ? updated : x))
                      );
                    }
                    window.dispatchEvent(new CustomEvent('tpp:toast', {
                      detail: { message: 'Medication confirmed', type: 'success' },
                    }));
                  }}
                  onStopTaking={(med) => {
                    if (isReadOnly) { setShowUpgrade(true); return; }
                    const updated = updateMedication(med.id, {
                      needsReconfirm: false,
                      archived: true,
                      active: false,
                    });
                    if (updated) {
                      setMedications((prev) =>
                        (prev || []).map((x) => (x.id === med.id ? updated : x))
                      );
                    }
                    window.dispatchEvent(new CustomEvent('tpp:toast', {
                      detail: { message: 'Medication stopped', type: 'info' },
                    }));
                  }}
                />
              ))}
            </div>
          )}

          <MedicationEditorModal
            open={showMedEditor}
            onClose={() => { setShowMedEditor(false); setEditingMedication(null); }}
            theme={theme}
            medication={editingMedication}
            onSave={handleMedicationSave}
            onMoveToSupplement={handleMoveToSupplement}
          />

          <UpgradeModal
            isOpen={showUpgrade}
            onClose={() => setShowUpgrade(false)}
            theme={theme}
          />
        </>
      ) : (
        <>
      {/* ── Free-plan over-limit banner ────────────────────────────── */}
      {caps.enforced && caps.maxSupplements !== null && caps.supplementCount > caps.maxSupplements && (
        <div
          className="rounded-2xl px-4 py-3.5 mb-5"
          style={{
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
            border: `1px solid ${theme.border}`,
            boxShadow: theme.isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Lock size={12} style={{ color: theme.textLight }} />
                <p className="text-sm font-semibold" style={{ color: theme.text }}>
                  {caps.supplementCount} / {caps.maxSupplements} active supplement{caps.maxSupplements > 1 ? 's' : ''} used
                </p>
              </div>
              <p className="text-xs" style={{ color: theme.textLight }}>
                {caps.supplementCount - caps.maxSupplements} supplement{caps.supplementCount - caps.maxSupplements > 1 ? 's' : ''} held — your data is always yours
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => exportToCSV(
                  (supplements || [])
                    .filter(s => !s.archived && !s.deleted)
                    .map(s => ({
                      name: s.name || '',
                      dose: s.dose || '',
                      unit: s.unit || '',
                      delivery: s.delivery || '',
                      schedule: (s.schedule || []).join('/'),
                      days: (s.days || []).join('/'),
                      status: s.heldByFreePlan ? 'held' : s.active === false ? 'inactive' : 'active',
                    })),
                  'supplements-export.csv'
                )}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 active:scale-95"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${theme.border}`,
                  color: theme.textLight,
                }}
              >
                <Download size={12} />
                Export All
              </button>
              <button
                type="button"
                onClick={() => setShowUpgrade(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.textOnPrimary || '#fff',
                }}
              >
                Upgrade
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Paused supplements banner ────────────────────────────────── */}
      {caps.enforced && organized.heldByFreePlan.length > 0 && (
        <div
          className="rounded-2xl px-4 py-3.5 mb-4"
          style={{
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
            border: `1px solid ${theme.border}`,
            boxShadow: theme.isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Lock size={12} style={{ color: theme.textLight }} />
                <p className="text-sm font-semibold" style={{ color: theme.text }}>
                  {organized.heldByFreePlan.length} supplement{organized.heldByFreePlan.length > 1 ? 's' : ''} paused
                </p>
              </div>
              <p className="text-xs" style={{ color: theme.textLight }}>
                {organized.active.length > 0 ? 'Tap a paused card to swap it with your active one' : 'Tap a paused card to resume it'} — your data is always yours
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => exportToCSV(
                  (supplements || [])
                    .filter(s => !s.archived && !s.deleted)
                    .map(s => ({
                      name: s.name || '',
                      dose: s.dose || '',
                      unit: s.unit || '',
                      delivery: s.delivery || '',
                      schedule: (s.schedule || []).join('/'),
                      days: (s.days || []).join('/'),
                      status: s.heldByFreePlan ? 'held' : s.active === false ? 'inactive' : 'active',
                    })),
                  'supplements-export.csv'
                )}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 active:scale-95"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${theme.border}`,
                  color: theme.textLight,
                }}
              >
                <Download size={12} />
                Export All
              </button>
              <button
                type="button"
                onClick={() => setShowUpgrade(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.textOnPrimary || '#fff',
                }}
              >
                Upgrade
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search (when 4+ items) */}
      {totalCount >= 4 && (
        <div className="relative mb-6">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: theme.textLight }} />
          <input
            type="text"
            placeholder="Search supplements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-3 rounded-[16px] text-sm transition-all focus:outline-none focus:ring-2"
            style={{
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
              border: `1px solid ${theme.border}`,
              color: theme.text,
              boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)',
            }}
          />
        </div>
      )}

      {/* Empty state */}
      {!hasAny ? (
        <div
          className="rounded-[24px] p-10 text-center"
          style={{
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.6)',
            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`,
          }}
        >
          <div
            className="w-14 h-14 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
            style={{
              background: `linear-gradient(135deg, ${theme.primary}20 0%, ${theme.primary}05 100%)`,
              border: `1px solid ${theme.primary}25`,
            }}
          >
            <Pill size={26} style={{ color: theme.primary }} />
          </div>
          <p className="text-base font-bold mb-1" style={{ color: theme.text }}>
            No supplements yet
          </p>
          <p className="text-sm mb-6" style={{ color: theme.textLight }}>
            Track vitamins, minerals & peptide companions
          </p>
          <button
            onClick={handleAdd}
            className="inline-flex items-center gap-1.5 px-6 py-3 rounded-[14px] text-sm font-bold transition-all active:scale-95 btn-primary-inset"
            style={{ backgroundColor: theme.primary, color: theme.textOnPrimary || '#fff' }}
          >
            <Plus size={15} strokeWidth={3} />
            Add Supplement
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div
          className="rounded-[20px] p-8 text-center"
          style={{
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.6)',
            border: `1px solid ${theme.border}`,
          }}
        >
          <Search size={28} className="mx-auto mb-3 opacity-30" style={{ color: theme.text }} />
          <p className="text-sm font-medium" style={{ color: theme.textLight }}>
            No supplements match "{search}"
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filteredItems.map((s) => {
              const isHeld = caps.enforced && !!s?.heldByFreePlan;
              const slotOpen = organized.active.length === 0;
              return (
                <SupplementCard
                  key={s.id}
                  supplement={s}
                  theme={theme}
                  onEdit={handleEdit}
                  held={isHeld}
                  slotOpen={isHeld && slotOpen}
                  onSwap={handleSwap}
                  onConfirmStillTaking={(sup) => {
                    if (isReadOnly) { setShowUpgrade(true); return; }
                    updateSupplement({ ...sup, needsReconfirm: false });
                    window.dispatchEvent(new CustomEvent('tpp:toast', {
                      detail: { message: 'Supplement confirmed', type: 'success' },
                    }));
                  }}
                  onStopTaking={(sup) => {
                    if (isReadOnly) { setShowUpgrade(true); return; }
                    updateSupplement({
                      ...sup,
                      needsReconfirm: false,
                      archived: true,
                      active: false,
                    });
                    window.dispatchEvent(new CustomEvent('tpp:toast', {
                      detail: { message: 'Supplement archived', type: 'info' },
                    }));
                  }}
                />
              );
            })}
        </div>
      )}

      <SupplementEditorModal
        open={showEditor}
        onClose={() => { setShowEditor(false); setEditingSupplement(null); }}
        theme={theme}
        supplement={editingSupplement}
        onSave={handleSave}
        onMoveToMedication={handleMoveToMedication}
      />

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        theme={theme}
      />

      {/* Swap confirmation */}
      {swapTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setSwapTarget(null); }}
        >
          <div
            className="w-full max-w-sm rounded-[24px] p-6 overflow-y-auto"
            style={{
              backgroundColor: theme.card || (theme.isDark ? '#1c1c1e' : '#fff'),
              border: `1px solid ${theme.border}`,
              boxShadow: '0 24px 48px rgba(0,0,0,0.32)',
              maxHeight: 'calc(100dvh - 8rem)',
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${theme.primary}18` }}>
                <ArrowRight size={18} style={{ color: theme.primary }} />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: theme.text }}>Swap supplement?</p>
                <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>Your active supplement will be paused</p>
              </div>
            </div>

            {organized.active[0] && (
              <div className="mb-3 rounded-[14px] p-3 flex items-center gap-3" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)', border: `1px solid ${theme.border}` }}>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: theme.textLight }}>Currently active → will pause</p>
                  <p className="text-sm font-bold truncate mt-0.5" style={{ color: theme.text }}>{organized.active[0].name}</p>
                </div>
              </div>
            )}
            <div className="mb-5 rounded-[14px] p-3 flex items-center gap-3" style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate" style={{ color: theme.primary }}>Will become active</p>
                <p className="text-sm font-bold truncate mt-0.5" style={{ color: theme.text }}>{swapTarget.name}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSwapTarget(null)}
                className="flex-1 py-2.5 rounded-[14px] text-sm font-semibold transition-all active:scale-95"
                style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', color: theme.textLight }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSwap}
                className="flex-1 py-2.5 rounded-[14px] text-sm font-bold transition-all active:scale-95"
                style={{ backgroundColor: theme.primary, color: theme.textOnPrimary || '#fff' }}
              >
                Swap
              </button>
            </div>
          </div>
        </div>
      )}

      {showChooseModal && organized.active.length > 1 && (
        <ChooseActiveSupplementModal
          supplements={organized.active}
          theme={theme}
          mode="choose"
          onChoose={(chosenId) => {
            organized.active.forEach((s) => {
              if (s.id !== chosenId) {
                updateSupplement({ ...s, active: false, heldByFreePlan: true, heldAt: new Date().toISOString() });
              }
            });
            setShowChooseModal(false);
          }}
        />
      )}

      {showSlotOpenModal && organized.heldByFreePlan.length > 0 && (
        <ChooseActiveSupplementModal
          supplements={organized.heldByFreePlan}
          theme={theme}
          mode="resume"
          onChoose={(chosenId) => {
            setShowSlotOpenModal(false);
            if (!chosenId) return;
            const s = organized.heldByFreePlan.find((x) => x.id === chosenId);
            if (s) updateSupplement({ ...s, heldByFreePlan: false, active: true });
          }}
        />
      )}
        </>
      )}
    </section>
  );
}