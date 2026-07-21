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
    <ScenarioBlock {...baseProps()} groups={[{
      sectionId: "overview", placement: "sectionTop", anchorOrCrewKey: null,
      nodes: [<form key="f" action={action}><button type="submit">Resolve</button></form>],
    }]} />,
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

### Task 14: The materialize dev-panel card

Spec §5.3, §9. Full mechanical UI checklist applies here — this surface has operator-facing copy.

**Files:**
- Create: `components/admin/dev/MaterializeCard.tsx (new)`
- Modify: `app/admin/dev/page.tsx`
- Test: `tests/components/admin/dev/materializeCard.test.tsx (new)`

- [ ] **Step 1: Write the failing test** — controls disable while a request is in flight (the double-submit guard); switching target resets confirmation to unconfirmed; a displayed result clears when any control changes; the confirmation control appears only for validation; and the destructive-scope copy states that Clear removes **all** synthetic rows for the show, not just the selected scenario.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** the card. Copy resolves through `lib/messages/lookup.ts` for operator-facing outcomes. `min-h-tap-min` on every control. No em-dashes.
- [ ] **Step 4: Run to verify it passes.** - [ ] **Step 5: Commit**

```bash
git add components/admin/dev/MaterializeCard.tsx app/admin/dev/page.tsx tests/components/admin/dev/materializeCard.test.tsx
git commit -m "feat(dev): materialize card on the dev panel"
```

---

### Task 15: Database behavioral tests

Spec §12. Every test here states the failure mode it catches; none passes merely because a function was called.

**Files:**
- Create: `tests/dev/materializeRoundTrip.realdb.test.ts (new)`

Requires a local Supabase (`pnpm preflight` green). Each test seeds, acts, and asserts against the database directly — never against the action's own report.

- [ ] **Step 1: Write the failing tests.** In order of value:
  1. **`LIKE` wildcard safety** — seed `created_by = 'xxdevScenario:real'` and `'a_bdevScenario:real'`; run Apply and Clear; assert both survive byte-identical. Catches the unescaped `_` deleting authentic rows, which every correctly-tagged fixture would miss.
  2. **Clear preserves authentic rows** — seed untagged alerts and holds; Clear; assert byte-identical, not merely counted.
  3. **Apply A then Apply B** leaves exactly B's synthetic alerts and holds, minus skips.
  4. **Collision skip** — seed a real unresolved alert of code C; apply a scenario with C and D; assert D inserted, C reported skipped, and the real C row byte-identical.
  5. **Authentic hold collision** on `(domain, entity_key)` — same shape.
  6. **Warnings tri-state** — absent leaves the column byte-identical; `[]` writes `[]`.
  7. **Guards commit no writes** — full before/after content snapshots, not row counts.
- [ ] **Step 2: Run to verify they fail** (or error) against the current implementation.
- [ ] **Step 3: Fix whatever they surface.** These tests are the acceptance gate for Tasks 11 and 12.
- [ ] **Step 4: Run to verify they pass.** - [ ] **Step 5: Commit**

```bash
git add tests/dev/materializeRoundTrip.realdb.test.ts
git commit -m "test(dev): materialize round-trip, collision, and wildcard-safety proofs"
```

---

### Task 16: Real-browser layout and transition audit

Spec §8, §9. jsdom cannot answer these — Tailwind v4 here does not default `.flex` to `align-items: stretch`, and jsdom computes no layout.

**Files:**
- Create: `tests/e2e/attention-gallery-layout.spec.ts (new)`

**e2e harness readiness (declared per AGENTS.md):**
- **Server boot:** `next dev` on a scratch port via a standalone Playwright config, with `ADMIN_DEV_PANEL_ENABLED=true` so the route exists. Do **not** reuse port 3000 — a sibling worktree's dev server there would serve the wrong code.
- **Readiness gate:** await a `data-testid="scenario-block"` element to be attached **and** its menu to have `aria-expanded="true"`, never `networkidle` alone.
- **Detach safety:** every `locator.evaluate` that samples geometry runs on a locator re-queried immediately before use; auto-wait hangs on an unmounted node.

- [ ] **Step 1: Write the failing spec.** Two assertions: adjacent open menus do **not** intersect at the narrowest (`?w=320`) and widest (`?w=1280`) widths, via `getBoundingClientRect()` on consecutive blocks' menus; and a `MENU_CAP`-item menu's list has `scrollHeight > clientHeight`, proving the cap actually crosses the scroll threshold rather than being assumed to.
- [ ] **Step 2: Run to verify it fails.**
- [ ] **Step 3: Implement** the reserved-space rule from §4.0 — the pill sits in a `relative` wrapper and the block reserves bottom space at least the menu's max height while open.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Transition audit.** Enumerate every conditional render in `ScenarioBlock` and `MaterializeCard`; assert each has an explicit animation or is deliberately instant per the §9 inventory; test the compound cases (toggle the help popover while the menu is mid-transition; change target while a result is displayed).
- [ ] **Step 6: Commit**

```bash
git add tests/e2e/attention-gallery-layout.spec.ts components/admin/dev/ScenarioBlock.tsx
git commit -m "test(dev): real-browser menu overlap and scroll-threshold proofs"
```

---

### Task 17: Close-out

- [ ] **Step 1: Full local gates.** `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test`. All must pass; a scoped run is not sufficient.
- [ ] **Step 2: impeccable dual-gate** on the diff, scoped per §7.4: full mechanical checklist on `MaterializeCard`; findings on gallery chrome triaged against the `source-link-dim` minimal-chrome precedent; findings about the production components the gallery renders unmodified are out of scope for this diff. Record findings and dispositions in the handoff.
- [ ] **Step 3: Manual artifact verification.** `RUN_BUILD_ARTIFACT_GATE_TEST=1 pnpm vitest run tests/admin/build-artifact-gate.test.ts` at both flag states. Record both results — this check does not run in CI.
- [ ] **Step 4: Whole-diff Codex review** to APPROVE. Split briefs by surface, each under ~330 lines: catalog and validator; gallery route and `ScenarioBlock`; materialize actions and guards; tests and meta-tests. Verified at plan time: briefs above ~330 lines fail silently with empty transcripts.
- [ ] **Step 5: Push, real CI green, `gh pr merge --merge`, fast-forward local main.** Confirm `git rev-list --left-right --count main...origin/main` reports `0	0`.
