import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
  CircleNotch, SealCheck, Globe, Storefront, Users, Package, Copy, WarningCircle, ArrowLeft,
} from '@phosphor-icons/react'
import { db, functions } from '../config/firebase'
import { executeRecaptcha } from '../utils/recaptcha'
import VendorContactModal from '../components/vendors/VendorContactModal'
import { CUSTOM_SCHEME } from '../utils/deepLinks'

const THEME = {
  isDark: false,
  primary: '#445952',
  text: '#181A18',
  textLight: '#6b7280',
  textOnPrimary: '#ffffff',
  border: 'rgba(47,59,58,0.12)',
  cardBackground: '#ffffff',
  background: '#f4f6f5',
}

const APP_RETURN_PATH = '/app/vendors'
const APP_RETURN_HTTPS = `https://thepepplanner.app${APP_RETURN_PATH}`

function openBackToApp() {
  if (typeof window === 'undefined') return
  const ua = navigator.userAgent || ''
  const isAndroid = /android/i.test(ua)
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  try {
    if (isAndroid) {
      const fallback = encodeURIComponent(APP_RETURN_HTTPS)
      window.location.href =
        `intent://app/vendors#Intent;scheme=${CUSTOM_SCHEME};package=com.thepepplanner.app;S.browser_fallback_url=${fallback};end`
      return
    }
    if (isIOS) {
      window.location.href = `${CUSTOM_SCHEME}://app/vendors`
      // If the app isn't installed, fall back to the web app after a beat
      window.setTimeout(() => {
        window.location.href = APP_RETURN_HTTPS
      }, 1200)
      return
    }
  } catch {
    // fall through
  }
  window.location.href = APP_RETURN_HTTPS
}

const CATEGORY_META = {
  domestic: { label: 'Domestic', Icon: Storefront },
  international: { label: 'International', Icon: Globe },
  groupbuy: { label: 'Group Buy', Icon: Users },
  supplies: { label: 'Supplies', Icon: Package },
}

/** UI preview seeds — used when Firestore has no approved vendors yet. */
const SEED_VENDORS = [
  {
    id: 'v-1',
    isSeed: true,
    name: 'Peptide Sciences',
    type: 'domestic',
    website: 'https://www.peptidesciences.com',
    logoUrl: 'https://www.google.com/s2/favicons?domain=peptidesciences.com&sz=128',
    logoFallback: 'https://www.google.com/s2/favicons?domain=peptidesciences.com&sz=128',
    upvotes: 184,
    downvotes: 42,
    confirmedByOwner: true,
    discountCode: 'PEPPLANNER10',
    discountNote: '10% off your first order',
    claimStatus: 'approved',
  },
  {
    id: 'v-2',
    isSeed: true,
    name: 'Core Peptides',
    type: 'domestic',
    website: 'https://corepeptides.com',
    logoUrl: 'https://www.google.com/s2/favicons?domain=corepeptides.com&sz=128',
    logoFallback: 'https://www.google.com/s2/favicons?domain=corepeptides.com&sz=128',
    upvotes: 110,
    downvotes: 18,
    confirmedByOwner: false,
    discountCode: '',
    discountNote: '',
    claimStatus: 'none',
  },
  {
    id: 'v-3',
    isSeed: true,
    name: 'Limitless Life Nootropics',
    type: 'international',
    website: 'https://limitlesslifenootropics.com',
    logoUrl: 'https://www.google.com/s2/favicons?domain=limitlesslifenootropics.com&sz=128',
    logoFallback: 'https://www.google.com/s2/favicons?domain=limitlesslifenootropics.com&sz=128',
    upvotes: 76,
    downvotes: 31,
    confirmedByOwner: true,
    discountCode: 'TPP15',
    discountNote: '15% off research supplies',
    claimStatus: 'approved',
  },
  {
    id: 'v-4',
    isSeed: true,
    name: 'Amino Asylum',
    type: 'groupbuy',
    website: 'https://discord.gg/example',
    logoUrl: 'https://www.google.com/s2/favicons?domain=discord.com&sz=128',
    logoFallback: 'https://www.google.com/s2/favicons?domain=discord.com&sz=128',
    upvotes: 55,
    downvotes: 67,
    confirmedByOwner: false,
    discountCode: '',
    discountNote: '',
    claimStatus: 'none',
  },
  {
    id: 'v-5',
    isSeed: true,
    name: 'Swisschems',
    type: 'international',
    website: 'https://swisschems.is',
    logoUrl: 'https://www.google.com/s2/favicons?domain=swisschems.is&sz=128',
    logoFallback: 'https://www.google.com/s2/favicons?domain=swisschems.is&sz=128',
    upvotes: 94,
    downvotes: 24,
    confirmedByOwner: false,
    discountCode: '',
    discountNote: '',
    claimStatus: 'none',
  },
  {
    id: 'v-6',
    isSeed: true,
    name: 'MedLab Supplies',
    type: 'supplies',
    website: 'https://example.com/supplies',
    logoUrl: 'https://www.google.com/s2/favicons?domain=example.com&sz=128',
    logoFallback: 'https://www.google.com/s2/favicons?domain=example.com&sz=128',
    upvotes: 48,
    downvotes: 6,
    confirmedByOwner: true,
    discountCode: 'SUPPLY5',
    discountNote: '$5 off bac water kits',
    claimStatus: 'approved',
  },
]

