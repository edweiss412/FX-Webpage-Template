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

## Acceptance criteria this plan discharges

Spec §7.5 is canonical; this table names the task that performs each proof and the channel it arrives
on. A green suite is NOT the proof for AC-3, AC-5 or AC-6 — each names its own instrument.

| id | criterion | task | channel |
| --- | --- | --- | --- |
| AC-1 | The twenty-six §4 flips report | 3, 4 | one positive assertion per row in the deciding suite, each with a premise showing its plain sibling already reports |
| AC-2 | Every §4 "unchanged" row holds its probed value | 3, 4, 5 | assertions in the deciding suite; pre-existing ones stay |
| AC-3 | The site path is byte-identical in behavior | 2, 5 | `git diff` shows no change to `scanShellText` and none to the attached-target regex, AND the suite asserts a retained target is invisible to `scanSource` |
| AC-4 | Live-tree census unchanged BY THIS DIFF | 8 | two `collectPsqlUsage` measurements, `origin/main` and HEAD, asserted equal — no literal |
| AC-5 | Every pin the change invalidates is dispositioned | 6 | run the whole deciding suite and disposition EVERY newly failing test in that commit |
| AC-6 | Mutation score holds with an EMPTY unaccepted-survivor set | 8 | scoped `pnpm heavy` gate run, counts pasted into close-out |
| AC-7 | Ledger-kind count matches the re-derived ledger | 8 | `expectedLedgerKinds.ts` equals the registry's actual row count |
| AC-8 | Documentation sweep complete | 7 | every §5 companion-sweep bullet in the same commit as its pin edit |
| AC-9 | Each rule resists its strictly weaker implementation | 2, 3, 4, 5 | one killer fixture per rule, from this plan's "Strictly weaker implementations" table; each lands in the deciding suite with the task that implements its rule |

## The implementation surface, stated whole

One production file: `tests/cross-cutting/psqlStartupFiles/scan.ts`. One deciding suite:
`tests/cross-cutting/psqlStartupFileSuppression.test.ts` — the ONLY file `psqlStartupScan`'s
`suitePaths` names, so an assertion outside it buys zero mutation score.

Anchors as they stand at the start of this plan (they move as tasks land, which is why each is also
named by symbol):

