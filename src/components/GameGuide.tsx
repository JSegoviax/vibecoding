import { useState, useEffect } from 'react'
import { trackEvent } from '../utils/analytics'

function shouldOpenGuideFromHash(): boolean {
  const hash = typeof window !== 'undefined' ? window.location.hash : ''
  if (!hash) return false
  if (hash === '#guide' || hash === '#game-guide') return true
  // Google "Read more" and similar links use text fragments like #:~:text=Game%20Guide
  if (hash.startsWith('#:~:text=') && /Guide/i.test(decodeURIComponent(hash))) return true
  return false
}

export function GameGuide() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (shouldOpenGuideFromHash()) {
      setIsOpen(true)
      if (window.location.hash !== '#guide') {
        window.history.replaceState(null, '', window.location.pathname + window.location.search + '#guide')
      }
    }
    const onHashChange = () => {
      if (shouldOpenGuideFromHash()) setIsOpen(true)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const handleOpen = () => {
    trackEvent('guide_opened', 'navigation', 'game_guide')
    setIsOpen(true)
  }

  const handleClose = () => {
    trackEvent('guide_closed', 'navigation', 'game_guide')
    setIsOpen(false)
    if (typeof window !== 'undefined' && (window.location.hash === '#guide' || window.location.hash === '#game-guide' || window.location.hash.startsWith('#:~:text='))) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }

  return (
    <>
      <button
        className="game-guide-btn"
        onClick={handleOpen}
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          padding: '10px 16px',
          borderRadius: 8,
          background: 'var(--accent)',
          border: 'none',
          color: '#fff',
          fontWeight: 'bold',
          cursor: 'pointer',
          fontSize: 14,
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        }}
      >
        📖 Game Guide
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
          onClick={handleClose}
        >
          <div
            className="game-guide-modal-content"
            style={{
              background: 'var(--surface)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 700,
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 'bold' }}>Game Rules</h2>
              <button
                type="button"
                className="game-guide-close"
                onClick={handleClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  fontSize: 24,
                  cursor: 'pointer',
                  color: 'var(--text)',
                  padding: '0 8px',
                  lineHeight: 1,
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <section>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 'bold', color: 'var(--accent)' }}>
                  Setup Phase
                </h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text)' }}>
                  Players take turns placing 2 settlements and 2 roads each. Place a settlement first, then a road connected to it. 
                  Settlements must be at least 2 edges apart from other settlements. On your second settlement placement, you receive 
                  one of each resource from the 3 surrounding hexes.
                </p>
              </section>

              <section>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 'bold', color: 'var(--accent)' }}>
                  Rolling the Dice
                </h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text)', marginBottom: 8 }}>
                  On your turn, you must roll the dice first. The dice roll determines resource distribution:
                </p>
                <ul style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, color: 'var(--text)' }}>
                  <li><strong>Numbers 2-12:</strong> Each player with a settlement or city on a hex with that number receives resources:
                    <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                      <li>1 resource per settlement</li>
                      <li>2 resources per city</li>
                    </ul>
                  </li>
                  <li><strong>Rolling a 7:</strong> The robber is activated! You must:
                    <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                      <li>Move the robber to any hex (except its current location)</li>
                      <li>If that hex has player structures, choose one player to rob</li>
                      <li>Steal one random resource from that player</li>
                      <li>No resources are distributed when a 7 is rolled</li>
                    </ul>
                  </li>
                </ul>
              </section>

              <section>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 'bold', color: 'var(--accent)' }}>
                  The Robber
                </h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text)', marginBottom: 8 }}>
                  When you roll a <strong>7</strong>, the robber is activated. No resources are distributed that turn. You must:
                </p>
                <ol style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, color: 'var(--text)' }}>
                  <li><strong>Move the robber:</strong> Click any hex on the board (except the hex where the robber currently sits). The robber must move to a different hex.</li>
                  <li><strong>Block production:</strong> The hex where the robber is placed does not produce resources for anyone until the robber moves again. If that hex’s number is rolled, no one with a settlement or city on it receives resources from that hex.</li>
                  <li><strong>Steal (if possible):</strong> If the new hex has settlements or cities belonging to other players, you must choose one of those players. You steal one random resource from their hand (you receive it, they lose it). If the chosen player has no resources, nothing is stolen. If only your own structures are on the hex—or no one’s—you just move the robber; you cannot rob yourself.</li>
                </ol>
                <p style={{ margin: '12px 0 0', lineHeight: 1.6, color: 'var(--text)' }}>
                  You must complete the robber move (and robbery, if applicable) before building or trading. The robber stays on the new hex until someone else rolls a 7 and moves it again.
                </p>
              </section>

              <section>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 'bold', color: 'var(--accent)' }}>
                  Building
                </h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text)', marginBottom: 8 }}>
                  After rolling dice, you can build structures (optional). Each player has a limited supply per game:
                </p>
                <ul style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, color: 'var(--text)' }}>
                  <li><strong>Roads:</strong> 15 per player. Costs 1 Wood + 1 Brick. Must connect to your existing road or settlement.</li>
                  <li><strong>Settlements:</strong> 5 per player. Costs 1 Wood + 1 Brick + 1 Sheep + 1 Wheat. Must be at least two road segments away from any other settlement or city (no building on adjacent intersections) and connected by your road.</li>
                  <li><strong>Cities:</strong> 4 per player. Costs 2 Wheat + 3 Ore. Upgrades an existing settlement (you get the settlement piece back). Provides 2 resources instead of 1.</li>
                </ul>
              </section>

              <section>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 'bold', color: 'var(--accent)' }}>
                  Trading
                </h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text)' }}>
                  You can trade resources with the bank at a 4:1 ratio. Give 4 of one resource type to receive 1 of another resource type.
                </p>
              </section>

              <section>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 'bold', color: 'var(--accent)' }}>
                  Longest Road
                </h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text)' }}>
                  The first player to build 6 or more connected roads receives the "Longest Road" card, worth 2 victory points. 
                  If another player builds a longer road, they take the card and the 2 victory points, while the previous holder loses 2 points.
                </p>
              </section>

              <section>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 'bold', color: 'var(--accent)' }}>
                  Victory Points
                </h3>
                <ul style={{ margin: '8px 0', paddingLeft: 20, lineHeight: 1.8, color: 'var(--text)' }}>
                  <li>Settlement: 1 victory point</li>
                  <li>City: 2 victory points</li>
                  <li>Longest Road: 2 victory points</li>
                </ul>
              </section>

              <section>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, fontWeight: 'bold', color: 'var(--accent)' }}>
                  Winning
                </h3>
                <p style={{ margin: 0, lineHeight: 1.6, color: 'var(--text)' }}>
                  The first player to reach <strong>10 victory points</strong> wins the game!
                </p>
              </section>

              <section style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--muted)' }}>
                <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 16, fontWeight: 'bold', color: 'var(--accent)' }}>
                  Credits
                </h3>
                <div style={{ margin: 0, lineHeight: 1.8, color: 'var(--text)' }}>
                  <div>Designer - Charmingtoad</div>
                  <div>VPM - Cloud</div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
