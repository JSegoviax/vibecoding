import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export function HowToPlayPage() {
  useEffect(() => {
    document.title = 'How to Play – Settlers of Oregon'
    return () => { document.title = 'Settlers of Oregon – Catan-Style Board Game Online' }
  }, [])

  const sectionStyle = { marginBottom: 28 }
  const h2Style = { margin: '0 0 12px', fontSize: 20, fontWeight: 'bold', color: 'var(--ink)' }
  const pStyle = { margin: 0, lineHeight: 1.6, color: 'var(--ink)', opacity: 0.9 }
  const ulStyle = { margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.7, color: 'var(--ink)', opacity: 0.9 }

  return (
    <div
      className="parchment-page"
      style={{
        minHeight: '100vh',
        background: 'var(--parchment-bg)',
        color: 'var(--ink)',
        padding: 24,
        paddingTop: 80,
      }}
    >
      <div className="paper-section" style={{ margin: '0 auto' }}>
        <Link
          to="/games/settlers-of-oregon"
          style={{
            display: 'inline-block',
            marginBottom: 24,
            color: 'var(--cta)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Back to game
        </Link>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 'bold' }}>How to Play</h1>
        <p style={{ margin: '0 0 32px', color: 'var(--ink)', opacity: 0.85, fontSize: 15 }}>
          A short guide to Settlers of Oregon
        </p>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Goal</h2>
          <p style={pStyle}>
            Be the first player to reach <strong>10 victory points</strong> by building settlements and cities, and by earning the Longest Road card.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Setup</h2>
          <p style={pStyle}>
            Players take turns placing 2 settlements and 2 roads each. Place a settlement on an intersection, then a road on an edge connected to it. Settlements must be at least 2 edges apart. On your second settlement, you receive one of each resource from the 3 surrounding hexes.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Your turn</h2>
          <ol style={{ ...ulStyle, listStyle: 'decimal' }}>
            <li><strong>Roll the dice.</strong> All players with a settlement or city on a hex matching the number receive resources (1 per settlement, 2 per city).</li>
            <li>If you roll a <strong>7</strong>, move the robber to a new hex and optionally steal one resource from a player with a structure on that hex. No resources are distributed that turn.</li>
            <li><strong>Build and/or trade</strong> (optional). Spend resources to build roads, settlements, or cities, or trade with the bank (4 of one resource for 1 of another).</li>
            <li>Click <strong>End turn</strong> when done.</li>
          </ol>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Building costs</h2>
          <ul style={ulStyle}>
            <li><strong>Road:</strong> 1 Wood + 1 Brick</li>
            <li><strong>Settlement:</strong> 1 Wood + 1 Brick + 1 Sheep + 1 Wheat</li>
            <li><strong>City:</strong> 2 Wheat + 3 Ore (upgrades an existing settlement)</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Trading & harbors</h2>
          <p style={pStyle}>
            Trade with the bank at 4:1 by default. If you build next to a harbor (shown on the board), you get a better rate (e.g. 2:1 for a specific resource) for that harbor.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Victory points</h2>
          <ul style={ulStyle}>
            <li>Settlement: 1 VP</li>
            <li>City: 2 VP</li>
            <li>Longest Road (5+ connected roads): 2 VP</li>
            <li>Omen Hand (5+ Omen cards purchased, Oregon&apos;s Omens only): 2 VP</li>
          </ul>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>Oregon's Omens (optional)</h2>
          <p style={pStyle}>
            When enabled, you can spend 1 Wheat, 1 Sheep, and 1 Ore to draw an Omen card. Cards can give one-time bonuses (e.g. cheaper builds, extra resources) or temporary effects. Some cards help you; others are debuffs. The first player to have <strong>purchased</strong> 5 or more Omen cards earns the Omen Hand award (2 VP). Use the in-game Game Guide (📖 button) for full rules.
          </p>
        </section>

        <p style={{ marginTop: 32, color: 'var(--ink)', opacity: 0.8, fontSize: 14 }}>
          <Link to="/games/settlers-of-oregon" style={{ color: 'var(--cta)', textDecoration: 'none' }}>← Back to game</Link>
        </p>
      </div>
    </div>
  )
}
