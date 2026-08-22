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
| live population of the family | 0 across three execution surfaces (53 attached targets at base `e5d1d723d`; the HEAD figure is deliberately not written down, see below) | `corpus-family3.mts` |
| ledger closeout gate | FAIL for the asserted reasons; PASS on a constructed post-closeout state | `scripts/ci/attached-target-closeout-check.sh` |

**Why the target count moved and the zero did not.** The spec's §2.3 census reports 53 at base
`e5d1d723d`, across 5 shell chunks. This arc COMMITS
`scripts/ci/attached-target-closeout-check.sh`, so a sixth `.sh` chunk enters the very corpus the
census walks, carrying ordinary `>` and `2>` redirections, none substitution-bearing. **This is the
second occurrence of one shape in this arc**: the oracle's snippets were base64-encoded for exactly
this reason after committing them as a runnable script took the shell surface from 19 targets to 28
with 5 substitution-bearing, every one of them the arc's own. An artifact this arc commits enters
the corpus this arc measures.

**So the HEAD figure is no longer written down, and that is the repair rather than a newer number.**
An earlier revision of this row stated 57, naming four redirections in that script. It was true when
written and false by the time the plan landed: the same commit that landed this plan added a
`2>/dev/null` to that script, taking the shell surface to 26 and the total to 58. A count whose own
subject is inside the arc is invalidated by the arc's next commit, so re-minting it just schedules
the next contradiction. The immovable half stays — 53 at `e5d1d723d`, a revision no later commit
can move, and independently stated in the spec's §2.3 table — and the HEAD half is a COMMAND:
`pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/corpus-family3.mts`.
The load-bearing number was always the ZERO, which is unmoved, asserted, and the only figure AC-8
reads.

## 1. Meta-test inventory (mandatory declaration)

- **CREATES:** `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/operator-oracle.mts` — a bash oracle, not a meta-test, and NOT enrolled anywhere. It lives under `docs/`, which the census walk skips, and its snippets are base64'd, so it does not enter the corpus it helps measure. Re-verified after adding it: the census still reports zero substitution-bearing attached targets.
- **EXTENDS:** `tests/cross-cutting/psqlStartupFileSuppression.test.ts` — the deciding suite, with
  new cases per Task 1 and Task 2 and THREE retired declared-limit pins (two controls held).
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

