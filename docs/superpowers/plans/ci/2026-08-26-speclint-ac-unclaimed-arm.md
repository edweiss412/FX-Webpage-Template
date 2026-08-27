# Plan — the acceptance-criterion arm (follow-on)

**Spec:** `docs/superpowers/specs/2026-08-26-speclint-dispatch-gates-design.md` §4 (canonical).
**Ledger:** `BL-SPECLINT-AC-UNCLAIMED` (`BACKLOG.md`), which this arc archives.
**Status:** RATIFIED AND UNIMPLEMENTED. Nothing here has shipped.

**Why this is a separate document.** The lint-gate arm of that spec shipped in PR
#904. This arm did not. Four spec rounds established its design and its
measurements, and leaving those tasks inside the shipping plan would have made
that plan claim coverage it does not execute — a plan is read as a record of what
was done, and an unshipped task block inside a merged plan is a false one.

**What four rounds established, and what a follow-on should NOT re-derive:**

- The row's own premise is REFUTED on this corpus. "No marker cites it, therefore
  no task is scheduled to prove it" is false for a documented convention with 19
  instances, where a trailing criterion is discharged by a task outside the marker
  region and the plan says so in prose (spec §4.4).
- There is NO real-drift category. The per-id classification came back DISCHARGED
  28, UNSETTLED 7, FOREIGN-ID 4, RETIRED 1, and zero "nobody scheduled it"
  (`docs/superpowers/specs/probes/2026-08-26-ac-disposition-classification.md`).
- The declaration recognizer needed a TERMINATING cut, not a better pattern.
  Three consecutive rounds each found a new lexical class; v4 stops refining and
  declines any declaring line carrying more than one id, taking its cut from a
  COUNT rather than a pattern (spec §4.1). Both probe records are committed.
- The done condition is residue EQUALITY, fail-closed, not a flat zero — because
  constraints 2 and 4 as first ruled could not both hold (spec §4.2).

---

## 0.1 The live measurement this plan is written against

**Measured 2026-08-27 on this branch's head by running the v4 recognizer over the
corpus. Every number below is the arm's own output, not the snapshot's.**

| measure | snapshot (2026-08-26, 101 plans) | live, this head |
| --- | --- | --- |
| enrolled plans | 101 | **108** |
| plans with at least one CERTAIN declaration | 57 | **57** |
| AMBIGUOUS declaring lines | 14 across 12 plans | **13 across 11 plans** |
| plans flagged UNCLAIMED | 19, 31 ids | **19, 34 ids** |

`grep -rl '<!-- tasks: depth=' docs/superpowers/plans | wc -l` returns **108** at
this head. The snapshot's `.report.txt` has no re-runnable producer — no probe
script is committed and the report carries no provenance header — so **Task 1's
arm is the instrument from here on**, and the report's detail sections are the
migration's starting list rather than its final one. The population moves with
every merge, so re-measuring at the shipping head is a step in Task 4, not a
formality.

**Two snapshot discrepancies, settled by the arm and not by hand.**
`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:29` carries AC-4 and AC-3, so
under v4 it is AMBIGUOUS and AC-4 is **not** unclaimed: that plan needs **five**
edits, not the six the snapshot implies. And the snapshot's 31 ids predate two
merges; the live figure is 34.

---

## 1. The design, ruled

Spec §4.2 escalated the AC arm's live reach; **ruled 2026-08-26: branch (A),
migrate.** The body grammar declares, an unclaimed id needs an explicit
disposition on its declaring line, and the flagged plans are migrated in Task 4.
Four constraints ship with the ruling and bind every task below:

1. Each migration edit states ONLY what that plan's prose already says, cited
   from the plan's own line. Never a reinterpretation.
2. A plan whose prose does not settle the disposition gets none: it goes on the
   residue list with its negative evidence and stays flagged.
3. The convention gets ONE paragraph in `docs/agents/writing-plans.md`, not in
   `AGENTS.md`.
4. The probe domain is the live plans corpus. The done condition, restated after
   spec R2 finding 4 showed constraints 2 and 4 could not both hold: the corpus's
   unclaimed set equals a committed residue list EXACTLY, that list holding only
   the pairs no disposition can honestly express. Fail-closed — a new unclaimed
   id is not on the list and reds the assertion.

### 1.1 Three orchestrator rulings taken during implementation

Recorded here so no round re-derives them.

**The count cut applies SYMMETRICALLY** (2026-08-27). An id sitting on a line the
arm DECLINES — a multi-id line, a table row, a heading or list item that fails the
CERTAIN form — is neither declared nor undeclared, and `TASK_AC_UNDECLARED` never
fires on it. This is the wider ambiguous cut the same-axis recurrence rule names
as the allowed repair direction, not a positive grammar for tables. Without it the
code reds **9 plans / 71 ids** on the live corpus, because one incidental list
item beginning with an id opts a whole plan in while its real criteria live in a
table: `docs/superpowers/plans/crew/2026-08-09-private-image-pipeline.md:123` opts
that plan in, and its line 25 carries all twelve of its criteria on one prose line. With
the cut the remainder is **2 plans / 5 ids**, and those are MIGRATED to zero in
Task 4 rather than given a residue of their own.

