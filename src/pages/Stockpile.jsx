import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconContext, SquaresFour, Rows, PlusCircle, Scan, UploadSimple, Package as PhPackage, ShoppingCart as PhShoppingCart } from '@phosphor-icons/react'
import { useOutletContext, useNavigate, useLocation } from 'react-router-dom'
import { themes, defaultThemeName } from '../theme/themes'
import TextInput from '../components/common/inputs/TextInput'
import VendorSuggestInput from '../components/vendors/VendorSuggestInput'
import { prepareItemForSave } from '../utils/userDataSave'
import CustomDropdown from '../components/common/inputs/CustomDropdown'
import BottomSheet from '../components/common/BottomSheet'
import { appendStockEvent, getStockHistory } from '../utils/stockHistory'
import { exportToCSV } from '../utils/export'
import { getUnitMultiplier, getBaseUnit, getUnitLabel, canReconstitute, isConvertibleUnit, convertForStorage, getOrderItemOrderQuantity, getOrderItemVialCount } from '../utils/unitConversion'
import { formatCurrency } from '../utils/currencyUtils'
import { Filter, Edit, Package, Beaker, Percent, Hash, DollarSign, FileText, ShoppingCart, Merge, AlertCircle, Image as ImageIcon, Link as LinkIcon, TestTube, PackageOpen, ImageUp, X, PenTool, ChevronDown, ChevronRight, Info, Calendar, Search, AlertTriangle, Settings, Pencil, Check, Pill, Droplet, Lock, ArrowRight, Download } from 'lucide-react'
import { useAppContext } from '../context/AppContext'
import { generateId } from '../utils/string'
import DocumentationUpload from '../components/common/DocumentationUpload'
import ImagePreviewModal from '../components/common/ImagePreviewModal'
import StockpileCard from '../components/stockpile/StockpileCard'
import StockpileGroupCard from '../components/stockpile/StockpileGroupCard'
import IncomingGroupCard from '../components/stockpile/IncomingGroupCard'
import OutOfStockGroupCard from '../components/stockpile/OutOfStockGroupCard'
import MergeConfirmationModal from '../components/stockpile/MergeConfirmationModal'
import MergeSelectionModal from '../components/stockpile/MergeSelectionModal'
import DuplicateDetection from '../components/stockpile/DuplicateDetection'
import StockpileTipsBanner from '../components/stockpile/StockpileTipsBanner'
import { useSubscriptionAccess, useTierAccess } from '../utils/useSubscriptionAccess'
import UpgradeModal from '../components/common/UpgradeModal'
import useAutoSave from '../utils/useAutoSave'
import { saveAppData } from '../services/cloudStorage'
import { useFirebase } from '../context/FirebaseContext'
import GlassmorphismDatePicker from '../components/common/GlassmorphismDatePicker'
import ConfirmationModal from '../components/ui/ConfirmationModal'
import { recordDeletion } from '../utils/deletionTracking'
import OrderDetailsModal from '../components/orders/OrderDetailsModal'
import { syncOrderDocumentationToStockpile } from '../utils/documentationSync'
import { ensurePublicOrderNumbers, getNextPublicOrderNumber } from '../utils/orderNumbers'
import BulkImportModal from '../components/stockpile/BulkImportModal'
import AddToStockpileBottomSheet from '../components/stockpile/AddToStockpileBottomSheet'
import CrimpCapColorInput from '../components/stockpile/CrimpCapColorInput'
import SupplyCard from '../components/stockpile/SupplyCard'
import AddSupplyModal from '../components/stockpile/AddSupplyModal'
import StockpileEntrySummaryRow, { STOCKPILE_ENTRY_MANAGE_GRID } from '../components/stockpile/StockpileEntrySummaryRow'
import {
  PURPOSE_ICON_WEIGHT,
  getPurposeIconComponent,
  getPurposeIconColor,
  inferPurposeIconFromCompound,
} from '../utils/protocolPurposeIcons'

