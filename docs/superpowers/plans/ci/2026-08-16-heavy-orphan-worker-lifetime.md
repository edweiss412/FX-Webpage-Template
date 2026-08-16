# Heavy-phase orphan worker lifetime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound how long a heavy-phase worker process outlives the harness that owns it, without ever reaping a heavy phase that is structurally identifiable as live.

**Architecture:** A pure classifier over the process table decides which processes are orphaned heavy workers; a collector reads that table and reports its own failure rather than an empty world; a thin CLI adapter reports by default and kills only under `--kill`. The classifier is enrolled in the source-mutation registry, which makes the review's convergence criterion a score rather than an argument.

**Tech Stack:** TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest, `tsx` for the CLI, `ps(1)`, the existing `scripts/with-heavy-slot.py` semaphore (untouched).

**Spec:** `docs/superpowers/specs/ci/2026-08-16-heavy-orphan-worker-lifetime-design.md` — every §-reference below is to it, and the executor reads both. `BL-HEAVY-ORPHAN-WORKER-LIFETIME`.

## Global Constraints

Copied verbatim from the spec; every task's requirements implicitly include these.

- **The three §4.4 tables are the ONLY source for what any condition does.** Code comments and test names cite the row ID (C1-C4, R1-R4, K1-K5); they do not paraphrase the behavior.
- **`scripts/with-heavy-slot.py` is not edited.** Trigger 1 is a package.json change. No change to admission control, slot counts, or the wrapper's `execvp` model.
- **The reaper never reads the semaphore's state.** The slot-membership clause was found unreachable and removed (spec §4.2); no task adds slot parsing back, and no task reads or writes `/tmp/fx-heavy-slots`.
- **`tests/mutation/source/runner.ts` and `childRun.ts` are not edited** (spec §11; filed as `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH`).
- **Default ceiling `FX_REAP_MIN_AGE_S` = `14400` seconds (4 h).** One definition, in `classify.ts`; nothing else restates the number.
- **Every heavy phase runs under `pnpm heavy`** — `pnpm test:fast`, any build, any `--project mutation` run. Scoped `vitest run <files>` stays unwrapped.
- **No em-dash in user-visible copy**, and `pnpm spec:lint` runs before every docs commit, not after.

---

## File Structure

| File | Responsibility |
| --- | --- |
| lib/heavyReap/classify.ts (new) | Every decision rule. Pure, total, no I/O, no clock. The mutation-registry surface. |
| lib/heavyReap/collect.ts (new) | Read the world: `ps` into rows. Distinguishes its own failure (C1) from an empty table (C2). |
| scripts/heavy-reap.ts (new) | CLI adapter: flags, ceiling, report, kill plan, identity re-check, exit status. Decision logic exported as pure functions; only the signal and the identity read are injected. |
| tests/heavyReap/classify.test.ts (new) | Task 1 |
| tests/heavyReap/collect.test.ts (new) | Task 2 |
| tests/heavyReap/fixtures/ps-sample.txt (new) | A committed `ps` sample from this machine, containing at least one real worker line. |
| tests/heavyReap/fixtures/fake-ps.mjs (new) | A stand-in for `ps(1)`, selected via `FX_REAP_PS_BIN`, so the CLI can be executed end to end against a synthetic table of pids no real process owns. |
| tests/heavyReap/cli.test.ts (new) | Task 3 |
| tests/heavyReap/triggerFailOpen.test.ts (new) | Task 4 |
| package.json:56 (modify) | The `heavy` script gains the pre-admission reap; a new `heavy:reap` script. |
| `tests/mutation/source/registry.ts:151` (modify) | One `GUARD_SURFACES` row. |
| `tests/mutation/guardSurfaces.gate.test.ts:34` (modify) | One `EXPECTED_LEDGER_KINDS` row. |
| `AGENTS.md` (modify) | Document `pnpm heavy:reap`, trigger 1, and the `Stop`-hook install one-liner. |

tests/heavyReap/ is absent from `PARALLEL_TEST_GLOBS`, so it lands in the SERIAL vitest project by default. That is the correct project — Task 2's live smoke and Task 4's child-process test both spawn processes — and **no wiring change is needed**: `BASE_INCLUDE` already covers `tests/**/*.test.ts`, so `tests/cross-cutting/vitest-projects-partition.test.ts` is satisfied.

## Acceptance criteria → task

| AC | Task |
| --- | --- |
| AC-1, AC-2, AC-3, AC-4 | 1 |
| AC-7 (C1), AC-10 | 2 |
| AC-3b, AC-5, AC-5b, AC-6 | 3 |
| AC-8 | 4 |
| AC-9 | 5 |

AC-3b splits: C3/C4 are the ceiling, read in Task 3's `readCeiling` and carried into `classify` as `configNotes` (asserted in Task 1); C1/C2 are collection, asserted in Tasks 2 and 3.

## Meta-test inventory

CREATES none. EXTENDS three registries: `tests/mutation/source/registry.ts` (one `GUARD_SURFACES` row, Task 5), `tests/mutation/guardSurfaces.gate.test.ts` (one `EXPECTED_LEDGER_KINDS` row — a new surface fails by default until it declares its counts, Task 5), and `tests/docs/_metaDeferralLedgerGraduation.test.ts`'s `BACKLOG_GRADUATED` (one `{ id, provenance }` row, Task 7's final commit). No Supabase call boundary, no advisory lock, no admin mutation surface, no `admin_alerts` row, no UI surface.

## Mutation-operator families — the closure set for review

Declared up front per the mutation-family-closure rule; this enumeration is what the diff-stage review converges against. `classify.ts` enrols with the full declared operator set (`[...OPERATOR_NAMES]`). A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| Family | Where it bites | Killed by (Task 1 case) |
| --- | --- | --- |
| comparison-operator swap | `etimeSeconds < config.minAgeSeconds` | the row exactly AT the ceiling |
| boolean-operator swap | `basename(argv0) !== "node"` and the entrypoint test | the non-node-argv0 case; the `tail -f` case |
| negation removal | `row.ppid !== 1` | a row with a live parent |
| literal change | the `1` in `ppid !== 1`; `DEFAULT_MIN_AGE_SECONDS` | a row with `ppid === 2`; the case pinning `DEFAULT_MIN_AGE_SECONDS` to the literal `14400` |
| statement removal | the self guard; each early return | the AC-4 cases; the R2/R3 cases |
| discriminant change | `"parsed"` / `"unparsable"` | the R1 case and the totality case |

## Pre-draft code-verification pass (RUN, not described)

Every file, symbol and line this plan names, verified against the live tree:

```
$ ls -d lib/heavyReap tests/heavyReap 2>&1
ls: cannot access 'lib/heavyReap': No such file or directory
ls: cannot access 'tests/heavyReap': No such file or directory

$ grep -n '"heavy":' package.json
56:    "heavy": "python3 scripts/with-heavy-slot.py --",

$ grep -n 'export const GUARD_SURFACES' tests/mutation/source/registry.ts
151:export const GUARD_SURFACES: GuardSurface[] = [

$ grep -n '^const EXPECTED_LEDGER_KINDS' tests/mutation/guardSurfaces.gate.test.ts
34:const EXPECTED_LEDGER_KINDS: Record<string, Record<string, number>> = {

$ grep -n 'export function premise' tests/_shared/premise.ts
26:export function premise(description: string, actual: number, mustExceed: number): void {
36:export function premiseHolds(description: string, condition: boolean): void {

$ grep -c 'tests/heavyReap' vitest.projects.ts   # 0 => new dir defaults to the SERIAL project
0

$ grep -n 'scoreFloor: number\|control: { from' tests/mutation/source/registry.ts | head -3
21:  scoreFloor: number;
36:  control: { from: string; to: string };
171:    control: { from: "const PROXIMITY_WINDOW = 5;", to: "const PROXIMITY_WINDOW = 4;" },
```

**Every `ts` block below was materialized into the worktree and RUN before this plan was dispatched**, then deleted; the tree carries only this document. Results, so a reviewer checks them rather than re-deriving them:

- `pnpm typecheck` passes on every file under the repo's strict config.
- The directory runs **116 cases** (27 classify + 20 collect + 58 cli + 11 trigger). Before Tasks 3-4's edits to package.json exactly FOUR are red — Task 4's three wiring cases plus Task 3's `heavy:reap` case — and after them all 116 are green. Both states observed, both edits reverted.
- Task 4's suite runs RED exactly as its Step 2 claims: `3 failed | 8 passed (11)`, and GREEN (`11 passed`) once package.json:56 is edited.
- Eleven cases execute scripts/heavy-reap.ts as a child process, and every one that passes `--kill` builds its fake table from pids of processes THE TEST SPAWNED as genuine orphans, so the reaper can only ever signal something this suite created.
- Task 2's fixture-capture command was executed and produced **3** worker lines, so the capture recipe is verified rather than assumed.
- Seven cases drive `readIdentity` against a real `ps` at its K1/K6 boundary, including both status-1 spellings (stdout and stderr diagnostics) and a hanging read bounded by its timeout. One further case drives the production `stillAlive` against a process that exits mid-window, which is the only way K4's settle is observable.

This pass earned its cost repeatedly. It found the SPEC defect this plan is written against — executing Task 1's clause-(c) case is how the unreachable slot clause was discovered (spec §4.2) — and it found plan defects that plan review round 1 then confirmed and extended: a Step 2 claiming the wrong red count, a mutation control the suite adapted to, missing subprocess timeouts, and a CLI whose `main()` no case executed.

Consequence for the task markers: `lib/heavyReap/` and scripts/heavy-reap.ts do not exist, so Tasks 1-3 use the PATH-ONLY `red-target=` form (which requires an untracked path). Task 4's target is tracked, so it uses the colon form on package.json:56.

---

## Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1: The classifier

<!-- task: red=`pnpm vitest run tests/heavyReap/classify.test.ts` red-state=authored red-target=`lib/heavyReap/classify.ts` why=`lib/heavyReap/classify.ts does not exist, so every case fails at import resolution` ac=AC-1,AC-2,AC-3,AC-4 -->

**Files:**
- Create: lib/heavyReap/classify.ts
- Test: tests/heavyReap/classify.test.ts

**Interfaces:**
- Consumes: nothing.
- Produces: `ProcRow`, `ParsedRow`, `UnparsableRow`, `ReapConfig`, `Skip`, `Decision`, `Classification`, `DEFAULT_MIN_AGE_SECONDS`, `WORKER_ENTRYPOINTS`, `classify()`. Tasks 2 and 3 both import from here.

**What is red and why:** the module is absent, so the suite cannot resolve its import. The production surface is lib/heavyReap/classify.ts itself.

- [ ] **Step 1: Write the failing test.** tests/heavyReap/classify.test.ts:

