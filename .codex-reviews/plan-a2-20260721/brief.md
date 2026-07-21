# Plan review A2 - TASKS 1-3 (extractions + executable validator)

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

NOTE: the prior dispatch of this review was truncated by a tooling error on my side. This brief carries the COMPLETE tasks. Findings about missing content in the previous send do not apply.

## ARTIFACT - plan headers and Tasks 1-3, complete

# Attention Scenario Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator a way to see every alert/warning state of the admin show modal without waiting for live sheet data to raise the row, and to drive a chosen state through the real modal for real.

**Architecture:** One catalog of storable scenario rows (`lib/dev/attentionScenarios.ts (new)`) feeds two consumers. A build-gated gallery route renders tiers 1 and 2 through the _real_ `deriveAttentionItems` and `bucketAttention`, with no database. A dev-panel materialize card writes tagged rows into a local (or validation) Supabase so tier-3 composites drive the real modal. Two behavior-preserving extractions from production read paths guarantee the two consumers derive identical fields.

**Tech Stack:** Next.js 16 App Router (RSC), TypeScript strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Vitest, Playwright, Supabase (service-role), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-07-20-attention-scenario-gallery-design.md` (APPROVED 2026-07-21). Section references below are to that document.

## Global Constraints

- **TDD per task.** Failing test → minimal implementation → passing test → commit. Never implement before the test.
- **Commit per task**, conventional-commits style: `<type>(<scope>): <summary>`. Scope is `admin` or `dev` for this work.
- **Worktree:** all work happens in `/Users/ericweiss/FX-worktrees/attention-scenario-gallery` on `feat/attention-scenario-gallery`. Never the main checkout.
- **No migration.** This plan changes no schema. If a task seems to need one, stop — the spec forbids it (§1.1).
- **No new advisory-lock holder.** `runManualSyncForShow` is the sole acquirer for `show:<drive_file_id>`; materialize calls it and never acquires (§7.2).
- **No raw error codes in operator-facing UI** except the ratified §1.1 scope: the gallery's routing readout, scenario ids, the `PICKER_EPOCH_RESET` non-render row, the unknown-scenario id list, the materialize selector, and §5.3 result codes.
- **Em-dash ban** in all user-visible copy. Apostrophes are literal `'`. Tap targets `min-h-tap-min`.
- **Every Supabase call** destructures `{ data, error }`, distinguishes returned from thrown, and maps infra faults to a typed result.
- **Before every push:** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`. A scoped run is not sufficient.

## Meta-test inventory (declared per AGENTS.md)

- **Creates:** one — the `FILES`-membership walk (Task 10). It is the only CI-enforced protection against an unregistered dev route.
- **Extends:** `tests/log/_auditableMutations.ts` (4 rows, Task 13); `tests/log/adminOutcomeBehavior.test.ts` (4 behavioral proofs + `chainResult` mock extension, Task 13); `tests/admin/build-artifact-gate.test.ts` (enabled-flag case, Task 10).
- **Declined:** a catalog-_completeness_ meta-test (§1.1). Catalog _validity_ is tested (Task 3); coverage is not gated.
- **Not extended:** any invariant-9 registry — none has `app/admin/dev` in scope. The obligation is per-call-site inline annotations (Task 12).

## Advisory-lock topology (declared per AGENTS.md)

Hashkey `show:<drive_file_id>`. Complete holder list after this change: **(1) `runManualSyncForShow`** (`lib/sync/runManualSyncForShow.ts:297`), JS-side, pre-existing, unchanged. Materialize adds zero acquirers at any layer. `assertShowLockHeld` asserts a precondition and does **not** detect double-acquisition (§7.2).

## File structure

**Created:**

| Path                                             | Responsibility                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `lib/dev/attentionScenarios/types.ts (new)`      | Scenario row types only. No data, no logic.                         |
| `lib/dev/attentionScenarios/validate.ts (new)`   | `validateScenario` — the executable guard contract (§3.6).          |
| `lib/dev/attentionScenarios/tier1.ts (new)`      | Per-code alert and warning scenarios, runtime-derived.              |
| `lib/dev/attentionScenarios/tier2.ts (new)`      | The structural matrix (§4.2).                                       |
| `lib/dev/attentionScenarios/tier3.ts (new)`      | Composites, the only materializable tier.                           |
| `lib/dev/attentionScenarios/index.ts (new)`      | Assembles all tiers; exports `ALL_SCENARIOS`, `scenarioById`.       |
| `lib/dev/materialize/env.ts (new)`               | Target resolution and the loopback / project-ref gate (§5.5). Pure. |
| `lib/dev/materialize/plan.ts (new)`              | Guard evaluation and the Apply/Clear write plan. Pure, no I/O.      |
| `components/admin/dev/ScenarioBlock.tsx (new)`   | Client component: pill ref, menu open state, submit interception.   |
| `components/admin/dev/MaterializeCard.tsx (new)` | Client component: the dev-panel card.                               |
| `app/admin/dev/attention-gallery/page.tsx (new)` | Server route: derive, bucket, flatten, render blocks.               |
| `tests/admin/dev/filesMembership.test.ts (new)`  | The new meta-test (Task 10).                                        |

**Modified:**

| Path                                      | Change                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `lib/adminAlerts/fetchPerShowAlerts.ts`   | Extract `deriveAlertRowFields` + move `crewNameFor`; call the extraction.                                 |
| `lib/sync/feed/readShowChangeFeed.ts`     | Extract `shapeHoldEntry`; call the extraction.                                                            |
| `scripts/with-admin-dev-flag.mjs`         | Add the gallery route to `FILES`.                                                                         |
| `app/admin/dev/actions.ts`                | Add `applyAttentionScenario` / `clearAttentionScenario` + form wrappers; amend the file-level annotation. |
| `app/admin/dev/page.tsx`                  | Mount `MaterializeCard`.                                                                                  |
| `tests/log/_auditableMutations.ts`        | 4 registry rows.                                                                                          |
| `tests/log/adminOutcomeBehavior.test.ts`  | Extend `chainResult`; 4 behavioral proofs.                                                                |
| `tests/admin/build-artifact-gate.test.ts` | Enabled-flag assertion.                                                                                   |

---

### Task 1: Extract the shared alert derivation

Spec §3.3. Behavior-preserving extraction on a production read path. This is what makes gallery and materialize agree.

**Files:**

- Modify: `lib/adminAlerts/fetchPerShowAlerts.ts:58-73` (move `crewNameFor`), `lib/adminAlerts/fetchPerShowAlerts.ts:169-172` (call the extraction)
- Create: `lib/adminAlerts/deriveAlertRowFields.ts (new)`
- Test: `tests/adminAlerts/deriveAlertRowFields.test.ts (new)`

**Interfaces:**

- Produces: `deriveAlertRowFields(row: { code: string; context: Record<string, unknown> | null }, identity: AlertIdentity | undefined): { identityText: string | null; messageParams: MessageParams; crewName: string | null }`

- [ ] **Step 1: Write the failing test**

```ts
// tests/adminAlerts/deriveAlertRowFields.test.ts
import { describe, expect, test } from "vitest";
import { deriveAlertRowFields } from "@/lib/adminAlerts/deriveAlertRowFields";
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";

