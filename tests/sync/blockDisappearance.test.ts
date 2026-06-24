/**
 * Class C — BLOCK_DISAPPEARED from MI-7 (parse-data-quality-warnings §5.3, VB10).
 *
 * Block disappearance is already detected by MI-7 (the section-shrinkage guard),
 * which fires for any stateful block going prior>0 → next 0 and already writes a
 * `section_shrunk` Changes-feed row. The ONLY gap MI-7 leaves is the persistent
 * per-show Data-Quality panel (reads shows_internal.parse_warnings) — MI-7
 * produces a triggered-item + feed row but NO parse_warning. Class C derives a
 * BLOCK_DISAPPEARED ParseWarning from the MI-7 items whose new_count === 0, with
 * a suppression so we never double-warn when SECTION_HEADER_NO_FIELDS already
 * covers the same (normalized) block.
 */

import { describe, it, expect } from "vitest";
import { blockDisappearanceWarnings } from "@/lib/sync/blockDisappearance";
import type { TriggeredReviewItem, ParseWarning } from "@/lib/parser/types";

function mi7(
  section: "hotel_reservations" | "rooms" | "contacts" | "transportation",
  prior_count: number,
  new_count: number,
): TriggeredReviewItem {
  return { id: `id-${section}`, invariant: "MI-7", section, prior_count, new_count };
}

describe("blockDisappearanceWarnings", () => {
  it("maps each MI-7 item with new_count===0 to one BLOCK_DISAPPEARED (blockRef.kind = MI-7 section)", () => {
    const items: TriggeredReviewItem[] = [
      mi7("hotel_reservations", 3, 0),
      mi7("rooms", 2, 0),
      mi7("contacts", 4, 0),
      mi7("transportation", 1, 0),
    ];
    const out = blockDisappearanceWarnings(items, []);
    expect(out.length).toBe(4);
    expect(out.every((w) => w.code === "BLOCK_DISAPPEARED")).toBe(true);
    expect(out.every((w) => w.severity === "warn")).toBe(true);
    expect(out.map((w) => w.blockRef?.kind).sort()).toEqual(
      ["contacts", "hotel_reservations", "rooms", "transportation"].sort(),
    );
  });

  it("handles transportation object→null (prior_count 1 → new_count 0)", () => {
    const out = blockDisappearanceWarnings([mi7("transportation", 1, 0)], []);
    expect(out.length).toBe(1);
    expect(out[0]!.blockRef?.kind).toBe("transportation");
  });

  it("does NOT emit for an MI-7 partial shrink (new_count > 0 — section_shrunk already covers it)", () => {
    const out = blockDisappearanceWarnings([mi7("hotel_reservations", 4, 1)], []);
    expect(out).toEqual([]);
  });

  it("returns empty for no MI-7 items (e.g. first-seen, no prior)", () => {
    const out = blockDisappearanceWarnings([], []);
    expect(out).toEqual([]);
  });

  it("ignores non-MI-7 triggered items", () => {
    const items: TriggeredReviewItem[] = [{ id: "a", invariant: "MI-6" }, mi7("rooms", 2, 0)];
    const out = blockDisappearanceWarnings(items, []);
    expect(out.length).toBe(1);
    expect(out[0]!.blockRef?.kind).toBe("rooms");
  });

  it("SUPPRESSES BLOCK_DISAPPEARED when SECTION_HEADER_NO_FIELDS already covers the same block — hotels→hotel_reservations normalization", () => {
    // The parser emits SECTION_HEADER_NO_FIELDS with blockRef.kind "hotels" (the
    // real parser kind, hotels.ts:69), while MI-7 uses section "hotel_reservations".
    // The helper normalizes hotels → hotel_reservations before comparing, so the
    // duplicate is suppressed and exactly ONE warning (the more-specific empty-
    // section one) remains for the cleared hotel block.
    const existing: ParseWarning[] = [
      {
        severity: "warn",
        code: "SECTION_HEADER_NO_FIELDS",
        message: 'Recognized "hotels" section header but parsed zero fields — section dropped.',
        blockRef: { kind: "hotels" },
      },
    ];
    const out = blockDisappearanceWarnings([mi7("hotel_reservations", 2, 0)], existing);
    // No new BLOCK_DISAPPEARED for the hotel block.
    expect(out.filter((w) => w.blockRef?.kind === "hotel_reservations")).toEqual([]);
    expect(out).toEqual([]);
  });

  it("suppression is per-block — other disappeared blocks still warn", () => {
    const existing: ParseWarning[] = [
      {
        severity: "warn",
        code: "SECTION_HEADER_NO_FIELDS",
        message: "empty hotels",
        blockRef: { kind: "hotels" },
      },
    ];
    const out = blockDisappearanceWarnings(
      [mi7("hotel_reservations", 2, 0), mi7("rooms", 3, 0)],
      existing,
    );
    expect(out.length).toBe(1);
    expect(out[0]!.blockRef?.kind).toBe("rooms");
  });

  it("suppresses rooms/contacts/transportation directly (kinds match MI-7, no normalization needed)", () => {
    const existing: ParseWarning[] = [
      {
        severity: "warn",
        code: "SECTION_HEADER_NO_FIELDS",
        message: "x",
        blockRef: { kind: "rooms" },
      },
    ];
    const out = blockDisappearanceWarnings([mi7("rooms", 2, 0)], existing);
    expect(out).toEqual([]);
  });
});
