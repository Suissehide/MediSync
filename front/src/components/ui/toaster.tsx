import { AlertTriangle, Check, Info, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { TOAST_SEVERITY } from '../../constants/ui.constant.ts'
import { useToast } from '../../hooks/useToast.ts'
import { cn } from '../../libs/utils.ts'
import type { ToasterToast } from '../../store/useToastStore.ts'
import { useToastStore } from '../../store/useToastStore.ts'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  toastProgressVariants,
} from './toast.tsx'

type ToastVariant = 'default' | 'destructive' | 'warning' | 'info' | 'success'

// How many px each stacked toast peeks above the one in front
const PEEK_SIZE = 10
// Scale and opacity reduction per stacked level
const SCALE_STEP = 0.04
const OPACITY_STEP = 0.15
const MAX_VISIBLE = 3

function getVariantFromSeverity(severity?: string): ToastVariant {
  switch (severity) {
    case TOAST_SEVERITY.SUCCESS:
      return 'success'
    case TOAST_SEVERITY.ERROR:
      return 'destructive'
    case TOAST_SEVERITY.WARNING:
      return 'warning'
    case TOAST_SEVERITY.INFO:
      return 'info'
    default:
      return 'default'
  }
}

function getIconFromSeverity(severity?: string) {
  switch (severity) {
    case TOAST_SEVERITY.SUCCESS:
      return (
        <Check className="w-3.5 h-3.5 text-emerald-500" strokeWidth={2.5} />
      )
    case TOAST_SEVERITY.ERROR:
      return <X className="w-3.5 h-3.5 text-red-500" strokeWidth={2.5} />
    case TOAST_SEVERITY.WARNING:
      return (
        <AlertTriangle
          className="w-3.5 h-3.5 text-yellow-500"
          strokeWidth={2.5}
        />
      )
    case TOAST_SEVERITY.INFO:
      return <Info className="w-3.5 h-3.5 text-blue-500" strokeWidth={2.5} />
    default:
      return null
  }
}

function ToastItem({
  id,
  title,
  message,
  severity,
  action,
  duration,
  onHeightChange,
}: ToasterToast & { onHeightChange?: (height: number) => void }) {
  const [progress, setProgress] = useState(100)
  const variant = getVariantFromSeverity(severity)
  const icon = getIconFromSeverity(severity)
  const itemRef = useRef<HTMLDivElement>(null)
  const removeToast = useToastStore((state) => state.removeToast)

  // Measure height for stacking calculations
  useEffect(() => {
    const el = itemRef.current
    if (!el || !onHeightChange) {
      return
    }
    const ro = new ResizeObserver(([entry]) => {
      onHeightChange(entry.contentRect.height)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [onHeightChange])

  // Auto-dismiss timer + progress bar
  useEffect(() => {
    if (!duration) {
      return
    }
    const startTime = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime
      const next = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(next)
      if (next <= 0) {
        clearInterval(interval)
        removeToast(id)
      }
    }, 16)
    return () => clearInterval(interval)
  }, [duration, id, removeToast])

  return (
    <div ref={itemRef}>
      <Toast variant={variant}>
        <div className="p-3.5 flex items-center gap-2.5">
          {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {title && (
                <ToastTitle className="flex-1 min-w-0">{title}</ToastTitle>
              )}
              {action}
              <ToastClose onClick={() => removeToast(id)} />
            </div>
            {message && <ToastDescription>{message}</ToastDescription>}
          </div>
        </div>
        <div className="relative h-0.5 w-full overflow-hidden bg-border/40">
          <div
            className={cn(toastProgressVariants({ variant }))}
            style={{ transform: `translateX(-${100 - progress}%)` }}
          />
        </div>
      </Toast>
    </div>
  )
}

export function Toaster() {
  const { toasts } = useToast()
  const [expanded, setExpanded] = useState(false)
  const [heights, setHeights] = useState<Record<string, number>>({})

  const visible = toasts.slice(0, MAX_VISIBLE)
  const hasMultiple = visible.length > 1

  const handleHeightChange = useCallback((id: string, height: number) => {
    setHeights((prev) =>
      prev[id] === height ? prev : { ...prev, [id]: height },
    )
  }, [])

  // Clean up heights for toasts that have been removed
  useEffect(() => {
    const ids = new Set(toasts.map((t) => t.id))
    setHeights((prev) => {
      const next = { ...prev }
      let changed = false
      for (const id of Object.keys(next)) {
        if (!ids.has(id)) {
          delete next[id]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [toasts])

  // Bottom offset for each toast in expanded mode
  const getBottomOffset = (domIndex: number) => {
    if (!expanded) {
      return 0
    }
    return visible
      .slice(0, domIndex)
      .reduce((sum, t) => sum + (heights[t.id] ?? 72) + 8, 0)
  }

  const newestHeight = heights[visible[0]?.id ?? ''] ?? 72
  const collapsedHeight = newestHeight + PEEK_SIZE * (visible.length - 1)
  const expandedHeight =
    visible.reduce((sum, t) => sum + (heights[t.id] ?? 72) + 8, 0) - 8

  const containerHeight = hasMultiple
    ? expanded
      ? expandedHeight
      : collapsedHeight
    : newestHeight

  return (
    <ToastProvider>
      <button
        type="button"
        className="fixed bottom-4 right-4 z-[999] w-full sm:max-w-[400px]"
        onMouseEnter={() => hasMultiple && setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div
          className="relative transition-[height] duration-300 ease-in-out"
          style={{ height: containerHeight }}
        >
          {visible.map((toast, domIndex) => {
            const isNewest = domIndex === 0
            const bottom = getBottomOffset(domIndex)
            // In collapsed: pull older toasts up with translateY
            const translateY = expanded ? 0 : -(domIndex * PEEK_SIZE)
            const scale = expanded ? 1 : 1 - domIndex * SCALE_STEP
            const opacity = expanded ? 1 : 1 - domIndex * OPACITY_STEP

            return (
              <div
                key={toast.id}
                className="absolute right-0 left-0"
                style={{
                  bottom,
                  transform: `translateY(${translateY}px) scale(${scale})`,
                  transformOrigin: 'bottom center',
                  opacity,
                  zIndex: visible.length - domIndex,
                  // Only newest is interactive in collapsed mode
                  pointerEvents: expanded || isNewest ? 'auto' : 'none',
                  transition:
                    'transform 300ms ease-in-out, opacity 300ms ease-in-out, bottom 300ms ease-in-out',
                }}
              >
                <ToastItem
                  {...toast}
                  onHeightChange={(h) => handleHeightChange(toast.id, h)}
                />
              </div>
            )
          })}
        </div>
      </button>
    </ToastProvider>
  )
}