- `type ShellWord` — `scan.ts:801`
- `let dropWord = false;` in `lexShellWords` — `scan.ts:929`
- the `${…}` branch, `character === "$" && text[i + 1] === "{"` — `scan.ts:1017`
- the attached-target consumption regex — `scan.ts:1235`, and `dropWord = true` at `scan.ts:1237`
- `READ_HERE_STRING` — `scan.ts:2254`
- `valueBinds` — `scan.ts:2347`

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
- **Must keep passing, and each is named by a task:** `_metaSourceShardIntegrity` (Task 8, the temp
  shard must be deleted), `_metaLedgerInProgress` and `_metaLedgerMintBar` (Task 9),
  `_metaReviewRoundEconomy` (Task 9, the filing's heading count tracks the corpus).
- **"None applies" is not claimed anywhere in this plan.**

## Strictly weaker implementations, and the fixture that kills each

One exhaustive pass over every rule, done before the tasks rather than one row per review finding.
Distinct from anti-tautology and both apply: anti-tautology asks whether a fixture can fail at all;
this asks whether it can fail for the RIGHT reason. Every killer below lands in the deciding suite.

| # | rule | strictly weaker implementation that would pass a naive fixture set | killer fixture |
| --- | --- | --- | --- |
| 1 | candidate only when the WHOLE value is one accepted `${…}` | read the operand of any accepted `${…}` appearing anywhere in the value (the withdrawn substitution model) | `PG=p${U:-"sql"}` stays 0, and `U=xpsql; PG=${U#${V:-'psql'}}` stays 0 — the second is the false report the narrowing exists to remove |
| 2 | accept-set is exactly six operators, complement default-denied | "any operator whose spelling contains `-` or `=`", or "whichever operators the fixtures happen to name" | `${U#'psql'}`, `${U%'psql'}`, `${U/'psql'/x}`, `${U:1}` stay 0 and `${U^}`, `${U@Q}` stay 1 — a weaker set flips at least one |
| 3 | here-string association is by LOGICAL line | association by PHYSICAL line, or "any `<<<` target anywhere in the file" | N1/N2 (continuation before and after the operator) BIND; a `read` on one logical line with an unrelated `<<<` target on another does NOT |
| 4 | the whole-value rule applies to a `<<<` target, symmetrically | "any retained redirection target is read as a here-string value" | `cat x > ${U:-psql}` does NOT report — a `>` target is not `<<<`; and `read -r PG <<< ${U#'psql'}` stays 0 |
| 5 | retained targets never reach argv | retention that adds targets to the word array and filters them at ONE consumer | `cat x > psql` → 0 sites AND `psql -X -qAt mydb > out.sql` → 1 site, tokens `["-X","-qAt","mydb"]`, `suppressesStartupFiles: true` — a single-consumer filter passes the first and fails the second |

## Task 1: pin the base

Executed at plan-authoring time on this branch; the numbers below are outputs, not intentions.

- Deciding suite green: **897 passed** (14.02s).
- Scoped gate green: **7 gate cases, 899s**, gate conditions passing IS the empty-unaccepted-survivor
  assertion.
- Live census: `{"sites":76,"unprotected":0,"indirections":0,"unreadable":0}`, 3425 files scanned.
- Registry declares 63 mutants / 39-39 counted / 24 equivalent / no accepted gap / `scoreFloor: 1`.

<!-- tasks: depth=2 red-contract -->

## Task 2: detached redirection targets ride a side channel

<!-- task: red=`npx vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:929` why=`a detached redirection target is built by the ordinary loop and then discarded at flush because dropWord is set at the line named here, so no word carrying its dequoted text ever exists. Step 1 authors the retention cases plus the two argv-invisibility cases with NO production edit; Step 2 observes them red against that discard; Step 3 turns dropWord into pendingTarget and pushes the word into a third optional out-parameter; Step 4 re-runs the SAME command green. The red is behavioural and names a production line, so it cannot go green by editing the test` ac=AC-3,AC-9 -->

`lexShellWords(text, nested, targets?)` gains a third optional out-parameter of
`RedirectionTarget = { operator, text, line, offset }`. Targets are pushed there and NEVER into the
returned word array, so `scanShellText` — which passes no array — receives a byte-identical
`ShellWord[]`. The ATTACHED path is untouched: no recursive lexing, no change to the consumption regex
at `scan.ts:1235`.

Cases (deciding suite): a detached `<<<` target's dequoted text is retained; `cat x > psql` yields 0
sites; `psql -X -qAt mydb > out.sql` yields 1 site with tokens `["-X","-qAt","mydb"]` and
`suppressesStartupFiles: true`. The last two are killer #5 — a weaker "filter at one consumer"
retention passes the first and fails the second.

## Task 3: the here-string family reads its target, associated by LOGICAL line

<!-- task: red=`npx vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:2254` why=`READ_HERE_STRING at the line named here reads the here-string value out of the spliced line through a single-delimiter shape, so a quote-concatenated value is missed. Step 1 authors A1/A6/A7/H4/N1/N2 with no production edit; Step 2 observes them red against that pattern; Step 3 adds the word-route disjunct - a read-grammar PREFIX match plus a retained <<< target belonging to the same LOGICAL line - keeping the existing regex as the other disjunct; Step 4 re-runs the same command green` ac=AC-1,AC-2,AC-9 -->

Union, not replacement: the existing regex stays as one disjunct because the raw line is the only
reading that sees inside a `$(…)` body, and because `valueBinds` is stricter than the pattern in one
probed case (`read -r MSG <<< 'psql failed to connect'` reports 1 today and must keep reporting).

Association is by LOGICAL line: `spliced` joins backslash-newline continuations, so a target belongs to
logical line `i` when its physical line falls in the span `i..k` the loop already computes. Killer #3
is the pair N1/N2 plus the negative case (a `read` on one logical line, an unrelated `<<<` target on
another).

Nested bodies: `visitBody` passes a `targets` array and offsets each target's line back, exactly as it
already does for `assignmentBindingLines`. That closes A7.

## Task 4: the whole-value expansion candidate

<!-- task: red=`npx vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1017` why=`the branch at the line named here consumes a ${...} expansion whole and appends its raw slice, so operand-internal quoting is data to every downstream reader and only a bare psql inside it reports. Step 1 authors C1-C3, C5-C7, C9, K1-K2, L1-L3 and R1-R8 with no production edit; Step 2 observes them red against that verbatim append; Step 3 sets expandedCandidate when the whole value is ONE accepted expansion and tests it with the existing predicate; Step 4 re-runs the same command green` ac=AC-1,AC-2,AC-9 -->

`ShellWord.expandedCandidate: string | null` is set only when the word's entire value is a single
accepted `${…}` — accept-set exactly `${U:-word}`, `${U-word}`, `${U:=word}`, `${U=word}`,
`${U:+word}`, `${U+word}` — and is then that span's dequoted operand. `null` otherwise. No substitution
into surrounding text. The verbatim `text` is still tested; the candidate is an additional string
tested by the SAME predicate.

The `<<<` target gets the same rule at a second site (Task 3's retention makes that possible), which is
what closes R1-R8.

Killers #1 and #2 land here. #1 is the pair `PG=p${U:-"sql"}` and `U=xpsql; PG=${U#${V:-'psql'}}`, both
staying 0 — the second is the false report the narrower model exists to prevent. #2 is the complement
row set, each holding today's value.

## Task 5: the negative surface, in one place

<!-- task: red=`npx vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:2347` why=`the precision cases must be decided by valueBinds at the line named here rather than by a second predicate, and no existing case proves the candidate route reaches it. Step 1 authors the precision set - ${U:-'psql;x'}, ${U:-'psql\'}, ${M:-'psql failed to connect'}, composed notpsql and composed prose - with no production edit; Step 2 observes the two that must REPORT red while the rest already pass, which is what shows the route is live rather than the cases being vacuous; Step 3 lands the shared predicate call; Step 4 re-runs the same command green` ac=AC-2,AC-3,AC-9 -->

Every case here is a zero that must STAY a zero, so each carries a premise proving the fixture reaches
the assertion on its own inputs — a suite of zeros that never reach the predicate is green about
nothing. The premise for each precision row is its selected-state sibling reporting.

<!-- tasks: end -->

## Task 6: declared-limit pins, by execution

**Do not search for the pins. Run the suite and read what breaks.** Two rounds were spent learning that
a phrase grep cannot find a pin asserting a suppression verdict rather than a zero, and that the
replacement grep was wrong in a different way. After Tasks 2-5 land, run the whole deciding suite and
disposition EVERY newly failing test in this commit.

Expected: exactly two retire (the here-string row and the quoted-expansion-operand row of the
six-row declared-miss array) and are re-pinned as hits; the array's other four rows and its premise
loop stand unchanged; the nine remaining pins in spec §5 stand. **A newly failing test outside that
expectation is a finding against the spec's table, not a test to fix** — record it and reconcile the
table before proceeding.

## Task 7: documentation sweep, one commit

Every bullet below lands with the pin edits, per spec §5:

- `scan.ts` documented-limits block: the here-string clause leaves bullet 1 (interpreter-positional and
  alias clauses stay); the `${…}`-operand bullet is replaced by the complement entry; the false
  mechanism sentence ("since the lexer drops a redirection operand before words exist") goes.
- `scan.ts` nested-body closing paragraph: add the here-string word-route clause so the "never blind"
  claim stays true and visibly so.
- `scan.ts` inline comment in `scanShellIndirection` citing the here-string ledger row.
- `scan.ts` three stale `75`s → the measured census, or a form carrying no literal.
- `2026-08-17-shell-binding-mixed-quoted-value-design.md` §6 items 1 and 7: one dated superseded-by
  line each. That spec is not rewritten.
- No `DEFERRED.md` pointer to either row exists — verified by repo-wide grep at spec time.

## Task 8: re-derive the mutation ledger, then score

`siteId` is `<operator>:<line>:<column>:<mutation>` — LINE-KEYED — so essentially every row below the
lexer moves. That churn is the named cost `BL-MUTATION-SITEID-LINE-KEYED-CHURN` records.

Re-keying is the cheap half. **Each of the 24 equivalence ARGUMENTS is re-read against its new site**;
several reason about `scanShellText`'s command assembly and about `valueBinds`, and Task 4 adds a
candidate test to the latter. No row is carried over on the strength of having been true before. If the
count changes, `expectedLedgerKinds.ts` changes in the same commit.

Then: blob-hash `scan.ts` and the suite, run the scoped gate FOREGROUND under `pnpm heavy` (~899s),
delete the temp shard, and paste mutants/killed/equivalent plus the empty unaccepted-survivor set into
close-out. Also run the two `collectPsqlUsage` measurements for AC-4 — `origin/main` and HEAD, asserted
equal, no literal.

## Task 9: ledger close-out, ONE commit BEFORE whole-diff review

The whole ledger change at once, so absence is guaranteed rather than maintained: archive both
graduating rows with their IN PROGRESS markers stripped in the same commit, leave
`BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION` open, then verify by set arithmetic (union of
`BL-`/`DEF-` ids exact; `comm -12` archived-vs-open empty) and re-run `_metaLedgerInProgress`,
`_metaLedgerMintBar` and `_metaReviewRoundEconomy`. The review-round filing's heading count tracks the
corpus for the CURRENT base — a mid-arc merge of `origin/main` re-bases it and the heading moves.

Never arm `gh pr merge --auto` before this commit is pushed AND review has approved.

## 12. Close-out

impeccable-gate: N/A — no UI surface

This diff touches `tests/**` and `docs/**` only: no file under `app/`, `components/`, `app/globals.css`,
`tailwind.config.*` or `DESIGN.md`, so invariant 8's dual gate does not apply. Advisory-lock topology:
not touched, no `pg_advisory*` call in scope. DB layers: none.
