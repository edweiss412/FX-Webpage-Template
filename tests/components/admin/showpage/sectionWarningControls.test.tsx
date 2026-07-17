// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/sectionWarningControls.test.tsx
 * (consolidated-admin-show-page Task 12 — spec §5.3 per-section warning controls, §5.5 Preview-As)
 *
 * Two units under test:
 *   1. `buildSectionWarningModel` (server; lib/admin/sectionWarningModel.ts) — the crypto-bearing
 *      derivation that routes `data.warnings` per section (`warningsBySection`), partitions each
 *      slice by ignored fingerprint (`partitionByIgnored`), stamps each surviving warning with its
 *      `buildReportSurfaceId`, and derives per-section bulk-ignore groups. It runs in the SERVER
 *      page (Task 13) and hands the client shell a plain, RSC-serializable record — NO node:crypto
 *      in the client bundle.
 *   2. `buildSectionWarningExtras` (client; components/admin/showpage/sectionWarningExtras.tsx) — the
 *      `renderSectionExtras(id, d)` implementation the shared `ShowReviewSurface` invokes per section.
 *      Renders the pre-derived model with the existing per-item controls (Report/Ignore, use-raw,
 *      recognize-role) + BulkIgnore + an "Ignored (N)" disclosure.
 *
 * Plus the §5.5 Preview-As crew-row fork (published mode, `published && !archived`).
 *
 * Anti-tautology: control-placement assertions are scoped `within(section testid)` of the section
 * that owns them (the self-hiding boundaries mean a control appearing in the WRONG section is a real
 * routing bug, not noise). The ignored-partition expectation is derived from the live
 * `warningFingerprint` of the fixture warning, never hardcoded. Preview-As hrefs are derived from the
 * fixture crew ids the adapter carries, never hardcoded strings.
 */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/published-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import { isPublished, type PublishedSectionData } from "@/components/admin/review/sectionData";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import { warningsBySection, type SectionId } from "@/lib/admin/step3SectionStatus";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";

afterEach(cleanup);

const SHOW_ID = "22222222-2222-2222-2222-222222222222";
const SLUG = "published-fixture-show";
const DRIVE_FILE_ID = "DRIVE_PUB";
const CREW_ID_1 = "aaaaaaaa-0000-4000-8000-000000000001";
const CREW_ID_2 = "aaaaaaaa-0000-4000-8000-000000000002";

// ── Warning fixtures (each carries the blockRef.kind that routes it to a section) ──
const roleWarning: ParseWarning = {
  severity: "warn",
  code: "UNKNOWN_ROLE_TOKEN",
  message: "Unrecognized role token",
  roleToken: "Grip",
  blockRef: { kind: "crew" },
};
const useRawWarning: ParseWarning = {
  severity: "warn",
  code: "ROOM_HEADER_SPLIT_AMBIGUOUS",
  message: "Room header split is ambiguous",
  blockRef: { kind: "rooms", field: "dims" },
  resolution: {
    resolvable: true,
    contentHash: "hash-room-1",
    parsed: { kind: "rooms", name: "Ballroom", dimensions: null, floor: null },
    replacement: { kind: "rooms", name: "Ballroom A", dimensions: null, floor: null },
  },
};
const fieldWarningA: ParseWarning = {
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: "A field could not be read",
  rawSnippet: "Phone | ????",
  blockRef: { kind: "crew" },
};
const fieldWarningB: ParseWarning = {
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: "A field could not be read",
  rawSnippet: "Email | ????",
  blockRef: { kind: "crew" },
};

function snapshot(
  overrides: {
    warnings?: ParseWarning[];
    published?: boolean;
    archived?: boolean;
    crew?: { id: string; name: string; role: string }[];
  } = {},
): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Published Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: {
        travelIn: "2026-05-01",
        set: null,
        showDays: ["2026-05-02"],
        travelOut: "2026-05-03",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: DRIVE_FILE_ID,
      archived: overrides.archived ?? false,
      published: overrides.published ?? true,
    },
    internal: {
      financials: null,
      parse_warnings: overrides.warnings ?? [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: overrides.crew ?? [
      { id: CREW_ID_1, name: "Alice Anders", role: "PM" },
      { id: CREW_ID_2, name: "Bob Barker", role: "A2" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

function buildData(overrides: Parameters<typeof snapshot>[0] = {}): PublishedSectionData {
  return buildPublishedSectionData(snapshot(overrides), { slug: SLUG });
}

function renderedSectionIds(d: PublishedSectionData): Set<SectionId> {
  return new Set(step3Sections(d).map((s) => s.id));
}

/** Harness: the SHELL owns the scroll container ref; wire renderSectionExtras from the built model. */
function SurfaceHarness({
  data,
  ignoredFingerprints = new Set<string>(),
}: {
  data: PublishedSectionData;
  ignoredFingerprints?: ReadonlySet<string>;
}) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints,
    renderedSectionIds: renderedSectionIds(data),
  });
  const renderSectionExtras = buildSectionWarningExtras({ bySection });
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout="page"
      renderSectionExtras={renderSectionExtras}
    />
  );
}

