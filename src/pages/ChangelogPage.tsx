import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CHANGELOG_ENTRIES } from '../data/changelog'

export function ChangelogPage() {
  useEffect(() => {
    document.title = 'Changelog – Settlers of Oregon'
    return () => {
      document.title = 'Settlers of Oregon – Catan-Style Board Game Online'
    }
  }, [])

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
      <div className="paper-section" style={{ margin: '0 auto', maxWidth: 640 }}>
        <Link
          to="/"
          style={{
            display: 'inline-block',
            marginBottom: 24,
            color: 'var(--cta)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Home
        </Link>
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 'bold' }}>
          Changelog
        </h1>
        <p
          style={{
            margin: '0 0 32px',
            color: 'var(--ink)',
            opacity: 0.85,
            fontSize: 15,
          }}
        >
          Recent updates to Settlers of Oregon and the site.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {CHANGELOG_ENTRIES.map((entry) => (
            <section key={entry.date}>
              <h2
                style={{
                  margin: '0 0 12px',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                {entry.dateLabel}
              </h2>
              <ul
                style={{
                  margin: 0,
                  paddingLeft: 20,
                  lineHeight: 1.7,
                  color: 'var(--ink)',
                  opacity: 0.9,
                }}
              >
                {entry.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