function mapVendor(docSnap) {
  const data = docSnap.data() || {}
  return { id: docSnap.id, ...data }
}

function toast(type, message) {
  window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { type, message } }))
}

function ClaimForm({ vendor, onClose, onSubmitted }) {
  const [businessName, setBusinessName] = useState('')
  const [contact, setContact] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    let recaptchaToken = null
    try {
      recaptchaToken = await executeRecaptcha('claim_vendor')
    } catch {
      /* continue without */
    }
    try {
      const fn = httpsCallable(functions, 'discoverApi')
      await fn({
        action: 'submitVendorClaim',
        vendorId: vendor.id,
        businessName: businessName.trim(),
        contact: contact.trim(),
        note: note.trim(),
        recaptchaToken,
      })
      toast('success', 'Claim submitted — we will review it shortly.')
      onSubmitted?.()
      onClose?.()
    } catch (err) {
      setError(err.message || 'Could not submit claim')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl p-3 border" style={{ borderColor: THEME.border }}>
      <p className="text-xs font-semibold" style={{ color: THEME.text }}>
        Claim “{vendor.name}”
      </p>
      <input
        required
        className="w-full text-sm px-3 py-2 rounded-lg border"
        placeholder="Business name"
        value={businessName}
        onChange={(e) => setBusinessName(e.target.value)}
      />
      <input
        required
        type="email"
        className="w-full text-sm px-3 py-2 rounded-lg border"
        placeholder="Contact email"
        value={contact}
        onChange={(e) => setContact(e.target.value)}
      />
      <textarea
        className="w-full text-sm px-3 py-2 rounded-lg border min-h-[72px]"
        placeholder="Verification note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="text-xs text-orange-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
          style={{ background: THEME.primary }}
        >
          {busy ? 'Submitting…' : 'Submit claim'}
        </button>
        <button type="button" onClick={onClose} className="px-3 py-2 rounded-lg text-xs font-semibold opacity-70">
          Cancel
        </button>
      </div>
    </form>
  )
}

