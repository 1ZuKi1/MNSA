-- МОХ core schema. All timestamps are Unix seconds (UTC).
-- Nothing in this database is ever hard-deleted except expired login codes and rate-limit rows.

CREATE TABLE departments (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  code        TEXT NOT NULL UNIQUE,          -- used in document numbers: МОХ-ЭЗХ/2026-2027/014
  name_mn     TEXT NOT NULL,
  is_leadership INTEGER NOT NULL DEFAULT 0,  -- the President/board "department"
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE users (
  id              INTEGER PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name_mn         TEXT NOT NULL,
  student_id      TEXT,
  role            TEXT NOT NULL CHECK (role IN ('president','board','head','member','maintainer')),
  department_id   INTEGER REFERENCES departments(id),
  is_deputy       INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','alumni','suspended')),
  session_version INTEGER NOT NULL DEFAULT 1,  -- bump to kill every session of this user
  term_ends_at    INTEGER,                      -- accounts stop working after this unless renewed
  created_by      INTEGER REFERENCES users(id),
  created_at      INTEGER NOT NULL,
  last_login_at   INTEGER
);
CREATE INDEX idx_users_dept ON users(department_id, status);

CREATE TABLE invites (
  id             INTEGER PRIMARY KEY,
  token_hash     TEXT NOT NULL UNIQUE,          -- the raw token only ever exists inside the link
  name_mn        TEXT NOT NULL,
  student_id     TEXT NOT NULL,
  department_id  INTEGER REFERENCES departments(id),
  role           TEXT NOT NULL CHECK (role IN ('board','head','member','maintainer')),
  created_by     INTEGER NOT NULL REFERENCES users(id),
  expires_at     INTEGER NOT NULL,
  pending_email  TEXT COLLATE NOCASE,           -- email typed by the invitee, not yet verified
  claimed_by     INTEGER REFERENCES users(id),
  claimed_at     INTEGER,
  revoked_at     INTEGER,
  created_at     INTEGER NOT NULL
);

-- One-time login codes. Stored only as an HMAC; the code itself never touches the database.
CREATE TABLE login_codes (
  email       TEXT NOT NULL COLLATE NOCASE,
  purpose     TEXT NOT NULL,                    -- 'login' | 'invite:<id>'
  code_hash   TEXT NOT NULL,
  expires_at  INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (email, purpose)
);

-- Fixed-window rate limits (D1 instead of KV: 100k free writes/day instead of 1k).
CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);

-- ---------------------------------------------------------------- records (replaces Word)

CREATE TABLE records (
  id              INTEGER PRIMARY KEY,
  type            TEXT NOT NULL,                -- see src/lib/record-types.ts
  department_id   INTEGER NOT NULL REFERENCES departments(id),
  author_id       INTEGER NOT NULL REFERENCES users(id),
  academic_year   TEXT NOT NULL,
  number          TEXT UNIQUE,                  -- assigned on first submission, never on draft
  title           TEXT NOT NULL,
  fields_json     TEXT NOT NULL DEFAULT '{}',
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','in_review','approved','rejected','void')),
  step            INTEGER NOT NULL DEFAULT 0,   -- index into the type's approval chain
  awaiting        TEXT CHECK (awaiting IN ('head','legal','president')),  -- whose decision it waits for
  visibility      TEXT NOT NULL DEFAULT 'staff' CHECK (visibility IN ('staff','dept')),
  version         INTEGER NOT NULL DEFAULT 1,
  submitted_at    INTEGER,
  decided_at      INTEGER,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX idx_records_dept ON records(department_id, academic_year, status);
CREATE INDEX idx_records_status ON records(status, updated_at DESC);
CREATE INDEX idx_records_author ON records(author_id, status);
CREATE INDEX idx_records_awaiting ON records(awaiting, department_id) WHERE status = 'in_review';

CREATE TABLE record_versions (
  id          INTEGER PRIMARY KEY,
  record_id   INTEGER NOT NULL REFERENCES records(id),
  version     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL,
  UNIQUE (record_id, version)
);

CREATE TABLE record_actions (
  id          INTEGER PRIMARY KEY,
  record_id   INTEGER NOT NULL REFERENCES records(id),
  actor_id    INTEGER NOT NULL REFERENCES users(id),
  action      TEXT NOT NULL,   -- create | edit | submit | auto | approve | reject | withdraw | void
  step        TEXT,            -- head | legal | president
  comment     TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_record_actions ON record_actions(record_id, id);

-- Atomic per-department, per-year sequence for document numbers.
CREATE TABLE counters (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- ---------------------------------------------------------------- events

CREATE TABLE events (
  id               INTEGER PRIMARY KEY,
  slug             TEXT NOT NULL,              -- cosmetic, for readable URLs; lookups use id
  title            TEXT NOT NULL,
  summary          TEXT,
  body             TEXT,
  starts_at        INTEGER NOT NULL,
  ends_at          INTEGER NOT NULL,
  location         TEXT,
  department_id    INTEGER REFERENCES departments(id),   -- organising department
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
  cover_media_id   TEXT,
  source_record_id INTEGER REFERENCES records(id),
  academic_year    TEXT NOT NULL,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  published_by     INTEGER REFERENCES users(id),
  published_at     INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX idx_events_public ON events(status, ends_at);
CREATE INDEX idx_events_year ON events(academic_year);

CREATE TABLE event_tasks (
  id            INTEGER PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id),
  title         TEXT NOT NULL,
  notes         TEXT,
  due_at        INTEGER,
  department_id INTEGER REFERENCES departments(id),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL
);
CREATE INDEX idx_tasks_event ON event_tasks(event_id, sort_order);

-- Permanent: this is the yearly "who worked on what" record.
CREATE TABLE task_assignments (
  id           INTEGER PRIMARY KEY,
  task_id      INTEGER NOT NULL REFERENCES event_tasks(id),
  user_id      INTEGER NOT NULL REFERENCES users(id),
  volunteered  INTEGER NOT NULL,               -- 1 = took it themselves ("Би хийнэ")
  assigned_by  INTEGER NOT NULL REFERENCES users(id),
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','dropped')),
  assigned_at  INTEGER NOT NULL,
  finished_at  INTEGER
);
CREATE INDEX idx_assign_task ON task_assignments(task_id, status);
CREATE INDEX idx_assign_user ON task_assignments(user_id, assigned_at);

CREATE TABLE event_photos (
  id          INTEGER PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id),
  media_id    TEXT NOT NULL,                   -- id in the MEDIA database
  caption     TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_photos_event ON event_photos(event_id, sort_order);

-- ---------------------------------------------------------------- audit

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  detail      TEXT,
  ip          TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX idx_audit_time ON audit_log(created_at DESC);

-- ---------------------------------------------------------------- fixed data

INSERT INTO departments (id, slug, code, name_mn, is_leadership, sort_order) VALUES
  (1, 'udirdlaga', 'УД',  'Удирдлага',        1, 0),
  (2, 'dotood',    'ДХ',  'Дотоод хэлтэс',    0, 1),
  (3, 'gadaad',    'ГХ',  'Гадаад хэлтэс',    0, 2),
  (4, 'surgalt',   'СХ',  'Сургалтын хэлтэс', 0, 3),
  (5, 'media',     'МХ',  'Медиа хэлтэс',     0, 4),
  (6, 'erh-zui',   'ЭЗХ', 'Эрх зүйн хэлтэс',  0, 5);
