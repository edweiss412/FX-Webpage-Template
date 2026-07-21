# Plan re-review: t11

## Your role: REVIEWER ONLY

Surface findings only. Do not fix, patch, or propose changes you will make. Do NOT run shell commands or tools; the artifact is inlined. Do NOT invoke any nested review.

## Context

An implementation plan for a DEV-ONLY instrument in a Next.js 16 + Supabase admin app. It renders every alert/warning state of an admin "show modal" without waiting for live data. One catalog of storable scenario rows feeds two consumers: a build-gated gallery route (renders states, no DB) and a "materialize" dev-panel card (writes tagged rows into a local or validation Supabase).

The SPEC is already APPROVED after six rounds. Do NOT re-review the design. Review the PLAN: could an engineer with no context execute these steps and land correct, tested code?

Settled, do NOT relitigate: materialize is tier-3 only; warnings are never written on validation; environments gate on the URL the client actually uses; gallery action controls are neutralized by a capture-phase submit listener; bucketAttention returns pre-rendered ReactNode arrays; catalog coverage is deliberately not gated but validity is; no migration; no new advisory-lock holder.

## Binding plan rules

- TDD per task: failing test, run it, minimal implementation, passing test, commit.
- No placeholders. Every code-changing step shows the code.
- Every test states the concrete failure mode it catches. A test proving only "the function was called" is too weak.
- Anti-tautology: assert against the data source, not a container; derive expectations from fixtures; exercise null/zero/NaN/out-of-range.
- Snippets must typecheck under strict TS (noUncheckedIndexedAccess, exactOptionalPropertyTypes).
- Names and signatures used across tasks must match.

## This is a RE-REVIEW

The prior round returned 23 findings of one class: prose where code was required, and tests too weak to catch what the step claimed. These tasks were rewritten comprehensively. Judge the rewrite: what is still not executable, what test would pass while its named bug is present, and what the rewrite itself broke.

## Output

Per finding: `SEVERITY (P0/P1/P2/P3) - <claim> - <task/step> - <why it fails, concretely>`.
If sound, say so and APPROVE. Do not manufacture findings.

End with a final line exactly: `VERDICT: APPROVE` or `VERDICT: NEEDS-ATTENTION` or `VERDICT: BLOCKING`

## ARTIFACT

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
