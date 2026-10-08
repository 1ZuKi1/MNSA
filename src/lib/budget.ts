/**
 * «Төсөв» — the association's budget, open to everyone on pkumongolia.com/tosov and kept on the staff site.
 * One budget per academic year: two headline numbers (planned, in hand) and the lines. A line is
 *   spent      — bought; the only kind that counts as spending;
 *   planned    — to buy («Авахаар төлөвлөсөн»), with a state (can buy · postponed · can't buy now) and maybe a
 *                quantity range (хуушуур 300–450 ш); it counts as spent only once the keeper marks it bought.
 * Spent and remaining are always summed from the lines, never stored.
 * Who may change it: permissions.ts (canKeepBudget / canSetBudgetKeeper). Every change is in the audit log.
 */
import { auditStmt, db, many, one, stmt } from './db';
import type { MemberRow } from './members';
import * as P from './permissions';
import { Denied } from './records';
import { academicYear, now } from './time';
import type { SessionUser } from './types';

export type ItemStatus = 'spent' | 'planned';
export type PlanState = 'can' | 'postponed' | 'cannot';
export const PLAN_STATES: PlanState[] = ['can', 'postponed', 'cannot'];
/** As the association's own sheet words it. */
export const PLAN_STATE_LABEL: Record<PlanState, string> = {
  can: 'Авах боломжтой',
  postponed: 'Хойшлуулсан',
  cannot: 'Авах боломжгүй',
};

export interface BudgetItem {
  id: number;
  status: ItemStatus;
  plan_state: PlanState | null;
  academic_year: string;
  spent_on: number;
  item: string;
  purpose: string | null;
  qty_c: number;
  /** The high end of a quantity range (planned lines); null when the quantity is exact. */
  qty_max_c: number | null;
  unit_fen: number;
  total_fen: number;
  total_max_fen: number | null;
  created_by: number;
  creator_name: string;
  created_at: number;
  deleted_at: number | null;
  deleter_name: string | null;
  delete_reason: string | null;
  confirmed_at: number | null;
}

export interface Budget {
  year: string;
  plannedFen: number;
  fundsFen: number;
  /** Summed from the spent lines that haven't been removed. */
  spentFen: number;
  /** In hand − spent. Negative means more was spent than there is. */
  remainingFen: number;
  /** Spent lines, oldest purchase first. */
  items: BudgetItem[];
  /** Purchases listed but not made yet, soonest first. Not in any spent sum. */
  toBuy: BudgetItem[];
  /** Their total — low and high end (equal unless some quantity is a range). */
  toBuyFen: number;
  toBuyMaxFen: number;
  /** What would be left once everything planned is bought: in hand − spent − to buy, at the low and the high end of the plan. */
  afterToBuyFen: number;
  afterToBuyMinFen: number;
  /** The last time anything about this year's budget changed (null: nothing recorded yet). */
  updatedAt: number | null;
  /** Whether the headline numbers have ever been filled in. */
  hasHeader: boolean;
}

export const YEAR = /^(\d{4})-(\d{4})$/;
/** "2026-2027" → "2026–2027" (en dash, as everywhere on the site). */
export const yearLabel = (y: string) => y.replace('-', '–');
export const isValidYear = (y: string) => {
  const m = YEAR.exec(y);
  return !!m && Number(m[2]) === Number(m[1]) + 1;
};

const ITEM_SELECT = `SELECT b.id, b.status, b.plan_state, b.confirmed_at, b.academic_year, b.spent_on, b.item, b.purpose,
                            b.qty_c, b.qty_max_c, b.unit_fen, b.total_fen, b.total_max_fen,
                            b.created_by, c.name_mn AS creator_name, b.created_at,
                            b.deleted_at, d.name_mn AS deleter_name, b.delete_reason
                       FROM budget_items b JOIN users c ON c.id = b.created_by LEFT JOIN users d ON d.id = b.deleted_by`;

/** The years that have a budget, newest first — always including the current one. */
export async function budgetYears(): Promise<string[]> {
  const rows = await many<{ y: string }>(
    `SELECT academic_year AS y FROM budget_years UNION SELECT academic_year FROM budget_items WHERE deleted_at IS NULL`,
  );
  return [...new Set([academicYear(), ...rows.map((r) => r.y)])].filter(isValidYear).sort().reverse();
}

