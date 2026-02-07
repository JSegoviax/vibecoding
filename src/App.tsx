import { Suspense, lazy, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom'
import { HomePage } from './pages/HomePage'
import { GamesIndexPage } from './pages/GamesIndexPage'
import { SettlersGamePage } from './pages/SettlersGamePage'
import { OregonCapitalistGate } from './components/OregonCapitalistGate'
import { SETTLERS_PATH } from './config/games'

const GameRoom = lazy(() =>
  import('./components/GameRoom').then((m) => ({ default: m.GameRoom }))
)
const FAQPage = lazy(() =>
  import('./pages/FAQPage').then((m) => ({ default: m.FAQPage }))
)
const HowToPlayPage = lazy(() =>
  import('./pages/HowToPlayPage').then((m) => ({ default: m.HowToPlayPage }))
)
const AboutPage = lazy(() =>
  import('./pages/AboutPage').then((m) => ({ default: m.AboutPage }))
)

const fallback = (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(180deg, rgb(26, 31, 46) 0%, rgb(45, 55, 72) 100%)',
      color: 'var(--text)',
    }}
  >
    Loading…
  </div>
)

function RedirectLegacyGame() {
  const { gameId } = useParams<{ gameId: string }>()
  const { search } = useLocation()
  if (!gameId) return <Navigate to="/" replace />
  return <Navigate to={`${SETTLERS_PATH}/game/${gameId}${search}`} replace />
}

function GameRoomWrapper() {
  const { gameId } = useParams<{ gameId: string }>()
  if (!gameId) return null
  return <GameRoom gameId={gameId} />
}

/** Disable body grain overlay on game pages to avoid Chrome scroll-triggered compositing bugs */
function BodyClassEffect() {
  const { pathname } = useLocation()
  useEffect(() => {
    const isGamePage =
      pathname.startsWith('/games/oregon-capitalist') ||
      pathname.startsWith('/games/settlers-of-oregon')
    const isOregonCapitalist = pathname.startsWith('/games/oregon-capitalist')
    document.body.classList.toggle('no-grain-overlay', isGamePage)
    document.body.classList.toggle('oregon-capitalist-active', isOregonCapitalist)
    return () => {
      document.body.classList.remove('no-grain-overlay', 'oregon-capitalist-active')
    }
  }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <BodyClassEffect />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/games" element={<GamesIndexPage />} />
        <Route path="/games/settlers-of-oregon" element={<SettlersGamePage />} />
        <Route
          path="/games/settlers-of-oregon/game/:gameId"
          element={
            <Suspense fallback={fallback}>
              <GameRoomWrapper />
            </Suspense>
          }
        />
        <Route path="/games/oregon-capitalist" element={<OregonCapitalistGate />} />
        <Route
          path="/how-to-play"
          element={
            <Suspense fallback={fallback}>
              <HowToPlayPage />
            </Suspense>
          }
        />
        <Route
          path="/about"
          element={
            <Suspense fallback={fallback}>
              <AboutPage />
            </Suspense>
          }
        />
        <Route
          path="/faq"
          element={
            <Suspense fallback={fallback}>
              <FAQPage />
            </Suspense>
          }
        />
        {/* Backward compat: /game/:id → /games/settlers-of-oregon/game/:id */}
        <Route path="/game/:gameId" element={<RedirectLegacyGame />} />
      </Routes>
    </BrowserRouter>
  )
}
