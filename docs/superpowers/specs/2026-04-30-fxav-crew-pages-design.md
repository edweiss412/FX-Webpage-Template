# FXAV Crew Pages — Design Spec

**Status:** approved 2026-04-30 (after self-review + 38 rounds of cross-model adversarial review against Codex). Implementation plan to follow in a separate session via the writing-plans skill.
**Author:** Eric Weiss
**Companion docs:** [`Project-Goal.md`](../../../Project-Goal.md), [`fixtures/shows/README.md`](../../../fixtures/shows/README.md), [`fixtures/shows/_schema-diff.md`](../../../fixtures/shows/_schema-diff.md)

---

## 1. Goal & scope

Doug Larson PMs every Institutional Investor show for FXAV using a Google Sheets template he fills out per event. Today, every crew member squints at the same dense spreadsheet to find their own hotel, their own call time, their own gear scope. This project replaces that experience with a per-crew-member, mobile-first webpage generated from Doug's existing sheet — shareable via link, automatically personalized, and updated as Doug edits the source.

**v1 in-scope outcomes:**

- Doug shares a Drive folder of his show sheets once. The app polls the folder, parses each sheet, and stores a normalized representation in Postgres.
- Each crew member gets a personalized URL. Opening it (signed in or via signed link) shows a phone-shaped page tailored to their identity and role.
- The page reflects the sheet within ~5 minutes of any edit Doug makes (poll-based sync; not realtime push at the source level, but realtime push from server to viewer once sync completes).
- Financial fields (PO#, Proposal $, Invoice, Invoice Notes) are server-side filtered out of non-LEAD views — they're billing details with no role onsite. COI status is shown to every crew viewer because it's operational ("are we insured?"), not financial.
- Doug can preview the exact page each crew member sees, flag parse warnings, and report issues directly to the developer (Eric) via GitHub Issues with structured context attached.
- The parser handles all four template versions in the corpus (v1 2024-05 → v4 2026-05) with v4 as the canonical target.

**Success looks like:** Eric (operating in dev mode against existing fixtures) can open a sheet from any era of the corpus, render the corresponding crew page on his phone, and have nothing be wrong, missing, or unstyled. When Doug eventually onboards, his only mental model addition is "share the folder once, share a URL per show."

---

## 2. Out of scope (explicit deferrals)

To keep v1 honest and shippable, the following are deliberately deferred:

- **`pdf-only/` and `email-embedded/` fixtures.** These are historical recovery cases that don't exist for new shows. Doug's actual production input is always a live Sheet. The corpus retains them for context only.
- **External agenda PDF parsing** (option C from the brainstorm). Agenda PDFs render via inline embed (PDF.js or `<iframe>`), not by extracting structured panel/speaker/sponsor data.
- **Crew notification emails.** When Doug adds a new crew member, the app does not auto-email them. Doug shares the URL out-of-band. Notification is a v2 candidate.
- **GEAR proposal form (per-day rental quantities).** The Chip-style PROPOSAL grid showing `Item | Mar 21 | Mar 22 | ...` per-day counts is operations/billing data and stays out of scope for crew pages. The crew page surfaces room-level Audio/Video/Lighting from the per-room block instead.
- **In scope (added per scope review): per-case PULL SHEET packing list when present.** Per-case packing rows (`QTY / CAT / SUB CAT / ITEM`) genuinely matter to crew on set and strike days — they're the manifest a tech is unpacking against. The PULL SHEET tab is present in 2 of 13 fixtures (`2024-05-east-coast-family-office.md`, `2025-05-redefining-fixed-income-private-credit.md`) and absent from the 2025-06+ sheets. The feature is **graceful by design**: if the sheet has the tab, crew see a Pack list tile on set/strike days; if it doesn't, the tile is absent. See §6.10 (parser) and §8.1 tile inventory.
- **Inline `=IMAGE(arbitrary-external-url)` formulas** referencing images hosted outside Google's domains. These are vanishingly rare in the corpus and would require fetching from arbitrary third-party hosts; deferred to v2. **NOTE:** floating embedded images positioned over the DIAGRAMS tab (the common case in 2026+ sheets like the FinTech Forum 2026 fixture) ARE in scope per §10 — these are extracted via `spreadsheets.get` with `fields=sheets(embeddedObjects)` and downloaded through Drive's media path. Production Drive integration uses the OAuth-scoped Google Drive/Sheets API via the service account; the Drive MCP was only a dev-time fixture-gathering tool.
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
  diagrams        jsonb,                            -- **Round-44/46 amendment**: Unified diagrams source with the `PersistedDiagrams` shape — every entry now carries an immutable approval token (round-44 closes the TOCTOU windows that modtime-only pinning left open) AND a per-entry `recovery_disposition` flag (round-46 distinguishes recoverable from restage-only entries). Shape: { linkedFolder: { driveFolderId: text, driveFolderUrl: text } | null, embeddedImages: [{ sheetTab, objectId, mimeType, alt?, sheetsRevisionId: text, embeddedFingerprint: text | null, snapshotPath: text | null, sourceFolder: 'embedded', recovery_disposition: 'normal' | 'restage_required' }], linkedFolderItems: [{ driveFileId, mimeType, alt?, drive_modified_time: timestamptz, headRevisionId: text, md5Checksum: text, snapshotPath: text | null, sourceFolder: 'linked', recovery_disposition: 'normal' | 'restage_required' }], snapshot_revision_id: uuid | null, snapshot_status: 'complete' | 'partial_failure' | 'partial_failure_restage_required' | null }. **Embedded entries**: `sheetsRevisionId` (Drive-side spreadsheet revision via drive.revisions.list) + `embeddedFingerprint` (content-derived ETag; null forces restage-only recovery — Apply MUST fail closed when null). **Linked-folder entries**: `headRevisionId` (Drive immutable revision token) + `md5Checksum` (content hash for buffer-then-verify fallback). `drive_modified_time` is informational; the revision/checksum pair is the authoritative byte fence. **Per-entry `recovery_disposition` (round-46)**: `'normal'` allows asset_recovery retries; `'restage_required'` is set when an embedded entry's `embeddedFingerprint` is `null` (no usable approval token) AND tells asset_recovery to skip the entry without re-downloading. The state only converges when a fresh sheet edit advances modtime through Phase 2 and re-mints a new `sheetsRevisionId` + `embeddedFingerprint`. **`snapshot_status` terminal expansion (round-46)**: `'partial_failure'` ≥1 entry is null AND retryable (asset_recovery cron will retry); `'partial_failure_restage_required'` ≥1 entry is null AND every remaining null entry has `recovery_disposition = 'restage_required'` — the show is in a terminal recovery-blocked state. §5.2 cron routing AND Task 6.3 gate logic MUST treat `partial_failure_restage_required` as a SKIP (never as an asset_recovery trigger — would loop forever); Task 7.8 GC suppression MUST extend to it just like `partial_failure` (deleting prior-revision blobs would produce a user-visible asset-loss path). BOTH embedded and linked-folder images go through the same Storage snapshotting path; the gallery serves them via /api/asset/diagram/<show>/r=<rev>/<assetKey> with no live-Drive reads at request time. snapshot_revision_id is minted fresh per Apply. snapshot_status='partial_failure' triggers asset_recovery mode (per §5.2) which retries snapshotting without re-parsing — restage-only embedded entries (`embeddedFingerprint = null`, `recovery_disposition = 'restage_required'`) are excluded from retry and require a fresh sheet edit to mint a new sheetsRevisionId.
  opening_reel_drive_file_id      text,              -- nullable. Drive file id for the opening reel video, captured at Phase 1 if event_details.opening_reel cell holds a Drive URL (per §6.5 free-text fallback the cell value can be a URL or text like "MAYBE"; only URLs populate this field).
  opening_reel_drive_modified_time timestamptz,      -- nullable. The pinned modifiedTime captured alongside opening_reel_drive_file_id at Phase 1. Used for §6.11.1 drift detection logging; informational only — `headRevisionId` below is the authoritative byte-fence.
  opening_reel_head_revision_id   text,              -- nullable. The immutable Drive revision token captured at Phase 1 enrichment AND re-verified at Apply (§6.11.1). /api/asset/reel/<show> streams via `revisions.get(fileId, headRevisionId, alt='media')` on every request — this is the TOCTOU fence guaranteeing crew only see the bytes Doug approved. Round-44 amendment: the modtime alone was insufficient (Drive can mutate bytes within a metadata read → byte fetch window), so the immutable `headRevisionId` is now first-class.
  coi_status      text,                              -- public on shows: COI value verbatim per schema-diff §2.8 ("SENT" / "IN PROCESS" / blank). All crew can see it because it's operational ("are we insured for this venue?"), not a financial detail. Free-text per §6.5 — no enum normalization.
  pull_sheet      jsonb,                             -- public on shows: per-case packing list parsed from PULL SHEET tab if present. Shape: [{ caseLabel: string, items: [{ qty: number, cat: string, subCat: string, item: string }] }]. NULL when sheet has no PULL SHEET tab (most v3+ sheets). See §6.10. Crew renders this on set/strike days only (§8.1).
  -- financials, parse_warnings, raw_unrecognized live in shows_internal (below)
  -- so they are physically impossible to read with non-admin RLS. Note: ONLY
  -- the financial fields (PO#, Proposal $, Invoice, Invoice Notes) are
  -- LEAD-gated; COI is now public on shows.coi_status because it's noise to
  -- techs only when financial; insurance status is genuinely operational.
  -- See §4.4 for the policy rationale.
  last_synced_at  timestamptz,
  last_sync_status text,                           -- valid values: "ok" | "parse_error" | "drive_error" | "sheet_unavailable" | "pending_review" (an EXISTING approved show is staged for re-review per §6.8) | "pending" (initial state). NOTE: first-seen sheets DO NOT have a shows row at all — they live exclusively in pending_syncs (stage path) or pending_ingestions (hard-fail path) until first Apply per §5.2 / §9.1.1. Transient warnings like STALE_WRITE_ABORTED and CONCURRENT_SYNC_SKIPPED are sync_log entries, NOT show-level status — the show's status reflects its current health, not single-attempt outcomes.
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
  financials       jsonb,                           -- LEAD-only: { po, proposal, invoice, invoiceNotes }. COI moved to shows.coi_status because it's operational, not financial.
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
  show_id           uuid not null unique references shows(id) on delete cascade,  -- round-45: unique(show_id) enforces the spec-wide singular-transportation contract; parser/type model is `TransportationRow | null`, so DB must reject duplicate rows that a buggy Phase 2 write or admin repair could otherwise create.
  driver_name       text,
  driver_phone      text,
  driver_email      text,
  vehicle           text,
  license_plate     text,
  color             text,
  parking           text,
  schedule          jsonb not null default '[]'::jsonb,  -- [{ stage, date, time, assigned_names: string[] }] — per-row tags drive TransportTile schedule-tagged visibility (§8.1).
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
  reported_by_kind text not null check (reported_by_kind in ('admin', 'crew')),
  reported_by     text not null,                   -- canonical email (admin) or crew_members.id::text (crew). Crew submissions never expose other crew's PII to the GH issue.
  reporter_role   text,                            -- crew submissions only: a snapshot of crew_members.role_flags at submission time, for triage context
  context         jsonb not null,                  -- { surface, crewPreview?, fieldRef?, parseWarnings, rawSnippet, viewerVisibleSection? }
  message         text,
  github_issue_url text,
  idempotency_key uuid not null default gen_random_uuid() unique,  -- §13.2.3 idempotency primary
  processing_lease_until timestamptz,              -- §13.2.3 lease window
  lease_holder    uuid,                            -- §13.2.3 round-8 ownership token; rotated on lease re-acquisition; required (`AND lease_holder = $myToken`) on every URL-writing tail UPDATE
  created_at      timestamptz not null default now()
);
create index reports_show_id_idx on reports (show_id, created_at desc);
create index reports_reporter_idx on reports (reported_by, created_at desc);
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
- **Admin-only tables (no crew/end-user access at all):** `sync_log`, `reports`, `pending_syncs`, `pending_ingestions`, `crew_member_auth`, `revoked_links`, `link_sessions`, `app_settings`, `deferred_ingestions`, `admin_alerts`, `sync_audit`, `drive_watch_channels`, `report_rate_limits`, `onboarding_scan_manifest` (round-48 amendment — wizard scan manifest, internal staging). RLS policies on each table reject every non-admin SELECT/INSERT/UPDATE/DELETE. The list above is the complete set of admin-only tables in v1; per-table notes near each `create table` reaffirm this.

### 4.4 Sensitive-field protection (defense in depth) — narrowed to financials

Doug's working model is "everyone gets the same document" — for v1 the only fields that need to stay out of crew views are **financials**: PO#, Proposal $, Invoice, Invoice Notes. Those are billing details that have no role in onsite execution and would only clutter the page for techs. **COI**, although it's in the same template block, is operational (knowing whether the show is insured matters at the venue) and is therefore public to every crew viewer. `parse_warnings` and `raw_unrecognized` remain admin-only because they're parser internals, not crew-facing data.

Three independent layers protect financials specifically:

1. **Physical separation** — `financials`, `parse_warnings`, and `raw_unrecognized` live in `shows_internal`, not `shows`. A `SELECT * FROM shows` cannot return them because they aren't there. This is the **first** line of defense: implementer error or accidental over-selection cannot expose them. `shows.coi_status` is on the public table by intention.
2. **RLS** — `shows_internal` has admin-only RLS policies. Even if an end-user session somehow gets the row's primary key, no policy admits the read.
3. **Server-side filter at fetch** — the LEAD-aware fetch helper (`lib/data/getShowForViewer(showId, viewer)`) accepts **identity only** — `viewer` is `{ kind: 'crew'; crewMemberId: string }` or `{ kind: 'admin' }`, never a role parameter. The helper internally loads `crew_members.role_flags` bound to (`crewMemberId`, `show_id`) BEFORE deciding whether to JOIN `shows_internal`; it joins only when the freshly-derived role is LEAD (or `viewer.kind === 'admin'`) AND only selects `financials` (parse_warnings/raw_unrecognized are admin-only paths). For non-LEAD viewers, it does not query `shows_internal` at all. **Caller-supplied role parameters are explicitly forbidden** — re-deriving role inside the helper on every call closes the stale-role hole where a token claim, preview param, or refactored argument could otherwise unlock financials after a DB demotion.

A non-LEAD crew member querying directly via the Supabase client cannot reach financials. They CAN read `shows.coi_status` along with the rest of the public show data, which is the intended outcome. URL obscurity is not in this list — it has never been a defense in this app.

**v2 candidate (per-viewer field segmentation):** Doug today doesn't segment by viewer; he hands the same template to everyone. If he later wants finer-grained per-role visibility (e.g., "only LEAD sees Invoice Notes; A1 still sees everything else"), that's a v2 extension where this same defense-in-depth pattern can be applied to additional field groups.

---

### 4.5 Runtime configuration tables

Two operator-controlled settings live in DB-backed tables (not env vars) so the §9.0 onboarding wizard and the per-show admin can change them at runtime without a redeploy:

```sql
-- Single-row settings table for global app configuration that an operator
-- (Doug or Eric via /admin) is allowed to change. Singleton: PK = ('default').
create table app_settings (
  id                          text primary key default 'default' check (id = 'default'),
  -- Active configuration consumed by cron and runtime:
  watched_folder_id           text,                    -- Drive folder currently in use; cron syncs against this
  watched_folder_name         text,                    -- captured at verification time, displayed in admin
  watched_folder_set_by_email text,                    -- admin who completed onboarding
  watched_folder_set_at       timestamptz,
  -- Candidate (pending) configuration the wizard is currently reviewing.
  -- Atomic folder switch: cron NEVER reads pending_*. The wizard writes its
  -- candidate folder here during onboarding and only promotes
  -- pending_folder_id -> watched_folder_id on wizard EXIT (after every found
  -- sheet has a resolved disposition per §9.0 step 3). Re-run setup writes
  -- only to pending_*; the active folder stays live until wizard completion.
  pending_folder_id           text,
  pending_folder_name         text,
  pending_folder_set_by_email text,
  pending_folder_set_at       timestamptz,
  pending_wizard_session_id   uuid,                    -- generated at wizard start. All writes to pending_* and the final promotion CAS use it; lets two admins/tabs serialize cleanly. NULL when no wizard is in flight.
  updated_at                  timestamptz not null default now()
);
insert into app_settings (id) values ('default') on conflict do nothing;

-- Durable record of first-seen sheets the admin has chosen to defer or
-- permanently ignore. Without this, Discard during onboarding (or later)
-- would leave the next cron run re-staging the same sheet, defeating the
-- "explicitly discarded for now" promise of §9.0.
create table deferred_ingestions (
  drive_file_id            text primary key,
  deferred_kind            text not null check (deferred_kind in ('defer_until_modified', 'permanent_ignore')),
  deferred_at_modified_time timestamptz,                -- the file.modifiedTime at the moment of deferral; cron skips this drive_file_id while file.modifiedTime <= this value (defer_until_modified) or always (permanent_ignore)
  deferred_at              timestamptz not null default now(),
  deferred_by_email        text not null,               -- admin who deferred
  reason                   text                         -- optional free-text from admin
);

-- Round-48 amendment: the wizard's per-session scan manifest. Records every Drive item
-- the onboarding scan saw (sheets + non-sheets) with its terminal lifecycle state.
-- Replaces row-absence inference in §9.0 step 3 and the wizard finalize gate — the manifest
-- is the authoritative resolution-state source. Without it, the default 'try again next sync'
-- Discard variant (which DELETEs the pending_syncs row with NO deferral row) would let the
-- wizard finalize prematurely on a state §6.8.1 explicitly defines as NOT resolved.
create table onboarding_scan_manifest (
  id                       uuid primary key default gen_random_uuid(),
  folder_id                text not null,                                  -- the wizard's pending_folder_id at scan time
  wizard_session_id        uuid not null,                                  -- ties manifest rows to a single wizard run; CAS-gated against app_settings.pending_wizard_session_id on every write
  drive_file_id            text not null,
  mime_type                text not null,
  name                     text not null,
  -- Terminal lifecycle states. Discovery classes: 'staged' (parsed; in pending_syncs), 'hard_failed'
  -- (parse failed; in pending_ingestions), 'skipped_non_sheet' (non-spreadsheet; auto-resolved).
  -- Action-driven transitions: 'applied' (operator clicked Apply, success), 'defer_until_modified',
  -- 'permanent_ignore' (operator chose corresponding Discard variant), 'discard_retryable' (default
  -- 'try again next sync' Discard — explicitly NOT resolved per §6.8.1; finalize blocks until this
  -- transitions to a terminal state).
  status                   text not null check (status in ('staged', 'hard_failed', 'skipped_non_sheet', 'applied', 'defer_until_modified', 'permanent_ignore', 'discard_retryable')),
  observed_at              timestamptz not null default now(),
  transitioned_at          timestamptz not null default now(),
  unique (wizard_session_id, drive_file_id)                                 -- one row per (session, file)
);
create index onboarding_scan_manifest_session_idx
  on onboarding_scan_manifest (wizard_session_id, status);
```

RLS: all three tables are admin-only.

Lifecycle:
- `app_settings.watched_folder_id` is `NULL` before the first onboarding wizard runs. The cron sync at §5.1 is a no-op when the value is `NULL` (logs `NO_FOLDER_CONFIGURED` once, then sleeps).
- **Wizard start.** Admin clicking "Run setup" or "Re-run setup" generates a fresh `wizard_session_id` (UUID). The client opens the wizard and submits step 1's folder URL with this id. Server step-2 verification:
  ```sql
  UPDATE app_settings SET
    pending_folder_id           = $folderId,
    pending_folder_name         = $folderName,
    pending_folder_set_by_email = $admin_email,
    pending_folder_set_at       = now(),
    pending_wizard_session_id   = $wizard_session_id,
    updated_at                  = now()
  WHERE id = 'default';
  ```
  This unconditionally overwrites prior pending state. **It does NOT touch `watched_folder_id`.** Cron and the running app keep using the existing active folder the entire time the wizard is open.
- **Every subsequent wizard write** (admin reviewing scan results, deferring sheets, etc.) carries `wizard_session_id` and is gated by:
  ```sql
  ... WHERE pending_wizard_session_id = $submitted_id
  ```
  If 0 rows affected → the wizard returns "another setup wizard has been started; please refresh." This protects against stale tabs.
- **Wizard exit (atomic promotion with session CAS):**
  ```sql
  UPDATE app_settings SET
    watched_folder_id           = pending_folder_id,
    watched_folder_name         = pending_folder_name,
    watched_folder_set_by_email = pending_folder_set_by_email,
    watched_folder_set_at       = pending_folder_set_at,
    pending_folder_id           = NULL,
    pending_folder_name         = NULL,
    pending_folder_set_by_email = NULL,
    pending_folder_set_at       = NULL,
    pending_wizard_session_id   = NULL,
    updated_at                  = now()
  WHERE id = 'default'
    AND pending_wizard_session_id = $submitted_id;  -- CAS: only THIS wizard can promote
  ```
  0 rows → another wizard ran and promoted in the meantime; this one's request fails with "your wizard session was superseded." The user retries from a fresh wizard.
- **Abandoned wizard cleanup** (v1: opportunistic): the next admin to start a wizard overwrites the prior pending state. There is no automatic timeout-based cleanup in v1; abandoned `pending_*` data stays harmlessly until next wizard start. v2 candidate: TTL-based expiry on `pending_folder_set_at`.
- `deferred_ingestions` rows are written by the §9.0 wizard step 3 (when admin discards a first-seen sheet during onboarding) and by §6.8.1's Discard-with-defer affordance (when admin discards a first-seen `pending_syncs` row from the dashboard with the "skip until edited" or "permanently ignore" option). Cron's per-file processor (§5.2) skips files whose `drive_file_id` has a matching `deferred_ingestions` row, with the file.modifiedTime check for `defer_until_modified`.

### 4.6 Admin alerts

Conditions that should be impossible (defended against by parser invariants and DB constraints) but that the runtime still has to handle defensively if they occur — primarily `AMBIGUOUS_EMAIL_BINDING` from `validateGoogleSession` — write a row here. The `/admin` dashboard renders unresolved rows as a top-bar critical banner that cannot be dismissed without clicking through to the affected show and confirming resolution.

```sql
create table admin_alerts (
  id              uuid primary key default gen_random_uuid(),
  show_id         uuid references shows(id) on delete cascade,  -- NULL for global alerts
  code            text not null,                                -- e.g. 'AMBIGUOUS_EMAIL_BINDING'
  context         jsonb not null,                               -- structured payload (e.g., colliding crew rows)
  raised_at       timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),           -- bumped on every UPSERT recurrence; lets ops see "this fault has been firing for N hours"
  occurrence_count int not null default 1,                       -- count of times the validator hit this same condition since first raise
  resolved_at     timestamptz,                                  -- NULL while unresolved; admin-acknowledged when populated
  resolved_by     text                                          -- admin email
);
-- One unresolved row per (show_id, code). Recurrences UPSERT into the same
-- row, bumping last_seen_at and occurrence_count. After resolution, the
-- next recurrence inserts a fresh row (since the partial index allows
-- multiple resolved rows for the same key).
create unique index admin_alerts_one_unresolved_idx
  on admin_alerts (coalesce(show_id::text, ''), code)
  where resolved_at is null;
create index admin_alerts_unresolved_recent_idx on admin_alerts (raised_at desc) where resolved_at is null;
```

RLS: admin-only. The dashboard reads `WHERE resolved_at IS NULL ORDER BY raised_at DESC`. Resolution flow: admin clicks through to the affected show, fixes the source of the alert (e.g., disambiguates duplicate emails in the sheet, then re-syncs), and clicks "Mark resolved" which writes `resolved_at = now()`. Until then, the banner persists.

**UPSERT semantics for the validator** (one durable signal per fault, not one row per failing request):

```sql
INSERT INTO admin_alerts (show_id, code, context)
VALUES ($1, $2, $3)
ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL
DO UPDATE SET
  last_seen_at      = now(),
  occurrence_count  = admin_alerts.occurrence_count + 1,
  context           = EXCLUDED.context;  -- keep the most recent context
```

If 100 crew members try to log in against a duplicate-email show, the dashboard shows ONE banner with `occurrence_count = 100`, not 100 separate banners.

This table also provides the durable surface for any future "should-be-impossible-but-defended" code that doesn't naturally fit into `pending_ingestions` (which is keyed on `drive_file_id`) or `sync_log` (which is per-attempt and not surfaced as an alert). v1 has only one such code (`AMBIGUOUS_EMAIL_BINDING`); the table exists so future codes have a home.

**AC** (added to §17.1 milestone 5): AC-5.12 — synthesizing the duplicate-email condition at runtime (bypassing MI-5b in test setup) writes an `admin_alerts` row visible in the dashboard's top-bar banner; resolving it removes the banner.

---

## 5. Sync pipeline

### 5.1 Trigger and cadence

Three triggers, in order of latency:

1. **Drive push notifications (`files.watch`) — primary, sub-second.** A subscription against the watched folder ID delivers a webhook to `/api/drive/webhook` (§5.5) within seconds of any sheet edit. The webhook handler dispatches `runPushSyncForShow(driveFileId)` per affected file (`mode: "push"`, NOT `manual`). Push mode honors `deferred_ingestions` and uses the same monotonic `<` watermark guard as cron — see §5.5.3 for the full contract. Webhooks **never** use `mode: "manual"`; that mode is reserved for operator-initiated `/admin/show/<slug>` "Re-sync" clicks. Push is best-effort by Drive's contract (Drive may drop, throttle, or fail to deliver), which is why the cron fallback below is non-negotiable.
2. **Vercel Cron `*/5 * * * *` reconciliation — fallback.** Runs `runScheduledCronSync()` against the watched folder. Catches anything push missed and confirms steady state. The cron's per-show watermark logic (§5.2) means an already-applied push leaves nothing to do — the cron is idempotent against push.
3. **Manual sync trigger** at `/admin/show/<slug>` — operator-initiated. Bypasses the watermark check and reprocesses the targeted sheet unconditionally.

A daily ping at `0 12 * * *` keeps Supabase awake (separate cron or part of the same job).

### 5.2 Per-run sequence

There is **no global watermark**. Each show is tracked independently via `shows.last_seen_modified_time`; a failure on show A cannot cause us to miss an update on show B.

**Three entry points** (all call into the same per-file processor at step 3):

- **`runScheduledCronSync()`** — invoked by Vercel Cron in `mode: "cron"`. Performs the folder-wide listing in step 2 and processes every file returned. Reads the watched folder ID from `app_settings.watched_folder_id`; if NULL, no-ops.
- **`runOnboardingScan(folderId)`** — invoked by the §9.0 onboarding wizard step 2 verification path. Folder-wide listing using the supplied `folderId`. **Stage-only mode**: this entry point uses `mode: "onboarding_scan"`, which is structurally different from `cron` / `manual` / `recovery`. It runs Phase 1 (parse + invariant check) but **NEVER enters Phase 2 (destructive snapshot replacement)**, regardless of whether MI invariants would otherwise auto-apply. Outcomes:
  - **Hard fail (MI-1..MI-5b)**: write to `pending_ingestions` as usual.
  - **Stage-for-approval (MI-6..MI-14) OR auto-apply-eligible**: BOTH paths write to `pending_syncs` for wizard review. There is no auto-apply during onboarding. This is the rule that closes the round-27 "scan-time mutate live shows" hole — re-running setup against a folder that contains existing-show sheets cannot replace their live data, because Phase 2 doesn't run.
  - The `triggered_review_items` for an otherwise-clean parse during onboarding gets a single `ONBOARDING_SCAN_REVIEW` sentinel item (action `apply` only) so admin still has to explicitly approve it. (Distinct from `FIRST_SEEN_REVIEW` because the show may not actually be first-seen.)
- The promotion of pending → active happens at wizard exit (§9.0 step 3 + §4.5 lifecycle), not during the scan.
- **`runManualSyncForShow(driveFileId, mode = "manual" | "recovery")`** — invoked by the admin "Re-sync" button at `/admin/show/<slug>` (which resolves slug → drive_file_id) and by the recovery path when a `sheet_unavailable` show reappears. **Skips the folder listing entirely** — fetches and processes ONLY the selected `drive_file_id`. This means a manual click can never destructive-replay parses for unrelated shows. Step 2's folder listing is replaced by `files.get(driveFileId)` (or sentinel "file not in folder" handling if the file isn't accessible).

