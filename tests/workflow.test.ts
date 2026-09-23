import { describe, expect, it } from 'vitest';
import { advance, formatNumber } from '../src/lib/workflow';
import { RECORD_TYPES } from '../src/lib/record-types';
import { academicYear, fromLocal, termEnd, fmtDate, fmtOfficial, fmtOfficialDate } from '../src/lib/time';
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

describe('the document types added from the President\'s form', () => {
  it('election material goes to Legal only, never to the President', () => {
    expect(RECORD_TYPES.songuuli.chain).toEqual(['legal']);
    expect(advance(RECORD_TYPES.songuuli.chain, 0, u(4, 'member', 'dotood'), 'dotood')).toEqual({ index: 0, auto: [], done: false });
  });

  it('a constitution amendment by Legal skips its own step and waits for the President', () => {
    expect(advance(RECORD_TYPES.durem.chain, 0, u(9, 'head', 'erh-zui'), 'erh-zui')).toEqual({ index: 1, auto: ['legal'], done: false });
  });

  it('an activity plan by a дарга goes straight to the President', () => {
    expect(advance(RECORD_TYPES.tolovlogoo.chain, 0, u(3, 'head', 'dotood'), 'dotood')).toEqual({ index: 1, auto: ['head'], done: false });
  });

  it('the official letter keeps its three-step chain', () => {
    expect(RECORD_TYPES['albn-bichig'].chain).toEqual(LETTER);
  });
});

describe('numbers and dates', () => {
  it('formats document numbers', () => {
    expect(formatNumber('ДХ', '2026-2027', 'Ж', 1)).toBe('МОХ-ДХ/2627/Ж/001'); // the President's own example
    expect(formatNumber('ЭЗХ', '2026-2027', 'ГЦ', 14)).toBe('МОХ-ЭЗХ/2627/ГЦ/014');
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

describe('the association\'s official date line', () => {
  it('writes the month ordinal with the right vowel', () => {
    expect(fmtOfficialDate('2025-12-23')).toBe('2025 оны 12 дугаар сарын 23');
    expect(fmtOfficialDate('2025-11-08')).toBe('2025 оны 11 дүгээр сарын 8');
    expect(fmtOfficialDate('2026-09-01')).toBe('2026 оны 9 дүгээр сарын 1');
    expect(fmtOfficialDate('2025-10-27')).toBe('2025 оны 10 дугаар сарын 27');
    expect(fmtOfficialDate('2026-04-02')).toBe('2026 оны 4 дүгээр сарын 2');
    expect(fmtOfficialDate('2026-01-15')).toBe('2026 оны 1 дүгээр сарын 15');
  });
  it('uses Beijing time for timestamps', () => {
    expect(fmtOfficial(fromLocal('2026-09-26', '00:30'))).toBe('2026 оны 9 дүгээр сарын 26');
  });
});

describe('every document type is complete', () => {
  it('has a unique type letter, a chain and signers that exist', () => {
    const codes = Object.values(RECORD_TYPES).map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const t of Object.values(RECORD_TYPES)) {
      expect(t.chain.length).toBeGreaterThan(0);
      for (const s of t.print.signers) {
        if ('step' in s) expect(t.chain).toContain(s.step);
        if ('field' in s) expect(t.fields.map((f) => f.name)).toContain(s.field);
      }
      for (const n of [...(t.print.meta ?? []), ...(t.print.plain ?? [])]) expect(t.fields.map((f) => f.name)).toContain(n);
      for (const f of t.fields) if (f.type === 'select') expect(f.options?.length).toBeGreaterThan(0);
    }
  });
});
