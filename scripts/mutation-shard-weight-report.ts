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
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { type RunArtifacts, readRun } from "../lib/mutationWeight/records";
import {
  type ModelledBoots,
  type ModelledSurface,
  type Snapshot,
  bindingLeg,
  bootCountHistory,
  buildSeedTable,
  bootRatioStability,
  driftReport,
  heldOutMargin,
  legSeconds,
  lpt,
  median,
  ratePerModelledBoot,
  reconcile,
  seamMagnitude,
  seedRates,
  suiteMedians,
  verdictDelta,
} from "../lib/mutationWeight/weights";
import { GUARD_SURFACES } from "../tests/mutation/source/registry";
import { SOURCE_SHARD_COUNT, bootsOf } from "../tests/mutation/source/shardPartition";

const N = SOURCE_SHARD_COUNT;

/** Set by --emit-registry; see the note at its call site. */
let REPORT_TO_STDERR = false;
const say = (line: string): void => {
  if (REPORT_TO_STDERR) process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

const row = (label: string, legs: readonly number[]): string =>
  `  ${label.padEnd(52)} [${legs.map((x) => String(Math.round(x))).join(", ")}]` +
  `  binding ${String(Math.round(bindingLeg(legs)))}s  spread ${(bindingLeg(legs) / Math.min(...legs)).toFixed(3)}x`;

type Dump = { sha: string; surfaces: Record<string, ModelledSurface> };

/** The dump AND the sha it was taken at, which is not recoverable from its path. */
function modelledFrom(file: string | undefined): { modelled: ModelledBoots; sha: string } {
  if (file !== undefined) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Dump;
    if (typeof raw.sha !== "string" || raw.sha.length === 0 || raw.surfaces === undefined) {
      // A dump without a sha cannot be grouped, and guessing one from the filename
      // is what this replaced: two dumps of one tree under different names would
      // not be medianed, and one name reused across trees would group unrelated
      // dumps. Refused rather than defaulted.
      throw new Error(`${file}: not a weight dump — expected { sha, surfaces }`);
    }
    return { modelled: new Map(Object.entries(raw.surfaces)), sha: raw.sha };
  }
  // The checked-out registry. This wants BOOTS, so it calls `bootsOf` and not
  // `weightOf` — the two returned the same number until the rate landed, and a
  // consumer that reads a priced weight as a boot count derives a mutant total
  // that is wrong by a factor of the rate. Recovering the parts from the
  // surface's own fields is what makes the reconciliation able to say so.
  return {
    sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    modelled: new Map(
      GUARD_SURFACES.map((s) => {
        const boots = bootsOf(s);
        const suites = s.suitePaths.length;
        return [
          s.id,
          {
            boots,
            mutants: boots - s.accepted.length * (suites - 1) - suites,
            accepted: s.accepted.length,
            suites,
          },
        ];
      }),
    ),
  };
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

function describe(
  label: string,
  sha: string,
  art: RunArtifacts,
  modelled: ModelledBoots,
): Snapshot {
  const { surfaces, elapsed } = art;
  say(`\n=== ${label} — ${String(surfaces.length)} surfaces ===`);

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
        (rec.duplicated.length > 0
          ? `\n  more than one record for: ${rec.duplicated.join(", ")}`
          : "") +
        (rec.weightDisagreement.length > 0
          ? `\n  the dump and the records disagree about the weight's own parts: ${rec.weightDisagreement
              .map(
                (w) =>
                  `${w.surfaceId} ${w.field} modelled ${String(w.modelled)} vs observed ${String(w.observed)}`,
              )
              .join(", ")}`
          : "") +
        `\n  Dump the registry's modelled boots at that run's own sha and pass it as --run <dir>:<file>.`,
    );
    process.exit(1);
  }
  say("  reconciliation: records and modelled weights agree on all surfaces and all legs");

  const observed = new Array<number>(N).fill(0);
  for (const m of surfaces) observed[m.leg] = (observed[m.leg] ?? 0) + m.seconds;
  say(row("OBSERVED (the partition CI actually ran)", observed));

  if (elapsed.size > 0) {
    const parts = [...elapsed]
      .sort((a, b) => a[0] - b[0])
      .map(([leg, secs]) => `${String(Math.round((100 * (observed[leg] ?? 0)) / secs))}%`);
    say(
      `  children explain ${parts.join(" / ")} of each leg's own elapsed.txt ` +
        `(${[...elapsed]
          .sort((a, b) => a[0] - b[0])
          .map(([, s]) => String(s))
          .join(" / ")}s)`,
    );
  } else {
    say("  elapsed-source-shards-* not downloaded, so leg coverage is UNMEASURED here");
  }

  const loads = new Array<number>(N).fill(0);
  for (const m of surfaces)
    loads[m.leg] = (loads[m.leg] ?? 0) + (modelled.get(m.surfaceId)?.boots ?? 0);
  say(row("  ...its MODELLED loads (what the optimiser balanced)", loads));

  const rates = surfaces
    .map((m) => ({ id: m.surfaceId, r: ratePerModelledBoot(m, modelled) }))
    .filter((x): x is { id: string; r: number } => x.r !== undefined);
  const lo = rates.reduce((a, b) => (b.r < a.r ? b : a));
  const hi = rates.reduce((a, b) => (b.r > a.r ? b : a));
  say(
    `  ms per MODELLED boot: min ${String(Math.round(lo.r))} (${lo.id})  max ${String(Math.round(hi.r))} (${hi.id})` +
      `  spread ${(hi.r / lo.r).toFixed(1)}x`,
  );
  const modelledTotal = [...modelled.values()].reduce((a, b) => a + b.boots, 0);
  const observedTotal = surfaces.reduce((a, m) => a + m.observedBoots, 0);
  say(
    `  boots: modelled ${String(modelledTotal)} vs observed children ${String(observedTotal)} ` +
      `(${(observedTotal / modelledTotal).toFixed(2)}x) — the rate absorbs this, which is why it is calibrated per MODELLED boot`,
  );
  // The static alternatives, scored on the same target. A weight is only worth a
  // committed number if the numbers you can compute WITHOUT measuring lose to it.
  // Uniformly scaling modelled boots is not a distinct candidate: LPT is invariant
  // under a positive scale factor, so "boots x one global rate" IS the shipped
  // partition and is deliberately not listed as a third row.
  say(
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
    .filter((m) => m.children.length > 0)
    .reduce((a, m) => a + Math.min(...m.children.map((c) => c.durationMs)), 0);
  say(
    `  one cheapest boot per surface totals ${String(Math.round(cheapest / 1000))}s ` +
      `(what a measure-at-partition-time pre-pass would cost)`,
  );
  return { label, sha, surfaces, modelled };
}

