import { useEffect, useState } from 'react'

interface DiceRollAnimationProps {
  dice1: number
  dice2: number
  onComplete: () => void
}

export function DiceRollAnimation({ dice1, dice2, onComplete }: DiceRollAnimationProps) {
  const [rolling, setRolling] = useState(true)
  const [movedToCorner, setMovedToCorner] = useState(false)
  const [displayDice1, setDisplayDice1] = useState(1)
  const [displayDice2, setDisplayDice2] = useState(1)

  const dotSize = 8

  useEffect(() => {
    // Reset states when new dice values come in (new roll starting)
    setRolling(true)
    setMovedToCorner(false)
    
    // Animate dice rolling for 2 seconds (slower animation)
    const rollDuration = 2000
    const startTime = Date.now()
    
    const interval = setInterval(() => {
      // Randomly change dice faces during animation
      setDisplayDice1(1 + Math.floor(Math.random() * 6))
      setDisplayDice2(1 + Math.floor(Math.random() * 6))
      
      if (Date.now() - startTime >= rollDuration) {
        clearInterval(interval)
        // Show final values
        setDisplayDice1(dice1)
        setDisplayDice2(dice2)
        setRolling(false)
        // Move to corner after showing final result for 1.5 seconds
        setTimeout(() => {
          setMovedToCorner(true)
          // Call onComplete after moving to corner
          setTimeout(() => {
            onComplete()
          }, 500) // Small delay for the move animation
        }, 1500)
      }
    }, 150) // Update every 150ms for slower, smoother animation

    return () => clearInterval(interval)
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
    <div
      className={movedToCorner ? 'dice-in-corner' : 'dice-in-center'}
      style={{
        position: 'absolute',
        zIndex: 9999,
        display: 'flex',
        gap: 20,
        alignItems: 'center',
        pointerEvents: 'none',
        isolation: 'isolate',
      }}
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
          top: 20px;
          right: 20px;
          left: auto;
          transform: translate(0, 0);
          transition: top 0.5s ease-out, left 0.5s ease-out, right 0.5s ease-out, transform 0.5s ease-out;
        }
      `}</style>
    </div>
  )
}
