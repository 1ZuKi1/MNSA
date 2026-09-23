/**
 * Pure helpers for scripts/import-members.mjs: read the members list (CSV), check it, and turn it into SQL.
 * No I/O here, so tests/import.test.ts can exercise every rule.
 *
 * The CSV (UTF-8, comma-separated, first non-comment line is the header, lines starting with # ignored):
 *
 *   name,full_name,student_id,email,role,dept,public
 *   М. Эмүжин,Мягмарбаатар Эмүжин,2500093207,,head,gadaad,yes
 *
 *   name        shown on the site («М. Эмүжин»)                                     required
 *   full_name   as on official papers («Мягмарбаатар Эмүжин»)                       optional
 *   student_id  digits only                                                          optional
 *   email       login address; empty → <student_id>@stu.pku.edu.cn                  one of the two required
 *   role        president | board | head | member | maintainer (Mongolian labels also accepted)
 *   dept        dotood | gadaad | surgalt | media | erh-zui | udirdlaga (Mongolian names also accepted)
 *               empty → udirdlaga for president/board, none for maintainer
 *   public      yes / no — shown on the public «Удирдлагын баг» page (default yes)
 */

export const SCHOOL_DOMAIN = 'stu.pku.edu.cn';

const ROLES = {
  president: 'president', 'тэргүүн': 'president',
  board: 'board', 'удирдах зөвлөлийн гишүүн': 'board', 'удирдах зөвлөл': 'board',
  head: 'head', 'хэлтсийн дарга': 'head',
  member: 'member', 'хэлтсийн гишүүн': 'member', 'гишүүн': 'member',
  maintainer: 'maintainer', 'техникийн хариуцагч': 'maintainer',
};
const DEPTS = {
  udirdlaga: 'udirdlaga', 'удирдлага': 'udirdlaga',
  dotood: 'dotood', 'дотоод хэлтэс': 'dotood', 'дотоод': 'dotood',
  gadaad: 'gadaad', 'гадаад хэлтэс': 'gadaad', 'гадаад': 'gadaad',
  surgalt: 'surgalt', 'сургалтын хэлтэс': 'surgalt', 'сургалт': 'surgalt',
  media: 'media', 'медиа хэлтэс': 'media', 'медиа': 'media',
  'erh-zui': 'erh-zui', 'эрх зүйн хэлтэс': 'erh-zui', 'эрх зүй': 'erh-zui',
};
const YES = new Set(['', 'yes', 'y', 'true', '1', 'тийм']);
const NO = new Set(['no', 'n', 'false', '0', 'үгүй']);

/** Split one CSV line, honouring "quoted, fields" and "" escapes. */
export function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse and check the whole file. Returns { people, skipped, errors }.
 * `errors` non-empty means nothing may be imported.
 */
export function parseMembers(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map((l, i) => ({ l: l.trim(), n: i + 1 })).filter((x) => x.l && !x.l.startsWith('#'));
  const errors = [];
  const skipped = [];
  const people = [];
  if (!lines.length) return { people, skipped, errors: ['The file is empty.'] };

  const header = splitCsvLine(lines[0].l).map((h) => h.toLowerCase());
  const col = (name) => header.indexOf(name);
  for (const need of ['name', 'role']) if (col(need) < 0) errors.push(`Header is missing the "${need}" column.`);
  if (errors.length) return { people, skipped, errors };
  const get = (cells, name) => (col(name) >= 0 ? (cells[col(name)] ?? '').trim() : '');

  const emails = new Map();
  for (const { l, n } of lines.slice(1)) {
    const c = splitCsvLine(l);
    const name = get(c, 'name');
    const where = `line ${n}${name ? ` (${name})` : ''}`;
    if (!name) { errors.push(`${where}: name is empty.`); continue; }

    const role = ROLES[get(c, 'role').toLowerCase()];
    if (!role) { errors.push(`${where}: unknown role "${get(c, 'role')}".`); continue; }

    const rawDept = get(c, 'dept').toLowerCase();
    let dept = rawDept ? DEPTS[rawDept] : role === 'president' || role === 'board' ? 'udirdlaga' : null;
    if (rawDept && !dept) { errors.push(`${where}: unknown department "${get(c, 'dept')}".`); continue; }
    if (role === 'maintainer') dept = null;
    if ((role === 'head' || role === 'member') && (!dept || dept === 'udirdlaga')) { errors.push(`${where}: a ${role} needs one of the five departments.`); continue; }

    const studentId = get(c, 'student_id');
    if (studentId && !/^\d{6,12}$/.test(studentId)) { errors.push(`${where}: student ID must be 6–12 digits.`); continue; }

    let email = get(c, 'email').toLowerCase();
    if (!email && studentId) email = `${studentId}@${SCHOOL_DOMAIN}`;
    if (!email) { skipped.push(`${where}: no e-mail and no student ID — invite this person from the site instead.`); continue; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) { errors.push(`${where}: "${email}" is not an e-mail address.`); continue; }
    if (emails.has(email)) { errors.push(`${where}: e-mail ${email} is also on line ${emails.get(email)}.`); continue; }
    emails.set(email, n);

    const pub = get(c, 'public').toLowerCase();
    if (!YES.has(pub) && !NO.has(pub)) { errors.push(`${where}: public must be yes or no.`); continue; }

    people.push({ name, fullName: get(c, 'full_name') || null, studentId: studentId || null, email, role, dept, showPublic: !NO.has(pub), line: n });
  }
  if (people.filter((p) => p.role === 'president').length > 1) errors.push('More than one president in the file.');
  return { people, skipped, errors };
}

/** Accounts stop working on 30 September 23:59 Beijing time after the academic year they are made in. */
export function termEndFor(nowMs = Date.now()) {
  const bj = new Date(nowMs + 8 * 3600 * 1000);
  const y = bj.getUTCFullYear();
  const endYear = bj.getUTCMonth() + 1 >= 9 ? y + 1 : y;
  return Math.floor(Date.UTC(endYear, 8, 30, 23, 59) / 1000) - 8 * 3600;
}

const lit = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/**
 * SQL that adds everyone not already there (matched by e-mail), so running it twice changes nothing.
 * One audit row records the import.
 */
export function membersSql(people, nowMs = Date.now()) {
  const t = Math.floor(nowMs / 1000);
  const end = termEndFor(nowMs);
  const rows = people.map((p) =>
    `INSERT INTO users (email, name_mn, full_name, student_id, role, department_id, show_public, status, term_ends_at, created_at)
SELECT ${lit(p.email)}, ${lit(p.name)}, ${lit(p.fullName)}, ${lit(p.studentId)}, ${lit(p.role)}, ${p.dept ? `(SELECT id FROM departments WHERE slug = ${lit(p.dept)})` : 'NULL'}, ${p.showPublic ? 1 : 0}, 'active', ${end}, ${t}
WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ${lit(p.email)});`,
  );
  rows.push(`INSERT INTO audit_log (actor_id, action, entity_type, entity_id, detail, created_at) VALUES (NULL, 'member.import', NULL, NULL, ${lit(JSON.stringify({ people: people.length }))}, ${t});`);
  return rows.join('\n');
}