**The decline is SILENT BY DESIGN, and that is a documented limit with a measured
reason** (2026-08-27). Recording every declined line was measured before it was
rejected: **1089 rows across 97 plans** for every declined line carrying an id,
and **609 rows across 73 plans** even when bounded to the declines that actually
suppress a finding. The cause is the corpus's own conventions — 51 of the enrolled
plans declare their criteria in a table or a coverage map rather than in a list
item — so a record that size reds on any routine plan edit anywhere in the corpus.
That is a corpus tripwire, not a fail-closed guard. The ambiguous record therefore
stays exactly as ratified (multi-id DECLARING lines only, 13 live, AC-10
unchanged), and the loudness for the symmetric cut is placed where the consequence
is: **the live `TASK_AC_UNDECLARED` set must be exactly EMPTY** (AC-6). A new plan
whose cited id is neither declared nor declined then reds, which is the row's
actual defect. This limit is restated in §12, in the archive entry, and in the
`docs/agents/writing-plans.md` paragraph Task 6 adds, each carrying these numbers
as the reason.

**The shipped plan's orphaned criteria go on the residue** (2026-08-27).
`docs/superpowers/plans/ci/2026-08-26-speclint-dispatch-gates.md` declares AC-4,
AC-5, AC-6, AC-8 and AC-9 while its markers cite only AC-1, AC-2, AC-3 and AC-7 —
the AC-arm tasks were split out by `a673d040c` and took their markers with them.
AC-9 keeps its line and is repaired into grammar (see Task 4); the other four go
on the residue quoting that plan's closeout sentence. **The owner set in spec §4.3
is NOT widened** for them or for anyone else.

Measured against the `unsettled` predicate below, those four are `unsettled` rather
than `owner-inexpressible`: the sentence that settles them names the ARM, never the
id, so no line of that plan carries an id beside an owner. `owner-inexpressible`
has exactly two live members, and both were found by running the predicate rather
than by assumption —
`docs/superpowers/plans/2026-08-16-server-action-origin-sweep.md` AC-8, whose
line 341 says AC-8 has "no task (a spec-time derivation, re-exercised by Task 5)",
and `docs/superpowers/plans/ci/2026-08-21-shell-attached-redirection-target.md`
AC-7, whose line 701 names "Step 4". Neither owner is a token the grammar admits,
and spec §4.4 forbids flattening the first into a bare `(discharged by Task 5)`.

---

## 2. Meta-test inventory

- **CREATES** `tests/specLint/acUnclaimedCorpus.test.ts (new)` — the unclaimed
  corpus equality against the committed residue, the empty-UNDECLARED assertion,
  and the residue's own admissibility check (AC-6).
- **CREATES** `tests/specLint/acAmbiguousCorpus.test.ts (new)` — the AMBIGUOUS
  declaring-line equality against the committed record (AC-10). A separate file
  from the one above deliberately, for the reason Task 5 gives.
- **CREATES** `tests/specLint/acUnclaimedResidue.ts (new)` and
  `tests/specLint/acAmbiguousRecord.ts (new)` — the two committed records, typed
  TypeScript modules the tests IMPORT rather than markdown tables they parse.
- **CREATES** `tests/docs/_metaSpecLintDocs.test.ts (new)` — the convention
  paragraph's prose pin (AC-11).
- **EXTENDS** `tests/specLint/taskContract.test.ts` (the recognizer's unit cases
  and the deciding cases for both new codes) and
  `tests/specLint/taskContractWiring.test.ts` (two `CODE_FIXTURES` rows, the
  derived cover, the count in the title).
- **No advisory-lock surface, no Supabase call boundary, no mutation surface.**
  Invariants 2, 9 and 10 have nothing to register.

**Everything the mutation harness scores lives in `lib/specLint/taskContract.ts`.**
`tests/mutation/source/registry.ts:812-820` runs exactly three deciding suites —
`taskContract.test.ts`, `taskContractFindingOrder.test.ts` and
`taskContractV2Grammar.test.ts` — so a case that must kill a mutant lives in one
of those three, or the registry row grows by that file. The two corpus tests are
deciding suites for the CORPUS, not for the recognizer. That is why Task 1 EXPORTS
the recognizer's analysis and unit-pins it in the scored suite, and why the corpus
tests consume that export instead of reimplementing it — and the export carries
the final id sets, not the raw material, so nothing downstream re-derives a
classification.

---

<!-- tasks: depth=2 red-contract -->

