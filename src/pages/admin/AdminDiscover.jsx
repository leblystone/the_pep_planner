import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  collection, query, where, orderBy, onSnapshot,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../../config/firebase'
import {
  CircleNotch, CheckCircle, XCircle, Trash, SealCheck, Warning, Globe, Storefront,
} from '@phosphor-icons/react'

function toast(type, message) {
  window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { type, message } }))
}

function formatDate(ts) {
  if (!ts) return '—'
  const d = ts.toDate ? ts.toDate() : new Date(ts)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

const TABS = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'claims', label: 'Owner Claims' },
]

export default function AdminDiscover() {
  const { theme } = useOutletContext() || {}
  const [tab, setTab] = useState('pending')
  const [vendors, setVendors] = useState([])
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [editDrafts, setEditDrafts] = useState({})

  useEffect(() => {
    setLoading(true)
    const unsub = onSnapshot(
      query(collection(db, 'community_vendors'), orderBy('submittedAt', 'desc')),
      (snap) => {
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      (err) => {
        console.error(err)
        toast('error', 'Could not load Discover vendors')
        setLoading(false)
      }
    )
    return unsub
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'community_vendor_claims'), where('status', '==', 'pending')),
      (snap) => {
        setClaims(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      },
      (err) => console.warn('claims listener', err)
    )
    return unsub
  }, [])

  const filtered = useMemo(() => {
    if (tab === 'claims') return []
    return vendors.filter((v) => (v.status || 'pending') === tab)
  }, [vendors, tab])

  const counts = useMemo(() => ({
    pending: vendors.filter((v) => v.status === 'pending').length,
    approved: vendors.filter((v) => v.status === 'approved').length,
    rejected: vendors.filter((v) => v.status === 'rejected').length,
    claims: claims.length,
  }), [vendors, claims])

  const runAction = useCallback(async (vendorId, moderationAction, extra = {}) => {
    setBusyId(vendorId || moderationAction)
    try {
      const fn = httpsCallable(functions, 'discoverApi')
      await fn({ action: 'adminDiscoverAction', vendorId, moderationAction, ...extra })
      toast('success', moderationAction === 'delete' ? 'Deleted' : `Marked ${moderationAction}`)
    } catch (err) {
      console.error(err)
      toast('error', err.message || 'Action failed')
    } finally {
      setBusyId(null)
    }
  }, [])

  const saveMeta = useCallback(async (vendor) => {
    const draft = editDrafts[vendor.id] || {}
    setBusyId(vendor.id)
    try {
      const fn = httpsCallable(functions, 'discoverApi')
      await fn({
        action: 'adminDiscoverAction',
        vendorId: vendor.id,
        moderationAction: 'updateMeta',
        confirmedByOwner: draft.confirmedByOwner ?? !!vendor.confirmedByOwner,
        discountCode: draft.discountCode ?? vendor.discountCode ?? '',
        discountNote: draft.discountNote ?? vendor.discountNote ?? '',
      })
      toast('success', 'Listing updated')
    } catch (err) {
      toast('error', err.message || 'Update failed')
    } finally {
      setBusyId(null)
    }
  }, [editDrafts])

  const resolveClaim = useCallback(async (vendor, decision) => {
    setBusyId(vendor.id)
    try {
      const fn = httpsCallable(functions, 'discoverApi')
      await fn({
        action: 'adminDiscoverAction',
        vendorId: vendor.id,
        moderationAction: 'resolveClaim',
        decision,
        claimId: vendor.claimId || null,
        discountCode: editDrafts[vendor.id]?.discountCode ?? vendor.discountCode ?? '',
        discountNote: editDrafts[vendor.id]?.discountNote ?? vendor.discountNote ?? '',
      })
      toast('success', decision === 'approved' ? 'Claim approved' : 'Claim rejected')
    } catch (err) {
      toast('error', err.message || 'Claim action failed')
    } finally {
      setBusyId(null)
    }
  }, [editDrafts])

  const claimVendors = useMemo(
    () => vendors.filter((v) => v.claimStatus === 'pending'),
    [vendors]
  )

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold" style={{ color: theme?.text || '#181A18' }}>
          Discover Moderation
        </h1>
        <p className="text-sm mt-1" style={{ color: theme?.textLight || '#71717a' }}>
          Review community suggestions, owner claims, badges, and discount codes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: tab === t.id ? (theme?.primary || '#445952') : 'transparent',
              color: tab === t.id ? '#fff' : (theme?.textLight || '#71717a'),
              border: `1px solid ${tab === t.id ? 'transparent' : (theme?.border || '#e5e7eb')}`,
            }}
          >
            {t.label}
            <span className="ml-1.5 opacity-80">{counts[t.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center">
          <CircleNotch size={24} className="animate-spin" />
        </div>
      ) : tab === 'claims' ? (
        <div className="space-y-3">
          {claimVendors.length === 0 ? (
            <p className="text-sm opacity-60">No pending owner claims.</p>
          ) : (
            claimVendors.map((v) => (
              <div
                key={v.id}
                className="rounded-xl p-4 border"
                style={{ borderColor: theme?.border || '#e5e7eb', background: theme?.cardBackground || '#fff' }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{v.name}</p>
                    <p className="text-xs mt-1 opacity-70">
                      {v.claimBusinessName} · {v.claimContact}
                    </p>
                    {v.claimNote && <p className="text-sm mt-2">{v.claimNote}</p>}
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        className="text-sm px-3 py-2 rounded-lg border"
                        placeholder="Discount code"
                        value={editDrafts[v.id]?.discountCode ?? v.discountCode ?? ''}
                        onChange={(e) => setEditDrafts((d) => ({
                          ...d,
                          [v.id]: { ...d[v.id], discountCode: e.target.value },
                        }))}
                      />
                      <input
                        className="text-sm px-3 py-2 rounded-lg border"
                        placeholder="Discount note"
                        value={editDrafts[v.id]?.discountNote ?? v.discountNote ?? ''}
                        onChange={(e) => setEditDrafts((d) => ({
                          ...d,
                          [v.id]: { ...d[v.id], discountNote: e.target.value },
                        }))}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={busyId === v.id}
                      onClick={() => resolveClaim(v, 'approved')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600"
                    >
                      <CheckCircle size={14} /> Approve
                    </button>
                    <button
                      type="button"
                      disabled={busyId === v.id}
                      onClick={() => resolveClaim(v, 'rejected')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-orange-600"
                    >
                      <XCircle size={14} /> Reject
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <p className="text-sm opacity-60">No {tab} vendors.</p>
          ) : (
            filtered.map((v) => {
              const draft = editDrafts[v.id] || {}
              return (
                <div
                  key={v.id}
                  className="rounded-xl p-4 border"
                  style={{ borderColor: theme?.border || '#e5e7eb', background: theme?.cardBackground || '#fff' }}
                >
                  <div className="flex gap-3">
                    <div className="w-12 h-12 rounded-lg overflow-hidden border flex items-center justify-center shrink-0 bg-black/5">
                      {(v.logoUrl || v.logoFallback) ? (
                        <img src={v.logoUrl || v.logoFallback} alt="" className="w-full h-full object-contain p-1" />
                      ) : (
                        <Storefront size={20} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold truncate">{v.name}</p>
                        <span className="text-[10px] uppercase font-bold tracking-wide opacity-60">{v.type}</span>
                        {v.domainUnreachable && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600">
                            <Warning size={12} /> Domain flag
                          </span>
                        )}
                        {v.confirmedByOwner && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                            <SealCheck size={12} weight="fill" /> Owner confirmed
                          </span>
                        )}
                      </div>
                      {v.website && (
                        <a
                          href={v.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs inline-flex items-center gap-1 mt-1 text-teal-700"
                        >
                          <Globe size={12} /> {v.website.replace(/^https?:\/\//i, '')}
                        </a>
                      )}
                      <p className="text-[11px] mt-1 opacity-50">Submitted {formatDate(v.submittedAt)}</p>

                      {tab === 'approved' && (
                        <div className="mt-3 space-y-2">
                          <label className="flex items-center gap-2 text-xs font-medium">
                            <input
                              type="checkbox"
                              checked={draft.confirmedByOwner ?? !!v.confirmedByOwner}
                              onChange={(e) => setEditDrafts((d) => ({
                                ...d,
                                [v.id]: { ...d[v.id], confirmedByOwner: e.target.checked },
                              }))}
                            />
                            Confirmed by Owner
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              className="text-sm px-3 py-2 rounded-lg border"
                              placeholder="Discount code (web only)"
                              value={draft.discountCode ?? v.discountCode ?? ''}
                              onChange={(e) => setEditDrafts((d) => ({
                                ...d,
                                [v.id]: { ...d[v.id], discountCode: e.target.value },
                              }))}
                            />
                            <input
                              className="text-sm px-3 py-2 rounded-lg border"
                              placeholder="Discount note"
                              value={draft.discountNote ?? v.discountNote ?? ''}
                              onChange={(e) => setEditDrafts((d) => ({
                                ...d,
                                [v.id]: { ...d[v.id], discountNote: e.target.value },
                              }))}
                            />
                          </div>
                          <button
                            type="button"
                            disabled={busyId === v.id}
                            onClick={() => saveMeta(v)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
                            style={{ background: theme?.primary || '#445952' }}
                          >
                            Save badge / discount
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0">
                      {tab === 'pending' && (
                        <>
                          <button
                            type="button"
                            disabled={busyId === v.id}
                            onClick={() => runAction(v.id, 'approve')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600"
                          >
                            <CheckCircle size={13} /> Approve
                          </button>
                          <button
                            type="button"
                            disabled={busyId === v.id}
                            onClick={() => runAction(v.id, 'reject')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-orange-600"
                          >
                            <XCircle size={13} /> Reject
                          </button>
                        </>
                      )}
                      {tab === 'rejected' && (
                        <button
                          type="button"
                          disabled={busyId === v.id}
                          onClick={() => runAction(v.id, 'approve')}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600"
                        >
                          <CheckCircle size={13} /> Approve
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busyId === v.id}
                        onClick={() => {
                          if (window.confirm(`Delete ${v.name}?`)) runAction(v.id, 'delete')
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border"
                      >
                        <Trash size={13} /> Delete
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
