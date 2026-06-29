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
  // No usable section anchor → deterministic first-tab landing (`#gid=0`), NOT a
  // bare base URL. A gid-less Google Sheets URL opens the document's LAST-ACTIVE
  // tab (whatever the operator left open — often GEAR), so the "In sheet" link
  // would silently land on the wrong tab. `#gid=0` pins it to the first sheet
  // (INFO in the FXAV templates); if a sheet has no gid 0, Sheets ignores the
  // fragment and opens its default — never worse than the old behavior.
  it("a1 without numeric gid → first tab (#gid=0)", () => {
    // @ts-expect-error force missing gid
    expect(buildSheetDeepLink(ID, { title: "INFO", a1: "A1:B2" })).toBe(`${base}#gid=0`);
  });
  it("disallowed title → first tab (#gid=0) (read-time allowlist guard)", () => {
    expect(buildSheetDeepLink(ID, { title: "CLIENT", gid: 9, a1: "A1:B2" })).toBe(`${base}#gid=0`);
  });
  it("missing anchor → first tab (#gid=0), never a gid-less base URL", () => {
    expect(buildSheetDeepLink(ID, null)).toBe(`${base}#gid=0`);
    expect(buildSheetDeepLink(ID, undefined)).toBe(`${base}#gid=0`);
  });
  it("null/empty driveFileId → omit (null)", () => {
    expect(buildSheetDeepLink(null, { title: "INFO", gid: 0, a1: "A1:B2" })).toBeNull();
    expect(buildSheetDeepLink("", { title: "INFO", gid: 0, a1: "A1:B2" })).toBeNull();
  });
});
