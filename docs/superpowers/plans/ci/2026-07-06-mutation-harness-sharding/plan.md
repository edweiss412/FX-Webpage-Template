# Mutation-Harness Sharding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parallelize the 101,795-mutant harness via 8 LPT-balanced vitest shard files, add live progress logging, and regenerate the known-holes ledger at HEAD (repairing CI run 28834940241's 83-alarm divergence).

**Architecture:** A deterministic LPT partition (`shardPartition.ts`) assigns each of the 153 (operator × fixture) pairs to one of 8 shards by generation-count weight. `runShard.ts` (async, yielding) parses one shard's slice and reconciles it against the matching ledger slice. A third env-gated vitest project (`mutation`, `fileParallelism: true`) runs the 8 shard files + 1 gates file concurrently.

**Tech Stack:** vitest 4.1.5 (forks pool), tsx, TypeScript strict + exactOptionalPropertyTypes, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-06-mutation-harness-sharding.md` (Codex-APPROVED R2). All numeric figures single-sourced in spec §9.

## Global Constraints

- Test-only + CI-infra: diff touches ONLY `tests/**`, `vitest.config.ts`, `vitest.projects.ts`, `.github/workflows/mutation-harness.yml`, docs (spec AC-7).
- TDD per task; commit per task (`test(parser):` / `feat(parser):` / `infra:` conventions); `--no-verify` on commits (worktree rule).
- `SHARD_COUNT = 8`; `MUTANT_BUDGET = 150_000` (unchanged); hookTimeout per shard 3,600,000 ms; progress cadence 5,000.
- Workflow `timeout-minutes: 180` UNCHANGED (user constraint).
- Oracle/operator/verdict/fingerprint semantics byte-identical — this plan only re-routes WHICH process parses WHICH pair.
- All commands run in the worktree `/Users/ericweiss/fxav-worktrees/mutation-harness`.

## Meta-test inventory (declared per project rule)

- CREATES `tests/parser/mutation/shardPartition.test.ts` (fast, merge-gating).
- EXTENDS `tests/cross-cutting/vitest-projects-partition.test.ts` (third project + workflow pins).
- EXTENDS the nightly gates file with corpus-scale partition checks (f)-(h).
- N/A: `_metaInfraContract` (no Supabase), advisory-lock (no locks), email-canonicalization (no email surface).

---

### Task 1: LPT partition module

**Files:**

- Create: `tests/parser/mutation/shardPartition.ts`
- Test: `tests/parser/mutation/shardPartition.test.ts`

**Interfaces:**

- Consumes: `boundedMutants`, `OPERATOR_NAMES` (`tests/parser/mutation/operators.ts:293,300`), `FIXTURES`, `readFixture` (`tests/parser/mutation/fixtures.ts:28,41`).
- Produces: `SHARD_COUNT: 8`, `lptAssign(weights, shardCount)`, `computeShardAssignment()`, `shardOfSiteId(siteId, assignment)`, `pairKey(op, slug)` — consumed by Tasks 2, 3.

- [ ] **Step 1: Write the failing test**

```ts
// tests/parser/mutation/shardPartition.test.ts
import { describe, it, expect } from "vitest";
import { SHARD_COUNT, lptAssign, shardOfSiteId, pairKey } from "./shardPartition";
import type { ShardAssignment } from "./shardPartition";

const W = (pairs: [string, number][]) => pairs.map(([key, w]) => ({ key, w }));

describe("lptAssign (deterministic LPT over pair weights)", () => {
  it("(a) determinism — identical input (incl. weight ties) → identical assignment, twice", () => {
    const weights = W([
      ["b:x", 10], ["a:x", 10], ["c:x", 7], ["d:x", 7], ["e:x", 1], ["f:x", 1],
    ]);
    const r1 = lptAssign(weights, 3);
    const r2 = lptAssign(weights, 3);
    expect([...r1.entries()].sort()).toEqual([...r2.entries()].sort());
    // tie-break is key-ascending: "a:x" (10) is placed before "b:x" (10) → lower shard index
    expect(r1.get("a:x")).toBe(0);
    expect(r1.get("b:x")).toBe(1);
  });
  it("(b) totality — every key assigned exactly once into [0, shardCount)", () => {
    const weights = W([["a:1", 5], ["b:2", 3], ["c:3", 8], ["d:4", 2], ["e:5", 1]]);
    const r = lptAssign(weights, 2);
    expect(r.size).toBe(weights.length);
    for (const [, s] of r) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2);
    }
  });
  it("(c) balance — heavy-tailed weights stay near-even (max/mean under a generous bound)", () => {
    // heavy tail like the real corpus: one dominant pair + many small ones
    const weights = W([
      ["big:x", 100],
      ...Array.from({ length: 40 }, (_, i): [string, number] => [`p${String(i).padStart(2, "0")}:x`, 5 + (i % 7)]),
    ]);
    const r = lptAssign(weights, 4);
    const loads = new Array(4).fill(0);
    for (const { key, w } of weights) loads[r.get(key)!] += w;
    const mean = loads.reduce((a, b) => a + b, 0) / 4;
    expect(Math.max(...loads) / mean).toBeLessThan(4 / 3); // LPT's classical guarantee shape
  });
});

describe("shardOfSiteId (op resolved by longest prefix; assignment lookup)", () => {
  const A: ShardAssignment = new Map([
    [pairKey("blank-row:inject", "east-coast"), 3],
    [pairKey("blank-row", "east-coast"), 5], // hypothetical shorter sibling — longest prefix must win
    [pairKey("ref-sub", "2025-03-dci-rpas-central"), 1],
  ]);
  it("(d) two-colon operators resolve by longest prefix", () => {
    expect(shardOfSiteId("blank-row:inject:east-coast:B1:L2:Xgap0", A)).toBe(3);
    expect(shardOfSiteId("ref-sub:2025-03-dci-rpas-central:B4:L153:X0", A)).toBe(1);
  });
  it("(d) malformed siteId throws (no operator prefix)", () => {
    expect(() => shardOfSiteId("not-an-operator:slug:B1:L1:X0", A)).toThrow(/no operator/i);
  });
  it("(d) pair absent from the assignment throws (fail-loud, findingFor posture)", () => {
    expect(() => shardOfSiteId("ref-sub:unknown-slug:B1:L1:X0", A)).toThrow(/assignment/i);
  });
});

describe("SHARD_COUNT", () => {
  it("is 8 (spec §3.1)", () => {
    expect(SHARD_COUNT).toBe(8);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/parser/mutation/shardPartition.test.ts`
Expected: FAIL — `Cannot find module './shardPartition'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// tests/parser/mutation/shardPartition.ts
// Deterministic LPT shard partition for the mutation-harness corpus (spec §3.1).
// Weighted, not hashed: measured djb2 % 8 left the heaviest shard at 1.65× mean
// (21,012 mutants) because pair weights are heavy-tailed; LPT over runtime
// generation counts measures max/mean 1.000 (12,721–12,729). Pure function of the
// committed fixtures + operators — every consumer recomputes the identical map, so
// there is NO committed weight table to go stale (the class this arc repairs).
import { boundedMutants, OPERATOR_NAMES } from "./operators";
import { FIXTURES, readFixture } from "./fixtures";

export const SHARD_COUNT = 8;
export type ShardAssignment = ReadonlyMap<string, number>; // pairKey → shard index

export const pairKey = (op: string, slug: string): string => `${op}:${slug}`;

/** Deterministic LPT: sort by (weight desc, key asc), assign each pair to the
 *  currently-least-loaded shard (tie → lowest index). Integer arithmetic +
 *  lexicographic ties only — platform-independent. */
