/**
 * «Санхүү» — the association's money records, staff only (never on the public site). A request follows the
 * paper form «САНХҮҮГИЙН ХҮСЭЛТИЙН МАЯГТ»: kind, who asks, for which event, the lines, how to pay, receipts;
 * the «Төсвийн хариуцагч» decides, then the President; then the keeper records the money given or received.
 * Who may do what: permissions.ts (the «money» section). Every change is in the audit log; nothing is deleted.
 */
import { auditStmt, db, deptBySlug, many, one, stmt } from './db';
import { fmtQty, lineTotal } from './money';
import * as P from './permissions';
import { Conflict, Denied } from './records';
import { academicYear, now } from './time';
import type { DeptSlug, Role, SessionUser } from './types';
import { shortYear } from './workflow';

export type FinanceKind = 'advance' | 'reimburse' | 'income';
export type FinanceStatus = P.FinanceLike['status'];
export const FINANCE_KINDS: FinanceKind[] = ['advance', 'reimburse', 'income'];
/** As the paper form words them. */
export const KIND_LABEL: Record<FinanceKind, string> = {
  advance: 'Урьдчилгаа авах',
  reimburse: 'Гарсан зардал нөхөн авах',
  income: 'Орлогын бүртгэл',
};
export const STATUS_LABEL: Record<FinanceStatus, string> = {
  pending: 'Шийдвэр хүлээж буй',
  approved: 'Зөвшөөрсөн',
  rejected: 'Татгалзсан',
  paid: 'Бүртгэсэн',
  cancelled: 'Цуцалсан',
};
export const STEP_LABEL: Record<P.FinanceStep, string> = { keeper: 'Санхүү хариуцсан гишүүн', president: 'Тэргүүн' };
/** Money in, or money out of the association's hands. */
export const isIncome = (k: FinanceKind) => k === 'income';

export const CURRENCIES = ['CNY', 'MNT'] as const;
export { fmtMoney } from './money';
export { fmtQty };

export interface FinanceLineInput {
  item: string;
  qtyC: number;
  unitMinor: number;
  note: string;
}
export interface FinanceInput {
  kind: FinanceKind;
  dept: DeptSlug | null;
  contact: string;
  eventName: string;
  spentOn: number;
  purpose: string;
  currency: string;
  lines: FinanceLineInput[];
  payMethod: 'cash' | 'wechat' | null;
  payeeName: string;
  payeeAccount: string;
  receiptsStated: number;
  noReceiptReason: string;
}

export interface FinanceRow {
  id: number;
  kind: FinanceKind;
  academic_year: string;
  number: string;
  requester_id: number;
  requester_name: string;
  dept_slug: DeptSlug | null;
  dept_name: string | null;
  contact: string | null;
  event_name: string;
  spent_on: number;
  purpose: string | null;
  currency: string;
  total_minor: number;
  pay_method: 'cash' | 'wechat' | null;
  payee_name: string | null;
  payee_account: string | null;
  receipts_stated: number;
  no_receipt_reason: string | null;
  status: FinanceStatus;
  awaiting: P.FinanceStep | null;
  keeper_name: string | null;
  keeper_at: number | null;
  president_name: string | null;
  president_at: number | null;
  rejecter_name: string | null;
  rejected_at: number | null;
  reject_reason: string | null;
  paid_minor: number | null;
  paid_on: number | null;
  payer_name: string | null;
  created_at: number;
  updated_at: number;
}
export interface FinanceLine {
  id: number;
  item: string;
  qty_c: number;
  unit_minor: number;
  total_minor: number;
  note: string | null;
}
export interface FinanceReceipt {
  id: number;
  media_id: string;
  uploader_name: string;
  created_at: number;
}

export const asFinanceLike = (r: FinanceRow): P.FinanceLike => ({ requesterId: r.requester_id, status: r.status, awaiting: r.awaiting });

