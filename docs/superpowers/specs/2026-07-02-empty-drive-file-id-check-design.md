# Empty/whitespace `drive_file_id` DB CHECK + write-path guard — Design

**Date:** 2026-07-02
**Branch / worktree:** `fix/empty-drive-file-id-db-check` @ `/Users/ericweiss/fxav-emptyid-dbcheck` (off `origin/main` `0503190a`)
**Milestone lineage:** PR-1 (#239, `2e235e14`) backlog item — "DB CHECK on empty `drive_file_id` + the empty-id write-path."
**Autonomous-ship:** user-approved autonomous pipeline; both user-review gates (spec, plan) WAIVED. Spec self-review + Codex adversarial-review to APPROVE still run.

---

## 1. Problem & goal

PR-1 added a JS **read-path** guard (`assertNonEmptyDriveFileId`, `lib/drive/fetch.ts:136-140`) that throws `InvalidDriveFileIdError` before a blank/whitespace `fileId` reaches `drive.files.get` (fires at the sole read chokepoint `driveFilesGet`, `lib/drive/fetch.ts:345`). That guard covers **zero DB writes** — every `INSERT`/`UPSERT`/RPC that persists a `drive_file_id` bypasses it, and the SECURITY DEFINER RPCs that write `drive_file_id` in-SQL never touch JS. A blank `drive_file_id` is not merely a hygiene problem: `shows.drive_file_id` is the advisory-lock key source (`hashtext('show:' || drive_file_id)`, e.g. `20260524000002_claim_oauth_identity.sql:40`), so a blank collapses distinct shows onto one lock — a correctness/deadlock hazard.

**Goal:** make an empty or whitespace-only `drive_file_id` **impossible to persist**, via a DB-level CHECK on every `drive_file_id` column (the only write-side enforcement layer), and close the one route where a whitespace value is actually reachable from untrusted input with a fail-fast HTTP 400.

**Non-goals:**
- No change to the JS read-path guard (`assertNonEmptyDriveFileId`) — it stays as-is.
- No `supabase/tables/` inline-CHECK mirror. **This project has no `supabase/tables/` directory** (`supabase/config.toml:58` `schema_paths = []`; migrations-only). The AGENTS.md "inline CHECK in tables/" clause is inherited pay-engine boilerplate and does not apply. There is exactly one DDL surface: the new migration file.
- The two **secondary-name** Drive-ID columns (`shows.opening_reel_drive_file_id`, `wizard_finalize_checkpoints.last_processed_drive_file_id`) are **out of scope** — see §9 BACKLOG. The scope rule is crisp and defensible: *every column whose name is exactly `drive_file_id`.*

---

## 2. Scope — the exact CHECK set

Rule: **every public column named exactly `drive_file_id`** (14) gets a non-blank CHECK; the 5-table `dev.*` clone subset that carries the column is mirrored (matching the `20260630000001_transportation_loadout_contact.sql` both-schema precedent and the `dev_schema_clone` P0-parity principle).

### 2.1 Public — NOT NULL `drive_file_id` (12) → `check (drive_file_id ~ '[^[:space:]]')`

| Table | Definition |
|---|---|
| `shows` | `20260501000000_initial_public_schema.sql:5` (also inline UNIQUE; advisory-lock key source) |
| `pending_syncs` | `20260501001000_internal_and_admin.sql:140` |
| `pending_ingestions` | `…internal_and_admin.sql:187` |
| `sync_audit` | `…internal_and_admin.sql:207` |
| `deferred_ingestions` | `…internal_and_admin.sql:252` |
| `onboarding_scan_manifest` | `…internal_and_admin.sql:340` |
| `pending_snapshot_uploads` | `…internal_and_admin.sql:365` |
| `revision_race_cooldowns` | `…internal_and_admin.sql:412` (PK member) |
| `shows_pending_changes` | `…internal_and_admin.sql:436` |
| `show_change_log` | `20260608000001_show_change_log.sql:10` |
| `sync_holds` | `20260608000000_sync_holds.sql:9` |
| `agenda_extract_leases` | `20260629000001_agenda_extract_leases.sql:4` (PK member; the sole untrusted-input write path — §5) |

### 2.2 Public — NULLABLE `drive_file_id` (2) → `check (drive_file_id is null or drive_file_id ~ '[^[:space:]]')`

| Table | Definition |
|---|---|
| `sync_log` | `20260501001000_internal_and_admin.sql:224` |
| `app_events` | `20260629000002_app_events.sql:12` |

### 2.3 `dev.*` mirror subset (5) — same constraint name, same predicate

`dev.shows` (`20260502000000_dev_schema_clone.sql:47`, NOT NULL), `dev.pending_syncs` (:209, NOT NULL), `dev.pending_ingestions` (:260, NOT NULL), `dev.sync_audit` (:283, NOT NULL), `dev.sync_log` (:303, NULLABLE). The other 9 public tables have **no** dev mirror — nothing to add. Use unconditional `alter table dev.<t>` (matches the transportation-loadout precedent, which applies cleanly to the validation project).

### 2.4 Constraint naming

House convention `<table>_<column>_<descriptor>` → uniform `<table>_drive_file_id_nonblank`. All ≤ 63 bytes (longest: `onboarding_scan_manifest_drive_file_id_nonblank` = 47). Constraint names are schema-scoped, so `public.<t>` and `dev.<t>` share the identical constraint name without collision.

---

## 3. Predicate rationale

- Chosen: **`drive_file_id ~ '[^[:space:]]'`** — "contains at least one non-whitespace char." Faithful SQL translation of the PR-1 JS guard `!/\S/.test(fileId)` (`lib/drive/fetch.ts:139`; same `/\S/` idiom at `lib/drive/exportSheetToMarkdown.ts:13`, `lib/drive/sourceAnchors.ts:21`).
- **Rejected `btrim(x) <> ''`:** default `btrim`/`trim` strips only ASCII space U+0020, so a tab-only or newline-only value would *pass* `btrim(x) <> ''` yet is *rejected* by JS `/\S/` — that CHECK would be looser than the guard. `[^[:space:]]` matches the guard's tab/newline rejection.
- **`[^[:space:]]` over `\S`:** equivalent under Postgres ARE, but `[^[:space:]]` is explicit and carries no string-literal-backslash ambiguity. (Immaterial nuance: JS `\s` includes Unicode/BOM whitespace, POSIX `[:space:]` is ASCII-only — irrelevant for Drive IDs, which are `[A-Za-z0-9_-]`.)
- **NULL semantics:** a bare regex CHECK evaluates `NULL → PASS`, so it never rejects NULL by itself. NOT-NULL columns keep their existing `NOT NULL`; nullable columns use the explicit `is null or …` form (mirrors the email-CHECK style at `20260520000911_add_email_canonical_checks.sql:23` and the loadout precedent).

---

## 4. Migration — `supabase/migrations/20260702120200_drive_file_id_nonblank.sql`

Sorts immediately after the current latest migration `20260702120100_ignored_warnings_rls.sql`. **Apply-twice idempotent**: every constraint is `DROP CONSTRAINT IF EXISTS` then `ADD CONSTRAINT` (established pattern: `20260512082710_add_show_unpublish_token.sql:10-24`, all ADDs in `20260520000911_add_email_canonical_checks.sql`). Plain validating `ADD` (no `NOT VALID`/`VALIDATE` split — none exists in this repo; tables are small-to-moderate). Header comment documents purpose + idempotency + the "faithful `/\S/` translation" rationale.

Shape (representative rows; the file enumerates all 14 public + 5 dev):

```sql
-- Reject empty/whitespace-only drive_file_id at the DB — the only write-side enforcement
-- layer (the JS assertNonEmptyDriveFileId guard is read-path only, covers zero writes).
-- Predicate `~ '[^[:space:]]'` is the faithful SQL translation of the JS `/\S/` guard
-- (rejects tab/newline-only, which btrim(x)<>'' would wrongly accept).
-- Apply-twice safe: DROP CONSTRAINT IF EXISTS then ADD, per row.

-- NOT NULL columns (public) — 12
alter table public.shows drop constraint if exists shows_drive_file_id_nonblank;
alter table public.shows add constraint shows_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');
-- … pending_syncs, pending_ingestions, sync_audit, deferred_ingestions,
--    onboarding_scan_manifest, pending_snapshot_uploads, revision_race_cooldowns,
--    shows_pending_changes, show_change_log, sync_holds, agenda_extract_leases …

-- NULLABLE columns (public) — 2
alter table public.sync_log drop constraint if exists sync_log_drive_file_id_nonblank;
alter table public.sync_log add constraint sync_log_drive_file_id_nonblank
  check (drive_file_id is null or drive_file_id ~ '[^[:space:]]');
alter table public.app_events drop constraint if exists app_events_drive_file_id_nonblank;
alter table public.app_events add constraint app_events_drive_file_id_nonblank
  check (drive_file_id is null or drive_file_id ~ '[^[:space:]]');

-- dev.* mirror — 5 (shows/pending_syncs/pending_ingestions/sync_audit NOT NULL; sync_log NULLABLE)
alter table dev.shows drop constraint if exists shows_drive_file_id_nonblank;
alter table dev.shows add constraint shows_drive_file_id_nonblank
  check (drive_file_id ~ '[^[:space:]]');
-- … dev.pending_syncs, dev.pending_ingestions, dev.sync_audit (NOT NULL) …
alter table dev.sync_log drop constraint if exists sync_log_drive_file_id_nonblank;
alter table dev.sync_log add constraint sync_log_drive_file_id_nonblank
  check (drive_file_id is null or drive_file_id ~ '[^[:space:]]');
```

### 4.1 CHECK/enum migration matrix (AGENTS.md)

| Clause | Disposition |
|---|---|
| (a) predicate accepts every valid value | Drive IDs (`[A-Za-z0-9_-]`) all contain a non-whitespace char → PASS; NULL → PASS on nullable columns |
| (b) rejects disallowed values | `''`, `'   '`, `'\t'`, `'\n'` → all fail `~ '[^[:space:]]'` |
| (c) transitional window | **N/A** — no `tables/`-vs-`migrations/` two-phase apply (no `tables/` dir); no old/new coexistence window |
| (d) apply-twice idempotency | `DROP … IF EXISTS` + `ADD` on every constraint (public + dev) |
| (e) one-shot lifecycle | Migration references no retired columns; no `DO $$` early-return hazard; pure `alter table` statements |

---

## 5. Write-path guard (the one reachable-empty path)

Write-path survey (31 sites / 15 columns): all business-key writes originate from non-empty sources — Drive `files.list` filtered by `toListedFile()` which drops falsy ids (`lib/drive/list.ts:59`), `extractOpeningReel()` (non-empty-or-null), prior guarded DB reads, or fixed-prefix synthetic literals. The `"unclear"` writes are nullable telemetry (`sync_log`, `app_events`) backstopped by the null-allowing CHECK.

**The single path where untrusted input reaches a `drive_file_id` write unvalidated:**
`app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`. `driveFileId` comes from the URL segment (`const { wizardSessionId, driveFileId } = await context.params;`, `:212`) and flows straight into `claimExtractLease(tx, { wizardSessionId, driveFileId, owner })` at `:228` — a raw-SQL `INSERT INTO … agenda_extract_leases (wizard_session_id, drive_file_id, owner, expires_at)` (`lib/agenda/extractAgendaLease.ts:85-89`) that runs **before** the `pending_syncs` existence read at `:260-266`. A Next.js dynamic segment cannot be literally empty, but **can be whitespace-only via URL encoding** (`%20` → `" "`). The same value also seeds the advisory-lock key at `:393` (`hashtext('show:' || ${driveFileId})`), so a blank poisons the lock too.

**Fix:** at route entry, immediately after `:212`, before `claimExtractLease`:
```ts
if (!/\S/.test(driveFileId)) {
  return NextResponse.json({ error: "invalid driveFileId" }, { status: 400 });
}
```
- **HTTP 400, not a thrown `InvalidDriveFileIdError`.** That error `extends DriveFetchError` (`lib/drive/fetch.ts:119`) and would be misclassified as a *Drive fault* by downstream classifiers; a malformed route param is a **client** error.
- Reuse the `/\S/` predicate so route guard and DB CHECK are semantically identical.
- Match the route's existing response shape (verify the exact `NextResponse.json` error-body shape used by sibling early returns in this file during implementation; conform to it).

The DB CHECK on `agenda_extract_leases.drive_file_id` remains the backstop even if the route guard is ever bypassed.

---

## 6. Existing-data safety (pre-apply)

`ADD CONSTRAINT` validates existing rows immediately — one offending row errors the migration mid-apply. The migration validates **19 tables** (14 public + 5 dev), so the detector must cover **all 19** — a blank in any `dev.*` table would fail the apply after a public-only preflight reported "clean" (Codex R1 HIGH-1). Run **both** detectors below against **every target the migration will be applied to** (local; validation).

**Public detector (run against local AND validation — always safe):**
```sql
-- returns offending (table, drive_file_id) rows; MUST be empty before the ADD
select 'shows' as t, drive_file_id from public.shows where drive_file_id !~ '[^[:space:]]'
union all select 'pending_syncs', drive_file_id from public.pending_syncs where drive_file_id !~ '[^[:space:]]'
union all select 'pending_ingestions', drive_file_id from public.pending_ingestions where drive_file_id !~ '[^[:space:]]'
union all select 'sync_audit', drive_file_id from public.sync_audit where drive_file_id !~ '[^[:space:]]'
union all select 'deferred_ingestions', drive_file_id from public.deferred_ingestions where drive_file_id !~ '[^[:space:]]'
union all select 'onboarding_scan_manifest', drive_file_id from public.onboarding_scan_manifest where drive_file_id !~ '[^[:space:]]'
union all select 'pending_snapshot_uploads', drive_file_id from public.pending_snapshot_uploads where drive_file_id !~ '[^[:space:]]'
union all select 'revision_race_cooldowns', drive_file_id from public.revision_race_cooldowns where drive_file_id !~ '[^[:space:]]'
union all select 'shows_pending_changes', drive_file_id from public.shows_pending_changes where drive_file_id !~ '[^[:space:]]'
union all select 'show_change_log', drive_file_id from public.show_change_log where drive_file_id !~ '[^[:space:]]'
union all select 'sync_holds', drive_file_id from public.sync_holds where drive_file_id !~ '[^[:space:]]'
union all select 'agenda_extract_leases', drive_file_id from public.agenda_extract_leases where drive_file_id !~ '[^[:space:]]'
union all select 'sync_log', drive_file_id from public.sync_log where drive_file_id is not null and drive_file_id !~ '[^[:space:]]'
union all select 'app_events', drive_file_id from public.app_events where drive_file_id is not null and drive_file_id !~ '[^[:space:]]';
```

**Dev detector (run against every target that has the `dev` schema).** The migration touches `dev.*` unconditionally, so wherever the migration is applied the `dev` clone must exist — run this there too. To avoid a hard error on a target that lacks `dev`, guard on `to_regclass` first (`select to_regclass('dev.shows')` — if NULL, the target has no dev clone and neither the dev detector nor the migration's `dev.*` ALTERs apply; see §7 step 3):
```sql
select 'dev.shows' as t, drive_file_id from dev.shows where drive_file_id !~ '[^[:space:]]'
union all select 'dev.pending_syncs', drive_file_id from dev.pending_syncs where drive_file_id !~ '[^[:space:]]'
union all select 'dev.pending_ingestions', drive_file_id from dev.pending_ingestions where drive_file_id !~ '[^[:space:]]'
union all select 'dev.sync_audit', drive_file_id from dev.sync_audit where drive_file_id !~ '[^[:space:]]'
union all select 'dev.sync_log', drive_file_id from dev.sync_log where drive_file_id is not null and drive_file_id !~ '[^[:space:]]';
```

- **Expected: 0 rows from both.** No committed fixture/seed produces a blank (`supabase/seed.ts:93-95` `"seed-fixture:"+…`; `seedWalkerFixtures.ts:100-120`; `dev:fixture:`/`validation_` prefixes).
- **If rows return: STOP and investigate — do NOT auto-heal.** A NOT-NULL column cannot be NULLed; deleting a `shows` row cascades destructively. Remediate deliberately, re-run, then apply. (Validation/prod rows aren't inspectable from the tree; the query is the only proof.)

---

## 7. validation-schema-parity + apply steps

1. **Local (TDD):** failing test first → write migration → apply locally (`psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f supabase/migrations/20260702120200_drive_file_id_nonblank.sql`) + `notify pgrst, 'reload schema';` → tests pass.
2. `pnpm gen:schema-manifest` — a **CHECK-only migration adds no column/table**, so the columns-only manifest (`scripts/schema-manifest/lib.ts`) sees **zero diff**. Run it anyway per discipline; expect nothing to stage.
3. **Surgical validation apply** (`supabase db push` is blocked by Phase-0 divergence): `psql "$TEST_DATABASE_URL" -f supabase/migrations/20260702120200_drive_file_id_nonblank.sql` + `notify pgrst,'reload schema';`. **`TEST_DATABASE_URL` lives in MAIN `.env.local`, not the worktree.** Run the §6 detector against validation first.
   - If the validation project lacks the `dev` schema, the `alter table dev.*` lines error → fall back to `alter table if exists dev.<t>` for the dev block and re-apply. (The transportation-loadout precedent applied its unconditional `dev.` block to validation without issue, so `dev` is expected to exist there; verify at apply time.)

### 7.1 Gate blind-spot → close it with a validation-observable CHECK layer (Codex R1 HIGH-2)

`validation-schema-parity` (`tests/db/validation-schema-parity.test.ts`) is **columns-only** today — its two layers parse `add column`/`create table` and do byte-equality on the columns manifest; **neither observes CHECK constraints.** So the CI parity gate would pass **whether or not** the step-3 surgical apply ran — knowingly leaving the exact historical "committed migration never reached the validation DB" drift class unguarded for CHECK-only migrations.

**We do not accept that.** This spec adds **Layer 3: CHECK-constraint parity** to the same test (§8.4), which runs in the same `validation-schema-parity` CI job (with `TEST_DATABASE_URL` set, `x-audits.yml:369-402`) and **fails CI if the surgical validation apply was skipped**. Enforcement is therefore three-legged, and the CI leg is now real:
- (a) the CI Layer-3 check (§8.5) — validation-observable; a skipped apply → red CI;
- (b) the local behavioral `.db.test` (§8.2) — proves the predicate actually rejects blanks;
- (c) not skipping the surgical apply (§7 step 3) — now enforced by (a), not just discipline.

This follows the AGENTS.md structural-defense calibration: ship the structural guard (the Layer-3 meta-assertion) in this same PR rather than relying on a human remembering the apply.

---

## 8. Test surface (TDD)

### 8.1 `tests/db/schema.test.ts` — static parse (DB-free, runs in CI) — **all 14 public + 5 dev**

New `describe("drive_file_id nonblank CHECK migration")` modeled on the transportation-loadout block (`tests/db/schema.test.ts:260-290`): read `20260702120200_drive_file_id_nonblank.sql`, `.replace(/\s+/g, " ")`, and for each table assert the presence of both `drop constraint if exists <name>` and `add constraint <name> … check ( drive_file_id ~ '[^[:space:]]' )` (whitespace-insensitive regex, per the existing :106-108/:178-180 assertion style). Nullable tables assert the `is null or` form. Loop `[public, dev]` **only** for the 5-table dev subset. **Do not modify** the `shows` CREATE-TABLE assertion at `:56-84`.
This proves **presence** of all 19 constraints; it does not (cannot) prove behavior.

### 8.2 `tests/db/driveFileIdNonblank.db.test.ts` — behavioral (local Postgres) — **the only real enforcement**

Anti-tautology split: §8.1 proves the DDL is declared; this proves the predicate *behaves*. Exercise a representative, high-value subset rather than all 14 (each insert must satisfy the table's other NOT-NULL/FK columns):
- **`agenda_extract_leases`** (the reachable path, simplest insert: `wizard_session_id, drive_file_id, owner, expires_at`): insert `''`, `'   '`, `'\t'` → expect `check_violation` (SQLSTATE `23514`); insert a valid id → success.
- **`shows`** (flagship + advisory-lock key): reuse the existing held-show insert helper pattern from `tests/onboarding/finalizeHeldCreation.db.test.ts`; blank `drive_file_id` → `check_violation`; valid → success.
- **One nullable** (`sync_log` or `app_events`): `NULL` → success; `''`/`'   '` → `check_violation`; valid → success.
- Introspect `pg_constraint` (precedent `tests/db/show_share_tokens.test.ts`, `tests/db/admin-emails.test.ts`) to assert the constraint exists with the expected name on all 14 public tables (cheap, closes the "declared but not created" gap the static parse can't).

### 8.3 `tests/…/extractAgenda…` route-guard test — the §5 fix

Assert the extract-agenda route returns **400** for a whitespace-encoded `driveFileId` **before** `claimExtractLease` writes a lease (spy/mock the lease claim and assert it was **not** called). Template: the existing `assertNonEmptyDriveFileId` unit coverage at `tests/drive/invalidDriveFileId.test.ts:11-20` (already asserts the `/\S/` predicate for `["", "   ", "\t", undefined, null]`). Locate the route's existing test file during implementation; add the case there.

### 8.4 `tests/db/validation-schema-parity.test.ts` — **Layer 3: CHECK-constraint parity** (validation-observable; closes Codex R1 HIGH-2)

Extend the existing parity test (same file → same `validation-schema-parity` CI job, same `TEST_DATABASE_URL`, same `execFileSync("psql", …)` helper + connect-guard/skip logic at `tests/db/validation-schema-parity.test.ts:75-114,166-204`) with a third layer:

1. **Derive the expected set from the migration file (no hardcoding):** read `supabase/migrations/20260702120200_drive_file_id_nonblank.sql`, extract every `add constraint <name> … check` where the target is a `public.` table (regex on the normalized SQL) → the set of expected public `*_drive_file_id_nonblank` constraint names (currently 14; auto-covers any future addition to this migration).
2. **Assert against the validation DB (only when `TEST_DATABASE_URL` is set):** `psql "$TEST_DATABASE_URL" -qAtc "select conname from pg_constraint where conname like '%\_drive\_file\_id\_nonblank' and connamespace = 'public'::regnamespace"` → assert the returned set is a **superset** of the expected set. A missing constraint (i.e. the surgical validation apply was skipped) → **test fails → red CI**.
3. **Skip gracefully** when `TEST_DATABASE_URL` is unset (local dev) — mirror the existing Layer-2 skip so local `pnpm test` is unaffected; the assertion is meaningful only against the validation target in CI.

This is the CI leg that makes "the migration reached validation" observable for a CHECK-only change — the columns-only Layers 1-2 cannot. (Scope note: it checks `public.` only; `dev.*` is local-seed infra, not a validation deploy target, consistent with the existing gate's public-only posture.)

### 8.5 Meta-test inventory

**EXTENDS** the structural meta-test `tests/db/validation-schema-parity.test.ts` (new Layer 3, §8.4) and **EXTENDS** `tests/db/schema.test.ts` (new static-parse describe, §8.1). No brand-new meta-test file. (Declared explicitly per the AGENTS.md meta-test-inventory rule.)

---

## 9. Out of scope → BACKLOG

- **`shows.opening_reel_drive_file_id`** (`…initial_public_schema.sql:16`, nullable) — write source `extractOpeningReel()` returns non-empty-or-null, and any read of it flows through the JS read-path guard. Not reachable-empty. `BL-OPENING-REEL-DRIVE-ID-NONBLANK`.
- **`wizard_finalize_checkpoints.last_processed_drive_file_id`** (`…internal_and_admin.sql:423`, nullable) — a cursor copy of an already-CHECK'd `drive_file_id`. `BL-CHECKPOINT-CURSOR-DRIVE-ID-NONBLANK`.
Both excluded to keep the scope rule crisp ("every column named exactly `drive_file_id`"); neither is reachable-empty. Documented, not silently dropped.

---

## 10. Guard conditions & self-consistency

- **Advisory-lock invariant (AGENTS.md #2):** this migration adds only CHECK constraints; it introduces **no** new `pg_advisory*` holder and touches no lock topology. N/A to the single-holder rule.
- **PostgREST DML lockdown:** unchanged — CHECKs don't alter grants.
- **No raw error codes in UI (#5):** the route 400 returns a generic `{ error: "invalid driveFileId" }` body (an API JSON error, not user-facing copy); no §12.4 code is introduced. This is a backend API contract, not a rendered surface.
- **Predicate single-sourced:** `~ '[^[:space:]]'` (SQL) and `/\S/` (JS) are stated once here (§3) and referenced everywhere; every DDL row and test uses the identical predicate.
- **Numeric sweep:** 14 public `drive_file_id` columns (12 NOT NULL + 2 nullable), 5 dev-mirror, **19 constraints total**, 1 route guard, longest constraint name 47 ≤ 63. The §6 pre-apply detector covers **all 19 tables** (14 public + 5 dev, the latter `to_regclass`-guarded). Test surface = §8.1 static-parse (19 constraints) + §8.2 behavioral `.db.test` + §8.3 route-guard + §8.4 CI Layer-3 validation parity (public 14). These counts are cross-referenced in §2, §4, §6, §8 and must stay consistent.
