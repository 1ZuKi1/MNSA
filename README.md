# МОХ — bdmnsa.com

Бээжингийн Их Сургуулийн Монгол Оюутны Холбооны цахим хуудас ба ажлын орчин.

| | |
|---|---|
| `bdmnsa.com` | Public site — Нүүр, Танилцуулга, Удирдлагын баг, Үйл ажиллагаа, Холбоо барих |
| `dep.bdmnsa.com` | Staff workspace — one-time email codes, no passwords |

Astro 7 on Cloudflare Workers, D1 for data, a second D1 database for photos. Runs entirely on Cloudflare's free plan; the only cost is the domain. The full design rationale is in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Run it locally (Windows, macOS, Linux)

Needs **Node.js 22.12+**.

```bash
npm install
cp .dev.vars.example .dev.vars        # Windows PowerShell: copy .dev.vars.example .dev.vars
npm run db:migrate                    # creates the two local databases
npm run db:seed                       # demo people, documents and events
npm run dev
```

Then open, in Chrome or Edge:

- **http://localhost:4321** — public site
- **http://dep.localhost:4321** — staff workspace (`*.localhost` resolves to your own machine automatically)

Log in as any demo account below. In local development no email is sent: the 6-digit code is **shown on the login page** and printed in the terminal.

| Email | Who | Role |
|---|---|---|
| `president@demo.test` | Б. Тэмүүлэн | Тэргүүн |
| `board@demo.test` | Д. Номин | Удирдах зөвлөл |
| `dotood@demo.test` | Г. Анударь | Дотоод хэлтсийн дарга |
| `dotood2@demo.test` | Э. Билгүүн | Дотоод хэлтсийн гишүүн |
| `gadaad@demo.test` | Т. Батбаяр | Гадаад хэлтсийн дарга |
| `surgalt@demo.test` | О. Энхжин | Сургалтын хэлтсийн дарга |
| `media@demo.test` | С. Хулан | Медиа хэлтсийн дарга |
| `media2@demo.test` | Ц. Мөнхжин | Медиа хэлтсийн гишүүн |
| `legal@demo.test` | Ж. Саруул | Эрх зүйн хэлтсийн дарга · **орлогч** |
| `dev@demo.test` | — | Техникийн хариуцагч |

All fictional, on the reserved `.test` domain.

**A good 5-minute demo:** log in as `dotood2` → *Баримт бичиг → Шинэ → Албан бичиг* → "Хадгалаад хянуулахаар илгээх". Then log in as `dotood`, `legal`, `president` in turn and approve it from each dashboard. Open *Хэвлэх / PDF* at the end. Then as `dotood2`, open an event and press **Би хийнэ**; as `president`, open *Оролцоо*.

### Useful commands

| | |
|---|---|
| `npm test` | Unit tests for permissions and the approval chain |
| `npm run db:reset` | Wipe local data and re-seed. **Stop `npm run dev` first** — deleting the database under a running server breaks it until restart |
| `npm run preview` | Build for production and run the real Worker locally on :8787 (`dep.localhost:8787` for staff) |
| `npm run typecheck` | Type-check everything |
| `bash tests/e2e.sh` | end-to-end test against `npm run dev` (Git Bash on Windows). Run after `db:reset` |

---

## Test deployment — before the domain is bought

