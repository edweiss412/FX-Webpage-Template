# Orchestrator pane compaction — design

**Status:** DRAFT · **Date:** 2026-08-16 · **Branch:** `feat/orchestrator-pane-compaction`

An orchestrator session compacts the arc panes under its purview: it ranks eligible panes by
context pressure, selects the moment by arc position, and drives a probe-verified keystroke
protocol against the target pane through `herdr`.

---

## 1. Purpose

Context compaction is not something a Claude Code session can elect for itself. `/compact` is a
human-typed slash command and auto-compaction fires at a threshold the session neither observes
nor chooses (§2.1). For a long-running arc, that means every compaction it ever experiences
happens at a position selected by nothing at all — frequently mid-task, with triage decisions,
sweep results, and "what I was about to do next" living only in context.

An orchestrator session can do better, because it can see and drive other panes. This spec defines
the surface that lets it: a read-only classifier over the live pane roster, and a driver that
executes a checkpoint-then-compact protocol at a position the orchestrator chose.

**The value is entirely in beating auto-compaction to the punch.** Position is the purpose;
pressure is only the trigger. A design that ranks by pressure alone has inverted the two.

### 1.1 Resolved scope — do not relitigate

Each row was settled during brainstorming or by the probe in §3. Verify the citation; do not
re-derive.

| Decision | Ratification |
| --- | --- |
| A session cannot compact **itself**; `/compact` is human-typed and auto-compaction is threshold-driven. Self-compaction is not a design option. | §2.1, probe-independent (documentation review) |
| The audience is **orchestrator sessions driving other panes**, not arc sessions disciplining themselves. Session-side "keep the marker current" guidance is explicitly OUT of scope. | User decision, 2026-08-16 |
| Purview is a **registry file the orchestrator writes at dispatch time**, not derived from `pnpm ledger:claims`. Ledger derivation misses arcs with no `BL-`/`DEF-` row, which AGENTS.md invariant 12 declares legitimate ("A run that finds no matching ledger entry does nothing"). | User decision, 2026-08-16 |
| `agent_status: working` is the **compliant** steady state for an arc, not a hazard. AGENTS.md forbids ending a turn mid-pipeline, so gating on `idle` would select only arcs that are blocked, finished, or stalled. | `AGENTS.md` § "Never end your turn mid-pipeline" |
| The driver **never fires without an explicit flag**. Report is the default mode. | §5.3 |
| Ranking is two-factor — pressure gates eligibility, position selects the moment. Neither alone. | §4 |
| `PreCompact` hook blocking is **undetermined** and the design does not depend on it. | §2.1 |
| This spec ships **no UI**. Nothing under `app/` or `components/`, no tokens, no CSS. AGENTS.md invariant 8's impeccable dual-gate does not apply. | §7 |
| No DB, no migrations, no advisory locks. | §7 |

---

## 2. Background facts

### 2.1 Harness facts (documentation review, 2026-08-16)

| Fact | State |
| --- | --- |
| `/compact` is a user-typed slash command; the model has no tool for it | Documented |
| Auto-compaction fires automatically near the context limit | Documented |
| `PreCompact` hook exists, matchers `manual` \| `auto` | Documented |
| `PreCompact` can **block** a compaction | **Not documented** — design must not rely on it |
| `SessionStart` accepts a `compact` matcher; its stdout is injected into the fresh post-compact context | Documented |
| Model can detect that a compaction occurred, or read its own distance to the threshold | **Not documented** |
| `/autocompact` command exists ("set automatic compaction thresholds") | Documented; details not documented |

Two consequences carried into the design: the orchestrator cannot prevent an auto-compaction on a
target, only preempt it; and the target cannot self-report its own pressure, so pressure must be
read from outside (§3.7).

### 2.2 herdr primitives

Verified against the installed CLI at `/Users/ericweiss/.local/bin/herdr`:

- `herdr agent list` — the roster. Arc sessions are already labeled with their branch name by
  AGENTS.md's mandatory pane + agent naming rule, so branch identity comes for free.
- `herdr agent get <target>` — includes `agent_status` and `pane_id`.
- `herdr agent read <target> --source visible --lines N` — the rendered screen.
- `herdr agent wait <target> --status <idle|working|blocked|unknown> --timeout MS`.
- `herdr agent send <target> <text>` — writes **literal** text, no submit.
- `herdr pane close <pane_id>`.

`\r` submits in the Claude TUI; `\n` inserts a newline into the input box and does not submit.

---

## 3. Probe findings (empirical, 2026-08-16)

