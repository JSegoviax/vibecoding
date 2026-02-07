# Oregon Capitalist — Game Mechanics Reference (AI-Oriented)

This document describes all gameplay mechanics in Oregon Capitalist, an idle/clicker game on a hex board. It is written for AI agents that need to reason about or modify the game logic.

---

## 1. Overview

Oregon Capitalist is a single-player idle game where the player:
- Owns hexes on a Catan-style 19-hex board
- Produces resources (wood, brick, sheep, wheat, ore) via clicking and passive generation
- Earns money from resource production
- Unlocks adjacent hexes (fog-of-war), upgrades hexes, hires managers, and buys global buffs

**Two currencies:**
- **Resources**: wood, brick, sheep, wheat, ore (desert produces nothing)
- **Money**: earned from production, spent on upgrades, managers, and global buffs

---

## 2. Board Structure

### Hex Grid
- 19 hexes in axial coordinates (q, r)
- Layout: Catan-shaped (3 rows of 2–5–6–5–2 hexes)
- Each hex has: `id` (e.g. `h0,-1`), `q`, `r`, `terrain`, `number` (unused in idle mode)
- Hex IDs: `h${q},${r}`

### Terrain Distribution (per board creation)
- 4 wood, 4 brick, 4 wheat, 3 sheep, 3 ore, 1 desert
- Shuffled at board creation; terrain is fixed per run
- Desert hexes cannot be owned or produce

### Adjacency
- Six neighbors per hex: `(dq, dr)` in `[[1,0], [1,-1], [0,-1], [-1,0], [-1,1], [0,1]]`
- A hex is unlockable only if it is adjacent to at least one owned hex
- Only non-desert hexes can be unlocked

---

## 3. Core State

```ts
OregonCapitalistState {
  hexes: Hex[]
  ownedHexIds: Set<string>
  resources: Record<Terrain, number>   // wood, brick, sheep, wheat, ore, desert (desert unused)
  money: number
  hexLevels: Record<string, number>    // hexId -> level (default 1)
  hexTiers: Record<string, number>     // hexId -> tier (set at unlock)
  hexManagers: Record<string, number>  // hexId -> manager tier (absent = no manager)
  purchasedGlobalBuffs: string[]
  autoUpgradePaused?: boolean          // when true, Auto Hex Upgrader does not run
  lastTickTimestamp: number
}
```

---

## 4. Production

### Passive vs Click Production
- **Passive production**: Only hexes with a hired manager produce over time
- **Click production**: Any owned non-desert hex produces when clicked (regardless of manager)

### Production Formulas

**Base values (constants):**
- `BASE_PRODUCTION = 0.5` (for passive per-second)
- `CLICK_PRODUCTION_BASE = 1` (for click)
- `BASE_MULTIPLIER_PER_TIER = 1.4`
- `CURVE_EXPONENT_BASE = 1.0`
- `CURVE_EXPONENT_PER_TIER = 0.02`
- `MONEY_PER_RESOURCE = 0.5` (money earned per 1 resource produced)

**Production per second (passive):**
```
base = BASE_PRODUCTION * (BASE_MULTIPLIER_PER_TIER ^ (tier - 1))
exponent = CURVE_EXPONENT_BASE + (tier - 1) * CURVE_EXPONENT_PER_TIER
perSecond = base * (level ^ exponent)
```

**Click production (one click):**
- Same formula but with `CLICK_PRODUCTION_BASE` instead of `BASE_PRODUCTION`

**Global multiplier:**
- All production (passive and click) is multiplied by `getGlobalProductionMultiplier(purchasedGlobalBuffs)`
- Multipliers from buffs stack multiplicatively (e.g. 1.5× and 2× → 3×)

### Tick (game loop)
- Runs every 100ms (client-side)
- `elapsed = min(now - lastTickTimestamp, 24 hours)` (capped to prevent runaway)
- For each owned hex with a manager: add passive resources and money
- After tick, if Auto Hex Upgrader is purchased and not paused: `applyAutoUpgrades` runs