## Task 1: TASK_AC_UNCLAIMED, the v4 recognizer, and the disposition grammar

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` red-state=authored red-target=`lib/specLint/taskContract.ts:373` why=`the loop at :373-377 walks marker-cited ids only and there is no traversal in the other direction anywhere in the file, so a declared id nothing cites draws nothing; the cases this task adds fail against that production absence` ac=AC-4 -->

**What is red and why:** the file has exactly one AC traversal, at lines 373-377,
and it reads marker-cited ids only. Nothing in it reads the plan's body for
declarations, so the new cases fail on a production absence rather than on
anything test-local. The red command is the WHOLE FILE with **no `-t` name
filter**: a filter that matches nothing exits 0 and reports green from the moment
it is written (`docs/agents/writing-plans.md:26`), and a plan cannot pin a title
it has not authored yet.

Collect the ids the plan declares, per spec §4.1's **v4** recognizer, implementing
v4 in full rather than the leading-id rule v3 shipped:

1. Elide fenced blocks first. A declaration inside one is inert — the witness is
   the shell comment at
   `docs/superpowers/plans/2026-08-21-control-outline-forward-guard.md:326`.
2. A candidate is a list item or ATX heading whose content begins with an id,
   after at most one emphasis run, with the id's end anchored so the range form
   `AC-1..AC-7` declares nothing.
3. **Count the DISTINCT ids on the candidate line.** Exactly one makes it CERTAIN.
   More than one makes the line AMBIGUOUS: the arm declines both directions on it
   and the line is recorded.

**Distinct, not occurrences, and the corpus decides it.**
`docs/superpowers/plans/2026-08-07-ops-log-code-emits.md:56` writes `AC-2` twice on
one declaring line while explaining its proof, and that line is a single
criterion. Counting occurrences would classify it AMBIGUOUS and silently exempt a
real id; the ordinary mistake it models is repeating the id while explaining it.

**The end boundary rejects a CONTINUING dot, not every dot.** v3 passed on
`AC-1..AC-7` because the character after `AC-1` is a dot followed by another dot
rather than by an alphanumeric. v4 rejects a following dot when it continues into
an id segment (`AC-1.1`) or into the range form's second dot, and accepts it
otherwise — so the live `- **AC-2.** …` spelling still declares. Rejecting every
following dot was measured against the corpus and drops real declarations in four
plans, which is v3's silent-loss defect returning under a different rule.

Then collect the ids every `ac=` cites and report the certain-and-uncited
difference, unless the declaring line carries a disposition. A FENCED marker
cannot claim, mirroring the existing rule that a fenced marker cannot resolve.

**The disposition set is an ACCEPT-set with a stated lexical grammar** (spec
§4.3): parenthesised and end-anchored, `RETIRED` case-sensitive, owner a token
list and never free prose. The anchoring is load-bearing and has a live witness —
`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28` already ends with
"Task 10.", so a loose matcher exempts a real unclaimed id silently. An
unrecognised disposition REPORTS the id; it never exempts it. A deny-set would
fail open on the case nobody modelled, which is the direction this arm cannot
afford: to a plan author, silence and clean are indistinguishable.

**The whole AC classification is EXPORTED from `lib/specLint/taskContract.ts` as
ONE function, and `checkTaskContract` builds its findings from exactly that
return value.** It carries the certain declarations, the ambiguous lines, the
declined lines AND the final `unclaimed` and `undeclared` id sets — not the raw
material for them. This is the file's own `analyze` / `taskTopology` precedent
(`lib/specLint/taskContract.ts:308-311`), and it exists for the same reason:
deriving the same conclusion twice is how a report and a topology start
disagreeing. If the export stopped at declarations, the corpus tests would have to
reimplement marker claims, disposition handling and three-code precedence, and a
later edit to any of those could move the emitted finding while the corpus stayed
green — with `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28` as the drift
witness, whose trailing "Task 10." must keep being an UNRECOGNISED disposition.
Two structural reasons for the single owner: the mutation registry scores this
file and only this file, so a mutant that drops the ambiguous record must be
killable by a case in `tests/specLint/taskContract.test.ts`; and the corpus tests
in Tasks 4 and 5 must assert THE ARM'S OWN OUTPUT. `checkTaskContract` already receives the whole `DocModel`
(`lib/specLint/taskContract.ts:313`), so the export is self-contained.

**The scored unit cases are this task's, and they are enumerated here rather than
left to the implementer**, because `tests/specLint/taskContract.test.ts` is one of
the three suites the mutation registry runs and anything absent from it is
unscored. Task 5 asserts the LIVE ambiguous set against the committed record; this
task asserts the behaviour that record rests on. At minimum:

- a two-id line draws nothing in either direction, and a disposition on such a
  line disposes nothing (13 ambiguous lines exist in the corpus today, and a
  Task 5 asserting only equality would pass over a recognizer that had stopped
  declining);
- **an id declared twice and disposed ONCE is disposed** — spec §4.2.1's ratified
  row, and a live input rather than a hypothetical: after Task 4 disposes
  `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md` AC-3 at line 28, that id is
  still declared at line 306, and a per-line implementation would keep reporting
  it. The corpus equality in Task 4 would catch that, but Task 4's suite is not in
  the registry's three, so without this case an ordinary `some`-to-per-line
  regression is a non-equivalent survivor AC-9 discovers at closeout;
- the range form declares nothing, the `**AC-2.**` spelling does declare, and a
  fenced declaration and a fenced marker are both inert;
- every accepted disposition form exempts, each asserted on its own:
  `(RETIRED)`, `(RETIRED: superseded by AC-4)`, `(discharged by Task 10)`,
  `(discharged by Task 3 and Task 6)`, `(discharged by Task 3, Task 6)`,
  `(discharged by Task 3 + 6)`, `(discharged by Task N2b)`,
  `(discharged by closeout)`, `(discharged by the closeout)` and
  `(discharged by the PR's last commit)`;
- **every near-miss form still REPORTS, enumerated rather than described**, because
  "every near-miss form" is not a case specification and an implementation that
  tolerates one of them passes a list that never names it. The list, each asserted
  on its own: `(discharged by Task 10).` — **a trailing period AFTER the closing
  parenthesis, which is the near miss an ordinary contributor writes when starting
  from the live DISCHARGED line at
  `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28`, and which the existing
  bare `Task 10.` witness does NOT cover, since that one tests the parenthesis
  requirement rather than end anchoring after an otherwise valid disposition**;
  `(retired)` (RETIRED is case-sensitive); `(RETIRED)!`;
  `(discharged by the closeout, not by a task).` (free prose after the owner, and
  the live shape this arc repairs in the shipped plan);
  `(discharged by a later arc)` (owner outside the token list);
  `(handled by Task 10)` (wrong verb); and an unparenthesised
  `discharged by Task 10`. Each of these must leave `TASK_AC_UNCLAIMED` reported;
  the accept-set fails toward the finding, never toward silence.

## Task 2: TASK_AC_UNDECLARED, the symmetric decline, and the three-code partition

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts` red-state=authored red-target=`lib/specLint/taskContract.ts:118` why=`resolvesId at :118-126 is a word-boundaried regex over every non-marker line, so any prose occurrence satisfies a citation and a merely-mentioned id draws nothing; the cases this task adds fail against that production absence` ac=AC-5 -->

**What is red and why:** `resolvesId` accepts any prose occurrence, so a marker
citing an id the plan never declares draws nothing today. The failure is at that
production line, not in a fixture the test controls. Whole file, no `-t` filter,
for the reason Task 1 gives.

Fires only in a plan that declares at least one id, so the 51 plans that declare nothing in their own body are
untouched (spec §7 limit 5) — **and, per §1.1, never on an id sitting on a line
the arm declines.** That second cut is what keeps the code off the 9 plans / 71
ids the opt-in rule alone leaves exposed.

The partition test is the point of this task and is asserted directly: one id
never draws two of the three codes. `UNRESOLVED` needs no occurrence, `UNDECLARED`
needs an occurrence that is neither a declaration nor on a declined line, and
`UNCLAIMED` needs a declaration. The fixture that proves it declares one id,
mentions a second in prose, and cites both.

**The decline path must be provably live, not merely present.** This task also
authors the fixture Task 4's premise rests on: a plan that declares one id in a
list item and cites a second id whose ONLY occurrence is ordinary prose — no table
row, no heading, no multi-id line — must draw `TASK_AC_UNDECLARED`. Without that
case, an implementation whose decline predicate is always true satisfies every
other assertion in this plan, including the corpus's empty-set equality.

## Task 3: wire the codes

<!-- task: red=`pnpm vitest run tests/specLint/taskContractWiring.test.ts` red-state=authored red-target=`lib/specLint/taskContract.ts:373` why=`Tasks 1 and 2 add two fail() sites in production; the derived-cover case this task writes parses every fail() call first-argument literal out of lib/specLint/taskContract.ts and asserts set equality with the CODE_FIXTURES keys, so it fails on the two production codes the fixture registry does not carry. The it() title at :180 is prose and asserts nothing, so it is NOT the red-target` ac=AC-4,AC-5 -->

**What is red and why:** after Tasks 1 and 2, production raises two codes the
fixture registry does not know. The failure derives from those production lines,
not from anything test-local.

**Whole file, no `-t derived-cover` filter.** The filter would exclude the
existing all-codes behavioural case at
`tests/specLint/taskContractWiring.test.ts:180`, and that exclusion is exactly
what makes an empty fixture a viable escape: `TASK_AC_UNCLAIMED: ""` satisfies a
key-set equality while emitting nothing. Under the whole-file command that case
runs each fixture through the CLI and asserts exit 1 and a rendered `FAIL <code>`,
so a fixture that does not actually emit its code fails there. One `CODE_FIXTURES`
row per new code, single-finding each per the file's own comment at
`tests/specLint/taskContractWiring.test.ts:69`, and the count in the title moves
from ten to twelve.

The all-codes cover is derived from the production source alone, PARSED rather
than grepped — every string literal in first-argument position of a `fail` call —
and asserted equal to the `CODE_FIXTURES` key set. A same-line grep is what
produced this spec's own withdrawn "nine sites, ten codes" claim
(`TASK_ENROLL_EMPTY` is raised through `fail` at `lib/specLint/taskContract.ts:259`,
formatted across four lines), and unioning a grep with the fixture keys is
circular — the registry would supply the very member the census failed to find.

## Task 4: the corpus migration

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts tests/specLint/acUnclaimedCorpus.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:28` why=`AC-3 is declared at :28 as a CERTAIN line carrying no disposition and no marker cites it, so at this head the arm reports 34 unclaimed ids across 19 plans while the committed residue holds only the pairs no disposition can honestly express; the equality this task writes fails on that difference until every settleable pair is migrated` ac=AC-6 -->

**What is red and why:** the live unclaimed set (34 ids across 19 plans) is not
equal to the residue (the unsettleable pairs only). The gap is the migration.

**The command is an explicit TWO-file list, for the reason Task 5 states and the
same class of defect.** A corpus-only command cannot discriminate an over-broad
decline: widen the undeclared-side predicate to decline every cited occurrence and
`unclaimed` still equals the residue, `undeclared` is still empty, and the declined
count is still non-zero — this task stays green while the cut it rests on has
stopped cutting. The discriminator is Task 2's unit case (a cited id that is
neither declared nor declined MUST report), which lives in the scored suite, so
that suite runs on the same command. **This is a rule for both corpus tasks, not
two coincidences: a corpus equality never carries its own discriminator, so it is
never run alone.**

