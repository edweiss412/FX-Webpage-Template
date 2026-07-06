# Wire the Silent Telemetry Channels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each of the three audit "silent channel" ingestion failure modes a signal calibrated to who resolves it — A: a dev-facing coded `app_events` log; B: a regression test pinning the already-wired `pending_ingestions` inbox surfacing; C: a new `RESYNC_QUALITY_REGRESSED` Doug bell alert for post-apply data-quality regressions.

**Architecture:** A wires the existing `onWarning` hook at the two default `listDriveFolder` calls to emit a coded `log.warn`. B ships tests only (HEAD already writes the live `pending_ingestions` row via `phase1.ts`). C adds one `admin_alerts` code plus two pure comparators, a tx-bound producer in the applied epilogue of the cron sync, a raw tx resolve helper, and an additive raw-nullable field on `readShowForPhase1`. Migration-free.

**Tech Stack:** Next.js 16, Supabase (postgres.js tx), TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-07-05-wire-silent-channels-design.md`.

## Global Constraints

Copied verbatim from the spec + AGENTS.md plan-wide invariants. Every task's requirements implicitly include this section.

- **TDD per task.** Failing test → minimal impl → green → commit. Never impl before its test.
- **Commit per task**, conventional-commits (`<type>(<scope>): <summary>`), `--no-verify` (shared lint-staged hook belongs to the main checkout). Worktree: `/Users/ericweiss/fxav-worktrees/wire-silent-channels`, branch `feat/wire-silent-channels`.
- **Invariant 2 (advisory lock single-holder).** C's raise/resolve are tx-bound INSIDE the existing `withShowLock` pipeline tx (mirror `PARSE_ERROR_LAST_GOOD`/`RESYNC_SHRINK_HELD` at `runScheduledCronSync.ts:2830-2884`). No new `pg_advisory*` holder. A's `log.warn` is outside any lock (listing phase). No nested holder.
- **Invariant 5 (no raw error codes in UI).** All Doug/crew copy routes through `lib/messages/catalog.ts` / `lib/messages/lookup.ts`. A's raw `code:` lives in `app_events` (dev telemetry) — permitted.
- **Invariant 9 (Supabase call-boundary).** The `readShowForPhase1` `priorParseWarningsRaw` addition is an additive projection on the SAME existing tx query (no new `{ data, error }` boundary). C's resolve query uses the existing `tx.queryOne` helper.
- **Invariant 10 (mutation observability).** A is the coded emit. B reuses the existing `pending_ingestions` write. C is an `admin_alerts` raise inside an existing sync mutation path — no new admin HTTP route or `"use server"` action, so no `AUDITABLE_MUTATIONS` row required.
- **New §12.4 code lockstep (C only).** Master spec §12.4 prose + `pnpm gen:spec-codes` + `catalog.ts` row land in ONE commit; then `pnpm gen:internal-code-enums`; `AdminAlertCode` union; registry/meta-test rows. NEVER prettier `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md`.
- **Migration-free.** No `supabase/migrations/**` change. `pnpm gen:schema-manifest` is a no-op; `validation-schema-parity` untouched.
- **Corpus fact:** gap totals are show-intrinsic (min 0, median 4, max 120). C is per-show self-relative — never an absolute floor.
- **Anti-tautology tests:** assert against `summarizeDataGaps` inputs / the persisted `admin_alerts` row / the `needsAttention` output object — never a rendered container that also renders the expected label.
- **Full suite before push:** `pnpm test` + `pnpm typecheck` + `pnpm lint` + `pnpm format:check`. Scoped gates miss cross-chokepoint regressions.

---

## File Structure

**Created:**
- `lib/sync/logUnexpectedParent.ts` — shared `emitUnexpectedParentWarning` coded-log helper (A).

**Modified:**
- `lib/sync/runOnboardingScan.ts` — wire `onWarning` into the `prepareOnboardingFiles` default `listDriveFolder` branch (`:948`) (A).
- `lib/sync/runScheduledCronSync.ts` — wire `onWarning` into the `runScheduledCronSync` default `listDriveFolder` branch (`:3149`) (A); add `priorParseWarningsRaw` to `readShowForPhase1` return (C); hoist the pre-apply `priorShow` read; add `resolveQualityRegression_unlocked` + `evaluateQualityRegression_unlocked` producer; wire into the applied epilogue (C).
- `lib/parser/dataGaps.ts` — add `isQualityRegression` + `hasRecoveredToBaseline` pure comparators (C).
- `lib/messages/catalog.ts` — new `RESYNC_QUALITY_REGRESSED` entry (C).
- `lib/adminAlerts/upsertAdminAlert.ts` — add `RESYNC_QUALITY_REGRESSED` to `AdminAlertCode` (C).
- `lib/adminAlerts/alertIdentityMap.ts` — `RESYNC_QUALITY_REGRESSED: { kind: "global" }` (C).
- `lib/adminAlerts/audience.ts` — `AUTO_RESOLVE_NOTES` entry (C).
- `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` — §12.4 prose row (C).
- `tests/messages/adminAlertsRegistry.ts` — add code (C).
- `tests/messages/_metaAdminAlertCatalog.test.ts` — raise-site pattern + `ADMIN_ALERTS_LIFECYCLE` auto entry + `INTERPOLATED_DOUG_FACING_CODES` + auto-count bump (C).

**Generated (regenerated, committed):**
- `lib/messages/__generated__/spec-codes.ts` (`pnpm gen:spec-codes`).
- `lib/messages/__generated__/internal-code-enums.ts` (`pnpm gen:internal-code-enums`).

**Test files (created):**
- `tests/sync/unexpectedParentLog.test.ts` (A).
- `tests/sync/firstSeenPendingIngestion.test.ts` (B).
- `tests/parser/qualityRegressionComparator.test.ts` (C1).
- `tests/sync/readShowPriorWarningsRaw.test.ts` (C2).
- `tests/sync/qualityRegressionLifecycle.test.ts` (C5).

**Help/docs:** the `helpHref` anchor family check (C6) — verify no new anchor file is required (reuse `PARSE_ERROR_LAST_GOOD`'s family).

---

## Task A: Unit A — `UNEXPECTED_PARENT` dev-facing coded log

**Files:**
- Create: `lib/sync/logUnexpectedParent.ts` (shared coded-log helper)
- Modify: `lib/sync/runOnboardingScan.ts` (`prepareOnboardingFiles` default branch, `:948`)
- Modify: `lib/sync/runScheduledCronSync.ts` (`runScheduledCronSync` default branch, `:3149`)
- Test: `tests/sync/unexpectedParentLog.test.ts`

**Interfaces:**
- Consumes: `listFolder(folderId, { onWarning })` from `lib/drive/list.ts` (imported in both files as `listFolder as listDriveFolder`) — `onWarning?: (w: DriveListWarning) => void`, `DriveListWarning = { code: "UNEXPECTED_PARENT"; driveFileId: string; folderId: string; parents: string[] }`; `log.warn(message, fields: LogFields)` from `@/lib/log`. `deps.listFolder?: typeof listDriveFolder` (cron `:374`) — so an injected `listFolder` has the SAME `(folderId, options?)` signature.
- Produces: `export function emitUnexpectedParentWarning(warning: DriveListWarning): void` (the coded emit) — consumed by both production wirings.

**Wiring rule (spec §1/§4.1 — CORRECTED, plan-review R1):** the production folder scans that drop phantom-parent files are the `const listFolder = deps.listFolder ?? listDriveFolder` DEFAULT branches in `prepareOnboardingFiles` (`runOnboardingScan.ts:948`) and `runScheduledCronSync` (`runScheduledCronSync.ts:3149`). Wire `onWarning` into ONLY the default branch (wrap `listDriveFolder`), leaving the `deps.listFolder` injection seam untouched so injected-`listFolder` tests are unaffected. (The `:247`/`:1794` `defaultDriveClient` wrappers are a DIFFERENT path — do NOT target them.)

- [ ] **Step 1: Write the failing test — shared helper + both real production paths**

Create `tests/sync/unexpectedParentLog.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import * as driveList from "@/lib/drive/list";
import { log } from "@/lib/log";
import { emitUnexpectedParentWarning } from "@/lib/sync/logUnexpectedParent";

const WARNING = {
  code: "UNEXPECTED_PARENT" as const,
  driveFileId: "file-1",
  folderId: "folder-1",
  parents: ["other-folder"],
};

describe("Unit A — UNEXPECTED_PARENT coded log", () => {
  it("emitUnexpectedParentWarning writes the coded log.warn (shared helper)", () => {
    const warnSpy = vi.spyOn(log, "warn").mockResolvedValue(undefined);
    emitUnexpectedParentWarning(WARNING);
    expect(warnSpy).toHaveBeenCalledWith(
      "Dropped sheet with unexpected parent folder",
      expect.objectContaining({
        source: "sync.list",
        code: "UNEXPECTED_PARENT",
        drive_file_id: "file-1",
        folder_id: "folder-1",
        parents: ["other-folder"],
      }),
    );
    warnSpy.mockRestore();
  });

  it("prepareOnboardingFiles default branch wires onWarning into the real drive listing", async () => {
    const warnSpy = vi.spyOn(log, "warn").mockResolvedValue(undefined);
    // Spy the real lib/drive/list.listFolder (aliased as listDriveFolder in the module): emit a
    // phantom-parent warning, return an empty list so the rest of the scan is a no-op.
    const listSpy = vi
      .spyOn(driveList, "listFolder")
      .mockImplementation(async (folderId, opts) => {
        opts?.onWarning?.({ ...WARNING, folderId });
        return [];
      });
    const { prepareOnboardingFiles } = await import("@/lib/sync/runOnboardingScan");
    // deps OMITS listFolder → exercises the default branch. Provide only what the empty-list
    // early path needs (onProgress optional). Fill any other required deps as no-op stubs.
    await prepareOnboardingFiles("folder-1", {} as never);
    expect(warnSpy).toHaveBeenCalledWith(
      "Dropped sheet with unexpected parent folder",
      expect.objectContaining({ code: "UNEXPECTED_PARENT", drive_file_id: "file-1" }),
    );
    listSpy.mockRestore();
    warnSpy.mockRestore();
  });

  // Mirror the same real-path assertion for the scheduled cron listing (runScheduledCronSync
  // default branch, :3149). If the full runScheduledCronSync setup is prohibitive to stub, assert
  // instead that the default branch expression passes emitUnexpectedParentWarning as onWarning —
  // e.g. a focused test that spies driveList.listFolder and drives the cron entry with deps
  // omitting listFolder and an empty folder result. Do NOT weaken to the helper-only test alone;
  // the real default-branch wiring MUST be exercised for at least one of the two sites end-to-end.
});
```

> The empty-list return (`[]`) short-circuits the rest of each scan, keeping the integration test light while still exercising the real `deps.listFolder ?? listDriveFolder` default branch. If `prepareOnboardingFiles`/`runScheduledCronSync` throw on missing required deps before reaching the listing, add the minimal no-op deps the early path needs (grep the fn signature: `RunOnboardingScanDeps`, `RunScheduledCronSyncDeps`), or gate the assertion on the listing having run.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/unexpectedParentLog.test.ts`
Expected: FAIL — `@/lib/sync/logUnexpectedParent` does not exist; onWarning unwired.

- [ ] **Step 3: Create the shared helper**

Create `lib/sync/logUnexpectedParent.ts`:

```ts
import type { DriveListWarning } from "@/lib/drive/list";
import { log } from "@/lib/log";

/**
 * Unit A (spec §4): emit the dev-facing coded `app_events` warning when a folder scan drops a
 * sheet filed under an unexpected parent. Queryable via `pnpm observe events --code UNEXPECTED_PARENT`.
 * No admin alert, no push (actionability-gating). Runs in the listing phase, outside any advisory
 * lock (invariant 2 N/A). Fire-and-forget: the caller's `onWarning` is `=> void`.
 */