```ts
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import {
  DEFAULT_MIN_AGE_SECONDS,
  type ParsedRow,
  type ProcRow,
  type ReapConfig,
  classify,
} from "../../lib/heavyReap/classify";

const NODE = "/Users/x/.nvm/versions/node/v20.20.1/bin/node";
const FORKS = "/Users/x/node_modules/.pnpm/vitest@4.1.5/node_modules/vitest/dist/workers/forks.js";

// LITERAL, never the imported constant. Deriving the fixtures from DEFAULT_MIN_AGE_SECONDS makes
// the suite adapt to a mutant that changes it, so the mutation control and the +1 integer mutant
// both survive. Plan round 1 finding 1.
const CEILING = 14400;

const CONFIG: ReapConfig = {
  minAgeSeconds: CEILING,
  minAgeSource: "default",
  selfPid: 999,
  selfAncestry: [998, 997],
};

function worker(over: Partial<ParsedRow> = {}): ParsedRow {
  return {
    kind: "parsed",
    pid: 100,
    ppid: 1,
    etimeSeconds: CEILING + 1,
    command: `${NODE} --experimental-import-meta-resolve ${FORKS}`,
    ...over,
  };
}
const only = (rows: ProcRow[], cfg: ReapConfig = CONFIG) => classify(rows, cfg).decisions[0];

describe("the ceiling constant is pinned, not merely referenced", () => {
  it("DEFAULT_MIN_AGE_SECONDS is exactly 14400 (4 h)", () => {
    expect(DEFAULT_MIN_AGE_SECONDS).toBe(14400);
  });
});

describe("classify: AC-1", () => {
  it("reaps a worker-shaped, orphaned row past the ceiling", () => {
    expect(only([worker()])).toMatchObject({ pid: 100, reap: true });
  });
});

describe("classify: AC-2, exempt at ANY age", () => {
  const ancient = { etimeSeconds: 10 * 365 * 86_400 };

  it("clause (b): a worker with a live parent is never reaped, however old", () => {
    const rows = [worker({ ...ancient, ppid: 4242 }), worker({ pid: 4242, ppid: 1, command: "sh" })];
    expect(only(rows)).toMatchObject({ reap: false, because: "has-live-parent" });
  });

  it("clause (a): the pnpm wrapper of a live phase is never reaped, however old", () => {
    expect(only([worker({ ...ancient, command: "node /x/bin/pnpm exec vitest run" })])).toMatchObject({
      reap: false,
      because: "not-a-worker",
    });
  });
});

describe("classify: clause (a) is structural, never containment", () => {
  it.each([
    ["tail", `tail -f ${FORKS}`],
    ["grep", `grep -n forks ${FORKS}`],
    ["cat", `/bin/cat ${FORKS}`],
    ["vim", `vim ${FORKS}`],
    ["shell wrapper", `/bin/zsh -c echo ${FORKS} && pwd`],
    ["non-node argv0", `/usr/bin/python3 ${FORKS}`],
  ])("declines %s, which only MENTIONS an entrypoint", (_label, command) => {
    expect(only([worker({ command })])).toMatchObject({ reap: false, because: "not-a-worker" });
  });

  it("declines a node process whose entrypoint is not the last token", () => {
    expect(only([worker({ command: `${NODE} ${FORKS} --reporter=json` })])).toMatchObject({
      reap: false,
      because: "not-a-worker",
    });
  });

  it("accepts every declared entrypoint", () => {
    for (const entry of [
      "vitest/dist/workers/forks.js",
      "vitest/dist/workers/threads.js",
      "vitest/dist/workers/vmForks.js",
      "vitest/dist/workers/vmThreads.js",
      "vitest/dist/workers/runVmTests.js",
      "playwright/lib/worker/workerMain.js",
      "next/dist/compiled/jest-worker/processChild.js",
    ]) {
      expect(only([worker({ command: `${NODE} /x/node_modules/${entry}` })])).toMatchObject({
        reap: true,
      });
    }
  });
});

describe("classify: the age clause boundary", () => {
  it.each([
    [CEILING - 1, false],
    [CEILING, true],
    [CEILING + 1, true],
  ])("age %i => reap %s", (etimeSeconds, reaped) => {
    expect(only([worker({ etimeSeconds })])).toMatchObject({ reap: reaped });
  });

  it("uses the configured ceiling, not the default", () => {
    const cfg: ReapConfig = { ...CONFIG, minAgeSeconds: 60, minAgeSource: "env" };
    expect(only([worker({ etimeSeconds: 61 })], cfg)).toMatchObject({ reap: true });
    expect(only([worker({ etimeSeconds: 59 })], cfg)).toMatchObject({ because: "too-young" });
  });
});

describe("classify: AC-4", () => {
  it.each([
    ["own pid", 999],
    ["an ancestor", 998],
  ])("declines %s", (_label, pid) => {
    expect(only([worker({ pid })])).toMatchObject({ reap: false, because: "self" });
  });
});

describe("classify: AC-3, row-level R1-R4", () => {
  it("R1: an unparsable row survives into decisions", () => {
    const rows: ProcRow[] = [{ kind: "unparsable", raw: "??? garbage", problem: "no pid" }];
    expect(classify(rows, CONFIG).decisions[0]).toMatchObject({
      reap: false,
      because: "unparsable",
    });
  });

  it.each([
    ["R2", { ppid: null }, "undecidable"],
    ["R3", { etimeSeconds: null }, "undecidable"],
    ["R4", { command: "" }, "not-a-worker"],
  ] as const)("%s: an undecidable field declines the row", (_id, over, because) => {
    expect(only([worker(over)])).toMatchObject({ reap: false, because });
  });

  it("a ppid naming a process not in the table is undecidable, not an orphan", () => {
    expect(only([worker({ ppid: 31337 })])).toMatchObject({ reap: false, because: "undecidable" });
  });

  it("is TOTAL: one decision per input row", () => {
    const rows: ProcRow[] = [
      worker(),
      worker({ pid: 101, command: "sleep 9" }),
      { kind: "unparsable", raw: "x", problem: "no pid" },
    ];
    expect(classify(rows, CONFIG).decisions).toHaveLength(rows.length);
  });

  it("premise: this fixture DOES contain a reapable row", () => {
    premiseHolds(
      "the totality fixture is not vacuously all-declines",
      classify([worker()], CONFIG).decisions.some((d) => d.reap),
    );
  });
});

describe("classify: C4's rejected ceiling reaches the reporter", () => {
  it("carries the rejected raw value in configNotes", () => {
    const cfg: ReapConfig = { ...CONFIG, minAgeSource: "env", minAgeRejected: "-5" };
    expect(classify([worker()], cfg).configNotes.join(" ")).toContain("-5");
  });

  it("C3: an unset ceiling produces no note", () => {
    expect(classify([worker()], CONFIG).configNotes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm vitest run tests/heavyReap/classify.test.ts`
Expected: FAIL — `Cannot find module '../../lib/heavyReap/classify'`.

- [ ] **Step 3: Write minimal implementation.** lib/heavyReap/classify.ts:

```ts
import { basename } from "node:path";

/** Worker entrypoints, verified present in this checkout (spec §4.2a). */
export const WORKER_ENTRYPOINTS = [
  "vitest/dist/workers/forks.js",
  "vitest/dist/workers/threads.js",
  "vitest/dist/workers/vmForks.js",
  "vitest/dist/workers/vmThreads.js",
  "vitest/dist/workers/runVmTests.js",
  "playwright/lib/worker/workerMain.js",
  "next/dist/compiled/jest-worker/processChild.js",
] as const;

/** Spec §4.3. The only definition of the ceiling. */
export const DEFAULT_MIN_AGE_SECONDS = 14400;

export type ParsedRow = {
  kind: "parsed";
  pid: number;
  ppid: number | null;
  etimeSeconds: number | null;
  command: string;
};
export type UnparsableRow = { kind: "unparsable"; raw: string; problem: string };
export type ProcRow = ParsedRow | UnparsableRow;

export type ReapConfig = {
  // No clock field: `etime` is already an ELAPSED duration, so the age clause compares two
  // durations. See the spec's §5 note.
  minAgeSeconds: number;
  minAgeSource: "default" | "env";
  minAgeRejected?: string;
  selfPid: number;
  selfAncestry: readonly number[];
};

export type Skip = "not-a-worker" | "has-live-parent" | "too-young" | "self" | "undecidable";

export type Decision =
  | { pid: number; reap: true; shape: string; ageSeconds: number }
  | { pid: number; reap: false; because: Skip; detail?: string }
  | { reap: false; because: "unparsable"; raw: string; detail: string };

export type Classification = { decisions: Decision[]; configNotes: string[] };

/** Clause (a): node as argv[0], a declared entrypoint as the LAST token. */
function workerShape(command: string): string | null {
  const tokens = command.split(/\s+/).filter((t) => t.length > 0);
  const argv0 = tokens[0];
  const last = tokens[tokens.length - 1];
  if (argv0 === undefined || last === undefined || tokens.length < 2) return null;
  if (basename(argv0) !== "node") return null;
  return WORKER_ENTRYPOINTS.find((e) => last.endsWith(e)) ?? null;
}

export function classify(rows: readonly ProcRow[], config: ReapConfig): Classification {
  const configNotes: string[] =
    config.minAgeRejected === undefined
      ? []
      : [`FX_REAP_MIN_AGE_S rejected: ${config.minAgeRejected}; using ${config.minAgeSeconds}`];
  const live = new Set<number>();
  for (const row of rows) if (row.kind === "parsed") live.add(row.pid);
  const selfSet = new Set<number>([config.selfPid, ...config.selfAncestry]);

  const decisions: Decision[] = rows.map((row) => {
    if (row.kind === "unparsable") {
      return { reap: false, because: "unparsable", raw: row.raw, detail: row.problem };
    }
    const shape = workerShape(row.command);
    if (shape === null) return { pid: row.pid, reap: false, because: "not-a-worker" };
    if (selfSet.has(row.pid)) return { pid: row.pid, reap: false, because: "self" };
    if (row.ppid === null) return { pid: row.pid, reap: false, because: "undecidable" };
    if (row.ppid !== 1) {
      return live.has(row.ppid)
        ? { pid: row.pid, reap: false, because: "has-live-parent" }
        : { pid: row.pid, reap: false, because: "undecidable" };
    }
    if (row.etimeSeconds === null) return { pid: row.pid, reap: false, because: "undecidable" };
    if (row.etimeSeconds < config.minAgeSeconds) {
      return { pid: row.pid, reap: false, because: "too-young" };
    }
    return { pid: row.pid, reap: true, shape, ageSeconds: row.etimeSeconds };
  });

  return { decisions, configNotes };
}
```

**Note for the implementer on the `ppid !== 1` branch:** a `ppid` naming a process NOT in the table is `undecidable`, never "orphan". Only `ppid === 1` is the orphan shape (spec §4.2b), and treating a missing parent as an orphan would reap a worker whose parent merely exited between `ps` reading the two rows.

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm vitest run tests/heavyReap/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck.** Run: `pnpm typecheck`. Expected: PASS. `noUncheckedIndexedAccess` is why `workerShape` binds `tokens[0]` and the last token to locals and checks both for `undefined`; `exactOptionalPropertyTypes` is why `minAgeRejected` is only ever read, never assigned `undefined`.

- [ ] **Step 6: Commit.**

