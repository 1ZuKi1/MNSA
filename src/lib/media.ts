/**
 * Photo storage in a dedicated D1 database (no R2 → no card needed).
 * Images arrive already shrunk by the browser (src/components/PhotoUpload.astro).
 */
import { randomToken } from './crypto';
import { mediaDb } from './db';
import { now } from './time';

export const MAX_BYTES = 1_800_000; // D1 caps a row at 2 MB
const ALLOWED = new Set(['image/jpeg', 'image/webp', 'image/png']);

/** Check the file really is the image type it claims (magic bytes), not just its label. */
function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

export class BadImage extends Error {}

export async function storeImage(
  file: File,
  userId: number,
  width?: number,
  height?: number,
  opts: { private?: boolean; allow?: string[] } = {},
): Promise<string> {
  if (file.size > MAX_BYTES) throw new BadImage('too-large');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime || !ALLOWED.has(mime) || (opts.allow && !opts.allow.includes(mime))) throw new BadImage('type');
  const id = randomToken(16); // unguessable: the URL is the permission
  await mediaDb()
    .prepare(`INSERT INTO media (id, mime, bytes, width, height, size, private, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(id, mime, bytes, width ?? null, height ?? null, bytes.byteLength, opts.private ? 1 : 0, userId, now())
    .run();
  return id;
}

/** Public by default: a private image (the stamp) is only returned when the caller asks for it explicitly. */
export async function loadImage(id: string, opts: { private?: boolean } = {}): Promise<{ mime: string; bytes: ArrayBuffer } | null> {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(id)) return null;
  const row = await mediaDb()
    .prepare(`SELECT mime, bytes FROM media WHERE id = ? AND private = ?`)
    .bind(id, opts.private ? 1 : 0)
    .first<{ mime: string; bytes: number[] | ArrayBuffer }>();
  if (!row) return null;
  const bytes = row.bytes instanceof ArrayBuffer ? row.bytes : new Uint8Array(row.bytes).buffer;
  return { mime: row.mime, bytes };
}

export const mediaUrl = (id: string | null | undefined) => (id ? `/media/${id}` : null);
