/**
 * Notifications on the phone. The team web is installable as an app (public/manifest.webmanifest,
 * public/sw.js); a person who turns notifications on gets a row in push_subscriptions per device, and
 * the same moments that send an email (a document waiting for you, a job given to you) also send a push.
 * Unlike email, push is free and unlimited, so it also covers a few moments email never did
 * (your document approved or returned, money requests).
 *
 * Needs VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (`npm run push:keys`). Without them the feature hides itself.
 * Sending never throws: a failed push must never stop a document from being approved.
 */
import { env } from 'cloudflare:workers';
import { audit, db, many, run, stmt } from './db';
import { now } from './time';
import { buildPushRequest, isPushEndpoint, type PushMessage, type PushSubscriptionKeys, type VapidKeys } from './webpush';

export type { PushMessage };

function vapid(): VapidKeys | null {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject: env.VAPID_SUBJECT?.trim() || 'https://pkumongolia.com' };
}

/** The key the browser needs to subscribe; null when push isn't set up on this deployment. */
export const pushPublicKey = (): string | null => vapid()?.publicKey ?? null;

/** A short name for the device, for the list on the notifications page. */
export function deviceName(ua: string | null): string {
  const s = ua ?? '';
  if (/iPad/.test(s)) return 'iPad';
  if (/iPhone|iPod/.test(s)) return 'iPhone';
  if (/Android/.test(s)) return 'Android';
  if (/Macintosh|Mac OS X/.test(s)) return 'Mac';
  if (/Windows/.test(s)) return 'Windows';
  if (/Linux/.test(s)) return 'Linux';
  return 'Төхөөрөмж';
}

const KEY = /^[A-Za-z0-9_-]{16,200}$/;

/** Checks what the browser sent. Returns null if it isn't a real subscription. */
export function parseSubscription(v: unknown): PushSubscriptionKeys | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const endpoint = typeof o.endpoint === 'string' ? o.endpoint : '';
  const p256dh = typeof o.keys?.p256dh === 'string' ? o.keys.p256dh : '';
  const auth = typeof o.keys?.auth === 'string' ? o.keys.auth : '';
  if (endpoint.length > 1000 || !isPushEndpoint(endpoint) || !KEY.test(p256dh) || !KEY.test(auth)) return null;
  return { endpoint, p256dh, auth };
}

/** Saves this device for this person. A device that changed hands (someone else logged in on it) moves to the new person. */
export async function saveSubscription(userId: number, s: PushSubscriptionKeys, ua: string | null) {
  await run(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, device, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = ?1, p256dh = ?3, auth = ?4, device = ?5`,
    userId,
    s.endpoint,
    s.p256dh,
    s.auth,
    deviceName(ua),
    now(),
  );
}

export async function removeSubscription(userId: number, endpoint: string) {
  await run(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`, userId, endpoint);
}

export async function removeSubscriptionById(userId: number, id: number) {
  await run(`DELETE FROM push_subscriptions WHERE user_id = ? AND id = ?`, userId, id);
}

export interface DeviceRow {
  id: number;
  endpoint: string;
  device: string | null;
  created_at: number;
  last_ok_at: number | null;
}
export const myDevices = (userId: number) =>
  many<DeviceRow>(`SELECT id, endpoint, device, created_at, last_ok_at FROM push_subscriptions WHERE user_id = ? ORDER BY created_at`, userId);

interface SubRow extends PushSubscriptionKeys {
  id: number;
  user_id: number;
}

/**
 * Sends one message to every device of these people (active accounts only). Duplicates and nulls are
 * dropped, so callers can pass whatever list they have. Never throws.
 */
export async function pushToUsers(userIds: (number | null | undefined)[], msg: PushMessage): Promise<number> {
  const keys = vapid();
  const ids = [...new Set(userIds.filter((x): x is number => typeof x === 'number'))];
  if (!keys || ids.length === 0) return 0;
  try {
    const subs = await many<SubRow>(
      `SELECT s.id, s.user_id, s.endpoint, s.p256dh, s.auth
         FROM push_subscriptions s JOIN users u ON u.id = s.user_id
        WHERE u.status = 'active' AND s.user_id IN (${ids.map(() => '?').join(',')})`,
      ...ids,
    );
    const results = await Promise.allSettled(
      subs.map(async (s) => {
        const res = await fetch(await buildPushRequest(s, msg, keys));
        return { s, status: res.status, reply: res.ok ? '' : (await res.text()).slice(0, 300) };
      }),
    );
    const t = now();
    const ok: number[] = [];
    const gone: number[] = [];
    const failed: { status: number; reply: string }[] = [];
    results.forEach((r, i) => {
      if (r.status === 'rejected') failed.push({ status: 0, reply: String(r.reason).slice(0, 300) });
      else if (r.value.status >= 200 && r.value.status < 300) ok.push(subs[i].id);
      // 404/410: the phone unsubscribed, the app was removed, or the subscription expired.
      else if (r.value.status === 404 || r.value.status === 410) gone.push(subs[i].id);
      else failed.push({ status: r.value.status, reply: r.value.reply });
    });
    const writes = [
      ...ok.map((id) => stmt(`UPDATE push_subscriptions SET last_ok_at = ? WHERE id = ?`, t, id)),
      ...gone.map((id) => stmt(`DELETE FROM push_subscriptions WHERE id = ?`, id)),
    ];
    if (writes.length) await db().batch(writes);
    if (failed.length) {
      // Written to the activity log, like failed emails, so a wrong key or a refused token can be seen without logs.
      console.error('push failed', failed);
      await audit(null, 'push_failed', 'push', null, { count: failed.length, first: failed[0] });
    }
    return ok.length;
  } catch (e) {
    console.error('push error', e);
    return 0;
  }
}

/** Notification text is short: the lock screen shows about two lines. */
export const clip = (s: string, max = 90) => (s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s);
