# Agenda-PDF Schedule (admin Step-3 async-decouple) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each onboarding sheet's agenda-PDF schedule in the admin Step-3 review card, extracted asynchronously by a per-show endpoint that fills the card live ("parsing agenda…" → blocks) and carries the agenda to publish.

**Architecture:** The scan stays PDF-free. A new POST endpoint `extract-agenda/[wizardSessionId]/[driveFileId]` extracts one staged row off the `show:` lock (no DB connection held during Drive work), behind a durable `agenda_extract_leases` row (per-staged-row dedupe + a strict deployment-wide cap via a brief `agenda-extract-admit` advisory lock with expired-lease GC), with before/after Drive revision + source-scope fences, a persisted-`extracted` freshness invariant, and a brief `show:`-locked atomic conditional persist. The client polls and fills the card live; finalize re-reads `parse_result` (generation-scoped) under its existing per-row `show:` lock so publish carries the agenda.

**Tech Stack:** Next.js 16 (App Router, `maxDuration=300`), Supabase + raw `postgres.js` (`sql.begin`), pdfjs (`extractAgendaSchedule`), React 19 client component, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-06-27-agenda-pdf-schedule-merge.md` (Codex-APPROVED). Every task cites the spec section that defines its exact predicate/SQL/copy; the spec is the companion source of truth for verbatim SQL and the §8 test catalog.

## Global Constraints

- **TDD per task** (failing test → minimal impl → passing → commit); conventional-commit messages `<type>(<scope>): <summary>` — scope `agenda`/`parser`/`db`/`crew-page`/`admin`.
- **Per-show advisory lock (invariant 2):** the endpoint holds `show:`||dfid ONLY in tx#2 (brief persist) + a brief global `agenda-extract-admit` ONLY in **tx#1a** (admission claim — its own tx, commits before the tx#1b staged read, round-19); finalize REUSES its existing `defaultWithRowTx` `show:` lock (no new holder). NO advisory lock / DB connection held during the ≤300 s Drive work. (Spec §5.2, §5.6, §9.)
- **No DB connection during Drive (spec §5.2):** THREE SHORT txns (`sql.begin`) — tx#1a (admit+claim), tx#1b (staged read), tx#2 (show-locked persist+release) — nothing held between; the `agenda-extract-admit` lock lives ONLY in tx#1a (round-19).
- **Canonical `202` shape (round-21):** every `202` is `{ status: "pending", reason: "in_progress" | "queued" }`; client polling budgets are keyed ONLY from `reason`.
- **Supabase call-boundary (invariant 9):** endpoint `pending_syncs` + `agenda_extract_leases` reads/writes are raw `postgres.js` inside the sync-pipeline tx, NOT PostgREST.
- **PostgREST DML lockdown:** `agenda_extract_leases` REVOKEs all client DML+SELECT; registered in `tests/db/postgrest-dml-lockdown.test.ts`.
- **No raw error codes in UI (invariant 5):** card copy is descriptive UI text, not error codes.
- **UI quality gate (invariant 8):** the Step-3 card ships only after `/impeccable critique` AND `/impeccable audit` pass (Task 16).
- **`EXTRACTOR_VERSION` STAYS `1`** — do NOT bump (spec §5.5 / round-49).
- **Migration → validation parity:** the new migration applies locally + to the validation project `vzakgrxqwcalbmagufjh`, with `pnpm gen:schema-manifest` regenerated/committed (spec §9; `validation-schema-parity` gate).
- **Verify commands:** `pnpm vitest run <path>` for unit; `pnpm tsc --noEmit` for types; `pnpm lint` before each commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `lib/agenda/constants.ts` (modify) | All `AGENDA_*` numeric knobs; `EXTRACTOR_VERSION` unchanged (=1). |
| `supabase/migrations/<ts>_agenda_extract_leases.sql` (create) | Lease table + `expires_at` index + REVOKE. |
| `lib/agenda/extractAgendaSchedule.ts` (modify) | Page-cap early-LOW guard. |
| `lib/drive/agendaDrive.ts` (modify) | `downloadFileBytes` byte-cap + stall-guard + total-time deadline; `getAgendaChips` timeout/retry. |
| `lib/sync/enrichAgenda.ts` (modify) | Accept `AbortSignal`; per-PDF before+after revision stability; expose per-link confirmed-fresh + rev verdict. |
| `lib/agenda/agendaAdminPreview.ts` (create) | Server-pure `buildAdminAgendaPreview(links, opts?)`, `capExtractionForAdmin`, `agendaPdfHref`; `AdminAgendaItem` type. |
| `lib/agenda/extractAgendaLease.ts` (create) | Lease claim (admit-lock + GC + count + claim), owner-scoped release, in-memory slot/in-flight, deadline helpers. |
| `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` (create) | The endpoint: auth → fast-path → tx#1a → tx#1b → fence → extract → fence → tx#2 → 200/202/409. |
| `components/admin/OnboardingWizard.tsx` (modify) | `fetchStep3Data`: select `staged_modified_time`; build baseline preview; stamp `agendaStateKey`. |
| `components/admin/wizard/Step3Review.tsx` (modify) | `Step3Row` gains `adminAgendaPreview` + `agendaStateKey`. |
| `components/admin/wizard/Step3SheetCard.tsx` (modify) | `AgendaBreakdown` client component + 5-state fetch machine. |
| `app/api/admin/onboarding/finalize/route.ts` (modify) | Generation-scoped `parse_result` re-read under the existing per-row `show:` lock (both paths). |
| `tests/db/postgrest-dml-lockdown.test.ts` (modify) | Register `agenda_extract_leases`. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (modify) | Pin `agenda-extract-admit` (tx#1a, claim-only) + brief `show:` (tx#2); finalize adds no new holder. |

---

## Task 1: Agenda constants

**Files:**
- Modify: `lib/agenda/constants.ts`
- Test: `tests/agenda/constants.test.ts`

**Interfaces:**
- Produces: `AGENDA_PDF_MAX_BYTES`, `AGENDA_MAX_PAGES`, `AGENDA_MAX_PDFS_PER_SHEET`, `AGENDA_ADMIN_SESSIONS_CAP`, `AGENDA_ADMIN_TRACKS_PER_SESSION_CAP`, `AGENDA_CLIENT_CONCURRENCY`, `AGENDA_CLIENT_POLL_BUDGET_MS`, `AGENDA_CLIENT_QUEUE_BUDGET_MS`, `AGENDA_MAX_CONCURRENT_EXTRACTIONS`, `AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS`, `AGENDA_EXTRACT_LEASE_TTL_MS`, `AGENDA_PDF_DEADLINE_MS`, `AGENDA_EXTRACT_DEADLINE_MS`; `EXTRACTOR_VERSION` UNCHANGED (=1).

- [ ] **Step 1: Write the failing test** — append to `tests/agenda/constants.test.ts`:

```ts
import { test, expect } from "vitest";
import * as C from "@/lib/agenda/constants";

