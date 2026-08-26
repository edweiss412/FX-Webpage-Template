# speclint dispatch gates — the wrapper refuses an unlinted artifact, and the AC check runs both ways

Closes `BL-CODEX-GUARD-SPECLINT-PREDISPATCH-GATE` (`BACKLOG.md:818`) and
`BL-SPECLINT-AC-UNCLAIMED` (`BACKLOG.md:25`). Both are the same defect at two
ends of one pipe: a mechanical check that exists and does not run where it would
have paid.

## 1. Problem

**The wrapper embeds the lint report and never acts on it.** `scripts/codex-guard.mjs:1873`
runs the real `spec:lint` for every `--lint-doc` before composing the prompt and
embeds each report. The only status it refuses on is one outside `{0, 1}`
(`scripts/codex-guard.mjs:1920`), which is the infra-fault case — "not the CLI,
or not one this contract knows". A document with hard failures exits 1 and
dispatches normally, its failures disclosed to a reviewer who is then expected to
notice them. Worse, `--lint-doc` is opt-in: `docs/agents/spec-self-review.md:25`
mandates attaching the report to every spec and plan dispatch, so the obligation
is a paragraph and the mechanism is a flag nobody has to pass.

Three committed incidents, all of a class `pnpm spec:lint` prints in under a
minute. `fix/control-outline-border-token` spent spec review R1 F2 on 18 hard
`CITATION_MALFORMED` failures in the empty-path `` `:213` `` form and R2 F5 on 13
more (`docs/review-rounds/fix/control-outline-border-token/2ddbf038bdf4.jsonl`,
rounds 1 and 2) — two of sixteen findings across four rounds, roughly an eighth of
that arc's reviewer attention. `feat/speclint-red-reason-verification` then spent
a diff-round-3 finding on its plan failing its own `spec:lint` with the same
empty-path form, and filed the defect independently as
`BL-SPECLINT-SELFLINT-NOT-IN-PREDISPATCH-GATE`, blind to the row above because
that row sat on an unmerged branch
(`docs/review-rounds/feat/speclint-red-reason-verification/c9c71b947a85.jsonl`).

A reviewer is blind to a gate-red by construction: Codex runs sandboxed and
read-only and never executes the gates. So the gate has to run before the
dispatch or it does not run at all.

**The AC check runs one way.** `lib/specLint/taskContract.ts:376` fires
`TASK_AC_UNRESOLVED` when a task marker's `ac=` cites an id that appears nowhere
in the plan's own text. Nothing fires in the other direction, so a plan may
declare an acceptance criterion that no task marker claims — no task is scheduled
to write that assertion, and the plan lints clean. Plan review round 1 of
`fix/screenshots-drift-instrument` raised exactly that as a BLOCKING finding
("AC-2 has no executable owner") against a plan `spec:lint` had just passed at
0 hard (`docs/review-rounds/fix/screenshots-drift-instrument/50ca72a566b0.jsonl`).

Underneath it sits a second defect. `resolvesId` (`lib/specLint/taskContract.ts:118`)
is a word-boundaried regex over every non-marker line, so **any occurrence in
prose satisfies a citation**. A marker may cite `ac=AC-9` against a plan that
merely mentions AC-9 in a sentence, and the check reports clean.

## 1.1 Resolved scope — do not relitigate


- **The embed stays.** Embedding each lint report in the prompt is shipped
  behaviour `docs/agents/spec-self-review.md:25` depends on. This adds a refusal;
  it does not remove the disclosure.
- **The `{0,1}`-only status check at `scripts/codex-guard.mjs:1920` stays.** It is
  the infra-fault refusal and is orthogonal to the hard-failure refusal. Both
  ship; neither replaces the other.
- **Advisory findings do not block.** Advisory noise is normal in probe-record
  artifacts; blocking on it would be its own waste.
