import React, { useState, useMemo, useEffect } from 'react';
import BottomSheet from '../common/BottomSheet';
import { FileText, Star, X, Save, Calendar, CheckCircle, XCircle, CalendarClock, Clock, Lightbulb, Target, Tag, StickyNote, AlertCircle, RotateCcw, TrendingUp, Award, DollarSign, ThumbsDown, ThumbsUp, Users, Ban, Timer } from 'lucide-react';
import { formatMMDDYYYY, getLocalDateString } from '../../utils/date';

// Helper function for MM/DD/YY format
const formatMMDDYY = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString);
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const y = String(date.getFullYear()).slice(-2);
        return `${m}/${d}/${y}`;
    } catch {
        return dateString;
    }
};
import { addNoteToProtocolHistory, updateNoteInProtocolHistory, getProtocolHistory } from '../../utils/protocolHistory';
import GlassmorphismDatePicker from '../common/GlassmorphismDatePicker';

const QUICK_TAGS = [
    { id: 'met_goals', label: 'Met Goals', icon: Target },
    { id: 'side_effects', label: 'Side Effects', icon: AlertCircle },
    { id: 'will_repeat', label: 'Will Repeat', icon: RotateCcw },
    { id: 'adjustments_needed', label: 'Adjustments Needed', icon: TrendingUp },
    { id: 'positive_results', label: 'Positive Results', icon: TrendingUp },
    { id: 'no_results', label: 'No Results', icon: XCircle },
    { id: 'exceeded_expectations', label: 'Exceeded Expectations', icon: Award },
    { id: 'adherence_issues', label: 'Adherence Issues', icon: AlertCircle },
    { id: 'cost_effective', label: 'Cost Effective', icon: DollarSign },
    { id: 'not_cost_effective', label: 'Not Cost Effective', icon: ThumbsDown },
    { id: 'easy_to_follow', label: 'Easy to Follow', icon: ThumbsUp },
    { id: 'complex_schedule', label: 'Complex Schedule', icon: Calendar },
    { id: 'recommend_to_others', label: 'Recommend to Others', icon: Users },
    { id: 'would_not_repeat', label: 'Would Not Repeat', icon: Ban },
    { id: 'needs_more_time', label: 'Needs More Time', icon: Timer }
];

