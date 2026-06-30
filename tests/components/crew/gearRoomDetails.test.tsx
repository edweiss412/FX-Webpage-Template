// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, within } from "@testing-library/react";

import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";
import { buildSheetDeepLink, CARD_REGION_MAP } from "@/lib/sheet-links/buildSheetDeepLink";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-rd";
const DRIVE = "drive-rd-1";

// driveFileId + a 'rooms' source anchor so the card's SourceLink renders a real
// href (SourceAnchor = { title, gid }; "INFO" is an allowed title). Returns the
// render `data` too for the deep-link assertion. Container-scoped queries (RTL
// render binds to body — scope to container to avoid sibling-test leakage).
function renderGear(rooms: ShowForViewer["rooms"]) {
  const data = makeShowForViewer({
    rooms,
    driveFileId: DRIVE,
    sourceAnchors: { rooms: { title: "INFO", gid: 5 } },
  });
  const { container } = render(
    <GearSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  return { container, data };
}

describe("GearSection — Room details card (BL-ROOM-DETAIL-UNRENDERED)", () => {
  test("renders per-room detail; hides sentinel rooms; coerces non-string; excludes out-of-scope; wires SourceLink", () => {
    const { container, data } = renderGear([
      {
        id: "r1",
        kind: "gs",
        name: "Grand Ballroom",
        dimensions: "60' x 45'",
        floor: "8th Floor",
        setup: "18 tables of 7",
        set_time: "5/13 after 8pm",
        show_time: "8:15a",
        strike_time: "5/15 1pm",
        // out-of-scope + non-detail:
        power: "100A",
        digital_signage: "2 screens",
        notes: "be careful",
        audio: "QU32",
      } as ShowForViewer["rooms"][number],
      // all-sentinel room → its block omitted:
      {
        id: "r2",
        kind: "breakout",
        name: "Lasalle",
        dimensions: "N/A",
        setup: "TBD",
        set_time: "",
      } as ShowForViewer["rooms"][number],
    ]);
    const card = container.querySelector<HTMLElement>('[data-testid="gear-room-details"]');
    expect(card, "room-details card renders").not.toBeNull();
    const r1 = within(container.querySelector<HTMLElement>('[data-testid="gear-room-detail-r1"]')!);
    expect(r1.getByText("Grand Ballroom")).toBeTruthy();
    expect(r1.getByText("Dimensions")).toBeTruthy();
    expect(r1.getByText("60' x 45'")).toBeTruthy();
    expect(r1.getByText("Setup")).toBeTruthy();
    expect(r1.getByText("Set time")).toBeTruthy();
    // out-of-scope fields never appear in the card:
    expect(within(card!).queryByText("100A")).toBeNull(); // power
    expect(within(card!).queryByText("2 screens")).toBeNull(); // digital_signage
    expect(within(card!).queryByText("be careful")).toBeNull(); // notes
    expect(within(card!).queryByText("QU32")).toBeNull(); // audio (gear, not detail)
    // all-sentinel room block omitted:
    expect(container.querySelector('[data-testid="gear-room-detail-r2"]')).toBeNull();
    // SourceLink wired to the rooms region (test-first):
    const link = card!.querySelector(
      '[data-slot="section-card-action"] a[data-slot="source-link"]',
    );
    expect(link?.getAttribute("href")).toBe(
      buildSheetDeepLink(
        data.driveFileId,
        data.sourceAnchors[CARD_REGION_MAP["gear-room-details"]],
      ),
    );
  });

  test("no card when no room has detail (empty + all-sentinel + no rooms)", () => {
    expect(renderGear([]).container.querySelector('[data-testid="gear-room-details"]')).toBeNull();
    const { container } = renderGear([
      {
        id: "r1",
        kind: "gs",
        name: "GS",
        dimensions: "N/A",
        floor: "TBD",
        setup: "",
      } as ShowForViewer["rooms"][number],
    ]);
    expect(container.querySelector('[data-testid="gear-room-details"]')).toBeNull();
  });

  test("non-string detail value coerces + shows (no throw)", () => {
    const { container } = renderGear([
      {
        id: "r1",
        kind: "gs",
        name: "GS",
        dimensions: 169 as unknown as string,
      } as ShowForViewer["rooms"][number],
    ]);
    expect(
      within(
        container.querySelector<HTMLElement>('[data-testid="gear-room-detail-r1"]')!,
      ).getByText("169"),
    ).toBeTruthy();
  });

  test("cap: 13 rooms with detail → 12 blocks + overflow stub", () => {
    const rooms = Array.from(
      { length: 13 },
      (_, i) =>
        ({
          id: `r${i}`,
          kind: "breakout",
          name: `Room ${i}`,
          dimensions: `${i}0' x 20'`,
        }) as ShowForViewer["rooms"][number],
    );
    const { container } = renderGear(rooms);
    expect(container.querySelectorAll('[data-testid^="gear-room-detail-"]').length).toBe(12);
    expect(
      within(container.querySelector<HTMLElement>('[data-testid="gear-room-details"]')!).getByText(
        /and 1 more room\b/,
      ),
    ).toBeTruthy();
  });
});
