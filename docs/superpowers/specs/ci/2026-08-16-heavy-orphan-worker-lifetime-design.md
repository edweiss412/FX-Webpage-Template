# Heavy-phase orphan worker lifetime — design

**Backlog entry:** `BL-HEAVY-ORPHAN-WORKER-LIFETIME` (BACKLOG.md, filed 2026-08-16, `Reachability: PROBED`).
**Branch:** `chore/heavy-orphan-reaper`. **Date:** 2026-08-16.
**Sibling entry, same surface:** `BL-MUTATION-HARNESS-WALLCLOCK-CEILING` — see §10.

`pnpm heavy` bounds how many heavy phases may START. Nothing bounds how long a worker may LIVE
once the harness that owns it is gone. This spec adds the missing bound.

---

## 1. Problem

### 1.1 The measured incident

2026-08-16 08:03 CDT, recorded in the backlog entry and not re-derived here: eleven orphaned
`mutantOverlay` vitest workers at 80-83 % CPU each, ages 20 h to 1 d 5.5 h, most `ppid=1`,
rss 2-4 MB. `uptime` read `196.58 / 151.95 / 120.73` on an 18 GB machine; rss 14.86 GB,
`Pages free: 4015`, compressor 1.82 M pages stored. That is the documented precondition for the
2026-08-10 jetsam hard reset the semaphore was built after (12 `vm-compressor-space-shortage`
events, ~2 h lost across nine live arcs). Killing everything ≥ 12 h old took `sum %cpu`
1138 → 812 and rss → 12.6 GB with no live arc affected.

Census command:

```
ps -eo pid,ppid,etime,%cpu,rss,command | grep -E "mutantOverlay|experimental-import-meta-resolve" | grep -v grep
```

### 1.2 Why the semaphore structurally cannot see it

`scripts/with-heavy-slot.py` takes a flock'd slot and then `os.execvp`s
(`scripts/with-heavy-slot.py:679`, `scripts/with-heavy-slot.py:686`, `scripts/with-heavy-slot.py:724`), so the wrapper process BECOMES the heavy
command. The lock rides through `exec` on an inheritable fd and the kernel releases it when the
last holder of that fd exits — which is why a crash, SIGKILL included, releases the slot with
zero cleanup code (module docstring, `scripts/with-heavy-slot.py:15-21`).

That property is correct and this spec does not touch it. Its consequence is the defect: an
orphaned worker's slot was released correctly, hours earlier, at the death of its wrapper. The
orphan then runs entirely outside the accounting. The semaphore reports a healthy 2-of-2 while
nine cores are consumed by processes it does not know exist, so neither raising nor lowering
`slots` changes anything.

### 1.3 Probes run for this spec

All four ran on this machine on 2026-08-16. They are the evidence for §4's predicate; none is
re-derived from the incident.

**P1 — orphaning is unconditional.** A child spawned by a parent that is then SIGKILLed survives
and reparents to `ppid=1`. True both for a plain child and for one launched through
`perl -e 'setpgrp; exec @ARGV'`:

```
plain:   child 62632 SURVIVED parent SIGKILL, ppid now 1
setpgrp: child 62994 SURVIVED parent SIGKILL, ppid now 1
```

**P2 — `setpgrp` makes a child immune to the group-directed signal that ordinarily reaps it.**
With the harness itself in its own process group and killed by `kill -9 -<pgid>`:

```
plain:   harness_pgid=78464 child_pgid=78464 cmd='sleep 120' -> died with the group
grp:     harness_pgid=78818 child_pgid=78820 cmd='sleep 120' -> SURVIVED group kill, ppid=1
```

A group-directed signal is what an ordinary terminal or session teardown delivers. This is the
mechanism behind the peer filed in §11.1; it is NOT repaired here.

**P3 — an orphan that was idle stays cheap but never exits.** A vitest fork worker orphaned
during an idle `await` survived past the 20 s sample at `0.0 %` CPU, rss 42 MB → 35 MB.

