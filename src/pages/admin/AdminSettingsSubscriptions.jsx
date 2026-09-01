import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { ArrowsClockwise, CircleNotch, CreditCard, DeviceMobile, AppleLogo, ListBullets, ClockCounterClockwise, Warning, AndroidLogo } from '@phosphor-icons/react';
import { collection, query, orderBy, limit as fsLimit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  adminRunSubscriptionReconciliation,
  getAdminSubscriptionReconciliationLog,
  findOrphanedAndroidUsers,
  getGooglePlayWebhookFailures,
  findOrphanedAppleUsers,
  getAppleWebhookFailures,
} from '../../services/firebase';

const PLATFORMS = [
  {
    id: 'stripe',
    label: 'Stripe (Web)',
    icon: CreditCard,
    detail: 'Pulls all Stripe-linked accounts — status, cancel-at-period-end, billing dates.',
  },
  {
    id: 'googleplay',
    label: 'Google Play (Android)',
    icon: DeviceMobile,
    detail: 'Verifies purchase tokens with Google Play and updates Firestore.',
  },
  {
    id: 'apple',
    label: 'Apple (iOS)',
    icon: AppleLogo,
    detail: 'Normalizes Apple subscription fields in Firestore (renewals come from App Store webhooks).',
  },
  {
    id: 'all',
    label: 'All platforms',
    icon: ArrowsClockwise,
    detail: 'Runs Stripe, Google Play, and Apple passes in one job.',
  },
];

const CHANGE_LABELS = {
  missing_restored: 'Missing data restored',
  drift_corrected: 'Drift corrected',
  manual_sync: 'Manual sync',
  apple_normalized: 'Apple fields normalized',
  updated: 'Updated',
};

function formatWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return String(iso);
  }
}

