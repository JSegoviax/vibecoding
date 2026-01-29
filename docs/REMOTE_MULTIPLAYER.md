# Remote Multiplayer Setup Guide

This guide explains how to add **remote multiplayer** to Settlers of Oregon so players on different devices can play together over the internet.

## Current vs Remote

| Current | Remote |
|--------|--------|
| All players (or 1 human + AI) on same device | Each player on their own device/browser |
| Game state lives in React state | Game state lives on a **server** and is synced to all clients |
| Actions run locally | Actions are sent to server → validated → broadcast to everyone |

## What You Need

1. **Backend** – A server (or serverless + realtime) that:
   - Stores the current game state
   - Accepts actions from clients (place settlement, roll dice, build, etc.)
   - Broadcasts updated state (or action events) to all players in the same game

2. **Lobby / matchmaking** – A way to:
   - **Create** a game and get a shareable link or room code
   - **Join** a game (enter code or click link)
   - Start the game when enough players have joined (e.g. 2–4)

3. **Client changes** – The React app must:
   - Send every move/action to the server instead of only updating local state
   - Receive updates (full state or events) and update local state so the board stays in sync for everyone
   - Show “waiting for other players” when it’s not your turn
   - Optionally show who’s connected and handle reconnects

---

## Option A: Supabase (recommended to start)

**Pros:** Free tier, Realtime over WebSockets, no custom server to host.  
**Cons:** You’ll put game logic in “database triggers” or a small Edge Function, or keep it in the client and use Supabase only to store and broadcast state.

### 1. Create a Supabase project

- Go to [supabase.com](https://supabase.com) and create a project.
- In **Settings → API** copy:
  - **Project URL**
  - **anon** (public) **key**

### 2. Database schema (high level)

- **`games`** table: `id` (uuid), `state` (jsonb – full `GameState`), `num_players` (2–4), `created_at`, `phase` (e.g. `lobby` | `setup` | `playing` | `ended`).
- **`game_players`** table: `game_id`, `player_index` (0–3), `user_id` (optional, from Supabase Auth) or `nickname`, `joined_at`.  
  This links “seat” to a human; if no one joins a seat, that seat can be AI or “empty” (you can disallow starting until required seats are filled).

### 3. Realtime

- Use **Supabase Realtime** on the `games` table (or a dedicated `game_events` table) so that when one client updates the row (e.g. `state`), all others get the new state.
- Alternatively, use a **channel** per game: e.g. `realtime.channel('game:' + gameId)` and broadcast payloads (e.g. `{ type: 'STATE_UPDATE', state }` or `{ type: 'ACTION', action }`).

### 4. Flow

- **Create game:** Insert row in `games` with `phase: 'lobby'`, `state: null`, `num_players: 2` (or 3/4). Redirect to `/game/<gameId>`.
- **Join game:** User opens link or enters code → same `/game/<gameId>`. You insert (or update) `game_players` for that game. When the creator clicks “Start” (and enough players have joined), set `phase: 'setup'`, generate initial `GameState` (reuse your `createInitialState` logic), write it to `games.state`.
- **During game:**  
  - Only the client whose turn it is sends actions (e.g. “place settlement at vertex X”, “roll dice”, “build road”, “end turn”).  
  - Each action is sent to Supabase (e.g. update `games.state` with the new state, or append to `game_events` and have a trigger/function compute new state).  
  - All clients subscribe to Realtime and replace their local `game` state with the one from the server so the board stays in sync.

### 5. Client integration

- **Lobby screen:**  
  - “Create game” → call Supabase to create `games` row → navigate to `/game/<id>`.  
  - “Join game” → input code (or follow link) → navigate to `/game/<id>`, register in `game_players`.
- **Game screen:**  
  - Load initial state from `games.state` (or from the last event).  
  - On every user action (place settlement, roll, build, trade, robber, end turn):  
    - Compute the next state in the client (reuse your existing `logic` and state updaters).  
    - Send the **action** (or the **next state**) to Supabase; then Supabase Realtime pushes it to other clients.  
  - Other clients: on Realtime message, set `setGame(payload.state)` (or apply the action with the same logic).  
- **Turn enforcement:** Only allow sending actions when `game.currentPlayerIndex` matches the current user’s `player_index` (and they’re not an AI).

You can keep your existing `GameState` type and `createInitialState`; the main change is “who applies the action” (server vs client) and “where state lives” (Supabase + Realtime).

---

## Option B: Custom WebSocket server (Node.js)

**Pros:** Full control, one place for all game logic and validation.  
**Cons:** You must host and maintain a server (e.g. Railway, Render, Fly.io).

### 1. Server responsibilities

- Maintain a **room** per game: `gameId → { state: GameState, players: Map<socketId, playerIndex> }`.
- On **join:** validate room exists and has an empty seat; assign `playerIndex`; send current `state` to the joining client; broadcast “player joined” to others.
- On **action** (e.g. `{ type: 'PLACE_SETTLEMENT', vertexId }`):  
  - Check it’s that player’s turn.  
  - Run the same validation and state transition you use in the React app (you can share `logic` and state types with the server if you use a monorepo or copy the relevant files).  
  - Update room’s `state`; broadcast new `state` to everyone in the room (including sender).
- Handle **disconnect:** mark player as disconnected; optionally allow reconnect by `gameId` + token; if you want, implement a timeout and “replace with AI” or end game.

### 2. Client

- Connect to WebSocket (e.g. `wss://yourserver.com/game?gameId=xxx`).
- On open: send “join” with nickname or userId; receive initial `state`.
- When user does something: send `{ type: '...', ... }`; never update local state from that action directly—wait for server to broadcast the new state, then `setGame(newState)`.
- Render “Waiting for opponent…” when `currentPlayerIndex !== myPlayerIndex`.

---

## Option C: Firebase Realtime Database or Firestore

Similar to Supabase: you have a “game” document or node that holds `state`. Clients subscribe to it. One client (or a Cloud Function) applies actions and writes the new state. Same high-level flow as Supabase: create game → share link → join → sync state via Realtime listeners; only the current player’s client (or the server) applies moves.

---

## Suggested order of implementation

1. **Lobby**
   - Add “Create game” and “Join game” (with code/link).
   - Store minimal game metadata (id, num_players, phase: `lobby`).

2. **State sync**
   - Store full `GameState` on the server.
   - When a player performs an action:
     - Send the action (or the resulting state) to the server.
     - Server validates and updates stored state, then broadcasts to all clients.
   - All clients update React state from the broadcast so the board is identical for everyone.

3. **Turn enforcement**
   - Only the client whose turn it is can send moves; others are view-only (with “Waiting for Player 2…” etc.).

4. **Polish**
   - Reconnection (store `gameId` in URL or localStorage; on reload, rejoin the same room).
   - Simple presence (who’s online).
   - Optional: replace disconnected player with AI after a timeout.

---

## Summary

- **Remote multiplayer = server holds truth, clients send actions and receive state.**
- **Easiest path:** Use **Supabase** (or Firebase) for auth + database + Realtime; keep your existing `GameState` and reuse your current logic for applying moves; add a lobby (create/join) and then wire every move through the server and Realtime.
- **More control:** Implement a **small WebSocket server** that holds `GameState` per room, validates and applies actions, and broadcasts state to all clients.

If you tell me which option you prefer (Supabase vs custom server), I can outline concrete steps and code changes for your repo (e.g. new components for lobby, and how to plug `App.tsx` into “send action / subscribe to state” instead of only local `setGame`).
