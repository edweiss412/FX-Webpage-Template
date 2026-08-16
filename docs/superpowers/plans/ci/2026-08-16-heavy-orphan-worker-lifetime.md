# Heavy-phase orphan worker lifetime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound how long a heavy-phase worker process outlives the harness that owns it, without ever reaping a heavy phase that is structurally identifiable as live.

**Architecture:** A pure classifier over the process table plus the heavy semaphore's own slot files decides which processes are orphaned heavy workers; a collector reads that world and reports its own failures; a thin CLI adapter reports by default and kills only under `--kill`. The classifier is enrolled in the source-mutation registry, which is what makes the review's convergence criterion a score rather than an argument.

**Tech Stack:** TypeScript (strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest, `tsx` for the CLI, `ps(1)`, the existing `scripts/with-heavy-slot.py` semaphore (read-only).

**Spec:** `docs/superpowers/specs/ci/2026-08-16-heavy-orphan-worker-lifetime-design.md` — every §-reference below is to it, and the executor reads both. `BL-HEAVY-ORPHAN-WORKER-LIFETIME`.

## Global Constraints

Copied verbatim from the spec; every task's requirements implicitly include these.

- **The three §4.4 tables are the ONLY source for what any condition does.** Code comments and test names cite the row ID (C1-C8, R1-R5, K1-K5); they do not paraphrase the behavior.
- **`scripts/with-heavy-slot.py` is not edited.** Trigger 1 is a `package.json` change. No change to admission control, slot counts, or the wrapper's `execvp` model.
- **Slot state is read, never written.** No task creates, edits, or deletes a file under the slot directory, and no task sets `FX_HEAVY_SLOT_DIR` outside a per-test tmpdir.
- **`tests/mutation/source/runner.ts` and `childRun.ts` are not edited** (spec §11; filed as `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH`).
- **Default ceiling `FX_REAP_MIN_AGE_S` = `14400` seconds (4 h).** One definition, in `classify.ts`; nothing else restates the number.
- **Every heavy phase runs under `pnpm heavy`** — `pnpm test:fast`, any build, any `--project mutation` run. Scoped `vitest run <files>` stays unwrapped.
- **No em-dash in user-visible copy**, and `pnpm spec:lint` runs before every docs commit, not after.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/heavyReap/classify.ts` (new) | Every decision rule. Pure, total, no I/O, no clock. The mutation-registry surface. |
| `lib/heavyReap/collect.ts` (new) | Read the world: `ps` into rows, the slot dir into a `SlotSurvey`. Distinguishes its own failure from an empty world. |
| `scripts/heavy-reap.ts` (new) | CLI adapter: flags, report, kill plan, identity re-check, exit status. Decision logic exported as pure functions; only `process.kill` is injected. |
| `tests/heavyReap/classify.test.ts` (new) | Task 1 |
| `tests/heavyReap/collect.test.ts` (new) | Task 2 |
| `tests/heavyReap/fixtures/` (new) | A committed `ps` sample from this machine; slot-dir fixtures. |
| `tests/heavyReap/cli.test.ts` (new) | Task 3 |
| `tests/heavyReap/triggerFailOpen.test.ts` (new) | Task 4 |
| `package.json:56` (modify) | The `heavy` script gains the pre-admission reap; a new `heavy:reap` script. |
| `tests/mutation/source/registry.ts:151` (modify) | One `GUARD_SURFACES` row. |
| `tests/mutation/guardSurfaces.gate.test.ts:34` (modify) | One `EXPECTED_LEDGER_KINDS` row. |
| `AGENTS.md` (modify) | Document `pnpm heavy:reap`, trigger 1, and the `Stop`-hook install one-liner. |

`tests/heavyReap/` is absent from `PARALLEL_TEST_GLOBS`, so it lands in the SERIAL vitest project by default. That is the correct project — Task 2's live smoke and Task 4's child-process test both spawn processes — and **no wiring change is needed**: `BASE_INCLUDE` already covers `tests/**/*.test.ts`, so `tests/cross-cutting/vitest-projects-partition.test.ts` is satisfied.

## Acceptance criteria → task

| AC | Task |
| --- | --- |
| AC-1, AC-2, AC-3, AC-3b, AC-4 | 1 |
| AC-7 (C1), AC-10 | 2 |
| AC-5, AC-5b, AC-6 | 3 |
| AC-8 | 4 |
| AC-9 | 5 |

## Meta-test inventory

CREATES none. EXTENDS `tests/mutation/source/registry.ts` (one `GUARD_SURFACES` row) and `tests/mutation/guardSurfaces.gate.test.ts` (one `EXPECTED_LEDGER_KINDS` row — a new surface fails by default until it declares its counts). No Supabase call boundary, no advisory lock, no admin mutation surface, no `admin_alerts` row, no UI surface.

## Mutation-operator families — the closure set for review

Declared up front per the mutation-family-closure rule; this enumeration is what the diff-stage review converges against. `classify.ts` enrols with the full declared operator set (`[...OPERATOR_NAMES]`, the shape every current surface uses). A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| Family | Where it bites | Killed by (Task 1 case) |
| --- | --- | --- |
| comparison-operator swap | `ageSeconds >= minAgeSeconds` | the row exactly AT the ceiling |
| boolean-operator swap | the four-clause conjunction | one row failing exactly one clause, per clause |
| negation removal | `ppid === 1` | a row with a live parent |
| literal change | the `1` in `ppid === 1`; `DEFAULT_MIN_AGE_SECONDS` | a row with `ppid === 2`; the C7 case |
| statement removal | the self guard; the undecidable early return | the AC-4 cases; the C3 case |
| return-value swap | `surveyIsDecidable` | the C3 fixture asserting zero reaps |

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

$ grep -n 'FX_HEAVY_DISABLE\|^DEFAULT_SLOT_DIR\|^MARKER_ENV' scripts/with-heavy-slot.py
36:DEFAULT_SLOT_DIR = "/tmp/fx-heavy-slots"
48:MARKER_ENV = "FX_HEAVY_SLOT_HELD"
678:    if env_flag(env, "FX_HEAVY_DISABLE"):

$ grep -c 'tests/heavyReap' vitest.projects.ts   # 0 => new dir defaults to the SERIAL project
0

$ grep -n 'scoreFloor: number\|control: { from' tests/mutation/source/registry.ts | head -3
21:  scoreFloor: number;
36:  control: { from: string; to: string };
171:    control: { from: "const PROXIMITY_WINDOW = 5;", to: "const PROXIMITY_WINDOW = 4;" },
```

Consequence for the task markers: `lib/heavyReap/` and `scripts/heavy-reap.ts` do not exist, so Tasks 1-3 use the PATH-ONLY `red-target=` form (which requires an untracked path). Task 4's target is tracked, so it uses the colon form on `package.json:56`.

---

## Tasks

<!-- tasks: depth=3 red-contract -->

### Task 1: The classifier

<!-- task: red=`pnpm vitest run tests/heavyReap/classify.test.ts` red-state=authored red-target=`lib/heavyReap/classify.ts` why=`lib/heavyReap/classify.ts does not exist, so every case fails at import resolution` ac=AC-1,AC-2,AC-3,AC-3b,AC-4 -->

**Files:**
- Create: `lib/heavyReap/classify.ts`
- Test: `tests/heavyReap/classify.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ProcRow`, `ParsedRow`, `UnparsableRow`, `SlotSurvey`, `SlotProblem`, `ReapConfig`, `Skip`, `Decision`, `Classification`, `DEFAULT_MIN_AGE_SECONDS`, `WORKER_ENTRYPOINTS`, `classify()`, `surveyIsDecidable()`. Tasks 2 and 3 both import from here.

**What is red and why:** the module is absent, so the suite cannot resolve its import. The production surface is `lib/heavyReap/classify.ts` itself.

- [ ] **Step 1: Write the failing test.** `tests/heavyReap/classify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import {
  DEFAULT_MIN_AGE_SECONDS,
  type ParsedRow,
  type ProcRow,
  type ReapConfig,
  type SlotSurvey,
  classify,
  surveyIsDecidable,
} from "../../lib/heavyReap/classify";

const NODE = "/Users/x/.nvm/versions/node/v20.20.1/bin/node";
const FORKS = "/Users/x/node_modules/.pnpm/vitest@4.1.5/node_modules/vitest/dist/workers/forks.js";
const NOW = 1_800_000_000;

const CONFIG: ReapConfig = {
  nowSeconds: NOW,
  minAgeSeconds: DEFAULT_MIN_AGE_SECONDS,
  minAgeSource: "default",
  selfPid: 999,
  selfAncestry: [998, 997],
};
const CLEAN: SlotSurvey = { holderPids: [], problems: [] };

function worker(over: Partial<ParsedRow> = {}): ParsedRow {
  return {
    kind: "parsed",
    pid: 100,
    ppid: 1,
    etimeSeconds: DEFAULT_MIN_AGE_SECONDS + 1,
    command: `${NODE} --experimental-import-meta-resolve ${FORKS}`,
    ...over,
  };
}
const only = (rows: ProcRow[], slots: SlotSurvey = CLEAN, cfg: ReapConfig = CONFIG) =>
  classify(rows, slots, cfg).decisions[0];

describe("classify — AC-1", () => {
  it("reaps a worker-shaped, orphaned, unslotted row past the ceiling", () => {
    expect(only([worker()])).toMatchObject({ pid: 100, reap: true });
  });
});

describe("classify — AC-2, exempt at ANY age", () => {
  const ancient = { etimeSeconds: 10 * 365 * 86_400 };

  it("clause (c): a descendant of a live slot holder is never reaped", () => {
    const rows = [worker({ ...ancient, ppid: 50 }), worker({ pid: 50, ppid: 1, command: "pnpm" })];
    const slots: SlotSurvey = { holderPids: [50], problems: [] };
    expect(classify(rows, slots, CONFIG).decisions[0]).toMatchObject({
      reap: false,
      because: "slot-descendant",
    });
  });

  it("clause (b): a row with a live parent is never reaped", () => {
    const rows = [worker({ ...ancient, ppid: 4242 }), worker({ pid: 4242, ppid: 1, command: "sh" })];
    expect(only(rows)).toMatchObject({ reap: false, because: "has-live-parent" });
  });
});

describe("classify — clause (a) is structural, never containment", () => {
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
});

describe("classify — clause (d) boundary", () => {
  it.each([
    [DEFAULT_MIN_AGE_SECONDS - 1, false],
    [DEFAULT_MIN_AGE_SECONDS, true],
    [DEFAULT_MIN_AGE_SECONDS + 1, true],
  ])("age %i => reap %s", (etimeSeconds, reaped) => {
    expect(only([worker({ etimeSeconds })])).toMatchObject({ reap: reaped });
  });
});

describe("classify — AC-4", () => {
  it.each([
    ["own pid", 999],
    ["an ancestor", 998],
  ])("declines %s", (_label, pid) => {
    expect(only([worker({ pid })])).toMatchObject({ reap: false, because: "self" });
  });
});

describe("classify — AC-3, row-level R1-R5", () => {
  it("R1: an unparsable row survives into decisions", () => {
    const rows: ProcRow[] = [{ kind: "unparsable", raw: "??? garbage", problem: "no pid" }];
    expect(classify(rows, CLEAN, CONFIG).decisions[0]).toMatchObject({
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

  it("R5: an ancestry cycle declines rather than looping", () => {
    const rows = [worker({ pid: 10, ppid: 11 }), worker({ pid: 11, ppid: 10 })];
    const slots: SlotSurvey = { holderPids: [77], problems: [] };
    expect(classify(rows, slots, CONFIG).decisions.every((d) => d.reap === false)).toBe(true);
  });

  it("is TOTAL: one decision per input row", () => {
    const rows: ProcRow[] = [
      worker(),
      worker({ pid: 101, command: "sleep 9" }),
      { kind: "unparsable", raw: "x", problem: "no pid" },
    ];
    expect(classify(rows, CLEAN, CONFIG).decisions).toHaveLength(rows.length);
  });
});

describe("classify — AC-3b, collection-level C-rows", () => {
  const reapable = [worker()];

  it("premise: this fixture IS reapable under a decidable survey", () => {
    premiseHolds(
      "the C3/C5 fixture contains a row that a decidable survey would reap",
      classify(reapable, CLEAN, CONFIG).decisions.some((d) => d.reap),
    );
  });

  it.each([
    ["C3", { holderPids: [], problems: [{ slot: "/tmp/fx-heavy-slots", problem: "dir-unreadable" as const, detail: "EACCES" }] }],
    ["C5", { holderPids: [], problems: [{ slot: "slot-0", problem: "metadata-malformed" as const, detail: "torn" }] }],
  ])("%s: an undecidable survey reaps nothing", (_id, slots) => {
    expect(surveyIsDecidable(slots)).toBe(false);
    expect(classify(reapable, slots, CONFIG).decisions.some((d) => d.reap)).toBe(false);
  });

  it.each([
    ["C4", { holderPids: [], problems: [] }],
    ["C6", { holderPids: [], problems: [{ slot: "slot-0", problem: "holder-dead" as const, detail: "pid 5 gone" }] }],
  ])("%s: a decidable survey proceeds", (_id, slots) => {
    expect(surveyIsDecidable(slots)).toBe(true);
    expect(classify(reapable, slots, CONFIG).decisions.some((d) => d.reap)).toBe(true);
  });

  it("C8: a rejected ceiling is carried in configNotes", () => {
    const cfg: ReapConfig = { ...CONFIG, minAgeSource: "env", minAgeRejected: "-5" };
    expect(classify(reapable, CLEAN, cfg).configNotes.join(" ")).toContain("-5");
  });

  it("passes slot problems through for the reporter", () => {
    const slots: SlotSurvey = {
      holderPids: [],
      problems: [{ slot: "slot-1", problem: "holder-dead", detail: "pid 5 gone" }],
    };
    expect(classify(reapable, slots, CONFIG).slotProblems).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm vitest run tests/heavyReap/classify.test.ts`
Expected: FAIL — `Cannot find module '../../lib/heavyReap/classify'`.

- [ ] **Step 3: Write minimal implementation.** `lib/heavyReap/classify.ts`:

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

export type SlotProblem = {
  slot: string;
  problem: "dir-unreadable" | "dir-missing" | "metadata-unreadable" | "metadata-malformed" | "holder-dead";
  detail: string;
};
export type SlotSurvey = { holderPids: number[]; problems: SlotProblem[] };

export type ReapConfig = {
  nowSeconds: number;
  minAgeSeconds: number;
  minAgeSource: "default" | "env";
  minAgeRejected?: string;
  selfPid: number;
  selfAncestry: readonly number[];
};

export type Skip =
  | "not-a-worker"
  | "has-live-parent"
  | "slot-descendant"
  | "too-young"
  | "self"
  | "undecidable";

export type Decision =
  | { pid: number; reap: true; shape: string; ageSeconds: number }
  | { pid: number; reap: false; because: Skip; detail?: string }
  | { reap: false; because: "unparsable"; raw: string; detail: string };

export type Classification = {
  decisions: Decision[];
  slotProblems: SlotProblem[];
  configNotes: string[];
};

/** False for C3 and C5; true for C4. */
export function surveyIsDecidable(slots: SlotSurvey): boolean {
  return !slots.problems.some(
    (p) => p.problem !== "holder-dead",
  );
}

/** The declared shape, per clause (a): node as argv[0], entrypoint as the LAST token. */
function workerShape(command: string): string | null {
  const tokens = command.split(/\s+/).filter((t) => t.length > 0);
  const argv0 = tokens[0];
  const last = tokens[tokens.length - 1];
  if (argv0 === undefined || last === undefined || tokens.length < 2) return null;
  if (basename(argv0) !== "node") return null;
  return WORKER_ENTRYPOINTS.find((e) => last.endsWith(e)) ?? null;
}

/** Walk ppid upward. Returns true only if a live holder is REACHED; a cycle or a break returns null. */
function ancestryHitsHolder(
  row: ParsedRow,
  byPid: Map<number, ParsedRow>,
  holders: ReadonlySet<number>,
): boolean | null {
  const seen = new Set<number>([row.pid]);
  let cursor = row.ppid;
  while (cursor !== null && cursor > 1) {
    if (holders.has(cursor)) return true;
    if (seen.has(cursor)) return null;
    seen.add(cursor);
    const parent = byPid.get(cursor);
    if (parent === undefined) return false;
    cursor = parent.ppid;
  }
  return cursor === null ? null : false;
}

export function classify(
  rows: readonly ProcRow[],
  slots: SlotSurvey,
  config: ReapConfig,
): Classification {
  const configNotes: string[] =
    config.minAgeRejected === undefined
      ? []
      : [`FX_REAP_MIN_AGE_S rejected: ${config.minAgeRejected}; using ${config.minAgeSeconds}`];
  const decidable = surveyIsDecidable(slots);
  const holders = new Set(slots.holderPids);
  const live = new Set<number>();
  const byPid = new Map<number, ParsedRow>();
  for (const row of rows) {
    if (row.kind === "parsed") {
      byPid.set(row.pid, row);
      live.add(row.pid);
    }
  }
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
    if (!decidable) return { pid: row.pid, reap: false, because: "undecidable" };
    const inSlot = ancestryHitsHolder(row, byPid, holders);
    if (inSlot === null) return { pid: row.pid, reap: false, because: "undecidable" };
    if (inSlot) return { pid: row.pid, reap: false, because: "slot-descendant" };
    if (row.etimeSeconds === null) return { pid: row.pid, reap: false, because: "undecidable" };
    if (row.etimeSeconds < config.minAgeSeconds) {
      return { pid: row.pid, reap: false, because: "too-young" };
    }
    return { pid: row.pid, reap: true, shape, ageSeconds: row.etimeSeconds };
  });

  return { decisions, slotProblems: slots.problems, configNotes };
}
```

**Note for the implementer on clause (c) and clause (b) ordering:** clause (b) is checked before (c) because a row with a live parent is exempt whichever slot it belongs to, and the ancestry walk is the more expensive check. A `ppid` naming a process not in the table is `undecidable`, not "orphan" — only `ppid === 1` is the orphan shape (spec §4.2b).

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm vitest run tests/heavyReap/classify.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck.**

Run: `pnpm typecheck`
Expected: PASS. The repo is strict — `noUncheckedIndexedAccess` is why `workerShape` binds `tokens[0]` and `tokens[tokens.length - 1]` to locals and checks both for `undefined`, and `exactOptionalPropertyTypes` is why `minAgeRejected` is only ever read, never assigned `undefined`.

- [ ] **Step 6: Commit.**

```bash
git add lib/heavyReap/classify.ts tests/heavyReap/classify.test.ts
git commit -m "feat(infra): classify orphaned heavy-phase workers"
```

### Task 2: The collector

<!-- task: red=`pnpm vitest run tests/heavyReap/collect.test.ts` red-state=authored red-target=`lib/heavyReap/collect.ts` why=`lib/heavyReap/collect.ts does not exist, so every case fails at import resolution` ac=AC-7,AC-10 -->

**Files:**
- Create: `lib/heavyReap/collect.ts`
- Create: `tests/heavyReap/fixtures/ps-sample.txt` (captured from this machine, committed)
- Test: `tests/heavyReap/collect.test.ts`

**Interfaces:**
- Consumes: `ProcRow`, `SlotSurvey`, `SlotProblem` from Task 1.
- Produces: `CollectResult`, `parsePsOutput(text: string): ProcRow[]`, `surveySlots(dir: string): SlotSurvey`, `collect(dir: string): CollectResult`. Task 3 imports `collect`.

**What is red and why:** the module is absent. Production surface: `lib/heavyReap/collect.ts`.

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

A plain `head` of the table captures only long-lived system processes and yields ZERO worker lines
— measured while authoring this plan, which is why the capture is written this way. Step 2's first
case is a premise asserting the fixture holds a worker, so a degenerate fixture fails loudly rather
than passing vacuously. Real worker command lines run ~617 characters; do not hand-trim them.

- [ ] **Step 2: Write the failing test.** `tests/heavyReap/collect.test.ts`:

```ts
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { premiseHolds } from "../_shared/premise";
import { collect, parsePsOutput, surveySlots } from "../../lib/heavyReap/collect";
import { surveyIsDecidable } from "../../lib/heavyReap/classify";

