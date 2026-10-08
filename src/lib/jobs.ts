/**
 * «Ажлууд» — the association's work that isn't part of an event. Staff only, never on the public site.
 * A job belongs to one department, has one accountable person (хариуцагч) and moves through three stages.
 * Anyone else who can see it may join to help («Нэгдэх») without waiting to be appointed (job_helpers).
 * Who may do what is decided in permissions.ts (canReadJob / canEditJob / canUpdateJob / canJoinJob).
 */
import { auditStmt, db, deptBySlug, many, one, stmt } from './db';
import { jobAssignedMail, sendMail } from './mailer';
import * as P from './permissions';
import { Denied } from './records';
import { staffOrigin } from './site';
import { academicYear, now } from './time';
import type { DeptSlug, SessionUser } from './types';

export type JobStatus = 'todo' | 'doing' | 'done' | 'cancelled';
export const JOB_STAGES: Exclude<JobStatus, 'cancelled'>[] = ['todo', 'doing', 'done'];
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  todo: 'Эхлээгүй',
  doing: 'Хийгдэж байна',
  done: 'Дууссан',
  cancelled: 'Цуцалсан',
};

export interface JobRow {
  id: number;
  title: string;
  notes: string | null;
  dept_slug: DeptSlug;
  dept_name: string;
  owner_id: number | null;
  owner_name: string | null;
  status: JobStatus;
  visibility: P.JobVisibility;
  due_at: number | null;
  created_by: number;
  creator_name: string;
  created_at: number;
  updated_at: number;
  done_at: number | null;
  /** The latest progress note, for the board cards. */
  last_note: string | null;
  /** People who joined to help, oldest first: JSON [{ id, name }]. Read it with helpersOf(). */
  helpers_json: string | null;
}

export interface Helper {
  id: number;
  name: string;
}
export function helpersOf(j: Pick<JobRow, 'helpers_json'>): Helper[] {
  try {
    const list = JSON.parse(j.helpers_json ?? '[]') as Helper[];
    return Array.isArray(list) ? list.filter((h) => h && typeof h.id === 'number') : [];
  } catch {
    return [];
  }
}

const SELECT = `SELECT j.id, j.title, j.notes, d.slug AS dept_slug, d.name_mn AS dept_name, j.owner_id, o.name_mn AS owner_name,
                       j.status, j.visibility, j.due_at, j.created_by, c.name_mn AS creator_name, j.created_at, j.updated_at, j.done_at,
                       (SELECT u.note FROM job_updates u WHERE u.job_id = j.id AND u.note IS NOT NULL ORDER BY u.id DESC LIMIT 1) AS last_note,
                       (SELECT json_group_array(json_object('id', x.user_id, 'name', x.name_mn))
                          FROM (SELECT h.user_id, hu.name_mn FROM job_helpers h JOIN users hu ON hu.id = h.user_id
                                 WHERE h.job_id = j.id AND h.left_at IS NULL ORDER BY h.id) x) AS helpers_json
                  FROM jobs j JOIN departments d ON d.id = j.department_id
                  LEFT JOIN users o ON o.id = j.owner_id JOIN users c ON c.id = j.created_by`;

export const asJobLike = (j: Pick<JobRow, 'dept_slug' | 'owner_id' | 'created_by' | 'visibility' | 'helpers_json'>): P.JobLike => ({
  dept: j.dept_slug,
  ownerId: j.owner_id,
  createdBy: j.created_by,
  visibility: j.visibility,
  helperIds: helpersOf(j).map((h) => h.id),
});

/** Is this person on the job at all — as the хариуцагч or helping? */
export const isOnJob = (a: Pick<SessionUser, 'id'>, j: Pick<JobRow, 'owner_id' | 'helpers_json'>) =>
  j.owner_id === a.id || helpersOf(j).some((h) => h.id === a.id);

/** SQL: this person (?n) is helping on job j. */
const HELPING = (n: number) => `EXISTS (SELECT 1 FROM job_helpers h WHERE h.job_id = j.id AND h.user_id = ?${n} AND h.left_at IS NULL)`;

export const getJob = (id: number) => one<JobRow>(`${SELECT} WHERE j.id = ?`, id);

/**
 * Jobs this person may see. Done jobs stay on the board for 30 days, then only in the department's
 * history; cancelled ones are listed only when asked for.
 */
