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

Each row was settled during brainstorming, by the probe in §3, or by spec round 1. Verify the
citation; do not re-derive.

| Decision | Ratification |
| --- | --- |
| A session cannot compact **itself**; `/compact` is human-typed and auto-compaction is threshold-driven. Self-compaction is not a design option. | §2.1 |
| The audience is **orchestrator sessions driving other panes**, not arc sessions disciplining themselves. Session-side "keep the marker current" guidance is out of scope. | §11, user decision 2026-08-16 |
| Purview is a **registry file** written at dispatch time, not derived from `pnpm ledger:claims` (`scripts/ledger-claims.ts:10-14`). Ledger derivation misses arcs with no `BL-`/`DEF-` row, which AGENTS.md invariant 12 declares legitimate. | §5.4, user decision 2026-08-16 |
| `agent_status: working` is the **compliant** steady state for an arc, not a hazard. AGENTS.md forbids ending a turn mid-pipeline, so gating on `idle` would select only arcs that are blocked, finished, or stalled. | `AGENTS.md` § "Never end your turn mid-pipeline" |
| The driver **never fires without an explicit flag**, and never on a stale verdict. | §5.3, §5.5 |
| Ranking is two-factor — pressure gates eligibility, position selects the moment. | §4 |
| `PreCompact` hook blocking is **undetermined**; the design does not depend on it. | §2.1 |
| Bands are integers in tenths, not a float fraction. A float weight is unattackable by every declared mutation operator (`tests/mutation/source/operators.ts:17`), which would put the band constants outside the closure set. | §4.2 |
| **Waiting on `idle` after compaction is correct, and P6's `done` does not contradict it.** `herdr agent wait --status done` is refused by the tool itself: `"done is a UI attention state; use idle for CLI agent completion waits"`. Recorded so a later round does not re-derive it. | §3, §5.2 |
| This spec ships **no UI** — nothing under `app/` or `components/`, no tokens, no CSS — so AGENTS.md invariant 8's impeccable dual-gate does not apply. No DB, no migrations, no advisory locks. | §9 scope statement below |

**Scope statement (referenced by the row above).** The complete file manifest is §5.1 and §10. No
entry falls under the UI tree (`app/` excluding `app/api/`, or `components/`), the design-token
files, `supabase/migrations/`, or any `pg_advisory*` call site.

<!-- spec-lint: not-ui — the UI paths named above appear only in this no-UI scope statement; the §5.1 and §10 manifests contain no UI file. -->

The UI paths are named here because the scope statement has to identify what it excludes. That
citation is what trips automatic UI-spec detection (`lib/specLint/sections.ts:17-20`), hence the
waiver directly above it.

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
| Model can detect a compaction occurred, or read its own distance to the threshold | **Not documented** |
| `/autocompact` command exists ("set automatic compaction thresholds") | Documented; details not documented |

Two consequences: the orchestrator cannot prevent an auto-compaction, only preempt it; and the
target cannot self-report its pressure, so pressure is read from outside (§3.7).

### 2.2 herdr primitives

Measured against the installed CLI (`herdr <subcommand> --help`, 2026-08-16). herdr is an external
binary, not repo state, so these are command citations rather than `file:line`.

