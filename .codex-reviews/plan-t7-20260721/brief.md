# Plan re-review: t7

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

### Task 7: Tier-3 composites and the catalog index

Spec §4.3, §5.0. Only tier 3 is materializable.

**Files:**

- Create: `lib/dev/attentionScenarios/tier3.ts (new)`, `lib/dev/attentionScenarios/index.ts (new)`
- Test: `tests/dev/attentionScenariosIndex.test.ts (new)`

**Interfaces:**

- Produces: `T3_IDS: readonly string[]` (the canonical composite id list), `tier3Scenarios(): AttentionScenario[]`, `ALL_SCENARIOS: AttentionScenario[]`, `scenarioById(id: string): AttentionScenario | undefined`, `materializableScenarios(): AttentionScenario[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/dev/attentionScenariosIndex.test.ts
import { describe, expect, test } from "vitest";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";
import {
  ALL_SCENARIOS,
  scenarioById,
  materializableScenarios,
} from "@/lib/dev/attentionScenarios/index";
import { T3_IDS } from "@/lib/dev/attentionScenarios/tier3";

describe("catalog index", () => {
  test("tier 3 is non-empty and matches its declared id list exactly", () => {
    expect(T3_IDS.length).toBeGreaterThanOrEqual(3);
    const ids = materializableScenarios()
      .map((s) => s.id)
      .sort();
    expect(ids).toEqual([...T3_IDS].sort());
  });

  test("every scenario in the catalog is valid", () => {
    expect(ALL_SCENARIOS.length).toBeGreaterThan(0);
    for (const s of ALL_SCENARIOS) expect(validateScenario(s), s.id).toEqual([]);
  });

  test("ids are globally unique across all tiers", () => {
    const ids = ALL_SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("scenarioById resolves a known id and rejects an unknown one", () => {
    const first = ALL_SCENARIOS[0]!;
    expect(scenarioById(first.id)?.id).toBe(first.id);
    expect(scenarioById("no-such-scenario")).toBeUndefined();
  });

  test("materializable means tier 3 and nothing else", () => {
    for (const s of materializableScenarios()) expect(s.tier).toBe(3);
    for (const s of ALL_SCENARIOS.filter((x) => x.tier !== 3)) {
      expect(materializableScenarios()).not.toContainEqual(s);
    }
  });

  test("no tier-3 scenario carries bucket or degraded, which DB state cannot reproduce", () => {
    for (const s of materializableScenarios()) {
      expect(s.bucket, s.id).toBeUndefined();
      expect(s.degraded ?? false, s.id).toBe(false);
    }
  });

  test("every tier-3 scenario materializes something", () => {
    for (const s of materializableScenarios()) {
      const hasState = s.alerts.length > 0 || s.holds.length > 0 || s.warnings !== undefined;
      expect(hasState, s.id).toBe(true);
    }
  });
});
```

The first test is the anti-vacuity guard: without asserting `T3_IDS.length >= 3` and set-equality against a declared list, an empty tier 3 would satisfy every other assertion trivially. `scenarioById` gets both a hit and a miss, so an implementation that always returns `undefined` fails.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/dev/attentionScenariosIndex.test.ts`
Expected: FAIL, cannot resolve the modules.

- [ ] **Step 3: Implement tier 3**

```ts
// lib/dev/attentionScenarios/tier3.ts
import type { AttentionScenario } from "./types";

export const T3_SHEET_MISSING = "t3-sheet-missing-mid-parse";
export const T3_CREW_COLLISION = "t3-crew-collision-with-warnings";
export const T3_HOLD_AND_DRIFT = "t3-hold-pending-with-asset-drift";
export const T3_IDS = [T3_SHEET_MISSING, T3_CREW_COLLISION, T3_HOLD_AND_DRIFT] as const;

const AT = "2026-07-01T12:00:00.000Z";

export function tier3Scenarios(): AttentionScenario[] {
  return [
    {
      id: T3_SHEET_MISSING,
      tier: 3,
      label: "Sheet went missing mid-parse",
      alerts: [
        { code: "SHEET_UNAVAILABLE", context: {}, raised_at: AT, occurrence_count: 2 },
        {
          code: "PARSE_ERROR_LAST_GOOD",
          context: { error_code: "ROOMS_BLOCK_MISSING" },
          raised_at: AT,
          occurrence_count: 1,
        },
      ],
      holds: [],
    },
    // T3_CREW_COLLISION and T3_HOLD_AND_DRIFT follow the same shape.
  ];
}
```

Author the remaining two composites. `T3_CREW_COLLISION` carries `AMBIGUOUS_EMAIL_BINDING` plus three `warnings` (so it exercises the warning write path). `T3_HOLD_AND_DRIFT` carries one `mi11_pending` hold plus `EMBEDDED_ASSET_DRIFTED` and **omits** `warnings`, so it exercises the tri-state absent branch. Verify `PARSE_ERROR_LAST_GOOD`'s `error_code` value is actually in `PARSE_FAILURE_ALLOWLIST` (`rg -n "PARSE_FAILURE_ALLOWLIST" -A20 lib/messages/parseFailureReason.ts`) — the validator rejects any other value.

- [ ] **Step 4: Implement the index**

```ts
// lib/dev/attentionScenarios/index.ts
import { tier1AlertScenarios, tier1WarningScenarios } from "./tier1";
import { tier2Scenarios } from "./tier2";
import { tier3Scenarios } from "./tier3";
import type { AttentionScenario } from "./types";

export const ALL_SCENARIOS: AttentionScenario[] = [
  ...tier1AlertScenarios(),
  ...tier1WarningScenarios(),
  ...tier2Scenarios(),
  ...tier3Scenarios(),
];

const BY_ID = new Map(ALL_SCENARIOS.map((s) => [s.id, s]));

export function scenarioById(id: string): AttentionScenario | undefined {
  return BY_ID.get(id);
}

export function materializableScenarios(): AttentionScenario[] {
  return ALL_SCENARIOS.filter((s) => s.tier === 3);
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm vitest run tests/dev/attentionScenariosIndex.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/dev/attentionScenarios/tier3.ts lib/dev/attentionScenarios/index.ts tests/dev/attentionScenariosIndex.test.ts
git commit -m "feat(dev): tier-3 composites and the catalog index"
```

---
