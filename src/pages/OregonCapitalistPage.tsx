import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { HexBoard } from '../components/HexBoard'
import { createBoard } from '../game/board'
import { TERRAIN_LABELS } from '../game/terrain'
import { getBusinessName } from '../game/businessNames'
import {
  tick,
  applyAutoUpgrades,
  applyAutoSpiritShop,
  produceFromClick,
  unlockHex,
  upgradeHex,
  buyMaxUpgrades,
  hireManager,
  purchaseGlobalBuff,
  prestige,
  purchasePrestigeUpgrade,
  getUnlockRequirement,
  canAffordUnlock,
  getUpgradeCost,
  calculateMaxAffordable,
  getHireCost,
  getProductionPerSecond,
  getGlobalProgressMoneyMultiplier,
  getTotalProductionPerSec,
  getCycleTime,
  getMilestonesReached,
} from '../game/oregonCapitalist'
import { getAdjacencyMultiplier } from '../game/adjacency'
import { MILESTONES, GLOBAL_MILESTONES } from '../game/constants/progression'
import { calculateClaimableSpirits, PRESTIGE_SHOP } from '../game/prestige'
import { getGlobalBuffsForState, getGlobalProductionMultiplier, hasAutoUpgradeBuff, hasAutoSpiritShopBuff } from '../game/globalBuffs'
import { getManagerName } from '../game/managerNames'
import type { OregonCapitalistState } from '../game/oregonCapitalist'
import type { ActiveEvent } from '../game/trailEvents'
import type { Hex, Terrain } from '../game/types'
import { formatNumber } from '../utils/formatNumber'
import { getHexVisual } from '../game/visualTiers'
import { isEventActive } from '../game/trailEvents'

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
    autoUpgradePaused: false,
    autoSpiritShopPaused: false,
    hexProgress: {},
    lifetimeEarnings: 0,
    pioneerSpirits: 0,
    totalSpiritsEarned: 0,
    prestigeUpgrades: {},
    activeEvent: null,
    lastSaveTimestamp: Date.now(),
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
      autoUpgradePaused?: boolean
      autoSpiritShopPaused?: boolean
      hexProgress?: Record<string, number>
      lifetimeEarnings?: number
      pioneerSpirits?: number
      totalSpiritsEarned?: number
      prestigeUpgrades?: Record<string, number>
      activeEvent?: ActiveEvent | null
      lastSaveTimestamp?: number
      lastTickTimestamp: number
    }
    const hexTiers = parsed.hexTiers ?? {}
    for (const id of parsed.ownedHexIds) {
      if (hexTiers[id] == null) hexTiers[id] = 1
    }
    const hexManagers = parsed.hexManagers ?? {}
    const purchasedGlobalBuffs = parsed.purchasedGlobalBuffs ?? []
    const autoUpgradePaused = parsed.autoUpgradePaused ?? false
    const autoSpiritShopPaused = parsed.autoSpiritShopPaused ?? false
    const hexProgress = parsed.hexProgress ?? {}
    const lifetimeEarnings = parsed.lifetimeEarnings ?? 0
    const pioneerSpirits = parsed.pioneerSpirits ?? 0
    const totalSpiritsEarned = parsed.totalSpiritsEarned ?? 0
    const prestigeUpgrades = parsed.prestigeUpgrades ?? {}
    const activeEvent = parsed.activeEvent ?? null
    const lastSaveTimestamp = parsed.lastSaveTimestamp ?? parsed.lastTickTimestamp
    const rawHexes = parsed.hexes
    if (!Array.isArray(rawHexes) || rawHexes.length === 0) return null
    const VALID_TERRAINS: Terrain[] = ['wood', 'brick', 'sheep', 'wheat', 'ore', 'desert']
    const hexIds = new Set(rawHexes.map((h) => h.id))
    const hexes = rawHexes.map((h) => ({
      ...h,
      terrain: VALID_TERRAINS.includes(h.terrain) ? h.terrain : 'wood',
    }))
    const ownedHexIds = new Set(
      (parsed.ownedHexIds ?? []).filter((id) => hexIds.has(id))
    )
    return {
      ...parsed,
      hexes,
      ownedHexIds,
      hexTiers,
      hexManagers,
      purchasedGlobalBuffs,
      autoUpgradePaused,
      autoSpiritShopPaused,
      hexProgress,
      lifetimeEarnings,
      pioneerSpirits,
      totalSpiritsEarned,
      prestigeUpgrades,
      activeEvent,
      lastSaveTimestamp,
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
        autoUpgradePaused: state.autoUpgradePaused ?? false,
        autoSpiritShopPaused: state.autoSpiritShopPaused ?? false,
        hexProgress: state.hexProgress ?? {},
        lifetimeEarnings: state.lifetimeEarnings ?? 0,
        pioneerSpirits: state.pioneerSpirits ?? 0,
        totalSpiritsEarned: state.totalSpiritsEarned ?? 0,
        prestigeUpgrades: state.prestigeUpgrades ?? {},
        activeEvent: state.activeEvent ?? null,
        lastSaveTimestamp: Date.now(),
        lastTickTimestamp: state.lastTickTimestamp,
      })
    )
  } catch {
    // ignore
  }
}

