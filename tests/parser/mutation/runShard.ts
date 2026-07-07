// tests/parser/mutation/runShard.ts
// Async shard slice runner (sharding spec §3.2). Classification logic is
// byte-identical to the retired runAll() (formerly
// tests/parser/mutationHarness.test.ts:30-73) — this module only re-routes WHICH
// pairs a process parses, adds live progress (Codex spec-R1 #1: a sync
// multi-minute beforeAll never yields, so console interception could flush
// everything at the end; setImmediate yields let each progress line flush), and
// an optional alarm-collector side channel for ledger regen.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { boundedMutants, MUTANT_BUDGET, OPERATOR_NAMES } from "./operators";
import type { Mutant } from "./operators";
import { capture, verdict, fingerprint } from "./oracle";
import { FIXTURES, readFixture } from "./fixtures";
import type { FixtureRef } from "./fixtures";
import { computeShardAssignment, pairKey, SHARD_COUNT } from "./shardPartition";
import type { ShardAssignment } from "./shardPartition";
import type { Alarm } from "./knownHoles";

export type ShardResult = {
  alarms: Alarm[];
  allSiteIds: string[];
  cosmeticViolations: string[];
  noOps: string[];
  /** The assignment this run sliced by — returned so the shard test reuses it for
   *  the ledger slice instead of paying a second ~20 s computeShardAssignment()
   *  (which blew vitest's 5 s default testTimeout in the reconcile it). */
  assignment: ShardAssignment;
};

export type RunShardOpts = {
  fixtures?: readonly FixtureRef[]; // test injection; default FIXTURES
  readFixture?: (f: FixtureRef) => string; // test injection; default disk read
  assignment?: ShardAssignment; // test injection; default computeShardAssignment()
};

const PROGRESS_EVERY = 5_000;

// Prefix each operator's siteId with the fixture slug so keys are globally unique
// across the corpus: "<op>:B..:L..:X.." → "<op>:<slug>:B..:L..:X..".
const withSlug = (m: Mutant, op: string, slug: string): Mutant => ({
  ...m,
  siteId: `${op}:${slug}:${m.siteId.slice(op.length + 1)}`,
});

export async function runShard(shardIndex: number, opts: RunShardOpts = {}): Promise<ShardResult> {
  const fixtures = opts.fixtures ?? FIXTURES;
  const read = opts.readFixture ?? readFixture;
  const A = opts.assignment ?? computeShardAssignment();
  // Slice total up front (generation-count sum of this shard's pairs) so progress
  // lines can render <n>/<sliceTotal> per spec §3.2 — the weights are already the
  // mutant counts, but re-deriving them here would double the generation pass, so
  // count during the walk instead and print the running "<n> parsed" plus the
  // pair-derived total computed lazily on the first progress line.
  const alarms: Alarm[] = [];
  const allSiteIds: string[] = [];
  const cosmeticViolations: string[] = [];
  const noOps: string[] = [];
  let n = 0;
  const t0 = Date.now();
  // sliceTotal: sum of generated-mutant counts for this shard's pairs (generation
  // only, no parse). Cheap relative to the parse loop and makes AC-4's
  // "<n>/<sliceTotal>" honest.
  let sliceTotal = 0;
  for (const f of fixtures) {
    const ops = OPERATOR_NAMES.filter((op) => A.get(pairKey(op, f.slug)) === shardIndex);
    if (ops.length === 0) continue;
    const md = read(f);
    for (const op of ops) for (const _ of boundedMutants(op, md)) sliceTotal++;
  }
  const progress = (): void => {
    const mins = (Date.now() - t0) / 60_000;
    const msPer = n > 0 ? Math.round((Date.now() - t0) / n) : 0;
    console.log(
      `[mutation shard ${shardIndex}/${SHARD_COUNT}] ${n}/${sliceTotal} parsed, ${mins.toFixed(1)}m elapsed, ~${msPer}ms/parse`,
    );
  };
  for (const f of fixtures) {
    const ops = OPERATOR_NAMES.filter((op) => A.get(pairKey(op, f.slug)) === shardIndex);
    if (ops.length === 0) continue;
    const md = read(f);
    const baseline = capture(md, `${f.slug}.md`);
    for (const op of ops) {
      for (const raw of boundedMutants(op, md)) {
        if (++n > MUTANT_BUDGET) {
          throw new Error(
            `shard ${shardIndex} mutant count exceeded MUTANT_BUDGET ${MUTANT_BUDGET} — operator fanout regression?`,
          );
        }
        if (n % PROGRESS_EVERY === 0) {
          progress();
          await new Promise((r) => setImmediate(r)); // yield: flush console + keep the loop observable
        }
        const m = withSlug(raw, op, f.slug);
        allSiteIds.push(m.siteId);
        if (m.md === md) noOps.push(m.siteId); // byte-identical mutant = false coverage (plan-R18)
        const mut = capture(m.md, `${f.slug}.md`);
        const v = verdict(baseline, mut);
        if (m.bucket === "cosmetic") {
          if (v !== "ABSORBED") cosmeticViolations.push(m.siteId); // cosmetic must be fully invisible
          continue;
        }
        if (v === "SILENT_WRONG")
          alarms.push({ siteId: m.siteId, kind: "wrong", fingerprint: fingerprint(baseline, mut) });
        if (v === "SILENT_SIGNAL_LOSS")
          alarms.push({
            siteId: m.siteId,
            kind: "signal_loss",
            fingerprint: fingerprint(baseline, mut),
          });
      }
    }
  }
  const mins = (Date.now() - t0) / 60_000;
  console.log(
    `[mutation shard ${shardIndex}/${SHARD_COUNT}] DONE ${n} mutants ${mins.toFixed(1)}m — alarms=${alarms.length} cosmeticViolations=${cosmeticViolations.length} noOps=${noOps.length}`,
  );
  const collectDir = process.env.COLLECT_MUTATION_ALARMS;
  if (collectDir) {
    mkdirSync(collectDir, { recursive: true });
    writeFileSync(join(collectDir, `alarms-shard${shardIndex}.json`), JSON.stringify({ alarms }));
  }
  return { alarms, allSiteIds, cosmeticViolations, noOps, assignment: A };
}
