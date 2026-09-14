import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X, Clock } from 'lucide-react';
import { recordInjectionSite, getInjectionSiteSuggestions } from '../../utils/injectionTracking';
import { isInjectionSiteTrackingEnabled } from '../../utils/injectionSiteSettings';

function toTitleCase(str) {
  if (!str || typeof str !== 'string') return str;
  return str.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

function getDaysAgo(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((today - d) / (1000 * 60 * 60 * 24));
}

function formatLastUsed(lastUsed) {
  if (!lastUsed) return null;
  const daysAgo = getDaysAgo(lastUsed);
  if (daysAgo === null) return null;
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo < 7) return `${daysAgo}d ago`;
  const d = new Date(lastUsed);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Real SVG body outline — CC0 from SVGRepo (body-outline, ionicons).
 * ViewBox 0 0 512 512. Stroke-based, clean outline style.
 *
 * The body anatomy:
 *  - Head circle: cx=256, cy=56
 *  - Torso bar (shoulder line): y≈172  (from x=88 to x=424)
 *  - Mid-torso: ~y=220–295
 *  - Hip split: y≈295
 *  - Legs: y≈295–470  (feet at bottom)
 *
 * Syringe markers are positioned in SVG-coordinate % relative to the viewBox.
 */

// SVG body anatomy reference (viewBox 0 0 512 512):
//   Shoulder bar endpoints: x=88 (17.2%) and x=424 (82.8%), y≈172 (33.6%)
//   Torso: y=172–295, centered at x=256
//   Hip split: y≈295 (57.6%)
//   Thigh mid: y≈360 (70.3%)

const FRONT_ZONES = [
  { id: 'left arm',      label: 'Left Arm',      x: 17,   y: 34   },
  { id: 'right arm',     label: 'Right Arm',     x: 83,   y: 34   },
  { id: 'left abdomen',  label: 'Left Abdomen',  x: 38,   y: 47   },
  { id: 'right abdomen', label: 'Right Abdomen', x: 62,   y: 47   },
  { id: 'left thigh',    label: 'Left Thigh',    x: 40,   y: 70   },
  { id: 'right thigh',   label: 'Right Thigh',   x: 60,   y: 70   },
];

const BACK_ZONES = [
  { id: 'left arm',         label: 'Left Arm',         x: 17,   y: 34   },
  { id: 'right arm',        label: 'Right Arm',        x: 83,   y: 34   },
  { id: 'left lower back',  label: 'Left Lower Back',  x: 38,   y: 49   },
  { id: 'right lower back', label: 'Right Lower Back', x: 62,   y: 49   },
  { id: 'left rear',        label: 'Left Rear',        x: 40,   y: 64   },
  { id: 'right rear',       label: 'Right Rear',       x: 60,   y: 64   },
];

/** Tiny inline SVG icons shaped like the relevant body area — no generic icon library needed. */
function ZoneIcon({ zoneId, color, selected }) {
  const size   = selected ? 15 : 12;
  const fill   = color;
  const type   = zoneId.includes('arm')        ? 'arm'
               : zoneId.includes('abdomen')    ? 'abdomen'
               : zoneId.includes('thigh')      ? 'thigh'
               : zoneId.includes('lower back') ? 'lowerback'
               : zoneId.includes('rear')       ? 'rear'
               : 'default';

  const s = { display: 'block', flexShrink: 0 };

  if (type === 'arm') return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={s} aria-hidden="true">
      <rect x="4.5" y="1" width="5" height="12" rx="2.5" fill={fill} transform="rotate(-10 7 7)" />
    </svg>
  );

  if (type === 'abdomen') return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={s} aria-hidden="true">
      <path d="M3.5,2 Q1,3.5 1.5,7 Q2,11 7,12.5 Q12,11 12.5,7 Q13,3.5 10.5,2 Q7,0.5 3.5,2Z" fill={fill} />
    </svg>
  );

  if (type === 'thigh') return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={s} aria-hidden="true">
      <path d="M4,1.5 Q2,3 2,7 Q2.5,12 7,13 Q11.5,12 12,7 Q12,3 10,1.5 Q7,0.5 4,1.5Z" fill={fill} />
    </svg>
  );

  if (type === 'lowerback') return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={s} aria-hidden="true">
      <ellipse cx="7" cy="7.5" rx="6" ry="4" fill={fill} />
      <line x1="7" y1="3.5" x2="7" y2="11.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );

  if (type === 'rear') return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={s} aria-hidden="true">
      <path d="M1,6 Q1,2 5,2 Q7,3.5 7,6 Q7,3.5 9,2 Q13,2 13,6 Q13,10 9,12 Q7,10.5 7,8 Q7,10.5 5,12 Q1,10 1,6Z" fill={fill} />
    </svg>
  );

  return (
    <svg width={size} height={size} viewBox="0 0 14 14" style={s} aria-hidden="true">
      <circle cx="7" cy="7" r="5.5" fill={fill} />
    </svg>
  );
}

