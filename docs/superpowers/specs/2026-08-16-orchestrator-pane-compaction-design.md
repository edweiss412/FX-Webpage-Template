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
| Marker `sessionId` matches pane `agent_session.value` | 9 of 10; `chore/mutation-gate-sharding` reports **no** `agent_session` (status `done`) while its marker still names `bfea4e59` (§4.5 rule 5) |
| `gh pr checks` with no PR | Exits **1**, empty stdout, stderr `no pull requests found for branch "…"` — the same exit code as auth failure, network error, and rate limit (§4.5 rule 6) |

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
  `cronJobId`, `sessionId`) **plus the optional `checkpointNonce`** (§5.2). Its presence is the
  normal output of a checkpoint and must be accepted, or the protocol cannot progress past its own
  first command; its absence is equally normal. Round 4 found it missing here while §5.2 added it.
- Git state: porcelain status, commits ahead of `origin/main`, last commit timestamp.
- A round-corpus row (`stage`, `round`, `status`, `verdict`, `findingCount`, `endedAt`).
  **"Newest" is the row with the greatest `endedAt` among rows whose `status` is `verdict`,
  across every corpus file for the branch.** The filter is on `status`, **not** on whether a
  timestamp parses: round 5 probed `docs/review-rounds/docs/parser-mutation-wave/0da9f84b1634.jsonl`
  and found a committed `no_verdict` row carrying a perfectly valid `endedAt`, so an
  earlier version of this clause — which excluded rows by missing timestamp and asserted that
  covered every non-`verdict` row — would have let a wrapper-failure row become "newest". A row
  with `status: verdict` but no parsable `endedAt` is excluded and named. Ties yield
  `UNDETERMINED`. **Absent is
  normal**
  — an arc that never dispatched a review has no corpus file — and is read as `no review in
  flight`, not as a fault.
- A `gh` outcome, **in any of its three forms** — a parsed check state, the recognized no-PR
  signature (non-zero exit **and** stderr matching `no pull requests found for branch`), or a
  fault. All three are *accepted observations*; the accept-set does not classify them. **Rule 6
  alone decides what a fault produces** (§4.5), so that rule stays reachable and independently
  testable. Round 3 found the previous wording consuming faults here, which made that rule dead
  code.

Anything else yields `UNDETERMINED` **naming the offending field**. Terminal titles and pane labels
are display strings, never parsed for meaning.

### 4.4 Position cost

Position is **inferred**. The report shows its evidence per pane so an operator can overrule.

Evaluated as an ordered list, first match wins. **Predicates are not mutually exclusive and are not
claimed to be** — ordinary states match several (dirty + a pending check matches rows 3 and 5;
clean + APPROVE + a recent commit matches rows 6 and 7). Ordering is what makes selection
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

**`FORCE` does not override an expensive position.** §4.5 rule 10 fires `FORCE` at `t >= 8` only
when the position cost is not High; rule 11 sends the High-cost case to `WAIT` instead. Row 1 (CI
green, PR unmerged) is handled earlier still, by rule 8, because there the correct action is to
merge rather than to compact. Rounds 2-4 each found a version of this section claiming a
demote-only bound while an unconditional `FORCE` contradicted it; the contradiction was removed at
its source rather than reworded again.

### 4.5 Precedence

Ordered; first match wins. **Validation precedes banding**, so no pane reaches two terminal rules.

1. Agent name resolves to no worktree branch → **NOT-AN-ARC**.
2. **Two or more roster entries share this agent name** → **UNDETERMINED**, naming the collision.
   The classifier cannot tell which pane a later command would reach, which is the same reason a
   contested purview claim is not driven. Round 4 found this asserted in §7, the test matrix and
   AC-21 while no rule implemented it, so two duplicate rows could reach banding.
3. Pane in no purview registry, or in more than one → **UNOWNED** (unowned / contested).
4. Input outside the accept-set (§4.3) → **UNDETERMINED**, naming the field.
5. Marker `sessionId` present and the pane's `agent_session.value` absent, or both present and
   differing → **UNDETERMINED**, naming the mismatch.
6. A `gh` outcome that is neither a parsed check state nor the recognized no-PR signature →
   **UNDETERMINED**, naming `gh`.
