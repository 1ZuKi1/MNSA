import { describe, expect, it } from 'vitest';
import { advance, formatNumber } from '../src/lib/workflow';
import { academicYear, fromLocal, termEnd, fmtDate } from '../src/lib/time';
import type { DeptSlug, Role, Step } from '../src/lib/types';

const u = (id: number, role: Role, dept: DeptSlug | null) => ({ id, role, dept, isDeputy: false });
const LETTER: Step[] = ['head', 'legal', 'president'];

describe('approval chain', () => {
  it("a member's letter waits for their дарга first", () => {
    expect(advance(LETTER, 0, u(4, 'member', 'dotood'), 'dotood')).toEqual({ index: 0, auto: [], done: false });
  });

  it("a дарга's own letter skips the head step and goes to Legal", () => {
    expect(advance(LETTER, 0, u(3, 'head', 'dotood'), 'dotood')).toEqual({ index: 1, auto: ['head'], done: false });
  });

  it("Legal's own letter skips head and legal, goes straight to the President", () => {
    expect(advance(LETTER, 0, u(9, 'head', 'erh-zui'), 'erh-zui')).toEqual({ index: 2, auto: ['head', 'legal'], done: false });
  });

  it("the President's letter still goes to Legal — Legal reviews every official letter", () => {
    const r = advance(LETTER, 0, u(1, 'president', 'udirdlaga'), 'udirdlaga');
    expect(r.index).toBe(1);
    expect(r.auto).toEqual([]); // head step doesn't apply to leadership; not recorded as auto
  });

  it('after Legal approves the President’s letter, it completes (president step is the author)', () => {
    expect(advance(LETTER, 2, u(1, 'president', 'udirdlaga'), 'udirdlaga')).toEqual({ index: 3, auto: ['president'], done: true });
  });

  it('a one-step report by a дарга is approved on submit', () => {
    expect(advance(['head'], 0, u(3, 'head', 'dotood'), 'dotood').done).toBe(true);
  });
});

describe('numbers and dates', () => {
  it('formats document numbers', () => {
    expect(formatNumber('ЭЗХ', '2026-2027', 14)).toBe('МОХ-ЭЗХ/2026-2027/014');
  });

  it('academic year flips on 1 September, Beijing time', () => {
    expect(academicYear(fromLocal('2026-08-31', '23:59'))).toBe('2025-2026');
    expect(academicYear(fromLocal('2026-09-01', '00:00'))).toBe('2026-2027');
  });

  it('accounts made any time in 2026–2027 expire at the end of September 2027', () => {
    expect(fmtDate(termEnd(fromLocal('2026-09-05')))).toBe('2027.09.30');
    expect(fmtDate(termEnd(fromLocal('2027-06-01')))).toBe('2027.09.30');
  });
});
