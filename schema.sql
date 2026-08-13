-- Session-centric ledger. Replaces the old profiles/games pair, where two people at the same
-- table produced two unrelated rows (no session, no opponents, no per-category detail, no URL).
--
-- Every statement below is CREATE TABLE/INDEX IF NOT EXISTS — re-running this file is additive,
-- not destructive, and safe against the real production data the ledger now holds (its first game
-- was saved 2026-08-13). Only `games`/`profiles`, retired before this schema shipped, are dropped.
--
-- scripts/init-db.mjs splits this file on ';' and runs each statement individually — keep every
-- statement ';'-terminated and avoid ';' inside string literals or function bodies.

DROP TABLE IF EXISTS games;
DROP TABLE IF EXISTS profiles;

CREATE TABLE IF NOT EXISTS people (
  id BIGSERIAL PRIMARY KEY,
  name_key TEXT NOT NULL UNIQUE,          -- one human, not one per game
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  public_id     TEXT NOT NULL UNIQUE,          -- short URL-safe id
  game_key      TEXT NOT NULL,
  rules_version INTEGER NOT NULL DEFAULT 1,
  variant       JSONB NOT NULL DEFAULT '{}',
  ended_by      TEXT NOT NULL DEFAULT 'score',
  played_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS session_players (
  id BIGSERIAL PRIMARY KEY,
  session_id   BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  person_id    BIGINT REFERENCES people(id) ON DELETE SET NULL,  -- NULL = unnamed guest
  seat         SMALLINT NOT NULL,
  display_name TEXT NOT NULL,   -- snapshot; renaming a person must not rewrite history
  total_score  INTEGER,         -- NULL when ended_by <> 'score'
  is_winner    BOOLEAN NOT NULL DEFAULT false,
  detail       JSONB NOT NULL DEFAULT '{}',
  UNIQUE (session_id, seat)
);

CREATE TABLE IF NOT EXISTS session_photos (
  id BIGSERIAL PRIMARY KEY,
  session_id        BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  session_player_id BIGINT REFERENCES session_players(id) ON DELETE CASCADE,
  blob_url          TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_game_played ON sessions (game_key, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_players_person ON session_players (person_id);
CREATE INDEX IF NOT EXISTS idx_session_players_session ON session_players (session_id);
CREATE INDEX IF NOT EXISTS idx_session_photos_session ON session_photos (session_id);

-- high_score is deliberately NOT stored anywhere. It is derived (MAX(total_score)), so it cannot
-- drift out of sync with the sessions that produced it.