/** One year's budget: the numbers and the live lines, oldest purchase first. One round trip. */
export async function loadBudget(year: string): Promise<Budget> {
  const [head, items] = (await db().batch([
    stmt(`SELECT planned_fen, funds_fen, updated_at FROM budget_years WHERE academic_year = ?`, year),
    stmt(`${ITEM_SELECT} WHERE b.academic_year = ? AND b.deleted_at IS NULL ORDER BY b.spent_on, b.id`, year),
  ])) as [D1Result<{ planned_fen: number; funds_fen: number; updated_at: number }>, D1Result<BudgetItem>];
  const h = head.results[0];
  const all = items.results;
  const list = all.filter((i) => i.status === 'spent');
  const toBuy = all.filter((i) => i.status === 'planned');
  const spentFen = list.reduce((s, i) => s + i.total_fen, 0);
  const toBuyFen = toBuy.reduce((s, i) => s + i.total_fen, 0);
  const toBuyMaxFen = toBuy.reduce((s, i) => s + (i.total_max_fen ?? i.total_fen), 0);
  const fundsFen = h?.funds_fen ?? 0;
  const touched = [h?.updated_at ?? 0, ...all.map((i) => Math.max(i.created_at, i.confirmed_at ?? 0))];
  const updatedAt = Math.max(...touched);
  return {
    year,
    plannedFen: h?.planned_fen ?? 0,
    fundsFen,
    spentFen,
    remainingFen: fundsFen - spentFen,
    items: list,
    toBuy,
    toBuyFen,
    toBuyMaxFen,
    afterToBuyFen: fundsFen - spentFen - toBuyFen,
    afterToBuyMinFen: fundsFen - spentFen - toBuyMaxFen,
    updatedAt: updatedAt > 0 ? updatedAt : null,
    hasHeader: !!h,
  };
}

/** Lines removed from the public table this year, newest removal first — staff only. */
export const removedItems = (year: string) =>
  many<BudgetItem>(`${ITEM_SELECT} WHERE b.academic_year = ? AND b.deleted_at IS NOT NULL ORDER BY b.deleted_at DESC`, year);

// ------------------------------------------------------------------ who keeps it

export async function isBudgetKeeper(userId: number): Promise<boolean> {
  const r = await one<{ k: number }>(`SELECT is_budget_keeper AS k FROM users WHERE id = ? AND status = 'active'`, userId);
  return r?.k === 1;
}

/** The current «Төсвийн хариуцагч»(-ууд). `publicOnly`: only those who show on the public team page. */
export const budgetKeepers = (publicOnly = false) =>
  many<{ id: number; name_mn: string }>(
    `SELECT id, name_mn FROM users WHERE is_budget_keeper = 1 AND status = 'active' AND role <> 'president' AND role <> 'maintainer'
       ${publicOnly ? 'AND show_public = 1' : ''} ORDER BY name_mn`,
  );

/** The actor as canKeepBudget sees them — the flag is read fresh, it is not part of the session. */
export async function budgetActor(a: SessionUser) {
  return { id: a.id, role: a.role, dept: a.dept, isDeputy: a.isDeputy, isBudgetKeeper: await isBudgetKeeper(a.id) };
}

export async function setBudgetKeeper(a: SessionUser, m: MemberRow, on: boolean, ip: string | null) {
  if (m.status !== 'active' || !P.canSetBudgetKeeper(a, { id: m.id, role: m.role, isDeputy: m.is_deputy === 1 })) throw new Denied();
  await db().batch([
    stmt(`UPDATE users SET is_budget_keeper = ? WHERE id = ?`, on ? 1 : 0, m.id),
    auditStmt(a.id, on ? 'budget.keeper' : 'budget.keeper.remove', 'user', m.id, { name: m.name_mn }, ip),
  ]);
}

// ------------------------------------------------------------------ changes (a «Төсвийн хариуцагч» only)

async function mustKeep(a: SessionUser) {
  if (!P.canKeepBudget(await budgetActor(a))) throw new Denied();
}

export interface ItemInput {
  /** 'planned': listed before buying; may be dated in the future. */
  status: ItemStatus;
  planState: PlanState | null;
  spentOn: number;
  item: string;
  purpose: string | null;
  qtyC: number;
  qtyMaxC: number | null;
  unitFen: number;
  totalFen: number;
  totalMaxFen: number | null;
}

export async function addItem(a: SessionUser, input: ItemInput, ip: string | null): Promise<number> {
  await mustKeep(a);
  const year = academicYear(input.spentOn);
  const t = now();
  const row = await stmt(
    `INSERT INTO budget_items (status, plan_state, academic_year, spent_on, item, purpose, qty_c, qty_max_c, unit_fen, total_fen, total_max_fen,
                               created_by, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id`,
    input.status,
    input.status === 'planned' ? (input.planState ?? 'can') : null,
    year,
    input.spentOn,
    input.item,
    input.purpose,
    input.qtyC,
    input.status === 'planned' ? input.qtyMaxC : null,
    input.unitFen,
    input.totalFen,
    input.status === 'planned' ? input.totalMaxFen : null,
    a.id,
    t,
  ).first<{ id: number }>();
  const action = input.status === 'planned' ? 'budget.plan' : 'budget.add';
  await auditStmt(a.id, action, 'budget_item', row!.id, {
    year, item: input.item, qty_c: input.qtyC, qty_max_c: input.qtyMaxC, unit_fen: input.unitFen, total_fen: input.totalFen,
  }, ip).run();
  return row!.id;
}

