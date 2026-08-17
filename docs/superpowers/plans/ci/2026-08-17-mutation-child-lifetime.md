# Mutation-harness child lifetime under parent death — implementation plan

**Spec:** `docs/superpowers/specs/ci/2026-08-17-mutation-child-lifetime-design.md` (canonical; this plan implements it and adds nothing to it).
**Backlog entry:** `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH`. **Branch:** `fix/mutation-child-lifetime`.
**Date:** 2026-08-17.

---

## Global constraints

- Every task: failing test → minimal implementation → passing test → commit (invariant 1). Commit
  style `test(infra):` / `fix(infra):` per task, one task per commit.
- All work in this worktree (`../FX-worktrees/mutation-child-lifetime`), never the main checkout
  (invariant 11).
- Mutation-gate phases run FOREGROUND and wrapped in `pnpm heavy` (AGENTS heavy-phase rule: any
  `--project mutation` run is a must-wrap member). `-t` name filters do NOT scope the gate —
  `runSurface` executes at module scope during collection
  (`tests/mutation/source/surfaceCases.ts:18-21`); scope by the temporary-shard-file technique in
  Task 5, then DELETE the temp file (`tests/mutation/_metaSourceShardIntegrity.test.ts` pins shard
  files byte-for-byte).
- No edits outside the File Structure list below. In particular no edits to
  `scripts/heavy-reap.ts`, `lib/heavyReap/**`, `scripts/with-heavy-slot.py`,
  `tests/mutation/browser/**` (spec §11).

## File structure

| Path | Action |
| --- | --- |
| tests/mutation/source/spawnBounded.ts | NEW — watchdog argv + bounded spawn + pure outcome interpreter (spec §5.2) |
| tests/mutation/source/spawnBounded.test.ts | NEW — enrolled suite: pure interpreter cases + mocked spawn-wiring cases |
| tests/mutation/source/spawnBounded.live.test.ts | NEW — live process-tree suite (AC-1/2/3/4/11); NOT enrolled, so the per-mutant gate cost stays flat (spec §8) |
| tests/mutation/source/childRun.test.ts | NEW — mocked abnormal-outcome contract for `childRun` (AC-5) |
| tests/mutation/source/runner.ts | EDIT — `runSuite` consumes spawnBounded; superseded blocks removed |
| tests/mutation/source/childRun.ts | EDIT — bounded spawn + throw-on-abnormal (spec §5.3) |
| tests/mutation/source/runner.test.ts | EDIT — `GROUP_LEADER_ARGV` → `WATCHDOG_ARGV`; stale `reapOrphans` comment repaired (AC-7) |
| tests/mutation/source/registry.ts | EDIT — one `GUARD_SURFACES` row (spawnBounded) |
| tests/mutation/source/expectedLedgerKinds.ts | EDIT — one row (spawnBounded) |
| tests/mutation/_metaPremiseContract.test.ts | EDIT — one `EXPECTED_ENV_TOUCHING` row for the enrolled suite |
| BACKLOG.md | EDIT — add peer row `BL-MUTATION-BROWSER-CHILD-LIFETIME` (spec §9.1); the invariant-12 marker comes off in the PR's last commit |
| docs/review-rounds/fix/mutation-child-lifetime/ | corpus rows, committed with the arc |

## Acceptance criteria → task

| AC (spec §7) | Task |
| --- | --- |
| AC-1 parent-death group reap | 1 (live suite) |
| AC-2 exit transparency | 1 (live suite) |
| AC-3 signal transparency → `MutantRunInfraError` | 1 (live), 2 (runner mapping) |
| AC-4 parent-alive timeout + group reap unchanged | 1 (live), 2 (existing `runner.test.ts:206` stays green) |
| AC-5 childRun throws on abnormal, codes preserved | 3 |
| AC-6 degraded no-perl mode | 1 (mocked ENOENT case) |
| AC-7 `reapOrphans` comment repaired | 2 |
| AC-8 enrolment rows + no unaccepted survivor | 5 |
| AC-11 wrapper-failure discrimination | 1 (live exec-fail case + script-text pin) |
| AC-9 corpus gate untouched in shape | 5 (no shard/gates edits; temp file deleted) |

