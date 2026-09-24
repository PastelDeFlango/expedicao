CREATE TABLE IF NOT EXISTS shifts (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 1,
  active     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  cpf           TEXT,
  xid           TEXT,
  registration  TEXT,
  job_title     TEXT,
  phone         TEXT,
  hired_at      TEXT,
  role          TEXT NOT NULL,
  primary_shift TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_by    INTEGER,
  created_at    TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_xid ON users(xid) WHERE xid IS NOT NULL;

CREATE TABLE IF NOT EXISTS user_shifts (
  user_id    INTEGER NOT NULL,
  shift_code TEXT NOT NULL,
  granted_by INTEGER,
  granted_at TEXT NOT NULL,
  PRIMARY KEY (user_id, shift_code),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shipments (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  load_code         TEXT NOT NULL,
  client            TEXT NOT NULL DEFAULT '',
  destination       TEXT NOT NULL DEFAULT '',
  dock              TEXT NOT NULL DEFAULT '',
  plate             TEXT NOT NULL DEFAULT '',
  driver            TEXT NOT NULL DEFAULT '',
  carrier           TEXT NOT NULL DEFAULT '',
  vehicle_type      TEXT NOT NULL DEFAULT '',
  quantity          REAL,
  weight            REAL,
  notes             TEXT NOT NULL DEFAULT '',
  hold_reason       TEXT NOT NULL DEFAULT '',
  user_id           INTEGER NOT NULL,
  shift_code        TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  assembly_start_at TEXT,
  assembly_end_at   TEXT,
  gate_in_at        TEXT,
  dock_in_at        TEXT,
  load_start_at     TEXT,
  load_end_at       TEXT,
  dock_out_at       TEXT,
  release_at        TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_ship_created ON shipments(created_at);
CREATE INDEX IF NOT EXISTS idx_ship_shift   ON shipments(shift_code);
CREATE INDEX IF NOT EXISTS idx_ship_user    ON shipments(user_id);

CREATE TABLE IF NOT EXISTS handovers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  from_shift TEXT NOT NULL,
  to_shift   TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  pending    TEXT NOT NULL DEFAULT '',
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS occurrences (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id  INTEGER NOT NULL,
  category     TEXT NOT NULL,
  detail       TEXT NOT NULL DEFAULT '',
  minutes_lost INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  INTEGER,
  detail     TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
