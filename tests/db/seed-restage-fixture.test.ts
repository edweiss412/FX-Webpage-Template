// M2-D5 — seed's restage fixture filename must stay derivable-loud, not
// silent-break. supabase/seed.ts names ONE raw fixture that gets the
// partial_failure_restage_required diagram treatment. If that fixture is
// renamed or replaced, `fileName === restageRequiredFixture` simply never
// matches: every show seeds as `complete`, the restage scenario silently
// vanishes from the seeded DB, and everything downstream that exercises the
// restage path (recovery walks, restage e2e) loses coverage without a single
// red test.
//
// seed.ts runs main() (psql side effects) at import time, so this contract is
// pinned source/filesystem-level — no import:
//   1. The named fixture EXISTS on disk (trips on rename/delete at CI time).
//   2. loadFixtures() carries a loud-throw guard on the constant (trips if a
//      refactor drops the runtime check that turns silent-skip into an error).
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const seedSource = readFileSync(join(process.cwd(), "supabase/seed.ts"), "utf8");

function namedRestageFixture(): string {
  const match = seedSource.match(/const restageRequiredFixture = "([^"]+)";/);
  if (!match?.[1]) {
    throw new Error(
      'supabase/seed.ts no longer declares `const restageRequiredFixture = "..."` — update this test\'s extraction alongside the refactor (M2-D5).',
    );
  }
  return match[1];
}

describe("M2-D5: seed restage fixture contract", () => {
  it("the named restage fixture exists in fixtures/shows/raw/", () => {
    const fileName = namedRestageFixture();
    expect(
      existsSync(join(process.cwd(), "fixtures/shows/raw", fileName)),
      `supabase/seed.ts names restageRequiredFixture="${fileName}" but fixtures/shows/raw/ has no such file — rename the constant alongside the fixture or the restage seed scenario silently disappears.`,
    ).toBe(true);
  });

  it("loadFixtures() throws loudly when the restage fixture is absent (no silent skip)", () => {
    // Structural pin: the runtime guard must reference the constant inside a
    // throw path so a live seed run against a renamed fixture set fails fast
    // instead of seeding every show as `complete`.
    expect(seedSource).toMatch(
      /if \(!fixtureFiles\.includes\(restageRequiredFixture\)\)[\s\S]{0,200}throw new Error/,
    );
  });
});
