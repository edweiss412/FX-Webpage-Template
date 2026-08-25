# Plan — replacement-string class sweep

**Spec:** `docs/superpowers/specs/2026-08-24-replacement-string-class-sweep.md`
**Branch:** `fix/replacement-string-class-sweep`
**Base:** `origin/main` at `bcd3d088ec7678347fc35e7127fe851af3afb041` (merged after the spec stage; every derivation below
was re-run on the merged tree and every count is unchanged — 95 commits of `main` added no offenders)

## Meta-test inventory

- **CREATES** the repo-wide structural guard, at the path Task 1's layout block names (it does not
  exist yet, so it is named there rather than cited here). Population walked from disk, so a file
  added under a new top-level directory is covered without editing the suite.
- **EXTENDS** `tests/mutation/source/registry.ts` — one `GuardSurface` row for the scanner.
- **EXTENDS** `tests/mutation/source/expectedLedgerKinds.ts` — the per-surface ledger-kind counts.
  A new surface fails by default until it declares its own, which is the point of the file.
- **EXTENDS** `EXPECTED_ENV_TOUCHING` in `tests/mutation/_metaPremiseContract.test.ts` — keyed by
  deciding-suite path, and asserted key-equal to the suite list, so an undeclared suite reds.
- None of the standing candidate registries applies: no Supabase call boundary, no sentinel
  hiding, no `admin_alerts` catalog row, no advisory-lock topology, no email normalization.
  Declared explicitly rather than left silent.

## Test wiring, verified at plan time

`BASE_INCLUDE = ["tests/**/*.test.ts", "tests/**/*.test.tsx"]` (`vitest.projects.ts:34`), so
the new suite is collected with no config edit — no `testMatch`
entry to add, stated explicitly rather than left as a silence. The scanner module is not `*.test.ts` and is therefore never
collected as a suite, which is what lets it be the mutation target while its sibling suite
decides the verdict. `tests/cross-cutting/codes.test.ts` already runs from this directory, so the
path is not a new one for CI. Checked for exclusions too: the only `tests/cross-cutting/` file
with special handling in `vitest.projects.ts` is `email-canonicalization.test.ts` (SERIAL, and
excluded from the unit-suite job), so both new suites run in the ordinary partition.

## Advisory-lock topology

N/A — the diff touches no `pg_advisory*` path.

## Layout / transition tasks

