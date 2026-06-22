import { describe, it, expect } from "vitest";
import { buildSheetDeepLink } from "@/lib/sheet-links/buildSheetDeepLink";

const ID = "1ABC";
const base = `https://docs.google.com/spreadsheets/d/${ID}/edit`;

describe("buildSheetDeepLink", () => {
  it("builds a range link", () => {
    expect(buildSheetDeepLink(ID, { title: "INFO", gid: 0, a1: "A18:E21" })).toBe(
      `${base}#gid=0&range=A18%3AE21`,
    );
  });
  it("gid 0 is valid (must not degrade)", () => {
    expect(buildSheetDeepLink(ID, { title: "INFO", gid: 0, a1: "A1:B2" })).toBe(
      `${base}#gid=0&range=A1%3AB2`,
    );
  });
  it("URL-encodes the range colon", () => {
    expect(buildSheetDeepLink(ID, { title: "AGENDA", gid: 5, a1: "A1:C1" })).toBe(
      `${base}#gid=5&range=A1%3AC1`,
    );
  });
  it("empty a1 → tab rung", () => {
    expect(buildSheetDeepLink(ID, { title: "INFO", gid: 0, a1: "" })).toBe(`${base}#gid=0`);
  });
  it("a1 without numeric gid → whole-spreadsheet", () => {
    // @ts-expect-error force missing gid
    expect(buildSheetDeepLink(ID, { title: "INFO", a1: "A1:B2" })).toBe(base);
  });
  it("disallowed title → whole-spreadsheet (read-time allowlist guard)", () => {
    expect(buildSheetDeepLink(ID, { title: "CLIENT", gid: 9, a1: "A1:B2" })).toBe(base);
  });
  it("missing anchor → whole-spreadsheet", () => {
    expect(buildSheetDeepLink(ID, null)).toBe(base);
  });
  it("null/empty driveFileId → omit (null)", () => {
    expect(buildSheetDeepLink(null, { title: "INFO", gid: 0, a1: "A1:B2" })).toBeNull();
    expect(buildSheetDeepLink("", { title: "INFO", gid: 0, a1: "A1:B2" })).toBeNull();
  });
});