```bash
git add lib/heavyReap/classify.ts tests/heavyReap/classify.test.ts
git commit -m "feat(infra): classify orphaned heavy-phase workers"
```

### Task 2: The collector

<!-- task: red=`pnpm vitest run tests/heavyReap/collect.test.ts` red-state=authored red-target=`lib/heavyReap/collect.ts` why=`lib/heavyReap/collect.ts does not exist, so every case fails at import resolution` ac=AC-7,AC-10 -->

**Files:**
- Create: lib/heavyReap/collect.ts
- Create: tests/heavyReap/fixtures/ps-sample.txt
- Create: tests/heavyReap/fixtures/fake-ps.mjs (also used by Task 3; create it here, in Step 1)
- Test: tests/heavyReap/collect.test.ts

**Interfaces:**
- Consumes: `ProcRow` from Task 1.
- Produces: `CollectResult`, `parseEtime(raw: string): number | null`, `parsePsOutput(text: string): ProcRow[]`, `collect(psBin?: string): CollectResult`. Task 3 imports `collect`.

**What is red and why:** the module is absent. Production surface: lib/heavyReap/collect.ts.

- [ ] **Step 1: Capture the fixture.**

```bash
mkdir -p tests/heavyReap/fixtures
# A worker line only exists while a vitest run is live, so start one and sample during it.
pnpm vitest run tests/heavyReap/classify.test.ts >/dev/null 2>&1 &
sleep 4
ps -eo pid=,ppid=,etime=,command= > /tmp/ps-full.txt
{ grep -E 'vitest/dist/workers/' /tmp/ps-full.txt | head -3; head -40 /tmp/ps-full.txt; } \
  > tests/heavyReap/fixtures/ps-sample.txt
wait
grep -c 'vitest/dist/workers' tests/heavyReap/fixtures/ps-sample.txt   # MUST be >= 1
```

Also create tests/heavyReap/fixtures/fake-ps.mjs, which Task 3's end-to-end cases need. It stands
in for `ps(1)` via the `FX_REAP_PS_BIN` seam and reports pids no real process owns, so the CLI can
be run with `--kill` in a test without any possibility of signalling something real:

```js
#!/usr/bin/env node
// A stand-in for ps(1), selected via FX_REAP_PS_BIN. Serves both invocations the reaper makes:
// the bulk table read and the per-target identity read.
//
// The table comes from FAKE_PS_TABLE, a JSON array of {pid, ppid, etime, command} (a string entry
// is emitted verbatim, which is how an unparsable row is produced). Tests that exercise --kill put
// the pids of processes THEY SPAWNED in it, so the reaper only ever signals something the test
// owns. FAKE_PS_MODE injects failures.
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const mode = process.env.FAKE_PS_MODE ?? "table";
const identityRead = args.includes("-o");

if (mode === "fail" && !identityRead) process.exit(2);
if (mode === "identity-fail" && identityRead) process.exit(2);
// A status-1 exit WITH output on EITHER stream is a ps error, not "no such pid": K6, never K1.
if (mode === "identity-noisy-fail" && identityRead) {
  process.stdout.write("ps: some diagnostic\n");
  process.exit(1);
}
if (mode === "identity-stderr-fail" && identityRead) {
  process.stderr.write("ps: some diagnostic\n");
  process.exit(1);
}
if ((mode === "hang" && !identityRead) || (mode === "identity-hang" && identityRead)) {
  setTimeout(() => {}, 60_000);
} else if (!identityRead) {
  const rows = JSON.parse(process.env.FAKE_PS_TABLE ?? "[]");
  process.stdout.write(
    rows
      .map((r) => (typeof r === "string" ? r : `${r.pid} ${r.ppid} ${r.etime} ${r.command}`))
      .map((l) => `${l}\n`)
      .join(""),
  );
} else {
  const pid = args[args.indexOf("-p") + 1];
  if (process.env.FAKE_PS_IDENTITY_GONE === pid) process.exit(1); // status 1, NO output: K1
  let startedAt = "Sun Aug 16 09:35:23 2026";
  if (process.env.FAKE_PS_IDENTITY_DRIFT === "1") {
    const counter = `${process.env.TMPDIR ?? "/tmp"}/fake-ps-drift-${pid}`;
    const seen = existsSync(counter) ? Number(readFileSync(counter, "utf8")) : 0;
    writeFileSync(counter, String(seen + 1));
    if (seen > 0) startedAt = "Mon Aug 17 11:11:11 2026";
  }
  process.stdout.write(`${startedAt} /usr/bin/node /x/worker-${pid}\n`);
}
```

Make it executable: `chmod +x tests/heavyReap/fixtures/fake-ps.mjs`.

A plain `head` of the table captures only long-lived system processes and yields ZERO worker lines — measured while authoring this plan, which is why the capture is written this way. Step 2's first case is a premise asserting the fixture holds a worker, so a degenerate fixture fails loudly rather than passing vacuously. Real worker command lines run ~617 characters; do not hand-trim them.

- [ ] **Step 2: Write the failing test.** tests/heavyReap/collect.test.ts:

```ts
import { execFileSync, spawn } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import { collect, parseEtime, parsePsOutput } from "../../lib/heavyReap/collect";

const SAMPLE = readFileSync(new URL("./fixtures/ps-sample.txt", import.meta.url), "utf8");
const FAKE_PS = new URL("./fixtures/fake-ps.mjs", import.meta.url).pathname;

describe("parsePsOutput", () => {
  it("premise: the committed fixture contains a real worker line", () => {
    premiseHolds("ps-sample.txt holds >=1 vitest worker", SAMPLE.includes("vitest/dist/workers/"));
  });

  it("parses every non-empty line into a row", () => {
    const expected = SAMPLE.split("\n").filter((l) => l.trim().length > 0).length;
    expect(parsePsOutput(SAMPLE)).toHaveLength(expected);
  });

  it("keeps a full-length worker command intact", () => {
    const lengths = parsePsOutput(SAMPLE)
      .filter((r) => r.kind === "parsed" && r.command.includes("vitest/dist/workers/"))
      .map((r) => (r.kind === "parsed" ? r.command.length : 0));
    expect(Math.max(...lengths)).toBeGreaterThan(200);
  });

  it("R1: a line with no numeric pid becomes an unparsable row", () => {
    expect(parsePsOutput("garbage line\n")[0]).toMatchObject({ kind: "unparsable" });
  });

  it.each([
    ["R2", "  700  xx  01:00 node /x/vitest/dist/workers/forks.js", "ppid"],
    ["R3", "  700  1  zzzz node /x/vitest/dist/workers/forks.js", "etimeSeconds"],
  ])("%s: an unparsable field becomes null, not a dropped row", (_id, line, field) => {
    expect(parsePsOutput(`${line}\n`)[0]).toMatchObject({ kind: "parsed", [field]: null });
  });

  it("C2: empty ps output yields zero rows, not a throw", () => {
    expect(parsePsOutput("")).toEqual([]);
  });
});

describe("parseEtime", () => {
  it.each([
    ["MM:SS", "01:30", 90],
    ["HH:MM:SS", "01:00:00", 3600],
    ["D-HH:MM:SS", "1-00:00:00", 86_400],
    ["the incident's oldest orphan", "1-05:29:53", 106_193],
  ])("parses the %s form", (_label, raw, seconds) => {
    expect(parseEtime(raw)).toBe(seconds);
  });

  it.each([["zzz"], [""], ["12"], ["1-2-3:04:05"]])("rejects %s", (raw) => {
    expect(parseEtime(raw)).toBeNull();
  });
});

describe("collect: AC-7, all three spellings of C1", () => {
  it("binary missing => ps-unavailable", () => {
    const r = collect("/definitely/not/a/real/ps");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toBe("ps-unavailable");
  });

  it("non-zero exit => ps-failed, NOT an empty world", () => {
    process.env.FAKE_PS_MODE = "fail";
    try {
      const r = collect(FAKE_PS);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem).toBe("ps-failed");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
  });

  it("permission denied => ps-failed, NOT an empty world", () => {
    const dir = mkdtempSync(join(tmpdir(), "heavy-reap-denied-"));
    const denied = join(dir, "ps");
    writeFileSync(denied, "#!/bin/sh\necho hi\n");
    chmodSync(denied, 0o000);
    const r = collect(denied);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(["ps-failed", "ps-unavailable"]).toContain(r.problem);
  });

  it("AC-8: a hanging ps is bounded and reported, never waited on forever", () => {
    process.env.FAKE_PS_MODE = "hang";
    process.env.FX_REAP_PS_TEST_TIMEOUT = "1";
    const started = Date.now();
    try {
      const r = collect(FAKE_PS);
      expect(r.ok).toBe(false);
    } finally {
      delete process.env.FAKE_PS_MODE;
      delete process.env.FX_REAP_PS_TEST_TIMEOUT;
    }
    expect(Date.now() - started).toBeLessThan(15_000);
  }, 30_000);
});

describe("collect: AC-10 live smoke against an INDEPENDENT ps read", () => {
  it("agrees with a direct ps -o read for a process the test spawned", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 8000)"]);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const result = collect();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const found = result.rows.find((r) => r.kind === "parsed" && r.pid === child.pid);
      premiseHolds("the spawned child appears in the live ps read", found !== undefined);

      // The criterion's independent observation: a SEPARATE ps invocation, parsed here.
      const direct = execFileSync("ps", ["-o", "ppid=,etime=", "-p", String(child.pid)], {
        encoding: "utf8",
      }).trim();
      const [directPpid, directEtime] = direct.split(/\s+/);
      premiseHolds("the direct ps read returned both fields", directEtime !== undefined);

      expect(found).toMatchObject({ kind: "parsed", ppid: Number(directPpid) });
      const collected = found?.kind === "parsed" ? (found.etimeSeconds ?? -1) : -1;
      const independent = parseEtime(directEtime ?? "") ?? -1;
      expect(collected).toBeGreaterThanOrEqual(0);
      expect(Math.abs(collected - independent)).toBeLessThanOrEqual(3);
    } finally {
      child.kill("SIGKILL");
    }
  }, 20_000);
});
```

- [ ] **Step 3: Run test to verify it fails.**

Run: `pnpm vitest run tests/heavyReap/collect.test.ts`
Expected: FAIL — `Cannot find module '../../lib/heavyReap/collect'`.

- [ ] **Step 4: Write minimal implementation.** lib/heavyReap/collect.ts:

```ts
import { execFileSync } from "node:child_process";
import type { ProcRow } from "./classify";

/** AC-8: every subprocess this tool runs is bounded, so `;` in the heavy script cannot hang. */
export const PS_TIMEOUT_MS = 10_000;

/** Test seam only; production reads plain `ps` from PATH. */
export const psBinFromEnv = (env: NodeJS.ProcessEnv = process.env): string =>
  env.FX_REAP_PS_BIN ?? "ps";

export type CollectResult =
  | { ok: true; rows: ProcRow[] }
  | { ok: false; problem: "ps-unavailable" | "ps-failed" | "ps-timeout"; detail: string };

/** `[[D-]HH:]MM:SS`, ps(1)'s elapsed-time forms. Null when it is none of them. */
export function parseEtime(raw: string): number | null {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(raw.trim());
  if (m === null) return null;
  const [, d, h, mm, ss] = m;
  return Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3600 + Number(mm ?? 0) * 60 + Number(ss ?? 0);
}

export function parsePsOutput(text: string): ProcRow[] {
  const rows: ProcRow[] = [];
  for (const line of text.split("\n")) {
    if (line.trim().length === 0) continue;
    const parts = line.trim().split(/\s+/);
    const [rawPid, rawPpid, rawEtime] = parts;
    const pid = Number(rawPid);
    if (rawPid === undefined || !Number.isInteger(pid)) {
      rows.push({ kind: "unparsable", raw: line, problem: "no numeric pid" });
      continue;
    }
    const ppid = Number(rawPpid);
    rows.push({
      kind: "parsed",
      pid,
      ppid: rawPpid !== undefined && Number.isInteger(ppid) ? ppid : null,
      etimeSeconds: rawEtime === undefined ? null : parseEtime(rawEtime),
      command: parts.slice(3).join(" "),
    });
  }
  return rows;
}

export function collect(psBin: string = psBinFromEnv()): CollectResult {
  let text: string;
  try {
    text = execFileSync(psBin, ["-eo", "pid=,ppid=,etime=,command="], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      timeout: PS_TIMEOUT_MS,
    });
  } catch (e) {
    const err = e as { code?: string; status?: number; message?: string; signal?: string | null };
    if (err.code === "ETIMEDOUT" || err.signal === "SIGTERM") {
      return { ok: false, problem: "ps-timeout", detail: `ps exceeded ${PS_TIMEOUT_MS}ms` };
    }
    return {
      ok: false,
      problem: err.code === "ENOENT" ? "ps-unavailable" : "ps-failed",
      detail: err.message ?? String(err.status ?? "unknown"),
    };
  }
  return { ok: true, rows: parsePsOutput(text) };
}
```

**Note on `maxBuffer`:** the default 1 MB is close to a full `ps -eo command=` read on this machine (measured ~199 KB for 679 rows, but worker command lines are ~617 characters each and the count grows with concurrent arcs). 64 MB removes the cap as a failure mode rather than trading it for a bigger number to outgrow — the same reasoning as `tests/mutation/source/runner.ts:167-174`.

- [ ] **Step 5: Run tests to verify they pass.** Run: `pnpm vitest run tests/heavyReap/collect.test.ts`. Expected: PASS.
- [ ] **Step 6: Typecheck.** Run: `pnpm typecheck`. Expected: PASS.
- [ ] **Step 7: Commit.**

```bash
git add lib/heavyReap/collect.ts tests/heavyReap/collect.test.ts \
  tests/heavyReap/fixtures/ps-sample.txt tests/heavyReap/fixtures/fake-ps.mjs
git commit -m "feat(infra): collect and parse the process table"
```

### Task 3: The CLI adapter

<!-- task: red=`pnpm vitest run tests/heavyReap/cli.test.ts` red-state=authored red-target=`scripts/heavy-reap.ts` why=`scripts/heavy-reap.ts does not exist, so the suite cannot import parseFlags, readCeiling, planTargets, executeKills or exitStatus` ac=AC-3b,AC-5,AC-5b,AC-6 -->

**Files:**
- Create: scripts/heavy-reap.ts
- Modify: package.json (add `heavy:reap`)
- Test: tests/heavyReap/cli.test.ts
- Consumes: tests/heavyReap/fixtures/fake-ps.mjs from Task 2 — the end-to-end cases need it

**Interfaces:**
- Consumes: `classify`, `Decision`, `DEFAULT_MIN_AGE_SECONDS` (Task 1); `collect` (Task 2).
- Produces: `parseFlags`, `readCeiling`, `planTargets`, `executeKills`, `exitStatus`, `readIdentity`, `KillOutcome`, `TargetIdentity`, `Flags`, `Ceiling`, `KillDeps`. Nothing later consumes these; the CLI is the top of the stack.

**What is red and why:** the module is absent. Production surface: scripts/heavy-reap.ts.

Decision logic is exported as pure functions so it is testable without killing anything; only the signal and the identity read are injected.

- [ ] **Step 1: Write the failing test.** tests/heavyReap/cli.test.ts:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MIN_AGE_SECONDS, type Decision } from "../../lib/heavyReap/classify";
import {
  type IdentityRead,
  type TargetIdentity,
  readIdentity,
  type KillOutcome,
  executeKills,
  exitStatus,
  parseFlags,
  planTargets,
  readCeiling,
  selfAncestry,
  stillAlive,
} from "../../scripts/heavy-reap";

const reap = (pid: number): Decision => ({ pid, reap: true, shape: "forks.js", ageSeconds: 99_999 });
const ident = (pid: number) => ({ pid, startedAt: "Sun Aug 16 09:35:23 2026", command: "node x" });
const read = (pid: number): IdentityRead => ({ state: "read", identity: ident(pid) });
const planned = (pid: number) => new Map<number, IdentityRead>([[pid, read(pid)]]);

describe("parseFlags: AC-6", () => {
  it.each([
    [[], { kill: false, all: false, quiet: false }],
    [["--all"], { kill: false, all: true, quiet: false }],
    [["--kill"], { kill: true, all: false, quiet: false }],
    [["--kill", "--quiet"], { kill: true, all: false, quiet: true }],
  ])("%j", (argv, expected) => {
    expect(parseFlags(argv)).toMatchObject(expected);
  });

  it("--all never widens what is killed", () => {
    expect(parseFlags(["--all"]).kill).toBe(false);
  });
});

describe("readCeiling: C3 and C4", () => {
  it("C3: unset uses 14400 with no rejection", () => {
    expect(readCeiling(undefined)).toEqual({ seconds: 14400, source: "default" });
    expect(DEFAULT_MIN_AGE_SECONDS).toBe(14400);
  });

  it.each([["abc"], ["-5"], ["0"], [""], ["1.5"]])("C4: rejects %s", (raw) => {
    expect(readCeiling(raw).rejected).toBe(raw);
  });

  it("accepts a valid override", () => {
    expect(readCeiling("60")).toMatchObject({ seconds: 60, source: "env" });
  });
});

describe("planTargets: AC-5", () => {
  it("plans the root FIRST, then its recorded descendants", () => {
    const rows = [
      { pid: 10, ppid: 1 },
      { pid: 11, ppid: 10 },
      { pid: 12, ppid: 11 },
      { pid: 20, ppid: 1 },
    ];
    expect(planTargets([reap(10)], rows)).toEqual([10, 11, 12]);
  });

  it("plans nothing when no decision reaps", () => {
    expect(planTargets([{ pid: 10, reap: false, because: "too-young" }], [])).toEqual([]);
  });

  it("does not loop on a parent cycle", () => {
    expect(
      planTargets([reap(10)], [
        { pid: 10, ppid: 11 },
        { pid: 11, ppid: 10 },
      ]),
    ).toEqual([10, 11]);
  });

  it("K5: a descendant absent from the SNAPSHOT is not in this run's plan", () => {
    const snapshot = [{ pid: 10, ppid: 1 }];
    expect(planTargets([reap(10)], snapshot)).toEqual([10]);
    // and once it appears in a later snapshot, the next run picks it up
    expect(planTargets([reap(10)], [...snapshot, { pid: 11, ppid: 10 }])).toEqual([10, 11]);
  });
});

describe("selfAncestry: AC-4", () => {
  it("walks up to init and stops", () => {
    const rows = [
      { pid: 5, ppid: 4 },
      { pid: 4, ppid: 3 },
      { pid: 3, ppid: 1 },
    ];
    expect(selfAncestry(5, rows)).toEqual([4, 3]);
  });

  it("terminates on a cycle", () => {
    expect(
      selfAncestry(5, [
        { pid: 5, ppid: 6 },
        { pid: 6, ppid: 5 },
      ]),
    ).toEqual([6]);
  });
});

describe("executeKills: AC-5, AC-5b", () => {
  it("K2: a changed identity is NOT signalled", () => {
    const signalled: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: () => ({
        state: "read",
        identity: { pid: 10, startedAt: "Sun Aug 16 10:00:00 2026", command: "node x" },
      }),
      kill: (pid) => {
        signalled.push(pid);
      },
      stillAlive: () => false,
    });
    expect(signalled).toEqual([]);
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "identity-changed" }]);
  });

  it("AC-5b: an advanced etime and a changed ppid do NOT block the signal", () => {
    // Both identities carry ppid/etime that DIFFER. If an implementation ever adds either to the
    // comparison, this fails; asserting on two identical objects could not detect that.
    const before = { ...ident(10), ppid: 1, etimeSeconds: 100 } as unknown as TargetIdentity;
    const current = { ...ident(10), ppid: 99, etimeSeconds: 5_000 } as unknown as TargetIdentity;
    const signalled: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: new Map<number, IdentityRead>([[10, { state: "read", identity: before }]]),
      readIdentity: () => ({ state: "read", identity: current }),
      kill: (pid) => {
        signalled.push(pid);
      },
      stillAlive: () => false,
    });
    expect(signalled).toEqual([10]);
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "killed" }]);
  });

  it("AC-5b: readIdentity's own output carries exactly the triple, and nothing else", () => {
    const r = readIdentity(process.pid);
    expect(r.state).toBe("read");
    if (r.state === "read") expect(Object.keys(r.identity).sort()).toEqual(["command", "pid", "startedAt"]);
  });

  it("K1: a pid gone BEFORE the identity read is already-gone", () => {
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: () => ({ state: "gone" }),
      kill: () => undefined,
      stillAlive: () => false,
    });
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "already-gone" }]);
  });

  it("K1: a pid gone AFTER the identity read (kill throws ESRCH) is also already-gone", () => {
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: read,
      kill: () => {
        throw Object.assign(new Error("no such process"), { code: "ESRCH" });
      },
      stillAlive: () => false,
    });
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "already-gone" }]);
  });

  it("an UNREADABLE identity is never conflated with a gone process", () => {
    const signalled: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: () => ({ state: "unreadable", detail: "EPERM" }),
      kill: (pid) => {
        signalled.push(pid);
      },
      stillAlive: () => false,
    });
    expect(signalled).toEqual([]);
    expect(out[0]).toMatchObject({ pid: 10, result: "identity-unreadable" });
  });

  it.each([
    ["a later successful read", { state: "read", identity: ident(10) } as IdentityRead],
    ["a later gone", { state: "gone" } as IdentityRead],
  ])("K6: a PLAN-TIME unreadable stays unreadable, and is NOT re-read, despite %s", (_label, second) => {
    const signalled: number[] = [];
    const reads: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: new Map<number, IdentityRead>([
        [10, { state: "unreadable", detail: "EPERM" }],
      ]),
      readIdentity: (pid) => {
        reads.push(pid);
        return second;
      },
      kill: (pid) => {
        signalled.push(pid);
      },
      stillAlive: () => false,
    });
    expect(signalled).toEqual([]);
    // Spec §6.1: a target whose classification read failed is K6 on that evidence alone, so the
    // second read is not taken. Counting the reads is what makes this case non-vacuous - the
    // injected `second` value is deliberately one that WOULD change the outcome if it were read.
    expect(reads).toEqual([]);
    expect(out[0]).toMatchObject({ pid: 10, result: "identity-unreadable" });
  });

  it("K1: a PLAN-TIME gone stays already-gone, and is NOT re-read", () => {
    const reads: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: new Map<number, IdentityRead>([[10, { state: "gone" }]]),
      readIdentity: (pid) => {
        reads.push(pid);
        return read(pid);
      },
      kill: () => undefined,
      stillAlive: () => false,
    });
    expect(reads).toEqual([]);
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "already-gone" }]);
  });

  it("a target WITH a usable plan-time identity IS read a second time", () => {
    const reads: number[] = [];
    executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: (pid) => {
        reads.push(pid);
        return read(pid);
      },
      kill: () => undefined,
      stillAlive: () => false,
    });
    expect(reads).toEqual([10]); // exactly one SECOND read, per spec §6.1's "at most two"
  });

  it("K3: a failing kill is reported per pid and does not stop the run", () => {
    const out = executeKills([10, 11], {
      identityAtPlan: new Map<number, IdentityRead>([
        [10, read(10)],
        [11, read(11)],
      ]),
      readIdentity: read,
      kill: (pid) => {
        if (pid === 10) throw Object.assign(new Error("nope"), { code: "EPERM" });
      },
      stillAlive: () => false,
    });
    expect(out.map((o) => o.result)).toEqual(["failed", "killed"]);
  });

  it("K4: a recorded target alive after the re-scan is partial", () => {
    const out = executeKills([10], {
      identityAtPlan: planned(10),
      readIdentity: read,
      kill: () => undefined,
      stillAlive: (pid) => pid === 10,
    });
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "partial" }]);
  });
});