| Command | Contract |
| --- | --- |
| `herdr agent list` | The roster. Arc panes carry their branch as the agent `name` (AGENTS.md's mandatory pane + agent naming rule). |
| `herdr agent get <target>` | Includes `agent_status` and `pane_id`. |
| `herdr agent read <target> --source visible --lines N` | Rendered screen text. |
| `herdr agent wait <target> --status <idle\|working\|blocked\|unknown> --timeout MS` | **`done` is rejected**: `"done is a UI attention state; use idle for CLI agent completion waits"`. |
| `herdr agent send <target> <text>` | Writes **literal** text; no submit. |
| `herdr pane close <pane_id>` | Closes a pane. |

`agent_status` observed on the live roster additionally includes `done`, which `agent list` emits
but `agent wait` will not accept as a target. `\r` submits in the Claude TUI; `\n` inserts a
newline and does not submit.

---

## 3. Probe findings (empirical, 2026-08-16)

Per the mandatory empirical-spike rule in `docs/agents/spec-self-review.md:21`, the input and
interrupt semantics below were **measured, not reasoned about**. The environment was constructed
rather than interrogated: a throwaway `claude` pane started with `herdr agent start compact-probe
--cwd <scratch> --no-focus -- claude`, driven through 300-400 second `bash` loops so every
interrupt landed **mid-tool-call** — the risky case. No live arc was touched; the probe pane was
closed at the end of the run.

| ID | Finding | Measured under | Evidence |
| --- | --- | --- | --- |
| **P1** | Input sent to a `working` pane **queues**; it does not execute mid-turn, and status stays `working`. | `agent_status: working`, mid-tool-call | `❯ QUEUED-PROBE-A` above `❯ Press up to edit queued messages`; `status: working` |
| **P2** | With vim mode on, the **first Esc is consumed leaving INSERT mode** and does nothing else. | vim mode enabled | `-- INSERT --` clears; `tick-18` still advancing; `status: working` |
| **P3** | The **next Esc interrupts**, killing the in-flight tool call. | vim mode enabled, mid-tool-call | `⎿ Interrupted · What should Claude do instead?`; `⏺ Command rejected. Stopped.` |
| **P4** | A message queued **before** the interrupt fires **immediately** as the next turn. | queue present at interrupt | `❯ QUEUED-PROBE-A` consumed and answered in the same screen as the interrupt |
| **P5** | A queued **slash command** survives that path and executes as a command. | queue present at interrupt | `✻ Compacting conversation… (7s · ↑ 127 tokens)` → `⎿ Compacted` |
| **P6** | After compaction the session does **not** auto-resume; it settles at `agent_status: done`. | post-compaction | `status: done` stable 20s+; `pgrep -fl 'echo beat-'` empty |

**What P2 does and does not establish.** It was measured with vim mode **on**. The behavior with
vim mode off was not probed, and the spec makes no claim about it. §5.2 therefore does not assume a
fixed Esc count: it sends one Esc, re-reads status, and sends another only if the target is still
`working`. That removes the unprobed claim from the design rather than documenting around it.

### 3.7 Context pressure is externally readable

The gauge renders on every pane and parses out of `herdr agent read`. Four gauges observed on the
live roster:

```
chore/heavy-orphan-reaper        Opus 5 ctx ███░░    (2h39m single turn, 353.1k tokens)
fix/scanner-scope-totality       Opus 5 ctx █▓░░░
bl-mediums-orchestrator          Opus 5 ctx ██░░░
smalls-batch-orchestrator        Opus 5 ctx █░░░░
```

This is a **direct readout**, unlike arc position, which is inferred (§4.4). It is the crisp signal
answering the weaker question, which is why it is the trigger and not the selector.

### 3.8 What the probe changed

The pre-probe protocol was `Esc → checkpoint → /compact → resume`. P4 makes that wrong: after an
interrupt with nothing queued, the target sits at "What should Claude do instead?" — an extra
round-trip, and a window in which the target's own cron nudge could start work the orchestrator is
about to interrupt again. The corrected protocol queues the checkpoint **first** and uses the
interrupt to detonate it (§5.2).

---

## 4. Classification

The classifier is a **total function** from an observed pane to exactly one verdict. Totality and
mutual exclusion come from an ordered rule list evaluated top to bottom, first match wins (§4.5) —
not from the tables in §4.2 and §4.4, which are inputs to that list rather than a classification in
themselves.

### 4.1 Verdicts

| Verdict | Meaning |
| --- | --- |
| **UNDETERMINED** | Safety could not be established. Never an implicit all-clear, never drivable. |
| **HOLD** | Do nothing; pressure is below the eligibility band. |
| **WAIT** | Eligible, but at an expensive position — or a precondition is unmet. Carries its reason. |
| **COMPACT** | Eligible and at a cheap position. Drivable. |
| **FORCE** | Critical pressure; take the best position available now. Drivable. |

`FORCE` exists only because auto-compaction is the competitor: without it the classifier would sit
on `WAIT` while the threshold fired underneath it. A deliberate compaction at a mediocre position
still beats an automatic one at a random position, because the checkpoint happens either way.

### 4.2 Pressure bands, in tenths

The gauge renders five cells, each full (`█`), half (`▓`), or empty (`░`) — readable resolution
10%. Pressure is the **integer** `t = 2 × full + half`, in `0..10`.

| Band | Range | Meaning |
| --- | --- | --- |
| Below eligibility | `t < 5` | position is not consulted |
| Eligible | `5 <= t < 8` | position decides |
| Critical | `t >= 8` | `FORCE`, subject to §4.5 precedence |

Integers deliberately: every band constant is then an `integer-literal` site and every comparison a
`relational-boundary` site, both inside the declared mutation operator set
(`tests/mutation/source/operators.ts:17`). A float weight would sit outside every declared
operator, so the thresholds could not be attacked at all.

Of the four gauges in §3.7, three are below eligibility and one (`███░░`, `t = 6`) is eligible.

### 4.3 Accept-set

The classifier keys on **structure**, never on spelling. It accepts:

- `agent_status` ∈ {`idle`, `working`, `blocked`, `done`, `unknown`} — the enum `herdr` emits.
- A gauge parseable to `t` ∈ `0..10`.
- Marker fields in AGENTS.md's declared shape (`branch`, `stage`, `tasksRemaining`, `next`,
  `blockedOn`, `cronJobId`, `sessionId`).
