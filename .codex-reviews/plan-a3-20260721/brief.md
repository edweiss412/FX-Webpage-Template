# Plan review A3 - TASKS 4-7 (catalog tiers)

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

CONTEXT: Task 3 (not shown) defines AttentionScenario, ScenarioAlertRow, ScenarioHoldRow, and validateScenario(s): string[] returning an empty array when valid. These tasks build on those.

## ARTIFACT - Tasks 4-7, complete

### Task 4: Tier-1 alert scenarios, runtime-derived

Spec §3.1, §3.2b. Totality is structural: derived from `ATTENTION_ROUTES` keys, so a new alert code appears with no catalog edit.

**Files:**

- Create: `lib/dev/attentionScenarios/tier1.ts (new)`
- Test: `tests/dev/attentionScenariosTier1.test.ts (new)`

**Interfaces:**

- Consumes: `AttentionScenario`, `validateScenario` (Task 3).
- Produces: `tier1AlertScenarios(): AttentionScenario[]`, `scenarioIdForCode(namespace: "alert" | "warn", code: string): string`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/dev/attentionScenariosTier1.test.ts
import { describe, expect, test } from "vitest";
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { tier1AlertScenarios, scenarioIdForCode } from "@/lib/dev/attentionScenarios/tier1";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";

describe("tier 1 alert scenarios", () => {
  test("covers every ATTENTION_ROUTES code with no catalog edit", () => {
    const codes = tier1AlertScenarios().flatMap((s) => s.alerts.map((a) => a.code));
    expect(new Set(codes)).toEqual(new Set(Object.keys(ATTENTION_ROUTES)));
  });

  test("every generated scenario is valid", () => {
    for (const s of tier1AlertScenarios()) {
      expect(validateScenario(s), s.id).toEqual([]);
    }
  });

  test("ids are namespaced, slugified, and unique", () => {
    expect(scenarioIdForCode("alert", "SYNC_STALLED")).toBe("alert-sync-stalled");
    const ids = tier1AlertScenarios().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

Failure mode caught: a new alert code landing in `ATTENTION_ROUTES` with no gallery representation — the drift the structural derivation exists to make impossible. Note this asserts against `ATTENTION_ROUTES` itself, not a hardcoded count, so it cannot pass by a stale number.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/dev/attentionScenariosTier1.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// lib/dev/attentionScenarios/tier1.ts (alert half)
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import type { AttentionScenario, ScenarioAlertRow } from "./types";

const FIXED_RAISED_AT = "2026-07-01T12:00:00.000Z";

export function scenarioIdForCode(namespace: "alert" | "warn", code: string): string {
  return `${namespace}-${code.toLowerCase().replaceAll("_", "-")}`;
}

/** Storable-field overrides only. `code` is NOT overridable (spec §3.1). */
const ALERT_ROW_OVERRIDES: Partial<Record<string, Partial<Omit<ScenarioAlertRow, "code">>>> = {
  TILE_PROJECTION_FETCH_FAILED: { context: { failedKeys: ["tile:agenda", "tile:rooms"] } },
  SHOW_FIRST_PUBLISHED: {
    context: { data_gaps: { total: 3, classes: { missing_hotel: 2, missing_dims: 1 } } },
  },
  ROLE_FLAGS_NOTICE: {
    context: { role_change_count: 1, role_change_crew_names: ["Dana Reed"] },
  },
  // ...one row per code whose card content depends on context (spec §3.1 table)
};

export function tier1AlertScenarios(): AttentionScenario[] {
  return Object.keys(ATTENTION_ROUTES).map((code) => {
    const override = ALERT_ROW_OVERRIDES[code] ?? {};
    return {
      id: scenarioIdForCode("alert", code),
      tier: 1,
      label: code,
      alerts: [
        {
          code,
          context: {},
          raised_at: FIXED_RAISED_AT,
          occurrence_count: 1,
          ...override,
        },
      ],
      holds: [],
    };
  });
}
```

Fill `ALERT_ROW_OVERRIDES` from the §3.1 table — every code listed there needs its row, or the validator (Task 3) rejects it and this task's second test fails. That coupling is deliberate.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/dev/attentionScenariosTier1.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dev/attentionScenarios/tier1.ts tests/dev/attentionScenariosTier1.test.ts
git commit -m "feat(dev): runtime-derived tier-1 alert scenarios"
```

---

### Task 5: Tier-1 warning scenarios and the warning builder

Spec §3.2, §3.2a. The warning universe is the generated enum plus the four codes its scan heuristic misses.

**Files:**

- Modify: `lib/dev/attentionScenarios/tier1.ts (new)`
- Test: `tests/dev/attentionScenariosWarnings.test.ts (new)`

**Interfaces:**

- Produces: `warningCodes(): string[]`, `buildWarning(code: string): ParseWarning`, `tier1WarningScenarios(): AttentionScenario[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/dev/attentionScenariosWarnings.test.ts
import { describe, expect, test } from "vitest";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import {
  warningCodes,
  buildWarning,
  tier1WarningScenarios,
} from "@/lib/dev/attentionScenarios/tier1";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";

describe("tier 1 warning scenarios", () => {
  test("includes every generated parse_warnings code", () => {
    const generated = Object.entries(INTERNAL_CODE_ENUMS)
      .filter(([, v]) => v.source === "parse_warnings.code")
      .map(([k]) => k);
    for (const code of generated) expect(warningCodes()).toContain(code);
  });

  test("includes the four codes the generator's scan heuristic misses", () => {
    for (const code of [
      "AGENDA_SCHEDULE_LOW_CONFIDENCE",
      "AGENDA_SCHEDULE_TIME_ADJUSTED",
      "PULL_SHEET_ON_ARCHIVED_TAB",
      "PULL_SHEET_OVERRIDE_CONTENT_CHANGED",
    ]) {
      expect(warningCodes()).toContain(code);
    }
  });

  test("de-duplicates, so a later generator fix cannot double-render a code", () => {
    const codes = warningCodes();
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("a built warning never embeds its own raw code in the message", () => {
    for (const code of warningCodes()) {
      expect(buildWarning(code).message).not.toContain(code);
    }
  });

  test("every warning scenario is valid", () => {
    for (const s of tier1WarningScenarios()) expect(validateScenario(s), s.id).toEqual([]);
  });
});
```

The message test is the one that matters: warnings materialize verbatim, so a code in a message reaches the real modal and escapes the §1.1 exception.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/dev/attentionScenariosWarnings.test.ts`
Expected: FAIL — `warningCodes` is not exported.

- [ ] **Step 3: Implement**

`warningCodes()` filters `INTERNAL_CODE_ENUMS` on `source === "parse_warnings.code"`, concatenates `EXTRA_WARNING_CODES` (the four, each with a `file:line` comment), and de-duplicates via a `Set`. `buildWarning(code)` returns `{ severity: "warn", code, message: "Synthetic warning for gallery review." }` plus the §3.2a per-code payload where required (`roleToken` for `UNKNOWN_ROLE_TOKEN`; the use-raw resolution object for the three structural-transform codes).

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/dev/attentionScenariosWarnings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/dev/attentionScenarios/tier1.ts tests/dev/attentionScenariosWarnings.test.ts
git commit -m "feat(dev): tier-1 warning scenarios with the enumerated generator-gap residue"
```

---

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
