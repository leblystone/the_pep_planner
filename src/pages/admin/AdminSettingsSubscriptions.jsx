import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { ArrowsClockwise, CircleNotch, CreditCard, DeviceMobile, AppleLogo, ListBullets, ClockCounterClockwise } from '@phosphor-icons/react';
import { collection, query, orderBy, limit as fsLimit, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  adminRunSubscriptionReconciliation,
  getAdminSubscriptionReconciliationLog,
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

  useEffect(() => {
    const q = query(collection(db, 'reconciliationRuns'), orderBy('ranAt', 'desc'), fsLimit(20));
    const unsub = onSnapshot(q, (snap) => {
      setRunHistory(snap.docs.map(d => ({ id: d.id, ...d.data(), ranAt: d.data().ranAt?.toDate?.()?.toISOString() })));
    });
    return unsub;
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
    </div>
  );
}
