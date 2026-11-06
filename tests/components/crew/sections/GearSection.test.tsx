// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "@testing-library/react";

import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import { ledgerProp } from "./_ledgerProp";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

// The scope and room detail cases moved to RoomsSection.test.tsx with the cards (PR C
// Task 7). Gear holds nothing but its empty state until it retires in Task 8.
test("Gear shows its empty state over a show with rooms: its cards are Rooms' now", () => {
  const data = makeShowForViewer({
    rooms: [
      { id: "r1", kind: "gs", name: "GS", audio: "2x SM58", video: "1x PTZ", lighting: null },
    ],
  });
  const { container } = render(
    <GearSection
      {...ledgerProp()}
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  expect(container.querySelector('[data-testid="section-empty"]')).toBeTruthy();
  expect(container.textContent ?? "").not.toContain("2x SM58");
});
