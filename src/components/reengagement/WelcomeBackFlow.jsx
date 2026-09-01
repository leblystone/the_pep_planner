import React, { useState, useMemo, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, Package, Pill, CalendarClock, Target, FlaskConical } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../context/AppContext';
import { useFirebase } from '../../context/FirebaseContext';
import { useSyncedGoals } from '../../utils/hooks';
import { getMedications } from '../../utils/medications';
import {
  summarizeReengagementImpact,
  applyReengagementRefresh,
} from '../../utils/reengagementRefresh';
import { buildReengagementState } from '../../utils/reengagement';
import { formatMMDDYYYY } from '../../utils/date';
import { saveAppData } from '../../services/cloudStorage';
import { getDeletionTracking } from '../../utils/deletionTracking';

const STEPS = {
  INTRO: 'intro',
  REVIEW: 'review',
  DONE: 'done',
};

const pageTransition = {
  duration: 0.4,
  ease: [0.22, 1, 0.36, 1],
};

const pageVariants = {
  enter: (direction) => ({
    opacity: 0,
    x: direction >= 0 ? 28 : -28,
  }),
  center: { opacity: 1, x: 0 },
  exit: (direction) => ({
    opacity: 0,
    x: direction >= 0 ? -18 : 18,
  }),
};

/**
 * Full-screen welcome-back flow for users returning after 30+ days.
 * Does not delete data — ends protocols/goals as of lastGapDate and flags items for reconfirm.
 */
