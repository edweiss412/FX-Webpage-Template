// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, test } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { TravelSection } from "@/components/crew/sections/TravelSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

afterEach(cleanup);
const TODAY = new Date("2026-05-14T15:00:00Z");

// The default crew row is { id: "c1", name: "Test Crew" }; the garbled driver
// "Doug Larson Loadout" does NOT name-match "Test Crew", so the ONLY path that can
// reveal the transport block is the id path (transportationOwnerIds contains data.viewerId).
const garbled = (ownerIds: string[]) =>
  makeShowForViewer({
    transportation: {
      driver_name: "Doug Larson Loadout",
      driver_phone: "555-7",
      driver_email: null,
      loadout_name: null,
      loadout_phone: null,
      loadout_email: null,
      vehicle: "Van",
      license_plate: "ABC123",
      color: "Black",
      parking: "Lot A",
      schedule: [{ stage: "load-in", date: "2026-05-13", time: "8AM", assigned_names: [] }],
      notes: "N",
    },
    viewerId: "c1",
    transportationOwnerIds: ownerIds,
  });

test("id path: garbled-driver transport block RENDERS for the resolved owner via data.transportationOwnerIds", () => {
  const { container } = render(
    <TravelSection
      data={garbled(["c1"])}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId="show-abc"
    />,
  );
  expect(container.textContent).toContain("Lot A"); // transport PII now visible via the id path
});

test("negative control: empty owner set → block hidden (proves the id path, not the name path, revealed it)", () => {
  const { container } = render(
    <TravelSection
      data={garbled([])}
      viewer={{ kind: "crew", crewMemberId: "c1" }}
      today={TODAY}
      showId="show-abc"
    />,
  );
  expect(container.textContent).not.toContain("Lot A");
});
