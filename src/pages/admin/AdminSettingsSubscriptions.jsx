import React, { useState, useEffect, useCallback } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  ArrowsClockwise, CircleNotch, ListBullets, ClockCounterClockwise,
  AndroidLogo, AppleLogo, CreditCard, CheckCircle, WarningCircle, XCircle,
} from '@phosphor-icons/react';
import { collection, query, orderBy, limit as fsLimit, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import {
  adminRunSubscriptionReconciliation,
  getAdminSubscriptionReconciliationLog,
  scanAndFixSubscriptions,
} from '../../services/firebase';
import { adminCacheInvalidate } from '../../utils/adminSessionCache';

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
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (_) { return String(iso); }
}

function StatusBadge({ type, children }) {
  const colors = {
    success: { bg: '#10B98120', fg: '#10B981' },
    warning: { bg: '#F59E0B20', fg: '#F59E0B' },
    error: { bg: '#EF444420', fg: '#EF4444' },
    info: { bg: '#3B82F620', fg: '#3B82F6' },
  };
  const c = colors[type] || colors.info;
  return (
    <span className="px-2 py-0.5 rounded text-[11px] font-semibold" style={{ backgroundColor: c.bg, color: c.fg }}>
      {children}
    </span>
  );
}

function PlatformIcon({ platform, size = 14 }) {
  if (platform === 'android' || platform === 'googleplay') return <AndroidLogo size={size} />;
  if (platform === 'apple') return <AppleLogo size={size} />;
  return <CreditCard size={size} />;
}

