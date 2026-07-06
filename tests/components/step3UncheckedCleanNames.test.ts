/**
 * tests/components/step3UncheckedCleanNames.test.ts
 *
 * The "won't be published" soft-confirm base (computeUncheckedCleanNames + the
 * shared wouldStayUnpublishedIfUnchecked predicate the optimistic count reuses)
 * must EXCLUDE already-Live rows. An unchecked existing-Live show is a spec §7.4
 * D10 NO-OP (finalize/route.ts:1071 — untouched, STAYS live), so warning that it
 * "won't be published" contradicts its own "Live" badge. Only rows that genuinely
 * stay unpublished if unchecked (first-seen → Held; pre-CAS session-created) count.
 */
import { describe, expect, it } from "vitest";
import { computeUncheckedCleanNames, type Step3Row } from "@/components/admin/wizard/Step3Review";

function row(overrides: Partial<Step3Row>): Step3Row {
  return {
    driveFileId: "d",
    status: "staged",
    ...overrides,
  };
}

describe("computeUncheckedCleanNames — already-Live exclusion", () => {
  it("names a first-seen unchecked clean row (would stay Held)", () => {
    const names = computeUncheckedCleanNames([
      row({
        driveFileId: "d1",
        status: "staged",
        displayState: "ready",
        driveFileName: "First Seen",
      }),
    ]);
    expect(names).toEqual(["First Seen"]);
  });

  it("EXCLUDES a staged row whose linked show is already Live (D10 no-op)", () => {
    const names = computeUncheckedCleanNames([
      row({
        driveFileId: "d1",
        status: "staged",
        displayState: "live",
        driveFileName: "Already Live",
      }),
    ]);
    expect(names).toEqual([]);
  });

  it("excludes applied (checked) rows and non-clean rows", () => {
    const names = computeUncheckedCleanNames([
      row({ driveFileId: "d1", status: "applied", displayState: "live", driveFileName: "Applied" }),
      row({ driveFileId: "d2", status: "hard_failed", driveFileName: "Failed" }),
    ]);
    expect(names).toEqual([]);
  });

  it("keeps only the genuinely-held rows out of a mixed set", () => {
    const names = computeUncheckedCleanNames([
      row({ driveFileId: "d1", status: "staged", displayState: "ready", driveFileName: "Keep A" }),
      row({
        driveFileId: "d2",
        status: "staged",
        displayState: "live",
        driveFileName: "Drop Live",
      }),
      row({
        driveFileId: "d3",
        status: "applied",
        displayState: "live",
        driveFileName: "Drop Applied",
      }),
      row({ driveFileId: "d4", status: "staged", displayState: "held", driveFileName: "Keep B" }),
    ]);
    expect(names).toEqual(["Keep A", "Keep B"]);
  });
});
