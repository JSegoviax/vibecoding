import { useState } from 'react'

export interface PlayerColor {
  id: string
  name: string
  image: string
  hexColor: string // For UI display/fallback
}

export const AVAILABLE_COLORS: PlayerColor[] = [
  { id: 'teal', name: 'Teal', image: '/player-teal.png', hexColor: '#4dd0e1' },
  { id: 'green', name: 'Green', image: '/player-green.png', hexColor: '#66bb6a' },
  { id: 'green2', name: 'Forest Green', image: '/player-green2.png', hexColor: '#43a047' },
  { id: 'pink', name: 'Pink', image: '/player-pink.png', hexColor: '#f06292' },
  { id: 'purple', name: 'Purple', image: '/player-purple.png', hexColor: '#ab47bc' },
  { id: 'white', name: 'White', image: '/player-white.png', hexColor: '#ffffff' },
]

export interface GameStartOptions {
  oregonsOmens?: boolean
}

interface ColorSelectionProps {
  numPlayers: 1 | 2 | 3 | 4
  onColorsSelected: (selectedColors: string[], options?: GameStartOptions) => void
  onBack?: () => void
  /** When true, player 1 is human and 2+ are AI; title shows "Choose Player N's color" for AI */
  isVsAIMode?: boolean
}

export function ColorSelection({ numPlayers, onColorsSelected, onBack, isVsAIMode }: ColorSelectionProps) {
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
  const [oregonsOmens, setOregonsOmens] = useState(false)

  const handleColorSelect = (colorId: string) => {
    if (selectedColors.includes(colorId)) return // Color already selected
    
    const newSelected = [...selectedColors, colorId]
    setSelectedColors(newSelected)
    
    if (currentPlayerIndex < numPlayers - 1) {
      // Move to next player
      setCurrentPlayerIndex(currentPlayerIndex + 1)
    } else {
      // All players have selected, start the game
      onColorsSelected(newSelected, { oregonsOmens })
    }
  }

  const availableColors = AVAILABLE_COLORS.filter(c => !selectedColors.includes(c.id))

  return (
    <div
      className="parchment-page color-picker-screen"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        maxWidth: '100vw',
        boxSizing: 'border-box',
        background: 'var(--parchment-bg, #F6EEE3)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20,
        overflow: 'auto',
        overflowX: 'hidden',
      }}
    >
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to previous step"
          className="color-picker-back-btn"
          style={{
            position: 'fixed',
            top: 20,
            left: 20,
            zIndex: 10002,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--ink, #2A1A0A)',
            background: 'var(--parchment-section, #EEE7D7)',
            border: '1px solid var(--paper-border, #D9BDA5)',
            borderRadius: 8,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        >
          ← Back
        </button>
      )}
      <div
        className="paper-section color-picker-card"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 560,
          minHeight: 400,
          flexShrink: 0,
          flexGrow: 0,
          boxSizing: 'border-box',
          overflow: 'visible',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 16,
          marginLeft: 'auto',
          marginRight: 'auto',
          alignSelf: 'center',
        }}
      >
        <div className="color-picker-content" style={{ width: '100%', maxWidth: 320, marginLeft: 'auto', marginRight: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 style={{
          fontSize: 'clamp(1.25rem, 5vw, 28px)',
          fontWeight: 'bold',
          color: 'var(--ink, #2A1A0A)',
          marginBottom: 8,
          marginTop: 0,
          textAlign: 'center',
          fontFamily: '"Old Standard TT", Georgia, "Times New Roman", serif',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          wordWrap: 'break-word',
          overflowWrap: 'break-word',
          paddingLeft: 24,
          paddingRight: 24,
        }}>
          {isVsAIMode && currentPlayerIndex >= 1
            ? `Choose Player ${currentPlayerIndex + 1}'s Color`
            : 'Choose Your Color'}
        </h1>
        <p style={{
          fontSize: 16,
          color: 'var(--ink, #2A1A0A)',
          opacity: 0.85,
          marginBottom: 24,
          textAlign: 'center',
        }}>
          {isVsAIMode && currentPlayerIndex >= 1
            ? `AI Player ${currentPlayerIndex + 1} of ${numPlayers}`
            : `Player ${currentPlayerIndex + 1} of ${numPlayers}`}
        </p>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          marginBottom: 20,
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--ink, #2A1A0A)',
          opacity: 0.9,
        }}>
          <input
            type="checkbox"
            checked={oregonsOmens}
            onChange={(e) => setOregonsOmens(e.target.checked)}
            style={{ width: 18, height: 18 }}
          />
          Play with Oregon&apos;s Omens
        </label>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 24,
          width: '100%',
          maxWidth: 320,
        }}>
          {availableColors.map(color => (
            <button
              key={color.id}
              type="button"
              onClick={() => handleColorSelect(color.id)}
              style={{
                background: 'var(--parchment-section, #EEE7D7)',
                border: '2px solid var(--paper-border, #D9BDA5)',
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s',
                color: 'var(--ink, #2A1A0A)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--cta, #C17D5B)'
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--paper-border, #D9BDA5)'
                e.currentTarget.style.transform = 'scale(1)'
              }}
            >
              <img
                src={color.image}
                alt={color.name}
                style={{
                  width: 64,
                  height: 64,
                  imageRendering: 'pixelated',
                  objectFit: 'contain',
                }}
              />
              <span style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--ink)',
              }}>
                {color.name}
              </span>
            </button>
          ))}
        </div>

        {selectedColors.length > 0 && (
          <div style={{
            marginTop: 24,
            padding: 16,
            background: 'rgba(42, 26, 10, 0.08)',
            border: '1px solid var(--paper-border, #D9BDA5)',
            borderRadius: 8,
            width: '100%',
            boxSizing: 'border-box',
          }}>
            <div style={{
              fontSize: 12,
              color: 'var(--ink, #2A1A0A)',
              opacity: 0.8,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              textAlign: 'center',
            }}>
              Selected Colors:
            </div>
            <div style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
            }}>
              {selectedColors.map((colorId, idx) => {
                const color = AVAILABLE_COLORS.find(c => c.id === colorId)!
                return (
                  <div
                    key={colorId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 8px',
                      background: 'rgba(42, 26, 10, 0.06)',
                      borderRadius: 6,
                      border: '1px solid var(--paper-border, #D9BDA5)',
                    }}
                  >
                    <img
                      src={color.image}
                      alt={color.name}
                      style={{
                        width: 20,
                        height: 20,
                        imageRendering: 'pixelated',
                        objectFit: 'contain',
                      }}
                    />
                    <span style={{
                      fontSize: 12,
                      color: 'var(--ink, #2A1A0A)',
                      opacity: 0.9,
                    }}>
                      Player {idx + 1}: {color.name}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
