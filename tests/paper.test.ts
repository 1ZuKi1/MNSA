import { describe, expect, it } from 'vitest';
import { readRecordForm } from '../src/lib/forms';
import { paperOf } from '../src/lib/paper';
import { NEW_RECORD_TYPES, RECORD_TYPE_LIST, RECORD_TYPES } from '../src/lib/record-types';

const form = (o: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) fd.set(k, v);
  return fd;
};

describe('paper documents from before the website', () => {
  it('reads what the paper says about itself', () => {
    const p = paperOf({
      paper_json: JSON.stringify({ source: 'J-0001.docx', kind: 'ЖУРАМ', date: '2025-10-14', signers: [{ title: 'Холбооны Тэргүүн', names: ['Б. Амгаланбаяр'] }] }),
    });
    expect(p?.kind).toBe('ЖУРАМ');
    expect(p?.date).toBe('2025-10-14');
    expect(p?.signers[0].names).toEqual(['Б. Амгаланбаяр']);
    expect(p?.subject).toBeNull();
  });

  it('fills what a paper leaves out', () => {
    expect(paperOf({ paper_json: '{"source":"J-0006.docx"}' })).toEqual({ source: 'J-0006.docx', kind: '', subject: null, date: null, signers: [] });
  });

  it('is nothing for a record written on the site, or a broken value', () => {
    expect(paperOf({ paper_json: null })).toBeNull();
    expect(paperOf({ paper_json: 'not json' })).toBeNull();
    expect(paperOf({ paper_json: '"text"' })).toBeNull();
  });
});

describe('a kind that exists only on paper', () => {
  it('is listed for reading and filtering', () => {
    expect(RECORD_TYPE_LIST.map((t) => t.slug)).toEqual(expect.arrayContaining(['zarlal']));
    expect(RECORD_TYPES.zarlal.code).toBe('З');
  });

  it('is never offered for a new document', () => {
    const slugs = NEW_RECORD_TYPES.map((t) => t.slug);
    expect(slugs).not.toContain('zarlal');
    expect(slugs).toContain('medegdel');
  });

  it('is refused from a posted form', () => {
    expect(readRecordForm(form({ type: 'zarlal', title: 'x', f_body: 'x', dept: 'erh-zui' }))).toBeNull();
    expect(readRecordForm(form({ type: 'medegdel', title: 'x', f_body: 'x', dept: 'erh-zui' }))?.ok).toBe(true);
  });
});
