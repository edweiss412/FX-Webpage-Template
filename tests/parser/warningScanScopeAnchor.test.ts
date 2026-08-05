// BL-WARNING-SCAN-SCOPE-HAS-NO-ANCHOR — a narrowed scan scope drops codes with
// nothing left to signal.
//
// The recognizer is fail-closed for sites it VISITS. Its SCOPE was unanchored:
// `inWarningScanRoots` is a hand-written predicate, and a file it never admits
// produces no site, so there is nothing to signal. Narrow the predicate and the
// universe shrinks while every existing assertion stays green — the scan's own
// output cannot detect a change to the scan's own reach.
//
// The anchor is `tests/parser/_warningCodeAnchor.ts`: a committed code set,
// compared by EQUALITY. See that file for why a code anchor and not a file-list
// anchor (a within-file pre-filter dropped 22 of 57 codes with the contributing
// FILE set unchanged), and for why it is interim.
//
// ANTI-TAUTOLOGY. The anchor is worthless if it is regenerated from the thing it
// checks — that is the self-justification the ledger guard warns about. It is a
// hand-committed literal, and the comparison is equality rather than subset, so
// BOTH a silent narrowing and an unreviewed widening fail. The vacuity check
// runs first: an anchor compared against an empty scan would otherwise report
// only "missing", which reads like a narrowing rather than like a broken test.
import { describe, expect, it } from "vitest";

import { INTERNAL_CODE_ENUMS } from "@/lib/messages/__generated__/internal-code-enums";
import { WARNING_CODE_ANCHOR } from "./_warningCodeAnchor";

/**
 * The parse-warning partition of the generated manifest.
 *
 * Read from the manifest rather than by re-running the ts-morph scan: the scan
 * costs ~100s, and the manifest IS its committed output — which is exactly the
 * artifact whose silent shrinkage this guards. Re-scanning here would also make
 * the test agree with the scan by construction.
 */
function scannedWarningCodes(): string[] {
  return Object.entries(INTERNAL_CODE_ENUMS)
    .filter(([, payload]) => payload.source.split(",").includes("parse_warnings.code"))
    .map(([code]) => code)
    .sort();
}

describe("the parse-warning code universe is anchored", () => {
  const scanned = scannedWarningCodes();

  it("is not vacuous (a broken partition fails HERE, not as a phantom narrowing)", () => {
    expect(scanned.length).toBeGreaterThan(0);
    expect(WARNING_CODE_ANCHOR.length).toBeGreaterThan(0);
  });

  it("equals the committed anchor, in both directions", () => {
    // Equality, not containment. A subset check would pass a narrowing that
    // dropped codes, which is the entire failure mode this entry describes.
    expect(scanned).toEqual([...WARNING_CODE_ANCHOR]);
  });

  it("names what a narrowing dropped, so the diff is the review artifact", () => {
    const dropped = WARNING_CODE_ANCHOR.filter((c) => !scanned.includes(c));
    expect(
      dropped,
      "codes in the anchor that the scan no longer produces. Either the scan's roots were " +
        "narrowed (fix the predicate — the codes did not go away, the scan stopped looking) or " +
        "these warnings were genuinely retired (update the anchor in the same commit, so the " +
        "removal is reviewed rather than inferred).",
    ).toEqual([]);
  });

  it("names what appeared, so a widening is reviewed too", () => {
    const added = scanned.filter((c) => !WARNING_CODE_ANCHOR.includes(c));
    expect(
      added,
      "codes the scan now produces that the anchor does not carry. If these are real new parse " +
        "warnings, add them to the anchor in the same commit as the code that emits them.",
    ).toEqual([]);
  });

  it("the anchor holds no duplicates, so its length means what it says", () => {
    expect(new Set(WARNING_CODE_ANCHOR).size).toBe(WARNING_CODE_ANCHOR.length);
  });
});
