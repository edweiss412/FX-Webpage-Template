import { describe, expect, test } from "vitest";

import { SYNC_PROBLEM_CODES } from "@/lib/notify/constants";

describe("SYNC_PROBLEM_CODES set (§4.1)", () => {
  test("is exactly the three show-level consumed error codes", () => {
    expect([...SYNC_PROBLEM_CODES].sort()).toEqual(
      ["DRIVE_FETCH_FAILED", "PARSE_ERROR_LAST_GOOD", "SHEET_UNAVAILABLE"].sort(),
    );
  });

  test("excludes the pre-show fallback SHEET_PROCESS_FAILED", () => {
    expect(SYNC_PROBLEM_CODES).not.toContain("SHEET_PROCESS_FAILED");
  });
});
