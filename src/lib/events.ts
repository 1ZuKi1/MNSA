/** Events: public listing + the staff work board + the permanent participation record. */
import { auditStmt, db, deptBySlug, many, mediaDb, one, stmt } from './db';
import * as P from './permissions';
import { academicYear, now } from './time';
import type { DeptSlug, Role, SessionUser } from './types';
import { Denied } from './records';

export interface EventRow {
  id: number;
  slug: string;
  title: string;
  summary: string | null;
  body: string | null;
  starts_at: number;
  ends_at: number;
  location: string | null;
  department_id: number | null;
  dept_slug: DeptSlug | null;
  dept_name: string | null;
  status: 'draft' | 'published' | 'cancelled';
  cover_media_id: string | null;
  source_record_id: number | null;
  academic_year: string;
  created_by: number;
  creator_name: string;
  published_by: number | null;
  publisher_name: string | null;
  published_at: number | null;
  updated_at: number;
}

const SELECT = `
  SELECT e.*, d.slug AS dept_slug, d.name_mn AS dept_name, c.name_mn AS creator_name, p.name_mn AS publisher_name
    FROM events e
    LEFT JOIN departments d ON d.id = e.department_id
    JOIN users c ON c.id = e.created_by
    LEFT JOIN users p ON p.id = e.published_by`;

export const getEvent = (id: number) => one<EventRow>(`${SELECT} WHERE e.id = ?`, id);

/** Public: published only. Upcoming = hasn't ended yet; it becomes "past" by itself when the date passes. */
export async function publicEvents() {
  const t = now();
  const [upcoming, past] = await Promise.all([
    many<EventRow>(`${SELECT} WHERE e.status = 'published' AND e.ends_at >= ? ORDER BY e.starts_at ASC LIMIT 50`, t),
    many<EventRow>(`${SELECT} WHERE e.status = 'published' AND e.ends_at < ? ORDER BY e.starts_at DESC LIMIT 60`, t),
  ]);
  return { upcoming, past };
}

export interface StaffEventRow extends EventRow {
  task_total: number;
  task_open: number;
  task_unassigned: number;
}

export async function staffEvents() {
  const t = now();
  const base = `
    SELECT e.*, d.slug AS dept_slug, d.name_mn AS dept_name, c.name_mn AS creator_name, p.name_mn AS publisher_name,
      (SELECT COUNT(*) FROM event_tasks k WHERE k.event_id = e.id AND k.status <> 'cancelled') AS task_total,
      (SELECT COUNT(*) FROM event_tasks k WHERE k.event_id = e.id AND k.status = 'open') AS task_open,
      (SELECT COUNT(*) FROM event_tasks k WHERE k.event_id = e.id AND k.status = 'open'
         AND NOT EXISTS (SELECT 1 FROM task_assignments x WHERE x.task_id = k.id AND x.status = 'active')) AS task_unassigned
    FROM events e
    LEFT JOIN departments d ON d.id = e.department_id
    JOIN users c ON c.id = e.created_by
    LEFT JOIN users p ON p.id = e.published_by`;
  const [upcoming, past] = await Promise.all([
    many<StaffEventRow>(`${base} WHERE e.status <> 'cancelled' AND e.ends_at >= ? ORDER BY e.starts_at ASC`, t),
    many<StaffEventRow>(`${base} WHERE e.ends_at < ? OR e.status = 'cancelled' ORDER BY e.starts_at DESC LIMIT 100`, t),
  ]);
  return { upcoming, past };
}

// ------------------------------------------------------------------ event writes

export interface EventInput {
  title: string;
  summary: string;
  body: string;
  startsAt: number;
  endsAt: number;
  location: string;
  dept: DeptSlug | null;
  coverMediaId?: string | null;
  sourceRecordId?: number | null;
}

/** Latin, lowercase, hyphenated — cosmetic only; lookups are by id. */
export function slugify(s: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'ye', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
    н: 'n', о: 'o', ө: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
    щ: 'sh', ъ: '', ы: 'y', ь: 'i', э: 'e', ю: 'yu', я: 'ya',
  };
  return (
    s
      .toLowerCase()
      .split('')
      .map((c) => map[c] ?? c)
      .join('')
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'event'
  );
}

