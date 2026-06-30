// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import { render, within } from "@testing-library/react";

import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";
import type { ShowForViewer } from "@/lib/data/getShowForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-tech";

// NOTE: scope every query to the render's `container` (NOT the body-bound
// render queries) so a sibling test's leftover DOM can't satisfy an assertion.
function renderGear(eventDetails: Record<string, string>) {
  const data = makeShowForViewer({
    rooms: [{ id: "r1", kind: "gs", name: "GS", audio: "2x SM58" }],
    show: { event_details: eventDetails as ShowForViewer["show"]["event_details"] },
  });
  const { container } = render(
    <GearSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  return container;
}

describe("GearSection — Tech specs card (BL-EVENT-DETAILS-UNRENDERED)", () => {
  test("renders real specs; hides sentinels; excludes already-rendered keys; coerces non-string", () => {
    const container = renderGear({
      stage_size: "8' x 24' x 2'",
      podium_type: "(2) Acrylic",
      polling: "YES",
      record: "N/A", // sentinel → hidden
      power: "100-amp 3 phase", // already rendered in VenueSection → excluded from this card
      // simulate a bad non-string JSONB value:
      test_pattern: 169 as unknown as string,
    });
    const card = container.querySelector<HTMLElement>('[data-testid="gear-tech-specs"]');
    expect(card, "tech-specs card should render").not.toBeNull();
    const q = within(card!);
    // 1. real specs render (label + value)
    expect(q.getByText("Stage size")).toBeTruthy();
    expect(q.getByText("8' x 24' x 2'")).toBeTruthy();
    expect(q.getByText("Podium")).toBeTruthy();
    expect(q.getByText("Polling")).toBeTruthy();
    // 2. sentinel hidden
    expect(q.queryByText("Recording")).toBeNull();
    // 3. already-rendered-elsewhere key excluded from the tech-specs card
    expect(q.queryByText("Power")).toBeNull();
    // 4. non-string coerced + shown (no throw)
    expect(q.getByText("169")).toBeTruthy();
  });

  test("no card when event_details is empty (no empty card)", () => {
    const container = renderGear({});
    expect(container.querySelector('[data-testid="gear-tech-specs"]')).toBeNull();
  });

  test("no card when every surfaced spec is a sentinel", () => {
    const container = renderGear({ stage_size: "N/A", podium_type: "TBD", polling: "" });
    expect(container.querySelector('[data-testid="gear-tech-specs"]')).toBeNull();
  });
});
