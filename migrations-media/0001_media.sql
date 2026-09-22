-- Photo bytes, kept in their own database so they can never crowd out the records (500 MB each on the free plan).
-- id is a random 128-bit token: knowing the URL is the permission, so draft photos aren't guessable.
CREATE TABLE media (
  id         TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  bytes      BLOB NOT NULL,
  width      INTEGER,
  height     INTEGER,
  size       INTEGER NOT NULL,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
