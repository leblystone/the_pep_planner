import React, { useMemo, useEffect, useState } from 'react'
import { formatMMDDYYYY } from '../../utils/date'
import { renderCost as formatCurrency } from '../../utils/currencyUtils'
import { getCachedTrackingInfo, detectCarrier } from '../../services/tracking'
import { Truck, ShoppingBag, ClipboardList, ChevronDown, Image as ImageIcon, Link as LinkIcon, Home } from 'lucide-react'
import { Storefront, CalendarCheck } from '@phosphor-icons/react'
import ImagePreviewModal from '../common/ImagePreviewModal'
import OwnerChip from '../buddy/OwnerChip'
import { getOrderItemQuantityLabel } from '../../utils/unitConversion'
import { useIsSimpleMode } from '../../hooks/useIsSimpleMode'
import OrderStatusProgress, { getOrderStatusStep } from './OrderStatusProgress'

const getNextStatus = (status) => {
  const s = (status || '').toLowerCase();
  if (s.includes('ship')) {
    return { text: 'Mark as Delivered', icon: <Home className="h-3 w-3" /> };
  }
  if (s.includes('deliver')) {
    return null;
  }
  return { text: 'Mark as Shipped', icon: <Truck className="h-3 w-3" /> };
};

function accentBarColor(statusToShow, theme) {
  const s = (statusToShow || '').toLowerCase()
  if (s.includes('deliver')) return theme.success || '#8ca68c'
  if (s.includes('delay')) return theme.isDark ? '#fca5a5' : '#ef4444'
  if (s.includes('ship') || s.includes('transit')) return theme.isDark ? '#60a5fa' : '#2563eb'
  return theme.primary || '#8ca68c'
}

function categoryLabel(order) {
  const c = (order.category || order.type || 'domestic').toLowerCase()
  if (c === 'international') return 'International'
  if (c === 'groupbuy') return 'Group buy'
  return 'Domestic'
}

