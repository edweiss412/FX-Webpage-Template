# Pane-compaction send authorization — design

**Status:** DRAFT · **Date:** 2026-08-21 · **Branch:** `feat/pane-compaction-send-auth` ·
**Row:** `BL-PANE-COMPACTION-SEND-AUTHORIZATION` (BACKLOG.md)

Unfences `--checkpoint`, `--compact` and `--resume` on `pnpm panes:compact` by giving the send
path the authorization model five diff rounds established it lacked. The classifier and the
read-only surfaces (default report, `--check`, `--json`) shipped enabled and mutation-scored;
this arc does not touch them except to wire authorization in front of the send path.

---

## 1. The authorization model — decided first

The ledger row's first scheduled step is this decision, before any code: is **one atomic
snapshot per authorization** sufficient, or must the **target acknowledge before any byte is
sent**? Every one of the six shipped defects (§2.2) is an instance of "the decision and the
send were separated by a window", and four incremental repairs narrowed the window without
closing it.

### 1.1 Resolved scope — do not relitigate

Each row was settled by a prior ratification. Verify the citation; do not re-derive.

| Decision | Ratification |
| --- | --- |
| **The driver never interrupts.** No `\x1b` byte on any send path, dry-run or live. | 2026-08-16 design §1.1; `tests/paneCompaction/driver.test.ts` "no ESC byte, on BOTH paths" |
| **Three one-shot commands, not one stateful driver.** No `--fire`, no in-command waiting. | 2026-08-16 design §1.1 (round-3 F5–F8 closure) |
| **`--as <sessionId>` is explicit, never inferred.** Every sending mode requires it and rejects `--all`. | 2026-08-16 design §5.3 |
| **The nonce is single-use, consumed before the send, and is NOT a cross-orchestrator lock.** Two orchestrators may both send `/compact`; measured near no-op. | 2026-08-16 design §5.2; `runCompact` in `scripts/lib/pane-compaction-core.ts` ("BEFORE the send, deliberately") |
| **The checkpoint never commits.** | 2026-08-16 design §5.2; `tests/docs/_metaPaneCompactionContract.test.ts` ("never commits") |
| **The ship-and-fence decision itself.** Fencing at round 5 was a user decision on measured evidence (`9eaa6d6eb`). This arc REPLACES the fence with an authorized send path; whether fencing was right is settled. | commit `9eaa6d6eb` message |
| **The twelve-rule precedence and the shipped classifier.** `observe()`/core classification are mutation-scored and not this arc's subject. | 2026-08-16 design §4.5; `tests/mutation/source/registry.ts` row `paneCompactionCore` |
| **Exit-code meanings.** 0 = sent; 1 = refusal ("asked and answered: not now"); 2 = cannot answer / fault. New conditions mint new codes rather than reuse; this arc mints none. | `scripts/pane-compaction.ts` `main()` refusal comments |
| **No feature flag.** The fence is removed whole, not converted into a toggle — a boolean gate with one write path and no product read path is the zombie-flag shape. | this section |
| **Restored tests are restored, not rewritten.** The pre-fence send-path suite is the baseline (§8.1). | ledger row, "restore them with the arc rather than rewriting them" |

### 1.2 The decision: one read-once pass per authorization

The ledger row asks whether "one atomic snapshot per authorization" is sufficient. The honest
first half of the answer: **a literally atomic snapshot is unobtainable over this surface.**
The world is multi-source — the roster from herdr, the marker and purview from disk, checks
from the network — and no transaction spans them. Any design claiming a single-instant
capture would be claiming more than the mechanism can deliver, which is the exact defect
shape the 2026-08-16 design spent rounds removing from its own §6/§7. What IS obtainable,
and what this spec commits to:

**Each sending-mode invocation performs exactly one read-once pass over its world, derives
every authorization predicate from that pass, and then sends.** Concretely:

- Every read member is read AT MOST ONCE per invocation, through a read-once surface, and
  enforced structurally by the shipped send-auth scanner (§3.5). Same-member re-reads — the
  shape of chains 1 and 4 — are unrepresentable.
- **No decision input predates the pass.** Classification (the twelve rules), ownership, the
  rule 1–8 observation stop, the mode's verdict gate, and — for `--compact` — the nonce
  equality all derive from this invocation's pass. Nothing is carried from an earlier
  observation, an earlier command, or an earlier invocation — the shape of chains 2, 3
  and 5.
- The decision is followed by the send, with nothing read in between.

