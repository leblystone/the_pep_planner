import React, { useState } from 'react';
import { Loader } from 'lucide-react';
import { Flask, ShieldCheck, LockOpen, Infinity as InfinityIcon, CalendarStar, CalendarDots } from '@phosphor-icons/react';
import { SUBSCRIPTION_PLANS, getPlanPricing } from '../../utils/subscriptionPlans';
import { formatCurrency } from '../../utils/currencyUtils';
import { createCheckoutSession } from '../../services/stripe';
import { subscribe as paymentSubscribe } from '../../services/payment/paymentService';
import { isNative } from '../../utils/platform';
import { STRIPE_CONFIG } from '../../config/stripe';
import { useFirebase } from '../../context/FirebaseContext';
import OnboardingBackButton from './OnboardingBackButton';
import OnboardingLogoFooter from './OnboardingLogoFooter';
import OnboardingQuestionHeader from './OnboardingQuestionHeader';
import readyResearchArt from '../../assets/onboarding/your_ready_research.png';

const ICON_WEIGHT = 'duotone';

/**
 * Final onboarding step — trial pitch + optional pricing.
 * Pricing view mirrors UpgradeModal Research+ plan cards.
 */
export default function TrialPricingStep({ theme, onComplete, onBack }) {
  const { firebaseUser } = useFirebase();
  const [showPricing, setShowPricing] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(null);
  const text = theme?.text || '#1f2937';
  const muted = theme?.textLight || (theme?.isDark ? 'rgba(255,255,255,0.65)' : '#6b7280');
  const primary = theme?.primary || '#7F9E95';
  const primaryDark = theme?.primaryDark || '#5F7F76';
  const cardBg = theme?.isDark ? 'rgba(255,255,255,0.04)' : '#ffffff';
  const cardBorder = theme?.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const pitchCardBg = theme?.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)';
  const pitchBorder = theme?.isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';

  const monthly = getPlanPricing('researchPlusMonthly', 0);
  const annual = getPlanPricing('researchPlusAnnual', 0);
  const lifetime = getPlanPricing('researchPlusLifetime', 0);

  const monthlyPrice = formatCurrency(monthly?.founderPrice ?? monthly?.price ?? SUBSCRIPTION_PLANS.researchPlusMonthly.price);
  const annualPrice = formatCurrency(annual?.founderPrice ?? annual?.price ?? SUBSCRIPTION_PLANS.researchPlusAnnual.price);
  const annualSavings = formatCurrency(Math.max(annual?.savings ?? 0, 0));
  const lifetimePrice = formatCurrency(lifetime?.founderPrice ?? lifetime?.price ?? SUBSCRIPTION_PLANS.researchPlusLifetime.price);
  const perMonthFromAnnual = formatCurrency(
    Number(((annual?.price ?? SUBSCRIPTION_PLANS.researchPlusAnnual.price) / 12).toFixed(2))
  );

  const handleSelectPlan = async (planKey) => {
    if (loadingPlan) return;
    setLoadingPlan(planKey);
    try {
      if (isNative()) {
        await paymentSubscribe(planKey, {
          userEmail: firebaseUser?.email || '',
          userId: firebaseUser?.uid || '',
        });
        onComplete?.();
      } else {
        const priceId = STRIPE_CONFIG.prices[planKey];
        if (!priceId) {
          throw new Error(`Missing Stripe price for ${planKey}`);
        }
        await createCheckoutSession(priceId, firebaseUser?.email, firebaseUser?.uid);
        // Stripe redirects — leave onboarding when they return
      }
    } catch (err) {
      console.error('[TrialPricingStep] checkout error:', err);
      window.dispatchEvent(new CustomEvent('tpp:toast', {
        detail: { message: 'Failed to start checkout. Please try again.', type: 'error' },
      }));
    } finally {
      setLoadingPlan(null);
    }
  };

  const PlanCta = ({ planKey, label, backgroundColor }) => {
    const loading = loadingPlan === planKey;
    const anyLoading = !!loadingPlan;
    return (
      <button
        type="button"
        onClick={() => handleSelectPlan(planKey)}
        disabled={anyLoading}
        className="relative mt-2.5 w-full py-2.5 rounded-lg text-center text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ backgroundColor }}
      >
        {loading && (
          <span className="absolute inset-0 flex items-center justify-center">
            <Loader size={16} className="animate-spin" />
          </span>
        )}
        <span className={loading ? 'invisible' : undefined}>{label}</span>
      </button>
    );
  };

  return (
    <div
      className="relative flex flex-col h-full"
      style={{
        paddingTop: '0.5rem',
        paddingBottom: 'calc(0.75rem + var(--safe-area-bottom, 0px))',
      }}
    >
      <div className="flex-1 px-6 max-w-lg mx-auto w-full flex flex-col justify-center overflow-y-auto">
        {!showPricing ? (
          <div className="text-center">
            <div className="w-40 h-40 sm:w-48 sm:h-48 mx-auto mb-3 flex items-center justify-center">
              <img
                src={readyResearchArt}
                alt=""
                className="w-full h-full object-contain"
                draggable={false}
                style={{
                  mixBlendMode: theme?.isDark ? 'screen' : 'multiply',
                }}
              />
            </div>
            <OnboardingQuestionHeader
              className="mb-6"
              theme={theme}
              titleClassName="text-3xl sm:text-4xl font-bold mb-2 leading-tight"
              title="You're ready!"
            />

            <div
              className="rounded-2xl p-4 sm:p-5 mb-6 border"
              style={{ backgroundColor: pitchCardBg, borderColor: pitchBorder }}
            >
              <div className="flex items-center justify-center gap-2 mb-2">
                <Flask size={20} weight={ICON_WEIGHT} style={{ color: primary }} />
                <h3 className="text-base font-semibold tracking-tight" style={{ color: text }}>
                  14 Days of Research
                  <span
                    className="rp-plus-sparkle inline-block"
                    style={{ color: '#D4A030', fontWeight: 700, fontSize: '1.15em' }}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </h3>
                <style>{`
                  @keyframes rpPlusSparkle {
                    0%, 100% {
                      opacity: 1;
                      transform: scale(1) rotate(0deg);
                      text-shadow: 0 0 2px rgba(212,160,48,0.35);
                    }
                    35% {
                      opacity: 1;
                      transform: scale(1.22) rotate(-6deg);
                      text-shadow:
                        0 0 6px rgba(245,217,122,0.95),
                        0 0 12px rgba(212,160,48,0.65),
                        0 0 18px rgba(232,197,90,0.4);
                    }
                    55% {
                      opacity: 0.88;
                      transform: scale(1.06) rotate(4deg);
                      text-shadow: 0 0 4px rgba(245,217,122,0.7);
                    }
                  }
                  .rp-plus-sparkle {
                    animation: rpPlusSparkle 2.4s ease-in-out infinite;
                    transform-origin: center;
                  }
                `}</style>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: muted }}>
                Protocols, dosing schedule, stockpile tracking, the works.
                Just see if it works for you.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-8">
              {[
                { icon: Flask, title: 'Flexible', sub: 'Month / Annual / Life' },
                { icon: ShieldCheck, title: 'Zero Pressure', sub: 'No upfront payment' },
                { icon: LockOpen, title: 'Full Access', sub: 'Every research tool' },
              ].map(({ icon: Icon, title, sub }) => (
                <div key={title} className="flex flex-col items-center px-1">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
                    style={{ backgroundColor: `${primary}22`, color: primary }}
                  >
                    <Icon size={20} weight={ICON_WEIGHT} style={{ color: primary }} />
                  </div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: text }}>
                    {title}
                  </p>
                  <p className="text-[10px] mt-0.5 leading-snug" style={{ color: muted }}>
                    {sub}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onComplete}
                className="w-full py-3.5 rounded-full font-bold"
                style={{ backgroundColor: primary, color: theme?.textOnPrimary || '#fff' }}
              >
                Start Researching!
              </button>
              <div className="grid grid-cols-3 items-center gap-2 pt-1">
                <div className="flex justify-start">
                  <OnboardingBackButton onClick={() => onBack?.()} theme={theme} />
                </div>
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setShowPricing(true)}
                    className="text-sm opacity-70 py-2 whitespace-nowrap"
                    style={{ color: muted }}
                  >
                    Show me pricing first!
                  </button>
                </div>
                <div />
              </div>
            </div>
          </div>
        ) : (
          <div>
            {/* Header — match UpgradeModal */}
            <div className="text-center mb-4">
              <h2 className="text-lg font-bold tracking-tight" style={{ color: text }}>
                Upgrade to Research
                <span style={{ color: '#D4A030', fontWeight: 700, fontSize: '1.1em', verticalAlign: 'middle' }}>+</span>
              </h2>
              <p className="text-xs mt-1 max-w-sm mx-auto" style={{ color: muted }}>
                Full protocols, cloud sync, AI research, insights, and more.
              </p>
            </div>

            {/* Plan cards — match UpgradeModal, stacked for onboarding width */}
            <div className="space-y-2.5 mb-5">
              {/* Monthly */}
              <div
                className="relative text-left rounded-xl border p-3"
                style={{
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                  boxShadow: theme?.isDark ? '0 2px 12px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
                }}
              >
                <div className="flex items-center gap-3">
                  <CalendarDots size={40} className="flex-shrink-0" weight="duotone" style={{ color: primary }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{ color: text }}>Monthly</div>
                    <div className="text-[11px] leading-snug" style={{ color: muted }}>
                      {SUBSCRIPTION_PLANS.researchPlusMonthly?.description}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-base font-bold tabular-nums" style={{ color: text }}>{monthlyPrice}</div>
                    <div className="text-[10px]" style={{ color: muted }}>per month</div>
                  </div>
                </div>
                <PlanCta
                  planKey="researchPlusMonthly"
                  label={SUBSCRIPTION_PLANS.researchPlusMonthly?.cta || 'Start Monthly'}
                  backgroundColor={primary}
                />
              </div>

              {/* Annual */}
              <div
                className="relative text-left rounded-xl border p-3"
                style={{
                  borderColor: primary,
                  background: theme?.isDark
                    ? `linear-gradient(180deg, ${primary}18 0%, ${cardBg} 55%)`
                    : `linear-gradient(180deg, ${primary}12 0%, #fff 50%)`,
                  boxShadow: `0 4px 16px ${primary}20`,
                }}
              >
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <span
                    className="px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ backgroundColor: primaryDark }}
                  >
                    Popular
                  </span>
                </div>
                <div className="flex items-center gap-3 pt-0.5">
                  <CalendarStar size={40} className="flex-shrink-0" weight="duotone" style={{ color: primary }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{ color: text }}>Annual</div>
                    <div className="text-[11px] leading-snug" style={{ color: muted }}>
                      {SUBSCRIPTION_PLANS.researchPlusAnnual?.description}
                    </div>
                    {annualSavings && Number(String(annualSavings).replace(/[^0-9.]/g, '')) > 0 && (
                      <span
                        className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: theme?.isDark ? 'rgba(212,160,48,0.2)' : 'rgba(212,160,48,0.25)',
                          color: '#B45309',
                        }}
                      >
                        Save {annualSavings} vs monthly
                      </span>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-base font-bold tabular-nums" style={{ color: text }}>{annualPrice}</div>
                    <div className="text-[10px]" style={{ color: muted }}>
                      per year
                    </div>
                    <div className="text-[10px]" style={{ color: muted }}>
                      (~{perMonthFromAnnual}/mo)
                    </div>
                  </div>
                </div>
                <PlanCta
                  planKey="researchPlusAnnual"
                  label={SUBSCRIPTION_PLANS.researchPlusAnnual?.cta || 'Start Annual'}
                  backgroundColor={primaryDark}
                />
              </div>

              {/* Lifetime */}
              <div
                className="relative text-left rounded-xl border p-3"
                style={{
                  borderColor: cardBorder,
                  backgroundColor: cardBg,
                  boxShadow: theme?.isDark ? '0 2px 12px rgba(0,0,0,0.2)' : '0 2px 10px rgba(0,0,0,0.05)',
                }}
              >
                <div className="flex items-center gap-3">
                  <InfinityIcon size={40} className="flex-shrink-0" weight="duotone" style={{ color: primary }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm" style={{ color: text }}>Lifetime</div>
                    <div className="text-[11px] leading-snug" style={{ color: muted }}>
                      {SUBSCRIPTION_PLANS.researchPlusLifetime?.description}
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-base font-bold tabular-nums" style={{ color: text }}>{lifetimePrice}</div>
                    <div className="text-[10px]" style={{ color: muted }}>one-time</div>
                  </div>
                </div>
                <PlanCta
                  planKey="researchPlusLifetime"
                  label={SUBSCRIPTION_PLANS.researchPlusLifetime?.cta || 'Join Forever'}
                  backgroundColor={primary}
                />
              </div>

              <p className="text-[10px] text-center" style={{ color: muted }}>
                Secure checkout · Cancel anytime · Your data always stays yours.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onComplete}
                className="w-full py-3.5 rounded-full font-bold"
                style={{ backgroundColor: primary, color: theme?.textOnPrimary || '#fff' }}
              >
                Start Researching!
              </button>
              <div className="grid grid-cols-3 items-center gap-2 pt-1">
                <div className="flex justify-start">
                  <OnboardingBackButton onClick={() => setShowPricing(false)} theme={theme} />
                </div>
                <div />
                <div />
              </div>
            </div>
          </div>
        )}
      </div>

      <OnboardingLogoFooter />
    </div>
  );
}
