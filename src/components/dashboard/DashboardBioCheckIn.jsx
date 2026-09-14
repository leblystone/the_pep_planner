import React, { useState, useCallback } from 'react';
import {
  ClipboardText,
  CaretLeft,
  Moon,
  MoonStars,
  WarningCircle,
  BatteryLow,
  BatteryMedium,
  BatteryFull,
  SmileySad,
  SmileyMeh,
  Smiley,
  CheckCircle,
  Warning,
  XCircle,
} from '@phosphor-icons/react';
import { getLocalDateString } from '../../utils/date';
import { getMergedMetricForDay, upsertMetricForDay } from '../../utils/metricsDisplay';
import { generateId } from '../../utils/string';

const STEPS = [
  {
    key: 'sleep',
    kind: 'rate',
    ratingType: 'sleep',
    title: 'Sleep quality',
    hint: 'How rested do you feel from last night—rough, okay, or solid?',
    colorKey: 'info',
  },
  {
    key: 'energy',
    kind: 'rate',
    ratingType: 'energy',
    title: 'Energy level',
    hint: 'Right now: drained, steady, or energized?',
    colorKey: 'warning',
  },
  {
    key: 'mood',
    kind: 'rate',
    ratingType: 'mood',
    title: 'Mood',
    hint: 'Overall today: down, neutral, or in a good place?',
    colorKey: 'success',
  },
  {
    key: 'pain',
    kind: 'rate',
    ratingType: 'pain',
    title: 'Pain level',
    hint: 'Any aches or discomfort today—not really, noticeable, or hard to ignore?',
    colorKey: 'error',
  },
];

/**
 * Neutral button palette — background stays white/grey, only icon+label text shifts.
 * slot 1 = muted grey (lowest), slot 2 = medium grey, slot 3 = primary accent (best/selected feel).
 */
function slotPalette(theme, slot) {
  const p = theme.primary;
  const d = theme.isDark;
  const textColors = d
    ? ['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0.88)']
    : ['rgba(0,0,0,0.28)',       'rgba(0,0,0,0.50)',      'rgba(0,0,0,0.72)'];
  const bg    = d ? 'rgba(255,255,255,0.07)' : '#ffffff';
  const border = d ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.09)';
  return {
    text: textColors[slot - 1],
    bg,
    border,
    fg: p,
    glow: `${p}55`,
  };
}

function ratingOptions(type) {
  switch (type) {
    case 'sleep':
      return [
        { icon: WarningCircle, label: 'Poor', value: 1 },
        { icon: Moon, label: 'Okay', value: 2 },
        { icon: MoonStars, label: 'Great', value: 3 },
      ];
    case 'energy':
      return [
        { icon: BatteryLow, label: 'Low', value: 1 },
        { icon: BatteryMedium, label: 'Med', value: 2 },
        { icon: BatteryFull, label: 'High', value: 3 },
      ];
    case 'mood':
      return [
        { icon: SmileySad, label: 'Low', value: 1 },
        { icon: SmileyMeh, label: 'OK', value: 2 },
        { icon: Smiley, label: 'Good', value: 3 },
      ];
    case 'pain':
      return [
        { icon: CheckCircle, label: 'None', value: 1 },
        { icon: Warning, label: 'Moderate', value: 2 },
        { icon: XCircle, label: 'High', value: 3 },
      ];
    default:
      return [
        { icon: BatteryLow, label: 'Low', value: 1 },
        { icon: BatteryMedium, label: 'Med', value: 2 },
        { icon: BatteryFull, label: 'High', value: 3 },
      ];
  }
}

function buildPatch(session) {
  const patch = {};
  ['sleep', 'energy', 'mood', 'pain'].forEach((k) => {
    const v = session[k];
    if (v != null && v >= 1 && v <= 3) patch[k] = v;
  });
  return patch;
}

/**
 * Step-by-step check-in for the same wellness fields as BodyMetricsModal / MetricsWidget.
 */