7. `agent_status` ∈ {`blocked`, `unknown`}, or the target's `blockedOn` is non-empty → **WAIT**.
8. Position row 1 (CI green, PR unmerged) → **WAIT**, regardless of pressure.
9. Pressure `t < 5` → **HOLD**.
10. Pressure `t >= 8` **and** position cost is not High → **FORCE**.
11. Pressure `t >= 8` and position cost **is** High → **WAIT**. Round 4's F6: `FORCE` overriding an
    expensive position is the behavior that made §7 limit 1 exceed §6's bound. It is fixed by
    changing the behavior, not by rewording the limit — a critically-full pane at a High-cost
    position is left to auto-compact, which is the conservative outcome §6 requires.
12. Position cost Low or Lowest → **COMPACT**; otherwise → **WAIT**.

Rule 3 sits above rule 4 deliberately: ownership resolves from `paneId` alone and needs no marker,
so an unowned pane with a malformed marker is reported `UNOWNED` — which is what AC-5 requires, and
what round 2 found the previous ordering contradicting.

Rule 6 sits above every banding rule so a `gh` outage can never reach `COMPACT`/`FORCE`. Without
it, a failed `gh` reads as "no PR", which matches row 8 at Low cost and silently bypasses rule 8 on
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
  1. mint a 128-bit random nonce and COMPARE it against the marker's current
     `checkpointNonce`, re-minting on the (negligible but non-zero) collision.
     Randomness makes a repeat improbable, not impossible, and an unlucky
     repeat would let --compact pass on the PREVIOUS checkpoint. One local
     comparison, not the cross-orchestrator machinery round 6 removed.
     Then send CHECKPOINT_TEXT carrying it; send $'\r'   [P1: queues if busy]
  2. record (target, nonce) under the orchestrator's state dir
  -> exits 0 having SENT, not having waited. The target executes when its turn ends.

panes:compact --compact <target> --as <sessionId>
  0. revalidate: same three conditions, fresh                            (closes F5)
  1. read the target's marker; require `checkpointNonce` == the recorded nonce
     mismatch or absent -> exit 1, send NOTHING                          (closes r3 F6)
  2. consume the record BEFORE sending, so a crash costs a re-checkpoint
     rather than leaving a replayable record                             (closes r4 F2)
  3. send '/compact'; send $'\r'                                         [P5, P7]
  -> exits 0 having SENT. No wait, no post-compact failure matrix.       (closes r3 F7)

panes:compact --resume <target> --as <sessionId>
  0. revalidate: §4.5 rules 1-8 must ALL not fire. Rules 1-7 are the
     validation observations; rule 8 (CI green, PR unmerged) is included
     because it is pressure-INDEPENDENT -- round 6 found it excluded as
     "banding" when it is nothing of the kind, so checks turning green
     between compaction and resume would still have been resumed.
     Rules 9-12 are NOT applied: those band on pressure, and a successful
     compaction is exactly what drops pressure below eligibility.
     any failure -> exit 1 naming it, send NOTHING            (closes r4 F1, r5 F3, r6 F1)
  1. send RESUME_TEXT; send $'\r'                                        [P6]
