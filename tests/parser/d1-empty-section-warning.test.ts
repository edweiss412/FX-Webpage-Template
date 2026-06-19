/**
 * D1 — fail-loud SECTION_HEADER_NO_FIELDS warning.
 *
 * When a block parser RECOGNIZES a section header but extracts zero mapped
 * fields, it must emit a `severity:"warn"` ParseWarning so the silent
 * section-drop surfaces to the operator (StagedReviewCard warning summary +
 * /admin/dev), instead of vanishing with `warnings: []`. Admin-log-only — it
 * does NOT block apply (warning channel, not the hardError channel).
 *
 * Carries its copy inline (no §12.4 catalog code): parser warnings are rendered
 * from `.message`, never through lib/messages/lookup.ts.
 */
import { newAggregator, emitEmptySection, SECTION_HEADER_NO_FIELDS } from "@/lib/parser/warnings";
import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import { parseEventDetails } from "@/lib/parser/blocks/event";
import { parseTransportation } from "@/lib/parser/blocks/transport";
import { parseHotels } from "@/lib/parser/blocks/hotels";
import { parseRooms } from "@/lib/parser/blocks/rooms";
import { parseDates } from "@/lib/parser/blocks/dates";
import { parseContacts } from "@/lib/parser/blocks/contacts";
import { parseSheet } from "@/lib/parser";
import { describe, it, expect } from "vitest";

const emptyOf = (agg: { warnings: { code: string; blockRef?: { kind: string } }[] }, kind: string) =>
  agg.warnings.filter((w) => w.code === SECTION_HEADER_NO_FIELDS && w.blockRef?.kind === kind);

describe("D1 — emitEmptySection helper", () => {
  it("pushes exactly one warn-severity SECTION_HEADER_NO_FIELDS warning with the section's blockRef", () => {
    const agg = newAggregator();
    emitEmptySection(agg, "event_details");
    expect(agg.warnings).toHaveLength(1);
    const w = agg.warnings[0]!;
    // severity MUST be "warn" — warningSummary() filters to "warn" (phase1.ts), so
    // an "info" emit would be dropped from the operator-facing StagedReviewCard.
    expect(w.severity).toBe("warn");
    expect(w.code).toBe(SECTION_HEADER_NO_FIELDS);
    expect(w.code).toBe("SECTION_HEADER_NO_FIELDS");
    expect(w.message.length).toBeGreaterThan(0);
    expect(w.message).toContain("event_details");
    expect(w.blockRef?.kind).toBe("event_details");
  });

  it("is a no-op (no throw) when the aggregator is undefined (agg is optional in block signatures)", () => {
    expect(() => emitEmptySection(undefined, "rooms")).not.toThrow();
  });

  it("the code is recorded in the internal-code manifest (invariant 5 / x2 coverage)", () => {
    // The emit uses a string literal so extract-internal-code-enums.ts records it.
    // If a future refactor swaps it back to the constant, this + no-raw-codes fail.
    expect(SECTION_HEADER_NO_FIELDS).toBe("SECTION_HEADER_NO_FIELDS");
    expect(INTERNAL_CODE_ENUMS).toHaveProperty(SECTION_HEADER_NO_FIELDS);
    expect((INTERNAL_CODE_ENUMS as Record<string, { source: string }>)[SECTION_HEADER_NO_FIELDS]?.source).toBe(
      "parse_warnings.code",
    );
  });
});

describe("D1 — event_details hook", () => {
  const HDR = "| EVENT DETAILS | EVENT DETAILS |\n| :---: | :---: |";

  it("warns when the EVENT DETAILS header is present but only label-only rows (zero fields)", () => {
    const agg = newAggregator();
    parseEventDetails(`${HDR}\n| Floor Plan |\n| Stage Size |`, "v4", agg);
    expect(emptyOf(agg, "event_details")).toHaveLength(1);
  });

  it("does NOT warn when event_details has real field values (anti-tautology)", () => {
    const agg = newAggregator();
    parseEventDetails(`${HDR}\n| Stage Size | 40' x 30' |`, "v4", agg);
    expect(emptyOf(agg, "event_details")).toHaveLength(0);
  });

  it("does NOT warn when there is no EVENT DETAILS header at all (absent != empty)", () => {
    const agg = newAggregator();
    parseEventDetails("| SOMETHING ELSE | x |", "v4", agg);
    expect(agg.warnings).toHaveLength(0);
  });
});

