# Remote Multiplayer Implementation Plan

This document is a step-by-step plan to add backend support for remote multiplayer to Settlers of Oregon. It assumes **Supabase** for backend + Realtime (no custom server to host).

---

## Overview

| Phase | Goal | Deliverables |
|-------|------|---------------|
| **1. Backend & schema** | Supabase project, tables, RLS | `games`, `game_players` tables; env vars |
| **2. Lobby** | Create / join game, share link | Lobby UI; create/join API usage; URL `/game/:id` |
| **3. Start game** | Host starts; initial state stored | Start button; `createInitialState` on server or client; write `games.state` |
| **4. Action sync** | Every move goes through server | Action types; client sends action, server stores + broadcasts state |
| **5. Client wiring** | App uses server state, not only local | Subscribe to Realtime; send action on click; turn enforcement |
| **6. Polish** | Reconnect, presence, errors | Rejoin by URL; “waiting for…” and disconnect handling |

---

## Phase 1: Backend & schema

### 1.1 Create Supabase project

- [ ] Sign up at [supabase.com](https://supabase.com), create a project.
- [ ] In **Settings → API** copy:
  - **Project URL** (e.g. `https://xxxx.supabase.co`)
  - **anon public key**
- [ ] Add to `.env.local` (and Vercel env):
  - `VITE_SUPABASE_URL=...`
  - `VITE_SUPABASE_ANON_KEY=...`

### 1.2 Database schema

Run in Supabase **SQL Editor** (or migrations):

```sql
-- Games: one row per game. state is the full GameState JSON (null in lobby).
create table games (
  id uuid primary key default gen_random_uuid(),
  num_players smallint not null check (num_players between 2 and 4),
  phase text not null default 'lobby' check (phase in ('lobby', 'setup', 'playing', 'ended')),
  state jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Who is in each game: seat index 0..num_players-1, optional display name.
create table game_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  player_index smallint not null check (player_index >= 0),
  nickname text,
  joined_at timestamptz not null default now(),
  unique(game_id, player_index)
);

create index idx_game_players_game_id on game_players(game_id);
create index idx_games_phase on games(phase);
```

- [ ] Enable **Realtime** for `games`: Supabase Dashboard → Database → Replication → enable for `games` (so clients can subscribe to `state` changes).

### 1.3 Optional: Row Level Security (RLS)

For production, restrict who can read/update games (e.g. only players in that game). For a first version you can leave RLS off and use the anon key; add RLS in Phase 6.

---

## Phase 2: Lobby

### 2.1 Install Supabase client

```bash
npm install @supabase/supabase-js
```

### 2.2 Supabase client singleton

- [ ] Add `src/lib/supabase.ts` (or `src/utils/supabase.ts`):

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
export const supabase = createClient(url, key)
```

### 2.3 Lobby UI (replace “Multiplayer” placeholder)

- [ ] When user clicks **Multiplayer** on the start screen, show:
  - **Create game**: choose 2 / 3 / 4 players → call Supabase to insert into `games` (phase `lobby`, `state` null) → navigate to `/game/:id`.
  - **Join game**: input field for game ID (or paste link) → navigate to `/game/:id`.
- [ ] Add a simple **router** (e.g. React Router) or read `window.location.pathname` so that `/game/:id` loads the **game room** screen (lobby or in-game).

### 2.4 Game room screen at `/game/:id`

- [ ] Fetch `games` row by `id`; if not found, show “Game not found”.
- [ ] If `phase === 'lobby'`:
  - Show “Waiting for players”, list of `game_players` for this game, and a **Start game** button (only for the creator, or first player).
  - **Join**: current user picks an empty seat (player_index not yet in `game_players`) and inserts into `game_players` (with optional nickname).
- [ ] Share link: `https://yoursite.com/game/<id>` (and optionally show a short code if you add one).

---

## Phase 3: Start game

### 3.1 Who can start

- [ ] Only when `phase === 'lobby'` and (for example) at least 2 players have joined, the host (e.g. player_index 0 or creator) can click **Start game**.

### 3.2 Generating initial state

- [ ] **Option A (client-side):** Host’s client calls your existing `createInitialState(num_players, selectedColors)`. You need to decide how colors are chosen in multiplayer (e.g. each player picks in lobby, or assign in order). Then host sends this state to Supabase (e.g. `update games set state = $state, phase = 'setup', updated_at = now() where id = $id`).
- [ ] **Option B (Edge Function):** Supabase Edge Function that receives `gameId`, reads `num_players` and maybe player color choices from `game_players`, runs equivalent of `createInitialState`, and writes `state` + `phase = 'setup'` to `games`. Client just calls the function and then all clients see the update via Realtime.

Use **Option A** for minimal backend; use **Option B** if you want a single source of truth and no trust of client-generated state.

### 3.3 Subscribe to game state

- [ ] On `/game/:id`, subscribe to Realtime changes on `games` for this `id`. When `state` is non-null and `phase` is `setup` or `playing`, set React state: `setGame(payload.state)` so the board renders.

---

## Phase 4: Action sync

### 4.1 Action types (from current app)

Every move in the app should be represented as an **action** that the server (or the acting client) applies to produce the next state. Suggested types:

| Action | Payload | When |
|--------|--------|------|
| `PLACE_SETTLEMENT` | `{ vertexId: string }` | Setup or playing (build) |
| `PLACE_ROAD` | `{ edgeId: string }` | Setup or playing (build) |
| `ROLL_DICE` | `{}` | Start of turn (server can generate dice 1–6) |
| `MOVE_ROBBER` | `{ hexId: string }` | After rolling 7 |
| `ROB_PLAYER` | `{ targetPlayerId: number }` | After moving robber, if multiple players on hex |
| `END_TURN` | `{}` | After roll + optional build/trade |
| `TRADE` | `{ give: Terrain, get: Terrain }` | Bank trade (with harbor rate) |

### 4.2 Applying actions

- [ ] **Option A – Client applies, server stores:** The client whose turn it is computes the next state using your existing logic (same as in `App.tsx`), then sends the **full new state** to Supabase (`update games set state = $newState, updated_at = now() where id = $id`). Realtime broadcasts the new state to all other clients; they replace local state with it. Server only stores; it does not validate (trusted client).
- [ ] **Option B – Server applies:** Client sends only the **action** (e.g. `{ type: 'PLACE_SETTLEMENT', vertexId }`). A Supabase Edge Function (or a small Node server) validates the action, applies it using shared game logic, and writes the new state to `games`. All clients (including sender) get the new state via Realtime. This is more work but avoids cheating.

Start with **Option A**; migrate to **Option B** if you need server-side validation.

### 4.3 Turn enforcement

- [ ] Only the client for which `game.currentPlayerIndex === myPlayerIndex` may send an action (or updated state). Disable board interactions and show “Waiting for Player X” for others. Optionally hide other players’ resource counts (or show only counts, not types) according to rules.

---

## Phase 5: Client wiring

### 5.1 Game screen source of truth

- [ ] On `/game/:id`, the only source of truth for the board is the `game` state that comes from Supabase (Realtime or initial fetch). Do not apply moves locally first; send the action (or new state) to Supabase and then update local state when Realtime delivers the new state.

### 5.2 Sending actions

- [ ] For each user action (place settlement, place road, roll dice, move robber, rob player, end turn, trade):
  - If it’s not this client’s turn, ignore (or show “Not your turn”).
  - Compute the next state (Option A) or build the action payload (Option B).
  - Call Supabase: update `games.state` (and optionally `updated_at`), or call Edge Function with action.
- [ ] Keep existing handlers (`handleSelectVertex`, `handleRoll`, etc.) but instead of only `setGame(...)`, also persist to Supabase (and optionally optimistically set local state until Realtime confirms).

### 5.3 Receiving state

- [ ] Realtime subscription on `games` for this `id`: on `UPDATE`, read `payload.new.state`; if present, call `setGame(payload.new.state)`. Ensure you don’t apply the same update twice (e.g. ignore if you were the one who sent it, or always replace with server state).

### 5.4 My player index

- [ ] When the user joins the game (or opens `/game/:id`), you know their `player_index` from `game_players`. Store it (e.g. in React state or context). Use it to:
  - Allow only that player to send moves when `currentPlayerIndex === player_index`.
  - Show “Your turn” vs “Waiting for Player N”.

### 5.5 No AI in multiplayer

- [ ] In remote multiplayer, all seats are human (no AI). So when building the initial state for a multiplayer game, do not mark any player as AI; use the same `createInitialState` but with `selectedColors` (or default order) and `isAI: false` for all.

---

## Phase 6: Polish

### 6.1 Reconnection

- [ ] Store `gameId` in the URL (`/game/:id`). On page reload, re-fetch the game and re-subscribe to Realtime so the user rejoins the same game.

### 6.2 Presence (optional)

- [ ] Use Supabase Presence on a channel like `game:${id}` to show who is currently online (e.g. “Player 2 is online”).

### 6.3 Disconnect / timeout (optional)

- [ ] If a player is absent for N minutes, you could show “Player X disconnected” and optionally replace with AI or allow others to vote to end the game. This can be a later iteration.

### 6.4 Error handling

- [ ] Show a toast or message when Supabase update fails (e.g. network error, or RLS denial). Optionally retry once.

---

## File checklist (summary)

| File | Action |
|------|--------|
| `.env.local` | Add `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| `src/lib/supabase.ts` (or `src/utils/supabase.ts`) | **New** – create Supabase client |
| `src/App.tsx` | Add routing or path-based view; when in multiplayer game, load state from Supabase and send actions to Supabase; turn enforcement by `myPlayerIndex` |
| Multiplayer start screen | Replace “coming soon” with **Create game** / **Join game** |
| `src/pages/GameRoom.tsx` (or similar) | **New** – lobby + game board for `/game/:id`; subscribe to Realtime; render board when `state` exists |
| `src/game/state.ts` | Reuse `createInitialState`; possibly add a variant that takes player list + color choices for multiplayer (no AI) |
| `src/game/actions.ts` (optional) | **New** – type definitions for action payloads and a function `applyAction(state, action) => state` if you move to server-side apply (Option B) |

---

## Order of implementation (recommended)

1. **Phase 1** – Supabase project, tables, Realtime, env.
2. **Phase 2** – Supabase client, Create game, Join game, navigate to `/game/:id`, show lobby (player list, share link).
3. **Phase 3** – Start game button; generate initial state (client or Edge Function); write to `games.state`; subscribe to Realtime and set `game` when state appears.
4. **Phase 4 & 5** – For each button/click that changes state (place settlement, road, roll, robber, rob, end turn, trade), add “send to Supabase” then “replace local state from Realtime”. Enforce turn by `currentPlayerIndex === myPlayerIndex`.
5. **Phase 6** – Reconnect via URL, optional presence and error toasts.

This plan keeps your existing `GameState` and game logic; the main change is **where state lives** (Supabase) and **how it’s updated** (send action or new state → Realtime → all clients).