- **`resolvesId`'s marker-line exclusion stays** (`lib/specLint/taskContract.ts:122`,
  "an id cannot satisfy itself"), pinned at `tests/specLint/taskContract.test.ts:499`.
- **No path extraction from brief text.** §3.3, with its reason.
- **No body-grammar AC declaration.** §4.1, with the 60-of-100 measurement that
  settles it.
- **The guard-surface separator grammar is not widened** to accept English
  conjunctions. §5.
- **The one-row `ORPHAN_ALLOWLIST` and the `WrappedTile` KEEP are untouched.**
  Retention is ratified; the archive move does not reopen it.
- **The seven `###` sub-rows under the nullcode container stay open and in
  place.** Their disposition is not this arc's.

## 2. Scope

In: the pre-dispatch refusal in `scripts/codex-guard.mjs`, the AC arm in
`lib/specLint/taskContract.ts` with its wiring, the guard-surface refusal's
message and the AGENTS.md line it mirrors, and the graduation of two bookkeeping
ledger rows.

Out: the embed itself (a reviewed, shipped behaviour `docs/agents/spec-self-review.md:25`
depends on — this adds a refusal, it does not remove the disclosure); the
`{0,1}`-only status check at `scripts/codex-guard.mjs:1920` (the infra-fault
refusal, orthogonal and unchanged); `resolvesId`'s marker-line exclusion
(deliberate, pinned at `tests/specLint/taskContract.test.ts:499`); blocking on
advisory findings.

## 3. The lint gate

### 3.1 What it does

On `--stage spec` or `--stage plan`, in the pre-dispatch validation phase:

1. **Coverage.** At least one `--lint-doc` is required. A spec or plan dispatch
   naming no artifact is refused.
2. **Enforcement.** EVERY `--lint-doc` is checked, and any whose report carries
   one or more hard findings refuses the dispatch, naming each failing file and
   its hard count. The wrapper already accepts the flag repeatably
   (`scripts/codex-guard.mjs:82`) and real dispatches cite a spec plus its
   probe records, so a gate reading only the first document would dispatch a
   hard artifact whenever a clean one was named ahead of it — and would pass
   every single-document test. The refusal names ALL failing documents in one
   message rather than the first, so one run fixes one round.

Both refuse through the existing `usageError` (`scripts/codex-guard.mjs:45`),
which writes to stderr and exits 2 — before any lock, dispatch, result artifact, or
corpus row, the same position and the same contract as
`checkGuardSurfaceDeclarations` (`scripts/codex-guard.mjs:526`).

**Advisory findings never block.** Advisory noise is normal in probe-record
artifacts and blocking on it would be its own waste.

The hard count comes from the report the arm already produces — the
`summary: <hard> hard, <advisory> advisory` line rendered at
`scripts/spec-lint.ts:208`. One extractor, one spawn: the arm reuses the existing
invocation at `scripts/codex-guard.mjs:1873` rather than adding a second spawn
site.

**`embedReport` does not validate that line's grammar, and the gate must not
assume it does.** Its clauses (`scripts/codex-guard.mjs:312-368`) check that a
`summary:` line exists, is unique, and is last — not that a count can be read
out of it. Probed: a report whose final line is `summary: banana` passes
`embedReport` intact. An extractor that fell back to zero on that would dispatch
a hard artifact while every frame clause stayed green, which is the silent-wrong
case the consequence bound rules out. So the count extraction is a THIRD refusal,
not a parse with a default: a report that exits 0 or 1 and whose summary line
does not match `summary: <int> hard, <int> advisory` exactly is refused as an
infra fault, naming the file and the line it could not read. This is distinct
from the `{0,1}` status check at `scripts/codex-guard.mjs:1920`, which is about the exit code and is
untouched; both refuse, for different reasons, and the tests plant both.

### 3.2 The escape

`--no-lint-gate`, a bare boolean in the shape of `--fallback`, waives both arms.
A brief may legitimately review an artifact that is mid-repair, and a run that
declares that is doing something different from a run that forgot to lint.

