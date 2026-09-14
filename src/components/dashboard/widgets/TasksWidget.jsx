import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckSquareOffset, PenNib, CheckFat, Flask, Pill, Clock, MapPin, Eyedropper, SprayBottle, HandPalm, CaretDown, Lightning, Checks, Fire, Trophy, Syringe, BellSimpleRinging, Person, PlusCircle, DotsThreeVertical, Sparkle, Medal, HandsClapping, Trash } from '@phosphor-icons/react';
import TasksList from '../TasksList';
import InjectionSiteSelector from '../../common/InjectionSiteSelector';
import InjectionHistoryModal from '../../common/InjectionHistoryModal';
import { penColors } from '../../../utils/penColors';
import { getChromeGradient } from '../../../utils/recon';
import { getInjectionHistory } from '../../../utils/injectionTracking';
import { debugLog } from '../../../utils/debugMode';
import { isInjectionSiteTrackingEnabled } from '../../../utils/injectionSiteSettings';
import ExpandableTooltip from '../../ui/ExpandableTooltip';
import ModernTooltip from '../../ui/ModernTooltip';
import { WIDGET_TOOLTIPS } from '../../../utils/widgetTooltips';
import { getTaskStreak, getTaskStreakData } from '../../../utils/taskStreak';
import { useAppContext } from '../../../context/AppContext';
import { getLocalDateString } from '../../../utils/date';

/** Shared height for Tasks header chips */
const HEADER_CONTROL_H = 28;
/** Larger hit target + glyph for naked icon buttons (help / site history) */
const HEADER_ICON_HIT = 32;
const HEADER_ICON_SIZE = 24;

function formatLastDoseOn(dateKey) {
  if (!dateKey || typeof dateKey !== 'string') return null;
  const today = getLocalDateString();
  if (dateKey === today) return 'today';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateKey === getLocalDateString(y)) return 'yesterday';
  const parts = dateKey.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return dateKey;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(dt.getTime())) return dateKey;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Strip emoji / extra junk so "Cagrilintide🥱" still matches logged "Cagrilintide". */
