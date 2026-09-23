/** Database operations for records. Every write checks permissions.ts first. */
import { db, deptById, deptBySlug, many, one, stmt, auditStmt } from './db';
import { awaitingDecisionMail, sendMail } from './mailer';
import * as P from './permissions';
import { getRecordType, type RecordType } from './record-types';
import { academicYear, now } from './time';
import type { DeptSlug, RecordStatus, Role, SessionUser, Step, Visibility } from './types';
import { advance, numberPrefix } from './workflow';
import { staffOrigin } from './site';

export interface RecordRow {
  id: number;
  type: string;
  department_id: number;
  dept_slug: DeptSlug;
  dept_name: string;
  dept_code: string;
  author_id: number;
  author_name: string;
  academic_year: string;
  number: string | null;
  title: string;
  fields_json: string;
  status: RecordStatus;
  step: number;
  awaiting: Step | null;
  visibility: Visibility;
  version: number;
  submitted_at: number | null;
  decided_at: number | null;
  created_at: number;
  updated_at: number;
}

const SELECT = `
  SELECT r.*, d.slug AS dept_slug, d.name_mn AS dept_name, d.code AS dept_code, u.name_mn AS author_name
    FROM records r
    JOIN departments d ON d.id = r.department_id
    JOIN users u ON u.id = r.author_id`;

export const asRecordLike = (r: RecordRow): P.RecordLike => ({
  authorId: r.author_id,
  dept: r.dept_slug,
  status: r.status,
  visibility: r.visibility,
  step: r.awaiting,
});

export const fieldsOf = (r: RecordRow): Record<string, string> => {
  try {
    return JSON.parse(r.fields_json);
  } catch {
    return {};
  }
};

export async function getRecord(id: number): Promise<RecordRow | null> {
  return one<RecordRow>(`${SELECT} WHERE r.id = ?`, id);
}

/**
 * The read rule, expressed in SQL so we never load rows we'd then hide.
 * Mirrors P.canReadRecord; results are re-checked in JS as a second wall.
 */
function readableWhere(a: SessionUser): { sql: string; params: unknown[] } {
  if (a.role === 'president') return { sql: '1', params: [] };
  const isBoard = a.role === 'board' ? 1 : 0;
  const isHead = a.role === 'head' ? 1 : 0;
  const isLegalHead = P.isLegalHead(a) ? 1 : 0;
  return {
    sql: `(r.author_id = ?1
       OR (r.status = 'draft' AND ?2 = 1 AND r.department_id = ?3)
       OR (r.status <> 'draft' AND (
             r.visibility = 'staff'
          OR r.department_id = ?3
          OR ?4 = 1
          OR (?5 = 1 AND r.awaiting = 'legal'))))`,
    params: [a.id, isHead, a.deptId ?? -1, isBoard, isLegalHead],
  };
}

export interface RecordFilter {
  dept?: string;
  type?: string;
  status?: string;
  year?: string;
  q?: string;
  /** Only records written by this user. */
  author?: number;
  limit?: number;
}

