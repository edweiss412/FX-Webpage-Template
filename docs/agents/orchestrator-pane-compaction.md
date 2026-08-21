# Orchestrator pane compaction (project-scoped)

> **All five surfaces ship enabled.** `--checkpoint`, `--compact` and `--resume` send, and
> each authorizes from ONE read-once pass over its world: every decision input is read at
> most once per invocation and nothing is carried in from an earlier command. The design is
> `docs/superpowers/specs/2026-08-21-pane-compaction-send-authorization.md`; the fence those
> modes shipped behind through 2026-08-20, and why, is a dated record in §7 of the
> 2026-08-16 design.


Extracted so it loads on demand instead of in every session. This file is canonical for its
subject and carries the same authority as `AGENTS.md`; `AGENTS.md` links here. Applies to every
agent harness working in this repo.

Read this before compacting any pane other than your own.

## Operator procedure between commands

**Exit 0 means authorized and sent. It does not mean delivered, and the tool will never
claim otherwise.** `herdr agent send` returning `{"type":"ok"}` describes the transport, not
the delivery: an unsubmitted `[Pasted text #N]` and a dropped first send both return ok. The
tool takes no post-send read and prints no echo, deliberately — a read-back would be a
second `screen` read inside the pass, and classifying what came back would mean reading pane
text for meaning, which this surface does not do. So the verification is yours:

- **After every live command, read the target pane back** (`herdr pane read <paneId>`) before
  sequencing the next step. A send that returns ok is not a send until a pane read shows it.
- **Send `/compact` into an EMPTY queue.** A `/compact` queued behind other pending input can
  merge into one combined message and arrive as prose rather than executing as a command. The
  nonce is already consumed at that point, so the recovery is a fresh `--checkpoint`.
- **A freshly launched pane drops its first send** while its TUI is not yet accepting input
  (measured three-for-three on kickoff briefs). Compaction targets are established panes, so
  this is off the ordinary path; where it happens, the pane read shows an unmoved pane and
  the command is re-run.
- **A usage-walled target cannot compact.** Compaction is itself an API call, so a pane idle
  at a quota wall accepts the text and cannot act on it. Not detectable from outside; the
  pane read shows the staged text, and the procedure is to compact after the reset.

## What the authorization does and does not close

Every sending invocation authorizes from ONE read-once pass. The pass is not an
instant, though: its members are read one after another, so a world change
landing between the first read and the bytes arriving is not seen by that
invocation. That window is real and is priced per decay class rather than
claimed away.

- **Wrong recipient** (a takeover swapping the session). Closed by mechanism.
  Both prose payloads open with an ADDRESS LINE naming the target's branch and,
  when its marker carries one, its session id, and instructing any other session
  to ignore the message entirely. A misdirected send self-neutralizes.
- **Same recipient, `blockedOn` decayed** (a concurrent marker write). Closed by
  mechanism. The resume payload tells the recipient to re-read its own
  `.claude/ship-state.json` FIRST and stop if `blockedOn` is non-empty, so the
  decayed state itself refuses. It is the one decay signal a recipient can read.
- **Same recipient, verdict or purview decayed.** **BOUNDED, NOT CLOSED.** The
  recipient cannot see either signal: purview lives in the orchestrator's own
  registry, and verdicts derive from roster, `gh` and git reads the recipient
  never performs. An addressed resume landing in this class IS obeyed. The
  bounded consequence is one resumed-or-stopped turn the recipient's own driver
  reconciles, never corrupted state, and the `--compact` that would follow
  refuses on its own fresh pass.
- **`/compact` specifically** carries no address, because a prefix line would
  strip it of its status as a slash command. Its worst mis-delivery is a
  compaction the operator no longer wanted, which is what auto-compaction does
  on its own schedule anyway.

One ordering detail is load-bearing rather than incidental: target resolution
happens BEFORE the roster read, so the roster feeding rules 1, 2, 5 and 7 is the
freshest value the decision can have. A takeover landing after that read is the
residual above; one landing before it is refused by rule 5.

## Why this exists

