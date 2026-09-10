import React, { useEffect, useState, useCallback } from 'react'
import OwnerSelect from '../components/buddy/OwnerSelect'
import { createPortal } from 'react-dom'
import { useOutletContext, useLocation } from 'react-router-dom'
import { themes, defaultThemeName } from '../theme/themes'
import { formatMMDDYYYY, getLocalDateString, parseDateString, normalizeToMidnight } from '../utils/date'
import BottomSheet from '../components/common/BottomSheet'
import Modal from '../components/common/Modal'
import TextInput from '../components/common/inputs/TextInput'
import ProtocolEditorModal from '../components/protocols/ProtocolEditorModal'
import QuickStartProtocolModal from '../components/protocols/QuickStartProtocolModal'
import { exportToCSV } from '../utils/export'
import { PlusCircle, Plus, FileText, Clock, ChevronDown, ChevronUp, ChevronRight, Pipette, Pen, Droplets, CalendarCheck, Target, History, CalendarX, Calendar, Settings, TestTubes, Filter, CheckCircle2, XCircle, List, FlaskConical, BookOpenCheck, Edit as EditIcon, Share2, NotebookPen, Edit3, Trash2, X, Image, Copy, Check, Eye, Play, Zap, Download, TrendingUp, AlertTriangle, Search, HelpCircle, Tag, Link2, Package, Pill, Store, DollarSign, StickyNote, Star, CircleDot, Pause, SkipForward, CalendarClock, Lock, ArrowRight } from 'lucide-react'
import SearchableDropdown from '../components/common/SearchableDropdown'
import VendorSuggestInput from '../components/vendors/VendorSuggestInput'
import ColorSwatchDropdown from '../components/common/inputs/ColorSwatchDropdown'
import GlassmorphismDatePicker from '../components/common/GlassmorphismDatePicker'
import TimePicker15Min from '../components/common/inputs/TimePicker15Min'
import { penColors } from '../utils/penColors'
import { formatCurrency } from '../utils/currencyUtils'
import ProtocolCard from '../components/protocols/ProtocolCard'
import ProtocolHistoryModal from '../components/protocols/ProtocolHistoryModal';
import ProtocolHistoryDetailModal from '../components/protocols/ProtocolHistoryDetailModal';
import StartProtocolWizard from '../components/protocols/StartProtocolWizard';
import ProtocolsTipsBanner from '../components/protocols/ProtocolsTipsBanner';
import EditActiveProtocolVials from '../components/protocols/EditActiveProtocolVials';
import ProtocolFollowUpModal from '../components/protocols/ProtocolFollowUpModal';
import EndProtocolAssessment from '../components/protocols/EndProtocolAssessment';
import ShareModal from '../components/common/ShareModal';
import ProtocolNotesModal from '../components/protocols/ProtocolNotesModal';
import VisualSchedulePreview from '../components/protocols/VisualSchedulePreview';
import { useAppContext } from '../context/AppContext';
import { generateId } from '../utils/string';
import { useSubscriptionAccess } from '../utils/useSubscriptionAccess';
import UpgradeModal from '../components/common/UpgradeModal';
import Tabs from '../components/common/Tabs';
import ConfirmationModal from '../components/ui/ConfirmationModal';
import { saveProtocolHistoryEntry, updateProtocolHistoryEntry, findActiveProtocolHistoryEntry, migrateProtocolHistoryEntries, migrateProtocolHistoryCompletionStatus, addVialToActiveProtocol, getProtocolHistory, addNoteToProtocolHistory, updateNoteInProtocolHistory, deleteNoteFromProtocolHistory, getProtocolHistoryEntries, addPhaseEvent } from '../utils/protocolHistory';
import { hasSchedulingChanges, buildSettingsSnapshot, diffProtocolSettings } from '../utils/protocolSettingsHistory';
import { prepareItemForSave } from '../utils/userDataSave';
import CustomDropdown from '../components/common/inputs/CustomDropdown';
import { loadSettings, saveSettings, getDefaultSettings, syncNotificationSettingsToFirestore } from '../utils/settingsHelpers';
import { Lightning, GearSix, Microscope, ChartLine, CaretRight, Bell } from '@phosphor-icons/react';
import ProtocolRemindersSheet from '../components/protocols/ProtocolRemindersSheet';
import pwaNotificationService from '../services/pwaNotifications';
import { Capacitor } from '@capacitor/core';
import { getCurrentDeviceInfo } from '../utils/deviceDetection';
import { encodeShareData, SHARE_BASE_PATH } from '../utils/share';
import { toPng } from 'html-to-image';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import SharedProtocolCard from '../components/share/SharedProtocolCard';
import ReconCalculatorModal from '../components/recon/ReconCalculatorModal';
import { useRef, useMemo } from 'react';
import OwnerFilter from '../components/buddy/OwnerFilter';
import { filterByOwner } from '../utils/buddies';
import AIAnalyzeStackModal from '../components/ai/AIAnalyzeStackModal';
import { featureFlags } from '../config/featureFlags';
import { useTierAccess } from '../utils/useSubscriptionAccess';
import { getDevOverride } from '../utils/devSubscriptionOverride';
import ChooseActiveProtocolModal from '../components/protocols/ChooseActiveProtocolModal';
import { useNavigate } from 'react-router-dom';

/**
 * Shared helper — calculates a protocol's expected end date from startDate + duration/cycle.
 * Returns YYYY-MM-DD string or null. Used by auto-end check, manage-save, and edit-save.
 */
function computeProtocolEndDate(p) {
  try {
    if (!p?.startDate) return null;
    const start = parseDateString(p.startDate);
    if (!start) return null;
    const startNormalized = normalizeToMidnight(start);
    let end = null;
    const cyclePeptide = p.peptides?.find(pep => pep.frequency?.type === 'cycle');

    if (cyclePeptide && p.duration?.noEnd) {
      const onDays = Number(cyclePeptide.frequency.onDays) || 0;
      if (onDays > 0) {
        end = new Date(startNormalized);
        end.setFullYear(end.getFullYear() + 1);
      }
    } else if (cyclePeptide && p.duration && Number(p.duration.count) > 0 && p.duration.unit && !p.duration.noEnd) {
      const onDays = Number(cyclePeptide.frequency.onDays) || 0;
      const offDays = Number(cyclePeptide.frequency.offDays) || 0;
      if (onDays > 0) {
        const durationInDays = (() => {
          const count = Number(p.duration.count);
          const unit = String(p.duration.unit).toLowerCase();
          if (unit.includes('day')) return count;
          if (unit.includes('week')) return count * 7;
          if (unit.includes('month')) return count * 30;
          return 0;
        })();
        const fullCycles = Math.floor(durationInDays / onDays);
        const remainingOn = durationInDays % onDays;
        let total = fullCycles * (onDays + offDays);
        if (remainingOn > 0) total += remainingOn;
        else if (fullCycles > 0) total -= offDays;
        end = new Date(startNormalized);
        end.setDate(end.getDate() + total - 1);
      }
    }

    if (!end && p.duration && !p.duration.noEnd && Number(p.duration.count) > 0 && p.duration.unit) {
      end = new Date(startNormalized);
      const unit = String(p.duration.unit).toLowerCase();
      const count = Number(p.duration.count) || 0;
      if (unit.includes('day')) end.setDate(end.getDate() + count - 1);
      else if (unit.includes('week')) end.setDate(end.getDate() + (count * 7) - 1);
      else if (unit.includes('month')) {
        end.setMonth(end.getMonth() + count);
        end.setDate(end.getDate() - 1);
      }
    }

    return end ? getLocalDateString(end) : null;
  } catch {
    return null;
  }
}

