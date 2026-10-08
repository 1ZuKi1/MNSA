-- «Нэгдэх»: joining a job someone is already on. A job keeps one accountable хариуцагч (jobs.owner_id);
-- anyone else who can see it may join to help, without waiting to be appointed, and leave again.
-- A row is never deleted: leaving sets left_at, so the job's history shows who joined and when.
-- Someone who becomes the хариуцагч (takes the job, or is appointed) stops being a helper (left_at is set).
CREATE TABLE job_helpers (
  id        INTEGER PRIMARY KEY,
  job_id    INTEGER NOT NULL REFERENCES jobs(id),
  user_id   INTEGER NOT NULL REFERENCES users(id),
  joined_at INTEGER NOT NULL,
  left_at   INTEGER,
  -- why the row closed: 'left' (stepped back), 'owner' (became the хариуцагч), 'removed' (left the workspace)
  left_reason TEXT CHECK (left_reason IN ('left','owner','removed'))
);
-- One open row per person per job: joining twice is impossible even with two quick taps.
CREATE UNIQUE INDEX idx_job_helpers_open ON job_helpers(job_id, user_id) WHERE left_at IS NULL;
CREATE INDEX idx_job_helpers_user ON job_helpers(user_id) WHERE left_at IS NULL;
