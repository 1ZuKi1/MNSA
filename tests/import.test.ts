import { describe, expect, it } from 'vitest';
import { membersSql, parseMembers, splitCsvLine, termEndFor } from '../scripts/members-import-lib.mjs';

const HEAD = 'name,full_name,student_id,email,role,dept,public';

describe('members list (CSV) for the go-live import', () => {
  it('reads quoted fields', () => {
    expect(splitCsvLine('"Б. Болд, Ж.",x')).toEqual(['Б. Болд, Ж.', 'x']);
  });

  it('builds the school address from the student ID when e-mail is empty', () => {
    const { people, errors } = parseMembers(`${HEAD}\nМ. Эмүжин,Мягмарбаатар Эмүжин,2500093207,,head,gadaad,yes`);
    expect(errors).toEqual([]);
    expect(people[0].email).toBe('2500093207@stu.pku.edu.cn');
    expect(people[0].fullName).toBe('Мягмарбаатар Эмүжин');
  });

  it('keeps a personal address when one is given', () => {
    const { people } = parseMembers(`${HEAD}\nМ. Мөнхдэлгэр,,,Munkh@Gmail.com,head,dotood,`);
    expect(people[0].email).toBe('munkh@gmail.com');
    expect(people[0].studentId).toBeNull();
    expect(people[0].showPublic).toBe(true);
  });

  it('accepts the Mongolian names for roles and departments', () => {
    const { people, errors } = parseMembers(`${HEAD}\nО. Индра,,2602040098,,Хэлтсийн гишүүн,Дотоод хэлтэс,тийм`);
    expect(errors).toEqual([]);
    expect(people[0]).toMatchObject({ role: 'member', dept: 'dotood' });
  });

  it('puts the President and the board in the leadership', () => {
    const { people } = parseMembers(`${HEAD}\nӨ. Амарсанаа,,2400092914,,president,,yes`);
    expect(people[0].dept).toBe('udirdlaga');
  });

  it('skips someone with neither e-mail nor student ID, and says so', () => {
    const { people, skipped, errors } = parseMembers(`${HEAD}\nБ. Амгаланбаяр,,,,board,,yes`);
    expect(errors).toEqual([]);
    expect(people).toHaveLength(0);
    expect(skipped[0]).toMatch(/Амгаланбаяр/);
  });

  it('refuses the whole file on any mistake', () => {
    const r = parseMembers(`${HEAD}\nx,,12ab,,member,dotood,\ny,,,y@x.com,boss,dotood,\nz,,,z@x.com,member,udirdlaga,\nw,,,z@x.com,member,media,maybe`);
    expect(r.errors).toHaveLength(4);
  });

  it('allows only one President', () => {
    const r = parseMembers(`${HEAD}\na,,,a@x.com,president,,\nb,,,b@x.com,president,,`);
    expect(r.errors.join()).toMatch(/one president/);
  });

  it('ignores comment lines and a spreadsheet BOM', () => {
    const r = parseMembers(`﻿# the 2026–2027 team\n${HEAD}\n# a comment\nа,,,a@x.com,member,media,no`);
    expect(r.people).toHaveLength(1);
    expect(r.people[0].showPublic).toBe(false);
  });

  it('accounts made in September 2026 run to 30 September 2027', () => {
    const end = termEndFor(Date.UTC(2026, 8, 24));
    expect(new Date((end + 8 * 3600) * 1000).toISOString().slice(0, 16)).toBe('2027-09-30T23:59');
  });

  it('writes SQL that never overwrites someone already there, and escapes quotes', () => {
    const { people } = parseMembers(`${HEAD}\nO'Brien,,,o@x.com,member,media,yes`);
    const sql = membersSql(people, Date.UTC(2026, 8, 24));
    expect(sql).toContain("'O''Brien'");
    expect(sql).toContain('WHERE NOT EXISTS (SELECT 1 FROM users WHERE email =');
    expect(sql).toContain("'member.import'");
  });
});
