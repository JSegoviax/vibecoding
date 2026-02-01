import { useEffect } from 'react'

const FAQ: { q: string; a: string }[] = [
  { q: 'What is Settlers of Oregon?', a: 'A free online Catan-style strategy board game. Collect resources, trade, and build roads, settlements, and cities. First to 10 victory points wins.' },
  { q: 'How do I play vs the computer?', a: 'Click "Play vs AI" on the home screen, choose your color (and optionally Oregon\'s Omens), then start. You and the AI take turns rolling, building, and trading.' },
  { q: 'How do I play with friends?', a: 'Click "Multiplayer", create a game and share the link, or enter a game code to join. Once everyone joins, the host starts the game.' },
  { q: "What is Oregon's Omens?", a: "An optional expansion with special cards. Spend resources to draw cards for bonuses or effects. Enable it when creating or joining a game." },
  { q: 'Is the game free?', a: 'Yes. Free to play in your browser. No account needed for single-player vs AI.' },
  { q: 'What do I need to play?', a: 'A modern browser with JavaScript (Chrome, Firefox, Safari, or Edge). Works on desktop and mobile.' },
]

export function FAQPage() {
  useEffect(() => {
    document.title = 'FAQ – Settlers of Oregon'
    return () => { document.title = 'Settlers of Oregon – Catan-Style Board Game Online' }
  }, [])

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, rgb(26, 31, 46) 0%, rgb(45, 55, 72) 100%)',
        color: 'var(--text)',
        padding: 24,
        paddingTop: 80,
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <a
          href="/"
          style={{
            display: 'inline-block',
            marginBottom: 24,
            color: 'var(--accent)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          ← Back to game
        </a>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
        <h1 style={{ margin: '0 0 8px', fontSize: 28, fontWeight: 'bold' }}>FAQ</h1>
        <p style={{ margin: '0 0 32px', color: 'var(--muted)', fontSize: 15 }}>
          Frequently asked questions about Settlers of Oregon
        </p>
        <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
          {FAQ.map((item, i) => (
            <div key={i}>
              <dt style={{ margin: 0, fontWeight: 'bold', fontSize: 16, color: 'var(--text)' }}>
                {item.q}
              </dt>
              <dd style={{ margin: '8px 0 0', paddingLeft: 0, lineHeight: 1.6, color: 'var(--text)' }}>
                {item.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}