**P4 — an orphan that was mid-work keeps burning a core.** The same worker orphaned during a
CPU-bound test body, sampled every 6 s after its parent vitest process was SIGKILLed:

```
t+6s  78770 1  96.2 54256 00:27
t+12s 78770 1  99.4 54240 00:33
t+18s 78770 1  98.6 54240 00:39
t+24s 78770 1 100.0 54240 00:45
t+30s 78770 1  99.1 54336 00:51
```

**What P3 and P4 together establish, and it is narrower than the entry's phrasing:** survival is
unconditional, cost is workload-dependent. An orphan does not spin because it is orphaned; it
keeps doing whatever it was doing, forever, because nothing will ever tell it to stop. The
incident's eleven were mid-suite, so they burned. An orphan caught idle is invisible rather than
harmless — it still accumulates, and it will still be resident when the next one arrives.

**Why no liveness or CPU gate can be the discriminator.** P4's orphan is indistinguishable from
healthy work by CPU, and P3's is indistinguishable from a blocked-but-live worker by idleness.
This is not a hypothetical concern about proxies: the machine-local hook ~/.claude/hooks/reap-idle-codex.sh used a
log-freshness proxy that did not watch the path its target actually wrote, and killed 379 of 651
Codex sessions (58 %) over six days
(`docs/agents/codex-silent-death-2026-07-24.md` §1, §8). §4 therefore discriminates on process
ancestry and slot membership — kernel facts and this repo's own recorded state — and never on an
activity signal.

---

## 1.1 Resolved scope — do not relitigate

Each row is settled. Re-opening one needs new evidence, not a re-reading.

| Decision | Ratification |
| --- | --- |
| The wrapper keeps `execvp`. Making it fork-and-supervise to kill its group on death is REJECTED (§3, approach C) — it destroys the zero-cleanup slot release (`scripts/with-heavy-slot.py:15-21`) and the exit-status transparency, and the supervisor is itself killable, moving the orphan problem up one level rather than closing it. | §3 |
| Slot state is never edited by hand and capacity changes go only through `--recreate`; `FX_HEAVY_SLOT_DIR` is never set in a production session. This design reads slot files and writes none. | AGENTS.md heavy-phase section |
| The reaper never uses an activity, CPU, or log-freshness proxy as its liveness signal. | §1.3, `docs/agents/codex-silent-death-2026-07-24.md` §1 |
| `tests/mutation/source/runner.ts` is NOT edited by this arc. Its per-mutant ceiling (`MUTANT_TIMEOUT_MS`, `tests/mutation/source/runner.ts:49`) and its group reap (`GROUP_LEADER_ARGV`, `tests/mutation/source/runner.ts:146`) are correct for the hazard they address — a mutant that will not terminate while the harness is alive — and both landed 2026-08-15 after review. They do not address parent death, which is a different hazard; see §3 approach B and §11.1. | §3, §11 |
| The default ceiling is a MARGIN, not the mechanism. Exemptions (b) and (c) in §4.2 carry the safety; a legitimate heavy phase is exempt on structure regardless of age. | §4.3 |
| Reaping is a local-machine concern only. Nothing here runs in CI, and no CI job is added. | §6 |

---

## 2. Goal and non-goals

**Goal.** No heavy-phase worker process on this machine outlives the harness that owns it by more
than a bounded interval, and no legitimately running heavy phase is ever killed.

**Non-goals.**

- Bounding the wall clock of a heavy phase that IS legitimately running. That is
  `BL-MUTATION-HARNESS-WALLCLOCK-CEILING`; §10 states how the two interact.
- Preventing orphaning at the producer. §3 approach B and §11.2 explain why prevention is filed
  rather than shipped.
- Reaping non-heavy orphans (Codex trees, MCP fleets). ~/.claude/hooks/reap-idle-codex.sh
  already owns that class and this design does not overlap it — see §7 limit L-4.
- Any change to admission control, slot counts, or the wrapper's exec model.

---

