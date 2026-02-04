import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { HexBoard } from '../components/HexBoard'
import { createBoard } from '../game/board'
import { TERRAIN_LABELS } from '../game/terrain'
import { getBusinessName } from '../game/businessNames'
import {
  tick,
  produceFromClick,
  unlockHex,
  upgradeHex,
  hireManager,
  purchaseGlobalBuff,
  getUnlockRequirement,
  canAffordUnlock,
  getUpgradeCost,
  getHireCost,
  getProductionPerSecond,
} from '../game/oregonCapitalist'
import { getGlobalBuffsForState, getGlobalProductionMultiplier } from '../game/globalBuffs'
import { getManagerName } from '../game/managerNames'
import type { OregonCapitalistState } from '../game/oregonCapitalist'
import type { Hex, Terrain } from '../game/types'
import { formatNumber } from '../utils/formatNumber'

const STORAGE_KEY = 'oregon_capitalist_save'
const TICK_MS = 100
const NEIGHBORS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]] as const

function getAdjacentHexIds(hexId: string, hexes: Hex[]): string[] {
  const match = hexId.match(/^h(-?\d+),(-?\d+)$/)
  if (!match) return []
  const q = parseInt(match[1], 10)
  const r = parseInt(match[2], 10)
  const byId = new Map(hexes.map((h) => [h.id, h]))
  const out: string[] = []
  for (const [dq, dr] of NEIGHBORS) {
    const nid = `h${q + dq},${r + dr}`
    if (byId.has(nid)) out.push(nid)
  }
  return out
}

function createInitialState(): OregonCapitalistState {
  const hexes = createBoard()
  const starterHex = hexes.find((h) => h.terrain !== 'desert') ?? hexes[0]
  return {
    hexes,
    ownedHexIds: starterHex ? new Set([starterHex.id]) : new Set(),
    resources: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, desert: 0 },
    money: 0,
    hexLevels: starterHex ? { [starterHex.id]: 1 } : {},
    hexTiers: starterHex ? { [starterHex.id]: 1 } : {},
    hexManagers: {},
    purchasedGlobalBuffs: [],
    lastTickTimestamp: Date.now(),
  }
}

function loadState(): OregonCapitalistState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as {
      hexes: Hex[]
      ownedHexIds: string[]
      resources: Record<Terrain, number>
      money: number
      hexLevels: Record<string, number>
      hexTiers?: Record<string, number>
      hexManagers?: Record<string, number>
      purchasedGlobalBuffs?: string[]
      lastTickTimestamp: number
    }
    const hexTiers = parsed.hexTiers ?? {}
    for (const id of parsed.ownedHexIds) {
      if (hexTiers[id] == null) hexTiers[id] = 1
    }
    const hexManagers = parsed.hexManagers ?? {}
    const purchasedGlobalBuffs = parsed.purchasedGlobalBuffs ?? []
    return {
      ...parsed,
      ownedHexIds: new Set(parsed.ownedHexIds),
      hexTiers,
      hexManagers,
      purchasedGlobalBuffs,
    }
  } catch {
    return null
  }
}

function saveState(state: OregonCapitalistState) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        hexes: state.hexes,
        ownedHexIds: Array.from(state.ownedHexIds),
        resources: state.resources,
        money: state.money,
        hexLevels: state.hexLevels,
        hexTiers: state.hexTiers ?? {},
        hexManagers: state.hexManagers ?? {},
        purchasedGlobalBuffs: state.purchasedGlobalBuffs ?? [],
        lastTickTimestamp: state.lastTickTimestamp,
      })
    )
  } catch {
    // ignore
  }
}

