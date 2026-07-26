// tests/parser/warnings.addressAmbiguity.test.ts
//
// S3 red step. `emitHotelAddressSplitAmbiguity` does not exist yet, so this file
// fails to import — the cleanest possible red.
//
// Every assertion here names the wrong implementation it kills; several exist
// because spec review found that a wrong emitter passed the obvious checks.
import { describe, it, expect } from "vitest";
import { newAggregator, emitHotelAddressSplitAmbiguity } from "@/lib/parser/warnings";
import { contentHashForRawSnippet } from "@/lib/parser/useRawContentHash";
import type { UseRawResolution } from "@/lib/parser/types";

const RESOLVABLE = (r: UseRawResolution | undefined) =>
  r as Extract<UseRawResolution, { resolvable: true }>;

describe("emitHotelAddressSplitAmbiguity", () => {
  it("no-ops without an aggregator", () => {
    expect(() =>
      emitHotelAddressSplitAmbiguity(undefined, {
        reason: "address-shape-unsplit",
        rawCell: "Hyatt Place Chicago 71 Chicago, IL 60601",
        index: 0,
        name: "Hyatt Place Chicago 71 Chicago, IL 60601",
        parsedName: "Hyatt Place Chicago 71 Chicago, IL 60601",
        parsedAddress: null,
      }),
    ).not.toThrow();
  });

  describe("P3(a) — nothing was split, so there is nothing to undo", () => {
    const agg = newAggregator();
    emitHotelAddressSplitAmbiguity(agg, {
      reason: "address-shape-unsplit",
      rawCell: "Hyatt Place Chicago 71 Chicago, IL 60601",
      index: 0,
      name: "Hyatt Place Chicago 71 Chicago, IL 60601",
      parsedName: "Hyatt Place Chicago 71 Chicago, IL 60601",
      parsedAddress: null,
    });
    const w = agg.warnings[0]!;

    // Full envelope. An emitter using severity:"info" or {kind:"rooms"} passes
    // every code/reason/message check while dropping out of warn-only
    // data-quality treatment and routing under the wrong section in the wizard.
    it("carries the full warning envelope", () => {
      expect(w.severity).toBe("warn");
      expect(w.code).toBe("HOTEL_ADDRESS_SPLIT_AMBIGUOUS");
      expect(w.blockRef).toEqual({
        kind: "hotels",
        name: "Hyatt Place Chicago 71 Chicago, IL 60601",
        field: "address",
        index: 0,
      });
      expect(w.rawSnippet).toBe("Hyatt Place Chicago 71 Chicago, IL 60601");
    });

    it("uses the authored message verbatim (C2)", () => {
      expect(w.message).toBe(
        'Hotel line "Hyatt Place Chicago 71 Chicago, IL 60601" may hold a street address we did not separate out; double-check the hotel name and address.',
      );
    });

    // Kills an enabled no-op fix: parsed and raw are byte-identical here, so an
    // offered "undo" could never change anything.
    it("is NOT resolvable", () => {
      expect(w.resolution).toEqual({ resolvable: false, reason: "no-split-to-undo" });
    });
  });

  describe("P3(b) — a split happened at one of several candidates", () => {
    const RAW = "Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601";
    const agg = newAggregator();
    emitHotelAddressSplitAmbiguity(agg, {
      reason: "multiple-street-candidates",
      rawCell: RAW,
      index: 2,
      name: "Hotel",
      parsedName: "Hotel",
      parsedAddress: "71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
    });
    const w = agg.warnings[0]!;

    it("carries the full envelope with the caller's index", () => {
      expect(w.severity).toBe("warn");
      expect(w.blockRef).toEqual({ kind: "hotels", name: "Hotel", field: "address", index: 2 });
      expect(w.rawSnippet).toBe(RAW);
    });

    it("uses the authored message verbatim (C3)", () => {
      expect(w.message).toBe(
        `Hotel line "${RAW}" could be split into a name and a street address in more than one place; double-check the hotel name and address.`,
      );
    });

    // Kills {hotelName:null, hotelAddress:null}: the overlay reads only
    // `replacement`, so a fabricated `parsed` passes the undo test while showing
    // the operator a "current reading" that is not what was parsed.
    it("reports the reservation's ACTUAL current reading as `parsed`", () => {
      expect(RESOLVABLE(w.resolution).parsed).toEqual({
        kind: "hotel-name",
        hotelName: "Hotel",
        hotelAddress: "71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
      });
    });

    it("offers the whole line back as the hotel name", () => {
      expect(RESOLVABLE(w.resolution).replacement).toEqual({
        kind: "hotel-name",
        hotelName: RAW,
        hotelAddress: null,
      });
    });

    // Kills a fixed valid 64-hex constant, which would make unrelated address
    // warnings share a decision and stop edits from invalidating them.
    it("derives contentHash from the raw snippet", () => {
      expect(RESOLVABLE(w.resolution).contentHash).toBe(contentHashForRawSnippet(RAW));
    });
  });

  // The P0. `hotel_name` is show-wide crew-readable and the parser already
  // scrubs confirmation tokens from it; the stash deliberately holds the
  // PRE-strip cell, so an unstripped replacement re-persists what was scrubbed.
  // Every other P3(b) case above is confirmation-free, so an unstripped
  // implementation passes all of them and still leaks here.
  it("never offers a confirmation number back into the hotel name (P0)", () => {
    const RAW = "Hotel #9999 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601";
    const agg = newAggregator();
    emitHotelAddressSplitAmbiguity(agg, {
      reason: "multiple-street-candidates",
      rawCell: RAW,
      index: 0,
      name: "Hotel",
      parsedName: "Hotel",
      parsedAddress: "71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
    });
    const rep = RESOLVABLE(agg.warnings[0]!.resolution).replacement;
    expect(rep.kind).toBe("hotel-name");
    expect((rep as { hotelName: string }).hotelName).not.toMatch(/9999/);
    expect((rep as { hotelName: string }).hotelName).not.toMatch(/#/);
    // The hash is derived from the PRE-strip cell (the invalidation key must
    // change whenever the SHEET text changes, including a confirmation-only
    // edit) — while the replacement is the stripped text. Hashing the stripped
    // form instead would let a conf-only sheet edit keep a stale decision
    // alive (whole-diff R5 f5).
    const res = RESOLVABLE(agg.warnings[0]!.resolution);
    expect(res.contentHash).toBe(contentHashForRawSnippet(RAW));
    expect(res.contentHash).not.toBe(
      contentHashForRawSnippet((res.replacement as { hotelName: string }).hotelName),
    );
  });

  // Whole-diff R5 f2: the splitter quote-cleans before splitting, so `parsed`
  // is quote-free — but a replacement built from the raw cell would persist
  // straight/smart quotes into crew-readable hotel_name, undoing the render
  // sanitation the parser's own reading applies.
  it("cleans quotes and zero-width characters out of the replacement", () => {
    const agg = newAggregator();
    emitHotelAddressSplitAmbiguity(agg, {
      reason: "multiple-street-candidates",
      rawCell: "“Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601”",
      index: 0,
      name: "Hotel",
      parsedName: "Hotel",
      parsedAddress: "71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601",
    });
    const rep = RESOLVABLE(agg.warnings[0]!.resolution).replacement as { hotelName: string };
    expect(rep.hotelName).toBe("Hotel 71 Wacker Drive 71 E Wacker Dr Chicago, IL 60601");
    expect(rep.hotelName).not.toMatch(/["“”​-‍﻿]/);
  });

  // Two snippets that differ only in whitespace collapse to the same canonical
  // form and MUST share a hash; asserting that any two different raw strings
  // differ would reject the canonical implementation.
  it("hashes by collapsed form, so whitespace-only differences agree", () => {
    const a = newAggregator();
    const b = newAggregator();
    const base = {
      reason: "address-shape-unsplit" as const,
      index: 0,
      name: "Hotel A",
      parsedName: "Hotel A",
      parsedAddress: null,
    };
    emitHotelAddressSplitAmbiguity(a, { ...base, rawCell: "Hotel  A" });
    emitHotelAddressSplitAmbiguity(b, { ...base, rawCell: "Hotel A" });
    expect(a.warnings[0]!.resolution).toEqual(b.warnings[0]!.resolution);
  });

  it("omits blockRef.name entirely when the hotel is unresolved", () => {
    const agg = newAggregator();
    emitHotelAddressSplitAmbiguity(agg, {
      reason: "address-shape-unsplit",
      rawCell: "1515 Broadway New York, NY 10036",
      index: 0,
      name: null,
      parsedName: null,
      parsedAddress: null,
    });
    // exactOptionalPropertyTypes: the KEY is absent, never set to undefined.
    expect(agg.warnings[0]!.blockRef).toEqual({ kind: "hotels", field: "address", index: 0 });
    expect("name" in agg.warnings[0]!.blockRef!).toBe(false);
  });
});