const SELECT = `
  SELECT f.*, u.name_mn AS requester_name, d.slug AS dept_slug, d.name_mn AS dept_name,
         k.name_mn AS keeper_name, pr.name_mn AS president_name, rj.name_mn AS rejecter_name, py.name_mn AS payer_name
    FROM finance_requests f
    JOIN users u ON u.id = f.requester_id
    LEFT JOIN departments d ON d.id = f.department_id
    LEFT JOIN users k ON k.id = f.keeper_id
    LEFT JOIN users pr ON pr.id = f.president_id
    LEFT JOIN users rj ON rj.id = f.rejected_by
    LEFT JOIN users py ON py.id = f.paid_by`;

/** The person as the money rules see them: the keeper flag is read fresh, never from the session. */
export async function financeActor(a: SessionUser): Promise<P.FinanceActor> {
  const r = await one<{ k: number }>(`SELECT is_budget_keeper AS k FROM users WHERE id = ? AND status = 'active'`, a.id);
  return { id: a.id, role: a.role, dept: a.dept, isDeputy: a.isDeputy, isBudgetKeeper: r?.k === 1 };
}

export async function getFinance(id: number): Promise<FinanceRow | null> {
  return one<FinanceRow>(`${SELECT} WHERE f.id = ?`, id);
}

export async function financeLines(id: number): Promise<FinanceLine[]> {
  return many<FinanceLine>(`SELECT id, item, qty_c, unit_minor, total_minor, note FROM finance_lines WHERE request_id = ? ORDER BY sort`, id);
}

export async function financeReceipts(id: number): Promise<FinanceReceipt[]> {
  return many<FinanceReceipt>(
    `SELECT r.id, r.media_id, u.name_mn AS uploader_name, r.created_at FROM finance_receipts r JOIN users u ON u.id = r.uploaded_by
      WHERE r.request_id = ? AND r.removed_at IS NULL ORDER BY r.id`,
    id,
  );
}

/** Requests this person may read, newest first: their own, or every one for those who see all. */
export async function listFinance(a: P.FinanceActor, f: { year?: string; mine?: boolean; status?: string } = {}): Promise<FinanceRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.mine || !P.canSeeAllMoney(a)) {
    params.push(a.id);
    where.push(`f.requester_id = ?${params.length}`);
  }
  if (f.year) {
    params.push(f.year);
    where.push(`f.academic_year = ?${params.length}`);
  }
  if (f.status) {
    params.push(f.status);
    where.push(`f.status = ?${params.length}`);
  }
  return many<FinanceRow>(`${SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY f.created_at DESC LIMIT 500`, ...params);
}

/** The requests waiting on this person's decision. */
export async function moneyAwaitingMe(a: P.FinanceActor): Promise<FinanceRow[]> {
  const steps: P.FinanceStep[] = [];
  if (P.canKeepBudget(a)) steps.push('keeper');
  if (a.role === 'president') steps.push('president');
  if (!steps.length) return [];
  const rows = await many<FinanceRow>(
    `${SELECT} WHERE f.status = 'pending' AND f.awaiting IN (${steps.map(() => '?').join(',')}) AND f.requester_id <> ? ORDER BY f.created_at`,
    ...steps,
    a.id,
  );
  return rows;
}

/** Approved, not yet recorded — the keeper's queue. */
export async function moneyToRecord(a: P.FinanceActor): Promise<FinanceRow[]> {
  if (!P.canKeepBudget(a)) return [];
  return many<FinanceRow>(`${SELECT} WHERE f.status = 'approved' ORDER BY f.created_at`);
}

/** Every year that has money records, newest first, always with the current one. */
export async function financeYears(): Promise<string[]> {
  const rows = await many<{ y: string }>(`SELECT DISTINCT academic_year AS y FROM finance_requests`);
  return [...new Set([academicYear(), ...rows.map((r) => r.y)])].sort().reverse();
}

