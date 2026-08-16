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
the surface that lets it: a read-only classifier over the live pane roster, and three one-shot
commands that checkpoint a target's state to disk and compact it at a position the orchestrator
chose.

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
| **The sequence is three one-shot commands, not one stateful driver.** Round 3's F5/F6/F7/F8 were all consequences of one script owning a multi-hour sequence; decomposing closed all four. User scope decision 2026-08-16. Do not propose recombining them into a single `--fire`. | §5.2, §5.5 |
| **`--as <sessionId>` is supplied explicitly, never inferred.** Orchestrator panes have no worktree and therefore no marker of their own, so there is nothing to infer it from. | §3.9, §5.3 |
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
| **P6** | After compaction the session does **not** auto-resume. | post-compaction, interrupt-drained | `status: done` stable 20s+; `pgrep -fl 'echo beat-'` empty |
| **P7** | A queued slash command executes when the queue drains by **natural turn completion**; no interrupt is required. **On that path the session settles at `idle`.** | `working`, queue drained naturally (second probe pane) | `⏺ Last line: n-25` then `✻ Conversation compacted` / `❯ /compact ⎿ Compacted`; `status: idle` |
| **P8** | A send to an **`idle`** pane executes directly, without queueing. | `idle` | the opening step of both probe runs: `wait --status idle`, then send, then `status: working` with the task running |

**P2, P3 and P4 are retired.** They measured Esc semantics (vim-mode consumption, interrupt, and
queue detonation), and §5.2 no longer sends Esc. They remain in the branch history at commit
`6afa333a5` should the decision ever be revisited.

**What P1 does and does not establish.** It was measured on a pane that was **mid-tool-call**.
Queueing was not separately measured for a `working` pane between tool calls. §5.2 makes no
distinction — it queues to any `working` pane — so both sub-states take the identical path and the
unmeasured one carries no separate claim.

**P7 supersedes P5 as the load-bearing measurement.** P5 was observed with the queue drained by an
interrupt, which §5.2 no longer performs; P7 measures the natural-drain path the design actually
uses, and additionally settles that the terminal state there is `idle` — the state §5.2's
orchestrator-side polling looks for. P6's `done` was specific to the interrupt path.

**`done` targets are routed through `idle` rather than claimed.** P8 measured a direct send to an
`idle` pane; no probe sent to a pane in `done`. §5.2's sending commands therefore make no claim
about `done`: the orchestrator's report shows the state, and a `done` pane is treated exactly as
`working` is — the send queues or executes, and the orchestrator re-runs the report to see. One
fewer claim, rather than a documented limit covering one.

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

### 5.2 Three one-shot commands, not one protocol

**No interrupt, and no long-running stateful driver.** Round 3 found four defects that were all
consequences of one script owning a multi-hour sequence: the verdict going stale across the wait,
the checkpoint gate admitting a concurrent writer's marker update, an undefined post-compact
failure path, and no identity for "this orchestrator". The sequence is therefore decomposed into
three commands the orchestrator issues in turn, each of which **returns immediately** and revalidates
independently.

```
panes:compact --checkpoint <target> --as <sessionId>
  0. revalidate: verdict is COMPACT|FORCE, purview resolves to <sessionId>, uncontested
  1. mint a nonce; send CHECKPOINT_TEXT carrying it; send $'\r'         [P1: queues if busy]
  2. record (target, nonce) under the orchestrator's state dir
  -> exits 0 having SENT, not having waited. The target executes when its turn ends.

panes:compact --compact <target> --as <sessionId>
  0. revalidate: same three conditions, fresh                            (closes F5)
  1. read the target's marker; require `checkpointNonce` == the recorded nonce
     mismatch or absent -> exit 1, send NOTHING                          (closes F6)
  2. send '/compact'; send $'\r'                                         [P5, P7]
  -> exits 0 having SENT. No wait, no post-compact failure matrix.       (closes F7)

panes:compact --resume <target> --as <sessionId>
  1. send RESUME_TEXT; send $'\r'                                        [P6]
```

The orchestrator sequences them, re-running the plain report between steps to see the target's
state. **That re-run is the wait**, and it is the orchestrator's judgement rather than a timeout
buried in a script — which is what makes each command's failure mode singular and testable.

**The nonce is what makes verification sound.** Round 3 showed that "marker mtime is newer and
`next` is non-empty" passes on *any* concurrent marker write — a stage progression, a `blockedOn`
change, a takeover rewriting `sessionId`, another orchestrator's checkpoint. A nonce minted by
`--checkpoint` and required verbatim by `--compact` cannot be satisfied by a writer that never saw
it.

