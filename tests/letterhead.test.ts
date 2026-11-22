import { describe, expect, it } from 'vitest';
import { dayGenitive, latinName, letterDateLine, zhDate, zhStepTitle } from '../src/lib/letterhead';
import { hamtiinLang, NEW_RECORD_TYPES, printKind, RECORD_TYPES } from '../src/lib/record-types';

describe('the official blank', () => {
  it('writes the reference date as the Embassy letter does', () => {
    expect(letterDateLine({ y: 2026, m: 10, d: 8 })).toBe('2026 оны 10 дугаар сарын 08-ны өдрийн');
    expect(letterDateLine({ y: 2026, m: 9, d: 29 })).toBe('2026 оны 9 дүгээр сарын 29-ний өдрийн');
  });

  it('follows how the day is read: нэг, дөрөв, ес take -ний', () => {
    expect([1, 4, 9, 11, 21, 24, 29, 31].map(dayGenitive)).toEqual(Array(8).fill('ний'));
    expect([2, 3, 5, 6, 7, 8, 10, 20, 30].map(dayGenitive)).toEqual(Array(9).fill('ны'));
  });

  it('is the layout of an outgoing letter, signed by the President with the square stamp', () => {
    expect(RECORD_TYPES['albn-bichig'].print.layout).toBe('letter');
    expect(RECORD_TYPES['albn-bichig'].print.stamp).toBe('square');
    expect(RECORD_TYPES.medegdel.print.stamp).toBeUndefined(); // the round one
  });
});

describe('Хамтын ажиллагаа', () => {
  const t = RECORD_TYPES.hamtiin;
  it('can be written, carries the square stamp and goes дарга → Legal → President', () => {
    expect(NEW_RECORD_TYPES).toContain(t);
    expect(t.code).toBe('ХА');
    expect(t.print.stamp).toBe('square');
    expect(t.chain).toEqual(['head', 'legal', 'president']);
  });

  it('prints its heading in the chosen language', () => {
    expect(printKind(t, { lang: '中文', doc_kind: 'Хамтран ажиллах санамж бичиг' })).toBe('《合作谅解备忘录》');
    expect(printKind(t, { lang: '中文', doc_kind: 'Хамтран ажиллах гэрээ' })).toBe('《合作协议》');
    expect(printKind(t, { lang: 'Монгол', doc_kind: 'Хамтран ажиллах гэрээ' })).toBe('ХАМТРАН АЖИЛЛАХ ГЭРЭЭ');
    expect(hamtiinLang({})).toBe('mn');
  });

  it('writes Chinese dates, titles and names as the memoranda of 2026-09-23', () => {
    expect(zhDate({ y: 2026, m: 9, d: 23 })).toBe('2026年9月23日');
    expect(zhStepTitle('president', 'gadaad', null)).toBe('学生会主席');
    expect(zhStepTitle('head', 'gadaad', null)).toBe('外交部');
    expect(zhStepTitle('legal', 'gadaad', null)).toBe('法务部');
    expect(latinName('Ө. Амарсанаа')).toBe('U. Amarsanaa');
    expect(latinName('М. Эмүжин')).toBe('M. Emujin');
    expect(latinName('Т. Баярцэцэг')).toBe('T. Bayartsetseg');
    expect(latinName('Б. Номин-Эрдэнэ')).toBe('B. Nomin-Erdene');
  });
});
