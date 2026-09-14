import React, { useEffect, useRef, useState, useCallback } from 'react'
import { CreditCard, Truck, HouseLine, Package } from '@phosphor-icons/react'
import imgPlaced    from '../../assets/placed.png'
import imgInTransit from '../../assets/in_transit.png'
import imgDelivered from '../../assets/delivered.png'

export function getOrderStatusStep(status) {
  const s = (status || '').toLowerCase()
  if (s.includes('deliver')) return 3
  if (s.includes('ship') || s.includes('transit')) return 2
  return 1
}

// ─── CSS keyframes injected once ─────────────────────────────────────────────

let _stylesInjected = false
function injectAnimStyles() {
  if (_stylesInjected || typeof document === 'undefined') return
  _stylesInjected = true
  const s = document.createElement('style')
  s.setAttribute('data-osp', '1')
  s.textContent = `
    @keyframes osp-pulse-ring {
      0%   { transform: scale(1);   opacity: 0.55; }
      70%  { transform: scale(2.2); opacity: 0; }
      100% { transform: scale(2.2); opacity: 0; }
    }
    @keyframes osp-sparkle {
      0%   { opacity: 0; transform: scale(0) rotate(0deg) translate(var(--sx,0px), var(--sy,0px)); }
      35%  { opacity: 1; transform: scale(1.2) rotate(12deg) translate(var(--sx,0px), var(--sy,0px)); }
      100% { opacity: 0; transform: scale(0.5) rotate(40deg) translate(calc(var(--sx,0px)*1.6), calc(var(--sy,0px)*1.6)); }
    }
    @keyframes osp-truck-slide {
      0%   { top: -10%; opacity: 0; }
      12%  { opacity: 1; }
      88%  { opacity: 1; }
      100% { top: 110%; opacity: 0; }
    }
  `
  document.head.appendChild(s)
}

// ─── Sparkle burst around active dot ─────────────────────────────────────────

const SPARKLE_POS = [
  { x: -18, y: -18 }, { x: 0, y: -22 }, { x: 18, y: -18 },
  { x: 22, y:   0  }, { x: 18, y:  18 }, { x: -18, y: 16 },
]

function SparklesBurst({ color, variant }) {
  const symbols = variant === 'coin'
    ? ['$', '◈', '¢', '$', '◈', '¢']
    : ['✦', '✧', '★', '✦', '✧', '★']

  return (
    <span className="pointer-events-none" style={{ position: 'absolute', inset: 0 }}>
      {SPARKLE_POS.map((p, i) => (
        <span
          key={i}
          style={{
            position:  'absolute',
            top:  '50%',
            left: '50%',
            fontSize: variant === 'coin' ? '9px' : '8px',
            fontWeight: 700,
            color,
            '--sx': `${p.x}px`,
            '--sy': `${p.y}px`,
            animation: `osp-sparkle ${1.1 + i * 0.07}s ease-out ${i * 0.06}s forwards`,
            lineHeight: 1,
          }}
        >
          {symbols[i]}
        </span>
      ))}
    </span>
  )
}

// ─── Horizontal layout (Orders list page — unchanged) ────────────────────────

function HorizontalProgress({ step, theme, isDelayed }) {
  const steps   = [
    { key: 'placed',    label: 'Placed',     Icon: CreditCard },
    { key: 'transit',   label: 'In transit', Icon: Truck      },
    { key: 'delivered', label: 'Delivered',  Icon: HouseLine  },
  ]
  const lineColor = theme?.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)'
  const fillColor = theme?.primary || '#557755'
  const muted     = theme?.textLight || theme?.text

  return (
    <div className="mt-3 mb-0.5" aria-label="Order status progress">
      <div className="flex items-start w-full">
        {steps.map((st, idx) => {
          const n            = idx + 1
          const complete     = step >= n
          const lineComplete = step > n
          const StepIcon     = st.Icon
          return (
            <React.Fragment key={st.key}>
              <div className="flex flex-col items-center w-[4.5rem] sm:w-24 shrink-0">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full border-2 transition-colors duration-200"
                  style={{
                    borderColor:     complete ? fillColor : lineColor,
                    backgroundColor: complete ? `${fillColor}22` : 'transparent',
                    color:           complete ? (theme?.primaryDark || theme?.text) : muted,
                  }}
                >
                  <StepIcon size={20} weight="duotone" aria-hidden style={{ opacity: complete ? 1 : 0.35 }} />
                </div>
                <span
                  className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-center leading-tight px-0.5"
                  style={{ color: complete ? theme?.text : muted, opacity: complete ? 1 : 0.65 }}
                >
                  {st.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className="flex-1 flex items-center pt-[17px] px-0.5 min-w-[8px]">
                  <div
                    className="h-0.5 w-full rounded-full"
                    style={{ backgroundColor: lineComplete ? fillColor : lineColor, opacity: lineComplete ? 0.85 : 1 }}
                    aria-hidden
                  />
                </div>
              )}
            </React.Fragment>
          )
        })}
      </div>
      {isDelayed && (
        <p className="text-center text-[10px] font-semibold mt-1.5" style={{ color: theme?.isDark ? '#fca5a5' : '#dc2626' }}>
          Delayed
        </p>
      )}
    </div>
  )
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS_META = [
  { key: 'placed',    label: 'Order Placed', Icon: CreditCard, burstVariant: 'coin', burstColor: '#f59e0b', img: imgPlaced    },
  { key: 'transit',   label: 'In Transit',   Icon: Truck,      burstVariant: 'star', burstColor: '#3b82f6', img: imgInTransit },
  { key: 'delivered', label: 'Delivered',    Icon: Package,    burstVariant: 'star', burstColor: '#10b981', img: imgDelivered },
]

