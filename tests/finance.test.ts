import { describe, expect, it } from 'vitest';
import { readFinanceForm } from '../src/lib/forms';
import { fmtMoney } from '../src/lib/money';
import * as P from '../src/lib/permissions';

const person = (id: number, role: P.FinanceActor['role'], keeper = false): P.FinanceActor => ({ id, role, dept: role === 'president' || role === 'board' ? 'udirdlaga' : 'media', isDeputy: false, isBudgetKeeper: keeper });
const president = person(1, 'president');
const board = person(2, 'board');
const keeper = person(3, 'member', true);
const member = person(4, 'member');
const other = person(5, 'head');
const maintainer = person(9, 'maintainer');
const req = (over: Partial<P.FinanceLike> = {}): P.FinanceLike => ({ requesterId: member.id, status: 'pending', awaiting: 'keeper', ...over });

describe('money: who decides', () => {
  it('needs the keeper, then the President', () => {
    expect(P.financeSteps({ role: 'member', isBudgetKeeper: false })).toEqual(['keeper', 'president']);
  });
  it('never lets anyone decide their own request', () => {
    expect(P.financeSteps({ role: 'member', isBudgetKeeper: true })).toEqual(['president']);
    expect(P.financeSteps({ role: 'president', isBudgetKeeper: false })).toEqual(['keeper']);
    expect(P.canDecideMoney(keeper, req({ requesterId: keeper.id }))).toBe(false);
  });
  it('gives each step to its owner only', () => {
    expect(P.canDecideMoney(keeper, req())).toBe(true);
    expect(P.canDecideMoney(president, req())).toBe(false);
    expect(P.canDecideMoney(president, req({ awaiting: 'president' }))).toBe(true);
    expect(P.canDecideMoney(maintainer, req({ awaiting: 'president' }))).toBe(false);
    expect(P.canDecideMoney(board, req())).toBe(false);
    expect(P.canDecideMoney(keeper, req({ status: 'approved', awaiting: null }))).toBe(false);
  });
  it('lets only the keeper record the money, once approved', () => {
    expect(P.canRecordMoney(keeper, req({ status: 'approved', awaiting: null }))).toBe(true);
    expect(P.canRecordMoney(president, req({ status: 'approved', awaiting: null }))).toBe(false);
    expect(P.canRecordMoney(keeper, req())).toBe(false);
  });
});

describe('money: who reads', () => {
  it('shows a request to its requester and to those who handle money', () => {
    for (const a of [member, keeper, president, board, maintainer]) expect(P.canReadMoney(a, req())).toBe(true);
    expect(P.canReadMoney(other, req())).toBe(false);
  });
  it('lets the requester withdraw only while it waits', () => {
    expect(P.canCancelMoney(member, req())).toBe(true);
    expect(P.canCancelMoney(member, req({ status: 'approved', awaiting: null }))).toBe(false);
    expect(P.canCancelMoney(keeper, req())).toBe(false);
  });
  it('the maintainer reads but does not ask', () => {
    expect(P.canRequestMoney(maintainer)).toBe(false);
    expect(P.canRequestMoney(member)).toBe(true);
  });
});

describe('money: the form', () => {
  const fd = (o: [string, string][]) => {
    const f = new FormData();
    for (const [k, v] of o) f.append(k, v);
    return f;
  };
  const base: [string, string][] = [['kind', 'reimburse'], ['event', 'Соёлын өдөрлөг'], ['date', '2026-10-09'], ['currency', 'CNY'], ['receipts', 'yes'], ['receipts_count', '2']];
  it('keeps the typed lines and drops the empty rows', () => {
    const r = readFinanceForm(fd([...base, ['line_item', 'Плакат'], ['line_qty', '2'], ['line_unit', '45.50'], ['line_note', ''], ['line_item', ''], ['line_qty', '1'], ['line_unit', ''], ['line_note', '']]));
    expect(r.ok).toBe(true);
    expect(r.input!.lines).toEqual([{ item: 'Плакат', qtyC: 200, unitMinor: 4550, note: '' }]);
  });
  it('needs at least one line, and a reason when a reimbursement has no receipt', () => {
    expect(readFinanceForm(fd(base)).errors.lines).toBeTruthy();
    const r = readFinanceForm(fd([['kind', 'reimburse'], ['event', 'x'], ['date', '2026-10-09'], ['currency', 'CNY'], ['receipts', 'no'], ['line_item', 'x'], ['line_qty', '1'], ['line_unit', '1']]));
    expect(r.errors.no_receipt_reason).toBeTruthy();
  });
  it('takes another currency typed in short', () => {
    const r = readFinanceForm(fd([['kind', 'income'], ['event', 'x'], ['date', '2026-10-09'], ['currency', 'other'], ['currency_other', 'usd'], ['line_item', 'x'], ['line_qty', '1'], ['line_unit', '5']]));
    expect(r.input!.currency).toBe('USD');
  });
  it('writes money in its own currency', () => {
    expect(fmtMoney(10100, 'CNY')).toBe('¥101');
    expect(fmtMoney(10000000, 'MNT')).toBe('₮100,000');
    expect(fmtMoney(3550, 'USD')).toBe('35.50 USD');
    expect(fmtMoney(-12000, 'CNY')).toBe('−¥120');
  });
});
