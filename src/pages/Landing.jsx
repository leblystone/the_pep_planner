import React, { useState, useEffect, useRef, useMemo, startTransition } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Apple, Play as LucidePlay } from 'lucide-react';
import {
  IconContext,
  ArrowRight,
  Check,
  CheckSquareOffset,
  Star,
  HandHeart,
  Desktop,
  CalendarDots,
  ChartBar,
  Package,
  ShoppingCart,
  MapPin,
  FileText,
  Calculator,
  BookOpen,
  Stack,
  Syringe,
  PenNib,
  Sun,
  Moon,
  SkipBack,
  Pause,
  Play,
  SkipForward,
  Pulse,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import logo from '../assets/tpp_logo.png';
import LandingContactModal from '../components/legal/LandingContactModal';
import LandingFooter from '../components/layout/LandingFooter';
import LandingHeader from '../components/layout/LandingHeader';
import { isNative, isPWAInstalled, isIOS, APP_STORE_IOS_URL } from '../utils/platform';
import { usePageSEO } from '../utils/pageSEO';
import { LANDING_CAROUSEL_COVERS } from '../data/landingCarouselCovers';
import { buildDecayCurve, getLevelAtTime } from '../utils/halfLife';

const LANDING_PAGE_BG = '#D7E0D9';
/** Paper Pep Planners — light warm greige section wash */
const PAPER_PLANNERS_BG = '#F5F3EF';
/** Inner planners card — white for max lightness vs section wash */
const PHYSICAL_PLANNERS_SURFACE = '#FFFFFF';
/** See it in action — same light grey as hero (#EFF2EE) */
const SEE_IT_IN_ACTION_BG = '#EFF2EE';
/** Footer-derived sage scale: step 3 (darkest content band before CTA/footer) */
const TOOLKIT_BG = '#8FA395';

/* ─── TodaysResearchCard ────────────────────────────────────────────────── */
function TodaysResearchCard({ darkMode, setDarkMode, checkedState, toggleCheck }) {
  const bg = darkMode ? '#1C2421' : '#FFFFFF';
  const headerBg = darkMode
    ? 'linear-gradient(135deg,rgba(127,158,149,0.18),rgba(127,158,149,0.08))'
    : 'linear-gradient(135deg,rgba(127,158,149,0.08),rgba(127,158,149,0.03))';
  const textColor = darkMode ? '#D5E0DC' : '#2F3B3A';
  const subColor = darkMode ? '#8FB0A8' : '#6B7280';

  return (
    <div
      className="rounded-xl overflow-hidden transition-colors duration-300"
      style={{
        backgroundColor: bg,
        boxShadow: darkMode
          ? '0 10px 30px rgba(0,0,0,0.4)'
          : '0 10px 25px rgba(127,158,149,0.15)',
        border: `1px solid ${darkMode ? 'rgba(127,158,149,0.25)' : 'rgba(47,59,58,0.15)'}`,
      }}
    >
      <div
        className="px-4 py-3 flex-shrink-0 relative z-10 widget-separator"
        style={{ borderColor: darkMode ? 'rgba(127,158,149,0.25)' : 'rgba(47,59,58,0.15)', background: headerBg }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-bold flex items-center gap-2 truncate" style={{ color: textColor }}>
            Today's Research
            <CheckSquareOffset className="w-5 h-5 flex-shrink-0" weight="duotone" style={{ color: '#7F9E95' }} />
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDarkMode((d) => !d)}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110"
              style={{
                backgroundColor: darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(47,59,58,0.06)',
                color: darkMode ? '#FFD166' : '#2F3B3A',
              }}
              aria-label="Toggle dark mode"
            >
              {darkMode ? <Sun className="w-5 h-5" weight="duotone" /> : <Moon className="w-5 h-5" weight="duotone" />}
            </button>
          </div>
        </div>
      </div>
      <div className="p-2 sm:p-4 lg:p-5">
        <ul className="space-y-1.5 lg:space-y-2">
          {[
            { id: 'b12', label: 'B12', dose: '1mL', Icon: Syringe, borderColor: 'rgba(127,158,149,0.4)', checkColor: '#7F9E95' },
            { id: 'glow', label: 'GLOW', dose: '16 units', Icon: PenNib, borderColor: 'rgba(75,95,88,0.5)', checkColor: '#3d5a4c', dotColor: '#8B5CF6' },
            { id: 'nad', label: 'Tirzepatide', dose: '10 units', Icon: Syringe, borderColor: 'rgba(127,158,149,0.4)', checkColor: '#7F9E95' },
          ].map(({ id, label, dose, Icon, borderColor, checkColor, dotColor }) => (
            <li
              key={id}
              className="flex items-center justify-between gap-2 py-2.5 px-3 min-w-0 transition-all duration-200"
              style={{ borderLeft: `3px solid ${borderColor}` }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`font-semibold text-sm truncate ${checkedState[id] ? 'line-through decoration-2' : ''}`}
                  style={{ color: checkedState[id] ? subColor : textColor }}
                >
                  {label}
                </div>
              </div>
              <div
                className={`text-right flex items-center gap-2 flex-shrink-0 ${checkedState[id] ? 'line-through decoration-2' : ''}`}
                style={{ color: checkedState[id] ? subColor : undefined }}
              >
                <span className="font-medium text-xs whitespace-nowrap" style={{ color: subColor }}>{dose}</span>
                {dotColor && (
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: dotColor, opacity: checkedState[id] ? 0.5 : 1 }} />
                )}
                <Icon
                  className="w-5 h-5"
                  weight="duotone"
                  style={{
                    color: subColor,
                    opacity: checkedState[id] ? 0.55 : 1,
                  }}
                />
                <button
                  type="button"
                  onClick={() => toggleCheck(id)}
                  className="w-5 h-5 rounded-sm border-2 flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 cursor-pointer touch-manipulation"
                  style={{
                    borderColor: checkedState[id] ? checkColor : 'rgba(127,158,149,0.4)',
                    backgroundColor: checkedState[id] ? checkColor : 'transparent',
                    borderRadius: 4,
                  }}
                >
                  {checkedState[id] && <Check size={14} weight="bold" className="text-white" />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ─── PeptideCalculatorWidget ───────────────────────────────────────────── */
const PCALC_SCENARIOS = [
  { bac: '3', mg: '5',  dose: '750'  },
  { bac: '2', mg: '10', dose: '500'  },
  { bac: '3', mg: '5',  dose: '250'  },
  { bac: '2', mg: '5',  dose: '1000' },
];

function ReconstitutionMathWidget() {
  // Committed (calculated) values
  const [vals, setVals] = useState({ bac: '3', mg: '5', dose: '750' });
  // Which field is actively being typed right now
  const [activeField, setActiveField] = useState(null);
  // The partially-typed string for the active field
  const [typingStr, setTypingStr]   = useState('');
  // Blinking cursor visibility
  const [cursorOn, setCursorOn]     = useState(true);

  const bac  = parseFloat(vals.bac)  || 0;
  const mg   = parseFloat(vals.mg)   || 0;
  const dose = parseFloat(vals.dose) || 0;
  const concentration = mg > 0 && bac > 0 ? (mg / bac).toFixed(3) : '—';
  const doseML = mg > 0 && bac > 0 && dose > 0
    ? ((dose / 1000) / (mg / bac)).toFixed(3)
    : '—';

  useEffect(() => {
    let aborted = false;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

    const typeField = async (key, str) => {
      if (aborted) return;
      setActiveField(key);
      setTypingStr('');           // clear field — show empty cursor
      await sleep(180);
      for (let i = 0; i < str.length; i++) {
        if (aborted) return;
        setTypingStr(str.slice(0, i + 1));
        await sleep(160);
      }
      if (aborted) return;
      // Commit the value so results recalculate
      setVals((prev) => ({ ...prev, [key]: str }));
      setTypingStr('');
      setActiveField(null);
      await sleep(380);
    };

    const runLoop = async () => {
      while (!aborted) {
        for (const s of PCALC_SCENARIOS) {
          if (aborted) return;
          await typeField('bac',  s.bac);
          if (aborted) return;
          await typeField('mg',   s.mg);
          if (aborted) return;
          await typeField('dose', s.dose);
          if (aborted) return;
          await sleep(2400);   // pause on completed result
        }
      }
    };

    runLoop();

    const blinkId = setInterval(() => {
      if (!aborted) setCursorOn((v) => !v);
    }, 500);

    return () => {
      aborted = true;
      clearInterval(blinkId);
    };
  }, []);

  /** Render the value cell for a field — typing or committed */
  const renderValue = (key, unit) => {
    if (activeField === key) {
      return (
        <span className="inline-flex items-center gap-px text-xs font-bold tabular-nums" style={{ color: '#2F665C' }}>
          {typingStr || <span style={{ opacity: 0 }}>0</span>}
          <span
            style={{
              display: 'inline-block',
              width: '1.5px',
              height: '11px',
              backgroundColor: '#2F665C',
              opacity: cursorOn ? 1 : 0,
              marginLeft: '1px',
              borderRadius: '1px',
              verticalAlign: 'middle',
              transition: 'opacity 0.08s',
            }}
          />
          {' '}
          <span className="text-[9px] font-normal ml-0.5" style={{ color: '#8AADA8' }}>{unit}</span>
        </span>
      );
    }
    return (
      <span className="text-xs font-bold tabular-nums" style={{ color: '#2F3B3A' }}>
        {vals[key]}{' '}
        <span className="text-[9px] font-normal" style={{ color: '#8AADA8' }}>{unit}</span>
      </span>
    );
  };

  return (
    <div
      className="w-full h-full flex flex-col rounded-xl overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(47,59,58,0.12)',
        boxShadow: '0 4px 14px rgba(47,59,58,0.08), 0 12px 36px rgba(47,59,58,0.12)',
      }}
    >
      <div
        className="px-3 py-2.5 lg:px-4 lg:py-3 flex-shrink-0 relative z-10 widget-separator"
        style={{ borderColor: 'rgba(47,59,58,0.15)', background: 'linear-gradient(135deg,rgba(127,158,149,0.08),rgba(127,158,149,0.03))' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs lg:text-sm font-bold" style={{ color: '#2F3B3A' }}>Peptide Calculator</h3>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-wide" style={{ color: '#4C6B52', backgroundColor: 'rgba(127,158,149,0.2)' }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#7F9E95' }} />
              DEMO
            </span>
            <Calculator className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#7F9E95' }} />
          </div>
        </div>
      </div>
      <div className="px-3 pt-2.5 pb-3 lg:px-4 lg:pb-4 flex flex-1 flex-col min-h-0 justify-between">
        {/* Input rows — mimic real app input fields with typing animation */}
        <div className="space-y-1.5">
          {[
            { key: 'bac',  label: 'BAC Water', unit: 'mL'  },
            { key: 'mg',   label: 'Peptide',   unit: 'mg'  },
            { key: 'dose', label: 'Dose',      unit: 'mcg' },
          ].map(({ key, label, unit }) => (
            <div
              key={key}
              className="flex items-center justify-between rounded-lg px-2.5 py-2 transition-all duration-200"
              style={{
                backgroundColor: activeField === key ? 'rgba(127,158,149,0.1)' : 'rgba(47,59,58,0.04)',
                border: activeField === key ? '1.5px solid rgba(127,158,149,0.55)' : '1px solid rgba(47,59,58,0.1)',
              }}
            >
              <span className="text-[10px]" style={{ color: '#6B7D7A' }}>{label}</span>
              {renderValue(key, unit)}
            </div>
          ))}
        </div>

        {/* Results — update when each field commits */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          {[
            { label: 'Concentration', value: concentration, unit: 'mg/mL' },
            { label: 'Vol / Dose',    value: doseML,        unit: 'mL'    },
          ].map(({ label, value, unit }) => (
            <div key={label} className="rounded-lg p-2 text-center" style={{ backgroundColor: 'rgba(127,158,149,0.1)', border: '1px solid rgba(127,158,149,0.2)' }}>
              <div className="text-[9px] font-medium uppercase tracking-wide mb-0.5" style={{ color: '#7F9E95' }}>{label}</div>
              <div className="text-xs font-bold tabular-nums transition-all duration-300" style={{ color: '#2F3B3A' }}>{value}</div>
              <div className="text-[9px]" style={{ color: '#8AADA8' }}>{unit}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── WashoutFlowGraphWidget ────────────────────────────────────────────── */
/**
 * Landing demo of Insights → Half-Life “Current Status” decay row.
 * Visuals match CompoundDecayRow (AnalyticsDashboard); auto-demo moves the “Now”
 * marker along a real single-dose half-life curve (no multi-dose stack fiction).
 */
const DEMO_HL_HOURS = 5 * 24; // ~5-day HL (e.g. Tirzepatide-style)
const DEMO_CLEAR_HOURS = DEMO_HL_HOURS * 7; // ~99% clearance ≈ 7 half-lives

function WashoutFlowGraphWidget() {
  const accent = '#7F9E95';
  const W = 360;
  const H = 110;
  const PAD_L = 28;
  const PAD_R = 8;
  const PAD_T = 14;
  const PAD_B = 22;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const pts = useMemo(
    () => buildDecayCurve(DEMO_HL_HOURS, DEMO_CLEAR_HOURS, 80),
    []
  );

  // Auto-demo: advance hours since dose from 0 → clearance, then loop
  const [hoursSince, setHoursSince] = useState(0);
  useEffect(() => {
    const STEP_H = DEMO_CLEAR_HOURS / 24; // ~24 frames across clearance
    const STEP_MS = 900;
    const PAUSE_MS = 2800;
    let h = 0;
    let timer = null;
    let pause = null;

    const tick = () => {
      h += STEP_H;
      if (h >= DEMO_CLEAR_HOURS) {
        setHoursSince(DEMO_CLEAR_HOURS);
        clearInterval(timer);
        timer = null;
        pause = setTimeout(() => {
          h = 0;
          setHoursSince(0);
          timer = setInterval(tick, STEP_MS);
        }, PAUSE_MS);
        return;
      }
      setHoursSince(h);
    };

    timer = setInterval(tick, STEP_MS);
    return () => {
      if (timer) clearInterval(timer);
      if (pause) clearTimeout(pause);
    };
  }, []);

  const currentLevel = getLevelAtTime(DEMO_HL_HOURS, hoursSince);
  const hoursUntilClear = Math.max(0, DEMO_CLEAR_HOURS - hoursSince);
  const alreadyClear = hoursUntilClear === 0;
  const pct = alreadyClear ? 0 : Math.round(currentLevel * 100);
  const remainingPct = Math.max(0, Math.min(100, Math.round((1 - hoursSince / DEMO_CLEAR_HOURS) * 100)));
  const rowAccent = alreadyClear ? '#16a34a' : accent;

  const pathPts = pts.map((pt) => {
    const x = PAD_L + (pt.hour / DEMO_CLEAR_HOURS) * chartW;
    const y = PAD_T + (1 - pt.level) * chartH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const linePath = `M${pathPts.join(' L')}`;
  const areaPath = `M${PAD_L},${PAD_T + chartH} L${pathPts.join(' L')} L${PAD_L + chartW},${PAD_T + chartH} Z`;

  const nowFraction = Math.min(Math.max(hoursSince / DEMO_CLEAR_HOURS, 0), 0.995);
  const nowX = PAD_L + nowFraction * chartW;
  const nowY = PAD_T + (1 - Math.min(Math.max(currentLevel, 0), 1)) * chartH;
  const hlX = PAD_L + Math.min(DEMO_HL_HOURS / DEMO_CLEAR_HOURS, 0.98) * chartW;
  const hlY = PAD_T + (1 - 0.5) * chartH;

  const fmtHoursAgo = (hours) => {
    if (hours < 1) return `${Math.round(hours * 60)}m ago`;
    if (hours < 48) return `${Math.round(hours)}h ago`;
    return `${Math.round(hours / 24)}d ago`;
  };
  const fmtAxis = (hours) => {
    if (hours < 48) return `${Math.round(hours)}h`;
    return `${(hours / 24).toFixed(hours / 24 >= 10 ? 0 : 1)}d`;
  };
  const fmtUntilClear = alreadyClear
    ? 'Cleared'
    : hoursUntilClear < 48
      ? `~${Math.round(hoursUntilClear)}h`
      : `~${(hoursUntilClear / 24).toFixed(1)}d`;

  const statusLine = alreadyClear
    ? `${fmtHoursAgo(hoursSince)} last dose · Fully cleared`
    : `${fmtHoursAgo(hoursSince)} last dose · Clears ${fmtUntilClear}`;

  return (
    <div
      className="w-full h-full flex flex-col rounded-xl overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(47,59,58,0.12)',
        boxShadow: '0 4px 14px rgba(47,59,58,0.08), 0 12px 36px rgba(47,59,58,0.12)',
      }}
    >
      <div
        className="px-3 py-2.5 lg:px-4 lg:py-3 flex-shrink-0 relative z-10 widget-separator"
        style={{ borderColor: 'rgba(47,59,58,0.15)', background: 'linear-gradient(135deg,rgba(127,158,149,0.08),rgba(127,158,149,0.03))' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs lg:text-sm font-bold" style={{ color: '#2F3B3A' }}>Half-Life</h3>
          <Pulse className="w-3.5 h-3.5 flex-shrink-0" style={{ color: accent }} aria-hidden />
        </div>
      </div>

      <div className="px-2.5 pt-2.5 pb-2 lg:px-3 lg:pb-3 flex flex-1 flex-col min-h-0">
        <div
          className="rounded-2xl p-3 flex flex-col flex-1 min-h-0"
          style={{
            border: '1px solid rgba(0,0,0,0.06)',
            backgroundColor: 'rgba(0,0,0,0.02)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm font-bold truncate" style={{ color: '#2F3B3A' }}>
                  Tirzepatide
                </span>
                <span
                  className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold shrink-0"
                  style={{ backgroundColor: `${accent}18`, color: accent }}
                >
                  5.0d HL
                </span>
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: '#6B7280' }}>
                {statusLine}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-black tabular-nums leading-none" style={{ color: rowAccent }}>
                {alreadyClear ? '0%' : `${pct}%`}
              </div>
              <div className="text-[9px] font-medium uppercase tracking-wider mt-0.5" style={{ color: '#6B7280' }}>
                {alreadyClear ? 'cleared' : 'active'}
              </div>
            </div>
          </div>

          <div className="h-2 rounded-full overflow-hidden mb-2.5" style={{ backgroundColor: 'rgba(0,0,0,0.06)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${remainingPct}%`,
                backgroundColor: rowAccent,
                opacity: 0.85,
              }}
            />
          </div>

          <div
            className="rounded-xl overflow-hidden"
            style={{
              backgroundColor: 'rgba(255,255,255,0.55)',
              border: '1px solid rgba(0,0,0,0.05)',
            }}
          >
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="block" style={{ height: 108 }}>
              <defs>
                <linearGradient id="landing-cdrow-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
                  <stop offset="55%" stopColor={accent} stopOpacity="0.12" />
                  <stop offset="100%" stopColor={accent} stopOpacity="0.02" />
                </linearGradient>
                <clipPath id="landing-cdrow-clip">
                  <rect x={PAD_L} y={PAD_T} width={chartW} height={chartH} rx="2" />
                </clipPath>
              </defs>

              {[100, 50, 0].map((pctVal) => {
                const y = PAD_T + (1 - pctVal / 100) * chartH;
                return (
                  <g key={`y-${pctVal}`}>
                    <line x1={PAD_L} y1={y} x2={PAD_L + chartW} y2={y} stroke="rgba(0,0,0,0.07)" strokeWidth="1" />
                    <text x={PAD_L - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#888" fontWeight="600">
                      {pctVal}%
                    </text>
                  </g>
                );
              })}

              <g clipPath="url(#landing-cdrow-clip)">
                <line x1={hlX} y1={PAD_T} x2={hlX} y2={PAD_T + chartH} stroke={accent} strokeWidth="1" strokeDasharray="3,3" opacity="0.35" />
                <path d={areaPath} fill="url(#landing-cdrow-grad)" />
                <path d={linePath} fill="none" stroke={accent} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
              </g>

              <circle cx={PAD_L} cy={PAD_T} r="3.5" fill={accent} opacity="0.25" />
              <circle cx={PAD_L} cy={PAD_T} r="2.25" fill={accent} />
              <circle cx={hlX} cy={hlY} r="2.5" fill="#fff" stroke={accent} strokeWidth="1.5" />

              <g>
                <line
                  x1={nowX} y1={PAD_T} x2={nowX} y2={PAD_T + chartH}
                  stroke={rowAccent} strokeWidth="1.25" strokeDasharray="4,3" opacity="0.75"
                />
                <circle cx={nowX} cy={nowY} r="5" fill={rowAccent} opacity="0.2" />
                <circle cx={nowX} cy={nowY} r="3" fill={rowAccent} />
                <rect
                  x={Math.min(Math.max(nowX - 14, PAD_L), PAD_L + chartW - 28)}
                  y={Math.max(PAD_T - 12, 2)}
                  width="28" height="11" rx="3"
                  fill={rowAccent}
                />
                <text
                  x={Math.min(Math.max(nowX, PAD_L + 14), PAD_L + chartW - 14)}
                  y={Math.max(PAD_T - 4, 10)}
                  textAnchor="middle"
                  fontSize="7"
                  fill="#fff"
                  fontWeight="700"
                >
                  Now
                </text>
              </g>

              {[
                { hour: 0, label: 'Dose' },
                { hour: DEMO_HL_HOURS, label: '½ life' },
                { hour: DEMO_CLEAR_HOURS, label: 'Clear' },
              ].map(({ hour, label }) => {
                const x = PAD_L + Math.min(hour / DEMO_CLEAR_HOURS, 1) * chartW;
                const timeBit = hour > 0 && hour < DEMO_CLEAR_HOURS
                  ? ` · ${fmtAxis(hour)}`
                  : hour >= DEMO_CLEAR_HOURS
                    ? ` · ${fmtAxis(DEMO_CLEAR_HOURS)}`
                    : '';
                return (
                  <text
                    key={label}
                    x={x}
                    y={H - 6}
                    textAnchor={hour === 0 ? 'start' : hour >= DEMO_CLEAR_HOURS ? 'end' : 'middle'}
                    fontSize="8"
                    fill="#888"
                    fontWeight="600"
                  >
                    {label}{timeBit}
                  </text>
                );
              })}
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── TitrationPhasesWidget ─────────────────────────────────────────────── */
const TITRATION_PHASES = [
  { label: 'Phase 1', dose: '0.25', unit: 'mg', note: 'Starting dose - tolerance build', color: '#4F8C7F', durationDays: 28 },
  { label: 'Phase 2', dose: '0.5', unit: 'mg', note: 'First escalation', color: '#3E7A6E', durationDays: 28 },
  { label: 'Phase 3', dose: '1.0', unit: 'mg', note: 'Maintenance or hold', color: '#2F665C', durationDays: 28 },
  { label: 'Phase 4', dose: '2.0', unit: 'mg', note: 'Target dose reached', color: '#1F4F48', durationDays: null },
];

function TitrationPhasesWidget() {
  const [phase, setPhase] = useState(0);
  const [held, setHeld] = useState(false);
  const [activeAction, setActiveAction] = useState(null);
  const actionTimerRef = useRef(null);
  const loopPauseRef = useRef(null);
  const phaseRef = useRef(phase);
  const current = TITRATION_PHASES[phase];
  const isMaintenancePhase = phase === TITRATION_PHASES.length - 1;
  const daysRemainingInPhase = current.durationDays ? Math.max(1, Math.round(current.durationDays * 0.35)) : null;
  const phaseFillPct = current.durationDays
    ? Math.max(5, Math.min(95, Math.round(((current.durationDays - daysRemainingInPhase) / current.durationDays) * 100)))
    : 50;

  const prev = () => { if (phase > 0) { setPhase((p) => p - 1); setHeld(false); } };
  const next = () => { if (phase < TITRATION_PHASES.length - 1) { setPhase((p) => p + 1); setHeld(false); } };
  const toggleHold = () => setHeld((h) => !h);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const STEP_MS = 1350;
    const LOOP_PAUSE_MS = 2600;
    const sequence = ['next', 'hold', 'resume', 'next', 'hold', 'resume', 'next', 'back', 'hold', 'resume', 'back'];

    const clearTimers = () => {
      if (actionTimerRef.current) {
        clearTimeout(actionTimerRef.current);
        actionTimerRef.current = null;
      }
      if (loopPauseRef.current) {
        clearTimeout(loopPauseRef.current);
        loopPauseRef.current = null;
      }
    };

    const applyAction = (action) => {
      setActiveAction(action);
      if (action === 'next') {
        setPhase((p) => Math.min(TITRATION_PHASES.length - 1, p + 1));
        setHeld(false);
        return;
      }
      if (action === 'back') {
        setPhase((p) => Math.max(0, p - 1));
        setHeld(false);
        return;
      }
      if (action === 'hold') {
        if (phaseRef.current < TITRATION_PHASES.length - 1) setHeld(true);
        return;
      }
      if (action === 'resume') {
        setHeld(false);
      }
    };

    const runLoop = () => {
      clearTimers();
      setPhase(0);
      setHeld(false);
      setActiveAction(null);
      let i = 0;

      const runStep = () => {
        if (i >= sequence.length) {
          setActiveAction(null);
          loopPauseRef.current = setTimeout(runLoop, LOOP_PAUSE_MS);
          return;
        }
        applyAction(sequence[i]);
        i += 1;
        actionTimerRef.current = setTimeout(runStep, STEP_MS);
      };

      runStep();
    };

    runLoop();
    return () => clearTimers();
  }, []);

  return (
    <div
      className="w-full rounded-xl overflow-hidden transition-all duration-300"
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid rgba(47,59,58,0.12)',
        boxShadow: '0 4px 14px rgba(47,59,58,0.08), 0 12px 36px rgba(47,59,58,0.12)',
      }}
    >
      <div
        className="px-4 py-3 lg:px-5 lg:py-3.5 flex-shrink-0 relative z-10 widget-separator"
        style={{ borderColor: 'rgba(47,59,58,0.15)', background: 'linear-gradient(135deg,rgba(127,158,149,0.08),rgba(127,158,149,0.03))' }}
      >
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm lg:text-base font-bold" style={{ color: '#2F3B3A' }}>Titration Phases</h3>
          <ChartBar className="w-4 h-4 lg:w-[18px] lg:h-[18px] flex-shrink-0" style={{ color: '#7F9E95' }} />
        </div>
      </div>
      <div className="p-4 lg:p-5">
        {/* Phase header (mirrors Active Protocols card style) */}
        <div className="flex items-end justify-between mb-2">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-bold leading-none" style={{ color: current.color }}>
              {current.dose} {current.unit}
            </span>
            <span className="text-[10px] font-medium leading-none opacity-60" style={{ color: '#2F3B3A' }}>
              Phase {phase + 1}/{TITRATION_PHASES.length}
            </span>
          </div>
          <span className="text-[10px] font-semibold leading-none opacity-55" style={{ color: '#2F3B3A' }}>
            {held ? 'HELD' : daysRemainingInPhase !== null ? `${daysRemainingInPhase}d left` : 'maintenance'}
          </span>
        </div>

        {/* Segmented phase bar */}
        <div className="flex items-center gap-[2px] h-[7px] w-full mb-2">
          {TITRATION_PHASES.map((p, idx) => {
            const isPast = idx < phase;
            const isCurr = idx === phase;
            return (
              <div
                key={p.label}
                className="h-full flex-1 rounded-full overflow-hidden relative"
                style={{
                  backgroundColor: isPast ? current.color : isCurr ? `${current.color}33` : `${current.color}1F`,
                  opacity: isPast ? 0.55 : 1,
                }}
              >
                {isCurr && (
                  <div
                    className="absolute inset-y-0 left-0 rounded-full"
                    style={{ width: `${phaseFillPct}%`, backgroundColor: current.color, boxShadow: `0 0 4px ${current.color}80` }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Dose labels */}
        <div className="flex items-center mb-3">
          {TITRATION_PHASES.map((p, idx) => {
            const isPast = idx < phase;
            const isCurr = idx === phase;
            return (
              <span
                key={p.label}
                className="flex-1 text-center text-[8px] font-medium truncate"
                style={{ color: isCurr ? current.color : '#6B7D7A', opacity: isPast ? 0.55 : isCurr ? 1 : 0.35 }}
              >
                {p.dose}{p.unit}
              </span>
            );
          })}
        </div>

        <div className="text-xs mb-3" style={{ color: '#6B7D7A' }}>{current.note}</div>

        {/* Segmented controls (visual copied from Active Protocols) */}
        <div className="flex w-full overflow-hidden rounded-xl" style={{ backgroundColor: 'rgba(47,59,58,0.12)', border: '1px solid rgba(47,59,58,0.14)' }}>
          {phase > 0 && (
            <button
              onClick={prev}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-bold transition-all flex-1"
              style={{
                color: activeAction === 'back' ? '#2F3B3A' : '#6B7D7A',
                backgroundColor: activeAction === 'back' ? 'rgba(127,158,149,0.18)' : 'transparent',
                borderRight: '1px solid rgba(0,0,0,0.1)',
              }}
            >
              <SkipBack className="w-3 h-3" /> Back
            </button>
          )}

          {!isMaintenancePhase && (
            <button
              onClick={toggleHold}
              className="flex items-center justify-center gap-1 px-3 py-1.5 text-[11px] font-bold transition-all flex-[2]"
              style={{
                borderRight: phase < TITRATION_PHASES.length - 1 ? '1px solid rgba(0,0,0,0.1)' : 'none',
                backgroundColor: activeAction === 'hold' || activeAction === 'resume' || held ? '#E8F8EE' : 'transparent',
                color: held ? '#16A34A' : activeAction === 'hold' || activeAction === 'resume' ? '#2F3B3A' : '#6B7D7A',
              }}
            >
              {held ? <><Play className="w-3 h-3" /> Resume</> : <><Pause className="w-3 h-3" /> Hold Dose</>}
            </button>
          )}

          {!isMaintenancePhase && phase < TITRATION_PHASES.length - 1 && (
            <button
              onClick={next}
              className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[11px] font-bold transition-all flex-1"
              style={{
                color: current.color,
                backgroundColor: activeAction === 'next' ? `${current.color}26` : 'transparent',
              }}
            >
              Next <SkipForward className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── ShopCarousel ──────────────────────────────────────────────────────── */
function ShopCarousel({ covers }) {
  const items = covers.filter(Boolean);
  const total = items.length;
  const [active, setActive] = useState(Math.floor(total / 2));
  const timerRef = useRef(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (total < 2 || paused) return;
    timerRef.current = setInterval(() => setActive((a) => (a + 1) % total), 3800);
    return () => clearInterval(timerRef.current);
  }, [total, paused]);

  const go = (idx) => setActive(((idx % total) + total) % total);

  /** Shortest circular offset from active → i (−floor(n/2) … +floor(n/2)) */
  const relativeOffset = (i) => {
    let offset = i - active;
    if (offset > Math.floor(total / 2)) offset -= total;
    if (offset < -Math.floor(total / 2)) offset += total;
    return offset;
  };

  return (
    <div
      className="relative select-none"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative w-full overflow-hidden" style={{ height: 340 }}>
        {items.map((src, i) => {
          const offset = relativeOffset(i);
          const abs = Math.abs(offset);
          if (abs > 2) return null;

          const isCenter = offset === 0;
          const isSide1 = abs === 1;
          const scale = isCenter ? 1 : isSide1 ? 0.78 : 0.58;
          const translateX = offset * 140;
          const translateY = isCenter ? 0 : isSide1 ? 14 : 28;
          const opacity = isCenter ? 1 : isSide1 ? 0.7 : 0.35;

          return (
            <button
              key={i}
              type="button"
              onClick={() => go(i)}
              aria-label={`Planner cover ${i + 1}`}
              aria-current={isCenter ? 'true' : undefined}
              className="absolute left-1/2 bottom-1 cursor-pointer border-0 bg-transparent p-0 outline-none"
              style={{
                transform: `translateX(calc(-50% + ${translateX}px)) translateY(${translateY}px) scale(${scale})`,
                transformOrigin: 'bottom center',
                opacity,
                zIndex: 10 - abs,
                transition:
                  'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
                willChange: 'transform, opacity',
              }}
            >
              <img
                src={src}
                alt={`Planner cover ${i + 1}`}
                draggable={false}
                className="rounded-lg block pointer-events-none"
                style={{
                  height: 310,
                  width: 'auto',
                  objectFit: 'contain',
                  filter: isCenter
                    ? 'drop-shadow(0 10px 28px rgba(47,59,58,0.22))'
                    : 'drop-shadow(0 4px 12px rgba(47,59,58,0.08))',
                  transition: 'filter 0.55s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => go(active - 1)}
        aria-label="Previous cover"
        className="absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 z-20"
        style={{ backgroundColor: 'rgba(255,255,255,0.92)', color: '#2F3B3A', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}
      >
        <CaretLeft className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={() => go(active + 1)}
        aria-label="Next cover"
        className="absolute right-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center transition-transform hover:scale-110 z-20"
        style={{ backgroundColor: 'rgba(255,255,255,0.92)', color: '#2F3B3A', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}
      >
        <CaretRight className="w-4 h-4" />
      </button>

      <div className="flex justify-center gap-1.5 mt-4">
        {items.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => go(i)}
            aria-label={`Go to cover ${i + 1}`}
            className="rounded-full"
            style={{
              width: active === i ? 20 : 6,
              height: 6,
              backgroundColor: active === i ? '#7F9E95' : 'rgba(127,158,149,0.3)',
              transition: 'width 0.35s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.35s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Main Landing Page ─────────────────────────────────────────────────── */
export default function Landing() {
  usePageSEO();
  const navigate = useNavigate();
  const [showContact, setShowContact] = useState(false);
  const [showIOSPopup, setShowIOSPopup] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [checkedState, setCheckedState] = useState({ b12: false, glow: false, nad: false });
  const [productFocus, setProductFocus] = useState('app'); // 'app' | 'planners'
  const demoPausedRef = useRef(false);
  const toggleCheck = (id) => {
    demoPausedRef.current = true; // stop auto-demo once the visitor interacts
    setCheckedState((prev) => ({ ...prev, [id]: !prev[id] }));
  };
  const showPlanners = productFocus === 'planners';

  useEffect(() => {
    document.body.classList.add('landing-page');
    document.documentElement.classList.add('landing-page-active');
    return () => {
      document.body.classList.remove('landing-page');
      document.documentElement.classList.remove('landing-page-active');
    };
  }, []);

  /* Auto-demo: check off research items so visitors see the card is interactive */
  useEffect(() => {
    const ids = ['b12', 'glow', 'nad'];
    let cancelled = false;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    const run = async () => {
      await sleep(1600);
      while (!cancelled && !demoPausedRef.current) {
        for (const id of ids) {
          if (cancelled || demoPausedRef.current) return;
          setCheckedState((prev) => ({ ...prev, [id]: true }));
          await sleep(850);
        }
        await sleep(1400);
        if (cancelled || demoPausedRef.current) return;
        setCheckedState({ b12: false, glow: false, nad: false });
        await sleep(1600);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const shouldRedirectToApp = isNative() || isPWAInstalled();
    if (shouldRedirectToApp) {
      startTransition(() => navigate('/login', { replace: true }));
    }
  }, [navigate]);

  const handleSignIn = () => startTransition(() => navigate('/login'));

  const features = [
    { icon: CalendarDots, title: 'Protocols', description: 'Build multi-phase protocols, pause and resume dose progressions, and keep every phase organized.' },
    { icon: Package, title: 'Stockpiles', description: 'No need to PANIC! Always know how much is in your stockpile with aggressive vial tracking.', boldText: 'PANIC' },
    { icon: ShoppingCart, title: 'Orders', description: 'Let the app do the work for you by syncing your incoming peptides into your stockpile.' },
    { icon: MapPin, title: 'Vendors', description: 'Domestic, International or GB vendor info at your fingertips! Never lose your contact again.' },
  ];

  const carouselCovers = LANDING_CAROUSEL_COVERS.filter(Boolean);

  return (
    <IconContext.Provider value={{ weight: 'duotone' }}>
    <div className="min-h-screen landing-page-root" style={{ backgroundColor: LANDING_PAGE_BG, fontFamily: 'Poppins, sans-serif' }}>
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <LandingHeader />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="py-12 md:py-16 lg:py-20" style={{ backgroundColor: '#EFF2EE' }}>
        <div className="w-full px-4 md:max-w-7xl md:mx-auto md:px-8 xl:px-10">

          {/* Mobile title */}
          <div className="text-center mb-8 md:hidden">
            <h1 className="font-bold leading-tight uppercase tracking-wide" style={{ color: '#7F9E95', fontFamily: 'Poppins, sans-serif' }}>
              <span className="block whitespace-nowrap text-5xl sm:text-6xl" style={{ color: '#7F9E95' }}>ORGANIZE</span>
              <span className="block text-4xl sm:text-5xl" style={{ color: '#1F2B2A' }}>Your Research.</span>
            </h1>
          </div>

          {/* Mobile layout — stacked */}
          <div className="md:hidden flex flex-col items-center gap-6">
            <div className="w-full max-w-xs sm:max-w-sm landing-todays-research-animate relative">
              <TodaysResearchCard darkMode={darkMode} setDarkMode={setDarkMode} checkedState={checkedState} toggleCheck={toggleCheck} />
            </div>

            {/* Built by chip */}
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium"
              style={{ backgroundColor: '#F4E4D6', color: '#B8860B' }}>
              <HandHeart className="w-3 h-3 flex-shrink-0" />
              Built by a fellow researcher
            </div>
          </div>

          {/* Desktop layout — side by side */}
          <div className="hidden md:grid md:grid-cols-2 md:gap-10 lg:gap-14 xl:gap-16 lg:items-center">
            <div className="flex flex-col gap-6 lg:gap-8 justify-center items-center text-center w-full max-w-xl lg:max-w-2xl mx-auto xl:pr-4">
              <h1 className="font-bold leading-[1.08] uppercase tracking-wide w-full" style={{ color: '#7F9E95', fontFamily: 'Poppins, sans-serif' }}>
                <span className="block text-4xl md:text-5xl xl:text-6xl">ORGANIZE</span>
                <span className="block text-3xl md:text-4xl xl:text-5xl mt-1" style={{ color: '#1F2B2A' }}>Your Research.</span>
              </h1>
              <button
                onClick={handleSignIn}
                className="px-6 py-3 rounded-lg text-base font-semibold transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center gap-2 btn-primary-inset w-fit"
                style={{ backgroundColor: '#7F9E95', color: '#FFFFFF' }}
              >
                Get Started
                <PenNib className="w-4 h-4" />
              </button>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium w-fit"
                style={{ backgroundColor: '#F4E4D6', color: '#B8860B' }}>
                <HandHeart className="w-4 h-4" />
                Built by a fellow researcher.
              </div>
            </div>

            <div className="flex justify-center lg:justify-end items-center landing-todays-research-animate min-w-0">
              <div className="w-full max-w-md lg:max-w-[420px] xl:max-w-md">
                <TodaysResearchCard darkMode={darkMode} setDarkMode={setDarkMode} checkedState={checkedState} toggleCheck={toggleCheck} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE APP / PAPER PLANNERS (toggled card) ─────────────────────── */}
      <section className="py-12 md:py-14 lg:py-16" style={{ backgroundColor: '#FFFFFF' }}>
        <div className="w-full px-4 md:max-w-4xl lg:max-w-5xl md:mx-auto md:px-8 xl:px-10">

          <div className="text-center mb-4 lg:mb-5 flex flex-col items-center">
            <h2
              className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
              style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}
            >
              Two ways, <span style={{ color: '#7F9E95' }}>to organize.</span>
            </h2>
          </div>

          {/* Product chooser — icon buttons, not a pill switch */}
          <div
            className="flex justify-center gap-3 sm:gap-4 mb-6"
            role="tablist"
            aria-label="Choose product"
          >
            {[
              { id: 'app', label: 'The App', Icon: Desktop, active: !showPlanners },
              { id: 'planners', label: 'Paper Planners', Icon: BookOpen, active: showPlanners },
            ].map(({ id, label, Icon, active }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setProductFocus(id)}
                className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2.5 px-5 sm:px-7 py-3 sm:py-3.5 rounded-2xl text-xs sm:text-sm font-bold tracking-[0.12em] uppercase transition-all duration-200 min-w-[140px] sm:min-w-[180px]"
                style={
                  active
                    ? {
                        color: '#FFFFFF',
                        backgroundColor: '#7F9E95',
                        border: '1.5px solid #7F9E95',
                        boxShadow: '0 4px 14px rgba(127,158,149,0.35)',
                      }
                    : {
                        color: '#6B7D7A',
                        backgroundColor: '#FFFFFF',
                        border: '1.5px solid #DDE6DE',
                        boxShadow: 'none',
                      }
                }
              >
                <Icon className="w-5 h-5" weight={active ? 'fill' : 'duotone'} />
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-3xl p-8 md:p-10 lg:p-12 xl:p-14 text-center border relative overflow-hidden" style={{ borderColor: '#DDE6DE', backgroundColor: '#EFF2EE' }}>
            {/* Subtle background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full mix-blend-multiply filter blur-3xl opacity-30" style={{ backgroundColor: '#7F9E95', transform: 'translate(30%, -30%)' }} />
            <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full mix-blend-multiply filter blur-3xl opacity-20" style={{ backgroundColor: '#D5E0DC', transform: 'translate(-20%, 20%)' }} />

            <div className="relative z-10 animate-[fadeInUp_0.4s_ease-out]" key={productFocus} role="tabpanel">
              {!showPlanners ? (
                <>
                  <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>
                    Take your research anywhere.
                  </h2>
                  <p className="text-sm md:text-base lg:text-lg mb-8 max-w-lg lg:max-w-2xl mx-auto leading-relaxed" style={{ color: '#6B7D7A' }}>
                    Track doses, monitor washouts, and manage your stockpile on iOS and Android. Your account syncs seamlessly across all devices.
                  </p>

                  <div className="flex flex-col items-center gap-4">
                    <div className="flex gap-2 justify-center flex-wrap">
                      <a
                        href={APP_STORE_IOS_URL}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:opacity-90 hover:-translate-y-0.5 shadow-sm"
                        style={{ backgroundColor: '#1a1a1a', minWidth: 125 }}
                        target="_blank" rel="noopener noreferrer"
                      >
                        <Apple className="w-4 h-4 text-white flex-shrink-0" />
                        <div className="text-white leading-tight text-left">
                          <div className="text-[8px] font-normal opacity-80">Download on the</div>
                          <div className="text-[11px] font-semibold">App Store</div>
                        </div>
                      </a>
                      {!isIOS() && (
                        <a
                          href="https://play.google.com/store/apps/details?id=com.thepepplanner.app"
                          className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all hover:opacity-90 hover:-translate-y-0.5 shadow-sm"
                          style={{ backgroundColor: '#1a1a1a', minWidth: 125 }}
                          target="_blank" rel="noopener noreferrer"
                        >
                          <LucidePlay className="w-4 h-4 text-white flex-shrink-0" />
                          <div className="text-white leading-tight text-left">
                            <div className="text-[8px] font-normal opacity-80">GET IT ON</div>
                            <div className="text-[11px] font-semibold">Google Play</div>
                          </div>
                        </a>
                      )}
                    </div>
                    <button
                      onClick={handleSignIn}
                      className="text-xs font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                      style={{ color: '#6B7D7A' }}
                    >
                      Or sign in on the web →
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>
                    For the research lab.
                  </h2>
                  <p className="text-sm md:text-base lg:text-lg mb-8 max-w-lg lg:max-w-2xl mx-auto leading-relaxed" style={{ color: '#6B7D7A' }}>
                    Dedicated pages for protocols, reconstitution dates, stockpile notes, and daily tracking. Multiple cover designs and sizes to fit your style.
                  </p>

                  <div className="flex flex-col items-center gap-4">
                    <Link
                      to="/shop"
                      className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:-translate-y-0.5 shadow-lg hover:shadow-xl group"
                      style={{ backgroundColor: '#2F3B3A' }}
                    >
                      Shop the Collection
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </Link>
                    <Link
                      to="/shop/reviews"
                      className="text-xs font-medium underline underline-offset-2 transition-opacity hover:opacity-70"
                      style={{ color: '#6B7D7A' }}
                    >
                      Read customer reviews →
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>

        </div>
      </section>

      {/* Showcase swaps with product toggle — App demos vs Planners visuals */}
      {!showPlanners ? (
      <section key="app-showcase" className="py-12 md:py-14 lg:py-16 animate-[fadeInUp_0.4s_ease-out]" style={{ backgroundColor: SEE_IT_IN_ACTION_BG }}>
        <div className="w-full px-4 md:max-w-7xl md:mx-auto md:px-8 xl:px-10">
          <div className="text-center mb-8 lg:mb-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>
              See it in action
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:gap-6 lg:gap-8 xl:gap-10 items-stretch lg:items-start max-w-6xl xl:max-w-none mx-auto">
            <WashoutFlowGraphWidget />
            <ReconstitutionMathWidget />
            <div className="col-span-2 w-full max-w-5xl mx-auto">
              <TitrationPhasesWidget />
            </div>
          </div>
        </div>
      </section>
      ) : (
      <section key="planners-showcase" className="py-12 md:py-14 lg:py-16 animate-[fadeInUp_0.4s_ease-out]" style={{ backgroundColor: SEE_IT_IN_ACTION_BG }}>
        <div className="w-full px-4 md:max-w-7xl md:mx-auto md:px-8 xl:px-10">
          <div
            className="rounded-3xl px-4 pt-6 pb-8 md:px-10 md:pt-8 md:pb-10 mb-8 lg:mb-10"
            style={{
              backgroundColor: PHYSICAL_PLANNERS_SURFACE,
              boxShadow:
                'inset 0 0 0 1px rgba(127, 158, 149, 0.14), 0 4px 14px rgba(47, 59, 58, 0.06), 0 14px 40px rgba(47, 59, 58, 0.1)',
            }}
          >
            <div className="text-center mb-3 md:mb-4">
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>
                Give your research its own style.
              </h2>
              <p className="text-sm lg:text-base max-w-xl lg:max-w-2xl mx-auto leading-relaxed" style={{ color: '#6B7D7A' }}>
                New covers drop often — pick yours.
              </p>
            </div>

            {carouselCovers.length > 0 ? (
              <ShopCarousel covers={carouselCovers} />
            ) : (
              <div className="text-center py-12">
                <p className="text-sm" style={{ color: '#6B7D7A' }}>Cover images loading…</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6 max-w-5xl mx-auto mb-8">
            {[
              {
                icon: CalendarDots,
                title: 'Protocol pages',
                desc: 'Multi-phase schedules laid out on paper — same structure you know from the app.',
              },
              {
                icon: Syringe,
                title: 'Recon & doses',
                desc: 'Space for reconstitution dates, concentrations, and daily dose logs.',
              },
              {
                icon: Package,
                title: 'Stockpile notes',
                desc: 'Track vials, leftovers, and orders without digging through spreadsheets.',
              },
            ].map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="rounded-2xl p-5 md:p-6 text-center"
                style={{
                  backgroundColor: PHYSICAL_PLANNERS_SURFACE,
                  border: '1px solid #DDE6DE',
                  boxShadow: '0 4px 14px rgba(47, 59, 58, 0.06)',
                }}
              >
                <div
                  className="w-11 h-11 mx-auto mb-3 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: '#EFF2EE' }}
                >
                  <Icon className="w-5 h-5" style={{ color: '#7F9E95' }} />
                </div>
                <h3 className="text-sm font-bold mb-1.5" style={{ color: '#2F3B3A' }}>{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#6B7D7A' }}>{desc}</p>
              </div>
            ))}
          </div>

          <div className="flex justify-center">
            <Link
              to="/shop"
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-sm font-semibold text-white transition-all hover:-translate-y-0.5 shadow-lg hover:shadow-xl group"
              style={{ backgroundColor: '#2F3B3A' }}
            >
              Browse all planners
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>
      )}

      {/* ── FEATURES ─────────────────────────────────────────────────────── */}
      <section className="py-8 md:py-10 lg:py-12" style={{ backgroundColor: TOOLKIT_BG }}>
        <div className="w-full px-4 md:max-w-7xl md:mx-auto md:px-8 xl:px-10">
          <div className="text-center mb-8 lg:mb-10">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-4" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>
              <span className="block text-white">Time to ditch the spreadsheets.</span>
              <span className="block text-lg sm:text-xl font-normal mt-1 text-white">And welcome your new research tool!</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 lg:gap-8 max-w-6xl xl:max-w-none mx-auto">
            {features.map((feature, index) => (
              <div
                key={index}
                className="text-center p-6 rounded-xl h-full transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  backgroundColor: '#ECF2ED',
                  border: '1px solid #AABCAF',
                  boxShadow: '0 8px 20px rgba(47, 59, 58, 0.16)',
                }}
              >
                <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center" style={{ backgroundColor: '#7F9E95' }}>
                  <feature.icon className="w-8 h-8" style={{ color: '#FFFFFF' }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>{feature.title}</h3>
                <p className="text-sm" style={{ color: '#6B7D7A' }}
                  dangerouslySetInnerHTML={{ __html: feature.boldText ? feature.description.replace(feature.boldText, `<strong>${feature.boldText}</strong>`) : feature.description }}
                />
              </div>
            ))}
          </div>
          {/* Protocols feature card */}
          <div className="mt-8 lg:mt-10 mb-8 rounded-2xl p-6 sm:p-8 md:p-10 lg:p-12 md:max-w-4xl lg:max-w-5xl md:mx-auto"
            style={{ backgroundColor: '#E6EDE7', border: '2px solid #AFBFB3', boxShadow: '0 8px 24px rgba(47, 59, 58, 0.22)' }}>
            <h4 className="text-lg sm:text-xl font-bold mb-4 text-center" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>
              What you can do that others can&apos;t
            </h4>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm sm:text-base pl-1" style={{ color: '#4A5A56', listStyle: 'none' }}>
              {[
                ['Titration scheduling', '— plan multi-phase dose changes and stay on track.'],
                ['Hold your current dosage', '— and resume when you need to increase dose again.'],
                ['Half-life tracking', '— so you and your calendar stay in the know.'],
                ['Delivery methods', '— Love your Savvio? Pens, syringes, nasal, and more.'],
                ['Washout periods', '— visualized so you know when you\'re clear.'],
                ['Custom reminders for each protocol!', ''],
              ].map(([bold, rest]) => (
                <li key={bold} className="flex gap-2.5 items-baseline">
                  <span className="text-[#7F9E95] font-bold flex-shrink-0" style={{ lineHeight: 1.4 }}>•</span>
                  <span><strong style={{ color: '#2F3B3A' }}>{bold}</strong>{rest}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── ADDITIONAL FEATURES ──────────────────────────────────────────── */}
      <section className="py-10 md:py-12 lg:py-14" style={{ backgroundColor: '#F5F5F0' }}>
        <div className="w-full px-4 md:max-w-7xl md:mx-auto md:px-8 xl:px-10">
          <div className="text-center mb-8 lg:mb-10">
            <h2 className="text-3xl lg:text-4xl font-bold mb-2" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>&amp; So Much More</h2>
            <p className="text-sm sm:text-base max-w-xl mx-auto" style={{ color: '#6B7D7A' }}>
              We've packed the app with the tools researchers actually use—and we keep adding more.
            </p>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-x-8 lg:gap-y-8 md:max-w-5xl lg:max-w-6xl md:mx-auto">
            {[
              { Icon: Calculator, title: 'Peptide Calculator', desc: 'Dosage information, delivery methods, vial visuals, and pen dosing—all in one place.' },
              { Icon: FileText, title: 'Imports', desc: 'Bring your existing data in—no need to start from scratch.' },
              { Icon: CalendarDots, title: 'Calendar & Day View', desc: 'Month, week, or day—visualize your research schedule, washouts, and upcoming orders.' },
              { Icon: ChartBar, title: 'Research Analytics', desc: 'Spending, trends, delivery times, and insights—so you can see patterns and optimize.' },
              { Icon: Star, title: 'Goals & Wishlists', desc: 'Set research goals and track progress, plus save items to wishlists for later.' },
              { Icon: Stack, title: 'One Place for Everything', desc: 'Protocols, orders, stockpile, calendar, and analytics—your whole research workflow.' },
            ].map(({ Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-2 sm:gap-4">
                <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#7F9E95' }}>
                  <Icon className="w-4 h-4 sm:w-6 sm:h-6" style={{ color: '#FFFFFF' }} />
                </div>
                <div className="flex-1">
                  <h3 className="text-sm sm:text-lg font-bold mb-1 sm:mb-2" style={{ color: '#2F3B3A', fontFamily: 'Poppins, sans-serif' }}>{title}</h3>
                  <p className="text-xs sm:text-sm leading-relaxed" style={{ color: '#6B7D7A' }}>{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DUAL CTA ─────────────────────────────────────────────────────── */}
      <section className="py-10 sm:py-12 lg:py-14" style={{ backgroundColor: '#6b8b78' }}>
        <div className="w-full text-center px-4 md:max-w-4xl lg:max-w-5xl md:mx-auto md:px-8 xl:px-10">
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-bold mb-4 sm:mb-6" style={{ color: '#FFFFFF', fontFamily: 'Poppins, sans-serif' }}>
            Ready to Organize Your Research?
          </h2>
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 justify-center items-center">
            <button
              onClick={handleSignIn}
              className="w-full max-w-[280px] sm:w-auto px-6 py-2.5 sm:py-3 rounded-lg text-base sm:text-lg font-semibold transition-all shadow-lg hover:shadow-xl hover:scale-105 flex items-center justify-center gap-2 btn-primary-inset"
              style={{ backgroundColor: '#FFFFFF', color: '#7F9E95' }}
            >
              Sign Up <PenNib className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <Link
              to="/shop"
              className="w-full max-w-[280px] sm:w-auto px-6 py-2.5 sm:py-3 rounded-lg text-base sm:text-lg font-semibold border-2 transition-all hover:shadow-xl hover:scale-105 flex items-center justify-center gap-2"
              style={{ borderColor: '#FFFFFF', color: '#FFFFFF', backgroundColor: 'transparent' }}
            >
              Shop Now <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5" />
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />

      <LandingContactModal open={showContact} onClose={() => setShowContact(false)} />

      {showIOSPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 animate-fadeIn" onClick={() => setShowIOSPopup(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-center">
              <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: '#B8A99A' }}>
                <Apple className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-2xl font-bold mb-3" style={{ color: '#2F3B3A' }}>Now Available on iOS!</h3>
              <p className="text-base mb-6" style={{ color: '#6B7D7A' }}>
                <strong>The Pep Planner</strong> is available on the App Store. Download now and start organizing your peptide research!
              </p>
              <a href={APP_STORE_IOS_URL} target="_blank" rel="noopener noreferrer"
                className="block w-full mb-3 px-6 py-3 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg btn-primary-inset text-center"
                style={{ backgroundColor: '#4c6b52', color: '#FFFFFF' }}>
                View on App Store
              </a>
              <button onClick={() => setShowIOSPopup(false)}
                className="w-full px-6 py-3 rounded-lg font-semibold transition-all shadow-md hover:shadow-lg btn-primary-inset"
                style={{ backgroundColor: '#7F9E95', color: '#FFFFFF' }}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </IconContext.Provider>
  );
}