const SAMPLE = readFileSync(new URL("./fixtures/ps-sample.txt", import.meta.url), "utf8");
const dirs: string[] = [];
const slotDir = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "heavy-reap-slots-"));
  dirs.push(dir);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
};
afterAll(() => {
  for (const d of dirs) chmodSync(d, 0o755);
});

describe("parsePsOutput", () => {
  it("premise: the committed fixture contains a real worker line", () => {
    premiseHolds("ps-sample.txt holds >=1 vitest worker", SAMPLE.includes("vitest/dist/workers/"));
  });

  it("parses every non-empty line into a row", () => {
    const expected = SAMPLE.split("\n").filter((l) => l.trim().length > 0).length;
    expect(parsePsOutput(SAMPLE)).toHaveLength(expected);
  });

  it("keeps a full-length worker command intact", () => {
    const rows = parsePsOutput(SAMPLE).filter(
      (r) => r.kind === "parsed" && r.command.includes("vitest/dist/workers/"),
    );
    const longest = Math.max(...rows.map((r) => (r.kind === "parsed" ? r.command.length : 0)));
    expect(longest).toBeGreaterThan(200);
  });

  it("R1: a line with no numeric pid becomes an unparsable row", () => {
    expect(parsePsOutput("garbage line\n")[0]).toMatchObject({ kind: "unparsable" });
  });

  it.each([
    ["R2", "  700       xx    01:00 node /x/vitest/dist/workers/forks.js", "ppid"],
    ["R3", "  700       1     zzzz node /x/vitest/dist/workers/forks.js", "etimeSeconds"],
  ])("%s: an unparsable field becomes null, not a dropped row", (_id, line, field) => {
    const row = parsePsOutput(`${line}\n`)[0];
    expect(row).toMatchObject({ kind: "parsed", [field]: null });
  });

  it.each([
    ["MM:SS", "01:30", 90],
    ["HH:MM:SS", "01:00:00", 3600],
    ["D-HH:MM:SS", "1-00:00:00", 86_400],
  ])("parses the %s etime form", (_label, etime, seconds) => {
    const row = parsePsOutput(`  700 1 ${etime} node /x/vitest/dist/workers/forks.js\n`)[0];
    expect(row).toMatchObject({ etimeSeconds: seconds });
  });
});