export function lptAssign(
  weights: readonly { key: string; w: number }[],
  shardCount: number,
): ShardAssignment {
  const sorted = [...weights].sort((a, b) => b.w - a.w || (a.key < b.key ? -1 : 1));
  const loads = new Array<number>(shardCount).fill(0);
  const assign = new Map<string, number>();
  for (const p of sorted) {
    let best = 0;
    for (let i = 1; i < shardCount; i++) if (loads[i]! < loads[best]!) best = i;
    assign.set(p.key, best);
    loads[best] += p.w;
  }
  return assign;
}

/** Weigh every OPERATOR_NAMES × FIXTURES pair by generated mutant count (streamed,
 *  generation only — NO parse; ~18 s for the full 153-pair corpus) and LPT-pack
 *  into SHARD_COUNT shards. */
export function computeShardAssignment(): ShardAssignment {
  const weights: { key: string; w: number }[] = [];
  for (const f of FIXTURES) {
    const md = readFixture(f);
    for (const op of OPERATOR_NAMES) {
      let n = 0;
      for (const _ of boundedMutants(op, md)) n++;
      weights.push({ key: pairKey(op, f.slug), w: n });
    }
  }
  return lptAssign(weights, SHARD_COUNT);
}

/** Resolve a siteId's shard under an assignment. siteIds are
 *  "<op>:<slug>:B..:L..:X.." and <op> itself may contain a colon
 *  ("blank-row:inject"), so the op is resolved by LONGEST-prefix match over the
 *  assignment's own pair keys (same discipline as findingFor,
 *  tests/parser/mutation/knownHoles.ts:48-51). Throws on an unresolvable
 *  operator prefix or a pair missing from the assignment — a ledger row that
 *  can't be sharded is corrupt data, not a skippable row. */
