/**
 * Association-wide settings the President controls: the two official stamps (тамга).
 *  - round  («Дугуй тамга»): printed on every document the President approved.
 *  - square («Дөрвөлжин тамга», the Mongolian-script one): only on the official blank — documents that go to
 *    other organisations (Албан бичиг, Хамтын ажиллагаа).
 * The images live in the media database marked private, so they are served only behind the staff login
 * (/tamga, /tamga?kind=square), never on the public site.
 */
import { auditStmt, db, one, stmt } from './db';
import { now } from './time';

export type StampKind = 'round' | 'square';
export const STAMP_KINDS: StampKind[] = ['round', 'square'];
export const STAMP_LABEL: Record<StampKind, string> = { round: 'Дугуй тамга', square: 'Дөрвөлжин тамга' };

/** The round stamp keeps the key it always had, so a stamp uploaded before stays in place. */
const KEY: Record<StampKind, string> = { round: 'stamp_media_id', square: 'stamp_square_media_id' };

export const stampKind = (v: string | null | undefined): StampKind => (v === 'square' ? 'square' : 'round');

export async function stampId(kind: StampKind = 'round'): Promise<string | null> {
  const row = await one<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, KEY[kind]);
  return row?.value ?? null;
}

/** The URL a printed page uses for a stamp; the version makes a replaced stamp show at once. */
export const stampUrl = (kind: StampKind, id: string) => (kind === 'square' ? `/tamga?kind=square&v=${id}` : `/tamga?v=${id}`);

export async function setStamp(userId: number, mediaId: string, ip: string | null, kind: StampKind = 'round') {
  await db().batch([
    stmt(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(key) DO UPDATE SET value = ?2, updated_by = ?3, updated_at = ?4`,
      KEY[kind], mediaId, userId, now(),
    ),
    auditStmt(userId, 'settings.stamp', null, null, { kind }, ip),
  ]);
}

export async function clearStamp(userId: number, ip: string | null, kind: StampKind = 'round') {
  await db().batch([stmt(`DELETE FROM settings WHERE key = ?`, KEY[kind]), auditStmt(userId, 'settings.stamp.remove', null, null, { kind }, ip)]);
}