describe("deriveAlertRowFields", () => {
  test("ROLE_FLAGS_NOTICE takes crewName from context alone, no identity", () => {
    const out = deriveAlertRowFields(
      {
        code: "ROLE_FLAGS_NOTICE",
        context: { role_change_count: 1, role_change_crew_names: ["Dana Reed"] },
      },
      undefined,
    );
    expect(out.crewName).toBe("Dana Reed");
  });

  test("identity-dependent code takes crewName from the resolved Crew segment", () => {
    const identity: AlertIdentity = {
      segments: [{ label: "Crew", value: "Sam Ito" }],
    } as AlertIdentity;
    const out = deriveAlertRowFields({ code: "AMBIGUOUS_EMAIL_BINDING", context: {} }, identity);
    expect(out.crewName).toBe("Sam Ito");
  });

  test("identity-dependent code yields null crewName when identity is absent", () => {
    const out = deriveAlertRowFields({ code: "AMBIGUOUS_EMAIL_BINDING", context: {} }, undefined);
    expect(out.crewName).toBeNull();
  });

  test("two Crew segments is ambiguous and yields null", () => {
    const identity: AlertIdentity = {
      segments: [
        { label: "Crew", value: "A" },
        { label: "Crew", value: "B" },
      ],
    } as AlertIdentity;
    const out = deriveAlertRowFields({ code: "OAUTH_IDENTITY_CLAIMED", context: {} }, identity);
    expect(out.crewName).toBeNull();
  });
});
```

Failure mode caught: a refactor that changes which source `crewName` reads for either class of code — the exact divergence §3.3 exists to prevent.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/adminAlerts/deriveAlertRowFields.test.ts`
Expected: FAIL, cannot resolve `@/lib/adminAlerts/deriveAlertRowFields`.