**Worked example, from plan round 1.** Finding 1 named the nested-body population axis. Asked of
all four sets: the acceptance set carries at most one body per target (blind, closed by Task 1's
equality assertion above); the census controls have no target with two SIBLING substitutions
(blind, a control is added in the same commit); `digest-sensitivity.mts` perturbs exactly one site
of 76 and the digest sorts its rows, so a second perturbation is covered by construction, and its
zero-population case already ABORTS rather than passing vacuously (not blind, recorded as checked);
the declared-limit pins do not range over body count (not applicable, recorded). Three of four
recorded, one repaired — that is what discharging this obligation looks like.

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
| W1 | re-lex `attached[0]` as-is, keeping the character-run boundary | it is the one-line reading of "collect the nested bodies" | **I, plus Task 2's line and no-site assertions** — CORRECTED at implementation time by BUILDING the variant and running the shipped checks against it: G and H do NOT discriminate it, because `"[^"]*"` consumes G's whole target and enough of H's for the re-lex to find the body. The mid-construct stop is what survives, and only the ATTRIBUTION predicate sees it |
| W2 | delimit by construct, but do NOT retain the target | the substitution family is the visible half of the ledger row | **F** — an attached here-string has no nested body at all |
| W3 | retain the target, but do NOT collect nested bodies | retention alone makes the here-string case pass | **A–E** — every substitution spelling stays silent |
| W4 | fire the unlexable report on ANY attached target | "never silently discarded", read maximally | **AC-5's digest** — the corpus's 53 ordinary targets become advisories |
| W5 | recurse only ONE level into the attached slice | depth 1 covers B, C and D, which look like the whole family | **the depth 2/3/4 recursion case** — G is depth 2 and an implementation capped there passes it. §2b-bis records W5 as could-not-be-built, so no variant was ever observed failing; and the shipped case asserts three concrete depths rather than depth generally, so a cap at FOUR would still survive it. Recorded as the limit it is. |
| W6 | honour the escape pair at top level only | escapes read as a lexer-entry concern | **the escaped-double-quote case** — §2b-bis found H does NOT reach this path and no shipped check caught W6 at all; the case that kills it was measured and added on this arc |
| W7 | treat the report as a `PsqlSite` rather than an `IndirectionHit` | a site is the more familiar result type | **the zero-PsqlSite assertion on an unlexable target** — §2b-bis records W7 as could-not-be-built (it needs a site factory) and the live corpus has no applicable row, so the digest is NOT the discriminator |
| W8 | delimit within ONE physical line, ending the region at any newline | a redirection and its target look like a same-line construct, and every case A–I is one | **the body COORDINATE cases** — §2b-bis measured J's presence assertion SURVIVING this weakening; only the line-and-offset assertions kill it |
| W9 | handle an attached target only when the operator has no file-descriptor prefix | the prefix reads as a separate token, so `2>` looks like a different construct | **K** — `cat 2>"$(psql -c 'select 1')"` executes once and both scanners return zero |
| W10 | ADD a correctly attributed record and leave the wrongly attributed one | additive repairs feel safer than replacing a record something else may read | **I** — its predicate is universal over every site the snippet produces, so `[wrong, correct]` fails |
| W11 | delimit construct-aware after `>` and `<<<`, fall back to the old character run for the other ten operators | those two are what every acceptance case uses, so the gate goes green | **the derived operator row**, which iterates the SHIPPED array — plus `operator-oracle.mts` (spec §2.2b), which measures the expected split against bash rather than against the constant |
| W18 | stamp every collected body with the TARGET'S FINAL line, preserving the real byte offset | the target's end is where the walk finishes, so it is the line in hand | **a body on line 2 of a target closing on line 3** — the derived coordinate rule, which also kills the unnamed members of this family |
| W19 | emit `IndirectionHit.line` from the scanner's current line at EOF | for a span that never closes, "where it started" and "where the scan ran out" look identical | **a multiline unlexable span** — its opening line and EOF are then distinct |
| W13 | emit unlexable reports only for `>` while delimiting every operator correctly | the report path and the delimit path look like one feature | **a non-`>` unlexable case** — the operator derivation covers the report path too, not only Task 1's |
| W14 | key the unlexable channel to the three opener spellings the plan happened to name | three cases read like three openers | **the accept-set opener table** — cases are derived from §3.1, so `$(` vs `${` and plain vs locale vs ANSI-C quotes are all covered |
| W15 | always stamp `IndirectionHit.line = 1` | every unlexable fixture started on line 1 | **a prefixed case requiring line 2** — the same first-line blindness J carried, one surface along |
| W16 | overwrite accumulated bodies at each attached target, keeping only the last | one target reads like one accumulation | **psql in the FIRST of two targets** — the multi-target control is stated in both orders because payload position decides whether it discriminates |
| W17 | stamp `line = operatorLine + 1`, `offset = operatorOffset` | a one-line displacement matches the only multiline fixture | **J with TWO continuations** plus a byte-offset assertion — a displacement right by construction is not an assertion |
| W20 | decline the attached walk for `>&` and `<&`, reasoning that a descriptor operand cannot carry a substitution | the operand IS a descriptor, so the reading is intuitive and wrong | **the bash oracle** — both expand the word FIRST and fail the descriptor check afterwards, so psql executes and declining is a SILENT MISS. This was the first draft's assertion and it was simply wrong |
| W21 | collect nested bodies for EVERY operator, `<<` and `<<-` included | a here-doc delimiter looks like an ordinary attached target | **the bash oracle** — those two execute NOTHING, so a body collected there is a FALSE advisory, the direction the bound refuses even though it is the loud one |
| W22 | emit the unlexable report on every surface the walk runs on | the report path looks surface-agnostic | **the live tree** — nine template literals in `.ts` files, `` `<h2[^>]*\bid=["']${ref.fragment}["']` `` among them, every one a false advisory. Killed by the tree-certified rows and by AC-5, not by a fixture |
| W12 | delimit and retain the target correctly, but collect only the FIRST nested body in it | one target reads like one body, and every §2.2 case has at most one | **nothing in the acceptance set either** — `cat >"$(true)$(psql -c 'select 1')"` executes psql and stays silent under first-body-only collection. Closed by the population obligation below, derived rather than by one more fixture |

**W8, W9 and W10 are round 4's, and each is the same defect shape as W1: an implementation that
passes the whole gate for a reason unrelated to the specification.** W8 and W9 were invisible until
round 4 because every case A–I shared two dimensions its author never varied — one physical line,
and a bare `>` after the command word. W10 was invisible because the attribution predicate was
existential. Adding J and K did not lengthen a list; it crossed two axes, which is the only thing
that moves this class.

**W1 is the one to watch, and MEASURING it corrected this section.** The naive re-lex passes A–F by
accident: the bare-backtick slice `` `psql `` re-lexes to an unterminated backtick whose body is
`psql `, so case A goes green for a reason that has nothing to do with construct-aware delimiting.
A corpus of A–F alone would certify it.

**But G and H do not separate it either, and this plan claimed they did.** Built as a variant at
implementation time — the character-run boundary restored, everything downstream untouched, and
`undelimitable` still taken from the real walk so the unlexable channel is not a second missing
feature — 21 of 24 shipped checks still hold. G holds because `"[^"]*"` matches G's target
WHOLE (it carries single quotes, not double), so the re-lex finds the body; H holds because the
alternation consumes enough of it for the same reason. What actually catches W1 is **case I's
ATTRIBUTION predicate**, plus Task 2's opening-line and zero-site assertions, which the
mid-construct stop breaks by handing the remainder to top-level text.

