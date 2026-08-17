# Mutation-harness child lifetime under parent death — design

**Backlog entry:** `BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH` (BACKLOG.md, filed 2026-08-16, `Reachability: PROBED`).
**Branch:** `fix/mutation-child-lifetime`. **Date:** 2026-08-17.
**Adjacent shipped design:** `docs/superpowers/specs/ci/2026-08-16-heavy-orphan-worker-lifetime-design.md` (heavy-reap) — §2 below settles how the two relate, with probes.

Every lifetime bound in the mutation harness is enforced BY THE PARENT: the per-mutant ceiling by
`spawnSync`'s `timeout` (`tests/mutation/source/runner.ts:176`, constant `MUTANT_TIMEOUT_MS` at
`tests/mutation/source/runner.ts:49`), the group reap by `killProcessGroup`
(`tests/mutation/source/runner.ts:199`), and `childRun` has no bound at all
(`tests/mutation/source/childRun.ts:18`). A live parent bounds its child well; a dead parent bounds
nothing. This spec adds the missing bound at the only place that can see parent death — inside the
child's own process group — and repairs `childRun`'s sibling gap in the same stroke.

---

## 1. Problem

### 1.1 Resolved scope — do not relitigate

Each row is settled. Re-opening one needs new evidence, not a re-reading.

