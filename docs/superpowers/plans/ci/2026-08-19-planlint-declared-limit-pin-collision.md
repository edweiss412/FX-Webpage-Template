# Plan — spec:lint declared-limit pin collision arm

Spec: `docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md` (canonical; its §
numbers are the authority for every claim below). Ledger: `BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION`.

## Goal

One new `spec:lint` arm over plan-kind documents. For each guard surface enrolled in
`tests/mutation/source/registry.ts` that a plan's `**Files:**` block names, report — as an advisory —
each declared-limit pin in that surface's `suitePaths` whose title the plan does not name.

## Architecture (spec §4)

```
scripts/spec-lint.ts                # adapter: GUARD_SURFACES -> injected table; PREPARES suite text
lib/specLint/declaredLimitPins.ts   # NEW, pure: pin grammar, Files-block extent, obligation, findings
lib/specLint/run.ts                 # threads the injected table core-ward, plan-kind only
lib/specLint/types.ts               # EnrolledSurface (id, sourcePath, suitePaths)
tests/specLint/declaredLimitPinDispositions.ts   # NEW: per-instance NOT_A_PIN rows
tests/_shared/stripComments.ts      # REUSED, unmodified: the single-source comment stripper
```

## Global constraints

- **TDD per task** (invariant 1): failing test → minimal implementation → passing test → commit. Never
  implementation before the test that exercises it.
- **Every rule names the strictly WEAKER implementation its fixtures must kill** (spec §6 table). Run
  as ONE exhaustive pass over all rules, never per finding — three instances in two rounds is the
  same-vector trigger and the answer is a derived cover, not another round. Distinct from the
  anti-tautology rule and both apply: anti-tautology asks whether a test can fail at all; this asks
  whether it can fail for the RIGHT REASON.
- **A RED is confirmed by its REASON, not by its exit code.** Every task's red step reads the failure
  OUTPUT and matches it to the defect the task claims. This is stricter than "run the command", and the
  difference is the whole point: a command that collects nothing exits 0 and is green from birth, while
  a command that fails on an UNRESOLVED IMPORT exits non-zero and looks healthy to every did-it-fail
  check there is — yet proves nothing about the assertion. `docs/agents/writing-plans.md` already rules
  such a red invalid by construction ("an import that does not resolve … goes green when the test file
  changes, not when the implementation lands").
- **Consequently every task that CREATES a module creates it as a STUB first**, exported and typed but
  returning an empty result, so the suite's cases fail on the ASSERTION rather than on module
  resolution. The stub is the defect the `red-target=` names; it is not the implementation, and the
  failing case still precedes the behavior.
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- **Purity.** Every function in `lib/specLint/declaredLimitPins.ts` is a pure map from
  `(model, surfaces, suite texts)` to findings. All I/O stays in `scripts/spec-lint.ts` and in the
  existing `FileResolver`. `tests/specLint/_metaPureCore.test.ts` walks the core tree recursively, so
  the new file is covered by default.
- **No `parse.ts` change**, no new `Check` union member, no `CHECK_ORDER` change (spec §1.1 item 7).
- **Narrowing, never predicate growth.** Under same-axis recurrence the repair direction is to decline
  and file the documented limit in spec §8 (spec §1.1 item 3).
- **Advisory severity only.** Every finding this arm emits carries `severity: "advisory"`.
- **Every count below was produced by the command printed beside it, at authoring time, in this
  session.** A prompt-looking string next to a number that was not run is worse than no citation.
- **Commit per task**, conventional-commits style, `--no-verify` in this worktree.
- No DB, no advisory locks, no UI surface. `impeccable-gate: N/A — no UI surface` (Closeout).

## Meta-test inventory (mandatory declaration)

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- **CREATES** `tests/specLint/_metaDeclaredLimitPins.test.ts` — the derived cover over the disposition
  registry (spec §5). Walks enrolled `suitePaths` from disk, so a new suite file is covered by default.
- **EXTENDS** `tests/mutation/source/registry.ts` (one row, `declaredLimitPins`) and
  `tests/mutation/source/expectedLedgerKinds.ts` (its `EXPECTED_LEDGER_KINDS` entry, read by
  `tests/mutation/guardSurfaces.gates.test.ts`). Both declarations, or the corpus gate is red.
- **INHERITS, unchanged** `tests/specLint/_metaPureCore.test.ts` (recursive walk) and
  `tests/mutation/_metaPremiseContract.test.ts` (applies to the new suites once enrolled).
- No other registry applies: no Supabase call boundary, no admin alert, no advisory-lock topology, no
  tile sentinel. Declared explicitly rather than left silent.

## Pre-draft verification pass (run 2026-08-19 onward; see the per-block baselines below)

Every path, symbol and number the tasks name was verified against the tree before drafting. **The
baseline is per block, not one commit:** the structural checks below were run at `4e074d3bc`, where the
corpus held 664 tracked plans; the corpus and shape figures were RE-RUN after this arc merged
`origin/main` and after rounds 1, 3 and 6 changed the rules, and stand at the current tree with 666.
Quoting one baseline for all of them would have been false, which round 6 caught in the spec.

```
$ ls scripts/spec-lint.ts lib/specLint/{run,types,redContract,fixtureContract}.ts
scripts/spec-lint.ts  lib/specLint/run.ts  lib/specLint/types.ts
lib/specLint/redContract.ts  lib/specLint/fixtureContract.ts

$ git ls-files tests/mutation | grep -i 'guardSurface'
tests/mutation/guardSurfaces.gates.test.ts
tests/mutation/guardSurfaces.shard0.test.ts   (…shard1, shard2, shard3)

$ grep -n 'EXPECTED_LEDGER_KINDS' tests/mutation/guardSurfaces.gates.test.ts
11:import { EXPECTED_LEDGER_KINDS } from "./source/expectedLedgerKinds";

$ grep -n 'import' scripts/print-mutation-sites.ts | head -2
24:import { enumerateSites, siteId } from "../tests/mutation/source/operators";
```

The last one is the precedent that lets the ADAPTER import the registry while `lib/` does not.

Corpus and population counts, each from the command shown:

```
$ pnpm tsx .probe/probe1.ts            # imports GUARD_SURFACES
surfaces: 38
distinct suitePaths: 62

$ git ls-files 'docs/superpowers/plans' | grep -c '\.md$'
666

$ pnpm tsx .probe/probe2.ts            # phrase lines vs phrase-in-title
grammar A (any line):   30
grammar B (title only): 12

$ pnpm tsx .probe/verify.ts            # keyword and delimiter distribution
phrase-bearing titles: 12 { describe: 3, test: 3, it: 6 } { '"': 12 } | .each forms: 0

$ pnpm tsx .probe/probe4.ts            # grain: Files declaration vs whole document
closed path set: 100
plans naming an enrolled path ANYWHERE: 65

$ pnpm tsx .probe/probe7.ts            # shape census, fence-aware and no-blank-skip
plans: 666
**Files:** headers (non-fenced): 2567 | header carries a path: 696 (root-file only: 54)
next line opens UNORDERED: 1666 | ORDERED: 19 | neither: 882

$ pnpm tsx .probe/probe9.ts            # the shipped rules (spec 3.1/3.2 as of round 3) over the corpus
live pins 7 | suites carrying >=1 5
plans 666 | naming an enrolled surface: 23 | firing: 3 | advisories: 5
docs/superpowers/plans/2026-07-19-spec-lint.md  (2)
docs/superpowers/plans/2026-08-04-review-round-economy.md  (2)
docs/superpowers/plans/2026-08-09-m-wave-2/plan.md  (1)
```

Spec rounds 1 and 3 moved these rules and the numbers with them. Round 1: the Files declaration now spans the
HEADER LINE's own remainder (696 headers put the paths there, and missing them dropped a real
`interactionTimingScan` advisory), an ORDERED run after the header is DECLINED as unclassifiable, and a
path is matched as a DELIMITED TOKEN rather than a bare substring (a `.bak` sibling contains a live
entry and names a different file). Round 3 then NARROWED twice more, and the counts above are the post-round-3 measurement: suite text is
PREPARED by the adapter (comments blanked by the shared `stripCommentsSafely`, template bodies blanked
from parser ranges) so the core never guesses what is code; and an INLINE Files declaration is complete
on its own line, with no blank-line skipping, which dropped two blank-gap false advisories.

