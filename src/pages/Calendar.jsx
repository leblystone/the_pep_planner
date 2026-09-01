import React, { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { themes, defaultThemeName } from '../theme/themes'
import CalendarHeader from '../components/calendar/CalendarHeader'
import MonthGrid, { toKey } from '../components/calendar/MonthGrid'
import { formatMMDDYYYY, getLocalDateString } from '../utils/date'
import WeekView from '../components/calendar/WeekView'
// Removed notes-only modal to avoid overlap; using DayView for all edits
import DayView from '../components/calendar/DayView'
import NotesModal from '../components/calendar/NotesModal'
import CalendarIconKey from '../components/calendar/CalendarIconKey'
import CalendarQuickEdit from '../components/calendar/CalendarQuickEdit'
import DayModal from '../components/calendar/DayModal'
import { calculateScheduledTasksForDate } from '../utils/calendarTasks'
import { useAppContext } from '../context/AppContext'
import { getCalendarDone, toggleTaskCompletion, generateTaskId, isTaskCompleted, migrateTaskCompletionSlot } from '../utils/taskCompletion'
import { useSubscriptionAccess, useTierAccess } from '../utils/useSubscriptionAccess'
import UpgradeModal from '../components/common/UpgradeModal'
import { useFirebase } from '../context/FirebaseContext'
import { safeLocalStorageGet } from '../utils/dataBleedDiagnostic'
import InjectionSiteSelector from '../components/common/InjectionSiteSelector'
import { isInjectionSiteTrackingEnabled } from '../utils/injectionSiteSettings'
import { useHorizontalSwipe } from '../utils/useSwipeGesture'
import { 
  migrateCalendarNotesToIdBased, 
  getCalendarNoteText, 
  hasCalendarNotes as hasCalendarNotesUtil 
} from '../utils/calendarNotesMigration'
import { trackEngagement } from '../utils/engagementTracking'
import { getProtocolAccentHex } from '../utils/protocolColors'
import { applyScheduleOverridesToBySlot, setSlotMoveOverride, setSkipOverride, setExtraOverride, clearSkipOverride, clearExtraOverride } from '../utils/taskScheduleOverrides'
import LogOneOffDoseModal from '../components/doses/LogOneOffDoseModal'
import { getOneOffDosesForDate } from '../utils/oneOffDoses'

// Helper to safely parse YYYY-MM-DD strings into local time dates
// Must handle: string dates, Date objects, Firebase Timestamps, numbers
function parseDateString(dateString) {
    if (!dateString) return null;
    if (dateString instanceof Date) return dateString;
    if (typeof dateString === 'object' && typeof dateString.toDate === 'function') {
        return dateString.toDate();
    }
    if (typeof dateString !== 'string') {
        try { return new Date(dateString); } catch { return null; }
    }
    const parts = dateString.split('-');
    if (parts.length !== 3) return new Date(dateString);
    const [year, month, day] = parts.map(Number);
    return new Date(year, month - 1, day);
}

// Helper to normalize a date to midnight in local time for accurate day difference calculations
function normalizeToMidnight(date) {
    if (!date) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// Helper to calculate day difference between two dates (normalized to midnight)
function getDayDifference(date1, date2) {
    const normalized1 = normalizeToMidnight(date1);
    const normalized2 = normalizeToMidnight(date2);
    if (!normalized1 || !normalized2) return null;
    return Math.floor((normalized2 - normalized1) / (1000 * 60 * 60 * 24));
}

// Helper to normalize day names to short format (Mon, Tue, etc.)
// This ensures compatibility between stored day names (which may be full or short format)
// and the short format returned by toLocaleDateString
function normalizeDayName(day) {
    if (!day) return day;
    const dayMap = {
        'Monday': 'Mon', 'Tuesday': 'Tue', 'Wednesday': 'Wed', 'Thursday': 'Thu',
        'Friday': 'Fri', 'Saturday': 'Sat', 'Sunday': 'Sun',
        'monday': 'Mon', 'tuesday': 'Tue', 'wednesday': 'Wed', 'thursday': 'Thu',
        'friday': 'Fri', 'saturday': 'Sat', 'sunday': 'Sun'
    };
    return dayMap[day] || day;
}

function getWindows(p) {
    try {
      if (!p?.startDate) return { start: null, end: null, washStart: null, washEnd: null }
      const startDt = parseDateString(p.startDate)
      let endDt = null;
      const isOngoing = p.duration?.noEnd === true;
      const wasStopped = p.active === false && p.endDate;
      
      if (wasStopped) {
        endDt = parseDateString(p.endDate);
      } else if (isOngoing) {
        endDt = null;
      } else if (p.endDate) {
        const candidateEnd = parseDateString(p.endDate);
        // Guard against stale endDate (protocol restarted with new startDate but old endDate kept)
        if (candidateEnd && startDt && normalizeToMidnight(candidateEnd) >= normalizeToMidnight(startDt)) {
          endDt = candidateEnd;
        }
        // else: stale — fall through to duration-based calculation
      }
      if (!endDt && !isOngoing && p.duration && Number(p.duration.count) > 0) {
          const cyclePeptide = p.peptides?.find(pep => pep.frequency?.type === 'cycle');
          
          if (cyclePeptide) {
              const onDays = Number(cyclePeptide.frequency.onDays) || 0;
              const offDays = Number(cyclePeptide.frequency.offDays) || 0;
              if (onDays > 0) {
                  const durationInDays = (() => {
                      const count = Number(p.duration.count);
                      const unit = p.duration.unit.toLowerCase();
                      if (unit.includes('day')) return count;
                      if (unit.includes('week')) return count * 7;
                      if (unit.includes('month')) return count * 30;
                      return 0;
                  })();
                  const fullCycles = Math.floor(durationInDays / onDays);
                  const remainingOnDays = durationInDays % onDays;
                  let totalDays = fullCycles * (onDays + offDays);
                  if (remainingOnDays > 0) {
                      totalDays += remainingOnDays;
                  } else if (fullCycles > 0) {
                      totalDays -= offDays;
                  }
                  if (startDt) {
                    endDt = new Date(startDt);
                    endDt.setDate(endDt.getDate() + totalDays - 1);
                  }
              }
          } else {
            // Fallback for non-cycle protocols
            if (startDt) {
              endDt = new Date(startDt);
              const unit = String(p.duration.unit || 'week').toLowerCase();
              const count = Number(p.duration.count) || 0;
              if (unit.includes('day')) endDt.setDate(endDt.getDate() + count - 1);
              else if (unit.includes('week')) endDt.setDate(endDt.getDate() + (count * 7) - 1);
              else if (unit.includes('month')) { endDt.setMonth(endDt.getMonth() + count); endDt.setDate(endDt.getDate() - 1); }
            }
          }
      }

      let washStart = null, washEnd = null
      if (p.washout?.enabled && endDt) {
        try {
          washStart = new Date(endDt.getFullYear(), endDt.getMonth(), endDt.getDate() + 1)
          washEnd = new Date(washStart)
          const wUnit = String(p.washout.unit || 'week').toLowerCase()
          const wCount = Number(p.washout.count) || 0
          if (wCount > 0) {
            if (wUnit === 'day') washEnd.setDate(washEnd.getDate() + wCount - 1)
            else if (wUnit === 'week') washEnd.setDate(washEnd.getDate() + (wCount * 7) - 1)
            else if (wUnit === 'month') { washEnd.setMonth(washEnd.getMonth() + wCount); washEnd.setDate(washEnd.getDate() - 1) }
          } else { washStart = null; washEnd = null }
        } catch (e) {
          // If endDt is invalid, skip washout calculation
          washStart = null;
          washEnd = null;
        }
      }
      return { start: startDt, end: endDt, washStart, washEnd }
    } catch { return { start: null, end: null, washStart: null, washEnd: null } }
}

export default function Calendar() {
  const { theme } = useOutletContext()
  const { protocols, reconItems, supplements, orders, metrics, calendarNotes, updateCalendarNote, scheduledBuys, setCalendarNotes, subscription, oneOffDoses, medications } = useAppContext();
  const { isReadOnly, isDowngraded, isTrialExpired, isSubscriptionEnded } = useSubscriptionAccess();
  const caps = useTierAccess();
  const { firebaseUser } = useFirebase();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [goals, setGoals] = useState([]);
  
  // Track calendar view for engagement (once per day)
  useEffect(() => {
    if (firebaseUser?.uid) {
      trackEngagement(firebaseUser.uid, 'firstCalendarView').catch(() => {});
    }
  }, [firebaseUser?.uid]);

  // Load goals from cloud-synced localStorage (tpprover_user_goals) with user validation
  useEffect(() => {
    const load = () => {
      if (!firebaseUser?.email) return;
      try {
        const savedGoals = safeLocalStorageGet('tpprover_user_goals', firebaseUser.email);
        setGoals(Array.isArray(savedGoals) ? savedGoals : []);
      } catch (error) {
        console.error('Error loading goals:', error);
      }
    };
    load();
    window.addEventListener('tpp:user-goals-updated', load);
    window.addEventListener('tpp:cloud-data-loaded', load);
    return () => {
      window.removeEventListener('tpp:user-goals-updated', load);
      window.removeEventListener('tpp:cloud-data-loaded', load);
    };
  }, [firebaseUser?.email]);
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState(() => {
    try {
      const settings = JSON.parse(localStorage.getItem('tpprover_settings') || '{}');
      if (settings.calendar?.defaultView) return settings.calendar.defaultView;
    } catch {
      /* use width-based default */
    }
    if (typeof window !== 'undefined' && window.innerWidth < 640) return 'week';
    return 'month';
  }) // 'month' | 'week'
  const [activeDay, setActiveDay] = useState(null)
  const [editingNotesFor, setEditingNotesFor] = useState(null)
  const [dayModalDate, setDayModalDate] = useState(null) // For day modal in monthly view
  // scheduled structure: { [dateKey]: { peptides: string[], supplements: string[], buys: number } }
  const [scheduled, setScheduled] = useState({})
  const [done, setDone] = useState({})
  const [protocolTimelines, setProtocolTimelines] = useState([]);
  const [calendarBump, setCalendarBump] = useState(0);
  
  // Listen for task completion events to sync calendar views
  useEffect(() => {
    const handleTaskCompletionChange = (e) => {
      setCalendarBump(Date.now());
    };
    
    const handleCalendarSync = (e) => {
      setCalendarBump(Date.now());
    };
    
    const handleProtocolChange = (e) => {
      // Protocol was updated (dose/titration changed) - refresh calendar tasks
      setCalendarBump(Date.now());
    };
    
    window.addEventListener('tpp:task-completion-changed', handleTaskCompletionChange);
    window.addEventListener('tpp:calendar-sync', handleCalendarSync);
    window.addEventListener('tpp:protocol-changed', handleProtocolChange);
    window.addEventListener('tpp:schedule-overrides-changed', handleTaskCompletionChange);
    window.addEventListener('tpp:one-off-doses-updated', handleCalendarSync);
    
    return () => {
      window.removeEventListener('tpp:task-completion-changed', handleTaskCompletionChange);
      window.removeEventListener('tpp:calendar-sync', handleCalendarSync);
      window.removeEventListener('tpp:protocol-changed', handleProtocolChange);
      window.removeEventListener('tpp:schedule-overrides-changed', handleTaskCompletionChange);
      window.removeEventListener('tpp:one-off-doses-updated', handleCalendarSync);
    };
  }, []);
  const [showIconKey, setShowIconKey] = useState(false);
  const [quickEditDate, setQuickEditDate] = useState(null);
  const [quickEditData, setQuickEditData] = useState(null);
  const [showLogOneOffDose, setShowLogOneOffDose] = useState(false);
  const [logOneOffDateKey, setLogOneOffDateKey] = useState(() => getLocalDateString());
  const [todayPulse, setTodayPulse] = useState(false);
  // Injection site tracking state for week view mark all done
  const [injectionTask, setInjectionTask] = useState(null);
  const [pendingInjectionTasks, setPendingInjectionTasks] = useState([]);
  const [pendingMarkAllContext, setPendingMarkAllContext] = useState(null); // { date, timeSlot, slotKey, allTaskIds }
  // Migrate legacy localStorage calendar notes to context on mount
  useEffect(() => {
    try { 
      const raw = localStorage.getItem('tpprover_calendar_notes'); 
      if (raw) {
        const parsed = JSON.parse(raw);
        // Only migrate if there's no data in context yet (first-time migration)
        if (!calendarNotes || Object.keys(calendarNotes).length === 0) {
          const migrated = migrateCalendarNotesToIdBased(parsed);
          setCalendarNotes(migrated);
          console.log('📅 Migrated calendar notes from localStorage to context');
        }
        // Remove localStorage key now that data is in context/Firebase
        localStorage.removeItem('tpprover_calendar_notes');
      }
    } catch (e) {
      console.warn('Failed to migrate calendar notes:', e);
    }
    // Load done data from unified completion system
    setDone(getCalendarDone());
  }, [])

  // Define loadData function outside useEffect so it can be referenced elsewhere
  const loadData = React.useCallback(() => {
        try {
          // Debug logging for Android builds - log data availability
          const dataCheck = {
            protocols: protocols?.length || 0,
            supplements: supplements?.length || 0,
            reconItems: reconItems?.length || 0,
            scheduledBuys: scheduledBuys?.length || 0
          };
          
          
          const supps = supplements
          // Calculate date range based on view mode
          // For week view, include the full week (may span across months)
          // For month view, use the current month
          let start, end;
          if (viewMode === 'week') {
            // Calculate week start based on settings
            const weekStartsOn = (() => {
              try {
                const settings = JSON.parse(localStorage.getItem('tpprover_settings') || '{}');
                return settings.region?.weekStartsOn || 'monday';
              } catch {
                return 'monday';
              }
            })();
            const d = new Date(currentDate);
            const day = d.getDay(); // 0=Sun..6=Sat
            if (weekStartsOn === 'sunday') {
              d.setDate(d.getDate() - day);
            } else {
              const iso = (day + 6) % 7; // 0=Mon..6=Sun
              d.setDate(d.getDate() - iso);
            }
            d.setHours(0, 0, 0, 0);
            start = new Date(d);
            end = new Date(d);
            end.setDate(end.getDate() + 6); // 7 days total (0-6)
          } else {
            // Month view: use full month range
            start = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
            end = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
          }
          // NOTE: Supplement scheduling (active/heldByFreePlan/startDate/endDate/day-of-week)
          // is computed exclusively inside calculateScheduledTasksForDate below (single source
          // of truth shared with Dashboard/DayModal/notifications). A legacy duplicate loop used
          // to pre-populate bySlot.supplements here with a more permissive filter (no active/
          // heldByFreePlan/date-range checks), which caused paused or paywall-held supplements to
          // still show on Calendar while correctly hidden on the Dashboard widget. Removed to keep
          // both views in sync.
          const next = {}
          // Upcoming buys badges from Orders: mark orders with status 'Order Placed' within next N days
          const N = 7
          const today = new Date()
          const horizon = new Date(today.getFullYear(), today.getMonth(), today.getDate() + N)
          for (const o of orders) {
            if ((o.status || '') !== 'Order Placed' || !o.date) continue
            const od = parseDateString(o.date)
            // Add null check to prevent getTime() errors on Android
            if (!od) continue
            if (od >= today && od <= horizon) {
              const key = toKey(od)
              const label = (o.group && o.group.title) ? o.group.title : (o.peptide || 'Buy')
              next[key] = {
                ...(next[key] || {}),
                buys: (next[key]?.buys || 0) + 1,
                buyDetails: [ ...(Array.isArray(next[key]?.buyDetails) ? next[key].buyDetails : []), label ].slice(0, 3),
              }
            }
          }
          // Scheduled group buys: mark all days in [openDate, closeDate]
          // Use scheduledBuys from context instead of reading directly from localStorage
          // Additional safety filter: remove mock data if sample data was cleared
          const sampleDataCleared = localStorage.getItem('tpprover_sample_data_cleared') === 'true';
          const contextScheduledBuys = (scheduledBuys || []).filter(buy => {
            if (!sampleDataCleared) return true;
            // Filter by isMock flag
            if (buy.isMock) return false;
            // Filter by known mock vendors
            const mockVendors = ['BioTech Solutions', 'Peptide Research Co', 'Research Labs Pro'];
            if (mockVendors.includes(buy.vendor)) return false;
            // Filter by known mock IDs
            if (buy.id === 201 || buy.id === 202 || buy.id === 203) return false;
            // Filter by known mock item names
            const mockItems = ['Tirzepatide Bulk Order', 'BPC-157 Research Batch', 'Epithalon + Thymalin Stack'];
            if (mockItems.includes(buy.item)) return false;
            return true;
          });
          // Protocol indicators: count by time-of-day occurrences + wash-out chips
          const prots = protocols
          const metricsByKey = (metrics || []).reduce((map, m) => {
            try {
              const d = parseDateString(m.date)
              // Add null check to prevent getTime() errors on Android
              if (!d) return map
              const key = toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()))
              map[key] = m
            } catch {}
            return map
          }, {})

          const sortedMetrics = (metrics || []).sort((a, b) => new Date(a.date) - new Date(b.date));
          const metricsWithTrend = sortedMetrics.map((metric, index) => {
              if (index === 0) return { ...metric, weightTrend: 'none', bodyfatTrend: 'none' };
              const prev = sortedMetrics[index - 1];
              const weightTrend = parseFloat(metric.weight) > parseFloat(prev.weight) ? 'up' : parseFloat(metric.weight) < parseFloat(prev.weight) ? 'down' : 'none';
              const bodyfatTrend = parseFloat(metric.bodyfat) > parseFloat(prev.bodyfat) ? 'up' : parseFloat(metric.bodyfat) < parseFloat(prev.bodyfat) ? 'down' : 'none';
              return { ...metric, weightTrend, bodyfatTrend };
          });

          const metricsByKeyWithTrend = metricsWithTrend.reduce((map, m) => {
              try {
                  const d = new Date(m.date);
                  const key = toKey(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
                  map[key] = m;
              } catch {}
              return map;
          }, {});

          const timelines = prots.map(p => {
            const windows = getWindows(p);
            return {
                ...windows,
                id: p.id,
                name: p.protocolName || 'Unnamed Protocol',
                color: getProtocolAccentHex(p),
            };
          }).filter(t => t.start);
          setProtocolTimelines(timelines);

          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const key = toKey(d)
            // Mark scheduled group buys covering this day
            for (const gb of contextScheduledBuys) {
              if (!gb?.openDate || !gb?.closeDate) continue
              const od = parseDateString(gb.openDate)
              const cd = parseDateString(gb.closeDate)
              if (!od || !cd) continue
              const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
              if (dOnly >= new Date(od.getFullYear(), od.getMonth(), od.getDate()) && dOnly <= new Date(cd.getFullYear(), cd.getMonth(), cd.getDate())) {
                next[key] = {
                  ...(next[key] || {}),
                  groupBuys: [ ...(next[key]?.groupBuys || []), gb ],
                }
              }
            }

            // ========================================
            // SINGLE SOURCE OF TRUTH: Use calculateScheduledTasksForDate
            // This is the SAME function used by DayModal, Dashboard, and notifications
            // ========================================
            const dayDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
            const dayTasks = calculateScheduledTasksForDate(dayDate, prots, supps, reconItems, medications, !!caps?.enforced)
            
            // Merge calculated tasks with existing supplement data already in next[key]
            const existingBySlot = next[key]?.bySlot || {}
            const calculatedBySlot = dayTasks.bySlot || {}
            let mergedBySlot = { ...existingBySlot }
            
            for (const slot in calculatedBySlot) {
              const existingPeptides = mergedBySlot[slot]?.peptides || []
              const newPeptides = calculatedBySlot[slot]?.peptides || []
              const existingSupplements = mergedBySlot[slot]?.supplements || []
              const newSupplements = calculatedBySlot[slot]?.supplements || []
              
              // Deduplicate peptides by name + protocolId + peptideId
              const uniquePeptides = [...existingPeptides]
              newPeptides.forEach(newPep => {
                if (!uniquePeptides.some(existing => 
                  existing.name === newPep.name && 
                  existing.protocolId === newPep.protocolId &&
                  existing.peptideId === newPep.peptideId
                )) {
                  uniquePeptides.push(newPep)
                }
              })
              
              // Deduplicate supplements by name
              const uniqueSupplements = [...existingSupplements]
              newSupplements.forEach(newSup => {
                if (!uniqueSupplements.some(existing => existing.name === newSup.name)) {
                  uniqueSupplements.push(newSup)
                }
              })
              
              mergedBySlot[slot] = {
                peptides: uniquePeptides,
                supplements: uniqueSupplements,
              }
            }

            mergedBySlot = applyScheduleOverridesToBySlot(key, mergedBySlot)
            
            // Count tasks per slot and track active protocol names
            const activeProtoNames = new Set()
            prots.forEach(p => {
              const { start: ps, end: pe } = getWindows(p)
              const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
              const psOnly = ps ? new Date(ps.getFullYear(), ps.getMonth(), ps.getDate()) : null
              const peOnly = pe ? new Date(pe.getFullYear(), pe.getMonth(), pe.getDate()) : null
              const inRange = (!psOnly || psOnly <= dOnly) && (!peOnly || peOnly >= dOnly)
              if (inRange && p.active !== false && p.protocolName) {
                activeProtoNames.add(p.protocolName)
              }
            })
            
            const dayOneOffs = getOneOffDosesForDate(key, oneOffDoses || []);
            const hasTasks = Object.keys(mergedBySlot).some(slot => 
              (mergedBySlot[slot]?.peptides?.length > 0) || (mergedBySlot[slot]?.supplements?.length > 0)
            ) || dayOneOffs.length > 0;
            
            if (hasTasks || dayOneOffs.length > 0) {
              const times = Object.keys(mergedBySlot).reduce((acc, slot) => {
                acc[slot] = (mergedBySlot[slot]?.peptides?.length || 0)
                return acc
              }, {})

              const doneForDay = done[key] || {}
              const maxTotal = Object.values(times).reduce((a, b) => a + (b || 0), 0)
              const doneTotal = Object.values(doneForDay).reduce((a, b) => a + (b || 0), 0)
              const doneAll = maxTotal > 0 && doneTotal >= maxTotal

              // Unique supplement count across all slots (drives the month-grid dot/count badge)
              const uniqueSuppNames = new Set()
              Object.values(mergedBySlot).forEach(slot => {
                (slot?.supplements || []).forEach(s => {
                  const name = typeof s === 'object' ? s.name : s
                  if (name) uniqueSuppNames.add(name)
                })
              })

              next[key] = { ...(next[key] || {}), times, bySlot: mergedBySlot, done: doneForDay, doneAll, protocols: Array.from(activeProtoNames), oneOffs: dayOneOffs, supplements: Array(uniqueSuppNames.size).fill('supp') }
            }
            
            // Wash-out chips (enriched with half-life data for gradient rendering)
            // Only show washout for protocols that are active (projected) or were properly ended
            for (const p of prots) {
              if (p.active === false && !p.endType) continue
              const { washStart, washEnd } = getWindows(p)
              if (washStart && washEnd) {
                const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate())
                const wStart = new Date(washStart.getFullYear(), washStart.getMonth(), washStart.getDate())
                const wEnd = new Date(washEnd.getFullYear(), washEnd.getMonth(), washEnd.getDate())
                if (dOnly >= wStart && dOnly <= wEnd) {
                  const totalDays = Math.max(1, Math.round((wEnd - wStart) / 86400000) + 1)
                  const dayIndex = Math.round((dOnly - wStart) / 86400000)
                  const pepHalfLives = (p.peptides || [])
                    .filter(pep => pep.halfLife && pep.halfLife.value && parseFloat(pep.halfLife.value) > 0)
                    .map(pep => ({
                      name: pep.name,
                      value: parseFloat(pep.halfLife.value),
                      unit: pep.halfLife.unit || 'hours'
                    }))
                  next[key] = {
                    ...(next[key] || {}),
                    washout: [
                      ...(next[key]?.washout || []),
                      {
                        name: p.protocolName || 'Protocol',
                        dayIndex,
                        totalDays,
                        halfLives: pepHalfLives.length > 0 ? pepHalfLives : null
                      }
                    ]
                  }
                }
              }
            }
            // Scheduled Group Buys (duplicate check - already handled above, but keeping for compatibility)
            const dayBuys = contextScheduledBuys.filter(b => {
                if (!b?.openDate || !b?.closeDate) return false;
                const open = parseDateString(b.openDate);
                const close = parseDateString(b.closeDate);
                // Add null checks to prevent getTime() errors on Android
                if (!open || !close) return false;
                const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
                return dOnly >= open && dOnly <= close;
            });
            if (dayBuys.length > 0) {
                // Store full group buy objects instead of just item names
                const existingGroupBuys = next[key]?.groupBuys || [];
                const existingIds = new Set(existingGroupBuys.map(gb => typeof gb === 'object' ? gb.id : null).filter(Boolean));
                const newBuys = dayBuys.filter(b => !existingIds.has(b.id));
                if (newBuys.length > 0) {
                    next[key] = { ...(next[key] || {}), groupBuys: [...existingGroupBuys, ...newBuys] };
                }
            }
          }
          // Group buys: mark any order with .group that falls on this month (for subtle count in month header)
          for (const o of orders) {
            if (!o.group || !o.date) continue
            const od = parseDateString(o.date)
            // Add null check to prevent getTime() errors on Android
            if (!od) continue
            if (od.getMonth() === currentDate.getMonth() && od.getFullYear() === currentDate.getFullYear()) {
              const key = toKey(od)
              // Store order object with group buy info to preserve vendor and other details
              const groupBuyObj = {
                item: (o.group && (o.group.title || o.group.name)) || o.peptide || o.item || 'Group Buy',
                vendor: o.vendor || o.seller || o.source || '',
                price: o.cost ?? o.price ?? o.amount ?? '',
                openDate: o.date,
                closeDate: o.date,
                location: o.location,
                participants: o.group?.participants,
                notes: o.group?.notes || o.notes,
                source: 'orders',
                orderId: o.id
              };
              // Check if this group buy already exists (avoid duplicates)
              const existingGroupBuys = next[key]?.groupBuys || [];
              const isDuplicate = existingGroupBuys.some(gb => 
                typeof gb === 'object' && gb.orderId === o.id
              );
              if (!isDuplicate) {
                next[key] = { ...(next[key] || {}), groupBuys: [ ...existingGroupBuys, groupBuyObj ] };
              }
            }
          }
          // Attach metrics if present for each day key
          for (const k of Object.keys(next)) {
            if (metricsByKeyWithTrend[k]) {
              next[k] = { ...(next[k] || {}), metrics: metricsByKeyWithTrend[k] }
            }
          }

          // Add goals to calendar data
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const key = toKey(d);
            const dayGoals = goals.filter(goal => {
              if (!goal.dueDate) return false;
              const goalDate = new Date(goal.dueDate);
              return goalDate.getFullYear() === d.getFullYear() && 
                     goalDate.getMonth() === d.getMonth() && 
                     goalDate.getDate() === d.getDate();
            });
            
            if (dayGoals.length > 0) {
              next[key] = {
                ...(next[key] || {}),
                goals: dayGoals
              };
            }
          }

          // Force complete refresh instead of merging to prevent stale data
          // Debug logging to help diagnose missing scheduled tasks
          const scheduledKeys = Object.keys(next);
          const keysWithTasks = scheduledKeys.filter(k => {
            const dayData = next[k];
            return (dayData?.bySlot && Object.keys(dayData.bySlot).length > 0) || 
                   (dayData?.peptides && dayData.peptides.length > 0) ||
                   (dayData?.supplements && dayData.supplements.length > 0);
          });
          if (keysWithTasks.length > 0) {
          }
          setScheduled(next)
        } catch (e) {
          console.error('[Calendar Debug] Error in loadData:', e);
          console.error('Error stack:', e.stack);
        }
  }, [currentDate, done, protocols, reconItems, supplements, medications, orders, metrics, theme, scheduledBuys, calendarBump, goals, viewMode, oneOffDoses, caps]);

  useEffect(() => {
    loadData(); // Initial load
  }, [loadData]);

  // Debug: Monitor data availability and log when it changes
  useEffect(() => {
    const dataStatus = {
      protocols: protocols?.length || 0,
      supplements: supplements?.length || 0,
      reconItems: reconItems?.length || 0,
      scheduledBuys: scheduledBuys?.length || 0,
      scheduledKeys: Object.keys(scheduled || {}).length
    };
    
    // Log when data becomes available (especially useful for Android debugging)
    if (dataStatus.protocols > 0 || dataStatus.supplements > 0) {
      // Data is available - calendar should render properly
    }
  }, [protocols, supplements, reconItems, scheduledBuys, scheduled]);

  // Force calendar refresh when data becomes available (Android fix)
  useEffect(() => {
    // If we have protocols or supplements but no scheduled data, force a refresh
    const hasData = (protocols?.length > 0 || supplements?.length > 0);
    const hasScheduled = Object.keys(scheduled).length > 0;
    
    if (hasData && !hasScheduled) {
      setCalendarBump(prev => prev + 1);
      // Also trigger loadData directly
      setTimeout(() => {
        loadData();
      }, 100);
    }
  }, [protocols?.length, supplements?.length, scheduled]);

  // Task completion handler - unified with Dashboard

  const handleTaskToggle = React.useCallback((task, date = new Date()) => {
    // Check if this is a syringe or pen delivery method
    const deliveryMethod = task.deliveryMethod || task.delivery;
    const isInjection = deliveryMethod === 'syringe' || deliveryMethod === 'pipette' || deliveryMethod === 'pen' || deliveryMethod === 'injection';
    
        // Injection confirmation is now handled inline in the task components
    
    const dateKey = toKey(date);
    const taskId = task.stableTaskId || generateTaskId(task);
    // Always check actual completion status from localStorage
    const currentlyCompleted = isTaskCompleted(taskId, dateKey, task.time);
    const newCompletedState = !currentlyCompleted;
    
    // Toggle in the unified system (this will dispatch the global event)
    toggleTaskCompletion(taskId, newCompletedState, dateKey, task.time, task.deliveryMethod || task.delivery || null);
    
    // CRITICAL: Update protection timestamp to prevent listener from overwriting
    // This prevents the real-time listener from replacing data for 30 seconds
    try {
      const now = Date.now();
      localStorage.setItem('tpprover_protocols_lastUpdate', String(now));
    } catch (e) {
      console.warn('⚠️ Failed to save task toggle protection timestamp:', e);
    }
    
    // Refresh calendar data to reflect changes
    setDone(getCalendarDone());
    setCalendarBump(Date.now());
  }, []);

  // ── Schedule action handlers (slot-move, skip, reschedule across days) ──────

  const handleCalendarSlotMove = React.useCallback((task, toSlot) => {
    const fromSlot = task.time;
    if (!fromSlot || fromSlot === toSlot) return;
    // Derive the dateKey from viewDateKey on the task if available, otherwise today
    const dateKey = task._viewDateKey || toKey(new Date());
    if (task.type === 'peptide') {
      setSlotMoveOverride(dateKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, fromSlot, toSlot });
    } else {
      setSlotMoveOverride(dateKey, { type: 'supplement', name: task.name, fromSlot, toSlot });
    }
    migrateTaskCompletionSlot(dateKey, task, fromSlot, toSlot);
    setCalendarBump(Date.now());
  }, []);

  const handleCalendarSkipDose = React.useCallback((task, viewDateKey) => {
    const dateKey = viewDateKey || toKey(new Date());
    const slot = task.time;
    if (task.type === 'peptide') {
      setSkipOverride(dateKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, slot });
    } else {
      setSkipOverride(dateKey, { type: 'supplement', name: task.name, slot });
    }
    setCalendarBump(Date.now());
  }, []);

  const handleCalendarUndoSkip = React.useCallback((task, viewDateKey) => {
    const dateKey = viewDateKey || toKey(new Date());
    const slot = task.time;
    if (task.type === 'peptide') {
      clearSkipOverride(dateKey, { type: 'peptide', protocolId: task.protocolId, peptideId: task.peptideId, name: task.name, slot });
    } else {
      clearSkipOverride(dateKey, { type: 'supplement', name: task.name, slot });
    }
    setCalendarBump(Date.now());
  }, []);

  const handleCalendarRescheduleToDate = React.useCallback((task, fromDateKey, targetLabel) => {
    if (!fromDateKey) return;
    const todayKey = toKey(new Date());
    let toDateKey;
    if (targetLabel === 'today') {
      toDateKey = todayKey;
    } else if (targetLabel === 'tomorrow') {
      const t = new Date();
      t.setDate(t.getDate() + 1);
      toDateKey = toKey(t);
    } else {
      toDateKey = targetLabel; // allow passing a direct dateKey
    }
    if (!toDateKey || toDateKey === fromDateKey) return;
    const slot = task.time;
    // Skip on source day as rescheduled; add catch-up on target
    if (task.type === 'peptide') {
      setSkipOverride(fromDateKey, {
        type: 'peptide',
        protocolId: task.protocolId,
        peptideId: task.peptideId,
        name: task.name,
        slot,
        reason: 'rescheduled',
        toDateKey,
        toSlot: slot,
      });
      setExtraOverride(toDateKey, {
        type: 'peptide',
        protocolId: task.protocolId,
        peptideId: task.peptideId,
        name: task.name,
        slot,
        dose: task.dose,
        unit: task.unit,
        deliveryMethod: task.deliveryMethod,
        penColor: task.penColor,
        penType: task.penType,
        fromDateKey,
      });
    } else {
      setSkipOverride(fromDateKey, {
        type: 'supplement',
        name: task.name,
        slot,
        reason: 'rescheduled',
        toDateKey,
        toSlot: slot,
      });
      setExtraOverride(toDateKey, {
        type: 'supplement',
        name: task.name,
        slot,
        dose: task.dose,
        unit: task.unit,
        delivery: task.delivery || task.deliveryMethod,
        fromDateKey,
      });
    }
    setCalendarBump(Date.now());
  }, []);

  const handleCalendarClearCatchUp = React.useCallback((task, viewDateKey) => {
    const dateKey = viewDateKey || toKey(new Date());
    const slot = task.time;
    if (task.type === 'peptide') {
      clearExtraOverride(dateKey, {
        type: 'peptide',
        protocolId: task.protocolId,
        peptideId: task.peptideId,
        name: task.name,
        slot,
        fromDateKey: task._fromDateKey,
        id: task._extraId,
      });
    } else {
      clearExtraOverride(dateKey, {
        type: 'supplement',
        name: task.name,
        slot,
        fromDateKey: task._fromDateKey,
        id: task._extraId,
      });
    }
    setCalendarBump(Date.now());
  }, []);

  // Handle marking all tasks as done for a time slot in week view
  const handleMarkAllDone = React.useCallback((date, timeSlot, scheduled) => {
    const dateKey = toKey(date);
    const slotKey = timeSlot === 'AM' ? 'AM' : 'PM';
    const taskIds = [];

    // Collect all task IDs for this slot (exclude skipped — they are not completable)
    if (scheduled.peptides) {
      scheduled.peptides.forEach(peptide => {
        if (peptide._skipped || peptide._rescheduled) return;
        const task = {
          type: 'peptide',
          name: peptide.name,
          dose: peptide.dose || '',
          unit: peptide.unit || '',
          time: slotKey,
          protocolId: peptide.protocolId,
          peptideId: peptide.peptideId,
          _extraSlot: peptide._extraSlot,
          _fromDateKey: peptide._fromDateKey,
          _extraId: peptide._extraId,
        };
        taskIds.push(generateTaskId(task));
      });
    }

    if (scheduled.supplements) {
      scheduled.supplements.forEach(supplement => {
        const suppData = typeof supplement === 'object' ? supplement : { name: supplement };
        if (suppData._skipped || suppData._rescheduled) return;
        const task = {
          type: 'supplement',
          name: suppData.name,
          dose: suppData.dose || '',
          unit: '',
          time: slotKey,
          _extraSlot: suppData._extraSlot,
          _fromDateKey: suppData._fromDateKey,
          _extraId: suppData._extraId,
        };
        taskIds.push(generateTaskId(task));
      });
    }

    // Check for injection tasks
    const injectionTasks = [];
    
    if (scheduled.peptides) {
      scheduled.peptides.forEach(peptide => {
        if (peptide._skipped || peptide._rescheduled) return;
        const deliveryMethod = peptide.deliveryMethod || peptide.delivery;
        const isInjection = deliveryMethod === 'syringe' || deliveryMethod === 'pipette' || deliveryMethod === 'pen' || deliveryMethod === 'injection';
        if (isInjection) {
          injectionTasks.push({ ...peptide, time: slotKey, type: 'peptide' });
        }
      });
    }
    
    if (scheduled.supplements) {
      scheduled.supplements.forEach(supplement => {
        const suppData = typeof supplement === 'object' ? supplement : { name: supplement };
        if (suppData._skipped || suppData._rescheduled) return;
        const deliveryMethod = suppData.deliveryMethod || suppData.delivery;
        const isInjection = deliveryMethod === 'syringe' || deliveryMethod === 'pipette' || deliveryMethod === 'pen' || deliveryMethod === 'injection';
        if (isInjection) {
          injectionTasks.push({ ...suppData, time: slotKey, type: 'supplement' });
        }
      });
    }

    // If there are injection tasks and tracking is enabled, show injection site selector for each one
    if (injectionTasks.length > 0 && isInjectionSiteTrackingEnabled()) {
      // Store context for completing all tasks after injection flow
      setPendingMarkAllContext({ date, timeSlot, slotKey, allTaskIds: taskIds });
      setPendingInjectionTasks(injectionTasks);
      setInjectionTask(injectionTasks[0]); // Start with first injection task
      return; // Don't complete tasks yet, wait for injection site selection
    }

    // Mark all tasks as completed (no injection tasks or tracking disabled)
    taskIds.forEach(taskId => {
      toggleTaskCompletion(taskId, true, dateKey, slotKey);
    });

    // CRITICAL: Update protection timestamp to prevent listener from overwriting
    try {
      const now = Date.now();
      localStorage.setItem('tpprover_protocols_lastUpdate', String(now));
    } catch (e) {
      console.warn('⚠️ Failed to save task toggle protection timestamp:', e);
    }

    // Refresh calendar data
    setDone(getCalendarDone());
    setCalendarBump(Date.now());
  }, []);

  // Handle injection site confirmation for week view mark all done
  const handleInjectionConfirm = React.useCallback((injectionSite) => {
    if (injectionSite && injectionSite.trim()) {
      // Injection site recorded (handled by InjectionSiteSelector)
    }
    
    // Complete the current injection task
    if (injectionTask && pendingMarkAllContext) {
      const { date, slotKey } = pendingMarkAllContext;
      const dateKey = toKey(date);
      
      // Build proper task object for taskId generation (MUST include protocolId/peptideId for correct matching)
      const task = {
        type: injectionTask.type || (injectionTask.deliveryMethod ? 'peptide' : 'supplement'),
        name: injectionTask.name,
        dose: injectionTask.dose || '',
        unit: injectionTask.unit || '',
        time: slotKey,
        protocolId: injectionTask.protocolId,
        peptideId: injectionTask.peptideId
      };
      
      const taskId = generateTaskId(task);
      
      // Mark this injection task as completed
      toggleTaskCompletion(taskId, true, dateKey, slotKey);
      
      // CRITICAL: Update protection timestamp
      try {
        const now = Date.now();
        localStorage.setItem('tpprover_protocols_lastUpdate', String(now));
      } catch (e) {
        console.warn('⚠️ Failed to save task toggle protection timestamp:', e);
      }
    }
    
    // Move to next injection task or finish
    if (Array.isArray(pendingInjectionTasks) && pendingInjectionTasks.length > 1) {
      const remainingTasks = pendingInjectionTasks.slice(1);
      setPendingInjectionTasks(remainingTasks);
      setInjectionTask(remainingTasks[0]);
    } else {
      // All injection tasks completed - now complete ALL remaining tasks
      const context = pendingMarkAllContext;
      if (context) {
        const dateKey = toKey(context.date);
        
        // Complete all tasks (both injection and non-injection)
        context.allTaskIds.forEach(taskId => {
          // Check if already completed (injection tasks were already done)
          const isCompleted = isTaskCompleted(taskId, dateKey, context.slotKey);
          if (!isCompleted) {
            toggleTaskCompletion(taskId, true, dateKey, context.slotKey);
          }
        });
        
        // CRITICAL: Update protection timestamp
        try {
          const now = Date.now();
          localStorage.setItem('tpprover_protocols_lastUpdate', String(now));
        } catch (e) {
          console.warn('⚠️ Failed to save task toggle protection timestamp:', e);
        }
        
        setPendingMarkAllContext(null);
      }
      
      // Clean up injection state
      setInjectionTask(null);
      setPendingInjectionTasks([]);
      
      // Refresh calendar data
      setDone(getCalendarDone());
      setCalendarBump(Date.now());
    }
  }, [injectionTask, pendingInjectionTasks, pendingMarkAllContext]);

  // Handle injection site cancellation for week view
  const handleInjectionCancel = React.useCallback(() => {
    // Cancel doesn't complete tasks - just clear the injection flow
    setInjectionTask(null);
    setPendingInjectionTasks([]);
    setPendingMarkAllContext(null);
  }, []);


  // Listen for task completion changes from other views
  useEffect(() => {
    const handleTaskCompletionChange = (event) => {
      const { taskId, completed, date, timeSlot } = event.detail;
      
      // Refresh calendar data to reflect changes from other views
      setDone(getCalendarDone());
      setCalendarBump(Date.now());
    };

    // Event listeners are handled in the earlier useEffect
  }, []);

  // Expose refresh function globally for debugging
  useEffect(() => {
    window.refreshCalendar = loadData;
    window.debugSupplements = () => {
      const supps = JSON.parse(localStorage.getItem('tpprover_supplements') || '[]');
      return { localStorage: supps, state: supplements, scheduled: Object.keys(scheduled || {}).length };
    };
    return () => { 
      delete window.refreshCalendar; 
      delete window.debugSupplements;
    };
  }, [supplements, scheduled]);

  // Listen for calendar bump events from other components
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'tpprover_calendar_bump') {
        setCalendarBump(Date.now());
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);


  // Calendar notes now synced via context/Firebase (no localStorage needed)
  useEffect(() => { try { localStorage.setItem('tpprover_calendar_done', JSON.stringify(done)) } catch {} }, [done])
  // seed buys from dashboard-like state (dummy). Integration will come later.
  // scheduled example usage: setScheduled(prev => ({ ...prev, [someKey]: { ...(prev[someKey]||{}), buys: 2 } }))

  // Auto indicators based on Supplements (Research) and Protocols (placeholder for now)
  // Read supplements saved in local storage by Research page (if any)
  

  const toggleSlot = (dateObj, slot) => {
    const key = toKey(dateObj)
    const times = scheduled[key]?.times || {}
    const max = times[slot] || 0
    if (max === 0) return
    setDone(prev => {
      const current = prev[key]?.[slot] || 0
      const nextVal = current + 1 > max ? 0 : current + 1
      return { ...prev, [key]: { ...(prev[key] || {}), [slot]: nextVal } }
    })
  }

  const weekStart = useMemo(() => {
    // Get week starts on setting
    const weekStartsOn = (() => {
      try {
        const settings = JSON.parse(localStorage.getItem('tpprover_settings') || '{}');
        return settings.region?.weekStartsOn || 'monday';
      } catch {
        return 'monday';
      }
    })();
    
    const d = new Date(currentDate);
    const day = d.getDay(); // 0=Sun..6=Sat
    
    if (weekStartsOn === 'sunday') {
      // Sunday is day 0, subtract to get to this Sunday
      d.setDate(d.getDate() - day);
    } else {
      // Monday is day 1, iso = (day + 6) % 7 converts 0=Sun..6=Sat to 0=Mon..6=Sun
      const iso = (day + 6) % 7; // 0=Mon..6=Sun
      d.setDate(d.getDate() - iso);
    }
    
    return d;
  }, [currentDate])

  const handleSaveDay = (text) => {
    if (!activeDay) return
    const key = toKey(activeDay);
    // Use updateCalendarNote from context which now handles ID-based structure
    updateCalendarNote(key, text);
    setActiveDay(null)
  }

  const handleSaveNotes = (text) => {
      if (isReadOnly) {
        setShowUpgradeModal(true);
        return;
      }
      if (!editingNotesFor) return;
      const key = toKey(editingNotesFor);
      // Use updateCalendarNote from context which now handles ID-based structure
      updateCalendarNote(key, text);
  }

  const handlePrev = () => {
    if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
    } else {
      // Navigate to same day in previous month (or last day if that day doesn't exist)
      const prevMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, currentDate.getDate());
      setCurrentDate(prevMonth);
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
    } else {
      // Navigate to same day in next month (or last day if that day doesn't exist)
      const nextMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, currentDate.getDate());
      setCurrentDate(nextMonth);
    }
  };

  // Safety check - don't render if theme is not available (after all hooks)
  if (!theme) {
    return null;
  }

  // Swipe gesture handlers for calendar navigation
  const swipeHandlers = useHorizontalSwipe({
    onSwipeLeft: handleNext,
    onSwipeRight: handlePrev,
    minSwipeDistance: 60,
    maxSwipeTime: 400
  });

  return (
    <section className="flex flex-col flex-1 min-h-0 w-full px-1.5 sm:px-2 md:px-3 lg:px-4" style={{ overflow: 'hidden', background: 'transparent' }}>
      <CalendarHeader
        currentDate={currentDate}
        weekStart={weekStart}
        onPrev={handlePrev}
        onNext={handleNext}
        onToday={() => {
          setCurrentDate(new Date());
          setTodayPulse(true);
          // Reset pulse after animation
          setTimeout(() => setTodayPulse(false), 2000);
        }}
        viewMode={viewMode}
        onChangeView={setViewMode}
        onShowIconKey={() => setShowIconKey(true)}
        theme={theme}
      />
      {viewMode === 'month' ? (
        <div 
          className="content-section rounded-xl sm:rounded-xl p-0 sm:p-4 flex-1 overflow-hidden min-h-0" 
          style={{ 
            border: `1px solid ${theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` 
          }}
          {...swipeHandlers}
        >
          <MonthGrid
            date={currentDate}
            entries={calendarNotes}
            scheduled={scheduled}
            theme={theme}
            calendarBump={calendarBump}
            todayPulse={todayPulse}
            onDayClick={(d) => {
              if (!d) return
              setDayModalDate(d)
            }}
          />
        </div>
      ) : (
        <div 
          className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 px-2 sm:px-3 py-2 scrollbar-hide"
          {...swipeHandlers}
        >
          <WeekView 
            startDate={weekStart} 
            entries={calendarNotes} 
            scheduled={scheduled} 
            theme={theme} 
            calendarBump={calendarBump}
            onDayClick={(date) => {
              const dayKey = toKey(date);
              const dayScheduled = scheduled[dayKey];
              const hasSlots = dayScheduled && dayScheduled.bySlot && Object.keys(dayScheduled.bySlot).length > 0;
              const hasOneOffs = dayScheduled && Array.isArray(dayScheduled.oneOffs) && dayScheduled.oneOffs.length > 0;
              if (hasSlots || hasOneOffs) {
                setQuickEditDate(dayKey);
                setQuickEditData(dayScheduled);
              } else {
                setActiveDay(date);
              }
            }} 
            onNotesClick={setEditingNotesFor}
            onTaskToggle={handleTaskToggle}
            onMarkAllDone={handleMarkAllDone}
            onSlotMove={handleCalendarSlotMove}
            onSkipDose={handleCalendarSkipDose}
            onUndoSkip={handleCalendarUndoSkip}
            onRescheduleToDate={handleCalendarRescheduleToDate}
            onClearCatchUp={handleCalendarClearCatchUp}
          />
        </div>
      )}

      <NotesModal
          open={!!editingNotesFor}
          onClose={() => setEditingNotesFor(null)}
          theme={theme}
          notes={editingNotesFor ? getCalendarNoteText(calendarNotes, toKey(editingNotesFor)) : ''}
          onSave={handleSaveNotes}
      />

      {/* Calendar Quick Edit Modal */}
      {quickEditDate && quickEditData && (
        <CalendarQuickEdit
          date={quickEditDate}
          scheduledData={quickEditData}
          theme={theme}
          onClose={() => {
            setQuickEditDate(null);
            setQuickEditData(null);
          }}
          onTasksUpdated={() => {
            // Refresh calendar data when tasks are updated
            setDone(getCalendarDone());
            setCalendarBump(Date.now());
          }}
          onLogOneOff={() => {
            setLogOneOffDateKey(quickEditDate);
            setShowLogOneOffDose(true);
          }}
        />
      )}

      <LogOneOffDoseModal
        open={showLogOneOffDose}
        onClose={() => {
          setShowLogOneOffDose(false);
          setCalendarBump(Date.now());
        }}
        theme={theme}
        defaultDateKey={logOneOffDateKey}
      />
      
      <CalendarIconKey 
        theme={theme}
        isVisible={showIconKey}
        onClose={() => setShowIconKey(false)}
      />

      {/* Day Modal for monthly view */}
      {dayModalDate && (
        <DayModal
          date={dayModalDate}
          entries={calendarNotes}
          scheduled={scheduled}
          theme={theme}
          onClose={() => setDayModalDate(null)}
          onNotesClick={setEditingNotesFor}
          onTaskToggle={handleTaskToggle}
          onMarkAllDone={handleMarkAllDone}
          calendarBump={calendarBump}
          onSlotMove={handleCalendarSlotMove}
          onSkipDose={handleCalendarSkipDose}
          onLogOneOff={() => {
            setLogOneOffDateKey(toKey(dayModalDate));
            setShowLogOneOffDose(true);
          }}
          onUndoSkip={handleCalendarUndoSkip}
          onRescheduleToDate={handleCalendarRescheduleToDate}
          onClearCatchUp={handleCalendarClearCatchUp}
        />
      )}

      {/* Injection Site Selector for week view mark all done */}
      <InjectionSiteSelector
        taskName={injectionTask?.name}
        task={injectionTask}
        onConfirm={handleInjectionConfirm}
        onCancel={handleInjectionCancel}
        theme={theme}
        isVisible={!!injectionTask}
      />

      <UpgradeModal 
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}

        theme={theme}
      />
    </section>
  )
}