## Meta-test inventory

EXTENDS: `tests/mutation/source/registry.ts` (one row — covered by
`tests/mutation/_metaGuardSurfaceRegistry.test.ts` by default),
`tests/mutation/source/expectedLedgerKinds.ts` (one row — completeness pinned by
`tests/mutation/guardSurfaces.gates.test.ts:21`), `tests/mutation/_metaPremiseContract.test.ts`
(one `EXPECTED_ENV_TOUCHING` row; the contract walks enrolled suites from the registry, so the new
suite fails by default until its row lands). CREATES none. No Supabase call boundary, no advisory
lock, no admin mutation surface, no UI surface.

## Mutation-operator families — the closure set for review

The declared operator set is `tests/mutation/source/operators.ts:17-24` — `relational-boundary`,
`equality-flip`, `logical-connector`, `integer-literal`, `regex-quantifier-bound`,
`statement-removal` — and it is the closure set. Per AGENTS.md, a reviewer-proposed NEW family is
admissible only with a live escaping mutant demonstrated against the shipped guard. The watchdog
perl program is a string literal no declared operator rewrites: CANNOT-EXPRESS, guarded by the
live suite (spec §8). The enrolled surface's convergence criterion is the measured score plus an
empty unaccepted-survivor set (Task 5).

## Pre-draft verification pass — RUN, with outputs

Everything below was executed on this worktree (base `59a9ef25a`) during plan authoring. The
scratch build implemented the full design, ran it, and was then reverted; the snippets in the
tasks are the validated scratch files verbatim.

- Baseline before any edit: `pnpm vitest run tests/mutation/source/runner.test.ts` → **13 passed,
  13.05s**. `pnpm typecheck` → clean.
- Scratch spawnBounded module + combined scratch suite (pure + live cases):
  `pnpm vitest run tests/mutation/source/spawnBounded.scratch.test.ts` → **11 passed, 6.11s**.
- Scratch-adapted `runner.ts` + `runner.test.ts` (argv constant swapped):
  **13 passed, 2.99s** — every existing case including the two live ones
  (`tests/mutation/source/runner.test.ts:206`, `tests/mutation/source/runner.test.ts:250`) green
  against the supervisor argv.
- Scratch-rewritten `childRun.ts`, consumers re-run:
  `tests/mutation/_metaOverlayConfigParity.test.ts` → **5 passed, 1.74s** (verbose reporter
  confirms the real-child case ran: "resolves a real @/ import … in a real child run 1074ms");
  `tests/mutation/_metaPremiseContract.test.ts` → **10 passed, 15.74s**. `pnpm typecheck` on the
  full scratch state → clean.
- Two authoring defects the executable pass caught (both fixed in the snippets below, neither
  reachable by reading):
  1. An in-process killer (`setTimeout` around `spawnBounded`) never runs — `spawnSync` blocks the
     worker's event loop, so the AC-3 case's killer must be an OUT-OF-PROCESS poller. First run
     failed `kill ESRCH`; the out-of-process form passes.
  2. The spec-R1 wrapper (exit 125/127 on fork/exec failure) aliased real child exits; the
     repaired self-signal form was probed (spec §3 P-W2) before these snippets were re-validated.
- Registry shapes verified: `GuardSurface` fields (`tests/mutation/source/registry.ts:12-38`),
  `EXPECTED_LEDGER_KINDS` keying (`tests/mutation/source/expectedLedgerKinds.ts`),
  `EXPECTED_ENV_TOUCHING` keying (`tests/mutation/_metaPremiseContract.test.ts:32-45`),
  `registerSurfaceCases(surfaces)` signature (`tests/mutation/source/surfaceCases.ts:23`).