```

The orchestrator sequences them, re-running the plain report between steps to see the target's
state. **That re-run is the wait**, and it is the orchestrator's judgement rather than a timeout
buried in a script — which is what makes each command's failure mode singular and testable.

**`--resume` cannot reuse the `COMPACT`/`FORCE` predicate**, because a successful compaction is
exactly what drops the target's pressure to `HOLD` — the predicate would be false precisely when
`--resume` is correct. Its own predicate above asks the questions that still matter after a
compaction: is this pane still mine, still an arc, still the session I checkpointed, and not
blocked. Round 4 found the previous version sending unconditionally, which would let a superseded
pane be restarted against a worktree another session now owns.

**The nonce is single-use and randomly minted, and that is deliberately all it is.**
`--compact` consumes the record before sending, so a retry finds none and exits 1. The minted value
is a 128-bit random **explicitly compared against the marker's current `checkpointNonce`** and
re-minted on collision — round 7 was right that "randomness makes it different" is a probability
argument, not a proof, and an unlucky repeat would let `--compact` accept the previous checkpoint.
That comparison is one local read, not a return of the cross-orchestrator machinery round 6
removed.

**It is NOT a cross-orchestrator exclusion mechanism, and this spec no longer claims it is.**
Rounds 4, 5 and 6 each found a new race in a nonce that was accreting toward one — a replay, then
freshness-versus-the-marker plus read-then-consume interleaving, then freshness-versus-an
outstanding-record and cross-file landing order. Each repair widened the mechanism and the next
round found the next corner, which is the ratchet the repair-direction rule exists to stop. The
narrowing: **two orchestrators can both send `/compact` to one pane, and that is fine.** P7 and the
probe pane measured the consequence directly — a second `/compact` on an already-compacted session
is a near no-op, gauge `ctx ░░░░░` before and after. Buying "exactly one" would need consensus
across two orchestrators' separate files, which is a distributed-systems problem this surface has
no reason to solve.

What the nonce still does, unchanged: prove that **this** orchestrator's checkpoint prompt was
executed by the target before **this** orchestrator sends `/compact`. That is the property the
feature actually needs, and it is local to one record file.

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

The exit column above assumes herdr ANSWERED. Two reads can fail, and both exit **2** rather than
taking the row's code:

- **The roster** — herdr missing, failing, or answering with something that is not JSON. Every mode
  exits 2 stating the reason, and `--json` carries it in the envelope's `degraded` array. Exit 0
  there would be a lie in the one direction that matters: a report of no panes and a report of no
  answer are indistinguishable to a reader, and on `--check` the first means "nothing needs you".
- **Target resolution**, in a sending mode. A `fault` from `herdr agent get` — anything that is not
  the `agent_not_found` code — exits 2 naming the fault, NOT the 1 that an unresolvable target
  earns. A broken tool is not a typo, and reporting it as one sends an operator to check their
  spelling while herdr is what is wrong.

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

**A purview row is stale when its pane's branch changes.** Rows record `paneId`, `agentName` and
`branch`; ownership resolves from `paneId`, but a row whose recorded `branch` does not match the
pane's **current** agent name is **stale** and confers no ownership — the pane reports `UNOWNED`
until re-registered. Round 6 found that reusing one terminal pane for a different branch otherwise
left the former orchestrator owning, and able to drive, an arc it never dispatched. A markerless
new worktree makes this the only check standing, since rule 5 no-ops without a `sessionId`.

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
tests/mutation/_metaPremiseContract.test.ts     # + one EXPECTED_ENV_TOUCHING entry per enrolled
                                                #   suite; it walks the registry, so a new surface
                                                #   reds it by default rather than being exempt
tests/docs/_metaPaneCompactionContract.test.ts  # NEW: prose pin (§10)
tests/mutation/guardSurfaces.gate.test.ts       # + the surface's gate cases
docs/agents/orchestrator-pane-compaction.md     # NEW: the write-up (§10)
docs/superpowers/plans/2026-08-16-orchestrator-pane-compaction.md   # NEW: the plan
docs/superpowers/specs/README.md                # + this spec's index row
docs/review-rounds/feat/orchestrator-pane-compaction/**             # the round corpus + filing
BACKLOG.md                                      # + BL-SPECLINT-LINT-DRAFT-OUTSIDE-REPO
AGENTS.md                                       # + pointer under cross-cutting discipline
~/.claude/pane-purview/<orchestratorSessionId>.json   # NEW: purview, outside any worktree.
                                                      #   This directory holds ONLY purview
                                                      #   registries -- it is read exhaustively
                                                      #   (§5.4), so a foreign file shape there
                                                      #   has no defined verdict.
~/.claude/pane-nonces/<orchestratorSessionId>.json    # NEW: outstanding checkpoint nonces, in a
                                                      #   SEPARATE directory for that reason
```

---

## 6. Convergence criterion

**Consequence bound.** Every pane is classified correct or signaled — never silently wrong. A pane
is classified correctly, or reported `UNDETERMINED`/`WAIT`/`UNOWNED`/`NOT-AN-ARC` with the reason
named; it is never driven on a verdict the classifier could not establish.

**The bound ranges over OBSERVATIONS, not over inferred position — and this scoping is the point,
not a loophole.** Rounds 2, 3, 4 and 5 each found a §7 limit claiming more than the mechanism
delivers, and each previous repair reworded the limit while leaving the bound quantified over
something unachievable. Position is a heuristic over proxies; it can be wrong in **both**
directions, and no reachable mechanism makes it sound — deciding whether a given repair commit
actually addressed a review verdict is not observable from outside the target's session.