| Decision | Ratification |
| --- | --- |
| Heavy-reap is COMPLEMENTARY, not sufficient, and for the post-`setpgrp` parent-death tree it reaps NOTHING: probe P-T1 shows the only reparented process is the group leader, which is not worker-shaped (declines `not-a-worker`), while every descendant keeps a live parent (declines `has-live-parent`). Prevention is therefore the only bound for this producer's parent-death case, not a latency improvement on an existing one. | §2, P-T1 |
| `setpgrp` (the process group) is KEPT. The watchdog does not make it unnecessary: the group serves the parent-ALIVE hazard — `spawnSync` timeout plus `killProcessGroup` reaping a hung mutant's descendants (probe P-A1, unchanged under the watchdog) — and the watchdog's own parent-death kill is delivered VIA the group (`kill 'KILL', -$$`). The backlog entry's "first scheduled step" hypothesis (watchdog might make the group unnecessary) is answered NO, with P-A1 as the evidence. | §4, P-A1 |
| The watchdog lives in the GROUP LEADER (a perl supervisor), not in the vitest child. P-T1 shows only the direct child of the harness ever observes `getppid() == 1`; a poll inside vitest's main process or its workers would never fire because their parents stay alive. | §5.1, P-T1 |
| The supervisor form (fork-and-wait perl) is accepted HERE even though the heavy-orphan spec rejected fork-and-supervise for `with-heavy-slot.py` (its §3 approach C). The two are different surfaces: the wrapper there carries a slot lock whose zero-cleanup release rides on `execvp`, and its exit-status transparency is a ratified property; here the wrapper carries nothing, and probes P-W1a/P-W1b show exit-status AND signal transparency are preserved by the supervisor. A SIGKILLed supervisor degrades to exactly today's behavior — the orphan the backstop already covers — so the "supervisor is itself killable" objection bounds the residue instead of rejecting the design. | §4, P-W1a, P-W1b |
| `MutantRunInfraError` discrimination (a signalled child is an infra fault, never a KILLED verdict — `tests/mutation/source/runner.ts:74`) is preserved: the supervisor re-raises the child's fatal signal at itself, so `spawnSync` still reports `status=null, signal=<sig>`. Probed (P-W1b: `status=null signal=SIGKILL`). | §5.1, P-W1b |
| `childRun`'s repair changes its contract for abnormal outcomes: a timeout or signal death THROWS a typed infra error instead of returning non-zero. Returning non-zero would read as "premise proven" to all three consumers (`tests/mutation/_metaOverlayConfigParity.test.ts:6`, `tests/mutation/_metaPremiseContract.test.ts:7`, `tests/mutation/guardSurfaces.gates.test.ts:10`), and the current `status ?? 1` catch (`tests/mutation/source/childRun.ts:36`) already converts a reaper-killed fixture into a false premise-proof today. | §5.3 |
| The mapping asymmetry between the two callers is deliberate: `runSuite` maps a timeout to `MUTANT_TIMEOUT_EXIT` (a KILLED verdict — the mutant's own doing, `tests/mutation/source/runner.ts:60`), while `childRun` maps a timeout to a THROWN infra error (a hung premise fixture is an authoring defect, not a verdict). One bounded-spawn mechanism, two caller-owned interpretations. | §5.3 |
| The heavy-reap accept-set is NOT widened to cover the orphaned group leader's shape. Prevention closes that shape at the producer; widening a recognizer is the wrong repair direction (AGENTS.md, repair-direction-under-same-axis-recurrence), and the leader's argv (a `node …/pnpm exec vitest run --config …` line) is exactly the sibling-worktree-shaped pattern the heavy-reap spec's own §4.2(a) registry deliberately excludes. | §2, §9 |
| The perl-missing (`ENOENT`) degraded path is kept as-is: direct spawn, `ownGroup=false`, no watchdog, timeout still armed (`tests/mutation/source/runner.ts:184-187`). Perl ships with macOS and every CI image this runs on; the degraded mode is reported by shape, not silently assumed (comment at `tests/mutation/source/runner.ts:153-156`). | §5.4 |
| Mutation enrolment is SPLIT, per probe: the new module's pure interpretation logic is enrollable and enrolled; the watchdog perl program is a string literal, and the declared operator set has NO string-literal operator (`tests/mutation/source/operators.ts:17-24` — six operators, none rewrites string content), so registry scoring CANNOT EXPRESS its behavior. Its guard is live process-tree tests (template: `tests/mutation/source/runner.test.ts:206`). Honest re-disposition precedent: the step3-a11y tap-target outcome (`docs/superpowers/specs/2026-08-09-quick-wins-2-mech.md` §1.1.4). | §8 |
| `scripts/with-heavy-slot.py`, `scripts/heavy-reap.ts`, `lib/heavyReap/**` are untouched. This arc edits the PRODUCER (`tests/mutation/source/**`); the backstop's own decisions are settled in its spec's §1.1 and are not re-opened by this one. | §10 |
| `tests/mutation/browser/runner.ts` is NOT repaired here. Same defect shape (`execFileSync`, no timeout, no group, `tests/mutation/browser/runner.ts:152`), different surface: its children are whole Playwright runs whose legitimate wall clock is minutes, so `MUTANT_TIMEOUT_MS` does not transfer and the ceiling needs its own derivation. Filed as a peer with class-sweep exception (c) — §9.1. | §9.1 |

### 1.2 Convergence bound — what closes this design

Stated in the design per AGENTS.md's round-economy block, so no review brief has to invent it:

- **Consequence bound.** Every mutation-harness child is bounded while its parent lives (existing,
  unchanged) AND exits within one watchdog poll interval of parent death (new). Every abnormal
  child outcome — signal death, timeout, spawn failure — surfaces as a typed infra fault or as the
  timeout verdict its caller's row in §5.3 assigns; never silently scored, never silently hung,
  never read as a premise result. The worst case of any input the wrapper cannot classify is
  today's behavior (an orphan the heavy-reap backstop reports and, where its predicate allows,
  reaps) plus a degraded-mode signal — a DOCUMENTED LIMIT, not a finding. A wrongly-SCORED verdict
  is the only outcome this design treats as a defect.
- **PROBE DOMAIN:** the live process table on this machine (`ps -eo pid,ppid,pgid,command`),
  `tests/mutation/**`, the probe scripts and transcripts embedded in §3 of this document, and the
  declared operator set (`tests/mutation/source/operators.ts:17-24`). A probe input is drawn from
  that domain or is one ordinary edit away from an input in it; a constructed process shape no
  producer in this repo can emit files to §6.
- **Threat fence.** Ordinary parent death — SIGKILL, jetsam, session teardown, usage-limit kills —
  and ordinarily hung mutants or fixtures. Adversarial process manipulation (a child that
  re-`setpgrp`s itself out of the group, rewrites its argv, or installs signal handlers to defeat
  its own reaping) is OUT and files to §6 (L-3). Perl absent is the documented degraded mode, not
  a threat.
