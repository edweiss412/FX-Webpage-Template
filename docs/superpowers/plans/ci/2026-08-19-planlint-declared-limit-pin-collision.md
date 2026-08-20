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

## Pre-draft verification pass (run 2026-08-19, live tree at `4e074d3bc`)

Every path, symbol and number the tasks name was verified against the tree before drafting.

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
plans naming an enrolled path ANYWHERE: 63

$ pnpm tsx .probe/probe7.ts            # which shapes carry a Files declaration
**Files:** headers: 2559 | header line itself carries a path: 636
followed by UNORDERED list: 2136 | by ORDERED list: 25 | by neither: 398

$ pnpm tsx .probe/probe9.ts            # the shipped rules (spec 3.1/3.2 as of round 3) over the corpus
live pins 7 | suites carrying >=1 5
plans 666 | naming an enrolled surface: 23 | firing: 3 | advisories: 5
docs/superpowers/plans/2026-07-19-spec-lint.md  (2)
docs/superpowers/plans/2026-08-04-review-round-economy.md  (2)
docs/superpowers/plans/2026-08-09-m-wave-2/plan.md  (1)
```

Spec rounds 1 and 3 moved these rules and the numbers with them. Round 1: the Files declaration now spans the
HEADER LINE's own remainder (636 headers put the paths there, and missing them dropped a real
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

**What is red and why:** the module does not exist. The suite's expectations encode the accept-set and
every declined shape; none can pass until `discoverPins` exists.

The declined shapes are asserted individually, each with its spec §8 item cited in the test body,
because "the arm draws nothing here" is the claim a future widening would quietly break:

| Declined shape | Spec | Assert |
| --- | --- | --- |
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

One more case, and it is a GRAIN assertion rather than a decline: a test whose BODY tabulates several
declared misses under one phrase-bearing title yields exactly ONE pin, not one per row (spec §8 item
12). The live instance is the six-row table under `each quote-concatenated keyword/operand spelling is a
declared miss`; a concurrent arc enumerating that file BY ZERO counted ten where this arm counts one,
and the test pins which unit ships so the two are never read as a recall gap.

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
- [ ] **Step 4: Observe green.** Same command, PASS.
- [ ] **Step 5: Commit.**

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

**What is red and why:** `namedSurfaces` does not exist. Task 1 shipped pin discovery only.

**Anti-tautology.** The prose-outside-a-block case is the §2.5 measurement made executable: it is the
38-plan false-advisory source, and a whole-document implementation passes every other case in this
suite while failing that one. The unmodeled-verb case (`- Regenerate: \`lib/…\``) is the §2.5 verb
argument made executable: an implementation that accept-lists `Modify`/`Test`/`Create` passes the rest
and fails that one. The inline-header case fails any implementation that scans only the lines BELOW the
header — which is what the round-1 finding caught in the calibration probe itself. The `.bak` case
fails any implementation using `String.prototype.includes` on the raw path.

- [ ] **Step 1: Write the failing suite.** Extent cases, grain cases, fence-inertness, second block,
      indented continuation line, and a path naming three surfaces (the live
      `tests/docs/_metaReviewRoundEconomy.test.ts` shape). Plus the three shapes spec round 1 added,
      each with the live input that motivated it: paths INLINE on the header line (the
      `docs/superpowers/plans/2026-08-09-m-wave-2/plan.md` shape, whose missed advisory was the
      finding); an ORDERED run after the header, which is declined so its numbered task steps cannot
      name a surface (spec §8 item 11); and a delimited-token match, where appending `.bak` to a live
      entry must name NOTHING while the entry itself still names its surface (spec §3.2).
- [ ] **Step 2: Observe red AND CONFIRM THE REASON.** Run
      `pnpm vitest run tests/specLint/declaredLimitPinsFiles.test.ts`. Expected: the naming cases fail
      with an empty set against an expected surface id. A module-resolution error, a parse error, or
      zero collected tests means the red is invalid and the task stops.
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

**What is red and why:** `checkDeclaredLimitPins` does not exist; Tasks 1-2 produce data, not findings.

**The fail-open case is the point of this task.** A resolver returning `null` for a `suitePath` must
produce `DECLARED_LIMIT_PIN_SUITE_UNREADABLE`, not an empty pin list that reads as "no pins here". The
test uses a fake resolver returning `null` for exactly one of two suites and asserts BOTH that the
advisory fires for that suite AND that the other suite's pins still report — so an implementation that
bails out of the whole surface on one unreadable suite fails.

**Anti-tautology.** The dedup case constructs one pin reachable through two surfaces and asserts
exactly one finding; an implementation iterating surfaces without deduplicating passes every other
case. The title-substring case — TITLE matching, which stays a verbatim substring test (spec §8 item 7); PATH matching is delimited-token since round 1, and the two must not be conflated — constructs a pin whose title is a proper substring of a longer title present
in the plan, and asserts the longer title's presence does NOT satisfy the shorter pin unless it
literally contains it. Severity is asserted over every emitted finding, not sampled.

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

