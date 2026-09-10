import React, { useMemo, useState, useEffect, useCallback } from 'react'
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom'
import {
	IconContext,
	PlusCircle,
	Package,
	Truck,
	CheckCircle,
	CaretDown,
	Lock,
	ArrowRight,
	DownloadSimple,
} from '@phosphor-icons/react'
import OrderList from '../components/orders/OrderList'
import CustomDropdown from '../components/common/inputs/CustomDropdown'
import OrderDetailsModal from '../components/orders/OrderDetailsModal'
import OrdersTipsBanner from '../components/orders/OrdersTipsBanner'
import ScheduledBuysPanel from '../components/orders/ScheduledBuysPanel'
import { useAppContext } from '../context/AppContext'
import { generateId } from '../utils/string'
import { syncOrderDocumentationToStockpile, updateSyncedDocumentation, removeSyncedDocumentation } from '../utils/documentationSync'
import useLocalStorage from '../utils/hooks'
import { useSubscriptionAccess, useTierAccess } from '../utils/useSubscriptionAccess'
import UpgradeModal from '../components/common/UpgradeModal'
import { ensurePublicOrderNumbers, getNextPublicOrderNumber } from '../utils/orderNumbers'
import { exportToCSV } from '../utils/export'
import { saveAppData } from '../services/cloudStorage'
import { prepareItemForSave } from '../utils/userDataSave'
import { useFirebase } from '../context/FirebaseContext'
import { safeLocalStorageGet } from '../utils/dataBleedDiagnostic'
import { recordDeletion, getDeletionTracking } from '../utils/deletionTracking'
import { syncAllOrdersFromTracking } from '../utils/trackingStatusSync'
import OwnerFilter from '../components/buddy/OwnerFilter'
import { filterByOwner } from '../utils/buddies'
import Wishlist from '../components/dashboard/Wishlist'
import AddWishlistItemModal from '../components/dashboard/AddWishlistItemModal'
import AddToStockpileBottomSheet from '../components/stockpile/AddToStockpileBottomSheet'
import { buildOrderPrefillFromWishlistItem, buildStockpilePrefillFromWishlistItem } from '../utils/wishlistAcquirePrefill'
import { markWishlistItemAcquired } from '../utils/wishlistHistory'
import { getOrderItemOrderQuantity, getOrderItemVialCount, getUnitMultiplier } from '../utils/unitConversion'
import { useIsSimpleMode } from '../hooks/useIsSimpleMode'

