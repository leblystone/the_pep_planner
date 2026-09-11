import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useOutletContext } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, getDoc, doc, updateDoc, serverTimestamp, arrayUnion, Timestamp } from 'firebase/firestore';
import { db, functions, auth } from '../../config/firebase';
import { adminCacheGet, adminCacheSet, adminCacheInvalidate } from '../../utils/adminSessionCache';

const ORDERS_CACHE_KEY = 'admin:shopOrders:v2';
const ORDERS_CACHE_TTL = 5 * 60 * 1000; // 5 min
import { httpsCallable } from 'firebase/functions';
import {
  CircleNotch, Package, Printer, Truck, X,
  Plus, Trash, PaperPlaneTilt, Download, MagnifyingGlass, Check, Book, CaretDown,
} from '@phosphor-icons/react';
import { fetchAllShopProducts } from '../../config/plannerProducts';
import ShippingLabelModal from '../../components/admin/ShippingLabelModal';
import AdminShopOrderDetail from '../../components/admin/AdminShopOrderDetail';
import { AdminBottomSheet } from '../../components/admin/adminUi';
import TextInput from '../../components/common/inputs/TextInput';
import { PackageOpen, ListChecks, User, ImageUp, PlusCircle, MapPin } from 'lucide-react';
import {
  fulfillShippingLabelDownload,
  downloadLabelPdf,
} from '../../utils/shippingLabelDownload';
import { formatShopOrderNumberLabel } from '../../utils/orderNumbers';

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Canceled' },
];

const ORDERS_PAGE_SIZE = 25;

function isOrderCancelled(status) {
  const s = (status || '').toLowerCase();
  return s === 'cancelled' || s === 'canceled';
}

function OrderSelectCheckbox({ checked, onClick, theme, className = '' }) {
  const toggle = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.(e);
  };

  return (
    <span
      role="checkbox"
      tabIndex={0}
      aria-checked={checked}
      onMouseDown={(e) => e.preventDefault()}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') toggle(e);
      }}
      className={`w-5 h-5 rounded-sm border-2 relative inline-flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 cursor-pointer ${className}`}
      style={{
        borderColor: checked
          ? (theme.primaryDark || theme.primary)
          : `${theme.primaryLight || theme.primary}60`,
        backgroundColor: checked ? theme.primary : 'transparent',
        borderRadius: 4,
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {checked && (
        <Check
          size={14}
          weight="bold"
          className="absolute text-white order-check-pop pointer-events-none"
          style={{
            strokeWidth: 2.5,
            top: -3,
            right: -3,
          }}
        />
      )}
    </span>
  );
}

function toast(type, message) {
  window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { type, message } }));
}

async function logOrderActivity(orderId, entry) {
  const activity = {
    id: crypto.randomUUID(),
    createdAt: Timestamp.now(),
    ...entry,
  };
  await updateDoc(doc(db, 'physicalOrders', orderId), {
    activityLog: arrayUnion(activity),
    updatedAt: serverTimestamp(),
  });
  return activity;
}

function patchOrderActivityInState(setOrders, setSelectedOrder, orderId, activity) {
  setOrders((prev) =>
    prev.map((o) => (o.id === orderId ? { ...o, activityLog: [...(o.activityLog || []), activity] } : o))
  );
  setSelectedOrder((prev) =>
    (prev?.id === orderId ? { ...prev, activityLog: [...(prev.activityLog || []), activity] } : prev)
  );
}

