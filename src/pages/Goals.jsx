import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { X } from 'lucide-react'
import { useSyncedGoals } from '../utils/hooks'
import GoalModal from '../components/research/GoalModal'
import GoalCard from '../components/research/GoalCard'
import GoalConfettiHost, { fireGoalConfetti } from '../components/research/GoalConfetti'
import { prepareItemForSave } from '../utils/userDataSave'
import { recordDeletion } from '../utils/deletionTracking'
import useSpotlightTransition from '../hooks/useSpotlightTransition'
import {
  CaretDown,
  CaretUp,
  Plus,
  Target,
  ArrowRight,
  Play,
  Scales,
  Percent,
  Fire,
  Drop,
  ShieldCheck,
  Pill,
  Flask,
  CurrencyDollar,
  Package,
  TestTube,
  PencilSimpleLine,
  RadioButton,
  Lightbulb,
  CheckCircle,
} from '@phosphor-icons/react'
import { useTierAccess, useSubscriptionAccess } from '../utils/useSubscriptionAccess'
import UpgradeModal from '../components/common/UpgradeModal'
import { useAppContext } from '../context/AppContext'
import { getTaskCompletion } from '../utils/taskCompletion'
import { getProtocolHistory } from '../utils/protocolHistory'
import { getLabResults, getMarkerSeries, LAB_RESULTS_EVENT } from '../utils/labResults'
import { buildGoalLiveSnapshot, getLinkedGoalProgress, isLinkedGoalMet } from '../utils/goalProgress'
import { getRotatingSuggestedGoalTemplates } from '../data/commonGoalTemplates'
import { dispatchGoalCompleteCelebration } from '../utils/goalCelebrationMeta'
import { normalizeMetricRow, metricDateKey } from '../utils/metricsDisplay'

/** One-time eye-catcher on Suggested Auto Track Goals grid */
const SUGGESTED_GOALS_SPOTLIGHT_KEY = 'tpp_suggested_goals_spotlight_done_v1'

function isSuggestedGoalsSpotlightDone() {
  try {
    return localStorage.getItem(SUGGESTED_GOALS_SPOTLIGHT_KEY) === '1'
  } catch {
    return true
  }
}

function markSuggestedGoalsSpotlightDone() {
  try {
    localStorage.setItem(SUGGESTED_GOALS_SPOTLIGHT_KEY, '1')
  } catch {
    /* ignore */
  }
}
const TEMPLATE_ICONS = {
  manual: PencilSimpleLine,
  weight: Scales,
  bodyfat: Percent,
  streak: Fire,
  hydration: Drop,
  compliance: ShieldCheck,
  doses: Pill,
  protocols: Flask,
  budget: CurrencyDollar,
  stock: Package,
  lab: TestTube,
}

function ProgressRing({ pct, theme, size = 52 }) {
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c - (Math.min(100, Math.max(0, pct)) / 100) * c
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="block -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.isDark ? `${theme.primary}22` : `${theme.primary}18`}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={theme.primary}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[11px] font-bold tabular-nums" style={{ color: theme.text }}>{pct}%</span>
      </div>
    </div>
  )
}

function SectionHeader({ icon: Icon, label, count, theme, collapsible = false, open = true, onToggle }) {
  const Wrapper = collapsible ? 'button' : 'div'
  const title = typeof count === 'number' ? `${label} (${count})` : label
  return (
    <Wrapper
      type={collapsible ? 'button' : undefined}
      onClick={collapsible ? onToggle : undefined}
      className={`flex items-center gap-2 mb-2.5 px-1 w-full min-w-0 ${collapsible ? 'cursor-pointer' : ''}`}
    >
      {Icon ? (
        <Icon size={14} weight="duotone" className="opacity-40 shrink-0" style={{ color: theme.text }} />
      ) : null}
      <h2
        className="text-xs font-semibold uppercase tracking-wider opacity-40 shrink-0"
        style={{ color: theme.text }}
      >
        {title}
      </h2>
      <div
        className="flex-1 h-px min-w-0"
        style={{
          background: `linear-gradient(to right, ${theme.primary}55 0%, ${theme.primary}22 45%, transparent 100%)`,
        }}
      />
      {collapsible && (
        open
          ? <CaretUp size={14} weight="bold" className="opacity-40 shrink-0" style={{ color: theme.text }} />
          : <CaretDown size={14} weight="bold" className="opacity-40 shrink-0" style={{ color: theme.text }} />
      )}
    </Wrapper>
  )
}

