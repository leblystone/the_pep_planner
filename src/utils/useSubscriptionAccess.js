import { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { useFirebase } from '../context/FirebaseContext';
import { deriveTierFromSubscription, getTierFeatures } from './subscriptionPlans';
import { featureFlags } from '../config/featureFlags';
import { setCloudSyncPaused } from '../services/cloudSyncPause';
import { trackConversion, EVENTS } from '../services/conversionAnalytics';
import { getDevOverride, DEV_TEST_UID } from './devSubscriptionOverride';

/**
 * Research+ Wave: when `ENABLE_SOFT_DOWNGRADE` is ON we swap the legacy
 * hard lockout (`hasAccess: false, isReadOnly: true`) for a downgrade
 * posture. The user stays inside the app on the Free tier but gets a
 * persistent upgrade prompt and caps apply to new records. No data is
 * deleted — locked items fall back to read-only in their own UI.
 *
 * Returns a (possibly unchanged) access-info object.
 */
function applySoftDowngrade(access) {
    if (!featureFlags.ENABLE_SOFT_DOWNGRADE) return access;
    if (!access) return access;
    const shouldSoften = access.hasAccess === false && access.isReadOnly === true;
    if (!shouldSoften) return access;
    return {
        ...access,
        hasAccess: true,
        isReadOnly: false,
        isDowngraded: true,
        showUpgradePrompt: true,
        downgradedFrom: access.subscriptionStatus,
    };
}

/**
 * Hook to check subscription access and trial status
 * CLOUD-ONLY: Uses subscription from AppContext (loaded from cloud)
 * @returns {Object} Subscription access information
 */
export function useSubscriptionAccess() {
  const { subscription } = useAppContext();
  const { firebaseUser } = useFirebase();
  const [isLoading, setIsLoading] = useState(true); // Track if we're still loading subscription data
  const [hasCheckedLifetime, setHasCheckedLifetime] = useState(false); // Track if we've checked lifetime access

  // Test account override — re-render when state changes
  const uid = firebaseUser?.uid;
  const [devOverride, setDevOverrideLocal] = useState(() => getDevOverride(uid));
  useEffect(() => {
    if (uid !== DEV_TEST_UID) return;
    const h = () => setDevOverrideLocal(getDevOverride(uid));
    window.addEventListener('tpp:dev-override-changed', h);
    return () => window.removeEventListener('tpp:dev-override-changed', h);
  }, [uid]);
  const lifetimeCheckStarted = useRef(false); // Track if check has started
  const lastProcessedSubscriptionRef = useRef(null); // Track last processed subscription to prevent re-processing
  const isProcessingRef = useRef(false); // Prevent concurrent processing
  const [accessInfo, setAccessInfoRaw] = useState({
    hasAccess: true,
    isTrialExpired: false,
    isSubscriptionEnded: false,
    isReadOnly: false,
    showUpgradePrompt: false,
    daysRemaining: null,
    subscriptionStatus: 'loading',
    subscriptionInterval: null,
  });
  // Funnel every write through applySoftDowngrade so we can't accidentally
  // bypass the downgrade policy from one of the many branches below.
  const setAccessInfo = (next) => setAccessInfoRaw(applySoftDowngrade(next));

  // Check subscription directly from Firestore if subscription hasn't loaded yet
  // This prevents showing expired chip for ANY subscription type while loading
  useEffect(() => {
    const checkSubscriptionDirectly = async () => {
      // Only check if we don't have subscription yet and haven't started checking
      if (subscription || !firebaseUser || lifetimeCheckStarted.current) {
        return;
      }

      // Mark that we've started the check (prevents duplicate checks)
      lifetimeCheckStarted.current = true;

      try {
        // Import loadUserSubscription which checks all sources including lifetimeAccess
        const { loadUserSubscription } = await import('../services/cloudStorage');
        const directSubscription = await loadUserSubscription(firebaseUser.uid);
        
        if (directSubscription) {
          setHasCheckedLifetime(true);
          
          // Set access info directly to prevent showing expired chip
          const hasLifetime = directSubscription.hasLifetimeAccess || 
                            directSubscription.interval === 'lifetime' || 
                            directSubscription.plan === 'lifetime';
          
          if (hasLifetime) {
            setAccessInfo({
              hasAccess: true,
              isTrialExpired: false,
              isSubscriptionEnded: false,
              isReadOnly: false,
              showUpgradePrompt: false,
              daysRemaining: Infinity,
              subscriptionStatus: 'active',
              subscriptionInterval: 'lifetime',
              isLifetimeGranted: !!directSubscription.lifetimeReason,
              lifetimeReason: directSubscription.lifetimeReason || 'Admin grant'
            });
          } else if (directSubscription.status === 'active') {
            // Active paid subscription (monthly/annual)
            const now = new Date();
            const endDate = directSubscription.currentPeriodEnd ? new Date(directSubscription.currentPeriodEnd) : null;
            const timeLeft = endDate ? (endDate.getTime() - now.getTime()) : 0;
            const daysLeftDisplay = endDate ? Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24))) : 0;
            
            setAccessInfo({
              hasAccess: true,
              isTrialExpired: false,
              isSubscriptionEnded: false,
              isReadOnly: false,
              showUpgradePrompt: false,
              daysRemaining: daysLeftDisplay,
              subscriptionStatus: 'active',
              subscriptionInterval: directSubscription.interval,
            });
          } else if (directSubscription.status === 'trialing') {
            // Active trial
            const now = new Date();
            const endDate = directSubscription.currentPeriodEnd ? new Date(directSubscription.currentPeriodEnd) : null;
            const timeLeft = endDate ? (endDate.getTime() - now.getTime()) : 0;
            const daysLeftDisplay = endDate ? Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24))) : 0;
            
            if (timeLeft > 0) {
              setAccessInfo({
                hasAccess: true,
                isTrialExpired: false,
                isSubscriptionEnded: false,
                isReadOnly: false,
                showUpgradePrompt: daysLeftDisplay <= 2,
                daysRemaining: daysLeftDisplay,
                subscriptionStatus: 'trialing',
                subscriptionInterval: 'trial',
              });
            }
          }
          
          setIsLoading(false);
        } else {
          setHasCheckedLifetime(true);
        }
      } catch (error) {
        console.warn('⚠️ Error checking subscription directly:', error);
        setHasCheckedLifetime(true);
      }
    };

    checkSubscriptionDirectly();
    
    // Fallback timeout: if check doesn't complete in 2 seconds, force it complete
    // This prevents infinite waiting if Firestore is slow
    const timeout = setTimeout(() => {
      if (!hasCheckedLifetime && lifetimeCheckStarted.current) {
        setHasCheckedLifetime(true);
      }
    }, 2000);
    
    return () => clearTimeout(timeout);
  }, [subscription, firebaseUser, hasCheckedLifetime]);

  useEffect(() => {
    const checkSubscriptionAccess = async () => {
      // Prevent concurrent processing
      if (isProcessingRef.current) {
        return;
      }
      
      try {
        isProcessingRef.current = true;
        
        // CRITICAL: Don't show trial expired during signup flow
        const signupInProgress = sessionStorage.getItem('tpp_signup_in_progress');
        if (signupInProgress === 'true') {
          setIsLoading(true);
          return;
        }

        // Use subscription from cloud storage (via AppContext), with localStorage fallback
        let effectiveSubscription = subscription;
        
        // STABILITY: Skip re-processing if subscription hasn't changed
        const subKey = effectiveSubscription ? JSON.stringify({
          status: effectiveSubscription.status,
          interval: effectiveSubscription.interval,
          plan: effectiveSubscription.plan,
          currentPeriodEnd: effectiveSubscription.currentPeriodEnd,
          hasLifetimeAccess: effectiveSubscription.hasLifetimeAccess
        }) : 'null';
        
        if (lastProcessedSubscriptionRef.current === subKey) {
          isProcessingRef.current = false;
          return;
        }
        
        // Fallback to localStorage with a 24-hour expiry to prevent stale data abuse
        if (!effectiveSubscription) {
          try {
            const localRaw = localStorage.getItem('tpprover_subscription');
            if (localRaw) {
              const localData = JSON.parse(localRaw);
              // Use _cachedAt if present, otherwise estimate from lastUpdated or startedAt
              const savedAt = localData?._cachedAt || 
                              (localData?.lastUpdated ? new Date(localData.lastUpdated).getTime() : 0) ||
                              (localData?.startedAt ? new Date(localData.startedAt).getTime() : 0);
              const maxAge = 24 * 60 * 60 * 1000; // 24 hours
              if (savedAt > 0 && Date.now() - savedAt < maxAge) {
                effectiveSubscription = localData;
              } else {
                localStorage.removeItem('tpprover_subscription');
              }
            }
          } catch (e) {
            console.error('Failed to parse localStorage subscription:', e);
          }
        }
        
        // Mark loading as complete - we have data to work with (or confirmed there is none)
        setIsLoading(false);
        
        // Store that we've processed this subscription
        lastProcessedSubscriptionRef.current = subKey;
        
        // If no subscription found after checking all sources
        if (!effectiveSubscription) {
          // Wait for direct lifetime check to complete first
          if (!hasCheckedLifetime) {
              return;
          }
          
          setAccessInfo({
            hasAccess: false,
            isTrialExpired: true,
            isSubscriptionEnded: false,
            isReadOnly: true,
            showUpgradePrompt: true,
            daysRemaining: 0,
            subscriptionStatus: 'expired',
            subscriptionInterval: null,
          });
          return;
        }

        // Mark loading as complete - we have subscription data
        setIsLoading(false);

        // CRITICAL FIX: Check for lifetime access FIRST, before any trial checks
        // This prevents lifetime users from being locked out even if they have trial status
        // Also check lifetimeAccess collection directly if subscription doesn't have lifetime flags
        let hasLifetimeAccess = effectiveSubscription.hasLifetimeAccess || 
                                  effectiveSubscription.interval === 'lifetime' || 
                                  effectiveSubscription.plan === 'lifetime';
        
        // If subscription doesn't show lifetime but user might have it, check directly
        // 3-second timeout prevents this Firestore call from hanging indefinitely
        // (e.g. on simulators / poor networks where WebChannel stalls)
        if (!hasLifetimeAccess && firebaseUser) {
          try {
            const { checkLifetimeAccessFirestore } = await import('../services/firebase');
            const lifetimeCheck = await Promise.race([
              checkLifetimeAccessFirestore(firebaseUser.uid),
              new Promise(resolve => setTimeout(() => resolve(null), 3000))
            ]);
            if (lifetimeCheck?.hasAccess) {
              hasLifetimeAccess = true;
              // Update effectiveSubscription with lifetime data
              effectiveSubscription = {
                ...effectiveSubscription,
                hasLifetimeAccess: true,
                interval: 'lifetime',
                plan: 'lifetime',
                status: 'active',
                lifetimeReason: lifetimeCheck.reason || 'Admin grant',
                currentPeriodEnd: null
              };
            }
          } catch (lifetimeError) {
            console.warn('⚠️ Error checking lifetime access directly:', lifetimeError);
          }
        }
        
        if (hasLifetimeAccess) {
          // Check if this is a granted lifetime access (not purchased)
          const isLifetimeGranted = effectiveSubscription.lifetimeReason && 
            !effectiveSubscription.paymentMethodId && 
            !effectiveSubscription.stripeSubscriptionId;
          
          setAccessInfo({
            hasAccess: true,
            isTrialExpired: false,
            isSubscriptionEnded: false,
            isReadOnly: false,
            showUpgradePrompt: false,
            daysRemaining: Infinity,
            subscriptionStatus: 'active',
            subscriptionInterval: 'lifetime',
            isLifetimeGranted: isLifetimeGranted,
            lifetimeReason: effectiveSubscription.lifetimeReason || 'Purchased'
          });
          return;
        }

        const now = new Date();
        // Handle null/undefined currentPeriodEnd for subscriptions without end dates
        const endDate = effectiveSubscription.currentPeriodEnd ? new Date(effectiveSubscription.currentPeriodEnd) : null;
        const timeLeft = endDate ? (endDate.getTime() - now.getTime()) : 0;
        // Display-friendly days remaining: ceil so the last partial day counts as 1
        // This avoids prematurely marking trials as expired while hours remain
        const daysLeftDisplay = endDate ? Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24))) : 0;

        // Active paid subscription (monthly, annual)
        // Also handle canceled subscriptions with cancelAtPeriodEnd (access continues until period end)
        const isCanceledButActive = effectiveSubscription.status === 'canceled' && 
                                    effectiveSubscription.cancelAtPeriodEnd && 
                                    timeLeft > 0;
        
        if ((effectiveSubscription.status === 'active' || isCanceledButActive) && 
            effectiveSubscription.interval !== 'trial') {
          setAccessInfo({
            hasAccess: true,
            isTrialExpired: false,
            isSubscriptionEnded: false,
            isReadOnly: false,
            showUpgradePrompt: false,
            daysRemaining: daysLeftDisplay,
            subscriptionStatus: isCanceledButActive ? 'canceled' : 'active',
            subscriptionInterval: effectiveSubscription.interval,
            cancelAtPeriodEnd: effectiveSubscription.cancelAtPeriodEnd || false,
          });
          return;
        }

        // Handle past_due status (usually has grace period)
        if (effectiveSubscription.status === 'past_due' && timeLeft > 0) {
          setAccessInfo({
            hasAccess: true,
            isTrialExpired: false,
            isSubscriptionEnded: false,
            isReadOnly: false,
            showUpgradePrompt: true,
            daysRemaining: daysLeftDisplay,
            subscriptionStatus: 'past_due',
            subscriptionInterval: effectiveSubscription.interval,
          });
          return;
        }

        // Grace period -- payment failed but provider gives a short window to fix it
        if (effectiveSubscription.status === 'grace_period') {
          setAccessInfo({
            hasAccess: true,
            isTrialExpired: false,
            isSubscriptionEnded: false,
            isReadOnly: false,
            showUpgradePrompt: true,
            daysRemaining: daysLeftDisplay,
            subscriptionStatus: 'grace_period',
            subscriptionInterval: effectiveSubscription.interval,
          });
          return;
        }

        // On hold -- payment failed, grace period expired, access suspended
        if (effectiveSubscription.status === 'on_hold') {
          setAccessInfo({
            hasAccess: false,
            isTrialExpired: false,
            isSubscriptionEnded: true,
            isReadOnly: true,
            showUpgradePrompt: true,
            daysRemaining: 0,
            subscriptionStatus: 'on_hold',
            subscriptionInterval: effectiveSubscription.interval,
          });
          return;
        }

        // Paused -- user voluntarily paused
        if (effectiveSubscription.status === 'paused') {
          setAccessInfo({
            hasAccess: false,
            isTrialExpired: false,
            isSubscriptionEnded: true,
            isReadOnly: true,
            showUpgradePrompt: true,
            daysRemaining: 0,
            subscriptionStatus: 'paused',
            subscriptionInterval: effectiveSubscription.interval,
          });
          return;
        }

        // Disputed / refunded / revoked -- access revoked
        if (['disputed', 'refunded', 'revoked'].includes(effectiveSubscription.status)) {
          setAccessInfo({
            hasAccess: false,
            isTrialExpired: false,
            isSubscriptionEnded: true,
            isReadOnly: true,
            showUpgradePrompt: true,
            daysRemaining: 0,
            subscriptionStatus: effectiveSubscription.status,
            subscriptionInterval: effectiveSubscription.interval,
          });
          return;
        }

        // Active trial
        // Consider trial active as long as actual timeLeft > 0
        if (effectiveSubscription.status === 'trialing' && timeLeft > 0) {
          setAccessInfo({
            hasAccess: true,
            isTrialExpired: false,
            isSubscriptionEnded: false,
            isReadOnly: false,
            showUpgradePrompt: daysLeftDisplay <= 2, // Show prompt in last 2 days
            daysRemaining: daysLeftDisplay,
            subscriptionStatus: 'trialing',
            subscriptionInterval: 'trial',
          });
          return;
        }

        // Distinguish between trial expired vs paid subscription ended
        // Use status as the primary indicator, interval as secondary
        const isTrial = effectiveSubscription.status === 'trialing' || 
                        (effectiveSubscription.interval === 'trial' && effectiveSubscription.status !== 'canceled');
        const hadPaidSubscription = !isTrial && (
          effectiveSubscription.status === 'active' ||
          effectiveSubscription.status === 'canceled' ||
          effectiveSubscription.status === 'past_due' ||
          effectiveSubscription.status === 'expired' ||
          ['month', 'monthly', 'year', 'annual', 'lifetime'].includes(effectiveSubscription.interval)
        );
        const isSubscriptionEnded = hadPaidSubscription && timeLeft <= 0;
        const isTrialExpired = isTrial && timeLeft <= 0;
        
        // If neither trial nor paid detected, default to trial expired (no subscription)
        const effectiveTrialExpired = isTrialExpired || (!isSubscriptionEnded && !isTrial && !hadPaidSubscription);
        setAccessInfo({
          hasAccess: false,
          isTrialExpired: effectiveTrialExpired && !isSubscriptionEnded,
          isSubscriptionEnded: isSubscriptionEnded,
          isReadOnly: true,
          showUpgradePrompt: true,
          daysRemaining: 0,
          subscriptionStatus: effectiveSubscription.status === 'canceled' ? 'canceled' : 'expired',
          subscriptionInterval: effectiveSubscription.interval,
        });

      } catch (error) {
        console.error('Error checking subscription access:', error);
        // Default to read-only on error
        setAccessInfo({
          hasAccess: false,
          isTrialExpired: true,
          isSubscriptionEnded: false,
          isReadOnly: true,
          showUpgradePrompt: true,
          daysRemaining: 0,
          subscriptionStatus: 'error',
          subscriptionInterval: null,
        });
      } finally {
        isProcessingRef.current = false;
      }
    };

    // Check immediately
    checkSubscriptionAccess();
    
    // Also check after a longer delay to catch subscriptions that load after initial render
    // Increased from 500ms to 2000ms to reduce excessive checking
    const delayedCheck = setTimeout(() => {
      checkSubscriptionAccess();
    }, 2000);

    // Listen for subscription updates
    const handleSubscriptionUpdate = () => {
      // Reset the last processed key so it will re-process
      lastProcessedSubscriptionRef.current = null;
      checkSubscriptionAccess();
    };

    window.addEventListener('subscription:updated', handleSubscriptionUpdate);

    // Check every 5 minutes for trial expiration (reduced from 1 minute)
    // Less frequent checks reduce console spam and unnecessary processing
    const interval = setInterval(checkSubscriptionAccess, 300000);

    return () => {
      clearTimeout(delayedCheck);
      window.removeEventListener('subscription:updated', handleSubscriptionUpdate);
      clearInterval(interval);
    };
  }, [subscription, firebaseUser, hasCheckedLifetime]); // Removed isLoading from deps to prevent re-triggering

  // Cloud sync is on for all accounts regardless of tier — paid features
  // are gated by capability caps, not data access. Always clear any
  // legacy pause flag that may be stuck in localStorage from earlier builds.
  const prevDowngradedRef = useRef(null);
  useEffect(() => {
    if (isLoading) return;
    setCloudSyncPaused(false);
    // Fire the one-time downgrade analytic only on the transition into
    // downgrade state so the funnel doesn't double-count on remount.
    const isDowngraded = Boolean(accessInfo.isDowngraded);
    if (prevDowngradedRef.current === false && isDowngraded === true) {
      trackConversion(EVENTS.DOWNGRADED_TO_FREE, {
        from: accessInfo.downgradedFrom || accessInfo.subscriptionStatus,
      });
    }
    prevDowngradedRef.current = isDowngraded;
  }, [accessInfo.isDowngraded, accessInfo.downgradedFrom, accessInfo.subscriptionStatus, isLoading]);

  // Test-account override — bypasses real subscription state for UI testing
  if (devOverride !== 'off') {
    if (devOverride === 'trialing') {
      return { subscriptionStatus: 'trialing', hasAccess: true, isTrialExpired: false, isSubscriptionEnded: false, isReadOnly: false, showUpgradePrompt: false, daysRemaining: 7, subscriptionInterval: 'trial', isLoading: false, isDowngraded: false };
    }
    if (devOverride === 'free') {
      // Mirrors ENABLE_SOFT_DOWNGRADE behaviour: user stays in-app on free tier.
      // hasAccess: true so no page redirect; isDowngraded: true drives upgrade prompts.
      return { subscriptionStatus: 'expired', hasAccess: true, isTrialExpired: true, isSubscriptionEnded: false, isReadOnly: false, showUpgradePrompt: true, daysRemaining: 0, subscriptionInterval: null, isLoading: false, isDowngraded: true };
    }
  }

  return { ...accessInfo, isLoading };
}