Puts the whole thing online on free `*.workers.dev` addresses so it can be tried on real phones. Run these in PowerShell **one line at a time** (PowerShell 5 doesn't accept `&&`):

```powershell
npx wrangler login
npm run deploy:test
```

`wrangler login` opens the browser — sign in with the **association** Cloudflare account. `deploy:test` then creates the two databases, loads the demo data, and deploys two Workers from the same build:

| | |
|---|---|
| `https://mnsa.<subdomain>.workers.dev` | public site |
| `https://mnsa-dep.<subdomain>.workers.dev` | staff site |

Both carry a red "test" banner and are hidden from search engines. Because Resend can't send mail without a verified domain, **the login code is shown on the login page** — but only on `*.workers.dev` addresses, never on `bdmnsa.com`. Log in with the demo accounts above. Don't enter real personal data on the test site.

Safe to re-run after every change. It rewrites the two `database_id` values in `wrangler.jsonc` — commit that change.

`*.workers.dev` is usually blocked in mainland China: use the VPN to open the test links.

---

## First deployment

Do these once, in order. Everything uses the **association's** Cloudflare account, never a personal one.

1. **Cloudflare account** on the association email. Two people know the password: the President and the maintainer.
2. **Buy `bdmnsa.com`** in Cloudflare → Domain Registration. About $10.44/year.
3. **Log in the CLI:** `npx wrangler login`
4. **Start from empty databases.** If you used the test deployment, its databases hold the demo accounts — delete them and the test staff Worker:
   ```bash
   npx wrangler delete --name mnsa-dep
   npx wrangler d1 delete mnsa-db
   npx wrangler d1 delete mnsa-media
   ```
   Then create fresh ones and paste each printed `database_id` into `wrangler.jsonc`:
   ```bash
   npx wrangler d1 create mnsa-db
   npx wrangler d1 create mnsa-media
   npm run db:migrate:remote
   ```
5. **Session secret** (signs logins; never commit it):
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
   npx wrangler secret put SESSION_SECRET      # paste the value above
   ```
6. **Resend** — add and verify `bdmnsa.com` at resend.com (it gives you DNS records; add them in Cloudflare DNS). Then `npx wrangler secret put RESEND_API_KEY`.
7. **Turnstile** — Cloudflare → Turnstile → add a widget for `dep.bdmnsa.com`. Put the site key in `wrangler.jsonc` under `vars` as `TURNSTILE_SITE_KEY`, and `npx wrangler secret put TURNSTILE_SECRET`.
8. **Deploy:** `npm run deploy` (no test mode: codes go by email, no banner)
9. **Attach the domains:** Cloudflare → Workers → `mnsa` → Settings → Domains & Routes → add custom domains `bdmnsa.com` and `dep.bdmnsa.com`.
10. **Create the first President** — the only account that isn't made by invitation:
    ```bash
    npx wrangler d1 execute mnsa-db --remote --command "INSERT INTO users (email, name_mn, student_id, role, department_id, term_ends_at, created_at) VALUES ('president@example.com', 'Б. Нэр', '0000000000', 'president', 1, strftime('%s','2027-09-30 15:59:00'), strftime('%s','now'))"
    ```
    From then on, the President invites everyone else from *Гишүүд → Урилга үүсгэх*. Everyone added shows up on the public *Удирдлагын баг* page automatically; each person (or the President) can hide themselves with the *Нийтэд* switch on *Гишүүд*.
11. **Auto-deploy on push:** Cloudflare → Workers → `mnsa` → Settings → Builds → connect `github.com/1ZuKi1/MNSA`. Build command `npm run build`, deploy command `npx wrangler deploy`.

---

## How it's put together

```
src/
  worker.ts            Entry. Routes bdmnsa.com vs dep.bdmnsa.com; edge-caches public events and photos
  middleware.ts        Login gate for the staff area
  lib/
    permissions.ts     ← every "who may do what" rule, as pure functions. Start here.
    workflow.ts        Approval chain logic (pure)
    record-types.ts    The document types that replace Word templates — add new ones here
    records.ts         Documents: create, edit, submit, approve, auto-numbering
    events.ts          Events, task board, participation report, photos
    members.ts         Invites, roles, deputy, annual renewal
    team.ts            The public team page, built from the member list
    site.ts            Test-mode switches and the public/staff addresses
    nav.ts             The two counts next to the staff menu (waiting decisions, my tasks)
    icons.ts           The line icons used on both sites
  layouts/Staff.astro  Staff frame: sidebar / phone drawer, flash messages, and the form helpers
                       (ask before destructive actions, submit once, warn about unsaved changes)
  styles/staff.css     Staff design — one file, every page uses the same pieces
    auth.ts session.ts One-time codes and signed-cookie sessions
    db.ts time.ts …    Helpers
  pages/
    index.astro taniltsuulga.astro udirdlaga.astro holboo-barih.astro uil-ajillagaa/…   public site
    dep/…                          staff site (served at clean URLs on dep.bdmnsa.com)
migrations/            Main database schema (+ migrations-media/ for photos)
scripts/seed-dev.sql   Demo data (local and test deployment only)
scripts/deploy-test.mjs  `npm run deploy:test`
tests/                 Unit tests + e2e.sh
docs/ARCHITECTURE.md   Why everything is the way it is
```

**Adding a new kind of document** — add an entry to `RECORD_TYPES` in `src/lib/record-types.ts`: fields and an approval chain. The form, validation, archive, numbering and print layout all follow automatically.

**Changing who can do what** — change `src/lib/permissions.ts` and its tests in `tests/permissions.test.ts`. Pages never decide permissions themselves.

**Staff page building blocks** — `PageHead` (breadcrumbs, title, actions), `.panel`, `.items` rows, `.table-wrap.cards-sm` (a table that turns into cards on phones), `.stepper`, `.empty`. On any form: `data-confirm="…"` on a button or form asks before submitting, `data-require="fieldId"` on a button makes that field required for that button only, `data-guard` on a form warns before leaving with unsaved changes. Every form submits only once.

## Not built yet

- Public text to confirm with the board: the value taglines and department descriptions on *Танилцуулга*, the new-student steps on the homepage, the vertical Mongolian script in the hero
- Live meeting minutes (Phase 5)
- The September handover page for the presidency (Phase 6) — renewal of members already works
- Weekly automatic backup of the database