## 3. Approaches considered

**A — max-lifetime orphan reaper (CHOSEN).** A classifier over the live process table plus the
semaphore's own slot files decides which processes are orphaned heavy workers, and a thin adapter
kills them. Mirrors what a human ran by hand during the incident, with a far narrower predicate.

*Why:* it is the only candidate that covers orphans from EVERY producer — vitest, playwright,
`next build` — rather than one. It reads state it does not own and writes none, so it cannot
regress the semaphore. Its decision function is pure and total over a parsed process table, which
makes it enrollable in the source-mutation registry (§9) — the convergence criterion is then a
mutation score rather than an open argument about inputs. And it degrades safely: with no match
it does nothing, which is also its behavior when this machine is healthy.

*Cost:* it is a backstop, so an orphan still burns until the ceiling elapses. Accepted — §4.2's
exemptions make the ceiling the only knob that can misfire, and it misfires toward inaction.

**B — hard child deadline / parent-death watchdog in the mutation runner.** The runner already
bounds a child's run while the parent lives (`MUTANT_TIMEOUT_MS`, `tests/mutation/source/runner.ts:49`),
enforced by spawnSync's timeout (`tests/mutation/source/runner.ts:176`) with a SIGKILL kill-signal (`tests/mutation/source/runner.ts:180`). That
enforcement is implemented IN THE PARENT, so parent death removes it entirely — which is exactly
the incident's shape. A watchdog inside the child (poll `getppid() === 1`, exit) would close it;
macOS has no `prctl(PDEATHSIG)` equivalent, so polling is the only form available.

*Rejected as this arc's mechanism* because it covers one producer. All eleven of the incident's
orphans were `mutantOverlay` children, so it would have covered that occurrence — and would not
have covered a killed `pnpm test:e2e` or `pnpm build`, which are equally wrappable and equally
orphanable. It also requires editing a surface that converged through review on 2026-08-15.
Filed as a peer with a named class-sweep exception in §11.2.

**C — process-group kill on wrapper death.** REJECTED. The wrapper `execvp`s
(`scripts/with-heavy-slot.py:724`), so it has no post-command code path in which to kill anything.
Giving it one means fork-and-wait, which forfeits the zero-cleanup slot release and the
transparent exit status that are ratified properties of that script
(`scripts/with-heavy-slot.py:15-21`), and leaves a supervisor process that can itself be
SIGKILLed — reproducing the orphan problem one level up with more machinery.

---

## 4. Design

### 4.1 Shape

Three units, each independently testable:

| Unit | Responsibility | Depends on |
| --- | --- | --- |
| lib/heavyReap/classify.ts (new) | PURE decision function: given parsed process rows, the live slot-holder pids, a clock reading and a config, return the processes to reap and the reason for each. No I/O. | nothing |
| lib/heavyReap/collect.ts (new) | Read the world: run `ps`, parse it into rows; read `/tmp/fx-heavy-slots/slot-*` into holder pids. | node `child_process`, `fs` |
| scripts/heavy-reap.ts (new) | Adapter: collect → classify → report or kill. Flags, exit status, output. | both above |

The split is the point. classify.ts is where every rule lives and it never touches the machine,
so its whole behavior is reachable from a unit test with a literal table — which is what makes §9
possible. collect.ts holds the parsing that cannot be reasoned about without real `ps` output
and is covered by fixtures captured from this machine plus one live smoke.

### 4.2 The predicate

A process is REAPABLE iff every clause holds. Stated as an ACCEPT-set keyed on structure, never
on spelling; anything not accepted is left alone and, under `--report`, named.

**(a) Declared worker shape.** Its command contains one of a closed, in-repo set of worker
entrypoint paths. Verified present in this checkout:

| Producer | Entrypoint substring |
| --- | --- |
| vitest fork pool | vitest/dist/workers/forks.js |
| vitest thread pool | vitest/dist/workers/threads.js |
| vitest VM pools | vitest/dist/workers/vmForks.js, vitest/dist/workers/vmThreads.js |
| vitest VM runner | vitest/dist/workers/runVmTests.js |
| playwright worker | playwright/lib/worker/workerMain.js |
| next build worker | next/dist/compiled/jest-worker/processChild.js |

