import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import logo from '../../assets/tpp_logo.png';
import ResearcherTypeStep from './ResearcherTypeStep';
import GuidedProtocolWalkthrough, {
  formFromGuidedProtocol,
  GUIDED_PROTOCOL_STEPS,
  ADVANCED_PROTOCOL_STEPS,
} from './GuidedProtocolWalkthrough';
import SetupChecklistModal from './SetupChecklistModal';
import TrialPricingStep from './TrialPricingStep';
import OnboardingQuestionHeader from './OnboardingQuestionHeader';
import { useAppContext } from '../../context/AppContext';
import {
  ONBOARDING_STEPS,
  TRACKING_MODES,
  normalizeTrackingMode,
  setLocalTrackingMode,
  DEFAULT_SETUP_CHECKLIST,
} from '../../utils/trackingMode';
import { getWidgetsForTrackingMode, saveDashboardLayout } from '../../utils/dashboardCustomization';
import { saveSettings, loadSettings, getDefaultSettings } from '../../utils/settingsHelpers';

const STEP_ORDER = [
  ONBOARDING_STEPS.SPLASH,
  ONBOARDING_STEPS.RESEARCHER_TYPE,
  ONBOARDING_STEPS.FIRST_PROTOCOL,
  ONBOARDING_STEPS.SETUP_CHECKLIST,
  ONBOARDING_STEPS.TRIAL_PRICING,
];

const pageTransition = {
  duration: 0.45,
  ease: [0.22, 1, 0.36, 1],
};

const pageVariants = {
  enter: (direction) => ({
    opacity: 0,
    x: direction >= 0 ? 32 : -32,
  }),
  center: {
    opacity: 1,
    x: 0,
  },
  exit: (direction) => ({
    opacity: 0,
    x: direction >= 0 ? -20 : 20,
  }),
};

/**
 * First-run onboarding state machine.
 * Flow: Welcome splash → Researcher type → First protocol → Setup checklist → Trial/pricing → Done
 * Every step enter/exit uses a directional page slide.
 */