The `.probe/` scripts are scratch, untracked, and are NOT shipped. Task 6 re-expresses probe6 as a
committed corpus test so the numbers stop depending on a scratch file.

Historical replay inputs, verified present:

```
$ git show d4060b8b8^:tests/cross-cutting/psqlStartupFileSuppression.test.ts | grep -n 'KNOWN miss'
4176:  test("a QUOTED backslash path in shell text is a KNOWN miss", () => {

$ git show '32e3fcd60^:docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md' \
    | sed -n '91p;94p'
- Modify: `tests/cross-cutting/psqlStartupFiles/scan.ts` (the backslash branch of
- Test: `tests/cross-cutting/psqlStartupFileSuppression.test.ts`
```

<!-- tasks: depth=3 red-contract -->

### Task 1: Pin discovery grammar

**Files:**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `lib/specLint/declaredLimitPins.ts` (`discoverPins(path, lines, dispositions)`)
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Test: `tests/specLint/declaredLimitPins.test.ts`

<!-- task: red=`pnpm vitest run tests/specLint/declaredLimitPins.test.ts` red-state=authored red-target=`lib/specLint/declaredLimitPins.ts` why=`Step 1 creates discoverPins as an exported STUB returning an empty array, so the suite RESOLVES and every case fails on its ASSERTION rather than on module resolution - an unresolved-import red would exit non-zero while proving nothing (writing-plans RED validity). The accept-set cases (three phrases, test( and it(, double- and single-quoted literals, case-insensitive, escaped quote inside the literal) and the decline cases (describe(, .each, template literal, multi-line literal, phrase in a comment, phrase in the second argument) all then observe zero pins where the case demands one, and the decline cases pass vacuously against the stub until the accept-set lands, which is why the red step reads the per-case output rather than the exit code` ac=AC-1 -->

Implements spec §3.1 items 1-3. Pure over one file's lines; no filesystem, no registry import.

**What is red and why:** `discoverPins` EXISTS as a Step-1 stub returning an empty array, so the suite
resolves and every ACCEPT case fails on its assertion — zero pins where the case demands one, named in
the output. The decline cases pass vacuously against the stub and become meaningful only once the
accept-set lands, which is why the red step reads per-case output rather than the exit code.

The declined shapes are asserted individually, each with its spec §8 item cited in the test body,
because "the arm draws nothing here" is the claim a future widening would quietly break.

**Every decline fixture carries a LIVE PIN alongside the declined shape, and the assertion is the exact
pin SET rather than emptiness** (spec §6). An expect-CLEAN fixture is satisfied by any implementation
that fails to LOOK — a garbage parse, an empty walk, a scanner returning `[]` unconditionally — so on
its own it discriminates almost nothing. With the live pin present, an arm that returns empty fails the
positive half, and the weaker implementation's real signature (falling silent where a finding is owed,
which is the fail-open direction) is caught.

| Declined shape | Spec | Assert |
| --- | --- | --- |
| a test-shaped line inside a MULTI-LINE ordinary string | §3.1 item 3 | no pin |
| a `\\` escape in a title | §3.1 item 2 | decodes to ONE backslash — its own case, since a decoder handling only quote, newline and tab passes every other case here |
| `describe(` title | §2.3 | no pin |
| `test.each(` / `it.each(` | §8 item 3 | no pin |
| template-literal title | §8 item 4 | no pin |
| literal opening and closing on different lines | §8 item 5 | no pin |
| phrase in a `//` or `/* */` comment | §2.2 | no pin |
| phrase in the SECOND argument, not the title | §3.1 item 2 | no pin |

**Decoding is part of this task, not the obligation's.** The pin's title is the DECODED literal content
(spec §3.1 item 2). Task 1 asserts a source-spelled `\"` title yields the decoded string; Task 3 asserts
the obligation compares against it. Splitting the pair across the two tasks would let each pass while
the seam between them stays wrong, so Task 1's assertion names the decoded VALUE explicitly rather than
round-tripping whatever the implementation produced.

One more case, and it is a GRAIN assertion rather than a decline. **It asserts the pin's LINE, not just
the count** (spec §6): an implementation emitting one pin PER TABLE ROW and then deduplicating by title
also yields one, so the count alone cannot separate "one pin, correctly grained" from "six pins,
collapsed". The line must be the enclosing test title's. a test whose BODY tabulates several
declared misses under one phrase-bearing title yields exactly ONE pin, not one per row (spec §8 item
12). The live instance is the six-row table under `each quote-concatenated keyword/operand spelling is a
declared miss`; a concurrent arc enumerating that file BY ZERO counted ten where this arm counts one,
and the test pins which unit ships so the two are never read as a recall gap.

**Fixture neutralization (spec §6):** every DECLINE fixture in this suite uses a title distinct from
every accept fixture in the same file. With a shared title, §3.1 identity plus §3.3 dedup yield one
finding whether the shape was declined or merely deduplicated, so the decline case could not fail.

**Weaker implementation to kill:** the seven live pin titles, hardcoded. It passes the corpus assertion
and every accept case whose title is copied from the corpus. **Therefore no accept-case title in this
suite may appear anywhere in the live corpus** — a hard requirement, checked by grepping each fixture
title against the enrolled suites before the task is called done, not a stylistic preference.

**Anti-tautology.** Each accept case names the concrete failure mode it catches: a matcher anchored to
`test(` alone misses the six live `it(` pins; a case-sensitive matcher misses
`CLOSED (was DOCUMENTED LIMIT)`; a naive double-quote-to-double-quote match misses a title containing an escaped quote. Each
case is exercised with the phrase in a DIFFERENT position within the title (leading, medial, trailing),
so an implementation anchored to one position cannot pass.

- [ ] **Step 1: Create the STUB.** `export function discoverPins(...): Pin[] { return []; }`, typed as
      the real signature. This is the `red-target=` defect, not the implementation.