### 3.3 How the artifact is resolved, and why not by extraction

**The artifact is whatever `--lint-doc` names. There is no resolver.**

Rejected, and fenced in both directions so neither side relitigates it:

- **Extracting paths from the brief text.** A recogniser over an open document
  grammar is the ratchet shape: every round widens it by one corner and the wider
  recogniser is a bigger target for the next round. The wrapper already has a
  `--lint-doc` flag that resolves against `--cwd` and refuses a path outside the
  repository (`scripts/codex-guard.mjs:188-195`); a second, fuzzier path is a
  liability, not a feature.
- **Reusing `--artifact`.** It is fenced behind `--fallback`
  (`scripts/codex-guard.mjs:186`) and means something else — the companion
  app-server wedge rescue. Overloading it would make one flag mean two things
  depending on a second flag.

### 3.4 Blast radius, measured

`tests/codexGuard/harness.ts:189-190` injects `--stage spec --round 1` when a
test passes neither, so **the default stage for the whole codexGuard suite is
`spec`** and the coverage arm would refuse most of roughly 117 `runGuard` call
sites at once. Requiring every one of them to plant and lint a document would be
a rewrite of the suite and would add a `tsx` + `spec-lint` spawn to each.

So the harness injects `--no-lint-gate` the same way it already injects `--stage`
and `--round`: one edit in one place, and tests that are not about this gate stay
about what they are about. The refusals get dedicated tests that pass the flags
explicitly and do not take the default — the same shape `--stage` and `--round`
themselves use, where the harness supplies a value and `tests/codexGuard/usage.test.ts`
proves the requirement.

### 3.5 What the tests must show

Per the inherited contract at `tests/codexGuard/guardSurfaceGate.test.ts:1-30`,
every rejecting case asserts **zero fake-codex calls** and writes an APPROVE
scenario first — without one the fake codex exits before recording a call and the
zero-call half would hold even had the gate dispatched. A rejected brief takes no
lock, writes no result artifact, and appends no corpus row.

Documents are planted in a real git checkout and linted by the real CLI, per
`tests/codexGuard/lintDoc.test.ts:29-38`; expected values are derived from a live
run, never hardcoded.

The premise each refusal test must carry: a fixture that would otherwise
dispatch. A hard-failing fixture proves the refusal only if the same fixture with
zero hard findings dispatches, so both halves are asserted in the same file.

## 4. The AC arm

### 4.1 The corpus decided this, not taste

100 plans under `docs/superpowers/plans/**` carry `<!-- tasks: depth=`. All 100
cite at least one `AC-` id from a task marker. A candidate body grammar —
a list item or ATX heading whose content begins with the id, the shape the row
names and the shape `docs/superpowers/plans/2026-08-15-theme-persistence-note/plan.md:51`
uses — was run against all 100:

| measure | count |
| --- | --- |
| plans declaring at least one id under the body grammar | 56 of 100 |
| plans flagged UNCLAIMED (declared, cited by no marker) | 25 of 100 |
| plans flagged UNDECLARED (marker cites an id the grammar does not declare) | 60 of 100 |
| ... restricted to plans that declare at least one id | 16 of 100 |

**These are the v2 numbers.** Spec review R1 refuted v1's with three
corpus-demonstrated grammar defects, all repaired in the committed probe: the id
regex accepted only dot-separated segments and so split the live hyphenated
`AC-2b-pattern`
(`docs/superpowers/plans/ci/2026-08-16-modal-wait-boundary-helper-adoption.md:24`),
against `lib/specLint/taskContract.ts:38` which accepts `[.-]`; secondary ids
were collected from a 200-CHARACTER window, which counted a cross-reference to
another document's id as a declaration here (`AC-11.11` at
`docs/superpowers/plans/2026-08-09-help-report-surface.md:61`, on a line that
declares AC-6); and the same window truncated CITED ids on long marker lines.
The corrected grammar moves 58 to 56 and 18 to 16 and leaves 25 and 60 where they
were, so the structural reading below survives its own repair — but the v1
claim that all 25 are real drift does not, and is withdrawn in §4.4.

