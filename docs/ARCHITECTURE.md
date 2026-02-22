# Settlers of Oregon — Architecture & How Everything Works

This document describes how the codebase is structured, where key logic lives, and how data and control flow through the app.

---

## 1. Entry and routing

- **`src/main.tsx`** – Renders `<App />` into `#root`; typically wrapped with `BrowserRouter`.
- **`src/App.tsx`** – Top-level router: defines routes (e.g. `/`, `/game`, `/how-to-play`, `/multiplayer`, `/faq`) and renders the appropriate page component. Also holds shared layout (header, etc.) where applicable.
- **Pages** live in **`src/pages/`**:
  - **SettlersGamePage.tsx** – Single-player game (vs AI). Creates game via `createInitialState`, holds `game` in React state, drives roll order → setup → playing; wires dice, build, trade, robber, and AI turn/offer-to-AI.
  - **MultiplayerGame.tsx** – Remote multiplayer: loads/syncs game state from Supabase, sends updates via `sendStateUpdate`; same board and rules, different state source and turn enforcement.
  - **MultiplayerLobby** / **GameRoom** (or equivalent) – Create/join game, then navigate to the game screen with `gameId` and `myPlayerIndex`.
  - **HowToPlayPage**, **FAQPage** – Static content.

---

## 2. Game state and creation

- **`src/game/types.ts`** – Core types: `GameState`, `Player`, `Vertex`, `Edge`, `Terrain`, `PlayerId`, `GamePhase`. Includes roll-order and setup fields (`orderRolls`, `orderTiebreak`, `setupPlacements`, `setupPendingVertexId`, etc.) and optional Omens fields.
- **`src/game/state.ts`** –  
  - **`createInitialState(numPlayers, colors, options)`** – Builds initial board (hexes, vertices, edges, harbors), players, roll_order phase, desert robber. If `options?.oregonsOmens`, adds Omens deck and per-player Omen state.  
  - **`applyRollOrderRoll(state, playerIndex, diceSum)`** – Handles one player’s roll in roll_order; updates rolls, detects ties, runs tiebreak rounds, and when done sets `setupOrder` and transitions to `setup`.  
  - **`getSetupOrderSequence`**, **`getNextPlayerIndex`**, **`getFirstPlayerIndex`** – Use `setupOrder` (and current index) for setup and playing turn order.

State is **immutable**: updates are done by creating new objects (e.g. `{ ...state, players: [...] }`), not mutating in place.

---

## 3. Board and topology

