-- «Төсөв» — the association's budget, shown openly on the public site (pkumongolia.com/tosov) and kept on
-- the staff site (team.pkumongolia.com/tosov). Only a «Төсвийн хариуцагч» adds and removes rows or changes
-- the two headline numbers; the President (or the maintainer) grants that on the person's page in «Гишүүд».
-- Money is stored in fen (1 юань = 100 fen) and quantities in hundredths, so no sum is ever off by a float.

ALTER TABLE users ADD COLUMN is_budget_keeper INTEGER NOT NULL DEFAULT 0;

-- One row per academic year: what was planned at the start, and the money actually in hand.
-- Spent and remaining are never stored — they are summed from budget_items, so they can't drift.
CREATE TABLE budget_years (
  academic_year TEXT PRIMARY KEY,            -- '2026-2027'
  planned_fen   INTEGER NOT NULL DEFAULT 0,  -- «Төлөвлөсөн төсөв»
  funds_fen     INTEGER NOT NULL DEFAULT 0,  -- «Одоо байгаа хөрөнгө»: received so far
  note          TEXT,                        -- where the money comes from, shown under the numbers
  updated_by    INTEGER REFERENCES users(id),
  updated_at    INTEGER NOT NULL
);

-- One spending line. total_fen = round(qty_c × unit_fen / 100), computed once on saving.
-- Removing a line sets deleted_at: it leaves the public table, but the staff page and the audit log keep it.
CREATE TABLE budget_items (
  id            INTEGER PRIMARY KEY,
  academic_year TEXT NOT NULL,
  spent_on      INTEGER NOT NULL,            -- the day it was bought (Unix seconds, Beijing midnight)
  item          TEXT NOT NULL,               -- «Зүйл»
  purpose       TEXT,                        -- «Зориулалт»: which event or need
  qty_c         INTEGER NOT NULL,            -- quantity × 100
  unit_fen      INTEGER NOT NULL,            -- price of one
  total_fen     INTEGER NOT NULL,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  deleted_by    INTEGER REFERENCES users(id),
  deleted_at    INTEGER,
  delete_reason TEXT
);
CREATE INDEX idx_budget_items_year ON budget_items(academic_year, spent_on) WHERE deleted_at IS NULL;