- [ ] **Step 2: Write the failing suite.** Cases above, plus the empty-file and no-match cases.
- [ ] **Step 3: Observe red AND CONFIRM THE REASON.** Run:
      `pnpm vitest run tests/specLint/declaredLimitPins.test.ts`. Expected: each accept case fails with
      `expected [] to have length 1` or equivalent — an ASSERTION failure naming the missing pin. A
      failure mentioning module resolution, a parse error, or zero collected tests means the red is
      invalid and the task stops until it is fixed. Paste the observed failure lines into the commit.
- [ ] **Step 4: Implement `discoverPins`.** Minimal: line scan, opener match, single-line literal
      extraction, three-phrase test, disposition filter. Returns `{ path, line, title }[]`.
- [ ] **Step 5: Observe green.** Same command, PASS.
- [ ] **Step 6: Commit.**

```bash
git add lib/specLint/declaredLimitPins.ts tests/specLint/declaredLimitPins.test.ts
git commit -m "feat(spec-lint): declared-limit pin grammar - phrase in a single-line test title"
```

### Task 2: Files-declaration span and surface naming

**Files:**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Modify: `lib/specLint/declaredLimitPins.ts` (`namedSurfaces(model, surfaces)`)
- Modify: `lib/specLint/types.ts` (add `EnrolledSurface`)
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Test: `tests/specLint/declaredLimitPinsFiles.test.ts`

<!-- task: red=`pnpm vitest run tests/specLint/declaredLimitPinsFiles.test.ts` red-state=authored red-target=`lib/specLint/declaredLimitPins.ts` why=`Step 1 adds namedSurfaces as an exported STUB returning an empty set, so the suite RESOLVES and each case fails on its ASSERTION rather than on a missing export. The span cases (inline declaration reads its own line only, list declaration ends at the first blank and at the first non-list line, no blank is skipped, a second declaration in one document is read, a **Files:** line inside a fence is inert) and the grain cases (an enrolled path in prose outside every declaration names nothing) then observe an empty set where the case demands a named surface` ac=AC-2 -->

Implements spec §3.2. The enrolled table is a parameter; the module still imports no registry.

**What is red and why:** `namedSurfaces` EXISTS as a Step-1 stub returning an empty set, so the suite
resolves and each naming case fails on its assertion — an empty set where the case demands a surface id.

