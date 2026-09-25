-- «Ажлууд»: work that isn't part of an event — preparing the budget, booking a hall for next month,
-- updating the member list. Never shown on the public site. Each job belongs to a department and has one
-- accountable person (хариуцагч), who moves it through three stages: not started → in progress → done.
-- Only a department's дарга (for their department) and the President add and change jobs; the хариуцагч is
-- either appointed by them or takes an unassigned job themselves.
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

-- Everything that happened to a job, oldest first: "how is it going" at a glance.
--   status   moved to a new stage (status), maybe with a note
--   note     a progress note on its own
--   take     someone took an unassigned job themselves («Би хийнэ»)
--   release  the хариуцагч stepped down; the job is open again
--   assign   the дарга or the President appointed target_id as хариуцагч (NULL: nobody)
CREATE TABLE job_updates (
  id         INTEGER PRIMARY KEY,
  job_id     INTEGER NOT NULL REFERENCES jobs(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  kind       TEXT NOT NULL DEFAULT 'status' CHECK (kind IN ('status','note','take','release','assign')),
  status     TEXT,
  target_id  INTEGER REFERENCES users(id),
  note       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_job_updates ON job_updates(job_id, id);