A Claude Code session cannot compact itself. `/compact` is a human-typed slash command, and
auto-compaction fires at a threshold the session neither observes nor chooses. So every compaction
a long-running arc experiences lands at a position selected by nothing — frequently mid-task, with
triage decisions, sweep results, and "what I was about to do next" living only in context.

An orchestrator can do better, because it can see and drive other panes. **The entire value is
beating auto-compaction to the punch.** Position is the purpose; pressure is only the trigger. A
tool that ranks by pressure alone has inverted the two.

## The two factors

**Pressure gates eligibility.** Read the context gauge off `herdr agent read`. Five cells, each
full (`█`), half (`▓`), or empty (`░`), so pressure is the integer `t = 2 × full + half` in `0..10`
— tenths, not a float, because no declared mutation operator can attack a float literal and the
band constants would otherwise sit outside the closure set.

| Band | Range | Effect |
| --- | --- | --- |
| Below eligibility | `t < 5` | `HOLD` — position is not consulted at all |
| Eligible | `5 <= t < 8` | position decides |
| Critical | `t >= 8` | `FORCE` — auto-compaction is imminent |

**What "conservative" does and does not cover.** The guarantee ranges over **observations**, not
over inferred position: no pane is driven while any validation rule says stop, `FORCE` never fires
at a High-cost position, and every refusal names its reason. Position itself is a heuristic over
proxies and can be wrong in **both** directions — one commit landing after a non-APPROVE review row
disables the triage-pending signal whether or not that commit addressed the verdict. That is a
documented limit rather than a defect, because the missing fact is not observable from outside the
target's session. Four review rounds were spent claiming otherwise before the bound was scoped to
what the mechanism actually delivers.

**Position selects the moment.** Compacting a pane at `t = 2` destroys live context and buys
nothing. Compacting one at `t = 9` mid-triage loses the triage. The ordered position list, its
demote-only rule, and the hard `WAIT` for CI-green-with-PR-unmerged are in the spec. Two mechanisms
push errors toward withholding: where two position rows match, the more expensive cost wins; and
`FORCE` declines to fire at a High-cost position even at critical pressure.

What they do **not** buy is a guarantee that inference error can only ever withhold. An earlier
version of this page said exactly that, unconditionally, two paragraphs after saying position can be
wrong in both directions — a flat contradiction, and the wrong half won by being the memorable one.
The demote-only rule breaks ties **between predicates that both match**; it does not constrain a
predicate that matches wrongly on its own. Spec §7 limit 1 keeps promotion as a stated residual: a
compaction at a position the orchestrator believed cheaper than it was. That residual is bounded —
no pane is driven while any rule 1-8 observation says stop — and it is the same class of outcome as
the auto-compaction this replaces, which is why it is acceptable rather than absent.

The price is explicit rather than hidden: a critically-full pane sitting at a High-cost position is
left to auto-compact. That is worse than compacting it well and better than compacting it badly,
and it is the only one of the three outcomes the classifier can actually guarantee. An earlier
draft claimed the demote-only bound while `FORCE` overrode position anyway — three consecutive
review rounds landed on that contradiction before it was fixed by changing the behavior instead of
the wording.

## Nothing here ever interrupts

This is the load-bearing decision and the one most likely to be "optimized" away.

An earlier draft sent Esc to interrupt the target so the compaction landed at an instant of the
orchestrator's choosing. Two review rounds found four separate defects on that one surface: the
adaptive Esc loop could interrupt the checkpoint it had just detonated; the window between reading
the screen and sending was unbounded; the mid-tool-call exclusion had no accept-set, so an
implementation could be vacuously conservative or dangerously broad while claiming conformance;
and its documented limit permitted interrupting an unrecognized in-place file write, truncating it.

The interrupt was **removed**, not patched a third time. All four became unreachable.

What replaced it is simply queueing, which is sufficient because of what the probes measured:

- Input sent to a `working` pane **queues**; it does not execute mid-turn.
- A queued **slash command** executes when the queue drains by **natural turn completion**. No
  interrupt is required.
- After compaction the session does **not** auto-resume, and on the natural path it settles at
  `idle` — which is the state your next report reads.

The cost is accepted and is not an oversight: a `working` pane compacts at its natural turn
boundary rather than an instant you pick. That is still a chosen position, and still strictly
better than auto-compaction, which chooses none.