export default function Protocols() {
  const { theme } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const { protocols, setProtocols, addProtocol, updateProtocol, updateProtocolWithForceSync, deleteProtocol, stockpile, setStockpile, reconItems, setReconItems, reconHistory, setReconHistory, orders, vendors, ownerFilter, supplements: contextSupplements } = useAppContext();
  const [aiAnalyzeOpen, setAiAnalyzeOpen] = React.useState(false);
  const { hasAIAccess, canAddProtocol, isFree, caps } = useTierAccess();
  const analyzeEnabled = featureFlags.ENABLE_AI_RESEARCH && hasAIAccess;
  const { isReadOnly, isDowngraded } = useSubscriptionAccess();
  const [activeTab, setActiveTab] = useState('protocols'); // 'protocols' | 'history'
  const [remindersSheetOpen, setRemindersSheetOpen] = useState(false);
  const [openAdd, setOpenAdd] = useState(false)
  const [openQuickStart, setOpenQuickStart] = useState(false)
  const [editing, setEditing] = useState(null)
  const [startConfirm, setStartConfirm] = useState(null)
  const [historyProtocol, setHistoryProtocol] = useState(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [hoveredHistoryId, setHoveredHistoryId] = useState(null);
  const [historyRange, setHistoryRange] = useState('1y'); // '3m' | '6m' | '1y' | '5y'
  const [selectedHistoryEntry, setSelectedHistoryEntry] = useState(null);
  const [startDate, setStartDate] = useState(() => getLocalDateString())
  const [manageConfirm, setManageConfirm] = useState(null);
  const [manageTab, setManageTab] = useState('manage'); // 'manage' | 'edit' | 'notes' | 'share' | 'history'
  const [expandedManageSections, setExpandedManageSections] = useState({
    settings: false, // Protocol Settings collapsed by default
    vials: false // Vials & Delivery Methods collapsed by default
  });
  const [editFromManage, setEditFromManage] = useState(null); // Track if editing from manage modal
  const [historyFromManage, setHistoryFromManage] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeLimitContext, setUpgradeLimitContext] = useState(null);
  const [showChooseModal, setShowChooseModal] = useState(false);
  const [showSlotOpenModal, setShowSlotOpenModal] = useState(false);
  const prevIsDowngradedRef = useRef(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleteFromEditor, setDeleteFromEditor] = useState(null);
  const [followUpProtocol, setFollowUpProtocol] = useState(null);
  const [followUpHistoryId, setFollowUpHistoryId] = useState(null);
  /** After user closes assessment, skip one auto-pending reopen so the sheet doesn't bounce back. */
  const skipPendingFollowUpRef = useRef(false);
  const [protocolFilter, setProtocolFilter] = useState('all'); // 'all' | 'active' | 'inactive'
  const [isNotesModalOpen, setIsNotesModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isHistoryShareModalOpen, setIsHistoryShareModalOpen] = useState(false);
  const [historyShareData, setHistoryShareData] = useState(null);
  const [reconModalOpen, setReconModalOpen] = useState(false);
  const [reconPrefill, setReconPrefill] = useState(null);
  const [showDateChangeTip, setShowDateChangeTip] = useState(false);
  const [dateTipPos, setDateTipPos] = useState(null);
  const [pastRunsExpanded, setPastRunsExpanded] = useState(false);
  const dateChangeTipTimer = useRef(null);
  const dateRowRef = useRef(null);
  
  // Inline tab content state
  const [notes, setNotes] = useState([]);
  const [showAddNoteForm, setShowAddNoteForm] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [newNote, setNewNote] = useState({ 
    content: '', 
    tags: [], 
    linkedDate: getLocalDateString() 
  });
  const [showLinkedDate, setShowLinkedDate] = useState(true);
  
  // Reset showLinkedDate when form opens/closes
  useEffect(() => {
    if (!showAddNoteForm) {
      setShowLinkedDate(true);
    }
  }, [showAddNoteForm]);
  const [notesHistoryEntryId, setNotesHistoryEntryId] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareSaving, setShareSaving] = useState(false);
  const [shareSaved, setShareSaved] = useState(false);
  const shareCardRef = useRef(null);
  const [selectedHistoryEntryForManage, setSelectedHistoryEntryForManage] = useState(null);
  const [followUpProtocolForManage, setFollowUpProtocolForManage] = useState(null);
  const [followUpHistoryIdForManage, setFollowUpHistoryIdForManage] = useState(null);
  
  const NOTE_LABELS = [
    { id: 'progress', label: 'Progress', icon: TrendingUp },
    { id: 'side_effects', label: 'Side Effects', icon: AlertTriangle },
    { id: 'adjustment', label: 'Adjustment', icon: Settings },
    { id: 'observation', label: 'Observation', icon: Search },
    { id: 'question', label: 'Question', icon: HelpCircle }
  ];

  // Debug: log protocol state when Protocols page is viewing protocols
  useEffect(() => {
    const activeCount = (protocols || []).filter(p => p && p.active).length;
    if ((protocols || []).length > 0) {
      console.log('📋 [PROTOCOL-SYNC] Protocols page: protocols state', {
        total: (protocols || []).length,
        activeCount,
        path: location.pathname
      });
    }
  }, [protocols, location.pathname]);

  // Listen for history and user-notes updates to refresh the modal
  useEffect(() => {
    const handleHistoryUpdate = () => {
      setHistoryRefreshKey(prev => prev + 1);
      if (manageTab === 'notes' && manageConfirm) {
        loadNotesForManage();
      }
    };
    const handleUserNotesUpdate = () => {
      if (manageTab === 'notes' && manageConfirm) {
        loadNotesForManage();
      }
    };
    const handleCloudDataLoaded = () => {
      setHistoryRefreshKey(prev => prev + 1);
      if (manageTab === 'notes' && manageConfirm) {
        loadNotesForManage();
      }
    };
    window.addEventListener('tpp:protocol-history-updated', handleHistoryUpdate);
    window.addEventListener('tpp:user-notes-updated', handleUserNotesUpdate);
    window.addEventListener('tpp:cloud-data-loaded', handleCloudDataLoaded);
    return () => {
      window.removeEventListener('tpp:protocol-history-updated', handleHistoryUpdate);
      window.removeEventListener('tpp:user-notes-updated', handleUserNotesUpdate);
      window.removeEventListener('tpp:cloud-data-loaded', handleCloudDataLoaded);
    };
  }, [manageTab, manageConfirm]);

  // Load notes when notes tab is active
  useEffect(() => {
    if (manageTab === 'notes' && manageConfirm) {
      loadNotesForManage();
    }
  }, [manageTab, manageConfirm]);


  // Linked research notes (from Research Notes widget) for current protocol
  const getLinkedResearchNotesForProtocol = (protocolId) => {
    try {
      const raw = localStorage.getItem('tpprover_user_notes');
      const all = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(all) || !protocolId) return [];
      return all
        .filter(n => n && n.protocolId === protocolId)
        .map(n => ({
          id: n.id,
          content: [n.title && n.title !== 'Untitled' ? n.title : null, n.content].filter(Boolean).join('\n'),
          createdAt: n.createdAt,
          tags: [],
          _source: 'research'
        }));
    } catch {
      return [];
    }
  };

  // Load notes for manage modal (protocol history notes + research notes linked to this protocol)
  const loadNotesForManage = () => {
    if (!manageConfirm?.id) return;
    
    const activeEntry = findActiveProtocolHistoryEntry(manageConfirm.id);
    const protocolNotes = (activeEntry?.notes || []).map(n => ({ ...n, _source: 'protocol' }));
    const linkedResearch = getLinkedResearchNotesForProtocol(manageConfirm.id);
    const merged = [...protocolNotes, ...linkedResearch].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    if (activeEntry) {
      setNotesHistoryEntryId(activeEntry.id);
    } else {
      setNotesHistoryEntryId(null);
    }
    setNotes(merged);
  };

  // Notes helper functions
  const handleTagToggle = (tagId, isEditing = false) => {
    if (isEditing && editingNote) {
      setEditingNote({
        ...editingNote,
        tags: editingNote.tags.includes(tagId)
          ? editingNote.tags.filter(id => id !== tagId)
          : [...editingNote.tags, tagId]
      });
    } else {
      setNewNote({
        ...newNote,
        tags: newNote.tags.includes(tagId)
          ? newNote.tags.filter(id => id !== tagId)
          : [...newNote.tags, tagId]
      });
    }
  };

  const handleAddNote = () => {
    if (!newNote.content.trim() && newNote.tags.length === 0) {
      setShowAddNoteForm(false);
      return;
    }

    if (!notesHistoryEntryId) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { message: 'Protocol must be started to add notes.', type: 'error' } 
      }));
      return;
    }

    const noteData = {
      type: 'during',
      content: newNote.content.trim(),
      tags: newNote.tags,
      linkedDate: showLinkedDate ? newNote.linkedDate : null
    };

    if (addNoteToProtocolHistory(notesHistoryEntryId, noteData)) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { message: 'Note added successfully.', type: 'success' } 
      }));
      window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
      loadNotesForManage();
      setNewNote({ content: '', tags: [], linkedDate: getLocalDateString() });
      setShowLinkedDate(true);
      setShowAddNoteForm(false);
    } else {
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { message: 'Failed to add note.', type: 'error' } 
      }));
    }
  };

  const handleSaveEditNote = () => {
    if (!editingNote || !notesHistoryEntryId) return;

    if (!editingNote.content.trim() && editingNote.tags.length === 0) {
      handleDeleteNote(editingNote.id);
      return;
    }

    const updates = {
      content: editingNote.content.trim(),
      tags: editingNote.tags,
      linkedDate: editingNote.showLinkedDate ? editingNote.linkedDate : null
    };

    if (updateNoteInProtocolHistory(notesHistoryEntryId, editingNote.id, updates)) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { message: 'Note updated successfully.', type: 'success' } 
      }));
      window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
      loadNotesForManage();
      setEditingNote(null);
    } else {
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { message: 'Failed to update note.', type: 'error' } 
      }));
    }
  };

  const handleEditNote = (note) => {
    setEditingNote({ ...note });
  };

  const handleDeleteNote = (noteId) => {
    if (!notesHistoryEntryId) return;

    if (window.confirm('Are you sure you want to delete this note?')) {
      if (deleteNoteFromProtocolHistory(notesHistoryEntryId, noteId)) {
        window.dispatchEvent(new CustomEvent('tpp:toast', { 
          detail: { message: 'Note deleted successfully.', type: 'success' } 
        }));
        window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
        loadNotesForManage();
        if (editingNote?.id === noteId) {
          setEditingNote(null);
        }
      } else {
        window.dispatchEvent(new CustomEvent('tpp:toast', { 
          detail: { message: 'Failed to delete note.', type: 'error' } 
        }));
      }
    }
  };

  // Share helper functions
  const getShareUrl = () => {
    if (!manageConfirm) return '';
    const shareData = {
      type: 'protocol',
      protocol: manageConfirm
    };
    const encodedData = encodeShareData(shareData);
    if (!encodedData) return '';
    return `${window.location.origin}${SHARE_BASE_PATH}/protocol/share/${encodedData}`;
  };

  const handleShareImage = async () => {
    if (shareCardRef.current === null) {
      console.error('Card ref is null');
      return;
    }

    const node = shareCardRef.current;

    try {
      const rect = node.getBoundingClientRect();
      await new Promise(resolve => setTimeout(resolve, 500));

      const dataUrl = await toPng(node, { 
        cacheBust: true,
        width: rect.width,
        height: rect.height,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left'
        },
        skipFonts: false,
        skipAutoScale: true,
        useCORS: true,
        allowTaint: true,
        fontEmbedCSS: false,
        filter: (node) => {
          if (node.tagName === 'LINK' && node.href && node.href.includes('fonts.googleapis.com')) {
            return false;
          }
          return true;
        }
      });

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], "shared-card.png", { type: blob.type });

      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                      window.Capacitor || 
                      window.location.protocol === 'capacitor:';
      
      if (isMobile && window.Capacitor) {
        try {
          const base64Data = dataUrl.split(',')[1];
          const protocolName = (manageConfirm?.protocolName || manageConfirm?.name || 'Protocol').replace(/[/\\:*?"<>|]/g, '').trim() || 'Research';
          const d = new Date();
          const mmddyy = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
          const fileName = `${protocolName} Research ${mmddyy}.png`;
          const result = await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.Cache,
          });
          
          await Share.share({
            title: `Check out this Protocol`,
            text: `Shared from The Pep Planner`,
            url: result.uri,
            dialogTitle: 'Share Image',
          });
          
          setTimeout(async () => {
            try {
              await Filesystem.deleteFile({
                path: fileName,
                directory: Directory.Cache,
              });
            } catch (cleanupError) {
              console.log('Could not clean up temporary file:', cleanupError);
            }
          }, 5000);
        } catch (error) {
          console.error('Error with Capacitor native share:', error);
          // Fallback to download
          const link = document.createElement('a');
          link.href = dataUrl;
          link.download = 'shared-card.png';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else if (isMobile && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Check out this Protocol`,
          text: `Shared from The Pep Planner`,
          files: [file],
        });
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'shared-card.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error('Error generating share image:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { message: 'Could not generate image. Please try copying the link instead.', type: 'error' } 
      }));
    }
  };

  const copyShareLinkToClipboard = (text) => {
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text).catch(() => fallbackCopyShareLink(text));
    }
    return Promise.resolve(fallbackCopyShareLink(text));
  };
  const fallbackCopyShareLink = (text) => {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'absolute';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    if (!ok) throw new Error('Copy failed');
  };

  const handleCopyLink = () => {
    const url = getShareUrl();
    if (!url) return;
    copyShareLinkToClipboard(url)
      .then(() => {
        setShareCopied(true);
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent('tpp:toast', {
            detail: { message: 'Link copied to clipboard!', type: 'success' },
          }));
        });
        setTimeout(() => setShareCopied(false), 2000);
      })
      .catch((err) => {
        console.error('Copy failed:', err);
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: { message: 'Could not copy link. Try Share instead.', type: 'error' },
        }));
      });
  };

  const SHARE_SAVE_FOLDER = 'PepPlannerResearch';
  const SHARE_SAVE_FOLDER_DISPLAY = 'Pep Planner Research';

  const handleSaveShareCardToDevice = async () => {
    if (shareCardRef.current === null) return;
    const node = shareCardRef.current;
    setShareSaving(true);
    try {
      const rect = node.getBoundingClientRect();
      await new Promise(resolve => setTimeout(resolve, 300));
      const dataUrl = await toPng(node, {
        cacheBust: true,
        width: rect.width,
        height: rect.height,
        pixelRatio: 2,
        backgroundColor: '#ffffff',
        style: { transform: 'scale(1)', transformOrigin: 'top left' },
        skipFonts: false,
        skipAutoScale: true,
        useCORS: true,
        allowTaint: true,
        fontEmbedCSS: false,
        filter: (n) => !(n.tagName === 'LINK' && n.href && n.href.includes('fonts.googleapis.com')),
      });
      const base64Data = dataUrl.split(',')[1];
      const protocolName = (manageConfirm?.protocolName || manageConfirm?.name || 'Protocol').replace(/[/\\:*?"<>|]/g, '').trim() || 'Research';
      const d = new Date();
      const mmddyy = `${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}${String(d.getFullYear()).slice(-2)}`;
      const fileName = `${protocolName} Research ${mmddyy}.png`;
      const isCapacitor = window.Capacitor?.isNativePlatform?.() ?? !!window.Capacitor;
      if (isCapacitor) {
        try {
          await Filesystem.mkdir({ path: SHARE_SAVE_FOLDER, directory: Directory.Documents, recursive: true });
        } catch (e) {
          if (e?.message && !e.message.includes('exists')) throw e;
        }
        const { uri } = await Filesystem.writeFile({
          path: `${SHARE_SAVE_FOLDER}/${fileName}`,
          data: base64Data,
          directory: Directory.Documents,
        });
        setShareSaved(true);
        setTimeout(() => setShareSaved(false), 2500);
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: { message: `Saved to ${SHARE_SAVE_FOLDER_DISPLAY}`, type: 'success' },
        }));
        try {
          await Share.share({
            title: 'Check out this Protocol',
            text: 'Shared from The Pep Planner',
            url: uri,
            dialogTitle: 'Share image',
          });
        } catch (shareErr) {
          console.warn('Share sheet failed after save:', shareErr);
          window.dispatchEvent(new CustomEvent('tpp:toast', {
            detail: { message: 'Saved. Use Share button to send it.', type: 'info' },
          }));
        }
      } else {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: { message: 'Image downloaded', type: 'success' },
        }));
      }
    } catch (err) {
      console.error('Error saving share card:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Could not save image. Try Share instead.', type: 'error' },
      }));
    } finally {
      setShareSaving(false);
    }
  };

  // History helper functions and data
  const historyEntriesForManage = useMemo(() => {
    if (!manageConfirm?.id) return [];
    const entries = getProtocolHistoryEntries(manageConfirm.id);
    return entries.sort((a, b) => {
      const aTimestamp = a.updatedAt ? new Date(a.updatedAt) : (a.createdAt ? new Date(a.createdAt) : new Date(a.startDate));
      const bTimestamp = b.updatedAt ? new Date(b.updatedAt) : (b.createdAt ? new Date(b.createdAt) : new Date(b.startDate));
      return bTimestamp.getTime() - aTimestamp.getTime();
    });
  }, [manageConfirm?.id, historyRefreshKey]);

  const timelineEntriesForManage = useMemo(() => {
    const entries = [];
    let currentMonthYear = null;
    
    // Filter for finished entries (must have endDate) for grouping, but include ongoing too
    const finishedEntries = historyEntriesForManage.filter(entry => entry.endDate);
    
    finishedEntries.forEach((entry) => {
      // Use endDate for grouping (like main history tab)
      const endDate = new Date(entry.endDate);
      const month = endDate.toLocaleDateString('en-US', { month: 'short' });
      const year = endDate.getFullYear();
      const monthYearKey = `${month} ${year}`;
      
      if (monthYearKey !== currentMonthYear) {
        entries.push({
          type: 'header',
          key: monthYearKey,
          month,
          year,
          date: endDate
        });
        currentMonthYear = monthYearKey;
      }
      
      const startDate = new Date(entry.startDate);
      let durationDays = 0;
      if (entry.endDate) {
        durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
      }
      
      let completionStatus = 'unknown';
      if (entry.endDate) {
        if (entry.completionStatus === 'completed' || entry.completionStatus === 'ended_early' || entry.completionStatus === 'rescheduled' || entry.completionStatus === 'ended_reengagement') {
          completionStatus = entry.completionStatus;
        } else {
          const protocolData = entry.protocolData || {};
          let duration = protocolData.duration || manageConfirm?.duration;
          
          let expectedDurationDays = null;
          if (duration && !duration.noEnd && duration.count > 0 && duration.unit) {
            const unit = String(duration.unit).toLowerCase();
            const count = Number(duration.count) || 0;
            
            if (unit.includes('day')) {
              expectedDurationDays = count;
            } else if (unit.includes('week')) {
              expectedDurationDays = count * 7;
            } else if (unit.includes('month')) {
              expectedDurationDays = count * 30;
            }
          }
          
          if (expectedDurationDays !== null && durationDays > 0) {
            const diffDays = durationDays - expectedDurationDays;
            if (Math.abs(diffDays) <= 2) {
              completionStatus = 'completed';
            } else if (diffDays < -2) {
              completionStatus = 'ended_early';
            } else {
              completionStatus = 'completed';
            }
          } else {
            if (entry.endType === 'completed') {
              completionStatus = 'completed';
            } else if (entry.endType === 'rescheduled') {
              completionStatus = 'rescheduled';
            } else if (entry.endType === 'manual') {
              completionStatus = durationDays <= 2 ? 'completed' : 'ended_early';
            } else {
              completionStatus = 'ended_early';
            }
          }
        }
      }
      
      entries.push({
        type: 'protocol',
        historyEntry: entry,
        durationDays,
        startDate: formatMMDDYYYY(entry.startDate),
        endDate: formatMMDDYYYY(entry.endDate),
        completionStatus
      });
    });
    
    return entries;
  }, [historyEntriesForManage, manageConfirm]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return {
          icon: CalendarCheck,
          label: 'Completed',
          bgColor: theme.isDark ? '#3c4e3a' : '#607c5c',
          textColor: '#dcfce7'
        };
      case 'ended_early':
        return {
          icon: CalendarX,
          label: 'Ended Early',
          bgColor: theme.isDark ? 'rgba(165,182,190,0.22)' : 'rgba(138, 128, 119, 0.16)',
          textColor: theme.isDark ? theme.accent : theme.text
        };
      case 'rescheduled':
        return {
          icon: CalendarClock,
          label: 'Rescheduled',
          bgColor: theme.isDark ? (theme.warningBg || 'rgba(120, 53, 15, 0.35)') : (theme.warningBg || '#FDF8E8'),
          textColor: theme.isDark ? theme.warning : (theme.text || '#1E2B2A')
        };
      default:
        return null;
    }
  };

  const terracottaGradient = 'linear-gradient(135deg, #c87a5c 0%, #b5684a 100%)';
  const terracottaHoverGradient = 'linear-gradient(135deg, #b5684a 0%, #a35a3f 100%)';

  // Migrate existing protocol history entries on mount (assign IDs, preserve all data)
  useEffect(() => {
    const migrationResult = migrateProtocolHistoryEntries();
    if (migrationResult.migrated > 0) {
    }
  }, []);

  // Migrate completion status for existing history entries (recalculate based on planned vs actual duration)
  useEffect(() => {
    const statusMigrationResult = migrateProtocolHistoryCompletionStatus();
    if (statusMigrationResult.updated > 0) {
    }
  }, [protocols]); // Include protocols in dependency to ensure we have protocol data for lookup

  // Listen for autosave events to update protocol cards in real-time
  useEffect(() => {
    const handleProtocolAutosaved = (event) => {
      const { storageKey, formData } = event.detail;
      
      // Only handle autosave events for existing protocols (not new ones)
      if (!storageKey.includes('protocol_draft_') || !formData?.id) return;
      // Don't overwrite when user is in embedded Edit tab - manual save handles it
      if (manageConfirm?.id === formData.id && manageTab === 'edit') return;
      
      updateProtocol(formData);
    };

    window.addEventListener('tpp:protocol-autosaved', handleProtocolAutosaved);
    return () => window.removeEventListener('tpp:protocol-autosaved', handleProtocolAutosaved);
  }, [updateProtocol, manageConfirm?.id, manageTab]);

  // Handle direct navigation to specific protocol (from search)
  useEffect(() => {
    if (location.state?.openProtocolId) {
      const protocolToOpen = protocols.find(p => p.id === location.state.openProtocolId);
      if (protocolToOpen) {
        setEditing(protocolToOpen);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, protocols]);

  // Handle AI-prefilled protocol creation (from PiP chat)
  useEffect(() => {
    if (location.state?.aiPrefill) {
      const prefill = location.state.aiPrefill;
      setEditing({ ...prefill });
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Handle deep-link from To-Do list: open follow-up assessment for a specific history entry
  useEffect(() => {
    if (location.state?.openFollowUpHistoryId && protocols.length > 0) {
      const { openFollowUpHistoryId, openFollowUpProtocolId } = location.state;
      const protocol = protocols.find(p => p.id === openFollowUpProtocolId);
      if (protocol) {
        setFollowUpProtocol(protocol);
        setFollowUpHistoryId(openFollowUpHistoryId);
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, protocols]);

  // Check for pending follow-ups when page loads / protocols change — not right after user dismisses
  useEffect(() => {
    const checkPendingFollowUps = () => {
      try {
        if (skipPendingFollowUpRef.current) {
          skipPendingFollowUpRef.current = false;
          return;
        }
        if (followUpProtocol) return;

        const pending = JSON.parse(localStorage.getItem('tpprover_pending_followups') || '[]');
        if (pending.length > 0) {
          const firstPending = pending[0];
          const protocol = protocols.find(p => p.id === firstPending.protocolId);
          if (protocol) {
            setFollowUpProtocol(protocol);
            setFollowUpHistoryId(firstPending.historyId);
            const remaining = pending.slice(1);
            localStorage.setItem('tpprover_pending_followups', JSON.stringify(remaining));
          } else {
            const remaining = pending.slice(1);
            localStorage.setItem('tpprover_pending_followups', JSON.stringify(remaining));
          }
        }
      } catch (e) {
        console.error('Failed to check pending follow-ups:', e);
      }
    };

    const timer = setTimeout(checkPendingFollowUps, 500);
    return () => clearTimeout(timer);
  }, [protocols, followUpProtocol]);

  const buildProtocolLineage = (proto) => {
    const items = proto.linkedItems || {};
    const lineage = {};

    Object.entries(items).forEach(([peptideId, link]) => {
      const peptide = proto.peptides?.find(p => (p.id || `peptide-${proto.peptides.indexOf(p)}`) === peptideId);
      const entry = { peptideName: peptide?.name || 'Unknown' };

      if (link.vialId) {
        const stockItem = stockpile?.find(s => s.id === link.vialId);
        if (stockItem) {
          entry.vial = {
            stockpileId: stockItem.id,
            name: stockItem.name,
            mg: stockItem.mg,
            vendor: stockItem.vendor || null,
            vendorId: stockItem.vendorId || null,
            cost: stockItem.cost || null,
            purchaseDate: stockItem.purchaseDate || null,
            orderId: stockItem.orderId || null,
          };
          if (stockItem.orderId) {
            const order = orders?.find(o => o.id === stockItem.orderId);
            if (order) {
              entry.order = {
                id: order.id,
                orderNumber: order.publicOrderNumber || null,
                date: order.date || null,
                tracking: order.tracking || null,
                status: order.status || null,
                category: order.category || order.type || null,
              };
            }
          }
          if (stockItem.vendorId || stockItem.vendor) {
            const vendor = vendors?.find(v => v.id === (stockItem.vendorId) || v.name === stockItem.vendor);
            if (vendor) {
              entry.vendor = { id: vendor.id, name: vendor.name };
            }
          }
        }
      }

      if (link.reconId) {
        const reconItem = reconItems?.find(r => r.id === link.reconId);
        if (reconItem) {
          entry.recon = {
            id: reconItem.id,
            date: reconItem.date || null,
            reconStrategy: reconItem.reconStrategy || null,
            water: reconItem.water || null,
            deliveryMethod: reconItem.deliveryMethod || null,
            concentration: reconItem.concentration || null,
          };
        }
      }

      if (link.deliveryMethod) {
        entry.deliveryMethod = link.deliveryMethod;
      }
      entry.status = link.status || null;

      lineage[peptideId] = entry;
    });

    return lineage;
  };

  const endProtocol = (protocolToEnd, { reason = 'ended_early', endDateOverride = null, skipFollowUp = false } = {}) => {
    const today = endDateOverride || getLocalDateString();
    const isReschedule = reason === 'rescheduled';
    const isReengagement = reason === 'ended_reengagement';
    const protocolEndType = isReschedule ? 'rescheduled' : 'manual';
    const updatedProtocol = { ...protocolToEnd, active: false, endDate: today, endType: protocolEndType };
    updateProtocolWithForceSync(updatedProtocol);

    const protocolName = protocolToEnd?.protocolName || protocolToEnd?.name || 'Protocol';
    if (!skipFollowUp) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: {
          message: isReschedule
            ? `${protocolName} was marked as rescheduled.`
            : `${protocolName} has been ended.`,
          type: 'success',
        },
      }));
    }
    
    let activeHistoryEntry = findActiveProtocolHistoryEntry(protocolToEnd.id);
    
    // BUG #5 FIX: If no active history entry exists, create one before ending
    if (!activeHistoryEntry) {
      const historyEntryId = saveProtocolHistoryEntry({
        protocolId: protocolToEnd.id,
        protocolName: protocolToEnd.protocolName || protocolToEnd.name || 'Unnamed Protocol',
        startDate: protocolToEnd.startDate || today,
        protocolData: {
          protocolName: protocolToEnd.protocolName || protocolToEnd.name,
          peptides: protocolToEnd.peptides || [],
          linkedItems: protocolToEnd.linkedItems || {}
        },
        vials: [],
        reconstitutionData: null,
        skippedReconstitution: null
      });
      
      if (historyEntryId) {
        // Find the newly created entry
        const allHistory = getProtocolHistory();
        activeHistoryEntry = allHistory.find(e => e.id === historyEntryId);
      }
    }
    
    if (activeHistoryEntry) {
      const expectedEndDate = updatedProtocol.endDate || updatedProtocol.expectedEndDate;
      let completionStatus = isReschedule
        ? 'rescheduled'
        : isReengagement
          ? 'ended_reengagement'
          : 'ended_early';
      
      if (!isReschedule && !isReengagement && expectedEndDate) {
        const expected = new Date(expectedEndDate);
        const actual = new Date(today);
        const diffDays = Math.abs(actual - expected) / (1000 * 60 * 60 * 24);
        if (diffDays <= 2 && actual <= expected) {
          completionStatus = 'completed';
        }
      }
      
      const skippedReconstitution = {};
      const linkedItems = protocolToEnd.linkedItems || {};
      Object.entries(linkedItems).forEach(([peptideId, item]) => {
        if (item.status === 'skipped' && item.deliveryMethod) {
          const peptide = protocolToEnd.peptides?.find(p => (p.id || `peptide-${protocolToEnd.peptides.indexOf(p)}`) === peptideId);
          skippedReconstitution[peptideId] = {
            peptideName: peptide?.name || 'Unknown',
            deliveryMethod: item.deliveryMethod
          };
        }
      });
      
      const updatedProtocolData = {
        ...(activeHistoryEntry.protocolData || {}),
        linkedItems: linkedItems
      };

      const lineage = buildProtocolLineage(protocolToEnd);
      
      updateProtocolHistoryEntry(activeHistoryEntry.id, {
        endDate: today,
        completionStatus: completionStatus,
        endType: protocolEndType,
        protocolData: updatedProtocolData,
        skippedReconstitution: Object.keys(skippedReconstitution).length > 0 ? skippedReconstitution : null,
        lineage: Object.keys(lineage).length > 0 ? lineage : null
      });
      
      if (!skipFollowUp) {
        setFollowUpProtocol(protocolToEnd);
        setFollowUpHistoryId(activeHistoryEntry.id);
      }
    }
  };
  
  /** Close assessment without re-announcing that the protocol ended (already toasted in endProtocol). */
  const handleAssessmentDismiss = (result) => {
    const isSaveMeta = result && typeof result === 'object' && !result.nativeEvent && (result.saved || result.historyEntryId);
    const historyId = (isSaveMeta && result.historyEntryId) || followUpHistoryId;
    const protocolId = (isSaveMeta && result.protocolId) || followUpProtocol?.id;

    // Prevent pending-queue effect from bouncing the sheet back open
    skipPendingFollowUpRef.current = true;

    // Drop this entry from the auto-prompt queue
    if (historyId || protocolId) {
      try {
        const pending = JSON.parse(localStorage.getItem('tpprover_pending_followups') || '[]');
        const remaining = pending.filter((p) => {
          if (historyId && p.historyId === historyId) return false;
          if (protocolId && p.protocolId === protocolId) return false;
          return true;
        });
        if (remaining.length !== pending.length) {
          localStorage.setItem('tpprover_pending_followups', JSON.stringify(remaining));
        }
      } catch {
        /* ignore */
      }
    }
    setFollowUpProtocol(null);
    setFollowUpHistoryId(null);
    // Defer history refresh so it doesn't remount while the sheet is closing
    queueMicrotask(() => {
      window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
    });
  };

  const handleRestoreProtocol = (protocolId, restoredHistoryEntry) => {
    const targetProtocol = protocols.find(p => p.id === protocolId);
    if (targetProtocol) {
      const reactivated = { ...targetProtocol, active: true, endDate: null, endType: null };
      updateProtocolWithForceSync(reactivated);
    }
    window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
    setHistoryRefreshKey(prev => prev + 1);
  };

  const handleEditFromHistory = (protocolToEdit) => {
    setEditing(protocolToEdit);
    setHistoryProtocol(null);
    setSelectedHistoryEntry(null);
    setSelectedHistoryEntryForManage(null);
  };

  // Check and auto-end protocols that have finished organically
  useEffect(() => {
    // Only run this check once per day to avoid excessive updates
    // v2 key ensures a fresh check runs for all users after the || p.endDate bug was fixed,
    // so protocols that were overdue but never caught now get auto-ended immediately.
    const checkKey = 'tpprover_last_auto_end_check_v2';
    const lastCheck = localStorage.getItem(checkKey);
    const today = getLocalDateString();
    
    // Skip if we already checked today
    if (lastCheck === today) return;
    
    // Use centralized date normalization
    const todayOnly = normalizeToMidnight(new Date());
    let hasUpdates = false;
    const autoCompletedProtocols = [];
    
    protocols.forEach(p => {
      // Skip if already ended or missing startDate; noEnd protocols never auto-complete
      if (p.active === false || !p.startDate || p.duration?.noEnd) return;

      // Use stored endDate if present (set by computeProtocolEndDate on start/edit),
      // otherwise calculate from duration so older protocols without a stored endDate
      // are still caught.
      let calculatedEndDate = null;
      if (p.endDate) {
        const parsed = parseDateString(p.endDate);
        if (parsed) calculatedEndDate = normalizeToMidnight(parsed);
      } else {
        const start = parseDateString(p.startDate);
        const startOnly = normalizeToMidnight(start);
        if (p.duration && !p.duration.noEnd && p.duration.count > 0 && p.duration.unit) {
          calculatedEndDate = new Date(startOnly);
          const unit = String(p.duration.unit).toLowerCase();
          const count = Number(p.duration.count) || 0;
          if (unit.includes('day')) {
            calculatedEndDate.setDate(calculatedEndDate.getDate() + count - 1);
          } else if (unit.includes('week')) {
            calculatedEndDate.setDate(calculatedEndDate.getDate() + (count * 7) - 1);
          } else if (unit.includes('month')) {
            calculatedEndDate.setMonth(calculatedEndDate.getMonth() + count);
            calculatedEndDate.setDate(calculatedEndDate.getDate() - 1);
          }
        }
      }

      // If today is past the end date, mark as finished
      if (calculatedEndDate && todayOnly > calculatedEndDate) {
          const endDateString = p.endDate || getLocalDateString(calculatedEndDate);
          updateProtocolWithForceSync({ ...p, active: false, endDate: endDateString, endType: 'completed' }); // Use force sync for auto-end
          hasUpdates = true;
          
          // Update history entry for this protocol
          const activeHistoryEntry = findActiveProtocolHistoryEntry(p.id);
          if (activeHistoryEntry) {
            // Update protocolData with current linkedItems to preserve all data
            const linkedItems = p.linkedItems || {};
            const updatedProtocolData = {
              ...(activeHistoryEntry.protocolData || {}),
              linkedItems: linkedItems
            };
            
            // Capture skipped reconstitution data
            const skippedReconstitution = {};
            Object.entries(linkedItems).forEach(([peptideId, item]) => {
              if (item.status === 'skipped' && item.deliveryMethod) {
                const peptide = p.peptides?.find(pep => (pep.id || `peptide-${p.peptides.indexOf(pep)}`) === peptideId);
                skippedReconstitution[peptideId] = {
                  peptideName: peptide?.name || 'Unknown',
                  deliveryMethod: item.deliveryMethod
                };
              }
            });
            
            const lineage = buildProtocolLineage(p);

            updateProtocolHistoryEntry(activeHistoryEntry.id, {
              endDate: endDateString,
              completionStatus: 'completed',
              endType: 'completed',
              protocolData: updatedProtocolData,
              skippedReconstitution: Object.keys(skippedReconstitution).length > 0 ? skippedReconstitution : null,
              lineage: Object.keys(lineage).length > 0 ? lineage : null
            });
            
            autoCompletedProtocols.push({
              protocolId: p.id,
              historyId: activeHistoryEntry.id,
              protocolName: p.protocolName || 'Unnamed Protocol'
            });
          }
        }
    });
    
    // Mark that we've checked today
    if (hasUpdates || !lastCheck) {
      localStorage.setItem(checkKey, today);
      
      // Store auto-completed protocols for follow-up prompts
      if (autoCompletedProtocols.length > 0) {
        const existingPending = JSON.parse(localStorage.getItem('tpprover_pending_followups') || '[]');
        const updated = [...existingPending, ...autoCompletedProtocols];
        localStorage.setItem('tpprover_pending_followups', JSON.stringify(updated));
        window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
      }
    }
  }, [protocols, updateProtocol]);

  const projectedDates = React.useMemo(() => {
    if (!startConfirm || !startDate) return { protocolStartDate: null, protocolEndDate: null, washoutStartDate: null, washoutEndDate: null };

    const { duration, washout, peptides } = startConfirm;
    // CRITICAL: Use centralized date parsing to avoid timezone issues
    const start = parseDateString(startDate);
    if (!start) return { protocolStartDate: null, protocolEndDate: null, washoutStartDate: null, washoutEndDate: null };
    
    const startNormalized = normalizeToMidnight(start);
    let endDate = null;

    // Prioritize cycle-based calculation if available
    const cyclePeptide = peptides?.find(p => p.frequency?.type === 'cycle');
    if (cyclePeptide && duration?.count > 0 && duration?.unit) {
        const onDays = Number(cyclePeptide.frequency.onDays) || 0;
        const offDays = Number(cyclePeptide.frequency.offDays) || 0;
        
        if (onDays > 0) {
            const durationInDays = (() => {
                const count = Number(duration.count);
                if (duration.unit.toLowerCase().includes('day')) return count;
                if (duration.unit.toLowerCase().includes('week')) return count * 7;
                if (duration.unit.toLowerCase().includes('month')) return count * 30; // Approximation
                return 0;
            })();

            const fullCycles = Math.floor(durationInDays / onDays);
            const remainingOnDays = durationInDays % onDays;
            
            let totalDays = fullCycles * (onDays + offDays);
            if (remainingOnDays > 0) {
                totalDays += remainingOnDays;
            } else if (fullCycles > 0) {
                totalDays -= offDays; // Don't add last washout period if it ends on a full cycle
            }
            
            endDate = new Date(startNormalized);
            endDate.setDate(endDate.getDate() + totalDays - 1);
        }
    }
    
    // Fallback to original duration logic if no cycle is found
    if (!endDate && duration && !duration.noEnd && duration.count > 0 && duration.unit) {
        endDate = new Date(startNormalized);
        const count = Number(duration.count);
        if (duration.unit.toLowerCase().includes('day')) endDate.setDate(endDate.getDate() + count - 1);
        else if (duration.unit.toLowerCase().includes('week')) endDate.setDate(endDate.getDate() + (count * 7) - 1);
        else if (duration.unit.toLowerCase().includes('month')) {
          endDate.setMonth(endDate.getMonth() + count);
          endDate.setDate(endDate.getDate() - 1);
        }
    }

    let washoutStartDate = null;
    let washoutEndDate = null;
    if (endDate && washout && washout.enabled && washout.count > 0 && washout.unit) {
        washoutStartDate = new Date(endDate);
        washoutStartDate.setDate(washoutStartDate.getDate() + 1);

        washoutEndDate = new Date(washoutStartDate);
        const washoutCount = Number(washout.count);
        if(washout.unit.toLowerCase().includes('day')) washoutEndDate.setDate(washoutEndDate.getDate() + washoutCount - 1);
        else if(washout.unit.toLowerCase().includes('week')) washoutEndDate.setDate(washoutEndDate.getDate() + (washoutCount * 7) - 1);
        else if(washout.unit.toLowerCase().includes('month')) {
          washoutEndDate.setMonth(washoutEndDate.getMonth() + washoutCount);
          washoutEndDate.setDate(washoutEndDate.getDate() - 1);
        }
    }
    
    return {
      protocolStartDate: formatMMDDYYYY(startNormalized),
      protocolEndDate: endDate ? formatMMDDYYYY(endDate) : 'Ongoing',
      washoutStartDate: washoutStartDate ? formatMMDDYYYY(washoutStartDate) : null,
      washoutEndDate: washoutEndDate ? formatMMDDYYYY(washoutEndDate) : null,
    };
}, [startConfirm, startDate]);

  const isActiveNow = React.useCallback((p) => {
    try {
      if (p?.active !== true) return false
      if (!p?.startDate) return false
      const today = normalizeToMidnight(new Date());
      const s = parseDateString(p.startDate);
      if (!s) return false;
      const startNormalized = normalizeToMidnight(s);
      if (today < startNormalized) return false
      // explicit end date wins
      if (p.endDate) {
        const e = parseDateString(p.endDate);
        if (!e) return false;
        const endNormalized = normalizeToMidnight(e);
        return today <= endNormalized;
      }
      const d = p.duration || {}
      if (d.noEnd || !d.count || !d.unit) return true
      const e = new Date(startNormalized)
      if (String(d.unit).toLowerCase() === 'day') e.setDate(e.getDate() + Number(d.count))
      else if (String(d.unit).toLowerCase() === 'week') e.setDate(e.getDate() + Number(d.count) * 7)
      else if (String(d.unit).toLowerCase() === 'month') e.setMonth(e.getMonth() + Number(d.count))
      return today <= normalizeToMidnight(e)
    } catch { return false }
  }, [])

  React.useEffect(() => {
    const onOpenNew = () => setOpenAdd(true)
    window.addEventListener('tpp:open_protocol_new', onOpenNew)
    return () => window.removeEventListener('tpp:open_protocol_new', onOpenNew)
  }, [])

  const onImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      let rows = []
      if (file.name.toLowerCase().endsWith('.json')) {
        rows = JSON.parse(text)
      } else {
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
        if (lines.length <= 1) throw new Error('empty-csv')
        const delimiter = lines[0].includes('\t') ? '\t' : ','
        const split = (s) => s.split(new RegExp(`${delimiter}`))
        const header = split(lines[0]).map(h => h.trim().toLowerCase())
        const find = (alts) => header.findIndex(h => alts.some(a => h.includes(a)))
        const nameIdx = find(['name','peptide','protocol'])
        const purposeIdx = find(['purpose','goal','desc'])
        const countIdx = find(['count','times','#'])
        const perIdx = find(['per','period','day','week','month'])
        const timeIdx = find(['time','slot','am','pm'])
        const durCountIdx = find(['duration','dur count','duration count'])
        const durUnitIdx = find(['dur unit','duration unit','unit'])
        const noEndIdx = find(['no end','open'])
        for (let i=1;i<lines.length;i++) {
          const cols = split(lines[i]).map(c => c.trim())
          const name = nameIdx>=0 ? cols[nameIdx] : cols[0]
          const purpose = purposeIdx>=0 ? cols[purposeIdx] : ''
          const count = countIdx>=0 ? Number(cols[countIdx])||1 : 1
          const per = perIdx>=0 ? (cols[perIdx]||'Day') : 'Day'
          const timeVal = (timeIdx>=0 ? cols[timeIdx] : 'AM').toUpperCase()
          const times = timeVal.includes('AM') && timeVal.includes('PM') ? ['AM','PM'] : (timeVal.includes('PM') ? ['PM'] : ['AM'])
          const dCount = durCountIdx>=0 ? Number(cols[durCountIdx])||0 : 0
          const dUnit = durUnitIdx>=0 ? (cols[durUnitIdx]||'Week') : 'Week'
          const noEnd = noEndIdx>=0 ? /true|1|yes/i.test(cols[noEndIdx]) : false
          rows.push(prepareItemForSave({ // Add timestamps to imported protocols
            id: generateId(), 
            name, 
            purpose, 
            frequency: { count, per, time: times }, 
            duration: { count: dCount, unit: dUnit, noEnd }
          }, { isNew: true }));
        }
      }
      if (rows.length > 0) {
        // Add all protocols at once
        rows.forEach(row => addProtocol(row));
        window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: `Imported ${rows.length} peptides`, type: 'success' } }))
      }
    } catch (err) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Import failed. Use CSV/JSON with name, purpose, count, per, time, duration.', type: 'error' } }))
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const ensureCanAddProtocol = useCallback(() => {
    if (isReadOnly) {
      setUpgradeLimitContext(null);
      setShowUpgradeModal(true);
      return false;
    }
    if (!canAddProtocol) {
      setUpgradeLimitContext({ feature: 'protocols', current: caps.protocolCount, max: caps.maxActiveProtocols });
      setShowUpgradeModal(true);
      return false;
    }
    return true;
  }, [isReadOnly, canAddProtocol, caps]);

  const protocolAddActions = React.useMemo(() => [
    {
      label: 'Quick Start',
      Icon: Lightning,
      onClick: () => {
        if (!ensureCanAddProtocol()) return;
        setOpenQuickStart(true);
      },
    },
    {
      label: 'Full Setup',
      Icon: GearSix,
      onClick: () => {
        if (!ensureCanAddProtocol()) return;
        setOpenAdd(true);
      },
    },
    {
      label: 'Reminders',
      Icon: Bell,
      onClick: () => setRemindersSheetOpen(true),
    },
  ], [ensureCanAddProtocol]);

  const handleEditClick = useCallback((protocol) => {
    if (isReadOnly) {
      setShowUpgradeModal(true);
      return;
    }
    setEditing(protocol);
    // Close any other open modals
    setStartConfirm(null);
    setManageConfirm(null);
    setOpenAdd(false);
  }, [isReadOnly]);

  const handleStartClick = useCallback((protocol, opts) => {
    if (isReadOnly) {
      setShowUpgradeModal(true);
      return;
    }
    // Block starting a *new* active protocol when the free cap is reached.
    // Managing an already-active protocol does not consume another slot — always allow it.
    // (heldByFreePlan protocols are exempted — their slot-open logic handles them)
    const managingExistingActive = opts?.manage === true && protocol?.active === true;
    if (!managingExistingActive && !canAddProtocol && !protocol?.heldByFreePlan) {
      setShowUpgradeModal(true);
      return;
    }
    // Clear the held flag so the protocol enters the wizard cleanly.
    // Mark resume-from-hold so the wizard shows “resume” copy and keeps/restores draft on this device.
    const p = { ...protocol };
    if (p.heldByFreePlan) {
      p.heldByFreePlan = false;
      p._wizardResumeFromHold = true;
    } else if (p._wizardResumeFromHold !== true) {
      delete p._wizardResumeFromHold;
    }
    if (opts?.manage) {
      setManageConfirm(p);
      setPastRunsExpanded(false);
      setStartConfirm(null);
      setEditing(null);
    } else {
      setStartConfirm(p);
      setStartDate(p.startDate || getLocalDateString());
      // Close any other open modals
      setManageConfirm(null);
      setEditing(null);
      setOpenAdd(false);
    }
  }, [isReadOnly, canAddProtocol]);

  // Allow deletion in read-only mode - users can manage their sensitive data
  const handleDeleteClick = (protocol) => {
    deleteProtocol(protocol.id);
  };

  // Load reminder settings
  const [reminderSettings, setReminderSettings] = useState(() => {
    const settings = loadSettings();
    const defaults = getDefaultSettings();
    return {
      amEnabled: settings?.notifications?.researchRemindersAM ?? defaults.notifications.researchRemindersAM ?? false,
      amTime: settings?.notifications?.researchReminderTimeAM ?? defaults.notifications.researchReminderTimeAM ?? '08:00',
      pmEnabled: settings?.notifications?.researchRemindersPM ?? defaults.notifications.researchRemindersPM ?? false,
      pmTime: settings?.notifications?.researchReminderTimePM ?? defaults.notifications.researchReminderTimePM ?? '18:00'
    };
  });

  // Push notification status
  const [pushNotificationStatus, setPushNotificationStatus] = useState({
    supported: false,
    enabled: false,
    loading: false
  });

  // Check push notification status on mount and when settings change
  useEffect(() => {
    const updatePushStatus = () => {
      const status = pwaNotificationService.getStatus();
      const isNative = Capacitor.isNativePlatform();
      const settings = loadSettings();
      
      const pushEnabled = status.enabled || settings?.notifications?.push === true;
      
      setPushNotificationStatus({
        supported: status.supported || isNative,
        enabled: pushEnabled,
        loading: false
      });
    };

    updatePushStatus();

    const handleEnabled = () => updatePushStatus();
    const handleDisabled = () => updatePushStatus();
    
    // Listen for settings changes (when user toggles push in settings page)
    const handleSettingsChange = () => {
      updatePushStatus();
    };
    window.addEventListener('storage', handleSettingsChange);

    window.addEventListener('pwa-notifications-enabled', handleEnabled);
    window.addEventListener('pwa-notifications-disabled', handleDisabled);

    // Also check periodically for changes
    const interval = setInterval(updatePushStatus, 2000);

    return () => {
      window.removeEventListener('pwa-notifications-enabled', handleEnabled);
      window.removeEventListener('pwa-notifications-disabled', handleDisabled);
      window.removeEventListener('storage', handleSettingsChange);
      clearInterval(interval);
    };
  }, []);

  // Sync reminder enabled state with push notification status
  useEffect(() => {
    if (!pushNotificationStatus.enabled && reminderSettings.enabled) {
      setReminderSettings(prev => ({ ...prev, enabled: false, amEnabled: false, pmEnabled: false }));
      const settings = loadSettings();
      const defaults = getDefaultSettings();
      const updatedSettings = {
        ...defaults,
        ...settings,
        notifications: {
          ...defaults.notifications,
          ...(settings?.notifications || {}),
          researchReminders: false,
          researchRemindersAM: false,
          researchRemindersPM: false,
        }
      };
      saveSettings(updatedSettings);
      syncNotificationSettingsToFirestore();
    }
  }, [pushNotificationStatus.enabled]);

  // Update reminder settings
  const updateReminderSetting = async (key, value) => {
    // If enabling research reminders (AM or PM), check if push notifications are enabled
    if ((key === 'amEnabled' || key === 'pmEnabled') && value === true && !pushNotificationStatus.enabled) {
      // Clear cooldown period to allow permission request
      // User is actively trying to enable notifications, so override the 15-day cooldown
      localStorage.removeItem('tpprover_notification_prompt_last_shown');
      sessionStorage.removeItem('tpprover_notification_dismissed_this_session');
      
      // Set flag to bypass cooldown in NotificationPermissionPrompt
      localStorage.setItem('tpprover_user_requesting_permissions', 'true');
      
      // Request push notification permissions
      setPushNotificationStatus(prev => ({ ...prev, loading: true }));
      
      try {
        let permissionGranted = false;
        
        if (Capacitor.isNativePlatform()) {
          // Native app - use Capacitor
          try {
            const { LocalNotifications } = await import('@capacitor/local-notifications');
            const result = await LocalNotifications.requestPermissions();
            permissionGranted = result.display === 'granted';
            
            // Also request push notification permissions if available
            try {
              const { PushNotifications } = await import('@capacitor/push-notifications');
              
              // Add listener BEFORE registering to catch token immediately
              PushNotifications.addListener('registration', async (token) => {
                try {
                  const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
                  const { db } = await import('../config/firebase');
                  const user = JSON.parse(localStorage.getItem('tpprover_user') || 'null');
                  const userId = user.uid || user.email?.toLowerCase();
                  
                  if (userId) {
                    const userRef = doc(db, 'users', userId);
                    await setDoc(userRef, {
                      fcmToken: token.value,
                      pushToken: token.value, // Backward compatibility
                      notificationSettings: {
                        push: true,
                        pushEnabled: true,
                        researchRemindersAM: reminderSettings.amEnabled,
                        researchReminderTimeAM: reminderSettings.amTime,
                        researchRemindersPM: reminderSettings.pmEnabled,
                        researchReminderTimePM: reminderSettings.pmTime,
                        lastUpdated: serverTimestamp()
                      },
                      deviceInfo: getCurrentDeviceInfo(),
                    }, { merge: true });
                    console.log('✅ FCM token saved to Firestore');
                  }
                } catch (error) {
                  console.error('Failed to save FCM token:', error);
                }
              });
              
              const pushResult = await PushNotifications.requestPermissions();
              if (pushResult.receive === 'granted') {
                await PushNotifications.register();
              }
            } catch (e) {
              console.warn('Push notifications not available:', e);
            }
          } catch (error) {
            throw new Error('Failed to request native notification permissions');
          }
        } else {
          // PWA - use browser API
          await pwaNotificationService.enable();
          // Safety check for Notification API (not available on native apps)
          permissionGranted = typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined'
            ? Notification.permission === 'granted'
            : false;
        }
        
        if (permissionGranted) {
          // Clear the bypass flag since permission was granted
          localStorage.removeItem('tpprover_user_requesting_permissions');
          
          // Enable push notifications in settings
          const currentSettings = loadSettings();
          const defaults = getDefaultSettings();
          const updatedSettings = {
            ...defaults,
            ...currentSettings,
            notifications: {
              ...defaults.notifications,
              ...(currentSettings?.notifications || {}),
              push: true,
              [key]: true, // Enable the specific reminder (amEnabled or pmEnabled)
              [`researchReminderTime${key === 'amEnabled' ? 'AM' : 'PM'}`]: reminderSettings[key === 'amEnabled' ? 'amTime' : 'pmTime']
            }
          };
          saveSettings(updatedSettings);
          
          // Update push status
          setPushNotificationStatus(prev => ({ ...prev, enabled: true, loading: false }));
          
          // Update reminder settings
          const newSettings = { ...reminderSettings, [key]: true };
          setReminderSettings(newSettings);
          
          // Sync to Firestore
          await syncNotificationSettingsToFirestore();
          
          // Show success message
          window.dispatchEvent(new CustomEvent('tpp:toast', { 
            detail: { 
              message: '🎉 Push notifications enabled! Research reminders are now active.', 
              type: 'success' 
            } 
          }));
        } else {
          // Clear the bypass flag if permission was denied
          localStorage.removeItem('tpprover_user_requesting_permissions');
          throw new Error('Permission was not granted');
        }
      } catch (error) {
        console.error('Failed to enable push notifications:', error);
        // Clear the bypass flag on error
        localStorage.removeItem('tpprover_user_requesting_permissions');
        setPushNotificationStatus(prev => ({ ...prev, loading: false }));
        
        window.dispatchEvent(new CustomEvent('tpp:toast', { 
          detail: { 
            message: 'Failed to enable notifications. Please enable them in your device settings.', 
            type: 'error' 
          } 
        }));
        
        // Don't enable reminders if push failed
        return;
      }
    } else {
      // Normal update (not enabling reminders, or push is already enabled)
      const newSettings = { ...reminderSettings, [key]: value };
      setReminderSettings(newSettings);
      
      // Update localStorage
      const currentSettings = loadSettings();
      const defaults = getDefaultSettings();
      
      // Map reminder settings to notification settings
      const notificationUpdates = {};
      if (key === 'amEnabled') {
        notificationUpdates.researchRemindersAM = value;
      } else if (key === 'pmEnabled') {
        notificationUpdates.researchRemindersPM = value;
      } else if (key === 'amTime') {
        notificationUpdates.researchReminderTimeAM = value;
      } else if (key === 'pmTime') {
        notificationUpdates.researchReminderTimePM = value;
      }

      // Keep master toggle in sync: on if either AM or PM is on; off if both are off
      const finalAM = key === 'amEnabled' ? value : newSettings.amEnabled;
      const finalPM = key === 'pmEnabled' ? value : newSettings.pmEnabled;
      notificationUpdates.researchReminders = finalAM || finalPM;

      const updatedSettings = {
        ...defaults,
        ...currentSettings,
        notifications: {
          ...defaults.notifications,
          ...(currentSettings?.notifications || {}),
          ...notificationUpdates,
          researchRemindersAM: newSettings.amEnabled,
          researchReminderTimeAM: newSettings.amTime,
          researchRemindersPM: newSettings.pmEnabled,
          researchReminderTimePM: newSettings.pmTime
        }
      };
      saveSettings(updatedSettings);
      
      // Sync to Firestore
      await syncNotificationSettingsToFirestore();
    }
  };

  // Keep topbar tabs / FAB dial in sync — do NOT clear on every dep change
  // (clearing in the update effect's cleanup blanks the bar between renders).
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('tpp:set-topbar-tabs', {
      detail: {
        tabs: [
          { value: 'protocols', label: 'Protocols' },
          { value: 'history', label: 'History' },
        ],
        activeTab,
        onTabChange: setActiveTab,
        actionItems: protocolAddActions,
        actionDisabled: isReadOnly,
      },
    }));
  }, [activeTab, isReadOnly, protocolAddActions]);

  // Clear topbar + search listener only when leaving the Protocols page
  useEffect(() => {
    const handleSearch = (e) => {
      setSearchQuery(e.detail.query);
    };
    window.addEventListener('tpp:protocols-search', handleSearch);
    return () => {
      window.dispatchEvent(new CustomEvent('tpp:clear-topbar-tabs'));
      window.removeEventListener('tpp:protocols-search', handleSearch);
    };
  }, []);

  const filteredProtocols = React.useMemo(() => {
    const byOwner = filterByOwner(protocols, ownerFilter);
    if (!searchQuery) return byOwner;
    const query = searchQuery.toLowerCase();
    return byOwner.filter(p => {
      const protocolName = (p.protocolName || p.name || '').toLowerCase();
      return protocolName.includes(query);
    });
  }, [protocols, searchQuery, ownerFilter]);

  // Organize protocols: active first, then held-by-free-plan, then inactive
  const organizedProtocols = React.useMemo(() => {
    const protocolsToOrganize = Array.isArray(filteredProtocols) ? filteredProtocols : [];
    const active = [];
    const heldByFreePlan = [];
    const inactive = [];

    protocolsToOrganize.forEach(p => {
      // Only treat a protocol as "held" while free-tier caps are actually
      // enforced. When the dev toggle is on Trial/Real or the user has an
      // active subscription, caps.enforced is false and the stale
      // heldByFreePlan flag is ignored — protocols fall back to active/inactive.
      if (p.heldByFreePlan === true && caps.enforced) {
        heldByFreePlan.push(p);
      } else {
        const isActive = p.active === true || isActiveNow(p);
        if (isActive) {
          active.push(p);
        } else {
          inactive.push(p);
        }
      }
    });

    const sortByName = (a, b) => {
      const nameA = (a.name || a.protocolName || '').toLowerCase();
      const nameB = (b.name || b.protocolName || '').toLowerCase();
      return nameA.localeCompare(nameB);
    };

    active.sort(sortByName);
    heldByFreePlan.sort(sortByName);
    inactive.sort(sortByName);

    return { active, heldByFreePlan, inactive };
  }, [filteredProtocols, isActiveNow, caps.enforced]);

  // ── Free-tier downgrade: auto-hold logic ───────────────────────────────
  // Show "choose one active protocol" modal when free caps kick in and
  // more than one active protocol exists.
  // DEV: never trigger real Firestore mutations while the dev override is active —
  // that would corrupt live protocol data (linkedItems, penColor, etc.).
  React.useEffect(() => {
    if (import.meta.env.DEV && getDevOverride() !== 'off') return;
    if (caps.enforced && organizedProtocols.active.length > 1) {
      setShowChooseModal(true);
    }
  }, [caps.enforced, organizedProtocols.active.length]);

  // Show "slot open — pick from held" modal when the active slot clears
  // and held protocols are waiting.
  React.useEffect(() => {
    if (import.meta.env.DEV && getDevOverride() !== 'off') return;
    if (
      caps.enforced &&
      organizedProtocols.active.length === 0 &&
      organizedProtocols.heldByFreePlan.length > 0
    ) {
      setShowSlotOpenModal(true);
    }
  }, [caps.enforced, organizedProtocols.active.length, organizedProtocols.heldByFreePlan.length]);

  // When user resubscribes (isDowngraded flips to false), clear all held flags
  // so protocols return to normal inactive state ready to be re-activated.
  // DEV: skip when the dev override drove the isDowngraded transition — we never
  // want a toggle-back to write heldByFreePlan:false to real documents.
  React.useEffect(() => {
    if (import.meta.env.DEV && getDevOverride() !== 'off') {
      prevIsDowngradedRef.current = isDowngraded;
      return;
    }
    if (prevIsDowngradedRef.current === true && isDowngraded === false) {
      const held = (protocols || []).filter(p => p.heldByFreePlan === true);
      held.forEach(p => updateProtocolWithForceSync({ ...p, heldByFreePlan: false }));
    }
    prevIsDowngradedRef.current = isDowngraded;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDowngraded]);

  // User chose one protocol to keep active — hold everything else
  const handleChooseProtocol = React.useCallback((chosenId) => {
    // Safety: never write to Firestore while the dev tier override is active
    if (import.meta.env.DEV && getDevOverride() !== 'off') {
      setShowChooseModal(false);
      return;
    }
    organizedProtocols.active.forEach(p => {
      if (p.id !== chosenId) {
        updateProtocolWithForceSync({
          ...p,
          active: false,
          heldByFreePlan: true,
          heldAt: new Date().toISOString(),
        });
      }
    });
    setShowChooseModal(false);
  }, [organizedProtocols.active, updateProtocolWithForceSync]);

  // User is resuming a held protocol into the open slot
  const handleResumeHeldProtocol = React.useCallback((chosenId) => {
    setShowSlotOpenModal(false);
    if (!chosenId) return;
    const p = organizedProtocols.heldByFreePlan.find(h => h.id === chosenId);
    if (p) {
      // Clear the hold flag and open the start wizard (resume UX + draft)
      handleStartClick({ ...p, heldByFreePlan: false, _wizardResumeFromHold: true });
    }
  }, [organizedProtocols.heldByFreePlan, handleStartClick]);

  // Check for draft start protocol data
  const hasDraftStart = React.useCallback((protocolId) => {
    try {
      const storageKey = `tpprover_start_protocol_draft_${protocolId}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsedData = JSON.parse(saved);
        const savedState =
          parsedData?.data && typeof parsedData.data === 'object'
            ? parsedData.data
            : typeof parsedData === 'object' && parsedData?.linkedData
              ? parsedData
              : null;
        const linked = savedState?.linkedData;
        return !!(linked && typeof linked === 'object' && Object.keys(linked).length > 0);
      }
    } catch (e) {
      return false;
    }
    return false;
  }, []);

  // Memoize dropdown options to prevent blank dropdown on first render
  // Ensure organizedProtocols is always defined with safe defaults
  const protocolFilterOptions = React.useMemo(() => {
    const activeCount = organizedProtocols?.active?.length ?? 0;
    const heldCount = organizedProtocols?.heldByFreePlan?.length ?? 0;
    const inactiveCount = organizedProtocols?.inactive?.length ?? 0;
    const totalCount = activeCount + heldCount + inactiveCount;
    
    return [
      { 
        value: 'all', 
        label: `All Protocols (${totalCount})`,
        icon: <List size={16} style={{ color: theme.textLight }} />
      },
      { 
        value: 'active', 
        label: `Active Only (${activeCount})`,
        icon: <CheckCircle2 size={16} style={{ color: theme.primary }} />
      },
      { 
        value: 'inactive', 
        label: `Inactive Only (${inactiveCount})`,
        icon: <XCircle size={16} style={{ color: '#6b7280' }} />
      }
    ];
  }, [organizedProtocols?.active?.length, organizedProtocols?.heldByFreePlan?.length, organizedProtocols?.inactive?.length, theme.textLight, theme.primary]);

  return (
    <div className="page-bg space-y-3 px-2 pt-3 pb-4 sm:px-4 sm:pt-4 md:px-6 lg:px-8">
      <ProtocolsTipsBanner theme={theme} />

        {/* Content based on active tab */}
        {activeTab === 'protocols' && (
          <div>
            {protocols.length > 0 && (
              <div className="mb-3 flex items-center gap-2 flex-wrap empty:hidden">
                <OwnerFilter theme={theme} />
              </div>
            )}
            {/* Filter Dropdown */}
            {protocols.length > 0 && (
              <div className="mb-4">
                <CustomDropdown
                  value={protocolFilter}
                  onChange={setProtocolFilter}
                  options={protocolFilterOptions}
                  theme={theme}
                  placeholder="Filter protocols..."
                  outlined={true}
                  customShadow={true}
                />
              </div>
            )}

            {filteredProtocols.length === 0 ? (
              searchQuery ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
                    <FileText size={32} style={{ color: theme.primary }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>No Results Found</h3>
                  <p className="text-sm" style={{ color: theme.textLight }}>
                    No protocols match your search query.
                  </p>
                </div>
              ) : protocols.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
                    <FileText size={32} style={{ color: theme.primary }} />
                  </div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>No Protocols Yet</h3>
                  <p className="text-sm mb-6 max-w-md" style={{ color: theme.textLight }}>
                    Create a protocol to track dosing, timing, and adherence.
                  </p>
                  {!isReadOnly && (
                    <div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
                      <button
                        onClick={() => setOpenQuickStart(true)}
                        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all hover:opacity-90 hover:scale-105 btn-primary-inset"
                        style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}
                      >
                        <Zap size={18} fill="currentColor" />
                        Quick Start (30 sec)
                      </button>
                      <button
                        onClick={() => setOpenAdd(true)}
                        className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90"
                        style={{ 
                          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.secondary, 
                          color: theme.text,
                          border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
                        }}
                      >
                        <Settings size={16} />
                        Full Setup
                      </button>
                    </div>
                  )}
                </div>
              ) : null
            ) : (
              <div className="space-y-6">

                {/* ── Free-plan: slot open banner ──────────────────────────── */}
                {caps.enforced &&
                  organizedProtocols.active.length === 0 &&
                  organizedProtocols.heldByFreePlan.length > 0 && (
                  <div
                    className="rounded-xl p-4 flex items-start gap-3"
                    style={{
                      backgroundColor: theme.isDark ? 'rgba(99,185,131,0.10)' : 'rgba(22,163,74,0.07)',
                      border: '1px solid rgba(22,163,74,0.30)',
                    }}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(22,163,74,0.15)' }}>
                      <Play size={14} style={{ color: '#16A34A' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: theme.text }}>
                        Your protocol slot is open
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>
                        {organizedProtocols.heldByFreePlan.length} held protocol{organizedProtocols.heldByFreePlan.length > 1 ? 's are' : ' is'} ready to resume.
                        Pick one below or start a new protocol.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowSlotOpenModal(true)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all hover:opacity-80"
                      style={{ backgroundColor: 'rgba(22,163,74,0.15)', color: '#16A34A' }}
                    >
                      Pick one
                    </button>
                  </div>
                )}

                {/* Active Protocols Section */}
                {(protocolFilter === 'all' || protocolFilter === 'active') && organizedProtocols.active.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1 w-full min-w-0">
                      <CircleDot size={14} className="opacity-40 shrink-0" style={{ color: theme.text }} />
                      <h2
                        className="text-xs font-semibold uppercase tracking-wider opacity-40 shrink-0"
                        style={{ color: theme.text }}
                      >
                        Active ({organizedProtocols.active.length})
                      </h2>
                      {caps.enforced && caps.maxActiveProtocols !== null && (
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 opacity-80"
                          style={{
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                            color: theme.textLight,
                          }}
                        >
                          {organizedProtocols.active.length}/{caps.maxActiveProtocols} free
                        </span>
                      )}
                      <div
                        className="flex-1 h-px min-w-0"
                        style={{
                          background: `linear-gradient(to right, ${theme.primary}55 0%, ${theme.primary}22 45%, transparent 100%)`,
                        }}
                      />
                      {analyzeEnabled && (
                        <button
                          type="button"
                          onClick={() => setAiAnalyzeOpen(true)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide shrink-0 transition-all hover:opacity-95 active:scale-[0.98]"
                          style={{
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : '#ffffff',
                            color: theme.primary || '#7F9E95',
                            border: `1px solid ${theme.isDark ? `${theme.primary || '#7F9E95'}55` : `${theme.primary || '#7F9E95'}45`}`,
                            boxShadow: theme.isDark
                              ? `inset 0 1px 0 rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.35), 0 0 0 1px ${theme.primary || '#7F9E95'}18`
                              : `inset 0 1px 0 rgba(255,255,255,0.95), 0 1px 3px rgba(0,0,0,0.08), 0 2px 6px ${(theme.primary || '#7F9E95')}22`,
                          }}
                        >
                          <Microscope size={13} weight="duotone" />
                          Analyze stack
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {organizedProtocols.active.map(p => (
                        <ProtocolCard 
                          key={p.id}
                          item={p}
                          theme={theme}
                          isActive={true}
                          onStartClick={handleStartClick}
                          onEditClick={handleEditClick}
                          onHistoryClick={setHistoryProtocol}
                          hasDraftStart={hasDraftStart(p.id)}
                          onUpdateProtocol={(updated, meta) => {
                            updateProtocolWithForceSync(updated);
                            if (meta?.phaseEvent) {
                              const activeEntry = findActiveProtocolHistoryEntry(updated.id);
                              if (activeEntry) addPhaseEvent(activeEntry.id, meta.phaseEvent);
                            }
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Held by Free Plan Section ────────────────────────── */}
                {(protocolFilter === 'all' || protocolFilter === 'inactive') &&
                  organizedProtocols.heldByFreePlan.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <Lock size={13} style={{ color: theme.textLight }} />
                      <h2
                        className="text-sm font-semibold uppercase tracking-wider"
                        style={{ color: theme.textLight }}
                      >
                        Held by Free Plan
                      </h2>
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                          color: theme.textLight,
                        }}
                      >
                        {organizedProtocols.heldByFreePlan.length}
                      </span>
                      <button
                        onClick={() => setShowUpgradeModal(true)}
                        className="ml-auto text-xs font-semibold flex items-center gap-1 transition-all hover:opacity-70"
                        style={{ color: theme.primary }}
                      >
                        Upgrade to restore
                        <ArrowRight size={11} />
                      </button>
                    </div>

                    <div
                      className="rounded-xl p-3 mb-1"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                        border: `1px solid ${theme.border}`,
                      }}
                    >
                      <p className="text-xs" style={{ color: theme.textLight }}>
                        These protocols are paused while you're on the free plan. Your data is fully preserved and exportable. When your active slot opens, you can resume one.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                      {organizedProtocols.heldByFreePlan.map(p => (
                        <ProtocolCard
                          key={p.id}
                          item={p}
                          theme={theme}
                          isActive={false}
                          freeLocked={true}
                          slotOpen={organizedProtocols.active.length === 0}
                          onStartClick={handleStartClick}
                          onEditClick={handleEditClick}
                          onHistoryClick={setHistoryProtocol}
                          hasDraftStart={false}
                          compact={true}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Library (Inactive) Protocols Section */}
                {(protocolFilter === 'all' || protocolFilter === 'inactive') && organizedProtocols.inactive.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 px-1 w-full min-w-0">
                      <BookOpenCheck size={14} className="opacity-40 shrink-0" style={{ color: theme.text }} />
                      <h2
                        className="text-xs font-semibold uppercase tracking-wider opacity-40 shrink-0"
                        style={{ color: theme.text }}
                      >
                        Your Library ({organizedProtocols.inactive.length})
                      </h2>
                      <div
                        className="flex-1 h-px min-w-0"
                        style={{
                          background: `linear-gradient(to right, ${theme.primary}55 0%, ${theme.primary}22 45%, transparent 100%)`,
                        }}
                      />
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
                      {organizedProtocols.inactive.map(p => (
                        <ProtocolCard
                          key={p.id}
                          item={p}
                          theme={theme}
                          isActive={false}
                          onStartClick={handleStartClick}
                          onEditClick={handleEditClick}
                          onHistoryClick={setHistoryProtocol}
                          hasDraftStart={hasDraftStart(p.id)}
                          compact={true}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* No results based on filter */}
                {((protocolFilter === 'active' && organizedProtocols.active.length === 0) ||
                  (protocolFilter === 'inactive' && organizedProtocols.inactive.length === 0 && organizedProtocols.heldByFreePlan.length === 0)) && (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
                      <FileText size={32} style={{ color: theme.primary }} />
                    </div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
                      No {protocolFilter === 'active' ? 'Active' : 'Inactive'} Protocols
                    </h3>
                    <p className="text-sm" style={{ color: theme.textLight }}>
                      {protocolFilter === 'active' 
                        ? 'Start a protocol to see it here.' 
                        : 'Inactive protocols will appear here once you end them.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="relative pt-1">
            {(() => {
              // ── data ────────────────────────────────────────────────────────
              const allHistoryEntries = getProtocolHistory();
              const finishedEntries = allHistoryEntries.filter(e => e.endDate && e.protocolId);

              if (finishedEntries.length === 0) {
                return (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}15` }}>
                      <Clock size={32} style={{ color: theme.primary }} />
                    </div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>No history yet</h3>
                    <p className="text-xs" style={{ color: theme.textLight }}>Complete a protocol to see it here.</p>
                  </div>
                );
              }

              // ── time window ─────────────────────────────────────────────────
              const rangeMonths = { '3m': 3, '6m': 6, '1y': 12, '3y': 36 };
              const months = rangeMonths[historyRange] || 12;
              const windowEnd = new Date();
              const windowStart = new Date(windowEnd);
              windowStart.setMonth(windowStart.getMonth() - months);
              const windowMs = windowEnd.getTime() - windowStart.getTime();
              const toPct = (d) => Math.max(0, Math.min(100, ((d.getTime() - windowStart.getTime()) / windowMs) * 100));

              // ── axis ticks (separate years + months) ───────────────────────
              // 3Y window: sparse month row (~3 labels / year) so it stays readable
              // 3m/6m: every month · 1y: every other month · 3y: every 4 months
              const monthInterval = historyRange === '3y' ? 4 : historyRange === '1y' ? 2 : 1;
              const monthTicks = [];
              const monthCursor = new Date(windowStart);
              monthCursor.setDate(1);
              monthCursor.setMonth(monthCursor.getMonth() + 1);
              while (monthCursor <= windowEnd) {
                monthTicks.push({
                  key: `m-${monthCursor.toISOString()}`,
                  label: monthCursor.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
                  pct: toPct(monthCursor),
                });
                monthCursor.setMonth(monthCursor.getMonth() + monthInterval);
              }

              // Denser monthly gridlines (labels stay sparsified above)
              const gridMonthTicks = [];
              const gridCursor = new Date(windowStart);
              gridCursor.setDate(1);
              gridCursor.setMonth(gridCursor.getMonth() + 1);
              while (gridCursor <= windowEnd) {
                gridMonthTicks.push({
                  key: `g-${gridCursor.toISOString()}`,
                  pct: toPct(gridCursor),
                });
                gridCursor.setMonth(gridCursor.getMonth() + 1);
              }

              const yearTicks = [];
              // Start from the window's own year so the opening year always gets a label
              const yearCursor = new Date(windowStart.getFullYear(), 0, 1);
              while (yearCursor <= windowEnd) {
                const rawPct = ((yearCursor.getTime() - windowStart.getTime()) / windowMs) * 100;
                yearTicks.push({
                  key: `y-${yearCursor.toISOString()}`,
                  label: yearCursor.getFullYear(),
                  // Clamp to 0 so a year that starts before the window left-anchors
                  pct: Math.max(0, Math.min(100, rawPct)),
                  // If the Jan-1 date is before the window start, pin the label to left edge
                  pinLeft: rawPct < 0,
                });
                yearCursor.setFullYear(yearCursor.getFullYear() + 1);
              }

              // ── filter + swimlanes ───────────────────────────────────────────
              const visible = finishedEntries.filter(e => {
                const s = new Date(e.startDate || e.endDate);
                const en = new Date(e.endDate);
                return s <= windowEnd && en >= windowStart;
              });

              const effectiveHistoryStatus = (entry) => {
                if (entry.completionStatus === 'completed' || entry.completionStatus === 'ended_early' || entry.completionStatus === 'rescheduled') {
                  return entry.completionStatus;
                }
                if (entry.endType === 'rescheduled') return 'rescheduled';
                if (entry.endType === 'completed') return 'completed';
                if (entry.endType === 'manual') {
                  const sd = new Date(entry.startDate);
                  const ed = new Date(entry.endDate);
                  const d = Math.ceil((ed - sd) / (1000 * 60 * 60 * 24)) + 1;
                  return d <= 2 ? 'completed' : 'ended_early';
                }
                return 'ended_early';
              };

              const laneMap = new Map();
              visible.forEach(e => {
                const name = e.protocolName || 'Unknown';
                if (!laneMap.has(name)) laneMap.set(name, []);
                laneMap.get(name).push(e);
              });
              const lanes = [...laneMap.entries()];
              const rangeLabel = historyRange === '3m' ? '3M' : historyRange === '6m' ? '6M' : historyRange === '1y' ? '1Y' : '3Y';
              const rangePhrase =
                historyRange === '3m' ? '3 months'
                : historyRange === '6m' ? '6 months'
                : historyRange === '1y' ? 'year'
                : '3 years';

              // status colour — ended early uses neutral theme tones (not alarm red)
              const statusColor = (s) =>
                s === 'completed'   ? (theme.isDark ? '#536E50' : theme.primary)
                : s === 'ended_early' ? (theme.isDark ? theme.accent : theme.textLight)
                : s === 'rescheduled' ? theme.warning
                : (theme.isDark ? theme.accent : theme.textLight);

              const statusLabel = (s) =>
                s === 'completed'   ? 'Completed'
                : s === 'ended_early' ? 'Ended early'
                : s === 'rescheduled' ? 'Rescheduled'
                : 'Unknown';

              const LABEL_W = 112; // px — left label column

              return (
                <div>
                  {/* Section header — matches Active / Your Library language */}
                  <div className="flex items-center gap-2 px-1 w-full min-w-0 mb-4">
                    <History size={14} className="opacity-40 shrink-0" style={{ color: theme.text }} />
                    <h2
                      className="text-xs font-semibold uppercase tracking-wider opacity-40 shrink-0"
                      style={{ color: theme.text }}
                    >
                      History Overview
                    </h2>
                    <div
                      className="flex-1 h-px min-w-0"
                      style={{
                        background: `linear-gradient(to right, ${theme.primary}55 0%, ${theme.primary}22 45%, transparent 100%)`,
                      }}
                    />
                    {lanes.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const shareLanes = lanes.map(([name, laneEntries]) => ({
                            name,
                            runs: laneEntries.map((entry) => ({
                              startDate: entry.startDate,
                              endDate: entry.endDate,
                              completionStatus: effectiveHistoryStatus(entry),
                            })),
                          }));
                          setHistoryShareData({
                            type: 'history',
                            rangeLabel,
                            totalRuns: visible.length,
                            windowStart: windowStart.toISOString(),
                            windowEnd: windowEnd.toISOString(),
                            lanes: shareLanes,
                          });
                          setIsHistoryShareModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wide shrink-0 transition-all hover:opacity-80 active:scale-[0.98]"
                        style={{
                          backgroundColor: theme.isDark
                            ? `${theme.primary || '#7F9E95'}18`
                            : `${theme.primary || '#7F9E95'}12`,
                          color: theme.primary || '#7F9E95',
                        }}
                      >
                        <Share2 size={13} />
                        Share
                      </button>
                    )}
                  </div>

                  {/* Range selector — matches Settings Researcher Mode SegmentedControl */}
                  <div className="mb-4">
                    {(() => {
                      const rangeOptions = [
                        { value: '3m', label: '3 Months' },
                        { value: '6m', label: '6 Months' },
                        { value: '1y', label: '1 Year' },
                        { value: '3y', label: '3 Years' },
                      ];
                      const selectedIndex = Math.max(0, rangeOptions.findIndex((o) => o.value === historyRange));
                      const count = rangeOptions.length;
                      return (
                        <div
                          role="tablist"
                          aria-label="History time range"
                          className="relative grid p-1 rounded-full"
                          style={{
                            gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))`,
                            backgroundColor: theme.isDark
                              ? 'rgba(255,255,255,0.08)'
                              : 'rgba(47,59,58,0.09)',
                            boxShadow: theme.isDark
                              ? 'inset 0 2px 4px rgba(0,0,0,0.35), inset 0 1px 2px rgba(0,0,0,0.25), 0 1px 0 rgba(255,255,255,0.04)'
                              : 'inset 0 2px 5px rgba(47,59,58,0.14), inset 0 1px 2px rgba(47,59,58,0.08), 0 1px 0 rgba(255,255,255,0.7)',
                          }}
                        >
                          <div
                            className="absolute top-1 bottom-1 left-1 rounded-full pointer-events-none"
                            style={{
                              width: `calc((100% - 8px) / ${count})`,
                              transform: `translateX(calc(${selectedIndex} * 100%))`,
                              transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                              backgroundColor: theme.primary || '#7F9E95',
                              boxShadow: theme.isDark
                                ? `0 4px 14px ${theme.primary}77, 0 2px 4px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.22)`
                                : `0 4px 14px ${theme.primary}55, 0 2px 4px rgba(47,59,58,0.16), inset 0 1px 0 rgba(255,255,255,0.35)`,
                            }}
                            aria-hidden="true"
                          />
                          {rangeOptions.map((r) => {
                            const active = historyRange === r.value;
                            return (
                              <button
                                key={r.value}
                                type="button"
                                role="tab"
                                aria-selected={active}
                                onClick={() => setHistoryRange(r.value)}
                                className="relative z-[1] py-2.5 px-1 rounded-full text-[11px] sm:text-xs font-semibold transition-colors duration-200 leading-tight"
                                style={{
                                  color: active
                                    ? (theme.textOnPrimary || '#ffffff')
                                    : theme.isDark
                                      ? 'rgba(255,255,255,0.45)'
                                      : 'rgba(47,59,58,0.45)',
                                  WebkitTapHighlightColor: 'transparent',
                                }}
                              >
                                {r.label}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {lanes.length === 0 ? (
                    <div className="text-center py-10 text-sm" style={{ color: theme.textLight }}>
                      No protocols ended in this period.
                    </div>
                  ) : (
                    <div 
                      className="rounded-2xl border shadow-sm overflow-hidden mb-4" 
                      style={{ 
                        backgroundColor: theme.cardBackground || (theme.isDark ? '#1f2937' : '#ffffff'),
                        borderColor: theme.border
                      }}
                    >
                      <div className="overflow-x-auto p-4 pb-5">
                        <div style={{ minWidth: 300 }}>

                        {/* Year + month axis rows — run count in upper left */}
                        <div className="flex items-end mb-0.5">
                          <div
                            className="flex-shrink-0 pr-2.5 flex items-end"
                            style={{ width: LABEL_W }}
                          >
                            <span className="text-[11px] font-medium" style={{ color: theme.textLight }}>
                              {visible.length} run{visible.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex-1 relative h-3.5">
                            {yearTicks.map(tick => (
                              <span
                                key={tick.key}
                                className="absolute text-[10px] font-bold tracking-[0.15em] select-none"
                                style={{
                                  left: tick.pct + '%',
                                  transform: tick.pinLeft ? 'none' : 'translateX(-50%)',
                                  color: theme.text,
                                  opacity: 0.7,
                                }}
                              >
                                {tick.label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-end mb-2" style={{ paddingLeft: LABEL_W }}>
                          <div className="flex-1 relative h-3.5">
                            {monthTicks.map(tick => (
                              <span
                                key={tick.key}
                                className="absolute text-[9px] font-semibold uppercase tracking-wider transform -translate-x-1/2 select-none"
                                style={{
                                  left: tick.pct + '%',
                                  color: theme.textLight,
                                  opacity: 0.7,
                                }}
                              >
                                {tick.label}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Swimlanes */}
                        <div className="space-y-1.5">
                          {lanes.map(([name, entries]) => {
                            const latestEntry = [...entries].sort(
                              (a, b) => new Date(b.endDate || 0) - new Date(a.endDate || 0)
                            )[0];
                            return (
                            <div key={name} className="flex items-center gap-0">
                              {/* Lane label — opens most recent run detail / assessment */}
                              <button
                                type="button"
                                onClick={() => latestEntry && setSelectedHistoryEntry(latestEntry)}
                                className="flex-shrink-0 text-left pr-2.5 truncate transition-opacity hover:opacity-70 active:opacity-50"
                                style={{ width: LABEL_W, color: theme.text }}
                                title={`${name} — view assessment`}
                              >
                                <span className="text-[11px] font-semibold truncate block">
                                  {name}
                                </span>
                              </button>

                              {/* Bar track — thinner, flat fill */}
                              <div
                                className="flex-1 relative rounded"
                                style={{
                                  height: 20,
                                  backgroundColor: theme.isDark
                                    ? 'rgba(212, 198, 184, 0.10)'
                                    : 'rgba(138, 128, 119, 0.10)',
                                }}
                              >
                                {/* Quiet month gridlines */}
                                {gridMonthTicks.map(tick => (
                                  <div
                                    key={tick.key}
                                    className="absolute top-0 bottom-0 w-px pointer-events-none"
                                    style={{
                                      left: tick.pct + '%',
                                      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                                    }}
                                  />
                                ))}
                                {/* Slightly stronger year lines */}
                                {yearTicks.map(tick => (
                                  <div
                                    key={tick.key}
                                    className="absolute top-0 bottom-0 w-px pointer-events-none"
                                    style={{
                                      left: tick.pct + '%',
                                      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)',
                                    }}
                                  />
                                ))}

                                {/* Today line */}
                                <div
                                  className="absolute top-0 bottom-0 w-0.5 z-10 rounded pointer-events-none"
                                  style={{ left: '100%', backgroundColor: theme.text, opacity: 0.25 }}
                                />

                                {/* Protocol run bars */}
                                {entries.map(entry => {
                                  const s = new Date(entry.startDate || entry.endDate);
                                  const en = new Date(entry.endDate);
                                  const left = toPct(s);
                                  const right = toPct(en);
                                  const width = Math.max(right - left, 1.2);
                                  const color = statusColor(effectiveHistoryStatus(entry));
                                  const durationDays = entry.startDate
                                    ? Math.ceil((en - s) / 86400000) + 1
                                    : null;
                                  return (
                                    <button
                                      key={entry.id}
                                      type="button"
                                      onClick={() => setSelectedHistoryEntry(entry)}
                                      className="absolute top-0.5 bottom-0.5 rounded-md transition-all hover:brightness-110 active:brightness-90 border border-black/10 cursor-pointer"
                                      style={{
                                        left: left + '%',
                                        width: width + '%',
                                        backgroundColor: color,
                                        minWidth: 4,
                                      }}
                                      title={`${name} · ${statusLabel(effectiveHistoryStatus(entry))}${durationDays ? ` · ${durationDays}d` : ''} — view assessment`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                            );
                          })}
                        </div>

                        {/* Compact legend + muted tip */}
                        <div className="mt-3 space-y-1.5">
                          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                            {[
                              { key: 'completed', label: 'Completed', color: statusColor('completed') },
                              { key: 'ended_early', label: 'Ended early', color: statusColor('ended_early') },
                              { key: 'rescheduled', label: 'Rescheduled', color: statusColor('rescheduled') },
                            ].filter((l) => visible.some((e) => effectiveHistoryStatus(e) === l.key)).map((l) => (
                              <div key={l.label} className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-sm inline-block" style={{ backgroundColor: l.color }} />
                                <span className="text-[11px] font-medium" style={{ color: theme.textLight }}>{l.label}</span>
                              </div>
                            ))}
                          </div>
                          <p className="text-[10px] font-normal tracking-wide text-center" style={{ color: theme.textLight, opacity: 0.5 }}>
                            Tap a name or bar to view assessment
                          </p>
                        </div>
                      </div>
                    </div>
                    </div>
                  )}

                  {/* Insights CTA — primary-tinted next-step card */}
                  <button
                    type="button"
                    onClick={() => navigate('/app/insights?tab=research')}
                    className="w-full mt-2 mb-8 p-4 rounded-2xl text-left transition-all hover:brightness-[1.03] active:scale-[0.99] flex items-center gap-3.5 overflow-hidden relative"
                    style={{
                      background: theme.isDark
                        ? `linear-gradient(135deg, ${theme.primary}28 0%, ${theme.primary}12 55%, transparent 100%)`
                        : `linear-gradient(135deg, ${theme.primary}22 0%, ${theme.primary}0c 55%, ${theme.cardBackground || '#fff'} 100%)`,
                      border: `1px solid ${theme.primary}40`,
                      boxShadow: theme.isDark
                        ? `0 4px 16px ${theme.primary}18`
                        : `0 4px 14px ${theme.primary}14`,
                    }}
                  >
                    <ChartLine
                      size={28}
                      weight="duotone"
                      className="shrink-0"
                      style={{ color: theme.primary }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold mb-0.5" style={{ color: theme.text }}>
                        Curious how this period performed?
                      </p>
                      <p className="text-xs leading-snug" style={{ color: theme.textLight }}>
                        See adherence, trends & outcomes for the last {rangePhrase}
                      </p>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wide"
                      style={{
                        backgroundColor: theme.primary,
                        color: theme.textOnPrimary || '#fff',
                        boxShadow: `0 1px 4px ${theme.primary}55`,
                      }}
                    >
                      Insights
                      <CaretRight size={12} weight="bold" />
                    </span>
                  </button>
                </div>
              );
            })()}
          </div>
        )}

      <ProtocolRemindersSheet
        open={remindersSheetOpen}
        onClose={() => setRemindersSheetOpen(false)}
        theme={theme}
        protocols={organizedProtocols.active}
        updateProtocol={updateProtocol}
        reminderSettings={reminderSettings}
        updateReminderSetting={updateReminderSetting}
        pushNotificationStatus={pushNotificationStatus}
        navigate={navigate}
      />

      {/* Add Protocol options: FAB dial (mobile) / topbar menu (desktop) via actionItems */}

      <ProtocolEditorModal
        open={openAdd}
        onClose={() => {
          setOpenAdd(false);
          // Ensure other modals don't interfere
          setEditing(null);
          setStartConfirm(null);
        }}
        theme={theme}
        onSave={(data) => {
          setOpenAdd(false)
          // New protocols should not be active until explicitly started
          const cleaned = prepareItemForSave({ 
            id: generateId(), 
            ...data, 
            active: false, 
            startDate: data.startDate || ''
          }, { isNew: true });
          addProtocol(cleaned);
        }}
      />

      <QuickStartProtocolModal
        open={openQuickStart}
        onClose={() => setOpenQuickStart(false)}
        theme={theme}
        onSave={async (protocolData) => {
          // Protocol is already created with active: true and startDate set
          // Just add it to the protocols list
          const finalProtocol = prepareItemForSave({
            ...protocolData
          }, { isNew: true });
          
          addProtocol(finalProtocol);
          
          // Create a history entry immediately since it's started (with minimal protocolData for history detail view)
          const historyEntry = {
            protocolId: finalProtocol.id,
            protocolName: finalProtocol.protocolName,
            startDate: finalProtocol.startDate,
            protocolData: {
              protocolName: finalProtocol.protocolName,
              peptides: finalProtocol.peptides || [],
              linkedItems: finalProtocol.linkedItems || {}
            }
          };
          
          saveProtocolHistoryEntry(historyEntry);
          
          // Toast success
          window.dispatchEvent(new CustomEvent('tpp:toast', { 
            detail: { 
              message: `${finalProtocol.protocolName} started successfully! 🚀`, 
              type: 'success' 
            } 
          }));

          window.dispatchEvent(new CustomEvent('tpp:protocol-live', {
            detail: { protocolId: finalProtocol.id },
          }));
          
          setOpenQuickStart(false);
        }}
      />

      <ProtocolEditorModal
        open={!!editing}
        onClose={() => {
          // If we came from manage modal, restore it
          if (editFromManage) {
            setManageConfirm(editFromManage);
            setEditFromManage(null);
          }
          setEditing(null);
        }}
        theme={theme}
        protocol={editing}
        onSave={(data) => {
          const updatedProtocol = { ...editing, ...data };
          
          // Re-calculate end-date if start date or duration changes
          const computeEndDate = (p) => {
              try {
                  if (!p?.startDate) return p.endDate || null;
                  // CRITICAL: Use centralized date parsing
                  const start = parseDateString(p.startDate);
                  if (!start) return p.endDate || null;
                  const startNormalized = normalizeToMidnight(start);
                  let end = null;
                  const cyclePeptide = p.peptides?.find(pep => pep.frequency?.type === 'cycle');
                  
                  // SPECIAL CASE: Ongoing cycles - calculate far-future endDate for scheduling
                  if (cyclePeptide && p.duration?.noEnd) {
                      const onDays = Number(cyclePeptide.frequency.onDays) || 0;
                      const offDays = Number(cyclePeptide.frequency.offDays) || 0;
                      if (onDays > 0) {
                          // For ongoing cycles, schedule 1 year ahead for calendar purposes
                          end = new Date(startNormalized);
                          end.setFullYear(end.getFullYear() + 1);
                      }
                  }
                  // Regular cycle with set duration
                  else if (cyclePeptide) {
                      const onDays = Number(cyclePeptide.frequency.onDays) || 0;
                      const offDays = Number(cyclePeptide.frequency.offDays) || 0;
                      if (onDays > 0 && p.duration && p.duration.count > 0 && p.duration.unit) {
                          const durationInDays = (() => {
                              const count = Number(p.duration.count);
                              const unit = String(p.duration.unit).toLowerCase();
                              if (unit.includes('day')) return count;
                              if (unit.includes('week')) return count * 7;
                              if (unit.includes('month')) return count * 30;
                              return 0;
                          })();
                          const fullCycles = Math.floor(durationInDays / onDays);
                          const remainingOn = durationInDays % onDays;
                          let total = fullCycles * (onDays + offDays);
                          if (remainingOn > 0) total += remainingOn; else if (fullCycles > 0) total -= offDays;
                          end = new Date(startNormalized);
                          end.setDate(end.getDate() + total - 1);
                      }
                  }
                  if (!end && p.duration && !p.duration.noEnd && p.duration.count > 0 && p.duration.unit) {
                      end = new Date(startNormalized);
                      const unit = String(p.duration.unit).toLowerCase();
                      const count = Number(p.duration.count) || 0;
                      if (unit.includes('day')) end.setDate(end.getDate() + count - 1);
                      else if (unit.includes('week')) end.setDate(end.getDate() + (count * 7) - 1);
                      else if (unit.includes('month')) { end.setMonth(end.getMonth() + count); end.setDate(end.getDate() - 1); }
                  }
                  return end ? getLocalDateString(end) : p.endDate || null;
              } catch { return p.endDate || null; }
          };

          // Always recalculate endDate when editing - this ensures washout is never included
          // and fixes any existing protocols with incorrect endDate
          const newEndDate = computeEndDate(updatedProtocol);
          const finalProtocol = { ...updatedProtocol, endDate: newEndDate };
          
          // Log if we're fixing an active protocol (helps with user communication)
          if (updatedProtocol.active && updatedProtocol.endDate && updatedProtocol.endDate !== newEndDate) {
            console.log('🔄 Recalculated endDate for active protocol:', updatedProtocol.name || updatedProtocol.protocolName, 'from', updatedProtocol.endDate, 'to', newEndDate);
          }

          // Settings history: apply edits "this + future" only; snapshot old state and log to activity
          if (editing?.active && hasSchedulingChanges(editing, finalProtocol)) {
            const today = getLocalDateString();
            const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
            const existing = finalProtocol.settingsHistory || [];
            const lastSegment = existing.length > 0 ? existing[existing.length - 1] : null;
            const addOneDay = (dateStr) => {
              const d = new Date(dateStr + 'T12:00:00');
              d.setDate(d.getDate() + 1);
              return getLocalDateString(d);
            };
            const effectiveFromNew = lastSegment ? addOneDay(lastSegment.effectiveTo) : (editing.startDate || yesterday);
            if (effectiveFromNew <= yesterday) {
              finalProtocol.settingsHistory = [...existing, buildSettingsSnapshot(editing, effectiveFromNew, yesterday)];
            }
            const activeEntry = findActiveProtocolHistoryEntry(editing.id);
            if (activeEntry) {
              const { summary, changes } = diffProtocolSettings(editing, finalProtocol);
              addPhaseEvent(activeEntry.id, { type: 'settings_change', date: today, summary, changes });
            }
          }

          // Update protocol with force sync for immediate cross-device update
          updateProtocolWithForceSync(finalProtocol);
          
          // Save to protocol draft for real-time sync with tasks/calendar
          try {
            const draftKey = `tpprover_protocol_draft_${finalProtocol.id}`;
            localStorage.setItem(draftKey, JSON.stringify({
              data: finalProtocol,
              timestamp: new Date().toISOString()
            }));
            
            // Emit event so Dashboard, TasksWidget, and Calendar pick up the changes immediately
            window.dispatchEvent(new CustomEvent('tpp:protocol-autosaved', {
              detail: { storageKey: draftKey, formData: finalProtocol }
            }));
            
            // Trigger calendar and dashboard refresh
            window.dispatchEvent(new CustomEvent('tpp:calendar-sync', { detail: { protocolUpdated: true } }));
            window.dispatchEvent(new CustomEvent('tpp:task-completion-changed', { detail: { protocolUpdated: true } }));
          } catch (e) {
            console.warn('Failed to save protocol draft:', e);
          }
          
          // If we came from manage modal, restore it with updated data
          if (editFromManage) {
            setManageConfirm(finalProtocol);
            setEditFromManage(null);
          }
          
          setEditing(null); 
        }}
        onDelete={(toDel) => {
          if (!toDel) return
          // Show confirmation modal instead of deleting immediately
          setDeleteFromEditor(toDel);
        }}
      />

      <EndProtocolAssessment
        open={!!followUpProtocol}
        onClose={handleAssessmentDismiss}
        protocol={followUpProtocol}
        historyEntryId={followUpHistoryId}
        theme={theme}
        stockpile={stockpile}
        setStockpile={setStockpile}
        reconItems={reconItems}
        setReconItems={setReconItems}
        reconHistory={reconHistory}
        setReconHistory={setReconHistory}
        onComplete={handleAssessmentDismiss}
      />

      <ProtocolHistoryModal
        open={!!historyProtocol}
        onClose={() => {
          setHistoryProtocol(null);
          setHistoryFromManage(false);
        }}
        onBack={historyFromManage ? () => {
          setHistoryProtocol(null);
          setManageConfirm(historyProtocol);
          setHistoryFromManage(false);
        } : undefined}
        protocol={historyProtocol}
        theme={theme}
        onStartProtocol={handleStartClick}
        onRestore={handleRestoreProtocol}
        onEdit={handleEditFromHistory}
        protocols={protocols}
        key={`${historyProtocol?.id}-${historyRefreshKey}`}
      />

      <ProtocolHistoryDetailModal
        open={!!selectedHistoryEntry}
        onClose={() => setSelectedHistoryEntry(null)}
        historyEntry={selectedHistoryEntry}
        theme={theme}
        stockpile={stockpile}
        onRestore={handleRestoreProtocol}
        onEdit={handleEditFromHistory}
        protocols={protocols}
        expandAssessment={true}
      />

      {manageConfirm && manageConfirm.protocolName && (
        <BottomSheet
          open={true}
          onClose={() => {
            setManageConfirm(null);
            setManageTab('manage');
            setHistoryProtocol(null);
            setHistoryFromManage(false);
            setShowDateChangeTip(false);
          }}
          onBack={() => {
            setManageConfirm(null);
            setManageTab('manage');
            setHistoryProtocol(null);
            setHistoryFromManage(false);
            setShowDateChangeTip(false);
          }}
          title={manageConfirm.protocolName || 'Protocol'}
          centerTitle={true}
          theme={theme}
          maxHeight="85vh"
          fitContent={true}
          footer={
            <div className="w-full flex items-center gap-3">
                {/* Left side - Close button */}
                <button
                    type="button"
                    onClick={() => {
                      setManageConfirm(null);
                      setManageTab('manage');
                    }}
                    className="text-sm font-medium transition-opacity hover:opacity-70"
                    style={{ 
                        backgroundColor: 'transparent',
                        color: theme.textLight,
                        padding: '10px 20px',
                        border: 'none'
                    }}
                >
                    Close
                </button>
                
                {/* Right side - Tab-specific buttons */}
                <div className="flex-1 flex items-center justify-end gap-3">
                    {/* Edit Tab - Save Changes */}
                    {manageTab === 'edit' && (
                      <button
                          type="button"
                          onClick={() => {
                            // Dispatch event to trigger embedded editor save
                            window.dispatchEvent(new CustomEvent('tpp:save-embedded-editor'));
                          }}
                          className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 whitespace-nowrap min-w-fit"
                          style={{ 
                              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark || theme.primary} 100%)`,
                              color: theme.textOnPrimary || '#ffffff',
                              border: 'none'
                          }}
                          onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = theme.isDark ? '0 10px 25px rgba(0, 0, 0, 0.5)' : '0 10px 25px rgba(0, 0, 0, 0.15)';
                          }}
                          onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = theme.isDark ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.1)';
                          }}
                      >
                          Save Changes
                      </button>
                    )}

                    {/* Manage Tab - Save Changes */}
                    {manageTab === 'manage' && (
                      <button
                          type="button"
                          onClick={() => {
                                  if (manageConfirm) {
                                      // If the user changed the start date, recalculate endDate so the
                                      // calendar bars and auto-end check reflect the new window.
                                      const originalProtocol = protocols.find(p => p.id === manageConfirm.id);
                                      let protocolToSave = manageConfirm;
                                      if (
                                        manageConfirm.startDate &&
                                        (!originalProtocol || manageConfirm.startDate !== originalProtocol.startDate)
                                      ) {
                                        const recalcedEndDate = computeProtocolEndDate(manageConfirm);
                                        protocolToSave = { ...manageConfirm, endDate: recalcedEndDate };
                                        // Sync new startDate to the active history entry as well
                                        const activeHistEntry = findActiveProtocolHistoryEntry(manageConfirm.id);
                                        if (activeHistEntry) {
                                          updateProtocolHistoryEntry(activeHistEntry.id, { startDate: manageConfirm.startDate });
                                        }
                                      }
                                      updateProtocolWithForceSync(protocolToSave); // Use force sync for Save button
                                      
                                      // Update history entry with current linkedItems (for complete data preservation)
                                      try {
                                          const activeHistoryEntry = findActiveProtocolHistoryEntry(manageConfirm.id);
                                          if (activeHistoryEntry) {
                                              // Extract skipped reconstitution data from linkedItems
                                              const skippedReconstitution = {};
                                              const linkedItems = manageConfirm.linkedItems || {};
                                              Object.entries(linkedItems).forEach(([peptideId, item]) => {
                                                  if (item.status === 'skipped' && item.deliveryMethod) {
                                                      const peptide = manageConfirm.peptides?.find(p => (p.id || `peptide-${manageConfirm.peptides.indexOf(p)}`) === peptideId);
                                                      skippedReconstitution[peptideId] = {
                                                          peptideName: peptide?.name || 'Unknown',
                                                          deliveryMethod: item.deliveryMethod
                                                      };
                                                  }
                                              });
                                              
                                              // Update history entry with complete linkedItems and skipped reconstitution
                                              const updatedProtocolData = {
                                                  ...(activeHistoryEntry.protocolData || {}),
                                                  linkedItems: linkedItems // Save complete linkedItems for reference
                                              };
                                              
                                              updateProtocolHistoryEntry(activeHistoryEntry.id, {
                                                  protocolData: updatedProtocolData,
                                                  skippedReconstitution: Object.keys(skippedReconstitution).length > 0 ? skippedReconstitution : null
                                              });
                                              // Sync linked vials to history
                                              Object.entries(linkedItems).forEach(([peptideId, item]) => {
                                                  // Sync archived (finished) vials from vialHistory
                                                  if (item.vialHistory?.length > 0) {
                                                      item.vialHistory.forEach(hv => {
                                                          if (hv.vialId) {
                                                              const snapshot = {
                                                                  vialId: hv.vialId,
                                                                  stockpileId: hv.vialId,
                                                                  name: hv.name || 'Unknown',
                                                                  mg: hv.mg,
                                                                  vendor: hv.vendor,
                                                                  cost: hv.cost || 0,
                                                                  usedAt: hv.usedAt
                                                              };
                                                              addVialToActiveProtocol(manageConfirm.id, snapshot);
                                                          }
                                                      });
                                                  }
                                                  // Sync currently active vial
                                                  if (item.status === 'linked' && item.vialId) {
                                                      const vial = stockpile.find(v => v.id === item.vialId);
                                                      const vialSnapshot = {
                                                          vialId: item.vialId,
                                                          stockpileId: item.vialId,
                                                          name: vial?.name || item.vialName || 'Unknown',
                                                          mg: vial?.mg || item.vialMg,
                                                          mgUnit: vial?.mgUnit || item.vialMgUnit || 'mg',
                                                          unit: vial?.unit || 'vial',
                                                          vendor: vial?.vendor || item.vialVendor,
                                                          cost: vial?.cost || item.vialCost || 0,
                                                          orderId: vial?.orderId || item.vialOrderId || null,
                                                          purchaseDate: vial?.purchaseDate || item.vialPurchaseDate || null,
                                                          documentation: vial?.documentation || []
                                                      };
                                                      addVialToActiveProtocol(manageConfirm.id, vialSnapshot);
                                                  }
                                              });
                                          }
                                      } catch (e) {
                                          console.warn('Failed to update protocol history with linkedItems:', e);
                                      }
                                      
                                      // Save to protocol draft for real-time sync with tasks/calendar
                                      try {
                                          const draftKey = `tpprover_protocol_draft_${manageConfirm.id}`;
                                          localStorage.setItem(draftKey, JSON.stringify({
                                              data: manageConfirm,
                                              timestamp: new Date().toISOString()
                                          }));
                                          
                                          // Emit event so TasksWidget and Calendar pick up the changes immediately
                                          window.dispatchEvent(new CustomEvent('tpp:protocol-autosaved', {
                                              detail: { storageKey: draftKey, formData: manageConfirm }
                                          }));
                                      } catch (e) {
                                          console.warn('Failed to save protocol draft:', e);
                                      }
                                      
                                      window.dispatchEvent(new CustomEvent('tpp:toast', { 
                                          detail: { message: 'Protocol updated successfully!', type: 'success' } 
                                      }));
                                  }
                                  setManageConfirm(null);
                                  setManageTab('manage');
                                  setHistoryProtocol(null); // Ensure history modal is also closed
                              }}
                          className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 whitespace-nowrap min-w-fit"
                          style={{ 
                              background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primaryDark || theme.primary} 100%)`,
                              color: theme.textOnPrimary || '#ffffff',
                              border: 'none'
                          }}
                          onMouseEnter={(e) => {
                              e.currentTarget.style.transform = 'translateY(-1px)';
                              e.currentTarget.style.boxShadow = theme.isDark ? '0 10px 25px rgba(0, 0, 0, 0.5)' : '0 10px 25px rgba(0, 0, 0, 0.15)';
                          }}
                          onMouseLeave={(e) => {
                              e.currentTarget.style.transform = 'translateY(0)';
                              e.currentTarget.style.boxShadow = theme.isDark ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.1)';
                          }}
                      >
                          Save Changes
                      </button>
                    )}

                    {/* Notes Tab - Add Note or Save Note */}
                    {manageTab === 'notes' && (
                      <>
                        {!showAddNoteForm && !editingNote && (
                          <button
                            onClick={() => setShowAddNoteForm(true)}
                            className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 btn-primary-inset"
                            style={{ 
                              backgroundColor: theme.primary, 
                              color: theme.textOnPrimary || '#ffffff',
                              border: 'none'
                            }}
                          >
                            Add Note
                          </button>
                        )}
                        {(showAddNoteForm || editingNote) && (
                          <>
                          <button
                            onClick={() => {
                              if (showAddNoteForm) {
                                setShowAddNoteForm(false);
                                setNewNote({ content: '', tags: [], linkedDate: getLocalDateString() });
                                } else if (editingNote) {
                                  setEditingNote(null);
                                }
                              }}
                              className="text-sm font-medium transition-opacity hover:opacity-70"
                              style={{ 
                                backgroundColor: 'transparent',
                                color: theme.textLight,
                                padding: '10px 20px',
                                border: 'none'
                              }}
                            >
                              Close
                            </button>
                            <button
                              onClick={() => {
                                if (showAddNoteForm) {
                                  handleAddNote();
                                } else if (editingNote) {
                                  handleSaveEditNote();
                                }
                              }}
                              className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 flex items-center justify-center gap-2 btn-primary-inset"
                              style={{ 
                                backgroundColor: theme.primary, 
                                color: theme.textOnPrimary || '#ffffff',
                                border: 'none'
                              }}
                            >
                              <Check size={18} />
                              Save Note
                            </button>
                          </>
                        )}
                      </>
                    )}

                    {/* Share Tab - Copy Link, Share, Save (compact) */}
                    {manageTab === 'share' && (
                      <>
                        <button 
                          onClick={handleCopyLink} 
                          disabled={shareCopied} 
                          className="flex-1 flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border-2 transition-all hover:scale-[1.02] active:scale-95" 
                          style={{ 
                            borderColor: shareCopied ? theme.primary : theme.border, 
                            backgroundColor: shareCopied ? `${theme.primary}15` : 'transparent', 
                            color: shareCopied ? theme.primary : theme.text,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {shareCopied ? <Check size={12} /> : <Copy size={12} />}
                          {shareCopied ? 'Copied!' : 'Copy Link'}
                        </button>
                        <button 
                          onClick={handleShareImage} 
                          className="flex-1 flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-md hover:scale-[1.02] active:scale-95 btn-primary-inset" 
                          style={{ 
                            backgroundColor: theme.primary, 
                            color: theme.textOnPrimary || '#ffffff',
                            border: 'none',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <Image size={12} />
                          Share
                        </button>
                        <button 
                          onClick={handleSaveShareCardToDevice} 
                          disabled={shareSaving || shareSaved}
                          className="flex-1 flex items-center justify-center gap-1 px-1.5 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider border-2 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-60" 
                          style={{ 
                            borderColor: theme.primary, 
                            backgroundColor: `${theme.primary}12`,
                            color: theme.primary,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <Download size={12} />
                          {shareSaving ? 'Saving…' : shareSaved ? 'Saved!' : 'Save'}
                        </button>
                      </>
                    )}
                </div>
            </div>
        }
        >
          <div className="space-y-4 flex flex-col">
            {/* Tabs Navigation */}
            <div className="flex-shrink-0">
              <Tabs
                value={manageTab}
                onChange={setManageTab}
                options={[
                  { value: 'manage', label: 'Manage' },
                  { value: 'edit', label: 'Edit' },
                  { value: 'notes', label: 'Notes' },
                  { value: 'share', label: 'Share' },
                  { value: 'history', label: 'Activity' }
                ]}
                theme={theme}
                subtle={true}
                stretch={true}
              />
            </div>
            
            {/* Tab Content — height follows content; sheet scrolls past maxHeight */}
            <div className="overflow-y-visible">
            {/* Tab Content */}
            {manageTab === 'manage' && (
              <>
                {/* PROTOCOL SETTINGS - Accordion */}
                <div className="rounded-lg border mb-4" style={{ 
                  borderColor: theme.border,
                  backgroundColor: theme.cardBackground 
                }}>
                  <button
                    type="button"
                    onClick={() => setExpandedManageSections(prev => ({ ...prev, settings: !prev.settings }))}
                    className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                  >
                    <div className="flex items-center gap-3">
                      <Settings size={20} style={{ color: theme.primary }} />
                      <div className="flex flex-col gap-0.5 text-left">
                        <h4 className="text-base font-semibold" style={{ color: theme.text }}>Protocol Settings</h4>
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                          Schedule to Calendar
                        </span>
                      </div>
                    </div>
                    {expandedManageSections.settings ? (
                      <ChevronDown size={18} style={{ color: theme.textLight }} />
                    ) : (
                      <ChevronRight size={18} style={{ color: theme.textLight }} />
                    )}
                  </button>
                  
                  <div 
                    className="overflow-hidden transition-all duration-300"
                    style={{
                      maxHeight: expandedManageSections.settings ? '500px' : '0',
                      opacity: expandedManageSections.settings ? 1 : 0
                    }}
                  >
                    <div className="px-3 pb-2 pt-1 border-t" style={{ borderColor: theme.border }}>
                      {/* Start Date */}
                      <div ref={dateRowRef} className="flex items-center gap-3 py-1">
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Calendar size={16} style={{ color: theme.primary }} />
                          <span className="text-sm font-semibold" style={{ color: theme.text }}>{manageConfirm?.active ? 'Started' : 'Start'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <GlassmorphismDatePicker
                            value={manageConfirm?.startDate || ''}
                            onChange={(dateString) => {
                              setManageConfirm(p => ({...p, startDate: dateString}));
                            }}
                            onOpen={() => {
                              if (manageConfirm?.active && dateRowRef.current) {
                                const rect = dateRowRef.current.getBoundingClientRect();
                                setDateTipPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
                                setShowDateChangeTip(true);
                                if (dateChangeTipTimer.current) clearTimeout(dateChangeTipTimer.current);
                                dateChangeTipTimer.current = setTimeout(() => setShowDateChangeTip(false), 3000);
                              }
                            }}
                            theme={theme}
                            placeholder="Select start date"
                          />
                        </div>
                      </div>
                      {/* Who is this for */}
                      <div className="pb-1">
                        <OwnerSelect
                          value={manageConfirm?.ownerId}
                          onChange={(ownerId) => setManageConfirm(p => ({ ...p, ownerId }))}
                          theme={theme}
                        />
                      </div>

                      {/* Schedule Preview */}
                      {manageConfirm && (
                        <div className="mt-3 pt-3 border-t" style={{ borderColor: theme.border }}>
                          <VisualSchedulePreview 
                            protocol={manageConfirm}
                            startDate={manageConfirm?.startDate || getLocalDateString()}
                            theme={theme}
                            onUpdateProtocol={(updated, meta) => {
                              updateProtocolWithForceSync(updated);
                              setManageConfirm(updated);
                              if (meta?.phaseEvent) {
                                const activeEntry = findActiveProtocolHistoryEntry(updated.id);
                                if (activeEntry) addPhaseEvent(activeEntry.id, meta.phaseEvent);
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Vials & Delivery Methods - Accordion */}
                {manageConfirm?.active && manageConfirm?.linkedItems && (
                    <div className="rounded-lg border mb-4 relative" style={{ 
                      borderColor: theme.border,
                      backgroundColor: theme.cardBackground,
                      zIndex: 1
                    }}>
                      <button
                        type="button"
                        onClick={() => setExpandedManageSections(prev => ({ ...prev, vials: !prev.vials }))}
                        className="w-full p-3 flex items-center justify-between hover:opacity-80 transition-opacity relative"
                        style={{ zIndex: 1 }}
                      >
                        <div className="flex items-center gap-3">
                          <TestTubes size={20} style={{ color: theme.primary }} />
                          <div className="flex flex-col gap-0.5 text-left">
                            <h4 className="text-base font-semibold" style={{ color: theme.text }}>Vials & Delivery Methods</h4>
                            <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                              Link from Stockpile
                            </span>
                          </div>
                        </div>
                        {expandedManageSections.vials ? (
                          <ChevronDown size={18} style={{ color: theme.textLight }} />
                        ) : (
                          <ChevronRight size={18} style={{ color: theme.textLight }} />
                        )}
                      </button>
                      
                      <div 
                        className="overflow-hidden transition-all duration-300 relative"
                        style={{
                          maxHeight: expandedManageSections.vials ? '3000px' : '0',
                          opacity: expandedManageSections.vials ? 1 : 0,
                          zIndex: 2
                        }}
                      >
                        <div className="px-3 pb-3 pt-2 border-t relative" style={{ borderColor: theme.border, zIndex: 2 }}>
                          <EditActiveProtocolVials
                            protocol={manageConfirm}
                            stockpile={stockpile}
                            setStockpile={setStockpile}
                            theme={theme}
                            onUpdate={(updatedLinkedItems) => {
                                setManageConfirm(p => ({ ...p, linkedItems: updatedLinkedItems }));
                            }}
                            onRequestRecon={(peptideId, vialId) => {
                                const vial = stockpile.find(s => s.id === vialId);
                                const linkedItem = manageConfirm?.linkedItems?.[peptideId];
                                const peptide = manageConfirm?.peptides?.find(p => (p.id || `peptide-${manageConfirm.peptides.indexOf(p)}`) === peptideId);
                                const name = peptide?.name || vial?.name || linkedItem?.vialName || '';
                                const mg = vial?.mg || linkedItem?.vialMg || '';
                                const vendor = vial?.vendor || linkedItem?.vialVendor || '';
                                const vendorId = vial?.vendorId || linkedItem?.vialVendorId || null;
                                const cost = vial?.cost || linkedItem?.vialCost || '';
                                try { localStorage.removeItem('recon_form_new'); } catch {}
                                setReconPrefill({
                                    peptides: [{ id: 1, name, mg: String(mg), mgUnit: vial?.mgUnit || 'mg', dose: String(peptide?.dosage?.amount || ''), doseUnit: peptide?.dosage?.unit || 'mcg' }],
                                    vendor: String(vendor),
                                    vendorId,
                                    cost: cost ? String(cost) : '',
                                });
                                setReconModalOpen(true);
                            }}
                          />
                        </div>
                      </div>
                    </div>
                )}

                {/* Page Break */}
                <div className="border-t" style={{ borderColor: theme.border }}></div>

                <div className="p-3 rounded-lg border" style={{ borderColor: theme.isDark ? 'rgba(200,122,92,0.3)' : 'rgba(181,104,74,0.25)', backgroundColor: theme.isDark ? 'rgba(200,122,92,0.1)' : 'rgba(200,122,92,0.06)' }}>
                    <div className="text-sm font-semibold mb-1" style={{ color: theme.isDark ? '#e8a88a' : '#a35a3f' }}>End this protocol run?</div>
                    <div className="text-xs mb-3" style={{ color: theme.isDark ? '#d4977d' : '#8b4d36' }}>Ends today and starts your washout. Pick the option that best matches why you stopped.</div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-stretch">
                        <button
                            type="button"
                            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] inline-flex items-center justify-center gap-2"
                            style={{ background: 'linear-gradient(135deg, #c87a5c 0%, #b5684a 100%)', color: '#ffffff', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.15), inset 0 1px 2px rgba(0,0,0,0.1)' }}
                            onClick={() => {
                                endProtocol(manageConfirm, { reason: 'ended_early' });
                                setManageConfirm(null);
                            }}
                        >
                            <CalendarX size={16} />
                            End early
                        </button>
                        <button
                            type="button"
                            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] inline-flex items-center justify-center gap-2 border"
                            style={{
                                color: theme.primary,
                                borderColor: `${theme.primary}55`,
                                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.85)',
                            }}
                            onClick={() => {
                                endProtocol(manageConfirm, { reason: 'rescheduled' });
                                setManageConfirm(null);
                            }}
                        >
                            <CalendarClock size={16} />
                            Stopping to reschedule
                        </button>
                    </div>
                </div>
              </>
            )}


            {manageTab === 'edit' && (
              <div className="w-full overflow-x-hidden">
                {/* Render the full editor modal inline */}
                <ProtocolEditorModal
                  open={true}
                  onClose={() => {}}
                  theme={theme}
                  protocol={manageConfirm}
                  embedded={true}
                  onSave={(data) => {
                    // Use editor data as source of truth; overlay active-protocol-only fields from manageConfirm
                    const mergedStartDate = manageConfirm.startDate ?? data.startDate;
                    const updatedProtocol = {
                      ...data,
                      id: manageConfirm.id,
                      active: manageConfirm.active,
                      startDate: mergedStartDate,
                      linkedItems: manageConfirm.linkedItems ?? data.linkedItems,
                      emoji: manageConfirm.emoji ?? data.emoji
                    };
                    // Always recalculate endDate from the merged startDate + duration so that
                    // any start-date adjustment made in the Manage tab is reflected on the calendar.
                    const recalcedEnd = computeProtocolEndDate(updatedProtocol);
                    updatedProtocol.endDate = recalcedEnd ?? data.endDate ?? manageConfirm.endDate ?? null;
                    // Settings history: apply edits "this + future" only; snapshot old state and log to activity
                    if (manageConfirm?.active && hasSchedulingChanges(manageConfirm, updatedProtocol)) {
                      const today = getLocalDateString();
                      const yesterday = getLocalDateString(new Date(Date.now() - 86400000));
                      const existing = updatedProtocol.settingsHistory || [];
                      const lastSegment = existing.length > 0 ? existing[existing.length - 1] : null;
                      const addOneDay = (dateStr) => {
                        const d = new Date(dateStr + 'T12:00:00');
                        d.setDate(d.getDate() + 1);
                        return getLocalDateString(d);
                      };
                      const effectiveFromNew = lastSegment ? addOneDay(lastSegment.effectiveTo) : (manageConfirm.startDate || yesterday);
                      if (effectiveFromNew <= yesterday) {
                        updatedProtocol.settingsHistory = [...existing, buildSettingsSnapshot(manageConfirm, effectiveFromNew, yesterday)];
                      }
                      const activeEntry = findActiveProtocolHistoryEntry(manageConfirm.id);
                      if (activeEntry) {
                        const { summary, changes } = diffProtocolSettings(manageConfirm, updatedProtocol);
                        addPhaseEvent(activeEntry.id, { type: 'settings_change', date: today, summary, changes });
                      }
                    }
                    updateProtocolWithForceSync(updatedProtocol);
                    setManageConfirm(null);
                    setManageTab('manage');
                    window.dispatchEvent(new CustomEvent('tpp:toast', { 
                      detail: { message: 'Protocol updated successfully!', type: 'success' } 
                    }));
                  }}
                  onDelete={(toDel) => {
                    if (!toDel) return;
                    setDeleteFromEditor(toDel);
                  }}
                  isReadOnly={isReadOnly}
                  onUpgrade={() => setShowUpgradeModal(true)}
                />
              </div>
            )}

            {manageTab === 'notes' && (
              <div className="space-y-3">

                {/* Add Note Form */}
                {showAddNoteForm && (
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <NotebookPen size={22} style={{ color: theme.primary }} />
                        <div className="flex flex-col gap-0">
                          <h4 className="text-sm font-semibold tracking-wide" style={{ color: theme.text }}>New Note</h4>
                          <div className="flex items-center gap-2 ml-0.5">
                            <div className="h-0.5 w-3 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                            <span className="text-[10px] font-medium uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                              Journal Entry
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setShowAddNoteForm(false);
                          setNewNote({ content: '', tags: [], linkedDate: getLocalDateString() });
                        }}
                        className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                        style={{ color: theme.textLight }}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <textarea
                      value={newNote.content}
                      onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
                      placeholder={`${manageConfirm?.protocolName || 'Protocol'} note...`}
                      className="w-full p-3 rounded-lg text-sm resize-none"
                      rows={3}
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : '#e8e6df'}`,
                        boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.06)',
                        color: theme.text
                      }}
                    />

                    {/* Labels */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Tag size={13} style={{ color: theme.primary }} />
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] opacity-50" style={{ color: theme.text }}>
                          Labels
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                        {NOTE_LABELS.map(label => {
                          const Icon = label.icon;
                          const isSelected = newNote.tags.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              onClick={() => handleTagToggle(label.id)}
                              className="flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 active:scale-95"
                              style={{
                                backgroundColor: isSelected ? '#6B7F77' : (theme.isDark ? '#1f2937' : '#f5f4f0'),
                                border: isSelected ? '1px solid #566D64' : `1px solid ${theme.isDark ? 'rgba(255,255,255,0.05)' : '#e8e6df'}`,
                                color: isSelected ? '#fff' : (theme.isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'),
                                boxShadow: isSelected ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.08)' : 'inset 0 1px 3px rgba(0,0,0,0.06)'
                              }}
                            >
                              <Icon size={15} className="mb-0.5" style={{ color: isSelected ? '#fff' : 'inherit' }} />
                              <span className="text-[9px] font-bold uppercase tracking-wider text-center leading-tight">{label.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Calendar Link */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: theme.text }}>
                        <input
                          type="checkbox"
                          checked={showLinkedDate}
                          onChange={(e) => setShowLinkedDate(e.target.checked)}
                          className="rounded"
                          style={{ accentColor: theme.primary }}
                        />
                        <Calendar size={14} style={{ color: theme.primary }} />
                        <span>Show in calendar</span>
                      </label>
                      {showLinkedDate && (
                        <div className="mt-2">
                          <GlassmorphismDatePicker
                            value={newNote.linkedDate}
                            onChange={(date) => setNewNote({ ...newNote, linkedDate: date })}
                            theme={theme}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Edit Note Form */}
                {editingNote && (
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Edit3 size={22} style={{ color: theme.primary }} />
                        <div className="flex flex-col gap-0">
                          <h4 className="text-sm font-semibold tracking-wide" style={{ color: theme.text }}>Edit Note</h4>
                          <div className="flex items-center gap-2 ml-0.5">
                            <div className="h-0.5 w-3 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                            <span className="text-[10px] font-medium uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                              Journal Entry
                            </span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setEditingNote(null)}
                        className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                        style={{ color: theme.textLight }}
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <textarea
                      value={editingNote.content || ''}
                      onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                      placeholder={`${manageConfirm?.protocolName || 'Protocol'} note...`}
                      className="w-full p-3 rounded-lg text-sm resize-none"
                      rows={3}
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.8)',
                        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : '#e8e6df'}`,
                        boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.06)',
                        color: theme.text
                      }}
                    />

                    {/* Labels */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-2">
                        <Tag size={13} style={{ color: theme.primary }} />
                        <span className="text-[10px] font-black uppercase tracking-[0.15em] opacity-50" style={{ color: theme.text }}>
                          Labels
                        </span>
                      </div>
                      <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                        {NOTE_LABELS.map(label => {
                          const Icon = label.icon;
                          const isSelected = editingNote.tags?.includes(label.id);
                          return (
                            <button
                              key={label.id}
                              type="button"
                              onClick={() => handleTagToggle(label.id, true)}
                              className="flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 active:scale-95"
                              style={{
                                backgroundColor: isSelected ? '#6B7F77' : (theme.isDark ? '#1f2937' : '#f5f4f0'),
                                border: isSelected ? '1px solid #566D64' : `1px solid ${theme.isDark ? 'rgba(255,255,255,0.05)' : '#e8e6df'}`,
                                color: isSelected ? '#fff' : (theme.isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'),
                                boxShadow: isSelected ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.08)' : 'inset 0 1px 3px rgba(0,0,0,0.06)'
                              }}
                            >
                              <Icon size={15} className="mb-0.5" style={{ color: isSelected ? '#fff' : 'inherit' }} />
                              <span className="text-[9px] font-bold uppercase tracking-wider text-center leading-tight">{label.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Calendar Link */}
                    <div>
                      <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer" style={{ color: theme.text }}>
                        <input
                          type="checkbox"
                          checked={editingNote.showLinkedDate || false}
                          onChange={(e) => setEditingNote({ 
                            ...editingNote, 
                            showLinkedDate: e.target.checked 
                          })}
                          className="rounded"
                          style={{ accentColor: theme.primary }}
                        />
                        <Calendar size={14} style={{ color: theme.primary }} />
                        <span>Show in calendar</span>
                      </label>
                      {editingNote.showLinkedDate && (
                        <div className="mt-2">
                          <GlassmorphismDatePicker
                            value={editingNote.linkedDate || getLocalDateString()}
                            onChange={(date) => setEditingNote({ ...editingNote, linkedDate: date })}
                            theme={theme}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Notes List */}
                {!showAddNoteForm && !editingNote && (
                  <div className="space-y-2">
                    {notes.length === 0 ? (
                      <div className="text-center py-8" style={{ color: theme.textLight }}>
                        <NotebookPen size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium opacity-60">No notes yet</p>
                        <p className="text-xs opacity-40 mt-1">Add your first note to track progress</p>
                      </div>
                    ) : (
                      notes.map((note, noteIdx) => {
                        const isResearchNote = note._source === 'research';
                        return (
                          <div
                            key={note.id}
                            className="rounded-lg overflow-hidden flex"
                            style={{
                              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.01)',
                              border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : '#e8e6df'}`
                            }}
                          >
                            <div className="w-1 flex-shrink-0 rounded-l-lg" style={{ background: `linear-gradient(to bottom, #445952, #6B7F77)` }} />
                            <div className="flex-1 min-w-0 p-3">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="text-[11px] flex items-center gap-1.5 flex-wrap" style={{ color: theme.textLight }}>
                                    <span>{formatMMDDYYYY(note.createdAt)}</span>
                                    {isResearchNote && (
                                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: theme.primary + '25', color: theme.primary }}>
                                        From Research Notes
                                      </span>
                                    )}
                                    {!isResearchNote && note.linkedDate && (
                                      <span className="flex items-center gap-1 opacity-70">
                                        <Calendar size={10} />
                                        {formatMMDDYYYY(note.linkedDate)}
                                      </span>
                                    )}
                                  </div>
                                  {note.content && (
                                    <p className="text-sm mt-1.5 whitespace-pre-wrap leading-relaxed" style={{ color: theme.text }}>
                                      {note.content}
                                    </p>
                                  )}
                                  {!isResearchNote && note.tags && note.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                      {note.tags.map(tagId => {
                                        const label = NOTE_LABELS.find(t => t.id === tagId);
                                        if (!label) return null;
                                        const LabelIcon = label.icon;
                                        return (
                                          <span
                                            key={tagId}
                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider"
                                            style={{
                                              backgroundColor: '#6B7F77' + '18',
                                              color: '#6B7F77',
                                              border: '1px solid #6B7F7720'
                                            }}
                                          >
                                            <LabelIcon size={10} />
                                            {label.label}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                                {!isResearchNote && (
                                  <div className="flex gap-0.5 flex-shrink-0">
                                    <button
                                      onClick={() => handleEditNote({ ...note, showLinkedDate: !!note.linkedDate })}
                                      className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                                      style={{ color: theme.textLight }}
                                      title="Edit note"
                                    >
                                      <Edit3 size={14} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteNote(note.id)}
                                      className="p-1.5 rounded-lg hover:opacity-70 transition-all"
                                      style={{ color: theme.textLight }}
                                      title="Delete note"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {manageTab === 'share' && manageConfirm && (
              <div className="space-y-4">
                {/* Header Section */}
                <div className="pt-2">
                  <div className="flex items-center gap-4 mb-4">
                    <Eye size={32} style={{ color: theme.primary }} />
                    <div className="flex flex-col gap-0.5 flex-1">
                      <h4 className="text-lg font-semibold tracking-wide" style={{ color: theme.text }}>Preview</h4>
                      <div className="flex items-center gap-2 ml-1">
                        <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                        <span className="text-[10px] font-bold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                          Shareable Content
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview Card */}
                <div className="flex justify-center w-full overflow-x-auto pb-2">
                  <div 
                    ref={shareCardRef} 
                    className="bg-white rounded-2xl shadow-lg inline-block max-w-full" 
                    style={{ 
                      fontFamily: 'Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                      padding: '0'
                    }}
                  >
                    <SharedProtocolCard item={manageConfirm} theme={theme} />
                  </div>
                </div>

              </div>
            )}

            {manageTab === 'history' && (
              <div className="space-y-3">
                {(() => {
                  const activeEntry = manageConfirm?.id ? findActiveProtocolHistoryEntry(manageConfirm.id) : null;
                  const isActive = manageConfirm?.active === true || !!activeEntry;
                  const protocolData = activeEntry?.protocolData || manageConfirm;
                  const linkedItems = activeEntry?.protocolData?.linkedItems || manageConfirm?.linkedItems || {};
                  const lineage = activeEntry?.lineage || {};

                  const buildDetailedTimeline = () => {
                    if (!activeEntry && !isActive) return [];
                    const ev = [];
                    const he = activeEntry || {};
                    const startDate = he.startDate || manageConfirm?.startDate;

                    if (startDate) {
                      const peptideNames = protocolData?.peptides?.map(p => p.name).filter(Boolean).join(', ');
                      const doseInfo = protocolData?.peptides?.map(p => {
                        if (!p.dosage?.amount) return null;
                        return `${p.name || 'peptide'} @ ${p.dosage.amount} ${p.dosage.unit || 'mcg'}`;
                      }).filter(Boolean).join(', ');
                      ev.push({ date: startDate, sort: 0, type: 'start', icon: Play, color: '#10b981', label: 'Protocol started.', detail: doseInfo || peptideNames || null });
                    }

                    if (he.vials?.length > 0) {
                      he.vials.forEach((v, i) => {
                        const pepLin = Object.values(lineage).find(l => l.vial?.stockpileId === v.vialId || l.vial?.stockpileId === v.stockpileId);
                        const vendor = pepLin?.vendor?.name || pepLin?.vial?.vendor || v.vendor;
                        const mg = pepLin?.vial?.mg || v.mg;
                        const cost = pepLin?.vial?.cost || v.cost;
                        const reconSnap = pepLin?.recon;
                        let detail = [mg ? `${mg}mg` : null, vendor ? `from ${vendor}` : null, cost ? `$${Number(cost).toFixed(2)}` : null].filter(Boolean).join(' · ');
                        ev.push({ date: startDate, sort: 1 + i, type: 'link', icon: Link2, color: '#6366f1', label: `${v.name || 'Vial'} linked.`, detail: detail || null });
                        if (reconSnap?.date) {
                          const reconDetail = [reconSnap.water ? `${reconSnap.water}mL BAC water` : null, reconSnap.concentration || null].filter(Boolean).join(' · ');
                          ev.push({ date: reconSnap.date, sort: 1.5 + i, type: 'recon', icon: Droplets, color: '#0ea5e9', label: `${v.name || 'Vial'} reconstituted.`, detail: reconDetail || null });
                        }
                      });
                    }

                    Object.entries(linkedItems).forEach(([pepId, item]) => {
                      const pep = protocolData?.peptides?.find(p => (p.id || `peptide-${protocolData.peptides.indexOf(p)}`) === pepId);
                      const dm = item.deliveryMethod;
                      if (dm) {
                        const method = dm.deliveryMethod === 'pipette' ? 'Syringe' : dm.deliveryMethod ? dm.deliveryMethod.charAt(0).toUpperCase() + dm.deliveryMethod.slice(1) : '';
                        const route = dm.administrationRoute ? dm.administrationRoute.toUpperCase() : '';
                        const pen = dm.penType ? `${dm.penType === 'bird-pen' ? 'Bird Pen' : dm.penType.charAt(0).toUpperCase() + dm.penType.slice(1)}` : '';
                        const detail = [method, route, pen].filter(Boolean).join(' · ');
                        if (detail) ev.push({ date: startDate, sort: 2, type: 'delivery', icon: Pipette, color: '#445952', label: `${pep?.name || 'Peptide'} delivery set to ${method}.`, detail: route || pen ? [route, pen].filter(Boolean).join(' · ') : null });
                      }
                      if (item.vialHistory?.length > 0) {
                        item.vialHistory.forEach(hv => {
                          if (hv.usedAt) {
                            const finDetail = [hv.mg ? `${hv.mg}mg` : null, hv.vendor ? `from ${hv.vendor}` : null].filter(Boolean).join(' · ');
                            ev.push({ date: hv.usedAt, sort: 3, type: 'vial_finished', icon: CircleDot, color: '#f97316', label: `${hv.name || 'Vial'} marked as finished.`, detail: finDetail || null });
                          }
                        });
                      }
                    });

                    if (he.vialsAddedDuring?.length > 0) {
                      he.vialsAddedDuring.forEach(v => {
                        const addDetail = [v.mg ? `${v.mg}mg` : null, v.vendor ? `from ${v.vendor}` : null].filter(Boolean).join(' · ');
                        ev.push({ date: v.addedDate || startDate, sort: 0, type: 'add_vial', icon: Plus, color: '#8b5cf6', label: `${v.name || 'Vial'} added mid-protocol.`, detail: addDetail || null });
                        if (v.reconstitutionDate) {
                          ev.push({ date: v.reconstitutionDate, sort: 0.5, type: 'recon', icon: Droplets, color: '#0ea5e9', label: `${v.name || 'Vial'} reconstituted.`, detail: null });
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
                          ev.push({ date: evt.date, sort: 4, type: 'settings_change', icon: EditIcon, label: evt.summary || 'Protocol settings updated.', detail: null });
                        }
                      });
                    }

                    if (he.notes?.length > 0) {
                      he.notes.forEach(n => {
                        const snippet = n.content ? (n.content.length > 50 ? n.content.slice(0, 50) + '...' : n.content) : '';
                        const tagNames = n.tags?.length > 0 ? n.tags.map(tid => { const l = NOTE_LABELS.find(t => t.id === tid); return l?.label; }).filter(Boolean).join(', ') : null;
                        ev.push({ date: n.createdAt || n.linkedDate, sort: 0, type: 'note', icon: StickyNote, color: '#a78bfa', label: `Note added. ${snippet || ''}`.trim(), detail: tagNames });
                      });
                    }

                    if (he.endDate) {
                      const endLabel = he.endType === 'completed' ? 'Protocol completed.' : he.endType === 'rescheduled' ? 'Stopped to reschedule.' : he.endType === 'manual' ? 'Protocol ended early.' : 'Protocol ended.';
                      ev.push({ date: he.endDate, sort: 10, type: 'end', icon: CalendarX, color: '#ef4444', label: endLabel, detail: null });
                    }

                    ev.sort((a, b) => { const da = new Date(a.date || 0); const db = new Date(b.date || 0); if (da.getTime() !== db.getTime()) return db - da; if (a.sort !== undefined && b.sort !== undefined) return (b.sort || 0) - (a.sort || 0); return 0; });
                    return ev;
                  };

                  const tlEvents = buildDetailedTimeline();

                  const getTimelineColor = (idx, total) => {
                    const light = [127, 158, 149];
                    const dark = [68, 89, 82];
                    const t = total <= 1 ? 0 : idx / (total - 1);
                    const r = Math.round(light[0] + (dark[0] - light[0]) * t);
                    const g = Math.round(light[1] + (dark[1] - light[1]) * t);
                    const b = Math.round(light[2] + (dark[2] - light[2]) * t);
                    return `rgb(${r}, ${g}, ${b})`;
                  };

                  if (tlEvents.length > 0) {
                    return (
                      <div>
                        {/* Section Header */}
                        <div className="flex items-center gap-2 mb-3">
                          <Clock size={18} style={{ color: '#445952' }} />
                          <div className="flex flex-col gap-0">
                            <h4 className="text-sm font-semibold tracking-wide" style={{ color: theme.text }}>Protocol Activity</h4>
                            <div className="flex items-center gap-2 ml-0.5">
                              <div className="h-0.5 w-3 rounded-full" style={{ backgroundColor: '#6B7F77' }}></div>
                              <span className="text-[10px] font-medium uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>Most Recent First</span>
                            </div>
                          </div>
                        </div>

                        {/* Timeline Events */}
                        <div className="space-y-0">
                          {tlEvents.map((ev, idx) => {
                            const Icon = ev.icon;
                            const isLast = idx === tlEvents.length - 1;
                            const sageColor = getTimelineColor(idx, tlEvents.length);
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

                        {/* Past Completed Runs — collapsible */}
                        {timelineEntriesForManage.length > 0 && (
                          <div className="pt-3">
                            <button
                              type="button"
                              onClick={() => setPastRunsExpanded(prev => !prev)}
                              className="w-full flex items-center gap-2 mb-1 group"
                            >
                              <div className="h-px flex-1" style={{ background: `linear-gradient(to right, transparent 0%, ${theme.border} 20%, ${theme.border} 80%, transparent 100%)` }}></div>
                              <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: theme.textLight }}>
                                Past Runs ({timelineEntriesForManage.filter(e => e.type !== 'header').length})
                                {pastRunsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                              </span>
                              <div className="h-px flex-1" style={{ background: `linear-gradient(to left, transparent 0%, ${theme.border} 20%, ${theme.border} 80%, transparent 100%)` }}></div>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  } else if (!isActive && timelineEntriesForManage.length === 0) {
                    return (
                      <div className="text-center py-8" style={{ color: theme.textLight }}>
                        <Clock size={40} className="mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium opacity-60">No activity yet</p>
                        <p className="text-xs opacity-40 mt-1">Start researching to build your protocol activity log</p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Past completed entries — collapsed by default */}
                {timelineEntriesForManage.length > 0 && pastRunsExpanded && (
                  <div className="space-y-3">
                    {timelineEntriesForManage.map((entry) => {
                      if (entry.type === 'header') {
                        return (
                          <div key={entry.key} className="relative flex items-center mb-2 mt-3 first:mt-0">
                            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textLight }}>{entry.month} {entry.year}</h3>
                          </div>
                        );
                      } else {
                        const historyEntry = entry.historyEntry;
                        const statusBadge = getStatusBadge(entry.completionStatus);
                        const StatusIcon = statusBadge?.icon;
                        return (
                          <button
                            key={historyEntry.id}
                            onClick={() => setSelectedHistoryEntryForManage(historyEntry)}
                            className="w-full text-left p-3 rounded-lg transition-all hover:opacity-90 active:scale-[0.99]"
                            style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.01)', border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : '#e8e6df'}` }}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {statusBadge && StatusIcon && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1 w-fit" style={{ backgroundColor: statusBadge.bgColor, color: statusBadge.textColor }}>
                                      <StatusIcon size={10} />{statusBadge.label}
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs flex items-center gap-2" style={{ color: theme.textLight }}>
                                  <span>{entry.startDate}</span>
                                  <span>→</span>
                                  <span>{entry.endDate}</span>
                                  {entry.durationDays > 0 && <span className="font-semibold" style={{ color: theme.text }}>({entry.durationDays}d)</span>}
                                </div>
                              </div>
                              <ChevronRight size={16} style={{ color: theme.textLight }} />
                            </div>
                          </button>
                        );
                      }
                    })}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </BottomSheet>
      )}

      {/* History Detail Modal - From Manage Tab */}
      <ProtocolHistoryDetailModal
        open={!!selectedHistoryEntryForManage}
        onClose={() => setSelectedHistoryEntryForManage(null)}
        historyEntry={selectedHistoryEntryForManage}
        theme={theme}
        stockpile={stockpile}
        onRestore={handleRestoreProtocol}
        onEdit={handleEditFromHistory}
        protocols={protocols}
      />

      {/* Follow-Up Modal - From Manage Tab */}
      {followUpProtocolForManage && (
        <ProtocolFollowUpModal
          open={!!followUpProtocolForManage}
          onClose={() => {
            setFollowUpProtocolForManage(null);
            setFollowUpHistoryIdForManage(null);
            window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
          }}
          protocol={followUpProtocolForManage}
          historyEntryId={followUpHistoryIdForManage}
          theme={theme}
          onSave={() => {
            setFollowUpProtocolForManage(null);
            setFollowUpHistoryIdForManage(null);
            window.dispatchEvent(new CustomEvent('tpp:protocol-history-updated'));
          }}
        />
      )}

      {/* Delete Confirmation Modal - From Manage Modal */}
      <ConfirmationModal
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm) {
            deleteProtocol(deleteConfirm.id);
            setManageConfirm(null);
            setDeleteConfirm(null);
            setManageTab('manage');
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
              detail: { message: 'Protocol deleted', type: 'success' } 
            }));
          }
        }}
        title="Delete Protocol?"
        message={`Are you sure you want to delete "${deleteConfirm?.protocolName || deleteConfirm?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
        theme={theme}
      />

      {/* Delete Confirmation Modal - From Editor Modal */}
      <ConfirmationModal
        open={!!deleteFromEditor}
        onClose={() => setDeleteFromEditor(null)}
        onConfirm={() => {
          if (deleteFromEditor) {
            deleteProtocol(deleteFromEditor.id);
            setEditing(null);
            setDeleteFromEditor(null);
            setEditFromManage(null);
            setManageConfirm(null);
            setManageTab('manage');
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
              detail: { message: 'Protocol deleted', type: 'success' } 
            }));
          }
        }}
        title="Delete Protocol?"
        message={`Are you sure you want to delete "${deleteFromEditor?.protocolName || deleteFromEditor?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
        theme={theme}
      />

      <StartProtocolWizard 
        open={!!startConfirm}
        onClose={() => setStartConfirm(null)}
        protocol={startConfirm ? (() => {
            // Always look up fresh protocol from array to ensure we have complete data
            const foundProtocol = protocols.find(p => p.id === startConfirm.id);
            if (!foundProtocol) {
                console.error('❌ Protocol not found in protocols array:', startConfirm.id, 'Available IDs:', protocols.map(p => p.id));
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: 'Protocol not found. Please refresh and try again.', type: 'error' } 
                }));
                return null;
            }
            // Validate found protocol has required fields
            if (!foundProtocol.protocolName && !foundProtocol.name) {
                console.error('❌ Found protocol missing name:', foundProtocol);
            }
            if (!foundProtocol.peptides || foundProtocol.peptides.length === 0) {
                console.error('❌ Found protocol missing peptides:', foundProtocol);
            }
            // Ephemeral wizard flags live on startConfirm only — merge so Resume UX / draft flow works
            return {
              ...foundProtocol,
              ...(startConfirm._wizardResumeFromHold === true ? { _wizardResumeFromHold: true } : {}),
            };
        })() : null}
        stockpile={stockpile}
        setStockpile={setStockpile}
        theme={theme}
        onStart={(finalizedProtocol) => {
            // Validate protocol has required fields before saving
            if (!finalizedProtocol) {
                console.error('❌ Cannot start: protocol is null or undefined');
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: 'Cannot start protocol: missing data', type: 'error' } 
                }));
                return;
            }
            
            if (!finalizedProtocol.id) {
                console.error('❌ Cannot start: protocol missing id');
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: 'Cannot start protocol: missing protocol ID', type: 'error' } 
                }));
                return;
            }
            
            if (!finalizedProtocol.protocolName && !finalizedProtocol.name) {
                console.error('❌ Cannot start: protocol missing name', finalizedProtocol);
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: 'Cannot start protocol: protocol must have a name', type: 'error' } 
                }));
                return;
            }
            
            if (!finalizedProtocol.peptides || finalizedProtocol.peptides.length === 0) {
                console.error('❌ Cannot start: protocol missing peptides', finalizedProtocol);
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: 'Cannot start protocol: protocol must have at least one peptide', type: 'error' } 
                }));
                return;
            }
            
            // Find the original protocol to ensure we preserve all data
            const originalProtocol = protocols.find(p => p.id === finalizedProtocol.id);
            if (!originalProtocol) {
                console.error('❌ Cannot start: original protocol not found', finalizedProtocol.id);
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: 'Cannot start protocol: original protocol not found', type: 'error' } 
                }));
                return;
            }
            
            // Merge with original to preserve any missing fields
            // CRITICAL: Deep-merge peptides to preserve titration, dosage, and all nested data
            const mergedPeptides = (finalizedProtocol.peptides || originalProtocol.peptides || []).map((pep, index) => {
                const originalPep = originalProtocol.peptides?.[index];
                // If wizard returned peptides, merge each one with original to preserve titration/dosage/etc
                return {
                    ...originalPep,  // Original first (includes titration, dosage, all fields)
                    ...pep,          // Wizard data second (linkedItems, deliveryMethod, unitValue updates)
                    // Explicitly preserve critical nested data that might be missing from wizard
                    titration: pep.titration || originalPep?.titration,
                    dosage: pep.dosage || originalPep?.dosage,
                    frequency: pep.frequency || originalPep?.frequency,
                    // Syringe/pen draw units from start-wizard recon
                    unitValue: (pep.unitValue != null && String(pep.unitValue).trim() !== '')
                        ? pep.unitValue
                        : (originalPep?.unitValue ?? ''),
                };
            });
            
            // Strip wizard-only UI flags before persisting
            const { _wizardResumeFromHold: _wizHold, ...wizardSanitized } = finalizedProtocol || {};

            const mergedProtocol = {
                ...originalProtocol, // Start with original to preserve all data
                ...wizardSanitized, // Override with wizard data
                // Ensure critical fields are preserved
                protocolName: finalizedProtocol.protocolName || originalProtocol.protocolName || originalProtocol.name,
                peptides: mergedPeptides, // Use deep-merged peptides
                purpose: finalizedProtocol.purpose || originalProtocol.purpose,
                duration: finalizedProtocol.duration || originalProtocol.duration
            };
            
            // Compute and persist explicit endDate based on duration/cycle for reliable calendar sync
            const computeEndDate = (p) => {
                try {
                    if (!p?.startDate) return null;
                    // CRITICAL: Use centralized date parsing
                    const start = parseDateString(p.startDate);
                    if (!start) return null;
                    const startNormalized = normalizeToMidnight(start);
                    let end = null;
                    // Prefer cycle if present
                    const cyclePeptide = p.peptides?.find(pep => pep.frequency?.type === 'cycle');
                    
                    // SPECIAL CASE: Ongoing cycles - calculate far-future endDate for scheduling
                    if (cyclePeptide && p.duration?.noEnd) {
                        const onDays = Number(cyclePeptide.frequency.onDays) || 0;
                        const offDays = Number(cyclePeptide.frequency.offDays) || 0;
                        if (onDays > 0) {
                            // For ongoing cycles, schedule 1 year ahead for calendar purposes
                            end = new Date(startNormalized);
                            end.setFullYear(end.getFullYear() + 1);
                        }
                    }
                    // Regular cycle with set duration
                    else if (cyclePeptide) {
                        const onDays = Number(cyclePeptide.frequency.onDays) || 0;
                        const offDays = Number(cyclePeptide.frequency.offDays) || 0;
                        if (onDays > 0 && p.duration && p.duration.count > 0 && p.duration.unit) {
                            const durationInDays = (() => {
                                const count = Number(p.duration.count);
                                const unit = String(p.duration.unit).toLowerCase();
                                if (unit.includes('day')) return count;
                                if (unit.includes('week')) return count * 7;
                                if (unit.includes('month')) return count * 30; // approx
                                return 0;
                            })();
                            const fullCycles = Math.floor(durationInDays / onDays);
                            const remainingOn = durationInDays % onDays;
                            let total = fullCycles * (onDays + offDays);
                            if (remainingOn > 0) total += remainingOn; else if (fullCycles > 0) total -= offDays;
                            end = new Date(startNormalized);
                            // For scheduling days inclusively, ensure exact number of ON days are counted
                            end.setDate(end.getDate() + total - 1);
                        }
                    }
                    if (!end && p.duration && !p.duration.noEnd && p.duration.count > 0 && p.duration.unit) {
                        end = new Date(startNormalized);
                        const unit = String(p.duration.unit).toLowerCase();
                        const count = Number(p.duration.count) || 0;
                        // Inclusive end: 5 days means start..start+4
                        if (unit.includes('day')) end.setDate(end.getDate() + count - 1);
                        else if (unit.includes('week')) end.setDate(end.getDate() + (count * 7) - 1);
                        else if (unit.includes('month')) { end.setMonth(end.getMonth() + count); end.setDate(end.getDate() - 1); }
                    }
                    return end ? getLocalDateString(end) : null;
                } catch { return null; }
            };

            const ensureTimes = (p) => ({
                ...p,
                peptides: (p.peptides || []).map(pep => {
                    const f = pep.frequency || {};
                    const time = Array.isArray(f.time) && f.time.length > 0 ? f.time : ['AM'];
                    // CRITICAL: Preserve all peptide data including titration, dosage, deliveryMethod, etc.
                    return { ...pep, frequency: { ...f, time } };
                })
            });

            const withTimes = ensureTimes(mergedProtocol);
            const explicitEnd = computeEndDate(withTimes);
            // Leaving heldByFreePlan / heldAt set would keep the protocol in the "Held" bucket even when active
            const clearedHold = {
              ...withTimes,
              heldByFreePlan: false,
              heldAt: null,
            };
            const toSave = explicitEnd
                ? { ...clearedHold, endDate: explicitEnd, active: true }
                : { ...clearedHold, active: true };

            // Final validation before saving
            if (!toSave.protocolName && !toSave.name) {
                console.error('❌ Cannot save: protocol still missing name after merge', toSave);
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: 'Cannot start protocol: name is required', type: 'error' } 
                }));
                return;
            }
            
            if (!toSave.peptides || toSave.peptides.length === 0) {
                console.error('❌ Cannot save: protocol still missing peptides after merge', toSave);
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                    detail: { message: 'Cannot start protocol: at least one peptide is required', type: 'error' } 
                }));
                return;
            }

            // Save protocol history entry first so it's included in the force sync
            try {
                // Extract vial information from linkedItems and track skipped reconstitution
                const vials = [];
                const skippedReconstitution = {};
                const linkedItems = finalizedProtocol.linkedItems || {};
                Object.entries(linkedItems).forEach(([peptideId, item]) => {
                    if (item.status === 'skipped' && item.deliveryMethod) {
                        // Track skipped reconstitution with delivery method info
                        const peptide = finalizedProtocol.peptides?.find(p => (p.id || `peptide-${finalizedProtocol.peptides.indexOf(p)}`) === peptideId);
                        skippedReconstitution[peptideId] = {
                            peptideName: peptide?.name || 'Unknown',
                            deliveryMethod: item.deliveryMethod
                        };
                    } else if (item.status === 'linked' && item.vialId) {
                        const vial = stockpile.find(v => v.id === item.vialId);
                        if (vial) {
                            vials.push({
                                vialId: vial.id,
                                stockpileId: vial.id,
                                name: vial.name,
                                mg: vial.mg,
                                mgUnit: vial.mgUnit || 'mg',
                                unit: vial.unit || 'vial',
                                vendor: vial.vendor,
                                cost: vial.cost,
                                orderId: vial.orderId || null,
                                purchaseDate: vial.purchaseDate || null,
                                documentation: vial.documentation || [],
                                reconstitutionDate: null,
                                deliveryMethod: item.deliveryMethod || null
                            });
                        }
                    }
                });

                // Try to find the most recent reconstitution data for this protocol
                let reconstitutionData = null;
                try {
                    // Find recon items that match this protocol name
                    const protocolNameForRecon = toSave.protocolName || toSave.name || finalizedProtocol.protocolName || '';
                    const matchingRecon = reconItems
                        .filter(item => item.name && protocolNameForRecon && item.name.includes(protocolNameForRecon))
                        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
                    
                    if (matchingRecon.length > 0) {
                        const latestRecon = matchingRecon[0];
                        reconstitutionData = {
                            date: latestRecon.date,
                            reconStrategy: latestRecon.reconStrategy,
                            peptides: latestRecon.peptides
                        };
                        
                        // Update vial reconstitution dates from recon data
                        if (latestRecon.peptides) {
                            latestRecon.peptides.forEach(reconPep => {
                                const vial = vials.find(v => v.vialId === reconPep.stockpileId || v.name === reconPep.name);
                                if (vial) {
                                    vial.reconstitutionDate = latestRecon.date;
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.warn('Failed to load reconstitution data for history:', e);
                }

                // Save history entry with all linkedItems data - use toSave so history matches saved protocol (merge may have restored name)
                saveProtocolHistoryEntry({
                    protocolId: toSave.id,
                    protocolName: toSave.protocolName || toSave.name || 'Unnamed Protocol',
                    startDate: toSave.startDate,
                    protocolData: {
                        protocolName: toSave.protocolName || toSave.name,
                        peptides: toSave.peptides,
                        duration: toSave.duration,
                        purpose: toSave.purpose,
                        linkedItems: toSave.linkedItems || {} // Save complete linkedItems for reference
                    },
                    vials: vials,
                    reconstitutionData: reconstitutionData,
                    skippedReconstitution: Object.keys(skippedReconstitution).length > 0 ? skippedReconstitution : null
                });
            } catch (error) {
                console.error('Failed to save protocol history:', error);
            }

            updateProtocolWithForceSync(toSave);

            // Trigger dashboard and calendar refresh
            window.dispatchEvent(new CustomEvent('tpp:calendar-sync', { detail: { protocolUpdated: true } }));
            window.dispatchEvent(new CustomEvent('tpp:task-completion-changed', { detail: { protocolStarted: true } }));

            // Close the modal after the update has been queued.
            setStartConfirm(null);
        }}
      />

      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => { setShowUpgradeModal(false); setUpgradeLimitContext(null); }}
        limitContext={upgradeLimitContext}
        theme={theme}
      />

      {/* Notes Modal for active protocols */}
      {manageConfirm && (
        <ProtocolNotesModal
          open={isNotesModalOpen}
          onClose={() => setIsNotesModalOpen(false)}
          protocol={manageConfirm}
          theme={theme}
        />
      )}

      {/* Share Modal */}
      {manageConfirm && (
        <ShareModal
          open={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          theme={theme}
          title="Protocol"
          shareUrl={`${window.location.origin}${SHARE_BASE_PATH}/protocols/${manageConfirm.id}`}
          CardComponent={ProtocolCard}
          cardProps={{ item: manageConfirm, theme, isPublicView: true }}
          shareData={{ ...manageConfirm, type: 'protocol' }}
        />
      )}

      {/* History Share Modal */}
      {historyShareData && (
        <ShareModal
          open={isHistoryShareModalOpen}
          onClose={() => setIsHistoryShareModalOpen(false)}
          theme={theme}
          title="History"
          cardProps={{ item: historyShareData, theme }}
          shareData={historyShareData}
        />
      )}

      <ReconCalculatorModal
        open={reconModalOpen}
        onClose={() => { setReconModalOpen(false); setReconPrefill(null); }}
        theme={theme}
        prefill={reconPrefill}
      />

      {showDateChangeTip && dateTipPos && createPortal(
        <div
          className="pointer-events-none"
          style={{
            position: 'fixed',
            top: dateTipPos.top,
            left: dateTipPos.left,
            transform: `translate(-50%, -100%)`,
            zIndex: 99999,
          }}
        >
          <div
            className="text-[11px] text-center py-1.5 px-4 rounded-lg whitespace-nowrap"
            style={{
              backgroundColor: theme.isDark ? '#2a2018' : '#fef6f2',
              color: '#c87a5c',
              border: '1px solid #c87a5c40',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              animation: 'fadeInDown 0.25s ease-out',
            }}
          >
            This will reschedule all research for this protocol.
          </div>
        </div>,
        document.body
      )}

      <AIAnalyzeStackModal
        open={aiAnalyzeOpen}
        theme={theme}
        protocols={filteredProtocols}
        supplements={Array.isArray(contextSupplements) ? contextSupplements : []}
        onClose={() => setAiAnalyzeOpen(false)}
      />

      {/* ── Free-plan: choose active protocol ─────────────────────────── */}
      {showChooseModal && organizedProtocols.active.length > 1 && (
        <ChooseActiveProtocolModal
          protocols={organizedProtocols.active}
          theme={theme}
          mode="choose"
          onChoose={handleChooseProtocol}
        />
      )}

      {/* ── Free-plan: slot open — resume a held protocol ─────────────── */}
      {showSlotOpenModal && organizedProtocols.heldByFreePlan.length > 0 && (
        <ChooseActiveProtocolModal
          protocols={organizedProtocols.heldByFreePlan}
          theme={theme}
          mode="resume"
          onChoose={handleResumeHeldProtocol}
        />
      )}
    </div>
  )
}

const formatFrequency = (freq) => {
  if (!freq) return 'Not set';
  const timeChoice = (() => {
    const times = freq.time || [];
    const hasAM = times.includes('AM');
    const hasPM = times.includes('PM');
    if (hasAM && hasPM) return 'AM/PM';
    if (hasAM) return 'AM';
    if (hasPM) return 'PM';
    return '';
  })();
  
  if (freq.type === 'cycle') {
    return `Cycle: ${freq.onDays || 0} on, ${freq.offDays || 0} off (${timeChoice})`;
  }
  return `Every ${freq.count || 1} ${String(freq.per || 'Day')}${freq.count > 1 ? 's' : ''} (${timeChoice})`;
};
