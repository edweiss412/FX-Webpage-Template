# Plan review B - TASKS 6-13 (tiers 2-3, gallery, FILES gate, materialize, telemetry)

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

## ARTIFACT

### Task 6: Tier-2 structural matrix

Spec §4.2. Few codes, every structural axis.

**Files:**

- Create: `lib/dev/attentionScenarios/tier2.ts (new)`
- Test: `tests/dev/attentionScenariosTier2.test.ts (new)`

**Interfaces:**

- Produces: `tier2Scenarios(): AttentionScenario[]`, `MENU_CAP` (= 12).

- [ ] **Step 1: Write the failing test**

Assert one scenario exists per §4.2 row, each valid, and that the fallback axes actually route as documented — by running the real `bucketAttention` with the scenario's `bucket` predicates and asserting the destination section, not by trusting the label. For the "Overview also absent" row, assert the card is **dropped** (present in items, absent from every bucket), which is the outcome §4.2 states.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/dev/attentionScenariosTier2.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** the matrix, one scenario per row, `MENU_CAP = 12` as a named export used by the "many" scenario.

- [ ] **Step 4: Run to verify it passes.** - [ ] **Step 5: Commit**

```bash
git add lib/dev/attentionScenarios/tier2.ts tests/dev/attentionScenariosTier2.test.ts
git commit -m "feat(dev): tier-2 structural matrix scenarios"
```

---

### Task 7: Tier-3 composites and the catalog index

Spec §4.3, §5.0. Only tier 3 is materializable.

**Files:**

- Create: `lib/dev/attentionScenarios/tier3.ts (new)`, `lib/dev/attentionScenarios/index.ts (new)`
- Test: `tests/dev/attentionScenariosIndex.test.ts (new)`

**Interfaces:**

- Produces: `ALL_SCENARIOS: AttentionScenario[]`, `scenarioById(id: string): AttentionScenario | undefined`, `materializableScenarios(): AttentionScenario[]`.

- [ ] **Step 1: Write the failing test** asserting: every scenario in `ALL_SCENARIOS` is valid; ids are globally unique; `materializableScenarios()` returns exactly the tier-3 set; and no tier-3 scenario carries `bucket` or `degraded` (they cannot be reproduced from DB state, §5.0).
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** 3 to 5 composites — e.g. "sheet went missing mid-parse", "crew email collision plus three warnings", "hold pending plus a stale-asset alert" — plus the index that concatenates the tiers.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**

```bash
git add lib/dev/attentionScenarios/tier3.ts lib/dev/attentionScenarios/index.ts tests/dev/attentionScenariosIndex.test.ts
git commit -m "feat(dev): tier-3 composites and the catalog index"
```

---

### Task 8: `ScenarioBlock` client component

Spec §4.0, §4.1, §4.4. Owns the pill ref, real open state, and submit interception.

**Files:**

- Create: `components/admin/dev/ScenarioBlock.tsx (new)`
- Test: `tests/components/admin/dev/scenarioBlock.test.tsx (new)`

**Interfaces:**

- Consumes: nothing from the catalog directly — it receives the props below.
- Produces: `ScenarioBlockProps` exactly as §4.0 defines, including `groups: Array<{ sectionId; placement; anchorOrCrewKey; nodes: ReactNode[] }>`.

- [ ] **Step 1: Write the failing test**

Cover: the menu renders open by default and closes via `onClose`; the navigation readout records an activated item; and — the load-bearing one — **a submit inside the block is prevented**:

```tsx
test("a form submit inside the block is intercepted and never fires its action", async () => {
  const action = vi.fn();
  render(
    <ScenarioBlock
      {...baseProps()}
      groups={[
        {
          sectionId: "overview",
          placement: "sectionTop",
          anchorOrCrewKey: null,
          nodes: [
            <form key="f" action={action}>
              <button type="submit">Resolve</button>
            </form>,
          ],
        },
      ]}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
  expect(action).not.toHaveBeenCalled();
});
```

Failure mode caught: the §4.4 neutralization silently not applying, which would let a gallery click run a real server action against a synthetic id.

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement.** A `useRef` on the pill button, `useState(true)` for `open`, and a root `<div>` whose `onSubmitCapture={(e) => e.preventDefault()}` intercepts every submit in the subtree. Render the readout as a `<dl>`, the pill plus `AttentionMenu`, the `groups` nodes under labelled headings, `holdItems` in a separate labelled group, and `PerShowActionableWarnings` twice (`warning` then `muted`) only when `warnings` is non-null.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit**

```bash
git add components/admin/dev/ScenarioBlock.tsx tests/components/admin/dev/scenarioBlock.test.tsx
git commit -m "feat(dev): ScenarioBlock with submit interception and live menu state"
```

---

### Task 9: The gallery route

Spec §4.1, §4.5. Server Component: derive, bucket, flatten, render.

**Files:**