Per the mandatory empirical-spike rule in `docs/agents/spec-self-review.md:21`, the input/interrupt
semantics below were **measured, not reasoned about**. The environment was constructed rather than
interrogated: a throwaway `claude` pane started with `herdr agent start compact-probe --cwd
<scratch> --no-focus -- claude`, driven through a 300-400 second `bash` loop so that every
interrupt landed **mid-tool-call** — the risky case. No live arc was touched. Probe pane closed at
the end of the run.

| ID | Finding | Evidence (rendered pane text) |
| --- | --- | --- |
| **P1** | Input sent to a `working` pane **queues**. It does not execute mid-turn, and `agent_status` stays `working`. | `❯ QUEUED-PROBE-A` above `❯ Press up to edit queued messages`; `status: working` |
| **P2** | With vim mode enabled (this machine's configuration), the **first Esc is consumed leaving INSERT mode** and does nothing else. The tool call kept running and the queue survived. | `-- INSERT --` disappears; `tick-18` still advancing; `status: working` |
| **P3** | The **second Esc interrupts**, killing the in-flight tool call. | `⎿ Interrupted · What should Claude do instead?` and `⏺ Command rejected. Stopped.` |
| **P4** | A message queued **before** the interrupt fires **immediately** as the next turn. Queue-then-interrupt is effectively atomic — there is no idle window between them. | `❯ QUEUED-PROBE-A` consumed and answered in the same screen as the interrupt |
| **P5** | A queued **slash command** survives that path and executes as a command, not as prose. | `✻ Compacting conversation… (7s · ↑ 127 tokens)` → `❯ /compact ⎿ Compacted (ctrl+o to see full summary)` |
| **P6** | After compaction the session does **not** auto-resume. It settles at `agent_status: done` with no live child process and stays there. | `status: done` stable across 20s; `pgrep -fl 'echo beat-'` empty |

### 3.7 Context pressure is externally readable

The context gauge renders on every pane and parses out of `herdr agent read`:

```
chore/heavy-orphan-reaper        Opus 5 ctx ███░░   (2h39m single turn, 353.1k tokens)
fix/scanner-scope-totality       Opus 5 ctx █▓░░░
bl-mediums-orchestrator          Opus 5 ctx ██░░░
smalls-batch-orchestrator        Opus 5 ctx █░░░░
```

This is a **direct readout**, unlike arc position, which is inferred (§4.2). It is the crisp signal
and it answers the weaker question, which is exactly why it is the trigger and not the selector.

### 3.8 What the probe changed

The pre-probe protocol was `Esc → checkpoint → /compact → resume`. P4 makes that wrong: after an
interrupt with nothing queued, the target sits at "What should Claude do instead?" — an extra
round-trip, and a window in which the target's own cron nudge could fire and start work the
orchestrator is about to interrupt again. The corrected protocol queues the checkpoint **first**
and uses the interrupt to detonate it (§5.2).

---

## 4. Classification model

### 4.1 Verdicts

Two factors with distinct jobs. Pressure decides **whether**; position decides **when**.

| Verdict | Meaning | Condition |
| --- | --- | --- |
| **HOLD** | Do nothing. Position is irrelevant. | Pressure below the eligibility band. Compacting here destroys live context and buys nothing. |
| **WAIT** | Eligible, but currently at an expensive position. | Pressure at or above the band, position cost high. Report what it is waiting for. |
| **COMPACT** | Fire the protocol. | Pressure at or above the band, position cost low. |
| **FORCE** | Fire at the best position available now. | Pressure critical — auto-compaction imminent. A deliberate compaction at a mediocre position still beats an automatic one at a random position, because the checkpoint step happens either way. |
| **UNDETERMINED** | Cannot establish safety. Never an implicit all-clear. | Marker older than the newest commit, unresolvable worktree, unparseable gauge, unlabeled pane. |

`FORCE` exists only because auto-compaction is the competitor. Without it the classifier would sit
on `WAIT` while the threshold fired underneath it.

**The bands.** The gauge renders five cells, each of which can be full (`█`), half (`▓`), or empty
(`░`) — so the readable resolution is 10%, not 20%. Filled fraction `f` is
`(full + 0.5 × half) / 5`.

| Band | Range | Effect |
| --- | --- | --- |
| Below eligibility | `f < 0.5` | `HOLD` — position is not consulted at all |
| Eligible | `0.5 ≤ f < 0.8` | `WAIT` or `COMPACT`, decided by position |
| Critical | `f ≥ 0.8` | `FORCE`, except the hard-`WAIT` row of §4.2 |

These are the thresholds the classifier ships with, stated here so a change to them is a spec
change rather than a constant edit. All three observed gauges in §3.7 fall below eligibility except
`███░░` (`f = 0.6`, eligible), which is the pane the design was calibrated against.

### 4.2 Position cost is a gradient, not a boolean

Position is **inferred**, from: the marker's `stage`; whether the tree is dirty; the age of the
last commit; `gh pr checks` state; and what the pane is currently rendering. Because it is the
fuzzier of the two signals, the report **shows its evidence per pane** rather than asserting a
tier, so an operator can overrule it.

Ordered cheapest to most expensive:

| Position | Cost | Signal |
| --- | --- | --- |
| Between TDD tasks, tree clean, commit just landed | Lowest | clean tree, recent commit, marker `stage` unchanged |
| Post-Stage-0, pre-spec | Low | clean tree, no commits ahead |
| Polling CI after push | Low | PR open, checks pending |
| Spec/plan committed, review verdict recorded in the round corpus | Low | clean tree, `docs/review-rounds/**` row present |
| Findings returned, triage not yet written | High | review out-dir newer than any doc commit |
| Mid class-sweep | High | dirty tree, no commit since sweep start |
| Mid-TDD task, tree dirty | High | dirty tree, marker `stage` = implementation |
| **CI green, PR unmerged** | Highest — never | `gh pr checks` all green, PR open |

The last row is a hard `WAIT` at any pressure including critical: AGENTS.md makes merge the same-turn
successor of CI-green, and PR #482 sat `CLEAN` and unmerged for five hours on exactly this gap.

### 4.3 Accept-set

The classifier keys on **structure**, never on spelling. It accepts:

- `agent_status` ∈ {`idle`, `working`, `blocked`, `done`, `unknown`} — the enum `herdr` emits.
- A parsed gauge: filled-block count over total-block count.
- Marker fields present in AGENTS.md's declared shape (`branch`, `stage`, `tasksRemaining`, `next`,
  `blockedOn`, `cronJobId`, `sessionId`).
