import { describe, expect, it } from 'vitest';
import { b64url, fromB64url } from '../src/lib/crypto';
import { buildPushRequest, encryptPayload, generateVapidKeys, isPushEndpoint, vapidAuthorization } from '../src/lib/webpush';

const enc = new TextEncoder();

/** A pretend phone: its own key pair and auth secret, as the browser would make them. */
async function fakePhone() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', pair.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { pair, p256dh: b64url(pub), auth: b64url(auth), pub, authBytes: auth };
}

type Bytes = Uint8Array<ArrayBuffer>;
const b = (x: Uint8Array): Bytes => new Uint8Array(x);

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** What the phone does on receipt (RFC 8291 §3–4), written out separately from the sender. */
async function phoneDecrypts(phone: Awaited<ReturnType<typeof fakePhone>>, body: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  expect(rs).toBe(4096);
  expect(idlen).toBe(65);

  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, phone.pair.privateKey, 256));
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...phone.pub, ...asPublic]);
  const ikm = await hkdf(phone.authBytes, shared, info, 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  expect(plain.at(-1)).toBe(2); // last-record delimiter
  return new TextDecoder().decode(plain.slice(0, -1));
}

describe('web push encryption', () => {
  it('the phone can read what we send it', async () => {
    const phone = await fakePhone();
    const text = JSON.stringify({ title: 'Таны шийдвэр хүлээж байна', body: '«Албан бичиг» таны хяналтад ирлээ.', url: '/barimt/3' });
    const body = await encryptPayload(phone, enc.encode(text));
    expect(await phoneDecrypts(phone, body)).toBe(text);
  });

  it('every message is encrypted differently', async () => {
    const phone = await fakePhone();
    const a = await encryptPayload(phone, enc.encode('x'));
    const b = await encryptPayload(phone, enc.encode('x'));
    expect(b64url(a)).not.toBe(b64url(b));
  });

  it('a different phone cannot read it', async () => {
    const phone = await fakePhone();
    const other = await fakePhone();
    const body = await encryptPayload(phone, enc.encode('secret'));
    await expect(phoneDecrypts({ ...other, pub: phone.pub, authBytes: phone.authBytes }, body)).rejects.toThrow();
  });

  it('refuses malformed keys', async () => {
    await expect(encryptPayload({ p256dh: b64url(new Uint8Array(10)), auth: b64url(new Uint8Array(16)) }, enc.encode('x'))).rejects.toThrow();
  });
});

describe('VAPID', () => {
  it('signs a token the push service can verify with our public key', async () => {
    const keys = await generateVapidKeys();
    const v = { ...keys, subject: 'https://pkumongolia.com' };
    const endpoint = 'https://web.push.apple.com/QGuQyavXutnMH7aBXRUiFtiAK0yObwrvq2Fdh6Msxm4';
    const header = await vapidAuthorization(endpoint, v, 1_800_000_000);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m).toBeTruthy();
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[2])));
    expect(claims).toEqual({ aud: 'https://web.push.apple.com', exp: 1_800_003_600, sub: 'https://pkumongolia.com' });

    const pub = await crypto.subtle.importKey('raw', b(fromB64url(keys.publicKey)), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b(fromB64url(m[3])), enc.encode(`${m[1]}.${m[2]}`));
    expect(ok).toBe(true);
  });

  it('builds a complete request', async () => {
    const keys = await generateVapidKeys();
    const phone = await fakePhone();
    const req = await buildPushRequest(
      { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: phone.p256dh, auth: phone.auth },
      { title: 'T', body: 'B', url: '/' },
      { ...keys, subject: 'https://pkumongolia.com' },
    );
    expect(req.method).toBe('POST');
    expect(req.headers.get('content-encoding')).toBe('aes128gcm');
    expect(req.headers.get('ttl')).toBe('86400');
    const body = new Uint8Array(await req.arrayBuffer());
    expect(JSON.parse(await phoneDecrypts(phone, body))).toEqual({ title: 'T', body: 'B', url: '/' });
  });
});

describe('push endpoints', () => {
  it('accepts the real push services', () => {
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
  });
  it('refuses anything else', () => {
    expect(isPushEndpoint('http://web.push.apple.com/abc')).toBe(false);
    expect(isPushEndpoint('https://evil.example/web.push.apple.com')).toBe(false);
    expect(isPushEndpoint('https://web.push.apple.com.evil.example/abc')).toBe(false);
    expect(isPushEndpoint('https://web.push.apple.com:8443/abc')).toBe(false);
    expect(isPushEndpoint('https://127.0.0.1/abc')).toBe(false);
    expect(isPushEndpoint('not a url')).toBe(false);
  });
});