**Anti-tautology.** The prose-outside-a-block case is the §2.5 measurement made executable: it is the
42-plan false-advisory source (65 whole-document minus 23 Files-grain on the current tree; the spec's dated §2.5 baseline is 63 minus 23), and a whole-document implementation passes every other case in this
suite while failing that one. The unmodeled-verb case (`- Regenerate: \`lib/…\``) is the §2.5 verb
argument made executable: an implementation that accept-lists `Modify`/`Test`/`Create` passes the rest
and fails that one. The inline-header case fails any implementation that scans only the lines BELOW the
header — which is what the round-1 finding caught in the calibration probe itself. The `.bak` case
fails any implementation using `String.prototype.includes` on the raw path.

- [ ] **Step 1: Create the STUB.** `export function namedSurfaces(...): Set<string> { return new Set(); }`,
      typed as the real signature. This is the `red-target=` defect, not the implementation — without it
      the suite fails on a missing export, which `docs/agents/writing-plans.md` rules invalid.
- [ ] **Step 1b: Write the failing suite.** Extent cases, grain cases, fence-inertness, second block,
      indented continuation line, and a path naming three surfaces (the live
      `tests/docs/_metaReviewRoundEconomy.test.ts` shape). Plus the three shapes spec round 1 added,
      each with the live input that motivated it, plus a PREFIXED-path case (`archive/` prepended to a
      live entry) which an implementation checking only the character AFTER the match wrongly reads as
      the enrolled surface: paths INLINE on the header line (the
      `docs/superpowers/plans/2026-08-09-m-wave-2/plan.md` shape, whose missed advisory was the
      finding); an ORDERED run after the header, which is declined so its numbered task steps cannot
      name a surface (spec §8 item 11); and a delimited-token match, where appending `.bak` to a live
      entry must name NOTHING while the entry itself still names its surface (spec §3.2).
- [ ] **Step 2: Observe red AND CONFIRM THE REASON.** Run
      `pnpm vitest run tests/specLint/declaredLimitPinsFiles.test.ts`. Expected: the naming cases fail
      with an empty set against an expected surface id. A module-resolution error, a parse error, or
      zero collected tests means the red is invalid and the task stops.
- [ ] **Step 2a: Fixture neutralization and PAIRING check.** The prose-outside-a-declaration fixture
      carries a real declaration naming a DIFFERENT enrolled surface, asserted NAMED in the same run —
      without it, an implementation that names nothing passes. It must also contain NO
      positive occurrence of the same enrolled path: if that path also sits in a real declaration in the
      fixture plan, §3.2 names the surface anyway and the negative case cannot fail.
- [ ] **Step 2b: Add the SYNTHETIC-SURFACE case.** Weaker implementation to kill: a hardcoded copy of
      the 100 live enrolled paths, which passes every other case in this suite. The case injects a
      surface whose `sourcePath` and `suitePaths` appear nowhere in `tests/mutation/source/registry.ts`
      and asserts `namedSurfaces` returns it. Verified synthetic by grepping the registry for the chosen
      paths at authoring time. **This is the NAMING half only, and it is deliberately not the whole
      proof:** round 3 established that a naming-only assertion is passed by an integration that uses
      the injected table here and then ignores the result downstream. The END-TO-END half — the same
      synthetic surface carrying a pin and drawing `DECLARED_LIMIT_PIN_UNNAMED` — lands in **Task 3**,
      where advisories first exist. Splitting it is not a weakening: asserting an advisory here would
      make Task 2's red unresolvable until Task 3 shipped, so the task could never complete its own
      red-then-green cycle.
- [ ] **Step 3: Implement `namedSurfaces` and the `EnrolledSurface` type.**
- [ ] **Step 4: Observe green.**
- [ ] **Step 5: Commit.**

```bash
git add lib/specLint/declaredLimitPins.ts lib/specLint/types.ts tests/specLint/declaredLimitPinsFiles.test.ts
git commit -m "feat(spec-lint): read enrolled surfaces from a plan's Files declaration, not its prose"
```

### Task 3: The obligation, both finding codes, and the fail-open closure

**Files:**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Modify: `lib/specLint/declaredLimitPins.ts` (`checkDeclaredLimitPins`)
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Test: `tests/specLint/declaredLimitPinsObligation.test.ts`

<!-- task: red=`pnpm vitest run tests/specLint/declaredLimitPinsObligation.test.ts` red-state=authored red-target=`lib/specLint/declaredLimitPins.ts` why=`Step 1 adds checkDeclaredLimitPins as an exported STUB returning no findings, so every case fails on its ASSERTION rather than on a missing export: DECLARED_LIMIT_PIN_UNNAMED expected on an unnamed pin, one finding for a pin reachable through two surfaces, and DECLARED_LIMIT_PIN_SUITE_UNREADABLE on BOTH fail-open channels each observe an empty finding list. The silence cases pass vacuously against the stub, which is why the red step reads per-case output rather than the exit code` ac=AC-3,AC-5 -->

Implements spec §3.3 and §3.4.

**What is red and why:** `checkDeclaredLimitPins` EXISTS as a Step-1 stub returning no findings, so
every positive case fails on its assertion — an empty finding array where a code is expected. The
silence cases pass vacuously against the stub, so the red step reads per-case output, not the exit code.

**The fail-open closure is the point of this task, and it has THREE channels** (spec §3.4). Only one is
visible through `readFileLines`:

1. `readFileLines` returns `null` — unreadable or a symlink.
2. The `suitePath` is absent from `listTrackedFiles()`. The read seam is TRACKING-BLIND: it resolves any
   file on disk, so an untracked suite reads fine and reports "no pins" with nothing saying the tree and
   the index disagree. Its fixture uses a resolver whose read SUCCEEDS and returns real pin-bearing
   text — an implementation resting on `readFileLines` alone passes channel 1 and fails only this.
3. Preparation reports PARSE DIAGNOSTICS. **Task 3 owns the CHANNEL, not the ORDERING**, and it proves
   the channel by INJECTING a parse-failure status: the pure core receives a prepared result and never
   parses anything itself. Whether diagnostics were taken BEFORE or AFTER blanking is a property of the
   ADAPTER and is invisible here, so the unterminated-comment discriminator lives in Task 7b Step 2b,
   against the real preparation function. One fact, one owner — an earlier draft assigned that proof to
   this core suite, to an unreachable CLI fixture and to the in-process case at once, and those three
   cannot all execute.

**All three channels assert the OTHER suite's pins still report.** The parse channel needs this most and
is likeliest to lack it: live surfaces have several suites and the pins are often in the later one —
`reviewRoundCount` names `tests/reviewRounds/count.test.ts` AND `tests/docs/_metaReviewRoundEconomy.test.ts`,
and both of that surface's pins are in the second. An implementation that `return`s from the SURFACE on
a parse failure, while correctly continuing for channels 1 and 2, passes every other fixture here and
silently suppresses a live pin. So the parse fixture pairs an unparseable FIRST suite with a pin-bearing
SECOND and asserts BOTH the advisory and the pin.

**Weaker implementation to kill: an arm that emits the unreadable advisory unconditionally.** It
satisfies all three channel cases, so the discriminating case is the negative one — a healthy suite
(tracked, readable, parseable) draws NO `DECLARED_LIMIT_PIN_SUITE_UNREADABLE`, asserted directly rather
than inferred from other cases passing. **That negative is PAIRED**: the same run must still report that
healthy suite's pins, so an arm that has gone silent everywhere fails it rather than passing by absence
(spec §6).

**Decoding, the other half of Task 1's pair.** A plan naming the DECODED title draws nothing; a plan
naming the SOURCE spelling of the same title draws the advisory. Either assertion alone is satisfiable
by an implementation carrying the raw capture end to end. The pair names exactly ONE of the two
spellings in the plan — naming both silences both and proves nothing. A decoded NEWLINE title named
across two plan lines and a decoded TAB title named within one line each draw nothing (spec §8 item 13);
both fail a per-line obligation matcher, which is the implementation they exist to reject.

**Two pins on ONE surface, at the SAME anchor.** Every pin of a surface anchors at that surface's Files-
declaration line, so an anchor-position dedup — which no rule mandates and any implementer will reach
for — collapses them. This case asserts BOTH findings appear from one surface with two unnamed pins.
The dedup-partner case below uses two SURFACES and leaves this untested, and the corpus case catches it
only after the collapse has shipped.

**The synthetic surface's END-TO-END case lives here** (Task 2 owns the naming half). The same
synthetic surface — paths absent from `tests/mutation/source/registry.ts` — carries a pin and must draw
`DECLARED_LIMIT_PIN_UNNAMED` through `checkDeclaredLimitPins`. An integration that consults the injected
table when NAMING and then ignores or replaces that result downstream passes Task 2 and fails only here,
and Tasks 5 and 7b cannot catch it because they exercise only REAL enrolled surfaces.

**Fixture neutralization (spec §6): the dedup case needs a partner.** "One pin reachable through two
surfaces draws ONE finding" is ALSO satisfied by an implementation that ignores surfaces entirely and
reports per pin. Pair it with a TWO-DIFFERENT-PINS-on-two-surfaces case expecting TWO findings; only an
implementation that tracks surfaces AND deduplicates passes both.

**Anti-tautology.** The title-substring case is about TITLE matching, which stays a verbatim substring
test (spec §8 item 7) — PATH matching has been a delimited-token test since round 1 and the two must not
be conflated. It constructs a pin whose title is a proper substring of a longer title present in the
plan and asserts the longer title's presence does NOT satisfy the shorter pin unless it literally
contains it. Severity is asserted over EVERY emitted finding, not sampled.

- [ ] **Step 1: Create the STUB** (`checkDeclaredLimitPins` returning `[]`), then write the failing suite.
- [ ] **Step 2: Observe red AND CONFIRM THE REASON.** Run
      `pnpm vitest run tests/specLint/declaredLimitPinsObligation.test.ts`. Expected: each positive case
      fails with an empty finding array against an expected code. Anything else invalidates the red.
- [ ] **Step 3: Implement `checkDeclaredLimitPins`.**
- [ ] **Step 4: Observe green.**
- [ ] **Step 5: Commit.**

```bash
git add lib/specLint/declaredLimitPins.ts tests/specLint/declaredLimitPinsObligation.test.ts
git commit -m "feat(spec-lint): advise on unnamed declared-limit pins; report an unreadable suite"
```

### Task 4: Disposition registry and its derived cover

**Files:**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `tests/specLint/declaredLimitPinDispositions.ts` (`NOT_A_PIN`, two rows)
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `tests/specLint/_metaDeclaredLimitPins.test.ts`

<!-- task: red=`pnpm vitest run tests/specLint/_metaDeclaredLimitPins.test.ts` red-state=authored red-target=`tests/specLint/declaredLimitPinDispositions.ts` why=`Step 1 creates the registry as an exported EMPTY array, so the meta-test resolves and fails on a TARGETED assertion rather than on a census: spec 2.4 names two titles that narrate a CLOSED limit, and the suite asserts neither appears in the pin set. With an empty registry both DO appear, by name, in the failure output. The derived census cannot supply this red - with no dispositions both its sides hold the same nine titles and it is green - which is why the red is the two named closures and the census rides along as characterization` ac=AC-7 -->

Implements spec §5. The registry lives under `tests/` because it is test-facing data, and the core
receives it as a parameter — `lib/` still imports nothing from `tests/`.

**What is red and why:** the registry EXISTS as a Step-1 stub exporting an EMPTY array, so the meta-test
resolves and fails on its targeted assertion — spec §2.4's two closure titles are asserted absent from
the pin set and both appear, by name, in the failure output.

The four cover assertions (spec §5): no stale row; no empty reason; the census is DERIVED by running
the shipped scanner over the enrolled suites rather than typed as a literal; both directions — a
constructed phrase-bearing title becomes a pin, a constructed dispositioned one does not, and a
disposition keyed at one path does not suppress the same title at another path.

**Anti-tautology.** The census assertion compares SETS of `(path, title)`, never a count: a count
passes on a different seven. It reads the expected side from the scanner and the disposition registry —
the two shipped artifacts — so drift cannot relocate into the test. The stale-row case is exercised by
constructing a disposition for a title that is not on disk and asserting the check FAILS, then removing
it: a check that cannot fail is not a check.

- [ ] **Step 1: Create the registry as an exported EMPTY array**, then write the failing meta-test.
- [ ] **Step 2: Observe red AND CONFIRM THE REASON.** Run
      `pnpm vitest run tests/specLint/_metaDeclaredLimitPins.test.ts`. Expected: the two §2.4 closure
      titles are asserted absent from the pin set and BOTH appear, named in the failure output. A
      failure of any other shape — import, parse, zero collected — invalidates the red.
      **The derived census is NOT the red and must not be read as one:** with an empty registry its two
      sides hold the same nine titles and it passes. It is characterization that becomes meaningful once
      Step 3 lands, and the suite says so in a comment beside it.
- [ ] **Step 3: Fill the registry with the two spec §2.4 rows and their reasons.**
- [ ] **Step 4: Observe green**, and record the live census in the commit message.
- [ ] **Step 5: Commit.**

```bash
git add tests/specLint/declaredLimitPinDispositions.ts tests/specLint/_metaDeclaredLimitPins.test.ts
git commit -m "test(spec-lint): disposition registry for closed-limit titles, with a derived cover"
```

### Task 5: Wiring — `run.ts` threading and adapter injection

**Files:**

- Modify: `lib/specLint/run.ts` (accept and thread the injected table; plan-kind only)
- Modify: `scripts/spec-lint.ts` (import `GUARD_SURFACES`, project it, pass it)
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Test: `tests/specLint/declaredLimitPinsWiring.test.ts`

<!-- task: red=`pnpm vitest run tests/specLint/declaredLimitPinsWiring.test.ts` red-state=authored red-target=`lib/specLint/run.ts:90` why=`runLint takes no surfaces parameter and never calls checkDeclaredLimitPins, so a plan-kind document naming an enrolled surface with an unnamed pin lints with zero DECLARED_LIMIT_PIN_UNNAMED findings; the wiring suite asserts that finding appears for a plan, that a spec-kind document draws none, and that a null table draws none` ac=AC-3,AC-8 -->

**What is red and why:** `runLint` has no `surfaces` parameter and never calls the arm. Verified on the
live tree: `lib/specLint/run.ts` threads `exec`, `parse`, `probes` and `fixtures`, and nothing else.

**Anti-tautology.** The null-table case is what stops the arm becoming mandatory for every existing
caller; asserting only the positive case would let an implementation that hard-imports the registry
into `lib/` pass. The purity meta-test is re-run in this task's green step for the same reason.

- [ ] **Step 1: Write the failing suite.**
- [ ] **Step 2: Observe red AND CONFIRM THE REASON.** Run
      `pnpm vitest run tests/specLint/declaredLimitPinsWiring.test.ts`. Expected: the plan-kind case
      fails with zero `DECLARED_LIMIT_PIN_UNNAMED` findings against one expected — `runLint` never
      calls the arm. A type error at the new parameter is ALSO an invalid red: fix the signature first.
- [ ] **Step 3: Thread the table through `runLint` and project `GUARD_SURFACES` in the adapter.**
      **INJECTION ONLY — no preparation of any kind.** Task 5 ends with the adapter passing RAW suite
      lines and a correctly injected table. Preparation is Task 7b's to implement, and wiring it here
      would make that task's authored red green the moment it is written, which is the per-task
      red-first violation this ordering exists to prevent.
- [ ] **Step 4: Observe green**, then re-run the invariant checks this diff already passed:
      `pnpm vitest run tests/specLint/_metaPureCore.test.ts` and `pnpm typecheck`.
- [ ] **Step 5: Commit.**

```bash
git add lib/specLint/run.ts scripts/spec-lint.ts tests/specLint/declaredLimitPinsWiring.test.ts
git commit -m "feat(spec-lint): thread the enrolled-surface table core-ward from the adapter"
```

<!-- tasks: end -->

### Task 6: Historical re-enactment and corpus regression  (outside the red-contract region)

**Files:**

- Create: `tests/specLint/__fixtures__/declaredLimitPins/` (three committed blobs)
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `tests/specLint/declaredLimitPinsCorpus.test.ts`

**NOT in the red-contract region, and disclosed rather than faked.** By this point Tasks 1-5 have
implemented the whole core, so a correct implementation makes this suite green the moment it is
authored: there is no deliberately defective surface left for it to observe. Measured, not assumed —
the live corpus yields the SAME seven pins prepared or unprepared, because no enrolled suite currently
holds a test-shaped line inside a comment, template or multi-line string. This task is therefore
CHARACTERIZATION, not a TDD cycle, and a `red-state=authored` marker here would assert a red that
cannot fire. That is precisely the silent under-coverage
`BL-SPECLINT-RED-TARGET-CANNOT-NAME-A-REPO-ROOT-SURFACE` records, so it is stated instead.

Its value is regression, and that is real: it pins the §2.7 replay and the §2.6 SET so a later change
to any rule must restate them deliberately.

Implements spec §2.6 and §2.7. The fixtures are extracted once, at implementation time, with the
commands the spec §2.7 table names, and committed — so the replay does not depend on those blobs
staying reachable.

```bash
mkdir -p tests/specLint/__fixtures__/declaredLimitPins
git show d4060b8b8^:tests/cross-cutting/psqlStartupFileSuppression.test.ts \
  > tests/specLint/__fixtures__/declaredLimitPins/suite-pre-repair.txt
git show '32e3fcd60^:docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md' \
  > tests/specLint/__fixtures__/declaredLimitPins/plan-pre-step3b.md
git show 32e3fcd60:docs/superpowers/plans/2026-08-17-shell-binding-mixed-quoted-value.md \
  > tests/specLint/__fixtures__/declaredLimitPins/plan-post-step3b.md
```

The suite blob is committed as `.txt`, not `.ts`: it is DATA read as lines, and a `.ts` extension would
put a second copy of a 5000-line suite into typecheck and collection.

**Anti-tautology.** The replay asserts BOTH directions from one pair of inputs that differ only by the
repair, so an arm that always fires and an arm that never fires each fail one direction. The corpus case
ENUMERATES the corpus at run time and asserts the SET of `(plan, suitePath, title)` — never a count, and
never a cardinality typed into the test. Two reasons, both measured on this arc: a count passes on a
different set of the same size, and the corpus grew between drafting and review, which would have
stranded any hard-coded total. The expected set is spec §2.6's — **three plans, five advisories** at the
§2 baseline — read from the spec rather than retyped here, since two copies drift.

**Premise.** The corpus case states executably that the enumerated plan corpus is non-empty and that at
least one enrolled surface carries at least one pin, using `tests/_shared/premise.ts`, in ONE test over
a literal array and never inside a `.each` callback. Without it, a run in a checkout where the glob
returns nothing asserts an empty set against an empty set and reports PASS.

- [ ] **Step 1: Extract the three fixtures** with the commands above.
- [ ] **Step 2: Write the suite** (replay both directions; corpus set; premise). It is expected to pass
      on first run — that is what characterization means here, and asserting otherwise would be the
      impossible red this task's header declines.
- [ ] **Step 3: RUN it and RECORD the observed values** in the commit: the replay's one-then-zero, and
      the corpus SET. If either differs from spec §2.6, that is a REAL DEFECT in Tasks 1-5 and the task
      stops until it is understood — a difference here is the only signal this task can give, and it
      must never be absorbed by adjusting the expectation.
- [ ] **Step 4: If a corpus difference IS a grammar gap**, repair it by NARROWING plus a spec §8 entry,
      never by widening the predicate.
- [ ] **Step 5: Commit.**

```bash
git add tests/specLint/__fixtures__/declaredLimitPins tests/specLint/declaredLimitPinsCorpus.test.ts
git commit -m "test(spec-lint): replay the shell-binding pin collision; pin the corpus advisory set"
```

### Task 7: Mutation enrolment — both declarations, then the scoped run  (outside the red-contract region)

**Files:**

- Modify: `tests/mutation/source/registry.ts` (one `declaredLimitPins` row)
- Modify: `tests/mutation/source/expectedLedgerKinds.ts` (its `EXPECTED_LEDGER_KINDS` entry)

**NOT in a red-contract region, and disclosed rather than dressed as TDD.** This task writes no failing
CASE. It edits production registry DATA so an already-existing gate goes red, then supplies the second
half of that same edit. The command is GREEN before Step 1, so `red-state=authored` would be false under
its governing definition and `red-state=live` equally so. The red-then-green cycle is real and is worth
performing — it is the task's own evidence that a registry row alone is not enrolment — but it is a
data-driven cycle, not a test-first one, and claiming otherwise inside the region would assert a
contract this task does not meet.

Implements spec §7. Enrolment precedes the round-1 diff dispatch.

**What is red and why:** this red is observed on the LIVE tree between the two declarations — add the
registry row, run the gate, watch it fail on the missing `EXPECTED_LEDGER_KINDS` key, then add the
second declaration. That ordering is the task's own evidence that a registry row alone is not enrolment.

- [ ] **Step 1: Add the registry row** (`id: "declaredLimitPins"`, `sourcePath`, `suitePaths` = the
      Task 1-6 pure suites, `operators: [...OPERATOR_NAMES]`, `scoreFloor: 0.95`, a `control` mutant,
      `accepted: []`), shaped after the `redContract` row.
- [ ] **Step 2: Observe red AND CONFIRM THE REASON.** Run
      `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts`.
      Expected: the ledger-kinds key comparison fails, naming `declaredLimitPins` as present in the
      registry and absent from `EXPECTED_LEDGER_KINDS`. **The bare `pnpm vitest run <file>` form is NOT
      usable here and the difference is not cosmetic:** that file is in `NIGHTLY_ONLY_EXCLUDES`
      (`vitest.projects.ts`), so every default project excludes it and the run collects ZERO tests. Verified
      on the live tree: the bare form prints `No test files found` and exits 1, while the
      project-and-env-gated form above collects 5. The bare form's exit code is NOT the problem — it is
      that the failure is for the WRONG REASON, so no later edit can ever turn it green, and a red that
      cannot express a verdict is worthless in either direction.
- [ ] **Step 3: Add the `EXPECTED_LEDGER_KINDS` entry.**
- [ ] **Step 4: Observe green.** Same command.
- [ ] **Step 5: Score the surface.** Temporary tests/mutation/guardSurfaces.shard9.test.ts filtering
      `GUARD_SURFACES` to this id BEFORE `registerSurfaceCases` (`-t` does not bound the gate), run
      under the heavy-slot wrapper in the FOREGROUND, then DELETE the shard file
      (`_metaSourceShardIntegrity` pins the shard set byte-for-byte) and confirm that meta-test green.

```bash
# Same excluded shape as the gates file: a bare `vitest run` collects NOTHING here.
VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm exec vitest run --project mutation \
  tests/mutation/guardSurfaces.shard9.test.ts
rm tests/mutation/guardSurfaces.shard9.test.ts
pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts
```

- [ ] **Step 5b: Run the CANONICAL command spec §7 requires before the round-1 diff dispatch.** The
      scoped shard is a development convenience; the evidence the spec asks for is the whole-registry
      run, and Task 8's `pnpm test` cannot substitute because the mutation suites are nightly-only
      exclusions.

```bash
pnpm heavy pnpm mutation:guards
```

- [ ] **Step 6: Repay every survivor with a CASE, or accept it with an argument.** A survivor in the
      surface is the gate reporting that the deciding suites cannot see a change — read it as suite
      inadequacy, not harness noise. Record `MUTATION SCORE: <k>/<t>` and the unaccepted-survivor set
      (expected empty) for the round-1 diff brief's `GUARD SURFACE:` line; the wrapper exits 2 without it.
- [ ] **Step 7: Commit.**

```bash
git add tests/mutation/source/registry.ts tests/mutation/source/expectedLedgerKinds.ts
git commit -m "test(infra): enrol declaredLimitPins as a guard surface - registry row and ledger kinds"
```

<!-- tasks: depth=3 red-contract -->

### Task 7b: CLI boundary proof — the adapter's preparation

**Files:**

<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `tests/specLint/declaredLimitPinsCli.test.ts`
- Create: `tests/specLint/__fixtures__/declaredLimitPins/cli/` (a fixture plan, and fixture suite TEXT)
- Modify: `scripts/spec-lint.ts` (export the preparation function; wire it into the read path)

<!-- task: red=`pnpm vitest run tests/specLint/declaredLimitPinsCli.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:442` why=`Step 1 adds prepareSuiteText to the adapter as an exported STUB returning its input UNCHANGED, so the suite resolves and fails on its ASSERTION: prepared text still carries all three decoy titles where the case asserts none survives. That is the reachable red. The subprocess WIRING step cannot supply one - Task 5 already injected the table, and prepared and unprepared agree on every real enrolled suite (measured), so that assertion is green when authored and is characterization of the end-to-end path rather than this task's red` ac=AC-10 -->

Round 4 found that every other suite in this plan exercises the pure core with prepared lines the test
itself supplies, so a shipped adapter that passes RAW lines, or never injects the table at all, passes
all of them while the false-advisory class survives at the boundary where it actually lives. `0 hard`
cannot catch it either: the arm is advisory-only, so the dogfood lint is green whether or not the arm
ever ran.

The fixture holds one LIVE pin plus ONE DECOY PER PREPARATION CHANNEL, each **differently titled**:
inside `/* … */`, inside a template literal, and inside a multi-line ordinary string. The shipped CLI
must emit exactly ONE advisory, naming the live pin. A single comment decoy would certify only the
comment channel — an adapter blanking comments but not templates passes it and every pure test — so the
decoy set IS the §3.1 channel list and grows with it. A SECOND run, over an unparseable fixture suite,
asserts the unreadable advisory appears: a strip-then-parse adapter cannot be caught by a core-level
fixture that merely injects a status.

**The two titles must differ, and this is the fixture's whole discriminating power.** With identical
titles both pins share a `(path, title)` identity, §3.3's dedup collapses them, and an adapter that
never prepares the text emits exactly one finding — the pass condition. The proof would be satisfiable
by the defect it exists to catch. Round 5 found that in the draft written one round earlier, which is
why the weaker-implementation pass is run over FIXTURES and not only over rules.

**Anti-tautology.** Both failure directions are asserted from the same run, because either alone is
satisfiable by the other defect: TWO findings prove the adapter never prepared the suite text; ZERO
prove it never injected the surface table. A test asserting only "at least one finding" passes an
unprepared adapter.

**The proof is TWO steps, because one mechanism cannot reach both facts.** Plan round 1 established
why: the shipped CLI resolves `suitePaths` from the real registry and the tracked-file index, so a
fixture suite under `__fixtures__/` is NEVER READ by a real subprocess, and decoys planted there are
unreachable. Planting them in a real enrolled suite is not an option — that edits a tracked test file
to make a test pass.

So:

- **PREPARATION is proved IN PROCESS**, against the adapter's exported preparation function over a
  fixture suite text holding one live pin plus one decoy per channel. This is where the decoys live and
  it is the only place they can be observed.
- **WIRING is proved BY SUBPROCESS**, running the shipped CLI over a fixture PLAN that names a REAL
  enrolled surface and asserting the arm's advisory appears **identified by that surface's specific
  `(suitePath, title)`** — not merely that some advisory was emitted. Fixture pass, iteration on the
  restructured tasks: asserting presence alone is satisfied by ANY advisory the run happens to produce,
  including one from an unrelated surface the fixture plan also names, so the identity is the assertion
  and the bare count is not. That proves
  the adapter injects the table and reaches the core end to end; it says nothing about preparation,
  because the real suites contain no decoys (measured: prepared and unprepared agree on the live
  corpus).

Neither step covers the other, and neither covers table-driven NAMING — Task 2's synthetic-surface case
does that. Three facts, three proofs, stated so no one reads any of them as covering more.

- [ ] **Step 1: Add `prepareSuiteText` to the adapter as an exported STUB returning its input
      unchanged**, then write the fixture suite TEXT (one live pin, one decoy per channel) and the
      failing in-process case. The assertion is the exact surviving SET — every decoy title gone AND the
      LIVE pin's title still present — never merely that the decoys are absent, which a preparation that
      blanks the whole file would satisfy. The stub is the `red-target=` defect, not the implementation.
- [ ] **Step 2: Observe red AND CONFIRM THE REASON.** Run
      `pnpm vitest run tests/specLint/declaredLimitPinsCli.test.ts`. Expected: the prepared text still
      contains all three decoy titles, each named in the failure output. A spawn error, an unresolved
      export, or zero collected tests invalidates the red.
- [ ] **Step 2b: Add the UNPARSEABLE-SUITE case, in process, BEFORE any implementation.** Suite text whose only defect is an
      unterminated `/*` above a live pin. Expected: preparation reports the parse failure, so the suite
      DECLINES and contributes no pins. This is the only executable proof that diagnostics come from the
      RAW text — a strip-then-parse implementation consumes the opener to EOF, reports a clean parse and
      silently returns no pins, and no core-level fixture can catch it because those merely inject a
      status. It goes RED against the Step-1 stub, which reports no diagnostics at all, and green once
      Step 3 lands the raw-first order — the same command, red then green, test written first.
- [ ] **Step 3: Implement `prepareSuiteText`** — parse RAW for diagnostics, THEN blank comments,
      template bodies and multi-line ordinary strings — and wire it into the adapter's read path. This
      turns Step 1's decoy case and Step 2b's unparseable case green on their own commands.
- [ ] **Step 3b: Add the subprocess WIRING case**, over a fixture plan naming a REAL enrolled surface,
      asserting the advisory appears identified by that surface's specific `(suitePath, title)`.
      Expected to pass on authoring: Task 5 already injected the table. It is characterization of the
      end-to-end path, recorded as such rather than dressed as a red.
- [ ] **Step 4: Observe green**, then re-run Task 5's purity meta-test and `pnpm typecheck`.
- [ ] **Step 5: Commit.**

```bash
git add tests/specLint/declaredLimitPinsCli.test.ts tests/specLint/__fixtures__/declaredLimitPins/cli \
        scripts/spec-lint.ts
git commit -m "test(spec-lint): prove the adapter prepares and injects, through the shipped CLI"
```

<!-- tasks: end -->

**Region boundaries, disclosed rather than silent.** This plan declares TWO task regions — Tasks 1-5,
then Task 7b — and THREE tasks sit outside them. **Task 6** is characterization: after Tasks 1-5
the core is complete, so its suite is green the moment it is authored, measured rather than assumed
since the live corpus yields the same seven pins prepared or unprepared. **Task 8** carries no marker
either. That is deliberate: Task 8 edits two documents and runs gates,
and it has no test-first cycle to declare. A marker on either would assert a red that cannot fire. The
exclusions are stated because an undisclosed one is the silent-under-coverage defect
`BL-SPECLINT-RED-TARGET-CANNOT-NAME-A-REPO-ROOT-SURFACE` records: the lint stays green, the region stays
well-formed, and nothing reports that a task opted out. Counted mechanically rather than asserted: this
plan has NINE tasks, SIX of them marked and inside a region (1, 2, 3, 4, 5, 7b) and THREE excluded
(6, 7, 8), each for the reason given above.

### Task 8: Docs, dogfood, and whole-tree gates

**Files:**

- Modify: `docs/agents/writing-plans.md` (one sentence under the reconciliation/closeout-sweeps bullet)
- Verify: `docs/superpowers/specs/ci/README.md` already carries this spec's row (it was added mid-arc when `tests/docs/specsReadmeIndexParity.test.ts` went red on the branch — the PER-DIRECTORY index is the one that gate enforces, not the root)
- Modify: this spec and this plan (Step 4b removes their expired waivers)

- [ ] **Step 1: Record the pre-edit docs-gate verdict.** Run the FULL docs suite — not a single file,
      because the checks that matter walk the LIVE corpus and a scoped run passes while the branch is
      red — and paste its result:

```bash
pnpm heavy pnpm vitest run tests/docs/
```
- [ ] **Step 2: Make the doc edits.**
- [ ] **Step 3: Re-run the docs gates and the dogfood lint.**

```bash
pnpm vitest run tests/docs/agentsHeavyPhaseRule.test.ts
# ONE document per invocation -- the CLI exits 2 on two positional paths.
pnpm spec:lint docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md
pnpm spec:lint docs/superpowers/plans/ci/2026-08-19-planlint-declared-limit-pin-collision.md
```

Expected: `0 hard` on both documents, INCLUDING the new arm running against this plan — the plan's own
Files declarations name `tests/mutation/source/registry.ts` and several enrolled `lib/specLint/*` paths, so
the arm reports on itself. Any advisory it raises against this plan is dispositioned in the plan text by
naming the pin, which is the arm dogfooding its own contract.

- [ ] **Step 4: Whole-tree gates.**

```bash
pnpm typecheck && pnpm exec eslint lib/specLint scripts/spec-lint.ts tests/specLint
pnpm heavy pnpm test
```

- [ ] **Step 4a: Prove `parse.ts` is unmodified BY DIFF.** The purity meta-test only rejects `node:fs`,
      `node:child_process` and `node:process` imports and typecheck sees nothing, so neither can support
      AC-8's clause:

```bash
git diff --exit-code origin/main -- lib/specLint/parse.ts
```

- [ ] **Step 4b: Remove every forward-declaration waiver whose reason has expired**, now that Tasks 1-7b
      have tracked the files they create. Delete each `<!-- spec-lint: ignore -->` whose target now
      exists, then confirm BOTH documents still lint `0 hard` WITHOUT it — that is the only proof the
      waiver was load-bearing for nothing. A waiver left behind stops suppressing a forward declaration
      and starts masking any real citation defect at that line.

```bash
pnpm spec:lint docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md
pnpm spec:lint docs/superpowers/plans/ci/2026-08-19-planlint-declared-limit-pin-collision.md
```

- [ ] **Step 5: Commit** — the spec and plan are MODIFIED FILES of this task, because Step 4b edits them.

```bash
git add docs/agents/writing-plans.md docs/superpowers/specs/ci/README.md \
        docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md \
        docs/superpowers/plans/ci/2026-08-19-planlint-declared-limit-pin-collision.md
git commit -m "docs: record the declared-limit pin advisory beside the sweep discipline it mechanizes"
```

## Plan-time observed red set

Executed 2026-08-19 against the pre-implementation tree. All SIX marked tasks are `red-state=authored`: their failing cases do not exist yet, so none is run
now, and each names the production surface whose absence or defect makes it fail — verified below.
The region therefore declares no `red-state=live` command, so `spec:lint --exec-red` has nothing to
execute here and its silence is not a certificate. **Two sharper facts about what the lint does NOT
claim, so no reader mistakes a green report for coverage it never offered.** Plain `pnpm spec:lint`
makes no COLLECTION claim at all — the collection arm returns nothing when no probes ran, and probes
run only under `--exec-red` (`lib/specLint/redContract.ts`). And under `--exec-red` the arm is SILENT
for any command wrapped in `pnpm heavy`, drawing neither a finding nor the unverified advisory — which
is precisely the class `AGENTS.md` MANDATES wrapping. This plan's two heavy-wrapped commands (the
scoped mutation run in Task 7, `pnpm test` in Task 8) are therefore proved by RUNNING them and reading
their output in their own steps, never by the lint's silence. The same rule already governs every
`red=` here: a red is confirmed by its REASON, read from the failure output.

