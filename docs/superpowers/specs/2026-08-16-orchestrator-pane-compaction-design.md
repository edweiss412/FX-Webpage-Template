# Orchestrator pane compaction — design

**Status:** DRAFT · **Date:** 2026-08-16 · **Branch:** `feat/orchestrator-pane-compaction`

An orchestrator session compacts the arc panes under its purview: it ranks eligible panes by
context pressure, selects the moment by arc position, and queues a checkpoint-then-compact
sequence onto the target pane through `herdr`.

---

## 1. Purpose

Context compaction is not something a Claude Code session can elect for itself. `/compact` is a
human-typed slash command and auto-compaction fires at a threshold the session neither observes
nor chooses (§2.1). For a long-running arc, that means every compaction it ever experiences
happens at a position selected by nothing at all — frequently mid-task, with triage decisions,
sweep results, and "what I was about to do next" living only in context.

An orchestrator session can do better, because it can see and drive other panes. This spec defines
the surface that lets it: a read-only classifier over the live pane roster, and a driver that
checkpoints a target's state to disk and compacts it at a position the orchestrator chose.

**The value is entirely in beating auto-compaction to the punch.** Position is the purpose;
pressure is only the trigger. A design that ranks by pressure alone has inverted the two.

### 1.1 Resolved scope — do not relitigate

Each row was settled during brainstorming, by the probes in §3, or by a review round. Verify the
citation; do not re-derive.

| Decision | Ratification |
| --- | --- |
| A session cannot compact **itself**; `/compact` is human-typed and auto-compaction is threshold-driven. | §2.1 |
| The audience is **orchestrator sessions driving other panes**. Session-side self-discipline is out of scope. | §11, user decision 2026-08-16 |
| Purview is a **registry file**, not derived from `pnpm ledger:claims` (`scripts/ledger-claims.ts:10-14`); ledger derivation misses arcs with no `BL-`/`DEF-` row, which invariant 12 declares legitimate. | §5.4, user decision 2026-08-16 |
| `agent_status: working` is the **compliant** steady state for an arc, not a hazard. | `AGENTS.md` § "Never end your turn mid-pipeline" |
| The driver **never sends without an explicit flag**, and never on a stale verdict. | §5.3, §5.5 |
| Ranking is two-factor — pressure gates eligibility, position selects the moment. | §4 |
| `PreCompact` hook blocking is **undetermined**; the design does not depend on it. | §2.1 |
| Bands are integers in tenths. A float weight is unattackable by every declared mutation operator (`tests/mutation/source/operators.ts:17`), which would put the band constants outside the closure set. | §4.2 |
| **Waiting on `idle` is correct; P6's terminal `done` does not contradict it.** `herdr agent wait --status done` is refused by the tool: `"done is a UI attention state; use idle for CLI agent completion waits"`. Recorded so a later round does not re-derive it. | §2.2, §3 |
| **The driver never interrupts.** Round 2 found four defects on the interrupt's race surface; it was removed rather than patched a third time, per the three-round prose cap (`docs/agents/spec-self-review.md:22`). Esc, the adaptive-Esc loop, and the mid-tool-call screen heuristic are all gone. Do not propose reinstating them without a probe showing queue-and-wait is insufficient. | §3.8, §5.2 |
| This spec ships **no UI** — nothing under the UI tree, no tokens, no CSS — so invariant 8's impeccable dual-gate does not apply. No DB, no migrations, no advisory locks. | the scope statement immediately below |

**Scope statement.** The complete file manifest is §5.6. No entry falls under the UI tree (`app/`
excluding `app/api/`, or `components/`), the design-token files, `supabase/migrations/`, or any
`pg_advisory*` call site.

<!-- spec-lint: not-ui — the UI paths named above appear only in this no-UI scope statement; the §5.6 manifest contains no UI file. -->

The UI paths are named because a scope statement has to identify what it excludes. That citation is
what trips automatic UI-spec detection (`lib/specLint/sections.ts:17-20`), hence the waiver.

---

## 2. Background facts

### 2.1 Harness facts (documentation review, 2026-08-16)

