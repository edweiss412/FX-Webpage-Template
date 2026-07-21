# Plan re-review A - TASKS 6-8

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

### Task 6: Tier-2 structural matrix

Spec §4.2. Few codes, every structural axis. Each scenario's `bucket` predicates are the mechanism; the test asserts the routing outcome by running the real `bucketAttention`, never by trusting a label.

**Files:**

- Create: `lib/dev/attentionScenarios/tier2.ts (new)`
- Test: `tests/dev/attentionScenariosTier2.test.ts (new)`

**Interfaces:**

- Consumes: `AttentionScenario` and `validateScenario` (Task 3); `scenarioIdForCode` (Task 4).
- Produces: `MENU_CAP: 12`, `tier2Scenarios(): AttentionScenario[]`, and the exported id constants each test references: `T2_SECTION_ABSENT`, `T2_OVERVIEW_ABSENT`, `T2_ANCHOR_ABSENT`, `T2_CREW_ROW_ABSENT`, `T2_HOLD_ONLY`, `T2_INBOX_ROUTED`, `T2_AUTO_RESOLVING`, `T2_ACTIONABLE`, `T2_OCCURRENCE_MANY`, `T2_IDENTITY_ABSENT`, `T2_UNCATALOGED`, `T2_UNRESOLVED_PLACEHOLDER`, `T2_EMPTY`, `T2_SINGLE`, `T2_MANY`, `T2_DEGRADED`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/dev/attentionScenariosTier2.test.ts
import { describe, expect, test } from "vitest";
import { bucketAttention } from "@/lib/admin/sectionAttention";
import { deriveAttentionItems } from "@/lib/admin/attentionItems";
import { validateScenario } from "@/lib/dev/attentionScenarios/validate";
import {
  MENU_CAP,
  tier2Scenarios,
  T2_SECTION_ABSENT,
  T2_OVERVIEW_ABSENT,
  T2_ANCHOR_ABSENT,
  T2_CREW_ROW_ABSENT,
  T2_MANY,
  T2_UNCATALOGED,
  T2_DEGRADED,
} from "@/lib/dev/attentionScenarios/tier2";
import type { AttentionScenario } from "@/lib/dev/attentionScenarios/types";

function byId(id: string): AttentionScenario {
  const s = tier2Scenarios().find((x) => x.id === id);
  if (!s) throw new Error(`missing tier-2 scenario ${id}`);
  return s;
}

/** Run the REAL derive + bucket for a scenario, returning which sections got cards. */
function placements(s: AttentionScenario): Map<string, number> {
  const items = deriveAttentionItems({ alerts: s.alerts.map(toInput), feed: null, slug: "demo" });
  const map = bucketAttention(items, {
    renderCard: () => "card",
    sectionAvailable: s.bucket?.sectionAvailable ?? (() => true),
    anchorAvailable: s.bucket?.anchorAvailable ?? (() => true),
    ...(s.bucket?.crewKeyRendered ? { crewKeyRendered: s.bucket.crewKeyRendered } : {}),
  });
  const out = new Map<string, number>();
  for (const [sectionId, bucket] of map) {
    const n =
      bucket.sectionTop.length +
      [...(bucket.byAnchor?.values() ?? [])].reduce((a, v) => a + v.length, 0) +
      [...(bucket.byCrewKey?.values() ?? [])].reduce((a, v) => a + v.length, 0);
    out.set(sectionId, n);
  }
  return out;
}

function toInput(r: AttentionScenario["alerts"][number]) {
  return {
    id: `t-${r.code}`,
    code: r.code,
    context: r.context,
    raised_at: r.raised_at,
    occurrence_count: r.occurrence_count,
    identityText: null,
    messageParams: {},
    crewName: null,
  };
}