export default function Stockpile() {
  const { theme } = useOutletContext()
  const navigate = useNavigate();
  const location = useLocation();
  const { vendors, addVendor, orders, setOrders, stockpile: items, setStockpile: setItems, protocols, reconItems, reconHistory, supplements, metrics, calendarNotes, scheduledBuys } = useAppContext();
  const { firebaseUser } = useFirebase();
  const { isReadOnly, isDowngraded } = useSubscriptionAccess();
  const { canAddStockpileItem, caps } = useTierAccess();
  const prevIsDowngradedRef = useRef(null);
  const [activeTab, setActiveTab] = useState('onhand')
  const [stockpileFilter, setStockpileFilter] = useState('view all') // 'view all' | 'low' | 'well stocked'
  const [showStockpileSearch, setShowStockpileSearch] = useState(false)
  const [stockpileSearchQuery, setStockpileSearchQuery] = useState('')
  const [isClosingSearch, setIsClosingSearch] = useState(false)
  const [stockpileLayoutMode, setStockpileLayoutMode] = useState(() => {
    try {
      const defaultedForStackedRelease = localStorage.getItem('tpprover_stockpile_layout_defaulted_v2')
      if (defaultedForStackedRelease !== 'true') {
        localStorage.setItem('tpprover_stockpile_layout', 'stacked')
        localStorage.setItem('tpprover_stockpile_layout_defaulted_v2', 'true')
        return 'stacked'
      }

      const savedLayout = localStorage.getItem('tpprover_stockpile_layout')
      if (savedLayout === 'columns' || savedLayout === 'stacked') return savedLayout
      localStorage.setItem('tpprover_stockpile_layout', 'stacked')
      return 'stacked'
    } catch {
      return 'stacked'
    }
  })
  const [openAdd, setOpenAdd] = useState(false)
  const [openAddWithScan, setOpenAddWithScan] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeLimitContext, setUpgradeLimitContext] = useState(null)
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [editingOrder, setEditingOrder] = useState(null)
  const [viewingGroup, setViewingGroup] = useState(null) // For view modal
  const [previewImage, setPreviewImage] = useState(null)
  const [deleteOutOfStockGroup, setDeleteOutOfStockGroup] = useState(null) // For delete confirmation
  const [isTransitioning, setIsTransitioning] = useState(false) // Track modal transitions
  const [manageRowDropdowns, setManageRowDropdowns] = useState({}) // { [rowId]: { amountUnit: false, unit: false } }
  const [expandedManageRows, setExpandedManageRows] = useState({}) // { [rowId]: boolean }

  // Supply state
  const [showAddSupply, setShowAddSupply] = useState(false)
  const [editingSupply, setEditingSupply] = useState(null)
  const [supplyFilter, setSupplyFilter] = useState('all')
  const [deleteSupplyItem, setDeleteSupplyItem] = useState(null)
  
  // Handle direct navigation to specific stockpile item (from search)
  useEffect(() => {
    if (location.state?.openStockpileId) {
      const itemToOpen = items.find(i => i.id === location.state.openStockpileId);
      if (itemToOpen) {
        setOpenAdd(true);
        window.history.replaceState({}, document.title);
      }
    }
    
    // Handle navigation back from orders page - set active tab
    if (location.state?.activeTab) {
      setActiveTab(location.state.activeTab);
      // Clear state after use
      window.history.replaceState({}, document.title);
    }

    // Open add single-entry bottom sheet when navigated from dashboard empty state
    if (location.state?.openAddSingle) {
      setOpenAdd(true);
      window.history.replaceState({}, document.title);
    }
  }, [location.state, items]);

  // ── Free-plan slot logic ─────────────────────────────────────────────────
  // Ref so we can read the latest items inside effects without adding them to deps.
  const itemsRef = useRef(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Count of active (non-held) stockpile entries — used as the trigger signal.
  const activeStockpileCount = useMemo(
    () => (items || []).filter(i => !i.heldByFreePlan && !i.archived && !i.deleted && i.type !== 'supply').length,
    [items]
  );

  // Auto-hold excess items when free caps are enforced.
  // Alphabetically sorts eligible entries; keeps the first N active, holds the rest.
  // No choose modal — see comment in Supplements/Protocols for contrast.
  useEffect(() => {
    if (!caps.enforced || caps.maxStockpileItems === null) return;
    if (activeStockpileCount <= caps.maxStockpileItems) return;

    const currentItems = itemsRef.current || [];
    const eligible = currentItems.filter(i => !i.archived && !i.deleted && i.type !== 'supply');
    const sorted = [...eligible].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
    );
    const keepIds = new Set(sorted.slice(0, caps.maxStockpileItems).map(i => i.id));

    setItems(prev => prev.map(i => {
      if (i.archived || i.deleted || i.type === 'supply') return i;
      const shouldHold = !keepIds.has(i.id);
      if (shouldHold === Boolean(i.heldByFreePlan)) return i;
      return {
        ...i,
        heldByFreePlan: shouldHold ? true : undefined,
        heldAt: shouldHold ? (i.heldAt || new Date().toISOString()) : undefined,
      };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caps.enforced, caps.maxStockpileItems, activeStockpileCount]);

  // When user resubscribes, clear held flags so all entries return to normal.
  useEffect(() => {
    if (prevIsDowngradedRef.current === true && isDowngraded === false) {
      setItems(prev => prev.map(i =>
        i.heldByFreePlan ? { ...i, heldByFreePlan: undefined, heldAt: undefined } : i
      ));
    }
    prevIsDowngradedRef.current = isDowngraded;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDowngraded]);

  // Close manage row dropdowns when clicking outside
  useEffect(() => {
    if (Object.values(manageRowDropdowns).every(v => !v.amountUnit && !v.unit && !v.priceUnit)) return;
    const handleClickOutside = (event) => {
      const isClickInside = event.target.closest('[data-dropdown-container]');
      if (!isClickInside) setManageRowDropdowns({});
    };
    const timeoutId = setTimeout(() => document.addEventListener('click', handleClickOutside), 100);
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [manageRowDropdowns]);
  
  const terracottaGradient = 'linear-gradient(135deg, #c87a5c 0%, #b5684a 100%)';
  const terracottaHoverGradient = 'linear-gradient(135deg, #b5684a 0%, #a35a3f 100%)';
  const lowStock = useMemo(() => (items || []).filter(i => Number(i.quantity) <= 2).map(i => i.name), [items])
  const [vendorFilter, setVendorFilter] = useState('')
  const [query, setQuery] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  
  // Drag & Drop Merge functionality
  const [isDragMode, setIsDragMode] = useState(false)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [showMergeSelectionModal, setShowMergeSelectionModal] = useState(false)
  const [mergeData, setMergeData] = useState({ source: null, target: null })
  const [mergeSourceGroup, setMergeSourceGroup] = useState(null)
  const [mergeSourceItem, setMergeSourceItem] = useState(null) // For individual item merge
  
  // Duplicate detection state - load from localStorage and persist across re-renders
  const [dismissedDuplicates, setDismissedDuplicates] = useState(() => {
    try {
      const saved = localStorage.getItem('tpprover_dismissed_duplicates');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  })
  
  // CRITICAL: Persist dismissed duplicates across cloud sync
  // When items change (after cloud sync), ensure dismissed duplicates are preserved
  useEffect(() => {
    try {
      const saved = localStorage.getItem('tpprover_dismissed_duplicates');
      if (saved) {
        const parsed = new Set(JSON.parse(saved));
        // Only update if localStorage has more dismissed items than current state
        // This prevents losing dismissed duplicates after cloud sync reloads items
        if (parsed.size > 0) {
          setDismissedDuplicates(prev => {
            // Merge with existing - localStorage is source of truth
            const merged = new Set([...prev, ...parsed]);
            // Only update if different
            if (merged.size !== prev.size) {
              return merged;
            }
            return prev;
          });
        }
      }
    } catch (e) {
      console.error('Failed to reload dismissed duplicates:', e);
    }
  }, [items]) // Reload when items change (after cloud sync)
  
  const vendorMap = useMemo(() => (vendors || []).reduce((acc, v) => ({ ...acc, [v.id]: v.name }), {}), [vendors]);
  
  // Copy link to clipboard
  const handleCopyLink = (url, title) => {
    navigator.clipboard.writeText(url).then(() => {
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { 
          message: 'Link Copied 📋', 
          type: 'success' 
        } 
      }));
    }).catch(err => {
      console.error('Failed to copy link:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { 
          message: 'Failed to copy link', 
          type: 'error' 
        } 
      }));
    });
  };
  
  // Supply items — kept separate from peptide groups
  const supplyItems = useMemo(() => (items || []).filter(i => i.type === 'supply' && !i._buddyHidden), [items])

  const filtered = useMemo(() => {
    return (items || []).filter(i => {
      if (i.type === 'supply') return false; // supplies live in their own tab
      if (i._buddyHidden) return false; // buddy was removed from account — hidden pending 30-day export
      if (caps.enforced && i.heldByFreePlan) return false; // held items display in their own section
      const vendorName = i.vendorId ? vendorMap[i.vendorId] : (i.vendor || '');
      const combinedQuery = stockpileSearchQuery || query || searchQuery;
      return (
        (!vendorFilter || vendorName.toLowerCase().includes(vendorFilter.toLowerCase())) &&
        (!combinedQuery || (i.name || '').toLowerCase().includes(combinedQuery.toLowerCase()) || String(i.batchNumber || '').toLowerCase().includes(combinedQuery.toLowerCase()))
      )
    })
  }, [items, vendorFilter, query, searchQuery, stockpileSearchQuery, vendorMap, caps.enforced])

  // Held-by-free-plan items and their compound groups (for the locked section below the main grid).
  const heldItems = useMemo(() => {
    if (!caps.enforced) return [];
    return (items || []).filter(i => !i.archived && !i.deleted && i.type !== 'supply' && i.heldByFreePlan === true);
  }, [items, caps.enforced]);

  const heldGroups = useMemo(() => {
    const map = new Map();
    for (const it of heldItems) {
      const name = (!it.name || it.name.trim() === '') ? 'Unknown' : it.name;
      if (!map.has(name)) map.set(name, { name, count: 0 });
      map.get(name).count++;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    );
  }, [heldItems]);

  const groups = useMemo(() => {
    const map = new Map()
    for (const it of filtered) {
      // Only treat as Unknown if name is truly empty/null/undefined (not the string "Unknown")
      const name = (!it.name || it.name.trim() === '') ? 'Unknown' : it.name
      const mg = String(it.mg || '')
      const mgUnit = it.mgUnit || 'mg'
      const qty = Number(it.quantity) || 0
      const mgNum = Number(it.mg) || 0
      
      // Create a unique key that includes the unit to separate mg from mL items
      const groupKey = `${name}__${mgUnit}`
      
      if (!map.has(groupKey)) {
        map.set(groupKey, { 
          name, 
          unit: mgUnit,
          groupKey, // Add groupKey property for duplicate detection
          totalMg: 0, 
          totalVials: 0,
          variants: {} 
        })
      }
      const g = map.get(groupKey)
      g.totalMg += qty * mgNum
      g.totalVials += qty
      
      const variantKey = `${mg}__${mgUnit}`
      if (!g.variants[variantKey]) {
        g.variants[variantKey] = { 
          mg, 
          unit: mgUnit,
          totalVials: 0, 
          items: [] 
        }
      }
      const v = g.variants[variantKey]
      v.totalVials += qty
      v.items.push(it)
    }
    return Array.from(map.values()).sort((a, b) => {
      // Sort Unknown groups to the end
      if (a.name === 'Unknown' && b.name !== 'Unknown') return 1
      if (b.name === 'Unknown' && a.name !== 'Unknown') return -1
      return a.name.localeCompare(b.name)
    })
  }, [filtered])

  // Filter groups based on stock status
  const filteredGroups = useMemo(() => {
    if (stockpileFilter === 'view all') {
      return groups
    } else if (stockpileFilter === 'low') {
      return groups.filter(g => {
        const hasLowStock = Object.values(g.variants).some(v => v.totalVials <= 2)
        return hasLowStock && g.totalVials > 0
      })
    } else if (stockpileFilter === 'well stocked') {
      return groups.filter(g => {
        const hasLowStock = Object.values(g.variants).some(v => v.totalVials <= 2)
        return !hasLowStock && g.totalVials > 0
      })
    } else if (stockpileFilter === 'out of stock') {
      return []
    }
    return groups
  }, [groups, stockpileFilter])

  const activeStockpileColumns = useMemo(() => {
    const activeGroups = filteredGroups.filter(g => g.totalVials > 0)
    if (stockpileLayoutMode === 'stacked') {
      return [activeGroups]
    }
    return [
      activeGroups.filter((_, index) => index % 2 === 0),
      activeGroups.filter((_, index) => index % 2 === 1),
    ]
  }, [filteredGroups, stockpileLayoutMode])

  // Calculate filter counts
  const filterCounts = useMemo(() => {
    const allCount = groups.filter(g => g.totalVials > 0).length
    const lowCount = groups.filter(g => {
      const hasLowStock = Object.values(g.variants).some(v => v.totalVials <= 2)
      return hasLowStock && g.totalVials > 0
    }).length
    const wellStockedCount = groups.filter(g => {
      const hasLowStock = Object.values(g.variants).some(v => v.totalVials <= 2)
      return !hasLowStock && g.totalVials > 0
    }).length
    const outOfStockCount = groups.filter(g => g.totalVials <= 0).length
    return { all: allCount, low: lowCount, wellStocked: wellStockedCount, outOfStock: outOfStockCount }
  }, [groups])

  // Supply filtered list
  const filteredSupplies = useMemo(() => {
    const combinedQuery = stockpileSearchQuery || query || searchQuery;
    let result = supplyItems.filter(s =>
      !combinedQuery || (s.name || '').toLowerCase().includes(combinedQuery.toLowerCase())
    );
    if (supplyFilter === 'low') {
      result = result.filter(s => {
        const qty = Number(s.quantity) || 0;
        const threshold = Number(s.lowThreshold) || 0;
        return qty > 0 && threshold > 0 && qty <= threshold;
      });
    } else if (supplyFilter === 'out of stock') {
      result = result.filter(s => (Number(s.quantity) || 0) <= 0);
    }
    return result;
  }, [supplyItems, supplyFilter, stockpileSearchQuery, query, searchQuery])

  const supplyFilterCounts = useMemo(() => {
    const all = supplyItems.length;
    const low = supplyItems.filter(s => {
      const qty = Number(s.quantity) || 0;
      const threshold = Number(s.lowThreshold) || 0;
      return qty > 0 && threshold > 0 && qty <= threshold;
    }).length;
    const outOfStock = supplyItems.filter(s => (Number(s.quantity) || 0) <= 0).length;
    return { all, low, outOfStock };
  }, [supplyItems])

  const incomingGroups = useMemo(() => {
    const list = Array.isArray(orders) ? orders.filter(o => {
      const s = (o.status || '').toLowerCase()
      return !s.includes('delivered')
    }) : []
    
    const map = new Map()
    
    for (const o of list) {
      if (!o.items || o.items.length === 0) continue; // Skip orders with no items

      for (const item of o.items) {
        const name = item.name || 'Unknown';
        const mg = String(item.mg || '');
        const mgUnit = item.mgUnit || 'mg';
        const vendorName = o.vendorId ? vendorMap[o.vendorId] : (o.vendor || 'Unknown');
        const mgNum = Number(item.mg) || 0;
        const { quantity: orderQty } = getOrderItemOrderQuantity(item, { orderId: o.id });
        const vials = getOrderItemVialCount(item, { orderId: o.id });

        // Create a unique key that includes the unit
        const groupKey = `${name}__${mgUnit}`;
        
        if (!map.has(groupKey)) {
          map.set(groupKey, { 
            name, 
            unit: mgUnit,
            totalMg: 0, 
            variants: {} 
          });
        }
        const g = map.get(groupKey);
        g.totalMg += mgNum * vials;

        const variantKey = `${mg}__${mgUnit}`;
        const containerUnit = item.unit || 'vial';
        if (!g.variants[variantKey]) {
          g.variants[variantKey] = { 
            mg, 
            unit: mgUnit,
            containerUnit,
            totalMg: 0, 
            vendors: {} 
          };
        }
        const v = g.variants[variantKey];
        v.totalMg += mgNum * vials;

        if (!v.vendors[vendorName]) {
          v.vendors[vendorName] = { totalMg: 0, count: 0 };
        }
        v.vendors[vendorName].totalMg += mgNum * vials;
        v.vendors[vendorName].count += orderQty;
      }
    }
    return Array.from(map.values()).sort((a,b) => a.name.localeCompare(b.name));
  }, [orders, vendorMap]);

  const incomingGroupKeys = useMemo(() => {
    return new Set(
      incomingGroups.map(g => `${String(g.name || '').trim().toLowerCase()}__${(g.unit || 'mg').toLowerCase()}`)
    );
  }, [incomingGroups]);

  const incomingGroupNames = useMemo(() => {
    return new Set(
      incomingGroups.map(g => String(g.name || '').trim().toLowerCase())
    );
  }, [incomingGroups]);

  const incomingWithOrderInfo = useMemo(() => {
    function getOrderIdForGroup(group) {
      if (!orders || !group.name) return null;
      const nonDelivered = orders.filter(o => !(o.status || '').toLowerCase().includes('delivered'));
      const matchesName = (itemName, targetName) => {
        const n = (itemName || '').trim();
        if (targetName === 'Unknown') return n === '' || n === 'Unknown';
        return n === (targetName || '').trim();
      };
      for (const o of nonDelivered) {
        if (!o.items) continue;
        if (o.items.some(item => matchesName(item.name, group.name))) return o.id;
      }
      return null;
    }
    const orderIds = incomingGroups.map(g => getOrderIdForGroup(g));
    const totalPerOrder = {};
    orderIds.forEach(id => { totalPerOrder[id] = (totalPerOrder[id] || 0) + 1; });
    const occurrence = {};
    return incomingGroups.map((g, i) => {
      const orderId = orderIds[i];
      const total = totalPerOrder[orderId] || 1;
      occurrence[orderId] = (occurrence[orderId] || 0) + 1;
      return { group: g, itemIndex: occurrence[orderId], totalFromOrder: total };
    });
  }, [incomingGroups, orders]);

  const [manageName, setManageName] = useState(null)
  const [manageRows, setManageRows] = useState([])
  const [manageRowsInitial, setManageRowsInitial] = useState([])
  const [isSavingManage, setIsSavingManage] = useState(false)
  const [outOfStockModalName, setOutOfStockModalName] = useState(null)
  const [editedManageName, setEditedManageName] = useState(null)
  const [isEditingName, setIsEditingName] = useState(false)
  const [managePurposeIcon, setManagePurposeIcon] = useState(null)

  // Auto-save functionality for manage modal
  const { isSaving: isManageSaving, lastSaved: lastManageSaved, clearSavedData: clearManageSavedData, markAsSubmitted: markManageSubmitted, updateFormData: updateManageData } = useAutoSave(
    `tpprover_manage_${manageName || 'default'}_draft`,
    manageRows,
    setManageRows,
    2000 // 2 second delay
  )
  const [showHistory, setShowHistory] = useState(false)
  const [deleteEntireStockArmed, setDeleteEntireStockArmed] = useState(false)
  const deleteEntireStockTimerRef = useRef(null)
  const [deleteRowArmedId, setDeleteRowArmedId] = useState(null)
  const deleteRowTimerRef = useRef(null)

  useEffect(() => {
    setDeleteEntireStockArmed(false)
    if (deleteEntireStockTimerRef.current) {
      clearTimeout(deleteEntireStockTimerRef.current)
      deleteEntireStockTimerRef.current = null
    }
  }, [manageName])

  useEffect(() => {
    return () => {
      if (deleteEntireStockTimerRef.current) clearTimeout(deleteEntireStockTimerRef.current)
    }
  }, [])

  const hasManageChanges = (() => {
    if (editedManageName !== manageName) return true
    if (manageRows.length !== manageRowsInitial.length) return true
    return JSON.stringify(manageRows) !== JSON.stringify(manageRowsInitial)
  })()

  const openManage = (peptideName) => {
    // Set name first to open modal immediately
    setManageName(peptideName)
    setEditedManageName(peptideName)
    setIsEditingName(false)
    // Load rows asynchronously to prevent blocking UI
    requestAnimationFrame(() => {
      // Special handling for "Unknown" category: match items with empty/null names OR explicitly named "Unknown"
      const matchesName = (itemName, targetName) => {
        const normalizedItemName = itemName || ''
        if (targetName === 'Unknown') {
          return normalizedItemName === '' || normalizedItemName === 'Unknown'
        }
        return normalizedItemName === targetName
      }
      const rows = ((items || []) || []).filter(i => matchesName(i.name, peptideName)).map(i => ({ ...i }))
      if (rows.length === 0) rows.push({ id: generateId(), name: peptideName, mg: '', quantity: '', unit: 'vial', cost: '', priceUnit: 'vial', vendor: '', vendorId: null, purity: '', capColor: '', batchNumber: '', documentation: [], mgUnit: 'mg' })
      // Auto category icon from compound name (same idea as protocol purpose icons)
      setManagePurposeIcon(inferPurposeIconFromCompound(peptideName) || 'research')
      setManageRows(rows)
      setManageRowsInitial(JSON.parse(JSON.stringify(rows)))
    })
  }

  // Keep manage icon in sync with the current / edited peptide name
  useEffect(() => {
    if (!manageName) return
    const nameForIcon = ((isEditingName ? editedManageName : manageName) || '').trim()
    if (!nameForIcon) return
    setManagePurposeIcon(inferPurposeIconFromCompound(nameForIcon) || 'research')
  }, [manageName, editedManageName, isEditingName])

  const handleManageRenameConfirm = async () => {
    const finalName = (editedManageName && editedManageName.trim()) ? editedManageName.trim() : manageName || 'Unknown'
    if (!finalName || finalName.trim().toLowerCase() === (manageName || '').trim().toLowerCase()) {
      setEditedManageName(manageName)
      setIsEditingName(false)
      return
    }

    const matchesNewName = (items || []).some(i => {
      const n = (i.name || '').trim()
      return n.toLowerCase() === finalName.toLowerCase() && n.toLowerCase() !== (manageName || '').toLowerCase()
    })
    if (matchesNewName) {
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: `A group named "${finalName}" already exists. Use Merge instead, or pick a different name.`, type: 'error' }
      }))
      return
    }

    const matchesManageName = (itemName) => {
      const normalizedItemName = itemName || ''
      if (manageName === 'Unknown') {
        return normalizedItemName === '' || normalizedItemName === 'Unknown'
      }
      return normalizedItemName === manageName
    }

    const nextIcon = inferPurposeIconFromCompound(finalName) || 'research'
    const updatedItems = (items || []).map(item => {
      if (!matchesManageName(item.name)) return item
      return prepareItemForSave({ ...item, name: finalName, purposeIcon: nextIcon }, { isNew: !item.createdAt })
    })

    setItems(updatedItems)
    setManageName(finalName)
    setEditedManageName(finalName)
    setManagePurposeIcon(nextIcon)
    setManageRows(prev => prev.map(row => ({ ...row, name: finalName, purposeIcon: nextIcon })))
    setManageRowsInitial(prev => prev.map(row => ({ ...row, name: finalName, purposeIcon: nextIcon })))
    setIsEditingName(false)

    try {
      localStorage.setItem('tpprover_stockpile', JSON.stringify(updatedItems))
    } catch (e) {
      console.error('Failed to save stockpile rename to localStorage:', e)
    }

    setIsSavingManage(true)
    try {
      appendStockEvent({ type: 'rename', name: finalName, previousName: manageName, source: 'manual' })
      if (firebaseUser) {
        const appData = {
          protocols: protocols || [],
          reconItems: reconItems || [],
          reconHistory: reconHistory || [],
          supplements: supplements || [],
          orders: orders || [],
          metrics: metrics || [],
          vendors: vendors || [],
          calendarNotes: calendarNotes || {},
          stockpile: updatedItems,
          scheduledBuys: scheduledBuys || []
        }
        const syncOk = await saveAppData(firebaseUser.uid, appData)
        if (!syncOk) {
          console.warn('Stockpile rename: cloud sync did not confirm; local data is saved, auto-sync will retry.')
        }
      }
    } catch (error) {
      console.error('Failed to sync stockpile rename:', error)
    } finally {
      setIsSavingManage(false)
    }
  }
  
  // Inline card rename + icon change (no modal required)
  const handleCardRenameConfirm = async (groupName, newName, newIconId) => {
    if (!groupName) return
    const finalName = (newName && newName.trim()) ? newName.trim() : groupName

    // Block if name conflicts with an existing different group
    const nameChanged = finalName.trim().toLowerCase() !== (groupName || '').trim().toLowerCase()
    if (nameChanged) {
      const conflict = (items || []).some(i => {
        const n = (i.name || '').trim()
        return n.toLowerCase() === finalName.toLowerCase() && n.toLowerCase() !== (groupName || '').trim().toLowerCase()
      })
      if (conflict) {
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: { message: `A group named "${finalName}" already exists. Use Merge instead, or pick a different name.`, type: 'error' }
        }))
        return
      }
    }

    const matchesGroup = (itemName) => {
      const n = itemName || ''
      if (groupName === 'Unknown') return n === '' || n === 'Unknown'
      return n === groupName
    }

    const updatedItems = (items || []).map(item => {
      if (!matchesGroup(item.name)) return item
      const patch = {}
      if (nameChanged) patch.name = finalName
      if (newIconId !== undefined && newIconId !== null) patch.purposeIcon = newIconId
      if (!Object.keys(patch).length) return item
      return prepareItemForSave({ ...item, ...patch }, { isNew: !item.createdAt })
    })

    setItems(updatedItems)
    try {
      localStorage.setItem('tpprover_stockpile', JSON.stringify(updatedItems))
    } catch (e) {
      console.error('Failed to save card rename to localStorage:', e)
    }

    try {
      if (nameChanged) {
        appendStockEvent({ type: 'rename', name: finalName, previousName: groupName, source: 'manual' })
      }
      if (firebaseUser) {
        const appData = {
          protocols: protocols || [],
          reconItems: reconItems || [],
          reconHistory: reconHistory || [],
          supplements: supplements || [],
          orders: orders || [],
          metrics: metrics || [],
          vendors: vendors || [],
          calendarNotes: calendarNotes || {},
          stockpile: updatedItems,
          scheduledBuys: scheduledBuys || []
        }
        await saveAppData(firebaseUser.uid, appData)
      }
    } catch (error) {
      console.error('Failed to sync card rename:', error)
    }

    window.dispatchEvent(new CustomEvent('tpp:toast', {
      detail: { message: 'Updated!', type: 'success' }
    }))
  }

  // Handle stockpile updates when orders change (e.g., delivered status)
  const handleStockpileUpdate = (previousOrder, newOrder) => {
    if (!newOrder) {
      console.log('⚠️ handleStockpileUpdate: newOrder is null/undefined, skipping');
      return;
    }

    const prevStatus = (previousOrder?.status || '').toLowerCase();
    const newStatus = (newOrder?.status || '').toLowerCase();
    
    const wasDelivered = prevStatus.includes('delivered');
    const isDelivered = newStatus.includes('delivered');

    // Check if shipping costs should be included
    const settings = JSON.parse(localStorage.getItem('tpprover_settings') || '{}');
    const includeShipping = settings.orders?.includeShippingInCosts ?? true;

    // If both orders are delivered, we need to update existing stockpile items
    if (wasDelivered && isDelivered && previousOrder && newOrder) {
      const orderIdPrefix = `orderitem-${newOrder.id}-`;
      
      // Remove old stockpile items for this order
      setItems(prev => prev.filter(stockItem => {
        const itemId = stockItem?.id;
        if (!itemId || typeof itemId !== 'string') return true;
        return !itemId.startsWith(orderIdPrefix);
      }));
      
      // Add updated stockpile items
      const orderCtx = { orderId: newOrder.id };
      const updatedStockItems = (newOrder.items || []).map(item => {
        const { quantity: orderQty } = getOrderItemOrderQuantity(item, orderCtx);
        const vialCount = getOrderItemVialCount(item, orderCtx);
        const price = Number(item.price) || 0;
        
        let costPerUnit;
        if (includeShipping) {
          const shippingCost = parseFloat(newOrder.shippingCost) || 0;
          const totalOrderCost = (newOrder.items || []).reduce((sum, orderItem) => {
            const orderItemPrice = parseFloat(orderItem.price) || 0;
            const { quantity: lineQty } = getOrderItemOrderQuantity(orderItem, orderCtx);
            return sum + (orderItemPrice * lineQty);
          }, 0) + shippingCost;
          const itemCostShare = totalOrderCost > 0 ? (price * orderQty) / (totalOrderCost - shippingCost) : 1;
          const itemShippingShare = shippingCost * itemCostShare;
          const totalItemCost = (price * orderQty) + itemShippingShare;
          costPerUnit = vialCount > 1 ? totalItemCost / vialCount : totalItemCost;
        } else {
          const perContainer = getUnitMultiplier(item.unit);
          costPerUnit = perContainer > 1 ? price / perContainer : price;
        }

        return {
          id: `orderitem-${newOrder.id}-${item.id}`,
          name: item.name || '',
          mg: item.mg || '',
          mgUnit: item.mgUnit || 'mg',
          quantity: vialCount,
          unit: 'vial',
          cost: costPerUnit,
          costPerMg: item.costPerMg || '',
          vendor: newOrder.vendor || '',
          vendorId: newOrder.vendorId,
          purchaseDate: newOrder.date,
          notes: `From order #${newOrder.publicOrderNumber ?? newOrder.id}`,
          orderId: newOrder.id
        };
      });
      setItems(prev => [...prev, ...updatedStockItems]);
      return;
    }

    // Status changed TO Delivered: Add items to stockpile.
    if (!wasDelivered && isDelivered) {
      if (!newOrder.items || newOrder.items.length === 0) {
        console.log('⚠️ handleStockpileUpdate: Order is delivered but has no items, skipping stockpile update');
        return;
      }

      const orderCtx = { orderId: newOrder.id };
      const newStockItems = (newOrder.items || []).map(item => {
        const { quantity: orderQty } = getOrderItemOrderQuantity(item, orderCtx);
        const vialCount = getOrderItemVialCount(item, orderCtx);
        const price = Number(item.price) || 0;
        
        let costPerUnit;
        if (includeShipping) {
          const shippingCost = parseFloat(newOrder.shippingCost) || 0;
          const totalOrderCost = (newOrder.items || []).reduce((sum, orderItem) => {
            const orderItemPrice = parseFloat(orderItem.price) || 0;
            const { quantity: lineQty } = getOrderItemOrderQuantity(orderItem, orderCtx);
            return sum + (orderItemPrice * lineQty);
          }, 0) + shippingCost;
          const itemCostShare = totalOrderCost > 0 ? (price * orderQty) / (totalOrderCost - shippingCost) : 1;
          const itemShippingShare = shippingCost * itemCostShare;
          const totalItemCost = (price * orderQty) + itemShippingShare;
          costPerUnit = vialCount > 1 ? totalItemCost / vialCount : totalItemCost;
        } else {
          const perContainer = getUnitMultiplier(item.unit);
          costPerUnit = perContainer > 1 ? price / perContainer : price;
        }

        return {
          id: `orderitem-${newOrder.id}-${item.id}`,
          name: item.name || '',
          mg: item.mg || '',
          mgUnit: item.mgUnit || 'mg',
          quantity: vialCount,
          unit: 'vial',
          cost: costPerUnit,
          costPerMg: item.costPerMg || '',
          vendor: newOrder.vendor || '',
          vendorId: newOrder.vendorId,
          purchaseDate: newOrder.date,
          notes: `From order #${newOrder.publicOrderNumber ?? newOrder.id}`,
          orderId: newOrder.id
        };
      });

      // Sync documentation from order to stockpile items
      const stockItemsWithDocs = syncOrderDocumentationToStockpile(newOrder, newStockItems);
      setItems(prev => [...prev, ...stockItemsWithDocs]);

      // Log creation events for each new stockpile item
      stockItemsWithDocs.forEach(item => {
        appendStockEvent({
          type: 'created',
          name: item.name,
          mg: item.mg,
          vendor: item.vendor,
          quantity: item.quantity,
          unit: item.unit || 'vial',
          source: 'order',
          orderId: newOrder.id
        });
      });
    } 
    // Status changed FROM Delivered: Remove items from stockpile.
    else if (wasDelivered && !isDelivered) {
      const orderIdPrefix = `orderitem-${previousOrder.id}-`;
      setItems(prev => prev.filter(stockItem => {
        const itemId = stockItem?.id;
        if (!itemId || typeof itemId !== 'string') return true;
        return !itemId.startsWith(orderIdPrefix);
      }));
    }
  };

  const handleEditIncoming = (peptideName) => {
    if (isReadOnly) {
      setShowUpgradeModal(true);
      return;
    }
    
    // Find all non-delivered orders that contain items with this peptide name
    const matchesName = (itemName, targetName) => {
      const normalizedItemName = itemName || ''
      if (targetName === 'Unknown') {
        return normalizedItemName === '' || normalizedItemName === 'Unknown'
      }
      return normalizedItemName === targetName
    }
    
    const relevantOrders = (orders || []).filter(o => {
      const status = (o.status || '').toLowerCase()
      if (status.includes('delivered')) return false
      
      // Check if any item in this order matches the peptide name
      return (o.items || []).some(item => matchesName(item.name, peptideName))
    })
    
    // Open modal with the first order (or show all if multiple)
    if (relevantOrders.length > 0) {
      // Open the first order in a modal
      setEditingOrder(relevantOrders[0]);
      setShowOrderModal(true);
    }
  }
  const addManageRow = () => {
    const newRowId = generateId();
    setManageRows(prev => ([...prev, { id: newRowId, name: manageName, mg: '', quantity: '', unit: 'vial', cost: '', priceUnit: 'vial', vendor: '', vendorId: null, purity: '', capColor: '', batchNumber: '', documentation: [], mgUnit: 'mg' }]));
    // Auto-expand the new row and scroll into view smoothly
    setTimeout(() => {
      setExpandedManageRows(prev => ({ ...prev, [newRowId]: true }));
      // Scroll to the new row after a brief delay to allow DOM update
      setTimeout(() => {
        const newRowElement = document.getElementById(`manage-row-${newRowId}`);
        if (newRowElement) {
          newRowElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }, 50);
  }
  const removeManageRow = (id) => setManageRows(prev => prev.filter(r => r.id !== id))
  
  const deleteManageRow = async (id) => {
    try {
      // Find the item to delete
      const itemToDelete = manageRows.find(r => r.id === id);
      if (!itemToDelete) return;

      // Record deletion with item snapshot for restore functionality
      recordDeletion('stockpile', itemToDelete.id, itemToDelete);

      // Log deletion event
      appendStockEvent({
        type: 'deleted',
        name: itemToDelete.name,
        mg: itemToDelete.mg,
        vendor: itemToDelete.vendorId ? (vendors.find(v => v.id === itemToDelete.vendorId)?.name || itemToDelete.vendor) : itemToDelete.vendor,
        quantity: itemToDelete.quantity,
        unit: itemToDelete.unit || 'vial',
        source: 'manual'
      });
      
      // Remove from manage rows
      setManageRows(prev => prev.filter(r => r.id !== id));
      
      // Delete the item from stockpile
      const updatedItems = items.filter(i => i.id !== id);
      setItems(updatedItems);
      
      // Sync to cloud
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
            stockpile: updatedItems,
            scheduledBuys: scheduledBuys || []
          };
          await saveAppData(userId, appData, { skipMerge: false });
        } catch (e) {
          console.error('Failed to sync deleted item to cloud:', e);
          window.dispatchEvent(new CustomEvent('tpp:toast', { 
            detail: { 
              message: 'Item deleted here, but couldn\'t update your other devices yet.', 
              type: 'warning' 
            } 
          }));
          return;
        }
      }
      
      // If no more rows, close the modal
      if (manageRows.length === 1) {
        setManageName(null);
        setManageRows([]);
      }
      
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { 
          message: 'Item deleted successfully', 
          type: 'success' 
        } 
      }));
    } catch (error) {
      console.error('Error deleting item:', error);
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { 
          message: 'Failed to delete item. Please try again.', 
          type: 'error' 
        } 
      }));
    }
  }

  const deleteEntireManageStock = async () => {
    if (isReadOnly) {
      setShowUpgradeModal(true)
      return
    }
    if (!manageName || isSavingManage) return

    if (!deleteEntireStockArmed) {
      setDeleteEntireStockArmed(true)
      if (deleteEntireStockTimerRef.current) clearTimeout(deleteEntireStockTimerRef.current)
      deleteEntireStockTimerRef.current = setTimeout(() => {
        setDeleteEntireStockArmed(false)
        deleteEntireStockTimerRef.current = null
      }, 3000)
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Tap Delete Entire Stock again to confirm.', type: 'warning' }
      }))
      return
    }

    if (deleteEntireStockTimerRef.current) {
      clearTimeout(deleteEntireStockTimerRef.current)
      deleteEntireStockTimerRef.current = null
    }
    setDeleteEntireStockArmed(false)

    const matchesManageName = (itemName) => {
      const normalizedItemName = itemName || ''
      if (manageName === 'Unknown') {
        return normalizedItemName === '' || normalizedItemName === 'Unknown'
      }
      return normalizedItemName === manageName
    }

    const groupItems = (items || []).filter(i => matchesManageName(i.name))
    if (groupItems.length === 0) {
      setManageName(null)
      setManageRows([])
      setManageRowsInitial([])
      clearManageSavedData()
      return
    }

    try {
      groupItems.forEach(item => {
        if (item.id) recordDeletion('stockpile', item.id, item)
        appendStockEvent({
          type: 'deleted',
          name: item.name || manageName,
          mg: item.mg,
          vendor: item.vendorId ? (vendors.find(v => v.id === item.vendorId)?.name || item.vendor) : item.vendor,
          quantity: item.quantity,
          unit: item.unit || 'vial',
          source: 'manual'
        })
      })

      const updatedItems = (items || []).filter(i => !matchesManageName(i.name))
      setItems(updatedItems)
      try {
        localStorage.setItem('tpprover_stockpile', JSON.stringify(updatedItems))
      } catch (e) {
        console.error('Failed to save stockpile deletion to localStorage:', e)
      }

      setIsSavingManage(true)
      try {
        if (firebaseUser) {
          const appData = {
            protocols: protocols || [],
            reconItems: reconItems || [],
            reconHistory: reconHistory || [],
            supplements: supplements || [],
            orders: orders || [],
            metrics: metrics || [],
            vendors: vendors || [],
            calendarNotes: calendarNotes || {},
            stockpile: updatedItems,
            scheduledBuys: scheduledBuys || []
          }
          const syncOk = await saveAppData(firebaseUser.uid, appData, { skipMerge: false })
          if (!syncOk) {
            console.warn('Stockpile group delete: cloud sync did not confirm; local data is saved, auto-sync will retry.')
          }
        }
      } catch (error) {
        console.error('Failed to sync stockpile group deletion:', error)
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: {
            message: 'Stock deleted here, but could not update your other devices yet.',
            type: 'warning'
          }
        }))
      } finally {
        setIsSavingManage(false)
      }

      markManageSubmitted()
      setManageName(null)
      setManageRows([])
      setManageRowsInitial([])
      setShowHistory(false)
      setEditedManageName(null)
      setIsEditingName(false)
      clearManageSavedData()

      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: {
          message: groupItems.length === 1 ? 'Stock item deleted.' : `${groupItems.length} stock entries deleted.`,
          type: 'success'
        }
      }))
    } catch (error) {
      console.error('Error deleting stock group:', error)
      setIsSavingManage(false)
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Failed to delete stock. Please try again.', type: 'error' }
      }))
    }
  }
  
  // Merge functionality handlers
  const handleMergeRequest = (duplicateGroup, mainGroup) => {
    setMergeData({ source: duplicateGroup, target: mainGroup })
    setShowMergeModal(true)
  }

  const handleSelectMergeGroup = (sourceGroup, targetGroup) => {
    setMergeData({ source: sourceGroup, target: targetGroup })
    setShowMergeModal(true)
    setShowMergeSelectionModal(false)
    setMergeSourceGroup(null)
  }

  // Handle merging individual item from Unknown category
  const handleMergeIndividualItem = (item) => {
    setMergeSourceItem(item)
    setShowMergeSelectionModal(true)
  }

  const handleSelectGroupForItem = (targetGroup) => {
    if (!mergeSourceItem) return
    // Create a temporary group structure for the single item
    const tempSourceGroup = {
      name: mergeSourceItem.name || 'Unknown',
      groupKey: `temp-${mergeSourceItem.id}`,
      totalVials: Number(mergeSourceItem.quantity) || 0,
      totalMg: (Number(mergeSourceItem.quantity) || 0) * (Number(mergeSourceItem.mg) || 0),
      unit: mergeSourceItem.mgUnit || 'mg',
      variants: {
        [`${mergeSourceItem.mg || ''}__${mergeSourceItem.mgUnit || 'mg'}`]: {
          items: [mergeSourceItem]
        }
      }
    }
    setMergeData({ source: tempSourceGroup, target: targetGroup })
    setShowMergeModal(true)
    setShowMergeSelectionModal(false)
    setMergeSourceItem(null)
  }

  const handleConfirmMerge = async (mergeConfig) => {
    const { sourceItems, targetItems, mergedName, mergedUnit } = mergeConfig

    try {
      // Update all items to use the new merged name and unit
      // This includes BOTH source and target items
      const updatedItems = items.map(item => {
        // Check if this item belongs to the source group
        const isSourceItem = sourceItems.some(sourceItem => sourceItem.id === item.id)
        // Check if this item belongs to the target group
        const isTargetItem = targetItems.some(targetItem => targetItem.id === item.id)
        
        if (isSourceItem || isTargetItem) {
          // CRITICAL: Use prepareItemForSave to apply serverTimestamp for proper conflict resolution
          return prepareItemForSave({
            ...item,
            name: mergedName,
            mgUnit: mergedUnit
          });
        }
        return item
      })

      setItems(updatedItems)
      
      // CRITICAL: Immediately sync to cloud to prevent server data from overwriting merge
      // Save to localStorage immediately for persistence
      try {
        localStorage.setItem('tpprover_stockpile', JSON.stringify(updatedItems))
      } catch (e) {
        console.error('Failed to save merged items to localStorage:', e)
      }
      
      // CRITICAL: Force immediate cloud sync with skipMerge to overwrite server data
      // This prevents the real-time listener from reloading old data and overwriting the merge
      if (firebaseUser) {
        try {
          const userId = firebaseUser.uid;
          // Get all app data to sync (needed for saveAppData)
          const appData = {
            protocols: protocols || [],
            reconItems: reconItems || [],
            reconHistory: reconHistory || [],
            supplements: supplements || [],
            orders: orders || [],
            metrics: metrics || [],
            vendors: vendors || [],
            calendarNotes: calendarNotes || {},
            stockpile: updatedItems, // Use merged items
            scheduledBuys: scheduledBuys || []
          };
          
          // Sync merged items with timestamp-based conflict resolution
          // This ensures merged items persist correctly across devices
          await saveAppData(userId, appData, { skipMerge: false });
          console.log('✅ Merged items synced to cloud immediately');
        } catch (e) {
          console.error('Failed to sync merged items to cloud:', e);
          // Don't throw - the auto-sync will handle it
        }
      }
      
      // Log the merge event
      appendStockEvent({
        type: 'merge',
        name: `${mergeConfig.sourceGroup.name} + ${mergeConfig.targetGroup.name} → ${mergedName}`,
        details: `Combined ${sourceItems.length + targetItems.length} peptide entries into single inventory`,
        source: 'manual'
      })

      // Show success toast
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { 
          message: `Merge of ${mergedName} completed!`, 
          type: 'success' 
        } 
      }))

      // Close modal and exit drag mode
      setShowMergeModal(false)
      setMergeData({ source: null, target: null })
      setIsDragMode(false)
      
      // If merging from manage modal (individual item), remove it from manageRows
      if (mergeSourceItem) {
        setManageRows(prev => {
          const remaining = prev.filter(r => r.id !== mergeSourceItem.id)
          // If no more rows, close the manage modal
          if (remaining.length === 0) {
            setTimeout(() => {
              setManageName(null)
              setManageRows([])
            }, 100)
          }
          return remaining
        })
        setMergeSourceItem(null)
      }
      
      // Also dismiss this duplicate pair so it doesn't show again
      const duplicateKey = `${mergeConfig.sourceGroup.groupKey}-${mergeConfig.targetGroup.groupKey}`;
      const newDismissed = new Set([...dismissedDuplicates, duplicateKey]);
      setDismissedDuplicates(newDismissed);
      try {
        localStorage.setItem('tpprover_dismissed_duplicates', JSON.stringify(Array.from(newDismissed)));
      } catch (e) {
        console.error('Failed to save dismissed duplicates:', e);
      }
      
    } catch (error) {
      console.error('Failed to merge groups:', error)
      window.dispatchEvent(new CustomEvent('tpp:toast', { 
        detail: { 
          message: `Failed to merge items. Please try again.`, 
          type: 'error' 
        } 
      }))
    }
  }

  const handleToggleDragMode = (enabled) => {
    setIsDragMode(enabled)
    if (!enabled) {
      // Reset any pending merge data when exiting drag mode
      setMergeData({ source: null, target: null })
    }
  }

  // Duplicate detection handlers
  const handleDismissDuplicate = (duplicate) => {
    const key = `${duplicate.group1.groupKey}-${duplicate.group2.groupKey}`;
    const newDismissed = new Set([...dismissedDuplicates, key]);
    setDismissedDuplicates(newDismissed);
    // Persist to localStorage
    try {
      localStorage.setItem('tpprover_dismissed_duplicates', JSON.stringify(Array.from(newDismissed)));
    } catch (e) {
      console.error('Failed to save dismissed duplicates:', e);
    }
  }

  // Global FAB: ?add=true in URL or tpp:fab-add-stockpile event opens add modal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('add') === 'true') {
      handleAddClick();
      window.history.replaceState({}, '', window.location.pathname);
    }
    const onFabAdd = () => handleAddClick();
    window.addEventListener('tpp:fab-add-stockpile', onFabAdd);
    return () => window.removeEventListener('tpp:fab-add-stockpile', onFabAdd);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Set topbar tabs via custom event
  useEffect(() => {
    const tabs = [
      { value: 'onhand', label: 'Peptides' },
      { value: 'supplies', label: 'Supplies' },
      { value: 'incoming', label: 'Incoming' }
    ];
    
    
    const addLimitCheck = (fn) => () => {
      if (isReadOnly) { setUpgradeLimitContext(null); setShowUpgradeModal(true); return; }
      if (!canAddStockpileItem) { setUpgradeLimitContext({ feature: 'stockpile', current: caps.stockpileCount, max: caps.maxStockpileItems }); setShowUpgradeModal(true); return; }
      fn();
    };
    window.dispatchEvent(new CustomEvent('tpp:set-topbar-tabs', { 
      detail: { 
        tabs, 
        activeTab, 
        onTabChange: setActiveTab,
        actionItems: [
          { label: 'Add Peptide',  Icon: PlusCircle,     onClick: addLimitCheck(() => { setOpenAddWithScan(false); setOpenAdd(true); }) },
          { label: 'Add Supplies', Icon: PhPackage,      onClick: () => setShowAddSupply(true) },
          { label: 'Scan Label',   Icon: Scan,           onClick: addLimitCheck(() => { setOpenAddWithScan(true); setOpenAdd(true); }) },
          { label: 'Bulk Import',  Icon: UploadSimple,   onClick: addLimitCheck(() => setShowBulkImport(true)) },
          { label: 'Add Order',    Icon: PhShoppingCart, onClick: () => { window.history.pushState({}, '', '/app/orders?new=true'); window.dispatchEvent(new PopStateEvent('popstate')); } },
        ],
        actionDisabled: isReadOnly,
      } 
    }));
    
    // Listen for topbar search events for page-specific search
    const handleSearch = (e) => {
      setSearchQuery(e.detail.query);
    };
    window.addEventListener('tpp:stockpile-search', handleSearch);
    
    return () => {
      window.dispatchEvent(new CustomEvent('tpp:clear-topbar-tabs'));
      window.removeEventListener('tpp:stockpile-search', handleSearch);
    };
  }, [activeTab, isReadOnly, canAddStockpileItem, caps])
  const saveManage = async () => {
    // Rename is handled separately via the title checkmark (handleManageRenameConfirm).
    // Save Changes only saves vial data — always use the committed manageName.
    const finalName = manageName || 'Unknown';

    // Convert any convertible units (e.g. kit→vial ×10) back to base unit for storage
    const convertedRows = manageRows.map(row => {
      if (isConvertibleUnit(row.unit)) {
        const { quantity, unit } = convertForStorage(row.quantity, row.unit);
        return { ...row, quantity: String(quantity), unit };
      }
      return row;
    });

    // Auto-create any new vendors that were typed in
    convertedRows.forEach(row => {
        if (row.vendor && !vendors.some(v => v.name.toLowerCase() === row.vendor.toLowerCase())) {
            addVendor({ name: row.vendor, isStub: true });
        }
    });

    // Keep rows that have name or any other data (draft can lose name, so don't require it for filter)
    const cleaned = convertedRows.filter(r =>
      (r.name != null && String(r.name).trim() !== '') ||
      (String(r.mg || '').trim() !== '') ||
      (String(r.quantity || '').trim() !== '') ||
      (r.vendor != null && String(r.vendor).trim() !== '')
    );
    // Ensure every saved row has name = finalName (supports rename) and carries the chosen purposeIcon
    const cleanedWithName = cleaned.map(r => ({ ...r, name: finalName, purposeIcon: managePurposeIcon || r.purposeIcon || null }));
    
    // Special handling for "Unknown" category: match items with empty/null names OR explicitly named "Unknown"
    const matchesManageName = (itemName) => {
      const normalizedItemName = itemName || ''
      if (manageName === 'Unknown') {
        return normalizedItemName === '' || normalizedItemName === 'Unknown'
      }
      return normalizedItemName === manageName
    }
    
    const others = (items || []).filter(i => !matchesManageName(i.name))
    
    // Track deleted items for logging (compare by id/mg/vendor to before)
    const before = (items || []).filter(i => matchesManageName(i.name))
    const deletedItems = before.filter(b => {
      const afterMatch = cleanedWithName.find(a => (a.id && a.id === b.id) || (String(a.mg) === String(b.mg) && (a.vendorId ? a.vendorId === b.vendorId : (a.vendor||'') === (b.vendor||''))))
      return !afterMatch
    })
    
    if (deletedItems.length > 0) {
      console.log('🗑️ Deleting stockpile items:', deletedItems.map(i => `${i.name} ${i.mg}mg from ${i.vendorId ? vendorMap[i.vendorId] : i.vendor}`).join(', '))
      // Record deletions for cross-device sync
      deletedItems.forEach(item => {
        if (item.id) {
          recordDeletion('stockpile', item.id, item);
        }
      });
    }
    
    // Add/update timestamps for modified items using prepareItemForSave
    // Editing quantities also clears any welcome-back reconfirm flag
    const cleanedWithTimestamps = cleanedWithName.map(item => {
      const isNew = !item.createdAt;
      return prepareItemForSave(
        { ...item, createdAt: item.createdAt || new Date().toISOString(), needsReconfirm: false },
        { isNew }
      );
    });
    
    // Append history snapshots and usage markers
    try {
      const after = cleanedWithTimestamps
      // out-of-stock events
      before.forEach(b => {
        const afterMatch = after.find(a => String(a.mg) === String(b.mg) && (a.vendorId ? a.vendorId === b.vendorId : (a.vendor||'') === (b.vendor||'')))
        const prevQty = Number(b.quantity)||0
        const nextQty = Number(afterMatch?.quantity)||0
        if (prevQty > 0 && nextQty === 0) {
          appendStockEvent({ type: 'out_of_stock', name: finalName, mg: b.mg, vendor: b.vendorId ? vendorMap[b.vendorId] : b.vendor, prevQty, source: 'manual' })
        }
      })
      // rename event
      if (finalName !== manageName) {
        appendStockEvent({ type: 'rename', name: finalName, previousName: manageName, source: 'manual' })
      }
      // quantity changes
      after.forEach(a => {
        const beforeMatch = before.find(b => String(b.mg) === String(a.mg) && (b.vendorId ? b.vendorId === a.vendorId : (b.vendor||'') === (a.vendor||'')))
        const prevQty = Number(beforeMatch?.quantity)||0
        const nextQty = Number(a.quantity)||0
        if (nextQty !== prevQty) {
          appendStockEvent({ type: 'adjust', name: finalName, mg: a.mg, vendor: a.vendorId ? vendorMap[a.vendorId] : a.vendor, prevQty, nextQty, source: 'manual' })
        }
      })
      // documentation changes
      after.forEach(a => {
        const beforeMatch = before.find(b => (b.id && b.id === a.id) || (String(b.mg) === String(a.mg) && (b.vendorId ? b.vendorId === a.vendorId : (b.vendor||'') === (a.vendor||''))))
        const prevDocCount = (beforeMatch?.documentation || []).length
        const nextDocCount = (a.documentation || []).length
        if (nextDocCount > prevDocCount) {
          appendStockEvent({ type: 'documentation_added', name: finalName, mg: a.mg, vendor: a.vendorId ? vendorMap[a.vendorId] : a.vendor, docsAdded: nextDocCount - prevDocCount, source: 'manual' })
        }
      })
    } catch {}
    
    const updatedItems = [...cleanedWithTimestamps, ...others]
    setItems(updatedItems)
    try {
      localStorage.setItem('tpprover_stockpile', JSON.stringify(updatedItems));
    } catch (e) {
      console.error('Failed to save stockpile to localStorage:', e);
    }
    
    setIsSavingManage(true)
    try {
      // Sync to cloud when logged in. Use normal path (no skipMerge) so timestamp-based merge
      // applies and we don't overwrite other data; our updatedItems have updatedAt: now so they win.
      if (firebaseUser) {
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
          stockpile: updatedItems,
          scheduledBuys: scheduledBuys || []
        };
        const syncOk = await saveAppData(userId, appData);
        if (!syncOk) {
          console.warn('Stockpile save: cloud sync did not confirm; local data is saved, auto-sync will retry.');
        }
      }
      markManageSubmitted();
      setManageName(null);
      setManageRows([]);
      setManageRowsInitial([]);
      setEditedManageName(null);
      setIsEditingName(false);
    } catch (error) {
      console.error('❌ Error syncing stockpile to cloud:', error);
      // Don't show "could not save" — data is saved locally; sync failure is on our side, auto-sync will retry.
      markManageSubmitted();
      setManageName(null);
      setManageRows([]);
      setManageRowsInitial([]);
      setEditedManageName(null);
      setIsEditingName(false);
    } finally {
      setIsSavingManage(false);
    }
  }

  const importCSV = async (file) => {
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(Boolean)
      if (lines.length === 0) return
      const header = lines[0].split(',').map(h => h.trim().toLowerCase())
      const idx = (k) => header.indexOf(k)
      const next = [...(items || [])]
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',')
        const row = prepareItemForSave({
          id: generateId(),
          name: cols[idx('name')] || '',
          mg: cols[idx('mg')] || '',
          quantity: cols[idx('quantity')] || '',
          vendor: cols[idx('vendor')] || '',
          capColor: cols[idx('capcolor')] || cols[idx('cap_color')] || '',
          batchNumber: cols[idx('batchnumber')] || cols[idx('batch_#')] || cols[idx('batch')] || '',
          minQty: cols[idx('minqty')] || cols[idx('min_qty')] || '1',
        }, { isNew: true })
        next.unshift(row)
      }
      setItems(next)
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'Stockpile CSV imported', type: 'success' } }))
    } catch (e) {
      window.dispatchEvent(new CustomEvent('tpp:toast', { detail: { message: 'CSV import failed', type: 'error' } }))
    }
  }

  // Handle "Add to Stockpile" button click - show dropdown menu
  const handleAddClick = useCallback(() => {
    if (isReadOnly) {
      setUpgradeLimitContext(null);
      setShowUpgradeModal(true);
      return;
    }
    if (!canAddStockpileItem) {
      setUpgradeLimitContext({ feature: 'stockpile', current: caps.stockpileCount, max: caps.maxStockpileItems });
      setShowUpgradeModal(true);
      return;
    }
    setOpenAddWithScan(false);
    setOpenAdd(true);
  }, [isReadOnly, canAddStockpileItem, caps]);

  return (
    <section className="page-bg space-y-4 pt-4 px-2 sm:px-4 md:px-6 lg:px-8">
      <StockpileTipsBanner theme={theme} />

      {/* ── Free-plan over-limit banner (On Hand tab only — supplies are uncapped) */}
      {activeTab === 'onhand' && caps.enforced && caps.maxStockpileItems !== null && caps.stockpileCount > caps.maxStockpileItems && (
        <div
          className="rounded-2xl px-4 py-3.5"
          style={{
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
            border: `1px solid ${theme.border}`,
            boxShadow: theme.isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Lock size={12} style={{ color: theme.textLight }} />
                <p className="text-sm font-semibold" style={{ color: theme.text }}>
                  {caps.stockpileCount} / {caps.maxStockpileItems} active slots used
                </p>
              </div>
              <p className="text-xs" style={{ color: theme.textLight }}>
                {caps.stockpileCount - caps.maxStockpileItems} entr{caps.stockpileCount - caps.maxStockpileItems === 1 ? 'y' : 'ies'} held — your data is always yours
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => exportToCSV(
                  (items || [])
                    .filter(i => !i.archived && !i.deleted && i.type !== 'supply')
                    .map(i => ({
                      name: i.name || '',
                      mg: i.mg || '',
                      unit: i.mgUnit || 'mg',
                      quantity: i.quantity || '',
                      vendor: i.vendor || '',
                      purity: i.purity || '',
                      cost: i.cost || '',
                      batch: i.batchNumber || '',
                      date: i.date || '',
                      status: i.heldByFreePlan ? 'held' : 'active',
                    })),
                  'stockpile-export.csv'
                )}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 active:scale-95"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                  border: `1px solid ${theme.border}`,
                  color: theme.textLight,
                }}
              >
                <Download size={12} />
                Export All
              </button>
              <button
                type="button"
                onClick={() => setShowUpgradeModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:opacity-90 active:scale-95"
                style={{
                  backgroundColor: theme.primary,
                  color: theme.textOnPrimary || '#fff',
                }}
              >
                Upgrade
                <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Unified Add Menu */}
      
      <div className="space-y-6">
        {/* On Hand Tab */}
        {activeTab === 'onhand' && (
          <div className="min-w-0 overflow-x-hidden w-full">
            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
                  <TestTube size={32} style={{ color: theme.primary }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>Hm? Stockpile seems empty.</h3>
                <p className="text-sm mb-6 max-w-md" style={{ color: theme.textLight }}>
                  Add peptides to track quantities, link to protocols, and manage reconstitution.
                </p>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setOpenAdd(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors touch-manipulation"
                    style={{
                      color: theme.primary,
                      backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}15`,
                      border: `1px solid ${theme.primary}40`,
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    Add What You Have!
                    <ChevronDown size={14} />
                  </button>
                )}
              </div>
            ) : (
              <div>
            
            {/* Filter and Search */}
            <div className="mb-3">
              <div className="flex items-center gap-3 flex-wrap">
                {/* Stock Status Filter - Dropdown */}
                <div className="flex-1 min-w-0">
                  <CustomDropdown
                    value={stockpileFilter}
                    onChange={setStockpileFilter}
                    options={[
                      { 
                        value: 'view all', 
                        label: `View All (${filterCounts.all})`,
                        icon: <Package size={16} style={{ color: theme.textLight }} />
                      },
                      { 
                        value: 'low', 
                        label: `Low (${filterCounts.low})`,
                        icon: <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                      },
                      { 
                        value: 'well stocked', 
                        label: `Well Stocked (${filterCounts.wellStocked})`,
                        icon: <Package size={16} style={{ color: theme.primary }} />
                      },
                      { 
                        value: 'out of stock', 
                        label: `Out of Stock (${filterCounts.outOfStock})`,
                        icon: <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                      }
                    ]}
                    theme={theme}
                    placeholder="Filter stockpile..."
                    outlined={true}
                    customShadow={true}
                  />
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Search Input - Inline with Dropdown */}
                  <div 
                    className="relative overflow-hidden transition-all duration-300 ease-in-out flex-shrink-0"
                    style={{ 
                      width: showStockpileSearch ? '200px' : '48px',
                      minWidth: showStockpileSearch ? '200px' : '48px',
                      maxWidth: showStockpileSearch ? '200px' : '48px'
                    }}
                  >
                  {showStockpileSearch ? (
                    <div className={`relative ${isClosingSearch ? 'animate-slide-out' : 'animate-slide-in'}`}>
                      <input
                        type="text"
                        value={stockpileSearchQuery}
                        onChange={(e) => setStockpileSearchQuery(e.target.value)}
                        placeholder="Search..."
                        autoFocus
                        className="w-full px-4 py-3.5 pr-10 text-sm border rounded-xl transition-all"
                        style={{
                          borderColor: theme.border,
                          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : (theme?.cardBackground || '#fff'),
                          color: theme.isDark ? theme.text : '#181A18',
                          boxShadow: theme.isDark ? '0 2px 8px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.1)',
                          width: '100%',
                          maxWidth: '200px'
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setIsClosingSearch(true)
                            setTimeout(() => {
                              setShowStockpileSearch(false)
                              setStockpileSearchQuery('')
                              setIsClosingSearch(false)
                            }, 300)
                          }
                        }}
                        onBlur={(e) => {
                          // Don't close if clicking on the close button
                          if (!e.currentTarget.parentElement.contains(e.relatedTarget)) {
                            // Only close if search is empty
                            if (!stockpileSearchQuery.trim()) {
                              setIsClosingSearch(true)
                              setTimeout(() => {
                                setShowStockpileSearch(false)
                                setIsClosingSearch(false)
                              }, 300)
                            }
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setStockpileSearchQuery('')
                          setIsClosingSearch(true)
                          setTimeout(() => {
                            setShowStockpileSearch(false)
                            setIsClosingSearch(false)
                          }, 300)
                        }}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 rounded transition-colors"
                        style={{
                          color: theme.textLight
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent'
                        }}
                      >
                        <X size={18} strokeWidth={2} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setShowStockpileSearch(true)
                      }}
                      className="p-2.5 rounded-lg transition-all hover:scale-105 active:scale-95"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                        border: `1px solid ${theme.border}`,
                        color: theme.text,
                        WebkitTapHighlightColor: 'transparent'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'
                      }}
                      title="Search stockpile"
                    >
                      <Search size={18} strokeWidth={2} />
                    </button>
                  )}
                </div>

                  <button
                    type="button"
                    onClick={() => {
                      const nextMode = stockpileLayoutMode === 'columns' ? 'stacked' : 'columns'
                      setStockpileLayoutMode(nextMode)
                      try {
                        localStorage.setItem('tpprover_stockpile_layout', nextMode)
                      } catch (e) {
                        console.warn('Failed to save stockpile layout preference:', e)
                      }
                    }}
                    className="w-10 h-10 rounded-lg transition-colors hover:opacity-85 active:opacity-70 flex-shrink-0 flex items-center justify-center"
                    style={{
                      backgroundColor: stockpileLayoutMode === 'stacked'
                        ? (theme.isDark ? `${theme.primary}24` : `${theme.primary}16`)
                        : (theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)'),
                      border: `1px solid ${stockpileLayoutMode === 'stacked' ? `${theme.primary}55` : theme.border}`,
                      color: stockpileLayoutMode === 'stacked' ? theme.primary : theme.text,
                      WebkitTapHighlightColor: 'transparent'
                    }}
                    title={stockpileLayoutMode === 'columns' ? 'Switch to stacked cards' : 'Switch to two columns'}
                    aria-label={stockpileLayoutMode === 'columns' ? 'Switch stockpile to stacked cards' : 'Switch stockpile to two columns'}
                  >
                    {stockpileLayoutMode === 'columns' ? (
                      <Rows size={28} weight="bold" />
                    ) : (
                      <SquaresFour size={28} weight="bold" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            
            {/* Duplicate Detection */}
            <DuplicateDetection
              groups={filteredGroups.filter(g => g.totalVials > 0)}
              theme={theme}
              onMergeRequest={handleMergeRequest}
              onDismissSuggestion={handleDismissDuplicate}
              dismissedDuplicates={dismissedDuplicates}
            />
            
            <div className={`${stockpileLayoutMode === 'stacked' ? 'grid grid-cols-1' : 'grid grid-cols-2'} gap-3 pb-10`}>
              {activeStockpileColumns.map((columnGroups, columnIndex) => (
                <div key={`stockpile-column-${columnIndex}`} className="space-y-3">
                {columnGroups.map(g => {
                    // Check if this is an "Unknown" group (only truly empty/null names, not the string "Unknown")
                    const isUnknownGroup = (!g.name || g.name.trim() === '');
                    
                    return (
                      <div key={g.name}>
                      <StockpileGroupCard
                        key={g.name}
                        group={g}
                        hasMatchingIncoming={incomingGroupKeys.has(`${String(g.name || '').trim().toLowerCase()}__${(g.unit || 'mg').toLowerCase()}`) || incomingGroupNames.has(String(g.name || '').trim().toLowerCase())}
                        theme={theme}
                        layoutMode={stockpileLayoutMode}
                        isUnknownGroup={isUnknownGroup}
                        vendorMap={vendorMap}
                        isReadOnly={isReadOnly}
                        onCardClick={() => {
                          if (isReadOnly) {
                            setShowUpgradeModal(true);
                            return;
                          }
                          // Open manage directly (combined view + edit: total stock on top, chevron to expand/edit each vial)
                          openManage(g.name);
                        }}
                        onRenameConfirm={(groupName, newName, newIconId) => {
                          if (isReadOnly) { setShowUpgradeModal(true); return; }
                          handleCardRenameConfirm(groupName, newName, newIconId);
                        }}
                        onConfirmLooksRight={(group) => {
                          if (isReadOnly) { setShowUpgradeModal(true); return; }
                          const ids = new Set(
                            Object.values(group.variants || {})
                              .flatMap((v) => v.items || [])
                              .filter((i) => i?.needsReconfirm)
                              .map((i) => i.id)
                          );
                          if (ids.size === 0) return;
                          setItems((prev) =>
                            prev.map((item) =>
                              ids.has(item.id)
                                ? prepareItemForSave({ ...item, needsReconfirm: false })
                                : item
                            )
                          );
                          window.dispatchEvent(new CustomEvent('tpp:toast', {
                            detail: { message: 'Quantity confirmed', type: 'success' },
                          }));
                        }}
                        onViewDetails={() => {
                          if (isReadOnly) {
                            setShowUpgradeModal(true);
                            return;
                          }
                          openManage(g.name);
                        }}
                        onMergeIndividualItem={handleMergeIndividualItem}
                        onDeleteItem={async (item) => {
                          try {
                            // Record deletion with item snapshot for restore functionality
                            recordDeletion('stockpile', item.id, item);
                            
                            // Delete the item directly
                            const updatedItems = items.filter(i => i.id !== item.id);
                            setItems(updatedItems);
                            
                            // Sync to cloud
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
                                  stockpile: updatedItems,
                                  scheduledBuys: scheduledBuys || []
                                };
                                await saveAppData(userId, appData, { skipMerge: false });
                              } catch (e) {
                                console.error('Failed to sync deleted item to cloud:', e);
                                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                                  detail: { 
                                    message: 'Item deleted here, but couldn\'t update your other devices yet.', 
                                    type: 'warning' 
                                  } 
                                }));
                                return;
                              }
                            }
                            
                            window.dispatchEvent(new CustomEvent('tpp:toast', { 
                              detail: { 
                                message: 'Item deleted successfully', 
                                type: 'success' 
                              } 
                            }));
                          } catch (error) {
                            console.error('Error deleting item:', error);
                            window.dispatchEvent(new CustomEvent('tpp:toast', { 
                              detail: { 
                                message: 'Failed to delete item. Please try again.', 
                                type: 'error' 
                              } 
                            }));
                          }
                        }}
                        onViewOrder={(orderId) => {
                          navigate(`/app/orders`, { state: { openOrderId: orderId } });
                        }}
                        onSendToRecon={(item, group) => {
                          try {
                            const payload = { 
                              peptide: group.name, 
                              mg: String(item.mg), 
                              mgUnit: item.mgUnit || 'mg',
                              vendor: item.vendorId ? (vendorMap[item.vendorId] || item.vendor) : item.vendor, 
                              vendorId: item.vendorId || null,
                              cost: item.cost || '',
                              costPerMg: item.costPerMg || '',
                              priceUnit: item.priceUnit || 'vial',
                              stockpileId: item.id,
                              orderId: item.orderId || null,
                              quantity: item.quantity,
                              unit: item.unit,
                              quantityUsed: 1,
                              documentation: item.documentation || []
                            };
                            
                            // Save prefill data to localStorage
                            try {
                              localStorage.setItem('tpprover_recon_prefill', JSON.stringify(payload));
                            } catch (storageError) {
                              console.error('❌ Failed to save prefill data:', storageError);
                              window.dispatchEvent(new CustomEvent('tpp:toast', { 
                                detail: { 
                                  message: 'Failed to save data. Please try again.', 
                                  type: 'error' 
                                } 
                              }));
                              return;
                            }
                            
                            // Navigate to recon page with a small delay to ensure localStorage is set
                            // Use requestAnimationFrame to ensure DOM is ready
                            requestAnimationFrame(() => {
                              try {
                                navigate('/app/recon');
                              } catch (navError) {
                                console.error('❌ Navigation error:', navError);
                                // Fallback: use window.location if navigate fails
                                window.location.href = '/app/recon';
                              }
                            });
                          } catch (error) {
                            console.error('❌ Error preparing recon data:', error);
                            window.dispatchEvent(new CustomEvent('tpp:toast', { 
                              detail: { 
                                message: 'Failed to open reconstitution calculator. Please try again.', 
                                type: 'error' 
                              } 
                            }));
                            // Still try to navigate as fallback
                            setTimeout(() => {
                              try {
                                navigate('/app/recon');
                              } catch {
                                window.location.href = '/app/recon';
                              }
                            }, 100);
                          }
                        }}
                        onPreviewImage={setPreviewImage}
                        onCompleteEntry={(item) => {
                          // Pre-fill form with item data and open add modal
                          setForm({
                            name: '',
                            mg: item.mg || '',
                            quantity: item.quantity || '',
                            vendor: item.vendor || '',
                            vendorId: item.vendorId || null,
                            purity: item.purity || '',
                            capColor: item.capColor || '',
                            batchNumber: item.batchNumber || '',
                            date: item.date || '',
                            cost: item.cost || '',
                            priceUnit: item.priceUnit || 'vial',
                            documentation: item.documentation || [],
                            mgUnit: item.mgUnit || 'mg',
                            unit: item.unit || 'vial'
                          });
                          setOpenAdd(true);
                          // Delete the incomplete item after opening form
                          const updatedItems = items.filter(i => i.id !== item.id);
                          setItems(updatedItems);
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
                              stockpile: updatedItems,
                              scheduledBuys: scheduledBuys || []
                            };
                            saveAppData(userId, appData, { skipMerge: false });
                            } catch (e) {
                              console.error('Failed to sync to cloud:', e);
                            }
                          }
                        }}
                      />
                      </div>
                    );
                })}
                </div>
              ))}
            </div>

            {/* ── Held by Free Plan section ────────────────────────────── */}
            {caps.enforced && heldGroups.length > 0 && (
              <div
                className="mt-8 rounded-2xl p-4"
                style={{
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                }}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <Lock size={14} style={{ color: theme.textLight }} />
                  <p className="text-sm font-semibold" style={{ color: theme.textLight }}>
                    Held by Free Plan
                  </p>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
                      color: theme.textLight,
                    }}
                  >
                    {heldItems.length} {heldItems.length === 1 ? 'entry' : 'entries'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowUpgradeModal(true)}
                    className="ml-auto text-xs font-semibold inline-flex items-center gap-1 hover:opacity-80 transition-all"
                    style={{ color: theme.primary }}
                  >
                    Upgrade to restore
                    <ArrowRight size={12} />
                  </button>
                </div>
                <p className="text-xs mt-2 mb-3" style={{ color: theme.textLight }}>
                  Free plan allows {caps.maxStockpileItems} active entries. These {heldGroups.length} compound{heldGroups.length > 1 ? 's are' : ' is'} locked — all data is safe. Delete entries to free up slots, or upgrade to restore full access.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {heldGroups.map(g => (
                    <button
                      key={g.name}
                      type="button"
                      onClick={() => setShowUpgradeModal(true)}
                      className="text-left rounded-xl px-3 py-2.5 flex items-center gap-2 transition-all hover:opacity-80 active:scale-95"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                        border: `1px solid ${theme.border}`,
                        opacity: 0.75,
                      }}
                    >
                      <Lock size={12} style={{ color: theme.textLight, flexShrink: 0 }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate" style={{ color: theme.text }}>
                          {g.name}
                        </p>
                        <p className="text-[10px]" style={{ color: theme.textLight }}>
                          {g.count} {g.count === 1 ? 'entry' : 'entries'}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Out of Stock Section — shown at bottom of On Hand for view all / out of stock filter */}
            {(stockpileFilter === 'view all' || stockpileFilter === 'out of stock') && groups.filter(g => g.totalVials <= 0).length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle size={15} style={{ color: '#ef4444' }} />
                  <span className="text-sm font-semibold" style={{ color: theme.textLight }}>Out of Stock</span>
                  <span className="text-xs" style={{ color: theme.textLight }}>({groups.filter(g => g.totalVials <= 0).length})</span>
                </div>
                <div className="columns-2 gap-6 pb-10 [column-fill:balance]">
                  {groups.filter(g => g.totalVials <= 0).map(g => (
                    <div key={`oos-${g.name}`} className="break-inside-avoid mb-6">
                    <OutOfStockGroupCard
                      key={`oos-${g.name}`}
                      group={g}
                      theme={theme}
                      isReadOnly={isReadOnly}
                      onDelete={(group) => {
                        if (isReadOnly) { setShowUpgradeModal(true); return; }
                        setDeleteOutOfStockGroup(group);
                      }}
                      onCardClick={() => {
                        if (isReadOnly) { setShowUpgradeModal(true); return; }
                        setOutOfStockModalName(g.name);
                      }}
                    />
                    </div>
                  ))}
                </div>
              </div>
            )}
              </div>
            )}
          </div>
        )}

        {/* Incoming Tab */}
        {activeTab === 'incoming' && (
          <div className="min-w-0 overflow-x-hidden w-full">
            {incomingGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
                  <PhShoppingCart size={32} weight="duotone" style={{ color: theme.primary }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>Time to Stock Up!</h3>
                <p className="text-sm mb-6 max-w-md" style={{ color: theme.textLight }}>
                  Orders that aren't delivered yet show here and move to Peptides when delivered.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    window.history.pushState({}, '', '/app/orders?new=true');
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors touch-manipulation"
                  style={{
                    color: theme.primary,
                    backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}15`,
                    border: `1px solid ${theme.primary}40`,
                    WebkitTapHighlightColor: 'transparent'
                  }}
                >
                  Add Your First Order
                  <ChevronDown size={14} />
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3 pb-8 max-w-xl mx-auto w-full">
                {incomingWithOrderInfo.map(({ group: g, itemIndex, totalFromOrder }, i) => (
                  <IncomingGroupCard
                    key={`incoming-${g.name}-${i}`}
                    group={g}
                    itemIndex={itemIndex}
                    totalFromOrder={totalFromOrder}
                    theme={theme}
                    orders={orders}
                    vendorMap={vendorMap}
                    onViewOrder={(orderId) => {
                      if (isReadOnly) {
                        setShowUpgradeModal(true);
                        return;
                      }
                      const orderToOpen = orders.find(o => o.id === orderId);
                      if (orderToOpen) {
                        setEditingOrder(orderToOpen);
                        setShowOrderModal(true);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Supplies Tab ─────────────────────────────────────────── */}
        {activeTab === 'supplies' && (
          <div className="min-w-0 overflow-x-hidden w-full">
            {/* Filter bar */}
            {supplyItems.length > 0 && (
              <div className="mb-6">
                <CustomDropdown
                  value={supplyFilter}
                  onChange={setSupplyFilter}
                  options={[
                    {
                      value: 'all',
                      label: `All Supplies (${supplyFilterCounts.all})`,
                      icon: <Package size={16} style={{ color: theme.textLight }} />
                    },
                    {
                      value: 'low',
                      label: `Low Stock (${supplyFilterCounts.low})`,
                      icon: <AlertTriangle size={16} style={{ color: '#f59e0b' }} />
                    },
                    {
                      value: 'out of stock',
                      label: `Out of Stock (${supplyFilterCounts.outOfStock})`,
                      icon: <AlertTriangle size={16} style={{ color: '#ef4444' }} />
                    },
                  ]}
                  theme={theme}
                  placeholder="Filter supplies..."
                  outlined={true}
                  customShadow={true}
                />
              </div>
            )}

            {/* Empty state */}
            {supplyItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ backgroundColor: `${theme.primary}10` }}
                >
                  <Package size={32} style={{ color: theme.primary }} />
                </div>
                <h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
                  No supplies tracked yet
                </h3>
                <p className="text-sm mb-6 max-w-md" style={{ color: theme.textLight }}>
                  Track syringes, BAC water, filters, pen needles and more.
                  Supplies can auto-deduct when doses are logged.
                </p>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setShowAddSupply(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors touch-manipulation btn-primary-inset"
                    style={{
                      color: theme.primary,
                      backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}15`,
                      border: `1px solid ${theme.primary}40`,
                      boxShadow: `inset 0 2px 5px ${theme.primary}30, inset 0 1px 2px ${theme.primary}20`,
                      WebkitTapHighlightColor: 'transparent'
                    }}
                  >
                    Add First Supply
                    <ChevronDown size={14} />
                  </button>
                )}
              </div>
            ) : filteredSupplies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <p className="text-sm" style={{ color: theme.textLight }}>
                  No supplies match this filter.
                </p>
              </div>
            ) : (
              <div className="columns-2 gap-4 pb-10 [column-fill:balance]">
                {filteredSupplies.map(supply => (
                  <div key={supply.id} className="break-inside-avoid mb-4">
                  <SupplyCard
                    key={supply.id}
                    supply={supply}
                    theme={theme}
                    onEdit={(s) => { setEditingSupply(s); setShowAddSupply(true); }}
                    onDelete={(s) => setDeleteSupplyItem(s)}
                    onConfirmLooksRight={(s) => {
                      if (isReadOnly) { setShowUpgradeModal(true); return; }
                      setItems((prev) =>
                        prev.map((item) =>
                          item.id === s.id
                            ? prepareItemForSave({ ...item, needsReconfirm: false })
                            : item
                        )
                      );
                      window.dispatchEvent(new CustomEvent('tpp:toast', {
                        detail: { message: 'Quantity confirmed', type: 'success' },
                      }));
                    }}
                  />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>


      <AddToStockpileBottomSheet
        open={openAdd}
        onClose={() => { setOpenAdd(false); setOpenAddWithScan(false); }}
        theme={theme}
        onUpgrade={() => setShowUpgradeModal(true)}
        onAddSupply={() => setShowAddSupply(true)}
        autoOpenScanner={openAddWithScan}
      />

      {/* Add / Edit Supply modal */}
      <AddSupplyModal
        open={showAddSupply}
        onClose={() => { setShowAddSupply(false); setEditingSupply(null); }}
        theme={theme}
        editSupply={editingSupply}
        onSave={(supplyItem) => {
          if (isReadOnly) { setShowUpgradeModal(true); return; }
          const cleared = prepareItemForSave({ ...supplyItem, needsReconfirm: false });
          setItems(prev => {
            const exists = prev.some(i => i.id === cleared.id);
            return exists
              ? prev.map(i => i.id === cleared.id ? cleared : i)
              : [cleared, ...prev];
          });
          window.dispatchEvent(new CustomEvent('tpp:toast', {
            detail: {
              message: editingSupply ? `✅ ${cleared.name} updated!` : `✅ ${cleared.name} added to supplies!`,
              type: 'success'
            }
          }));
          setEditingSupply(null);
        }}
      />

      {/* Delete supply confirmation */}
      {deleteSupplyItem && (
        <ConfirmationModal
          open={!!deleteSupplyItem}
          onClose={() => setDeleteSupplyItem(null)}
          onConfirm={() => {
            setItems(prev => prev.filter(i => i.id !== deleteSupplyItem.id));
            window.dispatchEvent(new CustomEvent('tpp:toast', {
              detail: { message: `🗑️ ${deleteSupplyItem.name} removed.`, type: 'info' }
            }));
            setDeleteSupplyItem(null);
          }}
          title="Delete Supply"
          message={`Remove "${deleteSupplyItem.name}" from your supplies? This cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
          theme={theme}
        />
      )}



      <BottomSheet 
        open={!!manageName} 
        onClose={() => { 
          setIsTransitioning(false);
          setManageName(null); 
          setManageRows([]); 
          setShowHistory(false); 
          setEditedManageName(null);
          setIsEditingName(false);
          clearManageSavedData(); 
        }} 
        title={(() => {
          const resolvedIcon = managePurposeIcon || 'research'
          const ManageIcon = getPurposeIconComponent(resolvedIcon)
          const manageIconColor = getPurposeIconColor(resolvedIcon)
          const iconNode = (
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${manageIconColor}18`, color: manageIconColor }}
              title="Category"
              aria-hidden
            >
              <IconContext.Provider value={{ weight: 'duotone' }}>
                <ManageIcon size={20} weight={PURPOSE_ICON_WEIGHT} style={{ color: manageIconColor, flexShrink: 0 }} />
              </IconContext.Provider>
            </span>
          )

          if (isEditingName) {
            return (
              <span className="flex items-center gap-2 min-w-0 w-full">
                {iconNode}
                <input
                  autoFocus
                  type="text"
                  value={editedManageName || ''}
                  onChange={(e) => setEditedManageName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editedManageName?.trim()) handleManageRenameConfirm()
                    if (e.key === 'Escape') { setEditedManageName(manageName); setIsEditingName(false) }
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xl font-bold tracking-tight outline-none"
                  style={{ color: theme.text, fontFamily: 'Poppins, sans-serif' }}
                  placeholder="Enter new name..."
                />
                <button
                  type="button"
                  onClick={handleManageRenameConfirm}
                  disabled={!editedManageName?.trim()}
                  className="p-1.5 rounded-lg flex-shrink-0 disabled:opacity-40"
                  style={{ backgroundColor: theme.primary + '20', color: theme.primary }}
                  title="Save name"
                >
                  <Check size={14} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => { setEditedManageName(manageName); setIsEditingName(false) }}
                  className="p-1.5 rounded-lg flex-shrink-0"
                  style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', color: theme.textLight }}
                  title="Cancel rename"
                >
                  <X size={14} strokeWidth={2.5} />
                </button>
              </span>
            )
          }

          return (
            <span className="flex items-center gap-2 min-w-0">
              {iconNode}
              <span className="truncate">{editedManageName || manageName || 'Manage'}</span>
            </span>
          )
        })()}
        titleSuffix={!isEditingName && (
          <button
            onClick={() => { if (isReadOnly) { setShowUpgradeModal(true); return; } setIsEditingName(true); }}
            className="p-1 rounded-full transition-all hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 flex-shrink-0"
            style={{ color: theme.primary }}
            title="Rename"
          >
            <Pencil size={13} strokeWidth={2.5} />
          </button>
        )}
        onBack={() => { 
          // Close manage and return to stockpile list (no separate view modal)
          setManageName(null); 
          setManageRows([]); 
          setShowHistory(false); 
          setEditedManageName(null);
          setIsEditingName(false);
          clearManageSavedData();
        }}
        titleExtra={manageRows.length > 0 && (() => {
          const totalVials = manageRows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0);
          const totalMg = manageRows.reduce((sum, r) => {
            const q = Number(r.quantity) || 0;
            const mg = Number(r.mg) || 0;
            return sum + q * mg;
          }, 0);
          const unit = manageRows[0]?.mgUnit || 'mg';
          const value = totalMg > 0 ? totalMg : totalVials;
          const unitLabel = totalMg > 0 ? unit : (totalVials === 1 ? 'vial' : 'vials');
          return (
            <div className="flex flex-col items-end leading-none">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black leading-none tracking-tight" style={{ color: theme.primary }}>{value}</span>
                <span className="text-sm font-bold uppercase tracking-wide opacity-75" style={{ color: theme.text }}>{unitLabel}</span>
              </div>
              <span className="mt-1 text-[10px] font-bold uppercase tracking-wide opacity-70 leading-none" style={{ color: theme.text }}>
                Total Stock
              </span>
            </div>
          );
        })()}
        theme={theme} 
        maxHeight="90vh"
        fitContent
        footer={(
        <div className="w-full flex items-center justify-between px-2">
          <div className="flex items-center gap-4">
            {manageRows.length > 0 && (
              <button
                type="button"
                className="text-sm font-semibold transition-opacity hover:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ color: deleteEntireStockArmed ? '#c87a5c' : theme.textLight }}
                onClick={deleteEntireManageStock}
                disabled={isSavingManage || isReadOnly}
                title={deleteEntireStockArmed ? 'Tap again to confirm deleting this stock group' : 'Delete the entire stock group'}
              >
                {deleteEntireStockArmed ? 'Tap Again to Delete' : 'Delete Entire Stock'}
              </button>
            )}
          </div>
          <button
            onClick={() => {
              if (isReadOnly) {
                setShowUpgradeModal(true);
                return;
              }
              if (isSavingManage || !hasManageChanges) return;
              saveManage();
            }}
            disabled={isSavingManage || isReadOnly || !hasManageChanges}
            className="px-8 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-xl active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none" 
            style={{ 
              background: hasManageChanges
                ? `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}dd 100%)`
                : theme.isDark ? '#374151' : '#e5e7eb',
              color: hasManageChanges ? (theme?.textOnPrimary || '#ffffff') : (theme.isDark ? '#6b7280' : '#9ca3af')
            }}
          >
            {isSavingManage ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}>
        <div className="space-y-4">
          {/* Vials List */}
          <div className="space-y-3">
          {/* Column headers — grid must match row layout exactly */}
          {manageRows.length > 0 && (
            <div
              className="grid items-center px-4 pb-2"
              style={{
                gridTemplateColumns: STOCKPILE_ENTRY_MANAGE_GRID,
                fontFamily: 'Poppins, sans-serif',
                borderBottom: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`
              }}
            >
              <span className="text-xs font-bold uppercase tracking-widest pl-7" style={{ color: theme.primary, opacity: 0.75 }}>Vendor</span>
              <span className="text-xs font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.75 }}>Amount</span>
              <span className="text-xs font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.75 }}>Qty</span>
              <span className="text-xs font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.75 }}>Purity</span>
              <span className="text-xs font-bold uppercase tracking-widest text-center" style={{ color: theme.primary, opacity: 0.75 }}>Cap</span>
              <span /> {/* delete button column */}
            </div>
          )}
          {manageRows.map((row, rowIdx) => {
            const isExpanded = expandedManageRows[row.id];
            const showMergeAction = manageName === 'Unknown' || !manageName || manageName.trim() === '';
            
            return (
            <div
              id={`manage-row-${row.id}`}
              key={row.id}
              className="transition-all rounded-2xl border overflow-hidden"
              style={{
                borderColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                borderLeft: `4px solid ${theme.primary + '60'}`,
                transition: 'border-color 250ms ease'
              }}
            >
              <StockpileEntrySummaryRow
                item={row}
                mode="manage"
                theme={theme}
                vendorMap={vendorMap}
                isExpanded={isExpanded}
                showMerge={showMergeAction}
                onToggle={(e) => {
                  e.stopPropagation();
                  // Accordion: only one row open at a time — collapse others when opening a new one
                  const alreadyOpen = !!expandedManageRows[row.id];
                  setExpandedManageRows(alreadyOpen ? {} : { [row.id]: true });
                }}
                onMerge={() => {
                  if (isReadOnly) { setShowUpgradeModal(true); return; }
                  handleMergeIndividualItem(row);
                }}
                onDelete={() => {
                  if (showMergeAction) {
                    deleteManageRow(row.id);
                  } else {
                    if (manageRows.length === 1) {
                      window.dispatchEvent(new CustomEvent('tpp:toast', {
                        detail: { message: 'Cannot remove the last variant. Delete the entire group from the main view instead.', type: 'error' }
                      }));
                      return;
                    }
                    removeManageRow(row.id);
                  }
                }}
              />

              {/* Expanded Edit Form */}
              <div 
                className="overflow-hidden"
                style={{ 
                  maxHeight: isExpanded ? '2000px' : '0',
                  opacity: isExpanded ? 1 : 0,
                  transform: isExpanded ? 'translateY(0)' : 'translateY(-2px)',
                  transition: isExpanded 
                    ? 'max-height 150ms cubic-bezier(0.4, 0, 0.2, 1), opacity 100ms cubic-bezier(0.4, 0, 0.2, 1), transform 100ms cubic-bezier(0.4, 0, 0.2, 1)'
                    : 'max-height 120ms cubic-bezier(0.4, 0, 0.2, 1), opacity 80ms cubic-bezier(0.4, 0, 0.2, 1), transform 80ms cubic-bezier(0.4, 0, 0.2, 1)',
                  willChange: 'max-height, opacity, transform',
                  pointerEvents: isExpanded ? 'auto' : 'none',
                }}
              >
                <div className="p-3 space-y-3 border-t" style={{ borderColor: theme.border }}>
                  {/* VIAL DETAILS Section Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <TestTube size={26} style={{ color: theme.primary }} />
                    <div className="flex flex-col gap-0.5">
                      <h4 className="text-base font-semibold tracking-wide" style={{ color: theme.text }}>Vial Details</h4>
                      <div className="flex items-center gap-2 ml-1">
                        <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60" style={{ color: theme.text }}>
                          Research Parameters
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Amount & Quantity in two columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {/* Amount with Unit Dropdown */}
                    <div className="relative">
                      <div 
                        className="flex items-stretch rounded-lg"
                        style={{ 
                          border: `1px solid ${(manageRowDropdowns[row.id]?.amountFocused || false) ? theme.primary : (theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}`,
                          boxShadow: theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)',
                          backgroundColor: theme.isDark ? theme.cardBackground : (theme.inputBackground || '#fff')
                        }}
                      >
                        <input 
                          type="text"
                          id={`amount-input-${row.id}`}
                          value={row.mg || ''}
                          onChange={e => setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, mg: e.target.value } : r))}
                          onFocus={() => setManageRowDropdowns(prev => ({ ...prev, [row.id]: { ...prev[row.id], amountFocused: true } }))}
                          onBlur={(e) => {
                            setTimeout(() => {
                              const relatedTarget = e.relatedTarget || document.activeElement
                              const isClickingDropdown = relatedTarget?.closest('[data-dropdown-container]')
                              if (!isClickingDropdown && !(manageRowDropdowns[row.id]?.amountUnit)) {
                                setManageRowDropdowns(prev => ({ ...prev, [row.id]: { ...prev[row.id], amountFocused: false } }))
                              }
                            }, 150)
                          }}
                          placeholder=" "
                          className="flex-1 py-2 outline-none min-w-0 rounded-l-lg"
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
                          onClick={() => setManageRowDropdowns(prev => ({ ...prev, [row.id]: { ...prev[row.id], amountUnit: !prev[row.id]?.amountUnit } }))}
                          onMouseDown={(e) => e.preventDefault()}
                          onTouchStart={(e) => e.preventDefault()}
                          className="flex items-center justify-between gap-3 px-3 py-2 flex-shrink-0 rounded-r-lg relative cursor-pointer transition-all border-none outline-none"
                          data-dropdown-container
                          style={{ 
                            borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
                            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.secondary || '#f9fafb'),
                            color: theme.isDark ? theme.text : '#181A18',
                            minWidth: '100px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.04)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.secondary || '#f9fafb');
                          }}
                        >
                          <span className="text-sm font-semibold">
                            {(row.mgUnit || 'mg')}
                          </span>
                          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                      </div>
                      {/* Dropdown positioned outside flex container, aligned with button */}
                      {(manageRowDropdowns[row.id]?.amountUnit) && (
                        <div 
                          className="absolute z-[9999] rounded-lg shadow-lg border overflow-hidden"
                          data-dropdown-container
                          style={{
                            top: '100%',
                            right: '0',
                            marginTop: '4px',
                            backgroundColor: theme.isDark ? theme.cardBackground : (theme?.cardBackground || '#fff'),
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
                                  setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, mgUnit: option.value } : r))
                                  setManageRowDropdowns(prev => ({ ...prev, [row.id]: { ...prev[row.id], amountUnit: false } }))
                                }}
                                className="w-full text-left px-3 py-2 text-sm transition-all touch-manipulation"
                                style={{
                                  color: (row.mgUnit || 'mg') === option.value ? theme.primary : theme.text,
                                  backgroundColor: 'transparent',
                                  WebkitTapHighlightColor: 'transparent'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = theme.primaryLight || `${theme.primary}20`;
                                  e.currentTarget.style.color = theme.primary;
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = 'transparent';
                                  e.currentTarget.style.color = (row.mgUnit || 'mg') === option.value ? theme.primary : theme.text;
                                }}
                              >
                                {option.label}
                              </button>
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      <label 
                        htmlFor={`amount-input-${row.id}`}
                        className="absolute pointer-events-none transition-all"
                        style={{
                          fontSize: ((manageRowDropdowns[row.id]?.amountFocused) || (row.mg && row.mg.trim())) ? '0.75rem' : '0.9375rem',
                          top: ((manageRowDropdowns[row.id]?.amountFocused) || (row.mg && row.mg.trim())) ? '-8px' : '14px',
                          left: ((manageRowDropdowns[row.id]?.amountFocused) || (row.mg && row.mg.trim())) ? '12px' : '16px',
                          padding: ((manageRowDropdowns[row.id]?.amountFocused) || (row.mg && row.mg.trim())) ? '0 4px' : '0',
                          background: ((manageRowDropdowns[row.id]?.amountFocused) || (row.mg && row.mg.trim())) ? (theme.isDark ? theme.cardBackground : (theme.inputBackground || '#fff')) : 'transparent',
                          color: ((manageRowDropdowns[row.id]?.amountFocused) || (row.mg && row.mg.trim())) ? theme.primary : (theme.textLight || theme.text),
                          fontWeight: 500
                        }}
                      >
                        Amount
                      </label>
                    </div>
                    <TextInput
                      label="Quantity"
                      value={row.quantity || ''}
                      onChange={v => setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, quantity: v } : r))}
                      placeholder="2"
                      theme={theme}
                      outlined={true}
                      customTextColor={theme.isDark ? null : "#181A18"}
                      customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    />
                  </div>

                  <CrimpCapColorInput
                    value={row.capColor || ''}
                    onChange={v => setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, capColor: v } : r))}
                    theme={theme}
                    customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    customTextColor={theme.isDark ? null : '#181A18'}
                  />

                  {/* ORDER DETAILS Section Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <PackageOpen size={26} style={{ color: theme.primary }} />
                    <div className="flex flex-col gap-0.5">
                      <h4 className="text-base font-semibold tracking-wide" style={{ color: theme.text }}>Order Details</h4>
                      <div className="flex items-center gap-2 ml-1">
                        <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60" style={{ color: theme.text }}>
                          Purchase Information
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Vendor */}
                  <VendorSuggestInput
                    label="Vendor"
                    value={row.vendorId ? vendorMap[row.vendorId] : (row.vendor || '')}
                    onChange={v =>
                      updateManageData(prev =>
                        prev.map(r =>
                          r.id === row.id
                            ? { ...r, vendor: v, vendorId: (vendors || []).find(vnd => vnd.name === v)?.id || null }
                            : r
                        )
                      )
                    }
                    placeholder="e.g., Pharm..."
                    theme={theme}
                  />

                  {/* Cost per ($) - show originally entered price when editing */}
                  <div className="relative" data-dropdown-container>
                    <div className="flex items-stretch rounded-lg" style={{ border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, backgroundColor: theme.isDark ? theme.cardBackground : (theme.inputBackground || '#fff'), boxShadow: theme.isDark ? '0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)' }}>
                      <input
                        type="text"
                        value={row.cost ?? ''}
                        onChange={e => setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, cost: e.target.value } : r))}
                        placeholder=" "
                        className="flex-1 py-2 outline-none min-w-0 rounded-l-lg px-3"
                        style={{ backgroundColor: 'transparent', color: theme.isDark ? theme.text : '#181A18', border: 'none' }}
                      />
                      <button
                        type="button"
                        onClick={() => setManageRowDropdowns(prev => ({ ...prev, [row.id]: { ...prev[row.id], priceUnit: !prev[row.id]?.priceUnit } }))}
                        onMouseDown={e => e.preventDefault()}
                        className="flex items-center justify-between gap-2 px-3 py-2 flex-shrink-0 rounded-r-lg border-none outline-none"
                        style={{ borderLeft: theme.isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)', backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : (theme.secondary || '#f9fafb'), color: theme.isDark ? theme.text : '#181A18', minWidth: '72px' }}
                      >
                        <span className="text-sm font-semibold">
                          {(() => {
                            const u = (row.priceUnit || 'vial').toLowerCase();
                            if (u === 'vial') return 'Vial';
                            if (u === 'mg') return 'mg';
                            if (u === 'g') return 'g';
                            if (u === 'iu') return 'IU';
                            if (u === 'tablet') return 'Tablet';
                            return u.charAt(0).toUpperCase() + u.slice(1);
                          })()}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                    </div>
                    {(manageRowDropdowns[row.id]?.priceUnit) && (
                      <div className="absolute right-0 top-full z-[9999] mt-1 rounded-lg shadow-lg border overflow-hidden" data-dropdown-container style={{ backgroundColor: theme.isDark ? theme.cardBackground : (theme?.cardBackground || '#fff'), borderColor: theme.border, minWidth: '88px', boxShadow: theme.isDark ? '0 4px 6px rgba(0,0,0,0.3)' : '0 4px 6px rgba(0,0,0,0.1)' }}>
                        {[{ value: 'vial', label: 'Vial' }, { value: 'mg', label: 'mg' }, { value: 'g', label: 'g' }, { value: 'iu', label: 'IU' }, { value: 'tablet', label: 'Tablet' }].map((option, optIdx) => (
                          <React.Fragment key={option.value}>
                            {optIdx > 0 && <div className="h-px mx-2" style={{ backgroundColor: theme.border }} />}
                            <button
                              type="button"
                              onMouseDown={e => e.preventDefault()}
                              onClick={e => { e.preventDefault(); e.stopPropagation(); setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, priceUnit: option.value } : r)); setManageRowDropdowns(prev => ({ ...prev, [row.id]: { ...prev[row.id], priceUnit: false } })); }}
                              className="w-full text-left px-3 py-2 text-sm"
                              style={{ color: (row.priceUnit || 'vial') === option.value ? theme.primary : theme.text, backgroundColor: 'transparent' }}
                            >
                              {option.label}
                            </button>
                          </React.Fragment>
                        ))}
                      </div>
                    )}
                    <label className="absolute pointer-events-none text-[10px] font-medium uppercase tracking-wide opacity-60" style={{ left: '12px', top: '-8px', padding: '0 4px', background: theme.isDark ? theme.cardBackground : (theme.inputBackground || '#fff'), color: theme.primary }}>
                      Cost per ($)
                    </label>
                  </div>

                  {/* Purity & Batch Number in two columns */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <TextInput
                      label="Purity %"
                      value={row.purity || ''}
                      onChange={v => setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, purity: v } : r))}
                      placeholder="e.g., 98"
                      theme={theme}
                      outlined={true}
                      customTextColor={theme.isDark ? null : "#181A18"}
                      customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    />
                    <TextInput
                      label="Batch #"
                      value={row.batchNumber || ''}
                      onChange={v => setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, batchNumber: v } : r))}
                      placeholder="# XXX"
                      theme={theme}
                      uppercase={true}
                      outlined={true}
                      customTextColor={theme.isDark ? null : "#181A18"}
                      customShadow={theme.isDark ? 'inset 0 2px 4px rgba(0,0,0,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.1)'}
                    />
                  </div>

                  {/* Date Acquired */}
                  <GlassmorphismDatePicker
                    value={row.date || ''}
                    onChange={(dateString) => setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, date: dateString } : r))}
                    theme={theme}
                    placeholder="Date Acquired"
                  />

                  {/* EXTRA DETAILS Section Header */}
                  <div className="flex items-center gap-3 mb-2">
                    <ImageUp size={26} style={{ color: theme.primary }} />
                    <div className="flex flex-col gap-0.5">
                      <h4 className="text-base font-semibold tracking-wide" style={{ color: theme.text }}>Extra Details</h4>
                      <div className="flex items-center gap-2 ml-1">
                        <div className="h-0.5 w-4 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                        <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60" style={{ color: theme.text }}>
                          Documentation
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Documentation */}
                  <DocumentationUpload
                    documentation={row.documentation || []}
                    onChange={(documentation) => 
                      setManageRows(prev => prev.map(r => r.id === row.id ? { ...r, documentation } : r))
                    }
                    theme={theme}
                    title=""
                    description="Upload images or links for received peptide documentation (photos of received vials, condition notes, quality check notes, etc.)"
                    placeholder="Add photos, screenshots, or files that correlate with this peptide."
                    allowImages={true}
                    allowLinks={true}
                  />

                  {/* Reconstitution info - show when a matching recon item exists for this vial */}
                  {(() => {
                    const matchedRecon = reconItems?.find(r => {
                      if (Array.isArray(r.peptides)) {
                        return r.peptides.some(p => p.stockpileId === row.id);
                      }
                      return false;
                    }) || reconItems?.find(r => {
                      if (!r.peptides || r.peptides.length === 0) return false;
                      const reconPeptideNames = r.peptides.map(p => (p.name || '').toLowerCase().trim());
                      const rowName = (row.name || manageName || '').toLowerCase().trim();
                      return rowName && reconPeptideNames.includes(rowName);
                    });
                    const matchedHistory = !matchedRecon ? (reconHistory?.find(r => {
                      if (Array.isArray(r.peptides)) {
                        return r.peptides.some(p => p.stockpileId === row.id);
                      }
                      return false;
                    }) || reconHistory?.find(r => {
                      if (!r.peptides || r.peptides.length === 0) return false;
                      const reconPeptideNames = r.peptides.map(p => (p.name || '').toLowerCase().trim());
                      const rowName = (row.name || manageName || '').toLowerCase().trim();
                      return rowName && reconPeptideNames.includes(rowName);
                    })) : null;
                    const reconEntry = matchedRecon || matchedHistory;
                    if (!reconEntry) return null;
                    const totalMg = Array.isArray(reconEntry.peptides)
                      ? reconEntry.peptides.reduce((sum, p) => sum + (Number(p.mg) || 0), 0)
                      : (Number(reconEntry.mg) || 0);
                    const water = Number(reconEntry.water) || 0;
                    if (totalMg <= 0 && water <= 0) return null;
                    const reconDate = reconEntry.date ? new Date(reconEntry.date).toLocaleDateString() : null;
                    const isHistory = !!matchedHistory && !matchedRecon;
                    return (
                      <div
                        className="mt-3 p-3 rounded-lg border cursor-pointer transition-all hover:opacity-80"
                        style={{
                          backgroundColor: theme.isDark ? 'rgba(140,166,140,0.08)' : 'rgba(140,166,140,0.06)',
                          borderColor: theme.isDark ? 'rgba(140,166,140,0.2)' : 'rgba(140,166,140,0.15)'
                        }}
                        onClick={() => navigate('/app/recon')}
                        title="View or edit reconstitution details on the Recon page"
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <Beaker size={14} style={{ color: '#8ca68c' }} />
                          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8ca68c' }}>
                            {isHistory ? 'Reconstitution (Finished)' : 'Reconstitution'}
                          </span>
                          <span style={{ color: '#8ca68c', marginLeft: 'auto', fontSize: '11px', fontWeight: 600 }}>
                            View →
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: theme.textLight }}>
                          {reconDate && <span className="flex items-center gap-1"><Calendar size={12} /> {reconDate}</span>}
                          <span className="flex items-center gap-1"><Pill size={12} /> {totalMg}{reconEntry.mgUnit || 'mg'}</span>
                          <span className="flex items-center gap-1"><Droplet size={12} /> {water} mL</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Delete Entry */}
                  <div className="pt-2 flex justify-end border-t" style={{ borderColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                    <button
                      type="button"
                      className="text-sm font-semibold transition-opacity hover:opacity-80"
                      style={{ color: deleteRowArmedId === row.id ? '#c87a5c' : theme.textLight }}
                      onClick={() => {
                        if (deleteRowArmedId === row.id) {
                          // Confirmed — delete
                          if (deleteRowTimerRef.current) clearTimeout(deleteRowTimerRef.current)
                          setDeleteRowArmedId(null)
                          if (manageRows.length === 1) {
                            window.dispatchEvent(new CustomEvent('tpp:toast', {
                              detail: { message: 'Cannot remove the last entry. Use "Delete Entire Stock" to remove the group.', type: 'error' }
                            }))
                            return
                          }
                          removeManageRow(row.id)
                        } else {
                          // First tap — arm it
                          if (deleteRowTimerRef.current) clearTimeout(deleteRowTimerRef.current)
                          setDeleteRowArmedId(row.id)
                          deleteRowTimerRef.current = setTimeout(() => {
                            setDeleteRowArmedId(null)
                            deleteRowTimerRef.current = null
                          }, 3000)
                          window.dispatchEvent(new CustomEvent('tpp:toast', {
                            detail: { message: 'Tap Delete Entry again to confirm.', type: 'warning' }
                          }))
                        }
                      }}
                    >
                      {deleteRowArmedId === row.id ? 'Tap Again to Delete' : 'Delete Entry'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
            );
          })}
          </div>

          {/* Add Vial Button */}
          <div className="flex justify-center">
            <button 
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all border" 
              style={{ 
                backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: theme.border,
                color: theme.primary
              }} 
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.borderColor = theme.primary + '40';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)';
                e.currentTarget.style.borderColor = theme.border;
              }}
              onClick={() => {
                if (isReadOnly) {
                  setShowUpgradeModal(true);
                  return;
                }
                addManageRow();
              }}
            >
              Add to Stock
              <ChevronDown size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* History */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-0 min-w-0" style={{ height: '18px' }}>
              <div
                className="h-px flex-shrink-0 w-2"
                style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }}
              />
              <span
                className="text-xs font-bold uppercase tracking-widest whitespace-nowrap flex-shrink-0 px-2"
                style={{ color: theme.textLight }}
              >
                History
              </span>
              <div
                className="h-px flex-1 min-w-0"
                style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)' }}
              />
            </div>
            <button
              type="button"
              className="text-sm font-semibold transition-opacity hover:opacity-80"
              style={{ color: theme.primary }}
              onClick={() => setShowHistory(v => !v)}
            >
              {showHistory ? 'Hide history' : 'View history'}
            </button>
            {showHistory && (
              <div className="rounded-xl border p-4 max-h-40 overflow-auto space-y-2" style={{
                borderColor: theme.border,
                backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)'
              }}>
                {(getStockHistory() || []).filter(h => (h.name || '') === (manageName || '')).slice(0, 50).map(h => (
                  <div key={h.id} className="flex items-center justify-between py-1.5 gap-3">
                    <span className="text-sm font-medium min-w-0" style={{ color: theme.text }}>
                      {h.type} • {h.name} {h.mg}mg {h.vendor ? `• ${h.vendor}` : ''} {h.prevQty != null ? `(from ${h.prevQty}${h.nextQty != null ? `→${h.nextQty}` : ''})` : ''}
                    </span>
                    <span className="text-xs font-medium opacity-70 flex-shrink-0" style={{ color: theme.textLight }}>
                      {new Date(h.date).toLocaleDateString()}
                    </span>
                  </div>
                ))}
                {(getStockHistory() || []).filter(h => (h.name || '') === (manageName || '')).length === 0 && (
                  <div className="text-center py-2 text-sm" style={{ color: theme.textLight }}>No history yet.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </BottomSheet>
      
      {/* Merge Selection Modal */}
      <MergeSelectionModal
        open={showMergeSelectionModal}
        onClose={() => {
          setShowMergeSelectionModal(false)
          setMergeSourceGroup(null)
          setMergeSourceItem(null)
        }}
        sourceGroup={mergeSourceGroup || (mergeSourceItem ? {
          name: mergeSourceItem.name || 'Unknown',
          groupKey: `temp-${mergeSourceItem.id}`,
          totalVials: Number(mergeSourceItem.quantity) || 0,
          totalMg: (Number(mergeSourceItem.quantity) || 0) * (Number(mergeSourceItem.mg) || 0),
          unit: mergeSourceItem.mgUnit || 'mg'
        } : null)}
        availableGroups={groups.filter(g => {
          // When merging from Unknown (group or item), only show named groups (exclude other Unknown groups)
          const isSourceUnknown = (mergeSourceGroup && (mergeSourceGroup.name === 'Unknown' || !mergeSourceGroup.name || mergeSourceGroup.name.trim() === '')) ||
                                  (mergeSourceItem && (!mergeSourceItem.name || mergeSourceItem.name.trim() === ''));
          const isTargetUnknown = g.name === 'Unknown' || !g.name || g.name.trim() === '';
          
          const sourceKey = mergeSourceGroup?.groupKey || (mergeSourceItem ? `temp-${mergeSourceItem.id}` : null);
          
          return g.groupKey !== sourceKey && 
                 g.totalVials > 0 && 
                 (!isSourceUnknown || !isTargetUnknown); // If source is Unknown, exclude Unknown targets
        })}
        onSelectGroup={mergeSourceItem ? handleSelectGroupForItem : handleSelectMergeGroup}
        theme={theme}
      />
      
      {/* Merge Confirmation Modal */}
      <MergeConfirmationModal
        open={showMergeModal}
        onClose={() => {
          setShowMergeModal(false)
          setMergeData({ source: null, target: null })
        }}
        onBack={() => {
          setShowMergeModal(false)
          setShowMergeSelectionModal(true)
        }}
        onConfirm={handleConfirmMerge}
        mergeData={mergeData}
        theme={theme}
      />

      {/* Out of Stock Options Modal */}
      <BottomSheet
        open={!!outOfStockModalName}
        onClose={() => setOutOfStockModalName(null)}
        title={`${outOfStockModalName || ''} - Out of Stock!`}
        theme={theme}
        maxHeight="90vh"
      >
        <div className="space-y-4">
          <p className="text-sm" style={{ color: theme.text }}>
            What would you like to do?
          </p>

          {/* Option Buttons */}
          <div className="space-y-3">
            {/* Found a Vial */}
            <button
              onClick={() => {
                // Smooth transition: close out of stock modal first, then open manage modal
                setIsTransitioning(true);
                setOutOfStockModalName(null);
                setTimeout(() => {
                  openManage(outOfStockModalName);
                  setIsTransitioning(false);
                }, 450);
              }}
              className="w-full p-4 rounded-lg border-2 transition-all hover:shadow-md text-left"
              style={{ 
                borderColor: theme.border,
                backgroundColor: theme.cardBackground,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${theme.primary}20` }}>
                  <Package size={20} style={{ color: theme.primary }} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold mb-1" style={{ color: theme.primaryDark }}>Found a Vial?</div>
                  <div className="text-xs" style={{ color: theme.textLight }}>Add vials back to your inventory</div>
                </div>
              </div>
            </button>

            {/* Incoming Order */}
            <button
              onClick={() => {
                setOutOfStockModalName(null);
                navigate('/app/orders');
              }}
              className="w-full p-4 rounded-lg border-2 transition-all hover:shadow-md text-left"
              style={{ 
                borderColor: theme.border,
                backgroundColor: theme.cardBackground,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${theme.success}20` }}>
                  <ShoppingCart size={20} style={{ color: theme.success }} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold mb-1" style={{ color: theme.primaryDark }}>Have an Incoming Order?</div>
                  <div className="text-xs" style={{ color: theme.textLight }}>Track your order to automatically restock</div>
                </div>
              </div>
            </button>

            {/* Restore from History */}
            <button
              onClick={() => {
                // Smooth transition: close out of stock modal first, then open manage modal
                setIsTransitioning(true);
                setOutOfStockModalName(null);
                setTimeout(() => {
                  openManage(outOfStockModalName);
                  setShowHistory(true);
                  setIsTransitioning(false);
                }, 450);
              }}
              className="w-full p-4 rounded-lg border-2 transition-all hover:shadow-md text-left"
              style={{ 
                borderColor: theme.border,
                backgroundColor: theme.cardBackground,
              }}
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg" style={{ backgroundColor: `${theme.accent}20` }}>
                  <FileText size={20} style={{ color: theme.accent }} />
                </div>
                <div className="flex-1">
                  <div className="font-semibold mb-1" style={{ color: theme.primaryDark }}>Restore from History</div>
                  <div className="text-xs" style={{ color: theme.textLight }}>View usage history and restore if it was a mistake</div>
                </div>
              </div>
            </button>
          </div>

          {/* Cancel Button */}
          <div className="pt-2">
            <button
              onClick={() => setOutOfStockModalName(null)}
              className="w-full px-4 py-2 rounded-lg text-sm font-medium border transition-all"
              style={{ borderColor: theme.border, color: theme.text }}
            >
              Cancel
            </button>
          </div>
        </div>
      </BottomSheet>

      <UpgradeModal 
        isOpen={showUpgradeModal}
        onClose={() => { setShowUpgradeModal(false); setUpgradeLimitContext(null); }}
        limitContext={upgradeLimitContext}
        theme={theme}
      />

      {/* View Group Modal - Read-only overview */}
      {viewingGroup && (() => {
            const firstVariant = Object.values(viewingGroup.variants || {})[0];
            const firstItem = firstVariant?.items?.[0];
            const containerUnit = firstItem?.unit || viewingGroup.containerUnit || 'vial';
            const containerLabel = getUnitLabel(containerUnit, viewingGroup.totalVials);
            const amountUnit = (viewingGroup.unit || 'mg').toUpperCase();
            return (
        <BottomSheet
          open={!!viewingGroup}
          onClose={() => setViewingGroup(null)}
          onBack={() => setViewingGroup(null)}
          title={viewingGroup.name}
          titleExtra={(
            <div className="flex flex-col items-end leading-none">
              <div className="flex items-baseline gap-1 flex-wrap justify-end">
                <span className="text-2xl font-black tracking-tight" style={{ color: theme.primary }}>
                  {viewingGroup.totalVials}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide opacity-75" style={{ color: theme.text }}>
                  {containerLabel}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide opacity-50" style={{ color: theme.text }}>•</span>
                <span className="text-2xl font-black tracking-tight" style={{ color: theme.primary }}>
                  {viewingGroup.totalMg}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide opacity-75" style={{ color: theme.text }}>
                  {amountUnit}
                </span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wide opacity-60 -mt-0.5" style={{ color: theme.text }}>
                Total Stock
              </div>
            </div>
          )}
          theme={theme}
          maxHeight="90vh"
          footer={(
            <div className="w-full flex items-center justify-end px-2">
              <button
                onClick={() => {
                  if (isReadOnly) {
                    setShowUpgradeModal(true);
                    return;
                  }
                  // Open manage modal immediately - no delay needed when clicking from button
                  const groupName = viewingGroup.name;
                  setViewingGroup(null);
                  // Use requestAnimationFrame for smooth transition without blocking
                  requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                      openManage(groupName);
                    });
                  });
                }}
                className="px-8 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg hover:shadow-xl active:scale-95"
                style={{
                  background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.primary}dd 100%)`,
                  color: theme?.textOnPrimary || '#ffffff'
                }}
              >
                Edit Stockpile
              </button>
            </div>
          )}
        >
          <div className="space-y-4">
            {/* Detailed Inventory List */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <Beaker size={18} style={{ color: '#8ca68c' }} />
                <h4 className="text-sm font-semibold uppercase tracking-wide" style={{ color: theme.text }}>Research Vials</h4>
              </div>
              
              {Object.values(viewingGroup.variants)
                .sort((a, b) => String(a.mg).localeCompare(String(b.mg)))
                .map(variant => (
                  <div
                    key={variant.mg}
                    className="relative pl-4"
                  >
                    {/* Vertical indicator line */}
                    <div 
                      className="absolute left-0 top-1 bottom-1 w-1 rounded-full"
                      style={{ backgroundColor: '#8ca68c', opacity: 0.3 }}
                    />

                    <div className="flex items-center justify-between mb-3">
                      <div className="text-xs font-bold uppercase tracking-wide flex items-center gap-2" style={{ color: theme.text }}>
                        <span className="px-2.5 py-1 rounded-md bg-black/5 dark:bg-white/10 border border-black/5 dark:border-white/5 font-bold">
                          {variant.mg} {variant.unit || 'mg'}
                        </span>
                        <span className="opacity-40">•</span>
                        <span className="opacity-70 font-semibold">{variant.totalVials} {variant.totalVials === 1 ? 'Vial' : 'Vials'}</span>
                      </div>
                      <div className="h-px flex-1 ml-4 opacity-10" style={{ backgroundColor: theme.text }} />
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                      {variant.items.map(item => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl border transition-all hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
                          style={{ 
                            backgroundColor: theme.isDark ? 'rgba(255, 255, 255, 0.02)' : (theme?.cardBackground || '#fff'),
                            borderColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'
                          }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-black/5 dark:bg-white/10">
                                <Package size={18} style={{ color: theme.primary }} />
                              </div>
                              <div>
                                <div className="text-base font-bold" style={{ color: theme.text }}>
                                  {item.vendorId ? vendorMap[item.vendorId] : item.vendor || 'Unknown Vendor'}
                                </div>
                                {item.date && (
                                  <div className="text-xs font-medium opacity-70 mt-0.5" style={{ color: theme.text }}>
                                    Acquired {new Date(item.date).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                                  </div>
                                )}
                              </div>
                            </div>

                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-black/5 dark:border-white/5">
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60" style={{ color: theme.text }}>Purity</span>
                              <span className="text-base font-bold" style={{ color: theme.text }}>{item.purity ? `${item.purity}%` : 'N/A'}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60" style={{ color: theme.text }}>Batch #</span>
                              <span className="text-base font-bold truncate" style={{ color: theme.text }}>{item.batchNumber || 'N/A'}</span>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-60" style={{ color: theme.text }}>Cap Color</span>
                              <span className="text-base font-bold" style={{ color: theme.text }}>{item.capColor || 'N/A'}</span>
                            </div>
                          </div>

                          {item.notes && (
                            <div 
                              className={`mt-3 p-3 rounded-lg border ${
                                item.notes.includes('Added during protocol start') || item.notes.includes('Added during protocol edit')
                                  ? 'bg-yellow-500/10 border-yellow-500/30'
                                  : 'bg-black/5 dark:bg-white/5 border-black/5 dark:border-white/5'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <Info size={14} className="mt-0.5 flex-shrink-0" style={{ color: (item.notes.includes('Added during protocol start') || item.notes.includes('Added during protocol edit')) ? (theme.isDark ? '#fbbf24' : '#ca8a04') : theme.text }} />
                                <div className="flex-1">
                                  {(item.notes.includes('Added during protocol start') || item.notes.includes('Added during protocol edit')) && (
                                    <div className="font-semibold mb-1 text-sm flex items-center gap-1" style={{ color: theme.isDark ? '#fbbf24' : '#ca8a04' }}>
                                      <AlertTriangle size={14} /> Needs Review
                                    </div>
                                  )}
                                  <p className={`text-sm leading-relaxed ${(item.notes.includes('Added during protocol start') || item.notes.includes('Added during protocol edit')) ? 'font-normal' : 'italic opacity-70 font-normal'}`} style={{ color: (item.notes.includes('Added during protocol start') || item.notes.includes('Added during protocol edit')) ? (theme.isDark ? '#fbbf24' : '#ca8a04') : theme.text }}>{item.notes}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Reconstitution info - show when a matching recon item exists for this vial */}
                          {(() => {
                            // Match by stockpileId first, then by name
                            const matchedRecon = reconItems?.find(r => {
                              if (Array.isArray(r.peptides)) {
                                return r.peptides.some(p => p.stockpileId === item.id);
                              }
                              return false;
                            }) || reconItems?.find(r => {
                              if (!r.peptides || r.peptides.length === 0) return false;
                              const reconPeptideNames = r.peptides.map(p => (p.name || '').toLowerCase().trim());
                              const itemName = (item.name || '').toLowerCase().trim();
                              return itemName && reconPeptideNames.includes(itemName);
                            });
                            // Also check reconHistory if not found in active items
                            const matchedHistory = !matchedRecon ? (reconHistory?.find(r => {
                              if (Array.isArray(r.peptides)) {
                                return r.peptides.some(p => p.stockpileId === item.id);
                              }
                              return false;
                            }) || reconHistory?.find(r => {
                              if (!r.peptides || r.peptides.length === 0) return false;
                              const reconPeptideNames = r.peptides.map(p => (p.name || '').toLowerCase().trim());
                              const itemName = (item.name || '').toLowerCase().trim();
                              return itemName && reconPeptideNames.includes(itemName);
                            })) : null;
                            const reconEntry = matchedRecon || matchedHistory;
                            if (!reconEntry) return null;
                            const totalMg = Array.isArray(reconEntry.peptides)
                              ? reconEntry.peptides.reduce((sum, p) => sum + (Number(p.mg) || 0), 0)
                              : (Number(reconEntry.mg) || 0);
                            const water = Number(reconEntry.water) || 0;
                            if (totalMg <= 0 && water <= 0) return null;
                            const reconDate = reconEntry.date ? new Date(reconEntry.date).toLocaleDateString() : null;
                            const isHistory = !!matchedHistory && !matchedRecon;
                            return (
                              <div
                                className="mt-3 p-3 rounded-lg border cursor-pointer transition-all hover:opacity-80"
                                style={{
                                  backgroundColor: theme.isDark ? 'rgba(140,166,140,0.08)' : 'rgba(140,166,140,0.06)',
                                  borderColor: theme.isDark ? 'rgba(140,166,140,0.2)' : 'rgba(140,166,140,0.15)'
                                }}
                                onClick={() => navigate('/app/recon')}
                                title="View or edit reconstitution details on the Recon page"
                              >
                                <div className="flex items-center gap-2 mb-1.5">
                                  <Beaker size={14} style={{ color: '#8ca68c' }} />
                                  <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#8ca68c' }}>
                                    {isHistory ? 'Reconstitution (Finished)' : 'Reconstitution'}
                                  </span>
                                  <span style={{ color: '#8ca68c', marginLeft: 'auto', fontSize: '11px', fontWeight: 600 }}>
                                    View →
                                  </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs" style={{ color: theme.textLight }}>
                                  {reconDate && <span className="flex items-center gap-1"><Calendar size={12} /> {reconDate}</span>}
                                  <span className="flex items-center gap-1"><Pill size={12} /> {totalMg}{reconEntry.mgUnit || 'mg'}</span>
                                  <span className="flex items-center gap-1"><Droplet size={12} /> {water} mL</span>
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </BottomSheet>
            );
      })()}

      {/* Image Preview Modal */}
      <ImagePreviewModal
        image={previewImage}
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        theme={theme}
        readonly={true}
      />

      {/* Close Confirmation Modal */}
      {/* Delete Out of Stock Confirmation Modal */}
      <ConfirmationModal
        open={!!deleteOutOfStockGroup}
        onClose={() => setDeleteOutOfStockGroup(null)}
        onConfirm={async () => {
          if (!deleteOutOfStockGroup) return;

          const g = deleteOutOfStockGroup;
          const groupItems = Object.values(g.variants).flatMap(v => v.items);
          const itemCount = groupItems.length;

          try {
            // Record deletions for all items in the group
            groupItems.forEach(item => {
              recordDeletion('stockpile', item.id, item);
            });

            // Delete all items in this group
            const updatedItems = items.filter(i => {
              // Check if this item belongs to the group
              const itemName = i.name || '';
              const itemMgUnit = i.mgUnit || 'mg';
              const groupKey = `${g.name}__${g.unit}`;
              const itemKey = `${itemName}__${itemMgUnit}`;
              return itemKey !== groupKey;
            });

            setItems(updatedItems);

            // Sync to cloud
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
                  stockpile: updatedItems,
                  scheduledBuys: scheduledBuys || []
                };
                await saveAppData(userId, appData, { skipMerge: false });
              } catch (e) {
                console.error('Failed to sync deleted items to cloud:', e);
                window.dispatchEvent(new CustomEvent('tpp:toast', { 
                  detail: { 
                    message: 'Items deleted here, but couldn\'t update your other devices yet.', 
                    type: 'warning' 
                  } 
                }));
                setDeleteOutOfStockGroup(null);
                return;
              }
            }

            window.dispatchEvent(new CustomEvent('tpp:toast', { 
              detail: { 
                message: itemCount === 1 
                  ? 'Item deleted successfully' 
                  : `${itemCount} items deleted successfully`, 
                type: 'success' 
              } 
            }));
            setDeleteOutOfStockGroup(null);
          } catch (error) {
            console.error('Error deleting out of stock items:', error);
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
              detail: { 
                message: 'Failed to delete items. Please try again.', 
                type: 'error' 
              } 
            }));
            setDeleteOutOfStockGroup(null);
          }
        }}
        title="Delete Out of Stock Item"
        message={deleteOutOfStockGroup ? (
          (() => {
            const itemCount = Object.values(deleteOutOfStockGroup.variants).flatMap(v => v.items).length;
            return itemCount === 1
              ? `Are you sure you want to delete this out of stock item?\n\n${deleteOutOfStockGroup.name}`
              : `Are you sure you want to delete all ${itemCount} out of stock items for ${deleteOutOfStockGroup.name}?`;
          })()
        ) : ''}
        confirmText="Delete"
        cancelText="Cancel"
        type="delete"
        theme={theme}
      />

      {/* Order Details Modal for Incoming Orders */}
      <OrderDetailsModal
        open={showOrderModal}
        onClose={() => {
          setShowOrderModal(false);
          setEditingOrder(null);
        }}
        theme={theme}
        order={editingOrder}
        vendors={vendors}
        activeTab={editingOrder?.category || editingOrder?.type || 'domestic'}
        onSave={(data) => {
          const vendorId = vendors.find(v => v.name === data.vendor)?.id || null;
          if (editingOrder) {
            const updatedOrder = prepareItemForSave({
              ...editingOrder,
              ...data,
              vendorId
            });
            handleStockpileUpdate(editingOrder, updatedOrder);
            setOrders(prev => {
              const normalizedPrev = ensurePublicOrderNumbers(prev);
              return normalizedPrev.map(o => o.id === editingOrder.id ? updatedOrder : o);
            });
          } else {
            const category = data.category || 'domestic';
            const nextPublicNumber = getNextPublicOrderNumber(orders);
            const newOrder = prepareItemForSave({
              id: generateId(),
              publicOrderNumber: nextPublicNumber,
              ...data,
              vendorId,
              category,
              type: category
            }, { isNew: true });
            handleStockpileUpdate(null, newOrder);
            setOrders(prev => {
              const normalizedPrev = ensurePublicOrderNumbers(prev);
              return [newOrder, ...normalizedPrev];
            });
          }
          setShowOrderModal(false);
          setEditingOrder(null);
        }}
        onDelete={async (id) => {
          const orderToDelete = orders.find(o => o.id === id);
          if (orderToDelete) {
            // Remove from stockpile if delivered
            const status = (orderToDelete.status || '').toLowerCase();
            if (status.includes('delivered')) {
              const orderIdPrefix = `orderitem-${id}-`;
              setItems(prev => prev.filter(stockItem => {
                const itemId = stockItem?.id;
                if (!itemId || typeof itemId !== 'string') return true;
                return !itemId.startsWith(orderIdPrefix);
              }));
            }
            setOrders(prev => prev.filter(o => o.id !== id));
          }
          setShowOrderModal(false);
          setEditingOrder(null);
        }}
        isReadOnly={isReadOnly}
        onUpgrade={() => setShowUpgradeModal(true)}
      />

      {/* Slide Animation Styles */}
      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @keyframes slideOut {
          from {
            opacity: 1;
            transform: translateX(0);
          }
          to {
            opacity: 0;
            transform: translateX(-10px);
          }
        }
        .animate-slide-in {
          animation: slideIn 0.3s ease-out;
        }
        .animate-slide-out {
          animation: slideOut 0.3s ease-in;
        }
      `}</style>

      {/* Bulk Import Modal */}
      <BulkImportModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        theme={theme}
        onSave={async (itemsToAdd) => {
          try {
            // Build vendor name -> id map (existing + new) so we don't lose vendorId when addVendor is async
            const vendorNameToId = new Map();
            (vendors || []).forEach(v => {
              if (v?.name != null) vendorNameToId.set((v.name || '').trim().toLowerCase(), v.id);
            });
            itemsToAdd.forEach(item => {
              const name = (item.vendor || '').trim();
              if (!name) return;
              const key = name.toLowerCase();
              if (vendorNameToId.has(key)) return;
              const id = generateId();
              vendorNameToId.set(key, id);
              addVendor({ name, isStub: true, id });
            });

            // Resolve vendorId from map (works for existing and newly added vendors)
            const itemsWithVendorIds = itemsToAdd.map(item => {
              const key = (item.vendor || '').trim().toLowerCase();
              const vendorId = key ? (vendorNameToId.get(key) || null) : null;
              return prepareItemForSave(
                {
                  ...item,
                  vendorId
                },
                { isNew: true }
              );
            });

            // Add to stockpile
            setItems(prev => [...itemsWithVendorIds, ...prev]);

            // Show success toast
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
              detail: { 
                message: `✅ ${itemsToAdd.length} vial${itemsToAdd.length !== 1 ? 's' : ''} added to stockpile!`, 
                type: 'success' 
              } 
            }));

            // Sync to cloud
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
                stockpile: [...itemsWithVendorIds, ...items],
                scheduledBuys: scheduledBuys || []
              };
              await saveAppData(userId, appData, { skipMerge: false });
              } catch (e) {
                console.error('Failed to sync bulk import to cloud:', e);
              }
            }
          } catch (error) {
            console.error('Failed to save bulk imported items:', error);
            window.dispatchEvent(new CustomEvent('tpp:toast', { 
              detail: { 
                message: 'Failed to add items. Please try again.', 
                type: 'error' 
              } 
            }));
          }
        }}
      />

    </section>
  )
}