| Fact | State |
| --- | --- |
| `/compact` is a user-typed slash command; the model has no tool for it | Documented |
| Auto-compaction fires automatically near the context limit | Documented |
| `PreCompact` hook exists, matchers `manual` \| `auto` | Documented |
| `PreCompact` can **block** a compaction | **Not documented** — design must not rely on it |
| `SessionStart` accepts a `compact` matcher; its stdout is injected post-compaction | Documented |
| Model can detect a compaction occurred, or read its distance to the threshold | **Not documented** |
| `/autocompact` exists ("set automatic compaction thresholds") | Documented; details not documented |

The orchestrator cannot prevent an auto-compaction, only preempt it; and the target cannot
self-report its pressure, so pressure is read from outside (§3.7).

### 2.2 herdr primitives

Measured against the installed CLI (`herdr <subcommand> --help`, 2026-08-16). herdr is an external
binary, not repo state, so these are command citations rather than `file:line`.

| Command | Contract |
| --- | --- |
| `herdr agent list` | The roster. Arc panes carry their branch as the agent `name`. `agent_session` is **optional** (§3.9). |
| `herdr agent get <target>` | `agent_status`, `pane_id`. |
| `herdr agent read <target> --source visible --lines N` | Rendered screen text. |
| `herdr agent wait <target> --status <idle\|working\|blocked\|unknown> --timeout MS` | **`done` is rejected**: `"done is a UI attention state; use idle for CLI agent completion waits"`. |
| `herdr agent send <target> <text>` | Writes **literal** text; no submit. |

`agent_status` observed on the live roster also includes `done`, which `agent list` emits but
`agent wait` will not accept as a target. `\r` submits in the Claude TUI; `\n` does not.

---

## 3. Probe findings (empirical, 2026-08-16)

Per the mandatory empirical-spike rule (`docs/agents/spec-self-review.md:21`), input semantics were
**measured**. The environment was constructed rather than interrogated: a throwaway `claude` pane
(`herdr agent start compact-probe --cwd <scratch> --no-focus -- claude`) driven through 300-400
second `bash` loops. No live arc was touched; the pane was closed afterwards.

| ID | Finding | Measured under | Evidence |
| --- | --- | --- | --- |
| **P1** | Input sent to a `working` pane **queues**; it does not execute mid-turn, and status stays `working`. | `working`, mid-tool-call | `❯ QUEUED-PROBE-A` above `❯ Press up to edit queued messages`; `status: working` |
| **P5** | A queued **slash command** executes as a command when the queue drains. | queue drained by an interrupt | `✻ Compacting conversation…` → `⎿ Compacted` |
| **P6** | After compaction the session does **not** auto-resume; it settles at `done`. | post-compaction | `status: done` stable 20s+; `pgrep -fl 'echo beat-'` empty |

**P2, P3 and P4 are retired.** They measured Esc semantics (vim-mode consumption, interrupt, and
queue detonation), and §5.2 no longer sends Esc. They remain in the branch history at commit
`6afa333a5` should the decision ever be revisited.

**What P1 does and does not establish.** It was measured on a pane that was **mid-tool-call**.
Queueing was not separately measured for a `working` pane between tool calls. §5.2 therefore makes
no distinction: it queues to any `working` pane and waits for `idle`, so both sub-states take the
identical path and the unmeasured one carries no separate claim. **P5 was observed with the queue
drained by an interrupt**, not by natural turn completion; §7 limit 1 records that residual.

### 3.7 Context pressure is externally readable

Four gauges observed on the live roster:

```
chore/heavy-orphan-reaper        Opus 5 ctx ███░░    (2h39m single turn, 353.1k tokens)
fix/scanner-scope-totality       Opus 5 ctx █▓░░░
bl-mediums-orchestrator          Opus 5 ctx ██░░░
smalls-batch-orchestrator        Opus 5 ctx █░░░░
```

A **direct readout**, unlike arc position, which is inferred (§4.4).

### 3.8 What the probes changed

The pre-probe protocol was `Esc → checkpoint → /compact → resume`. P1 showed input to a `working`
pane queues rather than being dropped — which means the interrupt was never required to *deliver*
the checkpoint, only to make it fire sooner. Round 2 then found four separate defects on the
interrupt's race surface (interrupting the checkpoint it had just detonated; an unbounded window
between reading the screen and sending; a mid-tool-call exclusion with no accept-set; and a
documented limit that permitted silent truncation). The interrupt was **removed**, and all four
became unreachable. §5.2 now queues and waits.