- Git state: porcelain status, commits ahead of `origin/main`, last commit timestamp.

Everything outside the accept-set is **reported by name** as `UNDETERMINED`, never silently
bucketed. Terminal titles and pane labels are display strings and are never parsed for meaning; the
branch comes from the agent `name` field matched against `git worktree list`.

---

## 5. The surface

### 5.1 Module and CLI shape

Following the `ledger:claims` precedent exactly (`scripts/ledger-claims.ts` +
`scripts/lib/ledger-claims-core.ts`):

```
scripts/lib/pane-compaction-core.ts   # NEW: importable classifier, pure over an injected surface
                                      #      (roster, git, gh, filesystem, clock) — testable
                                      #      without a live herdr
scripts/pane-compaction.ts            # NEW: thin CLI adapter
package.json                          # + "panes:compact" alias
```

The module/adapter split is **required, not stylistic**: AGENTS.md's convergence criterion states
that a guard or detector surface is enrolled in the source-mutation registry
(`tests/mutation/source/registry.ts`) before its first review dispatch, and the runner overlays a
target only when a Vitest suite imports it. A terminal CLI script cannot be enrolled. Enrolment
lands with the implementation and the score is stated in the round-1 diff brief.

### 5.2 The protocol

Probe-corrected ordering. Every step cites the finding that justifies it.

```
0. Read the pane.  Skip if mid-tool-call is unsafe for THIS target (§6).
1. Queue the checkpoint prompt:
     herdr agent send <t> '<checkpoint text>'
     herdr agent send <t> $'\r'                    # queues, does not execute      [P1]
2. Interrupt:
     herdr agent send <t> $'\x1b'                  # consumed leaving INSERT       [P2]
     herdr agent send <t> $'\x1b'                  # actual interrupt              [P3]
   -> the queued checkpoint detonates immediately                                  [P4]
3. herdr agent wait <t> --status idle
4. Compact:
     herdr agent send <t> '/compact'
     herdr agent send <t> $'\r'                                                    [P5]
5. herdr agent wait <t> --status idle
6. Send the resume prompt explicitly.                                              [P6]
```

**Step 1 is the load-bearing step.** Post-interrupt is definitionally mid-task, so the summary is
generated from a conversation that ends mid-action and "what I was about to do next" is precisely
what is least represented in it. The checkpoint moves that intent to disk *before* the summarizer
runs. Its text instructs the target to update its ship-state marker — `stage`, and `next` as a
literal resume command — commit WIP, then stop.

