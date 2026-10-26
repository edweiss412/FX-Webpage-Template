// VENUE_ADDRESS_MISSING: a named venue the crew page will show with no street address.
// Spec docs/superpowers/specs/parser/2026-10-25-nearmiss-read-blocks-and-venue-address-design.md §4.
//
// The notice reads the PARSED show, not the sheet's rows, so every expectation here is
// computed from `show.venue` and never typed: a label the venue parser does not read (an
// address under `Street Address`) fires exactly like an empty cell, because both leave the
// crew page without an address.
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { parseSheet } from "@/lib/parser";
import type { ParseWarning } from "@/lib/parser/types";
import { venueAddressMissingName } from "@/lib/parser/warnings";
import { hasIgnorableSnippet } from "@/lib/dataQuality/ignorableSnippet";
import { KIND_TO_SECTION } from "@/lib/admin/step3SectionStatus";
import { premiseHolds } from "@/tests/_shared/premise";
import { FIXTURES, readFixture } from "@/tests/parser/mutation/fixtures";

const FINTECH_RAW = "fixtures/shows/raw/2026-05-fintech-forum-cto-summit.md";

const venueNotices = (warnings: readonly ParseWarning[]): ParseWarning[] =>
  warnings.filter((w) => w.code === "VENUE_ADDRESS_MISSING");

const corpus = FIXTURES.map((f) => {
  const parsed = parseSheet(readFixture(f), f.path);
  const venue = parsed.show.venue;
  const expected = venue !== null && venue.name.trim() !== "" && venue.address.trim() === "";
  return { path: f.path, venue, expected, notices: venueNotices(parsed.warnings) };
});

describe("VENUE_ADDRESS_MISSING over the corpus (AC-10)", () => {
  it("fires exactly once where the parsed venue has a name and no address, and never elsewhere", () => {
    // Both directions must be reachable on this corpus, or the loop below passes on a
    // detector that always fires or never does.
    premiseHolds(
      "some fixture's parsed venue has a name and no address",
      corpus.some((c) => c.expected),
    );
    premiseHolds(
      "some fixture's parsed venue has an address",
      corpus.some((c) => !c.expected),
    );
    // Distinct venues among the firing fixtures, so a notice keyed on one venue name is
    // shown not to stand in for another (the Ignore fingerprint follows rawSnippet).
    const firingNames = new Set(corpus.filter((c) => c.expected).map((c) => c.venue!.name));
    premiseHolds("the firing fixtures carry at least two distinct venues", firingNames.size >= 2);

    for (const c of corpus) {
      expect(c.notices.length, c.path).toBe(c.expected ? 1 : 0);
      for (const w of c.notices) expect(w.rawSnippet, c.path).toBe(c.venue!.name);
    }
  });
});

describe("VENUE_ADDRESS_MISSING on one warning (AC-11, AC-15)", () => {
  it("fires on an address the venue parser cannot read, and not on the same sheet with it readable", () => {
    const source = readFileSync(FINTECH_RAW, "utf8");
    const relabelled = source.replace("| VENUE ADDRESS |", "| Street Address |");
    premiseHolds("the relabel changed the sheet", relabelled !== source);

    const before = parseSheet(source, FINTECH_RAW);
    const after = parseSheet(relabelled, FINTECH_RAW);
    premiseHolds(
      "the source sheet's venue has an address",
      (before.show.venue?.address ?? "") !== "",
    );
    premiseHolds("the relabelled sheet's venue has none", after.show.venue?.address === "");

    expect(venueNotices(before.warnings)).toEqual([]);
    const [w, ...rest] = venueNotices(after.warnings);
    expect(rest).toEqual([]);
    expect(w).toBeDefined();
    expect(w!.severity).toBe("warn");
    expect(w!.blockRef).toEqual({ kind: "venue" });
    expect(w!.rawSnippet).toBe(after.show.venue!.name);
    expect(hasIgnorableSnippet(w!)).toBe(true);
    // Routes to the Venue section of the review (AC-15).
    expect(KIND_TO_SECTION[w!.blockRef!.kind]).toBe("venue");
  });
});

describe("venueAddressMissingName, the emission condition", () => {
  it("names the venue when it has a name and no address, and refuses everything else", () => {
    // Firing cases first, so every refusal below sits beside a case that fires.
    expect(venueAddressMissingName({ name: "Kimpton Gray", address: "" })).toBe("Kimpton Gray");
    expect(venueAddressMissingName({ name: "Kimpton Gray", address: "  " })).toBe("Kimpton Gray");
    // Verbatim, not trimmed: the name is the Ignore fingerprint's input.
    expect(venueAddressMissingName({ name: " Kimpton Gray ", address: "" })).toBe(" Kimpton Gray ");

    expect(venueAddressMissingName(null)).toBeNull();
    expect(venueAddressMissingName({ name: "   ", address: "" })).toBeNull();
    expect(venueAddressMissingName({ name: "", address: "" })).toBeNull();
    expect(
      venueAddressMissingName({
        name: "Kimpton Gray",
        address: "122 W Monroe St Chicago, IL 60603",
      }),
    ).toBeNull();
  });
});

describe("the notice never changes the parsed show (AC-12)", () => {
  it("every firing fixture parses to the same show with the emitter replaced by a no-op", async () => {
    const firing = FIXTURES.filter((f) => corpus.find((c) => c.path === f.path)?.expected);
    premiseHolds("some corpus fixture fires the notice", firing.length > 0);
    const real = firing.map((f) => parseSheet(readFixture(f), f.path));
    // Premise on the real side: the notice was emitted, so the comparison below is between
    // a parse WITH it and a parse without it rather than two parses of the same thing.
    for (const r of real)
      premiseHolds("the real parse emitted the notice", venueNotices(r.warnings).length === 1);

    vi.resetModules();
    vi.doMock("@/lib/parser/warnings", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/parser/warnings")>()),
      emitVenueAddressMissing: () => {},
    }));
    try {
      const { parseSheet: parseSilenced } = await import("@/lib/parser");
      firing.forEach((f, i) => {
        const silenced = parseSilenced(readFixture(f), f.path);
        premiseHolds(
          "the silenced parse emitted no notice",
          venueNotices(silenced.warnings).length === 0,
        );
        expect(silenced.show, f.path).toEqual(real[i]!.show);
      });
    } finally {
      vi.doUnmock("@/lib/parser/warnings");
      vi.resetModules();
    }
  });
});
