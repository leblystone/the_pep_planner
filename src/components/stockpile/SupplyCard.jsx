import React from 'react';
import {
  Syringe, Needle, Drop, DropSimple, Flask,
  Funnel, TestTube, Bandaids, BoxingGlove,
  Biohazard, SprayBottle, FirstAidKit,
} from '@phosphor-icons/react';
import { Trash2, Zap, AlertTriangle, Check } from 'lucide-react';
import { useIsSimpleMode } from '../../hooks/useIsSimpleMode';

// Exported so AddSupplyModal shares the same config
export const SUPPLY_CATEGORY_CONFIG = {
  syringe:          { Icon: Syringe,      color: '#8ea5a0', label: 'Syringe' },
  pen_needle:       { Icon: Needle,       color: '#9d95b5', label: 'Pen Needle' },
  bac_water:        { Icon: Drop,         color: '#8ba4c0', label: 'BAC Water' },
  sterile_water:    { Icon: DropSimple,   color: '#8fb8cc', label: 'Sterile Water' },
  saline:           { Icon: Flask,        color: '#8dab98', label: 'Saline' },
  filter:           { Icon: Funnel,       color: '#b5a87a', label: 'Syringe Filter' },
  sterile_vial:     { Icon: TestTube,     color: '#8fab8f', label: 'Sterile Vial' },
  alcohol_swab:     { Icon: Bandaids,     color: '#b097a8', label: 'Alcohol Swab' },
  gloves:           { Icon: BoxingGlove,  color: '#b09882', label: 'Gloves' },
  sharps_container: { Icon: Biohazard,    color: '#ae9090', label: 'Sharps Container' },
  nasal_spray:      { Icon: SprayBottle,  color: '#8aabb5', label: 'Nasal Spray' },
  custom:           { Icon: FirstAidKit,  color: '#9ca3af', label: 'Custom' },
};

const AUTO_TRACK_LABELS = {
  pipette: 'Auto: Syringe dose',
  pen:     'Auto: Pen dose',
  recon:   'Auto: Recon',
};

export default function SupplyCard({ supply, theme, onEdit, onDelete, onConfirmLooksRight }) {
  const simpleMode = useIsSimpleMode();
  const qty = Number(supply.quantity) || 0;
  const threshold = Number(supply.lowThreshold) || 0;
  const isOut = qty <= 0;
  const isLow = !isOut && threshold > 0 && qty <= threshold;
  const needsReconfirm = !!supply.needsReconfirm;

  const catCfg = SUPPLY_CATEGORY_CONFIG[supply.category] || SUPPLY_CATEGORY_CONFIG.custom;
  const { Icon, color: iconColor, label: catLabel } = catCfg;
  const autoLabel = !simpleMode && supply.autoTrack?.trigger ? AUTO_TRACK_LABELS[supply.autoTrack.trigger] : null;

  const quantityColor = isOut ? '#ef4444' : isLow ? '#f59e0b' : theme.primary;
  const borderColor   = needsReconfirm
    ? 'rgba(245,158,11,0.45)'
    : isOut
    ? 'rgba(239,68,68,0.35)'
    : isLow
    ? 'rgba(245,158,11,0.35)'
    : theme.border;

  return (
    <div
      className={`rounded-xl p-4 ${isOut || isLow || needsReconfirm ? 'pb-8' : ''} relative overflow-hidden transition-all duration-200 cursor-pointer group hover:shadow-lg`}
      style={{
        backgroundColor: theme.cardBackground,
        border: `1px solid ${borderColor}`,
        boxShadow: theme.isDark
          ? '0 2px 8px rgba(0,0,0,0.3)'
          : '0 1px 4px rgba(0,0,0,0.08)',
      }}
      onClick={() => onEdit(supply)}
    >
      {/* Status badge */}
      {(isOut || isLow || needsReconfirm) && (
        <div
          className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5"
        >
          {needsReconfirm && typeof onConfirmLooksRight === 'function' && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onConfirmLooksRight(supply);
              }}
              className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: 'rgba(245,158,11,0.18)',
                color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.35)',
              }}
              title="Confirm quantity looks right"
            >
              <Check size={9} />
              Looks Right
            </button>
          )}
          {(isOut || isLow || (needsReconfirm && !onConfirmLooksRight)) && (
            <div
              className="flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{
                backgroundColor: needsReconfirm && !isOut && !isLow
                  ? 'rgba(245,158,11,0.12)'
                  : isOut ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                color: needsReconfirm && !isOut && !isLow
                  ? '#f59e0b'
                  : isOut ? '#ef4444' : '#f59e0b',
              }}
            >
              <AlertTriangle size={9} />
              {needsReconfirm && !isOut && !isLow ? 'Confirm Qty' : isOut ? 'Empty' : 'Low'}
            </div>
          )}
        </div>
      )}

      {/* Icon + name row */}
      <div className="flex items-start gap-3 mb-3">
        <Icon
          size={28}
          weight="duotone"
          color={iconColor}
          className="flex-shrink-0 mt-0.5"
        />
        <div className="min-w-0 flex-1 pr-8">
          <p className="text-sm font-semibold leading-tight" style={{ color: theme.text }}>
            {supply.name}
          </p>
          {supply.brand && (
            <p className="text-xs mt-0.5 truncate" style={{ color: theme.textLight }}>
              {supply.brand}
            </p>
          )}
        </div>
      </div>

      {/* Quantity */}
      <div className="flex items-end gap-1.5 mb-3">
        <span className="text-3xl font-bold leading-none" style={{ color: quantityColor }}>
          {qty}
        </span>
        <span className="text-sm pb-0.5 font-medium" style={{ color: theme.textLight }}>
          {supply.unit || 'each'}
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: `${iconColor}18`, color: iconColor }}
          >
            {catLabel}
          </span>
          {autoLabel && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
              style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#818cf8' }}
            >
              <Zap size={9} />
              {autoLabel}
            </span>
          )}
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onDelete(supply); }}
          className="p-1.5 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
          style={{ color: theme.textLight }}
          title="Delete supply"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {!simpleMode && supply.notes && (
        <p className="mt-2 text-xs truncate" style={{ color: theme.textLight, opacity: 0.65 }}>
          {supply.notes}
        </p>
      )}
    </div>
  );
}
