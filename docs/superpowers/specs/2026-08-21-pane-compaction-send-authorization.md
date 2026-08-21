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

### 1.2 The decision: one atomic snapshot per authorization

**Each sending-mode invocation performs exactly one read pass over its world, derives every
authorization predicate from that one snapshot, and then sends.** Concretely:

- One roster read, one marker read, one purview read, one nonce-record read, one git/gh read
  per worktree — captured through a read-once surface so a second read of any member within
  the pass is unrepresentable, and enforced structurally by the shipped send-auth scanner
  (§3.5).
- Classification (the twelve rules), ownership, the rule 1–8 observation stop, the
  mode's verdict gate, and — for `--compact` — the nonce equality are all **derived from the
  same snapshot**. There is no "earlier capture" for any input to be stale relative to,
  because there is only one capture.
- The decision is followed by the send, with nothing read in between.

Why this closes the class rather than narrowing the window again: the six defects were all
**read-skew** — two or more reads of one world taken at different instants, composed into one
decision (§2.2). Under a single pass the skew is not small; it is **unrepresentable**. What
remains is the decision→send window (§7 limit 1), and that window was already priced by the
shipped design: the only bytes ever sent are a checkpoint prompt, `/compact`, and a resume
prompt, each of which queues if the target is busy and interrupts nothing, so a send that
races a state change is benign (2026-08-16 design §5.5). The model therefore pairs a
zero-read-skew decision with sends whose worst stale case is a wasted prompt.

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

Stated so it cannot be relitigated. "The target must acknowledge before any byte is sent"
fails structurally, four ways:

1. **It cannot cover the first byte.** The checkpoint prompt is the first contact with the
   target. There is no channel on which a target can acknowledge a byte that has not been
   sent, so a fully general ack-before-send is incoherent at the exact boundary it claims to
   protect. Restricted to later bytes, it degenerates into "ack before `/compact`" — which is
   the shipped nonce, already present in the snapshot model (§1.4).
2. **The acknowledgment is itself a read.** The only return channel from a target is its
   marker file. Reading an ack after the authorization decision is a second read at a second
   instant — the exact shape of chain 4 (§2.2), reintroduced by design. An ack-based flow has
   MORE reads at MORE instants than the code it would replace.
3. **It cannot close the window either.** Between reading the ack and emitting the send, the
   world can still change. The model moves the window and adds reads; it does not remove it.
4. **It requires waiting on a busy party.** A compaction target is by selection near context
   exhaustion and mid-turn; input to it queues and executes at turn end (probe P1/P7). A
   command that waits for an ack is a stateful driver holding a multi-hour sequence — the
   decomposition into three one-shot commands closed exactly that defect family (round-3
   F5–F8) and is a do-not-relitigate row.

Because the losing model is structurally incoherent rather than merely inferior, this is not
the "both models genuinely defensible" escalation case the arc brief reserved; the decision is
made here and argued above.

### 1.4 What the nonce is, under the decided model

The nonce is **target acknowledgment for the one send that needs one** — proof that this
orchestrator's checkpoint prompt was executed by the target before this orchestrator sends
`/compact` — and it is **verified from within the snapshot**: the marker copy that classified
the pane is the copy whose `checkpointNonce` is compared. The snapshot model and the nonce are
orthogonal, not rivals: the snapshot answers "is the decision built from one instant"; the
nonce answers "did the checkpoint actually land before the compact". Single-use,
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
the snapshot generalizes that to the whole read surface, so "read twice at two instants"
stops being expressible for any input, not just the one chain 4 named.

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
  its nonce inputs come from the snapshot. The consume-before-send ordering and the
  refusal catalog rows (`nonce-absent`, `nonce-mismatch`) are unchanged.
- The `mintNonce` collision compare reads the snapshot marker's nonce, not an entry-time
  copy.

Deletion is the point: a comparison that exists can be incomplete (r2), and a second read
that exists can skew (r4). A comparison that does not exist cannot be the next round's
finding.

### 3.3 Delivery evidence

