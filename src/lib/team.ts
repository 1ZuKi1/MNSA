/** The public leadership page, generated from the members table — no one edits HTML when the team changes. */
import { many } from './db';
import { now } from './time';
import type { DeptSlug, Role } from './types';

export interface TeamMember {
  name: string;
  photo: string | null;
  role: Role;
  dept: DeptSlug | null;
  dept_name: string | null;
}

export async function publicTeam() {
  const rows = await many<TeamMember & { sort_order: number | null }>(
    `SELECT u.name_mn AS name, u.photo_id AS photo, u.role, d.slug AS dept, d.name_mn AS dept_name, d.sort_order
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.status = 'active' AND u.role <> 'maintainer' AND u.show_public = 1
        AND (u.term_ends_at IS NULL OR u.term_ends_at > ?)
      ORDER BY CASE u.role WHEN 'president' THEN 0 WHEN 'board' THEN 1 WHEN 'head' THEN 2 ELSE 3 END, u.name_mn`,
    now(),
  );
  return {
    president: rows.find((r) => r.role === 'president') ?? null,
    board: rows.filter((r) => r.role === 'board'),
    byDept: (slug: DeptSlug) => rows.filter((r) => r.dept === slug && (r.role === 'head' || r.role === 'member')),
  };
}

/** Everyone currently serving (for documents: signature lines, meeting attendance, duty letters). */
export interface StaffPerson {
  id: number;
  name: string;
  full_name: string | null;
  student_id: string | null;
  role: Role;
  dept: DeptSlug | null;
  dept_name: string | null;
  created_at: number;
  term_ends_at: number | null;
}
export async function staffTeam(): Promise<StaffPerson[]> {
  return many<StaffPerson>(
    `SELECT u.id, u.name_mn AS name, u.full_name, u.student_id, u.role, d.slug AS dept, d.name_mn AS dept_name, u.created_at, u.term_ends_at
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
      WHERE u.status = 'active' AND u.role <> 'maintainer' AND (u.term_ends_at IS NULL OR u.term_ends_at > ?)
      ORDER BY CASE u.role WHEN 'president' THEN 0 WHEN 'board' THEN 1 WHEN 'head' THEN 2 ELSE 3 END, d.sort_order, u.name_mn`,
    now(),
  );
}

/** "М. Эмүжин (Хэлтсийн дарга), Л. Бүрэнзаяа" — how the association lists a department on paper. */
export function deptLine(team: StaffPerson[], dept: DeptSlug): string {
  return team
    .filter((p) => p.dept === dept && (p.role === 'head' || p.role === 'member'))
    .map((p) => (p.role === 'head' ? `${p.name} (Хэлтсийн дарга)` : p.name))
    .join(', ');
}

/** "М. Эмүжин (Хэлтсийн дарга), Л. Бүрэнзаяа" → "М. Эмүжин" */

/** A department's colour token from base.css (avatars, cards). Without a department: the brand maroon. */
export const deptTint = (slug: string | null | undefined) => (slug ? `var(--dept-${slug}, var(--maroon))` : 'var(--maroon)');

export const initials = (name: string) =>
  name
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