- Create: `app/admin/dev/attention-gallery/page.tsx (new)`
- Test: `tests/app/admin/attentionGalleryParams.test.ts (new)`

**Interfaces:**

- Consumes: `ALL_SCENARIOS` (Task 7), `ScenarioBlock` (Task 8), `deriveAttentionItems`, `bucketAttention`.
- Produces: `parseGalleryParams(sp: Record<string, string | string[] | undefined>): { tier: 1|2|3|null; scenarioId: string | null; maxWidthPx: number | null }` — exported from the page module for direct testing.

- [ ] **Step 1: Write the failing param test** covering every §4.5 guard: `scenario` wins over `tier`; an array param takes its first element; `w` accepts only `^\d+$` and clamps to `[320,1280]`; empty, whitespace, signed, decimal, exponent, `NaN`, `Infinity`, and a digits-only value large enough to exceed `Number.MAX_SAFE_INTEGER` all fall back to `null`; unknown `tier` yields `null` (all tiers).
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** the page. `requireDeveloper()` first; `export const dynamic = "force-dynamic"`; `await searchParams`; filter scenarios; per scenario call `deriveAttentionItems`, then `bucketAttention` with `renderCard` returning `<AttentionBanner>` and the scenario's `bucket` predicates merged over defaults; flatten the `SectionAttention` map into the `groups` array; render one `ScenarioBlock` each. Include the standing note that action controls are display-only.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Typecheck** — `pnpm typecheck`. Expected: clean.
- [ ] **Step 6: Commit**

```bash
git add app/admin/dev/attention-gallery/page.tsx tests/app/admin/attentionGalleryParams.test.ts
git commit -m "feat(dev): build-gated attention gallery route"
```

---

### Task 10: `FILES` registration and the membership meta-test

Spec §6, §6a. The one meta-test this work creates, and the only CI-enforced protection against an unregistered dev route.

**Files:**

- Modify: `scripts/with-admin-dev-flag.mjs:43-56`, `tests/admin/build-artifact-gate.test.ts`
- Create: `tests/admin/dev/filesMembership.test.ts (new)`

- [ ] **Step 1: Write the failing meta-test**

```ts
// tests/admin/dev/filesMembership.test.ts
import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const DEV_ROOT = join(ROOT, "app/admin/dev");
// The telemetry route is deliberately prod-available; build-artifact-gate.test.ts
// carves it out identically.
const EXEMPT = new Set(["app/admin/dev/telemetry/page.tsx"]);
const ROUTE_FILES = /^(page|route|actions|layout|default)\.tsx?$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const abs = join(dir, name);
    return statSync(abs).isDirectory() ? walk(abs) : [abs];
  });
}

describe("every app/admin/dev route file is registered in the build gate", () => {
  test("FILES covers each route-defining and server-action file", () => {
    const script = readFileSync(join(ROOT, "scripts/with-admin-dev-flag.mjs"), "utf8");
    const missing = walk(DEV_ROOT)
      .map((abs) => relative(ROOT, abs))
      .filter((rel) => {
        const name = rel.split("/").pop()!;
        if (EXEMPT.has(rel)) return false;
        const isRouteFile = ROUTE_FILES.test(name);
        const isServerAction =
          /\.tsx?$/.test(name) && readFileSync(join(ROOT, rel), "utf8").includes('"use server"');
        return isRouteFile || isServerAction;
      })
      .filter((rel) => !script.includes(`"${rel}"`));
    expect(missing, `unregistered dev route files: ${missing.join(", ")}`).toEqual([]);
  });
});
```