The corpus test is `tests/specLint/acUnclaimedCorpus.test.ts (new)`. It walks every
enrolled plan from disk and reads the `unclaimed`, `undeclared` and `declined` sets
straight off the single exported classification Task 1 adds — the same value
`checkTaskContract` renders its findings from, so the two cannot drift. It asserts:

1. **Equality.** The live unclaimed set equals `AC_UNCLAIMED_RESIDUE` from
   `tests/specLint/acUnclaimedResidue.ts (new)`, exactly, in both directions.
2. **The live `TASK_AC_UNDECLARED` set is EMPTY**, after the two plans named in
   §1.1 are migrated into v4 declaration form. There is no UNDECLARED residue and
   none is created; a plan that cannot be migrated without a product decision is
   declined with a recorded limit in §12 and escalated, never given a row.
3. **A premise on the empty-set assertion itself, because an empty set is what a
   dead code path also produces.** Two guards, both required: `premise()` that the
   DECLINED set over the live corpus is non-zero, so the symmetric cut is
   observably doing work here; and the Task 2 fixture in which a cited id is
   neither declared nor declined, which must RED. Assertion 2 without both is
   satisfied by a decline predicate that returns true unconditionally.
4. **Residue admissibility, so the list cannot become an allowlist — and the
   check is a PREDICATE, not a receipt.** Verifying only that a quoted line
   exists proves the quotation is real, never that the prose settles nothing: an
   `unsettled` row for `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md` AC-3
   could quote its own line 28 verbatim and pass, while that line assigns AC-3 to
   Task 10. So each row kind carries its OWN executable predicate, and they point
   in opposite directions.
   - `unsettled` — **NO line of that plan carries the id together with an owner
     word** (`Task`/`task`, `Step`/`step`, `closeout`/`close-out`,
     `the PR's last commit`), marker lines excluded. That is the classification
     rule made mechanical: "the plan's prose names the id and states the task,
     step or procedure that owns it" is exactly what the predicate looks for, and
     its absence is what the row asserts. Run against the ten live candidates it
     admits all ten and REJECTS `app-e2e-batch2` AC-3 at lines 28, 29, 207 and
     209. The row also carries `searched` and `nearMiss` with its line, and the
     quotation is still checked against that line — the predicate is the gate, the
     quotation is the reader's evidence.
   - `owner-inexpressible` — the mirror. The row's `quotedAt` line MUST carry the
     id beside an owner, the row names that owner verbatim in an `owner` field,
     and the test asserts the grammar REJECTS `(discharged by <owner>)`. That is
     the claim "the closed owner set cannot name this" stated as an assertion
     rather than as a comment. **The owner is NORMALISED before that test —
     surrounding whitespace and trailing sentence punctuation (`.`, `,`, `;`)
     stripped — and the normalised form is what must be rejected.** Without it the
     kind admits every settled row in the corpus: `app-e2e-batch2` line 28 carries
     the verbatim substring `Task 10.`. **A trailing DOT is not what
     normalisation defends against, and an earlier draft of this plan said it
     was — wrongly.** `ident` is `[A-Za-z0-9][A-Za-z0-9.-]*`, which permits a
     trailing dot, so `(discharged by Task 10.)` is accepted RAW and such a row
     is refused with or without normalisation. Measured: `Task 10` and
     `Task 10.` are both expressible either way; `Task 10,` and `Task 10;` are
     rejected raw and accepted normalised. Those two are the forms normalisation
     actually decides, and they are the ones an author produces by copying an
     owner out of a comma-separated clause. Run live on the normalised form: `Step 4` and
     `no task (a spec-time derivation, re-exercised by Task 5)` are rejected by the
     grammar, while `Task 5` and `closeout` are accepted — so a row whose owner the
     grammar CAN express fails admissibility and must be migrated instead. Exactly
     two live members, both named in §1.1.
