import React, { useState, useRef, useEffect } from 'react';
import { PenTool, ChevronDown, Check, X } from 'lucide-react';
import { IconContext } from '@phosphor-icons/react';
import { getBuddyCardTint, OWNER_SELF } from '../../utils/buddies';
import { getUnitLabel } from '../../utils/unitConversion';
import {
  getPurposeIconComponent,
  getPurposeIconColor,
  inferPurposeIconFromCompound,
  PURPOSE_ICON_WEIGHT,
  PURPOSE_ICON_OPTIONS,
} from '../../utils/protocolPurposeIcons';
import StockpileEntrySummaryRow, { STOCKPILE_ENTRY_CARD_STACKED_GRID } from './StockpileEntrySummaryRow';

const ICON_PICKER_CELL_SIZE = 40;
const ICON_PICKER_GAP_SIZE = 6;
const ICON_PICKER_WIDTH_PADDING = 28;
const ICON_PICKER_ICON_SIZE = 21;

export default function StockpileGroupCard({
  group,
  hasMatchingIncoming = false,
  theme,
  layoutMode = 'stacked',
  isUnknownGroup,
  vendorMap,
  isReadOnly,
  onCardClick,
  onMergeIndividualItem,
  onDeleteItem,
  onViewOrder,
  onSendToRecon,
  onPreviewImage,
  onViewDetails,
  onCompleteEntry,
  onRenameConfirm,
  onConfirmLooksRight,
}) {
  // Derive buddy ownership from the first item in the group
  const allItems = Object.values(group.variants).flatMap(v => v.items || []);
  const isBuddyOwned = allItems.some(i => i.ownerId && i.ownerId !== OWNER_SELF);
  const needsReconfirm = allItems.some(i => i.needsReconfirm);

  const hasLowStock = Object.values(group.variants).some(v => v.totalVials <= 2);
  const showChip = hasLowStock || hasMatchingIncoming || needsReconfirm;
  const chipText = needsReconfirm
    ? 'Confirm Qty'
    : hasLowStock && hasMatchingIncoming
    ? 'Low - More en Route'
    : hasMatchingIncoming ? 'En Route' : hasLowStock ? 'Low' : '';
  const chipIsLowEnRoute = !needsReconfirm && hasLowStock && hasMatchingIncoming;
  const chipIsReconfirm = needsReconfirm;

  const firstVariant = Object.values(group.variants)[0];
  const firstItem = firstVariant?.items?.[0];
  const containerUnit = firstItem?.unit || group.containerUnit || 'vial';
  const containerLabel = getUnitLabel(containerUnit, group.totalVials);

  const explicitIcon = firstItem?.purposeIcon;
  const resolvedIconId = explicitIcon || inferPurposeIconFromCompound(group.name);
  const PurposeIcon = resolvedIconId ? getPurposeIconComponent(resolvedIconId) : null;
  const resolvedIconColor = resolvedIconId ? getPurposeIconColor(resolvedIconId) : null;

  // Buddy tint: darker version of the card's own purpose-icon color
  const buddyTint = isBuddyOwned ? getBuddyCardTint(resolvedIconColor || theme?.primary, theme?.isDark) : {};
  const titleLength = String(group.name || '').replace(/\s+/g, '').length;
  const titleFontSize = layoutMode === 'columns'
    ? titleLength > 20 ? '0.78rem' : titleLength > 15 ? '0.88rem' : '1.125rem'
    : titleLength > 28 ? '0.95rem' : titleLength > 20 ? '1.02rem' : '1.125rem';
  const titleLetterSpacing = titleLength > 15 ? '-0.03em' : '-0.01em';

  // ── Inline edit state ──────────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editingIconId, setEditingIconId] = useState(null);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconPickerLayout, setIconPickerLayout] = useState({ cols: 5, width: 300, left: 0 });
  const nameInputRef = useRef(null);
  const iconPickerRef = useRef(null);
  const iconBtnRef = useRef(null);

  useEffect(() => {
    if (!showIconPicker) return;

    const updateLayout = () => {
      const viewportWidth = window.innerWidth || 360;
      const anchorRect = iconBtnRef.current?.getBoundingClientRect();
      const cols = viewportWidth < 390 ? 3 : viewportWidth < 560 ? 4 : 5;
      const width = cols * ICON_PICKER_CELL_SIZE + (cols - 1) * ICON_PICKER_GAP_SIZE + ICON_PICKER_WIDTH_PADDING; // cells + gaps + popover/grid padding
      const safeMargin = 12;
      let left = 0;

      if (anchorRect) {
        const overflowRight = anchorRect.left + width - (viewportWidth - safeMargin);
        if (overflowRight > 0) left -= overflowRight;
        if (anchorRect.left + left < safeMargin) left += safeMargin - (anchorRect.left + left);
      }

      setIconPickerLayout({ cols, width, left });
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    window.addEventListener('orientationchange', updateLayout);
    return () => {
      window.removeEventListener('resize', updateLayout);
      window.removeEventListener('orientationchange', updateLayout);
    };
  }, [showIconPicker]);

  useEffect(() => {
    if (!showIconPicker) return;
    const onDown = (e) => {
      if (iconPickerRef.current?.contains(e.target)) return;
      if (iconBtnRef.current?.contains(e.target)) return;
      setShowIconPicker(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showIconPicker]);

  const startEdit = (e, { openIconPicker = false, focusName = true } = {}) => {
    e?.stopPropagation();
    if (isReadOnly) { window.dispatchEvent(new CustomEvent('tpp:show-upgrade-modal')); return; }
    setEditedName(group.name);
    setEditingIconId(resolvedIconId);
    setShowIconPicker(openIconPicker);
    setIsEditing(true);
    if (focusName) {
      requestAnimationFrame(() => nameInputRef.current?.focus());
    }
  };

  const confirmEdit = (e) => {
    e?.stopPropagation();
    const finalName = editedName.trim() || group.name;
    onRenameConfirm?.(group.name, finalName, editingIconId);
    setIsEditing(false);
    setShowIconPicker(false);
  };

  const cancelEdit = (e) => {
    e?.stopPropagation();
    setIsEditing(false);
    setShowIconPicker(false);
  };

  const openQuickIconPicker = (e) => {
    e?.stopPropagation();
    if (isReadOnly) { window.dispatchEvent(new CustomEvent('tpp:show-upgrade-modal')); return; }
    setIsEditing(false);
    setEditingIconId(resolvedIconId);
    setShowIconPicker(v => !v);
  };

  const saveQuickIcon = (e, iconId) => {
    e?.stopPropagation();
    setEditingIconId(iconId);
    setShowIconPicker(false);
    setIsEditing(false);
    if (iconId !== resolvedIconId) {
      onRenameConfirm?.(group.name, group.name, iconId);
    }
  };

  const EditingIcon = editingIconId ? getPurposeIconComponent(editingIconId) : null;

  return (
    <div
      onClick={isEditing ? undefined : onCardClick}
      className={`group relative rounded-2xl cursor-pointer transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] hover:shadow-2xl glass-panel-minimal ${isBuddyOwned ? 'buddy-owned' : ''}`}
      style={{
        ...(isBuddyOwned ? {
          '--buddy-bg': buddyTint.backgroundColor,
          '--buddy-border': `${resolvedIconColor || theme?.primary}55`,
          '--buddy-shadow': buddyTint.boxShadow || 'none',
        } : {
          boxShadow: theme.isDark
            ? '0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            : '0 2px 16px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.04)',
          border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
        }),
        cursor: isEditing ? 'default' : 'pointer',
        zIndex: isEditing || showIconPicker ? 40 : undefined,
      }}
    >
      {/* Decorative gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none overflow-hidden rounded-2xl"
        style={{ background: `radial-gradient(circle at top right, ${theme.primary}15 0%, transparent 60%)` }}
      />

      {/* Content */}
      <div className="relative p-2 sm:p-3">
        {/* Unknown Group Alert Banner */}
        {isUnknownGroup && (
          <div
            className="mb-3 p-2.5 rounded-xl border flex flex-col gap-2"
            style={{
              backgroundColor: theme.isDark ? 'rgba(200, 122, 92, 0.12)' : 'rgba(200, 122, 92, 0.08)',
              borderColor: theme.isDark ? 'rgba(200, 122, 92, 0.3)' : 'rgba(200, 122, 92, 0.2)'
            }}
          >
            <div className="flex items-center gap-2">
              <PenTool size={14} style={{ color: '#c87a5c', flexShrink: 0 }} />
              <p className="text-xs font-normal flex-1" style={{ color: theme.text, fontFamily: 'Poppins, sans-serif' }}>
                Incomplete entry - matching the research principal
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isReadOnly) { window.dispatchEvent(new CustomEvent('tpp:show-upgrade-modal')); return; }
                const fi = Object.values(group.variants)[0]?.items[0];
                if (fi && onCompleteEntry) onCompleteEntry(fi);
              }}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90"
              style={{ backgroundColor: '#c87a5c', color: '#ffffff', fontFamily: 'Poppins, sans-serif' }}
            >
              Complete Entry
            </button>
          </div>
        )}

        {/* Header Section */}
        <div className="mb-3">
          {isEditing ? (
            /* ── Inline edit header ── */
            <div
              className="flex items-center gap-1.5 min-w-0"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Category icon button → opens picker */}
              <div className="relative flex-shrink-0">
                <button
                  ref={iconBtnRef}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowIconPicker(v => !v); }}
                  className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:opacity-80"
                  style={{ backgroundColor: editingIconId ? `${getPurposeIconColor(editingIconId)}22` : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') }}
                  title="Change category"
                >
                  {EditingIcon ? (
                    <IconContext.Provider value={{ weight: PURPOSE_ICON_WEIGHT }}>
                      <EditingIcon size={20} style={{ color: getPurposeIconColor(editingIconId) }} />
                    </IconContext.Provider>
                  ) : (
                    <span className="text-xs opacity-40" style={{ color: theme.text }}>?</span>
                  )}
                </button>

                {/* Icon picker popover */}
                {showIconPicker && (
                  <div
                    ref={iconPickerRef}
                    className="absolute top-full z-50 mt-1 p-3 rounded-2xl shadow-2xl"
                    style={{
                      left: `${iconPickerLayout.left}px`,
                      backgroundColor: theme.isDark ? '#1c2820' : '#fff',
                      border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                      width: `${iconPickerLayout.width}px`,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div
                      className="grid gap-1.5 p-0.5 max-h-[320px] overflow-y-auto"
                      style={{ gridTemplateColumns: `repeat(${iconPickerLayout.cols}, ${ICON_PICKER_CELL_SIZE}px)` }}
                    >
                      {PURPOSE_ICON_OPTIONS.map(opt => {
                        const Ic = opt.Icon;
                        const active = editingIconId === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setEditingIconId(opt.id); setShowIconPicker(false); }}
                            className="w-10 h-10 flex items-center justify-center rounded-xl transition-all hover:opacity-90 active:scale-90"
                            style={{
                              backgroundColor: active ? `${opt.color}35` : `${opt.color}16`,
                              boxShadow: active ? `inset 0 0 0 2px ${opt.color}` : undefined,
                            }}
                            title={opt.label}
                          >
                            <IconContext.Provider value={{ weight: PURPOSE_ICON_WEIGHT }}>
                              <Ic size={ICON_PICKER_ICON_SIZE} style={{ color: opt.color }} />
                            </IconContext.Provider>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Name input */}
              <input
                ref={nameInputRef}
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && editedName.trim()) confirmEdit(e);
                  if (e.key === 'Escape') cancelEdit(e);
                }}
                className="flex-1 min-w-0 bg-transparent text-lg font-semibold outline-none border-b-2"
                style={{
                  color: theme.text,
                  fontFamily: 'Poppins, sans-serif',
                  borderColor: theme.primary,
                }}
                onClick={(e) => e.stopPropagation()}
              />

              {/* Confirm */}
              <button
                type="button"
                onClick={confirmEdit}
                className="flex-shrink-0 p-1 rounded-full transition-all hover:opacity-80"
                style={{ color: theme.primary }}
                title="Save"
              >
                <Check size={15} strokeWidth={2.5} />
              </button>

              {/* Cancel */}
              <button
                type="button"
                onClick={cancelEdit}
                className="flex-shrink-0 p-1 rounded-full transition-all hover:opacity-80"
                style={{ color: theme.textLight || theme.text }}
                title="Cancel"
              >
                <X size={15} strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            /* ── Normal header ── */
            <div className="relative flex items-center gap-2 mb-0.5 min-w-0">
              {PurposeIcon && (
                <div className="relative flex-shrink-0">
                  <button
                    ref={iconBtnRef}
                    type="button"
                    onClick={openQuickIconPicker}
                    className="flex-shrink-0 flex items-center justify-center rounded-xl p-1.5 transition-all active:scale-95 hover:opacity-85"
                    style={{ backgroundColor: resolvedIconColor ? `${resolvedIconColor}22` : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') }}
                    title="Change category icon"
                    aria-label="Change category icon"
                  >
                    <PurposeIcon size={24} weight={PURPOSE_ICON_WEIGHT} style={{ color: resolvedIconColor ?? theme.primary }} aria-hidden />
                  </button>

                  {showIconPicker && (
                    <div
                      ref={iconPickerRef}
                      className="absolute top-full z-50 mt-1 p-3 rounded-2xl shadow-2xl"
                      style={{
                        left: `${iconPickerLayout.left}px`,
                        backgroundColor: theme.isDark ? '#1c2820' : '#fff',
                        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`,
                        width: `${iconPickerLayout.width}px`,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className="grid gap-1.5 p-0.5 max-h-[320px] overflow-y-auto"
                        style={{ gridTemplateColumns: `repeat(${iconPickerLayout.cols}, ${ICON_PICKER_CELL_SIZE}px)` }}
                      >
                        {PURPOSE_ICON_OPTIONS.map(opt => {
                          const Ic = opt.Icon;
                          const active = (editingIconId || resolvedIconId) === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={(e) => saveQuickIcon(e, opt.id)}
                              className="w-10 h-10 flex items-center justify-center rounded-xl transition-all hover:opacity-90 active:scale-90"
                              style={{
                                backgroundColor: active ? `${opt.color}35` : `${opt.color}16`,
                                boxShadow: active ? `inset 0 0 0 2px ${opt.color}` : undefined,
                              }}
                              title={opt.label}
                            >
                              <IconContext.Provider value={{ weight: PURPOSE_ICON_WEIGHT }}>
                                <Ic size={ICON_PICKER_ICON_SIZE} style={{ color: opt.color }} />
                              </IconContext.Provider>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <h3
                  className="font-semibold truncate min-w-0"
                  style={{
                    color: theme.text,
                    fontFamily: 'Poppins, sans-serif',
                    fontSize: titleFontSize,
                    letterSpacing: titleLetterSpacing,
                    lineHeight: 1.25,
                  }}
                  title={group.name}
                >
                  {group.name}
                </h3>
                {layoutMode !== 'stacked' && (
                  <div className="flex items-center justify-between gap-2 mt-0.5 min-w-0">
                    <div className="flex items-baseline gap-1 min-w-0">
                      <span className="text-sm font-black leading-none tracking-tight" style={{ color: theme.primary, fontFamily: 'Poppins, sans-serif' }}>
                        {group.totalMg > 0 ? group.totalMg : group.totalVials}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide opacity-70 leading-none truncate" style={{ color: theme.text, fontFamily: 'Poppins, sans-serif' }}>
                        {group.totalMg > 0 ? (group.unit || 'mg') : containerLabel} total
                      </span>
                    </div>
                    {showChip && (
                      <div
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border flex-shrink-0"
                        style={{
                          fontFamily: 'Poppins, sans-serif',
                          backgroundColor: chipIsReconfirm ? 'rgba(245,158,11,0.12)' : 'transparent',
                          borderWidth: '1px',
                          borderColor: chipIsReconfirm
                            ? (theme.isDark ? 'rgba(251, 191, 36, 0.55)' : 'rgba(202, 138, 4, 0.45)')
                            : chipIsLowEnRoute || (hasLowStock && !hasMatchingIncoming)
                            ? (theme.isDark ? 'rgba(251, 191, 36, 0.5)' : 'rgba(202, 138, 4, 0.4)')
                            : (theme.isDark ? 'rgba(107, 142, 107, 0.5)' : 'rgba(85, 119, 85, 0.4)'),
                          color: chipIsReconfirm || chipIsLowEnRoute || (hasLowStock && !hasMatchingIncoming)
                            ? (theme.isDark ? '#fbbf24' : '#ca8a04')
                            : (theme.isDark ? '#6b8e6b' : '#557755')
                        }}
                      >
                        {chipText}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {layoutMode === 'stacked' && (
                <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                  {needsReconfirm && typeof onConfirmLooksRight === 'function' && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onConfirmLooksRight(group);
                      }}
                      className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border"
                      style={{
                        borderColor: theme.isDark ? 'rgba(251, 191, 36, 0.45)' : 'rgba(202, 138, 4, 0.4)',
                        color: theme.isDark ? '#fbbf24' : '#ca8a04',
                        backgroundColor: 'rgba(245,158,11,0.1)',
                        fontFamily: 'Poppins, sans-serif',
                      }}
                      title="Confirm quantity looks right"
                    >
                      Looks Right
                    </button>
                  )}
                  <div className="flex flex-col items-end leading-none">
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl font-black leading-none tracking-tight" style={{ color: theme.primary, fontFamily: 'Poppins, sans-serif' }}>
                        {group.totalMg > 0 ? group.totalMg : group.totalVials}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: theme.text, opacity: 0.75, fontFamily: 'Poppins, sans-serif' }}>
                        {group.totalMg > 0 ? (group.unit || 'mg') : containerLabel}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-start leading-none gap-px">
                    <span className="text-[8px] font-bold uppercase tracking-wide leading-tight" style={{ color: theme.text, opacity: 0.65, fontFamily: 'Poppins, sans-serif' }}>Total</span>
                    <span className="text-[8px] font-bold uppercase tracking-wide leading-tight" style={{ color: theme.text, opacity: 0.65, fontFamily: 'Poppins, sans-serif' }}>Stock</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Sub-header: status chip + total stock */}
          {!isEditing && layoutMode === 'stacked' && showChip && (
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <div
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wider border"
                style={{
                  fontFamily: 'Poppins, sans-serif',
                  backgroundColor: chipIsReconfirm ? 'rgba(245,158,11,0.12)' : 'transparent',
                  borderWidth: '1px',
                  borderColor: chipIsReconfirm
                    ? (theme.isDark ? 'rgba(251, 191, 36, 0.55)' : 'rgba(202, 138, 4, 0.45)')
                    : chipIsLowEnRoute || (hasLowStock && !hasMatchingIncoming)
                    ? (theme.isDark ? 'rgba(251, 191, 36, 0.5)' : 'rgba(202, 138, 4, 0.4)')
                    : (theme.isDark ? 'rgba(107, 142, 107, 0.5)' : 'rgba(85, 119, 85, 0.4)'),
                  color: chipIsReconfirm || chipIsLowEnRoute || (hasLowStock && !hasMatchingIncoming)
                    ? (theme.isDark ? '#fbbf24' : '#ca8a04')
                    : (theme.isDark ? '#6b8e6b' : '#557755')
                }}
              >
                {chipText}
              </div>
            </div>
          )}
        </div>

        {/* Flat item list */}
        <div className="flex flex-col gap-1 mt-2">
          {layoutMode === 'stacked' && (
            <div
              className="grid items-center px-3 pb-0.5"
              style={{
                gridTemplateColumns: STOCKPILE_ENTRY_CARD_STACKED_GRID,
                fontFamily: 'Poppins, sans-serif',
              }}
            >
              <span className="text-[10.5px] font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.95 }}>Vendor</span>
              <span className="text-[10.5px] font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.95 }}>Amt</span>
              <span className="text-[10.5px] font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.95 }}>Qty</span>
              <span className="text-[10.5px] font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.95 }}>Purity</span>
              <span className="text-[10.5px] font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.95 }}>Cap</span>
              <span />
            </div>
          )}
          {Object.values(group.variants)
            .sort((a, b) => String(a.mg).localeCompare(String(b.mg)))
            .flatMap(variant => variant.items)
            .map((item) => (
              <StockpileEntrySummaryRow
                key={item.id}
                item={item}
                group={group}
                mode="card"
                layoutMode={layoutMode}
                theme={theme}
                isUnknownGroup={isUnknownGroup}
                vendorMap={vendorMap}
                onSendToRecon={onSendToRecon}
                onReview={onViewDetails}
              />
            ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t flex items-center justify-center" style={{ borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)' }}>
          <div className="flex items-center gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
            <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: theme.text, fontFamily: 'Poppins, sans-serif' }}>
              Edit Stock
            </span>
            <ChevronDown size={12} style={{ color: theme.primary }} strokeWidth={3} />
          </div>
        </div>
      </div>
    </div>
  );
}