### 3.9 Roster resolution (live-roster probes)

| Probe | Result |
| --- | --- |
| Agent name resolves to a branch in `git worktree list` | 10 of 12; the 2 that do not are `smalls-batch-orchestrator` and `bl-mediums-orchestrator`, which have no worktree because they dispatch arcs rather than being one (§4.1 `NOT-AN-ARC`) |
| Marker readable cross-worktree | Yes — `heavy-orphan-reaper` `stage=plan`, `scanner-scope-totality` `stage=review`, `modal-wait-helper-adoption` `stage=implementation` |
| Marker `sessionId` matches pane `agent_session.value` | 9 of 10; `chore/mutation-gate-sharding` reports **no** `agent_session` (status `done`) while its marker still names `bfea4e59` (§4.5 rule 4) |
| `gh pr checks` with no PR | Exits **1**, empty stdout, stderr `no pull requests found for branch "…"` — the same exit code as auth failure, network error, and rate limit (§4.5 rule 5) |

---

## 4. Classification

The classifier is a **total function** from an observed pane to exactly one verdict. Totality and
determinism come from an ordered rule list evaluated top to bottom, first match wins (§4.5).

### 4.1 Verdicts

| Verdict | Meaning |
| --- | --- |
| **NOT-AN-ARC** | The agent name resolves to no worktree branch. Outside the surface by construction; reported, never driven, and visually distinct from `UNDETERMINED`. |
| **UNOWNED** | Not in any purview registry, or in more than one (contested). Reported, never driven. |
| **UNDETERMINED** | Safety could not be established. Never an implicit all-clear, never driven. |
| **HOLD** | Pressure below the eligibility band. |
| **WAIT** | Eligible but at an expensive position, or a precondition is unmet. Carries its reason. |
| **COMPACT** | Eligible and at a cheap position. Drivable. |
| **FORCE** | Critical pressure; take the best position available now. Drivable. |

`NOT-AN-ARC` and `UNOWNED` are separated from `UNDETERMINED` because the live roster produces them
permanently and by construction (§3.9). Folding them into `UNDETERMINED` would put a standing pair
of orchestrator panes on every report as if they were unresolved faults.

### 4.2 Pressure bands, in tenths

Five cells, each full (`█`), half (`▓`), or empty (`░`) — resolution 10%. Pressure is the
**integer** `t = 2 × full + half`, in `0..10`.

| Band | Range | Meaning |
| --- | --- | --- |
| Below eligibility | `t < 5` | position not consulted |
| Eligible | `5 <= t < 8` | position decides |
| Critical | `t >= 8` | `FORCE`, subject to §4.5 |

Integers deliberately: every band constant is an `integer-literal` site and every comparison a
`relational-boundary` site, both inside the declared operator set
(`tests/mutation/source/operators.ts:17`). A float would sit outside every declared operator.

Of the four gauges in §3.7, three are below eligibility and one (`███░░`, `t = 6`) is eligible.

### 4.3 Accept-set

Keyed on **structure**, never spelling:

- `agent_status` ∈ {`idle`, `working`, `blocked`, `done`, `unknown`}.
- `agent_session.value` — **optional**; absent is a valid observation, not a parse failure (§3.9).
- A gauge parseable to `t` ∈ `0..10`.
- Marker fields in the declared shape (`branch`, `stage`, `tasksRemaining`, `next`, `blockedOn`,
  `cronJobId`, `sessionId`).
- Git state: porcelain status, commits ahead of `origin/main`, last commit timestamp.
- A round-corpus row (`stage`, `round`, `status`, `verdict`, `findingCount`). **Absent is normal**
  — an arc that never dispatched a review has no corpus file — and is read as `no review in
  flight`, not as a fault.
- A `gh` outcome, **in any of its three forms** — a parsed check state, the recognized no-PR
  signature (non-zero exit **and** stderr matching `no pull requests found for branch`), or a
  fault. All three are *accepted observations*; the accept-set does not classify them. **Rule 5
  alone decides what a fault produces** (§4.5), so that rule stays reachable and independently
  testable. Round 3 found the previous wording consuming faults here, which made rule 5 dead code.