The general point is the one rule 17 makes: a killer NAMED in a plan is a claim until the variant
is built and the check is observed failing. Two of the three killers this row named were wrong,
and reading the plan a second time would not have found it.

### 2b-bis. The killer audit, run at implementation time — ABSENT, PRESENT-BUT-UNPROVEN, PROVEN

Rule 17's obligation is not "a killer is named", it is "the killing check EXISTS IN THE SHIPPED
TESTS and fails when you break it". A killer never run against the mutant it targets is a CLAIM,
and it fails in the direction that looks green. The list below is derived from the table above
rather than from recall, and the variants were built as COPIES outside the repo so this could run
beside a live measurement without touching a tracked byte.

**No-defect baseline first:** 24 of 24 checks hold against an unmodified copy. Without that, a
failure below could be the harness rather than the weakening.

| state | rows |
|---|---|
| **PROVEN** — variant built, weakening confirmed EXPRESSED, shipped check observed FAILING | W1, W2, W3, W4, **W6**, W8, W9, W10, W11, W12, W13, W14, W15, W16, W17, W18, W19, W20, W21, W22 — TWENTY |
| **COULD NOT BE EXPRESSED**, with the reason stated rather than shrugged | W5, W7 |
| **NOT CAUGHT** | none — W6 was, and its case now ships |

**W5 and W7 are not "unproven", they are cases I could not build**, which is a different claim and
is worth stating as one. W5 (recurse only ONE level) turns out to be INERT as a source edit: the
delimiter decides only the target's END, and the bodies come from handing the slice to
`lexShellWords`, so making the walk non-recursive changes nothing wherever the closing quote is
still found. Five candidate separators — a quote nested inside a brace, a `$( )`, a backtick, a
single-quoted operand, and a plain depth-2 control — all agree between the variant and the shipped
scanner. W7 (emit a `PsqlSite` instead of an `IndirectionHit`) cannot be built without inventing a
site factory the module does not expose; the no-site row that would catch it is present and it was
observed FAILING under W1 and W10, so the check is live even though this particular variant is not
constructible.

The split is stated rather than rounded up, because "I checked" and "it discriminates" are
different claims and only one of them was made for eight of these rows.

**W6 was the audit's real yield: no shipped check caught it, and one now does.** Honouring the escape pair at top
level only leaves 24 of 24 holding, and the killer this plan named — H — does not exercise that
path at all, because H's escaped backtick is consumed inside `closingBacktick` rather than inside
the quoted-span walk. The separator was then MEASURED rather than guessed:
`cat >"a\"b$(psql -c 'select 1')"` is sites 1 / hits 0 shipped and sites 0 / hits 1 under the
variant, so the weakening converts a real SITE into a mere advisory. That case was HELD while a measurement was
in flight — editing a deciding suite mid-run does not cost the run, it silently corrupts it — and
landed the moment the run returned. It is PROVEN to discriminate: shipped reads
`{sites: 1, nested: [true], unlexableAdvisories: 0}` and the variant reads
`{sites: 0, nested: [], unlexableAdvisories: 1}`. Both halves are asserted, because "something
reported" holds either way and is exactly the presence reading this class defeats.

**A variant must be shown to EXPRESS its weakening before its result is read.** Two first drafts
were inert or wrong-shaped and both would have been recorded as clean: W8's stopped the quoted walk
at a bare newline, but J's newline is preceded by a BACKSLASH and the escape branch consumes the
pair first; W9's fell through to the DETACHED path, where the ordinary loop lexes the target as a
word and collects its body anyway. Each now carries a precondition check that base and variant
DIFFER on the input the weakening is about, and both are caught once rebuilt.

**The pattern the audit actually found, across W1, W6 and W8: a PRESENCE assertion does not
discriminate a delimiting weakening, and an ATTRIBUTION or COORDINATE assertion does.** W1 survives
G and H and dies to I's attribution predicate. W8 survives J's presence assertion — the truncated
target leaves the substitution at top level, so something still reports — and dies to the two
coordinate cases. W6 survives everything, and its separator is a case where the site is lost
outright. This plan's killer column named a presence case in each of those three rows.

**What the audit changed, and it is the reason to run one.** W1's killer set as this plan first
stated it — G, H and I — is WRONG in two of its three parts, and no amount of re-reading would have
shown it. See the corrected row above. W16's proof is the other useful one: the variant is caught
by the payload-in-the-LAST-target row and NOT by the payload-in-the-first row, which is exactly
why the case is stated in both orders.

**One construction defect, recorded because it is the shape rule 240a names.** The first W4 variant
dereferenced a null and THREW. A crash is a red for the wrong reason and proves nothing about the
check under audit — it would go green the moment the field merely EXISTS. Rebuilt so the variant
reports every retained target instead, and it then fails exactly one check: the ordinary attached
target drawing no advisory.