- Suite discovery: `tests/mutation/source/*.test.ts` is in no `NIGHTLY_ONLY_EXCLUDES` glob
  (`vitest.projects.ts:97-102`), so the three new suites run in the default merge-gating projects
  with no `testMatch`/workflow wiring changes. The temp scoring shard matches
  `tests/mutation/guardSurfaces.shard*.test.ts` (`vitest.projects.ts:90`) and exists only for the
  duration of Task 5's run.
- `perl -e 'use POSIX qw(WNOHANG); print WNOHANG'` → `1` on this machine; the script imports the
  constant rather than the literal, so the Linux value is whatever POSIX says it is.

**Task markers use the v1 form with prose reds.** Tasks 1-3 CREATE their production files, and the
path-only `red-target=` form is legal only while the path is untracked
(`lib/specLint/redContract.ts:112-116`) — the same probed constraint the heavy-orphan plan filed as
`BL-SPECLINT-RED-TARGET-PATH-ONLY-EXPIRES`. Each task states its red in prose with observed
counts.

---

## Tasks

<!-- tasks: depth=3 -->

### Task 1 — spawnBounded module + its two suites

<!-- task: red=`pnpm vitest run tests/mutation/source/spawnBounded.test.ts tests/mutation/source/spawnBounded.live.test.ts` ac=AC-1,AC-2,AC-3,AC-4,AC-6,AC-11 -->

**Red:** both suite files are new; the command fails at plan time because neither file exists
(vitest exits non-zero on no matching test files), and after the suites are written it fails
because the production module tests/mutation/source/spawnBounded.ts (new) that every case imports does
not exist. The production surface whose absence makes the red fail is the module itself.

**Step 1 (RED):** write the two suites. The live suite is the validated scratch suite verbatim,
split out of the scratch suite (11 passed, 6.11s at plan time):

- Pure interpreter cases (4): ETIMEDOUT-ahead-of-null-status; numeric-status-wins-over-error;
  signal-death → infra; spawn-failure → infra with errno. Failure mode caught: `classify`-side
  verdict swaps — e.g. an `equality-flip` on `code === "ETIMEDOUT"` turns every timeout into an
  infra abort (and every reaper kill into a KILLED verdict at the runner).
- Mocked spawn-wiring cases (mock `node:child_process`, record calls; spy `process.kill`):
  - cmd is `perl`, args prefix is `WATCHDOG_ARGV`, env passes through;
  - `timeout` armed with the caller's value and `killSignal === "SIGKILL"` (kills
    `integer-literal` mutants of the default and `statement-removal` of either option);
  - ENOENT on the perl spawn → exactly one direct fallback spawn of the command argv, `ownGroup`
    false, and NO `process.kill` with a negative pid (AC-6, G1);
  - timeout and infra outcomes → `process.kill(-pid, "SIGKILL")` exactly once; exit outcome →
    never (kills `statement-removal` of the `killGroup` call and `equality-flip` on the
    `outcome.kind !== "exit"` guard);
  - WATCHDOG_SCRIPT text pins the fork-failure arm (`fork() // do { kill('USR2', $$)` and the
    exec arm `exec @ARGV; kill('USR2', $$); kill('KILL', $$)`) — the half of AC-11 that fork
    exhaustion makes unconstructible live. Anti-tautology: these two string pins are the ONLY
    text assertions, they pin the self-signal mechanism the live exec-fail case exercises, and
    the four string-presence mutants (emptied / suffixed / commented / parameter-varied) are run
    before the review dispatch per the writing-plans rule.
- Live cases (7, from the scratch run): exit 42; exit 0; exit 127 (disjoint from wrapper-failure
  shape); SIGKILLed child → `{kind:"infra", signal:"SIGKILL"}` with the OUT-OF-PROCESS killer
  (see the verification pass — an in-process killer cannot run while `spawnSync` blocks);
  hung-child-with-grandchild at `timeoutMs: 3_000` → `{kind:"timeout"}` after ≥2.9s;
  exec-failure → `{kind:"infra", signal:"SIGUSR2"}` (AC-11); parent-death: pretend harness →
  supervisor → child → grandchild, group of 3 confirmed up, harness SIGKILLed, group empty within
  10s poll budget (observed ≤2s).