test("agenda async-decouple constants are defined with sane magnitudes", () => {
  expect(C.EXTRACTOR_VERSION).toBe(1); // round-49: NOT bumped
  expect(C.AGENDA_PDF_MAX_BYTES).toBe(25 * 1024 * 1024);
  expect(C.AGENDA_MAX_PAGES).toBe(80);
  expect(C.AGENDA_MAX_PDFS_PER_SHEET).toBe(6);
  expect(C.AGENDA_ADMIN_SESSIONS_CAP).toBe(8);
  expect(C.AGENDA_ADMIN_TRACKS_PER_SESSION_CAP).toBe(6);
  expect(C.AGENDA_CLIENT_CONCURRENCY).toBe(3);
  // deadlines strictly below the 300s route maxDuration
  expect(C.AGENDA_EXTRACT_DEADLINE_MS).toBeLessThan(300_000);
  expect(C.AGENDA_PDF_DEADLINE_MS).toBeLessThan(C.AGENDA_EXTRACT_DEADLINE_MS);
  // client poll budget ≈ one extraction window; queue budget strictly larger
  expect(C.AGENDA_CLIENT_POLL_BUDGET_MS).toBeGreaterThanOrEqual(300_000);
  expect(C.AGENDA_CLIENT_QUEUE_BUDGET_MS).toBeGreaterThan(C.AGENDA_CLIENT_POLL_BUDGET_MS);
  expect(C.AGENDA_EXTRACT_LEASE_TTL_MS).toBeGreaterThanOrEqual(300_000);
  expect(C.AGENDA_MAX_CONCURRENT_EXTRACTIONS).toBeGreaterThan(0);
  expect(C.AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS).toBeGreaterThanOrEqual(C.AGENDA_MAX_CONCURRENT_EXTRACTIONS);
});
```

- [ ] **Step 2: Run test to verify it fails** — `pnpm vitest run tests/agenda/constants.test.ts` → FAIL (`AGENDA_PDF_MAX_BYTES` undefined).

- [ ] **Step 3: Add the constants** to `lib/agenda/constants.ts` (keep `EXTRACTOR_VERSION = 1`):

```ts
export const AGENDA_PDF_MAX_BYTES = 25 * 1024 * 1024;
export const AGENDA_MAX_PAGES = 80;
export const AGENDA_MAX_PDFS_PER_SHEET = 6;
export const AGENDA_ADMIN_SESSIONS_CAP = 8;
export const AGENDA_ADMIN_TRACKS_PER_SESSION_CAP = 6;
export const AGENDA_CLIENT_CONCURRENCY = 3;
export const AGENDA_CLIENT_POLL_BUDGET_MS = 330_000;   // one extraction window + margin
export const AGENDA_CLIENT_QUEUE_BUDGET_MS = 900_000;  // queue wait behind the global cap
export const AGENDA_MAX_CONCURRENT_EXTRACTIONS = 4;    // per warm instance
export const AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS = 8; // deployment-wide (live-lease count)
export const AGENDA_EXTRACT_LEASE_TTL_MS = 330_000;
export const AGENDA_PDF_DEADLINE_MS = 120_000;
export const AGENDA_EXTRACT_DEADLINE_MS = 250_000;     // < maxDuration (300s)
```

- [ ] **Step 4: Run test to verify it passes** — `pnpm vitest run tests/agenda/constants.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(agenda): add async-decouple constants (no EXTRACTOR_VERSION bump)"`

---

## Task 2: `agenda_extract_leases` migration + manifest + validation apply

**Files:**
- Create: `supabase/migrations/<ts>_agenda_extract_leases.sql`
- Modify: `supabase/__generated__/schema-manifest.json` (regenerated)
- Test: `tests/db/agendaExtractLeases.schema.test.ts` (RED-first, this task's own guard)

**Interfaces:**
- Produces: table `public.agenda_extract_leases (wizard_session_id uuid, drive_file_id text, owner text, expires_at timestamptz, PK(wizard_session_id, drive_file_id))` + `agenda_extract_leases_expires_at_idx`. (Spec §10.)

- [ ] **Step 1: Write the FAILING schema test** (TDD invariant — round-6 plan finding) — `tests/db/agendaExtractLeases.schema.test.ts` against `$TEST_DATABASE_URL`:

```ts
import { test, expect } from "vitest";
import postgres from "postgres";
const sql = postgres(process.env.TEST_DATABASE_URL!);

test("agenda_extract_leases exists with PK, expires_at index, and DML revoked from authenticated", async () => {
  const cols = await sql`select column_name, data_type from information_schema.columns
    where table_schema='public' and table_name='agenda_extract_leases' order by column_name`;
  expect(cols.map(c => c.column_name).sort()).toEqual(["drive_file_id","expires_at","owner","wizard_session_id"]);
  const pk = await sql`select a.attname from pg_index i
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey)
    where i.indrelid='public.agenda_extract_leases'::regclass and i.indisprimary`;
  expect(pk.map(r => r.attname).sort()).toEqual(["drive_file_id","wizard_session_id"]);
  const idx = await sql`select indexname from pg_indexes
    where schemaname='public' and tablename='agenda_extract_leases' and indexdef ilike '%expires_at%'`;
  expect(idx.length).toBeGreaterThan(0);
  const grants = await sql`select privilege_type from information_schema.role_table_grants
    where table_schema='public' and table_name='agenda_extract_leases' and grantee='authenticated'`;
  expect(grants.length).toBe(0); // no INSERT/UPDATE/DELETE/SELECT for authenticated
});
```

- [ ] **Step 2: Run to verify it FAILS** — `pnpm vitest run tests/db/agendaExtractLeases.schema.test.ts` → FAIL (relation does not exist).

- [ ] **Step 3: Write the migration** (use the next timestamp in `supabase/migrations/`; idempotent DDL):

```sql
-- Agenda extract lease: per-staged-row dedupe + deployment-wide cap (live-lease count).
create table if not exists public.agenda_extract_leases (
  wizard_session_id uuid not null,
  drive_file_id text not null,
  owner text not null,
  expires_at timestamptz not null,
  primary key (wizard_session_id, drive_file_id)
);
create index if not exists agenda_extract_leases_expires_at_idx
  on public.agenda_extract_leases (expires_at);
-- RPC-gated: mutated only via the endpoint's raw postgres.js; no client DML or SELECT.
revoke insert, update, delete, select on table public.agenda_extract_leases from anon, authenticated;
```