Anything else yields `UNDETERMINED` **naming the offending field**. Terminal titles and pane labels
are display strings, never parsed for meaning.

### 4.4 Position cost

Position is **inferred**. The report shows its evidence per pane so an operator can overrule.

Evaluated as an ordered list, first match wins. **Predicates are not mutually exclusive and are not
claimed to be** — round 2 correctly showed that ordinary states match several (dirty + pending
matches rows 2 and 4; clean + pending + recent matches 4 and 6). Ordering is what makes selection
deterministic; exclusivity was an unnecessary claim and is withdrawn.

| # | Position | Predicate | Cost |
| --- | --- | --- | --- |
| 1 | CI green, PR unmerged | PR open ∧ all checks green | **Hard `WAIT`** |
| 2 | CI failing, PR open | PR open ∧ any check failed | High |
| 3 | Mid-task, tree dirty | working tree not clean | High |
| 4 | Triage pending | newest corpus row carries a non-APPROVE verdict ∧ no commit whose author date is **after that row's `endedAt`** | High |
| 5 | Polling CI | PR open ∧ any check pending | Low |
| 6 | Review verdict recorded | clean ∧ newest corpus row APPROVE | Low |
| 7 | Task boundary | clean ∧ newest commit within `RECENT_COMMIT_WINDOW` | Lowest |
| 8 | **Fallback: quiescent** | anything reaching here | Low |

`RECENT_COMMIT_WINDOW` is **15 minutes**, stated here so a change is a spec change rather than a
constant edit (the §4.2 precedent). Row 2 closes the failed-checks gap round 2 found. Row 8 is the
totality guarantee: it has no predicate, so no pane can fall through.

Row 1 is a hard `WAIT` at every pressure including critical. AGENTS.md makes merge the same-turn
successor of CI-green, and PR #482 sat `CLEAN` and unmerged for five hours on this gap.

**Inference error may only demote — within the eligible band.** Where two rows both match and the
ordering is uncertain, the classifier takes the **more expensive** cost, never the cheaper.

**This does not extend to the critical band, and §7 limit 2 no longer claims it does.** Rule 9
returns `FORCE` for `t >= 8` whatever the position cost, so at critical pressure a wrong inference
*can* produce a compaction at an expensive position. That is deliberate: at `t >= 8` the
alternative is not "no compaction", it is auto-compaction at a position nobody chose, which is
strictly worse. Row 1 (CI green, PR unmerged) remains the one position that outranks `FORCE`,
because there the correct action is to merge rather than to compact. Round 3 found the previous
wording asserting an unqualified demote-only bound that rule 9 contradicts.

### 4.5 Precedence

Ordered; first match wins. **Validation precedes banding**, so no pane reaches two terminal rules.

1. Agent name resolves to no worktree branch → **NOT-AN-ARC**.
2. Pane in no purview registry, or in more than one → **UNOWNED** (unowned / contested).
3. Input outside the accept-set (§4.3) → **UNDETERMINED**, naming the field.
4. Marker `sessionId` present and the pane's `agent_session.value` absent, or both present and
   differing → **UNDETERMINED**, naming the mismatch.
5. A `gh` outcome that is neither a parsed check state nor the recognized no-PR signature →
   **UNDETERMINED**, naming `gh`.
6. `agent_status` ∈ {`blocked`, `unknown`}, or the target's `blockedOn` is non-empty → **WAIT**.
7. Position row 1 (CI green, PR unmerged) → **WAIT**, regardless of pressure.
8. Pressure `t < 5` → **HOLD**.
9. Pressure `t >= 8` → **FORCE**.
10. Position cost Low or Lowest → **COMPACT**; otherwise → **WAIT**.

Rule 2 sits above rule 3 deliberately: ownership resolves from `paneId` alone and needs no marker,
so an unowned pane with a malformed marker is reported `UNOWNED` — which is what AC-5 requires, and
what round 2 found the previous ordering contradicting.

Rule 5 sits above every banding rule so a `gh` outage can never reach `COMPACT`/`FORCE`. Without
it, a failed `gh` reads as "no PR", which matches row 8 at Low cost and silently bypasses rule 7 on
exactly the panes most dangerous to compact.

