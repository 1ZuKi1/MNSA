/** Members, invites, the annual renewal. President (and one deputy) only — see permissions.ts. */
import { randomToken, sha256Hex } from './crypto';
import { auditStmt, db, deptBySlug, many, one, stmt } from './db';
import * as P from './permissions';
import { Denied } from './records';
import { now, termEnd } from './time';
import type { DeptSlug, Role, SessionUser } from './types';

export interface MemberRow {
  id: number;
  email: string;
  name_mn: string;
  full_name: string | null;
  student_id: string | null;
  role: Role;
  department_id: number | null;
  dept_slug: DeptSlug | null;
  dept_name: string | null;
  is_deputy: number;
  status: 'active' | 'alumni' | 'suspended';
  term_ends_at: number | null;
  last_login_at: number | null;
  show_public: number;
}

const SELECT = `SELECT u.id, u.email, u.name_mn, u.full_name, u.student_id, u.role, u.department_id, d.slug AS dept_slug, d.name_mn AS dept_name,
                       u.is_deputy, u.status, u.term_ends_at, u.last_login_at, u.show_public
                  FROM users u LEFT JOIN departments d ON d.id = u.department_id`;

const ROLE_ORDER = `CASE u.role WHEN 'president' THEN 0 WHEN 'board' THEN 1 WHEN 'head' THEN 2 WHEN 'member' THEN 3 ELSE 4 END`;

export const listMembers = (status: 'active' | 'alumni' = 'active') =>
  many<MemberRow>(`${SELECT} WHERE u.status = ? ORDER BY d.sort_order, ${ROLE_ORDER}, u.name_mn`, status);

export const getMember = (id: number) => one<MemberRow>(`${SELECT} WHERE u.id = ?`, id);

export const membersOfDept = (deptId: number) =>
  many<MemberRow>(`${SELECT} WHERE u.department_id = ? AND u.status = 'active' ORDER BY ${ROLE_ORDER}, u.name_mn`, deptId);

export const asMemberLike = (m: MemberRow): P.MemberLike => ({ id: m.id, role: m.role, isDeputy: m.is_deputy === 1 });

// ------------------------------------------------------------------ invites

const INVITE_TTL = 72 * 3600;

export async function createInvite(
  a: SessionUser,
  input: { name: string; studentId: string; dept: DeptSlug | null; role: Role },
  ip: string | null,
): Promise<string> {
  if (!P.grantableRoles(a).includes(input.role)) throw new Denied();
  const dept = input.dept ? await deptBySlug(input.dept) : null;
  if (input.role !== 'maintainer' && !dept) throw new Denied();
  const token = randomToken(24);
  const t = now();
  const row = await stmt(
    `INSERT INTO invites (token_hash, name_mn, student_id, department_id, role, created_by, expires_at, created_at)
     VALUES (?,?,?,?,?,?,?,?) RETURNING id`,
    await sha256Hex(token),
    input.name,
    input.studentId,
    input.role === 'maintainer' ? null : dept!.id,
    input.role,
    a.id,
    t + INVITE_TTL,
    t,
  ).first<{ id: number }>();
  await auditStmt(a.id, 'invite.create', 'invite', row!.id, { name: input.name, role: input.role, dept: input.dept }, ip).run();
  return token;
}

export interface InviteRow {
  id: number;
  name_mn: string;
  student_id: string;
  role: Role;
  department_id: number | null;
  dept_name: string | null;
  expires_at: number;
  pending_email: string | null;
  claimed_at: number | null;
  revoked_at: number | null;
  created_at: number;
  creator_name: string;
}

export const openInvites = () =>
  many<InviteRow>(
    `SELECT i.*, d.name_mn AS dept_name, c.name_mn AS creator_name FROM invites i
       LEFT JOIN departments d ON d.id = i.department_id JOIN users c ON c.id = i.created_by
      WHERE i.claimed_at IS NULL AND i.revoked_at IS NULL ORDER BY i.created_at DESC`,
  );