export default function AdminSettingsSubscriptions() {
  const { theme } = useOutletContext();
  const [running, setRunning] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logFilterRunId, setLogFilterRunId] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [orphans, setOrphans] = useState(null);
  const [orphansLoading, setOrphansLoading] = useState(false);
  const [webhookFailures, setWebhookFailures] = useState(null);
  const [webhookFailuresLoading, setWebhookFailuresLoading] = useState(false);
  const [appleOrphans, setAppleOrphans] = useState(null);
  const [appleOrphansLoading, setAppleOrphansLoading] = useState(false);
  const [appleWebhookFails, setAppleWebhookFails] = useState(null);
  const [appleWebhookFailsLoading, setAppleWebhookFailsLoading] = useState(false);
  const [androidScanMeta, setAndroidScanMeta] = useState(null);
  const [appleScanMeta, setAppleScanMeta] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'reconciliationRuns'), orderBy('ranAt', 'desc'), fsLimit(20));
    const unsub = onSnapshot(q, (snap) => {
      setRunHistory(snap.docs.map(d => ({ id: d.id, ...d.data(), ranAt: d.data().ranAt?.toDate?.()?.toISOString() })));
    });
    return unsub;
  }, []);

  // Load cached orphan scan results on mount so data sticks between page visits
  useEffect(() => {
    async function loadCachedScans() {
      try {
        const [androidSnap, appleSnap] = await Promise.all([
          getDoc(doc(db, 'subscriptionScans', 'android_orphans')),
          getDoc(doc(db, 'subscriptionScans', 'apple_orphans')),
        ]);
        if (androidSnap.exists()) {
          const d = androidSnap.data();
          setOrphans({ success: true, count: d.count, orphans: d.orphans || [] });
          setAndroidScanMeta({ scannedAt: d.scannedAt?.toDate?.()?.toISOString() || null, scannedBy: d.scannedBy });
        }
        if (appleSnap.exists()) {
          const d = appleSnap.data();
          setAppleOrphans({ success: true, count: d.count, orphans: d.orphans || [] });
          setAppleScanMeta({ scannedAt: d.scannedAt?.toDate?.()?.toISOString() || null, scannedBy: d.scannedBy });
        }
      } catch (_) {
        // Rules not yet deployed or no scan yet — silently skip
      }
    }
    loadCachedScans();
  }, []);

  const loadLogs = useCallback(async (runId) => {
    setLogsLoading(true);
    try {
      const data = await getAdminSubscriptionReconciliationLog({ limit: 80, runId: runId || undefined });
      setLogs(data.logs || []);
    } catch (e) {
      console.warn('Could not load reconciliation log', e);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLogs(logFilterRunId);
  }, [loadLogs, logFilterRunId]);

  const run = async (platform) => {
    setRunning(platform);
    setError(null);
    setResult(null);
    try {
      const data = await adminRunSubscriptionReconciliation({ platform });
      setResult(data);
      if (data.runId) setLogFilterRunId(data.runId);
      await loadLogs(data.runId);
      const n = data.totalLogged ?? data.logged ?? data.logs?.length ?? 0;
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: {
            message: `Reconciliation done — ${n} subscription${n === 1 ? '' : 's'} logged as updated`,
            type: 'success',
          },
        })
      );
    } catch (e) {
      setError(e.message || 'Reconciliation failed');
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: { message: e.message || 'Reconciliation failed', type: 'error' },
        })
      );
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-xl font-bold" style={{ color: theme.primaryDark }}>
          Subscription reconciliation
        </h1>
        <p className="text-sm mt-1" style={{ color: theme.textLight }}>
          Stripe also runs automatically every day at 4:00 AM UTC. Use these buttons when you need Firestore
          updated right now. Updates are recorded in the log below.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map(({ id, label, icon: Icon, detail }) => (
          <div
            key={id}
            className="rounded-xl border p-4 flex flex-col gap-3"
            style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}
          >
            <div className="flex items-center gap-2">
              <Icon size={20} style={{ color: theme.primary }} />
              <span className="font-semibold text-sm" style={{ color: theme.text }}>
                {label}
              </span>
            </div>
            <p className="text-xs flex-1" style={{ color: theme.textLight }}>
              {detail}
            </p>
            <button
              type="button"
              disabled={!!running}
              onClick={() => run(id)}
              className="w-full py-2 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: theme.primary, color: '#fff' }}
            >
              {running === id ? (
                <>
                  <CircleNotch size={16} className="animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <ArrowsClockwise size={16} />
                  Run now
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {error && (
        <p className="text-sm rounded-lg p-3" style={{ backgroundColor: theme.error + '15', color: theme.error }}>
          {error}
        </p>
      )}

      {/* Run History */}
      {runHistory.length > 0 && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
          <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: theme.border }}>
            <ClockCounterClockwise size={16} style={{ color: theme.primary }} />
            <span className="font-semibold text-sm" style={{ color: theme.text }}>Run History</span>
            <span className="text-xs ml-auto" style={{ color: theme.textLight }}>Last {runHistory.length} runs</span>
          </div>
          <div className="overflow-x-auto max-h-52 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0" style={{ backgroundColor: theme.background }}>
                <tr>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>When</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Platforms</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Scanned</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Fixed</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Run by</th>
                </tr>
              </thead>
              <tbody>
                {runHistory.map((run) => {
                  const scanned = Object.values(run.summary || {}).reduce((a, p) => a + (p.usersScanned || 0), 0);
                  const fixed = run.totalLogged || 0;
                  const hasError = Object.values(run.summary || {}).some(p => p.error);
                  return (
                    <tr key={run.id} className="border-t" style={{ borderColor: theme.border + '60' }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textLight }}>{formatWhen(run.ranAt)}</td>
                      <td className="px-3 py-2" style={{ color: theme.text }}>{(run.platforms || []).join(', ')}</td>
                      <td className="px-3 py-2" style={{ color: theme.text }}>{scanned}</td>
                      <td className="px-3 py-2">
                        <span style={{ color: fixed > 0 ? '#10B981' : hasError ? '#EF4444' : theme.textLight }}>
                          {hasError ? 'error' : fixed > 0 ? `${fixed} fixed` : 'no drift'}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textLight }}>{run.runBy || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {result?.summary && (
        <div
          className="text-xs p-3 rounded-lg"
          style={{ backgroundColor: theme.background, color: theme.textLight, border: `1px solid ${theme.border}` }}
        >
          <span style={{ color: theme.text, fontWeight: 600 }}>Last run summary</span>
          {(result.totalLogged != null || result.logged != null) && (
            <p className="mt-1" style={{ color: theme.success }}>
              {result.totalLogged ?? result.logged} subscription(s) written to the log
            </p>
          )}
          <pre className="mt-2 overflow-auto max-h-32">{JSON.stringify(result.summary, null, 2)}</pre>
        </div>
      )}

      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 border-b"
          style={{ borderColor: theme.border }}
        >
          <div className="flex items-center gap-2">
            <ListBullets size={18} style={{ color: theme.primary }} />
            <span className="font-semibold text-sm" style={{ color: theme.text }}>
              Reconciliation log
            </span>
          </div>
          <div className="flex items-center gap-2">
            {logFilterRunId && (
              <button
                type="button"
                className="text-[10px] px-2 py-1 rounded"
                style={{ backgroundColor: theme.warning + '20', color: theme.warning }}
                onClick={() => setLogFilterRunId(null)}
              >
                Clear run filter
              </button>
            )}
            <button
              type="button"
              className="text-xs underline"
              style={{ color: theme.textLight }}
              onClick={() => loadLogs(logFilterRunId)}
            >
              Refresh
            </button>
          </div>
        </div>

        {logFilterRunId && (
          <p className="px-4 py-2 text-[10px]" style={{ color: theme.textLight, backgroundColor: theme.background }}>
            Showing updates from run: <code>{logFilterRunId}</code>
          </p>
        )}

        {logsLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: theme.textLight }}>
            <CircleNotch size={18} className="animate-spin" />
            Loading log…
          </div>
        ) : logs.length === 0 ? (
          <p className="px-4 py-8 text-sm text-center" style={{ color: theme.textLight }}>
            No updates logged yet. Run a reconciliation — only users that were missing data or out of sync
            appear here.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0" style={{ backgroundColor: theme.background }}>
                <tr>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>When</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>User</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Store</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Change</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Before → After</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row) => (
                  <tr key={row.id} className="border-t" style={{ borderColor: theme.border + '60' }}>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textLight }}>
                      {formatWhen(row.createdAt)}
                    </td>
                    <td className="px-3 py-2">
                      <div style={{ color: theme.text }}>{row.userEmail || row.userId?.slice(0, 8)}</div>
                      {row.userEmail && (
                        <Link
                          to={`/admin/users?uid=${row.userId}`}
                          className="text-[10px] underline"
                          style={{ color: theme.info }}
                        >
                          Open user
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize" style={{ color: theme.text }}>
                      {row.platform}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor:
                            row.changeType === 'missing_restored' ? theme.warning + '25' : theme.success + '20',
                          color: row.changeType === 'missing_restored' ? theme.warning : theme.success,
                        }}
                      >
                        {CHANGE_LABELS[row.changeType] || row.changeType}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: theme.textLight }}>
                      <span>
                        {row.before?.status || '—'} / {row.before?.cancelAtPeriodEnd ? 'not renewing' : 'renewing'}
                      </span>
                      <span className="mx-1">→</span>
                      <span style={{ color: theme.text }}>
                        {row.after?.status || '—'} / {row.after?.cancelAtPeriodEnd ? 'not renewing' : 'renewing'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Orphaned Android Users — have google_play provider but no purchase token */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.warning + '60', backgroundColor: theme.cardBackground }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: theme.warning + '40', backgroundColor: theme.warning + '08' }}>
          <Warning size={16} style={{ color: theme.warning }} />
          <span className="font-semibold text-sm" style={{ color: theme.text }}>Android users missing purchase token</span>
          {androidScanMeta?.scannedAt && (
            <span className="text-[10px] ml-2" style={{ color: theme.textLight }}>
              Last scanned {formatWhen(androidScanMeta.scannedAt)}
            </span>
          )}
          <button
            type="button"
            disabled={orphansLoading}
            onClick={async () => {
              setOrphansLoading(true);
              try {
                const d = await findOrphanedAndroidUsers();
                setOrphans(d);
                setAndroidScanMeta({ scannedAt: new Date().toISOString(), scannedBy: d.scannedBy });
              }
              catch (e) { setOrphans({ error: e.message }); }
              finally { setOrphansLoading(false); }
            }}
            className="ml-2 px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 disabled:opacity-60"
            style={{ backgroundColor: theme.warning + '20', color: theme.warning }}
          >
            {orphansLoading ? <CircleNotch size={12} className="animate-spin" /> : <AndroidLogo size={12} />}
            {orphans ? 'Rescan' : 'Scan'}
          </button>
        </div>
        {!orphans && !orphansLoading && (
          <p className="px-4 py-6 text-sm text-center" style={{ color: theme.textLight }}>
            Click Scan to find Android subscribers whose purchase token was never saved — these users can't auto-sync until their token is seeded.
          </p>
        )}
        {orphans?.error && (
          <p className="px-4 py-4 text-sm" style={{ color: theme.error }}>{orphans.error}</p>
        )}
        {orphans && !orphans.error && (
          orphans.count === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: theme.success }}>✅ No orphaned Android users found — all have tokens on file.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead style={{ backgroundColor: theme.background }}>
                  <tr>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Email</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Status</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Product</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Period end</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {orphans.orphans.map((u) => (
                    <tr key={u.userId} className="border-t" style={{ borderColor: theme.border + '60' }}>
                      <td className="px-3 py-2" style={{ color: theme.text }}>{u.email || u.userId.slice(0, 10) + '…'}</td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ backgroundColor: u.status === 'active' ? theme.success + '20' : theme.error + '15', color: u.status === 'active' ? theme.success : theme.error }}>
                          {u.status || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]" style={{ color: theme.textLight }}>{u.productId || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textLight }}>{u.currentPeriodEnd ? new Date(u.currentPeriodEnd).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2">
                        <Link to={`/admin/users?uid=${u.userId}`} className="text-[10px] underline" style={{ color: theme.info }}>
                          Open user → seed token
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Apple Orphaned Users — apple provider but no originalTransactionId */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.warning + '60', backgroundColor: theme.cardBackground }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: theme.warning + '40', backgroundColor: theme.warning + '08' }}>
          <Warning size={16} style={{ color: theme.warning }} />
          <span className="font-semibold text-sm" style={{ color: theme.text }}>iOS users missing transaction ID</span>
          {appleScanMeta?.scannedAt && (
            <span className="text-[10px] ml-2" style={{ color: theme.textLight }}>
              Last scanned {formatWhen(appleScanMeta.scannedAt)}
            </span>
          )}
          <button
            type="button"
            disabled={appleOrphansLoading}
            onClick={async () => {
              setAppleOrphansLoading(true);
              try {
                const d = await findOrphanedAppleUsers();
                setAppleOrphans(d);
                setAppleScanMeta({ scannedAt: new Date().toISOString(), scannedBy: d.scannedBy });
              }
              catch (e) { setAppleOrphans({ error: e.message }); }
              finally { setAppleOrphansLoading(false); }
            }}
            className="ml-2 px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 disabled:opacity-60"
            style={{ backgroundColor: theme.warning + '20', color: theme.warning }}
          >
            {appleOrphansLoading ? <CircleNotch size={12} className="animate-spin" /> : <AppleLogo size={12} />}
            {appleOrphans ? 'Rescan' : 'Scan'}
          </button>
        </div>
        {!appleOrphans && !appleOrphansLoading && (
          <p className="px-4 py-6 text-sm text-center" style={{ color: theme.textLight }}>
            Click Scan to find iOS subscribers with no originalTransactionId on file. To fix: look up the user's email in App Store Connect → Subscriptions, copy their transaction ID, then open their admin profile and use the Apple manual grant to seed it.
          </p>
        )}
        {appleOrphans?.error && (
          <p className="px-4 py-4 text-sm" style={{ color: theme.error }}>{appleOrphans.error}</p>
        )}
        {appleOrphans && !appleOrphans.error && (
          appleOrphans.count === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: theme.success }}>✅ No orphaned iOS users found — all have a transaction ID on file.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead style={{ backgroundColor: theme.background }}>
                  <tr>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Email</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Status</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Product</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Period end</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Fix</th>
                  </tr>
                </thead>
                <tbody>
                  {appleOrphans.orphans.map((u) => (
                    <tr key={u.userId} className="border-t" style={{ borderColor: theme.border + '60' }}>
                      <td className="px-3 py-2" style={{ color: theme.text }}>{u.email || u.userId.slice(0, 10) + '…'}</td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
                          style={{ backgroundColor: u.status === 'active' ? theme.success + '20' : theme.error + '15', color: u.status === 'active' ? theme.success : theme.error }}>
                          {u.status || '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]" style={{ color: theme.textLight }}>{u.productId || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textLight }}>{u.currentPeriodEnd ? new Date(u.currentPeriodEnd).toLocaleDateString() : '—'}</td>
                      <td className="px-3 py-2">
                        <Link to={`/admin/users?uid=${u.userId}`} className="text-[10px] underline" style={{ color: theme.info }}>
                          Open user → seed txn ID
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Apple S2S Webhook Failures — transaction IDs that didn't match a user */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: theme.border }}>
          <AppleLogo size={16} style={{ color: theme.primary }} />
          <span className="font-semibold text-sm" style={{ color: theme.text }}>Apple S2S webhook failures</span>
          <span className="text-xs ml-auto" style={{ color: theme.textLight }}>Unmatched transaction IDs from Apple</span>
          <button
            type="button"
            disabled={appleWebhookFailsLoading}
            onClick={async () => {
              setAppleWebhookFailsLoading(true);
              try { const d = await getAppleWebhookFailures({ limit: 50 }); setAppleWebhookFails(d); }
              catch (e) { setAppleWebhookFails({ error: e.message }); }
              finally { setAppleWebhookFailsLoading(false); }
            }}
            className="ml-2 px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 disabled:opacity-60"
            style={{ backgroundColor: theme.primary + '15', color: theme.primary }}
          >
            {appleWebhookFailsLoading ? <CircleNotch size={12} className="animate-spin" /> : <ArrowsClockwise size={12} />}
            Load
          </button>
        </div>
        {!appleWebhookFails && !appleWebhookFailsLoading && (
          <p className="px-4 py-6 text-sm text-center" style={{ color: theme.textLight }}>
            Click Load to see Apple App Store S2S events (SUBSCRIBED, DID_RENEW, etc.) that arrived but couldn't be matched to any user. The originalTransactionId in each row can be searched in App Store Connect to find the subscriber.
          </p>
        )}
        {appleWebhookFails?.error && (
          <p className="px-4 py-4 text-sm" style={{ color: theme.error }}>{appleWebhookFails.error}</p>
        )}
        {appleWebhookFails && !appleWebhookFails.error && (
          appleWebhookFails.count === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: theme.success }}>✅ No unmatched Apple webhook events.</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0" style={{ backgroundColor: theme.background }}>
                  <tr>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>When</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Event</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Product</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Original Txn ID (copy → App Store Connect)</th>
                  </tr>
                </thead>
                <tbody>
                  {appleWebhookFails.failures.map((f) => (
                    <tr key={f.id} className="border-t" style={{ borderColor: theme.border + '60' }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textLight }}>{f.timestamp ? new Date(f.timestamp).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.text }}>
                        {f.notificationType ?? '—'}
                        {f.subtype ? <span className="ml-1 text-[10px]" style={{ color: theme.textLight }}>({f.subtype})</span> : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]" style={{ color: theme.textLight }}>{f.productId || '—'}</td>
                      <td className="px-3 py-2">
                        {f.originalTransactionId ? (
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(f.originalTransactionId)}
                            className="font-mono text-[10px] underline truncate max-w-[260px] block"
                            style={{ color: theme.info }}
                            title={f.originalTransactionId}
                          >
                            {f.originalTransactionId} (copy)
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* Google Play Webhook Failures — tokens we captured but couldn't match */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: theme.border }}>
          <AndroidLogo size={16} style={{ color: theme.primary }} />
          <span className="font-semibold text-sm" style={{ color: theme.text }}>Google Play webhook failures</span>
          <span className="text-xs ml-auto" style={{ color: theme.textLight }}>Unmatched purchase tokens</span>
          <button
            type="button"
            disabled={webhookFailuresLoading}
            onClick={async () => {
              setWebhookFailuresLoading(true);
              try { const d = await getGooglePlayWebhookFailures({ limit: 50 }); setWebhookFailures(d); }
              catch (e) { setWebhookFailures({ error: e.message }); }
              finally { setWebhookFailuresLoading(false); }
            }}
            className="ml-2 px-3 py-1 rounded text-xs font-semibold flex items-center gap-1 disabled:opacity-60"
            style={{ backgroundColor: theme.primary + '15', color: theme.primary }}
          >
            {webhookFailuresLoading ? <CircleNotch size={12} className="animate-spin" /> : <ArrowsClockwise size={12} />}
            Load
          </button>
        </div>
        {!webhookFailures && !webhookFailuresLoading && (
          <p className="px-4 py-6 text-sm text-center" style={{ color: theme.textLight }}>
            Click Load to see Google Play RTDN events that arrived but couldn't be matched to a user. Each row has the purchase token — find the user in Play Console by token, then open their profile and seed it.
          </p>
        )}
        {webhookFailures?.error && (
          <p className="px-4 py-4 text-sm" style={{ color: theme.error }}>{webhookFailures.error}</p>
        )}
        {webhookFailures && !webhookFailures.error && (
          webhookFailures.count === 0 ? (
            <p className="px-4 py-6 text-sm text-center" style={{ color: theme.success }}>✅ No unmatched webhook events.</p>
          ) : (
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0" style={{ backgroundColor: theme.background }}>
                  <tr>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>When</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Event type</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Product</th>
                    <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Purchase token (copy → Play Console)</th>
                  </tr>
                </thead>
                <tbody>
                  {webhookFailures.failures.map((f) => (
                    <tr key={f.id} className="border-t" style={{ borderColor: theme.border + '60' }}>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textLight }}>{f.timestamp ? new Date(f.timestamp).toLocaleString() : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.text }}>{f.notificationType ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-[10px]" style={{ color: theme.textLight }}>{f.subscriptionId || '—'}</td>
                      <td className="px-3 py-2">
                        {f.purchaseToken ? (
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(f.purchaseToken)}
                            className="font-mono text-[10px] underline truncate max-w-[200px] block"
                            style={{ color: theme.info }}
                            title={f.purchaseToken}
                          >
                            {f.purchaseToken.slice(0, 24)}… (copy)
                          </button>
                        ) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
