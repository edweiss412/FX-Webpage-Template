import { describe, expect, test } from "vitest";
import { computeNewShowGaps } from "@/lib/notify/monitorDigest";
import { GAP_CLASSES } from "@/lib/parser/dataGaps";

// Build a DriftRow whose parse_warnings carry the given warn codes (count 1 each).
function row(
  drive: string,
  phase: "baseline" | "current",
  codes: string[],
  title = "Show " + drive,
  slug = "s-" + drive,
) {
  return {
    drive_file_id: drive,
    slug,
    title,
    phase,
    parse_warnings: codes.map((code) => ({ code, severity: "warn", message: "x" })),
  };
}
const label = (code: string) => GAP_CLASSES.find((g) => g.code === code)!.label;

describe("computeNewShowGaps (spec §3.2, §3.3)", () => {
  test("first-seen isolation: reports current-only show, not a baselined one", () => {
    const out = computeNewShowGaps([
      row("A", "current", ["ROOM_HEADER_SPLIT_AMBIGUOUS"]),
      row("B", "baseline", []),
      row("B", "current", ["ROOM_HEADER_SPLIT_AMBIGUOUS"]),
    ]);
    expect(out.map((g) => g.slug)).toEqual(["s-A"]);
  });

  test("clean first-seen (no gaps) is skipped", () => {
    expect(computeNewShowGaps([row("A", "current", [])])).toEqual([]);
  });

  test("label mapping incl. ambiguity codes, GAP_CLASSES order, derived labels", () => {
    const out = computeNewShowGaps([
      row("A", "current", [
        "DATE_ORDER_SUGGESTS_DMY",
        "ROOM_HEADER_SPLIT_AMBIGUOUS",
        "HOTEL_GUEST_SPLIT_AMBIGUOUS",
      ]),
    ]);
    expect(out[0]!.items).toEqual([
      label("ROOM_HEADER_SPLIT_AMBIGUOUS"),
      label("HOTEL_GUEST_SPLIT_AMBIGUOUS"),
      label("DATE_ORDER_SUGGESTS_DMY"),
    ]);
  });

  test("gate-exempt excluded, non-exempt kept (discrimination)", () => {
    const out = computeNewShowGaps([
      row("A", "current", ["VENUE_GEOCODE_UNRESOLVED", "FIELD_UNREADABLE"]),
    ]);
    expect(out[0]!.items).toEqual([label("FIELD_UNREADABLE")]);
    expect(out[0]!.items).not.toContain(label("VENUE_GEOCODE_UNRESOLVED"));
  });
});