- **Score.** §8 states the enrolment split. For the enrolled module the criterion is the mutation
  score plus an empty unaccepted-survivor set; a the-guard-does-not-pin-what-it-claims finding is
  admissible only with a surviving mutant from the declared operator set. For the watchdog string
  the criterion is the live behavioral suite passing, and a gap claim is admissible only with a
  live probe demonstrating the escape.

### 1.3 The four filed components

From the backlog entry, restated so this document is self-contained:

1. **No parent-death watchdog in the child.** macOS has no `prctl(PDEATHSIG)` equivalent, so
   polling `getppid()` is the only available form.
2. **`setpgrp` makes the child immune to session teardown.** `GROUP_LEADER_ARGV`
   (`tests/mutation/source/runner.ts:146`) puts each mutation child in its own process group so
   the parent can reap a hung grandchild. The backlog's probe (2026-08-16): a same-group child
   dies with a group-directed `kill -9 -<pgid>`; a `setpgrp`'d one survives and reparents to init.
   A real improvement on the hazard it targeted; a regression on this one.
3. **`childRun` bounds nothing.** `execFileSync` with no `timeout` and no process group
   (`tests/mutation/source/childRun.ts:18`), unlike its sibling `runSuite`
   (`tests/mutation/source/runner.ts:176`, `tests/mutation/source/runner.ts:183`). The two were
   explicitly repaired together for stdio (`tests/mutation/source/childRun.ts:20-23`) but not for
   lifetime.
4. **A stale comment naming a function that does not exist.** `tests/mutation/source/runner.test.ts:37`
   names `reapOrphans`; the mechanism it describes is `killProcessGroup`
   (`tests/mutation/source/runner.ts:199`).

---

## 2. The design decision: heavy-reap's relation to in-harness bounds

The brief's first task, settled by probe rather than opinion. Verdict: **COMPLEMENTARY — and the
backstop is structurally weaker for this producer than its own filing assumed.**

The heavy-reap predicate (its spec §4.2) reaps a process only when it is worker-shaped
(`basename(argv[0]) === "node"` AND last argv token ends with a registered worker entrypoint) AND
orphaned (`ppid == 1`) AND aged past 4 h. Probe P-T1 (§3) reproduces the harness's exact spawn
shape — `perl -e 'setpgrp; exec @ARGV' -- pnpm exec node …` with a child and grandchild — and
SIGKILLs the pretend harness. Result:

- The ONLY process that reparents to init is the group leader (the `setpgrp`'d process that
  exec'd into pnpm). Its argv is `node …/pnpm exec …` — `argv[0]` is node, but its last token is
  never a worker entrypoint, so heavy-reap declines it `not-a-worker` forever.
- Every descendant — the vitest main process and its fork workers, in the real chain — keeps its
  live parent. Heavy-reap declines each `has-live-parent` forever, at any age.

So post-`setpgrp` (merged 2026-08-15, `d18e9b4d5` / `35d5c0e58`), a mutation child tree orphaned by
harness death is INVISIBLE to the backstop as long as its internal parent links hold: a hung mutant
under a dead harness burns cores indefinitely, and the only surfaced signal is the leader's
`not-a-worker` decline line in a heavy-reap report someone must read. The heavy-reap spec's §11
claim that "Approach A covers the CONSEQUENCE, such a child is exactly a §4.2 reapable" is true of
the PRE-`setpgrp` shape (a worker directly orphaned, which is what the 2026-08-16 census held — all
eleven predate the `setpgrp` merge) and NOT true of the shape the harness produces today.

Consequences, each carried into the design:

| Hazard | Bounded by | This arc's change |
| --- | --- | --- |
| Hung mutant, parent ALIVE | `spawnSync` timeout + `killProcessGroup` — instant, unchanged (P-A1) | none (kept) |
| Parent DEATH, tree intact | **nothing today** (P-T1: heavy-reap declines every member) | watchdog: whole group dead within one poll interval (P-W1c) |
| Watchdog itself SIGKILLed, tree re-orphaned worker-shaped | heavy-reap backstop (4 h + trigger), where its predicate matches | none — this is the backstop's job (its L-2) |
| Hung premise fixture under `childRun`, parent alive | **nothing today** (`tests/mutation/source/childRun.ts:18`) | timeout + group, same mechanism |

Neither mechanism substitutes for the other: the watchdog cannot reach a child whose supervisor was
SIGKILLed, and the backstop cannot see a tree whose parent links survived. Complementary, with the
prevention closing the two rows the backstop structurally cannot.

---

## 3. Probes

All ran on this machine 2026-08-17 (worktree `fix/mutation-child-lifetime`, base `59a9ef25a`)
unless dated otherwise. Scripts are quoted inline; transcripts are verbatim.

**P-T1 — parent death orphans ONLY the group leader; heavy-reap reaps nothing.** A pretend harness
spawns the real wrapper shape (`perl -e 'setpgrp; exec @ARGV' -- pnpm exec node -e …` where the
inner node spawns a grandchild), then is SIGKILLed:

```
# before kill                                  # 2s after kill -9 <harness>
  PID  PPID  PGID COMMAND                        PID  PPID  PGID COMMAND
60504 60495 60504 node …/pnpm exec node -e …   60504     1 60504 node …/pnpm exec node -e …
60510 60504 60504 node -e …                    60510 60504 60504 node -e …
60515 60510 60504 node -e setInterval…         60515 60510 60504 node -e setInterval…
```

`60504` is the exec'd leader: `ppid` 1, argv0 `node`, last token an inline script — heavy-reap
clause (a) fails, decline `not-a-worker`. `60510`/`60515`: live parents — decline
`has-live-parent`. Nothing is ever reaped; the tree runs until it drains on its own.

**P-W1 — the supervisor watchdog, three properties.** The candidate wrapper (§5.1's script, probed
with `waitpid($pid, 1)` — `WNOHANG`, verified `== 1` on this machine via
`perl -e 'use POSIX qw(WNOHANG); print WNOHANG'`):

- **P-W1a, exit-status transparency:** `perl watchdog.pl sh -c 'exit 42'` → shell `$?` is `42`.
- **P-W1b, signal transparency:** child (`sh -c '…; exec sleep 30'`) SIGKILLed by a third party
  while supervised; the harness-side `spawnSync` reports:

  ```
  status= null signal= SIGKILL
  ```

  i.e. the supervisor re-raised the child's fatal signal at itself, and the
  `MutantRunInfraError` path (`tests/mutation/source/runner.ts:121-130`) still discriminates a
  signalled death from a numeric exit.
- **P-W1c, parent-death reap:** pretend harness spawns `perl watchdog.pl node -e <spawns a
  grandchild>`; tree confirmed 3 processes in group `64503`; `kill -9` the harness; 2 s later:

  ```
  REMAINING=0
  ```

  Whole group (supervisor + child + grandchild) gone within 2 s — the 0.5 s poll plus process
  teardown.

**P-A1 — the parent-ALIVE hazard is unchanged under the supervisor.** `spawnSync` of the watchdog
form with `timeout: 2000, killSignal: 'SIGKILL'` around a child that spawns a grandchild and
hangs:

```
errcode= ETIMEDOUT status= null signal= SIGKILL pid= 70951
group kill sent
REMAINING_IN_GROUP= 0
```

`ETIMEDOUT` still surfaces (the `MUTANT_TIMEOUT_EXIT` branch at
`tests/mutation/source/runner.ts:117-120` still fires), and `killProcessGroup`'s negative-pid
SIGKILL still clears the whole group including the grandchild — the group id survives the
leader's death, as the heavy-orphan spec's own §4.2 probes established.

**P-C1 — the `childRun` false-premise path is code-visible, not hypothetical.** No process probe
needed: `execFileSync` throws on a signalled child with `status: undefined`, and the catch returns
`(e as { status?: number }).status ?? 1` (`tests/mutation/source/childRun.ts:35-37`) — a reaper
kill or OOM kill of a premise fixture returns `1` to consumers whose contract is "non-zero means
the premise is PROVEN" (`tests/mutation/source/childRun.ts:12-14`).

---

## 4. Approaches considered

**A — parent-death watchdog in the group-leader wrapper (CHOSEN), composing with the existing
group.** The wrapper stops exec'ing and becomes a minimal supervisor: `setpgrp`, fork, exec the
command in the child, then poll `waitpid`/`getppid` and (i) on child exit, propagate status or
re-raise the fatal signal; (ii) on `getppid() == 1`, SIGKILL its own group. *Why:* it is the only
placement that observes parent death at all (P-T1); it preserves both transparencies (P-W1a/b);
it keeps the group reap for the parent-alive hazard byte-compatible (P-A1); and it closes the
session-teardown regression (component 2) as a side effect — a group-kill of the harness's session
now orphans the supervisor, whose next poll sees `ppid == 1` and takes the tree down.

**B — watchdog inside the vitest child (a config-level `getppid` poll).** REJECTED: the vitest
main process and its workers never see `ppid == 1` when the harness dies — their parents (pnpm,
vitest main) stay alive (P-T1). The poll would guard against the death of a process that almost
never dies alone.

**C — rely on the heavy-reap backstop alone.** REJECTED on P-T1: the backstop reaps nothing of the
post-`setpgrp` tree, so this is not a latency trade (4 h vs 0.5 s) but a coverage hole. Also
rejected on scope: the backstop's own spec fences prevention out (its §11) and files it HERE.

**D — widen heavy-reap's accept-set to the leader's shape.** REJECTED — see §1.1 row 8.

---

## 5. Design

### 5.1 The wrapper: `WATCHDOG_ARGV`

`GROUP_LEADER_ARGV` (`tests/mutation/source/runner.ts:146`) is replaced by a supervisor argv whose
perl program is, verbatim (the plan pins this text in a fixture-backed test):

```perl
use POSIX qw(WNOHANG);
setpgrp;
my $pid = fork() // exit 125;
if ($pid == 0) { exec @ARGV; exit 127 }
for (;;) {
  my $r = waitpid($pid, WNOHANG);
  if ($r > 0) {
    my $s = $?;
    if ($s & 127) { kill(($s & 127), $$); exit(128 + ($s & 127)) }
    exit($s >> 8);
  }
  if (getppid() == 1) { kill('KILL', -$$); exit 111 }
  select(undef, undef, undef, 0.5);
}
```

Reading order of the loop is load-bearing: the child's exit is checked before the parent's death,
so a normally-completed run is never converted into a group kill by a racing harness death. The
`kill(($s & 127), $$)` re-raise uses perl's numeric-signal `kill` with no handler installed, so the
default disposition terminates the supervisor by the SAME signal — that is P-W1b's mechanism, and
it is what keeps `MutantRunInfraError` (`tests/mutation/source/runner.ts:74`) honest. Exit code
`127` (exec failed) is the shell command-not-found convention; `125` (fork failed) is the
cannot-run convention (`git bisect`'s skip code); `111` (parent-death path) is unreachable in
practice because `kill 'KILL', -$$` includes the supervisor itself.

Latency: parent death → whole group SIGKILLed within one 0.5 s poll plus kernel teardown
(P-W1c measured ≤ 2 s end-to-end). Cost while healthy: one `waitpid(WNOHANG)` + one `getppid()`
per 0.5 s — unmeasurable against a vitest boot.

### 5.2 Module shape

| Unit | Responsibility |
| --- | --- |
| tests/mutation/source/spawnBounded.ts (new) | Owns `WATCHDOG_ARGV`, the bounded `spawnSync` invocation (cwd, env, discarded stdio, `timeout`, `killSignal: "SIGKILL"`), the perl-`ENOENT` degraded fallback, the group kill, and a PURE outcome interpreter `interpretSpawnOutcome(result)` returning `{kind:"exit",code} \| {kind:"timeout"} \| {kind:"infra",signal,code}`. |
| `tests/mutation/source/runner.ts` (edited) | `spawnChild`/`runSuite` consume the shared module; verdict mapping unchanged (`timeout` → `MUTANT_TIMEOUT_EXIT`, `infra` → throw `MutantRunInfraError`, `exit` → code). Public API (`runSuite`, `runSurface`, `runControl`, `MUTANT_TIMEOUT_MS`, `MUTANT_TIMEOUT_EXIT`, `MutantRunInfraError`) unchanged; `GROUP_LEADER_ARGV` is superseded by the new module's export and its two test consumers (`tests/mutation/source/runner.test.ts:176`, `tests/mutation/source/runner.test.ts:224`) move with it. |
| `tests/mutation/source/childRun.ts` (edited) | Same bounded path; caller mapping per §5.3. `INERT_TARGET` and the fixture-env contract (`VITEST_INCLUDE_MUTATION_HARNESS`, `tests/mutation/source/childRun.ts:27`) unchanged. |

One mechanism, two caller-owned mappings — the same one-place-for-lifetime-bounds shape that the
backlog entry says the four components share.

### 5.3 Outcome mapping per caller

| Outcome | `runSuite` (mutant scoring) | `childRun` (premise fixtures) |
| --- | --- | --- |
| `exit` with code N | return N (verdict via `classify`) | return N (non-zero = premise proven, unchanged) |
| `timeout` | return `MUTANT_TIMEOUT_EXIT` — the mutant hung itself; detection, per `tests/mutation/source/runner.ts:51-58` | THROW typed infra error — a hung fixture is an authoring/infra defect; returning non-zero would forge a premise proof |
| `infra` (signal death, spawn failure) | throw `MutantRunInfraError` (unchanged) | THROW typed infra error (today: returns 1 — the P-C1 false-premise path, repaired) |

Group reap on the timeout and infra arms runs in the shared module for both callers, exactly as
`runSuite` does today (`tests/mutation/source/runner.ts:118`, `tests/mutation/source/runner.ts:125`).
`childRun`'s thrown error is `MutantRunInfraError` or a sibling with the same
never-a-verdict semantics; the plan picks the spelling and the consumers' handling
(all three consumers currently compare exit codes only, so a throw fails their suites loudly —
the correct direction for an infra fault).

### 5.4 Guard conditions — degenerate inputs

| ID | Condition | Behavior |
| --- | --- | --- |
| G1 | perl absent (`ENOENT` on the wrapper spawn) | degraded direct spawn: no group, no watchdog, `timeout` still armed; `ownGroup=false` so the negative-pid kill is never attempted (today's contract, `tests/mutation/source/runner.ts:184-187`, `tests/mutation/source/runner.ts:199-206`) |
| G2 | `fork` fails inside the wrapper | exit 125 → a numeric exit at the harness. During baseline, `assertCleanBaseline` aborts the run loudly (`tests/mutation/source/runner.ts:240-243`); mid-run it scores KILLED for that mutant — bounded misattribution under a machine already failing `fork`, documented as L-4 |
| G3 | `exec` fails inside the wrapper (command missing) | exit 127 → same shape as G2; the persistent form cannot survive baseline. L-4 |
| G4 | child exits and harness dies in the same poll window | child-exit branch wins (checked first); the supervisor then exits into a dead parent — no kill was needed, nothing leaks |
| G5 | supervisor itself SIGKILLed while child lives (includes the `spawnSync`-timeout path) | descendants persist in the group; parent-alive path: harness `killProcessGroup` reaps (P-A1); parent-dead path: heavy-reap backstop, where its predicate matches (§2 table row 3) |
| G6 | child installs a SIGTERM handler | irrelevant to the ceiling: `killSignal` is SIGKILL (`tests/mutation/source/runner.ts:180`) and the watchdog's group kill is SIGKILL — both untrappable |
| G7 | fixture path passed to `childRun` nonexistent / suite empty | vitest exits non-zero → `exit` outcome, consumer semantics unchanged from today |

---

## 6. Documented limits

- **L-1 — the watchdog bound is one poll interval, not an instant.** Up to 0.5 s of orphan life
  plus kernel teardown (P-W1c: ≤ 2 s end-to-end). Tightening the interval buys nothing a human can
  observe and costs steady-state wakeups.
- **L-2 — a SIGKILLed supervisor reproduces today's exposure.** The residue is exactly the shape
  the heavy-reap backstop owns (its L-2 bound: ceiling + trigger interval), minus the tree shapes
  its predicate cannot see (§2). Closing that residue would need kernel parent-death delivery
  macOS does not offer; the design accepts it and says so rather than claiming totality.
- **L-3 — adversarial children defeat this.** A child that re-`setpgrp`s out of the group escapes
  both the watchdog's group kill and `killProcessGroup`. Out of the threat fence (§1.2).
- **L-4 — wrapper-internal failures (fork/exec) report as numeric exits 125/127,
  indistinguishable from a suite exiting 125/127.** The persistent form is caught at baseline
  (G2/G3); the transient mid-run form misattributes ONE mutant's verdict on a machine already
  failing `fork`/`exec`. Making them discriminable would need an out-of-band channel the
  exit-code-only contract (`tests/mutation/source/childRun.ts:12-14`) deliberately does not have.
- **L-5 — a clean child exit does not sweep stragglers.** On a normal exit the supervisor
  propagates status without a group kill, matching today's behavior (`runSuite` group-kills only
  on the timeout and infra arms). A vitest run that leaks a worker on a SUCCESSFUL exit leaks it
  under this design too; that worker is directly orphaned (its parent chain collapses), which is
  precisely the shape the heavy-reap predicate DOES reap.
- **L-6 — the degraded no-perl mode has neither group nor watchdog.** `timeout` still bounds the
  direct child; grandchildren of a timed-out child leak to the backstop. Unchanged from today's
  fallback contract (G1).

---

## 7. Acceptance criteria

- **AC-1** — A mutation child tree whose harness dies is fully gone (supervisor, child, every
  same-group descendant) within one poll interval plus teardown, proved by a live test in the
  P-W1c shape.
- **AC-2** — Exit-status transparency: a child exiting N yields N at the harness for every
  0 ≤ N ≤ 255 exercised by the suite (at minimum 0, 1, 42).
- **AC-3** — Signal transparency: a child killed by an untrappable signal yields
  `status=null, signal=<sig>` at the harness, and `runSuite` throws `MutantRunInfraError` for it
  (live test in the P-W1b shape).
- **AC-4** — The parent-alive hazard is unchanged: a hung child under a live harness times out at
  `MUTANT_TIMEOUT_MS`, scores `MUTANT_TIMEOUT_EXIT`, and its whole group — grandchildren included —
  is dead after `killProcessGroup` (live test in the P-A1 shape; the existing
  `tests/mutation/source/runner.test.ts:206` live test keeps passing).
- **AC-5** — `childRun`: a fixture exiting non-zero still returns that code; a fixture that hangs
  or dies on a signal THROWS — no code path returns a fabricated non-zero (kills the P-C1 path).
  All three consumers' suites stay green with unchanged call sites.
- **AC-6** — Degraded mode: with the wrapper binary absent, the child still runs, the timeout
  still arms, and no negative-pid kill is attempted (G1 contract, pinned by the existing mocked
  suite pattern at `tests/mutation/source/runner.test.ts:176`-region).
- **AC-7** — The `reapOrphans` comment at `tests/mutation/source/runner.test.ts:37` names the real
  mechanism (`killProcessGroup`), and `rg reapOrphans` over the tree returns nothing.
- **AC-8** — Enrolment per §8: the new spawnBounded module's registry row exists with a declared control and
  an `EXPECTED_LEDGER_KINDS` row (`tests/mutation/source/expectedLedgerKinds.ts`), and the scoped
  gate run reports no unaccepted survivor for it.
- **AC-9** — The whole-corpus mutation gate is untouched in shape: no change to
  `tests/mutation/source/surfaceCases.ts` semantics (module-scope cost note,
  `tests/mutation/source/surfaceCases.ts:18-21`), shard files, or the browser gate.

---

## 8. Mutation enrolment — the split, stated honestly

The new module tests/mutation/source/spawnBounded.ts (new; §5.2) carries two kinds of content, and the registry can express
exactly one of them:

- **Enrolled: the pure logic.** `interpretSpawnOutcome` and the option-assembly around the spawn —
  equality checks (`code === "ETIMEDOUT"`, `typeof status === "number"`), logical connectors,
  statement-level structure — are the declared operators' home turf (`equality-flip`,
  `logical-connector`, `statement-removal`, `integer-literal`;
  `tests/mutation/source/operators.ts:17-24`). One `GUARD_SURFACES` row
  (`tests/mutation/source/registry.ts`), suite = the module's own MOCKED test file (fast; no live
  spawns per mutant), one `EXPECTED_LEDGER_KINDS` row. Score criterion per §1.2.