function coerceDate(ts) {
  if (ts == null || ts === '') return null;
  let d;
  if (typeof ts.toDate === 'function') {
    try { d = ts.toDate(); } catch { return null; }
  } else if (typeof ts === 'object') {
    const seconds = ts.seconds ?? ts._seconds;
    if (typeof seconds === 'number') d = new Date(seconds * 1000);
    else if (typeof ts.toMillis === 'function') d = new Date(ts.toMillis());
    else return null; // e.g. {} left by a bad JSON round-trip
  } else if (typeof ts === 'number') {
    // seconds vs millis
    d = new Date(ts < 1e12 ? ts * 1000 : ts);
  } else {
    d = new Date(ts);
  }
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function formatDate(ts) {
  const d = coerceDate(ts);
  if (!d) return '\u2014';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatDateShort(ts) {
  const d = coerceDate(ts);
  if (!d) return '\u2014';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Resolve marketplace / app channel for order cards. */
function resolveOrderSource(order) {
  const source = String(order?.source || '').toLowerCase().trim();
  const id = String(order?.id || '');

  if (source === 'etsy' || order?.etsyReceiptId || order?.etsyOrderId) {
    return { key: 'etsy', label: 'Etsy', logo: '/etsy-mark.svg' };
  }
  if (source === 'tiktok' || order?.tiktokOrderId) {
    return { key: 'tiktok', label: 'TikTok', logo: '/tiktok-mark.svg' };
  }
  if (source === 'shopify' || order?.shopifyOrderId) {
    return { key: 'shopify', label: 'Shopify', logo: '/shopify-mark.svg' };
  }
  if (source === 'own-site' || id.startsWith('cs_') || source === 'website' || source === 'app') {
    return { key: 'app', label: 'App', logo: '/tpp_logo.png' };
  }
  if (source === 'squarespace' || order?.squarespaceOrderId || order?.squarespaceOrderNumber || order?.isImported) {
    return { key: 'squarespace', label: 'Squarespace', logo: null };
  }

  const MANUAL_LABELS = {
    'in-person': 'Manual',
    manual: 'Manual',
    phone: 'Custom',
    custom: 'Custom',
    wholesale: 'Wholesale',
    etsy: 'Etsy',
    tiktok: 'TikTok',
    other: 'Other',
  };
  if (MANUAL_LABELS[source] || order?.isManual) {
    return { key: source || 'manual', label: MANUAL_LABELS[source] || 'Manual', logo: null };
  }

  return { key: 'other', label: 'Other', logo: null };
}

function OrderSourceBadge({ order, theme }) {
  const src = resolveOrderSource(order);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[11px] font-medium"
      style={{
        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(47,59,58,0.05)',
        color: theme.text,
      }}
      title={`Source: ${src.label}`}
    >
      {src.logo ? (
        <img
          src={src.logo}
          alt=""
          className="w-3.5 h-3.5 object-contain flex-shrink-0"
        />
      ) : null}
      {src.label}
    </span>
  );
}

function orderDisplayId(order) {
  const shopLabel = formatShopOrderNumberLabel(order?.shopOrderNumber);
  if (shopLabel) return shopLabel;
  const num = order.squarespaceOrderNumber || order.squarespaceOrderId;
  if (num) {
    const sq = formatShopOrderNumberLabel(num);
    return sq || `#${String(num).replace(/^#/, '')}`;
  }
  return `#${String(order.id).slice(-8)}`;
}

function fulfillmentDisplay(status) {
  const s = (status || 'pending').toLowerCase();
  if (s === 'pending') return { label: 'Pending', tone: 'pending' };
  if (isOrderCancelled(s)) return { label: 'Canceled', tone: 'cancelled' };
  if (s === 'shipped') return { label: 'Shipped', tone: 'muted' };
  if (s === 'delivered') return { label: 'Fulfilled', tone: 'muted' };
  return { label: 'Fulfilled', tone: 'muted' };
}

function fulfillmentBadgeStyle(tone) {
  if (tone === 'pending') return { backgroundColor: '#fef9e7', color: '#6b5a2a' };
  if (tone === 'cancelled') return { backgroundColor: '#F5E6DF', color: '#8B5A42' };
  return { backgroundColor: '#f3f4f6', color: '#374151' };
}

function resolvePaymentPlatform(order) {
  const raw = String(order?.paymentMethod || '').trim();
  if (raw) {
    const lower = raw.toLowerCase();
    if (lower.includes('stripe')) return 'Stripe';
    if (lower.includes('etsy')) return 'Etsy';
    if (lower.includes('tiktok')) return 'TikTok';
    if (lower.includes('shopify')) return 'Shopify';
    if (lower.includes('square')) return 'Squarespace';
    if (lower.includes('paypal')) return 'PayPal';
    if (lower.includes('cash') || lower.includes('in person') || lower.includes('in-person')) return 'Cash';
    if (lower.includes('card') || lower.includes('visa') || lower.includes('mastercard') || lower.includes('amex')) {
      // Card on own-site is Stripe; elsewhere keep the CSV label
      if (order?.paymentIntentId || order?.source === 'own-site' || String(order?.id || '').startsWith('cs_')) {
        return 'Stripe';
      }
      return raw.length > 24 ? `${raw.slice(0, 22)}…` : raw;
    }
    // Prefer short cleaned label from CSV / manual
    return raw.length > 24 ? `${raw.slice(0, 22)}…` : raw;
  }

  const source = String(order?.source || '').toLowerCase();
  if (order?.paymentIntentId || source === 'own-site' || String(order?.id || '').startsWith('cs_')) return 'Stripe';
  if (source === 'etsy' || order?.etsyReceiptId || order?.etsyOrderId) return 'Etsy';
  if (source === 'tiktok' || order?.tiktokOrderId) return 'TikTok';
  if (source === 'shopify' || order?.shopifyOrderId) return 'Shopify';
  if (source === 'squarespace' || order?.squarespaceOrderId || order?.isImported) return 'Squarespace';
  if (source === 'in-person') return 'Cash';
  if (source === 'phone') return 'Phone';
  if (source === 'wholesale') return 'Wholesale';
  if (order?.isManual || source === 'manual' || source === 'other') return 'Manual';
  return null;
}

function paymentDisplay(order) {
  const fs = (order.financialStatus || 'PAID').toUpperCase();
  const via = resolvePaymentPlatform(order);
  const viaSuffix = via ? ` via ${via}` : '';

  if (fs === 'PAID' || fs === 'PAID_OUTSIDE') return `Paid${viaSuffix}`;
  if (fs === 'REFUNDED') return `Refunded${viaSuffix}`;
  if (fs === 'PENDING') return via ? `Pending · ${via}` : 'Pending';
  const statusLabel = fs.charAt(0) + fs.slice(1).toLowerCase().replace(/_/g, ' ');
  return via ? `${statusLabel} via ${via}` : statusLabel;
}

function itemSummary(order) {
  const items = order.items || [];
  if (!items.length) return '\u2014';
  if (items.length === 1) return items[0].name;
  return `${items[0].name} +${items.length - 1}`;
}

function matchesFilter(order, filterId) {
  const s = (order.status || 'pending').toLowerCase();
  if (filterId === 'all') return true;
  if (filterId === 'pending') return s === 'pending';
  if (filterId === 'fulfilled') return s === 'shipped' || s === 'delivered';
  if (filterId === 'cancelled') return isOrderCancelled(s);
  return true;
}

function orderHasDigital(order, products) {
  if (order.hasDigitalItems) return true;
  if (!products?.length) return false;
  const byPrice = new Map();
  const byId = new Map();
  products.forEach((p) => {
    byId.set(p.id, p);
    if (p.stripePriceId) byPrice.set(p.stripePriceId, p);
  });
  return (order.items || []).some((item) => {
    const p = (item.priceId && byPrice.get(item.priceId)) || (item.productId && byId.get(item.productId));
    return p?.category === 'digital';
  });
}

function productImageUrl(productOrImage) {
  if (!productOrImage) return null;
  if (typeof productOrImage === 'string') return productOrImage || null;
  if (productOrImage.url) return productOrImage.url;
  const img = productOrImage.image ?? productOrImage.images?.[0];
  if (!img) return null;
  if (typeof img === 'string') return img;
  return img?.url || null;
}

function findProductForOrderItem(item, products) {
  if (!item || !products?.length) return null;
  if (item.productId) {
    const byId = products.find((p) => p.id === item.productId);
    if (byId) return byId;
  }
  if (item.priceId) {
    const byPrice = products.find((p) => p.stripePriceId === item.priceId);
    if (byPrice) return byPrice;
  }
  if (item.sku) {
    const bySku = products.find((p) => p.sku === item.sku);
    if (bySku) return bySku;
  }
  return null;
}

function orderItemImageEntries(order, products) {
  const items = order?.items || [];
  if (!items.length) {
    return [{ key: 'empty', name: 'Order', url: null }];
  }
  return items.map((item, i) => {
    const product = findProductForOrderItem(item, products);
    const url =
      productImageUrl(item.image) ||
      productImageUrl(product) ||
      null;
    return {
      key: `${item.productId || item.priceId || item.sku || 'item'}-${i}`,
      name: item.name || product?.name || 'Item',
      url,
    };
  });
}

function OrderProductThumbs({ order, products, toneColor, theme }) {
  const entries = orderItemImageEntries(order, products);
  const maxShow = 4;
  const shown = entries.slice(0, maxShow);
  const extra = entries.length - shown.length;

  return (
    <div className="flex flex-shrink-0 items-center gap-1">
      {shown.map((entry) => (
        <div
          key={entry.key}
          className="w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center border"
          style={{
            backgroundColor: entry.url
              ? (theme.isDark ? 'rgba(255,255,255,0.06)' : '#f8f8f8')
              : `${toneColor}18`,
            borderColor: theme.border,
          }}
          title={entry.name}
        >
          {entry.url ? (
            <img src={entry.url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Book size={18} weight="duotone" style={{ color: toneColor }} />
          )}
        </div>
      ))}
      {extra > 0 && (
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[11px] font-semibold border"
          style={{
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(47,59,58,0.05)',
            borderColor: theme.border,
            color: theme.textLight,
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  );
}

const SOURCES = [
  { value: 'manual', label: 'Manual' },
  { value: 'custom', label: 'Custom' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'etsy', label: 'Etsy' },
  { value: 'tiktok', label: 'TikTok' },
];

const EMPTY_ITEM = { productId: '', name: '', price: '', quantity: 1 };

function ProductThumb({ src, alt, theme, size = 36 }) {
  return (
    <div
      className="flex-shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
      style={{
        width: size,
        height: size,
        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(47,59,58,0.06)',
        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : theme.border}`,
      }}
    >
      {src ? (
        <img src={src} alt={alt || ''} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <Package size={Math.round(size * 0.45)} weight="duotone" style={{ color: theme.primary }} />
      )}
    </div>
  );
}

/** Searchable product picker — select catalog item or type a custom name. */
function ManualOrderProductPicker({
  theme,
  products,
  productId,
  name,
  onSelectProduct,
  onSelectCustom,
  required = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState({});
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const queryRef = useRef('');

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const selectedProduct = products.find((p) => p.id === productId);
  const selectedImage = productImageUrl(selectedProduct);
  const displayValue = open
    ? query
    : (selectedProduct ? selectedProduct.name : (name || ''));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => (p.name || '').toLowerCase().includes(q));
  }, [products, query]);

  const exactMatch = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return products.find((p) => (p.name || '').toLowerCase() === q) || null;
  }, [products, query]);

  const showCustomOption = query.trim() && !exactMatch;

  const calcMenu = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const gap = 6;
    const preferredMax = 320;
    const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const openUp = spaceBelow < Math.min(preferredMax, 180) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(preferredMax, openUp ? spaceAbove : spaceBelow));
    setMenuStyle({
      position: 'fixed',
      left: rect.left,
      width: Math.max(rect.width, 280),
      zIndex: 10050,
      maxHeight,
      ...(openUp
        ? { top: 'auto', bottom: window.innerHeight - rect.top + gap }
        : { top: rect.bottom + gap, bottom: 'auto' }),
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const finishWithQuery = () => {
      const q = queryRef.current.trim();
      if (!q) {
        setOpen(false);
        setQuery('');
        return;
      }
      const match = products.find((p) => (p.name || '').toLowerCase() === q.toLowerCase());
      if (match) onSelectProduct(match);
      else onSelectCustom(q);
      setOpen(false);
      setQuery('');
    };
    const onOutside = (e) => {
      if (wrapRef.current?.contains(e.target)) return;
      if (e.target.closest?.('[data-manual-product-menu]')) return;
      finishWithQuery();
    };
    const onClose = () => finishWithQuery();
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    window.addEventListener('scroll', onClose, { passive: true, capture: true });
    window.addEventListener('resize', onClose, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      window.removeEventListener('scroll', onClose, { capture: true });
      window.removeEventListener('resize', onClose);
    };
  }, [open, products, onSelectProduct, onSelectCustom]);

  const commitCustom = () => {
    const customName = query.trim();
    if (!customName) return;
    onSelectCustom(customName);
    setOpen(false);
    setQuery('');
  };

  const fieldShadow = open
    ? (theme.isDark
      ? '0 0 0 2px rgba(255,255,255,0.12), 0 4px 12px rgba(0,0,0,0.5)'
      : `0 0 0 2px ${theme.primary}20, 0 4px 12px rgba(0,0,0,0.15)`)
    : (theme.isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.1)');

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="w-full px-3 py-2.5 rounded-xl border text-sm flex items-center gap-2.5 transition-all duration-200 touch-manipulation overflow-hidden"
        style={{
          borderColor: open
            ? (theme.isDark ? 'rgba(255,255,255,0.25)' : theme.primary)
            : (theme.isDark ? 'rgba(255,255,255,0.08)' : theme.border),
          backgroundColor: theme.isDark ? '#1f2937' : '#ffffff',
          color: theme.text,
          boxShadow: fieldShadow,
        }}
      >
        {!open && (selectedProduct || name) ? (
          <ProductThumb
            src={selectedImage}
            alt={selectedProduct?.name || name}
            theme={theme}
            size={32}
          />
        ) : null}
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          required={required && !productId && !name}
          placeholder="Search or type a custom item…"
          className="flex-1 min-w-0 bg-transparent outline-none text-sm font-medium"
          style={{ color: (selectedProduct || name || open) ? (theme.isDark ? theme.text : '#181A18') : theme.textLight }}
          onFocus={() => {
            calcMenu();
            setOpen(true);
            setQuery(selectedProduct?.name || name || '');
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) {
              calcMenu();
              setOpen(true);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (filtered.length === 1) {
                onSelectProduct(filtered[0]);
                setOpen(false);
                setQuery('');
              } else if (showCustomOption) {
                commitCustom();
              }
            } else if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
          }}
        />
        {!open && selectedProduct?.stock != null ? (
          <span className="text-[11px] font-medium shrink-0 tabular-nums" style={{ color: theme.textLight }}>
            {selectedProduct.stock} left
          </span>
        ) : null}
        <button
          type="button"
          tabIndex={-1}
          onClick={() => {
            if (open) {
              setOpen(false);
              setQuery('');
            } else {
              calcMenu();
              setOpen(true);
              setQuery(selectedProduct?.name || name || '');
              inputRef.current?.focus();
            }
          }}
          className="flex-shrink-0 p-0.5"
          aria-label="Toggle product list"
        >
          <CaretDown
            size={18}
            weight="bold"
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            style={{ color: open ? theme.primary : theme.textLight }}
          />
        </button>
      </div>

      {open && createPortal(
        <div
          data-manual-product-menu
          style={{ ...menuStyle, overflow: 'hidden', pointerEvents: 'auto' }}
        >
          <div
            className="py-2 border rounded-xl shadow-xl overflow-x-hidden h-full flex flex-col"
            style={{
              borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : theme.border,
              backgroundColor: theme.cardBackground,
              maxHeight: 'inherit',
              boxShadow: theme.isDark
                ? '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.1)'
                : '0 10px 25px rgba(0, 0, 0, 0.1), 0 0 0 1px rgba(0,0,0,0.05)',
            }}
          >
            <div className="overflow-y-auto overflow-x-hidden min-h-0" style={{ maxHeight: 'inherit' }}>
              {filtered.map((p) => {
                const selected = p.id === productId;
                const img = productImageUrl(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onSelectProduct(p);
                      setOpen(false);
                      setQuery('');
                    }}
                    className="w-full px-3 py-2.5 text-sm text-left flex items-center gap-3 transition-all duration-150 touch-manipulation"
                    style={{
                      backgroundColor: selected
                        ? (theme.isDark ? 'rgba(255,255,255,0.08)' : `${theme.primary}15`)
                        : 'transparent',
                      color: theme.text,
                      borderRadius: '0.5rem',
                      margin: '2px 4px',
                      width: 'calc(100% - 8px)',
                    }}
                    onMouseEnter={(e) => {
                      if (!selected) e.currentTarget.style.backgroundColor = theme.isDark ? '#374151' : '#f3f4f6';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = selected
                        ? (theme.isDark ? 'rgba(255,255,255,0.08)' : `${theme.primary}15`)
                        : 'transparent';
                    }}
                  >
                    <ProductThumb src={img} alt={p.name} theme={theme} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium truncate">{p.name}</span>
                      <span className="block text-[11px] mt-0.5 truncate" style={{ color: theme.textLight }}>
                        {p.stock != null ? `${p.stock} left in stock` : 'Catalog product'}
                        {' · '}
                        $${Number(p.price || 0).toFixed(2)}
                      </span>
                    </span>
                    {selected ? (
                      <Check size={18} weight="bold" className="flex-shrink-0" style={{ color: theme.primary }} />
                    ) : null}
                  </button>
                );
              })}

              {showCustomOption && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={commitCustom}
                  className="w-full px-3 py-3 text-sm text-left font-semibold flex items-center gap-3 border-t"
                  style={{
                    borderColor: theme.border,
                    color: theme.primary,
                    backgroundColor: `${theme.primary}10`,
                  }}
                >
                  <ProductThumb src={null} alt="" theme={theme} size={40} />
                  <span className="min-w-0">
                    <span className="block">Use as custom item</span>
                    <span className="block text-[11px] font-medium mt-0.5 opacity-80 truncate">
                      “{query.trim()}”
                    </span>
                  </span>
                </button>
              )}

              {!filtered.length && !showCustomOption && (
                <div className="px-4 py-3 text-sm text-center" style={{ color: theme.textLight }}>
                  No products found
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

function ManualOrderModal({ open, theme, onClose, onCreated }) {
  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [items, setItems] = useState([{ ...EMPTY_ITEM }]);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [source, setSource] = useState('manual');
  const [notes, setNotes] = useState('');
  const [sendConfirmation, setSendConfirmation] = useState(false);
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', state: '', postal_code: '', country: 'US' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAllShopProducts()
      .then(setProducts)
      .catch(() => {})
      .finally(() => setLoadingProducts(false));
  }, []);

  const setItem = (index, field, value) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      if (field === 'productId') {
        const product = products.find((p) => p.id === value);
        if (product) {
          next[index].name = product.name;
          next[index].price = product.price ?? '';
        }
      }
      return next;
    });
  };

  const selectCatalogProduct = (index, product) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productId: product.id,
        name: product.name,
        price: product.price ?? '',
      };
      return next;
    });
  };

  const selectCustomProduct = (index, customName) => {
    setItems((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        productId: '',
        name: customName,
      };
      return next;
    });
  };

  const addItem = () => setItems((prev) => [...prev, { ...EMPTY_ITEM }]);
  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const total = items.reduce((sum, item) => {
    const price = parseFloat(item.price) || 0;
    const qty = parseInt(item.quantity, 10) || 0;
    return sum + price * qty;
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const invalid = items.some((item) => !item.productId && !String(item.name || '').trim());
    if (invalid) {
      toast('warning', 'Each item needs a product or custom name');
      return;
    }
    setSubmitting(true);
    try {
      const createOrder = httpsCallable(functions, 'createManualOrder');
      const payload = {
        items: items.map((item) => ({
          productId: item.productId || null,
          name: item.name,
          price: parseFloat(item.price) || 0,
          quantity: parseInt(item.quantity, 10) || 1,
        })),
        customerName,
        customerEmail,
        customerPhone,
        shippingName: customerName,
        shippingAddress: address.line1 ? address : null,
        source,
        notes,
        sendConfirmation: sendConfirmation && !!customerEmail,
      };
      const { data } = await createOrder(payload);
      toast('success', `Order created — $${(data.amountTotal / 100).toFixed(2)}`);
      onCreated();
      onClose();
    } catch (err) {
      toast('error', err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldShadow = theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)';
  const fieldBg = theme.isDark ? '#0f172a' : (theme.inputBackground || '#fff');
  const fieldBorder = theme.isDark ? 'rgba(255,255,255,0.08)' : '#f0eee7';
  const inputClass = 'w-full py-3 px-3 rounded-lg text-sm outline-none border-none';
  const inputStyle = {
    backgroundColor: fieldBg,
    color: theme.isDark ? theme.text : '#181A18',
    border: `1px solid ${fieldBorder}`,
    boxShadow: fieldShadow,
  };
  const placedOn = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

  const SectionHeader = ({ icon: Icon, title, subtitle, action }) => (
    <div className="flex items-center gap-4 mb-4">
      <Icon size={32} style={{ color: theme.primary }} />
      <div className="flex flex-col gap-0.5 flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-lg font-black tracking-wide" style={{ color: theme.text }}>{title}</h4>
          {action}
        </div>
        <div className="flex items-center gap-2 ml-1">
          <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }} />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
            {subtitle}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <AdminBottomSheet
      open={open}
      onClose={onClose}
      title="New Manual Order"
      titleSuffix={`placed on ${placedOn}`}
      theme={theme}
      wide
      maxHeight="90vh"
      seamlessContent={false}
      footer={(
        <div className="w-full flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium transition-all"
            style={{ color: theme.textLight }}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="admin-manual-order-form"
            disabled={submitting}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap"
            style={{
              background: submitting
                ? theme.secondary
                : `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark || theme.primary} 100%)`,
              color: theme.textOnPrimary || '#ffffff',
              border: 'none',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
            }}
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <CircleNotch size={14} className="animate-spin" />
                Creating…
              </span>
            ) : (
              `Create Order — $${total.toFixed(2)}`
            )}
          </button>
        </div>
      )}
    >
      <form id="admin-manual-order-form" onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-4">
          {/* Order Details — source */}
          <div>
            <SectionHeader icon={PackageOpen} title="Order Details" subtitle="Source & Channel" />
            <div
              className="flex flex-wrap rounded-lg p-1 gap-1"
              style={{
                backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}12`,
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              {SOURCES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSource(s.value)}
                  className="flex-1 min-w-[5.5rem] px-3 py-2 text-sm font-medium rounded-md transition-all text-center active:scale-95"
                  style={{
                    backgroundColor: source === s.value ? '#445952' : 'transparent',
                    color: source === s.value ? '#fff' : theme.textLight,
                    boxShadow: source === s.value
                      ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.08)'
                      : 'none',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="pt-2">
            <SectionHeader icon={ListChecks} title="Order Items" subtitle="Products & Quantities" />
            <div className="space-y-3">
              {items.map((item, i) => (
                <div
                  key={i}
                  className="rounded-lg border p-3 space-y-3"
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : theme.cardBackground,
                  }}
                >
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      {loadingProducts ? (
                        <div className={inputClass} style={inputStyle}>Loading products…</div>
                      ) : (
                        <ManualOrderProductPicker
                          theme={theme}
                          products={products}
                          productId={item.productId}
                          name={item.name}
                          required
                          onSelectProduct={(product) => selectCatalogProduct(i, product)}
                          onSelectCustom={(customName) => selectCustomProduct(i, customName)}
                        />
                      )}
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(i)}
                        className="p-2 rounded-md transition-colors"
                        style={{ color: '#C67A5C' }}
                        aria-label="Remove item"
                      >
                        <Trash size={16} weight="bold" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-medium mb-1.5 block" style={{ color: theme.textLight }}>
                        Quantity
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => setItem(i, 'quantity', e.target.value)}
                        required
                        className={inputClass}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium mb-1.5 block" style={{ color: theme.textLight }}>
                        Price
                      </label>
                      <div className="relative">
                        <span
                          className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-sm font-medium"
                          style={{ color: theme.isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)' }}
                        >
                          $
                        </span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.price}
                          onChange={(e) => setItem(i, 'price', e.target.value)}
                          required
                          className={inputClass}
                          style={{ ...inputStyle, paddingLeft: 22 }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={addItem}
              className="mt-3 px-3 py-2 rounded-md text-xs font-semibold flex items-center gap-2 w-full justify-center transition-all"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.secondary,
                color: theme.text,
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)',
              }}
            >
              <PlusCircle size={14} /> Add Another Item
            </button>

            <div className="mt-4 pt-3 border-t flex items-center justify-end gap-2" style={{ borderColor: theme.border }}>
              <span className="text-sm font-medium" style={{ color: theme.text }}>Total Cost:</span>
              <span className="text-lg font-semibold" style={{ color: theme.primaryDark || theme.primary }}>
                ${total.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Customer */}
          <div className="pt-2">
            <SectionHeader icon={User} title="Customer" subtitle="Contact Info" />
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: theme.textLight }}>
                  Full name
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Customer name"
                  required
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: theme.textLight }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    placeholder="Optional"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: theme.textLight }}>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Optional"
                    className={inputClass}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Shipping */}
          <div className="pt-2">
            <SectionHeader icon={MapPin} title="Shipping" subtitle="Delivery Address" />
            <div className="space-y-3">
              <input
                type="text"
                value={address.line1}
                onChange={(e) => setAddress((a) => ({ ...a, line1: e.target.value }))}
                placeholder="Street address"
                className={inputClass}
                style={inputStyle}
              />
              <input
                type="text"
                value={address.line2}
                onChange={(e) => setAddress((a) => ({ ...a, line2: e.target.value }))}
                placeholder="Apt, suite, etc."
                className={inputClass}
                style={inputStyle}
              />
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  value={address.city}
                  onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))}
                  placeholder="City"
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={address.state}
                  onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value }))}
                  placeholder="State"
                  className={inputClass}
                  style={inputStyle}
                />
                <input
                  type="text"
                  value={address.postal_code}
                  onChange={(e) => setAddress((a) => ({ ...a, postal_code: e.target.value }))}
                  placeholder="ZIP"
                  className={inputClass}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>

          <div className="border-t" style={{ borderColor: theme.border }} />

          {/* Notes */}
          <div className="pt-2">
            <SectionHeader icon={ImageUp} title="Extra Details" subtitle="Notes & Confirmation" />
            <div className="space-y-4">
              <TextInput
                label="Notes"
                value={notes}
                onChange={setNotes}
                placeholder="Gift message, special instructions…"
                theme={theme}
                outlined
                multiline
                rows={3}
                customTextColor={theme.isDark ? null : '#181A18'}
                customShadow={fieldShadow}
              />
              {customerEmail ? (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sendConfirmation}
                    onChange={(e) => setSendConfirmation(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm flex items-center gap-1.5" style={{ color: theme.text }}>
                    <PaperPlaneTilt size={14} weight="duotone" style={{ color: theme.primary }} />
                    Email confirmation to {customerEmail}
                  </span>
                </label>
              ) : null}
            </div>
          </div>
        </div>
      </form>
    </AdminBottomSheet>
  );
}