export interface YearTotals {
  currency: string;
  inMinor: number;
  outMinor: number;
}
/** Money actually given or received in a year (recorded requests only), per currency. */
export async function yearTotals(year: string): Promise<YearTotals[]> {
  const rows = await many<{ currency: string; kind: FinanceKind; s: number }>(
    `SELECT currency, kind, SUM(paid_minor) AS s FROM finance_requests WHERE academic_year = ? AND status = 'paid' GROUP BY currency, kind`,
    year,
  );
  const by = new Map<string, YearTotals>();
  for (const r of rows) {
    const t = by.get(r.currency) ?? { currency: r.currency, inMinor: 0, outMinor: 0 };
    if (isIncome(r.kind)) t.inMinor += r.s;
    else t.outMinor += r.s;
    by.set(r.currency, t);
  }
  return [...by.values()].sort((a, b) => (a.currency === 'CNY' ? -1 : b.currency === 'CNY' ? 1 : a.currency.localeCompare(b.currency)));
}

/** Who is named «Төсвийн хариуцагч» now (the first decider). */
export async function moneyKeepers(): Promise<{ id: number; name_mn: string }[]> {
  return many(`SELECT id, name_mn FROM users WHERE is_budget_keeper = 1 AND status = 'active' AND role NOT IN ('president','maintainer') ORDER BY name_mn`);
}

// ------------------------------------------------------------------ writes

export async function createFinance(a: SessionUser, input: FinanceInput, ip: string | null): Promise<number> {
  const actor = await financeActor(a);
  if (!P.canRequestMoney(actor)) throw new Denied();
  const steps = P.financeSteps({ isBudgetKeeper: actor.isBudgetKeeper, role: actor.role });
  const dept = input.dept ? await deptBySlug(input.dept) : null;
  const t = now();
  const year = academicYear(input.spentOn);
  const prefix = `МОХ-САН/${shortYear(year)}/`;
  const lines = input.lines.map((l) => ({ ...l, total: lineTotal(l.qtyC, l.unitMinor) }));
  const total = lines.reduce((s, l) => s + l.total, 0);
  // number and row in one batch: the counter moves only together with the insert
  const res = await db().batch([
    stmt(`INSERT INTO counters (key, value) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET value = value + 1`, prefix),
    stmt(
      `INSERT INTO finance_requests (kind, academic_year, number, requester_id, department_id, contact, event_name, spent_on, purpose, currency,
         total_minor, pay_method, payee_name, payee_account, receipts_stated, no_receipt_reason, status, awaiting, created_at, updated_at)
       VALUES (?1, ?2, ?3 || printf('%03d', (SELECT value FROM counters WHERE key = ?3)), ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?19)
       RETURNING id`,
      input.kind, year, prefix, a.id, dept?.id ?? null, input.contact || null, input.eventName, input.spentOn, input.purpose || null, input.currency,
      total, input.payMethod, input.payeeName || null, input.payeeAccount || null, input.receiptsStated, input.noReceiptReason || null,
      steps.length ? 'pending' : 'approved', steps[0] ?? null, t,
    ),
  ]);
  const id = (res[1].results as { id: number }[])[0].id;
  await db().batch([
    ...lines.map((l, i) =>
      stmt(`INSERT INTO finance_lines (request_id, sort, item, qty_c, unit_minor, total_minor, note) VALUES (?,?,?,?,?,?,?)`, id, i, l.item, l.qtyC, l.unitMinor, l.total, l.note || null),
    ),
    auditStmt(a.id, 'finance.create', 'finance', id, { kind: input.kind, total, currency: input.currency }, ip),
  ]);
  return id;
}

async function requesterOf(r: FinanceRow): Promise<{ isBudgetKeeper: boolean; role: Role }> {
  const u = await one<{ role: Role; k: number }>(`SELECT role, is_budget_keeper AS k FROM users WHERE id = ?`, r.requester_id);
  return { role: u!.role, isBudgetKeeper: u!.k === 1 };
}

