import { describe, expect, it } from 'vitest';
import { joinRange, rangeParts, RECORD_TYPES, showField, validateFields } from '../src/lib/record-types';
import { normalizeTime } from '../src/lib/forms';

const plan = RECORD_TYPES.tolovlogoo;
const minutes = RECORD_TYPES.protokol;
const release = RECORD_TYPES.choloolol;
const period = plan.fields.find((f) => f.name === 'period')!;
const time = minutes.fields.find((f) => f.name === 'time')!;
const base = { goals: 'x', activities: 'x' };

describe('periods are picked, not typed', () => {
  it('a period is kept as one value from its two pickers', () => {
    expect(joinRange('2026-10-01', '2026-12-31')).toBe('2026-10-01/2026-12-31');
    expect(joinRange('', '')).toBe('');
  });
  it('accepts a start and an end', () => {
    expect(validateFields(plan, { ...base, period: '2026-10-01/2026-12-31' }).ok).toBe(true);
  });
  it('needs both ends', () => {
    expect(validateFields(plan, { ...base, period: '2026-10-01/' }).errors.period).toMatch(/хоёуланг/);
  });
  it('refuses an end before the start', () => {
    expect(validateFields(plan, { ...base, period: '2026-12-31/2026-10-01' }).errors.period).toMatch(/өмнө/);
  });
  it('refuses the old typed sentence on save, so it gets picked again', () => {
    expect(validateFields(plan, { ...base, period: '2026 оны 10-12-р сар' }).ok).toBe(false);
  });
  it('reads as dates on screen and in words on paper', () => {
    expect(showField(period, '2026-10-01/2026-12-31')).toBe('2026.10.01 – 2026.12.31');
    expect(showField(period, '2026-10-01/2026-12-31', true)).toBe('2026 оны 10 дугаар сарын 1 – 2026 оны 12 дугаар сарын 31');
  });
  it('shows a value typed before the pickers exactly as typed, and leaves the pickers empty', () => {
    expect(showField(period, '2026 оны 9-р сар')).toBe('2026 оны 9-р сар');
    expect(rangeParts('daterange', '2026 оны 9-р сар')).toEqual(['', '']);
  });
});

describe('meeting time is picked on a clock', () => {
  it('may leave the end open', () => {
    const r = validateFields(minutes, { meeting_type: 'Албан хурал', meeting_date: '2026-10-10', time: '13:00/', attendees: 'x', agenda: 'x', decisions: 'x' });
    expect(r.ok).toBe(true);
    expect(showField(time, '13:00/')).toBe('13:00');
    expect(showField(time, '13:00/15:00')).toBe('13:00 – 15:00');
  });
});

describe('fixed answers come from a list', () => {
  const ok = { person: 'Баяржаргалын Номин-Эрдэнэ', term_start: '2025-09-28', request_date: '2025-10-27', effective_date: '2025-10-27' };
  it('position and department are chosen, not typed', () => {
    expect(validateFields(release, { ...ok, position: 'Хэлтсийн дарга', department: 'Дотоод хэлтэс' }).ok).toBe(true);
    expect(validateFields(release, { ...ok, position: 'дарга', department: 'Дотоод хэлтэс' }).errors.position).toBeTruthy();
  });
});

describe('times are typed as ЦЦ:ММ', () => {
  it('accepts what people actually type', () => {
    expect(normalizeTime('1830')).toBe('18:30');
    expect(normalizeTime('18.30')).toBe('18:30');
    expect(normalizeTime('930')).toBe('09:30');
    expect(normalizeTime('9')).toBe('09:00');
    expect(normalizeTime('09:05')).toBe('09:05');
  });
  it('refuses a time that does not exist', () => {
    const base = { meeting_type: 'Албан хурал', meeting_date: '2026-10-10', attendees: 'x', agenda: 'x', decisions: 'x' };
    expect(validateFields(minutes, { ...base, time: `${normalizeTime('2500')}/` }).errors.time).toMatch(/ЦЦ:ММ/);
    expect(validateFields(minutes, { ...base, time: `${normalizeTime('1875')}/` }).errors.time).toMatch(/ЦЦ:ММ/);
    expect(validateFields(minutes, { ...base, time: 'оройн/' }).errors.time).toMatch(/ЦЦ:ММ/);
  });
});