**Step 2 (GREEN):** write the new module tests/mutation/source/spawnBounded.ts, the validated scratch
module verbatim:

```ts
import { type StdioOptions, spawnSync } from "node:child_process";

/**
 * The perl supervisor program: process-group leader, parent-death watchdog,
 * status/signal-transparent wait. Spec §5.1 pins this text; wrapper-internal
 * failures die by SELF-SIGNAL (SIGUSR2, SIGKILL fallback), never by a numeric
 * exit, so no wrapper failure can alias a child exit code (spec review R1).
 */
export const WATCHDOG_SCRIPT = [
  "use POSIX qw(WNOHANG);",
  "use Config;",
  "setpgrp;",
  "my $pid = fork() // do { kill('USR2', $$); kill('KILL', $$) };",
  "if ($pid == 0) { exec @ARGV; kill('USR2', $$); kill('KILL', $$) }",
  "my @signame = split ' ', $Config{sig_name};",
  "for (;;) {",
  "  my $r = waitpid($pid, WNOHANG);",
  "  if ($r > 0) {",
  "    my $s = $?;",
  "    if ($s & 127) {",
  "      my $sig = $s & 127;",
  "      $SIG{$signame[$sig]} = 'DEFAULT' if defined $signame[$sig];",
  "      kill($sig, $$);",
  "      kill('KILL', $$);",
  "    }",
  "    exit($s >> 8);",
  "  }",
  "  if (getppid() == 1) { kill('KILL', -$$) }",
  "  select(undef, undef, undef, 0.5);",
  "}",
].join("\n");

/** Argv prefix that runs a command under the supervisor. */
export const WATCHDOG_ARGV = ["-e", WATCHDOG_SCRIPT, "--"] as const;

/** Wall-clock ceiling for ONE bounded child run (doc block moves from runner.ts). */
export const MUTANT_TIMEOUT_MS = 180_000;

export type SpawnOutcome =
  | { kind: "exit"; code: number }
  | { kind: "timeout" }
  | { kind: "infra"; signal: NodeJS.Signals | null; code: string | undefined };

/** PURE interpreter over a spawnSync-shaped result. */
export function interpretSpawnOutcome(result: {
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error & { code?: string };
}): SpawnOutcome {
  if (result.error && result.error.code === "ETIMEDOUT") return { kind: "timeout" };
  if (typeof result.status === "number") return { kind: "exit", code: result.status };
  return { kind: "infra", signal: result.signal ?? null, code: result.error?.code };
}

/** SIGKILL the child's whole process group, tolerating one that is already gone. */
export function killGroup(pid: number | undefined, ownGroup: boolean): void {
  if (pid === undefined || !ownGroup) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // already gone
  }
}

export type BoundedRun = { outcome: SpawnOutcome; ownGroup: boolean };

export function spawnBounded(
  argv: readonly [string, ...string[]],
  options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs?: number },
): BoundedRun {
  const spawnOptions = {
    cwd: options.cwd,
    stdio: ["ignore", "ignore", "ignore"] as StdioOptions,
    timeout: options.timeoutMs ?? MUTANT_TIMEOUT_MS,
    killSignal: "SIGKILL" as const,
    env: options.env,
  };
  const grouped = spawnSync("perl", [...WATCHDOG_ARGV, ...argv], spawnOptions);
  const fellBack = (grouped.error as { code?: string } | undefined)?.code === "ENOENT";
  const result = fellBack ? spawnSync(argv[0], argv.slice(1), spawnOptions) : grouped;
  const ownGroup = !fellBack;
  const outcome = interpretSpawnOutcome(result);
  if (outcome.kind !== "exit") killGroup(result.pid, ownGroup);
  return { outcome, ownGroup };
}
```

The stdio-discard and ENOENT-fallback doc comments move here from
`tests/mutation/source/runner.ts:164-174` and `tests/mutation/source/runner.ts:150-156` with their content intact — they are
paid-for review arguments, not new prose.

