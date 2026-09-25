import { describe, expect, it } from 'vitest';
import * as P from '../src/lib/permissions';
import type { DeptSlug, Role } from '../src/lib/types';

const u = (id: number, role: Role, dept: DeptSlug | null, isDeputy = false) => ({ id, role, dept, isDeputy });

const president = u(1, 'president', 'udirdlaga');
const board = u(2, 'board', 'udirdlaga');
const dotoodHead = u(3, 'head', 'dotood');
const dotoodMember = u(4, 'member', 'dotood');
const dotoodMember2 = u(11, 'member', 'dotood');
const gadaadHead = u(5, 'head', 'gadaad');
const mediaHead = u(7, 'head', 'media');
const mediaMember = u(8, 'member', 'media');
const legalHead = u(9, 'head', 'erh-zui', true); // also the deputy
const maintainer = u(10, 'maintainer', null);

const rec = (over: Partial<P.RecordLike> = {}): P.RecordLike => ({
  authorId: dotoodMember.id,
  dept: 'dotood',
  status: 'in_review',
  visibility: 'staff',
  step: 'head',
  ...over,
});

describe('reading is open across departments', () => {
  it('any staff member can read a submitted record from another department', () => {
    expect(P.canReadRecord(gadaadHead, rec())).toBe(true);
    expect(P.canReadRecord(mediaMember, rec({ status: 'approved' }))).toBe(true);
    expect(P.canReadRecord(maintainer, rec({ status: 'approved' }))).toBe(true);
  });

  it('drafts are visible only to the author, their own дарга and the President', () => {
    const draft = rec({ status: 'draft' });
    expect(P.canReadRecord(dotoodMember, draft)).toBe(true);
    expect(P.canReadRecord(dotoodHead, draft)).toBe(true);
    expect(P.canReadRecord(president, draft)).toBe(true);
    expect(P.canReadRecord(dotoodMember2, draft)).toBe(false);
    expect(P.canReadRecord(gadaadHead, draft)).toBe(false);
    expect(P.canReadRecord(board, draft)).toBe(false);
  });

  it('dept-only records stay inside the department (plus board), except Legal while reviewing', () => {
    const secret = rec({ visibility: 'dept', status: 'approved', step: null });
    expect(P.canReadRecord(dotoodMember2, secret)).toBe(true);
    expect(P.canReadRecord(board, secret)).toBe(true);
    expect(P.canReadRecord(gadaadHead, secret)).toBe(false);
    expect(P.canReadRecord(maintainer, secret)).toBe(false);
    expect(P.canReadRecord(legalHead, secret)).toBe(false);
    expect(P.canReadRecord(legalHead, rec({ visibility: 'dept', step: 'legal' }))).toBe(true);
  });
});

describe('writing is walled by department', () => {
  const draft = rec({ status: 'draft' });

  it('a member edits only their own draft', () => {
    expect(P.canEditRecord(dotoodMember, draft)).toBe(true);
    expect(P.canEditRecord(dotoodMember2, draft)).toBe(false);
  });

  it('a дарга edits any draft in their own department and none elsewhere', () => {
    expect(P.canEditRecord(dotoodHead, draft)).toBe(true);
    expect(P.canEditRecord(gadaadHead, draft)).toBe(false);
  });

  it('Legal reviews other departments but never edits them', () => {
    expect(P.canEditRecord(legalHead, draft)).toBe(false);
  });

  it('nothing is editable once submitted; editable again after being sent back', () => {
    expect(P.canEditRecord(dotoodMember, rec({ status: 'in_review' }))).toBe(false);
    expect(P.canEditRecord(president, rec({ status: 'approved' }))).toBe(false);
    expect(P.canEditRecord(dotoodMember, rec({ status: 'rejected' }))).toBe(true);
  });

  it('the board may fix a sent-back document from any department (President decision, 2026-09)', () => {
    expect(P.canEditRecord(board, rec({ status: 'rejected', dept: 'gadaad' }))).toBe(true);
    expect(P.canEditRecord(gadaadHead, rec({ status: 'rejected', dept: 'dotood' }))).toBe(false);
  });

  it('the maintainer never edits content', () => {
    expect(P.canEditRecord(maintainer, draft)).toBe(false);
    expect(P.canCreateRecordIn(maintainer, 'dotood')).toBe(false);
  });

  it('you can only create in your own department (President and board anywhere)', () => {
    expect(P.canCreateRecordIn(dotoodMember, 'dotood')).toBe(true);
    expect(P.canCreateRecordIn(dotoodMember, 'gadaad')).toBe(false);
    expect(P.canCreateRecordIn(board, 'gadaad')).toBe(true);
  });
});

