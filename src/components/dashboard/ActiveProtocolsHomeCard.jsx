import React from 'react';
import { Microscope, WarningDiamond, Note as PhNote } from '@phosphor-icons/react';
import { getProtocolAccentHex } from '../../utils/protocolColors';
import { getBuddyCardTint, OWNER_SELF } from '../../utils/buddies';
import { ProtocolPurposeGlyph } from '../../utils/protocolPurposeIcons';

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
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ backgroundColor: `${theme.primary}18`, color: theme.primary }}
            >
              {activeProtocols.length} total
            </span>
          )}
          <button
            type="button"
            onClick={() => navigate('/app/protocols')}
            className="text-[10px] sm:text-[11px] font-semibold rounded-lg px-2 py-0.5 transition-colors hover:opacity-90 touch-manipulation"
            style={{ color: theme.isDark ? '#9BC9A4' : '#1f4d2c' }}
          >
            View all
          </button>
        </div>
      </div>

      {activeProtocols.length === 0 ? (
        <button
          type="button"
          onClick={() => navigate('/app/protocols')}
          className="w-full flex items-center gap-3 text-left rounded-xl p-1 -m-1 transition-transform active:scale-[0.99] touch-manipulation border-0 cursor-pointer bg-transparent"
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
        <div className="flex flex-col gap-2 min-h-0 overflow-y-auto">
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
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-[1.04]"
                    style={{
                      background: isBuddyOwned
                        ? 'linear-gradient(180deg, rgba(255,255,255,0.14) 0%, rgba(0,0,0,0.2) 100%)'
                        : `linear-gradient(180deg, ${color}55 0%, ${color}30 55%, ${color}1c 100%)`,
                      boxShadow: theme.isDark
                        ? 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.35)'
                        : `inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 ${color}35`,
                      color: isBuddyOwned ? 'rgba(255,255,255,0.9)' : color,
                    }}
                  >
                    <ProtocolPurposeGlyph
                      protocol={p}
                      size={22}
                      className="drop-shadow-[0_1px_1px_rgba(0,0,0,0.12)]"
                      style={{ color: isBuddyOwned ? 'rgba(255,255,255,0.9)' : color }}
                    />
                  </div>
                  <div className="min-w-0 flex items-center gap-1.5">
                    <p className="text-[11px] sm:text-xs font-semibold truncate leading-tight tracking-tight" style={{ color: rowText }}>
                      {p.protocolName || 'Untitled'}
                    </p>
                    {isBuddyOwned ? (
                      <span
                        className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ color, backgroundColor: `${color}35`, border: `1px solid ${color}55` }}
                      >
                        Buddy
                      </span>
                    ) : (
                      <span
                        className="w-2 h-2 rounded-full shrink-0 ring-2 ring-white/30 dark:ring-black/20 shadow-sm"
                        style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}99` }}
                        aria-hidden
                      />
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
                    className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg touch-manipulation active:scale-[0.93] transition-all"
                    style={{ backgroundColor: isBuddyOwned ? 'rgba(255,255,255,0.1)' : `${color}15` }}
                    title={`Log side effect for ${p.protocolName}`}
                  >
                    <WarningDiamond size={16} weight="duotone" style={{ color: isBuddyOwned ? 'rgba(255,255,255,0.85)' : color }} />
                    <span className="text-[10px] font-semibold leading-none" style={{ color: rowTextMuted }}>Side effect</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onNotes?.(p); }}
                    className="flex flex-col items-center gap-0.5 px-2.5 py-1.5 rounded-lg touch-manipulation active:scale-[0.93] transition-all"
                    style={{ backgroundColor: isBuddyOwned ? 'rgba(255,255,255,0.1)' : `${color}15` }}
                    title={`Notes for ${p.protocolName}`}
                  >
                    <PhNote size={16} weight="duotone" style={{ color: isBuddyOwned ? 'rgba(255,255,255,0.85)' : color }} />
                    <span className="text-[10px] font-semibold leading-none" style={{ color: rowTextMuted }}>Note</span>
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex gap-2 pt-0.5 w-full">
            <button
              type="button"
              onClick={() => onSideEffect?.({ id: null, protocolName: null })}
              className="flex-1 rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] touch-manipulation border"
              style={{ color: theme.textLight, borderColor: theme.border || 'rgba(0,0,0,0.08)', backgroundColor: 'transparent' }}
            >
              <WarningDiamond size={16} weight="duotone" />
              Side effect
            </button>
            <button
              type="button"
              onClick={() => onNotes?.({ id: null, protocolName: null })}
              className="flex-1 rounded-xl py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 transition-all active:scale-[0.97] touch-manipulation border"
              style={{ color: theme.textLight, borderColor: theme.border || 'rgba(0,0,0,0.08)', backgroundColor: 'transparent' }}
            >
              <PhNote size={16} weight="duotone" />
              Notes
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
