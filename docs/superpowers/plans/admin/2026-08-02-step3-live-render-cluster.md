# Step-3 Live-Render Cluster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three-item Step-3 cluster — six-variant seeded state gallery + impeccable dual-gate on the live `/admin?step=3` render, agenda-wrapper harness fidelity (Option A), and the NUL-byte hygiene fix — per the APPROVED spec `docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md` (Codex R4 APPROVE, commit `cc4cb7bff`).

**Architecture:** Mechanical extraction of the Step-3 row assembly into an exported pure function (`assembleStep3Row`) gives the gallery test the real executable seam; the e2e seed helper gains per-variant options and a six-row gallery under the existing per-show advisory-lock wrapper; the agenda containment assertions move from hand-transcribed chrome onto the real modal tree via a new esbuild live-entry + spec; the NUL byte flips to its escape spelling behind a red-first guard in the existing deletion-safety walker.

**Tech Stack:** Next.js 16 / React 19, Supabase (local 54322), vitest (serial DB project), Playwright (desktop-chromium + standalone configs), esbuild IIFE bundle harness, psql advisory-lock transport.

## Global Constraints

- Spec is canonical: `docs/superpowers/specs/admin/2026-08-02-step3-live-render-cluster-design.md` (R4 APPROVED). §1.1 do-not-relitigate table binds implementation too.
- TDD per task (invariant 1): red test → minimal impl → green → commit. Test and its implementation land in the SAME task commit (spec §6).
- Advisory lock (invariant 2): every seed-path mutation of `pending_syncs`, `onboarding_scan_manifest`, `pending_ingestions` runs inside `runLockedSql` holding `pg_advisory_xact_lock(hashtext('show:' || drive_file_id))`. Single holder = the JS-side wrapper; no RPC/nested holder exists on this path.
- Supabase call-boundary (invariant 9): every client call destructures `{ data, error }`.
- No new mutation surfaces (invariant 10 N/A — test helpers only, no routes/actions).
- Impeccable gate (invariant 8): dual-gate before whole-diff review; marker line lives in THIS plan's §12; P0 fixed inline, P1+ → DEFERRED.md (spec §1.1).
- Copy rules: no em-dash in user-visible copy; seed titles are plain ASCII.
- Commit style: conventional commits, one commit per task.

## Meta-test inventory (mandatory declaration)

- **EXTENDS** `tests/admin/step3DeletionSafety.test.ts` — new no-raw-NUL assertion (Task 3).
- **EXTENDS** `tests/ci/_metaE2eWorkflowCoverage.test.ts` — row swap: deleted `agendaBreakdown.layout.spec.ts` out, new step3-review-modal.agenda.spec.ts (new) covered via standalone unfiltered run (Task 5).
- **Advisory-lock topology:** `tests/auth/advisoryLockRpcDeadlock.test.ts` NOT extended — the seed path has exactly one holder (JS-side `runLockedSql`) and no RPC layer; nothing to pin beyond the behavioral lock-held assertion in Task 2. Declared per writing-plans rule.
- No other registry applies: no auth helper changes (`_metaInfraContract`), no admin_alerts writes, no tile sentinels.

## e2e harness-readiness (mandatory declaration)

- **Boot:** the new agenda spec self-hosts like `step3-review-modal.interactions.spec.ts` — esbuild IIFE bundle built out-of-process (`pnpm dlx esbuild@0.28.0` via `_step3ReviewModalBundle.mjs`), tailwind CSS compiled from `app/globals.css`, served over `node:http`. No app server, no DB.
- **Readiness gate:** assertions wait for the agenda block's `ready` state (the stubbed extract POST resolves; `step3ReviewSections.tsx:3394` sets it) via `expect(...).toPass()` on a `ready`-state marker before any measurement — never `networkidle`.
- **Detach-safety:** all rect/scroll measurements run inside `toPass` blocks over fresh locators; no cached `locator.evaluate` handle outlives a render.

---

### Task 1: Extract `assembleStep3Row` (mechanical, zero behavior)

**Files:**
- Create: lib/admin/assembleStep3Row.ts (new)
- Create: tests/admin/assembleStep3Row.test.ts (new)
- Modify: `components/admin/OnboardingWizard.tsx` (the `buildStep3Row` definition at `components/admin/OnboardingWizard.tsx:285-392` and the assembly loop body `components/admin/OnboardingWizard.tsx:598-648` move out; the loop calls the new export)

