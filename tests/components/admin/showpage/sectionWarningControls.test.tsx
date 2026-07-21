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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

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
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import { buildSectionWarningExtras } from "@/components/admin/showpage/sectionWarningExtras";
import { warningsBySection, type SectionId } from "@/lib/admin/step3SectionStatus";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";
import { messageFor } from "@/lib/messages/lookup";
import type { MessageCode } from "@/lib/messages/catalog";
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
      // warning-surface-trim §3.2: production passes BOTH gate inputs
      // (components/admin/showpage/PublishedReviewModal.tsx). Passing only the
      // extras hook would pin a configuration the app never produces, and would
      // silently keep this suite testing the pre-trim panel.
      routedWarnings={deriveRoutedWarnings(bySection)}
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

  it("derives per-code active groups — every active code gets a group, bulk only on eligible (DQIGNORE-6)", () => {
    // Two codes routing to the SAME section (crew): a lone role token (not bulk-eligible) and
    // two distinct-content field snippets (bulk-eligible). The active list groups by code.
    const d = buildData({ warnings: [roleWarning, fieldWarningA, fieldWarningB] });
    const model = buildSectionWarningModel({
      slug: SLUG,
      warnings: d.warnings,
      ignoredFingerprints: new Set(),
      renderedSectionIds: renderedSectionIds(d),
    });
    const active = model.crew?.active ?? [];
    const groups = model.crew?.activeGroups ?? [];
    // Every active code gets exactly one group, in first-code-appearance order (derived from
    // the routed active order — NOT hardcoded, so a routing reorder can't silently pass).
    const expectedCodeOrder = [...new Set(active.map((a) => a.warning.code))];
    expect(groups.map((g) => g.code)).toEqual(expectedCodeOrder);
    const roleGroup = groups.find((g) => g.code === "UNKNOWN_ROLE_TOKEN")!;
    const fieldGroup = groups.find((g) => g.code === "FIELD_UNREADABLE")!;
    // Bulk descriptor rides only the eligible group; the lone role token has none.
    expect(roleGroup.bulk).toBeNull();
    expect(roleGroup.items.map((i) => i.warning.code)).toEqual(["UNKNOWN_ROLE_TOKEN"]);
    expect(fieldGroup.bulk?.items.length).toBe(2);
    expect(fieldGroup.items.length).toBe(2);
    // Each group item still carries its crypto-derived report surface id (server derivation).
    expect(fieldGroup.items.every((i) => i.reportSurfaceId.length > 0)).toBe(true);
    // Label via the plain-language path (catalog title), never the raw §12.4 code (invariant 5).
    expect(roleGroup.label).toBe(messageFor("UNKNOWN_ROLE_TOKEN" as MessageCode).title);
    expect(roleGroup.label).not.toBe("UNKNOWN_ROLE_TOKEN");
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
    // Live per-show controls carry site="showpage" (spec 2026-07-17 §5).
    expect(crew.getAllByTestId("role-recognize-control-showpage").length).toBeGreaterThan(0);
    expect(rooms.queryByTestId("role-recognize-control-showpage")).toBeNull();

    // Use-raw lives in rooms (its structural-transform warning), NOT in crew.
    expect(rooms.getAllByTestId("use-raw-control-showpage").length).toBeGreaterThan(0);
    expect(crew.queryByTestId("use-raw-control-showpage")).toBeNull();

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

  it("groups the section's active warnings by code — one card-list + eyebrow per code, chip only on bulk-eligible (DQIGNORE-6)", () => {
    // roleWarning (lone UNKNOWN_ROLE_TOKEN) + two distinct FIELD_UNREADABLE snippets, all
    // routing to crew → two per-code groups inside the crew section.
    const d = buildData({ warnings: [roleWarning, fieldWarningA, fieldWarningB] });
    render(<SurfaceHarness data={d} />);
    const crew = within(sectionEl("crew"));
    // Two distinct active codes → two group wrappers → two active card-lists.
    expect(crew.getByTestId("dq-active-group-UNKNOWN_ROLE_TOKEN")).toBeTruthy();
    expect(crew.getByTestId("dq-active-group-FIELD_UNREADABLE")).toBeTruthy();
    expect(crew.getAllByTestId("per-show-actionable-warnings")).toHaveLength(2);
    // The bulk chip rides only the eligible group (2 distinct snippets); the lone role token has none.
    expect(crew.getByTestId("dq-bulk-ignore-FIELD_UNREADABLE").textContent).toBe("Ignore all 2");
    expect(crew.queryByTestId("dq-bulk-ignore-UNKNOWN_ROLE_TOKEN")).toBeNull();
    // Eyebrow label scoped to its own testid (anti-tautology: the cards also render copy) — the
    // plain-language bulkGroupLabel path, never the raw §12.4 code (invariant 5).
    const eyebrow = crew.getByTestId("dq-group-label-UNKNOWN_ROLE_TOKEN");
    expect(eyebrow.textContent).toBe(messageFor("UNKNOWN_ROLE_TOKEN" as MessageCode).title);
    expect(eyebrow.textContent).not.toContain("UNKNOWN_ROLE_TOKEN");
  });
});