- Git state: porcelain status, commits ahead of `origin/main`, last commit timestamp.
- `gh pr checks` state for the branch, or a determinate "no PR".

Anything outside the accept-set yields `UNDETERMINED` **naming the offending field**. Terminal
titles and pane labels are display strings, never parsed for meaning; the branch comes from the
agent `name` matched against `git worktree list`.

### 4.4 Position cost

Position is **inferred**, so the report shows its evidence per pane rather than asserting a tier,
and an operator can overrule it. Evaluated as an ordered list, first match wins, so it is total
over every pane that reaches it and no pane matches two rows.

| # | Position | Predicate | Cost |
| --- | --- | --- | --- |
| 1 | CI green, PR unmerged | PR open ∧ all checks green | **Hard `WAIT`** |
| 2 | Mid-task, tree dirty | working tree not clean | High |
| 3 | Triage pending | review out-dir mtime newer than newest commit | High |
| 4 | Polling CI | PR open ∧ any check pending | Low |
| 5 | Review verdict recorded | clean ∧ a `docs/review-rounds/**` row newer than the previous commit | Low |
| 6 | Task boundary | clean ∧ newest commit within the recency window | Lowest |
| 7 | **Fallback: quiescent** | clean, no PR, commit older than the window | Low |

Row 7 is the totality guarantee: a clean old worktree with no PR — the state round 1 identified as
matching no row — lands here rather than falling through. "Mid class-sweep" was **removed**: it had
no observable signal in the accept-set, so it could never have been evaluated.

Row 1 is a hard `WAIT` at every pressure including critical. AGENTS.md makes merge the same-turn
successor of CI-green, and PR #482 sat `CLEAN` and unmerged for five hours on exactly this gap.

### 4.5 Precedence

Ordered; first match wins. This resolves the round-1 conflict where a below-band pane with a
missing marker field satisfied both "always `HOLD`" and "always `UNDETERMINED`".

1. Input outside the accept-set (§4.3) → **UNDETERMINED**, naming the field.
2. Pane claimed by more than one purview registry (§5.4) → **UNDETERMINED**, contested.
3. Pane not in this orchestrator's purview → **UNDETERMINED**, unowned.
4. `agent_status` ∈ {`blocked`, `unknown`}, or the target's `blockedOn` is non-empty → **WAIT**.
5. Position row 1 (CI green, PR unmerged) → **WAIT**, regardless of pressure.
6. Mid-tool-call not positively excluded (§5.5) → **WAIT**.
7. Pressure `t < 5` → **HOLD**.
8. Pressure `t >= 8` → **FORCE**.
9. Position cost Low or Lowest → **COMPACT**; otherwise → **WAIT**.

**Validation precedes banding**, so no pane can satisfy two terminal rules.

---

## 5. The surface

### 5.1 Module and CLI shape

Following the `ledger:claims` precedent (`scripts/ledger-claims.ts`,
`scripts/lib/ledger-claims-core.ts`):

```
scripts/lib/pane-compaction-core.ts   # NEW: importable classifier, pure over an injected surface
                                      #      (roster, git, gh, filesystem, clock)
scripts/pane-compaction.ts            # NEW: thin CLI adapter
package.json                          # + "panes:compact" alias
```

The module/adapter split is **required, not stylistic**: AGENTS.md's convergence criterion requires
a detector surface to be enrolled in the source-mutation registry
(`tests/mutation/source/registry.ts:12-38`) before its first review dispatch, and the runner
overlays a target only when a Vitest suite imports it. A terminal CLI script cannot be enrolled.

### 5.2 The protocol

Preconditions are **per `agent_status`**, because P1 measured queueing only for `working`. Each
step cites the finding that justifies it, or states that it rests on none.

**Precondition.** The target's verdict, recomputed at drive time (§5.5), is `COMPACT` or `FORCE`.
`agent_status` is `working`, `idle`, or `done`; `blocked` and `unknown` never reach here (§4.5
rule 4).

