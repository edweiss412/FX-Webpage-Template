import { describe, expect, it } from "vitest";
import { entryId, fnv1a32 } from "@/lib/search/entryId";

/**
 * Spec §3: `id` is `<sectionId>:<region>:<hash>`, `hash` a 32-bit FNV-1a of the
 * EXACT display strings `group`, `label` (empty when null) and `value`, joined
 * by U+001F and written in base 36. Repeats in one section and region get
 * `~2`, `~3` in render order.
 */

// The joiner is typed here, not imported, so a wrong constant in the module fails.
const US = "\u001f";

describe("fnv1a32", () => {
  // Published FNV-1a 32-bit test vectors, plus one non-ASCII string that pins
  // hashing over UTF-8 octets rather than UTF-16 code units.
  it.each([
    ["", 0x811c9dc5],
    ["a", 0xe40c292c],
    ["foobar", 0xbf9cf968],
    ["Café", 0xcfc290a9],
  ])("hashes %j to its reference value", (input, expected) => {
    expect(fnv1a32(input)).toBe(expected);
  });

  it("is unsigned 32-bit", () => {
    for (const s of ["", "a", "Grand Ballroom", "x".repeat(500)]) {
      const h = fnv1a32(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe("entryId", () => {
  it("is <section>:<region>:<base-36 FNV-1a of group, label, value joined by U+001F>", () => {
    const id = entryId(
      "venue",
      "venue-facilities",
      "Facilities",
      "Wi-Fi password",
      "ORDTG.",
      new Map(),
    );
    const hash = fnv1a32(`Facilities${US}Wi-Fi password${US}ORDTG.`).toString(36);
    expect(id).toBe(`venue:venue-facilities:${hash}`);
  });

  it("hashes a null label as the empty string", () => {
    const fromNull = entryId(
      "gear",
      "gear-keynote",
      "Keynote requirements",
      null,
      "Two lavs",
      new Map(),
    );
    const fromEmpty = entryId(
      "gear",
      "gear-keynote",
      "Keynote requirements",
      "",
      "Two lavs",
      new Map(),
    );
    expect(fromNull).toBe(fromEmpty);
    expect(fromNull).toBe(
      `gear:gear-keynote:${fnv1a32(`Keynote requirements${US}${US}Two lavs`).toString(36)}`,
    );
  });

  it("accepts the literal region `none` for a line outside every card", () => {
    const id = entryId("schedule", "none", "Agenda", "9:00 AM", "Welcome", new Map());
    expect(id.startsWith("schedule:none:")).toBe(true);
  });

  it("does not normalize before hashing: a changed password gets a new id", () => {
    const a = entryId(
      "venue",
      "venue-facilities",
      "Facilities",
      "Wi-Fi password",
      "ORDTG.",
      new Map(),
    );
    const b = entryId(
      "venue",
      "venue-facilities",
      "Facilities",
      "Wi-Fi password",
      "ordtg",
      new Map(),
    );
    expect(a).not.toBe(b);
  });

  it.each([
    ["case", "Grand Ballroom", "grand ballroom"],
    ["inner whitespace", "Grand Ballroom", "Grand  Ballroom"],
    ["trailing whitespace", "Grand Ballroom", "Grand Ballroom "],
    ["punctuation", "Grand Ballroom", "Grand Ballroom."],
  ])("treats a %s difference as a different line", (_kind, left, right) => {
    const a = entryId("gear", "gear-scope-video", "Video", left, "LED wall", new Map());
    const b = entryId("gear", "gear-scope-video", "Video", right, "LED wall", new Map());
    expect(a).not.toBe(b);
  });

  it("keeps field boundaries: moving text between fields changes the id", () => {
    const a = entryId("venue", "venue-facilities", "ab", "", "c", new Map());
    const b = entryId("venue", "venue-facilities", "a", "b", "c", new Map());
    const c = entryId("venue", "venue-facilities", "a", "", "bc", new Map());
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("suffixes repeats in one section and region with ~2, ~3 in call order", () => {
    const seen = new Map<string, number>();
    const args = ["gear", "gear-scope-audio", "Audio", "Breakout", "Podium mic"] as const;
    const first = entryId(...args, seen);
    const second = entryId(...args, seen);
    const third = entryId(...args, seen);
    expect(first).toBe(entryId(...args, new Map()));
    expect(second).toBe(`${first}~2`);
    expect(third).toBe(`${first}~3`);
  });

  it("counts repeats per section and region, not per hash", () => {
    const seen = new Map<string, number>();
    const inA = entryId("gear", "gear-scope-audio", "Audio", "Breakout", "Podium mic", seen);
    const inB = entryId("gear", "gear-scope-video", "Audio", "Breakout", "Podium mic", seen);
    const otherSection = entryId(
      "today",
      "gear-scope-audio",
      "Audio",
      "Breakout",
      "Podium mic",
      seen,
    );
    expect(inA.endsWith("~2")).toBe(false);
    expect(inB.endsWith("~2")).toBe(false);
    expect(otherSection.endsWith("~2")).toBe(false);
    expect(new Set([inA, inB, otherSection]).size).toBe(3);
  });

  it("does not suffix distinct lines that share a section and region", () => {
    const seen = new Map<string, number>();
    const a = entryId("venue", "venue-facilities", "Facilities", "Loading dock", "Bay 4", seen);
    const b = entryId("venue", "venue-facilities", "Facilities", "Power", "Two 20A circuits", seen);
    expect(a.includes("~")).toBe(false);
    expect(b.includes("~")).toBe(false);
  });
});