export async function visibleJobs(a: SessionUser, opts: { dept?: DeptSlug | null; mine?: boolean; cancelled?: boolean } = {}) {
  const t = now();
  const rows = await many<JobRow>(
    `${SELECT}
      WHERE (j.status IN ('todo','doing') OR (j.status = 'done' AND j.done_at > ?1) OR (?2 = 1 AND j.status = 'cancelled'))
        AND (?3 IS NULL OR d.slug = ?3)
        AND (?4 = 0 OR j.owner_id = ?5 OR ${HELPING(5)})
      ORDER BY CASE j.status WHEN 'doing' THEN 0 WHEN 'todo' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
               j.due_at IS NULL, j.due_at, j.id DESC`,
    t - 30 * 86400,
    opts.cancelled ? 1 : 0,
    opts.dept ?? null,
    opts.mine ? 1 : 0,
    a.id,
  );
  return rows.filter((j) => P.canReadJob(a, asJobLike(j)));
}

/** Open jobs this person is on — as the хариуцагч or helping: the dashboard and the menu count. */
export const myOpenJobs = (a: SessionUser) =>
  many<JobRow>(
    `${SELECT} WHERE (j.owner_id = ?1 OR ${HELPING(1)}) AND j.status IN ('todo','doing') ORDER BY j.due_at IS NULL, j.due_at, j.id`,
    a.id,
  );

export interface JobUpdateRow {
  id: number;
  user_name: string;
  /** join / leave: someone joined to help, or stepped back (from job_helpers). */
  kind: 'status' | 'note' | 'take' | 'release' | 'assign' | 'join' | 'leave';
  status: JobStatus | null;
  target_name: string | null;
  note: string | null;
  created_at: number;
}
/** The job's history, oldest first: its own updates, and people joining and stepping back. */
export const jobUpdates = (jobId: number) =>
  many<JobUpdateRow>(
    `SELECT * FROM (
       SELECT u.id, us.name_mn AS user_name, u.kind, u.status, t.name_mn AS target_name, u.note, u.created_at
         FROM job_updates u JOIN users us ON us.id = u.user_id LEFT JOIN users t ON t.id = u.target_id
        WHERE u.job_id = ?1
       UNION ALL
       SELECT -h.id, hu.name_mn, 'join', NULL, NULL, NULL, h.joined_at
         FROM job_helpers h JOIN users hu ON hu.id = h.user_id WHERE h.job_id = ?1
       UNION ALL
       SELECT -h.id, hu.name_mn, 'leave', NULL, NULL, NULL, h.left_at
         FROM job_helpers h JOIN users hu ON hu.id = h.user_id WHERE h.job_id = ?1 AND h.left_reason IN ('left','removed')
     ) ORDER BY created_at, CASE kind WHEN 'join' THEN 0 WHEN 'leave' THEN 2 ELSE 1 END, ABS(id)`,
    jobId,
  );

/** Open jobs with nobody on them that this person could take: the dashboard's «Хүн хэрэгтэй» list. */
export async function takeableJobs(a: SessionUser) {
  const rows = await many<JobRow>(`${SELECT} WHERE j.owner_id IS NULL AND j.status IN ('todo','doing') ORDER BY j.due_at IS NULL, j.due_at, j.id LIMIT 30`);
  return rows.filter((j) => P.canTakeJob(a, asJobLike(j)));
}

/** People a job can be put on: everyone active in the workspace except the maintainer, department first. */
export const assignablePeople = () =>
  many<{ id: number; name_mn: string; dept_slug: DeptSlug | null; dept_name: string | null }>(
    `SELECT u.id, u.name_mn, d.slug AS dept_slug, d.name_mn AS dept_name FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.status = 'active' AND u.role <> 'maintainer' ORDER BY d.sort_order, u.name_mn`,
  );

export interface JobInput {
  title: string;
  notes: string;
  dept: DeptSlug;
  ownerId: number | null;
  dueAt: number | null;
  visibility: P.JobVisibility;
}

export class BadJob extends Error {}

/** Someone who becomes the хариуцагч stops being a helper on the same job. */
const endHelping = (jobId: number, userId: number | null, t: number) =>
  stmt(`UPDATE job_helpers SET left_at = ?, left_reason = 'owner' WHERE job_id = ? AND user_id = ? AND left_at IS NULL`, t, jobId, userId ?? -1);

