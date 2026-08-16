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
process shape and parent liveness — kernel facts, read from one process-table sample — and never
on an activity signal.

---

## 1.1 Resolved scope — do not relitigate

Each row is settled. Re-opening one needs new evidence, not a re-reading.

| Decision | Ratification |
| --- | --- |
| The wrapper keeps `execvp`. Making it fork-and-supervise to kill its group on death is REJECTED (§3, approach C) — it destroys the zero-cleanup slot release (`scripts/with-heavy-slot.py:15-21`) and the exit-status transparency, and the supervisor is itself killable, moving the orphan problem up one level rather than closing it. | §3 |
| The reaper does not read the semaphore's state at all. The slot-membership clause every draft through round 10 carried was found UNREACHABLE while writing the plan, and removing it took the slot survey with it. | §4.2, §5 |
| The reaper never uses an activity, CPU, or log-freshness proxy as its liveness signal. | §1.3, `docs/agents/codex-silent-death-2026-07-24.md` §1 |
| `tests/mutation/source/runner.ts` is NOT edited by this arc. Its per-mutant ceiling (`MUTANT_TIMEOUT_MS`, `tests/mutation/source/runner.ts:49`) and its group reap (`GROUP_LEADER_ARGV`, `tests/mutation/source/runner.ts:146`) are correct for the hazard they address — a mutant that will not terminate while the harness is alive — and both landed 2026-08-15 after review. They do not address parent death, which is a different hazard; see §3 approach B and §11.1. | §3, §11 |
| The default ceiling is a MARGIN, not the mechanism. Clauses (a) and (b) in §4.2 carry the safety, and every process in a live heavy phase is exempt under one of them regardless of age. The residue is a worker orphaned while its phase runs on, which is limit L-7 and is deliberate rather than a gap. | §4.3, §7 L-7, §8 |
| The reaper is INVOKED, never resident. The bound is therefore the ceiling plus the interval to the next trigger (§6.1), stated as limit L-2. A daemon or launchd agent is out of scope. | §6.1, §7 L-2, §12 |
| Trigger 1 lives in `package.json`'s `heavy` script and fails open by construction, so `scripts/with-heavy-slot.py` stays unedited and admission is never blocked by the reaper. | §6.1, §12 |
| Clause (a) matches on argv STRUCTURE — node as `argv[0]` plus a last-token path suffix — never on containment. Containment was measured producing a live false positive and is not coming back. | §4.2(a) |
| An exemption clause that cannot be EVALUATED stops the whole run. "Proceed with fewer exemptions" is rejected: it concludes a process is unexempt from a failure to check. | §4.4, §8 AC-3b |
| The subtree kill is best-effort over the RECORDED set and the reaper is idempotent-and-repeated, not transactional. What that costs is K5. | §4.4, §7 L-5, §8 AC-5 |
| Every §4.4 condition has an ID, and §6.2 and §8 CITE those IDs instead of paraphrasing the behavior. Three rounds found a summary sentence contradicting its own table; single-sourcing each behavior is the defense that closes the class, and re-introducing a paraphrase re-opens it. | §4.4 preamble, §6.2, §8 |
| Target identity is (pid, start time, command). `etime` is excluded because it increases by definition; `ppid` is excluded because this run's own kills change it. Kill order is root-first for the same reason. | §4.4 K2, §8 AC-5b |
| Reaping is a local-machine concern only. Nothing here runs in CI, and no CI job is added. | §6 |

---

## 2. Goal and non-goals

**Goal.** Bound how long a heavy-phase worker outlives the harness that owns it, without ever
reaping a heavy phase that is STRUCTURALLY IDENTIFIABLE as live.

Both halves are deliberately narrower than the obvious phrasing, because the obvious phrasing is
not true of any invoked reaper and pretending otherwise cost this spec its first review round:

- **"Bound" means bounded by the ceiling plus the interval to the next trigger**, not by the
  ceiling alone. A reaper that is invoked cannot act at an instant nobody invokes it. §6 defines
  the trigger set that makes the second term small and states its residue as limit L-2.
- **"Structurally identifiable as live" means exempt by clause (a) or (b) of §4.2** — not
  worker-shaped, or having a live parent — both properties of the process tree rather than
  functions of age. The one process in a live heavy phase that is neither is a worker whose own
  parent has died; §4.3's table and limit L-7 state exactly what happens to it.

**Non-goals.**

- Bounding the wall clock of a heavy phase that IS legitimately running. That is
  `BL-MUTATION-HARNESS-WALLCLOCK-CEILING`; §10 states how the two interact.
- Preventing orphaning at the producer. §3 approach B and §11.2 explain why prevention is filed
  rather than shipped.
- Reaping non-heavy orphans (Codex trees, MCP fleets). ~/.claude/hooks/reap-idle-codex.sh
  already owns that class and this design does not overlap it — see §7 limit L-4.
- Any change to `scripts/with-heavy-slot.py` itself: no change to admission control, slot counts,
  or the wrapper's exec model. §6's pre-admission trigger is a `package.json` script edit and
  leaves that file untouched.

---

## 3. Approaches considered

**A — max-lifetime orphan reaper (CHOSEN).** A classifier over the live process table plus the
process tree decides which processes are orphaned heavy workers, and a thin adapter
kills them. Mirrors what a human ran by hand during the incident, with a far narrower predicate.

*Why:* it is the only candidate that covers orphans from EVERY producer — vitest, playwright,
`next build` — rather than one. It reads state it does not own and writes none, so it cannot
regress the semaphore. Its decision function is pure and total over a parsed process table, which
makes it enrollable in the source-mutation registry (§9) — the convergence criterion is then a
mutation score rather than an open argument about inputs. And it degrades safely: with no match
it does nothing, which is also its behavior when this machine is healthy.