describe("surveySlots", () => {
  it("C4: an empty readable dir is DECIDABLE with no holders", () => {
    const s = surveySlots(slotDir({}));
    expect(s.holderPids).toEqual([]);
    expect(surveyIsDecidable(s)).toBe(true);
  });

  it("C3: a missing dir is UNDECIDABLE", () => {
    expect(surveyIsDecidable(surveySlots(join(tmpdir(), "definitely-absent-dir-xyz")))).toBe(false);
  });

  it("C3 and C4 are DIFFERENT results, not the same empty world", () => {
    const empty = surveySlots(slotDir({}));
    const missing = surveySlots(join(tmpdir(), "definitely-absent-dir-xyz"));
    expect(surveyIsDecidable(empty)).not.toBe(surveyIsDecidable(missing));
  });

  it("C5: torn metadata is UNDECIDABLE", () => {
    expect(surveyIsDecidable(surveySlots(slotDir({ "slot-0": "{not json" })))).toBe(false);
  });

  it("C6: a live-shaped record whose pid is gone is DECIDABLE with no holder", () => {
    const s = surveySlots(slotDir({ "slot-0": JSON.stringify({ pid: 2_147_483_6 }) }));
    expect(surveyIsDecidable(s)).toBe(true);
    expect(s.holderPids).toEqual([]);
  });

  it("records a live holder pid", () => {
    const s = surveySlots(slotDir({ "slot-0": JSON.stringify({ pid: process.pid }) }));
    expect(s.holderPids).toEqual([process.pid]);
  });
});