- [ ] **Step 3: Create the extraction**

Move `crewNameFor` verbatim out of `fetchPerShowAlerts.ts` into the new file and wrap it:

```ts
// lib/adminAlerts/deriveAlertRowFields.ts
import { describeAlert } from "./describeAlert";
import { deriveAlertMessageParams } from "./deriveMessageParams";
import { projectIdentityContext } from "./projectIdentityContext";
import type { AlertIdentity } from "./identityTypes";
import type { MessageParams } from "@/lib/messages/types";

/** §3.1a crewName rule: moved verbatim from fetchPerShowAlerts.ts:58. */
function crewNameFor(
  code: string,
  projected: ReturnType<typeof projectIdentityContext>,
  identity: AlertIdentity | undefined,
): string | null {
  if (code === "ROLE_FLAGS_NOTICE") {
    const names = projected.display.role_change_crew_names;
    if (projected.counts.role_change_count !== 1 || !names || names.length !== 1) return null;
    const name = names[0]!;
    return name.trim().length > 0 ? name : null;
  }
  const crewSegs = (identity?.segments ?? []).filter((s) => s.label === "Crew");
  if (crewSegs.length !== 1) return null;
  const value = crewSegs[0]!.value;
  return value.trim().length > 0 ? value : null;
}

/**
 * The DB-independent tail of fetchPerShowAlerts (spec §3.3). Both the production
 * read path and the dev gallery call THIS, so the two cannot drift.
 */
export function deriveAlertRowFields(
  row: { code: string; context: Record<string, unknown> | null },
  identity: AlertIdentity | undefined,
): { identityText: string | null; messageParams: MessageParams; crewName: string | null } {
  const projected = projectIdentityContext(row.context, { includePii: true });
  return {
    identityText: identity ? describeAlert(identity, { includePii: true }) : null,
    messageParams: deriveAlertMessageParams(row.code, row.context, identity ?? null, "show"),
    crewName: crewNameFor(row.code, projected, identity),
  };
}
```

- [ ] **Step 4: Rewire `fetchPerShowAlerts` to call it**

Delete the local `crewNameFor` (now moved) and replace the map tail at `lib/adminAlerts/fetchPerShowAlerts.ts:169-172`:

```ts
return rows.map((r) => {
  const identity = identities.get(r.id);
  return { ...r, ...deriveAlertRowFields(r, identity) };
});
```

Note: the pre-existing code passed `projectedById.get(r.id)!` to `crewNameFor`. The extraction recomputes the projection from `r.context`, which is the same pure function on the same input, so the value is identical. `projectedById` is still used to build `resolverRows` and stays.

- [ ] **Step 5: Run the new test and the existing alert suite**

Run: `pnpm vitest run tests/adminAlerts/ tests/admin/attentionItems.test.ts`
Expected: PASS, including every pre-existing `fetchPerShowAlerts` test unchanged.

- [ ] **Step 6: Commit**

```bash
git add lib/adminAlerts/deriveAlertRowFields.ts lib/adminAlerts/fetchPerShowAlerts.ts tests/adminAlerts/deriveAlertRowFields.test.ts
git commit -m "refactor(admin): extract deriveAlertRowFields so gallery and production share one derivation"
```

---

### Task 2: Extract the shared hold shaping

Spec §3.3. Same rationale, hold side.

