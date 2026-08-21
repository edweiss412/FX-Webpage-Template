# Plan — an executing psql hidden inside an ATTACHED redirection target

**Spec:** `docs/superpowers/specs/ci/2026-08-21-shell-attached-redirection-target-design.md` (canonical).
**Ledger:** `BL-SHELL-ATTACHED-REDIRECTION-TARGET-SUBSTITUTION` (`BACKLOG.md:87`).
**Branch:** `fix/shell-attached-redirection-target`. **Base:** `e5d1d723d`.

Every requirement below is INLINED from the spec rather than paraphrased, so the plan cannot
restate an approved criterion more weakly than the spec makes it.

---

## 0. State measured at plan time

| fact | value | command |
|---|---|---|
| deciding suite at HEAD | 975 passed, 13.49s | `pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` |
| accepted rows on `psqlStartupScan` | 26, zero STALE | `pnpm mutation:sites` |
| documented-flaky site present | `relational-boundary:3578:35:<><=`, `ok` | `pnpm mutation:sites` |
| corpus finding set | 76 sites, 0 indirections, digest `8ebe8b08d43e6308aa471112d9f086d0118e6238` over EVERY field | `baseline-corpus.mts` |
| live population of the family | 0 across three execution surfaces (53 attached targets) | `corpus-family3.mts` |
| ledger closeout gate | FAIL for the asserted reasons; PASS on a constructed post-closeout state | `scripts/ci/attached-target-closeout-check.sh` |

## 1. Meta-test inventory (mandatory declaration)

- **CREATES:** none.
- **EXTENDS:** `tests/cross-cutting/psqlStartupFileSuppression.test.ts` — the deciding suite, with
  new cases per Task 1 and Task 2 and two retired declared-limit pins.
- **EXTENDS:** `tests/mutation/source/registry.ts` — `psqlStartupScan`'s accepted rows are
  re-derived after the source edit (Step 4).
- **UNTOUCHED, and named because the change could plausibly reach them:**
  `tests/mutation/_metaSourceShardIntegrity` (no shard file is added or removed by this arc),
  `tests/specLint/declaredLimitPins*` (this arc RETIRES pins, it does not change the arm).

## 2. Declared-limit pins (spec §6)

Named per the planlint obligation. The suite pins this family in TWO blocks; spec round 1 found
the first inventory naming only one. **Three retired, two held as controls.**

| block | row | today | after |
|---|---|---|---|
| §4 unchanged-rows table | `A3 the ATTACHED here-string, withdrawn scope` | 0 | RETIRED — reports |
| §4 unchanged-rows table | `F2 the ATTACHED substitution target` | 0 | RETIRED — reports |
| §4 unchanged-rows table | `F11 a psql call, ATTACHED output redirection` | 1 site `[false]` | HELD — control |
| `F3:` block (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:5927`) | `attached target, no override` | 0 | RETIRED — reports (case F exactly) |
| `F3:` block (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:5927`) | `attached target, overridden` | 0 | HELD — control |

**The overridden sibling is the control that arrived free with the finding.** A later
`< /dev/null` on fd 0 overrides the here-string, so bash makes no binding: a repair that reported
BOTH rows would be loud in a direction the shell does not license, and only this pair can tell the
two apart.

### 2a. The arm's phrase-bearing pins — named, including the ones left alone

`declaredLimitPins` keys on titles carrying "known miss", "documented limit" or "declared miss".
The deciding suite has four, and the obligation is to NAME each — to retire it or to say it is
deliberately left alone. Resolving it is not the obligation; naming it is.