export default function WelcomeBackFlow({
  open,
  theme,
  userId,
  lastGapDate,
  daysAway,
  onComplete,
  onDecline,
  onDismiss,
}) {
  const {
    protocols,
    setProtocols,
    stockpile,
    setStockpile,
    supplements,
    setSupplements,
    medications,
    setMedications,
    scheduledBuys,
    setScheduledBuys,
  } = useAppContext();
  const { firebaseUser } = useFirebase();
  const [goals, setGoals] = useSyncedGoals();

  const [step, setStep] = useState(STEPS.INTRO);
  const [direction, setDirection] = useState(1);
  const [excludedProtocolIds, setExcludedProtocolIds] = useState(() => new Set());
  const [excludedGoalIds, setExcludedGoalIds] = useState(() => new Set());
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  React.useEffect(() => {
    if (open) {
      setStep(STEPS.INTRO);
      setDirection(1);
      setExcludedProtocolIds(new Set());
      setExcludedGoalIds(new Set());
      setApplying(false);
      setResult(null);
    }
  }, [open, lastGapDate]);

  const meds = medications?.length ? medications : getMedications();

  const impact = useMemo(
    () =>
      summarizeReengagementImpact({
        protocols,
        goals,
        stockpile,
        supplements,
        medications: meds,
        scheduledBuys,
      }),
    [protocols, goals, stockpile, supplements, meds, scheduledBuys]
  );

  const persistReengagement = useCallback(
    async (status) => {
      if (!userId || !lastGapDate) return;
      try {
        const { saveUserState, loadUserState } = await import('../../services/cloudStorage');
        const current = (await loadUserState(userId)) || {};
        await saveUserState(userId, {
          ...current,
          reengagement: buildReengagementState(status, lastGapDate),
        });
      } catch (e) {
        console.error('Failed to persist reengagement state', e);
      }
    },
    [userId, lastGapDate]
  );

  const goTo = (next, dir = 1) => {
    setDirection(dir);
    setStep(next);
  };

  const toggleProtocol = (id) => {
    setExcludedProtocolIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleGoal = (id) => {
    setExcludedGoalIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = async () => {
    if (applying || !lastGapDate) return;
    setApplying(true);
    try {
      const applied = applyReengagementRefresh({
        lastGapDate,
        excludedProtocolIds: [...excludedProtocolIds],
        excludedGoalIds: [...excludedGoalIds],
        protocols,
        setProtocols,
        goals,
        setGoals,
        stockpile,
        setStockpile,
        supplements,
        setSupplements,
        medications: meds,
        setMedications,
        scheduledBuys,
        setScheduledBuys,
      });

      // Force cloud sync of affected keys
      const uid = userId || firebaseUser?.uid;
      if (uid) {
        try {
          const nextProtocols = JSON.parse(localStorage.getItem('tpprover_protocols') || '[]');
          const nextStockpile = JSON.parse(localStorage.getItem('tpprover_stockpile') || '[]');
          const nextSupplements = JSON.parse(localStorage.getItem('tpprover_supplements') || '[]');
          const nextBuys = JSON.parse(localStorage.getItem('tpprover_scheduled_buys') || '[]');
          const nextGoals = JSON.parse(localStorage.getItem('tpprover_user_goals') || '[]');
          const nextMeds = JSON.parse(localStorage.getItem('tpprover_medications') || '[]');
          await saveAppData(
            uid,
            {
              protocols: nextProtocols,
              stockpile: nextStockpile,
              supplements: nextSupplements,
              scheduledBuys: nextBuys,
              userGoals: nextGoals,
              medications: nextMeds,
              protocolHistory: JSON.parse(localStorage.getItem('tpprover_protocol_history') || '[]'),
              deletionTracking: getDeletionTracking(),
            },
            { skipMerge: false }
          );
        } catch (syncErr) {
          console.warn('Reengagement cloud sync deferred:', syncErr);
        }
      }

      setResult(applied);
      await persistReengagement('completed');
      goTo(STEPS.DONE, 1);
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: {
            message: "You're refreshed — welcome back!",
            type: 'success',
          },
        })
      );
    } catch (e) {
      console.error('Reengagement refresh failed', e);
      window.dispatchEvent(
        new CustomEvent('tpp:toast', {
          detail: { message: 'Could not refresh dashboard. Please try again.', type: 'error' },
        })
      );
    } finally {
      setApplying(false);
    }
  };

  const handleRemindLater = async () => {
    await persistReengagement('pending');
    onDismiss?.();
  };

  const handleDecline = async () => {
    await persistReengagement('declined');
    onDecline?.();
  };

  const handleFinish = () => {
    onComplete?.();
  };

  if (!open) return null;

  const bg = theme?.isDark
    ? 'linear-gradient(180deg, #14191f 0%, #0e1219 100%)'
    : 'linear-gradient(180deg, #F5F3EF 0%, #E8E6E1 100%)';
  const primary = theme?.primary || '#7F9E95';
  const text = theme?.text || '#1E2B2A';
  const textLight = theme?.textLight || '#6B7280';
  const gapLabel = lastGapDate ? formatMMDDYYYY(lastGapDate) : 'your last visit';
  const daysLabel =
    typeof daysAway === 'number' && daysAway > 0 ? `${daysAway} day${daysAway === 1 ? '' : 's'}` : null;

  const protocolsToEnd = impact.activeProtocols.filter((p) => !excludedProtocolIds.has(p.id));
  const goalsToEnd = impact.activeGoals.filter((g) => !excludedGoalIds.has(g.id));

  return (
    <div
      className="fixed inset-0 z-[10020] overflow-hidden"
      style={{
        background: bg,
        paddingTop: 'max(1rem, var(--safe-area-top, 0px))',
        paddingBottom: 'max(1rem, var(--safe-area-bottom, 0px))',
      }}
    >
      <AnimatePresence mode="wait" custom={direction}>
        {step === STEPS.INTRO && (
          <motion.div
            key="intro"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0 flex flex-col px-6 py-8 overflow-y-auto"
          >
            <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
              <p
                className="text-xs font-semibold uppercase tracking-[0.2em] mb-3"
                style={{ color: primary }}
              >
                Welcome back
              </p>
              <h1
                className="text-3xl font-bold leading-tight mb-3"
                style={{ color: text, fontFamily: 'Poppins, sans-serif' }}
              >
                It&apos;s good to see you back!
              </h1>
              <p className="text-base mb-6 leading-relaxed" style={{ color: textLight }}>
                Let&apos;s get you started fresh
                {daysLabel ? ` after ${daysLabel} away` : ''}. We&apos;ll close out active
                protocols and goals as of {gapLabel}, and flag stock &amp; routines so you can
                quickly reconfirm — nothing gets deleted.
              </p>

              <div
                className="rounded-2xl p-4 mb-8 space-y-2.5"
                style={{
                  backgroundColor: theme?.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${theme?.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
                }}
              >
                <CountRow icon={FlaskConical} label="Active protocols" count={impact.counts.protocols} theme={theme} />
                <CountRow icon={Target} label="Open goals" count={impact.counts.goals} theme={theme} />
                <CountRow icon={Package} label="Stock & supplies" count={impact.counts.stockpile} theme={theme} />
                <CountRow
                  icon={Pill}
                  label="Supplements & meds"
                  count={impact.counts.supplements + impact.counts.medications}
                  theme={theme}
                />
                <CountRow icon={CalendarClock} label="Scheduled buys" count={impact.counts.scheduledBuys} theme={theme} />
              </div>

              <button
                type="button"
                onClick={() => goTo(STEPS.REVIEW, 1)}
                className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                style={{ backgroundColor: primary, color: theme?.textOnPrimary || '#fff' }}
              >
                Refresh My Dashboard
                <ChevronRight size={18} />
              </button>
              <button
                type="button"
                onClick={handleRemindLater}
                className="w-full py-3 mt-2 rounded-xl font-medium text-sm"
                style={{ color: text }}
              >
                Remind Me Later
              </button>
              <button
                type="button"
                onClick={handleDecline}
                className="w-full py-2 mt-1 text-xs font-medium"
                style={{ color: textLight }}
              >
                No thanks, I&apos;ll handle it myself
              </button>
            </div>
          </motion.div>
        )}

        {step === STEPS.REVIEW && (
          <motion.div
            key="review"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0 flex flex-col px-6 py-6 overflow-y-auto"
          >
            <div className="max-w-md mx-auto w-full flex-1 flex flex-col">
              <button
                type="button"
                onClick={() => goTo(STEPS.INTRO, -1)}
                className="text-xs font-semibold mb-4 self-start"
                style={{ color: textLight }}
              >
                ← Back
              </button>
              <h2 className="text-2xl font-bold mb-2" style={{ color: text }}>
                Review what we&apos;ll close
              </h2>
              <p className="text-sm mb-5 leading-relaxed" style={{ color: textLight }}>
                Uncheck anything you want to keep running. Everything else ends as of {gapLabel}.
              </p>

              <Section title="Protocols" theme={theme}>
                {impact.activeProtocols.length === 0 ? (
                  <EmptyLine theme={theme} text="No active protocols" />
                ) : (
                  impact.activeProtocols.map((p) => (
                    <CheckRow
                      key={p.id}
                      checked={!excludedProtocolIds.has(p.id)}
                      onToggle={() => toggleProtocol(p.id)}
                      label={p.protocolName || p.name || 'Protocol'}
                      theme={theme}
                      primary={primary}
                    />
                  ))
                )}
              </Section>

              <Section title="Goals" theme={theme}>
                {impact.activeGoals.length === 0 ? (
                  <EmptyLine theme={theme} text="No open goals" />
                ) : (
                  impact.activeGoals.map((g) => (
                    <CheckRow
                      key={g.id}
                      checked={!excludedGoalIds.has(g.id)}
                      onToggle={() => toggleGoal(g.id)}
                      label={g.text || g.title || 'Goal'}
                      theme={theme}
                      primary={primary}
                    />
                  ))
                )}
              </Section>

              <p className="text-xs mt-4 mb-6 leading-relaxed" style={{ color: textLight }}>
                Stockpile, supplies, supplements, medications, and scheduled buys will get a
                &quot;confirm&quot; badge so you can verify quantities and status in place.
              </p>

              <div className="mt-auto pt-4 space-y-2">
                <button
                  type="button"
                  disabled={applying}
                  onClick={handleApply}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                  style={{ backgroundColor: primary, color: theme?.textOnPrimary || '#fff' }}
                >
                  {applying
                    ? 'Refreshing…'
                    : `Confirm (${protocolsToEnd.length} protocols, ${goalsToEnd.length} goals)`}
                </button>
                <button
                  type="button"
                  onClick={handleRemindLater}
                  className="w-full py-2.5 text-sm font-medium"
                  style={{ color: textLight }}
                >
                  Remind Me Later
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {step === STEPS.DONE && (
          <motion.div
            key="done"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0 flex flex-col px-6 py-8 overflow-y-auto"
          >
            <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-5"
                style={{ backgroundColor: `${primary}22` }}
              >
                <Check size={28} style={{ color: primary }} strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-bold mb-2" style={{ color: text }}>
                You&apos;re all set
              </h2>
              <p className="text-sm mb-6 leading-relaxed" style={{ color: textLight }}>
                {result?.endedProtocolIds?.length || 0} protocol
                {(result?.endedProtocolIds?.length || 0) === 1 ? '' : 's'} and{' '}
                {result?.completedGoalIds?.length || 0} goal
                {(result?.completedGoalIds?.length || 0) === 1 ? '' : 's'} closed as of {gapLabel}.
                Quick reconfirm these when you&apos;re ready:
              </p>

              <div className="space-y-2 mb-8">
                <QuickLink
                  to="/app/stockpile"
                  label="Stockpile & Supplies"
                  count={result?.flagged?.stockpile}
                  theme={theme}
                  primary={primary}
                  onNavigate={handleFinish}
                />
                <QuickLink
                  to="/app/supplements"
                  label="Supplements & Medications"
                  count={(result?.flagged?.supplements || 0) + (result?.flagged?.medications || 0)}
                  theme={theme}
                  primary={primary}
                  onNavigate={handleFinish}
                />
                <QuickLink
                  to="/app/orders"
                  label="Scheduled Buys"
                  count={result?.flagged?.scheduledBuys}
                  theme={theme}
                  primary={primary}
                  onNavigate={handleFinish}
                />
              </div>

              <button
                type="button"
                onClick={handleFinish}
                className="w-full py-3.5 rounded-xl font-semibold text-sm"
                style={{ backgroundColor: primary, color: theme?.textOnPrimary || '#fff' }}
              >
                Jump Back In
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CountRow({ icon: Icon, label, count, theme }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <Icon size={16} style={{ color: theme?.primary || '#7F9E95' }} />
        <span className="text-sm truncate" style={{ color: theme?.text }}>
          {label}
        </span>
      </div>
      <span className="text-sm font-semibold tabular-nums" style={{ color: theme?.text }}>
        {count}
      </span>
    </div>
  );
}

function Section({ title, theme, children }) {
  return (
    <div className="mb-4">
      <h3
        className="text-[11px] font-bold uppercase tracking-wider mb-2"
        style={{ color: theme?.textLight }}
      >
        {title}
      </h3>
      <div
        className="rounded-xl overflow-hidden divide-y"
        style={{
          backgroundColor: theme?.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
          border: `1px solid ${theme?.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
          borderColor: theme?.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function EmptyLine({ theme, text }) {
  return (
    <p className="px-3 py-3 text-sm" style={{ color: theme?.textLight }}>
      {text}
    </p>
  );
}

function CheckRow({ checked, onToggle, label, theme, primary }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-3 py-3 text-left"
    >
      <span
        className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0"
        style={{
          backgroundColor: checked ? primary : 'transparent',
          border: `1.5px solid ${checked ? primary : theme?.border || '#ccc'}`,
        }}
      >
        {checked && <Check size={12} color={theme?.textOnPrimary || '#fff'} strokeWidth={3} />}
      </span>
      <span className="text-sm font-medium truncate" style={{ color: theme?.text }}>
        {label}
      </span>
    </button>
  );
}

function QuickLink({ to, label, count, theme, primary, onNavigate }) {
  if (!count) return null;
  return (
    <Link
      to={to}
      onClick={() => onNavigate?.()}
      className="flex items-center justify-between rounded-xl px-4 py-3 transition-opacity hover:opacity-90"
      style={{
        backgroundColor: theme?.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
        border: `1px solid ${theme?.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'}`,
      }}
    >
      <span className="text-sm font-medium" style={{ color: theme?.text }}>
        {label}
      </span>
      <span className="text-xs font-bold" style={{ color: primary }}>
        {count} to confirm →
      </span>
    </Link>
  );
}
