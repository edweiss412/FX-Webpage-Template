# Plan re-review: t9

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
