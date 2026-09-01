import React, { useState, useEffect } from 'react';
import { Users, ExternalLink, Globe, MoreHorizontal } from 'lucide-react';
import { BookBookmark, Link as PhosphorLink, At, Notepad } from '@phosphor-icons/react';
import { SiReddit, SiDiscord, SiTelegram, SiFacebook, SiX, SiYoutube } from 'react-icons/si';
import TextInput from '../common/inputs/TextInput';
import OwnerSelect from '../buddy/OwnerSelect';
import BottomSheet from '../common/BottomSheet';
import { OWNER_SELF } from '../../utils/buddies';

/**
 * Platform catalogue — deeplink builders + icons (react-icons / lucide, same stack as vendor payments).
 * Ordered by popularity in the peptide/research community.
 */
const PLATFORMS = [
    {
        value: 'reddit',
        label: 'Reddit',
        tileLabel: 'Reddit',
        icon: SiReddit,
        buildUrl: (name) => name ? `https://reddit.com/r/${name.replace(/^r\//i, '')}` : '',
        placeholder: 'Peptides',
        handlePrefix: 'r/',
    },
    {
        value: 'discord',
        label: 'Discord',
        tileLabel: 'Discord',
        icon: SiDiscord,
        buildUrl: (name) => name && name.startsWith('http') ? name : '',
        placeholder: 'server or handle',
        handlePrefix: '',
    },
    {
        value: 'telegram',
        label: 'Telegram',
        tileLabel: 'Telegram',
        icon: SiTelegram,
        buildUrl: (name) => name ? `https://t.me/${name.replace(/^@/, '')}` : '',
        placeholder: 'groupname',
        handlePrefix: '@',
    },
    {
        value: 'facebook',
        label: 'Facebook Group',
        tileLabel: 'Facebook',
        icon: SiFacebook,
        buildUrl: (name) => name && name.startsWith('http') ? name : '',
        placeholder: 'Paste group URL',
        handlePrefix: '',
    },
    {
        value: 'twitter',
        label: 'X / Twitter',
        tileLabel: 'X',
        icon: SiX,
        buildUrl: (name) => name ? `https://x.com/${name.replace(/^@/, '')}` : '',
        placeholder: 'handle',
        handlePrefix: '@',
    },
    {
        value: 'youtube',
        label: 'YouTube Channel',
        tileLabel: 'YouTube',
        icon: SiYoutube,
        buildUrl: (name) => name && name.startsWith('http') ? name : name ? `https://youtube.com/@${name.replace(/^@/, '')}` : '',
        placeholder: 'channelname',
        handlePrefix: '@',
    },
    {
        value: 'forum',
        label: 'Forum / Website',
        tileLabel: 'Forum',
        icon: Globe,
        buildUrl: (name) => name && name.startsWith('http') ? name : '',
        placeholder: 'https://forum.example.com',
        handlePrefix: '',
    },
    {
        value: 'other',
        label: 'Other',
        tileLabel: 'Other',
        icon: MoreHorizontal,
        buildUrl: (name) => name && name.startsWith('http') ? name : '',
        placeholder: 'https://...',
        handlePrefix: '',
    },
];


function getPlatform(value) {
    return PLATFORMS.find((p) => p.value === value) || PLATFORMS[PLATFORMS.length - 1];
}

function getHandlePrefix(platform) {
    return getPlatform(platform).handlePrefix || '';
}

function stripHandlePrefix(platform, handle) {
    const prefix = getHandlePrefix(platform);
    const h = (handle || '').trim();
    if (!prefix || !h) return h;
    if (h.toLowerCase().startsWith(prefix.toLowerCase())) return h.slice(prefix.length);
    return h;
}

function withHandlePrefix(platform, handle) {
    const prefix = getHandlePrefix(platform);
    const bare = stripHandlePrefix(platform, handle).trim();
    if (!bare) return '';
    return prefix ? `${prefix}${bare}` : bare;
}

function getHandleLabel(plat) {
    switch (plat.value) {
        case 'reddit':   return 'Subreddit Name';
        case 'telegram': return 'Telegram Username';
        case 'twitter':  return 'X / Twitter Handle';
        case 'youtube':  return 'Channel Name';
        case 'discord':  return 'Discord Handle';
        case 'facebook': return 'Group URL';
        case 'forum':    return 'Forum URL';
        case 'other':    return 'Other';
        default:         return `${plat.label} Handle`;
    }
}