**Step 3:** both suites green; `pnpm typecheck` green. Commit `test(infra): spawnBounded — bounded
child spawn with parent-death watchdog`.

### Task 2 — runner.ts consumes spawnBounded

<!-- task: red=`pnpm vitest run tests/mutation/source/runner.test.ts` ac=AC-3,AC-4,AC-7 -->

**Red:** edit `tests/mutation/source/runner.test.ts` first: swap every `GROUP_LEADER_ARGV` for
`WATCHDOG_ARGV` (the import at
`tests/mutation/source/runner.test.ts:82` plus the sites at `tests/mutation/source/runner.test.ts:176`
and `tests/mutation/source/runner.test.ts:224`) and repair the `reapOrphans` comment at
`tests/mutation/source/runner.test.ts:37` to name `killProcessGroup`'s successor (`spawnBounded`'s
group reap). The command is then red because `runner.ts` exports no `WATCHDOG_ARGV` — the
production line whose absence fails it is the re-export in the snippet below.

**Green:** rewrite `runSuite` to consume the shared module and delete the superseded blocks
(`MUTANT_TIMEOUT_MS` const + doc at `tests/mutation/source/runner.ts:34-49`; `GROUP_LEADER_ARGV`,
`spawnChild` and `killProcessGroup` at `tests/mutation/source/runner.ts:133-206`), keeping `MUTANT_TIMEOUT_EXIT` and
`MutantRunInfraError` where they are:

```ts
import { MUTANT_TIMEOUT_MS, WATCHDOG_ARGV, spawnBounded } from "./spawnBounded";

export { MUTANT_TIMEOUT_MS, WATCHDOG_ARGV } from "./spawnBounded";

const CHILD_ARGS = ["exec", "vitest", "run", "--config", CONFIG] as const;

export function runSuite(
  root: string,
  target: string,
  mutantFile: string,
  suite: string,
  context: string,
): number {
  const env = {
    ...process.env,
    MUTATION_ROOT: root,
    MUTATION_TARGET: target,
    MUTATION_MUTANT: mutantFile,
    MUTATION_SUITE: suite,
  };
  // A timeout kill and this machine's idle-process reaper arrive in the SAME
  // shape (no exit status, a signal), so the code is the only thing that tells
  // them apart, and they must not share a verdict (see MUTANT_TIMEOUT_EXIT).
  // The group reap on the timeout and infra arms runs inside spawnBounded.
  const { outcome } = spawnBounded(["pnpm", ...CHILD_ARGS], {
    cwd: root,
    env,
    timeoutMs: MUTANT_TIMEOUT_MS,
  });
  if (outcome.kind === "timeout") return MUTANT_TIMEOUT_EXIT;
  if (outcome.kind === "exit") return outcome.code;
  throw new MutantRunInfraError(`${context} [${suite}]`, outcome.signal, outcome.code);
}
```

Validated at plan time: this exact state ran **13 passed, 2.99s** — including the live
grandchild-reap and live-ETIMEDOUT cases in production order. `rg -n reapOrphans` over the tree
returns nothing after the comment repair (AC-7). Commit `fix(infra): runner spawns mutants under
the parent-death watchdog`.

### Task 3 — childRun bounded, abnormal outcomes throw

<!-- task: red=`pnpm vitest run tests/mutation/source/childRun.test.ts` ac=AC-5 -->

**Red:** new suite tests/mutation/source/childRun.test.ts (new), runnable against the CURRENT tree,
mocking `node:child_process`: (a) child exits 3 → returns 3; (b) child exits 0 → returns 0;
(c) ETIMEDOUT shape → expect `MutantRunInfraError`; (d) signal-death shape (`status: undefined`,
`signal: "SIGKILL"`) → expect `MutantRunInfraError`. The mock intercepts BOTH `execFileSync` (the
current implementation's seam, which throws the shaped error) AND `spawnSync` (the post-rewrite
seam, which returns the shaped result) from one behavior table, so the SAME command is observed
red against the old code and green against the new. Cases (c) and (d) FAIL on the live tree: the
current catch returns `(e as { status?: number }).status ?? 1`
(`tests/mutation/source/childRun.ts:36`) — case (d) observably returns `1`, the false
premise-proof of spec P-C1. The production lines whose defect makes the red fail are
`tests/mutation/source/childRun.ts:17-37`.

