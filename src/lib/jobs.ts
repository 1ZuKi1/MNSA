/**
 * «Ажлууд» — the association's work that isn't part of an event. Staff only, never on the public site.
 * A job belongs to one department, has one accountable person (хариуцагч) and moves through three stages.
 * Who may do what is decided in permissions.ts (canReadJob / canEditJob / canUpdateJob).
 */
import { auditStmt, db, deptBySlug, many, one, stmt } from './db';
import { sendMail } from './mailer';
import * as P from './permissions';
import { Denied } from './records';
import { staffOrigin } from './site';
import { now } from './time';
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
}

const SELECT = `SELECT j.id, j.title, j.notes, d.slug AS dept_slug, d.name_mn AS dept_name, j.owner_id, o.name_mn AS owner_name,
                       j.status, j.visibility, j.due_at, j.created_by, c.name_mn AS creator_name, j.created_at, j.updated_at, j.done_at,
                       (SELECT u.note FROM job_updates u WHERE u.job_id = j.id AND u.note IS NOT NULL ORDER BY u.id DESC LIMIT 1) AS last_note
                  FROM jobs j JOIN departments d ON d.id = j.department_id
                  LEFT JOIN users o ON o.id = j.owner_id JOIN users c ON c.id = j.created_by`;

export const asJobLike = (j: Pick<JobRow, 'dept_slug' | 'owner_id' | 'created_by' | 'visibility'>): P.JobLike => ({
  dept: j.dept_slug,
  ownerId: j.owner_id,
  createdBy: j.created_by,
  visibility: j.visibility,
});

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
        AND (?4 = 0 OR j.owner_id = ?5)
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

/** Open jobs on this person: the dashboard and the menu count. */
export const myOpenJobs = (a: SessionUser) =>
  many<JobRow>(`${SELECT} WHERE j.owner_id = ? AND j.status IN ('todo','doing') ORDER BY j.due_at IS NULL, j.due_at, j.id`, a.id);

export interface JobUpdateRow {
  id: number;
  user_name: string;
  kind: 'status' | 'note' | 'take' | 'release' | 'assign';
  status: JobStatus | null;
  target_name: string | null;
  note: string | null;
  created_at: number;
}
export const jobUpdates = (jobId: number) =>
  many<JobUpdateRow>(
    `SELECT u.id, us.name_mn AS user_name, u.kind, u.status, t.name_mn AS target_name, u.note, u.created_at
       FROM job_updates u JOIN users us ON us.id = u.user_id LEFT JOIN users t ON t.id = u.target_id
      WHERE u.job_id = ? ORDER BY u.id`,
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
  await sendMail({
    to: o.email,
    subject: `Танд ажил оноолоо: ${title}`,
    text: ['Сайн байна уу,', '', `${a.name} таныг «${title}» ажлын хариуцагчаар томиллоо.`, '', `${staffOrigin()}/ajil/${jobId}`, '', '— МОХ-ны ажлын орчин'].join('\n'),
  });
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
      ? [stmt(`INSERT INTO job_updates (job_id, user_id, kind, target_id, created_at) VALUES (?,?,'assign',?,?)`, j.id, a.id, input.ownerId, now())]
      : []),
  ]);
  if (input.ownerId !== j.owner_id) await notifyOwner(a, input.ownerId, j.id, input.title);
}

/** A stage change, a progress note, or both. Cancelling is for whoever may edit the job. */
export async function updateJob(a: SessionUser, j: JobRow, status: JobStatus | null, note: string, ip: string | null) {
  const like = asJobLike(j);
  if (!P.canUpdateJob(a, like)) throw new Denied();
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
    auditStmt(a.id, 'job.take', 'job', j.id, null, ip),
  ]);
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