function resolveLinkedStartValue(form, metrics) {
  if (!form.linkedType) return null
  if (form.linkedType === 'weight' || form.linkedType === 'bodyfat') {
    const field = form.linkedType === 'weight' ? 'weight' : 'bodyfat'
    const rows = Array.isArray(metrics) ? [...metrics] : []
    rows.sort((a, b) => {
      const da = metricDateKey(a) || ''
      const db = metricDateKey(b) || ''
      if (da !== db) return db.localeCompare(da)
      return new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0)
    })
    for (const row of rows) {
      const n = normalizeMetricRow(row)
      if (n[field] != null) return n[field]
    }
  }
  if (form.linkedType === 'labMarker' && form.linkedMarkerKey) {
    const series = getMarkerSeries(getLabResults(), {
      markerKey: form.linkedMarkerKey,
      markerName: form.linkedMarkerName,
    })
    return series.length ? series[series.length - 1].value : null
  }
  return null
}

export default function Goals() {
  const { theme } = useOutletContext()
  const {
    metrics = [],
    protocols = [],
    supplements = [],
    reconItems = [],
    orders = [],
    stockpile = [],
  } = useAppContext()
  const [goals = [], setGoals] = useSyncedGoals()
  const [showGoal, setShowGoal] = useState(false)
  const [editingGoal, setEditingGoal] = useState(null)
  const [templatePrefill, setTemplatePrefill] = useState(null)
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [swapTarget, setSwapTarget] = useState(null)
  const [completedOpen, setCompletedOpen] = useState(null)
  const [liveTick, setLiveTick] = useState(0)
  const [showSuggestedSpotlight, setShowSuggestedSpotlight] = useState(false)
  const [suggestedSpotlightAnchor, setSuggestedSpotlightAnchor] = useState(null)
  const suggestedGridRef = useRef(null)
  const suggestedTipRef = useRef(null)

  const dismissSuggestedSpotlight = useCallback(() => {
    markSuggestedGoalsSpotlightDone()
    setShowSuggestedSpotlight(false)
  }, [])

  const suggestedTx = useSpotlightTransition(showSuggestedSpotlight)
  const latchedSuggestedAnchor = useRef(null)
  if (suggestedSpotlightAnchor) latchedSuggestedAnchor.current = suggestedSpotlightAnchor
  const suggestedPortalAnchor =
    suggestedSpotlightAnchor || (suggestedTx.mounted ? latchedSuggestedAnchor.current : null)

  useEffect(() => {
    if (!suggestedTx.mounted) setSuggestedSpotlightAnchor(null)
  }, [suggestedTx.mounted])

  const { caps } = useTierAccess()
  const { isDowngraded } = useSubscriptionAccess()
  const prevIsDowngradedRef = useRef(null)
  const autoCompletedRef = useRef(new Set())

  const snapshot = useMemo(() => {
    try {
      return buildGoalLiveSnapshot({
        metrics: metrics || [],
        protocols: protocols || [],
        supplements: supplements || [],
        reconItems: reconItems || [],
        orders: orders || [],
        stockpile: stockpile || [],
        taskCompletion: getTaskCompletion(),
        protocolHistory: getProtocolHistory(),
        labResults: getLabResults(),
      })
    } catch (error) {
      console.error('Error building goal snapshot:', error)
      return {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metrics, protocols, supplements, reconItems, orders, stockpile, liveTick])

  useEffect(() => {
    const bump = () => setLiveTick((t) => t + 1)
    window.addEventListener('tpp:task-streak-updated', bump)
    window.addEventListener('tpp:hydration-streak-updated', bump)
    window.addEventListener('tpp:hydration-goal-complete', bump)
    window.addEventListener(LAB_RESULTS_EVENT, bump)
    window.addEventListener('tpp:cloud-data-loaded', bump)
    return () => {
      window.removeEventListener('tpp:task-streak-updated', bump)
      window.removeEventListener('tpp:hydration-streak-updated', bump)
      window.removeEventListener('tpp:hydration-goal-complete', bump)
      window.removeEventListener(LAB_RESULTS_EVENT, bump)
      window.removeEventListener('tpp:cloud-data-loaded', bump)
    }
  }, [])

  const organized = useMemo(() => {
    const safeGoals = Array.isArray(goals) ? goals : []
    const active = safeGoals.filter(g => g && !g.completed && !g.heldByFreePlan && !g.deleted)
    const held = safeGoals.filter(g => g && !g.completed && g.heldByFreePlan && !g.deleted)
    const completed = safeGoals.filter(g => g && g.completed && !g.deleted)
    return { active, held, completed }
  }, [goals])

  const slotOpen = caps.enforced && organized.active.length === 0 && organized.held.length > 0
  const showCompleted = completedOpen === null
    ? organized.active.length === 0 && organized.held.length === 0
    : completedOpen

  // Auto-hold excess goals on downgrade
  useEffect(() => {
    if (!caps.enforced) return
    if (organized.active.length <= 1) return
    const [, ...rest] = organized.active
    if (rest.length === 0) return
    setGoals(prev => prev.map(g => {
      if (rest.find(r => r.id === g.id)) {
        return { ...g, heldByFreePlan: true, heldAt: new Date().toISOString() }
      }
      return g
    }))
  }, [caps.enforced, organized.active.length]) // eslint-disable-line

  // Clear held flags on resubscription
  useEffect(() => {
    if (prevIsDowngradedRef.current === true && !isDowngraded) {
      setGoals(prev => prev.map(g => g.heldByFreePlan ? { ...g, heldByFreePlan: false } : g))
    }
    prevIsDowngradedRef.current = isDowngraded
  }, [isDowngraded]) // eslint-disable-line

  // Auto-complete linked goals when target is met
  useEffect(() => {
    // Allow re-check if user later marks incomplete via edit
    goals.forEach((g) => {
      if (g.linkedType && !g.completed && !g.deleted) {
        /* keep in set only after we complete */
      }
      if (g.linkedType && !g.completed) autoCompletedRef.current.delete(g.id)
    })

    const toComplete = organized.active.filter((g) => {
      if (!g.linkedType || g.completed) return false
      if (autoCompletedRef.current.has(g.id)) return false
      return isLinkedGoalMet(g, snapshot)
    })
    if (toComplete.length === 0) return

    toComplete.forEach((g) => autoCompletedRef.current.add(g.id))
    setGoals((prev) => prev.map((g) => {
      if (toComplete.find((t) => t.id === g.id)) {
        return prepareItemForSave({ ...g, completed: true })
      }
      return g
    }))

    // Celebration modal: hydration keeps its specialized popup; all others use GoalCelebration.
    // Detail includes the user's linkedTarget so copy reflects the goal they set.
    toComplete.forEach((g) => {
      dispatchGoalCompleteCelebration(g)
    })

    const x = typeof window !== 'undefined' ? window.innerWidth / 2 : 0
    const y = typeof window !== 'undefined' ? window.innerHeight * 0.35 : 0
    fireGoalConfetti(x, y, theme)
  }, [snapshot, organized.active, goals, setGoals, theme])

  const handleAdd = useCallback(() => {
    if (caps.enforced && caps.maxGoals !== null && organized.active.length >= caps.maxGoals) {
      setShowUpgrade(true)
      return
    }
    setEditingGoal(null)
    setTemplatePrefill(null)
    setShowGoal(true)
  }, [caps, organized.active.length])

  const handleAddFromTemplate = useCallback((template) => {
    if (caps.enforced && caps.maxGoals !== null && organized.active.length >= caps.maxGoals) {
      setShowUpgrade(true)
      return
    }
    setEditingGoal(null)
    setTemplatePrefill(template)
    setShowGoal(true)
  }, [caps, organized.active.length])

  const handleEdit = useCallback((g) => {
    if (caps.enforced && g.heldByFreePlan) return
    setTemplatePrefill(null)
    setEditingGoal(g)
    setShowGoal(true)
  }, [caps])

  const handleToggleComplete = useCallback((g, e) => {
    const nextCompleted = !g.completed
    if (nextCompleted && e?.currentTarget) {
      const rect = e.currentTarget.getBoundingClientRect()
      fireGoalConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2, theme)
      dispatchGoalCompleteCelebration(g)
    }
    setGoals(prev => prev.map(x =>
      x.id === g.id ? prepareItemForSave({ ...x, completed: nextCompleted }) : x
    ))
  }, [setGoals, theme])

  const handleSwap = useCallback((heldGoal, action) => {
    if (action === 'resume') {
      setGoals(prev => prev.map(g => g.id === heldGoal.id ? { ...g, heldByFreePlan: false } : g))
      return
    }
    setSwapTarget(heldGoal)
  }, []) // eslint-disable-line

  const confirmSwap = useCallback(() => {
    if (!swapTarget) return
    setGoals(prev => prev.map(g => {
      if (!g.completed && !g.heldByFreePlan && !g.deleted) {
        return { ...g, heldByFreePlan: true, heldAt: new Date().toISOString() }
      }
      if (g.id === swapTarget.id) {
        return { ...g, heldByFreePlan: false }
      }
      return g
    }))
    setSwapTarget(null)
  }, [swapTarget]) // eslint-disable-line

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('tpp:set-topbar-tabs', {
      detail: {
        tabs: [{ value: 'goals', label: 'Goals' }],
        activeTab: 'goals',
        onTabChange: () => {},
        onActionClick: handleAdd,
        actionDisabled: false,
      }
    }))
    return () => {
      window.dispatchEvent(new CustomEvent('tpp:clear-topbar-tabs'))
    }
  }, [handleAdd])

  const safeGoals = Array.isArray(goals) ? goals : []
  const allVisible = safeGoals.filter(g => g && !g.deleted)
  const completedCount = allVisible.filter(g => g && g.completed).length
  const total = allVisible.length || 1
  const pct = allVisible.length === 0 ? 0 : Math.round((completedCount / total) * 100)
  const hasAny = allVisible.length > 0
  const usedLinkedTypes = new Set(
    [...organized.active, ...organized.held].map((g) => g.linkedType).filter(Boolean)
  )
  const emptyTemplates = useMemo(
    () => getRotatingSuggestedGoalTemplates({ limit: 3, periodDays: 3, usedLinkedTypes }),
    // usedLinkedTypes is a Set rebuilt each render — key off its contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [[...usedLinkedTypes].sort().join('|')]
  )

  const showSuggestedSection =
    emptyTemplates.length > 0 &&
    (!caps.enforced || caps.maxGoals === null || organized.active.length < caps.maxGoals)

  useEffect(() => {
    if (!showSuggestedSection || !hasAny) {
      setShowSuggestedSpotlight(false)
      return undefined
    }
    if (isSuggestedGoalsSpotlightDone()) return undefined
    const t = setTimeout(() => setShowSuggestedSpotlight(true), 800)
    return () => clearTimeout(t)
  }, [showSuggestedSection, hasAny])

  useEffect(() => {
    const onPreview = () => {
      try {
        localStorage.removeItem(SUGGESTED_GOALS_SPOTLIGHT_KEY)
      } catch {
        /* ignore */
      }
      if (showSuggestedSection && hasAny) setShowSuggestedSpotlight(true)
    }
    window.addEventListener('tpp:dev-preview-suggested-goals-spotlight', onPreview)
    return () => window.removeEventListener('tpp:dev-preview-suggested-goals-spotlight', onPreview)
  }, [showSuggestedSection, hasAny])

  useEffect(() => {
    if (!showSuggestedSpotlight) {
      return undefined
    }
    const measure = () => {
      const el = suggestedGridRef.current
      if (!el) {
        setSuggestedSpotlightAnchor(null)
        return
      }
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) {
        setSuggestedSpotlightAnchor(null)
        return
      }
      setSuggestedSpotlightAnchor({
        top: r.top,
        bottom: r.bottom,
        left: r.left,
        right: r.right,
        width: r.width,
        height: r.height,
      })
    }
    measure()
    const t = setTimeout(measure, 80)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      clearTimeout(t)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [showSuggestedSpotlight, emptyTemplates])

  useEffect(() => {
    if (!showSuggestedSpotlight) return undefined
    const onPointerDown = (e) => {
      const tip = suggestedTipRef.current
      const grid = suggestedGridRef.current
      const target = e.target
      if (tip && tip.contains(target)) return
      if (grid && (grid === target || grid.contains(target))) return
      dismissSuggestedSpotlight()
    }
    const attach = setTimeout(() => {
      document.addEventListener('pointerdown', onPointerDown, true)
    }, 50)
    return () => {
      clearTimeout(attach)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  }, [showSuggestedSpotlight, dismissSuggestedSpotlight])

  const handleAddFromTemplateSpotlight = useCallback((template) => {
    if (showSuggestedSpotlight) dismissSuggestedSpotlight()
    handleAddFromTemplate(template)
  }, [showSuggestedSpotlight, dismissSuggestedSpotlight, handleAddFromTemplate])

  return (
    <section className="page-bg px-2 sm:px-4 py-4 space-y-4">
      <GoalConfettiHost />

      {/* Free-plan slot banner */}
      {caps.enforced && caps.maxGoals !== null && (
        <div
          className="rounded-2xl px-4 py-3.5"
          style={{
            backgroundColor: theme.isDark ? `${theme.primary}10` : theme.cardBackground,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.isDark ? `0 2px 8px ${theme.primary}12` : `0 2px 10px ${theme.primary}10`,
          }}
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <Lock size={12} weight="bold" style={{ color: theme.textLight }} />
                <p className="text-sm font-semibold" style={{ color: theme.text }}>
                  {organized.active.length} / {caps.maxGoals} active goal slot used
                </p>
              </div>
              <p className="text-xs" style={{ color: theme.textLight }}>
                {organized.held.length > 0
                  ? `${organized.held.length} goal${organized.held.length > 1 ? 's' : ''} held — your data is always yours`
                  : 'Complete your active goal to open a new slot'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowUpgrade(true)}
              className="shrink-0 text-xs font-semibold inline-flex items-center gap-1 px-3 py-1.5 rounded-xl transition-all hover:opacity-80"
              style={{ backgroundColor: `${theme.primary}15`, color: theme.primary }}
            >
              Upgrade
              <ArrowRight size={11} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {slotOpen && (
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3"
          style={{ backgroundColor: `${theme.primary}12`, border: `1px solid ${theme.primary}30` }}
        >
          <Play size={14} weight="fill" style={{ color: theme.primary, flexShrink: 0 }} />
          <p className="text-sm flex-1" style={{ color: theme.text }}>
            <span className="font-semibold">Goal slot is open</span> — tap a held goal below to resume it.
          </p>
        </div>
      )}

      {caps.enforced && organized.held.length > 0 && !slotOpen && (
        <div className="flex items-center gap-2 flex-wrap px-0.5">
          <Lock size={12} weight="bold" style={{ color: theme.textLight }} />
          <p className="text-xs" style={{ color: theme.textLight }}>
            <span className="font-semibold">{organized.held.length} goal{organized.held.length > 1 ? 's' : ''} paused</span>
            {' — tap a paused goal to swap it.'}
          </p>
          <button
            type="button"
            onClick={() => setShowUpgrade(true)}
            className="ml-auto text-xs font-semibold inline-flex items-center gap-1 hover:opacity-80 transition-all"
            style={{ color: theme.primary }}
          >
            Upgrade to restore all <ArrowRight size={12} weight="bold" />
          </button>
        </div>
      )}

      {hasAny && (
        <div
          className="relative overflow-hidden rounded-[20px] p-4 md:p-5"
          style={{
            backgroundColor: theme.cardBackground,
            backgroundImage: `linear-gradient(135deg, ${theme.primary}12 0%, transparent 100%)`,
            border: `1px solid ${theme.border}`,
            boxShadow: theme.isDark ? `0 4px 16px ${theme.primary}18` : `0 4px 18px ${theme.primary}14`,
            isolation: 'isolate',
          }}
        >
          <style>{`
            @keyframes goalsHeaderShimmer {
              0%   { transform: translateX(-120%); opacity: 0; }
              12%  { opacity: 1; }
              42%  { transform: translateX(120%); opacity: 1; }
              48%  { opacity: 0; }
              100% { transform: translateX(120%); opacity: 0; }
            }
            .goals-header-shimmer {
              position: absolute;
              inset: 0;
              border-radius: inherit;
              pointer-events: none;
              background: linear-gradient(
                105deg,
                transparent 35%,
                ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.45)'} 47%,
                ${theme.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.7)'} 50%,
                ${theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.45)'} 53%,
                transparent 65%
              );
              animation: goalsHeaderShimmer 4.5s ease-in-out infinite;
            }
          `}</style>
          <div className="goals-header-shimmer" aria-hidden="true" />
          <div className="relative z-[1] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 md:gap-4">
              <div
                className="w-12 h-12 rounded-[16px] flex items-center justify-center shrink-0 shadow-sm"
                style={{
                  backgroundColor: theme.cardBackground,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <Target size={24} weight="duotone" style={{ color: theme.primary }} />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-bold tracking-tight" style={{ color: theme.text }}>
                  Your Goals
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.textLight }}>
                    {organized.active.length} Active
                  </span>
                  <span className="w-1 h-1 rounded-full opacity-30" style={{ backgroundColor: theme.textLight }} />
                  <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider" style={{ color: theme.textLight }}>
                    {completedCount} Completed
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="hidden sm:block text-right mr-1">
                <div className="text-xs font-bold" style={{ color: theme.text }}>Overall Progress</div>
                <div className="text-[10px] uppercase tracking-wide mt-0.5" style={{ color: theme.textLight }}>
                  {pct === 100 ? 'All caught up' : `${completedCount} of ${total} done`}
                </div>
              </div>
              <ProgressRing pct={pct} theme={theme} size={52} />
            </div>
          </div>
        </div>
      )}

      {/* Empty state — template grid */}
      {!hasAny ? (
        <div className="space-y-4">
          <div
            className="rounded-[24px] p-6 text-center"
            style={{
              backgroundColor: theme.cardBackground,
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              className="w-14 h-14 rounded-[20px] mx-auto mb-4 flex items-center justify-center"
              style={{
                background: `linear-gradient(135deg, ${theme.primary}20 0%, ${theme.primary}05 100%)`,
                border: `1px solid ${theme.primary}25`,
              }}
            >
              <Target size={26} weight="duotone" style={{ color: theme.primary }} />
            </div>
            <p className="text-base font-bold mb-1" style={{ color: theme.text }}>
              No goals yet
            </p>
            <p className="text-sm mb-2" style={{ color: theme.textLight }}>
              Pick a starting point — targets are always yours to set
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {emptyTemplates.map((t) => {
              const Icon = TEMPLATE_ICONS[t.id] || Target
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => handleAddFromTemplate(t)}
                  className="text-left rounded-[20px] p-4 transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{
                    backgroundColor: theme.cardBackground,
                    border: `1px solid ${theme.border}`,
                    boxShadow: theme.isDark ? `0 4px 12px ${theme.primary}12` : `0 4px 16px ${theme.primary}08`,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${theme.primary}18` }}
                    >
                      <Icon size={20} weight="duotone" style={{ color: theme.primary }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold" style={{ color: theme.text }}>{t.name}</p>
                      <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>{t.description}</p>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="w-full inline-flex items-center justify-center gap-1.5 px-6 py-3 rounded-[14px] text-sm font-bold transition-all active:scale-95"
            style={{
              backgroundColor: theme.isDark ? `${theme.primary}18` : theme.background,
              color: theme.primary,
              border: `1px solid ${theme.border}`,
            }}
          >
            <Plus size={15} weight="bold" />
            Write your own
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {(organized.active.length > 0 || organized.held.length > 0) && (
            <div>
              <SectionHeader
                icon={RadioButton}
                label="Active Goals"
                count={organized.active.length + organized.held.length}
                theme={theme}
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {organized.active.map(g => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    theme={theme}
                    onEdit={handleEdit}
                    onToggleComplete={handleToggleComplete}
                    linkedProgress={g.linkedType ? getLinkedGoalProgress(g, snapshot) : null}
                  />
                ))}
                {organized.held.map(g => (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    theme={theme}
                    held
                    slotOpen={slotOpen}
                    onEdit={handleEdit}
                    onSwap={handleSwap}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Suggested goal templates — hide types already in active/held goals */}
          {showSuggestedSection ? (
            <div>
              <SectionHeader icon={Lightbulb} label="Suggested Auto Track Goals" theme={theme} />
              <div
                ref={suggestedGridRef}
                className={`grid grid-cols-3 gap-2 relative ${showSuggestedSpotlight ? 'tpp-suggested-goals-spotlight-grid' : ''}`}
              >
                {emptyTemplates.map((t) => {
                  const Icon = TEMPLATE_ICONS[t.id] || Target
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleAddFromTemplateSpotlight(t)}
                      className="rounded-[14px] px-3 py-2.5 transition-all active:scale-[0.98] hover:-translate-y-0.5"
                      style={{
                        backgroundColor: theme.cardBackground,
                        border: `1px solid ${theme.border}`,
                        boxShadow: theme.isDark
                          ? `0 2px 8px ${theme.primary}10`
                          : `0 2px 10px ${theme.primary}08`,
                      }}
                    >
                      <div className="flex flex-col items-center gap-2 text-center">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${theme.primary}16` }}
                        >
                          <Icon size={14} weight="duotone" style={{ color: theme.primary }} />
                        </div>
                        <span className="text-xs font-semibold leading-snug" style={{ color: theme.text }}>
                          {t.name}
                        </span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}

          {organized.completed.length > 0 && (
            <div>
              <SectionHeader
                icon={CheckCircle}
                label="Completed"
                count={organized.completed.length}
                theme={theme}
                collapsible
                open={showCompleted}
                onToggle={() => setCompletedOpen(!showCompleted)}
              />
              {showCompleted && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {organized.completed.map(g => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      theme={theme}
                      completed
                      onEdit={handleEdit}
                      onToggleComplete={handleToggleComplete}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <GoalModal
        open={showGoal}
        onClose={() => {
          setShowGoal(false)
          setTemplatePrefill(null)
        }}
        theme={theme}
        goal={editingGoal}
        templatePrefill={!editingGoal ? templatePrefill : null}
        onSave={(form) => {
          const startValue = form.linkedStartValue != null
            ? form.linkedStartValue
            : (form.id ? undefined : resolveLinkedStartValue(form, metrics))

          const payload = {
            ...form,
            title: form.text || form.title,
            startDate: form.startDate,
            targetDate: form.dueDate || form.targetDate,
            category: form.category || 'General',
            linkedType: form.linkedType || null,
            linkedTarget: form.linkedType === 'lowStockCleared'
              ? 0
              : (form.linkedTarget !== '' && form.linkedTarget != null
                ? (form.linkedType === 'complianceGrade' ? form.linkedTarget : Number(form.linkedTarget))
                : null),
            linkedMarkerKey: form.linkedMarkerKey || null,
            linkedMarkerName: form.linkedMarkerName || null,
            linkedMarkerUnit: form.linkedMarkerUnit || null,
            linkedStartValue: startValue !== undefined
              ? (startValue ?? form.linkedStartValue ?? null)
              : form.linkedStartValue ?? null,
          }

          setGoals(prev => {
            if (form.id) return prev.map(g => g.id === form.id ? prepareItemForSave(payload) : g)
            return [prepareItemForSave(payload, { isNew: true }), ...prev]
          })
          setShowGoal(false)
          setEditingGoal(null)
          setTemplatePrefill(null)
        }}
        onDelete={(form) => {
          if (!form?.id) return
          const goalToDelete = goals.find(g => g.id === form.id)
          // CRITICAL: Record deletion tombstone BEFORE removing locally, otherwise the
          // next cloud merge sees a "missing" local item vs. an existing server item
          // and treats it as un-deleted, silently reviving it on sync/login.
          if (goalToDelete) {
            recordDeletion('goals', goalToDelete.id, goalToDelete)
          } else {
            recordDeletion('goals', form.id)
          }
          setGoals(prev => prev.filter(g => g.id !== form.id))
          setShowGoal(false)
          setEditingGoal(null)
          setTemplatePrefill(null)
        }}
      />

      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)} theme={theme} />

      {swapTarget && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ backgroundColor: 'rgba(0,0,0,0.60)', backdropFilter: 'blur(6px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setSwapTarget(null) }}
        >
          <div
            className="w-full max-w-sm rounded-[24px] p-6"
            style={{
              backgroundColor: theme.cardBackground || theme.card,
              border: `1px solid ${theme.border}`,
              boxShadow: `0 24px 48px ${theme.primary}28`,
            }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${theme.primary}18` }}>
                <ArrowRight size={18} weight="bold" style={{ color: theme.primary }} />
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: theme.text }}>Swap goal?</p>
                <p className="text-xs mt-0.5" style={{ color: theme.textLight }}>Your active goal will be paused</p>
              </div>
            </div>
            {organized.active[0] && (
              <div
                className="mb-3 rounded-[14px] p-3"
                style={{
                  backgroundColor: theme.isDark ? `${theme.primary}10` : theme.background,
                  border: `1px solid ${theme.border}`,
                }}
              >
                <p className="text-xs font-semibold" style={{ color: theme.textLight }}>Currently active → will pause</p>
                <p className="text-sm font-bold mt-0.5 truncate" style={{ color: theme.text }}>
                  {organized.active[0].text || organized.active[0].title}
                </p>
              </div>
            )}
            <div
              className="mb-5 rounded-[14px] p-3"
              style={{ backgroundColor: `${theme.primary}10`, border: `1px solid ${theme.primary}30` }}
            >
              <p className="text-xs font-semibold" style={{ color: theme.primary }}>Will become active</p>
              <p className="text-sm font-bold mt-0.5 truncate" style={{ color: theme.text }}>
                {swapTarget.text || swapTarget.title}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSwapTarget(null)}
                className="flex-1 py-2.5 rounded-[14px] text-sm font-semibold"
                style={{
                  backgroundColor: theme.isDark ? `${theme.primary}14` : theme.background,
                  color: theme.textLight,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSwap}
                className="flex-1 py-2.5 rounded-[14px] text-sm font-bold"
                style={{ backgroundColor: theme.primary, color: theme.textOnPrimary || '#fff' }}
              >
                Swap
              </button>
            </div>
          </div>
        </div>
      )}

      {suggestedTx.mounted && suggestedPortalAnchor && createPortal(
        (() => {
          const primary = theme?.primary || '#7F9E95'
          const tipBg = theme?.isDark ? 'rgba(20,25,33,0.98)' : '#ffffff'
          const tipText = theme?.text || '#1f2937'
          const tipBorder = theme?.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'
          const tipW = 210
          const padX = 4
          const padY = 4
          const ovalLeft = Math.max(4, suggestedPortalAnchor.left - padX)
          const ovalTop = Math.max(4, suggestedPortalAnchor.top - padY)
          const ovalW = suggestedPortalAnchor.width + padX * 2
          const ovalH = Math.max(suggestedPortalAnchor.height + padY * 2, 40)
          const tipLeft = Math.max(
            8,
            Math.min(
              suggestedPortalAnchor.left + suggestedPortalAnchor.width / 2 - tipW / 2,
              window.innerWidth - tipW - 8
            )
          )
          const tipH = 78
          const spaceAbove = suggestedPortalAnchor.top - tipH - 10
          const tipTop = spaceAbove > 8
            ? spaceAbove
            : suggestedPortalAnchor.bottom + 10
          const arrowBelow = tipTop < suggestedPortalAnchor.top
          return (
            <>
              <div
                aria-hidden
                className={`fixed z-[10050] pointer-events-none ${suggestedTx.ovalClass}`}
                style={{
                  top: ovalTop,
                  left: ovalLeft,
                  width: ovalW,
                  height: ovalH,
                }}
              >
                <div
                  className="tpp-suggested-goals-spotlight-oval w-full h-full"
                  style={{
                    borderRadius: 20,
                    boxShadow: `0 0 0 2px ${primary}`,
                  }}
                />
              </div>
              <div
                className={`fixed z-[10051] pointer-events-none ${suggestedTx.tipClass}`}
                style={{
                  top: tipTop,
                  left: tipLeft,
                  width: tipW,
                }}
                role="status"
                aria-live="polite"
              >
                <div
                  ref={suggestedTipRef}
                  className="pointer-events-auto rounded-xl shadow-2xl border px-3.5 pt-3 pb-3.5 relative text-center"
                  style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                >
                  <span
                    aria-hidden
                    className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 ${
                      arrowBelow ? '-bottom-1.5 border-r border-b' : '-top-1.5 border-l border-t'
                    }`}
                    style={{ backgroundColor: tipBg, borderColor: tipBorder }}
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      dismissSuggestedSpotlight()
                    }}
                    className="absolute top-2 right-2 p-0.5 opacity-40 hover:opacity-70 transition-opacity"
                    aria-label="Dismiss"
                  >
                    <X className="w-3.5 h-3.5" style={{ color: tipText }} />
                  </button>
                  <div className="flex flex-col items-center gap-1.5 px-1">
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.1em] px-2.5 py-1 rounded-md"
                      style={{
                        backgroundColor: theme.isDark ? 'rgba(90,110,101,0.85)' : '#4a5f56',
                        color: 'rgba(255,255,255,0.95)',
                      }}
                    >
                      New
                    </span>
                    <p className="text-sm font-semibold leading-snug" style={{ color: tipText }}>
                      Auto Track Goals
                    </p>
                  </div>
                </div>
              </div>
            </>
          )
        })(),
        document.body
      )}

      <style>{`
        @keyframes tppSuggestedGoalsOval {
          0%, 100% { transform: scale(1, 1); opacity: 0.95; }
          50% { transform: scale(1.01, 1.03); opacity: 0.4; }
        }
        .tpp-suggested-goals-spotlight-oval {
          animation: tppSuggestedGoalsOval 1.4s ease-out infinite;
          transform-origin: center center;
        }
      `}</style>
    </section>
  )
}