5. **A walk-COMPLETENESS guard, not a walk-size guard**
   (`tests/_shared/premise.ts`, and `tests/specLint/acCoverageCorpus.test.ts` is
   the shape for the one-pass read). A numeric `premise()` on the document count
   proves the walk was not empty and nothing more: drop
   `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md` from the walk after the
   migration and the residue equality, the empty-undeclared assertion and the
   declined count are all unchanged, while 107 documents still clear any
   threshold. So the walked ENROLLED-PATH SET is asserted equal to the same set
   derived by an INDEPENDENT enumerator — `git ls-files docs/superpowers/plans`
   filtered by the enrolment marker, the repository index rather than a
   filesystem recursion — which is what a path-filter or recursion mistake
   actually breaks. The numeric premise stays beneath it as the cheap
   empty-environment guard. **Both corpus tasks carry this; it is one shared
   helper, not two hand-written walks.**

**The unit is a declaring LINE, not a plan**, and under v4 one line disposes
exactly one id, because a line carrying more than one is AMBIGUOUS and the arm
declines it (spec §4.2.1). So the count is one line per id: **34 ids at this
head**, of which the residue keeps the unsettleable ones and the rest are
migrated. `app-e2e-batch2` needs **five** edits, not six — its line 29 is AMBIGUOUS,
so AC-4 is declined rather than unclaimed. Per spec §4.2 constraint 1 each edit
states ONLY what that plan's prose already says, cited from its own line; per
constraint 2 a plan whose prose settles nothing gets NO disposition and goes on the
residue instead. The per-plan classification with quoted evidence is committed at
`docs/superpowers/specs/probes/2026-08-26-ac-disposition-classification.md` and is
this task's input.