The 60 is the decisive number, and it is not measuring drift. It is measuring the
grammar. In 42 of the 100 plans the acceptance criteria are **not declared in the
plan at all** — they live in the sibling spec, and the plan carries only a
coverage map. Four live shapes, all sampled:

- a table row: `| AC-1 numeric half, sentence scope | Task 1 | … |`
  (`docs/superpowers/plans/2026-08-20-claim-sweep-after-repair.md:841`)
- a coverage line: `AC-1 Tasks 3+6 · AC-2 Task 3 · AC-3 Tasks 1+4 · …`
  (`docs/superpowers/plans/2026-08-09-admin-dashboard-row-actions.md:140`)
- a spec back-reference: `Spec §8: AC-1 (Task 1), AC-2/AC-3 (Task 2), …`
  (`docs/superpowers/plans/2026-08-15-step3-tap-cluster/plan.md:113`)
- a task heading: `### Task 1: Un-gate the fetch, gate the return (AC-1..AC-7)`
  (`docs/superpowers/plans/2026-08-07-projection-financials-viewer-independent.md:31`)

A definition that reds 60 of 100 plans is a definition, not a finding. No body
grammar can be right here, because the corpus genuinely holds four conventions
and one of them puts the declaration in another file.

### 4.2 The design decision, and how it was taken

R1 finding 1 is correct and it is the reason this section changed. The first draft declared criteria by an opt-in region marker, on the
`acCoverage` precedent. The objection that lands: **no plan carries the marker,
nothing requires a future plan to add it, and every live example the spec itself
cites still lints clean after this ships.** That is a silent false negative
across the whole declared probe domain, and §10's consequence bound allows a
conservative REFUSAL or a conservative FLAG — not silence. The design closed the
row on paper. `acCoverage` is also a weaker precedent than the draft claimed: it
governs one optional table a plan may or may not have, whereas this row concerns
acceptance criteria in enrolled plans generally.

Together with §4.4 the position is:

- A corpus-wide mechanical check **cannot** ship, because the inference it rests
  on is false for a 19-instance documented convention. It would red 25 merged
  plans, most of them correctly written.
- An opt-in check **can** ship and closes nothing, which R1 establishes.

Both branches were real and the choice changed this arc's scope, so it went to the
orchestrator. **Ruled 2026-08-26: branch (A), migrate.** The alternatives and the
reasoning are kept because the decision is the load-bearing part of this section:

- **(A) MIGRATE — RULED.** The body grammar IS the declaration; an id that no
  marker cites must carry an explicit disposition on its own declaring line.
  Closes the row live and permanently. Costs a one-line edit to each of the 25
  flagged plans, in this PR.
- **(B) Opt-in region.** Rejected: a silent false negative, which fails the
  consequence bound in §10. The row's own incident would not have been caught.
- **(C) Ship the lint gate alone and re-file the AC premise defect.** Rejected:
  re-filing is a process-facing ledger row, which this arc's directive and the
  process mint freeze both forbid.

**Constraints on (A), ratified with the ruling and binding on the implementation:**

1. Each of the 25 edits states ONLY what that plan's prose already says — a
   `RETIRED` or a discharged-by-Task-N, cited from the plan's own line. Never a
   reinterpretation, and never an inference from task structure.
2. A plan whose prose does NOT settle the disposition is not given one. It goes
   in the PR body under "Unfixed peers" and stays flagged.
3. The convention gets ONE paragraph in `docs/agents/writing-plans.md`, not in
   `AGENTS.md`.
4. The gate's probe domain is the live plans corpus, and its done condition is
   **zero unclaimed ids on that corpus** — a number, checkable, external to the
   guard.

