/**
 * Money and quantities for the budget («Төсөв»). Pure functions, tested in tests/money.test.ts.
 * Money is kept in fen (1 юань = 100 fen) and quantities in hundredths, both as whole numbers, so
 * 0.1 + 0.2 never shows up on a public page as 0.30000000000000004.
 */

/** Ten million yuan: far above anything the association handles, low enough that no sum loses precision. */
export const MAX_FEN = 1_000_000_000;
/** Ten thousand of one thing. */
export const MAX_QTY_C = 1_000_000;

/**
 * What people actually type for a number: "1250", "1 250", "1,250", "1,250.50", "12.5", "12,5", "¥ 80".
 * A comma followed by exactly three digits is a thousands separator; followed by one or two, a decimal
 * comma. Returns hundredths (fen for money, hundredths for a quantity), or null if it isn't a number with
 * at most two decimals.
 */
export function parseHundredths(raw: string): number | null {
  let s = raw.trim().replace(/^¥\s*/, '').replace(/[\s  ]/g, '');
  if (!s) return null;
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1]);
  if (!Number.isSafeInteger(whole) || whole > MAX_FEN) return null;
  return whole * 100 + Number((m[2] ?? '').padEnd(2, '0'));
}

/** A price: zero or more, at most MAX_FEN. */
export function parseMoney(raw: string): number | null {
  const v = parseHundredths(raw);
  return v === null || v > MAX_FEN ? null : v;
}

/** A quantity: one whole number, at least 1, at most 10,000 — in hundredths like everything else here. */
export function parseQty(raw: string): number | null {
  const s = raw.trim().replace(/[\s\u00a0\u202f,]/g, '');
  if (!/^\d+$/.test(s)) return null;
  const v = Number(s) * 100;
  return v <= 0 || v > MAX_QTY_C ? null : v;
}

/** quantity × price of one, rounded to the nearest fen. */
export const lineTotal = (qtyC: number, unitFen: number): number => Math.round((qtyC * unitFen) / 100);

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * ¥1,250 · ¥1,250.50 · −¥120. `cents: 'always'` keeps .00 so a column of prices lines up;
 * 'auto' drops it for whole amounts (the headline numbers).
 */
export function fmtYuan(fen: number, cents: 'auto' | 'always' = 'auto'): string {
  const neg = fen < 0;
  const abs = Math.abs(Math.round(fen));
  const whole = Math.floor(abs / 100);
  const part = abs % 100;
  const tail = cents === 'always' || part !== 0 ? `.${String(part).padStart(2, '0')}` : '';
  return `${neg ? '−' : ''}¥${group(whole)}${tail}`;
}

/** 2 · 2.5 · 0.25 · 1,200 */
export function fmtQty(qtyC: number): string {
  const whole = Math.floor(qtyC / 100);
  const part = qtyC % 100;
  if (part === 0) return group(whole);
  return `${group(whole)}.${String(part).padStart(2, '0').replace(/0$/, '')}`;
}

/** The value to put back in a form box after an error: plain digits, a dot, no grouping. */
export function hundredthsInput(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const part = v % 100;
  return part === 0 ? String(Math.floor(v / 100)) : `${Math.floor(v / 100)}.${String(part).padStart(2, '0').replace(/0$/, '')}`;
}

/** Spent as a share of a total, 0–100 (whole percent, never NaN), for the progress bar. */
export function percentOf(part: number, total: number): number {
  if (total <= 0) return part > 0 ? 100 : 0;
  return Math.round((part / total) * 100);
}

/** Money in its own currency, for «Санхүү»: ¥1,250.50 · ₮120,000 · 35.00 USD. Hundredths, like everything here. */
const SIGN: Record<string, string> = { CNY: '¥', MNT: '₮' };
export function fmtMoney(minor: number, currency: string): string {
  const neg = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const part = abs % 100;
  const n = `${group(Math.floor(abs / 100))}${part ? `.${String(part).padStart(2, '0')}` : ''}`;
  const sign = SIGN[currency];
  return `${neg ? '−' : ''}${sign ? `${sign}${n}` : `${n} ${currency}`}`;
}