function normalizePeptideName(value) {
  return String(value || '')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/\s*\(as\s*needed\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function extractDoseDateKey(dose) {
  if (!dose) return null;
  const candidates = [
    dose.dateKey,
    typeof dose.date === 'string' ? dose.date.slice(0, 10) : null,
    typeof dose.loggedAt === 'string' ? dose.loggedAt.slice(0, 10) : null,
    typeof dose.createdAt === 'string' ? dose.createdAt.slice(0, 10) : null,
  ];
  for (const key of candidates) {
    if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  }
  return null;
}

function getLastAsNeededDoseDateKey(protocol, doses) {
  if (!protocol) return null;
  const pep = Array.isArray(protocol.peptides) ? protocol.peptides[0] : null;
  const nameKeys = [
    normalizePeptideName(pep?.name),
    normalizePeptideName(protocol.protocolName),
    normalizePeptideName(protocol.name),
  ].filter(Boolean);

  let best = null;

  if (Array.isArray(doses) && doses.length > 0) {
    for (const d of doses) {
      if (!d) continue;
      const byProtocol = !!(protocol.id && d.protocolId && d.protocolId === protocol.id);
      const doseName = normalizePeptideName(d.peptideName || d.name);
      const byName = !!doseName && nameKeys.some((nk) => (
        doseName === nk ||
        doseName.startsWith(nk) ||
        nk.startsWith(doseName)
      ));
      if (!byProtocol && !byName) continue;
      const key = extractDoseDateKey(d);
      if (!key) continue;
      if (!best || key > best.key || (key === best.key && (d.createdAt || '') > (best.createdAt || ''))) {
        best = { key, createdAt: d.createdAt || '' };
      }
    }
  }

  if (best?.key) return best.key;

  // Fallback: protocol start date if never logged as a one-off
  const start = protocol.startDate;
  if (typeof start === 'string' && /^\d{4}-\d{2}-\d{2}/.test(start)) {
    return start.slice(0, 10);
  }
  return null;
}

const SiteHistoryButton = ({ theme, onClick }) => (
  <ModernTooltip text="Injection site history" position="top" theme={theme}>
    <button
      type="button"
      onClick={onClick}
      className="rounded-full flex items-center justify-center transition-all hover:opacity-80 flex-shrink-0"
      style={{
        color: theme.primary,
        backgroundColor: 'transparent',
        width: HEADER_ICON_HIT,
        height: HEADER_ICON_HIT,
        padding: 0,
        border: 'none',
      }}
      aria-label="Injection site history"
    >
      <Person size={HEADER_ICON_SIZE} weight="duotone" color={theme.primary} aria-hidden />
    </button>
  </ModernTooltip>
);

/** Footer CTA at bottom of research scroll — one-off dosage */
const LogDoseFooter = ({ theme, onClick }) => {
  if (!onClick) return null;
  return (
    <div
      className="mt-auto pt-3 pb-1 flex flex-col items-center gap-1.5 flex-shrink-0"
      style={{ borderTop: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(47, 59, 58, 0.12)'}` }}
    >
      <button
        type="button"
        onClick={onClick}
        className="px-4 py-2 rounded-xl text-sm font-semibold touch-manipulation active:scale-[0.97] transition-all border"
        style={{
          color: theme.primaryDark || theme.text,
          backgroundColor: `${theme.primary}18`,
          borderColor: `${theme.primary}40`,
          boxShadow: `0 1px 3px ${theme.primary}28, inset 0 1px 0 rgba(255,255,255,0.65)`,
        }}
        title="Log a one-off dose (no protocol needed)"
      >
        Log dose
      </button>
    </div>
  );
};

const DeliveryIcon = ({ task, theme }) => {
  // Handle peptide delivery methods
  if (task.type === 'peptide') {
    if (task.deliveryMethod === 'pen') {
      return <PenNib size={12} weight="bold" className="sm:w-3.5 sm:h-3.5" style={{ color: theme.textLight }} />;
    }
    if (task.deliveryMethod === 'syringe' || task.deliveryMethod === 'pipette') {
      return <Eyedropper size={12} weight="bold" className="sm:w-3.5 sm:h-3.5" style={{ color: theme.textLight }} />;
    }
    if (task.deliveryMethod === 'nasal') {
      return <SprayBottle size={12} weight="bold" className="sm:w-3.5 sm:h-3.5" style={{ color: theme.textLight }} />;
    }
    if (task.deliveryMethod === 'topical') {
      return <HandPalm size={12} weight="bold" className="sm:w-3.5 sm:h-3.5" style={{ color: theme.textLight }} />;
    }
  }
  
  // Handle supplement delivery methods
  if (task.type === 'supplement') {
    const delivery = String(task.delivery || task.deliveryMethod || '').toLowerCase();
    if (delivery === 'injection' || delivery === 'syringe') {
      return <Eyedropper size={12} weight="bold" className="sm:w-3.5 sm:h-3.5" style={{ color: theme.textLight }} />;
    }
    if (delivery === 'powder') {
      return <Flask size={12} weight="bold" className="sm:w-3.5 sm:h-3.5" style={{ color: theme.textLight }} />;
    }
    if (delivery === 'pill' || delivery === 'oral') {
      return <Pill size={12} weight="bold" className="sm:w-3.5 sm:h-3.5" style={{ color: theme.textLight }} />;
    }
  }
  
  return null;
};

const getResolvedPenColor = (penColor) => {
  if (!penColor) return '#9ca3af';
  const raw = String(penColor || '').trim();
  // Type safety: ensure raw is a string before calling startsWith
  if (typeof raw !== 'string' || !raw) return '#9ca3af';
  const isHex = raw.startsWith('#');
  if (isHex) return raw;
  
  // Find color by name in penColors array
  const foundColor = penColors.find(color => 
    color.name.toLowerCase() === raw.toLowerCase()
  );
  
  
  return foundColor ? foundColor.hex : '#9ca3af';
};

const BookmarkRibbon = ({ theme }) => (
  <div 
    className="absolute -top-1 right-16 w-6 h-10 pointer-events-none hidden"
    style={{ 
      zIndex: 1,
      filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.15))'
    }}
  >
    <div 
      className="w-full h-full"
      style={{
        backgroundColor: theme.primary,
        clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 82%, 0 100%)',
      }}
    >
        <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-transparent" />
        <div className="absolute inset-0 opacity-20" style={{ 
            backgroundImage: 'radial-gradient(circle at center, white 1px, transparent 1px)',
            backgroundSize: '3px 3px'
        }} />
    </div>
  </div>
);

/* ── Streak popover shown when chip is clicked ────────────────────────── */
const StreakPopover = ({ data, theme, onClose, anchorRect, popoverRef }) => {
  const { streak, lastRewardDate, streakStartDate } = data;

  const fmtDate = (key) => {
    if (!key) return '—';
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const refKey = lastRewardDate || todayKey;
  const dots = Array.from({ length: 7 }, (_, i) => {
    const [y, m, d] = refKey.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() - (6 - i));
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const dayLabel = dt.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1);
    const filled = streakStartDate && lastRewardDate && key >= streakStartDate && key <= lastRewardDate;
    return { key, dayLabel, filled };
  });

  const POP_W = 256;
  const gap = 8;
  let top = (anchorRect?.bottom || 0) + gap;
  let left = (anchorRect?.right || POP_W) - POP_W;
  left = Math.max(8, Math.min(left, window.innerWidth - POP_W - 8));
  if (top + 280 > window.innerHeight - 8) {
    top = Math.max(8, (anchorRect?.top || 0) - 280 - gap);
  }

  return createPortal(
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="Streak details"
      className="fixed z-[2147483000] w-64 rounded-2xl border shadow-2xl overflow-hidden"
      style={{
        top,
        left,
        backgroundColor: theme.isDark ? 'rgba(15,23,42,0.97)' : theme.cardBackground || '#fff',
        borderColor: `${theme.primary}35`,
        boxShadow: `0 8px 32px -8px rgba(0,0,0,0.28), 0 0 0 1px ${theme.primary}18`,
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="px-4 pt-4 pb-3 text-center"
        style={{
          background: theme.isDark
            ? `linear-gradient(135deg, ${theme.primary}22 0%, transparent 100%)`
            : `linear-gradient(135deg, ${theme.primary}10 0%, transparent 100%)`,
        }}
      >
        <div className="flex justify-center mb-1">
          <Fire size={30} weight="duotone" style={{ color: theme.primary }} />
        </div>
        <div className="text-3xl font-black tabular-nums leading-none" style={{ color: theme.text }}>
          {streak}
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-widest mt-0.5" style={{ color: theme.textLight }}>
          day streak
        </div>
      </div>

      <div className="px-4 py-3 border-t" style={{ borderColor: `${theme.primary}18` }}>
        <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: theme.textLight }}>
          Last 7 days
        </p>
        <div className="flex justify-between gap-1">
          {dots.map(({ key, dayLabel, filled }) => (
            <div key={key} className="flex flex-col items-center gap-1">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200"
                style={{
                  backgroundColor: filled ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
                  boxShadow: filled ? `0 2px 8px ${theme.primary}45` : 'none',
                }}
              >
                {filled && <CheckFat size={12} weight="bold" style={{ color: '#fff' }} />}
              </div>
              <span className="text-[9px] font-medium" style={{ color: filled ? theme.primary : theme.textLight }}>
                {dayLabel}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 pb-4 space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-[11px]" style={{ color: theme.textLight }}>Streak started</span>
          <span className="text-[11px] font-semibold" style={{ color: theme.text }}>{fmtDate(streakStartDate)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[11px]" style={{ color: theme.textLight }}>Last completed</span>
          <span className="text-[11px] font-semibold" style={{ color: theme.text }}>{fmtDate(lastRewardDate)}</span>
        </div>
        {streak >= 3 && (
          <p className="text-[11px] text-center pt-1 flex items-center justify-center gap-1" style={{ color: theme.primary }}>
            {streak >= 7 ? (
              <><Fire size={14} weight="duotone" aria-hidden /> You're on fire — incredible consistency!</>
            ) : streak >= 5 ? (
              <><Lightning size={14} weight="duotone" aria-hidden /> Almost a full week — keep pushing!</>
            ) : (
              <><Sparkle size={14} weight="duotone" aria-hidden /> Building momentum — don't stop now!</>
            )}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 text-[11px] font-semibold py-1.5 rounded-lg border-0 touch-manipulation"
          style={{
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
            color: theme.textLight,
          }}
        >
          Close
        </button>
      </div>
    </div>,
    document.body
  );
};

/* ── Streak chip shown in every header (matches hydration card badge) ─── */
const StreakChip = ({ streak, theme }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const btnRef = useRef(null);
  const popoverRef = useRef(null);

  // Close on outside press — delayed so the opening click doesn't immediately dismiss
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (btnRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const timer = window.setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (streak <= 0) return null;

  const handleToggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (open) {
      setOpen(false);
      return;
    }
    const rect = btnRef.current?.getBoundingClientRect() || null;
    setData(getTaskStreakData());
    setAnchorRect(rect);
    setOpen(true);
  };

  const streakColor = theme.primaryDark || theme.text;

  return (
    <div className="relative flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        onMouseDown={(e) => e.stopPropagation()}
        title="View your streak"
        className="flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-full transition-all duration-200 hover:scale-105 active:scale-95 border-0"
        style={{
          backgroundColor: open
            ? (theme.primaryDark || theme.primary) + '38'
            : (theme.primaryDark || theme.primary) + '28',
          color: streakColor,
          boxShadow: open ? `0 0 0 2px ${(theme.primaryDark || theme.primary)}30` : 'none',
        }}
        aria-label="View your streak"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Fire size={16} weight="duotone" aria-hidden />
        <span className="tabular-nums leading-none">{streak}d</span>
      </button>
      {open && data && (
        <StreakPopover
          data={data}
          theme={theme}
          anchorRect={anchorRect}
          popoverRef={popoverRef}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
};

/* ── Tiered streak motivation — text only; milestone icons via Phosphor ── */
function getStreakMotivation(streak) {
  if (streak <= 1) {
    return { text: 'Great start — come back tomorrow!', Icon: null };
  }
  if (streak === 2) {
    return { text: "Two days in a row — you're on a roll!", Icon: null };
  }
  if (streak === 3) {
    return { text: 'Three days strong. Consistency is everything.', Icon: null };
  }
  if (streak === 4) {
    return { text: 'Day 4 — building real momentum now.', Icon: null };
  }
  if (streak === 5) {
    return { text: 'Halfway through the week — stay locked in.', Icon: null };
  }
  if (streak === 6) {
    return { text: 'Six days straight. One more for a full week.', Icon: null };
  }
  if (streak === 7) {
    return { text: 'Full week — you crushed it. Seven days!', Icon: Trophy };
  }
  if (streak <= 13) {
    return { text: `${streak} days and counting. You're dialed in.`, Icon: null };
  }
  if (streak === 14) {
    return { text: 'Two full weeks — your research is your lifestyle.', Icon: Fire };
  }
  if (streak <= 20) {
    return { text: `${streak} days straight — elite consistency.`, Icon: null };
  }
  if (streak === 21) {
    return { text: '21 days — science says this is a habit now.', Icon: Sparkle };
  }
  if (streak <= 29) {
    return { text: `${streak}-day streak — few people get here.`, Icon: null };
  }
  if (streak === 30) {
    return { text: '30 days — you built a real habit. Incredible.', Icon: Trophy };
  }
  if (streak <= 59) {
    return { text: `Day ${streak} — long-term researcher.`, Icon: null };
  }
  if (streak === 60) {
    return { text: '60 days. Commitment at its finest.', Icon: Fire };
  }
  if (streak <= 89) {
    return { text: `${streak} days in — you make this look easy.`, Icon: null };
  }
  if (streak === 90) {
    return { text: '90 days — one full quarter of excellence.', Icon: Medal };
  }
  return { text: `Day ${streak} — you're in it for the long haul.`, Icon: HandsClapping };
}

/* Sage confetti pieces for the all-done celebration */
const SAGE_CONFETTI = [
  { left: '6%',  delay: 0.05, dur: 1.55, w: 5, h: 8, rot: 28,  shape: 'rect',   tint: 0 },
  { left: '14%', delay: 0.18, dur: 1.75, w: 4, h: 4, rot: -40, shape: 'circle', tint: 1 },
  { left: '22%', delay: 0.08, dur: 1.45, w: 6, h: 3, rot: 65,  shape: 'rect',   tint: 2 },
  { left: '30%', delay: 0.28, dur: 1.85, w: 5, h: 5, rot: -15, shape: 'square', tint: 0 },
  { left: '38%', delay: 0.12, dur: 1.50, w: 4, h: 7, rot: 50,  shape: 'rect',   tint: 1 },
  { left: '46%', delay: 0.22, dur: 1.70, w: 5, h: 4, rot: -70, shape: 'rect',   tint: 2 },
  { left: '54%', delay: 0.04, dur: 1.60, w: 4, h: 4, rot: 20,  shape: 'circle', tint: 0 },
  { left: '62%', delay: 0.32, dur: 1.80, w: 6, h: 3, rot: -55, shape: 'rect',   tint: 1 },
  { left: '70%', delay: 0.15, dur: 1.48, w: 5, h: 5, rot: 35,  shape: 'square', tint: 2 },
  { left: '78%', delay: 0.25, dur: 1.72, w: 4, h: 8, rot: -25, shape: 'rect',   tint: 0 },
  { left: '86%', delay: 0.10, dur: 1.58, w: 5, h: 4, rot: 80,  shape: 'rect',   tint: 1 },
  { left: '92%', delay: 0.20, dur: 1.68, w: 4, h: 4, rot: -10, shape: 'circle', tint: 2 },
  { left: '10%', delay: 0.35, dur: 1.90, w: 3, h: 6, rot: 45,  shape: 'rect',   tint: 1 },
  { left: '50%', delay: 0.40, dur: 2.00, w: 5, h: 3, rot: -30, shape: 'rect',   tint: 0 },
  { left: '66%', delay: 0.38, dur: 1.82, w: 4, h: 5, rot: 12,  shape: 'square', tint: 2 },
];

const AllDoneBanner = ({ streak, theme, visible }) => {
  const [animKey, setAnimKey] = useState(0);
  const wasVisible = useRef(false);

  // Celebrate once when the day flips to all-done; stay constant afterward
  useEffect(() => {
    if (visible && !wasVisible.current) {
      setAnimKey((k) => k + 1);
    }
    wasVisible.current = visible;
  }, [visible]);

  const badgeColor = theme.primaryDark || theme.text;
  const badgeFill = (theme.primaryDark || theme.primary) + '28';
  const primary = theme.primary || '#7F9E95';
  const primaryDark = theme.primaryDark || primary;
  const sageTints = [
    primary,
    primaryDark,
    theme.isDark ? `${primary}cc` : '#9BB5AB',
  ];

  const { text: streakText, Icon: StreakIcon } = getStreakMotivation(streak);

  return (
    <div
      className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] flex justify-center"
      style={{ maxHeight: visible ? '110px' : '0px', opacity: visible ? 1 : 0 }}
    >
      {/* key on the inner card so only the animations remount — outer slide stays open */}
      <div
        key={animKey}
        className="mb-3 mt-1 rounded-xl px-4 py-2.5 inline-flex items-center gap-3 relative overflow-hidden w-fit max-w-full border-0"
        style={{
          backgroundColor: badgeFill,
          color: badgeColor,
        }}
      >
        {/* Sage confetti burst */}
        {SAGE_CONFETTI.map((p, i) => (
          <div
            key={i}
            className="all-done-confetti absolute pointer-events-none"
            style={{
              left: p.left,
              top: '-6px',
              width: `${p.w}px`,
              height: `${p.h}px`,
              backgroundColor: sageTints[p.tint % sageTints.length],
              borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'square' ? '1px' : '1px',
              opacity: 0.85,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
              ['--confetti-rot']: `${p.rot}deg`,
            }}
          />
        ))}

        {/* Shine sweep */}
        <div
          className="all-done-shine absolute inset-y-0 w-1/4 pointer-events-none"
          style={{ background: `linear-gradient(105deg, transparent, ${badgeColor}22, transparent)` }}
        />

        <Trophy
          size={28}
          weight="duotone"
          className="flex-shrink-0 all-done-trophy relative z-[1]"
          style={{ color: badgeColor }}
          aria-hidden
        />
        <div className="min-w-0 relative z-[1]">
          <p className="text-sm font-bold leading-tight" style={{ color: badgeColor }}>
            All done for today
          </p>
          <p className="text-xs font-semibold leading-tight mt-0.5 flex items-center gap-1" style={{ color: badgeColor, opacity: 0.9 }}>
            {StreakIcon && (
              <StreakIcon size={14} weight="duotone" style={{ color: badgeColor, flexShrink: 0 }} aria-hidden />
            )}
            <span>{streakText}</span>
          </p>
        </div>
      </div>
      <style>{`
        .all-done-trophy { animation: allDoneBounce 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s both; }
        .all-done-shine  { animation: allDoneShine  1.1s ease-out 0.05s both; }
        .all-done-confetti {
          animation-name: allDoneConfetti;
          animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
          animation-fill-mode: both;
        }
        @keyframes allDoneBounce {
          0%   { transform: scale(0.5) rotate(-15deg); opacity: 0; }
          70%  { transform: scale(1.15) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes allDoneShine {
          0%   { transform: translateX(-180%); opacity: 0; }
          25%  { opacity: 1; }
          100% { transform: translateX(420%); opacity: 0; }
        }
        @keyframes allDoneConfetti {
          0% {
            transform: translate3d(0, -4px, 0) rotate(0deg) scale(0.4);
            opacity: 0;
          }
          12% {
            opacity: 0.95;
            transform: translate3d(4px, 8px, 0) rotate(calc(var(--confetti-rot, 30deg) * 0.4)) scale(1);
          }
          55% {
            opacity: 0.85;
          }
          100% {
            transform: translate3d(-8px, 58px, 0) rotate(var(--confetti-rot, 30deg)) scale(0.7);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

/** Renders the as-needed / PRN protocols section below scheduled tasks. */
const AsNeededSection = ({ protocols, theme, onLog, onRemoveAsNeeded }) => {
  const { oneOffDoses } = useAppContext();
  const [menuOpenId, setMenuOpenId] = useState(null);

  useEffect(() => {
    if (!menuOpenId) return undefined;
    const close = (e) => {
      if (e.target.closest?.('[data-as-needed-menu]')) return;
      setMenuOpenId(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [menuOpenId]);

  if (!protocols || protocols.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <BellSimpleRinging size={18} weight="duotone" style={{ color: theme.textLight }} />
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: theme.textLight }}>
          As Needed
        </span>
        <ExpandableTooltip
          content={WIDGET_TOOLTIPS.as_needed}
          theme={theme}
          position="right"
          controlSize={24}
        />
      </div>
      <div className="flex flex-col">
        {protocols.map((protocol, index) => {
          const pep = Array.isArray(protocol.peptides) ? protocol.peptides[0] : null;
          const displayName = pep?.name || protocol.name || 'As Needed';
          const doseLabel = pep?.dosage?.amount
            ? `${pep.dosage.amount} ${pep.dosage.unit || ''}`
            : '';
          const lastOn = formatLastDoseOn(getLastAsNeededDoseDateKey(protocol, oneOffDoses));
          const isMenuOpen = menuOpenId === protocol.id;
          const isLast = index === protocols.length - 1;
          return (
            <div
              key={protocol.id}
              className="flex items-center gap-2 py-2.5 sm:py-3 px-1 min-w-0"
              style={{
                boxShadow: isLast
                  ? 'none'
                  : `0 1px 0 ${theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(127, 158, 149, 0.08)'}`,
              }}
            >
              <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Syringe size={24} weight="duotone" style={{ color: theme.primary, flexShrink: 0 }} />
                  <div className="min-w-0">
                    <span className="text-sm font-semibold truncate block" style={{ color: theme.text }}>
                      {displayName}
                    </span>
                    <div className="flex items-center gap-1.5 flex-wrap min-w-0 mt-0.5">
                      {doseLabel && (
                        <span className="text-xs" style={{ color: theme.textLight }}>{doseLabel}</span>
                      )}
                      <span
                        className="text-xs truncate"
                        style={{ color: theme.textLight, opacity: 0.8 }}
                      >
                        {doseLabel ? '· ' : ''}last dose: {lastOn || 'not yet'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="relative flex-shrink-0" data-as-needed-menu>
                  <button
                    type="button"
                    aria-label={`Options for ${displayName}`}
                    aria-expanded={isMenuOpen}
                    title="Options"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpenId(isMenuOpen ? null : protocol.id);
                    }}
                    className="p-1 rounded-md touch-manipulation relative transition-all duration-150 active:scale-90"
                    style={{
                      color: theme.textLight,
                      backgroundColor: isMenuOpen
                        ? (theme.isDark ? `${theme.primary}44` : `${theme.primary}2e`)
                        : 'transparent',
                      boxShadow: isMenuOpen
                        ? `inset 0 0 0 1.5px ${theme.primary}`
                        : 'none',
                      border: 'none',
                    }}
                  >
                    <DotsThreeVertical size={22} weight="bold" className="sm:w-6 sm:h-6" aria-hidden />
                  </button>
                  {isMenuOpen && (
                    <div
                      className="absolute right-0 top-full mt-1 z-30"
                      role="menu"
                      style={{
                        width: 220,
                        backgroundColor: theme.cardBackground || (theme.isDark ? '#1e293b' : '#fff'),
                        border: `1px solid ${theme.border}`,
                        borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
                        padding: '6px 0',
                      }}
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="w-full min-h-[44px] px-3.5 py-2.5 text-left text-sm flex items-center gap-2.5 touch-manipulation transition-colors active:opacity-80"
                        style={{ color: theme.text, backgroundColor: 'transparent', border: 'none' }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpenId(null);
                          onRemoveAsNeeded?.(protocol);
                        }}
                      >
                        <Trash size={18} weight="duotone" aria-hidden />
                        <span className="whitespace-nowrap">Remove as Needed</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onLog?.(protocol)}
                aria-label={`Log ${displayName}`}
                title="Log dose"
                className="flex-shrink-0 p-0.5 flex items-center justify-center transition-opacity hover:opacity-80 touch-manipulation active:scale-95"
                style={{
                  backgroundColor: 'transparent',
                  color: theme.primary,
                  border: 'none',
                }}
              >
                <PlusCircle size={28} weight="duotone" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TasksWidget = ({ widget, theme, tasks, onToggle, onOpenQuickStart, onOpenFullSetup, onOpenLogOneOff, onSlotMove, onResetSlotMove, onSkipDose, onUndoSkip, onRescheduleToTomorrow, onRescheduleToDate, onClearCatchUp, scheduleActionsDisabled, asNeededProtocols, onLogAsNeeded, onRemoveAsNeeded }) => {
  const [injectionTask, setInjectionTask] = useState(null);
  const [showInjectionHistory, setShowInjectionHistory] = useState(false);
  const [showStartOptions, setShowStartOptions] = useState(false);
  const clickTimers = useRef({});

  // Streak state — syncs from storage via global event
  const [streak, setStreak] = useState(() => getTaskStreak());
  useEffect(() => {
    const onUpdate = (e) => {
      const n = e.detail?.streak;
      setStreak(typeof n === 'number' ? n : getTaskStreak());
    };
    window.addEventListener('tpp:task-streak-updated', onUpdate);
    return () => window.removeEventListener('tpp:task-streak-updated', onUpdate);
  }, []);
  
  // Check if there are any injection tasks
  const hasInjectionTasks = useMemo(() => {
    if (!tasks) return false;
    return tasks.some(task => {
      const deliveryMethod = task.deliveryMethod || task.delivery;
      return deliveryMethod === 'syringe' || deliveryMethod === 'pipette' || deliveryMethod === 'pen' || deliveryMethod === 'injection';
    });
  }, [tasks]);
  
  debugLog('🎯 TasksWidget received:', { 
    tasksCount: tasks?.length || 0, 
    tasks: tasks?.slice(0, 3).map(t => ({ 
      name: t.name, 
      type: t.type, 
      deliveryMethod: t.deliveryMethod, 
      penColor: t.penColor,
      dose: t.dose,
      unit: t.unit
    })) || []
  }, 'tasks');
  
  
  const { showCompleted, groupByTime } = widget.settings;

  // Whether every scheduled (non one-off) task for today is checked off
  const allDone = useMemo(() => {
    const all = (tasks || []).filter((t) => !t.isOneOff);
    return all.length > 0 && all.every((t) => t.completed === true);
  }, [tasks]);
  
  // Filter tasks based on settings (always keep one-off logs visible)
  let filteredTasks = tasks || [];
  if (!showCompleted) {
    filteredTasks = filteredTasks.filter(task => !task.completed || task.isOneOff);
  }
  
  debugLog('🎯 TasksWidget filtered:', { 
    filteredCount: filteredTasks.length,
    showCompleted,
    willUseCompactLayout: filteredTasks.length <= 3
  }, 'tasks');

  // If no tasks, show compact empty state
  if (filteredTasks.length === 0) {
    return (
      <div className="h-full flex flex-col relative">
        <BookmarkRibbon theme={theme} />
      <div className={`px-4 py-3 relative z-10 widget-separator`} style={{ 
        borderColor: theme.isDark ? 'transparent' : 'rgba(47, 59, 58, 0.15)', 
        background: theme.isDark 
          ? `linear-gradient(135deg, ${theme.primary}30, rgba(255,255,255,0.05))` 
          : `linear-gradient(135deg, ${theme.primary}15, rgba(255,255,255,0.6))`,
        backdropFilter: 'blur(8px)'
      }}>
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xl font-bold flex items-center gap-2 truncate tracking-tight" style={{ color: theme.text }}>
              Today's Research
              <div className="p-1 rounded-md" style={{ background: theme.primary, color: '#fff' }}>
                <CheckSquareOffset size={18} weight="duotone" className="sm:w-4 sm:h-4 flex-shrink-0" />
              </div>
            </h3>
            <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
              <StreakChip streak={streak} theme={theme} />
              <SiteHistoryButton theme={theme} onClick={() => setShowInjectionHistory(true)} />
              <ModernTooltip text="About Today's Research" position="top" theme={theme}>
                <span className="inline-flex">
                  <ExpandableTooltip content={WIDGET_TOOLTIPS.tasks} theme={theme} controlSize={HEADER_ICON_HIT} />
                </span>
              </ModernTooltip>
            </div>
          </div>
        </div>
        
        <div className="flex-1 p-2 sm:p-4 flex flex-col gap-3 min-h-0 overflow-y-auto">
          {/* As Needed protocols — always visible even when nothing else is scheduled */}
          {Array.isArray(asNeededProtocols) && asNeededProtocols.length > 0 && (
            <AsNeededSection
              protocols={asNeededProtocols}
              theme={theme}
              onLog={onLogAsNeeded}
              onRemoveAsNeeded={onRemoveAsNeeded}
            />
          )}
          <div className="flex flex-col items-center justify-center gap-3 flex-1">
          {!showStartOptions ? (
            <>
              <p className="text-sm text-center px-2" style={{ color: theme.textLight }}>
                No research scheduled for today
              </p>
              <button
                type="button"
                onClick={() => (onOpenQuickStart || onOpenFullSetup) && setShowStartOptions(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors"
                style={{
                  color: theme.primary,
                  backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}15`,
                  border: `1px solid ${theme.primary}40`
                }}
              >
                Let&apos;s Start
                <CaretDown size={14} weight="bold" />
              </button>
            </>
          ) : (
            <div className="w-full max-w-[260px] space-y-2 overflow-y-auto">
              {onOpenQuickStart && (
                <button
                  type="button"
                  onClick={() => { setShowStartOptions(false); onOpenQuickStart(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{
                    color: theme.text,
                    backgroundColor: theme.isDark ? '#1f2937' : theme.secondary,
                    border: `1px solid ${theme.border}`
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? '#374151' : 'rgba(0,0,0,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? '#1f2937' : theme.secondary; }}
                >
                  <Lightning size={18} weight="duotone" style={{ color: theme.primary }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">Quick Start Protocol</div>
                    <div className="text-[10px] opacity-60">30 sec, add details later</div>
                  </div>
                </button>
              )}
              {onOpenFullSetup && (
                <button
                  type="button"
                  onClick={() => { setShowStartOptions(false); onOpenFullSetup(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
                  style={{
                    color: theme.text,
                    backgroundColor: theme.isDark ? '#1f2937' : theme.secondary,
                    border: `1px solid ${theme.border}`
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? '#374151' : 'rgba(0,0,0,0.06)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? '#1f2937' : theme.secondary; }}
                >
                  <Checks size={18} weight="duotone" style={{ color: theme.textLight }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">Full Protocol Setup</div>
                    <div className="text-[10px] opacity-60">Complete details</div>
                  </div>
                </button>
              )}
            </div>
          )}
          </div>
          <LogDoseFooter theme={theme} onClick={onOpenLogOneOff} />
        </div>
        
        <InjectionHistoryModal
          isOpen={showInjectionHistory}
          onClose={() => setShowInjectionHistory(false)}
          theme={theme}
          initialView="map"
        />
      </div>
    );
  }

  // If few tasks, show compact layout with modernized display
  if (filteredTasks.length <= 3) {
    return (
      <div className="h-full flex flex-col overflow-hidden relative">
      <BookmarkRibbon theme={theme} />
      <div className={`px-4 py-3 flex-shrink-0 relative z-10 widget-separator`} style={{ borderColor: theme.isDark ? 'transparent' : 'rgba(47, 59, 58, 0.15)', background: theme.isDark ? `linear-gradient(135deg, ${theme.primary}15, transparent)` : `linear-gradient(135deg, ${theme.primary}08, ${theme.primary}03)` }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold flex items-center gap-2 truncate" style={{ color: theme.text }}>
            Today's Research
            <CheckSquareOffset size={18} weight="duotone" className="sm:w-5 sm:h-5 flex-shrink-0" style={{ color: theme.primary }} />
          </h3>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <StreakChip streak={streak} theme={theme} />
            <SiteHistoryButton theme={theme} onClick={() => setShowInjectionHistory(true)} />
            <ModernTooltip text="About Today's Research" position="top" theme={theme}>
              <span className="inline-flex">
                <ExpandableTooltip content={WIDGET_TOOLTIPS.tasks} theme={theme} controlSize={HEADER_ICON_HIT} />
              </span>
            </ModernTooltip>
          </div>
        </div>
      </div>
        
        <div className="flex-1 p-2 sm:p-4 overflow-hidden overflow-y-auto pr-1 sm:pr-2 flex flex-col">
          <AllDoneBanner streak={streak} theme={theme} visible={allDone} />
          <TasksList
            tasks={filteredTasks}
            theme={theme}
            onToggle={onToggle}
            setInjectionTask={setInjectionTask}
            onSlotMove={onSlotMove}
            onResetSlotMove={onResetSlotMove}
            onSkipDose={onSkipDose}
            onUndoSkip={onUndoSkip}
            onRescheduleToTomorrow={onRescheduleToTomorrow}
            onRescheduleToDate={onRescheduleToDate}
            onClearCatchUp={onClearCatchUp}
            scheduleActionsDisabled={scheduleActionsDisabled}
          />
          {Array.isArray(asNeededProtocols) && asNeededProtocols.length > 0 && (
            <AsNeededSection
              protocols={asNeededProtocols}
              theme={theme}
              onLog={onLogAsNeeded}
              onRemoveAsNeeded={onRemoveAsNeeded}
            />
          )}
          <LogDoseFooter theme={theme} onClick={onOpenLogOneOff} />
        </div>
        
        <InjectionSiteSelector
          taskName={injectionTask?.name}
          task={injectionTask}
          onConfirm={(injectionSite) => {
            debugLog('💉 TasksWidget injection confirmed:', injectionSite, 'tasks');
            const taskToToggle = injectionTask;
            setInjectionTask(null);
            if (taskToToggle) onToggle(taskToToggle);
          }}
          onCancel={() => {
            debugLog('💉 TasksWidget injection cancelled', null, 'tasks');
            setInjectionTask(null);
          }}
          theme={theme}
          isVisible={!!injectionTask}
        />
        
        <InjectionHistoryModal
          isOpen={showInjectionHistory}
          onClose={() => setShowInjectionHistory(false)}
          theme={theme}
          initialView="map"
        />
      </div>
    );
  }

  // Default full layout for many tasks
  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      <BookmarkRibbon theme={theme} />
      <div className={`px-4 py-3 flex-shrink-0 relative z-10 widget-separator`} style={{ borderColor: theme.isDark ? 'transparent' : 'rgba(47, 59, 58, 0.15)', background: theme.isDark ? `linear-gradient(135deg, ${theme.primary}15, transparent)` : `linear-gradient(135deg, ${theme.primary}08, ${theme.primary}03)` }}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold flex items-center gap-2 truncate" style={{ color: theme.text }}>
            {widget.title}
            <CheckSquareOffset size={18} weight="duotone" className="sm:w-5 sm:h-5 flex-shrink-0" style={{ color: theme.primary }} />
          </h3>
          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <StreakChip streak={streak} theme={theme} />
            <SiteHistoryButton theme={theme} onClick={() => setShowInjectionHistory(true)} />
            <ModernTooltip text="About Today's Research" position="top" theme={theme}>
              <span className="inline-flex">
                <ExpandableTooltip content={WIDGET_TOOLTIPS.tasks} theme={theme} controlSize={HEADER_ICON_HIT} />
              </span>
            </ModernTooltip>
          </div>
        </div>
      </div>
      
      <div className="flex-1 p-2 sm:p-4 overflow-hidden overflow-y-auto pr-1 sm:pr-2 flex flex-col">
        <div>
          <AllDoneBanner streak={streak} theme={theme} visible={allDone} />
          <TasksList 
            tasks={filteredTasks} 
            theme={theme} 
            onToggle={onToggle}
            groupByTime={groupByTime}
            setInjectionTask={setInjectionTask}
            onSlotMove={onSlotMove}
            onResetSlotMove={onResetSlotMove}
            onSkipDose={onSkipDose}
            onUndoSkip={onUndoSkip}
            onRescheduleToTomorrow={onRescheduleToTomorrow}
            onRescheduleToDate={onRescheduleToDate}
            onClearCatchUp={onClearCatchUp}
            scheduleActionsDisabled={scheduleActionsDisabled}
          />
          {Array.isArray(asNeededProtocols) && asNeededProtocols.length > 0 && (
            <AsNeededSection
              protocols={asNeededProtocols}
              theme={theme}
              onLog={onLogAsNeeded}
              onRemoveAsNeeded={onRemoveAsNeeded}
            />
          )}
        </div>
        <LogDoseFooter theme={theme} onClick={onOpenLogOneOff} />
        
        <InjectionSiteSelector
          taskName={injectionTask?.name}
          task={injectionTask}
          onConfirm={(injectionSite) => {
            debugLog('💉 TasksWidget injection confirmed:', injectionSite, 'tasks');
            // Close the selector first to prevent multiple clicks
            const taskToToggle = injectionTask;
            setInjectionTask(null);
            // Then toggle the task completion
            if (taskToToggle) {
              onToggle(taskToToggle);
            }
          }}
          onCancel={() => {
            debugLog('💉 TasksWidget injection cancelled', null, 'tasks');
            setInjectionTask(null);
          }}
          theme={theme}
          isVisible={!!injectionTask}
        />
        
        <InjectionHistoryModal
          isOpen={showInjectionHistory}
          onClose={() => setShowInjectionHistory(false)}
          theme={theme}
          initialView="map"
        />
      </div>
    </div>
  );
};

export default TasksWidget;
