# Wizard Use-Raw Full-List Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the use-raw toggle and recognize-role control on every in-scope warning in the wizard's uncapped Parse-warnings list (`WarningsBreakdown`), matching the live page, with reorder-stable row keys at both actionable render sites.

**Architecture:** Optional-prop threading into `WarningsBreakdown` (mirrors the shipped `SectionFlagCallout` pattern); per-row mounts of the existing self-hiding `UseRawControlBoundary` / `RoleRecognizeControlBoundary`; `stableWarningKeys` replaces index-derived React keys at both stateful render sites. One production file changes: `components/admin/wizard/step3ReviewSections.tsx`.

**Tech Stack:** Next.js 16 client components, vitest + @testing-library/react (jsdom — no fixed-dimension layout, no animation in this diff).

**Spec:** `docs/superpowers/specs/2026-07-16-use-raw-wizard-full-list-toggle.md` (cross-model APPROVED, 5 rounds). Spec section numbers below refer to it.

## Global Constraints

- Invariant 5: no raw machine codes in UI — titles keep flowing through `reviewWarningTitle`; control error paths are the shipped plain-copy ones.
- Invariant 8: impeccable critique + audit dual-gate on the affected diff before cross-model review (Task 6).
- exactOptionalPropertyTypes: new props are present or ABSENT, never explicit `undefined`.
- No new server actions / DB / locks / telemetry. No `SectionData` shape change.
- §E4 jump contract: `data-testid={…-warning-${i}}` and `data-warning-index={i}` stay index-based; `onJump(index)` keeps the full-array index. Only React `key`s change identity.
- Meta-test inventory (declared, spec §7): none created or extended — UI-only diff reusing registered mutation surfaces (`setStagedUseRawDecisionAction`, `mapRoleTokenStaged`, `updateRoleTokenMapping`).
- Commit per task, conventional-commits, `--no-verify` (worktree; run `pnpm format:check` in Task 5 instead).
- Run all commands from the worktree root `/Users/ericweiss/FX-Webpage-Template-wt/use-raw-wizard-full-list`.

## File Structure

- **Modify:** `components/admin/wizard/step3ReviewSections.tsx`
  - export `findUseRawDecision` (extracted matcher, spec §4.4)
  - `WarningsBreakdown`: two optional props + per-row boundary mounts + `stableWarningKeys` row keys (spec §4.1/§4.3/§4.3.1)
  - `SectionFlagCallout`: identity keys for entries (spec §4.3.1 class-sweep)
  - `warnings` section def: pass the two props (spec §4.2)
- **Create:** `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (all new tests; owns its action-module mocks)
- **Existing tests that must stay green:** `tests/components/admin/wizard/step3ReviewSections.test.tsx`, `tests/components/step3SheetCard.test.tsx`, `tests/components/admin/wizard/Step3ReviewModal.test.tsx`, `tests/components/admin/wizard/step3ReviewModal.transitions.test.tsx`.

---

### Task 1: Extract the shared decision matcher `findUseRawDecision`

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (matcher near the top of the §E3 callout block, ~line 480; `SectionFlagCallout.decisionFor` at lines 513-519 becomes a call to it)
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (new file)

**Interfaces:**
- Consumes: `ParseWarning` (`lib/parser/types.ts`), `UseRawDecision` (`lib/sync/useRawOverlay.ts:31-40`) — both already imported by the file.
- Produces (Tasks 2+ rely on this exact signature):
  ```ts
  export function findUseRawDecision(
    w: ParseWarning,
    decisions: UseRawDecision[] | undefined,
  ): UseRawDecision | undefined;
  ```

- [ ] **Step 1: Write the failing test**

Create `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`:

```tsx
// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/warningsBreakdownControls.test.tsx
 *
 * Spec 2026-07-16-use-raw-wizard-full-list-toggle: use-raw + recognize-role
 * controls on every in-scope warning in the uncapped WarningsBreakdown list,
 * reorder-stable keys at both actionable render sites, and the §4.6
 * stale-sibling contract for duplicate role controls.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import type { ParseWarning } from "@/lib/parser/types";
