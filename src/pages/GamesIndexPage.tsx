import { Link } from 'react-router-dom'
import { getVisibleGames, SITE_NAME } from '../config/games'

export function GamesIndexPage() {
  return (
    <div
      className="parchment-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 24,
        background: 'var(--parchment-bg)',
        color: 'var(--ink)',
      }}
    >
      <main
        aria-label="All games"
        className="paper-section"
        style={{
          maxWidth: 720,
          width: '100%',
        }}
      >
        <Link
          to="/"
          style={{
            display: 'inline-block',
            marginBottom: 16,
            color: 'var(--cta)',
            textDecoration: 'none',
            fontSize: 14,
          }}
        >
          ← {SITE_NAME}
        </Link>
        <h1 style={{ margin: 0, fontSize: 28, color: 'var(--ink)' }}>Games</h1>
        <p style={{ margin: '8px 0 24px', color: 'var(--ink)', opacity: 0.85 }}>
          Hex-based board games. Click a game to play.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {getVisibleGames().map((game) => (
            <Link
              key={game.slug}
              to={game.path}
              style={{
                display: 'block',
                padding: 20,
                background: 'rgba(255,255,255,0.5)',
                border: '1px solid var(--paper-border)',
                borderRadius: 12,
                textDecoration: 'none',
                color: 'var(--ink)',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 18 }}>{game.name}</span>
                {game.isNew && (
                  <span
                    style={{
                      fontSize: 11,
                      background: 'var(--cta)',
                      color: '#fff',
                      padding: '2px 8px',
                      borderRadius: 6,
                    }}
                  >
                    New
                  </span>
                )}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.85 }}>
                {game.description}
              </p>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