- **CANNOT-EXPRESS: the watchdog perl program.** It is a single string literal; none of the six
  operators rewrites string-literal content (`tests/mutation/source/operators.ts:17-24`), so the
  registry generates no semantic mutant of the program's behavior — a `statement-removal` of the
  whole constant only breaks compilation, which is detection by type error, not a score. Its guard
  is the live behavioral suite (AC-1–AC-4), which is deliberately NOT the enrolled suite so the
  per-mutant gate cost stays flat. Round-1 diff briefs carry this citation on the
  `GUARD SURFACE:` line as `CANNOT-EXPRESS: no string-literal operator,
  tests/mutation/source/operators.ts:17-24; live-suite guard per spec §8`.

Gate growth: one mocked-suite surface, the same marginal cost the heavy-reap arc accepted in its
§10 — this arc makes `BL-MUTATION-HARNESS-WALLCLOCK-CEILING` marginally worse and does not fix it;
bounding that growth stays the sibling entry's scope. Scoring runs FOREGROUND, scoped by the
temporary-shard technique (filter `GUARD_SURFACES` before `registerSurfaceCases`, then delete the
shard file — `_metaSourceShardIntegrity` pins shard files byte-for-byte); `-t` name filters do NOT
scope the gate (`tests/mutation/source/surfaceCases.ts:18-21`).

