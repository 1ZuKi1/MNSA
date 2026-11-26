-- Deleting documents (2026-11).
--
-- Numbers are now given when a document is approved, not when it is first sent: a draft, a document in
-- review and one sent back have none, so deleting them leaves no gap. Documents numbered under the old rule
-- keep their numbers.
--
-- An approved (or voided) document is deleted only when the President's side AND the Legal дарга both
-- confirm. The later numbers in its series then move down by one (Т4 → Т3). This table is the record of
-- every such request, and keeps a copy of what was deleted so it can never be lost without a trace.

CREATE TABLE record_deletions (
  id              INTEGER PRIMARY KEY,
  record_id       INTEGER NOT NULL,              -- no foreign key: the record is gone once this is done
  record_number   TEXT,
  record_title    TEXT NOT NULL,
  reason          TEXT NOT NULL,
  requested_by    INTEGER NOT NULL REFERENCES users(id),
  president_by    INTEGER REFERENCES users(id),  -- the President's side confirmed (President or maintainer)
  legal_by        INTEGER REFERENCES users(id),  -- the Legal дарга confirmed
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','cancelled')),
  cancelled_by    INTEGER REFERENCES users(id),  -- null on a cancelled request = it expired (7 days)
  renumbered_json TEXT,                          -- [{"from":"…/004","to":"…/003"}, …]
  snapshot_json   TEXT,                          -- the deleted record, its versions and its history
  created_at      INTEGER NOT NULL,
  decided_at      INTEGER
);
CREATE UNIQUE INDEX record_deletions_one_pending ON record_deletions (record_id) WHERE status = 'pending';
CREATE INDEX record_deletions_status ON record_deletions (status, created_at);