function getNextMilestone(level: number): number | null {
  return MILESTONES.find((m) => m > level) ?? null
}
function getPrevMilestone(level: number): number {
  const prev = MILESTONES.filter((m) => m <= level).pop()
  return prev ?? 0
}
function progressToNextMilestone(level: number): { progress: number; next: number | null } {
  const next = getNextMilestone(level)
  const prev = getPrevMilestone(level)
  if (next == null) return { progress: 1, next: null }
  return { progress: (level - prev) / (next - prev), next }
}

function getPioneerHarmonyMultiplier(state: OregonCapitalistState): { multiplier: number; thresholds: number[] } {
  const ownedNonDesert = Array.from(state.ownedHexIds).filter((id) => {
    const hex = state.hexes.find((h) => h.id === id)
    return hex && hex.terrain !== 'desert'
  })
  if (ownedNonDesert.length === 0) return { multiplier: 1, thresholds: [] }
  
  const metThresholds: number[] = []
  for (const threshold of GLOBAL_MILESTONES) {
    const allAtOrAbove = ownedNonDesert.every((id) => (state.hexLevels[id] ?? 1) >= threshold)
    if (allAtOrAbove) {
      metThresholds.push(threshold)
    }
  }
  
  const multiplier = Math.pow(2, metThresholds.length)
  return { multiplier, thresholds: metThresholds }
}

function calculateOfflineEarnings(state: OregonCapitalistState): { earnings: number; timeAway: number } {
  const now = Date.now()
  const lastSave = state.lastSaveTimestamp ?? state.lastTickTimestamp
  const timeDiff = now - lastSave
  const MAX_OFFLINE_TIME = 24 * 60 * 60 * 1000 // 24 hours
  const effectiveTime = Math.min(timeDiff, MAX_OFFLINE_TIME)

  if (effectiveTime < 60_000) return { earnings: 0, timeAway: 0 } // Less than 1 minute

  // Calculate production per millisecond (theoretical max from all managed hexes)
  const productionPerMs = getTotalProductionPerSec(state) / 1000
  const earnings = productionPerMs * effectiveTime * 0.5 // MONEY_PER_RESOURCE = 0.5

  return { earnings, timeAway: effectiveTime }
}

