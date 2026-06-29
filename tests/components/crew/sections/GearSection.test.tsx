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

test("Scenic + Other scope cards render when populated and auto-omit when empty (spec §3.6)", () => {
  const data = makeShowForViewer({
    rooms: [
      {
        id: "r1",
        kind: "gs",
        name: "GS",
        audio: null,
        video: null,
        lighting: null,
        scenic: "(2) Grey Spandex",
        other: "(1) Truss Podium",
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
  expect(container.querySelector('[data-testid="gear-scope-scenic"]')).not.toBeNull();
  expect(container.querySelector('[data-testid="gear-scope-other"]')).not.toBeNull();
  // never emphasized (A/V/L-only) — neutral cards:
  expect(
    container.querySelector('[data-testid="gear-scope-scenic"]')!.getAttribute("data-emphasis"),
  ).toBeNull();
  // all-sentinel scenic/other → both cards omitted:
  const sentinel = makeShowForViewer({
    rooms: [
      {
        id: "r1",
        kind: "gs",
        name: "GS",
        audio: "mic",
        video: null,
        lighting: null,
        scenic: "TBD",
        other: "-",
      },
    ],
  });
  const c2 = render(
    <GearSection
      data={sentinel}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container;
  expect(c2.querySelector('[data-testid="gear-scope-scenic"]')).toBeNull();
  expect(c2.querySelector('[data-testid="gear-scope-other"]')).toBeNull();
});

test("keynote requirements card renders from event_details (closes the missing-coverage gap)", () => {
  const data = makeShowForViewer({
    show: { event_details: { keynote_requirements: "Confidence monitor + clicker" } },
  });
  const { container } = render(
    <GearSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  const card = container.querySelector('[data-testid="gear-keynote"]');
  expect(card).not.toBeNull();
  expect(card!.textContent).toContain("Confidence monitor + clicker");
  // sentinel keynote → omitted:
  const tbd = makeShowForViewer({ show: { event_details: { keynote_requirements: "TBD" } } });
  expect(
    render(
      <GearSection
        data={tbd}
        viewer={{ kind: "crew", crewMemberId: "c1" }}
        today={TODAY}
        showId={SHOW_ID}
      />,
    ).container.querySelector('[data-testid="gear-keynote"]'),
  ).toBeNull();
});

test("scope-card source link targets gear_scope (GEAR tab) when present, else rooms/INFO (spec §3.6 / R4-M2)", () => {
  const base = {
    rooms: [
      { id: "r1", kind: "gs" as const, name: "GS", audio: "(1) QU32", video: null, lighting: null },
    ],
    driveFileId: "DRIVE123",
  };
  // GEAR-derived: gear_scope anchor present → link uses GEAR gid:
  const withGear = makeShowForViewer({
    ...base,
    sourceAnchors: { gear_scope: { title: "GEAR", gid: 99 }, rooms: { title: "INFO", gid: 5 } },
  });
  const a1 = render(
    <GearSection
      data={withGear}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container.querySelector('[data-testid="gear-scope-audio"] a');
  expect(a1!.getAttribute("href")).toContain("#gid=99");

  // INFO-inline (no gear_scope anchor) → link uses rooms/INFO gid:
  const noGear = makeShowForViewer({
    ...base,
    sourceAnchors: { rooms: { title: "INFO", gid: 5 } },
  });
  const a2 = render(
    <GearSection
      data={noGear}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  ).container.querySelector('[data-testid="gear-scope-audio"] a');
  expect(a2!.getAttribute("href")).toContain("#gid=5");
});
