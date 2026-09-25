-- «Ажлууд»: work that isn't part of an event — preparing the budget, booking a hall for next month,
-- updating the member list. Never shown on the public site. Each job belongs to a department and has one
-- accountable person (хариуцагч), who moves it through three stages: not started → in progress → done.
-- visibility 'dept': that department and the leadership see it; 'staff': everyone in the workspace.
CREATE TABLE jobs (
  id            INTEGER PRIMARY KEY,
  title         TEXT NOT NULL,
  notes         TEXT,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  owner_id      INTEGER REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done','cancelled')),
  visibility    TEXT NOT NULL DEFAULT 'dept' CHECK (visibility IN ('dept','staff')),
  due_at        INTEGER,
  created_by    INTEGER NOT NULL REFERENCES users(id),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  done_at       INTEGER
);
CREATE INDEX idx_jobs_owner ON jobs(owner_id, status);
CREATE INDEX idx_jobs_dept ON jobs(department_id, status);

-- Every stage change and progress note, oldest first: "how is it going" at a glance.
CREATE TABLE job_updates (
  id         INTEGER PRIMARY KEY,
  job_id     INTEGER NOT NULL REFERENCES jobs(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  status     TEXT,            -- the new stage, or NULL for a note only
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_job_updates ON job_updates(job_id, id);