```
A. working — queue, then detonate
   1. send <CHECKPOINT_TEXT>; send $'\r'        # queues, does not execute        [P1]
   2. send $'\x1b'                              # may only leave INSERT mode      [P2]
   3. re-read status; if still `working`, send $'\x1b' again  # interrupt         [P3]
      repeat at most 3 times, then give up and report WAIT
   -> the queued checkpoint detonates immediately                                [P4]

B. idle | done — no interrupt needed, nothing to detonate
   1. send <CHECKPOINT_TEXT>; send $'\r'        # executes directly; no queueing claim

Both paths then:
   4. wait --status idle                        # `done` is rejected by the tool  (§2.2)
   5. send '/compact'; send $'\r'                                                 [P5]
   6. wait --status idle
   7. send <RESUME_TEXT>; send $'\r'                                              [P6]
```

Step 3 makes the Esc count **adaptive**, so the design carries no claim about vim-mode-off
behavior. Steps 4 and 6 wait on `idle` rather than `done` because `herdr agent wait` refuses `done`
outright (§2.2) — P6's terminal `done` is a UI attention state, not a competing completion signal.

**Step 1 is the load-bearing step.** Post-interrupt is definitionally mid-task, so the summary is
generated from a conversation ending mid-action, and "what I was about to do next" is exactly what
is least represented. The checkpoint moves that intent to disk *before* the summarizer runs.

**The checkpoint does NOT commit.** AGENTS.md invariant 1 permits a task commit only after the
minimal implementation passes its test, and an interrupted target is by construction mid-task. The
checkpoint writes the marker only — which is gitignored, so it dirties nothing — and leaves the
working tree exactly as the interrupt found it. A dirty tree survives compaction perfectly well;
it is on disk. No exception to invariant 1 is requested or required.

**The literal texts**, so AC-6's byte-for-byte assertion has an authoritative expected value:

```
CHECKPOINT_TEXT:
Checkpoint before compaction. Do not commit. Update .claude/ship-state.json in your worktree:
set `stage` to where you actually are, and set `next` to the literal command or action that
resumes this work. Leave the working tree exactly as it is. Then stop and say CHECKPOINT WRITTEN.

RESUME_TEXT:
Run `date` first; the shell clock is the only source of truth. Discard any stale blocked or
standing-down framing. Re-read .claude/ship-state.json in your worktree and resume its `next`
action immediately, in this turn. You were compacted by the orchestrator; approval already
given, do not re-ask.
```

**Step 7 does not delegate to the target's cron nudge.** Those jobs live in session memory and no
external observer can verify Stage 0 ever registered one. Sending the resume explicitly removes the
dependency on unverifiable state.

### 5.3 Modes

| Invocation | Behavior | Exit |
| --- | --- | --- |
| `pnpm panes:compact` | Report: pane, branch, `t`, verdict, position evidence. | 0 |
| `pnpm panes:compact --json` | Envelope `{status, degraded, panes}`. Never capped. | 0 |
| `pnpm panes:compact --check` | 0 = nothing to do · 1 = at least one COMPACT/FORCE · 2 = untrusted | 0/1/2 |
| `pnpm panes:compact --drive <target>` | **Dry run by default** — prints the §5.2 keystrokes, sends nothing. | 0 |
| `pnpm panes:compact --drive <target> --fire` | Executes §5.2 subject to §5.5. | 0/1 |

`--fire` never accepts `--all`; one named target per invocation. Exit 2 means the check could not
establish safety and is never read as an all-clear — the convention `ledger:claims --check` already
establishes (`scripts/ledger-claims.ts:10-14`).

### 5.4 Purview

Written at dispatch time; one row per pane the orchestrator dispatched (`paneId`, `agentName`,
`branch`, `dispatchedAt`).

```
~/.claude/pane-purview/<orchestratorSessionId>.json   # NEW: per-orchestrator, outside any worktree
```

**Outside the worktree, deliberately.** AGENTS.md records the ship-gate's state file dirtying the
very tree it was measuring, resetting the counter every run so the gate could never stand down.
Purview state has the same shape and takes the same placement.

**Disk-backed, deliberately.** The orchestrator is itself subject to compaction, and an in-context
list of "panes I dispatched" is exactly what a compaction eats.

