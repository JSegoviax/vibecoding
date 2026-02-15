import { useState, useRef, useEffect, type ReactNode } from 'react'

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

  const zoomIn = () => setZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP))
  const zoomOut = () => setZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP))
  const zoomReset = () => setZoom(1)

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...style,
        overflow: 'auto',
        position: 'relative',
      }}
    >
      {!boardSize ? (
        children
      ) : (
        <div
          style={{
            width: boardSize.width * zoom,
            height: boardSize.height * zoom,
            minWidth: '100%',
            minHeight: '100%',
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
