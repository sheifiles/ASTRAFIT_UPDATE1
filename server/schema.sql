PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crew_members (
  crew_id     TEXT PRIMARY KEY,
  full_name   TEXT NOT NULL,
  role        TEXT,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id       INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id          TEXT NOT NULL REFERENCES crew_members(crew_id),
  started_at       TEXT DEFAULT (datetime('now')),
  body_region      TEXT,
  exact_location   TEXT,
  pain_description TEXT,
  pain_intensity   INTEGER,
  heart_rate       INTEGER,
  coded_marker     TEXT,
  pitch_deg        REAL,
  roll_deg         REAL,
  contact_force_n  REAL,
  impact_g         REAL,
  notes            TEXT
);

CREATE TABLE IF NOT EXISTS ref_datasets (
  dataset_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT UNIQUE NOT NULL,
  source_url  TEXT,
  license     TEXT,
  anatomy     TEXT
);

CREATE TABLE IF NOT EXISTS ref_images (
  ref_id      INTEGER PRIMARY KEY AUTOINCREMENT,
  dataset_id  INTEGER NOT NULL REFERENCES ref_datasets(dataset_id),
  file_path   TEXT NOT NULL,
  label       TEXT,
  split       TEXT CHECK (split IN ('train','val','test')),
  sha256      TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS scans (
  scan_id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES sessions(session_id),
  image_path      TEXT NOT NULL,
  captured_at     TEXT DEFAULT (datetime('now')),
  model_version   TEXT,
  predicted_label TEXT,
  confidence      REAL
);

CREATE TABLE IF NOT EXISTS decisions (
  decision_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id      INTEGER NOT NULL REFERENCES sessions(session_id),
  scan_id         INTEGER REFERENCES scans(scan_id),
  recommendation  TEXT,
  rationale       TEXT,
  matched_ref_ids TEXT,
  created_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_crew ON sessions(crew_id);
CREATE INDEX IF NOT EXISTS idx_ref_label ON ref_images(label);