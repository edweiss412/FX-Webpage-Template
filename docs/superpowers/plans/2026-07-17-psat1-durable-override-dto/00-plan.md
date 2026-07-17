# PSAT-1 Durable Pull-Sheet Override in Step-3 Read — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the Step-3 pack-list archived-tab override state from the durable `pending_syncs.pull_sheet_override` row (not the stale parse preview), and render a re-scan recovery state (S5) when the two disagree, so a committed override is never re-offered as S2/S3 in a loop.

**Architecture:** Thread the durable override as an `OverrideSnapshot` from the loader (`fetchStep3Data`) through `Step3Row` → `Step3SheetCard` → `buildStagedSectionData` → `SectionCore` → `PackListBreakdown`, which computes divergence via snapshot-equality (`overrideSnapshotsEqual`). A separate React-context hop threads `isPublishRunActive` to the new S5 `RescanSheetButton` so it honors the Step-3 publish-run freeze contract. No DB/lock/RPC change; one finalize-route refactor (extract a coercer to the shared lib).

**Tech Stack:** Next.js 16 (App Router, RSC), React, TypeScript (`exactOptionalPropertyTypes`), Vitest + Testing Library (jsdom), Playwright real-browser harness, Supabase (read-only here). Spec: `docs/superpowers/specs/2026-07-17-psat1-durable-override-dto.md`.

## Global Constraints

- **TDD per task, commit per task.** Conventional commits: `<type>(<scope>): <summary>`. Scope `crew-page` for UI, `sync` for lib, `db`/`admin` as fitting. One task per commit; `--no-verify` (shared hook lives in main checkout).
- **Invariant 5 — no raw §12.4 codes in UI.** S5 renders plain English + `RescanSheetButton` (which already routes codes via `messageFor`). No new §12.4 code.
- **Invariant 8 — UI dual-gate.** `components/**` touched → `/impeccable critique` AND `/impeccable audit` on the diff before whole-diff review; P0/P1 fixed or `DEFERRED.md`.
- **Invariant 2 — advisory lock UNCHANGED.** No `pg_advisory*` edits. `tests/auth/advisoryLockRpcDeadlock.test.ts` unaffected.
- **Invariant 9 — Supabase call-boundary.** Adding one column to the existing `.select(...)` is not a new call site; no `_metaInfraContract` row.
- **Copy rule (DESIGN.md):** UI copy carries NO em dash (`—`). Existing archived-tab cards use typographic quotes `‘ ’` and `…`; match them.
- **`OverrideSnapshot`** = `{ tabName: string; fingerprint: string } | null` (`lib/sync/pullSheetOverride.ts:22`).
- **`exactOptionalPropertyTypes`:** new optional row/DTO fields are passed ABSENT, never `undefined`-valued.
- Worktree: `/Users/ericweiss/fxav-worktrees/psat1-durable-override`, branch `fix/psat1-durable-override-dto`. Run tests with `pnpm vitest run <path>`; type-check `pnpm typecheck`; lint `pnpm lint`.

## Meta-test inventory

- **EXTENDS** `tests/components/admin/wizard/_metaStep3FreezeContract.test.ts` — add `components/admin/wizard/step3ReviewSections.tsx` to `SURFACES` (Task 5).
- Creates/extends no other structural registry (no Supabase helper, admin alert, lock surface, or email path).

## Advisory-lock holder topology

Not touched. No task edits any `pg_advisory*` surface. Declared per the writing-plans rule.

## Transition inventory / layout-dimensions

- **Transition audit: N/A.** The archived-tab region (S1–S5) is instant conditional rendering — no `AnimatePresence`, no animated state transitions (S5 mirrors the existing S2/S3/S4 instant conditional swaps). No transition table required.
- **Layout-dimensions: N/A.** The pack-list region is a flex column (`flex flex-col gap-3`), not a fixed-dimension parent with flex/grid children. No `getBoundingClientRect` parity task. (Real-browser assertion in Task 6 is a render/focus/copy check, not a dimensional one.)

## File map

| File | Responsibility | Tasks |
| --- | --- | --- |
| `lib/sync/pullSheetOverride.ts` | Add exported `coercePullSheetOverride` (moved from finalize) + `coerceOverrideSnapshotFromRow` | 1 |
| `app/api/admin/onboarding/finalize/route.ts` | Re-import `coercePullSheetOverride` from lib; drop local copy | 1 |
| `components/admin/OnboardingWizard.tsx` | SELECT `pull_sheet_override`; thread it into `PendingSyncRowForBuild` + `rawPendingByDfid` + `buildStep3Row` → `row.pullSheetOverride` | 2 |
| `components/admin/wizard/Step3Review.tsx` | Add `pullSheetOverride?: OverrideSnapshot` to `Step3Row` | 2 |
| `components/admin/review/sectionData.ts` | Add `pullSheetOverride: OverrideSnapshot` to `SectionCore`; pass through `buildStagedSectionData` | 3 |
| `components/admin/review/publishedAdapter.ts` | Set `pullSheetOverride: null` in `buildPublishedSectionData` | 3 |
| `components/admin/wizard/Step3SheetCard.tsx` | Pass `pullSheetOverride: row.pullSheetOverride ?? null` to `buildStagedSectionData` | 3 |
| `components/admin/wizard/step3ReviewSections.tsx` | `PackListBreakdown`: swap `overrideActive` → `pullSheetOverride`; compute divergence; S5 block (`ArchivedTabRescanNeeded`); `Step3RunStateContext`; render site prop | 4, 5 |
| `components/admin/review/ShowReviewSurface.tsx` | Add optional `isPublishRunActive` prop; provide `Step3RunStateContext` | 5 |
| `components/admin/wizard/Step3ReviewModal.tsx` | Pass `isPublishRunActive` to `ShowReviewSurface` | 5 |
| `tests/components/admin/wizard/_metaStep3FreezeContract.test.ts` | Add `step3ReviewSections.tsx` to `SURFACES` | 5 |
| `DEFERRED.md`, `BACKLOG.md` | Mark PSAT-1 RESOLVED / close backlog item | 7 |