**Do not reintroduce Esc** without a probe showing queueing cannot deliver the checkpoint or the
slash command. `tests/paneCompaction/driver.test.ts` asserts no `\x1b` byte on the dry-run path
**and** on the live send path through a spy — a dry-run-only assertion cannot see an Esc emitted
conditionally by the adapter. Enforced rather than remembered.

## The checkpoint is the point, and the nonce is what proves it landed

Compaction summarizes a conversation, so whatever exists only in that conversation is what the
summary can lose. The checkpoint moves the target's intent to disk **first**.

It is **three one-shot commands**, not one script owning a sequence:

```
panes:compact --checkpoint <target> --as <sessionId>   # mints a nonce, sends the prompt, returns
panes:compact --compact    <target> --as <sessionId>   # requires the nonce back, then sends /compact
panes:compact --resume     <target> --as <sessionId>   # sends the resume prompt
```

Each authorizes from its own read-once pass and returns immediately. **You sequence them**, re-running the plain
report in between to see where the target got to — that re-run is the wait, and putting it in your
judgement rather than in a timeout inside a script is what keeps each command's failure mode
singular.

Add `--dry-run` to any of the three to print the exact bytes and send nothing.

**Every refusal names the condition that fired**, and the four you will actually hit are distinct on
purpose, because each sends you somewhere different: a missing `--as`, a missing target, a target
that does not resolve against the roster, and a verdict that is not drivable. A refusal that blamed
the wrong one would send you to fix something that is not wrong.

**Reading the roster costs one `gh` call per WORKTREE, not per pane.** `gh pr checks` is a network
call, the roster is a dozen panes, and that budget is shared by every arc on the machine — it was
exhausted account-wide once already. Panes in one worktree share a PR and a git state, so both are
read once and reused; the purview directory is read once for the whole run. A pane carrying no cwd
at all (a plain shell) is answered as unknown rather than spawned into, since spawning with an empty
directory would report the ORCHESTRATOR's own worktree state as that pane's.

`--check --as <id>` is the scriptable form: **0** nothing actionable in your purview, **1** something
is COMPACT or FORCE, **2** something is UNDETERMINED and the report cannot be trusted. It aggregates
over your purview only, so an orchestrator sharing a machine still sees 0 or 1. `--json` prints the
`{status, degraded, panes}` envelope, never capped.

**Why a nonce and not a timestamp.** The obvious verification — "the marker's mtime is newer and
`next` is non-empty" — passes on *any* concurrent write: a stage progression, a `blockedOn` change,
a takeover rewriting `sessionId`, another orchestrator's checkpoint. None of those prove your
checkpoint landed. `--checkpoint` mints a nonce, the prompt asks the target to write it, and
`--compact` requires it verbatim. A writer that never saw the nonce cannot satisfy it, and
`--compact` refuses without sending.

**The nonce is single-use, and deliberately nothing more.** `--compact` consumes the record before
it sends, so a retry exits 1 rather than issuing a second `/compact`, and a crash between consuming
and sending costs a re-checkpoint rather than leaving a replayable record behind. The value is a fresh
128-bit random **compared against the marker's current `checkpointNonce` and re-minted on
collision**. Randomness alone would be a probability argument, not a proof, and an unlucky repeat
would let `--compact` accept the previous checkpoint. That comparison is one local read — not a
return of the cross-orchestrator machinery described next.

**It is not a cross-orchestrator lock, and the spec does not claim it is.** Three review rounds each
found a new race in a nonce that was quietly accreting toward that guarantee — a replay, then
freshness plus read-then-consume interleaving, then freshness against an outstanding record and
cross-file landing order. Each repair widened the mechanism and the next round found the next
corner. The claim was dropped instead: **two orchestrators can both send `/compact` to one pane, and
that is fine**, because a second `/compact` on an already-compacted session is a near no-op. Buying
"exactly one" needs consensus across two orchestrators' separate files, which is not a problem this
surface has any reason to solve. `ledger:claims` reports claims across branches and likewise does
not lock.

What the nonce still does, unchanged and locally: proves that *this* orchestrator's checkpoint was
executed by the target before *this* orchestrator sends `/compact`.

