import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  IconContext,
  Star,
  Envelope,
  Phone,
  Globe,
  ChatText,
  ShareNetwork,
  CreditCard,
  CaretDown,
  Info,
} from '@phosphor-icons/react';
import { FaDiscord, FaTelegramPlane, FaWhatsapp, FaFacebook } from 'react-icons/fa';
import { SiZelle, SiCashapp, SiVenmo } from 'react-icons/si';
import { FaPaypal, FaAlipay } from 'react-icons/fa6';
import { RiBitCoinFill } from "react-icons/ri";
import ShareModal from '../common/ShareModal';
import { formatCurrency } from '../../utils/currencyUtils';
import { useAppContext } from '../../context/AppContext';
import OwnerChip from '../buddy/OwnerChip';
import { useIsSimpleMode } from '../../hooks/useIsSimpleMode';

// Venmo icon wrapper - makes it bigger for better visibility
const VenmoIcon = ({ className, size, style }) => {
    const actualSize = size || (className?.includes('w-') ? undefined : 20);
    const actualClassName = className?.replace(/w-\d+/, 'w-5').replace(/h-\d+/, 'h-5') || 'w-5 h-5';
    return <SiVenmo className={actualClassName} size={actualSize} style={style} />;
};


const GOOD_LABELS = ['Reliable', 'Fast Shipping', 'Overfill', 'Vetted', 'Reshipper'];
const BAD_LABELS = ['Bad Test', 'Bad Packaging', 'Broken Vials', 'Rude Reps', 'Out of Service', 'Puck Problem'];

const getContactIcon = (type) => {
    const s = String(type || '').toLowerCase();
    if (s === 'email') return <Envelope size={12} />;
    if (s === 'phone') return <Phone size={12} />;
    if (s === 'website') return <Globe size={12} />;
    if (s === 'whatsapp') return <FaWhatsapp size={12} />;
    if (s === 'discord') return <FaDiscord size={12} />;
    if (s === 'telegram') return <FaTelegramPlane size={12} />;
    if (s === 'facebook') return <FaFacebook size={12} />;
    return <ChatText size={12} />;
};

function buildContactHref(type, rawValue) {
  const t = String(type || '').toLowerCase()
  const v = String(rawValue || '').trim()
  if (!v) return { isLink: false }
  // email
  if (t === 'email') return { isLink: true, href: `mailto:${v}` }
  // phone and WhatsApp
  if (t === 'phone') return { isLink: true, href: `tel:${v.replace(/[^0-9+]/g,'')}` }
  if (t === 'whatsapp') {
    const num = v.match(/^[+0-9 ]+$/) ? v.replace(/[^0-9]/g,'') : ''
    const href = num ? `https://wa.me/${num}` : (v.startsWith('http') ? v : `https://wa.me/${encodeURIComponent(v)}`)
    return { isLink: true, href }
  }
  // telegram
  if (t === 'telegram') {
    const handle = v.replace(/^@/, '')
    if (v.startsWith('http')) return { isLink: true, href: v }
    return { isLink: true, href: `https://t.me/${handle}` }
  }
  // discord: user handles are not directly linkable, but server invites are. Treat as copyable otherwise.
  if (t === 'discord') {
    if (/discord\.gg|discord\.com\/invite/.test(v)) return { isLink: true, href: v }
    return { isLink: false } // Always treat as a copyable button if not an invite link
  }
  // facebook
  if (t === 'facebook') {
    if (v.startsWith('http')) return { isLink: true, href: v }
    return { isLink: true, href: `https://facebook.com/${v.replace(/^@/, '')}` }
  }
  // website/URL
  if (t === 'website' || /^https?:\/\//i.test(v) || v.includes('.')) {
    const href = v.startsWith('http') ? v : `https://${v}`
    return { isLink: true, href }
  }
  return { isLink: false }
}