export const recentlyClaimed = () =>
  many<InviteRow & { claimed_email: string }>(
    `SELECT i.*, d.name_mn AS dept_name, c.name_mn AS creator_name, u.email AS claimed_email FROM invites i
       LEFT JOIN departments d ON d.id = i.department_id JOIN users c ON c.id = i.created_by JOIN users u ON u.id = i.claimed_by
      WHERE i.claimed_at > ? ORDER BY i.claimed_at DESC`,
    now() - 14 * 24 * 3600,
  );

/** A usable invite for this raw token, or null (unknown, expired, used or revoked). */
export async function inviteByToken(token: string) {
  if (!token || token.length > 64) return null;
  const inv = await one<InviteRow>(
    `SELECT i.*, d.name_mn AS dept_name, c.name_mn AS creator_name FROM invites i
       LEFT JOIN departments d ON d.id = i.department_id JOIN users c ON c.id = i.created_by
      WHERE i.token_hash = ?`,
    await sha256Hex(token),
  );
  if (!inv || inv.claimed_at || inv.revoked_at || inv.expires_at < now()) return null;
  return inv;
}

export async function setInvitePendingEmail(inviteId: number, email: string) {
  await stmt(`UPDATE invites SET pending_email = ? WHERE id = ?`, email, inviteId).run();
}

export class EmailTaken extends Error {}

/** Called only after the invitee has proven they own `email` with a code. */
export async function claimInvite(inv: InviteRow, email: string, ip: string | null): Promise<number> {
  const existing = await one<{ id: number }>(`SELECT id FROM users WHERE email = ?`, email);
  if (existing) throw new EmailTaken();
  const t = now();
  const user = await stmt(
    `INSERT INTO users (email, name_mn, student_id, role, department_id, status, term_ends_at, created_by, created_at, last_login_at)
     VALUES (?,?,?,?,?,'active',?,?,?,?) RETURNING id`,
    email,
    inv.name_mn,
    inv.student_id || null,
    inv.role,
    inv.department_id,
    termEnd(t),
    (await one<{ created_by: number }>(`SELECT created_by FROM invites WHERE id = ?`, inv.id))!.created_by,
    t,
    t,
  ).first<{ id: number }>();
  await db().batch([
    stmt(`UPDATE invites SET claimed_by = ?, claimed_at = ?, pending_email = NULL WHERE id = ? AND claimed_at IS NULL`, user!.id, t, inv.id),
    auditStmt(user!.id, 'invite.claim', 'invite', inv.id, { email }, ip),
  ]);
  return user!.id;
}

export async function revokeInvite(a: SessionUser, inviteId: number, ip: string | null) {
  if (!P.canManageMembers(a)) throw new Denied();
  await db().batch([
    stmt(`UPDATE invites SET revoked_at = ? WHERE id = ? AND claimed_at IS NULL`, now(), inviteId),
    auditStmt(a.id, 'invite.revoke', 'invite', inviteId, null, ip),
  ]);
}

// ------------------------------------------------------------------ changes

export async function changeMember(a: SessionUser, m: MemberRow, input: { role: Role; dept: DeptSlug | null }, ip: string | null) {
  if (!P.canModifyMember(a, asMemberLike(m))) throw new Denied();
  if (input.role !== m.role && !P.grantableRoles(a).includes(input.role)) throw new Denied();
  const dept = input.dept ? await deptBySlug(input.dept) : null;
  await db().batch([
    // Role changes take effect on the next request (permissions are re-read every time), no re-login needed.
    stmt(`UPDATE users SET role = ?, department_id = ? WHERE id = ?`, input.role, input.role === 'maintainer' ? null : (dept?.id ?? m.department_id), m.id),
    auditStmt(a.id, 'member.change', 'user', m.id, { from: { role: m.role, dept: m.dept_slug }, to: input }, ip),
  ]);
}

/** Removal = alumni + every session killed instantly. Nothing they wrote is touched. */
export async function removeMember(a: SessionUser, m: MemberRow, ip: string | null) {
  if (!P.canModifyMember(a, asMemberLike(m))) throw new Denied();
  await db().batch([
    stmt(`UPDATE users SET status = 'alumni', is_deputy = 0, session_version = session_version + 1 WHERE id = ?`, m.id),
    auditStmt(a.id, 'member.remove', 'user', m.id, { name: m.name_mn }, ip),
  ]);
}