export function OregonCapitalistPage() {
  const [state, setState] = useState<OregonCapitalistState>(() => {
    const saved = loadState()
    if (saved) {
      return tick(saved, Date.now())
    }
    return createInitialState()
  })
  const stateRef = useRef(state)
  stateRef.current = state

  const tickRef = useRef<number>()
  useEffect(() => {
    const run = () => {
      setState((s) => tick(s, Date.now()))
      tickRef.current = window.setTimeout(run, TICK_MS)
    }
    tickRef.current = window.setTimeout(run, TICK_MS)
    return () => {
      if (tickRef.current) clearTimeout(tickRef.current)
    }
  }, [])

  useEffect(() => {
    const id = setInterval(() => saveState(stateRef.current), 5000)
    return () => clearInterval(id)
  }, [])

  const handleHexSelect = useCallback((hexId: string) => {
    setState((s) => produceFromClick(s, hexId) ?? s)
  }, [])

  const handleUnlock = useCallback((hexId: string) => {
    setState((s) => {
      const next = unlockHex(s, hexId, s.ownedHexIds.size)
      return next ?? s
    })
  }, [])

  const handleUpgrade = useCallback((hexId: string) => {
    setState((s) => {
      const next = upgradeHex(s, hexId)
      return next ?? s
    })
  }, [])

  const handleHireManager = useCallback((hexId: string) => {
    setState((s) => {
      const next = hireManager(s, hexId)
      return next ?? s
    })
  }, [])

  const handlePurchaseGlobalBuff = useCallback((buffId: string) => {
    setState((s) => {
      const next = purchaseGlobalBuff(s, buffId)
      return next ?? s
    })
  }, [])

  const handleReset = useCallback(() => {
    if (window.confirm('Reset game? All progress will be lost.')) {
      localStorage.removeItem(STORAGE_KEY)
      setState(createInitialState())
    }
  }, [])

  const unlockableHexes = useMemo(() => {
    const adjacent = new Set<string>()
    for (const oid of state.ownedHexIds) {
      for (const nid of getAdjacentHexIds(oid, state.hexes)) {
        if (!state.ownedHexIds.has(nid)) adjacent.add(nid)
      }
    }
    return Array.from(adjacent)
      .map((id) => state.hexes.find((h) => h.id === id)!)
      .filter((h) => h && h.terrain !== 'desert')
  }, [state.hexes, state.ownedHexIds])

  const hiddenHexIds = useMemo(() => {
    const hidden = new Set<string>()
    for (const h of state.hexes) {
      if (!state.ownedHexIds.has(h.id)) hidden.add(h.id)
    }
    return hidden
  }, [state.hexes, state.ownedHexIds])

  const totalProductionPerSec = useMemo(() => {
    let total = 0
    for (const hexId of state.ownedHexIds) {
      if (!state.hexManagers?.[hexId]) continue
      const hex = state.hexes.find((h) => h.id === hexId)
      if (hex && hex.terrain !== 'desert') {
        const level = state.hexLevels[hexId] ?? 1
        const tier = state.hexTiers?.[hexId] ?? 1
        total += getProductionPerSecond(tier, level)
      }
    }
    const mult = getGlobalProductionMultiplier(state.purchasedGlobalBuffs ?? [])
    return total * mult
  }, [state.ownedHexIds, state.hexes, state.hexLevels, state.hexTiers, state.hexManagers, state.purchasedGlobalBuffs])

  const hiddenHexCosts = useMemo(() => {
    const costs: Record<string, string> = {}
    for (const hex of unlockableHexes) {
      const req = getUnlockRequirement(state, hex.id, state.ownedHexIds.size)
      if (!req) continue
      if (req.kind === 'anySingle') {
        costs[hex.id] = `${formatNumber(req.cost)} (any 1 resource)`
      } else {
        costs[hex.id] = req.items
          .map((it) => `${formatNumber(it.amount)} ${TERRAIN_LABELS[it.terrain]}`)
          .join(' + ')
      }
    }
    return costs
  }, [unlockableHexes, state, state.ownedHexIds.size])

  const { available: availableBuffs, purchased: purchasedBuffs } = useMemo(
    () =>
      getGlobalBuffsForState(
        state.purchasedGlobalBuffs ?? [],
        Object.keys(state.hexManagers ?? {}).length,
        state.ownedHexIds.size
      ),
    [state.purchasedGlobalBuffs, state.hexManagers, state.ownedHexIds.size]
  )

  return (
    <div
      className="parchment-page"
      style={{
        minHeight: '100vh',
        padding: 24,
        background: 'var(--parchment-bg)',
        color: 'var(--ink)',
      }}
    >
      <Link
        to="/games"
        style={{
          display: 'inline-block',
          marginBottom: 16,
          color: 'var(--cta)',
          textDecoration: 'none',
          fontSize: 14,
        }}
      >
        ← Games
      </Link>
      <h1 style={{ margin: '0 0 8px', fontSize: 28 }}>Oregon Capitalist</h1>
      <p style={{ margin: '0 0 24px', opacity: 0.9, fontSize: 15 }}>
        Click hexes to collect resources. Unlock adjacent hexes. Upgrade for more production.
      </p>

      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 400px', minWidth: 300 }}>
          <HexBoard
            hexes={state.hexes}
            showNumberTokens={false}
            selectHex={handleHexSelect}
            selectableRobberHexes={state.ownedHexIds.size > 0 ? state.ownedHexIds : undefined}
            resourceHighlightHexIds={
              state.ownedHexIds.size > 0 ? new Set(state.ownedHexIds) : undefined
            }
            hiddenHexIds={hiddenHexIds.size > 0 ? hiddenHexIds : undefined}
            hiddenHexCosts={Object.keys(hiddenHexCosts).length > 0 ? hiddenHexCosts : undefined}
          />
        </div>
        <aside
          style={{
            flex: '0 0 280px',
            background: 'var(--surface)',
            borderRadius: 12,
            padding: 20,
            color: 'var(--text)',
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            style={{
              width: '100%',
              marginBottom: 16,
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid rgba(185, 28, 28, 0.5)',
              background: 'transparent',
              color: '#f87171',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            Reset game
          </button>
          <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Money</h3>
          <p style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 700 }}>
            {formatNumber(state.money)}
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 12, opacity: 0.8 }}>
            +{formatNumber(totalProductionPerSec * 0.5, 2)}/sec
          </p>

          <h3 style={{ margin: '0 0 12px', fontSize: 18 }}>Resources</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['wood', 'brick', 'sheep', 'wheat', 'ore'] as Terrain[]).map((t) => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                <span>{TERRAIN_LABELS[t]}</span>
                <span style={{ fontWeight: 600 }}>{formatNumber(state.resources[t])}</span>
              </div>
            ))}
          </div>

          <h3 style={{ margin: '24px 0 12px', fontSize: 18 }}>Upgrade hex</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.9 }}>
            Cost: money (increases per level)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from(state.ownedHexIds).map((hexId) => {
              const hex = state.hexes.find((h) => h.id === hexId)
              if (!hex || hex.terrain === 'desert') return null
              const level = state.hexLevels[hexId] ?? 1
              const tier = state.hexTiers?.[hexId] ?? 1
              const cost = getUpgradeCost(level)
              const canAfford = state.money >= cost
              return (
                <button
                  key={hexId}
                  onClick={() => handleUpgrade(hexId)}
                  disabled={!canAfford}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--paper-border)',
                    background: canAfford ? 'var(--cta)' : 'rgba(0,0,0,0.2)',
                    color: canAfford ? '#fff' : 'var(--muted)',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{getBusinessName(hex.terrain, tier)} Lv.{level}</span>
                  <span>{canAfford ? formatNumber(cost) : `${formatNumber(state.money)}/${formatNumber(cost)}`}</span>
                </button>
              )
            })}
          </div>

          <h3 style={{ margin: '24px 0 12px', fontSize: 18 }}>Hire manager</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.9 }}>
            Managers enable passive production. Tier must match hex.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from(state.ownedHexIds)
              .filter((hexId) => !state.hexManagers?.[hexId])
              .map((hexId) => {
                const hex = state.hexes.find((h) => h.id === hexId)
                if (!hex || hex.terrain === 'desert') return null
                const tier = state.hexTiers?.[hexId] ?? 1
                const cost = getHireCost(tier)
                const canAfford = state.money >= cost
                const managerName = getManagerName(tier)
                return (
                  <button
                    key={hexId}
                    onClick={() => handleHireManager(hexId)}
                    disabled={!canAfford}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid var(--paper-border)',
                      background: canAfford ? 'var(--accent-sage)' : 'rgba(0,0,0,0.2)',
                      color: canAfford ? '#fff' : 'var(--muted)',
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                      fontSize: 13,
                      textAlign: 'left',
                      display: 'flex',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span>{getBusinessName(hex.terrain, tier)} → {managerName}</span>
                    <span>{canAfford ? formatNumber(cost) : `${formatNumber(state.money)}/${formatNumber(cost)}`}</span>
                  </button>
                )
              })}
            {Array.from(state.ownedHexIds).filter((hexId) => !state.hexManagers?.[hexId]).length === 0 && (
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
                All hexes have managers. Unlock more hexes to hire.
              </p>
            )}
          </div>

          <h3 style={{ margin: '24px 0 12px', fontSize: 18 }}>Global buffs</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.9 }}>
            Boost all production. Unlocks with managers + hexes.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {purchasedBuffs.map((b) => (
              <div
                key={b.id}
                style={{
                  padding: '6px 10px',
                  borderRadius: 8,
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.4)',
                  fontSize: 13,
                  color: 'var(--text)',
                }}
              >
                ✓ {b.name} — {b.description}
              </div>
            ))}
            {availableBuffs.map((buff) => {
              const canAfford = state.money >= buff.cost
              return (
                <button
                  key={buff.id}
                  onClick={() => handlePurchaseGlobalBuff(buff.id)}
                  disabled={!canAfford}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--paper-border)',
                    background: canAfford ? 'var(--accent)' : 'rgba(0,0,0,0.2)',
                    color: canAfford ? '#fff' : 'var(--muted)',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{buff.name} — {buff.description}</span>
                  <span>{canAfford ? formatNumber(buff.cost) : `${formatNumber(state.money)}/${formatNumber(buff.cost)}`}</span>
                </button>
              )
            })}
            {purchasedBuffs.length === 0 && availableBuffs.length === 0 && (
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
                Hire managers and unlock hexes to unlock buffs.
              </p>
            )}
          </div>

          <h3 style={{ margin: '24px 0 12px', fontSize: 18 }}>Unlock hex</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, opacity: 0.9 }}>
            Cost: early game is flexible; later some hexes require specific or multiple resources.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {unlockableHexes.map((hex) => {
              const sameTerrainCount = Array.from(state.ownedHexIds).filter(
                (id) => state.hexes.find((h) => h.id === id)?.terrain === hex.terrain
              ).length
              const tierIfUnlocked = sameTerrainCount + 1
              const businessName = getBusinessName(hex.terrain, tierIfUnlocked)
              const req = getUnlockRequirement(state, hex.id, state.ownedHexIds.size)
              if (!req) return null
              const canAfford = canAffordUnlock(state, req)

              const costLabel =
                req.kind === 'anySingle'
                  ? `Unlock (${formatNumber(req.cost)} any 1 resource)`
                  : `Unlock (${req.items
                      .map((it) => `${formatNumber(it.amount)} ${TERRAIN_LABELS[it.terrain]}`)
                      .join(' + ')})`

              const progressLabel =
                req.kind === 'anySingle'
                  ? (() => {
                      const maxHave = Math.max(
                        ...(['wood', 'brick', 'sheep', 'wheat', 'ore'] as Terrain[]).map(
                          (t) => state.resources[t] ?? 0
                        )
                      )
                      return `${formatNumber(maxHave)}/${formatNumber(req.cost)}`
                    })()
                  : req.items
                      .map((it) => `${formatNumber(state.resources[it.terrain] ?? 0)}/${formatNumber(it.amount)} ${TERRAIN_LABELS[it.terrain]}`)
                      .join(' · ')
              return (
                <button
                  key={hex.id}
                  onClick={() => handleUnlock(hex.id)}
                  disabled={!canAfford}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    border: '1px solid var(--paper-border)',
                    background: canAfford ? 'var(--accent-sage)' : 'rgba(0,0,0,0.2)',
                    color: canAfford ? '#fff' : 'var(--muted)',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{businessName}</span>
                  <span>{canAfford ? costLabel : progressLabel}</span>
                </button>
              )
            })}
            {unlockableHexes.length === 0 && (
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7 }}>
                Unlock adjacent hexes by collecting resources.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
