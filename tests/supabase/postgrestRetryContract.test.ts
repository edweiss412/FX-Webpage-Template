/**
 * tests/supabase/postgrestRetryContract.test.ts
 *
 * `lib/supabase/retryEligibility.ts` MIRRORS PostgREST's own retry contract so the wrapper can
 * decline exactly what that layer already retries. A mirror is a claim about someone else's code,
 * and the someone else is a dependency that upgrades.
 *
 * The failure this exists to stop is silent: if a version bump adds a status to PostgREST's retry
 * set, our mirror keeps declining only the old set, both layers retry the new one, and the budget
 * multiplies again — with nothing red. Round-2 review measured that multiplication at TWELVE
 * transport calls against a ratified budget of three.
 *
 * So the constants are read from the INSTALLED package rather than restated here. The test fails on
 * an upgrade that moves them, which is the moment a human needs to re-derive the carve-out.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import { describe, expect, test } from "vitest";

import {
  POSTGREST_RETRYABLE_METHODS,
  POSTGREST_RETRYABLE_STATUSES,
} from "@/lib/supabase/retryEligibility";
import { premise } from "../_shared/premise";

/** The installed postgrest-js `common` source, located through node's own resolver. */
function installedCommonSource(): string {
  // Resolved THROUGH `@supabase/supabase-js`, which is a direct dependency, rather than directly.
  //
  // postgrest-js is a transitive dep under pnpm's isolated layout, so resolving it from this file
  // works under vitest's resolver and NOT under plain node — round-4 review probed the node side and
  // read the difference as "the suite fails", which it does not (it passes, resolving into the pnpm
  // store). The finding's claim was wrong and the fragility it pointed at was real: a resolution
  // that only one resolver can perform is one toolchain change from breaking for no good reason.
  //
  // Going through the package that DEPENDS on postgrest-js mirrors the actual dependency edge, and
  // resolves under both. Verified: plain `node -e` finds it this way and fails the direct way.
  const require = createRequire(import.meta.url);
  const supabaseJs = require.resolve("@supabase/supabase-js/package.json");
  // Then walk to the source file the constants live in. Resolving the ENTRYPOINT would land in
  // dist/, where the constants are minified past recognition.
  const pkgJson = createRequire(supabaseJs).resolve("@supabase/postgrest-js/package.json");
  return readFileSync(join(dirname(pkgJson), "src/types/common/common.ts"), "utf8");
}

function parseArray(src: string, name: string): string[] {
  const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(src);
  if (m === null) throw new Error(`${name} not found in the installed postgrest-js source`);
  return m[1]!
    .split(",")
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
    .filter((s) => s.length > 0);
}

describe("the PostgREST retry mirror matches the installed package", () => {
  test("the source is readable, so a parse failure cannot pass as agreement", () => {
    const src = installedCommonSource();
    premise("bytes of installed postgrest-js common source", src.length, 0);
    expect(src).toContain("RETRYABLE_STATUS_CODES");
    expect(src).toContain("RETRYABLE_METHODS");
  });

  test("the retryable STATUS set is exactly what we mirror", () => {
    const found = parseArray(installedCommonSource(), "RETRYABLE_STATUS_CODES").map(Number);
    premise("statuses parsed out of the installed source", found.length, 0);
    expect(new Set(found)).toEqual(new Set(POSTGREST_RETRYABLE_STATUSES));
  });

  test("the retryable METHOD set is exactly what we mirror", () => {
    const found = parseArray(installedCommonSource(), "RETRYABLE_METHODS");
    premise("methods parsed out of the installed source", found.length, 0);
    expect(new Set(found)).toEqual(new Set(POSTGREST_RETRYABLE_METHODS));
  });

  test("PostgREST still refuses to retry aborts, which is why our timeout does not stack", () => {
    // The carve-out keeps timeout retries on THIS side precisely because PostgREST rethrows an
    // abort instead of retrying it. If that ever changed, our timeouts would start multiplying.
    const require = createRequire(import.meta.url);
    const supabaseJs = require.resolve("@supabase/supabase-js/package.json");
    const pkgJson = createRequire(supabaseJs).resolve("@supabase/postgrest-js/package.json");
    const builder = readFileSync(join(dirname(pkgJson), "src/PostgrestBuilder.ts"), "utf8");
    premise("bytes of installed PostgrestBuilder source", builder.length, 0);
    expect(builder).toMatch(/AbortError'\s*\|\|\s*fetchError\?\.code === 'ABORT_ERR'/);
  });
});
