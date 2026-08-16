// @vitest-environment jsdom
/**
 * Task 3 — `CrewShell`'s `staticPreview` posture (spec §2.6) plus the real-shell
 * integration arms for the staged adapter (AC-1 / AC-3).
 *
 * The posture suppresses FIVE emission surfaces; every suppression assertion
 * here is paired with a defect-injection arm rendering the SAME fixture WITHOUT
 * the posture, so a suppression test that could never fail is impossible.
 *
 * Sections are NOT mocked: the integration arms need real section bodies. The
 * `CrewSections` client controller IS mocked, both to capture the entitled
 * `sectionNodes` keys (the budget gate) and to render EVERY node rather than
 * only the active one, so per-section content is observable in one render.
 */
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { aggregateDays } from "@/lib/crew/agendaDisplay";
import type { SectionId } from "@/lib/crew/resolveActiveSection";
import { buildStagedShowForViewer } from "@/lib/data/stagedShowForViewer";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import {
  makeStagedParseFixture,
  STAGED_FIXTURE_FINANCIALS,
} from "@/tests/fixtures/stagedParseResult";
import type { ParseResult } from "@/lib/parser/types";

const upsertAdminAlert = vi.hoisted(() => vi.fn());
vi.mock("@/lib/adminAlerts/upsertAdminAlert", () => ({ upsertAdminAlert }));

const afterSpy = vi.hoisted(() => vi.fn());
vi.mock("next/server", () => ({ after: afterSpy }));

// Pinned OUTSIDE the fixture's show window so no schedule day card collapses to
// the `schedule-day-today` testid and every card carries its ISO date.
const PINNED_NOW = new Date("2026-05-14T15:00:00Z");
const nowDate = vi.hoisted(() => vi.fn(async () => new Date("2026-05-14T15:00:00Z")));
vi.mock("@/lib/time/now", () => ({
  nowDate,
  now: async () => (await nowDate()).toISOString(),
}));

vi.mock("@/components/realtime/ShowRealtimeBridge", () => ({
  ShowRealtimeBridge: () => <div data-testid="mock-realtime-bridge" />,
}));

// `Footer` is an async CLIENT component and cannot be rendered in jsdom (the
// existing crew suites mock it for the same reason), so posture item 4 is
// asserted at the PROP seam CrewShell owns: the report block is `{showId ? … }`
// guarded (components/layout/Footer.tsx:186) behind `showId?: string | null`
// (components/layout/Footer.tsx:63), so a null showId IS the absent form.
const footerProps = vi.hoisted(
  () => ({ value: null }) as { value: { showId?: string | null } | null },
);
vi.mock("@/components/layout/Footer", () => ({
  Footer: (props: { showId?: string | null }) => {
    footerProps.value = props;
    return <footer data-testid="mock-footer" data-show-id={String(props.showId)} />;
  },
}));

const captured = vi.hoisted(
  () =>
    ({ value: null }) as {
      value: {
        initialSection: SectionId;
        budgetVisible: boolean;
        sectionNodes: Partial<Record<SectionId, ReactNode>>;
      } | null;
    },
);
vi.mock("@/components/crew/CrewSections", () => ({
  CrewSections: (props: {
    initialSection: SectionId;
    budgetVisible: boolean;
    sectionNodes: Partial<Record<SectionId, ReactNode>>;
  }) => {
    captured.value = props;
    return (
      <div data-testid="mock-crew-sections" data-active-section={props.initialSection}>
        {Object.entries(props.sectionNodes).map(([id, node]) => (
          <div key={id} data-testid={`node-${id}`}>
            {node}
          </div>
        ))}
      </div>
    );
  },
}));