---

## 5. Hex Tier and Level

### Tier
- Set once when the hex is **unlocked**
- Formula: `tier = 1 + (number of owned hexes of the same terrain type)`
- Example: first wood hex → tier 1; second wood hex → tier 2; etc.
- Higher tier → higher base production and better level scaling
- Cannot be changed after unlock

### Level
- Starts at 1 for every newly unlocked hex
- Increased by **upgrading** (costs money)
- Formula for upgrade cost: `getUpgradeCost(level) = floor(50 * 1.07^level)`
- Higher level → more production for that hex (within its tier curve)

---

## 6. Unlocking Hexes

### Unlockability
- Hex must be **adjacent** to at least one owned hex
- Hex must not be desert
- Player must meet the **unlock requirement** (resource cost)

### Unlock Cost (base)
```
base = floor(15 * 1.15^hexIndex)
productionScale = max(1, 1 + totalProductionPerSec / 5)
cost = floor(base * productionScale)
```
- `hexIndex = ownedCount - 1` (0-indexed: first unlock uses index 0)
- Cost scales with number of hexes already owned and with total passive production per second

### Unlock Requirements (what to pay)
Deterministic per `(hexId, ownedCount)`. Uses `hashToUint32(hexId + ":" + ownedCount)` as seed.

**Early game (ownedCount < 5):**
- `kind: 'anySingle'`: Pay `cost` of **any one** resource type (wood, brick, sheep, wheat, ore)
- Avoids deadlock when player has only one resource type

**Mid/late game (ownedCount >= 5):**
- `producedPool` = terrain types the player currently owns (produces)
- If producedPool is empty, falls back to all five payable terrains
- Roll = seed % 100; probabilities depend on ownedCount:
  - **Specific (single resource)**: ~20–35% — must pay `cost` of one specific terrain from producedPool
  - **Two resources** (ownedCount >= 10, producedPool.length >= 2): ~45–55% — split cost 60/40 between two terrains from producedPool
  - **Three resources** (ownedCount >= 18, producedPool.length >= 3): ~15% — split cost 50/30/20
  - **Fallback**: anySingle
- All required terrains are always from producedPool → no deadlock (player can always produce them)

### Result of Unlock
- Resources deducted per requirement
- Hex added to `ownedHexIds`
- `hexLevels[hexId] = 1`, `hexTiers[hexId] = tier` (tier from same-terrain count)

---

## 7. Upgrading Hexes

### Upgrade
- Cost: money only — `getUpgradeCost(level) = floor(50 * 1.07^level)`
- Effect: `hexLevels[hexId] += 1`
- Increases both passive and click production for that hex (via level in the production formula)

### Auto Hex Upgrader (global buff)
- When purchased and `autoUpgradePaused` is false:
  - After each tick, repeatedly finds cheapest affordable upgrade
  - Applies upgrade, then re-checks until no hex can be afforded
- Order: always upgrade **cheapest** hex first
- Player can toggle "Pause Auto Upgrade" to stop this behavior (state: `autoUpgradePaused`)

---

## 8. Managers

### Hiring
- Cost: money — `getHireCost(tier) = floor(100 * 2.5^(tier - 1))`
- **Constraint**: Manager tier must equal hex tier (tier N manager only for tier N hex)
- One manager per hex; hiring sets `hexManagers[hexId] = tier`

### Effect
- Enables **passive production** for that hex
- Without manager: hex only produces on click
- With manager: hex produces every tick based on elapsed time

### Manager names (cosmetic)
- Tier 1: Hired Hand, 2: Laborer, 3: Foreman, 4: Camp Boss, 5: Supervisor, 6: Trail Boss, 7: Superintendent, 8: Claim Keeper, 9: Factor, 10: Wagon Master

---

## 9. Global Buffs