export default function VendorCard({ vendor, theme, onEditClick, onManageProtocolClick, onForceDelete, onToggleFavorite, isPublicView = false, hideFooter = false }) {
    const { orders: contextOrders } = useAppContext();
    const simpleMode = useIsSimpleMode();
    const [isShareModalOpen, setShareModalOpen] = useState(false);
    const [starPop, setStarPop] = useState(false);
    const favorited = Boolean(vendor?.favorited);
    const starColor = theme.primary || '#7F9E95';

    const handleShare = () => {
        setShareModalOpen(true);
    };

    const orderHistory = useMemo(() => {
        const orders = contextOrders || [];
        return orders.filter(order => 
            (order.vendorId && order.vendorId === vendor.id) || 
            (!order.vendorId && order.vendor && order.vendor.toLowerCase() === vendor.name.toLowerCase())
        );
    }, [contextOrders, vendor.id, vendor.name]);

    // Calculate total spent with this vendor
    const totalSpent = useMemo(() => {
        if (orderHistory.length === 0) return 0;
        
        return orderHistory.reduce((total, order) => {
            // Check if order has items array (new format)
            if (order.items && order.items.length > 0) {
                const itemsTotal = order.items.reduce((sum, item) => {
                    const price = parseFloat(item.price) || 0;
                    const quantity = parseInt(item.quantity, 10) || 1;
                    return sum + (price * quantity);
                }, 0);
                const shippingCost = parseFloat(order.shippingCost) || 0;
                return total + itemsTotal + shippingCost;
            }
            // Fallback to direct cost field (old format)
            const cost = parseFloat(order.cost) || 0;
            return total + cost;
        }, 0);
    }, [orderHistory]);

    const paymentMethods = [];
    const p = vendor?.payments || {};
    if (p.card) paymentMethods.push({ label: 'Card', Icon: CreditCard });
    if (p.zelle) paymentMethods.push({ label: 'Zelle', Icon: SiZelle });
    if (p.crypto) paymentMethods.push({ label: 'Crypto', Icon: RiBitCoinFill });
    if (p.paypal) paymentMethods.push({ label: 'PayPal', Icon: FaPaypal });
    if (p.venmo) paymentMethods.push({ label: 'Venmo', Icon: VenmoIcon });
    if (p.cashapp) paymentMethods.push({ label: 'CashApp', Icon: SiCashapp });
    if (p.alipay) paymentMethods.push({ label: 'AliPay', Icon: FaAlipay });

    const cardStyle = {
        boxShadow: theme.isDark
            ? '0 4px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
            : '0 2px 16px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.04)',
    };

    return (
        <IconContext.Provider value={{ weight: 'duotone' }}>
            <div 
                className={`rounded-2xl p-4 transition-[box-shadow,opacity] duration-200 cursor-pointer flex flex-col glass-panel-minimal ${vendor.isStub ? 'ring-2 ring-opacity-50' : ''}`} 
                style={{
                    ...cardStyle, 
                    '--tw-ring-color': vendor.isStub ? theme.primary : 'transparent',
                    fontFamily: 'Poppins, sans-serif'
                }}
                onClick={() => !isPublicView && onEditClick?.(vendor)}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-3 gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-lg truncate" style={{ color: theme.text }}>
                                {vendor.name}
                            </h3>
                            {!isPublicView && !simpleMode && <OwnerChip ownerId={vendor.ownerId} theme={theme} compact />}
                        </div>
                        <div className="flex items-center gap-1" aria-label={`Rating ${vendor.rating || 0} of 5`}>
                            {[1, 2, 3, 4, 5].map(n => {
                                const fillSteps = ['#7A8E85', '#6B7F77', '#566D64', '#445952', '#3B4240'];
                                const isFilled = (vendor.rating || 0) >= n;
                                return (
                                    <Star
                                        key={n}
                                        size={16}
                                        weight={isFilled ? 'fill' : 'regular'}
                                        style={{
                                            color: isFilled
                                                ? fillSteps[n - 1]
                                                : (theme.isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)'),
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                    
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {!isPublicView && (
                            <motion.button
                                type="button"
                                layout={false}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setStarPop(true);
                                    onToggleFavorite?.(vendor);
                                    window.setTimeout(() => setStarPop(false), 320);
                                }}
                                className="p-0.5 rounded-md touch-manipulation"
                                style={{
                                    color: starColor,
                                    opacity: favorited ? 1 : 0.55,
                                    WebkitTapHighlightColor: 'transparent',
                                }}
                                aria-label={favorited ? 'Unfavorite vendor' : 'Favorite vendor'}
                                aria-pressed={favorited}
                                title={favorited ? 'Unpin from top' : 'Pin to top'}
                                whileTap={{ y: -8, scale: 1.12 }}
                                animate={starPop
                                    ? { y: [0, -16, 0], scale: [1, 1.3, 1] }
                                    : { y: 0, scale: 1 }}
                                transition={{ type: 'spring', stiffness: 520, damping: 18 }}
                            >
                                <Star size={22} weight={favorited ? 'fill' : 'regular'} />
                            </motion.button>
                        )}
                        {vendor.isStub && (
                            <div 
                                className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest shadow-sm"
                                style={{ 
                                    backgroundColor: theme.isDark ? 'rgba(200, 122, 92, 0.15)' : 'rgba(200, 122, 92, 0.12)',
                                    color: '#c87a5c'
                                }}
                            >
                                Incomplete
                            </div>
                        )}
                        {!isPublicView && !simpleMode && orderHistory.length > 0 && (
                            <>
                                <div className="text-[10px] font-semibold opacity-30 uppercase tracking-widest mt-1" style={{ color: theme.text }}>
                                    {orderHistory.length} ORDER{orderHistory.length !== 1 ? 'S' : ''}
                                </div>
                                <div className="text-[10px] font-semibold opacity-60 mt-0.5" style={{ color: theme.text }}>
                                    {formatCurrency(totalSpent)}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Vertical Indicator Content Area */}
                <div className="flex-1 space-y-3 mt-1">
                    
                    {/* Contacts Section */}
                    {vendor.contacts && vendor.contacts.length > 0 && (
                        <div className="relative pl-3">
                            <div 
                                className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                                style={{ backgroundColor: theme.primary, opacity: 0.4 }}
                            />
                            
                            {/* Section Header */}
                            <div className="text-[11px] font-medium uppercase tracking-widest mb-2 opacity-60 flex items-center" style={{ color: theme.text }}>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <ChatText size={14} weight="duotone" style={{ color: theme.primary }} />
                                    Contacts
                                </div>
                                <div className="h-px flex-1 ml-3 opacity-30" style={{ backgroundColor: theme.primary }} />
                            </div>

                            <div className="grid grid-cols-1 gap-1.5 text-sm">
                                {vendor.contacts.filter(c => c.value).map(c => {
                                    const action = buildContactHref(c.type, c.value);
                                    const content = (
                                        <div className="flex items-center gap-2 text-[12px] group/item">
                                            <span style={{ color: theme.primary }}>{getContactIcon(c.type)}</span>
                                            <span className="truncate opacity-80 group-hover/item:opacity-100 transition-opacity" style={{ color: theme.text }}>
                                                {c.value}
                                            </span>
                                        </div>
                                    );
                                    
                                    if (action.isLink) {
                                        return (
                                            <a 
                                                key={c.type+c.value} 
                                                href={action.href} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="min-w-0"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {content}
                                            </a>
                                        );
                                    }
                                    
                                    return (
                                        <button 
                                            key={c.type+c.value} 
                                            onClick={(e) => { 
                                                e.stopPropagation();
                                                try { 
                                                    navigator.clipboard.writeText(c.value); 
                                                    window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Copied!', type: 'success' } })) 
                                                } catch { } 
                                            }} 
                                            title={`Copy ${c.value}`} 
                                            className="min-w-0 text-left w-full"
                                        >
                                            {content}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Payments & Labels — rating lives under the vendor name */}
                    {!simpleMode && (paymentMethods.length > 0 || (vendor.labels && vendor.labels.length > 0)) && (
                    <div className="relative pl-3">
                        <div 
                            className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                            style={{ backgroundColor: theme.primary, opacity: 0.4 }}
                        />
                        
                        {/* Section Header */}
                        <div className="text-[11px] font-medium uppercase tracking-widest mb-2 opacity-60 flex items-center" style={{ color: theme.text }}>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                <CreditCard size={14} weight="duotone" style={{ color: theme.primary }} />
                                Trust & Payments
                            </div>
                            <div className="h-px flex-1 ml-3 opacity-30" style={{ backgroundColor: theme.primary }} />
                        </div>

                        <div className="space-y-2">
                            {paymentMethods.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {paymentMethods.map(({ label, Icon }) => (
                                        <span 
                                            key={label} 
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium" 
                                            style={{ backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', color: theme.text }}
                                        >
                                            <Icon className="w-3.5 h-3.5 opacity-80" />
                                            {label}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {vendor.labels && vendor.labels.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {vendor.labels.map(l => {
                                        let backgroundColor, color;
                                        if (theme.isDark) {
                                            if (GOOD_LABELS.includes(l)) {
                                                backgroundColor = 'rgba(60, 78, 58, 0.4)';
                                                color = '#dcfce7';
                                            } else if (BAD_LABELS.includes(l)) {
                                                backgroundColor = 'rgba(109, 43, 44, 0.4)';
                                                color = '#fee2e2';
                                            } else {
                                                backgroundColor = 'rgba(68, 104, 121, 0.4)';
                                                color = '#dbeafe';
                                            }
                                        } else {
                                            if (GOOD_LABELS.includes(l)) {
                                                backgroundColor = 'rgba(96, 124, 92, 0.15)';
                                                color = '#3c4e3a';
                                            } else if (BAD_LABELS.includes(l)) {
                                                backgroundColor = 'rgba(161, 77, 77, 0.15)';
                                                color = '#6D2B2C';
                                            } else {
                                                backgroundColor = 'rgba(173, 195, 209, 0.2)';
                                                color = '#1e3a5f';
                                            }
                                        }
                                        return (
                                            <span 
                                                key={l} 
                                                className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                                                style={{ backgroundColor, color }}
                                            >
                                                {l}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                    )}

                    {/* Notes Section - Expandable */}
                    {!simpleMode && vendor.notes && vendor.notes.trim() && (
                        <div className="relative pl-3">
                            <div 
                                className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full"
                                style={{ backgroundColor: theme.primary, opacity: 0.4 }}
                            />
                            
                            {/* Section Header */}
                            <div className="text-[10px] font-medium uppercase tracking-widest mb-1.5 opacity-60 flex items-center" style={{ color: theme.text }}>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                    <Info size={10} style={{ color: theme.primary }} />
                                    Research Notes
                                </div>
                                <div className="h-px flex-1 ml-3 opacity-30" style={{ backgroundColor: theme.primary }} />
                            </div>

                            <div 
                                className="text-[11px] leading-relaxed italic opacity-70"
                                style={{
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    color: theme.text
                                }}
                            >
                                {vendor.notes}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Section - Action buttons and Expand Indicator */}
                {!hideFooter && (
                <div className="mt-3 pt-3 border-t flex items-center justify-center relative" style={{ borderColor: theme.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)' }}>
                    <div className="flex items-center gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs sm:text-sm font-semibold uppercase tracking-widest" style={{ color: theme.text }}>
                            Edit
                        </span>
                        <CaretDown size={18} weight="bold" style={{ color: theme.primary }} />
                    </div>

                    {!isPublicView && (
                        <div className="absolute right-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleShare();
                                }}
                                className="p-1.5 rounded-lg transition-colors"
                                style={{ }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                                title="Share vendor"
                            >
                                <ShareNetwork size={18} style={{ color: theme.textLight }} />
                            </button>
                        </div>
                    )}
                </div>
                )}
            </div>
            {isShareModalOpen && (
            <ShareModal
                open={isShareModalOpen}
                onClose={() => setShareModalOpen(false)}
                theme={theme}
                title="Vendor"
                cardProps={{ vendor: vendor, theme, isPublicView: true }}
                shareData={{ ...vendor, type: 'vendor' }}
            />
            )}
        </IconContext.Provider>
    );
}
