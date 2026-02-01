# Oregon's Omens — Implementation Plan

This document is an **implementation plan only**. No code has been written. It is intended for review and discussion before development begins.

---

## 1. Feature summary

- **Oregon's Omens:** A deck of themed Buff and Debuff cards that interact with resources, building, VP, and the robber.
- **Acquisition:** Spend 1 Wheat, 1 Sheep, 1 Ore to draw one card during the build/trade phase. Optional hand limit (e.g. 5 cards).
- **Buffs:** Go into hand; played on the player’s turn (one play per turn).
- **Debuffs:** Resolve immediately when drawn (no hand).
- **Customization (required):** Players choose at game start whether to play **with** or **without** Oregon’s Omens. When disabled, no deck, no UI, no logic runs.

---

## 2. Where this fits the current codebase

| Spec concept | Current codebase |
|-------------|-------------------|
| Game state | `GameState` in `src/game/types.ts`; initial state in `src/game/state.ts` |
| Player state | `Player` in `src/game/types.ts` (resources, VP, settlementsLeft, etc.) |
| Turn flow | `App.tsx` (single-player) and `MultiplayerGame.tsx` (multiplayer); dice → robber (if 7) → build/trade → end turn |
| Build costs | `getBuildCost`, `canAfford`, `distributeResources` in `src/game/logic.ts` |
| Robber | `robberHexId`, `getPlayersOnHex`, `stealResource`, `distributeResources` (skips robber hex) in `src/game/logic.ts` |
| Trade rate | `getTradeRate`, `getPlayerHarborType` in `src/game/logic.ts` |
| Longest road | `calculateLongestRoad`, `updateLongestRoad` in `src/game/logic.ts` |
| AI | `src/game/ai.ts` (runAITurn, runAITrade, runAIRobberMove, runAISelectPlayerToRob) |
| Multiplayer sync | Supabase `games.state` JSONB; `sendStateUpdate` in `MultiplayerGame.tsx` |

All new Omens state, deck, and effects must be **optional**: when the game is created without Omens, these fields are absent or empty and no Omens logic runs.

---

## 3. Implementation phases (high level)

### Phase 0: Game option and state shape (no cards yet)

- **Goal:** Add “Oregon’s Omens: on/off” and ensure one code path creates games with Omens, one without.
- **Where:** Game creation entry points (single-player: after color selection; multiplayer: lobby/start game).
- **Deliverables:**
  - A game option, e.g. `gameOptions: { oregonsOmens: boolean }`, passed into `createInitialState` (and stored in multiplayer if we persist options).
  - `createInitialState(numPlayers, selectedColors, options)` extended with `options?.oregonsOmens`.
  - When `oregonsOmens === false` or unset: no Omens state added; existing behavior unchanged.
  - When `oregonsOmens === true`: add the new state fields (deck, discard, activeEffects, and per-player `omensHand`, `hasDrawnOmenThisTurn`, `hasPlayedOmenThisTurn`). Deck can be empty in Phase 0.
- **State shape (when Omens enabled):** See Section 4 below. Phase 0 only adds the fields and the branch “if Omens disabled, skip all Omens logic.”

---

### Phase 1: Deck and draw (no effects)

- **Goal:** Define the deck (card IDs), shuffle it, and implement “Draw Omen Card” (cost 1W, 1S, 1O; hand limit optional).
- **Deliverables:**
  - Constants: list of card IDs by type (BUFF_IDS, DEBUFF_IDS) and a full deck recipe (e.g. 2–3× each buff, 1–2× each debuff).
  - `createOmensDeck(): string[]` — build and shuffle deck.
  - In `createInitialState`, when Omens enabled: set `omensDeck`, `omensDiscardPile`, `activeOmensEffects`; per player set `omensHand: []`, `hasDrawnOmenThisTurn: false`, `hasPlayedOmenThisTurn: false`.
  - `canDrawOmenCard(state, playerId): boolean` — phase playing, current player, has 1W+1S+1O, hand &lt; 5 (if limit), !hasDrawnOmenThisTurn.
  - `drawOmenCard(state, playerId): GameState` — deduct resources, set hasDrawnOmenThisTurn, pop from deck (refill from discard if empty), push to player’s omensHand. If drawn card is debuff: immediately move to discard and call “apply debuff” (Phase 3); for now “apply debuff” can be a no-op stub.
  - UI: “Draw Omen Card” button (greyed when can’t draw). No need yet to show card text or “Play” for buffs.
  - **Multiplayer:** `drawOmenCard` (or equivalent) must run in a single place and broadcast updated state (e.g. client sends “draw omen” and server or authoritative client computes new state and pushes to Supabase).