What the bound therefore guarantees, exactly:

1. No pane is driven — by any of the three commands, `--resume` included — while any §4.5 rule
   1-8 condition holds. These are all **observations** —
   name resolution, uniqueness, ownership, accept-set membership, session match, `gh`
   determinacy, blocked status, CI-green-with-PR-unmerged — and each failure is named.
2. `FORCE` never fires at a High-cost position (rule 11).
3. Every refusal states its reason.

What it does **not** guarantee: that an inferred position matches the target's actual state, that
every residual is surfaced at the moment it occurs, or that the target's checkpoint content is
useful. Those are §7's `[residual]` and `[bounded]` rows. §7 no longer asserts a blanket property
over its list — each row carries its tier — because five consecutive rounds found a blanket claim
that the list did not uniformly satisfy.

A worst case of conservative demotion plus a surfaced reason is a **documented limit**, not a
finding; so is a `[bounded]` or `[residual]` row the spec names explicitly. A finding needs a probe
showing a drive decision the bound above forbids.

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

**There is no universal property here, and asserting one is what five review rounds kept finding.**
Rounds 2-7 each caught a limit claiming more than it delivers, and every repair before this one
reworded the offending limit while leaving a blanket preamble that quantified over the whole list.
The list is heterogeneous; the preamble is deleted.

Each limit instead carries its own tier, and §6's enumeration — not this section — is what states
the guarantee:

- **[demote]** conservative demotion plus a surfaced reason. Satisfies §6's formulation directly.
- **[bounded]** the behaviour is bounded and understood, but the residual is **not** surfaced at
  the moment it occurs.
- **[residual]** an accepted gap: the outcome can differ from the ideal and nothing detects it.
  Admitted deliberately because closing it needs a fact the surface cannot observe, or a mechanism
  out of scope.

A `[residual]` row is **not** a §6 violation, because §6 quantifies over observations and drive
decisions, not over the accuracy of inference or the completeness of reporting. It is a statement
about what this surface declines to promise.

1. **[residual] Position inference can be wrong in both directions, and the promotion case is real.** The
   demote-only rule only breaks ties between predicates that both match; it does not constrain a
   false negative. Round 5's example is ordinary: one commit after a non-APPROVE corpus row
   disables the triage-pending predicate whether or not that commit addressed the verdict, after
   which a clean recent tree selects the Lowest-cost row and can become `COMPACT`. So a wrong
   inference can promote, not merely withhold.

   This is a limit and not a defect because the missing fact — did that commit address the verdict
   — is not observable from outside the target's session. What bounds it is §6's enumeration:
   whatever position is inferred, the pane is not driven while any rule 1-8 observation says stop,
   and `FORCE` will not fire at a High cost. The residual is a compaction at a position the
   orchestrator believed cheaper than it was, which is the same class of outcome as the
   auto-compaction it replaces.

2. **[bounded] A checkpoint can be issued and never followed by `--compact`.** The orchestrator may simply
   not run the second command. The consequence is a marker update the target performs at its own
   pace and no compaction — harmless. **The report does not surface the outstanding record**: its
   columns are pane, branch, pressure, verdict and position evidence, and round 6 was right that an
   earlier version of this limit claimed a signal no contract provides. The record is inert, and a
   later `--checkpoint` replaces it.
3. **[residual] The nonce proves the target wrote it, not that the target wrote anything useful.** A target
   that sets `checkpointNonce` but leaves `next` stale satisfies `--compact`. The bound is that
   this is the target's own contract failure, identical to one that would have occurred under
   auto-compaction, and it is not made worse by compacting. Requiring the orchestrator to judge
   the *content* of another session's `next` is out of scope (§11).
4. **[bounded] Purview collision detection is a report, not a lock, and two orchestrators can both send
   `/compact` to one pane.** Once both claims are visible, rule 3 makes both refuse; but in the
   window before either write lands, both can proceed, and their nonce records live in separate
   files that nothing orders. **This spec does not claim "exactly one".** Rounds 4, 5 and 6 each
   found a new race in a nonce accreting toward that guarantee, and buying it needs consensus
   across two orchestrators' files — a distributed-systems problem this surface has no reason to
   solve. The measured consequence is benign: a second `/compact` on an already-compacted session
   is a near no-op (probe pane, gauge `ctx ░░░░░` before and after), and each orchestrator's own
   nonce still proves its own checkpoint landed before its own send. Compare `ledger:claims`,
   which reports claims across branches and likewise does not lock.
