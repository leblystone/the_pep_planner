import React from 'react';
import { Microscope, WarningDiamond, Note as PhNote, CaretRight } from '@phosphor-icons/react';
import { getProtocolAccentHex } from '../../utils/protocolColors';
import { getBuddyCardTint, OWNER_SELF } from '../../utils/buddies';
import { ProtocolPurposeGlyph } from '../../utils/protocolPurposeIcons';
import ExpandableTooltip from '../ui/ExpandableTooltip';
import { WIDGET_TOOLTIPS } from '../../utils/widgetTooltips';

/**
 * Home-dashboard Active Protocols card (kept as custom UI via DashboardWidget).
 */
export default function ActiveProtocolsHomeCard({
  theme,
  protocols = [],
  allSideEffects = [],
  navigate,
  onSideEffect,
  onNotes,
}) {
  const activeProtocols = (protocols || []).filter((p) => p.active !== false);
  const accent = '#6B8FA3';

  return (
    <div className="h-full w-full p-4 sm:p-5 text-left overflow-hidden flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-base font-bold flex items-center gap-2 truncate min-w-0" style={{ color: theme.text }}>
          Active Protocols
          <Microscope size={22} weight="duotone" color={theme.primary} className="flex-shrink-0" aria-hidden />
        </h3>
        <div className="flex items-center gap-2 flex-shrink-0">
          {activeProtocols.length > 0 && (
            <span
              className="flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-full"
              style={{
                backgroundColor: (theme.primaryDark || theme.primary) + '28',
                color: theme.primaryDark || theme.text,
              }}
            >
              {activeProtocols.length} total
            </span>
          )}
          <span onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <ExpandableTooltip content={WIDGET_TOOLTIPS.active_protocols_notes} theme={theme} />
          </span>
        </div>
      </div>

      {activeProtocols.length === 0 ? (
        <button
          type="button"
          onClick={() => navigate('/app/protocols')}
          className="w-full flex-1 flex items-center gap-3 text-left rounded-xl p-1 -m-1 transition-transform active:scale-[0.99] touch-manipulation border-0 cursor-pointer bg-transparent"
        >
          <div
            className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${accent}18`, color: accent }}
          >
            <Microscope size={22} weight="duotone" color={accent} />
          </div>
          <div>
            <p className="text-base font-bold" style={{ color: theme.text }}>None</p>
            <p className="text-[11px]" style={{ color: theme.textLight }}>No active protocols — tap to open Protocols</p>
          </div>
        </button>
      ) : (
        <div className="flex flex-1 flex-col gap-2 min-h-0 overflow-y-auto">
          {activeProtocols.map((p) => {
            const color = getProtocolAccentHex(p);
            const isBuddyOwned = p?.ownerId && p.ownerId !== OWNER_SELF;
            const buddyTint = isBuddyOwned ? getBuddyCardTint(color, theme?.isDark) : null;
            const rowText = isBuddyOwned ? 'rgba(255,255,255,0.9)' : theme.text;
            const rowTextMuted = isBuddyOwned ? 'rgba(255,255,255,0.65)' : `${color}cc`;
            const recentFx = allSideEffects
              .filter((e) => e.protocolId === p.id && e.effect !== 'none')
              .slice(0, 3);
            const chipShadow = theme.isDark
              ? `0 2px 14px rgba(0,0,0,0.45), 0 0 0 1px ${color}42, inset 0 1px 0 ${color}38, inset 0 -1px 0 rgba(0,0,0,0.35)`
              : `0 2px 10px ${color}28, 0 1px 3px rgba(0,0,0,0.07), 0 0 0 1px ${color}35, inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -1px 0 ${color}18`;
            const chipHoverShadow = theme.isDark
              ? `0 4px 18px rgba(0,0,0,0.5), 0 0 0 1px ${color}55, inset 0 1px 0 ${color}45`
              : `0 4px 16px ${color}35, 0 1px 3px rgba(0,0,0,0.08), 0 0 0 1px ${color}45, inset 0 1px 0 rgba(255,255,255,0.85)`;
            const rowStyle = isBuddyOwned && buddyTint
              ? { backgroundColor: buddyTint.backgroundColor, boxShadow: buddyTint.boxShadow }
              : {
                  background: `linear-gradient(165deg, ${color}40 0%, ${color}1f 42%, ${color}0f 100%)`,
                  boxShadow: chipShadow,
                };

            return (
              <div
                key={p.id}
                className="rounded-xl flex items-center gap-2.5 px-2.5 py-2 transition-[box-shadow] duration-200 ease-out w-full min-w-0"
                style={rowStyle}
                onMouseEnter={isBuddyOwned ? undefined : (e) => { e.currentTarget.style.boxShadow = chipHoverShadow; }}
                onMouseLeave={isBuddyOwned ? undefined : (e) => { e.currentTarget.style.boxShadow = chipShadow; }}
              >
                <button
                  type="button"
                  onClick={() => navigate('/app/protocols', { state: { highlightProtocolId: p.id } })}
                  className="group flex items-center gap-2.5 min-w-0 flex-1 border-0 bg-transparent p-0 cursor-pointer touch-manipulation active:scale-[0.98] focus-visible:outline-none"
                  aria-label={`Open ${p.protocolName || 'protocol'}`}
                >
                  <ProtocolPurposeGlyph
                    protocol={p}
                    size={28}
                    className="shrink-0 transition-transform duration-200 group-hover:scale-[1.04]"
                    style={{ color: isBuddyOwned ? 'rgba(255,255,255,0.9)' : color }}
                  />
                  <div className="min-w-0 flex items-center gap-1.5">
                    <p className="text-sm font-semibold truncate leading-tight tracking-tight" style={{ color: rowText }}>
                      {p.protocolName || 'Untitled'}
                    </p>
                    {isBuddyOwned && (
                      <span
                        className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ color, backgroundColor: `${color}35`, border: `1px solid ${color}55` }}
                      >
                        Buddy
                      </span>
                    )}
                  </div>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                  {recentFx.length > 0 && (
                    <div className="flex flex-col items-end gap-0.5 max-w-[min(140px,35vw)] sm:max-w-[160px]">
                      {recentFx.slice(0, 2).map((e) => {
                        const sev = e.severity;
                        const sevColor = sev === 'severe' ? '#ef4444' : sev === 'moderate' ? '#f59e0b' : '#22c55e';
                        return (
                          <span
                            key={e.id}
                            className="text-[8px] font-bold px-1.5 py-0.5 rounded-full truncate max-w-full"
                            style={{ backgroundColor: `${sevColor}22`, color: sevColor, border: `1px solid ${sevColor}33` }}
                          >
                            {e.label || e.effect}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  <div className="w-px h-8 shrink-0 mx-0.5" style={{ backgroundColor: isBuddyOwned ? 'rgba(255,255,255,0.2)' : `${color}30` }} />

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSideEffect?.(p); }}
                    className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg touch-manipulation active:scale-[0.93] transition-all border"
                    style={{
                      backgroundColor: isBuddyOwned ? 'rgba(255,255,255,0.14)' : `${color}22`,
                      borderColor: isBuddyOwned ? 'rgba(255,255,255,0.22)' : `${color}40`,
                      boxShadow: isBuddyOwned
                        ? '0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)'
                        : `0 1px 3px ${color}28, inset 0 1px 0 rgba(255,255,255,0.65)`,
                    }}
                    title={`Log side effect for ${p.protocolName}`}
                  >
                    <WarningDiamond size={18} weight="duotone" style={{ color: isBuddyOwned ? 'rgba(255,255,255,0.9)' : color }} />
                    <span className="text-[11px] font-semibold leading-none" style={{ color: isBuddyOwned ? 'rgba(255,255,255,0.9)' : color }}>Side Effect</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onNotes?.(p); }}
                    className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg touch-manipulation active:scale-[0.93] transition-all border"
                    style={{
                      backgroundColor: isBuddyOwned ? 'rgba(255,255,255,0.14)' : `${color}22`,
                      borderColor: isBuddyOwned ? 'rgba(255,255,255,0.22)' : `${color}40`,
                      boxShadow: isBuddyOwned
                        ? '0 1px 2px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12)'
                        : `0 1px 3px ${color}28, inset 0 1px 0 rgba(255,255,255,0.65)`,
                    }}
                    title={`Notes for ${p.protocolName}`}
                  >
                    <PhNote size={18} weight="duotone" style={{ color: isBuddyOwned ? 'rgba(255,255,255,0.9)' : color }} />
                    <span className="text-[11px] font-semibold leading-none" style={{ color: isBuddyOwned ? 'rgba(255,255,255,0.9)' : color }}>Note</span>
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex gap-2 pt-0.5 w-full">
            <button
              type="button"
              onClick={() => onSideEffect?.({ id: null, protocolName: null })}
              className="flex-1 rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.97] touch-manipulation border"
              style={{
                color: theme.primaryDark || theme.text,
                borderColor: `${theme.primary}40`,
                backgroundColor: `${theme.primary}18`,
                boxShadow: `0 1px 3px ${theme.primary}28, inset 0 1px 0 rgba(255,255,255,0.65)`,
              }}
            >
              <WarningDiamond size={20} weight="duotone" />
              Side Effect
            </button>
            <button
              type="button"
              onClick={() => onNotes?.({ id: null, protocolName: null })}
              className="flex-1 rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.97] touch-manipulation border"
              style={{
                color: theme.primaryDark || theme.text,
                borderColor: `${theme.primary}40`,
                backgroundColor: `${theme.primary}18`,
                boxShadow: `0 1px 3px ${theme.primary}28, inset 0 1px 0 rgba(255,255,255,0.65)`,
              }}
            >
              <PhNote size={20} weight="duotone" />
              Notes
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => navigate('/app/protocols')}
        className="flex items-center justify-center gap-1.5 mt-auto pt-3 w-full border-0 bg-transparent touch-manipulation active:scale-[0.98]"
        style={{ color: theme.isDark ? theme.textLight : theme.primary }}
      >
        <span className="text-sm font-semibold">View all</span>
        <CaretRight size={14} weight="bold" aria-hidden />
      </button>
    </div>
  );
}
