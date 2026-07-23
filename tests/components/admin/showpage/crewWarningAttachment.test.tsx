// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/crewWarningAttachment.test.tsx
 * (crew-warning-attachment spec 2026-07-23 §5.3/§5.3b/§5.4 — T3/T4 behavior)
 *
 * Conservation + placement for blockRef-crew warnings across the under-row /
 * section-group split, the generalized orphan-group emission rule, the
 * empty-seam guard, the matched↔fallback data transition, and the in-card
 * `sectionExtras` threading.
 *
 * Anti-tautology: conservation is asserted from BOTH sides on the SAME render
 * (a one-sided assertion misses double-render and silent drop); the in-card
 * containment is asserted against the panel-card element located from the
 * ROSTER (the extras block also has a border, so a shape-matched "card" can
 * select the element under test); expected keys derive from the fixture names
 * through the production strip, never hardcoded raw forms.
 */
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/attach-fixture-show",
  useSearchParams: () => new URLSearchParams(),
}));

import { ShowReviewSurface } from "@/components/admin/review/ShowReviewSurface";
import { step3Sections } from "@/components/admin/wizard/step3ReviewSections";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import {
  buildSectionWarningExtras,
  renderCrewUnderRowCards,
} from "@/components/admin/showpage/sectionWarningExtras";
import { buildSectionWarningModel } from "@/lib/admin/sectionWarningModel";
import { deriveRoutedWarnings } from "@/lib/admin/routedWarnings";
import type { SectionId } from "@/lib/admin/step3SectionStatus";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { ParseWarning } from "@/lib/parser/types";
import { warningFingerprint } from "@/lib/dataQuality/warningFingerprint";

afterEach(cleanup);

const SHOW_ID = "33333333-3333-4333-8333-333333333333";
const SLUG = "attach-fixture-show";
const DRIVE_FILE_ID = "DRIVE_ATTACH";

/** FIELD_UNREADABLE with a crew blockRef name — the shape under test. */
const fieldWarn = (name: string, snippet: string): ParseWarning => ({
  severity: "warn",
  code: "FIELD_UNREADABLE",
  message: `Crew phone could not be read (${snippet})`,
  rawSnippet: snippet,
  blockRef: { kind: "crew", index: 0, name },
});

function snapshot(warnings: ParseWarning[]): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Attach Fixture Show",
      client_label: "Acme",
      client_contact: null,
      dates: { travelIn: "2026-05-01", set: null, showDays: ["2026-05-02"], travelOut: "2026-05-03" },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: DRIVE_FILE_ID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: warnings,
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alice Anders", role: "PM" },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Bob Barker", role: "A2" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

function buildData(warnings: ParseWarning[]): PublishedSectionData {
  return buildPublishedSectionData(snapshot(warnings), { slug: SLUG }) as PublishedSectionData;
}

/** Mirrors PublishedReviewModal's wiring (renderedCrewKeys → extras factory +
 *  under-row renderer + row-host threading) so conservation is measured against
 *  production composition, not a hand-built chrome. */
function AttachHarness({
  data,
  renderedCrewKeys,
  ignoredFingerprints = new Set<string>(),
}: {
  data: PublishedSectionData;
  renderedCrewKeys: ReadonlySet<string>;
  ignoredFingerprints?: ReadonlySet<string>;
}) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const bySection = buildSectionWarningModel({
    slug: SLUG,
    warnings: data.warnings,
    ignoredFingerprints,
    renderedSectionIds: new Set<SectionId>(step3Sections(data).map((s) => s.id)),
  });
  const renderSectionExtras = buildSectionWarningExtras({ bySection, renderedCrewKeys });
  const crewUnderRowCards = renderCrewUnderRowCards({
    model: bySection.crew,
    published: {
      slug: SLUG,
      showId: SHOW_ID,
      driveFileId: DRIVE_FILE_ID,
      useRawDecisions: data.useRawDecisions,
    },
    renderedKeys: renderedCrewKeys,
  });
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout="page"
      renderSectionExtras={renderSectionExtras}
      routedWarnings={deriveRoutedWarnings(bySection)}
      crewUnderRowCards={crewUnderRowCards}
    />
  );
}