---

## 5. The surface

### 5.1 Module and CLI shape

Following the `ledger:claims` precedent (`scripts/ledger-claims.ts`,
`scripts/lib/ledger-claims-core.ts`). The full manifest is §5.6.

The module/adapter split is **required, not stylistic**: the convergence criterion requires a
detector surface to be enrolled in the source-mutation registry
(`tests/mutation/source/registry.ts:12-38`) before its first review dispatch, and the runner
overlays a target only when a Vitest suite imports it. A terminal CLI script cannot be enrolled.

### 5.2 The protocol

**No interrupt.** Every step is a send or a wait.

**Precondition.** The verdict, recomputed at drive time (§5.5), is `COMPACT` or `FORCE`;
`agent_status` ∈ {`working`, `idle`, `done`} (rule 6 has already excluded the rest).

```
0. Record the marker's mtime and `next` value.
1. send <CHECKPOINT_TEXT>; send $'\r'
     working      -> queues, fires when the current turn ends            [P1]
     idle | done  -> executes directly
2. wait --status idle, timeout CHECKPOINT_TIMEOUT
     on timeout -> abort, exit 1, send nothing further.
     The queued checkpoint may still fire later; it only writes a marker,
     so an abort here is harmless.                                       (§7 limit 3)
3. VERIFY the checkpoint landed:
     marker mtime is newer than step 0 AND `next` is non-empty.
     not verified -> abort, exit 1, DO NOT COMPACT.
4. send '/compact'; send $'\r'                                           [P5]
5. wait --status idle, timeout COMPACT_TIMEOUT
6. send <RESUME_TEXT>; send $'\r'                                        [P6]
```

**Step 3 is the safety gate.** Round 2 found that waiting for `idle` proves only that a turn ended,
not that the checkpoint was written — and compacting an unverified target produces exactly the
context loss this feature exists to prevent. Verification reads the marker from disk; it does not
scrape the screen for an acknowledgement string.

**Step 1 is the load-bearing step.** Compaction summarizes a conversation; whatever is only in that
conversation is what the summary may lose. The checkpoint moves the target's intent to disk first.

**The checkpoint does NOT commit.** Invariant 1 permits a task commit only after the implementation
passes its test, and a target mid-task has not. The checkpoint writes the marker only — gitignored,
so it dirties nothing — and leaves the working tree exactly as it was. A dirty tree survives
compaction; it is on disk. No exception to invariant 1 is requested.

`CHECKPOINT_TIMEOUT` is **4 hours** and `COMPACT_TIMEOUT` is **10 minutes**. The first is long
because a queued checkpoint waits out the target's current turn, and turns of 2h39m are observed on
the live roster (§3.7).

**The literal texts**, so AC-6's byte-for-byte assertion has an authoritative expected value:

```
CHECKPOINT_TEXT:
Checkpoint before compaction. Do not commit. Update .claude/ship-state.json in your worktree:
set `stage` to where you actually are, and set `next` to the literal command or action that
resumes this work. Leave the working tree exactly as it is. Then stop.

RESUME_TEXT:
Run `date` first; the shell clock is the only source of truth. Discard any stale blocked or
standing-down framing. Re-read .claude/ship-state.json in your worktree and resume its `next`
action immediately, in this turn. You were compacted by the orchestrator; approval already
given, do not re-ask.
```

**Step 6 does not delegate to the target's cron nudge.** Those jobs live in session memory and no
external observer can verify Stage 0 registered one.

### 5.3 Modes

| Invocation | Behavior | Exit |
| --- | --- | --- |
| `pnpm panes:compact` | Report: pane, branch, `t`, verdict, position evidence. Every roster pane. | 0 |
| `pnpm panes:compact --json` | Envelope `{status, degraded, panes}`. Never capped. | 0 |
| `pnpm panes:compact --check` | See aggregation below. | 0/1/2 |
| `pnpm panes:compact --drive <target>` | **Dry run by default** — prints §5.2, sends nothing. | 0 |
| `pnpm panes:compact --drive <target> --fire` | Executes §5.2 subject to §5.5. | 0/1 |

