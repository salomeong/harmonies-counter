CREATE TABLE IF NOT EXISTS profiles (
  id            BIGSERIAL PRIMARY KEY,
  name_key      TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  high_score    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS games (
  id            BIGSERIAL PRIMARY KEY,
  profile_id    BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  total_score   INTEGER NOT NULL,
  played_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_profile_played ON games (profile_id, played_at DESC);
