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

## 4. Create the database tables (detailed steps)

Follow these steps exactly to create the `games` and `game_players` tables.

### 4.1 Open the SQL Editor

1. Log in to [Supabase](https://supabase.com) and open your project.
2. In the left sidebar, click **SQL Editor** (icon looks like `</>` or “SQL”).
3. Click **New query** (top right). You get a blank SQL editor.

### 4.2 Run the table-creation script (new project)

1. Copy the entire SQL block below (including comments).
2. Paste it into the SQL Editor.
3. Click **Run** (or press Cmd/Ctrl + Enter).
4. You should see: **“Success. No rows returned.”** That means the tables were created.

```sql
-- Games: one row per game. state is the full GameState JSON (null in lobby).
create table games (
  id uuid primary key default gen_random_uuid(),
  num_players smallint not null check (num_players between 2 and 4),
  phase text not null default 'lobby' check (phase in ('lobby', 'setup', 'playing', 'ended')),
  state jsonb,
  oregons_omens boolean not null default false,
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

**If you get an error:**

- **“relation 'games' already exists”** — You already created `games`. Skip to **4.3** and only add the `oregons_omens` column if needed, or run the **4.4** migration.
- **“relation 'game_players' already exists”** — You already have `game_players`. Run only the **4.4** migration if you need `oregons_omens` on `games`.

### 4.3 Verify the tables

1. In the left sidebar, go to **Table Editor**.
2. You should see **games** and **game_players** in the list.
3. Click **games**. Columns should include: `id`, `num_players`, `phase`, `state`, `oregons_omens`, `created_at`, `updated_at`.
4. Click **game_players**. Columns should include: `id`, `game_id`, `player_index`, `nickname`, `joined_at`.

### 4.4 Add Oregon's Omens column (existing projects only)

**Do this only if** you created the `games` table **before** the Oregon's Omens feature (i.e. your `games` table has no `oregons_omens` column).

1. In **SQL Editor**, click **New query** again.
2. Paste and run this single statement:

```sql
ALTER TABLE games ADD COLUMN IF NOT EXISTS oregons_omens boolean NOT NULL DEFAULT false;
```

3. Click **Run**. You should see **“Success. No rows returned.”**
4. In **Table Editor** → **games**, confirm the new column **oregons_omens** (type: boolean, default false).

### 4.5 Optional: Drop and recreate (only if you want a clean slate)

If you want to delete existing tables and start over (this deletes all games and players):

1. **SQL Editor** → **New query**.
2. Run (in this order):

```sql
DROP TABLE IF EXISTS game_players;
DROP TABLE IF EXISTS games;
```

3. Then run the full **4.2** script again to recreate both tables with `oregons_omens` included.

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