**Ownership is detected, not enforced.** Nothing stops two orchestrators writing the same `paneId`
into their own session-named files. The classifier therefore reads **every** file in
`~/.claude/pane-purview/`, and a pane claimed by more than one yields `UNDETERMINED` (contested,
§4.5 rule 2) — reported to both orchestrators rather than driven by either. This is a collision
*report*, not a lock: two orchestrators reading simultaneously before either writes can still both
proceed. That residual race is §7 limit 7, and it is why `--fire` revalidates (§5.5) instead of
trusting classification.

A pane absent from every registry is reported unowned and is never driven. A registry row whose
pane is gone from the roster is reported stale.

### 5.5 Drive-time revalidation

Classification can be arbitrarily stale by the time `--fire` runs: panes change state continuously.
So `--fire` **recomputes the full verdict immediately before step 1** and refuses unless:

1. the fresh verdict is `COMPACT` or `FORCE`;
2. purview still resolves to this orchestrator, uncontested;
3. the visible screen positively establishes the target is **not** mid-tool-call.

Condition 3 is stated as a **positive** requirement on purpose. Round 1 correctly observed that a
heuristic which interrupts unless it recognizes a file-writing shape converts an unrecognized write
into a truncated file — silent corruption, contradicting §6. Inverted, an unrecognized screen is a
failure to establish condition 3, which demotes to `WAIT` with a surfaced reason. The worst case is
then a pane that never gets compacted by the orchestrator and auto-compacts on its own schedule,
which is the pre-existing behavior, not a regression.

A refusal at any condition exits 1 naming the condition, and sends nothing.

---

## 6. Convergence criterion

Per AGENTS.md, a detector brief states all three or the dispatch is blocked at round 1.

**Consequence bound.** Every pane is classified correct or signaled — never silently wrong. A pane
is classified correctly, or reported `UNDETERMINED`/`WAIT` with the reason named; it is never
driven on a verdict the classifier could not establish. A worst case of conservative demotion plus
a surfaced reason is a **documented limit**, not a finding.

**Probe domain.** Admissible probes come from the live `herdr agent list` roster on this machine
and the fixture corpus at `tests/paneCompaction/fixtures/`. A constructed roster outside that set,
or more than one ordinary edit from an input in it, files to §7.

**Threat-model fence.** The classifier defends against an orchestrator misreading its own pane
roster in ordinary operation. A forged marker, a hostile agent label, or a pane deliberately
rendering a fake gauge is out of scope and files to §7.

**Score.** Enrolled in `tests/mutation/source/registry.ts` before the first diff dispatch; the
round-1 diff brief carries the score and an empty unaccepted-survivor set on its `GUARD SURFACE:`
line.

---

## 7. Documented limits

Each is a deliberate boundary whose worst case is conservative behavior plus a surfaced signal —
consistent with §6, not an exception to it.

1. **A pane whose screen cannot be positively classified is never driven.** §5.5 condition 3 fails
   closed, so the cost is a missed compaction, not a truncated file. The orchestrator surfaces the
   reason; the pane auto-compacts on its own schedule as it does today.
2. **Position is inferred and can be wrong.** The report shows evidence so an operator can
   overrule; the classifier never claims certainty it lacks.
3. **The gauge resolution floor is 10%** (§4.2). Thresholds finer than one half-cell are not
   representable and must not be specified.
4. **Auto-compaction cannot be prevented, only preempted.** `PreCompact` blocking is undocumented
   (§2.1). A target can auto-compact between classification and drive; §5.5's revalidation bounds
   the consequence to a wasted invocation.
5. **A pane whose Stage 0 agent label was never set is invisible to the roster.** Reported as
   unlabeled, never silently omitted, but not drivable.
6. **Vim-mode state is never read.** §5.2 step 3 adapts instead, so no configuration claim is made.
7. **Purview collision detection is a report, not a lock.** Two orchestrators that both read before
   either writes can both proceed (§5.4). §5.5's revalidation narrows but does not close the
   window. Closing it needs an atomic claim, which is deferred — the failure mode is two
   checkpoint prompts and two compactions on one pane, both of which the target tolerates.
8. **Cross-account panes.** The roster spans workspaces, so an orchestrator in one account can see
   panes in another. Purview reporting is the only thing separating them; there is no
   account-level enforcement.

---

## 8. Testing