---

## 9. Peers and class-sweep disposition

The sweep for this shape (`execFileSync`/`spawnSync` on harness children without a lifetime bound)
covers `tests/mutation/**`:

### 9.1 Filed: `tests/mutation/browser/runner.ts`

`runChild` uses `execFileSync` with no `timeout` and no process group
(`tests/mutation/browser/runner.ts:152`); its infra discrimination is already correct
(`exitStatus = typeof err.status === "number" ? err.status : null`, then a typed infra path).
Same defect shape, different surface: each child is a full Playwright run whose LEGITIMATE wall
clock is minutes, so `MUTANT_TIMEOUT_MS` (180 s) does not transfer and the ceiling needs its own
derivation against measured browser-gate runs. **Class-sweep exception (c):** the repair needs a
ceiling derivation and touches a gate this PR does not otherwise touch. Filed as
`BL-MUTATION-BROWSER-CHILD-LIFETIME` (ledger row added by this arc's PR), reachability PROBED by
citation: the spawn site carries neither bound, and P-T1's kernel facts apply to any spawned tree.

### 9.2 Repaired here

Components 1–4 of the backlog entry (§1.3), all in `tests/mutation/source/**` — the watchdog, the
kept-and-composed group, the `childRun` bounds, the stale comment.

---

## 10. Interaction with the heavy-reap arc

One direction only: this arc edits the PRODUCER; the backstop is untouched
(`scripts/heavy-reap.ts`, `lib/heavyReap/**`, `package.json`'s `heavy` script all unchanged). The
backstop's report remains the surfaced signal for every residue row this design accepts (L-2,
L-5, L-6). The P-T1 finding — that the backstop cannot see a post-`setpgrp` parent-death tree —
is recorded HERE and closed HERE by prevention; it does not reopen any heavy-reap §1.1 row,
because that spec's fence ("prevention is filed, not shipped", its §11) is exactly what this arc
ships.

---

## 11. Out of scope

- Any edit to `scripts/with-heavy-slot.py`, `scripts/heavy-reap.ts`, `lib/heavyReap/**`, or the
  heavy-reap accept-set (§1.1 row 8).
- `tests/mutation/browser/**` (§9.1 — filed, not fixed).
- Sharding or bounding the nightly mutation job (`BL-MUTATION-HARNESS-WALLCLOCK-CEILING`).
- Any daemon, launchd agent, or resident process; the watchdog lives and dies with its own child.
- CI workflow changes. The wrapper behaves identically on Linux (`WNOHANG == 1`, probed on macOS;
  the plan's suite asserts via the `POSIX` import, not the literal).