describe("collect — AC-7 (C1)", () => {
  it("reports ps failure instead of an empty world", () => {
    const r = collect(slotDir({}), "definitely-not-a-real-ps-binary");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toBe("ps-unavailable");
  });
});

describe("collect — AC-10 live smoke", () => {
  it("finds a child this test spawned, with the right ppid and a plausible age", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 8000)"]);
    const startedAt = Date.now();
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const result = collect(slotDir({}));
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const found = result.rows.find((r) => r.kind === "parsed" && r.pid === child.pid);
      premiseHolds("the spawned child appears in the live ps read", found !== undefined);
      expect(found).toMatchObject({ kind: "parsed", ppid: process.pid });
      const age = found?.kind === "parsed" ? (found.etimeSeconds ?? -1) : -1;
      expect(age).toBeLessThanOrEqual(Math.ceil((Date.now() - startedAt) / 1000) + 3);
    } finally {
      child.kill("SIGKILL");
    }
  }, 20_000);
});
```

- [ ] **Step 3: Run test to verify it fails.**

Run: `pnpm vitest run tests/heavyReap/collect.test.ts`
Expected: FAIL — `Cannot find module '../../lib/heavyReap/collect'`.

- [ ] **Step 4: Write minimal implementation.** `lib/heavyReap/collect.ts`:

```ts
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProcRow, SlotProblem, SlotSurvey } from "./classify";