**Interfaces:**
- Produces: `assembleStep3Row(manifest: ManifestRowForBuild, pending: PendingSyncRowForBuild | null, candidates: CandidateShow[], staged: StagedEnrichment | undefined, ingestion: { id: string; code: string | null } | undefined, wizardSessionId: string): Step3Row` — the FULL per-row assembly: `buildStep3Row` + clean-row parse/title enrichment (`isCleanReviewRow` branch, ex-`components/admin/OnboardingWizard.tsx:616`) + hard-fail ingestion enrichment (ex-`components/admin/OnboardingWizard.tsx:641`). Exact input type names copied from `OnboardingWizard.tsx` during the move (they are defined adjacent to `buildStep3Row`; move them too if not exported).
- Consumed by: Task 2's gallery test; `OnboardingWizard.tsx`'s `fetchStep3Data` loop.

- [ ] **Step 1: Write the failing test** — tests/admin/assembleStep3Row.test.ts (new), pure unit (no DB): three fixture rows exercising the three branches. Concrete failure mode caught: enrichment logic diverging from the pre-extraction behavior (parse attached to a non-clean row, ingestion id attached without `hard_failed`).

```ts
import { describe, expect, test } from "vitest";
import { assembleStep3Row } from "@/lib/admin/assembleStep3Row";

const mani = (over: Record<string, unknown>) => ({
  drive_file_id: "dfid-1",
  status: "staged",
  name: "Mani Name",
  publish_intent: null,
  created_show_id: null,
  wizard_session_id: "00000000-0000-0000-0000-000000000001",
  ...over,
});

describe("assembleStep3Row (mechanical extraction of the OnboardingWizard loop body)", () => {
  test("clean staged row gets parseResult + stagedShowTitle enrichment", () => {
    const staged = {
      parseResult: { show: { title: "Parsed Title" }, warnings: [] },
      sourceAnchors: null, adminAgendaPreview: [], agendaStateKey: "k",
      useRawDecisions: [], title: "Parsed Title",
    };
    const row = assembleStep3Row(mani({}), null, [], staged, undefined, "s1");
    expect(row.parseResult).toBe(staged.parseResult);
    expect(row.stagedShowTitle).toBe("Parsed Title");
  });
  test("hard_failed row gets pendingIngestionId + errorCode", () => {
    const row = assembleStep3Row(
      mani({ status: "hard_failed" }), null, [], undefined,
      { id: "ing-1", code: "STAGED_PARSE_FAILED" }, "s1",
    );
    expect(row.pendingIngestionId).toBe("ing-1");
    expect(row.errorCode).toBe("STAGED_PARSE_FAILED");
  });
  test("hard_failed row WITHOUT ingestion stays bare (no phantom controls)", () => {
    const row = assembleStep3Row(mani({ status: "hard_failed" }), null, [], undefined, undefined, "s1");
    expect(row.pendingIngestionId).toBeUndefined();
  });
});
```

(Field/param names above are the drafting-time shape; Step 3 copies the REAL signatures verbatim during the move — if a name differs, the test is corrected to the moved code's names in the same commit, keeping the assertions' semantics.)

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run tests/admin/assembleStep3Row.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Perform the move** — cut `buildStep3Row` + its input types + the loop-body enrichment branches from `OnboardingWizard.tsx` into lib/admin/assembleStep3Row.ts (new) (server-safe module: no React imports; `isCleanReviewRow` moves or is imported from its current home — verify with grep at move time). The wizard loop becomes `assembleStep3Row(...)` per row. NO logic edits — verbatim relocation.
- [ ] **Step 4: Verify green + no behavior drift** — `pnpm exec vitest run tests/admin/assembleStep3Row.test.ts` PASS; then `pnpm exec vitest run tests/admin/ tests/components/admin/wizard/ 2>&1 | tail -5` — all pre-existing suites stay green (behavior pin).
- [ ] **Step 5: Typecheck** — `pnpm exec tsc --noEmit`. Expected: clean.
- [ ] **Step 6: Commit** — `refactor(admin): extract assembleStep3Row (row build + enrichment) for the gallery test seam`

### Task 2: Seed gallery + lock unification + matrix test

**Files:**
- Modify: `tests/e2e/helpers/devCaptureStaged.ts`
- Create: tests/admin/step3StateGallery.test.ts (new) (DB-backed, serial project)