function main(): void {
  const argv = process.argv.slice(2);
  const specs = parseRuns(argv);
  if (specs.length === 0)
    throw new Error("usage: --run <dir>[:<modelledJson>] [--run ...] [--emit-registry]");

  // With --emit-registry the REPORT goes to stderr so stdout carries the JSON and
  // nothing else. A consumer piping this into a file should get a table, not a
  // table with a report glued to the front of it.
  REPORT_TO_STDERR = argv.includes("--emit-registry");
  const snaps: Snapshot[] = specs.map((s) => {
    const { modelled, sha } = modelledFrom(s.modelledFile);
    return describe(basename(s.dir), sha, readRun(s.dir), modelled);
  });

  if (snaps.length >= 2) {
    say(`\n=== HELD OUT: a rate seeded on one run, scored on a LATER one ===`);
    say(
      "  Scored on the LATER run's own seconds, so the seed never sees the run it is judged on.\n" +
        "  An arrival the seed run never saw is EXCLUDED from both sides and named below. In\n" +
        "  production its enrolling author measures it, and that measurement is not\n" +
        "  reconstructible after the fact -- pricing it from the scored run's own rate would\n" +
        "  make the surface score itself.",
    );
    for (let i = 0; i < snaps.length - 1; i += 1) {
      const later = snaps[i] as Snapshot;
      const earlier = snaps[i + 1] as Snapshot;
      const seed = seedRates([earlier]);
      // A surface the SEED run never saw has no held-out rate, and there is no
      // honest way to invent one: falling back to the later run's OWN rate makes
      // boots x rate reproduce that run's seconds exactly, so the surface scores
      // itself. An earlier version did exactly that and quietly contaminated two of
      // three pairs. Such surfaces are EXCLUDED from both sides of the comparison
      // and named, rather than priced circularly and counted.
      // The comparison itself lives in `heldOutMargin`, shared with the suite that
      // pins AC-3, so the figures below and the assertion there cannot drift apart.
      const {
        scored,
        excluded,
        seconds: mine,
        boots: shipped,
      } = heldOutMargin(seed, later.surfaces, later.modelled, N);
      say(
        `\n  seed ${earlier.label} -> score ${later.label}  (${String(scored.length)} surfaces scored)`,
      );
      say(row("    seconds-calibrated weight", mine));
      say(row("    shipped modelled-boots weight", shipped));
      say(
        `    binding leg ${bindingLeg(mine) <= bindingLeg(shipped) ? "IMPROVED" : "REGRESSED"} by ` +
          `${String(Math.round(Math.abs(bindingLeg(shipped) - bindingLeg(mine))))}s` +
          `; EXCLUDED as unpriceable held-out: ` +
          (excluded.length > 0
            ? excluded
                .map((id) => {
                  const m = later.surfaces.find((x) => x.surfaceId === id);
                  return `${id} (${String(Math.round(m?.seconds ?? 0))}s)`;
                })
                .join(", ")
            : "none"),
      );
    }

    say(`\n=== VERDICTS across consecutive runs — the bar AC-1 has to clear ===`);
    for (let i = 0; i < snaps.length - 1; i += 1) {
      const later = snaps[i] as Snapshot;
      const earlier = snaps[i + 1] as Snapshot;
      const d = verdictDelta(earlier.surfaces, later.surfaces);
      say(
        `  ${earlier.label} -> ${later.label}: ${String(d.moved.length)} of ${String(d.sharedSiteIds)} shared siteIds moved ` +
          `across ${String(d.sharedSurfaces)} shared surfaces` +
          (d.moved.length > 0
            ? ` — ${d.moved.map((m) => `${m.surfaceId} ${m.siteId} ${m.from}->${m.to}`).join("; ")}`
            : ""),
      );
    }

    const newest = snaps[0] as Snapshot;
    const prior = snaps[1] as Snapshot;

    // The seam asks what happens WHEN THIS SHIPS, so it uses the table that would
    // ship: `seedRates` over every snapshot, newest first. That is not the held-out
    // question and must not borrow its rule -- at ship time the required field
    // guarantees every surface has a rate, including the newest one.
    const shipping = seedRates(snaps);
    const proposed = new Map(
      newest.surfaces.map((m) => [
        m.surfaceId,
        (newest.modelled.get(m.surfaceId)?.boots ?? 0) * (shipping.get(m.surfaceId) ?? 0),
      ]),
    );
    const seam = seamMagnitude(
      new Map([...newest.modelled].map(([k, v]) => [k, v.boots])),
      proposed,
      N,
    );
    say(
      `\n=== SEAM: ${String(seam.length)} of ${String(newest.modelled.size)} surfaces ` +
        `(${String(Math.round((100 * seam.length) / newest.modelled.size))}%) change leg under the new weight ===\n  ${seam.join(", ")}`,
    );
    const declared = seedRates([prior]);
    const { drifted, unmeasured, undeclared } = driftReport(
      declared,
      newest.surfaces,
      newest.modelled,
      2,
    );
    say(
      `\n=== DRIFT of a ${prior.label} table against ${newest.label} — every surface, ranked ===`,
    );
    // EVERY row. An earlier version printed eight and said the rest were "named in
    // full output", which was simply untrue: there was no fuller output anywhere.
    for (const d of drifted)
      say(
        `  ${d.actionable ? "ACTIONABLE" : "          "} ${d.surfaceId.padEnd(28)} ` +
          `declared ${String(d.declaredMillis).padStart(6)}ms  observed ${String(d.observedMillis).padStart(6)}ms  ${d.ratio.toFixed(2)}x`,
      );
    say(
      `  ${String(drifted.length)} surfaces named, ${String(drifted.filter((d) => d.actionable).length)} actionable; ` +
        `declared but unmeasured: ${unmeasured.length > 0 ? unmeasured.join(", ") : "none"}; ` +
        `measured but undeclared: ${undeclared.length > 0 ? undeclared.join(", ") : "none"}`,
    );
  }

  if (snaps.length >= 2) {
    // PROVENANCE. Every remaining artifact-derived claim in the spec is printed
    // here, so "one command prints every figure" is a fact about this file rather
    // than an aspiration. A claim with no line in this block does not belong in
    // the document.
    say(`\n=== PROVENANCE ===`);
    const stab = bootRatioStability(snaps, 1.05);
    say(
      `  observed/modelled boot ratio, newest run: min ${stab.latest.min.toFixed(2)} ` +
        `median ${stab.latest.median.toFixed(2)} max ${stab.latest.max.toFixed(2)} (${stab.latest.maxSurface})`,
    );
    say(
      `  ratio moved by >5% across ${String(snaps.length)} runs, oldest first: ${String(stab.moved.length)} surface(s)` +
        (stab.moved.length > 0
          ? ` — ${stab.moved.map((x) => `${x.surfaceId} ${x.ratios.map((r) => r.toFixed(2)).join("->")}`).join(", ")}`
          : ""),
    );
    const hist = bootCountHistory(snaps);
    say(
      `  modelled boot count moved or arrived, oldest-first: ${String(hist.changed.length)} surface(s)` +
        (hist.changed.length > 0
          ? `\n${hist.changed.map((c) => `    ${c.surfaceId.padEnd(26)} ${c.boots.map((b) => (b === undefined ? "-" : String(b))).join(" ")}`).join("\n")}`
          : ""),
    );
    say(
      `  of those, ARRIVALS (unpriceable by a bolt-on table): ${hist.arrived.join(", ") || "none"}`,
    );

    // The seed rule that was measured and rejected, scored on the same target as
    // the shipped one above. A declined alternative with no number beside it is an
    // assertion; with one it is a decision.
    const newestSnap = snaps[0] as Snapshot;
    const priorSnaps = snaps.slice(1);
    if (priorSnaps.length >= 2) {
      const timeMedian = new Map<string, number>();
      for (const m of newestSnap.surfaces) {
        const rates = priorSnaps
          .map((sn) => {
            const found = sn.surfaces.find((x) => x.surfaceId === m.surfaceId);
            return found === undefined ? undefined : ratePerModelledBoot(found, sn.modelled);
          })
          .filter((r): r is number => r !== undefined)
          .sort((a, b) => a - b);
        if (rates.length > 0) timeMedian.set(m.surfaceId, median(rates));
      }
      const scoredByTimeMedian = newestSnap.surfaces.filter((m) => timeMedian.has(m.surfaceId));
      say(
        row(
          "  DECLINED seed rule: median across ALL prior runs",
          legSeconds(
            lpt(
              scoredByTimeMedian.map((m) => ({
                key: m.surfaceId,
                w:
                  (newestSnap.modelled.get(m.surfaceId)?.boots ?? 0) *
                  (timeMedian.get(m.surfaceId) ?? 0),
              })),
              N,
            ),
            scoredByTimeMedian,
            N,
          ),
        ),
      );
    }

    // L-5's evidence: the per-suite breakdown for whatever drifted worst.
    const worst = driftReport(
      seedRates([snaps[1] as Snapshot]),
      newestSnap.surfaces,
      newestSnap.modelled,
      2,
    )
      .drifted.filter((d) => d.actionable)
      .slice(0, 1);
    for (const d of worst) {
      for (const [label, sn] of [
        ["newest", snaps[0]],
        ["prior", snaps[1]],
      ] as const) {
        const m = (sn as Snapshot).surfaces.find((x) => x.surfaceId === d.surfaceId);
        if (m === undefined) continue;
        const timeouts = m.children.filter((c) => c.kind === "timeout").length;
        say(
          `  ${d.surfaceId} @ ${label}: ${String(m.mutants)} mutants, ${String(timeouts)} timeout children; ` +
            suiteMedians(m)
              .map((x) => `${x.suite} median ${String(x.medianMs)}ms over ${String(x.children)}`)
              .join("; "),
        );
      }
    }
  }

  if (argv.includes("--emit-registry")) {
    // `--seed-rate <id>=<millis>`, repeatable: the bootstrap for a surface enrolled
    // since the last nightly, which therefore has no records to be priced from. Stated
    // explicitly rather than defaulted, because a guessed rate is indistinguishable
    // from a measured one once it is in the table.
    const overrides = new Map<string, number>();
    for (let i = 0; i < argv.length; i += 1) {
      if (argv[i] !== "--seed-rate") continue;
      const spec = argv[i + 1] ?? "";
      const eq = spec.indexOf("=");
      const id = eq < 0 ? "" : spec.slice(0, eq);
      const millis = Number(spec.slice(eq + 1));
      if (id === "" || !Number.isInteger(millis) || millis <= 0) {
        console.error(
          `--seed-rate expects <id>=<positive integer millis>, got "${spec}". Nothing was written.`,
        );
        process.exit(1);
      }
      overrides.set(id, millis);
    }

    // Completeness is judged by `buildSeedTable` over the MERGED table, and writing
    // happens only after it says ok. Writing and then failing leaves on disk the exact
    // partial table this refuses to emit, and the next reader cannot tell it apart from
    // a complete one.
    const built = buildSeedTable(
      seedRates(snaps),
      overrides,
      GUARD_SURFACES.map((s) => s.id),
    );
    if (!built.ok) {
      if (built.unmatched.length > 0) {
        console.error(
          `--seed-rate names no such surface: ${built.unmatched.join(", ")}. ` +
            `Check the spelling against the registry. Nothing was written.`,
        );
      }
      if (built.missing.length > 0) {
        console.error(
          `ENROLLED BUT UNMEASURED, so no rate can be emitted for: ${built.missing.join(", ")}. ` +
            `Run the surface and read its rate, rather than guessing one. Nothing was written.`,
        );
      }
      process.exit(1);
    }
    // stdout, not a file in whatever directory the caller happened to be in.
    process.stdout.write(
      `${JSON.stringify(Object.fromEntries([...built.table].sort()), null, 1)}\n`,
    );
  }
}

main();
