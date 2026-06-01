// M12.2 Phase A Task 2 — resolveShowTimezone is the SINGLE show-tz resolver
// shared by crew right-now, pack-list, and the admin dashboard live compute
// (spec §3.1(a)). It validates the IANA name (Intl throws on a bad zone) and
// falls back to America/New_York for blank / whitespace / invalid input.
import { describe, expect, it } from "vitest";
import { resolveShowTimezone } from "@/lib/time/showTimezone";

describe("resolveShowTimezone", () => {
  it("returns a valid IANA tz unchanged", () => {
    expect(resolveShowTimezone({ timezone: "America/Los_Angeles" } as never)).toBe(
      "America/Los_Angeles",
    );
  });

  it.each([null, undefined, { timezone: "" }, { timezone: "   " }, { timezone: "Not/AZone" }])(
    "falls back to America/New_York for invalid/blank tz: %p",
    (venue) => {
      expect(resolveShowTimezone(venue as never)).toBe("America/New_York");
    },
  );

  it("trims surrounding whitespace on an otherwise-valid zone", () => {
    expect(resolveShowTimezone({ timezone: "  America/Chicago  " } as never)).toBe(
      "America/Chicago",
    );
  });
});
