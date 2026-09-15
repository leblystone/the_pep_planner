import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Send, CheckCircle, AlertCircle, Bug, Lightbulb, ArrowLeft, Clock, MessageSquare, Camera, HelpCircle, Search, ChevronDown, ChevronUp, Map, BookOpen, ChevronRight } from 'lucide-react';
import { Bug as PhosphorBug, ChatCenteredText as PhosphorChatCenteredText, Lightbulb as PhosphorLightbulb, Question as PhosphorQuestion, CaretRight, Lifebuoy, IconContext, ChatCircleDots } from '@phosphor-icons/react';
import { useAppContext } from '../../context/AppContext';
import { submitFeedback, createSupportTicket, getUserTickets } from '../../services/firebase';
import SupportChatModal from './SupportChatModal';
import AdminMessageModal from './AdminMessageModal';
import { uploadImageToStorage } from '../../utils/storageUtils';
import { publicFaqCategories, inAppGuides, getAllFaqEntries, appRoadmap } from '../../data/faqContent';
import { useSupportInbox } from '../../hooks/useSupportInbox';
import { adminMessageSnippet, isTicketOpen } from '../../utils/supportInbox';

const MODAL_SPRING = { type: 'spring', stiffness: 420, damping: 34, mass: 0.85 };
const STEP_EASE = { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] };

const PRIMARY_OPTIONS = [
    {
        id: 'support',
        title: 'Support Ticket',
        description: 'Account, billing, and general help',
        Icon: PhosphorChatCenteredText,
        accent: 'primary',
        highlight: true,
    },
];

const COMPACT_OPTIONS = [
    {
        id: 'help',
        title: 'Help Center',
        description: 'Guides, walkthrough, and FAQ',
        Icon: PhosphorQuestion,
        accent: 'primary',
    },
    {
        id: 'bug',
        title: 'Bug report',
        description: 'Crashes, broken features, glitches',
        Icon: PhosphorBug,
        accent: 'error',
    },
    {
        id: 'suggestion',
        title: 'Suggestion',
        description: 'Ideas and product feedback',
        Icon: PhosphorLightbulb,
        accent: 'warning',
    },
];

function headerMeta(ticketType) {
    if (ticketType === 'bug') return { title: 'Report a Bug', subtitle: 'Tell us what went wrong', Icon: PhosphorBug };
    if (ticketType === 'suggestion') return { title: 'Share Your Idea', subtitle: 'Help shape the product', Icon: PhosphorLightbulb };
    if (ticketType === 'help') return { title: 'Help Center', subtitle: 'Guides, FAQ & walkthrough', Icon: PhosphorQuestion };
    if (ticketType === 'support') return { title: 'Support', subtitle: 'We usually reply within a day', Icon: Lifebuoy };
    return { title: 'Support', subtitle: 'How can we help?', Icon: Lifebuoy };
}

function accentColors(theme, accent) {
    if (accent === 'error') {
        return { fg: theme.error || '#DC2626', bg: (theme.error || '#DC2626') + '18' };
    }
    if (accent === 'warning') {
        return { fg: theme.warning || '#D97706', bg: (theme.warning || '#D97706') + '18' };
    }
    return { fg: theme.primary, bg: theme.primary + '18' };
}