export default function AdminSettingsSubscriptions() {
  const { theme } = useOutletContext();
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);
  const [reportMeta, setReportMeta] = useState(null);
  const [error, setError] = useState(null);

  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logFilterRunId, setLogFilterRunId] = useState(null);
  const [runHistory, setRunHistory] = useState([]);

  // Quick reconciliation (single platform)
  const [quickRunning, setQuickRunning] = useState(null);
  const [quickResult, setQuickResult] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'reconciliationRuns'), orderBy('ranAt', 'desc'), fsLimit(20));
    const unsub = onSnapshot(q, (snap) => {
      setRunHistory(snap.docs.map(d => ({ id: d.id, ...d.data(), ranAt: d.data().ranAt?.toDate?.()?.toISOString() })));
    });
    return unsub;
  }, []);

  // Load cached repair report on mount
  useEffect(() => {
    async function loadCached() {
      try {
        const snap = await getDoc(doc(db, 'subscriptionScans', 'latest_repair'));
        if (snap.exists()) {
          const d = snap.data();
          setReport(d.report);
          setReportMeta({ scannedAt: d.scannedAt?.toDate?.()?.toISOString(), scannedBy: d.scannedBy });
        }
      } catch (_) {}
    }
    loadCached();
  }, []);

  const loadLogs = useCallback(async (runId) => {
    setLogsLoading(true);
    try {
      const data = await getAdminSubscriptionReconciliationLog({ limit: 80, runId: runId || undefined });
      setLogs(data.logs || []);
    } catch (e) { console.warn('Could not load reconciliation log', e); }
    finally { setLogsLoading(false); }
  }, []);

  useEffect(() => { loadLogs(logFilterRunId); }, [loadLogs, logFilterRunId]);

  const runScanAndFix = async () => {
    setRunning(true);
    setError(null);
    try {
      const data = await scanAndFixSubscriptions();
      setReport(data.report);
      setReportMeta({ scannedAt: new Date().toISOString(), scannedBy: data.scannedBy });
      // Invalidate cached user list so admin Users tab picks up synced subscription data
      adminCacheInvalidate('admin:users');
      adminCacheInvalidate('admin:analytics');
      adminCacheInvalidate('admin:subscriptions');
      await loadLogs();
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: {
          message: `Scan complete — ${data.report.android.autoRepaired + data.report.apple.autoRepaired} auto-repaired`,
          type: 'success',
        },
      }));
    } catch (e) {
      setError(e.message || 'Scan failed');
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: e.message || 'Scan failed', type: 'error' },
      }));
    } finally { setRunning(false); }
  };

  const runQuick = async (platform) => {
    setQuickRunning(platform);
    setQuickResult(null);
    try {
      const data = await adminRunSubscriptionReconciliation({ platform });
      setQuickResult(data);
      if (data.runId) setLogFilterRunId(data.runId);
      await loadLogs(data.runId);
    } catch (e) { setQuickResult({ error: e.message }); }
    finally { setQuickRunning(null); }
  };

  const totalRepaired = report ? (report.android.autoRepaired + report.apple.autoRepaired) : 0;
  const totalStillOrphaned = report ? (report.android.stillOrphaned + report.apple.stillOrphaned) : 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Hero: Scan & Fix */}
      <div className="rounded-xl border p-6" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ color: theme.primaryDark }}>
              Subscription Health
            </h1>
            <p className="text-sm mt-1" style={{ color: theme.textLight }}>
              One scan finds orphaned users on every platform, auto-seeds missing tokens from webhook history,
              re-syncs from each store, and reconciles all active subscriptions. No manual steps needed.
            </p>
            {reportMeta?.scannedAt && (
              <p className="text-xs mt-2" style={{ color: theme.textLight }}>
                Last ran {formatWhen(reportMeta.scannedAt)} by {reportMeta.scannedBy || 'admin'}
              </p>
            )}
          </div>
          <button
            type="button"
            disabled={running}
            onClick={runScanAndFix}
            className="shrink-0 py-3 px-6 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-60"
            style={{ backgroundColor: theme.primary, color: '#fff' }}
          >
            {running ? (
              <>
                <CircleNotch size={18} className="animate-spin" />
                Scanning & fixing…
              </>
            ) : (
              <>
                <ArrowsClockwise size={18} />
                {report ? 'Re-scan & fix all' : 'Scan & fix all platforms'}
              </>
            )}
          </button>
        </div>

        {error && (
          <p className="text-sm rounded-lg p-3 mt-4" style={{ backgroundColor: theme.error + '15', color: theme.error }}>
            {error}
          </p>
        )}
      </div>

      {/* Credential diagnostics */}
      {report?.diagnostics && (
        <div className="flex flex-wrap gap-2 text-[10px]">
          {Object.entries(report.diagnostics).map(([key, ok]) => (
            <span key={key} className="px-2 py-1 rounded" style={{
              backgroundColor: ok ? '#10B98115' : '#EF444415',
              color: ok ? '#10B981' : '#EF4444',
              fontWeight: 600,
            }}>
              {key}: {ok ? '✓' : '✗ MISSING'}
            </span>
          ))}
        </div>
      )}

      {/* Report cards — ALL platforms */}
      {report && (
        <>
          {/* Reconciliation: Stripe + Google Play + Apple */}
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
            <div className="px-4 py-3 border-b" style={{ borderColor: theme.border }}>
              <span className="font-semibold text-sm" style={{ color: theme.text }}>Platform sync results</span>
              <span className="text-xs ml-2" style={{ color: theme.textLight }}>All active subscribers re-checked against each store</span>
            </div>
            <div className="grid sm:grid-cols-3 divide-x" style={{ borderColor: theme.border + '40' }}>
              {/* Stripe */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <CreditCard size={18} style={{ color: '#635BFF' }} />
                  <span className="font-semibold text-sm" style={{ color: theme.text }}>Stripe (Web)</span>
                </div>
                {report.reconciliation?.stripe ? (
                  <div className="space-y-1 text-xs" style={{ color: theme.textLight }}>
                    <div className="flex justify-between"><span>Scanned</span><span style={{ color: theme.text, fontWeight: 600 }}>{report.reconciliation.stripe.usersScanned ?? '—'}</span></div>
                    <div className="flex justify-between"><span>Synced</span><span style={{ color: '#10B981', fontWeight: 600 }}>{report.reconciliation.stripe.synced ?? 0}</span></div>
                    <div className="flex justify-between"><span>Drift corrected</span><span style={{ color: report.reconciliation.stripe.driftDetected > 0 ? '#F59E0B' : theme.textLight, fontWeight: 600 }}>{report.reconciliation.stripe.driftDetected ?? 0}</span></div>
                    <div className="flex justify-between"><span>Skipped (no change)</span><span>{report.reconciliation.stripe.skipped ?? 0}</span></div>
                    {(report.reconciliation.stripe.failed ?? 0) > 0 && (
                      <div className="flex justify-between"><span>Failed</span><span style={{ color: '#EF4444', fontWeight: 600 }}>{report.reconciliation.stripe.failed}</span></div>
                    )}
                  </div>
                ) : report.reconciliation?.stripe?.error ? (
                  <p className="text-xs" style={{ color: theme.error }}>{report.reconciliation.stripe.error}</p>
                ) : (
                  <p className="text-xs" style={{ color: theme.textLight }}>—</p>
                )}
              </div>
              {/* Google Play */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AndroidLogo size={18} style={{ color: '#3DDC84' }} />
                  <span className="font-semibold text-sm" style={{ color: theme.text }}>Google Play</span>
                </div>
                {report.reconciliation?.googleplay && !report.reconciliation.googleplay.error ? (
                  <div className="space-y-1 text-xs" style={{ color: theme.textLight }}>
                    <div className="flex justify-between"><span>Scanned</span><span style={{ color: theme.text, fontWeight: 600 }}>{report.reconciliation.googleplay.usersScanned ?? '—'}</span></div>
                    <div className="flex justify-between"><span>Synced</span><span style={{ color: '#10B981', fontWeight: 600 }}>{report.reconciliation.googleplay.synced ?? 0}</span></div>
                    <div className="flex justify-between"><span>Skipped (no change)</span><span>{report.reconciliation.googleplay.skipped ?? 0}</span></div>
                    {(report.reconciliation.googleplay.failed ?? 0) > 0 && (
                      <div className="flex justify-between"><span>Failed</span><span style={{ color: '#EF4444', fontWeight: 600 }}>{report.reconciliation.googleplay.failed}</span></div>
                    )}
                    {report.reconciliation.googleplay.firstError && (
                      <p className="mt-1 text-[10px] break-all" style={{ color: '#EF4444' }}>
                        {report.reconciliation.googleplay.firstError}
                      </p>
                    )}
                  </div>
                ) : report.reconciliation?.googleplay?.error ? (
                  <p className="text-xs" style={{ color: theme.error }}>{report.reconciliation.googleplay.error}</p>
                ) : (
                  <p className="text-xs" style={{ color: theme.textLight }}>—</p>
                )}
              </div>
              {/* Apple */}
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AppleLogo size={18} />
                  <span className="font-semibold text-sm" style={{ color: theme.text }}>Apple (iOS)</span>
                </div>
                {report.reconciliation?.apple && !report.reconciliation.apple.error ? (
                  <div className="space-y-1 text-xs" style={{ color: theme.textLight }}>
                    <div className="flex justify-between"><span>Scanned</span><span style={{ color: theme.text, fontWeight: 600 }}>{report.reconciliation.apple.usersScanned ?? '—'}</span></div>
                    <div className="flex justify-between"><span>Synced</span><span style={{ color: '#10B981', fontWeight: 600 }}>{report.reconciliation.apple.synced ?? 0}</span></div>
                    <div className="flex justify-between"><span>Normalized</span><span>{report.reconciliation.apple.normalizedOnly ?? 0}</span></div>
                    <div className="flex justify-between"><span>Skipped (no change)</span><span>{report.reconciliation.apple.skipped ?? 0}</span></div>
                    {(report.reconciliation.apple.failed ?? 0) > 0 && (
                      <div className="flex justify-between"><span>Failed</span><span style={{ color: '#EF4444', fontWeight: 600 }}>{report.reconciliation.apple.failed}</span></div>
                    )}
                  </div>
                ) : report.reconciliation?.apple?.error ? (
                  <p className="text-xs" style={{ color: theme.error }}>{report.reconciliation.apple.error}</p>
                ) : (
                  <p className="text-xs" style={{ color: theme.textLight }}>—</p>
                )}
              </div>
            </div>
          </div>

          {/* Per-user sync details by platform */}
          {(() => {
            const allDetails = [
              ...(report.reconciliation?.stripe?.details || []).map(d => ({ ...d, platform: 'stripe' })),
              ...(report.reconciliation?.googleplay?.details || []).map(d => ({ ...d, platform: 'googleplay' })),
              ...(report.reconciliation?.apple?.details || []).map(d => ({ ...d, platform: 'apple' })),
            ];
            if (allDetails.length === 0) return null;
            const syncedRows = allDetails.filter(d => d.outcome === 'synced');
            const failedRows = allDetails.filter(d => d.outcome === 'failed');
            return (
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
                <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: theme.border }}>
                  <CheckCircle size={16} style={{ color: theme.primary }} />
                  <span className="font-semibold text-sm" style={{ color: theme.text }}>
                    Sync details
                  </span>
                  <span className="text-xs ml-2" style={{ color: theme.textLight }}>
                    {syncedRows.length} synced · {failedRows.length} failed
                  </span>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0" style={{ backgroundColor: theme.background }}>
                      <tr>
                        <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Platform</th>
                        <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>User</th>
                        <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Result</th>
                        <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allDetails.map((d, i) => (
                        <tr key={i} className="border-t" style={{ borderColor: theme.border + '60' }}>
                          <td className="px-3 py-2">
                            <PlatformIcon platform={d.platform} />
                          </td>
                          <td className="px-3 py-2" style={{ color: theme.text }}>
                            {d.email || d.userId?.slice(0, 10) + '…'}
                            {d.userId && (
                              <Link to={`/admin/users?uid=${d.userId}`} className="ml-2 text-[10px] underline" style={{ color: theme.info }}>
                                Open
                              </Link>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {d.outcome === 'synced' ? (
                              <StatusBadge type="success">✓ Synced</StatusBadge>
                            ) : (
                              <StatusBadge type="error">✗ Failed</StatusBadge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-[10px]" style={{ color: theme.textLight }}>
                            {d.outcome === 'synced' && d.status && <span>Status: <strong style={{ color: theme.text }}>{d.status}</strong></span>}
                            {d.outcome === 'synced' && d.cancelAtPeriodEnd != null && (
                              <span className="ml-2">{d.cancelAtPeriodEnd ? '(not renewing)' : '(renewing)'}</span>
                            )}
                            {d.outcome === 'failed' && (
                              <span style={{ color: '#EF4444' }}>{d.error || d.reason || 'unknown'}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Orphan repair summary */}
          <div className="grid gap-3 sm:grid-cols-3">
            {/* Android orphan repair */}
            <div className="rounded-xl border p-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
              <div className="flex items-center gap-2 mb-2">
                <AndroidLogo size={16} style={{ color: '#3DDC84' }} />
                <span className="font-semibold text-xs" style={{ color: theme.text }}>Android orphan repair</span>
              </div>
              <div className="space-y-1 text-xs" style={{ color: theme.textLight }}>
                <div className="flex justify-between"><span>Missing tokens</span><span style={{ color: theme.text, fontWeight: 600 }}>{report.android.orphansFound}</span></div>
                <div className="flex justify-between"><span>Auto-fixed</span><span style={{ color: report.android.autoRepaired > 0 ? '#10B981' : theme.textLight, fontWeight: 600 }}>{report.android.autoRepaired}</span></div>
                {report.android.stillOrphaned > 0 && (
                  <div className="flex justify-between"><span>Need manual token</span><span style={{ color: '#F59E0B', fontWeight: 600 }}>{report.android.stillOrphaned}</span></div>
                )}
                {report.android.orphansFound === 0 && <p style={{ color: '#10B981' }}>All Android users have tokens</p>}
              </div>
            </div>
            {/* Apple orphan repair */}
            <div className="rounded-xl border p-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
              <div className="flex items-center gap-2 mb-2">
                <AppleLogo size={16} />
                <span className="font-semibold text-xs" style={{ color: theme.text }}>iOS orphan repair</span>
              </div>
              <div className="space-y-1 text-xs" style={{ color: theme.textLight }}>
                <div className="flex justify-between"><span>Missing txn IDs</span><span style={{ color: theme.text, fontWeight: 600 }}>{report.apple.orphansFound}</span></div>
                <div className="flex justify-between"><span>Auto-fixed</span><span style={{ color: report.apple.autoRepaired > 0 ? '#10B981' : theme.textLight, fontWeight: 600 }}>{report.apple.autoRepaired}</span></div>
                {report.apple.stillOrphaned > 0 && (
                  <div className="flex justify-between"><span>Need manual txn ID</span><span style={{ color: '#F59E0B', fontWeight: 600 }}>{report.apple.stillOrphaned}</span></div>
                )}
                {report.apple.note && <p className="mt-1 text-[10px]" style={{ color: theme.textLight }}>{report.apple.note}</p>}
                {report.apple.orphansFound === 0 && <p style={{ color: '#10B981' }}>All iOS users have txn IDs</p>}
              </div>
            </div>
            {/* Overall summary */}
            <div className="rounded-xl border p-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
              <div className="flex items-center gap-2 mb-2">
                {totalStillOrphaned > 0 ? <WarningCircle size={16} weight="fill" style={{ color: '#F59E0B' }} />
                  : <CheckCircle size={16} weight="fill" style={{ color: '#10B981' }} />}
                <span className="font-semibold text-xs" style={{ color: theme.text }}>Overall</span>
              </div>
              <div className="space-y-1 text-xs" style={{ color: theme.textLight }}>
                <div className="flex justify-between"><span>Orphans auto-fixed</span><span style={{ color: '#10B981', fontWeight: 700 }}>{totalRepaired}</span></div>
                {totalStillOrphaned > 0 && (
                  <div className="flex justify-between"><span>Still need manual fix</span><span style={{ color: '#F59E0B', fontWeight: 700 }}>{totalStillOrphaned}</span></div>
                )}
                {totalStillOrphaned === 0 && totalRepaired === 0 && (
                  <p style={{ color: '#10B981' }}>All subscriptions healthy across all platforms</p>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Detail rows for orphans that were repaired or still need help */}
      {report && (report.android.details?.length > 0 || report.apple.details?.length > 0) && (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
          <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: theme.border }}>
            <ListBullets size={16} style={{ color: theme.primary }} />
            <span className="font-semibold text-sm" style={{ color: theme.text }}>Repair details</span>
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0" style={{ backgroundColor: theme.background }}>
                <tr>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Platform</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>User</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Result</th>
                  <th className="px-3 py-2 font-semibold" style={{ color: theme.textLight }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...(report.android.details || []).map(d => ({ ...d, platform: 'android' })),
                  ...(report.apple.details || []).map(d => ({ ...d, platform: 'apple' })),
                ].map((d, i) => (
                  <tr key={i} className="border-t" style={{ borderColor: theme.border + '60' }}>
                    <td className="px-3 py-2">
                      <PlatformIcon platform={d.platform} />
                    </td>
                    <td className="px-3 py-2" style={{ color: theme.text }}>
                      {d.email || d.userId?.slice(0, 10) + '…'}
                      {d.userId && (
                        <Link to={`/admin/users?uid=${d.userId}`} className="ml-2 text-[10px] underline" style={{ color: theme.info }}>
                          Open
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {d.action === 'token_seeded' || d.action === 'synced_from_api' ? (
                        <StatusBadge type="success">Auto-fixed</StatusBadge>
                      ) : d.action === 'no_token_found' || d.action === 'no_txn_id' ? (
                        <StatusBadge type="warning">Needs manual</StatusBadge>
                      ) : d.action === 'sync_failed' ? (
                        <StatusBadge type="error">Sync failed</StatusBadge>
                      ) : (
                        <StatusBadge type="info">{d.action}</StatusBadge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-[10px]" style={{ color: theme.textLight }}>
                      {d.action === 'no_token_found' && d.platform === 'android' && (
                        <span>
                          Search email in{' '}
                          <a href="https://play.google.com/console/u/3/developers/7022708951209831975/app-list" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: theme.info }}>
                            Play Console
                          </a>
                          {' '}→ Orders → copy token → open user profile → seed it
                        </span>
                      )}
                      {(d.action === 'no_txn_id' || d.action === 'no_apple_subscription') && d.platform === 'apple' && (
                        <span>
                          Search email in{' '}
                          <a href="https://appstoreconnect.apple.com" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: theme.info }}>
                            App Store Connect
                          </a>
                          {' '}→ Subscriptions → copy txn ID → open user profile → seed it
                        </span>
                      )}
                      {d.error && <span style={{ color: theme.error }}>{d.error}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Quick reconciliation buttons */}
      <div className="rounded-xl border p-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
        <div className="flex items-center gap-2 mb-3">
          <ArrowsClockwise size={16} style={{ color: theme.primary }} />
          <span className="font-semibold text-sm" style={{ color: theme.text }}>Quick sync (single platform)</span>
          <span className="text-xs ml-auto" style={{ color: theme.textLight }}>
            For users that already have tokens — no repair, just re-sync from store.
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'stripe', label: 'Stripe', icon: CreditCard },
            { id: 'googleplay', label: 'Google Play', icon: AndroidLogo },
            { id: 'apple', label: 'Apple', icon: AppleLogo },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              disabled={!!quickRunning}
              onClick={() => runQuick(id)}
              className="py-2 px-4 rounded-lg text-xs font-semibold flex items-center gap-2 disabled:opacity-60"
              style={{ backgroundColor: theme.background, color: theme.text, border: `1px solid ${theme.border}` }}
            >
              {quickRunning === id ? <CircleNotch size={14} className="animate-spin" /> : <Icon size={14} />}
              {label}
            </button>
          ))}
        </div>
        {quickResult?.error && (
          <p className="text-xs mt-2" style={{ color: theme.error }}>{quickResult.error}</p>
        )}
        {quickResult?.summary && (
          <pre className="text-[10px] mt-2 p-2 rounded overflow-auto max-h-28" style={{ backgroundColor: theme.background, color: theme.textLight }}>
            {JSON.stringify(quickResult.summary, null, 2)}
          </pre>
        )}
      </div>

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

      {/* Reconciliation Log */}
      <div className="rounded-xl border overflow-hidden" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b" style={{ borderColor: theme.border }}>
          <div className="flex items-center gap-2">
            <ListBullets size={18} style={{ color: theme.primary }} />
            <span className="font-semibold text-sm" style={{ color: theme.text }}>Change log</span>
          </div>
          <div className="flex items-center gap-2">
            {logFilterRunId && (
              <button type="button" className="text-[10px] px-2 py-1 rounded"
                style={{ backgroundColor: theme.warning + '20', color: theme.warning }}
                onClick={() => setLogFilterRunId(null)}>Clear run filter</button>
            )}
            <button type="button" className="text-xs underline" style={{ color: theme.textLight }}
              onClick={() => loadLogs(logFilterRunId)}>Refresh</button>
          </div>
        </div>
        {logsLoading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm" style={{ color: theme.textLight }}>
            <CircleNotch size={18} className="animate-spin" /> Loading…
          </div>
        ) : logs.length === 0 ? (
          <p className="px-4 py-8 text-sm text-center" style={{ color: theme.textLight }}>
            No changes logged yet. Run a scan — only users that needed updates appear here.
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
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: theme.textLight }}>{formatWhen(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div style={{ color: theme.text }}>{row.userEmail || row.userId?.slice(0, 8)}</div>
                      {row.userEmail && (
                        <Link to={`/admin/users?uid=${row.userId}`} className="text-[10px] underline" style={{ color: theme.info }}>
                          Open user
                        </Link>
                      )}
                    </td>
                    <td className="px-3 py-2 capitalize" style={{ color: theme.text }}>{row.platform}</td>
                    <td className="px-3 py-2">
                      <span className="px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: row.changeType === 'missing_restored' ? theme.warning + '25' : theme.success + '20',
                          color: row.changeType === 'missing_restored' ? theme.warning : theme.success,
                        }}>
                        {CHANGE_LABELS[row.changeType] || row.changeType}
                      </span>
                    </td>
                    <td className="px-3 py-2" style={{ color: theme.textLight }}>
                      <span>{row.before?.status || '—'} / {row.before?.cancelAtPeriodEnd ? 'not renewing' : 'renewing'}</span>
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
