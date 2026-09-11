import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom'
import { themes, defaultThemeName } from '../theme/themes'
import TextInput from '../components/common/inputs/TextInput'
import GlassmorphismDatePicker from '../components/common/GlassmorphismDatePicker'
import { Edit, Trash2, PlusCircle, Filter, FileText, Eye, PenTool, Search, Package, Calendar, Beaker, Droplet, Calculator, Save, CheckCircle, History, Pipette, X, TestTube, Droplets, ChevronDown, Hash, Info, Tag, Percent, FilePlus, Link, Hand, List, CheckCircle2, XCircle } from 'lucide-react'
import AutoSaveIndicator from '../components/common/AutoSaveIndicator'
import useAutoSave from '../utils/useAutoSave'
import VendorSuggestInput from '../components/vendors/VendorSuggestInput'
import CustomDropdown from '../components/common/inputs/CustomDropdown'
import ColorSwatchDropdown from '../components/common/inputs/ColorSwatchDropdown'
import { ReconCalculatorPanel } from '../components/recon/ReconCalculatorPanel'
import ReconTipsBanner from '../components/recon/ReconTipsBanner'
import { isNative } from '../utils/platform'
import { formatCurrency } from '../utils/currencyUtils'
import { getChromeGradient } from '../utils/recon'
import { PEN_COLORS, penColors } from '../utils/penColors'
import Tabs from '../components/common/Tabs'
import BottomSheet from '../components/common/BottomSheet'
import Modal from '../components/common/Modal'
import { calculateRecon } from '../utils/recon'
import { formatMMDDYYYY } from '../utils/date'
import { useAppContext } from '../context/AppContext'
import { appendStockEvent } from '../utils/stockHistory'
import { generateId } from '../utils/string'
import { useSubscriptionAccess, useTierAccess } from '../utils/useSubscriptionAccess'
import UpgradeModal from '../components/common/UpgradeModal'
import { saveAppData } from '../services/cloudStorage'
import { prepareItemForSave } from '../utils/userDataSave'
import { useFirebase } from '../context/FirebaseContext'
import { recordDeletion } from '../utils/deletionTracking'
import { getProtocolHistory } from '../utils/protocolHistory'
import { getCurrentTitrationPhase } from '../utils/calendarTasks'

function DataPoint({ icon: Icon, label, value, theme }) {
	return (
		<div className="flex items-center gap-2 text-[12px] group/item">
			<span style={{ color: '#8ca68c' }}><Icon size={12} /></span>
			<span className="truncate opacity-80" style={{ color: theme.text }}>
				{value}
			</span>
		</div>
	);
}