| title | `tests/cross-cutting/psqlStartupFileSuppression.test.ts` | disposition |
|---|---|---|
| `R40 — hypothetical gaps closed cheaply; the rest are documented limits` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:4151` | **LEFT ALONE** — a describe over unrelated R40-era families |
| `a QUOTED Windows path is now read - the R40-era known miss closes` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:4664` | **LEFT ALONE** — a path-quoting case, no redirection target |
| `documented limits - quote-concatenated spellings outside the assignment family` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:6155` | **LEFT ALONE** — its own comment states the ATTACHED spelling lives in scan.ts's limits block, not here |
| `each quote-concatenated keyword/operand spelling is a declared miss` | `tests/cross-cutting/psqlStartupFileSuppression.test.ts:6163` | **LEFT ALONE** — its four rows are alias name, interpreter positional, wrapper-prefixed quoted directory, whitespace directory component; none is a redirection target |

**The dispositions are measured, not inferred from titles.** A scan of all four blocks for a
redirection operator immediately followed by a non-space character returns ZERO genuine
occurrences. The scan's single hit is `Array<[label: string, missed: string, plain: string]>` at
`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6164` — a TypeScript generic, not a
redirection, and it is recorded here so a later reader does not re-derive it as a real one.

**Verify rather than assume, at implementation time:** run the deciding suite after Task 1 and
confirm all four still pass. If any moves, this table is wrong and the change reached further than
the design says it does — which is itself the finding.

**The pins flip the moment the recognizer changes**, so they are retired in the SAME commit as
Task 1. A guard and the change that satisfies it are one TDD cycle; splitting them produces a task
whose acceptance condition is that the suite is red.

---

## 2a-bis. Named sweep obligation — repair the axis, not the instance

**Every axis finding is swept across EVERY control set in the same commit, not only the one the
reviewer named.** This is a task obligation, not advice, and it is here because the arc measured the
cost of skipping it: round 3 found the census blind to multiline input, the census was repaired, and
the ACCEPTANCE SET — a different control set with the identical blindness — was left alone. Round 4
found it there, one layer along, a full round later.

The control sets in this arc are four, and a finding against any one is checked against all four
before the fix commits:

1. `probe-attached.mts` — the acceptance set (AC-1, AC-2).
2. `corpus-family3.mts` — the census positive controls (AC-8).
3. `digest-sensitivity.mts` — the field perturbations (AC-5b).
4. The declared-limit pins and their controls in the deciding suite (AC-6).

The check is one question asked four times: *does this set vary the dimension the finding names?*
A set that does not gets the case in the same commit. Recording that a peer set was checked and
already varies the dimension satisfies the obligation; silence does not.

---

## 2b. Weaker implementations, and the case that kills each

Rule 17's obligation, authored per RULE rather than per round. Each row is an implementation a
competent engineer might actually write; the killer is drawn from the acceptance set rather than
constructed for the occasion, which is what keeps the corpus complete by construction instead of
by exhaustion.

| # | weaker implementation | why it is tempting | killed by |
|---|---|---|---|
| W1 | re-lex `attached[0]` as-is, keeping the character-run boundary | it is the one-line reading of "collect the nested bodies" | **G, H and I** — the boundary never reaches a brace inside a quoted target, nor past an escape, nor a mid-construct stop |
| W2 | delimit by construct, but do NOT retain the target | the substitution family is the visible half of the ledger row | **F** — an attached here-string has no nested body at all |
| W3 | retain the target, but do NOT collect nested bodies | retention alone makes the here-string case pass | **A–E** — every substitution spelling stays silent |
| W4 | fire the unlexable report on ANY attached target | "never silently discarded", read maximally | **AC-5's digest** — the corpus's 53 ordinary targets become advisories |
| W5 | recurse only ONE level into the attached slice | depth 1 covers B, C and D, which look like the whole family | **G** — a brace inside a quoted target is depth 2 |
| W6 | honour the escape pair at top level only | escapes read as a lexer-entry concern | **H** — its escape sits inside the attached double-quoted target |
| W7 | treat the report as a `PsqlSite` rather than an `IndirectionHit` | a site is the more familiar result type | **AC-5's digest** — a fabricated site moves the finding set |
| W8 | delimit within ONE physical line, ending the region at any newline | a redirection and its target look like a same-line construct, and every case A–I is one | **J** — a backslash continuation inside a quoted target crosses the newline and bash executes it |
| W9 | handle an attached target only when the operator has no file-descriptor prefix | the prefix reads as a separate token, so `2>` looks like a different construct | **K** — `cat 2>"$(psql -c 'select 1')"` executes once and both scanners return zero |
| W10 | ADD a correctly attributed record and leave the wrongly attributed one | additive repairs feel safer than replacing a record something else may read | **I** — its predicate is universal over every site the snippet produces, so `[wrong, correct]` fails |
| W11 | delimit construct-aware after `>` and `<<<`, fall back to the old character run for the other ten operators | those two are what every acceptance case uses, so the gate goes green | **nothing in the acceptance set** — this is the one gap the spec's cases do NOT close, and Task 1 carries the obligation below instead |

**W8, W9 and W10 are round 4's, and each is the same defect shape as W1: an implementation that
passes the whole gate for a reason unrelated to the specification.** W8 and W9 were invisible until
round 4 because every case A–I shared two dimensions its author never varied — one physical line,
and a bare `>` after the command word. W10 was invisible because the attribution predicate was
existential. Adding J and K did not lengthen a list; it crossed two axes, which is the only thing
that moves this class.

**W1 is the one to watch, and it is why G, H and I exist.** The naive re-lex passes A–F by accident:
the bare-backtick slice `` `psql `` re-lexes to an unterminated backtick whose body is `psql `, so
case A goes green for a reason that has nothing to do with construct-aware delimiting. A corpus of
A–F alone would certify it. G, H and I are the three cases that separate the specified
implementation from the accidental one.