export const DEFAULT_SLOT_DIR = "/tmp/fx-heavy-slots";

export type CollectResult =
  | { ok: true; rows: ProcRow[]; slots: SlotSurvey }
  | { ok: false; problem: "ps-unavailable" | "ps-failed"; detail: string };

/** `[[D-]HH:]MM:SS` — ps(1)'s elapsed-time forms. Returns null when it is none of them. */
export function parseEtime(raw: string): number | null {
  const m = /^(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+)$/.exec(raw.trim());
  if (m === null) return null;
  const [, d, h, mm, ss] = m;
  return (
    Number(d ?? 0) * 86_400 + Number(h ?? 0) * 3600 + Number(mm ?? 0) * 60 + Number(ss ?? 0)
  );
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

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as { code?: string }).code === "EPERM";
  }
}

export function surveySlots(dir: string): SlotSurvey {
  const problems: SlotProblem[] = [];
  let names: string[];
  try {
    names = readdirSync(dir).filter((n) => /^slot-\d+$/.test(n));
  } catch (e) {
    const code = (e as { code?: string }).code;
    problems.push({
      slot: dir,
      problem: code === "ENOENT" ? "dir-missing" : "dir-unreadable",
      detail: String(code ?? e),
    });
    return { holderPids: [], problems };
  }
  const holderPids: number[] = [];
  for (const name of names.sort()) {
    let pid: unknown;
    try {
      pid = (JSON.parse(readFileSync(join(dir, name), "utf8")) as { pid?: unknown }).pid;
    } catch (e) {
      problems.push({ slot: name, problem: "metadata-malformed", detail: String(e) });
      continue;
    }
    if (typeof pid !== "number" || !Number.isInteger(pid)) {
      problems.push({ slot: name, problem: "metadata-malformed", detail: "no pid key" });
      continue;
    }
    if (pidAlive(pid)) holderPids.push(pid);
    else problems.push({ slot: name, problem: "holder-dead", detail: `pid ${pid} is gone` });
  }
  return { holderPids, problems };
}

