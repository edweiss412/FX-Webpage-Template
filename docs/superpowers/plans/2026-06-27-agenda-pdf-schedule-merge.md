# Agenda-PDF Schedule (admin Step-3 async-decouple) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each onboarding sheet's agenda-PDF schedule in the admin Step-3 review card, extracted asynchronously by a per-show endpoint that fills the card live ("parsing agenda…" → blocks) and carries the agenda to publish.

**Architecture:** The scan stays PDF-free. A new POST endpoint `extract-agenda/[wizardSessionId]/[driveFileId]` extracts one staged row off the `show:` lock (no DB connection held during Drive work), behind a durable `agenda_extract_leases` row (per-staged-row dedupe + a strict deployment-wide cap via a brief `agenda-extract-admit` advisory lock with expired-lease GC), with before/after Drive revision + source-scope fences, a persisted-`extracted` freshness invariant, and a brief `show:`-locked atomic conditional persist. The client polls and fills the card live; finalize re-reads `parse_result` (generation-scoped) under its existing per-row `show:` lock so publish carries the agenda.

**Tech Stack:** Next.js 16 (App Router, `maxDuration=300`), Supabase + raw `postgres.js` (`sql.begin`), pdfjs (`extractAgendaSchedule`), React 19 client component, Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-06-27-agenda-pdf-schedule-merge.md` (Codex-APPROVED). Every task cites the spec section that defines its exact predicate/SQL/copy; the spec is the companion source of truth for verbatim SQL and the §8 test catalog.

## Global Constraints

- **TDD per task** (failing test → minimal impl → passing → commit); conventional-commit messages `<type>(<scope>): <summary>` — scope `agenda`/`parser`/`db`/`crew-page`/`admin`.
- **Per-show advisory lock (invariant 2):** the endpoint holds `show:`||dfid ONLY in tx#2 (brief persist) + a brief global `agenda-extract-admit` ONLY in tx#1 (admission); finalize REUSES its existing `defaultWithRowTx` `show:` lock (no new holder). NO advisory lock / DB connection held during the ≤300 s Drive work. (Spec §5.2, §5.6, §9.)
- **No DB connection during Drive (spec §5.2):** two SHORT txns (`sql.begin`), nothing held between.
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
| `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts` (create) | The endpoint: auth → fast-path → tx#1 → fence → extract → fence → tx#2 → 200/202/409. |
| `components/admin/OnboardingWizard.tsx` (modify) | `fetchStep3Data`: select `staged_modified_time`; build baseline preview; stamp `agendaStateKey`. |
| `components/admin/wizard/Step3Review.tsx` (modify) | `Step3Row` gains `adminAgendaPreview` + `agendaStateKey`. |
| `components/admin/wizard/Step3SheetCard.tsx` (modify) | `AgendaBreakdown` client component + 5-state fetch machine. |
| `app/api/admin/onboarding/finalize/route.ts` (modify) | Generation-scoped `parse_result` re-read under the existing per-row `show:` lock (both paths). |
| `tests/db/postgrest-dml-lockdown.test.ts` (modify) | Register `agenda_extract_leases`. |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` (modify) | Pin `agenda-extract-admit` (tx#1) + brief `show:` (tx#2); finalize adds no new holder. |

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
- Test: covered by Task 3 (lockdown) + Task 8 (endpoint); this task's "test" is the apply + manifest gate.

**Interfaces:**
- Produces: table `public.agenda_extract_leases (wizard_session_id uuid, drive_file_id text, owner text, expires_at timestamptz, PK(wizard_session_id, drive_file_id))` + `agenda_extract_leases_expires_at_idx`. (Spec §10.)

- [ ] **Step 1: Write the migration** (use the next timestamp in `supabase/migrations/`; idempotent DDL):

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

- [ ] **Step 2: Apply locally** — `psql "$TEST_DATABASE_URL" -f supabase/migrations/<ts>_agenda_extract_leases.sql` then `supabase db query --linked "notify pgrst, 'reload schema';"` (or the repo's local-apply convention). Verify: `psql "$TEST_DATABASE_URL" -c "\d public.agenda_extract_leases"` shows the table + index.

- [ ] **Step 3: Regenerate the schema manifest** — `pnpm gen:schema-manifest` then confirm `git diff supabase/__generated__/schema-manifest.json` includes `agenda_extract_leases`.

- [ ] **Step 4: Apply to the validation project** — surgically: `supabase db query --project-ref vzakgrxqwcalbmagufjh "$(cat supabase/migrations/<ts>_agenda_extract_leases.sql)"` (per the repo's validation-apply convention; see AGENTS.md "Every migration must reach the validation project"). Confirm `tests/db/validation-schema-parity.test.ts` will pass (validation ⊇ manifest).

- [ ] **Step 5: Commit** — `git add supabase/migrations supabase/__generated__/schema-manifest.json && git commit -m "feat(db): add agenda_extract_leases (RPC-gated, expires_at index)"`

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

- [ ] **Step 4: Commit** — `git commit -am "test(db): register agenda_extract_leases in postgrest-dml-lockdown"`

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

- [ ] **Step 5: Commit** — `git commit -am "feat(agenda): page-cap guard (early LOW > AGENDA_MAX_PAGES)"`

---

## Task 5: `agendaDrive` byte-cap + stall-guard + total-time deadline

**Files:**
- Modify: `lib/drive/agendaDrive.ts` (`downloadFileBytes` ~53–117, `getAgendaChips` ~76)
- Test: `tests/drive/agendaDrive.test.ts`

**Interfaces:**
- Consumes: `AGENDA_PDF_MAX_BYTES`, `AGENDA_PDF_DEADLINE_MS`, `DRIVE_ASSET_STALL_TIMEOUT_MS` (existing), `createStallGuard` (`lib/drive/stallGuard.ts`).
- Produces: `downloadFileBytes(fileId, opts?: { signal?: AbortSignal; deadlineMs?: number })` returning `{ kind: "bytes", bytes } | { kind: "unavailable" } | { kind: "infra_error" }`.

- [ ] **Step 1: Write failing tests** (spec §8 test 3) — byte cap (`cap+1` stream → `unavailable`), stall guard (idle abort; slow-but-progressing → no false abort), and **slow-drip total deadline** (chunk just before each idle timeout, under the byte cap, exceeds `deadlineMs` → aborted → `infra_error`; assert resources released). Use Vitest fake timers + a mock Node stream emitting controlled chunks. (Reuse the existing stall-guard test fixtures.)

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — wire `readBoundedNodeStream(stream, AGENDA_PDF_MAX_BYTES, { onChunk })` for the byte cap; `createStallGuard(DRIVE_ASSET_STALL_TIMEOUT_MS)` for idle (full wiring per spec §5.5: `signal`→`files.get({responseType:'stream',signal,retry:false})`, abort→`stream.destroy`, `reset` on `onChunk`, `clear` in `finally`, `timedOut()`→`infra_error`); AND a SEPARATE total-time `AbortController` armed with `deadlineMs ?? AGENDA_PDF_DEADLINE_MS` that is NOT reset on chunk, composed into the same `signal` (use `AbortSignal.any([stallGuard.signal, deadline.signal, opts.signal].filter(Boolean))`). On the deadline firing → `{ kind: "infra_error" }`. For `getAgendaChips`: keep the existing `DRIVE_FILES_GET_TIMEOUT_MS` + transient retry.

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "feat(agenda): per-PDF byte cap + idle stall + total-time deadline in downloadFileBytes"`

---

## Task 6: `enrichAgenda` — AbortSignal, per-PDF revision stability, per-link freshness verdict

**Files:**
- Modify: `lib/sync/enrichAgenda.ts` (~44–141)
- Test: `tests/onboarding/enrichAgendaIntegration.test.ts` (+ `tests/sync/enrichAgenda.test.ts` if present)

**Interfaces:**
- Consumes: `downloadFileBytes(opts)` (Task 5), `getAgendaChips`, `getFile` (DriveClient), `EXTRACTOR_VERSION`.
- Produces: `enrichAgenda(result, driveClient, spreadsheetId, opts?: { signal?: AbortSignal }): Promise<EnrichAgendaReport>` where `EnrichAgendaReport = { perLink: Array<{ ordinal: number; recoveredFileId?: string; confirmedFresh: boolean; knownStale: boolean }> }`. (Spec §5.2 steps 5–6 / §5.7. The report is how the endpoint applies the 3-way persist verdict without relying on mutation side-effects.)

- [ ] **Step 1: Write failing tests** — (a) per-PDF mid-download revision change: `getFile` returns `rev_before`, download+extract run, the after-`getFile` returns `rev_after !== rev_before` → that link's `confirmedFresh === false` (spec §8 test 2(i2)); (b) stable `rev_after === rev_before` + high-conf → `confirmedFresh === true`, `extracted.sourceRevision === rev`; (c) known-stale: stored `extracted` has old `sourceRevision`, current `getFile` rev readable AND differs, download fails → `knownStale === true`; (d) infra_error on `getFile` → `knownStale === false` (UNKNOWN); (e) AbortSignal already aborted → no Drive calls, perLink empty/aborted; **(f) per-show PDF cap** (spec §5.5 / §8 test 3, round-3 plan finding): a sheet with `AGENDA_MAX_PDFS_PER_SHEET + 1` agenda links → enrichAgenda processes only the first `AGENDA_MAX_PDFS_PER_SHEET` and link N+1 does **NO `getFile`/`getAgendaChips`/`downloadFileBytes`** work (assert the Drive spies are not called for the capped link) — bounds external I/O BEFORE the render-time item cap.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — add the `opts.signal` param (pass to `downloadFileBytes`/`getAgendaChips`; bail if `signal.aborted`). **Cap the loop at `AGENDA_MAX_PDFS_PER_SHEET`** (round-3 plan finding): process at most the first N agenda links; links beyond the cap are skipped with NO Drive work (surfaced via the card note, no warning — spec §5.5). After each processed link's download+extract, **re-`getFile`** to read `rev_after`; set `confirmedFresh = (extractorVersion===EXTRACTOR_VERSION && sourceRevision===rev_before && rev_after===rev_before)`. Set `knownStale = (rev readable this call AND stored extracted's sourceRevision/version ≠ current) AND NOT confirmedFresh`. Return the `perLink` report (ordinal-indexed). Remove any `agendaBudget`/scan-deadline param. Keep `getAgendaChips` recovery (recovered fileId per ordinal). **Do not change crew/cron behavior beyond the additive signal + report + the already-present per-show cap** — existing callers ignore the return.

- [ ] **Step 4: Run** → PASS; run the full `tests/onboarding/enrichAgendaIntegration.test.ts`.

- [ ] **Step 5: Commit** — `git commit -am "feat(agenda): enrichAgenda accepts AbortSignal + returns per-link freshness verdict (per-PDF before/after rev)"`

---

## Task 7: `buildAdminAgendaPreview` (server-pure render shape)

**Files:**
- Create: `lib/agenda/agendaAdminPreview.ts`
- Test: `tests/agenda/agendaAdminPreview.test.ts`

**Interfaces:**
- Consumes: `normalizeAgendaExtraction` (`lib/agenda/normalizeAgendaExtraction.ts`), `agendaDisplayLabel` (`lib/agenda/agendaLabel.ts`), caps (Task 1).
- Produces: `type AdminAgendaItem = { label: string; badge: string | null; href: string | null; block: { extraction: AgendaExtraction; droppedSessions: number; droppedDays: number; droppedTracks: number } | null }`; `buildAdminAgendaPreview(links: AgendaLink[], opts?: { freshByLinkKey?: Set<number>; validatedHrefs?: boolean }): AdminAgendaItem[]`; `capExtractionForAdmin(ext, …)`; `agendaPdfHref(link)`. (Spec §5.4.)

- [ ] **Step 1: Write failing tests** — spec §8 test 1 cases (a)–(n2): two high-conf links → blocks (titles derived from `fixtures/agenda/*.pdf` extraction, NOT hardcoded); low/malformed/zero-day → note; **(m)** no `freshByLinkKey` ⇒ all note-only; **(n)** per-link ordinal gate — only ordinals in `freshByLinkKey` render blocks; stale `extracted` whose ordinal is absent → note-only; `buildAdminAgendaPreview` never reads version/revision to decide a block; **(n2)** duplicate-fileId: two links same `fileId`, ordinal 0 fresh + ordinal 1 absent → only ordinal 0 a block; **(h2)** `validatedHrefs` gate — same `fileId`/http link with NO `validatedHrefs` → `href: null`, WITH `validatedHrefs: true` → href present; href cases (e)–(h) assume `validatedHrefs: true`; cap cases (j)/(k)/(l) → `dropped*` overflow. **Anti-tautology:** derive expected session counts from the fixture extraction, not literals.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** per spec §5.4: block iff `opts.freshByLinkKey?.has(ordinal)` AND `normalizeAgendaExtraction(link.extracted)` is `high`/non-empty-days; `capExtractionForAdmin` enforces `AGENDA_ADMIN_SESSIONS_CAP`/`AGENDA_ADMIN_TRACKS_PER_SESSION_CAP` with `dropped*` siblings; `href = opts.validatedHrefs ? agendaPdfHref(link) : null`; `agendaPdfHref`: `fileId`→`/d/.../view`, else http(s) `url`, else null; badge when link count > 1; cap items at `AGENDA_MAX_PDFS_PER_SHEET`. Pure (no `server-only`/`fs`/Drive imports).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(agenda): buildAdminAgendaPreview (ordinal freshness gate, validatedHrefs, caps)"`

- [ ] **Step 6: Boundary-purity guard** (spec §8 test 5; round-3 plan finding) — create `tests/agenda/agendaPurityBoundary.test.ts` that reads the source of `lib/agenda/agendaAdminPreview.ts`, `components/crew/AgendaScheduleBlock.tsx`, and `lib/agenda/normalizeAgendaExtraction.ts` and asserts NONE import `server-only`, `next/headers`, `fs`, `googleapis`, or any `lib/drive/*` module (so they stay safe to bundle into the `"use client"` card). Run → PASS. Negative-regression: add a throwaway `import "server-only"` to `agendaAdminPreview.ts` → test FAILS → revert. Commit: `git commit -am "test(agenda): boundary-purity guard for client-bundled render code"`.

---

## Task 8: Lease module (`extractAgendaLease.ts`)

**Files:**
- Create: `lib/agenda/extractAgendaLease.ts`
- Test: `tests/agenda/extractAgendaLease.test.ts` (DB-backed, uses `$TEST_DATABASE_URL` + `sql.begin`)

**Interfaces:**
- Consumes: caps (Task 1), the migration (Task 2).
- Produces: `claimExtractLease(tx, { wizardSessionId, driveFileId, owner }): Promise<{ ok: true } | { ok: false; reason: "queued" | "in_progress" }>` — **`queued`** when the global-cap count `>= K` (not started), **`in_progress`** when the `INSERT … ON CONFLICT` finds a LIVE lease for THIS exact `(wiz,dfid)` row (its extraction is running elsewhere). Distinct reasons because the client budgets them differently (spec §5.2 step 3 / round-2 plan finding). (admit-lock + GC + count + claim); `releaseExtractLease(tx, { wizardSessionId, driveFileId, owner })` (in-tx, owner-scoped DELETE, used by tx#2's successful persist); **`releaseExtractLeaseStandalone(sql, { wizardSessionId, driveFileId, owner }): Promise<void>`** that opens its OWN short `sql.begin` transaction and runs the same owner-scoped DELETE — for the endpoint's `finally` early-exit paths that have NO open tx (round-1 plan finding); `assertLeaseOwned` SQL fragment for the tx#2 persist guard; an in-memory `tryAcquireSlot(key): { ownsInFlight, acquiredSlot, release }` (spec §5.2 step 2).

- [ ] **Step 1: Write failing tests** (spec §8 test 2 d-cluster) — (d) two concurrent claims same `(wiz,dfid)` from independent `sql.begin` txns → one ok, one **`{ ok:false, reason:"in_progress" }`** (a LIVE lease for that exact row — NOT `queued`); (d-cap) K live leases for DISTINCT rows + a (K+1)-th distinct-row claim → **`{ ok:false, reason:"queued" }`** (global cap); assert the two reasons are NOT collapsed; **(d-cap-samerow) same-row duplicate AT full cap** (round-3 plan finding): K-1 live leases for OTHER rows + 1 live lease for the requested `(wiz,dfid)` (cap full) → a duplicate claim for that row returns **`{ ok:false, reason:"in_progress" }`** (NOT `queued` — the same-row check precedes the cap check); (d-x) different session same dfid → independent claim succeeds; (d-g) STRICT cap: K+N concurrent distinct-row claims → at most K succeed (the admit advisory lock serializes; **this test must FAIL on a bare count-then-insert**); (d2) many expired crash leases (`expires_at <= now()`) → next claim GCs them, live count excludes them, table row-count returns to ≈live; (d3) owner-scoped release (in-tx); **(d3b) `releaseExtractLeaseStandalone` opens its own tx and DELETEs the owner's row IMMEDIATELY** (assert the row is gone right after the call, NOT merely TTL-recoverable — round-1 plan finding); (d5) persist-guard `EXISTS(owner=me, unexpired)`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the claim as the single serialized sequence (spec §5.2 step 3): `pg_advisory_xact_lock(hashtext('agenda-extract-admit'))` → `DELETE FROM agenda_extract_leases WHERE expires_at <= now()` → **(round-3 plan finding) FIRST check THIS row's live lease BEFORE the global cap** so a same-row duplicate at full cap is `in_progress`, not `queued`: `SELECT 1 FROM agenda_extract_leases WHERE wizard_session_id=$1 AND drive_file_id=$2 AND expires_at > now()` → if found return `{ ok:false, reason:"in_progress" }` → else `SELECT count(*) FROM agenda_extract_leases` → if `>= AGENDA_GLOBAL_MAX_CONCURRENT_EXTRACTIONS` return `{ ok:false, reason:"queued" }` → else `INSERT … ON CONFLICT (wizard_session_id, drive_file_id) DO UPDATE … WHERE expires_at < now() RETURNING owner` (0 rows = a LIVE lease for this row → `{ ok:false, reason:"in_progress" }` belt-and-suspenders; 1 row → `{ ok:true }`). (All under the admit lock, so the SELECT→count→INSERT sequence is race-free.) `releaseExtractLease(tx, …)`: `DELETE … WHERE wizard_session_id=$ AND drive_file_id=$ AND owner=$`. **`releaseExtractLeaseStandalone(sql, …)`**: `await sql.begin(tx => releaseExtractLease(tx, …))` — its own short connection for the no-open-tx `finally` paths. The in-memory slot: module-level counter + `Set` of keys with ownership flags (spec §5.2 step 2).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(agenda): durable extraction lease (admit-lock + GC + strict cap) + in-memory slot"`

---

## Task 9: The extract endpoint route

**Files:**
- Create: `app/api/admin/onboarding/extract-agenda/[wizardSessionId]/[driveFileId]/route.ts`
- Test: `tests/app/admin/extractAgenda.test.ts`

**Interfaces:**
- Consumes: `requireAdminIdentity` (`@/lib/auth/requireAdmin`, returns `{ email }`), Task 6 `enrichAgenda`, Task 7 `buildAdminAgendaPreview`, Task 8 lease module, `fetchDriveFileMetadata` (`lib/drive/fetch.ts`), `adoptShowLockHeld`/`withShowLock` (`lib/sync/lockedShowTx.ts`), `sql.begin` raw tx (mirror `finalize/route.ts:161`), `agendaDrive` download/chips.
- Produces: `POST` with `export const maxDuration = 300`; responses `200 { items }` / `202 { status, reason }` (Retry-After) / `409 { status:"stale" }` / `200 { items: [] }`.

- [ ] **Step 1: Write failing tests** — the full spec §8 test 2 catalog: (a) auth; (b) chip-based links over `fixtures/agenda/*.pdf` → `200` blocks + each item carries a validated `href` + persisted via raw `tx` UPDATE; (c) cache short-circuit (zero `downloadFileBytes`/`getAgendaChips`, `getFile` allowed); (e)/(e2)/(e3)/(e3b additive non-agenda byte-identical); (h) smart-chip end-to-end + 2nd-call cache-hit; (i)/(i2) stale-refresh / mid-download rev → not persisted; (j) no DB/lock during Drive; (k)/(k2) reread-merge + ordinal-first duplicate-fileId; (l) rescan generation race; (m)/(m-a/b/c)/(m2) revision + source-scope fence (via `fetchDriveFileMetadata`); (n) ownership-scoped slot; (o) recovered-fileId-persists-on-download-fail; (f)/(g); **(p) lease released IMMEDIATELY on EVERY post-claim early exit** (round-1 plan finding): for each of {before-fence `409`, after-fence `409`, `enrichAgenda` throw, tx#2-stale `409`}, assert NO live `agenda_extract_leases` row remains for `(wiz,dfid)` right after the response (the `finally` ran `releaseExtractLeaseStandalone`), AND a subsequent claim for a DIFFERENT row is NOT falsely `queued` (the cap count doesn't include the released row); **(q) endpoint-level deadline fires + cleanup** (round-3 plan finding): with fake timers, make `enrichAgenda`/Drive work hang past `AGENDA_EXTRACT_DEADLINE_MS` → the route's `AbortController` fires (before the 300 s `maxDuration`) → assert the response is a typed note-only/`infra` result (NOT a platform hard-kill), AND the durable lease row is DELETED, the in-memory slot count returns to baseline, and the in-flight marker is removed — all in the `finally` (assert no leaked same-instance capacity). Use the lease module + a `sql.begin` test seam; mock the DriveClient + `fetchDriveFileMetadata`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the sequence exactly per spec §5.2 (auth → in-memory fast-path → **tx#1**: `claimExtractLease` (queued→202) + `SELECT staged_id, staged_modified_time, parse_result, <lifecycle> + app_settings.pending_folder_id` + lifecycle guard + capture generation → commit → **fence BEFORE** `fetchDriveFileMetadata` (`modifiedTime===staged_modified_time` AND `parents.includes(pending_folder_id)`; else 409, no Drive) → **extract** `enrichAgenda(parseResult, driveClient, dfid, { signal })` with the `AGENDA_EXTRACT_DEADLINE_MS` AbortController, NO DB held → **fence AFTER** (re-`fetchDriveFileMetadata`; 409 on mismatch) → **positive freshness** = the perLink report → **tx#2**: `sql.begin` → `pg_advisory_xact_lock('show:'||dfid)` → REREAD current `parse_result` → ordinal-first 3-way merge (FRESH set / KNOWN-STALE clear / UNKNOWN leave; recoveredFileIds additive) → atomic `UPDATE … WHERE wiz AND dfid AND staged_id AND staged_modified_time AND <active,not-finalize-consumed> AND EXISTS(lease owner=me, unexpired) RETURNING` (0 rows→409) → owner-scoped `releaseExtractLease(tx, …)` (in the SAME tx#2) → commit → `buildAdminAgendaPreview(mergedLinks, { freshByLinkKey, validatedHrefs: true })` → 200). **Lease-release boundary (round-1 plan finding):** track two flags — `leaseClaimed` (set true after a successful tx#1 claim) and `leaseReleased` (set true after tx#2's in-tx release OR a tx#2 stale path that itself ran the DELETE). The route's `finally` does: `if (leaseClaimed && !leaseReleased) await releaseExtractLeaseStandalone(sql, { wizardSessionId, driveFileId, owner })` — opening its OWN short tx, so the post-tx#1 early exits (before/after-fence `409`, `enrichAgenda` throw, tx#2 stale before its release) DELETE the lease IMMEDIATELY (not TTL). The in-memory slot/in-flight is released in the same `finally` via the Task-8 `tryAcquireSlot().release`. **`202` reason mapping (round-2 plan finding):** in-memory in-flight set present → `202 { reason:"in_progress" }` (a sibling request for THIS row is extracting); in-memory no free slot → `202 { reason:"queued" }`; `claimExtractLease` failure → its returned reason verbatim (`queued` = global cap; `in_progress` = a live durable lease for this row). All `202` set `Retry-After`. The `202` paths claimed NOTHING durable (or the in-memory slot only) → `finally` releases only what was owned (`leaseClaimed` stays false for them).

- [ ] **Step 4: Run** → PASS (iterate until all §8 test-2 cases green).

- [ ] **Step 5: Commit** — `git commit -m "feat(agenda): per-show extract-agenda endpoint (lease, fences, no-DB-during-Drive, atomic persist)"`

---

## Task 10: Advisory-lock topology meta-test

**Files:**
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts`

**Interfaces:**
- Consumes: the endpoint (Task 9) + finalize (Task 12).

- [ ] **Step 1: Extend the meta-test** to PIN: the endpoint holds `agenda-extract-admit` ONLY in tx#1 and `show:`||dfid ONLY in tx#2 (separate txns; single-holder each; no nesting; no advisory lock during the Drive window); finalize's §5.6 re-select adds NO new `show:` acquisition (reuses `defaultWithRowTx`). Follow the file's existing pin pattern (regex over the route source for `pg_(try_)?advisory_xact_lock` + lock-order assertions).

- [ ] **Step 2: Run** — `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts` → PASS.

- [ ] **Step 3: Negative-regression** — temporarily add a stray `pg_advisory_xact_lock('show:'...)` inside the Drive window of the route → the meta-test must FAIL; revert.

- [ ] **Step 4: Commit** — `git commit -am "test(auth): pin agenda-extract-admit + brief show: topology"`

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

- [ ] **Step 5: Commit** — `git commit -am "feat(admin): baseline adminAgendaPreview + agendaStateKey in fetchStep3Data"`

---

## Task 12: Finalize generation-scoped re-read (publish-safety)

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (first-seen ~823–828; existing-show shadow ~771 / `stageExistingShowShadow` ~525–568)
- Test: `tests/app/admin/finalizeAgendaRace.test.ts`

**Interfaces:**
- Consumes: the per-row `show:` lock already held by `defaultWithRowTx` (~164).

- [ ] **Step 1: Write failing test** (spec §8 test 7) — BOTH paths: finalize selects the row's `parse_result` (no agenda) first; an extraction persists the agenda under `show:`; finalize then applies → assert the published/shadow payload INCLUDES the extracted agenda (it re-read under the lock). Negative regression: NO concurrent extraction → payload unchanged. **Generation-scoped:** the row is REGENERATED (new `staged_id`) between the initial select and the locked re-read → the generation-scoped re-SELECT returns 0 rows → finalize treats it STALE (`demotePending`/`STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`), NO apply/shadow side effect.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** — inside the already-`show:`-locked per-row tx, add a generation-scoped `SELECT parse_result FROM public.pending_syncs WHERE wizard_session_id=$1 AND drive_file_id=$2 AND staged_id=$3 AND staged_modified_time=$4`; 0 rows → existing stale path. First-seen: pass the re-read `parse_result` to `applyStagedCore`. Existing-show: pass it into `stageExistingShowShadow`'s `parse_result` (`:546`). Do NOT acquire a new lock (`adoptShowLockHeld` asserts only).

- [ ] **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** — `git commit -am "fix(admin): finalize re-reads parse_result generation-scoped under the per-row show lock (publish-safety)"`

---

## Task 13: Client card — `AgendaBreakdown` + 5-state machine (UI — Opus)

**Files:**
- Modify: `components/admin/wizard/Step3SheetCard.tsx` (new `AgendaBreakdown`)
- Test: `tests/components/admin/agendaBreakdown.test.tsx`

**Interfaces:**
- Consumes: `Step3Row.adminAgendaPreview` + `agendaStateKey` (Task 11); the endpoint (Task 9); reuse `components/crew/AgendaScheduleBlock.tsx`.

- [ ] **Step 1: Write failing tests** (spec §8 test 4) — pure-presentation over server-built items + per-row fetch machine: (a) `loading` → baseline note items + "Parsing agenda… (N PDFs)" eyebrow, **NO Open-PDF anchor**; (b) `ready` (200) → `agenda-schedule` blocks + overflow notes WITH validated anchors; (c) `error` (network/5xx, no 409) → note-only, **NO anchor** + source-sheet link; (c2) `409` → sanitized note, NO anchor, NO block; (c3) anchors ONLY in `ready` (loading/error/stale all assert zero anchors); (d) empty baseline → no breakdown; (e) always-fetch / no baseline-block bypass; (f) long-poll past one window then 200; (g) generation-key reset; (h) queued (local OR global) past one window then admitted → renders 200. **Anti-tautology:** assert against `resultItems`/`adminAgendaPreview` data, and clone-and-strip sibling breakdowns before DOM label scans. Derive expectations from fixture extraction.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implement** the `AgendaBreakdown` per spec §5.3: state machine `idle→loading→{ready|stale|error}` keyed on `agendaStateKey`; POST throttled to `AGENDA_CLIENT_CONCURRENCY`; poll `202` honoring `Retry-After` with `reason`-aware budgets (`in_progress`→`AGENDA_CLIENT_POLL_BUDGET_MS` window starting at admission; `queued`→`AGENDA_CLIENT_QUEUE_BUDGET_MS`); `409`→sanitized `stale`; render anchors ONLY in `ready`; the card never computes hrefs. Reuse `AgendaScheduleBlock`.

- [ ] **Step 4: Run** → PASS; `pnpm tsc --noEmit`.

- [ ] **Step 5: Commit** — `git commit -am "feat(admin): AgendaBreakdown live-fill card (5-state, fence-validated anchors)"`

---

## Task 14: Layout-dimensions assertion (real browser)

**Files:**
- Test: `tests/components/admin/agendaBreakdown.layout.test.ts` (Playwright or chrome-devtools MCP `evaluate_script` against a real render — jsdom is NOT sufficient)

**Interfaces:**
- Consumes: Task 13 card + `AgendaScheduleBlock` (`data-testid="agenda-schedule"`, `"agenda-schedule-label"`).

- [ ] **Step 1: Write the assertion** — render the `ready`-state card in a real browser; `getBoundingClientRect()` on the `agenda-schedule` block + its label/grid; assert the documented dimensional invariants from spec §5.3 "Dimensional invariants" + `AgendaScheduleBlock.tsx:30-37` (the block is flow content — assert it fills its container width and the `grid-cols-[auto_minmax(0,1fr)]` label/time columns don't overflow; child rect within parent rect ±0.5px). Sweep a mid-viewport band per the layout-gate band-sweep convention.

- [ ] **Step 2: Run** → confirm it catches a deliberate `min-w-0`→removed mutation (negative regression), then revert.

- [ ] **Step 3: Commit** — `git commit -am "test(admin): real-browser layout assertion for agenda breakdown"`

---

## Task 15: Transition audit + crew no-regression + legacy/stale gate

**Files:**
- Test: `tests/components/admin/agendaBreakdown.transitions.test.tsx`; `tests/crew/agendaNoRegression.test.tsx`

**Interfaces:**
- Consumes: Tasks 6, 9, 13.

- [ ] **Step 1: Transition-audit test** (spec §5.3 Transition Inventory, 5 states) — enumerate every `AnimatePresence`/ternary/conditional in `AgendaBreakdown`; assert each transition (`idle→loading`, `loading→{ready|stale|error}`, `*→idle` generation reset) has the declared treatment; test the compound case (generation-key change while `loading`/`ready`). Assert anchors render in NO state but `ready`.

- [ ] **Step 2: Crew no-regression + stale-extracted gate + legacy** (spec §8 test 6) — crew `ScheduleSection` still renders exactly one `AgendaScheduleBlock` per high-conf link; onboarding `defaultDriveClient` unchanged (no PDF work); the persist freshness invariant at the crew/publish boundary (KNOWN-STALE cleared → crew renders nothing; UNKNOWN left); an existing published show with `extractorVersion: 1` is UNAFFECTED (no bump; `constants.test.ts` pins `EXTRACTOR_VERSION === 1`).

- [ ] **Step 3: Run both** → PASS.

- [ ] **Step 4: Commit** — `git commit -am "test(admin,crew): transition audit + crew no-regression + stale/legacy gate"`

---

## Task 16: Impeccable dual-gate (UI quality gate — invariant 8)

**Files:** the Step-3 card diff (`Step3SheetCard.tsx`, any new card CSS).

- [ ] **Step 1:** Run `/impeccable critique` on the card diff with the canonical v3 preflight gates (PRODUCT.md → DESIGN.md → register → preflight signal). Record findings.
- [ ] **Step 2:** Run `/impeccable audit` on the same diff. Record findings.
- [ ] **Step 3:** Fix every HIGH/CRITICAL or defer via a `DEFERRED.md` entry. Record findings + dispositions in the milestone handoff (§12 convention).
- [ ] **Step 4: Commit** any fixes — `git commit -am "fix(admin): impeccable critique+audit dispositions for agenda card"`

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
