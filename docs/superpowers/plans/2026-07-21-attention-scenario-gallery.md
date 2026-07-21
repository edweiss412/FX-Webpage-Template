# Attention Scenario Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the operator a way to see every alert/warning state of the admin show modal without waiting for live sheet data to raise the row, and to drive a chosen state through the real modal for real.

**Architecture:** One catalog of storable scenario rows (`lib/dev/attentionScenarios.ts (new)`) feeds two consumers. A build-gated gallery route renders tiers 1 and 2 through the *real* `deriveAttentionItems` and `bucketAttention`, with no database. A dev-panel materialize card writes tagged rows into a local (or validation) Supabase so tier-3 composites drive the real modal. Two behavior-preserving extractions from production read paths guarantee the two consumers derive identical fields.

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

## Execution note: where verification moves to the compiler

Five plan-review rounds produced findings of one recurring class: steps that
summarize instead of showing code, and tests too weak to catch what they name.
Every task written with real code and real tests (1 through 3) drew no
executability findings; every task that summarized drew many.

Per the same-vector rule in AGENTS.md, prose patching stops here. Tasks 1 through
3 are fully specified and reviewed. For tasks 4 onward, this document is
authoritative for **ordering, interfaces, declared invariants, and the failure
mode each test must catch** — and the implementer writes the code against a real
compiler and a real test runner, which verify in seconds what prose review can
only approximate.

The outstanding review findings are therefore carried as **implementation
requirements**, not plan edits. They are real and must be satisfied in code:

- **Task 14 (card):** `lastResult` must be passed at the mount site or it will not
  typecheck. `resultDismissed` must reset when a new `lastResult` arrives, or a
  fresh result stays permanently hidden. Both forms need the shared field values,
  which do not belong to a form by DOM nesting alone: use hidden inputs or
  `form=` attributes, and assert the submitted `FormData` rather than the
  rendered controls. An unconfirmed validation submit must be blocked, and that
  must be proven by submitting, not by inspecting a checkbox. Tap-target
  assertions must cover selects, inputs, and checkboxes, not only `role=button`.
- **Task 15 (real DB):** the suite needs an explicit isolation contract — a
  dedicated show, unique fixture keys, and cleanup before AND after — or exact-row
  assertions race any other run. The collision cases assert a **skip**, which is
  action-result behavior with no database representation: assert the returned
  `skipped` entry AND the untouched authentic row, since neither alone proves it.
- **Task 6:** the `T2_UNRESOLVED_PLACEHOLDER` fixture must use a code whose
  catalog template actually contains a `<token>`; the test asserts
  `template === null` and will fail loudly otherwise.

## Meta-test inventory (declared per AGENTS.md)

- **Creates:** one — the `FILES`-membership walk (Task 10). It is the only CI-enforced protection against an unregistered dev route.
- **Extends:** `tests/log/_auditableMutations.ts` (4 rows, Task 13); `tests/log/adminOutcomeBehavior.test.ts` (4 behavioral proofs + `chainResult` mock extension, Task 13); `tests/admin/build-artifact-gate.test.ts` (enabled-flag case, Task 10).
- **Declined:** a catalog-*completeness* meta-test (§1.1). Catalog *validity* is tested (Task 3); coverage is not gated.
- **Not extended:** any invariant-9 registry — none has `app/admin/dev` in scope. The obligation is per-call-site inline annotations (Task 12).

## Advisory-lock topology (declared per AGENTS.md)

Hashkey `show:<drive_file_id>`. Complete holder list after this change: **(1) `runManualSyncForShow`** (`lib/sync/runManualSyncForShow.ts:297`), JS-side, pre-existing, unchanged. Materialize adds zero acquirers at any layer. `assertShowLockHeld` asserts a precondition and does **not** detect double-acquisition (§7.2).

## File structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `lib/dev/attentionScenarios/types.ts (new)` | Scenario row types only. No data, no logic. |
| `lib/dev/attentionScenarios/validate.ts (new)` | `validateScenario` — the executable guard contract (§3.6). |
| `lib/dev/attentionScenarios/tier1.ts (new)` | Per-code alert and warning scenarios, runtime-derived. |
| `lib/dev/attentionScenarios/tier2.ts (new)` | The structural matrix (§4.2). |
| `lib/dev/attentionScenarios/tier3.ts (new)` | Composites, the only materializable tier. |
| `lib/dev/attentionScenarios/index.ts (new)` | Assembles all tiers; exports `ALL_SCENARIOS`, `scenarioById`. |
| `lib/dev/materialize/env.ts (new)` | Target resolution and the loopback / project-ref gate (§5.5). Pure. |
| `lib/dev/materialize/plan.ts (new)` | Guard evaluation and the Apply/Clear write plan. Pure, no I/O. |
| `components/admin/dev/ScenarioBlock.tsx (new)` | Client component: pill ref, menu open state, submit interception. |
| `components/admin/dev/MaterializeCard.tsx (new)` | Client component: the dev-panel card. |
| `app/admin/dev/attention-gallery/page.tsx (new)` | Server route: derive, bucket, flatten, render blocks. |
| `tests/admin/dev/filesMembership.test.ts (new)` | The new meta-test (Task 10). |

**Modified:**