function BodyOutlineSvg({ theme }) {
  const strokeColor = theme.isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';

  return (
    <svg
      viewBox="0 0 512 512"
      style={{ width: '100%', height: '100%', display: 'block' }}
      aria-hidden="true"
    >
      {/* Head */}
      <circle
        fill="none" stroke={strokeColor} strokeMiterlimit="10" strokeWidth="20"
        cx="256" cy="56" r="40"
      />
      {/* Body + legs + arms (shoulder bar) */}
      <path
        fill="none" stroke={strokeColor} strokeMiterlimit="10" strokeWidth="20"
        d="M199.3,295.62h0l-30.4,172.2a24,24,0,0,0,19.5,27.8,23.76,23.76,0,0,0,27.6-19.5l21-119.9v.2s5.2-32.5,17.5-32.5h3.1c12.5,0,17.5,32.5,17.5,32.5v-.1l21,119.9a23.92,23.92,0,1,0,47.1-8.4l-30.4-172.2-4.9-29.7c-2.9-18.1-4.2-47.6.5-59.7,4-10.4,14.13-14.2,23.2-14.2H424a24,24,0,0,0,0-48H88a24,24,0,0,0,0,48h92.5c9.23,0,19.2,3.8,23.2,14.2,4.7,12.1,3.4,41.6.5,59.7Z"
      />
    </svg>
  );
}

