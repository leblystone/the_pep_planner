import React, { useState, useMemo, useRef, useEffect } from 'react';
import { CheckSquareOffset, PenNib, CheckFat, Flask, Pill, Clock, MapPin, Eyedropper, SprayBottle, HandPalm, CaretDown, Lightning, Checks, Fire, Trophy, Syringe, BellSimpleRinging, Person } from '@phosphor-icons/react';
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
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getLastAsNeededDoseDateKey(protocol, doses) {
  if (!protocol?.id || !Array.isArray(doses) || doses.length === 0) return null;
  const pep = Array.isArray(protocol.peptides) ? protocol.peptides[0] : null;
  const nameKey = normalizePeptideName(pep?.name || protocol.name || '');
  let best = null;
  for (const d of doses) {
    if (!d) continue;
    const byProtocol = d.protocolId && d.protocolId === protocol.id;
    const doseName = normalizePeptideName(d.peptideName);
    const byName = !!nameKey && !!doseName && (
      doseName === nameKey ||
      doseName.startsWith(nameKey) ||
      nameKey.startsWith(doseName)
    );
    if (!byProtocol && !byName) continue;
    const key = d.dateKey || (typeof d.createdAt === 'string' ? d.createdAt.slice(0, 10) : null);
    if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (!best || key > best.key || (key === best.key && (d.createdAt || '') > (best.createdAt || ''))) {
      best = { key, createdAt: d.createdAt || '' };
    }
  }
  return best?.key || null;
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
      <p className="text-[11px] text-center leading-snug px-2" style={{ color: theme.textLight }}>
        Need a one-off dosage?
      </p>
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-1.5 px-3 rounded-full text-[11px] font-semibold"
        style={{
          color: '#ffffff',
          backgroundColor: theme.primary,
          border: 'none',
          height: HEADER_CONTROL_H,
        }}
        title="Log a one-off dose (no protocol needed)"
      >
        <Syringe size={14} weight="bold" color="#ffffff" aria-hidden />
        <span>Add</span>
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
const StreakPopover = ({ data, theme, onClose }) => {
  const { streak, lastRewardDate, streakStartDate } = data;

  const fmtDate = (key) => {
    if (!key) return '—';
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Mini calendar dots — last 7 days relative to lastRewardDate (or today)
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

  return (
    <>
      {/* Invisible overlay to catch outside clicks */}
      <div className="fixed inset-0 z-[90]" onClick={onClose} />
      <div
        className="absolute top-full right-0 mt-2 z-[100] w-64 rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          backgroundColor: theme.isDark ? 'rgba(15,23,42,0.97)' : theme.cardBackground || '#fff',
          borderColor: `${theme.primary}35`,
          boxShadow: `0 8px 32px -8px rgba(0,0,0,0.28), 0 0 0 1px ${theme.primary}18`,
        }}
      >
        {/* Header */}
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

        {/* Calendar dots */}
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

        {/* Stats */}
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
            <p className="text-[11px] text-center pt-1" style={{ color: theme.primary }}>
              {streak >= 7 ? '🔥 You\'re on fire — incredible consistency!' : streak >= 5 ? '⚡ Almost a full week — keep pushing!' : '💪 Building momentum — don\'t stop now!'}
            </p>
          )}
        </div>
      </div>
    </>
  );
};

/* ── Streak chip shown in every header ────────────────────────────────── */
const StreakChip = ({ streak, theme }) => {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);

  if (streak <= 0) return null;

  const handleClick = () => {
    if (!open) setData(getTaskStreakData());
    setOpen((v) => !v);
  };

  return (
    <div className="relative flex-shrink-0">
      <ModernTooltip text="View your streak" position="top" theme={theme} disabled={open}>
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-1 px-2.5 rounded-full border transition-all duration-200 hover:scale-105 active:scale-95"
          style={{
            height: HEADER_CONTROL_H,
            borderColor: `${theme.primary}45`,
            backgroundColor: open
              ? (theme.isDark ? `${theme.primary}28` : `${theme.primary}20`)
              : (theme.isDark ? `${theme.primary}18` : `${theme.primary}12`),
            boxShadow: open ? `0 0 0 2px ${theme.primary}30` : 'none',
          }}
          aria-label="View your streak"
          aria-expanded={open}
        >
          <Fire size={14} weight="bold" style={{ color: theme.primary }} />
          <span className="text-[11px] font-bold tabular-nums leading-none" style={{ color: theme.text }}>
            {streak}
          </span>
        </button>
      </ModernTooltip>
      {open && data && (
        <StreakPopover data={data} theme={theme} onClose={() => setOpen(false)} />
      )}
    </div>
  );
};

