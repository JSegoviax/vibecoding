# Settlers of Oregon — Features & Logic (AI-Friendly Reference)

This document lists all implemented game features and logic in a structured format for AI tools (e.g., Google Gemini) to parse and use when brainstorming new mechanics. Sections are self-contained and keyword-rich.

---

## 1. GAME OVERVIEW

- **Genre:** Hex-based, resource-gathering, settlement-building (Catan-style).
- **Name:** Settlers of Oregon.
- **Modes:** Single-player (vs AI), remote multiplayer (2–4 players via Supabase).
- **Win condition:** First player to reach **10 victory points** wins.

---

## 2. BOARD & TOPOLOGY

### 2.1 Hex grid
- **Layout:** 19 land hexes in a Catan-shaped island (axial coordinates).
- **Terrain types:** `wood`, `brick`, `sheep`, `wheat`, `ore`, `desert`.
- **Counts per game:** 4 wood, 4 brick, 4 wheat, 4 sheep, 3 ore, 1 desert.
- **Dice numbers:** 2–12 (no 7); 2 and 12 appear once; 3–6 and 8–11 appear twice. Desert has no number.
- **Randomization:** Terrains and numbers are shuffled at game creation.

### 2.2 Vertices and edges
- **Vertices:** Intersections where 2 or 3 hexes meet. Each vertex has `hexIds` (which hexes touch it).
- **Edges:** Segments between two vertices; roads are built on edges.
- **Structures:** Placed on vertices (settlement or city). One structure per vertex.
- **Roads:** Placed on edges. One road per edge.

### 2.3 Water and harbors
- **Water ring:** Hex positions computed around the land for visual “ocean” ring.
- **Harbors:** Placed on coastal edges. Types:
  - **Generic (3:1):** Trade any 3 of same resource for 1 of any other.
  - **Specific (2:1):** Trade 2 of one resource type (e.g. sheep) for 1 of any other.
- **Harbor ownership:** A player gets a harbor’s rate if they have a settlement or city on either vertex of that harbor’s edge.

---

## 3. GAME PHASES

### 3.1 Setup
- **Order:** Snake draft. For 2 players: P1, P2, P2, P1. For 3: P1, P2, P3, P3, P2, P1. For 4: P1…P4, P4…P1.
- **Per turn:** Place one settlement, then one road adjacent to that settlement.
- **Initial resources:** After the second placement round, each player receives 1 of each resource type for every hex adjacent to their second settlement (the one just placed).
- **Robber:** Starts on the desert hex.

### 3.2 Playing
- **Turn order:** Cyclic by `currentPlayerIndex` (0 to N−1).
- **Per turn:** Roll dice → (if 7: move robber and optionally rob) → build and/or trade → end turn.
- **Dice:** Two six-sided dice. Sum 2–12 determines which hexes produce (except 7 triggers robber).

### 3.3 Ended
- When any player reaches **10 victory points**, the game ends and that player wins.

---

## 4. RESOURCES & PRODUCTION

### 4.1 Resource types
- **Five spendable:** Wood, Brick, Sheep, Wheat, Ore. (Desert produces nothing.)

### 4.2 Production (dice roll)
- **Rule:** All hexes whose number equals the dice sum produce, except the hex with the robber.
- **Settlement:** Receives 1 of that hex’s resource per matching hex.
- **City:** Receives 2 of that hex’s resource per matching hex.
- **Blocked:** The hex under the robber does not produce, even if its number was rolled.

### 4.3 Build costs (fixed)
- **Road:** 1 Wood, 1 Brick.
- **Settlement:** 1 Wood, 1 Brick, 1 Sheep, 1 Wheat.
- **City:** 2 Wheat, 3 Ore (replaces an existing settlement of that player).

### 4.4 Piece limits
- **Settlements left:** 5 per player (total).
- **Cities left:** 4 per player (total).
- **Roads left:** 15 per player (total).

---

## 5. BUILDING RULES

### 5.1 Settlement placement
- **Distance rule:** At least **2 edge-lengths** from any other settlement or city (no adjacent intersections).
- **Playing phase:** Vertex must be adjacent to at least one road owned by the current player.
- **Setup phase:** Any valid empty vertex per turn order; road must be placed on an edge touching the settlement just placed.

### 5.2 Road placement
- **Setup:** Only on an edge adjacent to the settlement just placed.
- **Playing:** Edge must be adjacent to an existing road or settlement/city of the current player.

### 5.3 City placement
- **Rule:** Replace one of your own **settlements** with a city (same vertex). Cost: 2 Wheat, 3 Ore. No new vertex.

### 5.4 Victory points (from structures)
- **Settlement:** 1 VP.
- **City:** 2 VP.

---

## 6. ROBBER

### 6.1 When
- **Trigger:** Dice sum = 7.
- **Obligation:** Current player must move the robber to a **different** hex (any hex except current).

### 6.2 Effect of moving robber
- **Production:** The hex the robber is on does **not** produce on any dice roll until the robber moves again.
- **Rob:** If the new hex has structures of other players, the current player must choose one of those players and steal **one random resource** from them (if they have any). If only the current player has structures there, no robbery.

### 6.3 UI / state
- **lastRobbery:** Stored in state (who robbed, who was robbed, which resource) for per-viewer messages (robber: green “You stole X”; victim: red “Player Y stole your X”; others: neutral).

---

## 7. TRADING

### 7.1 Bank / harbor rates
- **Default (no harbor):** 4 of one resource → 1 of any other (4:1).
- **Generic harbor:** 3:1.
- **Specific resource harbor:** 2:1 for that resource.
- **Rule:** Best rate applies if the player has a structure on a harbor vertex; trade is with the “bank,” not player-to-player.