export async function createEvent(a: SessionUser, e: EventInput, ip: string | null): Promise<number> {
  if (!P.canEditEvents(a)) throw new Denied();
  const dept = e.dept ? await deptBySlug(e.dept) : null;
  const t = now();
  const row = await stmt(
    `INSERT INTO events (slug, title, summary, body, starts_at, ends_at, location, department_id, cover_media_id, source_record_id,
                         academic_year, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    slugify(e.title),
    e.title,
    e.summary || null,
    e.body || null,
    e.startsAt,
    e.endsAt,
    e.location || null,
    dept?.id ?? null,
    e.coverMediaId ?? null,
    e.sourceRecordId ?? null,
    academicYear(e.startsAt),
    a.id,
    t,
    t,
  ).first<{ id: number }>();
  await auditStmt(a.id, 'event.create', 'event', row!.id, null, ip).run();
  return row!.id;
}

export async function updateEvent(a: SessionUser, ev: EventRow, e: EventInput, ip: string | null) {
  if (!P.canEditEvents(a)) throw new Denied();
  const dept = e.dept ? await deptBySlug(e.dept) : null;
  await db().batch([
    stmt(
      `UPDATE events SET slug = ?, title = ?, summary = ?, body = ?, starts_at = ?, ends_at = ?, location = ?, department_id = ?,
              cover_media_id = ?, academic_year = ?, updated_at = ? WHERE id = ?`,
      slugify(e.title),
      e.title,
      e.summary || null,
      e.body || null,
      e.startsAt,
      e.endsAt,
      e.location || null,
      dept?.id ?? null,
      e.coverMediaId ?? ev.cover_media_id,
      academicYear(e.startsAt),
      now(),
      ev.id,
    ),
    auditStmt(a.id, 'event.edit', 'event', ev.id, null, ip),
  ]);
}

export async function setEventStatus(a: SessionUser, ev: EventRow, status: EventRow['status'], ip: string | null) {
  if (!P.canEditEvents(a)) throw new Denied();
  const t = now();
  await db().batch([
    status === 'published'
      ? stmt(`UPDATE events SET status = 'published', published_by = ?, published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?`, a.id, t, t, ev.id)
      : stmt(`UPDATE events SET status = ?, updated_at = ? WHERE id = ?`, status, t, ev.id),
    auditStmt(a.id, `event.${status}`, 'event', ev.id, null, ip),
  ]);
}

// ------------------------------------------------------------------ tasks

export interface TaskRow {
  id: number;
  event_id: number;
  title: string;
  notes: string | null;
  due_at: number | null;
  department_id: number | null;
  dept_name: string | null;
  status: 'open' | 'done' | 'cancelled';
  sort_order: number;
}

export interface AssignmentRow {
  id: number;
  task_id: number;
  user_id: number;
  user_name: string;
  volunteered: number;
  status: 'active' | 'done' | 'dropped';
  assigned_at: number;
  finished_at: number | null;
}

export async function eventTasks(eventId: number) {
  const [tasks, assignments] = await Promise.all([
    many<TaskRow>(
      `SELECT k.*, d.name_mn AS dept_name FROM event_tasks k LEFT JOIN departments d ON d.id = k.department_id
        WHERE k.event_id = ? AND k.status <> 'cancelled' ORDER BY k.sort_order, k.id`,
      eventId,
    ),
    many<AssignmentRow>(
      `SELECT x.id, x.task_id, x.user_id, u.name_mn AS user_name, x.volunteered, x.status, x.assigned_at, x.finished_at
         FROM task_assignments x JOIN users u ON u.id = x.user_id
         JOIN event_tasks k ON k.id = x.task_id
        WHERE k.event_id = ? AND x.status <> 'dropped' ORDER BY x.id`,
      eventId,
    ),
  ]);
  return tasks.map((t) => ({ ...t, assignees: assignments.filter((x) => x.task_id === t.id) }));
}

export async function addTask(a: SessionUser, ev: EventRow, input: { title: string; dueAt: number | null; dept: DeptSlug | null; notes: string }, ip: string | null) {
  if (!P.canManageTasks(a, ev.dept_slug)) throw new Denied();
  const dept = input.dept ? await deptBySlug(input.dept) : null;
  const t = now();
  await db().batch([
    stmt(
      `INSERT INTO event_tasks (event_id, title, notes, due_at, department_id, sort_order, created_by, created_at)
       VALUES (?,?,?,?,?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM event_tasks WHERE event_id = ?), ?, ?)`,
      ev.id,
      input.title,
      input.notes || null,
      input.dueAt,
      dept?.id ?? null,
      ev.id,
      a.id,
      t,
    ),
    auditStmt(a.id, 'task.create', 'event', ev.id, { title: input.title }, ip),
  ]);
}

export async function cancelTask(a: SessionUser, ev: EventRow, taskId: number, ip: string | null) {
  if (!P.canManageTasks(a, ev.dept_slug)) throw new Denied();
  await db().batch([
    stmt(`UPDATE event_tasks SET status = 'cancelled' WHERE id = ? AND event_id = ?`, taskId, ev.id),
    auditStmt(a.id, 'task.cancel', 'task', taskId, null, ip),
  ]);
}

/** "Би хийнэ" (volunteer) or an assignment by someone with task rights. */
export async function assignTask(a: SessionUser, ev: EventRow, taskId: number, userId: number, ip: string | null) {
  const self = userId === a.id;
  if (self ? !P.canTakeTask(a) : !P.canManageTasks(a, ev.dept_slug)) throw new Denied();
  const task = await one<{ id: number; status: string }>(`SELECT id, status FROM event_tasks WHERE id = ? AND event_id = ?`, taskId, ev.id);
  if (!task || task.status !== 'open') throw new Denied();
  const target = await one<{ role: Role; status: string }>(`SELECT role, status FROM users WHERE id = ?`, userId);
  if (!target || target.status !== 'active' || target.role === 'maintainer') throw new Denied();
  const dup = await one(`SELECT 1 FROM task_assignments WHERE task_id = ? AND user_id = ? AND status = 'active'`, taskId, userId);
  if (dup) return;
  await db().batch([
    stmt(
      `INSERT INTO task_assignments (task_id, user_id, volunteered, assigned_by, assigned_at) VALUES (?,?,?,?,?)`,
      taskId,
      userId,
      self ? 1 : 0,
      a.id,
      now(),
    ),
    auditStmt(a.id, self ? 'task.take' : 'task.assign', 'task', taskId, { userId }, ip),
  ]);
}

async function assignmentFor(ev: EventRow, assignmentId: number) {
  return one<{ id: number; user_id: number; task_id: number; status: string }>(
    `SELECT x.id, x.user_id, x.task_id, x.status FROM task_assignments x JOIN event_tasks k ON k.id = x.task_id
      WHERE x.id = ? AND k.event_id = ?`,
    assignmentId,
    ev.id,
  );
}

/** Done: the assignment and its task close together. */
export async function finishAssignment(a: SessionUser, ev: EventRow, assignmentId: number, ip: string | null) {
  const x = await assignmentFor(ev, assignmentId);
  if (!x || x.status !== 'active' || !P.canFinishAssignment(a, x.user_id, ev.dept_slug)) throw new Denied();
  const t = now();
  await db().batch([
    stmt(`UPDATE task_assignments SET status = 'done', finished_at = ? WHERE task_id = ? AND status = 'active'`, t, x.task_id),
    stmt(`UPDATE event_tasks SET status = 'done' WHERE id = ?`, x.task_id),
    auditStmt(a.id, 'task.done', 'task', x.task_id, { assignmentId }, ip),
  ]);
}

/** Dropping is recorded, never erased — it's part of the yearly picture. */
export async function dropAssignment(a: SessionUser, ev: EventRow, assignmentId: number, ip: string | null) {
  const x = await assignmentFor(ev, assignmentId);
  if (!x || x.status !== 'active' || !P.canFinishAssignment(a, x.user_id, ev.dept_slug)) throw new Denied();
  await db().batch([
    stmt(`UPDATE task_assignments SET status = 'dropped', finished_at = ? WHERE id = ?`, now(), x.id),
    auditStmt(a.id, 'task.drop', 'task', x.task_id, { assignmentId, userId: x.user_id }, ip),
  ]);
}

/** Open tasks across all upcoming events that nobody has taken yet, plus my own active ones. */
export async function taskBoardFor(a: SessionUser) {
  const t = now();
  const [mine, open] = await Promise.all([
    many<{ assignment_id: number; task_title: string; due_at: number | null; event_id: number; event_title: string; starts_at: number }>(
      `SELECT x.id AS assignment_id, k.title AS task_title, k.due_at, e.id AS event_id, e.title AS event_title, e.starts_at
         FROM task_assignments x JOIN event_tasks k ON k.id = x.task_id JOIN events e ON e.id = k.event_id
        WHERE x.user_id = ? AND x.status = 'active' ORDER BY COALESCE(k.due_at, e.starts_at)`,
      a.id,
    ),
    many<{ task_id: number; task_title: string; due_at: number | null; event_id: number; event_title: string; starts_at: number }>(
      `SELECT k.id AS task_id, k.title AS task_title, k.due_at, e.id AS event_id, e.title AS event_title, e.starts_at
         FROM event_tasks k JOIN events e ON e.id = k.event_id
        WHERE k.status = 'open' AND e.status <> 'cancelled' AND e.ends_at >= ?
          AND NOT EXISTS (SELECT 1 FROM task_assignments x WHERE x.task_id = k.id AND x.status = 'active')
        ORDER BY COALESCE(k.due_at, e.starts_at) LIMIT 20`,
      t,
    ),
  ]);
  return { mine, open };
}

// ------------------------------------------------------------------ participation

export interface ParticipationRow {
  user_id: number;
  name: string;
  role: Role;
  dept_slug: DeptSlug | null;
  dept_name: string | null;
  status: string;
  events: number;
  volunteered: number;
  assigned: number;
  done: number;
  dropped: number;
  active: number;
}

/**
 * Per person, per academic year. People with no jobs appear with zeros at the bottom —
 * that is the "who isn't taking jobs" answer, without anyone going looking.
 */
export async function participation(year: string, onlyUserId?: number): Promise<ParticipationRow[]> {
  const filter = onlyUserId ? `AND u.id = ${Number(onlyUserId)}` : '';
  return many<ParticipationRow>(
    `WITH y AS (
       SELECT x.user_id, e.id AS event_id, x.volunteered, x.status
         FROM task_assignments x
         JOIN event_tasks k ON k.id = x.task_id
         JOIN events e ON e.id = k.event_id
        WHERE e.academic_year = ?1
     )
     SELECT u.id AS user_id, u.name_mn AS name, u.role, d.slug AS dept_slug, d.name_mn AS dept_name, u.status,
            COUNT(DISTINCT CASE WHEN y.status <> 'dropped' THEN y.event_id END) AS events,
            COALESCE(SUM(CASE WHEN y.volunteered = 1 THEN 1 ELSE 0 END), 0) AS volunteered,
            COALESCE(SUM(CASE WHEN y.volunteered = 0 THEN 1 ELSE 0 END), 0) AS assigned,
            COALESCE(SUM(CASE WHEN y.status = 'done' THEN 1 ELSE 0 END), 0) AS done,
            COALESCE(SUM(CASE WHEN y.status = 'dropped' THEN 1 ELSE 0 END), 0) AS dropped,
            COALESCE(SUM(CASE WHEN y.status = 'active' THEN 1 ELSE 0 END), 0) AS active
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN y ON y.user_id = u.id
      WHERE u.role <> 'maintainer' ${filter}
      GROUP BY u.id
     HAVING u.status = 'active' OR COUNT(y.user_id) > 0
      ORDER BY done DESC, volunteered DESC, events DESC, u.name_mn`,
    year,
  );
}

export async function participationDetail(userId: number, year: string) {
  return many<{ event_id: number; event_title: string; starts_at: number; task_title: string; volunteered: number; status: string; assigned_at: number }>(
    `SELECT e.id AS event_id, e.title AS event_title, e.starts_at, k.title AS task_title, x.volunteered, x.status, x.assigned_at
       FROM task_assignments x JOIN event_tasks k ON k.id = x.task_id JOIN events e ON e.id = k.event_id
      WHERE x.user_id = ? AND e.academic_year = ? ORDER BY e.starts_at DESC, x.id`,
    userId,
    year,
  );
}

export async function yearsWithEvents(): Promise<string[]> {
  const rows = await many<{ academic_year: string }>(`SELECT DISTINCT academic_year FROM events ORDER BY academic_year DESC`);
  const cur = academicYear();
  return [...new Set([cur, ...rows.map((r) => r.academic_year)])].sort().reverse();
}

// ------------------------------------------------------------------ photos

export const eventPhotos = (eventId: number) =>
  many<{ id: number; media_id: string; caption: string | null; sort_order: number }>(
    `SELECT id, media_id, caption, sort_order FROM event_photos WHERE event_id = ? ORDER BY sort_order, id`,
    eventId,
  );

export async function addPhoto(a: SessionUser, ev: EventRow, mediaId: string, caption: string, ip: string | null) {
  if (!P.canEditEvents(a)) throw new Denied();
  const t = now();
  await db().batch([
    stmt(
      `INSERT INTO event_photos (event_id, media_id, caption, sort_order, uploaded_by, created_at)
       VALUES (?,?,?, (SELECT COALESCE(MAX(sort_order),0)+1 FROM event_photos WHERE event_id = ?), ?, ?)`,
      ev.id,
      mediaId,
      caption || null,
      ev.id,
      a.id,
      t,
    ),
    // First photo becomes the cover automatically.
    stmt(`UPDATE events SET cover_media_id = COALESCE(cover_media_id, ?), updated_at = ? WHERE id = ?`, mediaId, t, ev.id),
    auditStmt(a.id, 'event.photo', 'event', ev.id, { mediaId }, ip),
  ]);
}

export async function removePhoto(a: SessionUser, ev: EventRow, photoId: number, ip: string | null) {
  if (!P.canEditEvents(a)) throw new Denied();
  const p = await one<{ media_id: string }>(`SELECT media_id FROM event_photos WHERE id = ? AND event_id = ?`, photoId, ev.id);
  if (!p) return;
  await db().batch([
    stmt(`DELETE FROM event_photos WHERE id = ?`, photoId),
    stmt(
      `UPDATE events SET cover_media_id = (SELECT media_id FROM event_photos WHERE event_id = ?1 AND id <> ?2 ORDER BY sort_order, id LIMIT 1)
        WHERE id = ?1 AND cover_media_id = ?3`,
      ev.id,
      photoId,
      p.media_id,
    ),
    auditStmt(a.id, 'event.photo.remove', 'event', ev.id, { photoId }, ip),
  ]);
  // Free the bytes too, unless another event reuses the same photo.
  const stillUsed = await one(`SELECT 1 FROM event_photos WHERE media_id = ?`, p.media_id);
  if (!stillUsed) await mediaDb().prepare(`DELETE FROM media WHERE id = ?`).bind(p.media_id).run();
}

export async function setCover(a: SessionUser, ev: EventRow, mediaId: string, ip: string | null) {
  if (!P.canEditEvents(a)) throw new Denied();
  await db().batch([
    stmt(`UPDATE events SET cover_media_id = ?, updated_at = ? WHERE id = ? AND EXISTS (SELECT 1 FROM event_photos WHERE event_id = ?3 AND media_id = ?1)`, mediaId, now(), ev.id),
    auditStmt(a.id, 'event.cover', 'event', ev.id, { mediaId }, ip),
  ]);
}
