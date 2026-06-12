import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

import { revisionTimesMatch } from "@/lib/sync/applyStaged";

/**
 * STRUCTURAL DEFENSE for the postgres.js-timestamptz-vs-Date.parse bug class
 * (M12 Phase 0.F smoke 3, + its finalize and cron-deferral peers).
 *
 * The class: the DB layer (postgres.js) parses `timestamptz` columns into JS
 * `Date` objects at runtime, but the row/field types say `string`. A timestamp
 * helper that runs `Date.parse(value)` then silently coerces a Date through
 * `toString()` and DROPS the milliseconds, so an unchanged sheet/deferral whose
 * live time matches the persisted value to the millisecond mis-compares and a
 * revision/deferral guard fires (or clears) incorrectly. Three guards in three
 * files independently reinvented a `Date.parse`-based timestamp helper and each
 * carried this bug; the first sweep missed two of them.
 *
 * This guard fails CI if a revision/deferral timestamp helper in the sync
 * pipeline reverts to a bare `Date.parse` form without an `instanceof Date`
 * branch (the only thing that preserves milliseconds for a postgres.js Date).
 * It also pins that the finalize route compares via the shared, Date-safe
 * `revisionTimesMatch` rather than a private Date.parse helper.
 */
const ROOT = join(__dirname, "..", "..");
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// Returns the body of every `function <name>(` block (brace-matched) in `src`.
function functionBodies(src: string, name: string): string[] {
  const bodies: string[] = [];
  const needle = `function ${name}(`;
  let from = 0;
  for (;;) {
    const start = src.indexOf(needle, from);
    if (start === -1) break;
    const open = src.indexOf("{", start);
    if (open === -1) break;
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    bodies.push(src.slice(open, i + 1));
    from = i + 1;
  }
  return bodies;
}

describe("timestamp instant-comparison Date-safety (structural defense)", () => {
  // Files that define a local `timestampMs` helper used by a revision/deferral
  // guard AND read timestamptz columns via postgres.js.
  const FILES_WITH_TIMESTAMP_MS = [
    // F1 Task 1.1: timestampMs/sameTimestamp moved from applyStaged.ts to the shared
    // applyStagedCore.ts (applyStaged.ts now imports them — no local helper remains there).
    "lib/sync/applyStagedCore.ts",
    "lib/sync/runScheduledCronSync.ts",
  ];

  test.each(FILES_WITH_TIMESTAMP_MS)(
    "%s: every timestampMs handles a postgres.js Date (has an `instanceof Date` branch)",
    (rel) => {
      const bodies = functionBodies(read(rel), "timestampMs");
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        expect(
          body.includes("instanceof Date"),
          `timestampMs in ${rel} must branch on \`instanceof Date\` so a postgres.js ` +
            `timestamptz Date is not silently truncated by Date.parse(<Date>)`,
        ).toBe(true);
      }
    },
  );

  test("finalize route compares staged_modified_time via the shared Date-safe revisionTimesMatch", () => {
    const src = read("app/api/admin/onboarding/finalize/route.ts");
    expect(src).toContain("revisionTimesMatch");
    // The local sameTimestamp must delegate, not reintroduce a private Date.parse.
    const bodies = functionBodies(src, "sameTimestamp");
    expect(bodies.length).toBe(1);
    expect(bodies[0]).toContain("revisionTimesMatch(");
    expect(bodies[0]).not.toContain("Date.parse(");
  });

  // Behavioral anchor: the exported shared predicate is Date-safe to the ms.
  test("revisionTimesMatch is millisecond-exact for a Date vs an ISO string", () => {
    const iso = "2026-05-09T03:44:06.040Z";
    expect(revisionTimesMatch(new Date(iso), iso)).toBe(true);
    expect(revisionTimesMatch(new Date(iso), "2026-05-09T03:44:06.041Z")).toBe(false);
  });
});
