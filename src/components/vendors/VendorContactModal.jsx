import React, { useMemo } from 'react'
import {
  SealCheck,
  Globe,
  ArrowSquareOut,
  Copy,
  Storefront,
  Users,
  Package,
} from '@phosphor-icons/react'
import BottomSheet from '../common/BottomSheet'
import { openExternalUrl } from '../../utils/platform'

const CATEGORY_META = {
  domestic: { label: 'Domestic', Icon: Storefront },
  international: { label: 'International', Icon: Globe },
  groupbuy: { label: 'Group Buy', Icon: Users },
  supplies: { label: 'Supplies', Icon: Package },
}

/**
 * Read-only website / contact sheet for Discover vendors.
 * Discount codes shown only when showDiscounts=true (web Discover page).
 */
export default function VendorContactModal({
  open,
  onClose,
  vendor,
  theme,
  showDiscounts = false,
  showOwnerBadge = false,
  onClaim,
}) {
  const category = CATEGORY_META[vendor?.type] || CATEGORY_META.domestic
  const CategoryIcon = category.Icon
  const logoSrc = vendor?.logoUrl || vendor?.logoFallback || ''
  const website = vendor?.website || ''

  const score = useMemo(() => {
    if (!vendor) return 0
    return (vendor.upvotes || 0) - (vendor.downvotes || 0)
  }, [vendor])

  const handleOpenSite = async () => {
    if (!website) return
    await openExternalUrl(website)
  }

  const handleCopyCode = async () => {
    const code = vendor?.discountCode
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { type: 'success', message: 'Discount code copied' },
      }))
    } catch {
      /* ignore */
    }
  }

  if (!vendor) return null

  const footer = (
    <div className="flex gap-2">
      {website ? (
        <button
          type="button"
          onClick={handleOpenSite}
          className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold touch-manipulation"
          style={{
            background: theme.primary,
            color: theme.textOnPrimary || '#fff',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <Globe size={16} weight="bold" />
          Visit Website
          <ArrowSquareOut size={14} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-3 rounded-xl text-sm font-semibold"
          style={{ background: theme.primary, color: theme.textOnPrimary || '#fff' }}
        >
          Close
        </button>
      )}
    </div>
  )

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={vendor.name || 'Source'}
      theme={theme}
      fitContent
      footer={footer}
    >
      <div className="flex flex-col gap-4 pb-1">
        <div className="flex items-start gap-3">
          <div
            className="w-14 h-14 rounded-xl overflow-hidden shrink-0 flex items-center justify-center"
            style={{
              background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              border: `1px solid ${theme.border}`,
            }}
          >
            {logoSrc ? (
              <img
                src={logoSrc}
                alt=""
                className="w-full h-full object-contain p-1.5"
                onError={(e) => {
                  if (vendor.logoFallback && e.currentTarget.src !== vendor.logoFallback) {
                    e.currentTarget.src = vendor.logoFallback
                  } else {
                    e.currentTarget.style.display = 'none'
                  }
                }}
              />
            ) : (
              <CategoryIcon size={24} weight="duotone" style={{ color: theme.primary }} />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-base leading-snug" style={{ color: theme.text }}>
              {vendor.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: theme.textLight }}
              >
                <CategoryIcon size={12} weight="duotone" style={{ color: theme.primary }} />
                {category.label}
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: theme.textLight }}>
                Score {score >= 0 ? '+' : ''}{score}
              </span>
            </div>

            {(showOwnerBadge || vendor.confirmedByOwner) && vendor.confirmedByOwner && (
              <span
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-lg"
                style={{
                  background: theme.isDark ? 'rgba(52,211,153,0.15)' : 'rgba(5,150,105,0.12)',
                  color: theme.isDark ? '#6ee7b7' : '#059669',
                  border: `1px solid ${theme.isDark ? 'rgba(52,211,153,0.35)' : 'rgba(5,150,105,0.3)'}`,
                }}
              >
                <SealCheck size={14} weight="fill" />
                Confirmed by Owner
              </span>
            )}
          </div>
        </div>

        {website && (
          <button
            type="button"
            onClick={handleOpenSite}
            className="w-full text-left px-3 py-2.5 rounded-xl touch-manipulation"
            style={{
              background: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(47,59,58,0.04)',
              border: `1px solid ${theme.border}`,
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: theme.textLight }}>
              Website
            </p>
            <p className="text-sm font-medium truncate" style={{ color: theme.primary }}>
              {website.replace(/^https?:\/\//i, '')}
            </p>
          </button>
        )}

        {showDiscounts && vendor.discountCode && (
          <div
            className="px-3 py-2.5 rounded-xl"
            style={{
              background: theme.isDark ? `${theme.primary}18` : `${theme.primary}10`,
              border: `1px solid ${theme.isDark ? `${theme.primary}40` : `${theme.primary}28`}`,
            }}
          >
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: theme.textLight }}>
              Owner discount
            </p>
            <div className="flex items-center justify-between gap-2">
              <code className="text-sm font-bold tracking-wide" style={{ color: theme.text }}>
                {vendor.discountCode}
              </code>
              <button
                type="button"
                onClick={handleCopyCode}
                className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg touch-manipulation"
                style={{ color: theme.primary, background: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }}
              >
                <Copy size={12} />
                Copy
              </button>
            </div>
            {vendor.discountNote && (
              <p className="text-xs mt-1.5" style={{ color: theme.textLight }}>
                {vendor.discountNote}
              </p>
            )}
          </div>
        )}

        {typeof onClaim === 'function' && !vendor.confirmedByOwner && (
          <button
            type="button"
            onClick={() => onClaim(vendor)}
            className="text-xs font-semibold underline underline-offset-2 self-start touch-manipulation"
            style={{ color: theme.textLight }}
          >
            Claim this listing
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