**`--check` aggregation.** The report covers every roster pane; `--check` does not. Its exit
considers **only panes in this orchestrator's purview**, because an orchestrator owning part of a
shared machine would otherwise never see 0 or 1 (round 2). `NOT-AN-ARC` and `UNOWNED` panes are
reported but excluded from the exit computation.

- **2** — any purview pane is `UNDETERMINED`. Trust is affected, so it outranks 1.
- **1** — no `UNDETERMINED`, and at least one purview pane is `COMPACT` or `FORCE`.
- **0** — otherwise.

Exit 2 means the check could not establish safety and is never read as an all-clear — the
convention `ledger:claims --check` establishes (`scripts/ledger-claims.ts:10-14`).

### 5.4 Purview

Written at dispatch time; one row per pane dispatched (`paneId`, `agentName`, `branch`,
`dispatchedAt`). Path is in §5.6.

**Outside the worktree, deliberately.** AGENTS.md records the ship-gate's state file dirtying the
tree it was measuring, resetting its own counter. Purview state takes the same placement.

**Disk-backed, deliberately.** The orchestrator is itself subject to compaction, and an in-context
list of "panes I dispatched" is what a compaction eats.

**Ownership is detected, not enforced.** Nothing stops two orchestrators writing the same `paneId`.
The classifier reads **every** file in the purview directory, and a pane claimed by more than one
yields `UNOWNED` (contested) — reported to both rather than driven by either. This is a collision
report, not a lock; the residual read-read race is §7 limit 4.

### 5.5 Drive-time revalidation

Classification can be stale by the time `--fire` runs. `--fire` recomputes the full verdict
immediately before step 1 and refuses unless the fresh verdict is `COMPACT`/`FORCE` and purview
still resolves to this orchestrator, uncontested. A refusal exits 1 naming the condition and sends
nothing.

Because §5.2 never interrupts, the residual window between revalidation and the first send is
**benign**: the only thing sent is a checkpoint prompt, which queues if the target is busy and
executes if it is not. There is no state in which that send damages the target — which is the
property the interrupt did not have, and the reason removing it closed four round-2 findings at
once.

### 5.6 File manifest

```
scripts/lib/pane-compaction-core.ts             # NEW: importable classifier, pure over an
                                                #      injected surface (roster, git, gh, fs, clock)
scripts/pane-compaction.ts                      # NEW: thin CLI adapter
package.json                                    # + "panes:compact" alias
tests/paneCompaction/**                         # NEW: unit suites and fixture corpus
tests/mutation/source/registry.ts               # + one GuardSurface row (AC-10)
tests/docs/_metaPaneCompactionContract.test.ts  # NEW: prose pin (§10)
docs/agents/orchestrator-pane-compaction.md     # NEW: the write-up (§10)
AGENTS.md                                       # + pointer under cross-cutting discipline
~/.claude/pane-purview/<orchestratorSessionId>.json   # NEW: runtime state, outside any worktree
```

---

## 6. Convergence criterion

**Consequence bound.** Every pane is classified correct or signaled — never silently wrong. A pane
is classified correctly, or reported `UNDETERMINED`/`WAIT`/`UNOWNED`/`NOT-AN-ARC` with the reason
named; it is never driven on a verdict the classifier could not establish. A worst case of
conservative demotion plus a surfaced reason is a **documented limit**, not a finding.

**Probe domain.** The live `herdr agent list` roster on this machine and the fixture corpus at
`tests/paneCompaction/fixtures/`. A constructed roster outside that set, or more than one ordinary
edit from an input in it, files to §7.

**Threat-model fence.** Defends against an orchestrator misreading its own pane roster in ordinary
operation. A forged marker, a hostile agent label, or a pane deliberately rendering a fake gauge is
out of scope and files to §7.

**Score.** Enrolled in `tests/mutation/source/registry.ts` before the first diff dispatch; the
round-1 diff brief carries the score and an empty unaccepted-survivor set on its `GUARD SURFACE:`
line.

---

## 7. Documented limits

Each is conservative-plus-signaled — consistent with §6, not an exception to it.