*Cost:* it is a backstop, so an orphan burns until the ceiling elapses AND a trigger fires — the
full bound stated in §6.1 and limit L-2, not the ceiling alone. Accepted. The exemptions in §4.2
mean the ceiling is the only knob whose MISCONFIGURATION can cost anything, and what it costs is
bounded by L-7: a ceiling set too low reaches a worker orphaned while its phase runs on sooner.
It is not true that the ceiling can only misfire toward inaction, and an earlier draft of this
paragraph said so.

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
| lib/heavyReap/classify.ts (new) | PURE decision function: given process rows (parsable and not) and a config, return a decision for EVERY row plus the config notes the reporter needs. No I/O, and no clock — `etime` is already elapsed. | nothing |
| lib/heavyReap/collect.ts (new) | Read the world: run `ps` and parse it into rows. Distinguishes its own failure from an empty table (C1 vs C2). | node `child_process` |
| scripts/heavy-reap.ts (new) | Adapter: collect → classify → report or kill. Owns the flag set and the exit status, both defined in §6.2. | both above |

The split is the point. classify.ts is where every rule lives and it never touches the machine,
so its whole behavior is reachable from a unit test with a literal table — which is what makes §9
possible. collect.ts holds the parsing that cannot be reasoned about without real `ps` output
and is covered by fixtures captured from this machine plus one live smoke.

### 4.2 The predicate

A process is REAPABLE iff every clause holds. Stated as an ACCEPT-set keyed on structure, never
on spelling; anything not accepted is left alone and named in the report, on the terms §6.2
defines once for the whole document.

**(a) Declared worker shape.** BOTH of the following, on the command's argv tokens:

1. `basename(argv[0]) === "node"` — the process is a node runtime, not some other program;
2. the LAST argv token, compared as a whole token, ends with one of a closed, in-repo set of
   worker entrypoint paths.

**Containment is deliberately NOT the test, and round 2 measured why.** A rule of the form "the
command CONTAINS an entrypoint path" is keyed on spelling: `tail -f .../vitest/dist/workers/forks.js`
carries the substring as an ARGUMENT and would be reaped as a worker. That is not adversarial and
is not covered by L-6 — an ordinary `tail`, `grep`, `cat` or editor invocation reaches it.

Probed over this machine's live process table, 679 rows, 2026-08-16 14:05Z:

| Rule | Matches | Of which false positives |
| --- | --- | --- |
| containment | 14 | 1 — a `zsh -c …` wrapper whose 109-token command text mentions the path |
| the two clauses above | 13 | 0 |

The two rules differ on exactly one live row, and that row is a false positive of the containment
rule rather than a worker the structural rule misses. Four constructed counterexamples from the
reviewer's class (`tail -f`, `grep -n`, `/bin/cat`, `vim`, each given a real entrypoint path) are
accepted by containment and rejected by the structural rule. All thirteen real workers alive at
probe time satisfy both clauses: argv[0] was the node binary and the entrypoint was the final
token in every case.

Entrypoints verified present in this checkout:

| Producer | Entrypoint path suffix |
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

**There is deliberately NO slot-membership clause, and this is the design's sharpest correction.**
Every draft through review round 10 carried one — "neither the process nor any of its ancestors is
a pid recorded in a live slot file" — and called it the thing that made the design safe. **It is
unreachable.** Clause (b) admits only `ppid == 1`, and an ancestry walk that STARTS at init can
never reach a slot holder, so the clause could not fire for any process the predicate would
otherwise reap. It was found by executing the classifier the plan specifies rather than by reading
it: the case asserting the exemption failed, reporting `has-live-parent` where the spec expected
`slot-descendant`.

Two probes settle why no repair of it works, both run 2026-08-16:

- **Process-group membership survives reparenting**, so it looked like the fix. An orphaned
  grandchild kept `pgid=41496` — identical to its still-live root — while its `ppid` became 1.
- **But it does not link a worker to its slot holder.** Of five vitest workers alive
  machine-wide, exactly ONE shared a pgid with any live holder. The mutation runner is why: it
  puts every child in a NEW group by design (`GROUP_LEADER_ARGV`,
  `tests/mutation/source/runner.ts:146`, probed in §1.3 as P2), so the producer that generated all
  eleven orphans of the incident is precisely the one a pgid rule cannot see.

**Clause (b) alone delivers the safety the slot clause claimed to.** A live heavy phase's workers
have LIVE PARENTS — the vitest or playwright main process — so they are exempt at any age, and the
`pnpm heavy` wrapper itself is exempt under clause (a) because it is not worker-shaped. A worker
that is genuinely orphaned while its heavy phase runs on is spinning on a dead IPC channel and is
doing no work anyone is waiting for; reaping it after the ceiling is correct, not a false positive.

The consequence is a materially smaller design: no slot survey, no slot-metadata parsing, and none
of the undecidable-collection machinery that existed only to keep an unevaluable slot clause
honest. The reaper no longer reads the semaphore's state at all.

**(c) Aged.** `etime >= FX_REAP_MIN_AGE_S`, default `14400` (4 h).

**(d) Not self.** Never the reaper's own process, nor any ancestor of it. A reaper that can kill
its own session is a worse outage than the leak.