---

### Phase 2: Buffs — play from hand (infrastructure only)

- **Goal:** Allow playing a buff card from hand (one per turn), move card to discard, and stub “apply buff” so that no real effect happens yet.
- **Deliverables:**
  - `canPlayOmenCard(state, playerId, cardId): boolean` — phase playing, current player, card in hand, !hasPlayedOmenThisTurn, and any card-specific preconditions (e.g. Strategic Settlement Spot requires settlementsLeft &gt; 0).
  - `playOmenCard(state, playerId, cardId, ...targets): GameState` — set hasPlayedOmenThisTurn, remove card from hand, add to discard, then call `applyBuffEffect(state, cardId, playerId, targets)` (stub in Phase 2).
  - UI: show hand (list of card IDs or names); click card → detail popup with “Play” button (disabled when can’t play). For cards that need a target (e.g. hex, player), UI must collect target before confirming play.
  - **No actual effects yet** — e.g. Forager’s Bounty doesn’t give resources; Master Builder’s Plan doesn’t build. That comes in Phase 3.

---

### Phase 3: Implement card effects

- **Goal:** Implement every Buff and Debuff effect so that drawing/playing cards actually changes resources, VP, robber, build costs, production, trade rate, or structure removal.
- **Approach:**
  - **Central registry:** One module (e.g. `src/game/omens.ts` or `src/game/omens/effects.ts`) that defines for each cardId: type (buff/debuff), effect kind (immediate resource, cost mod, production mod, robber, free build, VP, etc.), and parameters.
  - **Active effects:** `activeOmensEffects` entries have a clear schema (e.g. `{ cardId, playerId, turnsRemaining?, rollsRemaining?, appliedEffect: { type, ... } }`). When applying production, build cost, or trade rate, existing logic (e.g. `distributeResources`, `getBuildCost`, `getTradeRate`) must be **effect-aware**: they take `state` and optionally `activeOmensEffects` (or a precomputed “modifiers” object) and adjust values.
  - **Order of implementation (suggested):**
    1. **Immediate resource / VP** — Forager’s Bounty, Skilled Prospector, Hidden Cache, Gold Rush!, Manifest Destiny; Dust Storm, Smallpox Scare, Lost Supplies, Bandit Ransom, Wagon Overturned! (resource part), Dysentery (resource part). No ongoing state.
    2. **Cost modifiers (road/settlement/city)** — Sturdy Wagon Wheel, Worn Out Tool, Strategic Settlement Spot, Broken Wagon Axle. One-off or “until next build/turn” effects stored in activeOmensEffects and cleared when condition is met or turn ends.
    3. **Production modifiers** — Reliable Harvest, Bountiful Pastures, Confusing Tracks, Drought, Dysentery Outbreak, Famine/Pestilence. Stored by rollsRemaining (or turnsRemaining); `distributeResources` (or a wrapper) consults activeOmensEffects and adjusts per-hex or per-player gains.
    4. **Trade rate** — Friendly Trade Caravan (one-time 2:1), Poor Trade Season (next 2 trades worse). `getTradeRate` becomes effect-aware or we pass an optional “trade rate modifier” for the current player.
    5. **Robber** — Resource Theft, Robber Baron’s Demand, Robber’s Regret. Reuse `stealResource`, move `robberHexId`; for Robber’s Regret allow moving to any hex (and optionally desert) and stealing from a chosen player on that hex.
    6. **Free builds** — Master Builder’s Plan (free road + settlement), Boomtown Growth (free city upgrade). Call into existing place road / place settlement / place city logic with a “cost waived” flag or by temporarily setting cost to 0 for that action only.
    7. **Placement flexibility** — Pathfinder’s Insight: next road doesn’t need adjacency. This requires a one-off flag or activeEffect that `canPlaceRoad` (or equivalent) checks.
    8. **Protection** — Well-Stocked Pantry: negate next single resource loss. Stored as activeEffect with triggerCondition `on_resource_loss`; when any effect or robber would remove a resource from this player, consume the effect and cancel the loss once.
    9. **Structure removal** — Mass Exodus: remove one settlement, lose 1 VP. Modify vertices and players (settlementsLeft +1, victoryPoints -1).
    10. **Build restriction** — Wagon Overturned!: cannot build for next turn. activeEffect with turnsRemaining 1; build actions check this before allowing build.
