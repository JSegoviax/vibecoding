-- Migration: Add is_public to games for Lobby Browser
-- Run this in Supabase SQL Editor.

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Ensure Realtime is enabled for both tables (safe to run even if already in publication).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE games;
EXCEPTION
  WHEN SQLSTATE '42710' THEN NULL;  -- already member of publication
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE game_players;
EXCEPTION
  WHEN SQLSTATE '42710' THEN NULL;  -- already member of publication
END $$;
