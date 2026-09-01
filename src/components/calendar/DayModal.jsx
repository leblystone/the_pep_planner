import React, { useState, useEffect, useMemo } from 'react'
import { toKey } from './MonthGrid'
import { Person, Syringe, FileText as PhFileText, Heartbeat, Timer as PhTimer, Sun, Moon, PlusSquare } from '@phosphor-icons/react'
import { Pill, PenTool, Beaker, Target, CheckCircle, Check, ShoppingCart, Pipette, ChevronDown, ChevronUp, Calendar, Building, MapPin, Users, DollarSign, FileText, Star, HeartPulse, X, PenLine } from 'lucide-react'
import { isTaskCompleted, generateTaskId, toggleTaskCompletion } from '../../utils/taskCompletion'
import TaskDisplay from './TaskDisplay'
import { getChromeGradient, isColorDark } from '../../utils/recon'
import { penColors } from '../../utils/penColors'
import { isInjectionSiteTrackingEnabled } from '../../utils/injectionSiteSettings'
import { formatMMDDYYYY } from '../../utils/date'
import { useAppContext } from '../../context/AppContext'
import { areGroupBuysEnabled } from '../../utils/featureSettings'
import { getNotesForDate } from '../../utils/protocolHistory'
import Modal from '../common/Modal'
import { getCalendarNoteText, hasCalendarNotes as hasCalendarNotesUtil } from '../../utils/calendarNotesMigration'
import { getSideEffectsForDate } from '../../utils/sideEffectsLog'
import { getProtocolAccentHex, hexToRgba } from '../../utils/protocolColors'
import { getWashoutPeriodProgress, getHalfLifeRemainingPct } from '../../utils/washoutDisplay'
import SideEffectsQuickSheet from '../sideeffects/SideEffectsQuickSheet'
import InjectionHistoryModal from '../common/InjectionHistoryModal'
// calculateScheduledTasksForDate is now used by Calendar.jsx directly (single source of truth)

const colorMap = penColors.reduce((acc, c) => ({ ...acc, [c.hex.toLowerCase()]: c.name }), {})

function DeliveryIndicator({ item, theme }) {
  const size = 18
  if (item.deliveryMethod === 'pen') {
    const hex = item.penColor || '#9ca3af'
    const colorName = colorMap[hex.toLowerCase()] || hex
    const textColor = isColorDark(hex) ? 'white' : theme.text
    return (
      <div 
        className="w-5 h-5 rounded-md flex items-center justify-center" 
        style={{ background: getChromeGradient(hex) }}
        title={`${colorName} Pen`}
      >
        <PenTool size={12} style={{ color: textColor }} />
      </div>
    )
  }
  if (item.deliveryMethod === 'syringe' || item.deliveryMethod === 'pipette') {
    return (
      <div 
        className="w-5 h-5 rounded-md flex items-center justify-center" 
        style={{ backgroundColor: theme.secondary }}
        title="Syringe"
      >
        <Pipette size={12} style={{ color: theme.textLight }} />
      </div>
    )
  }
  return <Pipette size={12} style={{ color: theme.primary }} />
}

function MarkAllButton({ date, timeSlot, scheduled, theme, onMarkAllDone, calendarBump }) {
  const dateKey = toKey(date)
  const [completedCount, setCompletedCount] = useState(0)
  const [totalTasks, setTotalTasks] = useState(0)
  
  // Calculate completion status
  useEffect(() => {
    let total = 0
    let completed = 0
    
    const slotKey = timeSlot === 'AM' ? 'AM' : 'PM'
    
    // Count peptides
    if (scheduled.peptides) {
      scheduled.peptides.forEach(peptide => {
        total++
        const task = {
          type: 'peptide',
          name: peptide.name,
          dose: peptide.dose || '',
          unit: peptide.unit || '',
          time: slotKey,
          protocolId: peptide.protocolId,
          peptideId: peptide.peptideId
        }
        const taskId = generateTaskId(task)
        if (isTaskCompleted(taskId, dateKey, slotKey)) {
          completed++
        }
      })
    }
    
    // Count supplements
    if (scheduled.supplements) {
      scheduled.supplements.forEach(supplement => {
        total++
        const suppData = typeof supplement === 'object' ? supplement : { name: supplement }
        const task = {
          type: 'supplement',
          name: suppData.name,
          dose: suppData.dose || '',
          unit: '',
          time: slotKey
        }
        const taskId = generateTaskId(task)
        if (isTaskCompleted(taskId, dateKey, slotKey)) {
          completed++
        }
      })
    }
    
    setTotalTasks(total)
    setCompletedCount(completed)
  }, [dateKey, timeSlot, scheduled, calendarBump])
  
  // Listen for completion changes
  useEffect(() => {
    const handleTaskCompletionChange = () => {
      let total = 0
      let completed = 0
      const slotKey = timeSlot === 'AM' ? 'AM' : 'PM'
      
      if (scheduled.peptides) {
        scheduled.peptides.forEach(peptide => {
          total++
          const task = {
            type: 'peptide',
            name: peptide.name,
            dose: peptide.dose || '',
            unit: peptide.unit || '',
            time: slotKey,
            protocolId: peptide.protocolId,
            peptideId: peptide.peptideId
          }
          const taskId = generateTaskId(task)
          if (isTaskCompleted(taskId, dateKey, slotKey)) {
            completed++
          }
        })
      }
      
      if (scheduled.supplements) {
        scheduled.supplements.forEach(supplement => {
          total++
          const suppData = typeof supplement === 'object' ? supplement : { name: supplement }
          const task = {
            type: 'supplement',
            name: suppData.name,
            dose: suppData.dose || '',
            unit: '',
            time: slotKey
          }
          const taskId = generateTaskId(task)
          if (isTaskCompleted(taskId, dateKey, slotKey)) {
            completed++
          }
        })
      }
      
      setTotalTasks(total)
      setCompletedCount(completed)
    }
    
    window.addEventListener('tpp:task-completion-changed', handleTaskCompletionChange)
    return () => window.removeEventListener('tpp:task-completion-changed', handleTaskCompletionChange)
  }, [dateKey, timeSlot, scheduled])
  
  if (totalTasks === 0) return null
  if (completedCount === totalTasks) {
    return (
      <div className="flex items-center gap-1" style={{ color: theme.success }}>
        <Check size={10} />
        <span className="text-[9px] font-medium">Done</span>
      </div>
    )
  }
  
  return (
    <button
      onClick={() => onMarkAllDone && onMarkAllDone(date, timeSlot, scheduled)}
      className="text-[9px] font-medium px-1.5 py-0.5 rounded transition-all hover:opacity-80"
      style={{
        backgroundColor: theme.primary + (theme.isDark ? '30' : '20'),
        color: theme.primary
      }}
      title={`Check all ${timeSlot} tasks as done`}
    >
      Check All
    </button>
  )
}

