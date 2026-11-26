/** Database operations for records. Every write checks permissions.ts first. */
import { db, deptById, deptBySlug, many, one, stmt, auditStmt } from './db';
import { awaitingDecisionMail, deletionRequestMail, sendMail } from './mailer';
import { clip, pushToUsers } from './push';
import * as P from './permissions';
import { getRecordType, type RecordType } from './record-types';
import { academicYear, now } from './time';
import type { DeptSlug, RecordStatus, Role, SessionUser, Step, Visibility } from './types';
import { advance, chainFor, numberPrefix, parseNumber, renumberPlan } from './workflow';
import { staffOrigin } from './site';
export { paperOf, type PaperInfo } from './paper';

export interface RecordRow {
  id: number;
  type: string;
  department_id: number;
  dept_slug: DeptSlug;
  dept_name: string;
  dept_code: string;
  /** The optional second department («хамтран хариуцах хэлтэс»). */
  co_department_id: number | null;
  co_dept_slug: DeptSlug | null;
  co_dept_name: string | null;
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
  /** Set on a paper document entered into the archive (migration 0012); see PaperInfo in paper.ts. */
  paper_json: string | null;
}

const SELECT = `
  SELECT r.*, d.slug AS dept_slug, d.name_mn AS dept_name, d.code AS dept_code, u.name_mn AS author_name,
         cd.slug AS co_dept_slug, cd.name_mn AS co_dept_name
    FROM records r
    JOIN departments d ON d.id = r.department_id
    LEFT JOIN departments cd ON cd.id = r.co_department_id
    JOIN users u ON u.id = r.author_id`;

export const asRecordLike = (r: RecordRow): P.RecordLike => ({
  authorId: r.author_id,
  dept: r.dept_slug,
  coDept: r.co_dept_slug,
  status: r.status,
  visibility: r.visibility,
  step: r.awaiting,
});

/** This document's approval chain: its type's, with the second department's дарга when it has one. */
export const recordChain = (r: RecordRow): Step[] => chainFor(getRecordType(r.type)!.chain, r.co_dept_slug);

export const fieldsOf = (r: RecordRow): Record<string, string> => {
  try {
    return JSON.parse(r.fields_json);
  } catch {
    return {};
  }
};

/**
 * Every academic year that has documents, newest first, always including the current one — so the archive
 * of any past year (the paper documents of 2025–2026 included) stays reachable from the year filters.
 */
export async function recordYears(): Promise<string[]> {
  const cur = academicYear();
  const rows = await many<{ y: string }>(`SELECT DISTINCT academic_year AS y FROM records`);
  return [...new Set([cur, ...rows.map((r) => r.y)])].sort().reverse();
}

export async function getRecord(id: number): Promise<RecordRow | null> {
  return one<RecordRow>(`${SELECT} WHERE r.id = ?`, id);
}

/**
 * The read rule, expressed in SQL so we never load rows we'd then hide.
 * Mirrors P.canReadRecord; results are re-checked in JS as a second wall.
 */
