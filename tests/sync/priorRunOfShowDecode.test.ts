import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("prior run_of_show is decoded at the producer (R3 finding 5)", () => {
  const src = readFileSync("lib/sync/runScheduledCronSync.ts", "utf8");
  it("imports decodeRunOfShow", () => {
    expect(src).toMatch(/import[^;]*\bdecodeRunOfShow\b[^;]*from\s+["']@\/lib\/data\/decodeRunOfShow["']/);
  });
  it("wraps the prior run_of_show read in decodeRunOfShow(...).value (not the raw array)", () => {
    // The applyShowSnapshot prior-read region must not assign run_of_show raw.
    expect(src).toMatch(/decodeRunOfShow\(\s*[^)]*run_of_show[^)]*\)\.value/);
    // Guard against the legacy raw assignment surviving.
    expect(src).not.toMatch(/priorRunOfShow:\s*priorInternal\?\.run_of_show\s*\?\?\s*null/);
  });
});
