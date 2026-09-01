import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { collection, query, orderBy, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import {
  Bell, CircleNotch, ArrowsClockwise, Copy, Download, EnvelopeSimple, PaperPlaneTilt,
} from '@phosphor-icons/react';
import { gmailComposeUrl } from '../../utils/gmailCompose';

function toast(type, message) {
  window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { type, message } }));
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function normalizeStatus(status) {
  return status === 'notified' ? 'notified' : 'pending';
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminShopWaitlist({ embedded = false, theme: themeProp } = {}) {
  const outlet = useOutletContext();
  const theme = themeProp || outlet?.theme;
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [sendingProductId, setSendingProductId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'notifyMeRequests'), orderBy('createdAt', 'desc')));
      setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Failed to load notify waitlist:', err);
      toast('error', 'Could not load waitlist');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      const status = normalizeStatus(r.status);
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.email || '').toLowerCase().includes(q)
        || (r.productName || '').toLowerCase().includes(q)
        || (r.productId || '').toLowerCase().includes(q)
      );
    });
  }, [requests, statusFilter, search]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const req of filtered) {
      const key = req.productId || 'unknown';
      if (!map.has(key)) {
        map.set(key, {
          productId: key,
          productName: req.productName || key,
          pending: [],
          notified: [],
        });
      }
      const group = map.get(key);
      const bucket = normalizeStatus(req.status) === 'notified' ? group.notified : group.pending;
      bucket.push(req);
    }
    return [...map.values()].sort((a, b) => b.pending.length - a.pending.length);
  }, [filtered]);

  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => normalizeStatus(r.status) === 'pending').length,
    notified: requests.filter((r) => normalizeStatus(r.status) === 'notified').length,
    products: new Set(requests.filter((r) => normalizeStatus(r.status) === 'pending').map((r) => r.productId)).size,
  }), [requests]);

  const notifyAll = async (productId) => {
    setSendingProductId(productId);
    try {
      const fn = httpsCallable(functions, 'sendNotifyMeAlerts');
      const { data } = await fn({ productId });
      toast('success', `Sent ${data?.sent || 0} email(s) for ${data?.productName || 'product'}`);
      await load();
    } catch (err) {
      console.error(err);
      toast('error', err?.message || 'Failed to send alerts');
    } finally {
      setSendingProductId(null);
    }
  };

  const copyEmails = async (entries) => {
    const emails = [...new Set(entries.map((e) => e.email).filter(Boolean))];
    if (!emails.length) return;
    try {
      await navigator.clipboard.writeText(emails.join(', '));
      toast('success', `Copied ${emails.length} email(s)`);
    } catch {
      toast('error', 'Could not copy to clipboard');
    }
  };

  const exportPendingCsv = () => {
    const pending = requests.filter((r) => normalizeStatus(r.status) === 'pending');
    downloadCsv(
      'shop-notify-waitlist.csv',
      [
        ['Email', 'Product', 'Product ID', 'Signed up'],
        ...pending.map((r) => [r.email, r.productName, r.productId, formatDate(r.createdAt)]),
      ]
    );
  };

  return (
    <div className={embedded ? 'space-y-5' : 'space-y-6 max-w-6xl'}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {!embedded && (
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: theme.text }}>
              <Bell size={22} weight="duotone" style={{ color: theme.primary }} />
              Notify Me Waitlist
            </h1>
          )}
          <p className={`text-sm max-w-2xl ${embedded ? '' : 'mt-1'}`} style={{ color: theme.textLight }}>
            Customers who signed up on sold-out products. When you restock, click Notify all — or stock updates from 0 will email them automatically.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={load} disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: theme.border, color: theme.text }}>
            <ArrowsClockwise size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button type="button" onClick={exportPendingCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-sm"
            style={{ borderColor: theme.border, color: theme.text }}>
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Pending', value: stats.pending },
          { label: 'Products waiting', value: stats.products },
          { label: 'Notified', value: stats.notified },
          { label: 'All time', value: stats.total },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-lg border px-4 py-3" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
            <div className="text-xs mb-1" style={{ color: theme.textLight }}>{label}</div>
            <div className="text-xl font-semibold tabular-nums" style={{ color: theme.text }}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {['pending', 'notified', 'all'].map((id) => (
          <button key={id} type="button" onClick={() => setStatusFilter(id)}
            className="px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wide border"
            style={{
              borderColor: statusFilter === id ? theme.primary : theme.border,
              backgroundColor: statusFilter === id ? `${theme.primary}15` : 'transparent',
              color: statusFilter === id ? theme.primary : theme.textLight,
            }}>
            {id}
          </button>
        ))}
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or product…"
          className="ml-auto flex-1 min-w-[200px] max-w-sm px-3 py-2 text-sm rounded-lg border"
          style={{ borderColor: theme.border, backgroundColor: theme.cardBackground, color: theme.text }} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-2" style={{ color: theme.textLight }}>
          <CircleNotch size={22} className="animate-spin" /> Loading waitlist…
        </div>
      ) : grouped.length === 0 ? (
        <div className="text-center py-16 text-sm rounded-lg border" style={{ color: theme.textLight, borderColor: theme.border }}>
          No waitlist entries match this filter.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <div key={group.productId} className="rounded-lg border overflow-hidden" style={{ borderColor: theme.border }}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b"
                style={{ borderColor: theme.border, backgroundColor: `${theme.text}04` }}>
                <div>
                  <div className="font-semibold text-sm" style={{ color: theme.text }}>{group.productName}</div>
                  <div className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                    {group.pending.length} pending · {group.notified.length} notified
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.pending.length > 0 && (
                    <>
                      <button type="button" onClick={() => copyEmails(group.pending)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium"
                        style={{ borderColor: theme.border, color: theme.text }}>
                        <Copy size={14} /> Copy emails
                      </button>
                      <button type="button"
                        onClick={() => notifyAll(group.productId)}
                        disabled={sendingProductId === group.productId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60"
                        style={{ backgroundColor: theme.primary }}>
                        {sendingProductId === group.productId
                          ? <CircleNotch size={14} className="animate-spin" />
                          : <PaperPlaneTilt size={14} weight="fill" />}
                        Notify all ({group.pending.length})
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="divide-y" style={{ borderColor: theme.border }}>
                {[...group.pending, ...group.notified].map((req) => {
                  const status = normalizeStatus(req.status);
                  return (
                    <div key={req.id} className="px-4 py-3 flex flex-wrap items-center gap-3 text-sm">
                      <div className="flex-1 min-w-[180px]">
                        <div className="font-medium" style={{ color: theme.text }}>{req.email}</div>
                        <div className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                          Signed up {formatDate(req.createdAt)}
                          {req.notifiedAt ? ` · Notified ${formatDate(req.notifiedAt)}` : ''}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide"
                        style={{
                          backgroundColor: status === 'pending' ? '#FEF3C7' : '#D1FAE5',
                          color: status === 'pending' ? '#92400E' : '#065F46',
                        }}>
                        {status}
                      </span>
                      <a href={gmailComposeUrl({ to: req.email, subject: `${group.productName} is back in stock` })}
                        target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium underline"
                        style={{ color: theme.primary }}>
                        <EnvelopeSimple size={14} /> Email
                      </a>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
