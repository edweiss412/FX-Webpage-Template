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
} from "@/components/admin/wizard/step3ReviewSections";
import { buildStagedSectionData, type SectionData } from "@/components/admin/review/sectionData";
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

  test("no invalid-DOM-nesting errors when controls render (block-valid column)", () => {
    const errSpy = vi.spyOn(console, "error");
    renderBreakdown([roomSplitWarning(0), roleWarning("SLED DRIVER")], { decisions: [] });
    const nesting = errSpy.mock.calls.filter((args) =>
      args.some(
        (a) => typeof a === "string" && /validateDOMNesting|cannot be a descendant|In HTML/.test(a),
      ),
    );
    expect(nesting).toEqual([]);
    errSpy.mockRestore();
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
    const d: SectionData = buildStagedSectionData({
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
    });
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

describe("SectionFlagCallout identity keys (spec §4.3.1 class-sweep)", () => {
  // Public-surface mount: the callout renders via ModalSectionChrome when the
  // chrome context carries calloutEntries (step3ReviewSections.tsx ~:715).
  function chromeValue(entries: { warning: ParseWarning; index: number }[]) {
    return {
      Icon: (() => null) as never,
      label: "Crew",
      flagged: true,
      sectionId: "crew" as const,
      dfid: DFID,
      calloutEntries: entries,
      onJumpToWarning: () => {},
      wizardSessionId: WSID,
      useRawDecisions: [],
    };
  }
  function calloutHost(entries: { warning: ParseWarning; index: number }[]) {
    return (
      <Step3SectionChromeContext.Provider value={chromeValue(entries)}>
        <BreakdownSection testId="callout-host" label="Crew" count={null}>
          <p>body</p>
        </BreakdownSection>
      </Step3SectionChromeContext.Provider>
    );
  }

  test("expanded role-panel state follows the warning identity when full-array indices shift", () => {
    const role = roleWarning("SLED DRIVER");
    const other = roleWarning("RIGGER X");
    const q = render(
      calloutHost([
        { warning: role, index: 4 },
        { warning: other, index: 5 },
      ]),
    );
    const callout = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    // Expand the FIRST entry's role panel (belongs to `role`).
    fireEvent.click(within(callout).getAllByTestId("role-recognize-trigger")[0]!);
    expect(within(callout).getAllByTestId("role-recognize-panel")).toHaveLength(1);

    // Upstream insertion shifts every full-array index AND swaps the entry
    // order: `role` (whose panel is open) moves from entry 0 to entry 1.
    // Identity keys must carry the open panel with `role`; index keys would
    // leave it on whatever warning now sits at entry 0.
    q.rerender(
      calloutHost([
        { warning: other, index: 7 },
        { warning: role, index: 8 },
      ]),
    );
    const calloutAfter = q.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    const panels = within(calloutAfter).getAllByTestId("role-recognize-panel");
    expect(panels).toHaveLength(1);
    // Locate by durable identity (the entry containing role's token), not index.
    const panelEntry = panels[0]!.closest("div.flex.flex-col");
    expect(panelEntry?.textContent).toContain("SLED DRIVER");
    expect(panelEntry?.textContent).not.toContain("RIGGER X");
  });
});

describe("duplicate role-control siblings (spec §4.6 stale-sibling contract, UI layer)", () => {
  // Two occurrences of the same token (per-occurrence emission,
  // lib/parser/personalization.ts:346-353) → two live create controls. The
  // ACTION layer (set-equal idempotent / different-grants conflict) is pinned by
  // tests/admin/mapRoleTokenStagedAction.test.ts:160,:171 — mocked here.
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
