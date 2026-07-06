# Finalize-Resume Deadlock — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unblock the admin finalize-resume deadlock — surface recovery links on the `in_progress` re-entry screen (Thread 1), auto-heal cosmetic Drive-modifiedTime bumps inside finalize (Thread 3), and allow immediate discard of a provably-stuck session (Thread 2) — without ever trapping the operator.

**Architecture:** Three cooperating changes, all read-path/UI/existing-mutation control flow (NO schema change). Thread 1 adds a guarded Supabase read + list UI. Thread 3 replaces finalize's unconditional demote-on-modtime-mismatch with an inline re-parse + `computeRescanDecision`, reusing a core extracted from `rescanWizardSheet`, run under finalize's already-held locks. Thread 2 rewrites `cleanupAbandonedFinalize`'s locking to advisory-before-row over the discarded session's full drive-id union, adds a provably-stuck eligibility path (bypassing the 24h + recency guards), an under-lock recheck, and a session-scoped purge.

**Tech Stack:** Next.js 16 App Router, React Server Components, Supabase (postgres.js raw SQL + cookie-bound server client), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-05-finalize-resume-deadlock.md` is the canonical, adversarially-reviewed (10 rounds) contract. Every task below implements a section of it; where a task says "per spec §X", the spec carries the full contract and MUST be honored exactly.

## Global Constraints

- **TDD per task** — failing test → minimal impl → green → commit. Never impl before its test.
- **Per-show advisory lock, single-holder rule** (invariant 2): for any hashkey the lock is acquired at exactly one layer. The extracted rescan core and cleanup's new locking acquire NO lock the caller already holds; cleanup locks `show:` ADVISORY-BEFORE-ROW.
- **No raw error codes in UI** (invariant 5): all copy routes through `lib/messages/lookup.ts` `messageFor(code).dougFacing`.
- **Supabase call-boundary discipline** (invariant 9): every client call destructures `{ data, error }`; infra faults surface as `{ kind: 'infra_error' }`; new readers register in `tests/admin/_metaInfraContract.test.ts`.
- **Mutation observability** (invariant 10): finalize + cleanup are already registered `AUDITABLE_MUTATIONS`; no new mutating route/action is added. The Thread-3 auto-heal uses an `event:`-keyed `log.info` (NOT a `code:` catalog code — no new §12.4 row).
- **No new §12.4 catalog code.** Every code the UI/route references already exists: `ONBOARDING_NOT_RESOLVED`, `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`, `RESCAN_REVIEW_REQUIRED`, `CLEANUP_REQUIRES_STALE_SESSION`, `DRIVE_FETCH_FAILED`, `STAGED_PARSE_SOURCE_OUT_OF_SCOPE`, `STAGED_REVIEW_ITEMS_CORRUPT`.
- **UI work is Opus + impeccable dual-gate** (invariant 8): Tasks 2 and 7 touch `components/**` / `app/admin/**` → run `/impeccable critique` AND `/impeccable audit` on the diff before close-out; HIGH/CRITICAL fixed or `DEFERRED.md`.
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`), `--no-verify` (shared lint-staged hook belongs to the main checkout). Run `pnpm format:check` + `pnpm lint` + `pnpm typecheck` before the final push.

## Meta-test inventory (declared per AGENTS.md writing-plans rule)

- **EXTEND** `tests/auth/advisoryLockRpcDeadlock.test.ts` — (a) `applyRescanDecisionUnderLock` acquires no `pg_advisory_xact_lock` and writes neither `app_settings` nor `wizard_finalize_checkpoints` (static source); (b) `cleanupAbandonedFinalize`'s drive-file lock helper contains no `for update` before its first `pg_advisory_xact_lock(hashtext('show:'…))` (T10-static; reuses the file's existing `stripComments` + FOR-UPDATE-before-advisory scanner).
- **EXTEND** `tests/admin/_metaInfraContract.test.ts` — register `readUnresolvedSheets` in `app/admin/_unresolvedSheets.ts`.
- **No new registry** for admin-mutation observability (finalize + cleanup already registered; no new surface).

## Advisory-lock holder topology (declared per AGENTS.md — plan touches `pg_advisory*`)

- `finalize:<session>`: single holder = finalize's OUTER tx (`route.ts:1130`). The extracted core runs under it, acquires nothing. `rescanWizardSheet` keeps its own `finalize:` try-lock (unchanged). `cleanupAbandonedFinalize` holds `finalize:<sessionId>` (`sessionLifecycle.ts:344`, unchanged).
- `show:<drive>`: finalize per-row tx (one, `route.ts:1219`); cleanup acquires a globally-sorted set (unchanged mechanism, widened set + advisory-before-row); rescan/reap unchanged. The extracted core asserts-held via `adoptShowLockHeld`, never acquires.
- `app_settings` / `wizard_finalize_checkpoints` FOR UPDATE: held ONLY by finalize's outer tx; the extracted core NEVER touches them (§4.2).

---

## Task 1: Thread 1 — `readUnresolvedSheets` guarded read

**Files:**
- Create: `app/admin/_unresolvedSheets.ts`
- Modify: `tests/admin/_metaInfraContract.test.ts` (register the helper)
- Test: `tests/admin/unresolvedSheets.test.ts`

**Interfaces:**
- Produces: `export type UnresolvedSheet = { driveFileId: string; failureCode: string | null; displayName: string; reApplyHref: string }`
- Produces: `export type UnresolvedSheetsResult = UnresolvedSheet[] | { kind: 'infra_error'; message: string }`
- Produces: `export async function readUnresolvedSheets(wizardSessionId: string): Promise<UnresolvedSheetsResult>`
- Consumes: `createSupabaseServerClient` from `@/lib/supabase/server`; `messageFor` is NOT called here (the component renders copy).

**Contract (spec §3.2):** two `{ data, error }`-guarded reads composed in JS. Read 1: `onboarding_scan_manifest` rows for the session with `status in ('hard_failed','live_row_conflict','discard_retryable','staged')`. Read 2: `pending_syncs` `drive_file_id, last_finalize_failure_code, parse_result` for those drive_file_ids. INCLUDE a row iff `status in (blocking three)` OR (`status='staged'` AND its `last_finalize_failure_code != null`). `displayName` = `parse_result.show.title` if a non-empty string else `driveFileId`. `reApplyHref` = `/admin/onboarding/staged/${encodeURIComponent(wizardSessionId)}/${encodeURIComponent(driveFileId)}` (mirrors `reApplyUrl`, finalize/route.ts:247). Any read `error` (returned or thrown) → `{ kind: 'infra_error', message }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/admin/unresolvedSheets.test.ts
import { describe, expect, it, vi } from "vitest";
import { readUnresolvedSheets } from "@/app/admin/_unresolvedSheets";

function clientReturning(manifestRows: unknown[], pendingRows: unknown[], opts: { manifestError?: unknown; pendingError?: unknown } = {}) {
  const calls: string[] = [];
  const from = (table: string) => {
    calls.push(table);
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    chain.select = self; chain.eq = self; chain.in = self;
    // terminal: manifest read awaits the builder; pending read awaits .in(...)
    chain.then = (resolve: (v: unknown) => void) => {
      if (table === "onboarding_scan_manifest") resolve({ data: opts.manifestError ? null : manifestRows, error: opts.manifestError ?? null });
      else resolve({ data: opts.pendingError ? null : pendingRows, error: opts.pendingError ?? null });
    };
    return chain;
  };
  return { from } as unknown as Parameters<typeof readUnresolvedSheets>[never];
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));
import { createSupabaseServerClient } from "@/lib/supabase/server";

describe("readUnresolvedSheets", () => {
  it("includes a demoted staged+code row and excludes a clean staged row and a permanent_ignore", async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      clientReturning(
        [
          { drive_file_id: "D_STUCK", status: "staged" },
          { drive_file_id: "D_CLEAN", status: "staged" },
          // permanent_ignore is not in the queried status set at all
        ],
        [
          { drive_file_id: "D_STUCK", last_finalize_failure_code: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE", parse_result: { show: { title: "East Coast" } } },
          { drive_file_id: "D_CLEAN", last_finalize_failure_code: null, parse_result: null },
        ],
      ),
    );
    const res = await readUnresolvedSheets("11111111-1111-1111-1111-111111111111");
    expect(Array.isArray(res)).toBe(true);
    const rows = res as Extract<typeof res, unknown[]>;
    expect(rows.map((r) => r.driveFileId)).toEqual(["D_STUCK"]);
    expect(rows[0].displayName).toBe("East Coast");
    expect(rows[0].failureCode).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(rows[0].reApplyHref).toBe("/admin/onboarding/staged/11111111-1111-1111-1111-111111111111/D_STUCK");
  });

  it("falls back to driveFileId when parse_result has no title", async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      clientReturning([{ drive_file_id: "D_HARD", status: "hard_failed" }], [{ drive_file_id: "D_HARD", last_finalize_failure_code: "DRIVE_FETCH_FAILED", parse_result: null }]),
    );
    const rows = (await readUnresolvedSheets("11111111-1111-1111-1111-111111111111")) as { displayName: string }[];
    expect(rows[0].displayName).toBe("D_HARD");
  });

  it("returns infra_error when the manifest read errors", async () => {
    (createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      clientReturning([], [], { manifestError: { message: "boom" } }),
    );
    const res = await readUnresolvedSheets("11111111-1111-1111-1111-111111111111");
    expect(res).toMatchObject({ kind: "infra_error" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/admin/unresolvedSheets.test.ts`
Expected: FAIL (`readUnresolvedSheets` not found).

- [ ] **Step 3: Write minimal implementation**

Create `app/admin/_unresolvedSheets.ts` implementing the §3.2 contract: mirror `app/admin/_finalizeCheckpoint.ts`'s try/catch + `{ data, error }` guarding for BOTH reads; build the include-predicate in JS; compose `displayName`/`reApplyHref`. Underscore prefix keeps Next.js from routing it. Follow `fetchWizardStagedRow` (staged page `:114`) as the registered-helper template.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/admin/unresolvedSheets.test.ts`
Expected: PASS.

- [ ] **Step 5: Register in the infra meta-test + run it**

Add an `infraRegistry` row for `readUnresolvedSheets` at `app/admin/_unresolvedSheets.ts` in `tests/admin/_metaInfraContract.test.ts` (mirror the `fetchWizardStagedRow` row: path + a client whose `.from()` returns an error, asserting the helper returns `{ kind: 'infra_error' }` rather than throwing).

Run: `pnpm vitest run tests/admin/_metaInfraContract.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/admin/_unresolvedSheets.ts tests/admin/unresolvedSheets.test.ts tests/admin/_metaInfraContract.test.ts
git commit --no-verify -m "feat(admin): guarded read of unresolved sheets for finalize re-entry"
```

---

## Task 2: Thread 1 — `FinalizeInProgress` recovery list + page wiring (UI — Opus + impeccable)

**Files:**
- Modify: `components/admin/FinalizeInProgress.tsx`
- Modify: `app/admin/page.tsx` (the `in_progress` branch, ~line 165)
- Test: `tests/components/admin/FinalizeInProgress.test.tsx`

**Interfaces:**
- Consumes: `UnresolvedSheet` / `readUnresolvedSheets` (Task 1).
- `FinalizeInProgress` gains a prop `unresolved: UnresolvedSheet[] | { kind: 'infra_error' }`.

**Contract (spec §3.1, §3.3, §8):** when `unresolved` is a non-empty array, render a section (below Progress, above "Trouble finishing?") listing each sheet: `displayName`, the Doug-facing copy via `messageFor(failureCode).dougFacing` (fallback neutral copy when `failureCode` is null), a `HelpAffordance code={failureCode}`, and a `Link href={reApplyHref}` labelled "Review and resolve". Empty array → no section. `{ kind: 'infra_error' }` → a soft note "We couldn't load the blocked sheets — refresh in a moment," never blocking Resume/Discard. No animation (all states server-rendered; instant per §8).

- [ ] **Step 1: Load the impeccable skill** — `/impeccable` (preflight: PRODUCT.md → DESIGN.md → register → signal) BEFORE writing UI, per invariant 8 / the UI-always-Opus rule.

- [ ] **Step 2: Write the failing test**

```tsx
// tests/components/admin/FinalizeInProgress.test.tsx (add cases)
import { render, screen } from "@testing-library/react";
import { FinalizeInProgress } from "@/components/admin/FinalizeInProgress";

it("lists an unresolved sheet with copy + recovery link", () => {
  render(
    <FinalizeInProgress
      sessionId="s1"
      batchesCompleted={1}
      unresolved={[{ driveFileId: "D1", failureCode: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE", displayName: "East Coast", reApplyHref: "/admin/onboarding/staged/s1/D1" }]}
    />,
  );
  expect(screen.getByText("East Coast")).toBeInTheDocument();
  const link = screen.getByRole("link", { name: /review and resolve/i });
  expect(link).toHaveAttribute("href", "/admin/onboarding/staged/s1/D1");
  // copy is the catalog dougFacing, never the raw code
  expect(screen.queryByText("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE")).not.toBeInTheDocument();
});

it("renders no list section when unresolved is empty", () => {
  const { container } = render(<FinalizeInProgress sessionId="s1" batchesCompleted={1} unresolved={[]} />);
  expect(container.querySelector('[data-testid="finalize-in-progress-unresolved"]')).toBeNull();
});

it("shows a soft note on infra_error without hiding Resume", () => {
  render(<FinalizeInProgress sessionId="s1" batchesCompleted={1} unresolved={{ kind: "infra_error" }} />);
  expect(screen.getByTestId("resume-finalize-button")).toBeInTheDocument();
  expect(screen.getByText(/couldn.t load the blocked sheets/i)).toBeInTheDocument();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run tests/components/admin/FinalizeInProgress.test.tsx`
Expected: FAIL (prop `unresolved` unknown / section not rendered).

- [ ] **Step 4: Implement the list section**

Add the `unresolved` prop + a `<section data-testid="finalize-in-progress-unresolved">` between the Progress and "Trouble finishing?" sections. Map array → list items with `messageFor(f.failureCode as MessageCode).dougFacing` (guard non-catalog codes with a neutral fallback string), `<HelpAffordance code={f.failureCode} />`, and `<Link href={f.reApplyHref}>Review and resolve</Link>`. For `{ kind: 'infra_error' }` render the soft note. Match the existing card styling (`rounded-md border border-border bg-surface p-tile-pad`) and the `ResumeFinalizeButton` race-row list idiom (`components/admin/ResumeFinalizeButton.tsx:125-154`).

- [ ] **Step 5: Wire the page** — in `app/admin/page.tsx`, in the `checkpoint.status === "in_progress"` branch (~:165), call `readUnresolvedSheets(settings.pending_wizard_session_id)`; pass the result (array or `{kind:'infra_error'}`) as `unresolved`. On the reader's `infra_error` pass it straight through (component renders the soft note). Do NOT block the screen on the reader.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm vitest run tests/components/admin/FinalizeInProgress.test.tsx`
Expected: PASS.

- [ ] **Step 7: impeccable dual-gate** — run `/impeccable critique` AND `/impeccable audit` on the diff (`components/admin/FinalizeInProgress.tsx`, `app/admin/page.tsx`). Fix HIGH/CRITICAL or record in `DEFERRED.md`.

- [ ] **Step 8: Commit**

```bash
git add components/admin/FinalizeInProgress.tsx app/admin/page.tsx tests/components/admin/FinalizeInProgress.test.tsx
git commit --no-verify -m "feat(admin): surface unresolved-sheet recovery links on finalize re-entry"
```

---

## Task 3: Extract `applyRescanDecisionUnderLock` shared core

**Files:**
- Create: `lib/onboarding/applyRescanDecisionUnderLock.ts`
- Modify: `lib/onboarding/rescanWizardSheet.ts` (call the extracted core in its post-lock section)
- Test: `tests/onboarding/applyRescanDecisionUnderLock.test.ts` + existing `tests/onboarding/rescanWizardSheet*.test.ts` stay green

**Interfaces:**
- Produces: `export type RescanDecisionInput = { wizardSessionId: string; driveFileId: string; pendingFolderId: string; prepared: PreparedOnboardingFile }`
- Produces: `export type RescanDecisionOutcome = { kind: 'clean_restamped' | 'clean_unchecked' | 'dirty_demoted'; changed: boolean }`
- Produces: `export async function applyRescanDecisionUnderLock(tx: PostgresTransaction, input: RescanDecisionInput): Promise<RescanDecisionOutcome>`
- Also moves `capturePriorState` into (or shares it from) this module so BOTH callers capture prior state under the held lock.

**Contract (spec §4.2 + plan-R1-1 approval-race):** extract ONLY the per-row-surface portion of `rescanWizardSheet`'s post-lock body. **The core captures prior state ITSELF, UNDER the held `show:` lock**, via `capturePriorState(tx, wizardSessionId, driveFileId)` (`rescanWizardSheet.ts:106-182`) — it does NOT receive `priorParse`/`priorReady`/`priorApprovedByEmail` as inputs. This is load-bearing: the outer `selectFinishableCleanRows` read holds no `show:` lock, so its approval columns are stale (see `tests/onboarding/finalizeApprovalRace.test.ts`); a concurrent check/uncheck before the lock would be lost or resurrected if the caller passed the stale outer `row`. Capturing under the lock is exactly why `rescanWizardSheet` reads prior state at `:277` (not before its Drive window). The core then does: restage via `scanOnboardingPreparedFiles` (pass-through `withShowLock` that adopts, never acquires), read-back of the fresh staged row, `computeRescanDecision`, and the clean/dirty writes to `pending_syncs` + `onboarding_scan_manifest` + `shows_pending_changes` for the single drive_file_id (the branches at `rescanWizardSheet.ts:298-451`, MINUS the checkpoint reopen `:371` and MINUS the `app_settings` re-check `:260`). It MUST NOT: acquire any advisory lock; read/write `app_settings`; write `wizard_finalize_checkpoints`. `rescanWizardSheet` keeps its own lock acquisition, `app_settings` re-check, checkpoint blocker-heal, and manifest 'applied'-restore, and calls this core for the capture/decision/restage.

- [ ] **Step 1: Write the failing test** (fake-tx unit asserting the core issues no `app_settings`/`checkpoints`/advisory SQL, and that clean+ready re-stamps approval while dirty demotes with `RESCAN_REVIEW_REQUIRED`). Capture all `tx.unsafe(sql)` calls into an array and assert none match `/app_settings|wizard_finalize_checkpoints|pg_advisory/i`.

```ts
// tests/onboarding/applyRescanDecisionUnderLock.test.ts — sketch
const sql: string[] = [];
// fake tx: capturePriorState reads a PRIOR approved+clean pending_syncs row FROM tx
// (the core reads prior state itself under the lock — no priorParse input)
const tx = { unsafe: async (s: string, p?: unknown[]) => { sql.push(s); return recordFor(s, p); } };
// build a clean prepared file (no MI-11..14, no gap regression); prior row = approved+clean
const out = await applyRescanDecisionUnderLock(tx as any, { wizardSessionId, driveFileId, pendingFolderId, prepared: cleanPrepared });
expect(out.kind).toBe("clean_restamped");
expect(sql.some((s) => /app_settings|wizard_finalize_checkpoints|pg_advisory/i.test(s))).toBe(false);
// dirty prepared (MI-12) → dirty_demoted + RESCAN_REVIEW_REQUIRED written to pending_syncs
```

- [ ] **Step 2: Run it — FAIL** (`pnpm vitest run tests/onboarding/applyRescanDecisionUnderLock.test.ts`).

- [ ] **Step 3: Implement the core** by moving the identified lines out of `rescanWizardSheet` into the new module; have `rescanWizardSheet` import + call it. Keep `rescanWizardSheet`'s lock acquisition, `app_settings` re-check, checkpoint reopen, and manifest-'applied'-restore in `rescanWizardSheet`.

- [ ] **Step 4: Run the new test + the full rescan suite — PASS**

Run: `pnpm vitest run tests/onboarding/applyRescanDecisionUnderLock.test.ts tests/onboarding/rescanWizardSheet*.test.ts`
Expected: PASS (refactor is behavior-preserving for rescan).

- [ ] **Step 5: Extend the deadlock meta-test** — in `tests/auth/advisoryLockRpcDeadlock.test.ts`, add a static assertion that `applyRescanDecisionUnderLock.ts`'s exported function body contains no `pg_advisory` and no `app_settings`/`wizard_finalize_checkpoints` write (reuse `stripComments` + a regex over the function block). Run it — PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding/applyRescanDecisionUnderLock.ts lib/onboarding/rescanWizardSheet.ts tests/onboarding/applyRescanDecisionUnderLock.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts
git commit --no-verify -m "refactor(onboarding): extract lock-free applyRescanDecisionUnderLock core"
```

---

## Task 4: Thread 3 — finalize inline re-parse on modtime drift

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (the `:730` mismatch branch + `processApprovedRow` deps)
- Test: `tests/onboarding/finalizeInlineRescan.test.ts` (fake-tx unit) + `tests/onboarding/finalizeInlineRescan.db.test.ts` (real Postgres)

**Interfaces:**
- Consumes: `applyRescanDecisionUnderLock` (Task 3), `prepareOnboardingFiles` (`runOnboardingScan.ts:944`), `computeRescanDecision` (via the core).
- `processApprovedRow` `input` gains `prepareOnboardingFiles` (defaulted to the real one, seam for tests) alongside the existing `fetchDriveFileMetadata`.

**Contract (spec §4.1, §4.4, §4.5):** replace the `demotePending(…, STAGED_PARSE_REVISION_RACE_DURING_FINALIZE)` at `route.ts:730-743` with:
1. `prepareOnboardingFiles(pendingFolderId, { listFolder: async () => [metadata] })` → prepared file. On throw → `demotePending(…, 'DRIVE_FETCH_FAILED')` + return that per-row failure (matches `:711`). On `non_sheet`/absent → demote as the scan reports.
2. `applyRescanDecisionUnderLock(rowTx, { wizardSessionId, driveFileId: row.drive_file_id, pendingFolderId, prepared })` — the core captures prior state under the held `show:` lock ITSELF (does NOT receive the outer `row`'s stale approval columns; plan-R1-1). This is why Task 3 moved `capturePriorState` into the core.
3. If `dirty_demoted` → return the per-row failure `{ code: 'RESCAN_REVIEW_REQUIRED', re_apply_url }`.
4. If clean (`clean_restamped`/`clean_unchecked`) → **full fresh-row rebind**: re-read the fresh `pending_syncs` row by `(wizard_session_id, drive_file_id)` and reassign the local `row`'s `staged_id`, `staged_modified_time`, and `triggered_review_items` from it (the existing `freshRead` at `:762` picks up `parse_result`, choices, approval by the fresh `staged_id`/`staged_modified_time`). Then CONTINUE (fall through) into the existing publish flow — do NOT return. Because the restage set `staged_modified_time = metadata.modifiedTime`, the `:730` guard now passes and `:762` matches the fresh identifiers. POST-COMMIT (after the outer `withTx` resolves), emit `log.info("finalize auto-healed modtime drift", { source: "api.admin.onboarding.finalize", event: "modtime_autohealed", driveFileId, wizardSessionId })` (NO `code:` field).

- [ ] **Step 1: Write the failing DB test** (T3/T4/T5) — a `.db.test.ts` that stages one approved row, mutates the fixture Drive metadata's `modifiedTime` to differ, and drives a finalize batch through a fake `prepareOnboardingFiles` returning (a) content-identical parse → asserts the show publishes with the FRESH `staged_modified_time`, `wizard_approved` stays true, NO demote, and NO `EXTRA_REVIEWER_CHOICE` (T3); (b) an MI-12-bearing parse → asserts the row is demoted `RESCAN_REVIEW_REQUIRED` and NOT published (T4); (c) `prepareOnboardingFiles` throws → `DRIVE_FETCH_FAILED` demote, not published (T5).

```ts
// tests/onboarding/finalizeInlineRescan.db.test.ts — sketch (real TEST_DATABASE_URL)
// stage approved row with staged_modified_time = T0; metadata.modifiedTime = T1 (T1≠T0)
// clean path: prepareOnboardingFiles returns parse identical to prior
const res = await runFinalizeBatch({ fetchDriveFileMetadata: async () => ({ ...meta, modifiedTime: T1 }), prepareOnboardingFiles: async () => [cleanPrepared] });
const show = await q(`select published, drive_file_id from shows where drive_file_id=$1`, [D]);
expect(show.published).toBe(true);
const ps = await q(`select staged_modified_time, wizard_approved, last_finalize_failure_code from pending_syncs where drive_file_id=$1`, [D]); // consumed on publish → assert via audit/show state instead
```

- [ ] **Step 2: Write the failing unit test** — fake-tx: assert that on a modtime mismatch with a clean prepared file, `processApprovedRow` does NOT return a `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE` failure and reaches the publish path; with a dirty prepared file it returns `RESCAN_REVIEW_REQUIRED`.

- [ ] **Step 2b: Write the failing approval-race test** (plan-R1-1) — a `.db.test.ts` (or the `afterDriveRead` seam pattern from `rescanWizardSheet`'s TOCTOU test) proving prior state is captured UNDER the `show:` lock, not from the outer select: stage an APPROVED row; between the outer select and the inline core, flip it UNCHECKED (concurrent unapprove); with a content-clean re-parse, assert the row is treated per its UNDER-LOCK state (unchecked → published Held, not resurrected as approved/Live). Mirror `tests/onboarding/finalizeApprovalRace.test.ts`.

- [ ] **Step 3: Run both — FAIL** (current code demotes unconditionally at `:730`).

- [ ] **Step 4: Implement** the `:730` branch replacement + the `input.prepareOnboardingFiles` seam + the post-commit `log.info`. Rebind `row.staged_id`/`row.staged_modified_time`/`row.triggered_review_items` from a fresh `select staged_id, staged_modified_time, triggered_review_items from pending_syncs where wizard_session_id=$1 and drive_file_id=$2`. **This pre-read is what satisfies the spec's "full fresh-row rebind" (§4.1):** the three re-read fields are exactly the ones the existing downstream `freshRead` (`route.ts:774`) does NOT re-read but the publish path consumes from `row` — `staged_id`/`staged_modified_time` key `freshRead`'s generation-scoped `where` (`:781-785`), and `triggered_review_items` is read directly at `:887`. `freshRead` then picks up `parse_result`, `wizard_approved`, choices, and approver by the fresh `staged_id`/`staged_modified_time`, so the whole row is fresh-generation-consistent (no `EXTRA_REVIEWER_CHOICE`).

- [ ] **Step 5: Run — PASS**, then the finalize suite: `pnpm vitest run tests/onboarding/finalize*.test.ts tests/onboarding/finalizeInlineRescan*.test.ts`.

- [ ] **Step 6: Run the deadlock meta-test** (`pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts`) — PASS (T6: the inline path introduces no advisory acquisition; the core is lock-free).

- [ ] **Step 7: Commit**

```bash
git add app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalizeInlineRescan.test.ts tests/onboarding/finalizeInlineRescan.db.test.ts
git commit --no-verify -m "feat(onboarding): auto-heal cosmetic modtime drift inline during finalize"
```

---

## Task 5: Thread 2a — cleanup lock rewrite (advisory-before-row, five-table union, session-scoped purge)

**Files:**
- Modify: `lib/onboarding/sessionLifecycle.ts` (`lockCleanupDriveFiles` → advisory-before-row over the full union; `cleanupAbandonedFinalize` final purge → session-scoped)
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts` (T10-static)
- Test: `tests/onboarding/finalizeCleanupOverlap*.test.ts` (existing DB tests stay green) + `tests/onboarding/cleanupReapCrossSession.db.test.ts` (T11)

**Contract (spec §5.5, R7/R8/R9):** rewrite cleanup's drive-file locking to reuse the reap pattern: collect the DISCARDED session's drive-id union via `collectReapDriveFileIds(tx, sessionId)` (PLAIN reads, five tables), acquire all `show:` advisory locks sorted BEFORE any `FOR UPDATE` (remove the `applied`/shadow `FOR UPDATE` in `lockCleanupDriveFiles`). Change `cleanupAbandonedFinalize`'s final `purgeWizardRows` (`:458`) to a SESSION-SCOPED delete (`where wizard_session_id = $sessionId` for the four wizard tables; `shows_pending_changes` already scoped at `:391`). Leave `purgeAndRotateOnboardingSession`/`purgeAndRotateIfStale` untouched.

- [ ] **Step 1: Write the failing T10-static + T11 tests.** T10-static: assert `cleanupAbandonedFinalize`'s lock helper body has no `for update` before its first `pg_advisory_xact_lock(show:` (extend the existing FOR-UPDATE-before-advisory scanner to include `sessionLifecycle.ts`). T11 (`.db.test.ts`): active session A + stale session B with staging rows + a B interim show; discard A; assert B's manifest/pending rows and interim show survive, and a subsequent `reapStaleOnboardingSessions` still reaps B correctly.

- [ ] **Step 2: Run — FAIL** (current `lockCleanupDriveFiles` does FOR UPDATE first; current purge is global).

- [ ] **Step 3: Implement** — replace `lockCleanupDriveFiles`'s body with a `collectReapDriveFileIds(tx, sessionId)` collect + sorted `pg_advisory_xact_lock(show:…)` loop (no FOR UPDATE). Replace the `cleanupAbandonedFinalize` `:458` `purgeWizardRows(tx)` with a session-scoped delete helper.

- [ ] **Step 4: Run — PASS**, plus the full cleanup + reap suites (`pnpm vitest run tests/onboarding/finalizeCleanup*.test.ts tests/onboarding/*reap*.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/sessionLifecycle.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/onboarding/cleanupReapCrossSession.db.test.ts
git commit --no-verify -m "refactor(onboarding): advisory-before-row cleanup locking + session-scoped purge"
```

---

## Task 6: Thread 2b — stuck-eligibility + recency bypass + under-lock recheck

**Files:**
- Modify: `lib/onboarding/sessionLifecycle.ts` (`cleanupAbandonedFinalize` eligibility)
- Test: `tests/onboarding/cleanupStuckEligibility.test.ts` + `tests/onboarding/cleanupStuckEligibility.db.test.ts` + `tests/onboarding/cleanupRecoveryConcurrency.db.test.ts` (T10)

**Contract (spec §5.1, §5.4, §5.5 step 3):** add a provably-stuck eligibility path: under the held `finalize:<session>` lock, `stuck = (finishableCleanCount(tx, sessionId) === 0) && (unresolvedManifestCount(tx, sessionId) > 0)`. When stuck, proceed regardless of `pending_wizard_session_at` age AND regardless of `finalize_active_within_last_hour`. When not stuck AND not 24h-stale → keep throwing `session_too_fresh`. After acquiring the `show:` locks (Task 5), RE-CHECK (both paths): if ANY pre-lock-unresolved drive_file_id is now resolved → abort `session_too_fresh`, purge nothing. Add local SQL count helpers mirroring `selectFinishableCleanRows` / `unresolvedManifestCount` predicates (finalize/route.ts:333, :381).

- [ ] **Step 1: Write failing tests** — T7 (fresh <24h stuck session → cleaned; published show survives; unpublished interim deleted), T8 (fresh non-stuck with finishable rows → `session_too_fresh`), T9 (fresh non-stuck → still guarded), T9b (fresh stuck with `last_processed_at` 2 min old → cleaned, recency does NOT block), **T10 — the full 2×2 matrix (plan-R1-2, spec T10)**: a `.db.test.ts` parameterized over {recovery route ∈ (staged **Apply** on a `staged`+code row, staged **Unapprove** on an `applied` row)} × {cleanup path ∈ (24h-stale, provably-stuck)}. For EACH of the four cells: hold the row's `show:` lock FIRST (recovery took it before its row mutation), invoke cleanup → assert NO AB-BA hang (cleanup blocks, then proceeds after the recovery commits); assert the under-lock recheck ABORTS `session_too_fresh` (purging nothing) when the recovery RESOLVED the row, and PROCEEDS when it did not. The stale-path cells MUST exercise the recheck too, so a stuck-only recheck implementation fails.

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement** the eligibility branch + count helpers + the under-lock recheck (re-read the pre-lock unresolved set; abort if any is now resolved).

- [ ] **Step 4: Run — PASS**, plus the full cleanup suite.

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/sessionLifecycle.ts tests/onboarding/cleanupStuckEligibility.test.ts tests/onboarding/cleanupStuckEligibility.db.test.ts tests/onboarding/cleanupRecoveryConcurrency.db.test.ts
git commit --no-verify -m "feat(onboarding): immediate discard for provably-stuck sessions"
```

---

## Task 7: Thread 2 — discard confirm copy (UI — Opus + impeccable)

**Files:**
- Modify: `components/admin/CleanupAbandonedFinalizeButton.tsx` (confirmation copy)
- Modify: `components/admin/FinalizeInProgress.tsx` (the "Trouble finishing?" subcopy, if it references the 24h wait)
- Test: `tests/components/admin/CleanupAbandonedFinalizeButton.test.tsx`

**Contract (spec §5.3):** the confirm copy states plainly that discarding wipes the unpublished remainder of THIS run and that shows already published in this run stay live. No new §12.4 code (state-page copy).

- [ ] **Step 1: `/impeccable`** preflight (UI change).
- [ ] **Step 2: Write the failing test** asserting the confirm dialog copy contains the "already-published shows stay live" clause.
- [ ] **Step 3: Run — FAIL.**
- [ ] **Step 4: Update the copy.**
- [ ] **Step 5: Run — PASS.**
- [ ] **Step 6: impeccable dual-gate** (`/impeccable critique` + `/impeccable audit` on the diff); fix HIGH/CRITICAL or `DEFERRED.md`.
- [ ] **Step 7: Commit**

```bash
git add components/admin/CleanupAbandonedFinalizeButton.tsx components/admin/FinalizeInProgress.tsx tests/components/admin/CleanupAbandonedFinalizeButton.test.tsx
git commit --no-verify -m "feat(admin): discard confirm copy — published shows stay live"
```

---

## Task 8: Whole-suite verification + gates

- [ ] **Step 1: Typecheck** — `pnpm typecheck` → clean (vitest strips types; `next build`/quality-tsc will catch what vitest missed).
- [ ] **Step 2: Lint** — `pnpm lint` → clean (`better-tailwindcss/enforce-canonical-classes` is an error).
- [ ] **Step 3: Format** — `pnpm format:check` → clean (never `prettier --write` the master spec).
- [ ] **Step 4: Full suite** — `pnpm test` → green. Triage any DB-test failures as env/psql vs real (worktree shares the validation DB — a branch-vs-shared-DB skew is expected for some `.db.test.ts`; run the affected suite against a clean DB state).
- [ ] **Step 5: Re-run the structural meta-tests explicitly** — `pnpm vitest run tests/auth/advisoryLockRpcDeadlock.test.ts tests/admin/_metaInfraContract.test.ts` (comment/format fragility per `feedback_structural_metatest_comment_fragility`).
- [ ] **Step 6: Commit** any lint/format fixups.

---

## Self-review notes (writing-plans)

- **Spec coverage:** Thread 1 §3 → Tasks 1-2; Thread 3 §4 → Tasks 3-4; Thread 2 §5 → Tasks 5-6-7; observability §4.5 → Task 4 Step 4; meta-tests §7 → Tasks 1,3,5. All spec sections mapped.
- **No migration** → no `gen:schema-manifest` / validation-apply step needed (confirmed: zero DDL).
- **Type consistency:** `readUnresolvedSheets` → `UnresolvedSheet[]|{kind:'infra_error'}` used identically in Task 2. `applyRescanDecisionUnderLock` outcome kinds (`clean_restamped`/`clean_unchecked`/`dirty_demoted`) consumed in Task 4.
- **Concrete failure modes stated** per test (T3-T11 map to spec §10).