```
$ ls lib/specLint/declaredLimitPins.ts tests/specLint/declaredLimitPinDispositions.ts
ls: cannot access 'lib/specLint/declaredLimitPins.ts': No such file or directory
ls: cannot access 'tests/specLint/declaredLimitPinDispositions.ts': No such file or directory
        # Tasks 1-4, 6: the named production surfaces are absent, as their why= states.

$ grep -c 'checkDeclaredLimitPins\|surfaces' lib/specLint/run.ts
0       # Task 5: runLint neither takes the table nor calls the arm.

$ grep -c 'declaredLimitPins' tests/mutation/source/registry.ts tests/mutation/source/expectedLedgerKinds.ts
tests/mutation/source/expectedLedgerKinds.ts:0
tests/mutation/source/registry.ts:0
        # Task 7: neither declaration exists, so the gate's red is reachable by adding one.
```

Task 7's red is observed DURING the task, between its two declarations: the gate is green on the
pre-implementation tree and turns red the moment Step 1 lands the registry row without the ledger-kinds
entry. Stating that in the `why=` rather than asserting it here is deliberate — claiming a pre-existing
red for a command that exits 0 today would be the "pasted a command prompt beside a number" defect.

## Acceptance criteria (from spec §10)

| AC | Proved by | Channel |
| --- | --- | --- |
| AC-1 pin grammar, accept-set and every decline | Task 1 | tests/specLint/declaredLimitPins.test.ts |
| AC-2 Files-declaration grain, prose draws nothing | Task 2 | tests/specLint/declaredLimitPinsFiles.test.ts |
| AC-3 obligation, dedup, advisory-only severity | Tasks 3, 5 | obligation + wiring suites |
| AC-4 historical replay, both directions | Task 6 | `declaredLimitPinsCorpus.test.ts, committed blobs |
| AC-5 both fail-open channels reported, not skipped | Task 3 | fake resolver: `null` read, and a SUCCEEDING read on an untracked path |
| AC-6 corpus SET over the enumerated corpus | Task 6 | live-tree corpus case, set assertion, no count |
| AC-7 dispositions: no stale row, derived census | Task 4 | _metaDeclaredLimitPins.test.ts |
| AC-7a every rule AND every fixture kills its named weaker implementation, and no fixture is neutralized by another rule | Tasks 1, 2, 3, 4, 7b | the two §6 tables, one fixture per row; the pass is re-run to a FIXED POINT before each dispatch and its iteration counts recorded in the round filing |
| AC-8 both enrolment declarations, score ≥ 0.95 | Tasks 5, 7 | gates test, purity meta-test, scoped run |
| AC-9 both documents lint `0 hard` (NOT arm-ran evidence) | Task 8 | `pnpm spec:lint` on spec and plan |
| AC-10 adapter PREPARES (in process, over decoys) and WIRES (subprocess, real surface) | Task 7b | two steps, because the real CLI never reads a fixture suite |

No AC is satisfied by a green suite alone: each row names the executable step that produces the
evidence and the channel it arrives on.

## Closeout

impeccable-gate: N/A — no UI surface

**Remove the forward-declaration waivers whose reason has expired.** This plan and its spec carry
`<!-- spec-lint: ignore -->` waivers on the paths they CREATE, valid only while those files are
untracked. As each file lands, delete its waiver and confirm the document still lints `0 hard` WITHOUT
it — the only proof the waiver was load-bearing for nothing. A waiver left behind stops suppressing a
forward declaration and starts masking any real citation defect at that line.

Closing-PR mechanics (implementation session): graduate `BL-PLANLINT-DECLARED-LIMIT-PIN-COLLISION` to
`BACKLOG-archive.md` and strip its `**Status:** IN PROGRESS · **Branch:** …` marker as ONE ledger commit
BEFORE whole-diff review (invariant 12 as ruled 2026-08-18 — the archive move and the marker strip are
one commit, so absence at merge is guaranteed rather than maintained). Verify by set arithmetic: the
union of `BL-`/`DEF-` ids is unchanged and `comm -12` of archived-vs-open ids is empty. Whole-diff
cross-model review before merge; `gh pr merge --merge --auto` armed only once the ledger commit is
pushed AND review has approved, re-armed after every push; real CI green, not just local; Stage 4.4
`0  0` check, cron delete, pane and agent label clear.
