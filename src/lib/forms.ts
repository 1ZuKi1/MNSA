import { fromLocal } from './time';
import type { DeptSlug } from './types';
import { getRecordType, validateFields, type RecordType } from './record-types';
import { str } from './http';
import type { Visibility } from './types';

export function readRecordForm(fd: FormData, fixedType?: RecordType) {
  const type = fixedType ?? getRecordType(str(fd, 'type', 40));
  if (!type) return null;
  const raw: Record<string, string> = {};
  for (const f of type.fields) raw[f.name] = str(fd, `f_${f.name}`, 20000);
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
    startTime: str(fd, 'start_time', 5) || '18:00',
    endDate: str(fd, 'end_date', 10),
    endTime: str(fd, 'end_time', 5) || '21:00',
    location: str(fd, 'location', 200),
    dept: str(fd, 'dept', 40),
  };
  if (!v.endDate) v.endDate = v.startDate;
  const errors: Record<string, string> = {};
  if (!v.title) errors.title = 'Заавал бөглөнө.';
  let startsAt = 0;
  let endsAt = 0;
  try {
    startsAt = fromLocal(v.startDate, v.startTime);
  } catch {
    errors.start = 'Эхлэх огноог оруулна уу.';
  }
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