<!-- task: red=`pnpm vitest run tests/specLint/_metaDeclaredLimitPins.test.ts` red-state=authored red-target=`tests/specLint/declaredLimitPinDispositions.ts` why=`Step 1 creates the registry as an exported EMPTY array, so the meta-test resolves and fails on its ASSERTION: with no dispositions the shipped scanner reports NINE phrase-bearing titles over the enrolled suites where the derived census expects the SEVEN live pins of spec 2.4, and the two closure narrations of 2.4 appear in the observed set by name` ac=AC-7 -->

Implements spec §5. The registry lives under `tests/` because it is test-facing data, and the core
receives it as a parameter — `lib/` still imports nothing from `tests/`.

**What is red and why:** the registry module does not exist, and the live-tree census in the meta-test
sees the two closure narrations of spec §2.4 as pins.

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
      `pnpm vitest run tests/specLint/_metaDeclaredLimitPins.test.ts`. Expected: the census set differs
      by exactly the two §2.4 closure titles, named in the diff. A failure of any other shape — import,
      parse, zero collected — invalidates the red.
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
- [ ] **Step 3: Thread the table through `runLint`; project `GUARD_SURFACES` in the adapter; PREPARE the
      suite text there (spec §3.1) — `stripCommentsSafely` for comments, parser template ranges for
      fixture bodies. The core receives prepared lines and owns no notion of code. Do NOT hand-roll a
      comment stripper: `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts` forbids local
      copies, and its walker root is `tests/` only — so a copy in `lib/` would be invisible to it and
      the rule would go unenforced exactly where it was broken.**
- [ ] **Step 4: Observe green**, then re-run the invariant checks this diff already passed:
      `pnpm vitest run tests/specLint/_metaPureCore.test.ts` and `pnpm typecheck`.
- [ ] **Step 5: Commit.**

```bash
git add lib/specLint/run.ts scripts/spec-lint.ts tests/specLint/declaredLimitPinsWiring.test.ts
git commit -m "feat(spec-lint): thread the enrolled-surface table core-ward from the adapter"
```

### Task 6: Historical re-enactment and corpus regression

**Files:**

- Create: `tests/specLint/__fixtures__/declaredLimitPins/` (three committed blobs)
<!-- spec-lint: ignore — new file created by this plan; not yet tracked -->
- Create: `tests/specLint/declaredLimitPinsCorpus.test.ts`

<!-- task: red=`pnpm vitest run tests/specLint/declaredLimitPinsCorpus.test.ts` red-state=authored red-target=`lib/specLint/declaredLimitPins.ts` why=`the fixtures and the suite do not exist; once authored, the replay case fails until the arm discriminates the pre-Step-3b plan from the merged one, and the corpus case fails unless the live-tree run over the tracked plan corpus produces exactly the four-advisory SET of spec 2.6` ac=AC-4,AC-6 -->

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
different set of the same size, and the corpus grew by one plan between drafting and spec round 1 (this
plan), which would have stranded any hard-coded total on its first run.

**Premise.** The corpus case states executably that the enumerated plan corpus is non-empty and that at
least one enrolled surface carries at least one pin, using `tests/_shared/premise.ts`, in ONE test over
a literal array and never inside a `.each` callback. Without it, a run in a checkout where the glob
returns nothing asserts an empty set against an empty set and reports PASS.

- [ ] **Step 1: Extract the three fixtures** with the commands above.
- [ ] **Step 2: Write the failing suite** (replay both directions; corpus set; premise).
- [ ] **Step 3: Observe red AND CONFIRM THE REASON.** Run
      `pnpm vitest run tests/specLint/declaredLimitPinsCorpus.test.ts`. Expected: the replay case fails
      on the pre-Step-3b fixture drawing zero advisories against one expected, and the corpus case on a
      set difference. A fixture-read error means the Step 1 extraction failed, not that the arm is
      wrong — that is an invalid red and the task stops.
- [ ] **Step 4: Make it green** — this is where any grammar gap the corpus reveals is repaired by
      NARROWING and a spec §8 entry, never by widening the predicate.
- [ ] **Step 5: Commit.**

```bash
git add tests/specLint/__fixtures__/declaredLimitPins tests/specLint/declaredLimitPinsCorpus.test.ts
git commit -m "test(spec-lint): replay the shell-binding pin collision; pin the corpus advisory set"
```

### Task 7: Mutation enrolment — both declarations, then the scoped run

**Files:**

- Modify: `tests/mutation/source/registry.ts` (one `declaredLimitPins` row)
- Modify: `tests/mutation/source/expectedLedgerKinds.ts` (its `EXPECTED_LEDGER_KINDS` entry)