describe("stillAlive: K4's settle, on the production function", () => {
  it("a process that exits DURING the window is reported gone, and without the settle is not", () => {
    const pid = Number(
      execFileSync(
        "sh",
        ["-c", `${process.execPath} -e 'setTimeout(() => {}, 150)' >/dev/null 2>&1 & echo $!`],
        { encoding: "utf8" },
      ).trim(),
    );
    // One attempt is the no-settle implementation: it sees the process still up.
    expect(stillAlive(pid, 1, 0)).toBe(true);
    // Four 50 ms attempts outlast the exit, which is exactly what K4 requires. Deleting the retry
    // makes this fail, which no injected-stub case could detect.
    expect(stillAlive(pid, 8, 50)).toBe(false);
  }, 30_000);
});

describe("exitStatus: §6.2", () => {
  const base = { collectFailed: false, ceilingRejected: false };
  it.each([
    ["C1", { collectFailed: true, outcomes: [] }, 1],
    ["C4", { ceilingRejected: true, outcomes: [] }, 1],
    ["K2", { outcomes: [{ pid: 1, result: "identity-changed" as const }] }, 1],
    ["identity-unreadable", { outcomes: [{ pid: 1, result: "identity-unreadable" as const }] }, 1],
    ["K3", { outcomes: [{ pid: 1, result: "failed" as const }] }, 1],
    ["K4", { outcomes: [{ pid: 1, result: "partial" as const }] }, 1],
    ["K1", { outcomes: [{ pid: 1, result: "already-gone" as const }] }, 0],
    ["clean kill", { outcomes: [{ pid: 1, result: "killed" as const }] }, 0],
    ["C2/C3", { outcomes: [] }, 0],
  ])("%s", (_id, state, code) => {
    expect(exitStatus({ ...base, ...state })).toBe(code);
  });
});


// ---------------------------------------------------------------------------
// readIdentity at its REAL boundary. Everything above injects IdentityRead
// states into executeKills; without these, deleting readIdentity's timeout or
// collapsing its errors back into "gone" would leave every case green
// (plan round 2 finding 4).
// ---------------------------------------------------------------------------
const FAKE_PS = new URL("./fixtures/fake-ps.mjs", import.meta.url).pathname;

describe("readIdentity: the K1 / K6 boundary, executed", () => {
  it("reads a live identity into the triple", () => {
    const r = readIdentity(4242, FAKE_PS);
    expect(r.state).toBe("read");
    if (r.state === "read") expect(r.identity.command).toContain("worker-4242");
  });

  it("K1: ps exiting 1 with NO output means gone", () => {
    process.env.FAKE_PS_IDENTITY_GONE = "4242";
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("gone");
    } finally {
      delete process.env.FAKE_PS_IDENTITY_GONE;
    }
  });

  it("K6: ps exiting 1 WITH output is a ps error, never gone", () => {
    process.env.FAKE_PS_MODE = "identity-noisy-fail";
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("unreadable");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
  });

  it("K6: ps exiting 1 with a STDERR-only diagnostic is a ps error, never gone", () => {
    process.env.FAKE_PS_MODE = "identity-stderr-fail";
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("unreadable");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
  });

  it("K6: any other ps failure is unreadable", () => {
    process.env.FAKE_PS_MODE = "identity-fail";
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("unreadable");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
  });

  it("K6: a missing ps binary is unreadable, never gone", () => {
    expect(readIdentity(4242, "/definitely/not/a/real/ps").state).toBe("unreadable");
  });

  it("AC-8: a hanging identity read is bounded and reported unreadable", () => {
    process.env.FAKE_PS_MODE = "identity-hang";
    const started = Date.now();
    try {
      expect(readIdentity(4242, FAKE_PS).state).toBe("unreadable");
    } finally {
      delete process.env.FAKE_PS_MODE;
    }
    expect(Date.now() - started).toBeLessThan(20_000);
  }, 40_000);
});

// ---------------------------------------------------------------------------
// The CLI ITSELF, executed. `ps` is replaced via FX_REAP_PS_BIN, and every table
// these cases feed it is built from pids the TEST SPAWNED, so --kill can only
// ever signal a process this suite owns (plan round 3 finding 1). Fixed literal
// pids would be recyclable and could name someone else's process.
// ---------------------------------------------------------------------------
const CLI = new URL("../../scripts/heavy-reap.ts", import.meta.url).pathname;
const KILL_LINE =
  /heavy-reap: (killed|already-gone|failed|partial|identity-changed|identity-unreadable) pid=/;
const WORKER_CMD = "/usr/bin/node /x/node_modules/vitest/dist/workers/forks.js";
const OLD = "1-05:29:53";

type Row = { pid: number; ppid: number; etime: string; command: string } | string;

function runCli(
  args: string[],
  table: Row[],
  env: Record<string, string> = {},
): { out: string; code: number } {
  try {
    const out = execFileSync("pnpm", ["exec", "tsx", CLI, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        FX_REAP_PS_BIN: FAKE_PS,
        FAKE_PS_TABLE: JSON.stringify(table),
        ...env,
      },
      timeout: 120_000,
    });
    return { out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { out: err.stdout ?? "", code: err.status ?? -1 };
  }
}

/**
 * A real process this suite created, spawned so that it REPARENTS TO INIT.
 *
 * Two reasons it is a grandchild rather than a direct child. It matches what the reaper actually
 * targets, `ppid == 1`, so the fake table's claim is true rather than a fiction. And a direct
 * child that is SIGKILLed becomes a ZOMBIE until this process reaps it, while `kill(pid, 0)`
 * succeeds on a zombie, so the reaper's verification re-scan would report `partial` for a process
 * it had just killed. Init reaps an orphan immediately, so a real orphan never has that problem.
 */
function spawnOrphan(): { pid: number; alive: () => boolean; kill: () => void } {
  const pid = Number(
    execFileSync(
      "sh",
      [
        "-c",
        // stdio to /dev/null, or execFileSync waits on the inherited pipe until the orphan exits.
        `${process.execPath} -e 'setTimeout(() => {}, 60000)' >/dev/null 2>&1 & echo $!`,
      ],
      { encoding: "utf8" },
    ).trim(),
  );
  return {
    pid,
    alive: () => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    },
    kill: () => {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    },
  };
}

describe("the CLI, executed end to end", () => {
  it("AC-6: the default reports candidates with reasons and kills NOTHING", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: 777001, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
        { pid: 777002, ppid: 777001, etime: OLD, command: WORKER_CMD },
      ];
      const { out, code } = runCli([], table);
      expect(out).toContain(`REAPABLE pid=${owned.pid}`);
      expect(out).toContain("1 candidate(s)");
      expect(out).toContain("skip 777001 (not-a-worker)"); // orphan-shaped decline, WITH its reason
      expect(out).not.toContain("skip 777002"); // ppid != 1, so not orphan-shaped
      expect(out).not.toMatch(KILL_LINE);
      expect(code).toBe(0);
      expect(owned.alive()).toBe(true); // the default is non-destructive, observed on a real process
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("AC-6: --all adds the non-orphan and the unparsable row, each with its reason", () => {
    const table: Row[] = [
      { pid: 777001, ppid: 777002, etime: OLD, command: WORKER_CMD },
      { pid: 777002, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
      "garbage-line-with-no-pid",
    ];
    const { out } = runCli(["--all"], table);
    expect(out).toContain("skip 777001 (has-live-parent)");
    expect(out).toContain("skip unparsable");
    expect(out).not.toMatch(KILL_LINE);
  }, 180_000);

  it("§6.2: --kill prints one KillOutcome line per target, and keeps the default report", () => {
    const root = spawnOrphan();
    const kid = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: root.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: kid.pid, ppid: root.pid, etime: OLD, command: WORKER_CMD },
      ];
      const { out } = runCli(["--kill"], table);
      expect(out).toContain(`REAPABLE pid=${root.pid}`); // the default report is retained
      expect(out).toContain(`killed pid=${root.pid}`);
      expect(out).toContain(`killed pid=${kid.pid}`); // per TARGET, not just the first
      expect(root.alive()).toBe(false);
      expect(kid.alive()).toBe(false); // the recorded subtree, really killed
    } finally {
      root.kill();
      kid.kill();
    }
  }, 180_000);

  it("C4: a rejected ceiling stops the run BEFORE the table is read, exit non-zero", () => {
    const { out, code } = runCli([], [], { FX_REAP_MIN_AGE_S: "-5" });
    expect(out).toContain("rejected: -5");
    expect(out).not.toContain("rows read");
    expect(code).toBe(1);
  }, 180_000);

  it("C1: an unreadable table names the failure and exits non-zero", () => {
    const { out, code } = runCli([], [], { FX_REAP_PS_BIN: "/definitely/not/a/real/ps" });
    expect(out).toContain("ps-unavailable"); // the problem is NAMED, not just 'cannot read'
    expect(out).not.toContain("candidate(s)");
    expect(code).toBe(1);
  }, 180_000);

  it("C2: an EMPTY table reports zero rows rather than saying nothing", () => {
    const { out, code } = runCli([], []);
    expect(out).toContain("0 rows read");
    expect(out).toContain("0 candidate(s)");
    expect(code).toBe(0);
  }, 180_000);

  it("--quiet suppresses declines and plain successes, never a non-success outcome (K2)", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [
        { pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD },
        { pid: 777001, ppid: 1, etime: OLD, command: "/usr/bin/pnpm exec vitest run" },
      ];
      const { out, code } = runCli(["--kill", "--quiet"], table, {
        FAKE_PS_IDENTITY_DRIFT: "1",
        TMPDIR: mkdtempSync(join(tmpdir(), "fake-ps-drift-")),
      });
      expect(out).not.toContain("skip "); // declines suppressed
      expect(out).toContain(`identity-changed pid=${owned.pid}`); // K2 always visible
      expect(out).toContain("REAPABLE"); // candidates are NOT declines, so they stay
      expect(code).toBe(1);
      expect(owned.alive()).toBe(true); // K2 means no signal was sent
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("--quiet suppresses a successful `killed` line too", () => {
    const owned = spawnOrphan();
    try {
      const table: Row[] = [{ pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD }];
      const { out } = runCli(["--kill", "--quiet"], table);
      expect(out).not.toContain("killed pid=");
      expect(owned.alive()).toBe(false); // suppressed in the REPORT, still performed
    } finally {
      owned.kill();
    }
  }, 180_000);

  it("--quiet suppresses K1 already-gone too, since it is a plain success", () => {
    const owned = spawnOrphan();
    owned.kill(); // gone BEFORE the reaper runs, so the target reads as already-gone
    const table: Row[] = [{ pid: owned.pid, ppid: 1, etime: OLD, command: WORKER_CMD }];
    const { out } = runCli(["--kill", "--quiet"], table, { FAKE_PS_IDENTITY_GONE: String(owned.pid) });
    expect(out).not.toContain("already-gone");
  }, 180_000);

  it("--quiet keeps C4 visible", () => {
    const { out, code } = runCli(["--kill", "--quiet"], [], { FX_REAP_MIN_AGE_S: "abc" });
    expect(out).toContain("rejected: abc");
    expect(code).toBe(1);
  }, 180_000);
});