After every live send, the command prints a short verbatim tail of the target pane (the
existing `screen(paneId)` surface member, read once, after the send). The echo runs OUTSIDE
the authorization pass — it feeds no decision and touches no sink, so it is a reporting step,
not a send-auth read. It is clearly delimited and
**never parsed**: the tool does not classify delivery, because pane text is a display string
and the shipped posture is that display strings are never parsed for meaning (2026-08-16
design §4.3). The operator reads the echo — which is exactly the manual discipline the field
notes measured (a send that returns ok is not a send; read the pane back), wired into the
instrument so it cannot be forgotten.

Exit codes are unchanged by the echo: 0 still means "authorized and sent". A send herdr
refuses is already a named fault (exit 2, `SendFailed`), unchanged.

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

---

## 4. Acceptance floor — the six chains as executable reds

Each chain becomes a red that fails against the shipped (unfenced-for-test) code or against a
deliberately weakened build, and goes green under §3. None of the six is unrepresentable
under the snapshot model; chain 4's red converts from behavioral to structural, which is the
model working as evidence, not a gap.

| # | Chain | Red (restored or adapted case) | What kills it under §3 |
| --- | --- | --- | --- |
| 1 | Nonce captured before revalidation | Restored AC-19 set: absent nonce refuses; mismatched nonce refuses; consumed record refuses a second `--compact`; dry-run does not consume | Nonce equality derived from the snapshot marker; store read/consume inside the pass |
| 2 | Verdict-only comparison let a purview transfer through | Restored "purview transfer … refuses, having sent nothing" (AC-13) | Ownership derived from the snapshot's purview read; not a comparison against an earlier pass |
| 3 | Revalidation against the ORIGINAL roster | Restored takeover case (AC-17): `agent_session` swap between invocations refuses via rule 5 | The pass's roster read is its only roster; a swap is visible because nothing older exists |
| 4 | Marker read twice; mutation between reads preserved the nonce | **Structural**: spy asserts `marker` is read exactly once on an invocation that reaches the decision (and never more than once on any path) — red against shipped `drive()` (entry read + `authorize()` read), green after | Read-once memo; sendAuthScan MULTI-READ arm |
| 5 | `--checkpoint`/`--resume` observed once, then sent, never revalidated | Restored round-5 case: a rule 1–8 condition present at invocation time refuses each mode by RULE name; plus the `blockedOn`-flip shape asserted per mode | Every mode derives its stop from the fresh snapshot of THIS invocation |
| 6 | A labelled non-arc was driven; checkpoint sent to an orchestrator pane | Restored AC-16 pair: label resolving to no worktree branch is NOT-AN-ARC and never driven | Classification and authorization share one snapshot; rule 1 fires before any send |

