import { describe, expect, it } from 'vitest';
import { fmtQty, fmtYuan, hundredthsInput, lineTotal, parseMoney, parseQty, percentOf } from '../src/lib/money';
import { readBudgetItemForm, readBudgetYearForm } from '../src/lib/forms';

describe('typed amounts', () => {
  it('reads what people actually type', () => {
    expect(parseMoney('1250')).toBe(125000);
    expect(parseMoney('1 250')).toBe(125000);
    expect(parseMoney('1,250')).toBe(125000);
    expect(parseMoney('1,250.50')).toBe(125050);
    expect(parseMoney('12.5')).toBe(1250);
    expect(parseMoney('12,5')).toBe(1250);
    expect(parseMoney('12,50')).toBe(1250);
    expect(parseMoney('¥ 80')).toBe(8000);
    expect(parseMoney('0')).toBe(0);
  });
  it('refuses anything that is not a plain amount with at most two decimals', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1,2,3', '12.', '1e5', '١٢', '5¥', '99999999999']) expect(parseMoney(bad)).toBeNull();
  });
  it('a quantity must be more than zero', () => {
    expect(parseQty('3')).toBe(300);
    expect(parseQty('2.5')).toBe(250);
    expect(parseQty('0')).toBeNull();
    expect(parseQty('0.00')).toBeNull();
    expect(parseQty('20000')).toBeNull(); // above 10,000 of one thing
  });
});

describe('totals never pick up float noise', () => {
  it('quantity × price of one, to the fen', () => {
    expect(lineTotal(300, 1550)).toBe(4650); // 3 × 15.50
    expect(lineTotal(250, 333)).toBe(833); // 2.5 × 3.33 = 8.325 → 8.33
    expect(lineTotal(10, 10)).toBe(1); // 0.1 × 0.10
    expect(lineTotal(100, 30) + lineTotal(100, 10) + lineTotal(100, 20)).toBe(60);
  });
});

describe('formatting', () => {
  it('yuan, with and without cents', () => {
    expect(fmtYuan(125000)).toBe('¥1,250');
    expect(fmtYuan(125050)).toBe('¥1,250.50');
    expect(fmtYuan(125000, 'always')).toBe('¥1,250.00');
    expect(fmtYuan(-12000)).toBe('−¥120');
    expect(fmtYuan(0)).toBe('¥0');
    expect(fmtYuan(100000000)).toBe('¥1,000,000');
  });
  it('quantities', () => {
    expect(fmtQty(300)).toBe('3');
    expect(fmtQty(250)).toBe('2.5');
    expect(fmtQty(25)).toBe('0.25');
    expect(fmtQty(120000)).toBe('1,200');
  });
  it('a stored value goes back into a form box as typed digits', () => {
    expect(hundredthsInput(125050)).toBe('1250.5');
    expect(hundredthsInput(125000)).toBe('1250');
    expect(hundredthsInput(null)).toBe('');
    expect(parseMoney(hundredthsInput(125055))).toBe(125055);
  });
  it('percent of the plan', () => {
    expect(percentOf(5000, 10000)).toBe(50);
    expect(percentOf(0, 0)).toBe(0);
    expect(percentOf(10, 0)).toBe(100);
    expect(percentOf(15000, 10000)).toBe(150);
  });
});

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe('the budget line form', () => {
  const today = '2026-10-08';
  it('computes the total itself', () => {
    const r = readBudgetItemForm(fd({ date: '2026-10-05', item: 'Сагсан бөмбөг', purpose: '', qty: '2', unit: '189' }), today);
    expect(r.ok).toBe(true);
    expect(r.input).toMatchObject({ item: 'Сагсан бөмбөг', purpose: null, qtyC: 200, unitFen: 18900, totalFen: 37800 });
  });
  it('a total typed into the form is ignored', () => {
    const r = readBudgetItemForm(fd({ date: '2026-10-05', item: 'Ус', qty: '2', unit: '3.5', total: '999999' }), today);
    expect(r.input?.totalFen).toBe(700);
  });
  it('lists every problem at once', () => {
    const r = readBudgetItemForm(fd({ date: '2026-10-09', item: '', qty: '0', unit: 'үнэгүй' }), today);
    expect(r.ok).toBe(false);
    expect(Object.keys(r.errors).sort()).toEqual(['date', 'item', 'qty', 'unit']);
    expect(r.errors.date).toMatch(/Ирээдүйн/);
  });
  it('the headline numbers may be left empty (zero)', () => {
    expect(readBudgetYearForm(fd({ planned: '', funds: '', note: '' })).input).toEqual({ plannedFen: 0, fundsFen: 0, note: null });
    expect(readBudgetYearForm(fd({ planned: '15,000', funds: '12000.5', note: ' ЭСЯ ' })).input).toEqual({ plannedFen: 1500000, fundsFen: 1200050, note: 'ЭСЯ' });
    expect(readBudgetYearForm(fd({ planned: '-1', funds: '0' })).ok).toBe(false);
  });
});
