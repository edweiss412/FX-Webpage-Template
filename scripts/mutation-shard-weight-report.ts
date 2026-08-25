/**
 * Reads the `mutation-records-source-shards-*` artifacts the nightly already
 * uploads and reports what the shard partition ACTUALLY cost, against what
 * `weightOf` modelled it would cost.
 *
 * Every figure the weight-model spec cites is printed by this script, so no
 * number in that document is retyped from a session transcript.
 *
 * Usage:
 *   gh run download <runId> -D <dir>/meas-<runId> -p 'mutation-records-source-shards-*'
 *   pnpm tsx scripts/mutation-shard-weight-report.ts <dir>/meas-<runId> [more dirs...]
 *
 * BOTH SIDES OF THE COMPARISON MUST BE ONE TREE. The modelled weights are
 * computed from the CHECKED-OUT registry, which is only the tree the records
 * came from when this runs at that run's own sha. `--modelled <file>` supplies
 * weights dumped at a different sha; the header always says which was used, so
 * a cross-tree reading cannot be made silently.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { basename, join } from "node:path";

import { GUARD_SURFACES } from "../tests/mutation/source/registry";
import { SOURCE_SHARD_COUNT, weightOf } from "../tests/mutation/source/shardPartition";

type Child = { durationMs: number };
type Outcome = { children?: readonly Child[] };
type Record_ = { surfaceId: string; outcomes: readonly Outcome[] };

/** What one surface cost, read off the run rather than modelled. */
export type Measured = {
  surfaceId: string;
  leg: number;
  mutants: number;
  boots: number;
  seconds: number;
};

export function readRun(dir: string): Measured[] {
  const out: Measured[] = [];
  for (const entry of readdirSync(dir)) {
    const m = /^mutation-records-source-shards-(\d+)$/.exec(entry);
    if (m === null) continue;
    const leg = Number(m[1]);
    for (const file of readdirSync(join(dir, entry))) {
      if (!file.endsWith(".json")) continue;
      const rec = JSON.parse(readFileSync(join(dir, entry, file), "utf8")) as Record_;
      const children = rec.outcomes.flatMap((o) => [...(o.children ?? [])]);
      out.push({
        surfaceId: rec.surfaceId,
        leg,
        mutants: rec.outcomes.length,
        boots: children.length,
        seconds: children.reduce((a, c) => a + c.durationMs, 0) / 1000,
      });
    }
  }
  return out;
}

/**
 * The same greedy LPT the harness uses, restated here over arbitrary weights so
 * a counterfactual weight can be scored without touching the shipped packer.
 * Tie-break on the key, so a rerun cannot report a different partition.
 */
export function lpt(items: readonly { key: string; w: number }[], n: number): Map<string, number> {
  const bins = new Array<number>(n).fill(0);
  const out = new Map<string, number>();
  for (const it of [...items].sort((a, b) => b.w - a.w || a.key.localeCompare(b.key))) {
    let best = 0;
    for (let i = 1; i < n; i += 1) if ((bins[i] ?? 0) < (bins[best] ?? 0)) best = i;
    bins[best] = (bins[best] ?? 0) + it.w;
    out.set(it.key, best);
  }
  return out;
}

/** Real seconds each leg would have run, had the partition been `assign`. */
export function legSeconds(
  assign: Map<string, number>,
  measured: readonly Measured[],
  n: number,
): number[] {
  const secs = new Map(measured.map((m) => [m.surfaceId, m.seconds]));
  const bins = new Array<number>(n).fill(0);
  for (const [id, leg] of assign) bins[leg] = (bins[leg] ?? 0) + (secs.get(id) ?? 0);
  return bins;
}

const spread = (b: readonly number[]): number => Math.max(...b) / Math.min(...b);
const row = (label: string, b: readonly number[]): string =>
  `  ${label.padEnd(56)} [${b.map((x) => String(Math.round(x))).join(", ")}]  spread ${spread(b).toFixed(3)}x  binding ${String(Math.round(Math.max(...b)))}s`;