**Green:** rewrite `childRun` on the shared path (validated scratch verbatim):

```ts
import { join } from "node:path";
import { MutantRunInfraError } from "./runner";
import { MUTANT_TIMEOUT_MS, spawnBounded } from "./spawnBounded";

export function childRun(root: string, fixture: string, target: string): number {
  const { outcome } = spawnBounded(["pnpm", "exec", "vitest", "run", "--config", CONFIG], {
    cwd: root,
    env: {
      ...process.env,
      VITEST_INCLUDE_MUTATION_HARNESS: "1",
      MUTATION_ROOT: root,
      MUTATION_TARGET: join(root, target),
      MUTATION_MUTANT: join(root, target),
      MUTATION_SUITE: fixture,
    },
    timeoutMs: MUTANT_TIMEOUT_MS,
  });
  if (outcome.kind === "exit") return outcome.code;
  if (outcome.kind === "timeout") {
    throw new MutantRunInfraError(`childRun ${fixture}`, null, "ETIMEDOUT");
  }
  throw new MutantRunInfraError(`childRun ${fixture}`, outcome.signal, outcome.code);
}
```

with the doc comment extended to state WHY abnormal throws (a hung or reaper-killed fixture
produced no verdict; returning non-zero forges "premise proven" at
`tests/mutation/_metaPremiseContract.test.ts:336`). Consumers stay untouched and green — validated
at plan time: `_metaOverlayConfigParity` **5 passed**, `_metaPremiseContract` **10 passed**.
Commit `fix(infra): childRun bounded; abnormal outcomes are infra faults, not verdicts`.

### Task 4 — four string-presence mutants, run and recorded

<!-- task: red=`pnpm vitest run tests/mutation/source/spawnBounded.test.ts` ac=AC-11 -->

Per the writing-plans anti-tautology rule, the WATCHDOG_SCRIPT text pins from Task 1 get all four
pre-dispatch mutants, applied to the module by hand, suite run, reverted, results recorded in the
commit message: (a) `WATCHDOG_SCRIPT` emptied; (b) a suffix appended after the exec arm;
(c) the `kill('USR2', $$)` arms commented out inside the perl text (present but not live);
(d) the argv separator `"--"` varied. Expected: the suite reds on every one — (a)/(b)/(c) through
the text pins AND (a)/(c) through the live exec-fail case, (d) through the wiring cases. Any
mutant the suite misses gets a case before Task 5. **Red:** each mutant application is an observed
red of the SAME command that Task 1 left green; the recorded transcript is the deliverable.
Commit `test(infra): record the four string-presence mutants for the watchdog pins`.

### Task 5 — enrolment and the scoped scoring run

<!-- task: red=`pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` ac=AC-8,AC-9 -->

