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
}

export function ColorSelection({ numPlayers, onColorsSelected, onBack }: ColorSelectionProps) {
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
      className="parchment-page"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--parchment-bg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20,
      }}
    >
      <div
        className="paper-section"
        style={{
          position: 'relative',
          maxWidth: 600,
          width: '100%',
        }}
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to homepage"
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--ink)',
              background: 'transparent',
              border: '1px solid var(--paper-border)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            ← Back
          </button>
        )}
        <h1 style={{
          fontSize: 28,
          fontWeight: 'bold',
          color: 'var(--ink)',
          marginBottom: 8,
          textAlign: 'center',
          fontFamily: '"Old Standard TT", Georgia, "Times New Roman", serif',
          textTransform: 'uppercase',
          letterSpacing: '2px',
        }}>
          Choose Your Color
        </h1>
        <p style={{
          fontSize: 16,
          color: 'var(--ink)',
          opacity: 0.85,
          marginBottom: 24,
          textAlign: 'center',
        }}>
          Player {currentPlayerIndex + 1} of {numPlayers}
        </p>

        <label style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 20,
          cursor: 'pointer',
          fontSize: 14,
          color: 'var(--ink)',
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
        }}>
          {availableColors.map(color => (
            <button
              key={color.id}
              onClick={() => handleColorSelect(color.id)}
              style={{
                background: 'var(--parchment-section)',
                border: '2px solid var(--paper-border)',
                borderRadius: 12,
                padding: 16,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--cta)'
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--paper-border)'
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
            border: '1px solid var(--paper-border)',
            borderRadius: 8,
          }}>
            <div style={{
              fontSize: 12,
              color: 'var(--ink)',
              opacity: 0.8,
              marginBottom: 8,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
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
                      border: '1px solid var(--paper-border)',
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
                      color: 'var(--ink)',
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
  )
}