export default function Orders() {
	const { theme } = useOutletContext()
	const simpleMode = useIsSimpleMode()
	const { orders: appOrders, setOrders, vendors, addVendor, stockpile, setStockpile, protocols, reconItems, reconHistory, supplements, metrics, calendarNotes, scheduledBuys, ownerFilter } = useAppContext();
	const orders = useMemo(() => ensurePublicOrderNumbers(appOrders), [appOrders]);
	const { isReadOnly } = useSubscriptionAccess();
	const { canAddOrder, caps } = useTierAccess();
	const { firebaseUser } = useFirebase();
	const location = useLocation()
	const navigate = useNavigate()
	const [pageTab, setPageTab] = useState('orders') // 'orders' | 'wishlist'
	const [categoryFilter, setCategoryFilter] = useState('all') // 'all' | 'domestic' | 'international' | 'groupbuy'
	const [returnToStockpileIncoming, setReturnToStockpileIncoming] = useState(false)

	// Display-only: in Simple, list all categories (does not clear stored order.category)
	useEffect(() => {
		if (simpleMode && categoryFilter !== 'all') setCategoryFilter('all');
	}, [simpleMode, categoryFilter]);
	const [showAddModal, setShowAddModal] = useState(false)
	const [editingOrder, setEditingOrder] = useState(null)
	const [showUpgradeModal, setShowUpgradeModal] = useState(false)
	const [searchQuery, setSearchQuery] = useState('')
	const [groupBuysEnabled, setGroupBuysEnabled] = useState(true);
	const [deletingOrderId, setDeletingOrderId] = useState(null);

	// Wishlist tab state
	const [wishlist, setWishlist] = useState(() => {
		try { return JSON.parse(localStorage.getItem('tpprover_wishlist') || '[]'); } catch { return []; }
	});
	const [showAddWishlistModal, setShowAddWishlistModal] = useState(false);
	const [editingWishlistItem, setEditingWishlistItem] = useState(null);
	const [showStockpileAdd, setShowStockpileAdd] = useState(false);
	const [wishlistStockpilePrefill, setWishlistStockpilePrefill] = useState(null);
	
	// ── Free-plan: count of non-delivered orders (drives the cap gate) ────
	// Delivered orders are historical — they never block the add button.
	const activeOrderCount = useMemo(() => {
		return (orders || []).filter(o => {
			if (!o || o.deleted) return false;
			return !(o.status || '').toLowerCase().includes('delivered');
		}).length;
	}, [orders]);

	// Helper function to delete order with immediate cloud sync
	const handleDeleteOrder = async (id, retryCount = 0) => {
		// Find the order being deleted for logging
		const orderToDelete = orders.find(o => o.id === id);
		
		if (orderToDelete) {
			console.log('🗑️ Deleting order:', orderToDelete.publicOrderNumber || orderToDelete.id || 'Unknown');
		}
		
		// Set loading state
		setDeletingOrderId(id);
		
		// Store original state for error recovery
		const originalOrders = [...orders];
		const originalStockpile = [...(stockpile || [])];
		
		try {
			// Step 1: Record deletion BEFORE removing from state with item snapshot
			// This ensures deletion is tracked and can be restored if needed
			if (orderToDelete) {
				recordDeletion('orders', id, orderToDelete);
			} else {
				recordDeletion('orders', id);
			}
			
			// Step 2: Remove stockpile items associated with this order
			const orderIdPrefix = `orderitem-${id}-`;
			const stockpileItemsToDelete = [];
			const updatedStockpile = (stockpile || []).filter(stockItem => {
				const itemId = stockItem?.id;
				if (!itemId || typeof itemId !== 'string') return true;
				const shouldKeep = !itemId.startsWith(orderIdPrefix);
				if (!shouldKeep) {
					stockpileItemsToDelete.push({ itemId, itemData: stockItem });
				}
				return shouldKeep;
			});
			
			// Record stockpile item deletions with snapshots
			stockpileItemsToDelete.forEach(({ itemId, itemData }) => {
				recordDeletion('stockpile', itemId, itemData);
			});
			
			// Update stockpile state immediately
			if (updatedStockpile.length !== (stockpile || []).length) {
				setStockpile(updatedStockpile);
				console.log('🧹 Removed stockpile items for deleted order');
			}
			
			// Step 3: Remove from local orders state
			const updatedOrders = orders.filter(o => o.id !== id);
			setOrders(updatedOrders);
			
			// Step 4: Wait a brief moment to ensure state updates complete
			await new Promise(resolve => setTimeout(resolve, 100));
			
			// Step 5: Get deletion tracking to include in sync
			const deletionTracking = getDeletionTracking();
			
			// Step 6: Force immediate cloud sync with skipMerge to ensure deletion persists
			// This prevents server data from restoring deleted items
			if (firebaseUser) {
				const userId = firebaseUser.uid;
				const userEmail = firebaseUser.email;
				// Use safe localStorage getter to prevent data bleed
				const taskCompletion = safeLocalStorageGet('tpprover_task_completion', userEmail) || {};
				const calendarDone = safeLocalStorageGet('tpprover_calendar_done', userEmail) || {};
				
				const appData = {
					protocols: protocols || [],
					reconItems: reconItems || [],
					reconHistory: reconHistory || [],
					supplements: supplements || [],
					orders: updatedOrders, // Use updated orders with deletion
					metrics: metrics || [],
					vendors: vendors || [],
					calendarNotes: calendarNotes || {},
					stockpile: updatedStockpile, // Use updated stockpile with items removed
					scheduledBuys: scheduledBuys || [],
					taskCompletion,
					calendarDone,
					deletionTracking // Include deletion tracking in sync
				};
				
				// Force immediate sync with skipMerge to overwrite server data
				const syncResult = await saveAppData(userId, appData, { skipMerge: true });
				
				if (syncResult) {
					console.log('✅ Deleted order synced to cloud immediately');
					window.dispatchEvent(new CustomEvent('tpp:toast', {
						detail: {
							message: 'Order deleted successfully! 🗑️',
							type: 'success',
							duration: 3000
						}
					}));
				} else {
					// Retry once if sync failed
					if (retryCount < 1) {
						console.log('🔄 Retrying order deletion sync...');
						await new Promise(resolve => setTimeout(resolve, 1000));
						return handleDeleteOrder(id, retryCount + 1);
					} else {
						console.error('❌ Failed to sync deleted order to cloud after retry');
						window.dispatchEvent(new CustomEvent('tpp:toast', {
							detail: {
								message: 'Order deleted here, but couldn\'t update your other devices. It may reappear — please try again.',
								type: 'error',
								duration: 5000
							}
						}));
						// Restore the original state since sync failed
						setOrders(originalOrders);
						setStockpile(originalStockpile);
					}
				}
			} else {
				// User not logged in - deletion is local only
				// CRITICAL: Explicitly save to localStorage to ensure persistence
				// The useEffect in AppContext should handle this, but we'll do it explicitly here
				// to ensure it happens even if there's a timing issue
				try {
					localStorage.setItem('tpprover_orders', JSON.stringify(updatedOrders));
					localStorage.setItem('tpprover_stockpile', JSON.stringify(updatedStockpile));
					// Deletion tracking is already saved by recordDeletion function
					console.log('💾 Deleted order saved to localStorage (local only)');
				} catch (localError) {
					console.error('❌ Failed to save deletion to localStorage:', localError);
				}
				
				window.dispatchEvent(new CustomEvent('tpp:toast', {
					detail: {
						message: 'Order deleted successfully! 🗑️',
						type: 'success',
						duration: 3000
					}
				}));
			}
		} catch (error) {
			console.error('❌ Error deleting order:', error);
			window.dispatchEvent(new CustomEvent('tpp:toast', {
				detail: {
					message: 'Failed to delete order. Please try again.',
					type: 'error',
					duration: 4000
				}
			}));
			// Restore the original state on error
			setOrders(originalOrders);
			setStockpile(originalStockpile);
		} finally {
			setDeletingOrderId(null);
		}
	};

	useEffect(() => {
		if (location.state?.activeTab === 'wishlist') {
			setPageTab('wishlist');
		} else if (location.state?.activeTab === 'orders') {
			setPageTab('orders');
		}
		if (location.state?.categoryFilter) {
			setCategoryFilter(location.state.categoryFilter);
		}
		if (location.state?.openOrderId) {
			const orderToOpen = orders.find(o => o.id === location.state.openOrderId);
			if (orderToOpen) {
				setEditingOrder(orderToOpen);
				setShowAddModal(true);
				// Store return flag if set
				if (location.state?.returnToStockpileIncoming) {
					setReturnToStockpileIncoming(true);
				}
				// Optional: clear state after use
				window.history.replaceState({}, document.title)
			}
		}
		
		// Check for ?orderId=xxx query parameter (from notifications)
		const params = new URLSearchParams(location.search);
		const orderIdFromQuery = params.get('orderId');
		if (orderIdFromQuery) {
			const orderToOpen = orders.find(o => o.id === orderIdFromQuery);
			if (orderToOpen) {
				setEditingOrder(orderToOpen);
				setShowAddModal(true);
				// Clear the query parameter
				window.history.replaceState({}, document.title, location.pathname);
			}
		}
		
		// Check for ?new=true query parameter to open new order modal
		if (params.get('new') === 'true') {
			if (isReadOnly) {
				setShowUpgradeModal(true);
			} else {
				setShowAddModal(true);
			}
			// Clear the query parameter
			window.history.replaceState({}, document.title, location.pathname);
		}
	}, [location.state, location.search, location.pathname, orders, isReadOnly])

	// Sync editingOrder with updated orders when order changes (e.g., from quick buttons)
	useEffect(() => {
		if (editingOrder?.id && showAddModal) {
			const updatedOrder = orders.find(o => o.id === editingOrder.id);
			if (updatedOrder) {
				// Check if status or other key fields changed
				const statusChanged = updatedOrder.status !== editingOrder.status;
				const shipDateChanged = updatedOrder.shipDate !== editingOrder.shipDate;
				const deliveryDateChanged = updatedOrder.deliveryDate !== editingOrder.deliveryDate;
				const updatedAtChanged = updatedOrder.updatedAt !== editingOrder.updatedAt;
				
				if (statusChanged || shipDateChanged || deliveryDateChanged || updatedAtChanged) {
					setEditingOrder(updatedOrder);
				}
			}
		}
	}, [orders, editingOrder?.id, showAddModal])

	// Clear any stale tracking cache entries that may have corrupt mock-delivered data.
	// Runs once on mount so next tracking sync fetches fresh real data.
	useEffect(() => {
		try {
			const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith('tracking_'));
			keysToRemove.forEach(k => localStorage.removeItem(k));
			if (keysToRemove.length > 0) {
				console.log(`🧹 Cleared ${keysToRemove.length} stale tracking cache entries`);
			}
		} catch (e) { /* ignore */ }
	}, []);

	// Automatically sync order status from tracking data
	useEffect(() => {
		let syncInterval;
		let isSyncing = false;
		const lastSyncRef = { time: 0 };
		
		const syncOrdersFromTracking = async () => {
			// Prevent concurrent syncs and throttle to at most once per minute
			const now = Date.now();
			if (isSyncing) {
				return;
			}
			if ((now - lastSyncRef.time) < 60000) {
				return;
			}
			
			isSyncing = true;
			lastSyncRef.time = now;
			
			try {
				// Get current orders from localStorage (most up-to-date source)
				const currentOrders = JSON.parse(localStorage.getItem('tpprover_orders') || '[]');
			const ordersWithTracking = currentOrders.filter(o => o?.tracking && o.tracking.trim() !== '');
			
			if (ordersWithTracking.length === 0) {
				return;
			}
			
			const updatedOrders = await syncAllOrdersFromTracking(currentOrders);
			
			if (updatedOrders.length > 0) {
					
					// Update each order that changed
					updatedOrders.forEach(updatedOrder => {
						const originalOrder = currentOrders.find(o => o.id === updatedOrder.id);
						if (originalOrder) {
							// Update stockpile if status changed to/from delivered
							handleStockpileUpdate(originalOrder, updatedOrder);
							
							// Update orders state using functional update
							setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
							
							// Show toast notification
							if (updatedOrder.status === 'Shipped') {
								window.dispatchEvent(new CustomEvent('tpp:toast', { 
									detail: { 
										message: `🚚 Order #${updatedOrder.publicOrderNumber || updatedOrder.id} is now in transit!`, 
										type: 'info',
										duration: 4000
									} 
								}));
							} else if (updatedOrder.status === 'Delivered') {
								window.dispatchEvent(new CustomEvent('tpp:toast', { 
									detail: { 
										message: `📦 Order #${updatedOrder.publicOrderNumber || updatedOrder.id} has been delivered!`, 
										type: 'success',
										duration: 5000
									} 
								}));
							}
						}
					});
					
					// Save to cloud after state updates
					setTimeout(async () => {
						try {
							// Get updated orders from localStorage (they should be saved by AppContext useEffect)
							const savedOrders = JSON.parse(localStorage.getItem('tpprover_orders') || '[]');
							
							// Sync to cloud if user is logged in
							const currentFirebaseUser = firebaseUser; // Access from closure
							if (currentFirebaseUser && updatedOrders.length > 0) {
								const userId = currentFirebaseUser.uid;
								const userEmail = currentFirebaseUser.email;
								const taskCompletion = safeLocalStorageGet('tpprover_task_completion', userEmail) || {};
								const calendarDone = safeLocalStorageGet('tpprover_calendar_done', userEmail) || {};
								const currentStockpile = JSON.parse(localStorage.getItem('tpprover_stockpile') || '[]');
								
								const appData = {
									protocols: protocols || [],
									reconItems: reconItems || [],
									reconHistory: reconHistory || [],
									supplements: supplements || [],
									orders: savedOrders,
									metrics: metrics || [],
									vendors: vendors || [],
									calendarNotes: calendarNotes || {},
									stockpile: currentStockpile,
									scheduledBuys: scheduledBuys || [],
									taskCompletion,
									calendarDone
								};
								
								// Use skipMerge: false for intelligent timestamp-based conflict resolution
							await saveAppData(userId, appData, { skipMerge: false });
							}
						} catch (error) {
							console.error('❌ Failed to sync order status updates to cloud:', error);
						}
					}, 200);
				}
			} catch (error) {
				console.error('❌ Error syncing orders from tracking:', error);
			} finally {
				isSyncing = false;
			}
		};
		
	// Sync immediately on mount (with a small delay to let component settle)
	const initialTimeout = setTimeout(() => {
		syncOrdersFromTracking();
	}, 2000);
	
	// Fallback sync every 30 minutes (EasyPost webhooks handle real-time updates)
	syncInterval = setInterval(() => {
		syncOrdersFromTracking();
	}, 30 * 60 * 1000);
	
	return () => {
		clearTimeout(initialTimeout);
			if (syncInterval) {
				clearInterval(syncInterval);
			}
		};
	}, []) // Empty deps - only run once on mount/unmount

	useEffect(() => {
		const addOrder = () => {
			if (isReadOnly) { setShowUpgradeModal(true); return; }
			if (!canAddOrder) { setShowUpgradeModal(true); return; }
			setEditingOrder(null);
			setShowAddModal(true);
		};
		const addWishlist = () => {
			// Wishlist is unlimited on all plans — never block this
			setEditingWishlistItem(null);
			setShowAddWishlistModal(true);
		};
		window.dispatchEvent(new CustomEvent('tpp:set-topbar-tabs', {
			detail: {
				tabs: [
					{ value: 'orders', label: 'Orders' },
					{ value: 'wishlist', label: 'Wishlist' },
				],
				activeTab: pageTab,
				onTabChange: (tab) => setPageTab(tab),
				actionItems: [
					{ label: 'Add Order',       onClick: addOrder   },
					{ label: 'Add to Wishlist', onClick: addWishlist },
				],
				actionDisabled: false
			}
		}));
		const handleSearch = (e) => { setSearchQuery(e.detail?.query ?? ''); };
		window.addEventListener('tpp:orders-search', handleSearch);
		return () => {
			window.dispatchEvent(new CustomEvent('tpp:clear-topbar-tabs'));
			window.removeEventListener('tpp:orders-search', handleSearch);
		};
	}, [isReadOnly, canAddOrder, pageTab])


	const filteredOrders = useMemo(() => {
		const byOwner = filterByOwner(orders, ownerFilter);
		if (searchQuery) {
			return byOwner.filter(o => {
				const peptideMatch = (o.peptide || '').toLowerCase().includes(searchQuery.toLowerCase());
				const vendorMatch = (o.vendor || '').toLowerCase().includes(searchQuery.toLowerCase());
				return peptideMatch || vendorMatch;
			});
		}
		return byOwner;
	}, [orders, searchQuery, ownerFilter]);
	
	const filteredOrdersByCategory = useMemo(() => {
		return filteredOrders.filter(o => {
			const orderCategory = (o.category || o.type || 'domestic').toLowerCase();
			return categoryFilter === 'all' || orderCategory === categoryFilter;
		});
	}, [filteredOrders, categoryFilter]);

	// Sort by tracking status (Order Placed → Shipped → Delivered) then by order date (newest first)
	const statusRank = (status) => {
		const s = (status || 'order placed').toLowerCase();
		if (s.includes('delivered')) return 2;
		if (s.includes('ship')) return 1;
		return 0; // Order Placed / default
	};
	const sortedOrdersByCategory = useMemo(() => {
		return [...filteredOrdersByCategory].sort((a, b) => {
			const rankA = statusRank(a.status);
			const rankB = statusRank(b.status);
			if (rankA !== rankB) return rankA - rankB;
			const dateA = new Date(a.date || a.updatedAt || 0).getTime();
			const dateB = new Date(b.date || b.updatedAt || 0).getTime();
			return dateB - dateA; // newer first
		});
	}, [filteredOrdersByCategory]);

	/** Counts for the orders tab stats strip (matches current category + owner filters). */
	const ordersTabStats = useMemo(() => {
		let active = 0;
		let transit = 0;
		let delivered = 0;
		for (const o of sortedOrdersByCategory) {
			if (!o || o.deleted) continue;
			const s = (o.status || '').toLowerCase();
			if (s.includes('deliver')) delivered += 1;
			else {
				active += 1;
				if (s.includes('ship') || s.includes('transit')) transit += 1;
			}
		}
		return { active, transit, delivered };
	}, [sortedOrdersByCategory]);

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
		console.log('📦 Stockpile update - includeShipping setting:', includeShipping, 'from settings:', settings.orders);
		console.log('📦 Stockpile update - previousOrder:', previousOrder?.id, 'status:', prevStatus, 'wasDelivered:', wasDelivered);
		console.log('📦 Stockpile update - newOrder:', newOrder.id, 'status:', newStatus, 'isDelivered:', isDelivered);
		console.log('📦 Stockpile update - newOrder.items:', newOrder.items?.length || 0, 'items');

		// If both orders are delivered, we need to update existing stockpile items
		if (wasDelivered && isDelivered && previousOrder && newOrder) {
			const orderIdPrefix = `orderitem-${newOrder.id}-`;
			
			// Remove old stockpile items for this order
			setStockpile(prev => prev.filter(stockItem => {
				const itemId = stockItem?.id;
				// Type safety: ensure itemId is a string before calling startsWith
				if (!itemId || typeof itemId !== 'string') return true;
				return !itemId.startsWith(orderIdPrefix);
			}));
			
			// Add updated stockpile items
			const updatedStockItems = (newOrder.items || []).map(item => {
				const orderCtx = { orderId: newOrder.id };
				const { quantity: orderQty } = getOrderItemOrderQuantity(item, orderCtx);
				const vialCount = getOrderItemVialCount(item, orderCtx);
				const price = Number(item.price) || 0;
				
				let costPerVial;
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
					costPerVial = vialCount > 1 ? totalItemCost / vialCount : totalItemCost;
				} else {
					const perContainer = getUnitMultiplier(item.unit);
					costPerVial = perContainer > 1 ? price / perContainer : price;
				}

				return prepareItemForSave({
					id: `orderitem-${newOrder.id}-${item.id}`,
					name: item.name || '',
					mg: item.mg || '',
					mgUnit: item.mgUnit || 'mg',
					quantity: vialCount,
					unit: 'vial',
					cost: costPerVial,
					costPerMg: item.costPerMg || '',
					vendor: newOrder.vendor || '',
					vendorId: newOrder.vendorId,
					purchaseDate: newOrder.date,
					notes: `From order #${newOrder.publicOrderNumber ?? newOrder.id}`,
					orderId: newOrder.id
				}, { isNew: true });
			});
			setStockpile(prev => [...prev, ...updatedStockItems]);
			return;
		}

		// Status changed TO Delivered: Add items to stockpile.
		if (!wasDelivered && isDelivered) {
			// Ensure we have items to add
			if (!newOrder.items || newOrder.items.length === 0) {
				console.log('⚠️ handleStockpileUpdate: Order is delivered but has no items, skipping stockpile update');
				return;
			}

			console.log('📦 Adding items to stockpile for delivered order:', newOrder.id);
			const newStockItems = (newOrder.items || []).map(item => {
				const orderCtx = { orderId: newOrder.id };
				const { quantity: orderQty } = getOrderItemOrderQuantity(item, orderCtx);
				const vialCount = getOrderItemVialCount(item, orderCtx);
				const price = Number(item.price) || 0;
				
				let costPerVial;
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
					costPerVial = vialCount > 1 ? totalItemCost / vialCount : totalItemCost;
				} else {
					const perContainer = getUnitMultiplier(item.unit);
					costPerVial = perContainer > 1 ? price / perContainer : price;
				}

				return prepareItemForSave({
					id: `orderitem-${newOrder.id}-${item.id}`,
					name: item.name || '',
					mg: item.mg || '',
					mgUnit: item.mgUnit || 'mg',
					quantity: vialCount,
					unit: 'vial',
					cost: costPerVial,
					costPerMg: item.costPerMg || '',
					vendor: newOrder.vendor || '',
					vendorId: newOrder.vendorId,
					purchaseDate: newOrder.date,
					notes: `From order #${newOrder.publicOrderNumber ?? newOrder.id}`,
					orderId: newOrder.id
				}, { isNew: true });
			});

			// Sync documentation from order to stockpile items
			const stockItemsWithDocs = syncOrderDocumentationToStockpile(newOrder, newStockItems);
			setStockpile(prev => [...prev, ...stockItemsWithDocs]);
		} 
		// Status changed FROM Delivered: Remove items from stockpile.
		else if (wasDelivered && !isDelivered) {
			const orderIdPrefix = `orderitem-${previousOrder.id}-`;
			setStockpile(prev => prev.filter(stockItem => {
				const itemId = stockItem?.id;
				// Type safety: ensure itemId is a string before calling startsWith
				if (!itemId || typeof itemId !== 'string') return true;
				return !itemId.startsWith(orderIdPrefix);
			}));
		}
	};

	// Wishlist event sync
	useEffect(() => {
		const loadWishlist = () => {
			try {
				const raw = localStorage.getItem('tpprover_wishlist');
				setWishlist(raw ? JSON.parse(raw) : []);
			} catch { setWishlist([]); }
		};
		loadWishlist();
		const onUpdated = (e) => e.detail?.wishlist ? setWishlist(e.detail.wishlist) : loadWishlist();
		const onCloud = () => loadWishlist();
		const onStorage = (e) => { if (e.key === 'tpprover_wishlist') loadWishlist(); };
		window.addEventListener('tpp:wishlist-updated', onUpdated);
		window.addEventListener('tpp:cloud-data-loaded', onCloud);
		window.addEventListener('storage', onStorage);
		return () => {
			window.removeEventListener('tpp:wishlist-updated', onUpdated);
			window.removeEventListener('tpp:cloud-data-loaded', onCloud);
			window.removeEventListener('storage', onStorage);
		};
	}, []);

	const wishlistCanvasStyle = useMemo(() => {
		const p = theme.primary;
		const pl = theme.primaryLight || theme.primary;
		const acc = theme.accent || theme.primaryLight || theme.primary;
		const base = theme.background;
		if (theme.isDark) {
			return {
				backgroundColor: base,
				backgroundImage: `radial-gradient(ellipse 80% 55% at 15% 0%, ${p}20 0%, transparent 55%), radial-gradient(ellipse 70% 50% at 100% 100%, ${acc}18 0%, transparent 50%), linear-gradient(165deg, ${pl}0a 0%, transparent 40%)`,
				borderColor: `${p}28`,
				boxShadow: `inset 0 1px 0 ${pl}12, 0 12px 40px rgba(0,0,0,0.25)`,
			};
		}
		return {
			backgroundColor: theme.secondary || base,
			backgroundImage: `radial-gradient(ellipse 90% 60% at 8% 0%, ${p}14 0%, transparent 52%), radial-gradient(ellipse 70% 55% at 100% 90%, ${acc}12 0%, transparent 48%), linear-gradient(180deg, rgba(255,255,255,0.55) 0%, transparent 28%)`,
			borderColor: `${p}18`,
			boxShadow: `inset 0 1px 0 rgba(255,255,255,0.65), 0 10px 36px ${p}12`,
		};
	}, [theme]);

	const handleWishlistAcquire = useCallback((item, destination) => {
		if (isReadOnly) { setShowUpgradeModal(true); return; }
		if (!item?.id) return;
		const next = markWishlistItemAcquired(item);
		setWishlist(next);
		if (destination === 'order') {
			setEditingOrder(buildOrderPrefillFromWishlistItem(item));
			setShowAddModal(true);
		} else {
			setWishlistStockpilePrefill(buildStockpilePrefillFromWishlistItem(item));
			setShowStockpileAdd(true);
		}
	}, [isReadOnly]);

	const handleSaveWishlistItem = useCallback((item) => {
		if (isReadOnly) { setShowUpgradeModal(true); return; }
		const newItem = prepareItemForSave(
			{ ...item, createdAt: item.createdAt || new Date().toISOString() },
			{ isNew: !item.id }
		);
		setWishlist((prev) => {
			const isEdit = item.id && prev.some((i) => i.id === item.id);
			const updated = isEdit
				? prev.map((i) => (i.id === item.id ? prepareItemForSave({ ...i, ...newItem }) : i))
				: [...prev, newItem];
			try {
				localStorage.setItem('tpprover_wishlist', JSON.stringify(updated));
				localStorage.setItem('tpprover_wishlist_lastUpdate', String(Date.now()));
			} catch (e) { console.error('Failed to save wishlist to localStorage:', e); }
			window.dispatchEvent(new CustomEvent('tpp:wishlist-updated', { detail: { wishlist: updated } }));
			return updated;
		});
		setShowAddWishlistModal(false);
		setEditingWishlistItem(null);
		window.dispatchEvent(new CustomEvent('tpp:toast', {
			detail: { message: item.id ? 'Wishlist item updated' : 'Item added to wishlist', type: 'success' }
		}));
	}, [isReadOnly]);

	const handleDeleteWishlistItem = useCallback((item) => {
		if (isReadOnly) { setShowUpgradeModal(true); return; }
		if (!item?.id) return;
		setWishlist((prev) => {
			const updated = prev.filter((i) => String(i.id) !== String(item.id));
			try {
				localStorage.setItem('tpprover_wishlist', JSON.stringify(updated));
				localStorage.setItem('tpprover_wishlist_lastUpdate', String(Date.now()));
			} catch (e) { console.error('Failed to save wishlist to localStorage:', e); }
			window.dispatchEvent(new CustomEvent('tpp:wishlist-updated', { detail: { wishlist: updated } }));
			return updated;
		});
		recordDeletion('wishlist', String(item.id), item);
		setShowAddWishlistModal(false);
		setEditingWishlistItem(null);
		window.dispatchEvent(new CustomEvent('tpp:toast', {
			detail: { message: 'Wishlist item deleted', type: 'success' }
		}));
	}, [isReadOnly]);

	const advanceOrderStatus = async (order) => {
		const currentStatus = (order.status || 'Order Placed').toLowerCase();
		let nextStatus = 'Order Placed';
		if (currentStatus.includes('placed') || currentStatus.includes('delayed')) {
			nextStatus = 'Shipped';
		} else if (currentStatus.includes('ship') || currentStatus.includes('transit')) {
			nextStatus = 'Delivered';
		} else {
			return; // Don't cycle past 'Delivered'
		}

		// Prepare order with fresh timestamp for proper sync
		const updatedOrder = prepareItemForSave({ 
			...order, 
			status: nextStatus,
			// Mark this as a manual status change to prevent tracking sync from overriding
			statusSource: 'manual',
			statusManuallySetAt: new Date().toISOString()
		});
		
		if (nextStatus === 'Shipped' && !order.shipDate) {
			updatedOrder.shipDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
		}
		if (nextStatus === 'Delivered' && !order.deliveryDate) {
			updatedOrder.deliveryDate = new Date().toISOString().slice(0, 10); // YYYY-MM-DD format
		}
		
		handleStockpileUpdate(order, updatedOrder);
		
		// Calculate updated orders list
		const updatedOrders = orders.map(o => o.id === order.id ? updatedOrder : o);
		
		// Update local state
		setOrders(updatedOrders);
		
		// Explicitly save to localStorage immediately
		try {
			localStorage.setItem('tpprover_orders', JSON.stringify(updatedOrders));
		} catch (error) {
			console.error('❌ Failed to save order status to localStorage:', error);
		}
		
		// Force sync to cloud immediately with skipMerge: false for proper timestamp conflict resolution
		if (firebaseUser) {
			// Use a small delay to ensure stockpile state has updated from handleStockpileUpdate
			setTimeout(async () => {
				try {
					const userId = firebaseUser.uid;
					const userEmail = firebaseUser.email;
					const taskCompletion = safeLocalStorageGet('tpprover_task_completion', userEmail) || {};
					const calendarDone = safeLocalStorageGet('tpprover_calendar_done', userEmail) || {};
					
					// Get current stockpile from localStorage to ensure we have the latest
					const currentStockpile = JSON.parse(localStorage.getItem('tpprover_stockpile') || '[]');
					
					const appData = {
						protocols: protocols || [],
						reconItems: reconItems || [],
						reconHistory: reconHistory || [],
						supplements: supplements || [],
						orders: updatedOrders,
						metrics: metrics || [],
						vendors: vendors || [],
						calendarNotes: calendarNotes || {},
						stockpile: currentStockpile,
						scheduledBuys: scheduledBuys || [],
						taskCompletion,
						calendarDone
					};
					
					// Use skipMerge: false for intelligent timestamp-based merging
					await saveAppData(userId, appData, { skipMerge: false });
					console.log('✅ Order status synced to cloud with force merge');
				} catch (error) {
					console.error('❌ Failed to sync order status to cloud:', error);
					// Don't show error to user - local change is saved, cloud sync will retry later
				}
			}, 100); // Small delay to allow stockpile state to update
		}
		
		// Show toast notification
		if (nextStatus === 'Shipped') {
			window.dispatchEvent(new CustomEvent('tpp:toast', { 
				detail: { 
					message: '🚚 Order marked as shipped!', 
					type: 'info' 
				} 
			}));
		} else if (nextStatus === 'Delivered') {
			window.dispatchEvent(new CustomEvent('tpp:toast', { 
				detail: { 
					message: '📦 Order marked as delivered!', 
					type: 'success' 
				} 
			}));
		}
	};

	// Count orders by category (for filter pills) and by status (for current filter view)
	const categoryCounts = useMemo(() => {
		const getCat = (o) => (o.category || o.type || 'domestic').toLowerCase();
		let all = 0, domestic = 0, international = 0, groupbuy = 0;
		filteredOrders.forEach(o => {
			const c = getCat(o);
			all++;
			if (c === 'domestic') domestic++;
			else if (c === 'international') international++;
			else if (c === 'groupbuy') groupbuy++;
		});
		return { all, domestic, international, groupbuy };
	}, [filteredOrders]);
	return (
		<IconContext.Provider value={{ weight: 'duotone' }}>
		<section className="page-bg px-2 sm:px-4 md:px-6 lg:px-8 pb-20 lg:pb-6">

			{/* ── Wishlist tab ── */}
			{pageTab === 'wishlist' && (
				<div className="min-h-full w-full max-w-full overflow-x-hidden">
					<div className="pb-12 max-w-5xl mx-auto pt-3">
						<div
							className="relative flex flex-col rounded-[1.75rem] border overflow-hidden min-h-[60vh]"
							style={wishlistCanvasStyle}
						>
							<div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.75rem] z-0" aria-hidden="true">
								<div className="absolute -top-28 -left-24 h-72 w-72 rounded-full opacity-[0.14] blur-3xl" style={{ backgroundColor: theme.primary }} />
								<div className="absolute -bottom-20 -right-16 h-56 w-56 rounded-full opacity-[0.12] blur-3xl" style={{ backgroundColor: theme.accent || theme.primaryLight || theme.primary }} />
							</div>
							<div className="relative z-10 flex flex-col min-h-[60vh] min-w-0 flex-1">
								<div className="flex-1 min-h-0 flex flex-col px-1 py-2 sm:px-2 sm:py-3">
									<Wishlist
										variant="page"
										section="board"
										wishlist={wishlist}
										theme={theme}
										onAdd={() => { if (isReadOnly) { setShowUpgradeModal(true); return; } setEditingWishlistItem(null); setShowAddWishlistModal(true); }}
										onEdit={(item) => { if (isReadOnly) { setShowUpgradeModal(true); return; } setEditingWishlistItem(item); setShowAddWishlistModal(true); }}
										onAcquireDestination={handleWishlistAcquire}
										isReadOnly={isReadOnly}
									/>
								</div>
							</div>
							{isReadOnly && (
								<div className="absolute inset-0 rounded-[1.75rem] backdrop-blur-sm flex items-center justify-center z-20" style={{ backgroundColor: theme.isDark ? 'rgba(15,18,24,0.75)' : 'rgba(255,255,255,0.82)' }}>
									<div className="text-center p-4 max-w-xs">
										<div className="w-16 h-16 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ backgroundColor: `${theme.primary}20` }}>
											<Lock size={36} style={{ color: theme.primary }} />
										</div>
										<p className="text-sm font-semibold mb-2" style={{ color: theme.primaryDark }}>Trial has ended</p>
										<button type="button" onClick={() => setShowUpgradeModal(true)} className="px-4 py-2 rounded-lg font-medium text-sm btn-primary-inset" style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}>
											Upgrade
										</button>
									</div>
								</div>
							)}
						</div>

						<Wishlist
							variant="page"
							section="history"
							wishlist={wishlist}
							theme={theme}
							onEdit={(item) => { if (isReadOnly) { setShowUpgradeModal(true); return; } setEditingWishlistItem(item); setShowAddWishlistModal(true); }}
							isReadOnly={isReadOnly}
						/>
					</div>
				</div>
			)}

		{/* ── Orders tab ── */}
		{pageTab === 'orders' && (<>
		<OrdersTipsBanner theme={theme} />

		{/* ── Free-plan: slot OPEN — has delivered orders, no active ones ──── */}
		{caps.enforced && activeOrderCount === 0 && orders.length > 0 && (
			<div
				className="rounded-xl px-4 py-3 mb-5 flex items-center gap-3"
				style={{
					backgroundColor: theme.isDark ? `${theme.primary}14` : `${theme.primary}10`,
					border: `1px solid ${theme.primary}35`,
				}}
			>
				<div className="flex-1 min-w-0">
					<p className="text-sm font-semibold" style={{ color: theme.text }}>
						Slot's empty — time to restock the pipeline 📦
					</p>
					<p className="text-xs mt-0.5" style={{ color: theme.textLight }}>
						All orders delivered. Ready to track your next one.
					</p>
				</div>
				<button
					type="button"
					onClick={() => { setEditingOrder(null); setShowAddModal(true); }}
					className="text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0 transition-all hover:opacity-80 touch-manipulation"
					style={{ backgroundColor: theme.primary, color: theme.textOnPrimary }}
				>
					Add Order
				</button>
			</div>
		)}

		{/* ── Free-plan: slot FULL — active order in progress ──────────────── */}
		{caps.enforced && caps.maxOrders !== null && activeOrderCount >= caps.maxOrders && (
			<div
				className="rounded-2xl px-4 py-3.5 mb-5"
				style={{
					backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.85)',
					border: `1px solid ${theme.border}`,
					boxShadow: theme.isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
				}}
			>
				<div className="flex items-center gap-3">
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-1.5 mb-0.5">
							<Lock size={18} style={{ color: theme.textLight }} />
							<p className="text-sm font-semibold" style={{ color: theme.text }}>
								{activeOrderCount} / {caps.maxOrders} active order slot used
							</p>
						</div>
						<p className="text-xs" style={{ color: theme.textLight }}>
							Mark as Delivered to free the slot — your data is always yours
						</p>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<button
							type="button"
							onClick={() => exportToCSV(
								(orders || [])
									.filter(o => !o.deleted)
									.map(o => ({
										order_number: o.publicOrderNumber || o.id || '',
										vendor: o.vendor || '',
										compound: o.compound || o.name || '',
										quantity: o.quantity || '',
										cost: o.cost || '',
										status: o.status || '',
										tracking: o.trackingNumber || '',
										date_placed: o.datePlaced || o.date || '',
										date_delivered: o.dateDelivered || '',
									})),
								'orders-export.csv'
							)}
							className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80 active:scale-95"
							style={{
								backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)',
								border: `1px solid ${theme.border}`,
								color: theme.textLight,
							}}
						>
							<DownloadSimple size={20} />
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
							<ArrowRight size={20} />
						</button>
					</div>
				</div>
			</div>
		)}

		<div className="mb-3">
			<OwnerFilter theme={theme} />
			</div>

			{/* Filter dropdowns - category is Advanced-only */}
			{!simpleMode && (
			<div className="mb-6">
				<div className="flex flex-wrap items-center gap-3">
					<div className="flex-1 min-w-0" style={{ minWidth: '180px' }}>
						<CustomDropdown
							value={categoryFilter}
							onChange={setCategoryFilter}
							options={[
								{ value: 'all', label: `View All (${categoryCounts.all})`, icon: <Package size={22} style={{ color: theme.textLight }} /> },
								{ value: 'domestic', label: `Domestic (${categoryCounts.domestic})`, icon: <Package size={22} style={{ color: theme.textLight }} /> },
								{ value: 'international', label: `International (${categoryCounts.international})`, icon: <Package size={22} style={{ color: theme.textLight }} /> },
								{ value: 'groupbuy', label: `Group Buy (${categoryCounts.groupbuy})`, icon: <Package size={22} style={{ color: theme.textLight }} /> }
							]}
							theme={theme}
							placeholder="Filter orders..."
							outlined={true}
							customShadow={true}
						/>
					</div>
				</div>
			</div>
			)}

			{sortedOrdersByCategory.length > 0 && (
				<div
					className="mb-5 grid grid-cols-3 gap-2 sm:gap-3 rounded-2xl p-2.5 sm:p-3 glass-panel-minimal"
					style={{
						border: `1px solid ${theme.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}`,
						boxShadow: theme.isDark
							? '0 4px 24px rgba(0, 0, 0, 0.25), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
							: '0 2px 16px rgba(0, 0, 0, 0.06), 0 8px 32px rgba(0, 0, 0, 0.04)',
						fontFamily: 'Poppins, sans-serif',
					}}
				>
					{[
						{ key: 'active', label: 'Active', value: ordersTabStats.active, Icon: Package, tint: theme.primary },
						{ key: 'transit', label: 'In transit', value: ordersTabStats.transit, Icon: Truck, tint: theme.isDark ? '#60a5fa' : '#2563eb' },
						{ key: 'delivered', label: 'Delivered', value: ordersTabStats.delivered, Icon: CheckCircle, tint: theme.success || '#8ca68c' },
					].map(({ key, label, value, Icon, tint }) => (
						<div
							key={key}
							className="flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-2 sm:py-2.5 text-center min-w-0"
							style={{
								backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
							}}
						>
							<Icon size={22} weight="duotone" style={{ color: tint }} className="shrink-0 opacity-90" />
							<span className="text-lg sm:text-xl font-bold tabular-nums leading-none" style={{ color: theme.text }}>
								{value}
							</span>
							<span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide truncate max-w-full px-0.5" style={{ color: theme.textLight }}>
								{label}
							</span>
						</div>
					))}
				</div>
			)}

			<div className={sortedOrdersByCategory.length > 0 ? 'mt-2' : 'mt-6'}>
				{categoryFilter === 'groupbuy' ? (
					<div>
						{sortedOrdersByCategory.length > 0 ? (
							<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
								<div className="lg:col-span-2">
									<OrderList 
										orders={sortedOrdersByCategory} 
										onEdit={(order) => { 
											if (isReadOnly) {
												setShowUpgradeModal(true);
												return;
											}
											setEditingOrder(order); 
											setShowAddModal(true); 
										}}
										onDelete={(id) => {
											// Allow deletion in read-only mode for data management
											handleDeleteOrder(id);
										}}
										onAdvance={(order) => {
											if (isReadOnly) {
												setShowUpgradeModal(true);
												return;
											}
											advanceOrderStatus(order);
										}}
									theme={theme}
									vendors={vendors}
									freePlan={caps.enforced}
								/>
							</div>
					{groupBuysEnabled && (
							<div>
								<ScheduledBuysPanel theme={theme} />
							</div>
						)}
							</div>
						) : (
						<div className="content-section flex flex-col items-center justify-center py-12 px-6 text-center">
							<div className="w-24 h-24 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
								<Package size={44} style={{ color: theme.primary }} />
							</div>
							<h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>No group buy orders yet</h3>
								<p className="text-sm mb-6 max-w-sm" style={{ color: theme.textLight }}>
									Track group buys and coordinate delivery.
								</p>
								{!isReadOnly && (
									<button
										type="button"
										onClick={() => setShowAddModal(true)}
										className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors touch-manipulation"
										style={{
											color: theme.primary,
											backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}15`,
											border: `1px solid ${theme.primary}40`,
											WebkitTapHighlightColor: 'transparent'
										}}
									>
										Add Order
										<CaretDown size={20} />
									</button>
								)}
							</div>
						)}
					</div>
				) : (
					sortedOrdersByCategory.length > 0 ? (
							<OrderList 
								orders={sortedOrdersByCategory}
							onEdit={(order) => { 
								if (isReadOnly) {
									setShowUpgradeModal(true);
									return;
								}
								setEditingOrder(order); 
								setShowAddModal(true); 
							}}
							onDelete={(id) => {
								// Allow deletion in read-only mode for data management
								handleDeleteOrder(id);
							}}
							onAdvance={(order) => {
								if (isReadOnly) {
									setShowUpgradeModal(true);
									return;
								}
								advanceOrderStatus(order);
							}}
						theme={theme}
						vendors={vendors}
						freePlan={caps.enforced}
					/>
			) : (
			<div className="content-section flex flex-col items-center justify-center py-12 px-6 text-center">
				<div className="w-24 h-24 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: `${theme.primary}10` }}>
					<Package size={44} style={{ color: theme.primary }} />
				</div>
				<h3 className="text-lg font-semibold mb-2" style={{ color: theme.text }}>
					{categoryFilter === 'all' ? 'No orders yet' : categoryFilter === 'domestic' ? 'No domestic orders yet' : 'No international orders yet'}
				</h3>
				{caps.enforced ? (
					<>
						<div
							className="flex items-center gap-2 px-4 py-2 rounded-full mb-4"
							style={{ backgroundColor: `${theme.primary}15`, border: `1px solid ${theme.primary}30` }}
						>
							<span className="text-xs font-bold" style={{ color: theme.primary }}>1 FREE ORDER SLOT AVAILABLE</span>
						</div>
						<p className="text-sm mb-6 max-w-sm" style={{ color: theme.textLight }}>
							Track your order from purchase to delivery — items auto-move to your Stockpile when delivered.
						</p>
						<button
							type="button"
							onClick={() => { setEditingOrder(null); setShowAddModal(true); }}
							className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 touch-manipulation btn-primary-inset"
							style={{
								color: theme.textOnPrimary,
								backgroundColor: theme.primary,
								WebkitTapHighlightColor: 'transparent'
							}}
						>
							<PlusCircle size={24} />
							Use My Free Slot
						</button>
						<button
							type="button"
							onClick={() => setShowUpgradeModal(true)}
							className="mt-3 text-xs font-medium underline"
							style={{ color: theme.textLight }}
						>
							Need more? Upgrade for unlimited orders
						</button>
					</>
				) : (
					<>
						<p className="text-sm mb-6 max-w-sm" style={{ color: theme.textLight }}>
							{categoryFilter === 'all' ? 'Add orders to track shipping and move items to stockpile when delivered.' : 'Track shipping and add to stockpile when delivered.'}
						</p>
						{!isReadOnly && (
							<button
								type="button"
								onClick={() => setShowAddModal(true)}
								className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors touch-manipulation"
								style={{
									color: theme.primary,
									backgroundColor: theme.isDark ? `${theme.primary}20` : `${theme.primary}15`,
									border: `1px solid ${theme.primary}40`,
									WebkitTapHighlightColor: 'transparent'
								}}
							>
								Add Order
								<CaretDown size={20} />
							</button>
						)}
					</>
				)}
			</div>
			)
			)}
			</div>
			
		<UpgradeModal 
		isOpen={showUpgradeModal}
		onClose={() => setShowUpgradeModal(false)}

		theme={theme}
	/>
	</>)}

		{/* OrderDetailsModal lives outside tab conditionals so wishlist acquire-to-order works from either tab */}
		<OrderDetailsModal 
			open={showAddModal}
			onClose={() => { 
				setShowAddModal(false); 
				setEditingOrder(null);
				if (returnToStockpileIncoming) {
					setReturnToStockpileIncoming(false);
					navigate('/app/stockpile', { state: { activeTab: 'incoming' } });
				}
			}}
			theme={theme}
			order={editingOrder}
			vendors={vendors}
			defaultCategory={categoryFilter === 'all' ? 'domestic' : categoryFilter}
			isDeleting={deletingOrderId === editingOrder?.id}
			onSave={(data) => {
				if (data.vendor && !vendors.some(v => v.name.toLowerCase() === data.vendor.toLowerCase())) {
					addVendor({ name: data.vendor, isStub: true });
				}
				const vendorId = vendors.find(v => v.name === data.vendor)?.id || null;
				if (editingOrder?.id) {
					const previousStatus = (editingOrder.status || 'Order Placed').toLowerCase();
					const newStatus = (data.status || editingOrder.status || 'Order Placed').toLowerCase();
					const statusChanged = previousStatus !== newStatus;
					const revertedFromDelivered = previousStatus.includes('deliver') && !newStatus.includes('deliver');
					const updatedOrder = prepareItemForSave({ 
						...editingOrder, 
						...data, 
						vendorId,
						publicOrderNumber: editingOrder.publicOrderNumber ?? data.publicOrderNumber,
						...(revertedFromDelivered ? { deliveryDate: null } : {}),
						...(statusChanged && data.statusSource === 'manual' ? {
							statusSource: 'manual',
							statusManuallySetAt: data.statusManuallySetAt || new Date().toISOString()
						} : {})
					});
					handleStockpileUpdate(editingOrder, updatedOrder);
					setOrders(prev => {
						const normalizedPrev = ensurePublicOrderNumbers(prev);
						return normalizedPrev.map(o => o.id === editingOrder.id ? updatedOrder : o);
					});
		} else {
				if (!canAddOrder) { setShowUpgradeModal(true); setShowAddModal(false); return; }
				const category = data.category || (categoryFilter === 'all' ? 'domestic' : categoryFilter);
				const nextPublicNumber = getNextPublicOrderNumber(orders);
				const newOrder = prepareItemForSave({ 
						id: generateId(), 
						publicOrderNumber: nextPublicNumber,
						...data, 
						vendorId, 
						category, 
						type: category,
						...(data.statusSource === 'manual' ? {
							statusSource: 'manual',
							statusManuallySetAt: data.statusManuallySetAt || new Date().toISOString()
						} : {})
					}, { isNew: true });
					handleStockpileUpdate(null, newOrder);
					setOrders(prev => {
						const normalizedPrev = ensurePublicOrderNumbers(prev);
						return [newOrder, ...normalizedPrev];
					});
				}
				setShowAddModal(false);
				setEditingOrder(null);
				if (returnToStockpileIncoming) {
					setReturnToStockpileIncoming(false);
					navigate('/app/stockpile', { state: { activeTab: 'incoming' } });
				}
			}}
			onDelete={async (id) => {
				await handleDeleteOrder(id);
				setShowAddModal(false);
				setEditingOrder(null);
			}}
		/>

		{/* Wishlist modals — available on both tabs so acquire-to-order works from wishlist tab */}
		<AddWishlistItemModal
			open={showAddWishlistModal}
			onClose={() => { setShowAddWishlistModal(false); setEditingWishlistItem(null); }}
			theme={theme}
			item={editingWishlistItem ?? null}
			onSave={handleSaveWishlistItem}
			onDelete={handleDeleteWishlistItem}
		/>
	<AddToStockpileBottomSheet
		open={!!showStockpileAdd}
		onClose={() => { setShowStockpileAdd(false); setWishlistStockpilePrefill(null); }}
		theme={theme}
		wishlistPrefill={wishlistStockpilePrefill}
	/>

</section>
		</IconContext.Provider>
	)
}
