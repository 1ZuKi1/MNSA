-- Association-wide settings that only the President changes (for now: which stored image is the official stamp).
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by INTEGER REFERENCES users(id),
  updated_at INTEGER NOT NULL
);
