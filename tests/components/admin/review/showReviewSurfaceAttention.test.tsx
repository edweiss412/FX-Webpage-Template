// @vitest-environment jsdom
/**
 * tests/components/admin/review/showReviewSurfaceAttention.test.tsx
 * (published-show-alerts spec §5.3 / §5.4 / §6.2 — plan Task 5)
 *
 * The surface's attention plumbing: `attentionSections` forces the amber
 * needs-review dot channel; `attentionJump` scrolls to the anchor with the
 * one-shot flash (same suppression + highlight machinery as jumpToWarning);
 * `crewAttention` threads through the crew section's chrome context into
 * CrewBreakdown (in-li banners + section-top block). Absent props → DOM
 * byte-identical (the staged wizard mode boundary).
 *
 * Anti-tautology: the in-li assertion queries the <li> containing the member
 * name and checks the banner is its DESCENDANT (after cloning away sibling
 * rows); byte-identity diffs the crew section innerHTML with/without props.
 */
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ShowReviewSurface, type CrewAttention } from "@/components/admin/review/ShowReviewSurface";
import { buildPublishedSectionData } from "@/components/admin/review/publishedAdapter";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const SLUG = "attention-surface-show";
const SHOW_ID = "11111111-2222-4333-8444-666666666666";
const DRIVE_FILE_ID = "drive-attention-1";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({}) } as Response)),
  );
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  window.location.hash = "";
});

function snapshot(): ShowReviewSnapshot {
  return {
    show: {
      id: SHOW_ID,
      title: "Attention Fixture Show",
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
      { id: "c1", name: "John Redcorn", role: "Lighting · LEAD" },
      { id: "c2", name: "John Redcorn", role: "Duplicate Name" },
      { id: "c3", name: "Priya Shah", role: "Video · V1" },
    ],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  } as unknown as ShowReviewSnapshot;
}

function railTid(name: string): string {
  return `wizard-step3-card-${DRIVE_FILE_ID}-review-${name}`;
}

function crewAttentionFixture(): CrewAttention {
  return {
    byCrewKey: new Map([
      [
        "john redcorn",
        [<div key="b1" data-testid="fixture-banner" data-attention-anchor="alert:a1" />],
      ],
    ]),
    sectionTop: [<div key="t1" data-testid="fixture-sectiontop-banner" />],
  };
}

function Harness({
  attentionSections,
  crewAttention,
  withJumpControls,
}: {
  attentionSections?: ReadonlySet<string>;
  crewAttention?: CrewAttention;
  withJumpControls?: boolean;
}) {
  const scrollerRef = useRef<HTMLElement | null>(null);
  const [jump, setJump] = useState<{ itemId: string; sectionId: string; nonce: number } | null>(
    null,
  );
  const data = buildPublishedSectionData(snapshot(), { slug: SLUG });
  return (
    <>
      {withJumpControls ? (
        <>
          <button
            data-testid="fire-jump"
            onClick={() => setJump({ itemId: "alert:a1", sectionId: "crew", nonce: 1 })}
          />
          <button
            data-testid="fire-jump-missing"
            onClick={() => setJump({ itemId: "alert:absent", sectionId: "crew", nonce: 2 })}
          />
          <button
            data-testid="fire-jump-same-nonce"
            onClick={() => setJump({ itemId: "alert:a1", sectionId: "crew", nonce: 1 })}
          />
        </>
      ) : null}
      <ShowReviewSurface
        data={data}
        scrollerRef={scrollerRef}
        layout="page"
        {...(attentionSections ? { attentionSections } : {})}
        {...(crewAttention ? { crewAttention } : {})}
        attentionJump={jump}
      />
    </>
  );
}

