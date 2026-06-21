// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "@testing-library/react";
import { VenueSection } from "@/components/crew/sections/VenueSection";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { CrewSection } from "@/components/crew/sections/CrewSection";
import { GearSection } from "@/components/crew/sections/GearSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

const SECTIONS = { VenueSection, TravelSection, CrewSection, GearSection } as const;

// _Catches: a blank section with no empty-state, or multiple stray empty stubs,
// once the all-blocks-empty path is hit (test 9).
test.each(Object.keys(SECTIONS))(
  "%s shows exactly one EmptyState when all blocks empty/hidden",
  (name) => {
    const Section = SECTIONS[name as keyof typeof SECTIONS];
    const empty = makeShowForViewer({
      show: { venue: null, coi_status: null, event_details: {} },
      crewMembers: [],
      rooms: [],
      transportation: null,
      hotelReservations: [],
      contacts: [],
      pullSheet: null,
      diagrams: null,
      openingReelHasVideo: false,
    });
    const { container } = render(
      <Section data={empty} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
    );
    expect(container.querySelectorAll('[data-testid="section-empty"]').length).toBe(1);
  },
);
