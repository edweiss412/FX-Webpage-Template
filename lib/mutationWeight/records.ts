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
  /** leg index -> the seconds that leg stamped into its own `elapsed.txt`. */
  elapsed: Map<number, number>;
};

const RECORD_DIR = /^mutation-records-source-shards-(\d+)$/;
const ELAPSED_DIR = /^elapsed-source-shards-(\d+)$/;

export function readRun(dir: string): RunArtifacts {
  const surfaces: Measured[] = [];
  const elapsed = new Map<number, number>();
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
          seconds: children.reduce((a, c) => a + c.durationMs, 0) / 1000,
          children,
          verdicts: new Map(j.outcomes.map((o) => [o.siteId, o.verdict])),
          passed: j.passed,
        });
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
  return { surfaces, elapsed };
}
