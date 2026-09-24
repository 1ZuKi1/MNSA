-- A document can belong to a second department as well («хамтран хариуцах хэлтэс»): it shows in both
-- departments' archives, both can read it, and that department's дарга approves it too — a new step,
-- 'cohead', right after the main дарга. Numbering stays with the main department.
--
-- SQLite can't change a CHECK constraint in place, so the table is rebuilt with the new step allowed.
-- Every id, number, status and history row is kept exactly as it was. The rows are set aside, the table is
-- recreated under its own name and the rows go back in: re-inserting them is what satisfies the history
-- tables' foreign keys again (renaming a copy into place would not).
PRAGMA defer_foreign_keys = true;

CREATE TABLE records_old AS SELECT * FROM records;
DROP TABLE records;

CREATE TABLE records (
  id                INTEGER PRIMARY KEY,
  type              TEXT NOT NULL,                -- see src/lib/record-types.ts
  department_id     INTEGER NOT NULL REFERENCES departments(id),
  co_department_id  INTEGER REFERENCES departments(id),  -- optional second department
  author_id         INTEGER NOT NULL REFERENCES users(id),
  academic_year     TEXT NOT NULL,
  number            TEXT UNIQUE,                  -- assigned on first submission, never on draft
  title             TEXT NOT NULL,
  fields_json       TEXT NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','in_review','approved','rejected','void')),
  step              INTEGER NOT NULL DEFAULT 0,   -- index into the record's approval chain
  awaiting          TEXT CHECK (awaiting IN ('head','cohead','legal','president')),  -- whose decision it waits for
  visibility        TEXT NOT NULL DEFAULT 'staff' CHECK (visibility IN ('staff','dept')),
  version           INTEGER NOT NULL DEFAULT 1,
  submitted_at      INTEGER,
  decided_at        INTEGER,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL,
  CHECK (co_department_id IS NULL OR co_department_id <> department_id)
);

INSERT INTO records (id, type, department_id, author_id, academic_year, number, title, fields_json, status, step,
                     awaiting, visibility, version, submitted_at, decided_at, created_at, updated_at)
  SELECT id, type, department_id, author_id, academic_year, number, title, fields_json, status, step,
         awaiting, visibility, version, submitted_at, decided_at, created_at, updated_at
    FROM records_old;
DROP TABLE records_old;

CREATE INDEX idx_records_dept ON records(department_id, academic_year, status);
CREATE INDEX idx_records_status ON records(status, updated_at DESC);
CREATE INDEX idx_records_author ON records(author_id, status);
CREATE INDEX idx_records_awaiting ON records(awaiting, department_id) WHERE status = 'in_review';
CREATE INDEX idx_records_codept ON records(co_department_id, academic_year) WHERE co_department_id IS NOT NULL;