export async function listRecords(a: SessionUser, f: RecordFilter = {}): Promise<RecordRow[]> {
  const w = readableWhere(a);
  const where = [w.sql];
  const params = [...w.params];
  const add = (clause: string, v: unknown) => {
    params.push(v);
    where.push(clause.replace('?', `?${params.length}`));
  };
  if (f.dept) add('d.slug = ?', f.dept);
  if (f.type) add('r.type = ?', f.type);
  if (f.status) add('r.status = ?', f.status);
  if (f.year) add('r.academic_year = ?', f.year);
  if (f.author) add('r.author_id = ?', f.author);
  if (f.q) {
    // D1 caps LIKE patterns at 50 bytes; Cyrillic is 2 bytes/char, so keep the query short.
    params.push(`%${f.q.slice(0, 20).replace(/[\\%_]/g, '\\$&')}%`);
    const n = params.length;
    where.push(`(r.title LIKE ?${n} ESCAPE '\\' OR r.number LIKE ?${n} ESCAPE '\\')`);
  }
  const rows = await many<RecordRow>(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY r.updated_at DESC LIMIT ${Math.min(f.limit ?? 100, 500)}`,
    ...params,
  );
  return rows.filter((r) => P.canReadRecord(a, asRecordLike(r)));
}

/** What is waiting for *this* person to decide. */
/** The SQL condition for "in review and waiting on this person" — shared by the list and the nav count. */
export function awaitingWhere(a: SessionUser): { sql: string; params: unknown[] } | null {
  const conds: string[] = [];
  const params: unknown[] = [];
  if (a.role === 'head') {
    params.push(a.deptId);
    conds.push(`(r.awaiting = 'head' AND r.department_id = ?${params.length})`);
  }
  if (P.isLegalHead(a)) conds.push(`r.awaiting = 'legal'`);
  if (a.role === 'president') conds.push(`r.awaiting = 'president'`);
  if (!conds.length) return null;
  return { sql: `r.status = 'in_review' AND (${conds.join(' OR ')})`, params };
}

export async function awaitingMe(a: SessionUser): Promise<RecordRow[]> {
  const w = awaitingWhere(a);
  if (!w) return [];
  return many<RecordRow>(`${SELECT} WHERE ${w.sql} ORDER BY r.submitted_at`, ...w.params);
}

export async function myDrafts(a: SessionUser): Promise<RecordRow[]> {
  return many<RecordRow>(
    `${SELECT} WHERE r.author_id = ? AND r.status IN ('draft','rejected') ORDER BY r.updated_at DESC`,
    a.id,
  );
}

export interface ActionRow {
  id: number;
  action: string;
  step: Step | null;
  comment: string | null;
  created_at: number;
  actor_name: string;
  actor_role: Role;
}

export async function recordHistory(id: number): Promise<ActionRow[]> {
  return many<ActionRow>(
    `SELECT a.id, a.action, a.step, a.comment, a.created_at, u.name_mn AS actor_name, u.role AS actor_role
       FROM record_actions a JOIN users u ON u.id = a.actor_id
      WHERE a.record_id = ? ORDER BY a.id`,
    id,
  );
}

// ------------------------------------------------------------------ writes

export class Denied extends Error {}
export class Conflict extends Error {}

export async function createRecord(
  a: SessionUser,
  input: { type: RecordType; dept: DeptSlug; title: string; values: Record<string, string>; visibility: Visibility },
  ip: string | null,
): Promise<number> {
  if (!P.canCreateRecordIn(a, input.dept)) throw new Denied();
  const dept = await deptBySlug(input.dept);
  if (!dept) throw new Denied();
  const t = now();
  const fields = JSON.stringify(input.values);
  const res = await stmt(
    `INSERT INTO records (type, department_id, author_id, academic_year, title, fields_json, visibility, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?) RETURNING id`,
    input.type.slug,
    dept.id,
    a.id,
    academicYear(t),
    input.title,
    fields,
    input.visibility,
    t,
    t,
  ).first<{ id: number }>();
  const id = res!.id;
  await db().batch([
    stmt(`INSERT INTO record_versions (record_id, version, title, fields_json, author_id, created_at) VALUES (?,1,?,?,?,?)`, id, input.title, fields, a.id, t),
    stmt(`INSERT INTO record_actions (record_id, actor_id, action, created_at) VALUES (?,?,'create',?)`, id, a.id, t),
    auditStmt(a.id, 'record.create', 'record', id, { type: input.type.slug }, ip),
  ]);
  return id;
}

export async function updateRecord(
  a: SessionUser,
  r: RecordRow,
  input: { title: string; values: Record<string, string>; visibility: Visibility },
  ip: string | null,
) {
  if (!P.canEditRecord(a, asRecordLike(r))) throw new Denied();
  const t = now();
  const fields = JSON.stringify(input.values);
  const v = r.version + 1;
  const upd = await stmt(
    `UPDATE records SET title = ?, fields_json = ?, visibility = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?`,
    input.title,
    fields,
    input.visibility,
    v,
    t,
    r.id,
    r.version,
  ).run();
  if (!upd.meta.changes) throw new Conflict();
  await db().batch([
    stmt(`INSERT INTO record_versions (record_id, version, title, fields_json, author_id, created_at) VALUES (?,?,?,?,?,?)`, r.id, v, input.title, fields, a.id, t),
    stmt(`INSERT INTO record_actions (record_id, actor_id, action, created_at) VALUES (?,?,'edit',?)`, r.id, a.id, t),
    auditStmt(a.id, 'record.edit', 'record', r.id, { version: v }, ip),
  ]);
}

async function authorOf(r: RecordRow) {
  const u = await one<{ id: number; role: Role; dept: DeptSlug | null; is_deputy: number }>(
    `SELECT u.id, u.role, d.slug AS dept, u.is_deputy FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
    r.author_id,
  );
  return { id: u!.id, role: u!.role, dept: u!.dept, isDeputy: u!.is_deputy === 1 };
}

