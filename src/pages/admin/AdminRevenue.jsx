import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { CurrencyDollar, Users, TrendUp, TrendDown, ArrowsClockwise, CreditCard, DeviceMobile, AppleLogo, Warning } from '@phosphor-icons/react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { adminCacheGet, adminCacheSet } from '../../utils/adminSessionCache';

const REVENUE_CACHE_KEY = 'admin:revenue';
const APPLE_CACHE_KEY = 'admin:apple-revenue';
const REVENUE_CACHE_TTL = 15 * 60 * 1000;

export default function AdminRevenue() {
  const { theme } = useOutletContext();
  const [metrics, setMetrics] = useState(() => adminCacheGet(REVENUE_CACHE_KEY));
  const [loading, setLoading] = useState(() => !adminCacheGet(REVENUE_CACHE_KEY));
  const [error, setError] = useState(null);
  const [appleData, setAppleData] = useState(() => adminCacheGet(APPLE_CACHE_KEY));
  const [appleLoading, setAppleLoading] = useState(() => !adminCacheGet(APPLE_CACHE_KEY));
  const [appleError, setAppleError] = useState(null);

  const fetchMetrics = async (force = false) => {
    if (!force) {
      const cached = adminCacheGet(REVENUE_CACHE_KEY);
      if (cached) { setMetrics(cached); setLoading(false); return; }
    }
    setLoading(true);
    setError(null);
    try {
      const getRevenue = httpsCallable(functions, 'getRevenueMetrics');
      const result = await getRevenue();
      setMetrics(result.data);
      adminCacheSet(REVENUE_CACHE_KEY, result.data, REVENUE_CACHE_TTL);
    } catch (err) {
      const msg = err?.message || err?.details?.message || (typeof err === 'string' ? err : 'Failed to load revenue data');
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppleRevenue = async (force = false) => {
    if (!force) {
      const cached = adminCacheGet(APPLE_CACHE_KEY);
      if (cached) { setAppleData(cached); setAppleLoading(false); return; }
    }
    setAppleLoading(true);
    setAppleError(null);
    try {
      const fn = httpsCallable(functions, 'getAppleRevenueReport');
      const result = await fn();
      setAppleData(result.data);
      adminCacheSet(APPLE_CACHE_KEY, result.data, REVENUE_CACHE_TTL);
    } catch (err) {
      setAppleError(err?.message || 'Failed to load Apple revenue');
    } finally {
      setAppleLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics(false);
    fetchAppleRevenue(false);
  }, []);

  const cardStyle = {
    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
    border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
    borderRadius: '16px',
    padding: '20px',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <ArrowsClockwise className="animate-spin" size={24} style={{ color: theme.primary }} />
        <span className="ml-3 text-sm" style={{ color: theme.textLight }}>Loading revenue data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm" style={{ color: 'red' }}>{error}</p>
        <button onClick={() => fetchMetrics(true)} className="mt-4 px-4 py-2 rounded-lg text-sm" style={{ backgroundColor: theme.primary, color: '#fff' }}>
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  const mrr = Number(metrics.mrr) || 0;
  const totalActive = Number(metrics.totalActive) ?? 0;
  const conversionRate = Number(metrics.conversionRate) ?? 0;
  const churnRate = Number(metrics.churnRate) ?? 0;
  const pb = metrics.providerBreakdown || {};

  const statCards = [
    { label: 'MRR', value: `$${mrr.toFixed(2)}`, icon: CurrencyDollar, color: '#10B981' },
    { label: 'Active Subscribers', value: totalActive, icon: Users, color: theme.primary },
    { label: 'Conversion Rate', value: `${conversionRate}%`, icon: TrendUp, color: '#3B82F6' },
    { label: 'Churn Rate', value: `${churnRate}%`, icon: TrendDown, color: '#EF4444' },
  ];

  const breakdownCards = [
    { label: 'Monthly', value: Number(metrics.activeMonthly) ?? 0, color: '#8B5CF6' },
    { label: 'Annual', value: Number(metrics.activeAnnual) ?? 0, color: '#F59E0B' },
    { label: 'Lifetime', value: Number(metrics.activeLifetime) ?? 0, color: '#10B981' },
    { label: 'Trialing', value: Number(metrics.trialing) ?? 0, color: '#6366F1' },
    { label: 'Canceled', value: Number(metrics.canceled) ?? 0, color: '#EF4444' },
    { label: 'Expired', value: Number(metrics.expired) ?? 0, color: '#9CA3AF' },
  ];

  const providers = [
    { label: 'Stripe', value: pb.stripe ?? 0, icon: CreditCard },
    { label: 'Google Play', value: pb.googleplay ?? 0, icon: DeviceMobile },
    { label: 'App Store', value: pb.apple ?? 0, icon: AppleLogo },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: theme.text }}>Revenue Dashboard</h2>
        <button
          onClick={() => fetchMetrics(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-80"
          style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: theme.text }}
        >
          <ArrowsClockwise size={14} /> Refresh
        </button>
      </div>

      <p className="text-xs rounded-lg px-3 py-2" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: theme.textLight }}>
        Revenue figures are approximate and may not reflect all transactions across payment platforms (Stripe, Google Play, App Store).
      </p>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} style={cardStyle}>
            <div className="flex items-center gap-2 mb-2">
              <card.icon size={16} style={{ color: card.color }} />
              <span className="text-xs font-medium" style={{ color: theme.textLight }}>{card.label}</span>
            </div>
            <p className="text-2xl font-bold" style={{ color: theme.text }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Subscription Breakdown */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: theme.text }}>Subscription Breakdown</h3>
        <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
          {breakdownCards.map(card => (
            <div key={card.label} style={cardStyle} className="text-center">
              <p className="text-xl font-bold mb-1" style={{ color: card.color }}>{card.value}</p>
              <p className="text-xs" style={{ color: theme.textLight }}>{card.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Provider Breakdown */}
      <div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: theme.text }}>Payment Providers</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {providers.map(p => (
            <div key={p.label} style={cardStyle} className="flex items-center gap-3">
              <p.icon size={20} style={{ color: theme.primary }} />
              <div>
                <p className="text-lg font-bold" style={{ color: theme.text }}>{p.value}</p>
                <p className="text-xs" style={{ color: theme.textLight }}>{p.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Apple App Store Revenue */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AppleLogo size={16} style={{ color: theme.text }} />
            <h3 className="text-sm font-semibold" style={{ color: theme.text }}>App Store Proceeds</h3>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: theme.textLight }}>
              Live via ASC API
            </span>
          </div>
          <button onClick={() => fetchAppleRevenue(true)} className="text-xs" style={{ color: theme.textLight }}>
            <ArrowsClockwise size={13} className={appleLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        {appleLoading && (
          <div className="flex items-center gap-2 py-4" style={{ color: theme.textLight }}>
            <ArrowsClockwise size={14} className="animate-spin" />
            <span className="text-xs">Fetching App Store reports…</span>
          </div>
        )}

        {appleError && (
          <div className="flex items-center gap-2 p-3 rounded-lg text-xs" style={{ backgroundColor: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>
            <Warning size={14} />
            {appleError.includes('not_configured') ? 'Apple ASC API key not configured.' : appleError}
          </div>
        )}

        {!appleLoading && appleData?.ok && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div style={cardStyle}>
              <p className="text-xs mb-1" style={{ color: theme.textLight }}>Proceeds ({appleData.currentReportDate})</p>
              <p className="text-2xl font-bold" style={{ color: '#10B981' }}>${(appleData.currentMonthProceeds || 0).toFixed(2)}</p>
              <p className="text-xs mt-1" style={{ color: theme.textLight }}>After Apple's cut</p>
            </div>
            <div style={cardStyle}>
              <p className="text-xs mb-1" style={{ color: theme.textLight }}>Subscription Units</p>
              <p className="text-2xl font-bold" style={{ color: theme.primary }}>{appleData.currentMonthUnits || 0}</p>
              <p className="text-xs mt-1" style={{ color: theme.textLight }}>New/renewed this month</p>
            </div>
            <div style={cardStyle}>
              <p className="text-xs mb-2" style={{ color: theme.textLight }}>3-Month Trend</p>
              {(appleData.months || []).slice(0, 3).map((m) => (
                <div key={m.reportDate} className="flex justify-between text-xs mb-1">
                  <span style={{ color: theme.textLight }}>{m.reportDate}</span>
                  <span style={{ color: m.ok ? theme.text : theme.textLight }}>{m.ok ? `$${(m.proceeds || 0).toFixed(2)}` : '—'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!appleLoading && appleData?.ok && Object.keys(appleData.byProduct || {}).length > 0 && (
          <div className="mt-3" style={cardStyle}>
            <p className="text-xs font-medium mb-2" style={{ color: theme.textLight }}>By Product</p>
            <div className="space-y-1">
              {Object.entries(appleData.byProduct).map(([id, p]) => (
                <div key={id} className="flex justify-between text-xs">
                  <span style={{ color: theme.text }}>{p.title || id}</span>
                  <span style={{ color: theme.textLight }}>{p.units} units · ${p.proceeds.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <p className="text-xs text-center" style={{ color: theme.textLight, opacity: 0.5 }}>
        Total tracked users: {Number(metrics.totalUsers) ?? 0}
      </p>
    </div>
  );
}