function SlotContent({ scheduled, theme, date, timeSlot, onTaskToggle, onSlotMove, onSkipDose, onUndoSkip, onRescheduleToDate, onClearCatchUp, isViewingToday }) {
  if (!scheduled || (!scheduled.peptides?.length && !scheduled.supplements?.length)) {
    return <div className="text-xs text-center pt-4" style={{ color: theme.textLight }}>-</div>
  }

  const { protocols = [], supplements = [] } = useAppContext() || {}
  const dateKey = toKey(date)

  const createTaskFromItem = (item, type) => {
    const name = typeof item === 'object' ? item.name : item
    const dose = typeof item === 'object' ? item.dose : ''
    const unit = typeof item === 'object' ? item.unit : ''
    const delivery = typeof item === 'object' ? item.delivery : (type === 'peptide' ? 'injection' : 'oral')
    const deliveryMethod = typeof item === 'object' ? item.deliveryMethod : delivery
    const penColor = typeof item === 'object' ? item.penColor : undefined
    const penType = typeof item === 'object' ? item.penType : undefined
    const protocolId = typeof item === 'object' ? item.protocolId : undefined
    const peptideId = typeof item === 'object' ? item.peptideId : undefined
    const movedFromProtocolSlot = typeof item === 'object' ? item._movedFromSlot : undefined
    const _skipped = typeof item === 'object' ? !!item._skipped : false
    const _rescheduled = typeof item === 'object' ? !!item._rescheduled : false
    const _extraSlot = typeof item === 'object' ? !!item._extraSlot : false
    const _fromDateKey = typeof item === 'object' ? item._fromDateKey : undefined
    const _toDateKey = typeof item === 'object' ? item._toDateKey : undefined
    const _toSlot = typeof item === 'object' ? item._toSlot : undefined
    const _extraId = typeof item === 'object' ? item._extraId : undefined

    let ownerId;
    let protocolAccentHex;
    if (type === 'peptide' && protocolId) {
      const pr = protocols.find((p) => p.id === protocolId)
      ownerId = pr?.ownerId
      protocolAccentHex = getProtocolAccentHex(pr || { id: protocolId })
    } else if (type === 'supplement') {
      const sid = typeof item === 'object' ? item.id : undefined
      const supObj = sid ? supplements.find((s) => s.id === sid) : null
      ownerId = supObj?.ownerId || (typeof item === 'object' ? item.ownerId : undefined)
    }
    
    return {
      id: `${type}-${name}-${dose}-${unit}-${timeSlot}${_extraSlot ? `-catchup-${_fromDateKey || _extraId || 'x'}` : ''}`.toLowerCase().replace(/\s+/g, '-'),
      name,
      dose,
      unit,
      type,
      time: timeSlot,
      delivery,
      deliveryMethod,
      penColor,
      penType,
      protocolId,
      peptideId,
      movedFromProtocolSlot,
      ownerId,
      protocolAccentHex,
      _skipped,
      _rescheduled,
      _extraSlot,
      _fromDateKey,
      _toDateKey,
      _toSlot,
      _extraId,
      isCatchUp: _extraSlot,
      skipped: _skipped,
      rescheduled: _rescheduled,
      stableTaskId: generateTaskId({
        name,
        dose,
        unit,
        type,
        time: timeSlot,
        protocolId,
        peptideId,
        _extraSlot,
        _fromDateKey,
        _extraId,
      })
    }
  }

  const allTasks = [
    ...(scheduled.peptides || []).map((p, i) => ({ item: p, type: 'peptide', key: `p-${i}` })),
    ...(scheduled.supplements || []).map((s, i) => ({ item: s, type: 'supplement', key: `s-${i}` }))
  ]

  return (
    <ul className="space-y-1.5">
      {allTasks.map(({ item, type, key }, index) => {
        const task = createTaskFromItem(item, type)
        return (
          <li 
            key={key}
            style={{
              boxShadow: index < allTasks.length - 1 
                ? `0 1px 0 ${theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(127, 158, 149, 0.08)'}` 
                : 'none'
            }}
          >
            <TaskDisplay
              task={task}
              theme={theme}
              date={date}
              timeSlot={timeSlot}
              size="normal"
              onToggle={onTaskToggle}
              onSlotMove={onSlotMove}
              onSkipDose={onSkipDose}
              onUndoSkip={onUndoSkip}
              onRescheduleToDate={onRescheduleToDate}
              onClearCatchUp={onClearCatchUp}
              isViewingToday={isViewingToday}
              viewDateKey={dateKey}
            />
          </li>
        )
      })}
    </ul>
  )
}

