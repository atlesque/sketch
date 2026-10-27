-- Sketch: rooms for matchmaking and the admin's live list, finished games and turns, the audit log,
-- bans, reports and the stats of players signed in with Atlesque Play. Times are ms since the epoch.

-- One row per room; the room's Durable Object keeps it up to date (players = connected players).
CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  public INTEGER NOT NULL,
  players INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL,
  phase TEXT NOT NULL DEFAULT 'lobby',
  host_name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE INDEX rooms_open ON rooms (closed_at, public, updated_at);

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  public INTEGER NOT NULL,
  settings TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  end_reason TEXT,
  -- JSON [{ id, name, account, score, rank }]
  players TEXT,
  winner_name TEXT,
  turns INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX games_started ON games (started_at);
CREATE INDEX games_room ON games (room_code, started_at);

CREATE TABLE turns (
  game_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  round INTEGER NOT NULL,
  drawer_id TEXT,
  drawer_name TEXT,
  word TEXT,
  started_at INTEGER,
  ended_at INTEGER,
  end_reason TEXT,
  guessed INTEGER NOT NULL DEFAULT 0,
  eligible INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  dislikes INTEGER NOT NULL DEFAULT 0,
  -- R2 key of the turn's drawing (the ops, replayed in the admin)
  drawing_key TEXT,
  -- JSON [{ id, name, points }]
  gains TEXT,
  PRIMARY KEY (game_id, idx)
);

-- The audit log: everything that happens in a room, plus every admin action.
CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  room_code TEXT,
  game_id TEXT,
  type TEXT NOT NULL,
  -- the player id, or "admin:<email>"
  actor TEXT,
  actor_name TEXT,
  account_id TEXT,
  account_email TEXT,
  device TEXT,
  ip TEXT,
  target TEXT,
  target_name TEXT,
  text TEXT,
  data TEXT
);
CREATE INDEX events_ts ON events (ts);
CREATE INDEX events_room ON events (room_code, ts);
CREATE INDEX events_game ON events (game_id, ts);
CREATE INDEX events_type ON events (type, ts);
CREATE INDEX events_account ON events (account_id, ts);
CREATE INDEX events_device ON events (device, ts);

-- Site-wide bans, checked when someone joins a room: kind is 'account' (Atlesque Play user id), 'device' or 'ip'.
CREATE TABLE bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  label TEXT,
  reason TEXT,
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  expires_at INTEGER,
  lifted_at INTEGER,
  lifted_by TEXT
);
CREATE INDEX bans_value ON bans (kind, value);

CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  room_code TEXT,
  game_id TEXT,
  turn_idx INTEGER,
  reporter_id TEXT,
  reporter_name TEXT,
  reporter_account TEXT,
  target_id TEXT,
  target_name TEXT,
  target_account TEXT,
  target_device TEXT,
  reason TEXT,
  word TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_at INTEGER,
  resolved_by TEXT,
  note TEXT
);
CREATE INDEX reports_status ON reports (status, ts);

CREATE TABLE account_stats (
  account_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  games INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  guesses INTEGER NOT NULL DEFAULT 0,
  drawings INTEGER NOT NULL DEFAULT 0,
  first_played INTEGER,
  last_played INTEGER
);