describe("package wiring", () => {
  it("exposes heavy:reap so the tool is reachable by name", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["heavy:reap"]).toBe("tsx scripts/heavy-reap.ts");
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm vitest run tests/heavyReap/cli.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/heavy-reap'`.

- [ ] **Step 3: Write minimal implementation.** scripts/heavy-reap.ts:

```ts
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_MIN_AGE_SECONDS, type Decision, classify } from "../lib/heavyReap/classify";
import { PS_TIMEOUT_MS, collect, psBinFromEnv } from "../lib/heavyReap/collect";

export type Flags = { kill: boolean; all: boolean; quiet: boolean };

export function parseFlags(argv: readonly string[]): Flags {
  return {
    kill: argv.includes("--kill"),
    all: argv.includes("--all"),
    quiet: argv.includes("--quiet"),
  };
}

export type Ceiling = { seconds: number; source: "default" | "env"; rejected?: string };

export function readCeiling(raw: string | undefined): Ceiling {
  if (raw === undefined) return { seconds: DEFAULT_MIN_AGE_SECONDS, source: "default" };
  const n = Number(raw);
  if (raw.trim().length === 0 || !Number.isInteger(n) || n <= 0) {
    return { seconds: DEFAULT_MIN_AGE_SECONDS, source: "default", rejected: raw };
  }
  return { seconds: n, source: "env" };
}

/** Root first, then its recorded descendants (spec §4.4, the kill-order note under K2). */
export function planTargets(
  decisions: readonly Decision[],
  rows: readonly { pid: number; ppid: number | null }[],
): number[] {
  const children = new Map<number, number[]>();
  for (const r of rows) {
    if (r.ppid === null) continue;
    const list = children.get(r.ppid);
    if (list) list.push(r.pid);
    else children.set(r.ppid, [r.pid]);
  }
  const out: number[] = [];
  const seen = new Set<number>();
  for (const d of decisions) {
    if (!("pid" in d) || d.reap !== true) continue;
    const queue = [d.pid];
    while (queue.length > 0) {
      const pid = queue.shift();
      if (pid === undefined || seen.has(pid)) continue;
      seen.add(pid);
      out.push(pid);
      queue.push(...(children.get(pid) ?? []));
    }
  }
  return out;
}

export type TargetIdentity = { pid: number; startedAt: string; command: string };

/**
 * Tri-state on purpose: "gone" and "unreadable" must never collapse. K1 is an ordinary outcome,
 * while an identity read that FAILED is a reason not to signal at all.
 */
export type IdentityRead =
  | { state: "read"; identity: TargetIdentity }
  | { state: "gone" }
  | { state: "unreadable"; detail: string };

export type KillOutcome = {
  pid: number;
  result: "killed" | "already-gone" | "failed" | "partial" | "identity-changed" | "identity-unreadable";
  detail?: string;
};

export type KillDeps = {
  /**
   * The PLAN-TIME read, kept as the full IdentityRead rather than a bare identity.
   *
   * Storing only the successful reads loses the difference between "we never read it" and "we read
   * it and it was gone/unreadable", and the outcome would then be decided by the SECOND read
   * alone: an initial K6 followed by a successful read would report `identity-changed`, and one
   * followed by a gone would report `already-gone` with exit 0. K6 must survive.
   */
  identityAtPlan: ReadonlyMap<number, IdentityRead>;
  readIdentity: (pid: number) => IdentityRead;
  kill: (pid: number) => void;
  stillAlive: (pid: number) => boolean;
};

const isEsrch = (e: unknown): boolean => (e as { code?: string }).code === "ESRCH";

export function executeKills(targets: readonly number[], deps: KillDeps): KillOutcome[] {
  const outcomes: KillOutcome[] = [];
  const signalled: number[] = [];
  for (const pid of targets) {
    const planned = deps.identityAtPlan.get(pid);
    // A plan-time read that FAILED is K6 on its own terms; the second read cannot rehabilitate it.
    if (planned !== undefined && planned.state === "unreadable") {
      outcomes.push({ pid, result: "identity-unreadable", detail: planned.detail });
      continue;
    }
    if (planned !== undefined && planned.state === "gone") {
      outcomes.push({ pid, result: "already-gone" });
      continue;
    }
    const now = deps.readIdentity(pid);
    if (now.state === "gone") {
      outcomes.push({ pid, result: "already-gone" });
      continue;
    }
    if (now.state === "unreadable") {
      outcomes.push({ pid, result: "identity-unreadable", detail: now.detail });
      continue;
    }
    if (
      planned === undefined ||
      planned.state !== "read" ||
      planned.identity.startedAt !== now.identity.startedAt ||
      planned.identity.command !== now.identity.command
    ) {
      outcomes.push({ pid, result: "identity-changed" });
      continue;
    }
    try {
      deps.kill(pid);
      signalled.push(pid);
    } catch (e) {
      // K1: the target can exit between the identity read and the signal; ESRCH is that race,
      // and it is an ordinary outcome rather than a failure.
      if (isEsrch(e)) outcomes.push({ pid, result: "already-gone" });
      else outcomes.push({ pid, result: "failed", detail: String((e as { code?: string }).code ?? e) });
    }
  }
  for (const pid of signalled) {
    outcomes.push(deps.stillAlive(pid) ? { pid, result: "partial" } : { pid, result: "killed" });
  }
  return outcomes.sort((a, b) => targets.indexOf(a.pid) - targets.indexOf(b.pid));
}

export function exitStatus(state: {
  collectFailed: boolean;
  ceilingRejected: boolean;
  outcomes: readonly KillOutcome[];
}): number {
  if (state.collectFailed || state.ceilingRejected) return 1;
  return state.outcomes.some((o) => o.result !== "killed" && o.result !== "already-gone") ? 1 : 0;
}

/** `ps -o lstart=,command= -p <pid>`: one bounded read per target, never for the whole table. */
export function readIdentity(pid: number, psBin: string = psBinFromEnv()): IdentityRead {
  let out: string;
  try {
    out = execFileSync(psBin, ["-o", "lstart=,command=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: PS_TIMEOUT_MS,
    }).trim();
  } catch (e) {
    const err = e as { status?: number; code?: string; message?: string };
    // ps exits 1 with NO OUTPUT for a pid that does not exist. Status 1 WITH output is a ps
    // error, and anything else is a read failure; both are K6 and must never be reported as a
    // gone process, which would signal nothing while claiming an ordinary success.
    // `gone` requires ps's exact "no such pid" shape: status 1 and NOTHING on either stream.
    // A diagnostic on EITHER channel is a ps error, so checking only stdout would classify a
    // stderr-only failure as gone and report an ordinary success having signalled nothing.
    const out = String((e as { stdout?: unknown }).stdout ?? "").trim();
    const errOut = String((e as { stderr?: unknown }).stderr ?? "").trim();
    if (err.status === 1 && out.length === 0 && errOut.length === 0) return { state: "gone" };
    return { state: "unreadable", detail: err.code ?? err.message ?? "ps failed" };
  }
  if (out.length === 0) return { state: "gone" };
  const tokens = out.split(/\s+/);
  return {
    state: "read",
    identity: { pid, startedAt: tokens.slice(0, 5).join(" "), command: tokens.slice(5).join(" ") },
  };
}

/** Sleep synchronously, so the verification re-scan can settle without going async. */
function sleepMs(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const exists = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM means the process EXISTS but belongs to another user. Counting it dead would report a
    // kill that never happened.
    return (e as { code?: string }).code === "EPERM";
  }
};

/**
 * K4's verification, with a bounded settle.
 *
 * SIGKILL is asynchronous: the kernel tears the process down after `kill` returns, and a check
 * issued immediately can still see it. Without the retry the reaper reports `partial` for a target
 * it killed correctly, which is a false alarm and a false non-zero exit. Four 50 ms attempts cost
 * nothing when the process is already gone, because the first check returns.
 */
export function stillAlive(pid: number, attempts = 4, waitMs = 50): boolean {
  for (let i = 0; i < attempts; i += 1) {
    if (!exists(pid)) return false;
    if (i < attempts - 1) sleepMs(waitMs);
  }
  return true;
}

/** Ancestry of this process, so AC-4 can exempt it and everything above it. */
export function selfAncestry(
  selfPid: number,
  rows: readonly { pid: number; ppid: number | null }[],
): number[] {
  const byPid = new Map(rows.map((r) => [r.pid, r.ppid]));
  const out: number[] = [];
  const seen = new Set<number>([selfPid]);
  let cursor = byPid.get(selfPid) ?? null;
  while (cursor !== null && cursor > 1 && !seen.has(cursor)) {
    out.push(cursor);
    seen.add(cursor);
    cursor = byPid.get(cursor) ?? null;
  }
  return out;
}

export function main(argv: readonly string[], env: NodeJS.ProcessEnv): number {
  const flags = parseFlags(argv);
  const ceiling = readCeiling(env.FX_REAP_MIN_AGE_S);
  const say = (line: string): void => {
    process.stdout.write(`${line}\n`);
  };

  // C4 short-circuits BEFORE collection: a rejected ceiling means the run was never configured,
  // so it must not read the table or signal anything.
  if (ceiling.rejected !== undefined) {
    say(`heavy-reap: FX_REAP_MIN_AGE_S rejected: ${ceiling.rejected}; nothing reaped`);
    return exitStatus({ collectFailed: false, ceilingRejected: true, outcomes: [] });
  }

  const world = collect();
  if (!world.ok) {
    say(`heavy-reap: cannot read the process table (${world.problem}: ${world.detail})`);
    return exitStatus({ collectFailed: true, ceilingRejected: false, outcomes: [] });
  }

  const parsed = world.rows.filter(
    (r): r is Extract<typeof r, { kind: "parsed" }> => r.kind === "parsed",
  );
  const result = classify(world.rows, {
    minAgeSeconds: ceiling.seconds,
    minAgeSource: ceiling.source,
    selfPid: process.pid,
    selfAncestry: selfAncestry(process.pid, parsed),
  });
  for (const note of result.configNotes) say(`heavy-reap: ${note}`);
  say(`heavy-reap: ${world.rows.length} rows read`);

  const candidates = result.decisions.filter((d) => d.reap === true);
  // §6.2: the DEFAULT reports every candidate and every declined process that is ORPHAN-SHAPED
  // (`ppid == 1`); `--all` adds the rest. Orphan-ness is a property of the row, not of the
  // decision, so it is looked up here rather than inferred from `because`.
  const ppidOf = new Map(parsed.map((r) => [r.pid, r.ppid]));
  for (const d of result.decisions) {
    if (d.reap === true) {
      say(`heavy-reap: REAPABLE pid=${d.pid} shape=${d.shape} age=${d.ageSeconds}s`);
      continue;
    }
    if (flags.quiet) continue; // --quiet suppresses DECLINES only
    if (!("pid" in d)) {
      if (flags.all) say(`heavy-reap: skip unparsable (${d.detail})`);
      continue;
    }
    if (flags.all || ppidOf.get(d.pid) === 1) say(`heavy-reap: skip ${d.pid} (${d.because})`);
  }
  say(`heavy-reap: ${candidates.length} candidate(s)`);

  if (!flags.kill) return exitStatus({ collectFailed: false, ceilingRejected: false, outcomes: [] });

  const targets = planTargets(result.decisions, parsed);
  const identityAtPlan = new Map<number, IdentityRead>();
  for (const pid of targets) identityAtPlan.set(pid, readIdentity(pid));
  const outcomes = executeKills(targets, {
    identityAtPlan,
    readIdentity: (pid) => readIdentity(pid),
    kill: (pid) => process.kill(pid, "SIGKILL"),
    stillAlive,
  });
  // §6.2: `--kill` reports one KillOutcome line per target. `--quiet` keeps only what an operator
  // must act on - K2, K3, K4, K6 - and drops BOTH plain successes, `killed` and `already-gone`.
  const plainSuccess = (r: KillOutcome["result"]): boolean => r === "killed" || r === "already-gone";
  for (const o of outcomes) {
    if (flags.quiet && plainSuccess(o.result)) continue;
    say(`heavy-reap: ${o.result} pid=${o.pid}${o.detail ? ` (${o.detail})` : ""}`);
  }
  return exitStatus({ collectFailed: false, ceilingRejected: false, outcomes });
}

if (process.argv[1] !== undefined && process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
```

**Note for the implementer.** `main()` goes at the bottom of the file behind an `import.meta.url`
main-module check, so importing it in a test spawns nothing. Its order is
`readCeiling` → `collect` → `classify` → report → (under `--kill`) `planTargets` → read each
target's identity → `executeKills`: identities are read for the TARGETS, so planning necessarily
comes first. `--quiet` suppresses the DECLINE lines and BOTH plain successes (`killed` and
`already-gone`); K2, K3, K4, K6 and every config note always print, per §6.2. `stillAlive` counts an
`EPERM` process as ALIVE, because such a process exists and belongs to another user, and counting it
dead would report a `killed` that never happened.

- [ ] **Step 4: Run tests.** Run: `pnpm vitest run tests/heavyReap/cli.test.ts`. Expected: every
      case passes EXCEPT `package wiring > exposes heavy:reap`, which stays RED until Step 5 adds
      the alias. That one case is the second half of this task's red-to-green cycle, so a fully
      green run here would mean the alias assertion is missing.

- [ ] **Step 5: Add the script — this is part of the SAME red-to-green cycle.** The suite's
      `package wiring` case asserts the `heavy:reap` script is exactly
      `tsx scripts/heavy-reap.ts`, so it is RED until this edit and GREEN after it, on the same
      command. Without that case the alias could be omitted or misspelled with every declared test
      still green, and only a manual invocation would notice (plan round 3 finding 5). In
      package.json, beside `"heavy"`:

```json
    "heavy:reap": "tsx scripts/heavy-reap.ts",
```

      Re-run `pnpm vitest run tests/heavyReap/cli.test.ts` — GREEN.

- [ ] **Step 6: Run it live and record the output in the commit.**

```bash
pnpm heavy:reap
pnpm heavy:reap --all | tail -20
```

A live run reporting zero rows on a machine with hundreds of processes is a vacuous pass, so paste the actual candidate and decline counts into the commit message. If anything is reported reapable, verify it by hand before Task 7 — the first live `--kill` is irreversible.

- [ ] **Step 7: Typecheck, then commit.**

```bash
pnpm typecheck
git add scripts/heavy-reap.ts tests/heavyReap/cli.test.ts package.json
git commit -m "feat(infra): heavy-reap CLI, report by default and kill only on --kill"
```

<!-- tasks: end -->

<!-- tasks: depth=3 -->

### Task 4: Trigger 1

<!-- task: red=`pnpm vitest run tests/heavyReap/triggerFailOpen.test.ts` ac=AC-8 -->

**Why this task uses the v1 marker while Tasks 1-3 use the red-contract form.** Its production
surface is the `heavy` script, which lives at the repository ROOT in package.json, and a
`red-target=` cannot name it: the arm classifies a citation as a bare shorthand when the path
contains no `/` (`lib/specLint/citations.ts:55`) and rejects bare shorthands in markers
(`lib/specLint/redContract.ts:110`), so package.json:56 draws `RED_TARGET_INVALID` and no legal
spelling of a root-level file exists. Probed at plan time and filed as
`BL-SPECLINT-RED-TARGET-ROOT-FILE`. The red is therefore stated in prose below rather than declared
in a field, and Step 2 pins it with the exact observed counts.

**Files:**
- Modify: package.json:56
- Test: tests/heavyReap/triggerFailOpen.test.ts

**Interfaces:**
- Consumes: scripts/heavy-reap.ts (Task 3).
- Produces: nothing importable.

**What is red and why:** package.json:56 is `"heavy": "python3 scripts/with-heavy-slot.py --"`. The reaper is not in it, so the ordering assertion has nothing to find. Production surface: package.json:56.

- [ ] **Step 1: Write the failing test.** tests/heavyReap/triggerFailOpen.test.ts:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};
const segments = (): string[] =>
  (pkg.scripts.heavy ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

describe("the heavy script wires the reaper AHEAD of the wrapper", () => {
  // A substring match on "heavy-reap" would pass on a report-only invocation, the wrong
  // interpreter, or a segment that merely mentions the name - so each part is asserted
  // separately (plan round 1 finding 5).
  // Anchored to the START of the segment, because a segment that merely CONTAINS the text runs
  // something else: `echo tsx scripts/heavy-reap.ts --kill --quiet` satisfies every unanchored
  // assertion while reaping nothing (plan round 4 finding 4).
  it("invokes the reaper through tsx, by path, as the command itself", () => {
    expect(segments()[0]).toMatch(/^tsx\s+scripts\/heavy-reap\.ts(\s|$)/);
  });

  it("invokes it in DESTRUCTIVE mode, or trigger 1 bounds nothing", () => {
    expect(segments()[0]).toMatch(/(^|\s)--kill(\s|$)/);
  });

  it("invokes it quietly, so admission is not spammed", () => {
    expect(segments()[0]).toMatch(/(^|\s)--quiet(\s|$)/);
  });

  it("makes the WRAPPER the last segment, invoked as the command itself", () => {
    const last = segments()[segments().length - 1];
    expect(last).toMatch(/^python3\s+scripts\/with-heavy-slot\.py(\s|$)/);
    expect(last?.endsWith("--")).toBe(true);
  });

  it.each([
    ["echo tsx scripts/heavy-reap.ts --kill --quiet", "a non-live reaper segment"],
    ["echo python3 scripts/with-heavy-slot.py --", "a non-live wrapper segment"],
  ])("rejects %s (%s)", (segment) => {
    // The escape the anchors close, asserted directly rather than trusted.
    expect(segment).not.toMatch(/^tsx\s+scripts\/heavy-reap\.ts(\s|$)/);
    expect(segment).not.toMatch(/^python3\s+scripts\/with-heavy-slot\.py(\s|$)/);
  });

  it("sequences with ';' and never '&&', so a failing reaper cannot block admission", () => {
    expect(pkg.scripts.heavy).not.toContain("&&");
  });
});

describe("AC-8 fail-open, executed against real pnpm", () => {
  const build = (reaper: string, wrapper = "node show.js --"): string => {
    const dir = mkdtempSync(join(tmpdir(), "heavy-trigger-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "trigger-probe",
        version: "0.0.0",
        scripts: { heavy: `${reaper}; ${wrapper}` },
      }),
    );
    writeFileSync(
      join(dir, "show.js"),
      "console.log('ARGV ' + JSON.stringify(process.argv.slice(2)));",
    );
    writeFileSync(join(dir, "fail.js"), "process.exit(3);");
    writeFileSync(
      join(dir, "exit42.js"),
      "console.log('ARGV ' + JSON.stringify(process.argv.slice(2))); process.exit(42);",
    );
    return dir;
  };
  const run = (dir: string, args: string[]): { out: string; code: number } => {
    try {
      return {
        out: execFileSync("pnpm", ["heavy", ...args], { cwd: dir, encoding: "utf8" }),
        code: 0,
      };
    } catch (e) {
      const err = e as { stdout?: string; status?: number };
      return { out: err.stdout ?? "", code: err.status ?? -1 };
    }
  };

  it.each([
    ["absent reaper", "node no-such-reaper.js"],
    ["reaper exiting 3", "node fail.js"],
  ])(
    "%s: the wrapper still runs with identical argv",
    (_label, reaper) => {
      expect(run(build(reaper), ["pnpm", "mutation:guards"]).out).toContain(
        `ARGV ["--","pnpm","mutation:guards"]`,
      );
    },
    120_000,
  );

  it(
    "forwards an explicit '--' through to the wrapper",
    () => {
      expect(run(build("node fail.js"), ["--", "node", "-e", "1"]).out).toContain(
        `ARGV ["--","--","node","-e","1"]`,
      );
    },
    120_000,
  );

  it(
    "still returns the wrapper's own exit status behind a failing reaper",
    () => {
      expect(run(build("node fail.js", "node exit42.js --"), ["x"]).code).toBe(42);
    },
    120_000,
  );
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm vitest run tests/heavyReap/triggerFailOpen.test.ts`
Expected: **FAIL, `3 failed | 8 passed (11)`** — the three failing cases are `invokes the reaper
through tsx, by path, as the command itself`, `invokes it in DESTRUCTIVE mode`, and `invokes it
quietly`, because `scripts.heavy` has ONE segment today and it is the wrapper.

**Which cases are red, and which are invariants — stated because running this at plan time showed
the obvious guess is wrong.** The three named above go red. `makes the WRAPPER the last segment`
and `sequences with ';' and never '&&'` both PASS on today's single-segment script and keep passing
after the edit: they are INVARIANTS pinning the shape the edit must preserve, not part of the
red-to-green cycle. **The three red cases are deliberately split rather than one substring match**:
a single `toContain("heavy-reap")` would go green on a report-only invocation, the wrong
interpreter, or a segment that merely mentions the name. Each is also ANCHORED to the start of the
segment, because an unanchored match is satisfied by `echo tsx scripts/heavy-reap.ts --kill
--quiet`, which reaps nothing — a case passing for the wrong reason, and plan review rounds 1 and 4
finding 5 and 4 respectively. Two cases assert that escape is rejected, rather than trusting it. The four `AC-8 fail-open` cases likewise pass before and after, because each
builds its own throwaway package and never reads package.json:56 — they pin `pnpm`'s argument
forwarding, which the edit relies on but does not change. So the red-to-green transition on this
command is carried by those three cases, and the remaining eight are regression guards. Do not
"strengthen" them
into red cases by making them read the repo's script; that would couple every invariant to one
edit and lose the distinction.

- [ ] **Step 3: Edit package.json:56.**

```json
    "heavy": "tsx scripts/heavy-reap.ts --kill --quiet; python3 scripts/with-heavy-slot.py --",
```

- [ ] **Step 4: Run tests to verify they pass.** Run: `pnpm vitest run tests/heavyReap/triggerFailOpen.test.ts`. Expected: PASS.

- [ ] **Step 5: Prove the wiring end to end on the real script.**

```bash
pnpm heavy node -e 'console.log("admitted")'
```

Expected: the reaper runs quietly, then `admitted`. Paste into the commit.

- [ ] **Step 6: Commit.**

```bash
git add package.json tests/heavyReap/triggerFailOpen.test.ts
git commit -m "feat(infra): reap orphans before admitting a heavy phase"
```

<!-- tasks: end -->

### Task 5: Mutation enrolment — BEFORE the first diff-stage review dispatch

AC-9. This task GATES the diff review (AGENTS.md convergence bullet 4, spec §9): the round-1 diff brief states the mutation score and the unaccepted-survivor set, so this runs first and its numbers go into that brief.

- [ ] Add the row at `tests/mutation/source/registry.ts:151`:

```ts
  {
    // The heavy-orphan reaper's decision function (2026-08-16 spec §9). One suite:
    // every rule is reachable from a literal row table, which is why the module is
    // pure and the CLI is not the enrolled surface.
    id: "heavyReapClassify",
    sourcePath: "lib/heavyReap/classify.ts",
    suitePaths: ["tests/heavyReap/classify.test.ts"],
    operators: [...OPERATOR_NAMES],
    scoreFloor: 0.9,
    control: {
      from: "export const DEFAULT_MIN_AGE_SECONDS = 14400;",
      to: "export const DEFAULT_MIN_AGE_SECONDS = 1;",
    },
    accepted: [],
  },
```

The `control.from` string occurs exactly once in `classify.ts` — the registry validates that at `tests/mutation/source/registry.ts:88-95`, and a second occurrence fails enrolment.

- [ ] **RED:** `pnpm heavy pnpm mutation:guards`. Expected: FAIL at `tests/mutation/guardSurfaces.gate.test.ts:152` — `EXPECTED_LEDGER_KINDS` has no row for `heavyReapClassify`, and a new surface fails by default until it declares its counts.
- [ ] Add the `EXPECTED_LEDGER_KINDS` row at `tests/mutation/guardSurfaces.gate.test.ts:34`. Declare the kinds COUNTED FROM THE SURFACE with a reachability argument per row, not read back off the ledger. `{}` is the honest declaration for a clean sweep.
- [ ] **GREEN:** `pnpm heavy pnpm mutation:guards`. Record the score and every survivor in the commit. **Repay survivors with cases rather than blessing them** — an `accepted-gap` row on a first enrolment needs its own backlog entry, per the precedent in the gate file's comments.
- [ ] **Known local hazard, so it is not misdiagnosed as this arc's bug:** on a loaded machine the gate can abort with `BaselineNotGreenError` on an UNRELATED surface whose suite exceeds `MUTANT_TIMEOUT_MS` (`tests/mutation/source/runner.ts:49`). Observed 2026-08-16 on `ledgerClaimsCore`, whose two suites pass in 33.6 s when run directly. That class is owned by `fix/local-harness-false-failures`; re-run when the box is quieter rather than filing a duplicate.
- [ ] Commit: `test(infra): enrol the heavy-reap classifier in the source-mutation gate`.

<!-- tasks: depth=3 -->

### Task 6: Docs and ledger

<!-- task: red=`pnpm vitest run tests/docs/agentsHeavyPhaseRule.test.ts` ac=AC-8 -->

**Files:**
- Modify: AGENTS.md (the heavy-phase section)
- Modify: tests/docs/fixtures/agents-heavy-phase-rule.md
- Modify: docs/superpowers/plans/ci/README.md

**What is red and why, and the trap this task exists to avoid.** The heavy-phase bullet in AGENTS.md
is PINNED, byte-for-byte after markdown normalization, to
`tests/docs/fixtures/agents-heavy-phase-rule.md` (`tests/docs/agentsHeavyPhaseRule.test.ts:31`,
compared at `tests/docs/agentsHeavyPhaseRule.test.ts:771-772`). The guard's own message says why and
what to do: the bullet is a cross-CLI contract that Codex sessions read without ever reading the
spec, so an edit that inverts a qualifier "reads as intact to every pattern check", and an
intentional change must "update the fixture in the SAME commit"
(`tests/docs/agentsHeavyPhaseRule.test.ts:437-441`). Documenting trigger 1 changes what
`pnpm heavy` DOES, so it belongs in that bullet rather than beside it — which means this task
necessarily trips the pin, and the fixture update is the green.

- [ ] **Step 1 (RED):** edit the AGENTS.md heavy-phase bullet to state that `pnpm heavy` now runs
      `pnpm heavy:reap --kill --quiet` before admission, that it fails open, and that
      `pnpm heavy:reap` reports without killing while `--kill` is required to kill. Do NOT touch the
      fixture yet. Run `pnpm vitest run tests/docs/agentsHeavyPhaseRule.test.ts` — RED, with
      "the rule's text differs from tests/docs/fixtures/agents-heavy-phase-rule.md".
- [ ] **Step 2 (GREEN):** copy the edited bullet into `tests/docs/fixtures/agents-heavy-phase-rule.md`
      so the two agree. Re-run the SAME command — GREEN.
- [ ] **Step 3:** add the `Stop`-hook install one-liner to AGENTS.md, in the same posture as the
      codex-guard shim install, because the hook is per-machine config this repo cannot install.
      Note explicitly that the hook is a SECOND trigger and that trigger 1 already covers the
      contended case, so a machine without the hook is degraded rather than unprotected.
- [ ] **Step 4:** VERIFY the index rows, do not add them. Both landed with their own commits —
      the plan's at `docs/superpowers/plans/ci/README.md:16` and the spec's in
      `docs/superpowers/specs/ci/README.md`. This step exists because adding a duplicate row is
      the easy mistake here, not because a row is missing.
- [ ] **Step 5:** `BACKLOG.md` needs nothing: `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH` and
      `BL-SPECLINT-RED-TARGET-ROOT-FILE` were both filed at spec and plan time, each observed red
      then green on `tests/docs/_metaLedgerReferentialIntegrity.test.ts`.
- [ ] **Step 6:** `pnpm spec:lint` on the spec and this plan — 0 hard — then
      `pnpm heavy pnpm vitest run tests/docs` — GREEN.
- [ ] **Step 7: Commit.**

```bash
git add AGENTS.md tests/docs/fixtures/agents-heavy-phase-rule.md docs/superpowers/plans/ci/README.md
git commit -m "docs(infra): document the pre-admission reap in the heavy-phase contract"
```

<!-- tasks: end -->

### Task 7: Closeout

- [ ] Gates: `pnpm heavy pnpm test:fast`; then `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check` (unwrapped).
- [ ] Push; open the PR (merge-commit convention).
- [ ] **Adversarial review (cross-model), whole diff, to APPROVE.** The round-1 brief carries Task 5's mutation score and unaccepted-survivor set, plus the spec's consequence bound, `PROBE DOMAIN:` and threat fence (§9), and the do-not-relitigate list from §1.1.
- [ ] Real CI green — not just local.
- [ ] **Final commit — graduation + marker removal** (after review APPROVE and CI green), as a
      red-to-green cycle on ONE command:
      `pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts`.

      **RED first.** Add the row to `BACKLOG_GRADUATED` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:99`)
      BEFORE moving the entry:

      ```ts
        // chore/heavy-orphan-reaper (2026-08-16): the orphaned-worker lifetime row. The arc also
        // corrected the entry's own candidate (c): the slot-membership exemption it proposed is
        // unreachable, so the shipped predicate reads the process tree alone.
        { id: "BL-HEAVY-ORPHAN-WORKER-LIFETIME", provenance: "chore/heavy-orphan-reaper" },
      ```

      The command goes RED because the id is still in `BACKLOG.md` and absent from the archive
      (`tests/docs/_metaDeferralLedgerGraduation.test.ts:640-643`). `provenance` is the string the
      ARCHIVED SECTION must contain, checked inside that section rather than anywhere in the file
      (`tests/docs/_metaDeferralLedgerGraduation.test.ts:646`), so the archive entry must name the
      branch.

      **GREEN.** In the SAME commit: move the entry to `BACKLOG-archive.md` with a section naming
      `chore/heavy-orphan-reaper`, and remove the `**Status:** IN PROGRESS · **Branch:**` marker
      (invariant 12 — archives reject in-flight entries, so the two are inseparable). Re-run the
      SAME command — GREEN. Then `pnpm heavy pnpm vitest run tests/docs` — GREEN.
- [ ] **PUSH the final commit, and wait for CI GREEN on that head.** This step is easy to skip and
      the plan previously did (round 3 finding 6): a graduation commit created after CI has passed
      either never reaches the remote — so the merge lands the PREVIOUS head and leaves the ledger
      marker on the branch — or reaches it unproven. The head that merges is the head CI must have
      passed, and it is also the head whose marker removal invariant 12 requires.
- [ ] **Delta review** of the graduation commit's diff alone — the whole-diff review predates it,
      and review must cover what merges. If it forces a repair, that repair becomes the new final
      commit and this step and the CI wait above BOTH repeat.
- [ ] `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` → `0  0`.

## 12. Closeout

impeccable-gate: N/A — no UI surface
