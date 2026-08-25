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

/**
 * The rate a surface actually charged: seconds of child wall clock per boot.
 * Zero-boot surfaces have no rate at all rather than a rate of zero, so they are
 * excluded from every rate statistic instead of dragging one toward the floor.
 */
export const rateOf = (m: Measured): number | undefined =>
  m.boots > 0 ? m.seconds / m.boots : undefined;

const median = (xs: readonly number[]): number => {
  const v = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 === 1 ? (v[mid] ?? 0) : ((v[mid - 1] ?? 0) + (v[mid] ?? 0)) / 2;
};

/**
 * What a table measured on an OLDER run would produce if applied to the current
 * corpus. This is the whole staleness question, and its answer turns almost
 * entirely on what a surface the old run never saw is priced at -- so the
 * fallback is a parameter here rather than a hidden choice.
 */
export function stalenessRows(
  current: readonly Measured[],
  older: readonly Measured[],
  n: number,
): { label: string; legs: number[] }[] {
  const old = new Map(older.map((m) => [m.surfaceId, m]));
  const oldRates = older.map(rateOf).filter((r): r is number => r !== undefined);
  const maxSeconds = Math.max(...older.map((m) => m.seconds));
  const fallbacks: { label: string; f: (m: Measured) => number }[] = [
    { label: "unmeasured priced at the heaviest measured surface", f: () => maxSeconds },
    {
      label: "unmeasured priced at the median rate x its boots",
      f: (m) => median(oldRates) * m.boots,
    },
    {
      label: "unmeasured priced at the MAX rate x its boots",
      f: (m) => Math.max(...oldRates) * m.boots,
    },
  ];
  return fallbacks.map(({ label, f }) => ({
    label,
    legs: legSeconds(
      lpt(
        current.map((m) => ({ key: m.surfaceId, w: old.get(m.surfaceId)?.seconds ?? f(m) })),
        n,
      ),
      current,
      n,
    ),
  }));
}

/**
 * The ratified design under a maintenance regime: every surface carries a rate
 * (so an arrival is never unpriced), the rate is the older run's, and a rate
 * that drifted past `threshold` has been refreshed. `Infinity` is the
 * never-maintained floor -- the worst case the design can produce.
 */
export function declaredRateRows(
  current: readonly Measured[],
  older: readonly Measured[],
  n: number,
  thresholds: readonly number[],
): { label: string; refreshed: number; legs: number[] }[] {
  const old = new Map(older.map((m) => [m.surfaceId, m]));
  return thresholds.map((t) => {
    let refreshed = 0;
    const weights = current.map((m) => {
      const now = rateOf(m) ?? 0;
      const prev = old.has(m.surfaceId)
        ? (rateOf(old.get(m.surfaceId) as Measured) ?? 0)
        : undefined;
      // A surface the old run never saw is measured by its ENROLLING AUTHOR, not
      // guessed -- that requirement is the design, so the simulation must honour it.
      if (prev === undefined || prev <= 0 || now <= 0)
        return { key: m.surfaceId, w: m.boots * now };
      const moved = Math.max(prev, now) / Math.min(prev, now);
      if (moved > t) refreshed += 1;
      return { key: m.surfaceId, w: m.boots * (moved > t ? now : prev) };
    });
    return {
      label: `declared rate, drift alarm at ${t === Infinity ? "never refreshed" : `${String(t)}x`}`,
      refreshed,
      legs: legSeconds(lpt(weights, n), current, n),
    };
  });
}

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
    const rates = measured.map(rateOf).filter((r): r is number => r !== undefined);
    console.log(
      `  seconds-per-boot: min ${Math.min(...rates).toFixed(2)}  max ${Math.max(...rates).toFixed(2)}  spread ${(Math.max(...rates) / Math.min(...rates)).toFixed(1)}x`,
    );
  }

  // With two or more runs, the first is "now" and the second is the table a
  // weight model would have been carrying. Every row is scored on NOW's real
  // seconds, so the weight is the only thing that varies between them.
  if (dirs.length >= 2) {
    const current = readRun(dirs[0] as string);
    const older = readRun(dirs[1] as string);
    const n = SOURCE_SHARD_COUNT;
    const unseen = current.filter((m) => !older.some((o) => o.surfaceId === m.surfaceId));
    console.log(
      `\n=== a table from ${basename(dirs[1] as string)} applied to ${basename(dirs[0] as string)} ===` +
        `\n  surfaces the older run never saw: ${unseen.length === 0 ? "none" : unseen.map((m) => `${m.surfaceId} (${String(Math.round(m.seconds))}s)`).join(", ")}`,
    );
    for (const r of stalenessRows(current, older, n))
      console.log(row(`bolt-on table, ${r.label}`, r.legs));
    for (const r of declaredRateRows(current, older, n, [1.25, 1.5, 2, Infinity]))
      console.log(row(`${r.label} (${String(r.refreshed)} refreshed)`, r.legs));
  }
}

main();