export function shardOfSiteId(siteId: string, assignment: ShardAssignment): number {
  // A pair key "<op>:<slug>" is itself a prefix of every siteId that pair produced
  // ("<op>:<slug>:B…"), so the LONGEST assignment-key prefix IS the (op, slug)
  // resolution — and it inherently prefers "blank-row:inject:east-coast" over any
  // shorter sibling key.
  const matches = [...assignment.keys()]
    .filter((k) => siteId.startsWith(k + ":"))
    .sort((a, b) => b.length - a.length);
  if (matches.length === 0) {
    // Distinguish the two failure modes for a precise error message: does ANY
    // known operator (derived from pair keys by stripping the slug segment)
    // prefix this siteId?
    const opMatch = [...new Set([...assignment.keys()].map((k) => k.slice(0, k.lastIndexOf(":"))))]
      .filter((op) => siteId.startsWith(op + ":"))
      .sort((a, b) => b.length - a.length)[0];
    if (opMatch === undefined) {
      throw new Error(`shardOfSiteId: no operator prefix matches siteId ${siteId}`);
    }
    throw new Error(`shardOfSiteId: pair for siteId ${siteId} is absent from the assignment`);
  }
  return assignment.get(matches[0]!)!;
}
```

Note the trick: a pair key `"<op>:<slug>"` is itself a prefix of every siteId it produced (`"<op>:<slug>:B…"`), so `shardOfSiteId` needs NO separate operator table — longest assignment-key prefix IS the (op, slug) resolution, and it inherently picks `blank-row:inject:east-coast` over any shorter sibling.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/parser/mutation/shardPartition.test.ts`
Expected: PASS (all 7).

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/shardPartition.ts tests/parser/mutation/shardPartition.test.ts
git commit --no-verify -m "feat(parser): deterministic LPT shard partition for mutation harness"
```

---

### Task 2: `runShard` — async slice runner with progress + collector

**Files:**

- Create: `tests/parser/mutation/runShard.ts`
- Test: `tests/parser/mutation/runShard.test.ts`

**Interfaces:**

- Consumes: Task 1's `computeShardAssignment`, `pairKey`, `SHARD_COUNT`; `boundedMutants`, `OPERATOR_NAMES`, `MUTANT_BUDGET`, `Mutant` (`operators.ts`); `capture`, `verdict`, `fingerprint` (`oracle.ts`); `FIXTURES`, `readFixture`, `FixtureRef` (`fixtures.ts`); `Alarm` (`knownHoles.ts`).
- Produces: `runShard(shardIndex, opts?) → Promise<ShardResult>` — consumed by the 8 shard files (Task 3).

- [ ] **Step 1: Write the failing test**

The corpus-scale path is exercised nightly by the shard files; THIS test is the fast merge-gating unit test via dependency injection (`opts.fixtures` override + `opts.assignment` override) so it runs on two tiny synthetic fixtures in <5 s. Concrete failure modes caught: slice filter processing a pair from another shard (assertion on which siteIds appear); classification drift vs `verdict` (an injected mutated fixture must produce the same alarm the oracle computes directly); collector not writing; missing DONE line.

```ts
// tests/parser/mutation/runShard.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runShard } from "./runShard";
import { pairKey } from "./shardPartition";
import { OPERATOR_NAMES } from "./operators";
import type { FixtureRef } from "./fixtures";

// Two in-memory fixtures via the read override (no disk writes).
const FIX: FixtureRef[] = [
  { slug: "synth-a", family: "raw", path: "/dev/null/synth-a.md" },
  { slug: "synth-b", family: "raw", path: "/dev/null/synth-b.md" },
];
const MD: Record<string, string> = {
  "synth-a": "| CREW | NAME |\n|  | Doug |",
  "synth-b": "| HOTEL | Kimpton |\n|  | 122 W Monroe |",
};
// Assignment: ALL synth-a pairs → shard 0; ALL synth-b pairs → shard 1.
const A = new Map<string, number>(
  OPERATOR_NAMES.flatMap((op) => [
    [pairKey(op, "synth-a"), 0] as const,
    [pairKey(op, "synth-b"), 1] as const,
  ]),
);
const OPTS = { fixtures: FIX, readFixture: (f: FixtureRef) => MD[f.slug]!, assignment: A };

let scratch: string | undefined;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
  vi.restoreAllMocks();
});