/* ── Tiered streak motivation messages — escalate as the streak grows ─── */
function getStreakMessage(streak) {
  if (streak <= 0)  return 'Great start — come back tomorrow!';
  if (streak === 1) return 'Great start — come back tomorrow!';
  if (streak === 2) return "Two days in a row — you're on a roll!";
  if (streak === 3) return 'Three days strong. Consistency is everything.';
  if (streak === 4) return 'Day 4! Building real momentum now.';
  if (streak === 5) return 'Halfway through the week — stay locked in!';
  if (streak === 6) return 'Six days straight. One more for a full week!';
  if (streak === 7) return '🏆 Full week! You crushed it — 7 days!';
  if (streak <= 13) return `${streak} days and counting. You're dialed in.`;
  if (streak === 14) return '🔥 Two full weeks! Your protocol is your lifestyle.';
  if (streak <= 20) return `${streak} days straight — elite consistency.`;
  if (streak === 21) return '21 days! Science says this is a habit now. 💪';
  if (streak <= 29) return `${streak}-day streak — few people get here.`;
  if (streak === 30) return '🏆 30 days! You built a real habit. Incredible.';
  if (streak <= 59) return `Day ${streak} — long-term thinker.`;
  if (streak === 60) return '60 days. Commitment at its finest. 🔥';
  if (streak <= 89) return `${streak} days in — you make this look easy.`;
  if (streak === 90) return '90 days — one full quarter of excellence! 🏆';
  return `Day ${streak} — you're in it for the long haul.`;
}

/* ── All-done banner — slides in ABOVE tasks when all tasks are complete ─ */
const ALL_DONE_PARTICLES = [
  { left: '8%',  size: 3, delay: 0.10, dur: 1.3 },
  { left: '22%', size: 4, delay: 0.30, dur: 1.5 },
  { left: '38%', size: 3, delay: 0.18, dur: 1.2 },
  { left: '54%', size: 5, delay: 0.42, dur: 1.6 },
  { left: '70%', size: 3, delay: 0.22, dur: 1.4 },
  { left: '85%', size: 4, delay: 0.35, dur: 1.3 },
];

