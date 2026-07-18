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
  reviewWarningTitle,
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
      const hasUseRaw = within(row).queryAllByTestId("use-raw-control-list").length;
      const hasRole = within(row).queryAllByTestId("role-recognize-control-list").length;
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
    expect(q.queryAllByTestId("use-raw-control-list")).toHaveLength(0);
    expect(q.queryAllByTestId("role-recognize-control-list")).toHaveLength(0);
  });

  test("decision binds by contentHash, not code alone (spec §7.3)", () => {
    const w0 = roomSplitWarning(0);
    const w1 = roomSplitWarning(1); // same code, different hash
    const q = renderBreakdown([w0, w1], { decisions: [decisionFor(w0)] });
    const row0 = q.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    const row1 = q.getByTestId(`wizard-step3-card-${DFID}-warning-1`);
    // preference:"raw", applied:false on the wizard surface → "apply-pending".
    expect(within(row0).getByTestId("use-raw-control-list").getAttribute("data-state")).toBe(
      "apply-pending",
    );
    expect(within(row1).getByTestId("use-raw-control-list").getAttribute("data-state")).toBe(
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
      pullSheetOverride: null,
      ros: pr.runOfShow ?? {},
      warnings: pr.warnings,
      agendaBaseline: [],
      useRawDecisions: [decisionFor(roomSplitWarning(0))],
    });
    const def = step3Sections(d).find((s) => s.id === "warnings")!;
    const q = render(<>{def.render(d)}</>);
    expect(q.getAllByTestId("use-raw-control-list")).toHaveLength(N);
    // The threaded decision reaches the matching row (production decisionFor path).
    const row0 = q.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    expect(within(row0).getByTestId("use-raw-control-list").getAttribute("data-state")).toBe(
      "apply-pending",
    );
  });

  test("row keys are reorder-stable: control-bearing rows keep DOM identity when a warning is inserted upstream (spec §4.3.1)", () => {
    const w = roleWarning("SLED DRIVER");
    const q = renderBreakdown([roomSplitWarning(0), w], { decisions: [] });
    // Open the role panel on the LAST row (index 1) — non-default local state.
    const rowBefore = q.getByTestId(`wizard-step3-card-${DFID}-warning-1`);
    fireEvent.click(within(rowBefore).getByTestId("role-recognize-trigger-list"));
    expect(within(rowBefore).getByTestId("role-recognize-panel-list")).toBeTruthy();

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
    expect(within(roleRow).queryByTestId("role-recognize-panel-list")).toBeTruthy();
    // …and did NOT migrate to the inserted warning now at index 1.
    const inserted = q.getByTestId(`wizard-step3-card-${DFID}-warning-1`);
    expect(within(inserted).queryByTestId("role-recognize-panel-list")).toBeNull();
  });
});

describe("SectionFlagCallout preview — no controls (USE-RAW-FULL-LIST-1 demotion)", () => {
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

  // The callout is a PREVIEW: it mounts no recognize-role control. (Its former
  // stateful role-panel — whose identity-key migration this describe used to pin —
  // no longer exists here; that concern is moot once the control leaves. The list
  // remains the sole actionable site and still keys by identity, unchanged.)
  test("callout renders NO role-recognize control; list still does (role-token fixture)", () => {
    const w = roleWarning("SLED DRIVER"); // UNKNOWN_ROLE_TOKEN + nonblank roleToken
    const callout = render(calloutHost([{ warning: w, index: 0 }]));
    const box = callout.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    // No recognize-role subtree at any site-scoped leaf (root/trigger/panel).
    expect(within(box).queryByTestId("role-recognize-control-callout")).toBeNull();
    expect(within(box).queryByTestId("role-recognize-trigger-callout")).toBeNull();
    expect(within(box).queryByTestId("role-recognize-panel-callout")).toBeNull();
    // Anti-overstrip: the preview STILL renders the entry title + View details jump.
    expect(within(box).getAllByText(reviewWarningTitle(w), { exact: false }).length).toBeGreaterThan(0);
    expect(within(box).getByText(/View details/)).toBeTruthy();
    cleanup();
    // List = sole actionable site; still mounts the recognize-role control.
    const list = renderBreakdown([w], { decisions: [] });
    const row = list.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    expect(within(row).getByTestId("role-recognize-control-list")).toBeTruthy();
  });
});