---

## Task 1: Shared override coercers (lib) + finalize refactor

**Files:**
- Modify: `lib/sync/pullSheetOverride.ts` (add two exports near `overrideSnapshot` at `:30`)
- Modify: `app/api/admin/onboarding/finalize/route.ts:290-307` (delete local `coercePullSheetOverride`, import from lib)
- Test: `tests/sync/pullSheetOverrideCoerce.test.ts` (new)

**Interfaces:**
- Produces: `coercePullSheetOverride(value: unknown): PullSheetOverride | null` and `coerceOverrideSnapshotFromRow(value: unknown): OverrideSnapshot`, both exported from `@/lib/sync/pullSheetOverride`.
- Consumes: existing `overrideSnapshot` (`:30`), `PullSheetOverride` (`:9`), `OverrideSnapshot` (`:22`).

- [ ] **Step 1: Write the failing test**

Create `tests/sync/pullSheetOverrideCoerce.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import {
  coerceOverrideSnapshotFromRow,
  coercePullSheetOverride,
} from "@/lib/sync/pullSheetOverride";

const FULL = { tabName: "OLD A", fingerprint: "fp1", acceptedBy: "u@x.co", acceptedAt: "2026-07-17T00:00:00Z" };

describe("coercePullSheetOverride (full audit shape)", () => {
  test("accepts the full 4-string shape", () => {
    expect(coercePullSheetOverride(FULL)).toEqual(FULL);
  });
  test.each([
    ["missing acceptedBy", { tabName: "OLD A", fingerprint: "fp1", acceptedAt: "t" }],
    ["missing acceptedAt", { tabName: "OLD A", fingerprint: "fp1", acceptedBy: "u" }],
    ["non-string fingerprint", { ...FULL, fingerprint: 5 }],
    ["null", null],
    ["array", [FULL]],
    ["string", "x"],
  ])("rejects %s -> null", (_label, value) => {
    expect(coercePullSheetOverride(value as unknown)).toBeNull();
  });
});

describe("coerceOverrideSnapshotFromRow (durable -> snapshot, finalize-parity)", () => {
  test("full shape -> reduced snapshot (audit fields dropped)", () => {
    expect(coerceOverrideSnapshotFromRow(FULL)).toEqual({ tabName: "OLD A", fingerprint: "fp1" });
  });
  test("partial audit shape -> null (agrees with coercePullSheetOverride)", () => {
    const partial = { tabName: "OLD A", fingerprint: "fp1" };
    expect(coerceOverrideSnapshotFromRow(partial)).toBeNull();
    expect(coercePullSheetOverride(partial)).toBeNull();
  });
  test("null / non-object -> null", () => {
    expect(coerceOverrideSnapshotFromRow(null)).toBeNull();
    expect(coerceOverrideSnapshotFromRow(42)).toBeNull();
  });
});
```

Failure mode caught: the reducer drifting from finalize's validity contract (a partial `{tabName,fingerprint}` becoming a live override in Step-3 while finalize treats it as null).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/pullSheetOverrideCoerce.test.ts`
Expected: FAIL — `coerceOverrideSnapshotFromRow` / `coercePullSheetOverride` not exported from the lib.

- [ ] **Step 3: Add the two exports to the lib**

In `lib/sync/pullSheetOverride.ts`, immediately AFTER `overrideSnapshot` (ends at `:34`), add:

```ts
/**
 * Validate an untyped `*.pull_sheet_override` jsonb value as a FULL audit-shape
 * override. Returns null unless it is a non-array object with string `tabName`,
 * `fingerprint`, `acceptedBy`, AND `acceptedAt`. This is the single validator the
 * finalize gate and the Step-3 read both use, so "override active" means the same
 * thing on both surfaces. (Moved here from app/api/admin/onboarding/finalize/route.ts.)
 */
export function coercePullSheetOverride(value: unknown): PullSheetOverride | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (
    typeof o.tabName === "string" &&
    typeof o.fingerprint === "string" &&
    typeof o.acceptedBy === "string" &&
    typeof o.acceptedAt === "string"
  ) {
    return {
      tabName: o.tabName,
      fingerprint: o.fingerprint,
      acceptedBy: o.acceptedBy,
      acceptedAt: o.acceptedAt,
    };
  }
  return null;
}

/**
 * Reduce a durable `pending_syncs.pull_sheet_override` jsonb value to an
 * OverrideSnapshot using the SAME full-audit-shape validation finalize uses, then
 * dropping the audit fields (§5.8). Partial/absent shape -> null, so Step-3
 * "override active" agrees exactly with the finalize gate.
 */
export const coerceOverrideSnapshotFromRow = (value: unknown): OverrideSnapshot =>
  overrideSnapshot(coercePullSheetOverride(value));
```

- [ ] **Step 4: Point finalize at the lib copy**