function VendorWebCard({ vendor, onOpen, onClaim }) {
  const category = CATEGORY_META[vendor.type] || CATEGORY_META.domestic
  const CategoryIcon = category.Icon
  const logoSrc = vendor.logoUrl || vendor.logoFallback || ''
  const score = (vendor.upvotes || 0) - (vendor.downvotes || 0)

  const copyCode = async () => {
    if (!vendor.discountCode) return
    try {
      await navigator.clipboard.writeText(vendor.discountCode)
      toast('success', 'Code copied')
    } catch { /* ignore */ }
  }

  return (
    <div
      className="rounded-2xl p-4 border flex flex-col gap-3"
      style={{ background: THEME.cardBackground, borderColor: THEME.border }}
    >
      <button type="button" onClick={() => onOpen(vendor)} className="text-left flex gap-3">
        <div
          className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center shrink-0 border"
          style={{ borderColor: THEME.border, background: 'rgba(0,0,0,0.03)' }}
        >
          {logoSrc ? (
            <img src={logoSrc} alt="" className="w-full h-full object-contain p-1.5" />
          ) : (
            <CategoryIcon size={20} weight="duotone" style={{ color: THEME.primary }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold truncate" style={{ color: THEME.text }}>{vendor.name}</p>
            <span className="text-xs font-bold tabular-nums shrink-0" style={{ color: score >= 0 ? '#059669' : '#d97706' }}>
              {score >= 0 ? '+' : ''}{score}
            </span>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5" style={{ color: THEME.textLight }}>
            {category.label}
          </p>
          {vendor.confirmedByOwner && (
            <span
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-lg"
              style={{ background: 'rgba(139, 143, 219, 0.18)', color: '#5B5FA8' }}
            >
              <SealCheck size={13} weight="fill" /> Confirmed by Owner
            </span>
          )}
        </div>
      </button>

      {vendor.discountCode && (
        <div className="rounded-xl px-3 py-2" style={{ background: 'rgba(68,89,82,0.08)' }}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: THEME.textLight }}>Discount</p>
              <code className="text-sm font-bold">{vendor.discountCode}</code>
            </div>
            <button type="button" onClick={copyCode} className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: THEME.primary }}>
              <Copy size={12} /> Copy
            </button>
          </div>
          {vendor.discountNote && (
            <p className="text-xs mt-1" style={{ color: THEME.textLight }}>{vendor.discountNote}</p>
          )}
        </div>
      )}

      {!vendor.confirmedByOwner && vendor.claimStatus !== 'pending' && (
        <button
          type="button"
          onClick={() => onClaim(vendor)}
          className="text-xs font-semibold self-start underline underline-offset-2"
          style={{ color: THEME.textLight }}
        >
          Claim this listing
        </button>
      )}
      {vendor.claimStatus === 'pending' && (
        <p className="text-[11px]" style={{ color: THEME.textLight }}>Owner claim pending review</p>
      )}
    </div>
  )
}