const crewSection = () =>
  screen.getByTestId(`wizard-step3-card-${DRIVE_FILE_ID}-review-section-${"crew"}`);

const ALICE_KEY = "alice anders";
const RENDERED = new Set([ALICE_KEY, "bob barker"]);

describe("conservation — under-row vs section group (spec §5.3)", () => {
  it("matched warning renders ONLY under its row; no orphan group (single non-bulk item)", () => {
    // Raw day-restriction name → strips to the rendered "Alice Anders" row.
    render(
      <AttachHarness
        data={buildData([fieldWarn("Alice Anders (5/2 ONLY)", "N/A")])}
        renderedCrewKeys={RENDERED}
      />,
    );
    const section = crewSection();
    // Under-row side: the stack exists for the STRIPPED key and carries the card.
    const stack = within(section).getByTestId(`crew-warn-stack-${ALICE_KEY}`);
    expect(within(stack).getAllByTestId("per-show-actionable-item")).toHaveLength(1);
    // Group side: sole active item moved, no bulk, no ignored → the EMPTY-SEAM
    // GUARD returns null — no bordered wrapper at all (spec R1-F3).
    expect(within(section).queryByTestId("section-warning-controls-crew")).toBeNull();
  });

  it("unmatched warning stays in the section group (fallback B)", () => {
    render(
      <AttachHarness data={buildData([fieldWarn("Ghost Crew", "N/A")])} renderedCrewKeys={RENDERED} />,
    );
    const section = crewSection();
    expect(within(section).queryByTestId(`crew-warn-stack-ghost crew`)).toBeNull();
    const group = within(section).getByTestId("section-warning-controls-crew");
    expect(within(group).getAllByTestId("per-show-actionable-item")).toHaveLength(1);
  });

  it("bulk group with ONE item moved keeps its chip and the remaining card", () => {
    render(
      <AttachHarness
        data={buildData([fieldWarn("Alice Anders", "N/A"), fieldWarn("Ghost Crew", "nope")])}
        renderedCrewKeys={RENDERED}
      />,
    );
    const section = crewSection();
    within(section).getByTestId(`crew-warn-stack-${ALICE_KEY}`);
    const group = within(section).getByTestId("section-warning-controls-crew");
    // chip present (bulk counts ALL active N=2), exactly ONE fallback card remains
    expect(within(group).getByText(/Ignore all 2/)).toBeTruthy();
    expect(within(group).getAllByTestId("per-show-actionable-item")).toHaveLength(1);
  });

  it("bulk group with ALL items moved STILL emits its chip with an empty cards slot (plan-R1 F3)", () => {
    render(
      <AttachHarness
        data={buildData([fieldWarn("Alice Anders", "N/A"), fieldWarn("Bob Barker", "nope")])}
        renderedCrewKeys={RENDERED}
      />,
    );
    const section = crewSection();
    within(section).getByTestId(`crew-warn-stack-${ALICE_KEY}`);
    within(section).getByTestId("crew-warn-stack-bob barker");
    const group = within(section).getByTestId("section-warning-controls-crew");
    expect(within(group).getByText(/Ignore all 2/)).toBeTruthy();
    // both cards moved — the group carries ZERO cards (empty cards slot)
    expect(within(group).queryAllByTestId("per-show-actionable-item")).toHaveLength(0);
  });

  it("ignored-only section still renders the wrapper (Ignored disclosure is real content)", () => {
    const w = fieldWarn("Alice Anders", "N/A");
    const data = buildData([w]);
    // fingerprint-ignore the sole warning via the production partition input
    render(
      <AttachHarness
        data={data}
        renderedCrewKeys={RENDERED}
        // derive via the live fingerprint helper — never hardcode
        ignoredFingerprints={new Set([warningFingerprint(w)])}
      />,
    );
    const section = crewSection();
    const group = within(section).getByTestId("section-warning-controls-crew");
    expect(within(group).getByText(/Ignored \(1\)/)).toBeTruthy();
  });
});

