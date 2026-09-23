/**
 * The record types that replace Word templates. Each type is a form (fields), an approval chain and a
 * print description modelled on the association's own documents (М-0001, П-0006, Ж-0006, ГЦ-0001 …).
 * Adding a new kind of document = adding an entry here; the form, validation, numbering, archive and the
 * printed page (src/pages/dep/barimt/[id]/hevleh.astro) all follow.
 */
import type { IconName } from './icons';
import type { Step } from './types';

export type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'select';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  /** For `select`. */
  options?: string[];
}

/** Who signs the printed document. The Тэргүүн always stands on the left, as on the association's papers. */
export type Signer =
  | { title: string; step: Step } // whoever holds (or approved) that step
  | { title: string; author: true } // whoever wrote the document
  | { title: string; field: string } // a name typed into the form
  | { title: string; dept: true }; // every current member of the document's department

/** A paragraph of fixed wording; {field} is replaced with the typed value. */
export interface TemplateSection {
  heading: string;
  paragraphs?: string[];
  /** Numbered clauses. */
  items?: string[];
  /** "Label: value" lines. */
  facts?: { label: string; field: string; date?: boolean }[];
}

export interface PrintDef {
  /** The large heading, e.g. МЭДЭГДЭЛ. Empty for an outgoing letter, which carries its subject instead. */
  kind: string | ((fields: Record<string, string>) => string);
  /** Short "Label: value" lines printed under the heading (date, place, period …). */
  meta?: string[];
  /** Fields printed as running text, without a numbered heading of their own. */
  plain?: string[];
  /** A field printed as the closing sentence, centred in bold italics. */
  closing?: string;
  signers: Signer[];
  /** Fixed wording (release from office). When set, the record title is not printed. */
  template?: TemplateSection[];
}

export interface RecordType {
  slug: string;
  label: string;
  /** The type letter in the document number: МОХ-ДХ/2627/Ж/001. */
  code: string;
  group: 'work' | 'rules';
  description: string;
  /** Shown on the "which kind of document?" cards. */
  icon: IconName;
  /** Approval chain, in order. Steps the author themselves owns are skipped automatically on submit. */
  chain: Step[];
  fields: FieldDef[];
  print: PrintDef;
  /** An approved record of this type can spawn an event draft. */
  createsEvent?: boolean;
}

const PRESIDENT: Signer = { title: 'Холбооны Тэргүүн', step: 'president' };
const LEGAL: Signer = { title: 'Эрх Зүйн Хэлтэс', step: 'legal' };
const HEAD: Signer = { title: 'Хэлтсийн дарга', step: 'head' };

/** Meeting kinds, from Үндсэн дүрэм 33.1. */
export const MEETING_KINDS = ['Их Хуралдаан', 'Албан хурал', 'Албан бус хурал', 'Удирдах Зөвлөлийн хурал', 'Хэлтсийн дарга нарын хурал', 'Хэлтсийн хурал'];