**Spec §4.4 names two rows where the obvious disposition would be a lie, and they
resolve DIFFERENTLY — one migrates, one does not.**
`docs/superpowers/plans/2026-08-22-mutation-score-jurisdiction-gap.md` AC-8 is
discharged by a task the plan marks retired. The TASK is retired, the criterion is
not, so `RETIRED` would be false; `(discharged by Task 3)` states what the plan's
own line already says and it migrates.
`docs/superpowers/plans/2026-08-16-server-action-origin-sweep.md` AC-8 does NOT
migrate. Spec §4.4 asks its disposition to quote the plan's "no task (a spec-time
derivation, re-exercised by Task 5)" clause rather than write a bare discharge, and
the grammar has no reason slot outside `RETIRED` — so the only expressible
disposition is the flattening §4.4 forbids. That is precisely the case
`owner-inexpressible` exists for, and §1.1 records it there. **Where spec §4.4 and
the closed grammar disagree about a row, the residue is the answer and the grammar
is not widened.**

The residue is fail-closed and is a number that may go DOWN as owning arcs resolve
their own plans, never up. **Re-measure at the shipping head before the final
push**, because the population moves: §0.1 records 108 enrolled plans against the
snapshot's 101, and a plan enrolled since is handled under the same four
constraints. A migration edit touches a file another live arc may also be editing. The residue
is NOT where that goes — it has two kinds and a concurrent edit satisfies neither:
a punctuation-only change to `app-e2e-batch2` AC-3 still leaves Task 10 beside the
id, so `unsettled` rejects it, and Task 10 is grammar-expressible, so
`owner-inexpressible` rejects it too. The disposition is RE-DERIVED instead. At
push time, `git fetch` and re-run the arm: an id the owning arc has since claimed
or disposed has left the set and needs nothing, and an id still unclaimed is
migrated against the line as it now reads. A disposition is a function of the
plan's current prose, so a concurrent edit changes the input rather than deferring
the work.

**The negative controls are part of the done condition, not extras.** Three, each
run once and quoted. (a) Append one undisposed `- AC-99: planted` line to any
enrolled plan in the worktree, run the corpus test, observe RED naming that plan
and `AC-99`, revert. (b) Move a SETTLED pair onto the residue — `app-e2e-batch2` AC-3 as an
`unsettled` row, quoting its line 28 verbatim so every receipt-style check is
satisfied — and observe assertion 4 RED on the predicate, naming the lines that
settle it. A plant with empty strings is NOT this control: it may be rejected by
the type or by a non-empty check and so prove nothing about the predicate.
(b2) The same plant against the OTHER kind, which control (b) does not reach: add
`app-e2e-batch2` AC-3 as an `owner-inexpressible` row and observe RED — the
predicate refuses a row whose criterion the plan settles with an expressible
owner. That is ALL this control shows. **It does not test normalisation, and an
earlier draft claimed it did.** The owner-on-line check fires first on any
planted owner the quoted line does not contain, so normalisation is never
reached and removing it changes nothing. Normalisation is therefore asserted
DIRECTLY instead, on the forms that flip: `Task 10,` and `Task 10;` are rejected
raw and accepted normalised, while `Task 10.` is accepted either way because
`ident` permits a trailing dot. Removing `normaliseOwner` reds that assertion. (c) Make the decline predicate
unconditionally true and observe assertion 3 RED. A corpus test that survives any
of the three is not the gate.

## Task 5: the ambiguous record

<!-- task: red=`pnpm vitest run tests/specLint/taskContract.test.ts tests/specLint/acAmbiguousCorpus.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-15-diagram-demote-notice/plan.md:39` why=`line 39 declares AC-2 and AC-2b on one line, which v4 declines in both directions; the arm records it and this task asserts the live ambiguous set equals the committed record, so the assertion fails against an empty record file until every one of the 13 live lines is written into it` ac=AC-10 -->

