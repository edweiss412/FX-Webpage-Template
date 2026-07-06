import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Phase1ShowRow } from "@/lib/sync/phase1";

// C2: readShowForPhase1 must expose the RAW, non-coalesced prior warnings so Unit C can distinguish
// a NULL parse_warnings column (untrustworthy baseline → skip) from a trustworthy empty `[]`.
// The runtime 3-path proof (NULL column / missing shows_internal row / present-`[]`) lives in the
// MANDATORY DB-backed test in tests/sync/qualityRegressionLifecycle.test.ts (spec §6.7 test 2);
// this file pins the TYPE contract + the exact mapping so the coalesce can't silently regress.

describe("Unit C read-path — priorParseWarningsRaw (C2)", () => {
  it("Phase1ShowRow carries priorParseWarningsRaw as a raw-nullable field (type contract)", () => {
    // Compile-time contract: a Phase1ShowRow value must accept `null` for priorParseWarningsRaw
    // (untrustworthy baseline) distinct from the coalesced `warnings` inside priorParseResult.
    const row: Pick<Phase1ShowRow, "priorParseWarningsRaw"> = { priorParseWarningsRaw: null };
    expect(row.priorParseWarningsRaw).toBeNull();
    const withArray: Pick<Phase1ShowRow, "priorParseWarningsRaw"> = { priorParseWarningsRaw: [] };
    expect(withArray.priorParseWarningsRaw).toEqual([]);
  });

  it("the concrete readShowForPhase1 producer maps the RAW value (?? null, NOT ?? [])", () => {
    // Guard against the coalesce regression that erases the NULL signal (plan-review R11 / R3).
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    expect(src).toMatch(/priorParseWarningsRaw:\s*internal\?\.parse_warnings \?\? null/);
    // The existing coalesced `warnings` field is preserved for current consumers.
    expect(src).toMatch(/warnings:\s*internal\?\.parse_warnings \?\? \[\]/);
  });
});