**This extends the ship-state marker contract by one optional field.** AGENTS.md declares the
marker as `{branch, stage, tasksRemaining, next, blockedOn, cronJobId, sessionId}`;
`checkpointNonce` is added as optional, written only by a target responding to `CHECKPOINT_TEXT`,
and read only by `--compact`. Its absence is normal and is not a fault. The `docs/agents/`
write-up (§10) states the extension so the marker contract has one description, not two.

**The checkpoint does NOT commit.** Invariant 1 permits a task commit only after the implementation
passes its test, and a target mid-task has not. The checkpoint writes the marker — gitignored, so
it dirties nothing — and leaves the working tree exactly as it was. A dirty tree survives
compaction; it is on disk.

**The literal texts**, so AC-6's byte-for-byte assertion has an authoritative expected value.
`<NONCE>` is the only substitution:

```
CHECKPOINT_TEXT:
Checkpoint before compaction. Do not commit. Update .claude/ship-state.json in your worktree:
set `stage` to where you actually are, set `next` to the literal command or action that resumes
this work, and set `checkpointNonce` to exactly <NONCE>. Leave the working tree exactly as it
is. Then stop.

RESUME_TEXT:
Run `date` first; the shell clock is the only source of truth. Discard any stale blocked or
standing-down framing. Re-read .claude/ship-state.json in your worktree and resume its `next`
action immediately, in this turn. You were compacted by the orchestrator; approval already
given, do not re-ask.
```

**`--resume` does not delegate to the target's cron nudge.** Those jobs live in session memory and
no external observer can verify Stage 0 registered one.

### 5.3 Modes

| Invocation | Behavior | Exit |
| --- | --- | --- |
| `pnpm panes:compact` | Report: pane, branch, `t`, verdict, position evidence. Every roster pane. | 0 |
| `pnpm panes:compact --json` | Envelope `{status, degraded, panes}`. Never capped. | 0 |
| `pnpm panes:compact --check --as <id>` | See aggregation below. | 0/1/2 |
| `pnpm panes:compact --checkpoint <target> --as <id>` | §5.2 command 1. `--dry-run` prints the sends without issuing them. | 0/1 |
| `pnpm panes:compact --compact <target> --as <id>` | §5.2 command 2. `--dry-run` as above. | 0/1 |
| `pnpm panes:compact --resume <target> --as <id>` | §5.2 command 3. `--dry-run` as above. | 0/1 |

Every sending mode requires `--as` and a **single named target**; none accepts `--all`. `--dry-run`
is available on each and prints the exact bytes without sending. `<target>` resolves through
`herdr agent get`; an `agent_not_found` code exits 1 naming the target and sends nothing (§2.2).

**`--as <sessionId>` is the orchestrator's identity, supplied explicitly.** Round 3 correctly
observed there is nothing to infer it from — orchestrator panes have no worktree and therefore no
ship-state marker of their own (§3.9). Making it an argument is the honest form: it is testable, it
cannot silently resolve to the wrong orchestrator, and a missing `--as` on a sending mode exits 1
rather than guessing.

**`--check` aggregation.** The report covers every roster pane; `--check` does not. Its exit
considers **only panes in `--as`'s purview**, because an orchestrator owning part of a shared
machine would otherwise never see 0 or 1. `NOT-AN-ARC` and `UNOWNED` panes are reported but
excluded from the exit computation.

- **2** — any purview pane is `UNDETERMINED`. Trust is affected, so it outranks 1.
- **1** — no `UNDETERMINED`, and at least one purview pane is `COMPACT` or `FORCE`.
- **0** — otherwise.

Exit 2 means the check could not establish safety and is never read as an all-clear — the
convention `ledger:claims --check` establishes (`scripts/ledger-claims.ts:10-14`).

### 5.4 Purview

Written at dispatch time; one row per pane dispatched (`paneId`, `agentName`, `branch`,
`dispatchedAt`). Path is in §5.6, keyed by the orchestrator's session id — the same value passed as
`--as`.

**Outside the worktree, deliberately.** AGENTS.md records the ship-gate's state file dirtying the
tree it was measuring, resetting its own counter. Purview state takes the same placement.

**Disk-backed, deliberately.** The orchestrator is itself subject to compaction, and an in-context
list of "panes I dispatched" is what a compaction eats.

**Ownership is detected, not enforced.** Nothing stops two orchestrators writing the same `paneId`.
The classifier reads **every** file in the purview directory, and a pane claimed by more than one
yields `UNOWNED` (contested) — reported to both rather than driven by either. This is a collision
report, not a lock; the residual read-read race is §7 limit 4.

### 5.5 Revalidation is per command, not per sequence

