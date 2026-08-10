CREATE TABLE IF NOT EXISTS profiles (
  id            BIGSERIAL PRIMARY KEY,
  name_key      TEXT NOT NULL,
  display_name  TEXT NOT NULL,
  high_score    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  game          TEXT NOT NULL DEFAULT 'harmonies'
);

CREATE TABLE IF NOT EXISTS games (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_score   INTEGER NOT NULL,
  played_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_profile_played ON games (profile_id, played_at DESC);

-- Multi-game support: each (name_key, game) pair is its own profile, so the
-- same person can have a separate high score/history per game.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS game TEXT NOT NULL DEFAULT 'harmonies';
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_name_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_name_key_game_idx ON profiles (name_key, game);
CREATE INDEX IF NOT EXISTS idx_profiles_game_highscore ON profiles (game, high_score DESC);
