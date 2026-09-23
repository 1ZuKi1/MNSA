/**
 * Association-wide settings the President controls. Today there is one: the official stamp (тамга),
 * printed on documents the President approved. The image lives in the media database marked private,
 * so it is served only behind the staff login (/tamga), never on the public site.
 */
import { auditStmt, db, one, stmt } from './db';
import { now } from './time';

const STAMP = 'stamp_media_id';

export async function stampId(): Promise<string | null> {
  const row = await one<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, STAMP);
  return row?.value ?? null;
}

export async function setStamp(userId: number, mediaId: string, ip: string | null) {
  await db().batch([
    stmt(
      `INSERT INTO settings (key, value, updated_by, updated_at) VALUES (?1, ?2, ?3, ?4)
       ON CONFLICT(key) DO UPDATE SET value = ?2, updated_by = ?3, updated_at = ?4`,
      STAMP, mediaId, userId, now(),
    ),
    auditStmt(userId, 'settings.stamp', null, null, undefined, ip),
  ]);
}

export async function clearStamp(userId: number, ip: string | null) {
  await db().batch([stmt(`DELETE FROM settings WHERE key = ?`, STAMP), auditStmt(userId, 'settings.stamp.remove', null, null, undefined, ip)]);
}