Each sending command revalidates immediately before it sends, and each returns without waiting. So
the staleness window is bounded by one command's own execution rather than by the length of the
whole sequence — which is what round 3's F5 found unbounded when a single script held the sequence
across a four-hour checkpoint wait.

Between commands the target may change state freely. That is safe by construction: `--compact`
revalidates and additionally requires the nonce, so a target that became `WAIT` after its
checkpoint is refused at the moment `/compact` would otherwise be sent.

Because §5.2 never interrupts, a send that races a state change is **benign**: the only things sent
are a prompt and a slash command, which queue if the target is busy and execute if it is not. There
is no state in which either damages the target.


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
~/.claude/pane-purview/<orchestratorSessionId>.json   # NEW: purview, outside any worktree
~/.claude/pane-purview/<orchestratorSessionId>.nonces.json  # NEW: outstanding checkpoint nonces
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

1. **Position is inferred and can be wrong.** In the eligible band §4.4's demote-only rule bounds
   the consequence to a missed compaction. **In the critical band it does not**, and this limit
   does not claim otherwise: rule 9 returns `FORCE` regardless of position cost, so a wrong
   inference at `t >= 8` can compact at an expensive position. The bound that holds there is
   weaker — at critical pressure the counterfactual is auto-compaction at an unchosen position, so
   a deliberate compaction at a mis-inferred one is no worse. Only row 1 outranks `FORCE`.
2. **A checkpoint can be issued and never followed by `--compact`.** The orchestrator may simply
   not run the second command. The consequence is a marker update the target performs at its own
   pace and no compaction — harmless, and visible in the next report because the recorded nonce
   is still outstanding.
3. **The nonce proves the target wrote it, not that the target wrote anything useful.** A target
   that sets `checkpointNonce` but leaves `next` stale satisfies `--compact`. The bound is that
   this is the target's own contract failure, identical to one that would have occurred under
   auto-compaction, and it is not made worse by compacting. Requiring the orchestrator to judge
   the *content* of another session's `next` is out of scope (§11).
4. **Purview collision detection is a report, not a lock.** Two orchestrators reading before either
   writes can both proceed. Consequence with the interrupt gone: two checkpoint prompts (the second
   rewrites the same marker, invalidating the first nonce, so the first orchestrator's `--compact`
   correctly refuses) and at most two `/compact` sends, the second landing on an already-compacted
   session. Bounded, and observed rather than asserted — the probe pane's gauge read `ctx ░░░░░`
   before and after its compaction.
5. **`gh`'s no-PR signature is matched on human-readable stderr**, which is not a stability
   contract. A future reword demotes every pane to `UNDETERMINED` rather than mis-classifying.
6. **An arc whose Stage 0 label was never set is indistinguishable from a non-arc pane.** Both
   report `NOT-AN-ARC`; neither is driven, and neither is silently omitted.
7. **A marker-less worktree is supported and classified from git and corpus signals alone.**
   Measured: 3 of 38 worktrees carry no marker, one of which (`ci-flake-ledger-correction`) is a
   genuine branch worktree. AGENTS.md's ship-gate has a soft tier for exactly this. Absence is
   never read as mismatch — §4.5 rule 4 no-ops rather than firing.
8. **Agent-label uniqueness is a convention, not an invariant.** It holds on the live roster today
   and follows from branches being unique, but a hand-mislabeled pane could collide. Two roster
   entries sharing a name yield `UNDETERMINED` for both, naming the collision, for the same reason
   a contested purview claim does: the classifier cannot tell which pane a later command reaches.
9. **Auto-compaction cannot be prevented, only preempted.** A target can auto-compact between any
   two commands; each command revalidates, so the consequence is a refused or wasted invocation.
10. **Cross-account panes.** The roster spans workspaces. Purview reporting is the only separation;
    there is no account-level enforcement.


## 8. Testing