5. **[demote] `gh`'s no-PR signature is matched on human-readable stderr**, which is not a stability
   contract. A future reword demotes every pane to `UNDETERMINED` rather than mis-classifying.
6. **[demote] An arc whose Stage 0 label was never set is indistinguishable from a non-arc pane.** Both
   report `NOT-AN-ARC`; neither is driven, and neither is silently omitted.
7. **[residual] A marker-less worktree is supported and classified from git and corpus signals alone.**
   Measured: 3 of 38 worktrees carry no marker, one of which (`ci-flake-ledger-correction`) is a
   genuine branch worktree. AGENTS.md's ship-gate has a soft tier for exactly this. Absence is
   never read as mismatch — §4.5 rule 5 no-ops rather than firing.
8. **[demote] Agent-label uniqueness is a convention, not an invariant.** It holds on the live roster today
   and follows from branches being unique, but a hand-mislabeled pane could collide. Two roster
   entries sharing a name yield `UNDETERMINED` for both **when that name resolves to a branch**;
   when it does not, rule 1 fires first and both are `NOT-AN-ARC`. Either way neither is driven,
   which is the property that matters.
9. **[demote] Auto-compaction cannot be prevented, only preempted.** A target can auto-compact between any
   two commands; each command revalidates, so the consequence is a refused or wasted invocation.
10. **[bounded] Cross-account panes.** The roster spans workspaces. Purview reporting is the only separation;
    there is no account-level enforcement.
11. **[demote] Rule 5 is only as useful as herdr's `agent_session`, and today that field is empty.**
    §3.9's probe table measured 9 of 10 panes MATCHING their marker's `sessionId`, so the field was
    populated when this spec was written. Re-probed on 2026-08-16 while implementing: **0 of 11**
    agents on the live roster report an `agent_session` at all, through either `herdr agent list` or
    `herdr agent get`, while **36** worktree markers carry a `sessionId`. Rule 5 counts a present
    marker session against an absent live one as a mismatch — deliberately, and this section's
    §3.9 row records that exact case — so with the field empty, essentially every arc pane carrying
    a marker classifies `UNDETERMINED` and nothing is driven.

    This is a `[demote]` and not a defect because the direction is right: the tool refuses rather
    than compacts, and rule 5 is named in the report so an operator sees why. But it means the
    surface's practical yield depends on a herdr field outside this repo's control, and a reader
    who sees a roster of `UNDETERMINED` should check that field before suspecting the classifier.
    Whether herdr populates it again, or the rule should treat an absent live session as
    "unobserved" rather than "mismatched", is a spec question — the current text is unambiguous
    that absent counts as mismatch, so the implementation follows it (invariant 7).
12. **[demote] A stale claim still counts toward `contested`, so a reused pane can be blocked by an arc
    that is over.** The claim count is taken before the staleness filter runs — `claims.length > 1`
    at `scripts/lib/pane-compaction-core.ts:340` short-circuits, while the `row.branch !==
    currentBranch` test that retires a dead claim lives at `:351`, on the single-claim path only. So
    a pane inherited by a new arc, whose previous orchestrator's registry still holds a row naming
    the previous branch, reports `UNOWNED` (contested, both sessions named) rather than resolving to
    its live owner. This is the behaviour §4.5 rule 3 and §5.3 specify — "in no purview registry, or
    in more than one" — and it is recorded here rather than repaired because the failure is in the
    safe direction: the pane is not driven by the stale claimant either, and the reason is surfaced
    with both claimants named, which is §6's formulation exactly. The cost is a refusal an operator
    clears by deleting the dead registry row. Filtering stale rows *before* the count would be a
    change to what rule 3 means and belongs to a spec revision, not to an implementation patch
    (invariant 7); a `[demote]` row is the correct home for it under the ledger filing bar, which
    sends conservative-behaviour-plus-surfaced-signal to the owning surface's limits record rather
    than to the open queue.


## 8. Testing

