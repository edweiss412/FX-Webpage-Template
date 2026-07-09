import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Phase1ShowRow } from "@/lib/sync/phase1";

// C2: readShowForPhase1 must expose the RAW, non-coalesced prior warnings so Unit C can distinguish
// a NULL parse_warnings column (untrustworthy baseline → skip) from a trustworthy empty `[]`.
// The runtime 3-path proof (NO shows_internal row / NULL column / present-`[]` / present-entries)
// runs against a real DB in the "readShowForPhase1 priorParseWarningsRaw DB mapping" describe of
// tests/sync/qualityRegressionLifecycle.test.ts (spec §6.7 test 2). This file pins the TYPE contract
// + the exact source mapping as a DB-free fast tripwire so the coalesce can't silently regress.

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

describe("Flow 4.1 read-path — published (publish-state threading)", () => {
  it("Phase1ShowRow carries published as a REQUIRED boolean (type contract)", () => {
    // Compile-time contract: present values compile as boolean...
    const pub: Pick<Phase1ShowRow, "published"> = { published: true };
    const unpub: Pick<Phase1ShowRow, "published"> = { published: false };
    expect(pub.published).toBe(true);
    expect(unpub.published).toBe(false);
    // ...and OMITTING it is a type error (proves REQUIRED, not optional). If `published`
    // were `?:`, this @ts-expect-error would itself error ("unused expect-error") → red.
    // @ts-expect-error published is REQUIRED on Phase1ShowRow — an empty object must not satisfy it
    const missing: Pick<Phase1ShowRow, "published"> = {};
    void missing;
  });

  it("the concrete readShowForPhase1 producer maps show.published", () => {
    const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
    // producer returns the raw column onto Phase1ShowRow.published (not a hardcoded literal)
    expect(src).toMatch(/published:\s*show\.published/);
  });
});