**Step 6 does not delegate to the target's cron nudge.** Those jobs live in session memory and no
external observer can verify that Stage 0 ever registered one. Sending the resume explicitly costs
one call and removes the dependency on unverifiable state.

**Two Esc keystrokes, always.** P2 is a machine-local configuration fact (vim mode), so the driver
sends the first Esc unconditionally and treats it as a no-op where vim mode is off — a redundant
Esc at an input prompt is harmless, whereas a missing one silently skips the interrupt entirely.

### 5.3 Modes

| Invocation | Behavior | Exit |
| --- | --- | --- |
| `pnpm panes:compact` | Report table: pane, branch, gauge, verdict, position evidence. | 0 |
| `pnpm panes:compact --json` | Envelope `{status, degraded, panes}`. Never capped. | 0 |
| `pnpm panes:compact --check` | 0 = nothing to do · 1 = at least one COMPACT/FORCE · 2 = untrusted | 0/1/2 |
| `pnpm panes:compact --drive <target>` | **Dry run by default** — prints the exact keystroke sequence without sending. | 0 |
| `pnpm panes:compact --drive <target> --fire` | Executes §5.2 against one named target. | 0/1 |

`--fire` never accepts `--all`. One target per invocation, named explicitly. Exit 2 means the check
could not establish safety, and is never read as an all-clear — the same convention that
`ledger:claims --check` already establishes.

### 5.4 Purview registry

Written by the orchestrator at dispatch time; one row per pane it dispatched (`paneId`,
`agentName`, `branch`, `dispatchedAt`).

```
~/.claude/pane-purview/<orchestratorSessionId>.json    # NEW: per-orchestrator, outside any worktree
```

**Outside the worktree, deliberately.** AGENTS.md records that the ship-gate's state file was
originally kept in `<worktree>/.claude/` and dirtied the very tree it was measuring, resetting the
counter every run so the gate could never stand down. Purview state has the same shape and takes
the same placement.

**Disk-backed, deliberately.** The orchestrator is itself subject to compaction, and an in-context
list of "panes I dispatched" is exactly what a compaction eats.

A pane not in the registry is reported as **unowned**, never silently omitted (§6) and never
driven. A registry row whose pane is gone from the roster is reported as **stale**.

---

## 6. Convergence criterion

Per AGENTS.md, a detector brief states all three or the dispatch is blocked at round 1.

**Consequence bound.** Every pane is classified correctly or reported as `UNDETERMINED`, never
silently driven on a wrong verdict. A conservative demote to `WAIT` or `UNDETERMINED` plus a
surfaced reason is a **documented limit**, not a finding.

**Probe domain.** Admissible probes are drawn from: the live `herdr agent list` roster on this
machine, and the committed fixture corpus at `tests/paneCompaction/fixtures/`. A constructed roster
more than one ordinary edit away from an input in that set files to §7, not to a round.

**Threat-model fence.** The classifier defends against an orchestrator misreading its own pane
roster in ordinary operation. A forged marker, a hostile agent label, or a pane deliberately
rendering a fake context gauge is **out of scope** and files to §7.

**Score.** The surface is enrolled in `tests/mutation/source/registry.ts` before the first review
dispatch; the round-1 diff brief states the mutation score plus an empty unaccepted-survivor set,
per the `GUARD SURFACE:` line the codex-guard wrapper requires.

---

## 7. Documented limits

Carried from round 0. Each is a deliberate boundary, not an open defect.

1. **Mid-tool-call interrupts can truncate a file the target was writing.** P3 kills the in-flight
   call. A target running a script that rewrites files in place — `python3 - <<'PYEOF'` over a spec
   document, observed live on `chore/heavy-orphan-reaper` during this design — can be left with a
   half-written file. Mitigation is the §5.2 step 0 read, which demotes to `WAIT` when the visible
   screen shows a running tool call whose command matches a file-writing shape. This is a
   heuristic over a display string and is **explicitly not** a guarantee; it is why `--fire`
   requires a named target and never accepts `--all`.
2. **Position is inferred and can be wrong.** The report shows evidence so an operator can
   overrule; the classifier never claims certainty it does not have.
3. **The gauge is a five-cell glyph with half-cell resolution.** The finest distinction available
   is 10% (§4.1). It supports the three bands and nothing finer; a threshold expressed to a
   percentage point is not representable and must not be specified.
4. **Auto-compaction cannot be prevented, only preempted.** `PreCompact` blocking is undocumented
   (§2.1). A target can auto-compact between classification and drive; the protocol is idempotent
   enough to survive it (the checkpoint is still useful, the `/compact` becomes a near no-op).