| Surface | Mechanism |
| --- | --- |
| Precedence order (§4.5) | One case per rule, plus the round-1 conflict case: below-band pane with a missing marker field must yield `UNDETERMINED`, not `HOLD`. |
| Bands (§4.2) | Both boundaries (`t = 5`, `t = 8`) asserted at the `>=` sense, plus all four §3.7 gauges. |
| Position totality (§4.4) | One case per row **and** a case for row 7, proving no accepted pane falls through. A property test asserts exactly one row matches. |
| Hard `WAIT` | CI-green-unmerged at critical pressure, proving pressure cannot override. |
| Accept-set | Unknown status, unparseable gauge, marker missing a declared field — each reported by name. |
| Purview | Unowned reported not omitted; stale reported; **contested pane yields `UNDETERMINED`**. |
| Revalidation (§5.5) | Verdict fresh at classification but stale at drive → refuses, exits 1, sends nothing. |
| CLI envelope | `--json` never capped (fixture larger than any plausible cap; the live roster is ~12 panes, too small to fail against the mutant it names); `--check` exit codes 0/1/2. |
| Keystroke sequence | Dry-run output asserted byte-for-byte against §5.2 including `CHECKPOINT_TEXT` and `RESUME_TEXT`; the adaptive-Esc loop asserted for 1, 2, and give-up cases. |
| No-commit contract | The checkpoint text is asserted to instruct against committing — the invariant-1 conflict round 1 found. |
| Prose pinning | `tests/docs/` meta-test following `tests/docs/_metaAgentsMarkerContract.test.ts`. |
| Mutation | `tests/mutation/source/registry.ts`; score in the round-1 diff brief. |

Every guard states its premise executably with `premise` (`tests/_shared/premise.ts:26`) or
`premiseHolds` (`tests/_shared/premise.ts:36`), unconditionally relative to what it guards, and
proven on the case's own inputs.

---

## 9. Acceptance criteria

- **AC-1** `pnpm panes:compact` reports every roster pane with a verdict and its position evidence.
- **AC-2** Pressure `t < 5` yields `HOLD`, **provided validation (§4.5 rules 1-6) passed**.
- **AC-3** CI-green-with-PR-unmerged yields `WAIT` at every pressure including critical.
- **AC-4** Input outside the §4.3 accept-set yields `UNDETERMINED` naming the field, and this
  precedes banding, so AC-2 and AC-4 cannot both claim the same pane.
- **AC-5** A pane absent from every purview registry is reported unowned and never driven; a pane
  in two registries yields `UNDETERMINED` contested.
- **AC-6** `--drive` without `--fire` sends nothing and prints the §5.2 sequence verbatim.
- **AC-7** `--fire` rejects `--all` and requires a named target.
- **AC-8** `--check` exits 0 / 1 / 2 per §5.3; exit 2 is never emitted as an all-clear.
- **AC-9** The registry is read from `~/.claude/pane-purview/`, never from a worktree.
- **AC-10** Enrolled in the source-mutation registry with an empty unaccepted-survivor set.
- **AC-11** Pressure `t >= 8` yields `FORCE` except under §4.5 rules 1-6.
- **AC-12** The `docs/agents/` write-up and the AGENTS.md pointer exist and the §10 meta-test fails
  when either drifts.
- **AC-13** `--fire` recomputes the verdict immediately before sending and refuses, exiting 1
  without sending, when any §5.5 condition fails.
- **AC-14** The checkpoint never instructs a commit, and the driver itself never commits.

---

## 10. Documentation deliverable

The durable contract is repo-tracked and cross-CLI, split the way this project already splits its
process rules — the write-up loads on demand, AGENTS.md carries a pointer, and neither restates the
other, because two copies drift.

```
docs/agents/orchestrator-pane-compaction.md   # NEW: protocol, bands, probe findings
AGENTS.md                                     # + pointer under cross-cutting discipline
tests/docs/                                   # + meta-test pinning pointer against write-up
```

Following `tests/docs/_metaAgentsMarkerContract.test.ts`: literal, narrow assertions pinning the
sentences that can drift, one per edit. It asserts the pointer names the write-up path, that the
write-up states the **adaptive** Esc loop (§5.2 step 3 — the step most likely to be "simplified"
into a fixed count by a later editor), that the checkpoint's no-commit contract is stated, and that
neither document carries a band value contradicting §4.2.

---

## 11. Out of scope

- Session-side compaction discipline (arc sessions keeping their own markers current).
- Any `PreCompact` or `SessionStart[compact]` hook — per-machine `~/.claude/` config, not repo
  state, and `PreCompact` blocking is undetermined (§2.1).
- Changing the auto-compaction threshold via `/autocompact`.
- Compacting the orchestrator itself.
- An atomic purview claim (§7 limit 7).
