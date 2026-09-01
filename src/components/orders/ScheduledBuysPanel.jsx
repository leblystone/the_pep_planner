import React, { useState, useEffect } from 'react';
import { PlusCircle, Edit, Trash2, Building, Calendar, Info, ChevronDown, MessageSquare } from 'lucide-react';
import { formatMMDDYYYY } from '../../utils/date';
import Modal from '../common/Modal';
import TextInput from '../common/inputs/TextInput';
import { generateId } from '../../utils/string';
import { useAppContext } from '../../context/AppContext';
import AddScheduledBuyModal from './AddScheduledBuyModal';
import { saveAppData } from '../../services/cloudStorage';
import { useFirebase } from '../../context/FirebaseContext';
import { prepareItemForSave } from '../../utils/userDataSave';
import { recordDeletion } from '../../utils/deletionTracking';

export default function ScheduledBuysPanel({ theme }) {
    const { scheduledBuys, setScheduledBuys, protocols, reconItems, reconHistory, supplements, orders, metrics, vendors, calendarNotes, stockpile } = useAppContext();
    const { firebaseUser } = useFirebase();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingBuy, setEditingBuy] = useState(null);

    useEffect(() => {
        // Bump listeners when data changes
        try {
            const now = String(Date.now())
            localStorage.setItem('tpprover_orders_bump', now)
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new StorageEvent('storage', { key: 'tpprover_orders_bump', newValue: now }))
                window.dispatchEvent(new StorageEvent('storage', { key: 'tpprover_calendar_bump', newValue: now }))
            }
        } catch {}
    }, [scheduledBuys]);

    const handleSave = (buy) => {
        if (buy.id) {
            // Edit existing scheduled buy — clear reconfirm flag when user edits
            const updatedBuy = prepareItemForSave({ ...buy, needsReconfirm: false });
            setScheduledBuys(prev => prev.map(b => b.id === buy.id ? updatedBuy : b));
        } else {
            // Create new scheduled buy
            const newBuy = prepareItemForSave({ 
                ...buy, 
                id: generateId()
            }, { isNew: true });
            setScheduledBuys(prev => [...prev, newBuy]);
        }
        setIsModalOpen(false);
        setEditingBuy(null);
    };

    const handleDelete = async (id) => {
        const buyToDelete = scheduledBuys.find(b => b.id === id);
        if (buyToDelete) {
            console.log('🗑️ Deleting scheduled buy:', buyToDelete.item || buyToDelete.name || 'Unknown');
            // Record deletion for cross-device sync
            recordDeletion('scheduledBuys', id, buyToDelete);
        }
        const updatedBuys = scheduledBuys.filter(b => b.id !== id);
        setScheduledBuys(updatedBuys);
        if (firebaseUser) {
            try {
                const userId = firebaseUser.uid;
                const appData = {
                    protocols: protocols || [],
                    reconItems: reconItems || [],
                    reconHistory: reconHistory || [],
                    supplements: supplements || [],
                    orders: orders || [],
                    metrics: metrics || [],
                    vendors: vendors || [],
                    calendarNotes: calendarNotes || {},
                    stockpile: stockpile || [],
                    scheduledBuys: updatedBuys
                };
                // Use skipMerge: false for timestamp-based merging
                saveAppData(userId, appData, { skipMerge: false });
            } catch (error) {
                console.error('Failed to sync scheduled buy deletion:', error);
            }
        }
    };

    const handleDeleteFromModal = (id) => {
        handleDelete(id);
        setIsModalOpen(false);
        setEditingBuy(null);
    };

    const handleOpenModal = (buy = null) => {
        setEditingBuy(buy);
        setIsModalOpen(true);
    };

    return (
        <div className="rounded-2xl p-4 shadow-sm glass-panel-minimal" style={{ fontFamily: 'Poppins, sans-serif' }}>
            <div className="flex items-center justify-between mb-4">
                <div className="flex flex-col gap-0.5">
                    <h2 className="text-base font-bold uppercase tracking-wider" style={{ color: theme.text }}>Scheduled Buys</h2>
                    <div className="flex items-center gap-2">
                        <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>Research Queue</span>
                    </div>
                </div>
                <button
                    className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide flex items-center gap-2 transition-all hover:scale-105 active:scale-95 shadow-sm"
                    style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}
                    onClick={() => handleOpenModal()}
                >
                    <PlusCircle size={14} strokeWidth={2.5} /> Add
                </button>
            </div>

            <div className="space-y-4 mt-2">
                {scheduledBuys.length > 0 ? (
                    scheduledBuys.sort((a, b) => new Date(a.openDate) - new Date(b.openDate)).map(buy => (
                        <div key={buy.id} className="relative pl-3 group/buy cursor-pointer" onClick={() => handleOpenModal(buy)}>
                            {/* Vertical indicator line */}
                            <div 
                                className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full transition-opacity group-hover/buy:opacity-100"
                                style={{ backgroundColor: '#8ca68c', opacity: 0.4 }}
                            />
                            
                            {/* Header Section */}
                            <div className="flex items-center justify-between mb-1.5">
                                <div className="font-semibold text-[13px]" style={{ color: theme.text }}>{buy.item}</div>
                                <div className="flex items-center gap-1">
                                    {buy.needsReconfirm && (
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const updated = prepareItemForSave({ ...buy, needsReconfirm: false });
                                                setScheduledBuys(prev => prev.map(b => b.id === buy.id ? updated : b));
                                                window.dispatchEvent(new CustomEvent('tpp:toast', {
                                                    detail: { message: 'Scheduled buy confirmed', type: 'success' },
                                                }));
                                            }}
                                            className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                            style={{
                                                backgroundColor: 'rgba(245,158,11,0.14)',
                                                color: '#f59e0b',
                                                border: '1px solid rgba(245,158,11,0.35)',
                                            }}
                                            title="Still pending?"
                                        >
                                            Still pending?
                                        </button>
                                    )}
                                    <button onClick={(e) => { e.stopPropagation(); handleOpenModal(buy); }} className="p-1 hover:bg-black/5 rounded-md transition-colors" style={{ color: theme.textLight }}><Edit size={12} /></button>
                                    <button onClick={(e) => { e.stopPropagation(); if(window.confirm('Delete scheduled buy?')) handleDelete(buy.id); }} className="p-1 hover:bg-red-50 rounded-md transition-colors" style={{ color: theme.error || '#ef4444' }}><Trash2 size={12} /></button>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-1 gap-1.5">
                                <div className="flex items-center gap-2 text-[11px] opacity-70" style={{ color: theme.text }}>
                                    <Calendar size={10} style={{ color: '#8ca68c' }} />
                                    {formatMMDDYYYY(buy.openDate)} - {formatMMDDYYYY(buy.closeDate)}
                                </div>
                                {buy.vendor && (
                                    <div className="flex items-center gap-2 text-[11px] opacity-70" style={{ color: theme.text }}>
                                        <Building size={10} style={{ color: '#8ca68c' }} />
                                        {buy.vendor}
                                    </div>
                                )}
                                {buy.notes && (
                                    <div className="flex items-start gap-2 text-[11px] opacity-60 italic mt-0.5" style={{ color: theme.text }}>
                                        <Info size={10} className="mt-0.5" style={{ color: '#8ca68c' }} />
                                        <span>{buy.notes}</span>
                                    </div>
                                )}
                            </div>
                            
                            {/* Section Divider */}
                            <div className="h-px w-full mt-3 opacity-10" style={{ backgroundColor: theme.text }} />
                        </div>
                    ))
                ) : (
                    <div className="flex flex-col items-center justify-center py-8 opacity-40">
                        <MessageSquare size={24} className="mb-2" />
                        <p className="text-xs font-medium uppercase tracking-widest text-center">No research buys<br/>scheduled</p>
                    </div>
                )}
            </div>

            <AddScheduledBuyModal
                open={isModalOpen}
                onClose={() => { setIsModalOpen(false); setEditingBuy(null); }}
                theme={theme}
                buy={editingBuy}
                onSave={handleSave}
                onDelete={handleDeleteFromModal}
            />
        </div>
    );
}