In `app/api/admin/onboarding/finalize/route.ts`: delete the local `function coercePullSheetOverride(...)` block (`:290-307`). Add `coercePullSheetOverride` to the existing import from `@/lib/sync/pullSheetOverride` (the file already imports `evaluateFinalizeOverrideGate` from there — `:36`). Leave the local `coerceOverrideSnapshot` (`:309`, the `*_applied` reduced-shape validator) untouched.

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm vitest run tests/sync/pullSheetOverrideCoerce.test.ts && pnpm vitest run app/api/admin/onboarding/finalize` (the finalize route's existing tests still pass with the re-import) `&& pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/pullSheetOverride.ts app/api/admin/onboarding/finalize/route.ts tests/sync/pullSheetOverrideCoerce.test.ts
git commit --no-verify -m "refactor(sync): extract coercePullSheetOverride to lib + add coerceOverrideSnapshotFromRow"
```

---

## Task 2: Loader threads the durable override onto `Step3Row`

**Files:**
- Modify: `components/admin/OnboardingWizard.tsx` (select `:430`; `PendingSyncRowForBuild` `:247`; `rawPendingByDfid.set` `:519`; `buildStep3Row` row assembly `:355-368`)
- Modify: `components/admin/wizard/Step3Review.tsx` (`Step3Row` type `:80`)
- Test: `tests/components/onboardingWizard.buildStep3Row.test.ts` (existing — extend) and `tests/components/onboardingWizard.fetchStep3.test.ts` (existing — extend)

**Interfaces:**
- Consumes: `coerceOverrideSnapshotFromRow` (Task 1), `OverrideSnapshot`.
- Produces: `Step3Row.pullSheetOverride?: OverrideSnapshot`; `PendingSyncRowForBuild` gains `pull_sheet_override?: unknown`.

- [ ] **Step 1: Write the failing unit test (buildStep3Row reduce)**

Find the existing `buildStep3Row` test file (`rg -l "buildStep3Row" tests/`). Add:

```ts
test("durable pull_sheet_override full shape reduces onto row.pullSheetOverride (audit dropped)", () => {
  const row = buildStep3Row(
    manifestRow({ status: "staged" }),
    { staged_id: "s-1", parse_result: {}, pull_sheet_override: {
      tabName: "OLD A", fingerprint: "fp1", acceptedBy: "u@x.co", acceptedAt: "2026-07-17T00:00:00Z",
    } },
    [],
  );
  expect(row.pullSheetOverride).toEqual({ tabName: "OLD A", fingerprint: "fp1" });
});

test("null durable override -> row.pullSheetOverride absent", () => {
  const row = buildStep3Row(manifestRow({ status: "staged" }), { staged_id: "s-1", parse_result: {}, pull_sheet_override: null }, []);
  expect("pullSheetOverride" in row).toBe(false);
});

test("non-pending row -> row.pullSheetOverride absent", () => {
  const row = buildStep3Row(manifestRow({ status: "hard_failed" }), null, []);
  expect("pullSheetOverride" in row).toBe(false);
});
```

(Use the file's existing `manifestRow`/helper shape; match its `ManifestRowForBuild` fixture builder. If none exists, construct the manifest object inline with the same fields the other tests use.)

- [ ] **Step 2: Write the failing integration test (fetchStep3Data wiring, §4.1b)**

In `tests/components/onboardingWizard.fetchStep3.test.ts`, mirror the `source_anchors` block (`:285`). Add a new describe:

```ts
describe("fetchStep3Data — pull_sheet_override threading (PSAT-1)", () => {
  test("the pending_syncs SELECT requests the pull_sheet_override column", async () => {
    seedManifest([{ drive_file_id: "dfid-1", name: "One.xlsx", status: "staged" }]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-1", drive_file_id: "dfid-1", parse_result: PARSE_RESULT_FIXTURE,
        pull_sheet_override: { tabName: "OLD A", fingerprint: "fp1", acceptedBy: "u@x.co", acceptedAt: "t" } },
    ];
    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    await fetchStep3Data(SESSION_ID);
    expect(seed.selectByTable["pending_syncs"]).toContain("pull_sheet_override");
  });

  test("durable override is reduced onto the row (audit dropped)", async () => {
    seedManifest([{ drive_file_id: "dfid-1", name: "One.xlsx", status: "staged" }]);
    seed.dataByTable["pending_syncs"] = [
      { staged_id: "s-1", drive_file_id: "dfid-1", parse_result: PARSE_RESULT_FIXTURE,
        pull_sheet_override: { tabName: "OLD A", fingerprint: "fp1", acceptedBy: "u@x.co", acceptedAt: "t" } },
    ];
    const { fetchStep3Data } = await import("@/components/admin/OnboardingWizard");
    const result = await fetchStep3Data(SESSION_ID);
    // result shape: { kind: "ok"; rows: Step3Row[]; ... } — pick the row for dfid-1.
    const row = (result as { rows: { driveFileId: string; pullSheetOverride?: unknown }[] })
      .rows.find((r) => r.driveFileId === "dfid-1");
    expect(row?.pullSheetOverride).toEqual({ tabName: "OLD A", fingerprint: "fp1" });
  });
});
```

(Match the file's existing `PARSE_RESULT_FIXTURE`, `SESSION_ID`, `seedManifest`, `seed` helpers — they are defined at the top of that test file.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm vitest run tests/components/onboardingWizard.fetchStep3.test.ts`
Expected: FAIL — SELECT lacks `pull_sheet_override`; row has no `pullSheetOverride`.

- [ ] **Step 4: Add the SELECT column**

`components/admin/OnboardingWizard.tsx:430` — append `, pull_sheet_override` to the select string:

```ts
      .select(
        "staged_id, drive_file_id, staged_modified_time, parse_result, source_anchors, last_finalize_failure_code, triggered_review_items, use_raw_decisions, pull_sheet_override",
      )
```

- [ ] **Step 5: Extend `PendingSyncRowForBuild` + assembly**

`OnboardingWizard.tsx:247` — add a field to the type:

```ts
type PendingSyncRowForBuild = {
  staged_id: string;
  parse_result: unknown;
  last_finalize_failure_code?: string | null;
  triggered_review_items?: unknown;
  pull_sheet_override?: unknown;
} | null;
```

`OnboardingWizard.tsx:519` — copy the column into the assembled row:

```ts
    rawPendingByDfid.set(ps.drive_file_id as string, {
      staged_id: ps.staged_id as string,
      parse_result: ps.parse_result,
      last_finalize_failure_code: (ps.last_finalize_failure_code as string | null) ?? null,
      triggered_review_items: ps.triggered_review_items,
      pull_sheet_override: ps.pull_sheet_override,
    });
```

- [ ] **Step 6: Reduce onto the row in `buildStep3Row`**

Add the import near the top of `OnboardingWizard.tsx` (with the other `@/lib/sync` imports):

```ts
import { coerceOverrideSnapshotFromRow } from "@/lib/sync/pullSheetOverride";
```

In `buildStep3Row`, after the existing `if (lastFinalizeFailureCode !== null) row.lastFinalizeFailureCode = ...;` line (`:368`), add:

```ts
  const pullSheetOverride = pending ? coerceOverrideSnapshotFromRow(pending.pull_sheet_override) : null;
  if (pullSheetOverride) row.pullSheetOverride = pullSheetOverride;
```

- [ ] **Step 7: Add the `Step3Row` field**

`components/admin/wizard/Step3Review.tsx:80` — inside `export type Step3Row = { ... }`, after `useRawDecisions?: UseRawDecision[];` (or any logical spot), add and import `OverrideSnapshot`:

```ts
  // PSAT-1: the durable pull_sheet_override reduced to a snapshot (finalize-parity,
  // spec §3.1). Absent for non-staged / no-override rows (exactOptionalPropertyTypes).
  pullSheetOverride?: OverrideSnapshot;
```

Add to the imports in `Step3Review.tsx`:

```ts
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";
```

- [ ] **Step 8: Run tests + typecheck**

Run: `pnpm vitest run tests/components/onboardingWizard.fetchStep3.test.ts $(rg -l "buildStep3Row" tests/) && pnpm typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add components/admin/OnboardingWizard.tsx components/admin/wizard/Step3Review.tsx tests/
git commit --no-verify -m "feat(crew-page): thread durable pull_sheet_override onto Step3Row"
```

---

## Task 3: DTO carries `pullSheetOverride` (SectionCore, both adapters)

**Files:**
- Modify: `components/admin/review/sectionData.ts` (`SectionCore` `:42`; `buildStagedSectionData` input `:91` + return `:122`)
- Modify: `components/admin/review/publishedAdapter.ts:56-94` (`buildPublishedSectionData` return object)
- Modify: `components/admin/wizard/Step3SheetCard.tsx:596-610` (the `buildStagedSectionData({...})` call)
- Test: `tests/components/review/sectionData.test.ts` (find existing via `rg -l buildStagedSectionData tests/`; extend, else create)

**Interfaces:**
- Consumes: `Step3Row.pullSheetOverride` (Task 2), `OverrideSnapshot`.
- Produces: `SectionCore.pullSheetOverride: OverrideSnapshot` (present in BOTH `StagedSectionData` and `PublishedSectionData`).

- [ ] **Step 1: Write the failing test**

In the sectionData test file, add:

```ts
test("buildStagedSectionData carries pullSheetOverride through", () => {
  const data = buildStagedSectionData({ ...baseInput(), pullSheetOverride: { tabName: "OLD A", fingerprint: "fp1" } });
  expect(data.pullSheetOverride).toEqual({ tabName: "OLD A", fingerprint: "fp1" });
});
test("buildStagedSectionData accepts null override", () => {
  const data = buildStagedSectionData({ ...baseInput(), pullSheetOverride: null });
  expect(data.pullSheetOverride).toBeNull();
});
```