function BulkLabelModal({ open, theme, orders, onClose, onConfirm }) {
  const [carrier, setCarrier] = useState('');
  const carriers = ['Any (cheapest)', 'USPS', 'UPS', 'FedEx'];

  return (
    <AdminBottomSheet
      open={open}
      onClose={onClose}
      title="Buy Labels in Bulk"
      theme={theme}
      footer={(
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors hover:bg-black/5"
            style={{ borderColor: theme.border, color: theme.text }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(carrier)}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{
              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark || theme.primary} 100%)`,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15)',
            }}
          >
            Buy {orders.length} label{orders.length !== 1 ? 's' : ''}
          </button>
        </>
      )}
    >
        <div className="px-4 sm:px-5 space-y-4 pb-2">
          <p className="text-sm" style={{ color: theme.textLight }}>
            Auto-buy the cheapest rate for <strong style={{ color: theme.text }}>{orders.length} pending order{orders.length !== 1 ? 's' : ''}</strong>.
          </p>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: theme.textLight }}>Carrier preference</label>
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="w-full px-3 py-2 rounded border text-sm"
              style={{ borderColor: theme.border, backgroundColor: theme.cardBackground, color: theme.text }}
            >
              {carriers.map((c) => (
                <option key={c} value={c === 'Any (cheapest)' ? '' : c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="rounded-lg p-3 text-xs space-y-0.5" style={{ backgroundColor: `${theme.text}06`, color: theme.textLight }}>
            {orders.slice(0, 8).map((o) => (
              <div key={o.id} className="truncate">
                {o.squarespaceOrderNumber ? `#${o.squarespaceOrderNumber}` : o.id.slice(-8).toUpperCase()} — {o.shippingName || o.customerName || 'Guest'}
              </div>
            ))}
            {orders.length > 8 && <div>…and {orders.length - 8} more</div>}
          </div>
          <p className="text-xs" style={{ color: theme.textLight }}>
            Addresses will be used as-is. Labels are purchased immediately and cannot be undone.
          </p>
        </div>
    </AdminBottomSheet>
  );
}

