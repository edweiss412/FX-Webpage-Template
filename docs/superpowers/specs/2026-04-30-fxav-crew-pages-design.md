# FXAV Crew Pages — Design Spec

**Status:** draft (2026-04-30)
**Author:** Eric Weiss
**Companion docs:** [`Project-Goal.md`](../../../Project-Goal.md), [`fixtures/shows/README.md`](../../../fixtures/shows/README.md), [`fixtures/shows/_schema-diff.md`](../../../fixtures/shows/_schema-diff.md)

---

## 1. Goal & scope

Doug Larson PMs every Institutional Investor show for FXAV using a Google Sheets template he fills out per event. Today, every crew member squints at the same dense spreadsheet to find their own hotel, their own call time, their own gear scope. This project replaces that experience with a per-crew-member, mobile-first webpage generated from Doug's existing sheet — shareable via link, automatically personalized, and updated as Doug edits the source.

**v1 in-scope outcomes:**

- Doug shares a Drive folder of his show sheets once. The app polls the folder, parses each sheet, and stores a normalized representation in Postgres.
- Each crew member gets a personalized URL. Opening it (signed in or via signed link) shows a phone-shaped page tailored to their identity and role.
- The page reflects the sheet within ~5 minutes of any edit Doug makes (poll-based sync; not realtime push at the source level, but realtime push from server to viewer once sync completes).
- Sensitive ops fields (PO#, Proposal $, Invoice, COI) are server-side filtered out of non-LEAD views.
- Doug can preview the exact page each crew member sees, flag parse warnings, and report issues directly to the developer (Eric) via GitHub Issues with structured context attached.
- The parser handles all four template versions in the corpus (v1 2024-05 → v4 2026-05) with v4 as the canonical target.

**Success looks like:** Eric (operating in dev mode against existing fixtures) can open a sheet from any era of the corpus, render the corresponding crew page on his phone, and have nothing be wrong, missing, or unstyled. When Doug eventually onboards, his only mental model addition is "share the folder once, share a URL per show."

---

## 2. Out of scope (explicit deferrals)

To keep v1 honest and shippable, the following are deliberately deferred:

- **`pdf-only/` and `email-embedded/` fixtures.** These are historical recovery cases that don't exist for new shows. Doug's actual production input is always a live Sheet. The corpus retains them for context only.
- **External agenda PDF parsing** (option C from the brainstorm). Agenda PDFs render via inline embed (PDF.js or `<iframe>`), not by extracting structured panel/speaker/sponsor data.
- **Crew notification emails.** When Doug adds a new crew member, the app does not auto-email them. Doug shares the URL out-of-band. Notification is a v2 candidate.
- **GEAR / case-prep view.** The GEAR tab is operations data; the crew page surfaces room-level Audio/Video/Lighting from the per-room block, but no per-case packing list. Schema-diff §5 explicitly endorses this stance.
- **Embedded image ingestion from inline cells.** The Drive MCP `read_file_content` returns text only. Inline image cells are out of scope; linked Drive folders/files are in scope per §10.
- **Multi-PM support.** Chip Mulzoff's and Corey Andrews's freeform-prose emails do not match Doug's template; their workflow stays outside the corpus and outside the parser. v2+ candidate at the earliest.
- **Native mobile app.** The web app is mobile-primary at ~390px target width. No iOS/Android native wrapper.
- **Crew-to-crew chat / comments / acknowledgments.** No social layer. The page is one-way: Doug → crew.

---

## 3. Architecture

### 3.1 System overview

```
┌─────────────┐                                         ┌──────────────────┐
│ Doug's      │                                         │ Crew member's    │
│ Drive       │                                         │ phone (Safari /  │
│ (Sheets)    │                                         │  Chrome)         │
└──────┬──────┘                                         └────────┬─────────┘
       │ shares folder w/                                        │
       │ service account                                         │
       │                                                         │
       │                                                         │
       ▼                                                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       Vercel (Next.js App Router)                     │
│                                                                       │
│  ┌────────────┐    ┌────────────────┐ ┌──────────────────┐           │
│  │ /admin     │    │ /show/[slug]   │ │ /show/[slug]/    │           │
│  │ (Doug,     │    │ (signed-in     │ │  p?t=<jwt>       │           │
│  │  Eric)     │    │  crew)         │ │ (link-only)      │           │
│  └────────────┘    └────────────────┘ └──────────────────┘           │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐    │
│  │  Vercel Cron (every 5 min): drive-sync function              │    │
│  │   1. List sheets in watched folder via Drive API             │    │
│  │   2. For each modified-since-last-pull, fetch + parse        │    │
│  │   3. Upsert to Supabase                                      │    │
│  │   4. Publish on `show:{id}` Realtime channel                 │    │
│  └──────────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                              Supabase                                 │
│   • Postgres (parsed shows, crew, sync log, reports)                  │
│   • Auth (Google OAuth for crew + Doug + Eric)                        │
│   • Realtime (push updates to open viewer pages)                      │
└──────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                     ┌──────────────────────┐
                     │ GitHub Issues API    │
                     │ (target for Doug's   │
                     │  "Report to Eric"    │
                     │  reports)            │
                     └──────────────────────┘
```

### 3.2 Request flows

**Cold page load (signed-in crew):**
1. Browser hits `crew.fxav.show/show/<show-slug>`.
2. Next.js middleware checks Supabase Auth session. If none, redirect to `/auth/sign-in?next=…`.
3. Server Component fetches show from Postgres + matches `auth.user.email` to a `crew_members` row in that show.
4. If match: render personalized page server-side, with role-based filtering applied at the data layer (see §7).
5. Client component subscribes to Supabase Realtime channel `show:<id>` to refetch on update.

**Cold page load (signed-link crew):**
1. Browser hits `crew.fxav.show/show/<show-slug>/p?t=<jwt>`.
2. Next.js middleware verifies JWT signature + expiry. Token contains `{showId, crewMemberId, role, exp}`.
3. Server Component fetches the same data with the token-encoded identity. No Supabase Auth session required.
4. Same client-side Realtime subscription.

**Sync trigger:**
- Vercel Cron runs the sync function every 5 min.
- Function: list folder via Drive `files.list` with `modifiedTime > lastPollAt`, fetch each, parse, upsert. Publish channel notification per affected show.

### 3.3 Cost projection (free tier, scale: ≈14 shows/yr × ~4 crew × bursty viewing)

| Resource | Projected use | Free-tier limit | Notes |
|---|---|---|---|
| Vercel bandwidth | ~80 MB/mo | 100 GB | Negligible. |
| Vercel function invocations | ~5k/mo | 100k | Negligible. |
| Vercel Cron runs | ~8.6k/mo | unmetered | 5-min cadence × 30 days. |
| Supabase Postgres size | ~1–5 MB | 500 MB | Parsed shows are tiny. |
| Supabase MAUs | ~10–20 | 50k | Crew + Doug + Eric. |
| Drive API calls | ~10k/mo | 12k/min | Far under quota. |

**Cash cost: $0/mo at projected scale.**

**Operational footnotes:**
- Supabase free-tier projects pause after 7 days of inactivity. A daily Vercel Cron ping prevents pause; alternatively, accept ~10s wake on first request between shows. Spec defaults to the daily-ping approach.
- Vercel function cold starts ~1s on first hit. Acceptable.
- Google OAuth refresh tokens for the service account need rotation handling; standard `google-auth-library` covers this.

---

## 4. Data model

Postgres schema sketch. All tables use Supabase Auth's standard `id uuid` primary keys unless stated. Row-level security (RLS) policies are noted per table.

### 4.1 Core tables

```sql
-- Shows. One row per Doug-produced sheet.
create table shows (
  id              uuid primary key default gen_random_uuid(),
  drive_file_id   text not null unique,            -- stable across rename/move
  slug            text not null unique,            -- human-readable, e.g. "rpas-central-2026-03"
  title           text not null,                   -- "RPAS Central 2026"
  client_label    text not null,                   -- "II" or "AII/III"
  client_contact  jsonb,                           -- { name, email, phone, officePhone?, secondary? }
  template_version text not null,                  -- "v1" | "v2" | "v3" | "v4"
  venue           jsonb,                           -- { name, address, loadingDock, googleLink, notes? }
  dates           jsonb,                           -- { travelIn, set, showDays: [...], travelOut }
  ops             jsonb,                           -- LEAD-only fields: { coi, proposal, po, invoice, invoiceNotes }
  event_details   jsonb,                           -- flat key/value of EVENT DETAILS section
  agenda_links    jsonb,                           -- [{ label, fileId|url }]
  diagrams_link   text,                            -- Drive folder URL
  raw_unrecognized jsonb default '[]'::jsonb,      -- [{ block, key, value }] — see §6
  parse_warnings  jsonb default '[]'::jsonb,       -- [{ severity, code, message, blockRef? }]
  last_synced_at  timestamptz,
  last_sync_status text,                           -- "ok" | "error" | "pending"
  last_sync_error text,
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

create table crew_members (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid not null references shows(id) on delete cascade,
  name            text not null,
  email           text,                            -- nullable: older fixtures lack emails
  phone           text,
  role            text not null,                   -- raw role string, normalized in app code
  role_flags      text[] not null default '{}',    -- ["LEAD","A1","V1","BO","ONLY"] etc.
  date_restriction jsonb,                          -- { kind: "explicit"|"unknown_asterisk"|"none", days: ["3/24","3/26"]? } -- which DATES the crew member works
  stage_restriction jsonb,                         -- { kind: "explicit"|"none", stages: ["Load In","Set"]? } -- which STAGES (load-in/set/strike/load-out)
  flight_info     text,                            -- only present in 2024-10 fixture
  unique (show_id, name)
);

create table hotel_reservations (
  id                uuid primary key default gen_random_uuid(),
  show_id           uuid not null references shows(id) on delete cascade,
  ordinal           int not null,                  -- 1..4
  hotel_name        text,
  hotel_address     text,
  names             text[] not null default '{}',  -- raw "Names on Reservation" lines
  confirmation_no   text,
  check_in          date,
  check_out         date,
  notes             text
);

create table rooms (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid not null references shows(id) on delete cascade,
  kind            text not null,                   -- "gs" | "breakout" | "additional"
  name            text not null,
  dimensions      text,                            -- e.g. "82' x 94' x 14'"
  floor           text,
  setup           text,
  set_time        text,
  show_time       text,
  strike_time     text,
  audio           text,
  video           text,
  lighting        text,
  scenic          text,
  power           text,
  digital_signage text,
  other           text,
  notes           text
);

create table transportation (
  id                uuid primary key default gen_random_uuid(),
  show_id           uuid not null references shows(id) on delete cascade,
  driver_name       text,
  driver_phone      text,
  driver_email      text,
  vehicle           text,
  license_plate     text,
  color             text,
  parking           text,
  schedule          jsonb not null default '[]'::jsonb,  -- [{ stage, date, time }]
  notes             text
);

create table contacts (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid not null references shows(id) on delete cascade,
  kind            text not null,                   -- "venue" | "in_house_av"
  name            text,
  email           text,
  phone           text,
  notes           text
);

create table sync_log (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid references shows(id) on delete cascade,
  drive_file_id   text,
  status          text not null,                   -- "ok" | "parse_error" | "drive_error" | "auth_error"
  message         text,
  parse_warnings  jsonb default '[]'::jsonb,
  duration_ms     int,
  occurred_at     timestamptz not null default now()
);

create table reports (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid references shows(id),
  reported_by     text,                            -- email or "doug" identifier
  context         jsonb not null,                  -- { surface, crewPreview?, fieldRef?, parseWarnings, rawSnippet }
  message         text,
  github_issue_url text,
  created_at      timestamptz not null default now()
);
```

### 4.2 Why JSONB for some columns

`client_contact`, `dates`, `ops`, `event_details`, `agenda_links`, and the `schedule` column on `transportation` are stored as JSONB rather than normalized columns because:

1. They have version-gated fields (e.g., `ops.invoice` is v4-only) and forcing a schema migration for every new template field is the wrong direction given §6's resilience strategy.
2. They are read whole, never partial — the page renders all of `ops` for a LEAD or none of it for a non-LEAD; there's no `WHERE ops.po = ?` query.
3. New fields surface immediately without a migration; the parser writes them, the renderer either knows them or surfaces them as part of the "More from sheet" disclosure (per §6).

Tables that **are** normalized (`crew_members`, `hotel_reservations`, `rooms`, etc.) have stable cardinality and are queried by relations — `WHERE show_id = ? AND kind = 'gs'`.

### 4.3 RLS policies

- `shows`, `crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts`: readable by signed-in users whose email matches a `crew_members.email` for that show, OR by users with the `admin` role (Doug, Eric). Writable only by `admin`. Signed-link views bypass RLS via service-role calls in server-rendered routes (the JWT is verified at the route layer).
- `sync_log`, `reports`: admin-only.

### 4.4 Field-level filtering rule

Some columns are **never** returned to non-LEAD crew, even when their show row is accessible:

- `shows.ops` (entire JSONB)
- `shows.parse_warnings`
- `shows.raw_unrecognized` (unless the v2 "More from sheet" disclosure ships and the field is promoted)

Implementation: Server Components fetch with a `viewerRole` parameter; the data layer omits these columns from non-LEAD responses. RLS is the second line of defense, not the first.

---

## 5. Sync pipeline

### 5.1 Trigger and cadence

- Vercel Cron `*/5 * * * *` runs `app/api/cron/sync/route.ts`.
- A daily ping at `0 12 * * *` keeps Supabase awake (separate cron or part of the same job).
- Manual sync trigger available at `/admin/show/<slug>` for Doug/Eric to force a refresh.

### 5.2 Per-run sequence

1. Authenticate with Drive using the service account credentials (env var `GOOGLE_SERVICE_ACCOUNT_JSON`).
2. Call `files.list` on the watched folder ID with `q="modifiedTime > '<lastPollAt>' and mimeType='application/vnd.google-apps.spreadsheet'"`.
3. For each modified file:
   - Fetch content via Drive API. The exact extraction call (single `files.export` to a markdown-equivalent vs. per-tab `spreadsheets.values.batchGet`) is decided at implementation time and tracked in §16 open questions; the parser's input contract is "markdown-table-shaped text identical in structure to the existing fixture corpus," so either path satisfies it.
   - Run the parser (§6). Capture parse warnings.
   - Upsert to `shows` and child tables. Use `drive_file_id` as the upsert key on `shows`.
   - Insert a `sync_log` row.
   - Publish on Supabase Realtime channel `show:<id>`.
4. Update a global `lastPollAt` cursor.

### 5.3 Failure modes

| Failure | Detection | Behavior |
|---|---|---|
| Drive API down | Network/HTTP error from Drive client | Sync log entry; existing `shows` rows unchanged. Page renders last-good with stale-time footer. |
| Sheet deleted/un-shared | `files.get` 404 | Mark `shows.last_sync_status = 'auth_error'`. Doug's admin page surfaces a "this sheet is no longer accessible" warning with re-share instructions. Page still renders last-good. |
| Parser hard error (e.g. cannot find any recognizable INFO block) | Caught exception in parser | `last_sync_status = 'parse_error'`, error stored. Page renders last-good. Doug's admin parse panel shows the error prominently. |
| Parser soft warning (e.g. unrecognized field) | Parser emits warning to `parse_warnings` | Sync still succeeds. Warning surfaces in Doug's parse panel; report-to-Eric available. |
| Supabase write fails | DB error | Sync log entry; retry on next cron run. Page renders last-good. |
| Supabase project paused (post-7-day-idle) | Connection error | Daily ping cron prevents this. If hit, Vercel function returns 503; page renders an "app is waking up, retry in 10s" message. |

### 5.4 Stale-data UX

Per §11, the page footer always renders `last updated <relative time> · live from sheet`. Color-coded:

- < 10 min: subtle, normal weight
- 10 min – 1 h: subtle but with a small dot indicator
- 1 h – 6 h: yellow tint
- \> 6 h: red tint with `couldn't sync — contact Doug` callout

---

## 6. Parser design

The parser converts a markdown-table-shaped sheet export into the canonical schema described in §4. Five principles:

### 6.1 Lists, not slots

Anything that has appeared more than once in any fixture is modeled as a list with cardinality `0..N`:

- `crew[]` (1–6 observed)
- `gs_rooms[]` (1–2 observed; dual-GS in 2025-03)
- `breakouts[]` (0–4 observed)
- `additional_rooms[]` (0–N observed)
- `hotel_reservations[]` (1–4 observed)
- `agenda_links[]` (1–2 observed; multi-program shows split)
- `client_contacts` modeled as `client_contact + secondary?` (1–2 observed)
- `venue_contacts[]`, `in_house_av_contacts[]` (1–N observed; cells often contain multiple humans separated by newlines)

No fixed-slot fields for any cardinality > 1.

### 6.2 Notes as first-class on every block

Every structured block carries a `notes: text` slot for free-text content that doesn't fit a known field. The 2026 template established the pattern with `Venue Notes` (e.g., `2026-03` line 76: "Needs Center box truss for lights due to chandeliers"); the parser extends it to every block. Examples that flow into `notes`:

- `*GETS RESET ON 5/13 AFTERWARDS TO COMBINED ROOM` (2025-05, BO Setup → `breakouts[].notes`)
- `Forklift operator required for load in and out due to high dock height` (venue master row → `venue.notes`)
- `NO OUTSIDE FOOD OR DRINKS allowed on property; Elevator cannot be put on independent` (2026-04 → `venue.notes`)

Rendered in the UI as a small callout below the block's primary fields.

### 6.3 Unrecognized capture, never silent drop

For every row/column the parser reads, it either maps to a known schema field or stashes `{block, key, value}` in `shows.raw_unrecognized`. Crew page does NOT render these by default in v1. Doug's admin parse panel does, with a "Report to Eric" affordance.

This handles two cases:
- Doug introduces a new field in a future template (e.g., `Sponsor Lounge Access` row appears in 2027 sheets) — captured, surfaced to Doug, flaggable.
- A typo Doug doesn't realize (e.g., `Hotal Contact Info` in pre-2024-10 sheets) — captured, surfaced; the parser also has an alias for known typos (§6.4).

### 6.4 Version detection and field aliases (config-driven)

A `parser-config.json` file (or DB table) defines:

```json
{
  "versions": [
    { "id": "v4", "requires": ["row:Contact Office", "block:MAIN/SECONDARY"], "fieldMap": "v4-fields.json" },
    { "id": "v3", "requires": ["block:GEAR INVENTORY"], "fieldMap": "v3-fields.json" },
    { "id": "v2", "requires": ["row:Hotel Contact Info"], "fieldMap": "v2-fields.json" },
    { "id": "v1", "fallback": true, "fieldMap": "v1-fields.json" }
  ],
  "fieldAliases": {
    "venue.contact_info": ["Hotel Contact Info", "Hotal Contact Info", "Venue Contact Info"],
    "details.diagrams": ["DIagrams", "Diagrams", "DIAGRAMS"],
    "details.virtual_audience": ["Virtual Audience", "Virtaul Audience"],
    "transport.driver": ["Driver", "Equipment Transporter"],
    "ops.po": ["PO#", "PO\\#", "PO #"]
  }
}
```

Adding `v5` = adding one entry. Renaming a field upstream = adding one alias. No code deploy for naming churn.

Match resolution is **case-insensitive** and applies to row labels and column headers. Typos found in the fixtures (`Hotal`, `DIagrams`, `Virtaul`, `Goosneck`) are pre-loaded as aliases.

### 6.5 Free-text fallback for high-variance fields

Per schema-diff §9, these fields stay as raw strings without enum normalization:

- `event_details.power`
- `event_details.internet`
- `event_details.keynote_requirements`
- `event_details.opening_reel`
- `rooms.setup`, `rooms.audio`, `rooms.video`, `rooms.lighting`, `rooms.scenic`

Renderer surfaces them verbatim. New values (TBD, MAYBE, Backup Only, …) flow through unchanged.

### 6.6 Personalization signal extraction

Per schema-diff §7, the parser extracts these per-crew-member signals:

1. **Crew name → identity.** Used to filter hotel reservations (`namesOnReservation` substring match), driver assignment (`driver` exact match), AGENDA grid flight info, etc.
2. **Date restriction.** Which calendar days the crew member works. Three sources, in order of precedence:
   - **Parens with day list in the name cell**: `Calvin Saller (6/24 and 6/26 ONLY)` (verified `2025-06-ria-investment-forum.md:32`) → `{kind: "explicit", days: ["6/24","6/26"]}`. Pattern matched by regex against `\(([^)]+ONLY[^)]*)\)`. Days extracted by date-token scan (e.g., `\d{1,2}/\d{1,2}`).
   - **2026 `***` flag in role with no parens**: `Calvin Saller` + role ending `... ONLY***` (verified `2026-03-rpas-central-four-seasons.md:38`) → `{kind: "unknown_asterisk", days: null}` and a parse warning (`UNKNOWN_DAY_RESTRICTION`: "Calvin Saller has *** flag but no day list — please add a parenthetical like `(6/24 and 6/26 ONLY)` to the name cell or update the role").
   - **No flag, no parens** → `{kind: "none"}`.
3. **Stage restriction.** Independent of date restriction. Which load-in/set/strike/load-out stages the person covers. Source: the role-master enumeration at `2025-06-ria-investment-forum.md:110-121`:
   - Role string contains `Load In / Set ONLY` → `{kind: "explicit", stages: ["Load In","Set"]}`.
   - Role string contains `Load Out / Strike ONLY` → `{kind: "explicit", stages: ["Load Out","Strike"]}`.
   - Role string contains `Load In / Set / Strike / Load Out ONLY` (with or without `***`) → `{kind: "explicit", stages: ["Load In","Set","Strike","Load Out"]}` — i.e., every stage but with the implicit "this person is restricted in some way" signal that pairs with the date_restriction logic above.
   - All other role values (LEAD, A1, V1, BO, etc.) → `{kind: "none"}` (covers all stages).
4. **Role flags from role string.** Tokenize on `/` and `-`, lookup against the master role list (`{LEAD, LEAD/A1, LEAD/V1, A1, V1, BO, ONLY, CAM OP}` per `2025-06-ria-investment-forum.md:110-121`). Stored as `role_flags text[]`.
5. **LEAD detection.** `role_flags` contains `LEAD` ⇒ user sees ops fields (§7).

### 6.7 Per-show parse contract

Every parser run produces:

```ts
type ParseResult = {
  show: ShowRow;
  crewMembers: CrewMemberRow[];
  hotelReservations: HotelReservationRow[];
  rooms: RoomRow[];
  transportation: TransportationRow | null;
  contacts: ContactRow[];
  warnings: ParseWarning[];     // soft, sync still succeeds
  hardErrors: ParseError[];     // sync fails
};

type ParseWarning = {
  severity: "info" | "warn";
  code: string;                  // "UNKNOWN_FIELD" | "UNKNOWN_DAY_RESTRICTION" | "TYPO_NORMALIZED" | ...
  message: string;
  blockRef?: { kind: string; index?: number };
  rawSnippet?: string;
};
```

Hard errors are reserved for unrecoverable failures (e.g., cannot identify any INFO block). Everything else is a warning, surfaced to Doug, optionally reported to Eric.

---

## 7. Auth model

### 7.1 Identities

- **Crew member (FXAV staff)** — has email in sheet (required field 2025-06+). Signs in with Google; email match identifies them.
- **External stakeholder (driver, client contact)** — no Google login expected. Doug generates a signed link for them.
- **Doug (the PM)** — admin role, Google login. Email pre-allowlisted (`dlarson@fxav.net`).
- **Eric (the developer / operator)** — admin role, Google login. Email pre-allowlisted (`edweiss412@gmail.com`).

### 7.2 Signed link format

```
crew.fxav.show/show/<slug>/p?t=<jwt>
```

JWT payload:

```json
{
  "iss": "fxav-crew-pages",
  "sub": "crew_member:<uuid>",
  "showId": "<uuid>",
  "role": "non_lead" | "lead",
  "name": "<displayed in banner so Doug can verify>",
  "exp": <unix-ts, default 90 days>
}
```

Signed with HS256 using a shared secret in `JWT_SIGNING_SECRET` env var. Tokens are revoked by rotating the secret (nuclear) or by adding their `crew_member.id` to a `revoked_tokens` table (granular). v1 ships with the nuclear option only; granular revocation is a v2 polish.

### 7.3 Routing

| Route | Auth requirement | Notes |
|---|---|---|
| `/` | none | Marketing/landing. Optional in v1. |
| `/auth/sign-in` | none | Google OAuth via Supabase Auth. |
| `/me` | signed-in | Lists shows where the user's email matches a `crew_members` row. |
| `/show/<slug>` | signed-in OR has valid `t=` | Crew page. |
| `/show/<slug>/p?t=<jwt>` | valid JWT | Crew page via signed link. |
| `/admin` | admin role | Doug/Eric only. |
| `/admin/show/<slug>` | admin role | Per-show parse panel + impersonation entry points. |
| `/admin/show/<slug>/preview/<crew-id>` | admin role | Renders the crew page exactly as that person would see it. Sticky banner. |

### 7.4 Role-based field hiding

Server-side, in the data layer:

- If `viewerRole === 'lead'` (i.e., the matched `crew_members` row has `LEAD` in `role_flags`, OR the JWT carries `role: 'lead'`, OR the viewer is admin): include `shows.ops` in the response.
- Otherwise: omit `shows.ops`. The renderer therefore cannot render ops fields even if it tried.

This is the **first** line of defense (omit at fetch). RLS is the **second** (deny if a non-admin client tries to query directly). URL obscurity is **not** a line of defense in this app.

### 7.5 Doug's preview impersonation

When an admin opens `/admin/show/<slug>/preview/<crew-id>`, the server fetches data **as if** the viewer were that crew member (same role-based filtering applied). A sticky banner reads `Previewing as Eric Weiss (A1) · [Exit preview]` and the URL is admin-only. Crew never see this banner; admins always do.

---

## 8. Crew page UX

Direction **B** from the brainstorm: time-aware home + drill-down tiles. Mobile-primary at ~390px target width; desktop is supported but secondary.

### 8.1 Section inventory

**Top:**
- **Header strip:** show title + "you" badge (`EW · A1`). Tap "you" badge → show role legend tooltip.
- **Right Now card:** time-aware. See §8.2.

**Tile grid (2 cols on mobile, 3+ on desktop):**
- **Lodging tile** — your hotel only (filtered from `hotel_reservations` by `names` substring match on viewer name). Shows hotel, check-in→check-out, confirmation #.
- **Venue tile** — name, address line, loading dock, "Open in Maps" link, Diagrams gallery entry point.
- **Schedule tile** — days filtered by `date_restriction.kind`:
  - `none` → all days (travel-in, set, show day(s), travel-out).
  - `explicit` → only the listed dates plus a small "Restricted to <dates>" sublabel.
  - `unknown_asterisk` → all days, but with a yellow callout reading "Day restriction unclear in the sheet — please verify with Doug" so the crew member knows the data is questionable. Same warning surfaces in Doug's parse panel per §6.6.
  Within each day, shows call time per day if extracted from the inline `TIME / AGENDA` cell.
- **Audio scope tile** — for A1 / LEAD / LEAD/A1 viewers. Aggregates `rooms[*].audio` across GS, breakouts, additional rooms.
- **Video scope tile** — for V1 / LEAD / LEAD/V1 viewers. Same for `rooms[*].video`.
- **Lighting scope tile** — for crew with relevant role flag. Same for `rooms[*].lighting`.
- **Crew tile** — list of all crew on this show with role + phone + email tap-to-call/email. Always visible.
- **Contacts tile** — venue contact, in-house AV. Always visible.
- **Transport tile** — only if viewer is `transportation.driver_name` match, or if any of the schedule rows are tagged with their name (rare). Shows vehicle, license plate, color, parking, schedule. Otherwise hidden.
- **Ops tile** — LEAD only. PO#, COI, Proposal, Invoice. Hidden entirely for non-LEAD (omitted from data fetch per §7.4).
- **Notes tile** — any block-level `notes` content, aggregated into a single "Things to know" card.

**Footer:**
- `Last updated <relative time> · live from sheet`
- `Something looks wrong?` link → opens "Report this" dialog (admin only sees the report-to-Eric flow; crew flow deferred to v2).

### 8.2 Right Now card — time-aware states

The card at the top of the page swaps content based on the relationship between **today** and the show's date span. States:

| State | Trigger | Renders |
|---|---|---|
| `pre_travel` | today < travelIn − 1 day | "In N days · Travel in <weekday>" + "Hotel: <hotel>" |
| `travel_in_day` | today === travelIn | "Today: Travel in" + "Hotel check-in: <hotel>, <time>" |
| `set_day` | today === setDay | "Today: Set day" + "Load-in: <time> at <venue>" |
| `show_day_n` | today === showDays[n] | "Today: Show day N of M" + "Call: <time> · <room>" + "Strike: <time>" if last day |
| `travel_out_day` | today === travelOut | "Today: Travel out" + "Hotel check-out: <hotel>" |
| `post_show` | today > travelOut | "Wrapped <relative time> ago" with link to "view as archive" |
| `unknown` | one or more dates not parseable but at least one is | "Show details: <travelIn> – <travelOut>" with whatever was parsed; missing values render as "—". |
| `dateless` | no parseable date at all | "Show details unavailable. Check the sheet's DATES block." Card uses the stale-tint color scheme to signal something is wrong. |

**Compound transitions** (entered from one state, transitioning to another while data also changes):

| From → To | Animation |
|---|---|
| `pre_travel` → `travel_in_day` (date rollover) | Crossfade card body; preserve card height. |
| `show_day_n` → `show_day_n+1` | Same — crossfade body. |
| Any → `unknown` (sync error mid-show) | Card morphs to last-good state with a "stale" tint, no animation. |
| Sync update mid-state (data change, state same) | Bumps a small "updated" pulse on changed fields. No card-level animation. |

### 8.3 Empty state discipline

Per the brainstorm, every drill-down section must be useful even when Doug hasn't filled it in. Concrete rules:

- **Required fields missing** (e.g., venue name): the section renders a "Doug hasn't filled this in yet" placeholder, not an empty card. The placeholder text is intentionally human, not "field undefined."
- **Optional fields missing** (e.g., `Opening Reel = TBD`): the field is omitted from the tile entirely. The tile sized to its actual content. No "—" or "TBD" rendered to crew.
- **Whole tile missing** (e.g., no transport assigned to viewer): tile not rendered. Grid reflows.
- **Stale sync** (per §5.4): tile renders last-good; the page-level footer carries the staleness signal, not per-tile.

### 8.4 Dimensional invariants (page layout)

Mobile target viewport: 390px wide.

- The Right Now card is full-width (`100%` minus container padding) and has a fluid height — content-driven, not fixed. Min-height: 96px to prevent sub-card collapse on minimal data.
- The tile grid is 2 columns on viewports < 640px, 3 columns 640–1024px, 4 columns > 1024px. Tiles within a row stretch to equal height (`align-items: stretch`).
- Each tile has a min-height of 96px. Content overflows internally with a "see more" disclosure on tiles that naturally exceed 240px.
- The footer is sticky to the bottom of the viewport when the content is short; flows naturally when the content is long.

These invariants must be verified with a browser-rendered assertion (Playwright or chrome-devtools `evaluate_script`) calling `getBoundingClientRect()` per `data-testid` — jsdom alone is not sufficient (per global CLAUDE.md guidance).

### 8.5 Responsive desktop posture

Tiles regroup into a 3-or-4-column grid. The Right Now card stays full-width above the grid. No tabs, no sidebar. The page reads as a long single-column scroll on mobile and as a denser dashboard on desktop. No fundamentally different IA per viewport.

---

## 9. Doug's admin UX

### 9.1 `/admin` dashboard

A list of shows with per-row status:

| Column | Content |
|---|---|
| Title | `RPAS Central 2026` |
| Dates | `3/22 → 3/26/26` |
| Crew | `4` |
| Last sync | `12 min ago · ✓` (or `2h ago · ⚠ 2 warnings` or `1d ago · ✗ parse error`) |
| Actions | `Open · Preview as · Re-sync · Archive` |

Empty state if no shows: instructions to share the Drive folder with the service account email, with the email displayed as a copy-button.

### 9.2 `/admin/show/<slug>` — per-show parse panel

Three sub-sections:

1. **Sync health** — last 5 sync attempts with status and duration. Manual re-sync button.
2. **Parse warnings** — list of `parse_warnings` entries. Each warning has:
   - Severity icon
   - Human-readable message ("Calvin Saller has `***` flag but no day restriction in cell")
   - Raw snippet (`<pre>` showing the offending row)
   - "Report this to Eric" button → opens GitHub issue (§13)
   - Dismiss (does nothing destructive; just hides locally for this admin until next sync)
3. **Crew preview links** — each crew member's name with a "Preview as" link → `/admin/show/<slug>/preview/<crew-id>`.

### 9.3 `/admin/show/<slug>/preview/<crew-id>` — impersonation

Renders the exact crew page for that crew member, with:

- Sticky top banner: `Previewing as Eric Weiss (A1) — [Exit preview]`. The banner is `position: sticky; top: 0; z-index: 100;` and uses a distinct color (yellow tint) to make impersonation unmistakable.
- All role-based filtering applied as if the admin were that user.
- A "Report this view" button on the banner (in addition to any in-page "Report" links).

### 9.4 Connecting a new sheet (folder polling, not direct paste)

Per the brainstorm decision: Doug doesn't paste URLs. Instead, on first setup:

1. Doug visits `/admin` and sees: "Share a Drive folder with `<service-account-email>`. Any sheet you put in it will be synced automatically."
2. Doug shares the folder (one-time, in Drive UI).
3. Doug returns to `/admin` and clicks "I've shared the folder" (or the app polls and discovers automatically).
4. Within ~5 min, sheets appear in the dashboard.

For **dev mode** (Eric operating): Eric's Drive credentials (already authorized via the existing Drive MCP setup) authenticate the cron job. Production swaps to a service account with the folder shared by Doug.

---

## 10. Linked Drive content

Per §2 deferral list, agenda PDF parsing is out. But linked content is rendered with discretion:

| Link kind | Source field | v1 rendering |
|---|---|---|
| Agenda PDF (`.pdf`, `.docx`) | `agenda_links[].fileId` or `.url` | "Open agenda" button. On tap: in-page sheet with PDF.js inline preview (or `<iframe>` for native Drive preview as fallback). `.docx` falls back to "Open in Drive" (no inline preview). |
| Diagrams folder | `diagrams_link` | "Diagrams" tile. On tap: full-screen image gallery (swipeable), images fetched via Drive `files.list` on the folder + `files.get?alt=media` per image. Cached server-side. |
| Opening reel video | `event_details.opening_reel` if URL | The renderer detects a Drive URL by regex `^(https?://)?(drive\.google\.com|docs\.google\.com)/[^\s]+`. If matched, render inline `<video controls>` (or `<iframe>` for non-mp4 Drive files), proxied via `/api/asset/reel/<show>`. If the value is text only (`N/A`, `NO`, `MAYBE`, `YES`, `YES - LOOP VIDEO`, `TBD`, etc.), render as a small text line on the venue tile reading "Opening reel: <value>" and skip the player. Mixed values like `YES - <url>` get both: the text status and the player. |
| Test pattern, Aptos fonts, II LED logo | various | NOT surfaced to crew. These are operations files. They appear in admin under a "Production assets" disclosure. |

**Caching strategy** (Vercel Edge Cache + Supabase storage):
- Diagram folder image lists are cached for 1 hour. On manual re-sync, cache is invalidated.
- Individual diagram images are cached at the edge for 24 hours.
- Opening reel videos are streamed through a Vercel function; not cached locally.

**Caps on unbounded content:**
- **Diagrams gallery:** up to 12 images shown in initial render; "Show more" reveals the rest. If the folder contains > 60 images, the gallery hides any beyond 60 and surfaces a parse warning + admin note ("Diagrams folder has 78 images — showing first 60. Likely needs trimming.").
- **Notes tile (aggregated from every block's `notes`):** per-source items truncated at 280 characters with a "tap to expand" affordance. The tile itself shows up to 8 source items; remainder collapsed under "+N more notes."
- **Crew tile:** all crew members are shown; observed max is 6, theoretical max ≈ 12 — within reason. No truncation.
- **Hotel reservations:** up to 4 observed; rendered all. > 4 (defensive) reflows into a vertical list.

**Auth note:** Drive content fetches use the service account credentials. The crew page never sees the raw Drive URL; it always goes through an app-controlled URL like `/api/asset/diagram/<show>/<filename>`. This avoids leaking Drive folder access to non-crew.

---

## 11. Edit/sync semantics

| Scenario | v1 behavior |
|---|---|
| **Crew member removed from sheet** | Their `crew_members` row is deleted on next sync (cascade). Their signed-link 410s with `you've been removed from this show — contact Doug`. Their Google login resolves to "no access" for that show. They drop from `/me`. |
| **New crew member added** | Their row appears in `crew_members` on next sync. Doug shares the URL/link out-of-band. App does not auto-email. Their Google login starts working as soon as the sync completes. |
| **Sync failure** | Page renders last-good with the staleness signal in the footer. After 6h stale, the footer turns red and surfaces `couldn't sync — contact Doug`. Page never goes blank. |
| **Sheet renamed/moved in Drive** | We track `drive_file_id` which survives rename/move. No effect. |
| **Sheet deleted/un-shared** | `files.get` 404. `last_sync_status = 'auth_error'`. Doug's admin shows "this sheet is no longer accessible — re-share or restore." Page renders last-good. |
| **Template version changes mid-show** | Per-pull version detection (§6.4) re-dispatches. Field aliases handle most renames; net-new fields land in `raw_unrecognized`. |
| **No version marker matches** | Parser falls back to `v1` (most permissive) and emits a `VERSION_DETECTION_FAILED` warning naming all markers it tried. Doug's parse panel surfaces this as a hard-to-miss yellow banner. The page still renders from whatever the v1 dispatcher could extract. |
| **Crew role changes** | Re-fetch on next page load applies new role-based filtering. No session invalidation needed (the JWT carries role for signed links — if role flips, Doug re-issues the link). |
| **Show date moves** | Right Now card recomputes on next load and on every Realtime update. |

---

## 12. Error handling and observability

### 12.1 Layers

- **Parser:** every field extraction is fault-tolerant. Missing fields produce `null`, not exceptions. Hard errors only on unrecoverable structural failures (no INFO block at all).
- **Sync:** wraps the parser + Drive fetch + DB write in a single try/catch. Records to `sync_log` regardless of outcome. Never blows away last-good data on failure.
- **Render:** Server Components cannot throw past the boundary; they fall back to a "this section couldn't load — last good data shown" state with a report link. Client components have an Error Boundary that renders a similar fallback.
- **Auth:** unmatched Google login → "your email isn't on the crew list for this show; ask Doug to add you or share a signed link." Invalid JWT → "this link has expired or been revoked; ask Doug for a new one."

### 12.2 Observability

- **Sentry** for unhandled errors (Vercel + browser).
- **Supabase `sync_log` table** as the authoritative source of sync history.
- **Vercel Analytics** for page views (free tier).

### 12.3 Crew-side error UX

The page never shows a stack trace, an HTTP status code, or a "something went wrong" generic. Every error has an actionable message:

- "This link has expired — ask Doug for a new one."
- "We couldn't sync the latest from Doug's sheet. Showing what we had at <time>."
- "You're not currently on the crew list for this show."

---

## 13. Bug reporting pipeline

### 13.1 Surfaces (Doug-facing)

1. **Live parse feedback** during connect/edit — see §9.2. Inline list with severity, message, snippet, and a per-warning "Report to Eric" button.
2. **Per-crew preview** — see §9.3. Banner-mounted "Report this view" button.
3. **Crew page he's previewing as** — same "Report this" button at the page footer (visible only in admin mode).

### 13.2 Report destination: GitHub Issues

Each report opens a GitHub issue in a designated repo (default: this repo, `eric-weiss/FX-Webpage-Template`) via the GitHub REST API + a service account PAT (env `GITHUB_API_TOKEN`).

**Issue body template:**

```markdown
**Reported by:** <doug-or-admin email>
**Show:** <title> (`<slug>`)
**Surface:** <admin parse panel | preview-as page | other>
**Crew context:** <name + role, if previewing as someone>
**Field/section ref:** <e.g. "rooms[0].audio" or "venue.notes">
**Parse warnings (this section):**
- <warning 1>
- <warning 2>

**Doug's note:**
> <freeform message>

**Raw snippet:**
```
<sheet text near the issue>
```

**Last sync:** <timestamp>
**Drive file ID:** <id>
**Reporter URL:** <admin URL where the report was submitted>
```

Issue labels auto-applied: `bug-report`, `severity:<info|warn|error>`, `area:parser` (or `area:render`, `area:sync`, etc.).

The submission writes a row to `reports` table for app-side history, populates `github_issue_url` once GitHub returns a URL.

### 13.3 Rate limiting

The report API (`/api/report`) is rate-limited at 10 reports per admin per hour. Exceeding the limit returns a 429 with a "Slow down — already opened a lot of issues. Take a break, or message Eric directly" message. Limits are enforced via a Supabase table `report_rate_limits` keyed by reporter email. This protects the GitHub repo from accidental spam (e.g., Doug clicking "Report" on every parse warning at once).

### 13.4 Closing the loop

When Eric closes the GitHub issue (with a referenced commit/PR), the next sync surfaces a "fixed" indicator next to the original warning. v1 implementation: a manual "mark resolved" button on the report row in admin. Webhook-based auto-close is a v2 polish.

---

## 14. Tech stack & directory layout

### 14.1 Stack

- **Framework:** Next.js 16 (App Router), Server Components, Server Actions for admin mutations.
- **Hosting:** Vercel.
- **Database / auth / realtime:** Supabase Postgres + Supabase Auth + Supabase Realtime. RLS enforced.
- **Styling:** Tailwind CSS v4 with project-specific tokens established by `/teach-impeccable` (saved to `.impeccable.md`).
- **Fonts:** chosen per `frontend-design` skill guidance (no Inter/Roboto/system defaults).
- **Drive client:** `googleapis` Node SDK with service-account JWT auth.
- **PDF preview:** `pdfjs-dist` (or `<iframe>` to Drive preview as fallback).
- **Tests:** Vitest for unit (parser), Playwright for end-to-end (page render, layout invariants, role filtering).
- **Error tracking:** Sentry.
- **Analytics:** Vercel Analytics (free).
- **GitHub Issues integration:** `@octokit/rest` with a fine-grained PAT.

### 14.2 Directory layout (proposed)

```
app/
  (marketing)/
    page.tsx
  auth/
    sign-in/
  me/
    page.tsx
  show/
    [slug]/
      page.tsx                # crew page (signed-in)
      p/
        page.tsx              # crew page (signed-link)
  admin/
    page.tsx
    show/
      [slug]/
        page.tsx
        preview/
          [crewId]/
            page.tsx
  api/
    cron/
      sync/route.ts
      keepalive/route.ts
    asset/
      diagram/[show]/[file]/route.ts
      reel/[show]/route.ts
    report/route.ts            # POST creates a report + opens GH issue
components/
  layout/
  tiles/                       # Lodging, Venue, Schedule, Crew, Contacts, AudioScope, Ops, Notes
  right-now/                   # state-machine card with all §8.2 states
  admin/
  shared/                      # KeyValue, Section, EmptyState, ContextBadge, etc.
lib/
  parser/
    versions/v1.ts ... v4.ts
    aliases.ts
    schema.ts
    index.ts                   # parseSheet(markdown): ParseResult
  drive/
    client.ts
    sync.ts
  auth/
    jwt.ts
    rls.ts
  github/
    issues.ts
  supabase/
    server.ts
    realtime.ts
fixtures/                      # already exists
docs/
  superpowers/
    specs/                     # this file
.impeccable.md                 # established before UI work begins
```

### 14.3 Environment variables

| Var | Purpose |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Drive API auth |
| `WATCHED_DRIVE_FOLDER_ID` | Folder Doug shares |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `JWT_SIGNING_SECRET` | Signed-link tokens |
| `GITHUB_API_TOKEN` | GH Issues integration |
| `GITHUB_REPO` | `eric-weiss/FX-Webpage-Template` (default) |
| `SENTRY_DSN` | error tracking |
| `ADMIN_EMAILS` | comma-separated list (`dlarson@fxav.net,edweiss412@gmail.com`) |

---

## 15. v1 build sequence

Staged milestones, each independently demoable:

1. **Parser standalone.** Library function `parseSheet(markdown)` that ingests any fixture in `fixtures/shows/raw/` and returns a `ParseResult`. Vitest test for every fixture, asserting the canonical schema is populated and warnings are captured. No Next.js, no DB. **Demo:** "run `pnpm test:parser` and see all 10 raw fixtures parse cleanly."
2. **Schema + DB migrations.** Supabase Postgres tables per §4, RLS policies, seed script that loads parsed fixtures. **Demo:** "run `pnpm db:seed` and query the rows in Supabase Studio."
3. **Admin upload-test (no auth).** A throwaway `/admin/dev` page that accepts a fixture filename, parses, upserts, and shows the parse warnings. **Demo:** "Eric uploads any fixture and sees the parse panel."
4. **Crew page (no auth).** `/show/<slug>` renders the page from DB, with role hardcoded for testing. **Demo:** "open the page on a phone, see direction B with empty-state discipline."
5. **Auth.** Supabase Google OAuth + signed-link JWT. RLS enabled. Role-based field hiding. **Demo:** "sign in as a fixture-defined crew email, see your view."
6. **Drive sync (cron).** Vercel Cron → Drive API → parser → upsert → Realtime publish. **Demo:** "edit a sheet, see the page update within 5 min."
7. **Linked content (B).** Diagrams gallery, agenda PDF embed, opening reel inline. **Demo:** "tap diagrams, see the gallery; tap agenda, see the embed."
8. **Bug-report pipeline.** Parse panel + per-warning report button + GitHub Issues integration. **Demo:** "click report, see a GH issue open with full context."
9. **Stale-data UX, error states, empty states, polish.** Footer, error boundaries, every empty state. **Demo:** "pull the network plug, watch the page render last-good with stale tint."
10. **Onboard Doug.** Share folder, walk through admin, hand over.

Each milestone is a PR. Spec self-review and adversarial review run before milestone 1 begins.

---

## 16. Open questions & future work

### 16.1 Open questions

- **Drive content extraction call.** Either `files.export` to a markdown-flavored format (matches the corpus shape directly) or per-tab `spreadsheets.values.batchGet` (more structured, requires assembly into the corpus shape). Decide at parser-implementation time. Either feeds the same parser contract.
- **Domain.** Spec uses `crew.fxav.show` as a placeholder. Eric to register the actual domain. Could also be a path on an existing site.
- **Vercel cron 5-min cadence vs Drive push notifications.** Push (via `files.watch`) cuts staleness from minutes to seconds and reduces API calls, but adds webhook handling. Defer to v2 unless 5 min feels slow in practice.
- **Crew-side "report a problem" button.** v1 only ships Doug-facing reporting. Crew may want one too. Decide after Doug's first show.
- **Should ops fields ever be visible to non-LEAD?** PO# is operations-only today, but a non-LEAD A1 might genuinely need the COI status. Reconsider after Doug's feedback on first show.
- **Slug generation strategy.** Auto-derive from `<year>-<month>-<title-slug>` (e.g., `2026-03-rpas-central`)? Allow Doug to edit? Decide in milestone 2 when slugs first need to exist.
- **Date-restriction sanity check.** When `date_restriction.kind === 'explicit'`, should the parser warn if any of the listed dates fall outside the show's `dates.travelIn → dates.travelOut` span? (e.g., Calvin listed for `5/12 & 5/14` on a show that runs `5/13 → 5/15`.) Probably yes as a `DATE_RESTRICTION_OUTSIDE_SHOW_RANGE` warning, but defer the implementation to v2.

### 16.2 v2+ candidates (deferred but noted)

- Crew notification emails when Doug adds a new crew member.
- "More from sheet" disclosure on crew page surfacing `raw_unrecognized` content.
- Granular JWT revocation table.
- Webhook-based "fix landed → mark resolved" loop with GitHub.
- External agenda PDF parsing (option C).
- Inline image rendering for cells with embedded images (Drive MCP returns text only today; would need a different ingestion path).
- Multi-PM support (Chip's freeform emails, Corey's freeform emails) — different parser entirely.
- GEAR / case-prep view for production crew.

---

## Appendix A: References to fixture corpus

Every claim in this spec about Doug's template structure traces back to entries in `fixtures/shows/_schema-diff.md` and the raw fixtures themselves. Specifically:

- Template versions and detection markers: schema-diff §1, §9 (versioning strategy)
- Field inventory: schema-diff §2 (INFO field inventory)
- Cardinality bounds: schema-diff §3
- Room block shape: schema-diff §4
- GEAR tab: schema-diff §5 (deferred per §2 of this spec)
- Agenda format: schema-diff §6
- Personalization signals: schema-diff §7
- Edge cases & gotchas: schema-diff §8
- Recommended core schema: schema-diff §9 (this spec is its concrete realization)

This spec does not duplicate the schema-diff content. Reading the schema-diff is a prerequisite to implementing the parser.
