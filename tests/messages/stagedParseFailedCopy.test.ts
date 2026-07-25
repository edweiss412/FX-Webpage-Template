/**
 * tests/messages/stagedParseFailedCopy.test.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §4.6, §5 test 17)
 *
 * STAGED_PARSE_FAILED used to be produced by exactly one surface — the live
 * first-seen retry route — and its copy said so. It now also carries the wizard
 * re-scan and the finalize inline auto-heal, so path-specific wording would tell
 * two of its three producers' users something false.
 *
 * x1 (tests/cross-cutting/codes.test.ts) pins catalog ↔ §12.4 parity for
 * dougFacing / crewFacing / followUp / helpfulContext. It does NOT cover `title`
 * or `longExplanation`, which is how a partial edit could leave the retry-path
 * wording alive on the help page with every named gate green (whole-diff R2
 * finding 8). This test covers all four fields.
 */
import { describe, expect, test } from "vitest";

import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { getDougFacing, isMessageCode, lookupHelpfulContext } from "@/lib/messages/lookup";

const ROW = MESSAGE_CATALOG.STAGED_PARSE_FAILED;

/** Wording that names one producer and is therefore false for the other two. */
const PATH_SPECIFIC = [/retry path/i, /first-seen/i, /during retry/i];

describe("STAGED_PARSE_FAILED copy is path-agnostic (spec §4.6)", () => {
  test("no operator-visible field names a single producer path", () => {
    // followUp is operator-visible too and is NOT covered by x1's wording checks
    // (whole-diff R2 finding 7): "…fix its structure during retry" would otherwise
    // satisfy every other assertion here.
    const fields: Array<[string, string | null | undefined]> = [
      ["dougFacing", ROW.dougFacing],
      ["helpfulContext", ROW.helpfulContext],
      ["title", ROW.title],
      ["longExplanation", ROW.longExplanation],
      ["followUp", ROW.followUp],
    ];
    for (const [name, value] of fields) {
      for (const pattern of PATH_SPECIFIC) {
        expect(value ?? "", `${name} still names one producer path (${pattern})`).not.toMatch(
          pattern,
        );
      }
    }
  });

  test("the fields the help page renders are all present", () => {
    // components/admin/HelpAffordance.tsx:101 renders helpfulContext verbatim, and
    // the /help/errors page renders title + longExplanation.
    expect(ROW.dougFacing).toBeTruthy();
    expect(ROW.helpfulContext).toBeTruthy();
    expect(ROW.title).toBeTruthy();
    expect(ROW.longExplanation).toBeTruthy();
  });

  test("the code still resolves through the lookup layer (invariant 5)", () => {
    // The three producers return this code to the UI, which must never render it raw.
    expect(isMessageCode("STAGED_PARSE_FAILED")).toBe(true);
    expect(getDougFacing("STAGED_PARSE_FAILED")).toBeTruthy();
    expect(lookupHelpfulContext("STAGED_PARSE_FAILED")).toBeTruthy();
  });

  test("the copy points at the sheet, not at Drive sharing", () => {
    // Separating this code from DRIVE_FETCH_FAILED is pointless if the copy still
    // sends Doug to his share settings.
    expect(ROW.dougFacing).toMatch(/sheet/i);
    expect(ROW.followUp).toMatch(/open the sheet/i);
    expect(ROW.helpfulContext ?? "").not.toMatch(/share settings/i);
  });

  test("the copy does not assert a cause that is false for some producers", () => {
    // lib/onboarding/applyRescanDecisionUnderLock.ts:240,245,262 emit this code for
    // a hard-fail with no recorded code, a non-staged outcome, and a staged row that
    // vanished — none of which is a sheet-structure problem (whole-diff finding 5).
    // So the copy must not claim structure is THE cause, and must offer the
    // developer as the fallback when a fresh scan does not clear it.
    for (const field of [ROW.dougFacing, ROW.helpfulContext, ROW.longExplanation, ROW.followUp]) {
      expect(field ?? "").not.toMatch(/fix its structure/i);
    }
    expect(ROW.helpfulContext).toMatch(/contact the developer/i);
    expect(ROW.longExplanation).toMatch(/contact the developer/i);
  });

  test("no em-dash in operator-visible copy (project copy hygiene)", () => {
    for (const value of [
      ROW.dougFacing,
      ROW.helpfulContext,
      ROW.title,
      ROW.longExplanation,
      ROW.followUp,
    ]) {
      expect(value ?? "").not.toContain("—");
    }
  });
});