describe("runShard slice filter + progress + collector", () => {
  it("processes ONLY its shard's pairs (every siteId belongs to shard-0 fixtures)", async () => {
    const r = await runShard(0, OPTS);
    expect(r.allSiteIds.length).toBeGreaterThan(0);
    for (const s of r.allSiteIds) expect(s, `foreign siteId in shard 0: ${s}`).toContain(":synth-a:");
  });
  it("a different shard sees the OTHER fixture only (disjoint slices)", async () => {
    const r = await runShard(1, OPTS);
    for (const s of r.allSiteIds) expect(s).toContain(":synth-b:");
  });
  it("emits a DONE progress line even for a small slice", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await runShard(0, OPTS);
    const done = spy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("DONE"));
    expect(done, "DONE line must always be emitted").toMatch(/\[mutation shard 0\/8\] DONE \d+ mutants/);
  });
  it("collector env writes alarms-shard<i>.json with the shard's alarms", async () => {
    scratch = mkdtempSync(join(tmpdir(), "mut-collect-"));
    vi.stubEnv("COLLECT_MUTATION_ALARMS", scratch);
    const r = await runShard(0, OPTS);
    const dumped = JSON.parse(readFileSync(join(scratch, "alarms-shard0.json"), "utf8")) as {
      alarms: unknown[];
    };
    expect(dumped.alarms).toEqual(r.alarms);
    vi.unstubAllEnvs();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/parser/mutation/runShard.test.ts`
Expected: FAIL — `Cannot find module './runShard'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// tests/parser/mutation/runShard.ts
// Async shard slice runner (spec §3.2). Classification logic is byte-identical to
// the retired runAll() (formerly tests/parser/mutationHarness.test.ts:30-73) —
// this module only re-routes WHICH pairs a process parses, adds live progress
// (Codex spec-R1 #1: a sync multi-minute beforeAll never yields, so console
// interception could flush everything at the end; setImmediate yields let each
// progress line flush), and an optional alarm-collector for ledger regen.
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
};

export type RunShardOpts = {
  fixtures?: readonly FixtureRef[]; // test injection; default FIXTURES
  readFixture?: (f: FixtureRef) => string; // test injection; default disk read
  assignment?: ShardAssignment; // test injection; default computeShardAssignment()
};

const PROGRESS_EVERY = 5_000;

const withSlug = (m: Mutant, op: string, slug: string): Mutant => ({
  ...m,
  siteId: `${op}:${slug}:${m.siteId.slice(op.length + 1)}`,
});

export async function runShard(shardIndex: number, opts: RunShardOpts = {}): Promise<ShardResult> {
  const fixtures = opts.fixtures ?? FIXTURES;
  const read = opts.readFixture ?? readFixture;
  const A = opts.assignment ?? computeShardAssignment();
  const alarms: Alarm[] = [];
  const allSiteIds: string[] = [];
  const cosmeticViolations: string[] = [];
  const noOps: string[] = [];
  let n = 0;
  const t0 = Date.now();
  const progress = () => {
    const mins = (Date.now() - t0) / 60_000;
    console.log(
      `[mutation shard ${shardIndex}/${SHARD_COUNT}] ${n} parsed, ${mins.toFixed(1)}m elapsed, ~${n ? (((Date.now() - t0) / n) | 0) : 0}ms/parse`,
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
          await new Promise((r) => setImmediate(r)); // yield: flush console + keep loop live
        }
        const m = withSlug(raw, op, f.slug);
        allSiteIds.push(m.siteId);
        if (m.md === md) noOps.push(m.siteId);
        const mut = capture(m.md, `${f.slug}.md`);
        const v = verdict(baseline, mut);
        if (m.bucket === "cosmetic") {
          if (v !== "ABSORBED") cosmeticViolations.push(m.siteId);
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
  return { alarms, allSiteIds, cosmeticViolations, noOps };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/parser/mutation/runShard.test.ts`
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/runShard.ts tests/parser/mutation/runShard.test.ts
git commit --no-verify -m "feat(parser): async runShard slice runner — live progress + regen collector"
```

---

### Task 3: shard files, gates file, file-integrity meta-test, delete the monolith

**Files:**

- Create: `tests/parser/mutationHarness.shard0.test.ts` … `shard7.test.ts` (8 files)
- Create: `tests/parser/mutationHarness.gates.test.ts`
- Modify: `tests/parser/mutation/shardPartition.test.ts` (add integrity describe (e))
- Delete: `tests/parser/mutationHarness.test.ts`

**Interfaces:**

- Consumes: `runShard` (Task 2), `computeShardAssignment`/`shardOfSiteId`/`SHARD_COUNT` (Task 1), `reconcileLedger`/`KNOWN_SILENT_HOLES` (`knownHoles.ts`), plus everything the relocated gates describes already import (`mutationHarness.test.ts:119-127,208-209`).
- Produces: the 9 nightly test files the `mutation` project (Task 4) and workflow (Task 5) run.

- [ ] **Step 1: Write the failing integrity meta-test (append to `shardPartition.test.ts`)**

```ts
// appended to tests/parser/mutation/shardPartition.test.ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

describe("(e) shard-file integrity — exactly SHARD_COUNT files, each bound to its own index", () => {
  const dir = join(process.cwd(), "tests", "parser");
  const shardFiles = readdirSync(dir)
    .filter((f) => /^mutationHarness\.shard\d+\.test\.ts$/.test(f))
    .sort();
  it(`exactly ${SHARD_COUNT} shard files exist with indices 0..${SHARD_COUNT - 1}`, () => {
    expect(shardFiles).toEqual(
      Array.from({ length: SHARD_COUNT }, (_, i) => `mutationHarness.shard${i}.test.ts`),
    );
  });
  it("each file calls runShard(<its own index>) exactly once (anti-copy-paste-drift)", () => {
    for (const f of shardFiles) {
      const idx = Number(/shard(\d+)/.exec(f)![1]);
      const src = readFileSync(join(dir, f), "utf8");
      const calls = [...src.matchAll(/runShard\((\d+)\)/g)];
      expect(calls.length, `${f} must call runShard exactly once`).toBe(1);
      expect(Number(calls[0]![1]), `${f} must run ITS OWN shard`).toBe(idx);
    }
  });
  it("the retired monolith is gone", () => {
    expect(readdirSync(dir)).not.toContain("mutationHarness.test.ts");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run tests/parser/mutation/shardPartition.test.ts`
Expected: FAIL — shard-file list `[]` ≠ expected 8, and monolith still present.

- [ ] **Step 3: Create the 8 shard files (identical template; only the literal index differs)**

```ts
// tests/parser/mutationHarness.shard0.test.ts   (repeat for 1..7 with the literal changed)
// One LPT slice of the exhaustive mutation corpus (spec §3.3). Runs ONLY in the
// env-gated `mutation` vitest project (fileParallelism:true) — never in serial/
// parallel. Slice reconciliation vs the ledger slice is exactly the retired
// monolith's bidirectional check restricted to this shard; the partition
// meta-tests + gates checks (f)-(g) prove the union over shards equals the full
// reconciliation (spec AC-3).
import { describe, it, expect, beforeAll } from "vitest";
import { runShard } from "./mutation/runShard";
import type { ShardResult } from "./mutation/runShard";
import { computeShardAssignment, shardOfSiteId, SHARD_COUNT } from "./mutation/shardPartition";
import { MUTANT_BUDGET } from "./mutation/operators";
import { KNOWN_SILENT_HOLES, reconcileLedger } from "./mutation/knownHoles";

const SHARD = 0;

describe(`mutation harness shard ${SHARD}/${SHARD_COUNT} — ledger slice`, () => {
  let R: ShardResult;
  beforeAll(async () => {
    R = await runShard(0);
  }, 3_600_000);

  it("slice mutant count within budget", () => {
    expect(R.allSiteIds.length).toBeGreaterThanOrEqual(0); // corpus-wide >0 floor lives in gates (spec §6)
    expect(R.allSiteIds.length).toBeLessThanOrEqual(MUTANT_BUDGET);
  });
  it("no emitted mutant is byte-identical to its baseline fixture (plan-R18)", () => {
    expect(R.noOps, `no-op mutants:\n${R.noOps.join("\n")}`).toEqual([]);
  });
  it("siteIds unique within the shard (cross-shard disjointness is by partition)", () => {
    expect(new Set(R.allSiteIds).size).toBe(R.allSiteIds.length);
  });
  it("cosmetic operators are fully invisible", () => {
    expect(R.cosmeticViolations).toEqual([]);
  });
  it("slice alarms == ledger slice, keyed (siteId, kind, fingerprint) — bidirectional", () => {
    const A = computeShardAssignment(); // identical to runShard's by determinism
    const slice = KNOWN_SILENT_HOLES.filter((h) => shardOfSiteId(h.siteId, A) === SHARD);
    const { newAlarms, staleRows } = reconcileLedger(R.alarms, slice);
    expect(newAlarms, `NEW/changed alarms not in ledger:\n${newAlarms.join("\n")}`).toEqual([]);
    expect(staleRows, `stale ledger rows (fixed or drifted):\n${staleRows.join("\n")}`).toEqual([]);
  });
});
```

Generation command (run once; verify output, do NOT leave scripted generation in the tree):

```bash
for i in 0 1 2 3 4 5 6 7; do
  sed "s/shard0/shard${i}/; s/const SHARD = 0/const SHARD = ${i}/; s/runShard(0)/runShard(${i})/" \
    tests/parser/mutationHarness.shard0.test.ts > tests/parser/mutationHarness.shard${i}.test.ts.tmp \
  && mv tests/parser/mutationHarness.shard${i}.test.ts.tmp tests/parser/mutationHarness.shard${i}.test.ts
done
```

(The `describe`/comment strings interpolate `SHARD`, so only the three literals differ; the integrity meta-test verifies each file's binding.)

- [ ] **Step 4: Create the gates file by RELOCATING the non-corpus describes**

`tests/parser/mutationHarness.gates.test.ts` = the entire content of `tests/parser/mutationHarness.test.ts` lines 118-273 (imports at `:119-127` and `:208-209` hoisted to the top, plus `FIXTURES`/`readFixture`/`boundedMutants`/`OPERATOR_NAMES` imports it uses), UNCHANGED except:

1. Extend the coverage-legibility test (`:243-265`) — after the existing `expect(domains.size).toBeGreaterThan(3);` add the relocated corpus-total assertions:

```ts
expect(total, "full corpus must be non-empty (the >0 floor moved here from per-shard, spec §6)").toBeGreaterThan(50);
expect(total, "corpus-total budget (moved from the retired monolith's global guard)").toBeLessThanOrEqual(MUTANT_BUDGET);
```

(import `MUTANT_BUDGET` from `./mutation/operators`; the existing `expect(total).toBeGreaterThan(50)` already covers the floor — keep one, drop duplication.)

2. Append the new corpus-scale partition + uniqueness gates:

```ts
// ─── partition gates (f)-(h) + global uniqueness (spec §5) ─────────────────────
import { computeShardAssignment, pairKey, shardOfSiteId, SHARD_COUNT } from "./mutation/shardPartition";
import { KNOWN_SILENT_HOLES } from "./mutation/knownHoles";

describe("shard partition over the LIVE corpus (spec §5 f-h)", () => {
  const A = computeShardAssignment(); // ~18 s generation, no parse

  it("(f) assignment covers every OPERATOR_NAMES × FIXTURES pair", () => {
    for (const f of FIXTURES)
      for (const op of OPERATOR_NAMES)
        expect(A.has(pairKey(op, f.slug)), `unassigned pair ${op}:${f.slug}`).toBe(true);
    expect(A.size).toBe(FIXTURES.length * OPERATOR_NAMES.length);
  }, 120_000);

  it("(g) ledger slices are disjoint-exhaustive and every row resolves", () => {
    const counts = new Array<number>(SHARD_COUNT).fill(0);
    for (const h of KNOWN_SILENT_HOLES) counts[shardOfSiteId(h.siteId, A)]!++;
    expect(counts.reduce((a, b) => a + b, 0)).toBe(KNOWN_SILENT_HOLES.length);
  }, 120_000);

  it("(h) LPT load spread stays sane (max/mean < 1.2; measured 1.000)", () => {
    const loads = new Array<number>(SHARD_COUNT).fill(0);
    for (const f of FIXTURES) {
      const md = readFixture(f);
      for (const op of OPERATOR_NAMES) {
        let n = 0;
        for (const _ of boundedMutants(op, md)) n++;
        loads[A.get(pairKey(op, f.slug))!]! += n;
      }
    }
    const mean = loads.reduce((a, b) => a + b, 0) / SHARD_COUNT;
    expect(Math.max(...loads) / mean).toBeLessThan(1.2);
  }, 120_000);

  it("global siteId uniqueness across the FULL corpus (generation only)", () => {
    const seen = new Set<string>();
    for (const f of FIXTURES) {
      const md = readFixture(f);
      for (const op of OPERATOR_NAMES) {
        for (const raw of boundedMutants(op, md)) {
          const siteId = `${op}:${f.slug}:${raw.siteId.slice(op.length + 1)}`;
          expect(seen.has(siteId), `duplicate siteId ${siteId}`).toBe(false);
          seen.add(siteId);
        }
      }
    }
    expect(seen.size).toBeGreaterThan(50);
  }, 120_000);
});
```

3. Delete `tests/parser/mutationHarness.test.ts` (`git rm`).

- [ ] **Step 5: Run integrity meta-test + gates to verify green (gates ≈ 1-2 min, generation only)**

Run: `pnpm exec vitest run tests/parser/mutation/shardPartition.test.ts` → PASS.
Run: `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run tests/parser/mutationHarness.gates.test.ts` → PASS (still discovered via serial project's env gate until Task 4 rewires; if discovery fails here, defer this run to Task 4 Step 4 and note it).

- [ ] **Step 6: Commit**

```bash
git add tests/parser/mutationHarness.shard*.test.ts tests/parser/mutationHarness.gates.test.ts tests/parser/mutation/shardPartition.test.ts
git rm tests/parser/mutationHarness.test.ts
git commit --no-verify -m "feat(parser): 8 LPT shard files + gates file replace the monolith harness"
```

---

### Task 4: vitest wiring — third project + partition meta-test updates

**Files:**

- Modify: `vitest.projects.ts` (NIGHTLY_ONLY_EXCLUDES glob + new MUTATION_TEST_GLOBS export)
- Modify: `vitest.config.ts` (unconditional serial exclude + conditional `mutation` project)
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `MUTATION_TEST_GLOBS = ["tests/parser/mutationHarness.*.test.ts"]` (single source of truth for the project include, the serial exclude, and the meta-test).

- [ ] **Step 1: Update the partition meta-test FIRST (failing)**

In `tests/cross-cutting/vitest-projects-partition.test.ts`:

1. The "defines exactly a 'serial' and a 'parallel' project" test (`:56-60`) becomes env-aware:

```ts
it("defines serial + parallel (+ mutation ONLY when opted in)", async () => {
  expect(Array.isArray(projects)).toBe(true);
  const names = projects.map((p) => p.test.name).sort();
  expect(names).toEqual(["parallel", "serial"]); // default import = no env flag

  vi.resetModules();
  vi.stubEnv("VITEST_INCLUDE_MUTATION_HARNESS", "1");
  try {
    const cfg = (await import("@/vitest.config")).default as { test?: { projects?: ProjectEntry[] } };
    const gatedNames = (cfg.test?.projects ?? []).map((p) => p.test.name).sort();
    expect(gatedNames).toEqual(["mutation", "parallel", "serial"]);
    const mutation = cfg.test!.projects!.find((p) => p.test.name === "mutation")!.test;
    expect(mutation.include).toEqual(MUTATION_TEST_GLOBS);
    expect(mutation.fileParallelism, "the whole point of sharding").toBe(true);
  } finally {
    vi.unstubAllEnvs();
    vi.resetModules();
  }
});
```

2. The opt-in gate test (`:191-214`) inverts: harness globs are in the serial exclude **unconditionally** now:

```ts
it("harness files are excluded from serial UNCONDITIONALLY (they live in the mutation project)", async () => {
  const serialExcludeFor = async (value: string | undefined): Promise<string[]> => {
    vi.resetModules();
    vi.stubEnv("VITEST_INCLUDE_MUTATION_HARNESS", value ?? "");
    try {
      const cfg = (await import("@/vitest.config")).default as { test?: { projects?: ProjectEntry[] } };
      return cfg.test?.projects?.find((p) => p.test.name === "serial")?.test.exclude ?? [];
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  };
  for (const f of NIGHTLY_ONLY_EXCLUDES) {
    expect(await serialExcludeFor("1")).toContain(f);
    expect(await serialExcludeFor(undefined)).toContain(f);
  }
});
```

3. The NOT-in-parallel test (`:181-189`): `NIGHTLY_ONLY_EXCLUDES` is now a glob, not a literal file — replace the `allTestFiles contains path` check with a glob-expansion check:

```ts
it("the mutation harness files are NOT in the parallel set", () => {
  const harnessFiles = allTestFiles.filter((f) => /^tests\/parser\/mutationHarness\..+\.test\.ts$/.test(f));
  expect(harnessFiles.length, "shard+gates files must exist").toBe(9); // 8 shards + gates
  for (const f of harnessFiles) {
    expect(matchesParallel(f), `${f} must not be in PARALLEL`).toBe(false);
  }
});
```

4. Workflow assertion (`:216-236`): replace the single-file expectation with the new run command + widened paths:

```ts
expect(
  wf.includes("--project mutation"),
  "workflow must run the mutation project explicitly",
).toBe(true);
expect(
  wf.includes("tests/parser/mutationHarness.*.test.ts"),
  "pull_request path filter must cover shard+gates files (Codex spec-R1 #2)",
).toBe(true);
expect(
  wf.includes("tests/parser/mutationHarness.test.ts\n"),
  "retired single-file path literal must be gone",
).toBe(false);
```

Import `MUTATION_TEST_GLOBS` alongside the existing `vitest.projects` imports.

- [ ] **Step 2: Run to verify the updated meta-test fails**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: FAIL — no `mutation` project, `MUTATION_TEST_GLOBS` unexported, serial exclude still env-gated, workflow assertions (workflow not yet updated — the workflow expectations fail until Task 5; run Tasks 4+5 to green together, commits stay separate: this task's commit lands with the meta-test asserting config-level behavior green and the workflow assertions marked `it.todo` → flipped to `it` in Task 5).

To keep commits honest: in THIS task, add the workflow assertions as `it.todo("workflow pins — enabled in the workflow task")`; Task 5 flips it to a real `it` in the same commit as the workflow edit.

- [ ] **Step 3: Implement the wiring**

`vitest.projects.ts` — replace the `NIGHTLY_ONLY_EXCLUDES` block (`:41-48`):

```ts
// The mutation harness (8 LPT shard files + 1 gates file, tests/parser/
// mutationHarness.*.test.ts) exhaustively parses ~102k mutants — far past any
// merge-gating leg budget. The files live in NO default project: the serial
// project excludes them UNCONDITIONALLY, and a third `mutation` project
// (fileParallelism:true — the sharding speedup) exists ONLY when
// VITEST_INCLUDE_MUTATION_HARNESS=1 (nightly workflow + local regen runs).
export const MUTATION_TEST_GLOBS = ["tests/parser/mutationHarness.*.test.ts"];
export const NIGHTLY_ONLY_EXCLUDES = ["**/tests/parser/mutationHarness.*.test.ts"];
```

`vitest.config.ts` — the serial exclude keeps `...nightlyExcludes` but `nightlyExcludes` becomes unconditional; the conditional project is appended:

```ts
// (top of config, replacing the env-gated nightlyExcludes const)
const nightlyExcludes = NIGHTLY_ONLY_EXCLUDES; // unconditional: harness lives in the mutation project only
```

```ts
// (inside test.projects, after the parallel project entry)
...(process.env.VITEST_INCLUDE_MUTATION_HARNESS === "1"
  ? [
      {
        extends: true as const,
        test: {
          name: "mutation",
          include: MUTATION_TEST_GLOBS,
          fileParallelism: true,
        },
      },
    ]
  : []),
```

(Import `MUTATION_TEST_GLOBS` in the existing `vitest.projects` import statement.)

- [ ] **Step 4: Run to verify green (except the todo)**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: PASS (with 1 todo).
Also: `pnpm exec vitest run tests/parser/mutation/shardPartition.test.ts` → still PASS.
Sanity: `pnpm exec vitest list 2>/dev/null | grep -c mutationHarness || true` → `0` (default discovery drops all harness files); `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest list --project mutation | grep -c mutationHarness` → `9`.

- [ ] **Step 5: Commit**

```bash
git add vitest.projects.ts vitest.config.ts tests/cross-cutting/vitest-projects-partition.test.ts
git commit --no-verify -m "infra: env-gated mutation vitest project (fileParallelism) replaces serial opt-in"
```

---

### Task 5: workflow update

**Files:**

- Modify: `.github/workflows/mutation-harness.yml`
- Modify: `tests/cross-cutting/vitest-projects-partition.test.ts` (flip the `it.todo` to `it`)

- [ ] **Step 1: Flip the todo to a real failing test** (content exactly as written in Task 4 Step 1 item 4).

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts`
Expected: FAIL on the workflow pins.

- [ ] **Step 2: Edit the workflow**

- Path filter (`:19-23`): replace `- "tests/parser/mutationHarness.test.ts"` with `- "tests/parser/mutationHarness.*.test.ts"` (keep `mutation-harness.yml` + `tests/parser/mutation/**`).
- Run step (`:44-47`): name → `Run sharded mutation harness (nightly, ~60-75 min at 3 workers)`; command → `pnpm exec vitest run --project mutation`.
- Header comment block (`:2-8`): corpus figure stays 101,795; replace "~92 min serial" narrative with: 8 LPT-balanced shard files, forks pool 3 workers on 4 vCPU, expected 60-75 min, live `[mutation shard i/8]` progress lines, `timeout-minutes` unchanged at 180.
- Concurrency comment (`:24-25`): "~92-min run" → "~70-min run". Keep the comment ABOVE the concurrency block (ci-workflow-speedup meta-test needs `group:`/`cancel-in-progress:` adjacent).

- [ ] **Step 3: Run to verify green**

Run: `pnpm exec vitest run tests/cross-cutting/vitest-projects-partition.test.ts` → PASS (0 todo).
Also sweep the other workflow-scanning meta-tests (the local-passes-CI-fails class): `pnpm exec vitest run tests/cross-cutting/ tests/messages/` → PASS.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/mutation-harness.yml tests/cross-cutting/vitest-projects-partition.test.ts
git commit --no-verify -m "infra: mutation-harness workflow runs the sharded mutation project"
```

---

### Task 6: one-shard smoke (end-to-end, ~15 min)

- [ ] **Step 1: Run the LIGHTEST shard alone** (pick by the measured loads — any shard is ~12.7k mutants ≈ 12 min):

```bash
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/parser/mutationHarness.shard0.test.ts 2>&1 | tee /tmp/shard0-smoke.log
```

Expected: progress lines appear INCREMENTALLY in the terminal (AC-4's mechanism observable locally); the ledger-slice test either passes (shard 0 owns no RPAS-drifted pairs) or fails with ONLY known-drift siteIds (`ref-sub|blank-row:inject|unicode-inject|column-shift : 2025-03-dci-rpas-central`). Any OTHER failure = defect in Tasks 1-3; stop and fix.

- [ ] **Step 2: No commit** (validation only). Record the observed per-parse ms + whether progress streamed incrementally in the task notes for the PR body.

---

### Task 7: full sharded run + ledger regen at HEAD

- [ ] **Step 1: Full run with collector (expected: RPAS-owning shards RED — the TDD red state for the regen)**

```bash
COLLECT_MUTATION_ALARMS=/tmp/mut-collect VITEST_INCLUDE_MUTATION_HARNESS=1 \
  pnpm exec vitest run --project mutation 2>&1 | tee /tmp/full-shard-run.log
```

Expected: ~12-15 min wall (spec §4); shard files covering the 4 drifted RPAS pairs fail their ledger-slice test listing EXACTLY the 83 known newAlarms (and NO staleRows unless the full recompute reveals drift CI never reached — if staleRows appear in OTHER fixtures, that is finding-not-failure: include them in the regen + PR body).

- [ ] **Step 2: Regen the ledger from the merged shard dumps**

Update the local regen script (scratchpad `regen-ledger.mjs`) to read all `/tmp/mut-collect/alarms-shard*.json`, concatenate `alarms`, and emit `tests/parser/mutation/knownHoles.ts` with the same sort, same pipe-delimited `RAW_HOLES` template literal, same `OPERATOR_FINDING_MAP` resolution, and the header comment's counts/date updated (regenerated 2026-07-07 from the sharded HEAD corpus). Expected row count: 7,968 (= 7,885 + 83) unless Step 1 surfaced additional drift.

Verify before writing: unique keys, no pipe chars in fields, every operator prefix resolvable by `findingFor` (script already enforces all three).

- [ ] **Step 3: Prettier-stability + fast gates**

```bash
pnpm exec prettier --check tests/parser/mutation/knownHoles.ts
pnpm exec vitest run tests/parser/mutation/knownHoles.test.ts tests/parser/mutation/shardPartition.test.ts
```

Expected: prettier clean (template literal keeps rows one-line); knownHoles ledger-shape + no-blanket-unaudited tests PASS against the new rows.

- [ ] **Step 4: Full sharded rerun — must be COMPLETELY GREEN (no collector)**

```bash
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation 2>&1 | tee /tmp/full-shard-rerun.log
```

Expected: all 9 files green, ~12-15 min. This is the ledger-refresh proof (spec AC-5).

- [ ] **Step 5: Commit**

```bash
git add tests/parser/mutation/knownHoles.ts
git commit --no-verify -m "fix(parser): regenerate known-holes ledger at HEAD — +83 RPAS BREAKOUT holes (CI 28834940241)"
```

(If Step 1 revealed additional drift, the commit message enumerates it by operator/fixture.)

---

### Task 8: full-suite + static gates

- [ ] **Step 1:** `pnpm test` (full merge-gating suite; harness auto-excluded) → green. Failures traced to this diff = fix before proceeding; pre-existing failures verified at merge-base before dismissing.
- [ ] **Step 2:** `pnpm exec tsc --noEmit` (vitest strips types; tsc is the real gate) → clean.
- [ ] **Step 3:** `pnpm exec eslint .` → clean (canonical-Tailwind rule irrelevant here but the run is mandatory).
- [ ] **Step 4:** `pnpm format:check` → clean (`--no-verify` bypassed prettier at every commit).
- [ ] **Step 5:** Commit any mechanical fixups as `chore(parser): typecheck/lint/format fixups for sharding`.

---

### Task 9: close-out — Codex whole-diff, push, CI, merge

- [ ] **Step 1:** Fetch + confirm base freshness: `git fetch origin && git log --oneline HEAD..origin/main` → empty (else rebase + re-run Task 8; stale-base discipline).
- [ ] **Step 2:** Codex whole-diff adversarial review (fresh-eyes, REVIEWER ONLY, `codex exec` pattern with `-o` verdict file) over `git diff origin/main...HEAD` scope. Iterate to APPROVE (no round budget). Class-sweep every finding.
- [ ] **Step 3:** Push `feat/mutation-harness`. The path-filtered `pull_request` trigger fires the sharded workflow on PR #338 (this diff touches the workflow + `tests/parser/mutation/**` + harness files — all three path groups).
- [ ] **Step 4:** Watch: all 12 required checks green AND the (non-required) mutation-harness run green in 60-75 min with incremental progress lines visible in the live log (AC-4/AC-6 verification — observe mid-run). `gh pr checks 338 --watch` (PR number, not SHA) + `gh run view <RID>` for the harness.
- [ ] **Step 5:** `gh pr merge 338 --merge` (merge commit, never squash).
- [ ] **Step 6:** `cd /Users/ericweiss/FX-Webpage-Template && git checkout main && git pull --ff-only && git rev-list --left-right --count main...origin/main` → MUST print `0	0`.
- [ ] **Step 7:** Final report: rounds, CI wall-clock observed, ledger delta, deferred items.

---

## Anti-tautology notes (per project rule)

- Task 2's slice-filter test derives expectations from the INJECTED assignment (all synth-a → shard 0), not from re-running the partition — a broken filter cannot pass by accident because foreign siteIds carry the other fixture's slug.
- Task 3's reconcile test asserts against `KNOWN_SILENT_HOLES` filtered by an INDEPENDENTLY recomputed assignment — identical-by-determinism, pinned by partition test (a), so a filter/assignment mismatch shows as newAlarms+staleRows, not silence.
- Gates (h) derives the load bound from measured reality (1.000) with headroom (1.2), not a hardcoded shard size that fixture growth would invalidate.
- Task 6/7 expected-failure lists are scoped to the 4 known-drifted RPAS pairs — any other red is a defect, not noise.

## Concrete failure modes each new test catches

- `shardPartition.test.ts` (a)-(d): nondeterministic sort tie-breaks (platform-dependent `Array.sort` stability assumptions), off-by-one shard bounds, naive `split(":")` op parsing (would route every `blank-row:inject` row to the wrong slice silently), silent skip of unassigned ledger rows.
- Integrity (e): a copy-pasted shard file running the wrong index (two shards parse the same slice, one slice never parsed — ledger stays green while coverage silently halves).
- Gates (f)-(g): an operator/fixture added without regen — assignment covers it but the ledger doesn't → (g) sum mismatch or `shardOfSiteId` throw, instead of a silent never-parsed pair.
- Gates (h): weight-source regression (e.g. `boundedMutants` yielding nothing for a family) shows as load skew before it shows as corpus shrinkage.
- `runShard.test.ts` collector test: regen tooling silently writing empty alarm sets (the exact failure mode that would make a future regen "shrink" the ledger to zero).