The set is a registry constant, not a regex over `node`. A bare `node` or `vitest` match would
sweep in live sibling worktrees — the failure this repo's own bash-guard.sh hook exists to stop, and
which an unscoped `pkill -f vitest` caused on 2026-07-24.

**(b) Orphaned.** `ppid == 1`. Deliberately the strict form rather than a walk for a dead-ancestor inference: on macOS a reparented process is the only shape the kernel guarantees, and any richer
ancestry inference is a proxy of the kind §1.3 rules out. A worker whose parent is alive is never
touched, whatever its age.

**(c) Unslotted.** Neither the process itself nor any of its ancestors is a pid recorded in a
live `/tmp/fx-heavy-slots/slot-*` metadata file. The wrapper `execvp`s, so the recorded `pid`
(`scripts/with-heavy-slot.py:230`) IS the running heavy command, and its workers are its
descendants. A holder pid is "live" only if that pid currently exists; a stale metadata line from
a crashed holder exempts nothing.

Clause (c) is what makes this safe rather than merely careful: every heavy phase run the way
AGENTS.md requires is exempt on structure, at any age, forever.

**(d) Aged.** `etime >= FX_REAP_MIN_AGE_S`, default `14400` (4 h).

**(e) Not self.** Never the reaper's own process, nor any ancestor of it. A reaper that can kill
its own session is a worse outage than the leak.

