# Supabase tables – what they do and how they’re used

This project uses **two Supabase tables** for Settlers of Oregon multiplayer: `games` and `game_players`. Realtime is used so all clients stay in sync.

---

## 1. `games`

**Purpose:** One row per multiplayer game. Holds game metadata and the full in-game state (or `null` while in lobby).

| Column        | Type      | Purpose |
|---------------|-----------|---------|
| `id`          | uuid (PK) | Unique game ID (used in the URL, e.g. `/game/:gameId`). |
| `num_players` | smallint  | 2, 3, or 4. Set when the game is created. |
| `phase`       | text      | `'lobby'` \| `'setup'` \| `'playing'` \| `'ended'`. Drives UI (lobby vs. board vs. winner). |
| `state`       | jsonb     | Full `GameState` (hexes, vertices, edges, players, dice, etc.). `null` in lobby; set when someone starts the game. |
| `oregons_omens` | boolean | Whether Oregon’s Omens is enabled. Set at create time. |
| `created_at`  | timestamptz | When the game was created. |
| `updated_at`  | timestamptz | Last update (e.g. when `state` or `phase` changes). |

**How it’s used:**

- **Create game (MultiplayerLobby):** `INSERT` one row with `phase: 'lobby'`, `state: null`, `num_players`, `oregons_omens`. Creator is also added to `game_players` as player 0 and redirected to the game room.
- **Lobby (GameRoom):** `SELECT *` by `id` to show game info (phase, num_players, oregons_omens). Realtime subscription on `games` for this `id` (on UPDATE) to refetch when the game starts.
- **Start game (GameRoom):** When a player clicks “Start game”, client builds initial state with `createInitialState(...)` and `UPDATE`s the row: `phase: 'setup'`, `state: <initial state>`, `updated_at`. No separate “start game” API.
- **During play (MultiplayerGame):** Client that moves updates the same row: `UPDATE games SET state = <new state>, updated_at = ... WHERE id = :gameId`. All other clients receive the new `state` via Realtime and set their local game state to it.

So: **`games`** = one row per game; **`state`** is the single source of truth for the board, players, and turn.

---

## 2. `game_players`

**Purpose:** Who is in each game (which seats are taken and optional display names). Used in the lobby and to know “which player am I?” in the game UI.

| Column         | Type      | Purpose |
|----------------|-----------|---------|
| `id`           | uuid (PK) | Unique row ID. |
| `game_id`      | uuid (FK) | References `games(id)`; cascade delete when the game is deleted. |
| `player_index` | smallint  | Seat index 0, 1, 2, or 3 (maps to “Player 1”, “Player 2”, etc.). |
| `nickname`     | text      | Optional display name (e.g. “Player 1”, “Player 2”). |
| `joined_at`    | timestamptz | When this player took this seat. |

Unique on `(game_id, player_index)` so each seat can be taken only once.

**How it’s used:**

- **Create game (MultiplayerLobby):** After inserting the `games` row, creator is added with `INSERT` into `game_players` for that `game_id`, `player_index: 0`, `nickname: 'Player 1'`.
- **Lobby (GameRoom):** `SELECT * FROM game_players WHERE game_id = :gameId ORDER BY player_index` to show “Players (1/2)” and the list of who’s in. Realtime subscription on `game_players` with `game_id=eq.:gameId` so when someone joins, the list refreshes (and “Start game” can appear when enough seats are filled).
- **Join (GameRoom):** User picks an empty seat → `INSERT` into `game_players` with that `game_id` and chosen `player_index` (and optional nickname). Local “my player index” is stored in localStorage so the same browser knows who they are on reload.
- **During play:** The app does **not** read `game_players` again for move logic. “Who am I?” is already known from the lobby (player index). The live board state comes from `games.state` only.

So: **`game_players`** = lobby roster and seat assignment; **`games.state`** = the actual game (pieces, resources, turn).

---

## Realtime

- **Lobby:** Subscribe to `postgres_changes` on both `games` (UPDATE) and `game_players` (any event) filtered by this game. Used to refresh game info and player list when someone joins or when the host starts the game.
- **In-game:** Subscribe to `postgres_changes` on `games` (UPDATE) filtered by this game’s `id`. On each UPDATE, clients take `payload.new.state` and set their local game state so the board and UI stay in sync.

Realtime is configured by adding `games` and `game_players` to the `supabase_realtime` publication (see `docs/SUPABASE_SETUP_STEPS.md`).

---

## Flow summary

1. **Create:** Insert `games` (lobby) + insert `game_players` (creator, index 0) → redirect to `/game/:id`.
2. **Lobby:** Fetch `games` + `game_players`; subscribe to both for this game; show share link and “Join as Player 2” etc.
3. **Join:** Insert `game_players` for chosen seat; Realtime notifies others; when enough players, any of them can start.
4. **Start:** Update `games` with `phase: 'setup'` and `state: createInitialState(...)`; Realtime pushes to all; everyone switches to the board.
5. **Play:** The active client computes the next state and updates `games.state`; Realtime broadcasts; all clients (including the mover) use the new state.

No auth is required: RLS policies allow public read/insert/update on these tables (see setup doc). Game and player identity are effectively “who has the link” and “which seat they chose in the lobby.”