function readableWhere(a: SessionUser): { sql: string; params: unknown[] } {
  if (a.role === 'president' || a.role === 'maintainer') return { sql: '1', params: [] };
  const isBoard = a.role === 'board' ? 1 : 0;
  const isHead = a.role === 'head' ? 1 : 0;
  const isLegalHead = P.isLegalHead(a) ? 1 : 0;
  return {
    sql: `(r.author_id = ?1
       OR (r.status = 'draft' AND ?2 = 1 AND r.department_id = ?3)
       OR (r.status <> 'draft' AND (
             r.visibility = 'staff'
          OR r.department_id = ?3
          OR r.co_department_id = ?3
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
    where.push(clause.replaceAll('?', `?${params.length}`)); // every ? in the clause is this one value
  };
  if (f.dept) add('(d.slug = ? OR cd.slug = ?)', f.dept);
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
    conds.push(`(r.awaiting = 'cohead' AND r.co_department_id = ?${params.length})`);
  }
  if (P.isLegalHead(a)) conds.push(`r.awaiting = 'legal'`);
  if (a.role === 'president') conds.push(`r.awaiting = 'president'`); // official signing: the President's alone
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
  input: { type: RecordType; dept: DeptSlug; coDept: DeptSlug | null; title: string; values: Record<string, string>; visibility: Visibility },
  ip: string | null,
): Promise<number> {
  if (!P.canCreateRecordIn(a, input.dept) || input.type.archiveOnly) throw new Denied();
  const dept = await deptBySlug(input.dept);
  if (!dept) throw new Denied();
  const co = await coDeptId(input.coDept, dept.id);
  const t = now();
  const fields = JSON.stringify(input.values);
  const res = await stmt(
    `INSERT INTO records (type, department_id, co_department_id, author_id, academic_year, title, fields_json, visibility, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    input.type.slug,
    dept.id,
    co,
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
  input: { title: string; values: Record<string, string>; visibility: Visibility; coDept: DeptSlug | null },
  ip: string | null,
) {
  if (!P.canEditRecord(a, asRecordLike(r))) throw new Denied();
  // Only while a draft or sent back (canEditRecord), so a chain in progress never changes under anyone.
  const co = await coDeptId(input.coDept, r.department_id);
  const t = now();
  const fields = JSON.stringify(input.values);
  const v = r.version + 1;
  const upd = await stmt(
    `UPDATE records SET title = ?, fields_json = ?, visibility = ?, co_department_id = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?`,
    input.title,
    fields,
    input.visibility,
    co,
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

/** The second department's id; none when not chosen or the same as the main one. */
async function coDeptId(slug: DeptSlug | null, mainId: number): Promise<number | null> {
  if (!slug) return null;
  const d = await deptBySlug(slug);
  return d && d.id !== mainId ? d.id : null;
}

async function authorOf(r: RecordRow) {
  const u = await one<{ id: number; role: Role; dept: DeptSlug | null; is_deputy: number }>(
    `SELECT u.id, u.role, d.slug AS dept, u.is_deputy FROM users u LEFT JOIN departments d ON d.id = u.department_id WHERE u.id = ?`,
    r.author_id,
  );
  return { id: u!.id, role: u!.role, dept: u!.dept, isDeputy: u!.is_deputy === 1 };
}

/** Moves the record to the next step that needs someone, recording automatic passes. */
async function applyAdvance(r: RecordRow, from: number, extra: D1PreparedStatement[], expectStatus: RecordStatus, expectStep: number, actorId: number) {
  const chain = recordChain(r);
  const next = advance(chain, from, await authorOf(r), r.dept_slug, r.co_dept_slug);
  const t = now();
  const status: RecordStatus = next.done ? 'approved' : 'in_review';
  const awaiting = next.done ? null : chain[next.index];

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
    // Fully approved: this is when it gets its number (before 2026-11 it was on first submission).
    ...(next.done ? numberStmts(r) : []),
    ...extra,
    ...next.auto.map((s) => stmt(`INSERT INTO record_actions (record_id, actor_id, action, step, created_at) VALUES (?,?,'auto',?,?)`, r.id, r.author_id, s, t)),
  ]);
  if (awaiting) await notifyStepOwners(r, awaiting);
  // Fully approved by someone else's decision: tell the author (no email for this — push is free, email isn't).
  else if (actorId !== r.author_id) {
    await pushToUsers([r.author_id], {
      title: 'Баримт батлагдлаа',
      body: clip(`Таны «${r.title}» баримт бүх шатаар батлагдлаа.`),
      url: `/barimt/${r.id}`,
      tag: `record-${r.id}`,
    });
  }
  return { status, awaiting };
}

/**
 * The two statements that give an approved record its number: counter bump and assignment, run in the same
 * transaction as the approval, so there are no gaps and no duplicates. Both only act while the record has no
 * number yet — a double approval must not skip one, and documents numbered under the old rule keep theirs.
 */
function numberStmts(r: Pick<RecordRow, 'id' | 'dept_code' | 'academic_year' | 'type'>): D1PreparedStatement[] {
  const prefix = numberPrefix(r.dept_code, r.academic_year, getRecordType(r.type)!.code);
  return [
    stmt(
      `INSERT INTO counters (key, value) SELECT ?1, 1 WHERE EXISTS (SELECT 1 FROM records WHERE id = ?2 AND number IS NULL AND status = 'approved')
       ON CONFLICT(key) DO UPDATE SET value = value + 1`,
      prefix,
      r.id,
    ),
    stmt(
      `UPDATE records SET number = ?1 || printf('%03d', (SELECT value FROM counters WHERE key = ?1)) WHERE id = ?2 AND number IS NULL AND status = 'approved'`,
      prefix,
      r.id,
    ),
  ];
}

/** Safety net: an approved record that somehow has no number (a failed write) gets one the next time it's opened. */
export async function ensureNumber(r: RecordRow): Promise<RecordRow> {
  if (r.status !== 'approved' || r.number || r.paper_json) return r;
  await db().batch(numberStmts(r));
  return (await getRecord(r.id)) ?? r;
}

export async function submitRecord(a: SessionUser, r: RecordRow, ip: string | null) {
  if (!P.canSubmitRecord(a, asRecordLike(r))) throw new Denied();
  const t = now();
  return applyAdvance(
    r,
    0,
    [
      stmt(`INSERT INTO record_actions (record_id, actor_id, action, created_at) VALUES (?,?,'submit',?)`, r.id, a.id, t),
      auditStmt(a.id, 'record.submit', 'record', r.id, null, ip),
    ],
    r.status,
    r.step,
    a.id,
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
    if (a.id !== r.author_id) {
      await pushToUsers([r.author_id], {
        title: 'Баримт буцаагдлаа',
        body: clip(`${a.name} таны «${r.title}» баримтыг буцаалаа: ${comment.trim()}`, 140),
        url: `/barimt/${r.id}`,
        tag: `record-${r.id}`,
      });
    }
    return;
  }
  await applyAdvance(
    r,
    r.step + 1,
    [
      stmt(`INSERT INTO record_actions (record_id, actor_id, action, step, comment, created_at) VALUES (?,?,'approve',?,?,?)`, r.id, a.id, step, comment.trim() || null, t),
      auditStmt(a.id, 'record.approve', 'record', r.id, { step, standIn: !P.isStepOwner(a, step, r.dept_slug, r.co_dept_slug) }, ip),
    ],
    'in_review',
    r.step,
    a.id,
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

/** One email to whoever owns the next step — never a broadcast (Resend free: 100/day) — and a push to their phones. */
async function notifyStepOwners(r: RecordRow, step: Step) {
  let rows: { id: number; email: string }[] = [];
  if (step === 'head' || step === 'cohead') {
    const dept = step === 'head' ? r.department_id : r.co_department_id;
    rows = await many(`SELECT id, email FROM users WHERE role = 'head' AND department_id = ? AND status = 'active'`, dept ?? -1);
  } else if (step === 'legal') {
    const legal = await deptBySlug(P.LEGAL);
    rows = await many(`SELECT id, email FROM users WHERE role = 'head' AND department_id = ? AND status = 'active'`, legal?.id ?? -1);
  } else {
    rows = await many(`SELECT id, email FROM users WHERE role = 'president' AND status = 'active'`);
  }
  const fresh = await getRecord(r.id);
  const number = fresh?.number ?? null;
  await pushToUsers(
    rows.map((x) => x.id),
    {
      title: 'Таны шийдвэр хүлээж байна',
      body: clip(`«${r.title}»${number ? ` (${number})` : ''} баримт таны хяналтад ирлээ.`, 140),
      url: `/barimt/${r.id}`,
      tag: `record-${r.id}`,
    },
  );
  for (const { email } of rows) {
    await sendMail(awaitingDecisionMail(email, r.title, number, `${staffOrigin()}/barimt/${r.id}`));
  }
}

export { deptById };

// ------------------------------------------------------------------ deleting

/**
 * After a deletion the series counter goes back to the highest number still in use, so the next approval
 * continues straight after it. Computed from the numbers themselves, never by subtracting, so it can't collide.
 */
const resetCounter = (prefix: string) =>
  stmt(
    `UPDATE counters SET value = (SELECT COALESCE(MAX(CAST(substr(number, length(?1) + 1) AS INTEGER)), 0) FROM records WHERE substr(number, 1, length(?1)) = ?1)
      WHERE key = ?1`,
    prefix,
  );

/** Children first: the database refuses to drop a record that history rows still point at. */
function deleteStmts(id: number, guard: string): D1PreparedStatement[] {
  const still = `EXISTS (SELECT 1 FROM records WHERE id = ?1 AND ${guard})`;
  return [
    stmt(`UPDATE events SET source_record_id = NULL WHERE source_record_id = ?1 AND ${still}`, id),
    stmt(`DELETE FROM record_versions WHERE record_id = ?1 AND ${still}`, id),
    stmt(`DELETE FROM record_actions WHERE record_id = ?1 AND ${still}`, id),
    stmt(`DELETE FROM records WHERE id = ?1 AND ${guard}`, id),
  ];
}

/**
 * A draft or a sent-back document nobody needs. Gone for good, apart from a line in the activity log.
 * Under the old rule such a document could already carry a number: if it was the last one in its
 * series the number is given back, otherwise it stays unused (the documents after it may be printed already).
 */
export async function deleteUnapproved(a: SessionUser, r: RecordRow, ip: string | null) {
  if (!P.canDeleteUnapproved(a, asRecordLike(r))) throw new Denied();
  const n = parseNumber(r.number);
  const res = await db().batch([
    ...deleteStmts(r.id, `status IN ('draft','rejected') AND version = ${Number(r.version)}`),
    ...(n ? [resetCounter(n.prefix)] : []),
    auditStmt(a.id, 'record.delete', 'record', r.id, { title: r.title, number: r.number, status: r.status, type: r.type }, ip),
  ]);
  if (!res[3].meta.changes) throw new Conflict();
}

export interface DeletionRow {
  id: number;
  record_id: number;
  record_number: string | null;
  record_title: string;
  reason: string;
  requested_by: number;
  requested_name: string;
  president_by: number | null;
  president_name: string | null;
  legal_by: number | null;
  legal_name: string | null;
  status: 'pending' | 'done' | 'cancelled';
  created_at: number;
}

/** A request waits 7 days for the other side, then lapses. */
export const DELETION_TTL = 7 * 24 * 3600;

export async function pendingDeletion(recordId: number): Promise<DeletionRow | null> {
  return one<DeletionRow>(
    `SELECT d.*, ru.name_mn AS requested_name, pu.name_mn AS president_name, lu.name_mn AS legal_name
       FROM record_deletions d
       JOIN users ru ON ru.id = d.requested_by
       LEFT JOIN users pu ON pu.id = d.president_by
       LEFT JOIN users lu ON lu.id = d.legal_by
      WHERE d.record_id = ? AND d.status = 'pending' AND d.created_at > ?`,
    recordId,
    now() - DELETION_TTL,
  );
}

/** Every number that would move if this record were deleted — shown before anyone confirms. */
export async function deletionPlan(r: RecordRow) {
  const n = parseNumber(r.number);
  if (!n) return [];
  const series = await many<{ id: number; number: string }>(
    `SELECT id, number FROM records WHERE substr(number, 1, ?) = ? AND id <> ?`,
    n.prefix.length,
    n.prefix,
    r.id,
  );
  return renumberPlan(r.number!, series);
}

/** The people on the other side, who are asked to confirm. */
async function otherSide(side: P.DeletionSide): Promise<{ id: number; email: string }[]> {
  return side === 'president'
    ? many(`SELECT u.id, u.email FROM users u JOIN departments d ON d.id = u.department_id WHERE u.role = 'head' AND d.slug = ? AND u.status = 'active'`, P.LEGAL)
    : many(`SELECT id, email FROM users WHERE role = 'president' AND status = 'active'`);
}

/** First of the two confirmations: asks for the deletion and counts as this side's yes. */
export async function requestOfficialDeletion(a: SessionUser, r: RecordRow, reason: string, ip: string | null) {
  if (!P.canRequestOfficialDeletion(a, asRecordLike(r))) throw new Denied();
  if (!reason.trim()) throw new Error('comment-required');
  const side = P.deletionSide(a)!;
  const t = now();
  // A lapsed request no longer blocks a new one.
  await stmt(`UPDATE record_deletions SET status = 'cancelled', decided_at = ? WHERE record_id = ? AND status = 'pending' AND created_at <= ?`, t, r.id, t - DELETION_TTL).run();
  try {
    await db().batch([
      stmt(
        `INSERT INTO record_deletions (record_id, record_number, record_title, reason, requested_by, president_by, legal_by, created_at) VALUES (?,?,?,?,?,?,?,?)`,
        r.id,
        r.number,
        r.title,
        reason.trim(),
        a.id,
        side === 'president' ? a.id : null,
        side === 'legal' ? a.id : null,
        t,
      ),
      stmt(`INSERT INTO record_actions (record_id, actor_id, action, comment, created_at) VALUES (?,?,'delete_request',?,?)`, r.id, a.id, reason.trim(), t),
      auditStmt(a.id, 'record.delete_request', 'record', r.id, { number: r.number }, ip),
    ]);
  } catch {
    throw new Conflict(); // someone already asked
  }
  const people = (await otherSide(side)).filter((p) => p.id !== a.id);
  const doc = `«${r.title}»${r.number ? ` (${r.number})` : ''}`;
  await pushToUsers(
    people.map((p) => p.id),
    { title: 'Баримт устгах хүсэлт', body: clip(`${a.name} ${doc} баримтыг устгахыг хүсэж байна. Таны зөвшөөрөл хэрэгтэй.`, 140), url: `/barimt/${r.id}`, tag: `record-${r.id}` },
  );
  for (const p of people) await sendMail(deletionRequestMail(p.email, a.name, doc, reason.trim(), `${staffOrigin()}/barimt/${r.id}`));
}

/** Either side says no (or the one who asked takes it back). */
export async function cancelOfficialDeletion(a: SessionUser, d: DeletionRow, ip: string | null) {
  if (P.deletionSide(a) === null && a.id !== d.requested_by) throw new Denied();
  const t = now();
  const upd = await stmt(`UPDATE record_deletions SET status = 'cancelled', cancelled_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'`, a.id, t, d.id).run();
  if (!upd.meta.changes) throw new Conflict();
  await db().batch([
    stmt(`INSERT INTO record_actions (record_id, actor_id, action, created_at) VALUES (?,?,'delete_cancel',?)`, d.record_id, a.id, t),
    auditStmt(a.id, 'record.delete_cancel', 'record', d.record_id, null, ip),
  ]);
  if (a.id !== d.requested_by) {
    await pushToUsers([d.requested_by], {
      title: 'Устгах хүсэлтээс татгалзлаа',
      body: clip(`${a.name} «${d.record_title}» баримтыг устгахыг зөвшөөрсөнгүй. Баримт хэвээр үлдлээ.`, 140),
      url: `/barimt/${d.record_id}`,
      tag: `record-${d.record_id}`,
    });
  }
}

/**
 * Second confirmation, from the other side: the record is deleted and every later number in its series moves
 * down by one. A copy of the record (versions and history included) stays in record_deletions.
 * Returns the moves that were made.
 */
export async function confirmOfficialDeletion(a: SessionUser, r: RecordRow, d: DeletionRow, ip: string | null) {
  if (!P.canConfirmOfficialDeletion(a, { presidentBy: d.president_by, legalBy: d.legal_by })) throw new Denied();
  if (d.record_id !== r.id || (r.status !== 'approved' && r.status !== 'void')) throw new Conflict();
  const side = P.deletionSide(a)!;
  const t = now();
  const plan = await deletionPlan(r);
  const [versions, history] = await Promise.all([
    many(`SELECT * FROM record_versions WHERE record_id = ? ORDER BY version`, r.id),
    many(`SELECT * FROM record_actions WHERE record_id = ? ORDER BY id`, r.id),
  ]);
  const snapshot = JSON.stringify({ record: r, versions, history });

  // Claim the request first: two people pressing at once must not both run it.
  const claim = await stmt(
    `UPDATE record_deletions SET status = 'done', ${side === 'president' ? 'president_by' : 'legal_by'} = ?, decided_at = ?, renumbered_json = ?, snapshot_json = ?
      WHERE id = ? AND status = 'pending' AND ${side === 'president' ? 'president_by' : 'legal_by'} IS NULL`,
    a.id,
    t,
    JSON.stringify(plan.map(({ from, to }) => ({ from, to }))),
    snapshot,
    d.id,
  ).run();
  if (!claim.meta.changes) throw new Conflict();

  const n = parseNumber(r.number);
  const note = (from: string, to: string) =>
    `Өмнө нь ${from} дугаартай байсан. ${r.number} дугаартай «${r.title}» баримтыг Тэргүүн болон Эрх зүйн хэлтсийн дарга хамтран устгасан тул ${to} болов. Шалтгаан: ${d.reason}`;
  try {
    await db().batch([
      ...deleteStmts(r.id, `status IN ('approved','void')`),
      // Lowest first: each takes the number the previous one freed (numbers are unique).
      ...plan.flatMap((m) => [
        stmt(`UPDATE records SET number = ? WHERE id = ? AND number = ?`, m.to, m.id, m.from),
        stmt(`INSERT INTO record_actions (record_id, actor_id, action, comment, created_at) VALUES (?,?,'renumber',?,?)`, m.id, a.id, note(m.from, m.to), t),
      ]),
      ...(n ? [resetCounter(n.prefix)] : []),
      auditStmt(a.id, 'record.delete_official', 'record', r.id, { number: r.number, title: r.title, renumbered: plan.length, request: d.id }, ip),
    ]);
  } catch (e) {
    // Nothing was deleted: put the request back as it was.
    await stmt(`UPDATE record_deletions SET status = 'pending', ${side === 'president' ? 'president_by' : 'legal_by'} = NULL, decided_at = NULL, renumbered_json = NULL, snapshot_json = NULL WHERE id = ?`, d.id).run();
    throw e;
  }

  // Everyone whose document got a new number should know: their printed copy is now out of date.
  const moved = await many<{ id: number; author_id: number; title: string; number: string }>(
    `SELECT id, author_id, title, number FROM records WHERE id IN (${plan.map(() => '?').join(',') || 'NULL'})`,
    ...plan.map((m) => m.id),
  );
  for (const m of moved) {
    await pushToUsers([m.author_id], {
      title: 'Баримтын дугаар өөрчлөгдлөө',
      body: clip(`«${m.title}» одоо ${m.number} дугаартай. Хэвлэсэн бол дахин хэвлэнэ үү.`, 140),
      url: `/barimt/${m.id}`,
      tag: `record-${m.id}`,
    });
  }
  await pushToUsers([d.requested_by, r.author_id].filter((x) => x !== a.id), {
    title: 'Баримт устгагдлаа',
    body: clip(`«${r.title}»${r.number ? ` (${r.number})` : ''} баримтыг хоёр талын зөвшөөрлөөр устгалаа.`, 140),
    url: '/barimt',
    tag: `record-${r.id}`,
  });
  return plan;
}
