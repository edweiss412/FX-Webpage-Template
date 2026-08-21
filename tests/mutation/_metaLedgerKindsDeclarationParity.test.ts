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
//      so enrolling ONE surface moved 24 OF THE 40 pre-existing surfaces to a
//      different leg -- measured by running `sourceShardAssignment` over the
//      registry with and without `claimSweep`. An earlier draft said "three",
//      which was four ids spot-checked and generalised; the real figure is 60%
//      of the corpus, and it makes the point harder rather than softer.
//
// This file is the same claim with none of that machinery: pure data, no child
// process, no mutation run, in the merge-gating `parallel` project. It cannot be
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
    // does not, so what it may depend on is pinned rather than trusted.
    //
    // THE TRANSITIVE REACHABILITY WALK THAT STOOD HERE IS DELETED, and the
    // reason is the finding four review rounds converged on rather than a
    // retreat under pressure. It forbade IMPORT EDGES, and NO IMPORT EDGE IS
    // HAZARDOUS. What costs is CALLING a spawner, which only a shard file does.
    //
    // PROBED rather than asserted, by parsing both modules' top-level statements
    // (2026-08-21):
    //   runner.ts       3 top-level non-declaration statements -- `const CONFIG`,
    //                   `export const MUTANT_TIMEOUT_EXIT = 124`, `const CHILD_ARGS`.
    //                   NONE calls runSurface/runControl/execFileSync/spawnSync.
    //   surfaceCases.ts 1 -- `const root = process.cwd()`. Same result.
    // So importing either executes no mutant and spawns no child.
    //
    // A CORRECTION TO THIS COMMENT'S OWN FIRST DRAFT, kept because it is the
    // reason the walk had to go. That draft said the walk "red on safe code
    // because this file reaches runner.ts through registry.ts". IT DOES NOT:
    // `registry.ts` imports exactly `node:fs`, `./ledger` and `./operators`.
    // The reachability that red was manufactured by the walker's OWN defect --
    // it matched `from "..."` inside comments, including the comment quoting the
    // attack example. So the walk's observed false positives came from its
    // scanner rather than from the graph, which is a worse fault than the one I
    // credited it with and an independent reason not to keep it.
    //
    // It was also unfixable in the direction it was being pushed. Rounds 1-4
    // each found one more specifier spelling the resolver did not model --
    // re-export, `@/` alias, root-relative `/tests/...`, then Vite's `.js`/
    // `.jsx`-to-TypeScript substitution -- because it re-implemented a resolver
    // the project already owns. A fifth spelling was the round-4 finding, and
    // adding it would have bought the sixth.
    //
    // What remains is the half that is TOTAL over its domain instead of one
    // enumeration short. Hardening the reachability claim properly -- through
    // Vite's own resolver -- is BL-MUTATION-CHEAPNESS-GUARD-HAND-ENUMERATED-SPECIFIERS.
    const { readFileSync } = await import("node:fs");
    const entry = new URL(import.meta.url).pathname;

    // USE vs MENTION: this file documents the hazard it forbids, so a scan of
    // its own source matches its own prose unless comments go first.
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const ownSrc = stripComments(readFileSync(entry, "utf8"));

    // EXACT SET, static AND dynamic. This is the guarantee the case rests on and
    // it is total over its domain: every specifier this file can name has to
    // appear here, so a hazard identifier can never enter lexical scope --
    // nothing to rename, interpolate, optional-call, or reach one module deeper.
    const staticSpecs = [
      ...ownSrc.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm),
    ].map((m) => m[1]!);
    const dynamicSpecs = [...ownSrc.matchAll(/\bimport\s*\(\s*["']([^"']+)["']/g)].map(
      (m) => m[1]!,
    );
    expect(
      [...staticSpecs, ...dynamicSpecs].sort(),
      "this file's direct imports are pinned (static AND dynamic)",
    ).toEqual([
      "../_shared/premise",
      "./source/expectedLedgerKinds",
      "./source/registry",
      "node:fs",
      "vitest",
    ]);

    // Belt and braces on the axis that actually costs. Bounded deliberately: a
    // renamed indirect call is a DOCUMENTED LIMIT against this file's threat
    // fence (ordinary authoring mistakes), and the allowlist above makes it
    // unreachable regardless.
    const HAZARDS = ["runSurface", "runControl", "registerSurfaceCases"];
    const scanned = ownSrc
      .split("\n")
      .filter((l) => !l.includes("const HAZARDS ="))
      .join("\n")
      .replace(/"[^"\n]*"|'[^'\n]*'/g, '""');
    const calls = HAZARDS.filter((c) => new RegExp(`\\b${c}\\s*(?:\\?\\.)?\\s*\\(`).test(scanned));
    expect(calls, "mutant-spawning calls in this file").toEqual([]);
  });
});
