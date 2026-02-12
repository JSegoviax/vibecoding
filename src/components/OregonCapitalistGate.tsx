import { useState } from 'react'
import { OregonCapitalistPage } from '../pages/OregonCapitalistPage'
import {
  OREGON_CAPITALIST_STORAGE_KEY,
  OREGON_CAPITALIST_PASSWORD,
} from '../config/games'

function isUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  return sessionStorage.getItem(OREGON_CAPITALIST_STORAGE_KEY) === '1'
}

function setUnlocked(): void {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(OREGON_CAPITALIST_STORAGE_KEY, '1')
  }
}

export function OregonCapitalistGate() {
  const [unlocked, setUnlockedState] = useState(isUnlocked)
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (password === OREGON_CAPITALIST_PASSWORD) {
      setUnlocked()
      setUnlockedState(true)
      setPassword('')
    } else {
      setError('Incorrect')
    }
  }

  if (unlocked) {
    return <OregonCapitalistPage />
  }

  return (
    <div
      className="parchment-page"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--parchment-bg)',
        color: 'var(--ink)',
      }}
    >
      <div
        className="paper-section"
        style={{
          padding: 32,
          borderRadius: 12,
          maxWidth: 360,
          width: '100%',
        }}
      >
        <h1
          style={{
            margin: '0 0 8px',
            fontSize: 22,
            fontFamily: '"Old Standard TT", Georgia, serif',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            color: 'var(--ink)',
          }}
        >
          Oregon Capitalist
        </h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, opacity: 0.85 }}>
          Enter the password to unlock.
        </p>
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            width: '100%',
          }}
        >
          <label htmlFor="oc-password" style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
            Password
          </label>
          <input
            id="oc-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            autoFocus
            placeholder="Enter password"
            style={{
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid var(--paper-border)',
              background: '#fff',
              color: 'var(--ink)',
              fontSize: 16,
            }}
          />
          {error && (
            <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
          )}
          <button
            type="submit"
            style={{
              marginTop: 4,
              padding: '12px 20px',
              borderRadius: 8,
              border: 'none',
              background: '#C17D5B',
              color: '#fff',
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 15,
              boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
          >
            Unlock
          </button>
        </form>
      </div>
    </div>
  )
}