- [ ] **Step 4: Apply locally** — `psql "$TEST_DATABASE_URL" -f supabase/migrations/<ts>_agenda_extract_leases.sql` then `supabase db query --linked "notify pgrst, 'reload schema';"` (or the repo's local-apply convention).

- [ ] **Step 5: Run the schema test to verify it PASSES** — `pnpm vitest run tests/db/agendaExtractLeases.schema.test.ts` → PASS (table + PK + index + REVOKE all present).

- [ ] **Step 6: Regenerate the schema manifest** — `pnpm gen:schema-manifest`; confirm `git diff supabase/__generated__/schema-manifest.json` includes `agenda_extract_leases`. (The `validation-schema-parity` Layer-1 tripwire fails if this is skipped.)

- [ ] **Step 7: Apply to the validation project** — surgically: `supabase db query --project-ref vzakgrxqwcalbmagufjh "$(cat supabase/migrations/<ts>_agenda_extract_leases.sql)"` (per AGENTS.md "Every migration must reach the validation project"). Confirm `tests/db/validation-schema-parity.test.ts` passes (validation ⊇ manifest).

- [ ] **Step 8: Commit** — `git add supabase/migrations supabase/__generated__/schema-manifest.json tests/db/agendaExtractLeases.schema.test.ts && git commit -m "feat(db): add agenda_extract_leases (RPC-gated, expires_at index) [TDD: schema test]"`

---

## Task 3: PostgREST DML lockdown — register `agenda_extract_leases`

**Files:**
- Modify: `tests/db/postgrest-dml-lockdown.test.ts` (add to the `RPC_GATED_TABLES` array ~line 135–412)
- Test: same file (its `describe.each`).

**Interfaces:**
- Consumes: the migration's REVOKE (Task 2).

- [ ] **Step 1: Add a registry entry** — append to `RPC_GATED_TABLES` an object matching the existing shape (`table, closed_at, selectAnon, selectAuthenticated, postBody, rowFilter`), using `agenda_extract_leases`, a representative insert `postBody` (`{ wizard_session_id: <uuid>, drive_file_id: "x", owner: "x", expires_at: <iso> }`), and `rowFilter` keyed on `drive_file_id`. Mirror the closest existing entry (e.g. `pending_syncs`).

- [ ] **Step 2: Run** — `pnpm vitest run tests/db/postgrest-dml-lockdown.test.ts` → the new row's anon/authenticated INSERT/UPDATE/DELETE/SELECT all rejected (PASS). If the local DB lacks the migration, apply Task 2 step 2 first.

- [ ] **Step 3: Negative-regression check** — temporarily `grant select on public.agenda_extract_leases to authenticated;` in a scratch psql session, re-run → the SELECT assertion must FAIL (proves the test is real); then `revoke` to restore. Do NOT commit the grant.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "test(db): register agenda_extract_leases in postgrest-dml-lockdown"`

---

## Task 4: `extractAgendaSchedule` page-cap guard

**Files:**
- Modify: `lib/agenda/extractAgendaSchedule.ts` (~line 131–142)
- Test: `tests/agenda/extractAgendaSchedule.test.ts`

**Interfaces:**
- Consumes: `AGENDA_MAX_PAGES` (Task 1).
- Produces: unchanged signature `extractAgendaSchedule(pdfBytes): Promise<AgendaExtraction>`; `extractorVersion` stays `1`.

- [ ] **Step 1: Write the failing test** — add to `tests/agenda/extractAgendaSchedule.test.ts`:

```ts
import { vi } from "vitest";
test("page cap: >AGENDA_MAX_PAGES → low confidence, no per-page parse, extractorVersion still 1", async () => {
  // Use a stub PDF doc seam if extractAgendaSchedule accepts an injected loader, else
  // mock pdfjs getDocument to return { numPages: AGENDA_MAX_PAGES + 1, getPage: spy }.
  const getPage = vi.fn();
  // ... wire the pdfjs mock so doc.numPages = 81 ...
  const x = await extractAgendaSchedule(new Uint8Array([1,2,3]));
  expect(x.confidence).toBe("low");
  expect(x.days).toEqual([]);
  expect(x.extractorVersion).toBe(1);
  expect(getPage).not.toHaveBeenCalled(); // early-LOW before the page loop
});
```

- [ ] **Step 2: Run to verify it fails** — `pnpm vitest run tests/agenda/extractAgendaSchedule.test.ts -t "page cap"` → FAIL.

- [ ] **Step 3: Add the guard** before the `for (let p = 1; p <= doc.numPages; p++)` loop (~line 142):

```ts
if (doc.numPages > AGENDA_MAX_PAGES) {
  return { confidence: "low", corrections: 0, days: [], extractorVersion: EXTRACTOR_VERSION };
}
```

(Import `AGENDA_MAX_PAGES` + `EXTRACTOR_VERSION` from `@/lib/agenda/constants`.)

- [ ] **Step 4: Run** → PASS; also `pnpm vitest run tests/agenda/extractAgendaSchedule.test.ts` (existing RFI/PCF/FIT cases still pass — they're ≤10pp).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(agenda): page-cap guard (early LOW > AGENDA_MAX_PAGES)"`

---

## Task 5: `agendaDrive` byte-cap + stall-guard + total-time deadline

**Files:**
- Modify: `lib/drive/agendaDrive.ts` (`downloadFileBytes` ~53–117, `getAgendaChips` ~76)
- Modify: `lib/sync/enrichWithDrivePins.ts` (the shared `DriveClient` interface, `downloadFileBytes?` ~:102, `getAgendaChips?` ~:115) — add the optional `{ signal?, deadlineMs? }` arg so callers thread cancellation through the SHARED boundary (round-7 plan finding)
- Modify: `lib/sync/mocks/mockDriveClient.ts` (match the new signature)
- Test: `tests/drive/agendaDrive.test.ts`; `tests/sync/driveClientImplCompleteness.test.ts` (the existing completeness meta-test must still pass — it pins every concrete client implements the interface)

**Interfaces:**
- Consumes: `AGENDA_PDF_MAX_BYTES`, `AGENDA_PDF_DEADLINE_MS`, `DRIVE_ASSET_STALL_TIMEOUT_MS` (existing), `createStallGuard` (`lib/drive/stallGuard.ts`).
- Produces: `downloadFileBytes(fileId, opts?: { signal?: AbortSignal; deadlineMs?: number })` returning `{ kind: "bytes", bytes } | { kind: "unavailable" } | { kind: "infra_error" }`; the `DriveClient` interface `downloadFileBytes?`/`getAgendaChips?` signatures gain the optional `opts` arg (backward-compatible — existing callers omit it).

- [ ] **Step 1: Write failing tests** (spec §8 test 3) — **(downloadFileBytes)** byte cap (`cap+1` stream → `unavailable`), stall guard (idle abort; slow-but-progressing → no false abort), and **slow-drip total deadline** (chunk just before each idle timeout, under the byte cap, exceeds `deadlineMs` → aborted → `infra_error`; assert resources released). Use Vitest fake timers + a mock Node stream emitting controlled chunks. **(getAgendaChips — round-8 plan finding: it is currently UNBOUNDED at `agendaDrive.ts:76`)** add red-first tests: (i) the Sheets request hangs past the timeout/`deadlineMs` → `getAgendaChips` resolves `{ kind: "infra_error" }` (NOT a hang); (ii) an already-aborted `opts.signal` → returns `infra_error` without calling Sheets; (iii) a transient 5xx/network error → ONE retry then success (or `infra_error` after the retry budget). Mock `google.sheets().spreadsheets.get` to control timing/errors + assert the abort/timeout fires.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — wire `readBoundedNodeStream(stream, AGENDA_PDF_MAX_BYTES, { onChunk })` for the byte cap; `createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS)` for idle (full wiring per spec §5.5: `signal`→`files.get({responseType:'stream',signal,retry:false})`, abort→`stream.destroy`, `reset` on `onChunk`, `clear` in `finally`, `timedOut()`→`infra_error`); AND a SEPARATE total-time `AbortController` armed with `deadlineMs ?? AGENDA_PDF_DEADLINE_MS` that is NOT reset on chunk, composed into the same `signal` (use `AbortSignal.any([stallGuard.signal, deadline.signal, opts?.signal].filter(Boolean))`). On the deadline firing → `{ kind: "infra_error" }`. **For `getAgendaChips` (round-8 plan finding — it is currently UNBOUNDED):** ADD bounding — pass the gaxios per-request option `{ signal, timeout: DRIVE_FILES_GET_TIMEOUT_MS }` as the SECOND arg to `sheets.spreadsheets.get(params, { signal: composedSignal, timeout })`, where `composedSignal` composes `opts?.signal` with a total-time `AbortController(opts?.deadlineMs ?? DRIVE_FILES_GET_TIMEOUT_MS)`; on timeout/abort/non-transient error → `{ kind: "infra_error" }`; ONE transient (5xx/ECONNRESET) retry. Do NOT phrase this as preserving a non-existent guard.
  - **Update the shared `DriveClient` interface** (`enrichWithDrivePins.ts:102/115`): `downloadFileBytes?: (fileId: string, opts?: { signal?: AbortSignal; deadlineMs?: number }) => Promise<…>` (and `getAgendaChips?` likewise) — keep the arg OPTIONAL so existing callers (scan/cron) compile unchanged. Update `lib/sync/mocks/mockDriveClient.ts` to the new signature. Run `pnpm vitest run tests/sync/driveClientImplCompleteness.test.ts` → still PASS (every concrete client conforms). Run `pnpm tsc --noEmit` → clean.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(agenda): per-PDF byte cap + idle stall + total-time deadline in downloadFileBytes"`

---

## Task 6: `enrichAgenda` — AbortSignal, per-PDF revision stability, per-link freshness verdict

**Files:**
- Modify: `lib/sync/enrichAgenda.ts` (~44–141)
- Test: `tests/onboarding/enrichAgendaIntegration.test.ts` (+ `tests/sync/enrichAgenda.test.ts` if present)

**Interfaces:**
- Consumes: `downloadFileBytes(opts)` (Task 5), `getAgendaChips`, `getFile` (DriveClient), `EXTRACTOR_VERSION`.
- Produces: `enrichAgenda(result, driveClient, spreadsheetId, opts?: { signal?: AbortSignal }): Promise<EnrichAgendaReport>` where `EnrichAgendaReport = { perLink: PerLinkVerdict[] }` and **`PerLinkVerdict` is a DISCRIMINATED union carrying the fresh extraction payload ONLY for `fresh` (round-4 plan finding)**: `{ ordinal: number; recoveredFileId?: string; verdict: "fresh"; extraction: AgendaExtraction } | { ordinal: number; recoveredFileId?: string; verdict: "known_stale" } | { ordinal: number; recoveredFileId?: string; verdict: "unknown" }`. The `extraction` is the freshly-confirmed payload (`extractorVersion`, `sourceRevision`, days…) — the endpoint persists ONLY from `verdict: "fresh"` entries, NEVER from the mutated `link.extracted` (the tx#1b read snapshot, which `enrichAgenda` preserves on refresh failure). (Spec §5.2 steps 5–6 / §5.7.)

- [ ] **Step 1: Write failing tests** — (a) per-PDF mid-download revision change: `getFile` returns `rev_before`, download+extract run, the after-`getFile` returns `rev_after !== rev_before` → that link's `verdict === "known_stale"` (NOT `"fresh"`; no `extraction` payload) (spec §8 test 2(i2)); (b) stable `rev_after === rev_before` + high-conf → `verdict === "fresh"` and `entry.extraction.sourceRevision === rev` (the payload rides the report, NOT `link.extracted`); **(b2) CACHE HIT → fresh with the STORED payload, no download** (round-12 plan finding): a link whose stored `extracted.sourceRevision === currentRev` (from `getFile`) AND `extracted.extractorVersion === EXTRACTOR_VERSION` → `verdict === "fresh"` with `entry.extraction = <the stored extracted>` and **`downloadFileBytes`/`getAgendaChips` are NOT called** (the cheap `getFile` confirmed currency) — so the endpoint can return ready blocks AND skip the expensive ops; (c) stored `extracted` has old `sourceRevision`, current `getFile` rev readable AND differs, download fails → `verdict === "known_stale"`; **(c2) version-stale, revision-CURRENT** (round-5 plan finding): stored `extracted.sourceRevision === currentRev` BUT `extracted.extractorVersion !== EXTRACTOR_VERSION`, `getFile` rev readable, no fresh extraction obtained → `verdict === "known_stale"` (NOT `"unknown"`) — proving the version mismatch alone marks stale even when the revision matches; (d) infra_error on `getFile` (current rev NOT readable) → `verdict === "unknown"`; (e) AbortSignal already aborted → no Drive calls, perLink empty/aborted; **(f) per-show PDF cap + capped smart-chip recovery** (spec §5.5 / §8 test 3, round-3/15 plan finding): a sheet with `N+1` SMART-CHIP agenda links (no fileIds) where `getAgendaChips` returns `N+1` chip rows → enrichAgenda processes only the first N: assert the first N links DO recover their `fileId` + extract (`verdict:"fresh"` for high-conf), AND link `N+1` does **NO `downloadFileBytes`** and ends with **NO recovered `fileId`** (only the skipped link lacks it; the first N are NOT broken by the length mismatch); assert `getAgendaChips` is called exactly ONCE (sheet-level), not per-link. **(f2) label-mismatch within first N → no wrong bind** (round-17): a chip row at ordinal `i < N` whose normalized label does NOT match link `i` (an inserted/reordered/hidden INFO row) → link `i` recovers NO `fileId` and does NO `downloadFileBytes` (stays note-only), and NO wrong PDF is bound/downloaded; a correctly-labeled link at another ordinal still recovers normally — proving recovery is ordinal+label, not positional-only.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — add the `opts.signal` param (pass to `downloadFileBytes`/`getAgendaChips`; bail if `signal.aborted`). **Cap the loop at `AGENDA_MAX_PDFS_PER_SHEET = N`** (round-3/15 plan finding): process at most the FIRST N agenda links; links at ordinal `>= N` are skipped (no download/extract, no `fileId` recovery). **Capped chip recovery — ordinal + LABEL correlation (round-15/17):** `getAgendaChips` is ONE sheet-level read (the whole INFO tab); when any processable ordinal `< N` lacks a `fileId`, call it ONCE and **allow the returned rows to be LONGER than N** (do NOT require `rows.length === links.length` — that breaks for N+1 links). For each ordinal `< N`, recover the `fileId` from the chip row at that ordinal **ONLY when the chip row's normalized label MATCHES the link's normalized label** (the existing `getAgendaChips` ordinal+label correlation — round-17: position alone is unsafe; an inserted/reordered/hidden row could bind the WRONG PDF to a label). A mismatch → **no recovery for that link** (it stays note-only — NEVER a wrong bind/download), not a positional guess. So the first N smart-chip links recover+extract WHEN their label aligns; the skipped (`>= N`) links lack a `fileId`. After each processed link's download+extract, **re-`getFile`** to read `rev_after`; first read `getFile` for the current rev; **CACHE HIT** (round-12) → if the stored `extracted.sourceRevision === currentRev && extracted.extractorVersion === EXTRACTOR_VERSION`, emit `"fresh"` with the STORED `extraction` and SKIP `downloadFileBytes`/`getAgendaChips`. Otherwise download+extract and emit a `PerLinkVerdict`: **`"fresh"`** + the freshly-extracted `extraction` payload when `(extraction.extractorVersion===EXTRACTOR_VERSION && extraction.sourceRevision===rev_before && rev_after===rev_before)`; **`"known_stale"`** when the current rev WAS readable (a `getFile` succeeded this call) AND NOT fresh AND the stored `extracted` is stale by EITHER axis — `(stored.extractorVersion !== EXTRACTOR_VERSION) || (stored.sourceRevision !== currentRev)` (round-5 plan finding: version mismatch alone is stale, even when the revision matches); **`"unknown"`** when the current rev was NOT readable (`getFile` `infra_error`) — only then is leave-existing safe. The fresh `extraction` rides the report — do NOT rely on the mutated `link.extracted` as the persist source. Return the `perLink` report (ordinal-indexed). Remove any `agendaBudget`/scan-deadline param. Keep `getAgendaChips` recovery (recovered fileId per ordinal). **Do not change crew/cron behavior beyond the additive signal + report + the already-present per-show cap** — existing callers ignore the return.

- [ ] **Step 4: Run** → PASS; run the full `tests/onboarding/enrichAgendaIntegration.test.ts`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(agenda): enrichAgenda accepts AbortSignal + returns per-link freshness verdict (per-PDF before/after rev)"`

---

## Task 7: `buildAdminAgendaPreview` (server-pure render shape)

**Files:**
- Create: `lib/agenda/agendaAdminPreview.ts`
- Test: `tests/agenda/agendaAdminPreview.test.ts`

**Interfaces:**
- Consumes: `normalizeAgendaExtraction` (`lib/agenda/normalizeAgendaExtraction.ts`), `agendaDisplayLabel` (`lib/agenda/agendaLabel.ts`), caps (Task 1).
- Produces: `type AdminAgendaItem = { label: string; badge: string | null; href: string | null; block: { extraction: AgendaExtraction; droppedSessions: number; droppedDays: number; droppedTracks: number } | null }`; `buildAdminAgendaPreview(links: AgendaLink[], opts?: { freshByLinkKey?: Set<number>; validatedHrefs?: boolean }): AdminAgendaItem[]`; `capExtractionForAdmin(ext, …)`; `agendaPdfHref(link)`. (Spec §5.4.)

- [ ] **Step 1: Write failing tests** — spec §8 test 1 cases (a)–(n2): two high-conf links → blocks (titles derived from `fixtures/agenda/*.pdf` extraction, NOT hardcoded); low/malformed/zero-day → note; **(m)** no `freshByLinkKey` ⇒ all note-only; **(n)** per-link ordinal gate — only ordinals in `freshByLinkKey` render blocks; stale `extracted` whose ordinal is absent → note-only; `buildAdminAgendaPreview` never reads version/revision to decide a block; **(n2)** duplicate-fileId: two links same `fileId`, ordinal 0 fresh + ordinal 1 absent → only ordinal 0 a block; **(h2)** `validatedHrefs` gate — same `fileId`/http link with NO `validatedHrefs` → `href: null`, WITH `validatedHrefs: true` → **`href === \`https://drive.google.com/file/d/${fileId}/view\`` (assert the EXACT absolute URL, round-6 plan finding, not merely non-null)**; href cases (e)–(h) assume `validatedHrefs: true` and assert exact URLs; cap cases (j)/(k)/(l) → `dropped*` overflow. **Anti-tautology:** derive expected session counts from the fixture extraction, not literals.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** per spec §5.4: block iff `opts.freshByLinkKey?.has(ordinal)` AND `normalizeAgendaExtraction(link.extracted)` is `high`/non-empty-days; `capExtractionForAdmin` enforces `AGENDA_ADMIN_SESSIONS_CAP`/`AGENDA_ADMIN_TRACKS_PER_SESSION_CAP` with `dropped*` siblings; `href = opts.validatedHrefs ? agendaPdfHref(link) : null`; `agendaPdfHref`: a non-empty `fileId` → the EXACT absolute URL `` `https://drive.google.com/file/d/${fileId}/view` `` (round-6 plan finding — NOT an app-relative path), else `link.url` ONLY when `/^https?:\/\//i.test(url)`, else `null`; badge when link count > 1; cap items at `AGENDA_MAX_PDFS_PER_SHEET`. Pure (no `server-only`/`fs`/Drive imports).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(agenda): buildAdminAgendaPreview (ordinal freshness gate, validatedHrefs, caps)"`

- [ ] **Step 6: Boundary-purity guard** (spec §8 test 5; round-3 plan finding) — create `tests/agenda/agendaPurityBoundary.test.ts` that reads the source of `lib/agenda/agendaAdminPreview.ts`, `components/crew/AgendaScheduleBlock.tsx`, and `lib/agenda/normalizeAgendaExtraction.ts` and asserts NONE import `server-only`, `next/headers`, `fs`, `googleapis`, or any `lib/drive/*` module (so they stay safe to bundle into the `"use client"` card). Run → PASS. Negative-regression: add a throwaway `import "server-only"` to `agendaAdminPreview.ts` → test FAILS → revert. Commit: `git add -A && git commit -m "test(agenda): boundary-purity guard for client-bundled render code"`.

---

## Task 8: Lease module (`extractAgendaLease.ts`)

**Files:**
- Create: `lib/agenda/extractAgendaLease.ts`
- Test: `tests/agenda/extractAgendaLease.test.ts` (DB-backed, uses `$TEST_DATABASE_URL` + `sql.begin`)

**Interfaces:**
- Consumes: caps (Task 1), the migration (Task 2).
- Produces: `claimExtractLease(tx, { wizardSessionId, driveFileId, owner }): Promise<{ ok: true } | { ok: false; reason: "queued" | "in_progress" }>` — **`queued`** when the global-cap count `>= K` (not started), **`in_progress`** when the `INSERT … ON CONFLICT` finds a LIVE lease for THIS exact `(wiz,dfid)` row (its extraction is running elsewhere). Distinct reasons because the client budgets them differently (spec §5.2 step 3 / round-2 plan finding). (admit-lock + GC + count + claim); `releaseExtractLease(tx, { wizardSessionId, driveFileId, owner })` (in-tx, owner-scoped DELETE, used by tx#2's successful persist); **`releaseExtractLeaseStandalone(sql, { wizardSessionId, driveFileId, owner }): Promise<void>`** that opens its OWN short `sql.begin` transaction and runs the same owner-scoped DELETE — for the endpoint's `finally` early-exit paths that have NO open tx (round-1 plan finding); `assertLeaseOwned` SQL fragment for the tx#2 persist guard; an in-memory slot store behind an INJECTABLE factory (round-11 plan finding) — `createInMemorySlotStore(): InMemorySlotStore` where `InMemorySlotStore.tryAcquire(key): { ownsInFlight, acquiredSlot, release }`; a module-level `defaultSlotStore` is the production singleton, but the factory lets route tests instantiate SEPARATE stores per simulated instance (spec §5.2 step 2).

- [ ] **Step 1: Write failing tests** (spec §8 test 2 d-cluster) — (d) two concurrent claims same `(wiz,dfid)` from independent `sql.begin` txns → one ok, one **`{ ok:false, reason:"in_progress" }`** (a LIVE lease for that exact row — NOT `queued`); (d-cap) K live leases for DISTINCT rows + a (K+1)-th distinct-row claim → **`{ ok:false, reason:"queued" }`** (global cap); assert the two reasons are NOT collapsed; **(d-cap-samerow) same-row duplicate AT full cap** (round-3 plan finding): K-1 live leases for OTHER rows + 1 live lease for the requested `(wiz,dfid)` (cap full) → a duplicate claim for that row returns **`{ ok:false, reason:"in_progress" }`** (NOT `queued` — the same-row check precedes the cap check); (d-x) different session same dfid → independent claim succeeds; (d-g) STRICT cap: K+N concurrent distinct-row claims → at most K succeed (the admit advisory lock serializes; **this test must FAIL on a bare count-then-insert**); (d2) many expired crash leases (`expires_at <= now()`) → next claim GCs them, live count excludes them, table row-count returns to ≈live; (d3) owner-scoped release (in-tx); **(d3b) `releaseExtractLeaseStandalone` opens its own tx and DELETEs the owner's row IMMEDIATELY** (assert the row is gone right after the call, NOT merely TTL-recoverable — round-1 plan finding); (d5) persist-guard `EXISTS(owner=me, unexpired)`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the claim as the single serialized sequence (spec §5.2 step 3): `pg_advisory_xact_lock(hashtext('agenda-extract-admit'))` → `DELETE FROM agenda_extract_leases WHERE expires_at <= now()` → **(round-3 plan finding) FIRST check THIS row's live lease BEFORE the global cap** so a same-row duplicate at full cap is `in_progress`, not `queued`: `SELECT 1 FROM agenda_extract_leases WHERE wizard_session_id=$1 AND drive_file_id=$2 AND expires_at > now()` → if found return `{ ok:false, reason:"in_progress" }` → else `SELECT count(*) FROM agenda_extract_leases` → if `>= AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS` return `{ ok:false, reason:"queued" }` → else `INSERT … ON CONFLICT (wizard_session_id, drive_file_id) DO UPDATE … WHERE expires_at < now() RETURNING owner` (0 rows = a LIVE lease for this row → `{ ok:false, reason:"in_progress" }` belt-and-suspenders; 1 row → `{ ok:true }`). (All under the admit lock, so the SELECT→count→INSERT sequence is race-free.) `releaseExtractLease(tx, …)`: `DELETE … WHERE wizard_session_id=$ AND drive_file_id=$ AND owner=$`. **`releaseExtractLeaseStandalone(sql, …)`**: `await sql.begin(tx => releaseExtractLease(tx, …))` — its own short connection for the no-open-tx `finally` paths. `createInMemorySlotStore()` returns an object closing over its OWN counter + `Set` (NOT module-level) so two stores are independent; `defaultSlotStore` is one such instance exported for production. (round-11 plan finding — enables per-instance route tests.)

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(agenda): durable extraction lease (admit-lock + GC + strict cap) + in-memory slot"`

---

## Task 9: The extract endpoint route

**Files:**
- Create: `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`
- Test: `tests/app/admin/extractAgenda.test.ts`

**Interfaces:**
- Consumes: `requireAdminIdentity` (`@/lib/auth/requireAdmin`, returns `{ email }`), Task 6 `enrichAgenda`, Task 7 `buildAdminAgendaPreview`, Task 8 lease module, `fetchDriveFileMetadata` (`lib/drive/fetch.ts`), `adoptShowLockHeld`/`withShowLock` (`lib/sync/lockedShowTx.ts`), `sql.begin` raw tx (mirror `finalize/route.ts:161`), `agendaDrive` download/chips.
- Produces: `POST` with `export const maxDuration = 300`; responses `200 { items }` / `202 { status: "pending", reason }` (Retry-After) / `409 { status:"stale" }` / `200 { items: [] }` / **`504 { status: "timeout" }` (round-13 plan finding — the deadline-race timeout; a NON-2xx the client maps to the `error` state, NOT `ready`/`stale`)**. **Testability seam (round-11):** the route reads its dependencies (the in-memory slot store, the `sql` client, optionally the DriveClient + `fetchDriveFileMetadata`) from an injectable `deps` object that defaults to production singletons (`defaultSlotStore`, the real `sql`) — so route tests instantiate TWO handlers with SEPARATE `createInMemorySlotStore()` stores to prove cross-instance behavior is enforced by the DURABLE lease, not the local in-flight guard.

- [ ] **Step 1: Write failing tests** — the full spec §8 test 2 catalog AT THE ROUTE BOUNDARY (round-8 plan finding: Task 8 covers the lease MODULE in isolation; these prove the ROUTE wires it). **Durable-lease d-cluster at the route** (DB-backed leases + **two route handlers each with a SEPARATE `createInMemorySlotStore()` via the `deps` seam — round-11 — so the cross-instance guarantee is enforced by the durable lease, not a shared local in-flight Set**): (d) two concurrent same-`(wiz,dfid)` POSTs through the TWO separate-store handlers → one extracts (one `downloadFileBytes`), the other gets `202 { status: "pending", reason: "in_progress" }` **and assert that reason came from the DURABLE lease claim (the second handler's local in-flight Set is empty — it did NOT short-circuit locally)**; (d-x) a new-session POST for the same `dfid` → independent extraction of ITS row; (d-g) K+N concurrent DISTINCT-row POSTs → at most K reach `downloadFileBytes`, the rest `202 { status: "pending", reason: "queued" }`; (d2) a stale-expired lease is GC'd by the next POST's admission (assert the row count returns to ≈live); (d3) success → tx#2 owner-scoped lease release (no live row after `200`); (d4) lease released on every exit (see (p)); (d5) **expired-owner clobber prevention**: owner A exceeds TTL, owner B reclaims+persists a newer revision, A reaches tx#2 → its `EXISTS(lease owner=A, unexpired)` guard makes the `UPDATE` affect 0 rows → `409`, A does NOT overwrite B's `parse_result`. Then the rest: (a) **auth — distinguish forbidden vs infra (round-14 plan finding, invariant 9):** (a1) `requireAdminIdentity()` rejects with the FORBIDDEN/control-flow error → `403 ADMIN_FORBIDDEN`, NO DB/Drive work; (a2) `requireAdminIdentity()` throws an `AdminInfraError`/`ADMIN_SESSION_LOOKUP_FAILED` (auth-backend outage) → a TYPED non-auth infra response (`500 { code: "ADMIN_SESSION_LOOKUP_FAILED" }`, mirroring `finalize/route.ts:903-906`), NOT a 403 and NOT a generic empty 500 — and NO lease claim / Drive work; (b) chip-based links over `fixtures/agenda/*.pdf` → `200` blocks + each fileId-backed item's `href === \`https://drive.google.com/file/d/${fileId}/view\`` (exact absolute URL, round-6) + persisted via raw `tx` UPDATE; (c) cache short-circuit (round-12): a row whose stored `extracted` matches the current `getFile` rev + version → the response RETURNS READY BLOCKS (the cache-hit `verdict:"fresh"` carries the stored payload) WITH zero `downloadFileBytes`/`getAgendaChips` (`getFile` allowed) — assert BOTH blocks present AND the expensive spies uncalled; (e)/(e2)/(e3)/(e3b additive non-agenda byte-identical); (h) smart-chip end-to-end + 2nd-call cache-hit; (i)/(i2) stale-refresh / mid-download rev → not persisted; (j) **no DB CONNECTION held during Drive — connection-lifetime, not just lock** (round-4 plan finding): run the endpoint against a **single-connection pool (`max: 1`)** AND/OR an instrumented `sql.begin` seam that records boundary order; assert the sequence is `tx#1a.begin → tx#1a.commit (admit lock released — round-19) → tx#1b.begin → tx#1b.commit → fetchDriveFileMetadata/enrichAgenda (Drive) → tx#2.begin → tx#2.commit` — i.e. **the admit-lock tx (tx#1a) commits BEFORE the staged read (tx#1b)**, and BOTH commit before any Drive work, and tx#2 BEGINS only after Drive completes (a `max:1` pool would DEADLOCK/timeout if any tx were held across Drive, so the test passing proves release). Keep the concurrent-`show:`-acquire + concurrent-DB-query assertions as a secondary check. **(j-from-report) persist sources ONLY from the report:** assert tx#2 sets `extracted` ONLY from `verdict:"fresh"` entries' `extraction` payload, never from a preserved/mutated `link.extracted` (mutate the tx#1b link object to a stale value and prove it is NOT persisted); (k)/(k2) reread-merge + ordinal-first duplicate-fileId; (l) rescan generation race; (m)/(m-a/b/c)/(m2) revision + source-scope fence (via `fetchDriveFileMetadata`); **(m3) configured-folder CHANGE during extraction** (round-17): the sheet's `parents` are unchanged but `app_settings.pending_folder_id` is CHANGED to a different folder between tx#1b and the after-fence → the after-fence re-reads the CURRENT `pending_folder_id`, sees the sheet is no longer in the configured scope → `409 stale`, no persist (assert `parse_result` unchanged); (n) ownership-scoped slot; (o) recovered-fileId-persists-on-download-fail; (f)/(g); **(p) lease released IMMEDIATELY on EVERY post-claim early exit** (round-1 plan finding): for each of {before-fence `409`, after-fence `409`, `enrichAgenda` throw, tx#2-stale `409`}, assert NO live `agenda_extract_leases` row remains for `(wiz,dfid)` right after the response (the `finally` ran `releaseExtractLeaseStandalone`), AND a subsequent claim for a DIFFERENT row is NOT falsely `queued` (the cap count doesn't include the released row); **(q) deadline timeout — abort + AWAIT settlement BEFORE releasing capacity** (round-3/9/10/12 plan finding): on `outcome.kind === "timed_out"`, the route ABORTS the controller and then **AWAITS the extraction promise's settlement** before releasing the lease/slot (round-12: a losing `Promise.race` branch is NOT killed — releasing the lease while the work still runs would let a retry claim a 2nd lease and breach the cap). Production Drive deps honor the signal (gaxios `{signal}` rejects on abort → `enrichAgenda` settles promptly), so the typical timeout releases quickly. Tests: **(q-cooperative)** mock `enrichAgenda` to REJECT when the signal aborts → on timeout, the route aborts → it settles → THEN the durable lease row is DELETED + slot/in-flight released + returns **exactly `504 { status: "timeout" }`** (assert status===504 + body), does NOT run tx#2 (no `report.perLink` deref); a retry can then claim. **(q-stuck) no double-admission while non-cooperative work runs** (the central round-12 assertion): mock `enrichAgenda` to NEVER settle even on abort → while the route is awaiting settlement, a CONCURRENT same-row retry gets `202 { status: "pending", reason: "in_progress" }` and a distinct-row burst still respects the global cap (the lease is HELD, not prematurely released) — the route only fully returns + releases bounded by `maxDuration` (the documented residual, lease self-heals via TTL-GC). Both must FAIL on an impl that releases capacity on the timeout branch before settlement, or falls through to tx#2. Use the lease module + a `sql.begin` test seam; mock the DriveClient + `fetchDriveFileMetadata`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the sequence exactly per spec §5.2 (auth — wrap `requireAdminIdentity()` so the FORBIDDEN/control-flow path → `403 ADMIN_FORBIDDEN` and an `AdminInfraError`/`ADMIN_SESSION_LOOKUP_FAILED` → `500 { code: "ADMIN_SESSION_LOOKUP_FAILED" }` (discriminated, before any lease/DB/Drive — mirror `finalize/route.ts:900-907`) → in-memory fast-path → **tx#1a** (`await sql.begin(tx => claimExtractLease(tx, …))` — the admit lock lives ONLY here and is released at this commit; round-19) → if `!ok` → `202`; → **tx#1b** (a SEPARATE `sql.begin` — NO admit lock): `SELECT staged_id, staged_modified_time, parse_result, <lifecycle> + app_settings.pending_folder_id` + lifecycle guard + capture generation → commit → **fence BEFORE** `fetchDriveFileMetadata` (`modifiedTime===staged_modified_time` AND `parents.includes(pending_folder_id)`; else 409, no Drive) → **extract** with a deadline race (round-9/10 plan finding): `const outcome = await Promise.race([ enrichAgenda(...,{ signal }).then(report => ({ kind: "report" as const, report })), deadlineTimer(AGENDA_EXTRACT_DEADLINE_MS).then(() => ({ kind: "timed_out" as const })) ])` — a **DISCRIMINATED union `{ kind:"report"; report } | { kind:"timed_out" }` (round-11 plan finding)**. **If `outcome.kind === "timed_out"`: abort the controller, then `await extractionPromise.catch(() => {})` to let the work SETTLE (round-12 — do NOT release the lease while the extraction may still be running; production Drive deps reject on abort and settle promptly), SKIP the after-fence + tx#2 entirely (no `report.perLink` deref, no merge), and return **`504 { status: "timeout" }`** (round-13 — an explicit non-2xx the client maps to the `error` state; the row stays note-only, agenda lands via cron post-publish). The `finally` releases the durable lease + in-memory slot — which now runs AFTER the work has settled, so a retry never overlaps a still-running extraction. (A truly non-settling dependency holds the lease until `maxDuration` — the documented residual, lease self-heals via TTL-GC.) Only `outcome.kind === "report"` proceeds to the after-fence and tx#2 (using `outcome.report`). **Scope of the guarantee (round-10):** this returns the route for any **async** hang — a slow/stalled Drive download, a pending `getAgendaChips`, a never-resolving I/O promise (the realistic hang shape) — because those yield to the event loop so the timer fires. A truly **CPU-bound, non-yielding** PDF parse would block the timer too; that case is bounded structurally by the input caps (§5.5: byte cap 25 MB + page-cap early-LOW at 80 pp BEFORE the per-page loop, so the synchronous parse work is small/bounded) and, in the pathological worst case, by the platform's 300 s `maxDuration` with the durable lease self-healing via TTL-GC (round-52) — a documented residual, NOT silently claimed away. (A worker-thread terminator is out of scope for this admin endpoint.) On timeout → typed note-only/`infra` result. NO DB held during any of this → **fence AFTER** (re-`fetchDriveFileMetadata` AND **re-read the CURRENT `app_settings.pending_folder_id`** — round-17, do NOT reuse the tx#1b value; 409 on revision OR current-scope mismatch) → **positive freshness** = the perLink report → **tx#2**: `sql.begin` → `pg_advisory_xact_lock(hashtext('show:' || $driveFileId))` (the canonical hashtext→bigint form — PostgreSQL has NO text overload; round-15 plan finding) → REREAD current `parse_result` → ordinal-first 3-way merge **driven by the `perLink` report, NOT `link.extracted`**: for each ordinal, set `extracted` from the report's `verdict:"fresh"` `extraction` payload; CLEAR `extracted` for `verdict:"known_stale"`; LEAVE for `verdict:"unknown"`; set `recoveredFileId` additively (any verdict) → atomic `UPDATE … WHERE wiz AND dfid AND staged_id AND staged_modified_time AND <active,not-finalize-consumed> AND EXISTS(lease owner=me, unexpired) RETURNING` (0 rows→409) → owner-scoped `releaseExtractLease(tx, …)` (in the SAME tx#2) → commit → `buildAdminAgendaPreview(mergedLinks, { freshByLinkKey, validatedHrefs: true })` where **`freshByLinkKey = new Set(report.perLink.filter(v => v.verdict === "fresh").map(v => v.ordinal))`** → 200). **Lease-release boundary (round-1 plan finding):** track two flags — `leaseClaimed` (set true after a successful tx#1a claim) and `leaseReleased` (set true after tx#2's in-tx release OR a tx#2 stale path that itself ran the DELETE). The route's `finally` does: `if (leaseClaimed && !leaseReleased) await releaseExtractLeaseStandalone(sql, { wizardSessionId, driveFileId, owner })` — opening its OWN short tx, so the post-tx#1b early exits (before/after-fence `409`, `enrichAgenda` throw, tx#2 stale before its release) DELETE the lease IMMEDIATELY (not TTL). The in-memory slot/in-flight is released in the same `finally` via the Task-8 `tryAcquireSlot().release`. **`202` reason mapping (round-2 plan finding):** in-memory in-flight set present → `202 { status: "pending", reason: "in_progress" }` (a sibling request for THIS row is extracting); in-memory no free slot → `202 { status: "pending", reason: "queued" }`; `claimExtractLease` failure → its returned reason verbatim (`queued` = global cap; `in_progress` = a live durable lease for this row). All `202` set `Retry-After`. The `202` paths claimed NOTHING durable (or the in-memory slot only) → `finally` releases only what was owned (`leaseClaimed` stays false for them).

- [ ] **Step 4: Run** → PASS (iterate until all §8 test-2 cases green).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(agenda): per-show extract-agenda endpoint (lease, fences, no-DB-during-Drive, atomic persist)"`

---

## Task 10: Advisory-lock topology meta-test

**Files:**
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts`

**Interfaces:**
- Consumes: the endpoint (Task 9) + the lease helper `lib/agenda/extractAgendaLease.ts` (Task 8). **(Round-7 plan finding: this task pins the ENDPOINT topology only — the finalize topology pin lives in Task 12, AFTER the finalize change exists.)**

- [ ] **Step 1: Extend the meta-test** to PIN the ENDPOINT topology by scanning **BOTH the route source AND `lib/agenda/extractAgendaLease.ts` (round-14 plan finding — the `agenda-extract-admit` acquisition lives in the helper, so a route-only scan can't prove single-holder)**: assert (1) the LEASE HELPER has **exactly ONE** `pg_advisory_xact_lock(hashtext('agenda-extract-admit'))` acquisition and **ZERO** `show:` acquisitions; (2) **the admit-lock tx (tx#1a) contains ONLY the claim — NO `pending_syncs`/`app_settings` SELECT (round-19): assert the route calls `claimExtractLease` inside its OWN `sql.begin` that commits BEFORE the tx#1b staged read** (the staged read is a separate `sql.begin`), so the admit lock can't span unrelated reads; (3) the ROUTE has **exactly ONE brief** `pg_advisory_xact_lock(hashtext('show:' || …))` (the canonical hashtext form — round-15) in tx#2; (4) NO advisory lock appears in the Drive window (between tx#1b commit and tx#2 begin). Follow the file's existing pin pattern (regex over each source + lock-order assertions). Do NOT assert anything about finalize here.

- [ ] **Step 2: Run** — `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` → PASS.

- [ ] **Step 3: Negative-regression (route AND helper)** — (i) temporarily add a stray `pg_advisory_xact_lock(hashtext('show:'...))` inside the Drive window of the route → the meta-test must FAIL; revert. (ii) temporarily add a second `agenda-extract-admit` acquisition OR a `show:` acquisition inside `lib/agenda/extractAgendaLease.ts` → the meta-test must FAIL (proves the helper scan is real — round-14); revert.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "test(auth): pin agenda-extract-admit + brief show: topology"`

---

## Task 11: `fetchStep3Data` — baseline preview + `agendaStateKey`

**Files:**
- Modify: `components/admin/OnboardingWizard.tsx` (`fetchStep3Data` ~191–245; SELECT ~229–232)
- Modify: `components/admin/wizard/Step3Review.tsx` (`Step3Row` ~74–85)
- Test: `tests/components/admin/fetchStep3Data.test.ts` (or extend the existing onboarding-wizard test)

**Interfaces:**
- Consumes: Task 7 `buildAdminAgendaPreview`.
- Produces: `Step3Row` gains `adminAgendaPreview: AdminAgendaItem[]` + `agendaStateKey: string`.

- [ ] **Step 1: Write failing test** — given a `pending_syncs` row with `agenda_links`, `fetchStep3Data` returns a `Step3Row` whose `adminAgendaPreview` is **note-only with `href: null`** (no `freshByLinkKey`, no `validatedHrefs`) and whose `agendaStateKey === \`${wizardSessionId}:${staged_id}:${staged_modified_time}\``. Empty `agenda_links` → `adminAgendaPreview: []`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — add `staged_modified_time` to the SELECT (~229–232); per row, `adminAgendaPreview = buildAdminAgendaPreview(arr(pr?.show?.agenda_links))` (omit both opts → note-only, href null); stamp `agendaStateKey`. Add both fields to `Step3Row` + the `AdminAgendaItem` import.

- [ ] **Step 4: Run** → PASS; `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(admin): baseline adminAgendaPreview + agendaStateKey in fetchStep3Data"`

---

## Task 12: Finalize generation-scoped re-read (publish-safety)

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (first-seen ~823–828; existing-show shadow ~771 / `stageExistingShowShadow` ~525–568)
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts` (finalize no-new-holder pin — step 5)
- Test: `tests/app/admin/finalizeAgendaRace.test.ts`

**Interfaces:**
- Consumes: the per-row `show:` lock already held by `defaultWithRowTx` (~164).

- [ ] **Step 1: Write failing test** (spec §8 test 7) — BOTH paths: finalize selects the row's `parse_result` (no agenda) first; an extraction persists the agenda under `show:`; finalize then applies → assert the published/shadow payload INCLUDES the extracted agenda (it re-read under the lock). Negative regression: NO concurrent extraction → payload unchanged. **Generation-scoped:** the row is REGENERATED (new `staged_id`) between the initial select and the locked re-read → the generation-scoped re-SELECT returns 0 rows → finalize treats it STALE (`demotePending`/`STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`), NO apply/shadow side effect.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — inside the already-`show:`-locked per-row tx, add a generation-scoped `SELECT parse_result FROM public.pending_syncs WHERE wizard_session_id=$1 AND drive_file_id=$2 AND staged_id=$3 AND staged_modified_time=$4`; 0 rows → existing stale path. First-seen: pass the re-read `parse_result` to `applyStagedCore`. Existing-show: pass it into `stageExistingShowShadow`'s `parse_result` (`:546`). Do NOT acquire a new lock (`adoptShowLockHeld` asserts only).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Pin the finalize advisory-lock topology** (round-7 plan finding — invariant 2, AFTER the change exists) — extend `tests/auth/advisoryLockRpcDeadlock.test.ts` to assert the §5.6 re-select adds NO new `show:` acquisition (finalize reuses the existing `defaultWithRowTx` `pg_advisory_xact_lock(hashtext('show:' || $1))` at `:164`; the re-`SELECT` runs inside that SAME locked tx; `adoptShowLockHeld` only asserts). Run → PASS. **Negative-regression:** temporarily add a second `pg_advisory_xact_lock(hashtext('show:'...))` around the re-select → the meta-test must FAIL (catches a duplicate/nested holder P0); revert.

- [ ] **Step 6: Run the full advisory-lock + finalize suites** — `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts tests/app/admin/finalizeAgendaRace.test.ts` → PASS.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "fix(admin): finalize re-reads parse_result generation-scoped under the per-row show lock (publish-safety) + advisory-lock pin"`

---

## Task 13: Client card — `AgendaBreakdown` + 5-state machine (UI — Opus)

**Files:**
- Modify: `components/admin/wizard/Step3SheetCard.tsx` (new `AgendaBreakdown`)
- Test: `tests/components/admin/agendaBreakdown.test.tsx`

**Interfaces:**
- Consumes: `Step3Row.adminAgendaPreview` + `agendaStateKey` (Task 11); the endpoint (Task 9); reuse `components/crew/AgendaScheduleBlock.tsx`.

- [ ] **Step 1: Write failing tests** (spec §8 test 4) — pure-presentation over server-built items + per-row fetch machine: (a) `loading` → baseline note items + "Parsing agenda… (N PDFs)" eyebrow, **NO Open-PDF anchor**; (b) `ready` (200) → `agenda-schedule` blocks + overflow notes WITH validated anchors; (c) `error` (network/5xx, no 409 — INCLUDING the endpoint's `504 { status:"timeout" }`, round-13) → note-only, **NO anchor** + source-sheet link (assert a mocked `504` lands in the `error` state, NOT `ready`/`stale`); (c2) `409` → sanitized note, NO anchor, NO block; (c3) anchors ONLY in `ready` (loading/error/stale all assert zero anchors); (d) empty baseline → no breakdown; (e) always-fetch / no baseline-block bypass; (f) long-poll past one window then 200; (g) generation-key reset; (h) queued (local OR global) past one window then admitted → renders 200. **Anti-tautology:** assert against `resultItems`/`adminAgendaPreview` data, and clone-and-strip sibling breakdowns before DOM label scans. Derive expectations from fixture extraction.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the `AgendaBreakdown` per spec §5.3: state machine `idle→loading→{ready|stale|error}` keyed on `agendaStateKey`; POST throttled to `AGENDA_CLIENT_CONCURRENCY`; poll `202` honoring `Retry-After` with `reason`-aware budgets (`in_progress`→`AGENDA_CLIENT_POLL_BUDGET_MS` window starting at admission; `queued`→`AGENDA_CLIENT_QUEUE_BUDGET_MS`); `409`→sanitized `stale`; render anchors ONLY in `ready`; the card never computes hrefs. Reuse `AgendaScheduleBlock`.

- [ ] **Step 4: Run** → PASS; `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(admin): AgendaBreakdown live-fill card (5-state, fence-validated anchors)"`

---

## Task 14: Layout-dimensions assertion (real browser)

**Files:**
- Test: `tests/components/admin/agendaBreakdown.layout.test.ts` (Playwright or chrome-devtools MCP `evaluate_script` against a real render — jsdom is NOT sufficient)

**Interfaces:**
- Consumes: Task 13 card + `AgendaScheduleBlock` (`data-testid="agenda-schedule"`, `"agenda-schedule-label"`).

- [ ] **Step 1: Write the assertion** — render the `ready`-state card in a real browser; `getBoundingClientRect()` on the `agenda-schedule` block + its label/grid; assert the documented dimensional invariants from spec §5.3 "Dimensional invariants" + `AgendaScheduleBlock.tsx:30-37` (the block is flow content — assert it fills its container width and the `grid-cols-[auto_minmax(0,1fr)]` label/time columns don't overflow; child rect within parent rect ±0.5px). Sweep a mid-viewport band per the layout-gate band-sweep convention.

- [ ] **Step 2: Run** → confirm it catches a deliberate `min-w-0`→removed mutation (negative regression), then revert.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "test(admin): real-browser layout assertion for agenda breakdown"`

---

## Task 15: Transition audit + crew no-regression + legacy/stale gate

**Files:**
- Test: `tests/components/admin/agendaBreakdown.transitions.test.tsx`; `tests/crew/agendaNoRegression.test.tsx`

**Interfaces:**
- Consumes: Tasks 6, 9, 13.

- [ ] **Step 1: Transition-audit test** (spec §5.3 Transition Inventory, 5 states) — enumerate every `AnimatePresence`/ternary/conditional in `AgendaBreakdown`; assert each transition (`idle→loading`, `loading→{ready|stale|error}`, `*→idle` generation reset) has the declared treatment; test the compound case (generation-key change while `loading`/`ready`). Assert anchors render in NO state but `ready`.

- [ ] **Step 2: Crew no-regression + stale-extracted gate + legacy** (spec §8 test 6) — crew `ScheduleSection` still renders exactly one `AgendaScheduleBlock` per high-conf link; onboarding `defaultDriveClient` unchanged (no PDF work); the persist freshness invariant at the crew/publish boundary (KNOWN-STALE cleared → crew renders nothing; UNKNOWN left); an existing published show with `extractorVersion: 1` is UNAFFECTED (no bump; `constants.test.ts` pins `EXTRACTOR_VERSION === 1`).

- [ ] **Step 3: Run both** → PASS.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "test(admin,crew): transition audit + crew no-regression + stale/legacy gate"`

---

## Task 16: Impeccable dual-gate (UI quality gate — invariant 8)

**Files:** the Step-3 card diff (`Step3SheetCard.tsx`, any new card CSS).

- [ ] **Step 1:** Run `/impeccable critique` on the card diff with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). Record findings.
- [ ] **Step 2:** Run `/impeccable audit` on the same diff. Record findings.
- [ ] **Step 3:** Fix every HIGH/CRITICAL or defer via a `DEFERRED.md` entry. Record findings + dispositions in the milestone handoff (§12 convention).
- [ ] **Step 4: Commit** any fixes — `git add -A && git commit -m "fix(admin): impeccable critique+audit dispositions for agenda card"`

---

## Task 17: Self-review

- [ ] **Spec coverage:** walk spec §5.1–§5.7, §6, §8, §9, §10 — point each to a task above; list gaps and add tasks for any.
- [ ] **Placeholder scan:** grep this plan for TBD/TODO/"handle edge cases"; fix.
- [ ] **Type consistency:** `EnrichAgendaReport.perLink` (Task 6) ↔ endpoint usage (Task 9); `AdminAgendaItem`/`buildAdminAgendaPreview` opts (Task 7) ↔ baseline (Task 11) ↔ card (Task 13); `Step3Row.agendaStateKey` (Task 11) ↔ card key (Task 13); lease fn names (Task 8) ↔ endpoint (Task 9).
- [ ] **Full suite:** `pnpm vitest run` + `pnpm tsc --noEmit` + `pnpm lint`.

---

## Task 18: Adversarial review (cross-model)

- [ ] Invoke the `adversarial-review` skill (Codex) on the FULL plan. Iterate plan ↔ Codex until APPROVE (no round budget; per AGENTS.md). Do NOT proceed to execution handoff without APPROVE.

---

## Task 19: Execution handoff

- [ ] After the plan is APPROVE'd, proceed to TDD implementation (autonomous-ship: plan-review gate WAIVED). Per task: failing test → minimal impl → passing → commit. Honor every Global Constraint. UI tasks (13–16) are Opus + impeccable. After implementation: whole-diff Codex review → real CI green → `gh pr merge --merge` → fast-forward local `main`.