function stubScrollerGeometry() {
  // jsdom: no layout — give the scroller scrollTo + non-zero geometry so the
  // jump path executes (the existing extras test's stub idiom).
  const scroller = document.querySelector<HTMLElement>(
    `[data-testid="${railTid("content")}"]`,
  )!;
  Object.defineProperty(scroller, "clientHeight", { value: 400, configurable: true });
  Object.defineProperty(scroller, "scrollHeight", { value: 2000, configurable: true });
  const scrollToSpy = vi.fn();
  (scroller as unknown as { scrollTo: unknown }).scrollTo = scrollToSpy;
  return { scroller, scrollToSpy };
}

describe("attentionSections dot channel (spec §5.3)", () => {
  it("crew rail + chip dots flip to the amber review channel with zero parse warnings", () => {
    render(<Harness attentionSections={new Set(["crew"])} />);
    expect(screen.getByTestId(railTid("rail-dot-crew")).className).toContain("bg-status-review");
    expect(screen.getByTestId(railTid("chip-dot-crew")).className).toContain("bg-status-review");
    // second channel: sr text says needs review
    const railItem = screen.getByTestId(railTid("rail-item-crew"));
    expect(railItem.textContent).toContain("needs review");
  });

  it("absent prop → hollow positive ring (byte-identical no-attention path)", () => {
    render(<Harness />);
    expect(screen.getByTestId(railTid("rail-dot-crew")).className).toContain(
      "border-status-positive",
    );
  });
});

describe("crewAttention threading (spec §5.4)", () => {
  it("banner renders INSIDE the first matching member's <li> only; sectionTop above the list", () => {
    render(<Harness crewAttention={crewAttentionFixture()} />);
    const crewSection = screen.getByTestId(railTid("section-crew"));
    const banner = screen.getByTestId("fixture-banner");
    const hostLi = banner.closest("li")!;
    expect(hostLi).toBeTruthy();
    // The host row is the FIRST John Redcorn row (clone + strip banner, name remains)
    const clone = hostLi.cloneNode(true) as HTMLElement;
    clone.querySelector('[data-testid="fixture-banner"]')!.remove();
    expect(clone.textContent).toContain("John Redcorn");
    // duplicate-name second row does NOT host a banner
    const lis = Array.from(crewSection.querySelectorAll("li"));
    const hosts = lis.filter((li) => li.querySelector('[data-testid="fixture-banner"]'));
    expect(hosts).toHaveLength(1);
    // sectionTop block renders before the <ul>
    const top = screen.getByTestId("fixture-sectiontop-banner");
    const ul = crewSection.querySelector("ul")!;
    expect(top.compareDocumentPosition(ul) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("absent crewAttention → crew section DOM byte-identical", () => {
    const { unmount } = render(<Harness />);
    const before = screen.getByTestId(railTid("section-crew")).innerHTML;
    unmount();
    render(<Harness crewAttention={{ byCrewKey: new Map(), sectionTop: [] }} />);
    const after = screen.getByTestId(railTid("section-crew")).innerHTML;
    expect(after).toBe(before);
  });
});

describe("attentionJump (spec §6.2)", () => {
  it("scrolls to the anchor, flashes it, and ignores a same-nonce re-set", () => {
    render(<Harness crewAttention={crewAttentionFixture()} withJumpControls />);
    const { scrollToSpy } = stubScrollerGeometry();
    fireEvent.click(screen.getByTestId("fire-jump"));
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    const anchor = document.querySelector('[data-attention-anchor="alert:a1"]')!;
    expect(anchor.hasAttribute("data-step3-warning-flash")).toBe(true);
    // same nonce → no second scroll
    fireEvent.click(screen.getByTestId("fire-jump-same-nonce"));
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
  });

  it("missing anchor → section-top scroll, no flash anywhere", () => {
    render(<Harness crewAttention={crewAttentionFixture()} withJumpControls />);
    const { scrollToSpy } = stubScrollerGeometry();
    fireEvent.click(screen.getByTestId("fire-jump-missing"));
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-step3-warning-flash]")).toBeNull();
  });
});
