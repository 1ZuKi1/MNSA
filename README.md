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

### Going live before the domain is bought

The team can start using the site for real on the same `*.workers.dev` addresses — the domain and Resend can be attached later without touching the data, since it's the same Worker and the same databases throughout.

```powershell
npx wrangler delete --name mnsa-dep
npx wrangler d1 delete mnsa-db
npx wrangler d1 delete mnsa-media
npm run deploy:test -- --no-seed
npm run import:members -- neccesary-files/members.csv
```

The first three lines clear out the demo accounts and test records (the import refuses to run while `@demo.test` accounts exist). `--no-seed` deploys fresh, empty databases instead of reloading the demo data. Then the real team is loaded from `neccesary-files/members.csv` (see step 10 below for the file format). Login codes still show on screen — `TEST_MODE` only needs `*.workers.dev`, not a finished domain — so everyone can log in today. Commit the new `database_id` values `deploy:test` writes into `wrangler.jsonc`.

**Team passphrase.** While codes show on screen, anyone who knows a member's e-mail could log in as them. So set a passphrase the team is told in person; the login page then asks for it too (not case-sensitive), and only on `*.workers.dev`:
```powershell
npx wrangler secret put STAFF_GATE --name mnsa-dep
```
Change it the same way; remove it with `npx wrangler secret delete STAFF_GATE --name mnsa-dep`. On the real domain it is never asked for.

When `bdmnsa.com` is later bought, pick up at step 5 below (session secret is already set, so start with Resend) — nothing here needs to be redone. Once the custom domain is attached (step 9), the code-on-screen behavior turns off on its own, since it only ever worked on a `*.workers.dev` hostname.

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
10. **Load the team** from the members list (kept in `neccesary-files/members.csv`, which is never committed):
    ```bash
    npm run import:members -- neccesary-files/members.csv --dry-run   # check the list, writes nothing
    npm run import:members -- neccesary-files/members.csv             # asks you to type "yes"
    ```
    One row per person: `name,full_name,student_id,email,role,dept,public`. Leave `email` empty to use the school address `<student ID>@stu.pku.edu.cn`; fill it for people without one (Gmail, QQ, 163). Roles: `president`, `board`, `head`, `member`, `maintainer` (or the Mongolian names); departments: `dotood`, `gadaad`, `surgalt`, `media`, `erh-zui`. The whole file is refused on any mistake, people already in the database are left alone, and it refuses to run while the demo accounts exist (step 4). Accounts last until 30 September of the next academic year.
    Each person then just logs in at `dep.bdmnsa.com` with their e-mail. Anyone joining later is invited from *Гишүүд → Урилга үүсгэх* (school or personal address, student ID optional). Everyone shows on the public *Удирдлагын баг* page unless `public` is `no`; each person can hide themselves later.
    **Photos** for that page are uploaded on each person's page in *Гишүүд → (name) → Зураг* — by the person, the President, or the maintainer. Any phone photo works; it's shrunk before upload and cropped to a circle on the page.
    Send one test code to a `stu.pku.edu.cn` address first — school mail filters sometimes hold mail from new domains; if it doesn't arrive, check spam, or change that person's address to a personal one on their *Гишүүд* page.
    Then the President uploads the official stamp at *Тохиргоо → Албан тамга*: a scan or straight-on photo of the real stamp pressed on white paper (a transparent PNG looks cleanest). It prints on the signature line only of documents the President approved, and its image is served only behind the staff login.
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
    settings.ts        The official stamp (President only; stored private, never on the public site)
    letters.ts         Duty letters («үүрэг, хариуцлагыг хүлээн зөвшөөрсөн тухай») printed from the member list
    prefill.ts         Starting values for new documents (department members, meeting attendance)
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

**Adding a new kind of document** — add an entry to `RECORD_TYPES` in `src/lib/record-types.ts`: fields, a type letter for the number, an icon, an approval chain and a `print` description (heading, who signs). The form, validation, archive, numbering and the printed page (`components/OfficialDoc.astro`) all follow automatically.

**Updating the Үндсэн дүрэм on the website** — when the Их Хуралдаан adopts a new version, put the PDF in `public/files/` with the adoption date in its name (e.g. `undsen-durem-2027-09-21.pdf`), then change `src/lib/public-docs.ts` (file name, version, date, counts, chapters). Keep the old file so saved links still work. It shows on *Танилцуулга* and in every page's footer.

**Changing who can do what** — change `src/lib/permissions.ts` and its tests in `tests/permissions.test.ts`. Pages never decide permissions themselves.

**Staff page building blocks** — `PageHead` (breadcrumbs, title, actions), `.panel`, `.items` rows, `.table-wrap.cards-sm` (a table that turns into cards on phones), `.stepper`, `.empty`. On any form: `data-confirm="…"` on a button or form asks before submitting, `data-require="fieldId"` on a button makes that field required for that button only, `data-guard` on a form warns before leaving with unsaved changes. Every form submits only once.

## Not built yet

- Public text: the new-student steps on the homepage now follow the association's 2026–2027 guide; the Сургалтын хэлтэс description was left unmarked by the President — confirm it once more
- *Шинэ оюутанд* has prices and procedures from the 2026–2027 guide: update it every summer
- Duty letters for board members (no template yet)
- Live meeting minutes (Phase 5)
- The September handover page for the presidency (Phase 6) — renewal of members already works
- Weekly automatic backup of the database
