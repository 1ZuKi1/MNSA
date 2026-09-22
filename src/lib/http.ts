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

/** Only ever redirect to a path on this same site. */
export function safeNext(v: string | null | undefined, fallback = '/'): string {
  if (!v || !v.startsWith('/') || v.startsWith('//') || v.includes('\\')) return fallback;
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
  published: 'Нийтэллээ. Нийтийн хуудсанд 5 минутын дотор харагдана.',
  unpublished: 'Нийтлэлээс буцаалаа.',
  cancelled: 'Цуцаллаа.',
  taken: 'Ажлыг хүлээн авлаа. Баярлалаа!',
  assigned: 'Хуваариллаа.',
  done: 'Дууссан гэж тэмдэглэлээ.',
  dropped: 'Ажлаас гарлаа.',
  photo: 'Зураг нэмлээ.',
  renewed: 'Эрхийг сунгалаа.',
  removed: 'Хаслаа.',
  deputy: 'Орлогчийг томиллоо.',
  revoked: 'Урилгыг цуцаллаа.',
  denied: 'Танд энэ үйлдлийг хийх эрх байхгүй.',
  conflict: 'Өөр хүн энэ хооронд өөрчилсөн байна. Хуудсаа дахин ачаалаад оролдоно уу.',
  comment: 'Тайлбар бичих шаардлагатай.',
  invalid: 'Мэдээллээ шалгаад дахин оролдоно уу.',
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
