import { describe, it, expect } from "vitest";
import { parseCrew } from "@/lib/parser/blocks/crew";
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
