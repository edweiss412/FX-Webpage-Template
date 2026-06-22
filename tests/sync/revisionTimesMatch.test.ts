import { describe, expect, test } from "vitest";

import { revisionTimesMatch } from "@/lib/sync/applyStaged";

/**
 * Unit contract for the revision-guard time-equality predicate (M12 Phase 0.F
 * smoke 3, 4th onboarding defect — apply revision-race FALSE POSITIVE).
 *
 * The defect: the guard compared a Drive `modifiedTime` ISO STRING (with
 * milliseconds, e.g. "...06.040Z") against `pending.stagedModifiedTime`, which
 * at runtime is a postgres.js `Date` (the timestamptz column parser yields a
 * Date, not a string). The old comparison went through `Date.parse(<Date>)`,
 * which coerces the Date via `toString()` and DROPS the milliseconds, so an
 * UNEDITED sheet (whose live modifiedTime equals the staged value to the ms)
 * produced staged=...06.000 != drive=...06.040 -> a false `revision_race`.
 *
 * `revisionTimesMatch` must compare to the exact instant regardless of whether
 * either side is an ISO string or a Date, WITHOUT losing sub-second precision,
 * while still distinguishing a genuinely different revision (a real edit).
 */
describe("revisionTimesMatch", () => {
  // THE bug: Date (postgres.js staged) vs ISO string (Drive) at the same
  // instant, sub-second ms. Old Date.parse(Date) truncated to .000 -> false.
  test("a postgres.js Date equals an ISO string for the same sub-second instant", () => {
    const iso = "2026-05-09T03:44:06.040Z";
    expect(revisionTimesMatch(iso, new Date(iso))).toBe(true);
    expect(revisionTimesMatch(new Date(iso), iso)).toBe(true);
  });

  // Guard still fires on a real edit: a different instant must NOT match,
  // even when only the milliseconds differ (the precision the old path lost).
  test("a Date and an ISO string differing only by milliseconds do NOT match", () => {
    const staged = new Date("2026-05-09T03:44:06.040Z");
    expect(revisionTimesMatch("2026-05-09T03:44:06.050Z", staged)).toBe(false);
  });

  test("a real later edit does not match (true-positive preserved)", () => {
    const staged = new Date("2026-05-09T03:44:06.040Z");
    expect(revisionTimesMatch("2026-05-09T03:45:00.000Z", staged)).toBe(false);
  });

  test("two ISO strings for the same instant match", () => {
    expect(revisionTimesMatch("2026-05-09T03:44:06.040Z", "2026-05-09T03:44:06.040+00:00")).toBe(
      true,
    );
  });

  test("two nulls match; one null does not match a real time", () => {
    expect(revisionTimesMatch(null, null)).toBe(true);
    expect(revisionTimesMatch("2026-05-09T03:44:06.040Z", null)).toBe(false);
  });
});