### Production buffs (multipliers)
| ID            | Name               | Multiplier | Cost   | Min Managers | Min Hexes |
|---------------|--------------------|------------|--------|--------------|-----------|
| prod_1_5x     | Modest Boost       | 1.5×       | 500    | 1            | 2         |
| prod_2x       | Double Production  | 2×         | 2,000  | 2            | 3         |
| prod_3x       | Triple Production  | 3×         | 10,000 | 3            | 5         |
| prod_5x       | Production Surge   | 5×         | 50,000 | 4            | 7         |

- Applied multiplicatively to all production (passive + click)
- Example: Modest Boost + Double Production → 1.5 * 2 = 3× total

### Behavior buffs
| ID               | Name             | Cost   | Min Managers | Min Hexes | Effect                         |
|------------------|------------------|--------|--------------|-----------|--------------------------------|
| auto_hex_upgrader| Auto Hex Upgrader| 25,000 | 3            | 4         | Auto-upgrades hexes when able  |

- `autoUpgrade` flag: when true, enables automatic hex upgrading after each tick
- Can be paused via `autoUpgradePaused` (player toggle)

### Unlock conditions
- Buff is **available** when: not purchased, `managersHired >= minManagersRequired`, `hexesOwned >= minHexesRequired`
- Purchase: deduct `cost` money, add buff id to `purchasedGlobalBuffs`

---

## 10. Business Names (cosmetic)

Each terrain has 10 tiered names. `getBusinessName(terrain, tier)` returns the name for that tier (1–10).
Examples: wood → Campfire, Chopping Block, …, Lumber Dynasty; sheep → Stray Flock, Sheep Pen, …, Wool Dynasty.

---

## 11. Game Flow (per tick)

1. **Tick**: Compute elapsed time; for each managed hex, add passive resources and money; cap elapsed at 24h
2. **applyAutoUpgrades** (if buff owned and not paused): repeatedly upgrade cheapest affordable hex until none left
3. Save state to localStorage periodically (e.g. every 5 seconds)

---

## 12. Persistence

State saved to localStorage includes:
- hexes, ownedHexIds, resources, money, hexLevels, hexTiers, hexManagers
- purchasedGlobalBuffs, autoUpgradePaused, lastTickTimestamp
- On load: run tick to catch up offline time (up to 24h cap)

---

## 13. Key Functions Reference

| Function                    | Purpose                                                       |
|----------------------------|---------------------------------------------------------------|
| `tick(state, now)`         | Apply passive production; update lastTickTimestamp           |
| `applyAutoUpgrades(state)` | If buff + not paused, upgrade hexes until unaffordable       |
| `produceFromClick(state, hexId)` | Add click production for one hex                         |
| `unlockHex(state, hexId, ownedCount)` | Unlock adjacent hex if requirement met                 |
| `upgradeHex(state, hexId)` | Spend money to increase hex level                            |
| `hireManager(state, hexId)`| Hire manager for hex (tier must match)                        |
| `purchaseGlobalBuff(state, buffId)` | Buy global buff if affordable and requirements met    |
| `getUnlockRequirement(state, hexId, ownedCount)` | Get deterministic cost/requirement for unlock      |
| `canAffordUnlock(state, req)` | Check if player has resources for requirement              |
| `getTotalProductionPerSec(state)` | Sum passive production (managed hexes only, with mult)  |

---

## 14. Design Invariants (for implementers)

1. **No deadlock on unlock**: Unlock requirements only use terrains the player already produces.
2. **Deterministic unlock costs**: Same hexId + ownedCount always yields same requirement.
3. **Tier assignment**: Tier = 1 + count of same-terrain owned hexes at unlock time.
4. **Manager gating**: Passive production requires a manager; click production does not.
5. **Desert exclusion**: Desert hexes are never owned, produced from, or unlockable.
6. **Adjacency gating**: Only hexes adjacent to owned hexes can be unlocked.
