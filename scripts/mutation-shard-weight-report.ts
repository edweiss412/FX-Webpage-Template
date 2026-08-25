/**
 * What the source-mutation shard partition actually cost, against what the
 * weight model predicted it would.
 *
 * Every figure the weight-model spec cites is printed here, so no number in that
 * document is retyped from a session transcript.
 *
 * Usage, newest run first:
 *
 *   gh run download <id> -D <dir>/meas-<id> \
 *     -p 'mutation-records-source-shards-*' -p 'elapsed-source-shards-*'
 *   pnpm tsx scripts/mutation-shard-weight-report.ts \
 *     --run <dir>/meas-<newest>:<modelled-newest.json> \
 *     --run <dir>/meas-<older>:<modelled-older.json> \
 *     [--emit-registry]
 *
 * A run's modelled boots come from the registry AT THAT RUN'S SHA, which is why
 * each `--run` may name its own dump. Omitting the dump uses the checked-out
 * registry, which is correct only when the checkout IS that run's sha -- and
 * `reconcile` is what proves it rather than assuming it. A failed reconciliation
 * EXITS NONZERO before any counterfactual is printed: a comparison across two
 * trees is not a weaker result, it is a different question, and printing it
 * anyway is how a cross-tree number gets quoted as a measurement.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

import { type RunArtifacts, readRun } from "../lib/mutationWeight/records";
import {
  type ModelledBoots,
  type Snapshot,
  bindingLeg,
  driftReport,
  legSeconds,
  lpt,
  ratePerModelledBoot,
  reconcile,
  seamMagnitude,
  seedRates,
  verdictDelta,
} from "../lib/mutationWeight/weights";
import { GUARD_SURFACES } from "../tests/mutation/source/registry";
import { SOURCE_SHARD_COUNT, weightOf } from "../tests/mutation/source/shardPartition";

const N = SOURCE_SHARD_COUNT;

const row = (label: string, legs: readonly number[]): string =>
  `  ${label.padEnd(52)} [${legs.map((x) => String(Math.round(x))).join(", ")}]` +
  `  binding ${String(Math.round(bindingLeg(legs)))}s  spread ${(bindingLeg(legs) / Math.min(...legs)).toFixed(3)}x`;

function modelledFrom(file: string | undefined): ModelledBoots {
  if (file !== undefined) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, number>;
    return new Map(Object.entries(raw));
  }
  return new Map(GUARD_SURFACES.map((s) => [s.id, weightOf(s)]));
}

function parseRuns(argv: readonly string[]): { dir: string; modelledFile?: string }[] {
  const runs: { dir: string; modelledFile?: string }[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] !== "--run") continue;
    const spec = argv[i + 1];
    if (spec === undefined) throw new Error("--run needs <dir>[:<modelledJson>]");
    // rindex, so a Windows-style or absolute path with a colon earlier still splits
    // on the SEPARATOR rather than on the first colon it happens to contain.
    const cut = spec.lastIndexOf(":");
    const looksLikeJson = cut > 0 && spec.slice(cut + 1).endsWith(".json");
    runs.push(
      looksLikeJson
        ? { dir: spec.slice(0, cut), modelledFile: spec.slice(cut + 1) }
        : { dir: spec },
    );
  }
  return runs;
}

function describe(label: string, art: RunArtifacts, modelled: ModelledBoots): Snapshot {
  const { surfaces, elapsed } = art;
  console.log(`\n=== ${label} — ${String(surfaces.length)} surfaces ===`);

  const rec = reconcile(surfaces, modelled, N);
  if (!rec.ok) {
    console.error(
      `RECONCILIATION FAILED for ${label} — the records and the modelled weights are not one tree.` +
        (rec.recordOnly.length > 0 ? `\n  in the records only: ${rec.recordOnly.join(", ")}` : "") +
        (rec.modelOnly.length > 0 ? `\n  in the registry only: ${rec.modelOnly.join(", ")}` : "") +
        (rec.moved.length > 0
          ? `\n  observed on a different leg than recomputed: ${rec.moved
              .map(
                (m) =>
                  `${m.surfaceId} (ran on ${String(m.observed)}, recomputes to ${String(m.recomputed)})`,
              )
              .join(", ")}`
          : "") +
        `\n  Dump the registry's modelled boots at that run's own sha and pass it as --run <dir>:<file>.`,
    );
    process.exit(1);
  }
  console.log("  reconciliation: records and modelled weights agree on all surfaces and all legs");

  const observed = new Array<number>(N).fill(0);
  for (const m of surfaces) observed[m.leg] = (observed[m.leg] ?? 0) + m.seconds;
  console.log(row("OBSERVED (the partition CI actually ran)", observed));

  if (elapsed.size > 0) {
    const parts = [...elapsed]
      .sort((a, b) => a[0] - b[0])
      .map(([leg, secs]) => `${String(Math.round((100 * (observed[leg] ?? 0)) / secs))}%`);
    console.log(
      `  children explain ${parts.join(" / ")} of each leg's own elapsed.txt ` +
        `(${[...elapsed]
          .sort((a, b) => a[0] - b[0])
          .map(([, s]) => String(s))
          .join(" / ")}s)`,
    );
  } else {
    console.log("  elapsed-source-shards-* not downloaded, so leg coverage is UNMEASURED here");
  }

  const loads = new Array<number>(N).fill(0);
  for (const m of surfaces) loads[m.leg] = (loads[m.leg] ?? 0) + (modelled.get(m.surfaceId) ?? 0);
  console.log(row("  ...its MODELLED loads (what the optimiser balanced)", loads));

  const rates = surfaces
    .map((m) => ({ id: m.surfaceId, r: ratePerModelledBoot(m, modelled) }))
    .filter((x): x is { id: string; r: number } => x.r !== undefined);
  const lo = rates.reduce((a, b) => (b.r < a.r ? b : a));
  const hi = rates.reduce((a, b) => (b.r > a.r ? b : a));
  console.log(
    `  ms per MODELLED boot: min ${String(Math.round(lo.r))} (${lo.id})  max ${String(Math.round(hi.r))} (${hi.id})` +
      `  spread ${(hi.r / lo.r).toFixed(1)}x`,
  );
  const modelledTotal = [...modelled.values()].reduce((a, b) => a + b, 0);
  const observedTotal = surfaces.reduce((a, m) => a + m.observedBoots, 0);
  console.log(
    `  boots: modelled ${String(modelledTotal)} vs observed children ${String(observedTotal)} ` +
      `(${(observedTotal / modelledTotal).toFixed(2)}x) — the rate absorbs this, which is why it is calibrated per MODELLED boot`,
  );
  // The static alternatives, scored on the same target. A weight is only worth a
  // committed number if the numbers you can compute WITHOUT measuring lose to it.
  // Uniformly scaling modelled boots is not a distinct candidate: LPT is invariant
  // under a positive scale factor, so "boots x one global rate" IS the shipped
  // partition and is deliberately not listed as a third row.
  console.log(
    row(
      "  static proxy: mutant count alone",
      legSeconds(
        lpt(
          surfaces.map((m) => ({ key: m.surfaceId, w: m.mutants })),
          N,
        ),
        surfaces,
        N,
      ),
    ),
  );

  const cheapest = surfaces
    .filter((m) => m.childMillis.length > 0)
    .reduce((a, m) => a + Math.min(...m.childMillis), 0);
  console.log(
    `  one cheapest boot per surface totals ${String(Math.round(cheapest / 1000))}s ` +
      `(what a measure-at-partition-time pre-pass would cost)`,
  );
  return { label, surfaces, modelled };
}

function main(): void {
  const argv = process.argv.slice(2);
  const specs = parseRuns(argv);
  if (specs.length === 0)
    throw new Error("usage: --run <dir>[:<modelledJson>] [--run ...] [--emit-registry]");

  const snaps: Snapshot[] = specs.map((s) =>
    describe(basename(s.dir), readRun(s.dir), modelledFrom(s.modelledFile)),
  );

  if (snaps.length >= 2) {
    console.log(`\n=== HELD OUT: a rate seeded on one run, scored on a LATER one ===`);
    console.log(
      "  Scored on the LATER run's own seconds, so the seed never sees the run it is judged on.\n" +
        "  An arrival the seed run never saw is priced by its enrolling author, which is what the\n" +
        "  required field buys and what a bolt-on table cannot have.",
    );
    for (let i = 0; i < snaps.length - 1; i += 1) {
      const later = snaps[i] as Snapshot;
      const earlier = snaps[i + 1] as Snapshot;
      const seed = seedRates([earlier]);
      const weights = later.surfaces.map((m) => {
        const boots = later.modelled.get(m.surfaceId) ?? 0;
        const rate = seed.get(m.surfaceId) ?? ratePerModelledBoot(m, later.modelled) ?? 0;
        return { key: m.surfaceId, w: boots * rate };
      });
      const mine = legSeconds(lpt(weights, N), later.surfaces, N);
      const shipped = legSeconds(
        lpt(
          later.surfaces.map((m) => ({
            key: m.surfaceId,
            w: later.modelled.get(m.surfaceId) ?? 0,
          })),
          N,
        ),
        later.surfaces,
        N,
      );
      const arrivals = later.surfaces.filter((m) => !seed.has(m.surfaceId)).map((m) => m.surfaceId);
      console.log(`\n  seed ${earlier.label} -> score ${later.label}`);
      console.log(row("    seconds-calibrated weight", mine));
      console.log(row("    shipped modelled-boots weight", shipped));
      console.log(
        `    binding leg ${bindingLeg(mine) <= bindingLeg(shipped) ? "IMPROVED" : "REGRESSED"} by ` +
          `${String(Math.round(Math.abs(bindingLeg(shipped) - bindingLeg(mine))))}s` +
          `; arrivals priced by their author: ${arrivals.length > 0 ? arrivals.join(", ") : "none"}`,
      );
    }

    console.log(`\n=== VERDICTS across consecutive runs — the bar AC-1 has to clear ===`);
    for (let i = 0; i < snaps.length - 1; i += 1) {
      const later = snaps[i] as Snapshot;
      const earlier = snaps[i + 1] as Snapshot;
      const d = verdictDelta(earlier.surfaces, later.surfaces);
      console.log(
        `  ${earlier.label} -> ${later.label}: ${String(d.moved.length)} of ${String(d.sharedSiteIds)} shared siteIds moved ` +
          `across ${String(d.sharedSurfaces)} shared surfaces` +
          (d.moved.length > 0
            ? ` — ${d.moved.map((m) => `${m.surfaceId} ${m.siteId} ${m.from}->${m.to}`).join("; ")}`
            : ""),
      );
    }

    const newest = snaps[0] as Snapshot;
    const prior = snaps[1] as Snapshot;

    const seeded = seedRates([prior]);
    const proposed = new Map(
      newest.surfaces.map((m) => [
        m.surfaceId,
        (newest.modelled.get(m.surfaceId) ?? 0) *
          (seeded.get(m.surfaceId) ?? ratePerModelledBoot(m, newest.modelled) ?? 0),
      ]),
    );
    const seam = seamMagnitude(newest.modelled, proposed, N);
    console.log(
      `\n=== SEAM: ${String(seam.length)} of ${String(newest.modelled.size)} surfaces ` +
        `(${String(Math.round((100 * seam.length) / newest.modelled.size))}%) change leg under the new weight ===\n  ${seam.join(", ")}`,
    );
    const declared = seedRates([prior]);
    const { drifted, unmeasured } = driftReport(declared, newest.surfaces, newest.modelled, 2);
    console.log(
      `\n=== DRIFT of a ${prior.label} table against ${newest.label} — every surface, ranked ===`,
    );
    for (const d of drifted.slice(0, 8))
      console.log(
        `  ${d.actionable ? "ACTIONABLE" : "          "} ${d.surfaceId.padEnd(28)} ` +
          `declared ${String(d.declaredMillis).padStart(6)}ms  observed ${String(d.observedMillis).padStart(6)}ms  ${d.ratio.toFixed(2)}x`,
      );
    console.log(
      `  ...${String(Math.max(0, drifted.length - 8))} further surfaces named in full output; ` +
        `${String(drifted.filter((d) => d.actionable).length)} actionable, ` +
        `unmeasured: ${unmeasured.length > 0 ? unmeasured.join(", ") : "none"}`,
    );
  }

  if (argv.includes("--emit-registry")) {
    const seed = seedRates(snaps);
    const out = "millis-per-boot.json";
    writeFileSync(out, `${JSON.stringify(Object.fromEntries([...seed].sort()), null, 1)}\n`);
    const missing = GUARD_SURFACES.filter((s) => !seed.has(s.id)).map((s) => s.id);
    console.log(`\nwrote ${out} with ${String(seed.size)} rates`);
    if (missing.length > 0) {
      console.error(
        `ENROLLED BUT UNMEASURED, so no rate can be emitted for: ${missing.join(", ")}. ` +
          `Run the surface and read its rate, rather than guessing one.`,
      );
      process.exit(1);
    }
  }
}

main();
