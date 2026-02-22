# Settlers of Oregon

A browser-based, Catan-style hex board game. Place settlements and roads, roll for resources, trade with the bank or with the AI, and build your way to 10 victory points. Supports single-player vs AI (2–4 players) and remote multiplayer via Supabase.

---

## Quick start

```bash
npm install
npm run dev
```

Open the URL shown (usually `http://localhost:5173`).

---

## Features

- **Board & topology:** 19 hexes (wood, brick, sheep, wheat, ore, desert), vertices for settlements/cities, edges for roads. Water ring and harbors (2:1 and 3:1 trade rates).
- **Phases:** Roll for turn order → setup (place 2 settlements + 2 roads each) → playing → first to 10 VP wins.
- **Dice & production:** Roll 2d6; hexes with that number produce (1 per settlement, 2 per city). Robber on 7: move to a hex (blocks production there) and steal one resource from a player on that hex.
- **Building:** Road (1 wood, 1 brick), Settlement (1 wood, 1 brick, 1 sheep, 1 wheat), City (2 wheat, 3 ore, replaces a settlement).
- **Trading:**
  - **Bank/harbor:** 4:1 default; 3:1 generic harbor; 2:1 specific resource harbor when you have a structure on that harbor.
  - **Player-to-player (2-player vs AI):** Offer a 1:1 trade to the AI. The AI accepts or declines with explainable reasons (e.g. “I’m saving my Ore for a city” or “You’re too close to winning”). A modal shows the AI’s reasoning after each trade (your offer and the AI’s bank trades).
- **Longest road:** 2 VP for the longest continuous road of 5+ segments; recomputed when roads change.
- **Oregon’s Omens (optional):** Themed buff/debuff cards; draw (cost 1 wheat, 1 sheep, 1 ore) and play buffs; debuffs resolve when drawn. Toggle at game start.
- **Single-player vs AI:** 2–4 player games; in 2p, Player 1 is human, Player 2 is AI. AI handles setup, dice, robber, bank trading, and building; it also evaluates your trade offers (needs-based utility + anti-kingmaking).
- **Remote multiplayer:** Create or join a game via link; state synced with Supabase Realtime. See [docs/REMOTE_MULTIPLAYER.md](docs/REMOTE_MULTIPLAYER.md) and [docs/SUPABASE_SETUP_STEPS.md](docs/SUPABASE_SETUP_STEPS.md).

---

## How to play (single-player)

1. **Start:** Choose “Play vs AI”, pick 2–4 players and colors. Roll for turn order (tiebreak: re-roll).
2. **Setup:** In order, place one settlement then one road; repeat in reverse order. After your second placement you receive resources from the three hexes around that settlement.
3. **Playing:** On your turn:
   - **Roll** the dice. Everyone with a settlement/city on a hex with that number gets resources (7 = robber: move it and optionally rob one player on the new hex).
   - **Build** (optional): Road, Settlement, or City if you can afford and have a valid spot.
   - **Trade:** Use “Trade (4:1)” for the bank (or better harbor rate). In 2-player, use “Trade with Player 2” to offer a 1:1 trade to the AI; the AI responds with accept or a short reason in a modal.
   - **End turn** when done.
4. **Win:** First to **10 victory points** (settlements = 1 VP, cities = 2 VP, longest road = 2 VP).

---

## Tech stack

- **Vite** + **React** + **TypeScript**
- Game state and logic in `src/game/` (state, logic, topology, AI, omens, harbors)
- UI: `HexBoard`, `ZoomableBoard`, `PlayerResources`, `VictoryPointTracker`, etc.
- Optional: Supabase for remote multiplayer; analytics (see [GOOGLE_ANALYTICS_SETUP.md](GOOGLE_ANALYTICS_SETUP.md))

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/GAME_FEATURES_AND_LOGIC_FOR_AI.md](docs/GAME_FEATURES_AND_LOGIC_FOR_AI.md) | Full feature and rules reference (board, phases, resources, building, robber, trading, AI, state). |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the codebase is structured: pages, game state, AI, trading, UI flow. |
| [docs/REMOTE_MULTIPLAYER.md](docs/REMOTE_MULTIPLAYER.md) | Remote multiplayer design and Supabase usage. |
| [docs/SUPABASE_SETUP_STEPS.md](docs/SUPABASE_SETUP_STEPS.md) | Step-by-step Supabase project and table setup. |
| [docs/OREGONS_OMENS_IMPLEMENTATION_PLAN.md](docs/OREGONS_OMENS_IMPLEMENTATION_PLAN.md) | Oregon’s Omens variant: deck, draw, play, effects. |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Build and deployment (e.g. Vercel). |

---

## Project structure (high level)

- **`src/pages/`** – Routes: home, single-player game (`SettlersGamePage`), multiplayer lobby and game, how-to-play, FAQ.
- **`src/game/`** – Core: `state.ts` (create state, roll order, setup), `logic.ts` (build costs, placement rules, production, robber, trade rate, longest road), `ai.ts` (AI setup/turn/trade, player-trade evaluation), `omens.ts` (Omens deck and effects), `board.ts` / `topology.ts` / `harbors.ts`.
- **`src/components/`** – `HexBoard`, `ZoomableBoard`, `PlayerResources`, `VictoryPointTracker`, `MultiplayerGame`, `MultiplayerLobby`, etc.
- **`src/lib/supabase.ts`** – Supabase client for multiplayer.
- **`public/`** – Assets (hex images, number tokens, player colors, etc.).

For detailed architecture and data flow, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