- **Turn/roll bookkeeping:** At start of turn, reset hasDrawnOmenThisTurn and hasPlayedOmenThisTurn; decrement turnsRemaining (or rollsRemaining) for relevant activeOmensEffects; remove expired effects. When dice are rolled, decrement “rolls” effects and apply production modifiers during distribution.

---

### Phase 4: UI/UX polish

- **Goal:** Clear, accessible Omens UI and feedback.
- **Deliverables:**
  - “Draw Omen Card” button in the same area as other actions (e.g. next to build buttons), disabled when conditions not met; tooltip or label showing cost (1 Wheat, 1 Sheep, 1 Ore).
  - Omen hand: visible list or collapsed “Omens (N)” that expands to show cards; each card clickable for detail + Play.
  - Card detail: name, flavor text, effect text, “Play” (or “Drawn – effect applied” for debuffs).
  - Active effects: small list or icons for current player’s active effects (e.g. “Sturdy Wagon Wheel: next road −1 Wood/Brick”; “Drought: 2 rolls left”). Optionally show on hexes (e.g. drought overlay on wheat hexes).
  - Debuff feedback: when a debuff is drawn, prominent message (e.g. red banner) similar to lastRobbery, so the player sees what happened.
  - Robber cards: when Robber’s Regret or Robber Baron’s Demand is played, UI mode for “select hex” / “select player” as per card rules (any hex vs hex with opponent, etc.).

---

### Phase 5: AI (single-player)

- **Goal:** AI (Player 2) can draw and play Omens sensibly.
- **Deliverables:**
  - **When to draw:** If Omens enabled and AI has 1W+1S+1O and hand &lt; 5 and !hasDrawnOmenThisTurn, consider drawing. Configurable risk (e.g. avoid if close to 10 VP to not risk a game-losing debuff). Optionally prefer drawing when low on VP or when a specific buff would help (harder to quantify).
  - **When to play:** At start of AI turn or during build phase, if hasPlayedOmenThisTurn is false, evaluate hand. Priority order suggested by spec: Manifest Destiny if wins; then cost reducers (Strategic Settlement Spot, Master Builder’s Plan, Boomtown Growth); then resource gains (Forager’s Bounty, Skilled Prospector, Gold Rush!, Hidden Cache); Robber’s Regret if good target; production boosts (Reliable Harvest, Bountiful Pastures) before rolling or early turn.
  - **Targeting:** For Robber’s Regret, choose player (and hex) to maximize stolen resources or block a leader.
  - Debuffs: no AI “play” decision; debuffs are applied when drawn same as for humans.

---

### Phase 6: Multiplayer and persistence

- **Goal:** Omens work in multiplayer; state survives refresh and reconnects.
- **Deliverables:**
  - Full game state (including omensDeck, omensDiscardPile, activeOmensEffects, and each player’s omensHand and flags) lives in `games.state` and is synced via Supabase Realtime.
  - Game creation (lobby) includes “Oregon’s Omens: Yes/No” and stores it (e.g. in game row or in state) so all clients and rebuilds see the same option.
  - No client-only Omens state that would desync (e.g. “draw” and “play” must result in a single updated state that is broadcast).

---

## 4. State shape (when Omens enabled)

- **GameState (additions):**
  - `omensDeck: string[]` — card IDs in draw pile.
  - `omensDiscardPile: string[]` — card IDs discarded/played.
  - `activeOmensEffects: Array<{ cardId: string; playerId: PlayerId; turnsRemaining?: number; rollsRemaining?: number; endsTurn?: number; appliedEffect: object; triggerCondition?: string }>` — ongoing effects. Exact `appliedEffect` shape per effect type (cost_mod, production_halt, trade_rate_mod, etc.) to be defined in implementation.
- **Player (additions):**
  - `omensHand: string[]` — card IDs in hand.
  - `hasDrawnOmenThisTurn: boolean` — default false; reset at start of turn.
  - `hasPlayedOmenThisTurn: boolean` — default false; reset at start of turn.

When Omens is **disabled**, these fields can be omitted or set to empty/default so that all Omens logic is gated on “state.omensDeck != null” or “gameOptions.oregonsOmens === true” (depending on where the option is stored).

---

## 5. Files to add or touch (checklist)

- **New files (suggested):**
  - `src/game/omens.ts` (or `src/game/omens/index.ts`) — deck recipe, card IDs, BUFF_IDS, DEBUFF_IDS, createOmensDeck.
  - `src/game/omens/effects.ts` (or same file) — applyBuffEffect, applyDebuffEffect, and helpers for cost/production/trade modifiers.
  - Optional: `src/game/omens/cardCatalog.ts` — human-readable names and effect text for UI.