---

## 2c. Why Tasks 1 and 2 are two tasks, and why this order

**The split is legitimate under the can-each-half-reach-red-then-green test.** Task 1's eleven
subjects (A–K) are all DELIMITABLE spellings; Task 2's three cases are the UNTERMINATED ones. The
two case sets are disjoint, so each task reaches its own red and its own green at its own commit
boundary. Neither is a guard whose acceptance condition is that the suite stays red.

**The intermediate commit is INCOMPLETE, not silently WRONG**, which is the distinction that
decides the order. After Task 1 an undelimitable target is handled exactly as it is handled today —
consumed without a report. That is the PRE-EXISTING behaviour, unchanged: Task 1 makes nothing
worse, it just has not yet made this half better. Every intermediate commit is bisect-reachable, so
the ordering rule is to prefer intermediates that are merely incomplete over intermediates that are
wrong, and this order satisfies it.

**Task 1 must come first** because Task 2's red is not even expressible until delimiting exists —
"the machinery could not delimit this" is not a state the character-run regex can be in.

---

<!-- tasks: depth=2 red-contract -->

## Task 1 — the attached target is delimited by construct, and its nested bodies are collected

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:1581` why=`eleven new cases assert that each acceptance-set spelling meets its declared expectation; the character-run regex at the cited statement consumes the target and discards it, collecting no nested body and retaining no target, so none of the eleven expectations holds on the current tree` ac=AC-1,AC-2,AC-4,AC-6 -->

**Files:** Modify `tests/cross-cutting/psqlStartupFiles/scan.ts`, `tests/cross-cutting/psqlStartupFileSuppression.test.ts`.

**What is red and why.** Eleven authored cases assert the declared expectation for spellings A–K
of spec §2.2. The production statement whose behaviour makes them fail is the `const attached = …`
character-run assignment in `lexShellWords`.

**On the citation form.** The marker's `red-target=` carries a line, because that is the form the
arm requires — but this task EDITS that line, so the line is a base-stamped locator and the `why=`
names the statement by its content instead. Verify it by reading the statement, never by confirming
the line resolves: a drifted citation that still lands on real code is a false statement nothing
surfaces.

Nothing test-local decides the outcome: the probe at `probe-attached.mts` measures all eleven as
unmet on the current tree with four positive controls reporting.

**RED — the cases.** All ELEVEN subjects from spec §2.2 (A–K), each asserting its own declared
expectation, plus the four positive controls. **I's expectation is on ATTRIBUTION, not presence** —
it already reports today with `nested:false, nestedInBacktick:false` for a psql that genuinely sits
inside a backtick body, so a presence assertion would pass against the defect. Every case names the
mutant it kills.

**GREEN — implementation.**

1. **Delimit by construct.** Replace the character-class run with a walk using handlers that
   already ship: `matchBrace` (`tests/cross-cutting/psqlStartupFiles/scan.ts:946`) for `${…}` and `$(…)`, the backtick scan, the quote
   scanners. Spec §3.1's accept-set is the opener table, applied RECURSIVELY at every depth
   including inside quotes, with the ESCAPE PAIR binding tightest.
2. **Retain the dequoted target** as a `RedirectionTarget` in the `targets` array with `operator`,
   `line`, `offset`, `operatorOffset`. This is the ONLY route to case F — an attached here-string
   has no nested body — and it cannot reach the site path, because `scanShellText` passes no
   `targets` array while `scanShellIndirection` does.
3. **Collect nested bodies** into `nested`, re-anchored exactly as the `${…}` branch already does
   at `tests/cross-cutting/psqlStartupFiles/scan.ts:1340` — `{ text, line: line + entry.line, offset: <abs>, backtick }`.
4. **Two axes the acceptance set now crosses, and the walk must honour both.** The region does NOT
   end at a newline: a backslash continuation and an open quote both carry across one, exactly as
   bash reads them (case J). And the operator's file-descriptor prefix is part of the operator, not
   a reason to decline (case K). Neither is a new grammar feature — both are properties the walk
   either has or silently lacks.
5. **Cross the operator axis, and derive it rather than list it.**
   `REDIRECTION_OPERATORS` (`tests/cross-cutting/psqlStartupFiles/scan.ts:1088`) declares TWELVE
   operators and this branch runs for every one; the acceptance set exercises two. W11 is the
   implementation that exploits that and no §2.2 case kills it. **The task's own test iterates the
   shipped array** — importing it, not retyping it — and asserts the attached-target behaviour for
   each operator the array declares, so an operator added later is covered by construction instead
   of silently exempt. Operators whose grammar makes an attached substitution meaningless (`>&`,
   `<&` take a descriptor) assert the CONSERVATIVE outcome explicitly rather than being skipped:
   a skip is indistinguishable from a miss.
6. The attached target's own text still never becomes an argv word. That is what keeps this
   outside both readings the filing arc REFUSED (spec §1.1).

**Retire the three pins in this commit** (§2 above), and hold both controls unchanged.

**Four pre-dispatch mutants, per the string-presence discipline.** For each of the eleven firing
cases: (a) empty the body so the target carries no command — the case must go quiet, proving it
tracks the nested body and not the presence of a target; (b) replace `psql` with `notpsql` — quiet,
proving it reads the command word; (c) add `-X` to the body — the site must report with
`suppressesStartupFiles === true` rather than vanish, proving the case reads the verdict and not
mere presence; (d) move the same body to a DETACHED position — it must still report, proving the
case is not accidentally passing through the already-working detached arm.

**I's mutants are DIFFERENT, and that is the point of giving it its own predicate.** Its assertion
is `nestedInBacktick === true`, so the presence mutants above cannot discriminate it: (a) emptying
the body makes it report nothing, which a presence assertion would also catch, but (b) moving the
psql OUT of the backtick body must flip `nestedInBacktick` to false while the site STILL REPORTS —
that is the mutant only an attribution assertion kills, and it is the one that would have passed
against the round-1 fixture. **A third mutant is now required and is round 4's:** leave the existing
wrongly top-level site in place and ADD a correct one. The predicate is universal over every site
the snippet produces, so `[wrong, correct]` must FAIL — an existential reading passed it. H takes the ordinary set, since its expectation is presence.

**Premise (executable, on each case's OWN inputs).** Immediately above each assertion,
`premiseHolds("this case's attached target really is attached", …)` asserting no whitespace sits
between the operator and the target — because a case whose fixture drifted to a detached spelling
would pass through the arm that already works and prove nothing about this one.

## Task 2 — a target the machinery cannot delimit is REPORTED, not discarded

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:3050` why=`three new cases assert that an attached target carrying an unterminated backtick, brace or quote yields an IndirectionHit naming it; the production surface is scanShellIndirection, which emits no such hit for any undelimitable target, so all three cases read an empty hit array until the channel exists` ac=AC-3 -->

