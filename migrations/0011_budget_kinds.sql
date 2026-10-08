-- The association's real budget sheets (Соёлын өдөрлөг, 2026-10) list more than spent and planned:
--   planned lines carry a state: «Авах боломжтой» · «Хойшлуулсан» · «Авах боломжгүй»;
--   some quantities are a range (хуушуур 300–450 ш → ¥1,500–¥2,250);
--   some things cost nothing: «Байгаа» (left from last year) and «Хандиваар» (someone gives it).
-- SQLite can't change a CHECK constraint, so budget_items is rebuilt with the wider set of statuses.
-- Nothing references budget_items, and every existing row keeps its id and values.

CREATE TABLE budget_items_new (
  id            INTEGER PRIMARY KEY,
  status        TEXT NOT NULL DEFAULT 'spent' CHECK (status IN ('spent','planned','have','donated')),
  plan_state    TEXT CHECK (plan_state IN ('can','postponed','cannot')),  -- planned lines only
  academic_year TEXT NOT NULL,
  spent_on      INTEGER NOT NULL,
  item          TEXT NOT NULL,
  purpose       TEXT,
  qty_c         INTEGER NOT NULL,            -- quantity × 100 (the low end of a range)
  qty_max_c     INTEGER,                     -- the high end of a range, planned lines only; NULL = exact
  unit_fen      INTEGER NOT NULL,            -- 0 for «Байгаа» and «Хандиваар»
  total_fen     INTEGER NOT NULL,
  total_max_fen INTEGER,                     -- with a range: round(qty_max_c × unit_fen / 100)
  donor         TEXT,                        -- «Хандиваар»: who gives it
  created_by    INTEGER NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  deleted_by    INTEGER REFERENCES users(id),
  deleted_at    INTEGER,
  delete_reason TEXT,
  confirmed_by  INTEGER REFERENCES users(id),
  confirmed_at  INTEGER
);

INSERT INTO budget_items_new (id, status, plan_state, academic_year, spent_on, item, purpose, qty_c, unit_fen, total_fen,
                              created_by, created_at, deleted_by, deleted_at, delete_reason, confirmed_by, confirmed_at)
SELECT id, status, CASE WHEN status = 'planned' THEN 'can' END, academic_year, spent_on, item, purpose, qty_c, unit_fen, total_fen,
       created_by, created_at, deleted_by, deleted_at, delete_reason, confirmed_by, confirmed_at
  FROM budget_items;

DROP TABLE budget_items;
ALTER TABLE budget_items_new RENAME TO budget_items;
CREATE INDEX idx_budget_items_year ON budget_items(academic_year, spent_on) WHERE deleted_at IS NULL;
