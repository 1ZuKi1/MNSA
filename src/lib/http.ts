/** Small request/response helpers for form-handling pages. */

export const clientIp = (req: Request) => req.headers.get('cf-connecting-ip');

export function str(fd: FormData, name: string, max = 500): string {
  const v = fd.get(name);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

export function int(v: FormDataEntryValue | string | null | undefined): number | null {
  if (typeof v !== 'string' || !/^\d+$/.test(v)) return null;
  return Number(v);
}

/**
 * Only ever redirect to a path on this same site. Browsers drop tabs and line breaks inside a URL, so
 * "/<tab>/evil.example" would become "//evil.example" — another site. Any control character or space is refused.
 */
export function safeNext(v: string | null | undefined, fallback = '/'): string {
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.includes('\\') || /[\u0000-\u0020\u007f]/.test(v)) return fallback;
  return v;
}

/** Flash messages ride on the redirect URL as a short key; the text lives here. */
export const FLASH: Record<string, string> = {
  saved: 'Хадгаллаа.',
  created: 'Үүсгэлээ.',
  submitted: 'Хянуулахаар илгээлээ.',
  approved: 'Баталлаа.',
  rejected: 'Буцаалаа.',
  withdrawn: 'Эргүүлэн татлаа.',
  voided: 'Хүчингүй болголоо.',
  published: 'Нийтэллээ. Нийтийн хуудсанд одоо харагдаж байна.',
  unpublished: 'Нийтлэлээс буцаалаа.',
  cancelled: 'Цуцаллаа.',
  taken: 'Ажлыг хүлээн авлаа. Баярлалаа!',
  joined: 'Ажилд нэгдлээ. Баярлалаа!',
  left: 'Туслахаа болилоо.',
  assigned: 'Хуваариллаа.',
  done: 'Дууссан гэж тэмдэглэлээ.',
  dropped: 'Ажлаас гарлаа.',
  photo: 'Зураг нэмлээ.',
  portrait: 'Зургийг хадгаллаа. Нийтийн «Удирдлагын баг» хуудсанд шууд харагдана.',
  portrait_removed: 'Зургийг устгалаа.',
  renewed: 'Эрхийг сунгалаа.',
  removed: 'Хаслаа.',
  deputy: 'Орлогчийг томиллоо.',
  budget_keeper: 'Төсвийн хариуцагчаар томиллоо. Тэр одоо «Төсөв» хуудсанд мөр нэмж, хасах боломжтой.',
  budget_keeper_off: 'Төсвийн хариуцагчаас чөлөөллөө.',
  budget_added: 'Мөр нэмлээ. Нийтийн сайтад шууд харагдана.',
  budget_removed: 'Мөрийг нийтийн хүснэгтээс хаслаа. Ажлын орчинд «Хассан мөрүүд» хэсэгт хадгалагдана.',
  budget_year: 'Төсвийн дүнг хадгаллаа.',
  budget_planned: 'Авахаар төлөвлөснийг нэмлээ. Худалдаж авмагцаа «Худалдаж авсан» дарна уу.',
  budget_state: 'Байдлыг шинэчиллээ.',
  budget_bought: 'Худалдаж авсан гэж тэмдэглэлээ. Одоо зарцуулалтад тооцогдоно.',
  budget_confirm_invalid: 'Тоо ширхэг, нэгжийн үнэ, огноог шалгаад дахин оролдоно уу. Огноо ирээдүйд байж болохгүй.',
  money_created: 'Хүсэлтийг илгээлээ. Төсвийн хариуцагч, дараа нь Тэргүүн шийдвэрлэнэ.',
  money_approved: 'Зөвшөөрлөө.',
  money_rejected: 'Татгалзлаа. Шалтгаан хүсэлт гаргагчид харагдана.',
  money_paid: 'Санхүүгийн бүртгэлд тэмдэглэлээ.',
  money_cancelled: 'Хүсэлтээ цуцаллаа.',
  receipt_added: 'Баримтын зургийг нэмлээ.',
  receipt_removed: 'Баримтын зургийг хаслаа.',
  revoked: 'Урилгыг цуцаллаа.',
  denied: 'Танд энэ үйлдлийг хийх эрх байхгүй.',
  conflict: 'Өөр хүн энэ хооронд өөрчилсөн байна. Хуудсаа дахин ачаалаад оролдоно уу.',
  comment: 'Тайлбар бичих шаардлагатай.',
  invalid: 'Мэдээллээ шалгаад дахин оролдоно уу.',
  wrong_dept: 'Хэлтсийн дарга, гишүүн таван хэлтсийн аль нэгэнд харьяалагдана. Удирдлагад зөвхөн Тэргүүн, Удирдах зөвлөл байна.',
  email_taken: 'Энэ и-мэйл хаяг өөр хүнд бүртгэлтэй байна.',
  stamp: 'Тамгыг хадгаллаа. Одооноос Тэргүүний баталсан баримт хэвлэхэд гарна.',
  image: 'Зураг PNG, JPG эсвэл WebP хэлбэртэй, 1.8 МБ-аас бага байх ёстой.',
};

export const flashFrom = (url: URL) => {
  const ok = url.searchParams.get('ok');
  const err = url.searchParams.get('err');
  return {
    ok: ok && FLASH[ok] ? FLASH[ok] : null,
    err: err && FLASH[err] ? FLASH[err] : null,
  };
};

export const withFlash = (path: string, key: string, kind: 'ok' | 'err' = 'ok') =>
  `${path}${path.includes('?') ? '&' : '?'}${kind}=${key}`;