export function emitUnexpectedParentWarning(warning: DriveListWarning): void {
  void log.warn("Dropped sheet with unexpected parent folder", {
    source: "sync.list",
    code: warning.code, // "UNEXPECTED_PARENT"
    drive_file_id: warning.driveFileId,
    folder_id: warning.folderId,
    parents: warning.parents,
  });
}
```

- [ ] **Step 4: Wire the default branch in both production scans**

`lib/sync/runOnboardingScan.ts` `:948` — change:
```ts
  const listFolder = deps.listFolder ?? listDriveFolder;
```
to:
```ts
  const listFolder =
    deps.listFolder ??
    ((folderId: string) => listDriveFolder(folderId, { onWarning: emitUnexpectedParentWarning }));
```

`lib/sync/runScheduledCronSync.ts` `:3149` — identical change.

Add `import { emitUnexpectedParentWarning } from "@/lib/sync/logUnexpectedParent";` to both files. The wrapped arrow matches `typeof listDriveFolder` (`(folderId, options?)`), so the `deps.listFolder ?? …` type still unifies; injected `deps.listFolder` is untouched (tests unaffected).

- [ ] **Step 5: Run test + typecheck**

Run: `pnpm vitest run tests/sync/unexpectedParentLog.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Verify the `source` token is allowed**

Run: `rg -n "\"sync\\.list\"|source:\\s*\"sync\\." lib/ scripts/ tests/` — if a `source` allow-list/registry pins the set, add `"sync.list"` there. If none exists, no action.

- [ ] **Step 7: Commit**

```bash
git add lib/sync/logUnexpectedParent.ts lib/sync/runOnboardingScan.ts lib/sync/runScheduledCronSync.ts tests/sync/unexpectedParentLog.test.ts
git commit --no-verify -m "feat(sync): emit coded UNEXPECTED_PARENT log at both production folder-scan default branches (audit #15)"
```

---

## Task B: Unit B — regression pin for first-seen `pending_ingestions` surfacing

**Files:**
- Test only: `tests/sync/firstSeenPendingIngestion.test.ts`
- (No production edit — HEAD already writes the row at `lib/sync/phase1.ts:359-368`.)

**Interfaces:**
- Consumes: `runPhase1` (or the cron tx port) writing a live `pending_ingestions` row via `tx.upsertLivePendingIngestion({ driveFileId, wizardSessionId: null, driveFileName, lastErrorCode, lastErrorMessage, lastWarnings, lastSeenModifiedTime })` on a first-seen (`!show`) `hard_fail`; `lib/admin/needsAttention.ts` `resolveIngestionCopy({ code, driveFileName })` → catalog-safe copy; `tx.deleteLivePendingIngestion(driveFileId)` on success.
- Produces: nothing.

- [ ] **Step 1: Write the failing test (regression + recovery pins)**

Create `tests/sync/firstSeenPendingIngestion.test.ts`. Use the existing phase1 test harness/fakes (grep `tests/sync` for an existing `runPhase1` fake-tx test to mirror the tx double shape). Two cases:

```ts
import { describe, expect, it } from "vitest";
import { buildNeedsAttention, resolveIngestionCopy } from "@/lib/admin/needsAttention";
// import { runPhase1 } from "@/lib/sync/phase1";  // + the existing fake tx builder

describe("Unit B — first-seen hard_fail surfaces via live pending_ingestions", () => {
  it("writes a live (wizard_session_id NULL) pending row on a first-seen hard_fail", async () => {
    // Arrange: a fake tx recording upsertLivePendingIngestion calls; a first-seen file (!show)
    // whose parse yields invariant.outcome === "hard_fail"; wizardSessionId = null (cron port).
    // Act: runPhase1(args, tx)
    // Assert against the recorded row (DB row shape, anti-tautology):
    //   row.wizardSessionId === null
    //   row.lastErrorCode === <the hard-fail code>
    //   row.driveFileName set
    // Assert needsAttention copy is catalog-safe (never a raw code):
    const copy = resolveIngestionCopy({ code: "PARSE_HARD_FAIL", driveFileName: "Doug's Sheet" });
    expect(copy).not.toMatch(/[A-Z0-9]+_[A-Z0-9_]+/); // no raw SCREAMING_CODE leaks (invariant 5)
    expect(copy.length).toBeGreaterThan(0);
  });

  it("the live row reaches the Needs-Attention inbox as a pending_ingestion item + count (plan-review R4)", () => {
    // Feed the recorded live row (wizardSessionId === null) through buildNeedsAttention as an
    // `ingestion` entry (mirror lib/admin/needsAttention.ts:282 mapping + the existing
    // tests/admin/loadNeedsAttention.test.ts input shape). Assert:
    //   - the output items include one { variant: "pending_ingestion", driveFileId, copy } item
    //   - that item's copy === resolveIngestionCopy({ code, driveFileName }) (catalog-safe)
    //   - the count/badge-visible total includes it (so the main-nav badge increments).
    // This catches a regression where rows are still written but no longer LOADED/CLASSIFIED into
    // the inbox — the surface Unit B's audit-#14 closure depends on. Assert against the
    // buildNeedsAttention output object, not a rendered container (anti-tautology).
  });

  it("clears the row on a subsequent successful apply (deleteLivePendingIngestion)", async () => {
    // Arrange: a fake tx recording deleteLivePendingIngestion(driveFileId).
    // Act: drive the success/apply path (or phase1 stage/success branch that calls delete).
    // Assert deleteLivePendingIngestion was called with the driveFileId.
  });
});
```