export async function decideFinance(a: SessionUser, r: FinanceRow, decision: 'approve' | 'reject', reason: string, ip: string | null) {
  const actor = await financeActor(a);
  if (!P.canDecideMoney(actor, asFinanceLike(r))) throw new Denied();
  const t = now();
  const step = r.awaiting!;
  if (decision === 'reject') {
    // `awaiting` stays as it was: it names the step that said no
    if (!reason.trim()) throw new Error('comment-required');
    const upd = await stmt(
      `UPDATE finance_requests SET status = 'rejected', rejected_by = ?, rejected_at = ?, reject_reason = ?, updated_at = ?
        WHERE id = ? AND status = 'pending' AND awaiting = ?`,
      a.id, t, reason.trim(), t, r.id, step,
    ).run();
    if (!upd.meta.changes) throw new Conflict();
    await auditStmt(a.id, 'finance.reject', 'finance', r.id, { step }, ip).run();
    return;
  }
  const steps = P.financeSteps(await requesterOf(r));
  const next = steps[steps.indexOf(step) + 1] ?? null;
  const col = step === 'keeper' ? 'keeper' : 'president';
  const upd = await stmt(
    `UPDATE finance_requests SET ${col}_id = ?, ${col}_at = ?, awaiting = ?, status = ?, updated_at = ? WHERE id = ? AND status = 'pending' AND awaiting = ?`,
    a.id, t, next, next ? 'pending' : 'approved', t, r.id, step,
  ).run();
  if (!upd.meta.changes) throw new Conflict();
  await auditStmt(a.id, 'finance.approve', 'finance', r.id, { step }, ip).run();
}

/** «Санхүүгийн бүртгэлд»: the money given out (or received) — by the keeper, once approved. */
export async function recordFinance(a: SessionUser, r: FinanceRow, input: { paidMinor: number; paidOn: number }, ip: string | null) {
  const actor = await financeActor(a);
  if (!P.canRecordMoney(actor, asFinanceLike(r))) throw new Denied();
  const t = now();
  const upd = await stmt(
    `UPDATE finance_requests SET status = 'paid', paid_minor = ?, paid_on = ?, paid_by = ?, updated_at = ? WHERE id = ? AND status = 'approved'`,
    input.paidMinor, input.paidOn, a.id, t, r.id,
  ).run();
  if (!upd.meta.changes) throw new Conflict();
  await auditStmt(a.id, 'finance.paid', 'finance', r.id, { paid: input.paidMinor, currency: r.currency }, ip).run();
}

export async function cancelFinance(a: SessionUser, r: FinanceRow, ip: string | null) {
  if (!P.canCancelMoney(a, asFinanceLike(r))) throw new Denied();
  const t = now();
  const upd = await stmt(`UPDATE finance_requests SET status = 'cancelled', awaiting = NULL, updated_at = ? WHERE id = ? AND status = 'pending'`, t, r.id).run();
  if (!upd.meta.changes) throw new Conflict();
  await auditStmt(a.id, 'finance.cancel', 'finance', r.id, null, ip).run();
}

export async function addReceipt(a: SessionUser, r: FinanceRow, mediaId: string, ip: string | null) {
  const actor = await financeActor(a);
  if (!P.canAddReceipt(actor, asFinanceLike(r))) throw new Denied();
  await db().batch([
    stmt(`INSERT INTO finance_receipts (request_id, media_id, uploaded_by, created_at) VALUES (?,?,?,?)`, r.id, mediaId, a.id, now()),
    auditStmt(a.id, 'finance.receipt', 'finance', r.id, null, ip),
  ]);
}

/** A receipt leaves the request but stays in the database (who removed it and when). */
export async function removeReceipt(a: SessionUser, r: FinanceRow, receiptId: number, ip: string | null) {
  const actor = await financeActor(a);
  if (!P.canAddReceipt(actor, asFinanceLike(r))) throw new Denied();
  const upd = await stmt(
    `UPDATE finance_receipts SET removed_at = ?, removed_by = ? WHERE id = ? AND request_id = ? AND removed_at IS NULL`,
    now(), a.id, receiptId, r.id,
  ).run();
  if (!upd.meta.changes) throw new Conflict();
  await auditStmt(a.id, 'finance.receipt.remove', 'finance', r.id, null, ip).run();
}

/** A receipt photo, for someone who may read its request. */
export async function receiptMedia(receiptId: number): Promise<{ request_id: number; media_id: string } | null> {
  return one(`SELECT request_id, media_id FROM finance_receipts WHERE id = ? AND removed_at IS NULL`, receiptId);
}
