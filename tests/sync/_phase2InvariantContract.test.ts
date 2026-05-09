import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("M6 Phase 2 invariant gate contract", () => {
  test("processOneFile_unlocked runs Phase 1 before any Phase 2 destructive apply", () => {
    const source = readFileSync(join(process.cwd(), "lib/sync/runScheduledCronSync.ts"), "utf8");
    const phase1Offset = source.indexOf("runPhase1_unlocked");
    const phase2Offset = source.indexOf("runPhase2_unlocked");

    expect(phase1Offset).toBeGreaterThan(-1);
    expect(phase2Offset).toBeGreaterThan(-1);
    expect(phase1Offset).toBeLessThan(phase2Offset);
  });
});