Kill is SIGKILL to the process AND its descendant subtree — a vitest worker can own children
(the mutation runner's own child is one, `tests/mutation/source/runner.ts:183`), and reaping the
parent alone re-orphans them.

### 4.3 Why 4 h, and what the number is actually for

Clauses (b) and (c) already exempt every legitimate heavy phase:

| How a heavy phase is run | Exempt by |
| --- | --- |
| Under `pnpm heavy`, as AGENTS.md requires | (c) — its worker descends from a live slot holder |
| Unwrapped but attended (a shell, a session) | (b) — its parent is alive |
| Unwrapped AND detached (`nohup`, `disown`) | (d) only |

So the ceiling binds exactly one case: a heavy phase run in double violation of the wrapping
convention AND detached from any session. The number is a margin on that case, not the mechanism.

Measured longest legitimate heavy phases, for the derivation:

| Run | Wall clock |
| --- | --- |
| Nightly `--project mutation`, 2026-08-11 → 08-16 (six scheduled runs) | 123 m 58 s, 127 m 51 s, 126 m 47 s, 133 m 16 s, 137 m 58 s, **169 m 39 s** |
| `guardSurfaces.gate.test.ts` alone, 2026-08-15 nightly | 89 374 ms |
| Local `pnpm mutation:guards` holding slot-0, observed 2026-08-16 12:57:21Z → 13:29Z | ≥ 31 minutes, still running |

`14400` s is 1.41 × the longest measured legitimate heavy phase (169 m 39 s, the 2026-08-16
nightly — which failed on a ledger drift, not on its 300-minute `timeout-minutes`). The hand-run
during the incident used ≥ 12 h, but that was a BARE age filter over a command pattern with no
ancestry or slot clause; a predicate carrying (a)-(c) is safe at a materially lower ceiling.
Overridable via `FX_REAP_MIN_AGE_S` for a genuine outlier.

Note the clock the ceiling reads is process age, which for a `pnpm heavy` invocation includes
time spent WAITING in the semaphore queue — unbounded by design under contention. That does not
weaken (d), because a waiting wrapper has a live session parent and is exempt under (b) long
before age matters.

### 4.4 Guard conditions — every input at its degenerate value

| Input | Degenerate value | Behavior |
| --- | --- | --- |
| process rows | empty | reap nothing, exit 0 |
| slot dir | missing / empty / unreadable | NO exemptions available → treat as "no live holders"; still safe because (a), (b), (d) all still apply, and report that the dir was unreadable |
| slot metadata line | torn, empty, non-JSON, no `pid` key | that slot contributes no exemption, and the condition is named in the report — never silently dropped, mirroring `describe_holder`'s posture (`scripts/with-heavy-slot.py:263-267`) |
| slot holder pid | recorded but no longer exists | not a live holder; contributes no exemption |
| `etime` | unparseable | NOT reapable (fail closed toward inaction) |
| `ppid` | absent / unparseable | NOT reapable |
| `FX_REAP_MIN_AGE_S` | unset / non-numeric / negative / zero | fall back to the 14400 default and say so; a zero or negative ceiling is never honored |
| a matched process that exits between classify and kill | `kill` raises ESRCH | tolerated, counted as already-gone, never an error |

The consistent direction is that every unreadable or ambiguous input makes a process LESS
reapable, never more.

---

## 5. Interfaces

```ts
// lib/heavyReap/classify.ts
export type ProcRow = { pid: number; ppid: number; etimeSeconds: number; command: string };
export type ReapConfig = { minAgeSeconds: number; selfPid: number; selfAncestry: readonly number[] };
export type Skip = "not-a-worker" | "has-live-parent" | "slot-descendant" | "too-young" | "self";
export type Decision =
  | { pid: number; reap: true; shape: string; ageSeconds: number }
  | { pid: number; reap: false; because: Skip };

export function classify(
  rows: readonly ProcRow[],
  liveSlotHolderPids: readonly number[],
  config: ReapConfig,
): Decision[];
```

`classify` returns a decision for EVERY row, not only the reapable ones. A function that returned
just the kills could not be tested for the far more important property — that it declines — and
`--report` would have nothing to print.

---

## 6. Wiring and durability posture

- **On demand:** `pnpm heavy:reap` (report) and `pnpm heavy:reap --kill`. Default is REPORT, so
  running it can never be the destructive act; `--kill` is explicit.
- **Automatic:** a `Stop`-hook line in the per-machine `~/.claude/` tree, exactly as
  reap-idle-codex.sh is wired. This spec does NOT install it; the plan's final task documents
  the one-liner in AGENTS.md the way the codex-guard shim install is documented.
- The classifier and the CLI live IN THIS REPO deliberately. `docs/agents/codex-silent-death-2026-07-24.md` §8
  records the cost of the alternative: that the codex reaper's fix is per-machine config outside this
  repo, so any other machine or checkout needs the same edits applied by hand. Keeping the decision
  logic tracked means it is reviewable, testable, mutation-scored, and identical in every
  checkout; only the trigger stays machine-local.
- Not wrapped in `pnpm heavy`: the CLI is one `ps` invocation and a directory read.

---

## 7. Documented limits

Each is a limit, not a defect: the worst case is that a process is NOT reaped and the report says
why. Per the finding-admissibility contract, a hypothetical whose worst case is inaction plus a
surfaced signal files here rather than as a review round.

- **L-1 — a producer outside the declared set is not reaped.** The accept-set in §4.2(a) is
  closed by construction. A new worker entrypoint (a vitest pool rename, a playwright major) is
  invisible until its row is added. Mitigated by `--report --all`, which names every `ppid == 1`
  process it declined and why, so an unrecognised producer is discoverable rather than silent.
- **L-2 — an orphan younger than the ceiling burns until the ceiling.** By construction; §4.3.
- **L-3 — an unwrapped, detached, legitimately long heavy phase past 4 h is reapable.** The one
  false-positive window. Two convention violations are required to reach it, and
  `FX_REAP_MIN_AGE_S` covers the genuine outlier.
- **L-4 — Codex trees and MCP fleets are out of scope.** reap-idle-codex.sh owns them. The
  accept-set contains no Codex entrypoint, so the two cannot both claim a process.
- **L-5 — `ps` is a sample, not a transaction.** Ancestry can change between the read and the
  kill. Bounded by §4.4's ESRCH tolerance and by the fact that every race resolves toward a
  process having already exited.
- **L-6 — adversarial process manipulation is out of scope.** A process that renames its own argv
  to impersonate an exempt shape, or reparents itself to dodge (b), defeats this. The threat model
  is ordinary orphaning by killed sessions and crashed harnesses.

---

## 8. Acceptance criteria

- **AC-1** — A process matching a declared worker shape, with `ppid == 1`, no live slot-holder
  ancestor, and age ≥ the ceiling is classified reapable.
- **AC-2** — **A legitimately running heavy phase is never reapable.** Proven three ways, one per
  row of §4.3's table: a worker descending from a live slot holder is exempt at any age; a worker
  with a live parent is exempt at any age; a worker below the ceiling is exempt. This is the
  criterion the backlog entry requires be stated with the measured ceiling behind it, and §4.3
  carries the measurement.
- **AC-3** — Every degenerate input in §4.4 resolves toward NOT reaping, and the reason is
  reported.
- **AC-4** — The reaper never targets its own process or any ancestor of it.
- **AC-5** — Killing removes the whole descendant subtree of a reaped process.
- **AC-6** — Default invocation reports and kills nothing; killing requires `--kill`.
- **AC-7** — lib/heavyReap/classify.ts is enrolled in `tests/mutation/source/registry.ts` with a
  declared `scoreFloor`, a row in `EXPECTED_LEDGER_KINDS`
  (`tests/mutation/guardSurfaces.gate.test.ts`), and no unaccepted survivor.
- **AC-8** — A live smoke asserts collect.ts parses this machine's real `ps` output into rows
  whose pid/ppid/age agree with a direct `ps -o` read for a process the test itself spawns.

---

## 9. Mutation enrolment — the convergence criterion

classify.ts is a pure classifier over a finite input record: exactly the surface the
source-mutation registry expresses. Per AGENTS.md convergence bullet 4, **enrolment precedes the
first review dispatch**, and the round-1 brief states the mutation score plus the unaccepted-survivor
set. This is why §4.1 puts the rules in an importable module with a referring suite rather than in
the CLI script — a terminal script is not overlay-able, and the classname-equivalence arc measured
the cost of discovering that late (fifty false-pass findings across fourteen diff rounds).

Convergence criterion for every review dispatch on this arc:

- **Consequence bound:** every process is either correctly classified or declined-with-a-reason;
  never silently killed. A decline is a DOCUMENTED LIMIT (§7), not a finding.
- **`PROBE DOMAIN:`** the live process table on this machine, plus `tests/mutation/**`, plus the
  captured `ps` fixtures the plan adds. A probe outside that domain files to §7.
- **Threat fence:** ordinary orphaning by killed sessions and crashed harnesses. Adversarial
  process manipulation is out of scope (L-6).
- **Score:** the mutation score on classify.ts with an empty unaccepted-survivor set. A finding of the form the-guard-does-not-pin-what-it-claims is admissible only with a surviving mutant from the
  declared operator set.

## 9.1 Meta-test inventory

CREATES none. EXTENDS `tests/mutation/source/registry.ts` (one `GUARD_SURFACES` row) and
`tests/mutation/guardSurfaces.gate.test.ts` (one `EXPECTED_LEDGER_KINDS` row — a new surface fails
by default until it declares its counts). No Supabase call boundary, no advisory lock, no admin
mutation surface, no `admin_alerts` row, no UI surface: `impeccable-gate: N/A — no UI surface`.

---

## 10. Interaction with `BL-MUTATION-HARNESS-WALLCLOCK-CEILING`

Same surface, opposite failure modes, and they must not be confused:

| | This entry | `BL-MUTATION-HARNESS-WALLCLOCK-CEILING` |
| --- | --- | --- |
| Failure | a process that never stops, with no owner | a job that legitimately runs too long, with an owner |
| Where | this machine | the nightly CI job |
| Fix direction | bound lifetime from outside | bound growth from inside (sharding) |

They interact in exactly one place, and it cuts against this arc: enrolling classify.ts (§9)
adds one surface to `guardSurfaces.gate.test.ts`, which `describe.each`es every row of
`GUARD_SURFACES` (`tests/mutation/guardSurfaces.gate.test.ts:158`). That file is named in the
mutation-harness workflow header as the reason the nightly grew — 138 min on 2026-08-15, 170 min
on 2026-08-16 against a 300-minute ceiling
(`.github/workflows/mutation-harness.yml`, `timeout-minutes: 300` and its comment). **This arc
therefore makes the sibling entry marginally worse and does not fix it.** That is accepted: the
enrolment is required by AGENTS.md for a guard surface, the growth is one surface, and bounding
that growth is the sibling entry's scope, not this one's.

Neither entry's fix substitutes for the other. A ceiling on the nightly would not have touched the
eleven local orphans; this reaper does not shorten a single legitimate nightly run.

---

## 11. Peers filed rather than fixed

Per the class-sweep disposition rule, the default is repair-in-PR and each deferral names its
exception.

### 11.1 `setpgrp` makes the mutation child immune to session teardown — exception (c)

`GROUP_LEADER_ARGV` (`tests/mutation/source/runner.ts:146`) puts each mutation child in its own
process group so the parent can reap a grandchild that outlived it. P2 (§1.3) shows the cost: a
same-group child dies on a group-directed kill and a `setpgrp`'d one survives it and reparents to
init. The 2026-08-15 change therefore traded a child that dies with its session for a parent that can
reap a hung grandchild — a real improvement on the hazard it targeted and a regression on this one.

Exception **(c)**: the repair is a redesign of a surface this PR does not otherwise touch, and one
that converged through review on 2026-08-15. Reaching for it here would relitigate a settled
decision with the same rounds it already cost. Approach A covers the CONSEQUENCE — such a child is
exactly a §4.2 reapable — so the peer is about prevention, not exposure.

**Timeline note, so the peer is not misread as the incident's cause:** both 2026-08-15 commits
merged to `main` at 13:58:50 CDT (`d18e9b4d5`, `35d5c0e58`). Every orphan in the 08-16 census
started between 02:33 and 12:03 on 08-15 — all BEFORE that merge. The incident is not attributable
to them, and P2 is a forward-looking finding, not a post-mortem one.

### 11.2 The mutation child has no parent-death watchdog — exception (c)

§3 approach B. Same surface and same exception as §11.1, and the two should be scheduled together:
a `getppid() === 1` watchdog inside the child is the natural place to also stop relying on the
process group.

### 11.3 `childRun.ts` bounds nothing — exception (c)

`childRun` (`tests/mutation/source/childRun.ts:18`) runs `execFileSync` with no `timeout` and no
process group, unlike its sibling `runSuite` which has both
(`tests/mutation/source/runner.ts:176`, `tests/mutation/source/runner.ts:180`, `tests/mutation/source/runner.ts:183`). The two were explicitly repaired
together for stdio (`tests/mutation/source/childRun.ts:20-23`) but not for lifetime. Same surface,
same exception.

### 11.4 A stale reference to a function that does not exist — filed, not fixed

`tests/mutation/source/runner.test.ts:37` names `reapOrphans`; no such symbol exists anywhere in
the tree (`rg reapOrphans` returns that one comment). A comment, so it changes no behavior, but it
misdescribes the mechanism a future reader is trying to understand. Same surface, exception (c).

---

## 12. Out of scope

- Any change to `scripts/with-heavy-slot.py`.
- Any change to `tests/mutation/source/runner.ts` or `childRun.ts` (§11).
- Installing the `Stop` hook. The plan documents the wiring; installing per-machine config is not
  a tracked-repo action.
- Sharding or otherwise bounding the nightly mutation job (§10).
- A daemon, a launchd agent, or any always-resident process. The reaper is invoked, does its work,
  and exits.