| Surface | Mechanism |
| --- | --- |
| Precedence (§4.5) | One case per rule. Round-2 case: an **unowned** pane with a malformed marker must report `UNOWNED`, not `UNDETERMINED`. Round-1 case: a below-band pane with a missing marker field must be `UNDETERMINED`, not `HOLD`. |
| Bands (§4.2) | Both boundaries (`t = 5`, `t = 8`) at the `>=` sense, plus all four §3.7 gauges. |
| Position totality (§4.4) | One case per row including row 2 (failed checks) and row 8. A property test asserts every pane **selects** exactly one row — totality and determinism, **not** predicate exclusivity, which §4.4 withdraws. |
| Demote-only | Two rows matching with uncertain ordering yields the more expensive cost. |
| `RECENT_COMMIT_WINDOW` | Both sides of the 15-minute boundary. |
| Hard `WAIT` | CI-green-unmerged at critical pressure. |
| `gh` discrimination | No-PR signature → row 8; a non-zero exit with different stderr → `UNDETERMINED`, never `COMPACT`. Rule 6 is exercised **distinctly** from rule 4, proving it is not dead code. |
| Session match | Marker `sessionId` matching, differing, and pane reporting none — three cases. |
| Corpus | Absent corpus reads as "no review in flight", not a fault; non-APPROVE newest row with no commit since → row 4. |
| Purview | Unowned reported; contested reported; registry read from every file in the directory. |
| Nonce single-use | `--compact` twice in a row: the second exits 1 and sends nothing, because the record was consumed before the first send. **No cross-orchestrator exclusion is asserted** — §7 limit 4 no longer claims it, so no test pretends to establish it. |
| Purview staleness | A row whose recorded `branch` differs from the pane's current agent name confers no ownership; the pane reports `UNOWNED` (AC-24). |
| Directory separation | A file in the purview directory that lacks the purview-row shape is impossible by construction: nonce records live elsewhere (AC-25). Asserted by reading a nonce path and confirming it is outside the exhaustively-read directory. |
| `--resume` predicate | Refuses whenever **any** of §4.5 rules **1-8** fires — one case per rule, including duplicate agent names (round 5) and CI-green-with-PR-unmerged (round 6), the latter being pressure-independent and so not "banding". Asserted **not** to require `COMPACT`/`FORCE`, since a successful compaction makes that false. |
| Duplicate agent names | Two entries sharing a **branch-resolving** name are both `UNDETERMINED` before banding — a fixture where both would otherwise be `COMPACT`. A second fixture shares a **non**-branch-resolving name and asserts `NOT-AN-ARC`, since rule 1 precedes rule 2. |
| Corpus newest-selection | Multiple rows across multiple files: greatest `endedAt` among `status: verdict` rows wins. **A `no_verdict` row carrying a valid `endedAt` must not become newest** — the live corpus contains one (`docs/review-rounds/docs/parser-mutation-wave/0da9f84b1634.jsonl`), so the fixture is real, not constructed. A `verdict` row with an unparsable `endedAt` is excluded and named; a tie yields `UNDETERMINED`. |
| `FORCE` respects High cost | `t >= 8` at a High-cost position yields `WAIT`, not `FORCE` — the §7 limit-1 behavior change, asserted rather than described. |
| Nonce verification (§5.2) | Four cases: nonce matches → sends; nonce absent → exit 1, nothing sent; nonce differs → exit 1, nothing sent; **marker mtime newer and `next` non-empty but nonce stale** → exit 1, which is the concurrent-writer false positive round 3 found. |
| Revalidation (§5.5) | Per command: fresh at report time, stale at command time → refuses, exits 1, sends nothing. |
| `--as` required | Every sending mode without `--as` exits 1 and sends nothing. |
| Target resolution | `agent_not_found` exits 1 naming the target; duplicate agent names yield `UNDETERMINED` for both. |
| Marker-less pane | Classifies from git and corpus alone; rule 5 no-ops rather than firing. |
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
- **AC-2** Pressure `t < 5` yields `HOLD`, provided §4.5 rules 1-8 did not fire.
- **AC-3** CI-green-with-PR-unmerged yields `WAIT` at every pressure including critical, provided
  §4.5 rules 1-7 did not fire.
- **AC-4** Input outside the §4.3 accept-set yields `UNDETERMINED` naming the field, provided §4.5
  rules 1-3 did not fire — an unowned or non-arc pane is reported as such even when its marker is
  malformed (AC-5, AC-16).