export const RECORD_TYPES: Record<string, RecordType> = {
  'albn-bichig': {
    slug: 'albn-bichig',
    label: 'Албан бичиг',
    code: 'А',
    group: 'work',
    icon: 'mail',
    description: 'Гадагш илгээх албан ёсны захидал. Хэлтсийн дарга, Эрх зүйн хэлтэс, Тэргүүн хянана.',
    chain: ['head', 'legal', 'president'],
    fields: [
      { name: 'recipient', label: 'Хүлээн авагч', type: 'text', required: true, hint: 'Байгууллага эсвэл хүний нэр' },
      { name: 'body', label: 'Агуулга', type: 'textarea', required: true },
      { name: 'attachments_note', label: 'Хавсралт', type: 'text', hint: 'Жишээ нь: «Гишүүдийн жагсаалт, 2 хуудас»' },
    ],
    print: { kind: '', plain: ['body'], signers: [PRESIDENT, LEGAL] },
  },
  medegdel: {
    slug: 'medegdel',
    label: 'Мэдэгдэл',
    code: 'М',
    group: 'work',
    icon: 'send',
    description: 'Холбооны нэрийн өмнөөс гишүүдэд хандсан мэдэгдэл. Эрх зүйн хэлтэс, дараа нь Тэргүүн батална (Үндсэн дүрэм, 31.1).',
    chain: ['legal', 'president'],
    fields: [
      { name: 'body', label: 'Агуулга', type: 'textarea', required: true, hint: 'Хэсгүүдийг дугаарлаж бичнэ: «1. Тухай», «1.1. …». Мөр бүр хэвлэхэд яг ингэж гарна.' },
      { name: 'closing', label: 'Төгсгөлийн өгүүлбэр', type: 'text', hint: 'Тодоор, голлуулж хэвлэгдэнэ. Жишээ нь: «Энэ хүрээд … мэдэгдэж байна.»' },
    ],
    print: { kind: 'МЭДЭГДЭЛ', plain: ['body'], closing: 'closing', signers: [PRESIDENT, LEGAL] },
  },
  protokol: {
    slug: 'protokol',
    label: 'Хурлын протокол',
    code: 'П',
    group: 'work',
    icon: 'users',
    description: 'Хэн оролцож, юу хэлэлцэж, ямар шийдвэр гарсныг тэмдэглэнэ. Тэргүүн батална.',
    chain: ['president'],
    fields: [
      { name: 'meeting_type', label: 'Хурлын төрөл', type: 'select', required: true, options: MEETING_KINDS },
      { name: 'meeting_date', label: 'Огноо', type: 'date', required: true },
      { name: 'time', label: 'Цаг', type: 'text', hint: 'Жишээ нь: 13:00–15:00' },
      { name: 'location', label: 'Байршил', type: 'text', hint: 'Жишээ нь: 北京大学中关新园5号楼' },
      { name: 'present', label: 'Оролцсон гишүүдийн тоо', type: 'number', hint: 'Их Хуралдаан, Албан хурал нийт гишүүдийн 2/3 нь оролцвол хүчинтэй (34.1).' },
      { name: 'excused', label: 'Чөлөө авсан гишүүдийн тоо', type: 'number' },
      { name: 'attendees', label: 'Хуралд оролцсон гишүүд', type: 'textarea', required: true, hint: 'Удирдах Зөвлөлийн, хэлтсийн дарга нарын болон хэлтсийн хуралд ирц бүрэн байх ёстой (34.2).' },
      { name: 'chair', label: 'Хурал даргалагч', type: 'text' },
      { name: 'secretary', label: 'Тэмдэглэл хөтлөгч', type: 'text' },
      { name: 'agenda', label: 'Хэлэлцэх асуудал', type: 'textarea', required: true, hint: 'Мөр бүрт нэг асуудал.' },
      { name: 'decisions', label: 'Хэлэлцсэн агуулга, гарсан санал, шийдвэр', type: 'textarea', required: true, hint: 'Асуудал бүрээр нь. Санал хураасан бол дүнг бичнэ.' },
      { name: 'next_meeting', label: 'Дараагийн хурал', type: 'text', hint: 'Огноо, байршил, протокол хөтлөгч' },
      { name: 'notes', label: 'Нэмэлт', type: 'textarea' },
    ],
    print: {
      kind: 'ХУРЛЫН ПРОТОКОЛ',
      meta: ['meeting_type', 'meeting_date', 'time', 'location', 'present', 'excused'],
      signers: [PRESIDENT, { title: 'Протокол хөтлөгч', author: true }],
    },
  },
  huselt: {
    slug: 'huselt',
    label: 'Арга хэмжээний хүсэлт',
    code: 'Х',
    group: 'work',
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
    print: { kind: 'ХҮСЭЛТ', meta: ['event_date', 'venue', 'participants', 'budget'], signers: [PRESIDENT, HEAD] },
  },
  tailan: {
    slug: 'tailan',
    label: 'Тайлан',
    code: 'Т',
    group: 'work',
    icon: 'doc',
    description: 'Хэлтсийн улирал, жилийн эцсийн тайлан (Үндсэн дүрэм, 23.4). Хэлтсийн дарга баталгаажуулна.',
    chain: ['head'],
    fields: [
      { name: 'report_kind', label: 'Тайлангийн төрөл', type: 'select', required: true, options: ['Улирлын эцсийн', 'Жилийн эцсийн'] },
      { name: 'period', label: 'Хамрах хугацаа', type: 'text', required: true, hint: 'Жишээ нь: «2026 оны 9-р сарын 1-ээс 12-р сарын 20 хүртэл»' },
      { name: 'members', label: 'Хэлтсийн бүрэлдэхүүн', type: 'textarea', hint: 'Шинэ тайлан дээр хэлтсийн одоогийн бүрэлдэхүүн өөрөө бөглөгдөнө.' },
      { name: 'work', label: 'Гүйцэтгэсэн ажил, үйл ажиллагаа', type: 'textarea', required: true, hint: 'Ажил бүрт: товч тайлбар, огноо, хариуцсан гишүүд.' },
      { name: 'results', label: 'Гарсан үр дүн', type: 'textarea' },
      { name: 'problems', label: 'Тулгамдсан асуудал', type: 'textarea', hint: 'Ажлын явцад гарсан, шийдвэрлэх шаардлагатай асуудлууд.' },
      { name: 'suggestions', label: 'Санал хүсэлт', type: 'textarea', hint: 'Цаашид ажлаа сайжруулах, дэмжлэг авахтай холбоотой.' },
      { name: 'next_steps', label: 'Цаашид хийх ажлын төлөвлөгөө', type: 'textarea' },
      { name: 'notes', label: 'Нэмэлт', type: 'textarea' },
    ],
    print: { kind: 'ТАЙЛАН', meta: ['report_kind', 'period'], signers: [{ title: 'Хэлтсийн гишүүд', dept: true }] },
  },
  tolovlogoo: {
    slug: 'tolovlogoo',
    label: 'Үйл ажиллагааны төлөвлөгөө',
    code: 'ТӨ',
    group: 'work',
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
    print: { kind: 'ҮЙЛ АЖИЛЛАГААНЫ ТӨЛӨВЛӨГӨӨ', meta: ['period', 'budget'], signers: [PRESIDENT, HEAD] },
  },
  juram: {
    slug: 'juram',
    label: 'Журам',
    code: 'Ж',
    group: 'rules',
    icon: 'folder',
    description: 'Холбооны дотоод журам: хурлын дэг, сонгууль, сахилга, арга хэмжээ (Үндсэн дүрэм, 38.1). Эрх зүйн хэлтэс, дараа нь Тэргүүн батална.',
    chain: ['legal', 'president'],
    fields: [
      { name: 'basis', label: 'Үндэслэл', type: 'text', required: true, hint: 'Жишээ нь: «Үндсэн дүрмийн 38.1.2 дахь заалт»' },
      { name: 'body', label: 'Журмын заалтууд', type: 'textarea', required: true, hint: 'Бүлэг, заалтуудыг дугаарлаж бичнэ. Үндсэн дүрэмтэй зөрчилдвөл хүчингүй (38.3).' },
      { name: 'effective', label: 'Мөрдөж эхлэх огноо', type: 'date' },
    ],
    print: { kind: 'ЖУРАМ', meta: ['basis', 'effective'], plain: ['body'], signers: [PRESIDENT, LEGAL] },
  },
  durem: {
    slug: 'durem',
    label: 'Үндсэн дүрмийн өөрчлөлт',
    code: 'ҮД',
    group: 'rules',
    icon: 'shield',
    description: 'Үндсэн дүрмийн заалтыг өөрчлөх, нэмэх, хасах санал. Эрх зүйн хэлтэс, Тэргүүн хянаж, гишүүдийн санал хураалтад оруулна (50-р зүйл).',
    chain: ['legal', 'president'],
    fields: [
      { name: 'articles', label: 'Хамаарах бүлэг, зүйл, заалт', type: 'text', required: true, hint: 'Жишээ нь: «5-р бүлэг, 23.4 дэх заалт»' },
      { name: 'current_text', label: 'Одоогийн найруулга', type: 'textarea', hint: 'Шинэ заалт нэмэх бол хоосон орхино.' },
      { name: 'proposed_text', label: 'Шинэ найруулга', type: 'textarea', required: true, hint: 'Заалтыг хасах бол «Хасна» гэж бичнэ.' },
      { name: 'rationale', label: 'Үндэслэл', type: 'textarea', required: true, hint: 'Сонгуулийн өмнөх 14 хоногт болон Сонгуулийн хороо байгуулагдсанаас Их Хуралдаан хүртэл өөрчлөлт оруулахыг хориглоно (51.1–51.2).' },
    ],
    print: { kind: 'ҮНДСЭН ДҮРЭМД ӨӨРЧЛӨЛТ ОРУУЛАХ САНАЛ', meta: ['articles'], signers: [PRESIDENT, LEGAL] },
  },
  songuuli: {
    slug: 'songuuli',
    label: 'Сонгуулийн хорооны материал',
    code: 'С',
    group: 'rules',
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
    print: {
      kind: (f) => (f.kind ?? '').toUpperCase(),
      meta: ['election'],
      plain: ['body'],
      signers: [{ title: 'Сонгуулийн хорооны дарга', author: true }, LEGAL],
    },
  },
  choloolol: {
    slug: 'choloolol',
    label: 'Албан тушаалаас чөлөөлөх',
    code: 'ГЦ',
    group: 'rules',
    icon: 'undo',
    description: 'Хэлтсийн дарга эсвэл гишүүн өөрийн хүсэлтээр чөлөөлөгдөхөд үйлдэнэ. Тэргүүн батална.',
    chain: ['president'],
    fields: [
      { name: 'person', label: 'Овог, нэр', type: 'text', required: true, hint: 'Жишээ нь: Баяржаргалын Номин-Эрдэнэ' },
      { name: 'position', label: 'Албан тушаал', type: 'text', required: true, hint: 'Жишээ нь: Хэлтсийн дарга' },
      { name: 'department', label: 'Хэлтэс', type: 'text', required: true, hint: 'Жишээ нь: Дотоод хэлтэс' },
      { name: 'term_start', label: 'Албан тушаалд томилогдсон огноо', type: 'date', required: true },
      { name: 'request_date', label: 'Чөлөөлөгдөх хүсэлт гаргасан огноо', type: 'date', required: true },
      { name: 'effective_date', label: 'Чөлөө хүчин төгөлдөр болох огноо', type: 'date', required: true },
    ],
    print: {
      kind: 'АЛБАН ТУШААЛААС ӨӨРИЙН ХҮСЭЛТЭЭР ЧӨЛӨӨЛӨГДСӨН ТУХАЙ',
      signers: [PRESIDENT, { title: 'Албан тушаалтан', field: 'person' }],
      template: [
        {
          heading: 'Нэг. Ерөнхий заалт',
          paragraphs: [
            'Энэхүү бичиг нь Бээжингийн Их Сургуулийн Монгол Оюутны Холбоо (цаашид «Холбоо» гэх)-ны дотоод зохион байгуулалтын хүрээнд ажиллаж байсан албан тушаалтан өөрийн хүсэлтээр албан тушаалаасаа чөлөөлөгдөж байгааг баталгаажуулах зорилготой. Энэхүү баримт бичиг нь хуулийн ямар нэгэн хариуцлага хүлээлгэхгүй бөгөөд Холбооны дотоод үйл ажиллагааны баримт бичигт хамаарна.',
          ],
        },
        {
          heading: 'Хоёр. Албан тушаалтны мэдээлэл',
          facts: [
            { label: 'Овог, нэр', field: 'person' },
            { label: 'Албан тушаал', field: 'position' },
            { label: 'Хэлтэс', field: 'department' },
            { label: 'Албан тушаалд томилогдсон огноо', field: 'term_start', date: true },
            { label: 'Чөлөөлөгдөх хүсэлт гаргасан огноо', field: 'request_date', date: true },
            { label: 'Чөлөө хүчин төгөлдөр болох огноо', field: 'effective_date', date: true },
          ],
        },
        {
          heading: 'Гурав. Нөхцөл, журам',
          items: [
            'Албан тушаалтан өөрийн хүсэлтээр огцрох өргөдлөө бичгээр ирүүлсэн бөгөөд Холбоо тухайн хүсэлтийг хүлээн авсан.',
            'Огцрох шийдвэр нь Холбооны Үндсэн дүрмийн холбогдох заалтын дагуу хүчин төгөлдөр болно.',
            'Албан тушаалтан үүрэг хариуцлагынхаа хүрээнд хүлээлгэн өгөх шаардлагатай бүх баримт бичиг, тайлан, мэдээллийг дараагийн томилогдох хүнд хүлээлгэн өгөх үүрэгтэй.',
            'Огцрох үйл явцыг Холбооны дотоод зохицуулалт, архив, бүртгэлд албан ёсоор тэмдэглэнэ.',
          ],
        },
        {
          heading: 'Дөрөв. Хүчин төгөлдөр байдал',
          items: ['Энэхүү албан бичигт гарын үсэг зурсан мөчөөс эхлэн хүчин төгөлдөр үйлчилнэ.', 'Энэхүү бичгийг Холбооны дотоод архивт хадгална.'],
        },
        {
          heading: 'Тав. Талархал',
          paragraphs: [
            'Холбоо нь албан тушаалтан таны бүрэн эрхийн хугацаанд оруулсан хувь нэмэр, хичээл зүтгэлд чин сэтгэлээсээ талархал илэрхийлж, цаашдын сурлага, ажлын амжилтыг хүсье.',
          ],
        },
      ],
    },
  },
};

export const RECORD_TYPE_LIST = Object.values(RECORD_TYPES);

export const TYPE_GROUPS: { key: RecordType['group']; label: string }[] = [
  { key: 'work', label: 'Өдөр тутмын ажил' },
  { key: 'rules', label: 'Дүрэм, сонгууль, томилгоо' },
];

export function getRecordType(slug: string): RecordType | null {
  return RECORD_TYPES[slug] ?? null;
}

/** The large heading on the printed page. */
export function printKind(type: RecordType, fields: Record<string, string>): string {
  return typeof type.print.kind === 'function' ? type.print.kind(fields) : type.print.kind;
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
    else if (raw && f.type === 'select' && !f.options?.includes(raw)) errors[f.name] = 'Жагсаалтаас сонгоно уу.';
    values[f.name] = raw;
  }
  return { values, errors, ok: Object.keys(errors).length === 0 };
}
