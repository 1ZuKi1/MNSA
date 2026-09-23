// All times are stored as Unix seconds (UTC) and shown in Beijing time.
const OFFSET = 8 * 3600; // Asia/Shanghai, no DST

export const now = (): number => Math.floor(Date.now() / 1000);

/** Wall-clock parts in Beijing time. */
function parts(ts: number) {
  const d = new Date((ts + OFFSET) * 1000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Academic year runs 1 September → 31 August. */
export function academicYear(ts: number = now()): string {
  const { y, m } = parts(ts);
  return m >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Accounts expire at the end of September after their academic year — the handover month overlaps. */
export function termEnd(ts: number = now()): number {
  const endYear = Number(academicYear(ts).split('-')[1]);
  return fromLocal(`${endYear}-09-30`, '23:59');
}

/** "2026-10-10" + "18:00" in Beijing time → Unix seconds. */
export function fromLocal(date: string, time = '00:00'): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(h) || Number.isNaN(min)) throw new Error('bad date');
  return Math.floor(Date.UTC(y, m - 1, d, h, min) / 1000) - OFFSET;
}

export function toDateInput(ts: number | null | undefined): string {
  if (!ts) return '';
  const p = parts(ts);
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}
export function toTimeInput(ts: number | null | undefined): string {
  if (!ts) return '';
  const p = parts(ts);
  return `${pad(p.h)}:${pad(p.min)}`;
}

/** 2026.10.10 */
export function fmtDate(ts: number | null | undefined): string {
  if (!ts) return '—';
  const p = parts(ts);
  return `${p.y}.${pad(p.m)}.${pad(p.d)}`;
}
/** 2026.10.10 18:00 */
export function fmtDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const p = parts(ts);
  return `${p.y}.${pad(p.m)}.${pad(p.d)} ${pad(p.h)}:${pad(p.min)}`;
}
/** Mongolian long form: 2026 оны 10-р сарын 10 */
export function fmtLong(ts: number | null | undefined): string {
  if (!ts) return '—';
  const p = parts(ts);
  return `${p.y} оны ${p.m}-р сарын ${p.d}`;
}

const WEEKDAYS = ['Ням', 'Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба'];
/** Date key for event lists: { day: "10.10", sub: "Бямба · 18:00" } in Beijing time. */
export function dateKey(ts: number) {
  const d = new Date((ts + OFFSET) * 1000);
  const p = parts(ts);
  return { day: `${pad(p.m)}.${pad(p.d)}`, sub: `${WEEKDAYS[d.getUTCDay()]} · ${pad(p.h)}:${pad(p.min)}` };
}

/** Whole calendar days from today (Beijing) to `ts`: 0 = today, -1 = yesterday, 2 = the day after tomorrow. */
export function dayDiff(ts: number, from: number = now()): number {
  const day = (x: number) => Math.floor((x + OFFSET) / 86400);
  return day(ts) - day(from);
}

/** "өнөөдөр", "өчигдөр", "3 хоногийн өмнө", "маргааш", "5 хоногийн дараа" */
export function relDay(ts: number | null | undefined, from: number = now()): string {
  if (!ts) return '—';
  const d = dayDiff(ts, from);
  if (d === 0) return 'өнөөдөр';
  if (d === -1) return 'өчигдөр';
  if (d === 1) return 'маргааш';
  return d < 0 ? `${-d} хоногийн өмнө` : `${d} хоногийн дараа`;
}

/** "2026.09.23, Лхагва" */
export function fmtDayName(ts: number = now()): string {
  const d = new Date((ts + OFFSET) * 1000);
  return `${fmtDate(ts)}, ${WEEKDAYS[d.getUTCDay()]}`;
}