const AllDoneBanner = ({ streak, theme, visible }) => {
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setAnimKey(k => k + 1), 2.5 * 60 * 1000);
    return () => clearInterval(id);
  }, [visible]);

  return (
    <div
      className="overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ maxHeight: visible ? '96px' : '0px', opacity: visible ? 1 : 0 }}
    >
      {/* key on the inner card so only the animations remount — outer slide stays open */}
      <div
        key={animKey}
        className="mx-2 mb-3 mt-1 rounded-xl px-4 py-3 flex items-center gap-3 border relative overflow-hidden"
        style={{
          background: theme.isDark
            ? `linear-gradient(120deg, ${theme.primary}20 0%, rgba(15,23,42,0.6) 100%)`
            : `linear-gradient(120deg, ${theme.primary}12 0%, ${theme.cardBackground || '#fff'} 100%)`,
          borderColor: `${theme.primary}35`,
          boxShadow: `0 4px 18px -6px ${theme.primary}30`,
        }}
      >
        {/* Shine sweep */}
        <div
          className="all-done-shine absolute inset-y-0 w-1/4 pointer-events-none"
          style={{ background: `linear-gradient(105deg, transparent, ${theme.primary}28, transparent)` }}
        />

        {/* Rising particles */}
        {ALL_DONE_PARTICLES.map((p, i) => (
          <div
            key={i}
            className="all-done-particle absolute rounded-full pointer-events-none"
            style={{
              left: p.left,
              bottom: '6px',
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: theme.primary,
              animationDuration: `${p.dur}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}

        <div
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center all-done-trophy relative"
          style={{ backgroundColor: `${theme.primary}20` }}
        >
          {/* Pulse ring */}
          <div className="all-done-pulse absolute inset-0 rounded-full" style={{ border: `2px solid ${theme.primary}` }} />
          <Trophy size={16} weight="duotone" style={{ color: theme.primary }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-bold leading-tight" style={{ color: theme.text }}>
            All done for today
          </p>
          <p className="text-[10px] leading-tight mt-0.5" style={{ color: theme.textLight }}>
            {getStreakMessage(streak)}
          </p>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Fire size={15} weight="duotone" style={{ color: theme.primary }} className="all-done-flame" />
            <span className="text-base font-black tabular-nums" style={{ color: theme.primary }}>{streak}</span>
          </div>
        )}
      </div>
      <style>{`
        .all-done-trophy { animation: allDoneBounce 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.1s both; }
        .all-done-flame  { animation: allDoneFlame  0.7s cubic-bezier(0.34,1.56,0.64,1) 0.25s both; }
        .all-done-shine  { animation: allDoneShine  1.1s ease-out 0.05s both; }
        .all-done-particle { animation: allDoneParticle 1.4s ease-out both; }
        .all-done-pulse  { animation: allDonePulse 1.4s ease-out 0.2s both; }
        @keyframes allDoneBounce {
          0%   { transform: scale(0.5) rotate(-15deg); opacity: 0; }
          70%  { transform: scale(1.15) rotate(5deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); }
        }
        @keyframes allDoneFlame {
          0%   { transform: scale(0.6) translateY(4px); opacity: 0; }
          60%  { transform: scale(1.2) translateY(-2px); opacity: 1; }
          100% { transform: scale(1) translateY(0); }
        }
        @keyframes allDoneShine {
          0%   { transform: translateX(-180%); opacity: 0; }
          25%  { opacity: 1; }
          100% { transform: translateX(420%); opacity: 0; }
        }
        @keyframes allDoneParticle {
          0%   { transform: translateY(0) scale(0);   opacity: 0; }
          15%  { transform: translateY(-6px) scale(1); opacity: 0.75; }
          70%  { transform: translateY(-28px) scale(0.8); opacity: 0.35; }
          100% { transform: translateY(-44px) scale(0); opacity: 0; }
        }
        @keyframes allDonePulse {
          0%   { transform: scale(1);   opacity: 0.9; }
          60%  { transform: scale(1.7); opacity: 0.2; }
          100% { transform: scale(2.1); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

/** Renders the as-needed / PRN protocols section below scheduled tasks. */
const AsNeededSection = ({ protocols, theme, onLog }) => {
  const { oneOffDoses } = useAppContext();
  if (!protocols || protocols.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 mb-2">
        <BellSimpleRinging size={16} weight="duotone" style={{ color: theme.textLight }} />
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: theme.textLight }}>
          As Needed
        </span>
      </div>
      <div className="space-y-1">
        {protocols.map((protocol) => {
          const pep = Array.isArray(protocol.peptides) ? protocol.peptides[0] : null;
          const displayName = pep?.name || protocol.name || 'As Needed';
          const doseLabel = pep?.dosage?.amount
            ? `${pep.dosage.amount} ${pep.dosage.unit || ''}`
            : '';
          const lastOn = formatLastDoseOn(getLastAsNeededDoseDateKey(protocol, oneOffDoses));
          return (
            <div
              key={protocol.id}
              className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-2"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : `${theme.primary}08`,
                border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.07)' : `${theme.primary}18`}`,
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Syringe size={18} weight="duotone" style={{ color: theme.primary, flexShrink: 0 }} />
                <div className="min-w-0">
                  <span className="text-xs font-medium truncate block" style={{ color: theme.text }}>
                    {displayName}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {doseLabel && (
                      <span className="text-[10px]" style={{ color: theme.textLight }}>{doseLabel}</span>
                    )}
                    {lastOn && (
                      <span
                        className="text-[10px] truncate"
                        style={{ color: theme.textLight, opacity: 0.8 }}
                      >
                        {doseLabel ? '· ' : ''}last dose: {lastOn}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onLog?.(protocol)}
                className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-80 touch-manipulation"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.textOnPrimary || '#fff',
                  border: 'none',
                }}
              >
                Log
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TasksWidget = ({ widget, theme, tasks, onToggle, onOpenQuickStart, onOpenFullSetup, onOpenLogOneOff, onSlotMove, onResetSlotMove, onSkipDose, onUndoSkip, onRescheduleToTomorrow, onRescheduleToDate, onClearCatchUp, scheduleActionsDisabled, asNeededProtocols, onLogAsNeeded }) => {
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
              <ModernTooltip text="About this widget" position="top" theme={theme}>
                <span className="inline-flex">
                  <ExpandableTooltip content={WIDGET_TOOLTIPS.tasks} theme={theme} controlSize={HEADER_ICON_HIT} />
                </span>
              </ModernTooltip>
              <SiteHistoryButton theme={theme} onClick={() => setShowInjectionHistory(true)} />
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
            <ModernTooltip text="About this widget" position="top" theme={theme}>
              <span className="inline-flex">
                <ExpandableTooltip content={WIDGET_TOOLTIPS.tasks} theme={theme} controlSize={HEADER_ICON_HIT} />
              </span>
            </ModernTooltip>
            <SiteHistoryButton theme={theme} onClick={() => setShowInjectionHistory(true)} />
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
            <ModernTooltip text="About this widget" position="top" theme={theme}>
              <span className="inline-flex">
                <ExpandableTooltip content={WIDGET_TOOLTIPS.tasks} theme={theme} controlSize={HEADER_ICON_HIT} />
              </span>
            </ModernTooltip>
            <SiteHistoryButton theme={theme} onClick={() => setShowInjectionHistory(true)} />
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
