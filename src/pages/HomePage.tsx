import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getVisibleGames, GAMES, SITE_NAME } from '../config/games'

const SECRET_CLICKS = 5

export function HomePage() {
  const [secretRevealed, setSecretRevealed] = useState(false)
  const [clickCount, setClickCount] = useState(0)

  const handleTitleClick = () => {
    const next = clickCount + 1
    setClickCount(next)
    if (next >= SECRET_CLICKS) {
      setSecretRevealed(true)
    }
  }

  const visibleGames = getVisibleGames()

  return (
    <div
      className="home-page parchment-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: 24,
        background: 'var(--parchment-bg)',
        color: 'var(--ink)',
      }}
    >
      <main
        aria-label="Hexhobbyist – Hex board games"
        className="paper-section"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          maxWidth: 640,
        }}
      >
        <h1
          style={{ margin: 0, fontSize: 32, color: 'var(--ink)', cursor: 'pointer', userSelect: 'none' }}
          onClick={handleTitleClick}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleTitleClick()}
          aria-label={SITE_NAME}
        >
          {SITE_NAME}
        </h1>
        <p style={{ margin: '8px 0 24px', color: 'var(--ink)', opacity: 0.9, fontSize: 18 }}>
          Hex-based board games. Free to play in your browser.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', maxWidth: 360 }}>
          {visibleGames.map((game) => (
            <Link
              key={game.slug}
              to={game.path}
              style={{
                display: 'block',
                padding: '16px 24px',
                background: 'var(--cta)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: 12,
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              {game.name}
              {game.isNew && (
                <span style={{ marginLeft: 8, fontSize: 12, opacity: 0.9 }}>New</span>
              )}
            </Link>
          ))}
          {secretRevealed && (
            <Link
              to="/games/oregon-capitalist"
              style={{
                display: 'block',
                padding: '16px 24px',
                background: 'var(--accent-sage)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: 12,
                textDecoration: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
              Oregon Capitalist
            </Link>
          )}
        </div>
        <p style={{ marginTop: 28, fontSize: 14, color: 'var(--ink)', opacity: 0.8 }}>
          <Link to="/games" style={{ color: 'var(--cta)', textDecoration: 'none' }}>
            View all games →
          </Link>
          {' · '}
          <Link to="/about" style={{ color: 'var(--cta)', textDecoration: 'none' }}>
            About
          </Link>
        </p>
      </main>
    </div>
  )
}
