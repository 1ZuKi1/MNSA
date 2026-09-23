# МОХ — Website Architecture Plan **v2**

Бээжингийн Их Сургуулийн Монгол Оюутны Холбоо
Updated 2026-09-23 · status: **Phases 0, 2, 3, 4 and events built** — repo `github.com/1ZuKi1/MNSA`

> **v2.1 (2026-09-23):** events module added (§5b); KV dropped in favour of D1; palette taken from the logo.
>
> **v2 changes:** 10 staff users, not 40 — the email risk I flagged was overstated.
> Full cost audit added. Word/Excel eliminated entirely via the Records system (§5).
> September handover designed as a first-class feature (§6).
> D1's real free limits are tighter than v1 claimed — corrected in §7.

---

## 1. What this actually costs

| Item | Free? | Catch |
|---|---|---|
| Workers (compute) | ✅ free | 100k requests/day |
| D1 (database) | ✅ free | 500 MB per database, 10 databases, 5 GB total |
| ~~Workers KV~~ | not used | dropped — login codes and rate limits live in D1 (100k writes/day vs KV's 1k) |
| Durable Objects | ✅ free | SQLite backend only. Available if we want real-time |
| Turnstile (bot protection) | ✅ free | — |
| DNS, CDN, SSL | ✅ free | — |
| Cron Triggers (backups) | ✅ free | — |
| **R2 (file storage)** | free to 10 GB | ⚠️ **requires a card on file**, even at zero usage |
| **Resend (email)** | free 100/day, 3,000/month | ⚠️ **requires a verified domain** |
| **Domain** | ❌ **~$10.44/year** for `.com` at cost | unavoidable |

### Total: about **$10 a year**. Roughly 75 CNY. Everything else is genuinely free.

**Why the domain can't be avoided.** Resend refuses to send to arbitrary recipients until you verify a sending domain. No domain → no login codes → no staff site at all. It's also the difference between an association that looks official and one running on `mox-pku.workers.dev`.

Cheaper TLDs start around $4.18/year at Cloudflare if `.com` matters less than the budget. `.mn` is not sold by Cloudflare and costs far more.

> **Decided:** `bdmnsa.com`, with the staff workspace at `dep.bdmnsa.com`.
> Confirmed unregistered against the Verisign `.com` registry on 2026-09-23. Buy it through Cloudflare Registrar at cost, on the association account.

### The R2 card problem — and how to avoid it for now

R2 wants a payment method even though 10 GB is free and you'd never be charged. For a student association with no card, that's real friction.

**You don't need R2 in v1.** Since every document is *created inside the website* rather than uploaded, there are almost no files to store. Photos for news posts go into a **second D1 database used only for media** — 500 MB, with the browser compressing each image to ~200 KB before upload, which is roughly 2,000 photos. Responses get an immutable cache header so repeat views are served by Cloudflare's CDN and never touch the database.

Move to R2 later, when someone has a card and you've outgrown 2,000 photos. Nothing in the design has to change — it's one storage adapter.

---

## 2. Is there a better platform? — checked honestly

| Platform | Free tier | Why not |
|---|---|---|
| **Cloudflare** | compute + DB + storage + CDN, all free, one vendor | **chosen** |
| Vercel + Neon | Hobby free; Neon 0.5 GB | two vendors to manage; `.vercel.app` has a history of being blocked in mainland China |
| Netlify | free static + functions | `.netlify.app` has been blocked in China |
| Supabase | Postgres + **built-in OTP auth** — genuinely tempting | **free projects pause after 7 days of inactivity.** A site used in bursts around meetings would be asleep exactly when someone needs it |
| Firebase | generous quotas | **Google is blocked in mainland China.** Disqualified outright |
| GitHub Pages | free forever | static only — cannot run the staff workspace |
| Notion (today) | free | no per-department write permissions, no public design control, no approval workflow |

**The Beijing constraint decides this.** Your whole audience is in mainland China. Without an ICP licence nothing can be hosted inside China, so every option is overseas and somewhat slow — but Cloudflare is among the more reliably reachable, and it's the only one where compute, database, storage and CDN are all free from a single vendor. No reason to move.

> ⚠️ **Still untested: the site without a VPN.** Cloudflare performs fine from Beijing over OVPN — confirmed. But that only clears the **staff** site, where all 10 people are VPN users anyway.
>
> The **public** site has to work for ~50 Mongolian students, PKU offices and partner associations, many of whom have no VPN or a flaky one. A VPN test tells us nothing about them. This needs a real no-VPN test before Phase 1 ships, because if the public site is unusable without a VPN, the whole point of having a public site collapses.
>
> If it turns out bad, the fallback is a very light public site — small pages, self-hosted fonts, no large images, aggressive caching — which is roughly the design already planned. So the risk is degraded speed, not total failure.

---

## 3. Email volume — I was wrong

Recalculated at 10 staff:

| | per month |
|---|---|
| Logins (10 people × ~4) | 40 |
| Workflow notifications | ~60 |
| **Total** | **~100 against a 3,000/month allowance** |

About 3% of the quota. At 40 users it was worth worrying about; at 10 it isn't. I over-weighted it.

One rule survives: **never mass-mail all ~50 Mongolian students from this system.** 100/day would lock out logins. A newsletter, if you ever want one, is a separate tool.

Sessions last 30 days so people rarely re-login — which cuts the email volume further and is perfectly safe for 10 trusted accounts.

---

## 4. Authentication — confirming your instinct

You're right to refuse passwords. Precisely what the database does and doesn't hold:

| Stored | Never stored |
|---|---|
| email, name, department, role | password |
| student ID | password hash |
| last login timestamp | anything reversible |
| login code as a keyed hash (HMAC), 10-min expiry, then deleted | the code itself |

If this database leaked tomorrow, there is nothing in it to crack. That is the entire argument for the design.

Flow: enter email → Turnstile → 6-digit code by email → verified → signed cookie. A code, not a magic link, because links break when someone reads mail on their phone but works on a laptop, and mail clients sometimes pre-fetch links and silently burn them.

### Roles

| role | Монголоор | Can |
|---|---|---|
| `president` | Тэргүүн | Everything. Final approver. Manages all members |
| `deputy` | — | A flag on one member, named by the President: may also add and remove members |
| `board` | Удирдах Зөвлөлийн гишүүн | Read everything, approve at board level, no member admin |
| `head` | Хэлтсийн дарга | Full write inside own department, first-level approver for it |
| `member` | Гишүүн | Create and edit **own** drafts inside own department |
| `maintainer` | Техникийн хариуцагч | See §"The maintainer" below — deliberately *not* a governance role |

### Departments

| slug | Хэлтэс |
|---|---|
| `dotood` | Дотоод хэлтэс |
| `gadaad` | Гадаад хэлтэс |
| `surgalt` | Сургалтын хэлтэс |
| `media` | Медиа хэлтэс |
| `erh-zui` | Эрх зүйн хэлтэс |

### The permission rule

Every writable row carries `department_id` and `author_id`. One server-side function decides everything:

```
canWrite(user, resource):
    president or board                          → true
    user.department_id ≠ resource.department_id → false     ← the hard wall
    head                                        → true
    member                                      → resource.author_id == user.id
                                                   and resource.status == 'draft'
```

**Decided: reading is open across departments.** Any staff member can read any department's records. Only *writing* is walled. Individual records can still be marked `visibility='dept'` when genuinely sensitive — a disciplinary matter, an unfinished budget.

Two rules that matter more than the code:

1. **Enforced in the query, never in the template.** Every list query carries its own `WHERE` clause. Hiding a button is not a permission.
2. **The Эрх зүйн хэлтэс exception.** Legal reviews every department's documents for form and standards, so Legal gets `review` rights across departments — read, comment, change workflow state — but still **not** edit rights on another department's content.

### The maintainer — the role this project actually needs

The person who **builds and maintains** this system is not the person who **runs the association**. Those are different jobs, with different access needs, held by different people, on different timelines. The President changes every September; the maintainer might not. A President shouldn't need to touch Cloudflare, and a maintainer shouldn't hold the association's governance.

So `maintainer` is a deliberately narrow role:

| Can | Cannot |
|---|---|
| read everything, including the audit log | add or remove members |
| see system health, errors, backup status | approve anything |
| deploy code, run migrations | transfer the presidency |
| change their own account's email | act on behalf of a department |

Three rules that keep the association in control of a system an outsider built:

1. **The President can revoke the maintainer at any time**, alone, without help.
2. **The maintainer's account expires annually** like everyone else's, and must be renewed by the President.
3. **The Cloudflare account belongs to the association email**, and its password is held by both the President and the maintainer, and changed at every handover.

Point 3 is the honest one. Infrastructure access is real power that no in-app role can constrain — whoever can log into Cloudflare can edit the database directly. The answer isn't to pretend otherwise; it's that two people hold it, the association owns the account, and it rotates at handover.

### Membership lifecycle — who gets in, and who falls out

**Decided: the President adds and removes everyone.** The President personally selects every дарга and every member, so they are the one person who always knows the real roster. Department heads do *not* provision their own members.

#### Accounts expire by default

This is the core of the design. Every account carries `term_ends_at`, defaulting to **30 September** of the current academic year. Past that date the account stops working until someone renews it.

The reason is simple: adding people happens by itself — someone needs access and asks. Removing people happens *never*. Nothing forces it, nobody complains, and the cost stays invisible until an ex-member still has access two years later. Expiry makes **doing nothing the safe outcome** instead of the dangerous one.

It also means the President never has to predict who will leave. Anyone not actively renewed falls out on their own.

#### Joining is by invite link, never by typed email

The President enters the person's **name and student ID** — facts they know — and gets a single-use link to send over WeChat. The person opens it and supplies **their own** email address.

This exists to kill one specific failure: a hand-typed address with one wrong character silently mails a working credential to a stranger, and nothing looks wrong from the President's side. Since the President now types ~15 addresses in one busy week each September, that risk is concentrated, not spread out. Letting the person type their own address makes it structurally impossible.

- single use, expires in 72 hours
- unclaimed invites appear in a list so they can be chased
- the President sees who claimed each one and can revoke instantly

#### Account states

```
invited ──claims link──▶ active ──term ends──▶ alumni
                            │                    │
                            └──removed───────────┘   (reactivatable)
```

**Never delete an account.** `alumni` cannot log in, but every record they authored keeps its author. Deleting would orphan years of documents.

#### The September ritual

```
1. Handover completes → new President in place
2. Шинэ жилийн бүртгэл: last year's roster, one row each
3. Per person: Үргэлжлүүлэх · Хэлтэс солих · Гаргах   + assign the 5 new дарга
4. Anyone not actioned by the deadline → alumni, automatically
5. Invite links go out for new members
```

#### The deputy

President-only provisioning makes the President a single point of failure for access — fine until exam week, travel or illness leaves someone locked out for ten days.

So the **President names one deputy** who can also add and remove members. One person, chosen by the President, revocable at any time; likely the Дэд тэргүүн or the Эрх зүйн хэлтсийн дарга, since Legal already owns the archive. This is not delegation to all five departments — the President still decides who is in the association. It only means the door still opens when they are unreachable. (The 120-day board override in §6 covers long absences; this covers short ones.)

#### Guard rails

- **Nobody can grant a role at or above their own.** Only the handover flow in §6 creates a President
- **Nobody can remove their own role** — the cheapest protection against locking the association out of its own site
- Removal bumps `session_version`, killing every active login instantly, everywhere
- Every membership change writes to `audit_log` and appears on the President's dashboard
- **Personal email addresses, not `@pku.edu.cn`** — university addresses die at graduation, which is exactly when an alum might need to be reached. Enforce this at invite time
- Email addresses can be changed by the President; authorship is by `user_id`, so the address is only a delivery channel

#### Schema additions

```sql
ALTER TABLE users ADD COLUMN term_ends_at   INTEGER;
ALTER TABLE users ADD COLUMN student_id     TEXT;
ALTER TABLE users ADD COLUMN is_deputy      INTEGER NOT NULL DEFAULT 0;
-- users.status becomes: 'invited' | 'active' | 'alumni' | 'suspended'

CREATE TABLE invites (
  id             INTEGER PRIMARY KEY,
  token_hash     TEXT NOT NULL UNIQUE,      -- SHA-256; the raw token only ever exists in the link
  name_mn        TEXT NOT NULL,
  student_id     TEXT NOT NULL,
  department_id  INTEGER NOT NULL REFERENCES departments(id),
  role           TEXT NOT NULL,
  created_by     INTEGER NOT NULL REFERENCES users(id),
  expires_at     INTEGER NOT NULL,
  claimed_by     INTEGER REFERENCES users(id),
  claimed_at     INTEGER,
  revoked_at     INTEGER,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_invites_open ON invites(expires_at) WHERE claimed_at IS NULL;
```

### Domains and routing

```
bdmnsa.com        → public site      (prerendered static assets)
dep.bdmnsa.com    → staff workspace  (SSR, auth-gated)
www.bdmnsa.com    → 301 → bdmnsa.com
```

One Worker serves both, with host-based routing in Astro middleware. On the staff host every path except `/nevtreh` and `/api/auth/*` requires a valid session; on the public host the staff routes return **404, not 403** — don't advertise that the workspace exists.

**A subdomain rather than `bdmnsa.com/dep` is the right call, and specifically because of cookies.** The session cookie is scoped to the exact host `dep.bdmnsa.com`, never to `.bdmnsa.com`. That means a cross-site scripting bug in a public news post — the most likely vulnerability in a site where staff paste in content — cannot read or send a staff session cookie. A path-based staff area shares one origin with the public site and gives up that isolation entirely.

Cookie flags: `HttpOnly; Secure; SameSite=Lax; Domain` omitted (host-only); `Path=/`.

---

## 5. The Records system — how Word and Excel disappear

This is the centre of the whole project, and the answer to your archive question.

**Today:** a department writes a Word file from a template → emails it to the дарга → someone reviews → someone else files it → the archive is a Notion row pointing at a file nobody can find a year later.

**Instead: a record is a database row, not a file.**

### How it works

**Fixed record types**, each one a form plus a print layout, defined in code:

| Type | Монголоор | Letter | Approval chain | Signed by |
|---|---|---|---|---|
| `albn-bichig` | Албан бичиг | А | дарга → Legal → Тэргүүн | Тэргүүн, Эрх зүйн хэлтэс |
| `medegdel` | Мэдэгдэл | М | Legal → Тэргүүн | Тэргүүн, Эрх зүйн хэлтэс |
| `protokol` | Хурлын протокол | П | Тэргүүн | Тэргүүн, протокол хөтлөгч |
| `huselt` | Арга хэмжээний хүсэлт — an approved one becomes an event | Х | дарга → Тэргүүн | Тэргүүн, хэлтсийн дарга |
| `tailan` | Тайлан (улирал / жилийн эцсийн) | Т | дарга | the department's members |
| `tolovlogoo` | Үйл ажиллагааны төлөвлөгөө | ТӨ | дарга → Тэргүүн | Тэргүүн, хэлтсийн дарга |
| `juram` | Журам | Ж | Legal → Тэргүүн | Тэргүүн, Эрх зүйн хэлтэс |
| `durem` | Үндсэн дүрмийн өөрчлөлт | ҮД | Legal → Тэргүүн | Тэргүүн, Эрх зүйн хэлтэс |
| `songuuli` | Сонгуулийн хорооны материал | С | Legal only — a sitting President may be a candidate | Сонгуулийн хорооны дарга, Эрх зүйн хэлтэс |
| `choloolol` | Албан тушаалаас чөлөөлөх (fixed wording) | ГЦ | Тэргүүн | Тэргүүн, the person released |

М, П, Ж and ГЦ are the letters the association already used on paper (М-0001, П-0006, Ж-0006, ГЦ-0001); the others were chosen to match. They live in `record-types.ts` and can be changed there. The forms follow the association's own templates: the report has the template's sections (work done, results, problems, suggestions, next steps), a new report lists the department's current members, and a new protocol lists the President and every department head (the paper form had left out the Сургалтын хэлтэс). Steps the author owns are skipped automatically, so a дарга's own plan goes straight to the Тэргүүн.

**Duty letters** («… үүрэг, хариуцлагыг хүлээн зөвшөөрсөн тухай албан бичиг», Үндсэн дүрэм 18.1.3) are not records: they are printed straight from the member list — one per head and member, and the President's own — at *Гишүүд → Үүргийн бичиг*, dated for the Их Хуралдаан. Name, department, student ID and term come from the data, which fixes the old files where two different heads were both written as «Дотоод хэлтсийн дарга». Board members don't get one (there is no template for them yet).

1. Staff open the form **on the website** and fill in fields. No Word, no attachment, no email.
2. The site renders it in the association's own layout (as on М-0001 and П-0006): the logo as a faint watermark, the kind of document in large capitals, the subject in bold capitals, numbered content, the signers left and right with a dotted line for the wet signature and the stamp over the Тэргүүн's, and the number, date and «Бээжин хот, Бүгд Найрамдах Хятад Ард Улс» centred at the bottom. A one-line record of the electronic approval sits in small print under it.
3. It routes automatically to the дарга, then Legal, then the Тэргүүн, per your existing workflow.
4. It lands in the archive with a number already assigned.

### PDF without a PDF library

**The browser's own print makes the PDF.** A `@media print` stylesheet, then Ctrl+P → Save as PDF.

This isn't a compromise, it's the better engineering choice: it costs nothing, needs no library, uses zero Worker CPU, and renders Mongolian Cyrillic perfectly because the browser does the text shaping with your self-hosted font. A PDF library running inside a Worker would fight you on both font embedding and the 10 ms CPU limit.

### Numbering, automatic

```
МОХ-ДХ/2627/Ж/001
 │   │   │   │  └── sequence
 │   │   │   └── document type (Ж = Журам)
 │   │   └── academic year 2026–2027
 │   └── department code
 └── association
```

The format is the President's (his own example on the form, 2026-09-23). Each department numbers each type separately, from 001 every academic year.

Assigned by the database **on first submission**, never on draft — so abandoned drafts don't burn numbers, and two people cannot possibly be given the same one.

### Version history, free

Every save writes a new `record_versions` row holding the full field JSON. Text is tiny — a thousand versions sits well under a megabyte. You get "who changed what, and when" permanently. The Word workflow never gave you that.

### The archive is a query, not a folder

"Хэлтсийн фолдер" is not a folder on a disk. It is `WHERE department_id = ? AND academic_year = ?`. Which gives you, for free:

- browse by department, year, type or status
- full-text search across every document the association has ever produced
- a department that **cannot** see into another department's drafts, because the query itself forbids it — not because a button is hidden

Nothing is ever deleted. A superseded record is marked `хүчингүй` and keeps its number forever.

### What this removes

No Word templates to keep in sync. No "which file is the final version?". No attachments emailed between five people. No manual numbering. No separate Notion archive. No Excel tracking sheet.

### What it honestly can't do

If PKU's 留学生办公室 demands an editable `.docx`, a database row won't satisfy them. Two answers: the print-to-PDF output is what offices actually accept in practice, and for the rare exception one person exports once by hand. **We are not building a Word exporter in v1** — say so now rather than discover it later.

---

## 5b. Events — Үйл ажиллагаа

Added 2026-09-23. Two faces of one table: a public listing, and a work board behind the login.

### Who can do what

| Action | Who |
|---|---|
| Create, edit, publish an event | **President** and **anyone in Медиа хэлтэс** |
| Add tasks to an event | the above, plus the **дарга of the organising department** |
| Take a task ("Би хийнэ") | any active staff member |
| Assign a task to someone else | President, Media, organising дарга |
| Mark a task done | the assignee, or whoever can assign |
| See the yearly participation report | President and board; everyone sees **their own** history |

The participation report is deliberately not public to all staff. "Who isn't taking jobs" is useful to a President and corrosive as a leaderboard.

### Public side — `bdmnsa.com/uil-ajillagaa`

- **Удахгүй болох** — published events whose end date hasn't passed, soonest first
- **Өнгөрсөн** — published events that have ended, newest first, each with photos, description, date, and **"Нийтэлсэн: name"**
- An event moves from upcoming to past **by itself** when its date passes — nobody has to remember to move it

Because "upcoming vs past" depends on today's date, these pages are **rendered on request and cached at Cloudflare's edge for 5 minutes**, rather than prerendered. A prerendered page would keep showing yesterday's event as upcoming until someone rebuilt the site. The 5-minute cache means a traffic spike costs one database read per 5 minutes per Cloudflare location, not one per visitor.

### Staff side — `dep.bdmnsa.com/events`

Each upcoming event has a task table:

| Ажил | Хугацаа | Хэлтэс | Төлөв | **Хариуцагч** |
|---|---|---|---|---|
| Заал захиалах | 10-01 | Дотоод | ✅ | Н. Оюу-Эрдэнэ |
| Постер хийх | 10-03 | Медиа | ⏳ | Б. Эсэншихэр |
| Бүртгэл хөтлөх | 10-05 | — | *нээлттэй* | **[Би хийнэ]** |

The last column is who's doing it. An empty cell shows a **Би хийнэ** button, so taking a job is one click.

### The yearly record — nothing is deleted

Every assignment is kept permanently with who assigned it, whether the person **volunteered or was assigned**, when, and whether it was completed or dropped. That distinction matters: at the end of the year you can see not just who worked, but who *stepped forward*.

The report, per person per academic year:

| Гишүүн | Арга хэмжээ | Сайн дураар авсан | Хуваарилсан | Дууссан | Орхисон |
|---|---|---|---|---|---|

People with zero rows show up at the bottom with zeros — that's the "who isn't taking jobs" answer, without anyone having to go looking.

### Photos

Stored in a **separate D1 database used only for media**, as planned in §1 — no R2, no card. The browser shrinks each photo to at most 1600 px and ~250 KB *before* upload, which keeps both the upload fast from Beijing and the 500 MB database good for roughly 2,000 photos. Served with an immutable cache header, so each photo is read from the database about once per Cloudflare location, ever.

### Connection to the Records system

An approved **Хүсэлт** (event request, §5) gets an **"Арга хэмжээ үүсгэх"** button that creates the event draft pre-filled from the request. The request is the permission; the event is the public face and the work board. No retyping.

### Schema

```sql
CREATE TABLE events (
  id INTEGER PRIMARY KEY, slug TEXT NOT NULL,          -- cosmetic; lookups by id
  title TEXT NOT NULL, summary TEXT, body TEXT,
  starts_at INTEGER NOT NULL, ends_at INTEGER NOT NULL, location TEXT,
  department_id INTEGER REFERENCES departments(id),   -- organising department
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
  cover_media_id TEXT, source_record_id INTEGER REFERENCES records(id),
  academic_year TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  published_by INTEGER REFERENCES users(id), published_at INTEGER,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE event_tasks (
  id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
  title TEXT NOT NULL, notes TEXT, due_at INTEGER,
  department_id INTEGER REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
CREATE TABLE task_assignments (
  id INTEGER PRIMARY KEY, task_id INTEGER NOT NULL REFERENCES event_tasks(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  volunteered INTEGER NOT NULL,                      -- 1 = took it themselves
  assigned_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done','dropped')),
  assigned_at INTEGER NOT NULL, finished_at INTEGER
);
CREATE TABLE event_photos (
  id INTEGER PRIMARY KEY, event_id INTEGER NOT NULL REFERENCES events(id),
  media_id TEXT NOT NULL, caption TEXT, sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL
);
-- in the separate MEDIA database:
CREATE TABLE media (id TEXT PRIMARY KEY,   -- random 128-bit token: the URL is the permission
  mime TEXT NOT NULL, bytes BLOB NOT NULL,
  width INTEGER, height INTEGER, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
```

---

## 6. September handover — your design, hardened

Your instinct is right. The part that worries me is the single irreversible button: one typo in the email address and the association is permanently handed to a stranger, or to nobody. Two changes fix that without adding complexity.

### The flow

```
1. Outgoing Тэргүүн opens /shiljuuleh (Эрх шилжүүлэх)
2. Enters the next president's name, student ID, email, department
3. Ticks the confirmation box and presses the button
4. → RE-AUTHENTICATES: a fresh one-time code to their own email, right now.
     An active session is not enough. This is the highest-privilege action in the system.
5. Status becomes ХҮЛЭЭГДЭЖ БАЙНА.  The outgoing president keeps full power.
6. The nominee receives an email, logs in with their own code, and sees one screen:
     "Та 2027–2028 оны Тэргүүнээр томилогдлоо. Хүлээн авах уу?"
7. Nominee accepts → the transfer completes atomically:
     nominee   → president
     outgoing  → board (Удирдах Зөвлөлийн гишүүн)
     both      → notified by email
     audit_log → one permanent, unerasable row
```

### Why the acceptance step matters

Between step 3 and step 7 the outgoing president can still **cancel**, and an unaccepted transfer expires after 14 days. A typo is caught automatically, because the wrong person simply never logs in. With a single irreversible button, that same typo is unrecoverable.

### Why the outgoing president becomes `board`, not deleted

It matches what already happens — your leadership page lists Б. Амгаланбаяр, last year's Тэргүүн, as a board member. They lose management power (no member admin, no final approval, no handover rights) but keep read access and institutional memory. Deleting them would also orphan every record they ever authored.

### Break-glass — the failure you should actually plan for

The realistic disaster isn't a malicious transfer. It's a president who graduates in June, never performs the handover, and stops replying. Then nobody can promote anybody, and the association is locked out of its own archive.

Three layers, in order:

1. **Board quorum override.** If the president account hasn't logged in for 120 days, any two `board` members can jointly promote a new president. Two confirmations, both logged.
2. **The Эрх зүйн хэлтсийн дарга holds a standing recovery role.** Fitting — Legal already owns the constitution and the archive.
3. **The Cloudflare account is the true root.** Whoever can log into Cloudflare can edit the database directly. It must therefore be an **association email, never a personal Gmail**, with credentials handed over in writing each September alongside the seal.

That third layer is the honest answer to "next year nobody can run this." No amount of code solves it; a written handover does.

### Make it a checklist, not just a button

`/shiljuuleh` should be a checklist the outgoing president works through:

- [ ] member list updated for the new academic year
- [ ] every record submitted — none left in draft
- [ ] Cloudflare account email and recovery updated
- [ ] domain renewal date recorded, and who pays it
- [ ] the written runbook read by the incoming president

**The transfer button unlocks only when every box is ticked.** This is the actual anti-"nobody can run this" mechanism — the button is just the last step of it.

### Academic year rollover

`academic_year` sits on every record. Each September: last year's roster becomes `alumni` and read-only, the new roster is created, and nothing is deleted. Previous years stay browsable forever.

---

## 7. Corrected free-plan limits — these shape the code

The real D1 free numbers are tighter than v1 said. Corrections:

| Limit | Free value | What it forces |
|---|---|---|
| D1 database size | **500 MB each** (v1 wrongly said 5 GB), 10 DBs, 5 GB account total | fine for text; media gets its own database |
| **D1 queries per request** | **50** | dashboards must use joins, never a query inside a loop |
| D1 rows read / written | 5M / 100k per day | comfortable |
| Max blob or row | 2 MB | caps any single stored image |
| **D1 Time Travel restore** | **7 days only** | not enough on its own — see below |
| Worker CPU | 10 ms per request | no PDF generation in the Worker; browser print instead |
| Durable Objects | free, SQLite backend | real-time minutes over WebSocket are an option, not a cost |

**Add our own backups.** A free Cron Trigger exports the entire database to JSON weekly and keeps the last 12 copies. For an association whose whole purpose is keeping records, a 7-day restore window is not good enough. This costs nothing and takes an afternoon.

---

## 8. Build phases

| Phase | What | Result |
|---|---|---|
| **0** | Domain, Cloudflare project, D1, migrations, deploy on push | infrastructure exists |
| **1** | Design system + public site rebuilt (static, no database) | **the site already looks new and ships** |
| **2** | OTP login, sessions, member admin, the 5 departments | 10 people can log in |
| **3** | **Records system** — types, forms, numbering, versions, archive, search | **Notion and Word both retire** |
| **4** | Approval routing + Тэргүүн dashboard | WeChat approvals retire |
| **5** | Live meeting minutes → auto-generates a `protokol` record | the scribe works in the browser |
| **6** | Public pages read from the database · **handover page + written runbook** | next president can take over |

Phase 3 is the one that delivers what you actually asked for. Phase 6 deliberately ends with the handover — the system isn't finished until someone else can run it.

---

## 9. Decisions

### Settled

| | |
|---|---|
| Domain | **`bdmnsa.com`** — confirmed available 2026-09-23 |
| Staff subdomain | **`dep.bdmnsa.com`** |
| Cloudflare account | the **association email**, not a personal one |
| Stack | Astro + Cloudflare Workers + D1 |
| Auth | Resend one-time codes. No passwords stored, ever |
| Beijing over VPN | works fine — staff site cleared |
| Member provisioning | **President only**, plus one named deputy |
| Account lifetime | expires 30 September each year unless renewed |
| Joining | single-use invite links; the member supplies their own email |
| Reading across departments | **open** — any staff may read any department. Writing stays walled |
| Maintainer | a narrow technical role, separate from the President, revocable by them |
| Brand palette | from the logo: maroon `#8E0000`, flag blue `#005FAF`, Soyombo gold `#FFD300`. Logo vectorised to an 18 KB SVG |
| Workers KV | **dropped.** Login codes and rate limits live in D1 instead — 100,000 free writes/day vs KV's 1,000, and one fewer service |
| Event requests | not a separate table — a `huselt` record type inside the Records system |
| Events | President + Media edit; public pages rendered on request, edge-cached 5 min; task board with a yearly participation report |

### Still open

### Answered by the President (2026-09-23)

He filled in the form `MOX_Terguun_medeelel.docx`. His personal details and the member list stay out of this repository.

| Question | Answer |
|---|---|
| First account | his e-mail, name and student ID — used once in README step 10. He gave a PKU address: fine for his term, but invites refuse `@pku.edu.cn` for everyone else, and a personal address is safer for login-code delivery |
| Cloudflare account on the association e-mail | **yes** — the address itself is still to be named |
| Buying `bdmnsa.com` | **yes**, on the President's card. **Who renews in 2027 and 2028 is still open** — goes into the handover note |
| «Техникийн хариуцагч» role for the developer | **yes** |
| Deputy | **none** for now; the board override in §6 is the only fallback |
| Scope | **leadership only** (~15 people) |
| Member list | given on paper: five heads and six members across the five departments, all shown publicly. One vacant board seat named, the other still empty. A few student IDs are missing — he types them when creating each invite |
| Official letter chain | **kept** as дарга → Legal → Тэргүүн. His note: department heads write letters themselves, following the regulation — a working practice, not a system rule |
| Event request, report, numbering, participation report | as built |
| Document types | three added: activity plan, election committee material, constitution amendment (§5) |
| Board editing another department's sent-back document | **yes** (as built; now covered by a unit test) |
| Letterhead | **signature line and stamp** — built (§10) |
| Numbering | he rewrote the example as **МОХ-ДХ/2627/Ж/001** — department / year / type letter / sequence. Built |
| Public text | value taglines and department duties rewritten in his words; official Chinese name **北京大学蒙古国留学生学生会**; no WeChat on the site; **no Mongolian script in the title band** |
| Handover | agrees with §6; domain renewal and the Cloudflare password go in the handover note |

### Still technical

7. **R2 or media-in-D1 for v1?** — recommend D1, since it needs no card
8. **Public site without a VPN** — untested, see §2
9. **Invite links, or President types the emails?** — currently specced as invite links; droppable if build time is tight

---

## 10. What is built (2026-09-23)

| Phase | Status |
|---|---|
| 0 · Project, Cloudflare config, D1 schema, deploy pipeline | ✅ built — needs the domain + account to go live |
| 1 · Public site redesign | ✅ Нүүр, Танилцуулга, Удирдлагын баг (generated from the member list), Үйл ажиллагаа, Холбоо барих — WCAG AA, 0 axe violations |
| 2 · Login, sessions, members, invites, deputy, annual renewal | ✅ |
| 3 · Records system (10 types, numbering, versions, archive, print-to-PDF in the association's own layout, duty letters) | ✅ |
| 4 · Approval routing + dashboards | ✅ |
| 5b · Events, task board, participation report, photos | ✅ |
| 5 · Live meeting minutes | not started |
| 6 · Presidency handover page, weekly backup | not started |

Verified with 40 unit tests (permissions, approval chain, dates, document types) and a 170-step end-to-end test driving every role through the real server, plus a production-build check with `wrangler dev` and an axe accessibility audit of every public page.

### Decisions made while building

- **Staff pages live under `/dep` internally**, and the Worker maps `dep.bdmnsa.com/x` → `/dep/x`. HTML requests go through the Worker (`run_worker_first`), so the staff host can never be served a public page; hashed assets, the logo and fonts bypass it and stay free.
- **Rate limit per IP loosened to 30/hour** (per address stays 3 per 15 minutes). A whole meeting may log in at once from behind PKU's campus NAT, which shares few public IPs; 10/hour would have locked out the eleventh person.
- **Invite links refuse `@pku.edu.cn` addresses** — they die at graduation.
- **Photos are shrunk in the browser** to ≤1600 px and usually <450 KB before upload; the server checks the file's real type from its bytes, not its name.
- **Removing a photo frees its bytes** in the media database.
- **Test deployment without a domain.** `npm run deploy:test` deploys the same build twice to `*.workers.dev`: `mnsa` (public) and `mnsa-dep` with `SITE_MODE=staff`. `TEST_MODE=1` shows login codes on screen and adds a banner + `noindex` — and it only takes effect on `*.workers.dev` hostnames, so a forgotten variable can never expose codes on `bdmnsa.com`. Going live means fresh databases and deleting `mnsa-dep`.
- **Staff workspace redesign.** Sidebar on desktop, a drawer on phones, with counts next to the menu for decisions waiting and active tasks. The dashboard is a to-do list first (decisions → returned documents → my tasks), with «Дууссан» and «Би хийнэ» right in the list. A document page shows the approval chain as a stepper with the decision form at the top, so an approver on a phone doesn't scroll past the whole letter. Tables turn into cards on phones. Each member has their own page (role, department, e-mail change, deputy, public visibility, removal). Every destructive action asks first, every form submits only once (no duplicate records on a slow connection), long forms warn before leaving with unsaved text, and form errors are listed at the top with links to each field. WCAG 2.2 AA: 0 axe violations across 40 staff page views, desktop and phone.
- **The public team page is built from the member list** (`show_public`, on by default; each person can hide themselves). No separate list to keep in sync at handover.
- **Visual identity:** a navy title band with a thin gold rule, then plain sections that all share one left edge; maroon, flag blue and Soyombo gold from the logo. The vertical Mongolian script was taken out of the band at the President's request (2026-09-23), and its font with it. Fonts are self-hosted (Golos Text, Source Serif 4) — Google Fonts is unreliable from mainland China.
- **The official Chinese name 北京大学蒙古国留学生学生会** (from the President, and Үндсэн дүрэм 1.1.3) is under the association's name on printed documents, in the public footer and on the about page. Chinese text falls back to the reader's system Chinese font; nothing extra is downloaded.
- **The association's own papers were the model (2026-09-23).** The constitution (Анхдугаар шинэчилсэн найруулга), the 2026–2027 newcomer guide, and samples of every paper they use: М-0001 (notice), П-0006 (vote protocol), Ж-0006 (election regulation), ГЦ-0001 (release from office), the report and heads'-meeting templates, and the duty letters for heads, members and the President. From them: the print layout, four new document types, the numbering letters, the report's sections, the duty letters, the newcomer guide page (*Шинэ оюутанд*), the yearly calendar on *Танилцуулга* (election in week 2, Их Хуралдаан in week 3, election committee in spring week 14), and the note that every Mongolian student at PKU is a member without registering (8.1). Wording taken from the papers was kept, with spelling fixed (e.g. «Албан тушаалтны», «дамжуулах», «Оюутны дугаар» for «Сурагчийн дугаар», «Тэргүүн» where the President's letter said «Ерөнхийлөгч»).
- **The stamp scan is cleaned in the browser.** On *Тохиргоо* the page makes the white paper transparent and crops to the stamp before upload, so 38 mm on paper is 38 mm of stamp.
- **Invites no longer need a student ID** — the President had only an e-mail for some people. A duty letter leaves a line to write it by hand.
- **Logo images come from the official file** (`brand/LOGO-original.png`, transparent). The printed watermark is `public/brand/watermark.svg`: the logo in one colour at 15%.
- **Signature line and stamp on printed documents.** Whoever holds the last step of the chain signs: «Тэргүүн», «Эрх зүйн хэлтсийн дарга», or that department's дарга, with the approver's real name once approved. The stamp is the President's: uploaded on *Тохиргоо* (President only, every change in the audit log), stored in the media database marked `private`, served only at `dep.bdmnsa.com/tamga` behind the login (the public `/media` route refuses private images), and printed only when the document is approved *and* its final approval was the President's.

---

## Sources

- [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/) · [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) · [free-tier enforcement, 2026-09-01](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) · [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [R2 requires a payment method — Cloudflare Community](https://community.cloudflare.com/t/why-using-r2-free-tier-involves-giving-card-info/945179)
- [Resend quotas and limits](https://resend.com/docs/knowledge-base/account-quotas-and-limits) · [Resend requires a verified domain](https://resend.com/docs/dashboard/domains/introduction)
- [Cloudflare Registrar pricing](https://startupowl.com/reviews/cloudflare-registrar)