describe("duplicate role-control siblings (spec §4.6 stale-sibling contract, UI layer)", () => {
  // Two occurrences of the same token (per-occurrence emission,
  // lib/parser/personalization.ts:346-353) → two live create controls. The
  // ACTION layer (set-equal idempotent / different-grants conflict) is pinned by
  // tests/admin/mapRoleTokenStagedAction.test.ts:160,:171 — mocked here.
  const twin = () => [roleWarning("SLED DRIVER"), roleWarning("SLED DRIVER")];

  async function saveVia(row: HTMLElement) {
    fireEvent.click(within(row).getByTestId("role-recognize-trigger-list"));
    fireEvent.click(within(row).getByTestId("role-recognize-check-A1-list"));
    fireEvent.click(within(row).getByTestId("role-recognize-save-list"));
    await waitFor(() =>
      expect(
        within(row).queryByTestId("role-recognize-saved-list") ??
          within(row).queryByTestId("role-recognize-conflict-list"),
      ).toBeTruthy(),
    );
  }

  test("sibling save after a set-equal save resolves idempotently (saved card)", async () => {
    const q = renderBreakdown(twin(), { decisions: [] });
    const rows = [0, 1].map((i) => q.getByTestId(`wizard-step3-card-${DFID}-warning-${i}`));
    await saveVia(rows[0]!);
    expect(within(rows[0]!).getByTestId("role-recognize-saved-list")).toBeTruthy();
    // The sibling stayed mounted in create mode (no client refresh, §8.1) …
    expect(within(rows[1]!).getByTestId("role-recognize-trigger-list")).toBeTruthy();
    // … and its save resolves via the action's EXISTING-ROW branch (mock: ok).
    await saveVia(rows[1]!);
    expect(within(rows[1]!).getByTestId("role-recognize-saved-list")).toBeTruthy();
  });

  test("sibling save with different grants → benign conflict notice, never a raw code", async () => {
    const q = renderBreakdown(twin(), { decisions: [] });
    const rows = [0, 1].map((i) => q.getByTestId(`wizard-step3-card-${DFID}-warning-${i}`));
    await saveVia(rows[0]!);
    vi.mocked(mapRoleTokenStaged).mockResolvedValueOnce({ ok: false, code: "conflict" } as never);
    await saveVia(rows[1]!);
    expect(within(rows[1]!).getByTestId("role-recognize-conflict-list")).toBeTruthy();
    expect(within(rows[1]!).queryByTestId("role-recognize-error-list")).toBeNull();
    // Invariant 5: the machine token never renders.
    expect(rows[1]!.textContent).not.toContain("conflict_code");
    expect(rows[1]!.textContent).not.toMatch(/\bUNKNOWN_ROLE_TOKEN\b/);
  });
});

describe("cross-site testid distinctness (spec 2026-07-17 §10.3)", () => {
  // Local callout host (the callout mounts via ModalSectionChrome when the chrome
  // context carries calloutEntries). The callout is preview-only (no controls), so
  // no wizardSessionId/useRawDecisions thread here (spec 2026-07-17 USE-RAW-FULL-LIST-1).
  function localCalloutHost(entries: { warning: ParseWarning; index: number }[]) {
    return (
      <Step3SectionChromeContext.Provider
        value={{
          Icon: (() => null) as never,
          label: "Crew",
          flagged: true,
          sectionId: "crew" as const,
          dfid: DFID,
          calloutEntries: entries,
          onJumpToWarning: () => {},
        }}
      >
        <BreakdownSection testId="callout-host" label="Crew" count={null}>
          <p>body</p>
        </BreakdownSection>
      </Step3SectionChromeContext.Provider>
    );
  }

  test("callout renders NO use-raw control; list still does (use-raw fixture)", () => {
    const w = roomSplitWarning(0); // in-scope ROOM_HEADER_SPLIT_AMBIGUOUS fixture (:59)
    // list host — sole actionable site, keeps the control
    const list = renderBreakdown([w], { decisions: [] });
    const row = list.getByTestId(`wizard-step3-card-${DFID}-warning-0`);
    expect(within(row).getByTestId("use-raw-control-list")).toBeTruthy();
    expect(within(row).queryByTestId("use-raw-control-callout")).toBeNull();
    cleanup();
    // callout host — demoted to preview: no use-raw control mount
    const callout = render(localCalloutHost([{ warning: w, index: 0 }]));
    const box = callout.getByTestId(`wizard-step3-card-${DFID}-section-crew-flag-callout`);
    expect(within(box).queryByTestId("use-raw-control-callout")).toBeNull();
    // Anti-overstrip: preview still renders title + View details for this fixture too.
    expect(within(box).getAllByText(reviewWarningTitle(w), { exact: false }).length).toBeGreaterThan(0);
    expect(within(box).getByText(/View details/)).toBeTruthy();
  });
});

describe("non-blocking copy requalification (spec 2026-07-17 §9)", () => {
  test("headline drops 'informational', keeps 'don't block publishing', names the optional fix", () => {
    const q = renderBreakdown([roleWarning("SLED DRIVER")], { decisions: [] });
    const line = q.getByTestId(`wizard-step3-card-${DFID}-warnings-nonblocking`);
    expect(line.textContent!).toMatch(/don.t block publishing/i);
    expect(line.textContent!).not.toMatch(/informational/i);
    expect(line.textContent!).toMatch(/optional fix/i);
  });
});