export async function setDeputy(a: SessionUser, m: MemberRow | null, ip: string | null) {
  if (!P.canSetDeputy(a)) throw new Denied();
  if (m && (m.role === 'maintainer' || m.role === 'president' || m.status !== 'active')) throw new Denied();
  await db().batch([
    stmt(`UPDATE users SET is_deputy = 0 WHERE is_deputy = 1`),
    ...(m ? [stmt(`UPDATE users SET is_deputy = 1 WHERE id = ?`, m.id)] : []),
    auditStmt(a.id, 'member.deputy', 'user', m?.id ?? null, null, ip),
  ]);
}

export async function changeEmail(a: SessionUser, m: MemberRow, email: string, ip: string | null) {
  if (!P.canModifyMember(a, asMemberLike(m))) throw new Denied();
  await db().batch([
    stmt(`UPDATE users SET email = ?, session_version = session_version + 1 WHERE id = ?`, email, m.id),
    auditStmt(a.id, 'member.email', 'user', m.id, { from: m.email, to: email }, ip),
  ]);
}

/** Anyone may hide or show themselves on the public team page; managers may do it for others. */
export const canSetPublic = (a: SessionUser, m: MemberRow) => a.id === m.id || P.canModifyMember(a, asMemberLike(m));

export async function setShowPublic(a: SessionUser, m: MemberRow, on: boolean, ip: string | null) {
  if (!canSetPublic(a, m)) throw new Denied();
  await db().batch([
    stmt(`UPDATE users SET show_public = ? WHERE id = ?`, on ? 1 : 0, m.id),
    auditStmt(a.id, on ? 'member.public.show' : 'member.public.hide', 'user', m.id, null, ip),
  ]);
}

// ------------------------------------------------------------------ annual renewal (Idea 1)

const RENEW_WINDOW = 60 * 24 * 3600;

/** Accounts ending within 60 days, or already lapsed but not yet archived. */
export const renewalCandidates = () =>
  many<MemberRow>(
    `${SELECT} WHERE u.status = 'active' AND u.term_ends_at IS NOT NULL AND u.term_ends_at < ?
      ORDER BY d.sort_order, ${ROLE_ORDER}, u.name_mn`,
    now() + RENEW_WINDOW,
  );

/** The new term: the end of the academic year after the current term (or after today, if already lapsed). */
export const nextTerm = (current: number | null) => termEnd(Math.max(now(), (current ?? now()) + 24 * 3600));

export async function renewMembers(a: SessionUser, ids: number[], ip: string | null) {
  if (!P.canManageMembers(a)) throw new Denied();
  const rows = await renewalCandidates();
  const allowed = rows.filter(
    (m) => ids.includes(m.id) && ((a.role === 'president' && m.id === a.id) || P.canModifyMember(a, asMemberLike(m))),
  );
  if (!allowed.length) return 0;
  await db().batch([
    ...allowed.map((m) => stmt(`UPDATE users SET term_ends_at = ? WHERE id = ?`, nextTerm(m.term_ends_at), m.id)),
    auditStmt(a.id, 'member.renew', 'user', null, { ids: allowed.map((m) => m.id) }, ip),
  ]);
  return allowed.length;
}

/** Everyone whose term has passed without renewal becomes alumni. Safe to call any time. */
export async function archiveLapsed(actorId: number | null) {
  const lapsed = await many<{ id: number }>(`SELECT id FROM users WHERE status = 'active' AND term_ends_at IS NOT NULL AND term_ends_at < ?`, now());
  if (!lapsed.length) return 0;
  await db().batch([
    stmt(`UPDATE users SET status = 'alumni', is_deputy = 0, session_version = session_version + 1 WHERE status = 'active' AND term_ends_at < ?`, now()),
    auditStmt(actorId, 'member.archive-lapsed', 'user', null, { ids: lapsed.map((l) => l.id) }, null),
  ]);
  return lapsed.length;
}
