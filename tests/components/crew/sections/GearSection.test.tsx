// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "@testing-library/react";

import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

test("all scope shown to everyone; viewer's discipline first + [data-emphasis=you]; empty scope omitted incl viewer's own", () => {
  const data = makeShowForViewer({
    rooms: [
      { id: "r1", kind: "gs", name: "GS", audio: "2x SM58", video: "1x PTZ", lighting: null },
    ],
    crewMembers: [
      {
        id: "c1",
        name: "A",
        email: null,
        phone: null,
        role: "",
        roleFlags: ["A1"],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
  });
  const { container } = render(
    <GearSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  const cards = [...container.querySelectorAll('[data-testid^="gear-scope-"]')];
  expect(cards.map((c) => c.getAttribute("data-testid"))).toEqual([
    "gear-scope-audio",
    "gear-scope-video",
  ]);
  // Mock `.card-head .ico` parity: each scope card carries its leading glyph.
  for (const c of cards) {
    expect(c.querySelector('[data-slot="section-card-icon"] svg')).not.toBeNull();
  }
  expect(cards[0]!.getAttribute("data-emphasis")).toBe("you");
  expect(container.querySelector('[data-testid="gear-scope-lighting"]')).toBeNull();
});

test("no-flag viewer → default order, no emphasis; all-empty → section EmptyState", () => {
  const noFlag = makeShowForViewer({
    rooms: [{ id: "r1", kind: "gs", name: "GS", audio: "mic", video: "cam", lighting: "par" }],
    crewMembers: [
      {
        id: "c1",
        name: "A",
        email: null,
        phone: null,
        role: "",
        roleFlags: [],
        dateRestriction: { kind: "none" },
        stageRestriction: { kind: "none" },
      },
    ],
  });
  expect(
    [
      ...render(
        <GearSection
          data={noFlag}
          viewer={{ kind: "crew", crewMemberId: "c1" }}
          today={TODAY}
          showId={SHOW_ID}
        />,
      ).container.querySelectorAll('[data-testid^="gear-scope-"]'),
    ].map((c) => c.getAttribute("data-emphasis")),
  ).toEqual([null, null, null]);
  const empty = makeShowForViewer({ rooms: [], pullSheet: null, openingReelHasVideo: false });
  expect(
    render(
      <GearSection
        data={empty}
        viewer={{ kind: "crew", crewMemberId: "c1" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container.querySelector('[data-testid="section-empty"]'),
  ).toBeTruthy();
});

test("opening-reel cell is text-only (no Drive URL) AND the proxied player uses /api/asset/reel/<showId>", () => {
  const data = makeShowForViewer({
    show: { event_details: { opening_reel: "YES - https://drive.google.com/file/d/abc/view" } },
    openingReelHasVideo: true,
  });
  const { container } = render(
    <GearSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  const html = container.innerHTML;
  for (const leak of ["https://", "drive.google.com", "docs.google.com"])
    expect(html).not.toContain(leak);
  expect(container.querySelector(`video[src="/api/asset/reel/${SHOW_ID}"]`)).toBeTruthy();
  // Mock `.card-head .ico` parity: the Opening-reel card carries its glyph.
  expect(
    container.querySelector(
      '[data-testid="gear-opening-reel"] [data-slot="section-card-icon"] svg',
    ),
  ).not.toBeNull();
});

test("pack list omitted when isPackListVisibleToday is false", () => {
  // Default fixture has schedule_phases: {} — TODAY maps to NO work phase, so
  // todayWorkPhases([]) never overlaps PACK_LIST_VISIBLE_PHASES and
  // isPackListVisibleToday returns false (genuine gate-false derived from the
  // helper's first conjunct, NOT by removing pullSheet — pullSheet is present).
  const withheld = makeShowForViewer({ pullSheet: [{ caseLabel: "C1", items: [] }] });
  expect(
    render(
      <GearSection
        data={withheld}
        viewer={{ kind: "crew", crewMemberId: "c1" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container.querySelector('[data-testid="gear-pack-list"]'),
  ).toBeNull();
});

test("a pure-URL opening reel with no video renders NO Opening reel card (whole-card-missing; Codex review R1)", () => {
  // A pure Drive URL strips to "" → shouldHideOpeningReel hides it (reelText null);
  // with no video, hasReel is false → the card must NOT render (no empty shell),
  // preserving the deleted OpeningReelTile's whole-tile-missing contract.
  const data = makeShowForViewer({
    show: { event_details: { opening_reel: "https://drive.google.com/file/d/abc/view" } },
    openingReelHasVideo: false,
  });
  const { container } = render(
    <GearSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(container.querySelector('[data-testid="gear-opening-reel"]')).toBeNull();
});
