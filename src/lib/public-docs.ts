/**
 * Documents published on the public site for everyone to read (Үндсэн дүрэм 10.1.4, 52).
 * The files live in public/files/. When the Их Хуралдаан adopts a new version: add the new PDF with its
 * adoption date in the file name, point `href` at it and update the facts below — keep the old file, so
 * links people saved still work.
 */
export const CONSTITUTION = {
  href: '/files/undsen-durem-2025-11-08.pdf',
  download: 'МОХ Үндсэн дүрэм 2025.11.08.pdf',
  version: 'Анхдугаар шинэчилсэн найруулга',
  adopted: '2025 оны 11 дүгээр сарын 8',
  counts: '13 бүлэг, 53 зүйл, 247 заалт',
  pages: 27,
  size: '0.6 МБ',
  chapters: [
    ['Ерөнхий үндэслэл', '1–5'],
    ['Зорилго', '6–7'],
    ['Гишүүнчлэл', '8–15'],
    ['Их Хуралдаан', '16–19'],
    ['Холбооны бүтэц', '20–23'],
    ['Санхүү', '24–27'],
    ['Ёс зүй', '28–30'],
    ['Хамтын ажиллагаа ба олон нийттэй харилцах', '31–32'],
    ['Хурал', '33–35'],
    ['Хяналт ба удирдлага', '36–37'],
    ['Дотоод журам ба үйл ажиллагааны дэг', '38–39'],
    ['Сонгууль', '40–47'],
    ['Бусад заалт', '48–53'],
  ] as const,
};