### 2b-ter. The acceptance-set sweep — four axes closed, none of them a repair

The handover's §5a inventory names seven axes the acceptance set varies in NO fixture and ranks
items 1, 3 and 5 first. Item 5 was already crossed on arrival: the unlexable table's `'` and `$'`
rows carry terminated twins, which is the false-advisory direction §5a calls the interesting one.
Items 1, 3, 4 and 7 were open and are now closed.

**Not one of them was a repair, and that is worth stating plainly.** Fourteen spellings were probed
against the shipped delimiter before a line of test was written, and thirteen matched the predicted
value. The fourteenth disagreement was mine: I wrote a fixture whose double quote never closes while
meaning one that does, and the scanner's zero-sites-plus-one-advisory was the consequence bound
behaving exactly as §4 specifies. Re-probed across seven EOF spellings, terminated and unterminated,
and the split holds on all seven. So the sweep buys the PIN and not a fix — which is the inventory's
own point, that an axis no fixture varies is certified by nothing.

| axis | what it now crosses | killed by |
|---|---|---|
| 3, same-command resume | five rows, both which-target-carries-it orders, plus a coordinate row | `w23`, `w22` |
| 1, end of file | nine rows: closed is RESOLVED, unterminated is REPORTED | `w21` |
| 4 and 7, position and line endings | function body, after a here-document, case arm, CRLF — on the COORDINATE | `w20`, `w22` |

**The oracle caught five fixtures that asserted a site for a command bash never runs**, which is
why §4 item 6 exists and why skipping it would have been the round this section is meant to save.
`>"$(true)"` expands to an EMPTY filename and bash aborts the command AT that redirection, before
expanding the next one, so "payload in the LAST" and "payload in the MIDDLE of three" pinned a
resolved site for a psql the shell never reached. The other three were a function defined and never
called, a `case` arm testing unset `$x` against pattern `a`, and the first spelling of the
payload-first row. All five now execute. **The pre-existing across-line rows are NOT the same
defect** and are deliberately left alone: W16's targets sit on separate lines, so a failed
redirection aborts only its own command. The abort is confined to one command, which is exactly why
the same-command axis was worth adding and also why it was the one that could go quietly wrong.

**Both directions are measured on the interpreter rather than argued.** Every row the scanner
resolves to a SITE executes, 7 of 7. Every row it reports an ADVISORY on executes NOTHING, 4 of 4,
because bash dies on the unexpected EOF — so a site there would be a false report, and the advisory
is the correct conservative signal. That is §4's consequence bound demonstrated at EOF instead of
asserted.

**Load-bearing by proof rather than by claim**, on rule 17.1's standard, with a no-defect baseline
first (4/4 against the shipped scanner). `w21` forces an unterminated construct to report as closed.
`w20` is an off-by-one resume (`i = end`). `w23` walks the whole chunk but collects bodies only from
the first target, and it is the decisive one: it kills BOTH item-3 checks while leaving the EOF and
coordinate rows quiet, so the four tests discriminate independently rather than as a bundle.

The variants are built as COPIES outside the repo, as every variant on this arc is, so the tracked
tree is never mutated and the audit can run beside a live measurement. That makes them ephemeral, so
the EDIT is recorded here and the file is not — each is a single substitution against
`tests/cross-cutting/psqlStartupFiles/scan.ts` and rebuilding one is a one-line change:

| variant | the single edit | what it models |
|---|---|---|
| `w20` | `i = end - 1` becomes `i = end` | an off-by-one on the resume index after a delimited target |
| `w21` | in `attachedTargetEnd`, `{ end: text.length, undelimitable: true }` becomes `undelimitable: false` | a delimiter that treats running out of input as a closed construct |
| `w22` | `i = end - 1` becomes `i = text.length` | the first attached target is handled and the rest of the chunk abandoned |
| `w23` | the collector guard gains `&& nested.length === 0` | the walk covers the whole chunk but only the FIRST target's bodies are collected |

`w23` is the one to keep: it leaves the walk intact, so the EOF and coordinate rows stay green, and
only the same-command count rows notice. A variant that breaks everything proves less than one that
breaks exactly the thing under test.

**`w20` escapes item 3's counts and dies to the coordinate row.** That is §2b-bis's one general
finding surfacing a third time on its own evidence: a presence-or-count assertion does not
discriminate a delimiting weakening, and a coordinate assertion does. The count row alone would have
recorded item 3 as covered while the likeliest off-by-one walked straight through it.

---

## 2c. Why Tasks 1 and 2 are two tasks, and why this order

**The split is legitimate under the can-each-half-reach-red-then-green test.** Task 1's eleven
subjects (A–K) are all DELIMITABLE spellings; Task 2's cases are the UNTERMINATED ones, and the shipped table carries SEVEN positives - one per opener in the accept-set table - not the three an earlier draft named. The
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

Nothing test-local decides the outcome: the probe at `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/probe-attached.mts` measures all eleven
as unmet on the current tree with four positive controls reporting — that is the BARE (baseline)
invocation, which exits 0 while reporting them unmet.