What this closes, exactly: the six defects (§2.2) were all **inter-pass skew** — a decision
composed from an earlier capture plus a later read, or from a pass that was never refreshed
at all. With one pass per invocation and no carried inputs, that class has no second pass to
skew against. What it does NOT close, said plainly rather than discovered by a reviewer: the
pass itself takes time, so two DIFFERENT members are still read at two instants, and a world
change landing between the pass's first read and the send is not observed by that invocation
(**intra-pass skew — §7 limit 1**). No reachable mechanism closes that residual — an
acknowledgment read moves it (§1.3), and the shipped two-pass code has the identical residual
inside its own revalidation pass. What prices it is two properties together. The QUEUE
property is inherited: every send queues if the target is busy and interrupts nothing
(2026-08-16 design §5.5). The CONTENT property is this spec's addition (§3.6), because the
queue property alone is not enough — the shipped prompt texts carry no addressee, so a
takeover landing inside the window would deliver actionable stop/resume instructions to a
session they were never authorized for. Both prompts therefore open with an ADDRESS LINE
naming the branch and, when the pass's marker carries one, the session id, with an explicit
instruction that any other session ignore the message entirely — the wrong-recipient
delivery self-neutralizes. And because an authorization can also decay with the RECIPIENT
UNCHANGED (round 3's probe: a concurrent marker write flips `blockedOn` after the pass read
it), the resume prompt additionally defers to the recipient's own marker at execution time
(§3.6) — the one payload whose content could override safety state now re-checks that state
where it is freshest. These mechanisms cover exactly two decay classes — wrong recipient,
and `blockedOn` decay; the remaining same-recipient classes (a verdict or purview change the
recipient cannot see) are priced as bounded consequences in §7 limit 1, not claimed closed
(round 4's correction).

The shipped-but-fenced code already contains the fourth repair's partial form of this — the
`authorize()` closure in `scripts/pane-compaction.ts` memoizes the marker and derives the
nonce from the classified snapshot. It is partial: `drive()` still runs a **preliminary**
observe pass and reads the marker at entry (`const marker = s.marker(pane.cwd)` feeding
`mintNonce`'s collision compare), then `authorize()` reads everything again, and
`revalidateNow()` compares the two instants field by field (`fresh.verdict !==
report.verdict`, `fresh.rule !== report.rule`, `!fresh.inPurview`); `runCompact` in core then
calls `revalidate` a **second** time inside the send. Every one of those cross-instant
comparisons is a residue of the two-pass structure, and each incomplete comparison was a
review finding (r2: verdict-only; r4: marker twice). §3 deletes the structure that makes the
comparisons necessary instead of completing them again.

### 1.3 The losing model: target-acknowledge-before-send

Stated with both of its forms, so neither can be relitigated.

**The solicited form** — this invocation asks, then waits for the target's acknowledgment,
then sends — fails structurally, three ways:

1. **The acknowledgment is itself a read.** The only return channel from a target is its
   marker file. Reading an ack after the authorization decision is a second read at a second
   instant — the exact shape of chain 4 (§2.2), reintroduced by design. A solicited-ack flow
   has MORE reads at MORE instants than the code it would replace.
2. **It cannot close the window either.** Between reading the ack and emitting the send, the
   world can still change. The model moves the residual (§7 limit 1) and adds reads; it does
   not remove it.
3. **It requires waiting on a busy party.** A compaction target is by selection near context
   exhaustion and mid-turn; input to it queues and executes at turn end (probe P1/P7). A
   command that waits for an ack is a stateful driver holding a multi-hour sequence — the
   decomposition into three one-shot commands closed exactly that defect family (round-3
   F5–F8) and is a do-not-relitigate row.

**The pre-issued form** — the target writes a standing grant (a marker field naming the
orchestrator and command class) in advance, and the invocation requires it before the first
byte — is COHERENT, and an earlier draft of this section overclaimed by calling
ack-before-first-byte structurally impossible; that claim is withdrawn. But the coherent form
is not a rival authorization model: the grant is read **as one more field of the same
read-once pass**, so it collapses into the decided model as a candidate ADDITIONAL predicate.
As an additional predicate it is DECLINED, with reasons, and fenced:

- **Consent already has a structure.** The purview registry is written at dispatch time by
  the orchestrator that launched the pane, and rule 5 refuses a pane whose live session does
  not match its marker. A target-side grant would be a second consent channel guarding the
  same relationship.
- **A standing grant is a stale claim with no retirement trigger.** Nothing retires it when
  the arc's situation changes — the exact expiry-with-no-notice class this repo's lessons
  corpus documents for markers, uniqueness comments and pending notes. The nonce avoids this
  only by being single-use; a reusable grant cannot.
- **Adoption is a fleet tax with a forced bad default.** Every arc's Stage 0 would have to
  write the grant. Until universal, an absent grant either refuses (the fleet is undrivable)
  or passes (the field is a zombie that gates nothing).

The residual it would buy — refusing an orchestrator that legitimately owns the pane but
whose target never opted in — is not a defect the six chains contain, and files to §11.

The decided model therefore stands on §1.2's argument; the "both models genuinely defensible"
escalation the arc brief reserved does not arise, because the coherent form of the
alternative IS the decided model plus one declined predicate, not an alternative.

### 1.4 What the nonce is, under the decided model

The nonce is **target acknowledgment for the one send that needs one** — proof that this
orchestrator's checkpoint prompt was executed by the target before this orchestrator sends
`/compact` — and it is **verified from within the snapshot**: the marker copy that classified
the pane is the copy whose `checkpointNonce` is compared. The snapshot model and the nonce are
orthogonal, not rivals: the pass answers whether the decision is built from this
invocation's own reads with nothing carried in; the nonce answers whether the checkpoint
actually landed before the compact. Single-use,
consumed-before-send, re-minted on collision — all unchanged from the shipped design.

---

## 2. Background facts

All code claims verified against the live tree at branch base `e5d1d723d` (anchors are
file + symbol; line numbers, where given, are drafting-time locators).

### 2.1 The shipped, fenced state

- The three sending modes refuse before any observation, naming the ledger row, exit 2:
  `scripts/pane-compaction.ts`, the `SENDING.has(opts.mode)` block ("refusing: --checkpoint,
  --compact and --resume are disabled in this release"). The fence commit is `9eaa6d6eb`.
- The fence's replacing tests assert nothing is READ (spies on roster, marker, gh, screen,
  purview, resolveTarget record zero calls): current `tests/paneCompaction/adapter.test.ts`.
- The pre-fence send-path suite — the accumulated kill set of five diff rounds — is the
  ~580 lines `9eaa6d6eb` deleted from `adapter.test.ts`, recoverable verbatim:
  `git show 9eaa6d6eb^:tests/paneCompaction/adapter.test.ts`.
- The send texts and send plan live in core: `CHECKPOINT_TEXT`, `RESUME_TEXT`, `planSends`,
  `mintNonce`, `runCompact` (`scripts/lib/pane-compaction-core.ts`).
- The adapter is enrolled in the send-auth single-read scanner:
  `tests/paneCompaction/sendAuthScan.ts` `SEND_AUTH_SURFACES` row for
  `scripts/pane-compaction.ts` (surfaceType `Surface`, sink `send`, effects `out`/`outRaw`/
  `nonceWrite`/`nonceConsume`, ambient `now`/`random`), pass marker `// send-auth: pass`
  above `authorize()`.
- The classifier core is enrolled: `tests/mutation/source/registry.ts` row
  `paneCompactionCore`. The score recorded at the fence (188/196, zero unaccepted survivors)
  is a historical record of that tree; any source edit this arc makes retires it and the
  round-1 diff brief carries the re-measured value.

### 2.2 The six probe chains — the acceptance floor

Quoted from the ledger row; each exited 0 and SENT bytes before its repair. Each becomes an
executable red under §4 before any send code passes it.

1. `--compact` authorized against a nonce captured before revalidation (AC-19).
2. Revalidation compared only the verdict, so a purview TRANSFER passed through (AC-13).
3. Revalidation ran against the ORIGINAL roster, freezing rules 1, 2, 5 and 7, so a takeover
   swapping `agent_session` was invisible (AC-17).
4. The marker was read TWICE per authorization, so a `sessionId` change between the two reads
   preserved the nonce and passed rule 5 on the stale copy (AC-13/AC-17).
5. `--checkpoint` and `--resume` never revalidated at all: they observed once and then sent,
   so a marker that changed in between was never seen (design §6 guarantee 1).
6. A labelled non-arc was driven and a checkpoint SENT to an orchestrator pane (AC-16).

Two repair-introduced defects travel with the floor: dead code the mutation gate caught, and a
refusal that LIED (roster disappearance encoded as a stale report with a null nonce, refusing
with "marker carries no checkpointNonce" while a matching nonce sat in the marker). The
restored suite's "leaves the roster refuses with THAT reason, not a nonce reason" case pins
the second; the mutation gate pins the first.

### 2.3 Measured send semantics (probes 2026-08-16; field notes 2026-08-21)

- Input to a `working` pane QUEUES; a queued slash command executes as a command when the
  queue drains by natural turn completion (P1, P7). Used deliberately in manual operation to
  ride a usage-wall reset.
- A `/compact` queued BEHIND other pending input can merge into one combined message and lose
  its status as a command — it arrives as prose. (Field note; also the measured orchestration
  incident in the batch lessons corpus.)
- An idle-LOOKING pane showing a "queued messages" hint is mid-turn, not idle.
- A freshly LAUNCHED pane drops its first send while the TUI is not yet accepting input
  (measured three-for-three on kickoff briefs).
- `herdr agent send` returning `{"type":"ok"}` describes the transport, not delivery: a send
  that returns ok is not a send until a pane read shows it (unsubmitted `[Pasted text #N]`
  and dropped first sends both return ok).
- The auto-mode permission classifier blocks LONG multi-line `herdr agent send` invocations
  typed as Bash commands. This binds hand-run sends, not this tool: the tool's sends go
  through `execFileSync` inside the process (`sh()` in `scripts/pane-compaction.ts`), so the
  classifier sees only the short `pnpm panes:compact ...` command line.

---

## 3. Design

### 3.1 The snapshot

A sending-mode invocation builds one `AuthorizationSnapshot` by wrapping the live `Surface`
(`scripts/pane-compaction.ts` `export type Surface`) in a read-once memo over **every read
member** — the set is DERIVED as the complement of the enrolled row's declared sinks, effects
and ambient members (`tests/paneCompaction/sendAuthScan.ts` `SEND_AUTH_SURFACES`, the same
complement the scanner itself consumes), never a hand-list — so each read member answers from
its first read for the remainder of the pass. The shipped `authorize()` memoizes `marker` alone;
the pass generalizes that to the whole read surface, so "the SAME member read twice at two
instants" stops being expressible for any member, not just the one chain 4 named. The pass is
not an instant (§1.2): two DIFFERENT members are still read at two instants, which is §7
limit 1, not a property this section claims away.

From the snapshot, in order, each refusing by name (§6 guarantee 3):

1. Target resolution and roster presence (`parseAgentGet` three-way: hit / not-found / fault —
   unchanged).
2. Ownership: purview resolves the pane to `--as`, uncontested (`resolveOwnership` —
   unchanged semantics, snapshot-sourced).
3. Classification: the shipped `observe()` over the snapshot. Rules 1–8 firing is an
   observation stop for every mode; `--checkpoint`/`--compact` additionally require
   `COMPACT`/`FORCE`; `--resume` deliberately does not (unchanged predicate).
4. `--compact` only: nonce equality — recorded nonce vs the snapshot marker's
   `checkpointNonce`, both non-null, equal.

Then the effects, with nothing read between decision and send: `--checkpoint` writes the
nonce record then sends; `--compact` consumes the record then sends; `--resume` sends.
`--dry-run` runs the identical gate and prints the exact bytes instead of sending, spending
nothing (no nonce write, no consume) — shipped behavior, preserved (AC-6, AC-19 dry-run
cases).

### 3.2 What is deleted

The single-pass structure makes these shipped mechanisms unnecessary, and they are removed
rather than kept as belt-and-braces — each is a decision assembled across instants, which is
the defect class, and each was individually a review finding:

- The **preliminary observe pass** in `drive()` (initial `observe` + entry-time marker read).
  All early refusals re-derive from the snapshot instead.
- The **stale-vs-fresh comparisons** in `revalidateNow()` (`stale-verdict`, rule-changed,
  left-purview refusals that name a "was/now" pair). Under one pass there is no "was"; the
  refusal states what the snapshot says now (`not-drivable`, `observation-stop`,
  ownership refusals — the shipped refusal catalog keeps covering them).
- The **second in-send revalidation** in `runCompact` (`revalidate: revalidateNow` invoked
  again at the moment of the send). `runCompact`'s signature drops the `revalidate` thunk;
  its nonce inputs come from the snapshot. The consume-before-send ordering is unchanged.

  **The refusal catalog rows are NOT unchanged, corrected at diff round 3.** This sentence
  said `nonce-absent` and `nonce-mismatch` were untouched, and round 2 leaned on it to
  justify reusing `nonce-mismatch` for a failed consume. Both parts were wrong. `nonce-absent`
  covered two DIFFERENT conditions under one message that named only the marker, so a run
  holding no record of a healthy pane was told "the target's marker carries no
  checkpointNonce" — the lying-refusal shape §2 already records this arc fixing once. And the
  failed consume is a third condition again: the record moved after authorization while the
  marker still holds what was authorized, which the mismatch message describes falsely in both
  halves. The catalog now carries four rows — `nonce-record-absent`, `nonce-marker-absent`,
  `nonce-mismatch`, `nonce-record-changed` — each naming the condition that fired, per §6's
  third guarantee, which outranks keeping the catalog short.
- The `mintNonce` collision compare reads the snapshot marker's nonce, not an entry-time
  copy.

Deletion is the point: a comparison that exists can be incomplete (r2), and a second read
that exists can skew (r4). A comparison that does not exist cannot be the next round's
finding.

### 3.3 Delivery evidence is operator procedure, not tool behavior

The tool performs **no post-send reads and prints no echo**. An earlier draft had the command
read the pane back after each live send; that contradicted the read-once contract (`screen`
is a read member the classifier already consumes for the gauge — `observe()` in
`scripts/pane-compaction.ts` — so a post-send read is a second `screen` read per invocation)
and it would have been the first step toward classifying display strings, which the shipped
posture forbids (2026-08-16 design §4.3). Deleted rather than special-cased.

What the field notes measured — a send that returns ok is not a send; read the pane back —
is real and is accounted for as OPERATOR PROCEDURE in the write-up (§10): after each
command, the orchestrator reads the target pane (`herdr pane read`) before sequencing the
next step, exactly as the shipped protocol already makes the between-commands report re-run
the wait and the operator's judgement the verification. Exit 0 means "authorized and sent",
a claim about the transport; delivery is the operator's read. A send herdr refuses is
already a named fault (exit 2, `SendFailed`), unchanged.

### 3.4 Fence removal

The `SENDING.has(opts.mode)` block and its exit-2 refusal are deleted whole. No flag, no
environment gate. The fence's replacing tests (zero-reads spies) are superseded by the
restored send-path suite (§8.1); the fence-before-observation property was a property of the
fence and retires with it.

### 3.5 Structural enforcement

- **sendAuthScan** (`tests/paneCompaction/sendAuthScan.ts`) keeps the adapter enrolled; the
  `// send-auth: pass` marker moves to the single authorization function. Its MULTI-READ /
  RAW-HANDOFF / MISSING-DERIVATION arms are the mechanical form of §1.2's read-once
  discipline; a second read of any surface member inside the pass is a finding by
  construction. The scan is a deciding suite for the enrolled `sendAuthScan` surface and a
  CI gate for this one.
- **Read-once memo**: the snapshot wrapper is the runtime form of the same rule; the
  restored chain-4 red becomes a spy asserting exactly one `marker` read per sending
  invocation (§4), red against the shipped two-read `drive()` and green after.
- **Mutation**: the authorization predicate is a pure function over snapshot data and lives
  in `scripts/lib/pane-compaction-core.ts`, inside the enrolled `paneCompactionCore`
  surface. Enrolment precedes review: the round-1 diff brief carries the re-measured score
  and an empty unaccepted-survivor set on its `GUARD SURFACE:` line. `pnpm mutation:sites`
  runs before any push that edits the enrolled source (accepted-row keys shift with the
  source).

### 3.6 Addressed payloads

Both prompt texts open with an address line, and the substitutions come from the pass: the
target's branch (its agent name, already resolved by classification) always; the target's
marker `sessionId` when the pass's marker copy carries one (a marker-less or session-less
target is addressed by branch alone — rule 5 already governs the mismatch cases the id would
catch). `/compact` cannot carry an address — it is a slash command — and needs none: its
worst mis-delivery is a compaction, the same outcome auto-compaction produces on its own
schedule, and a near no-op on an already-compacted session (measured, 2026-08-16 design
§5.2).

The literal texts, so the byte-for-byte dry-run assertion has an authoritative expected
value. `<NONCE>`, `<SESSION>` and `<BRANCH>` are the only substitutions; when the pass's
marker carries no `sessionId`, the address line's parenthetical `(session <SESSION>)` is
omitted whole:

```
CHECKPOINT_TEXT:
For the session driving <BRANCH> (session <SESSION>) ONLY -- any other session must ignore
this message entirely. Checkpoint before compaction. Do not commit. Update
.claude/ship-state.json in your worktree: set `stage` to where you actually are, set `next`
to the literal command or action that resumes this work, and set `checkpointNonce` to
exactly <NONCE>. Leave the working tree exactly as it is. Then stop.

RESUME_TEXT:
For the session driving <BRANCH> (session <SESSION>) ONLY -- any other session must ignore
this message entirely. Run `date` first; the shell clock is the only source of truth.
Re-read .claude/ship-state.json in your worktree FIRST: if its blockedOn is non-empty, honor
it and stop -- your marker outranks this message. Otherwise discard any stale blocked or
standing-down framing from your conversation and resume the marker's `next` action
immediately, in this turn. You were compacted by the orchestrator; approval already given,
do not re-ask.
```

**The resume payload defers to the recipient's own marker, and that is the round-3 repair,
not a courtesy.** The address line neutralizes the WRONG-recipient delivery; it cannot
neutralize a SAME-recipient authorization decay — a `blockedOn` written by a concurrent
marker update after the pass read it, with branch and session unchanged. The earlier resume
text told exactly that recipient to discard its blocked framing, which OVERRODE the one
piece of state that would have refused the send. The repaired text makes the recipient's own
marker the gate for the ONE decay signal the recipient can read — its own `blockedOn` — at
its own execution instant. Said precisely, because round 4 caught an earlier draft claiming
more: the deference closes the `blockedOn` decay class and NO OTHER. A verdict or purview
change with branch, session and `blockedOn` unchanged is invisible to the recipient by
construction — purview lives in the orchestrator's registry, and verdicts derive from
roster, gh and git reads the recipient never performs — so those classes are not closed by
any payload content and are priced as bounded consequences in §7 limit 1. The checkpoint
payload needs no deference line: its ask is a truthful self-record plus a stop at the
recipient's own turn boundary, benign under any decay (§7 limit 1).

A session can always answer "am I driving this branch" (its worktree) and, per this repo's
Stage 0 contract, knows its own session id, so the ignore instruction is executable by any
recipient. The address line defends against ACCIDENTAL misdirection — the fence's subject; a
session that disobeys an ignore instruction it can read is outside the fence and files
to §7.

### 3.7 Fault taxonomy for the mint path

`mintNonce` throws after its collision-retry budget is exhausted (`mintNonce` in
`scripts/lib/pane-compaction-core.ts`; the collision behavior is pinned at
`tests/paneCompaction/mutantKills.test.ts`). Unreachable with a healthy 128-bit source, and
reachable exactly when `random()` is broken — which is a TOOL fault, not a refusal. The
adapter catches it and exits 2 naming the condition (a broken random source, alongside the
existing `SendFailed` handling), never letting the throw escape `main`: an uncaught throw
exits with a code the taxonomy assigns to refusals, which is a fault wearing a refusal's
number. Round-3 finding, accepted.

---

## 4. Acceptance floor — the six chains as executable reds

The arc brief pre-authorized the honest reading and this section takes it: **chains 1–5 are
UNREPRESENTABLE under the pass model, and that is evidence FOR the model, said here rather
than discovered.** Every historical fixture for chains 1, 2, 3 and 5 encodes a TWO-READ
premise — its constructed `Surface` returns one value on the first read and a mutated value
on the second, which is how "changed between observation and send" was injected — and under
one read-once pass there is no second read for the mutation to ride on. Those two-read
premises RETIRE with the two-pass code they tested; they are not "preserved", and an earlier
draft's claim that every historical behavioral kill is preserved was wrong and is withdrawn.

Each chain's protection is instead established by TWO covers, each with its own proof
obligation:

- **The structural cover** — a spy over every `Surface` read member asserting at most one
  call per member per sending invocation and no input carried from outside the invocation.
  This red is GENUINE against the shipped unfenced code: `drive()` reads the marker at entry
  AND inside `authorize()`, and `authorize()` re-reads the roster after the preliminary
  observe, so the spy fails on the shipped structure and passes under §3. One red, killing
  the whole inter-pass class at once.
- **The behavioral pins** — the historical cases adapted to a single-read premise: the
  transferred purview, swapped session, flipped `blockedOn`, or mismatched nonce is IN the
  pass's own reads, and the mode refuses having sent nothing. These are deliberately green
  on the shipped code too (its preliminary observe also sees a pre-invocation mutation); they
  are regression pins, and their discriminating power is PROVEN per the killer-audit
  standard, not assumed: each pin is shown to kill a NAMED weakened build — the ownership
  check deleted, the rule 1–8 stop deleted, the verdict gate deleted, the nonce equality
  deleted — with the kill demonstrated and recorded (ABSENT / PRESENT-BUT-UNPROVEN /
  PROVEN: all PROVEN).

The intra-pass variant — a mutation landing between two DIFFERENT member reads of the single
pass — is not one of the six chains, exists identically inside the shipped code's
revalidation pass, and files to §7 limit 1, where §3.6's addressing prices it.

| # | Chain | Covers (structural red is shared; pin names its proven weakened-build kill) | Why the chain cannot recur |
| --- | --- | --- | --- |
| 1 | Nonce captured before revalidation | Pin: adapted AC-19 set — mismatched/absent nonce IN the pass refuses; consumed record refuses a second `--compact`; dry-run does not consume. Proven kill: nonce-equality-deleted build | Nonce equality derived from the pass's marker copy; no earlier capture exists |
| 2 | Verdict-only comparison let a purview transfer through | Pin: adapted AC-13 — transferred purview in the pass refuses, nothing sent. Proven kill: ownership-check-deleted build | Ownership derived from the pass's purview read; there is no cross-pass comparison to be incomplete |
| 3 | Revalidation against the ORIGINAL roster | Pin: adapted AC-17 — swapped `agent_session` in the pass refuses via rule 5. Proven kill: rule-stop-deleted build | The pass's roster read is its only roster; no earlier pass exists for the swap to hide behind |
| 4 | Marker read twice; mutation between reads preserved the nonce | **Structural cover** (shared by all of 1–5): read-member spy, red against shipped `drive()` (marker at entry + in `authorize()`; roster in both passes), green under §3 | Same-member re-reads unrepresentable; sendAuthScan MULTI-READ arm gates it |
| 5 | `--checkpoint`/`--resume` observed once, then sent, never revalidated | Pin: adapted round-5 case — a rule 1–8 condition (incl. flipped `blockedOn`) in the pass refuses each mode BY RULE name. Proven kill: rule-stop-deleted / verdict-gate-deleted builds | Every mode derives its stop from THIS invocation's pass; there is no earlier observation to go stale |
| 6 | A labelled non-arc was driven; checkpoint sent to an orchestrator pane | Restored AC-16 pair, UNCHANGED (single-read premise already): non-arc label is NOT-AN-ARC and never driven. Proven kill: rule-1-deleted build | Classification and authorization share one pass; rule 1 fires before any send |

Floor extensions carried with the restoration: the lying-refusal pin ("leaves the roster
refuses with THAT reason, not a nonce reason"), the no-ESC live-path spy (AC-18), the
byte-exact dry-run (AC-6), and the refused-send-is-a-named-fault case.

---

## 5. File manifest

```
scripts/pane-compaction.ts                       # fence removed; drive() rebuilt on one
                                                 #   read-once pass; pass marker
scripts/lib/pane-compaction-core.ts              # authorization predicate (pure, enrolled);
                                                 #   runCompact loses its revalidate thunk;
                                                 #   CHECKPOINT_TEXT/RESUME_TEXT gain the
                                                 #   address line (§3.6)
tests/paneCompaction/adapter.test.ts             # pre-fence suite RESTORED from
                                                 #   9eaa6d6eb^, then adapted per §8.1
tests/paneCompaction/revalidate.test.ts          # re-targeted to single-pass semantics
tests/paneCompaction/driver.test.ts              # no-Esc pins unchanged and kept red-capable
tests/mutation/source/registry.ts                # paneCompactionCore row: re-keyed accepted
                                                 #   rows if lines shift (pnpm mutation:sites)
docs/agents/orchestrator-pane-compaction.md      # fence banner replaced by live-protocol note
docs/superpowers/specs/2026-08-16-orchestrator-pane-compaction-design.md
                                                 # §7 "[SHIPPED DISABLED]" limit marked
                                                 #   superseded by this spec (dated record)
AGENTS.md                                        # "three modes ship DISABLED" sentence
                                                 #   updated to the shipped-enabled state
docs/superpowers/specs/README.md                 # index row for this spec
BACKLOG.md / BACKLOG-archive.md                  # row graduates at closeout
```

No file under `app/` (excluding none), `components/`, or design-token files is touched.

impeccable-gate: N/A — no UI surface

---

## 6. Convergence criterion

**Consequence bound.** Every invocation of a sending mode is authorized correctly or
signaled, never silently wrong: it either sends under an authorization whose every input
comes from that invocation's own single read-once pass — no member read more than once, no
input carried from any earlier pass, command, or invocation — or refuses naming the
condition that fired, and it never emits a refusal citing a condition other than the one
that fired. The interval from the pass's first read to the send is the declared residual
(§7 limit 1), priced there per decay class — closed by mechanism where a mechanism exists
(the queue property, §3.6's addressed payloads, the resume payload's `blockedOn` deference),
and stated as a bounded consequence where none does — not forbidden by this bound. A
conservative refusal plus a surfaced reason is a documented limit, not a finding.

**Probe domain.** The live `herdr agent list` roster on this machine; the fixture corpus and
constructed `Surface` doubles under `tests/paneCompaction/`; and the six probe chains of §2.2.
A probe outside that set, or more than one ordinary edit away from an input in it, files to
§7.

**Threat-model fence.** Defends against accidental misdirection and stale state in ordinary
operation — a takeover, a purview transfer, a concurrent marker write, a pane closing
mid-command. A forged marker, a hostile agent label, a pane deliberately rendering fake
output, or an operator constructing adversarial input is out of scope and files to §7.

**Score.** `paneCompactionCore` is enrolled; the arc's source edits retire the fence-era
score, and the round-1 diff brief states the re-measured score plus an empty
unaccepted-survivor set on its `GUARD SURFACE:` line, measured after the last source edit
of the diff under review.

**Closed criterion.** The §4 structural cover red-then-green against the shipped structure;
every §4 behavioral pin PROVEN against its named weakened build; the restored suite green;
the no-ESC pins green; and the mutation score above — all machine-checked. A finding claiming the
authorization can skew needs a probe from the domain showing a decision input read more than
once, an input carried from outside the invocation's own pass, or a send after a refusal. A
probe showing a world change landing between two DIFFERENT member reads of the single pass
demonstrates §7 limit 1 — the declared residual — and files there without a round, unless it
also shows the resulting send breaching limit 1's per-send worst case.

---

## 7. Documented limits

Tiers as in the 2026-08-16 design: **[demote]** conservative + surfaced; **[bounded]**
bounded, not surfaced at the moment it occurs; **[residual]** accepted gap.

1. **[residual] The pass-to-send window.** The pass is not an instant: its members are read
   sequentially, so a world change landing anywhere between the pass's FIRST read and the
   bytes landing — including between two different member reads — is not observed by that
   invocation, and a send can proceed that a later pass would have refused. No reachable
   orchestrator-side mechanism closes this: an acknowledgment read moves the window (§1.3),
   and the shipped two-pass code carries the identical window inside its own revalidation
   pass. The pricing, per send and per decay class, with the mechanism named for each
   (rounds 2 and 3 each caught this limit priced on an assumption; it is now priced on
   mechanisms):
   - **Wrong recipient** (takeover swapping the session): both prompts open with §3.6's
     address line telling any non-addressee to ignore the message — self-neutralizing.
   - **Same recipient, `blockedOn` decayed** (a concurrent marker write): the **resume
     prompt** defers to the recipient's own marker read at execution time (§3.6), so the
     decayed state itself refuses — this is the one same-recipient class a payload can
     close, because `blockedOn` is the one decay signal the recipient can read.
   - **Same recipient, verdict or purview decayed** (pressure/position moved, or a purview
     transfer with the session unchanged) — **[bounded], not closed** (round 4's
     correction): the recipient cannot see these signals (purview is the orchestrator's
     registry; verdicts derive from roster/gh/git reads the recipient never performs), so an
     addressed resume landing in this class IS obeyed. The bounded consequence: the
     recipient executes its own marker's `next` — the same act its own driver would
     instruct, overriding no safety state — and a checkpoint's ask stays a truthful
     self-record plus a stop, with the `--compact` that would follow refusing on its OWN
     fresh pass (a transferred purview or changed session fails revalidation there). Cost
     of the stray send: one resumed-or-stopped turn the recipient's own driver reconciles,
     never a corrupted state.
   - **`/compact`**: at worst a compaction the operator no longer wanted — the same outcome
     auto-compaction produces on its own schedule — and a near no-op on an already-compacted
     session; a mis-timed compaction of a blocked session loses nothing durable (the marker
     is on disk). This bullet was an UNDERSTATEMENT until diff round 2: the consume deleted
     whichever grant the record held rather than the one authorized, so a stale `--compact`
     also destroyed a newer, unused one-shot grant — a durable loss, which is exactly what
     the bullet promises does not happen. It is now true by mechanism rather than by
     assumption: `nonceConsume` takes the authorized value and deletes only on a match, and
     `runCompact` sends only when the consume reports it spent that grant.
   None interrupts anything (no `\x1b`, pinned). The narrow residue inside the residue: a
   takeover where the successor drives the SAME branch and the marker carried no `sessionId`
   is addressed by branch alone and would act on the prompt — the marker-less soft tier the
   ship gate already prices, conservative in outcome (a checkpoint asks it to record state;
   a resume defers to its own marker).
2. **[bounded] A `/compact` queued behind other pending input can merge into prose** and not
   execute as a command (field note, §2.3). Consequence: no compaction; the nonce is already
   consumed, so the operator re-checkpoints. Surfaced by the operator's post-send pane read
   (§3.3, §10) — the orchestrator-side mitigation (send into an empty queue, verify by
   reading the pane) is operator procedure in the write-up, not tool logic.
3. **[demote] A freshly launched pane can drop its first send** while the TUI is not accepting
   input. Compaction targets are established panes and resume targets just-compacted idle
   panes, so the launch window is not on this tool's ordinary path; where it occurs, the
   operator's pane read shows an unmoved pane and the command is re-run.
4. **[residual] The tool asserts nothing about delivery.** `{"type":"ok"}` from herdr
   describes the transport; exit 0 means authorized-and-sent, never delivered. Classifying
   delivery would be a recognizer over display strings, which the shipped posture forbids;
   the operator's pane read is the verification (§3.3).
5. **[demote] A usage-walled target cannot compact** — compaction is itself an API call, so a
   pane idle at a quota wall accepts the text and cannot act on it. Not detectable from
   outside; the operator's pane read shows the staged text; procedure is to compact after
   the reset.
6. **[demote] Two overlapping `--checkpoint` invocations can split the record from the
   marker.** Each mints and writes independently, so the record can end up holding one
   invocation's nonce while the target's marker holds the other's; the `--compact` that
   follows then refuses. Raised as the second interleaving of diff round 2's core finding
   and filed here rather than fixed, because the reviewer's own probe shows the outcome is
   conservative and surfaced — which the convergence criterion (§6) makes a documented limit
   rather than a finding — and because §1's ratified decision already states the nonce is
   NOT a cross-orchestrator lock:

   ```text
   outerCode: 0, nestedCode: 0
   held: "nonce-B", markerNonce: "nonce-A"
   sendOrder: ["nonce-B", "CR", "nonce-A", "CR"]
   compactCode: 1, compactAddedSends: 0
   lines: ["refusing: the target's checkpointNonce is not the one this command recorded"]
   ```

   Exit 1, a named refusal, zero sends, nothing destroyed. Cost: the operator re-checkpoints.
   Recorded with the probe verbatim so a later round contests the DISPOSITION rather than
   rediscovering the behaviour. What would move it out of this tier is a probe showing the
   split producing a send, a silent success, or a destroyed grant — none of which this one
   does, and the round-2 repair to `nonceConsume` closes the destruction path specifically.

7. **Inherited unchanged** from the 2026-08-16 design §7: purview collision detection is a
   report, not a lock (two orchestrators can both send `/compact`, benign); rule 5's yield
   depends on herdr populating `agent_session`; `gh`'s no-PR signature is matched on stderr
   text and demotes to `UNDETERMINED` on reword; a marker-less worktree classifies from git
   and corpus signals alone.

---

## 8. Testing

### 8.1 Restoration first, adaptation second

The baseline is the pre-fence suite, restored from
`git show 9eaa6d6eb^:tests/paneCompaction/adapter.test.ts` — it is the accumulated kill set
of five adversarial rounds and is not re-authored. Adaptation is then enumerated per case in
the plan, in exactly three classes, honestly labelled:

1. **Single-read cases restore VERBATIM** — refusal naming, dry-run byte-exactness (address
   line added per §3.6), AC-16, AC-18, the fault taxonomy: their premises survive the model.
2. **Two-read cases adapt to single-read PINS** (§4): the mutation moves into the pass's own
   reads, the historical two-read premise is recorded as retired with the two-pass code, and
   each pin's discriminating power is proven against its named weakened build. An adapted
   pin is not claimed as a red against the shipped code — it is deliberately green there.
3. **Two-pass-structure cases retire** — `stale-verdict` "was/now" messages, spy sequences
   asserting the preliminary pass, `revalidate.test.ts`'s revalidation-callback premises —
   each named in the plan with its §3.2 deletion as the reason, none silently dropped.

The current fence suite (zero-reads spies) retires with the fence. The account of every
restored, adapted and retired case — with the class it falls in — is a table in the plan, so
"restored, not rewritten" is checkable rather than asserted.

### 8.2 Suite discipline

- Every §4 red is a VALUE assertion failing for the asserted reason — a crash, a `no tests`
  collection, or an absent-assertion "red" does not count; reds are quoted in the plan with
  their failure output.
- Negative requirements carry positive twins through the same mechanism (a "never driven"
  case beside a "driven when authorized" case), so a scanner that refuses everything cannot
  pass the suite.
- Every guard states its premise executably (`tests/_shared/premise.ts`), proven on the
  case's own inputs.
- The no-ESC assertion stays dual-path: dry-run bytes and the live send spy
  (`driver.test.ts` AC-18), unchanged.
- Mutation: re-measure after the last source edit; `pnpm mutation:sites` before any push
  touching enrolled source; killer audit per the plan (weaker-implementation table derived
  from §4's fourth column, not recall).

---

## 9. Acceptance criteria

- **AC-1** With the fence removed, each sending mode authorizes from one read-once pass: a
  spy on every `Surface` read member records at most one call per member per sending
  invocation, and no decision input is carried from outside the invocation. (Chain 4's
  structural red.)
- **AC-2** `--compact`'s nonce comparison uses the pass's marker copy (`checkpointNonce`); a
  marker mutated after the pass's marker read is not re-read (spy) and cannot alter the
  decision.
- **AC-3** The §4 structural cover is demonstrated red against the shipped two-pass
  structure and green under §3, with failure output recorded; each §4 behavioral pin is
  demonstrated to kill its NAMED weakened build (kill output recorded) — no pin ships
  PRESENT-BUT-UNPROVEN.
- **AC-4** Every refusal names the condition that fired; the roster-disappearance case names
  disappearance, never a nonce reason. (Restored lying-refusal pin.)
- **AC-5** `--resume` refuses on any rule 1–8 observation and does not require
  `COMPACT`/`FORCE`; `--checkpoint`/`--compact` additionally require `COMPACT`/`FORCE` —
  all derived from the invocation's own pass.
- **AC-6** `--dry-run` on each mode runs the identical gate, prints that command's bytes
  byte-exactly — §3.6's literal texts with `<NONCE>`, `<SESSION>` and `<BRANCH>` substituted,
  both address-line forms covered — sends nothing, writes nothing, consumes nothing.
- **AC-7** No `\x1b` byte on the dry-run path or the live send path (spy), across every
  command.
- **AC-8** The nonce stays single-use: consume precedes send; an immediate re-run of
  `--compact` refuses; the refusal tells the operator to re-checkpoint.
- **AC-9** The tool performs no post-send reads: a spy across every live-send case records
  zero `Surface` read-member calls after the sink fires; the write-up documents the
  operator's post-send pane read as procedure (§3.3, §10).
- **AC-10** The fence block is gone; no flag replaces it; `--checkpoint`, `--compact`,
  `--resume` and their `--dry-run` forms execute their §3 flows.
- **AC-11** sendAuthScan's live-tree scan passes with the pass marker on the authorization
  function; the adapter's enrolment row is unchanged.
- **AC-12** `paneCompactionCore`'s gate passes at its floor on the final source, with the
  score and survivor set stated in the round-1 diff brief and re-derived through the shipped
  `score()` for any quoted number.
- **AC-13** The write-up and AGENTS.md no longer state that the modes are disabled; the
  `_metaPaneCompactionContract` pins (no-interrupt, `\x1b`, never-commits, band values)
  still pass.
- **AC-14** The checkpoint text still instructs against committing, and the driver never
  commits.
- **AC-15** Both prompt payloads open with §3.6's address line on every live and dry-run
  path; the with-session and branch-only forms are each pinned byte-exactly; no payload
  ships unaddressed; the resume payload carries the marker-outranks-this-message deference
  line. The deference closes the `blockedOn` decay class only — the prose-pin meta-test
  (§10) asserts the spec and write-up state the bounded classes as bounded, so the round-4
  overclaim cannot silently return.
- **AC-16** Nonce-mint exhaustion is a named fault: a `Surface` whose `random()` always
  collides with the marker's nonce yields exit 2 naming the broken random source — never an
  uncaught throw (§3.7).

---

## 10. Documentation deliverable

`docs/agents/orchestrator-pane-compaction.md` loses its fence banner and gains one paragraph
of operator procedure: after each live command, read the target pane back before sequencing
the next step (ok describes the transport, never delivery), send `/compact` into an empty
queue, and the queued-merge / dropped-first-send / usage-wall limits (§7 limits 2–5) —
operator procedure lives there, not in AGENTS.md. AGENTS.md's "Compacting another session's pane" bullet updates
its first sentence to the shipped-enabled state and keeps its four load-bearing rules
(nothing interrupts; nonce proves the checkpoint; `--resume` has its own predicate; `--as`
explicit) — all still true under this spec. The 2026-08-16 design's §7 "[SHIPPED DISABLED]"
limit is annotated as superseded by this spec with the date, not deleted: it is a historical
record of the fence decision. `tests/docs/_metaPaneCompactionContract.test.ts` continues to
pin the sentences that must survive; its pins do not reference the fence, verified at
drafting.

---

## 11. Out of scope

- Interrupting a target, for any reason (§1.1).
- Parsing pane text, queue hints, or any display string for meaning (§7 limit 4).
- A cross-orchestrator lock or "exactly one compaction" guarantee (§1.1).
- Changes to the classifier, the twelve rules, the bands, or the read-only surfaces beyond
  the pass-marker/wiring seam (§1.1).
- `PreCompact`/`SessionStart` hooks, auto-compaction thresholds, compacting the orchestrator
  itself, judging checkpoint content (2026-08-16 design §11 — all inherited).
- Delivery classification, retry loops, or send-until-confirmed behavior (§1.3, §3.3).
- A target-side pre-issued authorization grant — coherent, collapses into the pass as one
  more field, and declined with reasons in §1.3; adding it later is a spec revision, not an
  implementation patch.
