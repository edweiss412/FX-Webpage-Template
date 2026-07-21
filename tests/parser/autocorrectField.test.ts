import { describe, it, expect } from "vitest";
import { parseCrew } from "@/lib/parser/blocks/crew";
import { parseVenue } from "@/lib/parser/blocks/venue";
import { normalizeSectionHeaders } from "@/lib/parser/sectionHeaderNormalize";
import { newAggregator } from "@/lib/parser/warnings";
import type { ParseWarning } from "@/lib/parser/types";

// Task 1 (plan 2026-07-21-warning-card-identity-placement): the structured
// `autocorrect` field on the STAGE_WORD_AUTOCORRECTED warning. The card layer
// (autocorrectGuidance, Task 3) reads this instead of parsing `message`, so the
// field must carry the real correction pairs and the crew member's name, and
// `message` must stay byte-identical for logs/telemetry.

const find = (ws: ParseWarning[], code: string) => ws.find((w) => w.code === code);

describe("autocorrect field — STAGE_WORD_AUTOCORRECTED", () => {
  const md = [
    "| TECH | PHONE | ARRIVAL | DEPARTURE |",
    "| --- | --- | --- | --- |",
    "| Eric Weiss - Load In/Set/Strke/Load Out - A1 | 555 |  |  |",
  ].join("\n");

  it("carries subject + corrections", () => {
    const agg = newAggregator();
    parseCrew(md, "v4", agg);
    const note = find(agg.warnings, "STAGE_WORD_AUTOCORRECTED");
    expect(note).toBeTruthy();
    expect(note!.autocorrect).toEqual({
      subject: "Eric Weiss",
      corrections: [{ detected: "Strke", corrected: "Strike" }],
    });
  });

  it("leaves `message` byte-identical to the pre-change string", () => {
    // Oracle: the exact message the emitter has always produced (crew.ts:346).
    // Not derived from the field — pins that adding the field did not mutate copy.
    const agg = newAggregator();
    parseCrew(md, "v4", agg);
    const note = find(agg.warnings, "STAGE_WORD_AUTOCORRECTED");
    expect(note!.message).toBe(
      "Read likely-misspelled stage word(s) 'Strke' as 'Strike' in role cell: 'Load In/Set/Strke/Load Out - A1'",
    );
  });
});

describe("autocorrect field — ROLE_TOKEN_AUTOCORRECTED (subject stamped at parseCrew)", () => {
  const md = [
    "| TECH | PHONE | ARRIVAL | DEPARTURE |",
    "| --- | --- | --- | --- |",
    "| Jane Roe - Content Cretion | 555 |  |  |",
  ].join("\n");

  it("stamps subject = crew name and carries the correction pair", () => {
    const agg = newAggregator();
    parseCrew(md, "v1", agg);
    const note = find(agg.warnings, "ROLE_TOKEN_AUTOCORRECTED");
    expect(note).toBeTruthy();
    // detected mirrors the message's `${tok}` (uppercased at the emit site), so the
    // field and the log string never diverge.
    expect(note!.autocorrect).toEqual({
      subject: "Jane Roe",
      corrections: [{ detected: "CONTENT CRETION", corrected: "CONTENT CREATION" }],
    });
  });

  it("no ROLE_TOKEN warning exits parseCrew with a null subject (no-escape boundary)", () => {
    const agg = newAggregator();
    parseCrew(md, "v1", agg);
    const roleNotes = agg.warnings.filter((w) => w.code === "ROLE_TOKEN_AUTOCORRECTED");
    expect(roleNotes.length).toBeGreaterThan(0);
    for (const n of roleNotes) expect(n.autocorrect?.subject).not.toBeNull();
  });
});

describe("autocorrect field — COLUMN_HEADER_AUTOCORRECTED (crew, subject null)", () => {
  it("carries the header correction, subject null", () => {
    const md = [
      "| CREW | NAME | ROLE | PHONE | E-MAIL |",
      "| --- | --- | --- | --- | --- |",
      "|  | Jane Doe | A1 | 555-1111 | jane@x.com |",
    ].join("\n");
    const agg = newAggregator();
    parseCrew(md, "v4", agg);
    const note = find(agg.warnings, "COLUMN_HEADER_AUTOCORRECTED");
    expect(note!.autocorrect).toEqual({
      subject: null,
      corrections: [{ detected: "E-MAIL", corrected: "EMAIL" }],
    });
  });
});

describe("autocorrect field — SECTION_HEADER_AUTOCORRECTED (subject null)", () => {
  it("carries the header correction, subject null", () => {
    const md = ["| Transportaton |", "| --- |", "| Sedan | Airport |"].join("\n");
    const { warnings } = normalizeSectionHeaders(md);
    const note = find(warnings, "SECTION_HEADER_AUTOCORRECTED");
    expect(note).toBeTruthy();
    expect(note!.autocorrect?.subject).toBeNull();
    expect(note!.autocorrect?.corrections[0]).toEqual({
      detected: "Transportaton",
      corrected: "TRANSPORTATION",
    });
  });
});

describe("autocorrect field — FIELD_LABEL_AUTOCORRECTED (venue, subject null)", () => {
  it("carries the label correction, subject null", () => {
    const md = [
      "| VENUE NAME | Four Seasons Hotel |",
      "| Venue Adress | 120 E Delaware Pl Chicago, IL 60611 |",
    ].join("\n");
    const agg = newAggregator();
    parseVenue(md, "v4", agg);
    const note = find(agg.warnings, "FIELD_LABEL_AUTOCORRECTED");
    expect(note).toBeTruthy();
    expect(note!.autocorrect?.subject).toBeNull();
    expect(note!.autocorrect?.corrections[0]?.detected).toBe("Venue Adress");
  });
});
