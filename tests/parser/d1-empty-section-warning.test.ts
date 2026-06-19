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
import { parseSheet } from "@/lib/parser";
import { describe, it, expect } from "vitest";

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
});