function OrdersPagination({ theme, page, totalPages, totalCount, pageSize, onPageChange }) {
  if (totalCount <= pageSize) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  const pillShadow = theme.isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.08)';

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 pt-1 text-sm"
      style={{ color: theme.textLight }}
    >
      <span className="text-[11px]">
        Showing {start}–{end} of {totalCount}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all hover:brightness-105 active:scale-[0.97] disabled:opacity-40"
          style={{
            backgroundColor: theme.cardBackground,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            boxShadow: pillShadow,
          }}
        >
          Previous
        </button>
        <span className="text-[11px] tabular-nums px-1">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="px-3.5 py-1.5 rounded-full text-[11px] font-semibold tracking-wide transition-all hover:brightness-105 active:scale-[0.97] disabled:opacity-40"
          style={{
            backgroundColor: theme.cardBackground,
            color: theme.text,
            border: `1px solid ${theme.border}`,
            boxShadow: pillShadow,
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default function AdminShopOrders() {
  const { theme } = useOutletContext();
  // Seed from sessionStorage cache so re-visiting this tab doesn't re-fetch
  const [orders, setOrders] = useState(() => adminCacheGet(ORDERS_CACHE_KEY) ?? []);
  const [loading, setLoading] = useState(() => !adminCacheGet(ORDERS_CACHE_KEY));
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filterTab, setFilterTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [ordersPage, setOrdersPage] = useState(1);
  const [shippingModalOrder, setShippingModalOrder] = useState(null);
  const [showManualOrder, setShowManualOrder] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [shopProducts, setShopProducts] = useState([]);
  const [resendingDownload, setResendingDownload] = useState(null);
  // Bulk selection
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [bulkLabeling, setBulkLabeling] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total, results }
  const [showBulkLabelModal, setShowBulkLabelModal] = useState(false);
  const [orderActionLoading, setOrderActionLoading] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState(null);
  const [savingNoteOrderId, setSavingNoteOrderId] = useState(null);

  useEffect(() => { loadOrders(false); }, []);

  useEffect(() => {
    setOrderActionLoading(false);
  }, [selectedOrder?.id]);

  useEffect(() => {
    fetchAllShopProducts().then(setShopProducts).catch(() => {});
  }, []);

  const handleCsvUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setCsvImporting(true);
    try {
      const csvContent = await file.text();
      const importCsv = httpsCallable(functions, 'importOrdersFromCsv');
      const { data } = await importCsv({
        csvContent,
        overwrite: false,
        includeDigital: false,
        includeSubscriptions: false,
      });
      adminCacheInvalidate(ORDERS_CACHE_KEY); await loadOrders(true);
      const reasons = Object.entries(data.skipReasons || {})
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
        .join(', ');
      toast('success', `CSV import done: ${data.imported} orders imported (${data.totalOrders} in file)${reasons ? ` — skipped: ${reasons}` : ''}`);
    } catch (err) {
      console.error('CSV import error:', err);
      const msg = err.details || err.message || 'CSV import failed';
      toast('error', typeof msg === 'string' ? msg : 'CSV import failed — try deploying importOrdersFromCsv');
    } finally {
      setCsvImporting(false);
    }
  };

  const loadOrders = async (force = false) => {
    if (!force) {
      const cached = adminCacheGet(ORDERS_CACHE_KEY);
      if (cached) { setOrders(cached); setLoading(false); return; }
    }
    try {
      setLoading(true);
      // Limit to most recent 300 orders to avoid unbounded scans.
      // If you need older orders use the search/filter which adds specific where clauses.
      const q = query(collection(db, 'physicalOrders'), orderBy('createdAt', 'desc'), limit(300));
      const snap = await getDocs(q);
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(rows);
      adminCacheSet(ORDERS_CACHE_KEY, rows, ORDERS_CACHE_TTL);
    } catch (err) {
      console.error('Error loading orders:', err);
      toast('error', 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateDoc(doc(db, 'physicalOrders', orderId), { status: newStatus, updatedAt: serverTimestamp() });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o)));
      toast('success', `Order marked as ${newStatus}`);
    } catch (err) {
      toast('error', 'Failed to update status');
    }
  };

  const patchOrderInState = (orderId, patch) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
    setSelectedOrder((prev) => (prev?.id === orderId ? { ...prev, ...patch } : prev));
  };

  const refreshOrderInState = async (orderId) => {
    const snap = await getDoc(doc(db, 'physicalOrders', orderId));
    if (!snap.exists()) return null;
    const fresh = { id: snap.id, ...snap.data() };
    setOrders((prev) => prev.map((o) => (o.id === orderId ? fresh : o)));
    setSelectedOrder((prev) => (prev?.id === orderId ? fresh : prev));
    return fresh;
  };

  const handleLabelPurchased = useCallback(async (orderId, data) => {
    const patch = {
      status: 'shipped',
      trackingNumber: data.trackingNumber,
      labelUrl: data.labelUrl,
      labelCarrier: data.carrier,
      labelCost: data.labelCost ?? null,
      shippingName: data.shippingName,
      shippingAddress: data.shippingAddress,
      ...(data.easypostTrackerId ? {
        easypostTrackerId: data.easypostTrackerId,
        easypostRegisteredAt: Timestamp.now(),
      } : {}),
    };
    patchOrderInState(orderId, patch);
    try {
      const activity = await logOrderActivity(orderId, {
        type: 'label_created',
        title: 'Shipping label purchased (EasyPost)',
        detail: [data.carrier, data.trackingNumber, data.labelCost != null ? `$${Number(data.labelCost).toFixed(2)}` : null]
          .filter(Boolean)
          .join(' · '),
        actor: 'admin',
        actorEmail: auth.currentUser?.email || null,
      });
      patchOrderActivityInState(setOrders, setSelectedOrder, orderId, activity);
    } catch (err) {
      console.warn('Failed to log label activity:', err);
    }
    // Confirmation toast is fired by ShippingLabelModal immediately on purchase success
  }, []);

  const handleEasyPostRegistered = useCallback((orderId, patch) => {
    patchOrderInState(orderId, patch);
    toast('success', patch.easypostTrackerId ? 'EasyPost tracking enabled' : 'EasyPost updated');
  }, []);

  const handleDetailStatusChange = async (orderId, newStatus) => {
    try {
      const patch = { status: newStatus, updatedAt: serverTimestamp() };
      if (newStatus === 'delivered') patch.fulfilledAt = serverTimestamp();
      if (newStatus === 'pending') patch.fulfilledAt = null;
      await updateDoc(doc(db, 'physicalOrders', orderId), patch);
      patchOrderInState(orderId, {
        status: newStatus,
        ...(newStatus === 'pending' ? { fulfilledAt: null } : {}),
      });
      const activity = await logOrderActivity(orderId, {
        type: 'status_changed',
        title: newStatus === 'delivered' ? 'Marked as fulfilled' : 'Marked as unfulfilled',
        detail: null,
        actor: 'admin',
        actorEmail: auth.currentUser?.email || null,
      });
      patchOrderActivityInState(setOrders, setSelectedOrder, orderId, activity);
      toast('success', newStatus === 'delivered' ? 'Order marked as fulfilled' : 'Order marked as unfulfilled');
    } catch (err) {
      toast('error', 'Failed to update status');
    }
  };

  const runOrderAdminAction = async (fnName, orderId) => {
    setOrderActionLoading(true);
    try {
      const fn = httpsCallable(functions, fnName, { timeout: 60000 });
      const { data } = await fn({ orderId });
      return { ok: true, data };
    } catch (err) {
      console.error(`${fnName} failed:`, err);
      const msg = (err.message || 'Action failed').replace(/^FirebaseError:\s*/i, '');
      return { ok: false, message: msg };
    } finally {
      setOrderActionLoading(false);
    }
  };

  const handleCancelOrder = async (order) => {
    const result = await runOrderAdminAction('cancelShopOrder', order.id);
    if (result.ok) {
      await refreshOrderInState(order.id);
      toast('success', result.data?.stripeDetail || 'Order cancelled');
      return;
    }
    if (result.message?.toLowerCase().includes('already cancelled')) {
      await refreshOrderInState(order.id);
      toast('info', 'Order is already cancelled');
      return;
    }
    toast('error', result.message || 'Failed to cancel order');
  };

  const handleRefundOrder = async (order) => {
    if (!order.paymentIntentId) {
      toast('warning', 'This order has no Stripe payment to refund');
      return;
    }
    const result = await runOrderAdminAction('refundShopOrder', order.id);
    if (result.ok) {
      await refreshOrderInState(order.id);
      toast('success', 'Order refunded via Stripe');
      return;
    }
    toast('error', result.message || 'Failed to refund order');
  };

  const handleDeleteOrder = async (order) => {
    setDeletingOrderId(order.id);
    try {
      const fn = httpsCallable(functions, 'deleteShopOrder');
      await fn({ orderId: order.id });
      toast('success', 'Order deleted');
      setSelectedOrder(null);
      setOrders((prev) => prev.filter((o) => o.id !== order.id));
    } catch (err) {
      toast('error', err.message || 'Failed to delete order');
    } finally {
      setDeletingOrderId(null);
    }
  };

  const handleSyncFromStripe = async (order) => {
    setOrderActionLoading(true);
    try {
      const fn = httpsCallable(functions, 'syncShopOrderFromStripe', { timeout: 60000 });
      await fn({ orderId: order.id });
      await refreshOrderInState(order.id);
      toast('success', 'Customer & shipping details synced from Stripe');
    } catch (err) {
      toast('error', err.message || 'Failed to sync from Stripe');
    } finally {
      setOrderActionLoading(false);
    }
  };

  const handleAddOrderNote = async (orderId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSavingNoteOrderId(orderId);
    try {
      const note = {
        id: crypto.randomUUID(),
        text: trimmed,
        createdAt: Timestamp.now(),
        authorEmail: auth.currentUser?.email || 'admin',
      };
      await updateDoc(doc(db, 'physicalOrders', orderId), {
        adminNotes: arrayUnion(note),
        updatedAt: serverTimestamp(),
      });
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, adminNotes: [...(o.adminNotes || []), note] } : o))
      );
      setSelectedOrder((prev) =>
        (prev?.id === orderId ? { ...prev, adminNotes: [...(prev.adminNotes || []), note] } : prev)
      );
      toast('success', 'Note added');
    } catch (err) {
      toast('error', err.message || 'Failed to save note');
    } finally {
      setSavingNoteOrderId(null);
    }
  };

  // ── Bulk selection helpers ────────────────────────────────────────────────
  const toggleCheck = (e, id) => {
    e.stopPropagation();
    setCheckedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearChecked = () => setCheckedIds(new Set());

  // ── Bulk print packing slips ──────────────────────────────────────────────
  const handleBulkPrintSlips = async () => {
    if (!checkedOrders.length) return;
    toast('info', `Generating ${checkedOrders.length} packing slip${checkedOrders.length > 1 ? 's' : ''}…`);
    try {
      const printSlip = httpsCallable(functions, 'printPackingSlip');
      const results = await Promise.all(checkedOrders.map((o) => printSlip({ orderId: o.id })));
      const extractSlip = (html) => {
        const slipMatch = html.match(/<div class="slip">[\s\S]*<\/footer>\s*<\/div>/i);
        if (slipMatch) return slipMatch[0];
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
        return bodyMatch ? bodyMatch[1].replace(/<div class="no-print"[\s\S]*/i, '').trim() : html;
      };
      const slips = results.map((r) => extractSlip(r.data.html)).join('\n');
      const combined = `<!DOCTYPE html><html><head><meta charset="utf-8">
        <title>Packing Slips</title>
        <style>
          @page { size: 4in 6in; margin: 0; }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
          .slip { width: 4in; height: 6in; padding: 0.12in 0.14in 0.1in; display: flex; flex-direction: column; page-break-after: always; }
          .slip:last-child { page-break-after: auto; }
          .logo-wrap { text-align: center; margin-bottom: 4px; }
          .logo { width: 0.78in; height: 0.78in; object-fit: contain; }
          .title-row { display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 4px; }
          .doc-date { font-size: 9px; font-weight: 400; }
          .rule { border: none; border-top: 1px solid #111; margin-bottom: 5px; }
          .cols-3 { display: grid; grid-template-columns: 1fr 1fr 0.85fr; gap: 4px; margin-bottom: 6px; }
          .col-head { font-size: 8px; font-weight: 700; text-transform: uppercase; margin-bottom: 2px; }
          .addr-line { font-size: 8.5px; line-height: 1.35; }
          .addr-line:first-of-type { font-weight: 700; }
          .meta-row { display: flex; justify-content: space-between; font-size: 8px; line-height: 1.35; }
          .meta-val { font-weight: 700; text-align: right; }
          .items-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
          .items-table th { font-size: 8px; text-transform: uppercase; border-bottom: 1px solid #111; text-align: left; }
          .items-table th:last-child { text-align: right; width: 26px; }
          .items-table td { font-size: 9px; padding: 4px 0; border-bottom: 1px dotted #bbb; vertical-align: top; }
          .item-title { font-weight: 700; font-size: 9px; }
          .item-sub { font-size: 7.5px; color: #555; }
          .item-qty { text-align: right; font-weight: 700; font-size: 9px; }
          .notes-label { font-size: 8px; font-weight: 700; }
          .notes-body { font-size: 8.5px; line-height: 1.35; }
          .footer { margin-top: auto; text-align: center; padding-top: 4px; }
          .footer-thanks { font-size: 13px; font-weight: 800; }
          .footer-brand { font-size: 9px; font-weight: 700; }
          .footer-line { font-size: 8px; color: #444; }
          .footer-url { font-size: 8px; color: #666; margin-top: 2px; }
        </style>
      </head><body>${slips}</body></html>`;
      const win = window.open('', '_blank');
      win.document.write(combined);
      win.document.close();
      win.print();
    } catch (err) {
      console.error('Bulk print error:', err);
      toast('error', err.message || 'Failed to print slips');
    }
  };

  // ── Bulk buy labels ───────────────────────────────────────────────────────
  const handleBulkBuyLabels = async (carrierPreference) => {
    if (!checkedPending.length) return;
    setShowBulkLabelModal(false);
    setBulkLabeling(true);
    setBulkProgress({ done: 0, total: checkedPending.length, results: [] });
    try {
      const bulkFn = httpsCallable(functions, 'bulkCreateShippingLabels', { timeout: 540000 });
      const { data } = await bulkFn({
        orderIds: checkedPending.map((o) => o.id),
        carrierPreference: carrierPreference || '',
      });
      // Update local orders state
      setOrders((prev) => prev.map((o) => {
        const r = data.results.find((x) => x.orderId === o.id && x.success);
        return r ? {
          ...o,
          status: 'shipped',
          trackingNumber: r.trackingNumber,
          labelUrl: r.labelUrl,
          labelCarrier: r.carrier,
          labelCost: r.labelCost ?? null,
        } : o;
      }));
      const succeededResults = data.results.filter((r) => r.success);
      if (succeededResults.length === 1) {
        const r = succeededResults[0];
        try {
          await fulfillShippingLabelDownload({
            labelUrl: r.labelUrl,
            labelPdfUrl: r.labelPdfUrl,
            labelPdfBase64: r.labelPdfBase64,
            labelContentType: r.labelContentType,
            packingSlipHtml: r.packingSlipHtml,
            trackingNumber: r.trackingNumber,
          });
        } catch (downloadErr) {
          console.warn('Bulk label download failed for', r.orderId, downloadErr);
        }
      } else {
        for (const r of succeededResults) {
          try {
            await downloadLabelPdf(r.labelPdfUrl || r.labelUrl, r.trackingNumber, {
              labelPdfBase64: r.labelPdfBase64,
              labelContentType: r.labelContentType,
            });
          } catch (downloadErr) {
            console.warn('Bulk label PDF download failed for', r.orderId, downloadErr);
          }
        }
      }
      setBulkProgress({ done: data.succeeded, total: checkedPending.length, results: data.results });
      toast(
        data.failed === 0 ? 'success' : 'warning',
        data.failed === 0 && succeededResults.length === 1 && succeededResults[0].message
          ? succeededResults[0].message
          : `${data.succeeded} label${data.succeeded !== 1 ? 's' : ''} purchased via EasyPost${data.failed > 0 ? `, ${data.failed} failed` : ''}`
      );
      if (data.failed === 0) setCheckedIds(new Set());
    } catch (err) {
      console.error('Bulk labels error:', err);
      toast('error', err.message || 'Bulk label purchase failed');
    } finally {
      setBulkLabeling(false);
    }
  };

  // ── Bulk mark status ──────────────────────────────────────────────────────
  const handleBulkMarkStatus = async (newStatus) => {
    if (!checkedOrders.length) return;
    try {
      await Promise.all(checkedOrders.map((o) =>
        updateDoc(doc(db, 'physicalOrders', o.id), { status: newStatus, updatedAt: serverTimestamp() })
      ));
      setOrders((prev) => prev.map((o) => checkedIds.has(o.id) ? { ...o, status: newStatus } : o));
      toast('success', `${checkedOrders.length} order${checkedOrders.length > 1 ? 's' : ''} marked as ${newStatus}`);
      setCheckedIds(new Set());
    } catch (err) {
      toast('error', 'Failed to update status');
    }
  };

  // ── Bulk print labels (open all label URLs) ───────────────────────────────
  const handleBulkOpenLabels = () => {
    const withLabels = checkedOrders.filter((o) => o.labelUrl);
    if (!withLabels.length) { toast('warning', 'No purchased labels on selected orders'); return; }
    // Combine all label images into one print window
    const imgs = withLabels.map((o) =>
      `<div style="page-break-after:always;text-align:center;">
        <img src="${o.labelUrl}" style="max-width:100%;max-height:6in;" />
      </div>`
    ).join('');
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>@page{size:4in 6in;margin:0}body{margin:0}img{display:block;}</style>
    </head><body>${imgs}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleResendDownload = async (order) => {
    if (!order.customerEmail) {
      toast('warning', 'No customer email on this order');
      return;
    }
    if (!window.confirm(`Resend PDF download link(s) to ${order.customerEmail}?`)) return;

    setResendingDownload(order.id);
    try {
      const resendFn = httpsCallable(functions, 'adminResendDigitalDownload');
      const { data } = await resendFn({ orderId: order.id });
      toast('success', `Download email sent to ${data.sentTo} (${data.linkCount} link${data.linkCount !== 1 ? 's' : ''})`);
    } catch (err) {
      console.error('Resend download error:', err);
      toast('error', err.message || 'Failed to resend download email');
    } finally {
      setResendingDownload(null);
    }
  };

  const handlePrintSlip = useCallback(async (orderId) => {
    try {
      const printSlip = httpsCallable(functions, 'printPackingSlip');
      const { data } = await printSlip({ orderId });
      if (data.html) {
        const win = window.open('', '_blank');
        win.document.write(data.html);
        win.document.close();
        win.print();
      }
    } catch (err) {
      console.error('Print slip error:', err);
      toast('error', 'Failed to generate packing slip');
    }
  }, []);

  const ORDERS_BROWSE_LIMIT = 10;
  const isSearching = searchQuery.trim().length > 0;

  const filtered = (() => {
    let list = orders.filter((o) => matchesFilter(o, filterTab));

    // Newest first (Firestore already loads desc, but keep stable if cache/manual inserts shuffle)
    list = [...list].sort((a, b) => {
      const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
      const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
      return bTime - aTime;
    });

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        const hay = [
          orderDisplayId(o),
          o.customerName,
          o.customerEmail,
          o.trackingNumber,
          itemSummary(o),
        ].filter(Boolean).join(' ').toLowerCase();
        return hay.includes(q);
      });
    }
    return list;
  })();

  useEffect(() => {
    setOrdersPage(1);
  }, [filterTab, searchQuery]);

  // Browse: last 10 only. Search: full match set (paginated).
  const browseList = isSearching ? filtered : filtered.slice(0, ORDERS_BROWSE_LIMIT);
  const totalPages = Math.max(1, Math.ceil(browseList.length / ORDERS_PAGE_SIZE));
  const currentPage = Math.min(ordersPage, totalPages);
  const paginatedOrders = isSearching
    ? browseList.slice(
        (currentPage - 1) * ORDERS_PAGE_SIZE,
        currentPage * ORDERS_PAGE_SIZE,
      )
    : browseList;

  const listedForSelect = isSearching ? filtered : browseList;
  const toggleAll = () => {
    if (checkedIds.size === listedForSelect.length && listedForSelect.every((o) => checkedIds.has(o.id))) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(listedForSelect.map((o) => o.id)));
    }
  };
  const checkedOrders = filtered.filter((o) => checkedIds.has(o.id));
  const checkedPending = checkedOrders.filter((o) => o.status === 'pending');

  const tabCounts = {
    all: orders.length,
    pending: orders.filter((o) => o.status === 'pending').length,
    fulfilled: orders.filter((o) => ['shipped', 'delivered'].includes(o.status)).length,
    cancelled: orders.filter((o) => isOrderCancelled(o.status)).length,
  };

  const pillShadow = theme.isDark ? '0 2px 8px rgba(0,0,0,0.35)' : '0 2px 8px rgba(0,0,0,0.08)';

  const statusTabs = [
    { id: 'all', label: 'All', count: tabCounts.all },
    { id: 'pending', label: 'Pending', count: tabCounts.pending },
    { id: 'fulfilled', label: 'Fulfilled', count: tabCounts.fulfilled },
    { id: 'cancelled', label: 'Canceled', count: tabCounts.cancelled },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <style>{`
        @keyframes orderCheckPop {
          0% { transform: scale(0.35); opacity: 0; }
          70% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .order-check-pop { animation: orderCheckPop 0.22s ease-out; }
      `}</style>

      <section className="space-y-3">
        <div
          className="flex w-full rounded-xl border p-1 gap-1 overflow-x-auto"
          role="tablist"
          aria-label="Order status"
          style={{
            borderColor: theme.border,
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(47,59,58,0.04)',
          }}
        >
          {statusTabs.map((tab) => {
            const active = filterTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setFilterTab(tab.id)}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg text-[12px] font-semibold tracking-wide transition-all whitespace-nowrap"
                style={{
                  backgroundColor: active ? theme.primary : 'transparent',
                  color: active ? (theme.textOnPrimary || '#fff') : theme.textLight,
                  boxShadow: active ? pillShadow : 'none',
                }}
              >
                {tab.label}
                <span className="ml-1 opacity-70">({tab.count})</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-1 min-w-0">
            <MagnifyingGlass
              size={18}
              weight="duotone"
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: theme.textLight }}
            />
            <input
              type="search"
              placeholder="Search orders…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2.5 rounded-xl border text-sm focus:outline-none min-w-0"
              style={{
                borderColor: theme.border,
                backgroundColor: theme.cardBackground,
                color: theme.text,
                boxShadow: theme.isDark ? '0 1px 4px rgba(0,0,0,0.25)' : '0 1px 4px rgba(0,0,0,0.06)',
              }}
            />
          </div>

          <label
            className={`px-3 py-2 rounded-full text-xs sm:text-sm font-semibold tracking-wide cursor-pointer transition-all hover:brightness-105 active:scale-[0.97] shrink-0 ${csvImporting ? 'opacity-50 pointer-events-none' : ''}`}
            style={{
              backgroundColor: theme.cardBackground,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              boxShadow: pillShadow,
            }}
          >
            <span className="hidden sm:inline">{csvImporting ? 'Importing…' : 'Import CSV'}</span>
            <span className="sm:hidden">{csvImporting ? '…' : 'CSV'}</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={handleCsvUpload} disabled={csvImporting} />
          </label>

          <button
            type="button"
            onClick={() => setShowManualOrder(true)}
            className="px-3 py-2 rounded-full text-xs sm:text-sm font-semibold tracking-wide flex items-center gap-1.5 transition-all hover:brightness-105 active:scale-[0.97] shrink-0"
            style={{
              backgroundColor: theme.primary,
              color: theme.textOnPrimary || '#fff',
              boxShadow: theme.isDark
                ? '0 2px 8px rgba(0,0,0,0.35)'
                : `0 2px 8px ${theme.primary}45`,
            }}
          >
            <Plus size={14} weight="bold" />
            New
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <h2
          className="text-sm font-bold flex items-center gap-2 pb-1 border-b"
          style={{ color: theme.text, borderColor: theme.border }}
        >
          <Package size={16} weight="duotone" style={{ color: theme.primary }} />
          Orders
          <span className="font-normal text-[11px]" style={{ color: theme.textLight }}>
            {isSearching
              ? `${filtered.length} result${filtered.length === 1 ? '' : 's'}`
              : `Showing ${paginatedOrders.length} of ${filtered.length}`}
          </span>
          {!loading && listedForSelect.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              className="ml-auto flex items-center gap-2 text-[11px] font-semibold tracking-wide"
              style={{ color: theme.textLight }}
            >
              <OrderSelectCheckbox
                checked={listedForSelect.length > 0 && listedForSelect.every((o) => checkedIds.has(o.id))}
                theme={theme}
                onClick={toggleAll}
              />
              Select all
            </button>
          )}
        </h2>

        {checkedIds.size > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-2xl border px-3 py-2.5"
            style={{
              borderColor: theme.border,
              backgroundColor: `${theme.primary}08`,
            }}
          >
            <span className="text-xs font-semibold" style={{ color: theme.text }}>
              {checkedIds.size} selected
            </span>
            <button
              type="button"
              onClick={handleBulkPrintSlips}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all hover:brightness-105"
              style={{ backgroundColor: theme.cardBackground, color: theme.text, border: `1px solid ${theme.border}`, boxShadow: pillShadow }}
            >
              <Printer size={13} /> Slips
            </button>
            {checkedOrders.some((o) => o.labelUrl) && (
              <button
                type="button"
                onClick={handleBulkOpenLabels}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 transition-all hover:brightness-105"
                style={{ backgroundColor: theme.cardBackground, color: theme.text, border: `1px solid ${theme.border}`, boxShadow: pillShadow }}
              >
                <Printer size={13} /> Labels
              </button>
            )}
            {checkedPending.length > 0 && (
              <button
                type="button"
                onClick={() => setShowBulkLabelModal(true)}
                disabled={bulkLabeling}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold flex items-center gap-1.5 text-white disabled:opacity-50"
                style={{ backgroundColor: theme.primary, boxShadow: `0 2px 8px ${theme.primary}45` }}
              >
                {bulkLabeling ? <CircleNotch size={13} className="animate-spin" /> : <Truck size={13} />}
                {bulkLabeling ? 'Buying…' : `Buy labels (${checkedPending.length})`}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleBulkMarkStatus('shipped')}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all hover:brightness-105"
              style={{ backgroundColor: theme.cardBackground, color: theme.text, border: `1px solid ${theme.border}`, boxShadow: pillShadow }}
            >
              Mark shipped
            </button>
            <button
              type="button"
              onClick={() => handleBulkMarkStatus('delivered')}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all hover:brightness-105"
              style={{ backgroundColor: theme.cardBackground, color: theme.text, border: `1px solid ${theme.border}`, boxShadow: pillShadow }}
            >
              Mark fulfilled
            </button>
            <button type="button" onClick={clearChecked} className="ml-auto p-1.5 rounded-full hover:brightness-95" style={{ color: theme.textLight }}>
              <X size={15} />
            </button>
          </div>
        )}

        {bulkProgress && bulkProgress.results.length > 0 && (
          <div
            className="rounded-2xl border px-4 py-3 text-xs space-y-1"
            style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold" style={{ color: theme.text }}>
                Label results: {bulkProgress.done}/{bulkProgress.total} purchased
              </span>
              <button type="button" onClick={() => setBulkProgress(null)} style={{ color: theme.textLight }}>
                <X size={13} />
              </button>
            </div>
            {bulkProgress.results.filter((r) => !r.success).map((r) => (
              <div key={r.orderId} style={{ color: '#ef4444' }}>
                {r.orderId.slice(-8).toUpperCase()} — {r.error}
              </div>
            ))}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <CircleNotch size={24} weight="duotone" className="animate-spin" style={{ color: theme.primary }} />
          </div>
        ) : filtered.length === 0 ? (
          <div
            className="text-center py-12 rounded-2xl border"
            style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}
          >
            <Package size={40} className="mx-auto mb-3 opacity-30" style={{ color: theme.textLight }} />
            <p className="text-sm font-medium mb-1" style={{ color: theme.text }}>
              No orders found
            </p>
            <p className="text-xs" style={{ color: theme.textLight }}>
              Try adjusting search or filters.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedOrders.map((order) => {
              const ff = fulfillmentDisplay(order.status);
              const pay = paymentDisplay(order);
              const summary = itemSummary(order);
              const totalFormatted = `$${((order.amountTotal || 0) / 100).toFixed(2)}`;
              const isChecked = checkedIds.has(order.id);
              const toneColor = ff.tone === 'pending' ? '#d97706' : ff.tone === 'cancelled' ? '#dc2626' : theme.primary;

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border overflow-hidden transition-all cursor-pointer hover:brightness-[0.99] active:scale-[0.995]"
                  style={{
                    borderColor: isChecked ? `${theme.primary}55` : theme.border,
                    backgroundColor: theme.cardBackground,
                    boxShadow: theme.isDark ? '0 4px 16px rgba(0,0,0,0.2)' : '0 4px 16px rgba(47,59,58,0.05)',
                  }}
                  onClick={() => setSelectedOrder(order)}
                >
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <OrderSelectCheckbox
                        checked={isChecked}
                        theme={theme}
                        className="mt-1"
                        onClick={(e) => toggleCheck(e, order.id)}
                      />
                      <OrderProductThumbs
                        order={order}
                        products={shopProducts}
                        toneColor={toneColor}
                        theme={theme}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="font-semibold text-sm truncate" style={{ color: theme.text }}>
                              {orderDisplayId(order)}
                            </h4>
                            <p className="text-xs mt-0.5 truncate" style={{ color: theme.textLight }}>
                              {order.customerName || order.shippingName || 'Guest'}
                              {order.customerEmail ? ` · ${order.customerEmail}` : ''}
                            </p>
                          </div>
                          <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: theme.text }}>
                            {totalFormatted}
                          </span>
                        </div>
                        <p className="text-xs mt-1 line-clamp-1" style={{ color: theme.textLight }}>
                          {summary}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-2.5">
                          <OrderSourceBadge order={order} theme={theme} />
                          <span
                            className="inline-flex items-center px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                            style={fulfillmentBadgeStyle(ff.tone)}
                          >
                            {ff.label}
                          </span>
                          <span
                            className="inline-flex items-center px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                            style={{
                              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(47,59,58,0.05)',
                              color: theme.text,
                            }}
                          >
                            {pay}
                          </span>
                          <span
                            className="inline-flex items-center px-2.5 py-1.5 rounded-xl text-[11px] font-medium"
                            style={{
                              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(47,59,58,0.05)',
                              color: theme.textLight,
                            }}
                          >
                            {formatDateShort(order.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {isSearching && filtered.length > ORDERS_PAGE_SIZE && (
              <OrdersPagination
                theme={theme}
                page={currentPage}
                totalPages={totalPages}
                totalCount={filtered.length}
                pageSize={ORDERS_PAGE_SIZE}
                onPageChange={setOrdersPage}
              />
            )}
          </div>
        )}
      </section>

      {selectedOrder && (
        <AdminShopOrderDetail
          order={selectedOrder}
          shopProducts={shopProducts}
          theme={theme}
          onClose={() => {
            setOrderActionLoading(false);
            setSelectedOrder(null);
          }}
          onStatusChange={handleDetailStatusChange}
          onPrintSlip={handlePrintSlip}
          onCreateLabel={(o) => setShippingModalOrder(o)}
          onResendDownload={handleResendDownload}
          onCancelOrder={handleCancelOrder}
          onRefundOrder={handleRefundOrder}
          onDeleteOrder={handleDeleteOrder}
          onAddNote={(text) => handleAddOrderNote(selectedOrder.id, text)}
          onEasyPostRegistered={handleEasyPostRegistered}
          onSyncFromStripe={handleSyncFromStripe}
          resendingDownload={resendingDownload === selectedOrder.id}
          orderHasDigital={orderHasDigital}
          isDeleting={deletingOrderId === selectedOrder.id}
          isOrderActionLoading={orderActionLoading}
          isSavingNote={savingNoteOrderId === selectedOrder.id}
        />
      )}

      {shippingModalOrder && (
        <ShippingLabelModal
          order={shippingModalOrder}
          theme={theme}
          onClose={() => setShippingModalOrder(null)}
          onPurchased={handleLabelPurchased}
        />
      )}

      <ManualOrderModal
        open={showManualOrder}
        theme={theme}
        onClose={() => setShowManualOrder(false)}
        onCreated={loadOrders}
      />

      <BulkLabelModal
        open={showBulkLabelModal}
        theme={theme}
        orders={checkedPending}
        onClose={() => setShowBulkLabelModal(false)}
        onConfirm={(carrier) => handleBulkBuyLabels(carrier)}
      />
    </div>
  );
}