export function collect(slotDir: string = DEFAULT_SLOT_DIR, psBin = "ps"): CollectResult {
  let text: string;
  try {
    text = execFileSync(psBin, ["-eo", "pid=,ppid=,etime=,command="], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    const err = e as { code?: string; status?: number; message?: string };
    return {
      ok: false,
      problem: err.code === "ENOENT" ? "ps-unavailable" : "ps-failed",
      detail: err.message ?? String(err.status ?? "unknown"),
    };
  }
  return { ok: true, rows: parsePsOutput(text), slots: surveySlots(slotDir) };
}
```

**Note on `pidAlive`:** `process.kill(pid, 0)` sends no signal. `EPERM` means the process EXISTS but belongs to another user, so it counts as alive; `ESRCH` means it is gone. Treating `EPERM` as dead would drop a real holder and un-exempt its workers, which is a clause-(c) hole.

**Note on `maxBuffer`:** the default 1 MB is far below a full `ps -eo command=` read on this machine (measured ~199 KB for 679 rows, but worker command lines are ~617 characters each and the count grows with concurrent arcs). 64 MB removes the cap as a failure mode rather than trading it for a bigger number to outgrow — the same reasoning as `tests/mutation/source/runner.ts:167-174`.

- [ ] **Step 5: Run tests to verify they pass.**

Run: `pnpm vitest run tests/heavyReap/collect.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck.** Run: `pnpm typecheck`. Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add lib/heavyReap/collect.ts tests/heavyReap/collect.test.ts tests/heavyReap/fixtures/ps-sample.txt
git commit -m "feat(infra): collect the process table and the heavy-slot survey"
```

### Task 3: The CLI adapter

<!-- task: red=`pnpm vitest run tests/heavyReap/cli.test.ts` red-state=authored red-target=`scripts/heavy-reap.ts` why=`scripts/heavy-reap.ts does not exist, so the suite cannot import parseFlags, planKills or exitStatus` ac=AC-5,AC-5b,AC-6 -->

**Files:**
- Create: `scripts/heavy-reap.ts`
- Modify: `package.json` (add `heavy:reap`)
- Test: `tests/heavyReap/cli.test.ts`

**Interfaces:**
- Consumes: `classify`, `Decision`, `Classification` (Task 1); `collect` (Task 2).
- Produces: `parseFlags`, `readCeiling`, `planTargets`, `executeKills`, `exitStatus`, `KillOutcome`, `TargetIdentity`. Nothing later consumes these; the CLI is the top of the stack.

**What is red and why:** the module is absent. Production surface: `scripts/heavy-reap.ts`.

Decision logic is exported as pure functions so it is testable without killing anything; only the signal and the identity read are injected.

- [ ] **Step 1: Write the failing test.** `tests/heavyReap/cli.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { Decision } from "../../lib/heavyReap/classify";
import {
  DEFAULT_MIN_AGE_SECONDS,
  type KillOutcome,
  executeKills,
  exitStatus,
  parseFlags,
  planTargets,
  readCeiling,
} from "../../scripts/heavy-reap";

const reap = (pid: number): Decision => ({ pid, reap: true, shape: "forks.js", ageSeconds: 99_999 });

describe("parseFlags — AC-6", () => {
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

describe("readCeiling — C7 and C8", () => {
  it("C7: unset uses the default with no note", () => {
    expect(readCeiling(undefined)).toMatchObject({
      seconds: DEFAULT_MIN_AGE_SECONDS,
      source: "default",
    });
  });

  it.each([["abc"], ["-5"], ["0"]])("C8: rejects %s", (raw) => {
    expect(readCeiling(raw).rejected).toBe(raw);
  });

  it("accepts a valid override", () => {
    expect(readCeiling("60")).toMatchObject({ seconds: 60, source: "env" });
  });
});

describe("planTargets — AC-5", () => {
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
});

describe("executeKills — AC-5, AC-5b", () => {
  const ident = (pid: number) => ({ pid, startedAt: "Sun Aug 16 09:35:23 2026", command: "node x" });

  it("K2: a changed identity is NOT signalled", () => {
    const signalled: number[] = [];
    const out = executeKills([10], {
      identityAtPlan: new Map([[10, ident(10)]]),
      readIdentity: () => ({ pid: 10, startedAt: "Sun Aug 16 10:00:00 2026", command: "node x" }),
      kill: (pid) => signalled.push(pid),
      stillAlive: () => false,
    });
    expect(signalled).toEqual([]);
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "identity-changed" }]);
  });

  it("K1: a pid already gone is already-gone, not an error", () => {
    const out = executeKills([10], {
      identityAtPlan: new Map([[10, ident(10)]]),
      readIdentity: () => null,
      kill: () => undefined,
      stillAlive: () => false,
    });
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "already-gone" }]);
  });

  it("K3: a failing kill is reported per pid and does not stop the run", () => {
    const out = executeKills([10, 11], {
      identityAtPlan: new Map([
        [10, ident(10)],
        [11, ident(11)],
      ]),
      readIdentity: (pid) => ident(pid),
      kill: (pid) => {
        if (pid === 10) throw Object.assign(new Error("nope"), { code: "EPERM" });
      },
      stillAlive: () => false,
    });
    expect(out.map((o) => o.result)).toEqual(["failed", "killed"]);
  });

  it("K4: a recorded target alive after the re-scan is partial", () => {
    const out = executeKills([10], {
      identityAtPlan: new Map([[10, ident(10)]]),
      readIdentity: (pid) => ident(pid),
      kill: () => undefined,
      stillAlive: (pid) => pid === 10,
    });
    expect(out).toEqual<KillOutcome[]>([{ pid: 10, result: "partial" }]);
  });
});

