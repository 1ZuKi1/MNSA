#!/usr/bin/env node
/**
 * Put the year's team into the live site in one go, from a members list (CSV) — instead of the President
 * creating an invite per person. Everyone then just logs in with their own e-mail and a code.
 *
 *   npm run import:members -- path/to/members.csv            live database (asks before writing)
 *   npm run import:members -- path/to/members.csv --dry-run   only check the file and show what would happen
 *   npm run import:members -- path/to/members.csv --local     your local test database
 *
 * The CSV holds names, student IDs and e-mails: keep it OUT of git (neccesary-files/ is ignored).
 * Format: see scripts/members-import-lib.mjs. People already in the database (same e-mail) are left alone,
 * so running it twice is safe.
 *
 * Refuses to run while the live database still holds the demo accounts: that is the test site, where
 * login codes are shown on screen to anyone.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { membersSql, parseMembers } from './members-import-lib.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const local = args.includes('--local');
const dry = args.includes('--dry-run');
const where = local ? '--local' : '--remote';
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

if (!file) {
  console.error('Usage: npm run import:members -- <members.csv> [--dry-run] [--local]');
  process.exit(1);
}

const { people, skipped, errors } = parseMembers(readFileSync(file, 'utf8'));
for (const s of skipped) console.log(`  skipped  ${s}`);
if (errors.length) {
  for (const e of errors) console.error(red(`  error    ${e}`));
  console.error(red('\nNothing was imported. Fix the file and run again.'));
  process.exit(1);
}

const LABEL = { president: 'Тэргүүн', board: 'Удирдах зөвлөл', head: 'Хэлтсийн дарга', member: 'Гишүүн', maintainer: 'Техникийн хариуцагч' };
console.log(bold(`\n${people.length} people in ${file}:`));
for (const p of people) console.log(`  ${p.name.padEnd(18)} ${LABEL[p.role].padEnd(20)} ${(p.dept ?? '—').padEnd(10)} ${p.email}${p.showPublic ? '' : '  (hidden from the public page)'}`);
if (dry) {
  console.log('\n--dry-run: nothing written.');
  process.exit(0);
}

function wrangler(cmd) {
  const r = spawnSync(`npx wrangler ${cmd}`, { shell: true, encoding: 'utf8' });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0) {
    console.error(out);
    if (/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i.test(out)) console.error(red('→ Network problem reaching Cloudflare. Turn the VPN on and try again.'));
    process.exit(1);
  }
  return r.stdout ?? '';
}

if (!local) {
  const out = wrangler(`d1 execute mnsa-db --remote --json --command "SELECT COUNT(*) AS n FROM users WHERE email LIKE '%@demo.test'"`);
  const demo = JSON.parse(out.slice(out.search(/[[{]/)))[0]?.results?.[0]?.n ?? 0;
  if (demo > 0) {
    console.error(red(`\nThe live database still has ${demo} demo accounts — it is the TEST site, where anyone can log in.`));
    console.error(red('Real names and student IDs must not go there. Go live first (README → First deployment), then run this again.'));
    process.exit(1);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`\nAdd these ${people.length} people to the LIVE site? Type yes: `);
  rl.close();
  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('Stopped. Nothing written.');
    process.exit(0);
  }
}

const dir = mkdtempSync(join(tmpdir(), 'mnsa-import-'));
const sqlFile = join(dir, 'members.sql');
try {
  writeFileSync(sqlFile, membersSql(people));
  wrangler(`d1 execute mnsa-db ${where} --file="${sqlFile}"`);
} finally {
  rmSync(dir, { recursive: true, force: true }); // the SQL holds personal data: never leave it behind
}
console.log(bold(`\nDone.`) + ` Everyone above can now log in at the staff site with their e-mail; a code is sent there.`);
console.log('People already in the database were left as they were.');