Failure mode caught: a future dev route shipping in the production artifact because nobody added it to `FILES`. Verified at plan time to be a real gap — `RUN_BUILD_ARTIFACT_GATE_TEST` is set in no workflow, so the artifact test never runs in CI, and the `FILES`-membership assertion the spec once claimed existed did not.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/admin/dev/filesMembership.test.ts`
Expected: FAIL, listing the new gallery page as unregistered.

- [ ] **Step 3: Register the route** — add the gallery page path (quoted, matching the neighbouring entries) to `FILES`, with a comment matching the existing entries' rationale.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Add the enabled-flag artifact assertion** to `tests/admin/build-artifact-gate.test.ts`: with `ADMIN_DEV_PANEL_ENABLED="true"`, the built manifests **do** contain `/admin/dev/attention-gallery`. Verify manually with `RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts` and record the result in the handoff; it stays opt-in.

- [ ] **Step 6: Commit**

```bash
git add scripts/with-admin-dev-flag.mjs tests/admin/dev/filesMembership.test.ts tests/admin/build-artifact-gate.test.ts
git commit -m "feat(dev): FILES membership meta-test and gallery route registration"
```

---

### Task 11: Materialize environment gate and write plan (pure)

Spec §5.5, §5.3. Pure functions, no I/O — so every guard is testable without a database.

**Files:**

- Create: `lib/dev/materialize/env.ts (new)`, `lib/dev/materialize/plan.ts (new)`
- Test: `tests/dev/materializeEnv.test.ts (new)`, `tests/dev/materializePlan.test.ts (new)`

**Interfaces:**

- Produces: `resolveTarget(input): { kind: "ok"; url: string; key: string } | { kind: "refused"; reason: string }` and `planApply(scenario, opts) / planClear(opts)` returning the ordered write steps plus any refusal.

- [ ] **Step 1: Write the failing env test** — the R3a P0 regression suite. A `local` target whose URL is not loopback is refused; loopback variants (`127.0.0.1`, `localhost`, `[::1]`) pass; a `validation` target whose URL-derived ref is not `VALIDATION_PROJECT_REF` is refused **even when `VALIDATION_SUPABASE_PROJECT_REF` carries the expected value**; a disagreement between derived and declared ref is refused; an unparseable URL is refused.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement `resolveTarget`** using `projectRefFromUrl` (`lib/admin/validationDeployment.ts:7`) against `VALIDATION_PROJECT_REF`, reading the same variable the client will read.
- [ ] **Step 4: Write the failing plan test** — every §5.3 guard row, Apply-only vs both; the environment-aware "nothing to materialize" rule; the warnings tri-state; and that Clear's plan is scenario-independent.
- [ ] **Step 5: Implement and verify.**
- [ ] **Step 6: Commit**

```bash
git add lib/dev/materialize/ tests/dev/materializeEnv.test.ts tests/dev/materializePlan.test.ts
git commit -m "feat(dev): materialize environment gate and pure write planner"
```

---

### Task 12: Materialize server actions

Spec §5.1, §5.2, §7.5. Executes the Task 11 plan.

**Files:**

- Modify: `app/admin/dev/actions.ts`

- [ ] **Step 1: Write the failing action test** with the Supabase client mocked, asserting the typed result union and that a returned `{ error }` and a thrown rejection at each call boundary both yield `{ kind: "infra_error" }` or `{ kind: "partial" }` with the failed step named.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** `applyAttentionScenario`, `clearAttentionScenario`, and their `*FormAction` wrappers. `requireDeveloper()` first. Delete tagged rows with the **presence** predicates: `context ? '__devScenario'` for alerts, and for holds `created_by LIKE '\_\_devScenario:%' ESCAPE '\'` — **the escape is load-bearing**, since an unescaped `_` is a single-character wildcard that would match authentic rows. Clear's step 3 calls `runManualSyncForShow(driveFileId, "manual")` directly on local only.
- [ ] **Step 4: Add the per-call-site invariant-9 annotations** and amend the file-level comment at `app/admin/dev/actions.ts:3-11` so it no longer claims file-wide that nothing returns a typed union.
- [ ] **Step 5: Run to verify it passes.**
- [ ] **Step 6: Commit**

```bash
git add app/admin/dev/actions.ts tests/dev/materializeActions.test.ts
git commit -m "feat(dev): materialize apply and clear server actions"
```

---

### Task 13: Telemetry registry, behavioral proofs, and the mock extension

Spec §7.1. Invariant 10 requires all four surfaces to have executable success-branch proof.

**Files:**

- Modify: `tests/log/_auditableMutations.ts`, `tests/log/adminOutcomeBehavior.test.ts`

- [ ] **Step 1: Extend `chainResult`** (`tests/log/adminOutcomeBehavior.test.ts:77-86`) with every builder method the actions use beyond the current `eq/is/not/select/update/insert/delete/single/limit` set — at minimum `.in`. Verified at plan time: without this the behavioral test throws on an undefined method rather than failing a meaningful assertion.
- [ ] **Step 2: Add the four `AUDITABLE_MUTATIONS` rows** for `applyAttentionScenario`, `clearAttentionScenario`, and both form wrappers, codes `DEV_SCENARIO_APPLIED` / `DEV_SCENARIO_CLEARED`. Run `pnpm vitest run tests/log/_metaMutationSurfaceObservability.test.ts` — expected FAIL until Step 3, because the registry now names surfaces with no behavioral proof.
- [ ] **Step 3: Add the four behavioral proofs**, following `tests/log/adminOutcomeBehavior.test.ts:1137-1151` (core) and `tests/log/adminOutcomeBehavior.test.ts:1157-1171` (wrapper). Each asserts the code IS emitted on the committed-success branch and is NOT emitted on the error branch, and calls `recordAdminOutcomeBehavior({ file, fn, code })`.
- [ ] **Step 4: Add the partial and zero-write telemetry tests** — a partially committed Apply emits once after the final write attempt with accurate step counts; an Apply whose first write fails emits nothing.
- [ ] **Step 5: Run both meta-tests to verify they pass.**
- [ ] **Step 6: Commit**

```bash
git add tests/log/_auditableMutations.ts tests/log/adminOutcomeBehavior.test.ts
git commit -m "test(dev): auditable-mutation rows and behavioral proofs for materialize"
```

---