**The green condition is `--expect-report`, and the flag IS the gate.** Bare, the probe is a
BASELINE check that expects the subjects SILENT; only `--expect-report` exits 1 naming every
subject still unmet, which is the direction that matters after the edit. Measured today: bare
exits 0, `--expect-report` exits 1. **This was found by sweeping plan round 1's finding 2 across
every command this plan names** — that finding was `baseline-corpus.mts` cited without `--expect`,
and the same shape sat here in the acceptance probe. Two probes in this arc have a mode flag that
separates reporting from gating; both are now named with it wherever they are cited as a gate.

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
   of silently exempt. `>&` and `<&` are NOT exempt and the earlier draft calling
   them meaningless was refuted by measurement: bash expands the word FIRST and only then fails
   the descriptor check, so an attached substitution there really executes (spec §2.2b's operator
   table, and the executable assertion in the deciding suite). The two operators that genuinely
   execute nothing are `<<` and `<<-`, which take a here-DOCUMENT delimiter literally. Every
   operator asserts its outcome explicitly rather than being skipped: a skip is indistinguishable
   from a miss.
6. **Cross the nested-body POPULATION axis, and assert the count rather than a witness.** Every
   §2.2 case carries AT MOST ONE substitution body, so W12 — collect the first body and stop —
   passes the whole acceptance set. `cat >"$(true)$(psql -c 'select 1')"` is one ordinary edit from
   B, bash executes psql, and first-body-only collection is silent. The task's test asserts that the
   number of collected nested bodies EQUALS the number the target contains, over a fixture family
   of zero, one and two SIBLING bodies — siblings, not nesting: case H already nests, and a
   first-body-only walk survives nesting while dying on siblings. A single two-body witness proves
   less than the equality does, and the equality is what makes an added third body covered by
   construction.
7. **Four more axes, all found by review at plan rounds 1 and 2, all the same shape.** Each names
   an implementation that passes every case stated above:
   - **H needs an ATTRIBUTION assertion, which is why it carries one BESIDE its presence row.**
     A walker that marks a backtick inside an attached double-quoted target as `backtick:false`
     makes H report while attributing it wrongly, and the separate bare-backtick path still
     carries I. H's SUBJECT row keeps the ordinary presence expectation and a separate assertion
     covers attribution - two assertions on one subject, which is what the suite ships. H does
     NOT take the UNIVERSAL
     `nestedInBacktick === true` predicate as I, not a presence check.
   - **COORDINATE ASSERTIONS FOLLOW A DERIVED RULE, because fixture-at-a-time did not converge.**
     Rounds 1 through 4 each killed one positional heuristic and left the next alive: anchor to the
     operator's line (round 1); `operatorLine + 1` with the operator's offset (round 3); the
     target's FINAL line (round 4); the scanner's current line at EOF (round 4, on Task 2). Each
     repair was a fixture, and each fixture left another coincidence standing. **The rule, applied
     to every coordinate assertion in both tasks: choose the fixture so the asserted line differs
     from EVERY other candidate line in that fixture** — the operator's line, the target's first
     line, the target's LAST line, and EOF. Concretely, a body on line 2 of a target that opens on
     line 1 and closes on line 3, in a file whose EOF is later still. That kills the whole family of
     "stamp it with some other line" implementations at once, including heuristics nobody has
     named yet, where another fixture kills exactly one. State the four candidate lines and show
     they are pairwise distinct; a fixture where any two coincide is not admissible as a coordinate
     control.
   - **The one-line displacement that motivated this.** A walker anchoring
     every attached nested body to the operator's line passes a presence assertion while stamping
     line 1. But a walker that stamps `line = operatorLine + 1` and `offset = operatorOffset` ALSO
     passes a J spanning exactly one continuation: every other case is single-line and ignores the
     coordinates, and J happens to expect the next line, so the wrong rule and the right rule agree
     on the only fixture that could tell them apart. J therefore carries TWO continuations and
     asserts the psql on the physical THIRD line AND at the psql's own byte offset. A displacement
     that is right by construction is not an assertion.
   - **Recursion is not capped at case G's depth**, asserted over depths 2, 3 and 4 rather than
     over depth generally — a cap at four survives it, and that is a stated limit rather than a
     claim of unboundedness. G nests two deep, so an
     implementation capped at two passes A-K, the operator-derived test and the sibling-body test.
     `cat >"${OUT:-${OTHER:-$(psql -c 'select 1')}}"` is one edit from G and bash executes it; the
     assertion covers depths 2, 3 and 4 rather than on that one fixture.
   - **Attached-target population within one chunk is unvaried too.** The sibling-body repair varies
     bodies inside ONE target; a collector that walks every body of the FIRST substitution-bearing
     attached target and ignores later ones still passes. `cat >"$(true)"` on one line followed by
     `cat >"$(psql -c 'select 1')"` on the next kills it. Assert over BOTH populations - targets per
     chunk and bodies per target - because closing one leaves the other open, which is exactly what
     happened here.
     **The payload's POSITION is part of the control, and the first draft of this case got it
     wrong.** With `true` in the first target and `psql` in the last, an implementation that
     OVERWRITES its accumulated bodies at each target — keeping only the final one — passes. State
     the case in BOTH orders: psql in the FIRST target with a harmless one after it, and psql in the
     last. A control whose payload sits where the defect cannot hide it is not a control, and this
     one was added in the previous round to close a population axis while being blind on order.