N/A — no UI surface. The one `components/` file is a copy-building pure function whose repair
wraps a replacement argument (spec R7, and the spec's `not-ui` spec-lint waiver).

## Mutation-family closure set

The six declared operators are the closure this review converges against:
`relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`,
`regex-quantifier-bound`, `statement-removal` (`tests/mutation/source/operators.ts:17`).
A reviewer-proposed seventh family is admissible only with a live escaping mutant against the
shipped guard.

## The work list, derived at plan time

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-conservative.mts
OFFENDERS 56   offender files 32

by node kind:  Identifier 26   PropertyAccessExpression 9   TemplateExpression 9
               CallExpression 6   BinaryExpression 6

$ pnpm exec tsx …/count-capture-cover.mts                        @ 1af34932f
A textual $ at the call site            1   docs/…/support.js:381   "$1" + alias      [EXCEPT(b)]
B same-file const bearing a $           1   lib/observe/scrubSentryEvent.ts:18        [CAPTURE]
! spread: replacement not locatable     0
C unresolved / ambiguous names         13
  $-bearing string consts repo-wide    12
  INTERSECTION                          0   <- the union of A and B is a cover
CAPTURE-PRESERVING SITES: 2   every other offender takes the ordinary wrap: 54
```

The cover mirrors the judge's rules (transparent wrappers, the spread rule, the accept-set) and
reaches 2 + 54 = 56 by a different route than `count-conservative.mts` reaches 56. That agreement
is load-bearing, not decorative: it is the only thing that caught an early draft of the cover
reading 54 after an early `return` skipped a chained call's receiver.

Disposition: **4 excepted** (`docs/**`, spec §6 clause (b)) · **1 capture-preserving**
(`scrubSentryEvent`) · **51 ordinary wraps**.

## Acceptance criteria

Reproduced from the spec so the task markers below resolve against this document. The spec is
canonical; if these ever disagree, the spec wins and this table is the defect.

| ID | Criterion |
| --- | --- |
| AC-1 | `judgeSource` accepts exactly the four node kinds in §3.1 and reports every other second-argument form, with one fixture case per accepted kind and per reported kind. |
| AC-1b | A CHAINED call reports every offender in the chain, not only the outermost: `s.replace(a, v).replace(b, w)` yields two findings, and a three-link chain yields three. The repo-wide assertion additionally reconciles its total against `count-conservative.mts`, so a visitor that stops descending cannot pass by agreeing with itself. **The comparison oracle must resolve wrappers and prefilter exactly as the judge does** — spec round 5 found it doing neither, which made the cross-check vacuous on precisely the axis under review; both now come from one shared module. |
| AC-2 | Transparent wrappers resolve: `("x" as string)`, `("x")`, `(fn!)` and a `satisfies` form each classify as their inner expression. |
| AC-3 | A call with fewer than two arguments and no spread is not-in-population, counted, and never reported. |
| AC-3b | A call with a `SpreadElement` at argument index 0 or 1 is REPORTED, not bucketed as not-in-population — asserted for `s.replace(...args)`, `s.replace(...args, b)` where `b` is an accepted literal, and `s.replace(a, ...rest)`. |
| AC-4 | The population is derived from disk and excludes `node_modules/**` and `docs/**`; a file added under a new top-level directory is scanned without any edit to the scanner. |
| AC-4b | The scanner parses every file in the population, with no text prefilter gating the walk. Asserted structurally — the walk has no source-text gate — and behaviourally, over a fixture set covering all seven spellings §3.2 tabulates (baseline, wrapped callee, space, newline, block comment, line comment, escaped identifier), each of which must be reported. A prefilter reintroduced later fails the behavioural half rather than silently shrinking the population. |
| AC-5 | The repo-wide assertion reports zero offenders at the PR's head. |
| AC-6 | The guard's premise is executable: the suite fails loudly if the walk finds no call sites at all, so a broken walker cannot read as a clean bill. |
| AC-7 | All 52 in-population offenders are repaired; the four `docs/**` sites are outside the population by rule, not by an enumerated exemption. |
| AC-8 | Each of the two live product-path files in §5 carries a behavioural test proving a `$`-bearing input now round-trips literally, in the `$'`, `$&` and `` $` `` spellings. `lib/parser/personalization.ts` is deliberately excluded: its replacement is a four-value closed vocabulary, so no input can exercise the claim and a test there would assert on a fixture the function cannot receive. |
| AC-8b | `scrubSentryEvent` keeps its `$1` capture semantics through the repair: a test asserts a scrubbed `/show/<slug>/<token>` URL still carries the slug, and fails against the blind-wrap form. |
| AC-9 | The scanner is enrolled in `tests/mutation/source/registry.ts` with a score at or above its floor and an empty unaccepted-survivor set. |

<!-- tasks: depth=2 red-contract -->

**On the `-t` filters below.** Several tasks scope their `red=` with `-t` so that the red-then-green
cycle can complete on the SAME command: without it, Tasks 2, 3 and 7 would share one whole-suite
command that stays red until Task 8 lands, and no task would ever observe its own green.
`spec:lint` advises on `-t` for a good reason — a filter matching nothing exits 0 and reports
green from the moment it is written — so every GREEN step here confirms vitest reported a NON-ZERO
test count for the filter before the green is accepted. A filter that matched nothing is a failed
step, not a pass.

## Task 1 — `judgeSource` and the accept-set

<!-- task: red=`pnpm vitest run tests/cross-cutting/replacementString.test.ts` red-state=authored red-target=`tests/cross-cutting/replacementString/scan.ts` why=`the scanner module does not exist, so the suite cannot collect and no accept-set case runs` ac=AC-1,AC-1b,AC-2,AC-3,AC-3b -->

**Files** (fenced: two do not exist yet, and a citation to an absent file is a hard failure):

```
tests/cross-cutting/replacementString/scan.ts   (new)
tests/cross-cutting/replacementString.test.ts   (new)
tests/_shared/outerExpressions.ts               (reused: skipTransparent)
```

The first two do not exist yet, so they are named as a layout above rather than cited — a
citation to an absent file is a hard `spec:lint` failure, correctly.

`judgeSource(filePath, source)` is a pure function of a source STRING. The disk walk is a
separate export (Task 2). §7 of the spec explains why the split decides whether mutants can be
killed at all.

Classification order, exactly as spec §3.1 states it, and validated as a prototype before this
plan was written — all sixteen cases below were RUN:

```
accepted           s.replace(a, "lit")                          StringLiteral
accepted           s.replace(a, `notmpl`)                       FirstTemplateToken
accepted           s.replace(a, () => v)                        ArrowFunction
accepted           s.replace(a, function (m) { return v })      FunctionExpression
reported           s.replace(a, v)                              Identifier
reported           s.replace(a, o.p)                            PropertyAccessExpression
reported           s.replace(a, `x${v}`)                        TemplateExpression
reported           s.replace(a, f())                            CallExpression
reported           s.replace(a, "x" + v)                        BinaryExpression
accepted           s.replace(a, ("lit" as string))              StringLiteral
accepted           s.replace(a, ("lit"))                        StringLiteral
accepted           s.replace(a, ("lit" satisfies string))       StringLiteral
reported           s.replace(...[find, repl])                   spread at index <=1
reported           s.replace(...args, "lit")                    spread at index <=1
reported           s.replace(a, ...rest)                        spread at index <=1
not-in-population  s.replace(a)                                 no replacement position
```

Two notes for the implementer. `` `notmpl` `` prints as `FirstTemplateToken` in a debug dump —
that is TypeScript aliasing the same numeric SyntaxKind as `NoSubstitutionTemplateLiteral`, and
`ts.isNoSubstitutionTemplateLiteral` accepts it correctly. And `s.replace(...args, "lit")` is the
case worth staring at: index 1 holds an accepted literal that is NOT the argument the call uses,
so a judge that checks `arguments[1]` before checking for a spread accepts on false evidence.

**Anti-tautology.** Each case asserts the verdict for its OWN input. A single total over a mixed
fixture passes while two verdicts swap places.

**AC-1b's fixture half lands here**, its reconciliation half in Task 4: a chained
`s.replace(a, v).replace(b, w)` yields TWO findings and a three-link chain yields three. Without
it, a visitor that stops descending after classifying a call passes every other case in this task
— measured, a return-after-any-match variant of the shipped classifier reports 44 of 56.

## Task 2 — the population, derived from disk

<!-- task: red=`pnpm vitest run tests/cross-cutting/replacementString.test.ts -t population` red-state=authored red-target=`tests/cross-cutting/replacementString/scan.ts` why=`the walk export does not exist, so the subtraction cannot be exercised` ac=AC-4,AC-4b -->

Every tracked file matching `\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$`, MINUS `node_modules/**` and
`docs/**`. Stated as a subtraction so a new top-level directory is covered by default.

**Failure mode this catches:** someone rewrites the walk as an allowlist of known directories,
and a new directory is then silently unscanned. The case feeds a synthetic path under a
directory name that appears nowhere in the repo and asserts it is IN the population.

**AC-4b lands here too: there is no text prefilter, and the task proves it both ways.**
Structurally, the walk has no source-text gate. Behaviourally, a fixture set covers all seven
spellings spec §3.2 tabulates — baseline, wrapped callee, space after the dot, newline, block
comment, line comment, escaped identifier — and each must be reported.
`count-trivia-spellings.mts` is the committed derivation over the same seven, so suite and probe
agree by construction. A prefilter reintroduced later fails the behavioural half rather than
silently shrinking the population.

The judge reports the EXCLUDED population's site count on every run, so the exclusion cannot
grow in silence.

## Task 3 — the guard states its premise executably

<!-- task: red=`pnpm vitest run tests/cross-cutting/replacementString.test.ts -t premise` red-state=authored red-target=`tests/cross-cutting/replacementString/scan.ts` why=`the walk has no premise guarding it, so stubbing it to return [] yields zero offenders and the repo-wide assertion passes for the wrong reason` ac=AC-6 -->

`premise(description, actual, mustExceed)` from `tests/_shared/premise.ts:26`, placed
unconditionally relative to what it guards and never inside a `.each` callback, whose case count
can be zero.

The condition: the walk found call sites at all. A broken walker returning `[]` produces zero
offenders and an assertion that passes for the wrong reason — the exact shape the premise
contract exists for. The premise asserts a floor far below the live population, because it
guards against `0` rather than pinning today's number, which §2 explains is not a number this
corpus can hold still.

**Observing the red requires a planted defect**, since a correct walk makes the premise pass the
moment it is written. The RED step stubs the walk to return `[]`, confirms BOTH that the premise
fails and that the repo-wide assertion would otherwise have passed, then reverts. Recorded in the
commit. Without that pairing the task proves the premise runs, not that it discriminates.

## Task 4 — the repo-wide assertion, observed red at 52

<!-- task: red=`pnpm vitest run tests/cross-cutting/replacementString.test.ts -t repo-wide` red-state=authored red-target=`lib/sync/feed/shapeHoldEntry.ts:29` why=`52 in-population offenders are unrepaired at this point, so the assertion names them and fails` ac=AC-5,AC-1b -->

This RED is the point of the task, not an obstacle to it: the assertion must be seen naming 52
sites before any repair lands, or Tasks 5-8 are unverifiable. The failure output IS the work
list.

Renders findings as `file:line  text` and asserts the list is empty.

**AC-1b's reconciliation half lands here:** the assertion's total is compared against
`count-conservative.mts`, so a visitor that stops descending cannot pass by agreeing with itself.
That oracle resolves wrappers and parses every file exactly as the judge does — both come from
`_shared.mts` — which is what makes the comparison meaningful rather than circular. Spec round 5
found the oracle sharing a defect with the judge and the cross-check therefore vacuous on the very
axis under review.

## Task 5 — `scrubSentryEvent`, the capture-preserving repair

<!-- task: red=`pnpm vitest run tests/observe/scrubSentryEvent.test.ts` red-state=authored red-target=`lib/observe/scrubSentryEvent.ts:18` why=`no test pins the $1 capture, so the blind wrap this sweep would otherwise apply silently drops the slug` ac=AC-8b -->

**Current behaviour is CORRECT.** A characterization test therefore passes the moment it is
written and proves nothing on its own, so this task carries the mutants that give it
discriminating power. All four run and recorded in the commit message:

```
(a) blind wrap  value.replace(RE, () => TOKEN_PLACEHOLDER)   -> MUST go red (literal $1, slug gone)
(b) placeholder emptied                                       -> MUST go red
(c) capture index changed  $1 -> $2                           -> MUST go red
(d) URL fixture varied to one with no slug segment            -> assertion must still discriminate
```

Then the repair: ``value.replace(SHOW_TOKEN_RE, (_m, prefix: string) => `${prefix}[shareToken-redacted]`)``.

Mutant (a) is the one that matters — it is precisely the edit the rest of this PR applies 51
times, and this test is the only thing standing between that edit and a redaction regression.

**The fixture needs an executable premise, and this is not hypothetical.** Prototyped at plan
time over ten inputs: the repair is behaviour-identical to current on all ten, including `$` and
`$'` inside the slug that rides the capture. But the blind-wrap mutant is INDISTINGUISHABLE on
two of them — `"no show url here at all"` and `"/show/only-slug/"` — because `SHOW_TOKEN_RE`
never matches, so no substitution happens and every variant returns the input unchanged. A test
whose fixture happened to be either one would pass against the mutant and prove nothing.

So each case asserts, on its OWN input, that a substitution actually occurred (output differs
from input) before asserting what the output is. Not once up front for the suite — per case, per
the premise rule: a premise proven on an adjacent case is not a premise.

```
input     https://fxav.test/show/demo/abc123?s=1
current   https://fxav.test/show/demo/[shareToken-redacted]?s=1
repaired  https://fxav.test/show/demo/[shareToken-redacted]?s=1     <- identical
BLIND     https://fxav.test$1[shareToken-redacted]?s=1              <- what the test must catch
```

## Task 6 — the two live product paths

<!-- task: red=`pnpm vitest run tests/admin/roleRecognizeCopy.test.ts tests/sync/feed/shapeHoldEntry.test.ts` red-state=authored red-target=`components/admin/roleRecognizeCopy.ts:122` why=`the substitution grammar is live, so a $-bearing role token round-trips spliced instead of literal` ac=AC-8 -->

`components/admin/roleRecognizeCopy.ts` (3 sites) and `lib/sync/feed/shapeHoldEntry.ts` (3
sites). The defect is present today; RUN at plan time rather than asserted:

```
scopeLine("A$'B")
  -> "Applies to anyone whose role says A, on this show and every show after.B, on this show
      and every show after."
savedSummary("T$'Z", [])
  -> "People with T now see the standard show page.Z now see <SUMMARY>."
shapeHoldEntry({ entity_key: "Dana$'X", rename }).summary
  -> "Rename pending: Dana → Dana RenamedX → Dana Renamed"
```

The second leaks a raw `<SUMMARY>` marker onto an admin surface, because the splice displaced the
text the NEXT chained `.replace` was going to match. The third destroys the crew member's name in
Doug's feed.

Expected values derive from the fixture's own hostile token; nothing hardcoded.

**Which tokens discriminate is measured, not guessed.** Run at plan time against `scopeLine`:

```
"A$'B"   spliced        "…role says A, on this show and every show after.B, on this show and…"
"X$&Y"   spliced        "…role says X<TOKEN>Y, …"          <- leaks the template's own marker
"P$`Q"   spliced        "…role says PApplies to anyone whose role says Q, …"
"K$$L"   changed        "…role says K$L, …"                <- $$ collapses to one dollar
"M$1N"   ROUND-TRIPS LITERALLY — does NOT discriminate
"plain"  round-trips (control)
```

`$1` is the trap. It is the most obvious hostile token to reach for, and it is the one that
proves nothing here: the pattern argument is the string `"<TOKEN>"`, so there are no capture
groups, and `$1` with no group 1 is emitted as literal text. A case built on it passes before
the repair and after it. The cases are therefore `$'`, `$&`, `` $` `` and `$$`, with `$1` present
only as a documented non-discriminator and `plain` as the control.

Each case asserts on its OWN input that the pre-repair output differs from the literal token —
the same per-case premise T5 needs, for the same reason.

**Deliberately NOT `lib/parser/personalization.ts`.** Its replacement is
`STAGE_CANONICAL[cand] ?? cand`, and `cand` is always a member of the four-element closed
constant `STAGE_VOCAB` (`lib/parser/personalization.ts:179`, matched at `lib/parser/personalization.ts:229`), so `corrected`
is provably `$`-free and there is no red to observe. A behavioural test there could only pass by
feeding an input the function cannot receive. It moves to Task 7.

### The read-before-wrap rule, which Tasks 7 and 8 both carry

Spec §6 divides the 56 into 2 captures found, 9 vouched `$`-free, and **45 the cover is silent
about**. Silence is not a certificate: a `$` built at runtime — `["$1", "…"].join("")` is the
one-edit shape spec round 3 used — is invisible to a pass that reads declarations, and for a
handful of sites the author may have INTENDED the grammar.

So every silent site is READ before it is wrapped, and the reading is recorded in the commit that
wraps it. Cheap, because the sites are one line each and the reader is already in the file. Not
skippable quietly, because Task 8's commit body lists its sites with a one-phrase note each and a
site with no note is an unfinished repair.

For nearly all 45 the wrap is exactly right — a runtime value reaching a replacement position IS
the defect. The reading is for the few where it is not.

## Task 7 — hygiene wraps in `lib/`

<!-- task: red=`pnpm vitest run tests/cross-cutting/replacementString.test.ts -t repo-wide` red-state=authored red-target=`lib/log/sanitize.ts:6` why=`these sites are still reported by the repo-wide assertion until wrapped` ac=AC-7 -->

`lib/log/sanitize.ts` (1), `lib/test/serialAudit.ts` (3), `lib/parser/personalization.ts` (1).
Four of these five are cover-VOUCHED rather than merely silent — `REDACTED` and the three
sentinels each resolve to a single plain same-file literal — and the fifth,
`personalization.ts`, is settled by the closed-vocabulary argument above rather than by the
cover. Behaviour is provably unchanged here, so no behavioural test attaches. The wrap removes the grammar rather than
fixing a live defect, and the repo-wide assertion is what these are for.

## Task 7b — the authored-edit class: six harnesses, two of which write to disk

<!-- task: red=`pnpm vitest run tests/cross-cutting/authoredEditLiteral.test.ts` red-state=authored red-target=`scripts/intraleg-killer-audit.mjs:767` why=`an authored to is applied as a replacement STRING and written to disk, so a $ sequence in it corrupts the file` ac=AC-8 -->

Surfaced by applying the read-before-wrap rule above to the silent bucket. Its first use returned
one site; sweeping that site's SHAPE returned six.

All six apply an author-written `from` → `to` edit through a replacement string:

| Site | What it does with the result |
| --- | --- |
| `scripts/intraleg-killer-audit.mjs:767` | **`writeFileSync(kill.file, before.replace(kill.from, kill.to))`** |
| `scripts/share-link-flash-adversary-matrix.mjs:876` | **`writeFileSync(p, src.replace(find, replace))`** |
| `tests/mutation/source/surfaceCases.ts:149` | control-liveness assertion |
| `tests/db/connectionCensus.test.ts:1690` | control-liveness assertion, same shape |
| `tests/cross-cutting/pgCronCiVacuity.test.ts:202` | rewrites suite source in memory for a probe |
| `tests/docs/agentsHeavyPhaseRule.test.ts:826` | the `editRule(find, replace)` helper |

The two `writeFileSync` sites are the severe ones: a `$` sequence in an authored `to` does not
mis-score a test, it writes corrupted source to disk — which is precisely the sibling-arc incident
of the same day, a document-rewriting script whose block contained `grep -vE '^docs/|\.md$'`.

**Every one of these validates the PATTERN side and none validates the replacement side.**
`intraleg-killer-audit` refuses on `ANCHOR-NOT-UNIQUE`; `share-link-flash-adversary-matrix`
refuses when the anchor is `AMBIGUOUS (${hits} hits)`; `connectionCensus` asserts
`occurrences).toBe(1)`; `pgCronCiVacuity` throws "suite refactored; update the probe anchors".
Meticulous about anchor uniqueness, unaware the replacement argument is a mini-language. That is
this spec's thesis, demonstrated six times inside the code it repairs.

**The project already guards this class in the sibling harness.**
`tests/mutation/browser/mutate.test.ts:90-99` asserts that `applyEdits` inserts a replacement
containing `` $& $` $' $1 `` verbatim, with the comment "the run would score a mutant nobody
wrote." The browser harness is defended; the source harness has the same hole and no test. The
new test mirrors that one.

One shared behavioural test covers the class, mirroring `mutate.test.ts:90`: an authored `to` of
`` $& $` $' $1 `` applies verbatim. For the two disk-writing scripts the assertion is on the bytes
written; for the four in-memory ones it is on the returned string.

Reachability, checked: no control value in `tests/mutation/source/registry.ts` carries a `$`
sequence today, so the harness sites are latent rather than live. The edit that makes them bite is
ordinary — controls are code snippets and this repo's code contains `"$1[shareToken-redacted]"`,
so enrolling `scrubSentryEvent.ts` as a guard surface would want a control anchored on that line.

## Task 8 — the remaining tooling and test wraps

<!-- task: red=`pnpm vitest run tests/cross-cutting/replacementString.test.ts -t repo-wide` red-state=authored red-target=`tests/docs/agentsHeavyPhaseRule.test.ts:821` why=`34 sites across scripts/ and tests/ remain reported until wrapped` ac=AC-5,AC-7 -->

The balance of the wraps, by file. Derived at plan time, not transcribed:

```
scripts/audit-cn-operand-kinds.mjs                 2     tests/e2e/helpers/walkerRoutes.ts          3
scripts/extract-admin-log-only-codes.ts            1     tests/mutation/_metaSourceShardIntegrity   3
scripts/intraleg-killer-audit.mjs                  1     tests/mutation/source/premiseScan.test.ts  3
scripts/share-link-flash-adversary-matrix.mjs      1     (surfaceCases.ts moved to Task 7b)
tests/admin/needsAttention.test.ts                 1     tests/paneCompaction/driver.test.ts        1
tests/ci/_metaEnvBoundExclusionCoverage.test.ts    1     tests/parser/payloadZeroWidthEnriched      1
tests/codexGuard/fixtures/fake-codex.mjs           1     tests/reviewRounds/row.test.ts             2
tests/cross-cutting/pgCronCiVacuity.test.ts        1     tests/specLint/declaredLimitPins.test.ts   1
tests/cross-cutting/psqlStartupFileSuppression     4     tests/styles/_metaNewTabAnnouncement       1
tests/db/connectionCensus.test.ts                  1     tests/e2e/_pendingDiscardHarness.tsx       2
tests/docs/agentsHeavyPhaseRule.test.ts            7     tests/e2e/helpers/liveEntryToolchain.ts    1
```

Several substitute SOURCE OR DOCUMENT TEXT into a replacement position, which is exactly the
input family where a `$` sequence arrives by accident rather than by malice. The largest single
file, `tests/docs/agentsHeavyPhaseRule.test.ts` with 7 sites, substitutes AGENTS.md prose into
mutated copies of itself — `text.replace(rule, edit(rule))`, `LIVE.replace(rule!, rule! + sibling)`.

Checked, so the claim is bounded rather than alarming: AGENTS.md carries **zero** `$` substitution
sequences today (`grep -oE '\$(&|\`|'"'"'|[0-9]|<[A-Za-z_][A-Za-z0-9_]*>|\$)' AGENTS.md` returns
nothing), so these sites are latent, not live, and the wrap is hygiene. What makes them worth the
line: AGENTS.md is dense with shell snippets, and the sibling-arc incident this same day was a
document-rewriting script substituting a block containing `grep -vE '^docs/|\.md$'` — a pattern
ending in exactly the `$'` that splices. One ordinary edit to AGENTS.md puts that sequence in
these tests' input.

## Task 9 — registry enrolment and the score

<!-- task: red=`pnpm heavy pnpm mutation:guards` red-state=authored red-target=`tests/mutation/source/registry.ts:151` why=`the scanner is not enrolled, so no mutant is generated for it and the gate says nothing about this surface` ac=AC-9 -->

**Enrollment is three files, not one.** The registry row alone reds two gates: `pnpm
mutation:guards` fails ledger-key parity, and the close-out full suite fails deciding-suite
parity. Measured at plan time — registry 42 rows against expected 42, suites 79 against expected
79, both currently equal and both unequal under a hypothetical registry-only enrollment:

```
registryCount: 42   expectedCount: 42   currentEqual: true   registryOnlyEqual: FALSE
suiteCount:    79   expectedCount: 79   currentEqual: true   enrollmentEqual:   FALSE
```

1. `tests/mutation/source/registry.ts` — the `GuardSurface` row.
2. `tests/mutation/source/expectedLedgerKinds.ts` — per-surface ledger-kind counts, declared
   independently of the surface's own ledger precisely so counting a list against itself cannot
   pass. MEASURE them from a first run; do not guess.
3. `EXPECTED_ENV_TOUCHING` in `tests/mutation/_metaPremiseContract.test.ts` — keyed by deciding
   suite, asserted key-equal to the suite list.

The row itself (`tests/mutation/source/registry.ts:151` is the array it joins): `sourcePath` the scanner module,
`suitePaths` the fixture suite, `operators` the closure set below, a `scoreFloor`, and a `control`
edit the suite must notice.

Closure set, the six declared operators (`tests/mutation/source/operators.ts:17`):
`relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`,
`regex-quantifier-bound`, `statement-removal`. A reviewer-proposed seventh family is admissible
only with a live escaping mutant against the shipped guard.

`control` must be a real behaviour change the suite catches — it exists to prove the overlay
applied at all, since a silently-failed overlay reports a PERFECT score with every mutant run
against clean source. Two constraints the registry validates statically
(`tests/mutation/source/registry.ts`): `control.from` must occur in `sourcePath` **exactly
once**, because an ambiguous anchor makes the control's target unknowable, and `from` and `to`
must differ.

Candidate anchors, in preference order, each unique in the module and each caught by a fixture
case rather than by the repo-wide assertion:

1. Drop `ts.isArrowFunction(arg) ||` from the accept-set. An accepted-kind fixture then reports,
   and AC-1's arrow case fails. Unique, one clause, unambiguous.
2. Flip the spread guard's `=== 0` to `=== 2`. AC-3b's `s.replace(...[a, b])` case then falls
   through to the not-in-population bucket and fails.

Prefer (1): it kills on a case whose expected verdict is ACCEPTED, so it also proves the suite
tests both directions rather than only that reported things get reported. Do NOT anchor the
control on the callee-name check (`"replace"` to something else) — that makes the judge match
nothing, which the repo-wide assertion reads as zero offenders and PASSES.

Run `pnpm heavy pnpm mutation:guards` BEFORE the first diff dispatch — it spawns a real
child per mutant and is a MUST-wrap phase under the machine-wide slot semaphore.

**Budget the wall clock: the machine-wide heavy semaphore is at ONE slot.** A full
`mutation:guards` run queues behind every other heavy phase on the box, so this task is scheduled
as a single wrapped run rather than an iterate-and-rerun loop. Get the registry row, the ledger
kinds and the env-touching entry right BEFORE the first run — a red on any of the three costs a
whole queue position, and the ledger-kind counts have to come from a run that completed.

**Run the FULL four-shard set, never a scoped shard, and re-derive after any merge.** The shard
partition weighs mutant counts, so enrolling this scanner reshuffles all four shards, and so does
merging `main` — a measured merge on a sibling arc turned one shard's membership over by five
surfaces. Surface-inertness and partition-membership are different claims: a scoped run against a
shard number derived before the merge banks a green that measured nothing. `pnpm mutation:guards`
already runs shards 0-3 plus the gates, so the full invocation is immune by construction; this
note exists so nobody optimizes it into a single-shard run to save wall clock. This arc merges
`main` before its first diff dispatch, so the score is taken on the merged tree, once. The score, the
empty unaccepted-survivor set, and the `OPERATORS:` tail go on the round-1 diff brief's
`GUARD SURFACE:` line — the wrapper exits 2 if any element is missing.

<!-- tasks: end -->

## Close-out (not a task: no red-then-green cycle of its own)

Every acceptance criterion is already claimed by Tasks 1-9; this step runs the gates and carries
no `red=` because it has no failing state to observe that some task above has not already
observed.

Repo-wide assertion green at zero. Full suite as `pnpm heavy pnpm test`. `pnpm typecheck`,
`pnpm exec eslint .`, `pnpm format:check`, `pnpm spec:lint` on spec and plan. Corpus rows
committed with the arc, and a round-economy filing for any stage that reached four counted
rounds.

## Sweeps authored AND run at plan time

Every number here is produced by a command RUN while writing this plan, not transcribed. The
commands, so a reviewer re-runs rather than re-reads:

```
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-conservative.mts --list
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-capture-cover.mts
$ pnpm exec tsx docs/superpowers/specs/ci/probes/2026-08-24-replacement-string-count/count-unclassifiable-shapes.mts
```

**Every offender is claimed by exactly one task.** The tasks slice the population by REPAIR SHAPE;
spec §5 slices the same 56 by REACHABILITY. Both sum to 52 in-population, and neither is derived
from the other, so they are a cross-check rather than a restatement:

| Task | Sites | Files |
| --- | --- | --- |
| T5 capture-preserving | 1 | `lib/observe/scrubSentryEvent.ts` |
| T6 live product paths | 6 | `components/admin/roleRecognizeCopy.ts` (3), `lib/sync/feed/shapeHoldEntry.ts` (3) |
| T7 hygiene wraps in `lib/` | 5 | `lib/log/sanitize.ts` (1), `lib/test/serialAudit.ts` (3), `lib/parser/personalization.ts` (1) |
| T7b the authored-edit class | 6 | 2 in `scripts/`, 4 in `tests/` |
| T8 tooling and tests | 34 | `scripts/` (3), `tests/` (31) |
| **In population** | **52** | **28** |
| Excepted, `docs/**` | 4 | 4 |
| **Total** | **56** | **32** |

Cross-checked against the by-directory derivation, which was computed independently of the task
split: `tests` 35, `lib` 9, `scripts` 5, `docs` 4, `components` 3. The `lib` column reconciles as
1 (T5) + 3 (T6) + 5 (T7) = 9. ✓

**Registry reconciliation.** One `GuardSurface` row added, none removed or edited, PLUS the two
companion declarations §Task 9 names. Task 9 asserts the array length before and after rather than
describing the change.

**AC-claim reconciliation, derived rather than asserted.** Plan review round 1 found AC-1b and
AC-4b declared but claimed by no task, while this section said every criterion was claimed — the
reconciliation was prose, so it could be wrong. It is now a command:

```
$ python3 - <<'EOF'
import re, pathlib
t = pathlib.Path("docs/superpowers/plans/2026-08-24-replacement-string-class-sweep.md").read_text()
declared = re.findall(r'^\| (AC-[\w.-]+) \|', t, flags=re.M)
claimed = {a for m in re.findall(r'ac=([\w.,-]+)', t) for a in m.split(",")}
print("unclaimed:", [a for a in declared if a not in claimed] or "NONE")
EOF
declared 13 | unclaimed: NONE
```
