# Curated full-split gallery composite — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline; two tasks). Spec: `docs/superpowers/specs/2026-07-22-attention-gallery-curated-composite.md` (sweep table + composite definition are canonical there).

**Goal:** one tier-3 scenario rendering the full attention split (confirm · review · monitoring, all menu groups, external + internal action links).

**Architecture:** catalog-only change (`lib/dev/attentionScenarios/tier3.ts`) + one new behavioral test file. Registries self-derive.

**Tech stack:** existing scenario catalog, vitest, existing gallery e2e (build-gated).

## Global constraints

- Worktree `../FX-worktrees/attention-gallery-curated`, branch `feat/attention-gallery-curated`, TDD per task, conventional commits.
- No UI files touched (spec §1 — no impeccable gate). No validator changes.
- Copy: no em-dash in any user-visible string (label uses a colon).

## Meta-test inventory

None created or extended. The governing structural suites are self-deriving from the catalog (`tests/dev/attentionScenariosIndex.test.ts` totals + all-scenarios validator loop; `tests/e2e/attention-modal-gallery.spec.ts` markers; `tests/dev/materializePlan.test.ts` / `materializeRun.test.ts` / `materializeRoundTrip.realdb.test.ts` from `materializableScenarios()`). Task 2 RUNS them to prove pickup; none needs an edit. Advisory locks, Supabase call boundaries, telemetry: not in scope (no runtime code changes).

### Task 1: failing behavioral pins

**Files:** Create `tests/dev/fullSplitComposite.test.ts`.

- [ ] Step 1: write the test file:

```ts
// Behavioral pins for the curated full-split composite (spec
// docs/superpowers/specs/2026-07-22-attention-gallery-curated-composite.md §3-§4).
// Derived through the REAL deriveScenarioAttention - the same path the gallery
// route renders - so a classification or action-registry regression that would
// change what the gallery teaches fails here, not in a screenshot.
import { describe, expect, it } from "vitest";
import { scenarioById } from "@/lib/dev/attentionScenarios/index";
import { T3_FULL_SPLIT } from "@/lib/dev/attentionScenarios/tier3";
import { deriveScenarioAttention } from "@/lib/dev/deriveScenarioAttention";
import { GALLERY_SLUG } from "@/lib/dev/galleryModalTypes";

describe("t3-full-attention-split composite", () => {
  const scenario = () => {
    const s = scenarioById(T3_FULL_SPLIT);
    if (!s) throw new Error("composite missing from catalog");
    return s;
  };

  it("is a tier-3 composite: 4 alerts, 1 hold, warnings ABSENT (tri-state untouched)", () => {
    const s = scenario();
    expect(s.tier).toBe(3);
    expect(s.alerts).toHaveLength(4);
    expect(s.holds).toHaveLength(1);
    expect("warnings" in s).toBe(false);
  });

  it("derives the full split: 1 actionable (the hold), 2 needs_look, 2 self_heal", () => {
    const items = deriveScenarioAttention(scenario());
    expect(items.filter((i) => i.actionable)).toHaveLength(1);
    expect(items.filter((i) => i.actionable)[0]?.kind).toBe("hold");
    expect(items.filter((i) => i.clearingKind === "needs_look")).toHaveLength(2);
    expect(items.filter((i) => i.clearingKind === "self_heal")).toHaveLength(2);
  });

  it("sheet row resolves the EXTERNAL link from context.drive_file_id (gallery has no show-level id)", () => {
    const items = deriveScenarioAttention(scenario());
    const sheet = items.find((i) => i.kind === "alert" && i.alert.code === "SHEET_UNAVAILABLE");
    if (sheet?.kind !== "alert") throw new Error("sheet item missing");
    expect(sheet.alert.action).toEqual({
      label: "Open in Sheet",
      href: "https://docs.google.com/spreadsheets/d/gallery-fixture-file/edit#gid=0",
      external: true,
    });
  });

  it("overview row resolves the INTERNAL anchor from the gallery slug", () => {
    const items = deriveScenarioAttention(scenario());
    const ov = items.find(
      (i) => i.kind === "alert" && i.alert.code === "RESYNC_QUALITY_REGRESSED",
    );
    if (ov?.kind !== "alert") throw new Error("overview item missing");
    expect(ov.alert.action).toEqual({
      label: "Go to Overview",
      href: `/admin?show=${GALLERY_SLUG}#overview`,
      external: false,
    });
  });
});
```

- [ ] Step 2: run `pnpm vitest run tests/dev/fullSplitComposite.test.ts` — expect FAIL (`T3_FULL_SPLIT` not exported).
- [ ] Step 3: commit `test(admin): failing pins for full-split gallery composite`.

### Task 2: the composite + green + registry pickup proof

**Files:** Modify `lib/dev/attentionScenarios/tier3.ts`.

- [ ] Step 1: add after `T3_HOLD_AND_DRIFT` constant:

```ts
export const T3_FULL_SPLIT = "t3-full-attention-split";
```

append `T3_FULL_SPLIT` to `T3_IDS`, and append to the `tier3Scenarios()` array:

```ts
    {
      id: T3_FULL_SPLIT,
      tier: 3,
      label: "Everything at once: confirm, review, and monitoring",
      alerts: [
        {
          // needs-look WITH an external link: openSheet resolves the sheet id
          // from context.drive_file_id (the gallery passes no show-level id,
          // so this exercises the fallback in a rendered surface).
          code: "SHEET_UNAVAILABLE",
          context: { drive_file_id: "gallery-fixture-file" },
          raised_at: AT,
          occurrence_count: 1,
        },
        // needs-look with the internal Overview anchor.
        { code: "RESYNC_QUALITY_REGRESSED", context: {}, raised_at: AT, occurrence_count: 1 },
        // two genuinely self-healing codes -> the Monitoring summary reads "2".
        { code: "SYNC_STALLED", context: {}, raised_at: AT, occurrence_count: 3 },
        { code: "DRIVE_FETCH_FAILED", context: {}, raised_at: AT, occurrence_count: 1 },
      ],
      holds: [
        {
          drive_file_id: "gallery-fixture-file",
          domain: "crew_email",
          entity_key: "ren-park",
          held_value: { email: "ren.old@example.test", name: "Ren Park" },
          proposed_value: {
            disposition: "email_change",
            name: "Ren Park",
            email: "ren.new@example.test",
          },
          base_modified_time: AT,
          kind: "mi11_pending",
        },
      ],
      // warnings deliberately ABSENT (tri-state "do not touch", like T3_SHEET_MISSING).
    },
```

- [ ] Step 2: `pnpm vitest run tests/dev/fullSplitComposite.test.ts` — PASS.
- [ ] Step 3: registry pickup proof (no edits expected): `pnpm vitest run tests/dev/` — index totals, validator loop, materialize plan/run all green with the new scenario included.
- [ ] Step 4: build-gated gallery e2e (playwright.config.ts `dev-build` project: built ADMIN_DEV_PANEL_ENABLED=true artifact on :3001, its webServer boots it): `pnpm exec playwright test --project dev-build tests/e2e/attention-modal-gallery.spec.ts`; the self-derived marker set must include the new scenario (hold -> `changes-rail-badge`).
- [ ] Step 5: full gates: `pnpm test`, `tsc --noEmit`, `eslint .`, `prettier --check .`.
- [ ] Step 6: commit `feat(admin): curated full-split gallery composite (t3-full-attention-split)`.

### Task 3: ship

Whole-diff codex review (inlined; small diff) → push → PR → CI green → `gh pr merge --merge` → ff main → verify `0 0` → CronDelete `131a9b9b` → marker done.
