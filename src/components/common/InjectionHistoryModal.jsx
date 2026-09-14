import React, { useState, useEffect, useMemo } from 'react';
import { User } from '@phosphor-icons/react';
import { MapPin, Clock, PenTool, Pipette, Trash2, Edit, X, Check } from 'lucide-react';
import BottomSheet from './BottomSheet';
import ConfirmationModal from '../ui/ConfirmationModal';
import { getInjectionHistory, deleteInjectionRecord, updateInjectionRecord } from '../../utils/injectionTracking';
import { isInjectionSiteTrackingEnabled } from '../../utils/injectionSiteSettings';
import { toKey } from '../calendar/MonthGrid';

// ─── Body map helpers ─────────────────────────────────────────────────────────

function getRecordDayKey(record) {
    if (record?.dateKey && /^\d{4}-\d{2}-\d{2}$/.test(String(record.dateKey))) return String(record.dateKey);
    const t = typeof record?.timestamp === 'number'
        ? record.timestamp
        : new Date(record?.date || record?.timestamp || 0).getTime();
    return toKey(new Date(t));
}

function formatDateScopeLabel(start, end) {
    const a = toKey(start);
    const b = toKey(end);
    if (a === b) {
        return start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

const ZONE_POSITIONS = {
    'left arm':          { x: 17, y: 34 },
    'right arm':         { x: 83, y: 34 },
    'left abdomen':      { x: 38, y: 47 },
    'right abdomen':     { x: 62, y: 47 },
    'left thigh':        { x: 40, y: 70 },
    'right thigh':       { x: 60, y: 70 },
    'left lower back':   { x: 38, y: 49 },
    'right lower back':  { x: 62, y: 49 },
    'left rear':         { x: 40, y: 64 },
    'right rear':        { x: 60, y: 64 },
};

/** Collapse near-duplicate outline spots so the heatmap never stacks two dots. */
const HEATMAP_ZONE_MERGE = {
    'left lower back': 'left abdomen',
    'right lower back': 'right abdomen',
    'left rear': 'left thigh',
    'right rear': 'right thigh',
};

function toHeatmapZone(zone) {
    if (!zone) return null;
    return HEATMAP_ZONE_MERGE[zone] || zone;
}

function clamp01(n) {
    return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return null;
    let h = hex.trim().replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length !== 6) return null;
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
    const c = (x) => clamp01(x / 255) * 255;
    const q = (x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
    return `#${q(c(r))}${q(c(g))}${q(c(b))}`;
}

function mixRgb(a, b, t) {
    const u = clamp01(t);
    return {
        r: a.r + (b.r - a.r) * u,
        g: a.g + (b.g - a.g) * u,
        b: a.b + (b.b - a.b) * u,
    };
}

function themeOutlineStroke(theme) {
    const P = hexToRgb(theme.primary);
    if (!P) return theme.isDark ? 'rgba(255,255,255,0.22)' : 'rgba(47,59,58,0.16)';
    const a = theme.isDark ? 0.38 : 0.28;
    return `rgba(${P.r},${P.g},${P.b},${a})`;
}

/** Frequency heatmap: 0 = light (less used), 1 = dark (more used). */
function heatColor(theme, intensity01) {
    const P = hexToRgb(theme.primary) || { r: 127, g: 158, b: 149 };
    const D = hexToRgb(theme.primaryDark || theme.primary) || P;
    const white = { r: 255, g: 255, b: 255 };
    const light = theme.isDark
        ? mixRgb(P, white, 0.5)
        : mixRgb(P, white, 0.72);
    const m = mixRgb(light, D, clamp01(intensity01));
    return rgbToHex(m.r, m.g, m.b);
}

function normalizeSiteToZone(site) {
    if (!site) return null;
    const s = site.toLowerCase().trim();
    for (const zoneId of Object.keys(ZONE_POSITIONS)) {
        if (s === zoneId) return zoneId;
    }
    for (const zoneId of Object.keys(ZONE_POSITIONS)) {
        if (s.includes(zoneId)) return zoneId;
    }
    return null;
}

function daysAgo(ts) {
    if (!ts) return null;
    const ms = typeof ts === 'number' ? ts : new Date(ts).getTime();
    const diff = Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff}d ago`;
}

function BodyOutlineSvg({ theme }) {
    const strokeColor = themeOutlineStroke(theme);
    return (
        <svg viewBox="0 0 512 512" style={{ width: '100%', height: '100%', display: 'block' }} aria-hidden="true">
            <circle fill="none" stroke={strokeColor} strokeMiterlimit="10" strokeWidth="20" cx="256" cy="56" r="40" />
            <path
                fill="none" stroke={strokeColor} strokeMiterlimit="10" strokeWidth="20"
                d="M199.3,295.62h0l-30.4,172.2a24,24,0,0,0,19.5,27.8,23.76,23.76,0,0,0,27.6-19.5l21-119.9v.2s5.2-32.5,17.5-32.5h3.1c12.5,0,17.5,32.5,17.5,32.5v-.1l21,119.9a23.92,23.92,0,1,0,47.1-8.4l-30.4-172.2-4.9-29.7c-2.9-18.1-4.2-47.6.5-59.7,4-10.4,14.13-14.2,23.2-14.2H424a24,24,0,0,0,0-48H88a24,24,0,0,0,0,48h92.5c9.23,0,19.2,3.8,23.2,14.2,4.7,12.1,3.4,41.6.5,59.7Z"
            />
        </svg>
    );
}

function formatZoneLabel(zone) {
    if (!zone) return '';
    return zone.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Site Map insights modal ───────────────────────────────────────────────────

function SiteMapBody({ history, theme, activeDot, setActiveDot }) {
    const taskStats = useMemo(() => {
        const map = {};
        for (const r of history) {
            if (!r.taskName) continue;
            if (!map[r.taskName]) map[r.taskName] = { latest: null, total: 0 };
            map[r.taskName].total += 1;
            const ts = typeof r.timestamp === 'number' ? r.timestamp : new Date(r.timestamp || r.date || 0).getTime();
            const zone = normalizeSiteToZone(r.injectionSite);
            if (!map[r.taskName].latest || ts > map[r.taskName].latest.ts) {
                map[r.taskName].latest = { zone, injectionSite: r.injectionSite, ts };
            }
        }
        return map;
    }, [history]);

    const taskNames = useMemo(() => {
        const names = [...new Set(history.map(r => r.taskName).filter(Boolean))];
        return names.sort((a, b) => {
            const tsA = taskStats[a]?.latest?.ts ?? 0;
            const tsB = taskStats[b]?.latest?.ts ?? 0;
            return tsB - tsA;
        });
    }, [history, taskStats]);

    const zoneCounts = useMemo(() => {
        const counts = {};
        for (const r of history) {
            const zone = toHeatmapZone(normalizeSiteToZone(r.injectionSite));
            if (!zone) continue;
            counts[zone] = (counts[zone] || 0) + 1;
        }
        return counts;
    }, [history]);

    const heatScale = useMemo(() => {
        const vals = Object.values(zoneCounts);
        if (vals.length === 0) return { min: 0, max: 1 };
        return { min: Math.min(...vals), max: Math.max(...vals) };
    }, [zoneCounts]);

    const intensityFor = (count) => {
        const { min, max } = heatScale;
        if (max <= min) return 0.65;
        return (count - min) / (max - min);
    };

    const isZoneKey = (id) => id && Object.prototype.hasOwnProperty.call(zoneCounts, id);

    const selectedZone = useMemo(() => {
        if (!activeDot) return null;
        if (isZoneKey(activeDot)) return activeDot;
        return toHeatmapZone(taskStats[activeDot]?.latest?.zone) || null;
    }, [activeDot, taskStats, zoneCounts]);

    const dots = useMemo(() => {
        return Object.entries(zoneCounts).map(([zone, count]) => {
            const base = ZONE_POSITIONS[zone];
            if (!base) return null;
            const t = intensityFor(count);
            return {
                zone,
                count,
                px: base.x,
                py: base.y,
                color: heatColor(theme, t),
                intensity: t,
            };
        }).filter(Boolean);
    }, [zoneCounts, heatScale, theme.primary, theme.primaryDark, theme.isDark]);

    if (taskNames.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center">
                <MapPin size={32} style={{ color: theme.textLight }} className="mb-3 opacity-40" />
                <p className="text-sm" style={{ color: theme.textLight }}>No mapped injection data yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div
                className="relative rounded-2xl p-4 flex items-center justify-center"
                style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : theme.secondary }}
                onClick={(e) => { if (e.target === e.currentTarget) setActiveDot(null); }}
            >
                <div style={{ position: 'relative', width: 170, aspectRatio: '1 / 1' }}>
                    <BodyOutlineSvg theme={theme} />
                    {dots.map((dot) => {
                        const isActive = selectedZone === dot.zone;
                        const labelBelow = dot.py < 22;
                        return (
                            <React.Fragment key={dot.zone}>
                                <button
                                    type="button"
                                    aria-label={`${formatZoneLabel(dot.zone)}, ${dot.count} injections`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveDot(isActive && isZoneKey(activeDot) ? null : dot.zone);
                                    }}
                                    style={{
                                        position: 'absolute',
                                        left: `${dot.px}%`,
                                        top: `${dot.py}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: isActive ? 20 : 16,
                                        height: isActive ? 20 : 16,
                                        borderRadius: '50%',
                                        backgroundColor: dot.color,
                                        boxShadow: isActive
                                            ? `0 0 0 2px #fff, 0 2px 8px rgba(0,0,0,0.28)`
                                            : `0 2px 5px rgba(0,0,0,0.22)`,
                                        border: isActive ? `2px solid ${dot.color}` : '2px solid rgba(255,255,255,0.85)',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        zIndex: isActive ? 20 : 10,
                                    }}
                                />
                                {isActive && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: `${dot.px}%`,
                                            top: labelBelow ? `calc(${dot.py}% + 14px)` : `calc(${dot.py}% - 14px)`,
                                            transform: `translate(-50%, ${labelBelow ? '0' : '-100%'})`,
                                            zIndex: 30,
                                            pointerEvents: 'none',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <div
                                            className="px-2.5 py-1.5 rounded-lg text-xs font-semibold shadow-lg"
                                            style={{
                                                backgroundColor: theme.cardBackground,
                                                color: theme.text,
                                                border: `1px solid ${theme.border}`,
                                                borderLeftWidth: 3,
                                                borderLeftColor: dot.color,
                                            }}
                                        >
                                            {formatZoneLabel(dot.zone)} · {dot.count} inj.
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>

                {/* Frequency legend — bottom right, discrete dots */}
                <div
                    className="absolute bottom-3 right-3 flex flex-col items-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-medium" style={{ color: theme.textLight }}>
                            Less
                        </span>
                        {[0, 0.35, 0.65, 1].map((t) => (
                            <span
                                key={t}
                                className="rounded-full flex-shrink-0"
                                style={{
                                    width: 10,
                                    height: 10,
                                    backgroundColor: heatColor(theme, t),
                                    border: '1.5px solid rgba(255,255,255,0.85)',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                                }}
                                aria-hidden
                            />
                        ))}
                        <span className="text-[10px] font-medium" style={{ color: theme.textLight }}>
                            More
                        </span>
                    </div>
                    <p className="text-[10px] leading-snug text-right" style={{ color: theme.textLight, opacity: 0.85 }}>
                        Darker = used more
                    </p>
                </div>
            </div>

            <div>
                <p className="text-xs font-semibold mb-2.5" style={{ color: theme.textLight }}>
                    Last Known Site
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                    {taskNames.map((name) => {
                        const stats = taskStats[name];
                        const zone = toHeatmapZone(stats?.latest?.zone);
                        const zoneCount = zone ? (zoneCounts[zone] || 0) : 0;
                        const color = zone ? heatColor(theme, intensityFor(zoneCount)) : (theme.primary || '#7F9E95');
                        const hasMapped = !!zone;
                        const isHighlighted = activeDot === name || (selectedZone && selectedZone === zone && isZoneKey(activeDot));
                        return (
                            <button
                                key={name}
                                type="button"
                                onClick={() => setActiveDot(isHighlighted && activeDot === name ? null : name)}
                                className="flex flex-col gap-1.5 p-3 rounded-xl border w-full text-left transition-all"
                                style={{
                                    borderColor: isHighlighted ? color : theme.border,
                                    backgroundColor: isHighlighted ? `${color}18` : theme.cardBackground,
                                }}
                            >
                                <div className="flex items-start justify-between gap-2 min-w-0">
                                    <p className="text-sm font-bold leading-tight truncate min-w-0" style={{ color: theme.text }}>
                                        {name}
                                    </p>
                                    <span className="text-xs font-semibold flex-shrink-0 tabular-nums" style={{ color: theme.primary }}>
                                        {stats.total} inj.
                                    </span>
                                </div>
                                <p className="text-xs capitalize leading-tight truncate text-left" style={{ color: theme.textLight }}>
                                    {hasMapped ? stats.latest.injectionSite : <span className="opacity-40">Unmapped</span>}
                                </p>
                                <p className="text-xs text-left" style={{ color: theme.textLight, opacity: 0.75 }}>
                                    {daysAgo(stats.latest?.ts) || '—'}
                                </p>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export default function InjectionHistoryModal({ isOpen, onClose, theme, filterTaskName, dateScopeStart, dateScopeEnd, initialView = 'list' }) {
    const [injectionHistory, setInjectionHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [dateFilter, setDateFilter] = useState('all');
    const [activeTaskFilter, setActiveTaskFilter] = useState(filterTaskName || null);
    const [view, setView] = useState(initialView); // 'list' | 'map'
    const [activeDot, setActiveDot] = useState(null);
    const [showAllTime, setShowAllTime] = useState(false);

    // Edit state
    const [editingId, setEditingId] = useState(null);
    const [editSite, setEditSite] = useState('');
    const [editSide, setEditSide] = useState('');
    const [editCustom, setEditCustom] = useState('');

    const loadHistory = () => {
        const history = getInjectionHistory();
        setInjectionHistory(history);
    };

    const hasDateScope = dateScopeStart instanceof Date && !Number.isNaN(dateScopeStart.getTime())
        && dateScopeEnd instanceof Date && !Number.isNaN(dateScopeEnd.getTime());

    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            loadHistory();
            setLoading(false);
            setActiveTaskFilter(filterTaskName || null);
            setShowAllTime(false);
            setDateFilter('all');
        } else {
            setEditingId(null);
            setView(initialView);
            setActiveDot(null);
        }
    }, [isOpen, filterTaskName, hasDateScope, dateScopeStart, dateScopeEnd]);

    const historyScoped = useMemo(() => {
        if (!hasDateScope || showAllTime) return injectionHistory;
        const a = toKey(dateScopeStart);
        const b = toKey(dateScopeEnd);
        const [minK, maxK] = a <= b ? [a, b] : [b, a];
        return injectionHistory.filter((r) => {
            const k = getRecordDayKey(r);
            return k >= minK && k <= maxK;
        });
    }, [injectionHistory, hasDateScope, showAllTime, dateScopeStart, dateScopeEnd]);

    const uniqueTaskNames = useMemo(() => {
        return [...new Set(historyScoped.map(r => r.taskName).filter(Boolean))].sort();
    }, [historyScoped]);

    const filteredHistory = useMemo(() => {
        let base = historyScoped;
        if (activeTaskFilter) base = base.filter(r => r.taskName === activeTaskFilter);
        if (hasDateScope && !showAllTime) return base;

        if (dateFilter === 'all') return base;

        const cutoffDate = new Date();
        switch (dateFilter) {
            case 'last3days':  cutoffDate.setDate(cutoffDate.getDate() - 3);  break;
            case 'last7days':  cutoffDate.setDate(cutoffDate.getDate() - 7);  break;
            case 'last30days': cutoffDate.setDate(cutoffDate.getDate() - 30); break;
            default: return base;
        }
        cutoffDate.setHours(0, 0, 0, 0);

        return base.filter(record => {
            const d = typeof record.timestamp === 'number'
                ? new Date(record.timestamp)
                : new Date(record.date || record.timestamp);
            d.setHours(0, 0, 0, 0);
            return d >= cutoffDate;
        });
    }, [historyScoped, dateFilter, activeTaskFilter, hasDateScope, showAllTime]);

    const parseInjectionSite = (site) => {
        if (!site) return { site: '', side: '', custom: '' };
        const lowerSite = site.toLowerCase().trim();
        if (!lowerSite.includes('left') && !lowerSite.includes('right') &&
            !lowerSite.includes('abdomen') && !lowerSite.includes('arm') && !lowerSite.includes('thigh')) {
            return { site: 'other', side: '', custom: site };
        }
        const parts = lowerSite.split(' ');
        if (parts.length >= 2) {
            const side = parts[0];
            const siteType = parts.slice(1).join(' ');
            if ((side === 'left' || side === 'right') &&
                (siteType.includes('abdomen') || siteType.includes('arm') || siteType.includes('thigh'))) {
                let matchedSite = '';
                if (siteType.includes('abdomen')) matchedSite = 'abdomen';
                else if (siteType.includes('arm')) matchedSite = 'arm';
                else if (siteType.includes('thigh')) matchedSite = 'thigh';
                return { site: matchedSite, side, custom: '' };
            }
        }
        return { site: 'other', side: '', custom: site };
    };

    const handleEdit = (record) => {
        const parsed = parseInjectionSite(record.injectionSite);
        setEditingId(record.id);
        setEditSite(parsed.site);
        setEditSide(parsed.side);
        setEditCustom(parsed.custom);
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditSite('');
        setEditSide('');
        setEditCustom('');
    };

    const handleSaveEdit = () => {
        if (!editingId) return;
        let injectionSite = '';
        if (editSite === 'other') {
            injectionSite = editCustom.trim();
        } else if (editSite && editSide) {
            injectionSite = `${editSide} ${editSite}`;
        } else if (editSite) {
            injectionSite = editSite;
        }
        if (!injectionSite) return;
        if (updateInjectionRecord(editingId, { injectionSite })) {
            loadHistory();
            handleCancelEdit();
        }
    };

    const isEditValid = () => {
        if (editSite === 'other') return editCustom.trim().length > 0;
        if (editSite === 'abdomen' || editSite === 'arm' || editSite === 'thigh') return editSide.length > 0;
        return false;
    };

    const handleDelete = (recordId) => {
        if (deleteInjectionRecord(recordId)) {
            loadHistory();
            setDeleteConfirmId(null);
        }
    };

    const formatDate = (dateValue) => {
        const date = typeof dateValue === 'number' ? new Date(dateValue) : new Date(dateValue);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    const formatDateShort = (dateValue) => {
        const date = typeof dateValue === 'number' ? new Date(dateValue) : new Date(dateValue);
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    const formatInjectionSite = (site) => {
        if (!site) return '';
        return site.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    const getDeliveryIcon = (deliveryMethod) => {
        switch (deliveryMethod?.toLowerCase()) {
            case 'pen': return <PenTool size={14} style={{ color: theme.textLight }} />;
            default:    return <Pipette size={14} style={{ color: theme.textLight }} />;
        }
    };

    const filterOptions = [
        { value: 'last3days',  label: '3d' },
        { value: 'last7days',  label: '7d' },
        { value: 'last30days', label: '30d' },
        { value: 'all',        label: 'All' },
    ];

    const siteOptions = [
        { value: 'abdomen', label: 'Abdomen' },
        { value: 'arm',     label: 'Arm' },
        { value: 'thigh',   label: 'Thigh' },
        { value: 'other',   label: 'Other' },
    ];

    const hasHistory = !loading && isInjectionSiteTrackingEnabled() && injectionHistory.length > 0;
    const siteMapHistory = hasDateScope && !showAllTime ? historyScoped : injectionHistory;

    return (
        <>
            <BottomSheet
                open={isOpen}
                onClose={onClose}
                title="Injection Site History"
                theme={theme}
                maxHeight="85vh"
            >
                {/* Date Scope Banner */}
                {hasDateScope && isInjectionSiteTrackingEnabled() && (
                    <div
                        className="flex items-center justify-between gap-2 mb-3 py-2 px-3 rounded-xl text-xs"
                        style={{
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : `${theme.primary}0d`,
                            border: `1px solid ${theme.border}`,
                        }}
                    >
                        <span style={{ color: theme.textLight }}>
                            {showAllTime ? 'All saved records' : (
                                <>
                                    <span className="font-semibold" style={{ color: theme.text }}>This view: </span>
                                    {formatDateScopeLabel(dateScopeStart, dateScopeEnd)}
                                </>
                            )}
                        </span>
                        {showAllTime ? (
                            <button
                                type="button"
                                onClick={() => { setShowAllTime(false); setDateFilter('all'); }}
                                className="font-semibold whitespace-nowrap"
                                style={{ color: theme.primary }}
                            >
                                {toKey(dateScopeStart) === toKey(dateScopeEnd) ? 'This day' : 'This week'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { setShowAllTime(true); setDateFilter('all'); }}
                                className="font-semibold whitespace-nowrap"
                                style={{ color: theme.primary }}
                            >
                                All history
                            </button>
                        )}
                    </div>
                )}

                {/* ── Top Control Bar: Filters + View Toggle ── */}
                {hasHistory && (
                    <div className="flex items-center justify-between gap-2 mb-4">
                        {/* Scrollable Filters */}
                        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 flex-1 mask-right">
                            {/* Protocol dropdown */}
                            {uniqueTaskNames.length > 0 && (
                                <div className="relative flex-shrink-0">
                                    <select
                                        value={activeTaskFilter || ''}
                                        onChange={e => setActiveTaskFilter(e.target.value || null)}
                                        className="appearance-none pl-3 pr-7 py-1.5 rounded-full text-[11px] font-medium cursor-pointer outline-none transition-all"
                                        style={{
                                            backgroundColor: activeTaskFilter ? theme.primary : theme.secondary,
                                            color: activeTaskFilter ? '#ffffff' : theme.textLight,
                                            border: `1.5px solid ${activeTaskFilter ? theme.primary : theme.border}`,
                                        }}
                                    >
                                        <option value="">All Protocols</option>
                                        {uniqueTaskNames.map(name => (
                                            <option key={name} value={name} style={{ backgroundColor: theme.cardBackground, color: theme.text }}>
                                                {name}
                                            </option>
                                        ))}
                                    </select>
                                    <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" width="10" height="10" viewBox="0 0 10 10" fill="none">
                                        <path d="M2 3.5L5 6.5L8 3.5" stroke={activeTaskFilter ? '#ffffff' : theme.textLight} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                            )}

                            {/* Date range toggle */}
                            {!(hasDateScope && !showAllTime) && (
                                <div
                                    className="flex items-center rounded-full p-0.5 flex-shrink-0"
                                    style={{
                                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : `${theme.primary}12`,
                                        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : `${theme.primary}20`}`,
                                    }}
                                    role="group"
                                    aria-label="Date range"
                                >
                                    {filterOptions.map((option) => {
                                        const selected = dateFilter === option.value;
                                        return (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setDateFilter(option.value)}
                                                className="px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all"
                                                style={{
                                                    backgroundColor: selected ? (theme.primaryDark || theme.primary) : 'transparent',
                                                    color: selected ? '#ffffff' : theme.textLight,
                                                    boxShadow: selected ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                                                }}
                                            >
                                                {option.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* View Toggle */}
                        <div
                            className="flex items-center rounded-full p-0.5 flex-shrink-0 shadow-sm"
                            style={{
                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : `${theme.primary}12`,
                                border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : `${theme.primary}20`}`,
                            }}
                        >
                            <button
                                type="button"
                                onClick={() => setView('list')}
                                className="flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-bold transition-all uppercase tracking-wider"
                                style={{
                                    backgroundColor: view === 'list' ? theme.cardBackground : 'transparent',
                                    color: view === 'list' ? theme.text : theme.textLight,
                                    boxShadow: view === 'list' ? `0 1px 3px rgba(0,0,0,0.15)` : 'none',
                                }}
                            >
                                List
                            </button>
                            <button
                                type="button"
                                onClick={() => { setView('map'); setActiveDot(null); }}
                                className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold transition-all uppercase tracking-wider"
                                style={{
                                    backgroundColor: view === 'map' ? theme.cardBackground : 'transparent',
                                    color: view === 'map' ? theme.text : theme.textLight,
                                    boxShadow: view === 'map' ? `0 1px 3px rgba(0,0,0,0.15)` : 'none',
                                }}
                            >
                                <User size={12} weight="bold" aria-hidden />
                                Map
                            </button>
                        </div>
                    </div>
                )}

                {/* ── Content ── */}
                {view === 'map' && (
                    <SiteMapBody
                        history={filteredHistory}
                        theme={theme}
                        activeDot={activeDot}
                        setActiveDot={setActiveDot}
                    />
                )}

                {view === 'list' && (
                    loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="text-sm" style={{ color: theme.textLight }}>Loading...</div>
                    </div>
                ) : !isInjectionSiteTrackingEnabled() ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}15` }}>
                            <Pipette size={32} style={{ color: theme.primary }} />
                        </div>
                        <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>Tracking Disabled</h3>
                        <p className="text-sm" style={{ color: theme.textLight }}>
                            Enable injection site tracking in Settings → User Settings.
                        </p>
                    </div>
                ) : filteredHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}15` }}>
                            <MapPin size={32} style={{ color: theme.primary }} />
                        </div>
                        <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
                            {injectionHistory.length === 0
                                ? 'No History Yet'
                                : (hasDateScope && !showAllTime && historyScoped.length === 0
                                    ? 'No injections this period'
                                    : 'No Results')}
                        </h3>
                        <p className="text-sm" style={{ color: theme.textLight }}>
                            {injectionHistory.length === 0
                                ? 'Complete injection tasks to see your site history here.'
                                : (hasDateScope && !showAllTime && historyScoped.length === 0
                                    ? 'Nothing logged for this day or week. Try “All history” to browse everything.'
                                    : 'No records found for the selected filters.')}
                        </p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {filteredHistory.map((record) => (
                            <li
                                key={record.id || record.timestamp}
                                className="p-3 rounded-lg border transition-colors"
                                style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}
                            >
                                {editingId === record.id ? (
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <span className="font-semibold text-sm" style={{ color: theme.text }}>{record.taskName}</span>
                                                <span className="ml-2 text-xs" style={{ color: theme.textLight }}>{formatDateShort(record.timestamp)}</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <button onClick={handleCancelEdit} className="p-1.5 rounded-lg transition-colors" style={{ color: theme.textLight }}>
                                                    <X size={16} />
                                                </button>
                                                <button onClick={handleSaveEdit} disabled={!isEditValid()} className="p-1.5 rounded-lg transition-colors disabled:opacity-40" style={{ color: theme.primary }}>
                                                    <Check size={16} />
                                                </button>
                                            </div>
                                        </div>
                                        <div className="flex gap-1.5 flex-wrap">
                                            {siteOptions.map((option) => (
                                                <button
                                                    key={option.value}
                                                    onClick={() => { setEditSite(option.value); if (option.value === 'other') setEditSide(''); }}
                                                    className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                                                    style={{
                                                        backgroundColor: editSite === option.value ? theme.primary : 'transparent',
                                                        color: editSite === option.value ? '#ffffff' : theme.text,
                                                        border: `1px solid ${editSite === option.value ? theme.primary : theme.border}`,
                                                    }}
                                                >
                                                    {option.label}
                                                </button>
                                            ))}
                                        </div>
                                        {(editSite === 'abdomen' || editSite === 'arm' || editSite === 'thigh') && (
                                            <div className="flex gap-1.5">
                                                {['left', 'right'].map((side) => (
                                                    <button
                                                        key={side}
                                                        onClick={() => setEditSide(side)}
                                                        className="px-2.5 py-1 rounded-full text-xs font-medium transition-all capitalize"
                                                        style={{
                                                            backgroundColor: editSide === side ? theme.primary : 'transparent',
                                                            color: editSide === side ? '#ffffff' : theme.text,
                                                            border: `1px solid ${editSide === side ? theme.primary : theme.border}`,
                                                        }}
                                                    >
                                                        {side}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {editSite === 'other' && (
                                            <input
                                                type="text"
                                                value={editCustom}
                                                onChange={(e) => setEditCustom(e.target.value)}
                                                placeholder="Enter custom site..."
                                                className="w-full px-3 py-2 rounded-lg border text-sm"
                                                style={{ borderColor: theme.border, backgroundColor: theme.background, color: theme.text }}
                                                autoFocus
                                            />
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: theme.secondary }}>
                                                {getDeliveryIcon(record.deliveryMethod)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm truncate" style={{ color: theme.text }}>{record.taskName}</div>
                                                <div className="flex items-center gap-2 text-xs mt-0.5" style={{ color: theme.textLight }}>
                                                    {record.injectionSite && (
                                                        <span className="flex items-center gap-1">
                                                            <MapPin size={10} />
                                                            {formatInjectionSite(record.injectionSite)}
                                                        </span>
                                                    )}
                                                    {record.dose && <span>• {record.dose} {record.unit}</span>}
                                                </div>
                                                <div className="flex items-center gap-1 text-xs mt-0.5" style={{ color: theme.textLight, opacity: 0.7 }}>
                                                    <Clock size={10} />
                                                    {formatDate(record.timestamp)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); handleEdit(record); }}
                                                className="p-2 rounded-lg transition-colors touch-manipulation"
                                                style={{ color: theme.textLight }}
                                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'; e.currentTarget.style.color = theme.primary; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = theme.textLight; }}
                                            >
                                                <Edit size={16} />
                                            </button>
                                            <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(record.id); }}
                                                className="p-2 rounded-lg transition-colors touch-manipulation"
                                                style={{ color: theme.textLight }}
                                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(220,38,38,0.2)' : 'rgba(220,38,38,0.1)'; e.currentTarget.style.color = theme.error || '#DC2626'; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = theme.textLight; }}
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                ))}
            </BottomSheet>

            <ConfirmationModal
                open={!!deleteConfirmId}
                onClose={() => setDeleteConfirmId(null)}
                onConfirm={() => deleteConfirmId && handleDelete(deleteConfirmId)}
                title="Delete Record?"
                message="This action cannot be undone. Are you sure you want to delete this injection record?"
                confirmText="Delete"
                cancelText="Cancel"
                type="delete"
                theme={theme}
            />
        </>
    );
}
