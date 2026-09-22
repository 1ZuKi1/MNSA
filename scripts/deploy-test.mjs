#!/usr/bin/env node
/**
 * Test deployment on free workers.dev addresses — for use BEFORE bdmnsa.com is bought.
 *
 *   npx wrangler login        (once — opens your browser)
 *   npm run deploy:test
 *
 * What it does, safely re-runnable:
 *   1. creates the two D1 databases if they don't exist, and writes their IDs into wrangler.jsonc
 *   2. applies migrations; loads the demo data if the database is empty
 *   3. builds, then deploys the same build twice:
 *        mnsa      → https://mnsa.<you>.workers.dev       public site
 *        mnsa-dep  → https://mnsa-dep.<you>.workers.dev   staff site (SITE_MODE=staff)
 *   4. sets SESSION_SECRET on both if missing
 *
 * TEST_MODE=1 shows login codes on screen (no domain → Resend can't send yet). It only works on
 * *.workers.dev hostnames, so it can never switch on at bdmnsa.com. Don't put real data in the test site.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const DBS = ['mnsa-db', 'mnsa-media'];
const c = { b: (s) => `\x1b[1m${s}\x1b[0m`, g: (s) => `\x1b[32m${s}\x1b[0m`, r: (s) => `\x1b[31m${s}\x1b[0m`, d: (s) => `\x1b[2m${s}\x1b[0m` };
const step = (s) => console.log(`\n${c.b('▸ ' + s)}`);

/** Run a command. stdin is closed, so wrangler runs non-interactively and auto-confirms prompts. */
function run(cmd, { input, quiet = false, allowFail = false } = {}) {
  if (!quiet) console.log(c.d('  $ ' + cmd));
  const r = spawnSync(cmd, { shell: true, encoding: 'utf8', input, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
  if (r.status !== 0 && !allowFail) {
    console.error(out);
    explain(out);
    process.exit(1);
  }
  return { ok: r.status === 0, out, stdout: r.stdout ?? '' };
}

function explain(out) {
  const hints = [
    [/not authenticated|login|You are not logged in/i, 'Run `npx wrangler login` first, then run this again.'],
    [/More than one account|multiple accounts/i, 'Your login has several Cloudflare accounts. Set the association one first:\n    PowerShell:  $env:CLOUDFLARE_ACCOUNT_ID="<account id>"\n  (the ID is on the right-hand side of the Cloudflare dashboard home page)'],
    [/workers\.dev subdomain/i, 'Open the Cloudflare dashboard → Workers & Pages once. It asks you to pick a workers.dev subdomain; pick one, then run this again.'],
    [/fetch failed|ENOTFOUND|ECONNRESET|ETIMEDOUT/i, 'Network problem reaching Cloudflare. If you are in mainland China, turn the VPN on and try again.'],
  ];
  for (const [re, msg] of hints) if (re.test(out)) console.error('\n' + c.r('→ ' + msg));
}

const json = (text) => {
  const start = text.search(/[[{]/);
  return JSON.parse(text.slice(start));
};

// ------------------------------------------------------------------ 0. logged in?
step('Checking Cloudflare login');
const who = run('npx wrangler whoami', { quiet: true, allowFail: true });
if (!who.ok || /not authenticated/i.test(who.out)) {
  console.error(c.r('Not logged in.') + ' Run `npx wrangler login` first, then `npm run deploy:test` again.');
  process.exit(1);
}
console.log(c.g('  logged in'));

// ------------------------------------------------------------------ 1. databases
step('Databases');
let list = json(run('npx wrangler d1 list --json', { quiet: true }).stdout);
for (const name of DBS) {
  if (!list.some((d) => d.name === name)) {
    run(`npx wrangler d1 create ${name}`);
    console.log(c.g(`  created ${name}`));
  } else console.log(`  ${name} exists`);
}
list = json(run('npx wrangler d1 list --json', { quiet: true }).stdout);
let cfg = readFileSync('wrangler.jsonc', 'utf8');
for (const name of DBS) {
  const id = list.find((d) => d.name === name)?.uuid;
  if (!id) throw new Error(`Could not find the ID of ${name}`);
  const re = new RegExp(`("database_name":\\s*"${name}",\\s*"database_id":\\s*")[^"]*(")`);
  if (!re.test(cfg)) throw new Error(`wrangler.jsonc: could not find the ${name} block to update`);
  cfg = cfg.replace(re, `$1${id}$2`);
}
writeFileSync('wrangler.jsonc', cfg);
console.log(c.g('  wrangler.jsonc updated with the real database IDs (commit this change)'));

// ------------------------------------------------------------------ 2. schema + demo data
step('Migrations');
run('npx wrangler d1 migrations apply mnsa-db --remote');
run('npx wrangler d1 migrations apply mnsa-media --remote');
const count = json(run('npx wrangler d1 execute mnsa-db --remote --json --command "SELECT COUNT(*) AS n FROM users"', { quiet: true }).stdout);
if ((count[0]?.results?.[0]?.n ?? 0) === 0) {
  step('Loading demo data (empty database)');
  run('npx wrangler d1 execute mnsa-db --remote --file=./scripts/seed-dev.sql');
} else console.log(`  ${count[0].results[0].n} users already present — demo data not reloaded`);

// ------------------------------------------------------------------ 3. build + deploy twice
step('Building');
run('npm run build');

step('Deploying the public site (mnsa)');
const pub = run('npx wrangler deploy --var TEST_MODE:1');
const publicUrl = pub.out.match(/https:\/\/mnsa\.[a-z0-9-]+\.workers\.dev/i)?.[0];
if (!publicUrl) {
  console.error(pub.out);
  explain(pub.out);
  throw new Error('Deployed, but could not find the workers.dev URL in the output.');
}

step('Deploying the staff site (mnsa-dep)');
const dep = run(`npx wrangler deploy --name mnsa-dep --var TEST_MODE:1 --var SITE_MODE:staff --var PUBLIC_ORIGIN:${publicUrl}`);
const staffUrl = dep.out.match(/https:\/\/mnsa-dep\.[a-z0-9-]+\.workers\.dev/i)?.[0] ?? publicUrl.replace('://mnsa.', '://mnsa-dep.');

// ------------------------------------------------------------------ 4. secrets
step('Session secret');
for (const worker of ['mnsa', 'mnsa-dep']) {
  const has = run(`npx wrangler secret list --name ${worker} --format json`, { quiet: true, allowFail: true });
  if (has.ok && /SESSION_SECRET/.test(has.out)) {
    console.log(`  ${worker}: already set`);
    continue;
  }
  run(`npx wrangler secret put SESSION_SECRET --name ${worker}`, { input: randomBytes(48).toString('base64url') + '\n' });
  console.log(c.g(`  ${worker}: set`));
}

console.log(`
${c.g(c.b('Done.'))}

  Public site   ${c.b(publicUrl)}
  Staff site    ${c.b(staffUrl)}

  Log in to the staff site with any demo account (README), e.g. president@demo.test —
  the 6-digit code appears on the page. Both sites show a red "test" banner.

  Needs a VPN from mainland China: *.workers.dev addresses are commonly blocked there.
  bdmnsa.com itself won't have that problem once the domain is bought.
`);