export default function OrderList({ orders = [], theme, onEdit, onAdvance, onDelete, vendors = [], freePlan = false }) {
  const simpleMode = useIsSimpleMode();
  const vendorMap = useMemo(() => vendors.reduce((acc, v) => ({ ...acc, [v.id]: v.name }), {}), [vendors]);
  const [liveStatusByOrderId, setLiveStatusByOrderId] = useState({});
  const [previewImage, setPreviewImage] = useState(null);

  useEffect(() => {
    if (!orders?.length) return;
    let cancelled = false;
    const withTracking = orders.filter((o) => o.tracking && String(o.tracking).trim() && !o.manualTracking);
    if (!withTracking.length) return;
    (async () => {
      const next = {};
      for (const o of withTracking) {
        if (cancelled) return;
        try {
          const carrier = detectCarrier(o.tracking);
          const info = await getCachedTrackingInfo(o.tracking, carrier);
          if (!cancelled && info && !info.hasError && info.status) next[o.id] = info.status;
        } catch (_) { /* ignore */ }
      }
      if (!cancelled) setLiveStatusByOrderId((prev) => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [orders?.length, orders?.filter((o) => o.tracking && !o.manualTracking).map((o) => o.id).join(',')]);

  if (!orders.length) {
    return <p className="text-sm" style={{ color: theme?.textLight || '#666' }}>No orders.</p>
  }

  const cardShadow = theme.isDark
    ? '0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
    : '0 2px 16px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.04)'

  return (
    <>
    <div className="space-y-4">
      {orders.map((o) => {
        const isLiveTracking = o.tracking && String(o.tracking).trim() && !o.manualTracking;
        const statusToShow = isLiveTracking && liveStatusByOrderId[o.id] != null
          ? liveStatusByOrderId[o.id]
          : (o.status || 'Order Placed');
        const nextStatusAction = isLiveTracking ? null : getNextStatus(o.status);
        const vendorName = o.vendorId ? vendorMap[o.vendorId] : o.vendor;
        const isDelivered = (statusToShow || '').toLowerCase().includes('deliver');
        const isDelayed = (statusToShow || '').toLowerCase().includes('delay');
        const cardOpacity = freePlan && isDelivered ? 0.45 : 1;
        const step = getOrderStatusStep(statusToShow);
        const accent = accentBarColor(statusToShow, theme);
        const orderNum = o.publicOrderNumber != null ? String(o.publicOrderNumber) : (o.id || '').slice(0, 8)

        return (
          <div
            key={o.id}
            className="group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] hover:shadow-2xl glass-panel-minimal"
            style={{
              fontFamily: 'Poppins, sans-serif',
              border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)'}`,
              boxShadow: cardShadow,
              opacity: cardOpacity,
            }}
            onClick={() => onEdit?.(o)}
          >
            <div
              className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
              style={{ background: `radial-gradient(circle at top right, ${theme.primary}15 0%, transparent 60%)` }}
            />
            <div
              className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl"
              style={{ boxShadow: `inset 0 0 0 2px ${theme.primary}40, 0 0 20px ${theme.primary}20` }}
            />
            <div
              className="pointer-events-none absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl"
              style={{ backgroundColor: accent, opacity: 0.95 }}
            />

            <div className="relative pl-4 pr-4 pt-4 pb-3">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                    style={{
                      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                      color: theme.text,
                      border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)'}`,
                    }}
                  >
                    #{orderNum}
                  </span>
                  {!simpleMode && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                      style={{
                        backgroundColor: `${theme.primary}18`,
                        color: theme.primaryDark || theme.primary,
                        border: `1px solid ${theme.primary}30`,
                      }}
                    >
                      {categoryLabel(o)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-auto" onClick={(e) => e.stopPropagation()}>
                  {isLiveTracking && (
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: theme.textLight }}>
                        <Truck size={12} style={{ color: accent }} />
                        <span className="font-medium tabular-nums" style={{ color: theme.text }}>
                          {isDelivered ? (formatMMDDYYYY(o.deliveryDate) || '—') : 'ETA pending'}
                        </span>
                      </div>
                    </div>
                  )}
                  {nextStatusAction && (
                    <button
                      aria-label={nextStatusAction.text}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-wide transition-all hover:scale-[1.02] active:scale-95"
                      style={{
                        backgroundColor: theme.primary,
                        color: theme.textOnPrimary,
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.15)',
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAdvance?.(o);
                      }}
                    >
                      {nextStatusAction.icon}
                      <span className="hidden sm:inline">{nextStatusAction.text}</span>
                      <span className="sm:hidden">Next</span>
                    </button>
                  )}
                  {!isLiveTracking && (o.status || '').toLowerCase().includes('deliver') && (
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <Truck size={12} style={{ color: accent }} />
                      <span className="font-medium tabular-nums" style={{ color: theme.text }}>
                        {formatMMDDYYYY(o.deliveryDate) || '—'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 min-w-0">
                <h3 className="font-bold text-lg leading-tight truncate flex-1 min-w-0" style={{ color: theme.text }}>
                  {formatOrderTitle(o)}
                </h3>
                {!simpleMode && <OwnerChip ownerId={o.ownerId} theme={theme} compact />}
              </div>
              {(o.items || []).length > 1 && (
                <p className="text-[11px] mt-0.5 opacity-70 truncate" style={{ color: theme.textLight }}>
                  +{(o.items || []).length - 1} more in this order
                </p>
              )}

              <OrderStatusProgress step={step} theme={theme} isDelayed={isDelayed} />

              <div className="space-y-3.5 mt-3">
                {o.items && o.items.length > 0 && (
                  <div className="mt-0.5">
                    <div className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-2 opacity-65" style={{ color: theme.text }}>
                      <ShoppingBag size={18} strokeWidth={2.25} style={{ color: accent, flexShrink: 0 }} />
                      Contents
                      <div className="h-px flex-1 opacity-25" style={{ backgroundColor: accent }} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      {o.items.slice(0, 3).map((item, idx) => {
                        const amountUnit = item.mgUnit || 'mg';
                        const amountLabel = item.mg != null && item.mg !== '' ? `${item.mg}${amountUnit}` : '';
                        const containerLabel = getOrderItemQuantityLabel(item, { orderId: o.id });
                        return (
                          <div
                            key={idx}
                            className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5"
                            style={{
                              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                              border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'}`,
                            }}
                          >
                            <div
                              className="h-2 w-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: accent, opacity: 0.8 }}
                            />
                            <span className="flex-1 min-w-0 truncate text-[12px] font-medium" style={{ color: theme.text }}>
                              {item.name}
                            </span>
                            {amountLabel && (
                              <span
                                className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
                                style={{
                                  backgroundColor: `${accent}18`,
                                  color: theme.primaryDark || accent,
                                  border: `1px solid ${accent}25`,
                                }}
                              >
                                {amountLabel}
                              </span>
                            )}
                            <span
                              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                              style={{
                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.07)',
                                color: theme.text,
                              }}
                            >
                              {containerLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {o.items.length > 3 && (
                      <div className="text-[10px] mt-1.5 text-center opacity-45" style={{ color: theme.text }}>
                        +{o.items.length - 3} more — tap to view
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-widest mb-2 flex items-center gap-2 opacity-75" style={{ color: theme.text }}>
                    <ClipboardList size={18} strokeWidth={2.25} style={{ color: accent, flexShrink: 0 }} />
                    Summary
                    <div className="h-px flex-1 opacity-25" style={{ backgroundColor: accent }} />
                  </div>

                  <div
                    className="relative rounded-xl px-3 py-2.5"
                    style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}
                  >
                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[12px] mb-2">
                      <div className="flex items-center gap-2 min-w-0" title="Order date">
                        <CalendarCheck size={16} weight="duotone" color={accent} style={{ flexShrink: 0 }} />
                        <span className="font-medium truncate tabular-nums" style={{ color: theme.text }}>{formatMMDDYYYY(o.date)}</span>
                      </div>
                      {vendorName && (
                        <div className="flex items-center gap-2 min-w-0" title="Vendor">
                          <Storefront size={16} weight="duotone" color={accent} style={{ flexShrink: 0 }} />
                          <span className="font-medium truncate" style={{ color: theme.text }}>{vendorName}</span>
                        </div>
                      )}
                    </div>

                    {!simpleMode && (o.attachments || []).filter((d) => d.type === 'image').length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] mb-2">
                        {(o.attachments || []).filter((d) => d.type === 'image').map((doc) => {
                          const name = doc.title?.trim() || 'Image';
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage(doc);
                              }}
                              className="inline-flex items-center gap-1 font-medium truncate max-w-[180px] opacity-90 hover:opacity-100 text-left"
                              style={{ color: theme.text }}
                            >
                              <ImageIcon size={14} style={{ color: accent, flexShrink: 0 }} />
                              <span className="truncate">{name}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {!simpleMode && (o.attachments || []).filter((d) => d.type === 'link' && d.url).length > 0 && (
                      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px]">
                        {(o.attachments || []).filter((d) => d.type === 'link' && d.url).map((doc) => {
                          const name = doc.title?.trim() || 'Link';
                          return (
                            <a
                              key={doc.id}
                              href={doc.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 font-medium truncate max-w-[180px] hover:underline"
                              style={{ color: theme.primary || '#557755' }}
                            >
                              <LinkIcon size={14} style={{ color: accent, flexShrink: 0 }} />
                              <span className="truncate">{name}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}

                    {!simpleMode && o.notes && (
                      <p
                        className="text-[11px] leading-relaxed italic mt-2 text-center"
                        style={{
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          color: theme.textLight || 'rgba(0,0,0,0.55)',
                        }}
                      >
                        {o.notes}
                      </p>
                    )}

                    {!simpleMode && (
                      <div className="flex flex-col items-center gap-0.5 mt-3 pt-3" style={{ borderTop: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}` }}>
                        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-60" style={{ color: theme.textLight }}>Total</span>
                        <span className="text-xl font-bold tabular-nums" style={{ color: theme.text }}>{formatTotalCost(o)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className="flex justify-center mt-3 pt-2.5"
                style={{ borderTop: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}` }}
              >
                <div className="flex items-center gap-2 opacity-55 group-hover:opacity-95 transition-opacity">
                  <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: theme.text }}>
                    View order
                  </span>
                  <ChevronDown size={16} style={{ color: theme.primary }} strokeWidth={2.5} className="-rotate-90 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            </div>
          </div>
        )})}
    </div>
    <ImagePreviewModal
      image={previewImage}
      open={!!previewImage}
      onClose={() => setPreviewImage(null)}
      theme={theme}
      readonly={true}
    />
    </>
  )
}

const formatOrderTitle = (order) => {
  const items = order.items || [];
  if (items.length === 0) return order.peptide || 'Unknown Order';
  return items[0]?.name || 'Unknown';
};

const formatTotalCost = (order) => {
    const items = order.items || [];
    if (items.length === 0) {
        return formatCurrency(order.cost);
    }
    const itemsTotal = items.reduce((sum, item) => {
        const price = parseFloat(item.price) || 0;
        const quantity = parseInt(item.quantity, 10) || 1;
        return sum + (price * quantity);
    }, 0);
    const shippingCost = parseFloat(order.shippingCost) || 0;
    const total = itemsTotal + shippingCost;
    return formatCurrency(total);
};