export default function Recon() {
	const { theme } = useOutletContext()
    const { reconItems, setReconItems, vendors, reconHistory, setReconHistory, stockpile, setStockpile, protocols, setProtocols, orders, supplements, metrics, calendarNotes, scheduledBuys } = useAppContext();
    const { isReadOnly } = useSubscriptionAccess();
    const { isFree, canSaveCalc } = useTierAccess();
    const { firebaseUser } = useFirebase();
    const navigate = useNavigate();
	const [searchParams] = useSearchParams()
	const [editingItem, setEditingItem] = useState(null)
	const [showEditModal, setShowEditModal] = useState(false)
	const [viewItem, setViewItem] = useState(null)
    const [historyToDelete, setHistoryToDelete] = useState(null)
    const [showCalculatorModal, setShowCalculatorModal] = useState(false)
    const [calculatorFormData, setCalculatorFormData] = useState(null)
    const [isSavingCalculator, setIsSavingCalculator] = useState(false)
    const [calcSummary, setCalcSummary] = useState({ unitsPerDose: 0, dosesPerVial: 0, costPerDose: '' })

    // Autosave for Add/Edit Recon modal
    const [draft, setDraft] = useState({})
    const { isSaving, lastSaved, clearSavedData, updateFormData } = useAutoSave('tpprover_recon_add_draft', draft, setDraft, 1200)
	const [prefill, setPrefill] = useState(null)
	const [draftIdToRemove, setDraftIdToRemove] = useState(null) // Track draft ID to remove when saving
	const [activeTab, setActiveTab] = useState('inuse') // inuse | history | calculator
	const [inUseFilter, setInUseFilter] = useState('all') // all | inuse | draft
	const [searchQuery, setSearchQuery] = useState('')
	const [showHistoryFilters, setShowHistoryFilters] = useState(false)
	const [historyFilters, setHistoryFilters] = useState({ peptide: '', vendor: '' })
	const [showUpgradeModal, setShowUpgradeModal] = useState(false)
	const [confirmDelete, setConfirmDelete] = useState(false)
	const [isPenTypeDropdownOpen, setIsPenTypeDropdownOpen] = useState(false)
	const penTypeDropdownRef = useRef(null)
	const [penColor, setPenColor] = useState('#9ca3af')
	const [isMgUnitDropdownOpen, setIsMgUnitDropdownOpen] = useState(false)
	const [isDoseUnitDropdownOpen, setIsDoseUnitDropdownOpen] = useState(false)
	const [isAmountFocused, setIsAmountFocused] = useState(false)
	const [isDoseFocused, setIsDoseFocused] = useState(false)
	const getPrimaryActionGradient = useCallback((saving = false) => {
		const secondaryColor = theme?.secondary || '#d1d5db';
		if (saving) {
			return `linear-gradient(135deg, ${secondaryColor} 0%, ${secondaryColor} 100%)`;
		}
		return `linear-gradient(135deg, ${theme?.primary || '#2563eb'} 0%, ${theme?.primaryDark || theme?.primary || '#1d4ed8'} 100%)`;
	}, [theme]);
	const primaryActionDefaultShadow = useMemo(() => (
		theme?.isDark ? '0 4px 10px rgba(0, 0, 0, 0.35)' : '0 4px 12px rgba(15, 23, 42, 0.18)'
	), [theme]);
	const primaryActionHoverShadow = useMemo(() => (
		theme?.isDark ? '0 12px 28px rgba(0, 0, 0, 0.55)' : '0 12px 28px rgba(15, 23, 42, 0.24)'
	), [theme]);
	const terracottaGradient = 'linear-gradient(135deg, #c87a5c 0%, #b5684a 100%)';
	const terracottaHoverGradient = 'linear-gradient(135deg, #b5684a 0%, #a35a3f 100%)';

	const updateEditingItem = useCallback((updates) => {
		if (!updates) return;
		setEditingItem(prev => ({ ...(prev || {}), ...updates }));
	}, [setEditingItem]);

	useEffect(() => {
		if (showEditModal === true && !editingItem) {
			if (draft && Object.keys(draft).length > 0) {
				setEditingItem({ ...draft });
			} else {
				setEditingItem({ doseUnit: 'mcg' });
			}
		}
	}, [showEditModal, editingItem, draft]);

    useEffect(() => {
		try {
			localStorage.setItem('tpprover_recon_history', JSON.stringify(reconHistory));
		} catch (e) {
			console.error("Failed to save recon history", e);
		}
	}, [reconHistory]);

	// Load prefill data from stockpile and auto-open calculator
	// Only load if it's valid data (has peptide name or peptides array)
	useEffect(() => {
		try {
			const raw = localStorage.getItem('tpprover_recon_prefill')
			if (raw) {
				const data = JSON.parse(raw)
				// Only use prefill if it has valid data (peptide name or peptides array)
				// This prevents stale test data from prefilling the calculator
				const hasValidPrefill = (data.peptide && data.peptide.trim() !== '') || 
				                       (Array.isArray(data.peptides) && data.peptides.length > 0 && data.peptides.some(p => p.name && p.name.trim() !== ''))
				
				if (hasValidPrefill) {
					setPrefill(data)
					// Automatically open calculator modal when valid prefill data exists
					setShowCalculatorModal(true)
					// Show toast to let user know data was loaded
					const peptideName = data.peptide || (data.peptides && data.peptides[0]?.name) || 'peptide'
					window.dispatchEvent(new CustomEvent('tpp:toast', { 
						detail: { message: `✅ Loaded ${peptideName} from stockpile!`, type: 'success' } 
					}));
				} else {
					// Clear invalid/stale prefill data
					localStorage.removeItem('tpprover_recon_prefill')
				}
			}
		} catch {
			// Clear corrupted prefill data
			try { localStorage.removeItem('tpprover_recon_prefill') } catch {}
		}
	}, [])

	// Handle click outside for dropdowns (supports both mouse and touch)
	useEffect(() => {
		const handleClickOutside = (event) => {
			if (penTypeDropdownRef.current && !penTypeDropdownRef.current.contains(event.target)) {
				setIsPenTypeDropdownOpen(false);
			}
		};

		if (isPenTypeDropdownOpen) {
			// Support both mouse and touch events for mobile compatibility
			document.addEventListener('mousedown', handleClickOutside);
			document.addEventListener('touchstart', handleClickOutside);
		}

		return () => {
			document.removeEventListener('mousedown', handleClickOutside);
			document.removeEventListener('touchstart', handleClickOutside);
		};
	}, [isPenTypeDropdownOpen]);

	// Close dropdowns when clicking outside
	useEffect(() => {
		if (!isMgUnitDropdownOpen && !isDoseUnitDropdownOpen) return;

		const handleClickOutside = (event) => {
			const isClickInside = event.target.closest('[data-dropdown-container]');
			if (!isClickInside) {
				setIsMgUnitDropdownOpen(false);
				setIsDoseUnitDropdownOpen(false);
			}
		};

		const timeoutId = setTimeout(() => {
			document.addEventListener('click', handleClickOutside);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener('click', handleClickOutside);
		};
	}, [isMgUnitDropdownOpen, isDoseUnitDropdownOpen]);

	// Sync pen color from editingItem
	useEffect(() => {
		if (editingItem?.penColor) {
			// Find the hex color from the pen color name
			const colorObj = penColors.find(c => c.name.toLowerCase() === editingItem.penColor.toLowerCase());
			if (colorObj) {
				setPenColor(colorObj.hex);
			}
		}
	}, [editingItem?.penColor]);

	const handleSave = (item) => {
		// For single-peptide items stored as a peptides array, propagate top-level dose/mg edits
		// back into peptides[0] so the card display (which reads peptides[0].dose) stays in sync
		let itemToSave = item;
		if (Array.isArray(item?.peptides) && item.peptides.length === 1) {
			const resolvedDoseUnit = item.doseUnit ?? item.peptides[0]?.doseUnit;
			itemToSave = {
				...item,
				...(resolvedDoseUnit !== undefined ? { doseUnit: resolvedDoseUnit } : {}),
				peptides: item.peptides.map((p, idx) =>
					idx === 0
						? {
							...p,
							...(item.dose !== undefined ? { dose: item.dose } : {}),
							...(resolvedDoseUnit !== undefined ? { doseUnit: resolvedDoseUnit } : {}),
							...(item.mg !== undefined ? { mg: item.mg } : {}),
						  }
						: p
				),
			};
		}

		// Persist calculated units so ProtocolCard can read them without recalculating
		const totalMg = Array.isArray(itemToSave?.peptides) && itemToSave.peptides.length > 0
			? itemToSave.peptides.reduce((sum, p) => sum + (Number(p.mg) || 0), 0)
			: Number(itemToSave?.mg) || 0;
		const firstPep = itemToSave?.peptides?.[0] || {};
		const doseForCalc = firstPep.dose ?? itemToSave?.dose;
		const doseUnitForCalc = firstPep.doseUnit || itemToSave?.doseUnit || 'mcg';
		const reconCalc = calculateRecon({
			mg: totalMg,
			water: itemToSave?.water,
			dose: doseForCalc,
			doseUnit: doseUnitForCalc,
			iuConversionFactor: firstPep.iuConversionFactor || 0.001,
		});
		const unitsRounded = reconCalc.unitsPerDose > 0 ? Math.round(reconCalc.unitsPerDose) : 0;
		itemToSave = {
			...itemToSave,
			mg: totalMg || itemToSave?.mg,
			dose: doseForCalc ?? itemToSave?.dose,
			doseUnit: doseUnitForCalc,
			units: unitsRounded > 0 ? String(unitsRounded) : (itemToSave?.units || ''),
			unitsPerDose: reconCalc.unitsPerDose || itemToSave?.unitsPerDose || 0,
			dosesPerVial: reconCalc.dosesPerVial || itemToSave?.dosesPerVial || 0,
		};

		const next = editingItem?.id
			? reconItems.map(i => i.id === editingItem.id ? prepareItemForSave({ 
				...i, 
				...itemToSave
			}) : i)
			: [prepareItemForSave({ 
				id: generateId(), 
				...itemToSave
			}, { isNew: true }), ...reconItems]
		setReconItems(next)

		// Stamp draw units onto linked protocol peptide(s) so cards/calendar show them
		if (unitsRounded > 0 && typeof setProtocols === 'function') {
			const savedId = editingItem?.id || next[0]?.id;
			setProtocols(prev => (prev || []).map(p => {
				const linked = p.linkedItems && Object.values(p.linkedItems).some(l => l?.reconId === savedId);
				const byId = itemToSave.protocolId && p.id === itemToSave.protocolId;
				if (!linked && !byId) return p;
				const peptides = (p.peptides || []).map(pep => {
					const isTitration = pep.dosageScheduleType !== 'fixed'
						&& Array.isArray(pep.titration)
						&& pep.titration.length > 0;
					if (isTitration) return pep; // phase-dependent — don't stamp static unitValue
					if (String(pep.unitValue || '').trim()) return pep;
					return { ...pep, unitValue: String(unitsRounded) };
				});
				return prepareItemForSave({ ...p, peptides });
			}));
		}

		setShowEditModal(false)
		setEditingItem(null)
		setDraft({})
		clearSavedData()
	}

	const handleSaveEdit = (editedData) => {
		setReconItems(prev => prev.map(item => 
			item.id === editingItem.id ? prepareItemForSave({ ...item, ...editedData }) : item
		));
		setEditingItem(null);
	};

	// Helper function to remove draft and sync immediately
	const removeDraftAndSync = useCallback(async (draftId) => {
		if (!draftId) return;
		
		// Remove from local state with timestamps
		const updatedItems = reconItems.filter(item => item.id !== draftId);
		setReconItems(updatedItems);
		
		// Immediately sync to localStorage
		try {
			localStorage.setItem('tpprover_recon_items', JSON.stringify(updatedItems));
		} catch (e) {
			console.error("Failed to save recon items to localStorage", e);
		}
		
		// CRITICAL: Force immediate cloud sync with skipMerge: false for proper timestamp resolution
		// This prevents server data from restoring deleted items
		if (firebaseUser) {
			try {
				const userId = firebaseUser.uid;
				const appData = {
					protocols: protocols || [],
					reconItems: updatedItems,
					reconHistory: reconHistory || [],
					supplements: supplements || [],
					orders: orders || [],
					metrics: metrics || [],
					vendors: vendors || [],
					calendarNotes: calendarNotes || {},
					stockpile: stockpile || [],
					scheduledBuys: scheduledBuys || []
				};
				
				// Use skipMerge: false for intelligent timestamp-based merging
				const syncResult = await saveAppData(userId, appData, { skipMerge: false });
				if (syncResult) {
					console.log('✅ Draft removal synced to cloud with force merge');
					
					// CRITICAL: Update localStorage timestamp to prevent listener from overwriting
					try {
						localStorage.setItem('tpprover_reconItems_lastUpdate', String(Date.now()));
					} catch (e) {
						console.warn('Failed to set recon lastUpdate timestamp:', e);
					}
				} else {
					console.error('❌ Failed to sync draft removal to cloud');
				}
			} catch (error) {
				console.error('❌ Error syncing draft removal to cloud:', error);
				// Don't throw - the auto-sync will handle it
			}
		}
	}, [reconItems, setReconItems, firebaseUser, protocols, reconHistory, supplements, orders, metrics, calendarNotes, stockpile, scheduledBuys]);

	// Helper function to find which protocol uses a recon item
	const getProtocolForReconItem = useCallback((reconItem) => {
		if (!reconItem) return null;
		
		// First check if recon item has protocolId directly
		if (reconItem.protocolId) {
			const protocol = protocols.find(p => p.id === reconItem.protocolId);
			if (protocol) {
				return {
					id: protocol.id,
					name: protocol.protocolName || protocol.name
				};
			}
		}
		
		// Second: scan active protocols' linkedItems for a matching reconId
		for (const protocol of protocols) {
			const linkedItems = protocol.linkedItems || {};
			const hasMatch = Object.values(linkedItems).some(link => link.reconId === reconItem.id);
			if (hasMatch) {
				return {
					id: protocol.id,
					name: protocol.protocolName || protocol.name
				};
			}
		}
		
		// Third: search through protocol history entries
		const allHistory = getProtocolHistory();
		for (const historyEntry of allHistory) {
			if (historyEntry.reconstitutionData) {
				const reconData = historyEntry.reconstitutionData;
				if (reconData.id === reconItem.id || 
				    (Array.isArray(reconData.peptides) && reconData.peptides.some(p => p.stockpileId === reconItem.stockpileId))) {
					const protocol = protocols.find(p => p.id === historyEntry.protocolId);
					if (protocol) {
						return {
							id: protocol.id,
							name: protocol.protocolName || protocol.name
						};
					}
					return {
						id: historyEntry.protocolId,
						name: historyEntry.protocolName || 'Unknown Protocol'
					};
				}
			}
		}
		
		return null;
	}, [protocols]);

	const handleDelete = async (id) => {
		// Find the item being deleted for logging
		const itemToDelete = reconItems.find(item => item.id === id);
		
		// Record deletion with item snapshot for restore functionality
		if (itemToDelete) {
			recordDeletion('reconItems', id, itemToDelete);
		} else {
			recordDeletion('reconItems', id);
		}
		
		// Remove from local state (don't update timestamps on unchanged items)
		const updatedItems = reconItems.filter(item => item.id !== id);
		setReconItems(updatedItems);
		setEditingItem(null);
		setShowEditModal(false);
		
		// CRITICAL: Force immediate cloud sync with skipMerge: false for proper timestamp resolution
		// This prevents server data from restoring deleted items
		if (firebaseUser) {
			try {
				const userId = firebaseUser.uid;
				const appData = {
					protocols: protocols || [],
					reconItems: updatedItems, // Use updated items with deletion
					reconHistory: reconHistory || [],
					supplements: supplements || [],
					orders: orders || [],
					metrics: metrics || [],
					vendors: vendors || [],
					calendarNotes: calendarNotes || {},
					stockpile: stockpile || [],
					scheduledBuys: scheduledBuys || []
				};
				
				// Use skipMerge: false for intelligent timestamp-based merging
				const syncResult = await saveAppData(userId, appData, { skipMerge: false });
				if (syncResult) {
					console.log('✅ Recon item deletion synced to cloud with force merge');
					
					// CRITICAL: Update localStorage timestamp to prevent listener from overwriting
					try {
						localStorage.setItem('tpprover_reconItems_lastUpdate', String(Date.now()));
					} catch (e) {
						console.warn('Failed to set recon lastUpdate timestamp:', e);
					}
				} else {
					console.error('❌ Failed to sync deleted recon item to cloud');
				}
			} catch (error) {
				console.error('❌ Error syncing deleted recon item to cloud:', error);
				// Don't throw - the auto-sync will handle it
			}
		}
	};

	const vendorMap = useMemo(() => vendors.reduce((acc, v) => ({ ...acc, [v.id]: v.name }), {}), [vendors]);

	// Filter options for In Use tab
	const inUseFilterOptions = useMemo(() => {
		const inUseCount = reconItems.filter(i => !i.isDraft).length;
		const draftCount = reconItems.filter(i => i.isDraft).length;
		const totalCount = reconItems.length;
		
		return [
			{
				value: 'all',
				label: `All Vials (${totalCount})`,
				icon: <List size={16} style={{ color: theme.textLight }} />
			},
			{
				value: 'inuse',
				label: `Currently In Use (${inUseCount})`,
				icon: <CheckCircle2 size={16} style={{ color: theme.primary }} />
			},
			{
				value: 'draft',
				label: `Draft Vials (${draftCount})`,
				icon: <XCircle size={16} style={{ color: theme.textLight }} />
			}
		];
	}, [reconItems, theme.textLight, theme.primary]);

    const adjustStockpileAfterRecon = useCallback((peptidesUsed) => {
        if (!Array.isArray(peptidesUsed) || peptidesUsed.length === 0) {
            return;
        }

        const usageMap = peptidesUsed.reduce((acc, pep) => {
            if (!pep || !pep.stockpileId) {
                return acc;
            }
            const qty = Number(pep.quantityUsed) || 1;
            acc[pep.stockpileId] = (acc[pep.stockpileId] || 0) + qty;
            return acc;
        }, {});

        if (Object.keys(usageMap).length === 0) {
            return;
        }

        setStockpile(prev => {
            let changed = false;
            const updated = prev.map(item => {
                const usedQty = usageMap[item.id];
                if (!usedQty) return item;

                const currentQty = Number(item.quantity) || 0;
                const nextQty = Math.max(0, currentQty - usedQty);

                if (nextQty === currentQty) {
                    return item;
                }

                changed = true;

                try {
                    appendStockEvent({
                        type: 'used',
                        name: item.name,
                        mg: item.mg,
                        vendor: item.vendorId ? vendorMap[item.vendorId] : item.vendor,
                        prevQty: currentQty,
                        nextQty,
                        source: 'recon'
                    });
                } catch (error) {
                    console.warn('Failed to append stock event after recon save:', error);
                }

                // Keep item at quantity 0 (shows in "Out of Stock" tab) with proper timestamp
                return prepareItemForSave({ ...item, quantity: String(nextQty) });
            });

            return changed ? updated : prev;
        });
    }, [setStockpile, vendorMap]);

	// Helper functions to extract data from editing item
	const getEditingPeptideName = () => {
		if (!editingItem) return draft.peptide || '';
		if (editingItem.peptide) return editingItem.peptide;
		if (Array.isArray(editingItem.peptides) && editingItem.peptides.length > 0) {
			return editingItem.peptides.map(p => p.name || 'Unnamed').join(' + ');
		}
		return '';
	};

	const getEditingMg = () => {
		if (!editingItem) return draft.mg || '';
		if (editingItem.mg !== undefined && editingItem.mg !== null) return editingItem.mg;
		if (Array.isArray(editingItem.peptides) && editingItem.peptides.length > 0) {
			return editingItem.peptides.reduce((sum, p) => sum + (Number(p.mg) || 0), 0);
		}
		return '';
	};

	const getEditingDose = () => {
		if (!editingItem) return draft.dose || '';
		if (editingItem.dose !== undefined && editingItem.dose !== null) return editingItem.dose;
		if (Array.isArray(editingItem.peptides) && editingItem.peptides.length > 0) {
			return editingItem.peptides.reduce((sum, p) => {
				const dose = Number(p.dose) || 0;
				return p.doseUnit === 'mg' ? sum + (dose * 1000) : sum + dose;
			}, 0);
		}
		return '';
	};

	const getEditingMgUnit = () => {
		if (!editingItem) return draft.mgUnit || 'mg';
		if (editingItem.mgUnit) return editingItem.mgUnit;
		if (Array.isArray(editingItem.peptides) && editingItem.peptides.length > 0) {
			// If all peptides use the same unit, return that unit, otherwise default to mg
			const units = [...new Set(editingItem.peptides.map(p => p.mgUnit || 'mg').filter(Boolean))];
			return units.length === 1 ? units[0] : 'mg';
		}
		return 'mg';
	};

	const getEditingDoseUnit = () => {
		if (!editingItem) return draft.doseUnit || 'mcg';
		if (editingItem.doseUnit) return editingItem.doseUnit;
		if (Array.isArray(editingItem.peptides) && editingItem.peptides.length > 0) {
			// If all peptides use the same unit, return that unit, otherwise default to mcg
			const units = [...new Set(editingItem.peptides.map(p => p.doseUnit || 'mcg'))];
			return units.length === 1 ? units[0] : 'mcg';
		}
		return 'mcg';
	};

	const handleCalculatorSave = useCallback(async (data) => {
        if (isFree) {
            setShowUpgradeModal(true);
            return;
        }

        const peptides = Array.isArray(data?.peptides) ? data.peptides : [];
        
        const peptideNames = peptides.length > 0
            ? peptides.map(p => p.name || 'Unnamed').join(' + ')
            : (data?.peptide || 'Unnamed');

        const totalMg = peptides.reduce((sum, p) => sum + (Number(p.mg) || 0), 0);
        const totalDose = peptides.reduce((sum, p) => {
            const dose = Number(p.dose) || 0;
            return p.doseUnit === 'mg' ? sum + (dose * 1000) : sum + dose;
        }, 0);

        // Use vendorId from data if available, otherwise try to find it from vendor name
        const vendorId = data.vendorId || (data.vendor ? (vendors.find(v => v.name === data.vendor)?.id || null) : null);

        // For single-peptide vials, preserve the original dose and doseUnit from the peptide
        const singlePeptideDose = peptides.length === 1 ? (Number(peptides[0]?.dose) || 0) : totalDose;
        const singlePeptideDoseUnit = peptides.length === 1 ? (peptides[0]?.doseUnit || 'mcg') : 'mcg';

        // Preserve costPerMg from data or derive from first peptide
        const costPerMg = data.costPerMg || peptides[0]?.costPerMg || null;

        const newItem = prepareItemForSave({
            id: generateId(),
            peptide: peptideNames,
            mg: totalMg,
            dose: singlePeptideDose,
            doseUnit: singlePeptideDoseUnit,
            vendor: data.vendor,
            vendorId,
            water: data.water,
            deliveryMethod: data.deliveryMethod,
            administrationRoute: data.administrationRoute || null,
            penColor: data.penColor,
            penType: data.penType || null,
            cost: data.cost,
            costPerMg: costPerMg,
            date: new Date().toISOString(),
            dateAcquired: data.dateAcquired || '',
            orderId: data.orderId || null,
            documentation: data.documentation || [],
            peptides,
            notes: ''
        }, { isNew: true });

        // Calculate updated items (remove draft if present, add new item with timestamp)
        const draftId = draftIdToRemove;
        
        setReconItems(prev => {
            const filtered = draftId 
                ? prev.filter(i => i.id !== draftId)
                : prev;
            return [newItem, ...filtered];
        });
        
        // Calculate updated items for cloud sync (don't update timestamps on unchanged items)
        const updatedItems = draftId 
            ? [newItem, ...reconItems.filter(i => i.id !== draftId)]
            : [newItem, ...reconItems];
        
        // Adjust stockpile - this will update quantities and remove items with 0
        adjustStockpileAfterRecon(peptides);

        // Notify supply auto-track listeners that a recon was saved
        window.dispatchEvent(new CustomEvent('tpp:recon-saved'));

        // Clear prefill, draft tracking, and autosave draft
        setPrefill(null);
        setDraftIdToRemove(null);
        setDraft({});
        clearSavedData();
        
        try {
            localStorage.removeItem('tpprover_recon_prefill');
        } catch {}

        setActiveTab('inuse');

        // CRITICAL: Force immediate cloud sync to ensure draft is removed and new item is saved
        if (firebaseUser && updatedItems) {
            try {
                const userId = firebaseUser.uid;
                
                const appData = {
                    protocols: protocols || [],
                    reconItems: updatedItems,
                    reconHistory: reconHistory || [],
                    supplements: supplements || [],
                    orders: orders || [],
                    metrics: metrics || [],
                    vendors: vendors || [],
                    calendarNotes: calendarNotes || {},
                    stockpile: stockpile || [],
                    scheduledBuys: scheduledBuys || []
                };
                
                // Use skipMerge: false for intelligent timestamp-based merging
                const syncResult = await saveAppData(userId, appData, { skipMerge: false });
                if (syncResult) {
                    if (draftId) {
                        console.log('✅ Draft removed and new recon item synced to cloud with force merge');
                    }
                    
                    // CRITICAL: Update localStorage timestamp to prevent listener from overwriting
                    try {
                        localStorage.setItem('tpprover_reconItems_lastUpdate', String(Date.now()));
                    } catch (e) {
                        console.warn('Failed to set recon lastUpdate timestamp:', e);
                    }
                } else {
                    console.error('❌ Failed to sync to cloud');
                }
            } catch (error) {
                console.error('❌ Error syncing to cloud:', error);
                // Don't throw - the auto-sync will handle it
            }
        }

        window.dispatchEvent(new CustomEvent('tpp:toast', {
            detail: { message: 'Calculation saved successfully!', type: 'success' }
        }));
    }, [isFree, setShowUpgradeModal, vendors, setReconItems, adjustStockpileAfterRecon, setPrefill, setActiveTab, draftIdToRemove, firebaseUser, reconItems, protocols, reconHistory, supplements, orders, metrics, calendarNotes, stockpile, scheduledBuys]);

    const handleCalculatorSaveDraft = useCallback(async (data) => {
        if (isFree) {
            setShowUpgradeModal(true);
            return;
        }

        const peptides = Array.isArray(data?.peptides) ? data.peptides : [];
        
        const peptideNames = peptides.length > 0
            ? peptides.map(p => p.name || 'Unnamed').join(' + ')
            : (data?.peptide || 'Draft');

        const totalMg = peptides.reduce((sum, p) => sum + (Number(p.mg) || 0), 0);
        const totalDose = peptides.reduce((sum, p) => {
            const dose = Number(p.dose) || 0;
            return p.doseUnit === 'mg' ? sum + (dose * 1000) : sum + dose;
        }, 0);

        // Use vendorId from data if available, otherwise try to find it from vendor name
        const vendorId = data.vendorId || (data.vendor ? (vendors.find(v => v.name === data.vendor)?.id || null) : null);

        // For single-peptide drafts, preserve the original dose and doseUnit from the peptide
        const draftSingleDose = peptides.length === 1 ? (Number(peptides[0]?.dose) || 0) : totalDose;
        const draftSingleDoseUnit = peptides.length === 1 ? (peptides[0]?.doseUnit || 'mcg') : 'mcg';
        const draftCostPerMg = data.costPerMg || peptides[0]?.costPerMg || null;

        const draftItem = prepareItemForSave({
            id: `draft_${generateId()}`,
            peptide: peptideNames,
            mg: totalMg,
            dose: draftSingleDose,
            doseUnit: draftSingleDoseUnit,
            vendor: data.vendor || '',
            vendorId,
            water: data.water || 0,
            deliveryMethod: data.deliveryMethod || 'pipette',
            administrationRoute: data.administrationRoute || null,
            penColor: data.penColor || '',
            penType: data.penType || null,
            cost: data.cost || '',
            costPerMg: draftCostPerMg,
            date: new Date().toISOString(),
            dateAcquired: data.dateAcquired || '',
            peptides, // Include full peptides array with stockpileId
            notes: data.notes || '',
            isDraft: true,
            draftSource: data.draftSource || 'calculator'
        }, { isNew: true });
        
        setReconItems(prev => {
            // Remove any existing drafts matching this form
            const existingDraftIndex = prev.findIndex(item => item.isDraft && item.peptide === draftItem.peptide);
            const filtered = existingDraftIndex >= 0 
                ? prev.filter((_, idx) => idx !== existingDraftIndex)
                : prev.filter(item => !item.isDraft || item.id !== draftItem.id);
            return [draftItem, ...filtered];
        });

        // Sync to cloud
        if (firebaseUser) {
            try {
                const userId = firebaseUser.uid;
                const updatedItems = [draftItemWithTimestamp, ...reconItems.filter(item => !item.isDraft || item.id !== draftItem.id)];
                
                const appData = {
                    protocols: protocols || [],
                    reconItems: updatedItems,
                    reconHistory: reconHistory || [],
                    supplements: supplements || [],
                    orders: orders || [],
                    metrics: metrics || [],
                    vendors: vendors || [],
                    calendarNotes: calendarNotes || {},
                    stockpile: stockpile || [],
                    scheduledBuys: scheduledBuys || []
                };
                
                // Use skipMerge: false for intelligent timestamp-based merging
                await saveAppData(userId, appData, { skipMerge: false });
            } catch (error) {
                console.warn('Failed to sync draft to cloud:', error);
            }
        }

        window.dispatchEvent(new CustomEvent('tpp:toast', {
            detail: { message: 'Draft saved successfully!', type: 'success' }
        }));
    }, [isReadOnly, setShowUpgradeModal, vendors, setReconItems, firebaseUser, reconItems, protocols, reconHistory, supplements, orders, metrics, calendarNotes, stockpile, scheduledBuys]);

	const filteredItems = reconItems.filter(i => {
		const vendorName = i.vendorId ? vendorMap[i.vendorId] || '' : (i.vendor || '');
		const matchesSearch = (i.peptide || '').toLowerCase().includes(searchQuery.toLowerCase()) || vendorName.toLowerCase().includes(searchQuery.toLowerCase());
		
		// Apply status filter
		if (inUseFilter === 'inuse') {
			return matchesSearch && !i.isDraft;
		} else if (inUseFilter === 'draft') {
			return matchesSearch && i.isDraft;
		}
		return matchesSearch; // 'all' shows everything
	})
	// Sort by creation date: newest first (descending)
	const sortedItems = [...filteredItems].sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))

	const filteredHistory = reconHistory.filter(i => {
        const matchesSearch = (i.peptide || '').toLowerCase().includes(searchQuery.toLowerCase()) || (i.vendor || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesPeptide = historyFilters.peptide ? (i.peptide || '').toLowerCase().includes(historyFilters.peptide.toLowerCase()) : true;
        const matchesVendor = historyFilters.vendor ? (i.vendor || '').toLowerCase().includes(historyFilters.vendor.toLowerCase()) : true;
        return matchesSearch && matchesPeptide && matchesVendor;
    })
	const sortedHistory = [...filteredHistory].sort((a, b) => new Date(b.usedDate || b.date) - new Date(a.usedDate || a.date));

    const handleMarkAsUsed = async (itemToMove) => {
        // CRITICAL: Record deletion with +6000ms offset to ensure it's newer than serverTimestamp() sentinel (+5000ms)
        // This prevents merge logic from treating the server version as a "recreate" after deletion
        const deletionTimestamp = Date.now() + 6000;
        recordDeletion('reconItems', itemToMove.id, itemToMove, deletionTimestamp);
        
        // Remove the item from reconItems (don't update timestamps on remaining items - they haven't changed!)
        const updatedItems = reconItems.filter(i => i.id !== itemToMove.id);
        
        console.log(`🧪 [RECON-SYNC] handleMarkAsUsed - preparing to save`, {
            itemToMoveId: itemToMove.id,
            itemToMoveName: itemToMove.peptide,
            beforeCount: reconItems.length,
            afterCount: updatedItems.length,
            updatedItemIds: updatedItems.map(i => i.id)
        });
        
        // Prepare the item being moved with fresh timestamp
        const historyItem = prepareItemForSave({ 
            ...itemToMove, 
            usedDate: new Date().toISOString() 
        });
        // Add to history without updating timestamps on existing history items (they haven't changed)
        const updatedHistory = [historyItem, ...reconHistory];
        
        setReconItems(updatedItems);
        setReconHistory(updatedHistory);
        
        // CRITICAL: Force immediate cloud sync with skipMerge: false for proper timestamp conflict resolution
        // This prevents server data from restoring the item back to reconItems
        if (firebaseUser) {
            try {
                const userId = firebaseUser.uid;
                const appData = {
                    protocols: protocols || [],
                    reconItems: updatedItems, // Use updated items with item removed
                    reconHistory: updatedHistory, // Use updated history with item added
                    supplements: supplements || [],
                    orders: orders || [],
                    metrics: metrics || [],
                    vendors: vendors || [],
                    calendarNotes: calendarNotes || {},
                    stockpile: stockpile || [],
                    scheduledBuys: scheduledBuys || []
                };
                
                console.log(`🧪 [RECON-SYNC] Saving to cloud`, {
                    reconItemsCount: updatedItems.length,
                    reconHistoryCount: updatedHistory.length
                });
                
                // Use skipMerge: false for intelligent timestamp-based merging
                // Deletion timestamp is offset by +6000ms to beat serverTimestamp() sentinel (+5000ms)
                const syncResult = await saveAppData(userId, appData, { skipMerge: false });
                if (syncResult) {
                    console.log('✅ Marked-as-used item synced to cloud with timestamp merge');
                    
                    // CRITICAL: Update localStorage timestamp to prevent listener from overwriting
                    try {
                        localStorage.setItem('tpprover_reconItems_lastUpdate', String(Date.now()));
                    } catch (e) {
                        console.warn('Failed to set recon lastUpdate timestamp:', e);
                    }
                } else {
                    console.error('❌ Failed to sync marked-as-used item to cloud');
                }
            } catch (error) {
                console.error('❌ Error syncing marked-as-used item to cloud:', error);
                // Don't throw - the auto-sync will handle it
            }
        }
    };

    const handleDeleteHistory = async (historyItem) => {
        if (!historyItem) return;

        try {
            // Record deletion with item snapshot for restore functionality
            recordDeletion('reconHistory', historyItem.id, historyItem);

            const updatedHistory = reconHistory.filter(h => h.id !== historyItem.id);
            setReconHistory(updatedHistory);
            setHistoryToDelete(null);
            if (viewItem?.id === historyItem.id) {
                setViewItem(null);
            }

            if (firebaseUser) {
                try {
                    const userId = firebaseUser.uid;
                    const appData = {
                        protocols: protocols || [],
                        reconItems: reconItems || [],
                        reconHistory: updatedHistory,
                        supplements: supplements || [],
                        orders: orders || [],
                        metrics: metrics || [],
                        vendors: vendors || [],
                        calendarNotes: calendarNotes || {},
                        stockpile: stockpile || [],
                        scheduledBuys: scheduledBuys || []
                    };

                    const syncResult = await saveAppData(userId, appData, { skipMerge: true });
                    if (syncResult) {
                    } else {
                        console.error('❌ Failed to sync recon history deletion to cloud');
                    }
                } catch (error) {
                    console.error('❌ Error syncing recon history deletion to cloud:', error);
                }
            }

            window.dispatchEvent(new CustomEvent('tpp:toast', {
                detail: { message: 'History entry removed.', type: 'success' }
            }));
        } catch (error) {
            console.error('❌ Error deleting recon history entry:', error);
            window.dispatchEvent(new CustomEvent('tpp:toast', {
                detail: { message: 'Failed to delete history entry.', type: 'error' }
            }));
            // Ensure modal closes even on error
            setHistoryToDelete(null);
        }
    };

    // Set topbar tabs via custom event
	useEffect(() => {
		const updateTabs = () => {
			const isMobile = window.matchMedia('(max-width: 767px)').matches;
	const tabs = isMobile
		? [
			{ value: 'calculator', label: 'Calculator' },
			{ value: 'inuse', label: 'In Use' },
			{ value: 'history', label: 'History' }
		]
		: [
			{ value: 'inuse', label: 'In Use' },
			{ value: 'history', label: 'History' }
		];
			window.dispatchEvent(new CustomEvent('tpp:set-topbar-tabs', { 
				detail: { 
					tabs, 
					activeTab, 
					onTabChange: (tab) => {
						if (tab === 'calculator') {
							setShowCalculatorModal(true);
						} else {
							setActiveTab(tab);
						}
					},
					onActionClick: () => setShowEditModal(true),
					actionDisabled: false
				} 
			}));
		};

		updateTabs();
		window.addEventListener('resize', updateTabs);
		
		// Listen for topbar search events for page-specific search
		const handleSearch = (e) => {
			setSearchQuery(e.detail.query);
		};
		window.addEventListener('tpp:recon-search', handleSearch);
		
		return () => {
			window.dispatchEvent(new CustomEvent('tpp:clear-topbar-tabs'));
			window.removeEventListener('resize', updateTabs);
			window.removeEventListener('tpp:recon-search', handleSearch);
		};
	}, [activeTab]);

	return (
		<>
			<div className="page-bg">
			<ReconTipsBanner theme={theme} />
			
			<div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-5">
				{/* Desktop/Tablet: Show calculator in sidebar (2/5 width for more room) */}
				<div className="order-1 lg:order-2 lg:col-span-2 hidden lg:block">
				<ReconCalculatorPanel 
                    theme={theme} 
                    prefill={prefill} 
                    compact={true}
                    isReadOnly={isReadOnly}
                    onUpgrade={() => setShowUpgradeModal(true)} 
                    onSave={isFree ? null : handleCalculatorSave}
                    onSaveDraft={isFree ? null : handleCalculatorSaveDraft}
                />
				</div>

			{/* Main content area (3/5 width) */}
			<div className="order-2 lg:order-1 lg:col-span-3">
				
				{activeTab === 'inuse' && (
						<div className="space-y-4">
							{/* Filter Dropdown */}
							{reconItems.length > 0 && (
								<div className="mb-6">
									<CustomDropdown
										value={inUseFilter}
										onChange={setInUseFilter}
										options={inUseFilterOptions}
										theme={theme}
										placeholder="Filter vials..."
										outlined={true}
										customShadow={true}
									/>
								</div>
							)}
							
							{/* Empty State - Show when no items */}
							{sortedItems.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-12 px-6 text-center">
									<div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
										<Beaker size={32} style={{ color: theme.primary }} />
									</div>
									<h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>No vials in use</h3>
									<p className="text-sm mb-6 max-w-sm" style={{ color: theme.textLight }}>
										Add reconstituted vials to track dosages and delivery.
									</p>
									<div className="flex flex-col sm:flex-row gap-3 items-center justify-center">
										<button
											type="button"
											onClick={() => setShowCalculatorModal(true)}
											className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all hover:opacity-90 hover:scale-105 touch-manipulation btn-primary-inset"
											style={{
												backgroundColor: theme.primary,
												color: theme.textOnPrimary || '#ffffff',
												WebkitTapHighlightColor: 'transparent'
											}}
										>
											<Calculator size={18} />
											Peptide Calculator
										</button>
										<button
											type="button"
											onClick={() => setShowEditModal(true)}
											className="flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-semibold transition-all hover:opacity-90 touch-manipulation"
											style={{
												backgroundColor: theme.secondary || theme.cardBackground,
												color: theme.text,
												border: `1px solid ${theme.border}`,
												WebkitTapHighlightColor: 'transparent'
											}}
										>
											Add Vial
											<ChevronDown size={16} />
										</button>
									</div>
								</div>
							) : (
						sortedItems.map(item => {
						const isBlend = Array.isArray(item.peptides) && item.peptides.length > 1;
                                const hasPeptidesArray = Array.isArray(item.peptides) && item.peptides.length > 0;
                                const totalMg = hasPeptidesArray ? item.peptides.reduce((sum, p) => sum + (Number(p.mg) || 0), 0) : (Number(item.mg) || 0);
                                
                                // For single-peptide vials stored as peptides array, use peptide's own dose/unit
                                // For true blends (multiple peptides), sum all doses in mcg
                                const totalDoseInMcg = isBlend 
                                    ? item.peptides.reduce((sum, p) => {
                                        const dose = Number(p.dose) || 0;
                                        return p.doseUnit === 'mg' ? sum + (dose * 1000) : sum + dose;
                                    }, 0)
                                    : 0;

                                // For blends: always mcg. For single-peptide (via peptides[0] or item.doseUnit): preserve original unit
                                const summaryDoseUnit = isBlend
                                    ? 'mcg'
                                    : (hasPeptidesArray ? (item.peptides[0]?.doseUnit || item.doseUnit || 'mcg') : (item.doseUnit || 'mcg'));

                                // For single-peptide: prefer peptides[0].dose, fall back to item.dose
                                const rawDoseInput = isBlend 
                                    ? totalDoseInMcg 
                                    : (hasPeptidesArray ? (item.peptides[0]?.dose ?? item.dose) : item.dose);
                                const hasDoseValue = rawDoseInput !== undefined && rawDoseInput !== null && rawDoseInput !== '' && Number(rawDoseInput) > 0;
                                const summaryDoseValueNumeric = hasDoseValue ? Number(rawDoseInput) : 0;

                                // Live titration dose: if this recon is linked to a protocol with titration,
                                // override the snapshotted dose with the current phase dose so Details
                                // always reflects the dose the user is actually on right now.
                                let liveDoseValue = summaryDoseValueNumeric;
                                let liveDoseUnit = summaryDoseUnit;
                                if (!item.isDraft && !isBlend) {
                                    // Use getProtocolForReconItem which handles all lookup paths
                                    // (protocolId direct, linkedItems scan, history scan)
                                    const linkedRef = getProtocolForReconItem(item);
                                    const linkedProtocol = linkedRef ? protocols.find(p => p.id === linkedRef.id) : null;
                                    if (linkedProtocol) {
                                        // Try to match on peptide name; fall back to first protocol peptide
                                        const reconPeptideNames = hasPeptidesArray
                                            ? item.peptides.map(rp => (rp.name || '').toLowerCase())
                                            : [(item.peptide || item.name || '').toLowerCase()];
                                        const matchingProtocolPeptide = linkedProtocol.peptides?.find(pp =>
                                            reconPeptideNames.includes((pp.name || '').toLowerCase())
                                        ) || linkedProtocol.peptides?.[0];
                                        if (matchingProtocolPeptide && matchingProtocolPeptide.dosageScheduleType === 'titration') {
                                            const livePhase = getCurrentTitrationPhase(linkedProtocol, matchingProtocolPeptide);
                                            if (livePhase) {
                                                liveDoseValue = Number(livePhase.dose) || summaryDoseValueNumeric;
                                                liveDoseUnit = livePhase.unit || summaryDoseUnit;
                                            }
                                        }
                                    }
                                }
                                const displayDoseValue = liveDoseValue > 0 ? liveDoseValue : null;

								const calc = calculateRecon({ ...item, mg: totalMg, dose: liveDoseValue, doseUnit: liveDoseUnit });
								
							// Calculate cost per dose: use costPerMg if available, otherwise divide cost by doses per vial
							let costPerDose = null;
							if (item.costPerMg && liveDoseValue > 0) {
								// Convert live dose to mg for calculation
								let doseInMg = 0;
								if (liveDoseUnit === 'mg') {
									doseInMg = liveDoseValue;
								} else if (liveDoseUnit === 'mcg') {
									doseInMg = liveDoseValue / 1000;
								} else if (liveDoseUnit === 'sprays') {
									doseInMg = (liveDoseValue * 100) / 1000; // 100 mcg per spray
								} else if (liveDoseUnit === 'mL') {
									const concentration = calc.concentration || 0; // mcg per mL
									const doseMcg = liveDoseValue * concentration;
									doseInMg = doseMcg / 1000;
								}
									
									if (doseInMg > 0) {
										const costPerMgNum = Number(item.costPerMg);
										if (!isNaN(costPerMgNum) && costPerMgNum > 0) {
											costPerDose = formatCurrency(costPerMgNum * doseInMg);
										}
									}
								}
								
								// Fall back to dividing cost by doses per vial if costPerMg not available
								if (!costPerDose && item.cost && calc.dosesPerVial > 0) {
									costPerDose = formatCurrency(item.cost / calc.dosesPerVial);
								}
							const cardAccent = theme.primary;
							const hasCalcData = calc.dosesPerVial > 0 || calc.unitsPerDose > 0 || displayDoseValue !== null || totalMg > 0;
							return (
								<div 
									key={item.id} 
									className={`content-section rounded-2xl shadow-md p-3 hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col h-full mb-3`} 
									style={{ 
										fontFamily: 'Poppins, sans-serif',
										border: `1px solid ${hasCalcData ? cardAccent + '30' : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
										background: hasCalcData
											? theme.isDark
												? `linear-gradient(170deg, ${cardAccent}14 0%, transparent 55%)`
												: `linear-gradient(170deg, ${cardAccent}0b 0%, transparent 55%)`
											: undefined,
									}}
								onClick={item.isDraft ? () => {
									setDraftIdToRemove(item.id);
									if (item.draftSource === 'modal') {
										// Reopen in New Reconstitution modal
										setEditingItem({ ...item, dateAcquired: item.dateAcquired || item.date || '' });
										setShowEditModal(true);
									} else {
										// Reopen in Calculator (default for calculator-originated drafts)
										const draftPeptides = Array.isArray(item.peptides) && item.peptides.length > 0
											? item.peptides.map(p => ({
												id: p.id || generateId(),
												name: p.name || '',
												mg: p.mg || '',
												dose: p.dose || '',
												doseUnit: p.doseUnit || 'mcg',
												vendor: p.vendor || item.vendor || '',
												stockpileId: p.stockpileId || null,
												quantityUsed: p.quantityUsed || 1
											}))
											: [{ 
												id: generateId(),
												name: item.peptide || '', 
												mg: item.mg || '', 
												dose: item.dose || '', 
												doseUnit: item.doseUnit || 'mcg',
												vendor: item.vendor || '',
												stockpileId: null,
												quantityUsed: 1
											}];
										setPrefill({
											peptides: draftPeptides,
											vendor: item.vendor || '',
											water: item.water || 2,
											deliveryMethod: item.deliveryMethod || 'pipette',
											administrationRoute: item.administrationRoute || 'subq',
											penType: item.penType || '',
											penColor: item.penColor || '',
											cost: item.cost || '',
											dateAcquired: item.dateAcquired || ''
										});
										setShowCalculatorModal(true);
									}
								} : () => {
										setEditingItem({ ...item, dateAcquired: item.dateAcquired || item.date || '' });
										setShowEditModal(true);
									}}
									>
                                        {/* Header */}
                                        {(() => {
                                            const linkedProtocol = !item.isDraft ? getProtocolForReconItem(item) : null;
                                            const displayName = (item.name || item.peptide || '').replace(/\s*\((separate|blended)\)\s*$/i, '').trim();
                                            return (
                                            <div className="flex items-start justify-between mb-3 gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <h3 className="font-semibold text-base mb-1 truncate" style={{ color: theme.text }}>
                                                        {displayName}
                                                    </h3>
                                                    <div className="flex flex-wrap gap-1.5 mb-1">
                                                        {item.deliveryMethod === 'pen' && item.penColor ? (
                                                            <div 
                                                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold shadow-sm" 
                                                                style={{ 
                                                                    background: getChromeGradient(PEN_COLORS[item.penColor] || item.penColor), 
                                                                    color: ['Gold', 'Silver', 'Light Pink', 'Light Blue', 'Lime Green', 'Yellow', 'White'].includes(item.penColor) ? theme.text : theme.textOnPrimary 
                                                                }}
                                                            >
                                                                <PenTool size={9} strokeWidth={2.5} />
                                                                <span>{item.penColor.startsWith('#') ? 'Custom' : item.penColor} Pen</span>
                                                            </div>
                                                        ) : item.deliveryMethod === 'nasal' ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium" style={{ backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', color: theme.text }}>
                                                                <Droplet className="w-2.5 h-2.5 opacity-70" />
                                                                Nasal
                                                            </span>
                                                        ) : item.deliveryMethod === 'topical' ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium" style={{ backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', color: theme.text }}>
                                                                <Hand className="w-2.5 h-2.5 opacity-70" />
                                                                Topical
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium" style={{ backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', color: theme.text }}>
                                                                <Pipette className="w-2.5 h-2.5 opacity-70" />
                                                                Syringe
                                                            </span>
                                                        )}
                                                        {item.administrationRoute && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium" style={{ backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)', color: theme.text }}>
                                                                {item.administrationRoute.toUpperCase()}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {item.leftover && (
                                                        <div
                                                            className="mt-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide flex items-center gap-1.5"
                                                            style={{
                                                                backgroundColor: theme.isDark ? '#78350f' : '#fef3c7',
                                                                color: theme.isDark ? '#fcd34d' : '#92400e',
                                                                border: `1px solid ${theme.isDark ? '#92400e' : '#fcd34d'}`
                                                            }}
                                                        >
                                                            Leftover{item.leftoverFromProtocol ? ` · ${item.leftoverFromProtocol}` : ''}
                                                        </div>
                                                    )}
                                                </div>

                                                <div 
                                                    className="flex flex-col items-end gap-1.5 flex-shrink-0 px-2.5 py-2 rounded-xl"
                                                    style={{ 
                                                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                                                        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'}`,
                                                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)'
                                                    }}
                                                >
                                                    {item.isDraft && (
                                                        <div 
                                                            className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest shadow-sm"
                                                            style={{ backgroundColor: theme.primary + '20', color: theme.primary }}
                                                        >
                                                            Draft
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-[9px] font-medium opacity-80 uppercase tracking-wider" style={{ color: theme.textLight }}>
                                                            {item.isDraft ? 'Started' : 'Reconstituted'}
                                                        </span>
                                                        <Calendar size={11} style={{ color: theme.textLight, opacity: 0.7 }} />
                                                        <span className="text-[10px] font-semibold opacity-75 uppercase tracking-wide" style={{ color: theme.text }}>
                                                            {item.date || item.createdAt ? formatMMDDYYYY(item.date || item.createdAt) : 'No Date'}
                                                        </span>
                                                    </div>
                                                    {linkedProtocol && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                navigate('/app/protocols', { state: { highlightProtocolId: linkedProtocol.id } });
                                                            }}
                                                            className="text-[9px] font-medium opacity-80 hover:opacity-100 transition-opacity uppercase tracking-wider text-right"
                                                            style={{ color: theme.textLight }}
                                                        >
                                                            Protocol: <strong>{linkedProtocol.name}</strong>
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            );
                                        })()}

                                        {/* Content Area */}
                                        <div className="flex-1 space-y-3">
                                            {/* Peptides Section (for blends) */}
                                            {Array.isArray(item.peptides) && item.peptides.length > 0 && (
                                                <div className="relative pl-3">
                                                    <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ backgroundColor: '#8ca68c', opacity: 0.4 }} />
                                                    <div className="text-[10px] font-medium uppercase tracking-widest mb-2 opacity-60 flex items-center" style={{ color: theme.text }}>
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <Beaker size={10} style={{ color: '#8ca68c' }} />
                                                            Peptides
                                                        </div>
                                                        <div className="h-px flex-1 ml-3 opacity-30" style={{ backgroundColor: '#8ca68c' }} />
                                                    </div>
                                                    <div className="space-y-2">
                                                        {item.peptides.map((p, idx) => {
                                                            const peptideVendor = p.vendorId ? (vendorMap && vendorMap[p.vendorId]) : p.vendor;
                                                            const vialMg = p.mg || item.mg;
                                                            return (
                                                            <div key={idx} className="flex items-center gap-1.5 flex-wrap min-w-0">
                                                                <span className="font-semibold text-[12px] leading-snug" style={{ color: theme.text }}>{p.name}</span>
                                                                {(peptideVendor || vialMg) && (
                                                                    <span className="text-[12px] leading-snug opacity-60" style={{ color: theme.textLight }}>
                                                                        {peptideVendor && <span>from {peptideVendor}</span>}
                                                                        {peptideVendor && vialMg && <span> · </span>}
                                                                        {vialMg && <span>{vialMg} {p.mgUnit || 'mg'} vial</span>}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Gamified Details Section */}
                                            {(calc.dosesPerVial > 0 || calc.unitsPerDose > 0 || costPerDose || displayDoseValue !== null || item.water || totalMg > 0) ? (() => {
                                                const SIZE = 62, STROKE = 4.5;
                                                const Rv = (SIZE - STROKE) / 2;
                                                const CIRC = 2 * Math.PI * Rv;
                                                const MAX_DOSES = 200;
                                                const ringPct = calc.dosesPerVial > 0 ? Math.min(1, calc.dosesPerVial / MAX_DOSES) : 0;
                                                const dashOffset = CIRC * (1 - ringPct);
                                                const innerBg = theme.isDark ? '#1a2826' : '#ffffff';
                                                const costNum = costPerDose ? parseFloat(String(costPerDose).replace(/[^0-9.]/g, '')) : null;
                                                const tier = (costNum != null && !isNaN(costNum))
                                                    ? costNum < 0.50 ? { label: 'Excellent', color: '#22c55e', symbol: '💎' }
                                                    : costNum < 1.50 ? { label: 'Great',     color: '#84cc16', symbol: '⭐' }
                                                    : costNum < 3.00 ? { label: 'Good',      color: '#eab308', symbol: '✓'  }
                                                    : costNum < 5.00 ? { label: 'Fair',      color: '#f97316', symbol: '~'  }
                                                    : { label: 'Std', color: '#9ca3af', symbol: '' }
                                                    : null;
                                                const concMgMl = (calc.concentration || 0) / 1000;
                                                const CONC_SEGS = [
                                                    { label: 'Dilute', maxMgMl: 0.5 },
                                                    { label: 'Std',    maxMgMl: 2   },
                                                    { label: 'Conc',   maxMgMl: 5   },
                                                    { label: 'Ultra',  maxMgMl: 999 },
                                                ];
                                                const concIdx = concMgMl > 0
                                                    ? (() => { const i = CONC_SEGS.findIndex(s => concMgMl <= s.maxMgMl); return i >= 0 ? i : CONC_SEGS.length - 1; })()
                                                    : -1;
                                                return (
                                                    <div className="mt-1 rounded-xl p-2.5 relative overflow-hidden"
                                                        style={{
                                                            background: theme.isDark ? `${cardAccent}10` : `${cardAccent}08`,
                                                            border: `1px solid ${cardAccent}20`,
                                                        }}
                                                    >
                                                        {/* Faint bg orb */}
                                                        <div className="absolute -right-4 -bottom-4 w-20 h-20 rounded-full pointer-events-none opacity-5"
                                                            style={{ backgroundColor: cardAccent }} />

                                                        {/* Ring + stats row */}
                                                        <div className="flex items-center gap-3 relative z-10">
                                                            {/* Doses/Vial ring — always shown, empty state when no water set */}
                                                            <div className="flex flex-col items-center flex-shrink-0 gap-0.5">
                                                                <div className="relative" style={{ width: SIZE, height: SIZE }}>
                                                                    <svg width={SIZE} height={SIZE} className="absolute inset-0" style={{ transform: 'rotate(-90deg)' }}>
                                                                        <circle cx={SIZE/2} cy={SIZE/2} r={Rv} fill="none" stroke={cardAccent + '20'} strokeWidth={STROKE} />
                                                                        {calc.dosesPerVial > 0 && (
                                                                            <circle cx={SIZE/2} cy={SIZE/2} r={Rv} fill="none" stroke={cardAccent}
                                                                                strokeWidth={STROKE} strokeLinecap="round"
                                                                                strokeDasharray={CIRC} strokeDashoffset={dashOffset}
                                                                                style={{ transition: 'stroke-dashoffset 0.6s ease' }}
                                                                            />
                                                                        )}
                                                                    </svg>
                                                                    <div className="absolute rounded-full" style={{ inset: STROKE + 2, backgroundColor: innerBg, opacity: 0.85 }} />
                                                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                                        <span className="text-[15px] font-black leading-none tabular-nums" style={{ color: calc.dosesPerVial > 0 ? cardAccent : cardAccent, opacity: calc.dosesPerVial > 0 ? 1 : 0.3 }}>
                                                                            {calc.dosesPerVial > 0 ? calc.dosesPerVial : '–'}
                                                                        </span>
                                                                        <span className="text-[7px] font-bold uppercase tracking-wider leading-none mt-0.5" style={{ color: cardAccent, opacity: 0.5 }}>
                                                                            doses
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                                <span className="text-[7px] uppercase tracking-wider opacity-40 text-center" style={{ color: theme.text }}>
                                                                    per vial
                                                                </span>
                                                            </div>

                                                            {/* Stats column */}
                                                            <div className="flex-1 flex flex-col gap-1.5">
                                                                {/* Units/Dose */}
                                                                {calc.unitsPerDose > 0 && (
                                                                    <div className="flex items-center justify-between">
                                                                        <span className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-50" style={{ color: theme.text }}>
                                                                            Units / Dose
                                                                        </span>
                                                                        <span className="text-[14px] font-black tabular-nums" style={{ color: cardAccent }}>
                                                                            {calc.unitsPerDose.toFixed(0)}{' '}
                                                                            <span className="text-[10px] font-bold uppercase tracking-wide opacity-70">units</span>
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {calc.unitsPerDose > 0 && costPerDose && (
                                                                    <div className="h-px opacity-15" style={{ backgroundColor: cardAccent }} />
                                                                )}
                                                                {/* Cost/Dose + badge */}
                                                                {costPerDose && (
                                                                    <div className="flex items-center justify-between gap-1">
                                                                        <div className="flex items-center gap-1 flex-wrap">
                                                                            <span className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-50" style={{ color: theme.text }}>
                                                                                Cost / Dose
                                                                            </span>
                                                                            {tier && (
                                                                                <span className="text-[7px] font-bold uppercase px-1 py-0.5 rounded-md leading-none"
                                                                                    style={{ backgroundColor: tier.color + '22', color: tier.color, border: `1px solid ${tier.color}35` }}>
                                                                                    {tier.symbol && `${tier.symbol} `}{tier.label}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-[14px] font-black tabular-nums" style={{ color: cardAccent }}>
                                                                            {costPerDose}
                                                                        </span>
                                                                    </div>
                                                                )}
                                                                {/* Dose + water info chips */}
                                                                <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                                                    {item.water && (
                                                                        <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md"
                                                                            style={{ backgroundColor: cardAccent + '12', color: cardAccent, opacity: 0.75 }}>
                                                                            <Droplet size={8} />{item.water} mL
                                                                        </span>
                                                                    )}
                                                                    {displayDoseValue !== null && (
                                                                        <span className="inline-flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-md"
                                                                            style={{ backgroundColor: cardAccent + '12', color: cardAccent, opacity: 0.75 }}>
                                                                            <Pipette size={8} />{displayDoseValue} {liveDoseUnit}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Concentration segmented track */}
                                                        {concMgMl > 0 && concIdx >= 0 && (
                                                            <div className="mt-2.5 relative z-10">
                                                                <div className="flex items-center gap-[2px] h-[4px] w-full">
                                                                    {CONC_SEGS.map((seg, idx) => {
                                                                        const isPast = idx < concIdx;
                                                                        const isCurr = idx === concIdx;
                                                                        return (
                                                                            <div key={seg.label}
                                                                                className="h-full flex-1 rounded-full overflow-hidden relative"
                                                                                style={{ backgroundColor: isPast ? cardAccent : isCurr ? cardAccent + '25' : cardAccent + '12', opacity: isPast ? 0.55 : 1 }}
                                                                            >
                                                                                {isCurr && (
                                                                                    <div className="absolute inset-y-0 left-0 rounded-full"
                                                                                        style={{ width: '100%', backgroundColor: cardAccent, boxShadow: `0 0 4px ${cardAccent}80` }} />
                                                                                )}
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                                <div className="flex items-center mt-0.5">
                                                                    {CONC_SEGS.map((seg, idx) => (
                                                                        <span key={seg.label} className="flex-1 text-center text-[7px] font-medium"
                                                                            style={{ color: idx === concIdx ? cardAccent : theme.textLight, opacity: idx === concIdx ? 1 : 0.35 }}>
                                                                            {seg.label}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })() : (
                                                /* Fallback plain details for draft/incomplete items */
                                                <div className="relative pl-3">
                                                    <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ backgroundColor: '#8ca68c', opacity: 0.4 }} />
                                                    <div className="text-[10px] font-medium uppercase tracking-widest mb-2 opacity-60 flex items-center" style={{ color: theme.text }}>
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <Calculator size={10} style={{ color: '#8ca68c' }} />
                                                            Details
                                                        </div>
                                                        <div className="h-px flex-1 ml-3 opacity-30" style={{ backgroundColor: '#8ca68c' }} />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                                        {item.water && (
                                                            <div className="flex items-center gap-1.5 text-[11px]">
                                                                <Droplet size={10} style={{ color: '#8ca68c' }} />
                                                                <span style={{ color: theme.text }}>{item.water} mL</span>
                                                                <span className="opacity-50" style={{ color: theme.textLight }}>water</span>
                                                            </div>
                                                        )}
                                                        {displayDoseValue !== null && (
                                                            <div className="flex items-center gap-1.5 text-[11px]">
                                                                <Pipette size={10} style={{ color: '#8ca68c' }} />
                                                                <span style={{ color: theme.text }}>{displayDoseValue} {liveDoseUnit}</span>
                                                                <span className="opacity-50" style={{ color: theme.textLight }}>dose</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Notes Section */}
                                            {item.notes && (
                                                <div className="relative pl-3">
                                                    <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ backgroundColor: '#8ca68c', opacity: 0.4 }} />
                                                    <div className="text-[10px] font-medium uppercase tracking-widest mb-1.5 opacity-60 flex items-center" style={{ color: theme.text }}>
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <Info size={10} style={{ color: '#8ca68c' }} />
                                                            Notes
                                                        </div>
                                                        <div className="h-px flex-1 ml-3 opacity-30" style={{ backgroundColor: '#8ca68c' }} />
                                                    </div>
                                                    <p className="text-[11px] leading-relaxed italic opacity-70" style={{ color: theme.text }}>{item.notes}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="mt-3 pt-3 border-t flex items-center justify-center relative" style={{ borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                                            <span className="text-[9px] opacity-50 uppercase tracking-widest" style={{ color: theme.text }}>
                                                {item.isDraft ? 'Tap to resume' : 'Tap to edit'}
                                            </span>

                                            <div className="absolute right-0 flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                                {item.isDraft ? (
                                                    <button 
                                                        className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                                        style={{ color: theme.primary }}
                                                        onClick={() => {
                                                            setDraftIdToRemove(item.id);
                                                            if (item.draftSource === 'modal') {
                                                                setEditingItem({ ...item, dateAcquired: item.dateAcquired || item.date || '' });
                                                                setShowEditModal(true);
                                                            } else {
                                                                setPrefill({
                                                                    peptides: Array.isArray(item.peptides) && item.peptides.length > 0 ? item.peptides : [{ id: generateId(), name: item.peptide || '', mg: item.mg || '', dose: item.dose || '', doseUnit: item.doseUnit || 'mcg', vendor: item.vendor || '', stockpileId: null, quantityUsed: 1 }],
                                                                    vendor: item.vendor || '',
                                                                    water: item.water || 2,
                                                                    deliveryMethod: item.deliveryMethod || 'pipette',
                                                                    administrationRoute: item.administrationRoute || 'subq',
                                                                    penType: item.penType || '',
                                                                    penColor: item.penColor || '',
                                                                    cost: item.cost || '',
                                                                    dateAcquired: item.dateAcquired || ''
                                                                });
                                                                setShowCalculatorModal(true);
                                                            }
                                                        }}
                                                    >
                                                        <Calculator size={13} />
                                                    </button>
                                                ) : (
                                                    <button 
                                                        className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors" 
                                                        style={{ color: '#dc2626' }} 
                                                        onClick={() => handleMarkAsUsed(item)}
                                                        title="Finish Vial"
                                                    >
                                                        <CheckCircle size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
									</div>
								)
							})
							)}
						</div>
					)}

				{activeTab === 'history' && (
					<div className="space-y-3">
						{sortedHistory.length === 0 ? (
								<div className="flex flex-col items-center justify-center py-12 px-6 text-center">
									<div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
										<History size={32} style={{ color: theme.primary }} />
									</div>
									<h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>No history yet</h3>
									<p className="text-sm max-w-sm" style={{ color: theme.textLight }}>
										Finished vials will appear here when you mark them as used.
									</p>
								</div>
							) : (
								<div className="space-y-3">
									{showHistoryFilters && (
										<div className="content-section p-3 rounded-lg border" style={{ borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
											<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
												<TextInput label="Peptide" placeholder="Filter by peptide" value={historyFilters.peptide} onChange={v => setHistoryFilters(f => ({ ...f, peptide: v }))} theme={theme} />
												<TextInput label="Vendor" placeholder="Filter by vendor" value={historyFilters.vendor} onChange={v => setHistoryFilters(f => ({ ...f, vendor: v }))} theme={theme} />
											</div>
										</div>
									)}

									{sortedHistory.map(item => {
                                        const usedDate = item.usedDate || item.date;
                                        const vendorName = item.vendorId ? vendorMap[item.vendorId] : item.vendor;
                                        return (
                                            <div
                                                key={`h-${item.id}`}
                                                className={`content-section rounded-2xl shadow-md p-3 hover:shadow-xl transition-all duration-200 cursor-pointer flex flex-col h-full mb-3`} 
                                                style={{ 
                                                    fontFamily: 'Poppins, sans-serif',
                                                    border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`
                                                }}
                                                onClick={() => setViewItem(item)}
                                            >
                                                {/* Header */}
                                                <div className="flex items-start justify-between mb-3 gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold text-base mb-2 truncate" style={{ color: theme.text }}>
                                                            {item.peptide || 'Unnamed research vial'}
                                                        </h3>
                                                        <div className="flex items-center gap-2 opacity-85">
                                                            <Package size={12} style={{ color: '#8ca68c' }} />
                                                            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: theme.text }}>
                                                                {vendorName || 'Unknown Source'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                                        <div 
                                                            className="px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest shadow-sm"
                                                            style={{ backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)', color: theme.textLight }}
                                                        >
                                                            Archived
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="text-[9px] font-medium opacity-60 uppercase tracking-wider" style={{ color: theme.textLight }}>
                                                                Finished
                                                            </span>
                                                            <Calendar size={11} style={{ color: theme.textLight, opacity: 0.7 }} />
                                                            <span className="text-[10px] font-semibold opacity-75 uppercase tracking-wide" style={{ color: theme.text }}>
                                                                {usedDate ? formatMMDDYYYY(usedDate) : 'Date unknown'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Content Area */}
                                                <div className="flex-1 space-y-3">
                                                    {/* Recon Details Section */}
                                                    <div className="relative pl-3">
                                                        <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ backgroundColor: '#8ca68c', opacity: 0.4 }} />
                                                        <div className="text-[10px] font-medium uppercase tracking-widest mb-2 opacity-60 flex items-center" style={{ color: theme.text }}>
                                                            <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                <FileText size={10} style={{ color: '#8ca68c' }} />
                                                                Historical Data
                                                            </div>
                                                            <div className="h-px flex-1 ml-3 opacity-30" style={{ backgroundColor: '#8ca68c' }} />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-y-1 gap-x-4">
                                                            <DataPoint icon={Beaker} label="Amount" value={`${item.mg} mg`} theme={theme} />
                                                            {item.water && <DataPoint icon={Droplet} label="Water" value={`${item.water} mL`} theme={theme} />}
                                                            {item.dose && <DataPoint icon={Pipette} label="Dose" value={`${item.dose} ${item.doseUnit || 'mcg'}`} theme={theme} />}
                                                            <DataPoint icon={Calendar} label="Finished" value={usedDate ? formatMMDDYYYY(usedDate) : 'N/A'} theme={theme} />
                                                        </div>
                                                    </div>

                                                    {/* Notes Section */}
                                                    {item.notes && (
                                                        <div className="relative pl-3">
                                                            <div className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ backgroundColor: '#8ca68c', opacity: 0.4 }} />
                                                            <div className="text-[10px] font-medium uppercase tracking-widest mb-1.5 opacity-60 flex items-center" style={{ color: theme.text }}>
                                                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                                                    <Info size={10} style={{ color: '#8ca68c' }} />
                                                                    Notes
                                                                </div>
                                                                <div className="h-px flex-1 ml-3 opacity-30" style={{ backgroundColor: '#8ca68c' }} />
                                                            </div>
                                                            <p className="text-[11px] leading-relaxed italic opacity-70 line-clamp-2" style={{ color: theme.text }}>{item.notes}</p>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Footer */}
                                                <div className="mt-3 pt-3 border-t flex items-center justify-center relative" style={{ borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }}>
                                                    <button 
                                                        className="flex items-center gap-1 opacity-50 hover:opacity-100 transition-opacity cursor-pointer"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setViewItem(item);
                                                        }}
                                                    >
                                                        <span className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: theme.text }}>
                                                            Details
                                                        </span>
                                                        <ChevronDown size={12} style={{ color: theme.primary }} strokeWidth={3} />
                                                    </button>

                                                    <div className="absolute right-0 flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                                            style={{ color: theme.primary }}
                                                            onClick={() => setViewItem(item)}
                                                            title="View details"
                                                        >
                                                            <Eye size={13} />
                                                        </button>
                                                        <button
                                                            className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                                                            style={{ color: '#dc2626' }}
                                                            onClick={() => setHistoryToDelete(item)}
                                                            title="Delete entry"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
								</div>
							)}
						</div>
					)}
				</div>
			</div>
			</div>

            <BottomSheet open={showEditModal} onClose={() => { setShowEditModal(null); setEditingItem(null); setDraft({}); clearSavedData(); setConfirmDelete(false); }} title={editingItem?.id && !editingItem.id.startsWith('draft_') ? `Edit ${(editingItem.name || editingItem.peptide || '').replace(/\s*\((separate|blended)\)\s*$/i, '').trim() || ''} Vial`.trim() : 'New Reconstitution'} theme={theme} maxHeight="90vh" titleExtra={<AutoSaveIndicator isSaving={isSaving} lastSaved={lastSaved} theme={theme} compact iconOnly={true} />} footer={
			<div className="w-full flex items-center justify-between gap-3">
			{editingItem?.id && !editingItem.id.startsWith('draft_') ? (
				<div className="flex items-center">
					<style>{`
						@keyframes tapConfirmPop {
							0%, 100% { transform: scale(1); }
							50% { transform: scale(1.08); }
						}
						.tap-confirm-pop {
							animation: tapConfirmPop 0.45s ease-out 2;
						}
					`}</style>
					<button
						onClick={() => {
							if (confirmDelete) {
								setConfirmDelete(false);
								handleDelete(editingItem.id);
							} else {
								setConfirmDelete(true);
							}
						}}
						className={`py-2 text-sm font-medium transition-all ${confirmDelete ? 'tap-confirm-pop' : ''}`}
						style={{ color: confirmDelete ? '#8B5335' : '#C67A5C' }}
					>
						{confirmDelete ? 'Tap Again to Confirm!' : 'Delete'}
					</button>
				</div>
				) : (
					<button
						onClick={() => { setShowEditModal(null); setEditingItem(null); setDraft({}); clearSavedData(); }}
						className="text-sm font-medium transition-opacity opacity-60 hover:opacity-100"
						style={{ color: theme.textLight }}
					>
						Cancel
					</button>
				)}
				<div className="flex items-center gap-3 ml-auto">
				{!(editingItem?.id && !editingItem.id.startsWith('draft_')) && (
					<button
						onClick={() => {
							handleCalculatorSaveDraft({ ...editingItem, draftSource: 'modal' });
							setShowEditModal(null);
							setEditingItem(null);
							setDraft({});
							clearSavedData();
						}}
						className="text-sm font-medium transition-opacity opacity-60 hover:opacity-100"
						style={{ color: theme.primary }}
					>
						Save as Draft
					</button>
				)}
				{editingItem?.id && !editingItem.id.startsWith('draft_') && (
					<button
						onClick={() => {
							handleMarkAsUsed(editingItem);
							setShowEditModal(null);
							setEditingItem(null);
						}}
						className="text-sm font-medium transition-opacity opacity-60 hover:opacity-100"
						style={{ color: theme.textLight }}
					>
						Vial Finished
					</button>
				)}
				<button
					onClick={() => handleSave(editingItem)}
						className="px-6 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95"
						style={{
							background: getPrimaryActionGradient(false),
							color: theme?.textOnPrimary || '#ffffff',
							border: 'none',
							boxShadow: primaryActionDefaultShadow
						}}
						onMouseEnter={(e) => {
							e.currentTarget.style.transform = 'translateY(-1px)';
							e.currentTarget.style.boxShadow = primaryActionHoverShadow;
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.transform = 'translateY(0)';
							e.currentTarget.style.boxShadow = primaryActionDefaultShadow;
							e.currentTarget.style.background = getPrimaryActionGradient(false);
						}}
					>
						Save
					</button>
				</div>
			</div>
			}>
                <div className="space-y-4 pb-6">
                    {/* VIAL DETAILS Section Header */}
                    <div className="flex items-center gap-4 mb-2">
                        <TestTube size={32} style={{ color: theme.primary }} />
                        <div className="flex flex-col gap-0.5">
                            <h4 className="text-lg font-semibold tracking-wide" style={{ color: theme.text }}>
                                Vial Details
                            </h4>
                            <div className="flex items-center gap-2 ml-1">
                                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                                    Dosage Setup
                                </span>
                            </div>
                        </div>
                    </div>
                    <div className="h-px w-full mb-4 opacity-10" style={{ backgroundColor: theme.isDark ? '#4B5563' : '#9CA3AF' }}></div>

                    <TextInput 
                        label="Peptide Name" 
                        value={getEditingPeptideName()} 
                        onChange={v => { updateEditingItem({ peptide: v }); updateFormData({ peptide: v }); }} 
                        theme={theme}
                        outlined={true}
                        customTextColor={theme.isDark ? null : "#181A18"}
                        customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    />
                    <VendorSuggestInput 
                        label="Vendor" 
                        value={editingItem?.vendorId ? vendorMap[editingItem.vendorId] : (editingItem?.vendor || draft.vendor || '')} 
                        onChange={v => {
                            const selectedVendor = vendors.find(vendor => vendor.name === v);
                            updateEditingItem({ vendor: v, vendorId: selectedVendor ? selectedVendor.id : null });
                            updateFormData({ vendor: v, vendorId: selectedVendor ? selectedVendor.id : null });
                        }} 
                        theme={theme} 
                        outlined={true}
                        customTextColor={theme.isDark ? null : "#181A18"}
                        customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    />
                    {/* mg and water in one row */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* MG with Unit Dropdown */}
                        <div className="relative">
                            <div 
                                className="flex items-stretch rounded-lg"
                                style={{ 
                                    border: `1px solid ${isAmountFocused ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
                                    boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                                    backgroundColor: theme.isDark ? theme.background : (theme.inputBackground || theme.cardBackground)
                                }}
                            >
                                <input
                                    type="text"
                                    id="recon-amount-input"
                                    value={getEditingMg() || ''} 
                                    onChange={e => { updateEditingItem({ mg: e.target.value }); updateFormData({ mg: e.target.value }); }} 
                                    onFocus={() => setIsAmountFocused(true)}
                                    onBlur={(e) => {
                                        setTimeout(() => {
                                            const relatedTarget = e.relatedTarget || document.activeElement
                                            const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]')
                                            if (!isClickingDropdown && !isMgUnitDropdownOpen) {
                                                setIsAmountFocused(false)
                                            }
                                        }, 150)
                                    }}
                                    placeholder=" "
                                    className="flex-1 py-3 outline-none min-w-0 rounded-l-lg"
                                    style={{
                                        backgroundColor: 'transparent',
                                        color: theme.isDark ? theme.text : '#181A18',
                                        border: 'none',
                                        paddingLeft: '12px',
                                        paddingRight: '8px'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsMgUnitDropdownOpen(prev => !prev)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onTouchStart={(e) => e.preventDefault()}
                                    className="flex items-center justify-between gap-2 px-3 py-3 flex-shrink-0 rounded-r-lg relative cursor-pointer transition-all border-none outline-none"
                                    data-dropdown-container
                                    style={{ 
                                        borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                                        backgroundColor: theme.isDark ? theme.secondary : (theme.cardBackground || '#f9fafb'),
                                        color: theme.isDark ? theme.text : '#181A18',
                                        minWidth: '80px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = theme.isDark ? theme.secondary : (theme.cardBackground || '#f9fafb');
                                    }}
                                >
                                    <span className="text-sm font-semibold">
                                        {getEditingMgUnit()}
                                    </span>
                                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </button>
                                {isMgUnitDropdownOpen && (
                                    <div className="relative" data-dropdown-container>
                                        <div 
                                            className="absolute top-full right-0 mt-1 z-50 rounded-lg shadow-lg border overflow-hidden"
                                            style={{
                                                backgroundColor: theme.cardBackground,
                                                borderColor: theme.border,
                                                minWidth: '100px',
                                                boxShadow: theme.isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)'
                                            }}
                                        >
                                            {[
                                                { value: 'mg', label: 'mg' },
                                                { value: 'mL', label: 'mL' },
                                                { value: 'g', label: 'g' },
                                                { value: 'IU', label: 'IU' }
                                            ].map((option, optIdx) => (
                                                <React.Fragment key={option.value}>
                                                    {optIdx > 0 && (
                                                        <div 
                                                            className="h-px mx-2"
                                                            style={{ backgroundColor: theme.border }}
                                                        />
                                                    )}
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onTouchStart={(e) => e.preventDefault()}
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            updateEditingItem({ mgUnit: option.value });
                                                            updateFormData({ mgUnit: option.value });
                                                            setIsMgUnitDropdownOpen(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-sm transition-all touch-manipulation"
                                                        style={{
                                                            color: getEditingMgUnit() === option.value ? theme.primary : theme.text,
                                                            backgroundColor: 'transparent',
                                                            WebkitTapHighlightColor: 'transparent'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                                                            e.currentTarget.style.color = theme.primary;
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'transparent';
                                                            e.currentTarget.style.color = getEditingMgUnit() === option.value ? theme.primary : theme.text;
                                                        }}
                                                    >
                                                        {option.label}
                                                    </button>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <label 
                                htmlFor="recon-amount-input"
                                className="absolute pointer-events-none transition-all"
                                style={{
                                    fontSize: (isAmountFocused || (getEditingMg() && String(getEditingMg()).trim())) ? '0.75rem' : '0.9375rem',
                                    top: (isAmountFocused || (getEditingMg() && String(getEditingMg()).trim())) ? '-8px' : '14px',
                                    left: (isAmountFocused || (getEditingMg() && String(getEditingMg()).trim())) ? '12px' : '16px',
                                    right: (isAmountFocused || (getEditingMg() && String(getEditingMg()).trim())) ? '90px' : 'auto',
                                    padding: (isAmountFocused || (getEditingMg() && String(getEditingMg()).trim())) ? '0 4px' : '0',
                                    background: (isAmountFocused || (getEditingMg() && String(getEditingMg()).trim())) ? (theme.isDark ? theme.background : (theme.inputBackground || theme.cardBackground)) : 'transparent',
                                    color: (isAmountFocused || (getEditingMg() && String(getEditingMg()).trim())) ? theme.primary : (theme.textLight || theme.text),
                                    fontWeight: 500
                                }}
                            >
                                Amount
                            </label>
                        </div>
                        <TextInput 
                            label="Water (mL)" 
                            type="number" 
                            value={editingItem?.water || draft.water || ''} 
                            onChange={v => { updateEditingItem({ water: v }); updateFormData({ water: v }); }} 
                            theme={theme}
                            outlined={true}
                            customTextColor={theme.isDark ? null : "#181A18"}
                            customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                        />
                    </div>
                    
                    {/* Dose and Units in one row */}
                    <div className="grid grid-cols-2 gap-3">
                        {/* Dose with Unit Dropdown */}
                        <div className="relative">
                            <div 
                                className="flex items-stretch rounded-lg"
                                style={{ 
                                    border: `1px solid ${isDoseFocused ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
                                    boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                                    backgroundColor: theme.isDark ? theme.background : (theme.inputBackground || theme.cardBackground)
                                }}
                            >
                                <input
                                    type="text"
                                    id="recon-dose-input"
                                    value={getEditingDose() || ''} 
                                    onChange={e => { updateEditingItem({ dose: e.target.value }); updateFormData({ dose: e.target.value }); }} 
                                    onFocus={() => setIsDoseFocused(true)}
                                    onBlur={(e) => {
                                        setTimeout(() => {
                                            const relatedTarget = e.relatedTarget || document.activeElement
                                            const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]')
                                            if (!isClickingDropdown && !isDoseUnitDropdownOpen) {
                                                setIsDoseFocused(false)
                                            }
                                        }, 150)
                                    }}
                                    placeholder=" "
                                    className="flex-1 py-3 outline-none min-w-0 rounded-l-lg"
                                    style={{
                                        backgroundColor: 'transparent',
                                        color: theme.isDark ? theme.text : '#181A18',
                                        border: 'none',
                                        paddingLeft: '12px',
                                        paddingRight: '8px'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsDoseUnitDropdownOpen(prev => !prev)}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onTouchStart={(e) => e.preventDefault()}
                                    className="flex items-center justify-between gap-2 px-3 py-3 flex-shrink-0 rounded-r-lg relative cursor-pointer transition-all border-none outline-none"
                                    data-dropdown-container
                                    style={{ 
                                        borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                                        backgroundColor: theme.isDark ? theme.secondary : (theme.cardBackground || '#f9fafb'),
                                        color: theme.isDark ? theme.text : '#181A18',
                                        minWidth: '80px'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = theme.isDark ? theme.secondary : (theme.cardBackground || '#f9fafb');
                                    }}
                                >
                                    <span className="text-sm font-semibold">
                                        {getEditingDoseUnit()}
                                    </span>
                                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                </button>
                                {isDoseUnitDropdownOpen && (
                                    <div className="relative" data-dropdown-container>
                                        <div 
                                            className="absolute top-full right-0 mt-1 z-50 rounded-lg shadow-lg border overflow-hidden"
                                                style={{
                                                    backgroundColor: theme.cardBackground,
                                                    borderColor: theme.border,
                                                    minWidth: '100px',
                                                    boxShadow: theme.isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                {[
                                                    { value: 'mcg', label: 'mcg' },
                                                { value: 'mg', label: 'mg' },
                                                { value: 'mL', label: 'mL' },
                                                { value: 'IU', label: 'IU' },
                                                ...(editingItem?.deliveryMethod === 'nasal' ? [{ value: 'sprays', label: 'sprays' }] : [])
                                            ].map((option, optIdx) => (
                                                <React.Fragment key={option.value}>
                                                    {optIdx > 0 && (
                                                        <div 
                                                            className="h-px mx-2"
                                                            style={{ backgroundColor: theme.border }}
                                                        />
                                                    )}
                                                    <button
                                                        type="button"
                                                        onMouseDown={(e) => e.preventDefault()}
                                                        onTouchStart={(e) => e.preventDefault()}
                                                        onClick={(e) => {
                                                            e.preventDefault()
                                                            e.stopPropagation()
                                                            updateEditingItem({ doseUnit: option.value });
                                                            updateFormData({ doseUnit: option.value });
                                                            setIsDoseUnitDropdownOpen(false);
                                                        }}
                                                        className="w-full text-left px-3 py-2 text-sm transition-all touch-manipulation"
                                                        style={{
                                                            color: getEditingDoseUnit() === option.value ? theme.primary : theme.text,
                                                            backgroundColor: 'transparent',
                                                            WebkitTapHighlightColor: 'transparent'
                                                        }}
                                                        onMouseEnter={(e) => {
                                                            e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                                                            e.currentTarget.style.color = theme.primary;
                                                        }}
                                                        onMouseLeave={(e) => {
                                                            e.currentTarget.style.backgroundColor = 'transparent';
                                                            e.currentTarget.style.color = getEditingDoseUnit() === option.value ? theme.primary : theme.text;
                                                        }}
                                                    >
                                                        {option.label}
                                                    </button>
                                                </React.Fragment>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <label 
                                htmlFor="recon-dose-input"
                                className="absolute pointer-events-none transition-all"
                                style={{
                                    fontSize: (isDoseFocused || (getEditingDose() && String(getEditingDose()).trim())) ? '0.75rem' : '0.9375rem',
                                    top: (isDoseFocused || (getEditingDose() && String(getEditingDose()).trim())) ? '-8px' : '14px',
                                    left: (isDoseFocused || (getEditingDose() && String(getEditingDose()).trim())) ? '12px' : '16px',
                                    right: (isDoseFocused || (getEditingDose() && String(getEditingDose()).trim())) ? '90px' : 'auto',
                                    padding: (isDoseFocused || (getEditingDose() && String(getEditingDose()).trim())) ? '0 4px' : '0',
                                    background: (isDoseFocused || (getEditingDose() && String(getEditingDose()).trim())) ? (theme.isDark ? theme.background : (theme.inputBackground || theme.cardBackground)) : 'transparent',
                                    color: (isDoseFocused || (getEditingDose() && String(getEditingDose()).trim())) ? theme.primary : (theme.textLight || theme.text),
                                    fontWeight: 500
                                }}
                            >
                                Dose
                            </label>
                        </div>
                        
                        {/* Calculated Units/Dose & Doses/Vial display */}
                        {(() => {
                            const liveCalc = calculateRecon({
                                mg: editingItem?.mg,
                                water: editingItem?.water,
                                dose: editingItem?.dose,
                                doseUnit: editingItem?.doseUnit || 'mcg'
                            });
                            return (
                                <div 
                                    className="flex items-center gap-2 px-3 py-2 rounded-xl"
                                    style={{ 
                                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                                        border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`
                                    }}
                                >
                                    <span className="text-[10px] font-semibold uppercase tracking-widest opacity-40" style={{ color: theme.text }}>Units/Dose</span>
                                    <span className="text-sm font-bold" style={{ color: theme.primary }}>
                                        {liveCalc.unitsPerDose ? liveCalc.unitsPerDose.toFixed(0) : '—'}
                                    </span>
                                </div>
                            );
                        })()}
                    </div>

                    {/* DELIVERY METHOD Section Header */}
                    <div className="flex items-center gap-4 mb-3 pt-1">
                        <Droplets size={32} style={{ color: theme.primary }} />
                        <div className="flex flex-col gap-0.5">
                            <h4 className="text-lg font-semibold tracking-wide" style={{ color: theme.text }}>Delivery Method</h4>
                            <div className="flex items-center gap-2 ml-1">
                                <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                                <span className="text-[10px] font-semibold uppercase tracking-[0.15em] opacity-40" style={{ color: theme.text }}>
                                    Administration
                                </span>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="grid grid-cols-2 gap-1.5">
                            {[
                                { key: 'pipette', label: 'Syringe', Icon: Pipette, sprays: false },
                                { key: 'pen', label: 'Pen', Icon: PenTool, sprays: false },
                                { key: 'nasal', label: 'Nasal', Icon: Droplet, sprays: true },
                                { key: 'topical', label: 'Topical', Icon: Hand, sprays: false }
                            ].map(({ key, label, Icon, sprays }) => {
                                const isActive = (editingItem?.deliveryMethod || 'pipette') === key;
                                return (
                                    <button 
                                        key={key}
                                        onClick={() => {
                                            const updates = { deliveryMethod: key };
                                            if (sprays && editingItem?.doseUnit !== 'sprays') updates.doseUnit = 'sprays';
                                            if (!sprays && editingItem?.doseUnit === 'sprays') updates.doseUnit = 'mcg';
                                            updateEditingItem(updates);
                                        }}
                                        className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-all active:scale-95"
                                        style={{
                                            backgroundColor: isActive ? '#445952' : (theme.isDark ? '#1f2937' : '#f5f4f0'),
                                            color: isActive ? '#fff' : theme.text,
                                            border: isActive ? '1px solid #3B4240' : `1px solid ${theme.border}`,
                                            boxShadow: isActive ? 'inset 0 2px 4px rgba(0,0,0,0.25), 0 1px 2px rgba(0,0,0,0.1)' : 'inset 0 1px 3px rgba(0,0,0,0.06)'
                                        }}
                                    >
                                        <Icon size={14} className="flex-shrink-0" /> {label}
                                    </button>
                                );
                            })}
                        </div>
                        {(editingItem?.deliveryMethod === 'pipette' || !editingItem?.deliveryMethod) && (
                            <div className="mt-3">
                                <div 
                                    className="flex items-center gap-1 p-1 rounded-lg" 
                                    style={{ 
                                        backgroundColor: theme.isDark ? `${theme.primary}18` : `${theme.primary}12`,
                                        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.08)'
                                    }}
                                >
                                    {['SubQ', 'IM', 'IV'].map(route => {
                                        const isActive = (editingItem?.administrationRoute || 'SubQ') === route;
                                        return (
                                            <button 
                                                key={route}
                                                onClick={() => updateEditingItem({ administrationRoute: route })}
                                                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-all active:scale-95"
                                                style={{
                                                    backgroundColor: isActive ? '#6B7F77' : 'transparent',
                                                    color: isActive ? '#fff' : theme.textLight,
                                                    boxShadow: isActive ? 'inset 0 2px 4px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.08)' : 'none'
                                                }}
                                            >
                                                {route}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                        {editingItem?.deliveryMethod === 'pen' && (
                            <div className="mt-3">
                                <div className="grid grid-cols-2 gap-3">
                                    {/* Pen Type Selection */}
                                    <div className="relative" ref={penTypeDropdownRef}>
                                        <button
                                            type="button"
                                            onClick={() => setIsPenTypeDropdownOpen(prev => !prev)}
                                            onMouseDown={(e) => {
                                              // Prevent any parent blur events on mobile
                                              e.preventDefault();
                                            }}
                                            onTouchStart={(e) => {
                                              // Prevent any parent blur events on touch devices
                                              e.preventDefault();
                                            }}
                                            className="w-full px-3 py-2 text-sm border rounded-md flex items-center justify-between transition-all hover:border-gray-400 touch-manipulation"
                                            style={{
                                                borderColor: isPenTypeDropdownOpen ? theme.primary : theme.border,
                                                backgroundColor: theme.cardBackground,
                                                color: editingItem?.penType ? theme.text : theme.textLight,
                                                WebkitTapHighlightColor: 'transparent'
                                            }}
                                        >
                                            <span>
                                                {editingItem?.penType ? (
                                                    editingItem.penType === 'bird-pen' ? 'Bird Pen' : 
                                                    editingItem.penType === 'v1' ? 'V1' : 
                                                    editingItem.penType === 'v2' ? 'V2' : 
                                                    editingItem.penType === 'v3' ? 'V3' : 
                                                    editingItem.penType.charAt(0).toUpperCase() + editingItem.penType.slice(1)
                                                ) : 'Pen Type'}
                                            </span>
                                            <ChevronDown 
                                                size={16} 
                                                className={`transition-transform duration-200 ${isPenTypeDropdownOpen ? 'rotate-180' : ''}`}
                                                style={{ color: theme.textLight }}
                                            />
                                        </button>
                                        {isPenTypeDropdownOpen && (
                                            <div 
                                                className="absolute z-50 w-full bottom-full mb-1 rounded-lg shadow-lg border overflow-hidden"
                                            style={{
                                                    backgroundColor: theme.cardBackground,
                                                borderColor: theme.border,
                                                    boxShadow: theme.isDark ? '0 -4px 6px rgba(0,0,0,0.3)' : '0 -4px 6px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                {[
                                                    { value: '', label: 'Pen Type' },
                                                    { value: 'savvio', label: 'Savvio' },
                                                    { value: 'novo', label: 'Novo' },
                                                    { value: 'v1', label: 'V1' },
                                                    { value: 'v2', label: 'V2' },
                                                    { value: 'v3', label: 'V3' },
                                                    { value: 'bird-pen', label: 'Bird Pen' },
                                                    { value: 'luxura', label: 'Luxura' },
                                                    { value: 'gansulin', label: 'Gansulin' },
                                                    { value: 'other', label: 'Other' }
                                                ].map((option, optIdx) => (
                                                    <React.Fragment key={option.value}>
                                                        {optIdx > 0 && (
                                                            <div 
                                                                className="h-px mx-2"
                                                                style={{ backgroundColor: theme.border }}
                                                            />
                                                        )}
                                                        <button
                                                            type="button"
                                                            onMouseDown={(e) => {
                                                              // Prevent blur events on mobile
                                                              e.preventDefault();
                                                            }}
                                                            onTouchStart={(e) => {
                                                              // Prevent blur events on touch devices
                                                              e.preventDefault();
                                                            }}
                                                            onClick={(e) => {
                                                              e.preventDefault();
                                                              e.stopPropagation();
                                                              updateEditingItem({ penType: option.value });
                                                              setIsPenTypeDropdownOpen(false);
                                                            }}
                                                            className="w-full text-left px-3 py-2 text-sm transition-all touch-manipulation"
                                                            style={{
                                                                color: editingItem?.penType === option.value ? theme.primary : theme.text,
                                                                backgroundColor: 'transparent',
                                                                WebkitTapHighlightColor: 'transparent'
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                                                                e.currentTarget.style.color = theme.primary;
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.backgroundColor = 'transparent';
                                                                e.currentTarget.style.color = editingItem?.penType === option.value ? theme.primary : theme.text;
                                                            }}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    </React.Fragment>
                                                ))}
                                    </div>
                                        )}
                                    </div>
                                    {/* Pen Color Selection */}
                                    <ColorSwatchDropdown
                                        value={penColor}
                                        onChange={(hex) => {
                                            setPenColor(hex);
                                            // Find color name from hex
                                            const selectedColor = penColors.find(p => p.hex === hex);
                                            if (selectedColor) {
                                                updateEditingItem({ penColor: selectedColor.name });
                                            }
                                        }}
                                        colors={penColors}
                                        theme={theme}
                                        placeholder="Pen Color"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Page Break */}
                    <div className="border-t" style={{ borderColor: theme.border }}></div>

                    <GlassmorphismDatePicker
                        value={editingItem?.dateAcquired || draft.dateAcquired || ''}
                        onChange={(dateString) => {
                            updateEditingItem({ dateAcquired: dateString });
                            updateFormData({ dateAcquired: dateString });
                        }}
                        theme={theme}
                        placeholder="Date Reconstituted"
                    />

                    <TextInput
                        label="Cost ($)"
                        value={editingItem?.cost || ''}
                        onChange={v => updateEditingItem({ cost: v })}
                        theme={theme}
                        type="number"
                        outlined={true}
                        customTextColor={theme.isDark ? null : "#181A18"}
                        customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    />

                    <TextInput 
                        label="Notes" 
                        value={editingItem?.notes || ''} 
                        onChange={v => updateEditingItem({ notes: v })} 
                        theme={theme} 
                        multiline
                        outlined={true}
                        customTextColor={theme.isDark ? null : "#181A18"}
                        customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    />
                </div>
			</BottomSheet>

            <BottomSheet open={!!viewItem} onClose={() => setViewItem(null)} title="Recon History Details" theme={theme} maxHeight="90vh">
				{viewItem && (() => {
					const calc = calculateRecon(viewItem)
                    const reconstitutedDate = viewItem.date; // Date when reconstitution was created
                    const finishedDate = viewItem.usedDate; // Date when vial was marked as finished
                    const protocolName = viewItem.protocolName;
                    const protocolId = viewItem.protocolId;
                    const linkedProtocol = protocolId ? protocols.find(p => p.id === protocolId) : null;
                    const displayProtocolName = protocolName || (linkedProtocol?.protocolName || linkedProtocol?.name);
					const costPerDose = viewItem.cost ? formatCurrency(viewItem.cost / calc.dosesPerVial) : null
					return (
						<div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><div className="text-xs" style={{ color: theme.textLight }}>Reconstituted</div><div className="font-medium">{reconstitutedDate ? formatMMDDYYYY(reconstitutedDate) : '—'}</div></div>
                                <div><div className="text-xs" style={{ color: theme.textLight }}>Finished</div><div className="font-medium">{finishedDate ? formatMMDDYYYY(finishedDate) : '—'}</div></div>
                                <div><div className="text-xs" style={{ color: theme.textLight }}>Vendor</div><div className="font-medium">{viewItem.vendorId ? vendorMap[viewItem.vendorId] : viewItem.vendor}</div></div>
                                {displayProtocolName ? (
                                    <div>
                                        <div className="text-xs" style={{ color: theme.textLight }}>Protocol</div>
                                        <div 
                                            className="font-medium cursor-pointer hover:underline" 
                                            style={{ color: theme.primary }}
                                            onClick={() => {
                                                if (protocolId && linkedProtocol) {
                                                    navigate('/app/protocols', { state: { highlightProtocolId: protocolId } });
                                                    setViewItem(null);
                                                } else if (protocolName) {
                                                    navigate('/app/protocols');
                                                    setViewItem(null);
                                                }
                                            }}
                                        >
                                            {displayProtocolName}
                                        </div>
                                    </div>
                                ) : null}
                                <div><div className="text-xs" style={{ color: theme.textLight }}>mg</div><div className="font-medium">{viewItem.mg}</div></div>
                                <div><div className="text-xs" style={{ color: theme.textLight }}>Water (mL)</div><div className="font-medium">{viewItem.water}</div></div>
                                <div><div className="text-xs" style={{ color: theme.textLight }}>Dose</div><div className="font-medium">{viewItem.dose ? `${viewItem.dose} ${viewItem.doseUnit || 'mcg'}` : '—'}</div></div>
                                <div className="col-span-2"><div className="text-xs" style={{ color: theme.textLight }}>Delivery Method</div><div className="font-medium">{viewItem.deliveryMethod === 'pen' ? `Pen${viewItem.penColor ? ` (${viewItem.penColor})` : ''}` : viewItem.deliveryMethod === 'nasal' ? 'Nasal' : viewItem.deliveryMethod === 'topical' ? 'Topical' : 'Syringe'}</div></div>
                                <div><div className="text-xs" style={{ color: theme.textLight }}>Units</div><div>{calc.unitsPerDose ? `${calc.unitsPerDose.toFixed(0)} u` : '-'}</div></div>
                                <div><div className="text-xs" style={{ color: theme.textLight }}>Doses/Vial</div><div>{calc.dosesPerVial || '-'}</div></div>
                                <div><div className="text-xs" style={{ color: theme.textLight }}>Cost/Dose</div><div>{costPerDose || '-'}</div></div>
                                {Array.isArray(viewItem.peptides) && viewItem.peptides.length > 0 ? (
                                    <div className="col-span-2">
                                        <div className="text-xs" style={{ color: theme.textLight }}>Peptides</div>
                                        <div className="flex flex-wrap gap-2 mt-1">
                                            {viewItem.peptides.map((p, idx) => (
                                                <span key={idx} className="px-2 py-1 text-xs rounded-md" style={{ backgroundColor: theme.secondary, color: theme.text }}>
                                                    {p.name} • {p.dose}{p.doseUnit ? ` ${p.doseUnit}` : ''}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                                {viewItem.capColor ? (<div className="col-span-2"><div className="text-xs" style={{ color: theme.textLight }}>Cap Color</div><div className="font-medium">{viewItem.capColor}</div></div>) : null}
                                {viewItem.notes ? (<div className="col-span-2"><div className="text-xs" style={{ color: theme.textLight }}>Notes</div><div className="font-medium">{viewItem.notes}</div></div>) : null}
                            </div>
                            <div className="flex justify-end pt-2 border-t" style={{ borderColor: theme.border }}>
                                <button
                                    className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold action-button-hover"
                                    style={{ background: terracottaGradient, color: '#ffffff' }}
                                    onMouseEnter={(e) => { e.currentTarget.style.background = terracottaHoverGradient; }}
                                    onMouseLeave={(e) => { e.currentTarget.style.background = terracottaGradient; }}
                                    onClick={() => { setHistoryToDelete(viewItem); setViewItem(null); }}
                                >
                                    <Trash2 size={14} /> Delete
                                </button>
                            </div>
						</div>
					)
				})()}
			</BottomSheet>

            <Modal
                open={!!historyToDelete}
                onClose={() => setHistoryToDelete(null)}
                title="Delete History Entry"
                theme={theme}
                variant="modern"
            >
                <div className="flex justify-end gap-2 pt-2">
                    <button
                        className="px-4 py-2 rounded-md text-sm font-semibold action-button-hover"
                        style={{ backgroundColor: theme.secondary, color: theme.text }}
                        onClick={() => setHistoryToDelete(null)}
                    >
                        Cancel
                    </button>
                    <button
                        className="px-4 py-2 rounded-md text-sm font-semibold action-button-hover"
                        style={{ background: terracottaGradient, color: '#ffffff' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = terracottaHoverGradient; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = terracottaGradient; }}
                        onClick={() => historyToDelete && handleDeleteHistory(historyToDelete)}
                    >
                        Delete
                    </button>
                </div>
            </Modal>

			<BottomSheet 
				open={showCalculatorModal} 
				onClose={() => { 
					setShowCalculatorModal(false); 
					setPrefill(null);
					setDraftIdToRemove(null);
					setCalculatorFormData(null);
				}} 
				title="Peptide Calculator" 
				theme={theme} 
				maxHeight="90vh"
				seamlessContent={true}
				footer={
					<div className="w-full space-y-2">
						{/* Compact calculated results row */}
					<div 
						className="flex items-center justify-between text-center rounded-xl py-2.5 px-3"
						style={{ backgroundColor: theme.isDark ? theme.background : theme.primary + '08', border: `1px solid ${theme.primary}18` }}
					>
						<div className="flex-1 flex flex-col gap-0.5">
							<div className="text-[9px] font-bold uppercase tracking-wider opacity-55" style={{ color: theme.text }}>Units/Dose</div>
							<div className="text-[22px] font-black leading-none" style={{ color: theme.primary }}>
								{typeof calcSummary.unitsPerDose === 'number' ? calcSummary.unitsPerDose.toFixed(0) : '–'}
							</div>
						</div>
						<div className="flex-1 border-x flex flex-col gap-0.5" style={{ borderColor: theme.primary + '20' }}>
							<div className="text-[9px] font-bold uppercase tracking-wider opacity-55" style={{ color: theme.text }}>Doses/Vial</div>
							<div className="text-[22px] font-black leading-none" style={{ color: theme.primary }}>
								{typeof calcSummary.dosesPerVial === 'number' ? calcSummary.dosesPerVial : '–'}
							</div>
						</div>
						<div className="flex-1 flex flex-col gap-0.5">
							<div className="text-[9px] font-bold uppercase tracking-wider opacity-55" style={{ color: theme.text }}>Cost/Dose</div>
							<div className="text-[22px] font-black leading-none" style={{ color: theme.primary }}>
								{calcSummary.costPerDose || '–'}
							</div>
						</div>
					</div>
						<div className="flex items-center gap-3">
						{!isFree && (
						<button
							type="button"
							onClick={() => {
								if (!calculatorFormData) return;
								const formDataToSave = { ...calculatorFormData, draftSource: 'calculator' };
								if (formDataToSave.deliveryMethod === 'pen' && formDataToSave.penColor) {
									const selectedPenColor = penColors.find(p => p.hex === formDataToSave.penColor);
									if (selectedPenColor) formDataToSave.penColor = selectedPenColor.name;
								}
								handleCalculatorSaveDraft(formDataToSave);
								setShowCalculatorModal(false);
								setPrefill(null);
								setDraftIdToRemove(null);
								setCalculatorFormData(null);
							}}
						className="text-sm font-medium transition-opacity opacity-60 hover:opacity-100 whitespace-nowrap flex-shrink-0"
						style={{ color: theme.primary }}
						>
							Save as Draft
						</button>
						)}
						<button
							type="button"
						onClick={async () => {
							// Free tier: calculator is always usable but capped at 1 saved result.
							// canSaveCalc is false when the free tier cap is reached.
							if (!calculatorFormData || isSavingCalculator || !canSaveCalc) {
								if (!canSaveCalc) setShowUpgradeModal(true);
								return;
							}
								setIsSavingCalculator(true);
								try {
									const formDataToSave = { ...calculatorFormData };
									if (formDataToSave.deliveryMethod === 'pen' && formDataToSave.penColor) {
										const selectedPenColor = penColors.find(p => p.hex === formDataToSave.penColor);
										if (selectedPenColor) formDataToSave.penColor = selectedPenColor.name;
									}
									if (formDataToSave.peptides) {
										formDataToSave.peptides = formDataToSave.peptides.map(pep => ({
											...pep,
											stockpileId: pep.stockpileId || null,
											quantityUsed: pep.quantityUsed || 1
										}));
									}
									await handleCalculatorSave(formDataToSave);
									setShowCalculatorModal(false);
									setPrefill(null);
									setDraftIdToRemove(null);
									setCalculatorFormData(null);
								} catch (error) {
									console.error('Failed to save calculation:', error);
								} finally {
									setIsSavingCalculator(false);
								}
							}}
						disabled={isSavingCalculator || !calculatorFormData}
						className="flex-1 flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:shadow-none disabled:opacity-75 whitespace-nowrap"
						style={{
							background: getPrimaryActionGradient(isSavingCalculator || !canSaveCalc || !calculatorFormData),
							color: (isSavingCalculator || !canSaveCalc || !calculatorFormData) ? (theme?.text || '#111827') : (theme?.textOnPrimary || '#ffffff'),
							border: 'none',
							boxShadow: (isSavingCalculator || !canSaveCalc || !calculatorFormData) ? 'none' : primaryActionDefaultShadow
						}}
						onMouseEnter={(e) => {
							if (isSavingCalculator || !canSaveCalc || !calculatorFormData) return;
							e.currentTarget.style.transform = 'translateY(-1px)';
							e.currentTarget.style.boxShadow = primaryActionHoverShadow;
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.transform = 'translateY(0)';
							e.currentTarget.style.boxShadow = (isSavingCalculator || !canSaveCalc || !calculatorFormData) ? 'none' : primaryActionDefaultShadow;
							e.currentTarget.style.background = getPrimaryActionGradient(isSavingCalculator || !canSaveCalc || !calculatorFormData);
						}}
						title={!canSaveCalc ? "Upgrade to Research+ to save more calculations" : "Save calculation"}
						>
							<FilePlus size={16} />
							{isSavingCalculator ? 'Saving…' : (!canSaveCalc ? 'Research+ to Save More' : 'Save Calculation')}
						</button>
						</div>
						{/* Research disclaimer - subtle inline text */}
						<p className="text-[9px] text-center opacity-40 flex items-center justify-center gap-1" style={{ color: theme.text }}>
							<Info size={10} className="opacity-60 flex-shrink-0" />
							For research purposes only. Always verify calculations.
						</p>
					</div>
				}
			>
				<ReconCalculatorPanel 
					theme={theme} 
					prefill={prefill} 
					isReadOnly={isReadOnly} 
					onUpgrade={() => setShowUpgradeModal(true)} 
					onSave={null}
					noCard={true}
					compact={true}
					hideSaveButton={true}
					formData={calculatorFormData}
					setFormData={(newForm) => {
						setCalculatorFormData(newForm);
					}}
					onCalcUpdate={(calc, costPerDose) => {
						setCalcSummary({
							unitsPerDose: calc?.unitsPerDose ?? 0,
							dosesPerVial: calc?.dosesPerVial ?? 0,
							costPerDose: costPerDose ?? ''
						});
					}}
				/>
			</BottomSheet>

			<UpgradeModal
				isOpen={showUpgradeModal}
				onClose={() => setShowUpgradeModal(false)}
				theme={theme}
			/>
		</>
	)
}