**Files:** Modify `tests/cross-cutting/psqlStartupFiles/scan.ts`, `tests/cross-cutting/psqlStartupFileSuppression.test.ts`.

**What is red and why.** The production surface is `scanShellIndirection`, cited by SYMBOL rather
than by a line Task 1 rewrites — a red-target pointing into your own blast radius still resolves
after the edit and silently names different code. Task 1 delimits what the accept-set can close. An UNTERMINATED
construct closes nothing, and the consequence bound forbids silent discard — so an unterminated
backtick, brace and quote each get a case asserting a surfaced **`IndirectionHit`** naming the
undelimitable target. They fail until the channel exists.

**The firing condition is narrow and is part of the red:** the report fires only when the
undelimitable span carries a substitution opener, so the corpus's 53 ordinary attached targets
stay quiet. A case asserting that `cat >"${OUT}"` emits NOTHING is the half that pins it.

**This is the half that makes the bound true rather than aspirational.** Spec §5: *correct or
signaled, never silently wrong.* Task 1 supplies "correct"; Task 2 supplies "signaled".

**Negative twin, per the both-directions rule.** Each unterminated case is paired with its
terminated sibling one edit away, asserting NO unlexable report — otherwise a channel that
reports everything satisfies all three positives while being maximally broken.

<!-- tasks: end -->

---

## Step 3 (OUTSIDE the red-contract region) — the corpus does not move, and the documentation moves with the code

**Why it carries no task marker.** Both halves are checks and edits, not red-then-green cycles on
production behaviour. The corpus-equality half is a GATE that must pass before AND after — it
cannot be red, and a marker claiming otherwise would be the manufactured-red shape. The
documentation half is a docs move: nothing mechanical fails on a documented limit that has become
false, which is exactly why it has to be a named step rather than a trusted intention.

**Files:** Modify `tests/cross-cutting/psqlStartupFiles/scan.ts`, `tests/cross-cutting/psqlStartupFileSuppression.test.ts`; run `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts` and `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/corpus-family3.mts`.

