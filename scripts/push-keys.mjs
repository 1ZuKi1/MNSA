#!/usr/bin/env node
/**
 * Makes the key pair phone notifications need (VAPID), once per deployment.
 *
 *   npm run push:keys              prints the two keys and the commands to store them in Cloudflare
 *   npm run push:keys -- --dev     also writes them into .dev.vars for `npm run dev`
 *
 * Keep the pair forever: a new pair silently stops every phone that already turned notifications on
 * (they'd have to turn them on again). The private key is a secret — never commit it.
 */
import { webcrypto as crypto } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const b64url = (bytes) => Buffer.from(bytes).toString('base64url');

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;

console.log(`
VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}

Store them on the staff Worker (paste each value when wrangler asks):

  npx wrangler secret put VAPID_PUBLIC_KEY
  npx wrangler secret put VAPID_PRIVATE_KEY

Test deployment on workers.dev: the staff Worker is the second one, so add  --name mnsa-dep  to both.
`);

if (process.argv.includes('--dev')) {
  const file = '.dev.vars';
  let text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  text = text.replace(/^VAPID_(PUBLIC|PRIVATE)_KEY=.*\n?/gm, '');
  if (text && !text.endsWith('\n')) text += '\n';
  text += `VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`;
  writeFileSync(file, text);
  console.log('Written into .dev.vars.');
}