/** Status illustrations for dashboard card overlay (index = step - 1) */
export const ORDER_STATUS_ILLUSTRATIONS = STEPS_META.map((s) => ({
  key: s.key,
  label: s.label,
  img: s.img,
}))

// ─── Vertical two-column layout ───────────────────────────────────────────────

export default function OrderStatusProgress({
  step        = 1,
  theme,
  isDelayed   = false,
  animate     = false,
  vertical    = false,
  placedDate,
  deliveredDate,
  orderName,
  vendor,
  /** When false, only the timeline renders — illustration lives on the parent card */
  showIllustration = true,
}) {
  useEffect(() => { if (animate || vertical) injectAnimStyles() }, [])  // eslint-disable-line

  const lineColor = theme?.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.09)'
  const fillColor = theme?.primary || '#557755'
  const muted     = theme?.textLight || theme?.text

  // playCount drives animations — bump it to replay
  const rootRef   = useRef(null)
  const [playCount, setPlayCount] = useState(0)
  const [revealed,  setRevealed]  = useState(!animate || !vertical)
  const [showTruck, setShowTruck] = useState(false)
  const [burstKey,  setBurstKey]  = useState(0)
  const hasPlayedRef = useRef(false)

  const runAnimation = useCallback(() => {
    // Reset visuals first, then reveal on next frame
    setRevealed(false)
    setShowTruck(false)
    setBurstKey(k => k + 1)

    requestAnimationFrame(() => {
      setTimeout(() => {
        setRevealed(true)
        if (step === 2) {
          setShowTruck(true)
          setTimeout(() => setShowTruck(false), 2100)
        }
      }, 30)
    })
  }, [step])

  // Trigger animation whenever playCount increments
  useEffect(() => {
    if (playCount === 0) return
    runAnimation()
  }, [playCount]) // eslint-disable-line

  // IntersectionObserver — fires once on first scroll-into-view
  useEffect(() => {
    if (!animate || !vertical) return
    const el = rootRef.current
    if (!el) return

    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasPlayedRef.current) {
          hasPlayedRef.current = true
          setPlayCount(c => c + 1)
        }
      },
      { threshold: 0.25 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [animate, vertical])

  const stepDates = [placedDate, null, deliveredDate]

  if (!vertical) {
    return <HorizontalProgress step={step} theme={theme} isDelayed={isDelayed} />
  }

  const activeMeta = STEPS_META[step - 1] || STEPS_META[0]

  return (
    <div ref={rootRef} className="relative pt-0 pb-0 w-full" aria-label="Order status progress">
      {/* Timeline (+ optional embedded illustration) */}
      <div className={`relative flex items-end gap-4 w-full ${showIllustration ? 'justify-between' : 'justify-start'}`}>

        {/* ── Timeline column ── */}
        <div className={`flex flex-col min-w-0 justify-start ${showIllustration ? 'flex-1' : 'w-full max-w-[200px]'}`}>
          {STEPS_META.map((st, idx) => {
            const n        = idx + 1
            const complete = step >= n
            const active   = step === n
            const isLast   = idx === STEPS_META.length - 1
            const StepIcon = st.Icon

            const nodeColor = complete ? fillColor : lineColor
            const nodeBg    = complete
              ? `${fillColor}20`
              : theme?.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)'
            const textColor = complete ? theme?.text : muted
            const animDelay = `${idx * 0.13}s`

            return (
              <div
                key={st.key}
                className="flex"
                style={{
                  opacity:    revealed ? 1 : 0,
                  transform:  revealed ? 'translateX(0)' : 'translateX(-8px)',
                  transition: `opacity 0.32s ease ${animDelay}, transform 0.32s ease ${animDelay}`,
                }}
              >
                {/* Dot + connector */}
                <div className="flex flex-col items-center flex-shrink-0" style={{ width: 48 }}>
                  <div className="relative flex items-center justify-center" style={{ width: 44, height: 44 }}>
                    {active && animate && revealed && (
                      <span
                        style={{
                          position: 'absolute', inset: 0, borderRadius: '50%',
                          border: `2px solid ${fillColor}`,
                          animation: 'osp-pulse-ring 1.9s ease-out infinite',
                        }}
                      />
                    )}
                    <div
                      className="flex items-center justify-center rounded-full border-2"
                      style={{
                        width: active ? 40 : 36, height: active ? 40 : 36,
                        borderColor: nodeColor, backgroundColor: nodeBg,
                        transition: 'all 0.3s ease', zIndex: 1,
                      }}
                    >
                      <StepIcon
                        size={active ? 22 : 18}
                        weight="duotone"
                        style={{ color: complete ? fillColor : muted, opacity: complete ? 1 : 0.45, transition: 'all 0.3s ease' }}
                        aria-hidden
                      />
                    </div>
                    {active && animate && revealed && (
                      <SparklesBurst key={`burst-${burstKey}-${idx}`} color={st.burstColor} variant={st.burstVariant} />
                    )}
                  </div>

                  {!isLast && (
                    <div style={{ width: 2, flex: 1, minHeight: 28, backgroundColor: lineColor, borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
                      {complete && (
                        <div style={{
                          position: 'absolute', inset: 0, backgroundColor: fillColor, opacity: 0.8,
                          transformOrigin: 'top',
                          transform: revealed ? 'scaleY(1)' : 'scaleY(0)',
                          transition: `transform 0.48s cubic-bezier(0.4,0,0.2,1) ${0.08 + idx * 0.18}s`,
                          borderRadius: 2,
                        }} aria-hidden />
                      )}
                      {animate && idx === 0 && showTruck && (
                        <div style={{
                          position: 'absolute', left: '50%',
                          transform: 'translateX(-50%) rotate(90deg)',
                          animation: 'osp-truck-slide 2s ease-in-out forwards',
                          zIndex: 5, color: fillColor,
                          filter: `drop-shadow(0 0 3px ${fillColor}88)`,
                        }} aria-hidden>
                          <Truck size={12} weight="fill" />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 flex flex-col justify-start min-w-0" style={{ paddingLeft: 10, paddingBottom: isLast ? 0 : 16, paddingTop: 6 }}>
                  <span style={{
                    fontSize: 13, fontWeight: active ? 700 : complete ? 600 : 500,
                    color: complete ? textColor : muted, opacity: complete ? 1 : 0.55, lineHeight: 1.25,
                  }}>
                    {st.label}
                  </span>
                  {stepDates[idx] && (
                    <span style={{ fontSize: 11, marginTop: 2, color: muted, opacity: 0.8 }}>
                      {stepDates[idx]}
                    </span>
                  )}
                  {active && !stepDates[idx] && (
                    <span style={{ fontSize: 11, marginTop: 2, color: fillColor, opacity: 0.85, fontWeight: 600 }}>
                      {idx === 1 ? 'En route' : 'Processing…'}
                    </span>
                  )}
                  {active && isDelayed && (
                    <span style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: theme?.isDark ? '#fca5a5' : '#dc2626' }}>
                      Delayed
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Optional embedded illustration (Orders list / non-card contexts) ── */}
        {showIllustration && (
        <div className="flex-1 min-w-0 flex items-end justify-center self-end">
          <div
            className="relative mx-auto"
            style={{
              width: 168,
              height: 168,
              marginBottom: -12,
              opacity: revealed ? 1 : 0,
              transform: revealed ? 'scale(1) translateY(0)' : 'scale(0.75) translateY(8px)',
              transition: 'opacity 0.5s ease 0.25s, transform 0.5s cubic-bezier(0.34,1.56,0.64,1) 0.25s',
            }}
          >
            {(orderName || vendor) && (
              <div
                className="absolute top-0 left-0 right-0 z-10 px-1.5 pt-1.5 text-center pointer-events-none"
                style={{
                  background: `linear-gradient(to bottom, ${
                    theme?.isDark ? 'rgba(20,28,22,0.78)' : 'rgba(255,255,255,0.92)'
                  } 50%, transparent)`,
                  paddingBottom: 28,
                }}
              >
                {orderName && (
                  <div
                    className="text-[13px] font-bold leading-snug"
                    style={{ color: theme?.isDark ? 'rgba(200,215,195,0.98)' : theme?.primary }}
                  >
                    {orderName}
                  </div>
                )}
                {vendor && (
                  <div className="text-[11px] mt-1" style={{ color: muted, opacity: 0.9 }}>
                    {vendor}
                  </div>
                )}
              </div>
            )}

            <img
              src={activeMeta.img}
              alt={activeMeta.label}
              className="block w-full h-full"
              style={{
                objectFit: 'contain',
                objectPosition: 'center bottom',
                paddingTop: 36,
              }}
            />
          </div>
        </div>
        )}

      </div>
    </div>
  )
}
