# Handoff — shell-lexer quoted-value recall (spec + plan complete, implementation not started)

**Branch:** `fix/shell-lexer-quoted-value-recall` — always work from the branch name, never a sha; this
arc merged `origin/main` four times and every sha in any message is stale.

**Status.** Spec and plan are complete and closed. Nothing is implemented: the only production file the
arc will touch, `tests/cross-cutting/psqlStartupFiles/scan.ts`, is untouched on this branch. The
implementer starts at Task 2.

| artifact | path |
| --- | --- |
| spec | `docs/superpowers/specs/ci/2026-08-20-shell-lexer-quoted-value-recall-design.md` |
| plan | `docs/superpowers/plans/2026-08-20-shell-lexer-quoted-value-recall.md` |
| probe record | `docs/superpowers/specs/ci/probes/2026-08-17-shell-binding-mixed-quoted-probes.md` (the 2026-08-20 supplements are this arc's — five of them) |
| round-economy filing | `docs/review-rounds/fix/shell-lexer-quoted-value-recall/03953337388b.md` (both stage sections present) |
| prior arc's design | `docs/superpowers/specs/ci/2026-08-17-shell-binding-mixed-quoted-value-design.md` |

**Ledger.** Closing: `BL-SHELL-HERESTRING-MIXED-QUOTED-VALUE`, `BL-SHELL-EXPANSION-OPERAND-QUOTED-VALUE`
(both marked IN PROGRESS on this branch; markers come off in the ledger close-out commit, Task 7).
Filed by this arc and NOT closing: `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION`.

**Review history.** Spec 5 dispatches (findings 2/4/2/5/1), closed by orchestrator ship-and-fence.
Plan 4 dispatches (6/4/3/2), decreasing every round, closed at the cap with both final findings fully
repaired. All 28 findings were accepted; none was refuted.

---

## The seven tasks

1. **Pin the base** — already executed at plan time; the numbers in the plan are outputs.
2. **Detached targets retained AND the here-string reads them** — one cycle, because retention alone is
   unobservable. Retires the here-string pin and its documentation.
3. **The whole-value expansion candidate** — accept-set of six operators, complement default-denied.
   Retires the quoted-expansion pin and its documentation. Carries the executable complement table and
   the fifteen remaining unchanged-row pins.
4. **The negative surface** — red against a NAMED MUTANT in `valueBinds`, applied and reverted inside
   the task, never committed.
5. **Whole-suite execution** as the cover for pins nobody predicted.
6. **Re-derive the mutation ledger, then score.**
7. **Ledger close-out**, ONE commit BEFORE whole-diff review.

Tasks 2-4 sit in the `red-contract` region and carry markers; the rest do not.

---

## Fenced in BOTH directions — do not reopen, and do not "fix"

These are ratified. A reviewer raising them is answered by citation; an implementer improving them is
re-scoping.

- **The MAY-BIND posture is ratified.** A static reader cannot know whether a parameter is unset or
  null, so an accepted operand is read unconditionally. The scanner reports 1 TODAY for `U=other` +
  `PG=${U:-psql}` and for `PG=${U:+psql}` with `U` unset, while bash binds `other` and empty. Arm 2
  extends the identical treatment from bare operands to quoted ones. **Do not add a guard that infers
  runtime state, and do not file the existing behavior as a defect.** Spec round 5 raised this as a new
  false-report class; it is not new, and the probe in the reviewer's own units is what settled it.
- **Composition is a DOCUMENTED LIMIT** (spec §6 item 9). `PG=p${U:-"sql"}` and its nine siblings stay
  at 0. The wider substitution model was tried at spec round 3 and withdrawn at round 4 because it
  produced a FALSE REPORT across a complement boundary — `U=xpsql; PG=${U#${V:-'psql'}}` yielded the
  candidate `${U#psql}` and reported, while bash binds `xpsql`. Wrongly-loud is the one direction the
  consequence bound forbids. **Do not reach for composition.**
- **The ATTACHED redirection family is withdrawn scope** (spec §1.1 row 7, §6 item 3), filed as its own
  ledger row, with both closing readings recorded as REFUSED and why. Do not lex attached targets.
- **Usefulness is not the criterion; correct ATTRIBUTION is.** A correct report on code nobody will
  change is a documented limit, not a false positive. The forbidden directions are a false
  CERTIFICATION and a wrong line/file attribution.

---

## Enrolment, and what the round-1 diff brief MUST carry

The surface is enrolled: `tests/mutation/source/registry.ts`, id `psqlStartupScan`, and **`suitePaths`
is exactly one file** — `tests/cross-cutting/psqlStartupFileSuppression.test.ts`. An assertion outside
it buys zero score, whatever else it proves.

`codex-guard` **exits 2 before dispatching** a round-1 `--stage diff` brief whose `GUARD SURFACE:` line
does not carry, on that same line, `MUTATION SCORE: <killed>/<total>` plus the words
"0 unaccepted survivors" (or a `CANNOT-EXPRESS:` citation). So the gate must be SCORED BEFORE the first
diff dispatch, not after.

The brief also carries, verbatim, the three the convergence gate checks:

- **Consequence bound:** "Every input is handled correct or signaled, never silently wrong: the guard
  never silently CERTIFIES a psql invocation it has mis-read, and never attributes a report to the
  wrong line or file. A conservative NON-REPORT or a conservative OVER-report plus a declared limit is
  a DOCUMENTED LIMIT, not a finding." **Use that wording.** An earlier draft said "never reports a
  binding bash does not make", which condemns the guard's own ratified may-bind behavior and
  manufactured a finding against shipped semantics.
- **PROBE DOMAIN:** the probe record's instrument set (all supplements) plus the live tracked corpus
  `scanShellIndirection` walks.
- **Threat fence:** ordinary authoring mistakes by a contributor writing shell in this repository;
  adversarial obfuscation is out of scope.

**Decision rule for any finding on the expansion axis**, ruled by the orchestrator: INSIDE the six
accepted operators is a real defect in promised scope — repair it. OUTSIDE the six is default-denied by
construction and is NOT admissible. Ambiguous, or an attack on the accept-set MECHANISM rather than its
membership, escalates.

---

## Traps that each cost this arc a round — read this section before you start

**Measurement and harness**

- The scoped gate run is **899s at handoff time**, not the batch's ~93s per-surface figure: 63 mutants
  against an 897-test deciding suite at ~14s each. Both numbers grow with the diff — treat them as the
  SHAPE (roughly a quarter-hour, scaling with mutants x suite size) rather than as current values, and
  read the closeout for what the arc actually measured.
- **Blob-hash before re-running, and know what retires a score.** It is a pure function of (source,
  operators, deciding suites), so ANY edit to `scan.ts` or the deciding suite — a comment included,
  because a shifted line changes every ledger `siteId` — retires the number. Sequence every source and
  suite edit you intend to make BEFORE the measure: this arc killed three runs mid-flight for exactly
  that reason, twice on its own sequencing and once because a repair to the repair was still owed.
- `-t` does NOT bound the gate — `runSurface` executes at module scope during collection. Scope with a
  temporary `guardSurfaces.shardTmp*.test.ts` filtering `GUARD_SURFACES`, run FOREGROUND under
  `pnpm heavy`, then **delete it**: `_metaSourceShardIntegrity` pins the shard set byte-for-byte.
- **An uncommitted `.ts` scratch file in the worktree root is walked like source.** A probe script
  containing psql spellings put the deciding suite RED and the gate into `BaselineNotGreenError`.
  `git status --short` before believing a red baseline.
- `npx vitest run tests/mutation/guardSurfaces.gates.test.ts` **exits 0 having collected ZERO tests**
  (`NIGHTLY_ONLY_EXCLUDES`, `vitest.projects.ts:97`). Never use it as a red or a gate. Plain
  `spec:lint` makes no collection claim, and under `--exec-red` the collection arm is silent for
  `pnpm heavy`-wrapped commands, so for those the run is the proof.
- Run the **full** `tests/docs` suite before opening the PR. `_metaReviewRoundEconomy` walks the live
  corpus, so a scoped run passes while the branch is CI-red.

**The scanner itself**

- **`scanShellIndirection` has TWO emission routes.** The coalesced line route emits at most ONE hit
  per line (`hit = assigned ?? aliased ?? …`); `visitBody` emits independently and BEFORE it. Probed:
  `X=$(read -r PG <<< psql)` gives two hits on line 1. Consequences the plan already encodes: every
  flip fixture sits ALONE on its line, and nested-body fixtures assert on hit TEXT rather than count.
- Rounds are keyed **(branch, baseSha12)**, so a mid-arc merge of `origin/main` re-bases the corpus and
  restarts round numbering. Count rounds by hand across corpus files, and add the dispatches currently
  in flight — rows are written at completion, so a live dispatch is invisible exactly when you count.

**Authoring**

- **Every scripted edit asserts its anchor matches EXACTLY once before writing** — not "present".
  Zero matches is a silent no-op; multiple matches means first-occurrence replace edits the wrong site.
  This arc's helper refused to write four times on real anchor drift.
- **Sweep both directions.** Verifying the new text is present does not show the superseded text is
  gone; a document can end up asserting two incompatible models at once.
- **Print raw counts, never a computed verdict.** Three verifier defects on this arc against zero real
  defects in the things verified — four false ABSENTs from shell quoting, and a "zero pending" that was
  an artifact of filtering inside a jq query.
- **A premise is proven on the case's OWN inputs.** "Its sibling reports" is not a premise.
- **A killer fixture only discriminates when the two implementations DISAGREE on that exact input.**
  Three of five killers in the first draft failed this, and one survived into round 2.

---

## What is NOT done

Implementation, the mutation re-derivation, the score, and the ledger close-out — Tasks 2 through 7.
The 24 equivalence rows in the registry are line-keyed and will all move
(`BL-MUTATION-SITEID-LINE-KEYED-CHURN`); each ARGUMENT is re-read at its new site rather than re-keyed,
because several reason about `scanShellText` and `valueBinds`, and Task 3 adds a candidate test to the
latter.
