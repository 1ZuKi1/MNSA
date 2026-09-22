/** The public leadership page, generated from the members table — no one edits HTML when the team changes. */
import { many } from './db';
import { now } from './time';
import type { DeptSlug, Role } from './types';

export interface TeamMember {
  name: string;
  role: Role;
  dept: DeptSlug | null;
  dept_name: string | null;
}

export async function publicTeam() {
  const rows = await many<TeamMember & { sort_order: number | null }>(
    `SELECT u.name_mn AS name, u.role, d.slug AS dept, d.name_mn AS dept_name, d.sort_order
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

/** "Б. Тэмүүлэн" → "БТ" */
export const initials = (name: string) =>
  name
    .replace(/\./g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
