import React, { useState, useEffect } from 'react'
import { Truck, MapPin, ArrowsClockwise } from '@phosphor-icons/react'
import { useNavigate } from 'react-router-dom'
import { getCachedTrackingInfo, detectCarrier, getMockTrackingInfo } from '../../services/tracking'
import { formatMMDDYYYY } from '../../utils/date'
import OrderStatusProgress, { getOrderStatusStep } from '../orders/OrderStatusProgress'

export default function UpcomingOrderCard({ orders, order, theme, hideHeader = false }) {
  const navigate = useNavigate()
  const [trackingInfo, setTrackingInfo] = useState(null)
  const [isLoadingTracking, setIsLoadingTracking] = useState(false)
  const [trackingError, setTrackingError] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)

  // Use orders array if provided, otherwise fall back to single order prop
  const hasOrdersProp = orders !== undefined && orders !== null
  const ordersList = hasOrdersProp && Array.isArray(orders)
    ? orders
    : (order ? [order] : [])
  const currentOrder = ordersList[currentIndex] || null

  useEffect(() => {
    if (ordersList.length === 0) {
      setCurrentIndex(0)
    } else if (currentIndex >= ordersList.length) {
      setCurrentIndex(Math.max(0, ordersList.length - 1))
    }
  }, [ordersList.length, currentIndex])

  useEffect(() => {
    setTrackingInfo(null)
    setTrackingError(null)
  }, [currentOrder?.id])

  useEffect(() => {
    async function fetchTracking() {
      if (!currentOrder?.tracking) return

      const status = (currentOrder?.status || '').toLowerCase()
      const isDelivered = status.includes('delivered') || currentOrder?.deliveryDate
      if (isDelivered) return

      setIsLoadingTracking(true)
      setTrackingError(null)

      try {
        const carrier = detectCarrier(currentOrder.tracking)
        let tracking = await getCachedTrackingInfo(currentOrder.tracking, carrier)
        if (tracking?.hasError || tracking?.error) {
          tracking = getMockTrackingInfo(currentOrder.tracking)
        }
        if (tracking?.error) {
          setTrackingError(tracking.error)
        } else {
          setTrackingInfo(tracking)
        }
      } catch (error) {
        console.error('Tracking fetch error:', error)
        setTrackingError('Failed to load tracking information')
      } finally {
        setIsLoadingTracking(false)
      }
    }

    fetchTracking()
  }, [currentOrder?.tracking])

  useEffect(() => {
    const handleRefresh = (event) => {
      if (event.detail === currentOrder?.tracking) {
        if (currentOrder.tracking) {
          const cacheKey = `tracking_${currentOrder.tracking}`
          localStorage.removeItem(cacheKey)
          const fetchTracking = async () => {
            if (!currentOrder?.tracking) return

            setIsLoadingTracking(true)
            setTrackingError(null)

            try {
              const carrier = detectCarrier(currentOrder.tracking)
              let tracking = await getCachedTrackingInfo(currentOrder.tracking, carrier, false)
              if (tracking?.hasError || tracking?.error) {
                tracking = getMockTrackingInfo(currentOrder.tracking)
              }
              if (tracking?.error) {
                setTrackingError(tracking.error)
              } else {
                setTrackingInfo(tracking)
              }
            } catch (error) {
              console.error('Tracking refresh error:', error)
              setTrackingError('Failed to refresh tracking information')
            } finally {
              setIsLoadingTracking(false)
            }
          }
          fetchTracking()
        }
      }
    }

    window.addEventListener('refreshTracking', handleRefresh)
    return () => window.removeEventListener('refreshTracking', handleRefresh)
  }, [currentOrder?.tracking])

  if (!currentOrder) {
    return (
      <div className="p-4 rounded-xl content-card w-full" style={{ backgroundColor: 'transparent' }}>
        {!hideHeader && (
          <div className="px-3 py-2 border-b mb-3" style={{ borderColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.border }}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold" style={{ color: theme.text }}>
                Incoming Peptides
              </h3>
              <Truck size={18} style={{ color: theme.isDark ? 'rgba(200, 215, 195, 0.7)' : theme.primary }} />
            </div>
          </div>
        )}
        <p className="text-sm">No active orders.</p>
      </div>
    )
  }

  let displayStatus = currentOrder?.status || 'Order Placed'
  let statusDetail = ''

  const isRealTrackingData = trackingInfo && !trackingInfo.hasError && !trackingInfo.isMockData

  if (isRealTrackingData) {
    displayStatus = trackingInfo.status
    statusDetail = trackingInfo.statusDetail
  } else {
    const statusLower = (currentOrder?.status || '').toLowerCase()
    if (currentOrder?.deliveryDate || statusLower.includes('delivered')) {
      displayStatus = 'Delivered'
    } else if (statusLower.includes('ship') || statusLower.includes('transit') || statusLower.includes('in transit')) {
      displayStatus = currentOrder?.status || 'In Transit'
      statusDetail = 'Package in transit to destination'
    } else {
      displayStatus = currentOrder?.status || 'Order Placed'
    }
  }

  // Prefer tracking progress (0–2) when real; otherwise map status → 1–3 step
  const statusStep = isRealTrackingData && typeof trackingInfo.progress === 'number'
    ? Math.min(3, Math.max(1, trackingInfo.progress + 1))
    : getOrderStatusStep(displayStatus)

  const isDelayed = String(displayStatus || statusDetail || '').toLowerCase().includes('delay')

  const handleWidgetClick = (e) => {
    if (e.target.closest('a, button')) return
    if (currentOrder?.id) {
      navigate('/app/orders', { state: { openOrderId: currentOrder.id } })
    } else {
      navigate('/app/orders')
    }
  }

  return (
    <div
      className={`${hideHeader ? 'p-3' : 'p-4'} w-full h-full flex flex-col transition-all min-h-0 rounded-xl content-card`}
      style={{
        backgroundColor: 'transparent',
        borderColor: theme.border,
        cursor: currentOrder?.id ? 'pointer' : 'default',
      }}
      onClick={handleWidgetClick}
      onMouseEnter={(e) => {
        if (currentOrder?.id) {
          e.currentTarget.style.boxShadow = theme.isDark ? '0 4px 6px rgba(0, 0, 0, 0.3)' : '0 4px 6px rgba(0, 0, 0, 0.1)'
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      {!hideHeader && (
        <div
          className="px-3 py-2 border-b mb-3 flex-shrink-0"
          style={{ borderColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.border }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold" style={{ color: theme.text }}>
                Incoming Orders
              </h3>
              <Truck size={18} style={{ color: theme.primary }} />
            </div>
            {currentOrder?.tracking && (() => {
              const status = (currentOrder?.status || '').toLowerCase()
              const isDelivered = status.includes('delivered') || currentOrder?.deliveryDate
              if (isDelivered) return null

              return (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (currentOrder.tracking) {
                      setTrackingInfo(null)
                      window.dispatchEvent(new CustomEvent('refreshTracking', { detail: currentOrder.tracking }))
                    }
                  }}
                  disabled={isLoadingTracking}
                  className="p-1.5 rounded-md transition-all flex-shrink-0 relative z-20 flex items-center justify-center min-w-[32px] min-h-[32px]"
                  style={{
                    color: theme.primary,
                    cursor: isLoadingTracking ? 'not-allowed' : 'pointer',
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                  }}
                  title={isLoadingTracking ? 'Updating...' : 'Refresh Tracking'}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = theme.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <ArrowsClockwise
                    size={18}
                    weight="bold"
                    className={isLoadingTracking ? 'animate-spin' : ''}
                    style={{ color: theme.primary, display: 'block' }}
                  />
                </button>
              )
            })()}
          </div>
        </div>
      )}

      <div className="w-full flex flex-col mb-2 flex-shrink-0">
        {isRealTrackingData && trackingInfo.location && (() => {
          const status = (currentOrder?.status || '').toLowerCase()
          const isDelivered = status.includes('delivered') || currentOrder?.deliveryDate
          if (isDelivered) return null

          return (
            <div className="mb-2 text-center">
              <div className="text-xs flex items-center justify-center gap-1" style={{ color: theme.textLight }}>
                <MapPin size={10} />
                {[
                  trackingInfo.location.city,
                  trackingInfo.location.state,
                  trackingInfo.location.country,
                ].filter(Boolean).join(', ')}
              </div>
            </div>
          )
        })()}

        {currentOrder?.tracking && (() => {
          const status = (currentOrder?.status || '').toLowerCase()
          const isDelivered = status.includes('delivered') || currentOrder?.deliveryDate
          if (isDelivered) return null

          const detectedCarrier = detectCarrier(currentOrder.tracking)
          const carrierFromAPI = trackingInfo?.carrier && typeof trackingInfo.carrier === 'string' && trackingInfo.carrier.trim()
            ? trackingInfo.carrier.trim().toLowerCase()
            : null
          const carrierToUse = carrierFromAPI || detectedCarrier
          const carrierDisplay = carrierToUse ? carrierToUse.toUpperCase() : 'USPS'
          const googleTrackingUrl = `https://www.google.com/search?q=${encodeURIComponent(currentOrder.tracking + ' tracking')}`

          return (
            <div className="mb-2">
              <a
                href={googleTrackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded transition-all hover:opacity-80 break-all w-full"
                style={{
                  backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : theme.secondary,
                  color: theme.text,
                  border: theme.isDark ? 'none' : `1px solid ${theme.border}`,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <span style={{ color: theme.textLight, fontWeight: 500 }}>Tracking Number:</span>
                <span className="font-mono flex-1">{currentOrder.tracking}</span>
                <div
                  className="text-xs px-2 py-0.5 rounded flex-shrink-0"
                  style={{
                    backgroundColor: theme.isDark ? 'rgba(255,255,255,0.1)' : theme.primary + '20',
                    color: theme.isDark ? 'rgba(255,255,255,0.7)' : theme.primary,
                    fontWeight: 600,
                  }}
                >
                  {carrierDisplay}
                </div>
                {isLoadingTracking && (
                  <ArrowsClockwise size={12} className="animate-spin flex-shrink-0" style={{ color: theme.primary }} />
                )}
              </a>
            </div>
          )
        })()}

        {trackingError && (
          <div
            className="text-xs mt-1 mb-2 px-2 py-1 rounded"
            style={{ backgroundColor: theme.errorBg || '#fee2e2', color: theme.error || '#dc2626' }}
          >
            {trackingError}
          </div>
        )}
      </div>

      {/* Vertical timeline progress */}
      <div className="w-full flex-shrink-0 px-1 mt-1">
        <OrderStatusProgress
          step={statusStep}
          theme={theme}
          isDelayed={isDelayed}
          animate
          vertical
          placedDate={currentOrder?.date ? formatMMDDYYYY(currentOrder.date) : undefined}
          deliveredDate={currentOrder?.deliveryDate ? formatMMDDYYYY(currentOrder.deliveryDate) : undefined}
          orderName={currentOrder?.peptide ? `${currentOrder.peptide}${currentOrder?.mg ? ` ${currentOrder.mg}mg` : ''}` : undefined}
          vendor={currentOrder?.vendor || undefined}
        />
        {ordersList.length > 1 && (
          <div
            className="w-full flex items-center justify-center gap-1.5 pt-2 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {ordersList.map((_, idx) => (
              <button
                key={idx}
                type="button"
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx) }}
                className="rounded-full transition-all border-0 outline-none cursor-pointer"
                style={{
                  width: currentIndex === idx ? 10 : 6,
                  height: 6,
                  backgroundColor: currentIndex === idx
                    ? (theme.isDark ? '#7a8a72' : theme.primary)
                    : (theme.isDark ? 'rgba(255,255,255,0.25)' : theme.border),
                  minWidth: currentIndex === idx ? 10 : 6,
                }}
                title={`Order ${idx + 1} of ${ordersList.length}`}
                aria-label={`Order ${idx + 1} of ${ordersList.length}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