**AC-5, the consequence bound made executable.** Re-run the digest-pinned baseline and assert the
finding set is unchanged apart from this arc's own constructed fixtures: **76 sites, digest
`8ebe8b08d43e6308aa471112d9f086d0118e6238`**. This is the check that distinguishes a guard that
got stricter from one that merely got louder.

**Documentation that must move with the code, or it becomes a stale citation that still reads
true** (spec §6):

- `tests/cross-cutting/psqlStartupFiles/scan.ts:280`–`tests/cross-cutting/psqlStartupFiles/scan.ts:297`, the documented-limits block, which currently calls this family "not read
  at all" and "the sharpest limit in this list";
- the deciding suite's note declaring the attached `<<<p'sql'` spelling withdrawn scope
  (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6171`).

Re-run the three-surface census after the change and confirm the population is still zero — the
repair must not have manufactured live instances.

## Step 4 (OUTSIDE the red-contract region) — re-derive the registry, then score

**Why it carries no task marker.** A registry re-derivation is a MEASUREMENT, not production
behaviour, and its only available "red" is one Tasks 1-3 create for it — the manufactured-target
shape. `pnpm mutation:sites` exits 0 today (26 rows ok, zero stale, verified at plan time), so a
`red-state=live` marker here would be false. Stated acceptance instead:

- every accepted row re-keyed through the shipped enumerator and RE-VALIDATED, not merely re-keyed;
- `pnpm mutation:sites` reports zero STALE rows for `psqlStartupScan`;
- `pnpm heavy pnpm mutation:guards` scores at or above the floor with an EMPTY unaccepted-survivor
  set, provenance pair stamped inside the measuring invocation, before and after.

**Files:** Modify `tests/mutation/source/registry.ts`.

**A source edit voids the score.** 26 accepted rows, all `ok` today. After Tasks 1–3 every site
below the lexer moves, so every row is re-keyed AND re-validated — **re-keying is not
re-validating**: each argument is re-read at its new site, and a row whose reason has stopped
being true comes out rather than being carried on the strength of having been true before.

**Do NOT remove a row on a single stale-row report.** `relational-boundary:3578:35:<><=` is the
site `BL-MUTATION-SCORE-NONDETERMINISM` documents as flaky — observed SURVIVOR, then
STALE-i.e.-KILLED, then UNACCEPTED SURVIVOR, with the mutant hand-applied surviving 3 of 3. A
correct row was removed on one such report and had to be restored. Re-run before concluding, and
report any observation at that site to `bl-orch`.

**Line shifts are NOT uniform** — measured twice on other surfaces (`+1 ×7` and `+24`; `+132` and
`+153` in one change). Offset arithmetic is never valid; re-derive through the shipped enumerator.

Then `pnpm heavy pnpm mutation:guards`, and record the score with an empty unaccepted-survivor set
plus the provenance pair stamped INSIDE the measuring invocation.

## Step 5 (OUTSIDE the red-contract region) — ledger closeout, EARLY

**Why it carries no task marker.** A ledger move is a docs change; the gate below is a CLOSEOUT
CHECK, not a red-then-green cycle on production behaviour. Stated acceptance: the gate exits 0.

**Files:** Modify `BACKLOG.md`, `BACKLOG-archive.md`; create `scripts/ci/attached-target-closeout-check.sh`.

**One commit, BEFORE whole-diff review**: archive the graduating row, file any peers, remove the
in-progress marker. Absence is then guaranteed rather than maintained, and the ledger commit is
reviewed rather than riding into the merge unreviewed.

**The gate SHIPS with this plan** at `scripts/ci/attached-target-closeout-check.sh` rather than
living in a session scratchpad, so the implementer runs the same predicates I proved. Proven in
both directions at plan time: FAIL on today's tree naming all three real failures, PASS on a
constructed post-closeout state.

**Re-verify the set arithmetic after every subsequent main merge**, since a merge re-conflicts
both ledger files and can reintroduce a row or a marker.

---

## 3. Acceptance criteria → task map

| AC | criterion | task |
|---|---|---|
| AC-1 | all eleven acceptance-set subjects meet their expectation | Task 1 |
| AC-2 | four positive controls still report | Task 1 |
| AC-3 | undelimitable target REPORTED as unlexable | Task 2 |
| AC-4 | `F11` control unchanged | Task 1 |
| AC-5 | corpus finding set unchanged, digest held | Step 3 |
| AC-8 | census still finds zero substitution-bearing targets | Step 3 |
| AC-6 | two pins retired deliberately; ledger closed | Task 1, Step 5 |
| AC-7 | score at or above floor, empty unaccepted set | Step 4 |
