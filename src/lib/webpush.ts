/**
 * Web Push with nothing but Web Crypto, so it runs in the Worker without a library.
 *
 *   VAPID (RFC 8292)        proves to Apple's / Google's push service that the message comes from us
 *   aes128gcm (RFC 8291)    encrypts the message so only that one phone can read it
 *
 * Kept free of `cloudflare:workers` imports so the tests can run it in Node (tests/webpush.test.ts).
 */
import { b64url, fromB64url } from './crypto';

const enc = new TextEncoder();
/** Web Crypto wants bytes backed by a plain ArrayBuffer; `new Uint8Array(x)` copies into one. */
type Bytes = Uint8Array<ArrayBuffer>;
const bytes = (x: Uint8Array): Bytes => new Uint8Array(x);

export interface PushSubscriptionKeys {
  endpoint: string;
  /** The phone's public key, base64url (65 bytes uncompressed P-256). */
  p256dh: string;
  /** The phone's auth secret, base64url (16 bytes). */
  auth: string;
}

export interface VapidKeys {
  /** base64url, 65-byte uncompressed P-256 point — the same string the browser gets as applicationServerKey. */
  publicKey: string;
  /** base64url, the 32-byte private scalar (JWK "d"). */
  privateKey: string;
  /** mailto: or https: — push services contact this if we misbehave. Apple refuses anything else. */
  subject: string;
}

/** Push services we're willing to POST to. Anything else is refused, so a forged subscription can't make the Worker call arbitrary URLs. */
const PUSH_HOSTS = [
  /^web\.push\.apple\.com$/,
  /(^|\.)push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^push\.services\.mozilla\.com$/,
  /\.notify\.windows\.com$/,
];

export function isPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}

function concat(...parts: Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, length: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** The private key as Web Crypto wants it: the JWK needs x and y, which are inside the public key. */
async function vapidSigningKey(v: VapidKeys): Promise<CryptoKey> {
  const pub = fromB64url(v.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID public key must be a 65-byte uncompressed P-256 point');
  return crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: v.privateKey, x: b64url(pub.slice(1, 33)), y: b64url(pub.slice(33, 65)), ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}

/** "vapid t=<JWT>, k=<public key>" for one push service. Valid for an hour (Apple refuses long-lived tokens). */
export async function vapidAuthorization(endpoint: string, v: VapidKeys, nowSec = Math.floor(Date.now() / 1000)): Promise<string> {
  const aud = new URL(endpoint).origin;
  const head = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64url(enc.encode(JSON.stringify({ aud, exp: nowSec + 3600, sub: v.subject })));
  // Web Crypto's ECDSA signature is already r‖s (64 bytes), which is exactly what JWS ES256 wants.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidSigningKey(v), enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${v.publicKey}`;
}

/**
 * RFC 8291 encryption, one record. `ephemeral` and `salt` are only passed by the tests;
 * normally both are fresh and random for every message.
 */
export async function encryptPayload(
  sub: Pick<PushSubscriptionKeys, 'p256dh' | 'auth'>,
  payload: Uint8Array,
  opts: { ephemeral?: CryptoKeyPair; salt?: Bytes } = {},
): Promise<Bytes> {
  const uaPublic = bytes(fromB64url(sub.p256dh));
  const authSecret = bytes(fromB64url(sub.auth));
  if (uaPublic.length !== 65 || authSecret.length < 16) throw new Error('bad subscription keys');

  const as = opts.ephemeral ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey('raw', as.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last (and only) record; no padding.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));

  const rs = 4096;
  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  return concat(header, asPublic, cipher);
}

export interface PushMessage {
  title: string;
  body: string;
  /** Opened when the notification is tapped; a path on the staff site. */
  url: string;
  /** A later message with the same tag replaces the earlier one instead of stacking. */
  tag?: string;
}

/** Everything fetch() needs to deliver one message to one phone. */
export async function buildPushRequest(sub: PushSubscriptionKeys, msg: PushMessage, v: VapidKeys, ttlSec = 24 * 3600): Promise<Request> {
  if (!isPushEndpoint(sub.endpoint)) throw new Error('not a push service endpoint');
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(msg)));
  return new Request(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, v),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttlSec),
      Urgency: 'high',
    },
    body,
  });
}

/** A fresh VAPID key pair (used by scripts/push-keys.mjs, and by the tests). */
export async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const raw = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey('jwk', pair.privateKey)) as JsonWebKey;
  return { publicKey: b64url(raw), privateKey: jwk.d! };
}
