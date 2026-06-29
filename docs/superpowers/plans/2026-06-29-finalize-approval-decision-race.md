# Finalize Approval-Decision Race Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the finalize approval-decision race by re-reading the full decision row under the already-held per-show lock and driving every checked/unchecked branch from the locked values instead of the stale select-time approval columns.

**Architecture:** Backend-only change to `processApprovedRow` in the finalize route. The existing generation-scoped locked re-read (currently `select parse_result`) is widened to the full decision row IN PLACE (after the Drive fence). The ~12-line version-gate block moves to after `coercedRow` so it keys on locked values. The 4-branch decision reads are re-pointed from `row.*` to `coercedRow.*`. A defensive finishable re-validation skip is added. No schema, no new RPC, no new advisory-lock holder, no new error code.

**Tech Stack:** Next.js 16 route handler, postgres.js, Vitest (mocked fake-DB harness — no real DB).

**Spec:** `docs/superpowers/specs/2026-06-29-finalize-approval-decision-race-design.md` (Codex-APPROVED, 4 rounds).

## Global Constraints

- **Per-show advisory lock single-holder (invariant 2):** the re-read rides the EXISTING `pg_advisory_xact_lock(hashtext('show:' || $1))` held by `defaultWithRowTx` (`finalize/route.ts:176`). Acquire NO new advisory lock. `adoptShowLockHeld` asserts-only.
- **No new §12.4 error code (invariant 5):** the non-finishable skip reuses `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`.
- **Commit per task (invariant 6):** conventional-commits, `feat(onboarding):` / `test(onboarding):` scope.
- **TDD per task (invariant 1):** failing test → minimal implementation → passing test → commit.
- **Coercion ordering is load-bearing:** the re-read + `coercedRow` (`asParseResult`/`coerceJsonbArray`, which THROW → whole-route 500) MUST stay AFTER the per-row Drive fence (`:719-755`). Do NOT move them earlier — a corrupt payload on a row that should get a graceful per-row Drive demote would otherwise wedge the whole batch (`ONBOARDING_FINALIZE_INTERNAL_ERROR`, `:1150`).
- **No UI, no impeccable gate** (no files under `app/` except `app/api/**`; this is `app/api/**`).

## Meta-test inventory (declared per AGENTS.md)

- **EXTENDS** `tests/auth/advisoryLockRpcDeadlock.test.ts:525-527` — assertion (1)'s re-SELECT regex is widened for the new column list (Task 1). Assertions (2) no-new-lock and (3) no-Drive-call are UNCHANGED and still pass.
- **EXTENDS** three fake-DB re-read handlers (mechanical) so the widened SQL still matches and returns decision columns: `tests/app/admin/finalizeAgendaRace.test.ts:232`, `tests/onboarding/finalize.test.ts:255` + `:286` (classify), `tests/onboarding/finalizeRevalidate.test.ts:209` (Task 1).
- **CREATES** `tests/onboarding/finalizeApprovalRace.test.ts` (Tasks 2-3).
- **Advisory-lock topology:** UNCHANGED — no new holder. No edit to the topology assertions, only the shape regex.
- **Supabase call-boundary meta-test (`_metaInfraContract`):** N/A — the re-read is a raw `tx.query` inside the existing tx adapter, not a Supabase client call.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `app/api/admin/onboarding/finalize/route.ts` | finalize publish loop | widen re-read SELECT + `PendingFinalizeRow`; move version gate; add finishable skip; re-point 4-branch to `coercedRow` |
| `tests/onboarding/finalizeApprovalRace.test.ts` | the race regression tests | NEW (§8.1-8.5) |
| `tests/app/admin/finalizeAgendaRace.test.ts` | agenda re-read tests | widen 1 handler match + return shape |
| `tests/onboarding/finalize.test.ts` | finalize unit tests | widen 2 handler matches + return shape |
| `tests/onboarding/finalizeRevalidate.test.ts` | finalize revalidate tests | widen 1 handler match + return shape |
| `tests/auth/advisoryLockRpcDeadlock.test.ts` | re-SELECT topology meta-test | widen assertion (1) regex |

---

## Task 1: Widen the locked re-read to the full decision row (plumbing, no behavior change)

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (type `PendingFinalizeRow` ~`:97-114`; re-read SELECT `:769-794`)
- Modify: `tests/app/admin/finalizeAgendaRace.test.ts:230-235`
- Modify: `tests/onboarding/finalize.test.ts:253-262` + `:285-287`
- Modify: `tests/onboarding/finalizeRevalidate.test.ts:209-219`
- Modify: `tests/auth/advisoryLockRpcDeadlock.test.ts:520-527`

**Interfaces:**
- Produces: `PendingFinalizeRow` now carries `last_finalize_failure_code: string | null`. `rereadRow` (and therefore `coercedRow`) carries all six decision columns from the locked re-read. The 4-branch logic STILL reads `row.*` (unchanged) — behavior is identical this task; this is pure plumbing so later tasks can re-point to `coercedRow`.

- [ ] **Step 1: Widen the re-read SELECT + `rereadRow` in the route**

In `app/api/admin/onboarding/finalize/route.ts`, replace the re-read block (`:769-794`) so the SELECT fetches the full decision row and `rereadRow` is built from it. Replace:

```typescript
  const freshRead = await tx.query<{ parse_result: ParseResult }>(
    `select parse_result from public.pending_syncs
      where wizard_session_id = $1::uuid
        and drive_file_id = $2
        and staged_id = $3::uuid
        and staged_modified_time = $4::timestamptz`,
    [wizardSessionId, row.drive_file_id, row.staged_id, row.staged_modified_time],
  );
  if (freshRead.rowCount === 0) {
    await demotePending(
      tx,
      wizardSessionId,
      row.drive_file_id,
      STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
    );
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }
  const rereadRow: PendingFinalizeRow = {
    ...row,
    parse_result: freshRead.rows[0]!.parse_result,
  };
```

with (note: `parse_result` stays the FIRST column so the SQL is greppable; the comment block above it at `:757-768` is unchanged):

```typescript
  // Widened to the FULL decision row (spec §3.1): approve/unapprove change the
  // approval columns WITHOUT bumping staged_modified_time, so the generation-scoped
  // re-read must re-fetch them to drive the 4-branch from LOCKED values, not the
  // stale select-time columns. last_finalize_failure_code is re-read for the
  // finishable re-validation (Task 3). parse_result stays first (greppable prefix).
  const freshRead = await tx.query<{
    parse_result: ParseResult;
    wizard_approved: boolean;
    wizard_reviewer_choices: unknown[];
    wizard_reviewer_choices_version: number | null;
    wizard_approved_by_email: string | null;
    wizard_approved_at: string | Date | null;
    last_finalize_failure_code: string | null;
  }>(
    `select parse_result,
            wizard_approved,
            wizard_reviewer_choices, wizard_reviewer_choices_version,
            wizard_approved_by_email, wizard_approved_at,
            last_finalize_failure_code
       from public.pending_syncs
      where wizard_session_id = $1::uuid
        and drive_file_id = $2
        and staged_id = $3::uuid
        and staged_modified_time = $4::timestamptz`,
    [wizardSessionId, row.drive_file_id, row.staged_id, row.staged_modified_time],
  );
  if (freshRead.rowCount === 0) {
    await demotePending(
      tx,
      wizardSessionId,
      row.drive_file_id,
      STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
    );
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }
  const locked = freshRead.rows[0]!;
  const rereadRow: PendingFinalizeRow = {
    ...row,
    parse_result: locked.parse_result,
    wizard_approved: locked.wizard_approved,
    wizard_reviewer_choices: locked.wizard_reviewer_choices,
    wizard_reviewer_choices_version: locked.wizard_reviewer_choices_version,
    wizard_approved_by_email: locked.wizard_approved_by_email,
    wizard_approved_at: locked.wizard_approved_at,
    last_finalize_failure_code: locked.last_finalize_failure_code,
  };
```

- [ ] **Step 2: Add `last_finalize_failure_code` to `PendingFinalizeRow`**

In the same file, the type `PendingFinalizeRow` (`:97-114`) ends with `base_modified_time: string | Date | null;`. Add the new field immediately before the closing `};`:

```typescript
  base_modified_time: string | Date | null;
  // Re-read under the show: lock for the finishable re-validation (spec §3.2). NOT
  // selected by selectFinishableCleanRows (which uses it only in its WHERE); present
  // here only because the widened locked re-read fetches it.
  last_finalize_failure_code: string | null;
};
```

Note: `selectFinishableCleanRows` (`:372`) does NOT select this column, so its returned rows omit it. That is fine for TypeScript only if the field is optional OR the outer-select rows are cast. To avoid widening the outer select, make the field optional: write `last_finalize_failure_code?: string | null;` instead. Use the optional form. (The widened re-read always sets it; the outer select leaves it `undefined`, which is acceptable because only the post-re-read code path — Task 3 — reads it, and it reads `rereadRow.last_finalize_failure_code` which is always set.)

