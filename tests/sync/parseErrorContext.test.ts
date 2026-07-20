// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildParseErrorContext } from "@/lib/sync/parseErrorContext";

const base = { driveFileId: "drive-1", sheetName: "II - East Coast" };

describe("buildParseErrorContext", () => {
  it("retains the existing context fields", () => {
    const ctx = buildParseErrorContext({ ...base, failureCode: "MI-4_NO_CREW" });
    expect(ctx.drive_file_id).toBe("drive-1");
    expect(ctx.sheet_name).toBe("II - East Coast");
  });
  it("adds error_code for an allowlisted failure", () =>
    expect(buildParseErrorContext({ ...base, failureCode: "MI-4_NO_CREW" }).error_code).toBe(
      "MI-4_NO_CREW",
    ));
  it("OMITS error_code for PARSE_HARD_FAIL, unknown, null, undefined", () => {
    for (const failureCode of ["PARSE_HARD_FAIL", "WHATEVER", null, undefined] as const)
      expect(buildParseErrorContext({ ...base, failureCode }).error_code).toBeUndefined();
  });
  it("NEVER persists anything derived from message (privacy)", () => {
    const SENTINEL = "SECRET-SHEET-CONTENT-9f3a";
    const ctx = buildParseErrorContext({
      ...base,
      failureCode: "MI-4_NO_CREW",
      message: `title was ${SENTINEL}`,
    });
    expect(JSON.stringify(ctx)).not.toContain(SENTINEL);
    expect("message" in ctx).toBe(false);
  });
  it("adds exactly one key beyond the two existing (error_code)", () =>
    expect(Object.keys(buildParseErrorContext({ ...base, failureCode: "MI-5_NO_ROOMS" })).sort()).toEqual(
      ["drive_file_id", "error_code", "sheet_name"],
    ));
});
