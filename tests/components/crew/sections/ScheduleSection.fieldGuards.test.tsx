/**
 * tests/components/crew/sections/ScheduleSection.fieldGuards.test.tsx
 *
 * VERIFICATION-ONLY structural pin (crew-redesign §03 Task 4, Pin C).
 *
 * THE PROBLEM — R15 silently-dropped-field class:
 *   An AgendaEntry field can be fully parsed, stored, and projected but never
 *   rendered. The `_metaSentinelHidingContract` pattern is CONDITIONAL ("IF a
 *   field is read, assert it is sentinel-guarded") — it does NOT catch a field
 *   that is simply never read. The R15 bug was `entry.trt` parsed/stored/
 *   projected but never rendered in the run-of-show row; the behavioral tests
 *   and sentinel-contract both passed because the field was absent from source.
 *
 * THIS TEST:
 *   Source-scans ScheduleSection.tsx and asserts that ALL six AgendaEntry
 *   fields (start / finish / trt / title / room / av) appear as `entry.<field>`
 *   reads. A future impl that drops one fails at CI, catching the R15 class
 *   before adversarial review can surface it.
 *
 * Green-by-construction: Task 2's ScheduleSection.tsx reads all six fields in
 * RunOfShowEntry. No behavioral red→green cycle here — this is a structural pin
 * over already-shipped behavior.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test("ScheduleSection reads ALL six AgendaEntry fields (no silent field drop — R15)", () => {
  const src = readFileSync(
    join(process.cwd(), "components", "crew", "sections", "ScheduleSection.tsx"),
    "utf8",
  );
  // Every AgendaEntry field must be read off `entry.` in the run-of-show render.
  // (title is the required real field; the other five are sentinel-guarded.)
  for (const field of ["start", "finish", "trt", "title", "room", "av"] as const) {
    expect(
      new RegExp(`\\bentry\\??\\.${field}\\b`).test(src),
      `ScheduleSection.tsx never reads entry.${field} — a surfaced AgendaEntry field was dropped`,
    ).toBe(true);
  }
});