const sectionEl = (id: SectionId) =>
  screen.getByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-review-section-${id}`);

// ────────────────────────────────────────────────────────────────────────────
describe("buildSectionWarningModel (server derivation)", () => {
  it("routes each warning to its section slice with a report surface id", () => {
    const d = buildData({ warnings: [roleWarning, useRawWarning, fieldWarningA] });
    const model = buildSectionWarningModel({
      slug: SLUG,
      warnings: d.warnings,
      ignoredFingerprints: new Set(),
      renderedSectionIds: renderedSectionIds(d),
    });
    const crew = model.crew;
    const rooms = model.rooms;
    expect(crew?.active.map((a) => a.warning.code).sort()).toEqual([
      "FIELD_UNREADABLE",
      "UNKNOWN_ROLE_TOKEN",
    ]);
    expect(rooms?.active.map((a) => a.warning.code)).toEqual(["ROOM_HEADER_SPLIT_AMBIGUOUS"]);
    // Report surface ids are non-empty and distinct per warning identity.
    const ids = crew!.active.map((a) => a.reportSurfaceId);
    expect(ids.every((s) => s.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("moves a warning whose fingerprint is ignored into the section's ignored bucket", () => {
    const d = buildData({ warnings: [roleWarning, fieldWarningA] });
    const fp = warningFingerprint(fieldWarningA);
    expect(fp).not.toBeNull();
    const model = buildSectionWarningModel({
      slug: SLUG,
      warnings: d.warnings,
      ignoredFingerprints: new Set([fp!]),
      renderedSectionIds: renderedSectionIds(d),
    });
    expect(model.crew?.active.map((a) => a.warning.code)).toEqual(["UNKNOWN_ROLE_TOKEN"]);
    expect(model.crew?.ignored.map((a) => a.warning.code)).toEqual(["FIELD_UNREADABLE"]);
  });

  it("derives a per-section bulk-ignore group when a code has >=2 distinct active snippets", () => {
    const d = buildData({ warnings: [fieldWarningA, fieldWarningB] });
    const model = buildSectionWarningModel({
      slug: SLUG,
      warnings: d.warnings,
      ignoredFingerprints: new Set(),
      renderedSectionIds: renderedSectionIds(d),
    });
    const groups = model.crew?.bulkGroups ?? [];
    expect(groups.map((g) => g.code)).toEqual(["FIELD_UNREADABLE"]);
    expect(groups[0]!.items.length).toBe(2);
    // Plain-language label, never the raw §12.4 code (invariant 5).
    expect(groups[0]!.label).not.toBe("FIELD_UNREADABLE");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("buildSectionWarningExtras (per-section render, inside owning section)", () => {
  it("renders each control inside the section that owns its warning, and nowhere else", () => {
    const d = buildData({ warnings: [roleWarning, useRawWarning, fieldWarningA] });
    render(<SurfaceHarness data={d} />);

    const crew = within(sectionEl("crew"));
    const rooms = within(sectionEl("rooms"));

    // Recognize-role lives in crew (its UNKNOWN_ROLE_TOKEN warning), NOT in rooms.
    expect(crew.getAllByTestId("role-recognize-control").length).toBeGreaterThan(0);
    expect(rooms.queryByTestId("role-recognize-control")).toBeNull();

    // Use-raw lives in rooms (its structural-transform warning), NOT in crew.
    expect(rooms.getAllByTestId("use-raw-control").length).toBeGreaterThan(0);
    expect(crew.queryByTestId("use-raw-control")).toBeNull();

    // Report/Ignore controls attach to every rendered warning in both sections.
    expect(crew.getAllByTestId("dq-controls").length).toBeGreaterThan(0);
    expect(rooms.getAllByTestId("dq-controls").length).toBeGreaterThan(0);
  });

  it("collapses an ignored warning into the section's Ignored (N) disclosure, out of the active list", () => {
    const d = buildData({ warnings: [roleWarning, fieldWarningA] });
    const fp = warningFingerprint(fieldWarningA)!;
    render(<SurfaceHarness data={d} ignoredFingerprints={new Set([fp])} />);

    const crew = within(sectionEl("crew"));
    // The ignored disclosure exists and holds the ignored warning (muted list).
    const details = crew.getByTestId(`section-ignored-warnings-crew`);
    expect(within(details).getAllByTestId("per-show-actionable-item").length).toBe(1);

    // The active list holds only the still-active warning (the role token), not the ignored field.
    const active = crew.getByTestId(`section-warning-active-crew`);
    const activeItems = within(active).getAllByTestId("per-show-actionable-item");
    expect(activeItems.length).toBe(1);
  });

  it("renders no extras for a section with no warnings", () => {
    const d = buildData({ warnings: [roleWarning] });
    render(<SurfaceHarness data={d} />);
    // Contacts has no routed warning → no per-section controls wrapper.
    expect(
      within(sectionEl("contacts")).queryByTestId("section-warning-controls-contacts"),
    ).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("Preview-As crew-row gate (§5.5)", () => {
  function renderCrewSection(d: PublishedSectionData) {
    const crewDef = step3Sections(d).find((s) => s.id === "crew")!;
    return render(<>{crewDef.render(d)}</>);
  }

  it("renders a Preview-As link per crew row when published && !archived", () => {
    const d = buildData({ published: true, archived: false });
    renderCrewSection(d);
    // hrefs derived from the fixture crew ids the adapter carries.
    const link1 = screen.getByTestId(`admin-show-preview-as-link-${CREW_ID_1}`);
    expect(link1.getAttribute("href")).toBe(`/admin/show/${SLUG}/preview/${CREW_ID_1}`);
    expect(screen.getByTestId(`admin-show-preview-as-link-${CREW_ID_2}`)).toBeTruthy();
  });

  it("renders no Preview-As link when the show is archived", () => {
    const d = buildData({ published: true, archived: true });
    renderCrewSection(d);
    expect(screen.queryByTestId(`admin-show-preview-as-link-${CREW_ID_1}`)).toBeNull();
  });

  it("renders no Preview-As link when the show is unpublished", () => {
    const d = buildData({ published: false, archived: false });
    renderCrewSection(d);
    expect(screen.queryByTestId(`admin-show-preview-as-link-${CREW_ID_1}`)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("publishedAdapter previewRoster", () => {
  it("carries crew ids index-aligned with crewMembers (same display sort)", () => {
    const d = buildData();
    expect(isPublished(d)).toBe(true);
    // Adapter sorts crew by name → Alice before Bob; previewRoster mirrors that order.
    expect(d.crewMembers.map((c) => c.name)).toEqual(["Alice Anders", "Bob Barker"]);
    expect(d.previewRoster).toEqual([
      { id: CREW_ID_1, name: "Alice Anders" },
      { id: CREW_ID_2, name: "Bob Barker" },
    ]);
  });
});

// Guard: the model routes only warn-severity warnings (mirrors warningsBySection), so an
// info-severity warning never reaches a per-section control list.
describe("severity gate", () => {
  it("ignores info-severity warnings", () => {
    const info: ParseWarning = {
      severity: "info",
      code: "SOME_INFO",
      message: "fyi",
      blockRef: { kind: "crew" },
    };
    const d = buildData({ warnings: [info, roleWarning] });
    const bySection = warningsBySection(d.warnings, renderedSectionIds(d));
    // sanity: warningsBySection already drops info — the model is built on the same helper.
    expect(bySection.get("crew")?.length).toBe(1);
    const model = buildSectionWarningModel({
      slug: SLUG,
      warnings: d.warnings,
      ignoredFingerprints: new Set(),
      renderedSectionIds: renderedSectionIds(d),
    });
    expect(model.crew?.active.map((a) => a.warning.code)).toEqual(["UNKNOWN_ROLE_TOKEN"]);
  });
});
