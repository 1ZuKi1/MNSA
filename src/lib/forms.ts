import { fromLocal } from './time';
import { lineTotal, parseMoney, parseQty, parseQtyRange } from './money';
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

// ------------------------------------------------------------------ jobs («Ажлууд»)

export interface JobFormValues {
  title: string;
  notes: string;
  dept: string;
  owner: string;
  due: string;
  visibility: 'dept' | 'staff';
}

/** Reads the job form. The due date is optional and counts to the end of that day. */
export function readJobForm(fd: FormData, allowedDepts: string[]) {
  const values: JobFormValues = {
    title: str(fd, 'title', 200),
    notes: str(fd, 'notes', 4000),
    dept: str(fd, 'dept', 40),
    owner: str(fd, 'owner', 12),
    due: str(fd, 'due', 10),
    visibility: str(fd, 'visibility', 10) === 'staff' ? 'staff' : 'dept',
  };
  const errors: Record<string, string> = {};
  if (!values.title) errors.title = 'Заавал бөглөнө.';
  if (!allowedDepts.includes(values.dept)) errors.dept = 'Хэлтэс сонгоно уу.';
  if (values.owner && !/^\d+$/.test(values.owner)) errors.owner = 'Жагсаалтаас сонгоно уу.';
  if (values.due && !/^\d{4}-\d{2}-\d{2}$/.test(values.due)) errors.due = 'Огноог зөв оруулна уу.';
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    values,
    errors,
    input: ok
      ? {
          title: values.title,
          notes: values.notes,
          dept: values.dept as DeptSlug,
          ownerId: values.owner ? Number(values.owner) : null,
          dueAt: values.due ? fromLocal(values.due, '23:59') : null,
          visibility: values.visibility,
        }
      : null,
  };
}

// ------------------------------------------------------------------ budget («Төсөв»)

export type BudgetKind = 'spent' | 'planned';
export const BUDGET_KINDS: BudgetKind[] = ['spent', 'planned'];

export interface BudgetItemValues {
  /** spent: already bought · planned: to buy */
  kind: BudgetKind;
  /** planned only: can · postponed · cannot */
  state: string;
  date: string;
  item: string;
  purpose: string;
  qty: string;
  unit: string;
}

/**
 * One line. A bought line's date can't be in the future (counted in Beijing time; `today` is "YYYY-MM-DD");
 * a planned one's may — it's when we mean to buy. A planned quantity may be a range ("300–450"). The total
 * is computed here, never typed.
 */
export function readBudgetItemForm(fd: FormData, today: string) {
  const asked = str(fd, 'kind', 10) as BudgetKind;
  const kind: BudgetKind = BUDGET_KINDS.includes(asked) ? asked : 'spent';
  const values: BudgetItemValues = {
    kind,
    state: ['can', 'postponed', 'cannot'].includes(str(fd, 'state', 12)) ? str(fd, 'state', 12) : 'can',
    date: str(fd, 'date', 10),
    item: str(fd, 'item', 200),
    purpose: str(fd, 'purpose', 200),
    qty: str(fd, 'qty', 30),
    unit: str(fd, 'unit', 30),
  };
  const errors: Record<string, string> = {};
  let spentOn = 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.date = 'Огноог оруулна уу.';
  else if (kind === 'spent' && values.date > today) errors.date = 'Ирээдүйн огноо байж болохгүй. Хараахан аваагүй бол «Авахаар төлөвлөж байна»-г сонгоно уу.';
  else
    try {
      spentOn = fromLocal(values.date);
    } catch {
      errors.date = 'Огноо буруу байна.';
    }
  if (!values.item) errors.item = 'Юу болохыг бичнэ үү.';
  const range = kind === 'planned' ? parseQtyRange(values.qty) : (() => { const v = parseQty(values.qty); return v === null ? null : { min: v, max: null }; })();
  if (range === null)
    errors.qty = kind === 'planned' ? 'Тоо ширхэгийг тоогоор бичнэ үү, жишээ нь 3, 2.5 эсвэл 300–450.' : 'Тоо ширхэгийг тоогоор бичнэ үү, жишээ нь 3 эсвэл 2.5.';
  const unitFen = parseMoney(values.unit);
  if (unitFen === null) errors.unit = 'Нэгжийн үнийг юаниар бичнэ үү, жишээ нь 45 эсвэл 12.50.';
  const ok = Object.keys(errors).length === 0;
  return {
    ok,
    values,
    errors,
    input: ok
      ? {
          status: kind,
          planState: kind === 'planned' ? (values.state as 'can' | 'postponed' | 'cannot') : null,
          spentOn,
          item: values.item,
          purpose: values.purpose || null,
          qtyC: range!.min,
          qtyMaxC: range!.max,
          unitFen: unitFen!,
          totalFen: lineTotal(range!.min, unitFen!),
          totalMaxFen: range!.max === null ? null : lineTotal(range!.max, unitFen!),
        }
      : null,
  };
}

/** Marking a planned purchase bought: what it really came to, and when (not in the future). */
export function readBudgetConfirmForm(fd: FormData, today: string) {
  const values = { date: str(fd, 'date', 10), qty: str(fd, 'qty', 20), unit: str(fd, 'unit', 30) };
  const errors: Record<string, string> = {};
  let spentOn = 0;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) errors.date = 'Огноог оруулна уу.';
  else if (values.date > today) errors.date = 'Ирээдүйн огноо байж болохгүй.';
  else
    try {
      spentOn = fromLocal(values.date);
    } catch {
      errors.date = 'Огноо буруу байна.';
    }
  const qtyC = parseQty(values.qty);
  if (qtyC === null) errors.qty = 'Тоо ширхэгийг тоогоор бичнэ үү.';
  const unitFen = parseMoney(values.unit);
  if (unitFen === null) errors.unit = 'Нэгжийн үнийг юаниар бичнэ үү.';
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, input: ok ? { spentOn, qtyC: qtyC!, unitFen: unitFen!, totalFen: lineTotal(qtyC!, unitFen!) } : null };
}

/** The two headline numbers for a year. Both may be zero (not known yet). */
export function readBudgetYearForm(fd: FormData) {
  const values = { planned: str(fd, 'planned', 20), funds: str(fd, 'funds', 20), note: str(fd, 'note', 300) };
  const errors: Record<string, string> = {};
  const plannedFen = values.planned ? parseMoney(values.planned) : 0;
  const fundsFen = values.funds ? parseMoney(values.funds) : 0;
  if (plannedFen === null) errors.planned = 'Дүнг юаниар бичнэ үү, жишээ нь 15000.';
  if (fundsFen === null) errors.funds = 'Дүнг юаниар бичнэ үү, жишээ нь 12000.';
  const ok = Object.keys(errors).length === 0;
  return { ok, values, errors, input: ok ? { plannedFen: plannedFen!, fundsFen: fundsFen!, note: values.note || null } : null };
}