function main(): void {
  const args = process.argv.slice(2);
  const mi = args.indexOf("--modelled");
  const modelledFile = mi >= 0 ? args[mi + 1] : undefined;
  // `mi + 1` is 0 when the flag is ABSENT, which silently ate the first
  // directory argument; the guard is what makes the exclusion conditional.
  const dirs = args.filter((a, i) => mi < 0 || (i !== mi && i !== mi + 1));
  if (dirs.length === 0)
    throw new Error("usage: mutation-shard-weight-report.ts <recordDir> [...]");

  const modelled = new Map<string, number>();
  if (modelledFile !== undefined && existsSync(modelledFile)) {
    for (const [k, v] of Object.entries(
      JSON.parse(readFileSync(modelledFile, "utf8")) as Record<string, number>,
    ))
      modelled.set(k, v);
    console.log(`modelled weights: ${modelledFile} (dumped at the records' own sha)`);
  } else {
    for (const s of GUARD_SURFACES) modelled.set(s.id, weightOf(s));
    console.log(
      "modelled weights: recomputed from the CHECKED-OUT registry — valid only at the records' sha",
    );
  }

  for (const dir of dirs) {
    const measured = readRun(dir);
    if (measured.length === 0) throw new Error(`no records under ${dir}`);
    const n = SOURCE_SHARD_COUNT;
    console.log(`\n=== ${basename(dir)} — ${String(measured.length)} surfaces ===`);

    const observed = new Array<number>(n).fill(0);
    for (const m of measured) observed[m.leg] = (observed[m.leg] ?? 0) + m.seconds;
    console.log(row("OBSERVED (the partition CI actually ran)", observed));

    const known = measured.filter((m) => modelled.has(m.surfaceId));
    if (known.length === measured.length) {
      const asModelled = lpt(
        known.map((m) => ({ key: m.surfaceId, w: modelled.get(m.surfaceId) ?? 0 })),
        n,
      );
      const drift = [...asModelled].filter(
        ([id, leg]) => measured.find((m) => m.surfaceId === id)?.leg !== leg,
      );
      console.log(
        `  reconciliation: recomputed partition vs observed legs — ${drift.length === 0 ? "IDENTICAL" : `${String(drift.length)} MISMATCH(ES): ${drift.map(([i]) => i).join(", ")}`}`,
      );
      const loads = new Array<number>(n).fill(0);
      for (const [id, leg] of asModelled) loads[leg] = (loads[leg] ?? 0) + (modelled.get(id) ?? 0);
      console.log(row("  ...its MODELLED loads (what the optimiser balanced)", loads));
    } else {
      console.log(
        `  reconciliation SKIPPED: ${String(measured.length - known.length)} surface(s) absent from the modelled set`,
      );
    }

    const bySeconds = lpt(
      measured.map((m) => ({ key: m.surfaceId, w: m.seconds })),
      n,
    );
    console.log(
      row("LPT over MEASURED SECONDS (the accurate weight)", legSeconds(bySeconds, measured, n)),
    );
    for (const [name, f] of [
      ["boots (count only)", (m: Measured) => m.boots],
      ["mutants (count only)", (m: Measured) => m.mutants],
    ] as const)
      console.log(
        row(
          `LPT over ${name}`,
          legSeconds(
            lpt(
              measured.map((m) => ({ key: m.surfaceId, w: f(m) })),
              n,
            ),
            measured,
            n,
          ),
        ),
      );

    const total = measured.reduce((a, m) => a + m.seconds, 0);
    const heaviest = measured.reduce((a, m) => (m.seconds > a.seconds ? m : a));
    console.log(
      `  corpus ${String(Math.round(total))}s; a perfectly balanced leg is ${String(Math.round(total / n))}s; ` +
        `the heaviest single surface (${heaviest.surfaceId}, ${String(Math.round(heaviest.seconds))}s) floors every partition`,
    );
    const rates = measured.filter((m) => m.boots > 0).map((m) => m.seconds / m.boots);
    console.log(
      `  seconds-per-boot: min ${Math.min(...rates).toFixed(2)}  max ${Math.max(...rates).toFixed(2)}  spread ${(Math.max(...rates) / Math.min(...rates)).toFixed(1)}x`,
    );
  }
}

main();