describe('approval steps', () => {
  it('only the right person decides each step; the President can stand in', () => {
    expect(P.canDecideStep(dotoodHead, rec({ step: 'head' }))).toBe(true);
    expect(P.canDecideStep(gadaadHead, rec({ step: 'head' }))).toBe(false);
    expect(P.canDecideStep(legalHead, rec({ step: 'legal' }))).toBe(true);
    expect(P.canDecideStep(dotoodHead, rec({ step: 'legal' }))).toBe(false);
    expect(P.canDecideStep(president, rec({ step: 'head' }))).toBe(true);
    expect(P.canDecideStep(board, rec({ step: 'president' }))).toBe(false);
  });

  it('nothing to decide unless in review', () => {
    expect(P.canDecideStep(president, rec({ status: 'approved' }))).toBe(false);
  });

  it('only the President voids an approved record', () => {
    expect(P.canVoidRecord(president, rec({ status: 'approved' }))).toBe(true);
    expect(P.canVoidRecord(board, rec({ status: 'approved' }))).toBe(false);
  });
});

describe('events: President and Media', () => {
  it('President and anyone in Media edit events; nobody else', () => {
    expect(P.canEditEvents(president)).toBe(true);
    expect(P.canEditEvents(mediaHead)).toBe(true);
    expect(P.canEditEvents(mediaMember)).toBe(true);
    expect(P.canEditEvents(board)).toBe(false);
    expect(P.canEditEvents(dotoodHead)).toBe(false);
    expect(P.canEditEvents(maintainer)).toBe(false);
  });

  it('the organising дарга can manage tasks for their own event only', () => {
    expect(P.canManageTasks(dotoodHead, 'dotood')).toBe(true);
    expect(P.canManageTasks(dotoodHead, 'gadaad')).toBe(false);
    expect(P.canManageTasks(dotoodMember, 'dotood')).toBe(false);
    expect(P.canManageTasks(mediaMember, 'gadaad')).toBe(true);
  });

  it('anyone who governs can take a task; the maintainer cannot', () => {
    expect(P.canTakeTask(dotoodMember)).toBe(true);
    expect(P.canTakeTask(maintainer)).toBe(false);
  });

  it('an assignee can finish their own task; others need task rights', () => {
    expect(P.canFinishAssignment(dotoodMember, dotoodMember.id, 'gadaad')).toBe(true);
    expect(P.canFinishAssignment(dotoodMember2, dotoodMember.id, 'gadaad')).toBe(false);
    expect(P.canFinishAssignment(mediaMember, dotoodMember.id, 'gadaad')).toBe(true);
  });

  it('participation report: President and board, plus everyone for themselves', () => {
    expect(P.canSeeParticipation(president)).toBe(true);
    expect(P.canSeeParticipation(board)).toBe(true);
    expect(P.canSeeParticipation(dotoodHead)).toBe(false);
    expect(P.canSeeParticipation(dotoodHead, dotoodHead.id)).toBe(true);
    expect(P.canSeeParticipation(dotoodHead, dotoodMember.id)).toBe(false);
  });
});

describe('members: President adds everyone, one deputy as backup', () => {
  it('President and the deputy manage members', () => {
    expect(P.canManageMembers(president)).toBe(true);
    expect(P.canManageMembers(legalHead)).toBe(true); // deputy
    expect(P.canManageMembers(dotoodHead)).toBe(false);
    expect(P.canManageMembers(u(99, 'maintainer', null, true))).toBe(false); // a maintainer can't be made deputy-powerful
  });

  it('nobody can grant the presidency; the deputy grants only heads and members', () => {
    expect(P.grantableRoles(president)).not.toContain('president');
    expect(P.grantableRoles(legalHead)).toEqual(['head', 'member']);
    expect(P.grantableRoles(dotoodHead)).toEqual([]);
  });

  it('never yourself, never the President; a deputy cannot touch board, maintainer or another deputy', () => {
    expect(P.canModifyMember(president, { id: president.id, role: 'president', isDeputy: false })).toBe(false);
    expect(P.canModifyMember(legalHead, { id: 1, role: 'president', isDeputy: false })).toBe(false);
    expect(P.canModifyMember(legalHead, { id: legalHead.id, role: 'head', isDeputy: true })).toBe(false);
    expect(P.canModifyMember(legalHead, { id: 2, role: 'board', isDeputy: false })).toBe(false);
    expect(P.canModifyMember(legalHead, { id: 10, role: 'maintainer', isDeputy: false })).toBe(false);
    expect(P.canModifyMember(legalHead, { id: 4, role: 'member', isDeputy: false })).toBe(true);
    expect(P.canModifyMember(president, { id: 10, role: 'maintainer', isDeputy: false })).toBe(true);
  });

  it('only the President names the deputy', () => {
    expect(P.canSetDeputy(president)).toBe(true);
    expect(P.canSetDeputy(legalHead)).toBe(false);
  });

  it('audit log: President, board, maintainer', () => {
    expect(P.canSeeAudit(maintainer)).toBe(true);
    expect(P.canSeeAudit(board)).toBe(true);
    expect(P.canSeeAudit(dotoodHead)).toBe(false);
  });
});