1. **P5 was observed with the queue drained by an interrupt**, not by natural turn completion. If a
   queued slash command were somehow inert on natural drain, step 4 would send `/compact` and the
   target would not compact — a **no-op**, surfaced by step 5's timeout. The failure mode is a
   missed compaction, never a damaged target. An implementation probe on a throwaway pane closes
   this at build time and is a Task-7 step.
2. **Position is inferred and can be wrong.** In the eligible band §4.4's demote-only rule bounds
   the consequence to a missed compaction. **In the critical band it does not**, and this limit no
   longer claims otherwise: rule 9 returns `FORCE` regardless of position cost, so a wrong
   inference at `t >= 8` can compact at an expensive position. The bound that holds there is
   different and weaker — at critical pressure the counterfactual is auto-compaction at an
   unchosen position, so a deliberate compaction at a mis-inferred position is still no worse than
   doing nothing. Only row 1 outranks `FORCE`, because there the right action is to merge.
3. **A checkpoint can be queued and then abandoned** if step 2 times out. The consequence is a
   marker update the target performs later, with no compaction — harmless, and the abort is
   surfaced.
4. **Purview collision detection is a report, not a lock.** Two orchestrators reading before either
   writes can both proceed. Consequence with the interrupt gone: two checkpoint prompts (the second
   rewrites the same marker) and two `/compact` sends (the second lands on an already-compacted
   session). Bounded, and both are observed-benign shapes rather than asserted ones — the probe
   pane's gauge read `ctx ░░░░░` before and after its compaction.
5. **`gh`'s no-PR signature is matched on human-readable stderr**, which is not a stability
   contract. A future reword demotes every pane to `UNDETERMINED` rather than mis-classifying.
6. **An arc whose Stage 0 label was never set is indistinguishable from a non-arc pane.** Both
   report `NOT-AN-ARC`; neither is driven, and neither is silently omitted.
7. **Auto-compaction cannot be prevented, only preempted.** A target can auto-compact between
   classification and drive; §5.5 bounds the consequence to a wasted invocation because no
   interrupt is involved.
8. **Cross-account panes.** The roster spans workspaces. Purview reporting is the only separation;
   there is no account-level enforcement.

---

## 8. Testing

| Surface | Mechanism |
| --- | --- |
| Precedence (§4.5) | One case per rule. Round-2 case: an **unowned** pane with a malformed marker must report `UNOWNED`, not `UNDETERMINED`. Round-1 case: a below-band pane with a missing marker field must be `UNDETERMINED`, not `HOLD`. |
| Bands (§4.2) | Both boundaries (`t = 5`, `t = 8`) at the `>=` sense, plus all four §3.7 gauges. |
| Position totality (§4.4) | One case per row including row 2 (failed checks) and row 8. A property test asserts every pane **selects** exactly one row — totality and determinism, **not** predicate exclusivity, which §4.4 withdraws. |
| Demote-only | Two rows matching with uncertain ordering yields the more expensive cost. |
| `RECENT_COMMIT_WINDOW` | Both sides of the 15-minute boundary. |
| Hard `WAIT` | CI-green-unmerged at critical pressure. |
| `gh` discrimination | No-PR signature → row 8; a non-zero exit with different stderr → `UNDETERMINED`, never `COMPACT`. |
| Session match | Marker `sessionId` matching, differing, and pane reporting none — three cases. |
| Corpus | Absent corpus reads as "no review in flight", not a fault; non-APPROVE newest row with no commit since → row 4. |
| Purview | Unowned reported; contested reported; registry read from every file in the directory. |
| Checkpoint verification (§5.2 step 3) | Marker unchanged after the checkpoint turn → abort, exit 1, **`/compact` never sent**. |
| Revalidation (§5.5) | Fresh at classification, stale at drive → refuses, exits 1, sends nothing. |
| `--check` aggregation | Purview-only; `UNDETERMINED` outranks `COMPACT`; `NOT-AN-ARC`/`UNOWNED` excluded from the exit. |
| CLI envelope | `--json` never capped (fixture larger than any plausible cap; the live roster is ~12 panes, too small to fail against the mutant it names). |
| Keystroke sequence | Dry-run asserted byte-for-byte including both literal texts; **asserted to contain no `\x1b`**, pinning the no-interrupt decision. |
| No-commit contract | The checkpoint text instructs against committing. |
| Prose pinning | `tests/docs/` meta-test following `tests/docs/_metaAgentsMarkerContract.test.ts`. |
| Mutation | `tests/mutation/source/registry.ts`; score in the round-1 diff brief. |

