import { useEffect, useRef, useState } from 'react'

interface DiceRollAnimationProps {
  dice1: number
  dice2: number
  onComplete: () => void
  /** When false, tap-anywhere overlay is hidden (e.g. in PvP only the roller may stop). Default true for single-player / AI. */
  allowTapToStop?: boolean
}

export function DiceRollAnimation({ dice1, dice2, onComplete, allowTapToStop = true }: DiceRollAnimationProps) {
  const [rolling, setRolling] = useState(true)
  const [movedToCorner, setMovedToCorner] = useState(false)
  const [displayDice1, setDisplayDice1] = useState(1)
  const [displayDice2, setDisplayDice2] = useState(1)

  const timersRef = useRef<{ interval: ReturnType<typeof setInterval> | null; t1: ReturnType<typeof setTimeout> | null; t2: ReturnType<typeof setTimeout> | null }>({ interval: null, t1: null, t2: null })

  const dotSize = 8

  const stopAndShowResult = (moveDelayMs: number) => {
    const t = timersRef.current
    if (t.interval) {
      clearInterval(t.interval)
      t.interval = null
    }
    if (t.t1) {
      clearTimeout(t.t1)
      t.t1 = null
    }
    if (t.t2) {
      clearTimeout(t.t2)
      t.t2 = null
    }
    setDisplayDice1(dice1)
    setDisplayDice2(dice2)
    setRolling(false)
    t.t1 = setTimeout(() => {
      t.t1 = null
      setMovedToCorner(true)
      const t2 = setTimeout(() => {
        t.t2 = null
        onComplete()
      }, 500)
      t.t2 = t2
    }, moveDelayMs)
  }

  const handleTapToStop = () => {
    if (!rolling) return
    stopAndShowResult(400) // Short delay after tap so they see the number, then move to corner
  }

  useEffect(() => {
    // Reset states when new dice values come in (new roll starting)
    setRolling(true)
    setMovedToCorner(false)

    const rollDuration = 2000
    const startTime = Date.now()

    const interval = setInterval(() => {
      setDisplayDice1(1 + Math.floor(Math.random() * 6))
      setDisplayDice2(1 + Math.floor(Math.random() * 6))

      if (Date.now() - startTime >= rollDuration) {
        timersRef.current.interval = null
        clearInterval(interval)
        setDisplayDice1(dice1)
        setDisplayDice2(dice2)
        setRolling(false)
        const t1 = setTimeout(() => {
          timersRef.current.t1 = null
          setMovedToCorner(true)
          const t2 = setTimeout(() => {
            timersRef.current.t2 = null
            onComplete()
          }, 500)
          timersRef.current.t2 = t2
        }, 1500)
        timersRef.current.t1 = t1
      }
    }, 150)

    timersRef.current.interval = interval

    return () => {
      if (timersRef.current.interval) clearInterval(timersRef.current.interval)
      if (timersRef.current.t1) clearTimeout(timersRef.current.t1)
      if (timersRef.current.t2) clearTimeout(timersRef.current.t2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dice1, dice2])

  // Dice face SVG paths for each number (1-6)
  const getDiceDots = (value: number) => {
    const positions: Record<number, Array<{ cx: number; cy: number }>> = {
      1: [{ cx: 50, cy: 50 }],
      2: [{ cx: 30, cy: 30 }, { cx: 70, cy: 70 }],
      3: [{ cx: 30, cy: 30 }, { cx: 50, cy: 50 }, { cx: 70, cy: 70 }],
      4: [{ cx: 30, cy: 30 }, { cx: 70, cy: 30 }, { cx: 30, cy: 70 }, { cx: 70, cy: 70 }],
      5: [{ cx: 30, cy: 30 }, { cx: 70, cy: 30 }, { cx: 50, cy: 50 }, { cx: 30, cy: 70 }, { cx: 70, cy: 70 }],
      6: [{ cx: 30, cy: 30 }, { cx: 30, cy: 50 }, { cx: 30, cy: 70 }, { cx: 70, cy: 30 }, { cx: 70, cy: 50 }, { cx: 70, cy: 70 }],
    }
    return positions[value] || []
  }

  return (
    <>
      {rolling && allowTapToStop && (
        <div
          role="button"
          aria-label="Tap anywhere to stop dice"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 499,
            cursor: 'pointer',
          }}
          onClick={handleTapToStop}
        />
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label={rolling ? 'Tap to stop dice' : 'Dice result'}
        className={movedToCorner ? 'dice-in-corner' : 'dice-in-center'}
        style={{
          position: 'absolute',
          zIndex: 500,
          display: 'flex',
          gap: 20,
          alignItems: 'center',
          pointerEvents: 'auto',
          isolation: 'isolate',
          cursor: rolling ? 'pointer' : 'default',
        }}
        onClick={allowTapToStop ? handleTapToStop : undefined}
        onKeyDown={allowTapToStop ? (e) => { if (rolling && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); handleTapToStop() } } : undefined}
      >
      <div
        className={rolling ? 'dice-rolling-1' : 'dice-stopped'}
        style={{
          width: movedToCorner ? 60 : 80,
          height: movedToCorner ? 60 : 80,
          background: '#ffffff',
          borderRadius: 12,
          border: '3px solid #333',
          boxShadow: '0 8px 16px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'width 0.5s ease-out, height 0.5s ease-out',
        }}
      >
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ position: 'absolute' }}>
          {getDiceDots(displayDice1).map((dot, i) => (
            <circle key={i} cx={dot.cx} cy={dot.cy} r={dotSize} fill="#333" />
          ))}
        </svg>
      </div>
      
      <div
        className={rolling ? 'dice-rolling-2' : 'dice-stopped'}
        style={{
          width: movedToCorner ? 60 : 80,
          height: movedToCorner ? 60 : 80,
          background: '#ffffff',
          borderRadius: 12,
          border: '3px solid #333',
          boxShadow: '0 8px 16px rgba(0,0,0,0.3), inset 0 2px 4px rgba(255,255,255,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: 'width 0.5s ease-out, height 0.5s ease-out',
        }}
      >
        <svg width="100" height="100" viewBox="0 0 100 100" style={{ position: 'absolute' }}>
          {getDiceDots(displayDice2).map((dot, i) => (
            <circle key={i} cx={dot.cx} cy={dot.cy} r={dotSize} fill="#333" />
          ))}
        </svg>
      </div>

      <style>{`
        @keyframes diceRoll1 {
          0% { transform: rotate(0deg) translateY(0px) scale(1); }
          25% { transform: rotate(90deg) translateY(-10px) scale(1.05); }
          50% { transform: rotate(180deg) translateY(0px) scale(1); }
          75% { transform: rotate(270deg) translateY(-10px) scale(1.05); }
          100% { transform: rotate(360deg) translateY(0px) scale(1); }
        }
        @keyframes diceRoll2 {
          0% { transform: rotate(0deg) translateY(0px) scale(1); }
          25% { transform: rotate(-90deg) translateY(-10px) scale(1.05); }
          50% { transform: rotate(-180deg) translateY(0px) scale(1); }
          75% { transform: rotate(-270deg) translateY(-10px) scale(1.05); }
          100% { transform: rotate(-360deg) translateY(0px) scale(1); }
        }
        .dice-rolling-1 {
          animation: diceRoll1 0.25s infinite;
        }
        .dice-rolling-2 {
          animation: diceRoll2 0.25s infinite;
        }
        .dice-stopped {
          transform: rotate(0deg) scale(1);
          transition: transform 0.3s ease-out;
        }
        .dice-in-center {
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          transition: top 0.5s ease-out, left 0.5s ease-out, right 0.5s ease-out, transform 0.5s ease-out;
        }
        .dice-in-corner {
          bottom: 20px;
          left: 20px;
          top: auto;
          right: auto;
          transform: translate(0, 0);
          transition: top 0.5s ease-out, left 0.5s ease-out, right 0.5s ease-out, bottom 0.5s ease-out, transform 0.5s ease-out;
        }
      `}</style>
    </div>
    </>
  )
}
