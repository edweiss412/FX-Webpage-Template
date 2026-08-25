# Replacement-string offender count, repo-wide — 2026-08-24

Probe record for `BL-REPLACEMENT-STRING-CLASS-SWEEP` (`BACKLOG.md`). The row's first
scheduled step is a report-only run of the AST walk over the whole repository, because
the offender count is what decides whether the gate can ship as `fail` or has to ship
advisory-first.

Base: `origin/main` at `8bf8709914a3af247fc816f7c3e5329854a322c7`, worktree
`FX-worktrees/replsweep`, TypeScript compiler API via `pnpm exec tsx`. Scripts are
committed beside this record at
`docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/` and re-run from
the repository root.

---

## 1. The judge, and why it is the shipped one

`tests/paneCompaction/literalSubstitution.test.ts` already walks two files and judges
every `.replace`/`.replaceAll` call's SECOND argument: a string literal is fine, a
replacer function is fine, anything else is the defect. This probe is that judge with
the file list replaced by a walker-derived population — `git ls-files` filtered to
JS/TS extensions — and the assertion replaced by a tally.

Nothing about the judge changed. That matters for reading the number: it is the count
the shipped guard would produce on day one, not the count of a recognizer invented for
the probe.

## 2. Conservative count (the shipped judge, unchanged)

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-conservative.mts
files scanned (tracked, JS/TS ext):   3664
files containing a replace call:      496   @ 8bf870991
replace/replaceAll call sites:        1201
  literal replacement:                1120
  replacer function:                  25
  single-argument (no replacement):   0
  OFFENDERS (runtime value):          56
  offender files:                     32
```

**56 offender sites across 32 files.** A gate shipping `fail` against this population
reds the repository on its first run.

### The empty bucket is explained, not assumed

`single-argument (no replacement): 0` is the bucket that would hold `router.replace(url)`
— a call with the same method name and no replacement position at all, which the judge
would otherwise flag as an offender with no defect behind it. The zero is real:

```
$ rg -n 'router\.replace\(' -g '*.ts' -g '*.tsx' --glob '!node_modules/**'
(no matches)
$ rg -c 'replaceState' -g '*.ts' -g '*.tsx' --glob '!node_modules/**'
components/admin/review/ShowReviewSurface.tsx:4
tests/devcapture/useDevCapture.test.tsx:1
tests/components/admin/review/showReviewSurfaceSyncHash.test.tsx:11
```

This app navigates with `history.replaceState`, a different method name the walk never
matches, and uses no router `replace`. An empty bucket read without this check would be
indistinguishable from a walker that never reached the construct.

## 3. Same-file const folding moves the number by 11, and does not change the decision

The obvious narrowing is to resolve an identifier whose same-file declaration is
`const NAME = "literal"` — those carry no runtime value even though they are not spelled
inline. Measured:

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-constfold.mts
literal            1120
function             25
const-literal        11
one-arg               0
offender             45
TOTAL              1201   files 496   @ 8bf870991
offender files       24
```

**45 sites in 24 files**, against 56 in 32. The resolver buys 11 sites and costs a
name-keyed const map, which is unsound under shadowing — a module-level
`const X = "a"` and an inner-scope `const X = runtimeValue` collapse to one key and the
inner site is cleared wrongly. Eleven sites is not worth a resolver that can clear a
real offender, and the conservative judge's answer for those eleven is a mechanical
repair, not an exemption. **The gate ships the conservative judge.** The folding probe
is recorded because it is the measurement that retires the resolver, not because the
resolver is planned.

Either number reds the repository, so the tier decision does not turn on this.

### The population moves with the branch; the offender count does not

Both blocks above were run at the base `8bf870991` and are stamped as such, because they are
records of a run rather than claims about the tree. Every artifact this arc commits is itself a
`.mts` file containing `.replace` calls, so the population counts its own instruments and grows
on each commit that adds one.