async function checkOwner(ownerId: number | null) {
  if (ownerId === null) return;
  const u = await one<{ id: number }>(`SELECT id FROM users WHERE id = ? AND status = 'active' AND role <> 'maintainer'`, ownerId);
  if (!u) throw new BadJob('owner');
}

/** Tell the new хариуцагч, unless they gave the job to themselves. */
async function notifyOwner(a: SessionUser, ownerId: number | null, jobId: number, title: string) {
  if (ownerId === null || ownerId === a.id) return;
  const o = await one<{ email: string }>(`SELECT email FROM users WHERE id = ?`, ownerId);
  if (!o) return;
  await sendMail(jobAssignedMail(o.email, a.name, title, `${staffOrigin()}/ajil/${jobId}`));
}

export async function createJob(a: SessionUser, input: JobInput, ip: string | null): Promise<number> {
  if (!P.canCreateJobIn(a, input.dept)) throw new Denied();
  const dept = await deptBySlug(input.dept);
  if (!dept) throw new BadJob('dept');
  await checkOwner(input.ownerId);
  const t = now();
  const row = await stmt(
    `INSERT INTO jobs (title, notes, department_id, owner_id, visibility, due_at, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
    input.title,
    input.notes || null,
    dept.id,
    input.ownerId,
    input.visibility,
    input.dueAt,
    a.id,
    t,
    t,
  ).first<{ id: number }>();
  await db().batch([
    auditStmt(a.id, 'job.create', 'job', row!.id, { title: input.title, dept: input.dept }, ip),
    ...(input.ownerId !== null
      ? [stmt(`INSERT INTO job_updates (job_id, user_id, kind, target_id, created_at) VALUES (?,?,'assign',?,?)`, row!.id, a.id, input.ownerId, t)]
      : []),
  ]);
  await notifyOwner(a, input.ownerId, row!.id, input.title);
  return row!.id;
}

export async function editJob(a: SessionUser, j: JobRow, input: JobInput, ip: string | null) {
  if (!P.canEditJob(a, asJobLike(j))) throw new Denied();
  // Moving a job to another department needs the right to create jobs there.
  if (input.dept !== j.dept_slug && !P.canCreateJobIn(a, input.dept)) throw new Denied();
  const dept = await deptBySlug(input.dept);
  if (!dept) throw new BadJob('dept');
  await checkOwner(input.ownerId);
  await db().batch([
    stmt(
      `UPDATE jobs SET title = ?, notes = ?, department_id = ?, owner_id = ?, visibility = ?, due_at = ?, updated_at = ? WHERE id = ?`,
      input.title,
      input.notes || null,
      dept.id,
      input.ownerId,
      input.visibility,
      input.dueAt,
      now(),
      j.id,
    ),
    auditStmt(a.id, 'job.edit', 'job', j.id, input.ownerId !== j.owner_id ? { owner: { from: j.owner_id, to: input.ownerId } } : null, ip),
    ...(input.ownerId !== j.owner_id
      ? [
          stmt(`INSERT INTO job_updates (job_id, user_id, kind, target_id, created_at) VALUES (?,?,'assign',?,?)`, j.id, a.id, input.ownerId, now()),
          endHelping(j.id, input.ownerId, now()),
        ]
      : []),
  ]);
  if (input.ownerId !== j.owner_id) await notifyOwner(a, input.ownerId, j.id, input.title);
}

/**
 * A stage change, a progress note, or both. Stages: the хариуцагч, the дарга, the President. Notes: helpers too.
 * Cancelling is for whoever may edit the job.
 */
export async function updateJob(a: SessionUser, j: JobRow, status: JobStatus | null, note: string, ip: string | null) {
  const like = asJobLike(j);
  if (status !== null && status !== j.status ? !P.canUpdateJob(a, like) : !P.canNoteJob(a, like)) throw new Denied();
  if (status === 'cancelled' && !P.canEditJob(a, like)) throw new Denied();
  const change = status !== null && status !== j.status ? status : null;
  if (!change && !note) return;
  const t = now();
  await db().batch([
    stmt(
      `UPDATE jobs SET status = COALESCE(?, status), updated_at = ?, done_at = CASE WHEN ? = 'done' THEN ? WHEN ? IS NOT NULL THEN NULL ELSE done_at END WHERE id = ?`,
      change,
      t,
      change,
      t,
      change,
      j.id,
    ),
    stmt(`INSERT INTO job_updates (job_id, user_id, kind, status, note, created_at) VALUES (?,?,?,?,?,?)`, j.id, a.id, change ? 'status' : 'note', change, note || null, t),
    auditStmt(a.id, change ? `job.${change}` : 'job.note', 'job', j.id, null, ip),
  ]);
}

/** «Би хийнэ»: take a job nobody is on yet. Refused if someone got there first. */
export async function takeJob(a: SessionUser, j: JobRow, ip: string | null) {
  if (!P.canTakeJob(a, asJobLike(j)) || (j.status !== 'todo' && j.status !== 'doing')) throw new Denied();
  const t = now();
  const res = await stmt(`UPDATE jobs SET owner_id = ?, updated_at = ? WHERE id = ? AND owner_id IS NULL`, a.id, t, j.id).run();
  if (!res.meta.changes) throw new Denied();
  await db().batch([
    stmt(`INSERT INTO job_updates (job_id, user_id, kind, target_id, created_at) VALUES (?,?,'take',?,?)`, j.id, a.id, a.id, t),
    endHelping(j.id, a.id, t),
    auditStmt(a.id, 'job.take', 'job', j.id, null, ip),
  ]);
}

/**
 * «Нэгдэх»: join a job someone is already on, to help. No appointment needed; the хариуцагч stays accountable.
 * Joining twice does nothing (the unique index on open rows).
 */
export async function joinJob(a: SessionUser, j: JobRow, ip: string | null) {
  if (!P.canJoinJob(a, asJobLike(j)) || (j.status !== 'todo' && j.status !== 'doing')) throw new Denied();
  const t = now();
  const res = await stmt(`INSERT OR IGNORE INTO job_helpers (job_id, user_id, joined_at) VALUES (?,?,?)`, j.id, a.id, t).run();
  if (res.meta.changes) await auditStmt(a.id, 'job.join', 'job', j.id, null, ip).run();
}

/** A helper steps back. Nothing is erased: the history keeps that they joined and when they left. */
export async function leaveJob(a: SessionUser, j: JobRow, ip: string | null) {
  const t = now();
  const res = await stmt(`UPDATE job_helpers SET left_at = ?, left_reason = 'left' WHERE job_id = ? AND user_id = ? AND left_at IS NULL`, t, j.id, a.id).run();
  if (!res.meta.changes) throw new Denied();
  await auditStmt(a.id, 'job.leave', 'job', j.id, null, ip).run();
}

/**
 * Someone leaves the workspace (removed, or their term lapsed): their open jobs need someone again, and they
 * stop helping. For jobs this is recorded as the manager taking them off (neither credit nor blame in
 * «Оролцоо»), not as them stepping down. Their tasks on upcoming events are marked dropped — the only way an
 * event task can let go of someone — so the task shows «Хүн хэрэгтэй» again.
 */
export function releaseLeaverStmts(userIds: number[], actorId: number | null): D1PreparedStatement[] {
  if (!userIds.length) return [];
  const t = now();
  const ids = userIds.map(Number).filter(Number.isInteger);
  const list = ids.join(',');
  return [
    // History first, while owner_id still says whose the job was.
    stmt(
      `INSERT INTO job_updates (job_id, user_id, kind, target_id, created_at)
       SELECT id, COALESCE(?1, owner_id), 'assign', NULL, ?2 FROM jobs WHERE owner_id IN (${list}) AND status IN ('todo','doing')`,
      actorId,
      t,
    ),
    stmt(`UPDATE jobs SET owner_id = NULL, updated_at = ? WHERE owner_id IN (${list}) AND status IN ('todo','doing')`, t),
    stmt(`UPDATE job_helpers SET left_at = ?, left_reason = 'removed' WHERE user_id IN (${list}) AND left_at IS NULL`, t),
    stmt(
      `UPDATE task_assignments SET status = 'dropped', finished_at = ?1
        WHERE user_id IN (${list}) AND status = 'active'
          AND task_id IN (SELECT k.id FROM event_tasks k JOIN events e ON e.id = k.event_id WHERE k.status = 'open' AND e.ends_at >= ?1)`,
      t,
    ),
  ];
}

/** The хариуцагч steps down; the job is open for someone else to take or be appointed. */
export async function releaseJob(a: SessionUser, j: JobRow, ip: string | null) {
  if (j.owner_id !== a.id || j.status === 'done' || j.status === 'cancelled') throw new Denied();
  const t = now();
  await db().batch([
    stmt(`UPDATE jobs SET owner_id = NULL, updated_at = ? WHERE id = ? AND owner_id = ?`, t, j.id, a.id),
    stmt(`INSERT INTO job_updates (job_id, user_id, kind, created_at) VALUES (?,?,'release',?)`, j.id, a.id, t),
    auditStmt(a.id, 'job.release', 'job', j.id, null, ip),
  ]);
}

// ------------------------------------------------------------------ participation

/** One person's part in one job, for the «Оролцоо» record. */
export interface JobShare {
  job_id: number;
  title: string;
  dept_name: string;
  created_at: number;
  volunteered: boolean;
  status: 'active' | 'done' | 'dropped';
  /** Joined to help («Нэгдэх») rather than being the хариуцагч. */
  helper: boolean;
}

/**
 * Who worked on which jobs in an academic year (a job counts in the year it was created).
 * Read from the job's own history: «Би хийнэ» = volunteered, a дарга's appointment = assigned. The
 * person on the job now has it active or done; someone who stepped down («Татгалзах») has it dropped.
 * Someone the дарга moved off the job, and anyone on a cancelled job, is not counted either way.
 */
export async function jobParticipation(year: string): Promise<Map<number, JobShare[]>> {
  const jobs = (
    await many<{ id: number; title: string; status: JobStatus; owner_id: number | null; created_at: number; dept_name: string }>(
      `SELECT j.id, j.title, j.status, j.owner_id, j.created_at, d.name_mn AS dept_name FROM jobs j JOIN departments d ON d.id = j.department_id`,
    )
  ).filter((j) => academicYear(j.created_at) === year && j.status !== 'cancelled');
  const out = new Map<number, JobShare[]>();
  if (!jobs.length) return out;
  const updates = await many<{ job_id: number; user_id: number; kind: JobUpdateRow['kind']; target_id: number | null }>(
    `SELECT job_id, user_id, kind, target_id FROM job_updates WHERE kind IN ('take','assign','release') ORDER BY id`,
  );
  const byJob = new Map<number, typeof updates>();
  for (const u of updates) byJob.set(u.job_id, [...(byJob.get(u.job_id) ?? []), u]);
  // Helpers still on the job when it finished (or now, while it runs). Someone who joined and stepped back
  // isn't counted either way: helping is extra, and the хариуцагч is the one accountable.
  const helping = await many<{ job_id: number; user_id: number }>(`SELECT job_id, user_id FROM job_helpers WHERE left_at IS NULL`);
  const helpersByJob = new Map<number, number[]>();
  for (const h of helping) helpersByJob.set(h.job_id, [...(helpersByJob.get(h.job_id) ?? []), h.user_id]);

  for (const j of jobs) {
    // Walk the history: who held the job, how they got it, and whether they let it go.
    const people = new Map<number, { volunteered: boolean; released: boolean; helper?: boolean }>();
    for (const u of byJob.get(j.id) ?? []) {
      if (u.kind === 'take') people.set(u.user_id, { volunteered: true, released: false });
      else if (u.kind === 'assign' && u.target_id !== null) people.set(u.target_id, { volunteered: false, released: false });
      else if (u.kind === 'release') {
        const p = people.get(u.user_id);
        if (p) p.released = true;
      }
    }
    // A job made before its history was kept: the person on it counts as appointed.
    if (j.owner_id !== null && !people.has(j.owner_id)) people.set(j.owner_id, { volunteered: false, released: false });

    for (const userId of helpersByJob.get(j.id) ?? []) {
      if (userId === j.owner_id) continue;
      people.set(userId, { volunteered: true, released: false, helper: true });
    }

    for (const [userId, p] of people) {
      let status: JobShare['status'] | null;
      if (p.helper || userId === j.owner_id) status = j.status === 'done' ? 'done' : 'active';
      else status = p.released ? 'dropped' : null; // moved off by the дарга: neither credit nor blame
      if (!status) continue;
      const share: JobShare = { job_id: j.id, title: j.title, dept_name: j.dept_name, created_at: j.created_at, volunteered: p.volunteered, status, helper: !!p.helper };
      out.set(userId, [...(out.get(userId) ?? []), share]);
    }
  }
  return out;
}

/** Academic years that have any job, for the «Оролцоо» year tabs. */
export async function yearsWithJobs(): Promise<string[]> {
  const rows = await many<{ created_at: number }>(`SELECT created_at FROM jobs`);
  return [...new Set(rows.map((r) => academicYear(r.created_at)))];
}
