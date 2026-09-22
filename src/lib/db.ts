import { env } from 'cloudflare:workers';
import { now } from './time';

export const db = (): D1Database => env.DB;
export const mediaDb = (): D1Database => env.MEDIA;

export async function one<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  return (await db().prepare(sql).bind(...params).first<T>()) ?? null;
}

export async function many<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db().prepare(sql).bind(...params).all<T>()).results;
}

export async function run(sql: string, ...params: unknown[]) {
  return db().prepare(sql).bind(...params).run();
}

export const stmt = (sql: string, ...params: unknown[]) => db().prepare(sql).bind(...params);

/** Every consequential action is written here. Never updated, never deleted. */
export function auditStmt(
  actorId: number | null,
  action: string,
  entityType: string | null,
  entityId: string | number | null,
  detail?: unknown,
  ip?: string | null,
) {
  return stmt(
    `INSERT INTO audit_log (actor_id, action, entity_type, entity_id, detail, ip, created_at) VALUES (?,?,?,?,?,?,?)`,
    actorId,
    action,
    entityType,
    entityId === null ? null : String(entityId),
    detail === undefined ? null : typeof detail === 'string' ? detail : JSON.stringify(detail),
    ip ?? null,
    now(),
  );
}

export async function audit(...args: Parameters<typeof auditStmt>) {
  await auditStmt(...args).run();
}

export interface DeptRow {
  id: number;
  slug: string;
  code: string;
  name_mn: string;
  is_leadership: number;
}

let deptCache: DeptRow[] | null = null;
/** Departments never change at runtime (they're fixed in the first migration), so cache per isolate. */
export async function departments(): Promise<DeptRow[]> {
  deptCache ??= await many<DeptRow>(`SELECT id, slug, code, name_mn, is_leadership FROM departments ORDER BY sort_order`);
  return deptCache;
}
export async function deptBySlug(slug: string) {
  return (await departments()).find((d) => d.slug === slug) ?? null;
}
export async function deptById(id: number | null) {
  return id === null ? null : ((await departments()).find((d) => d.id === id) ?? null);
}

/**
 * Fixed-window rate limit in D1. Returns true if this hit is allowed.
 * D1 rather than KV: 100,000 free writes a day instead of 1,000.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<boolean> {
  const t = now();
  const row = await one<{ count: number }>(
    `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN window_start <= ?2 - ?3 THEN 1 ELSE count + 1 END,
       window_start = CASE WHEN window_start <= ?2 - ?3 THEN ?2 ELSE window_start END
     RETURNING count`,
    key,
    t,
    windowSec,
  );
  return (row?.count ?? 1) <= limit;
}
