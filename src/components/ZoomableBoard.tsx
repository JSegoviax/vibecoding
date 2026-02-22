import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react'

const MIN_ZOOM = 0.5
const MAX_ZOOM = 2
const ZOOM_STEP = 0.25

interface ZoomableBoardProps {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}

export function ZoomableBoard({ children, className, style }: ZoomableBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [boardSize, setBoardSize] = useState<{ width: number; height: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [isPanning, setIsPanning] = useState(false)
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = el
      if (clientWidth > 0 && clientHeight > 0) {
        setBoardSize({ width: clientWidth, height: clientHeight })
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // When zoom changes and content is larger than viewport, center the map so it's not off-center
  useEffect(() => {
    if (zoom <= 1 || !boardSize) return
    const el = containerRef.current
    if (!el) return
    const run = () => {
      const { scrollWidth, scrollHeight, clientWidth, clientHeight } = el
      const scrollLeft = Math.max(0, (scrollWidth - clientWidth) / 2)
      const scrollTop = Math.max(0, (scrollHeight - clientHeight) / 2)
      el.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'smooth' })
    }
    // Run after layout so scrollWidth/Height are updated
    const id = requestAnimationFrame(() => requestAnimationFrame(run))
    return () => cancelAnimationFrame(id)
  }, [zoom, boardSize])

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))
  const zoomReset = () => setZoom(1)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest?.('[data-zoom-controls]')) return
    // Don't capture when clicking interactive board elements (vertices, edges, hexes) so their onClick fires
    if ((e.target as HTMLElement).closest?.('[data-board-interactive]')) return
    const el = containerRef.current
    if (!el) return
    el.setPointerCapture(e.pointerId)
    setIsPanning(true)
    panStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: el.scrollLeft,
      scrollTop: el.scrollTop,
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const start = panStartRef.current
    if (!start) return
    e.preventDefault()
    const el = containerRef.current
    if (!el) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    el.scrollLeft = start.scrollLeft - dx
    el.scrollTop = start.scrollTop - dy
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = containerRef.current
    if (el) try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    panStartRef.current = null
    setIsPanning(false)
  }, [])

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    const el = containerRef.current
    if (el) try { el.releasePointerCapture(e.pointerId) } catch { /* ignore */ }
    panStartRef.current = null
    setIsPanning(false)
  }, [])

  return (
    <div
      ref={containerRef}
      className={`zoomable-board ${className ?? ''}`.trim()}
      style={{
        ...style,
        overflowX: 'auto',
        overflowY: 'auto',
        overflow: 'auto',
        position: 'relative',
        scrollBehavior: 'smooth',
        WebkitOverflowScrolling: 'touch',
        cursor: zoom > 1 ? (isPanning ? 'grabbing' : 'grab') : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerCancel}
      onPointerCancel={handlePointerCancel}
    >
      {!boardSize ? (
        <div style={{ touchAction: 'none' }}>{children}</div>
      ) : (
        <div
          style={{
            width: boardSize.width * zoom,
            height: boardSize.height * zoom,
            minWidth: boardSize.width * zoom,
            minHeight: boardSize.height * zoom,
            flexShrink: 0,
            touchAction: 'none',
          }}
        >
          <div
            style={{
              width: boardSize.width,
              height: boardSize.height,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
            }}
          >
            {children}
          </div>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          right: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(0,0,0,0.5)',
          borderRadius: 8,
          padding: '4px 6px',
          zIndex: 10,
        }}
        aria-label="Board zoom"
        data-zoom-controls
      >
        <button
          type="button"
          onClick={zoomOut}
          aria-label="Zoom out"
          style={{
            width: 32,
            height: 32,
            border: 'none',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            fontSize: 18,
            fontWeight: 600,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          −
        </button>
        <button
          type="button"
          onClick={zoomReset}
          aria-label="Reset zoom"
          style={{
            minWidth: 44,
            height: 32,
            border: 'none',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          type="button"
          onClick={zoomIn}
          aria-label="Zoom in"
          style={{
            width: 32,
            height: 32,
            border: 'none',
            borderRadius: 6,
            background: 'rgba(255,255,255,0.2)',
            color: '#fff',
            fontSize: 18,
            fontWeight: 600,
            cursor: 'pointer',
            lineHeight: 1,
          }}
        >
          +
        </button>
      </div>
    </div>
  )
}
