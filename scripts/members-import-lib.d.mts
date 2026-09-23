export interface ImportPerson {
  name: string;
  fullName: string | null;
  studentId: string | null;
  email: string;
  role: 'president' | 'board' | 'head' | 'member' | 'maintainer';
  dept: string | null;
  showPublic: boolean;
  line: number;
}
export const SCHOOL_DOMAIN: string;
export function splitCsvLine(line: string): string[];
export function parseMembers(text: string): { people: ImportPerson[]; skipped: string[]; errors: string[] };
export function termEndFor(nowMs?: number): number;
export function membersSql(people: ImportPerson[], nowMs?: number): string;