| Path | Change |
| --- | --- |
| `lib/adminAlerts/fetchPerShowAlerts.ts` | Extract `deriveAlertRowFields` + move `crewNameFor`; call the extraction. |
| `lib/sync/feed/readShowChangeFeed.ts` | Extract `shapeHoldEntry`; call the extraction. |
| `scripts/with-admin-dev-flag.mjs` | Add the gallery route to `FILES`. |
| `app/admin/dev/actions.ts` | Add `applyAttentionScenario` / `clearAttentionScenario` + form wrappers; amend the file-level annotation. |
| `app/admin/dev/page.tsx` | Mount `MaterializeCard`. |
| `tests/log/_auditableMutations.ts` | 4 registry rows. |
| `tests/log/adminOutcomeBehavior.test.ts` | Extend `chainResult`; 4 behavioral proofs. |
| `tests/admin/build-artifact-gate.test.ts` | Enabled-flag assertion. |

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
    const out = deriveAlertRowFields(
      { code: "AMBIGUOUS_EMAIL_BINDING", context: {} },
      identity,
    );
    expect(out.crewName).toBe("Sam Ito");
  });

  test("identity-dependent code yields null crewName when identity is absent", () => {
    const out = deriveAlertRowFields(
      { code: "AMBIGUOUS_EMAIL_BINDING", context: {} },
      undefined,
    );
    expect(out.crewName).toBeNull();
  });

  test("two Crew segments is ambiguous and yields null", () => {
    const identity: AlertIdentity = {
      segments: [
        { label: "Crew", value: "A" },
        { label: "Crew", value: "B" },
      ],
    } as AlertIdentity;
    const out = deriveAlertRowFields(
      { code: "OAUTH_IDENTITY_CLAIMED", context: {} },
      identity,
    );
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
- Produces: `shapeHoldEntry(hold: HoldRow): FeedEntry & { sortKey: string }`, where `HoldRow` is exported from the same module and is exactly `{ id: string; proposed_value: Disposition; base_modified_time: string | null; created_at: string; domain: HoldDomain; entity_key: string }`. The return type includes `sortKey` because the caller sorts on it at full precision before stripping it (`readShowChangeFeed.ts:318-321`); returning a bare `FeedEntry` would silently drop the P5-F5 ordering fix.

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
  domain: "crew_email" | "crew_identity";
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
git add lib/sync/feed/shapeHoldEntry.ts lib/sync/feed/sortKey.ts lib/sync/feed/readShowChangeFeed.ts tests/sync/shapeHoldEntry.test.ts
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
        alerts: [{ code: "SYNC_STALLED", context: {}, raised_at: "2026-07-01T00:00:00.000Z", occurrence_count: n }],
      };
      expect(validateScenario(s), `occurrence_count ${n}`).not.toEqual([]);
    }
  });

  test("rejects a context carrying the reserved tag key", () => {
    const s: AttentionScenario = {
      ...base(),
      alerts: [{ code: "SYNC_STALLED", context: { __devScenario: "x" }, raised_at: "2026-07-01T00:00:00.000Z", occurrence_count: 1 }],
    };
    expect(validateScenario(s)).not.toEqual([]);
  });

  test("rejects duplicate alert codes within one scenario", () => {
    const row = { code: "SYNC_STALLED", context: {}, raised_at: "2026-07-01T00:00:00.000Z", occurrence_count: 1 };
    expect(validateScenario({ ...base(), alerts: [row, { ...row }] })).not.toEqual([]);
  });

  test("rejects a warning whose message contains its own code", () => {
    const s: AttentionScenario = {
      ...base(),
      warnings: [{ severity: "warn", code: "BLOCK_DISAPPEARED", message: "BLOCK_DISAPPEARED happened" }],
    };
    expect(validateScenario(s)).not.toEqual([]);
  });

  test("rejects ROLE_FLAGS_NOTICE without its required context", () => {
    const s: AttentionScenario = {
      ...base(),
      alerts: [{ code: "ROLE_FLAGS_NOTICE", context: {}, raised_at: "2026-07-01T00:00:00.000Z", occurrence_count: 1 }],
    };
    expect(validateScenario(s)).not.toEqual([]);
  });

  test("rejects a hold whose proposed_value is not a full Disposition", () => {
    const s: AttentionScenario = {
      ...base(),
      holds: [{
        drive_file_id: "f1",
        domain: "crew_email",
        entity_key: "e1",
        held_value: {},
        // missing `name` for an email_change
        proposed_value: { disposition: "email_change", email: null } as never,
        base_modified_time: "2026-07-01T00:00:00.000Z",
        kind: "mi11_pending",
      }],
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
      alerts: [{
        code,
        context: {},
        raised_at: FIXED_RAISED_AT,
        occurrence_count: 1,
        ...override,
      }],
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
import { warningCodes, buildWarning, tier1WarningScenarios } from "@/lib/dev/attentionScenarios/tier1";
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

Spec §4.2. Few codes, every structural axis. Codes are classified **at runtime** by the real predicates, never hardcoded: `INBOX_ROUTED_CODES` and `AUTO_RESOLVING_CODES` are themselves derived from the message catalog, so a hardcoded pick would drift the moment the catalog changes.

**Files:**
- Create: `lib/dev/attentionScenarios/tier2.ts (new)`
- Test: `tests/dev/attentionScenariosTier2.test.ts (new)`

**Interfaces:**
- Consumes: `AttentionScenario`, `ScenarioAlertRow`, `validateScenario` (Task 3).
- Produces: `MENU_CAP: 12`, `tier2Scenarios(): AttentionScenario[]`, `T2_REQUIRED_IDS: readonly string[]`, and the sixteen id constants below.

- [ ] **Step 1: Write the failing test**

```ts
// tests/dev/attentionScenariosTier2.test.ts
import { describe, expect, test } from "vitest";
import { bucketAttention } from "@/lib/admin/sectionAttention";
import { deriveAttentionItems } from "@/lib/admin/attentionItems";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { isAutoResolving } from "@/lib/adminAlerts/audience";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";
import {
  MENU_CAP,
  tier2Scenarios,
  T2_REQUIRED_IDS,
  T2_SECTION_ABSENT,
  T2_OVERVIEW_ABSENT,
  T2_ANCHOR_ABSENT,
  T2_CREW_ROW_ABSENT,
  T2_HOLD_ONLY,
  T2_INBOX_ROUTED,
  T2_AUTO_RESOLVING,
  T2_ACTIONABLE,
  T2_OCCURRENCE_MANY,
  T2_IDENTITY_ABSENT,
  T2_UNCATALOGED,
  T2_UNRESOLVED_PLACEHOLDER,
  T2_EMPTY,
  T2_SINGLE,
  T2_MANY,
  T2_DEGRADED,
} from "@/lib/dev/attentionScenarios/tier2";
import { tier1AlertScenarios } from "@/lib/dev/attentionScenarios/tier1";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

function byId(id: string): AttentionScenario {
  const s = tier2Scenarios().find((x) => x.id === id);
  if (!s) throw new Error(`missing tier-2 scenario ${id}`);
  return s;
}

function toInput(r: AttentionScenario["alerts"][number], i: number) {
  return {
    id: `t2-${i}-${r.code}`,
    code: r.code,
    context: r.context,
    raised_at: r.raised_at,
    occurrence_count: r.occurrence_count,
    identityText: null,
    messageParams: {},
    crewName: null,
  };
}

function itemsFor(s: AttentionScenario) {
  return deriveAttentionItems({
    alerts: s.alerts.map(toInput),
    feed: s.holds.length === 0 ? null : { entries: holdEntriesFor(s) },
    slug: "demo",
  });
}

/** Minimal FeedEntry shapes so the hold axis actually flows through derive. */
function holdEntriesFor(s: AttentionScenario) {
  return s.holds.map((h, i) => ({
    id: `hold-${i}`,
    occurredAt: h.base_modified_time,
    status: "pending" as const,
    summary: `Hold on ${h.entity_key}`,
    action: "approve_reject" as const,
    entityRef: h.entity_key,
    acceptable: false,
    acknowledgedAt: null,
    gate: { holdId: `hold-${i}`, disposition: h.proposed_value, baseModifiedTime: h.base_modified_time },
  }));
}

/**
 * Per-PLACEMENT-KIND counts. Deliberately NOT summed: collapsing sectionTop with
 * byAnchor/byCrewKey would let a card that stayed in the anchor or crew bucket
 * pass a "falls back to section top" assertion.
 */
function placements(s: AttentionScenario) {
  const map = bucketAttention(itemsFor(s), {
    renderCard: () => "card",
    sectionAvailable: s.bucket?.sectionAvailable ?? (() => true),
    anchorAvailable: s.bucket?.anchorAvailable ?? (() => true),
    ...(s.bucket?.crewKeyRendered ? { crewKeyRendered: s.bucket.crewKeyRendered } : {}),
  });
  const out = new Map<string, { sectionTop: number; anchor: number; crewRow: number }>();
  for (const [sectionId, b] of map) {
    out.set(sectionId, {
      sectionTop: b.sectionTop.length,
      anchor: [...(b.byAnchor?.values() ?? [])].reduce((a, v) => a + v.length, 0),
      crewRow: [...(b.byCrewKey?.values() ?? [])].reduce((a, v) => a + v.length, 0),
    });
  }
  return out;
}

function totalPlaced(s: AttentionScenario): number {
  let n = 0;
  for (const v of placements(s).values()) n += v.sectionTop + v.anchor + v.crewRow;
  return n;
}

describe("tier 2 structural matrix", () => {
  test("every required axis exists exactly once, and every scenario is valid tier 2", () => {
    const all = tier2Scenarios();
    const ids = all.map((s) => s.id);
    // Set-equality against the declared list: a missing OR duplicated axis fails.
    expect([...ids].sort()).toEqual([...T2_REQUIRED_IDS].sort());
    for (const s of all) {
      expect(validateScenario(s), s.id).toEqual([]);
      expect(s.tier, s.id).toBe(2);
    }
  });

  test("a routed section that is unavailable falls back to Overview's section top", () => {
    const p = placements(byId(T2_SECTION_ABSENT));
    expect(p.get("overview")?.sectionTop ?? 0).toBeGreaterThan(0);
    expect(p.get("crew")?.sectionTop ?? 0).toBe(0);
  });

  test("when no section is available the card is DROPPED", () => {
    expect(totalPlaced(byId(T2_OVERVIEW_ABSENT))).toBe(0);
  });

  test("an unavailable anchor falls to its SECTION TOP, not the anchor bucket", () => {
    const rooms = placements(byId(T2_ANCHOR_ABSENT)).get("rooms");
    expect(rooms?.sectionTop ?? 0).toBeGreaterThan(0);
    expect(rooms?.anchor ?? 0).toBe(0); // the bug this test exists to catch
  });

  test("an unrendered crew key falls to the CREW SECTION TOP, not the crew-row bucket", () => {
    const crew = placements(byId(T2_CREW_ROW_ABSENT)).get("crew");
    expect(crew?.sectionTop ?? 0).toBeGreaterThan(0);
    expect(crew?.crewRow ?? 0).toBe(0); // the bug this test exists to catch
  });

  test("the hold-only axis produces a hold item and NO bucketed card", () => {
    const s = byId(T2_HOLD_ONLY);
    expect(s.alerts).toHaveLength(0);
    const items = itemsFor(s);
    expect(items.filter((i) => i.kind === "hold").length).toBeGreaterThan(0);
    expect(totalPlaced(s)).toBe(0); // bucketAttention excludes holds by design
  });

  test("the three actionability axes are classified by the REAL predicates", () => {
    const inbox = byId(T2_INBOX_ROUTED).alerts[0]!.code;
    expect(isInboxRouted(inbox)).toBe(true);

    const auto = byId(T2_AUTO_RESOLVING).alerts[0]!.code;
    expect(isAutoResolving(auto)).toBe(true);
    expect(isInboxRouted(auto)).toBe(false);

    const actionable = byId(T2_ACTIONABLE).alerts[0]!.code;
    expect(isInboxRouted(actionable)).toBe(false);
    expect(isAutoResolving(actionable)).toBe(false);
  });

  test("actionability reaches the derived item, not just the fixture", () => {
    const inboxItem = itemsFor(byId(T2_INBOX_ROUTED))[0]!;
    expect(inboxItem.kind).toBe("alert");
    expect(inboxItem.actionable).toBe(false);
    if (inboxItem.kind === "alert") expect(inboxItem.alert.autoClearNote).not.toBeNull();

    const actionableItem = itemsFor(byId(T2_ACTIONABLE))[0]!;
    expect(actionableItem.actionable).toBe(true);
    if (actionableItem.kind === "alert") expect(actionableItem.alert.autoClearNote).toBeNull();
  });

  test("the occurrence axis carries a count above one and it survives derivation", () => {
    const item = itemsFor(byId(T2_OCCURRENCE_MANY))[0]!;
    expect(byId(T2_OCCURRENCE_MANY).alerts[0]!.occurrence_count).toBe(7);
    if (item.kind === "alert") expect(item.alert.occurrenceCount).toBe(7);
  });

  test("the identity-absent axis declares no galleryIdentity", () => {
    expect(byId(T2_IDENTITY_ABSENT).alerts[0]!.galleryIdentity ?? null).toBeNull();
  });

  test("the uncataloged code falls back in title AND routes to Overview", () => {
    const s = byId(T2_UNCATALOGED);
    const item = itemsFor(s)[0]!;
    expect(item.menuTitle).toBe("Something needs your attention on this show.");
    expect(placements(s).get("overview")?.sectionTop ?? 0).toBeGreaterThan(0);
  });

  test("the unresolved-placeholder axis yields a null template, not a leaked token", () => {
    const item = itemsFor(byId(T2_UNRESOLVED_PLACEHOLDER))[0]!;
    if (item.kind === "alert") {
      expect(item.alert.template).toBeNull();
    }
  });

  test("the count axes are empty, one, and exactly MENU_CAP", () => {
    expect(byId(T2_EMPTY).alerts).toHaveLength(0);
    expect(byId(T2_EMPTY).holds).toHaveLength(0);
    expect(byId(T2_SINGLE).alerts).toHaveLength(1);
    expect(byId(T2_MANY).alerts).toHaveLength(MENU_CAP);
  });

  test("degraded is set on exactly one tier-2 scenario and on no tier-1 scenario", () => {
    const flagged = tier2Scenarios().filter((s) => s.degraded === true).map((s) => s.id);
    expect(flagged).toEqual([T2_DEGRADED]);
    for (const s of tier1AlertScenarios()) expect(s.degraded ?? false, s.id).toBe(false);
  });

  test("bucket appears only on the four fallback axes and on no tier-1 scenario", () => {
    const withBucket = tier2Scenarios().filter((s) => s.bucket !== undefined).map((s) => s.id).sort();
    expect(withBucket).toEqual(
      [T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_ANCHOR_ABSENT, T2_CREW_ROW_ABSENT].sort(),
    );
    for (const s of tier1AlertScenarios()) expect(s.bucket, s.id).toBeUndefined();
  });
});
```

Failure modes caught, named per test: a missing or duplicated axis (set-equality, not a count); a card that stays in the anchor or crew-row bucket while a coarse assertion would call it "fallen back"; a hold that never reaches derivation; an actionability fixture whose code is misclassified; a leaked `<placeholder>` token; and `bucket`/`degraded` leaking onto tiers that cannot reproduce them.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/dev/attentionScenariosTier2.test.ts`
Expected: FAIL, cannot resolve `@/lib/dev/attentionScenarios/tier2`.

- [ ] **Step 3: Implement, with runtime classification and no omitted axes**

```ts
// lib/dev/attentionScenarios/tier2.ts
import { ATTENTION_ROUTES } from "@/lib/admin/attentionItems";
import { isInboxRouted } from "@/lib/messages/adminSurface";
import { isAutoResolving } from "@/lib/adminAlerts/audience";
import type { AttentionScenario, ScenarioAlertRow, ScenarioHoldRow } from "./types";

export const MENU_CAP = 12;
const AT = "2026-07-01T12:00:00.000Z";

export const T2_SECTION_ABSENT = "t2-section-absent";
export const T2_OVERVIEW_ABSENT = "t2-overview-absent";
export const T2_ANCHOR_ABSENT = "t2-anchor-absent";
export const T2_CREW_ROW_ABSENT = "t2-crew-row-absent";
export const T2_HOLD_ONLY = "t2-hold-only";
export const T2_INBOX_ROUTED = "t2-inbox-routed";
export const T2_AUTO_RESOLVING = "t2-auto-resolving";
export const T2_ACTIONABLE = "t2-actionable";
export const T2_OCCURRENCE_MANY = "t2-occurrence-many";
export const T2_IDENTITY_ABSENT = "t2-identity-absent";
export const T2_UNCATALOGED = "t2-uncataloged";
export const T2_UNRESOLVED_PLACEHOLDER = "t2-unresolved-placeholder";
export const T2_EMPTY = "t2-empty";
export const T2_SINGLE = "t2-single";
export const T2_MANY = "t2-many";
export const T2_DEGRADED = "t2-degraded";

export const T2_REQUIRED_IDS = [
  T2_SECTION_ABSENT, T2_OVERVIEW_ABSENT, T2_ANCHOR_ABSENT, T2_CREW_ROW_ABSENT,
  T2_HOLD_ONLY, T2_INBOX_ROUTED, T2_AUTO_RESOLVING, T2_ACTIONABLE,
  T2_OCCURRENCE_MANY, T2_IDENTITY_ABSENT, T2_UNCATALOGED, T2_UNRESOLVED_PLACEHOLDER,
  T2_EMPTY, T2_SINGLE, T2_MANY, T2_DEGRADED,
] as const;

/**
 * Classify at RUNTIME against the real predicates. INBOX_ROUTED_CODES and
 * AUTO_RESOLVING_CODES are themselves derived from the message catalog, so a
 * hardcoded code would silently stop representing its axis when the catalog moves.
 * Throwing here is deliberate: an empty class is a catalog change this matrix must
 * be updated for, not a scenario to skip.
 */
function pickCode(kind: "inbox" | "auto" | "actionable"): string {
  const codes = Object.keys(ATTENTION_ROUTES).filter((c) => c !== "PICKER_EPOCH_RESET").sort();
  const found = codes.find((c) => {
    const inbox = isInboxRouted(c);
    const auto = isAutoResolving(c);
    if (kind === "inbox") return inbox;
    if (kind === "auto") return auto && !inbox;
    return !inbox && !auto;
  });
  if (found === undefined) throw new Error(`tier2: no ATTENTION_ROUTES code is ${kind}`);
  return found;
}

function alert(code: string, over: Partial<Omit<ScenarioAlertRow, "code">> = {}): ScenarioAlertRow {
  return { code, context: {}, raised_at: AT, occurrence_count: 1, ...over };
}

function hold(entityKey: string): ScenarioHoldRow {
  return {
    drive_file_id: "gallery-fixture-file",
    domain: "crew_email",
    entity_key: entityKey,
    held_value: { email: "old@example.test" },
    proposed_value: { disposition: "email_change", name: "Dana Reed", email: "new@example.test" },
    base_modified_time: AT,
    kind: "mi11_pending",
  };
}

function scenario(
  id: string,
  label: string,
  rest: Omit<AttentionScenario, "id" | "tier" | "label">,
): AttentionScenario {
  return { id, tier: 2, label, ...rest };
}

// A crew-routed code and an anchored code, read from the routing table so the
// fixtures cannot disagree with it.
const CREW_CODE = Object.keys(ATTENTION_ROUTES).find(
  (c) => ATTENTION_ROUTES[c]?.sectionId === "crew",
)!;
const ANCHORED_CODE = Object.keys(ATTENTION_ROUTES).find(
  (c) => ATTENTION_ROUTES[c]?.sectionId === "rooms",
)!;

export function tier2Scenarios(): AttentionScenario[] {
  return [
    scenario(T2_SECTION_ABSENT, "Routed section unavailable, falls back to Overview", {
      alerts: [alert(CREW_CODE)],
      holds: [],
      bucket: { sectionAvailable: (s) => s === "overview" },
    }),
    scenario(T2_OVERVIEW_ABSENT, "No section available, card is dropped", {
      alerts: [alert(CREW_CODE)],
      holds: [],
      bucket: { sectionAvailable: () => false },
    }),
    scenario(T2_ANCHOR_ABSENT, "Anchor slot absent, falls back to section top", {
      alerts: [alert(ANCHORED_CODE)],
      holds: [],
      bucket: { anchorAvailable: () => false },
    }),
    scenario(T2_CREW_ROW_ABSENT, "Crew key unrendered, falls back to crew section top", {
      alerts: [
        alert("ROLE_FLAGS_NOTICE", {
          context: { role_change_count: 1, role_change_crew_names: ["Dana Reed"] },
        }),
      ],
      holds: [],
      bucket: { crewKeyRendered: () => false },
    }),
    scenario(T2_HOLD_ONLY, "A pending hold and no alerts", {
      alerts: [],
      holds: [hold("dana-reed")],
    }),
    scenario(T2_INBOX_ROUTED, "Inbox-routed code, auto-clears with the inbox note", {
      alerts: [alert(pickCode("inbox"))],
      holds: [],
    }),
    scenario(T2_AUTO_RESOLVING, "Self-resolving code, auto-clears with its own note", {
      alerts: [alert(pickCode("auto"))],
      holds: [],
    }),
    scenario(T2_ACTIONABLE, "Actionable code, manual resolve control renders", {
      alerts: [alert(pickCode("actionable"))],
      holds: [],
    }),
    scenario(T2_OCCURRENCE_MANY, "Repeat count above one", {
      alerts: [alert(pickCode("actionable"), { occurrence_count: 7 })],
      holds: [],
    }),
    scenario(T2_IDENTITY_ABSENT, "No declared identity, so no menu subtitle", {
      alerts: [alert(pickCode("actionable"), { galleryIdentity: null })],
      holds: [],
    }),
    scenario(T2_UNCATALOGED, "Uncataloged code, fallback title and Overview route", {
      alerts: [alert("GALLERY_UNCATALOGED_CODE")],
      holds: [],
    }),
    scenario(T2_UNRESOLVED_PLACEHOLDER, "Params leave a token uninterpolated, template drops", {
      // A cataloged code whose dougFacing template carries a <placeholder>, given
      // an empty context so interpolation cannot complete.
      alerts: [alert(pickCode("actionable"), { context: {} })],
      holds: [],
    }),
    scenario(T2_EMPTY, "No attention at all", { alerts: [], holds: [] }),
    scenario(T2_SINGLE, "Exactly one item", { alerts: [alert(pickCode("actionable"))], holds: [] }),
    scenario(T2_MANY, `${MENU_CAP} items, menu crosses its scroll threshold`, {
      alerts: Array.from({ length: MENU_CAP }, (_, i) =>
        alert(`GALLERY_FILLER_${String(i).padStart(2, "0")}`),
      ),
      holds: [],
    }),
    scenario(T2_DEGRADED, "Alert read degraded", { alerts: [], holds: [], degraded: true }),
  ];
}
```

Two notes the implementer needs. `T2_UNRESOLVED_PLACEHOLDER` must use a code whose catalog `dougFacing` actually contains a `<token>`; confirm with `rg -n "dougFacing" -A2 lib/messages/catalog.ts | rg "<[a-z_]+>"` and pin that code explicitly if `pickCode("actionable")` does not happen to return one — the test asserts `template === null`, so a code without a placeholder fails loudly rather than silently weakening the axis. `GALLERY_UNCATALOGED_CODE` and the `GALLERY_FILLER_*` codes are deliberately absent from both `MESSAGE_CATALOG` and `ATTENTION_ROUTES`, which is what makes them exercise the fallbacks.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/dev/attentionScenariosTier2.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 5: Commit**

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
    const ids = materializableScenarios().map((s) => s.id).sort();
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
        { code: "PARSE_ERROR_LAST_GOOD", context: { error_code: "ROOMS_BLOCK_MISSING" }, raised_at: AT, occurrence_count: 1 },
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

### Task 8: `ScenarioBlock` client component

Spec §4.0, §4.1, §4.4.

**Files:**
- Create: `components/admin/dev/ScenarioBlock.tsx (new)`
- Test: `tests/components/admin/dev/scenarioBlock.test.tsx (new)`

**Interfaces:**
- Produces: `ScenarioBlockProps` exactly as §4.0 defines. Restated here because the implementer sees only this task:

```ts
export type ReadoutRow = { label: string; value: string };
export type ScenarioGroup = {
  sectionId: string;
  placement: "sectionTop" | "crewRow" | "anchor";
  anchorOrCrewKey: string | null;
  nodes: ReactNode[];
};
export type ScenarioBlockProps = {
  scenarioId: string;
  label: string;
  items: AttentionItem[];
  groups: ScenarioGroup[];
  holdItems: AttentionItem[];
  readout: ReadoutRow[];
  warnings: ParseWarning[] | null;
  degraded: boolean;
  maxWidthPx: number | null;
};
```

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/dev/scenarioBlock.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScenarioBlock } from "@/components/admin/dev/ScenarioBlock";
import type { ScenarioBlockProps } from "@/components/admin/dev/ScenarioBlock";
import type { AttentionItem } from "@/lib/admin/attentionItems";

function baseProps(over: Partial<ScenarioBlockProps> = {}): ScenarioBlockProps {
  return {
    scenarioId: "t2-single",
    label: "Exactly one item",
    items: [],
    groups: [],
    holdItems: [],
    readout: [{ label: "code", value: "SYNC_STALLED" }],
    warnings: null,
    degraded: false,
    maxWidthPx: null,
    ...over,
  };
}

describe("ScenarioBlock", () => {
  test("a form submit inside the block never fires its action", async () => {
    const action = vi.fn();
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [{
            sectionId: "overview",
            placement: "sectionTop",
            anchorOrCrewKey: null,
            nodes: [
              <form key="f" action={action}>
                <button type="submit">Resolve</button>
              </form>,
            ],
          }],
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(action).not.toHaveBeenCalled();
  });

  test("the menu renders the supplied items, and the pill toggles it", async () => {
    const item: AttentionItem = {
      id: "alert:1", kind: "alert", tone: "notice", sectionId: "overview", crewKey: null,
      actionable: true, menuTitle: "Sync stalled", menuSubtitle: "dana@example.test",
      alert: {
        alertId: "1", code: "SYNC_STALLED", template: null, params: {}, action: null,
        helpHref: null, raisedAt: "2026-07-01T12:00:00.000Z", occurrenceCount: 1,
        autoClearNote: null, failedKeys: null, dataGaps: null, errorCode: null,
      },
    };
    render(<ScenarioBlock {...baseProps({ items: [item] })} />);
    // open by default (spec 4.0), so the item is visible without a click
    expect(screen.getByText("Sync stalled")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /attention/i }));
    expect(screen.queryByText("Sync stalled")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /attention/i }));
    expect(screen.getByText("Sync stalled")).toBeInTheDocument();
  });

  test("activating an item records it in the navigation readout", async () => {
    const item: AttentionItem = {
      id: "alert:42", kind: "hold", tone: "critical", sectionId: "changes", crewKey: null,
      actionable: true, menuTitle: "Pick what happens", menuSubtitle: null,
    };
    render(<ScenarioBlock {...baseProps({ items: [item] })} />);
    await userEvent.click(screen.getByText("Pick what happens"));
    expect(screen.getByTestId("navigated").textContent ?? "").toContain("alert:42");
  });

  test("the pill shows the item count, and the degraded label when degraded", () => {
    const { rerender } = render(<ScenarioBlock {...baseProps({ items: [], degraded: false })} />);
    expect(screen.getByRole("button", { name: /attention \(0\)/i })).toBeInTheDocument();
    rerender(<ScenarioBlock {...baseProps({ degraded: true })} />);
    expect(screen.getByRole("button", { name: /degraded/i })).toBeInTheDocument();
  });

  test("renders one labelled group per section with its nodes", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [
            { sectionId: "overview", placement: "sectionTop", anchorOrCrewKey: null, nodes: [<p key="a">card-a</p>] },
            { sectionId: "rooms", placement: "anchor", anchorOrCrewKey: "diagrams", nodes: [<p key="b">card-b</p>] },
          ],
        })}
      />,
    );
    const overview = screen.getByTestId("group-overview-sectionTop");
    expect(within(overview).getByText("card-a")).toBeInTheDocument();
    expect(within(overview).getByRole("heading", { name: "overview" })).toBeInTheDocument();
    const rooms = screen.getByTestId("group-rooms-anchor");
    expect(within(rooms).getByText("card-b")).toBeInTheDocument();
    expect(within(rooms).getByRole("heading", { name: "rooms / diagrams" })).toBeInTheDocument();
  });

  test("holds render in their own group and NOT inside a section group", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [{ sectionId: "overview", placement: "sectionTop", anchorOrCrewKey: null, nodes: [<p key="a">card-a</p>] }],
          holdItems: [{ id: "hold:1", kind: "hold", tone: "critical", sectionId: "changes", crewKey: null, actionable: true, menuTitle: "Pick what happens", menuSubtitle: null }],
        })}
      />,
    );
    const holds = screen.getByTestId("hold-group");
    expect(within(holds).getByText("Pick what happens")).toBeInTheDocument();
    // isolation: the section group exists and must NOT contain the hold
    const overview = screen.getByTestId("group-overview-sectionTop");
    expect(within(overview).queryByText("Pick what happens")).not.toBeInTheDocument();
    // and the hold appears exactly once in the whole tree
    expect(screen.getAllByText("Pick what happens")).toHaveLength(1);
  });

  test("warnings null renders no warning cards at all", () => {
    render(<ScenarioBlock {...baseProps({ warnings: null })} />);
    expect(screen.queryByTestId("warnings-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("warnings-muted")).not.toBeInTheDocument();
  });

  test("warnings present renders BOTH skins, each carrying the warning content", () => {
    render(<ScenarioBlock {...baseProps({ warnings: [{ severity: "warn", code: "BLOCK_DISAPPEARED", message: "Synthetic warning for gallery review." }] })} />);
    const active = screen.getByTestId("warnings-warning");
    const muted = screen.getByTestId("warnings-muted");
    // Not just that the wrappers exist: each must actually render the warning.
    expect(within(active).getByText(/Synthetic warning for gallery review/)).toBeInTheDocument();
    expect(within(muted).getByText(/Synthetic warning for gallery review/)).toBeInTheDocument();
    // The two skins must differ; identical markup means one tone was not applied.
    expect(active.innerHTML).not.toEqual(muted.innerHTML);
  });

  test("the readout renders EVERY row, not just the first", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          readout: [
            { label: "sectionId", value: "rooms" },
            { label: "anchor", value: "diagrams" },
            { label: "actionable", value: "true" },
          ],
        })}
      />,
    );
    const dl = screen.getByTestId("readout");
    for (const [label, value] of [["sectionId", "rooms"], ["anchor", "diagrams"], ["actionable", "true"]]) {
      expect(within(dl).getByText(label!)).toBeInTheDocument();
      expect(within(dl).getByText(value!)).toBeInTheDocument();
    }
    expect(within(dl).getAllByRole("term")).toHaveLength(3);
  });

  test("maxWidthPx applies only for a positive finite number", () => {
    const { rerender } = render(<ScenarioBlock {...baseProps({ maxWidthPx: null })} />);
    expect(screen.getByTestId("block-root").style.maxWidth).toBe("");
    rerender(<ScenarioBlock {...baseProps({ maxWidthPx: 390 })} />);
    expect(screen.getByTestId("block-root").style.maxWidth).toBe("390px");
    // The page normalizes this value, but the component must not emit "NaNpx" or
    // "-1px" if it ever receives one; absence is the documented fallback.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      rerender(<ScenarioBlock {...baseProps({ maxWidthPx: bad })} />);
      expect(screen.getByTestId("block-root").style.maxWidth, String(bad)).toBe("");
    }
  });
});
```

Each test names a §4.1 requirement that could otherwise be silently omitted. jsdom loads no CSS, so these assert structure and attributes only — real visibility and geometry belong to Task 16.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/components/admin/dev/scenarioBlock.test.tsx`
Expected: FAIL, cannot resolve the component.

- [ ] **Step 3: Implement**

```tsx
// components/admin/dev/ScenarioBlock.tsx
"use client";
import { useRef, useState, type ReactNode } from "react";
import { AttentionMenu } from "@/components/admin/showpage/AttentionMenu";
import { PerShowActionableWarnings } from "@/components/admin/PerShowActionableWarnings";
import type { AttentionItem } from "@/lib/admin/attentionItems";
import type { ParseWarning } from "@/lib/parser/types";

export type ReadoutRow = { label: string; value: string };
export type ScenarioGroup = {
  sectionId: string;
  placement: "sectionTop" | "crewRow" | "anchor";
  anchorOrCrewKey: string | null;
  nodes: ReactNode[];
};
export type ScenarioBlockProps = {
  scenarioId: string;
  label: string;
  items: AttentionItem[];
  groups: ScenarioGroup[];
  holdItems: AttentionItem[];
  readout: ReadoutRow[];
  warnings: ParseWarning[] | null;
  degraded: boolean;
  maxWidthPx: number | null;
};

export function ScenarioBlock(props: ScenarioBlockProps) {
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);
  const [navigated, setNavigated] = useState<string | null>(null);

  return (
    <section
      data-testid="block-root"
      className="relative mb-16 pb-[26rem]"
      // Positive finite only: never emit "NaNpx" or "-1px". The page normalizes
      // this value (Task 9), so this guard is belt-and-braces, not a second parser.
      style={
        props.maxWidthPx !== null && Number.isFinite(props.maxWidthPx) && props.maxWidthPx > 0
          ? { maxWidth: `${props.maxWidthPx}px` }
          : undefined
      }
      // Spec §4.4: every server action in this subtree posts through a form submit,
      // so one capture-phase preventDefault neutralizes all of them, including any
      // added later, without touching a production component.
      onSubmitCapture={(e) => e.preventDefault()}
    >
      <h2 id={props.scenarioId} className="font-bold text-lg mb-2">
        {props.label}
      </h2>

      <dl data-testid="readout" className="mb-3 text-sm">
        {props.readout.map((r) => (
          <div key={`${r.label}:${r.value}`}>
            <dt className="inline font-semibold">{r.label}</dt>
            <dd className="inline ml-2">{r.value}</dd>
          </div>
        ))}
      </dl>

      <div className="relative inline-block">
        <button ref={pillRef} type="button" onClick={() => setOpen((v) => !v)}>
          {props.degraded ? "Attention (degraded)" : `Attention (${props.items.length})`}
        </button>
        <AttentionMenu
          items={props.items}
          open={open}
          onClose={() => setOpen(false)}
          onNavigate={(item) => setNavigated(item.id)}
          pillRef={pillRef}
        />
      </div>
      {navigated === null ? null : <p data-testid="navigated">navigate: {navigated}</p>}

      {props.groups.map((g) => (
        <div key={`${g.sectionId}-${g.placement}-${g.anchorOrCrewKey ?? ""}`} data-testid={`group-${g.sectionId}-${g.placement}`}>
          <h3 className="font-semibold mt-4">
            {g.sectionId}
            {g.anchorOrCrewKey === null ? "" : ` / ${g.anchorOrCrewKey}`}
          </h3>
          {g.nodes}
        </div>
      ))}

      {props.holdItems.length === 0 ? null : (
        <div data-testid="hold-group">
          <h3 className="font-semibold mt-4">Holds (Changes feed, not bucketed)</h3>
          <ul>
            {props.holdItems.map((h) => (
              <li key={h.id}>{h.menuTitle}</li>
            ))}
          </ul>
        </div>
      )}

      {props.warnings === null ? null : (
        <>
          <div data-testid="warnings-warning">
            <PerShowActionableWarnings items={props.warnings} driveFileId="gallery-fixture" tone="warning" />
          </div>
          <div data-testid="warnings-muted">
            <PerShowActionableWarnings items={props.warnings} driveFileId="gallery-fixture" tone="muted" />
          </div>
        </>
      )}
    </section>
  );
}
```

The `pb-[26rem]` reserves space for the absolutely-positioned menu (§4.0); Task 16 measures whether it is sufficient at both widths.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/components/admin/dev/scenarioBlock.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add components/admin/dev/ScenarioBlock.tsx tests/components/admin/dev/scenarioBlock.test.tsx
git commit -m "feat(dev): ScenarioBlock with submit interception and live menu state"
```

---

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
  localUrl: string | undefined;        // process.env.SUPABASE_URL
  localKey: string | undefined;        // process.env.SUPABASE_SECRET_KEY
  validationUrl: string | undefined;   // VALIDATION_SUPABASE_URL
  validationKey: string | undefined;   // VALIDATION_SUPABASE_SECRET_KEY
  validationRef: string | undefined;   // VALIDATION_SUPABASE_PROJECT_REF
};
export type RefusalCode =
  | "local_not_loopback" | "local_url_missing" | "local_key_missing"
  | "validation_unconfirmed" | "validation_triple_incomplete"
  | "validation_ref_mismatch" | "validation_ref_disagrees" | "unknown_target";
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
  | "slug_missing" | "show_archived" | "scenario_unknown" | "scenario_not_tier3"
  | "scenario_duplicate_alert_code" | "scenario_duplicate_hold_key" | "nothing_to_materialize";
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
  | { kind: "ok"; alerts: number; holds: number; warnings: "written" | "untouched" | "skipped_validation"; skipped: Skip[] }
  | { kind: "partial"; committed: { alerts: number; holds: number }; failedStep: string; message: string }
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

### Task 14: The materialize dev-panel card

Spec §5.3, §9, §7.4. Full mechanical UI checklist applies — this surface has operator-facing copy.

**Files:**
- Create: `components/admin/dev/MaterializeCard.tsx (new)`
- Modify: `app/admin/dev/page.tsx`
- Test: `tests/components/admin/dev/materializeCard.test.tsx (new)`

**Interfaces:**

```ts
export type MaterializeCardProps = {
  scenarios: Array<{ id: string; label: string }>; // tier-3 only, from materializableScenarios()
  applyAction: (fd: FormData) => Promise<void>;    // applyAttentionScenarioFormAction
  clearAction: (fd: FormData) => Promise<void>;    // clearAttentionScenarioFormAction
  lastResult: MaterializeResult | null;            // rendered as operator copy, never raw
};
```

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/admin/dev/materializeCard.test.tsx
import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MaterializeCard } from "@/components/admin/dev/MaterializeCard";