describe("D1 — transportation hook", () => {
  it("warns when a recognized transport header parses an all-empty row", () => {
    const agg = newAggregator();
    parseTransportation("| TRANSPORTATION | NAME | PHONE |\n| :---: | :---: | :---: |", "v2", [], agg);
    expect(emptyOf(agg, "transportation")).toHaveLength(1);
  });
  it("does NOT warn when transportation has a real driver (anti-tautology)", () => {
    const agg = newAggregator();
    parseTransportation(
      "| TRANSPORTATION | NAME | PHONE |\n| :---: | :---: | :---: |\n| Driver | Jane Doe | 555-1212 |",
      "v2",
      [],
      agg,
    );
    expect(emptyOf(agg, "transportation")).toHaveLength(0);
  });
  it("does NOT warn when no transport header matched (null != empty)", () => {
    const agg = newAggregator();
    parseTransportation("| SOMETHING | x |", "v2", [], agg);
    expect(agg.warnings).toHaveLength(0);
  });
});

describe("D1 — hotels hook", () => {
  it("warns when a HOTEL/Reservations/Stays header parses zero reservations", () => {
    for (const md of ["| Hotel Reservations |  |", "| Hotel Stays |  |"]) {
      const agg = newAggregator();
      parseHotels(md, "v2", agg);
      expect(emptyOf(agg, "hotels"), md).toHaveLength(1);
    }
  });
  it("does NOT warn when hotels parse, nor when no hotel header is present", () => {
    const ok = newAggregator();
    parseHotels("| Hotel Reservations | The Drake Check In: 5/11 Check Out: 5/15 Eric Carroll |", "v2", ok);
    expect(emptyOf(ok, "hotels")).toHaveLength(0);
    const none = newAggregator();
    parseHotels("| SOMETHING | x |", "v2", none);
    expect(none.warnings).toHaveLength(0);
  });
});

describe("D1 — rooms hook", () => {
  it("warns when a recognized room header is content-gated to zero rooms", () => {
    const agg = newAggregator();
    parseRooms(
      "| BREAKOUT 1 BREAKOUT ROOM Dimensions Floor | BREAKOUT 1 BREAKOUT ROOM Dimensions Floor |\n| :---: | :---: |\n| Setup |  |",
      "v4",
      agg,
    );
    expect(emptyOf(agg, "rooms")).toHaveLength(1);
  });
  it("does NOT warn when rooms parse, nor when no room header is present", () => {
    const ok = newAggregator();
    parseRooms(
      "| GENERAL SESSION MAIN HALL 40' x 30' | GENERAL SESSION MAIN HALL 40' x 30' |\n| :---: | :---: |\n| Setup | Theater |",
      "v4",
      ok,
    );
    expect(emptyOf(ok, "rooms")).toHaveLength(0);
    const none = newAggregator();
    parseRooms("| SOMETHING | x |", "v4", none);
    expect(none.warnings).toHaveLength(0);
  });
});

describe("D1 — dates hook", () => {
  it("warns when a DATES header is present but no date resolves (the east-coast qualifier case)", () => {
    // "5/13 - AFTER 8PM" is M/D (no year) + trailing free text → normalizeDate null.
    const agg = newAggregator();
    parseDates("| DATES |  |\n| TRAVEL | 5/13 - AFTER 8PM |\n| SET | TBD |", "v2", agg);
    expect(emptyOf(agg, "dates")).toHaveLength(1);
  });
  it("does NOT warn when a date resolves, nor when no DATES header is present", () => {
    const ok = newAggregator();
    parseDates("| DATES |  |\n| TRAVEL | 5/11/25 |", "v2", ok);
    expect(emptyOf(ok, "dates")).toHaveLength(0);
    const none = newAggregator();
    parseDates("| SOMETHING | 5/11/25 |", "v2", none);
    expect(none.warnings).toHaveLength(0);
  });
});

describe("D1 — contacts hook", () => {
  it("warns when a VENUE/IN HOUSE AV label matches but no real contact (e.g. FALSE)", () => {
    const agg = newAggregator();
    parseContacts("| In House AV | FALSE |", "v2", agg);
    expect(emptyOf(agg, "contacts")).toHaveLength(1);
  });
  it("does NOT warn when a real contact parses, nor when no contact label is present", () => {
    const ok = newAggregator();
    parseContacts("| In House AV | Jane Doe jane@venue.com |", "v2", ok);
    expect(emptyOf(ok, "contacts")).toHaveLength(0);
    const none = newAggregator();
    parseContacts("| SOMETHING | x |", "v2", none);
    expect(none.warnings).toHaveLength(0);
  });
});

describe("D1 — parseSheet integration", () => {
  it("surfaces SECTION_HEADER_NO_FIELDS warnings in ParsedSheet.warnings for empty sections", () => {
    const md = [
      "| Hotel Reservations |  |",
      "| In House AV | FALSE |",
      "| DATES |  |",
      "| Travel In | TBD |",
    ].join("\n");
    const r = parseSheet(md, "x.md");
    const kinds = r.warnings
      .filter((w) => w.code === SECTION_HEADER_NO_FIELDS)
      .map((w) => w.blockRef?.kind);
    expect(kinds).toEqual(expect.arrayContaining(["hotels", "contacts", "dates"]));
  });
});
