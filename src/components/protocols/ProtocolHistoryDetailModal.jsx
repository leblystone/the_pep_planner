import React, { useState, useMemo } from 'react';
import BottomSheet from '../common/BottomSheet';
import { formatMMDDYYYY } from '../../utils/date';
import { getActiveWashoutInfo } from '../../utils/washout';
import { Package, Calendar, CalendarCheck, CalendarX, CalendarClock, Clock, DollarSign, FlaskConical, Trash2, FileText, Filter, Edit3, Star, RotateCcw, CheckCircle2, AlertCircle, Pill, Link2, Truck, Store, Droplets, Play, Plus, StickyNote, ClipboardCheck, CircleDot, Pipette, ChevronUp, ChevronDown, ChevronRight, Pause, SkipForward } from 'lucide-react';
import { deleteProtocolHistoryEntry, restoreProtocolHistoryEntry, getProtocolHistory } from '../../utils/protocolHistory';
import ProtocolFollowUpModal from './ProtocolFollowUpModal';
import CustomDropdown from '../common/inputs/CustomDropdown';
import { useAppContext } from '../../context/AppContext';

export default function ProtocolHistoryDetailModal({ open, onClose, historyEntry, theme, stockpile, onRestore, onEdit, protocols, expandAssessment = false }) {
    const { protocols: contextProtocols } = useAppContext();
    const [showFollowUpModal, setShowFollowUpModal] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [protocol, setProtocol] = useState(null);
    const [refreshKey, setRefreshKey] = useState(0);
    const [noteFilter, setNoteFilter] = useState('during');
    const [expandedSections, setExpandedSections] = useState({
        date: true,
        activity: true,
        peptides: false,
        vials: false,
        delivery: false,
        assessment: expandAssessment
    });

    React.useEffect(() => {
        if (open && expandAssessment) {
            setExpandedSections(prev => ({ ...prev, assessment: true }));
        }
    }, [open, expandAssessment, historyEntry?.id]); 
    React.useEffect(() => {
        const handleHistoryUpdate = () => {
            setRefreshKey(prev => prev + 1);
        };
        window.addEventListener('tpp:protocol-history-updated', handleHistoryUpdate);
        return () => window.removeEventListener('tpp:protocol-history-updated', handleHistoryUpdate);
    }, []);
    
    const currentHistoryEntry = React.useMemo(() => {
        if (!historyEntry?.id) return historyEntry;
        try {
            const allHistory = getProtocolHistory();
            return allHistory.find(e => e.id === historyEntry.id) || historyEntry;
        } catch {
            return historyEntry;
        }
    }, [historyEntry, refreshKey]);
    
    React.useEffect(() => {
        if (currentHistoryEntry?.protocolId) {
            try {
                const allProtocols = protocols || contextProtocols || [];
                const foundProtocol = allProtocols.find(p => p.id === currentHistoryEntry.protocolId);
                setProtocol(foundProtocol || { id: currentHistoryEntry.protocolId, protocolName: currentHistoryEntry.protocolName || 'Unnamed Protocol' });
            } catch (e) {
                setProtocol({ id: currentHistoryEntry.protocolId, protocolName: currentHistoryEntry.protocolName || 'Unnamed Protocol' });
            }
        }
    }, [currentHistoryEntry, protocols]);
    
    const followUpNote = useMemo(() => {
        if (!currentHistoryEntry || !Array.isArray(currentHistoryEntry.notes)) return null;
        return currentHistoryEntry.notes.find(n => n.type === 'follow_up');
    }, [currentHistoryEntry?.notes, refreshKey]);
    
    const filteredNotes = useMemo(() => {
        if (!currentHistoryEntry || !Array.isArray(currentHistoryEntry.notes)) return [];
        if (noteFilter === 'all') return currentHistoryEntry.notes;
        return currentHistoryEntry.notes.filter(note => note.type === noteFilter);
    }, [currentHistoryEntry?.notes, noteFilter]);

    const canRestore = useMemo(() => {
        if (!currentHistoryEntry?.endDate || !currentHistoryEntry?.protocolId) return false;
        const allProtocols = protocols || [];
        return allProtocols.some(p => p.id === currentHistoryEntry.protocolId);
    }, [currentHistoryEntry, protocols]);

    const NOTE_LABELS = [
        { id: 'progress', label: 'Progress' },
        { id: 'side_effects', label: 'Side Effects' },
        { id: 'adjustment', label: 'Adjustment' },
        { id: 'observation', label: 'Observation' },
        { id: 'question', label: 'Question' }
    ];

    const timelineEvents = useMemo(() => {
        if (!currentHistoryEntry) return [];
        const ev = [];
        const he = currentHistoryEntry;
        const lin = he.lineage || {};
        const protocolData = he.protocolData || {};
        const linkedItems = protocolData.linkedItems || {};
        const startDate = he.startDate;

        if (startDate) {
            const peptideNames = protocolData?.peptides?.map(p => p.name).filter(Boolean).join(', ');
            const doseInfo = protocolData?.peptides?.map(p => {
                if (!p.dosage?.amount) return null;
                return `${p.name || 'peptide'} @ ${p.dosage.amount} ${p.dosage.unit || 'mcg'}`;
            }).filter(Boolean).join(', ');
            ev.push({ date: startDate, sort: 0, type: 'start', icon: Play, label: 'Protocol started.', detail: doseInfo || peptideNames || null });
        }

        if (he.vials?.length > 0) {
            he.vials.forEach((v, i) => {
                const pepLin = Object.values(lin).find(l => l.vial?.stockpileId === v.vialId || l.vial?.stockpileId === v.stockpileId);
                const vendor = pepLin?.vendor?.name || pepLin?.vial?.vendor || v.vendor;
                const mg = pepLin?.vial?.mg || v.mg;
                const cost = pepLin?.vial?.cost || v.cost;
                const reconSnap = pepLin?.recon;
                const detail = [mg ? `${mg}mg` : null, vendor ? `from ${vendor}` : null, cost ? `$${Number(cost).toFixed(2)}` : null].filter(Boolean).join(' · ');
                ev.push({ date: startDate, sort: 1 + i, type: 'link', icon: Link2, label: `${v.name || 'Vial'} linked.`, detail: detail || null });
                if (reconSnap?.date) {
                    const reconDetail = [reconSnap.water ? `${reconSnap.water}mL BAC water` : null, reconSnap.concentration || null].filter(Boolean).join(' · ');
                    ev.push({ date: reconSnap.date, sort: 1.5 + i, type: 'recon', icon: Droplets, label: `${v.name || 'Vial'} reconstituted.`, detail: reconDetail || null });
                }
            });
        }

        Object.entries(linkedItems).forEach(([pepId, item]) => {
            const pep = protocolData?.peptides?.find(p => (p.id || `peptide-${(protocolData.peptides || []).indexOf(p)}`) === pepId);
            const dm = item.deliveryMethod;
            if (dm) {
                const method = dm.deliveryMethod === 'pipette' ? 'Syringe' : dm.deliveryMethod ? dm.deliveryMethod.charAt(0).toUpperCase() + dm.deliveryMethod.slice(1) : '';
                const route = dm.administrationRoute ? dm.administrationRoute.toUpperCase() : '';
                const pen = dm.penType ? `${dm.penType === 'bird-pen' ? 'Bird Pen' : dm.penType.charAt(0).toUpperCase() + dm.penType.slice(1)}` : '';
                if (method) ev.push({ date: startDate, sort: 2, type: 'delivery', icon: Pipette, label: `${pep?.name || 'Peptide'} delivery set to ${method}.`, detail: [route, pen].filter(Boolean).join(' · ') || null });
            }
            if (item.vialHistory?.length > 0) {
                item.vialHistory.forEach(hv => {
                    if (hv.usedAt) {
                        const finDetail = [hv.mg ? `${hv.mg}mg` : null, hv.vendor ? `from ${hv.vendor}` : null].filter(Boolean).join(' · ');
                        ev.push({ date: hv.usedAt, sort: 3, type: 'vial_finished', icon: CircleDot, label: `${hv.name || 'Vial'} marked as finished.`, detail: finDetail || null });
                    }
                });
            }
        });

        if (he.vialsAddedDuring?.length > 0) {
            he.vialsAddedDuring.forEach(v => {
                const addDetail = [v.mg ? `${v.mg}mg` : null, v.vendor ? `from ${v.vendor}` : null].filter(Boolean).join(' · ');
                ev.push({ date: v.addedDate || startDate, sort: 0, type: 'add_vial', icon: Plus, label: `${v.name || 'Vial'} added mid-protocol.`, detail: addDetail || null });
                if (v.reconstitutionDate) {
                    ev.push({ date: v.reconstitutionDate, sort: 0.5, type: 'recon', icon: Droplets, label: `${v.name || 'Vial'} reconstituted.`, detail: null });
                }
            });
        }

        if (he.phaseEvents?.length > 0) {
            he.phaseEvents.forEach(evt => {
                const phaseNum = (evt.phaseIndex ?? 0) + 1;
                const name = evt.peptideName || 'peptide';
                if (evt.type === 'held') {
                    ev.push({ date: evt.date, sort: 4, type: 'hold', icon: Pause, label: `Phase ${phaseNum} held for ${name}.`, detail: null });
                } else if (evt.type === 'resumed') {
                    ev.push({ date: evt.date, sort: 4, type: 'resumed', icon: Play, label: `Phase ${phaseNum} resumed for ${name}.`, detail: null });
                } else if (evt.type === 'next_phase') {
                    ev.push({ date: evt.date, sort: 4, type: 'next_phase', icon: SkipForward, label: `Phase ${phaseNum} skipped; Phase ${phaseNum + 1} started for ${name}.`, detail: null });
                } else if (evt.type === 'settings_change') {
                    ev.push({ date: evt.date, sort: 4, type: 'settings_change', icon: Edit3, label: evt.summary || 'Protocol settings updated.', detail: null });
                }
            });
        }

        if (he.notes?.length > 0) {
            he.notes.forEach(n => {
                const snippet = n.content ? (n.content.length > 50 ? n.content.slice(0, 50) + '...' : n.content) : '';
                const tagNames = n.tags?.length > 0 ? n.tags.map(tid => NOTE_LABELS.find(t => t.id === tid)?.label).filter(Boolean).join(', ') : null;
                if (n.type === 'follow_up') {
                    ev.push({ date: n.createdAt || n.linkedDate || he.endDate, sort: 10, type: 'follow_up', icon: Star, label: `Follow-up assessment added. ${snippet || ''}`.trim(), detail: tagNames });
                } else {
                    ev.push({ date: n.createdAt || n.linkedDate, sort: 0, type: 'note', icon: StickyNote, label: `Note added. ${snippet || ''}`.trim(), detail: tagNames });
                }
            });
        }

        if (he.endDate) {
            const endLabel = he.endType === 'completed' ? 'Protocol completed.' : he.endType === 'rescheduled' ? 'Stopped to reschedule.' : he.endType === 'manual' ? 'Protocol ended early.' : 'Protocol ended.';
            ev.push({ date: he.endDate, sort: 10, type: 'end', icon: CalendarX, label: endLabel, detail: null });
        }

        if (he.vialAssessment && Object.keys(he.vialAssessment).length > 0) {
            const count = Object.keys(he.vialAssessment).length;
            ev.push({
                date: he.endDate || he.startDate,
                sort: 6,
                type: 'assessment',
                icon: ClipboardCheck,
                label: `Vial assessment completed (${count} vial${count !== 1 ? 's' : ''}).`,
                detail: null
            });
        }

        ev.sort((a, b) => {
            const da = new Date(a.date || 0);
            const db = new Date(b.date || 0);
            if (da.getTime() !== db.getTime()) return db - da;
            return (b.sort || 0) - (a.sort || 0);
        });
        return ev;
    }, [currentHistoryEntry]);
    
    if (!open || !currentHistoryEntry) return null;
    
    const terracottaGradient = 'linear-gradient(135deg, #c87a5c 0%, #b5684a 100%)';
    const terracottaHoverGradient = 'linear-gradient(135deg, #b5684a 0%, #a35a3f 100%)';
    
    const handleEditFollowUp = () => {
        if (followUpNote) {
            setEditingNoteId(followUpNote.id);
        }
        setShowFollowUpModal(true);
    };
    
    const handleFollowUpClose = () => {
        setShowFollowUpModal(false);
        setEditingNoteId(null);
        window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
    };
    
    const handleDelete = () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        
        if (deleteProtocolHistoryEntry(currentHistoryEntry.id)) {
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
                detail: { message: 'History entry deleted successfully.', type: 'success' } 
            }));
            window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
            handleModalClose();
        } else {
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
                detail: { message: 'Failed to delete history entry.', type: 'error' } 
            }));
        }
    };

    const handleModalClose = () => {
        setConfirmDelete(false);
        onClose();
    };

    const handleRestore = () => {
        const washoutInfo = getActiveWashoutInfo(protocol);
        const confirmMsg = washoutInfo
            ? (washoutInfo.endsToday
                ? `${washoutInfo.name} is still in its washout period (ends today). Restore and reactivate anyway?`
                : `${washoutInfo.name} is still in its washout period (${washoutInfo.daysRemaining === 1 ? '1 day left' : `${washoutInfo.daysRemaining} days left`}, through ${washoutInfo.endLabel}). Restore and reactivate anyway?`)
            : 'Restore this protocol? It will become active again.';
        if (!window.confirm(confirmMsg)) return;

        const restored = restoreProtocolHistoryEntry(currentHistoryEntry.id);
        if (restored) {
            if (onRestore) {
                onRestore(currentHistoryEntry.protocolId, restored);
            }
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
                detail: { message: 'Protocol restored and reactivated!', type: 'success' } 
            }));
            window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
            onClose();
        } else {
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
                detail: { message: 'Failed to restore protocol.', type: 'error' } 
            }));
        }
    };

    const handleEdit = () => {
        if (onEdit && protocol) {
            onEdit(protocol);
            onClose();
        }
    };

    const { protocolData, startDate, endDate, completionStatus, vials, reconstitutionData, skippedReconstitution, vialsAddedDuring, notes, vialAssessment, endType, lineage } = currentHistoryEntry;

    const linkedItems = protocolData?.linkedItems || {};

    const getStatusInfo = () => {
        switch (completionStatus) {
            case 'completed':
                return { icon: CalendarCheck, color: '#10b981', label: 'Completed on Time', bgColor: theme.isDark ? '#3c4e3a' : '#607c5c', textColor: '#dcfce7' };
            case 'ended_early':
                return { icon: CalendarX, color: theme.textLight, label: 'Ended Early', bgColor: theme.isDark ? 'rgba(165,182,190,0.22)' : 'rgba(138, 128, 119, 0.16)', textColor: theme.isDark ? theme.accent : theme.text };
            case 'rescheduled':
                return { icon: CalendarClock, color: theme.warning, label: 'Rescheduled', bgColor: theme.isDark ? (theme.warningBg || 'rgba(120, 53, 15, 0.35)') : (theme.warningBg || '#FDF8E8'), textColor: theme.isDark ? theme.warning : (theme.text || '#1E2B2A') };
            case 'ended_reengagement':
                return { icon: CalendarClock, color: theme.primary || '#7F9E95', label: 'Closed on Return', bgColor: theme.isDark ? 'rgba(127,158,149,0.22)' : 'rgba(127,158,149,0.16)', textColor: theme.isDark ? theme.primary : (theme.primaryDark || theme.primary) };
            default:
                return { icon: Clock, color: theme.textLight, label: 'Unknown', bgColor: theme.secondary, textColor: theme.textLight };
        }
    };

    const getEndTypeLabel = () => {
        switch (endType) {
            case 'completed': return 'Auto-Completed';
            case 'manual': return 'Manually Ended';
            case 'rescheduled': return 'Stopped to reschedule';
            default: return null;
        }
    };

    const statusInfo = getStatusInfo();
    const StatusIcon = statusInfo.icon;
    const endTypeLabel = getEndTypeLabel();

    const getDuration = () => {
        if (!startDate) return 'N/A';
        if (!endDate) return 'Ongoing';
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        return `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    };

    const formatDeliveryMethod = (dm) => {
        if (!dm) return null;
        const method = dm.deliveryMethod === 'pipette' ? 'Syringe' :
                       dm.deliveryMethod === 'pen' ? 'Pen' :
                       dm.deliveryMethod === 'nasal' ? 'Nasal' :
                       dm.deliveryMethod === 'topical' ? 'Topical' :
                       dm.deliveryMethod || 'Not specified';
        return method;
    };

    const StatusBadge = ({ info, endLabel }) => (
        <div className="flex items-center gap-2 flex-wrap">
            <div
                className="px-2.5 py-1 rounded-lg flex items-center gap-1.5"
                style={{
                    backgroundColor: info.bgColor,
                    color: info.textColor,
                    boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.15), inset 0 1px 2px rgba(0, 0, 0, 0.1)'
                }}
            >
                <StatusIcon size={14} />
                <span className="font-medium text-xs">{info.label}</span>
            </div>
            {endLabel && (
                <div
                    className="px-2 py-0.5 rounded-md text-[10px] font-medium uppercase tracking-wider"
                    style={{
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        color: theme.textLight
                    }}
                >
                    {endLabel}
                </div>
            )}
        </div>
    );

    const footerContent = (
        <div className="flex items-center justify-between w-full">
            <button
                onClick={handleDelete}
                className="px-2 py-2 rounded-lg transition-all active:scale-95 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
                style={{ 
                    color: '#B5684A', // Terracotta color
                    backgroundColor: confirmDelete ? 'rgba(181, 104, 74, 0.1)' : 'transparent',
                    border: 'none',
                }}
            >
                <Trash2 size={14} />
                {confirmDelete ? 'Tap again to delete' : 'Delete'}
            </button>
            <div className="flex items-center gap-2">
                {onEdit && protocol && (
                    <button
                        onClick={handleEdit}
                        className="px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5"
                        style={{ 
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                            color: theme.text,
                            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'}`
                        }}
                    >
                        <Edit3 size={14} />
                        Edit Protocol
                    </button>
                )}
                {canRestore && onRestore && (
                    <button
                        onClick={handleRestore}
                        className="px-3 py-2 rounded-lg text-xs font-semibold transition-all active:scale-95 flex items-center gap-1.5 btn-primary-inset"
                        style={{ 
                            backgroundColor: theme.primary,
                            color: theme.textOnPrimary
                        }}
                    >
                        <RotateCcw size={14} />
                        Restore Protocol
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <BottomSheet
            open={open}
            onClose={handleModalClose}
            onBack={handleModalClose}
            title={`${protocolData?.protocolName || currentHistoryEntry?.protocolName || 'Protocol'} Cycle`}
            titleExtra={null}
            theme={theme}
            maxHeight="90vh"
            footer={footerContent}
        >
            <div className="space-y-0">
                {/* Date & Status — accordion */}
                <div className="rounded-lg border mb-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
                    <button
                        type="button"
                        onClick={() => setExpandedSections(prev => ({ ...prev, date: !prev.date }))}
                        className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                    >
                        <div className="flex items-center gap-3">
                            <Calendar size={20} style={{ color: theme.primary }} />
                            <div className="flex flex-col gap-0.5 text-left">
                                <h4 className="text-base font-semibold" style={{ color: theme.text }}>Date & Status</h4>
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>Range & completion</span>
                            </div>
                        </div>
                        {expandedSections.date ? <ChevronDown size={18} style={{ color: theme.textLight }} /> : <ChevronRight size={18} style={{ color: theme.textLight }} />}
                    </button>
                    <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSections.date ? '400px' : '0', opacity: expandedSections.date ? 1 : 0 }}>
                        <div className="px-3 pb-3 pt-1 border-t" style={{ borderColor: theme.border }}>
                            <div className="md:hidden">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium uppercase tracking-wider" style={{ color: theme.textLight }}>Date Range</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={14} style={{ color: theme.primary }} />
                                        <span className="text-sm font-semibold" style={{ color: theme.text }}>{getDuration()}</span>
                                    </div>
                                </div>
                                <div className="mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="text-sm font-semibold" style={{ color: theme.text }}>{formatMMDDYYYY(startDate)}</div>
                                        {endDate && (<><div className="flex-1 h-px" style={{ backgroundColor: theme.border }} /><div className="text-sm font-semibold" style={{ color: theme.text }}>{formatMMDDYYYY(endDate)}</div></>)}
                                    </div>
                                </div>
                                <div className="flex items-center justify-center mt-2 pt-2" style={{ borderTop: `1px solid ${theme.border}` }}><StatusBadge info={statusInfo} endLabel={endTypeLabel} /></div>
                            </div>
                            <div className="hidden md:grid grid-cols-3 gap-4">
                                <div className="p-3 rounded-lg content-section">
                                    <div className="flex items-center gap-2 mb-1.5"><Calendar size={16} style={{ color: theme.primary }} /><span className="text-xs font-medium uppercase tracking-wider" style={{ color: theme.textLight }}>Start Date</span></div>
                                    <div className="text-sm font-semibold" style={{ color: theme.text }}>{formatMMDDYYYY(startDate)}</div>
                                </div>
                                {endDate && (
                                    <div className="p-4 rounded-lg content-section">
                                        <div className="flex items-center gap-2 mb-1.5"><Calendar size={16} style={{ color: theme.primary }} /><span className="text-xs font-medium uppercase tracking-wider" style={{ color: theme.textLight }}>End Date</span></div>
                                        <div className="text-sm font-semibold" style={{ color: theme.text }}>{formatMMDDYYYY(endDate)}</div>
                                    </div>
                                )}
                                <div className="p-3 rounded-lg content-section">
                                    <div className="flex items-center gap-2 mb-1.5"><Clock size={16} style={{ color: theme.primary }} /><span className="text-xs font-medium uppercase tracking-wider" style={{ color: theme.textLight }}>Duration</span></div>
                                    <div className="text-sm font-semibold mb-2" style={{ color: theme.text }}>{getDuration()}</div>
                                    <div className="flex items-center justify-end mt-1.5 pt-1.5" style={{ borderTop: `1px solid ${theme.border}` }}><StatusBadge info={statusInfo} endLabel={endTypeLabel} /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Protocol Activity — accordion */}
                {timelineEvents.length > 0 && (() => {
                    const getTimelineColor = (idx, total) => {
                        const light = [127, 158, 149];
                        const dark = [68, 89, 82];
                        const t = total <= 1 ? 0 : idx / (total - 1);
                        const r = Math.round(light[0] + (dark[0] - light[0]) * t);
                        const g = Math.round(light[1] + (dark[1] - light[1]) * t);
                        const b = Math.round(light[2] + (dark[2] - light[2]) * t);
                        return `rgb(${r}, ${g}, ${b})`;
                    };
                    return (
                        <div className="rounded-lg border mb-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
                            <button
                                type="button"
                                onClick={() => setExpandedSections(prev => ({ ...prev, activity: !prev.activity }))}
                                className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                            >
                                <div className="flex items-center gap-3">
                                    <Clock size={20} style={{ color: '#445952' }} />
                                    <div className="flex flex-col gap-0.5 text-left">
                                        <h4 className="text-base font-semibold" style={{ color: theme.text }}>Protocol Activity</h4>
                                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>Most recent first</span>
                                    </div>
                                </div>
                                {expandedSections.activity ? <ChevronDown size={18} style={{ color: theme.textLight }} /> : <ChevronRight size={18} style={{ color: theme.textLight }} />}
                            </button>
                            <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSections.activity ? '2000px' : '0', opacity: expandedSections.activity ? 1 : 0 }}>
                                <div className="px-3 pb-3 pt-2 border-t space-y-0" style={{ borderColor: theme.border }}>
                                {timelineEvents.map((ev, idx) => {
                                    const Icon = ev.icon;
                                    const isLast = idx === timelineEvents.length - 1;
                                    const sageColor = getTimelineColor(idx, timelineEvents.length);
                                    return (
                                        <div key={idx}>
                                            <div
                                                className="flex items-start gap-3 p-2.5 rounded-lg"
                                                style={{
                                                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.008)',
                                                }}
                                            >
                                                <div
                                                    className="flex-shrink-0 w-[28px] h-[28px] rounded-full flex items-center justify-center mt-0.5"
                                                    style={{
                                                        backgroundColor: sageColor + '20',
                                                        border: `1.5px solid ${sageColor}50`,
                                                    }}
                                                >
                                                    <Icon size={14} style={{ color: sageColor }} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <span className="text-xs font-medium leading-snug" style={{ color: theme.text }}>{ev.label}</span>
                                                        {ev.date && <span className="text-[10px] flex-shrink-0 tabular-nums pt-px" style={{ color: theme.textLight }}>{formatMMDDYYYY(ev.date)}</span>}
                                                    </div>
                                                    {ev.detail && (
                                                        <div className="text-[11px] mt-0.5 leading-snug" style={{ color: theme.textLight }}>{ev.detail}</div>
                                                    )}
                                                </div>
                                            </div>
                                            {!isLast && (
                                                <div className="flex items-center gap-3 py-1 mx-1">
                                                    <div className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent, ${theme.isDark ? 'rgba(127,158,149,0.3)' : 'rgba(68,89,82,0.15)'} 25%, ${theme.isDark ? 'rgba(127,158,149,0.3)' : 'rgba(68,89,82,0.15)'} 75%, transparent)` }} />
                                                    <ChevronUp size={14} style={{ color: sageColor, opacity: 0.5 }} />
                                                    <div className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent, ${theme.isDark ? 'rgba(127,158,149,0.3)' : 'rgba(68,89,82,0.15)'} 25%, ${theme.isDark ? 'rgba(127,158,149,0.3)' : 'rgba(68,89,82,0.15)'} 75%, transparent)` }} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Peptide(s) — accordion */}
                {protocolData?.peptides && protocolData.peptides.length > 0 && (
                    <div className="rounded-lg border mb-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
                        <button
                            type="button"
                            onClick={() => setExpandedSections(prev => ({ ...prev, peptides: !prev.peptides }))}
                            className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                        >
                            <div className="flex items-center gap-3">
                                <Pill size={20} style={{ color: theme.primary }} />
                                <div className="flex flex-col gap-0.5 text-left">
                                    <h4 className="text-base font-semibold" style={{ color: theme.text }}>Peptide(s)</h4>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>Dosage & schedule</span>
                                </div>
                            </div>
                            {expandedSections.peptides ? <ChevronDown size={18} style={{ color: theme.textLight }} /> : <ChevronRight size={18} style={{ color: theme.textLight }} />}
                        </button>
                        <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSections.peptides ? '800px' : '0', opacity: expandedSections.peptides ? 1 : 0 }}>
                            <div className="px-3 pb-3 pt-2 border-t space-y-2" style={{ borderColor: theme.border }}>
                            {protocolData.peptides.map((pep, idx) => {
                                const formatFrequency = (freq) => {
                                    if (!freq) return null;
                                    if (typeof freq === 'string') return freq;
                                    const parts = [];
                                    if (freq.type) parts.push(freq.type.replace(/_/g, ' '));
                                    if (freq.days && Array.isArray(freq.days) && freq.days.length > 0) parts.push(freq.days.join(', '));
                                    if (freq.onDays && freq.offDays) parts.push(`${freq.onDays} on / ${freq.offDays} off`);
                                    if (freq.time && typeof freq.time === 'string') parts.push(freq.time);
                                    return parts.length > 0 ? parts.join(' - ') : freq.type || 'Custom';
                                };
                                const formatTime = (t) => {
                                    if (!t) return null;
                                    if (typeof t === 'string') return t;
                                    if (typeof t === 'object') return JSON.stringify(t);
                                    return String(t);
                                };
                                const freqLabel = formatFrequency(pep.frequency);
                                const doseLabel = pep.dosage ? `${pep.dosage.amount} ${pep.dosage.unit}` : null;
                                const subtitle = [doseLabel, freqLabel].filter(Boolean).join(' · ');

                                return (
                                    <div key={idx} className="p-3 rounded-lg content-section">
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="font-medium text-sm" style={{ color: theme.text }}>{pep.name || 'Unnamed'}</div>
                                            {doseLabel && (
                                                <div className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: theme.primary + '15', color: theme.primary }}>
                                                    {doseLabel}
                                                </div>
                                            )}
                                        </div>
                                        {subtitle && (
                                            <div className="text-xs mb-1" style={{ color: theme.textLight }}>{subtitle}</div>
                                        )}
                                        {(pep.count || pep.per || pep.time || pep.schedule) && (
                                            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs mt-1" style={{ color: theme.textLight }}>
                                                {(pep.count || pep.per) && (
                                                    <span>{pep.count || ''}{pep.per ? `x per ${pep.per}` : ''}</span>
                                                )}
                                                {pep.time && <span>{formatTime(pep.time)}</span>}
                                                {pep.schedule && Array.isArray(pep.schedule) && (
                                                    <span>{pep.schedule.join(', ')}</span>
                                                )}
                                                {pep.schedule && typeof pep.schedule === 'string' && (
                                                    <span>{pep.schedule}</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            </div>
                        </div>
                    </div>
                )}

                {/* Vials — accordion */}
                {((vials && vials.length > 0) || (vialsAddedDuring && vialsAddedDuring.length > 0)) && (
                    <div className="rounded-lg border mb-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
                        <button
                            type="button"
                            onClick={() => setExpandedSections(prev => ({ ...prev, vials: !prev.vials }))}
                            className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                        >
                            <div className="flex items-center gap-3">
                                <Package size={20} style={{ color: theme.primary }} />
                                <div className="flex flex-col gap-0.5 text-left">
                                    <h4 className="text-base font-semibold" style={{ color: theme.text }}>Vials</h4>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>Stockpile & assessment</span>
                                </div>
                            </div>
                            {expandedSections.vials ? <ChevronDown size={18} style={{ color: theme.textLight }} /> : <ChevronRight size={18} style={{ color: theme.textLight }} />}
                        </button>
                        <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSections.vials ? '2000px' : '0', opacity: expandedSections.vials ? 1 : 0 }}>
                            <div className="px-3 pb-3 pt-2 border-t space-y-2" style={{ borderColor: theme.border }}>
                            {vials && vials.length > 0 && vials.map((vial, index) => {
                                const stockpileItem = stockpile?.find(s => s.id === vial.vialId || s.id === vial.stockpileId);
                                const assessment = vialAssessment?.[vial.vialId];
                                const pepLineage = lineage ? Object.values(lineage).find(l => l.vial?.stockpileId === vial.vialId || l.vial?.stockpileId === vial.stockpileId) : null;
                                const orderInfo = pepLineage?.order;
                                const vendorInfo = pepLineage?.vendor || (pepLineage?.vial ? { name: pepLineage.vial.vendor } : null);
                                return (
                                    <div key={`v-${index}`} className="p-3 rounded-lg content-section">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <div className="font-medium text-sm" style={{ color: theme.text }}>
                                                {vial.name || stockpileItem?.name || 'Unknown Peptide'}
                                            </div>
                                            {assessment && (
                                                <div
                                                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1"
                                                    style={{
                                                        backgroundColor: assessment.status === 'fully_used'
                                                            ? (theme.isDark ? '#22543d' : '#d1fae5')
                                                            : (theme.isDark ? '#78350f' : '#fef3c7'),
                                                        color: assessment.status === 'fully_used'
                                                            ? (theme.isDark ? '#86efac' : '#065f46')
                                                            : (theme.isDark ? '#fcd34d' : '#92400e'),
                                                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
                                                    }}
                                                >
                                                    {assessment.status === 'fully_used' ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                                                    {assessment.status === 'fully_used' ? 'Used' : 'Leftover'}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-3 text-xs" style={{ color: theme.textLight }}>
                                            {(pepLineage?.vial?.mg || vial.mg) && <span className="flex items-center gap-1"><FlaskConical size={11} />{pepLineage?.vial?.mg || vial.mg}mg</span>}
                                            {(vendorInfo?.name || vial.vendor) && <span className="flex items-center gap-1"><Store size={11} />{vendorInfo?.name || vial.vendor}</span>}
                                            {(pepLineage?.vial?.cost || vial.cost) && <span className="flex items-center gap-1"><DollarSign size={11} />${Number(pepLineage?.vial?.cost || vial.cost).toFixed(2)}</span>}
                                            {vial.reconstitutionDate && <span>Recon: {formatMMDDYYYY(vial.reconstitutionDate)}</span>}
                                        </div>
                                        {orderInfo && (
                                            <div className="flex flex-wrap gap-3 text-xs mt-1.5 pt-1.5" style={{ color: theme.textLight, borderTop: `1px solid ${theme.border}` }}>
                                                <span className="flex items-center gap-1"><Truck size={11} />Order {orderInfo.orderNumber || orderInfo.id?.slice(-6)}</span>
                                                {orderInfo.date && <span>{formatMMDDYYYY(orderInfo.date)}</span>}
                                                {orderInfo.tracking && <span className="truncate max-w-[120px]">Track: {orderInfo.tracking}</span>}
                                                {orderInfo.status && (
                                                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium uppercase" style={{ backgroundColor: theme.primary + '15', color: theme.primary }}>
                                                        {orderInfo.status}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                        {assessment?.notes && (
                                            <div className="mt-1 text-xs italic" style={{ color: theme.textLight }}>{assessment.notes}</div>
                                        )}
                                    </div>
                                );
                            })}
                            {/* Finished vials from vialHistory */}
                            {(() => {
                                const allFinished = Object.values(linkedItems).flatMap(item =>
                                    (item.vialHistory || []).map(hv => hv)
                                ).filter(hv => hv.usedAt);
                                if (allFinished.length === 0) return null;
                                return (
                                    <>
                                        <div className="text-[10px] font-medium uppercase tracking-wider mt-2 ml-1" style={{ color: theme.textLight }}>Finished during protocol</div>
                                        {allFinished.map((hv, idx) => (
                                            <div key={`hv-${idx}`} className="p-3 rounded-lg content-section" style={{ opacity: 0.55 }}>
                                                <div className="flex items-center justify-between mb-0.5">
                                                    <div className="font-medium text-sm line-through" style={{ color: theme.textLight }}>
                                                        {hv.name || 'Unknown Peptide'}
                                                    </div>
                                                    <div className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', color: theme.textLight }}>
                                                        Used
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-3 text-xs" style={{ color: theme.textLight }}>
                                                    {hv.mg && <span className="flex items-center gap-1"><FlaskConical size={11} />{hv.mg}mg</span>}
                                                    {hv.vendor && <span className="flex items-center gap-1"><Store size={11} />{hv.vendor}</span>}
                                                    {hv.cost && <span className="flex items-center gap-1"><DollarSign size={11} />${Number(hv.cost).toFixed(2)}</span>}
                                                    {hv.usedAt && <span>Finished: {formatMMDDYYYY(hv.usedAt)}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                );
                            })()}

                            {vialsAddedDuring && vialsAddedDuring.length > 0 && (
                                <>
                                    <div className="text-[10px] font-medium uppercase tracking-wider mt-2 ml-1" style={{ color: theme.textLight }}>Added during protocol</div>
                                    {vialsAddedDuring.map((vial, index) => {
                                        const stockpileItem = stockpile?.find(s => s.id === vial.vialId || s.id === vial.stockpileId);
                                        return (
                                            <div key={`va-${index}`} className="p-3 rounded-lg content-section">
                                                <div className="font-medium text-sm mb-0.5" style={{ color: theme.text }}>
                                                    {vial.name || stockpileItem?.name || 'Unknown Peptide'}
                                                </div>
                                                <div className="flex flex-wrap gap-3 text-xs" style={{ color: theme.textLight }}>
                                                    {vial.mg && <span className="flex items-center gap-1"><FlaskConical size={11} />{vial.mg}mg</span>}
                                                    {vial.vendor && <span>{vial.vendor}</span>}
                                                    {vial.addedDate && <span>Added: {formatMMDDYYYY(vial.addedDate)}</span>}
                                                    {vial.reconstitutionDate && <span>Recon: {formatMMDDYYYY(vial.reconstitutionDate)}</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Delivery & Recon — accordion */}
                {(Object.keys(linkedItems).length > 0 || reconstitutionData || (skippedReconstitution && Object.keys(skippedReconstitution).length > 0)) && (
                    <div className="rounded-lg border mb-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
                        <button
                            type="button"
                            onClick={() => setExpandedSections(prev => ({ ...prev, delivery: !prev.delivery }))}
                            className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                        >
                            <div className="flex items-center gap-3">
                                <Link2 size={20} style={{ color: theme.primary }} />
                                <div className="flex flex-col gap-0.5 text-left">
                                    <h4 className="text-base font-semibold" style={{ color: theme.text }}>Delivery & Recon</h4>
                                    <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>Methods & documentation</span>
                                </div>
                            </div>
                            {expandedSections.delivery ? <ChevronDown size={18} style={{ color: theme.textLight }} /> : <ChevronRight size={18} style={{ color: theme.textLight }} />}
                        </button>
                        <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSections.delivery ? '1500px' : '0', opacity: expandedSections.delivery ? 1 : 0 }}>
                            <div className="px-3 pb-3 pt-2 border-t space-y-2" style={{ borderColor: theme.border }}>
                            {Object.entries(linkedItems).map(([peptideId, item]) => {
                                const peptide = protocolData?.peptides?.find(p => (p.id || `peptide-${protocolData.peptides.indexOf(p)}`) === peptideId);
                                const deliveryMethod = item.deliveryMethod;
                                if (!deliveryMethod && item.status !== 'linked' && item.status !== 'skipped') return null;
                                const statusLabel = item.status === 'linked' ? 'Linked' : item.status === 'skipped' ? 'Skipped Recon' : item.status || 'N/A';
                                const deliveryLabel = formatDeliveryMethod(deliveryMethod);
                                const routeLabel = deliveryMethod?.administrationRoute?.toUpperCase();
                                const infoLine = [deliveryLabel, routeLabel].filter(Boolean).join(' · ');
                                const pepLineage = lineage?.[peptideId];
                                const reconSnapshot = pepLineage?.recon;
                                return (
                                    <div key={peptideId} className="p-3 rounded-lg content-section">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <div className="font-medium text-sm" style={{ color: theme.text }}>{peptide?.name || 'Peptide'}</div>
                                            <div className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: theme.primary + '15', color: theme.primary }}>{statusLabel}</div>
                                        </div>
                                        {infoLine && <div className="text-xs" style={{ color: theme.textLight }}>{infoLine}</div>}
                                        {deliveryMethod?.penType && (
                                            <div className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                                                Pen: {deliveryMethod.penType === 'bird-pen' ? 'Bird Pen' : deliveryMethod.penType.charAt(0).toUpperCase() + deliveryMethod.penType.slice(1)}
                                                {deliveryMethod.penColor ? ` (${deliveryMethod.penColor})` : ''}
                                            </div>
                                        )}
                                        {reconSnapshot && (
                                            <div className="flex flex-wrap gap-3 text-xs mt-1.5 pt-1.5" style={{ color: theme.textLight, borderTop: `1px solid ${theme.border}` }}>
                                                {reconSnapshot.water && <span className="flex items-center gap-1"><Droplets size={11} />{reconSnapshot.water}mL BAC water</span>}
                                                {reconSnapshot.concentration && <span>{reconSnapshot.concentration}</span>}
                                                {reconSnapshot.reconStrategy && <span className="capitalize">{reconSnapshot.reconStrategy}</span>}
                                                {reconSnapshot.date && <span>Recon: {formatMMDDYYYY(reconSnapshot.date)}</span>}
                                            </div>
                                        )}
                                        {item.documentation && Array.isArray(item.documentation) && item.documentation.length > 0 && (
                                            <div className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                                                {item.documentation.length} file{item.documentation.length !== 1 ? 's' : ''} attached
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {reconstitutionData && (
                                <div className="p-3 rounded-lg content-section">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <div className="font-medium text-sm" style={{ color: theme.text }}>Reconstitution</div>
                                        {reconstitutionData.reconStrategy && (
                                            <div className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: theme.primary + '15', color: theme.primary }}>
                                                {reconstitutionData.reconStrategy === 'separate' ? 'Separate' : 'Blended'}
                                            </div>
                                        )}
                                    </div>
                                    {reconstitutionData.date && (
                                        <div className="text-xs" style={{ color: theme.textLight }}>Reconstituted: {formatMMDDYYYY(reconstitutionData.date)}</div>
                                    )}
                                </div>
                            )}
                            {skippedReconstitution && Object.entries(skippedReconstitution).map(([peptideId, data]) => (
                                <div key={`sr-${peptideId}`} className="p-3 rounded-lg content-section">
                                    <div className="flex items-center justify-between mb-0.5">
                                        <div className="font-medium text-sm" style={{ color: theme.text }}>{data.peptideName || 'Unknown'}</div>
                                        <div className="px-2 py-0.5 rounded-md text-[10px] font-semibold" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)', color: theme.textLight }}>Skipped</div>
                                    </div>
                                    {data.deliveryMethod && (
                                        <div className="text-xs" style={{ color: theme.textLight }}>
                                            {formatDeliveryMethod(data.deliveryMethod)}
                                            {data.deliveryMethod.administrationRoute ? ` · ${data.deliveryMethod.administrationRoute.toUpperCase()}` : ''}
                                        </div>
                                    )}
                                </div>
                            ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* Assessment — accordion */}
                <div className="rounded-lg border mb-4" style={{ borderColor: theme.border, backgroundColor: theme.cardBackground }}>
                    <button
                        type="button"
                        onClick={() => setExpandedSections(prev => ({ ...prev, assessment: !prev.assessment }))}
                        className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                    >
                        <div className="flex items-center gap-3">
                            <Star size={20} style={{ color: theme.primary }} />
                            <div className="flex flex-col gap-0.5 text-left">
                                <h4 className="text-base font-semibold" style={{ color: theme.text }}>Assessment</h4>
                                <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>Follow-up & notes</span>
                            </div>
                        </div>
                        {expandedSections.assessment ? <ChevronDown size={18} style={{ color: theme.textLight }} /> : <ChevronRight size={18} style={{ color: theme.textLight }} />}
                    </button>
                    <div className="overflow-hidden transition-all duration-300" style={{ maxHeight: expandedSections.assessment ? '2000px' : '0', opacity: expandedSections.assessment ? 1 : 0 }}>
                        <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: theme.border }}>
                    {followUpNote ? (
                        <div className="mb-3">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: theme.textLight }}>Follow-Up</span>
                                <button
                                    onClick={handleEditFollowUp}
                                    className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 btn-primary-inset"
                                    style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}
                                >
                                    <Edit3 size={11} />
                                    Edit
                                </button>
                            </div>
                            <div
                                className="p-4 rounded-lg content-section"
                                style={{ borderLeft: `3px solid ${theme.primary}` }}
                            >
                                {followUpNote.rating && (
                                    <div className="mb-2 flex items-center gap-2">
                                        <div className="flex items-center gap-0.5">
                                            {[1, 2, 3, 4, 5].map(n => (
                                                <Star key={n} size={16} style={{ fill: followUpNote.rating >= n ? theme.primary : 'none', color: followUpNote.rating >= n ? theme.primary : (theme.isDark ? '#4b5563' : theme.border), strokeWidth: 1.5 }} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {followUpNote.content && (
                                    <p className="text-sm whitespace-pre-wrap mb-2" style={{ color: theme.text }}>{followUpNote.content}</p>
                                )}
                                {followUpNote.tags && followUpNote.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {followUpNote.tags.map(tagId => (
                                            <span key={tagId} className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: theme.primary + '20', color: theme.primary }}>
                                                {tagId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {followUpNote.linkedDate && (
                                    <div className="mt-2 text-xs flex items-center gap-1" style={{ color: theme.textLight }}>
                                        <Calendar size={12} />
                                        Linked: {formatMMDDYYYY(followUpNote.linkedDate)}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="mb-3 flex justify-center">
                            <button
                                onClick={handleEditFollowUp}
                                className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 btn-primary-inset"
                                style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}
                            >
                                <Edit3 size={16} />
                                Add Follow-Up Assessment
                            </button>
                        </div>
                    )}

                    {Array.isArray(notes) && notes.length > 0 && (
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: theme.textLight }}>Notes ({notes.length})</span>
                                <div className="flex items-center gap-2">
                                    {!followUpNote && (
                                        <button
                                            onClick={handleEditFollowUp}
                                            className="px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 btn-primary-inset"
                                            style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}
                                        >
                                            <Edit3 size={11} />
                                            Follow-Up
                                        </button>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                        <Filter size={12} style={{ color: theme.textLight }} />
                                        <div className="w-44 sm:w-48">
                                            <CustomDropdown
                                                value={noteFilter}
                                                onChange={setNoteFilter}
                                                options={[
                                                    { value: 'all', label: 'All Notes' },
                                                    { value: 'during', label: 'During Protocol' },
                                                    { value: 'follow_up', label: 'Follow-Up' }
                                                ]}
                                                theme={theme}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        <div className="space-y-2">
                            {filteredNotes.length === 0 ? (
                                <div className="text-center py-4 text-sm" style={{ color: theme.textLight }}>
                                    No {noteFilter === 'all' ? '' : noteFilter === 'during' ? 'during protocol ' : 'follow-up '}notes found.
                                </div>
                            ) : (
                                filteredNotes.map((note) => (
                                    <div
                                        key={note.id}
                                        className="p-4 rounded-lg content-section"
                                        style={{ borderLeft: `4px solid ${note.type === 'follow_up' ? theme.primary : theme.accent}` }}
                                    >
                                        <div className="flex items-start justify-between gap-2 mb-1.5">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1.5">
                                                    <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: note.type === 'follow_up' ? theme.primary + '20' : theme.accent + '20', color: note.type === 'follow_up' ? theme.primary : theme.accent }}>
                                                        {note.type === 'follow_up' ? 'Follow-Up' : 'During Protocol'}
                                                    </span>
                                                    <span className="text-xs" style={{ color: theme.textLight }}>{formatMMDDYYYY(note.createdAt)}</span>
                                                    {note.linkedDate && (
                                                        <span className="text-xs flex items-center gap-1" style={{ color: theme.textLight }}>
                                                            <Calendar size={12} />{formatMMDDYYYY(note.linkedDate)}
                                                        </span>
                                                    )}
                                                    {note.rating && (
                                                        <span className="text-xs flex items-center gap-1" style={{ color: theme.textLight }}>
                                                            {[1, 2, 3, 4, 5].slice(0, note.rating).map(n => (
                                                                <Star key={n} size={12} style={{ fill: theme.primary, color: theme.primary }} />
                                                            ))}
                                                        </span>
                                                    )}
                                                </div>
                                                {note.content && (
                                                    <p className="text-sm whitespace-pre-wrap" style={{ color: theme.text }}>{note.content}</p>
                                                )}
                                                {note.tags && note.tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                        {note.tags.map(tagId => (
                                                            <span key={tagId} className="px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: theme.primary + '20', color: theme.primary }}>
                                                                {tagId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Follow-Up Modal */}
            {protocol && (
                <ProtocolFollowUpModal
                    open={showFollowUpModal}
                    onClose={handleFollowUpClose}
                    protocol={protocol}
                    historyEntryId={currentHistoryEntry.id}
                    theme={theme}
                    onSave={() => {
                        setRefreshKey(prev => prev + 1);
                        handleFollowUpClose();
                    }}
                    existingNoteId={editingNoteId}
                />
            )}
        </BottomSheet>
    );
}
