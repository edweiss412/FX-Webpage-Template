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
import { cleanup, fireEvent, render, within } from "@testing-library/react";
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

import {
  CALLOUT_MAX_ENTRIES,
  findUseRawDecision,
  step3Sections,
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