8. The attached target's own text still never becomes an argv word. That is what keeps this
   outside both readings the filing arc REFUSED (spec §1.1).

**Retire the three pins in this commit** (§2 above), and hold both controls unchanged.

**Four pre-dispatch mutant FAMILIES, per the string-presence discipline, each covering a SUBSET of the firing cases rather than all eleven** — (a) omits D, F, H, I and J; (b) omits H and I; (c) omits H; (d) omits C, D, G, H, I and J. For the cases each family does cover, and NOT for all eleven firing
cases: (a) empty the body so the target carries no command — the case must go quiet, proving it
tracks the nested body and not the presence of a target; (b) replace `psql` with `notpsql` — quiet,
proving it reads the command word; (c) add `-X` to the body — the site must report with
`suppressesStartupFiles === true` rather than vanish, proving the case reads the verdict and not
mere presence; (d) move the same body to a DETACHED position — it must still report, proving the
case is not accidentally passing through the already-working detached arm.

**Mutant (c) is not observable for F, and the procedure says so rather than silently failing.**
F reports through `scanShellIndirection` as an `IndirectionHit`; it produces no `PsqlSite`, so there
is no `suppressesStartupFiles` field for the `-X` mutant to move. F takes mutants (a), (b) and (d),
and its (c) analogue asserts that adding `-X` to the here-string binding leaves the `IndirectionHit`
PRESENT — a hit records an indirection, not a verdict. A procedure stated for "each of the eleven"
that cannot execute for one of them is a checklist item nobody can discharge.

**I's mutants are DIFFERENT, and that is the point of giving it its own predicate.** Its assertion
is `nestedInBacktick === true`, so the presence mutants above cannot discriminate it: (a) emptying
the body makes it report nothing, which a presence assertion would also catch, but (b) moving the
psql OUT of the backtick body must flip `nestedInBacktick` to false while the site STILL REPORTS —
that is the mutant only an attribution assertion kills, and it is the one that would have passed
against the round-1 fixture. **A third mutant is now required and is round 4's:** leave the existing
wrongly top-level site in place and ADD a correct one. The predicate is universal over every site
the snippet produces, so `[wrong, correct]` must FAIL — an existential reading passed it. **H's subject row
takes the ordinary presence expectation AND H carries its own separate attribution assertion**; the two
are distinct assertions on one subject, which is how the suite ships it. An earlier passage described
H as taking the universal predicate in its subject row, which the implementation does not do.