- **`src/game/board.ts`** – Builds the hex grid (axial coords), terrain and number assignment.
- **`src/game/topology.ts`** – **`buildTopology(hexes)`** produces **vertices** and **edges** from hex layout (intersections and sides).
- **`src/game/harbors.ts`** – Assigns harbors to coastal edges (generic 3:1 and specific 2:1).
- **`src/components/HexBoard.tsx** – Renders the SVG board: hexes, number tokens, vertices (settlements/cities and placeable spots), edges (roads and placeable roads), harbors. Receives **vertexStates**, **edgeStates**, **highlightedVertices**, **highlightedEdges**, and callbacks **selectVertex**, **selectEdge**, **selectHex** (robber). Uses **data-board-interactive** on clickable elements so **ZoomableBoard** does not capture pointer and block clicks.
- **`src/components/ZoomableBoard.tsx`** – Wraps the board in a scroll/zoom container. On pointer down, if the target is **not** inside `[data-board-interactive]`, it starts pan (setPointerCapture). So clicks on settlements, roads, placeable spots, and hexes (for robber) reach the board.

---

## 4. Game logic (rules and queries)

- **`src/game/logic.ts`** – Central place for rules and derived state:
  - **Build costs:** `getBuildCost(structure)`, `canAfford`, `getMissingResources`, `getMissingResourcesWithCost`.
  - **Placement:** `canPlaceSettlement`, `canPlaceRoad`, `canPlaceRoadInSetup`, `getPlaceableVertices`, `getPlaceableRoadsForVertex`, `getPlaceableRoads`, `canBuildCity`.
  - **Production:** `distributeResources`, `getHexIdsThatProducedResources`, `getHexIdsBlockedByRobber`.
  - **Robber:** `getPlayersOnHex`, `stealResource`.
  - **Trade:** `getTradeRate` (4:1 or harbor 3:1/2:1).
  - **Longest road:** `updateLongestRoad`, `calculateLongestRoad` (or equivalent).
  - **Oregons Omens:** Not in logic.ts; see **`src/game/omens.ts`** for Omens-specific helpers and state updates.

All of this is **pure**: takes `GameState` (and sometimes player id / vertex id), returns values or new state; no I/O.

---

## 5. AI

- **`src/game/ai.ts`** – All AI behavior:
  - **Setup:** `runAISetup(state, aiPlayerId)` – Picks best vertex (dice weight + diversity), then a valid road from that vertex.
  - **Roll order:** (Handled in SettlersGamePage: AI rolls when it’s the AI’s turn in roll_order.)
  - **Playing turn:**  
    - **Robber (7):** `runAIRobberMove`, `runAISelectPlayerToRob`.  
    - **Bank trade:** **`runAITrade(state, aiPlayerId)`** – Returns `{ give, get, reason } | null`. Reason is explainable (e.g. “Trading with the bank to get Ore for a city.”). Used by the page to apply the trade and show the AI reasoning modal.  
    - **Build:** **`runAITurn`** – Returns an action: `end` or place road/settlement/city (with vertex/edge ids). Prefers city → settlement → road; scores by dice weight and diversity.
  - **Player-trade evaluation:** **`evaluateTradeOffer(state, aiPlayerId, offeringPlayerId, give, giveAmount, want, wantAmount)`** – Returns **`TradeDecision`** `{ accepted, reason }`.  
    - Implements **anti-kingmaking** (reject if offerer VP ≥ 8), **affordability** (AI must have enough of `want`), and **needs-based utility** (AI goal from hand; scoring for giving/receiving resources).  
    - Used when the human offers a 1:1 trade to the AI; the **reason** is shown in the AI trade response modal.

AI does not run in a worker; it runs on the main thread when the page triggers it (e.g. after a short delay in a `useEffect` or after the human’s turn ends).

---

## 6. Trading flow (single-player, 2p)

- **Bank/harbor:**  
  - User opens trade panel (Trade 4:1 button), selects “give X / get 1”, clicks Confirm.  
  - **SettlersGamePage** `handleTrade(give, get)` uses `getTradeRate` (and Omens-adjusted rate if applicable), deducts resources, adds the received resource, updates state.

- **Offer to AI (1:1):**  
  - “Trade with Player 2” is only rendered when **`onOfferToAI`** is defined (2p single-player, human’s turn).  
  - Click opens the same trade panel; user sets “Give 1” / “Get 1” and clicks “Offer”.  
  - **SettlersGamePage** **`handleOfferToAI(give, get)`**:  
    1. Validates human has ≥ 1 of `give`.  
    2. Sets **`aiTradeConsidering`** true (UI shows “Player 2 is considering…”).  
    3. After **800–1200 ms** `setTimeout`, calls **`evaluateTradeOffer(game, 2, 1, give, 1, get, 1)`**.  
    4. If **accepted:** applies 1:1 swap between player 0 and 1, closes panel, sets **`aiTradeResponse`** `{ accepted: true, reason }`.  
    5. If **rejected:** sets **`aiTradeResponse`** `{ accepted: false, reason }`.  
    6. Sets **`aiTradeConsidering`** false.  
  - **AI trade response modal** (in SettlersGamePage): when **`aiTradeResponse`** is non-null, a modal shows “Player 2” and the **reason**; “Got it” or backdrop clears it. The same modal is used when the **AI** performs a **bank trade**: after applying the trade, the page sets `aiTradeResponse` from **`runAITrade`**’s **reason**.

---

## 7. Oregon’s Omens

- **`src/game/omens.ts`** – Deck creation, draw/play rules, effect application.  
  - **`isOmensEnabled(state)`**, **`canDrawOmenCard`**, **`drawOmenCard`**, **`canPlayOmenCard`**, **`playOmenCard`**.  
  - **`getEffectiveBuildCost`**, **`getEffectiveTradeRate`** when Omens modify costs/rates.  
  - Buffs go to hand; debuffs resolve immediately. State includes `omensDeck`, `omensDiscardPile`, per-player `omensHand`, and active effects.
- **UI:** “Draw Omen” and “Play” for cards are wired from **PlayerResources** and game page; Omens option is set at game creation.

---

## 8. Multiplayer (Supabase)

- **`src/lib/supabase.ts`** – Supabase client (URL + anon key).
- **`MultiplayerGame`** – Subscribes to the game row (or channel) for the given `gameId`; **`sendStateUpdate(nextState)`** writes the new state to the backend and broadcasts. Only the current player (by `currentPlayerIndex` vs `myPlayerIndex`) can send moves; others only receive updates.
- **State shape** – Same `GameState` as single-player; stored as JSON in `games.state` (or equivalent). Roll order, setup, playing, and ended phases are the same; only the source of truth and who can act change.

---

## 9. UI components and data flow

- **SettlersGamePage** (single-player):  
  - **State:** `game`, `tradeFormOpen`, `tradeGive`/`tradeGet`, `aiTradeConsidering`, **`aiTradeResponse`** (for modal), `robberMode`, `buildMode`, `errorMessage`, etc.  
  - **Derived:** `placeableVertices`, `placeableEdges`, `highlightedVertices`, `highlightedEdges` from `getPlaceableVertices` / `getPlaceableRoads` / etc., and from `buildMode` for build highlights.  
  - **Handlers:** `handleSelectVertex`, `handleSelectEdge`, `handleTrade`, **`handleOfferToAI`**, `handleRoll`, `handleEndTurn`, robber and build mode setters.  
  - **PlayerResources** receives `players`, `activePlayerIndex`, `phase`, trade props, **`onOfferToAI`** (only when 2p and human’s turn), **`aiTradeConsidering`**, build affordances, Omens props, etc.  
  - Renders **ZoomableBoard** → **HexBoard** with the above state and handlers; **PlayerResources** and **VictoryPointTracker** in the sidebar; and the **AI trade response modal** when `aiTradeResponse != null`.

- **PlayerResources** – Per-player cards: resources, build buttons, “Trade (4:1)”, **“Trade with Player 2”** (when `onOfferToAI` is defined), and the trade panel. When the panel is open and 2p, “Offer to Player 2 (1:1)” is at the top; bank trade below. Disabled states and “Player 2 is considering…” come from **`aiTradeConsidering`** and resource checks.

---

## 10. Roll order and tiebreak

- **Roll order** uses **`orderRolls`**, **`orderRollIndex`**, and optionally **`orderTiebreak`**, **`orderTiebreakRolls`**, **`orderTiebreakRollIndex`**, **`orderMainGroups`**, **`orderTiebreakGroupIndex`** in `state.ts`.
- **`applyRollOrderRoll`** (state.ts):  
  - In tiebreak: records the roll for the current tiebreak player; when all in the tie have rolled, sorts by value, then either starts another tiebreak round (if still tied) or resolves that group and checks for more tied groups. When resolving, it only looks for the **next** tied group at a **higher index** than the one just resolved (so the resolved group is not re-used).  
  - When all groups are resolved, **`setupOrder`** is set and phase moves to **setup**.

---

## 11. File reference (key files)

| Area | Files |
|------|--------|
| Entry / routing | `main.tsx`, `App.tsx` |
| Game state & creation | `game/state.ts`, `game/types.ts` |
| Board / topology | `game/board.ts`, `game/topology.ts`, `game/harbors.ts` |
| Rules & queries | `game/logic.ts`, `game/omens.ts` |
| AI | `game/ai.ts` |
| Single-player UI | `pages/SettlersGamePage.tsx` |
| Multiplayer UI | `components/MultiplayerGame.tsx`, lobby/room components |
| Board UI | `components/HexBoard.tsx`, `components/ZoomableBoard.tsx` |
| Sidebar / resources / trade | `components/PlayerResources.tsx`, `components/VictoryPointTracker.tsx` |
| Backend | `lib/supabase.ts` |

For a **feature-level** list (what’s implemented and what’s not), see **GAME_FEATURES_AND_LOGIC_FOR_AI.md**. For deployment and env setup, see **DEPLOYMENT.md** and **SUPABASE_SETUP_STEPS.md**.
