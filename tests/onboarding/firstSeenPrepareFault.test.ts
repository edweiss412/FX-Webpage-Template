/**
 * tests/onboarding/firstSeenPrepareFault.test.ts
 * (spec docs/superpowers/specs/2026-07-24-test-safety-hardening-batch.md §4.3, §5 test 16)
 *
 * Class sweep: the live first-seen retry route carried the SAME conflation as the
 * wizard re-scan. Its export helper synthesizes the workbook internally, so a
 * corrupt xlsx threw inside a call the route labelled "Drive fetch".
 */
import { describe, expect, test } from "vitest";

import { WorkbookSynthesisError } from "@/lib/drive/exportSheetToMarkdown";
import { DriveFetchError } from "@/lib/drive/fetch";
import { firstSeenPrepareCodeFor } from "@/lib/onboarding/firstSeenPrepareFault";

describe("live first-seen retry prepare-fault classification (spec §4.3)", () => {
  test("a workbook fault reports the sheet-content code", () => {
    expect(firstSeenPrepareCodeFor(new WorkbookSynthesisError("bad zip"))).toBe(
      "STAGED_PARSE_FAILED",
    );
  });

  test("a Drive transport fault keeps the Drive code", () => {
    expect(firstSeenPrepareCodeFor(new DriveFetchError("revision changed"))).toBe(
      "DRIVE_FETCH_FAILED",
    );
  });

  test("anything unrecognized stays on today's code (conservative default)", () => {
    expect(firstSeenPrepareCodeFor(new Error("socket hang up"))).toBe("DRIVE_FETCH_FAILED");
    expect(firstSeenPrepareCodeFor("boom")).toBe("DRIVE_FETCH_FAILED");
    expect(firstSeenPrepareCodeFor(undefined)).toBe("DRIVE_FETCH_FAILED");
  });
});