**Premise (executable, on each case's OWN inputs).** Immediately above each assertion,
`premiseHolds("this case's attached target really is attached", …)` asserting no whitespace sits
between the operator and the target — because a case whose fixture drifted to a detached spelling
would pass through the arm that already works and prove nothing about this one.

## Task 2 — a target the machinery cannot delimit is REPORTED, not discarded, on the spec's REPORT CONDITION

<!-- task: red=`pnpm exec vitest run tests/cross-cutting/psqlStartupFileSuppression.test.ts` red-state=authored red-target=`tests/cross-cutting/psqlStartupFiles/scan.ts:3050` why=`cases derived from the accept-set opener table assert that an attached target carrying an unterminated construct yields an IndirectionHit naming it; the production surface is scanShellIndirection, which emits no such hit for any undelimitable target, so all three cases read an empty hit array until the channel exists` ac=AC-3 -->

**Files:** Modify `tests/cross-cutting/psqlStartupFiles/scan.ts`, `tests/cross-cutting/psqlStartupFileSuppression.test.ts`.

**What is red and why.** The production surface is `scanShellIndirection`, cited by SYMBOL rather
than by a line Task 1 rewrites — a red-target pointing into your own blast radius still resolves
after the edit and silently names different code. Task 1 delimits what the accept-set can close. An UNTERMINATED
construct closes nothing, and the consequence bound forbids silent discard — so an unterminated
construct gets a case asserting a surfaced **`IndirectionHit`** naming the undelimitable target.
They fail until the channel exists.

**The case list is DERIVED from the accept-set, not hand-picked — three findings in one round came
from picking.** Task 1 iterates the shipped `REDIRECTION_OPERATORS` array rather than a retyped
list, and Task 2 was written with three chosen spellings (one backtick, one brace, one quote) while
varying nothing else. Three separate implementations pass that:

- **Opener coverage.** §3.1's accept-set distinguishes `$(` from `${`, and a plain double quote from
  the locale form `$"…"` and the ANSI-C form `$'…'`. An implementation keyed to whichever three
  spellings were picked silently discards their siblings. Enumerate the unlexable cases FROM §3.1's
  opener table — one unterminated case per opener the table admits — so an opener added to the
  design is covered without editing this plan.
- **Operator coverage.** The derived operator test sits only on Task 1's delimitable path, so an
  implementation can delimit every shipped operator correctly and emit unlexable reports only for
  `>`. At least one unlexable case carries a non-`>` operator (`>>` is the cheapest), and the
  derivation over `REDIRECTION_OPERATORS` covers the report path as it does the delimit path.
- **Line attribution, under the SAME derived rule as Task 1.** Every unlexable fixture as described
  starts on line 1, so an implementation that always emits `IndirectionHit.line = 1` passes every
  positive, every terminated twin and the descriptor case while attributing wrongly. Moving one
  fixture to line 2 kills that heuristic and leaves the next one alive: an implementation emitting
  the scanner's CURRENT line at EOF passes a single-line unlexable span on line 2, because for a
  span that never closes, "where it started" and "where the scan ran out" coincide. So at least one
  unlexable case SPANS lines — the target opens on one line and EOF is later — and the hit is
  asserted at the target's opening line with the four candidate lines shown pairwise distinct, per
  Task 1's derived rule. Round 4 found the EOF heuristic on this surface and the final-line
  heuristic on Task 1's; they are one family and the rule closes both.

**The firing condition is narrow and is part of the red:** the report fires only when the
undelimitable span carries a substitution opener, so the corpus's ordinary attached targets (53 at base `e5d1d723d`; see §0)
stay quiet. A case asserting that `cat >"${OUT}"` emits NOTHING is the half that pins it.

**This is the half that makes the bound true rather than aspirational.** Spec §5: *correct or
signaled, never silently wrong.* Task 1 supplies "correct"; Task 2 supplies "signaled".

**Negative twin, per the both-directions rule.** Each unterminated case is paired with its
terminated sibling one edit away, asserting NO unlexable report — otherwise a channel that
reports everything satisfies every positive in the table while being maximally broken - which is why the block pairs each opener with its TERMINATED twin rather than resting on the positives alone.

**Each unlexable case also asserts ZERO `PsqlSite`s.** An implementation that emits the required
`IndirectionHit` AND fabricates a `PsqlSite` alongside it passes both the positive and the negative
twin, and AC-5's digest cannot kill it because the live corpus holds zero members of this family —
there is no baseline row for a fabricated site to move. The site count is the only assertion that
discriminates, so it is stated per case rather than left to the corpus gate.

**One unlexable case carries a file-descriptor prefix.** Task 2 varies opener KIND and nothing else,
so an implementation that delimits K correctly but suppresses the unlexable report whenever a
descriptor preceded the operator passes every stipulated case. The killer is K with its closing
quote removed — `cat 2>"$(psql -c 'select 1')` — one edit inside the domain.

<!-- tasks: end -->

---

## Step 3 (OUTSIDE the red-contract region) — the corpus does not move, and the documentation moves with the code

**Why it carries no task marker.** Both halves are checks and edits, not red-then-green cycles on
production behaviour. The corpus-equality half is a GATE that must pass before AND after — it
cannot be red, and a marker claiming otherwise would be the manufactured-red shape. The
documentation half is a docs move: nothing mechanical fails on a documented limit that has become
false, which is exactly why it has to be a named step rather than a trusted intention.

**Files:** Modify `tests/cross-cutting/psqlStartupFiles/scan.ts`, `tests/cross-cutting/psqlStartupFileSuppression.test.ts`, the spec and the probe record; RE-PIN `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/slice-shape.mts` to the base revision, since Task 1 deletes the pattern it reads and a probe that cannot see its subject must abort rather than report; CREATE `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/operator-oracle.mts`. Run `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/baseline-corpus.mts --expect 8ebe8b08d43e6308aa471112d9f086d0118e6238`, `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/digest-sensitivity.mts` and `docs/superpowers/specs/ci/probes/2026-08-21-shell-attached-target-scripts/corpus-family3.mts`.

**AC-5, the consequence bound made executable.** Re-run the digest-pinned baseline and assert the
finding set is unchanged apart from this arc's own constructed fixtures: **76 sites, digest
`8ebe8b08d43e6308aa471112d9f086d0118e6238`**. This is the check that distinguishes a guard that
got stricter from one that merely got louder.

**`--expect` is not optional, and the flag IS the gate.** Without it `baseline-corpus.mts` prints
the digest and exits 0 whatever the digest turns out to be — measured, both directions: bare exits
0, a wrong expected value exits 1. A step that names the bare invocation as its gate cannot reject
a moved finding set, which is the tautological-gate shape this plan is otherwise built to avoid.
The digest is a corpus SCAN DIGEST, not a git ref: verify it with this probe, never with
`git cat-file`.

**AC-5b runs HERE, in this step, and it is not a peer-sweep afterthought.** `digest-sensitivity.mts`
proves the digest still DISCRIMINATES on the fields §5 forbids moving — seven perturbations
including `null`→`undefined` and `null`→ABSENT. It must run AFTER the `scan.ts` edit, because a
record shape that changed underneath the serialisation is exactly what would make AC-5 pass
vacuously: an unchanged digest over a field the digest stopped reading is not an unchanged finding
set.

**Documentation that must move with the code, or it becomes a stale citation that still reads
true** (spec §6):

- `tests/cross-cutting/psqlStartupFiles/scan.ts:280`–`tests/cross-cutting/psqlStartupFiles/scan.ts:297`, the documented-limits block, which currently calls this family "not read
  at all" and "the sharpest limit in this list";
- `tests/cross-cutting/psqlStartupFiles/scan.ts:1063`, which describes a redirection the lexer CONSUMED in the attached spelling;
- `tests/cross-cutting/psqlStartupFiles/scan.ts:1564`, on what each spelling emits from the buffer;
- `tests/cross-cutting/psqlStartupFiles/scan.ts:2965`, which states the attached here-string spelling is "deliberately NOT read" — the
  sentence Task 1 makes false via case F;
- the deciding suite's block-2 comment at `tests/cross-cutting/psqlStartupFileSuppression.test.ts:5921`, which declares the ATTACHED family WITHDRAWN
  SCOPE; following this plan turns that block's zero into a report while the prose above it still
  says the target is never read;
- the deciding suite's note declaring the attached `<<<p'sql'` spelling withdrawn scope
  (`tests/cross-cutting/psqlStartupFileSuppression.test.ts:6171`).

**The sweep is DERIVED, not this list.** Both reviews found a comment this enumeration had missed,
which is the enumerated-cover failure AGENTS.md names. Before committing Task 1, run
`rg -n 'ATTACHED|attached' tests/cross-cutting/psqlStartupFiles/scan.ts tests/cross-cutting/psqlStartupFileSuppression.test.ts` and read every hit that makes a claim about what is or is not
read; the list above is where that sweep landed today, not a substitute for running it.

Re-run the three-surface census after the change and confirm the population is still zero — the
repair must not have manufactured live instances.

## Step 4 (OUTSIDE the red-contract region) — re-derive the registry, then score

**Why it carries no task marker.** A registry re-derivation is a MEASUREMENT, not production
behaviour, and its only available "red" is one Tasks 1-3 create for it — the manufactured-target
shape. `pnpm mutation:sites` exits 0 today (26 rows ok, zero stale, verified at plan time), so a
`red-state=live` marker here would be false. Stated acceptance instead:

- every accepted row re-keyed through the shipped enumerator and RE-VALIDATED, not merely re-keyed;
- `pnpm mutation:sites` reports zero STALE rows for `psqlStartupScan`;
- **AC-7:** `pnpm heavy pnpm mutation:guards` scores at or above the floor with an EMPTY unaccepted-survivor
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

**One commit, BEFORE whole-diff review**: file any peer rows, archive the graduating row, remove the
in-progress marker. Absence is then guaranteed rather than maintained, and the ledger commit is
reviewed rather than riding into the merge unreviewed. Arm `--auto` only once CI is green AND review
approves.

**This ordering is RATIFIED and supersedes AGENTS.md invariant 12's last-commit wording. Do not
relitigate it.** The ratification is a batch-wide standing rule carried inline in every batch-2 and
batch-3 plan; the citation is the batch-3 common brief, §3 STANDING RULES, first bullet: *"Ledger
closeout goes EARLY — peer rows filed, graduating row archived, marker removed, ONE commit taken
BEFORE whole-diff review."* A sibling arc refuted this same finding against the same ratification.

**Recorded because this plan got it wrong once.** Plan round 1 finding 7 raised the AGENTS.md
last-commit wording against this step; it was ACCEPTED and the step reversed, then reversed back —
a forced change later undone, which the round-economy rules charge to the ACCEPTANCE rather than to
the reviewer. The finding was really about a MISSING CITATION: the ratification was never named
here, so a reviewer reading only AGENTS.md was right to flag it and had nothing to check against.
The citation above is the actual repair, and it is fenced in both directions so neither side
relitigates it again.

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
| AC-3 | undelimitable target reported as unlexable, on the spec's REPORT CONDITION (§3 part 4) | Task 2 |
| AC-4 | `F11` control unchanged | Task 1 |
| AC-5 | corpus finding set unchanged, digest held (`--expect`, not the bare reporter) | Step 3 |
| AC-5b | the digest still DISCRIMINATES on every field §5 forbids moving | Step 3 |
| AC-8 | census still finds zero substitution-bearing targets | Step 3 |
| AC-6 | THREE pins retired deliberately, two controls held; ledger closed | Task 1, Step 5 |
| AC-7 | score at or above floor, empty unaccepted set | Step 4 |
