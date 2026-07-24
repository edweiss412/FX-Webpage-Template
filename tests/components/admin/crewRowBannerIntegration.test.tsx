// @vitest-environment jsdom
/**
 * Crew-row alert banner id-matched fan-out — integration (spec
 * docs/superpowers/specs/2026-07-23-warning-trim-undefer-design.md §6.3).
 *
 * Two layers:
 *  (a) CrewBreakdown consumes `crewAttention.byIndex`: an index→node map places
 *      the banner inside THAT rendered row's <li>, below row content, and in no
 *      other row. A byCrewKey-only control still renders (byCrewKey unchanged).
 *  (b) Surface threading: ShowReviewSurface threads a crew bucket's `byRowIndex`
 *      through to `CrewAttention.byIndex`, so a bucket keyed {1:[marker]} lands
 *      the marker in the SECOND crew row — the seam layer (a) cannot see.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { useRef } from "react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/admin/show/fanout-fixture",
  useSearchParams: () => new URLSearchParams(),
}));

import {
  CrewBreakdown,
  Step3SectionChromeContext,
  type Step3SectionChrome,
} from "@/components/admin/wizard/step3ReviewSections";
import { ShowReviewSurface, type CrewAttention } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { PublishedSectionData } from "@/components/admin/review/sectionData";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";
import type { SectionAttention } from "@/lib/admin/sectionAttention";
import type { CrewMemberRow } from "@/lib/parser/types";

afterEach(cleanup);

const marker = (id = "fanout-marker"): ReactNode => <div key={id} data-testid={id} />;

function member(name: string): CrewMemberRow {
  return {
    name,
    email: null,
    phone: null,
    role: "",
    role_flags: [],
    date_restriction: { kind: "none" },
    stage_restriction: { kind: "none" },
    flight_info: null,
  };
}

function chromeWith(crewAttention: CrewAttention): Step3SectionChrome {
  return {
    Icon: (() => null) as never,
    label: "Crew",
    flagged: false,
    crewAttention,
  };
}

describe("(a) CrewBreakdown byIndex consumption", () => {
  it("places the byIndex node inside the SECOND row's <li> and no other row", () => {
    const crewAttention: CrewAttention = {
      byCrewKey: new Map(),
      byIndex: new Map([[1, [marker()]]]),
      sectionTop: [],
    };
    render(
      <Step3SectionChromeContext.Provider value={chromeWith(crewAttention)}>
        <CrewBreakdown dfid="DRIVE" members={[member("Alice"), member("Bob")]} />
      </Step3SectionChromeContext.Provider>,
    );
    const hostLi = screen.getByTestId("fanout-marker").closest("li");
    expect(hostLi).not.toBeNull();
    // The hosting row is Bob's (index 1), not Alice's (index 0).
    expect(hostLi!.textContent).toContain("Bob");
    expect(hostLi!.textContent).not.toContain("Alice");
    // Exactly one marker across the whole list.
    expect(screen.getAllByTestId("fanout-marker")).toHaveLength(1);
  });

  it("a byCrewKey-only control still renders its banner (byCrewKey unchanged)", () => {
    const crewAttention: CrewAttention = {
      byCrewKey: new Map([["alice", [<div key="b" data-testid="bycrewkey-banner" />]]]),
      sectionTop: [],
    };
    render(
      <Step3SectionChromeContext.Provider value={chromeWith(crewAttention)}>
        <CrewBreakdown dfid="DRIVE" members={[member("Alice")]} />
      </Step3SectionChromeContext.Provider>,
    );
    const banner = screen.getByTestId("bycrewkey-banner");
    expect(banner.closest("li")!.textContent).toContain("Alice");
  });
});

const SHOW_ID = "55555555-5555-4555-8555-555555555555";
const SLUG = "fanout-fixture";
const DFID = "DRIVE_FANOUT";

function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Fanout Fixture Show",
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
      drive_file_id: DFID,
      archived: false,
      published: true,
    },
    internal: {
      financials: null,
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: SHOW_ID,
    },
    crew_members: [
      { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Alice Anders", role: "PM" },
      { id: "aaaaaaaa-0000-4000-8000-000000000002", name: "Bob Barker", role: "AV" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

function SurfaceHarness({ sectionAttention }: { sectionAttention: SectionAttention }) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const data = buildPublishedSectionData(snapshot(), { slug: SLUG }) as PublishedSectionData;
  return (
    <ShowReviewSurface
      data={data}
      scrollerRef={scrollerRef}
      layout="page"
      sectionAttention={sectionAttention}
    />
  );
}

describe("(b) ShowReviewSurface threads byRowIndex → CrewAttention.byIndex", () => {
  it("a crew bucket byRowIndex {1:[marker]} lands the marker in the SECOND crew row", () => {
    const sectionAttention: SectionAttention = new Map([
      ["crew", { sectionTop: [], byRowIndex: new Map([[1, [marker("surface-marker")]]]) }],
    ]);
    render(<SurfaceHarness sectionAttention={sectionAttention} />);
    const hostLi = screen.getByTestId("surface-marker").closest("li");
    expect(hostLi).not.toBeNull();
    expect(hostLi!.textContent).toContain("Bob Barker");
    expect(hostLi!.textContent).not.toContain("Alice Anders");
    expect(screen.getAllByTestId("surface-marker")).toHaveLength(1);
  });
});
