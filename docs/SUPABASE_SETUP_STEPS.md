# Supabase setup – next steps

You created a Supabase account. Do these in order:

---

## 1. Create a project (if you haven’t)

- In the Supabase dashboard, click **New project**.
- Pick an **organization** (or create one).
- Set **Name** (e.g. `settlers-oregon`), **Database password** (save it somewhere), **Region**.
- Click **Create new project** and wait until it’s ready.

---

## 2. Get your API keys

You’re on **Settings → API Keys**. Do this:

1. **Project URL**  
   On this page or under **Settings → General**, copy the **Project URL** (e.g. `https://xxxx.supabase.co`).

2. **Publishable key or Legacy anon key**  
   Under **“Publishable key”**, copy the key for **“default”** (click the copy icon).  
   Put it in `VITE_SUPABASE_ANON_KEY` in `.env.local`.

   **If you get 401 Unauthorized when creating a game:** use the **Legacy anon** key instead. Open the **“Legacy anon, service_role API keys”** tab and copy the **anon** key (long JWT starting with `eyJ...`). Put that in `VITE_SUPABASE_ANON_KEY`, restart the dev server, and try again.

---

## 3. Add env vars in your app

- In your project root, create or edit **`.env.local`** (it’s gitignored).
- Add (replace with your real URL and publishable key):

```
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxx...
```

- Restart the dev server after changing env vars.

---

## 4. Create the database tables

- In Supabase: **SQL Editor** → **New query**.
- Paste and run this (same as in the implementation plan):

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

- Click **Run**. You should see “Success. No rows returned.”

---

## 4b. Allow the app to access the tables (RLS policies)

Supabase enables **Row Level Security (RLS)** by default. Without policies, the anon key gets **401 Unauthorized**. Add policies so the app can create and read games:

In **SQL Editor** → **New query**, run:

```sql
-- games: allow anyone to read, create, and update (for lobby and start game)
CREATE POLICY "Allow public read games" ON games FOR SELECT USING (true);
CREATE POLICY "Allow public insert games" ON games FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update games" ON games FOR UPDATE USING (true);

-- game_players: allow anyone to read and join
CREATE POLICY "Allow public read game_players" ON game_players FOR SELECT USING (true);
CREATE POLICY "Allow public insert game_players" ON game_players FOR INSERT WITH CHECK (true);
```

- Click **Run**. You should see “Success. No rows returned.” After this, **Create game** and **Join game** should work.

---

## 5. Enable Realtime for `games` and `game_players`

- In Supabase: **Database** → **Publications** (or **Replication**).
- The **supabase_realtime** publication should include **games** and **game_players** so the lobby updates when someone joins and when the game starts.

**If the publication shows "0 tables" or is missing a table:** add them via SQL. In **SQL Editor** → **New query**, run:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
```

- Click **Run**. The publication will then list both tables. (If you already added `games` only, run the second line to add `game_players` so the host sees “Players (2/2)” as soon as the other player joins.)

---

## 6. You’re done with Phase 1

After this you have:

- A Supabase project with URL + anon key in `.env.local`
- `games` and `game_players` tables
- Realtime enabled for `games` and `game_players` (lobby updates when the other player joins)

Next step is **Phase 2** in `docs/REMOTE_MULTIPLAYER_PLAN.md`: install the Supabase client, add the lobby UI (Create game / Join game), and wire up `/game/:id`.
