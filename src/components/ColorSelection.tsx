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

interface ColorSelectionProps {
  numPlayers: 1 | 2 | 3 | 4
  onColorsSelected: (selectedColors: string[]) => void
}

export function ColorSelection({ numPlayers, onColorsSelected }: ColorSelectionProps) {
  const [selectedColors, setSelectedColors] = useState<string[]>([])
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)

  const handleColorSelect = (colorId: string) => {
    if (selectedColors.includes(colorId)) return // Color already selected
    
    const newSelected = [...selectedColors, colorId]
    setSelectedColors(newSelected)
    
    if (currentPlayerIndex < numPlayers - 1) {
      // Move to next player
      setCurrentPlayerIndex(currentPlayerIndex + 1)
    } else {
      // All players have selected, start the game
      onColorsSelected(newSelected)
    }
  }

  const availableColors = AVAILABLE_COLORS.filter(c => !selectedColors.includes(c.id))

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'linear-gradient(135deg, #1a1f2e 0%, #2d3748 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
      padding: 20,
    }}>
      <div style={{
        background: 'var(--surface)',
        borderRadius: 16,
        padding: 32,
        maxWidth: 600,
        width: '100%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <h1 style={{
          fontSize: 28,
          fontWeight: 'bold',
          color: 'var(--text)',
          marginBottom: 8,
          textAlign: 'center',
        }}>
          Choose Your Color
        </h1>
        <p style={{
          fontSize: 16,
          color: 'var(--muted)',
          marginBottom: 24,
          textAlign: 'center',
        }}>
          Player {currentPlayerIndex + 1} of {numPlayers}
        </p>

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
                background: 'var(--surface)',
                border: '2px solid var(--muted)',
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
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.transform = 'scale(1.05)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--muted)'
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
                color: 'var(--text)',
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
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
          }}>
            <div style={{
              fontSize: 12,
              color: 'var(--muted)',
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
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: 6,
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
                      color: 'var(--text)',
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
