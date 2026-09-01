import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { collection, query, where, getDocs, Timestamp, doc, onSnapshot } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, functions } from '../../config/firebase';
import {
  CircleNotch, Storefront, ShoppingBag, ArrowsClockwise, Warning,
  LinkSimple as LinkIcon, LinkBreak, CheckCircle, WifiHigh, WifiSlash, Gear,
} from '@phosphor-icons/react';
import { fetchAllShopProducts } from '../../config/plannerProducts';

function toast(type, message) {
  window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { type, message } }));
}

const PLATFORMS = [
  { id: 'own-site', name: 'Own Site', emoji: '🌐', color: '#4A7C6F', alwaysConnected: true },
  { id: 'etsy', name: 'Etsy', emoji: '🧡', color: '#F1641E', alwaysConnected: false },
  { id: 'tiktok', name: 'TikTok Shop', emoji: '🎵', color: '#1a1a2e', alwaysConnected: false },
];

function stockBadgeStyle(stock) {
  if (stock === 0 || stock == null) return { bg: '#fee2e2', text: '#dc2626' };
  if (stock <= 5) return { bg: '#fff7ed', text: '#ea580c' };
  return { bg: '#dcfce7', text: '#16a34a' };
}

export default function AdminMarketplaces({ embedded = false, theme: themeProp } = {}) {
  const outlet = useOutletContext();
  const theme = themeProp || outlet?.theme;
  const [searchParams, setSearchParams] = useSearchParams();
  const [products, setProducts] = useState([]);
  const [platformStatus, setPlatformStatus] = useState({});
  const [revenue, setRevenue] = useState({});
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null);
  const [disconnecting, setDisconnecting] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showCredentials, setShowCredentials] = useState(false);
  const [credForm, setCredForm] = useState({ platform: 'etsy', clientId: '', clientSecret: '' });
  const [savingCreds, setSavingCreds] = useState(false);
  const [syncHistory, setSyncHistory] = useState([]);

  const loadStatus = useCallback(async () => {
    const getStatus = httpsCallable(functions, 'getMarketplaceStatus');
    const { data } = await getStatus();
    setPlatformStatus(data?.status || {});
    return data;
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadProducts(), loadStatus(), loadRevenue()]);
    } finally {
      setLoading(false);
    }
  }, [loadStatus]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, '_config', 'stockSyncHistory'), (snap) => {
      if (!snap.exists()) return;
      const raw = snap.data().history || [];
      const sorted = [...raw]
        .map((r) => ({ ...r, syncedAt: r.syncedAt?.toDate?.() || null }))
        .filter((r) => r.syncedAt)
        .sort((a, b) => b.syncedAt - a.syncedAt)
        .slice(0, 10);
      setSyncHistory(sorted);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const oauth = searchParams.get('oauth');
    const status = searchParams.get('status');
    const message = searchParams.get('message');
    if (!oauth) return;

    if (status === 'success') {
      const name = PLATFORMS.find((p) => p.id === oauth)?.name || oauth;
      toast('success', `${name} connected successfully`);
      loadStatus();
    } else if (oauth === 'error') {
      toast('error', message ? decodeURIComponent(message) : 'Connection failed');
    }

    setSearchParams((prev) => {
      const next = new URLSearchParams();
      const view = prev.get('view');
      if (view) next.set('view', view);
      else if (embedded) next.set('view', 'marketplaces');
      return next;
    }, { replace: true });
  }, [searchParams, setSearchParams, loadStatus, embedded]);

  const loadProducts = async () => {
    try {
      const data = await fetchAllShopProducts();
      setProducts(data);
    } catch (err) {
      console.error('Error loading products:', err);
      toast('error', 'Failed to load products');
    }
  };

  const loadRevenue = async () => {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const q = query(
        collection(db, 'physicalOrders'),
        where('createdAt', '>=', Timestamp.fromDate(startOfMonth)),
      );
      const snap = await getDocs(q);
      const grouped = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        const source = data.source || 'own-site';
        const total = Number(data.totalAmount || data.amount || 0);
        grouped[source] = (grouped[source] || 0) + total;
      });
      setRevenue(grouped);
    } catch (err) {
      console.error('Error loading revenue:', err);
    }
  };

  const lowStockProducts = useMemo(
    () => products.filter((p) => (p.stock ?? 0) <= 5),
    [products],
  );

  const maxRevenue = useMemo(
    () => Math.max(...Object.values(revenue), 1),
    [revenue],
  );

  const isPlatformConnected = (platformId) => {
    if (platformId === 'own-site') return true;
    return !!platformStatus[platformId]?.connected;
  };

  const handleConnect = async (platform) => {
    setConnecting(platform.id);
    try {
      const startOAuth = httpsCallable(getFunctions(), 'startMarketplaceOAuth');
      const { data } = await startOAuth({ platform: platform.id });
      if (!data?.authUrl) {
        toast('error', 'Could not start OAuth — check API credentials');
        return;
      }
      window.location.href = data.authUrl;
    } catch (err) {
      console.error('OAuth start error:', err);
      const msg = err.message || 'Failed to start connection';
      if (msg.includes('credentials not configured')) {
        toast('info', 'Add API keys below, then try Connect again');
        setShowCredentials(true);
        setCredForm((f) => ({ ...f, platform: platform.id }));
      } else {
        toast('error', msg);
      }
    } finally {
      setConnecting(null);
    }
  };

  const handleDisconnect = async (platform) => {
    if (!window.confirm(`Disconnect ${platform.name}? Stock sync to this platform will stop.`)) return;
    setDisconnecting(platform.id);
    try {
      const disconnect = httpsCallable(functions, 'disconnectMarketplace');
      await disconnect({ platform: platform.id });
      toast('success', `${platform.name} disconnected`);
      await loadStatus();
    } catch (err) {
      console.error('Disconnect error:', err);
      toast('error', err.message || 'Failed to disconnect');
    } finally {
      setDisconnecting(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncing(true);
    try {
      const syncAll = httpsCallable(functions, 'syncAllMarketplaceStock');
      const { data } = await syncAll();
      const { synced = 0, partial = 0, errors = 0, skipped = 0, errorSamples = [] } = data || {};
      if (errors > 0 || partial > 0) {
        const detail = errorSamples[0]?.error;
        toast(
          'info',
          detail
            ? `Synced ${synced}, ${partial + errors} failed — ${errorSamples[0].name}: ${detail}`
            : `Synced ${synced} products (${partial + errors} failed, ${skipped} skipped)`,
        );
      } else if (synced === 0) {
        toast('warning', 'Nothing synced — connect Etsy/TikTok and add listing IDs on each product');
      } else {
        toast('success', `Stock synced to ${synced} product${synced !== 1 ? 's' : ''} across platforms`);
      }
    } catch (err) {
      console.error('Sync all error:', err);
      toast('error', err.details || err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const handleSaveCredentials = async (e) => {
    e.preventDefault();
    setSavingCreds(true);
    try {
      const save = httpsCallable(functions, 'saveMarketplaceAppCredentials');
      await save({
        platform: credForm.platform,
        clientId: credForm.clientId,
        clientSecret: credForm.clientSecret,
      });
      toast('success', 'API credentials saved');
      setCredForm((f) => ({ ...f, clientId: '', clientSecret: '' }));
    } catch (err) {
      toast('error', err.message || 'Failed to save credentials');
    } finally {
      setSavingCreds(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <CircleNotch size={24} className="animate-spin" style={{ color: theme.primary }} />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-6' : 'p-4 md:p-6 space-y-6 max-w-5xl'}>
      {!embedded && (
        <div>
          <h1 className="text-xl font-bold" style={{ color: theme.text }}>Marketplaces &amp; Inventory</h1>
          <p className="text-sm mt-0.5" style={{ color: theme.textLight }}>
            Connect Etsy and TikTok Shop — stock stays in sync when orders come in anywhere
          </p>
        </div>
      )}
      {embedded && (
        <p className="text-sm" style={{ color: theme.textLight }}>
          Connect Etsy and TikTok Shop — stock stays in sync when orders come in anywhere
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {PLATFORMS.map((platform) => {
          const connected = isPlatformConnected(platform.id);
          const meta = platformStatus[platform.id];
          const busy = connecting === platform.id || disconnecting === platform.id;

          return (
            <div
              key={platform.id}
              className="rounded-xl border p-4 space-y-3"
              style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">{platform.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: theme.text }}>{platform.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {connected ? (
                      <>
                        <WifiHigh size={12} style={{ color: '#16a34a' }} />
                        <span className="text-xs font-semibold" style={{ color: '#16a34a' }}>
                          {platform.alwaysConnected ? 'Active' : meta?.shopName ? meta.shopName : 'Connected'}
                        </span>
                      </>
                    ) : (
                      <>
                        <WifiSlash size={12} style={{ color: theme.textLight }} />
                        <span className="text-xs font-semibold" style={{ color: theme.textLight }}>Not Connected</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {!platform.alwaysConnected && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => (connected ? handleDisconnect(platform) : handleConnect(platform))}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 disabled:opacity-60"
                  style={connected
                    ? { backgroundColor: `${theme.text}08`, color: theme.textLight, border: `1px solid ${theme.border}` }
                    : { backgroundColor: platform.color, color: '#fff' }
                  }
                >
                  {busy ? (
                    <CircleNotch size={12} className="animate-spin" />
                  ) : connected ? (
                    <><LinkBreak size={12} /> Disconnect</>
                  ) : (
                    <><LinkIcon size={12} /> Connect</>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}>
        <button
          type="button"
          onClick={() => setShowCredentials((v) => !v)}
          className="w-full flex items-center justify-between p-4 text-left"
        >
          <div className="flex items-center gap-2">
            <Gear size={16} style={{ color: theme.primary }} />
            <span className="text-sm font-bold" style={{ color: theme.text }}>API Credentials</span>
            <span className="text-xs" style={{ color: theme.textLight }}>Etsy / TikTok app keys (if not in server env)</span>
          </div>
          <span className="text-xs font-semibold" style={{ color: theme.primary }}>{showCredentials ? 'Hide' : 'Show'}</span>
        </button>
        {showCredentials && (
          <form onSubmit={handleSaveCredentials} className="px-4 pb-4 space-y-3 border-t" style={{ borderColor: theme.border }}>
            <p className="text-xs pt-3 space-y-2" style={{ color: theme.textLight }}>
              <span className="block">
                OAuth redirect URL:{' '}
                <code className="text-[10px] break-all">https://us-central1-tpp-splendide.cloudfunctions.net/marketplaceOAuthCallback</code>
              </span>
              <span className="block">
                Etsy webhook URL (order.paid):{' '}
                <code className="text-[10px] break-all">https://us-central1-tpp-splendide.cloudfunctions.net/etsyOrderWebhook</code>
              </span>
            </p>
            <div className="flex gap-2">
              {['etsy', 'tiktok'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCredForm((f) => ({ ...f, platform: p }))}
                  className="px-3 py-1 rounded-lg text-xs font-semibold capitalize"
                  style={{
                    backgroundColor: credForm.platform === p ? theme.primary : `${theme.text}08`,
                    color: credForm.platform === p ? '#fff' : theme.textLight,
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder={credForm.platform === 'etsy' ? 'Etsy Client ID (keystring)' : 'TikTok App Key'}
              value={credForm.clientId}
              onChange={(e) => setCredForm((f) => ({ ...f, clientId: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: theme.border, backgroundColor: theme.background, color: theme.text }}
            />
            <input
              type="password"
              placeholder={credForm.platform === 'etsy' ? 'Etsy Client Secret' : 'TikTok App Secret'}
              value={credForm.clientSecret}
              onChange={(e) => setCredForm((f) => ({ ...f, clientSecret: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: theme.border, backgroundColor: theme.background, color: theme.text }}
            />
            <button
              type="submit"
              disabled={savingCreds || !credForm.clientId || !credForm.clientSecret}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: theme.primary }}
            >
              {savingCreds ? 'Saving…' : 'Save credentials'}
            </button>
          </form>
        )}
      </div>

      {lowStockProducts.length > 0 && (
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Warning size={16} style={{ color: '#d97706' }} />
            <span className="text-sm font-bold" style={{ color: '#92400e' }}>
              Low Stock Alerts ({lowStockProducts.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStockProducts.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: (p.stock ?? 0) === 0 ? '#fee2e2' : '#fff7ed',
                  color: (p.stock ?? 0) === 0 ? '#dc2626' : '#ea580c',
                }}
              >
                {p.name} — {p.stock ?? 0} left
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}>
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-2">
            <ShoppingBag size={16} style={{ color: theme.primary }} />
            <h2 className="text-sm font-bold" style={{ color: theme.text }}>Inventory Overview</h2>
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}>
              {products.length} products
            </span>
          </div>
          <button
            type="button"
            onClick={handleSyncAll}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60"
            style={{ backgroundColor: theme.primary }}
          >
            {syncing ? <CircleNotch size={12} className="animate-spin" /> : <ArrowsClockwise size={12} />}
            {syncing ? 'Syncing…' : 'Sync All Now'}
          </button>
        </div>

        {/* Sync history */}
        {syncHistory.length > 0 && (
          <div className="border-b pb-3 mb-1" style={{ borderColor: theme.border }}>
            <p className="text-xs font-semibold mb-2" style={{ color: theme.textLight }}>Sync history</p>
            <div className="space-y-1">
              {syncHistory.map((s, i) => (
                <div key={i} className="space-y-0.5 text-xs" style={{ color: theme.textLight }}>
                  <div className="flex items-center justify-between gap-3">
                    <span>
                      {s.syncedAt.toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                      {' '}
                      <span style={{ color: theme.textLight }}>by {s.triggeredBy}</span>
                    </span>
                    <span>
                      <span style={{ color: '#16a34a' }}>{s.synced} synced</span>
                      {s.partial > 0 && <span style={{ color: '#ea580c' }}> · {s.partial} partial</span>}
                      {s.errors > 0 && <span style={{ color: '#ef4444' }}> · {s.errors} error{s.errors !== 1 ? 's' : ''}</span>}
                      {s.skipped > 0 && <span> · {s.skipped} skipped</span>}
                    </span>
                  </div>
                  {s.errorSamples?.[0]?.error && (
                    <div className="text-[10px] truncate" style={{ color: '#ef4444' }}>
                      {s.errorSamples[0].name}: {s.errorSamples[0].error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm" style={{ color: theme.textLight }}>No products yet.</p>
          </div>
        ) : (
          <>
          {/* Mobile card list */}
          <div className="block md:hidden divide-y" style={{ borderColor: theme.border }}>
            {products.map((p) => {
              const stock = p.stock ?? 0;
              const badge = stockBadgeStyle(stock);
              const etsyId = p.platformIds?.etsy || null;
              const tiktokId = p.platformIds?.tiktok || null;
              const isSynced = etsyId || tiktokId;
              return (
                <div key={p.id} className="px-4 py-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: theme.text }}>{p.name}</span>
                    <span className="text-sm font-bold flex-shrink-0" style={{ color: theme.primary }}>${Number(p.price).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {p.sku && <span className="text-xs font-mono" style={{ color: theme.textLight }}>{p.sku}</span>}
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: badge.bg, color: badge.text }}>
                      Stock: {stock}
                    </span>
                    {isSynced ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#16a34a' }}>
                        <CheckCircle size={10} /> Linked
                      </span>
                    ) : (
                      <span className="text-xs" style={{ color: theme.textLight }}>Not linked</span>
                    )}
                  </div>
                  {(etsyId || tiktokId) && (
                    <div className="text-xs font-mono space-y-0.5" style={{ color: theme.textLight }}>
                      {etsyId && <div>Etsy: {etsyId}</div>}
                      {tiktokId && <div>TikTok: {tiktokId}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: `${theme.text}04` }}>
                  {['Product', 'SKU', 'Price', 'Stock', 'Etsy ID', 'TikTok ID', 'Sync Status'].map((h) => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold whitespace-nowrap" style={{ color: theme.textLight }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const stock = p.stock ?? 0;
                  const badge = stockBadgeStyle(stock);
                  const etsyId = p.platformIds?.etsy || null;
                  const tiktokId = p.platformIds?.tiktok || null;
                  const isSynced = etsyId || tiktokId;

                  return (
                    <tr key={p.id} className="border-t" style={{ borderColor: theme.border }}>
                      <td className="px-4 py-2.5 font-semibold max-w-[200px] truncate" style={{ color: theme.text }}>
                        {p.name}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: theme.textLight }}>
                        {p.sku || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-semibold" style={{ color: theme.primary }}>
                        ${Number(p.price).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold"
                          style={{ backgroundColor: badge.bg, color: badge.text }}
                        >
                          {stock}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: etsyId ? theme.text : theme.textLight }}>
                        {etsyId || '—'}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs" style={{ color: tiktokId ? theme.text : theme.textLight }}>
                        {tiktokId || '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        {isSynced ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: '#16a34a' }}>
                            <CheckCircle size={12} /> Linked
                          </span>
                        ) : (
                          <span className="text-xs font-semibold" style={{ color: theme.textLight }}>Not linked</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      <div className="rounded-xl border p-4 space-y-4" style={{ backgroundColor: theme.cardBackground, borderColor: theme.border }}>
        <div className="flex items-center gap-2">
          <Storefront size={16} style={{ color: theme.primary }} />
          <h2 className="text-sm font-bold" style={{ color: theme.text }}>
            Revenue by Platform
          </h2>
          <span className="text-xs" style={{ color: theme.textLight }}>
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </div>

        {Object.keys(revenue).length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: theme.textLight }}>No revenue data yet</p>
        ) : (
          <div className="space-y-3">
            {PLATFORMS.map((platform) => {
              const amount = revenue[platform.id] || 0;
              const pct = maxRevenue > 0 ? (amount / maxRevenue) * 100 : 0;
              return (
                <div key={platform.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{platform.emoji}</span>
                      <span className="text-sm font-semibold" style={{ color: theme.text }}>{platform.name}</span>
                    </div>
                    <span className="text-sm font-bold" style={{ color: theme.text }}>
                      ${amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: `${theme.text}08` }}>
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(pct, amount > 0 ? 2 : 0)}%`, backgroundColor: platform.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