(`baseInput()` = the file's existing minimal `buildStagedSectionData` input builder; if none, construct it from the `pr`/`row`/`dfid`/`wizardSessionId` + list fields the function requires — see `sectionData.ts:91-106`.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run $(rg -l buildStagedSectionData tests/)`
Expected: FAIL — `pullSheetOverride` not on input/output type.

- [ ] **Step 3: Add the SectionCore field**

`sectionData.ts:42` — inside `SectionCore`, after `archivedPullSheetTabs: ArchivedPullSheetTab[];`:

```ts
  // PSAT-1 (spec §3.1): the durable override snapshot, mode-agnostic. Staged: from
  // pending_syncs.pull_sheet_override. Published: null (no staged affordance).
  pullSheetOverride: OverrideSnapshot;
```

Add the import at the top of `sectionData.ts`:

```ts
import type { OverrideSnapshot } from "@/lib/sync/pullSheetOverride";
```

- [ ] **Step 4: Thread through `buildStagedSectionData`**

`sectionData.ts:91` — add `pullSheetOverride: OverrideSnapshot;` to the `input:` param object type. Destructure it (`:107-121` block) and add `pullSheetOverride,` to the returned object (near `archivedPullSheetTabs,` at `:153`).

- [ ] **Step 5: Published adapter sets null**

`publishedAdapter.ts` — in the returned `PublishedSectionData` object (near `archivedPullSheetTabs: []` at `:81`), add:

```ts
    pullSheetOverride: null,
```

- [ ] **Step 6: Card passes the row value**

`Step3SheetCard.tsx:596` — inside the `buildStagedSectionData({...})` call, add:

```ts
            pullSheetOverride: row.pullSheetOverride ?? null,
```

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm vitest run $(rg -l buildStagedSectionData tests/) && pnpm typecheck`
Expected: PASS. (Typecheck also catches any OTHER `buildStagedSectionData` fixture caller missing the new required input — fix each to pass `pullSheetOverride: null`. Run `rg -l "buildStagedSectionData(" tests/` and add the field to each.)

- [ ] **Step 8: Commit**

```bash
git add components/admin/review/sectionData.ts components/admin/review/publishedAdapter.ts components/admin/wizard/Step3SheetCard.tsx tests/
git commit --no-verify -m "feat(crew-page): carry pullSheetOverride snapshot through SectionData"
```

---

## Task 4: `PackListBreakdown` — divergence + S5 recovery block

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`PackListBreakdown` `:1925`; render site `:3824-3831`; add `ArchivedTabRescanNeeded` near `ArchivedTabIncludedNote` `:2224`)
- Test: `tests/components/admin/wizard/packListBreakdownStates.test.tsx` (migrate + extend)

**Interfaces:**
- Consumes: `SectionData.pullSheetOverride` (Task 3), `overrideSnapshotsEqual` (`lib/sync/pullSheetOverride.ts:72`), `RescanSheetButton`.
- Produces: `PackListBreakdown` prop `pullSheetOverride: OverrideSnapshot` (replaces `overrideActive: boolean`).

- [ ] **Step 1: Migrate existing tests + add S5 cases (failing)**

In `packListBreakdownStates.test.tsx`: replace every `overrideActive={false}` with `pullSheetOverride={null}`, and the S3 test's `overrideActive={true}` (`:131`) with `pullSheetOverride={{ tabName: "OLD PULL SHEET", fingerprint: "ff" }}` (matches its included tab `fingerprint: "ff"`). Then add the new S5 / non-collision cases (spec §4.3 c/d/e/f/g):

```ts
test("S5 accept-stale: durable set + tab present-but-not-included => recovery block, NO S2 offer", () => {
  const { container } = render(
    <PackListBreakdown
      dfid={DFID}
      wizardSessionId={WSID}
      cases={[]}
      archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: false })]}
      pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }}
    />,
  );
  const sec = packSection(container);
  expect(within(sec).getByTestId(`pack-list-rescan-needed-${DFID}`)).toBeTruthy();
  expect(within(sec).queryByRole("button", { name: /use this show.s gear/i })).toBeNull(); // S2 suppressed
});

test("S5 revoke-stale: durable null + tab still included => recovery block, NO S3 revoke note", () => {
  const { container } = render(
    <PackListBreakdown
      dfid={DFID}
      wizardSessionId={WSID}
      cases={[FOH]}
      archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: true })]}
      pullSheetOverride={null}
    />,
  );
  const sec = packSection(container);
  expect(within(sec).getByTestId(`pack-list-rescan-needed-${DFID}`)).toBeTruthy();
  expect(within(sec).queryByRole("button", { name: /revoke/i })).toBeNull(); // S3 suppressed
});

test("S5 tab-swap: durable B + preview included A => recovery block (snapshot mismatch)", () => {
  const { container } = render(
    <PackListBreakdown
      dfid={DFID}
      wizardSessionId={WSID}
      cases={[]}
      archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: true })]}
      pullSheetOverride={{ tabName: "OLD B", fingerprint: "fp2" }}
    />,
  );
  expect(within(packSection(container)).getByTestId(`pack-list-rescan-needed-${DFID}`)).toBeTruthy();
});

test("S4 non-collision: durable null + not-included content-changed tab => S4, NOT S5", () => {
  const { container } = render(
    <PackListBreakdown
      dfid={DFID}
      wizardSessionId={WSID}
      cases={[]}
      archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp2", included: false, contentChangedSinceAccept: true })]}
      pullSheetOverride={null}
    />,
  );
  const sec = packSection(container);
  expect(sec.textContent).toMatch(/changed\.\s*re-confirm/i);
  expect(within(sec).queryByTestId(`pack-list-rescan-needed-${DFID}`)).toBeNull(); // S5 did NOT steal S4
});

test("published mode (no wizardSessionId): no affordance, no S5 even if a durable snapshot is passed", () => {
  const { container } = render(
    <PackListBreakdown
      dfid={DFID}
      cases={[FOH]}
      archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: false })]}
      pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }}
    />,
  );
  const sec = packSection(container);
  expect(within(sec).queryByTestId(`pack-list-rescan-needed-${DFID}`)).toBeNull();
  expect(within(sec).queryByRole("button", { name: /use this show.s gear/i })).toBeNull();
});
```

Failure modes: each S5 case pins loop-suppression (competing affordance absent); the S4 case pins the non-collision; published pins staged-only gating. Note the S5 tests render `PackListBreakdown` directly — `isPublishRunActive` comes from context (Task 5) and defaults to `false`, so the `RescanSheetButton` here is enabled (freeze covered separately in Task 5).

- [ ] **Step 2: Run to verify failures**

Run: `pnpm vitest run tests/components/admin/wizard/packListBreakdownStates.test.tsx`
Expected: FAIL — `pullSheetOverride` prop unknown; no `pack-list-rescan-needed` testid.

- [ ] **Step 3: Add the `ArchivedTabRescanNeeded` component**

In `step3ReviewSections.tsx`, after `ArchivedTabIncludedNote` (ends near `:2280`), add. Import `RescanSheetButton` at the top (`import { RescanSheetButton } from "@/components/admin/RescanSheetButton";`) and `useContext` is already imported (`:27`). `Step3RunStateContext` is created in Task 5 — for THIS task, read `isPublishRunActive` from a local default; Task 5 wires the context. To keep Task 4 self-contained and green, define the context now (it is consumed here and provided in Task 5):

```tsx
/** PSAT-1 run-state context: threads the publish-run freeze flag to body-surface
 *  mutators (the S5 Re-scan) that render via `s.render(data)` with only `data`.
 *  Provided by ShowReviewSurface (Task 5); default false so direct-render tests
 *  and the published page get an enabled/no-op default. */
