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

const PALETTE_SIZE = 24;

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

function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) h = ((b - r) / d + 2) / 6;
        else h = ((r - g) / d + 4) / 6;
    }
    return { h: h * 360, s, l };
}

function hslToRgb(h, s, l) {
    const H = ((h % 360) + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * clamp01(s);
    const x = c * (1 - Math.abs(((H / 60) % 2) - 1));
    const m = l - c / 2;
    let rp = 0;
    let gp = 0;
    let bp = 0;
    if (H < 60) [rp, gp, bp] = [c, x, 0];
    else if (H < 120) [rp, gp, bp] = [x, c, 0];
    else if (H < 180) [rp, gp, bp] = [0, c, x];
    else if (H < 240) [rp, gp, bp] = [0, x, c];
    else if (H < 300) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];
    return { r: (rp + m) * 255, g: (gp + m) * 255, b: (bp + m) * 255 };
}

function hslToHex(h, s, l) {
    const { r, g, b } = hslToRgb(h, clamp01(s), clamp01(l));
    return rgbToHex(r, g, b);
}

/** 24 muted greens / greiges / warm greys — all blended from the active theme. */
function buildThemeDotPalette(theme) {
    const fallback = { r: 127, g: 158, b: 149 };
    const P = hexToRgb(theme.primary) || fallback;
    const D = hexToRgb(theme.primaryDark || theme.primary) || P;
    const L = hexToRgb(theme.primaryLight || theme.primary) || P;
    const TL = hexToRgb(theme.textLight) || hexToRgb('#8A8077') || P;
    const BR = hexToRgb(theme.border) || hexToRgb('#DDE6DE') || P;
    const TX = hexToRgb(theme.text) || hexToRgb('#3A3A3A') || P;
    const BG = hexToRgb(theme.secondary || theme.background) || BR;
    // Soft neutral anchors (sage mist, warm stone, cool pebble) — blend with theme primary
    const MIST = hexToRgb('#A8B0A4') || TL;
    const STONE = hexToRgb('#C4BCB2') || BR;
    const PEBBLE = hexToRgb('#9BA39E') || TL;

    const recipes = [];
    const partners = [TL, BR, TX, BG, MIST, STONE, PEBBLE, D, L];
    const blend = (a, b, t) => {
        const m = mixRgb(a, b, clamp01(t));
        return rgbToHex(m.r, m.g, m.b);
    };
    for (let i = 0; i < PALETTE_SIZE; i++) {
        const partner = partners[i % partners.length];
        const baseT = 0.12 + ((i * 13) % 9) / 100 * 4.2;
        const jitter = (i % 4) * 0.045;
        let hex = blend(P, partner, baseT + jitter);
        const rgb = hexToRgb(hex);
        if (rgb) {
            let { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
            const dh = ((i % 11) - 5) * 2.4 + Math.sin(i * 0.85) * 2;
            const ds = Math.cos(i * 1.05) * 0.035;
            const dl = ((i % 9) - 4) * 0.022 + (i / PALETTE_SIZE) * 0.06;
            h += dh;
            s = clamp01(s * (0.88 + (i % 6) * 0.028) + ds);
            s = theme.isDark ? clamp01(Math.min(s * 1.05, 0.42)) : clamp01(Math.min(s * 1.02, 0.38));
            l = clamp01(l + dl + (theme.isDark ? 0.1 : -0.03));
            if (theme.isDark) l = clamp01(Math.max(l, 0.44));
            else l = clamp01(Math.min(Math.max(l, 0.24), 0.58));
            hex = hslToHex(h, s, l);
        }
        recipes.push(hex);
    }
    return recipes;
}

function themeOutlineStroke(theme) {
    const P = hexToRgb(theme.primary);
    if (!P) return theme.isDark ? 'rgba(255,255,255,0.22)' : 'rgba(47,59,58,0.16)';
    const a = theme.isDark ? 0.38 : 0.28;
    return `rgba(${P.r},${P.g},${P.b},${a})`;
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

    const dotPalette = useMemo(
        () => buildThemeDotPalette(theme),
        [theme.primary, theme.primaryDark, theme.primaryLight, theme.textLight, theme.border, theme.text, theme.secondary, theme.background, theme.isDark]
    );

    const taskColor = (name) => dotPalette[taskNames.indexOf(name) % dotPalette.length];

    const zoneGroups = {};
    for (const name of taskNames) {
        const zone = taskStats[name]?.latest?.zone;
        if (!zone) continue;
        if (!zoneGroups[zone]) zoneGroups[zone] = [];
        zoneGroups[zone].push(name);
    }

    const dots = [];
    for (const [zone, names] of Object.entries(zoneGroups)) {
        const base = ZONE_POSITIONS[zone];
        const n = names.length;
        names.forEach((name, i) => {
            const offsetX = n === 1 ? 0 : (i - (n - 1) / 2) * 7;
            dots.push({ name, px: base.x + offsetX, py: base.y, color: taskColor(name), site: taskStats[name]?.latest?.injectionSite });
        });
    }

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
                className="rounded-2xl p-4 flex items-center justify-center"
                style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : theme.secondary }}
                onClick={(e) => { if (e.target === e.currentTarget) setActiveDot(null); }}
            >
                <div style={{ position: 'relative', width: 170, aspectRatio: '1 / 1' }}>
                    <BodyOutlineSvg theme={theme} />
                    {dots.map((dot, i) => {
                        const isActive = activeDot === dot.name;
                        const labelBelow = dot.py < 22;
                        return (
                            <React.Fragment key={i}>
                                <button
                                    onClick={(e) => { e.stopPropagation(); setActiveDot(isActive ? null : dot.name); }}
                                    style={{
                                        position: 'absolute',
                                        left: `${dot.px}%`,
                                        top: `${dot.py}%`,
                                        transform: 'translate(-50%, -50%)',
                                        width: isActive ? 18 : 14,
                                        height: isActive ? 18 : 14,
                                        borderRadius: '50%',
                                        backgroundColor: dot.color,
                                        border: `2px solid ${isActive ? '#fff' : 'transparent'}`,
                                        boxShadow: isActive ? `0 0 0 3px ${dot.color}, 0 2px 8px rgba(0,0,0,0.3)` : `0 0 0 3px ${dot.color}30, 0 2px 6px rgba(0,0,0,0.25)`,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        zIndex: isActive ? 20 : 10,
                                    }}
                                />
                                {isActive && (
                                    <div style={{ position: 'absolute', left: `${dot.px}%`, top: labelBelow ? `calc(${dot.py}% + 14px)` : `calc(${dot.py}% - 14px)`, transform: 'translate(-50%, ' + (labelBelow ? '0' : '-100%') + ')', zIndex: 30, pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                                        <div className="px-2 py-1 rounded-lg text-[10px] font-semibold shadow-lg" style={{ backgroundColor: theme.cardBackground, color: theme.text, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${theme.border}`, borderLeftWidth: 3, borderLeftColor: dot.color }}>
                                            {dot.name}
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                    })}
                </div>
            </div>
            <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: theme.textLight }}>
                    Last Known Site Per Protocol
                </p>
                <div className="grid grid-cols-2 gap-2">
                    {taskNames.map(name => {
                        const stats = taskStats[name];
                        const color = taskColor(name);
                        const hasMapped = !!stats?.latest?.zone;
                        const isHighlighted = activeDot === name;
                        return (
                            <button key={name} onClick={() => setActiveDot(isHighlighted ? null : name)} className="flex flex-col gap-1.5 p-3 rounded-xl border w-full text-left transition-all" style={{ borderColor: isHighlighted ? color : theme.border, backgroundColor: isHighlighted ? `${color}12` : theme.cardBackground }}>
                                <div className="flex items-center justify-between gap-1">
                                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 0 3px ${color}25` }} />
                                    <span className="text-[10px] font-semibold" style={{ color: theme.primary }}>{stats.total} inj.</span>
                                </div>
                                <p className="text-xs font-bold leading-tight truncate" style={{ color: theme.text }}>{name}</p>
                                <p className="text-[10px] capitalize leading-tight truncate" style={{ color: theme.textLight }}>
                                    {hasMapped ? stats.latest.injectionSite : <span className="opacity-40">Unmapped</span>}
                                </p>
                                <p className="text-[10px]" style={{ color: theme.textLight, opacity: 0.6 }}>{daysAgo(stats.latest?.ts) || '—'}</p>
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

                            {/* Date pills */}
                            {!(hasDateScope && !showAllTime) && filterOptions.map((option) => (
                                <button
                                    key={option.value}
                                    onClick={() => setDateFilter(option.value)}
                                    className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-all flex-shrink-0"
                                    style={{
                                        backgroundColor: dateFilter === option.value ? theme.primary : theme.secondary,
                                        color: dateFilter === option.value ? '#ffffff' : theme.textLight,
                                    }}
                                >
                                    {option.label}
                                </button>
                            ))}
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
