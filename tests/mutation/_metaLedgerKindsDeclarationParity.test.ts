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
    // does not. Importing the runner or the gate would spawn a vitest child per
    // mutant from inside a merge-gating project -- catastrophic for suite time,
    // and it would push this check straight back into the nightly job it was
    // written to escape.
    //
    // Walked TRANSITIVELY, over the resolved graph. The first version of this
    // case regex-matched `from "./source/runner"` in this file's own source and
    // nothing else, so it was defeated by a re-export, by single quotes, by a
    // dynamic import, and by any of the three arriving one module deeper -- a
    // probe with a helper re-exporting the runner passed it while the resolved
    // graph did contain `source/runner.ts`. Matching a FRAGMENT of the thing you
    // mean to identify is the same defect this file's subject is about.
    const { readFileSync, existsSync, statSync } = await import("node:fs");
    const { dirname, resolve, join, relative } = await import("node:path");
    const ROOT = process.cwd();
    // `surfaceCases` ONLY. The first list also named `runner` and `gate`, and the
    // transitive walk immediately falsified that: `registry.ts` reaches
    // `source/runner.ts`, and this file still collects and runs in well under a
    // second. Importing the runner is HARMLESS -- it only DEFINES `runSurface`
    // (tests/mutation/source/runner.ts:141). What spawns children is CALLING it,
    // and the module that does so is `surfaceCases`, at module scope inside
    // `describe.each` (tests/mutation/source/surfaceCases.ts:28). The invariant
    // as first written was about the wrong noun -- forbidding an IMPORT when the
    // cost is a CALL -- and strengthening the guard is what exposed it.
    const FORBIDDEN = ["tests/mutation/source/surfaceCases"];

    // USE vs MENTION, in one place because BOTH scans below need it. A guard
    // that reads source and also DOCUMENTS the hazard it forbids will match its
    // own documentation unless comments are removed first -- which is exactly
    // what happened twice here: the import walk flagged the aliased example
    // quoted in a comment, and the call scan flagged `runSurface(` written in
    // prose explaining the call scan.
    const stripComments = (src: string): string =>
      src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

    const entry = new URL(import.meta.url).pathname;
    const resolveSpec = (from: string, spec: string): string | null => {
      // `@/...` is the repo alias (vitest.projects.ts:176, `{ "@": root }`). The
      // first version discarded every non-relative specifier as "a package", so
      // `export * from "@/tests/mutation/source/surfaceCases"` reached the
      // forbidden module and PASSED. An alias is a repo path wearing a package's
      // shape; a resolver that models only one of the two spellings covers only
      // the imports its author happened to write.
      const base = spec.startsWith("@/")
        ? resolve(ROOT, spec.slice(2))
        : spec.startsWith(".")
          ? resolve(dirname(from), spec)
          : null;
      if (base === null) return null; // a real package cannot reach repo modules
      for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
        if (existsSync(c) && statSync(c).isFile()) return c;
      }
      return null;
    };
    const seen = new Set<string>([entry]);
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.shift()!;
      const src = stripComments(readFileSync(file, "utf8"));
      // Both quote styles, static and dynamic, `import` and `export ... from`.
      for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const next = resolveSpec(file, m[1]!);
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const graph = [...seen].map((f) => relative(ROOT, f).replace(/\\/g, "/"));
    // PREMISE, STATED EXECUTABLY: the walk must actually traverse. If resolution
    // silently failed, the graph would be this file alone and the assertion
    // below would pass over nothing -- which is exactly how the version this
    // replaces passed.
    premiseHolds("the import walk resolved beyond the entry file", graph.length > 1);
    const heavy = graph.filter((f) => FORBIDDEN.some((h) => f.startsWith(h)));
    expect(heavy, `heavy modules reachable from this file (graph: ${graph.join(", ")})`).toEqual(
      [],
    );

    // The other half, since reaching the runner is not what costs: this file must
    // never CALL a mutant-spawning entry point. An import is cheap; an invocation
    // is not, and only the invocation turns this file back into the nightly job
    // it was written to escape.
    // THE REAL GUARANTEE IS THE IMPORT ALLOWLIST, not the call scan below.
    // Round 2 showed the call scan missing renamed indirection, optional calls
    // and template interpolation, and chasing those turns a guard into a
    // recognizer -- each round adds one more invocation spelling and the next
    // round finds the next. The narrowing that is STRICTLY STRONGER: pin this
    // file's DIRECT imports to an exact set. None of the hazard identifiers is
    // then in lexical scope at all, so there is nothing to rename, interpolate
    // or optional-call, and a transitive helper cannot be introduced without
    // failing here first. Set equality, so an addition AND a removal both fail.
    const ownSrc = readFileSync(entry, "utf8");
    const directImports = [...ownSrc.matchAll(/^\s*import\s[^;]*?from\s+["']([^"']+)["']/gm)]
      .map((m) => m[1]!)
      .sort();
    expect(directImports, "this file's direct imports are pinned").toEqual([
      "../_shared/premise",
      "./source/expectedLedgerKinds",
      "./source/registry",
      "vitest",
    ]);

    // Belt and braces, and deliberately NOT extended past what an ordinary edit
    // looks like. Single- and double-quoted strings are blanked so the needle
    // list cannot match itself; TEMPLATE literals are left intact, because
    // `${runSurface(...)}` is a real call and blanking backticks hid it. `?.(`
    // is covered. A renamed indirect call (`const f = runSurface; f(...)`) is a
    // DOCUMENTED LIMIT of this scan -- it is adversarial rather than an ordinary
    // authoring mistake, which this file's threat fence puts out of scope, and
    // the allowlist above makes it unreachable in any case.
    const HAZARDS = ["runSurface", "runControl", "registerSurfaceCases"];
    const scanned = stripComments(ownSrc)
      .split("\n")
      .filter((l) => !l.includes("const HAZARDS ="))
      .join("\n")
      .replace(/"[^"\n]*"|'[^'\n]*'/g, '""');
    const calls = HAZARDS.filter((c) => new RegExp(`\\b${c}\\s*(?:\\?\\.)?\\s*\\(`).test(scanned));
    expect(calls, "mutant-spawning calls in this file").toEqual([]);
  });
});