Kill is SIGKILL to the process AND its descendant subtree — a vitest worker can own children
(the mutation runner's own child is one, `tests/mutation/source/runner.ts:183`), and reaping the
parent alone re-orphans them.

### 4.3 Why 4 h, and what the number is actually for

Clause (b) exempts every heavy phase that is structurally identifiable as live, and it does so at
any age:

| Process in a live heavy phase | Exempt by | At any age? |
| --- | --- | --- |
| a vitest / playwright / next worker | (b) — its pool's main process is its live parent | yes |
| the `pnpm heavy` wrapper itself, however launched | (a) — it is `pnpm`/`python3`, not worker-shaped | yes |
| an intermediate pnpm or vitest.mjs process | (a) — same reason | yes |
| a worker whose own parent has died while the phase runs on | nothing — see below | no |

The last row is the only one the ceiling binds, and it is not a false positive: such a worker has
lost the IPC channel it reports through, is doing work nobody will collect, and is exactly what the
2026-08-16 incident was made of. Reaping it after the ceiling is the design's PURPOSE, not its
risk. **How it was launched — `pnpm heavy`, unwrapped, `FX_HEAVY_DISABLE=1`, `nohup` — makes no
difference to any row**, which is the simplification that fell out of dropping the slot clause: the
predicate reads the process tree, and the process tree does not record how a phase was started.

Measured longest legitimate heavy phases, for the derivation. CI figures are RUN-level
(`gh run list --workflow mutation-harness.yml`, `createdAt` → `updatedAt`); the workflow header's
own "138 min" for 2026-08-15 is the job-level equivalent of the 137 m 58 s row.

| Run | Wall clock |
| --- | --- |
| Nightly `--project mutation`, 2026-08-11 → 08-16 (six scheduled runs) | 123 m 58 s, 127 m 51 s, 126 m 47 s, 133 m 16 s, 137 m 58 s, **169 m 39 s** |
| `guardSurfaces.gate.test.ts` alone, 2026-08-15 nightly | 89 374 ms |
| Local `pnpm mutation:guards` holding slot-0, 2026-08-16 12:57:21Z → 13:45Z | ≥ 48 minutes, still running |

`14400` s is 1.41 × the longest measured legitimate heavy phase (169 m 39 s, the 2026-08-16
nightly — which failed on a ledger drift, not on its 300-minute `timeout-minutes`). The hand-run
during the incident used ≥ 12 h, but that was a BARE age filter over a command pattern with no
shape or orphan clause; a predicate carrying (a) and (b) is safe at a materially lower ceiling.
Overridable via `FX_REAP_MIN_AGE_S` for a genuine outlier.

Note the clock the ceiling reads is process age, which for a `pnpm heavy` invocation includes time
spent WAITING in the semaphore queue — unbounded by design under contention, and measured at 17
minutes for one local run and over 65 minutes for another on 2026-08-16. That does not weaken (c),
because a waiting wrapper is not worker-shaped and is exempt under (a) whatever its age.

### 4.4 Guard conditions — every input at its degenerate value

**The three tables below are the ONLY source for what any condition does. Every other mention
anywhere in this document CITES the ID instead of paraphrasing — and "every other mention" includes
the rows of OTHER tables (§4.1's unit table, §6.2's CLI table), the doc comments inside §5's code
blocks, §7's limits and §8's criteria. Being a table row is not what makes a statement a source;
being one of these three tables is.**

That rule is CHECKABLE, and it is checked this way rather than by re-reading — five consecutive
review rounds each found one instance in a region the previous reading had not covered (§4.4's
preamble, then a verb set built only from known paraphrases, then fenced code blocks, then a
single-line JSDoc, then another table's rows):

```
python3 - <<'EOF'
import re
lines = open("docs/superpowers/specs/ci/2026-08-16-heavy-orphan-worker-lifetime-design.md").read().split("\n")
src = {i for i, l in enumerate(lines) if re.match(r"^\| (C[1-4]|R[1-4]|K[1-6]) \|", l.strip())}
verbs = re.compile(r"exit non-zero|non-zero.exit|reap(s|ing)? (nothing|NOTHING)|exit status|exits? 0"
                   r"|unaffected|tolerated|never reaped|not reapable|stops the run|is blocked"
                   r"|kills nothing|non-destructive|failed kill|partial kill|identity-changed"
                   r"|already-gone|ESRCH|surviving pids"
                   r"|ordinary orphans|next run|empty world|recorded survivor|is reported|are reported")
for i, l in enumerate(lines):
    t = l.strip()
    if "re.compile" in l or t.startswith('r"') or t.startswith("#"):
        continue  # the scan's own definition, quoted in this document
    if i not in src and verbs.search(l):
        print(f"{i+1}: {t[:120]}")
EOF
```

Every hit it reports must be one of five things, and anything else is a defect: a CITATION of a row
ID, a POINTER to the section that owns the behavior, a DEFINITION of a term the tables use, a
HISTORICAL note recording a claim this spec corrected, or a claim OWNED by the section making it
and described by no row (AC-8's trigger-1 properties and §9's consequence bound are the two of
those). The scan does not decide which; it bounds where to look, which is the part that kept
failing. It is an AID, not a gate: it is a verb-list regex, so a paraphrase using none of its verbs
is not reported, and round 9 demonstrated exactly that with three escaping phrases. Those phrases
were added to the set — a widening justified by concrete escapes rather than by imagination — and
the limit itself is permanent: naming a further escaping phrase is admissible, naming the
possibility of one is not.

**Three classes, distinguished by SCOPE and by which criterion owns them. The behavior of each
condition is in its row and nowhere else** — this preamble deliberately states no behavior, because
a preamble that restated one is what rounds 1 through 4 kept finding drifted.

| Class | Scope of a condition's effect | Owned by |
| --- | --- | --- |
| Collection-level (C1-C4) | the whole run | AC-3b |
| Row-level (R1-R5) | that row only | AC-3 |
| Kill-time (K1-K6) | that target only | AC-5, AC-5b; exit status per §6.2 |

The one design idea behind the C-rows, stated as the rule it is: **a clause you cannot evaluate
has not been evaluated.** Concluding a process is unexempt from a failure to check is the precise
error that made the codex reaper kill live work. What the rule COSTS in each case is in the rows
the `Decidable?` column marks "no" — C1 and C4 — and stated nowhere else.

**Collection-level conditions.** `Decidable?` is the load-bearing column, and it asks one thing:
does the clause this input feeds still have an ANSWER? "No" means the clause was never evaluated;
"yes" means it was, even when the answer is a boring one. What follows from each is in the row.

| ID | Condition | Decidable? | Behavior |
| --- | --- | --- | --- |
| C1 | `ps` cannot be invoked (missing, non-zero exit, sandbox denial — a reviewer probe produced `zsh:1: operation not permitted: ps`) | no | reap NOTHING, exit non-zero, name the failure. A reaper that cannot see the process table must never conclude the machine is clean. |
| C2 | `ps` succeeds but emits zero parsable rows | yes | reap nothing, exit 0, report the row count so a silently-empty read is visible |
| C3 | `FX_REAP_MIN_AGE_S` unset | yes | use `14400`. Not a degenerate input; no note. |
| C4 | `FX_REAP_MIN_AGE_S` non-numeric, negative, or zero | no | REFUSE to run: exit non-zero naming the rejected value, reap nothing. Falling back to a default would silently apply a ceiling the operator did not ask for, and a zero or negative one would make everything old enough. |

**Row-level conditions.** All are DECIDABLE at the run level and scoped to their own row.

| ID | Condition | Behavior |
| --- | --- | --- |
| R1 | `pid` absent or unparsable | the row cannot be acted on at all; retained as an `UnparsableRow`, counted, reported, never reaped |
| R2 | `ppid` absent or unparsable | NOT reapable (clause (b) undecidable for this row); retained and reported |
| R3 | `etime` absent or unparsable | NOT reapable (the age clause is undecidable for this row); retained and reported |
| R4 | `command` empty | NOT reapable (clause (a) cannot match); retained and reported |
| R5 | `lstart` absent or unparsable | NOT reapable: the row carries no classification-time identity, so K2 has nothing to compare against and the target could not be signalled safely. Retained and reported. |

**Kill-time conditions.** These are ACTIONS, so the undecidable-stops-the-run rule above does not
apply to them; §6.2 owns their exit status.

| ID | Condition | Behavior |
| --- | --- | --- |
| K1 | the process exits between classify and kill (`ESRCH`) | tolerated, counted as `already-gone`, exit unaffected |
| K2 | the pid was recycled between classify and kill | re-verify identity immediately before signalling (below); a mismatch skips the kill and reports `identity-changed`, exit non-zero |
| K3 | `kill` fails for any other reason (e.g. `EPERM`) | reported per pid as `failed`; the run continues to the remaining targets; exit non-zero |
| K4 | a recorded target survives the subtree kill | after killing the recorded set, ONE verification re-scan; any recorded pid still alive is reported as `partial` by pid; exit non-zero. The re-scan SETTLES before concluding — SIGKILL is asynchronous, so a check issued immediately can still see a process the kernel is tearing down, and reporting `partial` for a target that was killed correctly is both a false alarm and a false non-zero exit. It costs nothing when the process is already gone, because the first check returns. |
| K6 | the identity read for a target FAILS, as opposed to reporting the pid gone (`ps` denied, timed out, or errored) | the target is NOT signalled and is reported as `identity-unreadable`; exit non-zero. Distinct from K1 by construction: "the pid is gone" is an answer, "the read failed" is the absence of one, and collapsing them would signal nothing while reporting an ordinary success. |
| K5 | a descendant was created AFTER collection, or reparented between collection and kill | NOT reached by this run, and the spec does not claim otherwise (L-5). It becomes an ordinary orphan and is a candidate on the NEXT run: the reaper is idempotent and repeated, not transactional. |

**Identity, for K2 — where it comes from, and what it must NOT be.** The identity of a target is
the triple **(pid, process start time, command)**, and the classification-time value is read in the
BULK `ps`, not afterwards. That is the correction plan review round 9 forced: capturing it after
classification compares two POST-classification reads and binds neither to the process that was
actually classified, so a process that exited or recycled between the snapshot and the first
identity read escaped K2 entirely. `ps -eo pid=,ppid=,etime=,lstart=,command=` makes `lstart` a
fixed FIVE tokens at a known offset — probed over 400 live rows on this machine with zero parse
failures — so the collector gets it for free and the pre-signal read is the only extra subprocess. Round 3 found the previous draft using `etime` and `ppid`,
and both are wrong:

- **`etime` is monotonically increasing by definition**, so requiring it unchanged can never hold.
  This spec's own P4 probe (§1.3) shows one pid's `etime` advancing `00:27 → 00:33 → 00:39 →
  00:45 → 00:51` while the process never changed. Start time is the stable form of the same fact.
  Probed on this machine 2026-08-16: across three samples one second apart, `ps -o lstart=` read
  `Sun Aug 16 09:35:23 2026` every time while `ps -o etime=` read `00:00`, `00:01`, `00:02`.
- **`ppid` changes under ordinary reparenting**, including reparenting THIS RUN causes — the
  harness's own comment records that a killed parent leaves its descendants reparented to init
  (`tests/mutation/source/runner.ts:141-143`). A `ppid` in the identity tuple would make the
  reaper abort on its own side effects.

**Kill order is therefore specified, not left open:** the reaped root is signalled FIRST, then its
recorded descendants. Killing the root first stops it spawning, and because `ppid` is not part of
the identity tuple, the reparenting that kill causes cannot invalidate any pending target.

Identity is read per TARGET, not for the whole table: `ps -o lstart=,command= -p <pid>` at
immediately before the signal, and compared against the identity the BULK read already carried.
`lstart`'s value contains spaces, which is why an earlier draft kept it out of the bulk parser
entirely; putting it BEFORE `command` instead makes it a fixed five-token field at a known offset,
so the parser stays simple and the classification-time identity comes for free. Cost: at most one
cheap read per KILL TARGET, and none per ordinary process.

---

## 5. Interfaces

The signature exists to make §4.4 expressible. Its shape is driven by three rules: every input that
can be degenerate survives into the output rather than being parsed away before the decision; every
collection-level problem has a channel; and `classify` stays pure and total so §9 can score it.

```ts
// lib/heavyReap/classify.ts

/** A row that parsed completely. */
export type ParsedRow = {
  kind: "parsed";
  pid: number;
  ppid: number | null; // R2
  etimeSeconds: number | null; // R3
  startedAt: string | null; // R5 - the classification-time half of K2's identity triple
  command: string;
};

/** A `ps` line that could not yield even a pid (R1). */
export type UnparsableRow = { kind: "unparsable"; raw: string; problem: string };

export type ProcRow = ParsedRow | UnparsableRow;

export type ReapConfig = {
  // No clock field. `etime` is already an ELAPSED duration, so the age clause compares two
  // durations and never needs "now" - a field an earlier draft carried and nothing ever read.
  minAgeSeconds: number;
  minAgeSource: "default" | "env"; // C3 vs C4
  minAgeRejected?: string;
  selfPid: number;
  selfAncestry: readonly number[];
};

export type Skip = "not-a-worker" | "has-live-parent" | "too-young" | "self" | "undecidable"; // R2, R3

export type Decision =
  | { pid: number; reap: true; shape: string; ageSeconds: number }
  | { pid: number; reap: false; because: Skip; detail?: string }
  | { reap: false; because: "unparsable"; raw: string; detail: string };

export type Classification = {
  decisions: Decision[]; // one per input row, parsable or not (R1)
  configNotes: string[]; // e.g. C4's rejected value
};

export function classify(rows: readonly ProcRow[], config: ReapConfig): Classification;
```

```ts
// lib/heavyReap/collect.ts
export type CollectResult =
  | { ok: true; rows: ProcRow[] }
  | { ok: false; problem: "ps-unavailable" | "ps-failed"; detail: string }; // C1
```

```ts
// scripts/heavy-reap.ts
export type KillOutcome = {
  pid: number;
  result: "killed" | "already-gone" | "failed" | "partial" | "identity-changed" | "identity-unreadable"; // K6
  detail?: string;
};

/** A target's identity for K2. See K2 for why the triple excludes `etime` and `ppid`. */
export type TargetIdentity = { pid: number; startedAt: string; command: string };
/** The PRE-SIGNAL read. The classification-time identity comes from the bulk row, not from here. */
export function readIdentity(pid: number): IdentityRead;
```

`classify` returns a decision for EVERY row, not only the reapable ones. A function returning only
the kills could not be tested for the property that matters far more — that it declines — and the
report would have nothing to print.

**Note what is NOT here.** No `SlotSurvey`, no `SlotProblem`, no `surveyIsDecidable`, and `collect`
takes no slot directory. All of that existed to serve the slot-membership clause §4.2 removed, and
it went with it. The reaper reads the process table and nothing else.

---

## 6. Wiring, triggers, and durability posture

### 6.1 The trigger set

The reaper is invoked; it is not resident. So the bound it delivers is the ceiling plus the
interval to the next trigger, and the trigger set is a load-bearing part of the design rather than
an afterthought. Three triggers, in descending reliability:

1. **Pre-admission, inside `pnpm heavy`.** The `heavy` script becomes
   `tsx scripts/heavy-reap.ts --kill --quiet; python3 scripts/with-heavy-slot.py --`
   in `package.json`. This is the strongest trigger available, because it fires at exactly the
   moment the resource is contended: whenever anyone wants a heavy slot, orphans are cleared
   first. It **fails open by construction** — the two commands are sequenced with `;`, so a
   reaper that errors, hangs to its own timeout, or is absent cannot block admission, and the
   wrapper's behavior is unchanged in every such case. `scripts/with-heavy-slot.py` is NOT edited
   (§2 non-goals); this is a `package.json` change.
2. **`Stop` hook**, per-machine, in the `~/.claude/` tree, invoked as `--kill`. Fires at every
   turn boundary of every Claude session on this machine — and a crashed session's PEERS still
   fire, which is what makes this useful for the crash case the design targets, though not
   guaranteed. The spec does not install it; the plan documents the one-liner in AGENTS.md the way
   the codex-guard shim install is documented.
3. **On demand:** `pnpm heavy:reap`.

**Trigger 1 verified by probe, 2026-08-16 13:55Z**, in a throwaway package whose scripts mirror
today's form and the proposed one. Three properties, all measured rather than argued:

| Property | Probe | Result |
| --- | --- | --- |
| Argument transparency | `pnpm <script> pnpm mutation:guards` under both forms | wrapper argv `['--', 'pnpm', 'mutation:guards']` — BYTE-IDENTICAL; the reaper sees only `['--kill', '--quiet']` |
| Explicit `--` still handled | `pnpm <script> -- node -e ...` | wrapper argv `['--', '--', 'node', '-e', ...]`, the doubled separator `split_argv` already drops (`scripts/with-heavy-slot.py:60-70`) |
| Fails open | reaper file ABSENT; reaper exiting 3 | wrapper ran with identical argv in both cases |
| Exit status still transparent | wrapper exits 42 behind a failing reaper | `pnpm` exits 42 |

The ordering is load-bearing and is the whole reason this works: `pnpm` appends the caller's
arguments to the END of the script body, so the wrapper must be the LAST command in it. A reaper
placed after the wrapper would capture the caller's command instead.

**The one failure mode `;` does NOT cover is a reaper that HANGS**, which would block admission
rather than fail open. The reaper is bounded by construction, and the count is exact: ONE bulk
`ps` read — which now carries `lstart`, so it supplies the classification-time identity itself —
plus AT MOST ONE `ps -o lstart=,command= -p <pid>` read per KILL TARGET, immediately before the
signal, which is what K2 compares against. A target whose pre-signal read FAILS is K6 and one that
reports the pid gone is K1, each decided on that evidence alone. K4's verification re-scan spawns nothing
(it is `kill(pid, 0)`). **Every one of those invocations carries an explicit subprocess timeout**,
and what a timeout COSTS is whichever row that read belongs to, not a blanket abort: the bulk read
is C1, and an identity read is K6 (AC-8). A timeout on each child is what makes the `;` sequencing safe: `;` waits for the reaper to
terminate, so an unbounded reaper would block admission even though it cannot fail it. No other guard is needed, because a reaper that cannot finish
a `ps` in seconds is on a machine with worse problems than orphans.

The first review round's second finding is the reason trigger 1 exists. A design whose only
automatic trigger was a `Stop` hook could not honestly claim to bound anything: a crash runs no
Stop hook of its own, and there is no guarantee any other session ever ends a turn.

### 6.2 CLI surface — one definition, so no two sections can describe it differently

| Invocation | Kills? | Reports |
| --- | --- | --- |
| `pnpm heavy:reap` (default) | no | every reap CANDIDATE, and every declined process that is orphan-shaped (`ppid == 1`), with its reason; plus all collection problems and config notes |
| `pnpm heavy:reap --all` | no | the above, plus every non-orphan-shaped row and its reason — the full decision list |
| `pnpm heavy:reap --kill` | yes | exactly what the default reports, plus a `KillOutcome` line per target |
| `--quiet` | modifier | suppresses ONLY the per-row DECLINE lines. Everything else is still emitted: collection problems, config notes, and every K-row outcome that is not a plain success (K2, K3, K4, K6). K1 IS a plain success and is suppressed with the declines. Only meaningful with `--kill`, and it is what trigger 1 uses, so a reap that went wrong during admission is still visible. |

Killing requires `--kill` explicitly; running the tool can never be the destructive act by
accident. `--all` is a REPORTING breadth flag only and never widens what is killed.

Exit status, enumerated by §4.4 row ID so it cannot drift from the table:

- **Non-zero** on C1 or C4 (an undecidable collection condition — nothing was reaped) or on any of
  K2, K3, K4, K6 (a kill was skipped, failed, or left a recorded target alive).
- **Zero** otherwise, including C2, C3 and K1, each of which is an ordinary outcome per its row.

K2 is deliberately non-zero even though no signal was sent: an `identity-changed` skip means the
machine moved under the reaper, and an operator who sees exit 0 will not look.

### 6.3 Durability

The classifier and the CLI live IN THIS REPO deliberately.
`docs/agents/codex-silent-death-2026-07-24.md` §8 records the cost of the alternative: that the
codex reaper's fix is per-machine config outside this repo, so any other machine or checkout needs
the same edits applied by hand. Keeping the decision logic tracked means it is reviewable,
testable, mutation-scored, and identical in every checkout; only trigger 2 stays machine-local,
and trigger 1 is tracked because `package.json` is.

Not wrapped in `pnpm heavy`: the CLI is one bulk `ps` read plus at most one per kill target. Wrapping it
would deadlock trigger 1 against the semaphore it runs in front of.

---

## 7. Documented limits

Each is a limit, not a defect: the worst case is that a process is NOT reaped and the report says
why. Per the finding-admissibility contract, a hypothetical whose worst case is inaction plus a
surfaced signal files here rather than as a review round.

- **L-1 — a producer outside the declared set is not reaped.** The accept-set in §4.2(a) is closed
  by construction. A new worker entrypoint (a vitest pool rename, a playwright major) is invisible
  until its row is added. Mitigated by the DEFAULT report, which names every declined
  orphan-shaped process and its reason (§6.2), so an unrecognised producer appears as a
  `not-a-worker` decline on an orphan rather than as silence.
- **L-2 — the bound is the ceiling plus the interval to the next trigger, not the ceiling.** The
  reaper is invoked, not resident (§6.1), so an orphan burns until the first trigger that fires
  after it crosses the ceiling. Trigger 1 makes that interval short precisely when it matters —
  the next heavy phase anyone starts — but a machine on which nobody starts a heavy phase and no
  Claude turn ends can hold an orphan indefinitely. Closing this would need a daemon or a launchd
  agent, which §12 rules out.
- **L-3 — a legitimately long heavy phase is never reapable on account of its length.** Recorded
  as a limit that CLOSED: earlier drafts carried an unwrapped-and-detached false-positive window,
  which existed only because exemption was tied to slot membership. With the predicate reading the
  process tree, how a phase was launched is invisible to it, and every process in a running phase
  is exempt under clause (a) or (b) at any age. The residue that remains is L-7, which is a
  different case.
- **L-4 — Codex trees and MCP fleets are out of scope.** reap-idle-codex.sh owns them. The
  accept-set contains no Codex entrypoint, so the two cannot both claim a process.
- **L-5 — `ps` is a sample, not a transaction, and the subtree kill is therefore best-effort.**
  An earlier draft claimed every race resolves toward a process having already exited. That is
  false, and round 2 named the three ways: a target can spawn a descendant AFTER collection, which
  is in no snapshot and becomes unreachable by ancestry once its parent dies; existing descendants
  can reparent between collection and kill; and the producer this design targets does exactly this
  by construction — `tests/mutation/source/runner.ts:141-143` records that by the time `spawnSync`
  returns, every descendant has been reparented to init and no parent-based walk can find them.
  What the design guarantees is therefore narrower, and is stated by AC-5 and by rows K4 and K5.
  The reaper is idempotent and repeated rather than transactional, and that is the whole answer to
  this limit.
- **L-6 — adversarial process manipulation is out of scope.** A process that rewrites its own argv
  to impersonate an exempt shape, or reparents itself to dodge clause (b), defeats this. The
  threat model is ordinary orphaning by killed sessions and crashed harnesses.
- **L-8 — pid reuse cannot be closed by a single process, and the residue is SILENT.** K2 re-reads
  the identity triple immediately before signalling, which narrows the window from the whole run to
  the gap between that read and the `kill` syscall. It does not close it, and — corrected here after
  round 9 — the residue inside that gap is **not** observable: if the target exits and its pid is
  recycled after the final read, the signal reaches an unrelated process, K2 reports no mismatch,
  and nothing appears in the report. Making it observable would need an atomic check-and-signal
  (a pidfd, a process handle) that macOS does not offer.

  **This is the one place the consequence bound does not reach, and §9 says so explicitly.** The
  bound governs what the reaper DECIDES about processes it classified; a pid recycled after the
  final identity read is not a process the reaper ever classified, and no decision it made was
  wrong. That is a real limit rather than a reclassification of the same guarantee, and the
  exposure it leaves is: a kill lands on an unrelated process that acquired the pid within
  microseconds of the check, on a machine with a 99 999 pid space. Two things bound it further —
  K2 already eliminates every recycle before the check, which is the whole run minus a syscall, and
  the reaper only ever signals pids it first found orphaned, worker-shaped and hours old.

- **L-7 — a worker orphaned while its heavy phase runs on is reapable after the ceiling.** It is
  exempt by nothing: its parent is gone, and §4.2 has no slot clause to notice that the phase
  around it is alive. This is deliberate — such a worker has lost the channel it reports through
  and is doing work nobody will collect — but it is a behavior to know rather than a guarantee, and
  a harness that ever deliberately detaches a worker it still depends on would be defeated by it.

---

## 8. Acceptance criteria

**No criterion below restates a §4.4 behavior; each CITES the rows it is satisfied by.** That is the
structural answer to the class three rounds kept finding (§4.4's preamble). Where a criterion needs
to say something §4.4 does not, it says only that.

- **AC-1** — A process matching a declared worker shape, with `ppid == 1` and age ≥ the ceiling,
  is classified reapable. There is no slot clause; §4.2 explains why.
- **AC-2** — **A heavy phase that is structurally identifiable as live is never reapable, at any
  age.** Proved per row of §4.3's table: its workers have a live parent (clause b), and every
  non-worker process in it fails clause (a). Neither proof involves the ceiling, which is why AC-2
  holds at any age. The one row §4.3 marks "no" is NOT covered by this criterion; it is L-7.
- **AC-3** — Every row-level condition R1-R5 behaves as its row states, and each appears in
  `Classification.decisions` — so `decisions.length === rows.length` for any input.
- **AC-3b** — Every collection-level condition C1-C4 behaves as its row states, and the
  undecidable/decidable partition it is tested against is the table's `Decidable?` column — C1 and
  C4 undecidable, C2 and C3 decidable. The distinction the criterion exists to pin: a run that
  CANNOT evaluate a clause is not the same as one that CAN and finds nothing. C1 and C2 are that
  pair, and their rows differ.
- **AC-4** — The reaper never targets its own process or any ancestor of it.
- **AC-5** — Killing removes the RECORDED target set — the reaped root plus every descendant
  present in the collection snapshot — in the order §4.4 specifies, and K4's verification re-scan
  reports any recorded pid still alive. K5 is outside this criterion by construction.
- **AC-5b** — K2 and K6 hold: no pid is signalled whose identity triple (pid, start time,
  command) has changed since classification, and none whose identity could not be READ. The residual window between that check and the syscall is L-8, and
  this criterion deliberately does not claim it. `etime` and `ppid` are NOT part of that triple, and a target whose
  `etime` advanced or whose `ppid` changed because this run killed its parent is still signalled.
- **AC-6** — Each invocation in §6.2's table behaves as its row states, and the two properties
  that table exists to guarantee hold: `--all` widens only the report and never what is killed, and
  nothing is killed without `--kill`. Exit status per §6.2's enumeration.
- **AC-7** — C1 holds, on every one of its three spellings (binary missing, non-zero exit, sandbox
  denial). Called out separately from AC-3b because it is the condition under which a reaper would
  otherwise report a clean machine.
- **AC-8** — Trigger 1 fails open: with scripts/heavy-reap.ts absent, erroring, or timing out,
  `pnpm heavy <cmd>` admits and runs `<cmd>` exactly as it does today, with byte-identical argv,
  and the wrapper's own exit status still reaches the caller.
- **AC-9** — lib/heavyReap/classify.ts is enrolled in `tests/mutation/source/registry.ts` with a
  declared `scoreFloor`, a row in `EXPECTED_LEDGER_KINDS`
  (`tests/mutation/guardSurfaces.gate.test.ts`), and no unaccepted survivor.
- **AC-10** — A live smoke asserts collect.ts parses this machine's real `ps` output into rows
  whose pid/ppid/age agree with a direct `ps -o` read for a process the test itself spawns.

## 9. Mutation enrolment — the convergence criterion

classify.ts is a pure classifier over a finite input record: exactly the surface the
source-mutation registry expresses. Per AGENTS.md convergence bullet 4, **enrolment precedes the
first DIFF-stage review dispatch**, and that brief states the mutation score plus the
unaccepted-survivor set. This is why §4.1 puts the rules in an importable module with a referring
suite rather than in the CLI script — a terminal script is not overlay-able, and the
classname-equivalence arc measured the cost of discovering that late (fifty false-pass findings
across fourteen diff rounds).

Convergence criterion for every review dispatch on this arc:

- **Consequence bound:** every process is either correctly classified, or declined with a reason
  reported through the §5 channel for its condition class; and whenever an exemption clause cannot
  be EVALUATED, the run reaps nothing and says so (§4.4's C-rows). Never silently
  killed, never silently omitted from the report, and never reaped on the strength of a check that
  did not run. **Scope:** the bound governs the reaper's decisions about processes it CLASSIFIED.
  It does not reach a pid recycled between K2's identity read and the `kill` syscall, which is L-8
  and is silent by construction rather than by omission. A decline is a DOCUMENTED LIMIT (§7), not
  a finding.
- **`PROBE DOMAIN:`** the live process table on this machine
  (`ps -eo pid,ppid,etime,%cpu,rss,command`), `package.json`'s `heavy` script, and
  `tests/mutation/**` plus the captured `ps` fixtures the plan adds. A probe input is drawn from that domain or is one
  ordinary edit away from an input in it; a constructed process table no producer in this repo can
  emit files to §7.
- **Threat fence:** ordinary orphaning by killed sessions and crashed harnesses. Adversarial
  process manipulation is out of scope (L-6).
- **Score:** the mutation score on classify.ts with an empty unaccepted-survivor set. A finding of the form
  the-guard-does-not-pin-what-it-claims is admissible only with a surviving mutant from the
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

Per the class-sweep disposition rule the default is repair-in-PR, and each deferral names its
exception.

The sweep found four instances, and they are ONE shape rather than four defects: **in the mutation
harness, every lifetime bound lives in the parent.** The per-mutant ceiling is enforced by
`spawnSync` in the parent (`tests/mutation/source/runner.ts:176`), the group reap is executed by
the parent (`tests/mutation/source/runner.ts:199`), and `childRun` has no bound at all
(`tests/mutation/source/childRun.ts:18`). So a live parent bounds its child well and a dead parent
bounds nothing — which is the incident. They are therefore filed as ONE entry with four components
rather than four near-duplicate rows, because they share a surface, a cause, and a repair.

**`BL-MUTATION-CHILD-LIFETIME-PARENT-DEATH`** — the mutation harness bounds a child only while its
parent lives. Components:

1. **No parent-death watchdog in the child** (§3 approach B). A `getppid() === 1` poll inside the
   child would close it; macOS has no `prctl(PDEATHSIG)` equivalent, so polling is the only form
   available.
2. **`setpgrp` makes the child immune to session teardown.** `GROUP_LEADER_ARGV`
   (`tests/mutation/source/runner.ts:146`) puts each mutation child in its own process group so the
   parent can reap a grandchild that outlived it. Probe P2 (§1.3) shows the cost: a same-group
   child dies on a group-directed kill and a `setpgrp`'d one survives and reparents to init. The
   2026-08-15 change traded a child that dies with its session for a parent that can reap a hung
   grandchild — a real improvement on the hazard it targeted, and a regression on this one.
3. **`childRun` bounds nothing.** `execFileSync` with no `timeout` and no process group
   (`tests/mutation/source/childRun.ts:18`), unlike its sibling `runSuite` which has both
   (`tests/mutation/source/runner.ts:176`, `tests/mutation/source/runner.ts:183`). The two were
   explicitly repaired together for stdio (`tests/mutation/source/childRun.ts:20-23`) but not for
   lifetime.
4. **A stale comment naming a function that does not exist.** `tests/mutation/source/runner.test.ts:37`
   names `reapOrphans`; no such symbol exists in the tree (`rg reapOrphans` returns that one
   comment). Behaviorally inert, but it misdescribes the mechanism to the next reader of exactly
   this code — so it is repaired by whoever takes components 1-3, not on its own.

**Exception (c)** for all four: the repair is a redesign of a surface this PR does not otherwise
touch, and one that converged through review on 2026-08-15. Reaching for it here would relitigate
a settled decision at the cost of the rounds it already took. Approach A covers the CONSEQUENCE —
such a child is exactly a §4.2 reapable — so the entry is about PREVENTION, not exposure, which is
also why it is a legitimate deferral rather than a hole in this design.

**Timeline note, so the entry is not misread as the incident's cause:** both 2026-08-15 commits
merged to `main` at 13:58:50 CDT (`d18e9b4d5`, `35d5c0e58`). Every orphan in the 08-16 census
started between 02:33 and 12:03 on 08-15 — all BEFORE that merge. The incident is not attributable
to them, and P2 is a forward-looking finding, not a post-mortem one.

---

## 12. Out of scope

- Any change to `scripts/with-heavy-slot.py`. §6.1's pre-admission trigger is a `package.json`
  script edit; the wrapper's own source, its slot protocol, and its `execvp` model are untouched.
- Any change to `tests/mutation/source/runner.ts` or `childRun.ts` (§11).
- Installing the `Stop` hook. The plan documents the wiring; installing per-machine config is not
  a tracked-repo action.
- Sharding or otherwise bounding the nightly mutation job (§10).
- A daemon, a launchd agent, or any always-resident process. The reaper is invoked, does its work,
  and exits.