// ────────────────────────────────────────────────────────────────────────────
describe("Preview-As crew-row gate (§5.5)", () => {
  function renderCrewSection(d: PublishedSectionData) {
    const crewDef = step3Sections(d).find((s) => s.id === "crew")!;
    return render(<>{crewDef.render(d)}</>);
  }

  it("renders a Preview-As link per crew row when published && !archived (inside the row ⋮ menu)", () => {
    const d = buildData({ published: true, archived: false });
    renderCrewSection(d);
    // Preview-As now lives in the row's ⋮ menu (crew-row-controls) — open it first.
    fireEvent.click(screen.getByTestId(`crew-row-menu-button-${CREW_ID_1}`));
    // hrefs derived from the fixture crew ids the adapter carries.
    const link1 = screen.getByTestId(`admin-show-preview-as-link-${CREW_ID_1}`);
    expect(link1.getAttribute("href")).toBe(`/admin/show/${SLUG}/preview/${CREW_ID_1}`);
    // Single-open contract: row 2's link requires opening row 2's menu.
    fireEvent.click(screen.getByTestId(`crew-row-backdrop-${CREW_ID_1}`));
    fireEvent.click(screen.getByTestId(`crew-row-menu-button-${CREW_ID_2}`));
    expect(screen.getByTestId(`admin-show-preview-as-link-${CREW_ID_2}`)).toBeTruthy();
  });

  it("renders no Preview-As link when the show is archived", () => {
    const d = buildData({ published: true, archived: true });
    renderCrewSection(d);
    expect(screen.queryByTestId(`admin-show-preview-as-link-${CREW_ID_1}`)).toBeNull();
    expect(screen.queryByTestId(`crew-row-menu-button-${CREW_ID_1}`)).toBeNull();
  });

  it("renders no Preview-As link when the show is unpublished", () => {
    const d = buildData({ published: false, archived: false });
    renderCrewSection(d);
    expect(screen.queryByTestId(`admin-show-preview-as-link-${CREW_ID_1}`)).toBeNull();
    expect(screen.queryByTestId(`crew-row-menu-button-${CREW_ID_1}`)).toBeNull();
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

// ────────────────────────────────────────────────────────────────────────────
describe("correction-loop verb is mode-derived (published → re-sync)", () => {
  // `WarningsBreakdown` is the SINGLE render site for this copy across both
  // modes, and it used to hard-code the wizard's `mode="rescan"`. On a PUBLISHED
  // show the re-scan action does not exist — the surface's only action is
  // Re-sync (StatusStrip) — so the published panel was instructing Doug to press
  // a control that is not on screen. The verb now derives from `isStaged(s)` at
  // the section-registry call site.
  //
  // Anti-tautology: the assertion is scoped INSIDE the warnings section's own
  // testid subtree, so no sibling panel can satisfy it. The negative assertion
  // is not redundant with the positive one — it is what catches a later edit
  // that renders BOTH verbs (e.g. "re-sync (or re-scan)").
  it("published data renders NO panel-level correction-loop callout", () => {
    const d = buildData({ warnings: [roleWarning] });
    // Precondition: this fixture really is the published branch, so a future
    // refactor that silently makes it staged cannot green this test.
    expect(isPublished(d)).toBe(true);
    render(<SurfaceHarness data={d} />);
    // warning-surface-trim §3.5: the loop sentence moved into each warning
    // card's help popover, so the panel-level callout is gone from the published
    // surface. The wizard keeps it, which
    // tests/components/admin/wizard/step3ReviewSections.test.tsx still pins, and
    // the published absence is pinned by rendered TEXT (not testid) in
    // tests/components/admin/showpage/publishedGuidanceRetired.test.tsx.
    expect(within(sectionEl("warnings")).queryByTestId("correction-loop-callout")).toBeNull();
  });
});