export const Step3RunStateContext = createContext<{ isPublishRunActive: boolean }>({
  isPublishRunActive: false,
});

/** S5 (spec §3.4): durable override and preview disagree (committed-but-preview-
 *  stale). A reload can't heal it (same stale envelope) — only a re-scan refreshes
 *  the preview. Renders the note + the existing RescanSheetButton, frozen during a
 *  publish/resume run (Step-3 freeze contract, §4.4 R8). */
function ArchivedTabRescanNeeded({
  dfid,
  wizardSessionId,
}: {
  dfid: string;
  wizardSessionId: string;
}) {
  const { isPublishRunActive } = useContext(Step3RunStateContext);
  return (
    <div
      data-testid={`pack-list-rescan-needed-${dfid}`}
      className="flex flex-col gap-2 rounded-sm border border-border bg-info-bg p-3 text-sm text-text-strong"
    >
      <p className="font-medium">Gear saved. The preview is out of date.</p>
      <p>Re-scan to refresh it.</p>
      <RescanSheetButton
        driveFileId={dfid}
        wizardSessionId={wizardSessionId}
        disabled={isPublishRunActive}
      />
    </div>
  );
}
```

- [ ] **Step 4: Rewire `PackListBreakdown`**

Replace the prop `overrideActive` with `pullSheetOverride` and recompute state. New signature + derivations (`:1925-1952`):

```tsx
export function PackListBreakdown({
  dfid,
  wizardSessionId,
  cases,
  archivedPullSheetTabs,
  pullSheetOverride,
}: {
  dfid: string | null;
  wizardSessionId?: string;
  cases: PullSheetCase[];
  archivedPullSheetTabs: ArchivedPullSheetTab[];
  pullSheetOverride: OverrideSnapshot;
}) {
  const staged = wizardSessionId != null;
  const includedTab = staged ? (archivedPullSheetTabs.find((t) => t.included) ?? null) : null;
  const previewSnapshot: OverrideSnapshot = includedTab
    ? { tabName: includedTab.tabName, fingerprint: includedTab.fingerprint }
    : null;
  const overrideActive = pullSheetOverride !== null;
  const divergent = staged && !overrideSnapshotsEqual(pullSheetOverride, previewSnapshot);
  const offers =
    staged && !divergent && !overrideActive ? archivedPullSheetTabs.filter((t) => !t.included) : [];
  const hasCases = cases.length > 0;
  // S1 empty must also require !divergent so a durable-set/empty-preview row is S5.
  const isEmpty = !divergent && !hasCases && archivedPullSheetTabs.length === 0;
```

Import `overrideSnapshotsEqual` and `OverrideSnapshot` at the top of the file:

```ts
import { overrideSnapshotsEqual, type OverrideSnapshot } from "@/lib/sync/pullSheetOverride";
```

- [ ] **Step 5: Update the render body**

In `PackListBreakdown`'s returned JSX (`:1972-1992`), gate the states in precedence order. Replace the archived-tab region (the `overrideActive && includedTab ...` note block + the `offers.map` block) so S5 preempts:

```tsx
        {isEmpty ? <p className="text-sm text-text-subtle">No pack list parsed.</p> : null}
        {hasCases ? <PackListCases dfid={dfid} cases={cases} /> : null}
        {divergent && dfid != null && wizardSessionId != null ? (
          <ArchivedTabRescanNeeded dfid={dfid} wizardSessionId={wizardSessionId} />
        ) : null}
        {!divergent && overrideActive && includedTab && wizardSessionId != null ? (
          <ArchivedTabIncludedNote dfid={dfid} wizardSessionId={wizardSessionId} tab={includedTab} />
        ) : null}
        {!divergent && wizardSessionId != null
          ? offers.map((tab, i) => (
              <ArchivedTabOffer
                key={`${tab.tabName}-${i}`}
                dfid={dfid}
                wizardSessionId={wizardSessionId}
                tab={tab}
                onDismissFocus={focusSection}
              />
            ))
          : null}
```

(The `offers` array is already empty when `divergent`, but the explicit `!divergent` guard on the `.map` block keeps the render self-documenting and matches the spec's precedence chain.)

- [ ] **Step 6: Update the render site**

`step3ReviewSections.tsx:3828` — replace the `overrideActive` prop:

```tsx
        <PackListBreakdown
          dfid={s.driveFileId}
          cases={s.pullSheet}
          archivedPullSheetTabs={s.archivedPullSheetTabs}
          pullSheetOverride={s.pullSheetOverride}
          {...(isStaged(s) ? { wizardSessionId: s.wizardSessionId } : {})}
        />
```

(`s.pullSheetOverride` is on `SectionCore` now, present in both modes — Task 3.)

- [ ] **Step 7: Run tests + typecheck**

Run: `pnpm vitest run tests/components/admin/wizard/packListBreakdownStates.test.tsx && pnpm typecheck`
Expected: PASS (all migrated + new S5/S4/published cases).

- [ ] **Step 8: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/packListBreakdownStates.test.tsx
git commit --no-verify -m "feat(crew-page): derive override state from durable snapshot + S5 re-scan recovery"
```

---

## Task 5: Freeze the S5 re-scan during publish runs (context + meta-test)

**Files:**
- Modify: `components/admin/review/ShowReviewSurface.tsx` (props `:142`; provider around `:819`; import `Step3RunStateContext`)
- Modify: `components/admin/wizard/Step3ReviewModal.tsx:715` (pass `isPublishRunActive`)
- Modify: `tests/components/admin/wizard/_metaStep3FreezeContract.test.ts:24` (`SURFACES`)
- Test: `tests/components/admin/wizard/packListBreakdownStates.test.tsx` (freeze behavioral case)

**Interfaces:**
- Consumes: `Step3RunStateContext` (Task 4), `Step3ReviewModal`'s existing `isPublishRunActive` (`:167`), `ShowReviewSurface`'s `s.render(data)` (`:819`).
- Produces: `ShowReviewSurface` optional prop `isPublishRunActive?: boolean`.

- [ ] **Step 1: Write the failing meta-test extension + behavioral test**

Edit `_metaStep3FreezeContract.test.ts:24` — add the third surface:

```ts
const SURFACES = [
  "components/admin/wizard/Step3ReviewModal.tsx",
  "components/admin/wizard/Step3SheetCard.tsx",
  "components/admin/wizard/step3ReviewSections.tsx",
];
```

Add the behavioral freeze case to `packListBreakdownStates.test.tsx` (import `Step3RunStateContext`):

```ts
import { PackListBreakdown, Step3RunStateContext } from "@/components/admin/wizard/step3ReviewSections";

test("S5 Re-scan is disabled while a publish run is active (freeze contract)", () => {
  const { container } = render(
    <Step3RunStateContext.Provider value={{ isPublishRunActive: true }}>
      <PackListBreakdown
        dfid={DFID}
        wizardSessionId={WSID}
        cases={[]}
        archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: false })]}
        pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }}
      />
    </Step3RunStateContext.Provider>,
  );
  const sec = packSection(container);
  const btn = within(sec).getByRole("button", { name: /re-scan/i });
  expect(btn).toBeDisabled();
});

test("S5 Re-scan is enabled when no publish run is active", () => {
  const { container } = render(
    <PackListBreakdown
      dfid={DFID}
      wizardSessionId={WSID}
      cases={[]}
      archivedPullSheetTabs={[tab({ tabName: "OLD A", fingerprint: "fp1", included: false })]}
      pullSheetOverride={{ tabName: "OLD A", fingerprint: "fp1" }}
    />,
  );
  const btn = within(packSection(container)).getByRole("button", { name: /re-scan/i });
  expect(btn).not.toBeDisabled();
});
```

(Confirm the `RescanSheetButton` accessible name via `rg "aria-label|>Re-scan|Re-scan<" components/admin/RescanSheetButton.tsx`; adjust the `name:` matcher to the real button text.)

- [ ] **Step 2: Run to verify failures**

Run: `pnpm vitest run tests/components/admin/wizard/_metaStep3FreezeContract.test.ts tests/components/admin/wizard/packListBreakdownStates.test.tsx`
Expected: FAIL — meta-test finds the new S5 `RescanSheetButton` in `step3ReviewSections.tsx` WITHOUT `disabled={isPublishRunActive}` (it's already there from Task 4 Step 3, so the meta-test may PASS; if so this step's failure comes only from the behavioral test needing the context provider). Either way, the behavioral test drives the wiring.

Note: Task 4 already added `disabled={isPublishRunActive}` inside `ArchivedTabRescanNeeded`, so the meta-test's literal-string assertion passes as soon as `step3ReviewSections.tsx` is in `SURFACES`. The remaining work is the PROVIDER so the value is real (not always the `false` default) on the modal surface.

- [ ] **Step 3: Add the `isPublishRunActive` prop + provider to `ShowReviewSurface`**

`ShowReviewSurface.tsx` — add to the props type (`:142`, alongside `data`):

```ts
  isPublishRunActive?: boolean; // PSAT-1: threads the Step-3 publish-run freeze to the S5 Re-scan
```

Destructure it with a default in the component signature: `isPublishRunActive = false`.

Import the context (extend the existing import from `step3ReviewSections`):

```ts
import {
  ROOMS_CAP,
  step3Sections,
  STEP3_SECTION_GROUPS,
  Step3SectionChromeContext,
  Step3RunStateContext,
} from "@/components/admin/wizard/step3ReviewSections";
```

Wrap the whole sections render region in the provider. The cleanest single wrap: place it high enough to cover `{s.render(data)}` (`:819`). Wrap the returned surface JSX root (or the sections list container) with:

```tsx
<Step3RunStateContext.Provider value={{ isPublishRunActive }}>
  {/* existing surface JSX, including the sections .map that calls s.render(data) */}
</Step3RunStateContext.Provider>
```

- [ ] **Step 4: Modal passes the flag**

`Step3ReviewModal.tsx:715` — add the prop to the `<ShowReviewSurface …>` element:

```tsx
        <ShowReviewSurface
          isPublishRunActive={isPublishRunActive}
          /* …existing props… */
```

(`isPublishRunActive` is already resolved at `:167`.) The published page (`PublishedReviewPage.tsx:188`) is left unchanged — it omits the prop and gets the `false` default.

- [ ] **Step 5: Run tests + typecheck + full freeze suite**

Run: `pnpm vitest run tests/components/admin/wizard/_metaStep3FreezeContract.test.ts tests/components/admin/wizard/packListBreakdownStates.test.tsx && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/admin/review/ShowReviewSurface.tsx components/admin/wizard/Step3ReviewModal.tsx tests/components/admin/wizard/
git commit --no-verify -m "feat(crew-page): freeze S5 re-scan during publish runs via Step3RunStateContext"
```

---

## Task 6: Real-browser verification of the S5 recovery state

**Files:**
- Test: add an S5 fixture/case to the existing Step-3 real-browser harness (find via `rg -l "step3.*realbrowser|realbrowser.*step3" tests/ e2e/ -i` and the `reference_step3_modal_realbrowser_harnesses` pattern) OR a standalone Playwright spec under the project's real-browser test dir.

**Interfaces:** consumes the rendered `PackListBreakdown` S5 output.

- [ ] **Step 1: Write the real-browser assertion (failing until harness fixture added)**

Render `PackListBreakdown` in the S5 accept-stale state (durable set, tab present-but-not-included) inside the real-browser harness. Assert, in a real DOM:
- the note text "Gear saved. The preview is out of date." and "Re-scan to refresh it." are present;
- the `RescanSheetButton` renders and is keyboard-focusable (`el.focus(); document.activeElement === el`);
- no raw §12.4 code substring leaks (assert the visible text does not match `/[A-Z_]{6,}/` beyond allowed words — reuse the harness's existing no-raw-code check if present);
- the rendered copy contains no em dash: `expect(text).not.toContain("—")`.

- [ ] **Step 2: Run it to confirm it fails, then wire the fixture**

Run the harness per its README/script (e.g. `pnpm test:realbrowser` or the standalone config — confirm the exact command from the harness file header). Expected: FAIL until the S5 fixture is registered, then PASS.

- [ ] **Step 3: Run + commit**

```bash
git add <harness fixture + spec paths>
git commit --no-verify -m "test(crew-page): real-browser assertion for S5 re-scan recovery state"
```

(If the project's real-browser harness cannot host an isolated component fixture without disproportionate scaffolding, record that in the commit body and rely on the jsdom state tests (Task 4) + the impeccable audit (close-out) for the visual gate — but attempt the harness first.)

---

## Task 7: Close out the deferral + backlog

**Files:**
- Modify: `DEFERRED.md` (PSAT-1 entry `:359`)
- Modify: `BACKLOG.md` (`BL-PSAT-STEP3-DURABLE-OVERRIDE-DTO` `:391`)

- [ ] **Step 1: Mark PSAT-1 resolved**

In `DEFERRED.md`, edit the PSAT-1 header (`:359`) to mark it RESOLVED with the PR reference (fill the number at merge time), mirroring the existing `✅ RESOLVED` convention used by sibling entries (e.g. VCR-1 at `:370`). Keep the body; append a one-line resolution note pointing at this plan + spec.

- [ ] **Step 2: Close the backlog item**

In `BACKLOG.md`, mark `BL-PSAT-STEP3-DURABLE-OVERRIDE-DTO` (`:391`) resolved/shipped with the same PR reference.

- [ ] **Step 3: Commit**

```bash
git add DEFERRED.md BACKLOG.md
git commit --no-verify -m "docs: mark PSAT-1 / BL-PSAT-STEP3-DURABLE-OVERRIDE-DTO resolved"
```

---

## Task 8: Full suite + typecheck + lint gate (pre-review)

- [ ] **Step 1: Run the full relevant gates**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run tests/sync/pullSheetOverrideCoerce.test.ts tests/components/onboardingWizard.fetchStep3.test.ts tests/components/admin/wizard/packListBreakdownStates.test.tsx tests/components/admin/wizard/_metaStep3FreezeContract.test.ts app/api/admin/onboarding/finalize
```

Then the full suite to catch fan-out regressions (page-rebuild / source-scanning meta-tests, other `buildStagedSectionData` callers, the modal render tests):

```bash
pnpm test
```

Expected: green. Investigate any failure per systematic-debugging before proceeding to close-out.

- [ ] **Step 2: Verify no `overrideActive` prop references remain**

Run: `rg -n "overrideActive" components/ tests/`
Expected: zero matches for the removed `PackListBreakdown` prop (any remaining must be unrelated). Fix stragglers.

---

## Close-out (pipeline Stage 3/4 — not a code task)

- `/impeccable critique` AND `/impeccable audit` on the diff (invariant 8); P0/P1 fixed or `DEFERRED.md`.
- Whole-diff cross-model adversarial review (Codex), fresh-eyes, iterate to APPROVE.
- Push; real CI green; `gh pr merge --merge`; fast-forward local main.

---

## Self-review (author checklist — completed at write time)

1. **Spec coverage:** §3.1 override threading → Tasks 2–4; §3.1 freeze threading F1–F5 → Tasks 4–5; §3.2 divergence → Task 4; §3.3 state precedence → Task 4 Step 5; §3.4 recovery block → Task 4 Step 3; §3.5 guards → Task 4 tests; §3.6 published → Task 3 + Task 4 published test; §4.1 → Task 2; §4.1b → Task 2; §4.2 → Task 1; §4.3 → Task 4; §4.4 real-browser + freeze behavioral → Tasks 5–6; §5 meta-test → Task 5; §5 coercer parity → Task 1. All covered.
2. **Placeholder scan:** none — every code step shows the code; commands are exact.
3. **Type consistency:** `pullSheetOverride: OverrideSnapshot` used identically across `Step3Row` (optional), `SectionCore` (required), `PackListBreakdown` prop (required); `coerceOverrideSnapshotFromRow` / `coercePullSheetOverride` names match across Tasks 1–2; `Step3RunStateContext` defined Task 4, consumed Task 4/5, provided Task 5.
4. **Anti-tautology:** every S5 test asserts the competing affordance ABSENT (suppression), not just the recovery block present; the S4 case asserts S5 absent; fixtures are spelled out, no empty-array shortcuts.
