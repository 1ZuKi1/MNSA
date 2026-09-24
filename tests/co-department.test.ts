import { describe, expect, it } from 'vitest';
import * as P from '../src/lib/permissions';
import { advance, chainFor } from '../src/lib/workflow';
import type { DeptSlug, Role, Step } from '../src/lib/types';

const u = (id: number, role: Role, dept: DeptSlug | null) => ({ id, role, dept, isDeputy: false });
const president = u(1, 'president', 'udirdlaga');
const dotoodMember = u(4, 'member', 'dotood');
const dotoodHead = u(3, 'head', 'dotood');
const gadaadHead = u(5, 'head', 'gadaad');
const gadaadMember = u(6, 'member', 'gadaad');
const mediaHead = u(7, 'head', 'media');

const LETTER: Step[] = ['head', 'legal', 'president'];

describe('a second department joins the chain', () => {
  it('its дарга comes right after the main дарга', () => {
    expect(chainFor(LETTER, 'gadaad')).toEqual(['head', 'cohead', 'legal', 'president']);
  });
  it('comes first for a type without a дарга step', () => {
    expect(chainFor(['president'], 'gadaad')).toEqual(['cohead', 'president']);
  });
  it('changes nothing without a second department', () => {
    expect(chainFor(LETTER, null)).toEqual(LETTER);
  });
  it("a member's joint letter waits for their own дарга, then the other дарга", () => {
    const chain = chainFor(LETTER, 'gadaad');
    expect(advance(chain, 0, dotoodMember, 'dotood', 'gadaad')).toEqual({ index: 0, auto: [], done: false });
    expect(advance(chain, 1, dotoodMember, 'dotood', 'gadaad').index).toBe(1); // cohead
  });
  it('a дарга of both is not asked twice: their own step passes automatically', () => {
    const chain = chainFor(LETTER, 'gadaad');
    expect(advance(chain, 0, gadaadHead, 'dotood', 'gadaad')).toEqual({ index: 0, auto: [], done: false });
    expect(advance(chain, 1, gadaadHead, 'dotood', 'gadaad')).toEqual({ index: 2, auto: ['cohead'], done: false });
  });
  it('leadership as the second department adds no step (it has no дарга)', () => {
    expect(P.stepApplies('cohead', 'dotood', 'udirdlaga')).toBe(false);
    const chain = chainFor(LETTER, 'udirdlaga');
    expect(advance(chain, 1, dotoodMember, 'dotood', 'udirdlaga').index).toBe(2); // straight to legal
  });
});

describe('who decides the second step', () => {
  const joint = { authorId: dotoodMember.id, dept: 'dotood' as DeptSlug, coDept: 'gadaad' as DeptSlug, status: 'in_review' as const, visibility: 'staff' as const, step: 'cohead' as Step };
  it("the second department's дарга, not the main one", () => {
    expect(P.canDecideStep(gadaadHead, joint)).toBe(true);
    expect(P.canDecideStep(dotoodHead, joint)).toBe(false);
    expect(P.canDecideStep(mediaHead, joint)).toBe(false);
  });
  it('the President can stand in, as for any step', () => {
    expect(P.canDecideStep(president, joint)).toBe(true);
  });
});

describe('the second department reads it as its own', () => {
  const deptOnly = { authorId: dotoodMember.id, dept: 'dotood' as DeptSlug, coDept: 'gadaad' as DeptSlug, status: 'approved' as const, visibility: 'dept' as const };
  it('a «department only» document is open to both departments', () => {
    expect(P.canReadRecord(gadaadMember, deptOnly)).toBe(true);
    expect(P.canReadRecord(mediaHead, deptOnly)).toBe(false);
  });
  it('but editing stays with the main department', () => {
    const draft = { ...deptOnly, status: 'draft' as const };
    expect(P.canEditRecord(gadaadHead, draft)).toBe(false);
    expect(P.canEditRecord(dotoodHead, draft)).toBe(true);
  });
});
