// CHECK <-> runtime-array parity meta-test (backoff spec §4.2). DB-free file
// read; lives beside its subject migration's other suites under tests/db.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ATTEMPT_OUTCOMES, WATCH_ERROR_CLASSES } from "@/lib/drive/watchErrors";

const MIGRATION = "supabase/migrations/20260727000000_drive_watch_reconcile_state.sql";
const src = readFileSync(MIGRATION, "utf8");

function checkValues(constraint: string, source: string = src): string[] {
  const m = source.match(new RegExp(`${constraint}[\\s\\S]*?in \\(([^)]+)\\)`));
  if (!m) throw new Error(`constraint ${constraint} not found`);
  return m[1]!
    .split(",")
    .map((s) => s.trim().replace(/'/g, ""))
    .sort();
}

describe("CHECK <-> runtime array parity (spec §4.2)", () => {
  it("attempt-outcome CHECK equals ATTEMPT_OUTCOMES, both directions", () => {
    expect(checkValues("drive_watch_reconcile_state_attempt_outcome_check")).toEqual(
      [...ATTEMPT_OUTCOMES].sort(),
    );
  });
  it("error-class CHECK equals WATCH_ERROR_CLASSES, both directions", () => {
    expect(checkValues("drive_watch_reconcile_state_error_class_check")).toEqual(
      [...WATCH_ERROR_CLASSES].sort(),
    );
  });
  it("negative control: a perturbed value list fails both ways", () => {
    const fixture =
      "constraint drive_watch_reconcile_state_attempt_outcome_check check (\n" +
      "  last_attempt_outcome is null or last_attempt_outcome in ('failed', 'succeeded', 'extra')\n" +
      ")";
    const withExtra = checkValues("drive_watch_reconcile_state_attempt_outcome_check", fixture);
    expect(withExtra).not.toEqual([...ATTEMPT_OUTCOMES].sort());
    const missing =
      "constraint drive_watch_reconcile_state_attempt_outcome_check check (\n" +
      "  last_attempt_outcome is null or last_attempt_outcome in ('failed')\n" +
      ")";
    expect(checkValues("drive_watch_reconcile_state_attempt_outcome_check", missing)).not.toEqual(
      [...ATTEMPT_OUTCOMES].sort(),
    );
  });
});