It has now gone stale twice — first at 1204/498 when the two count scripts landed, then at
1206/499 when the shape sweep did, each caught by a reviewer re-running the derivation. Writing a
third number here would schedule a third staleness, so the current population is stated as the
command and nothing else:

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-conservative.mts
```

What is invariant, and what every decision in this record actually rests on: **offenders are
unmoved at 56 across 32 files** at the base and at every head up to the repairs. AFTER them the
count is 4 — the `docs/**` exceptions alone — which is this record's subject succeeding rather
than a figure going stale. Every block above is stamped with the sha it was run at for exactly
this reason.

## 4. The 56, by directory

Sites and files are separate columns because chained calls put several offender sites on
one line — `shapeHoldEntry.ts` contributes three sites at a single line 29.

| Directory | Offender sites | Offender files |
| --- | --- | --- |
| `tests/` | 35 | 18 |
| `lib/` | 9 | 5 |
| `scripts/` | 5 | 4 |
| `docs/` | 4 | 4 |
| `components/` | 3 | 1 |
| **Total** | **56** | **32** |

Derived, not transcribed:

```
$ pnpm exec tsx …/count-conservative.mts --list | sed -n '9,$p' | awk -F/ '{print $1}' | sort | uniq -c | sort -rn
$ pnpm exec tsx …/count-conservative.mts --list | sed -n '9,$p' | awk -F: '{print $1}' | sort -u | awk -F/ '{print $1}' | sort | uniq -c | sort -rn
```

An earlier revision of this section printed `tests 32 / lib 4 / docs 4 / components 3 /
scripts 2`, which sums to 45 — the const-FOLDED offender total from §3, not the 56. The
table above is the conservative judge's own output.

Full list at `count-conservative.mts --list`; reproduced in the spec's work list.

## 5. What the count does NOT settle

The tier rule says a gate that instantly reds N historical files ships advisory-first.
That rule assumes the historical population survives the PR. It does not have to: every
one of these 56 is a `.replace(a, b)` whose repair is `.replace(a, () => b)`, which is
mechanical and behaviour-identical wherever `b` holds no `$` sequence. If the PR repairs
the population, the gate reds nothing on day one and can ship `fail`.

Two site classes complicate that and are resolved in the spec, not here:

- **Intentional grammar.** `docs/.../support.js:381` passes `"$1" + alias`, where `$1`
  is a deliberate capture reference and `alias` is the runtime part. Wrapping the whole
  argument in `() =>` would silently kill the capture. These repair to a replacer
  function taking capture parameters.
- **Frozen records.** Four sites live under `docs/**`, in dated probe and spike
  artifacts whose value is that they are what was run. Editing them falsifies the
  record.

## 6. Which const-bound replacements carry a `$`

The wrap repair (`X.replace(a, b)` to `X.replace(a, () => b)`) is behaviour-identical
unless `b` already held a `$` substitution sequence. One shape inverts that: a const the
author DELIBERATELY wrote with a `$n` capture reference. Wrapping one of those turns a
live capture into literal text, so they have to be found before the sweep, not after.

`count-capture-cover.mts` runs three passes: (A) a `$` sequence in the call's own replacement
text, any node kind; (B) the replacement resolves to a same-file string-literal const bearing a
`$`; (C) every replacement B could not resolve, intersected against every `$`-bearing string
const in the repository. A and B are the finding set; C is the completeness argument, and the
script exits non-zero if C or the spread bucket is ever non-empty.

Spec round 2 rewrote this script. As first written it derived its own classification and drifted
from the judge three ways: it read the RAW argument while the judge strips transparent wrappers
(so `(TOK)`, `TOK as string`, `TOK!`, `TOK satisfies string` escaped every pass); it had no
spread rule; and its name map was last-write-wins, so an inner `const TOK = "plain"` hid an outer
`$`-bearing binding and the audit would have prescribed a corrupting wrap — the same shadowing
unsoundness §3 declines for the judge. Pass B now records EVERY binding per name and treats more
than one as unresolved rather than guessing, and the script mirrors the judge's wrapper and
spread rules explicitly. Removing that duplication is the spec's structural repair; see spec §6.

The block that stood here was `count-dollar-consts.mts`'s row-per-binding output, left in place
under the surviving script's name when that script was superseded — it does not reproduce from
`count-capture-cover.mts`, which emits summary counts. Spec round 3 caught it. The current
output is in §8, stamped.

**What the cover establishes, at the reviewed head:** two capture-preserving sites found
positively — `lib/observe/scrubSentryEvent.ts:18`, where `$1` carries the `/show/<slug>/` prefix
through the Sentry URL scrub, and the already-excepted `docs/**` one. Nine sites vouched
`$`-free, each resolving to exactly one plain same-file literal. And **45 about which the cover
is silent**, which is not a clean bill: see spec §6 and its documented limit 6. (That 45 is
unrelated to §3's const-folded 45 — the two are different quantities that happen to coincide, and
the collision is noted here so a reader does not spend time deciding whether it is a copy-paste
bug.)

`tests/styles/_metaNewTabAnnouncement.test.ts:3697` moved from vouched to silent when pass B
stopped guessing — its `hid` has eight same-file bindings — which is why the vouched count is
nine and not the ten an earlier revision claimed.

The derivation resolves const identifiers only. An offender whose replacement is a
property access, template expression, or call holds a RUNTIME value — that is the defect
the wrap fixes, not a capture reference to preserve — so the absence of those from this
list is the expected reading, not a gap. The spec records that boundary as documented
limit 6.

## 7. Argument shapes the judge cannot classify positionally

Spec round 1 raised this: `node.arguments[1]` means "the replacement" only while positional
indexing holds, and a spread breaks it. `s.replace(...[find, repl])` has ONE AST argument, so
`arguments[1]` is `undefined` and a judge that buckets on argument COUNT files a corrupting call
as not-in-population — an acceptance path wearing an out-of-population label.

The reviewer's one-edit probe, applied to the live `scripts/share-link-flash-adversary-matrix.mjs:876`
call:

```
source: src.replace(...[find, replace])
AST arguments: 1     node.arguments[1]: undefined     bucket: NOT IN POPULATION
intended literal: feat/$&     runtime output: feat/BRANCH     silent corruption: true
```

The class sweep, over every `replace`/`replaceAll` call in the tracked population:

```
$ pnpm exec tsx …/count-unclassifiable-shapes.mts            @ 1af34932f
replace/replaceAll calls: 1206
  spread at index 0 or 1 (UNCLASSIFIABLE):     0
  spread only at index >1 (indexing intact):   0
  zero arguments:                              0
  exactly one non-spread argument:             0
  replace.call / replace.apply:                0
```

Every unclassifiable shape is at zero today, which is why the spec's repair is a NARROWING
rather than a grammar: rule 1 of §3.1 declines to classify a spread-bearing call and reports it,
instead of teaching the judge to resolve spreads. It reds nothing now and closes the path.

The sweep also retires an assumption. §2's "the single-argument bucket is empty" was checked
against `history.replaceState` and router usage; this pass shows the whole sub-two-argument
bucket is empty — zero zero-argument calls and zero one-argument calls — so bucket 2 of §3.1 is
unoccupied rather than merely small.

## 8. The counts at `1af34932f`, re-derived

Round 2 of the spec review re-ran the committed derivations and found the population figures a
commit behind. Refreshed, and stamped, so the record is dated rather than wrong:

```
$ pnpm exec tsx …/count-conservative.mts                     @ 1af34932f
files scanned (tracked, JS/TS ext):   3668
files containing a replace call:      499
replace/replaceAll call sites:        1206
  literal replacement:                1125
  replacer function:                  25
  single-argument (no replacement):   0
  OFFENDERS (runtime value):          56
  offender files:                     32

$ pnpm exec tsx …/count-unclassifiable-shapes.mts            @ 1af34932f
replace/replaceAll calls: 1206
  spread at index 0 or 1 (UNCLASSIFIABLE):     0
  spread only at index >1 (indexing intact):   0
  zero arguments:                              0
  exactly one non-spread argument:             0
  replace.call / replace.apply:                0

$ pnpm exec tsx …/count-capture-cover.mts                    @ 1af34932f
A. textual  $ at the call site:        1
B. same-file const bearing a $:        1
!. spread: replacement not locatable:  0
C. unresolved / ambiguous names:       13
   $-bearing string consts repo-wide:  12
   INTERSECTION (needs hand-reading):  0
CAPTURE-PRESERVING SITES: 2   every other offender takes the ordinary wrap: 54
```

Three readings worth stating. The population grew by two sites and one file, both of them this
arc's own shape sweep. The offender count did not move, at 56 across 32 files, which is every
decision this record carries. And the cover's 2 + 54 reconciles against the conservative judge's
56 — the two scripts agree on the total by independent routes, which is what caught an early
draft of the cover rewrite reading 54 after an early `return` skipped chained calls.

## 9. One matcher, five derivations — and the planted defect that proves it

Spec rounds 2, 4 and 5 each found the SAME wrapper-resolution class in a different position: the
replacement argument, then the callee, then const binding initializers, then the file-level text
prefilter that runs before any of them. Round 5's finding also landed the sharper half — the
repairs kept arriving in ONE script while four siblings kept their own copies, and one of those
siblings is the independent oracle the spec's AC-1b compares against, so the cross-check was
vacuous on exactly the axis under review.

Four positions in one class is a fact about placement. `_shared.mts` now holds the single
definition of `PREFILTER`, `replaceCallee`, `litText`, `isAccepted` and `classify`, and all five
derivations import it. A derivation that wants a different answer has to say so rather than drift
into one.

**The prefilter deserves its own sentence** because it is the one that made every other repair
unreachable. `/\.replace(All)?\s*\(/` looks obviously correct and is wrong: a wrapped callee
spells `(s.replace)(a, v)`, where `.replace` is followed by `)`, so the file was skipped before
the AST matcher could see it. An optimization that can change the answer is a defect, not an
optimization. It now matches `/\.replace(All)?\b/`, strictly weaker than the test it precedes.

**Proved by planting the defect rather than by reading the code.** Edit the live
`tests/codexGuard/fixtures/fake-codex.mjs:63` from `a.path.replace(...)` to the
meaning-preserving `(a.path.replace)(...)` and re-run:

```
before the repair (reviewer's measurement):   calls=1205  offenders=55   <- file silently skipped
after the repair  (this measurement):         calls=1206  offenders=56   <- seen and classified
```

Unmoved with the edit reverted: 1206 calls, 56 offenders across 32 files, 2 capture-preserving,
12 receiver-only. Five derivations reach those totals by different routes and agree.

## 10. The prefilter is deleted, and here is the measurement that settled it

Spec round 6 was the SECOND round on the file-level text prefilter, which makes it an axis rather
than a defect. Round 5 showed `/\.replace(All)?\s*\(/` misses a wrapped callee; round 6 showed
the widened `/\.replace(All)?\b/` misses the trivia JavaScript allows between the dot and the
property name, and that an ordinary explanatory comment is enough:
`a.path./* expand $CODEX_HOME */replace(...)`.

Each repair widened the pattern and the next round found the next spelling. Rather than widen a
third time, the optimization is deleted.

```
$ pnpm exec tsx …/count-trivia-spellings.mts
baseline             old-tight=true  old-wide=true  AST=1
wrapped callee       old-tight=false old-wide=true  AST=1  <- prefilter would have DROPPED it
space after dot      old-tight=false old-wide=false AST=1  <- prefilter would have DROPPED it
newline after dot    old-tight=false old-wide=false AST=1  <- prefilter would have DROPPED it
block comment        old-tight=false old-wide=false AST=1  <- prefilter would have DROPPED it
line comment         old-tight=false old-wide=false AST=1  <- prefilter would have DROPPED it
escaped identifier   old-tight=false old-wide=false AST=1  <- prefilter would have DROPPED it
```

Six of seven spellings were dropped by one prefilter or both; all seven are found by the walk. The
last row is the one that decides it: `s.repl\u0061ce(...)` is a `PropertyAccessExpression` named
`replace` that NO regex over source text can ever match, so no widening could have reached it and
the axis had no terminating state.

The cost of having no prefilter, measured over the tracked population rather than estimated:

```
# @ c5c76ce28, pre-merge; parsed counts are the DERIVATIONS' population (docs/** included)
current  /\.replace(All)?\b/       parsed=508    calls=1206   1235ms
narrowed /\breplace(All)?\b/       parsed=609    calls=1206    751ms
none (parse every tracked file)    parsed=3670   calls=1206   1941ms
```

Seven hundred milliseconds against an axis that produced a finding in each of two rounds. Totals
after the deletion are unmoved: 1206 calls, 56 offenders across 32 files, 2 capture-preserving,
12 receiver-only.

## 11. The mutation prediction, written before the scored run

Static analysis of all 31 mutants `enumerateSites` generates for
`tests/cross-cutting/replacementString/scan.ts`, reasoned against the 49-case suite. Recorded
before the run so the run can contradict it, which is the only way the reasoning is worth
anything.

**Prediction: 31/31 killed, ZERO survivors, empty accepted ledger.**

| family | n | reasoning |
| --- | --- | --- |
| integer-literal | 9 | 7 killed by existing cases; 2 (`slice(0,110)`, spread-guard `===1`) were predicted survivors and are now killed by cases added for them |
| logical-connector | 7 | accept-set chain collapse, spread-guard disjunction, the two callee guards, the population subtraction |
| equality-flip | 5 | spread-guard flips, the walk's verdict inversions, `notInPopulationCount`'s bucket test |
| relational-boundary | 1 | `args.length < 2` -> `<= 2` reclassifies every two-argument call |
| statement-removal | 9 | every one empties a result the suite asserts on |
| regex-quantifier-bound | 0 | declared; reaches no construct in this file |

Three statement-removal mutants spot-checked rather than assumed:

```
baseline                       49 passed
L92  visit(...) removed        30 failed
L96  forEachChild removed      30 failed
L168 n++ removed               2 failed
```

## What a 31/31 would and would not mean

It would mean the suite pins every construct the six declared operators can express IN CODE THAT
EXISTS. It would NOT mean the guard is complete: this repo has measured a 1.00 score alongside two
escapes the operator set could not express at all. The claim to make in the diff brief is the
score plus the operator set it ranges over, never "the guard is complete".

Two asymmetries worth carrying into the ledger if any of this is wrong:

- One kill is by CRASH, not assertion — `line 60`'s `&&` -> `||` reads `callee.name` off a node
  that is not a property access and throws during collection. It counts, and it is weaker
  evidence than an assertion-kill.
- `regex-quantifier-bound` contributes 0 mutants. It stays declared so the score demonstrably
  ranges over it; dropping it would leave its (empty) site set unscored and the `OPERATORS:` tail
  would have to say so.

## If the run disagrees

A survivor I did not predict means the static reasoning missed a path, and the ledger row must say
which — not "equivalent" by default. A mutant count other than 31 means `enumerateSites` and the
harness disagree about the surface, which is a bigger finding than any single survivor.