| Surface | Mechanism |
| --- | --- |
| Precedence (§4.5) | One case per rule. Round-2 case: an **unowned** pane with a malformed marker must report `UNOWNED`, not `UNDETERMINED`. Round-1 case: a below-band pane with a missing marker field must be `UNDETERMINED`, not `HOLD`. |
| Bands (§4.2) | Both boundaries (`t = 5`, `t = 8`) at the `>=` sense, plus all four §3.7 gauges. |
| Position totality (§4.4) | One case per row including row 2 (failed checks) and row 8. A property test asserts every pane **selects** exactly one row — totality and determinism, **not** predicate exclusivity, which §4.4 withdraws. |
| Demote-only | Two rows matching with uncertain ordering yields the more expensive cost. |
| `RECENT_COMMIT_WINDOW` | Both sides of the 15-minute boundary. |
| Hard `WAIT` | CI-green-unmerged at critical pressure. |
| `gh` discrimination | No-PR signature → row 8; a non-zero exit with different stderr → `UNDETERMINED`, never `COMPACT`. Rule 5 is exercised **distinctly** from rule 3, proving it is not dead code. |
| Session match | Marker `sessionId` matching, differing, and pane reporting none — three cases. |
| Corpus | Absent corpus reads as "no review in flight", not a fault; non-APPROVE newest row with no commit since → row 4. |
| Purview | Unowned reported; contested reported; registry read from every file in the directory. |
| Nonce verification (§5.2) | Four cases: nonce matches → sends; nonce absent → exit 1, nothing sent; nonce differs → exit 1, nothing sent; **marker mtime newer and `next` non-empty but nonce stale** → exit 1, which is the concurrent-writer false positive round 3 found. |
| Revalidation (§5.5) | Per command: fresh at report time, stale at command time → refuses, exits 1, sends nothing. |
| `--as` required | Every sending mode without `--as` exits 1 and sends nothing. |
| Target resolution | `agent_not_found` exits 1 naming the target; duplicate agent names yield `UNDETERMINED` for both. |
| Marker-less pane | Classifies from git and corpus alone; rule 4 no-ops rather than firing. |
| `--check` aggregation | Purview-only; `UNDETERMINED` outranks `COMPACT`; `NOT-AN-ARC`/`UNOWNED` excluded from the exit. |
| CLI envelope | `--json` never capped (fixture larger than any plausible cap; the live roster is ~12 panes, too small to fail against the mutant it names). |
| Keystroke sequence | Dry-run asserted byte-for-byte including both literal texts with `<NONCE>` substituted. **No `\x1b` byte** asserted on the dry-run path **and** on the live send path through a spy on the send surface — a dry-run-only assertion cannot see an Esc emitted conditionally by the live adapter, which round 3 named. |
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
- **AC-6** `--dry-run` on any sending mode sends nothing and prints that command's §5.2 bytes
  verbatim, including the literal texts with `<NONCE>` substituted.
- **AC-7** Every sending mode rejects `--all`, requires a single named target, and requires
  `--as`; a missing `--as` exits 1 rather than inferring an orchestrator.
- **AC-8** `--check` exits per §5.3 aggregation; exit 2 is never an all-clear.
- **AC-9** The registry is read from the §5.6 purview path, never from a worktree.
- **AC-10** Enrolled in the source-mutation registry with an empty unaccepted-survivor set.
- **AC-11** Pressure `t >= 8` yields `FORCE` except under §4.5 rules 1-7.
- **AC-12** The write-up and the AGENTS.md pointer exist; the §10 meta-test fails when either
  drifts.
- **AC-13** `--checkpoint` and `--compact` each revalidate immediately before sending and refuse,
  exiting 1 without sending, when the fresh verdict is not `COMPACT`/`FORCE` or purview does not
  resolve to `--as` uncontested.
- **AC-14** The checkpoint never instructs a commit, and the driver never commits.
- **AC-15** A `gh` failure other than the recognized no-PR signature yields `UNDETERMINED`,
  provided §4.5 rules 1-4 did not fire. The accept-set admits all three `gh` forms as observations
  (§4.3); rule 5 alone classifies the fault, so this AC is exercised distinctly.
- **AC-16** A pane whose agent name resolves to no worktree branch is `NOT-AN-ARC`, never
  `UNDETERMINED`, and never driven.
- **AC-17** A pane whose marker `sessionId` does not match its live `agent_session.value` —
  including when the pane reports none — yields `UNDETERMINED` and is never driven, provided §4.5
  rules 1-3 did not fire. An **absent** marker cannot mismatch: rule 4 no-ops (§4.3, AC-19).
- **AC-18** No command emits an `\x1b` byte under any input, on the dry-run path **or** the live
  send path.
- **AC-19** `--compact` sends nothing and exits 1 when the target's `checkpointNonce` is absent or
  differs from the nonce `--checkpoint` recorded for that target.
- **AC-20** A pane whose worktree has no marker is classified from git and corpus signals alone and
  is never `UNDETERMINED` for that reason; §4.5 rule 4 no-ops rather than treating absent as
  mismatched.
- **AC-21** An unresolvable target exits 1 naming it and sends nothing; two roster panes sharing an
  agent name are both `UNDETERMINED`, naming the collision.

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
- **Judging the *content* of another session's checkpoint.** The nonce proves the target wrote the
  marker; whether its `next` is a good resume instruction is the target's own contract (§7
  limit 3). An orchestrator that second-guessed it would be reimplementing the target's judgement
  from outside, on strictly less information.
