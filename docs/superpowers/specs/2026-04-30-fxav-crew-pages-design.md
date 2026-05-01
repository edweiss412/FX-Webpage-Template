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
│  │ (Doug,     │    │ (signed-in     │ │  p#t=<jwt>       │           │
│  │  Eric)     │    │  crew)         │ │ (link-only,      │           │
│  │            │    │                │ │  fragment auth)  │           │
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

These are summaries; the canonical specifications are §7.2 (auth) and §5.2 (sync). Any contradiction with those sections is a bug — those sections win.

**Cold page load (signed-in crew):**
1. Browser hits `crew.fxav.show/show/<show-slug>`.
2. Next.js middleware checks Supabase Auth session. If none, redirect to `/auth/sign-in?next=…`.
3. Server Component fetches show + matches `auth.user.email` to a `crew_members` row in that show.
4. If match: derive role fresh from current `crew_members.role_flags`, render personalized page server-side with role-based filtering at the data layer (§7).
5. Client component subscribes to Supabase Realtime channel `show:<id>` to refetch on update.

**Cold page load (signed-link crew):** (§7.2 is canonical)
1. Browser hits `crew.fxav.show/show/<show-slug>/p#t=<jwt>` — **JWT lives in the URL fragment, never the query string** (no `?t=` form anywhere).
2. Server renders a minimal bootstrap shell with no PII or role-gated data.
3. Client-side bootstrap reads `location.hash`, POSTs to `/api/auth/redeem-link`. The server runs the per-request authz flow (§7.2 step list: signature, expiry, `crew_members` lookup by `(showId, name)`, `tokenVersion` match, `revoked_links` check, fresh role derivation).
4. On success: server creates a `link_sessions` row, sets an HTTP-only `__Host-fxav_session` cookie. Client `history.replaceState`s the fragment away.
5. Browser reloads the route as `/show/<slug>` — the cookie now carries identity. Subsequent page renders run the cookie-session validation (§7.2.2) on every request.

**There is no token-carries-role flow.** Role is always re-derived from current `crew_members.role_flags` at request time, never from a JWT or session claim.

**Sync trigger:** (§5.2 is canonical)
- Vercel Cron runs the sync function every 5 min in `mode: "cron"`.
- **There is no global `lastPollAt` cursor anywhere in the system.** Each show is tracked independently via `shows.last_seen_modified_time`. The sync function lists every spreadsheet in the watched folder (folder-scoped `files.list` query, see §5.2 step 2), then per-file decides whether to skip based on the per-show watermark.
- Manual re-sync from `/admin/show/<slug>` runs in `mode: "manual"` which bypasses the watermark gate but still acquires the per-show advisory lock.
- After successful sync the function publishes on Supabase Realtime channel `show:<id>`.

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
  slug            text not null unique,            -- human-readable, e.g. "rpas-central-2026-03". Derived deterministically by deriveSlug(parseResult) on first successful parse; immutable thereafter (Doug renaming a show in Drive never changes the slug). Collisions resolved by appending "-2", "-3", etc. See §6.9.
  title           text not null,                   -- "RPAS Central 2026"
  client_label    text not null,                   -- "II" or "AII/III"
  client_contact  jsonb,                           -- { name, email, phone, officePhone?, secondary? }
  template_version text not null,                  -- "v1" | "v2" | "v3" | "v4"
  venue           jsonb,                           -- { name, address, loadingDock, googleLink, notes? }
  dates           jsonb,                           -- { travelIn, set, showDays: [...], travelOut }
  event_details   jsonb,                           -- flat key/value of EVENT DETAILS section
  agenda_links    jsonb,                           -- [{ label, fileId|url }]
  diagrams_link   text,                            -- Drive folder URL
  -- ops, parse_warnings, raw_unrecognized live in shows_internal (below) so
  -- they are physically impossible to read with non-admin RLS, even if a
  -- developer accidentally writes a query that selects the whole shows row.
  -- See §4.4 for the policy rationale.
  last_synced_at  timestamptz,
  last_sync_status text,                           -- "ok" | "parse_error" | "drive_error" | "sheet_unavailable" | "stale_write_aborted" | "concurrent_sync_skipped" | "pending_review" (first-seen sheet awaiting Doug's first-time approval, OR existing show staged for re-review) | "pending"
  last_sync_error text,
  archived        boolean not null default false,
  last_seen_modified_time timestamptz,             -- per-show watermark: last Drive `modifiedTime` we successfully ingested. NOT a global cursor — each show is tracked independently so a failed parse on show A doesn't skip an unrelated update on show B (see §5.2).
  created_at      timestamptz not null default now()
);

-- LEAD-only and admin-only fields. Physically separated from `shows` so
-- non-admin RLS cannot read these even via SELECT *. The application
-- joins this in only when the viewer is admin or has LEAD in role_flags
-- for this show.
create table shows_internal (
  show_id          uuid primary key references shows(id) on delete cascade,
  ops              jsonb,                           -- LEAD-only: { coi, proposal, po, invoice, invoiceNotes }
  parse_warnings   jsonb default '[]'::jsonb,       -- [{ severity, code, message, blockRef? }]
  raw_unrecognized jsonb default '[]'::jsonb        -- [{ block, key, value }] — see §6
);

-- Identity model in v1: (show_id, name) is the durable natural key for both
-- crew_members and crew_member_auth. The parser hard-rejects the rare case
-- of two crew rows in the same sheet sharing a name (DUPLICATE_CREW_NAME
-- in §6.8 / §6.7) so this collision can never reach the DB. Doug
-- disambiguates in the sheet (e.g., "John C." vs "John Carleo"). When Doug
-- renames a crew member, sync treats it as remove + add: the prior row's
-- crew_member_auth is preserved (old JWTs continue to be rejected via strict
-- equality), and the new row gets fresh auth state. Doug re-issues a link
-- for the renamed person from the admin UI. v2+ candidate: stable per-person
-- identifier across renames (would require a "crew_alias" lookup or
-- heuristic match).
create table crew_members (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid not null references shows(id) on delete cascade,
  name            text not null,
  email           text,                            -- nullable: older fixtures lack emails
  phone           text,
  role            text not null,                   -- raw role string from sheet, kept verbatim for display (e.g. "- Load In / Set / Strike / Load Out - LEAD / A1")
  role_flags      text[] not null default '{}',    -- CANONICAL: atomic capability flags ONLY. Permitted values: "LEAD", "A1", "V1", "BO", "ONLY", "CAM_OP", "GAV". A compound role like LEAD/A1 is split into ["LEAD","A1"]. Authorization is "LEAD" = ANY('LEAD' = ANY(role_flags)). NEVER store compound or display strings here.
  date_restriction jsonb,                          -- { kind: "explicit"|"unknown_asterisk"|"none", days: ["3/24","3/26"]? } -- which DATES the crew member works
  stage_restriction jsonb,                         -- { kind: "explicit"|"none", stages: ["Load In","Set"]? } -- which STAGES (load-in/set/strike/load-out)
  flight_info     text,                            -- only present in 2024-10 fixture
  unique (show_id, name)
);
-- Partial unique index — disallow two crew rows in the same show sharing an
-- email (when both have one). Backstops MI-5b: protects validateGoogleSession
-- against ambiguous email->row matches even if the parser missed the dup.
create unique index crew_members_show_email_unique
  on crew_members (show_id, email)
  where email is not null;
-- Note: crew_members no longer holds auth state. token_version moved to
-- crew_member_auth (below) so it survives the row's deletion-and-recreation
-- when Doug removes a crew member from the sheet and later re-adds them.

-- Auth state for a (show, name) identity. Survives crew_members row lifecycle:
-- when sync deletes a crew_members row (because the sheet no longer lists that
-- name), this row is NOT deleted. The current_token_version persists, so old
-- JWTs cannot resurrect when the same name returns to the sheet later.
create table crew_member_auth (
  show_id                 uuid not null references shows(id) on delete cascade,
  crew_name               text not null,
  current_token_version   int not null default 1,  -- the version Doug's currently-valid signed links carry; bumped by "Issue new link"
  max_issued_version      int not null default 1,  -- monotonic; never decreases. Equal to current_token_version under normal use; can exceed it if Doug bumps then revokes the bumped one without issuing.
  revoked_below_version   int not null default 0,  -- revocation floor: any JWT with tokenVersion <= this is rejected. Used by "Revoke all links" to invalidate all currently-issued versions atomically without writing per-version revoked_links rows. "Issue new link" bumps current_token_version above the floor; future links are valid.
  primary key (show_id, crew_name)
);

-- crew_members.id is still the canonical row identity. crew_member_auth is keyed
-- on the natural (show_id, name) tuple so it survives cascade deletion.
--
-- Sync interaction (formalized in §5.2):
--   - On crew row creation: ensure a crew_member_auth row exists for
--     (show_id, name); INSERT ... ON CONFLICT DO NOTHING so existing auth state
--     is preserved.
--   - On crew row deletion (delete-not-in-set): crew_member_auth is NOT touched.
--     If the same name returns to the sheet later, the old auth row joins back
--     in and prior JWTs are still rejected via strict equality (§7.2).
--   - "Issue new link" (admin action): UPDATE crew_member_auth SET
--     current_token_version = max_issued_version + 1, max_issued_version = max_issued_version + 1.
--     Issues a JWT carrying the new current_token_version.

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
  status          text not null,                   -- "ok" | "parse_error" | "drive_error" | "sheet_unavailable" | "stale_write_aborted" | "concurrent_sync_skipped"
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

### 4.1.1 Email normalization

Every email stored in this database — `crew_members.email`, `client_contact.email` (in JSONB), `contacts.email`, `transportation.driver_email`, `reports.reported_by` (when an email) — is **stored in canonical normalized form**:

```
canonicalize(email) := lowercase(trim(email))
```

This is enforced at every entry point:

1. **Parser**: `parseEmail(rawCell)` runs `canonicalize` before populating any `ParseResult` field. The parser never emits an un-normalized email.
2. **DB layer**: write helpers run `canonicalize` defensively before any `INSERT`/`UPDATE` — implementer cannot accidentally store mixed-case data.
3. **Read layer (Google validator)**: `validateGoogleSession` calls `canonicalize(supabaseAuth.user.email)` before the lookup against `crew_members.email`. The Google identity provider can return mixed-case; we normalize before comparing.
4. **RLS predicates**: any policy that compares `auth.email()` to `crew_members.email` uses `canonicalize(auth.email())`. Codified as a small `auth_email_canonical()` SQL helper available to RLS.

Schema-level guard (defense in depth): a CHECK constraint on `crew_members.email`:

```sql
alter table crew_members
  add constraint crew_members_email_canonical
  check (email is null or email = lower(trim(email)));
```

Same CHECK on every other column that stores an email. The partial unique index `unique (show_id, email) where email is not null` is therefore a uniqueness-on-canonical-form index.

Why not `citext`: would also work but adds an extension dependency. The text + CHECK pattern keeps the schema portable and the canonicalization explicit at every layer. Either is acceptable; v1 ships with the explicit pattern.

### 4.2 Why JSONB for some columns

`client_contact`, `dates`, `ops`, `event_details`, `agenda_links`, and the `schedule` column on `transportation` are stored as JSONB rather than normalized columns because:

1. They have version-gated fields (e.g., `ops.invoice` is v4-only) and forcing a schema migration for every new template field is the wrong direction given §6's resilience strategy.
2. They are read whole, never partial — the page renders all of `ops` for a LEAD or none of it for a non-LEAD; there's no `WHERE ops.po = ?` query.
3. New fields surface immediately without a migration; the parser writes them, the renderer either knows them or surfaces them as part of the "More from sheet" disclosure (per §6).

Tables that **are** normalized (`crew_members`, `hotel_reservations`, `rooms`, etc.) have stable cardinality and are queried by relations — `WHERE show_id = ? AND kind = 'gs'`.

### 4.3 RLS policies

- `shows`, `crew_members`, `hotel_reservations`, `rooms`, `transportation`, `contacts`: readable by signed-in users whose email matches a `crew_members.email` for that show, OR by users with the `admin` role (Doug, Eric). Writable only by `admin`. Signed-link views bypass RLS via service-role calls in server-rendered routes (the JWT is verified at the route layer).
- **`shows_internal`: admin-only** for both read and write — no end-user session ever has any RLS path that returns a row from this table. LEAD crew see this table's columns only because the server-side render path uses the service role on their behalf after deriving role from `crew_members.role_flags`.
- `sync_log`, `reports`, `pending_syncs`, `pending_ingestions`, `crew_member_auth`, `revoked_links`, `link_sessions`: admin-only.

### 4.4 Sensitive-field protection (defense in depth)

Three independent layers protect ops/internal data from leaking to non-LEAD users:

1. **Physical separation** — `ops`, `parse_warnings`, and `raw_unrecognized` live in `shows_internal`, not `shows`. A `SELECT * FROM shows` cannot return them because they aren't there. This is the **first** line of defense: implementer error or accidental over-selection cannot expose them.
2. **RLS** — `shows_internal` has admin-only RLS policies. Even if an end-user session somehow gets the row's primary key, no policy admits the read. This is the **second** line of defense.
3. **Server-side filter at fetch** — the LEAD-aware fetch helper (`lib/data/getShowForViewer(showId, viewerRole)`) explicitly joins `shows_internal` only when `viewerRole === 'lead'` (or admin). For non-LEAD viewers, it does not query `shows_internal` at all. This is the **third** line of defense and the source of the runtime UX.

A non-LEAD crew member querying directly via the Supabase client (using their own session) cannot reach `shows_internal` because layer 1 puts the data outside the table they can read AND layer 2 denies the read even if they tried to query the inner table by id. Non-LEAD A1 crew page renders are correct because layer 3 doesn't include the data in the response. URL obscurity is not in this list — it has never been a defense in this app.

---

## 5. Sync pipeline

### 5.1 Trigger and cadence

- Vercel Cron `*/5 * * * *` runs `app/api/cron/sync/route.ts`.
- A daily ping at `0 12 * * *` keeps Supabase awake (separate cron or part of the same job).
- Manual sync trigger available at `/admin/show/<slug>` for Doug/Eric to force a refresh; bypasses the watermark check and reprocesses unconditionally.

### 5.2 Per-run sequence

There is **no global watermark**. Each show is tracked independently via `shows.last_seen_modified_time`; a failure on show A cannot cause us to miss an update on show B.

**Two entry points** (both call into the same per-file processor at step 3):

- **`runScheduledCronSync()`** — invoked by Vercel Cron in `mode: "cron"`. Performs the folder-wide listing in step 2 and processes every file returned. This is the default sweep.
- **`runManualSyncForShow(driveFileId, mode = "manual" | "recovery")`** — invoked by the admin "Re-sync" button at `/admin/show/<slug>` (which resolves slug → drive_file_id) and by the recovery path when a `sheet_unavailable` show reappears. **Skips the folder listing entirely** — fetches and processes ONLY the selected `drive_file_id`. This means a manual click can never destructive-replay parses for unrelated shows. Step 2's folder listing is replaced by `files.get(driveFileId)` (or sentinel "file not in folder" handling if the file isn't accessible).

The remainder of this section describes the per-file processor; both entry points feed into it identically from step 3 onward.