**`--resume` does not reuse the compact predicate.** A successful compaction is precisely what drops
the target's pressure below the eligibility band, so `COMPACT`/`FORCE` is false exactly when
`--resume` is correct. Instead it requires **every one of rules 1-8** to stay
quiet — an arc, uniquely named, owned by you and uncontested, inside the accept-set, session still
matching, `gh` determinate, not blocked, and not sitting on a green-but-unmerged PR. That last one
is pressure-independent, so treating it as "banding" and excluding it was wrong: checks turning
green between the compaction and the resume would still have been resumed. Requiring a
hand-picked subset is what an earlier draft did, and it omitted duplicate agent names, which would
have let `--resume` drive a pane the classifier had marked `UNDETERMINED` *precisely because* a
later command cannot tell which pane it would reach.

**This adds one optional field to the ship-state marker.** `checkpointNonce` joins `{branch, stage,
tasksRemaining, next, blockedOn, cronJobId, sessionId}`. It is written only by a target responding
to a checkpoint prompt and read only by `--compact`; its absence is normal.

**The checkpoint never commits.** Invariant 1 permits a task commit only after the implementation
passes its test, and a target mid-task has not. It writes the marker — gitignored, so it dirties
nothing — and leaves the working tree alone. A dirty tree survives compaction; it is on disk.

**`--as` is yours to supply.** There is nothing to infer it from: orchestrator panes have no
worktree and therefore no marker of their own. Every sending mode requires it, takes one named
target, and rejects `--all`.

## Absent is not the same as wrong

Two probes drove this, and both shapes recur:

- **`gh pr checks` exits 1 when there is no PR — and also when auth fails, the network drops, or
  you are rate-limited.** Reading non-zero as "no PR" turns a `gh` outage into "every pane has no
  PR", which lands on the cheap quiescent position and yields `COMPACT`, silently bypassing the
  hard `WAIT` on exactly the panes most dangerous to compact. Admit "no PR" only on the recognized
  stderr signature; anything else is `UNDETERMINED`.
- **A marker can be absent**, and a marker-less branch is supported (the ship-gate has a soft tier
  for it). Absent must not collapse into "mismatched" — the session cross-check has to no-op, not
  fire.

herdr, by contrast, returns a structured `{"error":{"code":"agent_not_found"}}`. The two surfaces
are handled differently on purpose: one has a machine-readable contract, the other does not.

## Verdicts

`NOT-AN-ARC` and `UNOWNED` are deliberately separate from `UNDETERMINED`. The live roster produces
both permanently and by construction — orchestrator panes have no worktree, and panes belonging to
another orchestrator are not yours — so folding them into `UNDETERMINED` would print a standing set
of unresolved-looking faults on every run and train you to ignore the column.

`UNDETERMINED` means safety could not be established. It is never an all-clear, and `--check`
returns 2 for it, outranking the 1 that means "something is ready to compact".

**If a whole roster comes back `UNDETERMINED`, check herdr before suspecting the classifier.** Rule
5 compares a marker's `sessionId` against the pane's own live `agent_session.value`, and it counts a
present marker session against an absent live one as a mismatch. Measured 2026-08-16: 0 of 11 agents
reported an `agent_session` at all while 36 worktree markers carried a `sessionId`, so every one of
those panes classifies `UNDETERMINED` and nothing is drivable. That is the safe direction and the
rule is named in the report, but the cause is a herdr field, not your panes. Spec §7 limit 11.

## Purview is detected, not enforced

Ownership lives in a per-orchestrator registry outside any worktree — outside, because the
ship-gate's state file once lived inside the tree it was measuring and reset its own counter every
run. It is disk-backed because the orchestrator is itself subject to compaction, and an in-context
list of "panes I dispatched" is precisely what a compaction eats.

Nothing stops two orchestrators claiming one pane, so the classifier reads **every** registry and
reports a doubly-claimed pane as contested rather than driving it. That is a collision report, not
a lock; the residual read-read race is a documented limit, bounded by the fact that the protocol no
longer interrupts — the worst case is two checkpoint prompts and two `/compact` sends, both benign.