describe("matched↔fallback data transition (spec §5.3b, R2-F2)", () => {
  it("a rerender that drops the key from the rendered set moves the card row→group, and back", () => {
    const data = buildData([fieldWarn("Alice Anders", "N/A")]);
    const { rerender } = render(<AttachHarness data={data} renderedCrewKeys={RENDERED} />);
    let section = crewSection();
    within(section).getByTestId(`crew-warn-stack-${ALICE_KEY}`);
    expect(within(section).queryByTestId("section-warning-controls-crew")).toBeNull();

    // Roster refresh drops Alice → fallback into the group, stack unmounts.
    rerender(<AttachHarness data={data} renderedCrewKeys={new Set(["bob barker"])} />);
    section = crewSection();
    expect(within(section).queryByTestId(`crew-warn-stack-${ALICE_KEY}`)).toBeNull();
    within(section).getByTestId("section-warning-controls-crew");

    // And back.
    rerender(<AttachHarness data={data} renderedCrewKeys={RENDERED} />);
    section = crewSection();
    within(section).getByTestId(`crew-warn-stack-${ALICE_KEY}`);
    expect(within(section).queryByTestId("section-warning-controls-crew")).toBeNull();
  });
});

describe("sectionExtras renders inside the panel card (spec §2B, T4)", () => {
  /** The §5.2 panel card, anchored from the roster (see header note). */
  function panelCard(section: HTMLElement): HTMLElement {
    const row = within(section)
      .getAllByRole("listitem")
      .find((li) => li.textContent?.includes("Alice Anders"));
    expect(row, "roster row present").toBeTruthy();
    let el: HTMLElement | null = row!.parentElement;
    while (el && el !== section) {
      if (el.tagName === "DIV" && el.className.includes("border")) return el;
      el = el.parentElement;
    }
    throw new Error("panel card not found above the roster row");
  }

  it("the fallback group is a DESCENDANT of the crew panel card, not a sibling", () => {
    render(
      <AttachHarness data={buildData([fieldWarn("Ghost Crew", "N/A")])} renderedCrewKeys={RENDERED} />,
    );
    const section = crewSection();
    const group = within(section).getByTestId("section-warning-controls-crew");
    expect(panelCard(section).contains(group)).toBe(true);
  });

  it("warnings section extras keep SIBLING placement (R1-F1 — no reparenting)", () => {
    // An unrouted-shape warning stays in the warnings panel; its extras render
    // outside any panel card exactly as today. blockRef-less warnings route to
    // the warnings section.
    const orphan: ParseWarning = {
      severity: "warn",
      code: "FIELD_UNREADABLE",
      message: "unrouted",
      rawSnippet: "??",
    };
    render(<AttachHarness data={buildData([orphan])} renderedCrewKeys={RENDERED} />);
    const wsection = screen.getByTestId(
      `wizard-step3-card-${DRIVE_FILE_ID}-review-section-warnings`,
    );
    const group = within(wsection).queryByTestId("section-warning-controls-warnings");
    if (group) {
      // sibling contract: no bordered ancestor div between group and section
      let el: HTMLElement | null = group.parentElement;
      let crossedBorderedDiv = false;
      while (el && el !== wsection) {
        if (el.tagName === "DIV" && /(^|\s)border(\s|$)/.test(el.className)) crossedBorderedDiv = true;
        el = el.parentElement;
      }
      expect(crossedBorderedDiv, "warnings extras must not move inside a card").toBe(false);
    }
  });
});
