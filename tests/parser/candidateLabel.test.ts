// Guard for `ParseWarning.candidate` at the render boundary.
// Spec docs/superpowers/specs/2026-08-26-nearmiss-candidate-render.md §5: ONE rule, two render
// sites. The accept-set is keyed on TYPE, not on spelling, and everything outside it renders
// nothing.
//
// The input type is `unknown` because the jsonb boundary is unvalidated: a warning read back
// from `shows_internal.parse_warnings` is whatever was written, and TypeScript's `string` there
// is a claim rather than a check. The non-string cases are the ones a `string | null` signature
// cannot even express, and they are what makes this suite discriminating: a guard written as
// `w.candidate ?? null` passes every string case and hands `42` straight to the DOM.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { candidateLabel } from "@/lib/parser/candidateLabel";

describe("candidateLabel", () => {
  it("returns the trimmed label for a usable string", () => {
    // The positive control. Without it every remaining case would pass on `() => null`.
    expect(candidateLabel({ candidate: "VENUE ADDRESS" })).toBe("VENUE ADDRESS");
    expect(candidateLabel({ candidate: "  VENUE ADDRESS  " })).toBe("VENUE ADDRESS");
  });

  it("preserves the SPELLING of every candidate the corpus actually produces", () => {
    // Round-2 finding 1: the two cases above are both already uppercase, so an implementation
    // that trimmed AND uppercased passed the whole suite while corrupting "Client Phone" and
    // "Backdrop / Scenic". Derived from the committed baseline rather than hand-listed, so a
    // vocabulary change extends this cover instead of stranding it.
    const baseline = JSON.parse(
      readFileSync(
        join(process.cwd(), "tests/parser/__fixtures__/fieldNearMiss.baseline.json"),
        "utf8",
      ),
    ) as { rows: { candidate: string }[] };
    const distinct = [...new Set(baseline.rows.map((r) => r.candidate))].filter(
      (c) => c.length > 0,
    );

    // Premise on the fixture: if the baseline stopped carrying candidates this case would pass
    // vacuously, and the whole point is that it cannot.
    expect(distinct.length).toBeGreaterThan(5);
    // "DIagrams" has an internal capital and "Backdrop / Scenic" mixes case, spaces and a slash;
    // between them no normalization survives.
    expect(distinct).toContain("DIagrams");

    for (const c of distinct) expect(candidateLabel({ candidate: c })).toBe(c);
  });

  it("returns null when the key is ABSENT, which is the legacy-persistence case", () => {
    // Not a constructed hypothetical: every UNKNOWN_FIELD written before the detector landed
    // has no `candidate` key at all, and the dev attention gallery's synthetic warning still
    // builds one that way (lib/dev/attentionScenarios/tier2.ts:604-612).
    expect(candidateLabel({})).toBeNull();
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["a number", 42],
    ["an object", {}],
    ["an array", []],
  ])("returns null for %s", (_label, value) => {
    expect(candidateLabel({ candidate: value })).toBeNull();
  });
});