**Files:**

- Modify: `lib/sync/feed/readShowChangeFeed.ts:286-318`
- Create: `lib/sync/feed/shapeHoldEntry.ts (new)`
- Test: `tests/sync/shapeHoldEntry.test.ts (new)`

**Interfaces:**

- Consumes: nothing from Task 1.
- Produces: `shapeHoldEntry(hold: HoldRowForShaping): FeedEntry` where `HoldRowForShaping` is `{ id: string; proposed_value: Disposition; base_modified_time: string | null; created_at: string; domain: HoldDomain; entity_key: string }`.

- [ ] **Step 1: Read the current shaping block**

Run: `sed -n '280,320p' lib/sync/feed/readShowChangeFeed.ts`

The exact `summary` construction and `FeedGate` assembly are what must move. Do not paraphrase them — move them verbatim, because `summary` is operator-visible copy and rewording it is an unrelated behavior change.

- [ ] **Step 2: Write the failing test**

```ts
// tests/sync/shapeHoldEntry.test.ts
import { describe, expect, test } from "vitest";
import { shapeHoldEntry } from "@/lib/sync/feed/shapeHoldEntry";

describe("shapeHoldEntry", () => {
  test("an open mi11 hold becomes an approve_reject entry carrying its gate", () => {
    const entry = shapeHoldEntry({
      id: "hold-1",
      proposed_value: { disposition: "email_change", name: "Dana Reed", email: "dana@x.test" },
      base_modified_time: "2026-07-01T00:00:00.000Z",
      created_at: "2026-07-01T00:00:00.000Z",
      domain: "crew_email",
      entity_key: "dana-reed",
    });
    expect(entry.status).toBe("pending");
    expect(entry.action).toBe("approve_reject");
    expect(entry.gate?.holdId).toBe("hold-1");
    expect(entry.summary.length).toBeGreaterThan(0);
  });
});
```

Failure mode caught: a shaping change that drops the gate, so `toHoldItem` (`lib/admin/attentionItems.ts:284-286`) silently returns null and the hold vanishes from the attention surface.

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm vitest run tests/sync/shapeHoldEntry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Create the extraction and rewire the caller**

Three helpers the hold branch uses are module-local in `readShowChangeFeed.ts`: `HoldRow`, `renderPendingSummary`, and `sortKeyFromRaw`. `sortKeyFromRaw` is **also used by the change-log branch**, so it moves to its own module rather than into the hold extraction.

First create `lib/sync/feed/sortKey.ts (new)` holding `sortKeyFromRaw` verbatim, exported, and import it back into `readShowChangeFeed.ts`.

Then create the extraction, moving `HoldRow` and `renderPendingSummary` with it:

```ts
// lib/sync/feed/shapeHoldEntry.ts
import { toIso } from "@/lib/time/toIso";
import { sortKeyFromRaw } from "./sortKey";
import type { FeedEntry, FeedGate } from "@/lib/sync/holds/types";

// Moved verbatim from readShowChangeFeed.ts, together with renderPendingSummary.
export type HoldRow = {
  id: string;
  proposed_value: FeedGate["disposition"];
  base_modified_time: string | null;
  created_at: string;
  entity_key: string;
};

export function shapeHoldEntry(hold: HoldRow): FeedEntry & { sortKey: string } {
  const gate: FeedGate = {
    holdId: hold.id,
    disposition: hold.proposed_value,
    // P5-F4 / PF40: the OPAQUE optimistic-concurrency token the MI-11 RPCs compare
    // EXACTLY. It MUST carry the raw timestamptz string at full PostgreSQL
    // microsecond precision, NOT a Date/toIso()-normalized value, which drops
    // microseconds and would falsely trip MI11_TARGET_MOVED on a hold that never
    // retargeted. Display timestamps stay normalized; only this token is byte-exact.
    baseModifiedTime: hold.base_modified_time,
  };
  return {
    id: hold.id,
    occurredAt: toIso(hold.created_at) ?? hold.created_at, // display only
    sortKey: sortKeyFromRaw(hold.created_at), // full precision (P5-F5)
    status: "pending",
    summary: renderPendingSummary(hold),
    action: "approve_reject",
    entityRef: hold.entity_key,
    acceptable: false, // hold-derived entries never carry the disposition axis
    acknowledgedAt: null,
    gate,
  };
}
```