Every guard states its premise executably with `premise` (`tests/_shared/premise.ts:26`) or
`premiseHolds` (`tests/_shared/premise.ts:36`), unconditionally relative to what it guards, proven
on the case's own inputs.

---

## 9. Acceptance criteria

- **AC-1** `pnpm panes:compact` reports every roster pane with a verdict and position evidence.
- **AC-2** Pressure `t < 5` yields `HOLD`, provided §4.5 rules 1-7 did not fire.
- **AC-3** CI-green-with-PR-unmerged yields `WAIT` at every pressure including critical, provided
  §4.5 rules 1-6 did not fire.
- **AC-4** Input outside the §4.3 accept-set yields `UNDETERMINED` naming the field, provided §4.5
  rules 1-2 did not fire — an unowned or non-arc pane is reported as such even when its marker is
  malformed (AC-5, AC-16).
- **AC-5** A pane in no purview registry is reported `UNOWNED`, **including when its marker is
  malformed**; a pane in two registries is reported `UNOWNED` contested. Neither is driven.
  Provided §4.5 rule 1 did not fire — a pane that is not an arc is `NOT-AN-ARC` (AC-16), which
  outranks ownership because ownership is meaningless for a pane with no branch.
- **AC-6** `--drive` without `--fire` sends nothing and prints §5.2 verbatim.
- **AC-7** `--fire` rejects `--all` and requires a named target.
- **AC-8** `--check` exits per §5.3 aggregation; exit 2 is never an all-clear.
- **AC-9** The registry is read from the §5.6 purview path, never from a worktree.
- **AC-10** Enrolled in the source-mutation registry with an empty unaccepted-survivor set.
- **AC-11** Pressure `t >= 8` yields `FORCE` except under §4.5 rules 1-7.
- **AC-12** The write-up and the AGENTS.md pointer exist; the §10 meta-test fails when either
  drifts.
- **AC-13** `--fire` recomputes the verdict immediately before sending and refuses, exiting 1
  without sending, when a §5.5 condition fails.
- **AC-14** The checkpoint never instructs a commit, and the driver never commits.
- **AC-15** A `gh` failure other than the recognized no-PR signature yields `UNDETERMINED`,
  provided §4.5 rules 1-4 did not fire. The accept-set admits all three `gh` forms as observations
  (§4.3); rule 5 alone classifies the fault, so this AC is exercised distinctly.
- **AC-16** A pane whose agent name resolves to no worktree branch is `NOT-AN-ARC`, never
  `UNDETERMINED`, and never driven.
- **AC-17** A pane whose marker `sessionId` does not match its live `agent_session.value` —
  including when the pane reports none — yields `UNDETERMINED` and is never driven, provided §4.5
  rules 1-3 did not fire. An **absent** marker cannot mismatch: rule 4 no-ops (§4.3, AC-19).
- **AC-18** The driver emits no `\x1b` byte under any input, and `/compact` is never sent when
  §5.2 step 3's verification fails.

---

## 10. Documentation deliverable

The durable contract is repo-tracked and cross-CLI — the write-up loads on demand, AGENTS.md
carries a pointer, and neither restates the other, because two copies drift. Paths in §5.6.

Following `tests/docs/_metaAgentsMarkerContract.test.ts`: literal, narrow assertions pinning the
sentences that can drift, one per edit. It asserts the pointer names the write-up path, that the
write-up states the **no-interrupt** decision (§1.1's row — the one most likely to be "optimized"
back into an Esc by a later editor), that the no-commit contract is stated, and that neither
document carries a band value contradicting §4.2.

---

## 11. Out of scope

- Session-side compaction discipline (arc sessions keeping their own markers current).
- Any `PreCompact` or `SessionStart[compact]` hook — per-machine config, not repo state, and
  `PreCompact` blocking is undetermined (§2.1).
- Changing the auto-compaction threshold via `/autocompact`.
- Compacting the orchestrator itself.
- An atomic purview claim (§7 limit 4).
- Interrupting a target for any reason (§1.1).
