# Plan re-review: t6

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
