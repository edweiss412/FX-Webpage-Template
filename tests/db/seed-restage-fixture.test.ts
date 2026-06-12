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
const walkerSeedSource = readFileSync(
  join(process.cwd(), "supabase/seedWalkerFixtures.ts"),
  "utf8",
);

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

// M12.12 Task 12 — locked-seed-cleanup contract (plan-wide invariant 2).
//
// The base seed's prefix-wide `seed-fixture:%` cleanup also sweeps rows the
// walker seed extension (supabase/seedWalkerFixtures.ts) created — ids NOT in
// the base seed's enumerated per-fixture lock list. Every locked-table delete
// must therefore run under per-show advisory locks materialized from the FULL
// seed-prefix id set (`_locked_seed_ids`), acquired in drive_file_id order.
// These pins are source-level (no DB) — seed.ts runs main() at import time,
// so the contract is asserted against the source text, mirroring the M2-D5
// pins above.
describe("M12.12 Task 12: locked seed cleanup + walker extension lock topology", () => {
  it("seed.ts materializes _locked_seed_ids (three union arms) and locks it ordered, before the first locked-table delete", () => {
    const createIdx = seedSource.indexOf(
      "create temporary table _locked_seed_ids on commit drop as",
    );
    expect(createIdx, "seed.ts must materialize _locked_seed_ids").toBeGreaterThan(-1);

    // Three union arms: shows, pending_syncs, pending_ingestions — each
    // snapshotting the seed-prefix ids.
    for (const table of ["shows", "pending_syncs", "pending_ingestions"]) {
      expect(seedSource, `_locked_seed_ids must include the public.${table} union arm`).toMatch(
        new RegExp(`select drive_file_id from public\\.${table} where drive_file_id like`),
      );
    }

    // Ordered advisory-lock sweep over the materialized set.
    const lockSweep = seedSource.match(
      /select pg_advisory_xact_lock\(hashtext\('show:' \|\| drive_file_id\)\)\s*\n\s*from _locked_seed_ids\s*\n\s*order by drive_file_id;/,
    );
    expect(lockSweep, "ordered pg_advisory_xact_lock sweep over _locked_seed_ids").not.toBeNull();

    // The materialization + sweep must textually precede the FIRST
    // locked-table delete (pending_syncs is the first in seedSql).
    const sweepIdx = seedSource.indexOf(lockSweep![0]);
    const firstLockedDeleteIdx = seedSource.indexOf("delete from public.pending_syncs");
    expect(firstLockedDeleteIdx).toBeGreaterThan(-1);
    expect(createIdx, "_locked_seed_ids created before first locked delete").toBeLessThan(
      firstLockedDeleteIdx,
    );
    expect(sweepIdx, "lock sweep before first locked delete").toBeLessThan(firstLockedDeleteIdx);
  });

  it("no locked-table delete uses a naked seed-prefix LIKE (sync_audit is the sole exception)", () => {
    // Find every `delete from public.<table> ... where drive_file_id like`
    // in seed.ts. Only the NON-locked sync_audit table may keep the plain
    // wildcard; the locked tables (pending_syncs, pending_ingestions, shows)
    // must delete via the locked snapshot.
    const likeDeletes = [
      ...seedSource.matchAll(/delete from public\.(\w+)\s*\n?\s*where drive_file_id like/g),
    ].map((match) => match[1]);
    expect(likeDeletes, "only sync_audit may delete by naked seed-prefix LIKE").toEqual([
      "sync_audit",
    ]);

    for (const table of ["pending_syncs", "pending_ingestions", "shows"]) {
      expect(
        seedSource,
        `public.${table} delete must target the locked _locked_seed_ids snapshot`,
      ).toMatch(
        new RegExp(
          `delete from public\\.${table}\\s*\\n?\\s*where drive_file_id in \\(select drive_file_id from _locked_seed_ids\\);`,
        ),
      );
    }
  });

  it("seedWalkerFixtures.ts acquires exactly FOUR per-show locks in drive_file_id-sorted order", () => {
    const arrayMatch = walkerSeedSource.match(
      /const WALKER_DRIVE_FILE_IDS = \[([\s\S]*?)\] as const;/,
    );
    expect(arrayMatch, "WALKER_DRIVE_FILE_IDS array literal").not.toBeNull();
    const ids = [...arrayMatch![1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);

    // Exactly FOUR, the exact set, and array order IS sorted ascending order
    // (the locks are emitted by mapping this array — order in source is the
    // acquisition order).
    expect(ids).toEqual([
      "seed-fixture:walker-archived",
      "seed-fixture:walker-drive-error",
      "seed-fixture:walker-first-seen",
      "seed-fixture:walker-pending-review",
    ]);
    expect([...ids].sort(), "array order is the sorted order").toEqual(ids);

    // The locks are derived from that array via pg_advisory_xact_lock and
    // are emitted before any locked-table delete in the transaction.
    expect(walkerSeedSource).toMatch(
      /WALKER_DRIVE_FILE_IDS\.map\([\s\S]{0,200}pg_advisory_xact_lock\(hashtext\('show:' \|\|/,
    );
    const locksIdx = walkerSeedSource.indexOf("pg_advisory_xact_lock");
    const deleteIdx = walkerSeedSource.indexOf("delete from public.pending_syncs");
    expect(deleteIdx).toBeGreaterThan(-1);
    expect(locksIdx, "locks precede locked-table deletes").toBeLessThan(deleteIdx);
  });
});