Constraint 2 is what keeps this from being the reinterpretation the corpus would
punish: §4.4 found three categories under one flag, and only the plan's own text
can say which one an id is in.

The lint gate (§3) never depended on this and is unaffected by the ruling.

### 4.2.1 Declaration and disposition edge cases

R1 finding 3 asked for behaviour and a signal on every marker edge case. Branch
(A) has no region marker, so most of that table is moot — but the same duty
applies to the declaration and disposition grammar, and "one ordinary edit from
the supplied syntax" is the same fence:

| case | behaviour |
| --- | --- |
| a declaration inside a fenced code block | inert. The document model elides fenced blocks, so a plan documenting the convention neither declares nor disposes. |
| a near-miss disposition (misspelled, wrong case) | the id stays unclaimed and is REPORTED. The grammar is closed and fails toward the finding, never toward silence — an accept-set, not a deny-set. |
| a disposition on a line that declares two ids | disposes BOTH, matching how the line declares both (`- AC-10 … + AC-10b …`). A plan needing to dispose one and not the other splits the line. |
| a disposition on a line declaring nothing | inert, and not an error: an ordinary sentence may contain the word. |
| an id declared twice, disposed once | disposed. The id is one criterion; the plan mentioning it twice is not two criteria. |
| a cited id that is also declared and disposed | claimed, and the disposition is redundant but not an error. A task claiming it is stronger evidence than a line saying someone else will. |

The accept-set direction is what matters here: an unrecognised disposition
reports the id rather than exempting it, so a typo costs a visible finding and
never a silent pass.

### 4.3 The codes, under the ruled design

Both hard, exit 1, rendered `FAIL`, never `ADVISORY`.

- **`TASK_AC_UNCLAIMED`** — an id the plan declares in its body that no task
  marker's `ac=` cites AND whose declaring line carries no disposition. Reported
  on the declaring line. This is the row's defect: no task is scheduled to write
  that assertion, and nothing on the line says otherwise.
- **`TASK_AC_UNDECLARED`** — a marker citing an id the plan does not declare, in
  a plan that carries at least one declaration. Reported on the marker line. This
  is the passing-mention defect: today `resolvesId` accepts any prose occurrence.

`TASK_AC_UNRESOLVED` is unchanged: a cited id appearing nowhere in the plan at
all. The three never fire on one id — `UNRESOLVED` needs no occurrence,
`UNDECLARED` needs an occurrence that is not a declaration, and `UNCLAIMED` needs
a declaration.

**The disposition grammar**, closed and drawn from what the corpus already
writes (§4.4):

- `RETIRED` on the declaring line, and
- a discharged-by reference naming the owning task.

A disposition exempts the id from `TASK_AC_UNCLAIMED` and from nothing else.
The gate does not read the reason, judge it, or check that the named task exists
— presence, not prose quality, the same posture the guard-surface arm takes at
`scripts/codex-guard.mjs:526`. What makes it honest is constraint 1 in §4.2: the
author may only write what the plan already says.

**`TASK_AC_UNDECLARED` remains opt-in and does not ship corpus-wide**, under this
branch as under any other: 42 of the 100 plans declare their criteria in the
sibling spec, so requiring a plan-body declaration for every cited id reds 60 of
100 (§4.1). It fires only in a plan that already declares at least one id.

### 4.4 What the 25 unclaimed plans actually are

The first draft claimed all 25 were real drift. **That claim is withdrawn.** R1
refuted it, and reading the 25 splits them three ways:

1. **Real drift** — a criterion nobody scheduled.
2. **Discharged outside the marker region, said in prose.** This is an
   ESTABLISHED convention with its own wording, not an oversight. The clearest
   statement of it is
   `docs/superpowers/plans/ci/2026-08-16-modal-wait-boundary-helper-adoption.md:24`:
   "**AC-6 is discharged by Task 12**, which sits outside the red-contract region
   (bookkeeping-and-merge tail, not a TDD unit) and so states its discharge in
   prose along with the red-then-green it must still observe." A grep for that
   family of phrasing across the plans corpus returns 19 occurrences.
   `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md` is the same shape: AC-3,
   AC-4 and AC-7 are named in the `## Task 10` heading at `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:207`, and Task 10 is
   a CI-evidence procedure with no executable red, so it carries no marker.
3. **Deliberately RETIRED, argued at length.**
   `docs/superpowers/plans/ci/2026-08-24-mutation-scratch-fs-event-storm.md:93`
   declares AC-6 RETIRED with the deferred tier, and
   `docs/superpowers/plans/ci/2026-08-24-mutation-scratch-fs-event-storm.md:165`
   gives the arithmetic for it.

**So the row's premise does not hold on this corpus.** The row reasons that an
unclaimed criterion means "no task is scheduled to write that assertion". For
categories 2 and 3 that inference is false, and those categories are not a
handful of stragglers: they are a documented convention with 19 instances.

Scoping does not rescue it. The obvious narrowing is the `red-contract` region,
an EXISTING opt-in whose semantics are exactly "this region's tasks carry
executable red" — 47 of the 100 plans use it. Measured: 15 of those 47 still
flag, the same ~32% rate as the whole corpus. There is no subset of the corpus
where "declared and unclaimed" means what the row says it means.

This is why the ruled design (§4.2) makes the plan state the disposition rather
than having the gate infer it. Three categories sit under one flag, and only the
plan's own text can say which one an id is in — which is also why constraint 1
forbids the author from writing anything the plan does not already say.

### 4.5 Wiring

Each new code gets a `CODE_FIXTURES` row at `tests/specLint/taskContractWiring.test.ts:74`
and the count in the title at `tests/specLint/taskContractWiring.test.ts:180` moves from ten to twelve. That test asserts
hard severity, exit 1, and rendered `FAIL` per code.

The class sweep is derived, not enumerated, and the first derivation this spec
proposed was wrong in a way worth recording. It claimed nine `fail(...)` sites
against ten `CODE_FIXTURES` rows and concluded `TASK_ENROLL_EMPTY` was raised by
some other means. It is not: it is raised through `fail` like every other code,
at `lib/specLint/taskContract.ts:259`, merely formatted across four lines. The
nine was an artifact of a same-line `grep 'fail("TASK_'`; the file has twelve
`fail(` occurrences and ten distinct codes.

That also kills the repair the first draft proposed. Unioning a same-line
extraction with the `CODE_FIXTURES` keys and comparing the union back to those
keys is circular: the fixture registry supplies the very member the production
census failed to find, so a NEW multiline-formatted code with no fixture would
pass. The cover is therefore taken from the production source alone, parsed
rather than grepped — every string literal in first-argument position of a `fail`
call — and asserted equal to the `CODE_FIXTURES` key set. A code the parser
cannot see is a code the sweep reports missing, which is the direction that
matters.

## 5. The guard-surface refusal's message

Collateral in the same file, repaired here because the arc is already in it.

`MUTATION_SCORE_ARM` (`scripts/codex-guard.mjs:497`) admits only whitespace or one
of `[,;—–-]` between the fraction and the survivor phrase. AGENTS.md describes the
line in prose as a score **plus** "0 unaccepted survivors" **plus** `OPERATORS:`,
so a contributor transcribing that sentence writes the word "plus" and is refused
— and the refusal message repeats the same prose and shows no conforming line.

**Probed at head `37e976231`.** The brief routing this arc reported the refusal
exiting 0. It does not:

| invocation | exit | result artifact |
| --- | --- | --- |
| foreground | 2 | none |
| backgrounded, then `wait` on the child | 2 | none |
| backgrounded, caller reads the launcher | 0 | none |

