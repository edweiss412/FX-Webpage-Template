// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render } from "@testing-library/react";

import { TravelSection } from "@/components/crew/sections/TravelSection";
import { makeShowForViewer } from "@/tests/fixtures/showForViewer";

const TODAY = new Date("2026-05-14T15:00:00Z");
const SHOW_ID = "show-abc";

test("unassigned crew see no ground-transport PII; admin sees the full field set; hotels stack by ordinal", () => {
  const data = makeShowForViewer({
    transportation: {
      driver_name: "Pat",
      driver_phone: "555-7",
      driver_email: null,
      vehicle: "Van",
      license_plate: "ABC123",
      color: "Black",
      parking: "Lot A",
      schedule: [{ stage: "load-in", date: "2026-05-13", time: "8AM", assigned_names: ["someone"] }],
      notes: "N",
    },
    hotelReservations: [
      {
        ordinal: 1,
        hotel_name: "Second",
        hotel_address: null,
        names: [],
        confirmation_no: null,
        check_in: "2026-05-14",
        check_out: null,
        notes: null,
      },
      {
        ordinal: 0,
        hotel_name: "First",
        hotel_address: null,
        names: [],
        confirmation_no: null,
        check_in: "2026-05-13",
        check_out: null,
        notes: null,
      },
    ],
  });
  const crew = render(
    <TravelSection
      data={data}
      viewer={{ kind: "crew", crewMemberId: "nobody" }}
      today={TODAY}
      showId={SHOW_ID}
    />,
  );
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"])
    expect(crew.container.textContent).not.toContain(pii);
  const admin = render(
    <TravelSection data={data} viewer={{ kind: "admin" }} today={TODAY} showId={SHOW_ID} />,
  );
  for (const pii of ["Pat", "555-7", "Van", "ABC123", "Lot A"])
    expect(admin.container.textContent).toContain(pii);
  const html = admin.container.textContent!;
  expect(html.indexOf("First")).toBeLessThan(html.indexOf("Second")); // ordinal 0 before 1, regardless of array order
});