Move `renderPendingSummary` into this module unchanged. **Do not reword its output** — `summary` is operator-visible copy, and rewording it is an unrelated behavior change that would also break the fidelity contract, since materialize regenerates the summary from the same function.

Then the caller becomes:

```ts
const holdEntries: RankedEntry[] = ((holdData ?? []) as HoldRow[]).map(shapeHoldEntry);
```

Verify the exact import path for `toIso` before writing the file (`rg -n "toIso" lib/sync/feed/readShowChangeFeed.ts`) and use whatever that file already imports.

- [ ] **Step 5: Run the feed suite**

Run: `pnpm vitest run tests/sync/ tests/admin/attentionItems.test.ts`
Expected: PASS with no pre-existing test modified.

- [ ] **Step 6: Commit**

```bash
git add lib/sync/feed/shapeHoldEntry.ts lib/sync/feed/readShowChangeFeed.ts tests/sync/shapeHoldEntry.test.ts
git commit -m "refactor(sync): extract shapeHoldEntry for shared feed shaping"
```

---

### Task 3: Catalog types and the executable validator

Spec §3.0, §3.6. The validator **is** the guard contract — this is the structural defense that replaced two rounds of prose enumeration.

**Files:**

- Create: `lib/dev/attentionScenarios/types.ts (new)`, `lib/dev/attentionScenarios/validate.ts (new)`
- Test: `tests/dev/attentionScenariosValidate.test.ts (new)`

**Interfaces:**

- Produces: `AttentionScenario`, `ScenarioAlertRow`, `ScenarioHoldRow`, `validateScenario(s: AttentionScenario): string[]` (empty array = valid).

- [ ] **Step 1: Write the failing test FIRST**

Write `tests/dev/attentionScenariosValidate.test.ts (new)` exactly as shown in Step 3 below, before creating any source file. It imports both the types and `validateScenario`, so the red state is a module-resolution failure — a legitimate TDD red, and the reason this step precedes the type definitions.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/dev/attentionScenariosValidate.test.ts`
Expected: FAIL, cannot resolve `@/lib/dev/attentionScenarios/types` or `.../validate`.

- [ ] **Step 3: Write the types**

```ts
// lib/dev/attentionScenarios/types.ts
import type { AlertIdentity } from "@/lib/adminAlerts/identityTypes";
import type { Disposition } from "@/lib/sync/holds/types";
import type { ParseWarning } from "@/lib/parser/types";
import type { BucketOpts } from "@/lib/admin/sectionAttention";

export type ScenarioAlertRow = {
  code: string;
  context: Record<string, unknown>;
  raised_at: string;
  occurrence_count: number;
  galleryIdentity?: AlertIdentity | null;
};

export type ScenarioHoldRow = {
  drive_file_id: string;
  domain: "crew_email" | "crew_identity";
  entity_key: string;
  held_value: Record<string, unknown>;
  proposed_value: Disposition;
  base_modified_time: string;
  kind: "mi11_pending";
  reservation_collisions?: Array<{ name: string; email: string | null }>;
};

export type AttentionScenario = {
  id: string;
  tier: 1 | 2 | 3;
  label: string;
  alerts: ScenarioAlertRow[];
  holds: ScenarioHoldRow[];
  warnings?: ParseWarning[];
  bucket?: Partial<BucketOpts>;
  degraded?: boolean;
};
```

`BucketOpts` is currently NOT exported from `lib/admin/sectionAttention.ts:30`. Export it in this step (add `export` to the type declaration) — a one-word production change with no behavior effect.

- [ ] **Step 4: The test contents referenced by Step 1**

```ts
// tests/dev/attentionScenariosValidate.test.ts
import { describe, expect, test } from "vitest";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

function base(): AttentionScenario {
  return { id: "alert-sync-stalled", tier: 1, label: "Sync stalled", alerts: [], holds: [] };
}

