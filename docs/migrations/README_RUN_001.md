# How to run migration 001_add_games_is_public.sql on Supabase

Follow these steps to add the `is_public` column and ensure Realtime is enabled.

---

## 1. Open your Supabase project

1. Go to [https://supabase.com](https://supabase.com) and sign in.
2. Open the project you use for Settlers of Oregon (the one whose URL and anon key are in your `.env.local`).

---

## 2. Open the SQL Editor

1. In the **left sidebar**, click **SQL Editor** (the `</>` icon or “SQL Editor” label).
2. Click **New query** (top right). You get a blank SQL editor tab.

---

## 3. Paste the migration SQL

1. Open the file **`docs/migrations/001_add_games_is_public.sql`** in your project.
2. Copy the **entire** contents (all lines, including comments).
3. Paste into the Supabase SQL Editor.

You should see something like:

```sql
-- Migration: Add is_public to games for Lobby Browser
-- Run this in Supabase SQL Editor.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Ensure Realtime is enabled for both tables (required for lobby list updates).
-- If you see "table is already in publication", you can skip these two lines.
ALTER PUBLICATION supabase_realtime ADD TABLE games;
ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
```

---

## 4. Run the query

1. Click **Run** (bottom right of the SQL Editor), or press **Ctrl+Enter** (Windows/Linux) / **Cmd+Enter** (Mac).
2. Wait a moment for Supabase to execute the statements.

---

## 5. Check the result

**Success:** You see a green success message and “Success. No rows returned.” (or similar). No error in the results panel.

**If you see an error:**

- **“relation 'games' does not exist”**  
  Create the `games` and `game_players` tables first using the steps in **`docs/SUPABASE_SETUP_STEPS.md`** (section 4), then run this migration again.

- **“table … is already a member of publication 'supabase_realtime'”**  
  Realtime is already set up for that table. You can:
  - **Option A:** Ignore the error; the important part is that `is_public` was added.  
  - **Option B:** Run only the first part of the migration (the `ALTER TABLE` and the one `ADD TABLE` that didn’t error). Or comment out the two `ALTER PUBLICATION` lines in the migration file and run it again so only the column is added.

---

## 6. Confirm the new column (optional)

1. In the left sidebar, open **Table Editor**.
2. Click the **games** table.
3. Check the column list: you should see **is_public** (type: boolean, default: true).

Existing rows will have `is_public = true` by default. New games created by the app will set `is_public` explicitly when inserting.

---

## 7. You’re done

After this, the Lobby Browser in the app can filter by `is_public = true` and Realtime will keep the lobby list in sync when games or players change.