export default function OnboardingFlow({ open, theme, userId, initialStep, initialTrackingMode, onComplete }) {
  const { addProtocol, updateProtocol } = useAppContext();
  const [step, setStep] = useState(initialStep || ONBOARDING_STEPS.SPLASH);
  const [direction, setDirection] = useState(1);
  const [trackingMode, setTrackingMode] = useState(
    initialTrackingMode ? normalizeTrackingMode(initialTrackingMode) : null
  );
  /** Keeps first-protocol answers when user backs from setup checklist */
  const [protocolDraft, setProtocolDraft] = useState(null);
  const [createdProtocolId, setCreatedProtocolId] = useState(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (open && initialStep) {
      setStep(initialStep);
      setDirection(1);
    }
  }, [open, initialStep]);

  const persistState = useCallback(async (patch) => {
    if (!userId) return;
    try {
      const { saveUserState, loadUserState } = await import('../../services/cloudStorage');
      const current = (await loadUserState(userId)) || {};
      await saveUserState(userId, { ...current, ...patch });
    } catch (e) {
      console.error('Failed to persist onboarding state', e);
    }
  }, [userId]);

  const goTo = useCallback((next, extra = {}) => {
    const from = STEP_ORDER.indexOf(stepRef.current);
    const to = STEP_ORDER.indexOf(next);
    const dir = to === -1 || from === -1 ? 1 : to >= from ? 1 : -1;
    setDirection(dir);
    setStep(next);
    persistState({ onboardingStep: next, ...extra });
  }, [persistState]);

  const applyTrackingMode = useCallback((mode) => {
    const next = normalizeTrackingMode(mode);
    setTrackingMode(next);
    setLocalTrackingMode(next, { source: 'onboarding' });
    const settings = { ...getDefaultSettings(), ...loadSettings(), trackingMode: next };
    saveSettings(settings);
    saveDashboardLayout(getWidgetsForTrackingMode(next));
    window.dispatchEvent(new CustomEvent('tpp:dashboard-layout-changed'));
    return next;
  }, []);

  const handleSelectMode = (mode) => {
    const next = applyTrackingMode(mode);
    goTo(ONBOARDING_STEPS.FIRST_PROTOCOL, { trackingMode: next });
  };

  const handleProtocolSave = async (protocol) => {
    setProtocolDraft(formFromGuidedProtocol(protocol));
    try {
      if (createdProtocolId) {
        updateProtocol?.({ ...protocol, id: createdProtocolId });
        window.dispatchEvent(new CustomEvent('tpp:toast', {
          detail: { message: 'Protocol updated!', type: 'success' },
        }));
      } else {
        addProtocol?.(protocol);
        setCreatedProtocolId(protocol.id);
      }
    } catch (e) {
      console.error(e);
    }
    goTo(ONBOARDING_STEPS.SETUP_CHECKLIST);
  };

  const handleProtocolSkip = () => {
    goTo(ONBOARDING_STEPS.SETUP_CHECKLIST);
  };

  const handleBackToResearcherType = () => {
    setProtocolDraft(null);
    setCreatedProtocolId(null);
    goTo(ONBOARDING_STEPS.RESEARCHER_TYPE);
  };

  const handleChecklistComplete = (checklist) => {
    goTo(ONBOARDING_STEPS.TRIAL_PRICING, {
      setupChecklistDone: checklist || DEFAULT_SETUP_CHECKLIST,
    });
  };

  const handleFinish = async () => {
    await persistState({
      onboardingStep: ONBOARDING_STEPS.DONE,
      hasOnboarded: true,
      trackingMode,
    });
    sessionStorage.setItem('tpp_welcome_shown', 'true');
    onComplete?.();
  };

  if (!open) return null;

  const bg = theme?.isDark
    ? 'linear-gradient(180deg, #14191f 0%, #0e1219 100%)'
    : 'linear-gradient(180deg, #F5F3EF 0%, #E8E6E1 100%)';
  const primary = theme?.primary || '#7F9E95';

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
        {step === ONBOARDING_STEPS.SPLASH && (
          <motion.div
            key="splash"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center overflow-hidden"
          >
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8 }}
            >
              <div
                className="absolute -top-24 left-1/2 -translate-x-1/2 w-[140%] h-[55%] rounded-full blur-3xl"
                style={{ background: `radial-gradient(ellipse at center, ${primary}33 0%, transparent 70%)` }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 h-1/3"
                style={{
                  background: theme?.isDark
                    ? 'linear-gradient(to top, rgba(0,0,0,0.25), transparent)'
                    : `linear-gradient(to top, ${primary}14, transparent)`,
                }}
              />
            </motion.div>

            <motion.img
              src={logo}
              alt="The Pep Planner"
              className="relative h-28 w-28 object-contain mb-7"
              style={{ filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.18))' }}
              initial={{ opacity: 0, scale: 0.72, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.05 }}
            />

            <OnboardingQuestionHeader
              className="relative mb-10"
              theme={theme}
              titleClassName="text-4xl sm:text-5xl font-black mb-3 max-w-sm leading-tight mx-auto"
              title="Welcome!"
            />

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.55, ease: 'easeOut' }}
              className="relative"
            >
              {/* Radiating Pulse Rings */}
              <motion.div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ border: `2px solid ${primary}` }}
                animate={{ scale: [0.9, 1, 1.4], opacity: [0, 0.5, 0] }}
                transition={{ duration: 3, repeat: Infinity, times: [0, 0.1, 1], ease: "easeOut" }}
              />
              <motion.div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ border: `2px solid ${primary}` }}
                animate={{ scale: [0.9, 1, 1.4], opacity: [0, 0.5, 0] }}
                transition={{ duration: 3, repeat: Infinity, times: [0, 0.1, 1], ease: "easeOut", delay: 1.5 }}
              />

              <motion.button
                type="button"
                onClick={() => goTo(ONBOARDING_STEPS.RESEARCHER_TYPE)}
                className="group relative inline-flex items-center justify-center px-8 py-4 rounded-full font-bold text-lg"
                style={{
                  backgroundColor: primary,
                  color: theme?.textOnPrimary || '#fff',
                  boxShadow: `0 8px 20px ${primary}40`,
                }}
                animate={{
                  scale: [1, 1.02, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                whileHover={{
                  scale: 1.05,
                  boxShadow: `0 16px 32px ${primary}60`,
                  transition: { type: 'spring', stiffness: 400, damping: 15 }
                }}
                whileTap={{
                  scale: 0.95,
                  boxShadow: `0 4px 12px ${primary}50`,
                  transition: { type: 'spring', stiffness: 400, damping: 15 }
                }}
              >
                {/* Hover Glide Layer (clipped to button bounds) */}
                <div className="absolute inset-0 overflow-hidden rounded-full z-0 pointer-events-none">
                  <div 
                    className="absolute inset-0 w-full h-full -translate-x-full group-hover:translate-x-0 transition-transform duration-500 ease-out"
                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.2)' }}
                  />
                </div>
                
                <span className="relative z-10 flex items-center gap-2">
                  Let's get you set up
                  <motion.span
                    animate={{ x: [0, 4, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </motion.span>
                </span>
              </motion.button>
            </motion.div>

            <motion.p
              className="relative text-lg font-semibold mt-10"
              style={{ color: primary }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.7 }}
            >
              Made by a researcher, for researchers.
            </motion.p>
          </motion.div>
        )}

        {step === ONBOARDING_STEPS.RESEARCHER_TYPE && (
          <motion.div
            key="researcher"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0"
          >
            <ResearcherTypeStep
              theme={theme}
              selected={trackingMode}
              onSelect={handleSelectMode}
              onBack={() => goTo(ONBOARDING_STEPS.SPLASH)}
            />
          </motion.div>
        )}

        {step === ONBOARDING_STEPS.FIRST_PROTOCOL && (
          <motion.div
            key="firstProtocol"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0"
          >
            <GuidedProtocolWalkthrough
              open
              presentation="fullscreen"
              fillParent
              allowSkip
              mode={trackingMode}
              theme={theme}
              initialForm={protocolDraft}
              initialStepIndex={
                protocolDraft
                  ? (trackingMode === TRACKING_MODES.ADVANCED
                      ? ADVANCED_PROTOCOL_STEPS
                      : GUIDED_PROTOCOL_STEPS
                    ).length - 1
                  : 0
              }
              existingProtocolId={createdProtocolId}
              onSave={handleProtocolSave}
              onSkip={handleProtocolSkip}
              onClose={handleProtocolSkip}
              onBack={handleBackToResearcherType}
            />
          </motion.div>
        )}

        {step === ONBOARDING_STEPS.SETUP_CHECKLIST && (
          <motion.div
            key="setupChecklist"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0"
          >
            <SetupChecklistModal
              open
              fillParent
              theme={theme}
              onComplete={handleChecklistComplete}
              onBack={() => goTo(ONBOARDING_STEPS.FIRST_PROTOCOL)}
            />
          </motion.div>
        )}

        {step === ONBOARDING_STEPS.TRIAL_PRICING && (
          <motion.div
            key="trial"
            custom={direction}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={pageTransition}
            className="absolute inset-0"
          >
            <TrialPricingStep
              theme={theme}
              onComplete={handleFinish}
              onBack={() => goTo(ONBOARDING_STEPS.SETUP_CHECKLIST)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