All three entry points feed into the per-file processor identically from step 3 onward.

1. Authenticate with Drive using the service account credentials (env var `GOOGLE_SERVICE_ACCOUNT_JSON`).
2. **Cron and onboarding-scan entry points** — call `files.list` with **folder-scoped** parameters using `app_settings.watched_folder_id` (Drive API does NOT auto-scope by folder; the parent constraint must be explicit). The cron path reads the folder ID from `app_settings`; the onboarding-scan path uses the `folderId` argument passed by the wizard (which has not yet been written to `app_settings`). If `app_settings.watched_folder_id IS NULL` and the call site is cron, log `NO_FOLDER_CONFIGURED` and return immediately (no-op, no error). For the manual single-show entry point, this step is replaced by a single `files.get(driveFileId, fields="id, name, modifiedTime, parents")` call; if the file is not in the configured watched folder (parents check) or returns 404, the manual run records the error and returns without entering the per-file loop.
   ```
   q: "'<watched_folder_id>' in parents
        and mimeType = 'application/vnd.google-apps.spreadsheet'
        and trashed = false"
   // <watched_folder_id> = app_settings.watched_folder_id (cron) or the
   // folderId argument from the onboarding wizard (runOnboardingScan)
   pageSize: 100
   fields: "nextPageToken, files(id, name, modifiedTime, parents)"
   ```
   **Paginate until `nextPageToken` is absent** — never trust a single page. **No `modifiedTime` filter** — list every sheet in the folder every run; per-file decisions about whether to reprocess are made later via per-show `last_seen_modified_time`. With ~14 sheets total and ~12 runs/hour, this is well under any Drive quota.

   Defensive check: if any returned file's `parents` array does not contain the configured `watched_folder_id` (Drive supports multi-parenting; this guards against unexpected Drive behavior), drop it from the listing and emit a `UNEXPECTED_PARENT` warning to `sync_log`.