export default function CommunityDetailsModal({ open, community, theme, onClose, onSave, onDelete }) {
    const [form, setForm] = useState({
        name: '',
        handle: '',
        url: '',
        platform: 'reddit',
        section: 'community',
        notes: '',
        ownerId: OWNER_SELF,
    });
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [showCustomUrl, setShowCustomUrl] = useState(false);

    useEffect(() => {
        if (!open) return;
        const existingUrl = (community?.url || '').trim();
        setForm({
            name: community?.name || '',
            handle: stripHandlePrefix(community?.platform || 'reddit', community?.handle || ''),
            url: community?.url || '',
            platform: community?.platform || 'reddit',
            section: community?.section || 'community',
            notes: community?.notes || '',
            ownerId: community?.ownerId || OWNER_SELF,
        });
        setConfirmDelete(false);
        setShowCustomUrl(Boolean(existingUrl));
    }, [open, community]);

    const plat = getPlatform(form.platform);
    const handlePrefix = plat.handlePrefix || '';
    const handleForUrl = withHandlePrefix(form.platform, form.handle);
    const resolvedUrl = (form.url || '').trim() || plat.buildUrl(handleForUrl);

    const handleSave = () => {
        const trimmedName = (form.name || '').trim();
        if (!trimmedName) {
            window.dispatchEvent(new CustomEvent('tpp:toast', {
                detail: { type: 'warning', message: 'Give your community a name.' },
            }));
            return;
        }
        onSave?.({
            ...(community || {}),
            name: trimmedName,
            handle: withHandlePrefix(form.platform, form.handle),
            url: resolvedUrl,
            platform: form.platform,
            section: form.section,
            notes: (form.notes || '').trim(),
            ownerId: form.ownerId || OWNER_SELF,
        });
    };

    const outlinedInputProps = {
        theme,
        outlined: true,
        customTextColor: theme.isDark ? null : '#181A18',
    };

    const footer = (
        <div className="w-full flex items-center justify-between gap-4 p-1">
            <div className="flex items-center">
                {community?.id && (
                    <button
                        type="button"
                        onClick={() => {
                            if (confirmDelete) {
                                onDelete?.(community);
                                setConfirmDelete(false);
                            } else {
                                setConfirmDelete(true);
                            }
                        }}
                        className={`py-2 text-sm font-medium transition-all ${confirmDelete ? '' : ''}`}
                        style={{ color: confirmDelete ? '#8B5335' : '#C67A5C' }}
                    >
                        {confirmDelete ? 'Tap Again to Confirm!' : 'Delete Entry'}
                    </button>
                )}
            </div>
            <button
                type="button"
                onClick={handleSave}
                className="px-8 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all active:scale-[0.98] whitespace-nowrap"
                style={{
                    backgroundColor: theme?.primary,
                    color: theme?.textOnPrimary || '#ffffff',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2), inset 0 1px 2px rgba(0,0,0,0.12)',
                }}
            >
                {community?.id ? 'Update' : 'Save'}
            </button>
        </div>
    );

    return (
        <BottomSheet
            open={open}
            onClose={onClose}
            title={community?.id ? (form.name || 'Edit Community') : 'Add Community'}
            theme={theme}
            fitContent
            maxHeight="85vh"
            footer={footer}
        >
            <style>{`
                .community-modal-handle-field input.outlined-input { padding-right: 2.5rem !important; }
            `}</style>

            <div className="space-y-5">

                {/* ── SECTION: Platform ─────────────────── */}
                <div className="pt-2">
                    <div className="flex items-center gap-4 mb-4">
                        <BookBookmark size={32} weight="duotone" style={{ color: theme.primary }} />
                        <div className="flex flex-col gap-0.5 flex-1">
                            <h4 className="text-lg font-semibold tracking-wide" style={{ color: theme.text }}>Platform & Name</h4>
                            <div className="flex items-center gap-2 ml-1">
                                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                                    Select a platform below
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5 mb-4">
                        {PLATFORMS.map((p) => {
                            const selected = form.platform === p.value;
                            const Icon = p.icon;
                            return (
                                <button
                                    key={p.value}
                                    type="button"
                                    onClick={() => setForm({ ...form, platform: p.value, handle: '', url: '' })}
                                    className="flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all duration-200 active:scale-95"
                                    style={{
                                        backgroundColor: selected ? '#445952' : (theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                                        border: selected ? '1px solid #3B4240' : `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                                        color: selected ? '#fff' : (theme.isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'),
                                        boxShadow: selected
                                            ? 'inset 0 2px 4px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.1)'
                                            : 'inset 0 1px 3px rgba(0,0,0,0.06)',
                                    }}
                                >
                                    <Icon size={16} className="mb-1" style={{ color: selected ? '#fff' : 'inherit' }} aria-hidden />
                                    <span className="text-[9px] font-bold uppercase tracking-wide text-center leading-tight">
                                        {p.tileLabel}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <TextInput
                        label="Community Name"
                        value={form.name}
                        onChange={(v) => setForm({ ...form, name: v })}
                        placeholder="e.g. Peptide Research Hub"
                        {...outlinedInputProps}
                    />
                </div>

                {/* ── SECTION: Link ─────────────────────── */}
                <div className="pt-2">
                    <div className="flex items-center gap-4 mb-4">
                        <At size={32} weight="duotone" style={{ color: theme.primary }} />
                        <div className="flex flex-col gap-0.5 flex-1">
                            <h4 className="text-lg font-semibold tracking-wide" style={{ color: theme.text }}>Link / URL</h4>
                            <div className="flex items-center gap-2 ml-1">
                                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                                    Handle or direct URL
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="relative community-modal-handle-field">
                            <TextInput
                                label={getHandleLabel(plat)}
                                value={form.handle}
                                onChange={(v) => setForm({
                                    ...form,
                                    handle: stripHandlePrefix(form.platform, v),
                                })}
                                placeholder={plat.placeholder}
                                prefix={handlePrefix || null}
                                hidePrefixUntilActive
                                {...outlinedInputProps}
                            />
                            {resolvedUrl && (
                                <a
                                    href={resolvedUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="absolute right-3 top-1/2 z-[2] -translate-y-1/2 opacity-60 hover:opacity-100 touch-manipulation"
                                    style={{ color: theme.primary }}
                                    title="Open in new tab"
                                >
                                    <ExternalLink size={14} />
                                </a>
                            )}
                        </div>

                        {form.platform !== 'forum' && form.platform !== 'other' && (
                            showCustomUrl ? (
                                <>
                                    <div className="flex items-center gap-2 py-1">
                                        <div className="flex-1 h-px" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />
                                        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap" style={{ color: theme.textLight }}>
                                            <PhosphorLink size={10} weight="duotone" />
                                            Custom URL
                                        </span>
                                        <div className="flex-1 h-px" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }} />
                                    </div>

                                    <TextInput
                                        label="Custom URL"
                                        type="url"
                                        value={form.url}
                                        onChange={(v) => setForm({ ...form, url: v })}
                                        placeholder="https://…"
                                        {...outlinedInputProps}
                                    />
                                </>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setShowCustomUrl(true)}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold touch-manipulation self-start"
                                    style={{ color: theme.primary, WebkitTapHighlightColor: 'transparent' }}
                                >
                                    <PhosphorLink size={12} weight="duotone" />
                                    Use custom URL instead
                                </button>
                            )
                        )}
                    </div>
                </div>

                {/* ── SECTION: Details ──────────────────── */}
                <div className="pt-2">
                    <div className="flex items-center gap-4 mb-4">
                        <Notepad size={32} weight="duotone" style={{ color: theme.primary }} />
                        <div className="flex flex-col gap-0.5 flex-1">
                            <h4 className="text-lg font-semibold tracking-wide" style={{ color: theme.text }}>Details</h4>
                            <div className="flex items-center gap-2 ml-1">
                                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }} />
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                                    Private notes
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <OwnerSelect
                            value={form.ownerId}
                            onChange={(ownerId) => setForm({ ...form, ownerId })}
                            theme={theme}
                        />

                        <TextInput
                            label="Private Notes"
                            multiline
                            rows={2}
                            value={form.notes}
                            onChange={(v) => setForm({ ...form, notes: v })}
                            placeholder="Why you follow this, topics you watch, quality notes…"
                            {...outlinedInputProps}
                        />
                    </div>
                </div>
            </div>
        </BottomSheet>
    );
}