### 7.2 Player-to-player trading
- **Not implemented:** Only bank/harbor trading exists. No offer/accept between players.

---

## 8. SPECIAL VP RULES

### 8.1 Longest road
- **Award:** 2 VP to the player with the **longest continuous road** of at least **5** segments.
- **Computation:** Longest path in the graph of that player’s roads (no vertex revisited in the path).
- **Reassignment:** When a longer road is built or road graph changes, the card can transfer; previous holder loses 2 VP, new holder gains 2 VP.
- **Tie:** No specification in logic for exact tie-break; implementation effectively gives it to one of the tied players when length ≥ 6.

### 8.2 Largest army
- **Not implemented.** No knight/development cards; no “largest army” bonus.

---

## 9. DEVELOPMENT CARDS / KNIGHTS

- **Not implemented.** No development cards, knights, or “robber must move” cards.

---

## 10. AI (SINGLE-PLAYER)

- **Only in 2-player mode:** Player 1 is human, Player 2 is AI.
- **Setup:** AI picks highest-scored vertex (dice weight + resource diversity), then random valid road from that vertex.
- **Turn order:** Roll (human) → human actions; then AI turn: roll → if 7, move robber (prefer hexes with opponent structures, block high numbers) and choose player to rob (prefer more resources) → trade if needed (prefer better harbor rate) → build: prefer city, then settlement, then road; score by dice weight and diversity.
- **No negotiation:** AI does not propose or accept player-to-player trades.

---

## 11. MULTIPLAYER (REMOTE)

- **Backend:** Supabase (Postgres + Realtime).
- **Tables:** `games` (id, num_players, phase, state JSONB), `game_players` (game_id, player_index, nickname).
- **Flow:** Lobby (create/join by link) → host starts game → initial state stored in `games.state`; each action updates state and broadcasts via Realtime.
- **Identity:** Host identified by URL param or sessionStorage; joiner gets player index; state is authoritative from server (no local-only moves).
- **Turn enforcement:** Client checks `currentPlayerIndex` vs own `myPlayerIndex`; only current player can roll, build, trade, end turn, move robber.

---

## 12. UI / UX FEATURES

- **Dice roll:** Animated roll; result stored in `lastDice`; sum drives production and robber (if 7).
- **Resource highlight:** Hexes that produced on last roll get a **yellow/amber** pulsing border; hex that would have produced but had the robber gets a **red** border.
- **Robber message:** Contextual, color-coded (robber green, victim red, others default).
- **Build buttons:** Road, Settlement, City are **greyed out** when the player cannot afford or has no valid placement (afford + at least one valid spot).
- **End turn:** Single “End turn” button in the build row (visible after rolling, when not in robber flow).
- **Potential spots:** Placeable vertices/edges highlighted (e.g. blue); settlement spots use color-matched pixel-art icons.
- **Harbors:** Visual docks; 2:1 and 3:1 (?) icons on coast.
- **Victory points:** Shown per player; longest road included in VP total when applicable.
- **SEO:** Meta tags, document title updates, optional sitemap/robots.

---

## 13. STATE SNAPSHOT (KEY FIELDS)

- **phase:** `'setup' | 'playing' | 'ended'`
- **hexes, vertices, edges, harbors:** Board topology and layout.
- **players:** id, name, color, resources, victoryPoints, settlementsLeft, citiesLeft, roadsLeft.
- **currentPlayerIndex:** Whose turn (0-based).
- **setupPlacements, setupPendingVertexId:** Setup progress and “place road next” constraint.
- **lastDice, lastResourceFlash, lastResourceHexIds:** Dice result and production feedback.
- **robberHexId, lastRobbery:** Robber position and last robbery for UI.
- **longestRoadPlayerId:** Who holds longest road (if any).

---

## 14. WHAT IS NOT IMPLEMENTED (IDEAS FOR NEW MECHANICS)

- Player-to-player trading (offers, acceptance).
- Development cards (e.g. Knight, VP, Road Building, Year of Plenty, Monopoly).
- Largest army (knight count).
- Themed “Oregon” flavor (e.g. events, tiles, or cards unique to Oregon).
- In-game events (e.g. floods, gold rush) that modify rules temporarily.
- Variable setup (e.g. different board layouts, scenarios).
- Achievements or milestones (e.g. “first to 3 settlements”).
- House rules (e.g. friendly robber, resource caps).
- Reconnect / persistence of in-progress games (beyond current session).
- Spectator or “watch game” mode.
- Sound effects or music.
- Localization (multiple languages).

---

## 15. SUGGESTED PROMPT FOR AI BRAINSTORMING

You can paste the following (plus this doc) into an AI tool:

```
I have a Catan-style game called "Settlers of Oregon" with the features and logic described in the attached document. It has: hex board, 5 resources, settlements/cities/roads, harbors, robber on 7, longest road, single-player vs AI, and remote multiplayer. It does NOT have development cards, largest army, or player-to-player trading yet.

Using the document as the source of truth:
1. Suggest 3–5 new mechanics that would fit the existing systems and the "Oregon" theme.
2. For each, briefly note: what changes in rules or state, what stays the same, and one implementation hint (e.g. new state field or new phase).
3. Optionally suggest one small "quality of life" or balance change that does not add a new mechanic.
```

---

*Document generated from the VibeCoding codebase for AI-assisted design and brainstorming. Last updated to reflect current implementation.*
