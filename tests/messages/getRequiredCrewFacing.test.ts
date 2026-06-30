import { describe, expect, test } from "vitest";
import { getRequiredCrewFacing } from "@/lib/messages/lookup";

describe("getRequiredCrewFacing", () => {
  test("returns crewFacing copy when present", () => {
    expect(getRequiredCrewFacing("GOOGLE_NO_CREW_MATCH")).toMatch(/crew list/i);
  });
  test("throws when crewFacing is null", () => {
    // ADMIN_ROUTE_LOAD_FAILED has dougFacing copy but crewFacing null
    expect(() => getRequiredCrewFacing("ADMIN_ROUTE_LOAD_FAILED")).toThrow(/no Crew-facing copy/);
  });
});