3. For each file in the listing:
   - **Deferral check (cron AND push, NOT manual or onboarding scan):** if `deferred_ingestions` has a row for this `drive_file_id`:
     - `permanent_ignore` → skip unconditionally; never re-stage.
     - `defer_until_modified` AND `file.modifiedTime <= deferred_ingestions.deferred_at_modified_time` → skip.
     - `defer_until_modified` AND `file.modifiedTime > deferred_ingestions.deferred_at_modified_time` → DELETE the deferral row (the file has been edited; resume normal processing) and continue.
     **Push honors deferred_ingestions identically to cron** — automatic processing must respect Doug's defer/ignore decisions. The onboarding scan and manual sync ignore deferral rows by design: those are operator-explicit actions and admin's deliberate click overrides the deferral. Skipping a deferred drive_file_id during push processing also short-circuits the §5.5.3 step 6 dispatch — the dispatch helper consults `deferred_ingestions` BEFORE acquiring the lock, so a deferred file produces zero work.
   - Look up the matching `shows` row by `drive_file_id`. **Do NOT auto-create a stub** — the schema requires non-null `slug`, `title`, `client_label`, `template_version`, none of which exist before parsing. First-seen sheets without a `shows` row enter the "first-seen" path: parse first, then create the row with parsed metadata in Phase 2 (auto-apply) or in the Phase 1 staging path (pending review). For first-seen sheets the `(prior shows.last_seen_modified_time)` value used for `pending_syncs.base_modified_time` is `NULL` — the CAS in §6.8.1 explicitly handles `IS NOT DISTINCT FROM NULL` for this case.
   - **Watermark gate** — only the **automatic** paths (`cron` and `push`) consult the watermark. Manual re-sync from `/admin/show/<slug>` and `sheet_unavailable`-recovery runs skip the gate. The watermark is the **higher of two values** to prevent re-staging an unchanged file while Doug is reviewing the prior stage:
     - **`shows.last_seen_modified_time`** — what's currently live.
     - **`pending_syncs.staged_modified_time`** — what's currently in review (if a row exists for this `drive_file_id`).
     - **Effective watermark** = `GREATEST(last_seen_modified_time, pending_syncs.staged_modified_time)`, treating either as `-infinity` if NULL.
     
     Auto-mode skip rule: `mode IN ('cron', 'push')` AND `file.modifiedTime <= effective_watermark` → skip. This means an unchanged file that's already pending review doesn't re-stage on every cron pass; the existing `staged_id` stays stable so Doug's open review tab continues to match the server state. Only when Drive's `modifiedTime` advances past BOTH the live snapshot AND the staged version does cron/push process the file again.
     - `mode IN ('cron', 'push')` AND `shows.last_sync_status === 'sheet_unavailable'` AND `file` is now present → proceed regardless of watermark (status recovery).
     - `mode IN ('cron', 'push')` AND `shows.diagrams.snapshot_status === 'partial_failure'` AND `file.modifiedTime <= effective_watermark` → enter `mode: "asset_recovery"`. **This branch is only taken when there's no newer sheet revision waiting.** If `file.modifiedTime > effective_watermark`, the system runs the normal cron/push fetch + parse + Phase 2 path instead, and any unresolved snapshot failures are carried forward into the new revision. This guarantees a permanently broken diagram cannot starve newer sheet content updates. (Round-46 amendment: `snapshot_status === 'partial_failure_restage_required'` is a TERMINAL state and is NOT routed to asset_recovery — Task 6.3 cron routing returns `{ outcome: 'skip', reason: 'partial_failure_restage_required' }` while modtime ≤ effective_watermark; only a fresh sheet edit advancing modtime past the watermark routes the show to normal Phase 2, which may mint new content-derivable fingerprints that flip the show back to `complete` or normal `partial_failure`.) Asset recovery does NOT re-parse the sheet, does NOT touch sheet-derived columns, and does NOT trigger MI invariants. It walks the **unified asset set** — every entry in BOTH `shows.diagrams.embeddedImages[]` AND `shows.diagrams.linkedFolderItems[]` whose `snapshotPath IS NULL`. For each entry: **re-runs the immutable-pin verify per §6.11's contract** (round-44/47/48 amendment, replacing the older modtime-only fence — `drive_modified_time` is informational only and has a TOCTOU window between metadata read and bytes fetch). For **linked-folder entries**, use Pattern A `revisions.get(driveFileId, headRevisionId, alt='media')` (preferred — exact bytes for the immutable revision; treat 404 from this call as drift since the revision was deleted) OR Pattern B `files.get(alt='media')` then **buffer-then-verify md5 against the pinned `md5Checksum`** (mismatch → discard bytes, leave `snapshotPath = null`, emit `LINKED_ASSET_DRIFTED`). For **embedded entries**, the equivalent fence is `(sheetsRevisionId, embeddedFingerprint)` — entries with `embeddedFingerprint = null` are restage-only and asset_recovery MUST fail closed for them (filtered out of the retry loop per §7 / Task 7.4); entries with non-null fingerprints re-verify the spreadsheet head revision via `drive.revisions.list` and match the content-derived ETag before extracting. asset_recovery NEVER uses `(modifiedTime, trashed)` as the fence — that has the TOCTOU window the immutable-pin contract was added to close. On a successful re-verify-and-download, UPSERT the `snapshotPath` on that entry. On full resolution across both arrays, flips `snapshot_status` to `'complete'`; if every remaining null entry has `recovery_disposition = 'restage_required'`, flips to terminal `'partial_failure_restage_required'`; otherwise stays at `'partial_failure'` for the next cron pass. Watermark / Phase-2 stale-write guards do NOT apply because asset_recovery doesn't touch anything Phase 2 protects. `last_seen_modified_time` is NOT advanced. Same-modtime partial-failure heals only when the source assets match their pinned `(headRevisionId, md5Checksum)` / `(sheetsRevisionId, embeddedFingerprint)` tuples; drifted or restage-only assets remain unresolved until a sheet edit forces a fresh Phase 2 stage that captures new pins.
     - `mode === "manual"` → always proceed regardless of watermark.
   - Fetch content via Drive API. The exact extraction call (single `files.export` to a markdown-equivalent vs. per-tab `spreadsheets.values.batchGet`) is decided at implementation time and tracked in §16 open questions; the parser's input contract is "markdown-table-shaped text identical in structure to the existing fixture corpus," so either path satisfies it. **If the fetch fails before any parse can run** (Drive auth error, quota exceeded, file race-deletion, etc.) — round-47 amendment, **the failure-handling writes execute INSIDE the same `withShowSyncTransaction` + per-show advisory-lock boundary as the main sync path**, never outside. Earlier prose described these writes as occurring "before entering Phase 1" without a lock; that allowed a concurrent successful sync to commit fresh data while a slower fetch-failure path raced in afterwards and clobbered `last_sync_status` with `'drive_error'`, OR left a ghost `pending_ingestions` row alongside the legitimate stage another worker had just written. The corrected contract:
     - **Acquire the per-show advisory lock first**: `SELECT pg_try_advisory_xact_lock(hashtext('show:' || $drive_file_id))`. If `false` → log `CONCURRENT_SYNC_SKIPPED` and return without any write (another worker holds the lock; their outcome is authoritative — either the success they're committing wins, or their own failure path will record the same `drive_error`).
     - If `shows` row exists: **CAS-gated** status-only update — only overwrite when no fresher successful sync has raced ahead. `UPDATE shows SET last_sync_status = 'drive_error', last_sync_error = $msg, last_sync_attempted_at = now() WHERE drive_file_id = $1 AND (last_synced_at IS NULL OR last_synced_at < $fetchAttemptStartTime)`. Does NOT advance `last_seen_modified_time` and does NOT touch sheet-derived columns. Insert `sync_log` entry. Return.
     - If no `shows` row exists (brand-new sheet, Drive failure before any successful parse): **first-seen race detection** — re-read `pending_syncs` under the lock (`SELECT 1 FROM pending_syncs WHERE drive_file_id = $1`); if a row exists, a concurrent Phase 1 has already staged this `drive_file_id` between this run's `shows` lookup and now, so the fetch failure is stale. Insert a `sync_log` row coded `drive_fetch_failed_superseded_by_stage` and return WITHOUT writing `pending_ingestions` (the stage represents the authoritative outcome). Otherwise, UPSERT `pending_ingestions` keyed on `drive_file_id` with `last_error_code = 'DRIVE_FETCH_FAILED'` (or a more specific code) and the error message. Insert `sync_log` entry. Return. The brand-new sheet is now visible in admin's "Sheets we couldn't parse" panel.
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
       - `mode === "push"` (automatic, from §5.5 webhook): same strict `<` guard as cron. 0 rows → `STALE_PUSH_ABORTED`, ROLLBACK. Same `deferred_ingestions` consultation as cron (per §5.2 step 3 deferral check).
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
     - **`shows_internal` upsert** — sensitive (financial) data and parser internals written here, never on `shows`:
       ```sql
       INSERT INTO shows_internal (show_id, financials, parse_warnings, raw_unrecognized)
       VALUES ($show_id, $financials, $warnings, $unrecognized)
       ON CONFLICT (show_id) DO UPDATE SET
         financials = EXCLUDED.financials,
         parse_warnings = EXCLUDED.parse_warnings,
         raw_unrecognized = EXCLUDED.raw_unrecognized;
       ```
       The parsed `financials` JSONB carries `{ po, proposal, invoice, invoiceNotes }`. The COI value parsed from the same template block is written separately to `shows.coi_status` (public column) per §4.1. This is the **only** write path for `shows_internal`.
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

### 5.5 Drive push notifications (`files.watch` channel)

Push is the primary low-latency trigger; cron is its fallback. Both feed the same per-file processor at §5.2 step 3, so the correctness invariants (advisory lock, monotonic UPDATE, snapshot replacement) cover both paths uniformly.

#### 5.5.1 Subscription lifecycle

Subscriptions are kept in a small DB table for lifecycle management:

```sql
create table drive_watch_channels (
  id              text primary key,                  -- the channel id we register with Drive (UUID we generate at INSERT time)
  status          text not null default 'pending'
    check (status in ('pending', 'active', 'superseded', 'stopping', 'stopped', 'orphaned')),
  watched_folder_id text not null,                   -- which folder this channel watches; matched against app_settings on activation
  webhook_secret  text not null,                     -- HMAC-equivalent secret unique per channel; generated at INSERT alongside id
  -- The next two are populated only after Drive confirms the subscription.
  -- They're NULL while status='pending' or 'orphaned'; required by CHECK
  -- when status transitions to 'active'.
  resource_id     text,                              -- Drive's opaque resource handle returned by files.watch
  expires_at      timestamptz,                       -- Drive caps watch channels at ~7 days; we proactively renew before
  created_at      timestamptz not null default now(),
  activated_at    timestamptz,                       -- set when status transitioned pending→active
  superseded_at   timestamptz,                       -- set when status transitioned active→superseded; lazy-GC anchor
  stopped_at      timestamptz,                       -- set when status transitioned to 'stopped' (after channels.stop confirmed)
  -- A row in 'active' status MUST have resource_id and expires_at populated.
  -- Other states allow them NULL.
  constraint drive_watch_channels_active_requires_drive_state
    check (status != 'active' or (resource_id is not null and expires_at is not null))
);
-- Single-active invariant per watched folder. Renewal flow uses a "drain
-- old then activate new" sequence to respect this:
--   1. INSERT new row as 'pending'.
--   2. Call files.watch externally (no DB state change yet).
--   3. In one transaction: UPDATE old active row SET status='superseded',
--      superseded_at=now(); UPDATE new pending row SET status='active',
--      resource_id=$rid, expires_at=$exp, activated_at=now().
-- If step 3 fails midway, both rows revert (single-tx). The new external
-- channel may still exist at Drive; the §5.5.6 GC reconciles via channels.stop.
create unique index drive_watch_channels_one_active_per_folder_idx
  on drive_watch_channels (watched_folder_id)
  where status = 'active';
create index drive_watch_channels_lookup_idx
  on drive_watch_channels (id)
  where status = 'active';
create index drive_watch_channels_renewal_due_idx
  on drive_watch_channels (expires_at)
  where status = 'active';
```

RLS: admin-only.

**Subscription operations.** External Drive API calls (`files.watch`, `channels.stop`) are not transactional with Postgres — a Drive-side success cannot be rolled back by a DB rollback, and vice versa. The lifecycle uses a **two-phase outbox pattern** so neither side can leak orphans without a documented recovery:

```sql
-- The drive_watch_channels.status column tracks the two-phase state machine:
-- (already in the schema above; see §5.5.1)
-- Add a status column if not already present (effective):
alter table drive_watch_channels
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'active', 'superseded', 'stopping', 'stopped', 'orphaned'));
```

State machine:
- `pending` — DB row written; Drive `files.watch` not yet called.
- `active` — Drive confirmed the channel; DB row holds `resource_id` + `expires_at`. Webhook handler (§5.5.3) requires `status = 'active'`.
- `superseded` — a newer `active` row replaced this one; channel is still alive at Drive but we no longer treat its notifications as authoritative. A garbage collector (§5.5.6) STOPs them at Drive in the background.
- `stopping` — `channels.stop` issued; awaiting confirmation.
- `stopped` — `channels.stop` succeeded; safe to delete the row.
- `orphaned` — the row was created but Drive returned an error and we cannot determine whether the channel exists; flagged for admin (`admin_alerts` row coded `WATCH_CHANNEL_ORPHANED`). The reconciliation cron (§5.5.6) reconciles these.

- **Create** (`subscribeToWatchedFolder(watched_folder_id)`) — outbox-style:
  1. Inside one DB transaction: generate channel id (UUID) and webhook_secret (32 bytes random); INSERT a `drive_watch_channels` row with `status = 'pending'`, `resource_id = NULL`, `expires_at = NULL`. COMMIT immediately so we have durable record before any external call. The `pending` status is permitted to coexist with an `active` row for the same folder (the partial unique index is only on `status='active'`).
  2. Outside the transaction: call Drive `files.watch` with `id`, `token: webhook_secret`, `address: <webhook-public-url>`. Time-boxed (default 15s).
  3. **On Drive success**, in one transaction (the "atomic activation"):
     ```sql
     -- Drain any prior active row for this folder.
     UPDATE drive_watch_channels
        SET status = 'superseded', superseded_at = now()
      WHERE watched_folder_id = $1 AND status = 'active';
     -- Promote the pending row.
     UPDATE drive_watch_channels
        SET status = 'active',
            resource_id = $rid,
            expires_at  = $exp,
            activated_at = now()
      WHERE id = $channelId AND status = 'pending';
     ```
     The two updates run in the same transaction, so the partial unique index never sees two `active` rows simultaneously. If the second UPDATE matches 0 rows (e.g., the row was already cleaned up), the transaction rolls back and the pending row stays — the `WATCH_CHANNEL_ORPHANED` admin alert path takes over.
  4. **On Drive failure**: another transaction sets `status = 'orphaned'` (resource_id and expires_at remain NULL — the `active` CHECK doesn't apply since status isn't `active`). Insert an `admin_alerts` row coded `WATCH_CHANNEL_ORPHANED` (single canonical alert code for every `files.watch` create-or-confirm failure — round-44 normalization). The reconciliation cron (§5.5.6) tries to clean up the orphan: it calls `channels.stop` blindly with the channel id; whether the call succeeds or 404s, the row goes to `stopped` and gets deleted after the 7-day retention. Push stays in fallback (cron-only) until a retry succeeds.
- **Renew** (`refreshWatchSubscriptions()`): runs as a Vercel Cron `0 * * * *` (hourly). For any `active` row whose `expires_at < now() + interval '24 hours'`, run the Create flow above. The atomic activation in step 3 handles the active→superseded handoff inside the same transaction as the new row's promotion, so there's never a moment when two rows are simultaneously `active`.
- **Revoke** (admin promoting a new `watched_folder_id` via the §9.0 wizard): mark all `active` rows for the prior folder `superseded` (DB-only). The new folder's `subscribeToWatchedFolder()` runs after wizard exit's app_settings promotion commit and follows the same two-phase pattern. The wizard's `app_settings` promotion commits regardless of whether the new subscription succeeds; if Drive rejects, the new folder enters cron-only-fallback mode and admin sees a `WATCH_CHANNEL_ORPHANED` banner (round-44: single canonical code for every Drive watch create/confirm failure).

#### 5.5.6 Channel garbage collection

A separate cron `15 * * * *` (offset from the renewal cron to avoid collision) runs `gcWatchChannels()`:
- For each `superseded` row: call `channels.stop`. On success → `status = 'stopped'`. On 404 (already gone) → `status = 'stopped'`. On other error → leave as `superseded`; retry next pass.
- For each `stopped` row older than 7 days: DELETE.
- For each `orphaned` row: call `channels.stop` with the row's id (Drive will 404 if it was never created or is already gone). Either way, set `status = 'stopped'` after the call returns.

This GC runs idempotently — if it crashes mid-pass, the next pass picks up where it left off. The webhook handler (§5.5.3) ignores everything except `status = 'active'` rows, so a non-`active` row in any state cannot affect serving traffic.

**Why this is better than DB-rollback-as-atomicity:** Postgres can't undo external state. The outbox decouples the two writes, and the state machine plus GC handles every leakage path explicitly. If the spec's earlier "wrap it all in one transaction" rule were implemented literally, a power loss between Drive-side success and DB commit would leave a live Drive channel that the app never matches, silently dropping all push deliveries.

#### 5.5.2 Webhook endpoint (`POST /api/drive/webhook`)

Drive POSTs notifications to this endpoint. The endpoint runs at the edge so 200 OKs return fast (Drive retries on non-2xx within a window, but excessive 5xx burns reputation).

Headers Drive sends:
- `X-Goog-Channel-Id` — matches the id of the channel that fired.
- `X-Goog-Channel-Token` — the webhook_secret we passed at subscribe time. **HMAC-equivalent verification source**.
- `X-Goog-Resource-State` — `sync` (initial), `add`, `remove`, `update`, `trash`, `untrash`.
- `X-Goog-Resource-Id` — Drive's opaque resource handle; we cross-check against `drive_watch_channels.resource_id`.
- `X-Goog-Channel-Expiration` — informational; we use `drive_watch_channels.expires_at` as the source of truth.
- `X-Goog-Resource-Uri` — the Drive resource that changed (the watched folder).

#### 5.5.3 Verification + dispatch

The webhook handler:

1. **Header presence check.** Reject 400 if `X-Goog-Channel-Id`, `X-Goog-Channel-Token`, or `X-Goog-Resource-State` are missing.
2. **Channel lookup.** `SELECT webhook_secret, watched_folder_id, resource_id FROM drive_watch_channels WHERE id = $X-Goog-Channel-Id AND status = 'active'`. **Strictly `status = 'active'`** — pending/superseded/orphaned/stopping/stopped rows are NOT matchable by the webhook lookup. If no match, reject 410 (channel stale, orphaned, or never existed). The 410 tells Drive to stop sending.
3. **Token verification.** Constant-time compare `X-Goog-Channel-Token` against `webhook_secret`. Mismatch → reject 401, write to `admin_alerts` (`WEBHOOK_TOKEN_INVALID` — high signal of spoofing attempt or bug, low chance of legit).
4. **Resource cross-check.** Confirm `X-Goog-Resource-Id === drive_watch_channels.resource_id`. Mismatch → reject 401.
5. **State filter.** `sync` (initial sync ack from Drive) → return 200 immediately, no work. `trash` / `untrash` / `remove` → also return 200 (these affect folder membership, which the next cron pass will reconcile via the listing-diff path at §5.2 step 4). Only `add` and `update` enqueue downstream work.
6. **Folder-listing dispatch.** A folder-level webhook tells us "something changed in the folder" but not which file. We perform a fresh `files.list` against the watched folder (single round-trip; cheaper than naive per-file fetches), compare against `shows.last_seen_modified_time` per existing row, and dispatch `runPushSyncForShow(driveFileId)` (`mode: "push"` — see below) for each file whose `modifiedTime > last_seen_modified_time` (or no `shows` row exists for it — first-seen path). This per-file dispatch reuses the §5.2 entry point so all the existing safety properties (advisory lock, monotonic UPDATE, first-seen-always-stage, deferred_ingestions skip) apply unchanged.

   **`mode: "push"` is distinct from `mode: "manual"`.** `manual` is operator-initiated and explicitly bypasses `deferred_ingestions` (Doug clicked "Re-sync" because he wants this to happen regardless of his earlier defer). `push` is automatic and **honors `deferred_ingestions` exactly as cron does**: a `permanent_ignore` row blocks restage; a `defer_until_modified` row blocks restage while `file.modifiedTime <= deferred_at_modified_time`. The watermark guard for `push` mode uses the same strict `<` rule as cron (only newer modtime can write) — push is automatic and should match cron's monotonicity. `STALE_PUSH_ABORTED` is the corresponding sync_log code (admin log only, similar to STALE_WRITE_ABORTED).
7. **Deduplication / no-op shortcut.** Drive may deliver multiple notifications for the same change. Before acquiring the per-show advisory lock, the dispatch helper checks `shows.last_seen_modified_time >= file.modifiedTime` and short-circuits with a `WEBHOOK_NOOP_ALREADY_SYNCED` log entry. This is a perf optimization only; the actual correctness against concurrent push + cron comes from §5.2's lock + monotonic UPDATE, which still holds even if dedup fails.
8. **200 OK** to Drive, with body `{"ok": true}`. Return as fast as possible — Drive doesn't wait for our processing and retries on non-2xx.

#### 5.5.4 Push-vs-cron reconciliation

The cron at §5.1 still runs every 5 minutes regardless of push activity. Its job in the push world is to:
- Catch missed pushes (Drive drops, network blips, our 5xx during a deploy).
- Detect sheets removed from the folder via the listing-diff path (§5.2 step 4) — push doesn't reliably surface deletions.
- Run renewals via `refreshWatchSubscriptions()`.

Push and cron commit through the same Phase 2 with the same locks; one cannot leave the system in an inconsistent state relative to the other. If push has been delivering reliably, every cron pass is effectively a no-op (every show's `last_seen_modified_time === current modifiedTime`).

#### 5.5.5 Push failure modes

| Failure | Detection | Behavior |
|---|---|---|
| Drive returns 4xx on `files.watch` create | API error | Log `WATCH_CHANNEL_ORPHANED` (round-44 normalization — single canonical code; admin_alerts row keyed `(show_id, code='WATCH_CHANNEL_ORPHANED')` is raised on the first failure, NOT after 3, so the operator surface is immediate). Cron sync continues to be the source of truth. Renewal cron retries on its next run. |
| Webhook arrives with a stale channel id (old subscription, replaced) | DB lookup at step 2 misses | 410 Gone — Drive stops sending. |
| Webhook arrives with valid channel id but wrong token | step 3 mismatch | 401 — write `admin_alerts` row coded `WEBHOOK_TOKEN_INVALID`. |
| Subscription expired before renewal could run (e.g., we were down) | next push fails / next cron observes drift | Cron picks up everything that drifted; renewal cron rebuilds the subscription on its next pass. The window of latency degrades from "seconds" to "5 minutes" until the new subscription is up. No data loss. |
| Push delivers but our backend errors during processing | Sentry catches | Drive doesn't retry on application-level errors (only on non-2xx HTTP). The next cron pass picks it up via watermark drift. |

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
   - For each token, normalize to its canonical atomic flag. **Round-49 amendment: the canonical set is the full v4 role-master vocabulary (verified at `2026-04-asset-mgmt-cfo-coo-waldorf.md:718-743`)** — earlier draft listed only `LEAD, A1, V1, BO, ONLY, CAM_OP, GAV`, which would silently drop real fixture roles as `UNKNOWN_ROLE_TOKEN`. The corrected set: `LEAD`, `A1`, `A2`, `V1`, `L1`, `BO`, `GS`, `ONLY`, `CAM_OP` (collapsed from `CAM OP`), `GAV`, `FLOATER`, `FLOOR`, `STREAM`, `PTZ`, `LED`, `SHOW_CALLER` (collapsed from `SHOW CALLER`), `GREEN_ROOM` (collapsed from `GREEN ROOM`), `OWNER`, `CONTENT_CREATION` (collapsed from `CONTENT CREATION`).
   - Composite tokens decompose to atomic: `LEAD / A1` becomes `["LEAD","A1"]`, NOT `["LEAD/A1"]`. `GS - A1` becomes `["GS","A1"]`. `BO - V1` becomes `["BO","V1"]`. `BO - LEAD` becomes `["BO","LEAD"]`. The dash-separator is treated identically to the slash-separator. `BO` alone becomes `["BO"]`. `ONLY***` becomes `["ONLY"]` (the asterisks fed §6.6 step 2 separately).
   - Unknown tokens not in the canonical list are dropped from `role_flags` and surface as a `UNKNOWN_ROLE_TOKEN` warning. Plan-side capability predicates (Task 4.6 / 4.12) read atomic-flag membership: `hasA1 = flags.includes('A1') || flags.includes('A2')`, `hasL1 = flags.includes('L1')`, etc.
   The raw role string is preserved in `crew_members.role` for display; `role_flags` is the authorization-safe representation.
5. **LEAD detection.** `role_flags` contains `LEAD` ⇒ user sees `shows_internal.financials` (PO/Proposal/Invoice). All crew see `shows.coi_status` regardless of role (§7.4 / §4.4).

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
  pullSheet: PullSheetCase[] | null;       // §6.10: per-case packing list when PULL SHEET tab present, NULL otherwise
  diagrams: {
    linkedFolder: { driveFolderId: string; driveFolderUrl: string } | null;
    embeddedImages: { sheetTab: string; objectId: string; mimeType: string; alt?: string }[];
    linkedFolderItems: { driveFileId: string; mimeType: string; alt?: string; drive_modified_time: string /* ISO */ }[];
                                            // §6.11: BOTH source types frozen at Phase 1. Phase 2 / Apply consumes
                                            // exactly this shape, sets snapshotPath per item, and persists into
                                            // shows.diagrams (which adds snapshotPath, snapshot_revision_id,
                                            // snapshot_status to each entry).
  };
  openingReel: { driveFileId: string; drive_modified_time: string /* ISO */ } | null;
                                            // §6.11 / §10: populated when event_details.opening_reel cell holds a
                                            // Drive URL (anywhere in the cell, not anchored). NULL otherwise.
                                            // Phase 2 / Apply persists into the shows.opening_reel_drive_* columns
                                            // AFTER an Apply-time drift re-check (§6.11.1).
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
| MI-1 | Version detection succeeded (`templateVersion ∈ {v1,v2,v3,v4}`) AND no `MI-1_VERSION_DETECTION_FAILED` warning raised | Hard fail |
| MI-2 | `show.title` is a non-empty string | Hard fail |
| MI-3 | At least one of `dates.travelIn`, `dates.set`, or `dates.showDays[0]` parsed to a valid date | Hard fail |
| MI-4 | `crewMembers.length >= 1` | Hard fail |
| MI-5 | `gs_rooms.length + breakouts.length + additional_rooms.length >= 1` | Hard fail |
| MI-5a | **Crew name uniqueness within the show:** `crewMembers` contains no duplicate `name` values. Two crew rows with the same display name cannot share an identity (auth would collapse them; renaming/role updates would corrupt one). | Hard fail with `DUPLICATE_CREW_NAME` error pointing at the colliding rows; Doug disambiguates in the sheet. |
| MI-5b | **Crew email uniqueness within the show (when present):** for any non-null `crewMembers[].email` after normalization (§4.1.1), no other crew row in the same parse may share the normalized form. Duplicate emails would let `validateGoogleSession` bind a Google login to either matching row ambiguously, leaking role/data across identities. | Hard fail with `DUPLICATE_CREW_EMAIL` error pointing at the colliding rows. Backed by a Postgres partial unique index `unique (show_id, email) WHERE email IS NOT NULL` on `crew_members.email` (which is itself stored normalized — see §4.1.1), so a violation cannot reach the destructive transaction even if the parser missed it. |
| MI-6 | **Crew shrinkage guard:** if a prior snapshot exists, `new.crewMembers.length >= prior.crewMembers.length` OR `prior.crewMembers.length - new.crewMembers.length <= 1`. The "≤1" tolerance covers the normal case of a single crew removal; anything bigger is suspicious. (Replaces the earlier <=2-crew exemption, which was too permissive.) | Stage for approval |
| MI-7 | **Section shrinkage guard:** for each of `hotelReservations`, `rooms` (sum across kinds), `contacts`: if `prior.<section>.length > 0` AND `new.<section>.length < prior.<section>.length` AND the drop is > 50% (or any drop when `prior <= 2`), stage. Strict collapse to zero is a special case of this. For `transportation` (null vs present): if prior was a populated row and new is null, stage. | Stage for approval |
| MI-7b | **Keyed preservation across re-syncs:** for sections with stable natural keys, if a key that existed in `prior` is missing from `new`, stage:<br>• `hotel_reservations` keyed on `ordinal` (1..4)<br>• `rooms` keyed on `(kind, name)`<br>• `contacts` keyed on `(kind, name)` (or `(kind, email)` if name absent)<br>This catches the "5 of 6 hotels remain but #2 silently disappeared" parser regression that pure-count thresholds would miss. | Stage for approval |
| MI-8 | **Financial-field preservation:** if `prior.financials` had any non-empty field (PO#, Proposal, Invoice, Invoice Notes) AND any of those fields is now empty/null in the new parse, stage. | Stage for approval |
| MI-8b | **COI delta — every change to `coi_status` stages, not just blanking.** Now that COI is public to every crew viewer (per §4.4 / §8.1 Show status tile), a wrong non-empty transition (e.g., `SENT → IN PROCESS`, `SENT → arbitrary text`, `SENT → ""`) propagates to all crew immediately. Doug confirms every change before crew see it. Any `prior.coi_status !== new.coi_status` (treating NULL and `""` as equivalent for this comparison) stages. Pure no-op edits where the canonical value is unchanged don't trigger. | Stage for approval |
| MI-8c | **Pull-sheet preservation — public packing data must not silently degrade.** `shows.pull_sheet` is rendered to every crew viewer on set/strike days (§8.1 Pack list tile), so a parser regression or sheet edit that wipes or partially corrupts the manifest is a user-visible operational regression. Stage on any of: (a) `prior.pull_sheet IS NOT NULL` AND `new.pull_sheet IS NULL` (full collapse); (b) `PULL_SHEET_AMBIGUOUS_FORMAT` warning fired AND prior had a non-ambiguous parse (the sheet's column shape changed in a way the parser no longer recognizes); (c) `new.pull_sheet.length < prior.pull_sheet.length / 2` (case-count halved or worse — likely parse drift, not a real edit); (d) any case present in prior whose `caseLabel` is missing from new (case dropped). Soft `PULL_SHEET_PARSE_PARTIAL` warnings on individual rows continue to auto-apply with rawSnippet fallback — only structural collapse stages. | Stage for approval |
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

**The Apply UI sends back the `staged_id` it rendered.** The server uses this to reject "Apply against a stale staged version" (e.g., admin opens two tabs, clicks Apply in tab A, then clicks Apply in tab B which is rendering an older `staged_id`). The server's first action is `SELECT staged_id, source_kind, wizard_session_id FROM pending_syncs WHERE drive_file_id = $1` and a strict-equality compare to the submitted value.

**Wizard-session CAS for onboarding-staged rows.** If `source_kind = 'onboarding_scan'` and `wizard_session_id IS NOT NULL`, Apply also CAS-checks against the current `app_settings.pending_wizard_session_id`. Mismatch → 409 with `WIZARD_SESSION_SUPERSEDED`; the row is DELETEd as part of the rejection (the wizard that created it has been superseded). Same check applies to Discard. **A wizard start (§4.5) additionally purges all `pending_syncs` rows whose `wizard_session_id != new pending_wizard_session_id` — so a fresh wizard never inherits stale onboarding-scan rows from a prior session.**

When admin clicks "Apply" on a staged parse:

1. **Acquire the per-show advisory lock**: `pg_advisory_xact_lock(hashtext('show:' || $drive_file_id))` (blocking, since this is an admin action). Concurrent cron runs that hit `pg_try_advisory_xact_lock` for the same key get `false` and skip per the standard §5.2 flow.
2. **Inside the same transaction**, re-read the current `shows.last_seen_modified_time` and the stored `pending_syncs` row. **Compare-and-swap conditions** — all must hold:
   - `pending_syncs` row still exists for this `drive_file_id` (it wasn't discarded by another admin or superseded by a fresh staging).
   - Submitted `staged_id` matches `pending_syncs.staged_id`. If unequal → abort with "This staging has been superseded. Reload the admin page."
   - **`shows.last_seen_modified_time IS NOT DISTINCT FROM pending_syncs.base_modified_time`** — i.e., the live snapshot Doug compared against during review is still the live snapshot now. The two values intentionally compare as equal when both are NULL (brand-new show). If they differ, a newer parse committed since staging — abort: log `STAGED_PARSE_SUPERSEDED`, DELETE the stale `pending_syncs` row, return "A newer parse has already been applied. Refresh the admin page." The live snapshot has moved past what Doug reviewed; he reviews fresh.
3. **Mandatory Drive re-verify**: re-fetch `files.get(fileId, fields='modifiedTime,parents,trashed')`. The check is broader than just modtime — it must also confirm the sheet is still in scope:
   - **404 / inaccessible / `trashed=true`** → abort with `STAGED_PARSE_SOURCE_GONE`. The source has been deleted, unshared, or trashed; do NOT publish from `pending_syncs.parse_result`. DELETE the staged row. For existing-show stages, restore prior_last_sync_status (per the discard-restore path); for first-seen stages, log the failure to `pending_ingestions` so admin sees what happened. Never mint a new `shows` row from a sheet Doug has removed from scope.
   - **`parents` does NOT contain the active `app_settings.watched_folder_id`** (or for onboarding stages, the wizard's `pending_folder_id`) → abort with `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`. Same DELETE + recovery semantics as `_GONE`. Drive supports multi-parenting; the file might have other parents but if our scope folder isn't one of them, it's out of bounds.
   - `file.modifiedTime > pending_syncs.staged_modified_time` → behavior continues per below (abort with restage path appropriate to source_kind).
   
   If `file.modifiedTime > pending_syncs.staged_modified_time`, the sheet has been edited again since Doug staged this parse — abort. Behavior depends on `pending_syncs.source_kind`:
   - **Non-onboarding stage** (`source_kind` IN `'cron', 'push', 'manual'`): **restore-then-delete, mirroring Discard semantics (round-46 amendment).** Earlier prose only DELETEd the staged row; for an existing-show stage that left `shows.last_sync_status = 'pending_review'` with no backing `pending_syncs` row, producing a phantom "review needed" admin entry with no way to clear it. The corrected flow: read `prior_last_sync_status` and `prior_last_sync_error` from the staged `pending_syncs` row, then `UPDATE shows SET last_sync_status = $prior_status, last_sync_error = $prior_error WHERE drive_file_id = $1`, THEN DELETE the staged row. First-seen stages (no `shows` row) skip the restore and go straight to DELETE since there's no prior status to restore. Log `STAGED_PARSE_OUTDATED`, return "The sheet has been edited since you reviewed this parse. A fresh parse will be staged on the next cron run within 5 minutes (or push notification)." The next cron/push run picks up the new modifiedTime, re-parses, and produces a fresh staging row.
   - **Onboarding stage** (`source_kind = 'onboarding_scan'`): cron is disabled during onboarding (`watched_folder_id` is still NULL — only `pending_folder_id` is set), so the standard "next cron pass" recovery path doesn't exist. Instead, **inline rescan**: in the same advisory-locked transaction, fetch the file via Drive API using `pending_folder_id` as the auth scope, run `runOnboardingScan` semantics (Phase 1 only, never Phase 2), and UPSERT a fresh `pending_syncs` row with the new `staged_modified_time`, fresh `staged_id`, current `wizard_session_id`, and `source_kind = 'onboarding_scan'`. Return `STAGED_PARSE_RESTAGED_INLINE` with the new staged row's data so the wizard UI can re-render the review surface in place. The wizard never gets stuck; Doug always has a current staged row to review.

This step is non-optional; the prior round's "off by default" stance was rejected because for role-affecting changes it can temporarily grant or remove access based on data Doug is no longer approving. The single Drive read per Apply click is well within quota.
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
| FIRST_SEEN_REVIEW | `apply` | none. The sentinel just confirms Doug has reviewed the brand-new sheet. Apply proceeds as normal first-seen Apply (creates the `shows` row with derived slug, runs Phase 2). User-facing copy in §12.4. |
| ONBOARDING_SCAN_REVIEW | `apply` | none. Sentinel for files that would have auto-applied except they came from `runOnboardingScan` (`mode: "onboarding_scan"`) which never runs Phase 2 directly. Apply runs the standard Phase 2 flow against the (still possibly active) folder once the wizard exits. User-facing copy in §12.4. |
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

When admin clicks "Discard" — Discard variants depend on stage type and admin's intent:

**Existing-show stage** has one Discard variant:
- Inside the advisory lock + transaction: read `pending_syncs.prior_last_sync_status` / `prior_last_sync_error`. `UPDATE shows SET last_sync_status = $prior_status, last_sync_error = $prior_error WHERE drive_file_id = $1`. DELETE the `pending_syncs` row. COMMIT. The page continues serving the prior approved snapshot. Status indicator returns to its pre-stage value (which may itself be a non-`ok` state like `sheet_unavailable` — Discard does not falsely make a degraded show look healthy). The next cron run will re-parse the (still-modified) sheet and re-stage if invariants still trip.

**First-seen stage** has THREE Discard variants because the staged data has no prior snapshot to fall back to and we need to control whether the file re-stages on the next cron run:
- **"Discard — try again next sync"** (default if admin doesn't pick): DELETE the `pending_syncs` row. No `deferred_ingestions` row written. The next cron run re-fetches and re-stages from scratch. Use this when admin meant "I'll come back to this." This is the only Discard path that DOES leave the wizard non-finalizable per §9.0 step 3 — the wizard explicitly cannot consider this state "complete."
- **"Discard — skip until edited"** (`defer_until_modified`): DELETE the `pending_syncs` row. INSERT a `deferred_ingestions` row with `deferred_kind = 'defer_until_modified'` and `deferred_at_modified_time = pending_syncs.staged_modified_time`. Cron skips this `drive_file_id` until Doug edits the sheet (Drive bumps modifiedTime); then the deferral row is auto-DELETEd and processing resumes. Use this for WIP sheets Doug isn't ready to review yet.
- **"Discard — permanently ignore"** (`permanent_ignore`): DELETE the `pending_syncs` row. INSERT a `deferred_ingestions` row with `deferred_kind = 'permanent_ignore'`. Cron skips this `drive_file_id` indefinitely until admin manually deletes the deferral row. Use this for sheets that don't belong (someone shared a wrong file into the folder, etc.).

The §9.0 wizard step 3 considers a sheet "resolved for onboarding completion" if any of: applied (becomes a `shows` row), discarded with `defer_until_modified`, or discarded with `permanent_ignore`. The default "try again next sync" variant does NOT count as resolved — the wizard prompts admin to pick one of the three terminal actions before letting onboarding complete.

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

### 6.10 PULL SHEET (per-case packing list) parsing

The PULL SHEET tab is present in only some sheets (`2024-05-east-coast-family-office.md`, `2025-05-redefining-fixed-income-private-credit.md`; absent from 2025-06+). When present, it carries per-case packing rows that are genuinely useful to crew on set/strike days. The parser extracts what's there and stores it in `shows.pull_sheet`; absence is normal and handled gracefully (column stays NULL, tile in §8.1 doesn't render).

**Parse contract:**

```ts
type PullSheetCase = {
  caseLabel: string;        // e.g. "CASE 1", "TOTAL COUNT CORP & INS / SALON 1"
  items: PullSheetItem[];
};
type PullSheetItem = {
  qty: number | null;       // nullable for malformed rows; renderer treats null as "?" or skips
  cat: string | null;       // category, e.g. "AUDIO"
  subCat: string | null;    // sub-category, e.g. "MICROPHONE"
  item: string;             // line-item name (required; rows with no item are dropped)
  rawSnippet?: string;      // verbatim row for fallback render if anything fails to map
};
```

**Detection (round-43 amendment — corrected against the real corpus):**

The PULL SHEET tab uses a **positional column layout, NOT a `QTY / CAT / SUB CAT / ITEM` text header**. Verified against `2024-05-east-coast-family-office.md:207-275` and `2025-05-redefining-fixed-income-private-credit.md:360-430`.

- The pull-sheet block starts with a header row whose ALL cells contain the literal text `PULL SHEET` (the merged case-title is replicated across every column of that markdown row — e.g. `| PULL SHEET/East Coast... | PULL SHEET/East Coast... | PULL SHEET/East Coast... | PULL SHEET/East Coast... | PULL SHEET/East Coast... |`). The case label is extracted from the title text after the `PULL SHEET/` prefix; for nested sub-cases like `TOTAL COUNT CORP & INS / SALON 1`, the parser flattens to one case per sub-section.
- Subsequent rows are positional (5 columns): **`packed_flag | qty | item | sub_cat | cat`**:
  - col 1 (packed_flag): `FALSE`/`TRUE` checkbox indicator (informational; not stored)
  - col 2 (qty): integer (parseable as number; null if blank)
  - col 3 (item): line-item name (REQUIRED; rows with empty col 3 are dropped)
  - col 4 (sub_cat): nullable sub-category (e.g., `SPEAKERS / MONITOR`)
  - col 5 (cat): top-level category (e.g., `AUDIO`, `VIDEO`, `BASES`, `FOH`, `SCENIC`)
- The 2024-05 fixture has nested sub-tabs (`TOTAL COUNT CORP & INS / SALON 1`) — the parser emits one `PullSheetCase` per sub-tab.
- **The GEAR tab (2025-06+) is NOT a pull sheet** — `2025-06-ria-investment-forum.md:366-388` has the explicit text header `QTY | PULLED | INITAL | CAT | SUB CAT | ITEM | NOTES` (7 columns including the PULLED + INITAL audit columns). That table is operations-side packing data and is OUT OF SCOPE for the crew Pack List tile (§2 deferral list). The parser distinguishes the two by header shape:
  - **PULL SHEET** → first cell starts with literal `PULL SHEET` (no `QTY` text header below it).
  - **GEAR** → text header row contains BOTH `PULLED` AND `INITAL` (note the typo — verbatim in the fixture).

**Soft warnings (not hard fails):**
- `PULL_SHEET_PARSE_PARTIAL` — at least one row had unparseable QTY or empty critical column; the row is preserved with `rawSnippet` and `qty: null`. Tile renders the raw snippet for that row.
- `PULL_SHEET_AMBIGUOUS_FORMAT` — the parser detected something pull-sheet-shaped (header contains `PULL SHEET`) but the row column count doesn't match the expected 5. The full block is preserved as a single case with `caseLabel: "Unparsed pull sheet"` and items rendered as raw snippets.

**MI-8c gate (clarification, supersedes any earlier soft-warning-only language).** Per §6.8 MI-8c, structural pull-sheet regressions ARE stage-for-approval invariants — full collapse, case-count halved, case-label dropped, or `PULL_SHEET_AMBIGUOUS_FORMAT` against a previously-non-ambiguous parse all stage. Per-row `PULL_SHEET_PARSE_PARTIAL` warnings on individual rows continue to auto-apply with `rawSnippet` fallback (the row is degraded, not the whole structure).

**Cardinality cap:** v1 renders up to 12 cases inline; "Show more" reveals the rest. Per-case items have no cap (cases typically hold ≤30 line items).

### 6.11 DIAGRAMS — embedded-image extraction

Newer sheets (2026+) carry **floating embedded images** positioned over the DIAGRAMS tab — the FinTech Forum 2026 fixture is the canonical example, with a 2D ballroom layout drawing and a 3D photo of the actual ballroom both pasted directly into the sheet. These images never appear in the markdown export the parser consumes for the rest of the sheet, so they need a separate extraction step.

**Extraction path (production):**

1. Standard parse runs against the markdown export (per §6.1–6.10) and produces the bulk `ParseResult`.
2. **Then** the sync layer (NOT the parser — round-43 boundary, embedded extraction lives in `lib/sync/enrichWithDrivePins.ts`) calls `spreadsheets.get` with `fields=sheets(properties.title,protectedRanges,charts,embeddedObjects(objectId,position,size,sourceUrl,image(contentUrl,sourceUrl,altText,sheetEmbeddedObject)))` and **NO `ranges=` parameter** (round-48 amendment — the earlier hardcoded `ranges=DIAGRAMS!A1:Z1000` was a case-sensitive A1-notation range that fails tab resolution against the corpus's `DIagrams` typo; spec §6.11 below mandates case-insensitive tab resolution). The implementation fetches all sheets and filters client-side via `sheets.find(s => s.properties.title.toLowerCase() === 'diagrams')` to handle the typo. Fallback is `files.export(mimeType: 'application/zip')` which returns an HTML zip with extracted images and an `images/` folder.
3. For each embedded object on the DIAGRAMS tab whose type is image-like, record `{ sheetTab: "DIAGRAMS", objectId, mimeType, alt?, snapshotPath: null }` in the `parseResult.diagrams.embeddedImages` array. The bytes themselves are **snapshotted into Supabase Storage at Phase 2 (auto-apply) or Apply (staged) time** — not at parse time. This preserves the live-vs-staged snapshot boundary: the crew page for the currently-approved snapshot serves images from the storage path baked at the last successful Apply, never from live Drive state. If Doug edits an image while a stage is pending, the live crew page continues to show the previously-approved bytes. Specifically:

   **Storage layout.** A private Supabase Storage bucket `diagram-snapshots`. Bucket-level policies forbid all anonymous and end-user-session access; only the service role reads/writes. Storage object keys use a per-apply **immutable revision id**, NOT the modifiedTime, because manual/recovery applies are explicitly allowed to replay the same modtime (§5.2). Each successful Phase 2 / Apply mints a fresh `snapshot_revision_id` UUID written into `sync_audit` and into `shows.diagrams.snapshot_revision_id`; storage keys are `shows/<show_id>/r=<snapshot_revision_id>/<objectId>.<ext>`. Two applies of the same Drive `modifiedTime` get distinct revisions, distinct keys, distinct objects.

   **Linked-folder enumeration freezes at Phase 1 (parse / stage) with the immutable pin tuple, not at Apply (round-44 amendment).** If we waited until Apply to enumerate the folder, additions/removals between stage and Apply would silently change what Doug actually published. Phase 1 enumerates the folder via `files.list` with `fields='files(id,name,mimeType,modifiedTime,headRevisionId,md5Checksum,trashed)'` and captures the **immutable approval tuple** `(driveFileId, mimeType, alt, drive_modified_time, headRevisionId, md5Checksum)` per item, recorded in `parseResult.diagrams.linkedFolderItems`. `headRevisionId` + `md5Checksum` are the authoritative byte-fence — `drive_modified_time` is informational because Drive can mutate bytes within a metadata read → byte fetch window. Apply downloads either via `revisions.get(fileId, headRevisionId, alt='media')` (preferred, exact bytes) or via `alt=media` followed by buffer-then-verify against `md5Checksum`. Folder content changes between stage and Apply do NOT propagate. If a frozen tuple's file is gone at Apply time (404/unshared/trashed) OR drift is detected, it's preserved with `snapshotPath: null` and contributes to `snapshot_status = 'partial_failure'`.

   **Embedded-image freeze with content-derived fingerprint (round-44 amendment).** Embedded images on the DIAGRAMS tab carry their own immutable approval pair: `sheetsRevisionId` (captured via `drive.revisions.list(spreadsheetId)` — the spreadsheet's head revision id at extraction time, since the Sheets API does not expose this directly) AND `embeddedFingerprint` (a content-derived ETag from `image.contentUrl`). If the Sheets API cannot supply a content-derived token for a given image, `embeddedFingerprint` is set to `null` AND that entry is **restage-only**: Apply MUST fail closed (no download) and `asset_recovery` MUST exclude that entry from retry. A fresh sheet edit re-mints `sheetsRevisionId` + `embeddedFingerprint` and the snapshot is re-attempted then. Positional/id hashes are forbidden as approval evidence (an in-place image replacement preserves objectId + position).

   **Combined cap upstream of persistence (round-44 amendment).** `MAX_TOTAL_DIAGRAM_ITEMS = 60` is a budget across BOTH `embeddedImages` AND `linkedFolderItems`. The cap is enforced during Phase 1 enrichment (Task 7.1 reserves up to N for embedded; Task 7.2 consumes the residual budget for linked). Items 61+ MUST NOT be persisted — otherwise hidden overflow can drift / 404 / wedge `snapshot_status='partial_failure'` even though the gallery never emits a URL for them.

   **Per-apply snapshotting flow** (covers BOTH embedded images AND the frozen linked-folder set so the live page never reaches into Drive at view time):
   - Generate `snapshot_revision_id = gen_random_uuid()`.
   - For each entry in `parse_result.diagrams.embeddedImages[]` (round-48 amendment — full immutable-pin re-verify under the per-show advisory lock; mirrors plan Task 7.3. The legacy "download each embedded image directly and mark partial_failure only on download failure" path is RETIRED — drift detection happens BEFORE any byte fetch):
     - **Restage-only short-circuit**: if the entry's `recovery_disposition = 'restage_required'` (set when `embeddedFingerprint` was null at extraction time per the round-44/46 amendments above), Apply does NOT download. Leave `snapshotPath = null`, mark `snapshot_status = 'partial_failure'`, and exclude the entry from any retry path. The entry converges only when a fresh sheet edit re-mints `sheetsRevisionId` + `embeddedFingerprint` via Phase 2.
     - **Re-fetch the spreadsheet head revision via `drive.revisions.list(spreadsheetId)` UNDER THE LOCK** and compare the latest `revision.id` to the entry's stored `sheetsRevisionId`.
     - **Re-run `spreadsheets.get`** to verify the entry's `objectId` is still present on the DIAGRAMS tab AND the entry's stored `embeddedFingerprint` matches the live content-derived token.
     - **All three checks must pass** (revision unchanged AND objectId present AND fingerprint matches) before any byte download. Drift in any of the three → leave `snapshotPath = null`, mark `snapshot_status = 'partial_failure'`, AND emit `EMBEDDED_ASSET_DRIFTED` warning. No bytes are fetched in the drift case.
     - On verified-pin match: download bytes → upload to `diagram-snapshots/shows/<show_id>/r=<snapshot_revision_id>/embedded-<objectId>.<ext>` → set `snapshotPath` to that path.
   - For each entry in `parse_result.diagrams.linkedFolderItems[]` (the frozen set from Phase 1):
     - **Immutable-revision download (round-44 amendment, fail-closed):** Pattern A — `revisions.get(driveFileId, headRevisionId, alt='media')` downloads the exact bytes the freeze tuple pinned regardless of current head; 404 from Drive at this call indicates the revision was deleted (drift case). Pattern B — `files.get(alt='media')` then recompute md5 of the streamed bytes; if computed md5 ≠ `md5Checksum`, discard the bytes and treat as drift. **Never use `(modifiedTime, trashed)` as the fence — it has the TOCTOU window that motivates round-44.** On drift in either pattern: leave `snapshotPath = null` AND mark `snapshot_status = 'partial_failure'` AND emit `LINKED_ASSET_DRIFTED` warning. asset_recovery follows the same revision-pinned download path.
     - On verified-pin match: upload bytes to `diagram-snapshots/shows/<show_id>/r=<snapshot_revision_id>/folder-<driveFileId>.<ext>` and set `snapshotPath`.
     - On any failure: leave `snapshotPath = null` and mark `snapshot_status = 'partial_failure'`.
   - Phase 2's UPDATE on `shows` writes the new `diagrams` JSONB with all per-entry `snapshotPath` values, the frozen `linkedFolderItems[]` (with snapshotPaths populated), the top-level `snapshot_revision_id`, and `snapshot_status`. **No source type is exempt from snapshotting**; the previous "linked-folder live-fetch" path is replaced.

   **Partial-failure retry path.** Two terminal sub-states exist (round-46/47/48 amendments):
   - `snapshot_status = 'partial_failure'` — at least one entry has `snapshotPath = NULL` AND at least one such null entry has `recovery_disposition = 'normal'` (retryable). **Auto-syncs (cron, push) IGNORE the watermark gate for this show** and keep re-attempting the retryable failed snapshots without waiting for Doug to edit the sheet. On each retry pass: re-attempt only the entries whose `snapshotPath IS NULL` AND `recovery_disposition = 'normal'`. Successful retries fill the path. Once every entry has a non-null `snapshotPath`, flip `snapshot_status` to `'complete'`; subsequent auto-syncs return to normal watermark behavior.
   - `snapshot_status = 'partial_failure_restage_required'` — at least one entry has `snapshotPath = NULL` AND every remaining null entry has `recovery_disposition = 'restage_required'` (no retryable nulls left). **Cron SKIPS this show — does NOT route into asset_recovery and does NOT advance any retry counter.** A null-fingerprint entry cannot be healed by re-downloading; only a fresh sheet edit can re-mint `sheetsRevisionId` + `embeddedFingerprint`, which advances `modifiedTime`, fires Phase 2, and either resolves the entry or keeps it stuck (still detectable via the same gate). The `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` admin alert is raised so Doug sees the stuck state.
   - **Crucially, the prior snapshot's bytes are NOT immediately deleted.** Until `snapshot_status = 'complete'`, the diagram GC (below) suppresses deletion of the prior revision's blobs — so on the gallery, the missing image renders the placeholder per AC-7.7, but at least one consistent revision still has all bytes available for forensic recovery if needed.
   - This means a transient Drive/Storage failure can never permanently degrade the live view, because retries continue automatically rather than being gated by file modtime.

   **Service endpoint** is the revision-versioned `/api/asset/diagram/<show>/r=<snapshot_revision_id>/<assetKey>` per §7.3 routing. Auth + cache contract is documented there in full; the canonical bullet is `Cache-Control: private, max-age=0, must-revalidate` so each fetch re-authenticates with the server (revocation propagates immediately). Drive is never called at request time. The crew page emits URLs at render time using the current `shows.diagrams.snapshot_revision_id`; prior-revision URLs return 410 and naturally fall out of use.

   **Diagram garbage collection cron** (`30 * * * *`, hourly, offset to avoid collisions):
   - For each `(show_id)` in `shows`, list its `diagram-snapshots/shows/<show_id>/` prefix.
   - For each blob whose `r=<revision_id>` segment does NOT match the current `shows.diagrams.snapshot_revision_id`: it's an orphan from a prior revision.
   - Delete orphan blobs older than **7 days** (grace window for in-flight reads + forensic recovery). Suppress deletion if the current revision has `snapshot_status = 'partial_failure'` OR `snapshot_status = 'partial_failure_restage_required'` (round-46 amendment — both states leave the prior complete revision as the only consistent fallback while the current revision is intentionally incomplete; deleting prior-revision bytes would produce a user-visible asset-loss path. The terminal-restage variant is a stuck-waiting-for-sheet-edit state, NOT a recovered state, so GC suppression must extend to it for the same reason).
   - For shows whose row is `archived = true`: orphan deletion runs at 30 days instead of 7.
4. Linked-folder diagrams (older sheets where the DIAGRAMS tab carries `LINK` to an external Drive folder) populate `parseResult.diagrams.linkedFolder` instead.
5. A sheet may have both: e.g., a few embedded photos on the DIAGRAMS tab AND a linked folder for additional layouts. The UI in §10 renders both sources merged into one gallery in the Diagrams tile.

**Soft warnings (not hard fails):**

- `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE` — the API returned a description of an embedded image but the download URL 4xx'd (rare, but possible if the image was inserted via a service the service account can't read). The objectId is preserved with a flag and the gallery renders a placeholder slot.
- `DIAGRAMS_TAB_MISSING` — the sheet has no tab matching `DIAGRAMS` (case-insensitive, includes typo `DIagrams` per the schema-diff). `embeddedImages: []`. Linked-folder source still extracted from the markdown export if present.

No MI invariant gates destructive write on diagrams content because absence is normal (most fixtures don't have any embedded images at all).

**Cardinality cap:** the DIAGRAMS tab realistically holds ≤10 images per the FinTech Forum example. v1 caps `embeddedImages.length` at 60 to prevent an absurd sheet from blowing up storage; beyond 60, surface a `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` warning to admin and truncate.

#### 6.11.1 Apply-time reel drift re-verify (round-44 amendment: full immutable pin tuple)

The reel pin captured at Phase 1 carries the full immutable tuple `parseResult.openingReel = { driveFileId, drive_modified_time, headRevisionId }`. Apply MUST re-verify all three components before persisting into `shows.opening_reel_drive_file_id`, `shows.opening_reel_drive_modified_time`, AND `shows.opening_reel_head_revision_id` (round-44: column added to §4.1):

1. **Null reel staged** — if `parseResult.openingReel === null` → set ALL THREE `shows.opening_reel_*` columns to NULL atomically. No Drive call needed.
2. **Re-fetch under the lock** — if `parseResult.openingReel !== null`, call `files.get(parseResult.openingReel.driveFileId, fields='modifiedTime,trashed,headRevisionId,md5Checksum')`.
3. **Pinned-tuple comparison** — drift case if ANY of:
   - `trashed = true` OR file gone (404), OR
   - `current.headRevisionId !== staged.headRevisionId` (authoritative immutable check), OR
   - `current.modifiedTime !== staged.drive_modified_time` (defense-in-depth — revision check above is the primary fence).

   On drift: persist ALL THREE columns as NULL atomically (not just two), emit `REEL_DRIFTED` warning to `parse_warnings`, continue Phase 2. Crew page falls back to text-only opening_reel value; the asset route returns 410 if hit.
4. **Success path** — pin tuple matches: persist the full triple `(driveFileId, drive_modified_time, headRevisionId)` into the three columns atomically. The route at §7.3 (`/api/asset/reel/[show]`) streams bytes via `revisions.get(fileId, headRevisionId, alt='media')` on every request — `headRevisionId` is the immutable byte-fence, NOT modtime alone.

This guards the same class of bug the linked-folder revision-pin closes: an asset edited between stage and Apply must NEVER produce an "approved but immediately broken" state on the live page, AND the route must never serve drifted bytes against the approved revision pin.

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

**Compromise-event handler** (single place in middleware that handles `/show/<slug>/p` with a `t` search param). Runs inside the per-show advisory lock so a concurrent Apply can't collide. After verifying the JWT signature and parsing `(showId, name, tokenVersion)` from its claims, the handler routes on the comparison of `jwt.tokenVersion` against `crew_member_auth.current_token_version` for that `(show_id, name)`:

**Branch A — `jwt.tokenVersion === current_token_version` (leaked link IS the currently-active version).** The row must also be auto-rotated to "no live link" state — not just an exact-version revocation, because the admin UI's `Copy share link` would still surface this token until Doug manually rotated. In one transaction: insert the surgical `revoked_links` row at the exact `token_version` (idempotent `ON CONFLICT (show_id, crew_name, token_version) DO NOTHING`) with reason `leaked_via_query_string`, AND set `revoked_below_version = current_token_version` (no auto-mint of a fresh version — `current_token_version` and `max_issued_version` stay unchanged):
```sql
INSERT INTO revoked_links (show_id, crew_name, token_version, revoked_reason)
VALUES ($1, $2, $3, 'leaked_via_query_string')
ON CONFLICT (show_id, crew_name, token_version) DO NOTHING;

UPDATE crew_member_auth
   SET revoked_below_version = current_token_version
 WHERE show_id = $1 AND crew_name = $2;
```
The row enters the same "no live link" state defined in §5.2 — Doug must click "Issue new link" before any sharing affordance appears for that crew member. A SINGLE Issue-New-Link click then bumps both `current_token_version` and `max_issued_version` to `floor + 1`, immediately producing a usable token.

**Branch B — `jwt.tokenVersion < current_token_version` (leaked link is a stale historic version).** Insert ONLY the surgical `revoked_links` row at the exact `token_version` (idempotent `ON CONFLICT DO NOTHING`) with reason `leaked_via_query_string`. The current shareable version is unaffected; an older leak must NOT kick everyone off the live link. `crew_member_auth` columns remain unchanged in this branch.

**Branch C — `jwt.tokenVersion > current_token_version` (future-version leak; round-46+ amendment, locked by plan Task 5.6).** The carried JWT claims a version higher than the row knows about. Treat this as the same no-live-link state as Branch A but with the floor lifted to the future version, so a SINGLE manual "Issue new link" still fully recovers. In one transaction:
- Insert the surgical `revoked_links` row at the exact future `tokenVersion` (idempotent `ON CONFLICT DO NOTHING`) with reason `leaked_via_query_string`.
- Lift ALL THREE fields to `jwt.tokenVersion` in the same step: `current_token_version = jwt.tokenVersion`, `max_issued_version = jwt.tokenVersion`, `revoked_below_version = jwt.tokenVersion`.

After this transition, ONE manual "Issue new link" click bumps both `current_token_version` and `max_issued_version` to `jwt.tokenVersion + 1`, immediately producing a usable replacement (the new JWT carrying `tokenVersion = jwt.tokenVersion + 1` is `> revoked_below_version` AND `=== current_token_version`, so it passes both the floor check and the strict-equality check). Multi-click recovery would be a regression. An earlier draft only lifted `revoked_below_version` while leaving `current/max` unchanged, requiring multiple Issue-New-Link clicks to clear the floor — that was a real auth-lockout bug. Use the canonical `LEAKED_LINK_DETECTED` user copy — do NOT invent a `SUSPICIOUS_FUTURE_VERSION` code (operator-only future-version anomaly metadata belongs in the structured log payload, not the user-facing message catalog).

All three branches use the service-role DB client; the user is unauthenticated at this point. After the appropriate branch executes:

1. **Return 410 Gone** with the message: "This link format is no longer supported and the link has been revoked. Ask Doug for a new link." Do not redirect.
2. **Log a `LEAKED_LINK_DETECTED` warning** to `sync_log` (or a dedicated `security_events` table) so Eric sees it in admin. Include the branch taken (A / B / C) and, for Branch A or C, `auto_rotated_to_no_live_link: true` (Branch C also includes the lifted floor value) so admin can spot it.

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
7. **Resolve identity only** — produce `{ kind: 'crew', crewMemberId, showId }` for the cookie-mint step. Role is NOT derived in the redemption path; downstream `getShowForViewer` re-derives it from `crew_members.role_flags` on every call (§4.4 / Task 4.3).
8. Mint the cookie session (write `link_sessions`; emit `__Host-fxav_session`) and render.

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
  source_kind          text not null check (source_kind in ('cron', 'push', 'manual', 'onboarding_scan')),  -- which sync mode created this staging row
  wizard_session_id    uuid,                          -- ONLY non-NULL when source_kind = 'onboarding_scan'. Carries the app_settings.pending_wizard_session_id at staging time. Apply / Discard for these rows MUST CAS against current app_settings.pending_wizard_session_id; if mismatch, the wizard that created the row was superseded and the row is purged before any other action runs.
  warning_summary      text not null                -- human message shown in the admin "review and approve" UI
);
create index pending_syncs_wizard_session_idx on pending_syncs (wizard_session_id) where wizard_session_id is not null;
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
11. **Resolve identity only** — the validator returns `{ kind: 'success', viewer: { kind: 'crew', crewMemberId, showId } }`. Role is NOT derived here; downstream `getShowForViewer(showId, viewer)` re-derives it from `crew_members.role_flags` on every call (§4.4 / Task 4.3).
12. Render (after `getShowForViewer` returns its role-filtered payload — see §7.4).

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

**Implementation note:** all 12 steps are encapsulated in a single `lib/auth/validateLinkSession(req)` helper that returns a **tri-state outcome** (round-46+ amendment, locked by plan Task 5.2):

- `{ kind: 'success', viewer: { kind: 'crew'; crewMemberId; showId } }` — auth passes. **Identity-only payload (no `viewerRole`)**: per §4.4 / Task 4.3's locked contract, `getShowForViewer` re-derives role from `crew_members.role_flags` on every call; passing a pre-derived role from the validator would reopen the stale-role hole.
- `{ kind: 'continue', priorFailure?, clearCookie?: true }` — this branch doesn't apply or recovered cleanly; the caller's chain falls through to `validateGoogleSession` / `requireAdmin`. Steps 1-9 (cookie missing, session not found, expired, cross-show binding mismatch, removed crew, version mismatch, revoked, idle past TTL) produce `continue` with `clearCookie: true` AND DELETE the offending `link_sessions` row when one exists (steps 3-9 only — steps 1-2 have no row to delete).
- `{ kind: 'terminal_failure', status, code, message }` — only for genuinely unrecoverable cases (malformed cookie format, DB connection failure). Routes never short-circuit on a stale/wrong-show/revoked cookie; §7.3 explicitly authorizes via "Google session OR redeemed-link cookie OR admin," so a stale cookie shouldn't deny a user whose Google or admin session is valid.

Only steps 11-12 produce `kind: 'success'` (with the identity-only viewer payload above — no role). **The helper is the only correct way to authenticate a redeemed-link request; routes must never re-implement subsets.** It is called from every signed-link page route and any server action that mutates state on behalf of a redeemed user.

**Google-session authorization is structurally different and uses its own validator** (`lib/auth/validateGoogleSession(req)`):

1. Verify the Supabase Auth session is present and unexpired.
2. Look up `canonicalize(supabase.user.email)` against `crew_members.email` for the requested show. The DB column is already canonical per §4.1.1, so the comparison is exact-match on canonical form. If no match → 403 with "your email isn't on the crew list for this show." **If multi-match → 500 with `AMBIGUOUS_EMAIL_BINDING`** (this should be impossible because of the `crew_members_show_email_unique` partial index plus MI-5b, but the validator must explicitly reject rather than pick a row to defend against any future schema regression). The notification path is concrete (see §4.6 below): the validator INSERTs into `admin_alerts` keyed on `(show_id, code)` with the colliding crew rows captured in `context` JSONB. The dashboard renders any unresolved `admin_alerts` row as a top-bar critical banner that cannot be dismissed without clicking through to the affected show.
3. **Removal is the only revocation primitive for Google sessions.** When Doug removes a crew member from the sheet, sync's `delete-not-in-set` step removes the `crew_members` row, which causes step 2 to fail on the user's next request. There is no separate "revoke Google login" affordance.
4. **Resolve identity only** — return `{ kind: 'success', viewer: { kind: 'crew', crewMemberId, showId } }`. Role is NOT derived here; downstream `getShowForViewer(showId, viewer)` re-derives it from `crew_members.role_flags` on every call (§4.4 / Task 4.3).
5. Render (after `getShowForViewer` returns its role-filtered payload — see §7.4).

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
| `/show/<slug>` | signed-in (Google session) OR redeemed-link session cookie (`__Host-fxav_session`) OR admin | Crew page. **No token-bearing form on this route** — `?t=`/fragment-bearing entrypoints live exclusively at `/show/<slug>/p` per §7.2. |
| `/show/<slug>/p#t=<jwt>` | valid JWT (from fragment) + current matching `crew_members` row + tokenVersion match + not in `revoked_links` | Crew page via signed link. JWT lives in URL fragment only; immediately exchanged for an HTTP-only session cookie via `/api/auth/redeem-link` (§7.2). The JWT alone is insufficient. |
| `/api/auth/redeem-link` | POST with JWT in body | Per-request authz flow (§7.2). On success: sets `__Host-fxav_session` cookie + writes `link_sessions` row. |
| `/api/asset/diagram/<show-slug>/r=<revision_id>/<assetKey>` | signed-in OR valid signed-link cookie OR admin (per §7.2 / §7.2.2 / Google validator); show match enforced server-side | Streams snapshotted diagram-image bytes from the private `diagram-snapshots` Storage bucket. **The URL is revision-versioned** — every Apply mints a fresh `snapshot_revision_id` and the rendered crew page emits URLs with the current revision. `<assetKey>` is `objectId` (embedded — resolved via the entry's `sheetsRevisionId`/`embeddedFingerprint` pair per round-44 §6.11) or `driveFileId` (linked-folder — resolved via `headRevisionId`/`md5Checksum` pair per round-44); the route resolves the matching `snapshotPath` AND verifies the URL's revision_id matches `shows.diagrams.snapshot_revision_id` (mismatch → 410). **Every request re-runs the show-auth check.** **Cache header `Cache-Control: private, max-age=0, must-revalidate`** — the browser MUST revalidate with the server on every use. Long-lived freshness on auth-gated assets would let a revoked session keep displaying already-fetched diagrams from local browser cache for the cache lifetime; `must-revalidate` forces an authenticated round-trip every time. Server-side: a successful revalidation with matching auth+revision returns the bytes again (Storage read is cheap and the bytes themselves are immutable per revision); a revoked session gets 410. Drive is NEVER called at request time. |
| `/api/asset/reel/<show-slug>` | Same auth requirements as `/api/asset/diagram/...`: signed-in OR valid signed-link cookie OR admin; show match enforced server-side | Streams the opening-reel video. **Same auth + cache contract as the diagram route** — every request re-runs show-auth; `Cache-Control: private, max-age=0, must-revalidate` so revocation propagates immediately. **Round-44 amendment: revision-pinned byte streaming.** The route reads `shows.opening_reel_drive_file_id`, `shows.opening_reel_drive_modified_time`, AND `shows.opening_reel_head_revision_id` (all three columns per §4.1). If any of the three is NULL → 410 (single contract for both NULL and drift). Else: live drift gate via `files.get(reelFileId, fields='modifiedTime,trashed,headRevisionId,md5Checksum')` on every request — if `trashed=true` OR `current.headRevisionId !== shows.opening_reel_head_revision_id` OR `current.modifiedTime !== shows.opening_reel_drive_modified_time` → 410. Streaming path: Pattern A (preferred) `revisions.get(reelFileId, headRevisionId, alt='media')` — exact revision bytes. Pattern B (fallback when Pattern A unavailable for the mimeType) `files.get(alt='media')` then **buffer the full body and recompute md5 against `current.md5Checksum` BEFORE serving any bytes** — comparing headRevisionId before stream is insufficient because Drive can mutate mid-stream; buffer-then-verify is mandatory. v1 doesn't snapshot reel bytes into Storage (large videos, rarely edited per show); the immutable revision pin + buffer-then-verify guarantee crew see only the bytes Doug approved at the last Apply. v2 candidate: snapshot reels into Storage if the live path becomes operationally noisy. |
| `/admin` | admin role | Doug/Eric only. |
| `/admin/show/<slug>` | admin role | Per-show parse panel + impersonation entry points. |
| `/admin/show/<slug>/preview/<crew-id>` | admin role | Renders the crew page exactly as that person would see it. Sticky banner. |

### 7.4 Role-based field hiding

Server-side, in the data layer. **Role is always derived fresh from the current `crew_members.role_flags`, never from a token claim.**

- The matched `crew_members` row has `LEAD` in `role_flags`, OR the viewer is admin → `viewerRole === 'lead'`. The data fetcher joins `shows_internal` and includes `financials` in the response.
- Otherwise: the data fetcher does not query `shows_internal` at all; `financials` is absent from the response by construction. **`shows.coi_status` is in the response for every crew viewer regardless of role**, because it's operational status (per §4.4). RLS on `shows_internal` (admin-only) is the second line of defense in case the fetcher is wrong; physical separation per §4.4 is the third.

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
- **Show status tile** — visible to every crew viewer. Carries `shows.coi_status`, dress code, venue notes, and other always-public operational signals. COI lives here, not in Financials, because it's ops, not billing (§4.4).
- **Financials tile** — LEAD only. PO#, Proposal, Invoice, Invoice Notes from `shows_internal.financials`. Hidden entirely for non-LEAD (omitted from data fetch per §7.4 — the JSONB column isn't even queried for them).
- **Pack list tile** — visible to every crew viewer **on set day, strike day, and the travel-out day** when `shows.pull_sheet IS NOT NULL`. Hidden on show days (techs are running the show, not packing). Hidden entirely for shows whose sheet has no PULL SHEET tab. Per-day visibility further filtered by viewer's `stage_restriction` per §6.6: a crew member with `stage_restriction.kind === 'explicit'` and `stages = ["Load In", "Set"]` sees the tile only on set day; with `stages = ["Load Out", "Strike"]` only on strike (and travel-out if their schedule includes it). Unrestricted crew (`stage_restriction.kind === 'none'`) see it on every set/strike/travel-out day. Renders cases in `pull_sheet[]` order; "Show more" disclosure beyond 12 cases. Each case's items render in source order.
- **Notes tile** — any block-level `notes` content, aggregated into a single "Things to know" card.

**Footer:**
- `Last updated <relative time> · live from sheet`
- `Something looks wrong?` link — opens the report dialog (§13.1 surface 4 for crew, §13.1 surface 1-3 for admin views). Both go to the same `/api/report` endpoint with the appropriate body template (§13.2).

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

After verification, the wizard calls `runOnboardingScan(folderId, wizardSessionId)` (§5.2) which performs a folder-wide scan against the supplied folder ID **without** writing to `app_settings.watched_folder_id` yet. **Round-48 amendment: the scan populates the `onboarding_scan_manifest` table (§4.5)** — one row per Drive item the scan saw, keyed by `(wizard_session_id, drive_file_id)`, with a terminal-lifecycle `status` enum. Step 3 reads from the manifest as the authoritative per-session state source. Per-sheet status:

- **Parsed and ready** (`status='staged'`) — green check; click to review and approve (every first-seen sheet stages — Doug always reviews a first-time parse before it goes live).
- **Couldn't parse** (`status='hard_failed'`) — yellow warning with the plain-English MI failure; click to see details.
- **Skipped (not a Google Sheet)** (`status='skipped_non_sheet'`) — gray badge; informational only, auto-resolved.

Doug walks each sheet through review. Action endpoints transition the manifest row to a terminal state: Apply → `applied`; Discard `try again next sync` → `discard_retryable` (NOT resolved per §6.8.1); Discard `defer_until_modified` → `defer_until_modified`; Discard `permanent_ignore` → `permanent_ignore`; pending_ingestions Retry → resets to `staged` or stays `hard_failed`; pending_ingestions Defer/Ignore → corresponding terminal status.

**Wizard finalize (§4.5 atomic promotion)** reads the manifest's unresolved set:
```sql
SELECT drive_file_id, status FROM onboarding_scan_manifest
 WHERE wizard_session_id = $sessionId
   AND status IN ('staged', 'hard_failed', 'discard_retryable');
```
If the unresolved set is non-empty → `ONBOARDING_NOT_RESOLVED` 409. If empty → run the §4.5 atomic promotion CAS, then `subscribeToWatchedFolder(folderId)`. The manifest is the SOLE finalize gate — row absence in `pending_*` tables is NOT a substitute (the `discard_retryable` Discard variant deletes pending_syncs with no deferral row, which row-absence inference would silently treat as resolved).

**Wizard-session CAS on every scan write.** Every UPSERT into `pending_syncs`, `pending_ingestions`, AND `onboarding_scan_manifest` is gated by `WHERE EXISTS (SELECT 1 FROM app_settings WHERE pending_wizard_session_id = $myWizardSessionId)` so a slow W1 scan whose start preceded W2's takeover cannot clobber W2's freshly-staged rows. On supersession, W1 logs `WIZARD_SESSION_SUPERSEDED_DURING_SCAN` and exits cleanly.

**After onboarding.** "Re-run Setup" from `/admin/settings` writes a fresh `pending_wizard_session_id` (without touching `watched_folder_id`); cron continues using the live folder while the new wizard runs. Wizard supersession purges prior-session rows across all three onboarding surfaces (`pending_syncs`, `pending_ingestions`, `onboarding_scan_manifest`).

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

### 9.1.1 Existing-show staged-review surface

Any existing show with a matching `pending_syncs` row (i.e., a re-stage of an already-live show; not a first-seen) appears with a **distinct status badge in the dashboard's Active Shows panel** — not in the "Sheets we couldn't auto-apply" panel (which is for first-seen). The active-shows row's status badge becomes "⚠ Review staged changes" (yellow), the "Last sync" cell shows the staged_modified_time + the count of triggered review items, and the row's primary action becomes "Review staged changes" linking directly to `/admin/show/<slug>?review=staged_id` (the review surface inside the per-show parse panel — see §9.2 below).

A show in re-stage state continues to render its prior approved snapshot to crew (per §5.2 Phase 1 outcome 2: re-stage updates `last_sync_status` to `pending_review` but doesn't touch the live data). The dashboard makes this state findable so it cannot sit indefinitely.

**Both first-seen and re-stage queues are durable**: first-seen `pending_syncs` rows live in the dashboard's "Sheets we couldn't auto-apply" panel; re-stage `pending_syncs` rows live in the Active Shows panel as "Review staged changes." A staged row never disappears without an Apply or Discard action.

### 9.2 `/admin/show/<slug>` — per-show parse panel

Four sub-sections (the first appears only when a `pending_syncs` row exists for this show):

0. **Staged review (when `pending_syncs.drive_file_id = shows.drive_file_id` exists)** — appears at the top of the panel as a yellow "Action required" card. Lists every `triggered_review_items[]` entry with its plain-language description (looked up via §12.4 codes), the staged Apply/Discard pair of buttons, and the diff between prior and incoming for each affected section (crew, hotels, rooms, etc.). Apply submits the §6.8.2 reviewer-choices payload; Discard runs §6.8.1's restore-prior-status flow. The card also surfaces `staged_modified_time` ("staged from edits Doug made on …") so admin knows what version they're approving. While this card is present, the §9.2 1–3 sub-sections render below as informational context. Re-stage of an existing show is the canonical path through this surface; first-seen review uses the same UI shape but reached via the dashboard's "Sheets we couldn't auto-apply" panel.

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

For **dev mode** (Eric operating): Eric authenticates the dev-environment Drive client with his own OAuth credentials so that a folder shared with Eric works without provisioning a separate service account. Production swaps to a service-account credential file (`GOOGLE_SERVICE_ACCOUNT_JSON`) and Doug shares the watched folder with that service-account email. The dev/prod switch is a single env-var swap; the underlying client library and per-folder permissioning model are identical.

---

## 10. Linked Drive content

Per §2 deferral list, agenda PDF parsing is out. But linked content is rendered with discretion:

| Link kind | Source field | v1 rendering |
|---|---|---|
| Agenda PDF (`.pdf`, `.docx`) | `agenda_links[].fileId` or `.url` | "Open agenda" button. On tap: in-page sheet with PDF.js inline preview (or `<iframe>` for native Drive preview as fallback). `.docx` falls back to "Open in Drive" (no inline preview). |
| Diagrams (linked folder OR embedded images OR both) | `diagrams.linkedFolder.driveFolderId` and/or `diagrams.embeddedImages[]` and/or `diagrams.linkedFolderItems[]` | "Diagrams" tile. On tap: full-screen image gallery (swipeable). **Both sources go through the same snapshot/proxy path** — no live-Drive read at request time. **Round-44 amendment: linked-folder enumeration is FROZEN at Phase 1 with the immutable approval tuple** (per §6.11): `parseResult.diagrams.linkedFolderItems[]` captures `(driveFileId, mimeType, alt, drive_modified_time, headRevisionId, md5Checksum)` per item. Apply downloads via `revisions.get(driveFileId, headRevisionId, alt='media')` (Pattern A — exact bytes) or via `alt=media` + buffer-then-verify md5 (Pattern B fallback); modtime alone is NOT a fence (TOCTOU window). Apply does NOT re-enumerate the folder. Embedded entries carry `sheetsRevisionId` + `embeddedFingerprint`; entries with `embeddedFingerprint = null` are restage-only and Apply fails closed for them. Each downloaded blob lands at `diagram-snapshots/shows/<show_id>/r=<snapshot_revision_id>/folder-<driveFileId>.<ext>` with the resolved path stored in the row. Embedded images carry `sourceFolder: "embedded"`; linked items carry `sourceFolder: "linked"`. Gallery serves every image through `/api/asset/diagram/<show>/r=<rev>/<assetKey>` per §7.3. See §6.11 for the full snapshotting + immutable-pin model. |
| Opening reel video | `event_details.opening_reel` (free-text status; rendered as-is) plus the parser's structured Phase 1 output `parseResult.openingReel = { driveFileId, drive_modified_time, headRevisionId } | null` (round-44 amendment: full immutable pin tuple) populated from the same cell when a Drive URL is detected | **URL extraction is a substring match**, not start-anchored: the parser uses `/(https?:\/\/)?(drive\.google\.com|docs\.google\.com)\/[^\s]+/` (no `^` anchor) to find a Drive URL anywhere in the cell value, including mixed-value cells like `YES - https://drive.google.com/file/d/...` and `LOOP VIDEO - <url>`. If matched, the parser extracts the Drive `fileId` from the URL path. The sync layer then enriches via `files.get(fileId, fields='modifiedTime,headRevisionId,md5Checksum')` at Phase 1 stage time, emitting `parseResult.openingReel = { driveFileId, drive_modified_time, headRevisionId }`. **At Apply time, §6.11.1's full four-step flow re-verifies the reel drift via `headRevisionId` and persists ALL THREE columns** (`shows.opening_reel_drive_file_id`, `shows.opening_reel_drive_modified_time`, `shows.opening_reel_head_revision_id`). If the cell is text-only (`MAYBE`, `YES`, `N/A`, etc.) or has no Drive URL substring, `parseResult.openingReel = null` and all three columns are set to NULL. The crew page renders inline `<video controls>` proxied via `/api/asset/reel/<show>` (which streams via `revisions.get(headRevisionId, alt='media')` or buffer-then-verify md5 per §7.3) when the columns are non-NULL, and a small text line ("Opening reel: <value>") otherwise. Mixed values like `YES - <url>` get both: the text status from the cell value AND the embedded `<video>` because the substring extractor populates the columns. |
| Test pattern, Aptos fonts, II LED logo | various | NOT surfaced to crew. These are operations files. They appear in admin under a "Production assets" disclosure. |

**Caching strategy** (revision-aware end-to-end so Apply invalidates implicitly via URL rotation):
- Diagram lists are derived from `shows.diagrams.{embeddedImages,linkedFolderItems}` — read straight from Postgres on every request, no list-level caching layer. List size is small (typically ≤10 items) so DB reads are cheap.
- Individual diagram images are served via revision-versioned URLs (`/api/asset/diagram/<show>/r=<rev>/<key>`). Every fetch revalidates with the server (`Cache-Control: private, max-age=0, must-revalidate`); the URL identifies which revision is requested but the auth check runs every time. Revisioning solves stale-bytes-after-Apply (URL rotates); `must-revalidate` solves immediate-revocation-on-session-end (revoked sessions can't reuse cached responses without a server check that returns 410).
- Opening reel videos are streamed through `/api/asset/reel/<show>` (per §7.3 routing) with the same `Cache-Control: private, max-age=0, must-revalidate` policy as diagrams. v1 doesn't snapshot reels into Storage (they aren't typically edited per show) — but the auth contract matches diagrams: every request re-runs auth, revocation propagates immediately.
- **No manual cache-purge is required** on Apply because every Apply rotates the URL space. The diagram GC cron (§6.11) is the only cleanup; it removes orphaned revision blobs after the 7-day grace window.

**Caps on unbounded content:**
- **Diagrams gallery:** up to 12 images shown in initial render (embedded images prioritized, linked-folder images filling the remainder); "Show more" reveals the rest. The combined cap across BOTH sources is 60: embedded counts toward the cap first; if `embeddedImages.length >= 60` the linked-folder content is suppressed entirely and a `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` admin warning fires. Otherwise the linked folder fills up to `60 - embeddedImages.length` images per the existing folder-cap rules.
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
| **No version marker matches** | Parser emits `MI-1_VERSION_DETECTION_FAILED` and the run hard-fails per MI-1 (§6.8). The prior-snapshot data is retained on the live page (or, for first-seen sheets, the failure surfaces in `pending_ingestions`). **There is no permissive v1-fallback render** — earlier rounds of this spec described one, but it conflicts with MI-1's hard-fail contract and could push partial / incorrect data into the live snapshot. Hard-fail is the single contract: don't trust an unrecognized template. Doug's parse panel surfaces this as a hard-to-miss banner with the exact markers the parser was looking for. |
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
- **`helpfulContext` (M9+M10 batch-8 amendment)**: every code with non-null `dougFacing` ALSO has a non-null `helpfulContext` — a one-paragraph plain-language explanation rendered by the §9.0.1 "What does this mean?" link. The catalog implementation (M9 Task 9.4) carries `helpfulContext` as a fourth column alongside `dougFacing` / `crewFacing` / `followUp`; the table below currently shows only the four legacy columns to keep it readable. The plan (M9+M10 batch-8 Fix 4) populates `helpfulContext` for every dougFacing-non-null row when implementing the catalog. Codes whose `dougFacing` is `—` / null don't need `helpfulContext` because they're admin-log-only and never surface to Doug.

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
| `AMBIGUOUS_EMAIL_BINDING` | multi-match (should be impossible per MI-5b + partial unique index) | "Two crew rows share the same email — Google login is unsafe to resolve. The duplicate-email check normally catches this; please re-share the sheet so we can re-parse, or contact the developer." | "Something is misconfigured for this show. Doug has been notified." | Doug → fix sheet duplicate; if persistent, Eric |
| `SESSION_IDLE_TIMEOUT` | cookie session past 15-min idle window | — | "Your session timed out. Open the original link Doug shared again." | Crew → reopen link |
| `SESSION_ABSOLUTE_TIMEOUT` | cookie session past 12h absolute | — | "Time to refresh — open the original link Doug shared again." | Crew → reopen link |
| **Sync — Drive errors** | | | | |
| `DRIVE_FETCH_FAILED` | `files.export` / content fetch errors | "We couldn't fetch this sheet from Google Drive. Could be a transient network issue, or the sheet's been moved or unshared. We'll keep retrying. If this stays for more than an hour, click 'Retry' or check the sheet's share settings." | "We couldn't get the latest from Doug's sheet. Showing what we had at *<time>*." | Doug → check share / Retry |
<!-- spec-id: section-12-4-row-sheet-unavailable-removed-from-folder -->
| `SHEET_UNAVAILABLE` | sheet detected as removed from watched folder | "*<sheet-name>* isn't in your folder anymore. Either you moved/unshared it, or it was deleted. Re-share it to bring the show back." | "We couldn't get the latest from Doug's sheet. Showing what we had at *<time>*." | Doug → re-share sheet |
<!-- This row is the canonical SHEET_UNAVAILABLE entry. The crew copy uses `<time>` interpolation; the Doug copy targets the "you moved/unshared it" scenario. The other row at line ~1965 was an earlier round-44 amendment with stale-footer-specific copy and has been retired in favor of this canonical entry. Round-46: see X.1 dedup invariant. -->
| `PARSE_ERROR_LAST_GOOD` | M9+M10 batch-8: stale-data footer surfacing `shows.last_sync_status='parse_error'` on an existing approved show. The §5.2 Phase-1 hard-fail path sets this status when the latest sheet edit can't parse but the prior approved snapshot is still rendering to crew. Distinct from the parser hard-fail codes (`MI-1`/`MI-2`/etc.) which are admin-facing parse-panel detail; this code is the crew-facing "what you see is older than the latest edit" footer message. Doug-facing copy is admin's heads-up; per-show parse panel still surfaces the underlying MI-* code with full detail. | "*<sheet-name>*'s latest edit didn't parse. The previous approved version is still showing to crew. See the per-show parse panel for the error detail." | "We couldn't read the latest edit to Doug's sheet. Showing what we had at *<time>*." | Doug → fix sheet (see parse panel); Crew → mention to Doug |

| `STALE_WRITE_ABORTED` | conditional cron UPDATE matched 0 rows | (admin log only — informational) | — | none |
| `STALE_MANUAL_REPLAY_ABORTED` | manual sync UPDATE rejected (newer version exists) | "This manual sync is stale — a newer parse has already been applied. Refresh the page to see the current state." | — | Doug → refresh admin |
| `STALE_PUSH_ABORTED` | push-mode sync UPDATE rejected (newer version exists) | (admin log only — push raced with cron, normal under load) | — | none |
| `WIZARD_SESSION_SUPERSEDED` | Apply or Discard against an onboarding-staged row whose wizard session is no longer current | "Your setup wizard was superseded by another wizard. Refresh and start setup again." | — | Doug → restart wizard |
| `IDEMPOTENCY_IN_FLIGHT` | duplicate `/api/report` submission with same idempotency_key while the original is still mid-call to GitHub | "Hold on — your previous report is still being submitted. Try again in a moment if it doesn't go through." | "Hold on — give it a sec." | client retries after backoff |
| `WATCH_CHANNEL_ORPHANED` | Drive watch row created but Drive's `files.watch` returned an error or timed out | (admin_alerts banner) "A push subscription couldn't be confirmed. We'll fall back to cron until it's resolved." | — | Eric → reconcile / retry |
| `WEBHOOK_TOKEN_INVALID` | Drive push webhook arrived with a wrong token | "A push notification from Google Drive failed verification — possible spoofing or misconfiguration. The developer has been notified." (admin_alerts top-bar banner) | — | Eric → investigate |
| `WEBHOOK_NOOP_ALREADY_SYNCED` | Drive push delivered for a file already up-to-date | (admin log only) | — | none |
| ~~`WATCH_CHANNEL_CREATE_FAILED`~~ | Retired by round-44 normalization. All Drive `files.watch` create/confirm failures use `WATCH_CHANNEL_ORPHANED` (single canonical code). | — | — | — |
| `CONCURRENT_SYNC_SKIPPED` | advisory lock not acquired | (admin log only) | — | none |
| `STAGED_PARSE_OUTDATED` | Drive `modifiedTime` advanced past staged version (non-onboarding source) | "The sheet was edited again since you reviewed this parse. We've discarded the staged version; a fresh parse will be ready in a few minutes." | — | Doug → wait, review next |
| `STAGED_PARSE_SOURCE_GONE` | Apply re-verify found the source sheet has been deleted, unshared, or trashed | "The source sheet is no longer accessible. The staged parse has been discarded. Re-share or restore the sheet to bring this show back." | — | Doug → restore sheet |
| `STAGED_PARSE_SOURCE_OUT_OF_SCOPE` | Apply re-verify found the source sheet's `parents` no longer includes the watched folder | "The sheet is no longer in the watched folder. We've discarded the staged parse. Move the sheet back into the folder if you want to publish it." | — | Doug → move sheet |
| `LINKED_ASSET_DRIFTED` | a linked-folder image's current Drive `headRevisionId` (and/or `md5Checksum`) differs from the immutable approval tuple pinned at stage; bytes were NOT downloaded (round-44/48: the revision/checksum pair is the authoritative byte-fence per §6.11; `modifiedTime` alone has a TOCTOU window). | "*<sheet-name>*: a linked-folder diagram has been edited in Drive since the last review. Crew see a placeholder for that image until your next sheet edit re-stages it." | — | Doug → re-edit sheet to re-stage |
| `REEL_DRIFTED` | opening-reel `headRevisionId` (and/or `md5Checksum`) differs at Apply time from the immutable pin tuple captured at stage; ALL THREE persisted reel columns set to NULL atomically per §6.11.1 (round-44/48: the revision pin is the authoritative byte-fence; `modifiedTime` is informational only). | "*<sheet-name>*: the opening-reel video has been edited since you reviewed this parse. Crew see the text status only until your next sheet edit re-stages the new reel." | — | Doug → re-edit sheet |
| `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` | round-48: an embedded image entry has `embeddedFingerprint = null` (the Sheets API didn't supply a content-derived approval token at extraction time), so `asset_recovery` cannot heal it. The show transitions to `partial_failure_restage_required` terminal status; only a fresh sheet edit can mint a new `sheetsRevisionId` + `embeddedFingerprint` and unblock the recovery. | "*<sheet-name>*: a diagram in your sheet can't be re-downloaded automatically. Save the sheet (any edit advances the version) and crew will see the image again on the next sync." | — | Doug → save sheet to advance version |
| `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE` | round-48: `drive.revisions.list(spreadsheetId)` returned no usable revision token for the spreadsheet, so the embedded-image freeze tuple cannot be captured (rare; happens for files created via APIs that don't track Drive revisions). For first-seen sheets this is a Phase 1 hard-fail recorded in `pending_ingestions.last_error_code`; for existing shows with prior approved diagrams it's a Phase 1 stage-for-approval review item; for existing shows with no prior diagrams it's a status-only `drive_error` UPDATE. The prior approved diagrams are NEVER replaced with an empty gallery. | "*<sheet-name>*'s diagrams couldn't be safely captured this sync. The previous version of those images is still showing. The developer has been notified." | — | Eric → investigate; Doug → optionally Report |
| `STAGED_PARSE_RESTAGED_INLINE` | onboarding stage was outdated; rescanned inline within the wizard session | "The sheet was edited since your last look — we re-parsed it inside the wizard. Here's the new review." | — | Doug → review the refreshed parse |
| `STAGED_PARSE_SUPERSEDED` | a newer cron parse committed before Apply | "A newer parse has already been applied. Refresh the admin page to review the latest state." | — | Doug → refresh |
| **Parser — hard fails (MI-1..MI-5b)** | | | | |
| `MI-1_VERSION_DETECTION_FAILED` | no template version markers match | "*<sheet-name>* doesn't look like your usual show template — none of the version markers we expect (Contact Office row, MAIN/SECONDARY block, GEAR INVENTORY block) are present. Either this is a different kind of document, or your template has changed in a way we don't recognize. Tell the developer if your template has changed." | — | Doug → check sheet shape; Eric → add v5 detector if real |
| `MI-2_TITLE_MISSING` | `show.title` empty/null | "*<sheet-name>* doesn't have a recognizable show title. Add or fix the CLIENT row." | — | Doug → fix sheet |
| `MI-3_NO_PARSEABLE_DATE` | no travel/set/show date parses | "*<sheet-name>* doesn't have any readable dates — we couldn't find Travel In, Set Day, or Show Day 1 as a parseable date. Check the DATES block." | — | Doug → fix sheet |
| `MI-4_NO_CREW` | parsed `crewMembers.length === 0` | "*<sheet-name>* has no crew rows. Add at least one person to the CREW block." | — | Doug → fix sheet |
| `MI-5_NO_ROOMS` | no GS / breakout / additional rooms | "*<sheet-name>* has no rooms — we couldn't find General Session, Breakouts, or Additional Rooms. Make sure your room blocks have setup and time fields filled in." | — | Doug → fix sheet |
| `MI-5a_DUPLICATE_CREW_NAME` | two crew rows share a name | "Two crew rows share the same name in *<sheet-name>*. Disambiguate them (e.g., 'John C.' vs 'John Carleo') so the app can tell them apart." | — | Doug → fix sheet |
| `MI-5b_DUPLICATE_CREW_EMAIL` | two crew rows share a non-null email | "Two crew rows share the same email in *<sheet-name>*. Each crew member needs their own email." | — | Doug → fix sheet |
| `SLUG_COLLISION_LIMIT` | slug derivation reached `-99` collision suffix without finding a free slug | "We couldn't generate a unique URL for *<sheet-name>* — there are too many shows with very similar titles and dates. The developer has been notified." (admin-only; very unlikely in practice — implies a parser bug) | — | Eric → investigate |
| `NO_FOLDER_CONFIGURED` | cron run before §9.0 onboarding wizard sets `app_settings.watched_folder_id` | (admin-log only on first occurrence; the dashboard explicitly shows the onboarding wizard CTA when no folder is configured, not an error) | — | Doug → run setup wizard |
| **Parser — stage-for-approval (MI-6..MI-14)** | | | | |
| `MI-6_CREW_SHRINKAGE` | crew count dropped > 1 | "Heads-up: *<sheet-name>* now has *<N>* crew rows (was *<M>*). Review the changes before applying." | — | Doug → review staged |
| `MI-7_SECTION_SHRINKAGE` | hotel/room/contact count dropped > 50% | "*<sheet-name>* lost more than half of its *<section>* — *<prior_count>* before, *<new_count>* now. Review before applying." | — | Doug → review staged |
| `MI-7b_KEYED_PRESERVATION` | a keyed entry (hotel ordinal, room name, contact) disappeared | "*<sheet-name>*: *<entry>* is no longer in the sheet. Review before applying." | — | Doug → review staged |
| `MI-8_FINANCIAL_FIELD_COLLAPSE` | financial field or COI changed from non-empty to empty | "*<sheet-name>*: *<field>* (e.g., PO#, Proposal, COI) was filled in before and is now blank. Confirm this was intentional." | — | Doug → review staged |
| `MI-9_ROLE_FLAGS_DELTA` | crew member's role_flags changed | "*<crew-name>*'s role changed from *<prior>* to *<new>*. This affects what they see on their page. Confirm before applying." | — | Doug → review staged |
| `MI-11_EMAIL_CHANGE` | crew member's email changed | "*<crew-name>*'s email is changing from *<prior>* to *<new>*. After applying, the new email will get sign-in access; their existing share-link will stop working until you Issue a new one." | — | Doug → review staged |
| `MI-12_PROBABLE_RENAME` | remove+add with matching email | "Looks like *<old-name>* was renamed to *<new-name>* (same email). Approve the rename, or treat as two unrelated changes." | — | Doug → review staged |
| `MI-13_NAME_AND_EMAIL_CHANGE` | remove+add with both differing | "Both name and email changed in *<sheet-name>*: *<old-pair>* and *<new-pair>*. Are these the same person, or unrelated changes?" | — | Doug → review staged |
| `MI-14_NO_EMAIL_RENAME` | remove+add with both null emails | "Looks like *<old-name>* was renamed to *<new-name>* (no emails to compare). Approve the rename, or treat as two unrelated changes." | — | Doug → review staged |
| `FIRST_SEEN_REVIEW` | first-time-seen sheet (per §5.2) | "*<sheet-name>* is new — review the parse before crew see it." | — | Doug → review and approve |
| `ONBOARDING_SCAN_REVIEW` | sheet found by the onboarding wizard's folder scan (per §5.2 mode `onboarding_scan`) | "*<sheet-name>* was found in your folder — review the parse before activating this folder." | — | Doug → review (within wizard) |
| **Parser — soft warnings** | | | | |
| `UNKNOWN_FIELD` | unrecognized row/column in `raw_unrecognized` | "We saw a row called *<key>* in *<sheet-name>* that we don't know how to handle. It's not breaking anything; want to flag it to the developer?" | — | Doug → optional Report |
| `UNKNOWN_DAY_RESTRICTION` | crew has `***` flag with no day list | "*<crew-name>* is flagged as day-restricted (`***` in the role) but the sheet doesn't say which days. Add a parenthetical to their name like `(6/24 and 6/26 ONLY)`. Until you do, their schedule will show 'days unconfirmed.'" | — | Doug → fix sheet |
| `UNKNOWN_ROLE_TOKEN` | role token not in canonical set | "*<crew-name>*'s role contains *<token>* which we don't know. We're ignoring it. Tell the developer if this is a real new role you're using." | — | Doug → optional Report |
| `PULL_SHEET_PARSE_PARTIAL` | one or more pull-sheet rows had unparseable QTY/category | "We couldn't fully parse *<N>* row(s) in *<sheet-name>*'s PULL SHEET. They render as the raw text from the sheet. Tell the developer if you'd like us to handle that format." | — | Doug → optional Report |
| `PULL_SHEET_AMBIGUOUS_FORMAT` | pull-sheet block detected but column headers don't match expected format | "*<sheet-name>*'s PULL SHEET has columns we don't recognize. The whole block renders as raw text on crew pages. Tell the developer if you'd like us to handle that format." | — | Doug → optional Report |
| `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE` | DIAGRAMS-tab embedded image found but download URL 4xx | "*<sheet-name>*: an image embedded in the DIAGRAMS tab couldn't be downloaded. Crew see a placeholder where it should be. Re-paste the image, or tell the developer if this keeps happening." | — | Doug → optionally fix |
| `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` | DIAGRAMS-tab has > 60 floating images | (admin log only) "*<sheet-name>*'s DIAGRAMS tab has more than 60 images — only the first 60 will be shown to crew." | — | Doug → optionally trim |
| `DIAGRAMS_TAB_MISSING` | sheet has no tab named DIAGRAMS (case-insensitive incl. typo `DIagrams`) | (admin log only — informational; many sheets legitimately don't have a DIAGRAMS tab) | — | none |
| `TYPO_NORMALIZED` | recognized typo (Hotal, DIagrams, Virtaul) silently corrected | (admin log only — informational; Doug doesn't need to act) | — | none |
| `UNEXPECTED_PARENT` | Drive file's `parents` doesn't include watched folder | (admin log only) | — | none |
| **Reviewer / Approval flow** | | | | |
| `MISSING_REVIEWER_CHOICE` | Apply submission missing a choice for a triggered item | "We need your decision for every item — looks like one was skipped. Refresh and try again." | — | Doug → refresh admin |
| `EXTRA_REVIEWER_CHOICE` | Apply submission carries a choice not in `triggered_review_items` | "Something doesn't match between what you reviewed and what we have on file. Refresh and try again." | — | Doug → refresh admin |
| `DUPLICATE_REVIEWER_CHOICE` | submission has two choices for the same item_id | "We got the same decision twice for one item. Refresh and try again." | — | Doug → refresh admin |
| `INVALID_REVIEWER_ACTION` | `action` value not in the invariant's enum | "That action isn't valid for this item. Refresh and try again." | — | Doug → refresh admin |
| **Bug reporting** | | | | |
| `REPORT_RATE_LIMITED_ADMIN` | admin report API exceeded 10/hr | "You've reported a lot already this hour — give the developer a beat to catch up. Try again in *<minutes>* min, or message Eric directly." | — | Doug → wait or message |
| `REPORT_RATE_LIMITED_CREW` | crew report API exceeded 3/hr/crew | — | "We've already heard from you a few times — give the developer a moment to look. Or message Doug directly for show-content questions." | Crew → wait or text Doug |
| **Onboarding** | | | | |
| `ONBOARDING_FOLDER_INVALID_URL` | wizard step 2 URL malformed | "That doesn't look like a Google Drive folder URL. It should look like `https://drive.google.com/drive/folders/...`." | — | Doug → re-paste URL |
| `ONBOARDING_FOLDER_NOT_SHARED` | wizard step 2 service-account access denied | "We can't see this folder yet. Double-check that you shared it with `<service-account-email>` and try again." | — | Doug → fix Drive share |
| `ONBOARDING_OPERATOR_ERROR` | wizard step 2 operator-side credential failure | "Something is wrong on our end. The developer has been notified." | — | Doug → wait; Eric → fix |
| `ONBOARDING_NOT_RESOLVED` | wizard finalize blocked because at least one sheet still has an unresolved staged parse or hard-fail row in the current wizard session | "Some sheets in your folder still need review before we can finish setup. Resolve them and try again." | — | Doug → resolve remaining sheets, retry finalize |
| `WIZARD_SESSION_SUPERSEDED_DURING_SCAN` | a `runOnboardingScan` write was blocked because `app_settings.pending_wizard_session_id` no longer matches the scan's session (admin started a new wizard mid-scan) | (admin log only — informational; the new wizard's UI shows the fresh scan state) | — | Doug → use the active wizard tab |
| **Stale-data UX (crew-facing freshness tiers)** | | | | |
| `SYNC_DELAYED_MODERATE` | `last_synced_at` is between 1h and 6h old AND `last_sync_status='ok'` | — | "Last synced *<time>* ago. Check with Doug if anything looks off." | Crew → mention to Doug |
| `SYNC_DELAYED_SEVERE` | `last_synced_at` is more than 6h old AND `last_sync_status='ok'` | "*<sheet-name>*: crew page hasn't synced from Drive in over 6 hours. Push or cron is stalled — check the dashboard." | "Couldn't sync recently — contact Doug." | Crew → text Doug; Doug → check dashboard |
| ~~`SHEET_UNAVAILABLE` (round-44 stale-footer variant)~~ | Retired in round-46: deduplicated against the canonical `SHEET_UNAVAILABLE` row above (~line 1896). The stale footer reads the canonical row's crew copy `"We couldn't get the latest from Doug's sheet. Showing what we had at *<time>*."` — the round-44 variant's text is dropped. | — | — | — |
| **Tile error boundaries (server-side)** | | | | |
| `TILE_SERVER_RENDER_FAILED` | a tile's Server-Component render threw (data fetch, role derivation, DB error). The page renders the rest of the tiles; the affected tile shows a fallback. | "*<sheet-name>*: a section couldn't load on the server. The page will keep trying — refresh in a minute. Tell the developer if this keeps happening." | "This section couldn't load — last good data shown." | Doug → refresh / Report; Eric → investigate |
| **Auth (validator step 5.6)** | | | | |
| `STALE_DISCARD_REJECTED` | Apply or Discard against a `pending_syncs` row whose `staged_id` no longer matches the version the operator was viewing (a fresh sync has restaged) | "The staged parse you were viewing was replaced by a newer sync. Refresh and review the latest version before deciding." | — | Doug → refresh admin |
| `LINK_CROSS_SHOW_REUSE` | (operator-only structured log entry — no user copy) cookie carries a `link_sessions` row whose `show_id` differs from the URL's resolved show; the validator deletes the offending row | (operator log only — user sees a generic 403 page) | — | — |
| **Bug-report pipeline ops (admin_alerts surfaces)** | | | | |
| `REPORT_ORPHANED_LOST_LEASE` | retry/reaper tail UPDATE matched 0 rows because the original/retry race produced an orphan GH issue; the orphan was auto-closed and labeled `fxav-orphan-lost-lease`. UPSERTed via `ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL` per §13.2.3. | "An orphaned bug-report issue was created during a retry race and auto-closed. Click through to verify the issue closed correctly. If this code recurs frequently, increase the lease window." | — | Eric → review orphan, tune lease window if recurring |
| `GITHUB_BOT_LOGIN_MISSING` | `GITHUB_BOT_LOGIN` env var unset; the recovery path's `findIssueByMarker` (`creator=` filter on `issues.listForRepo`) cannot run | "GitHub bot login is unconfigured — the report-recovery path is degraded. Set `GITHUB_BOT_LOGIN` env var to the bot's GitHub username." | — | Eric → configure env var |
| `REPORT_LEASE_THRASHING` | per-show, the bug-report retry/reaper rate exceeds a configured threshold (e.g., > 5 retries/min) — usually means lease window too short OR GH API consistently slow | "Bug-report processing is thrashing on this show — retries are racing against leases. Check Eric's status; this usually means the lease window needs tuning." | — | Eric → tune lease window |

**v2+ candidates** (deliberately not in v1's catalog because the surfaces don't ship in v1): per-link rotation reason codes, crew-initiated "report a problem" codes, scheduled-archive codes.

This catalog is the **single source of truth** for user-visible copy. The bug-report pipeline (§13) carries the code; the GitHub issue body's `last_error_code` field maps back via this table when Eric triages. Translation libraries (i18n) are out of scope for v1 but the catalog is structured so adding a `language` axis later is a flat extension, not a rewrite.

---

## 13. Bug reporting pipeline

### 13.1 Surfaces

**Doug-facing (admin):**
1. **Live parse feedback** during connect/edit — see §9.2. Inline list with severity, message, snippet, and a per-warning "Report to Eric" button.
2. **Per-crew preview** — see §9.3. Banner-mounted "Report this view" button.
3. **Crew page Doug is previewing as** — same "Report this" button at the page footer (visible only in admin mode).

**Crew-facing:**
4. **"Something looks wrong?" button on every crew page.** Lives in the page footer next to the freshness indicator (§5.4 stale-data UX). Available on both signed-in and signed-link views. Tapping opens a small modal with a single freeform text field ("What's wrong, or what's confusing?"). Submission auto-attaches structured context (see §13.2.1 below). The modal explicitly tells the crew member: "This goes to the developer, not Doug. For show-content questions, message Doug directly." This wording prevents reports from becoming a PM communication channel — they're for app issues only.

The crew button is in v1 because techs hit weird states onsite (a tile shows wrong, a hotel's missing, the Right Now card disagrees with what they see in person) and waiting for Doug to surface it round-trips through Doug's attention; direct dev signal is faster and lower-friction.

### 13.2 Report destination: GitHub Issues

Each report opens a GitHub issue in a designated repo (default: this repo, `eric-weiss/FX-Webpage-Template`) via the GitHub REST API + a service account PAT (env `GITHUB_API_TOKEN`). Both admin and crew submissions create issues — same destination, different label and body templates.

#### 13.2.1 Admin issue body template

````markdown
**Reported by:** <admin email>
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
````

Labels: `bug-report`, `reporter:admin`, `severity:<info|warn|error>`, `area:parser` (or `area:render`, `area:sync`, etc.).

#### 13.2.2 Crew issue body template

````markdown
**Reported by:** crew member of `<show-slug>` (role flags: `<role-flags>`)
*(Reporter identity intentionally NOT included; Eric can look up via `reports.id` if needed.)*

**Show:** <title> (`<slug>`)
**Surface:** crew page footer report
**Section being viewed:** <e.g. "lodging" | "right-now" | "audio-scope"> (auto-captured from the URL fragment of the active anchor at submission time)

**Crew member's note:**
> <freeform message>

**Page state at submission:**
- Right Now state: <e.g. "show_day_n / day 1">
- Last sync: <timestamp>
- Stale tier: <e.g. "fresh" | "1h-6h yellow">
- User agent: <browser-string>

**Show drive file ID:** <id>
````

Labels: `bug-report`, `reporter:crew`, `area:render` (default — most crew reports are about what they see, not parse internals).

**Reporter privacy.** The GitHub issue body intentionally does NOT include the crew member's name or email. Eric can look up the reporter via `reports.reported_by` (carrying `crew_members.id`) if disambiguation is needed. This avoids leaking crew identity into a public-ish (or at least multi-engineer) issue tracker. The `reports` table itself is admin-only via RLS.

### 13.2.3 Submission flow (both surfaces)

POST to `/api/report` with an **idempotency key** in the request body or header (`Idempotency-Key`). The client generates a UUID per click; retries reuse the key.

The flow is **reserve-then-call**: persist intent + reserve quota in one DB transaction BEFORE the GitHub side effect, then update on success. This makes the endpoint safe under retries and concurrency, fixes the quota race, and guarantees `reports.reported_by` traceability.

**Round-48 amendment: this ALTER block is HISTORICAL — canonical CREATE is in §4.1.** The columns `idempotency_key`, `processing_lease_until`, `lease_holder` and the `reports_idempotency_key_idx` unique index are all part of the §4.1 `create table reports` block (round-23/40 amendment folded inline). The ALTER block below is preserved for reference only; the initial migration in plan Task 2.2 authors `reports` from §4.1's CREATE and does NOT replay this ALTER. Treating the ALTER as authoritative would duplicate the index (with the wrong name `reports_idempotency_key_idx` vs §4.1's canonical name) and create migration drift.

```sql
-- HISTORICAL — canonical-source-is-§4.1; preserved for migration-evolution context only
alter table reports
  add column if not exists idempotency_key uuid not null default gen_random_uuid(),
  add column if not exists processing_lease_until timestamptz,
  add column if not exists lease_holder uuid;       -- round-8 ownership token
create unique index if not exists reports_idempotency_key_idx on reports (idempotency_key);
```

The `lease_holder uuid` column is the round-8 ownership token: stamped at reservation (`gen_random_uuid()`), rotated to a new UUID on every lease re-acquisition, required (`AND lease_holder = $myToken`) on every URL-writing tail UPDATE so a worker whose lease was stolen sees 0 rows from its tail and runs the case-disambiguating orphan-cleanup branch instead of corrupting the row.

Server:
1. **Authenticate** the requester. Admin path: validate session → admin role. Crew path: validate via `validateLinkSession` or `validateGoogleSession`. A crew submission carrying neither valid session is rejected 401.
2. **Idempotency check + reservation — INSERT-first, lease-aware (round-24 amendment):**
   ```sql
   BEGIN;

   -- Step 2a: pre-check existing row. NO `FOR UPDATE` — the retry path must NOT
   -- hold a row lock during GitHub I/O (round-6/13 lock-free contract).
   SELECT id, github_issue_url, processing_lease_until
     FROM reports WHERE idempotency_key = $1;
   -- If found AND github_issue_url IS NOT NULL → COMMIT, return 200 (idempotent retry).
   -- If found AND github_issue_url IS NULL AND processing_lease_until > now()
   --    → COMMIT, return 409 IDEMPOTENCY_IN_FLIGHT (live lease held by another worker).
   -- If found AND github_issue_url IS NULL AND processing_lease_until <= now()
   --    → expired-lease retry path: hand off to the lock-free `expiredLeaseRetry`
   --      flow (label-first findIssueByMarker, then lease-claim with rotated
   --      lease_holder, then createIssue under fresh ownership). Quota is NOT
   --      re-charged on this branch; the original reservation already counted.
   -- If not found → continue to brand-new reservation below.

   -- Brand-new reservation: conflict-safe INSERT first (INSERT-then-quota).
   -- The lease window starts now and the lease_holder UUID is the worker's
   -- ownership token for every URL-writing tail UPDATE.
   INSERT INTO reports (
     idempotency_key, show_id, reported_by_kind, reported_by, reporter_role,
     context, message, processing_lease_until, lease_holder
   ) VALUES (
     $1, $2, $3, $4, $5, $6, $7, now() + interval '90 seconds', $8::uuid
   )
   ON CONFLICT (idempotency_key) DO NOTHING
   RETURNING id, lease_holder;
   -- If RETURNING yielded 0 rows → a concurrent first-submitter won the claim;
   --   re-SELECT for the existing row's status and dispatch per Step 2a.
   --   Quota is NOT charged for the loser.

   -- Winner branch only — atomic quota reservation under the same transaction:
   INSERT INTO report_rate_limits (kind, identity, hour_bucket, count)
   VALUES ($kind, $identity, date_trunc('hour', now()), 1)
   ON CONFLICT (kind, identity, hour_bucket) DO UPDATE
     SET count = report_rate_limits.count + 1
   RETURNING count;
   -- If returned count > limit (10 admin / 3 crew) → ROLLBACK the entire
   --   transaction. The reports INSERT is also discarded; the brand-new row
   --   never persists. Return 429.

   COMMIT;
   ```
   `$8` is the worker's `myLeaseHolder = gen_random_uuid()`, captured in
   request scope before this transaction so the same UUID can be used in the
   tail UPDATE's `AND lease_holder = $myLeaseHolder` predicate (Step 5).
3. **Build the issue body** using the appropriate §13.2.1 (admin) or §13.2.2 (crew) template. **Embed the idempotency_key in the issue body as a hidden marker:** include a literal line `<!-- fxav-report-id: <idempotency_key> -->` at the bottom. The marker is durable and is the per-issue identifier the recovery lookup scans for; **labels are NOT used for per-key identification** (would accumulate unbounded repo metadata).
4. **Call GitHub API** to create the issue. Outside the DB transaction. Time-boxed (15s default). The `labels` argument uses ONLY the static set (`bug-report`, `reporter:admin`/`reporter:crew`, area labels) — no per-idempotency-key label.
5. **On GitHub success — fenced tail UPDATE (round-8 lease-ownership protocol):** the worker that called GitHub holds a `lease_holder uuid` token stamped on the row at reservation time (see §4.1 schema and the lease ownership protocol below). Tail UPDATEs MUST include both `github_issue_url IS NULL` and `lease_holder = $myToken`:
   ```sql
   UPDATE reports
      SET github_issue_url = $url
    WHERE idempotency_key = $key
      AND github_issue_url IS NULL
      AND lease_holder = $myLeaseHolder::uuid
   RETURNING id;
   ```
   Return 201 to admin client with the URL; 201 to crew client with no URL (privacy §13.2.2). On 0-row tail UPDATE the worker enters the orphan-cleanup branch (case-disambiguating per Case A/B/C below).
6. **On GitHub failure or unknown outcome (timeout, 5xx, network drop):** the `reports` row remains with `github_issue_url IS NULL`. Return 502 to client.

   **Retry path is `findIssueByMarker`-then-claim, NOT body-search-then-create.** When a retry comes in with the same `idempotency_key`:
   1. Single fast-path read: if `github_issue_url IS NOT NULL` → return 200 with that URL.
   2. If `github_issue_url IS NULL` AND a fenced **processing lease** is held by another in-flight call → return 409 `IDEMPOTENCY_IN_FLIGHT`.
   3. If lease expired AND row is still within the 24h `created_at` horizon: run `findIssueByMarker` (immediately-consistent `octokit.rest.issues.listForRepo` call gated by `creator=GITHUB_BOT_LOGIN`, **`labels='fxav-app:report'`** — every report carries this RESERVED, APP-SPECIFIC label (round-40 amendment, attached by `createIssue` alongside the human-triage `bug-report` label). The reserved label is **operationally protected**: operators MUST NOT add it to unrelated issues or remove it from reports; documentation/runbooks state this explicitly. Round 39 originally proposed filtering on the generic `bug-report` label, but round 40 observed that label was mutable and shareable across automations — a dedicated `fxav-app:` prefix prevents both false positives (other automation accidentally matches) and false negatives (triager removes the generic label from a real report). `since=<T-24h>`, **paginated to exhaustion with `per_page: 100`** — every page returned by GitHub MUST be scanned before a null result is treated as authoritative; ANY incomplete scan (network error mid-pagination, exceeded sanity bound of 1000 pages, unexpected response shape) throws `LookupInconclusive` so a partial scan can NEVER authorize `createIssue`. The scan applies a client-side `issue.created_at` post-filter against the same 24h window AND a skip-orphan filter for `state='closed' && state_reason='not_planned'` issues regardless of label presence (round-16/17 amendment) AND fails closed on any open issue carrying `fxav-orphan-lost-lease` (round-19 amendment).
      - **Found exactly one live match** → conditional UPDATE on `github_issue_url IS NULL`; if 0 rows (the row was reaped or another retry won), re-SELECT and dispatch 410/200/409.
      - **Found zero matches** (after pagination exhaustion) → claim the lease via single conditional UPDATE: `WHERE processing_lease_until < now() AND github_issue_url IS NULL AND created_at >= now() - interval '24 hours' AND ...rotate lease_holder`. On 0 rows, re-SELECT and disambiguate stolen-lease vs past-horizon vs URL-was-set. Only after the claim succeeds may `createIssue` be called.
      - **Found ≥2 live matches OR open-with-orphan-label OR pagination/config errors** → throw `LookupInconclusive` with a concrete discriminator code drawn from the enum below. The route returns 502 with an admin_alerts UPSERT (per-show scoped, context-refreshed) gated by a single SQL-statement `INSERT ... SELECT FROM reports WHERE created_at >= now() - interval '24 hours' ... ON CONFLICT ... RETURNING id`. If the SELECT yields 0 rows the row crossed the horizon during GH I/O — return 410 `REPORT_HORIZON_EXPIRED` with no alert written.

      **`LookupInconclusive` discriminator codes and required admin_alerts mappings** (round-26 amendment — every implementation MUST surface these distinct operator signals):
      
      | `LookupInconclusive.code` | Trigger | `admin_alerts.code` | Operator action |
      |---|---|---|---|
      | `BOT_LOGIN_MISSING` | `GITHUB_BOT_LOGIN` env var unset; surfaced before any HTTP call | **DUAL** (round-36 amendment): per-row `REPORT_LOOKUP_INCONCLUSIVE` keyed on the report's `show_id` (state-gated UPSERT, only fires when the row is genuinely stuck) PLUS global `GITHUB_BOT_LOGIN_MISSING` (`show_id=NULL`, fires unconditionally on this code so operators see the config breakage even when individual rows resolve) | configure env var |
      | `PAGINATION_ERROR` | `listForRepo` threw mid-pagination | `REPORT_LOOKUP_INCONCLUSIVE` (per-show) | retry; transient if rate-limited |
      | `PAGINATION_BOUND` | scan exceeded the 1000-page sanity bound | `REPORT_LOOKUP_INCONCLUSIVE` (per-show) | investigate pathological repo state |
      | `SHAPE_ERROR` | response body shape didn't match expected | `REPORT_LOOKUP_INCONCLUSIVE` (per-show) | investigate API change |
      | `DUPLICATE_LIVE_MATCHES` | ≥2 non-orphan marker-bearing issues found | `REPORT_DUPLICATE_LIVE_MATCHES` (per-show) | manually close all but one |
      | `OPEN_ISSUE_WITH_ORPHAN_LABEL` | open issue carries `fxav-orphan-lost-lease` (impossible state) | `REPORT_OPEN_ORPHAN_LABEL` (per-show) | manually reclose or remove the label |
   4. If row is past the 24h `created_at` horizon at any point (entry, post-lookup, claim) → return 410 `REPORT_HORIZON_EXPIRED`. **Every horizon classification uses Postgres `now()`, never `Date.now()`** — clock skew between app and DB must not change behavior at the boundary.

   **Processing lease and ownership.** `reports.processing_lease_until timestamptz` and `reports.lease_holder uuid` (added in this amendment). Reservation INSERT stamps `lease_holder = gen_random_uuid()` and `processing_lease_until = now() + interval '90s'`. Lease re-acquisition rotates `lease_holder` to a new UUID atomically with the lease extension. The 90s buffer covers GitHub's 15s worst-case API timeout plus generous headroom. Tail UPDATEs check `AND lease_holder = $myToken` so a worker whose lease was stolen can detect that and run the orphan-cleanup branch. **0-row tail UPDATE has FOUR causes** — re-read the row (with `SELECT github_issue_url, show_id`) and disambiguate:
   - **Case A:** stored `github_issue_url` equals my just-created URL → a retry recovered MY issue via `findIssueByMarker`. Issue is live; **DO NOT close it.** Return 200.
   - **Case B:** stored `github_issue_url` is set but differs from my URL → another worker created a separate issue. Mine is the orphan. Run cleanup; return 200 with the row's URL.
   - **Case C:** stored `github_issue_url IS NULL` → another worker holds the lease but hasn't finished. Mine is provisionally an orphan. Run cleanup; return 409 `IDEMPOTENCY_IN_FLIGHT`.
   - **Case Reaped (round-29/32/33 amendment):** the re-read returned no row → the daily reaper deleted it because the row crossed the 24h horizon AND its lease had expired. **MY issue still exists at GitHub regardless** and MUST be closed; otherwise a user-visible duplicate live issue leaks. Run cleanup; UPSERT the alert preferring the **caller-supplied** show_id — for the ORIGINAL-worker tail this is the `show_id` from the request body (the worker just inserted it on the reservation INSERT in this same request, so it's still in scope); for the RETRY-worker tail this is `entryShowId` captured at the start of `expiredLeaseRetry` before the GH lookup. Only fall back to `NULL` if no in-memory show id exists in either caller's scope. Mark `row_reaped: true` in the `context` payload as a discriminator; return 410 `REPORT_HORIZON_EXPIRED`. **Per-show alert keying is preserved across both callers** so two unresolved reaped lost-lease incidents on different shows produce two distinct admin_alerts rows.

   **Orphan cleanup (cases B + C + Reaped)** uses a SINGLE atomic Octokit call: `octokit.rest.issues.update({ issue_number, state: 'closed', state_reason: 'not_planned', labels: [...existing, 'fxav-orphan-lost-lease'] })`. Then UPSERT an `admin_alerts` row coded `REPORT_ORPHANED_LOST_LEASE` via the standard `ON CONFLICT (coalesce(show_id::text, ''), code) WHERE resolved_at IS NULL DO UPDATE SET last_seen_at = now(), occurrence_count = admin_alerts.occurrence_count + 1, context = EXCLUDED.context` pattern. The `show_id` arg is `row.show_id` for Cases B/C and the entry-time captured `show_id` (round-32) for Case Reaped, fallback NULL. The `context` JSONB always carries `idempotency_key`, `orphan_url`, `lease_holder`, and a `row_reaped: boolean` discriminator.

   A daily reaper cron deletes reports rows where **`github_issue_url IS NULL AND created_at < now() - interval '24 hours' AND processing_lease_until < now()`** (the live-lease skip prevents reaping a row a retry actively holds; aligns with the retry path's same `created_at` 24h horizon — round-13 race fix). Admin gets a `STALE_ORPHAN_REPORT` audit log entry per row deleted.

This pattern guarantees:
- **Quota is reserved atomically before GitHub** — concurrent submissions cannot both pass.
- **Retries are safe** — same `idempotency_key` returns the original result, never opens a duplicate issue.
- **Traceability is durable** — `reports.reported_by` is written before the GH issue is created, so even a half-failed submission has a row Eric can reconcile.
- **Crew identity is in the `reports` row but never in the GH issue body** (unchanged from §13.2.2 privacy contract).

### 13.3 Rate limiting

`/api/report` rate limits enforced via `report_rate_limits` keyed by `(kind, identity)`:

- **Admin (Doug, Eric):** 10 reports per hour, returns 429 over limit.
- **Crew member:** 3 reports per hour per `crew_members.id`. Lower because crew reports are inherently rarer than admin reports (they only fire on a "something looks wrong" experience), and 3/hr/person is more than enough for legitimate use. 4th report in the same hour returns 429 with "We've already heard from you a few times — give the developer a moment to look. Or message Doug directly for show-content questions."

```sql
create table report_rate_limits (
  kind        text not null check (kind in ('admin', 'crew')),
  identity    text not null,                    -- canonical email (admin) or crew_members.id::text (crew)
  hour_bucket timestamptz not null,             -- date_trunc('hour', now()) at submission time
  count       int not null default 1,
  primary key (kind, identity, hour_bucket)
);
```

RLS: admin-only. The rate-limit check runs server-side via the service role, so no user (admin or crew) needs RLS read/write access. Per §4.3 admin-only list.

UPSERT on submission; SELECT to check before opening the GH issue. Old buckets pruned by a daily cron (or just left to age out — the table stays small).

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
| ~~`WATCHED_DRIVE_FOLDER_ID`~~ | **Not an env var.** Folder ID lives in `app_settings` (§4.5), set by Doug via the onboarding wizard (§9.0). Forcing a redeploy to change folders defeats the wizard's whole purpose. |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase |
| `JWT_SIGNING_SECRET` | Signed-link tokens |
| `GITHUB_API_TOKEN` | GH Issues integration |
| `GITHUB_REPO` | `eric-weiss/FX-Webpage-Template` (default) |
| `GITHUB_BOT_LOGIN` | GitHub username the PAT belongs to. Required by §13.2.3's `findIssueByMarker` recovery path (`creator=` filter on `issues.listForRepo`). Missing config raises `GITHUB_BOT_LOGIN_MISSING` admin alert. |
| `SENTRY_DSN` | error tracking |
| `ADMIN_EMAILS` | comma-separated list (`dlarson@fxav.net,edweiss412@gmail.com`) |

---

## 15. v1 build sequence

Staged milestones, each independently demoable:

1. **Parser standalone.** Library function `parseSheet(markdown)` that ingests any fixture in `fixtures/shows/raw/` and returns a `ParseResult`. Vitest test for every fixture, asserting the canonical schema is populated and warnings are captured. No Next.js, no DB. **Demo:** "run `pnpm test:parser` and see all 10 raw fixtures parse cleanly."
2. **Schema + DB migrations.** Supabase Postgres tables per §4, RLS policies, seed script that loads parsed fixtures. **Demo:** "run `pnpm db:seed` and query the rows in Supabase Studio."
3. **Admin upload-test (admin-gated, dev-build only — round-47/48 amendment).** An `/admin/dev` page that accepts a fixture filename, parses through the full production pipeline (`parseSheet → enrichWithDrivePins → runInvariants → phase1`) into an isolated `dev.*` Postgres schema, and shows the parse panel. **Both the page AND every server action AND the reset action call `requireAdmin()` as their first line.** A server-only `ADMIN_DEV_PANEL_ENABLED` build-time env var gates the route at the artifact level: production builds set it to false (or unset) and the route returns 404 even with valid admin auth. The dev panel is for local/test deployments only and MUST NOT ship in customer-facing builds. (Earlier "no auth" framing has been retired — AC-3.2/3.3 explicitly assert rows in `pending_syncs`/`pending_ingestions`, which a real Phase-1 write requires admin auth to expose.) **Demo:** "Eric (admin) uploads any fixture in a dev build and sees the parse panel; the same URL on a prod build returns 404."
4. **Crew page (identity-only mock — round-46/48 amendment).** `/show/<slug>?crew=<seeded-crewMemberId>` renders the page from DB; `getShowForViewer` re-derives role flags from `crew_members.role_flags` exactly as production will. The mock provides ONLY identity (`?crew=<id>` or `?as=admin`); `?role=` is explicitly ignored, with a regression test asserting `?role=lead` cannot unlock financials when the bound crew row's role_flags don't include LEAD. (Earlier "hardcoded role" framing has been retired — caller-supplied role would reopen the role-spoofing surface Task 4.3 is written to prevent.) **Demo:** "open the page on a phone with `?crew=<seeded-A1>` and `?crew=<seeded-LEAD>` to see role-appropriate tile sets, with empty-state discipline; `?role=lead` does NOTHING."
5. **Auth.** Supabase Google OAuth + signed-link JWT (per-request authz against current `crew_members`, no role claim in token, `revoked_links` table). RLS enabled. Role-based hiding always derived fresh and narrowed to `shows_internal.financials` per §4.4. **Demo:** "sign in as a fixture-defined crew email, see your view; demote a crew member from LEAD in the sheet, re-sync, observe Financials tile disappear on next refresh without any token rotation. COI in Show status tile unchanged."
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
- ~~**Vercel cron 5-min cadence vs Drive push notifications.**~~ Resolved: push is in v1 per §5.5. Cron stays as the reconciliation fallback. Combined latency is sub-second on the happy path, ≤5 min on push failure.
- ~~**Crew-side "report a problem" button.**~~ Resolved: in v1 per §13.1 surface 4. Per-crew rate limit 3/hr; reports go to GitHub Issues with reporter identity withheld from the issue body but recorded in `reports.reported_by` for triage.
- ~~**Should ops fields ever be visible to non-LEAD?**~~ Resolved: financials (PO/Proposal/Invoice/InvoiceNotes) stay LEAD-only because they're billing details and noise to onsite techs. COI is operational, not financial — moved to public `shows.coi_status` per §4.1 / §4.4. v2 candidate: Doug-configurable per-viewer field segmentation if his workflow ever needs it.
- ~~**Slug generation strategy.**~~ Resolved in §6.9: deterministic `<YYYY-MM>-<title-slug>` derived on first successful parse, immutable thereafter, collisions resolved by `-2`/`-3` suffix.
- **Date-restriction sanity check.** When `date_restriction.kind === 'explicit'`, should the parser warn if any of the listed dates fall outside the show's `dates.travelIn → dates.travelOut` span? (e.g., Calvin listed for `5/12 & 5/14` on a show that runs `5/13 → 5/15`.) Probably yes as a `DATE_RESTRICTION_OUTSIDE_SHOW_RANGE` warning, but defer the implementation to v2.

### 16.2 v2+ candidates (deferred but noted)

- Crew notification emails when Doug adds a new crew member.
- "More from sheet" disclosure on crew page surfacing `raw_unrecognized` content.
- Admin manual override for `unknown_asterisk` date_restriction (a small admin UI to set the days when fixing the sheet isn't possible). v1 ships without this; Doug's path is to fix the sheet.
- **External-viewer principal** — first-class identity for non-FXAV stakeholders (drivers, client contacts, in-house AV). New `external_viewers` table separate from `crew_members`, with its own issuance/revocation/rendering rules. v1 punts; Doug shares info with these people the same way he does today.
- Webhook-based "fix landed → mark resolved" loop with GitHub.
- External agenda PDF parsing (option C).
- ~~Inline image rendering for cells with embedded images.~~ Resolved: floating embedded images on the DIAGRAMS tab are now in v1 per §6.11 + §10. Only `=IMAGE(arbitrary-external-url)` formulas referencing third-party hosts stay deferred.
- Multi-PM support (Chip's freeform emails, Corey's freeform emails) — different parser entirely.
- ~~GEAR / case-prep view for production crew.~~ **Partially in v1**: per-case PULL SHEET packing list is rendered when present (§6.10, §8.1 Pack list tile). The per-day rental quantity grid (Chip's PROPOSAL form) stays out of scope.

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

**Milestone 3 — Admin upload-test (round-47 amendment: admin-gated + dev-only build flag).**
- AC-3.1 `/admin/dev` is **admin-gated** (`requireAdmin()` on the page AND on every server action AND the reset action) AND only available in builds where the server-only env var `ADMIN_DEV_PANEL_ENABLED=true`. Production builds (`ADMIN_DEV_PANEL_ENABLED` unset/false) return 404 even for admins. Round-46 retired the earlier "no auth" framing — the dev panel is a real Phase-1 write-through (writes to `dev.*` schema for isolation) AND has a destructive `TRUNCATE dev.* CASCADE` reset, both of which require admin auth in any deployed environment.
- AC-3.2 A fixture with synthesized MI-7 (50% hotel drop) lands in `dev.pending_syncs` with the right `triggered_review_items`.
- AC-3.3 A fixture with synthesized MI-1 (no version markers) lands in `dev.pending_ingestions` with `last_error_code = "MI-1_VERSION_DETECTION_FAILED"`.

**Milestone 4 — Crew page (round-47 amendment: identity-only mock).**
- AC-4.1 `/show/<slug>?crew=<seeded-A1-crewMemberId>` shows Lodging, Venue, Schedule, Audio scope, Crew, Contacts, Show status (with COI) tiles. No Financials tile. Round-46 retired the earlier "hardcoded role A1" framing — the M4 mock uses the identity-only `?crew=<crewMemberId>` query param and `getShowForViewer` re-derives role from `crew_members.role_flags` exactly as production will (Task 4.3 lookup binds id AND show_id, so a wrong crewMemberId fails closed). `?role=` is explicitly ignored.
- AC-4.2 `/show/<slug>?crew=<seeded-LEAD-crewMemberId>` shows Financials tile in addition. COI status appears in Show status tile in BOTH renders.
- AC-4.3 Right Now card renders the correct state for a synthesized "today is Show Day 1" fixture, including the viewer-aware states (`viewer_off_day`, `viewer_after_last_day`, `viewer_unconfirmed`).
- AC-4.4 §8.4 dimensional invariants: a Playwright test loads the page at 390px width and asserts `getBoundingClientRect()` per `data-testid` matches the spec (tile min-height 96px, two-column grid, etc.).
- AC-4.5 Empty-state discipline: a fixture with `Opening Reel = TBD` does NOT render an "Opening Reel: TBD" line on the crew page.
- AC-4.6 Schedule tile for `unknown_asterisk` crew renders the "days unconfirmed" message and NO per-day schedule.
- AC-4.7 Parser extracts a populated `pull_sheet` JSONB for `2024-05-east-coast-family-office.md` and `2025-05-redefining-fixed-income-private-credit.md`; column is NULL for the other 8 raw fixtures.
- AC-4.8 Pack list tile renders on the set day for an unrestricted-crew viewer when `pull_sheet IS NOT NULL`; renders on strike day; does NOT render on show days.
- AC-4.9 Pack list tile is absent entirely for a viewer of a show whose sheet has no PULL SHEET tab (e.g., 2026-03 RPAS Central).
- AC-4.10 Pack list tile is absent on set day for a crew member whose `stage_restriction.stages = ["Load Out", "Strike"]`; renders on strike day for the same crew member.
- AC-4.11 `PULL_SHEET_PARSE_PARTIAL` and `PULL_SHEET_AMBIGUOUS_FORMAT` surface in admin parse panel without blocking sync; affected rows render with their raw snippet on the crew page.
- AC-4.12 MI-8c pull-sheet preservation: synthesize a parse where prior had 6 cases and new has 0 (full collapse) → stages, NOT auto-applied. Same for case-count halved or a case label dropping. Soft per-row PULL_SHEET_PARSE_PARTIAL warnings on individual rows continue to auto-apply (don't trigger MI-8c).

**Milestone 5 — Auth (round-46 amendment: cookie-session model).** `validateLinkSession` is the cookie-session validator that runs on every page render after the JWT-fragment redemption. The cookie carries an opaque `link_sessions.token`, NOT a JWT — JWT signature verification happens once at redeem-link time (Task 5.4), where the JWT is exchanged for the opaque cookie. The ACs below reflect the §7.2.2 12-step cookie validator, NOT a JWT validator. Earlier draft of §17.1 (rounds 1-44) treated `validateLinkSession` as a JWT validator with bad-signature/older-version/newer-version cases — that text has been retired in round-46 to match the cookie model the plan and §7.2.2 implement.
- AC-5.1 cookie-session validator: cookie missing OR `link_sessions.token` not found → 401 (no row to delete).
- AC-5.2 `expires_at <= now()` (12h absolute) → 401 (`SESSION_ABSOLUTE_TIMEOUT`); DELETE the row.
- AC-5.3 `show.id !== link_sessions.show_id` (cross-show reuse) → 403 (operator-only structured log; no user-facing code); DELETE the row.
- AC-5.4 `link_sessions.jwt_token_version !== crew_member_auth.current_token_version` (strict equality, both directions) → 410 (`LINK_VERSION_MISMATCH`); DELETE the row. (`jwt_token_version` is the version captured at redemption; the validator does NOT verify JWT signatures.)
- AC-5.5 `link_sessions.jwt_token_version <= crew_member_auth.revoked_below_version` → 410 (`LINK_REVOKED_FLOOR`); DELETE the row. AND matching `revoked_links` row at exact `(show_id, crew_name, token_version)` → 410 (`LINK_REVOKED_SURGICAL`); DELETE the row.
- AC-5.6 `last_active_at < now() - interval '15 minutes'` → **401** (`SESSION_IDLE_TIMEOUT`); DELETE the row. Pass advances `last_active_at = now()`.
- AC-5.7 `validateGoogleSession` rejects a Supabase Auth user whose email doesn't match any crew row in the show (403).
- AC-5.8 `validateGoogleSession` rejects on multi-match (`AMBIGUOUS_EMAIL_BINDING`, 500). Synthesize a fixture with duplicate emails and seed it bypassing MI-5b.
- AC-5.9 LEAD viewer's response includes `shows_internal.financials`; non-LEAD viewer's response omits it. Both viewers' responses include `shows.coi_status`. (Verify via response-payload introspection.)
- AC-5.10 Demote a crew member from LEAD to A1 in the sheet, re-sync, refresh the page: Financials tile disappears within one sync cycle without any token rotation. Show status tile (including COI) is unchanged.
- AC-5.11 `?t=` URL compromise-event handler covers ALL THREE branches per §7.2 (round-46+ amendment):
  - **Branch A** (`jwt.tokenVersion === current_token_version`): middleware returns 410, inserts `revoked_links` row at the exact version (idempotent), AND sets `revoked_below_version = current_token_version` while leaving `current_token_version` / `max_issued_version` unchanged (no auto-mint). The crew row enters "no live link" state; admin UI hides the share affordance until Doug clicks "Issue new link," which bumps both `current_token_version` and `max_issued_version` to `floor + 1` (single-click recovery). Subsequent requests with the same JWT in `#t=` form fail authz.
  - **Branch B** (`jwt.tokenVersion < current_token_version`): middleware returns 410, inserts ONLY the surgical `revoked_links` row at the exact stale version (idempotent). `crew_member_auth` is unchanged; the live current JWT still passes redemption and cookie validation in a follow-up request.
  - **Branch C** (`jwt.tokenVersion > current_token_version`, future-version leak): middleware returns 410, inserts `revoked_links` row at the exact future version (idempotent), AND lifts `current_token_version`, `max_issued_version`, AND `revoked_below_version` to `jwt.tokenVersion` in one transaction. A single subsequent "Issue new link" click bumps both `current_token_version` and `max_issued_version` to `jwt.tokenVersion + 1`, producing a usable replacement on the first click (multi-click recovery would be a regression).
  - All three branches use the canonical `LEAKED_LINK_DETECTED` user copy. All `revoked_links` inserts use `ON CONFLICT (show_id, crew_name, token_version) DO NOTHING` so duplicate hits on the same leaked URL (browser retry, refresh, prefetch) are safe — required test: submit the same leaked `?t=` URL twice; assert the second hit also returns 410 with stable auth state and no 500 / no duplicate row.
- AC-5.12 Synthesizing the duplicate-email runtime condition (bypassing MI-5b in test setup) writes an `admin_alerts` row visible in the dashboard's top-bar banner. Marking resolved removes the banner. (Per §4.6.)

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
- AC-6.13 Push subscription: after onboarding completes, `drive_watch_channels` has exactly one active row (`superseded_at IS NULL`) for the active `watched_folder_id`. The hourly renewal cron creates a fresh row + STOPs the prior one when `expires_at < now() + 24h`.
- AC-6.14 Push happy path: edit a sheet in Drive; the webhook fires within seconds; the affected show's `last_seen_modified_time` advances within ~5s end-to-end (measured from edit to crew-page reflecting it via Realtime).
- AC-6.15 Push token verification: a synthetic POST to `/api/drive/webhook` with the right channel id but wrong token returns 401 and writes a `WEBHOOK_TOKEN_INVALID` row to `admin_alerts`.
- AC-6.16 Push de-duplication: two notifications arriving for the same `(drive_file_id, modifiedTime)` result in exactly one Phase 2 commit; the second logs `WEBHOOK_NOOP_ALREADY_SYNCED` and short-circuits before acquiring the lock.
- AC-6.17 Push-then-cron idempotency: if push processed an edit, the next cron pass observes `last_seen_modified_time === current modifiedTime` and is a no-op for that show.
- AC-6.18 Channel rotation on folder change: after re-running setup with a new folder, the prior folder's `drive_watch_channels` rows are `status = 'superseded'`; a fresh `status = 'active'` row exists for the new folder; old webhook deliveries return 410 (Drive instructed to stop).
- AC-6.19 Outbox state machine: simulate Drive returning an error after `drive_watch_channels` row is INSERTed in `pending` state. Row transitions to `orphaned`; `admin_alerts` row coded `WATCH_CHANNEL_ORPHANED` raised; webhook handler does NOT process notifications for this row (status != active). The hourly GC cron transitions `orphaned → stopped` and the row is deleted after 7 days.
- AC-6.20 Push respects deferred_ingestions: a sheet with a `permanent_ignore` row in `deferred_ingestions` produces no Phase 2 commits when push delivers a notification covering it. Same for `defer_until_modified` while modifiedTime hasn't advanced past the deferral mark.
- AC-6.21 Push-mode monotonic guard: synthesize concurrent push and cron parses with the cron arriving first; the push run logs `STALE_PUSH_ABORTED` and rolls back, leaving the cron commit intact.
- AC-6.22 Wizard session purge: start wizard A (session id W1), stage some onboarding rows, then start wizard B (session id W2). All `pending_syncs` rows from W1 are deleted on W2 start; Apply against W1's rows from a stale tab returns 409 `WIZARD_SESSION_SUPERSEDED`.
- AC-6.23 Pending-review watermark stability: a sheet stages a parse and Doug leaves the review tab open without acting. Subsequent cron passes against the unchanged sheet do NOT rotate `pending_syncs.staged_id`; `staged_modified_time` is unchanged; Doug's CAS continues to match if he then clicks Apply.
- AC-6.24 Watermark-as-greatest: `last_seen_modified_time = T0`, `pending_syncs.staged_modified_time = T1` (T1 > T0). Cron with `file.modifiedTime = T1` (no advance) skips. Cron with `file.modifiedTime = T2` (advance past T1) processes — re-stages or applies per invariants.
- AC-6.25 Webhook strict-active match: insert a `pending`/`orphaned`/`superseded`/`stopped` `drive_watch_channels` row that happens to share an id with an old active row Drive is still calling. The webhook handler's lookup MUST return 410 (no `status='active'` row matches), not pass through the old row's secrets. Single-active-per-folder index prevents two rows from being active simultaneously.
- AC-8.9 Report idempotency: POST `/api/report` twice with the same `idempotency_key` (same body). First call opens 1 GitHub issue and writes 1 `reports` row. Second call returns the same `github_issue_url` without opening a second issue.
- AC-8.10 Report quota race: 4 concurrent crew reports from the same `crew_members.id` produce exactly 3 GitHub issues (3 succeed, 4th gets 429 `REPORT_RATE_LIMITED_CREW`). The atomic `INSERT ... ON CONFLICT DO UPDATE ... RETURNING count` guarantees no race-through.
- AC-8.11 GitHub-call failure (no GH issue created): simulate GitHub API returning 5xx after `reports` row is reserved. Row remains with `github_issue_url IS NULL`. A retry with the same idempotency_key while the lease is held returns `IDEMPOTENCY_IN_FLIGHT`; after the lease expires the retry searches GH for the marker, finds nothing, and creates the issue. Exactly one issue ever exists.
- AC-8.12 GitHub-call unknown-outcome (issue created but DB update lost): simulate GitHub create succeeding (issue is on the repo with the marker comment) but the network response timing out. The reports row stays `github_issue_url IS NULL`. A retry with the same idempotency_key after lease expiry searches GitHub Issues with the marker, finds the existing issue, and UPDATEs the reports row with that URL — without creating a second issue. Exactly one issue ever exists.
- AC-8.13 Concurrent-retry race: two concurrent retries of the same idempotency_key after lease expiry. The first acquires the lease and proceeds; the second gets `IDEMPOTENCY_IN_FLIGHT`. Exactly one issue ever exists regardless of timing.

**Milestone 7 — Linked content.**
- AC-7.1 `agenda_links[].url` containing a Drive PDF renders an inline embed via PDF.js or `<iframe>`.
- AC-7.2 Diagrams folder URL fetches the folder image list and renders the gallery (up to 12 images on initial render; "Show more" reveals the rest).
- AC-7.2a Embedded-image extraction: a fixture's `parseResult.diagrams.embeddedImages` is populated for the FinTech Forum 2026 sheet (which has at least 2 floating images on its DIAGRAMS tab — the ballroom layout drawing and the 3D photo). For sheets with neither linked folder nor embedded images, `diagrams.embeddedImages = []` and `diagrams.linkedFolder = null`, and the Diagrams tile is absent.
- AC-7.2b Merged gallery: a synthesized fixture with BOTH a linked folder (3 images) and embedded images (2 images) renders 5 images in the gallery — embedded images first, then folder images. Combined cap of 60 is honored.
- AC-7.3 Opening reel URL detection: `https://drive.google.com/file/d/...` renders inline `<video>`; `MAYBE` renders as a text line; `YES - <url>` renders both.
- AC-7.4 Diagram image fetches go through `/api/asset/diagram/...` (proxied), never expose the raw Drive URL in HTML.
- AC-7.5 Diagrams folder cap: a folder with 78 images shows the first 60 and surfaces an admin warning.
- AC-7.6 Embedded-image cap: a synthesized sheet with 65 floating images on its DIAGRAMS tab renders only 60 in the gallery and surfaces `DIAGRAMS_EMBEDDED_CAP_EXCEEDED` warning.
- AC-7.7 Embedded-image inaccessible: a synthesized embedded image whose download URL 4xx's surfaces `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE` warning; gallery renders a placeholder slot for that image rather than disappearing the slot.
- AC-7.8 Snapshot isolation: stage a parse with embedded images, Apply (Phase 2 commits with `snapshotPath`s populated). Then EDIT one of the images in Drive without re-syncing. The crew page MUST continue serving the original (Apply-time) bytes, not the new Drive bytes. After a fresh re-sync + Apply, the crew page reflects the new image.
- AC-7.9 Snapshot orphan GC: a previously-approved revision's storage objects are eligible for deletion 7 days after a new revision supersedes them. Until then they remain at their `r=<old-revision-id>/` prefix. The diagram GC cron deletes them on day 8. Archived shows extend the grace window to 30 days.
- AC-7.10 Per-apply revision id: two manual applies of the SAME Drive `modifiedTime` produce DISTINCT `snapshot_revision_id` values and DISTINCT storage prefixes. The earlier apply's blobs become GC-eligible after the second apply commits.
- AC-7.11 Partial-failure auto-retry: simulate one of N images failing to download during Phase 2. Apply commits with `snapshot_status='partial_failure'` and `last_seen_modified_time` advanced. The next cron pass enters `mode: "asset_recovery"` (NOT Phase 2), re-attempts only the missing snapshotPath, succeeds, and flips status to `'complete'`. **The same Drive `modifiedTime` recovers without needing any sheet edit.** Prior revision blobs are NOT GC'd while `partial_failure` is in effect.
- AC-7.13 Linked-folder snapshotting: a fixture with a linked DIAGRAMS folder containing 3 images produces 3 entries in `diagrams.linkedFolderItems[]`, each with a `snapshotPath` pointing into Storage at `r=<rev>/folder-<driveFileId>.<ext>`. Subsequent edits to the linked Drive folder (add/remove an image) do NOT propagate to the live crew page until the next sheet sync + Apply.
- AC-7.14 Asset_recovery covers BOTH source types: synthesize a partial_failure where one `embeddedImages` entry AND one `linkedFolderItems` entry both have NULL `snapshotPath`. The next cron pass enters `mode: "asset_recovery"`, retries BOTH entries, and on success flips `snapshot_status` to `'complete'`. AC-7.11 still holds for embedded; this extends it to linked.
- AC-7.15 Revision-versioned URL: after Apply, the crew-page renders `/api/asset/diagram/<show>/r=<new-rev>/<key>` for every diagram. A request to `/api/asset/diagram/<show>/r=<old-rev>/<key>` (using the prior revision id) returns 410 Gone. Edge caching the new URL for 24h is safe — the URL itself is the version key; a future Apply rotates the URL space.
- AC-7.12 Authenticated asset delivery: a request to `/api/asset/diagram/<show>/r=<rev>/<assetKey>` without a valid signed-link cookie or Google session returns 401. A request from a session whose crew_member is no longer in this show returns 403. A request after `Issue New Link` was clicked for that crew returns 410. No long-lived signed Storage URLs are issued; bytes stream through the route on every request and the response carries `Cache-Control: private, max-age=0, must-revalidate` so the browser re-authenticates with the server on every reuse.
- AC-7.16 Asset_recovery cannot starve newer sheet content: enter `partial_failure` state with one image's snapshotPath NULL. Then edit the source sheet (Drive `modifiedTime` advances). The next cron pass takes the NORMAL Phase 2 path (NOT asset_recovery) because `file.modifiedTime > effective_watermark`, parses the new revision, and applies the sheet-derived data; the still-broken diagram entry is carried forward as NULL with `snapshot_status='partial_failure'` against the new revision. Schedule/hotel/crew updates land within the normal sync window despite the persistent diagram failure.
- AC-7.17 Cache revalidation propagates revocation: load a diagram in browser A. Click `Issue New Link` for the viewing crew member. Browser A reuses the cached URL → server returns 410 (auth check fails on revalidate). Browser shows the placeholder, not the cached bytes.
- AC-7.18 Reel route auth + cache parity: same as AC-7.17 but for `/api/asset/reel/<show>` — revoked session can't replay cached reel bytes; revalidate-on-every-use ensures auth fires every request.
- AC-6.26 Apply trust-boundary re-verify: stage a sheet during onboarding, then in Drive UI move the sheet OUT of the candidate folder (so its `parents` no longer includes `pending_folder_id`). Click Apply. Apply re-fetches `parents` and aborts with `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`. No `shows` row created.
- AC-6.27 Apply trust-boundary on deletion: stage a sheet, then trash/un-share the source. Apply aborts with `STAGED_PARSE_SOURCE_GONE`. Existing-show stages restore prior status; first-seen stages log to `pending_ingestions`.
- AC-7.19 Linked-folder freeze at stage: a fixture's linked folder has 3 images at stage time. Between stage and Apply, add a 4th image to the folder. Apply commits with exactly the 3 frozen images snapshotted (the new 4th image is NOT included). The next sync (after sheet edit) re-enumerates and includes the 4th if it's still there.
- AC-7.20 Linked-folder version pin at Apply: a fixture's linked folder image is EDITED IN PLACE between stage and Apply (same driveFileId, new modifiedTime). Apply's version-pin check fails closed: snapshotPath stays NULL, snapshot_status='partial_failure', LINKED_ASSET_DRIFTED warning surfaced. asset_recovery does NOT silently download the drifted bytes — it re-checks the version pin and continues to fail until a sheet edit re-stages the new version.
- AC-7.21 Reel version pin (round-47 amendment, full immutable-pin contract): an opening-reel Drive file is edited after the last Apply (`headRevisionId` advances; `modifiedTime` advances; `md5Checksum` changes). Crew load the page, hit `/api/asset/reel/<show>`. Route runs `files.get(reelFileId, fields='modifiedTime,trashed,headRevisionId,md5Checksum')` and compares `current.headRevisionId` against `shows.opening_reel_head_revision_id` — drift detected → 410 + placeholder. **`headRevisionId` is the authoritative byte-fence;** modtime is informational. No drifted bytes ever served, including via the alt=media fallback (which buffers the full body and re-verifies md5 against `current.md5Checksum` before serving any bytes).
- AC-7.22 Reel pin persistence (round-47 amendment, full triple): a fixture whose `event_details.opening_reel` cell holds a Drive URL produces `shows.opening_reel_drive_file_id`, `shows.opening_reel_drive_modified_time`, AND `shows.opening_reel_head_revision_id` ALL NOT NULL after Apply. A fixture whose cell is `MAYBE` (text only) leaves all three columns NULL.
- AC-7.23 Mixed-value reel extraction: a fixture whose `event_details.opening_reel` cell is `YES - LOOP VIDEO https://drive.google.com/file/d/<id>/view` produces NON-NULL values for ALL THREE pin columns AND the crew page renders BOTH the text status and the inline video. Pin extraction is substring-based, not anchored.
- AC-7.24 Apply-time reel drift (round-47 amendment, single 410 contract): stage a parse with a reel URL. EDIT the reel file in Drive (`headRevisionId` advances). Click Apply. The Apply-time re-verify (§6.11.1's four-step flow) detects drift via `headRevisionId` mismatch, persists ALL THREE `opening_reel_*` columns as NULL, emits `REEL_DRIFTED` warning. Crew page falls back to text-only display. **Single 410 contract**: `/api/asset/reel/<show>` returns 410 whenever ANY of the three persisted pin columns is NULL OR live drift is detected — the same 410 status covers both NULL-persisted and drift cases (round-46 retires the earlier "route does NOT 410 when columns are NULL" carve-out; the page knows not to call the route when any column is NULL, but the route still fails closed if hit).

**Milestone 8 — Bug-report pipeline.**
- AC-8.1 Click "Report this" in admin parse panel → opens a GitHub issue in the configured repo with the §13.2.1 admin body template (labels include `reporter:admin`).
- AC-8.2 Reports table records the submission with `reported_by_kind = 'admin'`, `reported_by = <admin email>`, and `github_issue_url` populated.
- AC-8.3 Admin rate limit: 11th admin report within 1h returns 429 with `REPORT_RATE_LIMITED_ADMIN`.
- AC-8.4 Click "Something looks wrong?" on a crew page → opens a GitHub issue with the §13.2.2 crew body template. Issue body does NOT include the crew member's name or email; labels include `reporter:crew`.
- AC-8.5 Crew submission writes `reports` row with `reported_by_kind = 'crew'`, `reported_by = <crew_members.id>`, `reporter_role = <role flags snapshot>`, `github_issue_url` populated.
- AC-8.6 Crew rate limit: 4th crew report from the same `crew_members.id` within 1h returns 429 with `REPORT_RATE_LIMITED_CREW`.
- AC-8.7 Crew submission with no valid session (no link cookie, no Google session) returns 401 — anonymous users cannot open issues.
- AC-8.8 Every error code surfaced anywhere in the app maps to a row in §12.4 (test asserts no orphan codes).

**Milestone 9 — Stale-data UX, error states, empty states, polish.**
- AC-9.1 Pull network plug, refresh page: footer turns yellow (1h–6h stale) or red (>6h) with the catalog-mapped message.
- AC-9.2 Every empty state defined in §8.3 is reachable from a fixture; manual screenshot-comparison is the verification mechanism in v1.
- AC-9.3 Error boundaries: a synthesized server error in a tile renders the boundary's fallback, not a stack trace.

**Milestone 10 — Onboard Doug.**
- AC-10.1 First-visit `/admin` (no folder configured) shows the §9.0 wizard, not the dashboard.
- AC-10.2 Wizard step-2 verification produces the documented success/failure messages for each path (success, malformed URL, not-shared, operator-error).
- AC-10.3 After wizard completion, every sheet in the folder appears in the §9.0 step-3 review list with the correct status badge.
- AC-10.4 Re-running setup from `/admin` settings opens the wizard with empty `pending_folder_*` fields. **`watched_folder_id` is NOT cleared** — the existing active folder keeps syncing while the wizard runs. Promotion happens only on wizard exit, atomic per the §4.5 SQL.
- AC-10.5 Mid-wizard abandonment: leave the wizard open, navigate away. Cron continues to use the existing `watched_folder_id`; `pending_folder_*` may persist as orphan state. Next "Re-run setup" overwrites it. There is no live-sync blackout during the re-run.
- AC-10.6 Stale onboarding Apply rescans inline: stage a sheet during wizard step 3, then edit the sheet in Drive, then click Apply. The Drive re-verify finds the modtime advanced; instead of deleting the row and waiting for cron (which is disabled during onboarding), the wizard rescans inline and shows the freshly staged parse with `STAGED_PARSE_RESTAGED_INLINE`. The wizard never gets stuck waiting for cron during onboarding.

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
