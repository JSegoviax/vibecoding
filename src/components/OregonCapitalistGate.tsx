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
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          maxWidth: 280,
          width: '100%',
        }}
      >
        <label htmlFor="oc-password" style={{ fontSize: 14, opacity: 0.9 }}>
          Enter password
        </label>
        <input
          id="oc-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="off"
          autoFocus
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: '1px solid var(--paper-border)',
            background: 'var(--surface)',
            color: 'var(--text)',
            fontSize: 16,
          }}
        />
        {error && (
          <span style={{ fontSize: 13, color: '#dc2626' }}>{error}</span>
        )}
        <button
          type="submit"
          style={{
            padding: '10px 14px',
            borderRadius: 8,
            border: 'none',
            background: 'var(--cta)',
            color: '#fff',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 14,
          }}
        >
          Unlock
        </button>
      </form>
    </div>
  )
}
