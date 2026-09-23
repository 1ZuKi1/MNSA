/**
 * Every permission decision in the system lives in this file, as pure functions.
 * Pages and queries call these; nothing else decides who may do what.
 * Tested in tests/permissions.test.ts.
 *
 * The rules, in one paragraph:
 *   Reading is open across departments; writing is walled by department.
 *   The President sees and does everything except remove themselves.
 *   Legal (Эрх зүйн хэлтэс) reviews every department's official letters but cannot edit them.
 *   Events belong to the President and the Media department.
 *   The maintainer can read, but governs nothing.
 *   The official stamp is the President's alone.
 */
import type { DeptSlug, RecordStatus, Role, SessionUser, Step, Visibility } from './types';

export const LEGAL: DeptSlug = 'erh-zui';
export const MEDIA: DeptSlug = 'media';
export const LEADERSHIP: DeptSlug = 'udirdlaga';

type Actor = Pick<SessionUser, 'id' | 'role' | 'dept' | 'isDeputy'>;

export interface RecordLike {
  authorId: number;
  dept: DeptSlug;
  status: RecordStatus;
  visibility: Visibility;
  /** Current approval step, when in review. */
  step?: Step | null;
}

const isPresident = (a: Actor) => a.role === 'president';
const isBoard = (a: Actor) => a.role === 'board';
const governs = (a: Actor) => a.role !== 'maintainer';

// ------------------------------------------------------------------ records

export function canCreateRecordIn(a: Actor, dept: DeptSlug): boolean {
  if (!governs(a)) return false;
  if (isPresident(a) || isBoard(a)) return true;
  return a.dept === dept;
}

export function canReadRecord(a: Actor, r: RecordLike): boolean {
  if (r.authorId === a.id) return true;
  if (isPresident(a)) return true;

  // Drafts are work in progress: author, their own дарга, and the President.
  if (r.status === 'draft') return a.role === 'head' && a.dept === r.dept;

  if (r.visibility === 'dept') {
    if (a.dept === r.dept || isBoard(a)) return true;
    // Legal must see what it is asked to review.
    return r.step === 'legal' && isLegalHead(a);
  }
  // Open across departments — including the maintainer.
  return true;
}

/** Content edits. Only while a draft, or after being sent back. */
export function canEditRecord(a: Actor, r: RecordLike): boolean {
  if (!governs(a)) return false;
  if (r.status !== 'draft' && r.status !== 'rejected') return false;
  if (isPresident(a) || isBoard(a)) return true;
  if (a.dept !== r.dept) return false; // ← the wall
  if (a.role === 'head') return true;
  return r.authorId === a.id;
}

export const canSubmitRecord = canEditRecord;

export function canWithdrawRecord(a: Actor, r: RecordLike): boolean {
  if (r.status !== 'in_review') return false;
  if (isPresident(a)) return true;
  return r.authorId === a.id || (a.role === 'head' && a.dept === r.dept);
}

export function canVoidRecord(a: Actor, r: RecordLike): boolean {
  return r.status === 'approved' && isPresident(a);
}

export function isLegalHead(a: Actor): boolean {
  return a.role === 'head' && a.dept === LEGAL;
}

/** Strict: is this person the one the step is addressed to? (Used for auto-skipping on submit.) */
export function isStepOwner(a: Actor, step: Step, recordDept: DeptSlug): boolean {
  switch (step) {
    case 'head':
      return a.role === 'head' && a.dept === recordDept;
    case 'legal':
      return isLegalHead(a);
    case 'president':
      return isPresident(a);
  }
}

/** A step with no one to address it is skipped: the leadership "department" has no дарга. */
export function stepApplies(step: Step, recordDept: DeptSlug): boolean {
  return !(step === 'head' && recordDept === LEADERSHIP);
}

/** May act (approve / send back) on the current step. The President can stand in for any step. */
export function canDecideStep(a: Actor, r: RecordLike): boolean {
  if (r.status !== 'in_review' || !r.step) return false;
  return isStepOwner(a, r.step, r.dept) || isPresident(a);
}

// ------------------------------------------------------------------ events

export function canEditEvents(a: Actor): boolean {
  return isPresident(a) || (governs(a) && a.dept === MEDIA);
}

export function canManageTasks(a: Actor, eventDept: DeptSlug | null): boolean {
  if (canEditEvents(a)) return true;
  return a.role === 'head' && eventDept !== null && a.dept === eventDept;
}

export function canTakeTask(a: Actor): boolean {
  return governs(a);
}

export function canFinishAssignment(a: Actor, assigneeId: number, eventDept: DeptSlug | null): boolean {
  return assigneeId === a.id || canManageTasks(a, eventDept);
}

/** The yearly "who took which jobs" report. Everyone may always see their own row. */
export function canSeeParticipation(a: Actor, ofUserId?: number): boolean {
  if (ofUserId !== undefined && ofUserId === a.id) return true;
  return isPresident(a) || isBoard(a);
}

// ------------------------------------------------------------------ members

export function canManageMembers(a: Actor): boolean {
  return isPresident(a) || (governs(a) && a.isDeputy);
}

/** Roles this person may hand out. Nobody hands out "president" — only the handover does. */
export function grantableRoles(a: Actor): Role[] {
  if (isPresident(a)) return ['board', 'head', 'member', 'maintainer'];
  if (canManageMembers(a)) return ['head', 'member'];
  return [];
}

export interface MemberLike {
  id: number;
  role: Role;
  isDeputy: boolean;
}

/** May change or remove this account. Never your own; never the President's; a deputy only touches heads and members. */
export function canModifyMember(a: Actor, target: MemberLike): boolean {
  if (!canManageMembers(a)) return false;
  if (target.id === a.id) return false;
  if (target.role === 'president') return false;
  if (isPresident(a)) return true;
  return (target.role === 'head' || target.role === 'member') && !target.isDeputy;
}

export function canSetDeputy(a: Actor): boolean {
  return isPresident(a);
}

export function canSeeAudit(a: Actor): boolean {
  return isPresident(a) || isBoard(a) || a.role === 'maintainer';
}

// ------------------------------------------------------------------ settings

/** The official stamp (and any future association-wide setting) belongs to the President alone. */
export function canManageSettings(a: Actor): boolean {
  return isPresident(a);
}