export default function SupportModal({ open, onClose, theme, showBackButton = false, onBack }) {
    const { user } = useAppContext();
    const {
        allTickets: inboxTickets,
        openTicket,
        openSupportTicket,
        adminMessage,
        hasUnreadAdminMessage,
        hasOpenRequest,
        shouldDeepLinkToChat,
        nudgeSupportResponded,
        markTicketRead,
        markAdminMessageRead,
        devPreviewMessages,
    } = useSupportInbox();

    const [ticketType, setTicketType] = useState(null); // 'support' or 'bug' - choose first
    const [formData, setFormData] = useState({
        email: '',
        message: ''
    });
    const [selectedImages, setSelectedImages] = useState([]); // Array of {file: File, preview: string}
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    // Live ticket list from inbox subscription (no separate fetch needed)
    const liveTickets = useMemo(() => inboxTickets ?? [], [inboxTickets]);
    const [showHistoryChat, setShowHistoryChat] = useState(false);
    const [showAdminMessage, setShowAdminMessage] = useState(false);
    const [showPreviousTickets, setShowPreviousTickets] = useState(false);

    // When the open ticket is closed server-side, drop back to the hub (not a live DM).
    useEffect(() => {
        if (!hasOpenRequest) setShowHistoryChat(false);
    }, [hasOpenRequest]);
    const [helpQuery, setHelpQuery] = useState('');
    const [helpTab, setHelpTab] = useState('guides'); // 'guides' | 'faq' | 'roadmap'
    const [openHelpKey, setOpenHelpKey] = useState(null);
    
    // Track modal state to persist across app lifecycle changes
    const [internalOpen, setInternalOpen] = useState(open);
    const wasOpenBeforeBackground = useRef(false);
    const visibilityChangeTimeoutRef = useRef(null);
    const isInBackgroundState = useRef(false);
    const explicitCloseRequested = useRef(false);
    const previousOpenProp = useRef(open);
    // Monitor document visibility AND Capacitor App state to prevent modal from closing when app is minimized
    useEffect(() => {
        let capacitorAppListener = null;

        const handleVisibilityChange = () => {
            if (document.hidden) {
                // App is going to background - remember if modal was open
                if (internalOpen) {
                    wasOpenBeforeBackground.current = true;
                    isInBackgroundState.current = true;
                    console.log('📱 App minimized - preserving SupportModal state');
                }
            } else {
                // App is coming back to foreground
                if (visibilityChangeTimeoutRef.current) {
                    clearTimeout(visibilityChangeTimeoutRef.current);
                }
                
                visibilityChangeTimeoutRef.current = setTimeout(() => {
                    // If modal was open before going to background, restore it
                    if (wasOpenBeforeBackground.current) {
                        console.log('🔄 App returned to foreground - restoring SupportModal state');
                        setInternalOpen(true);
                        setTimeout(() => {
                            isInBackgroundState.current = false;
                            wasOpenBeforeBackground.current = false;
                        }, 500);
                    } else {
                        isInBackgroundState.current = false;
                    }
                }, 200);
            }
        };

        // Add Capacitor App state listener for better Android support
        const setupCapacitorListeners = async () => {
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (Capacitor.isNativePlatform()) {
                    const { App } = await import('@capacitor/app');
                    
                    capacitorAppListener = await App.addListener('appStateChange', ({ isActive }) => {
                        if (!isActive) {
                            // App going to background
                            if (internalOpen) {
                                wasOpenBeforeBackground.current = true;
                                isInBackgroundState.current = true;
                                console.log('📱 App state changed to background (Capacitor) - preserving SupportModal state');
                            }
                        } else {
                            // App coming to foreground
                            if (visibilityChangeTimeoutRef.current) {
                                clearTimeout(visibilityChangeTimeoutRef.current);
                            }
                            
                            visibilityChangeTimeoutRef.current = setTimeout(() => {
                                if (wasOpenBeforeBackground.current) {
                                    console.log('🔄 App state changed to foreground (Capacitor) - restoring SupportModal state');
                                    setInternalOpen(true);
                                    setTimeout(() => {
                                        isInBackgroundState.current = false;
                                        wasOpenBeforeBackground.current = false;
                                    }, 500);
                                } else {
                                    isInBackgroundState.current = false;
                                }
                            }, 200);
                        }
                    });
                }
            } catch (error) {
                console.log('Capacitor App not available, using visibility API only');
            }
        };

        setupCapacitorListeners();
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            if (visibilityChangeTimeoutRef.current) {
                clearTimeout(visibilityChangeTimeoutRef.current);
            }
            if (capacitorAppListener) {
                capacitorAppListener.remove();
            }
        };
    }, [internalOpen]);

    // Sync internal state with prop, but be smart about it
    useEffect(() => {
        // Track if this is a user-initiated close (prop changed from true to false)
        const propChangedToFalse = previousOpenProp.current === true && open === false;
        previousOpenProp.current = open;

        // Only update internal state if:
        // 1. The prop changed to true (always allow opening)
        // 2. The prop changed to false AND we're not in a background state recovery period
        if (open) {
            setInternalOpen(true);
            wasOpenBeforeBackground.current = false;
            isInBackgroundState.current = false;
            explicitCloseRequested.current = false;
            setTicketType(null); // Reset ticket type when opening
            setHelpQuery('');
            setOpenHelpKey(null);
            setShowHistoryChat(false);
        } else if (propChangedToFalse && !isInBackgroundState.current && !wasOpenBeforeBackground.current) {
            // Only close if explicitly changed from true to false and we're stable
            explicitCloseRequested.current = true;
            setInternalOpen(false);
        } else if (!open && !isInBackgroundState.current && !wasOpenBeforeBackground.current && explicitCloseRequested.current) {
            // Allow closing if explicitly requested and we're stable
            setInternalOpen(false);
        }
        // Otherwise, ignore prop changes during background state transitions
    }, [open]);

    // Keep email in sync with logged-in user (read-only; always use account email)
    useEffect(() => {
        if (user?.email) {
            setFormData(prev => ({ ...prev, email: user?.email || '' }));
        }
    }, [user?.email, open]);

    // Load user's previous tickets when modal opens — inbox subscription is primary; this is a one-time refresh fallback.
    useEffect(() => {
        if (!open || !user?.email) return;
        getUserTickets(user?.email || '').catch((error) => {
            console.error('❌ Failed to load user tickets:', error);
        });
    }, [open, user?.email]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleImageSelect = (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const MAX_SIZE = 5 * 1024 * 1024; // 5MB
        const MAX_IMAGES = 5;
        
        const validFiles = files.filter(file => {
            if (!file.type.startsWith('image/')) {
                alert(`${file.name} is not an image file`);
                return false;
            }
            if (file.size > MAX_SIZE) {
                alert(`${file.name} is too large. Maximum size is 5MB`);
                return false;
            }
            return true;
        });

        if (selectedImages.length + validFiles.length > MAX_IMAGES) {
            alert(`Maximum ${MAX_IMAGES} images allowed`);
            e.target.value = '';
            return;
        }

        const newImages = validFiles.map(file => ({
            file,
            preview: URL.createObjectURL(file)
        }));

        setSelectedImages(prev => [...prev, ...newImages]);
        e.target.value = ''; // Reset input
    };

    const handleRemoveImage = (index) => {
        const imageToRemove = selectedImages[index];
        URL.revokeObjectURL(imageToRemove.preview); // Clean up preview URL
        setSelectedImages(prev => prev.filter((_, i) => i !== index));
    };

    // Handle close with internal state management
    const handleClose = () => {
        // User explicitly closed the modal
        explicitCloseRequested.current = true;
        wasOpenBeforeBackground.current = false;
        isInBackgroundState.current = false;
        setInternalOpen(false);
        setTicketType(null);
        setHelpQuery('');
        setOpenHelpKey(null);
        setShowAdminMessage(false);
        setShowHistoryChat(false);
        setSubmitError(null);
        setSubmitStatus(null);
        // Clean up any preview URLs to prevent memory leaks
        selectedImages.forEach(img => {
            try {
                URL.revokeObjectURL(img.preview);
            } catch (e) {
                // Ignore if already revoked
            }
        });
        setSelectedImages([]);
        onClose();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.message.trim()) return;

        // Defensive check: ensure user is logged in
        if (!user?.email) {
            setSubmitError('Please sign in to submit. Your session may have expired.');
            setSubmitStatus('error');
            return;
        }

        console.log('🚀 Starting submission...', { ticketType, userEmail: user?.email });
        setIsSubmitting(true);
        setSubmitStatus(null);
        setSubmitError(null);
        
        try {
            console.log('📤 Creating support ticket...', {
                ticketType,
                userEmail: user?.email,
                userId: user?.uid,
                message: formData.message.trim(),
                imageCount: selectedImages.length
            });

            // Upload images only for support tickets (bug/suggestion are feedback-only, no attachments)
            const imageUrls = [];
            const imageStoragePaths = [];
            if (ticketType === 'support' && selectedImages.length > 0 && user?.uid) {
                try {
                    // Double-check user.uid exists before upload (prevents crash if user object changes)
                    if (!user?.uid) {
                        throw new Error('User authentication lost. Please refresh and try again.');
                    }
                    
                    for (const imageData of selectedImages) {
                        const uploadResult = await uploadImageToStorage(
                            imageData.file, 
                            user.uid, // Safe now - checked above
                            'support'
                        );
                        imageUrls.push(uploadResult.url);
                        imageStoragePaths.push(uploadResult.path);
                    }
                    console.log(`✅ Uploaded ${imageUrls.length} image(s) to Firebase Storage`);
                } catch (uploadError) {
                    console.error('❌ Error uploading images:', uploadError);
                    throw new Error(`Failed to upload images: ${uploadError.message}`);
                }
            }

            // Three separate flows: suggestion & bug = feedback only (Bugs/Feedback tab, "From the Team" if needed). Support = ticket (SupportChatModal).
            if (ticketType === 'suggestion' || ticketType === 'bug') {
                // Submit as feedback only — no support ticket. Appears in admin Feedback & Bugs; reply via "From the Team" if warranted.
                console.log(`📝 Submitting ${ticketType} feedback...`);
                const feedbackId = await submitFeedback({
                    type: ticketType,
                    message: formData.message.trim(),
                    userEmail: user?.email || 'anonymous',
                    userId: user?.uid || null,
                    userAgent: navigator.userAgent,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                });
                console.log(`✅ ${ticketType === 'bug' ? 'Bug report' : 'Suggestion'} submitted to feedback - ID:`, feedbackId);
            } else {
                // Support only: create support ticket (open ticket → SupportChatModal)
                const ticketId = await createSupportTicket({
                    userId: user?.uid || null,
                    userEmail: user?.email,
                    userName: user?.displayName || user?.email?.split('@')[0] || 'App User',
                    type: 'support',
                    subject: 'Support Request',
                    message: formData.message.trim(),
                    imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
                    imageStoragePaths: imageStoragePaths.length > 0 ? imageStoragePaths : undefined,
                    metadata: {
                        userAgent: navigator.userAgent,
                        url: window.location.href,
                        userEmail: user?.email,
                        userId: user?.uid || null
                    }
                });
                console.log('✅ Support ticket created:', ticketId);
                // The user's own opening message shouldn't register as an unread
                // admin/ghost-worker reply — seed lastRead so the badge/nudge/toast
                // only fires once someone actually responds.
                if (ticketId) {
                    try {
                        localStorage.setItem(`ticket_${ticketId}_lastRead`, new Date().toISOString());
                    } catch {
                        /* ignore */
                    }
                }
                if (user?.email) window.dispatchEvent(new CustomEvent('tpp:support-inbox-changed'));
                window.dispatchEvent(new CustomEvent('tpp:support-inbox-changed'));
            }
            
            // Show success confirmation
            console.log('✅ Submission successful - showing success UI');
            setSubmitStatus('success');
            
            // Clean up preview URLs
            selectedImages.forEach(img => {
                try {
                    URL.revokeObjectURL(img.preview);
                } catch (e) {
                    // Ignore if already revoked or invalid
                }
            });
            setFormData({ email: '', message: '' });
            setSelectedImages([]);
            
            // Auto-close after 5 seconds (unconditional - user can dismiss earlier with "Done" button)
            console.log('⏱️ Scheduling modal auto-close in 5 seconds');
            setTimeout(() => {
                console.log('⏱️ Auto-closing modal after success confirmation');
                setSubmitStatus(null);
                handleClose();
            }, 5000);
        } catch (error) {
            console.error('❌ Error creating support ticket:', error);
            console.error('❌ Error details:', {
                message: error?.message,
                code: error?.code,
                stack: error?.stack?.substring(0, 200)
            });
            
            // Extract meaningful error message
            let errorMessage = 'Something went wrong. Please try again.';
            
            if (error?.message) {
                // Check for specific error types
                if (error.message.includes('permission') || error.message.includes('PERMISSION_DENIED')) {
                    errorMessage = 'Permission error. Please ensure you are signed in and try again.';
                } else if (error.message.includes('network') || error.message.includes('Failed to fetch')) {
                    errorMessage = 'Network error. Please check your connection and try again.';
                } else if (error.message.includes('upload')) {
                    errorMessage = 'Failed to upload images. Please try with smaller images or without attachments.';
                } else if (error.message.includes('auth')) {
                    errorMessage = 'Authentication error. Please sign out and sign in again.';
                } else {
                    // Use the actual error message for other cases
                    errorMessage = error.message.length > 100 
                        ? error.message.substring(0, 100) + '...' 
                        : error.message;
                }
            } else if (error?.code) {
                errorMessage = `Error: ${error.code}`;
            }
            
            setSubmitError(errorMessage);
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const mutedBtnBg = theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
    const meta = headerMeta(ticketType);
    const HeaderIcon = meta.Icon;
    const stepKey = submitStatus || ticketType || 'hub';
    const submitLabel =
        ticketType === 'bug' ? 'Submit Bug' : ticketType === 'suggestion' ? 'Send Suggestion' : 'Send Message';
    const hubSubtitle = nudgeSupportResponded
        ? 'Support has responded!'
        : meta.subtitle;
    // Always offer Support Ticket — each submit creates its own #Z### (see createSupportTicket).
    // When a thread is already open, label it as a new request so it doesn't feel like a flood.
    const primaryHubOptions = PRIMARY_OPTIONS.map((opt) => (
        hasOpenRequest && opt.id === 'support'
            ? { ...opt, title: 'New support request', description: 'Starts a separate ticket with its own support #' }
            : opt
    ));
    // An open support ticket is embedded inline, front and center — no separate
    // modal, no "continue conversation" prompt to click through.
    const chatVisible = showHistoryChat || shouldDeepLinkToChat;
    // Open live thread stays pinned; history panel can be dismissed back to that thread.
    const chatCollapsible = showHistoryChat || !shouldDeepLinkToChat;
    const handleChatClose = () => {
        setShowHistoryChat(false);
    };
    const chatTicket = openSupportTicket || openTicket;
    // Open request → that thread only. Full archive only when user asks for history.
    const chatTickets = useMemo(() => {
        if (showHistoryChat) {
            return liveTickets.length ? liveTickets : [];
        }
        if (openSupportTicket && isTicketOpen(openSupportTicket)) {
            return [openSupportTicket];
        }
        return [];
    }, [showHistoryChat, openSupportTicket, liveTickets]);

    const pastTicketCount = useMemo(() => {
        if (!liveTickets.length) return 0;
        if (!openSupportTicket) return liveTickets.length;
        return liveTickets.filter((t) => t.id !== openSupportTicket.id).length;
    }, [liveTickets, openSupportTicket]);

    // Let inbox nudge know the Support surface is already open (skip redundant toasts)
    useEffect(() => {
        if (!internalOpen) return undefined;
        window.dispatchEvent(new CustomEvent('tpp:support-viewing', { detail: { viewing: true } }));
        return () => {
            window.dispatchEvent(new CustomEvent('tpp:support-viewing', { detail: { viewing: false } }));
        };
    }, [internalOpen]);

    return (
        <AnimatePresence>
            {internalOpen && (
                <motion.div
                    key="support-modal-root"
                    className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                >
                    <motion.div
                        className="absolute inset-0 backdrop-blur-md bg-black/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        onClick={handleClose}
                    />

                    <motion.div
                        role="dialog"
                        aria-modal="true"
                        aria-label={meta.title}
                        className="relative rounded-[1.5rem] shadow-xl max-w-md w-full max-h-[82dvh] sm:max-h-[86vh] flex flex-col overflow-hidden"
                        style={{
                            backgroundColor: theme.cardBackground,
                            boxShadow: theme.isDark
                                ? '0 24px 48px rgba(0,0,0,0.45)'
                                : '0 24px 48px rgba(0,0,0,0.14)',
                        }}
                        initial={{ opacity: 0, y: 18, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 12, scale: 0.97 }}
                        transition={MODAL_SPRING}
                    >
                        <IconContext.Provider value={{ weight: 'duotone' }}>
                            {/* Header */}
                            <div
                                className="flex items-center justify-between gap-3 p-4 flex-shrink-0"
                                style={{ borderBottom: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    {((showBackButton && onBack) || ticketType) ? (
                                        <button
                                            type="button"
                                            onClick={ticketType ? () => setTicketType(null) : onBack}
                                            className="p-2.5 rounded-full transition-all hover:opacity-80 active:scale-95 shrink-0"
                                            style={{ backgroundColor: mutedBtnBg }}
                                            title={ticketType ? 'Back to support options' : 'Back'}
                                        >
                                            <ArrowLeft className="w-5 h-5" style={{ color: theme.text }} />
                                        </button>
                                    ) : (
                                        <div
                                            className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                                            style={{ backgroundColor: theme.primary + '18' }}
                                        >
                                            <HeaderIcon size={22} style={{ color: theme.primary }} />
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <h2 className="text-lg font-semibold tracking-tight truncate" style={{ color: theme.text }}>
                                            {meta.title}
                                        </h2>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <div className="h-0.5 w-3.5 rounded-full" style={{ backgroundColor: theme.primary }} />
                                            <span
                                                className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-40 truncate"
                                                style={{
                                                    color: nudgeSupportResponded && !ticketType ? theme.primary : theme.text,
                                                    opacity: nudgeSupportResponded && !ticketType ? 0.9 : undefined,
                                                }}
                                            >
                                                {!ticketType ? hubSubtitle : meta.subtitle}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleClose}
                                    className="p-2.5 rounded-full transition-all hover:opacity-80 active:scale-95 shrink-0"
                                    style={{ backgroundColor: mutedBtnBg }}
                                    aria-label="Close"
                                >
                                    <X className="w-5 h-5" style={{ color: theme.textLight }} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4">
                                <AnimatePresence mode="wait" initial={false}>
                                    <motion.div
                                        key={stepKey}
                                        initial={{ opacity: 0, x: ticketType || submitStatus ? 16 : -16 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: ticketType || submitStatus ? -12 : 12 }}
                                        transition={STEP_EASE}
                                    >
                                        {!ticketType ? (
                                            <div className="space-y-4">
                                                {chatVisible && chatTickets.length > 0 && (
                                                    <SupportChatModal
                                                        embedded
                                                        allowCollapse={chatCollapsible}
                                                        ticket={chatTicket}
                                                        allTickets={chatTickets}
                                                        onClose={handleChatClose}
                                                        theme={theme}
                                                        onMarkRead={markTicketRead}
                                                        isDevPreview={!!devPreviewMessages}
                                                        devPreviewMessages={devPreviewMessages}
                                                    />
                                                )}

                                                <p className="text-sm opacity-55 px-0.5" style={{ color: theme.text }}>
                                                    {hasOpenRequest
                                                        ? 'Reply in the thread above, or open a new request / leave feedback below.'
                                                        : 'Pick a path — we\u2019ll take it from there.'}
                                                </p>

                                                {primaryHubOptions.length > 0 && (
                                                <div className="space-y-2.5">
                                                    {primaryHubOptions.map((opt) => {
                                                        const colors = accentColors(theme, opt.accent);
                                                        const Icon = opt.Icon;
                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                type="button"
                                                                onClick={() => setTicketType(opt.id)}
                                                                className="group w-full p-3.5 rounded-2xl text-left transition-all hover:translate-y-[-1px] active:scale-[0.99]"
                                                                style={{
                                                                    backgroundColor: opt.highlight
                                                                        ? theme.primary + '10'
                                                                        : (theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)'),
                                                                    border: `1px solid ${opt.highlight ? theme.primary + '35' : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)')}`,
                                                                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                                                }}
                                                            >
                                                                <div className="flex items-center gap-3.5">
                                                                    <div
                                                                        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                                                                        style={{ backgroundColor: colors.bg }}
                                                                    >
                                                                        <Icon size={22} style={{ color: colors.fg }} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <h4 className="text-[15px] font-semibold tracking-tight" style={{ color: theme.text }}>
                                                                            {opt.title}
                                                                        </h4>
                                                                        <p className="text-[13px] font-medium opacity-50 mt-0.5" style={{ color: theme.text }}>
                                                                            {opt.description}
                                                                        </p>
                                                                    </div>
                                                                    <CaretRight
                                                                        size={20}
                                                                        weight="bold"
                                                                        className="opacity-25 group-hover:opacity-70 group-hover:translate-x-0.5 transition-all shrink-0"
                                                                        style={{ color: theme.text }}
                                                                    />
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                )}

                                                <div
                                                    className="pt-2 space-y-2"
                                                    style={{ borderTop: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}` }}
                                                >
                                                    {adminMessage && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowAdminMessage(true)}
                                                            className="group w-full px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.99]"
                                                            style={{
                                                                backgroundColor: hasUnreadAdminMessage
                                                                    ? theme.primary + '10'
                                                                    : 'transparent',
                                                                border: `1px solid ${hasUnreadAdminMessage ? theme.primary + '35' : (theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)')}`,
                                                            }}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <ChatCircleDots size={18} style={{ color: theme.primary }} className="shrink-0" />
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="text-[13px] font-semibold" style={{ color: theme.text }}>
                                                                        From the Team
                                                                        {hasUnreadAdminMessage ? ' · New' : ''}
                                                                    </p>
                                                                    <p className="text-[12px] opacity-45 line-clamp-1" style={{ color: theme.text }}>
                                                                        {adminMessageSnippet(adminMessage)}
                                                                    </p>
                                                                </div>
                                                                <CaretRight size={16} weight="bold" className="opacity-25 shrink-0" style={{ color: theme.text }} />
                                                            </div>
                                                        </button>
                                                    )}

                                                    {COMPACT_OPTIONS.map((opt) => {
                                                        const colors = accentColors(theme, opt.accent);
                                                        const Icon = opt.Icon;
                                                        return (
                                                            <button
                                                                key={opt.id}
                                                                type="button"
                                                                onClick={() => setTicketType(opt.id)}
                                                                className="group w-full px-3 py-2 rounded-xl text-left transition-all hover:opacity-90 active:scale-[0.99]"
                                                                style={{
                                                                    backgroundColor: 'transparent',
                                                                    border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'}`,
                                                                }}
                                                            >
                                                                <div className="flex items-center gap-3">
                                                                    <div
                                                                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                                                        style={{ backgroundColor: colors.bg }}
                                                                    >
                                                                        <Icon size={16} style={{ color: colors.fg }} />
                                                                    </div>
                                                                    <div className="flex-1 min-w-0">
                                                                        <h4 className="text-[13px] font-medium tracking-tight" style={{ color: theme.text }}>
                                                                            {opt.title}
                                                                        </h4>
                                                                        <p className="text-[11px] opacity-40 mt-0.5" style={{ color: theme.text }}>
                                                                            {opt.description}
                                                                        </p>
                                                                    </div>
                                                                    <CaretRight
                                                                        size={16}
                                                                        weight="bold"
                                                                        className="opacity-20 group-hover:opacity-50 shrink-0"
                                                                        style={{ color: theme.text }}
                                                                    />
                                                                </div>
                                                            </button>
                                                        );
                                                    })}

                                                    {(pastTicketCount > 0 || (!hasOpenRequest && liveTickets.length > 0)) && !showHistoryChat && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowHistoryChat(true)}
                                                            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 opacity-45 hover:opacity-80 transition-opacity"
                                                            style={{ color: theme.primary }}
                                                        >
                                                            <MessageSquare size={13} />
                                                            View past conversations
                                                        </button>
                                                    )}
                                                    {showHistoryChat && hasOpenRequest && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowHistoryChat(false)}
                                                            className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold py-2 opacity-45 hover:opacity-80 transition-opacity"
                                                            style={{ color: theme.primary }}
                                                        >
                                                            Back to open conversation
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ) : ticketType === 'help' ? (
                                            <HelpCenterPanel
                                                theme={theme}
                                                query={helpQuery}
                                                setQuery={setHelpQuery}
                                                tab={helpTab}
                                                setTab={setHelpTab}
                                                openKey={openHelpKey}
                                                setOpenKey={setOpenHelpKey}
                                                onContactSupport={() => {
                                                    if (hasOpenRequest) {
                                                        // Open ticket lives inline on the hub — jump back there
                                                        // (live thread only, not full history dump).
                                                        setShowHistoryChat(false);
                                                        setTicketType(null);
                                                    } else {
                                                        setTicketType('support');
                                                    }
                                                }}
                                            />
                                        ) : submitStatus === 'success' ? (
                                            <div className="text-center py-10 px-4">
                                                <div
                                                    className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-5"
                                                    style={{ 
                                                        backgroundColor: (theme.success || '#16A34A') + '20',
                                                        boxShadow: `0 0 0 8px ${(theme.success || '#16A34A')}08`
                                                    }}
                                                >
                                                    <CheckCircle className="w-10 h-10" weight="fill" style={{ color: theme.success || '#16A34A' }} />
                                                </div>
                                                <h3 className="text-2xl font-bold tracking-tight mb-3" style={{ color: theme.text }}>
                                                    {ticketType === 'bug' ? 'Bug Report Sent!' : ticketType === 'suggestion' ? 'Suggestion Sent!' : 'Message Sent!'}
                                                </h3>
                                                <p className="text-sm opacity-70 mb-5 px-2" style={{ color: theme.text }}>
                                                    {ticketType === 'bug' || ticketType === 'suggestion' 
                                                        ? "Thanks for your feedback! We'll review it and may reach out via the 'From the Team' message." 
                                                        : "We'll get back to you as soon as possible."}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => { setSubmitStatus(null); handleClose(); }}
                                                    className="px-6 py-2.5 rounded-2xl font-semibold transition-all active:scale-95"
                                                    style={{
                                                        backgroundColor: theme.primary,
                                                        color: theme.textOnPrimary || '#fff',
                                                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                                    }}
                                                >
                                                    Done
                                                </button>
                                            </div>
                                        ) : submitStatus === 'error' ? (
                                            <div className="text-center py-8 px-2">
                                                <div
                                                    className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                                                    style={{ backgroundColor: (theme.error || '#DC2626') + '20' }}
                                                >
                                                    <AlertCircle className="w-8 h-8" style={{ color: theme.error || '#DC2626' }} />
                                                </div>
                                                <h3 className="text-xl font-semibold tracking-tight mb-2" style={{ color: theme.text }}>
                                                    Submission Failed
                                                </h3>
                                                <p className="text-sm opacity-70 mb-4 px-4" style={{ color: theme.text }}>
                                                    {submitError || 'Something went wrong. Please try again.'}
                                                </p>
                                                <p className="text-xs opacity-50 mb-5 px-4" style={{ color: theme.text }}>
                                                    If this persists, email us at support@thepepplanner.com
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => { setSubmitStatus(null); setSubmitError(null); }}
                                                    className="px-5 py-2.5 rounded-2xl font-semibold transition-all active:scale-95"
                                                    style={{
                                                        backgroundColor: theme.primary,
                                                        color: theme.textOnPrimary || '#fff',
                                                        boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.12)',
                                                    }}
                                                >
                                                    Try Again
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <form onSubmit={handleSubmit} className="space-y-4">
                                                    <div className="space-y-1.5">
                                                        <label
                                                            className="block text-[11px] font-bold uppercase tracking-[0.14em] opacity-40"
                                                            style={{ color: theme.text }}
                                                        >
                                                            Email
                                                        </label>
                                                        <input
                                                            type="email"
                                                            name="email"
                                                            value={user?.email ?? ''}
                                                            readOnly
                                                            className="w-full px-3.5 py-3 rounded-xl focus:outline-none cursor-default text-sm font-medium"
                                                            style={{
                                                                border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                                                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                                                                color: theme.text,
                                                            }}
                                                            placeholder="Sign in to use your account email"
                                                            title="Uses your logged-in account email"
                                                        />
                                                        <p className="text-[11px] opacity-45 px-0.5" style={{ color: theme.text }}>
                                                            Uses your account email (cannot be changed)
                                                        </p>
                                                    </div>

                                                    <div className="space-y-1.5">
                                                        <label
                                                            className="block text-[11px] font-bold uppercase tracking-[0.14em] opacity-40"
                                                            style={{ color: theme.text }}
                                                        >
                                                            Message *
                                                        </label>
                                                        <textarea
                                                            name="message"
                                                            value={formData.message}
                                                            onChange={handleInputChange}
                                                            required
                                                            rows={5}
                                                            className="w-full px-3.5 py-3 rounded-xl focus:outline-none transition-all resize-none text-sm"
                                                            style={{
                                                                border: `1.5px solid ${theme.border}`,
                                                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : '#ffffff',
                                                                color: theme.text,
                                                                boxShadow: `0 0 0 0 ${theme.primary}00`,
                                                            }}
                                                            onFocus={(e) => {
                                                                e.currentTarget.style.borderColor = theme.primary;
                                                                e.currentTarget.style.boxShadow = `0 0 0 3px ${theme.primary}22`;
                                                            }}
                                                            onBlur={(e) => {
                                                                e.currentTarget.style.borderColor = theme.border;
                                                                e.currentTarget.style.boxShadow = `0 0 0 0 ${theme.primary}00`;
                                                            }}
                                                            placeholder={
                                                                ticketType === 'suggestion'
                                                                    ? "I'd love to see..."
                                                                    : 'Describe your question or issue...'
                                                            }
                                                        />
                                                    </div>

                                                    {ticketType === 'support' && (
                                                        <div className="space-y-1.5">
                                                            <label
                                                                className="block text-[11px] font-bold uppercase tracking-[0.14em] opacity-40"
                                                                style={{ color: theme.text }}
                                                            >
                                                                Attach images
                                                            </label>
                                                            <div className="space-y-2">
                                                                <label
                                                                    className="flex flex-col items-center justify-center gap-2 px-4 py-5 border-2 border-dashed rounded-2xl cursor-pointer transition-all hover:opacity-90 active:scale-[0.99]"
                                                                    style={{
                                                                        borderColor: theme.primary + '40',
                                                                        backgroundColor: theme.primary + '08',
                                                                        color: theme.text,
                                                                    }}
                                                                >
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        multiple
                                                                        onChange={handleImageSelect}
                                                                        disabled={isSubmitting || selectedImages.length >= 5}
                                                                        className="hidden"
                                                                    />
                                                                    <div
                                                                        className="w-11 h-11 rounded-2xl flex items-center justify-center"
                                                                        style={{ backgroundColor: theme.primary + '18' }}
                                                                    >
                                                                        <Camera size={22} style={{ color: theme.primary }} />
                                                                    </div>
                                                                    <span className="text-sm font-semibold" style={{ color: theme.text }}>
                                                                        {selectedImages.length >= 5 ? 'Maximum 5 images reached' : 'Add photos'}
                                                                    </span>
                                                                    <span className="text-[11px] opacity-50" style={{ color: theme.text }}>
                                                                        Optional · max 5MB each · up to 5
                                                                    </span>
                                                                </label>

                                                                {selectedImages.length > 0 && (
                                                                    <div className="grid grid-cols-3 gap-2">
                                                                        {selectedImages.map((imageData, index) => (
                                                                            <div key={index} className="relative group">
                                                                                <img
                                                                                    src={imageData.preview}
                                                                                    alt={`Preview ${index + 1}`}
                                                                                    className="w-full h-20 object-cover rounded-xl border"
                                                                                    style={{ borderColor: theme.border }}
                                                                                />
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => handleRemoveImage(index)}
                                                                                    className="absolute top-1 right-1 p-1 rounded-full bg-black/60 hover:bg-black/80 transition-all opacity-0 group-hover:opacity-100"
                                                                                    style={{ color: '#ffffff' }}
                                                                                >
                                                                                    <X size={14} />
                                                                                </button>
                                                                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 rounded-b-xl">
                                                                                    {(imageData.file.size / 1024).toFixed(0)}KB
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {!user?.email && (
                                                        <p className="text-sm opacity-55" style={{ color: theme.text }}>
                                                            Sign in to submit a support request, bug report, or suggestion.
                                                        </p>
                                                    )}

                                                    <button
                                                        type="submit"
                                                        disabled={isSubmitting || !user?.email}
                                                        className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]"
                                                        style={{
                                                            backgroundColor: theme.primary,
                                                            color: theme.textOnPrimary || '#FFFFFF',
                                                            border: `1.5px solid ${theme.primaryDark || theme.primary}`,
                                                            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.15), 0 1px 3px rgba(0,0,0,0.08)',
                                                        }}
                                                    >
                                                        {isSubmitting ? (
                                                            <>
                                                                <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                                                Sending...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Send className="w-4.5 h-4.5" size={18} />
                                                                {submitLabel}
                                                            </>
                                                        )}
                                                    </button>
                                                </form>

                                                {user?.email && liveTickets.length > 0 && (
                                                    <div
                                                        className="pt-4 mt-5"
                                                        style={{ borderTop: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}
                                                    >
                                                        <div className="flex items-center justify-between gap-2 mb-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowPreviousTickets(!showPreviousTickets)}
                                                                className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] opacity-50 hover:opacity-80 transition-opacity"
                                                                style={{ color: theme.text }}
                                                            >
                                                                <span>Previous ({liveTickets.length})</span>
                                                                <span>{showPreviousTickets ? '−' : '+'}</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setShowHistoryChat(true)}
                                                                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all hover:opacity-80 active:scale-95"
                                                                style={{
                                                                    backgroundColor: 'transparent',
                                                                    color: theme.primary,
                                                                    border: `1px solid ${theme.primary}40`,
                                                                }}
                                                            >
                                                                <MessageSquare size={13} />
                                                                View conversation
                                                            </button>
                                                        </div>
                                                        {showPreviousTickets && (
                                                            <div className="space-y-2 max-h-48 overflow-y-auto">
                                                                {liveTickets.map((ticket) => (
                                                                    <button
                                                                        key={ticket.id}
                                                                        type="button"
                                                                        onClick={() => setShowHistoryChat(true)}
                                                                        className="w-full text-left p-3 rounded-2xl text-sm transition-all hover:opacity-90 active:scale-[0.99]"
                                                                        style={{
                                                                            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                                                                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                                                        }}
                                                                    >
                                                                        <div className="flex items-start justify-between mb-1">
                                                                            <div className="flex items-center gap-2">
                                                                                {ticket.type === 'bug' && <Bug size={14} style={{ color: theme.error }} />}
                                                                                {ticket.type === 'suggestion' && <Lightbulb size={14} style={{ color: theme.warning }} />}
                                                                                {ticket.type === 'support' && <Mail size={14} style={{ color: theme.info }} />}
                                                                                <span className="font-semibold" style={{ color: theme.text }}>
                                                                                    {ticket.ticketNumber || `#${ticket.id.substring(0, 8)}`}
                                                                                </span>
                                                                            </div>
                                                                            <span
                                                                                className="text-xs px-2 py-0.5 rounded-full"
                                                                                style={{
                                                                                    backgroundColor: (ticket.status === 'new' ? theme.warning : ticket.status === 'in-progress' ? theme.info : ticket.status === 'resolved' ? theme.success : theme.textLight) + '20',
                                                                                    color: ticket.status === 'new' ? theme.warning : ticket.status === 'in-progress' ? theme.info : ticket.status === 'resolved' ? theme.success : theme.textLight,
                                                                                }}
                                                                            >
                                                                                {ticket.status}
                                                                            </span>
                                                                        </div>
                                                                        <p className="text-xs mb-1 opacity-55" style={{ color: theme.text }}>
                                                                            {ticket.subject}
                                                                        </p>
                                                                        {ticket.lastMessageAt && (
                                                                            <div className="flex items-center gap-1 text-xs opacity-40" style={{ color: theme.text }}>
                                                                                <Clock size={10} />
                                                                                {ticket.lastMessageAt?.toDate ? new Date(ticket.lastMessageAt.toDate()).toLocaleDateString() : 'Recently'}
                                                                            </div>
                                                                        )}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </IconContext.Provider>
                    </motion.div>
                </motion.div>
            )}
            {showAdminMessage && adminMessage && (
                <AdminMessageModal
                    message={adminMessage}
                    onClose={() => setShowAdminMessage(false)}
                    theme={theme}
                    onMarkRead={markAdminMessageRead}
                />
            )}
        </AnimatePresence>
    );
}

/* ── Inline Help Center panel ──────────────────────────────────── */

function HelpCenterPanel({ theme, query, setQuery, tab, setTab, openKey, setOpenKey, onContactSupport }) {
    const searchResults = useMemo(() => {
        const q = (query || '').trim().toLowerCase();
        if (!q) return null;
        return getAllFaqEntries().filter((e) =>
            e.question.toLowerCase().includes(q) ||
            e.answer.toLowerCase().includes(q)
        );
    }, [query]);

    const renderAccordion = (entries, keyPrefix) => (
        <div className="space-y-1.5">
            {entries.map((entry, i) => {
                const key = `${keyPrefix}-${i}`;
                const isOpen = openKey === key;
                return (
                    <div key={key} className="rounded-xl overflow-hidden" style={{ backgroundColor: theme.background, border: `1px solid ${theme.border}` }}>
                        <button
                            type="button"
                            onClick={() => setOpenKey(isOpen ? null : key)}
                            className="w-full px-3 py-2.5 flex items-center justify-between text-left"
                            style={{ backgroundColor: isOpen ? theme.primary : 'transparent', color: isOpen ? (theme.white || '#fff') : theme.text }}
                        >
                            <span className="font-medium text-xs pr-2 leading-snug">{entry.question}</span>
                            {isOpen ? <ChevronUp size={14} className="flex-shrink-0" /> : <ChevronDown size={14} className="flex-shrink-0" />}
                        </button>
                        {isOpen && (
                            <div className="px-3 py-2.5 border-t text-xs leading-relaxed" style={{ borderColor: theme.border, color: theme.textLight }}>
                                {entry.answer}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );

    return (
        <div className="space-y-3">
            {/* Search */}
            <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: theme.background, border: `1px solid ${theme.border}` }}>
                <Search size={14} style={{ color: theme.textLight }} />
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search help articles…"
                    className="flex-1 bg-transparent border-0 outline-none text-sm"
                    style={{ color: theme.text }}
                />
                {query && <button type="button" onClick={() => setQuery('')} className="text-xs" style={{ color: theme.textLight }}>✕</button>}
            </div>

            {/* Search results */}
            {searchResults ? (
                <div>
                    <p className="text-xs mb-2 opacity-60" style={{ color: theme.text }}>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</p>
                    {searchResults.length === 0
                        ? <p className="text-xs p-3 rounded-xl" style={{ backgroundColor: theme.background, color: theme.textLight }}>No results — try a different term or contact support below.</p>
                        : renderAccordion(searchResults, 'search')
                    }
                </div>
            ) : (
                <>
                    {/* Tab pills */}
                    <div className="flex gap-1.5 flex-wrap">
                        {[
                            { id: 'guides',  label: 'Guides',       icon: <BookOpen size={11} /> },
                            { id: 'faq',     label: 'FAQ',          icon: <HelpCircle size={11} /> },
                            { id: 'roadmap', label: 'How it works', icon: <Map size={11} /> },
                        ].map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => { setTab(t.id); setOpenKey(null); }}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
                                style={{
                                    backgroundColor: tab === t.id ? theme.primary : 'transparent',
                                    color: tab === t.id ? (theme.white || '#fff') : theme.text,
                                    border: `1px solid ${tab === t.id ? theme.primary : theme.border}`,
                                }}
                            >
                                {t.icon}{t.label}
                            </button>
                        ))}
                    </div>

                    {/* Guides */}
                    {tab === 'guides' && (
                        <div className="space-y-3">
                            {inAppGuides.map((group) => (
                                <div key={group.title}>
                                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 opacity-60" style={{ color: theme.text }}>{group.title}</p>
                                    {renderAccordion(group.entries, `g-${group.title}`)}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* FAQ */}
                    {tab === 'faq' && (
                        <div className="space-y-3">
                            {publicFaqCategories.map((group) => (
                                <div key={group.title}>
                                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 opacity-60" style={{ color: theme.text }}>{group.title}</p>
                                    {renderAccordion(group.faqs, `f-${group.title}`)}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Roadmap */}
                    {tab === 'roadmap' && (
                        <div className="relative space-y-2">
                            <div className="absolute left-4 top-4 bottom-4 w-0.5" style={{ backgroundColor: theme.border }} />
                            {appRoadmap.map((step, i) => {
                                const isOpen = openKey === `road-${i}`;
                                const isGold = step.color !== '#7F9E95';
                                return (
                                    <div key={i} className="relative flex gap-3">
                                        <div className="relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ backgroundColor: isGold ? '#C8912A' : theme.primary }}>
                                            {i + 1}
                                        </div>
                                        <div className="flex-1 rounded-xl overflow-hidden" style={{ backgroundColor: theme.background, border: `1px solid ${theme.border}` }}>
                                            <button
                                                type="button"
                                                onClick={() => setOpenKey(isOpen ? null : `road-${i}`)}
                                                className="w-full px-3 py-2 flex items-center justify-between text-left"
                                            >
                                                <div>
                                                    <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: isGold ? '#C8912A' : theme.primary }}>{step.phase}</div>
                                                    <div className="text-xs font-semibold" style={{ color: theme.text }}>{step.title}</div>
                                                </div>
                                                <ChevronRight size={13} className={`flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} style={{ color: theme.textLight }} />
                                            </button>
                                            {isOpen && (
                                                <div className="px-3 pb-2.5 text-xs leading-relaxed border-t" style={{ borderColor: theme.border, color: theme.textLight }}>
                                                    {step.body}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Contact support CTA */}
            <div className="mt-2 pt-3 border-t" style={{ borderColor: theme.border }}>
                <p className="text-xs mb-2 text-center" style={{ color: theme.textLight }}>Can't find what you're looking for?</p>
                    <button
                        type="button"
                        onClick={onContactSupport}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold active:scale-95 transition-all"
                        style={{
                            backgroundColor: theme.primary,
                            color: theme.white || '#fff',
                            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.12)',
                        }}
                    >
                        <MessageSquare size={15} /> Contact Support
                    </button>
            </div>
        </div>
    );
}

