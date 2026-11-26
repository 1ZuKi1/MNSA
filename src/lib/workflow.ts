/** Pure approval-chain logic. Tested in tests/workflow.test.ts. */
import { isStepOwner, stepApplies } from './permissions';
import type { DeptSlug, SessionUser, Step } from './types';

type Author = Pick<SessionUser, 'id' | 'role' | 'dept' | 'isDeputy'>;

export interface Advance {
  /** Index of the step now waiting for a decision; === chain.length when fully approved. */
  index: number;
  /** Steps passed automatically because the author owns them (recorded as 'auto' actions). */
  auto: Step[];
  done: boolean;
}

/**
 * A document's own chain: its type's chain, plus the second department's дарга right after the main
 * дарга (or first, for a type without a дарга step) when it has a second department.
 */
export function chainFor(chain: Step[], coDept: DeptSlug | null): Step[] {
  if (!coDept) return chain;
  const at = chain.indexOf('head') + 1; // 0 when the type has no дарга step
  return [...chain.slice(0, at), 'cohead', ...chain.slice(at)];
}

/**
 * Starting at `from`, skip steps that don't apply to this department and steps the author owns
 * (a дарга doesn't approve their own letter), and stop at the first step that needs someone else.
 */
export function advance(chain: Step[], from: number, author: Author, dept: DeptSlug, coDept: DeptSlug | null = null): Advance {
  const auto: Step[] = [];
  let i = from;
  while (i < chain.length) {
    const s = chain[i];
    if (!stepApplies(s, dept, coDept)) {
      i++;
      continue;
    }
    if (isStepOwner(author, s, dept, coDept)) {
      auto.push(s);
      i++;
      continue;
    }
    break;
  }
  return { index: i, auto, done: i >= chain.length };
}

/** "2026-2027" → "2627" */
export const shortYear = (year: string) => year.replace(/^\d\d(\d\d)-\d\d(\d\d)$/, '$1$2');

/**
 * The President's format (2026-09-23): department code / academic year / document type / sequence,
 * e.g. МОХ-ДХ/2627/Ж/001. Each department numbers each type separately, starting again every year.
 */
export const numberPrefix = (deptCode: string, year: string, typeCode: string) => `МОХ-${deptCode}/${shortYear(year)}/${typeCode}/`;

export function formatNumber(deptCode: string, year: string, typeCode: string, seq: number): string {
  return numberPrefix(deptCode, year, typeCode) + String(seq).padStart(3, '0');
}

/** "МОХ-ДХ/2627/А/003" → { prefix: "МОХ-ДХ/2627/А/", seq: 3 }. Null for a number outside the system (a paper's «Ж-0003»). */
export function parseNumber(n: string | null): { prefix: string; seq: number } | null {
  const m = n ? /^(МОХ-[^/]+\/\d{4}\/[^/]+\/)(\d{3,})$/.exec(n) : null;
  return m ? { prefix: m[1], seq: Number(m[2]) } : null;
}

/**
 * What happens to a series when one approved number is deleted (President and Legal both agreed):
 * every later number in the same series moves down by one, so Т1 Т2 Т3 Т4 minus Т3 becomes Т1 Т2 Т3.
 * Returned lowest first, the order the updates must run in (each takes the number the previous one freed).
 */
export function renumberPlan(deleted: string, series: { id: number; number: string }[]): { id: number; from: string; to: string }[] {
  const d = parseNumber(deleted);
  if (!d) return [];
  return series
    .map((r) => ({ r, p: parseNumber(r.number) }))
    .filter((x): x is { r: { id: number; number: string }; p: { prefix: string; seq: number } } => !!x.p && x.p.prefix === d.prefix && x.p.seq > d.seq)
    .sort((a, b) => a.p.seq - b.p.seq)
    .map(({ r, p }) => ({ id: r.id, from: r.number, to: d.prefix + String(p.seq - 1).padStart(3, '0') }));
}
