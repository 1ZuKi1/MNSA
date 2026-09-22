/**
 * One-time email codes. No passwords exist anywhere in this system.
 * The code is stored only as HMAC(SESSION_SECRET, purpose|email|code): a leaked database
 * doesn't allow brute-forcing the 1,000,000 possible codes without the secret.
 */
import { env } from 'cloudflare:workers';
import { hmacHex, randomCode, safeEqual } from './crypto';
import { audit, one, rateLimit, run } from './db';
import { secret } from './session';
import { now } from './time';

const CODE_TTL = 10 * 60;
const MAX_ATTEMPTS = 5;

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const looksLikeEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

const codeHash = (purpose: string, email: string, code: string) => hmacHex(secret(), `${purpose}|${email}|${code}`);

/**
 * Rate limit for code requests: 3 per address per 15 min, 30 per IP per hour.
 * The IP limit is deliberately loose: a whole meeting may log in at once from behind PKU's campus NAT,
 * which shares a few public IPs. The per-address limit and Turnstile are the real protection.
 * Applied whether or not the address belongs to anyone, so behaviour never reveals the member list.
 */
export async function codeRateOk(email: string, ip: string | null): Promise<boolean> {
  const okEmail = await rateLimit(`code:e:${email}`, 3, 15 * 60);
  const okIp = await rateLimit(`code:ip:${ip ?? 'none'}`, 30, 60 * 60);
  return okEmail && okIp;
}

/** Issue a code for (email, purpose). Returns the raw code so the caller can mail it. */
export async function issueCode(email: string, purpose: string): Promise<string> {
  const code = randomCode();
  await run(
    `INSERT INTO login_codes (email, purpose, code_hash, expires_at, attempts, created_at)
     VALUES (?1, ?2, ?3, ?4, 0, ?5)
     ON CONFLICT(email, purpose) DO UPDATE SET code_hash = ?3, expires_at = ?4, attempts = 0, created_at = ?5`,
    email,
    purpose,
    await codeHash(purpose, email, code),
    now() + CODE_TTL,
    now(),
  );
  // Opportunistic cleanup — no cron needed.
  await run(`DELETE FROM login_codes WHERE expires_at < ?`, now() - 3600);
  return code;
}

export type VerifyResult = 'ok' | 'wrong' | 'expired' | 'locked';

export async function verifyCode(email: string, purpose: string, code: string): Promise<VerifyResult> {
  const row = await one<{ code_hash: string; expires_at: number; attempts: number }>(
    `SELECT code_hash, expires_at, attempts FROM login_codes WHERE email = ? AND purpose = ?`,
    email,
    purpose,
  );
  if (!row || row.expires_at < now()) return 'expired';
  if (row.attempts >= MAX_ATTEMPTS) return 'locked';

  const clean = code.replace(/\D/g, '');
  if (clean.length === 6 && safeEqual(await codeHash(purpose, email, clean), row.code_hash)) {
    await run(`DELETE FROM login_codes WHERE email = ? AND purpose = ?`, email, purpose); // single use
    return 'ok';
  }
  await run(`UPDATE login_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?`, email, purpose);
  if (row.attempts + 1 >= MAX_ATTEMPTS) await audit(null, 'login.locked', 'email', email);
  return 'wrong';
}

/** Cloudflare Turnstile. Skipped when no secret is configured (local dev). */
export async function turnstileOk(token: string | null, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) return true;
  if (!token) return false;
  const body = new FormData();
  body.append('secret', env.TURNSTILE_SECRET);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = (await res.json()) as { success?: boolean };
  return data.success === true;
}