The wrapper is correct. What the earlier measurement caught was the launcher's
status, not the wrapper's — and since AGENTS.md tells every dispatch to launch
backgrounded, the exit status of EVERY usage refusal is structurally unavailable
to a caller shaped that way. That is recorded as a documented limit (§7), not
repaired by writing a result artifact on refusal: "a rejected brief takes no lock,
writes no result artifact, and appends no corpus row" is the pinned contract at
`tests/codexGuard/guardSurfaceGate.test.ts:1-30`, and contradicting it to paper
over a caller-side bug is the wrong direction.

What ships: the refusal message prints one conforming line verbatim, and the
AGENTS.md "Guard-surface briefs" bullet shows that same line instead of the
conjunction prose. **The separator grammar stays closed** — it is not widened to
accept English words. The docs show the form; the grammar does not chase them.

## 6. Ledger graduations

Neither row ships code. A graduation is leaving the open queue, so both use the
`BL-TEST-PG-CLIENT-TEARDOWN` shape at `BACKLOG-archive.md:7327-7331`, and both
register in `BACKLOG_GRADUATED` (`tests/docs/_metaDeferralLedgerGraduation.test.ts:99`)
with `provenance: "feat/speclint-dispatch-gates"`.

- **`BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`** reached its terminal state
  2026-08-03: four components retired with named superseding commits and named
  live successors, one (`components/shared/WrappedTile.tsx`) retained by the
  ratified KEEP at
  `docs/superpowers/plans/crew/2026-06-15-crew-page-redesign-phase1/04-layout-migration-closeout.md:10`.
  `tests/components/_orphanedComponents.ts` and its meta-test are **not touched**:
  the allowlist row's `backlog:` citation resolves against both ledgers via
  `ledgerFiles()` (`tests/docs/_metaLedgerReferentialIntegrity.test.ts:67`), so the
  move keeps it resolvable, and editing it would break a pin doing its job.