describe("exitStatus — §6.2", () => {
  it.each([
    ["C1", { collectFailed: true, outcomes: [] }, 1],
    ["C3/C5", { undecidableSurvey: true, outcomes: [] }, 1],
    ["C8", { ceilingRejected: true, outcomes: [] }, 1],
    ["K2", { outcomes: [{ pid: 1, result: "identity-changed" as const }] }, 1],
    ["K3", { outcomes: [{ pid: 1, result: "failed" as const }] }, 1],
    ["K4", { outcomes: [{ pid: 1, result: "partial" as const }] }, 1],
    ["K1", { outcomes: [{ pid: 1, result: "already-gone" as const }] }, 0],
    ["clean", { outcomes: [{ pid: 1, result: "killed" as const }] }, 0],
    ["C2/C4/C6/C7", { outcomes: [] }, 0],
  ])("%s", (_id, state, code) => {
    expect(exitStatus({ collectFailed: false, undecidableSurvey: false, ceilingRejected: false, ...state })).toBe(code);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm vitest run tests/heavyReap/cli.test.ts`
Expected: FAIL — `Cannot find module '../../scripts/heavy-reap'`.

- [ ] **Step 3: Write minimal implementation.** `scripts/heavy-reap.ts`:

```ts
import { execFileSync } from "node:child_process";
import {
  DEFAULT_MIN_AGE_SECONDS,
  type Decision,
  classify,
} from "../lib/heavyReap/classify";
import { DEFAULT_SLOT_DIR, collect } from "../lib/heavyReap/collect";

export { DEFAULT_MIN_AGE_SECONDS };

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
  if (!Number.isInteger(n) || n <= 0) {
    return { seconds: DEFAULT_MIN_AGE_SECONDS, source: "default", rejected: raw };
  }
  return { seconds: n, source: "env" };
}

/** Root first, then its recorded descendants (spec §4.4, K2's kill-order note). */
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
  for (const d of decisions) {
    if (!("reap" in d) || d.reap !== true) continue;
    const queue = [d.pid];
    while (queue.length > 0) {
      const pid = queue.shift();
      if (pid === undefined || out.includes(pid)) continue;
      out.push(pid);
      queue.push(...(children.get(pid) ?? []));
    }
  }
  return out;
}

export type TargetIdentity = { pid: number; startedAt: string; command: string };

export type KillOutcome = {
  pid: number;
  result: "killed" | "already-gone" | "failed" | "partial" | "identity-changed";
  detail?: string;
};

export type KillDeps = {
  identityAtPlan: ReadonlyMap<number, TargetIdentity>;
  readIdentity: (pid: number) => TargetIdentity | null;
  kill: (pid: number) => void;
  stillAlive: (pid: number) => boolean;
};

export function executeKills(targets: readonly number[], deps: KillDeps): KillOutcome[] {
  const outcomes: KillOutcome[] = [];
  const signalled: number[] = [];
  for (const pid of targets) {
    const planned = deps.identityAtPlan.get(pid);
    const now = deps.readIdentity(pid);
    if (now === null) {
      outcomes.push({ pid, result: "already-gone" });
      continue;
    }
    if (
      planned === undefined ||
      planned.startedAt !== now.startedAt ||
      planned.command !== now.command
    ) {
      outcomes.push({ pid, result: "identity-changed" });
      continue;
    }
    try {
      deps.kill(pid);
      signalled.push(pid);
    } catch (e) {
      outcomes.push({ pid, result: "failed", detail: String((e as { code?: string }).code ?? e) });
    }
  }
  for (const pid of signalled) {
    outcomes.push(deps.stillAlive(pid) ? { pid, result: "partial" } : { pid, result: "killed" });
  }
  return outcomes.sort((a, b) => targets.indexOf(a.pid) - targets.indexOf(b.pid));
}

export function exitStatus(state: {
  collectFailed: boolean;
  undecidableSurvey: boolean;
  ceilingRejected: boolean;
  outcomes: readonly KillOutcome[];
}): number {
  if (state.collectFailed || state.undecidableSurvey || state.ceilingRejected) return 1;
  return state.outcomes.some((o) => o.result !== "killed" && o.result !== "already-gone") ? 1 : 0;
}

/** `ps -o lstart=,command= -p <pid>`: one cheap read per target, never for the whole table. */
export function readIdentity(pid: number): TargetIdentity | null {
  try {
    const out = execFileSync("ps", ["-o", "lstart=,command=", "-p", String(pid)], {
      encoding: "utf8",
    }).trim();
    if (out.length === 0) return null;
    const tokens = out.split(/\s+/);
    return {
      pid,
      startedAt: tokens.slice(0, 5).join(" "),
      command: tokens.slice(5).join(" "),
    };
  } catch {
    return null;
  }
}
```

**Note for the implementer:** the `main()` wiring — read `process.argv.slice(2)`, `readCeiling(process.env.FX_REAP_MIN_AGE_S)`, `collect(DEFAULT_SLOT_DIR)`, `classify(...)`, print the report per §6.2's table, and under `--kill` build `identityAtPlan` from `readIdentity` before planning — goes at the bottom of the file behind an `import.meta.url` main-module check so importing it in the test spawns nothing. `--quiet` suppresses only the DECLINE lines; every `KillOutcome` that is not `killed`, plus all slot problems and config notes, always prints.

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm vitest run tests/heavyReap/cli.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the script.** In `package.json`, beside `"heavy"`:

```json
    "heavy:reap": "tsx scripts/heavy-reap.ts",
```

- [ ] **Step 6: Run it live and record the output in the commit.**

```bash
pnpm heavy:reap
pnpm heavy:reap --all | tail -20
```

A live run reporting zero rows on a machine with hundreds of processes is a vacuous pass, so paste the actual candidate and decline counts into the commit message. If any process is reported reapable, sanity-check it by hand before Task 7 — the first live `--kill` is an irreversible action.

- [ ] **Step 7: Typecheck, then commit.**

```bash
pnpm typecheck
git add scripts/heavy-reap.ts tests/heavyReap/cli.test.ts package.json
git commit -m "feat(infra): heavy-reap CLI, report by default and kill only on --kill"
```

### Task 4: Trigger 1

<!-- task: red=`pnpm vitest run tests/heavyReap/triggerFailOpen.test.ts` red-state=authored red-target=`package.json:56` why=`package.json:56 is still the wrapper alone, so the ordering and fail-open assertions have no reaper to assert about` ac=AC-8 -->

**Files:**
- Modify: `package.json:56`
- Test: `tests/heavyReap/triggerFailOpen.test.ts`

**Interfaces:**
- Consumes: `scripts/heavy-reap.ts` (Task 3).
- Produces: nothing importable.

**What is red and why:** `package.json:56` is `"heavy": "python3 scripts/with-heavy-slot.py --"`. The reaper is not in it, so the ordering assertion has nothing to find. Production surface: `package.json:56`.

- [ ] **Step 1: Write the failing test.** `tests/heavyReap/triggerFailOpen.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  scripts: Record<string, string>;
};

describe("the heavy script wires the reaper AHEAD of the wrapper", () => {
  const segments = () =>
    (pkg.scripts.heavy ?? "").split(";").map((s) => s.trim()).filter((s) => s.length > 0);

  it("runs the reaper", () => {
    expect(segments()[0]).toContain("heavy-reap");
  });

  it("makes the WRAPPER the last segment, so caller args reach it", () => {
    const last = segments()[segments().length - 1];
    expect(last).toContain("with-heavy-slot.py");
    expect(last?.endsWith("--")).toBe(true);
  });

  it("sequences with ';' and never '&&', so a failing reaper cannot block admission", () => {
    expect(pkg.scripts.heavy).not.toContain("&&");
  });
});

describe("AC-8 fail-open, executed against real pnpm", () => {
  const build = (reaper: string): string => {
    const dir = mkdtempSync(join(tmpdir(), "heavy-trigger-"));
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({
        name: "trigger-probe",
        version: "0.0.0",
        scripts: { heavy: `${reaper}; node show.js --` },
      }),
    );
    writeFileSync(join(dir, "show.js"), "console.log('ARGV ' + JSON.stringify(process.argv.slice(2)));");
    writeFileSync(join(dir, "fail.js"), "process.exit(3);");
    writeFileSync(join(dir, "exit42.js"), "console.log('ARGV ' + JSON.stringify(process.argv.slice(2))); process.exit(42);");
    return dir;
  };
  const run = (dir: string, args: string[]): { out: string; code: number } => {
    try {
      return { out: execFileSync("pnpm", ["heavy", ...args], { cwd: dir, encoding: "utf8" }), code: 0 };
    } catch (e) {
      const err = e as { stdout?: string; status?: number };
      return { out: err.stdout ?? "", code: err.status ?? -1 };
    }
  };

  it.each([
    ["absent reaper", "node no-such-reaper.js"],
    ["reaper exiting 3", "node fail.js"],
  ])("%s: the wrapper still runs with identical argv", (_label, reaper) => {
    const { out } = run(build(reaper), ["pnpm", "mutation:guards"]);
    expect(out).toContain(`ARGV ["--","pnpm","mutation:guards"]`);
  }, 60_000);

  it("forwards an explicit '--' through to the wrapper", () => {
    const { out } = run(build("node fail.js"), ["--", "node", "-e", "1"]);
    expect(out).toContain(`ARGV ["--","--","node","-e","1"]`);
  }, 60_000);

  it("still returns the wrapper's own exit status behind a failing reaper", () => {
    const dir = build("node fail.js");
    const p = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    p.scripts.heavy = "node fail.js; node exit42.js --";
    writeFileSync(join(dir, "package.json"), JSON.stringify(p));
    expect(run(dir, ["x"]).code).toBe(42);
  }, 60_000);
});
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `pnpm vitest run tests/heavyReap/triggerFailOpen.test.ts`
Expected: FAIL — the first three cases fail because `scripts.heavy` has one segment and it is the wrapper.

