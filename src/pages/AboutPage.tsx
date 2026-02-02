import { useEffect } from 'react'

export function AboutPage() {
  useEffect(() => {
    document.title = 'About – Settlers of Oregon | Free Catan-Style Game, No Ads'
    return () => { document.title = 'Settlers of Oregon – Catan-Style Board Game Online' }
  }, [])

  const sectionStyle = { marginBottom: 28 }
  const h2Style = { margin: '0 0 12px', fontSize: 20, fontWeight: 'bold', color: 'var(--ink)' }
  const pStyle = { margin: 0, lineHeight: 1.6, color: 'var(--ink)', opacity: 0.9 }

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
      <div className="paper-section" style={{ margin: '0 auto', maxWidth: 720 }}>
        <a
          href="/"
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
        </a>

        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 'bold', color: 'var(--ink)' }}>
          About Settlers of Oregon
        </h1>
        <p style={{ margin: '0 0 24px', color: 'var(--ink)', opacity: 0.85, fontSize: 15 }}>
          A free Catan-style board game you can play instantly in your browser. No ads, no sign-up required.
        </p>

        {/* Positioning content: "No Ads, No Bloat" promise near the fold for SEO (free no ads catan, play without sign up) */}
        <section style={sectionStyle} aria-label="Why play here">
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              lineHeight: 1.8,
              color: 'var(--ink)',
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            <li>Play instantly in browser</li>
            <li>No ads. No sign-up required.</li>
            <li>Lightweight &amp; fast.</li>
          </ul>
        </section>

        {/* Oregon angle: thematic differentiation for "Oregon Trail style games", "historical strategy browser games" */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>How is this different from Catan?</h2>
          <p style={pStyle}>
            A historical survival twist on the classic trading game. Manage your wagon train, trade resources, and survive the frontier in 1848. Same hex-based strategy you love—with optional Oregon’s Omens cards for bonuses and hazards on the trail.
          </p>
        </section>

        {/* Compare table: "Colonist.io alternatives", "sites like Catan Universe" – use HTML table for featured snippets */}
        <section style={sectionStyle}>
          <h2 style={h2Style}>Why play Settlers of Oregon?</h2>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 14,
              color: 'var(--ink)',
            }}
            summary="Comparison: Hex Hobbyist vs other Catan-style sites"
          >
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid var(--paper-border)', fontWeight: 600 }}>
                  Feature
                </th>
                <th scope="col" style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid var(--paper-border)', fontWeight: 600 }}>
                  Hex Hobbyist
                </th>
                <th scope="col" style={{ textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid var(--paper-border)', fontWeight: 600 }}>
                  Other sites
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Price</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Free</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Free (with ads) or subscription</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Registration</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Not required</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Required</td>
              </tr>
              <tr>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Gameplay</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Instant browser play</td>
                <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--paper-border)' }}>Long loading or app download</td>
              </tr>
            </tbody>
          </table>
        </section>

        <p style={{ marginTop: 32, color: 'var(--ink)', opacity: 0.8, fontSize: 14 }}>
          <a href="/" style={{ color: 'var(--cta)', textDecoration: 'none' }}>← Back to game</a>
        </p>
      </div>
    </div>
  )
}