> Fill the `// Act` bodies against the real `runPhase1` signature and the existing fake-tx fixture in `tests/sync/`. Derive the expected `lastErrorCode` from the fixture's actual hard-fail invariant (not hardcoded) — the value is `invariant.failedCodes[0] ?? "PARSE_HARD_FAIL"` (`phase1.ts:348`). For the inbox assertion, use `buildNeedsAttention` (`needsAttention.ts:231`, exported) with an `ingestion`-kind entry carrying the recorded row's fields (see `tests/admin/loadNeedsAttention.test.ts` for the input shape). Assert against the recorded row object + `buildNeedsAttention` output + `resolveIngestionCopy` output, NOT a rendered inbox container.

- [ ] **Step 2: Run test to verify it fails (or passes-for-the-right-reason)**

Run: `pnpm vitest run tests/sync/firstSeenPendingIngestion.test.ts`
Expected: the FIRST assertion may already pass (behavior exists) — that is acceptable for a regression pin. To prove the test has teeth, temporarily comment out the `else { … upsertLivePendingIngestion … }` branch in `phase1.ts` (do NOT commit), re-run, confirm it FAILS, then restore. Document this in the commit body.

- [ ] **Step 3: No implementation change**

Behavior already exists (`phase1.ts:347-373`). This task adds coverage only.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/sync/firstSeenPendingIngestion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/sync/firstSeenPendingIngestion.test.ts
git commit --no-verify -m "test(sync): pin first-seen hard_fail live pending_ingestions surfacing + delete-on-success (audit #14 regression guard)"
```

---

## Task C1: Comparators — `isQualityRegression` + `hasRecoveredToBaseline`

**Files:**
- Modify: `lib/parser/dataGaps.ts` (append two pure functions)
- Test: `tests/parser/qualityRegressionComparator.test.ts`

**Interfaces:**
- Consumes: `summarizeDataGaps(warnings): DataGapsSummary` where `DataGapsSummary = { total: number; classes: Record<GapCode, number> }` (`dataGaps.ts:55-60`); `GapCode` (22 classes).
- Produces:
  - `export function isQualityRegression(prior: DataGapsSummary, next: DataGapsSummary): boolean`
  - `export function hasRecoveredToBaseline(baseline: DataGapsSummary, current: DataGapsSummary): boolean`

- [ ] **Step 1: Write the failing test**

Create `tests/parser/qualityRegressionComparator.test.ts`. Build summaries via a helper that constructs `DataGapsSummary` from a class→count map (derive `total` from the map — never hardcode a mismatched total):

```ts
import { describe, expect, it } from "vitest";
import {
  GAP_CLASSES,
  hasRecoveredToBaseline,
  isQualityRegression,
  type DataGapsSummary,
  type GapCode,
} from "@/lib/parser/dataGaps";

const A = GAP_CLASSES[0].code as GapCode; // first real class
const B = GAP_CLASSES[1].code as GapCode; // second real class

function summary(counts: Partial<Record<GapCode, number>>): DataGapsSummary {
  const classes = Object.fromEntries(GAP_CLASSES.map((g) => [g.code, 0])) as Record<GapCode, number>;
  let total = 0;
  for (const [k, v] of Object.entries(counts)) {
    classes[k as GapCode] = v ?? 0;
    total += v ?? 0;
  }
  return { total, classes };
}

describe("isQualityRegression (opener dual-gate)", () => {
  it("fires when a new class appears (rule 1, no magnitude gate)", () => {
    expect(isQualityRegression(summary({ [A]: 0 }), summary({ [A]: 1 }))).toBe(true);
  });
  it("fires on +5 abs AND +50% rel (rule 2): 4→40", () => {
    expect(isQualityRegression(summary({ [A]: 4 }), summary({ [A]: 40 }))).toBe(true);
  });
  it("does NOT fire on +1 abs (< 5): 1→2", () => {
    expect(isQualityRegression(summary({ [A]: 1 }), summary({ [A]: 2 }))).toBe(false);
  });
  it("does NOT fire on +6 abs but +5% rel (< 50%): 118→124", () => {
    expect(isQualityRegression(summary({ [A]: 118 }), summary({ [A]: 124 }))).toBe(false);
  });
  it("does NOT fire on a strict improvement", () => {
    expect(isQualityRegression(summary({ [A]: 40 }), summary({ [A]: 4 }))).toBe(false);
  });
});

