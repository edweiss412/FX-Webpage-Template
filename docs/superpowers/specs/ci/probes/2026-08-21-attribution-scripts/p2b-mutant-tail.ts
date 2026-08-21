/**
 * PROBE 2b — per-MUTANT child durations on the WORST-PLACED surface.
 *
 * Probe 2a measured BASELINE children, which is a lower bound on healthy
 * duration and NOT a distance to the ceiling: a mutant that makes a suite spin
 * rather than hang is exactly the case the timeout hypothesis is about. This
 * measures every mutant child on `ledgerGit` — worst headroom in the population
 * at 7.4x — so the tail is measured rather than extrapolated.
 */
import { execFileSync } from "node:child_process";
import { GUARD_SURFACES } from "../../../../../../tests/mutation/source/registry";
import { MUTANT_TIMEOUT_MS } from "../../../../../../tests/mutation/source/spawnBounded";
import { runSurfaceRecorded } from "./instrument";

const root = process.cwd();
const id = process.env.PROBE_SURFACE ?? "ledgerGit";
const surface = GUARD_SURFACES.find((s) => s.id === id);
if (!surface) throw new Error(`surface ${id} not in registry`);

// Rule 30/56: stamp the score's inputs INSIDE the measured invocation, before AND after.
const inputs = ["HEAD:" + surface.sourcePath, ...surface.suitePaths.map((p) => "HEAD:" + p), "HEAD:tests/mutation/source/registry.ts", "HEAD:tests/mutation/source/operators.ts"];
const stampNow = () => execFileSync("git", ["rev-parse", ...inputs], { cwd: root, encoding: "utf8" }).trim();
const before = stampNow();
console.log(`STAMP BEFORE (${inputs.length} inputs):\n${before}`);

const t0 = Date.now();
const run = runSurfaceRecorded(root, surface);
const wall = Date.now() - t0;

const after = stampNow();
console.log(`STAMP AFTER identical: ${before === after}`);

const d = run.records.map((r) => r.durationMs).sort((a, b) => a - b);
const timeouts = run.records.filter((r) => r.kind === "timeout");
console.log(`\n=== ${id}: ${run.mutantCount} mutants, ${run.records.length} children, ${(wall / 1000 / 60).toFixed(1)} min ===`);
console.log(`killed=${run.killed} survivors=${run.survivors.length}`);
console.log(`child duration (s): min ${(d[0]! / 1000).toFixed(1)}  median ${(d[Math.floor(d.length / 2)]! / 1000).toFixed(1)}  max ${(d[d.length - 1]! / 1000).toFixed(1)}`);
console.log(`ceiling ${MUTANT_TIMEOUT_MS / 1000}s — headroom at the measured MUTANT max: ${(MUTANT_TIMEOUT_MS / d[d.length - 1]!).toFixed(1)}x`);
console.log(`TIMEOUTS AMONG THESE KILLS: ${timeouts.length} of ${run.killed}`);
console.log(`slowest 10 children (s): ${d.slice(-10).map((x) => (x / 1000).toFixed(1)).join(", ")}`);
console.log(`survivors: ${JSON.stringify(run.survivors)}`);
