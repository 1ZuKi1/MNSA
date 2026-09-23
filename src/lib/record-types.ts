/**
 * The record types that replace Word templates. Each type is a form (fields) plus an approval chain.
 * Adding a new kind of document = adding an entry here. The print layout lives in
 * src/pages/dep/barimt/[id]/hevleh.astro and renders fields generically.
 */
import type { IconName } from './icons';
import type { Step } from './types';

export type FieldType = 'text' | 'textarea' | 'date' | 'number';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
}

export interface RecordType {
  slug: string;
  label: string;
  description: string;
  /** Shown on the "which kind of document?" cards. */
  icon: IconName;
  /** Approval chain, in order. Steps the author themselves owns are skipped automatically on submit. */
  chain: Step[];
  fields: FieldDef[];
  /** An approved record of this type can spawn an event draft. */
  createsEvent?: boolean;
}

export const RECORD_TYPES: Record<string, RecordType> = {
  'albn-bichig': {
    slug: 'albn-bichig',
    label: 'Албан бичиг',
    icon: 'mail',
    description: 'Гадагш илгээх албан ёсны захидал. Хэлтсийн дарга, Эрх зүйн хэлтэс, Тэргүүн хянана.',
    chain: ['head', 'legal', 'president'],
    fields: [
      { name: 'recipient', label: 'Хүлээн авагч', type: 'text', required: true, hint: 'Байгууллага эсвэл хүний нэр' },
      { name: 'body', label: 'Агуулга', type: 'textarea', required: true },
      { name: 'attachments_note', label: 'Хавсралт', type: 'text', hint: 'Жишээ нь: «Гишүүдийн жагсаалт, 2 хуудас»' },
    ],
  },
  huselt: {
    slug: 'huselt',
    label: 'Арга хэмжээний хүсэлт',
    icon: 'calendar',
    description: 'Арга хэмжээ зохион байгуулах зөвшөөрөл хүсэх. Хэлтсийн дарга, дараа нь Тэргүүн шийдвэрлэнэ.',
    chain: ['head', 'president'],
    createsEvent: true,
    fields: [
      { name: 'event_date', label: 'Товлосон огноо', type: 'date', required: true },
      { name: 'venue', label: 'Байршил', type: 'text' },
      { name: 'participants', label: 'Оролцогчдын тоо', type: 'number' },
      { name: 'budget', label: 'Төсөв (юань)', type: 'number' },
      { name: 'purpose', label: 'Зорилго', type: 'textarea', required: true },
      { name: 'needs', label: 'Шаардлагатай зүйлс', type: 'textarea', hint: 'Танхим, тоног төхөөрөмж, хүн хүч' },
    ],
  },
  tailan: {
    slug: 'tailan',
    label: 'Тайлан',
    icon: 'doc',
    description: 'Хийсэн ажлын тайлан. Хэлтсийн дарга баталгаажуулна.',
    chain: ['head'],
    fields: [
      { name: 'period', label: 'Хамрах хугацаа', type: 'text', required: true, hint: 'Жишээ нь: «2026 оны 9-р сар»' },
      { name: 'summary', label: 'Товч агуулга', type: 'textarea', required: true },
      { name: 'results', label: 'Үр дүн', type: 'textarea' },
      { name: 'next_steps', label: 'Цаашдын ажил', type: 'textarea' },
    ],
  },
  tolovlogoo: {
    slug: 'tolovlogoo',
    label: 'Үйл ажиллагааны төлөвлөгөө',
    icon: 'chart',
    description: 'Хэлтсийн тодорхой хугацаанд хийх ажлын төлөвлөгөө. Хэлтсийн дарга, дараа нь Тэргүүн батална.',
    chain: ['head', 'president'],
    fields: [
      { name: 'period', label: 'Хамрах хугацаа', type: 'text', required: true, hint: 'Жишээ нь: «2026 оны 10–12-р сар»' },
      { name: 'goals', label: 'Зорилго', type: 'textarea', required: true },
      { name: 'activities', label: 'Хийх ажлууд', type: 'textarea', required: true, hint: 'Мөр бүрт нэг ажил: юу хийх, хэзээ, хэн хариуцах.' },
      { name: 'budget', label: 'Төсөв (юань)', type: 'number' },
      { name: 'notes', label: 'Нэмэлт тайлбар', type: 'textarea' },
    ],
  },
  songuuli: {
    slug: 'songuuli',
    label: 'Сонгуулийн хорооны материал',
    icon: 'hand',
    // Deliberately not routed to the President: a sitting President may be a candidate.
    description: 'Сонгуулийн зар, нэр дэвшигчдийн жагсаалт, санал хураалтын дүн зэрэг. Эрх зүйн хэлтэс хянана.',
    chain: ['legal'],
    fields: [
      { name: 'kind', label: 'Материалын төрөл', type: 'text', required: true, hint: 'Жишээ нь: сонгуулийн зар, нэр дэвшигчдийн жагсаалт, дүнгийн протокол' },
      { name: 'election', label: 'Сонгууль', type: 'text', required: true, hint: 'Жишээ нь: «2027–2028 оны удирдлагын сонгууль»' },
      { name: 'body', label: 'Агуулга', type: 'textarea', required: true },
      { name: 'attachments_note', label: 'Хавсралт', type: 'text', hint: 'Жишээ нь: «Нэр дэвшигчдийн өргөдөл, 4 хуудас»' },
    ],
  },
  durem: {
    slug: 'durem',
    label: 'Үндсэн дүрмийн өөрчлөлт',
    icon: 'shield',
    description: 'Үндсэн дүрмийн заалтыг өөрчлөх, нэмэх, хасах санал. Эрх зүйн хэлтэс, дараа нь Тэргүүн хянана.',
    chain: ['legal', 'president'],
    fields: [
      { name: 'articles', label: 'Хамаарах бүлэг, зүйл, заалт', type: 'text', required: true, hint: 'Жишээ нь: «5-р бүлэг, 23.4 дэх заалт»' },
      { name: 'current_text', label: 'Одоогийн найруулга', type: 'textarea', hint: 'Шинэ заалт нэмэх бол хоосон орхино.' },
      { name: 'proposed_text', label: 'Шинэ найруулга', type: 'textarea', required: true, hint: 'Заалтыг хасах бол «Хасна» гэж бичнэ.' },
      { name: 'rationale', label: 'Үндэслэл', type: 'textarea', required: true },
    ],
  },
};

export const RECORD_TYPE_LIST = Object.values(RECORD_TYPES);

export function getRecordType(slug: string): RecordType | null {
  return RECORD_TYPES[slug] ?? null;
}

const MAX_FIELD = 20000;

/** Server-side validation. Returns clean values and Mongolian error messages keyed by field. */
export function validateFields(type: RecordType, input: Record<string, unknown>) {
  const values: Record<string, string> = {};
  const errors: Record<string, string> = {};
  for (const f of type.fields) {
    const raw = typeof input[f.name] === 'string' ? (input[f.name] as string).trim() : '';
    if (raw.length > MAX_FIELD) errors[f.name] = 'Хэт урт байна.';
    else if (f.required && !raw) errors[f.name] = 'Заавал бөглөнө.';
    else if (raw && f.type === 'number' && !/^\d+([.,]\d+)?$/.test(raw)) errors[f.name] = 'Тоо оруулна уу.';
    else if (raw && f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) errors[f.name] = 'Огноо буруу байна.';
    values[f.name] = raw;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}