**Red:** add the `GUARD_SURFACES` row FIRST and run the premise-contract suite — it walks enrolled
suites from the registry, so the newly enrolled suite (Task 1's tests/mutation/source/spawnBounded.test.ts) now appears with no
`EXPECTED_ENV_TOUCHING` row and the suite reds (fails-by-default contract,
`tests/mutation/_metaPremiseContract.test.ts:32-45`). Observed-red lands here; green when the row
is added with the count the failure output reports.

Registry row (final `scoreFloor` and `accepted` set from the scoring run):

```ts
{
  id: "spawnBounded",
  sourcePath: "tests/mutation/source/spawnBounded.ts",
  suitePaths: ["tests/mutation/source/spawnBounded.test.ts"],
  operators: ["equality-flip", "logical-connector", "integer-literal", "statement-removal"],
  scoreFloor: 0.85, // provisional; finalized from the measured score below
  control: {
    from: 'if (outcome.kind !== "exit") killGroup(result.pid, ownGroup);',
    to: 'if (outcome.kind === "exit") killGroup(result.pid, ownGroup);',
  },
  accepted: [],
},
```

(`control.from` occurs exactly once in the module — checked by
`validateSurface`, `tests/mutation/source/registry.ts:88-96`, which reds the meta-registry suite
on a miscount.) Then the `EXPECTED_LEDGER_KINDS` row (`spawnBounded: { ... }` with the kinds the
run produces; the gates completeness check at `tests/mutation/guardSurfaces.gates.test.ts:21`
covers it).

**Scoring run — FOREGROUND, wrapped, scoped by temp shard:**

```bash
cat > tests/mutation/guardSurfaces.shard9.test.ts <<'EOF'
import { GUARD_SURFACES } from "./source/registry";
import { registerSurfaceCases } from "./source/surfaceCases";
registerSurfaceCases(GUARD_SURFACES.filter((s) => s.id === "spawnBounded"));
EOF
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy vitest run --project mutation tests/mutation/guardSurfaces.shard9.test.ts
rm tests/mutation/guardSurfaces.shard9.test.ts
```

Every survivor gets a disposition: a killing case added to the enrolled suite, an `accepted` row
with an equivalence argument, or an `accepted-gap` row with a backlog ref — empty
unaccepted-survivor set is the gate (spec §1.2 Score). Mocked-suite blind spots are EXPECTED for
sites only the real spawn path exercises; their killing cases belong in the enrolled suite as
mocked shapes where possible, and anything genuinely live-only is an honest `accepted` row citing
the live suite as its guard. Set `scoreFloor` to the measured score rounded DOWN to two decimals.
Commit `test(infra): enroll spawnBounded in the source-mutation gate`.

### Task 6 — ledger peer row + sweeps

<!-- task: red=`rg -q BL-MUTATION-BROWSER-CHILD-LIFETIME BACKLOG.md` ac=AC-9 -->

**Red:** run at plan time, the command exits 1 — the peer row does not exist in BACKLOG.md — and
exits 0 once the row lands: red-then-green on the same command, with the "production" surface
being the ledger row itself. Add the `BL-MUTATION-BROWSER-CHILD-LIFETIME`
row to BACKLOG.md per spec §9.1: shape, citation
(`tests/mutation/browser/runner.ts:152`), class-sweep exception (c) with the ceiling-derivation
reason, `Reachability: PROBED` by citation. Then the closing sweeps, all run and pasted into the
PR body:

- `rg -n reapOrphans` → empty (AC-7 double-check after Task 2);
- `pnpm spec:lint docs/superpowers/specs/ci/2026-08-17-mutation-child-lifetime-design.md` and
  `pnpm spec:lint docs/superpowers/plans/ci/2026-08-17-mutation-child-lifetime.md` → 0 hard;
- `pnpm typecheck` → clean;
- scoped suites: the five files this arc touches or creates, one `pnpm vitest run` with the
  explicit file list → all green;
- `pnpm ledger:claims` table still shows this branch's claim (invariant 12).

Commit `docs(plan): file the browser-runner lifetime peer and closing sweeps`.

<!-- tasks: end -->

---

## Whole-diff review and closeout

- Cross-model whole-diff review to APPROVE before merge. The round-1 diff brief's
  `GUARD SURFACE:` line carries BOTH halves per spec §8: `MUTATION SCORE: <killed>/<total>` from
  Task 5 plus `0 unaccepted survivors`, and
  `CANNOT-EXPRESS: no string-literal operator, tests/mutation/source/operators.ts:17-24; live-suite
  guard per spec §8` for the watchdog text. Convergence criterion, probe domain, and threat fence
  quoted from spec §1.2 in every brief.
- Stage 4.4: invariant-12 marker off in the PR's last commit; push; auto-merge; `0  0` check;
  labels cleared; cron deleted.

## 12. Closeout

impeccable-gate: N/A — no UI surface