- [ ] **Step 3: Edit `package.json:56`.**

```json
    "heavy": "tsx scripts/heavy-reap.ts --kill --quiet; python3 scripts/with-heavy-slot.py --",
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `pnpm vitest run tests/heavyReap/triggerFailOpen.test.ts`
Expected: PASS.

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
    control: { from: "export const DEFAULT_MIN_AGE_SECONDS = 14400;", to: "export const DEFAULT_MIN_AGE_SECONDS = 1;" },
    accepted: [],
  },
```

The `control.from` string occurs exactly once in `classify.ts` — the registry validates that at `tests/mutation/source/registry.ts:88-95`, and a second occurrence fails enrolment.

- [ ] **RED:** `pnpm heavy pnpm mutation:guards`. Expected: FAIL at `tests/mutation/guardSurfaces.gate.test.ts:152` — `EXPECTED_LEDGER_KINDS` has no row for `heavyReapClassify`, and a new surface fails by default until it declares its counts.
- [ ] Add the `EXPECTED_LEDGER_KINDS` row at `tests/mutation/guardSurfaces.gate.test.ts:34`. Declare the kinds COUNTED FROM THE SURFACE with a reachability argument per row, not read back off the ledger. `{}` is the honest declaration for a clean sweep.
- [ ] **GREEN:** `pnpm heavy pnpm mutation:guards`. Record the score and every survivor in the commit. **Repay survivors with cases rather than blessing them** — an `accepted-gap` row on a first enrolment needs its own backlog entry, per the precedent in the gate file's comments.
- [ ] **Known local hazard, so it is not misdiagnosed as this arc's bug:** on a loaded machine the gate can abort with `BaselineNotGreenError` on an UNRELATED surface whose suite exceeds `MUTANT_TIMEOUT_MS` (`tests/mutation/source/runner.ts:49`). Observed 2026-08-16 on `ledgerClaimsCore`, whose two suites pass in 33.6 s when run directly. That class is owned by `fix/local-harness-false-failures`; re-run when the box is quieter rather than filing a duplicate.
- [ ] Commit: `test(infra): enrol the heavy-reap classifier in the source-mutation gate`.

### Task 6: Docs and ledger

- [ ] `AGENTS.md`, heavy-phase section: document `pnpm heavy:reap` (report) and `--kill`, trigger 1's presence in the `heavy` script, and the `Stop`-hook install one-liner — same posture as the codex-guard shim install, because the hook is per-machine config this repo cannot install.
- [ ] `docs/superpowers/plans/ci/README.md`: add the index row for this plan.
- [ ] `docs/superpowers/specs/ci/README.md`: the spec's row landed with the spec commit — VERIFY, do not duplicate.
- [ ] `BACKLOG.md`: `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH` was already filed at spec time, observed red then green on `tests/docs/_metaLedgerReferentialIntegrity.test.ts`. Nothing to add.
- [ ] `pnpm spec:lint` on both docs — 0 hard — then `pnpm heavy pnpm vitest run tests/docs` — GREEN.

### Task 7: Closeout

- [ ] Gates: `pnpm heavy pnpm test:fast`; then `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check` (unwrapped).
- [ ] Push; open the PR (merge-commit convention).
- [ ] **Adversarial review (cross-model), whole diff, to APPROVE.** The round-1 brief carries Task 5's mutation score and unaccepted-survivor set, plus the spec's consequence bound, `PROBE DOMAIN:` and threat fence (§9), and the do-not-relitigate list from §1.1.
- [ ] Real CI green — not just local.
- [ ] **Final commit — graduation + marker removal** (after review APPROVE and CI green; nothing lands after it except the merge). Enrol the graduation in `BACKLOG_GRADUATED` FIRST and observe that guard RED, then graduate `BL-HEAVY-ORPHAN-WORKER-LIFETIME` to `BACKLOG-archive.md` and remove the `**Status:** IN PROGRESS · **Branch:**` marker in the SAME commit (invariant 12 — archives reject in-flight entries, so the two are inseparable), then GREEN on the same command.
- [ ] **Delta review** of the graduation commit's diff alone — the whole-diff review predates it, and review must cover what merges.
- [ ] `gh pr merge --merge`; fast-forward local `main`; verify `git rev-list --left-right --count main...origin/main` → `0  0`.

## 12. Closeout

impeccable-gate: N/A — no UI surface
