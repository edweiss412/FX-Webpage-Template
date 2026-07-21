# Plan re-review B - TASKS 9-13

## Your role: REVIEWER ONLY

Do not fix, do not propose patches, do not imply changes you will make. Surface findings only. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## What this is

An implementation plan for a DEV-ONLY instrument in a Next.js 16 + Supabase admin app. It renders every alert/warning state of an admin "show modal" without waiting for live data to raise the row. One catalog of storable scenario rows feeds two consumers: a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase so the real modal shows the state for real).

The SPEC it implements is already APPROVED after five review rounds. Do NOT re-review the design. Review the PLAN: whether an engineer with no context could execute these tasks and land correct, tested code.

## Settled design decisions - do NOT relitigate

- Materialize accepts tier-3 scenarios only; tiers 1 and 2 are gallery-only.
- Apply replaces alerts and holds (tag-scoped) except collision skips, which leave the AUTHENTIC row untouched; warnings are declared-only and do not reconcile across scenarios.
- Warnings are never written on validation, because validation Clear cannot regenerate them.
- Environments gate on the URL the client actually uses: local must be loopback; validation must satisfy projectRefFromUrl(url) === VALIDATION_PROJECT_REF.
- Gallery action controls render but are neutralized by a capture-phase submit listener, NOT by `inert`.
- Bucketing runs on the server and returns pre-rendered ReactNode arrays, not items.
- Catalog COVERAGE is deliberately not gated; catalog VALIDITY is, via an executable validator.
- No migration, no new advisory-lock holder.

## Binding project rules for plans

- TDD per task: failing test, minimal implementation, passing test, commit.
- No placeholders. Every step that changes code shows the code. "Add appropriate error handling" is a plan failure.
- Every test task states the concrete failure mode it catches; a test that only proves "the function was called" is too weak.
- Anti-tautology: assert against the data source, not a container that renders it; derive expected values from fixtures rather than hardcoding; exercise null/zero/NaN/out-of-range.
- Snippets must typecheck under strict TS (noUncheckedIndexedAccess, exactOptionalPropertyTypes).
- Types, function names, and signatures used in later tasks must match what earlier tasks define.

## What I need

Judge executability and correctness. Highest value: a task whose steps cannot actually be followed; a test that would pass while the bug it names is present; a signature mismatch between tasks; a spec requirement with no task; a step that would not compile.

If a section is sound, say so and APPROVE. Do NOT manufacture findings.

## Output format

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <task/step> - <why it fails, concretely>`.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`
`VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## THIS IS A RE-REVIEW OF REWRITTEN TASKS

The prior round returned 23 findings across these tasks, all of one class: code-changing steps showing prose instead of code, and tests too weak to catch what the step claimed. The tasks below were rewritten comprehensively in response. Specifically repaired:

- Every code-changing step now shows code. "Implement the matrix", "Implement the page", "Implement and verify", "Fix whatever they surface" are gone.
- Cross-task interfaces are fully specified with discriminated unions (EnvInput, RefusalCode, EnvResolution, WriteStep, PlanRefusal, WritePlan, MaterializeResult, ScenarioBlockProps).
- Vacuous assertions replaced: tier 3 asserts a declared id list plus a minimum count; scenarioById gets a hit AND a miss; ScenarioBlock covers grouped rendering, the hold group, and both warning skins plus the null boundary.
- parseGalleryParams moved out of page.tsx (Next permits only recognized route exports).
- The FILES meta-test parses the FILES array literal instead of using script.includes(), which would match a path inside a comment.
- Telemetry emission is now explicitly wired in Task 12; Task 13 separates zero-write failure (emit nothing) from post-commit partial (emit once).
- The enabled-artifact assertion now has a red phase.
- Task 16 uses the existing dev-build Playwright project on port 3001 and adds the spec to its explicit testMatch allow-list.
- Task 17's handoff record has a real path and a commit.

Judge the REWRITE. Report anything still not executable, any test that would pass while the bug it names is present, and any defect the rewrite introduced.

## ARTIFACT

### Task 9: The gallery route

Spec §4.1, §4.5.

**Files:**

- Create: `app/admin/dev/attention-gallery/page.tsx (new)`, `app/admin/dev/attention-gallery/params.ts (new)`
- Test: `tests/app/admin/attentionGalleryParams.test.ts (new)`, `tests/app/admin/attentionGalleryRender.test.tsx (new)`

**Interfaces:**

- Consumes: `ALL_SCENARIOS`, `scenarioById` (Task 7); `ScenarioBlock` (Task 8).
- Produces: `parseGalleryParams` from `params.ts (new)`, and `buildBlockProps(scenario, maxWidthPx): ScenarioBlockProps` from `app/admin/dev/attention-gallery/buildBlockProps.ts (new)` — extracted so the render path is unit-testable without booting a route.

- [ ] **Step 1: Write the failing params test**

```ts
// tests/app/admin/attentionGalleryParams.test.ts
import { describe, expect, test } from "vitest";
import { parseGalleryParams } from "@/app/admin/dev/attention-gallery/params";

