// tests/mutation/_metaLedgerKindsDeclarationParity.test.ts
//
// Every enrolled surface's ACTUAL accepted-row kinds must equal the counts
// declared for it in EXPECTED_LEDGER_KINDS -- checked here, cheaply, over the
// whole registry.
//
// WHY THIS FILE EXISTS WHEN surfaceCases.ts ALREADY ASSERTS THIS.
// It does assert it, per surface, as AC-13. But that case is reached only
// through `runSurface`, which runs at MODULE scope inside `describe.each`
// (tests/mutation/source/surfaceCases.ts:20-27) and spawns one vitest child per
// mutant. So the assertion lives exclusively inside `guardSurfaces.shard*` --
// nightly, four-way sharded, and excluded from every merge-gating project by
// NIGHTLY_ONLY_EXCLUDES (vitest.projects.ts:97-102). Three properties of that
// job, each independently sufficient, hid a real mismatch for five days:
//
//   1. a CANCELLED leg carries no verdict at all, and the shard budget breach
//      (3812s / 4180s / 5172s against a 3600s budget, under a 90-minute job
//      ceiling) produces cancellations routinely;
//   2. a leg red for ANY surface masks every sibling surface on that leg -- the
//      mismatch below sat inside a leg already red for destructiveFileAnalysis;
//   3. the leg carrying a surface is not stable. The partition is recomputed
//      from weights on every commit (tests/mutation/source/shardPartition.ts:39-45),
//      so enrolling ONE surface moved THREE others between legs.
//
// This file is the same claim with none of that machinery: pure data, no child
// process, no mutation run, in the merge-gating serial project. It cannot be
// cancelled, cannot be masked by a sibling, and does not move.
//
// DERIVED, NOT ENUMERATED. It walks GUARD_SURFACES, so a surface added tomorrow
// is covered without editing this file -- which is the actual defect being
// repaired. The mismatch it was written to catch was introduced by 6d6760019
// adding two accepted rows without moving the declaration, and SURVIVED
// d342677e0, a commit that diagnosed exactly this class, wrote the explanation
// still sitting above the row, repaired fieldNearMiss, and left rowScanOpener
// one line below it. Naming a class is not sweeping it; only a derivation is.
import { describe, expect, it } from "vitest";

import { premiseHolds } from "../_shared/premise";
import { EXPECTED_LEDGER_KINDS } from "./source/expectedLedgerKinds";
import { GUARD_SURFACES } from "./source/registry";

/** The kinds a surface ACTUALLY carries, counted from the registry rows. */
function actualKinds(surface: (typeof GUARD_SURFACES)[number]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of surface.accepted) counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  return counts;
}

describe("EXPECTED_LEDGER_KINDS is in parity with the registry it describes", () => {
  it("declares the exact accepted-row kinds every surface carries", () => {
    // PREMISE, STATED EXECUTABLY: this comparison discriminates only if some
    // surface actually carries accepted rows. If every surface's ledger were
    // empty, every `{}` would equal every `{}` and the case would pass on a
    // registry that declares nothing at all.
    premiseHolds(
      "at least one surface carries accepted rows",
      GUARD_SURFACES.some((s) => s.accepted.length > 0),
    );
    // And the declared side must be non-vacuous too, for the same reason in the
    // other direction: an EXPECTED_LEDGER_KINDS of all-empty entries would be
    // satisfied by a registry whose rows had all been deleted.
    premiseHolds(
      "at least one declared entry is non-empty",
      Object.values(EXPECTED_LEDGER_KINDS).some((v) => Object.keys(v).length > 0),
    );

    // EVERY disagreement is reported in one pass. Reporting only the first
    // would drip one surface per run, which is how this class survived its own
    // diagnosis: the repair fixed the instance it was looking at and stopped.
    const mismatches = GUARD_SURFACES.flatMap((surface) => {
      const actual = actualKinds(surface);
      const declared = EXPECTED_LEDGER_KINDS[surface.id];
      if (declared === undefined) {
        return [`${surface.id}: registry carries ${JSON.stringify(actual)}, declares NOTHING`];
      }
      const same =
        Object.keys(actual).length === Object.keys(declared).length &&
        Object.entries(actual).every(([k, n]) => (declared as Record<string, number>)[k] === n);
      return same
        ? []
        : [
            `${surface.id}: registry ${JSON.stringify(actual)} != declared ${JSON.stringify(declared)}`,
          ];
    });

    expect(mismatches.join("\n"), "surfaces whose declared kinds do not match their rows").toBe("");
  });

  it("declares an entry for every surface and no entry for a surface that is gone", () => {
    const surfaceIds = GUARD_SURFACES.map((s) => s.id).sort();
    const declaredIds = Object.keys(EXPECTED_LEDGER_KINDS).sort();
    premiseHolds("the registry is non-empty", surfaceIds.length > 0);
    // Set equality in both directions. "Every surface has an entry" alone is
    // satisfied by a stale entry naming a surface that was deleted, which would
    // then never be read and never be noticed.
    expect(declaredIds).toEqual(surfaceIds);
  });

  it("stays cheap enough to run in the merge-gating suite", async () => {
    // The whole value of this file is that it runs everywhere the sharded gate
    // does not. Importing the runner or the gate would spawn a vitest child per
    // mutant from inside the serial unit suite -- catastrophic for suite time,
    // and it would push this check straight back into the nightly job it was
    // written to escape. Pinned against its own source.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL(import.meta.url).pathname, "utf8");
    const heavy = ["./source/runner", "./source/gate", "./source/surfaceCases"].filter((m) =>
      new RegExp(`from "${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(src),
    );
    expect(heavy, "heavy imports that would make this file spawn mutants").toEqual([]);
  });
});