export default function InjectionSiteSelector({
  taskName,
  task,
  onConfirm,
  onCancel,
  theme,
  isVisible,
  /** `modal` = full glass overlay (default). `inline` = compact panel for nested sheets. */
  variant = 'modal',
}) {
  const [selectedSite,       setSelectedSite]       = useState('');
  const [customSite,         setCustomSite]         = useState('');
  const [suggestions,        setSuggestions]        = useState([]);
  const [hasCheckedTracking, setHasCheckedTracking] = useState(false);
  const [viewMode,           setViewMode]           = useState('front');
  const [showOther,          setShowOther]          = useState(false);

  const isInline = variant === 'inline';

  useEffect(() => {
    if (isVisible && !hasCheckedTracking && !isInjectionSiteTrackingEnabled()) {
      setHasCheckedTracking(true);
      onConfirm('');
      return;
    }
    if (isVisible && !hasCheckedTracking) setHasCheckedTracking(true);
    if (!isVisible) {
      setHasCheckedTracking(false);
      setSelectedSite('');
      setCustomSite('');
      setShowOther(false);
      setViewMode('front');
    }
  }, [isVisible, hasCheckedTracking]);

  useEffect(() => {
    if (isVisible && taskName && isInjectionSiteTrackingEnabled()) {
      setSuggestions(getInjectionSiteSuggestions(taskName));
    }
  }, [isVisible, taskName]);

  if (!isVisible) return null;

  const siteRecency = suggestions.reduce((acc, s) => {
    acc[s.site.toLowerCase()] = s.lastUsed;
    return acc;
  }, {});

  const handleConfirm = () => {
    const site = showOther ? customSite.trim() : selectedSite;
    if (task && site) recordInjectionSite(task, site, new Date(), task.time);
    onConfirm(site);
  };

  const handleSkip   = () => { setSelectedSite(''); setCustomSite(''); onConfirm(''); };
  const handleCancel = () => { setSelectedSite(''); setCustomSite(''); onCancel(); };
  const isFormValid  = () => showOther ? customSite.trim().length > 0 : selectedSite.length > 0;

  const zones = viewMode === 'front' ? FRONT_ZONES : BACK_ZONES;

  const markerStyle = (zoneId) => {
    const isSelected = selectedSite === zoneId;
    const daysAgo    = getDaysAgo(siteRecency[zoneId]);

    if (isSelected) return {
      bg: theme.primary, border: theme.primary, icon: '#fff',
      shadow: `0 0 0 4px ${theme.primary}30`,
    };
    if (daysAgo !== null && daysAgo < 3) return {
      bg: 'rgba(245,158,11,0.15)', border: '#f59e0b', icon: '#f59e0b',
      shadow: 'none',
    };
    if (daysAgo !== null && daysAgo < 7) return {
      bg: 'rgba(16,185,129,0.14)', border: '#10b981', icon: '#10b981',
      shadow: 'none',
    };
    return {
      bg:     theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.85)',
      border: theme.isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.18)',
      icon:   theme.isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.40)',
      shadow: 'none',
    };
  };

  const bodyMapMax = isInline ? 150 : 180;
  const markerBase = isInline ? 26 : 30;
  const markerActive = isInline ? 32 : 36;

  const pickerBody = (
    <>
      {!showOther ? (
        <div className={`${isInline ? 'px-3 pt-2 pb-1' : 'px-5 pt-3 pb-2'} space-y-2.5`}>
          <div
            className="flex rounded-xl p-0.5"
            style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)' }}
          >
            {[{ key: 'front', label: '▸ Front' }, { key: 'back', label: '◂ Back' }].map(v => (
              <button
                key={v.key}
                type="button"
                onClick={() => { setViewMode(v.key); setSelectedSite(''); }}
                className="flex-1 py-1.5 rounded-lg text-xs font-bold transition-all"
                style={{
                  backgroundColor: viewMode === v.key ? (theme.isDark ? 'rgba(255,255,255,0.14)' : '#fff') : 'transparent',
                  color:           viewMode === v.key ? theme.text : theme.textLight,
                  boxShadow:       viewMode === v.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div
            style={{
              position:    'relative',
              width:       '100%',
              maxWidth:    bodyMapMax,
              margin:      '0 auto',
              aspectRatio: '512 / 512',
            }}
          >
            <BodyOutlineSvg theme={theme} />
            {zones.map(zone => {
              const { bg, border, icon, shadow } = markerStyle(zone.id);
              const isSelected = selectedSite === zone.id;

              return (
                <button
                  key={zone.id + viewMode}
                  type="button"
                  onClick={() => setSelectedSite(zone.id)}
                  aria-label={zone.label}
                  style={{
                    position:        'absolute',
                    left:            `${zone.x}%`,
                    top:             `${zone.y}%`,
                    transform:       'translate(-50%, -50%)',
                    zIndex:          10,
                    width:           isSelected ? markerActive : markerBase,
                    height:          isSelected ? markerActive : markerBase,
                    borderRadius:    '50%',
                    backgroundColor: bg,
                    border:          `2px solid ${border}`,
                    display:         'flex',
                    alignItems:      'center',
                    justifyContent:  'center',
                    cursor:          'pointer',
                    boxShadow:       shadow,
                    transition:      'all 0.2s ease',
                  }}
                >
                  <ZoneIcon zoneId={zone.id} color={icon} selected={isSelected} />
                </button>
              );
            })}
          </div>

          <div className="text-center min-h-[24px] flex items-center justify-center">
            {selectedSite ? (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ backgroundColor: theme.primary + '18', color: theme.primary }}
              >
                ✓ {toTitleCase(selectedSite)}
                {formatLastUsed(siteRecency[selectedSite]) && (
                  <span className="text-[10px] font-normal opacity-70">
                    · {formatLastUsed(siteRecency[selectedSite])}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-[11px] italic" style={{ color: theme.textLight, opacity: 0.6 }}>
                Tap a zone to select
              </span>
            )}
          </div>

          {!isInline && (
            <div className="flex items-center justify-center gap-5 pb-1">
              {[{ color: '#f59e0b', label: 'Used recently' }, { color: '#10b981', label: 'This week' }].map(({ color, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-[10px]" style={{ color: theme.textLight }}>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color, opacity: 0.85 }} />
                  {label}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={`${isInline ? 'px-3 pt-2 pb-1' : 'px-5 pt-4 pb-2'} space-y-3`}>
          <p className="text-sm font-semibold" style={{ color: theme.text }}>Custom injection site</p>
          <input
            type="text"
            value={customSite}
            onChange={e => setCustomSite(e.target.value)}
            placeholder="e.g. Deltoid, SubQ belly..."
            className="w-full px-3 py-2.5 rounded-xl text-sm"
            style={{
              border:          `1.5px solid ${theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}`,
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.85)',
              color:           theme.text,
              outline:         'none',
            }}
            autoFocus
          />
          {suggestions.length > 0 && (
            <div>
              <p className="flex items-center gap-1 text-[10px] font-semibold mb-2" style={{ color: theme.textLight }}>
                <Clock size={10} /> Recent
              </p>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => {
                  const lu = formatLastUsed(s.lastUsed);
                  const active = customSite.toLowerCase() === s.site.toLowerCase();
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setCustomSite(s.site)}
                      className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all"
                      style={{
                        borderColor:     active ? theme.primary : theme.border,
                        color:           theme.text,
                        backgroundColor: active ? theme.primary + '18' : 'transparent',
                      }}
                    >
                      {toTitleCase(s.site)}{lu ? ` · ${lu}` : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={`flex justify-center ${isInline ? 'pb-2 pt-0.5' : 'pb-4 pt-1'}`}>
        <button
          type="button"
          onClick={() => { setShowOther(!showOther); setSelectedSite(''); setCustomSite(''); }}
          className="text-[11px] font-medium underline underline-offset-2 hover:opacity-60 transition-opacity"
          style={{ color: theme.textLight }}
        >
          {showOther ? '← Use Body Map' : 'Custom / Other Site'}
        </button>
      </div>
    </>
  );

  const footer = (
    <div
      className={`flex-shrink-0 flex gap-2 ${isInline ? 'px-3 py-2.5' : 'px-5 py-3'}`}
      style={{ borderTop: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}` }}
    >
      <button
        type="button"
        onClick={handleSkip}
        className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-all hover:opacity-80"
        style={{ borderColor: theme.border, color: theme.textLight }}
      >
        Skip
      </button>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!isFormValid()}
        className="flex-1 py-2 rounded-xl text-xs font-bold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          backgroundColor: theme.primary,
          color: theme.textOnPrimary,
          boxShadow: isInline
            ? `0 1px 3px ${theme.primary}28, inset 0 1px 0 rgba(255,255,255,0.35)`
            : (theme.isDark
              ? '0 2px 8px rgba(0,0,0,0.45), 0 4px 16px rgba(0,0,0,0.35)'
              : '0 2px 6px rgba(0,0,0,0.12), 0 4px 14px rgba(0,0,0,0.14)'),
        }}
      >
        Confirm Site
      </button>
    </div>
  );

  if (isInline) {
    return (
      <div
        className="rounded-xl overflow-hidden"
        style={{
          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : `${theme.primary || '#445952'}0a`,
          border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : `${theme.primary || '#445952'}22`}`,
        }}
      >
        <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.textLight }}>
            Injection site
          </p>
          <button
            type="button"
            onClick={handleCancel}
            className="p-1 rounded-md transition-opacity hover:opacity-60"
            style={{ color: theme.textLight }}
            aria-label="Close site picker"
          >
            <X size={14} />
          </button>
        </div>
        {pickerBody}
        {footer}
      </div>
    );
  }

  const modal = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        zIndex: 999999,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(0,0,0,0.35)',
      }}
      onClick={handleCancel}
    >
      <div
        className="glass-modal rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: '92vw', maxWidth: 370, maxHeight: '92vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between flex-shrink-0 px-5 pt-4 pb-3"
          style={{ borderBottom: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)'}` }}
        >
          <div>
            <p className="text-[10px] uppercase tracking-widest font-semibold mb-0.5" style={{ color: theme.textLight }}>
              Injection Site
            </p>
            <h4 className="font-bold text-sm" style={{ color: theme.text }}>{taskName}</h4>
          </div>
          <button type="button" onClick={handleCancel} className="p-1.5 transition-opacity hover:opacity-60 mt-0.5" style={{ color: theme.textLight }}>
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {pickerBody}
        </div>

        {footer}
      </div>
    </div>
  );

  return ReactDOM.createPortal(modal, document.body);
}