**Interfaces:**
- Produces: `seedStagedRow(options?: SeedStagedRowOptions): Promise<string>` (backward-compatible — zero-arg call unchanged); `seedStep3StateGallery(): Promise<{ sessionId: string; rows: Array<{ driveFileId: string; variant: GalleryVariant }> }>`; `cleanupStep3StateGallery(rows): Promise<void>`; `type GalleryVariant = "ready" | "needs_a_look" | "demoted_rescan" | "no_details" | "blocking" | "set_aside"`.
- Consumes: Task 1's `assembleStep3Row`.

- [ ] **Step 1: Write the failing gallery test** — tests/admin/step3StateGallery.test.ts (new). Concrete failure modes caught: a variant deriving the wrong display state (matrix drift vs `deriveStep3DisplayState`); manifest/ingestion mutations escaping the advisory lock; warn-card variant not registering a gap.

```ts
import { describe, expect, test, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import {
  seedStep3StateGallery,
  cleanupStep3StateGallery,
  type GalleryRow,
} from "../e2e/helpers/devCaptureStaged";
import { assembleStep3Row } from "@/lib/admin/assembleStep3Row";
import { deriveStep3DisplayState } from "@/lib/admin/step3DisplayState";
import { nonAmbiguityGapTotal } from "@/lib/admin/step3Buckets";

const EXPECTED: Record<string, string> = {
  ready: "ready",
  needs_a_look: "ready", // warn-card variant of ready (spec §1.1)
  demoted_rescan: "needs_review_reapply",
  no_details: "needs_review_no_details",
  blocking: "needs_review_other",
  set_aside: "set_aside",
};

let seeded: { sessionId: string; rows: GalleryRow[] };
beforeAll(async () => { seeded = await seedStep3StateGallery(); });
afterAll(async () => { await cleanupStep3StateGallery(seeded.rows); });

test("six variants derive the matrix's states through the real assembly path", async () => {
  // Read back EXACTLY what production reads (manifest + pending + ingestion),
  // assemble via the real exported seam, and check the matrix literals.
  for (const row of seeded.rows) {
    const assembled = await assembleFromDb(row); // helper below: queries the three tables, calls assembleStep3Row
    expect(deriveStep3DisplayState(inputsOf(assembled)), row.variant).toBe(EXPECTED[row.variant]);
    if (row.variant === "needs_a_look") expect(nonAmbiguityGapTotal(assembled)).toBeGreaterThan(0);
    if (row.variant === "blocking") {
      expect(assembled.pendingIngestionId).toBeTruthy();
      expect(assembled.errorCode).toBe("STAGED_PARSE_FAILED");
    }
  }
  const titles = seeded.rows.slice(0, 3).map((r) => titleOf(r));
  expect(new Set(titles).size).toBe(3); // variants 1-3 distinct parsed titles
});

test("seed mutations hold the per-show advisory lock (behavioral, advisory-lock.test.ts:50 pattern)", async () => {
  // seedStagedRow gains a test-only onMutating hook: while the seed's psql tx
  // holds the lock, a second pg connection's try-lock on the same key fails.
  const probe = new Client({ connectionString: process.env.TEST_DATABASE_URL });
  await probe.connect();
  try {
    await seedOneVariantWithHook(async (driveFileId) => {
      const { rows } = await probe.query(
        "select pg_try_advisory_xact_lock(hashtext('show:' || $1)) as got",
        [driveFileId],
      );
      expect(rows[0].got).toBe(false); // holder is live during DML
    });
  } finally { await probe.end(); }
});
```