5. **A pane whose Stage 0 agent label was never set is invisible to the roster.** Reported as
   unlabeled, never silently omitted — but it cannot be driven.
6. **Vim-mode detection is not attempted.** The unconditional double-Esc (§5.2) makes it
   unnecessary and removes a configuration read that could itself be wrong.
7. **Cross-account panes.** The roster spans workspaces, so an orchestrator in one account can see
   and drive a pane in another. Purview ownership is the only thing preventing that; there is no
   account-level enforcement.

---

## 8. Testing

| Surface | Mechanism |
| --- | --- |
| Classifier verdicts | Unit tests over injected roster/git/gh fixtures at `tests/paneCompaction/`. Every verdict in §4.1 including `UNDETERMINED`. |
| Position gradient | One case per row of §4.2, expected value derived from the fixture, never hardcoded. |
| CI-green-unmerged hard `WAIT` | Explicit case at critical pressure, proving pressure cannot override it. |
| Accept-set rejection | Unknown `agent_status`, unparseable gauge, marker missing a declared field — each reported by name. |
| Purview | Unowned pane reported not omitted; stale row reported; registry read from disk, not context. |
| CLI envelope | `--json` never capped; `--check` exit codes 0/1/2. |
| Keystroke sequence | `--drive` dry-run output asserted byte-for-byte against §5.2, including both Esc sends. |
| Prose pinning | `tests/docs/` meta-test pinning the AGENTS.md contract text, following `tests/docs/_metaAgentsMarkerContract.test.ts`. |
| Mutation | Enrolled in `tests/mutation/source/registry.ts`; `pnpm mutation:guards` score stated in the round-1 diff brief. |

Every guard states its premise executably with `premise` / `premiseHolds` from
`tests/_shared/premise.ts` — a fixture roster large enough to exercise the band it names, and a
no-defect baseline for every probe.

---

## 9. Acceptance criteria

- **AC-1** `pnpm panes:compact` reports every pane on the live roster with a verdict from §4.1 and
  its position evidence.
- **AC-2** Pressure below the band yields `HOLD` regardless of position.
- **AC-3** CI-green-with-PR-unmerged yields `WAIT` at every pressure including critical.
- **AC-4** An input outside the §4.3 accept-set yields `UNDETERMINED` naming the offending field.
- **AC-5** A pane absent from the purview registry is reported unowned and is never driven.
- **AC-6** `--drive` without `--fire` sends nothing and prints the §5.2 sequence verbatim.
- **AC-7** `--fire` rejects `--all` and requires a named target.
- **AC-8** `--check` exits 0 / 1 / 2 per §5.3, and exit 2 is never emitted as an all-clear.
- **AC-9** The purview registry is read from `~/.claude/pane-purview/`, never from the worktree.
- **AC-10** The classifier is enrolled in the source-mutation registry with an empty
  unaccepted-survivor set.
- **AC-11** A pane in the critical band (§4.1) yields `FORCE` at every position except the hard
  `WAIT` row of §4.2, and a pane below eligibility yields `HOLD` without position being consulted.
- **AC-12** The `docs/agents/` write-up and the AGENTS.md pointer exist, and the meta-test in §10
  fails when either drifts from the other.

---

## 10. Documentation deliverable

The durable contract is repo-tracked, cross-CLI, and split the way this project already splits its
process rules — the full write-up loads on demand, AGENTS.md carries only a pointer, and neither
restates the other, because two copies drift.

```
docs/agents/orchestrator-pane-compaction.md   # NEW: the protocol, the bands, the probe findings
AGENTS.md                                     # + short pointer under cross-cutting discipline
tests/docs/                                   # + meta-test pinning the pointer against the write-up
```

The meta-test follows `tests/docs/_metaAgentsMarkerContract.test.ts`: literal, narrow assertions
that pin the specific sentences which can drift, one per edit — not a model of the prose. It
asserts the AGENTS.md pointer names the write-up path, that the write-up states the double-Esc
requirement (P2 is the finding most likely to be "simplified" away by a later editor), and that
neither document states a band value contradicting §4.1.

---

## 11. Out of scope

- Session-side compaction discipline (arc sessions keeping their own marker current). Explicitly
  deferred by user decision; this spec is orchestrator-side only.
- Any `PreCompact` or `SessionStart[compact]` hook. Both are per-machine `~/.claude/` config, not
  repo state, and §2.1 leaves `PreCompact` blocking undetermined.
- Changing the auto-compaction threshold via `/autocompact`.
- Compacting the orchestrator itself.