/**
 * A planned purchase was made: it becomes spent, with what it really cost and when. The plan's numbers are
 * kept in the audit log, so a public reader's earlier view can always be explained.
 */
export async function confirmItem(
  a: SessionUser,
  id: number,
  input: { spentOn: number; qtyC: number; unitFen: number; totalFen: number },
  ip: string | null,
): Promise<string> {
  await mustKeep(a);
  const it = await one<BudgetItem>(`${ITEM_SELECT} WHERE b.id = ?`, id);
  if (!it || it.deleted_at || it.status !== 'planned') throw new Denied();
  const year = academicYear(input.spentOn);
  const t = now();
  const res = await db().batch([
    stmt(
      `UPDATE budget_items SET status = 'spent', plan_state = NULL, qty_max_c = NULL, total_max_fen = NULL,
              academic_year = ?, spent_on = ?, qty_c = ?, unit_fen = ?, total_fen = ?, confirmed_by = ?, confirmed_at = ?
        WHERE id = ? AND status = 'planned' AND deleted_at IS NULL`,
      year, input.spentOn, input.qtyC, input.unitFen, input.totalFen, a.id, t, id,
    ),
    auditStmt(a.id, 'budget.confirm', 'budget_item', id, {
      item: it.item,
      planned: { qty_c: it.qty_c, qty_max_c: it.qty_max_c, unit_fen: it.unit_fen, total_fen: it.total_fen, total_max_fen: it.total_max_fen },
      bought: { qty_c: input.qtyC, unit_fen: input.unitFen, total_fen: input.totalFen },
    }, ip),
  ]);
  if (!res[0].meta.changes) throw new Denied(); // marked bought or removed a moment ago
  return year;
}

/** Can we buy it now? «Авах боломжтой» · «Хойшлуулсан» · «Авах боломжгүй» — planned lines only. */
export async function setPlanState(a: SessionUser, id: number, state: PlanState, ip: string | null) {
  await mustKeep(a);
  if (!PLAN_STATES.includes(state)) throw new Denied();
  const it = await one<BudgetItem>(`${ITEM_SELECT} WHERE b.id = ?`, id);
  if (!it || it.deleted_at || it.status !== 'planned') throw new Denied();
  if (it.plan_state === state) return;
  await db().batch([
    stmt(`UPDATE budget_items SET plan_state = ? WHERE id = ? AND status = 'planned' AND deleted_at IS NULL`, state, id),
    auditStmt(a.id, 'budget.state', 'budget_item', id, { item: it.item, from: it.plan_state, to: state }, ip),
  ]);
}

/** Takes a line off the public table. The row stays, marked with who removed it, when and why. */
export async function removeItem(a: SessionUser, id: number, reason: string | null, ip: string | null): Promise<BudgetItem> {
  await mustKeep(a);
  const it = await one<BudgetItem>(`${ITEM_SELECT} WHERE b.id = ?`, id);
  if (!it || it.deleted_at) throw new Denied();
  const t = now();
  await db().batch([
    stmt(`UPDATE budget_items SET deleted_by = ?, deleted_at = ?, delete_reason = ? WHERE id = ? AND deleted_at IS NULL`, a.id, t, reason, id),
    auditStmt(a.id, 'budget.remove', 'budget_item', id, { item: it.item, total_fen: it.total_fen, reason }, ip),
  ]);
  return it;
}

export async function setYearNumbers(
  a: SessionUser,
  year: string,
  input: { plannedFen: number; fundsFen: number },
  ip: string | null,
) {
  await mustKeep(a);
  if (!isValidYear(year)) throw new Denied();
  const before = await one<{ planned_fen: number; funds_fen: number }>(
    `SELECT planned_fen, funds_fen FROM budget_years WHERE academic_year = ?`,
    year,
  );
  const t = now();
  await db().batch([
    stmt(
      `INSERT INTO budget_years (academic_year, planned_fen, funds_fen, note, updated_by, updated_at) VALUES (?,?,?,NULL,?,?)
       ON CONFLICT(academic_year) DO UPDATE SET planned_fen = excluded.planned_fen, funds_fen = excluded.funds_fen,
         note = NULL, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      year,
      input.plannedFen,
      input.fundsFen,
      a.id,
      t,
    ),
    auditStmt(a.id, 'budget.year', 'budget_year', year, { from: before, to: { planned_fen: input.plannedFen, funds_fen: input.fundsFen } }, ip),
  ]);
}
