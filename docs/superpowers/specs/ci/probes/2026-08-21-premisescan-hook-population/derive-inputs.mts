/**
 * The `premiseScan` mutation score's input set, derived rather than listed.
 *
 * The score is a pure function of (source, declared operators, deciding suites,
 * fixtures) — plus, on this harness, the machinery that OVERLAYS a mutant and
 * COMPUTES the verdict. A hand-list gets this wrong in both directions every
 * time: the first attempt on this arc named nine files, omitted five real
 * transitive inputs and included two that are not reachable at all.
 *
 * Two seeds, and the second exists because an import walk cannot find it:
 *
 *   TRANSITIVE — from the registry row's `sourcePath` and `suitePaths`, following
 *   relative `from "…"` specifiers. This finds the scanner, both deciding suites,
 *   the operators, the ledger and the shared test helpers.
 *
 *   HARNESS — the overlay configuration, the overlay itself, the vitest project
 *   definitions and the surface-case driver. `runner.ts` reaches the overlay
 *   config by PATH rather than by import, so no import walk can see it, and
 *   `surfaceCases.ts` is what computes and enforces the score. A change to any of
 *   them can move the score while a transitive-only stamp stays equal. Declared
 *   with that reason rather than derived, because the dependency is real and the
 *   edge is not expressible as an import.
 *
 * Run from the repository root. Prints one repo-relative path per line.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";

const ROOT = process.cwd();
const row = GUARD_SURFACES.find((s) => s.id === "premiseScan");
if (!row) {
  console.error("derive-inputs: no premiseScan row in the registry");
  process.exit(2);
}

/** Reached by path or by configuration, never by an import edge. */
const HARNESS = [
  "tests/mutation/source/mutantOverlay.config.ts",
  "tests/mutation/source/overlay.ts",
  "tests/mutation/source/surfaceCases.ts",
  "vitest.projects.ts",
];

const seen = new Set<string>();
const stack = [row.sourcePath, ...row.suitePaths, "tests/mutation/source/registry.ts", ...HARNESS];
while (stack.length > 0) {
  const rel = stack.pop()!;
  if (seen.has(rel)) continue;
  seen.add(rel);
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  for (const m of readFileSync(abs, "utf8").matchAll(/from\s+"(\.[^"]+)"/g)) {
    for (const ext of [".ts", ".tsx", "/index.ts"]) {
      const cand = resolve(dirname(abs), m[1]! + ext);
      if (existsSync(cand)) {
        stack.push(relative(ROOT, cand));
        break;
      }
    }
  }
}

const out = [...seen].filter((f) => existsSync(join(ROOT, f))).sort();
// A derivation's failure mode is silently deriving nothing, which renders
// identically to correctly finding nothing. Refuse rather than print a short set.
if (out.length < 10) {
  console.error(`derive-inputs: derived only ${out.length} inputs; the walk is broken`);
  process.exit(2);
}
console.log(out.join("\n"));