**What is red and why:** the record file starts empty while 13 live multi-id
declaring lines exist, so the equality fails on that difference. Its own file,
because Task 4's red is satisfied by the unclaimed set alone: an implementation
that shipped the unclaimed half and forgot the ambiguous half would show Task 4's
full red-then-green cycle and pass its `AC-99` plant, which is precisely the silent
decline AC-10 forbids.

**The command is an explicit TWO-file list, and the second file is load-bearing.**
An equality between a live set and a committed record is satisfied by both sides
being empty, so a regression that drops the ambiguous accumulator passes a
corpus-only command from the moment the record file is created. Running
`tests/specLint/taskContract.test.ts` in the same command puts Task 1's unit cases
— a two-id line draws nothing in either direction, and it is RECORDED — on the same
red-then-green cycle, so the accumulator cannot go missing behind an empty record.
An explicit file list also stays outside the heavy semaphore.

The record is `tests/specLint/acAmbiguousRecord.ts (new)`, exporting
`AC_AMBIGUOUS_RECORD` — one typed row per multi-id declaring line, carrying the
plan path, the 1-based line number and the ids on it. The test walks every enrolled
plan from disk, calls Task 1's exported recognizer, and asserts exact equality in
both directions under the SAME walk-completeness guard Task 4 defines — the
independent `git ls-files` enumeration, not a document count. The count alone
does not discriminate here either: drop
`docs/superpowers/plans/2026-08-07-ops-log-code-emits.md` from the walk and the
ambiguous equality is unchanged, because its line 56 repeats one distinct id and
is not ambiguous at all. Fail-closed: a new multi-id
declaring line is not in the record and reds until someone looks at it (spec §7
limit 7).

Its own negative control: change one recorded row's line number by one, observe RED
naming that plan, revert.

## Task 6: the convention paragraph

<!-- task: red=`pnpm vitest run tests/docs/_metaSpecLintDocs.test.ts` red-state=authored red-target=`docs/agents/writing-plans.md:26` why=`writing-plans.md documents the red= and gate-command contract at :26 and says nothing about acceptance-criterion dispositions, so a plan author has no statement of the convention the arm now enforces; the docs assertion this task writes fails against the current file` ac=AC-11 -->

ONE paragraph in `docs/agents/writing-plans.md` per spec §4.2 constraint 3 — NOT
`AGENTS.md`. It states the convention, the accept-set direction, that a disposition
may only say what the plan already says, that the arm declines rather than guesses
on a line carrying more than one id, and — per §1.1 — that the decline is silent by
design, carrying the measured reason (1089 rows across 97 plans for a full record,
609 across 73 even when bounded to suppressing declines, because 51 enrolled plans
declare in a table or a coverage map).

Pinned on parsed properties of the paragraph, never on a substring of it —
`tests/docs/agentsHeavyPhaseRule.test.ts` and
`tests/docs/_metaAgentsMarkerContract.test.ts` are the shapes. Note for the
insertion and not for repair: lines 26 and 28 are two near-identical copies of the
red-contract bullet, and lines 27 and 29 two copies of the reconciliation bullet.
Add one paragraph and leave the duplicates alone; they are a documented limit of
that file and a note in the PR body, not this arc's repair.

## Task 7: archive the row, and the marker comes off with it

<!-- task: red=`pnpm vitest run tests/docs/_metaDeferralLedgerGraduation.test.ts tests/docs/_metaLedgerInProgress.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:100` why=`BACKLOG_GRADUATED at :100 is the registry the graduation suite asserts against, and BL-SPECLINT-AC-UNCLAIMED is still an OPEN row in BACKLOG.md carrying this branch's IN PROGRESS marker; adding its registry row while the ledger row sits in the open queue makes that suite red, and it goes green only when the row is actually moved into the archive. The repo-root path of the ledger row itself cannot be a red-target: the marker grammar rejects a bare filename (lib/specLint/redContract.ts:164), and this registry line is the convention every other graduation task uses` ac=AC-12 -->

**What is red and why:** the registry row asserts a graduation that has not
happened. Nothing else in this plan performs it, which is how a promise in a
document becomes a merge that ships an `IN PROGRESS` marker to main.

Register `BL-SPECLINT-AC-UNCLAIMED` in `BACKLOG_GRADUATED` with
`provenance: "feat/speclint-ac-unclaimed-arm"`, observe red, then move the row —
its dated addendum travelling with it — into `BACKLOG-archive.md` and take the
`**Status:** IN PROGRESS · **Branch:** …` marker off in the SAME commit. Per
invariant 12 that commit is the PR's LAST, so the marker never reaches main and
the origin-existence rule in `tests/docs/_metaLedgerInProgress.test.ts` cannot
fail on main after the branch is deleted.

The archive entry records what this arc measured, not what the row assumed: the
refuted premise in one line; the four classification counts and the zero
real-drift result; the count cut and why the grammar stopped; the live numbers at
the shipping head (plans walked, certain, ambiguous, unclaimed, residue size); the
residue and record paths; the migration by path; the 9/71 → 2/5 → 0 UNDECLARED
sequence with the 1089-row measurement that bought the silent decline; and that
`TASK_AC_UNDECLARED` is opt-in by shape.