- **`BL-NULLCODE-STAMP-BATCH-2`** — the container heading only. Its working order
  is complete (PR2 #592, PR3 #610, PR4 #621, PR5 #623, PR6 #624), and its own text
  says "the heading is not a topic."

**The cut runs heading-to-any-next-heading, and the next heading after the
nullcode container is a `###`, not a `##`.** Seven `###` sub-rows sit under it and
every one is a separate ledger entry
(`tests/docs/_metaLedgerReferentialIntegrity.test.ts:42`), every one still open.
Moving a sub-row with the container is the defect this section exists to prevent
and it is invisible to a diff read at speed, so the archive is proved by heading
set arithmetic: count `^#{2,3} BL-` headings in both files before and after,
assert exactly the two intended `##` headings moved, that BACKLOG gained nothing,
that the archive lost nothing, that no id is both open and archived, and that all
seven sub-row ids are still present in `BACKLOG.md` **named individually in the
assertion**.

The same window is why the container's IN PROGRESS marker sits on its own line
rather than in a meta line: the ledger field window is the first 12 lines of the
entry body, and from a `##` container heading it reaches past the container into
the first `###` sub-row.

## 7. Documented limits

1. **A backgrounded dispatch hides every usage refusal's exit status.** The
   wrapper exits 2 correctly; a caller that reads the launcher rather than the
   child reads 0 for every refusal, this gate's included. Probe in §5. The
   mitigation is the dispatch form, not the wrapper: launch backgrounded, wait on
   the child, and read the child's status.
2. **The lint gate covers what `--lint-doc` names and nothing else.** A dispatch
   that names one of two artifacts is gated on the one it names. The coverage arm
   makes "named nothing" impossible on a spec or plan stage; it cannot make
   "named the wrong one" impossible, and no non-extracting design can.
3. **`--no-lint-gate` is a real escape and is meant to be used.** A run that
   declares it is doing something different from a run that forgot. The gate does
   not distinguish a good reason from a bad one.
4. **The disposition is trusted, not verified.** The gate checks that a
   declaring line carries one; it does not read the reason, judge it, or confirm
   the named task exists. Presence, not prose quality — the same posture as the
   guard-surface arm. The honesty of a disposition rests on §4.2's constraint 1
   and on review, not on the gate.
5. **`TASK_AC_UNDECLARED` does not ship corpus-wide.** In 42 of the 100 plans
   the criteria live in the sibling spec and the plan carries only a coverage
   map, so requiring a plan-body declaration for every cited id reds 60 of 100
   (§4.1). It fires only in a plan that already declares at least one id.
6. **The whole arm is inert in a plan with no task region.** `checkTaskContract`
   returns early unless the kind is `plan` and a `tasks:` line is present
   (`lib/specLint/taskContract.ts:314`), so a plan that declares criteria and
   enrols no tasks is unchecked. Conservative (silence, not a wrong answer), and
   consistent with the arm's scope, but an author cannot distinguish it from
   clean.
7. **The count extractor refuses rather than defaults.** A `summary:` line that
   does not match the exact count grammar is an infra fault, not a zero (§3.1).
   A renderer change to that line therefore blocks dispatches until the grammar
   is updated — loud, and deliberately so.
8. **The guard-surface separator grammar stays closed.** A brief writing "plus"
   is refused; the message and the docs now show a conforming line. Widening the
   grammar to accept English conjunctions is declined in both directions.

## 8. Dimensional Invariants

N/A — no UI surface. This spec renders nothing. It is classified as a UI spec by
`lib/specLint/sections.ts`'s `isUiPath` because §6 cites
`components/shared/WrappedTile.tsx` as the ledger row's retained component; that
citation is a record of a ratified retention, not a surface this spec designs.
The closeout marker is `impeccable-gate: N/A — no UI surface` for the same reason.

## 9. Transition Inventory

N/A — no UI surface, per §8. The gates added here have two outcomes each, refuse
or proceed, and neither is a visual state.

## 10. Acceptance criteria

- AC-1: on `--stage spec|plan`, a `--lint-doc` whose report carries hard findings is refused with exit 2, naming the file and its hard count, with zero fake-codex calls, no lock, no result artifact and no corpus row; the same document at 0 hard dispatches unchanged.
- AC-2: on `--stage spec|plan`, a dispatch naming no `--lint-doc` is refused with exit 2; `--no-lint-gate` waives both arms; `--stage diff` and `--stage task` are untouched.
- AC-3: advisory findings never refuse — a document with advisory findings and 0 hard dispatches.
- AC-4: `TASK_AC_UNCLAIMED` fires on an id the plan declares that no marker cites and whose declaring line carries no disposition; hard, exit 1, rendered `FAIL`. A disposition on that line exempts it and nothing else, and an unrecognised disposition still reports.
- AC-5: `TASK_AC_UNDECLARED` fires on a marker citing an id the plan does not declare, in a plan that declares at least one; hard, exit 1, rendered `FAIL`. A cited id appearing nowhere stays `TASK_AC_UNRESOLVED`, and no id ever draws two of the three.
- AC-6: the live plans corpus reports ZERO unclaimed ids — asserted over every enrolled plan walked from disk, after the migration in §4.2. This is the done condition: a number outside the guard, checkable by anyone, that a later plan can move.
- AC-7: the guard-surface refusal prints one conforming `GUARD SURFACE:` line verbatim, and the AGENTS.md bullet shows the same line; the separator grammar is unchanged and a "plus" line is still refused with exit 2 and no result artifact.
- AC-8: both ledger rows are archived with `provenance: "feat/speclint-dispatch-gates"`, and the heading arithmetic proves the two `##` headings moved while all seven `###` sub-rows stayed in `BACKLOG.md`, each named in the assertion.
- AC-9: `taskContract` scores at or above its `scoreFloor` of 0.95 with zero unaccepted survivors at the shipping head.

impeccable-gate: N/A — no UI surface