1. Authenticate with Drive using the service account credentials (env var `GOOGLE_SERVICE_ACCOUNT_JSON`).
2. **Cron entry point only** — call `files.list` with **folder-scoped** parameters (Drive API does NOT auto-scope by folder; the parent constraint must be explicit). For the manual entry point, this step is replaced by a single `files.get(driveFileId, fields="id, name, modifiedTime, parents")` call; if the file is not in the watched folder (parents check) or returns 404, the manual run records the error and returns without entering the per-file loop.
   ```
   q: "'<WATCHED_DRIVE_FOLDER_ID>' in parents
        and mimeType = 'application/vnd.google-apps.spreadsheet'
        and trashed = false"
   pageSize: 100
   fields: "nextPageToken, files(id, name, modifiedTime, parents)"
   ```
   **Paginate until `nextPageToken` is absent** — never trust a single page. **No `modifiedTime` filter** — list every sheet in the folder every run; per-file decisions about whether to reprocess are made later via per-show `last_seen_modified_time`. With ~14 sheets total and ~12 runs/hour, this is well under any Drive quota.

   Defensive check: if any returned file's `parents` array does not contain `<WATCHED_DRIVE_FOLDER_ID>` (Drive supports multi-parenting; this guards against unexpected Drive behavior), drop it from the listing and emit a `UNEXPECTED_PARENT` warning to `sync_log`.
