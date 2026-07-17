/**
 * Resolver-identity guard (spec 2026-07-16-role-vocab-mapping-convergence §3.2; plan Task 1 R1 F2).
 *
 * The drift scanner MUST resolve the same DATABASE_URL, with the same precedence, as the cron
 * pipeline — a precedence divergence would point the scanner at a different DB than the one the
 * per-file gate mutates. The single resolver lives in `lib/sync/_databaseUrl.ts`; both
 * `runScheduledCronSync` and `roleVocabDrift` import that one function. This test pins:
 *   (a) referential identity — the resolver re-exported by the cron module IS the extracted one;
 *   (b) module source — `roleVocabDrift` imports `databaseUrl` from the shared module, so no
 *       second resolver can be introduced without failing here.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { databaseUrl as sharedDatabaseUrl } from "@/lib/sync/_databaseUrl";
import { databaseUrl as cronDatabaseUrl } from "@/lib/sync/runScheduledCronSync";

describe("role-vocab drift resolver identity", () => {
  it("cron pipeline re-exports the extracted single resolver (referential identity)", () => {
    expect(cronDatabaseUrl).toBe(sharedDatabaseUrl);
  });

  it("roleVocabDrift imports databaseUrl from the shared resolver module (no second resolver)", () => {
    const source = readFileSync(path.join(process.cwd(), "lib/sync/roleVocabDrift.ts"), "utf8");
    expect(source).toMatch(
      /import\s*\{[^}]*\bdatabaseUrl\b[^}]*\}\s*from\s*"@\/lib\/sync\/_databaseUrl"/,
    );
  });
});