export default function DayModal({ date, entries, scheduled, theme, onClose, onNotesClick, onTaskToggle, onMarkAllDone, calendarBump, onSlotMove, onSkipDose, onUndoSkip, onRescheduleToDate, onClearCatchUp, onLogOneOff }) {
  const { scheduledBuys, orders: ctxOrders, protocols: ctxProtocols } = useAppContext()
  const [forceRender, setForceRender] = useState(0)
  const [expandedGroupBuy, setExpandedGroupBuy] = useState(null)
  const [expandedGroupBuyData, setExpandedGroupBuyData] = useState(null)
  const [selectedNote, setSelectedNote] = useState(null)
  const [showInjectionHistory, setShowInjectionHistory] = useState(false)
  const [showSideEffectSheet, setShowSideEffectSheet] = useState(false)
  const [editingSideEffect, setEditingSideEffect] = useState(null)
  const [daySideEffectsState, setDaySideEffectsState] = useState([])

  /** Darker sage accent for Side Effects card (distinct from Notes primary, not alarm red). */
  const sideFxAccent = theme.primaryDark || theme.primary || '#5F7F76'

  const injectionDayScope = useMemo(() => {
    if (!date) return { start: null, end: null }
    const start = new Date(date)
    start.setHours(0, 0, 0, 0)
    const end = new Date(date)
    end.setHours(23, 59, 59, 999)
    return { start, end }
  }, [date])
  
  // Calendar now uses calculateScheduledTasksForDate (same as Dashboard/notifications),
  // so the scheduled prop already contains the correct data. No need for duplicate calculation.
  // Just use scheduled directly - SINGLE SOURCE OF TRUTH.
  const mergedScheduled = scheduled;
  
  // Check if group buys are enabled
  const groupBuysEnabled = areGroupBuysEnabled()
  
  // Reset expanded state when date changes
  useEffect(() => {
    setExpandedGroupBuy(null)
    setExpandedGroupBuyData(null)
  }, [date])
  
  // Force re-render when calendarBump changes
  useEffect(() => {
    setForceRender(prev => prev + 1)
  }, [calendarBump])
  
  // Listen for task completion events
  useEffect(() => {
    const handleTaskCompletionChange = (e) => {
      console.log('📡 DayModal received task completion event:', e.detail)
      setForceRender(prev => prev + 1)
    }
    
    window.addEventListener('tpp:task-completion-changed', handleTaskCompletionChange)
    
    return () => {
      window.removeEventListener('tpp:task-completion-changed', handleTaskCompletionChange)
    }
  }, [])

  // Listen for protocol history updates
  useEffect(() => {
    const handleProtocolHistoryUpdate = () => {
      setForceRender(prev => prev + 1)
    }
    
    window.addEventListener('tpp:protocol-history-updated', handleProtocolHistoryUpdate)
    
    return () => {
      window.removeEventListener('tpp:protocol-history-updated', handleProtocolHistoryUpdate)
    }
  }, [])

  if (!date) return null

  const dayOfWeek = date.toLocaleString('en-US', { weekday: 'long' })
  const isToday = toKey(date) === toKey(new Date())
  const dayKey = toKey(date)
  // Get note text from new ID-based structure
  const dayNotesText = entries[dayKey] ? getCalendarNoteText(entries, dayKey) : ''
  const dayScheduled = mergedScheduled[dayKey]
  
  // Get protocol notes for this date
  const protocolNotes = getNotesForDate(dayKey)

  // Get side effects logged for this date — refreshes on log
  useEffect(() => {
    setDaySideEffectsState(getSideEffectsForDate(dayKey))
  }, [dayKey, forceRender])

  useEffect(() => {
    const refresh = () => setDaySideEffectsState(getSideEffectsForDate(dayKey))
    window.addEventListener('tpp:side-effects-updated', refresh)
    return () => window.removeEventListener('tpp:side-effects-updated', refresh)
  }, [dayKey])

  const daySideEffects = daySideEffectsState
  const activeProtocols = (ctxProtocols || []).filter(p => p.active !== false)

  const openSideEffectSheet = (entry = null) => {
    setEditingSideEffect(entry)
    setShowSideEffectSheet(true)
  }

  const closeSideEffectSheet = () => {
    setShowSideEffectSheet(false)
    setEditingSideEffect(null)
    setDaySideEffectsState(getSideEffectsForDate(dayKey))
  }
  
  // Calculate actual task completion status
  let totalTasks = 0
  let completedTasks = 0
  
  if (dayScheduled?.bySlot) {
    Object.keys(dayScheduled.bySlot).forEach(timeSlot => {
      const slot = dayScheduled.bySlot[timeSlot]
      if (slot.peptides) {
        slot.peptides.forEach(peptide => {
          const task = {
            name: typeof peptide === 'object' ? peptide.name : peptide,
            dose: typeof peptide === 'object' ? peptide.dose : '',
            unit: typeof peptide === 'object' ? peptide.unit : '',
            type: 'peptide',
            time: timeSlot,
            protocolId: peptide?.protocolId,
            peptideId: peptide?.peptideId
          }
          const taskId = generateTaskId(task)
          const dateKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
          totalTasks++
          if (isTaskCompleted(taskId, dateKey, timeSlot)) {
            completedTasks++
          }
        })
      }
      if (slot.supplements) {
        slot.supplements.forEach(supplement => {
          const task = {
            name: typeof supplement === 'object' ? supplement.name : supplement,
            dose: typeof supplement === 'object' ? supplement.dose : '',
            unit: typeof supplement === 'object' ? supplement.unit : '',
            type: 'supplement',
            time: timeSlot
          }
          const taskId = generateTaskId(task)
          const dateKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0')
          totalTasks++
          if (isTaskCompleted(taskId, dateKey, timeSlot)) {
            completedTasks++
          }
        })
      }
    })
  }
  
  // Count group buys as tasks
  if (dayScheduled?.groupBuys && dayScheduled.groupBuys.length > 0) {
    totalTasks += dayScheduled.groupBuys.length
    completedTasks += dayScheduled.groupBuys.length
  }
  
  const allTasksCompleted = totalTasks > 0 && completedTasks === totalTasks

  // Resolve Group Buy display info
  let groupBuyInfo = null
  try {
    if (dayScheduled?.groupBuys && dayScheduled.groupBuys.length > 0) {
      const gb = dayScheduled.groupBuys[0]
      
      if (gb && typeof gb === 'object') {
        const item = gb.item || gb.title || gb.name || gb.peptide || gb.peptideName || (gb.group && gb.group.title) || 'Unknown Item'
        const name = `Group Buy For: ${item}`
        const vendor = gb.vendor || gb.seller || gb.source || (gb.group && (gb.group.vendor || gb.group.name)) || ''
        const rawPrice = gb.cost ?? gb.price ?? gb.amount ?? ''
        const price = rawPrice !== '' ? `$${String(rawPrice).toString().replace(/^\$/,'')}` : ''
        groupBuyInfo = { name, item, vendor, price, source: 'scheduled', openDate: gb.openDate, closeDate: gb.closeDate, location: gb.location, participants: gb.participants, notes: gb.notes }
      } else if (gb) {
        const item = String(gb) === 'Group Buy' ? 'Available' : String(gb)
        groupBuyInfo = { 
          name: `Group Buy For: ${item}`, 
          item,
          vendor: '', 
          price: '', 
          source: 'scheduled' 
        }
      }
    }
    
    if (!groupBuyInfo) {
      const orders = ctxOrders || []
      const orderMatch = orders.find(o => {
        try {
          const d = (o.date || '').slice(0,10)
          return d === dayKey && (!!o.group || !!o.vendor || !!o.cost || !!o.price)
        } catch { return false }
      })
      if (orderMatch) {
        const item = (orderMatch.group && (orderMatch.group.title || orderMatch.group.name)) || orderMatch.peptide || orderMatch.item || 'Unknown Item'
        const name = `Group Buy For: ${item}`
        const vendor = orderMatch.vendor || orderMatch.seller || orderMatch.source || ''
        const rawPrice = orderMatch.cost ?? orderMatch.price ?? orderMatch.amount ?? ''
        const price = rawPrice !== '' ? `$${String(rawPrice).toString().replace(/^\$/,'')}` : ''
        groupBuyInfo = { 
          name, 
          item,
          vendor, 
          price, 
          source: 'orders',
          openDate: orderMatch.date,
          closeDate: orderMatch.date,
          location: orderMatch.location,
          participants: orderMatch.group?.participants,
          notes: orderMatch.group?.notes || orderMatch.notes
        }
      }
    }
  } catch (error) {
    console.error('DayModal - Error processing group buy:', error)
  }

  const NOTE_TAGS = [
    { id: 'progress', label: 'Progress Update' },
    { id: 'side_effects', label: 'Side Effects' },
    { id: 'adjustment', label: 'Dosage Adjustment' },
    { id: 'observation', label: 'Observation' },
    { id: 'question', label: 'Question' }
  ]

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col"
             style={{ 
               background: theme.isDark 
                 ? 'linear-gradient(135deg, rgba(62, 68, 80, 0.97), rgba(50, 56, 66, 0.98))'
                 : `linear-gradient(180deg, ${theme.accent}F0 0%, rgba(255,255,255,0.95) 30%, rgba(255,255,255,0.92) 100%)`,
               backdropFilter: 'blur(20px)',
               WebkitBackdropFilter: 'blur(20px)',
               border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
             }}>
          
          {/* Header - gradient style matching Today's Research */}
          <div className="px-4 py-3 flex-shrink-0" style={{ 
            borderBottom: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.06)' : theme.primary + '15'}`,
            background: theme.isDark 
              ? `linear-gradient(135deg, ${theme.primary}18, rgba(255,255,255,0.03))` 
              : `linear-gradient(135deg, ${theme.primary}20, ${theme.primaryLight}15, transparent)`,
          }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold tracking-tight" style={{ color: theme.text }}>
                  {isToday ? 'Today' : dayOfWeek}
                </h3>
                <span 
                  className="font-bold text-base flex items-center justify-center rounded-full w-9 h-9"
                  style={{
                    backgroundColor: theme.primary,
                    color: theme.textOnPrimary || '#ffffff',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                  }}
                >
                  {date.getDate()}
                </span>
                {allTasksCompleted && (
                  <CheckCircle size={16} style={{ color: theme.success || '#4CAF50' }} strokeWidth={2.5} />
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {isInjectionSiteTrackingEnabled() && (
                  <button
                    type="button"
                    onClick={() => setShowInjectionHistory(true)}
                    className="flex items-center gap-1.5 pl-3 pr-3 py-1.5 rounded-full text-xs font-semibold tracking-normal transition-all"
                    style={{
                      background: `linear-gradient(135deg, ${theme.primary}e0, ${theme.primary})`,
                      color: theme.textOnPrimary || '#fff',
                      boxShadow: `0 2px 8px ${theme.primary}55, 0 0 0 1.5px ${theme.primary}30`,
                    }}
                    title="Injection site history (this day)"
                  >
                    <Person size={20} weight="duotone" color={theme.textOnPrimary || '#fff'} className="flex-shrink-0" aria-hidden />
                    <span>Site history</span>
                  </button>
                )}
                {onLogOneOff && (
                  <button
                    type="button"
                    onClick={onLogOneOff}
                    className="flex items-center gap-1.5 pl-3 pr-3 py-1.5 rounded-full text-xs font-bold transition-all"
                    style={{
                      background: theme.isDark ? 'rgba(255,255,255,0.08)' : `${theme.primary}18`,
                      color: theme.text,
                      border: `1px solid ${theme.border}`,
                    }}
                    title="Log one-off dose"
                  >
                    <Syringe size={20} weight="duotone" color={theme.primary} className="flex-shrink-0" aria-hidden />
                    <span>One-off</span>
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-full hover:opacity-70 transition-all"
                  style={{ color: theme.textLight, backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Content - styled to match Today's Research widget */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 sm:px-3 py-2 space-y-0.5">
            
            {/* AM Section */}
            <div>
              <div className="flex items-center justify-between mb-0.5 px-1">
                <div className="flex items-center gap-2">
                  <Sun
                    size={18}
                    weight="duotone"
                    color={theme.isDark ? 'rgba(160, 180, 153, 0.6)' : theme.primary}
                    className="flex-shrink-0"
                    aria-hidden
                  />
                  <span className="text-xs sm:text-sm font-semibold uppercase tracking-widest" style={{ color: theme.textLight }}>Morning</span>
                </div>
                {dayScheduled?.bySlot?.AM && (dayScheduled.bySlot.AM.peptides?.length > 0 || dayScheduled.bySlot.AM.supplements?.length > 0) && (
                  <MarkAllButton
                    date={date}
                    timeSlot="AM"
                    scheduled={dayScheduled.bySlot.AM}
                    theme={theme}
                    onMarkAllDone={onMarkAllDone}
                    calendarBump={calendarBump}
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <SlotContent 
                  scheduled={dayScheduled?.bySlot?.AM} 
                  theme={theme} 
                  date={date}
                  timeSlot="AM"
                  onTaskToggle={onTaskToggle}
                  onSlotMove={onSlotMove}
                  onSkipDose={onSkipDose}
                  onUndoSkip={onUndoSkip}
                  onRescheduleToDate={onRescheduleToDate}
                  onClearCatchUp={onClearCatchUp}
                  isViewingToday={isToday}
                />
              </div>
            </div>

            {/* Faded separator between AM/PM */}
            <div className="widget-separator" style={{ marginBottom: '0.25rem', paddingBottom: '0.15rem' }} />

            {/* PM Section */}
            <div>
              <div className="flex items-center justify-between mb-0.5 px-1">
                <div className="flex items-center gap-2">
                  <Moon
                    size={18}
                    weight="duotone"
                    color={theme.isDark ? 'rgba(160, 180, 153, 0.85)' : (theme.primaryDark || theme.primary)}
                    className="flex-shrink-0"
                    aria-hidden
                  />
                  <span className="text-xs sm:text-sm font-semibold uppercase tracking-widest" style={{ color: theme.textLight }}>Evening</span>
                </div>
                {dayScheduled?.bySlot?.PM && (dayScheduled.bySlot.PM.peptides?.length > 0 || dayScheduled.bySlot.PM.supplements?.length > 0) && (
                  <MarkAllButton
                    date={date}
                    timeSlot="PM"
                    scheduled={dayScheduled.bySlot.PM}
                    theme={theme}
                    onMarkAllDone={onMarkAllDone}
                    calendarBump={calendarBump}
                  />
                )}
              </div>
              <div className="space-y-1.5">
                <SlotContent 
                  scheduled={dayScheduled?.bySlot?.PM} 
                  theme={theme} 
                  date={date}
                  timeSlot="PM"
                  onTaskToggle={onTaskToggle}
                  onSlotMove={onSlotMove}
                  onSkipDose={onSkipDose}
                  onUndoSkip={onUndoSkip}
                  onRescheduleToDate={onRescheduleToDate}
                  onClearCatchUp={onClearCatchUp}
                  isViewingToday={isToday}
                />
              </div>
            </div>

            {/* One-off doses */}
            {Array.isArray(dayScheduled?.oneOffs) && dayScheduled.oneOffs.length > 0 && (
              <>
                <div className="widget-separator" style={{ marginTop: '0.25rem', marginBottom: '0.25rem' }} />
                <div>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Pipette size={14} style={{ color: theme.primary }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textLight }}>One-off doses</span>
                  </div>
                  <div className="space-y-1.5">
                    {dayScheduled.oneOffs.map((dose) => (
                      <div
                        key={dose.id}
                        className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg"
                        style={{
                          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : `${theme.primary}08`,
                          borderLeft: `3px solid ${theme.primary}`,
                        }}
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate" style={{ color: theme.text }}>
                            {dose.peptideName}
                            {dose.dose ? ` · ${dose.dose}${dose.unit || ''}` : ''}
                          </div>
                          <div className="text-[10px] uppercase tracking-wide" style={{ color: theme.textLight }}>
                            {dose.timeSlot || 'AM'} · One-off
                          </div>
                        </div>
                        <Check size={16} style={{ color: theme.primary }} />
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Goals Section */}
            {dayScheduled?.goals && dayScheduled.goals.length > 0 && (
              <>
                <div className="widget-separator" style={{ marginTop: '0.25rem', marginBottom: '0.25rem' }} />
                <div>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <Target size={14} style={{ color: theme.primary }} />
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.textLight }}>Goals</span>
                  </div>
                  <div className="space-y-1.5">
                    {dayScheduled.goals.map((g, i) => (
                      <div key={`goal-${i}`} className="flex items-center gap-2 text-sm py-1.5 px-3"
                        style={{
                          borderLeft: `3px solid ${g.completed ? (theme.success || '#4CAF50') + '60' : theme.primary + '40'}`,
                        }}
                      >
                        {g.completed ? 
                          <CheckCircle size={14} style={{ color: theme.success }} /> :
                          <Target size={14} style={{ color: theme.warning }} />
                        }
                        <span className={`flex-1 ${g.completed ? 'line-through' : ''}`} 
                              style={{ color: g.completed ? theme.textLight : theme.text }}>
                          {g.text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Notes + Side Effects — compact 2-col row */}
            <div className="widget-separator" style={{ marginTop: '0.25rem', marginBottom: '0.25rem' }} />
            <div className="grid grid-cols-2 gap-2">

              {/* Notes card */}
              <div
                className="rounded-2xl overflow-hidden flex flex-col"
                style={{
                  border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : `${theme.primary}25`}`,
                  background: theme.isDark
                    ? `linear-gradient(160deg, ${theme.primary}12 0%, rgba(30,32,38,0.4) 100%)`
                    : `linear-gradient(180deg, ${theme.primary}0e 0%, ${theme.cardBackground || '#fff'} 100%)`,
                  boxShadow: theme.isDark
                    ? 'inset 0 1px 0 rgba(255,255,255,0.04)'
                    : `0 2px 8px -2px ${theme.primary}12, inset 0 1px 0 rgba(255,255,255,0.8)`,
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between gap-2 px-3 py-3"
                  style={{ borderBottom: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.07)' : `${theme.primary}18`}` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <PhFileText size={22} weight="duotone" color={theme.primary} className="flex-shrink-0" aria-hidden />
                    <p className="text-base sm:text-lg font-bold truncate" style={{ color: theme.text }}>Research Notes</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNotesClick(date)}
                    className="flex-shrink-0 p-0.5 rounded-md transition-all hover:opacity-80 active:opacity-70 touch-manipulation"
                    title={dayNotesText ? 'Edit note' : 'Add note'}
                  >
                    <PlusSquare size={26} weight="duotone" color={theme.primary} aria-hidden />
                  </button>
                </div>
                {/* Body */}
                <button
                  type="button"
                  onClick={() => onNotesClick(date)}
                  className="flex-1 w-full text-left px-3 py-3 transition-all hover:opacity-90 cursor-pointer"
                >
                  {dayNotesText ? (
                    <p className="text-xs sm:text-sm leading-relaxed line-clamp-4" style={{ color: theme.text }}>{dayNotesText}</p>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                      <PenLine size={18} style={{ color: `${theme.primary}70` }} strokeWidth={2} />
                      <p className="text-xs text-center leading-snug" style={{ color: theme.textLight }}>Nothing yet — tap to add</p>
                    </div>
                  )}
                </button>
              </div>

              {/* Side Effects card */}
              <div
                className="rounded-2xl overflow-hidden flex flex-col"
                style={{
                  border: `1px solid ${theme.isDark ? `${sideFxAccent}40` : `${sideFxAccent}30`}`,
                  background: theme.isDark
                    ? `linear-gradient(160deg, ${sideFxAccent}18 0%, rgba(30,32,38,0.4) 100%)`
                    : `linear-gradient(180deg, ${sideFxAccent}12 0%, ${theme.cardBackground || '#fff'} 100%)`,
                  boxShadow: theme.isDark
                    ? 'inset 0 1px 0 rgba(255,255,255,0.04)'
                    : `0 2px 8px -2px ${sideFxAccent}18, inset 0 1px 0 rgba(255,255,255,0.8)`,
                }}
              >
                {/* Header */}
                <div
                  className="flex items-center justify-between gap-2 px-3 py-3"
                  style={{ borderBottom: `1px solid ${theme.isDark ? `${sideFxAccent}28` : `${sideFxAccent}20`}` }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Heartbeat size={22} weight="duotone" color={sideFxAccent} className="flex-shrink-0" aria-hidden />
                    <p className="text-base sm:text-lg font-bold truncate" style={{ color: theme.text }}>
                      Side Effects {daySideEffects.length > 0 && <span className="font-semibold text-sm sm:text-base">({daySideEffects.length})</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openSideEffectSheet(null)}
                    className="flex-shrink-0 p-0.5 rounded-md transition-all hover:opacity-80 active:opacity-70 touch-manipulation"
                    title="Add side effect"
                  >
                    <PlusSquare size={26} weight="duotone" color={sideFxAccent} aria-hidden />
                  </button>
                </div>
                {/* Body */}
                <div className="flex-1 px-3 py-3">
                  {daySideEffects.length > 0 ? (
                    <div className="space-y-1">
                      {daySideEffects.slice(0, 3).map((e) => {
                        const sevColor = e.severity === 'severe' ? '#ef4444' : e.severity === 'moderate' ? '#f59e0b' : '#22c55e';
                        return (
                          <button
                            type="button"
                            key={e.id}
                            onClick={() => openSideEffectSheet(e)}
                            className="flex items-center gap-1.5 w-full text-left rounded-lg px-1 py-1.5 -mx-1 transition-all hover:opacity-80 active:opacity-70 touch-manipulation cursor-pointer"
                            title="Edit side effect"
                          >
                            <span className="text-xs sm:text-sm font-medium flex-1 truncate" style={{ color: theme.text }}>{e.label || e.effect}</span>
                            {e.severity && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{ backgroundColor: `${sevColor}20`, color: sevColor }}>
                                {e.severity}
                              </span>
                            )}
                          </button>
                        );
                      })}
                      {daySideEffects.length > 3 && (
                        <p className="text-xs" style={{ color: theme.textLight }}>+{daySideEffects.length - 3} more</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                      <HeartPulse size={18} style={{ color: `${sideFxAccent}55` }} strokeWidth={2} />
                      <p className="text-xs text-center leading-snug px-0.5 max-w-[9rem] mx-auto" style={{ color: theme.textLight }}>
                        Side-effect radar: all quiet — tap if anything pings.
                      </p>
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Protocol Notes Chips */}
            {protocolNotes && protocolNotes.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-semibold" style={{ color: theme.text }}>Protocol Notes</div>
                {protocolNotes.map((note) => {
                  const proto = ctxProtocols?.find(p => p.id === note.protocolId)
                  const accent = getProtocolAccentHex(proto || { id: note.protocolId, protocolName: note.protocolName })
                  return (
                  <div
                    key={note.id}
                    className="flex items-center gap-2 p-2 rounded text-sm cursor-pointer hover:opacity-90 transition-all"
                    style={{
                      backgroundColor: note.type === 'follow_up' 
                        ? hexToRgba(accent, theme.isDark ? 0.22 : 0.12)
                        : hexToRgba(accent, theme.isDark ? 0.08 : 0.06),
                      border: `1px solid ${hexToRgba(accent, 0.38)}`,
                      color: theme.text
                    }}
                    title={`${note.protocolName || 'Protocol'} - ${note.content ? note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '') : 'Note'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedNote(note)
                    }}
                  >
                    <FileText size={14} style={{ color: accent }} />
                    <span className="flex-1 font-medium" style={{ color: note.type === 'follow_up' ? accent : theme.text }}>
                      {note.protocolName || 'Protocol'}
                    </span>
                    {note.type === 'follow_up' && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: accent, color: '#fff' }}>
                        FOLLOW UP
                      </span>
                    )}
                    {note.type === 'during' && (
                      <span className="px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap" style={{ backgroundColor: hexToRgba(accent, 0.25), color: accent }}>
                        MID-CYCLE NOTE
                      </span>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
            
            {/* Group Buys */}
            {groupBuyInfo && groupBuysEnabled && (
              <div>
                <button
                  className="w-full p-2 rounded text-center hover:opacity-80 transition-all cursor-pointer"
                  style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.secondary }}
                  onClick={(e) => {
                    e.stopPropagation()
                    const isExpanded = expandedGroupBuy === dayKey
                    if (isExpanded) {
                      setExpandedGroupBuy(null)
                      setExpandedGroupBuyData(null)
                    } else {
                      let fullData = null
                      
                      if (groupBuyInfo.item) {
                        fullData = (scheduledBuys || []).find(buy => {
                          const buyItem = buy.item || buy.name || ''
                          return buyItem === groupBuyInfo.item || buyItem.toLowerCase() === groupBuyInfo.item.toLowerCase()
                        })
                      }
                      
                      if (!fullData) {
                        try {
                          const orders = ctxOrders || []
                          const orderMatch = orders.find(o => {
                            try {
                              const oDate = (o.date || '').slice(0, 10)
                              return oDate === dayKey && (!!o.group || o.category === 'groupbuy' || o.type === 'groupbuy')
                            } catch { return false }
                          })
                          
                          if (orderMatch) {
                            fullData = {
                              item: (orderMatch.group && (orderMatch.group.title || orderMatch.group.name)) || orderMatch.peptide || orderMatch.item || 'Unknown Item',
                              vendor: orderMatch.vendor || '',
                              price: orderMatch.cost || orderMatch.price || '',
                              openDate: orderMatch.date || '',
                              closeDate: orderMatch.date || '',
                              location: orderMatch.location || '',
                              participants: orderMatch.group?.participants || '',
                              notes: orderMatch.group?.notes || orderMatch.notes || '',
                              ...orderMatch,
                              ...(orderMatch.group || {})
                            }
                          }
                        } catch (error) {
                          console.error('Error finding group buy in orders:', error)
                        }
                      }
                      
                      const groupBuyData = fullData ? { ...fullData } : {
                        item: groupBuyInfo.item || groupBuyInfo.name?.replace('Group Buy For: ', '') || 'Unknown Item',
                        vendor: groupBuyInfo.vendor || '',
                        price: groupBuyInfo.price || '',
                        openDate: groupBuyInfo.openDate || '',
                        closeDate: groupBuyInfo.closeDate || '',
                        location: groupBuyInfo.location || '',
                        participants: groupBuyInfo.participants || '',
                        notes: groupBuyInfo.notes || '',
                        ...groupBuyInfo
                      }
                      
                      setExpandedGroupBuy(dayKey)
                      setExpandedGroupBuyData(groupBuyData)
                    }
                  }}
                  title={expandedGroupBuy === dayKey ? "Collapse group buy details" : "Expand group buy details"}
                >
                  <div className="flex items-center justify-center gap-2">
                    <ShoppingCart size={14} style={{ color: theme.textLight }} />
                    <span className="text-sm font-semibold" style={{ color: theme.textLight }}>
                      {groupBuyInfo.item && groupBuyInfo.item !== 'Available' 
                        ? (groupBuyInfo.vendor 
                            ? `${groupBuyInfo.item} with ${groupBuyInfo.vendor}`
                            : groupBuyInfo.item)
                        : (groupBuyInfo.vendor 
                            ? `Group Buy with ${groupBuyInfo.vendor}`
                            : 'Group Buy')}
                    </span>
                    {expandedGroupBuy === dayKey ? (
                      <ChevronUp size={14} style={{ color: theme.textLight }} />
                    ) : (
                      <ChevronDown size={14} style={{ color: theme.textLight }} />
                    )}
                  </div>
                </button>
                
                {/* Expanded details */}
                <div 
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{
                    maxHeight: expandedGroupBuy === dayKey && expandedGroupBuyData ? '500px' : '0',
                    opacity: expandedGroupBuy === dayKey && expandedGroupBuyData ? 1 : 0,
                    transform: expandedGroupBuy === dayKey && expandedGroupBuyData ? 'translateY(0)' : 'translateY(-10px)'
                  }}
                >
                  {expandedGroupBuy === dayKey && expandedGroupBuyData && (
                    <div className="mt-2 p-3 rounded-lg space-y-3" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.03)' : theme.cardBackground, border: `1px solid ${theme.border}` }}>
                    <div className="pb-2 border-b" style={{ borderColor: theme.border }}>
                      <p className="font-semibold text-sm" style={{ color: theme.text }}>{expandedGroupBuyData.item || 'Unknown Item'}</p>
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {expandedGroupBuyData.vendor && (
                        <div className="flex items-start gap-2">
                          <Building size={14} style={{ color: theme.textLight, marginTop: '2px', flexShrink: 0 }} />
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold mb-0.5" style={{ color: theme.textLight }}>Host</div>
                            <div className="text-xs" style={{ color: theme.text }}>{expandedGroupBuyData.vendor}</div>
                          </div>
                        </div>
                      )}

                      {expandedGroupBuyData.price && (
                        <div className="flex items-start gap-2">
                          <DollarSign size={14} style={{ color: theme.textLight, marginTop: '2px', flexShrink: 0 }} />
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold mb-0.5" style={{ color: theme.textLight }}>Price</div>
                            <div className="text-xs" style={{ color: theme.text }}>${String(expandedGroupBuyData.price).replace(/^\$/, '')}</div>
                          </div>
                        </div>
                      )}

                      {expandedGroupBuyData.openDate && (
                        <div className="flex items-start gap-2">
                          <Calendar size={14} style={{ color: theme.textLight, marginTop: '2px', flexShrink: 0 }} />
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold mb-0.5" style={{ color: theme.textLight }}>Opens</div>
                            <div className="text-xs" style={{ color: theme.text }}>{formatMMDDYYYY(expandedGroupBuyData.openDate)}</div>
                          </div>
                        </div>
                      )}

                      {expandedGroupBuyData.closeDate && (
                        <div className="flex items-start gap-2">
                          <Calendar size={14} style={{ color: theme.textLight, marginTop: '2px', flexShrink: 0 }} />
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold mb-0.5" style={{ color: theme.textLight }}>Closes</div>
                            <div className="text-xs" style={{ color: theme.text }}>{formatMMDDYYYY(expandedGroupBuyData.closeDate)}</div>
                          </div>
                        </div>
                      )}

                      {expandedGroupBuyData.location && (
                        <div className="flex items-start gap-2">
                          <MapPin size={14} style={{ color: theme.textLight, marginTop: '2px', flexShrink: 0 }} />
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold mb-0.5" style={{ color: theme.textLight }}>Platform</div>
                            <div className="text-xs" style={{ color: theme.text }}>{expandedGroupBuyData.location}</div>
                          </div>
                        </div>
                      )}

                      {expandedGroupBuyData.participants && (
                        <div className="flex items-start gap-2">
                          <Users size={14} style={{ color: theme.textLight, marginTop: '2px', flexShrink: 0 }} />
                          <div className="min-w-0">
                            <div className="text-[10px] font-semibold mb-0.5" style={{ color: theme.textLight }}>Participants</div>
                            <div className="text-xs" style={{ color: theme.text }}>{expandedGroupBuyData.participants}</div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t" style={{ borderColor: theme.border }}>
                      <div className="flex items-center gap-2 mb-1">
                        <FileText size={14} style={{ color: theme.textLight }} />
                        <div className="text-[10px] font-semibold" style={{ color: theme.textLight }}>Notes</div>
                      </div>
                      <p className="text-xs whitespace-pre-wrap" style={{ color: expandedGroupBuyData.notes ? theme.text : theme.textLight }}>
                        {expandedGroupBuyData.notes || 'No notes available'}
                      </p>
                    </div>
                  </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Washout — card */}
            {dayScheduled?.washout?.length > 0 && (
              <div
                className="rounded-2xl overflow-hidden"
                style={{
                  border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(200,122,92,0.25)'}`,
                  background: theme.isDark
                    ? 'linear-gradient(160deg, rgba(200,122,92,0.12) 0%, rgba(30,32,38,0.4) 100%)'
                    : 'linear-gradient(180deg, rgba(200,122,92,0.07) 0%, rgba(255,255,255,0.95) 100%)',
                  boxShadow: theme.isDark
                    ? 'inset 0 1px 0 rgba(255,255,255,0.04)'
                    : '0 2px 12px -2px rgba(200,122,92,0.12), inset 0 1px 0 rgba(255,255,255,0.8)',
                }}
              >
                <div
                  className="flex items-center gap-2.5 px-3 py-2.5"
                  style={{ borderBottom: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(200,122,92,0.15)'}` }}
                >
                  <PhTimer
                    size={22}
                    weight="duotone"
                    color={theme.isDark ? 'rgba(200,122,92,0.9)' : '#c87a5c'}
                    className="flex-shrink-0"
                    aria-hidden
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-bold leading-tight" style={{ color: theme.text }}>Washout</p>
                  </div>
                </div>
                <div className="px-3 py-3 grid grid-cols-3 gap-1.5">
                  {dayScheduled.washout.map((w, wIdx) => {
                    const isObj = typeof w === 'object' && w !== null;
                    const name = isObj ? w.name : w;
                    const hasHalfLife = isObj && w.halfLives && w.halfLives.length > 0;
                    const barColor = theme.isDark ? 'rgba(200,122,92,0.75)' : '#c87a5c';
                    const { pct: periodPct, daysLeft } = isObj ? getWashoutPeriodProgress(w) : { pct: 0, daysLeft: 0 };

                    return (
                      <div
                        key={wIdx}
                        className="rounded-xl overflow-hidden min-w-0"
                        style={{
                          backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(200,122,92,0.06)',
                          border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(200,122,92,0.18)'}`,
                        }}
                      >
                        <div className="px-1.5 py-1.5 text-center">
                          <div className="text-xs font-semibold leading-snug line-clamp-2" style={{ color: theme.text }} title={name}>
                            {name}
                          </div>
                          {isObj && (
                            <div className="text-[10px] mt-0.5 leading-tight font-medium" style={{ color: '#c87a5c' }}>
                              Day {w.dayIndex + 1}/{w.totalDays}
                            </div>
                          )}
                        </div>
                        {isObj && w.totalDays > 0 && (
                          <div className="px-1.5 pb-1.5 space-y-0.5">
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(200,122,92,0.12)' }}>
                              <div className="h-full rounded-full transition-all" style={{
                                width: `${Math.max(periodPct > 0 ? 2 : 0, periodPct)}%`,
                                background: `linear-gradient(90deg, ${barColor} 0%, ${barColor}80 60%, ${barColor}30 100%)`
                              }} />
                            </div>
                            <div className="flex justify-between mt-0.5 text-[9px] leading-tight" style={{ color: theme.textLight }}>
                              <span>{periodPct}%</span>
                              <span>{daysLeft === 0 ? 'last day' : `${daysLeft}d left`}</span>
                            </div>
                            {hasHalfLife && w.halfLives.map((hl, hlIdx) => {
                              const remainingPct = getHalfLifeRemainingPct(w.dayIndex, hl);
                              if (remainingPct == null) return null;
                              return (
                                <div key={hlIdx} className="text-[9px] leading-tight truncate text-center" style={{ color: theme.textLight }} title={hl.name}>
                                  {w.halfLives.length > 1 && <span className="font-medium">{hl.name}: </span>}
                                  ~{remainingPct}% left · {hl.value}{hl.unit === 'days' ? 'd' : 'h'} t½
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Protocol Note Detail Modal */}
      <Modal
        open={!!selectedNote}
        onClose={() => setSelectedNote(null)}
        title={
          <div className="flex items-center gap-2">
            <FileText size={20} />
            <span>{selectedNote?.type === 'follow_up' ? 'Protocol Follow-Up' : 'Protocol Note'}</span>
          </div>
        }
        theme={theme}
        variant="modern"
        maxWidth="max-w-2xl"
      >
        {selectedNote && (() => {
          const proto = ctxProtocols?.find(p => p.id === selectedNote.protocolId)
          const noteAccent = getProtocolAccentHex(proto || { id: selectedNote.protocolId, protocolName: selectedNote.protocolName })
          return (
          <div className="space-y-4">
            <div className="flex items-center gap-4 text-xs" style={{ color: theme.textLight }}>
              {selectedNote.createdAt && (
                <span>Started: {formatMMDDYYYY(selectedNote.createdAt)}</span>
              )}
              {selectedNote.protocolName && (
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  For: {selectedNote.protocolName}
                </span>
              )}
            </div>

            <div
              className="p-4 rounded-lg"
              style={{
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.cardBackground,
                border: `2px solid ${noteAccent}`,
                borderLeft: `4px solid ${noteAccent}`
              }}
            >
              {selectedNote.type === 'follow_up' && selectedNote.rating !== undefined && selectedNote.rating !== null && (
                <div className="mb-3 flex items-center justify-center gap-2">
                  <span className="text-sm font-medium" style={{ color: theme.text }}>Protocol Rating:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star
                        key={n}
                        size={18}
                        style={{
                          fill: selectedNote.rating >= n ? noteAccent : 'none',
                          color: selectedNote.rating >= n ? noteAccent : (theme.isDark ? '#4b5563' : theme.border),
                          strokeWidth: 1.5
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {selectedNote.content && (
                <p className="text-sm whitespace-pre-wrap mb-3" style={{ color: theme.text }}>
                  {selectedNote.content}
                </p>
              )}

              {selectedNote.tags && selectedNote.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedNote.tags.map(tagId => {
                    const tag = NOTE_TAGS.find(t => t.id === tagId)
                    return (
                      <span
                        key={tagId}
                        className="px-2 py-0.5 rounded text-xs font-medium"
                        style={{
                          backgroundColor: noteAccent + '20',
                          color: noteAccent
                        }}
                      >
                        {tag ? tag.label : tagId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          )
        })()}
      </Modal>

      {injectionDayScope.start && injectionDayScope.end && (
        <InjectionHistoryModal
          isOpen={showInjectionHistory}
          onClose={() => setShowInjectionHistory(false)}
          theme={theme}
          dateScopeStart={injectionDayScope.start}
          dateScopeEnd={injectionDayScope.end}
        />
      )}

      <SideEffectsQuickSheet
        open={showSideEffectSheet}
        onClose={closeSideEffectSheet}
        theme={theme}
        protocol={null}
        protocols={activeProtocols}
        date={dayKey}
        editEntry={editingSideEffect}
      />
    </>
  )
}