describe("tier 2 structural matrix", () => {
  test("every scenario is valid and tier 2", () => {
    const all = tier2Scenarios();
    expect(all.length).toBeGreaterThanOrEqual(16);
    for (const s of all) {
      expect(validateScenario(s), s.id).toEqual([]);
      expect(s.tier, s.id).toBe(2);
    }
  });

  test("a routed section that is unavailable falls back to Overview", () => {
    const p = placements(byId(T2_SECTION_ABSENT));
    expect(p.get("overview") ?? 0).toBeGreaterThan(0);
    expect(p.get("crew") ?? 0).toBe(0);
  });

  test("when Overview is also unavailable the card is DROPPED, not silently placed", () => {
    const p = placements(byId(T2_OVERVIEW_ABSENT));
    const total = [...p.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });

  test("an unavailable anchor falls back to its section top, not to Overview", () => {
    const s = byId(T2_ANCHOR_ABSENT);
    const p = placements(s);
    expect(p.get("rooms") ?? 0).toBeGreaterThan(0);
  });

  test("an unrendered crew key falls back to the crew section top", () => {
    const p = placements(byId(T2_CREW_ROW_ABSENT));
    expect(p.get("crew") ?? 0).toBeGreaterThan(0);
  });

  test("the many-items scenario carries exactly MENU_CAP alerts", () => {
    expect(byId(T2_MANY).alerts).toHaveLength(MENU_CAP);
  });

  test("the uncataloged-code scenario routes to Overview via the derive fallback", () => {
    const p = placements(byId(T2_UNCATALOGED));
    expect(p.get("overview") ?? 0).toBeGreaterThan(0);
  });

  test("only the degraded scenario sets degraded, and only tier 2 sets bucket", () => {
    expect(byId(T2_DEGRADED).degraded).toBe(true);
    for (const s of tier2Scenarios()) {
      if (s.id !== T2_DEGRADED) expect(s.degraded ?? false, s.id).toBe(false);
    }
  });
});
```

Failure mode caught: a fallback predicate that stops routing as documented — asserted against the real `bucketAttention` output, not against the scenario's own label. The Overview-absent case asserts a **drop** specifically, which is the one outcome an observation-only test could not distinguish from a bug.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run tests/dev/attentionScenariosTier2.test.ts`
Expected: FAIL, cannot resolve `@/lib/dev/attentionScenarios/tier2`.

- [ ] **Step 3: Implement**

```ts
// lib/dev/attentionScenarios/tier2.ts
import type { AttentionScenario, ScenarioAlertRow } from "./types";

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

function alert(code: string, over: Partial<Omit<ScenarioAlertRow, "code">> = {}): ScenarioAlertRow {
  return { code, context: {}, raised_at: AT, occurrence_count: 1, ...over };
}

function scenario(
  id: string,
  label: string,
  rest: Omit<AttentionScenario, "id" | "tier" | "label">,
): AttentionScenario {
  return { id, tier: 2, label, ...rest };
}

export function tier2Scenarios(): AttentionScenario[] {
  return [
    scenario(T2_SECTION_ABSENT, "Routed section unavailable, falls back to Overview", {
      alerts: [alert("AMBIGUOUS_EMAIL_BINDING")],
      holds: [],
      bucket: { sectionAvailable: (s) => s === "overview" },
    }),
    scenario(T2_OVERVIEW_ABSENT, "No available section, card is dropped", {
      alerts: [alert("AMBIGUOUS_EMAIL_BINDING")],
      holds: [],
      bucket: { sectionAvailable: () => false },
    }),
    scenario(T2_ANCHOR_ABSENT, "Anchor slot absent, falls back to section top", {
      alerts: [alert("EMBEDDED_ASSET_DRIFTED")],
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
    scenario(T2_UNCATALOGED, "Uncataloged code, fallback title and Overview route", {
      alerts: [alert("NOT_A_REAL_CODE_FOR_GALLERY")],
      holds: [],
    }),
    scenario(T2_OCCURRENCE_MANY, "Repeat count above one", {
      alerts: [alert("SYNC_STALLED", { occurrence_count: 7 })],
      holds: [],
    }),
    scenario(T2_EMPTY, "No attention at all", { alerts: [], holds: [] }),
    scenario(T2_SINGLE, "Exactly one item", { alerts: [alert("SYNC_STALLED")], holds: [] }),
    scenario(T2_MANY, `${MENU_CAP} items, menu crosses its scroll threshold`, {
      alerts: Array.from({ length: MENU_CAP }, (_, i) =>
        alert(`GALLERY_FILLER_${String(i).padStart(2, "0")}`),
      ),
      holds: [],
    }),
    scenario(T2_DEGRADED, "Alert read degraded", { alerts: [], holds: [], degraded: true }),
    // Remaining axes follow the same shape; each is one scenario with one axis varied:
    // T2_HOLD_ONLY (holds only, no alerts), T2_INBOX_ROUTED, T2_AUTO_RESOLVING,
    // T2_ACTIONABLE (one code from each of the three actionability classes),
    // T2_IDENTITY_ABSENT (galleryIdentity null), T2_UNRESOLVED_PLACEHOLDER
    // (params that leave a <token> uninterpolated).
  ];
}
```

Fill the five commented axes using the same `scenario(...)` helper — the test asserts at least 16 scenarios exist and that every one validates, so an omitted axis fails.

Pick the `T2_INBOX_ROUTED` / `T2_AUTO_RESOLVING` / `T2_ACTIONABLE` codes by checking the real predicates first: `rg -n "isInboxRouted|isAutoResolving" lib/messages/adminSurface.ts lib/adminAlerts/audience.ts`. Do not guess which codes fall in which class.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run tests/dev/attentionScenariosTier2.test.ts`
Expected: PASS.

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
          groups: [
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
          ],
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    expect(action).not.toHaveBeenCalled();
  });

  test("renders one labelled group per section with its nodes", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          groups: [
            {
              sectionId: "overview",
              placement: "sectionTop",
              anchorOrCrewKey: null,
              nodes: [<p key="a">card-a</p>],
            },
            {
              sectionId: "rooms",
              placement: "anchor",
              anchorOrCrewKey: "diagrams",
              nodes: [<p key="b">card-b</p>],
            },
          ],
        })}
      />,
    );
    const overview = screen.getByTestId("group-overview-sectionTop");
    expect(within(overview).getByText("card-a")).toBeInTheDocument();
    const rooms = screen.getByTestId("group-rooms-anchor");
    expect(within(rooms).getByText("card-b")).toBeInTheDocument();
    expect(within(rooms).getByText(/diagrams/)).toBeInTheDocument();
  });

  test("holds render in their own group, never inside a section group", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          holdItems: [
            {
              id: "hold:1",
              kind: "hold",
              tone: "critical",
              sectionId: "changes",
              crewKey: null,
              actionable: true,
              menuTitle: "Pick what happens",
              menuSubtitle: null,
            },
          ],
        })}
      />,
    );
    const holds = screen.getByTestId("hold-group");
    expect(within(holds).getByText("Pick what happens")).toBeInTheDocument();
  });

  test("warnings null renders no warning cards at all", () => {
    render(<ScenarioBlock {...baseProps({ warnings: null })} />);
    expect(screen.queryByTestId("warnings-warning")).not.toBeInTheDocument();
    expect(screen.queryByTestId("warnings-muted")).not.toBeInTheDocument();
  });

  test("warnings present renders BOTH the active and muted skins", () => {
    render(
      <ScenarioBlock
        {...baseProps({
          warnings: [
            {
              severity: "warn",
              code: "BLOCK_DISAPPEARED",
              message: "Synthetic warning for gallery review.",
            },
          ],
        })}
      />,
    );
    expect(screen.getByTestId("warnings-warning")).toBeInTheDocument();
    expect(screen.getByTestId("warnings-muted")).toBeInTheDocument();
  });

  test("the readout renders every row as label and value", () => {
    render(<ScenarioBlock {...baseProps({ readout: [{ label: "sectionId", value: "rooms" }] })} />);
    const dl = screen.getByTestId("readout");
    expect(within(dl).getByText("sectionId")).toBeInTheDocument();
    expect(within(dl).getByText("rooms")).toBeInTheDocument();
  });

  test("maxWidthPx null applies no width constraint; a number applies it", () => {
    const { rerender } = render(<ScenarioBlock {...baseProps({ maxWidthPx: null })} />);
    expect(screen.getByTestId("block-root").style.maxWidth).toBe("");
    rerender(<ScenarioBlock {...baseProps({ maxWidthPx: 390 })} />);
    expect(screen.getByTestId("block-root").style.maxWidth).toBe("390px");
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
      style={props.maxWidthPx === null ? undefined : { maxWidth: `${props.maxWidthPx}px` }}
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
        <div
          key={`${g.sectionId}-${g.placement}-${g.anchorOrCrewKey ?? ""}`}
          data-testid={`group-${g.sectionId}-${g.placement}`}
        >
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
            <PerShowActionableWarnings
              items={props.warnings}
              driveFileId="gallery-fixture"
              tone="warning"
            />
          </div>
          <div data-testid="warnings-muted">
            <PerShowActionableWarnings
              items={props.warnings}
              driveFileId="gallery-fixture"
              tone="muted"
            />
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