export default function WebDiscover() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const focusVendorId = searchParams.get('vendor') || ''
  const focusType = searchParams.get('type') || ''
  const [gate, setGate] = useState('checking') // checking | valid | invalid
  const [vendors, setVendors] = useState([])
  const [category, setCategory] = useState(() => (
    ['domestic', 'international', 'groupbuy', 'supplies'].includes(focusType) ? focusType : 'domestic'
  ))
  const [contactVendor, setContactVendor] = useState(null)
  const [claimVendor, setClaimVendor] = useState(null)
  const [didFocusVendor, setDidFocusVendor] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      // Local UI preview — skip token gate so seeds are easy to check
      if (import.meta.env.DEV && (!token || token === 'preview')) {
        setGate('valid')
        return
      }
      if (!token) {
        setGate('invalid')
        return
      }
      try {
        const validate = httpsCallable(functions, 'discoverApi')
        const { data } = await validate({ action: 'validateDiscoverToken', token })
        if (cancelled) return
        setGate(data?.valid ? 'valid' : 'invalid')
      } catch {
        if (!cancelled) setGate('invalid')
      }
    })()
    return () => { cancelled = true }
  }, [token])

  useEffect(() => {
    if (gate !== 'valid') return undefined
    const q = query(collection(db, 'community_vendors'), where('status', '==', 'approved'))
    const unsub = onSnapshot(q, (snap) => {
      setVendors(snap.docs.map(mapVendor))
    }, () => {
      // Rules/network issues — still allow seed preview
      setVendors([])
    })
    return unsub
  }, [gate])

  const displayVendors = useMemo(() => {
    if (vendors.length > 0) return vendors
    return SEED_VENDORS
  }, [vendors])

  // Deep Dive from app: jump to category + open that vendor's details
  useEffect(() => {
    if (didFocusVendor || !focusVendorId || displayVendors.length === 0) return
    const match = displayVendors.find((v) => v.id === focusVendorId)
    if (!match) return
    setCategory(match.type || 'domestic')
    setContactVendor(match)
    setDidFocusVendor(true)
  }, [displayVendors, focusVendorId, didFocusVendor])

  const filtered = useMemo(() => {
    return [...displayVendors]
      .filter((v) => (v.type || 'domestic') === category)
      .sort((a, b) => ((b.upvotes || 0) - (b.downvotes || 0)) - ((a.upvotes || 0) - (a.downvotes || 0)))
  }, [displayVendors, category])

  const categories = useMemo(() => Object.entries(CATEGORY_META), [])

  if (gate === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: THEME.background }}>
        <CircleNotch size={28} className="animate-spin" style={{ color: THEME.primary }} />
      </div>
    )
  }

  if (gate === 'invalid') {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: THEME.background }}>
        <div className="max-w-md text-center rounded-2xl p-8 border bg-white" style={{ borderColor: THEME.border }}>
          <WarningCircle size={36} className="mx-auto mb-3" style={{ color: '#d97706' }} />
          <h1 className="text-lg font-bold mb-2" style={{ color: THEME.text }}>This link has expired</h1>
          <p className="text-sm" style={{ color: THEME.textLight }}>
            Open The Pep Planner app and tap “Discover More” on a source to get a fresh link.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: THEME.background, color: THEME.text }}>
      <header
        className="sticky top-0 z-10 border-b backdrop-blur-md px-4 py-4"
        style={{
          borderColor: THEME.border,
          background: 'rgba(255,255,255,0.88)',
        }}
      >
        <div className="max-w-3xl mx-auto relative flex items-center justify-center min-h-[52px]">
          <button
            type="button"
            onClick={openBackToApp}
            className="absolute left-0 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-full touch-manipulation"
            style={{
              color: THEME.primary,
              background: 'rgba(68,89,82,0.08)',
              WebkitTapHighlightColor: 'transparent',
            }}
            title="Return to The Pep Planner app"
          >
            <ArrowLeft size={14} weight="bold" />
            <span className="hidden sm:inline">Back to app</span>
            <span className="sm:hidden">App</span>
          </button>

          <div className="flex flex-col items-center text-center gap-1.5 px-16 sm:px-28">
            <p
              className="text-[10px] font-bold uppercase tracking-[0.28em]"
              style={{ color: THEME.primary }}
            >
              The Pep Planner
            </p>
            <h1
              className="text-2xl font-bold leading-none tracking-tight"
              style={{ color: THEME.text }}
            >
              Discover
            </h1>
            <div
              className="mt-1 h-0.5 w-8 rounded-full"
              style={{ background: THEME.primary, opacity: 0.55 }}
              aria-hidden
            />
          </div>

          <p
            className="absolute right-0 top-1/2 -translate-y-1/2 text-[10px] sm:text-[11px] leading-snug text-right max-w-[140px] sm:max-w-[180px]"
            style={{ color: THEME.textLight }}
          >
            Community-updated sources log. No sponsorships, no affiliate links, no endorsements.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-5">
        <div className="grid grid-cols-4 gap-1.5 p-0.5 rounded-full mb-4" style={{ background: 'rgba(47,59,58,0.07)' }}>
          {categories.map(([key, meta]) => {
            const active = category === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCategory(key)}
                className="py-2 rounded-full text-[11px] font-semibold"
                style={{
                  background: active ? THEME.primary : 'transparent',
                  color: active ? '#fff' : THEME.textLight,
                }}
              >
                {meta.label === 'International' ? 'Intl' : meta.label}
              </button>
            )
          })}
        </div>

        {claimVendor && (
          <ClaimForm
            vendor={claimVendor}
            onClose={() => setClaimVendor(null)}
            onSubmitted={() => setClaimVendor(null)}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          {filtered.length === 0 ? (
            <p className="text-sm col-span-full text-center py-10" style={{ color: THEME.textLight }}>
              No sources in this category yet.
            </p>
          ) : (
            filtered.map((v) => (
              <VendorWebCard
                key={v.id}
                vendor={v}
                onOpen={setContactVendor}
                onClaim={setClaimVendor}
              />
            ))
          )}
        </div>
      </main>

      <VendorContactModal
        open={!!contactVendor}
        onClose={() => setContactVendor(null)}
        vendor={contactVendor}
        theme={THEME}
        showDiscounts
        showOwnerBadge
        onClaim={(v) => {
          setContactVendor(null)
          setClaimVendor(v)
        }}
      />
    </div>
  )
}
