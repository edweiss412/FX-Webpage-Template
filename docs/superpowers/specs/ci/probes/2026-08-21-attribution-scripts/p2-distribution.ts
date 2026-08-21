/**
 * PROBE 2a — healthy per-child wall clock for EVERY enrolled surface, against
 * the 180s ceiling. One UNMUTATED child per (surface, suite): full population
 * rather than a sample, at one child each instead of one per mutant.
 *
 * WHAT THIS IS AND IS NOT (rule 12): a baseline child is a HEALTHY child, so
 * this is a LOWER BOUND on healthy duration and is NOT a basis for certifying
 * the ceiling. It answers "how close does a healthy child get to 180s", over
 * the whole population, and it names the tail that probe 2b then measures per
 * mutant.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";
import { MUTANT_TIMEOUT_MS } from "../../../../../../tests/mutation/source/spawnBounded";
import { type ChildRecord, runSuiteRecorded } from "./instrument";

const root = process.cwd();
const rows: { surface: string; suite: string; ms: number; exit: number; kind: string }[] = [];

const registryBlob = execFileSync("git", ["rev-parse", "HEAD:tests/mutation/source/registry.ts"], {
  cwd: root,
  encoding: "utf8",
}).trim();
console.log(`STAMP registry=${registryBlob.slice(0, 8)}  surfaces=${GUARD_SURFACES.length}`);

for (const surface of GUARD_SURFACES) {
  const target = resolve(root, surface.sourcePath);
  let text: string;
  try {
    text = readFileSync(target, "utf8");
  } catch {
    console.log(`SKIP ${surface.id}: source unreadable at ${surface.sourcePath}`);
    continue;
  }
  const scratch = mkdtempSync(join(tmpdir(), "fx-p2-"));
  const mutantFile = join(scratch, "mutant.ts");
  try {
    writeFileSync(mutantFile, text);
    for (const suite of surface.suitePaths) {
      const sink: ChildRecord[] = [];
      let exit = -1;
      try {
        exit = runSuiteRecorded(root, target, mutantFile, suite, `${surface.id}:BASELINE`, sink);
      } catch (e) {
        console.log(`  INFRA ${surface.id} [${suite}]: ${(e as Error).message}`);
      }
      const r = sink[sink.length - 1];
      if (!r) continue;
      rows.push({ surface: surface.id, suite, ms: r.durationMs, exit, kind: r.kind });
      console.log(`  ${(r.durationMs / 1000).toFixed(1)}s  exit=${exit}  ${surface.id}  [${suite}]`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// Rule 47: state the population size beside every number.
console.log(`\n================ DISTRIBUTION (n=${rows.length} children over ${new Set(rows.map((r) => r.surface)).size} surfaces) ================`);
if (rows.length === 0) {
  console.log("ABORT: empty population — a clean zero over nothing is not a pass.");
  process.exit(1);
}
const sorted = [...rows].sort((a, b) => a.ms - b.ms);
const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
console.log(`min    ${(sorted[0]!.ms / 1000).toFixed(1)}s  (${sorted[0]!.surface})`);
console.log(`median ${(at(0.5).ms / 1000).toFixed(1)}s`);
console.log(`p90    ${(at(0.9).ms / 1000).toFixed(1)}s`);
console.log(`max    ${(sorted[sorted.length - 1]!.ms / 1000).toFixed(1)}s  (${sorted[sorted.length - 1]!.surface})`);
console.log(`ceiling ${(MUTANT_TIMEOUT_MS / 1000).toFixed(1)}s — margin at the max: ${(MUTANT_TIMEOUT_MS / sorted[sorted.length - 1]!.ms).toFixed(1)}x`);
console.log(`children at or past the ceiling: ${rows.filter((r) => r.kind === "timeout").length}`);
console.log(`\nTOP 8 (the tail probe 2b should measure per mutant):`);
for (const r of sorted.slice(-8).reverse()) console.log(`  ${(r.ms / 1000).toFixed(1)}s  ${r.surface}`);
console.log(`\nnon-green baselines (would score every mutant KILLED): ${JSON.stringify(rows.filter((r) => r.exit !== 0).map((r) => r.surface))}`);