Floor extensions carried with the restoration: the lying-refusal pin ("leaves the roster
refuses with THAT reason, not a nonce reason"), the no-ESC live-path spy (AC-18), the
byte-exact dry-run (AC-6), and the refused-send-is-a-named-fault case.

---

## 5. File manifest

```
scripts/pane-compaction.ts                       # fence removed; drive() rebuilt on one
                                                 #   snapshot; post-send echo; pass marker
scripts/lib/pane-compaction-core.ts              # authorization predicate (pure, enrolled);
                                                 #   runCompact loses its revalidate thunk
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

**Consequence bound.** Every invocation of a sending mode either sends under an authorization
derived entirely from one snapshot, or refuses naming the condition that fired — it never
sends on a decision assembled from more than one read instant, and it never emits a refusal
citing a condition other than the one that fired. A conservative refusal plus a surfaced
reason is a documented limit, not a finding.

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

**Closed criterion.** The six §4 reds red-then-green, the restored suite green, the no-ESC
pins green, and the mutation score above — all machine-checked. A finding claiming the
authorization can skew needs a probe from the domain showing two read instants feeding one
decision or a send after a refusal; enumeration of further hypothetical pane states is not
admissible against the bound.

---

## 7. Documented limits

Tiers as in the 2026-08-16 design: **[demote]** conservative + surfaced; **[bounded]**
bounded, not surfaced at the moment it occurs; **[residual]** accepted gap.

1. **[residual] The decision→send window.** A state change between the snapshot and the bytes
   landing is not observed by that invocation. Bounded by the benign-sends property: the only
   bytes are a queueing prompt, `/compact`, and a queueing resume prompt; none interrupts; a
   second `/compact` on an already-compacted session is a measured near no-op. This is the
   residue the model accepts instead of the read-skew class it eliminates; closing it would
   require an acknowledgment channel §1.3 rejects.
2. **[bounded] A `/compact` queued behind other pending input can merge into prose** and not
   execute as a command (field note, §2.3). Consequence: no compaction; the nonce is already
   consumed, so the operator re-checkpoints. The post-send echo surfaces the pane state; the
   tool does not parse it (limit 4). The orchestrator-side mitigation — send into an empty
   queue, verified by the pane read — is operator procedure in the write-up, not tool logic.
3. **[demote] A freshly launched pane can drop its first send** while the TUI is not accepting
   input. Compaction targets are established panes and resume targets just-compacted idle
   panes, so the launch window is not on this tool's ordinary path; where it occurs, the echo
   shows an unmoved pane and the command is re-run.
4. **[residual] The delivery echo is verbatim and unparsed.** The tool asserts nothing about
   what the echo shows; classifying delivery would be a recognizer over display strings,
   which the shipped posture forbids. The operator's read is the verification.
5. **[demote] A usage-walled target cannot compact** — compaction is itself an API call, so a
   pane idle at a quota wall accepts the text and cannot act on it. Not detectable from
   outside; the echo shows the staged text; operator procedure is to compact after the reset.
6. **Inherited unchanged** from the 2026-08-16 design §7: purview collision detection is a
   report, not a lock (two orchestrators can both send `/compact`, benign); rule 5's yield
   depends on herdr populating `agent_session`; `gh`'s no-PR signature is matched on stderr
   text and demotes to `UNDETERMINED` on reword; a marker-less worktree classifies from git
   and corpus signals alone.

---

## 8. Testing

### 8.1 Restoration first, adaptation second

The baseline is the pre-fence suite, restored verbatim from
`git show 9eaa6d6eb^:tests/paneCompaction/adapter.test.ts` — it is the accumulated kill set
of five adversarial rounds and is not re-authored. Adaptation is then minimal and enumerated:
a restored case is edited only where §3.2's deletions change an observable (a `stale-verdict`
"was/now" message that no longer exists; a spy sequence that asserted the preliminary pass),
and every such edit is justified in the plan against the chain it kills — the edit preserves
the kill, retargeting the mechanism. The current fence suite (zero-reads spies) retires with
the fence.

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

- **AC-1** With the fence removed, each sending mode authorizes from exactly one snapshot:
  a spy on every `Surface` read member records at most one call per member per sending
  invocation. (Chain 4's structural red.)
- **AC-2** `--compact`'s nonce comparison uses the snapshot marker's `checkpointNonce`; a
  marker mutated after the snapshot is not re-read (spy) and cannot alter the decision.
- **AC-3** Each of the six §4 reds is demonstrated red (against shipped or weakened code)
  then green, with failure output recorded in the plan's task bodies.
- **AC-4** Every refusal names the condition that fired; the roster-disappearance case names
  disappearance, never a nonce reason. (Restored lying-refusal pin.)
- **AC-5** `--resume` refuses on any rule 1–8 observation and does not require
  `COMPACT`/`FORCE`; `--checkpoint`/`--compact` additionally require `COMPACT`/`FORCE` —
  all derived from the invocation's own snapshot.
- **AC-6** `--dry-run` on each mode runs the identical gate, prints that command's bytes
  byte-exactly, sends nothing, writes nothing, consumes nothing.
- **AC-7** No `\x1b` byte on the dry-run path or the live send path (spy), across every
  command.
- **AC-8** The nonce stays single-use: consume precedes send; an immediate re-run of
  `--compact` refuses; the refusal tells the operator to re-checkpoint.
- **AC-9** After every live send the command prints a delimited verbatim pane tail via one
  `screen` read; the tool performs no parsing of it; exit codes are unchanged by the echo.
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

---

## 10. Documentation deliverable

`docs/agents/orchestrator-pane-compaction.md` loses its fence banner and gains one paragraph
on the delivery echo and the queued-`/compact` limit (§7 limits 2–4) — operator procedure
lives there, not in AGENTS.md. AGENTS.md's "Compacting another session's pane" bullet updates
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
