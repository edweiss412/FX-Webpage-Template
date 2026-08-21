/**
 * probe-score-provenance.mts — the score's input set, DERIVED and hashed.
 *
 * The stamp's input set must EQUAL the score's input set. Deriving it from the registry
 * row's own `sourcePath` + `suitePaths` and their transitive LOCAL imports is what keeps
 * the two the same set; the four normative members the contract names outside that import
 * graph are UNIONED in, and the stamp ABORTS unless every one of them is present. An
 * asymmetric premise on purpose: a missing member is the failure, an extra one is benign.
 *
 * Printed INSIDE the measuring invocation, before and after, because a stamp taken beside
 * the run describes a tree that may have moved under it.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";

const ROOT = process.cwd();
const SURFACE_ID = "connectionCensus";

/** The members the contract names that no import edge reaches. */
const NORMATIVE = [
  "tests/mutation/source/registry.ts",
  "tests/mutation/source/expectedLedgerKinds.ts",
  "tests/mutation/source/operators.ts",
  "tests/mutation/_metaPremiseContract.test.ts",
];

const surface = GUARD_SURFACES.find((s) => s.id === SURFACE_ID);
if (surface === undefined) throw new Error(`${SURFACE_ID} is not enrolled; the stamp has no row to derive from`);

const SPECIFIER = /(?:from\s+|import\s*\(\s*)["']([^"']+)["']/g;

function resolveLocal(fromFile: string, specifier: string): string | null {
  let base: string | null = null;
  if (specifier.startsWith(".")) base = resolve(dirname(join(ROOT, fromFile)), specifier);
  else if (specifier.startsWith("@/")) base = join(ROOT, specifier.slice(2));
  if (base === null) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.mts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate)) return relative(ROOT, candidate);
  }
  return null;
}

const seen = new Set<string>();
const queue = [surface.sourcePath, ...surface.suitePaths];
while (queue.length > 0) {
  const file = queue.pop()!;
  if (seen.has(file)) continue;
  seen.add(file);
  const source = readFileSync(join(ROOT, file), "utf8");
  for (const match of source.matchAll(SPECIFIER)) {
    const target = resolveLocal(file, match[1]!);
    if (target !== null && !seen.has(target)) queue.push(target);
  }
}
for (const member of NORMATIVE) seen.add(member);

const missing = [surface.sourcePath, ...surface.suitePaths, ...NORMATIVE].filter((f) => !seen.has(f));
if (missing.length > 0) throw new Error(`stamp ABORTS — derived set omits: ${missing.join(", ")}`);
if (seen.size < 10) throw new Error(`stamp ABORTS — derived set has ${seen.size} files, below the floor of 10`);

const files = [...seen].sort();
const lines = files.map((f) => {
  const digest = createHash("sha256").update(readFileSync(join(ROOT, f))).digest("hex").slice(0, 16);
  return `${digest}  ${f}`;
});
const blob = createHash("sha256").update(lines.join("\n")).digest("hex").slice(0, 16);
console.log(`SCORE INPUT SET (${files.length} files, blob ${blob})`);
for (const line of lines) console.log(`  ${line}`);