export default function ProtocolFollowUpModal({ open, onClose, protocol, historyEntryId, theme, onSave, existingNoteId = null }) {
    const [content, setContent] = useState('');
    const [selectedTags, setSelectedTags] = useState([]);
    const [rating, setRating] = useState(0);
    const [linkedDate, setLinkedDate] = useState(getLocalDateString());
    const [showLinkedDate, setShowLinkedDate] = useState(true); // Default to checked

    // Load existing follow-up note if editing
    React.useEffect(() => {
        if (open && existingNoteId && historyEntryId) {
            const allHistory = getProtocolHistory();
            const entry = allHistory.find(e => e.id === historyEntryId);
            if (entry && Array.isArray(entry.notes)) {
                const followUpNote = entry.notes.find(n => n.id === existingNoteId && n.type === 'follow_up');
                if (followUpNote) {
                    setContent(followUpNote.content || '');
                    setSelectedTags(followUpNote.tags || []);
                    setRating(followUpNote.rating || 0);
                    setLinkedDate(followUpNote.linkedDate || getLocalDateString());
                    setShowLinkedDate(!!followUpNote.linkedDate);
                }
            }
        } else if (open && !existingNoteId) {
            // Reset form for new follow-up
            setContent('');
            setSelectedTags([]);
            setRating(0);
            setLinkedDate(getLocalDateString());
            setShowLinkedDate(true); // Default to checked
        }
    }, [open, existingNoteId, historyEntryId]);
    const [currentSuggestionIndex, setCurrentSuggestionIndex] = useState(0);
    const [fadeIn, setFadeIn] = useState(true);

    // Writing prompts to help users
    const writingPrompts = [
        'What were the main outcomes or results you observed?',
        'Did you experience any side effects or reactions?',
        'How did your adherence compare to the planned schedule?',
        'Would you repeat this protocol? Why or why not?',
        'What adjustments would you make if running this again?',
        'How did you feel overall during this research period?',
        'Did you notice any changes in your research metrics?',
        'What was the most notable aspect of this protocol?',
        'Were there any challenges or obstacles encountered?',
        'How does this compare to previous research protocols?'
    ];

    // Auto-rotate suggestions every 4 seconds
    useEffect(() => {
        const interval = setInterval(() => {
            setFadeIn(false);
            setTimeout(() => {
                setCurrentSuggestionIndex((prev) => (prev + 1) % writingPrompts.length);
                setFadeIn(true);
            }, 200);
        }, 4000);

        return () => clearInterval(interval);
    }, [writingPrompts.length]);

    // Get history entry to access dates and completion status
    const historyEntry = useMemo(() => {
        if (!historyEntryId) return null;
        const allHistory = getProtocolHistory();
        return allHistory.find(entry => entry.id === historyEntryId);
    }, [historyEntryId]);

    // Calculate duration and get status info
    const protocolInfo = useMemo(() => {
        if (!historyEntry) return null;

        const startDate = historyEntry.startDate;
        const endDate = historyEntry.endDate;
        const completionStatus = historyEntry.completionStatus || 'unknown';

        // Calculate duration
        let duration = 'N/A';
        const isActive = !endDate; // Active protocol has no endDate
        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffTime = Math.abs(end - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
            duration = `${diffDays} day${diffDays !== 1 ? 's' : ''}`;
        } else if (startDate && isActive) {
            // Calculate days since start for active protocols
            const start = new Date(startDate);
            const today = new Date();
            const diffTime = Math.abs(today - start);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            duration = `${diffDays} day${diffDays !== 1 ? 's' : ''} (Active)`;
        }

        // Get status badge info
        let statusInfo = {
            icon: Clock,
            label: isActive ? 'Active' : 'Unknown',
            bgColor: isActive ? (theme.isDark ? '#1e3a2e' : '#d1fae5') : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)'),
            textColor: isActive ? (theme.isDark ? '#86efac' : '#065f46') : theme.textLight
        };

        if (isActive) {
            // Active protocol - use active status
            statusInfo = {
                icon: Clock,
                label: 'Active',
                bgColor: theme.isDark ? '#1e3a2e' : '#d1fae5',
                textColor: theme.isDark ? '#86efac' : '#065f46'
            };
        } else {
            // Completed protocol - use completion status
            switch (completionStatus) {
                case 'completed':
                    statusInfo = {
                        icon: CheckCircle,
                        label: 'Completed',
                        bgColor: theme.isDark ? '#3c4e3a' : '#607c5c',
                        textColor: '#dcfce7'
                    };
                    break;
                case 'ended_early':
                    statusInfo = {
                        icon: XCircle,
                        label: 'Ended Early',
                        bgColor: theme.isDark ? 'rgba(165,182,190,0.22)' : 'rgba(138, 128, 119, 0.16)',
                        textColor: theme.isDark ? theme.accent : theme.text
                    };
                    break;
                case 'rescheduled':
                    statusInfo = {
                        icon: CalendarClock,
                        label: 'Rescheduled',
                        bgColor: theme.isDark ? (theme.warningBg || 'rgba(120, 53, 15, 0.35)') : (theme.warningBg || '#FDF8E8'),
                        textColor: theme.isDark ? theme.warning : (theme.text || '#1E2B2A')
                    };
                    break;
                case 'ended_reengagement':
                    statusInfo = {
                        icon: CalendarClock,
                        label: 'Closed on Return',
                        bgColor: theme.isDark ? 'rgba(127,158,149,0.22)' : 'rgba(127,158,149,0.16)',
                        textColor: theme.isDark ? theme.primary : (theme.primaryDark || theme.primary)
                    };
                    break;
            }
        }

        return {
            startDate,
            endDate,
            duration,
            statusInfo
        };
    }, [historyEntry, theme]);

    const handleTagToggle = (tagId) => {
        setSelectedTags(prev => 
            prev.includes(tagId) 
                ? prev.filter(id => id !== tagId)
                : [...prev, tagId]
        );
    };

    const handleSave = () => {
        // If user clicks "Skip for Now", we don't save anything - just close
        // This is handled by handleClose, not handleSave
        if (!content.trim() && selectedTags.length === 0 && rating === 0) {
            // Allow saving empty if user just wants to close
            onClose();
            return;
        }

        if (historyEntryId) {
            const noteData = {
                type: 'follow_up',
                content: content.trim(),
                tags: selectedTags,
                linkedDate: showLinkedDate ? linkedDate : null,
                rating: rating > 0 ? rating : null
            };

            let success = false;
            if (existingNoteId) {
                // Update existing note
                success = updateNoteInProtocolHistory(historyEntryId, existingNoteId, noteData);
                if (success) {
                    window.dispatchEvent(new CustomEvent('tpp:toast', { 
                        detail: { message: 'Follow-up assessment updated successfully.', type: 'success' } 
                    }));
                }
            } else {
                // Create new note
                success = addNoteToProtocolHistory(historyEntryId, noteData);
                if (success) {
                    window.dispatchEvent(new CustomEvent('tpp:toast', { 
                        detail: { message: 'Follow-up notes saved successfully.', type: 'success' } 
                    }));
                }
            }

            if (success) {
                // Trigger calendar sync if note has linkedDate
                if (showLinkedDate && linkedDate) {
                    window.dispatchEvent(new CustomEvent('tpp:calendar-sync', { 
                        detail: { protocolNoteUpdated: true } 
                    }));
                }
                window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
                
                if (onSave) onSave();
                handleClose();
            } else {
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: existingNoteId ? 'Failed to update follow-up notes.' : 'Failed to save follow-up notes.', type: 'error' } 
                }));
            }
        } else {
            onClose();
        }
    };

    const handleClose = () => {
        setContent('');
        setSelectedTags([]);
        setRating(0);
        setLinkedDate(getLocalDateString());
        setShowLinkedDate(true); // Reset to checked
        onClose();
    };

    if (!open || !protocol) return null;

    return (
        <BottomSheet
            open={open}
            onClose={handleClose}
            onBack={handleClose}
            title={existingNoteId ? "Edit Protocol Follow-Up" : "Protocol Follow-Up"}
            theme={theme}
            maxHeight="90vh"
            footer={
                <div className="flex justify-end gap-3 w-full">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 rounded-lg font-medium transition-all"
                        style={{ 
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.03)',
                            color: theme.text
                        }}
                    >
                        Skip for Now
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
                        style={{ 
                            backgroundColor: theme.primary, 
                            color: theme.textOnPrimary 
                        }}
                    >
                        <Save size={16} />
                        Save Follow-Up
                    </button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Protocol Info Box - 2x2 Grid */}
                {protocolInfo && (
                    <div className="p-3 rounded-lg" style={{
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.cardBackground,
                        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
                    }}>
                        <div className="grid grid-cols-2 gap-3">
                            {/* Top Left: Protocol Name */}
                            <div className="col-span-1">
                                <div className="text-sm font-semibold" style={{ color: theme.text }}>
                                    {protocol.protocolName || 'Unnamed Protocol'}
                                </div>
                            </div>
                            
                            {/* Top Right: Duration */}
                            <div className="col-span-1 flex items-center gap-2">
                                <Clock size={14} style={{ color: theme.textLight }} />
                                <span className="text-xs font-medium" style={{ color: theme.text }}>
                                    {protocolInfo.duration}
                                </span>
                            </div>
                            
                            {/* Bottom Left: Date Range */}
                            {protocolInfo.startDate && protocolInfo.endDate && (
                                <div className="col-span-1 flex items-center gap-2">
                                    <Calendar size={14} style={{ color: theme.textLight }} />
                                    <span className="text-xs font-medium" style={{ color: theme.text }}>
                                        {formatMMDDYY(protocolInfo.startDate)} - {formatMMDDYY(protocolInfo.endDate)}
                                    </span>
                                </div>
                            )}
                            
                            {/* Bottom Right: Status Badge */}
                            {protocolInfo.statusInfo && (() => {
                                const StatusIcon = protocolInfo.statusInfo.icon;
                                return (
                                    <div className="col-span-1 flex items-center justify-start">
                                        <div
                                            className="px-2 py-1 rounded-lg flex items-center justify-center gap-1 flex-shrink-0"
                                            style={{
                                                backgroundColor: protocolInfo.statusInfo.bgColor,
                                                color: protocolInfo.statusInfo.textColor,
                                                minWidth: 'fit-content'
                                            }}
                                        >
                                            <StatusIcon size={12} />
                                            <span className="font-medium text-[10px] leading-tight whitespace-nowrap">{protocolInfo.statusInfo.label}</span>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                )}

                {/* Rating Section */}
                <div className="flex flex-col items-center">
                    <label className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
                        <Target size={16} style={{ color: theme.primary }} />
                        Overall Research Assessment
                    </label>
                    <div className="flex items-center gap-2 mb-3">
                        {[1, 2, 3, 4, 5].map(num => (
                            <button
                                key={num}
                                type="button"
                                onClick={() => setRating(num)}
                                className="p-2 rounded-lg transition-all hover:scale-110"
                                    style={{
                                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : '#DDE6DE'
                                    }}
                            >
                                <Star 
                                    size={24} 
                                    fill={rating >= num ? (theme.isDark ? '#D1D5DB' : (theme.primaryDark || '#5F7F76')) : 'none'}
                                    style={{ 
                                        color: rating >= num 
                                            ? (theme.isDark ? '#D1D5DB' : (theme.primaryDark || '#5F7F76'))
                                            : (theme.isDark ? '#9CA3AF' : '#D1D5DB')
                                    }}
                                />
                            </button>
                        ))}
                    </div>
                    {rating > 0 && (
                        <span className="text-sm" style={{ color: theme.textLight }}>
                            {rating === 5 ? 'Excellent' : rating === 4 ? 'Good' : rating === 3 ? 'Average' : rating === 2 ? 'Below Average' : 'Poor'}
                        </span>
                    )}
                </div>

                {/* Quick Tags */}
                <div>
                    <label className="block text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: theme.text }}>
                        <Tag size={16} style={{ color: theme.primary }} />
                        Quick Tags
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {QUICK_TAGS.map(tag => {
                            const isSelected = selectedTags.includes(tag.id);
                            const TagIcon = tag.icon || Tag;
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => handleTagToggle(tag.id)}
                                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left"
                                    style={{
                                        backgroundColor: isSelected ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff'),
                                        border: `1px solid ${isSelected ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
                                        color: isSelected ? '#ffffff' : theme.textLight,
                                        boxShadow: isSelected ? `0 1px 3px ${theme.primary}30` : 'none',
                                        position: 'relative'
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isSelected) {
                                            e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.02)';
                                            e.currentTarget.style.color = theme.text;
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isSelected) {
                                            e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
                                            e.currentTarget.style.color = theme.textLight;
                                        }
                                    }}
                                >
                                    <TagIcon size={14} style={{ 
                                        color: isSelected ? '#ffffff' : theme.primary,
                                        flexShrink: 0
                                    }} />
                                    <span className="text-xs font-medium leading-tight" style={{ position: 'relative', zIndex: 1 }}>
                                        {tag.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Notes Content */}
                <div>
                    <label className="block text-sm font-semibold mb-2 flex items-center gap-2" style={{ color: theme.text }}>
                        <StickyNote size={16} style={{ color: theme.primary }} />
                        Notes & Observations
                    </label>
                    
                    {/* Animated Writing Suggestions Bar */}
                    <div 
                        className="w-full px-3 py-2 rounded-t-lg flex items-center gap-2 mb-0 transition-all"
                        style={{ 
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.secondary,
                            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                            borderBottom: 'none'
                        }}
                    >
                        <Lightbulb size={14} style={{ color: theme.primary, flexShrink: 0 }} />
                        <div 
                            className="flex-1 transition-opacity duration-200"
                            style={{ opacity: fadeIn ? 1 : 0 }}
                        >
                            <span 
                                className="text-xs italic"
                                style={{ color: theme.textLight }}
                            >
                                {writingPrompts[currentSuggestionIndex]}
                            </span>
                        </div>
                    </div>
                    
                    <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Add your overall assessment, outcomes, side effects, future considerations, or any other notes about this protocol..."
                        className="w-full p-3 rounded-b-lg rounded-t-none text-sm resize-none"
                        rows={8}
                        style={{
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.cardBackground,
                            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                            borderTop: 'none',
                            color: theme.text
                        }}
                    />
                </div>

                {/* Link to Calendar */}
                <div>
                    <label className="flex items-center gap-2 text-sm font-semibold mb-2" style={{ color: theme.text }}>
                        <input
                            type="checkbox"
                            checked={showLinkedDate}
                            onChange={(e) => setShowLinkedDate(e.target.checked)}
                            className="rounded"
                            style={{ accentColor: theme.primary }}
                        />
                        <Calendar size={16} style={{ color: theme.primary }} />
                        <span>Show this note in calendar</span>
                    </label>
                    {showLinkedDate && (
                        <div className="mt-2">
                            <GlassmorphismDatePicker
                                value={linkedDate}
                                onChange={setLinkedDate}
                                theme={theme}
                            />
                        </div>
                    )}
                </div>
            </div>
        </BottomSheet>
    );
}