describe("validateScenario", () => {
  test("a minimal scenario is valid", () => {
    expect(validateScenario(base())).toEqual([]);
  });

  test("rejects a malformed id", () => {
    expect(validateScenario({ ...base(), id: "Bad_Id" })).not.toEqual([]);
  });

  test("rejects a blank label", () => {
    expect(validateScenario({ ...base(), label: "   " })).not.toEqual([]);
  });

  test("rejects bucket or degraded outside tier 2", () => {
    expect(validateScenario({ ...base(), tier: 1, degraded: true })).not.toEqual([]);
  });

  test("rejects occurrence_count of zero, fractional, and non-finite", () => {
    for (const n of [0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s: AttentionScenario = {
        ...base(),
        alerts: [
          {
            code: "SYNC_STALLED",
            context: {},
            raised_at: "2026-07-01T00:00:00.000Z",
            occurrence_count: n,
          },
        ],
      };
      expect(validateScenario(s), `occurrence_count ${n}`).not.toEqual([]);
    }
  });

  test("rejects a context carrying the reserved tag key", () => {
    const s: AttentionScenario = {
      ...base(),
      alerts: [
        {
          code: "SYNC_STALLED",
          context: { __devScenario: "x" },
          raised_at: "2026-07-01T00:00:00.000Z",
          occurrence_count: 1,
        },
      ],
    };
    expect(validateScenario(s)).not.toEqual([]);
  });

  test("rejects duplicate alert codes within one scenario", () => {
    const row = {
      code: "SYNC_STALLED",
      context: {},
      raised_at: "2026-07-01T00:00:00.000Z",
      occurrence_count: 1,
    };
    expect(validateScenario({ ...base(), alerts: [row, { ...row }] })).not.toEqual([]);
  });

  test("rejects a warning whose message contains its own code", () => {
    const s: AttentionScenario = {
      ...base(),
      warnings: [
        { severity: "warn", code: "BLOCK_DISAPPEARED", message: "BLOCK_DISAPPEARED happened" },
      ],
    };
    expect(validateScenario(s)).not.toEqual([]);
  });

  test("rejects ROLE_FLAGS_NOTICE without its required context", () => {
    const s: AttentionScenario = {
      ...base(),
      alerts: [
        {
          code: "ROLE_FLAGS_NOTICE",
          context: {},
          raised_at: "2026-07-01T00:00:00.000Z",
          occurrence_count: 1,
        },
      ],
    };
    expect(validateScenario(s)).not.toEqual([]);
  });

  test("rejects a hold whose proposed_value is not a full Disposition", () => {
    const s: AttentionScenario = {
      ...base(),
      holds: [
        {
          drive_file_id: "f1",
          domain: "crew_email",
          entity_key: "e1",
          held_value: {},
          // missing `name` for an email_change
          proposed_value: { disposition: "email_change", email: null } as never,
          base_modified_time: "2026-07-01T00:00:00.000Z",
          kind: "mi11_pending",
        },
      ],
    };
    expect(validateScenario(s)).not.toEqual([]);
  });
});
```

Each case is a rule from §3.6 that would otherwise ship as prose. The reserved-key and message-contains-code cases are the two with operator-visible consequences.

- [ ] **Step 5: Implement `validateScenario`**

Implement every row of the §3.6 table, returning a string per violation. Key rules, in order: `id` matches `^[a-z0-9][a-z0-9-]{2,47}$`; `label` non-blank; `tier` in `{1,2,3}`; `bucket`/`degraded` only on tier 2; per-alert `code` matches `^[A-Z][A-Z0-9_]*$`, `context` is a plain object without `__devScenario`, `raised_at` parses, `occurrence_count` is `Number.isInteger` and `>= 1`; per-code context requirements from §3.1; per-hold CHECK-set membership and full `Disposition` shape; per-warning non-blank `code`, `severity === "warn"`, non-blank `message` not containing `code`.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm vitest run tests/dev/attentionScenariosValidate.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Commit**

```bash
git add lib/dev/attentionScenarios/ lib/admin/sectionAttention.ts tests/dev/attentionScenariosValidate.test.ts
git commit -m "feat(dev): scenario types and executable catalog validator"
```

---
