export type Role = 'president' | 'board' | 'head' | 'member' | 'maintainer';

export type DeptSlug = 'udirdlaga' | 'dotood' | 'gadaad' | 'surgalt' | 'media' | 'erh-zui';

/** The logged-in person, as every permission check sees them. */
export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  dept: DeptSlug | null;
  deptId: number | null;
  isDeputy: boolean;
  termEndsAt: number | null;
}

export type RecordStatus = 'draft' | 'in_review' | 'approved' | 'rejected' | 'void';
export type Visibility = 'staff' | 'dept';
export type Step = 'head' | 'legal' | 'president';

export const ROLE_LABEL: Record<Role, string> = {
  president: 'Тэргүүн',
  board: 'Удирдах зөвлөлийн гишүүн',
  head: 'Хэлтсийн дарга',
  member: 'Гишүүн',
  maintainer: 'Техникийн хариуцагч',
};

export const STATUS_LABEL: Record<RecordStatus, string> = {
  draft: 'Ноорог',
  in_review: 'Хянагдаж буй',
  approved: 'Батлагдсан',
  rejected: 'Буцаагдсан',
  void: 'Хүчингүй',
};

export const STEP_LABEL: Record<Step, string> = {
  head: 'Хэлтсийн дарга',
  legal: 'Эрх зүйн хэлтэс',
  president: 'Тэргүүн',
};

/** Genitive forms — Mongolian doesn't let you just append «-ийн» to a label. */
export const STEP_GEN: Record<Step, string> = {
  head: 'Хэлтсийн даргын',
  legal: 'Эрх зүйн хэлтсийн',
  president: 'Тэргүүний',
};