export default function DashboardBioCheckIn({ theme, metrics, onCommit, isReadOnly = false }) {
  const todayStr = getLocalDateString();

  const [step, setStep] = useState(0);
  const [session, setSession] = useState({});
  const [done, setDone] = useState(false);

  const finishFlow = useCallback(
    (nextSession) => {
      const patch = buildPatch(nextSession);
      if (Object.keys(patch).length === 0) {
        window.dispatchEvent(
          new CustomEvent('tpp:toast', {
            detail: { message: 'Nothing new to save — pick at least one rating.', type: 'info' },
          })
        );
        return;
      }
      const now = new Date().toISOString();
      const existing = getMergedMetricForDay(metrics, todayStr);
      const keepId = existing?.id || generateId();
      const updatedMetrics = upsertMetricForDay(
        metrics || [],
        { date: todayStr, ...patch, id: keepId },
        { keepId, now }
      );
      onCommit(updatedMetrics);
      window.dispatchEvent(
        new CustomEvent('tpp:toast', { detail: { message: '✓ Check-in saved', type: 'success' } })
      );
      setDone(true);
    },
    [metrics, onCommit, todayStr]
  );

  const stepDef = STEPS[step];
  const atLast = step === STEPS.length - 1;

  const pickRating = (key, value) => {
    const nextSession = { ...session, [key]: value };
    setSession(nextSession);
    if (!atLast) {
      setStep((s) => s + 1);
    } else {
      finishFlow(nextSession);
    }
  };

  const skipRating = () => {
    if (!atLast) {
      setStep((s) => s + 1);
    } else {
      finishFlow(session);
    }
  };

  const restart = () => {
    setDone(false);
    setStep(0);
    setSession({});
  };

  if (isReadOnly) {
    return (
      <div
        className="rounded-2xl px-3 py-3 text-center text-xs"
        style={{ backgroundColor: theme.cardBackground, color: theme.textLight, boxShadow: theme.isDark ? '0 2px 12px rgba(0,0,0,0.28)' : '0 2px 12px rgba(0,0,0,0.07)' }}
      >
        Check-in unavailable in read-only mode.
      </div>
    );
  }

  if (done) {
    return (
      <div
        className="rounded-2xl p-4 flex flex-col gap-3"
        style={{ backgroundColor: theme.cardBackground, boxShadow: theme.isDark ? '0 2px 12px rgba(0,0,0,0.28)' : '0 2px 12px rgba(0,0,0,0.07)' }}
      >
        <h3 className="text-base font-bold flex items-center gap-2" style={{ color: theme.text }}>
          Daily Check-In
          <ClipboardText size={22} weight="duotone" style={{ color: theme.primary }} />
        </h3>
        <p className="text-sm" style={{ color: theme.textLight }}>
          Saved for today — charts and Bio-Metrics will pick this up.
        </p>
        <button
          type="button"
          onClick={restart}
          className="w-full py-2.5 rounded-xl text-xs font-semibold touch-manipulation transition-opacity hover:opacity-95"
          style={{ backgroundColor: `${theme.primary}22`, color: theme.primary }}
        >
          Update check-in
        </button>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-3 sm:p-4 flex flex-col gap-3 min-h-[132px]"
      style={{ backgroundColor: theme.cardBackground, boxShadow: theme.isDark ? '0 2px 12px rgba(0,0,0,0.28)' : '0 2px 12px rgba(0,0,0,0.07)' }}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h3 className="text-base font-bold flex items-center gap-2 min-w-0" style={{ color: theme.text }}>
          <span className="truncate">Daily Check-In</span>
          <ClipboardText size={22} weight="duotone" style={{ color: theme.primary }} className="flex-shrink-0" aria-hidden />
        </h3>
        <span className="text-[10px] font-semibold tabular-nums flex-shrink-0" style={{ color: theme.textLight }}>
          {step + 1}/{STEPS.length}
        </span>
      </div>

      <div className="flex gap-1 justify-center">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="h-1 rounded-full transition-all"
            style={{
              width: i === step ? 18 : 7,
              backgroundColor: i <= step ? theme.primary : theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
            }}
          />
        ))}
      </div>

      {stepDef?.kind === 'rate' && (
        <>
          <div className="flex items-start justify-between gap-2">
            {step > 0 && (
              <button
                type="button"
                aria-label="Back"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="p-1.5 rounded-lg touch-manipulation shrink-0 mt-0.5"
                style={{ color: theme.text }}
              >
                <CaretLeft size={18} weight="bold" />
              </button>
            )}
            <div className={`flex-1 min-w-0 flex flex-col gap-0.5 ${step > 0 ? '' : 'pl-1'}`}>
              <span className="text-sm font-semibold leading-snug" style={{ color: theme.text }}>
                {stepDef.title}
              </span>
              <span
                className="text-xs font-medium leading-snug whitespace-nowrap"
                style={{
                  color: theme.isDark ? 'rgba(255,255,255,0.78)' : 'rgba(0,0,0,0.62)',
                }}
              >
                {stepDef.hint}
              </span>
            </div>
          </div>
          <div
            className="flex rounded-xl p-1 gap-1 border"
            style={{
              backgroundColor: theme.isDark ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.07)',
              borderColor: theme.border,
              boxShadow: theme.isDark
                ? 'inset 0 1px 2px rgba(0,0,0,0.5)'
                : 'inset 0 1px 2px rgba(0,0,0,0.06)',
            }}
          >
            {ratingOptions(stepDef.ratingType).map((option) => {
              const IconComponent = option.icon;
              const sel = session[stepDef.key] === option.value;
              const pal = slotPalette(theme, option.value);
              const shadowUnselected = theme.isDark
                ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 2px rgba(0,0,0,0.25)`
                : `inset 0 1px 0 rgba(255,255,255,0.85), 0 1px 2px rgba(0,0,0,0.05)`;
              const shadowSelected = `0 3px 12px ${pal.glow}, inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(0,0,0,0.18), 0 2px 6px rgba(0,0,0,0.12)`;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => pickRating(stepDef.key, option.value)}
                  className="flex-1 flex flex-col items-center justify-center gap-1 px-1 py-2.5 rounded-lg text-sm font-semibold transition-[color,background-color,box-shadow,border-color] touch-manipulation min-h-[60px] border"
                  style={
                    sel
                      ? {
                          backgroundColor: pal.fg,
                          borderColor: 'transparent',
                          boxShadow: shadowSelected,
                          color: '#fff',
                        }
                      : {
                          color: pal.text,
                          backgroundColor: pal.bg,
                          borderColor: pal.border,
                          boxShadow: shadowUnselected,
                        }
                  }
                >
                  <IconComponent size={26} weight="duotone" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex justify-center w-full">
            <button
              type="button"
              onClick={skipRating}
              className="py-1.5 px-2 text-[11px] font-semibold bg-transparent border-0 cursor-pointer underline underline-offset-[3px] decoration-[1.5px] touch-manipulation rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{
                color: theme.primary,
                textDecorationColor: theme.primary,
              }}
            >
              Skip for now
            </button>
          </div>
        </>
      )}
    </div>
  );
}
