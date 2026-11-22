/**
 * What the official blank and the Chinese-language documents print, kept in one place.
 *
 * The letterhead is copied from «Official Blank - Mongolian.docx» (2026-10). The phone number is the
 * President's: change it here at the September handover.
 */
import type { DeptSlug, Step } from './types';

export const LETTERHEAD = {
  name: 'Бээжингийн Их Сургуулийн Монгол Оюутны Холбоо',
  address: 'Бээжин хот, Бээжингийн Их Сургуулийн Гадаад Оюутны Дотуур Байр',
  phone: '+86 188 1016 9205',
  email: 'pku_mongolia@163.com',
  web: 'pkumongolia.com',
};

/**
 * The genitive ending after a day written in digits — «08-ны», «29-ний», «1-ний» — following how the number
 * is read: нэг, дөрөв, ес take -ний; the rest (хоёр, гурав, тав, зургаа, долоо, найм, арав, хорь, гуч) -ны.
 */
export function dayGenitive(day: number): string {
  return [1, 4, 9].includes(day % 10) ? 'ний' : 'ны';
}

/** «2026 оны 10 дугаар сарын 08-ны өдрийн» — the reference line on the official blank. */
export function letterDateLine(date: { y: number; m: number; d: number }): string {
  const suffix = [1, 4, 9, 11].includes(date.m) ? 'дүгээр' : 'дугаар';
  const dd = String(date.d).padStart(2, '0');
  return `${date.y} оны ${date.m} ${suffix} сарын ${dd}-${dayGenitive(date.d)} өдрийн`;
}

// ------------------------------------------------------------------ Chinese

export const ZH = {
  number: '编号',
  date: '日期',
  place: '中华人民共和国北京市',
  org: '北京大学蒙古国留学生学生会',
  annex: '附件',
  onBehalf: (org: string) => `${org}代表`,
};

/** 2026年9月23日 */
export const zhDate = (date: { y: number; m: number; d: number }) => `${date.y}年${date.m}月${date.d}日`;

/** Who signs, in Chinese, as on the memoranda of 2026-09-23 (学生会主席 · 外交部 · 法务部). */
const ZH_DEPT: Record<DeptSlug, string> = {
  udirdlaga: '学生会',
  dotood: '内务部',
  gadaad: '外交部',
  surgalt: '学习部',
  media: '宣传部',
  'erh-zui': '法务部',
};
export function zhStepTitle(step: Step, dept: DeptSlug, coDept: DeptSlug | null): string {
  if (step === 'president') return '学生会主席';
  if (step === 'legal') return ZH_DEPT['erh-zui'];
  if (step === 'cohead') return coDept ? ZH_DEPT[coDept] : '';
  return ZH_DEPT[dept];
}

const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch',
  ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: 'i', э: 'e', ю: 'yu', я: 'ya',
};
/**
 * A Mongolian name in Latin letters, as the Chinese memoranda write it: «Ө. Амарсанаа» → «U. Amarsanaa»,
 * «Т. Баярцэцэг» → «T. Bayartsetseg». Anything not Cyrillic is kept as it is.
 */
export function latinName(name: string): string {
  let out = '';
  let start = true;
  for (const ch of name) {
    const low = ch.toLowerCase();
    const t = LATIN[low];
    if (t === undefined) {
      out += ch;
      start = !/\p{L}/u.test(ch);
      continue;
    }
    out += start && ch !== low && t ? t[0].toUpperCase() + t.slice(1) : t;
    start = false;
  }
  return out;
}