The `assembleFromDb` / `inputsOf` / `titleOf` / `seedOneVariantWithHook` helpers are written in this task with `{ data, error }` destructuring on every Supabase read (invariant 9); `seedOneVariantWithHook` wraps the variant seed with a callback invoked between lock acquisition and commit (the seed helper's psql transport gains an optional `midTransactionProbe` seam for exactly this — implemented as a `pg_sleep`-free two-phase: open tx via `pg` client instead of one-shot psql for the hooked path).

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run tests/admin/step3StateGallery.test.ts`. Expected: FAIL (`seedStep3StateGallery` not exported).
- [ ] **Step 3: Implement the seed extension** — in `devCaptureStaged.ts`:
  - `SeedStagedRowOptions = { variant?: GalleryVariant; sessionId?: string; title?: string; name?: string }` with the variant switch writing exactly the spec §2.3 matrix: `manifestStatus` (`staged` | `hard_failed` | `permanent_ignore`), `last_finalize_failure_code` (null | `RESCAN_REVIEW_REQUIRED` | `STAGED_PARSE_REVISION_RACE_DURING_FINALIZE`), `parse_result` (well-formed with per-variant title + for `needs_a_look` a `warnings: [{ code: "FIELD_UNREADABLE", severity: "warn", message: "Seeded gap warning", ... }]` entry shaped per `ParseWarning` — copy the exact required fields from `lib/parser/types.ts` at implementation time | `'{}'::jsonb` for `no_details`).
  - Variant `blocking` additionally inserts `pending_ingestions` (`drive_file_id`, `wizard_session_id` = gallery session, `drive_file_name` = the row name, `last_error_code: 'STAGED_PARSE_FAILED'`, `last_error_message: 'Seeded hard fail'`) INSIDE the same `runLockedSql` transaction, and cleanup deletes it there too.
  - **Lock unification:** the `onboarding_scan_manifest` insert (`tests/e2e/helpers/devCaptureStaged.ts:132`) and delete (`tests/e2e/helpers/devCaptureStaged.ts:176-177`) move from PostgREST into the `runLockedSql` SQL bodies (same transaction as the `pending_syncs` DML). The PostgREST manifest calls are deleted.
  - `seedStep3StateGallery` seeds all six variants into ONE session (one `assertWizardSettings` call), distinct `drive_file_id` per row, titles `Gallery Ready` / `Gallery Needs A Look` / `Gallery Demoted` and names `Gallery No Details` / `Gallery Blocking` / `Gallery Set Aside`.
- [ ] **Step 4: Run to verify green** — `pnpm exec vitest run tests/admin/step3StateGallery.test.ts` PASS; existing `dev-capture` consumers unbroken: `pnpm exec tsc --noEmit`.
- [ ] **Step 5: Verify serial-project membership** — `pnpm exec vitest list --project serial 2>/dev/null | grep step3StateGallery` (exact project flag per `vitest.projects.ts` — verify the project name at implementation time; the test MUST run in the DB-serial project, not parallel).
- [ ] **Step 6: Commit** — `test(admin): six-variant step3 state gallery seed + matrix test + advisory-lock unification`

### Task 3: NUL guard + byte fix (one commit)

**Files:**
- Modify: `tests/admin/step3DeletionSafety.test.ts` (walker already reads the file; the `tests/admin/step3DeletionSafety.test.ts:48` area comment documents the NUL)
- Modify: `components/admin/wizard/Step3Review.tsx` (offset 53571, `uncheckedCleanNames.join`)

- [ ] **Step 1: Write the failing assertion** — append to the existing describe block:

```ts
test("no scanned source file contains a raw NUL byte (BL-SOURCE-NUL-BYTE-STEP3REVIEW)", () => {
  const offenders = SOURCES.filter(({ src }) => src.includes("\u0000")).map(({ path }) => path);
  expect(offenders).toEqual([]);
});
```

Concrete failure mode caught: any future raw control byte landing in source and silently blinding `rg`-based sweeps.

- [ ] **Step 2: Run to verify it fails** — `pnpm exec vitest run tests/admin/step3DeletionSafety.test.ts`. Expected: FAIL listing `components/admin/wizard/Step3Review.tsx`.
- [ ] **Step 3: Flip the byte** — python one-liner replacing the single `\x00` byte with the six characters backslash-u-0000 (`\u0000`) inside the string literal at the `join` site; then update the walker's stale comment (`readFileSync, never a shelled-out grep: …carries a raw NUL byte` → past tense, guard reference).
- [ ] **Step 4: Verify** — test PASS; `file components/admin/wizard/Step3Review.tsx` reports a text type; `pnpm exec tsc --noEmit` clean (string literal identical at runtime).
- [ ] **Step 5: Commit** — `fix(admin): spell Step3Review NUL delimiter as escape; guard raw NUL bytes in the deletion-safety walker`

### Task 4: Agenda real-wrapper spec + harness override + routing

**Files:**
- Modify: `tests/e2e/_step3ReviewModalHarness.tsx` (`buildSectionData` third param)
- Create: tests/e2e/_step3ReviewModalAgendaEntry.tsx (new)
- Create: tests/e2e/step3-review-modal.agenda.spec.ts (new)
- Modify: `playwright.config.ts` (desktop-chromium `testMatch` — add the regex alternative step3-review-modal(dot)agenda)
- Modify: `tests/e2e/standalone.config.ts` (`testMatch` — add the regex alternative step3-review-modal(dot)agenda)
- Modify: `.github/workflows/step3-live-bundle.yml` (positional file list at `.github/workflows/step3-live-bundle.yml:70`; `pull_request.paths` at `.github/workflows/step3-live-bundle.yml:18-29` gains the entry, the spec, `components/crew/AgendaScheduleBlock.tsx`, `app/globals.css`, `tests/e2e/_agendaFixture.ts`)
- Modify: `tests/e2e/standalone-baseline.json` (new spec row)

**Interfaces:**
- Consumes: `AGENDA_DAYS` + `LONG_TITLE` from `tests/e2e/_agendaFixture.ts` (88-char token); `buildSectionData(prOverrides?, showOverrides?, agendaBaseline?)`.
- Produces: the containment spec later referenced by Task 5's re-home claim.

- [ ] **Step 1: Extend `buildSectionData`** — third optional param `agendaBaseline: AdminAgendaItem[] = []`, passed through at the `tests/e2e/_step3ReviewModalHarness.tsx:158` call site (replacing the hardcoded `[]`). Existing callers compile unchanged (`pnpm exec tsc --noEmit`).
- [ ] **Step 2: Write the failing spec** — step3-review-modal.agenda.spec.ts (new), boot pattern copied from `step3-review-modal.interactions.spec.ts` (esbuild via `_step3ReviewModalBundle.mjs`, tailwind CSS from `app/globals.css`, `node:http` serve). Fixture: one `AdminAgendaItem` whose `block.fullExtraction` embeds `AGENDA_DAYS` (row 0 carries `LONG_TITLE` as a session title). The entry stubs `window.fetch` for the extract POST route (exact route string read from `step3ReviewSections.tsx:3374` at implementation time) returning `{ ok: true }` payload carrying the same extraction, so the block reaches `ready`. Assertions (all inside `toPass`, after a `ready`-marker gate):

```ts
for (const width of [320, 390, 720]) {
  await page.setViewportSize({ width, height: 900 });
  await expect(async () => {
    const li = page.locator('[data-agenda-item-row] >> nth=0'); // exact hook read from step3ReviewSections.tsx:3239 wrapper at impl time
    const box = await li.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(width);
    const overflow = await page.evaluate(() => {
      const list = document.querySelector("[data-agenda-list]") ?? document.body;
      return list.scrollWidth - list.clientWidth;
    });
    expect(overflow).toBe(0);
    const title = page.getByText(/AdaptingToUnpredictability/);
    const tbox = await title.boundingBox();
    expect(tbox!.height).toBeGreaterThan(20); // wrapped to >1 line at 320/390; derived: single-line height <20px at text-sm
  }).toPass();
}
```

(Selectors: use the REAL attributes/classes present at `step3ReviewSections.tsx:3239`; if no `data-*` hook exists, scope by the `li.min-w-0` class chain within the agenda section — never a page-global scan. The wrapped-height expectation is derived at impl time from the measured single-line height, not hardcoded 20.) Concrete failure mode caught: real modal chrome losing `min-w-0`/`wrap-break-word` so an unbroken token widens the card — the exact regression the hand-written harness could not see.

- [ ] **Step 3: Run to verify it fails usefully** — `node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts tests/e2e/step3-review-modal.agenda.spec.ts`. Expected: FAIL (entry file missing) — proving routing executes the spec.
- [ ] **Step 4: Write the entry** — _step3ReviewModalAgendaEntry.tsx (new) per `_step3ReviewModalLiveEntry.tsx:124` pattern (createElement, no JSX; fetch stub for the extract route; renders the modal with `buildSectionData({}, {}, agendaFixtureBaseline)`).
- [ ] **Step 5: Wire routing (all three layers + baseline)** — playwright.config regex, standalone.config regex, workflow positional list + paths, standalone-baseline.json row.
- [ ] **Step 6: Run green locally** — same command PASS, 3 viewports.
- [ ] **Step 7: Typecheck + commit** — `pnpm exec tsc --noEmit`; `test(e2e): agenda real-wrapper containment spec on the live modal tree (agendaBaseline override + entry + routing)`

### Task 5: Delete transcribed chrome spec + reconcile consumers

**Files:**
- Delete: `tests/e2e/agendaBreakdown.layout.spec.ts`
- Modify: `tests/e2e/standalone.config.ts:86` (remove the agendaBreakdown(dot)layout regex alternative)
- Modify: `tests/e2e/standalone-baseline.json:3` (remove its row)
- Modify: `package.json:55` (remove/replace the script reference)
- Modify: `tests/ci/_metaE2eWorkflowCoverage.test.ts:193` (remove its row)
- Modify: `tests/e2e/_agendaFixture.ts:9` (re-point the doc comment at the new spec)
- Modify: `tests/e2e/pendingDiscardReflow.layout.spec.ts:23` (update cross-reference comment)

- [ ] **Step 1: Red first** — run `pnpm exec vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` AFTER deleting the spec file but BEFORE reconciling: expected FAIL (dangling row) — proves the meta-test actually guards the registry.
- [ ] **Step 2: Reconcile all six consumers** per the table above.
- [ ] **Step 3: Oracle** — run and paste output into the commit body:

```bash
rg -l "agendaBreakdown\.layout" --glob '!docs/**' # expected: no matches
```

- [ ] **Step 4: Green** — `pnpm exec vitest run tests/ci/_metaE2eWorkflowCoverage.test.ts` PASS; standalone config still parses (`node_modules/.bin/playwright test --config tests/e2e/standalone.config.ts --list | head -3`).
- [ ] **Step 5: Commit** — `test(e2e): retire hand-transcribed agendaBreakdown.layout spec; assertions re-homed on the real wrapper`

### Task 6: Impeccable dual-gate on the live gallery render

**Files:** none prescribed (findings drive any P0 fix); artifacts: screenshots + this plan's §12.

- [ ] **Step 1:** Boot the app (dev server per `pnpm dev`, port per repo default), seed via `seedStep3StateGallery()` (small driver script under the scratchpad), sign in, open `/admin?step=3` — verify all six card variants render (ready / warn-card / demoted RESCAN with RescanReviewBanner + Review / no-details inline controls / blocking with HardFailedActions + HelpAffordance / set-aside).
- [ ] **Step 2:** Run `/impeccable critique` with canonical v3 setup gates (context.mjs → register read); both themes, mobile + desktop widths; explicit checks: dark-mode warn-contrast on the warn card; demoted double-"Review" renders correctly (intentionality ratified — spec §1.1).
- [ ] **Step 3:** Run `/impeccable audit` same setup.
- [ ] **Step 4:** Disposition findings — P0 fixed inline (re-run affected gate half per fix), P1+ → DEFERRED.md entries with trigger; record ALL findings + dispositions in §12 below.
- [ ] **Step 5:** Commit any fixes per-finding (`fix(admin): <finding>`) + `docs(plan): record impeccable dual-gate findings + marker` — this commit fills the RAN-form marker in §12 AND deletes this plan's `MARKER_TEMPLATE_FILES` row (see §12 note); `pnpm exec vitest run tests/docs/` green.

### Task 7: Graduations + closeout

**Files:**
- Modify: `BACKLOG.md` (remove the three entries; update the head reconciliation note)
- Modify: `BACKLOG-archive.md` (add the three entries with provenance)
- Modify: this plan (§12 marker line finalized)

- [ ] **Step 1:** Move `BL-STEP3-IMPECCABLE-LIVE-RENDER`, `BL-SOURCE-NUL-BYTE-STEP3REVIEW`, `BL-AGENDA-ADMIN-WRAPPER-HARNESS-FIDELITY` to `BACKLOG-archive.md` with provenance lines (branch, spec path, what shipped).
- [ ] **Step 2:** `pnpm exec vitest run tests/docs/` — graduation meta-test + ledger guards green.
- [ ] **Step 3:** Commit — `docs(backlog): graduate the three step3 live-render cluster entries`

### Final verification (pipeline, not plan-task)

- [ ] Full local suite green (`pnpm test` per repo scripts), `pnpm exec tsc --noEmit`.
- [ ] Whole-diff Codex review APPROVE (split tight-scope briefs if the diff is large).
- [ ] Push → PR → real CI green (all required contexts) → `gh pr merge --merge` → ff main → `git rev-list --left-right --count main...origin/main` = `0  0`.

---

## 12. Impeccable gate closeout (filled at Task 6)

impeccable-gate: critique=<RAN|RAN-DEGRADED> audit=<RAN|RAN-DEGRADED> p0=<int> p1=<int> dispositions=<recorded|none>

TEMPLATE form is legal only for `MARKER_TEMPLATE_FILES` rows (`tests/docs/_metaInvariant8Closeout.test.ts:26`; grammar `docs/superpowers/specs/2026-08-01-invariant8-closeout-enforcement-design.md:54`, §4.5). The commit that lands THIS plan document therefore also adds this file's row to `MARKER_TEMPLATE_FILES`; Task 6 Step 5 replaces the line above with the filled RAN form AND removes the registry row in the same commit. Findings and dispositions land here.