// Themes available on the free tier — everything else requires a paid plan.
const FREE_TIER_THEMES = ['sage', 'softDark'];

/**
 * Research+ Wave — tier-based access hook.
 *
 * Composes cleanly alongside `useSubscriptionAccess()` above. This hook
 * focuses on WHAT FEATURES a user can access (AI, Buddy, Directory, caps)
 * rather than WHETHER they can access the app at all (trial/lockout state).
 *
 * Returns derived gate helpers and cap values. All feature flags are
 * consulted here so a mis-stamped tier can't surface features with their
 * flag off.
 *
 * Usage:
 *   const { tier, isFounder, hasAIAccess, canAddProtocol } = useTierAccess();
 */
export function useTierAccess() {
    const { subscription, subscriptionHydrated, protocols, stockpile, supplements, reconHistory, orders, vendors, medications } = useAppContext();
    const { firebaseUser } = useFirebase();

    // Test account override — re-render when state changes
    const tuid = firebaseUser?.uid;
    const [devOverride, setDevOverrideLocal] = useState(() => getDevOverride(tuid));
    useEffect(() => {
        if (tuid !== DEV_TEST_UID) return;
        const h = () => setDevOverrideLocal(getDevOverride(tuid));
        window.addEventListener('tpp:dev-override-changed', h);
        return () => window.removeEventListener('tpp:dev-override-changed', h);
    }, [tuid]);

    const tier = useMemo(() => {
        // During signup, treat as free to avoid flashing paid UI.
        if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('tpp_signup_in_progress') === 'true') {
            return 'free';
        }
        return deriveTierFromSubscription(subscription);
    }, [subscription]);

    // Test-account override tier map
    const DEV_TIER_MAP = {
        trialing:       'research_plus',
        free:           'free',
        founder_active: 'founder',
        founder_lapsed: 'free',
        research_plus:  'research_plus',
    };
    const effectiveTier = devOverride !== 'off' ? (DEV_TIER_MAP[devOverride] || 'free') : tier;

    // Founder badge: real founder OR simulating a founder state
    const isFounder = Boolean(
        subscription?.isFounder === true ||
        effectiveTier === 'founder' ||
        devOverride === 'founder_active' ||
        devOverride === 'founder_lapsed'
    );
    const features = useMemo(() => getTierFeatures(effectiveTier), [effectiveTier]);

    // Current counts — used by cap helpers so Free tier users can see
    // exactly where they stand and when they'll hit a paywall.
    // Cap is on ACTIVE protocols (currently running), not total protocol entries.
    const protocolCount = useMemo(() => {
        if (!Array.isArray(protocols)) return 0;
        return protocols.filter((p) => p.active === true && !p.heldByFreePlan && !p.archived && !p.deleted).length;
    }, [protocols]);

    const stockpileCount = useMemo(() => {
        if (!Array.isArray(stockpile)) return 0;
        // Cap is on ACTIVE entries; heldByFreePlan entries don't count (mirrors protocol/supplement logic).
        return stockpile.filter((s) => !s.heldByFreePlan && !s.archived && !s.deleted).length;
    }, [stockpile]);

    const medicationCount = useMemo(() => {
        if (!Array.isArray(medications)) return 0;
        return medications.filter((m) => (m.active !== false) && !m.heldByFreePlan && !m.archived && !m.deleted).length;
    }, [medications]);

    const supplementCount = useMemo(() => {
        if (!Array.isArray(supplements)) return 0;
        // Cap is on ACTIVE supplements + medications combined (shared daily-item pool).
        const activeSupps = supplements.filter((s) => (s.active !== false) && !s.heldByFreePlan && !s.archived && !s.deleted).length;
        return activeSupps + medicationCount;
    }, [supplements, medicationCount]);

    const savedCalcCount = useMemo(() => {
        if (!Array.isArray(reconHistory)) return 0;
        return reconHistory.filter((r) => !r.archived && !r.deleted).length;
    }, [reconHistory]);

    const vendorCount = useMemo(() => {
        if (!Array.isArray(vendors)) return 0;
        return vendors.filter((v) => v && !v.deleted && !v.isStub).length;
    }, [vendors]);

    // Cap is on non-delivered (active) orders. Delivered = historical, never blocks the slot.
    const orderCount = useMemo(() => {
        if (!Array.isArray(orders)) return 0;
        return orders.filter((o) => {
            if (!o || o.deleted) return false;
            const status = (o.status || '').toLowerCase();
            return !status.includes('delivered');
        }).length;
    }, [orders]);

    // Feature gates — all respect feature flags so flipping a flag OFF
    // denies access regardless of tier. Flipping a flag ON lets the tier
    // check decide. Founders with features-off (because ENABLE_RESEARCH_PLUS
    // is false) still see their current app unchanged.
    const hasAIAccess = Boolean(featureFlags.ENABLE_AI_RESEARCH && features.hasAIAccess);
    const hasBuddyAccess = Boolean(featureFlags.ENABLE_BUDDY && features.hasBuddyAccess);
    const hasDirectoryAccess = Boolean(featureFlags.ENABLE_COMMUNITY && features.hasDirectoryAccess);
    const hasAdvancedInsights = Boolean(features.hasAdvancedInsights);
    const hasCloudSync = Boolean(features.hasCloudSync);
    const hasPremiumThemes = Boolean(features.hasPremiumThemes);

    // Caps — only enforced when soft-downgrade is on AND tier is free AND subscription has
    // fully hydrated. Without the hydration guard, a null subscription during initial load
    // or OTA migrations briefly returns 'free' and incorrectly fires the choose-protocol
    // modal for lifetime/Research+ users.
    const caps = useMemo(() => {
        const capsEnforced = featureFlags.ENABLE_SOFT_DOWNGRADE && effectiveTier === 'free' && subscriptionHydrated;
        return {
            enforced: capsEnforced,
            maxActiveProtocols: features.maxActiveProtocols,
            maxStockpileItems: features.maxStockpileItems,
            maxSupplements: features.maxSupplements ?? null,
            maxGoals: features.maxGoals ?? null,
            maxOrders: features.maxOrders ?? null,
            maxVendors: features.maxVendors ?? null,
            maxSavedCalcs: features.maxSavedCalcs ?? null,
            protocolCount,
            stockpileCount,
            supplementCount,
            orderCount,
            vendorCount,
            savedCalcCount,
        };
    }, [features, protocolCount, stockpileCount, supplementCount, orderCount, vendorCount, savedCalcCount, effectiveTier, subscriptionHydrated]);

    const isFree = effectiveTier === 'free';

    // Revert premium themes to sage when the user is confirmed free — not while subscription is still loading
    // (null subscription briefly implies free and used to wipe Pearlescent for Research+ on every refresh).
    useEffect(() => {
        if (!isFree) return;
        if (!firebaseUser || !subscriptionHydrated) return;
        try {
            const stored = localStorage.getItem('tpprover_theme');
            if (stored && !FREE_TIER_THEMES.includes(stored)) {
                localStorage.setItem('tpprover_theme', 'sage');
                window.location.reload();
            }
        } catch { /* localStorage unavailable */ }
    }, [isFree, firebaseUser, subscriptionHydrated]);

    const canAddProtocol = useMemo(() => {
        if (!caps.enforced) return true;
        if (caps.maxActiveProtocols === null) return true;
        return protocolCount < caps.maxActiveProtocols;
    }, [caps, protocolCount]);

    const canAddStockpileItem = useMemo(() => {
        if (!caps.enforced) return true;
        if (caps.maxStockpileItems === null) return true;
        return stockpileCount < caps.maxStockpileItems;
    }, [caps, stockpileCount]);

    const canAddSupplement = useMemo(() => {
        if (!caps.enforced) return true;
        if (caps.maxSupplements === null) return true;
        return supplementCount < caps.maxSupplements;
    }, [caps, supplementCount]);

    const canAddMedication = useMemo(() => {
        if (!caps.enforced) return true;
        if (caps.maxSupplements === null) return true;
        return supplementCount < caps.maxSupplements;
    }, [caps, supplementCount]);

    const canAddOrder = useMemo(() => {
        if (!caps.enforced) return true;
        if (caps.maxOrders === null) return true;
        return orderCount < caps.maxOrders;
    }, [caps, orderCount]);

    const canAddVendor = useMemo(() => {
        if (!caps.enforced) return true;
        if (caps.maxVendors === null) return true;
        return vendorCount < caps.maxVendors;
    }, [caps, vendorCount]);

    const canSaveCalc = useMemo(() => {
        if (!caps.enforced) return true;
        if (caps.maxSavedCalcs === null) return true;
        return savedCalcCount < caps.maxSavedCalcs;
    }, [caps, savedCalcCount]);

    const canStartAIChat = hasAIAccess;
    const canEnableBuddyMode = hasBuddyAccess;
    const canSyncToCloud = hasCloudSync;

    return useMemo(() => ({
        // Tier identity
        tier: effectiveTier,
        isFounder,
        isFree,
        isResearchPlus: effectiveTier === 'research_plus',

        // Feature gates
        hasAIAccess,
        hasBuddyAccess,
        hasDirectoryAccess,
        hasAdvancedInsights,
        hasCloudSync,
        hasPremiumThemes,

        // Cap helpers
        canAddProtocol,
        canAddStockpileItem,
        canAddSupplement,
        canAddMedication,
        canAddOrder,
        canAddVendor,
        canSaveCalc,
        canStartAIChat,
        canEnableBuddyMode,
        canSyncToCloud,

        // Raw caps + counts (for UI display like "1/1 used")
        caps,
        medicationCount,

        // AI quota
        aiDailyQuota: features.aiDailyQuota,

        // For debugging / admin views
        _raw: { subscription, userId: firebaseUser?.uid },
    }), [
        effectiveTier,
        isFounder,
        isFree,
        hasAIAccess,
        hasBuddyAccess,
        hasDirectoryAccess,
        hasAdvancedInsights,
        hasCloudSync,
        hasPremiumThemes,
        canAddProtocol,
        canAddStockpileItem,
        canAddSupplement,
        canAddMedication,
        canAddOrder,
        canAddVendor,
        canSaveCalc,
        canStartAIChat,
        canEnableBuddyMode,
        canSyncToCloud,
        caps,
        medicationCount,
        features.aiDailyQuota,
        subscription,
        firebaseUser?.uid,
    ]);
}