3. For each file in the listing:
   - Look up the matching `shows` row by `drive_file_id`. **Do NOT auto-create a stub** — the schema requires non-null `slug`, `title`, `client_label`, `template_version`, none of which exist before parsing. First-seen sheets without a `shows` row enter the "first-seen" path: parse first, then create the row with parsed metadata in Phase 2 (auto-apply) or in the Phase 1 staging path (pending review). For first-seen sheets the `(prior shows.last_seen_modified_time)` value used for `pending_syncs.base_modified_time` is `NULL` — the CAS in §6.8.1 explicitly handles `IS NOT DISTINCT FROM NULL` for this case.
   - **Watermark gate** — only the **automatic cron** path consults the watermark. Manual re-sync triggered from `/admin/show/<slug>` and `sheet_unavailable`-recovery runs (after a previously-removed sheet reappears) skip the gate. The two run modes are distinguished by an explicit `mode: "cron" | "manual"` parameter passed into the sync function:
     - `mode === "cron"` AND `file.modifiedTime <= shows.last_seen_modified_time` → skip (no work to do).
     - `mode === "manual"` → always proceed regardless of watermark.
     - `mode === "cron"` AND `shows.last_sync_status === 'sheet_unavailable'` AND `file` is now present → proceed regardless of watermark (status recovery).
   - Fetch content via Drive API. The exact extraction call (single `files.export` to a markdown-equivalent vs. per-tab `spreadsheets.values.batchGet`) is decided at implementation time and tracked in §16 open questions; the parser's input contract is "markdown-table-shaped text identical in structure to the existing fixture corpus," so either path satisfies it. **If the fetch fails before any parse can run** (Drive auth error, quota exceeded, file race-deletion, etc.):
     - If `shows` row exists: status-only update `last_sync_status = 'drive_error', last_sync_error = $msg`. Insert sync_log entry. Return without entering Phase 1.
     - If no `shows` row exists (brand-new sheet, Drive failure before any successful parse): UPSERT `pending_ingestions` keyed on `drive_file_id` with `last_error_code = 'DRIVE_FETCH_FAILED'` (or a more specific code) and the error message. Insert sync_log entry. Return without entering Phase 1. The brand-new sheet is now visible in admin's "Sheets we couldn't parse" panel.
   - Run the parser (§6). Capture parse warnings.
   - **Phase 1 — Lock and decide outcome (no destructive writes yet).** Open a single Postgres transaction:
     - **Acquire a per-show advisory lock**: `SELECT pg_try_advisory_xact_lock(hashtext('show:' || $drive_file_id))`. If lock acquisition returns `false`, abort this run for this show — another run is already syncing it. Log a `CONCURRENT_SYNC_SKIPPED` info-level entry and move on. The lock auto-releases on commit/rollback. **The lock is the universal race protection** and applies to every mode (cron, manual, recovery).
     - **Read-only sanity check**: re-read `shows` row by `drive_file_id` to confirm it still exists; capture current `last_seen_modified_time` for the staging path (becomes `pending_syncs.base_modified_time`).
     - **First-seen mandatory stage.** If no `shows` row exists for this `drive_file_id` (i.e., this is the first time the app has seen this sheet), the run **always** routes to the stage outcome (#2 below) regardless of whether MI invariants would otherwise auto-apply. Rationale: the watched folder is the production source of truth, so adding a sheet to it IS the publish action — but Doug always reviews a brand-new sheet's parse before crew see content. This makes accidental WIP placement safe (parse is captured but no public URL is reserved until Doug approves) and gives Doug a consistent mental model: every new sheet flows through the same review surface, never auto-publishes. Subsequent updates to an already-approved show use the normal MI gates (auto-apply when clean, stage when MI-6..MI-14 trip). Implementation: the condition `is_first_seen = (shows row does not exist for drive_file_id)` is evaluated in Phase 1 before invariant check; if true, jump directly to the stage outcome with `triggered_review_items` extended to include a single sentinel item `{id: <uuid>, invariant: "FIRST_SEEN_REVIEW", action_required: "approve"}` whose only valid action is `apply` (no rename/independent variants — this item just means "this is the first time we've seen this sheet, please confirm").
     - **Run §6.8 minimum-invariant check on the `ParseResult`.** Pick exactly one of three outcomes:
       1. **MI-1..MI-5a fail (hard fail)** → in the same transaction:
          - If `shows` row exists: `UPDATE shows SET last_sync_status = 'parse_error', last_sync_error = $msg WHERE drive_file_id = $1` (does NOT touch `last_seen_modified_time`, sheet-derived columns, or any child table). The "Phase 1 makes no destructive writes" guarantee allows status-column updates because they cannot damage the live snapshot.
          - If `shows` row does NOT exist (first-seen sheet hard-fail): UPSERT into `pending_ingestions` keyed on `drive_file_id` so the brand-new failed sheet appears in Doug's admin "Sheets we couldn't parse" panel:
            ```sql
            INSERT INTO pending_ingestions (drive_file_id, drive_file_name, last_error_code, last_error_message, last_warnings)
            VALUES (...) ON CONFLICT (drive_file_id) DO UPDATE SET
              last_attempt_at = now(),
              attempt_count = pending_ingestions.attempt_count + 1,
              last_error_code = EXCLUDED.last_error_code,
              last_error_message = EXCLUDED.last_error_message,
              last_warnings = EXCLUDED.last_warnings,
              drive_file_name = EXCLUDED.drive_file_name;
            ```
          COMMIT. Watermark NOT advanced. Insert a `sync_log` row recording `parse_error` with full warning detail.
       2. **MI-6..MI-14 trip (stage)** → behavior splits on whether a `shows` row already exists:
          - **First-seen stage (no `shows` row yet)**: do NOT insert a `shows` row. Slug derivation is deferred to first successful Apply or auto-apply per §6.9. Instead, UPSERT only into `pending_syncs` keyed on `drive_file_id`, with `base_modified_time = NULL`, `staged_modified_time = file.modifiedTime`, `parse_result`, fresh `staged_id`, `warning_summary`, `prior_last_sync_status = NULL`, `prior_last_sync_error = NULL`. The `pending_syncs.drive_file_id` FK to `shows(drive_file_id)` is therefore **relaxed for first-seen sheets** — see schema note below; in v1 we drop the FK constraint and add an explicit consistency check at app level (every `pending_syncs` row has either a matching `shows` row OR no `shows` row exists for that drive_file_id; never a stale orphan). The brand-new sheet appears only in admin's "Sheets we couldn't auto-apply" list (sourced from `pending_syncs` left-joined with `shows`); it does NOT have a public `/show/<slug>` URL because no slug exists yet.
          - **Re-stage of an existing show (`shows` row exists)**: **the pre-stage baseline must be immutable across restages.** If `pending_syncs` already exists for this `drive_file_id` (a prior stage hasn't been Applied or Discarded yet), the existing `prior_last_sync_status` / `prior_last_sync_error` are the true baseline and the UPSERT MUST preserve them — do NOT re-read `shows.last_sync_status` (which will be `'pending_review'` from the prior stage and would corrupt the baseline). Implementation: UPSERT keyed on `drive_file_id` with explicit `ON CONFLICT (drive_file_id) DO UPDATE SET prior_last_sync_status = pending_syncs.prior_last_sync_status, prior_last_sync_error = pending_syncs.prior_last_sync_error, ...` (everything else updates from EXCLUDED). If no `pending_syncs` row exists yet, INSERT with the live `shows.last_sync_status` / `last_sync_error` values as the captured baseline. THEN update `shows.last_sync_status` to `'pending_review'` and clear `shows.last_sync_error` (status-only, no other column changes). COMMIT. The crew page continues to render the prior approved snapshot.
          COMMIT. Skip phase 2.
       3. **All invariants pass** → continue to phase 2 within the same transaction. If `shows` row does not yet exist (first-seen auto-apply), Phase 2's destructive transaction inserts the full row AND deletes any matching `pending_ingestions` row (the brand-new sheet now has a real shows row, so it doesn't belong in the failure-queue surface anymore); otherwise it updates per the standard guards.
   - **Phase 2 — Destructive snapshot replacement (only if phase 1 chose outcome 3).**
     - **UPDATE on `shows`** — every mode is **monotonic**: a parse from an older `modifiedTime` may NEVER overwrite a snapshot derived from a newer one. Guards differ only in their tolerance for **equal** modifiedTimes:
       - `mode === "cron"` (normal path): `UPDATE shows SET ... WHERE drive_file_id = $1 AND (last_seen_modified_time IS NULL OR last_seen_modified_time < $incomingModifiedTime)`. Strict less-than: cron only writes when the incoming sheet is genuinely newer than what's stored. 0 rows → `STALE_WRITE_ABORTED`, ROLLBACK.
       - `mode === "manual"` (forced replay): `UPDATE shows SET ... WHERE drive_file_id = $1 AND (last_seen_modified_time IS NULL OR last_seen_modified_time <= $incomingModifiedTime)`. **Less-than-or-equal**, not unconditional. Doug's manual replay tolerates re-applying the same modifiedTime (e.g., he wants to force a re-render after a parser fix), but cannot push older data over newer data — that would be a regression. 0 rows → `STALE_MANUAL_REPLAY_ABORTED`, ROLLBACK with admin-visible message "this manual sync is stale; a newer parse has already been applied. Refresh and retry."
       - `mode === "cron"` AND status was `sheet_unavailable` (recovery): same `<=` guard as manual. Recovery tolerates equal modtime (sheet was unshared and re-shared without edits) but never older.
     - **Lock-before-fetch is NOT used** — fetch and parse happen before the advisory lock to keep parse work out of the lock window (parses can take seconds; locks should be brief). The monotonic UPDATE guards above are the correctness mechanism, not lock-before-fetch. A stale parse that races a fresher concurrent write loses the UPDATE-WHERE check and rolls back cleanly.
     - **`crew_members` write order — DELETE first, then UPSERT.** This ordering is required, not stylistic. Postgres evaluates the partial unique index `unique (show_id, email) WHERE email IS NOT NULL` at statement time. If we UPSERT first, a legitimate rename that keeps the same email (the old-name row still owns that email when the new-name row tries to INSERT) violates the index and aborts the whole transaction. DELETE-first frees the email before the new row claims it.
       ```sql
       -- 1) Delete rows whose names disappeared from the sheet.
       DELETE FROM crew_members
        WHERE show_id = $1
          AND name NOT IN ($2, ..., $N);  -- parsed name set

       -- 2) Upsert sheet-derived columns for surviving + new rows.
       INSERT INTO crew_members (show_id, name, email, phone, role, role_flags, date_restriction, stage_restriction, flight_info)
       VALUES ($1, $2, ...)
       ON CONFLICT (show_id, name) DO UPDATE SET
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         role = EXCLUDED.role,
         role_flags = EXCLUDED.role_flags,
         date_restriction = EXCLUDED.date_restriction,
         stage_restriction = EXCLUDED.stage_restriction,
         flight_info = EXCLUDED.flight_info;
       ```
       `crew_members` no longer holds any auth-only columns — auth state lives in `crew_member_auth`. The ON CONFLICT clause lists every sheet-derived column (any new sheet-derived column added later must also be added here) and there is no auth column to forget.
       
       `crew_members.id` is preserved across re-syncs for any rows that survived the DELETE (their names appear in the parsed set, so DELETE skipped them and UPSERT updated them in place). Auth state for deleted-then-re-added crew lives in `crew_member_auth` and is unaffected by either step.
     - **`crew_member_auth` provisioning + universal "bump on add"** — for each parsed `crew_members` row that was newly INSERTed (i.e., the name appears in the parsed set but did NOT exist in the prior `crew_members` set for this show):
       ```sql
       -- 1) Ensure the auth row exists. Existing rows from a prior life are
       --    intentionally preserved (we want to keep max_issued_version
       --    as a high-water mark so old JWT versions stay rejected).
       INSERT INTO crew_member_auth (show_id, crew_name)
       VALUES ($1, $2)
       ON CONFLICT (show_id, crew_name) DO NOTHING;
       -- 2) UNIVERSAL FLOOR BUMP: invalidate any preserved auth state for
       --    every newly-added name. The floor is set to max_issued_version
       --    (NOT current_token_version), and current_token_version is held
       --    one step above the floor so the row is in the "no live link"
       --    state until Doug explicitly issues one.
       UPDATE crew_member_auth
          SET revoked_below_version = max_issued_version,
              current_token_version = max_issued_version  -- equal to floor; no JWT can pass strict equality + floor check
        WHERE show_id = $1
          AND crew_name = ANY($newly_added_names::text[]);
       ```
       After this step the row is in the **"no live link" state**: `current_token_version === revoked_below_version`, so any JWT carrying `tokenVersion = current_token_version` fails the floor check at §7.2 step 5. The row cannot mint a usable link until Doug clicks "Issue new link," which runs:
       ```sql
       UPDATE crew_member_auth
          SET current_token_version = max_issued_version + 1,
              max_issued_version = max_issued_version + 1
        WHERE show_id = $1 AND crew_name = $2;
       ```
       After "Issue new link" runs once, `current_token_version > revoked_below_version` and the new JWT (carrying the bumped version) passes both authz checks. **Doug must Issue New Link for any newly-added crew member regardless of whether they're brand new or returning**; before he does, no signed-link path resolves for that crew member, only Google login. The admin UI for that crew row shows a single primary action labeled "Issue first link" (or "Issue new link" if `max_issued_version > 1` from prior life). It does NOT show "Copy share link" until the row leaves the no-live-link state.
       
       For names that survive (existed in prior, exist in new — UPSERT updated them in place): no auth-row write is needed. Their `crew_member_auth` row already exists from when they were first added.
     - **`crew_member_auth` revocation on removal** — for every name in the just-deleted set (the names that existed in `prior` but not in `new`):
       ```sql
       UPDATE crew_member_auth
          SET revoked_below_version = current_token_version
        WHERE show_id = $1 AND crew_name = ANY($2);
       ```
       This invalidates **every** outstanding signed link for that name at the moment of removal. If the name returns to the sheet later, the row is preserved (via the prior step's `ON CONFLICT DO NOTHING`) and the floor stays high, so an old JWT cannot resurrect on re-add. Doug must "Issue new link" on re-add, which bumps `current_token_version` past the floor.
     - For `hotel_reservations`, `rooms`, `transportation`, `contacts`: `DELETE WHERE show_id = $1`, then `INSERT` the parsed rows. These tables have no external FK references and no auth state; full replacement is safe and idempotent.
     - **`shows_internal` upsert** — sensitive-data table is written here, never on `shows`:
       ```sql
       INSERT INTO shows_internal (show_id, ops, parse_warnings, raw_unrecognized)
       VALUES ($show_id, $ops, $warnings, $unrecognized)
       ON CONFLICT (show_id) DO UPDATE SET
         ops = EXCLUDED.ops,
         parse_warnings = EXCLUDED.parse_warnings,
         raw_unrecognized = EXCLUDED.raw_unrecognized;
       ```
       This is the **only** write path for `shows_internal`. The `shows` table never carries these fields per §4.1.
     - **DELETE matching `pending_ingestions` row** if one exists (first-seen success path): `DELETE FROM pending_ingestions WHERE drive_file_id = $1`. The brand-new sheet now has a real `shows` row and no longer belongs in the failure-queue surface.
     - `last_seen_modified_time` is set to `$incomingModifiedTime` as part of the same UPDATE in the first step; it commits with the rest. `last_sync_status` is set to `'ok'` (clears any prior `'sheet_unavailable'` etc.).
   - Insert a `sync_log` row (outside the transaction is fine).
   - Publish on Supabase Realtime channel `show:<id>`.
4. **Detect removed sheets** — after the per-file loop, diff the listing against active `shows` rows:
   - Set `removedDriveIds = (SELECT drive_file_id FROM shows WHERE archived = false) - (file IDs returned by step 2)`.
   - For each `drive_file_id` in `removedDriveIds`: set `shows.last_sync_status = 'sheet_unavailable'` and `shows.last_sync_error = 'Sheet was removed from the watched folder, unshared from the service account, or moved out of scope. Re-share to restore.'`. Do NOT touch `last_seen_modified_time` (so cached data is preserved). Insert a `sync_log` row with status `sheet_unavailable`.
   - This is the canonical detection for sheet removal/unshare. The "files.get 404" path remains as a defensive secondary detection for the narrow race where a file disappears between list and fetch within the same run.
   - Reappearance: if a previously-removed sheet returns to the listing on a later run, the regular per-file flow picks it up via the existing `last_seen_modified_time` comparison. The next successful sync clears `last_sync_status`.
5. **On any per-show failure during the per-file loop**: the transaction rolls back. `last_seen_modified_time` is NOT advanced for that show, so the next run sees `file.modifiedTime > last_seen_modified_time` and retries automatically. Other shows in the same run are unaffected. The `sync_log` row is still inserted with `status = 'parse_error' | 'drive_error'`.

### 5.2.1 Why snapshot replacement (and not row-level upserts) for non-`crew_members` child tables

Hotel reservations, rooms, transportation rows, and contacts have no stable natural key in the source sheet — Doug can reorder hotel reservations, rename rooms, add or remove breakouts, change driver assignments. Row-level upserts would leave behind orphaned rows whenever the count or shape shrinks. Snapshot replacement (delete-all-for-show + insert-fresh, in one transaction) is atomic, idempotent, and matches the source-of-truth model where the sheet is canonical.

`crew_members` is the exception: signed-link JWTs reference crew by natural key `(show_id, name)`, and `crew_members.id` is occasionally referenced from admin UI URLs. Preserving identity across re-syncs avoids surprise breakage. Removing a crew row is still handled — the post-upsert delete-not-in-set step.

### 5.3 Failure modes

| Failure | Detection | Behavior |
|---|---|---|
| Drive API down (existing show) | Network/HTTP error from Drive client when fetching a known `shows` row | Sync log entry; existing `shows` rows unchanged. Page renders last-good with stale-time footer. |
| Drive API failure for a first-seen sheet | Listing succeeded but `files.export`/content fetch fails before any parse can run | UPSERT `pending_ingestions` keyed on `drive_file_id` with `last_error_code = 'DRIVE_FETCH_FAILED'` and the error message; surface in admin "Sheets we couldn't parse" panel so the failing brand-new sheet is visible. The retry happens on every cron run via the same listing → fetch path; once the fetch succeeds and parsing produces a valid result, Phase 2 deletes the `pending_ingestions` row. |
| Sheet deleted/un-shared/moved out of folder | Detected by §5.2 step 4 listing diff (canonical) OR `files.get` 404 (defensive secondary) | Mark `shows.last_sync_status = 'sheet_unavailable'`. Doug's admin page surfaces "this sheet is no longer accessible" with re-share instructions. Page still renders last-good. Sheet reappearance auto-recovers on next sync. |
| Concurrent run race | Per-show advisory lock + conditional UPDATE (§5.2). Lock-loser logs `CONCURRENT_SYNC_SKIPPED`; conditional UPDATE rejects late writers with `STALE_WRITE_ABORTED`. | Latest write wins. Older snapshot cannot overwrite newer. |
| Parser hard error (e.g. cannot find any recognizable INFO block) | Caught exception in parser | `last_sync_status = 'parse_error'`, error stored. Page renders last-good. Doug's admin parse panel shows the error prominently. |
| Parser produced output but failed any of MI-1..MI-5 (§6.8) | Hard-fail invariant | Same as parser hard error. Specific invariants listed in admin parse panel. Last-good snapshot retained. |
| Parser passed MI-1..MI-5 (and MI-5a, MI-5b) but tripped any of MI-6..MI-14 (crew shrinkage / section collapse / ops collapse / role/email/identity changes) | Stage-for-approval invariant | Snapshot **staged** in `pending_syncs`, not auto-applied. Admin parse panel shows the consolidated review with all triggered invariants. Doug picks "Apply" or "Discard." Apply uses the stored `parse_result` (§6.8.1) — never re-parses, never silently applies a newer sheet version. `last_seen_modified_time` is advanced only on Apply. |
| Parser soft warning (e.g. unrecognized field) | Parser emits warning to `shows_internal.parse_warnings` | Sync still succeeds. Warning surfaces in Doug's parse panel; report-to-Eric available. |
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

For every row/column the parser reads, it either maps to a known schema field or stashes `{block, key, value}` in `shows_internal.raw_unrecognized` (admin/LEAD-only table per §4.1). Crew page does NOT render these by default in v1 — the data physically isn't in any table a crew query can read. Doug's admin parse panel does, with a "Report to Eric" affordance.

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
4. **Role flags from role string.** Parse the raw role into the canonical `role_flags text[]` shape: **atomic capability flags only**. The master role list at `2025-06-ria-investment-forum.md:110-121` includes compound entries like `LEAD / A1`; these are decomposed during parse:
   - Strip the `Load In / Set / Strike / Load Out` stage prefix (handled by stage_restriction).
   - Tokenize the remainder by `/` and trim whitespace.
   - For each token, normalize to its canonical atomic flag: `LEAD`, `A1`, `V1`, `BO`, `ONLY`, `CAM_OP` (collapsed from `CAM OP`), `GAV`.
   - Result: `LEAD / A1` becomes `["LEAD","A1"]`, NOT `["LEAD/A1"]`. `BO` becomes `["BO"]`. `ONLY***` becomes `["ONLY"]` (the asterisks fed §6.6 step 2 separately).
   - Unknown tokens not in the canonical list are dropped from `role_flags` and surface as a `UNKNOWN_ROLE_TOKEN` warning.
   The raw role string is preserved in `crew_members.role` for display; `role_flags` is the authorization-safe representation.
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
  warnings: ParseWarning[];     // soft, sync still succeeds (provided minimum invariants pass)
  hardErrors: ParseError[];     // sync fails — last-good snapshot retained
};

type ParseWarning = {
  severity: "info" | "warn";
  code: string;                  // "UNKNOWN_FIELD" | "UNKNOWN_DAY_RESTRICTION" | "TYPO_NORMALIZED" | ...
  message: string;
  blockRef?: { kind: string; index?: number };
  rawSnippet?: string;
};
```

### 6.8 Minimum parse invariants (gate before destructive write)

The §5.2 transaction does destructive replacement (`DELETE FROM crew_members WHERE NOT IN ...`, full DELETE+INSERT for rooms / hotels / etc.). A partial parse must NOT reach that transaction; otherwise a parser regression or a transient template-drift glitch could erase live data.

**Before invoking the transaction, the sync function asserts every minimum invariant below.** If any fails, the run is treated as a parse_error: `last_sync_status` set to `parse_error`, `last_seen_modified_time` is NOT advanced (so the next run retries), the prior snapshot is left untouched, and the failed invariants are surfaced to Doug as a hard-to-miss error in the admin parse panel.

**Minimum invariants for v1.** Each invariant has one of three outcomes:
- **Hard fail** → `parse_error`, watermark NOT advanced, prior snapshot retained, surfaced in admin parse panel as a blocker.
- **Stage for approval** → write to `pending_syncs` (see §6.8.1), no destructive write, admin reviews and decides.
- **Pass** → proceed to destructive transaction.

| # | Invariant | Outcome on failure |
|---|---|---|
| MI-1 | Version detection succeeded (`templateVersion ∈ {v1,v2,v3,v4}`) AND no `VERSION_DETECTION_FAILED` warning raised | Hard fail |
| MI-2 | `show.title` is a non-empty string | Hard fail |
| MI-3 | At least one of `dates.travelIn`, `dates.set`, or `dates.showDays[0]` parsed to a valid date | Hard fail |
| MI-4 | `crewMembers.length >= 1` | Hard fail |
| MI-5 | `gs_rooms.length + breakouts.length + additional_rooms.length >= 1` | Hard fail |
| MI-5a | **Crew name uniqueness within the show:** `crewMembers` contains no duplicate `name` values. Two crew rows with the same display name cannot share an identity (auth would collapse them; renaming/role updates would corrupt one). | Hard fail with `DUPLICATE_CREW_NAME` error pointing at the colliding rows; Doug disambiguates in the sheet. |
| MI-5b | **Crew email uniqueness within the show (when present):** for any non-null `crewMembers[].email` after normalization (§4.1.1), no other crew row in the same parse may share the normalized form. Duplicate emails would let `validateGoogleSession` bind a Google login to either matching row ambiguously, leaking role/data across identities. | Hard fail with `DUPLICATE_CREW_EMAIL` error pointing at the colliding rows. Backed by a Postgres partial unique index `unique (show_id, email) WHERE email IS NOT NULL` on `crew_members.email` (which is itself stored normalized — see §4.1.1), so a violation cannot reach the destructive transaction even if the parser missed it. |
| MI-6 | **Crew shrinkage guard:** if a prior snapshot exists, `new.crewMembers.length >= prior.crewMembers.length` OR `prior.crewMembers.length - new.crewMembers.length <= 1`. The "≤1" tolerance covers the normal case of a single crew removal; anything bigger is suspicious. (Replaces the earlier <=2-crew exemption, which was too permissive.) | Stage for approval |
| MI-7 | **Section shrinkage guard:** for each of `hotelReservations`, `rooms` (sum across kinds), `contacts`: if `prior.<section>.length > 0` AND `new.<section>.length < prior.<section>.length` AND the drop is > 50% (or any drop when `prior <= 2`), stage. Strict collapse to zero is a special case of this. For `transportation` (null vs present): if prior was a populated row and new is null, stage. | Stage for approval |
| MI-7b | **Keyed preservation across re-syncs:** for sections with stable natural keys, if a key that existed in `prior` is missing from `new`, stage:<br>• `hotel_reservations` keyed on `ordinal` (1..4)<br>• `rooms` keyed on `(kind, name)`<br>• `contacts` keyed on `(kind, name)` (or `(kind, email)` if name absent)<br>This catches the "5 of 6 hotels remain but #2 silently disappeared" parser regression that pure-count thresholds would miss. | Stage for approval |
| MI-8 | **Ops-field preservation:** if `prior.ops` had any non-empty field (PO#, Proposal, COI, Invoice) AND any of those fields is now empty/null in the new parse, stage. (Note: any field collapse, not all — partial ops loss is a real signal.) | Stage for approval |
| MI-9 | **`role_flags` change for existing crew:** for each crew member that exists in both prior and new snapshots (matched by name), if `prior.role_flags` and `new.role_flags` are not set-equal (treating each as a set of atomic flags per §4.1's canonical shape), stage. Examples (all stage): `['LEAD','A1']` → `['A1']` (silent demotion losing ops access), `['A1']` → `['LEAD','A1']` (silent promotion gaining ops access), `['LEAD','A1']` → `['LEAD','V1']` (capability change), `['LEAD','A1']` → `['LEAD','A1','BO']` (additive change still stages — admin confirms intent), and the original collapse-to-empty case. **Any role_flags delta for an existing crew member triggers staging because role gates server-side data filtering.** | Stage for approval |
| MI-11 | **Email change for existing crew (auth-sensitive):** for each crew member that exists in both prior and new snapshots (matched by name), if the **normalized** prior and new email values differ — including null→non-null and non-null→null — stage. Email is the principal Google-login binds to: a parser bug or sheet typo that changes Alice's row to a different unique email would silently transfer access. Adding an email where there was none, or removing one, also stages because both flips alter who can sign in for that name. | Stage for approval. Admin review surface shows `prior.email` and `new.email` side by side. **On Apply, the destructive transaction additionally bumps `crew_member_auth.revoked_below_version = current_token_version` for the affected crew_name** so all existing signed links for that name are killed and Doug must Issue New Link before the new email holder gets link access. The Google-login path is also affected: until the next sync commits the new email, `validateGoogleSession` fails for the new email holder ("not on crew list yet"). |
| MI-12 | **Probable rename — remove+add with matching email:** detect rename candidates by inspecting the symmetric difference of names between prior and new. For each pair `(removed, added)` where `removed.email IS NOT NULL` and `canonicalize(removed.email) === canonicalize(added.email)`, treat as a probable rename. Without this check, a typo fix in the name cell would auto-apply remove-old-row + add-new-row, and (a) old signed links for the old name would survive only as long as the old name's auth row (now floor-revoked by §5.2's removal handler — fine), (b) the new name's `crew_member_auth` row gets fresh state and Doug has no review checkpoint to confirm the rename was intentional. | Stage for approval. Admin review surface shows the rename pair as a single line ("`Old Name` → `New Name`, email retained: `alice@fxav.net`") with explicit "Approve rename" / "Reject — keep prior" actions. On Approve, the destructive transaction runs the standard DELETE-then-UPSERT plus bumps `crew_member_auth.revoked_below_version` for **both** the old and new names so any prior signed links die regardless of which auth row they targeted. |
| MI-13 | **Combined name+email change — auth-bearing remove+add not classified by MI-11 or MI-12:** the parser's pairing detector greedily emits **pre-paired review items** at staging time. Pairing heuristic for MI-13: an unmatched removal (one whose name doesn't appear in the new set, having a non-null email) and an unmatched addition (one whose name doesn't appear in the prior set, having a non-null email) are paired by minimum Levenshtein distance on names, breaking ties by lexicographic order on `removed_name`. Each emitted item carries both pre-decided names. Unmatched removals/additions left over after greedy pairing become single-side review items: `MI-13-orphan-remove` or `MI-13-orphan-add` (apply-only, no rename option). | Stage for approval. **Doug confirms or rejects each pre-paired item binary** — there is no "pick a different pairing" UI in v1. If the heuristic paired wrong, Doug picks "These are independent changes" for that item; the system then treats both names as independent removal + addition. v1 deliberately drops the multi-candidate dropdown affordance — heuristics are good enough for the small-N case and Doug can re-edit the sheet if the auto-pairing is wrong. |
| MI-14 | **No-email rename / unmatched remove+add — both sides have null email:** the parser's pairing detector emits pre-paired review items using the same Levenshtein-distance heuristic as MI-13 but without the email constraint (since both sides are null). Unmatched leftovers become `MI-14-orphan-remove` / `MI-14-orphan-add` items. | Stage for approval. Same binary confirm/reject UX as MI-13. |
| MI-10 | **Per-crew `LEAD` toggle (capability flag specifically):** redundant with MI-9 but called out separately so it's harder to forget when MI-9 is implemented: any crew member where `prior.role_flags includes "LEAD"` differs from `new.role_flags includes "LEAD"`, stage. Treat MI-9 as the canonical implementation; MI-10 exists as a documentation-level safety net for reviewers reading the spec. | Stage for approval |

The MI-6..MI-14 stage-for-approval invariants extend MI-1..MI-5's blunt "is the parse usable at all" gate into a "did sections, sub-rows, or capabilities change in a way that needs human confirmation" gate. They catch parser regressions, accidental sheet-wide deletions, and authorization-affecting changes where the parse is structurally valid but its delta against the prior snapshot is suspect.

A single `pending_syncs` row aggregates all stage-for-approval events from a single parse run; admin sees one consolidated review surface listing every triggered invariant rather than one notification per section. The review UI surfaces a structured diff: per section, "Prior: <list>" vs "Incoming: <list>" with deletions in red and changes in yellow.

If MI-1..MI-5 fail, sync hard-fails. If any of MI-6..MI-14 trip (without MI-1..MI-5 failing), the parse is staged. If everything passes, sync proceeds to the destructive transaction.

#### 6.8.1 Approval bound to the staged parse, with compare-and-swap inside the lock

The approval write path runs entirely inside the per-show advisory lock. The compare-and-swap checks are part of the locked transaction, not an out-of-band pre-check, so no concurrent cron run or sheet change can slip a newer write in between the check and the apply.

**The Apply UI sends back the `staged_id` it rendered.** The server uses this to reject "Apply against a stale staged version" (e.g., admin opens two tabs, clicks Apply in tab A, then clicks Apply in tab B which is rendering an older `staged_id`). The server's first action is `SELECT staged_id FROM pending_syncs WHERE drive_file_id = $1` and a strict-equality compare to the submitted value.

When admin clicks "Apply" on a staged parse:

1. **Acquire the per-show advisory lock**: `pg_advisory_xact_lock(hashtext('show:' || $drive_file_id))` (blocking, since this is an admin action). Concurrent cron runs that hit `pg_try_advisory_xact_lock` for the same key get `false` and skip per the standard §5.2 flow.
2. **Inside the same transaction**, re-read the current `shows.last_seen_modified_time` and the stored `pending_syncs` row. **Compare-and-swap conditions** — all must hold:
   - `pending_syncs` row still exists for this `drive_file_id` (it wasn't discarded by another admin or superseded by a fresh staging).
   - Submitted `staged_id` matches `pending_syncs.staged_id`. If unequal → abort with "This staging has been superseded. Reload the admin page."
   - **`shows.last_seen_modified_time IS NOT DISTINCT FROM pending_syncs.base_modified_time`** — i.e., the live snapshot Doug compared against during review is still the live snapshot now. The two values intentionally compare as equal when both are NULL (brand-new show). If they differ, a newer parse committed since staging — abort: log `STAGED_PARSE_SUPERSEDED`, DELETE the stale `pending_syncs` row, return "A newer parse has already been applied. Refresh the admin page." The live snapshot has moved past what Doug reviewed; he reviews fresh.
3. **Mandatory Drive re-verify**: re-fetch `files.get(fileId, fields='modifiedTime')`. If `file.modifiedTime > pending_syncs.staged_modified_time`, the sheet has been edited again since Doug staged this parse — abort: DELETE the staged row, log `STAGED_PARSE_OUTDATED`, return "The sheet has been edited since you reviewed this parse. A fresh parse will be staged on the next cron run." The next cron run picks up the new modifiedTime, re-parses, and produces a fresh staging row. **This step is non-optional**; the prior round's "off by default" stance was rejected because for ops/role changes it can temporarily grant or remove access based on data Doug is no longer approving. The single Drive read per Apply click is well within quota.
4. **Apply the stored `parse_result`** via the §5.2 destructive transaction's snapshot-replacement steps — but using `pending_syncs.parse_result` as the input, NOT re-parsing the live sheet. Set `last_seen_modified_time = pending_syncs.staged_modified_time`.
5. INSERT a `sync_audit` row (per §6.8.3) capturing `triggered_review_items`, `reviewer_choices`, the server-derived `derived_side_effects`, and a parse_result summary. This is the durable audit record.
6. DELETE the `pending_syncs` row.
7. Commit. Lock auto-releases.

**The CAS keys on `base_modified_time`, not `staged_modified_time`.** The two are intentionally different — staging means "the incoming sheet has changed past what's live, but we don't auto-apply the change because it's suspicious." `base` is what Doug compared against; `staged` is what he wants to commit. Equality on `base` proves no other write has slipped in since review. Equality on `staged` was the round-7 bug.

**Approval never re-parses.** The decision Doug made is bound to the bytes he saw. The CAS in step 2 ensures that even with a concurrent cron run, the apply path commits exactly the staged data or aborts cleanly — never a hybrid.

#### 6.8.2 Approval-metadata contract

**The client never computes auth side-effects, and the server never persists per-attempt approval metadata on the shared `pending_syncs` row.** Persisting metadata before locking would let two concurrent Apply attempts race to overwrite each other's choices before either acquires the advisory lock. Instead, reviewer choices are submitted with the Apply request and consumed entirely inside the locked transaction (§6.8.1).

**Per-item identity.** A staged parse can trigger the same invariant multiple times — e.g., MI-11 firing for two distinct crew with email changes, or two MI-13 rename candidates in one sync. `pending_syncs.triggered_review_items` is a list of items each carrying a stable `id` UUID generated at staging time. Reviewer choices reference these ids; "exactly one choice per item id" is the validation rule, not "exactly one choice per invariant code."

**Client submission shape (the Apply endpoint):**

```json
{
  "staged_id": "<uuid>",
  "choices": [
    { "item_id": "<uuid-of-triggered-item>", "action": "apply" },
    { "item_id": "<uuid-of-triggered-item>", "action": "rename" },
    { "item_id": "<uuid-of-triggered-item>", "action": "independent" }
  ]
}
```

The client sends only `(item_id, action)` pairs. All other parameters (which crew_name, which removed/added pair) come from the stored `triggered_review_items` row. The client cannot inject names; it can only choose actions.

**Server-side derivation table** (the only place auth side-effects are computed; runs request-local inside the locked transaction):

| Triggered item invariant | Valid `action` values | Server-derived auth side-effects |
|---|---|---|
| FIRST_SEEN_REVIEW | `apply` | none. The sentinel just confirms Doug has reviewed the brand-new sheet. Apply proceeds as normal first-seen Apply (creates the `shows` row with derived slug, runs Phase 2). |
| MI-6, MI-7, MI-7b, MI-8, MI-10 | `apply` | none (no auth floor bump) |
| MI-9 (role_flags change) | `apply` | none — role propagates via Phase 2 UPSERT, takes effect on next request |
| MI-11 (email change, same name) | `apply` | bump auth floor for `item.crew_name` |
| MI-12 (probable rename, same email) | `rename` \| `reject` | `rename`: bump auth floor for both `item.removed_name` AND `item.added_name`; record `{from: removed_name, to: added_name}` in audit. `reject`: route to Discard path; the parse is rejected as if the user clicked Discard (an item-level rejection still kills the entire staged parse — partial-applies are out of scope for v1). |
| MI-13 (pre-paired by detector at staging) | `rename` \| `independent` | `rename`: bump auth floor for both `item.removed_name` AND `item.added_name` (matches MI-12). `independent`: per §5.2's universal "bump on add" rule, the added name's auth floor is automatically bumped at INSERT time regardless of this item's choice. So the per-item auth side-effect for `independent` is just the standard removal flow — no extra action needed beyond the §5.2 default behavior; the audit record notes the pair was rejected as a rename. |
| MI-14 (pre-paired no-email) | `rename` \| `independent` | Same as MI-13. |
| MI-13-orphan-remove, MI-14-orphan-remove (single-side leftover removal) | `apply` | bump auth floor for `item.removed_name`. (No rename option — there's nothing to pair with.) |
| MI-13-orphan-add, MI-14-orphan-add (single-side leftover addition) | `apply` | none — §5.2's universal "bump on add" already handles this name. |

**Server-side validation, performed inside the locked transaction:**

1. **Choice completeness.** Every entry in `pending_syncs.triggered_review_items` must have exactly one matching choice (matched by `item_id`). Missing → `MISSING_REVIEWER_CHOICE`. Extra → `EXTRA_REVIEWER_CHOICE`. Duplicate `item_id` in submission → `DUPLICATE_REVIEWER_CHOICE`.
2. **Action validity.** Each choice's `action` must be one of the values listed for the corresponding item's invariant. Wrong `action` → `INVALID_REVIEWER_ACTION`.
3. **No name validation needed** — the names come from the server-stored item, not the client.
4. **Reject handling.** If any choice carries `action: "reject"`, the entire Apply is **routed through the same server-side Discard transaction described below** — it does not just DELETE `pending_syncs`. The Discard path restores `shows.last_sync_status` / `last_sync_error` from the captured `prior_last_sync_status` / `prior_last_sync_error`, then deletes the `pending_syncs` row, all inside the advisory lock. No destructive write, no `sync_audit` row (the action wasn't an apply). This is critical: skipping the Discard restore would leave the show stuck in `'pending_review'` with no `pending_syncs` row, which breaks both the dashboard queue and the show's status indicator. Partial applies are still out of scope; v1 either applies the whole staged parse with all auth side-effects or rejects all of it via the same Discard logic.

After validation passes, the server computes the union of all per-item side-effects, executes the Phase 2 transaction (DELETE-then-UPSERT, `crew_member_auth` floor bumps for the union of names), inserts the `sync_audit` row carrying `triggered_review_items` and `reviewer_choices`, and DELETEs `pending_syncs`. All of this happens inside the same lock + transaction so no concurrent Apply can interleave.

**The Apply transaction's auth-side-effect step** (after the standard DELETE-then-UPSERT in §5.2 Phase 2):

```sql
-- Bump auth floor for every name in revoke_floor_for_names.
-- Idempotent: re-running Apply with the same metadata is a no-op.
UPDATE crew_member_auth
   SET revoked_below_version = current_token_version
 WHERE show_id = $show_id
   AND crew_name = ANY($1::text[]);  -- $1 = derived_side_effects.revoke_floor_for_names (computed request-local from validated choices)
```

The Apply side derives the `revoke_floor_for_names` set request-locally from the validated reviewer choices. Nothing mutable is persisted on `pending_syncs` between staging and Apply, so concurrent Apply attempts can race the lock but cannot poison each other's metadata.

#### 6.8.3 Durable audit record

After Apply commits successfully, the server inserts a row into `sync_audit` (new admin-only table) **before deleting `pending_syncs`**:

```sql
create table sync_audit (
  id                uuid primary key default gen_random_uuid(),
  show_id           uuid references shows(id) on delete cascade,
  drive_file_id     text not null,
  applied_at        timestamptz not null default now(),
  applied_by        text not null,                  -- admin email (Doug or Eric)
  staged_id         uuid not null,                  -- the pending_syncs.staged_id consumed
  triggered_review_items jsonb not null,            -- copy of pending_syncs.triggered_review_items at the moment of Apply (each with id, invariant, item-specific fields)
  reviewer_choices  jsonb not null,                 -- the validated client submission: [{item_id, action}, ...]
  derived_side_effects jsonb not null,              -- the union of server-derived auth side-effects: { revoke_floor_for_names: [...], rename_pairings: [...], independent_changes: [...] }
  parse_result_summary jsonb not null,              -- compact summary of what got applied: { crewMemberCount, hotelCount, ... } — the full parse_result is large and lives in sync_log if needed for forensics
  base_modified_time timestamptz,
  staged_modified_time timestamptz not null
);
create index sync_audit_show_id_idx on sync_audit (show_id, applied_at desc);
create index sync_audit_drive_file_id_idx on sync_audit (drive_file_id, applied_at desc);
```

Every Apply produces exactly one `sync_audit` row. This is the canonical record of "who approved what, with which decisions, against what staged version, with what auth side-effects." If a revoke is later observed to have been missed (or unexpectedly applied), `sync_audit` is the source of truth for forensic recovery. RLS: admin-only.

When admin clicks "Discard":
- Inside the advisory lock and a single transaction:
  - For an **existing-show** stage: read `pending_syncs.prior_last_sync_status` and `prior_last_sync_error`. UPDATE `shows SET last_sync_status = $prior_status, last_sync_error = $prior_error WHERE drive_file_id = $1`. DELETE the `pending_syncs` row. The page continues serving the prior approved snapshot, and the dashboard's status indicator returns to exactly the value it had before staging (which may itself be a non-`ok` state like `sheet_unavailable` — important so Discard does not falsely make a degraded show look healthy).
  - For a **first-seen** stage: there is no `shows` row. The discard simply DELETEs the `pending_syncs` row; the next cron run re-fetches and re-stages (or passes / hard-fails) from scratch. No URL slug is reserved until first successful Apply.
- COMMIT. Lock auto-releases.

Hard errors (`hardErrors[]`) from the parser itself remain reserved for unrecoverable structural failures (e.g., the input wasn't a markdown table at all). The minimum invariants are layered on top of `hardErrors` and catch the "parse succeeded technically but the output is suspicious" case.

Everything that's not a hard error and not an invariant violation is a soft warning — surfaced to Doug, optionally reported to Eric, sync proceeds.

### 6.9 Slug derivation

The crew page URL is `/show/<slug>`; the slug is set on first successful parse and never changes for the lifetime of the show. **Slug is not sheet data** — Doug renaming the spreadsheet in Drive does NOT change the slug, because crew already have URLs in their phones.

`deriveSlug(parseResult, existingSlugs)`:

1. Build a base candidate: `<YYYY-MM>-<title-slug>` where:
   - `<YYYY-MM>` comes from `parseResult.show.dates.set ?? dates.travelIn ?? dates.showDays[0]` formatted as `2026-03`. (One of these is guaranteed by MI-3.)
   - `<title-slug>` is `parseResult.show.title` lowercased, ASCII-folded, non-alphanumeric → `-`, collapsed runs of `-`, trimmed leading/trailing `-`, capped at 60 characters. Example: `RPAS Central 2026` → `rpas-central-2026`.
2. **Collision policy**: if `existingSlugs` (from `SELECT slug FROM shows`) already contains the candidate, append `-2`. If `-2` collides, try `-3`, and so on. Terminate at `-99` and emit a `SLUG_COLLISION_LIMIT` hard error (one show family producing 100 slugs is a parser bug; abort).
3. The selected slug is INSERTed with the `shows` row in Phase 2 / Apply. **It is never updated** by subsequent syncs even if the title changes.

Slug derivation runs only when `shows` doesn't yet exist for the `drive_file_id`. Subsequent syncs of the same `drive_file_id` keep the slug as-is.

Edge cases:
- A subsequent show with the same `(year-month, title)` collides at the slug level; `-2` resolves it. Two shows with literally identical 2-tuples is rare in practice (Doug's templates carry the year in the title).
- A re-share of a previously-deleted show under a fresh `drive_file_id` would produce a fresh `shows` row with a fresh slug; the prior crew URLs from the old `shows` row remain pointed at archived data via the `archived` flag in §11. Doug's choice to re-issue links for the new show is part of the per-show admin flow.

---

## 7. Auth model

### 7.1 Identities

- **Crew member (FXAV staff)** — has email in sheet (required field 2025-06+). Signs in with Google **or** uses a signed link Doug shared with them. Both paths resolve to a row in `crew_members`.
- **Doug (the PM)** — admin role, Google login. Email pre-allowlisted (`dlarson@fxav.net`).
- **Eric (the developer / operator)** — admin role, Google login. Email pre-allowlisted (`edweiss412@gmail.com`).

**Out of scope for v1: external stakeholders** (non-FXAV drivers like James Wells from `2025-03-dci-rpas-central.md`, client contacts, in-house AV, vendor reps). They are not modeled as identities in v1 — there is no signed-link or login path that recognizes them. Doug continues to share documentation with these people through email/text the way he does today. This is intentional: the v1 auth/data model assumes every viewer is either an admin or a row in `crew_members`. Adding a separate `external_viewers` table with its own issuance, revocation, and rendering rules is a v2 candidate (§16.2). The "driver, client contact" framing from earlier brainstorm rounds was retired during adversarial review when the auth flow couldn't represent it without leaking pseudo-rows into crew-facing UI.

### 7.2 Signed link format

```
crew.fxav.show/show/<slug>/p#t=<jwt>
```

**The JWT lives in the URL fragment, never the query string.** This is non-negotiable. Fragments are never sent in `Referer` headers, never logged by Vercel/Drive/CDN access logs, and never indexed in browser address-bar history search the way query strings can be. Since the page embeds external content (Drive PDFs, diagram images, optional opening-reel video), a token in `?t=` would leak to those origins via `Referer` even before any explicit mitigation.

**First-load bootstrap exchange:**
1. Doug shares `https://crew.fxav.show/show/dci-rpas-2026/p#t=<jwt>` with the crew member.
2. Browser navigates; `/show/<slug>/p` server-renders a minimal bootstrap shell (no PII, no role-gated data) that includes a small client-side script.
3. The bootstrap script reads `location.hash`, POSTs the token to `/api/auth/redeem-link` with `credentials: same-origin`. Server runs the per-request authz flow below; on success, sets an HTTP-only `__Host-fxav_session` cookie scoped to the show (15-minute TTL, refreshed on activity), and returns `200 OK` with the matched `crew_member.id`.
4. The bootstrap script calls `history.replaceState(null, '', location.pathname)` to strip the fragment from the URL bar, then reloads the route as `/show/<slug>` — the cookie is now the credential and the JWT is no longer in any URL.
5. All subsequent requests in the session use the cookie. Page response carries `Referrer-Policy: no-referrer` so any future external-asset loads don't leak even cookie-free URLs.

**Cookie semantics:**
- HTTP-only, `Secure`, `SameSite=Lax`, `__Host-` prefix.
- The `__Host-` prefix mandates `Path=/` and host-only (no `Domain` attribute) per browser rules. **Per-show isolation is enforced server-side**, not by cookie path: every page render runs §7.2.2 step 4 (`show.id === link_sessions.show_id`), so a cookie minted for show A on the same host can never be used to read show B even though the cookie itself is path-`/` and visible to all routes. We accept the broader cookie surface in exchange for the `__Host-` integrity hardening (cookie-fixation resistance, scheme binding, cross-subdomain protection); the server-side session-to-show binding is the actual authority.
- Cookie value is an opaque server-side session token (not the JWT). Sessions are stored in `link_sessions` keyed by the random token, mapping to `(show_id, crew_member_id, jwt_token_version, expires_at, last_active_at)`. Per-request authz on subsequent requests still re-derives role from current `crew_members.role_flags`; the cookie is identity, not authorization.
- TTL: 15 minutes idle (enforced via §7.2.2 step 9), 12 hours absolute (enforced via §7.2.2 step 3). After either expires the bootstrap exchange runs again on next visit (provided the original JWT hasn't expired and isn't revoked).
- Logout: deleting the cookie revokes the session locally but does not touch `revoked_links` or `crew_member_auth.revoked_below_version`. To revoke the underlying JWT, Doug uses §7.2.3.

This means the `?t=` form NEVER appears anywhere — not in spec examples, not in admin UI, not in copy-link affordances. Admin "Copy share link" generates URLs with `#t=`.

**A request with any `?t=` query parameter is treated as a compromise event, not just a bad link.** Vercel's runtime logs include search params in request log entries, so any URL of the form `/show/<slug>/p?t=<jwt>` that reaches the platform exposes the JWT to anyone with log access — regardless of how quickly middleware rejects the request. We cannot guarantee non-logging at the platform level on Vercel.

**Compromise-event handler** (single place in middleware that handles `/show/<slug>/p` with a `t` search param). Runs inside the per-show advisory lock so a concurrent Apply can't collide:

1. **Auto-revoke the carried JWT** — if the JWT signature is valid, parse `(showId, name, tokenVersion)` from its claims. If `tokenVersion === crew_member_auth.current_token_version` for that `(show_id, name)` (i.e., the leaked link is the **currently-active** version), the row must also be auto-rotated to "no live link" state — not just an exact-version revocation, because the admin UI's `Copy share link` would still surface this token until Doug manually rotated. Auto-rotation in the same transaction:
   ```sql
   UPDATE crew_member_auth
      SET revoked_below_version = max_issued_version,
          current_token_version = max_issued_version
    WHERE show_id = $1 AND crew_name = $2;
   ```
   The row enters the same "no live link" state defined in §5.2 — Doug must click "Issue new link" before any sharing affordance appears for that crew member. If `tokenVersion < current_token_version` (the leaked link is a stale historic version), only insert the surgical `revoked_links` row with the exact JWT's `token_version` and reason `leaked_via_query_string`; the current shareable version is unaffected. Using the service-role DB client; the user is unauthenticated at this point.
2. **Return 410 Gone** with the message: "This link format is no longer supported and the link has been revoked. Ask Doug for a new link." Do not redirect.
3. **Log a `LEAKED_LINK_DETECTED` warning** to `sync_log` (or a dedicated `security_events` table) so Eric sees it in admin. If the leaked link was the current version (auto-rotation triggered), include `auto_rotated_to_no_live_link: true` so admin can spot it.

The JWT in Vercel's request logs is now equivalent to a known-revoked token. After the handler completes, Doug's admin view of the affected crew row reflects "no live link" state and prompts an explicit "Issue new link" — the admin UI cannot accidentally re-distribute the dead token.

**Doug's UX guarantees**:
- Admin "Copy share link" only ever generates URLs with `#t=`. There is no path in the admin UI to produce a `?t=` URL.
- Sample/demo URLs in docs and the spec all use `#t=`.
- The compromise-event handler is the safety net for typos, copy-paste corruption, or legacy links that escaped pre-rollout.

JWT payload (intentionally minimal — **no role claim**):

```json
{
  "iss": "fxav-crew-pages",
  "sub": "crew_member:<show_id>:<crew_name>",
  "showId": "<uuid>",
  "crewMemberKey": { "showId": "<uuid>", "name": "Eric Weiss" },
  "displayName": "Eric Weiss",
  "tokenVersion": <int, monotonic>,
  "iat": <unix-ts>,
  "exp": <unix-ts, default 90 days>
}
```

Why no `role` in the token: roles change. If Doug demotes a LEAD to A1, an outstanding signed link with `role: lead` would keep showing PO/invoice data until the token expired. Instead, **the route handler re-derives role from the current `crew_members` row on every request.** The token only identifies *who* is requesting, not *what they can see*.

**Per-request authz flow** (signed-link path) — every check is required, in order:
1. Verify JWT signature and expiry. Reject (401) if either fails.
2. Look up `crew_members` by `(showId, name)` natural key. The JWT carries the natural key, not the UUID, so it survives the upsert/delete sync logic in §5.2.
3. If no row matches → 410 Gone with the "you've been removed from this show — contact Doug" message (§11).
4. **Strict-equality check against `crew_member_auth.current_token_version`** for `(showId, crew_members.name)`. If the auth row doesn't exist (defensive — should always exist alongside a crew_members row, but guard anyway) → 410 Gone "ask Doug for a new link." If `jwt.tokenVersion !== crew_member_auth.current_token_version` (whether older OR newer) → 410 Gone "this link has been replaced — ask Doug for a new one." **Strict equality is required** — a `<`-only comparison would let stale JWTs resurrect after a remove/re-add cycle, because a recreated crew row would default to a low version while old JWTs carry a higher one. The auth state lives in `crew_member_auth`, which survives crew_members deletion and never resets.
5. **Revocation-floor check**: if `jwt.tokenVersion <= crew_member_auth.revoked_below_version` → 410 Gone with "this link has been revoked. Ask Doug for a new one." This is the recoverable wildcard-equivalent: "Revoke all links for this person" sets `revoked_below_version = current_token_version`; "Issue new link" bumps `current_token_version` past the floor, so the freshly issued JWT (carrying the new higher version) passes both this check and the strict-equality check at step 4. Without this floor design, a wildcard revocation would permanently brick the (show, name) tuple's auth.
6. Check the `revoked_links` table (see §7.2.3) for surgical exact-version revocations:
   - Row with exact match on `(showId, name, tokenVersion)` → 410 Gone "this link has been revoked."
   - This handles the rare case Doug wants to revoke ONE historic version without affecting the current one. **The legacy wildcard token_version=0 row form is DEPRECATED and not implemented in v1** — its use case is fully covered by `revoked_below_version`, which is recoverable.
7. Derive `viewerRole` from current `crew_members.role_flags`. Apply role-based field hiding (§7.4) using this fresh value.
8. Render.

Signed with HS256 using `JWT_SIGNING_SECRET`.

#### 7.2.1 Per-link revocation (v1, not deferred)

A `revoked_links` table:

```sql
create table revoked_links (
  show_id        uuid not null references shows(id) on delete cascade,
  crew_name      text not null,
  token_version  int not null check (token_version > 0),  -- exact-version revocations only. The legacy "0 = wildcard" form is REMOVED in v1; use crew_member_auth.revoked_below_version for wildcard-equivalent semantics.
  revoked_at     timestamptz not null default now(),
  revoked_reason text,
  primary key (show_id, crew_name, token_version)
);

-- Per-link redeemed sessions (set after the bootstrap exchange in §7.2).
-- The opaque cookie value maps here, not the JWT. Sessions are short-lived
-- and idle-expire; the JWT lifetime gates how long new sessions can still
-- be redeemed from the original signed link.
create table link_sessions (
  token             text primary key,             -- random opaque value (cookie content)
  show_id           uuid not null references shows(id) on delete cascade,
  crew_member_id    uuid not null references crew_members(id) on delete cascade,
  jwt_token_version int not null,                 -- the tokenVersion at the time of redemption. Validated on every request against crew_member_auth.current_token_version (strict equality) AND against crew_member_auth.revoked_below_version (must be greater). See §7.2.2 steps 6-7.
  expires_at        timestamptz not null,         -- absolute expiry (12h from creation), enforced by §7.2.2 step 3
  last_active_at    timestamptz not null default now(),  -- idle TTL anchor, enforced by §7.2.2 step 9 (15-minute window)
  created_at        timestamptz not null default now()
);
create index on link_sessions (crew_member_id);

-- Staged parse results pending admin approval. Used when any of MI-6..MI-14
-- (§6.8) trip but the parse otherwise looks valid. The two modified_time
-- columns are both required for the CAS in §6.8.1:
--   base_modified_time   = the prior shows.last_seen_modified_time at the
--                          moment of staging. CAS target on Apply.
--   staged_modified_time = the incoming file's modifiedTime that produced
--                          this parse. The new last_seen_modified_time
--                          after Apply succeeds.
-- These differ by design: staged content is a NEWER version than the live
-- snapshot, which is exactly why review is needed before destructive write.
create table pending_syncs (
  drive_file_id        text primary key,             -- intentionally NOT FK'd to shows: a first-seen stage may exist for a drive_file_id with no shows row yet (slug derivation is deferred to Apply per §6.9). App-layer invariant: at most one pending_syncs row per drive_file_id, and a corresponding shows row exists if and only if that show has been previously approved.
  parsed_at            timestamptz not null default now(),
  base_modified_time   timestamptz,                 -- prior shows.last_seen_modified_time; NULL only when staging the very first parse for a brand-new show row
  staged_modified_time timestamptz not null,        -- file.modifiedTime at parse time
  parse_result         jsonb not null,              -- full ParseResult, ready to apply verbatim on approval
  triggered_review_items jsonb not null default '[]'::jsonb,  -- structured list of review items, each with a stable id. Computed at staging time, immutable. See shape below. Each item is a single per-occurrence decision Doug must make.
  prior_last_sync_status text,                       -- snapshot of shows.last_sync_status at the moment of staging. Used by Discard to revert without guessing. NULL when staging a first-seen show (no shows row yet).
  prior_last_sync_error  text,                       -- snapshot of shows.last_sync_error at the moment of staging. Same lifecycle as prior_last_sync_status.
  staged_id            uuid not null default gen_random_uuid(),  -- Apply UI passes this back; admin click that references a no-longer-current staged_id is rejected (defends against multi-tab "Apply" against a superseded staged version)
  warning_summary      text not null                -- human message shown in the admin "review and approve" UI
);
-- triggered_review_items shape (see §6.8.2). Each entry has a stable per-item id
-- so multiple instances of the same invariant in one parse are independently
-- representable and auditable:
--   [
--     { "id": "<uuid>", "invariant": "MI-11", "crew_name": "Alice" },
--     { "id": "<uuid>", "invariant": "MI-11", "crew_name": "Bob" },
--     { "id": "<uuid>", "invariant": "MI-13", "removed_name": "Cara", "added_name": "Carla" },
--     { "id": "<uuid>", "invariant": "MI-7",  "section": "hotel_reservations", "prior_count": 4, "new_count": 1 },
--     { "id": "<uuid>", "invariant": "MI-1..MI-5a", ... }  // MI-1..MI-5a never appear here; they hard-fail
--   ]
-- The "id" is generated at staging time and is what the Apply submission references.
-- approval_metadata is NOT a column on this table. It is computed transiently
-- inside the locked Apply transaction from validated reviewer choices (§6.8.2)
-- and consumed immediately, then written into sync_audit (§6.8.3). Persisting
-- it on pending_syncs would create a TOCTOU race between concurrent Apply
-- attempts.

-- First-seen sheet hard-fail surface. When a brand-new sheet (no shows row
-- exists) parses with MI-1..MI-5a hard failures, the spec deliberately
-- does NOT create a shows row. Without a separate visibility surface, the
-- failure would only appear in sync_log, which Doug doesn't watch.
-- This table backs an /admin "Sheets we couldn't parse" panel so brand-new
-- sheets that fail parsing are visible alongside successfully-parsed shows.
create table pending_ingestions (
  drive_file_id     text primary key,                -- not FK'd to shows: the row precisely captures the case where shows row doesn't exist
  drive_file_name   text not null,                   -- from files.list, displayed in admin
  first_seen_at     timestamptz not null default now(),
  last_attempt_at   timestamptz not null default now(),
  attempt_count     int not null default 1,
  last_error_code   text not null,                   -- "MI-1_VERSION_DETECTION_FAILED" | "MI-2_TITLE_MISSING" | "MI-3_NO_PARSEABLE_DATE" | "MI-4_NO_CREW" | "MI-5_NO_ROOMS" | "MI-5a_DUPLICATE_CREW_NAME" | "DRIVE_FETCH_FAILED" | etc.
  last_error_message text not null,                  -- human-readable
  last_warnings     jsonb default '[]'::jsonb        -- full ParseWarning[] from the failing parse so Doug can drill in
);
-- Lifecycle: row is INSERTed/UPDATEd by §5.2 Phase 1 hard-fail when no shows
-- row exists for the drive_file_id. Row is DELETEd by Phase 2 / Apply when
-- the same drive_file_id eventually succeeds and produces a shows row.
```

#### 7.2.2 Cookie-session validation (every subsequent request)

The redemption step in §7.2 mints a `link_sessions` row and a cookie. **That cookie is not a permanent grant — it is re-validated against current state on every page render.** Any of these checks failing aborts the request and deletes the offending session:

For every request to `/show/<slug>` (or any data fetch behind a redeemed link), the server:

1. Reads `__Host-fxav_session` from the cookie.
2. Looks up `link_sessions WHERE token = $cookie`. If not found → 401, redirect to "this link has expired — ask Doug for a new one."
3. Verify `link_sessions.expires_at > now()`. If not → DELETE the row, 401.
4. Look up the show by `slug` in the URL. Verify `show.id === link_sessions.show_id`. If not → 403 (cross-show cookie reuse attempt). DELETE the offending row.
5. Look up `crew_members WHERE id = link_sessions.crew_member_id`. If not found (the crew row was removed by sync) → DELETE the session, 410 Gone with the "you've been removed" message.
6. **Strict-equality `link_sessions.jwt_token_version === crew_member_auth.current_token_version`** (looked up by `(show_id, crew_members.name)`). If unequal in either direction → DELETE the session, 410 Gone with "this link has been replaced." Strict equality matches step 4 of the redemption flow and protects against the same remove/re-add reset attack.
7. **Revocation-floor check**: if `link_sessions.jwt_token_version <= crew_member_auth.revoked_below_version` → DELETE the session, 410 Gone "this link has been revoked." Same semantics as the redemption-flow step 5; protects active sessions against "Revoke all links."
8. **Surgical revoked_links check**: if a row exists in `revoked_links` with `(show_id, crew_members.name, token_version = link_sessions.jwt_token_version)` → DELETE the session, 410 Gone "this link has been revoked." (No wildcard form here either.)
9. **Idle-timeout check**: if `link_sessions.last_active_at < now() - interval '15 minutes'` → DELETE the session, 401 with "Your session has timed out due to inactivity. Open the original signed link again." This is the rolling-idle TTL the §7.2 cookie semantics promised; without this check, a stolen or forgotten cookie remains usable for the full 12-hour absolute TTL.
10. Update `link_sessions.last_active_at = now()` (advances the idle window for the next request).
11. Derive `viewerRole` from current `crew_members.role_flags`. Apply role-based field hiding (§7.4).
12. Render.

**Every numbered step above is a mandatory security check.** Steps 1–4 prove the cookie corresponds to a still-existing session, scoped to the right show, for an existing crew member. Steps 5–7 prove revocations and rotations have not invalidated the underlying authority. Step 8 is the surgical exact-version revocation. Step 9 is the rolling idle TTL. Skipping any step reopens a real attack surface:

| Skipping | Reopens |
|---|---|
| 1–2 | Forgotten/cleared sessions still grant access |
| 3 | Sessions outlive the 12h absolute cap |
| 4 | Cross-show cookie reuse |
| 5 | Removed crew can keep accessing |
| 6 | Strict version mismatch (resurrection after remove/re-add) |
| 7 | "Revoke all" wildcard never takes effect on active sessions |
| 8 | Surgical exact-version revocations never take effect on active sessions |
| 9 | Stolen/forgotten cookies usable for full 12h |

**Implementation note:** all 12 steps are encapsulated in a single `lib/auth/validateLinkSession(req)` helper that returns either `{ ok: true, viewerRole, crewMemberId }` or `{ ok: false, status, message }`. **The helper is the only correct way to authenticate a redeemed-link request; routes must never re-implement subsets.** It is called from every signed-link page route and any server action that mutates state on behalf of a redeemed user.

**Google-session authorization is structurally different and uses its own validator** (`lib/auth/validateGoogleSession(req)`):

1. Verify the Supabase Auth session is present and unexpired.
2. Look up `canonicalize(supabase.user.email)` against `crew_members.email` for the requested show. The DB column is already canonical per §4.1.1, so the comparison is exact-match on canonical form. If no match → 403 with "your email isn't on the crew list for this show." **If multi-match → 500 with `AMBIGUOUS_EMAIL_BINDING`** (this should be impossible because of the `crew_members_show_email_unique` partial index plus MI-5b, but the validator must explicitly reject rather than pick a row to defend against any future schema regression). Admin gets a `pending_ingestions`-equivalent alert; Doug fixes the duplicate in the sheet.
3. **Removal is the only revocation primitive for Google sessions.** When Doug removes a crew member from the sheet, sync's `delete-not-in-set` step removes the `crew_members` row, which causes step 2 to fail on the user's next request. There is no separate "revoke Google login" affordance.
4. Derive `viewerRole` from current `crew_members.role_flags`. Apply role-based field hiding (§7.4).
5. Render.

The signed-link revocation tables (`revoked_links`, `crew_member_auth.revoked_below_version`) are **signed-link-specific** and do NOT apply to Google sessions. They reference `tokenVersion`, which Google sessions don't carry. Implementation must NOT cross-wire these tables to the Google validator. The two validators share only `crew_members` lookup helpers and role-derivation; revocation logic is intentionally separate because the threat model is different (Google login = identity verified by Google, revocation = remove from sheet; signed link = portable token, revocation = explicit token-version invalidation).

#### 7.2.3 Revocation summary

Two independent mechanisms invalidate prior links:

- **Routine rotation (`current_token_version` bump)** — Doug's "Issue new link" button: `UPDATE crew_member_auth SET current_token_version = max_issued_version + 1, max_issued_version = max_issued_version + 1 WHERE show_id = $1 AND crew_name = $2`. Issues a fresh JWT carrying the new version. Older AND newer JWTs immediately fail strict equality. **No row inserted into `revoked_links`** — version mismatch handles this case for free.
- **Surgical revocation (`revoked_links` row, exact version)** — used when Doug wants to invalidate without issuing a replacement, or to revoke the currently-active version (e.g., a compromised link that he hasn't yet rotated). Doug's per-show admin page has "Revoke link" → inserts a row with the exact `current_token_version`.
- **Wildcard revocation via floor (`crew_member_auth.revoked_below_version`)** — used by "Revoke all links for this person." Sets `revoked_below_version = current_token_version`. Every currently-issued JWT (which carries `current_token_version` or older) is below the floor and rejected. Critically, this is recoverable: "Issue new link" bumps `current_token_version = max_issued_version + 1` and `max_issued_version = max_issued_version + 1`. The new JWT is `> revoked_below_version` and passes. The floor only invalidates versions ≤ its value, never future versions. **No `token_version = 0` row is written.**

Global rotation (rotating `JWT_SIGNING_SECRET`) remains available as a nuclear option for total-system invalidation.

### 7.3 Routing

| Route | Auth requirement | Notes |
|---|---|---|
| `/` | none | Marketing/landing. Optional in v1. |
| `/auth/sign-in` | none | Google OAuth via Supabase Auth. |
| `/me` | signed-in | Lists shows where the user's email matches a `crew_members` row. |
| `/show/<slug>` | signed-in OR has valid `t=` | Crew page. |
| `/show/<slug>/p#t=<jwt>` | valid JWT (from fragment) + current matching `crew_members` row + tokenVersion match + not in `revoked_links` | Crew page via signed link. JWT lives in URL fragment only; immediately exchanged for an HTTP-only session cookie via `/api/auth/redeem-link` (§7.2). The JWT alone is insufficient. |
| `/api/auth/redeem-link` | POST with JWT in body | Per-request authz flow (§7.2). On success: sets `__Host-fxav_session` cookie + writes `link_sessions` row. |
| `/admin` | admin role | Doug/Eric only. |
| `/admin/show/<slug>` | admin role | Per-show parse panel + impersonation entry points. |
| `/admin/show/<slug>/preview/<crew-id>` | admin role | Renders the crew page exactly as that person would see it. Sticky banner. |

### 7.4 Role-based field hiding

Server-side, in the data layer. **Role is always derived fresh from the current `crew_members.role_flags`, never from a token claim.**

- The matched `crew_members` row has `LEAD` in `role_flags`, OR the viewer is admin → `viewerRole === 'lead'`. The data fetcher joins `shows_internal` and includes `ops` in the response.
- Otherwise: the data fetcher does not query `shows_internal` at all; `ops` is absent from the response by construction. RLS on `shows_internal` (admin-only) is the second line of defense in case the fetcher is wrong; physical separation per §4.4 is the third.

The matched-row lookup is identical for signed-in and signed-link paths: signed-in matches by `email`, signed-link matches by JWT-carried `(showId, name)`. In both paths the *current* `role_flags` is the source of truth, so a role demotion takes effect on next request — no token revocation required for ops-field hiding (revocation in §7.2.1 is for entirely cutting access, not for downgrading).

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
  - `unknown_asterisk` → **per-day schedule is hidden entirely.** The tile renders a single message: "Your assigned days aren't confirmed yet. Doug needs to add a parenthetical like `(6/24 and 6/26 ONLY)` to your name in the sheet — once he does, this will fill in." This is a deliberate refusal to render guesses; the alternative (showing all days with a small warning) was rejected in adversarial review because crew might rely on incorrect call times. The same warning surfaces loudly in Doug's parse panel per §6.6 with a one-click report-to-Eric path; Doug fixes the sheet, the next sync clears the state.
  Within each day (when shown), call time is extracted from the inline `TIME / AGENDA` cell when available.
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

### 8.2 Right Now card — time-aware AND viewer-aware states

The card at the top of the page swaps content based on **(today, show dates, viewer's date_restriction)** together. **Viewer date_restriction always takes precedence over show-wide state** — a crew member with `unknown_asterisk` or with explicit days that don't include today must never see "Today: Show day 1" implying they're working.

**State precedence** (top match wins):

| State | Trigger | Renders |
|---|---|---|
| `viewer_unconfirmed` | `viewer.date_restriction.kind === 'unknown_asterisk'` | "Your assigned days aren't confirmed yet" + same body as the schedule tile in §8.1. Replaces every show-wide state. |
| `viewer_after_last_day` | `viewer.date_restriction.kind === 'explicit'` AND today > max(`viewer.days`) | "Your assignment is complete · show wraps <travelOut>." Evaluated **before** `viewer_off_day` so a restricted crew member never sees a "Your next assigned day: ???" pointing at nothing. |
| `viewer_off_day` | `viewer.date_restriction.kind === 'explicit'` AND today is NOT in `days` AND today < max(`viewer.days`) AND today is within the show span (`travelIn ≤ today ≤ travelOut`) | "Not scheduled today" + "Your next assigned day: <date> · <relative time> away" — `<next>` is guaranteed to exist because `viewer_after_last_day` already caught the past-final-day case. |
| `viewer_off_day_pre` | `viewer.date_restriction.kind === 'explicit'` AND today is BEFORE viewer's first assigned day AND today < travelIn | "In N days · Your first day: <date>" |
| `pre_travel` | today < travelIn − 1 day AND viewer is unrestricted or today is before viewer's first assigned day | "In N days · Travel in <weekday>" + "Hotel: <hotel>" |
| `travel_in_day` | today === travelIn AND (viewer unrestricted OR today is in `viewer.days`) | "Today: Travel in" + "Hotel check-in: <hotel>, <time>" |
| `set_day` | today === setDay AND (viewer unrestricted OR today is in `viewer.days`) | "Today: Set day" + "Load-in: <time> at <venue>" |
| `show_day_n` | today === showDays[n] AND (viewer unrestricted OR today is in `viewer.days`) | "Today: Show day N of M" + "Call: <time> · <room>" + "Strike: <time>" if last day |
| `travel_out_day` | today === travelOut AND (viewer unrestricted OR today is in `viewer.days`) | "Today: Travel out" + "Hotel check-out: <hotel>" |
| `post_show` | today > travelOut OR today > viewer's last assigned day | "Wrapped <relative time> ago" with link to "view as archive" |
| `unknown` | one or more show dates not parseable but at least one is | "Show details: <travelIn> – <travelOut>" with whatever was parsed; missing values render as "—". |
| `dateless` | no parseable show date at all | "Show details unavailable. Check the sheet's DATES block." Card uses the stale-tint color scheme to signal something is wrong. |

The first eight rows (`viewer_unconfirmed` through `post_show`) are evaluated only when show dates are parseable. `unknown` and `dateless` are date-data fallbacks that override everything else.

**Compound transitions** (entered from one state, transitioning to another while data also changes):

| From → To | Animation |
|---|---|
| `pre_travel` → `travel_in_day` (date rollover) | Crossfade card body; preserve card height. |
| `show_day_n` → `show_day_n+1` | Same — crossfade body. |
| `viewer_off_day` → `show_day_n` (today rolls into a viewer's assigned day) | Crossfade body. |
| `show_day_n` → `viewer_off_day` (today rolls out of a viewer's assigned day) | Crossfade body. |
| Any → `unknown` (sync error mid-show) | Card morphs to last-good state with a "stale" tint, no animation. |
| Doug fixes `unknown_asterisk` in sheet → next sync → `viewer_unconfirmed` becomes a concrete state | Crossfade body. |
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

The audience for this surface is non-technical. Every screen assumes Doug doesn't know what a service account is, what RLS is, or what a token version is. Failures are described in plain language with one obvious next step (either "fix this in your sheet" or "tell Eric"). Every error code in §12.4 has a paired user-facing message; the codes never appear in the UI text Doug sees.

### 9.0 First-visit onboarding wizard

The first time Doug visits `/admin` (no folder configured, no shows in DB), he sees a three-step wizard. The wizard's purpose is to make the leap from "I have a Google Sheet" to "the app shows my crew their pages" feel obvious and unblockable.

**Step 1 — "Share your show folder."**

A single screen with the service-account email displayed in a large, copyable form, along with plain-English instructions:

> 1. In Google Drive, find the folder where you keep your show sheets (or make a new one).
> 2. Click "Share" on the folder.
> 3. Paste this email and give it Viewer access: `<service-account-email>` *[copy button]*
> 4. Come back here and click "I've shared the folder."

A small disclosure ("What's this email?") expands to two sentences explaining that it's the app's identity in your Drive — it can only see what you share with it, and only the folder you pick.

**Step 2 — "Verify."**

When Doug clicks "I've shared the folder," the app asks him to paste the folder URL or ID and verifies in real time:

- **Success path:** the app calls `files.list` against the folder, confirms read access, and displays a green check with the folder name and a count of sheets it found. "Found *N* sheets in *<folder name>*. Ready to bring them in?"
- **Common failure paths**, each with one specific fix message:
  - Folder URL malformed → "That doesn't look like a Google Drive folder URL. It should look like `https://drive.google.com/drive/folders/...`."
  - Folder not shared with the service account → "We can't see this folder yet. Double-check that you shared it with `<service-account-email>` and try again."
  - Service-account credentials misconfigured (operator-side error) → "Something is wrong on our end. The developer has been notified." (Sentry alert + admin-visible banner; not Doug's problem to fix.)

The wizard never says "files.list returned 403." It says one of the three things above.

**Step 3 — "First sheets review."**

After verification, the app stores `WATCHED_DRIVE_FOLDER_ID` and triggers an immediate sync run in `mode: "manual"`. Doug sees a one-time list of every sheet found in the folder, each with a small status badge:

- **Parsed and ready** — green check; click to review and approve (every first-seen sheet stages, see §5.2/§6.8 — Doug always reviews a first-time parse before it goes live, even if invariants would otherwise auto-apply).
- **Couldn't parse** — yellow warning with the plain-English MI failure ("This sheet doesn't look like your usual template — version markers we expect are missing"); click to see details.
- **Skipped (not a Google Sheet)** — gray badge for non-spreadsheet items in the folder; informational only.

Doug walks each sheet through review one at a time — same review surface as §6.8 / §6.8.1, just batch-presented for first onboarding. No partial-onboarding states: the wizard exits when all sheets in the folder are either approved/applied or have a reason captured (couldn't parse / explicitly discarded for now).

**After onboarding.** The wizard never re-runs unless Doug clicks "Re-run setup" from `/admin` settings (e.g., he wants to point at a different folder). All subsequent sheet additions to the watched folder go through the normal cron + first-seen-stage flow.

### 9.0.1 In-app help and tour

Once the dashboard is active, contextual help is available everywhere:

- A "?" icon next to every section header that opens a small tooltip with one paragraph of explanation in plain language.
- A "Take the tour" link in the dashboard footer that walks through the dashboard, a per-show parse panel, and the preview-as flow.
- Every error message links to "What does this mean?" with a one-paragraph plain-language explanation.

These are first-class spec requirements, not "nice-to-have polish." The error catalog in §12.4 is the source of truth for every text string a non-technical user sees.

### 9.1 `/admin` dashboard

The dashboard has two panels stacked top-to-bottom:

**Panel 1 — Active shows.** A list of `shows` rows with per-row status:

| Column | Content |
|---|---|
| Title | `RPAS Central 2026` |
| Dates | `3/22 → 3/26/26` |
| Crew | `4` |
| Last sync | `12 min ago · ✓` (or `2h ago · ⚠ 2 warnings` or `1d ago · ✗ parse error`) |
| Actions | `Open · Preview as · Re-sync · Archive` |

Empty state if no shows: instructions to share the Drive folder with the service account email, with the email displayed as a copy-button.

**Panel 2 — Sheets we couldn't auto-apply.** Combines two queues, each with distinct row actions:
- **`pending_ingestions` rows** (brand-new sheets that hard-failed during fetch or parse): each row shows `drive_file_name`, first-seen timestamp, attempt count, and `last_error_code` + `last_error_message`. Actions: "Open in Drive", "Retry now" (forces a fresh fetch via the manual entry point).
- **`pending_syncs` rows for first-seen shows** (the show has no `shows` row yet because the parse passed MI-1..MI-5b but tripped a stage-for-approval invariant): each row shows the candidate `title`/`dates` from `pending_syncs.parse_result.show`, the staged_id, and the triggered invariants. Actions: "Review and Apply" (opens the staged-parse review surface; on Apply a `shows` row is created with the slug derived from `parse_result`), "Discard" (deletes the `pending_syncs` row, no `shows` row created).

Both queues live here so brand-new sheets that need attention are visible alongside successful shows. **No public `/show/<slug>` URL is reserved until first successful Apply** — Discard cannot leak slugs.

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
| **Crew member removed from sheet** | The post-upsert `delete-not-in-set` step in §5.2 removes their `crew_members` row on next sync. Signed-link path: the per-request `(show_id, name)` lookup (§7.2) fails, returning 410 with `you've been removed from this show — contact Doug`. Google-login path: same, the email→`crew_members` match fails, redirects to "no access." They drop from `/me`. |
| **New crew member added** | Their row appears in `crew_members` on next sync. Doug shares the URL/link out-of-band. App does not auto-email. Their Google login starts working as soon as the sync completes. |
| **Sync failure** | Page renders last-good with the staleness signal in the footer. After 6h stale, the footer turns red and surfaces `couldn't sync — contact Doug`. Page never goes blank. |
| **Sheet renamed/moved in Drive** | We track `drive_file_id` which survives rename/move. No effect. |
| **Sheet deleted, un-shared, or moved out of scope** | Detected by §5.2 step 4 (diff Drive listing against `shows` rows). Marked `last_sync_status = 'sheet_unavailable'`. `last_seen_modified_time` is preserved so the cached parsed data still renders on the crew page. Doug's admin shows "this sheet is no longer accessible — re-share or restore." If the sheet returns to the watched folder later, the next sync detects it via the listing and resumes normal updates. The legacy `files.get 404` path remains as a defensive secondary detection for the narrow race where a file disappears between list and fetch within the same run. |
| **Template version changes mid-show** | Per-pull version detection (§6.4) re-dispatches. Field aliases handle most renames; net-new fields land in `shows_internal.raw_unrecognized`. |
| **No version marker matches** | Parser emits `VERSION_DETECTION_FAILED` and the run hard-fails per MI-1 (§6.8). The prior-snapshot data is retained on the live page (or, for first-seen sheets, the failure surfaces in `pending_ingestions`). **There is no permissive v1-fallback render** — earlier rounds of this spec described one, but it conflicts with MI-1's hard-fail contract and could push partial / incorrect data into the live snapshot. Hard-fail is the single contract: don't trust an unrecognized template. Doug's parse panel surfaces this as a hard-to-miss banner with the exact markers the parser was looking for. |
| **Crew role changes** | Re-fetch on next page load applies new role-based filtering. **No session invalidation needed and no signed-link re-issue needed.** Per §7.2 the JWT carries no `role` claim; role is always derived fresh from the current `crew_members.role_flags`. A demotion from LEAD to A1 takes effect on the very next request to the page, with no token rotation. |
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

The page never shows a stack trace, an HTTP status code, or a "something went wrong" generic. Every error has an actionable message. See §12.4 for the canonical mapping.

### 12.4 User-facing message catalog

Every error code, parse warning, and admin notification produced anywhere in the app maps to **exactly one** user-facing message string. Engineers do not write copy ad-hoc; they pick the appropriate code and the renderer looks up the message from this table. Doug and crew never see a code, an HTTP status, or a stack trace; they see the "Doug-facing message" or "Crew-facing message" column. The "Follow-up" column is the action the UI suggests.

**Conventions:**
- "Doug-facing" means it appears in `/admin` or in the per-show parse panel.
- "Crew-facing" means it appears on a `/show/<slug>` or `/show/<slug>/p#t=...` page rendered to a non-admin viewer. `—` means the code never reaches a crew render.
- Codes are stable identifiers; messages may evolve over time. The bug-report pipeline (§13) carries the code; the developer translates back via this table.
- Plain language is the rule. "Sheet" not "Drive document"; "your show" not "the resource"; "the developer" not "the maintainer."

| Code | Where it surfaces | Doug-facing message | Crew-facing message | Follow-up |
|---|---|---|---|---|
| **Auth — signed-link redemption** | | | | |
| `LINK_EXPIRED` | `/api/auth/redeem-link` rejects expired JWT | — | "This link has expired. Ask Doug for a new one." | Crew → text Doug |
| `LINK_REVOKED_FLOOR` | redemption fails token-version floor check | — | "This link has been replaced. Ask Doug for a new link." | Crew → text Doug |
| `LINK_REVOKED_SURGICAL` | redemption fails exact-version revoked_links check | — | "This link has been revoked. Ask Doug for a new link." | Crew → text Doug |
| `LINK_VERSION_MISMATCH` | redemption fails strict-equality version check | — | "This link is out of date. Ask Doug for a new link." | Crew → text Doug |
| `LINK_NO_CREW_MATCH` | crew row referenced by JWT has been removed from sheet | — | "You've been removed from this show. Contact Doug if this is a mistake." | Crew → text Doug |
| `LEAKED_LINK_DETECTED` | `?t=` query-param URL detected | "A signed link was opened with `?t=` in the URL — we treat that as a possible leak. The affected link has been auto-revoked and the crew member's row is in 'no live link' state. Click 'Issue new link' for them when you're ready." | "This link format isn't supported and has been revoked. Ask Doug for a new one." | Doug → Issue new link |
| **Auth — Google login** | | | | |
| `GOOGLE_NO_CREW_MATCH` | signed-in email isn't on any crew row in this show | — | "Your email isn't on the crew list for this show. Ask Doug to add you." | Crew → text Doug |
| `GOOGLE_AMBIGUOUS_EMAIL` | multi-match (should be impossible per MI-5b) | "Two crew rows share the same email — Google login is unsafe to resolve. The duplicate-email check normally catches this; please re-share the sheet so we can re-parse, or contact the developer." | "Something is misconfigured for this show. Doug has been notified." | Doug → fix sheet duplicate; if persistent, Eric |
| `SESSION_IDLE_TIMEOUT` | cookie session past 15-min idle window | — | "Your session timed out. Open the original link Doug shared again." | Crew → reopen link |
| `SESSION_ABSOLUTE_TIMEOUT` | cookie session past 12h absolute | — | "Time to refresh — open the original link Doug shared again." | Crew → reopen link |
| **Sync — Drive errors** | | | | |
| `DRIVE_FETCH_FAILED` | `files.export` / content fetch errors | "We couldn't fetch this sheet from Google Drive. Could be a transient network issue, or the sheet's been moved or unshared. We'll keep retrying. If this stays for more than an hour, click 'Retry' or check the sheet's share settings." | "We couldn't get the latest from Doug's sheet. Showing what we had at *<time>*." | Doug → check share / Retry |
| `SHEET_UNAVAILABLE` | sheet detected as removed from watched folder | "*<sheet-name>* isn't in your folder anymore. Either you moved/unshared it, or it was deleted. Re-share it to bring the show back." | "We couldn't get the latest from Doug's sheet. Showing what we had at *<time>*." | Doug → re-share sheet |
| `STALE_WRITE_ABORTED` | conditional cron UPDATE matched 0 rows | (admin log only — informational) | — | none |
| `STALE_MANUAL_REPLAY_ABORTED` | manual sync UPDATE rejected (newer version exists) | "This manual sync is stale — a newer parse has already been applied. Refresh the page to see the current state." | — | Doug → refresh admin |
| `CONCURRENT_SYNC_SKIPPED` | advisory lock not acquired | (admin log only) | — | none |
| `STAGED_PARSE_OUTDATED` | Drive `modifiedTime` advanced past staged version | "The sheet was edited again since you reviewed this parse. We've discarded the staged version; a fresh parse will be ready in a few minutes." | — | Doug → wait, review next |
| `STAGED_PARSE_SUPERSEDED` | a newer cron parse committed before Apply | "A newer parse has already been applied. Refresh the admin page to review the latest state." | — | Doug → refresh |
| **Parser — hard fails (MI-1..MI-5b)** | | | | |
| `MI-1_VERSION_DETECTION_FAILED` | no template version markers match | "*<sheet-name>* doesn't look like your usual show template — none of the version markers we expect (Contact Office row, MAIN/SECONDARY block, GEAR INVENTORY block) are present. Either this is a different kind of document, or your template has changed in a way we don't recognize. Tell the developer if your template has changed." | — | Doug → check sheet shape; Eric → add v5 detector if real |
| `MI-2_TITLE_MISSING` | `show.title` empty/null | "*<sheet-name>* doesn't have a recognizable show title. Add or fix the CLIENT row." | — | Doug → fix sheet |
| `MI-3_NO_PARSEABLE_DATE` | no travel/set/show date parses | "*<sheet-name>* doesn't have any readable dates — we couldn't find Travel In, Set Day, or Show Day 1 as a parseable date. Check the DATES block." | — | Doug → fix sheet |
| `MI-4_NO_CREW` | parsed `crewMembers.length === 0` | "*<sheet-name>* has no crew rows. Add at least one person to the CREW block." | — | Doug → fix sheet |
| `MI-5_NO_ROOMS` | no GS / breakout / additional rooms | "*<sheet-name>* has no rooms — we couldn't find General Session, Breakouts, or Additional Rooms. Make sure your room blocks have setup and time fields filled in." | — | Doug → fix sheet |
| `MI-5a_DUPLICATE_CREW_NAME` | two crew rows share a name | "Two crew rows share the same name in *<sheet-name>*. Disambiguate them (e.g., 'John C.' vs 'John Carleo') so the app can tell them apart." | — | Doug → fix sheet |
| `MI-5b_DUPLICATE_CREW_EMAIL` | two crew rows share a non-null email | "Two crew rows share the same email in *<sheet-name>*. Each crew member needs their own email." | — | Doug → fix sheet |
| **Parser — stage-for-approval (MI-6..MI-14)** | | | | |
| `MI-6_CREW_SHRINKAGE` | crew count dropped > 1 | "Heads-up: *<sheet-name>* now has *<N>* crew rows (was *<M>*). Review the changes before applying." | — | Doug → review staged |
| `MI-7_SECTION_SHRINKAGE` | hotel/room/contact count dropped > 50% | "*<sheet-name>* lost more than half of its *<section>* — *<prior_count>* before, *<new_count>* now. Review before applying." | — | Doug → review staged |
| `MI-7b_KEYED_PRESERVATION` | a keyed entry (hotel ordinal, room name, contact) disappeared | "*<sheet-name>*: *<entry>* is no longer in the sheet. Review before applying." | — | Doug → review staged |
| `MI-8_OPS_FIELD_COLLAPSE` | ops field changed from non-empty to empty | "*<sheet-name>*: *<ops-field>* (e.g., PO#, Proposal) was filled in before and is now blank. Confirm this was intentional." | — | Doug → review staged |
| `MI-9_ROLE_FLAGS_DELTA` | crew member's role_flags changed | "*<crew-name>*'s role changed from *<prior>* to *<new>*. This affects what they see on their page. Confirm before applying." | — | Doug → review staged |
| `MI-11_EMAIL_CHANGE` | crew member's email changed | "*<crew-name>*'s email is changing from *<prior>* to *<new>*. After applying, the new email will get sign-in access; their existing share-link will stop working until you Issue a new one." | — | Doug → review staged |
| `MI-12_PROBABLE_RENAME` | remove+add with matching email | "Looks like *<old-name>* was renamed to *<new-name>* (same email). Approve the rename, or treat as two unrelated changes." | — | Doug → review staged |
| `MI-13_NAME_AND_EMAIL_CHANGE` | remove+add with both differing | "Both name and email changed in *<sheet-name>*: *<old-pair>* and *<new-pair>*. Are these the same person, or unrelated changes?" | — | Doug → review staged |
| `MI-14_NO_EMAIL_RENAME` | remove+add with both null emails | "Looks like *<old-name>* was renamed to *<new-name>* (no emails to compare). Approve the rename, or treat as two unrelated changes." | — | Doug → review staged |
| `FIRST_SEEN_REVIEW` | first-time-seen sheet (per §5.2) | "*<sheet-name>* is new — review the parse before crew see it." | — | Doug → review and approve |
| **Parser — soft warnings** | | | | |
| `UNKNOWN_FIELD` | unrecognized row/column in `raw_unrecognized` | "We saw a row called *<key>* in *<sheet-name>* that we don't know how to handle. It's not breaking anything; want to flag it to the developer?" | — | Doug → optional Report |
| `UNKNOWN_DAY_RESTRICTION` | crew has `***` flag with no day list | "*<crew-name>* is flagged as day-restricted (`***` in the role) but the sheet doesn't say which days. Add a parenthetical to their name like `(6/24 and 6/26 ONLY)`. Until you do, their schedule will show 'days unconfirmed.'" | — | Doug → fix sheet |
| `UNKNOWN_ROLE_TOKEN` | role token not in canonical set | "*<crew-name>*'s role contains *<token>* which we don't know. We're ignoring it. Tell the developer if this is a real new role you're using." | — | Doug → optional Report |
| `TYPO_NORMALIZED` | recognized typo (Hotal, DIagrams, Virtaul) silently corrected | (admin log only — informational; Doug doesn't need to act) | — | none |
| `UNEXPECTED_PARENT` | Drive file's `parents` doesn't include watched folder | (admin log only) | — | none |
| **Reviewer / Approval flow** | | | | |
| `MISSING_REVIEWER_CHOICE` | Apply submission missing a choice for a triggered item | "We need your decision for every item — looks like one was skipped. Refresh and try again." | — | Doug → refresh admin |
| `EXTRA_REVIEWER_CHOICE` | Apply submission carries a choice not in `triggered_review_items` | "Something doesn't match between what you reviewed and what we have on file. Refresh and try again." | — | Doug → refresh admin |
| `DUPLICATE_REVIEWER_CHOICE` | submission has two choices for the same item_id | "We got the same decision twice for one item. Refresh and try again." | — | Doug → refresh admin |
| `INVALID_REVIEWER_ACTION` | `action` value not in the invariant's enum | "That action isn't valid for this item. Refresh and try again." | — | Doug → refresh admin |
| **Bug reporting** | | | | |
| `REPORT_RATE_LIMITED` | report API exceeded 10/admin/hr | "You've reported a lot already this hour — give the developer a beat to catch up. Try again in *<minutes>* min, or message Eric directly." | — | Doug → wait or message |
| **Onboarding** | | | | |
| `ONBOARDING_FOLDER_INVALID_URL` | wizard step 2 URL malformed | "That doesn't look like a Google Drive folder URL. It should look like `https://drive.google.com/drive/folders/...`." | — | Doug → re-paste URL |
| `ONBOARDING_FOLDER_NOT_SHARED` | wizard step 2 service-account access denied | "We can't see this folder yet. Double-check that you shared it with `<service-account-email>` and try again." | — | Doug → fix Drive share |
| `ONBOARDING_OPERATOR_ERROR` | wizard step 2 operator-side credential failure | "Something is wrong on our end. The developer has been notified." | — | Doug → wait; Eric → fix |

**v2+ candidates** (deliberately not in v1's catalog because the surfaces don't ship in v1): per-link rotation reason codes, crew-initiated "report a problem" codes, scheduled-archive codes.

This catalog is the **single source of truth** for user-visible copy. The bug-report pipeline (§13) carries the code; the GitHub issue body's `last_error_code` field maps back via this table when Eric triages. Translation libraries (i18n) are out of scope for v1 but the catalog is structured so adding a `language` axis later is a flat extension, not a rewrite.

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
5. **Auth.** Supabase Google OAuth + signed-link JWT (per-request authz against current `crew_members`, no role claim in token, `revoked_links` table). RLS enabled. Role-based field hiding always derived fresh. **Demo:** "sign in as a fixture-defined crew email, see your view; demote a crew member from LEAD in the sheet, re-sync, observe ops fields disappear on next refresh without any token rotation."
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
- ~~**Slug generation strategy.**~~ Resolved in §6.9: deterministic `<YYYY-MM>-<title-slug>` derived on first successful parse, immutable thereafter, collisions resolved by `-2`/`-3` suffix.
- **Date-restriction sanity check.** When `date_restriction.kind === 'explicit'`, should the parser warn if any of the listed dates fall outside the show's `dates.travelIn → dates.travelOut` span? (e.g., Calvin listed for `5/12 & 5/14` on a show that runs `5/13 → 5/15`.) Probably yes as a `DATE_RESTRICTION_OUTSIDE_SHOW_RANGE` warning, but defer the implementation to v2.

### 16.2 v2+ candidates (deferred but noted)

- Crew notification emails when Doug adds a new crew member.
- "More from sheet" disclosure on crew page surfacing `raw_unrecognized` content.
- Admin manual override for `unknown_asterisk` date_restriction (a small admin UI to set the days when fixing the sheet isn't possible). v1 ships without this; Doug's path is to fix the sheet.
- **External-viewer principal** — first-class identity for non-FXAV stakeholders (drivers, client contacts, in-house AV). New `external_viewers` table separate from `crew_members`, with its own issuance/revocation/rendering rules. v1 punts; Doug shares info with these people the same way he does today.
- Webhook-based "fix landed → mark resolved" loop with GitHub.
- External agenda PDF parsing (option C).
- Inline image rendering for cells with embedded images (Drive MCP returns text only today; would need a different ingestion path).
- Multi-PM support (Chip's freeform emails, Corey's freeform emails) — different parser entirely.
- GEAR / case-prep view for production crew.

---

## 17. Testability acceptance criteria

This section is **observable contracts**, not test files. Each criterion below is what an automated test or manual check must demonstrate before the corresponding milestone in §15 is considered done. The implementation plan (writing-plans output) will turn each criterion into a concrete test (Vitest, Playwright, or scripted manual check); this spec just commits to what's testable. **Spec is signed off when every criterion has a clear path to an automated assertion.**

Acceptance criteria are the contract between this spec and the implementation. If an implementer can produce code that passes every criterion below, the spec is implemented; if they can't make a criterion pass without violating the spec, the spec has a bug.

### 17.1 Per-milestone acceptance criteria

**Milestone 1 — Parser standalone.**
- AC-1.1 `parseSheet(markdown)` returns a `ParseResult` with no `hardErrors` for every fixture in `fixtures/shows/raw/` (10 sheets across v1–v4 templates).
- AC-1.2 For each fixture, `parseResult.show.title`, `dates.travelIn`, `crewMembers[*].name`, and at least one room block are populated.
- AC-1.3 Day-restriction parser correctly extracts explicit days from the `Calvin Saller (6/24 and 6/26 ONLY)` form (verified against `2025-06-ria-investment-forum.md:32`).
- AC-1.4 Day-restriction parser correctly emits `kind: "unknown_asterisk"` for the 2026 `ONLY***` form (verified against `2026-03-rpas-central-four-seasons.md:38`).
- AC-1.5 Role-flags parser produces atomic-only output: `LEAD / A1` becomes `["LEAD","A1"]`, never `["LEAD/A1"]`.
- AC-1.6 Email canonicalization passes: `Alice@FXAV.NET ` is stored as `alice@fxav.net`. CHECK constraint on the column rejects non-canonical writes.
- AC-1.7 MI-5a hard-fails when a fixture has duplicate crew names (synthesize a test fixture).
- AC-1.8 MI-5b hard-fails when two crew rows share an email (synthesize a test fixture).
- AC-1.9 Slug derivation is deterministic and immutable: `deriveSlug(parseResult, [])` returns the same string twice.
- AC-1.10 Slug collision policy: `deriveSlug(parseResult, [<existing>])` produces `<existing>-2`; second collision produces `-3`; reaches `SLUG_COLLISION_LIMIT` hard error at 100.

**Milestone 2 — Schema + DB migrations.**
- AC-2.1 Every table from §4.1 (`shows`, `shows_internal`, `crew_members`, `crew_member_auth`, `revoked_links`, `link_sessions`, `pending_syncs`, `pending_ingestions`, `sync_audit`, `sync_log`, `reports`, `report_rate_limits`, `hotel_reservations`, `rooms`, `transportation`, `contacts`) exists with the documented columns and constraints.
- AC-2.2 `crew_members_show_email_unique` partial index rejects a duplicate insert with same `(show_id, email)` when both have non-null emails.
- AC-2.3 `crew_members_email_canonical` CHECK constraint rejects an insert with `email = 'Alice@FXAV.NET'`.
- AC-2.4 `revoked_links.token_version` CHECK rejects `INSERT ... VALUES (..., 0, ...)`.
- AC-2.5 RLS: a non-admin Supabase Auth session cannot SELECT any row from `shows_internal`, `pending_syncs`, `pending_ingestions`, `sync_audit`, `crew_member_auth`, or `revoked_links`.
- AC-2.6 RLS: a non-admin signed-in user whose email matches a `crew_members.email` for show X CAN SELECT the matching `shows` row, but a non-matching user (different show) cannot.
- AC-2.7 Seed script loads all 10 fixtures into the schema with no errors.

**Milestone 3 — Admin upload-test (no auth).**
- AC-3.1 `/admin/dev` accepts a fixture filename, runs the parser, runs MI invariants, and routes to the correct outcome (auto-apply / stage / hard-fail) based on the parsed content.
- AC-3.2 A fixture with synthesized MI-7 (50% hotel drop) lands in `pending_syncs` with the right `triggered_review_items`.
- AC-3.3 A fixture with synthesized MI-1 (no version markers) lands in `pending_ingestions` with `last_error_code = "MI-1_VERSION_DETECTION_FAILED"`.

**Milestone 4 — Crew page (no auth).**
- AC-4.1 `/show/<slug>` rendered with hardcoded role `A1` shows Lodging, Venue, Schedule, Audio scope, Crew, Contacts tiles. No Ops tile.
- AC-4.2 `/show/<slug>` rendered with hardcoded role `LEAD` shows Ops tile in addition.
- AC-4.3 Right Now card renders the correct state for a synthesized "today is Show Day 1" fixture, including the viewer-aware states (`viewer_off_day`, `viewer_after_last_day`, `viewer_unconfirmed`).
- AC-4.4 §8.4 dimensional invariants: a Playwright test loads the page at 390px width and asserts `getBoundingClientRect()` per `data-testid` matches the spec (tile min-height 96px, two-column grid, etc.).
- AC-4.5 Empty-state discipline: a fixture with `Opening Reel = TBD` does NOT render an "Opening Reel: TBD" line on the crew page.
- AC-4.6 Schedule tile for `unknown_asterisk` crew renders the "days unconfirmed" message and NO per-day schedule.

**Milestone 5 — Auth.**
- AC-5.1 `validateLinkSession` rejects a JWT whose signature is invalid (401).
- AC-5.2 `validateLinkSession` rejects a JWT whose `tokenVersion` is older than `crew_member_auth.current_token_version` (410).
- AC-5.3 `validateLinkSession` rejects a JWT whose `tokenVersion` is newer than `crew_member_auth.current_token_version` (410). Strict equality, not `<`.
- AC-5.4 `validateLinkSession` rejects when the session's `jwt_token_version <= crew_member_auth.revoked_below_version` (410).
- AC-5.5 `validateLinkSession` rejects when there's a matching `revoked_links` row with the exact `token_version` (410).
- AC-5.6 `validateLinkSession` rejects past 15-min idle, advances `last_active_at` on pass.
- AC-5.7 `validateGoogleSession` rejects a Supabase Auth user whose email doesn't match any crew row in the show (403).
- AC-5.8 `validateGoogleSession` rejects on multi-match (`AMBIGUOUS_EMAIL_BINDING`, 500). Synthesize a fixture with duplicate emails and seed it bypassing MI-5b.
- AC-5.9 LEAD viewer's response includes `shows_internal.ops`; non-LEAD viewer's response does not include it (verify via response-payload introspection).
- AC-5.10 Demote a crew member from LEAD to A1 in the sheet, re-sync, refresh the page: ops tile disappears within one sync cycle without any token rotation.
- AC-5.11 `?t=` URL: middleware returns 410, inserts `revoked_links` row, and (if the leaked link was current version) auto-rotates the row to "no live link" state. Subsequent requests with the same JWT in `#t=` form fail authz.

**Milestone 6 — Drive sync (cron).**
- AC-6.1 Cron run lists every spreadsheet in the watched folder; non-spreadsheets are filtered out via `mimeType` query.
- AC-6.2 Cron run does NOT advance `shows.last_seen_modified_time` for a sheet whose `modifiedTime` is unchanged.
- AC-6.3 Cron run advances `shows.last_seen_modified_time` for a sheet that was edited (Phase 2 commits).
- AC-6.4 Cron run that fails parsing of show A still successfully syncs show B (independence verified).
- AC-6.5 Manual re-sync via `runManualSyncForShow(driveFileId)` only fetches/processes the targeted sheet — confirmed by Drive API call log.
- AC-6.6 Manual re-sync of an unchanged sheet succeeds (same modtime allowed) and advances `last_seen_modified_time` to that same value (no regression).
- AC-6.7 Concurrent cron + manual sync attempt: one acquires the advisory lock; the other emits `CONCURRENT_SYNC_SKIPPED` and does not write.
- AC-6.8 Stale write attempt: simulate two parsers racing; the older parse's UPDATE matches 0 rows under the conditional WHERE and rolls back (`STALE_WRITE_ABORTED`).
- AC-6.9 Sheet-removal detection: remove a sheet from the watched folder, run cron, verify that show's `last_sync_status` becomes `'sheet_unavailable'` and `last_seen_modified_time` is unchanged.
- AC-6.10 Sheet reappearance after `sheet_unavailable`: put the sheet back, run cron, verify `last_sync_status` returns to `'ok'`.
- AC-6.11 First-seen sheet flow: drop a brand-new sheet into the folder, run cron, verify a `pending_syncs` row appears with `triggered_review_items` containing `FIRST_SEEN_REVIEW`. No `shows` row created until Apply.
- AC-6.12 Realtime channel: edit a sheet, run cron, verify a Supabase Realtime message is published on `show:<id>`.

**Milestone 7 — Linked content.**
- AC-7.1 `agenda_links[].url` containing a Drive PDF renders an inline embed via PDF.js or `<iframe>`.
- AC-7.2 Diagrams folder URL fetches the folder image list and renders the gallery (up to 12 images on initial render; "Show more" reveals the rest).
- AC-7.3 Opening reel URL detection: `https://drive.google.com/file/d/...` renders inline `<video>`; `MAYBE` renders as a text line; `YES - <url>` renders both.
- AC-7.4 Diagram image fetches go through `/api/asset/diagram/...` (proxied), never expose the raw Drive URL in HTML.
- AC-7.5 Diagrams folder cap: a folder with 78 images shows the first 60 and surfaces an admin warning.

**Milestone 8 — Bug-report pipeline.**
- AC-8.1 Click "Report this" in admin parse panel → opens a GitHub issue in the configured repo with the structured body documented in §13.2.
- AC-8.2 Reports table records the submission with `github_issue_url` populated.
- AC-8.3 Rate limit: 11th report from same admin within 1h returns 429 with `REPORT_RATE_LIMITED` message.
- AC-8.4 Every error code surfaced anywhere in the app maps to a row in §12.4 (test asserts no orphan codes).

**Milestone 9 — Stale-data UX, error states, empty states, polish.**
- AC-9.1 Pull network plug, refresh page: footer turns yellow (1h–6h stale) or red (>6h) with the catalog-mapped message.
- AC-9.2 Every empty state defined in §8.3 is reachable from a fixture; manual screenshot-comparison is the verification mechanism in v1.
- AC-9.3 Error boundaries: a synthesized server error in a tile renders the boundary's fallback, not a stack trace.

**Milestone 10 — Onboard Doug.**
- AC-10.1 First-visit `/admin` (no folder configured) shows the §9.0 wizard, not the dashboard.
- AC-10.2 Wizard step-2 verification produces the documented success/failure messages for each path (success, malformed URL, not-shared, operator-error).
- AC-10.3 After wizard completion, every sheet in the folder appears in the §9.0 step-3 review list with the correct status badge.
- AC-10.4 Re-running setup from `/admin` settings clears `WATCHED_DRIVE_FOLDER_ID` and re-presents the wizard.

### 17.2 Cross-cutting acceptance criteria (apply across milestones)

- AC-X.1 **No orphan error codes.** Every code that appears in code paths exists in §12.4. Every code in §12.4 is reachable from at least one fixture or synthesized scenario. Test: enumerate codes via `git grep` and assert the two sets match.
- AC-X.2 **No raw error codes in user-visible UI.** Test: a Playwright test crawls every reachable surface (admin + crew + signed-link) and asserts no element's text matches `/^[A-Z][A-Z_]+$/` for codes (heuristic but catches accidental display).
- AC-X.3 **Single auth-validation entry point.** Static analysis: every page in `app/(crew)/` uses `lib/auth/validateLinkSession` or `lib/auth/validateGoogleSession`; no route re-implements subsets.
- AC-X.4 **No global cursor.** Static analysis: no source file references a `lastPollAt` global variable, env var, or table column.
- AC-X.5 **Email canonicalization at every boundary.** Static analysis: every `INSERT ... email` and every `WHERE ... email = ` site uses `canonicalize()` or is documented as already-canonical (e.g., from `crew_members.email`).
- AC-X.6 **Spec-to-implementation traceability.** Every section number `§N.M` referenced in this spec exists in the spec; every milestone in §15 references the acceptance criteria above; every error code in §12.4 has a generating site in code.

### 17.3 Out of scope for v1 testing

Spec-level performance budgets, load tests, and security pen-tests are deferred. The acceptance criteria above target *correctness* and *user-visible UX behavior*. Performance characterization happens after Doug's first show.

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