import type { UseRawDecision } from "@/lib/sync/useRawOverlay";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
// The boundaries import BOTH surfaces' server actions at module level; mock all
// of them so jsdom never touches server-only deps and interaction tests can
// control outcomes. Success shapes mirror the real actions:
//   setStagedUseRawDecisionAction → { ok: true, state: "saved" }   (useRawStaged.ts:45)
//   mapRoleTokenStaged            → { ok: true, state: "apply_pending" } (roleTokenStaged.ts:177)
vi.mock("@/app/admin/onboarding/_actions/useRawStaged", () => ({
  setStagedUseRawDecisionAction: vi.fn(async () => ({ ok: true, state: "saved" })),
}));
vi.mock("@/app/admin/show/[slug]/_actions/useRaw", () => ({
  setUseRawDecisionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/app/admin/onboarding/_actions/roleTokenStaged", () => ({
  mapRoleTokenStaged: vi.fn(async () => ({ ok: true, state: "apply_pending" })),
}));
vi.mock("@/app/admin/show/[slug]/_actions/roleToken", () => ({
  mapRoleToken: vi.fn(async () => ({ ok: true, state: "applied" })),
}));
vi.mock("@/app/admin/settings/_actions/roleTokenMappings", () => ({
  updateRoleTokenMapping: vi.fn(async () => ({ ok: true })),
}));

import { mapRoleTokenStaged } from "@/app/admin/onboarding/_actions/roleTokenStaged";
import {
  BreakdownSection,
  CALLOUT_MAX_ENTRIES,
  findUseRawDecision,
  step3Sections,
  Step3SectionChromeContext,
  WarningsBreakdown,
  type SectionData,
} from "@/components/admin/wizard/step3ReviewSections";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DFID = "drive-abc-123";
const WSID = "11111111-2222-3333-4444-555555555555";

/** In-scope resolvable room-split warning; contentHash + name derive from n. */
function roomSplitWarning(n: number): ParseWarning {
  return {
    severity: "warn",
    code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
    message: `Read a room header as name + dimensions (${n})`,
    blockRef: { kind: "rooms", index: n, field: "dims" },
    rawSnippet: `ROOM ${n} | 20x30`,
    resolution: {
      resolvable: true,
      contentHash: `hash-${n}`,
      parsed: { kind: "rooms", name: `Room ${n}`, dimensions: "20x30", floor: null },
      replacement: { kind: "rooms", name: `Room ${n} 20x30`, dimensions: null, floor: null },
    },
  };
}

function roleWarning(token: string): ParseWarning {
  return {
    severity: "warn",
    code: "UNKNOWN_ROLE_TOKEN",
    message: `Unknown role token: '${token}' in role cell: '${token}'`,
    rawSnippet: token,
    roleToken: token,
  };
}

const OUT_OF_SCOPE: ParseWarning = {
  severity: "info",
  code: "UNKNOWN_FIELD",
  message: "Unrecognized row in sheet",
  rawSnippet: "MYSTERY | value",
};

function decisionFor(w: ParseWarning, preference: "raw" | "transform" = "raw"): UseRawDecision {
  if (!w.resolution || w.resolution.resolvable !== true) throw new Error("fixture misuse");
  return {
    code: w.code as UseRawDecision["code"],
    contentHash: w.resolution.contentHash,
    target: { kind: "rooms" },
    preference,
    applied: false,
    decidedAt: "2026-07-16T00:00:00.000Z",
    decidedBy: "admin@example.com",
  };
}

