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
 * Starting at `from`, skip steps that don't apply to this department and steps the author owns
 * (a дарга doesn't approve their own letter), and stop at the first step that needs someone else.
 */
export function advance(chain: Step[], from: number, author: Author, dept: DeptSlug): Advance {
  const auto: Step[] = [];
  let i = from;
  while (i < chain.length) {
    const s = chain[i];
    if (!stepApplies(s, dept)) {
      i++;
      continue;
    }
    if (isStepOwner(author, s, dept)) {
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
