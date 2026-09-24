import { fromLocal } from './time';
import type { DeptSlug } from './types';
import { getRecordType, isRange, joinRange, validateFields, type RecordType } from './record-types';
import { str } from './http';
import type { Visibility } from './types';

/** A real time of day, ЦЦ:ММ in 24-hour form. */
export const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * A typed time as ЦЦ:ММ, accepting what people actually type: "1830", "18.30", "18 30" → 18:30,
 * "930" → 09:30, "9" → 09:00. Anything else comes back as typed, for validation to refuse.
 */
export function normalizeTime(raw: string): string {
  const t = raw.trim();
  const m = /^(\d{1,2})(?:[:.\s]?(\d{2}))?$/.exec(t);
  return m ? `${m[1].padStart(2, '0')}:${m[2] ?? '00'}` : t;
}

export function readRecordForm(fd: FormData, fixedType?: RecordType) {
  const type = fixedType ?? getRecordType(str(fd, 'type', 40));
  if (!type) return null;
  const raw: Record<string, string> = {};
  // a range arrives as two boxes (f_period, f_period_to) and is kept as one value
  const part = (name: string, times: boolean) => (times ? normalizeTime(str(fd, name, 10)) : str(fd, name, 10));
  for (const f of type.fields)
    raw[f.name] = isRange(f.type)
      ? joinRange(part(`f_${f.name}`, f.type === 'timerange'), part(`f_${f.name}_to`, f.type === 'timerange'))
      : str(fd, `f_${f.name}`, 20000);
  const { values, errors } = validateFields(type, raw);
  const title = str(fd, 'title', 200);
  if (!title) errors.title = 'Заавал бөглөнө.';
  const visibility: Visibility = str(fd, 'visibility', 10) === 'dept' ? 'dept' : 'staff';
  return {
    type,
    title,
    values,
    errors,
    visibility,
    dept: str(fd, 'dept', 40),
    /** Optional second department (empty = none). Checked against the main one by the page, which knows it on edit. */
    coDept: (str(fd, 'co_dept', 40) || null) as DeptSlug | null,
    then: str(fd, 'then', 10) === 'submit' ? ('submit' as const) : ('save' as const),
    ok: Object.keys(errors).length === 0,
  };
}


export interface EventFormValues {
  title: string;
  summary: string;
  body: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  dept: string;
}

export function readEventForm(fd: FormData, validDepts: string[]) {
  const v: EventFormValues = {
    title: str(fd, 'title', 200),
    summary: str(fd, 'summary', 400),
    body: str(fd, 'body', 20000),
    startDate: str(fd, 'start_date', 10),
    startTime: normalizeTime(str(fd, 'start_time', 10)) || '18:00',
    endDate: str(fd, 'end_date', 10),
    endTime: normalizeTime(str(fd, 'end_time', 10)) || '21:00',
    location: str(fd, 'location', 200),
    dept: str(fd, 'dept', 40),
  };
  if (!v.endDate) v.endDate = v.startDate;
  const errors: Record<string, string> = {};
  if (!v.title) errors.title = 'Заавал бөглөнө.';
  let startsAt = 0;
  let endsAt = 0;
  const badTime = 'Цагийг ЦЦ:ММ хэлбэрээр бичнэ үү, жишээ нь 18:30.';
  if (!TIME.test(v.startTime)) errors.start = badTime;
  else
    try {
      startsAt = fromLocal(v.startDate, v.startTime);
    } catch {
      errors.start = 'Эхлэх огноог оруулна уу.';
    }
  if (!TIME.test(v.endTime)) errors.end = badTime;
  else
    try {
      endsAt = fromLocal(v.endDate, v.endTime);
    } catch {
      errors.end = 'Дуусах огноо буруу байна.';
    }
  if (!errors.start && !errors.end && endsAt < startsAt) errors.end = 'Дуусах хугацаа эхлэхээс өмнө байж болохгүй.';
  if (v.dept && !validDepts.includes(v.dept)) errors.dept = 'Буруу хэлтэс.';
  return {
    values: v,
    errors,
    ok: Object.keys(errors).length === 0,
    input: {
      title: v.title,
      summary: v.summary,
      body: v.body,
      startsAt,
      endsAt,
      location: v.location,
      dept: (v.dept || null) as DeptSlug | null,
    },
  };
}