describe("hasRecoveredToBaseline (recovery ≠ ¬opener)", () => {
  it("false when a class still exceeds baseline below the opener gate: 4→8", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 4 }), summary({ [A]: 8 }))).toBe(false);
  });
  it("false on partial recovery the opener negation would clear: 118 baseline, 170 current", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 118 }), summary({ [A]: 170 }))).toBe(false);
  });
  it("true when every class returns to baseline: 4→4", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 4 }), summary({ [A]: 4 }))).toBe(true);
  });
  it("false when one class exceeds baseline (multi-class)", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 10, [B]: 5 }), summary({ [A]: 10, [B]: 6 }))).toBe(false);
  });
  it("true when all classes ≤ baseline (multi-class)", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 10, [B]: 5 }), summary({ [A]: 8, [B]: 5 }))).toBe(true);
  });
  it("true when current is fully clean", () => {
    expect(hasRecoveredToBaseline(summary({ [A]: 40 }), summary({}))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/parser/qualityRegressionComparator.test.ts`
Expected: FAIL — `isQualityRegression`/`hasRecoveredToBaseline` not exported.

- [ ] **Step 3: Implement the comparators**

Append to `lib/parser/dataGaps.ts` (after `summarizeDataGaps`):

```ts
/**
 * OPENER dual-gate (spec §6.3): does `next` represent a materially worse parse than `prior`?
 * Fires when EITHER a new gap class appears (0→>0, no magnitude gate) OR an existing class
 * worsens by >=5 absolute AND >=50% relative. Never compares `.total` (show-intrinsic).
 */
export function isQualityRegression(prior: DataGapsSummary, next: DataGapsSummary): boolean {
  for (const { code } of GAP_CLASSES) {
    const p = prior.classes[code];
    const n = next.classes[code];
    if (p === 0 && n > 0) return true; // rule 1: new class
    if (p > 0 && n - p >= 5 && n >= p * 1.5) return true; // rule 2: +5 abs AND +50% rel
  }
  return false;
}

/**
 * RECOVERY predicate (spec §6.4, round-10) — deliberately NOT the negation of the opener.
 * True iff EVERY gap class is at-or-below its baseline count (no class exceeds baseline,
 * no new class present). Asymmetric hysteresis: open on a real jump, close only on full recovery.
 */
export function hasRecoveredToBaseline(
  baseline: DataGapsSummary,
  current: DataGapsSummary,
): boolean {
  for (const { code } of GAP_CLASSES) {
    if (current.classes[code] > baseline.classes[code]) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/parser/qualityRegressionComparator.test.ts`
Expected: PASS.

- [ ] **Step 5: Guard the parser-completeness meta-test**

Run: `pnpm vitest run tests/parser/` (or the `dataGapsClassCompleteness`-adjacent test) — confirm the new exports don't break the GAP_CLASSES completeness assertions.

- [ ] **Step 6: Commit**

```bash
git add lib/parser/dataGaps.ts tests/parser/qualityRegressionComparator.test.ts
git commit --no-verify -m "feat(parser): add isQualityRegression + hasRecoveredToBaseline data-quality comparators (audit #16)"
```

---

## Task C2: `readShowForPhase1` raw-nullable `priorParseWarningsRaw`

**Files:**
- Modify: `lib/sync/phase1.ts` (`Phase1ShowRow` TYPE, `:22` — the type of `tx.readShowForPhase1`'s return; plan-review R3)
- Modify: `lib/sync/runScheduledCronSync.ts` (`readShowForPhase1` concrete return object, ~:692)
- Test: `tests/sync/readShowPriorWarningsRaw.test.ts`

**Interfaces:**
- Consumes: the existing `readShowForPhase1` SELECT of `parse_warnings` (nullable) + `internal` row.
- Produces: `priorParseWarningsRaw: ParseResult["warnings"] | null` on the `Phase1ShowRow` type (`phase1.ts:22`) AND on the concrete `readShowForPhase1` return object — the RAW non-coalesced value: `internal?.parse_warnings ?? null` (`?? null`, NOT `?? []`). `null` when the column is NULL OR the `shows_internal` row is absent. The existing `warnings` field is UNCHANGED (`internal?.parse_warnings ?? []`). C5's `priorShow?.priorParseWarningsRaw` is typed via `Phase1ShowRow` (`readShowForPhase1(driveFileId): Promise<Phase1ShowRow | null>`, `phase1.ts:60`), so the TYPE addition is load-bearing — without it typecheck fails or forces a cast.

- [ ] **Step 1: Write the failing test**

Create `tests/sync/readShowPriorWarningsRaw.test.ts`. Drive `readShowForPhase1` with a fake tx (mirror the existing `readShowForPhase1` test fixture — grep `tests/sync` for one) for three internal-row shapes:

```ts
// Case (a) internal row present, parse_warnings = NULL  → priorParseWarningsRaw === null, warnings === []
// Case (b) NO shows_internal row (internal undefined)    → priorParseWarningsRaw === null, warnings === []
// Case (c) internal row present, parse_warnings = []     → priorParseWarningsRaw deep-equals [], warnings === []
// Assert BOTH fields on the SAME returned object so the divergence (null vs []) is pinned.
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/sync/readShowPriorWarningsRaw.test.ts`
Expected: FAIL — `priorParseWarningsRaw` undefined on the return object.

- [ ] **Step 3: Add the field to the `Phase1ShowRow` TYPE**

In `lib/sync/phase1.ts`, add to the `Phase1ShowRow` type (`:22`, near the `priorParseResult: ParseResult` field):
```ts
  priorParseResult: ParseResult;
  priorParseWarningsRaw: ParseResult["warnings"] | null; // §6.5: RAW nullable prior warnings (C baseline read)
```
Confirm `ParseResult` is imported in `phase1.ts` (it is — used by `priorParseResult`). This is the type `tx.readShowForPhase1` returns, so C5's access typechecks.

- [ ] **Step 4: Add the field to the concrete return object**

In `readShowForPhase1` return object (`runScheduledCronSync.ts:~692`), alongside `warnings: internal?.parse_warnings ?? []`, add:

```ts
        warnings: internal?.parse_warnings ?? [],
        priorParseWarningsRaw: internal?.parse_warnings ?? null, // §6.5: RAW nullable — null ⇒ untrustworthy baseline (skip C)
```

Grep for any OTHER concrete producer of `Phase1ShowRow` (e.g. onboarding tx's `readShowForPhase1`, or test fakes) — every producer must now supply `priorParseWarningsRaw` (add `?? null` there too). `rg -n "priorParseResult:" lib/ tests/` finds them.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/sync/readShowPriorWarningsRaw.test.ts && pnpm typecheck`
Expected: PASS (test + typecheck — the type addition compiles; every `Phase1ShowRow` producer supplies the field; existing consumers of `warnings` unaffected).

- [ ] **Step 6: Commit**

```bash
git add lib/sync/phase1.ts lib/sync/runScheduledCronSync.ts tests/sync/readShowPriorWarningsRaw.test.ts
git commit --no-verify -m "feat(sync): expose raw-nullable priorParseWarningsRaw on Phase1ShowRow + readShowForPhase1 (C baseline read-path)"
```

---

## Task C3: `RESYNC_QUALITY_REGRESSED` §12.4 code lockstep

**Files:**
- Modify: `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` (§12.4 prose row — do NOT prettier)
- Modify: `lib/messages/catalog.ts` (new entry)
- Modify: `lib/adminAlerts/upsertAdminAlert.ts` (`AdminAlertCode` union)
- Regenerate: `lib/messages/__generated__/spec-codes.ts`, `lib/messages/__generated__/internal-code-enums.ts`
- Gate: `tests/cross-cutting/codes.test.ts` (x1 catalog-parity), the x2 internal-code-enums gate

**Interfaces:**
- Produces: catalog code `"RESYNC_QUALITY_REGRESSED"` with `audience:"doug"`, `resolution:"auto"`, NO `adminSurface` (banner default); `AdminAlertCode` includes `"RESYNC_QUALITY_REGRESSED"`.

- [ ] **Step 1: Add the §12.4 prose row**

Edit `docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md` §12.4 — add a `RESYNC_QUALITY_REGRESSED` row mirroring `RESYNC_SHRINK_HELD`'s row format exactly (copy the neighboring row's column structure). Doug copy per spec §6.6. **Do not run prettier on this file** (`feedback_never_prettier_the_master_spec`).

- [ ] **Step 2: Add the catalog entry**

In `lib/messages/catalog.ts`, add (mirror `RESYNC_SHRINK_HELD` shape but banner/doug/auto, ALL required fields present incl. `helpfulContext` + `longExplanation`):

```ts
  RESYNC_QUALITY_REGRESSED: {
    code: "RESYNC_QUALITY_REGRESSED",
    resolution: "auto",
    audience: "doug",
    // NO adminSurface → banner (spec §6.1): feed-visible in the Bell center, not inbox-routed.
    dougFacing:
      "_<sheet-name>_'s latest edit lost some data quality — one or more fields or sections that used to read no longer do. The update is already live; open the parse panel to see what degraded and fix the sheet.",
    crewFacing: null,
    followUp: "Doug → check parse panel, fix sheet",
    helpfulContext:
      "A recent edit to the sheet parsed and went live, but more fields or sections failed to read than before. Crew see the applied data; nothing is held. Open the per-show parse panel to see which classes degraded, fix the sheet, and the next sync clears this automatically once quality recovers.",
    title: "Latest edit lost data quality",
    longExplanation:
      "The latest sync applied but read fewer fields or sections than the previous version — a data-quality regression, not a hard failure. The update is already live for crew. Open the parse panel to see what degraded, fix the sheet, and a recovered sync clears this on its own.",
    // /help/errors# — NOT /help/admin/parse-warnings# (plan-review R2): _metaErrorCatalogDocs.test.ts
    // permits parse-warnings anchors ONLY for WARN_/PARSE_ codes; every other Doug-facing code uses
    // /help/errors#<code>. Mirrors RESYNC_SHRINK_HELD (helpHref "/help/errors#RESYNC_SHRINK_HELD").
    helpHref: "/help/errors#RESYNC_QUALITY_REGRESSED",
  },
```

- [ ] **Step 3: Add to `AdminAlertCode`**

In `lib/adminAlerts/upsertAdminAlert.ts`, add `| "RESYNC_QUALITY_REGRESSED"` to the union (after `"RESYNC_SHRINK_HELD"`).

- [ ] **Step 4: Regenerate**

```bash
pnpm gen:spec-codes
pnpm gen:internal-code-enums
```

- [ ] **Step 5: Run the parity gates**

Run: `pnpm vitest run tests/cross-cutting/codes.test.ts`
Expected: PASS (runtime catalog ↔ §12.4 prose parity — x1). Then run the internal-code-enums (x2) gate (grep `package.json` for `test:audit:x2` or run the enums test). Expected: PASS.
Run: `pnpm typecheck` — PASS.

- [ ] **Step 6: Commit (all lockstep parts in ONE commit)**

```bash
git add docs/superpowers/specs/2026-04-30-fxav-crew-pages-v1.md lib/messages/catalog.ts lib/messages/__generated__/spec-codes.ts lib/messages/__generated__/internal-code-enums.ts lib/adminAlerts/upsertAdminAlert.ts
git commit --no-verify -m "feat(messages): add RESYNC_QUALITY_REGRESSED §12.4 code (spec prose + catalog + gen + AdminAlertCode)"
```

---

## Task C4: Registry + meta-test rows for `RESYNC_QUALITY_REGRESSED`

**Files:**
- Modify: `tests/messages/adminAlertsRegistry.ts` (add code)
- Modify: `tests/messages/_metaAdminAlertCatalog.test.ts` (raise-site pattern + `ADMIN_ALERTS_LIFECYCLE` auto entry + `INTERPOLATED_DOUG_FACING_CODES` + auto-count bump)
- Modify: `tests/messages/_metaAlertActionsContract.test.ts` (`RAISE_SITE_PINS` show-scoped pin — plan-review R2)
- Modify: `lib/adminAlerts/alertIdentityMap.ts` (`{ kind: "global" }`)
- Modify: `tests/adminAlerts/adminAlertCodes.fixture.ts` (add code — the identity-map registry copy; plan-review R3)
- Modify: `tests/adminAlerts/_metaAlertIdentityMap.test.ts` (bump the exact-count assertion `43` → `44`; plan-review R3)
- Modify: `lib/adminAlerts/audience.ts` (`AUTO_RESOLVE_NOTES` entry)
- Gates: `tests/messages/_metaAlertAudienceContract.test.ts`, `tests/messages/adminSurface.test.ts`, `tests/adminAlerts/_metaAlertIdentityMap.test.ts` (read a registry — must stay green)

**Interfaces:**
- Consumes: `ADMIN_ALERTS_CODES` (registry array); `ADMIN_ALERTS_LIFECYCLE` (per-code `{ class, resolveSites }`); `INTERPOLATED_DOUG_FACING_CODES`; the `_metaAdminAlertCatalog` raise-site registry (per-code `{ path, pattern }`); the `_metaAlertActionsContract` `RAISE_SITE_PINS` array (`{ code, file, pattern (g flag), expectedMatches, pins }`).
- Produces: all structural gates green with the new code registered + its show-scoped raise pinned.

> Order note: the producer/resolve-helper names referenced by the raise-site + lifecycle patterns (`evaluateQualityRegression_unlocked`, `resolveQualityRegression_unlocked`) are introduced in Task C5. Write the patterns here to match those exact names; C4's meta-test edits will fail their on-disk pattern checks until C5 lands the producer. **Land C4 and C5 as a pair** (C4 test → C5 impl → both green), OR sequence C5 before C4's `_metaAdminAlertCatalog` on-disk pattern assertions. The registry/audience/identity/audience-note rows below are independent of C5 and green immediately.

- [ ] **Step 1: Add the registry + audience + identity + auto-note rows**

`tests/messages/adminAlertsRegistry.ts` — add to `ADMIN_ALERTS_CODES`:
```ts
  "RESYNC_QUALITY_REGRESSED", //     C: published-show data-quality regression (audit #16)
```

`lib/adminAlerts/alertIdentityMap.ts` — add:
```ts
  // RESYNC_QUALITY_REGRESSED — already SPECIFIC (sheet in copy) — global entry
  RESYNC_QUALITY_REGRESSED: { kind: "global" },
```

`tests/adminAlerts/adminAlertCodes.fixture.ts` — add to its `ADMIN_ALERTS_CODES` array (the identity-map registry copy, distinct from `tests/messages/adminAlertsRegistry.ts`):
```ts
  "RESYNC_QUALITY_REGRESSED", //      C: published-show data-quality regression (audit #16)
```
`tests/adminAlerts/_metaAlertIdentityMap.test.ts` — bump the exact-count assertion (`:39-40`) `expect(ADMIN_ALERTS_CODES.length).toBe(43)` → `toBe(44)` (and update the "43 codes" comment). Without both, `_metaAlertIdentityMap` fails ("stray identity map entry for unregistered code" + the numeric-sweep anchor).

`lib/adminAlerts/audience.ts` — add to `AUTO_RESOLVE_NOTES`:
```ts
  RESYNC_QUALITY_REGRESSED:
    "Clears automatically once the sheet's data quality recovers — fix the sheet to resolve it.",
```

- [ ] **Step 2: Run the audience + surface + identity contracts**

Run: `pnpm vitest run tests/messages/_metaAlertAudienceContract.test.ts tests/messages/adminSurface.test.ts tests/adminAlerts/_metaAlertIdentityMap.test.ts`
Expected: `_metaAlertAudienceContract` PASS (C carries `audience:"doug"` → `DOUG ∪ HEALTH === ADMIN_ALERTS_CODES` holds). `adminSurface` PASS (C is banner, so `INBOX_ROUTED_CODES` stays exactly the 3 existing codes — do NOT add C there). `_metaAlertIdentityMap` PASS (C's `{ kind: "global" }` entry is registered in the fixture; count is now 44).

- [ ] **Step 3: Add the `_metaAdminAlertCatalog` rows**

`tests/messages/_metaAdminAlertCatalog.test.ts`:

(a) Raise-site registry (~:142, mirror `RESYNC_SHRINK_HELD`):
```ts
  RESYNC_QUALITY_REGRESSED: {
    path: "lib/sync/runScheduledCronSync.ts",
    pattern: /upsertAdminAlert\(\{[\s\S]*code:\s*"RESYNC_QUALITY_REGRESSED"/,
  },
```

(b) `ADMIN_ALERTS_LIFECYCLE` (~:307, class auto, resolve-site = the dedicated helper):
```ts
  RESYNC_QUALITY_REGRESSED: {
    class: "auto",
    resolveSites: [
      {
        file: "lib/sync/runScheduledCronSync.ts",
        pattern: /resolveQualityRegression_unlocked/,
      },
    ],
  },
```

(c) `INTERPOLATED_DOUG_FACING_CODES` (~:548) — add:
```ts
    "RESYNC_QUALITY_REGRESSED", // lib/sync/runScheduledCronSync.ts supplies sheet_name
```

(d) Auto-code count (~:659-660): bump `25` → `26` and extend the comment (`+ RESYNC_QUALITY_REGRESSED`).

- [ ] **Step 3b: Add the show-scoped raise-site pin (`_metaAlertActionsContract`, plan-review R2)**

`tests/messages/_metaAlertActionsContract.test.ts` — add a `RAISE_SITE_PINS` entry (mirror `RESYNC_SHRINK_HELD:114`, but match C's single terminal upsert with the `showId` shorthand from C5):
```ts
  {
    code: "RESYNC_QUALITY_REGRESSED",
    file: "lib/sync/runScheduledCronSync.ts",
    // Single terminal upsert in evaluateQualityRegression_unlocked. `showId,` shorthand → a
    // `showId: null` refactor stops matching, dropping expectedMatches to 0 (fails the pin).
    pattern: /showId,[\s\S]{0,80}?code: "RESYNC_QUALITY_REGRESSED"/g,
    expectedMatches: 1,
    pins: "show-scoped raise (per-show alert row; not a global showId:null collision)",
  },
```

This is the spec §7.9 show-scoping pin — proves the producer raises a SHOW-scoped row (a `showId: null` regression would collapse unresolved alerts across shows under the `(coalesce(show_id::text,''), code)` uniqueness model). C is still NOT added to `ALERT_ACTION_CODES` (no action link — mirrors `PARSE_ERROR_LAST_GOOD`); the `RAISE_SITE_PINS` array is independent of the action-code subset check.

- [ ] **Step 4: Run `_metaAdminAlertCatalog` + `_metaAlertActionsContract`**

Run: `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaAlertActionsContract.test.ts`
Expected: after C5 lands the producer + resolve helper, PASS. (`_metaAlertActionsContract`: the new `RAISE_SITE_PINS` row matches C5's single terminal upsert once; C is NOT in `ALERT_ACTION_CODES` — the contract permits a raise-pinned code with no action entry, as `PARSE_ERROR_LAST_GOOD` already is; no edit to `alertActions.ts`.) If run before C5, the on-disk pattern checks (a)/(b)/(3b) FAIL — expected; proceed to C5. **Confirm the pattern's `{0,80}` window spans C5's actual `{ showId,\n    code: … }` formatting** (prettier may reflow); widen the bound if the real gap exceeds 80 chars.

- [ ] **Step 5: Commit (with C5, or immediately for the independent rows)**

```bash
git add tests/messages/adminAlertsRegistry.ts tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaAlertActionsContract.test.ts tests/adminAlerts/adminAlertCodes.fixture.ts tests/adminAlerts/_metaAlertIdentityMap.test.ts lib/adminAlerts/alertIdentityMap.ts lib/adminAlerts/audience.ts
git commit --no-verify -m "test(messages): register RESYNC_QUALITY_REGRESSED in alert registries + identity fixture (44) + auto-resolve note + show-scoped raise pin"
```

---

## Task C5: Producer — evaluate + raise/keep-open/resolve in the applied epilogue

**Files:**
- Modify: `lib/sync/runScheduledCronSync.ts` (hoist `priorShow`; add `resolveQualityRegression_unlocked` + `evaluateQualityRegression_unlocked`; wire into the applied epilogue ~:3025)
- Test: `tests/sync/qualityRegressionLifecycle.test.ts` (helper-level lifecycle + DB-backed anti-storm + trigger structural)
- Test: `tests/sync/quality-regressed-producer.test.ts` (INTEGRATION through the real applied path — plan-review R4; mirror `tests/sync/resync-shrink-held-producer.test.ts` / `parse-error-last-good-producer.test.ts`)

**Interfaces:**
- Consumes: `isQualityRegression`, `hasRecoveredToBaseline`, `summarizeDataGaps`, `DataGapsSummary` (C1); `priorParseWarningsRaw` (C2); `requireTxBoundUpsertAdminAlert` (`:2007`); `tx.queryOne`; `resolveStaleSyncProblemAlerts_unlocked` pattern.
- Produces:
  - `export async function resolveQualityRegression_unlocked(tx: Pick<SyncPipelineTx, "queryOne">, showId: string): Promise<void>`
  - `export async function evaluateQualityRegression_unlocked(args: { tx; deps; driveFileId; showId; priorParseWarningsRaw; nextWarnings; sheetName }): Promise<void>`

**Design (spec §6.4/§6.4a/§6.5):**
- `priorParseWarningsRaw === null` OR `!showId` → return (record-and-skip / not a published show).
- `prior = summarizeDataGaps(priorParseWarningsRaw)`, `current = summarizeDataGaps(nextWarnings)`.
- Read the open alert: `select context from public.admin_alerts where show_id=$1::uuid and code='RESYNC_QUALITY_REGRESSED' and resolved_at is null`.
- **No open alert:** `isQualityRegression(prior, current)` → upsert OPEN, `baseline = prior`. Else return.
- **Open alert exists** (`context.baseline` = stored `DataGapsSummary`):
  - `hasRecoveredToBaseline(baseline, current)` → `resolveQualityRegression_unlocked(tx, showId)`.
  - else keep open: build candidate payload `{ breakdown, new_classes, worsened }`; if it **deep-equals** the stored payload → SKIP the upsert entirely (§6.4a anti-storm no-op); else re-upsert (payload refreshed, `baseline` preserved verbatim).

- [ ] **Step 1: Write the failing lifecycle tests**

Create `tests/sync/qualityRegressionLifecycle.test.ts`. Use a fake tx recording `queryOne` reads (returning a scripted open-alert `context`) and `upsertAdminAlert` calls, plus a spy on the resolve SQL. Cases (assert against recorded calls / row context — anti-tautology):

```ts
// 1. 4→40, no open alert           → upsertAdminAlert called, context.baseline summarizes to 4
// 2. 40→40, open alert baseline 4, payload identical, row already read → NO upsertAdminAlert call (anti-storm no-op)
// 3. 40→80, open alert baseline 4, payload changed → upsertAdminAlert called, context.baseline STILL 4 (preserved)
// 4. 40→8,  open alert baseline 4  → NO resolve (8 > 4); keep-open (hasRecoveredToBaseline false)
// 5. 8→4,   open alert baseline 4  → resolveQualityRegression_unlocked called (all classes ≤ 4)
// 6. priorParseWarningsRaw === null, current non-empty → NO upsertAdminAlert, NO resolve (record-and-skip)
// 7. showId null → no-op
// 8. present-empty [] prior + non-empty current → upsertAdminAlert OPEN (baseline 0)
```

Also assert the delivery contract (structural, no DB needed):
```ts
// 9. bellExcludedCodes(false)/(true) does NOT include RESYNC_QUALITY_REGRESSED (feed-visible, banner not inbox/health)
//    import { bellExcludedCodes } from "@/lib/admin/bellAudience";
//    expect(bellExcludedCodes(false)).not.toContain("RESYNC_QUALITY_REGRESSED");
//    expect(bellExcludedCodes(true)).not.toContain("RESYNC_QUALITY_REGRESSED");
// 10. Realtime ping coverage (spec §11, round-7): the bell-ping INSERT trigger is code-AGNOSTIC, so
//     C's insert pings by construction. Structural assertion (no DB needed): read the migration and
//     assert admin_alerts_bell_ping_ins is `after insert … for each statement` with NO code/WHEN filter.
//        import { readFileSync } from "node:fs";
//        const sql = readFileSync("supabase/migrations/20260705100002_bell_realtime.sql", "utf8");
//        const insTrig = sql.match(/create trigger admin_alerts_bell_ping_ins[\s\S]*?;/)?.[0] ?? "";
//        expect(insTrig).toMatch(/after insert on public\.admin_alerts/);
//        expect(insTrig).toMatch(/for each statement/);
//        expect(insTrig).not.toMatch(/\bwhen\b/i); // no row/code filter → every insert (incl. C OPEN) pings
// 10b. UPDATE-trigger coverage (plan-review R4): a materially-changed keep-open (40→80) re-upserts via
//      the upsert_admin_alert conflict/UPDATE arm → the bell push must come from the UPDATE trigger.
//      Assert admin_alerts_bell_ping_upd is ALSO statement-level + code-agnostic:
//        const updTrig = sql.match(/create trigger admin_alerts_bell_ping_upd[\s\S]*?;/)?.[0] ?? "";
//        expect(updTrig).toMatch(/after update on public\.admin_alerts/);
//        expect(updTrig).toMatch(/for each statement/);
//        expect(updTrig).not.toMatch(/\bwhen\b/i); // no filter → the 40→80 re-upsert pings the bell
```

> Derive baselines from `summarizeDataGaps` of constructed warning arrays (not hardcoded totals). Build warning arrays whose `summarizeDataGaps` yields the intended class counts, so the test exercises the real summarizer.

**DB-backed anti-storm proof (spec §6.7 test 1 — MANDATORY, plan-review R1+R3).** The fake-tx cases 2/3 prove the producer *issues no upsert* on an unchanged 40→40; the spec additionally requires proving the persisted `admin_alerts` row's activity/read-state does NOT churn (because `last_seen_at` is the bell's unread clock). This DB-backed test is **required** for C5 — no fallback escape hatch (a JS-skip + migration-text equivalence argument does not exercise the real row/read-state path a regression could break). Add a DB-backed lifecycle test against local Supabase (`TEST_DATABASE_URL` — mirror an existing DB-backed sync test's harness; sibling DB tests skip-with-notice when the env var is absent locally, but the test runs in CI where `TEST_DATABASE_URL` is set):

```ts
// DB-backed (local Supabase) — MANDATORY:
// a. Run the producer with a real tx (queryOne against admin_alerts) for a 4→40 sync → one open
//    RESYNC_QUALITY_REGRESSED row exists; capture last_seen_at + occurrence_count.
// b. Simulate Doug reading: set the per-admin read cursor at/after the row's activityAt (or read
//    admin_alerts_read state the bell uses); confirm the row is `read` (unread === false) via the
//    same computation lib/admin/bellFeed.ts:122 uses (readAt >= greatest(raised_at,last_seen_at)).
// c. Run the producer again on a 40→40 (payload identical) → assert last_seen_at AND occurrence_count
//    are UNCHANGED (no upsert issued), and the row is STILL read (no re-badge). ← the anti-storm proof.
// d. Run the producer on a 40→80 (payload changed) → assert last_seen_at ADVANCED and the row is now
//    unread again, with context.baseline STILL the 4-gap summary (preserved).
```

This DB-backed test AND the structural ping-trigger assertions (cases 10 + 10b) are both required C5 commit gates — do not commit C5 without them green (run against `TEST_DATABASE_URL`).

- [ ] **Step 1b: Write the failing INTEGRATION test — real applied path calls the producer (plan-review R4, REQUIRED)**

The lifecycle tests above exercise `evaluateQualityRegression_unlocked` directly; the meta-test patterns only see the helper's upsert. Neither proves the **applied epilogue actually calls the producer with the PRE-apply `priorShow`**. An omitted/misordered epilogue call (or a post-apply re-read that reads the NEW warnings as the baseline) would leave audit #16 silent while every helper/meta test still passes. Create `tests/sync/quality-regressed-producer.test.ts`, mirroring the harness in `tests/sync/resync-shrink-held-producer.test.ts` (which drives the real `processOneFile_unlocked`/sync path with a recording tx double + `deps.upsertAdminAlert`):

```ts
// Drive the REAL applied path (processOneFile_unlocked or its manual-sync sibling harness) for an
// EXISTING published show whose sync APPLIES:
// 1. tx.readShowForPhase1 returns a Phase1ShowRow with priorParseWarningsRaw = a 4-UNKNOWN_FIELD warning
//    array (baseline 4); the incoming parse has 40 UNKNOWN_FIELD warnings (current 40).
// 2. Assert the tx-bound deps.upsertAdminAlert received { showId: <the show's id> (NOT null),
//    code: "RESYNC_QUALITY_REGRESSED", context.baseline summarizing to 4 }.
// 3. Baseline-is-pre-apply proof: make readShowForPhase1's raw warnings DIFFER from the applied
//    (next) warnings; assert the alert's context.baseline reflects the PRIOR (4), not the applied (40)
//    — i.e. the producer read priorShow BEFORE phase2 persisted the new warnings.
// 4. First-seen skip: an auto_publish_ready / !priorShow run → assert NO RESYNC_QUALITY_REGRESSED upsert.
// 5. Null-baseline skip: priorParseWarningsRaw = null + non-empty current → assert NO upsert.
// Anti-tautology: assert against the recorded upsertAdminAlert call args, not a rendered surface.
```

> If `processOneFile_unlocked` is not directly exported, use the same entry the shrink-held/parse-error producer tests use (they exercise the identical locked-tx path). This test is the ONLY gate that catches an unwired/misordered epilogue call — it is a required C5 commit gate alongside the DB-backed anti-storm test.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/sync/qualityRegressionLifecycle.test.ts tests/sync/quality-regressed-producer.test.ts`
Expected: FAIL — `evaluateQualityRegression_unlocked` / `resolveQualityRegression_unlocked` not exported; producer not wired into the epilogue.

- [ ] **Step 3: Implement the resolve helper + producer**

In `lib/sync/runScheduledCronSync.ts`, near `resolveStaleSyncProblemAlerts_unlocked` (`:191`):

```ts
export async function resolveQualityRegression_unlocked(
  tx: Pick<SyncPipelineTx, "queryOne">,
  showId: string,
): Promise<void> {
  await tx.queryOne<{ resolved: true } | undefined>(
    `
      update public.admin_alerts
         set resolved_at = now()
       where show_id = $1::uuid
         and code = 'RESYNC_QUALITY_REGRESSED'
         and resolved_at is null
       returning true as resolved
    `,
    [showId],
  );
}

type QualityRegressionPayload = {
  breakdown: Record<string, number>;
  new_classes: string[];
  worsened: string[];
};

function buildRegressionPayload(
  prior: DataGapsSummary,
  current: DataGapsSummary,
): QualityRegressionPayload {
  const breakdown: Record<string, number> = {};
  const new_classes: string[] = [];
  const worsened: string[] = [];
  for (const { code } of GAP_CLASSES) {
    const p = prior.classes[code];
    const n = current.classes[code];
    if (n > 0) breakdown[code] = n;
    if (p === 0 && n > 0) new_classes.push(code);
    else if (p > 0 && n - p >= 5 && n >= p * 1.5) worsened.push(code);
  }
  return { breakdown, new_classes, worsened };
}

export async function evaluateQualityRegression_unlocked(args: {
  tx: Pick<SyncPipelineTx, "queryOne">;
  deps: ProcessOneFileDeps;
  driveFileId: string;
  showId: string | null | undefined;
  priorParseWarningsRaw: ParseResult["warnings"] | null;
  nextWarnings: ParseResult["warnings"];
  sheetName: string;
}): Promise<void> {
  const { tx, deps, driveFileId, showId, priorParseWarningsRaw, nextWarnings, sheetName } = args;
  if (!showId || priorParseWarningsRaw === null) return; // §6.5 record-and-skip / not published

  const prior = summarizeDataGaps(priorParseWarningsRaw);
  const current = summarizeDataGaps(nextWarnings);

  const open = await tx.queryOne<{ context: Record<string, unknown> } | undefined>(
    `select context from public.admin_alerts
      where show_id = $1::uuid and code = 'RESYNC_QUALITY_REGRESSED' and resolved_at is null`,
    [showId],
  );

  // Decide the terminal action; funnel BOTH raise paths through ONE upsert call so the
  // show-scoping raise-site pin (_metaAlertActionsContract) matches exactly once.
  let context: Record<string, unknown> | null = null;

  if (!open) {
    if (!isQualityRegression(prior, current)) return; // no regression, no open alert → nothing to do
    context = {
      drive_file_id: driveFileId,
      sheet_name: sheetName,
      ...buildRegressionPayload(prior, current),
      baseline: prior, // pre-regression anchor
    };
  } else {
    const baseline = open.context.baseline as DataGapsSummary;
    if (hasRecoveredToBaseline(baseline, current)) {
      await resolveQualityRegression_unlocked(tx, showId); // full per-class recovery → resolve
      return;
    }
    // keep open — payload-gated no-op (§6.4a): skip the upsert when nothing material changed.
    const nextPayload = buildRegressionPayload(baseline, current);
    const storedPayload: QualityRegressionPayload = {
      breakdown: (open.context.breakdown as Record<string, number>) ?? {},
      new_classes: (open.context.new_classes as string[]) ?? [],
      worsened: (open.context.worsened as string[]) ?? [],
    };
    if (payloadEqual(nextPayload, storedPayload)) return; // no-op → no last_seen_at bump, no bell re-ping
    context = { drive_file_id: driveFileId, sheet_name: sheetName, ...nextPayload, baseline }; // baseline preserved
  }

  // Single show-scoped raise site (open OR materially-changed keep-open).
  const upsertAdminAlert = requireTxBoundUpsertAdminAlert(deps, "evaluateQualityRegression");
  await upsertAdminAlert({
    showId, // show-scoped — guarded non-null above (pinned by _metaAlertActionsContract RAISE_SITE_PINS)
    code: "RESYNC_QUALITY_REGRESSED",
    context,
  });
}

/** Order-insensitive payload equality for the §6.4a no-op gate (arrays/objects survive JSON round-trip). */
function payloadEqual(a: QualityRegressionPayload, b: QualityRegressionPayload): boolean {
  const norm = (p: QualityRegressionPayload) =>
    JSON.stringify({
      breakdown: Object.fromEntries(Object.entries(p.breakdown).sort(([x], [y]) => x.localeCompare(y))),
      new_classes: [...p.new_classes].sort(),
      worsened: [...p.worsened].sort(),
    });
  return norm(a) === norm(b);
}
```

> Single terminal `upsertAdminAlert` call: both the open branch and the materially-changed keep-open branch set `context` then fall through to it. The resolve and no-op branches `return` early, so the raise site is reached exactly once per raising sync — `expectedMatches: 1` for the `_metaAlertActionsContract` pin. `buildRegressionPayload` is called with `baseline` (not immediate prior) in the keep-open branch so the payload reflects the full delta-from-baseline, matching what OPEN stored (so an unchanged degraded sync compares equal → no-op).

Confirm imports at top of file: `isQualityRegression`, `hasRecoveredToBaseline`, `summarizeDataGaps`, `DataGapsSummary`, `GAP_CLASSES` from `@/lib/parser/dataGaps`; `ParseResult` already imported.

- [ ] **Step 4: Hoist `priorShow` + wire the producer into the applied epilogue**

Hoist the pre-apply read out of the `notableItems` IIFE so it is in scope at the epilogue. Before the `notableItems` block (~:2923), add:

```ts
  // Unit C + notableItems share ONE pre-apply read (captured BEFORE phase2 overwrites
  // shows_internal.parse_warnings). Only existing shows (pass / auto_apply_with_holds) have a prior.
  const priorShow =
    phase1.outcome === "pass" || phase1.outcome === "auto_apply_with_holds"
      ? await tx.readShowForPhase1(driveFileId)
      : null;
```

Then in the `notableItems` IIFE, replace `const priorShow = await tx.readShowForPhase1(driveFileId);` with a use of the hoisted `priorShow` (keep the `if (!priorShow) return [];` guard). 

In the applied epilogue, AFTER `emitSuccessfulPhase2Tail` and BEFORE `resolveStaleSyncProblemAlerts_unlocked` (~:3025-3026), add:

```ts
  await evaluateQualityRegression_unlocked({
    tx,
    deps: { ...txDeps, upsertAdminAlert: requireTxBoundUpsertAdminAlert(txDeps, "evaluateQualityRegression") },
    driveFileId,
    showId: result.showId,
    priorParseWarningsRaw: priorShow?.priorParseWarningsRaw ?? null,
    nextWarnings: pipeline.parseResult.warnings,
    sheetName: pipeline.parseResult.show.title,
  });
  await resolveStaleSyncProblemAlerts_unlocked(tx, result.showId, null);
```

> `priorShow` is the PRE-apply snapshot (captured before `phase2 = await runPhase2_unlocked(...)`), so `priorParseWarningsRaw` is the prior last-good, NOT the just-applied warnings. `nextWarnings = pipeline.parseResult.warnings` is this sync's parse (what phase2 persisted). `sheetName` uses the CURRENT parse title (the alert is about "the latest edit"). First-seen (`priorShow === null`) → producer skips. C is NOT in `SYNC_PROBLEM_CODES`, so the `:3026` sweep never touches it.

- [ ] **Step 5: Run tests (incl. MANDATORY DB-backed anti-storm + real-path integration) + typecheck**

Run: `TEST_DATABASE_URL=<local> pnpm vitest run tests/sync/qualityRegressionLifecycle.test.ts tests/sync/quality-regressed-producer.test.ts && pnpm typecheck`
Expected: PASS — INCLUDING (i) the DB-backed anti-storm/read-state cases (a-d), (ii) the code-agnostic ping-trigger structural cases (10 + 10b: INSERT and UPDATE triggers), and (iii) the integration test proving the applied epilogue calls the producer with the pre-apply `priorShow`. All three are required gates; do NOT commit C5 with any skipped. Then run the C4 meta-tests now that the producer + resolve helper exist on disk:
Run: `pnpm vitest run tests/messages/_metaAdminAlertCatalog.test.ts tests/messages/_metaAlertActionsContract.test.ts`
Expected: PASS (raise-site + lifecycle resolve-site patterns match; the `RAISE_SITE_PINS` show-scoped pin matches the single terminal upsert once).

- [ ] **Step 6: Commit**

```bash
git add lib/sync/runScheduledCronSync.ts tests/sync/qualityRegressionLifecycle.test.ts tests/sync/quality-regressed-producer.test.ts
git commit --no-verify -m "feat(sync): RESYNC_QUALITY_REGRESSED producer — tx-bound raise/keep-open-noop/resolve in applied epilogue + real-path integration test (audit #16)"
```

---

## Task C6: `/help/errors` anchor family check

**Files:**
- Verify (and only edit if a gate requires): help content for the `helpHref` anchor.

**Interfaces:**
- Consumes: `helpHref: "/help/errors#RESYNC_QUALITY_REGRESSED"` (C3 catalog — `/help/errors#`, NOT parse-warnings; see plan-review R2 + the `_metaErrorCatalogDocs` target-class rule).
- Produces: the help-anchor `_families` / `_metaErrorCatalogDocs` CI checks pass.

- [ ] **Step 1: Run the help-families / error-catalog-docs checks**

Run: `rg -n "RESYNC_SHRINK_HELD" app/help lib/help components/help docs 2>/dev/null` to locate how `RESYNC_SHRINK_HELD`'s `/help/errors#RESYNC_SHRINK_HELD` anchor is satisfied (C mirrors that family). Then run: `pnpm vitest run tests/messages/_metaErrorCatalogDocs.test.ts $(rg -l "helpHref|_families|/help/errors" tests | head -20)`.
Expected: confirms the target-class rule (parse-warnings anchors are `WARN_`/`PARSE_`-only; `/help/errors#` is correct for C) and whether `RESYNC_QUALITY_REGRESSED` needs a help-page section.

- [ ] **Step 2: Add the anchor content only if required**

If a families/anchor-existence check fails, add a `RESYNC_QUALITY_REGRESSED` section to the same `/help/errors` page that hosts `RESYNC_SHRINK_HELD` (mirror its entry). If the check derives anchors from the catalog automatically, no edit needed. **If this touches any file under `app/` or `components/`, invariant 8 (impeccable dual-gate) applies** — run `/impeccable critique` + `/impeccable audit` on the diff. (Expected: help content is data/MDX, not a UI component — confirm; `RESYNC_SHRINK_HELD` shipped without an `app/` change, so C likely does too.)

- [ ] **Step 3: Commit (only if a change was needed)**

```bash
git add <help files>
git commit --no-verify -m "docs(help): add RESYNC_QUALITY_REGRESSED /help/errors anchor"
```

---

## Task Z: Full-suite verification + close-out gates

**Files:** none (verification).

- [ ] **Step 1: Full test suite**

Run: `pnpm test`
Expected: PASS. Triage any failure env/psql-only (branch-vs-shared-DB) vs real (`feedback_full_suite_before_push_scoped_gates_miss_regressions`).

- [ ] **Step 2: Typecheck + lint + format**

Run: `pnpm typecheck && pnpm lint && pnpm format:check`
Expected: all PASS. (`pnpm lint` = eslint incl. `better-tailwindcss/enforce-canonical-classes`; `format:check` catches the `--no-verify` prettier bypass.)

- [ ] **Step 3: Meta-test sweep (structural regressions)**

Run: `pnpm vitest run tests/messages/ tests/parser/ tests/sync/`
Expected: PASS — confirms the alert-registry, catalog-parity, comparator, and lifecycle gates are all green together.

- [ ] **Step 4: Confirm no migration / no UI drift**

Run: `git diff --stat main...HEAD -- 'supabase/migrations/**' 'app/**' 'components/**'`
Expected: EMPTY for `supabase/migrations/**` (migration-free). If `app/`/`components/` shows changes (only possible via C6 help), invariant 8 impeccable dual-gate must have run.

- [ ] **Step 5: Commit any final fixups, then Stage 4 (close-out) — whole-diff Codex review → CI green → merge.**

---

## Self-Review (writing-plans checklist — completed inline)

**Spec coverage:** A §4 → Task A. B §5 → Task B. C comparators §6.3 → C1; read-path §6.5/§7.16b → C2; §12.4 lockstep §7.1-5 → C3; registry/meta rows §7.6-11c → C4; producer + lifecycle §6.2/§6.4/§6.4a → C5; help §7.15 → C6; full suite §7.17 → Task Z. Delivery (feed + ping) §11 → C5 step 1 case 9 + the code-agnostic insert trigger (verified on HEAD, no new code). Migration parity §10 → Task Z step 4. All spec sections mapped.

**Placeholder scan:** producer code, comparator code, catalog entry, test skeletons all carry real content. The `// Act`/`// Assert` comment stubs in B/C5 test steps are intentional harness-binding points (the real `runPhase1`/fake-tx fixture shape must be read from existing `tests/sync/`), each with the exact assertions enumerated — not vague "write tests."

**Type consistency:** `DataGapsSummary`, `GapCode`, `summarizeDataGaps`, `isQualityRegression`, `hasRecoveredToBaseline`, `priorParseWarningsRaw`, `evaluateQualityRegression_unlocked`, `resolveQualityRegression_unlocked`, `requireTxBoundUpsertAdminAlert`, `AdminAlertCode` used consistently across tasks; producer consumes exactly what C1/C2 produce.

**Meta-test inventory (declared):** EXTENDS `adminAlertsRegistry.ts`, `_metaAlertAudienceContract`, `adminSurface`, `_metaAlertActionsContract`, `_metaAdminAlertCatalog`, `tests/cross-cutting/codes.test.ts` (x1), the x2 enums gate, `AUTO_RESOLVE_NOTES`, parser completeness. CREATES none.

**Advisory-lock topology (declared):** C raise/resolve tx-bound inside existing `withShowLock` tx (mirrors `PARSE_ERROR_LAST_GOOD`/`RESYNC_SHRINK_HELD`); `resolveQualityRegression_unlocked` acquires no `pg_advisory*`; single-holder unchanged. A outside any lock. No new holder, no nesting.