beforeEach(() => {
  captured.value = null;
  footerProps.value = null;
  nowDate.mockResolvedValue(PINNED_NOW);
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const SHOW_ID = "show-1";
const TRIGGER_SLOT = '[data-slot="card-report-trigger"]';

async function renderShell(props: {
  data: ShowForViewer;
  viewer: Viewer;
  showId?: string;
  staticPreview?: boolean;
  rawSection?: string | undefined;
}): Promise<HTMLElement> {
  const { CrewShell } = await import("@/app/show/[slug]/[shareToken]/_CrewShell");
  const element = await CrewShell({
    data: props.data,
    viewer: props.viewer,
    showId: props.showId ?? SHOW_ID,
    rawSection: props.rawSection,
    slug: "acme-2026",
    ...(props.staticPreview === undefined ? {} : { staticPreview: props.staticPreview }),
  });
  return render(element).container;
}

/** Adapter output over the shared staged fixture, for one surrogate viewer id. */
function stagedProjection(
  requestedViewerId: string | null,
  parse: ParseResult = makeStagedParseFixture(),
): { data: ShowForViewer; selectedId: string } {
  const result = buildStagedShowForViewer(parse, {
    driveFileId: "drive-file-1",
    sourceAnchors: {},
    stagedModifiedTime: "2026-06-20T10:00:00.000Z",
    checkedAt: PINNED_NOW.toISOString(),
    requestedViewerId,
  });
  if (result.kind !== "ok") throw new Error(`adapter returned ${result.kind}`);
  return { data: result.data, selectedId: result.selectedId };
}

function sectionKeys(): SectionId[] {
  return Object.keys(captured.value?.sectionNodes ?? {}) as SectionId[];
}

function renderedDaySet(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("[data-testid^='schedule-day-']"))
    .map((el) => el.getAttribute("data-testid")!.replace("schedule-day-", ""))
    .sort();
}

describe("CrewShell staticPreview posture (spec §2.6)", () => {
  test("item 1: no admin-alert write, even with a non-empty tileErrors map", async () => {
    const data = makeShowForViewer({ tileErrors: { venue: "boom" } });

    await renderShell({ data, viewer: { kind: "admin" }, staticPreview: true });
    expect(upsertAdminAlert).toHaveBeenCalledTimes(0);

    // Defect injection: the SAME fixture without the posture must write.
    cleanup();
    await renderShell({ data, viewer: { kind: "admin" } });
    expect(upsertAdminAlert).toHaveBeenCalledTimes(1);
  });

  test("item 2: no after() work is registered", async () => {
    const data = makeShowForViewer();

    await renderShell({ data, viewer: { kind: "admin" }, staticPreview: true });
    expect(afterSpy).toHaveBeenCalledTimes(0);

    cleanup();
    await renderShell({ data, viewer: { kind: "admin" } });
    expect(afterSpy.mock.calls.length).toBeGreaterThan(0);
  });

  test("item 3: ShowRealtimeBridge is not mounted", async () => {
    const data = makeShowForViewer();

    const preview = await renderShell({
      data,
      viewer: { kind: "admin" },
      staticPreview: true,
    });
    expect(preview.querySelector('[data-testid="mock-realtime-bridge"]')).toBeNull();

    cleanup();
    const live = await renderShell({ data, viewer: { kind: "admin" } });
    expect(live.querySelector('[data-testid="mock-realtime-bridge"]')).not.toBeNull();
  });

  test("items 4 and 5: no footer report affordance and no card report triggers", async () => {
    const data = makeShowForViewer();

    const preview = await renderShell({
      data,
      viewer: { kind: "admin" },
      staticPreview: true,
    });
    expect(preview.querySelectorAll(TRIGGER_SLOT)).toHaveLength(0);
    expect(footerProps.value?.showId ?? null).toBeNull();

    cleanup();
    const live = await renderShell({ data, viewer: { kind: "admin" } });
    expect(live.querySelectorAll(TRIGGER_SLOT).length).toBeGreaterThan(0);
    expect(footerProps.value?.showId).toBe(SHOW_ID);
  });

  test("AC-8: the posture-absent render keeps every surface it has today", async () => {
    const data = makeShowForViewer();
    const container = await renderShell({ data, viewer: { kind: "admin" } });

    expect(sectionKeys().length).toBeGreaterThan(0);
    expect(container.querySelector('[data-testid="mock-realtime-bridge"]')).not.toBeNull();
    expect(container.querySelectorAll(TRIGGER_SLOT).length).toBeGreaterThan(0);
    expect(footerProps.value?.showId).toBe(SHOW_ID);
    expect(container.querySelector('[data-testid="crew-shell"]')).not.toBeNull();
  });

  /**
   * The endpoint list + the substring predicate, exercised against a POSITIVE
   * control (diff review round 1: the suppression oracle below is negative-only,
   * so a narrowed array or a broken predicate would keep it green forever).
   */
  const SUPPRESSED_ENDPOINTS = [
    "/api/asset/agenda/",
    "/api/asset/diagram/",
    "/api/asset/reel/",
    "/api/report",
    "/api/realtime/",
  ] as const;

  test("the dormant-reference detector fires on a known-positive control", () => {
    for (const endpoint of SUPPRESSED_ENDPOINTS) {
      const planted = `<a href="${endpoint}123">x</a>`;
      expect(planted, `detector must see ${endpoint}`).toContain(endpoint);
    }
    // And the list is the one the assertion below actually uses.
    expect(SUPPRESSED_ENDPOINTS).toHaveLength(5);
  });

  test("AC-2: no dormant reference to any suppressed endpoint survives in the HTML", async () => {
    const { data } = stagedProjection("staged-crew-0");
    const container = await renderShell({
      data,
      viewer: { kind: "admin_preview", crewMemberId: "staged-crew-0" },
      showId: "staged-preview",
      staticPreview: true,
    });

    // Catches hrefs and non-requesting references a network capture cannot see.
    for (const endpoint of SUPPRESSED_ENDPOINTS) {
      expect(container.innerHTML).not.toContain(endpoint);
    }
    // Positive control on THIS render: the same predicate over the same HTML
    // with one endpoint planted must fire, so a vacuously-empty container or a
    // broken predicate cannot pass as suppression.
    const planted = `${container.innerHTML}<a href="/api/report">x</a>`;
    expect(SUPPRESSED_ENDPOINTS.some((e) => planted.includes(e))).toBe(true);
    // Premise: the render is non-trivial, so "no match" is not "nothing rendered".
    expect(container.querySelector('[data-testid="crew-shell"]')).not.toBeNull();
    expect(container.textContent!.length).toBeGreaterThan(200);
  });
});

describe("staged adapter output through the REAL CrewShell", () => {
  test("AC-3: the budget gate follows the previewed member's flags", async () => {
    const parse = makeStagedParseFixture();

    const entitledCases = [
      { id: "staged-crew-0", label: "LEAD" },
      { id: "staged-crew-3", label: "FINANCIALS only" },
    ];
    for (const c of entitledCases) {
      const { data } = stagedProjection(c.id, makeStagedParseFixture());
      await renderShell({
        data,
        viewer: { kind: "admin_preview", crewMemberId: c.id },
        showId: "staged-preview",
        staticPreview: true,
      });
      expect(sectionKeys(), `${c.label} should see budget`).toContain("budget");
      cleanup();
    }

    // Neither flag → no budget key at all (no-Budget-flash invariant).
    const plain = stagedProjection("staged-crew-2", makeStagedParseFixture());
    await renderShell({
      data: plain.data,
      viewer: { kind: "admin_preview", crewMemberId: "staged-crew-2" },
      showId: "staged-preview",
      staticPreview: true,
    });
    expect(sectionKeys()).not.toContain("budget");
    cleanup();

    // Element-drop arm proved through the shell: `[null, "LEAD"]` normalizes to
    // ["LEAD"] in the adapter, so this viewer IS budget-entitled.
    const mutated = makeStagedParseFixture();
    (mutated.crewMembers[2] as unknown as Record<string, unknown>).role_flags = [null, "LEAD"];
    const normalized = stagedProjection("staged-crew-2", mutated);
    await renderShell({
      data: normalized.data,
      viewer: { kind: "admin_preview", crewMemberId: "staged-crew-2" },
      showId: "staged-preview",
      staticPreview: true,
    });
    expect(sectionKeys()).toContain("budget");

    // Premise: the fixture's own flags are what drive the three arms above.
    expect(parse.crewMembers[2]!.role_flags).not.toContain("LEAD");
  });

  test("AC-1: every entitled section renders fixture-derived content", async () => {
    const parse = makeStagedParseFixture();
    // On the SET day: the pack list is phase-gated to {Set, Strike, Load Out}
    // (lib/visibility/packList.ts:55-59, GearSection.tsx:195-202), so a pre-show
    // or show-day clock would hide the gear body's case labels for a reason that
    // has nothing to do with the adapter.
    nowDate.mockResolvedValue(new Date(`${parse.show.dates.set!}T15:00:00Z`));
    const { data } = stagedProjection("staged-crew-0", parse);
    const container = await renderShell({
      data,
      viewer: { kind: "admin_preview", crewMemberId: "staged-crew-0" },
      showId: "staged-preview",
      staticPreview: true,
    });

    expect(sectionKeys().sort()).toEqual(
      ["budget", "crew", "gear", "schedule", "today", "travel", "venue"].sort(),
    );

    const text = container.textContent ?? "";
    // Per-section content, each value read off the fixture.
    expect(text).toContain(parse.contacts[0]!.name!); // crew / contacts body
    expect(text).toContain(parse.pullSheet![0]!.caseLabel); // gear body
    expect(text).toContain(parse.hotelReservations[0]!.hotel_name!); // travel body
    expect(text).toContain(parse.show.venue!.name); // venue body

    // The four financial strings reach an ENTITLED viewer through the budget body.
    const budgetText = container.querySelector('[data-testid="node-budget"]')?.textContent ?? "";
    for (const value of Object.values(STAGED_FIXTURE_FINANCIALS)) {
      expect(budgetText).toContain(value);
    }
  });

  test("AC-1: no financial string appears anywhere for a non-entitled viewer", async () => {
    const { data } = stagedProjection("staged-crew-2");
    const container = await renderShell({
      data,
      viewer: { kind: "admin_preview", crewMemberId: "staged-crew-2" },
      showId: "staged-preview",
      staticPreview: true,
    });

    const html = container.innerHTML;
    for (const value of Object.values(STAGED_FIXTURE_FINANCIALS)) {
      expect(html).not.toContain(value);
    }
    expect(container.textContent!.length).toBeGreaterThan(200);
  });

  test("AC-3: Right Now uses the viewer-FILTERED hotel", async () => {
    const parse = makeStagedParseFixture();
    const hotelA = parse.hotelReservations[0]!.hotel_name!;
    const hotelB = parse.hotelReservations[1]!.hotel_name!;
    expect(hotelA).not.toBe(hotelB);

    const a = await renderShell({
      data: stagedProjection("staged-crew-0").data,
      viewer: { kind: "admin_preview", crewMemberId: "staged-crew-0" },
      showId: "staged-preview",
      staticPreview: true,
    });
    const tonightA = a.querySelector('[data-testid="today-tonight"]')?.textContent ?? "";
    expect(tonightA).toContain(hotelA);
    expect(tonightA).not.toContain(hotelB);
    cleanup();

    const b = await renderShell({
      data: stagedProjection("staged-crew-1").data,
      viewer: { kind: "admin_preview", crewMemberId: "staged-crew-1" },
      showId: "staged-preview",
      staticPreview: true,
    });
    const tonightB = b.querySelector('[data-testid="today-tonight"]')?.textContent ?? "";
    expect(tonightB).toContain(hotelB);
    expect(tonightB).not.toContain(hotelA);
  });

  test("AC-3: the rendered schedule day set equals each restricted viewer's own days", async () => {
    const parse = makeStagedParseFixture();
    const aggregate = new Set(aggregateDays(parse.show.dates).map((d) => d.date));

    for (const viewerId of ["staged-crew-0", "staged-crew-1"]) {
      const { data } = stagedProjection(viewerId);
      const restriction = data.crewMembers.find((c) => c.id === viewerId)!.dateRestriction;
      expect(restriction.kind).toBe("explicit");
      const expected =
        restriction.kind === "explicit"
          ? restriction.days.filter((d) => aggregate.has(d)).sort()
          : [];
      // Premise: a viewer projecting `days: []` would trivially satisfy equality.
      expect(expected.length).toBeGreaterThan(0);

      const container = await renderShell({
        data,
        viewer: { kind: "admin_preview", crewMemberId: viewerId },
        showId: "staged-preview",
        staticPreview: true,
      });
      expect(renderedDaySet(container), `day set for ${viewerId}`).toEqual(expected);
      cleanup();
    }
  });
});