**Documented limit — a residue row makes its plan un-dispatchable through the
lint gate, and that is the design working.** The residue is fail-closed by
construction, so the eight plans holding one report `TASK_AC_UNCLAIMED` at hard
severity forever: `spec:lint` on
`docs/superpowers/plans/ci/2026-08-26-speclint-dispatch-gates.md` reports four,
one per residue id. The lint gate that shipped in #904 refuses a `--stage
spec|plan` dispatch whose `--lint-doc` carries hard findings, so a future arc
naming one of those plans is refused and must pass `--no-lint-gate`, which is a
real escape and meant to be used (spec §7 limit 3). This is the price of
constraint 2: an id whose disposition would be a lie stays flagged, and staying
flagged is what "flagged" means. It is not repaired by widening the owner set,
and the residue shrinks only when an owning arc settles its own criterion in its
own prose.

**Documented limit — a `RETIRED` reason may not name another id, and spec §4.3's
own example does.** The reason sits ON the declaring line, so
`(RETIRED: superseded by AC-4)` puts two distinct ids there and the ratified
count cut declines the line. The criterion is still exempted, but by the DECLINE
rather than by the disposition, which is not what the author wrote and not what
the spec's example implies. Two ratified things conflict here and the count cut
wins, because it is the terminating decision three refuted grammars bought; the
recognizer is NOT widened to ignore ids inside a disposition, since that reopens
the axis. `docs/agents/writing-plans.md` advertises an id-free reason instead,
and `tests/specLint/taskContract.test.ts` pins both halves — the id-bearing form
declined, the id-free form disposed.

**No `BL-`/`DEF-` row is filed by this arc**, of any facing.

<!-- tasks: end -->


## 6. Acceptance criteria, inlined from spec §10

- AC-4: `TASK_AC_UNCLAIMED` fires on a declared id no marker cites whose declaring line carries no disposition; hard, exit 1, rendered `FAIL`. A disposition on that line exempts it and nothing else, and an unrecognised disposition still reports.
- AC-5: `TASK_AC_UNDECLARED` fires on a marker citing an id the plan does not declare, in a plan that declares at least one and on an id no declined line carries; no id ever draws two of the three codes.
- AC-6: the corpus's unclaimed set equals the committed residue list exactly, its `TASK_AC_UNDECLARED` set is empty over a provably non-empty declined set, and every residue row passes its kind's executable predicate — no owner word beside the id anywhere in the plan for an `unsettled` row, and a named owner the disposition grammar rejects for an `owner-inexpressible` one.
- AC-10: the live AMBIGUOUS declaring-line set equals the committed record exactly; a new multi-id declaring line reds until someone looks at it.
- AC-9: `taskContract` scores at or above its `scoreFloor` of 0.95 with zero unaccepted survivors at the shipping head (discharged by closeout)
- AC-12: `BL-SPECLINT-AC-UNCLAIMED` is registered in `BACKLOG_GRADUATED` with this branch as its provenance and is moved out of the open queue into the archive, with the `IN PROGRESS` marker removed in the same commit; both ledger meta-suites are green.
- AC-11: `docs/agents/writing-plans.md` carries one paragraph stating the convention, the accept-set direction, the decline on a multi-id line with its measured reason, and that a disposition may only say what the plan already says; pinned on parsed properties (plan-local, from spec §4.2 constraint 3 rather than from spec §10)

## 12. Closeout

**AC-9 is a step, not a hope.** After Task 4, with the orchestrator's take on the
single-slot mutation class lock, run `pnpm heavy:mutation pnpm mutation:guards`
against the `taskContract` row at `tests/mutation/source/registry.ts:805`. The
floor stays at `0.95`. **The row's `accepted` list is already non-empty** — it
begins at `tests/mutation/source/registry.ts:825` and carries established
equivalent rows — and AC-9 asks for zero UNACCEPTED survivors, never for an empty
accepted list. Those rows stay exactly as they are; a new one is added only for a
survivor this work introduces that is genuinely equivalent, carrying `siteId`,
`kind` and `reason` in the shape that registry already uses. Record `k/n` and the unaccepted-survivor count
here and in the readiness message, and re-run at the shipping head if production
changed after the first run.

**The UNDECLARED sequence, recorded because it is this arc's own measurement:** the
code reds 9 plans / 71 ids under the opt-in rule alone, 2 plans / 5 ids once the
count cut is applied symmetrically (§1.1), and 0 after those two plans are migrated
in Task 4.

**Documented limit — the symmetric decline is silent, and here is the number that
bought it.** A per-row record of declined lines measures 1089 rows across 97 plans,
or 609 across 73 bounded to declines that suppress a finding, because 51 enrolled
plans declare their criteria in a table or a coverage map. An exact-equality record
that size reds on any routine plan edit anywhere in the corpus, so the loudness is
placed on the empty-`TASK_AC_UNDECLARED` assertion instead. Restated in the archive
entry and in the `docs/agents/writing-plans.md` paragraph.

**No `BL-`/`DEF-` row is filed, of any facing.** A peer defect goes in the PR body
under "Unfixed peers" and to the orchestrator in the readiness message.

impeccable-gate: N/A — no UI surface