describe('settings', () => {
  it('only the President manages the official stamp', () => {
    expect(P.canManageSettings(president)).toBe(true);
    for (const a of [board, legalHead, dotoodHead, mediaMember, maintainer]) expect(P.canManageSettings(a)).toBe(false);
  });
});

describe('jobs («Ажлууд»)', () => {
  const job = (over: Partial<P.JobLike> = {}): P.JobLike => ({ dept: 'dotood', ownerId: dotoodMember.id, createdBy: dotoodHead.id, visibility: 'dept', ...over });

  it('only the department\'s дарга and the President add jobs', () => {
    expect(P.canCreateJobIn(dotoodHead, 'dotood')).toBe(true);
    expect(P.canCreateJobIn(dotoodHead, 'media')).toBe(false);
    expect(P.canCreateJobIn(president, 'gadaad')).toBe(true);
    expect(P.canCreateJobIn(dotoodMember, 'dotood')).toBe(false);
    expect(P.canCreateJobIn(board, 'media')).toBe(false);
    expect(P.canCreateJobIn(maintainer, 'dotood')).toBe(false);
  });

  it("a department's own job stays in the department and the leadership", () => {
    expect(P.canReadJob(dotoodMember2, job())).toBe(true);
    expect(P.canReadJob(board, job())).toBe(true);
    expect(P.canReadJob(mediaHead, job())).toBe(false);
    expect(P.canReadJob(maintainer, job())).toBe(false);
  });

  it('a job put on someone from another department is visible to them', () => {
    expect(P.canReadJob(mediaMember, job({ ownerId: mediaMember.id }))).toBe(true);
  });

  it('«Бүх гишүүд» jobs are open to everyone', () => {
    expect(P.canReadJob(mediaMember, job({ visibility: 'staff' }))).toBe(true);
    expect(P.canReadJob(maintainer, job({ visibility: 'staff' }))).toBe(true);
  });

  it('only the дарга and the President change a job; not the board, not another дарга', () => {
    expect(P.canEditJob(dotoodHead, job())).toBe(true);
    expect(P.canEditJob(president, job())).toBe(true);
    expect(P.canEditJob(board, job())).toBe(false);
    expect(P.canEditJob(gadaadHead, job({ visibility: 'staff' }))).toBe(false);
    expect(P.canEditJob(dotoodMember, job())).toBe(false);
  });

  it('the хариуцагч moves the job along; others do not', () => {
    expect(P.canUpdateJob(dotoodMember, job())).toBe(true);
    expect(P.canUpdateJob(dotoodMember2, job())).toBe(false);
    expect(P.canUpdateJob(gadaadHead, job({ visibility: 'staff' }))).toBe(false);
    expect(P.canUpdateJob(maintainer, job({ visibility: 'staff', ownerId: maintainer.id }))).toBe(false);
  });

  it('a job with nobody on it can be taken by anyone who sees it', () => {
    expect(P.canTakeJob(dotoodMember2, job({ ownerId: null }))).toBe(true);
    expect(P.canTakeJob(mediaMember, job({ ownerId: null }))).toBe(false);
    expect(P.canTakeJob(mediaMember, job({ ownerId: null, visibility: 'staff' }))).toBe(true);
    expect(P.canTakeJob(dotoodMember2, job())).toBe(false);
    expect(P.canTakeJob(maintainer, job({ ownerId: null, visibility: 'staff' }))).toBe(false);
  });
});