describe("parseGalleryParams", () => {
  test("scenario wins over tier, even across tiers", () => {
    const p = parseGalleryParams({ tier: "1", scenario: "t2-single" });
    expect(p.scenarioId).toBe("t2-single");
  });
  test("an array param takes its first value", () => {
    expect(parseGalleryParams({ tier: ["2", "1"] }).tier).toBe(2);
  });
  test("an empty array is absent", () => {
    expect(parseGalleryParams({ tier: [] }).tier).toBeNull();
  });
  test("w accepts digits only and clamps into range", () => {
    expect(parseGalleryParams({ w: "390" }).maxWidthPx).toBe(390);
    expect(parseGalleryParams({ w: "100" }).maxWidthPx).toBe(320);
    expect(parseGalleryParams({ w: "9999" }).maxWidthPx).toBe(1280);
  });
  test("w rejects every non-digit form, falling back to null", () => {
    for (const v of ["", "   ", "-5", "3.5", "1e3", "NaN", "Infinity", "12px"]) {
      expect(parseGalleryParams({ w: v }).maxWidthPx, v).toBeNull();
    }
  });
  test("a digits-only value beyond MAX_SAFE_INTEGER is absent, not clamped", () => {
    expect(parseGalleryParams({ w: "9".repeat(25) }).maxWidthPx).toBeNull();
  });
  test("an unknown tier means all tiers", () => {
    expect(parseGalleryParams({ tier: "7" }).tier).toBeNull();
    expect(parseGalleryParams({ tier: "  " }).tier).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails.** Expected: cannot resolve `params`.

- [ ] **Step 3: Implement `params.ts (new)`**

```ts
// app/admin/dev/attention-gallery/params.ts
export type GalleryParams = {
  tier: 1 | 2 | 3 | null;
  scenarioId: string | null;
  maxWidthPx: number | null;
};

function first(v: string | string[] | undefined): string | null {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.length === 0 ? null : (v[0] ?? null);
  return v;
}

export function parseGalleryParams(
  sp: Record<string, string | string[] | undefined>,
): GalleryParams {
  const rawTier = first(sp.tier)?.trim() ?? "";
  const tier = rawTier === "1" ? 1 : rawTier === "2" ? 2 : rawTier === "3" ? 3 : null;

  const rawScenario = first(sp.scenario)?.trim() ?? "";
  const scenarioId = rawScenario.length > 0 ? rawScenario : null;

  const rawW = first(sp.w)?.trim() ?? "";
  let maxWidthPx: number | null = null;
  if (/^\d+$/.test(rawW)) {
    const n = Number.parseInt(rawW, 10);
    maxWidthPx = Number.isSafeInteger(n) ? Math.min(1280, Math.max(320, n)) : null;
  }
  return { tier, scenarioId, maxWidthPx };
}
```

- [ ] **Step 4: Write the failing render test**

```tsx
// tests/app/admin/attentionGalleryRender.test.tsx
import { describe, expect, test } from "vitest";
import { buildBlockProps } from "@/app/admin/dev/attention-gallery/buildBlockProps";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import { T2_ANCHOR_ABSENT, T2_OVERVIEW_ABSENT } from "@/lib/dev/attentionScenarios/tier2";

describe("buildBlockProps", () => {
  test("derives items and honors the scenario's bucket overrides", () => {
    const s = scenarioById(T2_ANCHOR_ABSENT)!;
    const props = buildBlockProps(s, null);
    expect(props.items.length).toBeGreaterThan(0);
    // anchorAvailable=false means the card lands at the section top, not the anchor
    expect(props.groups.some((g) => g.placement === "anchor")).toBe(false);
    expect(props.groups.some((g) => g.placement === "sectionTop")).toBe(true);
  });

  test("a dropped card still appears in items and the readout, with no group", () => {
    const props = buildBlockProps(scenarioById(T2_OVERVIEW_ABSENT)!, null);
    expect(props.items.length).toBeGreaterThan(0);
    expect(props.groups).toEqual([]);
    expect(props.readout.some((r) => /dropped/i.test(r.value))).toBe(true);
  });

  test("threads maxWidthPx through unchanged", () => {
    expect(buildBlockProps(scenarioById(T2_ANCHOR_ABSENT)!, 390).maxWidthPx).toBe(390);
  });
});
```

Failure mode caught: the route skipping derivation, ignoring bucket overrides, or flattening groups wrongly — none of which the params test can see.

- [ ] **Step 5: Implement `buildBlockProps.ts (new)` and `page.tsx`**

`buildBlockProps` calls `deriveAttentionItems`, then `bucketAttention` with `renderCard` returning `<AttentionBanner item={item} slug="gallery" now={FIXED_NOW} highlighted={false} onResolved={() => {}} />` and the scenario's predicates merged over always-true defaults, then flattens the `SectionAttention` map into `ScenarioGroup[]`, and builds the readout rows including `dropped: no available section` for any item absent from every bucket.

`page.tsx` exports only `default` and `dynamic`. It calls `requireDeveloper()` first, awaits `searchParams`, filters via `parseGalleryParams`, and renders the standing note plus one `ScenarioBlock` per scenario. An unknown `scenario` renders a line listing valid ids.

- [ ] **Step 6: Run both tests and typecheck**

Run: `pnpm vitest run tests/app/admin/attentionGalleryParams.test.ts tests/app/admin/attentionGalleryRender.test.tsx && pnpm typecheck`
Expected: PASS, then a clean typecheck. The typecheck matters here specifically: a stray named export from `page.tsx` fails Next's generated route types.

- [ ] **Step 7: Commit**

```bash
git add app/admin/dev/attention-gallery/ tests/app/admin/attentionGalleryParams.test.ts tests/app/admin/attentionGalleryRender.test.tsx
git commit -m "feat(dev): build-gated attention gallery route"
```

---

### Task 10: `FILES` registration and the membership meta-test

Spec §6, §6a.

**Files:**

- Modify: `scripts/with-admin-dev-flag.mjs:43-56`, `tests/admin/build-artifact-gate.test.ts`
- Create: `tests/admin/dev/filesMembership.test.ts (new)`

- [ ] **Step 1: Write the failing meta-test** — the code shown in the earlier version of this task, with the `filesArrayEntries` parser (not `script.includes`, which would match a path inside a comment and let the gate pass while the route is unregistered).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/admin/dev/filesMembership.test.ts`
Expected: FAIL, listing the new gallery page as unregistered.

- [ ] **Step 3: Add the enabled-flag artifact assertion FIRST, and watch it fail**

Add to `tests/admin/build-artifact-gate.test.ts` a case asserting that with `ADMIN_DEV_PANEL_ENABLED="true"` the built manifests **do** contain `/admin/dev/attention-gallery`.

Run: `RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts`
Expected: FAIL — the route is not in `FILES` yet, so the flag-enabled build does not restore it. This is the red phase; adding the assertion after registration would make it pass on arrival and prove nothing.

- [ ] **Step 4: Register the route** — add the gallery page path (quoted, matching the neighbouring entries) to the `FILES` array with a comment matching the existing entries' rationale.

- [ ] **Step 5: Run both to verify they pass**

Run: `pnpm vitest run tests/admin/dev/filesMembership.test.ts && RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts`
Expected: PASS. Record the second command's output in the handoff (Task 17) — it does not run in CI.

- [ ] **Step 6: Commit**

```bash
git add scripts/with-admin-dev-flag.mjs tests/admin/dev/filesMembership.test.ts tests/admin/build-artifact-gate.test.ts
git commit -m "feat(dev): FILES membership meta-test and gallery route registration"
```

---

### Task 11: Materialize environment gate and write planner

Spec §5.5, §5.3. Pure functions, no I/O.

**Files:**

- Create: `lib/dev/materialize/env.ts (new)`, `lib/dev/materialize/plan.ts (new)`
- Test: `tests/dev/materializeEnv.test.ts (new)`, `tests/dev/materializePlan.test.ts (new)`

**Interfaces** — fully specified so Task 12 needs to invent nothing:

```ts
// lib/dev/materialize/env.ts
export type TargetEnv = "local" | "validation";
export type EnvInput = {
  target: TargetEnv;
  confirmed: boolean;
  localUrl: string | undefined; // process.env.SUPABASE_URL
  localKey: string | undefined; // process.env.SUPABASE_SECRET_KEY
  validationUrl: string | undefined; // VALIDATION_SUPABASE_URL
  validationKey: string | undefined; // VALIDATION_SUPABASE_SECRET_KEY
  validationRef: string | undefined; // VALIDATION_SUPABASE_PROJECT_REF
};
export type RefusalCode =
  | "local_not_loopback"
  | "local_url_missing"
  | "local_key_missing"
  | "validation_unconfirmed"
  | "validation_triple_incomplete"
  | "validation_ref_mismatch"
  | "validation_ref_disagrees"
  | "unknown_target";
export type EnvResolution =
  | { kind: "ok"; url: string; key: string; target: TargetEnv }
  | { kind: "refused"; reason: RefusalCode };
export function resolveTarget(input: EnvInput): EnvResolution;

// lib/dev/materialize/plan.ts
export type WriteStep =
  | { step: "deleteTaggedAlerts" }
  | { step: "deleteTaggedHolds" }
  | { step: "insertAlerts"; codes: string[] }
  | { step: "insertHolds"; keys: Array<{ domain: string; entityKey: string }> }
  | { step: "writeWarnings"; count: number }
  | { step: "resync" };
export type PlanRefusal =
  | "slug_missing"
  | "show_archived"
  | "scenario_unknown"
  | "scenario_not_tier3"
  | "scenario_duplicate_alert_code"
  | "scenario_duplicate_hold_key"
  | "nothing_to_materialize";
export type WritePlan =
  | { kind: "ok"; steps: WriteStep[] }
  | { kind: "refused"; reason: PlanRefusal; detail: string | null };
export type ApplyOpts = { slug: string; archived: boolean; target: TargetEnv };
export type ClearOpts = { slug: string; target: TargetEnv };
export function planApply(scenario: AttentionScenario | undefined, opts: ApplyOpts): WritePlan;
export function planClear(opts: ClearOpts): WritePlan;
```

- [ ] **Step 1: Write the failing env test** — the R3a P0 regression suite: a `local` target whose URL is not loopback is refused with `local_not_loopback`; `127.0.0.1`, `localhost`, and `[::1]` all pass; a `validation` target whose URL-derived ref is not `VALIDATION_PROJECT_REF` is refused **even when `validationRef` carries the expected value**; a derived-vs-declared disagreement yields `validation_ref_disagrees`; an unparseable validation URL yields `validation_ref_mismatch` (a null derived ref never equals the constant); `confirmed: false` yields `validation_unconfirmed`.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `resolveTarget`** using `projectRefFromUrl` (`lib/admin/validationDeployment.ts:7`) and `VALIDATION_PROJECT_REF` (`lib/admin/validationDeployment.ts:1`). Loopback detection parses the URL and compares `hostname` against the three literals.
- [ ] **Step 4: Write the failing plan test** — every §5.3 Apply-only vs both-verb row; the environment-aware `nothing_to_materialize` rule (a warnings-only scenario is materializable on local, refused on validation); the warnings tri-state producing or omitting `writeWarnings`; `planClear` refusing nothing scenario-related and always emitting both deletes plus `resync` only on local.
- [ ] **Step 5: Implement and verify both.**
- [ ] **Step 6: Commit**

```bash
git add lib/dev/materialize/ tests/dev/materializeEnv.test.ts tests/dev/materializePlan.test.ts
git commit -m "feat(dev): materialize environment gate and pure write planner"
```

---

### Task 12: Materialize server actions

Spec §5.1, §5.2, §7.1, §7.5. Executes the Task 11 plan and emits its telemetry.

**Files:**

- Modify: `app/admin/dev/actions.ts`
- Test: `tests/dev/materializeActions.test.ts (new)`

**Interfaces:**

- Consumes: `resolveTarget`, `planApply`, `planClear`, and every type from Task 11.
- Produces: `applyAttentionScenario(input): Promise<MaterializeResult>`, `clearAttentionScenario(input): Promise<MaterializeResult>`, plus `applyAttentionScenarioFormAction(fd: FormData): Promise<void>` and `clearAttentionScenarioFormAction(fd: FormData)`.

```ts
export type Skip = { code: string; reason: "unresolved_row_present" | "hold_key_present" };
export type MaterializeResult =
  | {
      kind: "ok";
      alerts: number;
      holds: number;
      warnings: "written" | "untouched" | "skipped_validation";
      skipped: Skip[];
    }
  | {
      kind: "partial";
      committed: { alerts: number; holds: number };
      failedStep: string;
      message: string;
    }
  | { kind: "refused"; reason: string }
  | { kind: "infra_error"; message: string };
```

- [ ] **Step 1: Write the failing action test.** Cover, with the Supabase client mocked: the delete predicates issued (alerts by `context ? '__devScenario'`; holds by the **escaped** `LIKE '\_\_devScenario:%' ESCAPE '\'`); step order (deletes precede inserts); a colliding alert code producing a `Skip` rather than an insert; `warnings: "skipped_validation"` when the target is validation; a returned `{ error }` at each boundary yielding `infra_error` or `partial` with `failedStep` named; a thrown rejection doing the same; and — the telemetry contract — that `DEV_SCENARIO_APPLIED` is emitted on success and on `partial`, and **not** emitted when the first write fails.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement both actions.** `requireDeveloper()` first, then `resolveTarget`, then `planApply` / `planClear`, then execute each `WriteStep` in order against the resolved client, accumulating counts and skips. Clear's `resync` step calls `runManualSyncForShow(driveFileId, "manual")` directly (never an HTTP request to the app's own route).
- [ ] **Step 4: Wire the telemetry emissions.** After the final write attempt and outside any lock, call `logAdminOutcome({ code: "DEV_SCENARIO_APPLIED", source: "admin.dev.applyAttentionScenario", actorEmail: email, result })` where `result` is `"applied"` on full success and `"partial"` on partial. Emit nothing when zero writes committed. The clear action emits `DEV_SCENARIO_CLEARED` on the same rule. **This step is what Task 13's behavioral proofs assert; without it those proofs cannot pass.**
- [ ] **Step 5: Add the per-call-site invariant-9 annotations** above every Supabase call in both actions, and amend the file-level comment at `app/admin/dev/actions.ts:3-11` so it no longer claims file-wide that nothing returns a typed union.
- [ ] **Step 6: Run to verify it passes.**
- [ ] **Step 7: Commit**

```bash
git add app/admin/dev/actions.ts tests/dev/materializeActions.test.ts
git commit -m "feat(dev): materialize apply and clear server actions with outcome telemetry"
```

---

### Task 13: Telemetry registry and behavioral proofs

Spec §7.1. The emissions themselves were implemented in Task 12 Step 4; this task proves them structurally.

**Files:**

- Modify: `tests/log/_auditableMutations.ts`, `tests/log/adminOutcomeBehavior.test.ts`

- [ ] **Step 1: Extend `chainResult`** (`tests/log/adminOutcomeBehavior.test.ts:77-86`) to stub every builder method the Task 12 actions call beyond the existing `eq/is/not/select/update/insert/delete/single/limit` set — at minimum `.in`. Verified at plan time: an unstubbed method throws `TypeError: node.in is not a function`, which fails the test for the wrong reason and hides the real assertion.
- [ ] **Step 2: Add the four `AUDITABLE_MUTATIONS` rows** — `applyAttentionScenario`, `clearAttentionScenario`, and both form wrappers, with codes `DEV_SCENARIO_APPLIED` / `DEV_SCENARIO_CLEARED`, all `file: "app/admin/dev/actions.ts"`.

Run: `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts`
Expected: FAIL — the registry now names four surfaces with no recorded behavioral proof.

- [ ] **Step 3: Add the four behavioral proofs**, following `tests/log/adminOutcomeBehavior.test.ts:1137-1151` (core) and `tests/log/adminOutcomeBehavior.test.ts:1157-1171` (wrapper). Each asserts the code IS emitted on the committed-success branch, and calls `recordAdminOutcomeBehavior({ file, fn, code })`.
- [ ] **Step 4: Add the two branch tests that Step 3 does not cover.** These distinguish the two failure shapes, which are **not** the same branch:
  - **Zero-write failure** — the first Supabase call returns `{ error }`; assert **no** code is emitted, because nothing committed.
  - **Post-commit partial** — an early call succeeds and a later one fails; assert the code **is** emitted exactly once, with `result: "partial"`.

  Stating both explicitly resolves what would otherwise read as a contradiction between "not emitted on the error branch" and "emitted for a partial".

- [ ] **Step 5: Run both meta-tests to verify they pass.**
- [ ] **Step 6: Commit**

```bash
git add tests/log/_auditableMutations.ts tests/log/adminOutcomeBehavior.test.ts
git commit -m "test(dev): auditable-mutation rows and behavioral proofs for materialize"
```

---