- **Types:** `src/game/types.ts` — extend GameState and Player with Omens fields (or a separate OmensState interface that is optional).
- **State:** `src/game/state.ts` — createInitialState branches on options.oregonsOmens; when true, init deck and player Omens fields.
- **Logic:** `src/game/logic.ts` (or omens module) — canDrawOmenCard, drawOmenCard, canPlayOmenCard, playOmenCard; integrate cost/production/trade modifiers into getBuildCost, distributeResources, getTradeRate (or wrappers used only when Omens enabled).
- **Turn flow:** `App.tsx`, `MultiplayerGame.tsx` — start-of-turn reset of hasDrawnOmenThisTurn / hasPlayedOmenThisTurn; decrement activeOmensEffects; call draw/play handlers; grey out “Draw Omen” when not allowed.
- **UI:** `PlayerResources.tsx` or a new `OmensHand.tsx` — Draw Omen button, hand list, card detail modal, “Play” and target selection for robber cards. Optional: small “Active effects” component.
- **AI:** `src/game/ai.ts` — runAIDrawOmen?, runAIPlayOmen?; integrate into turn flow (after roll, before or after build/trade).
- **Game Guide:** Add a short “Oregon’s Omens” section when the feature is present (or always, explaining it’s optional and how it works when enabled).

---

## 6. Decisions to align on before coding

1. **Where is “Oregon’s Omens: on/off” chosen?**  
   - Single-player: e.g. on mode/color screen before starting.  
   - Multiplayer: lobby (host chooses? or vote?). Need a single source of truth (e.g. in `games` row or inside `state`).

2. **Hand limit:** Use 5 cards max or no limit? Spec says “optional but recommended” — confirm.

3. **Deck size and mix:** Exact counts per card (2–3× buffs, 1–2× debuffs) — do you want a proposed default list in the plan, or will you provide it?

4. **“Turn” for effects:** Some effects last “next 2 dice rolls” vs “next 2 turns.” Our game doesn’t have an explicit turn counter today — add `turnCount` (incremented on end turn) for effects that last N turns, or define “turn” as “current player’s turn” and store `endsOnPlayerIndex` / `endsTurnCount`?

5. **Robber’s Regret — desert:** Spec says “move the robber to any hex (desert or not).” So desert is allowed; confirm. Also confirm: after moving, if that hex has any player’s structures, the *player who played the card* chooses one of those players and steals one resource (could be from themselves if they’re on the hex — spec says “including the player who played the card”).

6. **Well-Stocked Pantry:** “Negates the next single resource loss from any source.” So one loss only (e.g. one robber steal, or one “lose 1 resource” from a debuff). Confirm: if multiple resources would be lost at once (e.g. Bandit Ransom: 2 random), does Pantry cancel one of them or the whole thing? Spec says “next single resource loss” — we’ll interpret as one resource, so Pantry would cancel one of the two from Bandit Ransom and the player would lose the other.

7. **Backward compatibility:** Existing saved games (multiplayer) or in-memory state (single-player) have no Omens fields. Code must treat “no omensDeck” or “oregonsOmens false” as “Omens disabled” everywhere (no button, no hand, no effects).

---

## 7. Suggested order of implementation

1. **Phase 0** — Option + state shape + branch “Omens off” so base game unchanged.  
2. **Phase 1** — Deck + draw + cost; no real debuff effects yet (stub).  
3. **Phase 2** — Play from hand (stub apply buff).  
4. **Phase 3** — Implement effects in the order listed (immediate resources/VP first, then cost/production/trade, then robber, free builds, placement, protection, structure removal, build restriction).  
5. **Phase 4** — UI polish.  
6. **Phase 5** — AI.  
7. **Phase 6** — Multiplayer/persistence and lobby option.

---

## 8. Summary

- **Oregon’s Omens** is a full card subsystem (deck, draw, hand, play, active effects) that hooks into resources, building, production, trade, robber, and VP.
- **Optional:** When “Oregon’s Omens” is off, no state, no UI, no logic — base game unchanged.
- **Plan:** Six phases (option + state → draw → play infrastructure → all effects → UI → AI → multiplayer). Key integration points: `createInitialState`, turn start/end, `distributeResources`, `getBuildCost`, `getTradeRate`, robber movement/steal, and build/placement checks.
- **Decisions:** Game option location, hand limit, deck mix, turn/roll counting for effects, Robber’s Regret and Well-Stocked Pantry details, and backward compatibility are called out for discussion before implementation.

Once you’re happy with this plan and the open points above, we can break Phase 0 into concrete tasks and implement step by step.