describe("findUseRawDecision (spec §4.4 shared matcher)", () => {
  test("matches on (code, resolution.contentHash); never on code alone", () => {
    const w1 = roomSplitWarning(1);
    const w2 = roomSplitWarning(2); // same code, different contentHash
    const d1 = decisionFor(w1);
    expect(findUseRawDecision(w1, [d1])).toBe(d1);
    expect(findUseRawDecision(w2, [d1])).toBeUndefined();
  });

  test("unresolvable / resolution-less warnings never match", () => {
    const legacy: ParseWarning = { ...roleWarning("SLED DRIVER") };
    const unresolvable: ParseWarning = {
      ...roomSplitWarning(3),
      resolution: { resolvable: false, reason: "empty-raw" },
    };
    const d = decisionFor(roomSplitWarning(3));
    expect(findUseRawDecision(legacy, [d])).toBeUndefined();
    expect(findUseRawDecision(unresolvable, [d])).toBeUndefined();
  });

  test("undefined / empty decision lists return undefined", () => {
    const w = roomSplitWarning(1);
    expect(findUseRawDecision(w, undefined)).toBeUndefined();
    expect(findUseRawDecision(w, [])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx`
Expected: FAIL — `findUseRawDecision` is not exported (SyntaxError/undefined import).

- [ ] **Step 3: Implement the matcher and rewire the callout**

In `components/admin/wizard/step3ReviewSections.tsx`, directly below the `CALLOUT_MAX_ENTRIES` export (line ~480), add:

```tsx
/**
 * Spec 2026-07-16 §4.4: the ONE decision matcher both actionable render sites
 * (§E3 callout + WarningsBreakdown) share. Matches the persisted decision by
 * (code, resolution.contentHash) — never by target; a warning without a
 * resolvable resolution never matches.
 */
export function findUseRawDecision(
  w: ParseWarning,
  decisions: UseRawDecision[] | undefined,
): UseRawDecision | undefined {
  return decisions?.find(
    (d) =>
      d.code === w.code &&
      w.resolution?.resolvable === true &&
      d.contentHash === w.resolution.contentHash,
  );
}
```

Inside `SectionFlagCallout`, replace the inline closure (lines 510-519):

```tsx
  // spec §8: match the persisted decision by (code, resolution.contentHash) — never
  // by target. The `<UseRawControl>` inside the boundary self-hides out-of-scope /
  // unresolvable warnings, so it is rendered for every entry when a session exists.
  const decisionFor = (w: ParseWarning): UseRawDecision | undefined =>
    findUseRawDecision(w, useRawDecisions);
```

- [ ] **Step 4: Run the new test + the two existing suites**

Run: `pnpm exec vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/step3SheetCard.test.tsx`
Expected: PASS (extraction is behavior-preserving).

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "refactor(admin): extract findUseRawDecision shared matcher"
```

---

### Task 2: `WarningsBreakdown` — optional props, stable keys, per-row controls, registry wiring

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`WarningsBreakdown` at ~2386; `warnings` section def at ~3601-3608; add `stableWarningKeys` import)
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`

**Interfaces:**
- Consumes: `findUseRawDecision` (Task 1), `UseRawControlBoundary` / `RoleRecognizeControlBoundary` (already imported by the file for the callout), `stableWarningKeys` from `@/lib/dataQuality/warningIdentity` (new import).
- Produces: `WarningsBreakdown({ dfid, warnings, useRawDecisions?, wizardSessionId? })` — Tasks 3-4 mount it with these props.

- [ ] **Step 1: Write the failing tests** (append to the new test file)

```tsx
function renderBreakdown(
  warnings: ParseWarning[],
  opts: { session?: boolean; decisions?: UseRawDecision[] } = {},
) {
  return render(
    <WarningsBreakdown
      dfid={DFID}
      warnings={warnings}
      {...(opts.decisions !== undefined ? { useRawDecisions: opts.decisions } : {})}
      {...(opts.session === false ? {} : { wizardSessionId: WSID })}
    />,
  );
}

describe("WarningsBreakdown per-row controls (spec §4.1-§4.3, §4.5)", () => {
  test("every in-scope warning gets a use-raw control — beyond the callout cap", () => {
    // N derived from the shipped cap, never hardcoded (anti-tautology).
    const N = CALLOUT_MAX_ENTRIES + 2;
    const inScope = Array.from({ length: N }, (_, k) => roomSplitWarning(k));
    const role = roleWarning("SLED DRIVER");
    const warnings = [...inScope, role, OUT_OF_SCOPE];
    const q = renderBreakdown(warnings, { decisions: [] });

    // Expected counts derive from the fixture composition.
    let useRawCount = 0;
    let roleCount = 0;
    warnings.forEach((w, i) => {
      const row = q.getByTestId(`wizard-step3-card-${DFID}-warning-${i}`);
      const hasUseRaw = within(row).queryAllByTestId("use-raw-control").length;
      const hasRole = within(row).queryAllByTestId("role-recognize-control").length;
      useRawCount += hasUseRaw;
      roleCount += hasRole;
      if (w === OUT_OF_SCOPE) {
        expect(hasUseRaw).toBe(0);
        expect(hasRole).toBe(0);
      }
    });
    expect(useRawCount).toBe(N); // all in-scope rows, including rows 4+ (cap regression guard)
    expect(roleCount).toBe(1);
  });

  test("absent wizardSessionId → zero controls (existing standalone mounts protected)", () => {
    const q = renderBreakdown([roomSplitWarning(1), roleWarning("X")], { session: false });
    expect(q.queryAllByTestId("use-raw-control")).toHaveLength(0);
    expect(q.queryAllByTestId("role-recognize-control")).toHaveLength(0);
  });

  test("decision binds by contentHash, not code alone (spec §7.3)", () => {
    const w0 = roomSplitWarning(0);
    const w1 = roomSplitWarning(1); // same code, different hash
    const q = renderBreakdown([w0, w1], { decisions: [decisionFor(w0)] });
    const row0 = q.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    const row1 = q.getByTestId(`wizard-step3-card-${DFID}-warning-1`);
    // preference:"raw", applied:false on the wizard surface → "apply-pending".
    expect(within(row0).getByTestId("use-raw-control").getAttribute("data-state")).toBe(
      "apply-pending",
    );
    expect(within(row1).getByTestId("use-raw-control").getAttribute("data-state")).toBe(
      "transform-active",
    );
  });

  test("PRODUCTION PATH: the registry's warnings def threads session + decisions (spec §4.2)", () => {
    // Render through step3Sections — NOT a manual mount — so an implementer who
    // skips the registry wiring fails here even though the props are optional.
    const N = CALLOUT_MAX_ENTRIES + 1;
    const warnings = [...Array.from({ length: N }, (_, k) => roomSplitWarning(k)), OUT_OF_SCOPE];
    const pr = buildParseResult({ warnings });
    const d: SectionData = {
      pr,
      row: stagedRow(pr),
      dfid: DFID,
      wizardSessionId: WSID,
      crewMembers: pr.crewMembers,
      rooms: pr.rooms,
      hotels: pr.hotelReservations,
      pullSheet: pr.pullSheet ?? [],
      archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
      ros: pr.runOfShow ?? {},
      warnings: pr.warnings,
      agendaBaseline: [],
      useRawDecisions: [decisionFor(roomSplitWarning(0))],
    };
    const def = step3Sections(d).find((s) => s.id === "warnings")!;
    const q = render(<>{def.render(d)}</>);
    expect(q.getAllByTestId("use-raw-control")).toHaveLength(N);
    // The threaded decision reaches the matching row (production decisionFor path).
    const row0 = q.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    expect(within(row0).getByTestId("use-raw-control").getAttribute("data-state")).toBe(
      "apply-pending",
    );
  });

  test("row keys are reorder-stable: control-bearing rows keep DOM identity when a warning is inserted upstream (spec §4.3.1)", () => {
    const w = roleWarning("SLED DRIVER");
    const q = renderBreakdown([roomSplitWarning(0), w], { decisions: [] });
    // Open the role panel on the LAST row (index 1) — non-default local state.
    const rowBefore = q.getByTestId(`wizard-step3-card-${DFID}-warning-1`);
    fireEvent.click(within(rowBefore).getByTestId("role-recognize-trigger"));
    expect(within(rowBefore).getByTestId("role-recognize-panel")).toBeTruthy();

    // Insert a NEW warning BEFORE it (the role warning's index shifts 1 → 2).
    q.rerender(
      <WarningsBreakdown
        dfid={DFID}
        warnings={[roomSplitWarning(0), roomSplitWarning(9), w]}
        useRawDecisions={[]}
        wizardSessionId={WSID}
      />,
    );
    // The panel followed the warning identity (now index 2)…
    const roleRow = q.getByTestId(`wizard-step3-card-${DFID}-warning-2`);
    expect(within(roleRow).queryByTestId("role-recognize-panel")).toBeTruthy();
    // …and did NOT migrate to the inserted warning now at index 1.
    const inserted = q.getByTestId(`wizard-step3-card-${DFID}-warning-1`);
    expect(within(inserted).queryByTestId("role-recognize-panel")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx`
Expected: FAIL — `WarningsBreakdown` rejects/ignores the new props (TS error via vitest transform is acceptable evidence) and no `use-raw-control` testids render.

- [ ] **Step 3: Implement**

(a) Add the import at the top of `step3ReviewSections.tsx` alongside the other `@/lib` imports:

```tsx
import { stableWarningKeys } from "@/lib/dataQuality/warningIdentity";
```

(b) Replace the `WarningsBreakdown` signature and list body (current lines ~2386-2496). Signature + keys:

```tsx
export function WarningsBreakdown({
  dfid,
  warnings,
  useRawDecisions,
  wizardSessionId,
}: {
  dfid: string;
  warnings: ParseWarning[];
  /** spec 2026-07-16 §4.1: staged decisions + session so every in-scope row can
   *  render the use-raw / recognize-role controls (live-page parity). Optional/
   *  ABSENT in standalone mounts (exactOptionalPropertyTypes) → no controls. */
  useRawDecisions?: UseRawDecision[];
  wizardSessionId?: string;
}) {
  // spec §4.3.1: reorder-stable, duplicate-safe keys — index keys would migrate
  // control state across warnings after a rescan/refresh reorders the array.
  const keys = stableWarningKeys(warnings);
```

(c) In the `<li>` (line ~2419), change ONLY the key (testids/data-warning-index stay index-based per §E4):

```tsx
                <li
                  key={keys[i]}
```

(d) Inside the row's text column `<span className="flex min-w-0 flex-1 flex-col gap-0.5">`, after the "Open in Sheet" IIFE block and before the closing `</span>`, add:

```tsx
                    {/* spec 2026-07-16 §4.3: the complete-list render site for the
                        use-raw + recognize-role controls (live-page parity; the §E3
                        callout stays a capped, actionable preview). Both boundaries
                        self-hide out-of-scope warnings. */}
                    {wizardSessionId ? (
                      <UseRawControlBoundary
                        surface="wizard"
                        wizardSessionId={wizardSessionId}
                        driveFileId={dfid}
                        warning={w}
                        decision={findUseRawDecision(w, useRawDecisions)}
                      />
                    ) : null}
                    {wizardSessionId ? (
                      <RoleRecognizeControlBoundary
                        surface="wizard"
                        wizardSessionId={wizardSessionId}
                        driveFileId={dfid}
                        warning={w}
                      />
                    ) : null}
```

(e) Registry wiring — the `warnings` def (~3601-3608):

```tsx
    {
      id: "warnings",
      label: "Parse warnings",
      group: "Checks",
      Icon: AlertTriangle,
      // Both severities — the rail count counts list rows (§3.3).
      railCount: (s) => s.warnings.length,
      // spec 2026-07-16 §4.2: thread the staged decisions + session so the full
      // list renders the per-warning controls (complete render site, §4.6).
      render: (s) => (
        <WarningsBreakdown
          dfid={s.dfid}
          warnings={s.warnings}
          useRawDecisions={s.useRawDecisions}
          wizardSessionId={s.wizardSessionId}
        />
      ),
    },
```

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx`
Expected: PASS (all new tests + existing suite untouched).

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "feat(admin): use-raw + recognize-role controls on every in-scope wizard warning"
```

---

### Task 3: `SectionFlagCallout` identity keys (§4.3.1 class-sweep) + callout reorder guard

**Files:**
- Modify: `components/admin/wizard/step3ReviewSections.tsx` (`SectionFlagCallout` map at ~542-549)
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`

**Interfaces:**
- Consumes: `stableWarningKeys` (imported in Task 2), `Step3SectionChromeContext` + `BreakdownSection` (both already exported) for the public-surface test mount.
- Produces: nothing new — behavior-only key change.

- [ ] **Step 1: Write the failing test** (append to the new test file; add `Step3SectionChromeContext` and `BreakdownSection` to the existing import from `step3ReviewSections`)

```tsx
describe("SectionFlagCallout identity keys (spec §4.3.1 class-sweep)", () => {
  // Public-surface mount: the callout renders via ModalSectionChrome when the
  // chrome context carries calloutEntries (step3ReviewSections.tsx:715).
  function renderCallout(entries: { warning: ParseWarning; index: number }[]) {
    return render(
      <Step3SectionChromeContext.Provider
        value={{
          Icon: (() => null) as never,
          label: "Crew",
          flagged: true,
          sectionId: "crew",
          dfid: DFID,
          calloutEntries: entries,
          onJumpToWarning: () => {},
          wizardSessionId: WSID,
          useRawDecisions: [],
        }}
      >
        <BreakdownSection testId="callout-host" label="Crew" count={null}>
          <p>body</p>
        </BreakdownSection>
      </Step3SectionChromeContext.Provider>,
    );
  }

  test("expanded role-panel state follows the warning identity when full-array indices shift", () => {
    const role = roleWarning("SLED DRIVER");
    const other = roleWarning("RIGGER X");
    const q = renderCallout([
      { warning: role, index: 4 },
      { warning: other, index: 5 },
    ]);
    const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    // Expand the FIRST entry's role panel.
    fireEvent.click(within(callout).getAllByTestId("role-recognize-trigger")[0]!);
    expect(within(callout).getAllByTestId("role-recognize-panel")).toHaveLength(1);

    // Upstream insertion shifts every full-array index by 3 AND swaps the entry
    // order: `role` (whose panel is open) moves from entry 0 to entry 1. Identity
    // keys must carry the open panel with `role`; index keys would leave it on
    // whatever warning now sits at entry 0.
    q.rerender(
      <Step3SectionChromeContext.Provider
        value={{
          Icon: (() => null) as never,
          label: "Crew",
          flagged: true,
          sectionId: "crew",
          dfid: DFID,
          calloutEntries: [
            { warning: other, index: 7 },
            { warning: role, index: 8 },
          ],
          onJumpToWarning: () => {},
          wizardSessionId: WSID,
          useRawDecisions: [],
        }}
      >
        <BreakdownSection testId="callout-host" label="Crew" count={null}>
          <p>body</p>
        </BreakdownSection>
      </Step3SectionChromeContext.Provider>,
    );
    const calloutAfter = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    const entryBlocks = calloutAfter.querySelectorAll(":scope > div.flex.flex-col");
    // The open panel must live in the entry that renders `role`'s token —
    // locate by durable identity (the entry containing "SLED DRIVER"), not index.
    const panels = within(calloutAfter).getAllByTestId("role-recognize-panel");
    expect(panels).toHaveLength(1);
    const panelEntry = panels[0]!.closest("div.flex.flex-col");
    expect(panelEntry?.textContent).toContain("SLED DRIVER");
    expect(entryBlocks.length).toBeGreaterThan(0); // guard the structural query
  });
});
```

(The assertion locates the open panel by the token text it belongs to — position-independent by construction.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx -t "identity keys"`
Expected: FAIL — with `key={index}` (4→7/5→8 all-new keys, or reorder reuse) the open-panel state either vanishes or lands on "RIGGER X"'s entry.

- [ ] **Step 3: Implement** — in `SectionFlagCallout`, above the `shown.map`:

```tsx
  const shown = entries.slice(0, CALLOUT_MAX_ENTRIES);
  // spec 2026-07-16 §4.3.1 (class-sweep): identity keys, not full-array indices —
  // an upstream insertion shifts every index and would migrate expanded role-panel
  // state across warnings. Positional within `shown`; onJump keeps the full index.
  const entryKeys = stableWarningKeys(shown.map((e) => e.warning));
```

and change the map signature + key (line ~542):

```tsx
      {shown.map(({ warning, index }, k) => {
        const title = reviewWarningTitle(warning); // §8 hardening applies transitively
        const fieldLabel = fieldLabelFor(warning.blockRef?.field);
        return (
          <div key={entryKeys[k]} className="flex flex-col gap-0.5">
```

(The existing entry body is otherwise unchanged — `onJump(index)` still receives the full-array index.)

- [ ] **Step 4: Run tests**

Run: `pnpm exec vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx tests/components/admin/wizard/step3ReviewSections.test.tsx tests/components/admin/wizard/Step3ReviewModal.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "fix(admin): identity keys for stateful callout entries (state-migration class-sweep)"
```

---

### Task 4: Stale-sibling UI rendering test (§4.6/§7.6 — test-only, UI layer)

**Files:**
- Test: `tests/components/admin/wizard/warningsBreakdownControls.test.tsx`

**Scope precision:** this task pins the **UI layer** of the §4.6 contract — that a stale sibling stays actionable and renders the saved card / benign conflict notice (never error styling, never a raw code) for the outcomes the action can return. The **action layer** (that `mapRoleTokenStaged`'s EXISTING-ROW branch actually returns set-equal → idempotent success and different-grants → `conflict`) is ALREADY pinned by `tests/admin/mapRoleTokenStagedAction.test.ts:160` ("existing row, set-equal grants: … proceeds to re-stage") and `:171` ("existing row, different grants: conflict, nothing written") — this task deliberately mocks the action and does NOT re-prove it.

**Interfaces:**
- Consumes: mocked `mapRoleTokenStaged` (Task 1 mock), `WarningsBreakdown` (Task 2).
- Produces: a pin on shipped UI behavior; no production change. If this test FAILS, the bug is in shipped code — stop and report, do not "fix" the test.

- [ ] **Step 1: Write the test** (append)

```tsx
describe("duplicate role-control siblings (spec §4.6 stale-sibling contract)", () => {
  // Two occurrences of the same token (per-occurrence emission,
  // lib/parser/personalization.ts:346-353) → two live create controls.
  const twin = () => [roleWarning("SLED DRIVER"), roleWarning("SLED DRIVER")];

  async function saveVia(row: HTMLElement) {
    fireEvent.click(within(row).getByTestId("role-recognize-trigger"));
    fireEvent.click(within(row).getByTestId("role-recognize-check-A1"));
    fireEvent.click(within(row).getByTestId("role-recognize-save"));
    await waitFor(() =>
      expect(
        within(row).queryByTestId("role-recognize-saved") ??
          within(row).queryByTestId("role-recognize-conflict"),
      ).toBeTruthy(),
    );
  }

  test("sibling save after a set-equal save resolves idempotently (saved card)", async () => {
    const q = renderBreakdown(twin(), { decisions: [] });
    const rows = [0, 1].map((i) => q.getByTestId(`wizard-step3-card-${DFID}-warning-${i}`));
    await saveVia(rows[0]!);
    expect(within(rows[0]!).getByTestId("role-recognize-saved")).toBeTruthy();
    // The sibling stayed mounted in create mode (no client refresh, §8.1) …
    expect(within(rows[1]!).getByTestId("role-recognize-trigger")).toBeTruthy();
    // … and its save resolves via the action's EXISTING-ROW branch (mock: ok).
    await saveVia(rows[1]!);
    expect(within(rows[1]!).getByTestId("role-recognize-saved")).toBeTruthy();
  });

  test("sibling save with different grants → benign conflict notice, never a raw code", async () => {
    const q = renderBreakdown(twin(), { decisions: [] });
    const rows = [0, 1].map((i) => q.getByTestId(`wizard-step3-card-${DFID}-warning-${i}`));
    await saveVia(rows[0]!);
    vi.mocked(mapRoleTokenStaged).mockResolvedValueOnce({ ok: false, code: "conflict" } as never);
    await saveVia(rows[1]!);
    expect(within(rows[1]!).getByTestId("role-recognize-conflict")).toBeTruthy();
    expect(within(rows[1]!).queryByTestId("role-recognize-error")).toBeNull();
    // Invariant 5: the machine token never renders.
    expect(rows[1]!.textContent).not.toContain("conflict_code");
    expect(rows[1]!.textContent).not.toMatch(/\bUNKNOWN_ROLE_TOKEN\b/);
  });
});
```

Testid basis: `role-recognize-check-${flag}` (`components/admin/RoleRecognizeControl.tsx:272`); `A1` is a real `GrantableFlag` (`lib/sync/roleMappingOverlay.ts:4` — `["A1", "V1", "L1", "FINANCIALS"]`).

- [ ] **Step 2: Run**

Run: `pnpm exec vitest run tests/components/admin/wizard/warningsBreakdownControls.test.tsx -t "stale-sibling"`
Expected: PASS against shipped control behavior. (This is a pin, not a change — a failure means investigate shipped code, report, do not adjust assertions to pass.)

- [ ] **Step 3: Commit**

```bash
git add tests/components/admin/wizard/warningsBreakdownControls.test.tsx
git commit --no-verify -m "test(admin): pin stale-sibling role-control contract (idempotent/conflict)"
```

---

### Task 5: Full verification gates

**Files:** none (verification only)

- [ ] **Step 1: Full unit suite** — `pnpm test` → 0 failures (memory: scoped gates miss shared-chokepoint regressions).
- [ ] **Step 2: Typecheck** — `pnpm exec tsc --noEmit` (vitest strips types; only tsc catches TS errors).
- [ ] **Step 3: Lint** — `pnpm exec eslint components/admin/wizard/step3ReviewSections.tsx tests/components/admin/wizard/warningsBreakdownControls.test.tsx` (canonical-Tailwind rule is ERROR-level in CI).
- [ ] **Step 4: Format** — `pnpm format:check` (--no-verify bypassed the prettier hook; CI `quality` enforces it). Fix with `pnpm exec prettier --write <files>` if red — NEVER run prettier on the master spec.
- [ ] **Step 5: Build** — `pnpm build` (client component only, but the file sits in the modal's client chain; build is the only gate for accidental server-module value imports).
- [ ] **Step 6: Structural meta-tests that scan this file's surfaces** — `pnpm exec vitest run tests/messages/ tests/components/tiles/_metaSentinelHidingContract.test.ts` (comment/format fragility memory; warnings copy untouched but the file was edited).
- [ ] **Step 7: Commit any stragglers** (formatting-only diffs): `git add -A && git commit --no-verify -m "chore: format"` — only if Step 4 changed files.

---

### Task 6: Invariant-8 impeccable dual-gate (orchestrator-run, Opus)

**Files:** possibly `DEFERRED.md` (P0/P1 deferrals need entries; P2+ optional)

- [ ] **Step 1:** Run `/impeccable critique` on the affected diff (canonical v3 setup gates: `context.mjs` context load → register reference read).
- [ ] **Step 2:** Run `/impeccable audit` on the same diff.
- [ ] **Step 3:** Fix P0/P1 findings in-diff or defer via `DEFERRED.md` entry; P2/P3 triage per deferral discipline. Commit fixes as `fix(admin): impeccable <finding>` per finding (or one commit for a small batch).
- [ ] **Step 4:** Record findings + dispositions for the PR body / close-out notes.

(After Task 6: whole-diff Codex adversarial review → push → PR → real CI green → `gh pr merge --merge` → fast-forward local main. Those are ship-feature Stage 4 steps, not plan tasks.)