/** Moves the record to the next step that needs someone, recording automatic passes. */
async function applyAdvance(r: RecordRow, from: number, extra: D1PreparedStatement[], expectStatus: RecordStatus, expectStep: number) {
  const type = getRecordType(r.type)!;
  const next = advance(type.chain, from, await authorOf(r), r.dept_slug);
  const t = now();
  const status: RecordStatus = next.done ? 'approved' : 'in_review';
  const awaiting = next.done ? null : type.chain[next.index];

  const upd = await stmt(
    `UPDATE records SET status = ?1, step = ?2, awaiting = ?3, updated_at = ?4,
            submitted_at = CASE WHEN ?5 = 'draft' OR ?5 = 'rejected' THEN ?4 ELSE submitted_at END,
            decided_at = CASE WHEN ?1 = 'approved' THEN ?4 ELSE decided_at END
      WHERE id = ?6 AND status = ?5 AND step = ?7`,
    status,
    next.index,
    awaiting,
    t,
    expectStatus,
    r.id,
    expectStep,
  ).run();
  if (!upd.meta.changes) throw new Conflict();

  await db().batch([
    ...extra,
    ...next.auto.map((s) => stmt(`INSERT INTO record_actions (record_id, actor_id, action, step, created_at) VALUES (?,?,'auto',?,?)`, r.id, r.author_id, s, t)),
  ]);
  if (awaiting) await notifyStepOwners(r, awaiting);
  return { status, awaiting };
}

export async function submitRecord(a: SessionUser, r: RecordRow, ip: string | null) {
  if (!P.canSubmitRecord(a, asRecordLike(r))) throw new Denied();
  const t = now();
  if (!r.number) {
    // Counter bump and number assignment in one transaction: no gaps, no duplicates.
    const prefix = numberPrefix(r.dept_code, r.academic_year, getRecordType(r.type)!.code);
    await db().batch([
      stmt(`INSERT INTO counters (key, value) VALUES (?, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`, prefix),
      stmt(
        `UPDATE records SET number = ?1 || printf('%03d', (SELECT value FROM counters WHERE key = ?1)) WHERE id = ?2 AND number IS NULL`,
        prefix,
        r.id,
      ),
    ]);
  }
  return applyAdvance(
    r,
    0,
    [
      stmt(`INSERT INTO record_actions (record_id, actor_id, action, created_at) VALUES (?,?,'submit',?)`, r.id, a.id, t),
      auditStmt(a.id, 'record.submit', 'record', r.id, null, ip),
    ],
    r.status,
    r.step,
  );
}