function formatTimeAway(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export function OregonCapitalistPage() {
  const [celebratingMilestoneHexId, setCelebratingMilestoneHexId] = useState<string | null>(null)
  const [showOfflineModal, setShowOfflineModal] = useState(false)
  const [offlineEarnings, setOfflineEarnings] = useState<{ earnings: number; timeAway: number } | null>(null)
  const [showPrestigeModal, setShowPrestigeModal] = useState(false)
  const [state, setState] = useState<OregonCapitalistState>(() => {
    const saved = loadState()
    if (saved) {
      const ticked = tick(saved, Date.now())
      // Check for offline earnings
      const offline = calculateOfflineEarnings(ticked)
      if (offline.earnings > 0) {
        setOfflineEarnings(offline)
        setShowOfflineModal(true)
        return { ...ticked, money: ticked.money + offline.earnings }
      }
      return ticked
    }
    return createInitialState()
  })
  const stateRef = useRef(state)
  stateRef.current = state

  const tickRef = useRef<number>()
  useEffect(() => {
    const run = () => {
      setState((s) => applyAutoSpiritShop(applyAutoUpgrades(tick(s, Date.now()))))
      tickRef.current = window.setTimeout(run, TICK_MS)
    }
    tickRef.current = window.setTimeout(run, TICK_MS)
    return () => {
      if (tickRef.current) clearTimeout(tickRef.current)
    }
  }, [])

  useEffect(() => {
    if (celebratingMilestoneHexId == null) return
    const t = setTimeout(() => setCelebratingMilestoneHexId(null), 2000)
    return () => clearTimeout(t)
  }, [celebratingMilestoneHexId])

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
      if (next) {
        const newLevel = next.hexLevels[hexId] ?? 1
        if ((MILESTONES as readonly number[]).includes(newLevel)) setCelebratingMilestoneHexId(hexId)
        return next
      }
      return s
    })
  }, [])

  const handleBuyMax = useCallback((hexId: string) => {
    setState((s) => {
      const next = buyMaxUpgrades(s, hexId)
      if (next) {
        const newLevel = next.hexLevels[hexId] ?? 1
        if ((MILESTONES as readonly number[]).includes(newLevel)) setCelebratingMilestoneHexId(hexId)
        return next
      }
      return s
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

  const handleToggleAutoUpgrade = useCallback(() => {
    setState((s) => ({ ...s, autoUpgradePaused: !(s.autoUpgradePaused ?? false) }))
  }, [])

  const handleToggleAutoSpiritShop = useCallback(() => {
    setState((s) => ({ ...s, autoSpiritShopPaused: !(s.autoSpiritShopPaused ?? false) }))
  }, [])

  const handleReset = useCallback(() => {
    if (window.confirm('Reset game? All progress will be lost.')) {
      localStorage.removeItem(STORAGE_KEY)
      setState(createInitialState())
    }
  }, [])

  const handlePrestige = useCallback(() => {
    const claimable = calculateClaimableSpirits(state.lifetimeEarnings ?? 0)
    if (claimable <= 0) {
      alert('You need to earn at least $1M lifetime to prestige!')
      return
    }
    setShowPrestigeModal(true)
  }, [state.lifetimeEarnings])

  const confirmPrestige = useCallback(() => {
    setState((s) => prestige(s))
    setShowPrestigeModal(false)
  }, [])

  const handlePurchasePrestigeUpgrade = useCallback((upgradeId: string) => {
    setState((s) => purchasePrestigeUpgrade(s, upgradeId) ?? s)
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
      if (!state.ownedHexIds.has(h.id) && h.terrain !== 'desert') hidden.add(h.id)
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
        total += getProductionPerSecond(hex.terrain, level)
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
      className="parchment-page oregon-capitalist-page"
      style={{
        minHeight: '100vh',
        padding: 24,
        background: 'var(--parchment-bg)',
        color: 'var(--ink)',
        transform: 'translateZ(0)',
        overflowX: 'hidden',
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

      <div
        className="game-layout"
        style={{
          display: 'flex',
          gap: 24,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          transform: 'translateZ(0)',
        }}
      >
        <div
          className="game-board"
          style={{
            flex: '1 1 400px',
            minWidth: 300,
            overflow: 'hidden',
            contain: 'layout paint',
            transform: 'translateZ(0)',
            borderRadius: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--parchment-section, #EEE7D7)',
          }}
        >
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
            background: '#FFFBF0',
            border: '1px solid #D9BDA5',
            borderRadius: 12,
            padding: 20,
            color: '#2A1A0A',
            transform: 'translateZ(0)',
            isolation: 'isolate',
            backfaceVisibility: 'hidden',
          }}
        >
          <button
            type="button"
            onClick={handleReset}
            style={{
              width: '100%',
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 8,
              border: 'none',
              background: '#991B1B',
              color: '#fff',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 700,
              boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            Reset game
          </button>

          {(state.pioneerSpirits ?? 0) > 0 && (
            <div
              style={{
                marginBottom: 16,
                padding: '12px 14px',
                borderRadius: 8,
                background: '#4A6B5A',
                border: '1px solid #3D5A4A',
                fontSize: 13,
                color: '#fff',
                boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 4, color: '#fff' }}>Pioneer Spirits</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{formatNumber(state.pioneerSpirits ?? 0)}</div>
              <div style={{ fontSize: 12, opacity: 0.95, marginTop: 4, color: '#fff' }}>
                +{((state.pioneerSpirits ?? 0) * 2).toFixed(0)}% production
              </div>
            </div>
          )}

          {(() => {
            const claimable = calculateClaimableSpirits(state.lifetimeEarnings ?? 0)
            if (claimable > 0) {
              return (
                <button
                  type="button"
                  onClick={handlePrestige}
                  style={{
                    width: '100%',
                    marginBottom: 16,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '2px solid rgba(234, 179, 8, 0.8)',
                    background: 'rgba(234, 179, 8, 0.4)',
                    color: '#1a1a1a',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 700,
                    boxShadow: '0 2px 4px rgba(234, 179, 8, 0.3)',
                  }}
                >
                  <div>Prestige</div>
                  <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
                    +{formatNumber(claimable)} Spirits
                  </div>
                </button>
              )
            }
            return null
          })()}

          {state.activeEvent && isEventActive(state.activeEvent, Date.now()) && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 12px',
                borderRadius: 8,
                background: 'linear-gradient(90deg, rgba(234,179,8,0.35), rgba(234,179,8,0.2))',
                border: '1px solid #C9A227',
                fontSize: 13,
                color: '#2A1A0A',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 2, color: '#2A1A0A' }}>{state.activeEvent.name}</div>
              <div style={{ fontSize: 12, color: '#2A1A0A', opacity: 0.95 }}>{state.activeEvent.description}</div>
              <div style={{ fontSize: 11, color: '#2A1A0A', opacity: 0.9, marginTop: 4 }}>
                {Math.ceil((state.activeEvent.duration - (Date.now() - state.activeEvent.startTime)) / 1000)}s remaining
              </div>
            </div>
          )}

          <h3 style={{ margin: '0 0 8px', fontSize: 18, color: '#2A1A0A' }}>Money</h3>
          <p style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 700, color: '#2A1A0A' }}>
            {formatNumber(state.money)}
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 12, color: '#2A1A0A', opacity: 0.9 }}>
            +{formatNumber(totalProductionPerSec * 0.5 * getGlobalProgressMoneyMultiplier(state), 2)}/sec
          </p>

          {(() => {
            const harmony = getPioneerHarmonyMultiplier(state)
            if (harmony.multiplier > 1) {
              const thresholdText = harmony.thresholds.length === 1
                ? `All hexes ≥ Lv.${harmony.thresholds[0]}`
                : `All hexes ≥ Lv.${harmony.thresholds.join(', ')}`
              return (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'rgba(139, 174, 155, 0.2)',
                    border: '1px solid #6B8E7A',
                    fontSize: 13,
                    color: '#2A1A0A',
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 2, color: '#2A1A0A' }}>Pioneer Harmony</div>
                  <div style={{ fontSize: 12, color: '#2A1A0A', opacity: 0.95 }}>
                    {thresholdText}: {harmony.multiplier}× money generation
                  </div>
                  {harmony.thresholds.length < GLOBAL_MILESTONES.length && (
                    <div style={{ fontSize: 11, color: '#2A1A0A', opacity: 0.85, marginTop: 4 }}>
                      Next: All hexes ≥ Lv.{GLOBAL_MILESTONES[harmony.thresholds.length]}
                    </div>
                  )}
                </div>
              )
            }
            return null
          })()}

          <h3 style={{ margin: '0 0 12px', fontSize: 18, color: '#2A1A0A' }}>Resources</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(['wood', 'brick', 'sheep', 'wheat', 'ore'] as Terrain[]).map((t) => (
              <div key={t} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: '#2A1A0A' }}>
                <span>{TERRAIN_LABELS[t]}</span>
                <span style={{ fontWeight: 600 }}>{formatNumber(state.resources[t])}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '24px 0 12px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: 18, color: '#2A1A0A' }}>Upgrade hex</h3>
            {hasAutoUpgradeBuff(state.purchasedGlobalBuffs ?? []) && (
              <button
                type="button"
                onClick={handleToggleAutoUpgrade}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: state.autoUpgradePaused ? '1px solid #A86A45' : '1px solid #6B8E7A',
                  background: state.autoUpgradePaused ? '#C17D5B' : '#8BAE9B',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                }}
              >
                {state.autoUpgradePaused ? 'Resume Auto Upgrade' : 'Pause Auto Upgrade'}
              </button>
            )}
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#2A1A0A', opacity: 0.95 }}>
            Cost: money (increases per level)
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from(state.ownedHexIds).map((hexId) => {
              const hex = state.hexes.find((h) => h.id === hexId)
              if (!hex || hex.terrain === 'desert') return null
              const level = state.hexLevels[hexId] ?? 1
              const tier = state.hexTiers?.[hexId] ?? 1
              const { upgradeDiscount } = getAdjacencyMultiplier(hexId, state.hexes, state.ownedHexIds)
              const cost = getUpgradeCost(level, upgradeDiscount)
              const canAfford = state.money >= cost
              const { progress, next: nextMilestone } = progressToNextMilestone(level)
              const { count: maxLevels, cost: totalCostMax } = calculateMaxAffordable(level, state.money, 50, upgradeDiscount)
              const canBuyMax = maxLevels > 0
              const isCelebrating = celebratingMilestoneHexId === hexId
              const hasManager = !!state.hexManagers?.[hexId]
              const cycleProgress = hasManager ? (state.hexProgress?.[hexId] ?? 0) : 0
              const cycleTime = getCycleTime(hex.terrain, level)
              return (
                <div key={hexId} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {isCelebrating && (
                    <div
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        background: 'linear-gradient(90deg, rgba(234,179,8,0.35), rgba(234,179,8,0.2))',
                        border: '1px solid #C9A227',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#2A1A0A',
                        textAlign: 'center',
                        animation: 'pulse 0.5s ease-out',
                      }}
                    >
                      Double Production!
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleUpgrade(hexId)}
                      disabled={!canAfford}
                      style={{
                        flex: '1 1 0',
                        minWidth: 0,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: canAfford ? '1px solid #A86A45' : '1px solid #D9BDA5',
                        background: canAfford ? '#C17D5B' : '#E8E0D5',
                        color: canAfford ? '#fff' : '#5C5348',
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'left',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>
                        {(() => {
                          const visual = getHexVisual(hex.terrain, level)
                          return (
                            <>
                              {visual.name} Lv.{level}
                              {nextMilestone != null && (
                                <span style={{ fontSize: 11, opacity: 0.8, marginLeft: 6 }}>
                                  → {nextMilestone}
                                </span>
                              )}
                            </>
                          )
                        })()}
                      </span>
                      <span>{canAfford ? formatNumber(cost) : `${formatNumber(state.money)}/${formatNumber(cost)}`}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBuyMax(hexId)}
                      disabled={!canBuyMax}
                      title={`Buy up to ${maxLevels} level(s) for ${formatNumber(totalCostMax)}`}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: canBuyMax ? '1px solid #5A7A6A' : '1px solid #D9BDA5',
                        background: canBuyMax ? '#8BAE9B' : '#E8E0D5',
                        color: canBuyMax ? '#fff' : '#5C5348',
                        cursor: canBuyMax ? 'pointer' : 'not-allowed',
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      Buy Max
                    </button>
                  </div>
                  {hasManager && (
                    <div style={{ fontSize: 11, color: '#2A1A0A', opacity: 0.9, marginTop: 2, contain: 'layout paint' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Cycle progress</span>
                        <span>{Math.round(cycleProgress * 100)}%</span>
                      </div>
                      <div
                        className="progress-bar-track"
                        style={{
                          height: 4,
                          borderRadius: 2,
                          background: '#d9d0c4',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: '100%',
                            transform: `scaleX(${Math.min(1, cycleProgress)})`,
                            transformOrigin: 'left',
                            background: 'var(--accent-sage)',
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {nextMilestone != null && (
                    <div style={{ fontSize: 11, color: '#2A1A0A', opacity: 0.9, marginTop: hasManager ? 4 : 0, contain: 'layout paint' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                        <span>Next milestone: Lv.{nextMilestone}</span>
                        <span>{level} / {nextMilestone}</span>
                      </div>
                      <div
                        className="progress-bar-track"
                        style={{
                          height: 4,
                          borderRadius: 2,
                          background: '#d9d0c4',
                          overflow: 'hidden',
                          position: 'relative',
                        }}
                      >
                        <div
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: '100%',
                            transform: `scaleX(${Math.min(1, progress)})`,
                            transformOrigin: 'left',
                            background: 'var(--cta)',
                            borderRadius: 2,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <h3 style={{ margin: '24px 0 12px', fontSize: 18, color: '#2A1A0A' }}>Hire manager</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#2A1A0A', opacity: 0.95 }}>
            Managers enable passive production. Tier must match hex.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from(state.ownedHexIds)
              .filter((hexId) => !state.hexManagers?.[hexId])
              .map((hexId) => {
                const hex = state.hexes.find((h) => h.id === hexId)
                if (!hex || hex.terrain === 'desert') return null
                const tier = state.hexTiers?.[hexId] ?? 1
                const cost = getHireCost(tier, state.prestigeUpgrades, state.activeEvent)
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
                      border: canAfford ? '1px solid #5A7A6A' : '1px solid #D9BDA5',
                      background: canAfford ? '#8BAE9B' : '#E8E0D5',
                      color: canAfford ? '#fff' : '#5C5348',
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                      fontSize: 13,
                      fontWeight: 600,
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

          <h3 style={{ margin: '24px 0 12px', fontSize: 18, color: '#2A1A0A' }}>Global buffs</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#2A1A0A', opacity: 0.95 }}>
            Boost all production. Unlocks with managers + hexes.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
            {purchasedBuffs.map((b) => (
              <div
                key={b.id}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: 'rgba(34, 197, 94, 0.2)',
                  border: '1px solid #22C55E',
                  fontSize: 13,
                  color: '#2A1A0A',
                  fontWeight: 500,
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
                    border: canAfford ? '1px solid #4A5AB8' : '1px solid #D9BDA5',
                    background: canAfford ? '#5C6BC0' : '#E8E0D5',
                    color: canAfford ? '#fff' : '#2A1A0A',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    fontWeight: 600,
                    textAlign: 'left',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ color: 'inherit' }}>{buff.name} — {buff.description}</span>
                  <span style={{ color: 'inherit', flexShrink: 0, marginLeft: 8 }}>{canAfford ? formatNumber(buff.cost) : `${formatNumber(state.money)}/${formatNumber(buff.cost)}`}</span>
                </button>
              )
            })}
            {purchasedBuffs.length === 0 && availableBuffs.length === 0 && (
              <p style={{ margin: 0, fontSize: 12, color: '#2A1A0A', opacity: 0.9 }}>
                Hire managers and unlock hexes to unlock buffs.
              </p>
            )}
          </div>

          {(state.pioneerSpirits ?? 0) > 0 && (
            <>
              <h3 style={{ margin: '24px 0 12px', fontSize: 18, color: '#2A1A0A' }}>Spirit Shop</h3>
              <p style={{ margin: '0 0 8px', fontSize: 13, color: '#2A1A0A', opacity: 0.95 }}>
                Permanent upgrades that persist through prestige.
              </p>
              {hasAutoSpiritShopBuff(state.purchasedGlobalBuffs ?? []) && (
                <button
                  type="button"
                  onClick={handleToggleAutoSpiritShop}
                  style={{
                    width: '100%',
                    marginBottom: 8,
                    padding: '6px 12px',
                    borderRadius: 8,
                    border: state.autoSpiritShopPaused ? '1px solid #A86A45' : '1px solid #6B8E7A',
                    background: state.autoSpiritShopPaused ? '#C17D5B' : '#8BAE9B',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                  }}
                >
                  {state.autoSpiritShopPaused ? 'Resume Auto Spirit Shop' : 'Pause Auto Spirit Shop'}
                </button>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {PRESTIGE_SHOP.map((upgrade) => {
                  const currentLevel = state.prestigeUpgrades?.[upgrade.id] ?? 0
                  const cost = upgrade.cost * (currentLevel + 1)
                  const canAfford = (state.pioneerSpirits ?? 0) >= cost
                  return (
                    <button
                      key={upgrade.id}
                      onClick={() => handlePurchasePrestigeUpgrade(upgrade.id)}
                      disabled={!canAfford}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: canAfford ? '1px solid #C9A227' : '1px solid #D9BDA5',
                        background: canAfford ? '#E8D080' : '#E8E0D5',
                        color: canAfford ? '#2A1A0A' : '#5C5348',
                        cursor: canAfford ? 'pointer' : 'not-allowed',
                        fontSize: 13,
                        fontWeight: 600,
                        textAlign: 'left',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>
                          {upgrade.name}
                          {currentLevel > 0 && <span style={{ fontSize: 11, opacity: 0.9 }}> (Lv.{currentLevel})</span>}
                        </span>
                        <span>{canAfford ? formatNumber(cost) : `${formatNumber(state.pioneerSpirits ?? 0)}/${formatNumber(cost)}`}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'inherit', opacity: 0.9 }}>{upgrade.description}</div>
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <h3 style={{ margin: '24px 0 12px', fontSize: 18, color: '#2A1A0A' }}>Unlock hex</h3>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#2A1A0A', opacity: 0.95 }}>
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
                    border: canAfford ? '1px solid #5A7A6A' : '1px solid #D9BDA5',
                    background: canAfford ? '#8BAE9B' : '#E8E0D5',
                    color: canAfford ? '#fff' : '#5C5348',
                    cursor: canAfford ? 'pointer' : 'not-allowed',
                    fontSize: 13,
                    fontWeight: 600,
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
              <p style={{ margin: 0, fontSize: 12, color: '#2A1A0A', opacity: 0.9 }}>
                Unlock adjacent hexes by collecting resources.
              </p>
            )}
          </div>
        </aside>
      </div>

      {showOfflineModal && offlineEarnings && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setShowOfflineModal(false)}
        >
          <div
            style={{
              background: 'var(--parchment-bg)',
              borderRadius: 12,
              padding: 24,
              maxWidth: 400,
              color: 'var(--ink)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: 22 }}>Welcome Back!</h2>
            <p style={{ margin: '0 0 8px', fontSize: 14, opacity: 0.9 }}>
              You were gone for {formatTimeAway(offlineEarnings.timeAway)}.
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>
              Your managers earned: {formatNumber(offlineEarnings.earnings)}
            </p>
            <button
              type="button"
              onClick={() => setShowOfflineModal(false)}
              style={{
                width: '100%',
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--cta)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showPrestigeModal &&
        createPortal(
          (() => {
            const claimable = calculateClaimableSpirits(state.lifetimeEarnings ?? 0)
            const newTotalSpirits = (state.pioneerSpirits ?? 0) + claimable
            const productionBonus = newTotalSpirits * 2
            return (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0,0,0,0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  zIndex: 10000,
                  overflowY: 'auto',
                  padding: '20px',
                }}
                onClick={() => setShowPrestigeModal(false)}
              >
            <div
              style={{
                background: '#FFFBF0',
                border: '1px solid #D9BDA5',
                borderRadius: 12,
                padding: 24,
                maxWidth: 480,
                color: '#2A1A0A',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <h2 style={{ margin: '0 0 16px', fontSize: 24, fontWeight: 700 }}>Prestige?</h2>
              
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 600 }}>
                  You will earn: <span style={{ color: 'var(--cta)' }}>{formatNumber(claimable)} Pioneer Spirits</span>
                </p>
                
                <div style={{ marginBottom: 12, padding: '12px', background: 'rgba(139, 174, 155, 0.15)', borderRadius: 8 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Benefits:</div>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 1.6 }}>
                    <li><strong>+{productionBonus}% production</strong> (2% per Spirit, stacks permanently)</li>
                    <li>Spend Spirits in the <strong>Spirit Shop</strong> for permanent upgrades:</li>
                    <ul style={{ marginTop: 4, paddingLeft: 16 }}>
                      <li>Manifest Destiny: 5+ level hexes (max 19)</li>
                      <li>Gold Rush Legacy: Keep 5+ level % money (max 50%)</li>
                      <li>Industrialist: 10+ level % cheaper managers (max 50%)</li>
                    </ul>
                  </ul>
                </div>
              </div>

              <div style={{ marginBottom: 16, padding: '10px', background: 'rgba(185, 28, 28, 0.1)', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>⚠️ What resets:</div>
                <div style={{ fontSize: 12, opacity: 0.9 }}>
                  Money, resources, hex levels, managers, and owned hexes (except starter)
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowPrestigeModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--paper-border)',
                    background: 'transparent',
                    color: 'var(--ink)',
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmPrestige}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: 'none',
                    background: 'rgba(234, 179, 8, 0.6)',
                    color: '#1a1a1a',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Prestige Now
                </button>
              </div>
            </div>
          </div>
            )
          })(),
          document.body
        )}
    </div>
  )
}
