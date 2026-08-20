# Plan — the lexer keeps what the binding predicate needs

Design: `docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md`.
Probe record: `docs/superpowers/specs/ci/probes/2026-08-17-shell-binding-mixed-quoted-probes.md`
(the 2026-08-20 supplements are this arc's).
Ledger rows: `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE`, `BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE`.
Row filed by this arc and NOT closed by it: `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION`.

Two arms, one PR. Arm 1 retains DETACHED redirection targets so the here-string family can read its
value dequoted. Arm 2 reads the operand of a WHOLE-VALUE accepted `${…}` expansion. The spec closed by
orchestrator ship-and-fence after five review rounds; §1.1's twelve ratified rows are the fence and
this plan does not reopen any of them.

**Task decomposition note.** Plan round 1 returned six BLOCKING findings that were ONE defect with
instances: tasks whose red could not be observed at their own boundary, and pin retirement deferred
past the tasks that invalidate the pins — which would have left the suite red at every intermediate
commit. The decomposition below is the repair. **Every task retires the pins it invalidates, inside its
own cycle, together with the documentation lines describing that pin's limit**, so the same command
really is red then green at each boundary and no commit ships a red suite.

## Two fences carried from the spec, restated because implementers read plans

- **The MAY-BIND posture is ratified and is not relitigated in either direction.** A static reader
  cannot know whether a parameter is unset or null, so an accepted operand is read unconditionally.
  The scanner reports 1 TODAY for `U=other` + `PG=${U:-psql}` and for `PG=${U:+psql}` with `U` unset,
  while bash binds `other` and empty. Arm 2 extends the identical treatment from bare operands to
  quoted ones. Do not add a guard inferring runtime state, and do not file the existing behavior as a
  defect.
- **Usefulness is not the criterion; correct ATTRIBUTION is.** A report that is correct but lands on
  code nobody will change is a documented limit, not a false positive. The forbidden directions are a
  false CERTIFICATION and a wrong line/file attribution.
- **Composition is a documented limit** (spec §6 item 9), ratified after the substitution model
  produced a false report across a complement boundary. Do not reach for it.

## Cross-finding identity, and what the implementer will invent

Two distinct emission routes exist, and conflating them is how a fixture stops discriminating.

**Route A, the coalesced LINE route**, emits at most ONE hit per line —
`hit = assigned ?? aliased ?? functionDef ?? githubEnvWrite ?? positionalBinding`. Probed:
`PG=psql; read -r Q <<< p'sql'` reports **1** hit on line 1 today (the assignment route produces it)
while `read -r Q <<< p'sql'` alone reports **0**. A here-string fixture sharing a line with an
assignment binding therefore cannot fail, whatever the here-string rule does.

**Route B, `visitBody`, emits INDEPENDENTLY and BEFORE route A**, so one-per-line is a fact about
route A only and NOT about `scanShellIndirection`. Probed: `X=$(read -r PG <<< psql)` reports **2**
hits on line 1, texts `read -r PG <<< psql` and `X=$(read -r PG <<< psql)`. Plan round 2 finding 3 — an
earlier draft claimed the one-per-line property for the whole function, which is false and would have
let A7's premise be satisfied by nested DISCOVERY rather than by the here-string route under test.

- **Every flip fixture puts its subject ALONE on its own line**, no other binding route on that line.
  The discriminating pair above is committed as a case in its own right.
- **A7 and every other NESTED-body fixture asserts on the hit's TEXT, not merely on a count**, because
  route B emits for the enclosing substitution independently of the rule under test. A7's premise names
  the here-string route specifically rather than saying "the plain sibling reports" — its plain
  sibling reports TWICE, once per route.
- **Multi-hit assertions are order-independent** — sorted records or sets, never a positional array.
- **A hit's assertion identity is (file, line, matched text)**; the plan neither assumes the scanner
  deduplicates nor assumes it does not.
- For every fixture ask not only "what weaker implementation passes this?" but **"which rule DECIDES
  the observation I am asserting on, and is it the rule under test?"**

## Acceptance criteria this plan discharges

Spec §7.5 is canonical; this table names the task that performs each proof and the channel it arrives
on. A green suite is NOT the proof for AC-3, AC-5 or AC-6 — each names its own instrument.

| id | criterion | task | channel |
| --- | --- | --- | --- |
| AC-1 | The twenty-six §4 flips report | 2, 3 | one positive assertion per row in the deciding suite, each on its OWN line (see "Cross-finding identity"), each with a premise showing its plain sibling already reports |
| AC-2 | Every §4 "unchanged" row holds its probed value | 2, 3, 4 | assertions in the deciding suite; pre-existing ones stay |
| AC-3 | The site path is byte-identical in behavior | 2, 4 | `git diff` shows no change to `scanShellText` and none to the attached-target regex, AND the suite asserts a retained target is invisible to BOTH `scanSource` and the assignment route |
| AC-4 | Live-tree census unchanged BY THIS DIFF | 7 | two `collectPsqlUsage` measurements, `origin/main` and HEAD, asserted equal — no literal |
| AC-5 | Every pin the change invalidates is dispositioned | 2, 3, 5 | the two KNOWN pins retire inside the tasks that invalidate them; Task 5 runs the whole suite as the cover for pins nobody predicted |
| AC-6 | Mutation score holds with an EMPTY unaccepted-survivor set | 7 | scoped `pnpm heavy` gate run, counts pasted into close-out |
| AC-7 | Ledger-kind count matches the re-derived ledger | 7 | `expectedLedgerKinds.ts` equals the registry's actual row count |
| AC-8 | Documentation sweep complete | 2, 3, 6 | each pin's doc lines land with that pin's retirement; Task 6 lands only the residue |
| AC-9 | Each rule resists its strictly weaker implementation AND its cross-finding neighbour | 2, 3, 4 | one killer fixture per rule, each PROBED below, landing with the task that implements its rule |

## The implementation surface, stated whole

One production file: `tests/cross-cutting/psqlStartupFiles/scan.ts`. One deciding suite:
`tests/cross-cutting/psqlStartupFileSuppression.test.ts` — the ONLY file `psqlStartupScan`'s
`suitePaths` names, so an assertion outside it buys zero mutation score.

Anchors as they stand at the start of this plan (they move as tasks land, which is why each is also
named by symbol):

- `type ShellWord` — `scan.ts:801`
- `lexShellWords`' `dropWord` DECLARATION `scan.ts:929`; the behavior-producing ASSIGNMENT
  `dropWord = true` — `scan.ts:1237`, immediately after the attached-target regex at `scan.ts:1235`
- the `${…}` branch, `character === "$" && text[i + 1] === "{"` — `scan.ts:1017`
- `READ_HERE_STRING` — `scan.ts:2254`
- `valueBinds` — `scan.ts:2347`
- the six-row declared-miss loop in the deciding suite — `psqlStartupFileSuppression.test.ts:5167`,
  whose zero assertion sits at `psqlStartupFileSuppression.test.ts:5210`

## Global constraints

- **Enrolment is two declarations**: the registry row in `tests/mutation/source/registry.ts` AND
  `EXPECTED_LEDGER_KINDS` in `tests/mutation/source/expectedLedgerKinds.ts` (consumed by
  `tests/mutation/guardSurfaces.gates.test.ts` — no `source/` segment in the consumer path). Current:
  `psqlStartupScan: { equivalent: 24 }`.
- **Gate cost measured on this branch: 899s** for a green baseline of the seven gate cases — 63
  mutants against an 897-test deciding suite at ~14s per execution. The batch's "~93s per surface"
  figure does not apply here. Budget ~15 minutes per re-measure and keep the count of re-measures down
  with the blob-hash rule.
- **Scoping the gate** (`-t` does NOT bound it — `runSurface` runs at module scope during collection):
  write a temporary shard beside the committed ones, matching `guardSurfaces.shardTmp*.test.ts`, that
  filters `GUARD_SURFACES` to the one id before calling `registerSurfaceCases`; run it FOREGROUND under
  `pnpm heavy`; then **delete it**
  — `tests/mutation/_metaSourceShardIntegrity.test.ts` pins the shard set byte-for-byte.
- **Blob-hash before any re-measure.** The score is a pure function of (source, operators, deciding
  suites). Record `git hash-object` for `scan.ts` and the suite beside every score.
- **A scratch `.ts` file in the worktree root is walked like source.** A probe script containing psql
  spellings put the deciding suite RED and the gate into `BaselineNotGreenError` during this plan's own
  measurements. `git status --short` before believing a red baseline.
- **Red commands are RUN, and their failure is matched to the asserted reason.** Three shapes fail
  open and all three look healthy to an exit-code check: a command that collects nothing, one that dies
  on an unresolved import before any assertion, and a `-t` filter matching nothing. Probed here:
  `npx vitest run tests/mutation/guardSurfaces.gates.test.ts` **exits 0 having collected ZERO tests**
  (excluded from every default project by `NIGHTLY_ONLY_EXCLUDES`, `vitest.projects.ts:97`; the run
  prints it in its own `exclude:` list) — never use that spelling. Plain `spec:lint` makes no collection
  claim, and under `--exec-red` the collection arm is silent for `pnpm heavy`-wrapped commands, so for
  those the proof is the run.
- **Every sweep derives its cover from a walk root, a registry, or an EXECUTION** — never from a
  literal name. A generic walker is invisible to a name grep by construction, and this arc already paid
  for that: the pin inventory built from a phrase grep missed a pin asserting a suppression verdict
  rather than a zero, twice.
- **Mutation-operator families are closed at two**, `relational-boundary` and `regex-quantifier-bound`,
  as the registry row ratifies. A reviewer-proposed third family is a registry change carrying its own
  before/after numbers, not a finding on this plan.

## Meta-test inventory

- **Extends:** none structurally — the deciding suite gains cases, not a new registry.
- **Must keep passing, each named by the task that runs it:** `_metaSourceShardIntegrity` (Task 7 —
  the temp shard is created AND deleted there), `_metaLedgerInProgress`, `_metaLedgerMintBar` and
  `_metaReviewRoundEconomy` (Task 8).
- **"None applies" is not claimed anywhere in this plan.**

## Strictly weaker implementations, and the fixture that kills each

One exhaustive pass over every rule, done before the tasks rather than one row per review finding.
Distinct from anti-tautology and both apply: anti-tautology asks whether a fixture can fail at all;
this asks whether it can fail for the RIGHT reason; the cross-finding question above asks whether a
DIFFERENT rule decides the observation. All three apply to every row, and **every killer below is
probed** — plan round 1 found three of the five rows carrying killers that did not kill.

| # | rule | strictly weaker implementation that would pass a naive fixture set | killer fixture |
| --- | --- | --- | --- |
| 1 | candidate only when the WHOLE value is one accepted `${…}` | read the operand of any accepted `${…}` appearing anywhere in the value (the withdrawn substitution model) | `PG=p${U:-"sql"}` stays 0, and `U=xpsql; PG=${U#${V:-'psql'}}` stays 0 — the second is the false report the narrowing exists to remove |
| 2 | accept-set is exactly six operators, complement default-denied | a DENYLIST — "any operator except `#`, `%`, `/`" — which silently accepts error-word, substring, case-modification and transformation | `PG=${U:?'psql'}` stays 0. the `${U:?word}` operator is outside the denylist, so a denylist reads its operand `psql` and REPORTS while the accept-set declines; probed 0 today, and bash binds nothing there because the expansion errors. (`${U:1}` is NOT a killer — a denylist reading it extracts the operand `1`, which the predicate rejects anyway, so both implementations agree. `${U^}` and `${U@Q}` are not killers either: they already report through the verbatim text for a pre-existing reason.) |
| 3 | here-string association is by LOGICAL line | association by PHYSICAL line, or "any `<<<` target anywhere in the file" | N1/N2 (continuation before and after the operator) BIND; a `read` on one logical line with an unrelated `<<<` target on another does NOT |
| 4 | the whole-value rule applies to a `<<<` target SPECIFICALLY | keep the read-prefix and logical-line checks but ignore WHICH redirection operator the target belongs to | `read -r PG < ${U:-psql}` stays 0 — with `<` the shell hands `read` the file's CONTENT (bash binds `psql-file-content`, probed), so an operator-blind implementation reports and this kills it. `cat x > ${U:-psql}` is NOT a valid killer: it has no `read`, so the prefix check alone rejects it and the fixture cannot discriminate |
| 5 | retained targets never reach argv | retention that adds targets to the word array and filters them at the `scanShellText` consumer ONLY | `cat x > PG=psql` reports 0 hits — the ASSIGNMENT route is a second consumer, so a `scanShellText`-only filter leaves the retained `PG=psql` target visible to it and it reports. Paired with `cat x > psql` → 0 sites and `psql -X -qAt mydb > out.sql` → 1 site, tokens `["-X","-qAt","mydb"]`, `suppressesStartupFiles: true` |

## Task 1: pin the base

Executed at plan-authoring time on this branch; the numbers below are outputs, not intentions.

- Deciding suite green: **897 passed** (14.02s).
- Scoped gate green: **7 gate cases, 899s**, gate conditions passing IS the empty-unaccepted-survivor
  assertion.
- Live census: `{"sites":76,"unprotected":0,"indirections":0,"unreadable":0}`, 3425 files scanned.
- Registry declares 63 mutants / 39-39 counted / 24 equivalent / no accepted gap / `scoreFloor: 1`.

<!-- tasks: depth=2 red-contract -->

## Task 2: detached targets are retained AND the here-string reads them

<!-- task: red=`npx vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1237` why=`a detached redirection target is discarded by the dropWord assignment at the line named here, so no word carrying its dequoted text ever exists and READ_HERE_STRING must read the spliced line through a single-delimiter shape. Retention ALONE is unobservable - lexShellWords is private, scanShellText passes no targets array, and both argv-invisibility assertions already pass today - so retention and its consumer are ONE cycle, which is what makes the red behavioural (plan round 1 finding 1). Step 1 authors A1, A6, A7, H4, N1 and N2 each ALONE on its own line, plus the argv-invisibility and operator-discrimination killers, with no production edit. Step 2 observes them red against that discard. Step 3 turns dropWord into pendingTarget, pushes into a third optional out-parameter, and adds the word-route disjunct associated by LOGICAL line. Step 4 retires the here-string row of the declared-miss loop and its scan.ts limit clause IN THIS TASK, then re-runs the SAME command green` ac=AC-1,AC-2,AC-3,AC-5,AC-8,AC-9 -->

`lexShellWords(text, nested, targets?)` gains a third optional out-parameter of
`RedirectionTarget = { operator, text, line, offset }`. Targets never enter the returned word array,
so `scanShellText` — which passes no array — receives a byte-identical `ShellWord[]`. The ATTACHED
path is untouched: no recursive lexing, no change to the consumption regex.

The here-string rule becomes a UNION. The existing regex stays as one disjunct: it is the only reading
that sees inside a `$(…)` body, and it is stricter-in-reverse on
`read -r MSG <<< 'psql failed to connect'`, which reports 1 today and must keep reporting. The new
disjunct is a `read`-grammar PREFIX match plus a `<<<` target belonging to the same LOGICAL line — a
target belongs to logical line `i` when its physical line falls in the `i..k` span the loop already
computes while building `spliced`.

`visitBody` passes a `targets` array and offsets each target's line back, exactly as it already does
for `assignmentBindingLines`. That closes A7.

**Pins retired in this task**, because this task is what invalidates them: the here-string row of the
six-row declared-miss loop, re-pinned as a hit; the here-string clause leaves `scan.ts` documented-
limits bullet 1, and the false mechanism sentence ("since the lexer drops a redirection operand before
words exist") goes with it.

**And the documentation that goes STALE the moment this task lands, which travels with it** (plan
round 2 finding 2 — an earlier draft deferred these as "no pin to travel with", which was wrong):
the inline comment in `scanShellIndirection` that cites `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE` and
says the lexer drops the operand before words exist; the nested-body closing paragraph, which must
gain the here-string word-route clause so its "never blind" claim stays true; and item 1 of the prior
design's §6, which corresponds to this retiring row.

**Also in this commit, because they live in the same `scan.ts` header block this task is already
editing** (plan round 3 finding 2): the NEW documented-limit entry for the attached-target family
(spec §6 item 3), and the three stale `75`s in that block's census sentences. Spec §5 lists the `75`s
as a companion sweep landing with the pin edits; they are pre-existing drift rather than something a
pin describes, but they sit in the block this task rewrites, so the same-commit contract is satisfied
here rather than deferred.

Killers 3, 4 and 5 land here.

## Task 3: the whole-value expansion candidate

<!-- task: red=`npx vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1017` why=`the branch at the line named here consumes a ${...} expansion whole and appends its raw slice, so operand-internal quoting is data to every downstream reader and only a bare psql inside it reports. Step 1 authors C1-C3, C5-C7, C9, K1-K2, L1-L3 and R1-R8, each ALONE on its own line, with no production edit. Step 2 observes them red against that verbatim append. Step 3 sets expandedCandidate when the whole value is ONE accepted expansion and tests it with the existing predicate, applying the same rule to a <<< target. Step 4 retires the quoted-expansion row of the declared-miss loop and its scan.ts limit bullet IN THIS TASK, then re-runs the SAME command green` ac=AC-1,AC-2,AC-5,AC-8,AC-9 -->

`ShellWord.expandedCandidate: string | null` is set only when the word's entire value is a single
accepted `${…}` — accept-set exactly `${U:-word}`, `${U-word}`, `${U:=word}`, `${U=word}`,
`${U:+word}`, `${U+word}` — and is then that span's dequoted operand. `null` otherwise. No substitution
into surrounding text. The verbatim `text` is still tested; the candidate is an ADDITIONAL string
tested by the SAME predicate. A `<<<` target whose entire text is one accepted expansion gets the same
rule at the second site, which is what closes R1-R8; Task 2's retention is what makes that site exist.

**Pins retired in this task:** the quoted-expansion-operand row of the declared-miss loop, re-pinned as
a hit; the `${…}`-operand bullet in `scan.ts` is replaced by the complement entry; and item 7 of the
prior design's §6, which corresponds to this retiring row, gains its dated superseded-by line here
rather than later.

**New documented-limit entries owned by this task** (plan round 3 finding 2 — they had no owner):
spec §6 item 8, composition inside double quotes, and item 9, whole-value composition with its
adjacency and nesting cases. Both describe boundaries THIS task's accept-set creates, so both are
written into the `scan.ts` header block here.

Killers 1 and 2 land here.

**The DEFAULT-DENY complement is made EXECUTABLE here, not merely asserted** (plan round 3 finding 1 —
AC-2 claimed every unchanged §4 row had an assertion and the complement rows had none). One
table-driven case lists every complement operator with the value it holds TODAY, measured:
`${U#'psql'}` 0, `${U%'psql'}` 0, `${U/'psql'/x}` 0, `${#psql}` 1, `${U#psql}` 1, `${U:?'psql'}` 0,
`${!psql}` 1, `${A[psql]}` 1, substring `${U:1}` / `${U:1:4}` / `${U: -4}` 0, `${U^}` 1, `${U,,}` 1,
`${U@Q}` 1, `${U@U}` 1, and inside a here-string target `${U#'psql'}` 0 and `${U:1}` 0. The case
asserts the whole table, so a change that reads ANY complement operand moves at least one row. The
mixed directions are the point: the ones at 1 report through the verbatim text for a pre-existing
reason, and a candidate that started reading them would not change those — which is why the zeros
carry the discriminating weight and the table asserts both.

## Task 4: the negative surface, red against a NAMED MUTANT

<!-- task: red=`npx vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:2347` why=`every case here is a zero that must STAY zero, and a non-regression pin cannot red against correct code - plan round 1 finding 2. Its red is therefore authored against a NAMED MUTANT in the production surface: Step 2 removes the separator rejection from valueBinds at the line named here, which makes the precision cases report and the authored assertions go red on SCANNER behaviour rather than on a test-local edit. Step 3 restores the shipped predicate and Step 4 re-runs the SAME command green. The mutant is named, applied and reverted inside this task and is never committed` ac=AC-2,AC-3,AC-9 -->

The precision set: `${U:-'psql;x'}`, `${U:-'psql\'}`, `${M:-'psql failed to connect'}`, composed
`notpsql`, composed prose, `PG="p${U:-'sql'}"` (bash binds `p'sql'`, so the zero is CORRECT), and the
composition family, now a documented limit.

Each case carries a premise proving the fixture reaches the predicate **on its OWN inputs**. Plan
round 3 finding 3: an earlier draft made every premise "its selected-state sibling reports", and an
adjacent case is explicitly NOT a premise (`docs/agents/writing-plans.md`, premise rule) — a sibling
can hold while this case's own input never reaches the machinery at all.

The premise for each row is therefore a property computed from that row's OWN fixture text, asserted
immediately above the assertion it guards:

- For a candidate-route zero (`${U:-'psql;x'}`, `${U:-'psql\'}`, `${M:-'psql failed to connect'}`):
  the fixture's value is a WHOLE-VALUE span whose operator is in the accept-set and whose operand
  contains `psql`. That is exactly the condition under which the candidate exists, so the zero is
  attributable to the predicate rejecting the candidate rather than to no candidate being built.
- For the double-quoted composition zero (`PG="p${U:-'sql'}"`) and the whole-value composition zeros:
  spec §3.3 requires that NO candidate exists for these, so the premise is the complement of the
  above — the fixture's `${…}` is inside a double-quoted span, or the value is not a single span — and
  the assertion is that the zero holds for that structural reason. A reporting sibling would prove the
  opposite boundary and is not used.
- For composed `notpsql` and composed prose: the fixture contains no psql-shaped word after
  dequoting, asserted on the fixture's own text.

Every premise uses `premise` / `premiseHolds` from `tests/_shared/premise.ts`, sits outside any
`.each` callback, and is stated on the case's own inputs — a suite of zeros that never reach the
predicate is green about nothing, and a suite of zeros guarded by a neighbour's success is green about
the neighbour.

<!-- tasks: end -->

## Task 5: whole-suite execution as the cover for UNKNOWN pins

The two pins this change invalidates are known, and Tasks 2 and 3 retire them inside their own cycles.
**This task is the cover for pins nobody predicted:** run the whole deciding suite and disposition
every newly failing test in this commit.

One property of the corpus is load-bearing, and it was plan round 1 finding 4: the six declared-miss
rows live in ONE loop in ONE test, so execution surfaces only the FIRST failing row and throws before
reaching the rest. **Execution is therefore the cover for pins in SEPARATE tests**, and the loop's own
six rows are dispositioned by reading the loop — sound there and only there, because the loop is a
finite literal array in one place rather than a pattern over a 5225-line file. Both facts are stated so
a later reader does not mistake the run for a cover it cannot be.

Expected after Tasks 2-4: nothing newly failing. Anything else is a finding against the spec's §5
table — record it and reconcile the table before proceeding.

## Task 6: residual documentation sweep

All pin-coupled documentation landed with its pin in Tasks 2 and 3 — including the three groups an
earlier draft wrongly deferred here (plan round 2 finding 2): the inline comment citing the here-string
ledger row, the nested-body closing paragraph, and the prior design's §6 items 1 and 7. That is what
the spec's same-commit companion-sweep contract requires and what keeps commit-per-task intact.

**What remains is genuinely uncoupled**, because it is pre-existing drift from an unrelated arc rather
than anything either pin describes:

- `scan.ts` three stale `75`s → the measured census, or a form carrying no literal. Found by spec
  round 1's census probe; no pin asserts them and no task above invalidates them.
- Confirmation, not an edit: no `DEFERRED.md` pointer to either row exists — verified by repo-wide grep
  at spec time and re-run here.

## Task 7: re-derive the mutation ledger, then score

`siteId` is `<operator>:<line>:<column>:<mutation>` — LINE-KEYED — so essentially every row below the
lexer moves; that churn is what `BL-MUTATION-SITEID-LINE-KEYED-CHURN` records.

Re-keying is the cheap half. **Each of the 24 equivalence ARGUMENTS is re-read against its new site.**
Several reason about `scanShellText`'s command assembly and about `valueBinds`, and Task 3 adds a
candidate test to the latter, so those arguments are re-verified rather than inherited. If the count
changes, `expectedLedgerKinds.ts` changes in the same commit.

Then: blob-hash `scan.ts` and the suite, run the scoped gate FOREGROUND under `pnpm heavy` (~899s),
delete the temp shard, and paste mutants/killed/equivalent plus the empty unaccepted-survivor set into
close-out. Also run the two `collectPsqlUsage` measurements for AC-4 — `origin/main` and HEAD, asserted
equal, no literal.

## Task 8: ledger close-out, ONE commit BEFORE whole-diff review

The whole ledger change at once, so absence is guaranteed rather than maintained: archive both
graduating rows with their IN PROGRESS markers stripped in the same commit, leave
`BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION` open, then verify by set arithmetic (union of
`BL-`/`DEF-` ids exact; `comm -12` archived-vs-open empty) and re-run `_metaLedgerInProgress`,
`_metaLedgerMintBar` and `_metaReviewRoundEconomy`. The review-round filing's heading counts the corpus
for the CURRENT base; a mid-arc merge of `origin/main` re-bases it and the heading moves.

Never arm `gh pr merge --auto` before this commit is pushed AND review has approved.

## 12. Close-out

impeccable-gate: N/A — no UI surface

This diff touches `tests/**` and `docs/**` only: no file under `app/`, `components/`, `app/globals.css`,
`tailwind.config.*` or `DESIGN.md`, so invariant 8's dual gate does not apply. Advisory-lock topology:
not touched, no `pg_advisory*` call in scope. DB layers: none.
