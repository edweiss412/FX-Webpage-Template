import { describe, it, expect } from "vitest";
import { partialAttendanceLabel } from "@/lib/crew/partialAttendance";

describe("partialAttendanceLabel", () => {
  it("explicit humanized (crew, ISO days)", () => {
    expect(
      partialAttendanceLabel(
        { kind: "explicit", days: ["2025-10-07", "2025-10-09"] },
        { humanize: true },
      ),
    ).toBe("Oct 7 & 9 only");
  });

  it("explicit raw (modal, M/D tokens, as-parsed)", () => {
    expect(
      partialAttendanceLabel({ kind: "explicit", days: ["10/7", "10/9"] }, { humanize: false }),
    ).toBe("10/7, 10/9 only");
  });

  it("unknown_asterisk → dates-TBD copy (both modes)", () => {
    expect(
      partialAttendanceLabel({ kind: "unknown_asterisk", days: null }, { humanize: true }),
    ).toBe("Partial (dates TBD)");
    expect(
      partialAttendanceLabel({ kind: "unknown_asterisk", days: null }, { humanize: false }),
    ).toBe("Partial (dates TBD)");
  });

  it("none / null / empty / all-blank / all-malformed → null", () => {
    expect(partialAttendanceLabel({ kind: "none" }, { humanize: true })).toBeNull();
    expect(partialAttendanceLabel(null, { humanize: true })).toBeNull();
    expect(partialAttendanceLabel({ kind: "explicit", days: [] }, { humanize: true })).toBeNull();
    expect(
      partialAttendanceLabel({ kind: "explicit", days: [" ", "\t"] }, { humanize: true }),
    ).toBeNull();
    expect(
      partialAttendanceLabel({ kind: "explicit", days: ["garbage"] }, { humanize: true }),
    ).toBeNull();
  });
});