- [ ] **Step 3: Run the finalize suites — verify they FAIL (handlers don't match widened SQL)**

Run:
```bash
cd /Users/ericweiss/fxav-finalize-approval-race
npx vitest run tests/onboarding/finalize.test.ts tests/app/admin/finalizeAgendaRace.test.ts tests/onboarding/finalizeRevalidate.test.ts --environment node
```
Expected: FAILURES — the fake-DB handlers match `select parse_result from public.pending_syncs...`, which the widened SELECT (`select parse_result, wizard_approved, ...`) no longer satisfies, so the re-read either falls through to "unhandled SQL" or returns no decision columns.

- [ ] **Step 4: Update the `finalizeAgendaRace.test.ts` handler**

In `tests/app/admin/finalizeAgendaRace.test.ts`, the re-read handler (`:232`) currently:

```typescript
    if (n.startsWith("select parse_result from public.pending_syncs where wizard_session_id")) {
      if (this.rereadParseResult === null) return { rows: [] as T[], rowCount: 0 };
      return { rows: [{ parse_result: this.rereadParseResult } as T], rowCount: 1 };
    }
```

Replace with (match the widened SQL prefix + return the decision columns from the single seeded `approved` row so the agenda tests' decision behavior is unchanged):

```typescript
    if (n.startsWith("select parse_result, wizard_approved")) {
      if (this.rereadParseResult === null) return { rows: [] as T[], rowCount: 0 };
      const r = this.approved[0]!;
      return {
        rows: [
          {
            parse_result: this.rereadParseResult,
            wizard_approved: r.wizard_approved,
            wizard_reviewer_choices: r.wizard_reviewer_choices,
            wizard_reviewer_choices_version: r.wizard_reviewer_choices_version,
            wizard_approved_by_email: r.wizard_approved_by_email,
            wizard_approved_at: r.wizard_approved_at,
            last_finalize_failure_code: r.last_finalize_failure_code ?? null,
          } as T,
        ],
        rowCount: 1,
      };
    }
```

- [ ] **Step 5: Update the `finalize.test.ts` handler (2 sites)**

In `tests/onboarding/finalize.test.ts`, the query handler (`:255`):

```typescript
    if (
      normalized.startsWith("select parse_result from public.pending_syncs where wizard_session_id")
    ) {
      const foundRow = this.approved.find(
        (candidate) => candidate.drive_file_id === params[1] && candidate.staged_id === params[2],
      );
      if (!foundRow) return { rows: [], rowCount: 0 };
      return { rows: [{ parse_result: foundRow.parse_result } as T], rowCount: 1 };
    }
```

Replace with:

```typescript
    if (normalized.startsWith("select parse_result, wizard_approved")) {
      const foundRow = this.approved.find(
        (candidate) => candidate.drive_file_id === params[1] && candidate.staged_id === params[2],
      );
      if (!foundRow) return { rows: [], rowCount: 0 };
      return {
        rows: [
          {
            parse_result: foundRow.parse_result,
            wizard_approved: foundRow.wizard_approved,
            wizard_reviewer_choices: foundRow.wizard_reviewer_choices,
            wizard_reviewer_choices_version: foundRow.wizard_reviewer_choices_version,
            wizard_approved_by_email: foundRow.wizard_approved_by_email,
            wizard_approved_at: foundRow.wizard_approved_at,
            last_finalize_failure_code: foundRow.last_finalize_failure_code ?? null,
          } as T,
        ],
        rowCount: 1,
      };
    }
```

And the `classify()` site (`:286`):

```typescript
    if (sql.startsWith("select parse_result from public.pending_syncs"))
      return "reread-parse-result";
```

Replace with:

```typescript
    if (sql.startsWith("select parse_result, wizard_approved")) return "reread-parse-result";
```

NOTE: `finalize.test.ts`'s `PendingRow` type (`:15-29`) already carries all six decision fields (`wizard_reviewer_choices`, `wizard_reviewer_choices_version`, `wizard_approved`, `wizard_approved_by_email`, `wizard_approved_at`, `last_finalize_failure_code?`) — verified. No type addition needed; the handler above compiles against the existing `PendingRow`. (The `pending()` factory at `:345` seeds them.)

- [ ] **Step 6: Update the `finalizeRevalidate.test.ts` handler**

In `tests/onboarding/finalizeRevalidate.test.ts` (`:209`):

```typescript
    if (n.startsWith("select parse_result from public.pending_syncs where wizard_session_id")) {
      const row = this.approved.find(
        (r) =>
          r.drive_file_id === params[1] &&
          r.staged_id === params[2] &&
          r.staged_modified_time === params[3],
      );
```

Change the match string and the return to include decision columns. Replace the `if` line with:

```typescript
    if (n.startsWith("select parse_result, wizard_approved")) {
      const row = this.approved.find(
        (r) =>
          r.drive_file_id === params[1] &&
          r.staged_id === params[2] &&
          r.staged_modified_time === params[3],
      );
```

Then locate the `return { rows: [{ parse_result: ... }], rowCount: 1 }` inside this handler (read `:215-225`) and widen it to return all six decision columns from `row` (same shape as Step 4/5). If `row` is undefined, keep the existing 0-row return.

- [ ] **Step 7: Widen the `advisoryLockRpcDeadlock.test.ts` re-SELECT regex**

In `tests/auth/advisoryLockRpcDeadlock.test.ts:525-527`:

```typescript
      ).toMatch(
        /select parse_result from public\.pending_syncs[\s\S]*?where[\s\S]*?wizard_session_id[\s\S]*?drive_file_id[\s\S]*?staged_id[\s\S]*?staged_modified_time/i,
      );
```

Replace with (tolerate the inserted column list; keep all four WHERE-key assertions):

```typescript
      ).toMatch(
        /select parse_result[\s\S]*?from public\.pending_syncs[\s\S]*?where[\s\S]*?wizard_session_id[\s\S]*?drive_file_id[\s\S]*?staged_id[\s\S]*?staged_modified_time/i,
      );
```

- [ ] **Step 8: Run the four suites + topology meta-test — verify GREEN**

Run:
```bash
npx vitest run tests/onboarding/finalize.test.ts tests/app/admin/finalizeAgendaRace.test.ts tests/onboarding/finalizeRevalidate.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts --environment node
```
Expected: ALL PASS. (Plumbing complete; behavior unchanged — the 4-branch still reads `row.*`.)

- [ ] **Step 9: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "finalize|error TS" | head || echo "tsc clean"
git add app/api/admin/onboarding/finalize/route.ts tests/app/admin/finalizeAgendaRace.test.ts tests/onboarding/finalize.test.ts tests/onboarding/finalizeRevalidate.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts
git commit -m "refactor(onboarding): widen finalize locked re-read to full decision row (plumbing)"
```

---

## Task 2: Move the version gate + drive the 4-branch from `coercedRow` (the race fix)

**Files:**
- Create: `tests/onboarding/finalizeApprovalRace.test.ts`
- Modify: `app/api/admin/onboarding/finalize/route.ts` (version gate `:704-717` → relocate; 4-branch reads `:846`, `:892`, `:895-896`, `:898`, `:962`)

**Interfaces:**
- Consumes: `coercedRow` (Task 1 made it carry the locked decision columns).
- Produces: every decision read in `processApprovedRow` flows from `coercedRow`; the version gate runs AFTER `coercedRow`. The race is closed.

- [ ] **Step 1: Write the failing race tests**

Create `tests/onboarding/finalizeApprovalRace.test.ts`. Model the fake DB on `tests/app/admin/finalizeAgendaRace.test.ts` (read it for the full FakeRaceDb + fakeRacePipeline + request/deps builders — copy that scaffolding verbatim), but add a `rereadDecision` config so the re-read handler returns decision columns that DIFFER from the outer-select `approved` row. The full test file:

```typescript
/**
 * Spec §8 — finalize approval-decision race (BL-FINALIZE-APPROVAL-DECISION-RACE).
 *
 * selectFinishableCleanRows (outer tx, NO show: lock) reads approval columns at
 * select time; a concurrent approve/unapprove that commits before finalize's
 * per-row show: lock changes those columns WITHOUT bumping staged_modified_time.
 * The widened locked re-read (Task 1) + coercedRow re-point (Task 2) make finalize
 * drive the 4-branch from the LOCKED values, honoring the latest checkbox intent.
 *
 * The fake re-read returns decision columns from `rereadDecision`, deliberately
 * DIFFERENT from the outer-select row, so a regression that reads the stale `row.*`
 * fails (anti-tautology: assertions are against the re-read values, not the outer row).
 */
import { describe, expect, test, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache:
    (fn: (...a: unknown[]) => unknown) =>
    (...a: unknown[]) =>
      fn(...a),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

import type { FinalizeRouteDeps, FinalizeRouteTx } from "@/app/api/admin/onboarding/finalize/route";
import { handleOnboardingFinalize } from "@/app/api/admin/onboarding/finalize/route";
import type { SyncPipelineTx } from "@/lib/sync/runScheduledCronSync";

const W1 = "22222222-2222-4222-8222-222222222222";
const FOLDER = "race-folder";
const DRIVE_ID = "race-drive-file";
const STAGED_ID = "33333333-3333-4333-8333-333333333333";
const STAGED_ISO = "2026-06-01T12:00:00.000Z";

const PARSE_RESULT = {
  show: {
    title: "Approval Race Show",
    client_label: null,
    client_contact: null,
    template_version: "v4",
    venue: null,
    dates: { travelIn: "2026-05-07", set: "2026-05-08", showDays: ["2026-05-09"], travelOut: "2026-05-10" },
    schedule_phases: {},
    event_details: {},
    agenda_links: [],
    coi_status: null,
    po: null,
    proposal: null,
    invoice: null,
    invoice_notes: null,
  },
  crewMembers: [],
  hotelReservations: [],
  rooms: [],
  transportation: null,
  contacts: [],
  pullSheet: null,
  diagrams: { linkedFolder: null, embeddedImages: [], linkedFolderItems: [] },
  openingReel: null,
  raw_unrecognized: [],
  warnings: [],
  hardErrors: [],
};

type Decision = {
  wizard_approved: boolean;
  wizard_reviewer_choices: unknown[];
  wizard_reviewer_choices_version: number | null;
  wizard_approved_by_email: string | null;
  wizard_approved_at: string | null;
  last_finalize_failure_code: string | null;
};

type PendingRow = Decision & {
  drive_file_id: string;
  staged_id: string;
  staged_modified_time: string;
  parse_result: Record<string, unknown>;
  triggered_review_items: unknown;
  base_modified_time: string | null;
};

// CHECKED (approved) decision — the wizard's "publish" intent.
const CHECKED: Decision = {
  wizard_approved: true,
  wizard_reviewer_choices: [],
  wizard_reviewer_choices_version: 1,
  wizard_approved_by_email: "doug@fxav.test",
  wizard_approved_at: "2026-06-01T14:00:00.000Z",
  last_finalize_failure_code: null,
};
// UNCHECKED decision — the wizard's "leave Held" intent.
const UNCHECKED: Decision = {
  wizard_approved: false,
  wizard_reviewer_choices: [],
  wizard_reviewer_choices_version: null,
  wizard_approved_by_email: null,
  wizard_approved_at: null,
  last_finalize_failure_code: null,
};

function makeRow(decision: Decision): PendingRow {
  return {
    drive_file_id: DRIVE_ID,
    staged_id: STAGED_ID,
    staged_modified_time: STAGED_ISO,
    parse_result: PARSE_RESULT as Record<string, unknown>,
    triggered_review_items: [],
    base_modified_time: null,
    ...decision,
  };
}

class FakeDb implements FinalizeRouteTx {
  outer: PendingRow; // what selectFinishableCleanRows returns (select-time)
  reread: Decision | null; // locked re-read decision; null → 0 rows (generation-stale)
  existingShows: Set<string>;
  demoted: Array<{ driveFileId: string; code: string }> = [];
  stagedShadowParams: Array<readonly unknown[]> = [];
  firstSeenApplied: string[] = [];
  provenanceApproved: boolean[] = [];
  deletedPending: string[] = [];

  constructor(opts: { outer: Decision; reread: Decision | null; existingShows?: Set<string> }) {
    this.outer = makeRow(opts.outer);
    this.reread = opts.reread;
    this.existingShows = opts.existingShows ?? new Set();
  }

  async query<T>(sql: string, params: readonly unknown[] = []) {
    const n = sql.replace(/\s+/g, " ").trim();
    if (n.includes("pg_try_advisory_xact_lock(hashtext('finalize:'"))
      return { rows: [{ locked: true } as T], rowCount: 1 };
    if (n.startsWith("select pending_wizard_session_id"))
      return { rows: [{ pending_wizard_session_id: W1 } as T], rowCount: 1 };
    if (n.startsWith("insert into public.wizard_finalize_checkpoints"))
      return { rows: [{ wizard_session_id: W1, status: "in_progress", batches_completed: 0 } as T], rowCount: 1 };
    if (n.startsWith("select status, batches_completed")) return { rows: [] as T[], rowCount: 0 };
    if (n.startsWith("update public.wizard_finalize_checkpoints")) return { rows: [] as T[], rowCount: 0 };
    if (n.startsWith("select pending_folder_id")) return { rows: [{ pending_folder_id: FOLDER } as T], rowCount: 1 };
    if (n.startsWith("select count(*)::int as unresolved_count")) return { rows: [{ unresolved_count: 0 } as T], rowCount: 1 };
    if (n.startsWith("select count(*)::int as remaining_count")) return { rows: [{ remaining_count: 0 } as T], rowCount: 1 };
    // outer finishable-clean select
    if (n.startsWith("select ps.drive_file_id, ps.staged_id"))
      return { rows: [this.outer as T], rowCount: 1 };
    // widened locked re-read
    if (n.startsWith("select parse_result, wizard_approved")) {
      if (this.reread === null) return { rows: [] as T[], rowCount: 0 };
      return {
        rows: [
          {
            parse_result: this.outer.parse_result,
            wizard_approved: this.reread.wizard_approved,
            wizard_reviewer_choices: this.reread.wizard_reviewer_choices,
            wizard_reviewer_choices_version: this.reread.wizard_reviewer_choices_version,
            wizard_approved_by_email: this.reread.wizard_approved_by_email,
            wizard_approved_at: this.reread.wizard_approved_at,
            last_finalize_failure_code: this.reread.last_finalize_failure_code,
          } as T,
        ],
        rowCount: 1,
      };
    }
    if (n.startsWith("select exists"))
      return { rows: [{ exists: this.existingShows.has(params[0] as string) } as T], rowCount: 1 };
    if (n.startsWith("update public.pending_syncs")) {
      this.demoted.push({ driveFileId: params[0] as string, code: params[2] as string });
      return { rows: [{ demoted: true } as T], rowCount: 1 };
    }
    if (n.startsWith("update public.onboarding_scan_manifest set created_show_id")) {
      // recordCreatedShowProvenance: `set created_show_id = $3::uuid, publish_intent = $4`.
      // params[3] is publishIntent = coercedRow.wizard_approved — the locked publish decision.
      this.provenanceApproved.push(params[3] as boolean);
      return { rows: [{ recorded: true } as T], rowCount: 1 };
    }
    if (n.startsWith("update public.onboarding_scan_manifest")) return { rows: [] as T[], rowCount: 0 };
    if (n.startsWith("insert into public.shows_pending_changes")) {
      this.stagedShadowParams.push(params);
      return { rows: [{ show_id: "show-existing-1" } as T], rowCount: 1 };
    }
    if (n.startsWith("insert into public.shows")) {
      this.firstSeenApplied.push(params[0] as string);
      return { rows: [{ show_id: "show-first-seen-1" } as T], rowCount: 1 };
    }
    if (n.startsWith("insert into public.sync_audit")) return { rows: [{ id: "audit-1" } as T], rowCount: 1 };
    if (n.startsWith("delete from public.pending_syncs")) {
      this.deletedPending.push(params[0] as string);
      return { rows: [{ deleted: true } as T], rowCount: 1 };
    }
    throw new Error(`FakeDb unhandled SQL:\n${n}`);
  }
}

function fakePipeline(db: FakeDb): SyncPipelineTx {
  return {
    async queryOne(sqlText: string) {
      const n = sqlText.replace(/\s+/g, " ").trim();
      if (/pg_locks/i.test(n)) return { held: true };
      if (n.startsWith("insert into public.sync_audit")) return { id: "audit-1" };
      throw new Error(`fakePipeline.queryOne unhandled:\n${n}`);
    },
    async applyShowSnapshot(args: { driveFileId: string }) {
      db.firstSeenApplied.push(args.driveFileId);
      return { outcome: "updated" as const, showId: "show-first-seen-1", previousCrewNames: [], previousCrewMembers: [], priorRunOfShow: null };
    },
    async deleteCrewMembersNotIn() {},
    async upsertCrewMembers() {},
    async provisionAddedCrewAuth() {},
    async revokeRemovedCrewAuth() {},
    async replaceHotelReservations() {},
    async replaceRooms() {},
    async replaceTransportation() {},
    async replaceContacts() {},
    async upsertShowsInternal() {},
    async deleteLivePendingIngestion() {
      throw new Error("wizard finalize must NOT touch live partition");
    },
  } as unknown as SyncPipelineTx;
}

function request(): Request {
  return new Request("https://crew.fxav.test/api/admin/onboarding/finalize", { method: "POST" });
}
function fetchMeta() {
  return vi.fn(async () => ({
    driveFileId: DRIVE_ID,
    name: "race.xlsx",
    mimeType: "application/vnd.google-apps.spreadsheet",
    modifiedTime: STAGED_ISO,
    parents: [FOLDER],
  }));
}
function deps(db: FakeDb): FinalizeRouteDeps {
  return {
    requireAdminIdentity: async () => ({ email: "finalizer@fxav.test" }),
    withTx: async (fn) => fn(db),
    withRowTx: async (_dfid, fn) => fn(db, fakePipeline(db)),
    fetchDriveFileMetadata: fetchMeta(),
  } satisfies FinalizeRouteDeps;
}

describe("finalize approval-decision race (§8)", () => {
  // 8.1 — Doug UNCHECKS after select; finalize must NOT publish.
  test("8.1 checked→unchecked: existing-show D10 NO-OP, no shadow, not published", async () => {
    const db = new FakeDb({ outer: CHECKED, reread: UNCHECKED, existingShows: new Set([DRIVE_ID]) });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.stagedShadowParams).toHaveLength(0); // unchecked existing-show = NO shadow
    expect(db.firstSeenApplied).toHaveLength(0);
  });

  test("8.1b checked→unchecked first-seen: created HELD (publish_intent=false)", async () => {
    const db = new FakeDb({ outer: CHECKED, reread: UNCHECKED, existingShows: new Set() });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.firstSeenApplied).toHaveLength(1);
    expect(db.provenanceApproved).toEqual([false]); // Held, not published
  });

  // 8.2 — Doug CHECKS after select; finalize must publish, using locked provenance.
  test("8.2 unchecked→checked existing-show: shadow staged (published)", async () => {
    const db = new FakeDb({ outer: UNCHECKED, reread: CHECKED, existingShows: new Set([DRIVE_ID]) });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.stagedShadowParams).toHaveLength(1); // checked existing-show stages a shadow
  });

  test("8.2b unchecked→checked first-seen: provenance approved=true (published)", async () => {
    const db = new FakeDb({ outer: UNCHECKED, reread: CHECKED, existingShows: new Set() });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.firstSeenApplied).toHaveLength(1);
    expect(db.provenanceApproved).toEqual([true]);
  });

  // 8.3 — no concurrent change: behaves as plain checked (proves re-read is the source).
  test("8.3 negative regression: no race → checked path unchanged", async () => {
    const db = new FakeDb({ outer: CHECKED, reread: CHECKED, existingShows: new Set([DRIVE_ID]) });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.stagedShadowParams).toHaveLength(1);
  });

  // 8.5 — locked decision (with a DISTINCT approver email) drives the checked publish.
  // outer is UNCHECKED (email null); locked is CHECKED with a distinct email. If the 4-branch
  // read the stale `row`, it would take the unchecked path (provenanceApproved=[false]). Reading
  // the locked row takes the checked path, and requireApprovedByEmail(coercedRow) reads the
  // LOCKED email (a stale-null email on a "checked" misread would instead throw). The exact
  // applied_by_email value in sync_audit is covered by the .db.test.ts family (real DB).
  test("8.5 locked checked decision (distinct approver) → published, not the stale unchecked", async () => {
    const db = new FakeDb({
      outer: { ...UNCHECKED },
      reread: { ...CHECKED, wizard_approved_by_email: "locked-approver@fxav.test" },
      existingShows: new Set(),
    });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    expect(db.firstSeenApplied).toHaveLength(1);
    expect(db.provenanceApproved).toEqual([true]); // locked-checked publish, not stale-unchecked Held
  });
});
```

The `provenanceApproved` capture is wired in the `FakeDb.query` handler for `update public.onboarding_scan_manifest set created_show_id` (it pushes `params[3]` = `publish_intent` = `coercedRow.wizard_approved`). Verified against `recordCreatedShowProvenance` (`finalize/route.ts:495-519`): `set created_show_id = $3::uuid, publish_intent = $4`.

- [ ] **Step 2: Run the new tests — verify they FAIL**

Run:
```bash
npx vitest run tests/onboarding/finalizeApprovalRace.test.ts --environment node
```
Expected: 8.1, 8.1b, 8.2, 8.2b, 8.5 FAIL — the 4-branch reads the stale `row.wizard_approved` (outer-select value), so checked→unchecked still publishes and unchecked→checked still Holds. 8.3 passes (no divergence). This proves the tests catch the race.

- [ ] **Step 3: Move the version-gate block to after `coercedRow`, keyed on `coercedRow`**

In `app/api/admin/onboarding/finalize/route.ts`:

(a) DELETE the version-gate block currently at `:704-717` (the `if (row.wizard_approved && row.wizard_reviewer_choices_version !== REVIEWER_CHOICES_VERSION) { ... }` that returns `WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED`). The block immediately follows the `const { row, wizardSessionId, tx } = input;` line and its leading comment (`:701-703`). Remove the comment block too.

(b) RE-INSERT it immediately AFTER the `coercedRow` declaration (currently ending `:810`), keyed on `coercedRow`:

```typescript
  const coercedRow = {
    ...rereadRow,
    parse_result: asParseResult(rereadRow.parse_result),
    wizard_reviewer_choices: coerceJsonbArray(rereadRow.wizard_reviewer_choices),
  };

  // Version gate (spec §3.0, relocated here from before the re-read so it keys on the
  // LOCKED wizard_approved + version, not the stale select-time values). Only checked
  // rows carry real choices + version; an unchecked row has version=null and must NOT be
  // demoted for that.
  if (coercedRow.wizard_approved && coercedRow.wizard_reviewer_choices_version !== REVIEWER_CHOICES_VERSION) {
    await demotePending(
      tx,
      wizardSessionId,
      row.drive_file_id,
      WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED,
    );
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: WIZARD_REVIEWER_CHOICES_VERSION_UNSUPPORTED,
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }
```

- [ ] **Step 4: Re-point the 4-branch decision reads to `coercedRow`**

In the same file, change these reads (each is a `row.<col>` → `coercedRow.<col>`):

- `:846` `if (row.wizard_approved) {` → `if (coercedRow.wizard_approved) {`
- `:892` `const appliedByEmail = row.wizard_approved` → `const appliedByEmail = coercedRow.wizard_approved`
- `:895-896` `const appliedAt = row.wizard_approved` / `? normalizeTimestamptz(row.wizard_approved_at)` → `coercedRow.wizard_approved` / `coercedRow.wizard_approved_at`
- `:898` `const reviewerChoices = row.wizard_approved` → `const reviewerChoices = coercedRow.wizard_approved`
- `:962` `row.wizard_approved,` (the `recordCreatedShowProvenance` arg) → `coercedRow.wizard_approved,`

`requireApprovedByEmail(coercedRow)` (`:893`) and `stageExistingShowShadow(tx, wizardSessionId, coercedRow, ...)` (`:850`) already receive `coercedRow` — no change. The `parsedItems = parseTriggeredReviewItems(row.triggered_review_items)` (`:812-814`) stays on `row` (immutable column).

- [ ] **Step 5: Run the race tests — verify GREEN**

Run:
```bash
npx vitest run tests/onboarding/finalizeApprovalRace.test.ts --environment node
```
Expected: ALL PASS — the 4-branch now reads the locked values.

- [ ] **Step 6: Run the Task-1 suites again — verify no regression**

Run:
```bash
npx vitest run tests/onboarding/finalize.test.ts tests/app/admin/finalizeAgendaRace.test.ts tests/onboarding/finalizeRevalidate.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts --environment node
```
Expected: ALL PASS.

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "finalize|error TS" | head || echo "tsc clean"
git add app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalizeApprovalRace.test.ts
git commit -m "fix(onboarding): drive finalize 4-branch from locked decision row (close approval race)"
```

---

## Task 3: Add the finishable re-validation skip (forward-defense)

**Files:**
- Modify: `app/api/admin/onboarding/finalize/route.ts` (after `coercedRow`, before the relocated version gate)
- Modify: `tests/onboarding/finalizeApprovalRace.test.ts` (add §8.4)

**Interfaces:**
- Consumes: `coercedRow.wizard_approved` + `coercedRow.last_finalize_failure_code`.
- Produces: a non-finishable locked row is skipped (typed per-row `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`) instead of falling through to the unchecked branch.

- [ ] **Step 1: Write the failing §8.4 test**

Append to `tests/onboarding/finalizeApprovalRace.test.ts` inside the `describe`:

```typescript
  // 8.4 — guard-behavior unit test (forced; §3.2 documents no current writer reaches
  // this at the same generation). A non-finishable locked row must SKIP, not Hold.
  test("8.4 non-finishable locked row → skip (no publish, no Held, demote)", async () => {
    const db = new FakeDb({
      outer: CHECKED,
      reread: { ...UNCHECKED, last_finalize_failure_code: "STAGED_PARSE_SOURCE_OUT_OF_SCOPE" },
      existingShows: new Set(),
    });
    const res = await handleOnboardingFinalize(request(), deps(db));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { per_row: { code: string }[] };
    expect(body.per_row[0]?.code).toBe("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(db.demoted.map((d) => d.code)).toContain("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE");
    expect(db.stagedShadowParams).toHaveLength(0);
    expect(db.firstSeenApplied).toHaveLength(0);
  });
```

- [ ] **Step 2: Run §8.4 — verify it FAILS**

Run:
```bash
npx vitest run tests/onboarding/finalizeApprovalRace.test.ts -t "8.4" --environment node
```
Expected: FAIL — without the skip, the non-finishable locked row (`wizard_approved=false`) falls through to the unchecked first-seen branch → creates a Held show (`firstSeenApplied` has 1, no demote).

- [ ] **Step 3: Add the finishable re-validation skip**

In `app/api/admin/onboarding/finalize/route.ts`, immediately AFTER the `coercedRow` declaration (`:810`) and BEFORE the relocated version gate (added in Task 2 Step 3), insert:

```typescript
  // Finishable re-validation (spec §3.2): re-check the approval-column part of the
  // selectFinishableCleanRows predicate against the LOCKED row. Forward-defense — not
  // reachable today (approve sets failure_code=null; unapprove never writes it; rescan
  // changes the generation → 0-row path above; finalize is self-serialized). If a future
  // same-generation writer ever leaves a non-finishable locked row, SKIP it (back to
  // review) rather than fall through to the unchecked branch and create a Held show for a
  // row that carries a failure code. Reuses the existing per-row stale code (no new §12.4).
  const lockedFinishable =
    coercedRow.wizard_approved === true || coercedRow.last_finalize_failure_code == null;
  if (!lockedFinishable) {
    await demotePending(
      tx,
      wizardSessionId,
      row.drive_file_id,
      STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
    );
    return {
      drive_file_id: row.drive_file_id,
      wizard_session_id: wizardSessionId,
      code: STAGED_PARSE_REVISION_RACE_DURING_FINALIZE,
      re_apply_url: reApplyUrl(wizardSessionId, row.drive_file_id),
    };
  }
```

- [ ] **Step 4: Run §8.4 — verify GREEN**

Run:
```bash
npx vitest run tests/onboarding/finalizeApprovalRace.test.ts --environment node
```
Expected: ALL PASS (including 8.4 and the prior 8.1-8.5).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit 2>&1 | grep -E "finalize|error TS" | head || echo "tsc clean"
git add app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalizeApprovalRace.test.ts
git commit -m "fix(onboarding): finalize finishable re-validation skip for non-finishable locked row"
```

---

## Task 4: Whole-suite regression + lint/format + negative-regression verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full onboarding/finalize + auth suites**

```bash
npx vitest run tests/onboarding tests/app/admin/finalizeAgendaRace.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts tests/auth/_metaInfraContract.test.ts --environment node 2>&1 | tail -5
```
Expected: ALL PASS.

- [ ] **Step 2: Negative-regression — confirm the tests catch the bug**

Temporarily revert ONE 4-branch re-point (e.g. change `:846` `if (coercedRow.wizard_approved)` back to `if (row.wizard_approved)`), run `npx vitest run tests/onboarding/finalizeApprovalRace.test.ts --environment node`, and confirm 8.1/8.1b FAIL. Then restore. This proves the race tests are non-tautological (they assert against the locked re-read, and a stale-read regression fails them).

- [ ] **Step 3: Typecheck + lint + format**

```bash
npx tsc --noEmit 2>&1 | grep -E "error TS" | head || echo "tsc clean"
pnpm exec eslint app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalizeApprovalRace.test.ts && echo "eslint OK"
pnpm exec prettier --write app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalizeApprovalRace.test.ts tests/app/admin/finalizeAgendaRace.test.ts tests/onboarding/finalize.test.ts tests/onboarding/finalizeRevalidate.test.ts tests/auth/advisoryLockRpcDeadlock.test.ts
pnpm exec prettier --check app/api/admin/onboarding/finalize/route.ts tests/onboarding/finalizeApprovalRace.test.ts
```
Expected: clean. Commit any prettier reformat:
```bash
git add -A && git commit -m "chore(onboarding): prettier finalize approval-race surfaces" --allow-empty
```

---

## Task 5: Self-review

**Files:** none (review only)

- [ ] **Step 1: Spec coverage** — confirm every spec section maps to a task: §3.0 reorder (Task 2 Step 3), §3.1 widened re-read (Task 1), §3.2 finishable skip (Task 3), §3.3 re-point (Task 2 Step 4), §8.1-8.5 tests (Tasks 2-3), §6/§9 test-surface updates (Task 1). List gaps; add tasks if any.
- [ ] **Step 2: Placeholder scan** — grep the diff for TODO/TBD/"handle edge cases". Fix.
- [ ] **Step 3: Citation re-grep** — re-verify each `file:line` the implementation touched still matches (line numbers may have shifted as edits landed). Confirm the version gate is AFTER `coercedRow`, the coercion is AFTER the Drive fence, and no decision column is read off `row` in the 4-branch.
- [ ] **Step 4: Invariant check** — exactly one `pg_advisory_xact_lock(hashtext('show:' || $1))` in the file (`grep -c`); no `getFile`/`downloadFileBytes` near the re-read; no new §12.4 code emitted.

---

## Task 6: Adversarial review (cross-model)

**Files:** none

- [ ] **Step 1:** Generate the whole-diff review package (`git diff main...HEAD`) and dispatch the Codex cross-model adversarial review of the IMPLEMENTATION DIFF (not the spec). Use the codex-companion / `codex exec` background path with a self-contained REVIEWER-ONLY brief (fresh-eyes; do-not-relitigate list: server-only scope, reused error code, staged_modified_time-not-bumped, finishable-skip-is-forward-defense). Iterate to APPROVE (no round budget per the autonomous-ship mandate). Address each finding with a fix + re-review.

---

## Task 7: Execution handoff

- [ ] After Codex APPROVE on the whole diff: push the branch, open the PR, watch **real CI green**, `gh pr merge --merge`, fast-forward local `main`, verify `git rev-list --left-right --count main...origin/main` == `0  0`. Update memory.