- **AC-5** A pane in no purview registry is reported `UNOWNED`, **including when its marker is
  malformed**; a pane in two registries is reported `UNOWNED` contested. Neither is driven.
  Provided §4.5 rules 1-2 did not fire — a pane that is not an arc is `NOT-AN-ARC` (AC-16), and a
  duplicate branch-resolving name is `UNDETERMINED` (AC-22). Both outrank ownership: ownership is
  meaningless for a pane with no branch, and unresolvable for a pane a command cannot address.
- **AC-6** `--dry-run` on any sending mode sends nothing and prints that command's §5.2 bytes
  verbatim, including the literal texts with `<NONCE>` substituted.
- **AC-7** Every sending mode rejects `--all`, requires a single named target, and requires
  `--as`; a missing `--as` exits 1 rather than inferring an orchestrator. **`--check` requires it
  too** — it aggregates over the invoking orchestrator's purview, so without an identity there is
  no purview to aggregate over and the exit code would be meaningless rather than merely unscoped.
  The plain report and `--json` do not require it: they cover every roster pane and mark none as
  the caller's.
- **AC-8** `--check` exits per §5.3 aggregation; exit 2 is never an all-clear.
- **AC-9** The registry is read from the §5.6 purview path, never from a worktree.
- **AC-10** Enrolled in the source-mutation registry with an empty unaccepted-survivor set.
- **AC-11** Pressure `t >= 8` yields `FORCE` when position cost is not High, and `WAIT` when it
  is (§4.5 rules 10-11), except under §4.5 rules 1-8.
- **AC-12** The write-up and the AGENTS.md pointer exist; the §10 meta-test fails when either
  drifts.
- **AC-23** `--resume` refuses when any §4.5 rule **1-8** fires — including duplicate agent names
  and CI-green-with-PR-unmerged, which is pressure-independent — and applies none of rules 9-12.
- **AC-24** A purview row whose recorded `branch` does not match the pane's current agent name is
  stale and confers no ownership; the pane reports `UNOWNED`.
- **AC-25** Nonce records are read from the nonce directory, never from the purview directory,
  which the classifier reads exhaustively.
- **AC-13** `--checkpoint` and `--compact` each revalidate immediately before sending and refuse,
  exiting 1 without sending, when the fresh verdict is not `COMPACT`/`FORCE` or purview does not
  resolve to `--as` uncontested. **`--resume` revalidates against its own predicate** (§5.2) and
  refuses the same way; it does not reuse `COMPACT`/`FORCE`, which a successful compaction makes
  false by design.
- **AC-14** The checkpoint never instructs a commit, and the driver never commits.
- **AC-15** A `gh` failure other than the recognized no-PR signature yields `UNDETERMINED`,
  provided §4.5 rules 1-5 did not fire. The accept-set admits all three `gh` forms as observations
  (§4.3); rule 6 alone classifies the fault, so this AC is exercised distinctly.
- **AC-16** A pane whose agent name resolves to no worktree branch is `NOT-AN-ARC`, never
  `UNDETERMINED`, and never driven.
- **AC-17** A pane whose marker `sessionId` does not match its live `agent_session.value` —
  including when the pane reports none — yields `UNDETERMINED` and is never driven, provided §4.5
  rules 1-4 did not fire. An **absent** marker cannot mismatch: rule 5 no-ops (§4.3, AC-20).
- **AC-18** No command emits an `\x1b` byte under any input, on the dry-run path **or** the live
  send path.
- **AC-19** `--compact` sends nothing and exits 1 when the target's `checkpointNonce` is absent or
  differs from the nonce `--checkpoint` recorded for that target. The nonce is **single-use**:
  `--compact` consumes the record before sending, so an immediate re-run exits 1 rather than
  issuing a second `/compact`.
- **AC-22** Two roster entries sharing a branch-resolving agent name are both `UNDETERMINED` via
  §4.5 rule 2, before any banding rule can reach them.
- **AC-20** A pane whose worktree has no marker is classified from git and corpus signals alone and
  is never `UNDETERMINED` for that reason; §4.5 rule 5 no-ops rather than treating absent as
  mismatched.
- **AC-21** An unresolvable target exits 1 naming it and sends nothing; two roster panes sharing an
  agent name **that resolves to a branch** are both `UNDETERMINED`, naming the collision. Sharing a
  name that resolves to no branch yields `NOT-AN-ARC` via rule 1, which precedes.

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
