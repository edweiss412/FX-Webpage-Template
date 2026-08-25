/**
 * Reading what a mutation-harness run actually cost, from the artifacts the
 * nightly already uploads.
 *
 * Two artifact families, and they answer different questions. The
 * `mutation-records-source-shards-*` records carry per-mutant child durations,
 * which is the only place per-SURFACE cost exists. The `elapsed-source-shards-*`
 * stamps carry each leg's whole wall clock, which is what the budget check reads
 * and the only way to say how much of a leg the children explain.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** One child process the runner spawned, as `runMutantRecorded` recorded it. */
export type Child = { suite: string; kind: "exit" | "timeout"; durationMs: number };
type Outcome = { siteId: string; verdict: string; children?: readonly Child[] };
type RunRecordFile = {
  surfaceId: string;
  runId: string;
  /** ISO instant the surface started. Present in every artifact this reads. */
  startedAt?: string;
  passed: boolean;
  score: number;
  outcomes: readonly Outcome[];
};

/**
 * What one surface cost on one run.
 *
 * `observedBoots` is deliberately NOT called `boots`. The partition weighs
 * MODELLED boots, and the two are not the same number -- measured 1.31x apart
 * across the corpus and 4.60x apart on `paneCompactionCore`, because the model
 * prices a killed mutant at one boot while a mutant killed by the sixth suite
 * really spawned six. Conflating them makes `boots * rate` reproduce the seconds
 * it was derived from, which is a tautology rather than a measurement.
 */
export type Measured = {
  surfaceId: string;
  leg: number;
  mutants: number;
  observedBoots: number;
  seconds: number;
  /**
   * Every child, kept whole rather than reduced to a duration.
   *
   * `suite` and `kind` are retained deliberately. An earlier version kept only
   * `durationMs`, which made the per-suite breakdown behind documented limit L-5
   * unrecoverable after parsing, and left the DISTINCT SUITE COUNT -- the one
   * observable that can tell a weight change apart from a suite-list change --
   * uncomputable.
   */
  children: Child[];
  verdicts: ReadonlyMap<string, string>;
  passed: boolean;
};

export type RunArtifacts = {
  surfaces: Measured[];
  /**
   * The LATEST `startedAt` any record in this run carries, as an epoch millisecond.
   *
   * Surfaced so a caller comparing several runs can VERIFY the chronology it assumes
   * rather than trusting argument order. `undefined` when no record carried a parseable
   * stamp, which is a real state for a hand-built fixture and must be distinguishable
   * from "ran at the epoch".
   */
  startedAt?: number;
  /** leg index -> the seconds that leg stamped into its own `elapsed.txt`. */
  elapsed: Map<number, number>;
};

const RECORD_DIR = /^mutation-records-source-shards-(\d+)$/;
const ELAPSED_DIR = /^elapsed-source-shards-(\d+)$/;

/**
 * Total child wall clock, REFUSING a duration that is not a finite non-negative number.
 *
 * The cast on `JSON.parse` is a promise about the file, not a check of it, and every
 * invalid shape JSON can hold reaches the addition: `"1000"` concatenates rather than
 * adds, so two string durations become 10,002 seconds instead of 3; `true` coerces to
 * 1; `null` to 0; a negative offsets real time; an object or a missing field yields
 * NaN. None of it disturbs the child, mutant, suite or leg COUNTS, so reconciliation
 * still passes and the corrupted total becomes a seed rate -- or serialises to `null`
 * and is read back as an absent one.
 *
 * A corrupt artifact is refused loudly, naming the file, because there is no
 * conservative reading of a duration nobody can parse: pricing it at zero understates
 * a leg just as silently as trusting it overstates one.
 */
function sumDurations(children: readonly Child[], file: string): number {
  let total = 0;
  for (const c of children) {
    const d: unknown = c.durationMs;
    if (typeof d !== "number" || !Number.isFinite(d) || d < 0) {
      throw new Error(
        `${file}: child of ${c.suite} has an unusable durationMs (${JSON.stringify(d)}); ` +
          `a record that cannot be priced is refused rather than summed`,
      );
    }
    total += d;
  }
  return total / 1000;
}

export function readRun(dir: string): RunArtifacts {
  const surfaces: Measured[] = [];
  const elapsed = new Map<number, number>();
  let startedAt: number | undefined;
  for (const entry of readdirSync(dir)) {
    const rec = RECORD_DIR.exec(entry);
    if (rec !== null) {
      const leg = Number(rec[1]);
      for (const file of readdirSync(join(dir, entry))) {
        if (!file.endsWith(".json")) continue;
        const j = JSON.parse(readFileSync(join(dir, entry, file), "utf8")) as RunRecordFile;
        const children = j.outcomes.flatMap((o) => [...(o.children ?? [])]);
        surfaces.push({
          surfaceId: j.surfaceId,
          leg,
          mutants: j.outcomes.length,
          observedBoots: children.length,
          seconds: sumDurations(children, join(dir, entry, file)),
          children,
          verdicts: new Map(j.outcomes.map((o) => [o.siteId, o.verdict])),
          passed: j.passed,
        });
        const t = j.startedAt === undefined ? Number.NaN : Date.parse(j.startedAt);
        if (Number.isFinite(t)) startedAt = startedAt === undefined ? t : Math.max(startedAt, t);
      }
      continue;
    }
    const el = ELAPSED_DIR.exec(entry);
    if (el !== null) {
      const file = join(dir, entry, "elapsed.txt");
      // An absent stamp is ABSENT, never zero: a leg that never reported is not
      // a leg that took no time, and the budget check draws the same distinction.
      if (existsSync(file)) elapsed.set(Number(el[1]), Number(readFileSync(file, "utf8").trim()));
    }
  }
  return { surfaces, elapsed, ...(startedAt === undefined ? {} : { startedAt }) };
}
