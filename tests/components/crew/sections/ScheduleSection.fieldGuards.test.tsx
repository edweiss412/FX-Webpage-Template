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
 *   Source-scans the run-of-show renderer and asserts that ALL six AgendaEntry
 *   fields (start / finish / trt / title / room / av) appear as `entry.<field>`
 *   reads. A future impl that drops one fails at CI, catching the R15 class
 *   before adversarial review can surface it.
 *
 *   Task 3 (mock-fidelity) extracted RunOfShowEntry/RunOfShowList VERBATIM out
 *   of ScheduleSection.tsx into components/crew/primitives/RunOfShowList.tsx so
 *   the crew Today surface can reuse the SAME run-of-show row (single source of
 *   truth — no duplicated predicate). The R15 structural pin follows the moved
 *   symbol: it now source-scans RunOfShowList.tsx, where RunOfShowEntry reads
 *   all six fields. Pure move — the same six `entry.<field>` reads, new file.
 *
 * Green-by-construction: RunOfShowList.tsx reads all six fields in
 * RunOfShowEntry. No behavioral red→green cycle here — this is a structural pin
 * over already-shipped behavior.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test("the run-of-show renderer reads ALL six AgendaEntry fields (no silent field drop — R15)", () => {
  const src = readFileSync(
    join(process.cwd(), "components", "crew", "primitives", "RunOfShowList.tsx"),
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