export async function decideRecord(a: SessionUser, r: RecordRow, decision: 'approve' | 'reject', comment: string, ip: string | null) {
  if (!P.canDecideStep(a, asRecordLike(r))) throw new Denied();
  const t = now();
  const step = r.awaiting!;
  if (decision === 'reject') {
    if (!comment.trim()) throw new Error('comment-required');
    const upd = await stmt(
      `UPDATE records SET status = 'rejected', awaiting = NULL, step = 0, updated_at = ? WHERE id = ? AND status = 'in_review' AND step = ?`,
      t,
      r.id,
      r.step,
    ).run();
    if (!upd.meta.changes) throw new Conflict();
    await db().batch([
      stmt(`INSERT INTO record_actions (record_id, actor_id, action, step, comment, created_at) VALUES (?,?,'reject',?,?,?)`, r.id, a.id, step, comment.trim(), t),
      auditStmt(a.id, 'record.reject', 'record', r.id, { step }, ip),
    ]);
    return;
  }
  await applyAdvance(
    r,
    r.step + 1,
    [
      stmt(`INSERT INTO record_actions (record_id, actor_id, action, step, comment, created_at) VALUES (?,?,'approve',?,?,?)`, r.id, a.id, step, comment.trim() || null, t),
      auditStmt(a.id, 'record.approve', 'record', r.id, { step, standIn: !P.isStepOwner(a, step, r.dept_slug) }, ip),
    ],
    'in_review',
    r.step,
  );
}

export async function withdrawRecord(a: SessionUser, r: RecordRow, ip: string | null) {
  if (!P.canWithdrawRecord(a, asRecordLike(r))) throw new Denied();
  const t = now();
  const upd = await stmt(`UPDATE records SET status = 'draft', awaiting = NULL, step = 0, updated_at = ? WHERE id = ? AND status = 'in_review'`, t, r.id).run();
  if (!upd.meta.changes) throw new Conflict();
  await db().batch([
    stmt(`INSERT INTO record_actions (record_id, actor_id, action, created_at) VALUES (?,?,'withdraw',?)`, r.id, a.id, t),
    auditStmt(a.id, 'record.withdraw', 'record', r.id, null, ip),
  ]);
}

export async function voidRecord(a: SessionUser, r: RecordRow, comment: string, ip: string | null) {
  if (!P.canVoidRecord(a, asRecordLike(r))) throw new Denied();
  if (!comment.trim()) throw new Error('comment-required');
  const t = now();
  const upd = await stmt(`UPDATE records SET status = 'void', updated_at = ? WHERE id = ? AND status = 'approved'`, t, r.id).run();
  if (!upd.meta.changes) throw new Conflict();
  await db().batch([
    stmt(`INSERT INTO record_actions (record_id, actor_id, action, comment, created_at) VALUES (?,?,'void',?,?)`, r.id, a.id, comment.trim(), t),
    auditStmt(a.id, 'record.void', 'record', r.id, null, ip),
  ]);
}

/** One email to whoever owns the next step — never a broadcast (Resend free: 100/day). */
async function notifyStepOwners(r: RecordRow, step: Step) {
  let rows: { email: string }[] = [];
  if (step === 'head') {
    rows = await many(`SELECT email FROM users WHERE role = 'head' AND department_id = ? AND status = 'active'`, r.department_id);
  } else if (step === 'legal') {
    const legal = await deptBySlug(P.LEGAL);
    rows = await many(`SELECT email FROM users WHERE role = 'head' AND department_id = ? AND status = 'active'`, legal?.id ?? -1);
  } else {
    rows = await many(`SELECT email FROM users WHERE role = 'president' AND status = 'active'`);
  }
  const fresh = await getRecord(r.id);
  for (const { email } of rows) {
    await sendMail(awaitingDecisionMail(email, r.title, fresh?.number ?? null, `${staffOrigin()}/barimt/${r.id}`));
  }
}

export { deptById };