<!-- task: red=`VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm exec vitest run --project mutation tests/mutation/guardSurfaces.gates.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:24` why=`the corpus gate compares Object.keys(EXPECTED_LEDGER_KINDS) against the registry ids (tests/mutation/guardSurfaces.gates.test.ts:21), so adding the registry row alone leaves the gate red on the missing ledger-kinds entry - the exact half-enrolment this task exists to close, observed after Step 1 adds the registry row and before Step 3 adds the ledger-kinds entry; the gate is GREEN on the pre-implementation tree, so this red is authored by the task rather than live on it` ac=AC-8 -->

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
      (`vitest.projects.ts`), so every default project excludes it, the run collects ZERO tests and
      exits 0 — a red that is green from birth and that no later edit can ever make fail. Verified on
      the live tree: the bare form exits 0 with no tests collected; the project-and-env-gated form above
      collects 5.
- [ ] **Step 3: Add the `EXPECTED_LEDGER_KINDS` entry.**
- [ ] **Step 4: Observe green.** Same command.
- [ ] **Step 5: Score the surface.** Temporary tests/mutation/guardSurfaces.shard9.test.ts filtering
      `GUARD_SURFACES` to this id BEFORE `registerSurfaceCases` (`-t` does not bound the gate), run
      under the heavy-slot wrapper in the FOREGROUND, then DELETE the shard file
      (`_metaSourceShardIntegrity` pins the shard set byte-for-byte) and confirm that meta-test green.

```bash
pnpm heavy pnpm vitest run tests/mutation/guardSurfaces.shard9.test.ts
rm tests/mutation/guardSurfaces.shard9.test.ts
pnpm vitest run tests/mutation/_metaSourceShardIntegrity.test.ts
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

<!-- tasks: end -->

**Region boundary, disclosed rather than silent.** The declared task region closes here, so Task 8 is
NOT covered by `spec:lint --exec-red`. That is deliberate: Task 8 edits two documents and runs gates,
and it has no test-first cycle to declare — a marker on it would assert a red that does not exist. The
exclusion is stated because an undisclosed one is the silent-under-coverage defect
`BL-SPECLINT-RED-TARGET-CANNOT-NAME-A-REPO-ROOT-SURFACE` records: the lint stays green, the region stays
well-formed, and nothing reports that a task opted out. Seven of this plan's eight tasks are test-first
and all seven are inside the region.

### Task 8: Docs, dogfood, and whole-tree gates

**Files:**

- Modify: `docs/agents/writing-plans.md` (one sentence under the reconciliation/closeout-sweeps bullet)
- Modify: `docs/superpowers/specs/README.md` (one row)

- [ ] **Step 1: Record the pre-edit docs-gate verdict.** Run the command above and paste its result.
- [ ] **Step 2: Make the doc edits.**
- [ ] **Step 3: Re-run the docs gates and the dogfood lint.**

```bash
pnpm vitest run tests/docs/agentsHeavyPhaseRule.test.ts
pnpm spec:lint docs/superpowers/specs/ci/2026-08-19-planlint-declared-limit-pin-collision.md \
               docs/superpowers/plans/ci/2026-08-19-planlint-declared-limit-pin-collision.md
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

- [ ] **Step 5: Commit.**

```bash
git add docs/agents/writing-plans.md docs/superpowers/specs/README.md
git commit -m "docs: record the declared-limit pin advisory beside the sweep discipline it mechanizes"
```

## Plan-time observed red set

Executed 2026-08-19 against the pre-implementation tree. All seven marked tasks are `red-state=authored`: their failing cases do not exist yet, so none is run
now, and each names the production surface whose absence or defect makes it fail — verified below.
The region therefore declares no `red-state=live` command, so `spec:lint --exec-red` has nothing to
execute here and its silence is not a certificate.

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
| AC-2 Files-block grain, prose draws nothing | Task 2 | tests/specLint/declaredLimitPinsFiles.test.ts |
| AC-3 obligation, dedup, advisory-only severity | Tasks 3, 5 | obligation + wiring suites |
| AC-4 historical replay, both directions | Task 6 | `declaredLimitPinsCorpus.test.ts, committed blobs |
| AC-5 both fail-open channels reported, not skipped | Task 3 | fake resolver: `null` read, and a SUCCEEDING read on an untracked path |
| AC-6 corpus SET over the enumerated corpus | Task 6 | live-tree corpus case, set assertion, no count |
| AC-7 dispositions: no stale row, derived census | Task 4 | `_metaDeclaredLimitPins.test.ts |
| AC-8 both enrolment declarations, score ≥ 0.95 | Tasks 5, 7 | gates test, purity meta-test, scoped run |
| AC-9 both documents lint `0 hard` | Task 8 | `pnpm spec:lint` on spec and plan |

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