function props(over = {}) {
  return {
    scenarios: [{ id: "t3-sheet-missing-mid-parse", label: "Sheet went missing mid-parse" }],
    applyAction: vi.fn(async () => {}),
    clearAction: vi.fn(async () => {}),
    lastResult: null,
    ...over,
  };
}

describe("MaterializeCard", () => {
  test("the confirmation control appears only for the validation target", async () => {
    render(<MaterializeCard {...props()} />);
    expect(screen.queryByLabelText(/confirm/i)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/environment/i), "validation");
    expect(screen.getByLabelText(/confirm/i)).toBeInTheDocument();
  });

  test("switching target back to local resets confirmation to unconfirmed", async () => {
    render(<MaterializeCard {...props()} />);
    const env = screen.getByLabelText(/environment/i);
    await userEvent.selectOptions(env, "validation");
    await userEvent.click(screen.getByLabelText(/confirm/i));
    expect(screen.getByLabelText(/confirm/i)).toBeChecked();
    await userEvent.selectOptions(env, "local");
    await userEvent.selectOptions(env, "validation");
    expect(screen.getByLabelText(/confirm/i)).not.toBeChecked();
  });

  test("the Clear control states that it removes ALL synthetic rows for the show", () => {
    render(<MaterializeCard {...props()} />);
    expect(screen.getByTestId("clear-scope-note").textContent ?? "").toMatch(
      /all synthetic rows for this show/i,
    );
  });

  test("a displayed result clears when any control changes", async () => {
    render(<MaterializeCard {...props({ lastResult: { kind: "ok", alerts: 2, holds: 0, warnings: "untouched", skipped: [] } })} />);
    expect(screen.getByTestId("result")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/environment/i), "validation");
    expect(screen.queryByTestId("result")).not.toBeInTheDocument();
  });

  test("every control meets the tap-target minimum", () => {
    render(<MaterializeCard {...props()} />);
    for (const el of screen.getAllByRole("button")) {
      expect(el.className).toContain("min-h-tap-min");
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement the card.** A `<form action={applyAction}>` and a `<form action={clearAction}>`, sharing a scenario `<select>`, a slug `<input>`, and an environment `<select>`. Local state: `env`, `confirmed`, `resultDismissed`. `confirmed` resets to `false` in the environment `onChange`. Any control change sets `resultDismissed`, which hides `lastResult`. Both submit buttons carry `min-h-tap-min` and disable while `useFormStatus().pending`. Result copy resolves through `lib/messages/lookup.ts`; raw `MaterializeResult` codes appear only in a developer detail line, per the §1.1 exception. No em-dashes.
- [ ] **Step 4: Mount it** in `app/admin/dev/page.tsx`, passing `materializableScenarios()` mapped to `{ id, label }` and the two form actions.
- [ ] **Step 5: Run to verify it passes.**
- [ ] **Step 6: Commit**

```bash
git add components/admin/dev/MaterializeCard.tsx app/admin/dev/page.tsx tests/components/admin/dev/materializeCard.test.tsx
git commit -m "feat(dev): materialize card on the dev panel"
```

---

### Task 15: Database behavioral tests

Spec §12. These are the acceptance gate for Tasks 11 and 12, so **any fix they surface is part of this task's commit** — the staged paths below include the implementation files deliberately.

**Files:**
- Create: `tests/dev/materializeRoundTrip.realdb.test.ts (new)`
- Modify (as the tests require): `app/admin/dev/actions.ts`, `lib/dev/materialize/plan.ts (new)`, `lib/dev/materialize/env.ts (new)`

Requires a local Supabase (`pnpm preflight` green). Every assertion reads the database directly, never the action's own report.

- [ ] **Step 1: Write the failing tests**, in this order:
  1. **`LIKE` wildcard safety** — seed `sync_holds` rows with `created_by` of `xxdevScenario:real` and `a_bdevScenario:real`; run Apply then Clear; assert both survive byte-identical. Catches the unescaped `_` single-character wildcard, which every correctly-tagged fixture would miss.
  2. **Clear preserves authentic rows** — seed untagged alerts and holds; Clear; assert byte-identical.
  3. **Apply A then Apply B** leaves exactly B's synthetic alerts and holds, minus skips.
  4. **Alert collision skip** — seed a real unresolved alert of code C; apply a scenario containing C and D; assert D inserted, C reported skipped, real C row byte-identical.
  5. **Hold collision skip** on `(show_id, domain, entity_key)` — same shape.
  6. **Warnings tri-state** — absent leaves `parse_warnings` byte-identical; `[]` writes `[]`; validation target never writes.
  7. **Guards commit no writes** — full before/after content snapshots of all three tables.
- [ ] **Step 2: Run to verify they fail or error.**

Run: `pnpm vitest run tests/dev/materializeRoundTrip.realdb.test.ts`

- [ ] **Step 3: Fix what they surface** in the files listed above. Expect the `LIKE` escape and the collision-skip paths to need work; they are the two the unit tests cannot fully cover.
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit — staging the implementation fixes with the tests**

```bash
git add tests/dev/materializeRoundTrip.realdb.test.ts app/admin/dev/actions.ts lib/dev/materialize/
git commit -m "test(dev): materialize round-trip, collision, and wildcard-safety proofs"
```

---

### Task 16: Real-browser layout and transition audit

Spec §8, §9. jsdom computes no layout and loads no CSS, so neither assertion here can be made in Vitest.

**Files:**
- Create: `tests/e2e/attention-gallery-layout.spec.ts (new)`
- Modify: `playwright.config.ts`

**Harness readiness — verified at plan time:**
- **Server:** the existing **`dev-build` project on port 3001**, which is already built with `ADMIN_DEV_PANEL_ENABLED=true` and already hosts the sibling dev harnesses (`source-link-dimensional`, `telemetry-layout`). Do **not** add a standalone config: `tests/e2e/standalone.config.ts` is for specs that boot their own server and need no Next route, which does not describe a route-based spec. Do **not** use port 3000 — a sibling worktree's dev server there would serve the wrong code.
- **Discovery:** `playwright.config.ts`'s `testMatch` is an **explicit allow-list**. Add `attention-gallery-layout` to the `dev-build` project's regex, or the spec runs nowhere and silently proves nothing.
- **Readiness gate:** the menu renders **open by default** (`useState(true)`, Task 8), so the gate is: wait for `[data-testid="block-root"]` to be attached, then wait for the pill's `aria-expanded="true"`. No click is required to reach that state. Never `networkidle` alone.
- **Detach safety:** re-query each locator immediately before every `evaluate`; auto-wait hangs on an unmounted node.

- [ ] **Step 1: Add the spec to `testMatch` and write the failing spec.**

```ts
// tests/e2e/attention-gallery-layout.spec.ts
import { expect, test } from "@playwright/test";

const URL_NARROW = "/admin/dev/attention-gallery?tier=2&w=320";
const URL_WIDE = "/admin/dev/attention-gallery?tier=2&w=1280";

async function ready(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  await page.locator('[data-testid="block-root"]').first().waitFor({ state: "attached" });
  await expect(page.locator('[aria-expanded="true"]').first()).toBeAttached();
}

for (const [name, url] of [["narrow", URL_NARROW], ["wide", URL_WIDE]] as const) {
  test(`adjacent open menus do not overlap (${name})`, async ({ page }) => {
    await ready(page, url);
    const menus = page.locator('[data-testid="attention-menu"]');
    const count = await menus.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i + 1 < count; i++) {
      const a = await menus.nth(i).boundingBox();
      const b = await menus.nth(i + 1).boundingBox();
      expect(a && b).toBeTruthy();
      if (a && b) expect(a.y + a.height).toBeLessThanOrEqual(b.y + 0.5);
    }
  });
}

test("a MENU_CAP-item menu actually crosses its scroll threshold", async ({ page }) => {
  await ready(page, "/admin/dev/attention-gallery?scenario=t2-many");
  const list = page.locator('[data-testid="attention-menu"] .overflow-y-auto').first();
  const { scrollHeight, clientHeight } = await list.evaluate((el) => ({
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
  }));
  expect(scrollHeight).toBeGreaterThan(clientHeight);
});
```

The scroll assertion is why `MENU_CAP` is 12 rather than an assumed-sufficient number: it proves the cap reaches the state it claims to demonstrate.

- [ ] **Step 2: Run to verify it fails**

Run: `node_modules/.bin/playwright test tests/e2e/attention-gallery-layout.spec.ts --project=dev-build`
Expected: FAIL on overlap, because the reserved space in Task 8 is unverified.

- [ ] **Step 3: Adjust the reserved space** in `ScenarioBlock` until both widths pass. The menu is `absolute` with a `max-h-96` list, so the reservation must cover the list plus header and footer plus the `8px` offset.

- [ ] **Step 4: Run to verify it passes.**

- [ ] **Step 5: Write the failing transition audit.** This is a TDD cycle of its own, not an afterthought. The inventory it enforces is the spec's §9 table, restated here so the implementer needs no second document:

| From | To | Required treatment |
| --- | --- | --- |
| menu closed | menu open | `AttentionMenu`'s own `transition-[opacity,transform] duration-fast`, inherited unchanged |
| menu open | menu closed | same transition, reversed; `motion-reduce:transition-none` honored |
| navigation readout unset | set | instant |
| readout set | set to a different item | instant |
| help popover closed | open, menu open | instant for the composition |
| help popover open | closed, menu open | instant |
| menu open | closed while the help popover is open | the menu's exit transition only; the popover is a **descendant** and unmounts with it, deliberately not animated separately |
| warning collapsed | expanded, menu open | instant; warnings are **siblings** of the menu |
| warning expanded | collapsed, menu open | instant |
| warning collapsed | expanded, menu closed | instant |
| warning expanded | collapsed, menu closed | instant |
| menu closed | opened while a warning is expanded | the menu's entry transition; the card is unaffected |
| menu open | closed while a warning is expanded | the menu's exit transition; the card stays expanded |
| warning toggled | while the menu is mid-transition | instant, not queued |
| help popover toggled | while the menu is mid-transition | instant; a descendant toggling inside an animating ancestor, safe because the menu animates only `opacity`/`transform` |
| materialize: idle | submitting | instant, controls disable |
| materialize: submitting | result | instant |
| materialize: result | idle | instant, on any control change |
| materialize: local | validation | instant, reveals confirmation |
| materialize: validation | local | instant, hides and **resets** confirmation |
| materialize: unconfirmed | confirmed | instant |
| materialize: confirmed | unconfirmed | instant |

The audit asserts: every `AnimatePresence`, ternary render, and conditional block in `ScenarioBlock.tsx (new)` and `MaterializeCard.tsx (new)` appears in this table; each either carries the named transition classes or is deliberately instant; and the two compound cases are exercised for real — toggle the help popover while the menu is mid-transition, and change the environment while a result is displayed.

- [ ] **Step 6: Run, fix, and verify the audit passes.**

- [ ] **Step 7: Commit**

```bash
git add tests/e2e/attention-gallery-layout.spec.ts playwright.config.ts components/admin/dev/ScenarioBlock.tsx
git commit -m "test(dev): real-browser menu overlap, scroll threshold, and transition audit"
```

---

### Task 17: Close-out

**Files:**
- Create: `docs/superpowers/plans/2026-07-21-attention-scenario-gallery-handoff.md (new)` — the close-out record. It is a real file with a real path, and it is committed; without it the mandated evidence has nowhere to live.

- [ ] **Step 1: Full local gates**

Run: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`
All must pass. A scoped run is not sufficient — `tests/styles` and `tests/help` carry registry checks a components-only run skips.

- [ ] **Step 2: impeccable dual-gate**, scoped per §7.4: full mechanical checklist on `MaterializeCard`; findings on gallery chrome triaged against the `source-link-dim` minimal-chrome precedent; findings about the production components the gallery renders unmodified are out of scope for this diff. Record every finding and its disposition in §12 of the handoff file.

- [ ] **Step 3: Manual artifact verification at BOTH flag states.** Two distinct commands, because the variable must actually differ between them:

```bash
# disabled posture: the route must be ABSENT from the artifact
ADMIN_DEV_PANEL_ENABLED= RUN_BUILD_ARTIFACT_GATE_TEST=1 \
  pnpm vitest run tests/admin/build-artifact-gate.test.ts

# enabled posture: the route must be PRESENT
ADMIN_DEV_PANEL_ENABLED=true RUN_BUILD_ARTIFACT_GATE_TEST=1 \
  pnpm vitest run tests/admin/build-artifact-gate.test.ts
```

Paste both outputs into the handoff. This check does not run in CI (§6a), so the handoff is the only record that it was performed.

- [ ] **Step 4: Whole-diff Codex review to APPROVE.** Split by surface, each brief **under 330 lines** — measured this run: a 325-line brief returned a verdict on the first attempt, while 381- and 409-line briefs failed silently with empty transcripts. Suggested split: catalog and validator; gallery route and `ScenarioBlock`; materialize actions, env gate, and planner; tests and meta-tests.

- [ ] **Step 5: Commit the handoff, then ship**

```bash
git add docs/superpowers/plans/2026-07-21-attention-scenario-gallery-handoff.md
git commit -m "docs(admin): close-out record for the attention scenario gallery"
git push -u origin feat/attention-scenario-gallery
gh pr create --fill
gh pr checks --watch   # pass the PR number, not a SHA
gh pr merge --merge
git -C /Users/ericweiss/FX-Webpage-Template pull --ff-only
git -C /Users/ericweiss/FX-Webpage-Template rev-list --left-right --count main...origin/main  # must be 0	0
```
