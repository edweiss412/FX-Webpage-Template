# Plan — plan-lint arm for AC-table command observability

**Spec:** `docs/superpowers/specs/ci/2026-08-25-planlint-ac-command-observability-design.md` (spec stage closed at 4 rounds; round-economy filing at `docs/review-rounds/feat/planlint-ac-command-observability/9b1bd6715029.md`) · **Row:** `BL-PLANLINT-AC-COMMAND-OBSERVABILITY` · **Branch:** `feat/planlint-ac-command-observability`

impeccable-gate: N/A — no UI surface

## 1. Meta-test inventory

| Meta-test | CREATES / EXTENDS / covered by default | Why |
| --- | --- | --- |
| `tests/specLint/_metaPureCore.test.ts` | **EXTENDS** | its walker covers the new module by default (`tests/specLint/_metaPureCore.test.ts:37`), but its only assertion forbids three `node:` modules (`tests/specLint/_metaPureCore.test.ts:15`), so a direct `remark` import in the pure core passes it. Round-1 finding 3: AC-15 was claimed by a command that cannot enforce it. Task 8 adds a relative-imports-only assertion, with a planted `remark` import as its red. |
| the `acCoverageSuiteDerivation` meta-test | **CREATES** | round-2 finding 2: the plan promised a bidirectional `suitePaths`-versus-disk assertion and named nowhere for it to live, so an implementer could enrol four suites, score them, and leave a fifth silently unscored. Modelled on `tests/mutation/_metaClaimSweepSuiteDerivation.test.ts`, which is named OUTSIDE its own glob deliberately so it does not have to enrol itself. |
| `tests/mutation/source/expectedLedgerKinds.ts` | **EXTENDS** | round-1 finding 4. `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts:94` asserts SET EQUALITY in both directions between its keys and `GUARD_SURFACES` ids, so enrolling a surface without an entry fails. Probing `claimSweep` gives this artifact kind's full fan-out: mutation registry, ledger kinds, premise map, suite-derivation meta-test. |
| `tests/mutation/_metaPremiseContract.test.ts` | EXTENDS | it walks the enrolled suites with a per-suite expected premise count; each newly enrolled suite needs its row (Task 11). |
| `tests/mutation/_metaGuardSurfaceRegistry.test.ts` | covered by default | it VALIDATES the rows it is given and DISCOVERS no absent one, so it is not protection against forgetting to enrol. Enrolment is a task step. |
| a new registry-style meta-test | NONE, with the reason | the arm adds no Supabase call boundary, no admin mutation surface, no DB artifact, and no new mutation-surface KIND. The one registry it joins already has a validating meta-test, and the suite-derivation pattern it needs exists at `tests/mutation/_metaClaimSweepSuiteDerivation.test.ts`. |

## 2. Mutation-operator family closure

The closure set the diff review converges against, declared up front. The registry row's `operators` is `[...OPERATOR_NAMES]`, the whole set declared at `tests/mutation/source/operators.ts:17`:

`relational-boundary`, `equality-flip`, `logical-connector`, `integer-literal`, `regex-quantifier-bound`, `statement-removal`.

A reviewer-proposed NEW family is admissible only with a live escaping mutant demonstrated against the shipped guard, never hypothesized. The round-1 diff brief's `OPERATORS:` tail is read off the shipped registry row, never retyped.

## 3. Citation lifetime — this plan's own execution invalidates its own red-targets

Stated up front, because it is a temporal dependency that costs arcs a hard failure with no edit to the plan at all.

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
`targetProblem` (`lib/specLint/redContract.ts:160`) accepts a PATH-ONLY `red-target=` only while the path is UNTRACKED: a tracked path draws "is tracked; cite the defective line instead of the bare path" (`lib/specLint/redContract.ts:169`). `lib/specLint/acCoverage.ts` does not exist today, so every task below legally cites it path-only AT PLAN TIME. **Task 1 tracks it, and from that commit every path-only citation in this plan, Task 1's own included, is a hard `RED_TARGET_INVALID` — the lint reads the whole plan at any later time and does not care that a task's red already happened.**

Counted, not estimated. The command is anchored to `^<!-- task:` on purpose: a bare count also matches the prose that discusses the citation, including this paragraph's own command.

```
$ grep -c '^<!-- task: .*red-target=`lib/specLint/acCoverage.ts`' <this plan>
6
```

The repair is to RE-POINT, never to waive (Task 12), and two rules make the re-pointing durable:

- **Every `why=` names a SYMBOL or quoted content, never a line.** A symbol survives a shift; a line number does not.
- **`RED_TARGET_INVALID` verifies only that a tracked path has an IN-RANGE line, never what is AT it.** A citation that drifts onto unrelated code stays green by design, so Task 12 re-verifies by READING each cited line and matching it to the symbol its `why=` names. Confirming that a citation resolves establishes nothing.

**Anchor table.** Task 12 fills the HEAD column by reading each cited line and matching it to the symbol its `why=` names. Round-1 finding 6 found three defects here — a symbol that never existed under that spelling, a row whose `why=` named none, and this task's own row missing — so the table now covers every marker in the plan, not only the invalidated ones.

```
| Task | red-target at BASE (plan time)                            | What the why= names, by symbol            | HEAD (Task 12) |
| ---- | --------------------------------------------------------- | ----------------------------------------- | -------------- |
| 1    | lib/specLint/acCoverage.ts (untracked)                    | `checkAcCoverage`, the stub this creates  | :240 (+9)      |
| 2    | lib/specLint/acCoverage.ts                                | the absence of any declaration-reading branch | :118       |
| 3    | lib/specLint/acCoverage.ts                                | `readDeclaredTables`                      | :118           |
| 4    | lib/specLint/acCoverage.ts                                | `commandSpansOf`                          | :60            |
| 5    | lib/specLint/acCoverage.ts                                | `acCommandPlan`                           | :211           |
| 6    | lib/specLint/acCoverage.ts                                | `AC_COMMAND_PIN_UNOBSERVED`               | :314 (+9)      |
| 7    | lib/specLint/run.ts:44 (tracked)                          | `CHECK_ORDER`                             | :47 (+3)       |
| 8    | tests/specLint/_metaPureCore.test.ts:12 (tracked)         | `FORBIDDEN`                               | :15 (+3)       |
| 9    | scripts/spec-lint.ts:864 (tracked)                        | the `spawnSync("sh", …)` parse invocation | :902           |
| 10   | docs/…/2026-08-21-pane-compaction-send-authorization.md:363 (tracked) | the declaration whose absence was the red | :363 unmoved |
| 11   | tests/mutation/source/expectedLedgerKinds.ts:24 (tracked) | `EXPECTED_LEDGER_KINDS`                   | :24 unmoved    |
| 12   | lib/specLint/redContract.ts:169 (tracked)                 | the tracked-path-only branch's message    | :169 unmoved   |
```

Task 2's row names an ABSENCE rather than a symbol, deliberately and stated: its red is that no branch reads a declaration at all, so there is no line to cite until Task 3 creates one. Task 12 records that as the reading rather than hunting for a symbol that should not exist.

## 4. Pre-draft code-verification pass, run against the tree at plan time (`300a9f937`)

Every anchor below is a line number **at the merge-base `300a9f937`**, not at HEAD. This is a
census of what existed before the work, so re-pointing it to HEAD would destroy what it records.
Three of these lines are ones this plan itself moves; §3's table carries their HEAD positions.

| Name | Anchor | Verified |
| --- | --- | --- |
| `parseDoc`, `DocModel`, `InlineSpan` | `lib/specLint/parse.ts:65`, `lib/specLint/parse.ts:19`, `lib/specLint/parse.ts:3` | yes |
| span `column` is 1-based and `line.slice(column-1, column-1+len)` recovers the content | probed with `tsx` against a real table row | yes |
| `classifySpan`, `SpanClass` | `lib/specLint/citations.ts:28`, `lib/specLint/citations.ts:5` | yes |
| `targetProblem`'s untracked-path-only allowance | `lib/specLint/redContract.ts:160-171` | yes |
| `ParseCheckEntry` (`line`, `command`, `source`) | `lib/specLint/redContract.ts:340` | yes |
| `parseCheckPlan` | `lib/specLint/redContract.ts:346` | yes |
| `Check` union, 8 members | `lib/specLint/types.ts:2` | yes |
| `CHECK_ORDER` | `lib/specLint/run.ts:44` | yes |
| `exitCodeForResult`: only `fail` exits 1 | `lib/specLint/run.ts:281` | yes |
| the `sh` parse spawn, with NO `--` | `scripts/spec-lint.ts:864` | yes |
| the summary line | `scripts/spec-lint.ts:200` | yes |
| `premise`, `premiseHolds` | `tests/_shared/premise.ts:26`, `tests/_shared/premise.ts:36` | yes |
| `OPERATOR_NAMES`, 6 names | `tests/mutation/source/operators.ts:17` | yes |
| `tests/specLint/redExec.test.ts` passes today (88 tests) | run at plan time | yes, which is why Task 9's red is `authored`, not `live` |

## 5. Reconciliation sweeps, authored AND RUN at plan time

**Sweep A — RETIRED at spec round 3, and recorded so nobody re-derives it.** Earlier drafts counted the inputs a hand-rolled table reader had to survive (75 rows with an escaped pipe, 675 with leading whitespace, 17 with a code span holding an unescaped pipe). The reader is gone; remark answers every one of those, and no task below carries a rule for any of them. The sweep that replaced it is the corpus population and the one structural fact the arm still owns:

**The census is SELF-REFERENTIAL, so it is pinned to a rev.** This plan lives in `docs/superpowers/plans/`, so the corpus it measures grows every time this branch commits — round 3 read 933/7590 against a transcript recording 929/7551, and both were correct for the tree they ran on. The number quoted is therefore taken at `origin/main`, the corpus WITHOUT this arc, and the working-tree figure is given beside it so the difference is explained rather than drifting:

```
at origin/main (the corpus the arm ranges over today)
tables: 929  rows: 7551

$ node docs/superpowers/specs/ci/probes/scripts/2026-08-25-ac-coverage-prototype.mjs hazards
tables in the plan corpus, per remark:        933
data rows across them:                        7590
documents carrying MORE THAN ONE AC table:    1
   docs/superpowers/plans/ci/2026-08-20-browser-child-lifetime.md (2)
every pipe/whitespace/backslash question above is remark's, not this arm's
```

The delta is this plan's own tables. Neither claim the census supports — the population's size, and that one document already carries two AC tables — turns on four tables either way.

**Sweep B — the declaring-document population.** Round-3 finding 1: the loose substring grep also matches the spec's own prose describing the grammar, so "exactly two after Task 10" was unsatisfiable by the command as written — it would return three. The sweep's command is the ANCHORED one, matching the declaration grammar rather than the substring:

```
$ grep -rlE '^ {0,3}<!-- ac-coverage: command-col=[1-9][0-9]* -->[[:space:]]*$' docs/
docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md
```

One document declares today: this plan. After Task 10 the anchored grep must return exactly two, both PLANS — the fixture and this one — and the arm must report zero over both. The loose grep is kept out of the plan entirely, because a sweep whose command cannot produce its stated result is worse than no sweep.

**Sweep C — the mutation-surface fan-out, RUN.** Round-2 finding 2: this sweep named two of four registries and was described rather than executed. The artifact kind is a guard surface enrolled in `GUARD_SURFACES`; the member probed is `claimSweep`; the four sites are what the probe returns, not what I remembered.

```
$ rg -n 'id: "claimSweep"|^  claimSweep:|"tests/specLint/claimSweepNumeric\.test\.ts"|s\.id === "claimSweep"' \
    tests/mutation/source/registry.ts tests/mutation/source/expectedLedgerKinds.ts \
    tests/mutation/_metaPremiseContract.test.ts tests/mutation/_metaClaimSweepSuiteDerivation.test.ts
tests/mutation/source/registry.ts:1178:    id: "claimSweep",
tests/mutation/source/registry.ts:1181:      "tests/specLint/claimSweepNumeric.test.ts",
tests/mutation/source/expectedLedgerKinds.ts:150:  claimSweep: { equivalent: 7 },
tests/mutation/_metaPremiseContract.test.ts:37:  "tests/specLint/claimSweepNumeric.test.ts": 3,
tests/mutation/_metaClaimSweepSuiteDerivation.test.ts:31:const surface = GUARD_SURFACES.find((s) => s.id === "claimSweep");
```

| Site | This arc's edit | Task |
| --- | --- | --- |
| `tests/mutation/source/registry.ts` | add the `acCoverage` row | 11 |
| `tests/mutation/source/expectedLedgerKinds.ts` | add the `acCoverage` key | 11 |
| `tests/mutation/_metaPremiseContract.test.ts` | add one row per enrolled suite, counts MEASURED | 11 |
| the `acCoverageSuiteDerivation` meta-test | **CREATE**, modelled on the `claimSweep` sibling | 11 |

The fourth site is a file this arc CREATES, which is why round 2 could not find a destination for it: the plan promised a bidirectional derivation assertion and named nowhere for it to live.

## 6. Tasks

**Order is a dependency, and round 1 found it stated backwards.** Every task from 3 onward consumes the injected view, so the view's TYPE and a test-side builder land in Task 1, before anything that reads one. The ADAPTER wiring is Task 7 and depends on nothing below it; the suites construct views directly, which is what spec §8.3 says they do. Nothing in Tasks 2-6 waits on Task 7.

<!-- tasks: depth=2 red-contract -->

## Task 1 — the view type, a test-side builder, and the module skeleton

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Adds `"acCoverage"` to the `Check` union at `lib/specLint/types.ts:2` and to the exported `CHECK_ORDER` array at `lib/specLint/types.ts:33`, because the module below emits `check: "acCoverage"` and cannot typecheck without them. Creates the `AcBlocks` view type in `lib/specLint/types.ts` (an ordered list of `html` and `table` blocks, each cell carrying its rendered text and its `inlineCode` values), a test-side builder in `tests/specLint/acCoverageView.ts` that parses real markdown with remark into that shape, and `lib/specLint/acCoverage.ts` exporting `checkAcCoverage(blocks, kind)` returning `[]`.

The builder lives under `tests/` deliberately: a suite may import remark, the pure core may not, and putting it here means Tasks 2-6 can feed the arm real documents without waiting for the adapter.

remark under this repo's vitest config is PROVEN, not assumed: `tests/docs/agentsHeavyPhaseRule.test.ts` imports it and passes 68 tests, run at plan time.

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
**`blocksFrom` is ONE function, and it lives on the adapter side at `scripts/lib/acCoverageBlocks.ts`.** The builder must not be a second implementation — two builders drift, which is spec §8.3's argument one level down — so the adapter and the suites call the same one, and `tests/specLint/acCoverageView.ts` is a thin re-export plus a `viewOf(text)` convenience. It sits under `scripts/` and not in the pure core because it takes an mdast `Root`, and even `import type { Root } from "mdast"` is a third-party specifier that Task 8's guard would otherwise have to exempt. Keeping it out means the guard stays absolute. `AcBlocks` in `lib/specLint/types.ts` is plain interfaces with no mdast types at all.

Both halves are established convention rather than invention: tests already import from `scripts/` (five from `scripts/spec-lint` alone), `scripts/lib/` already holds TypeScript modules, and nothing under `lib/` imports a type from a third-party package today.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverage.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts:240` why=`checkAcCoverage is a stub returning [], so the first declaration assertion fails on the arm's output rather than on module resolution` ac=AC-4 -->

## Task 2 — the live-corpus zero case, authored BEFORE declaration discovery

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Creates `tests/specLint/acCoverageCorpus.test.ts`. Walks `docs/superpowers/plans/` from disk, builds a view per document, and asserts the arm contributes zero findings to every document carrying no declaration. Carries a `premise` that the walk found more than 30 documents, stated unconditionally relative to what it guards and never inside a `.each` callback, so an empty walk cannot report a pass.

The bound is DERIVED and its failure direction is loud: `find docs/superpowers/plans -name '*.md' | wc -l` returns 695 today, so 30 is a floor with roughly 23x headroom, and it can only ever fail by the walk collapsing — which is exactly the degenerate case the premise exists to catch. A too-SMALL floor here cannot pass silently, because the assertion it guards is the presence of a population, not its size.

**Authored here and not later, because later it cannot go red** (round-1 finding 2). Its discriminating case plants a declaration into a copy of a walked document and asserts the finding count MOVES. Once Task 3 lands declaration discovery that case passes, so the red must be observed now, while nothing reads a declaration at all.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts:118` why=`no branch reads a declaration, so the planted-declaration case sees the same zero count as the unplanted one and the assertion that the count moves fails` ac=AC-3 -->

## Task 3 — declaration grammar and table binding

`readDeclaredTables` lands: the declaration grammar, the binding rule (a declaration governs the next `table` block PROVIDED no other declaration lies between them), the column-count check, the empty-table advisory, and the non-plan advisory. A document may carry several declarations, each governing its own table; one corpus plan already does.

**This task hand-rolls no markdown grammar** (spec §8.3). It reads the view, so pipes, escapes, whitespace, backslash parity and cell boundaries appear nowhere in this module. Task 2's planted-declaration case goes green here.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverage.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts:118` why=`readDeclaredTables does not exist, so no declaration-level code is emitted and the catalog-completeness check has nothing to range over` ac=AC-4,AC-13,AC-14 -->

## Task 4 — incident replay, which is arm (a)'s red

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Creates `tests/specLint/acCoverageIncidents.test.ts`. The historical AC tables of spec §1.2 are checked in as literal fixture text and parsed through Task 1's builder, so the suite is hermetic and cannot be voided by history rewriting. Expected: 4 / 1 / 0 / 0 hard, with the per-blob accounting spec §4 states — three of r2 F4's four, plus r3 F5's instance, and AC-12 an accepted miss under L-1.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts:60` why=`commandSpansOf does not exist, so the arm emits zero hard findings against fixtures that must produce four` ac=AC-6 -->

## Task 5 — arm (a), the hard cell checks

`commandSpansOf` and the two hard codes, plus `acCommandPlan` emitting one `AcCommandEntry { line, spanIndex, command }` per COMMAND-CARRYING span. A span carries a command only when its trimmed content is neither empty nor beginning with `#`. Task 4's suite goes green here.

Four pre-dispatch mutants, run and recorded in the commit, for each string-presence assertion: the value emptied; the value with an appended suffix; the value present but not live; each discriminating parameter varied in turn.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverage.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts:211` why=`acCommandPlan does not exist, so no cell is parse-checked and neither the comment-only case nor the later-span unparsable case draws anything` ac=AC-1,AC-2 -->

## Task 6 — arm (b), and all nine plants

`AC_COMMAND_PIN_UNOBSERVED`. Candidates come from the row's other cells via one path-shaped regex, each handed to `classifySpan` for the verdict. Fires when the pin occurs at a LEXICAL PATH BOUNDARY nowhere in the command cell's span text.

Adds all NINE plants of spec §5, seven of which are reviewer probes kept as regression cases. Each plant carries a `premiseHolds` proven on that case's OWN inputs, stating that the unplanted form of the same fixture scores zero. Two plants are repairs rather than additions and say so inline: (c2) mirrors (c)'s span ordering, and (f) plants prose as well as removing the leading pipe.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverage.test.ts` red-state=authored red-target=`lib/specLint/acCoverage.ts:314` why=`no branch emits AC_COMMAND_PIN_UNOBSERVED, so a tests/-rooted pin the command cannot reach draws nothing, while a components/ pin, an appended character and a prepended segment must each keep drawing exactly what the accept-set says` ac=AC-5,AC-7 -->

## Task 7 — the adapter: remark, the view, the AC spawn loop, and the CLI

`scripts/spec-lint.ts` gains the remark parse (`remark().use(remarkGfm)`, the pattern at `lib/reviewRounds/filing.ts:60`), the view it injects, and a SECOND spawn loop for the AC plan keyed by `(line, spanIndex)`. `lib/specLint/run.ts` gains the import, the entry in its `Record<Check, number>` ordering map at `lib/specLint/run.ts:44`, and the invocation.

**There are TWO `CHECK_ORDER`s and round 4 caught the plan naming one.** Adding a `Check` touches FOUR sites, derived by probing `claimSweep` rather than recalled:

```
$ git grep -n -E '"claimSweep"|claimSweep:' -- lib/specLint/types.ts lib/specLint/run.ts tests/specLint/cli.test.ts
lib/specLint/types.ts:10:  | "claimSweep";          <- the Check union
lib/specLint/types.ts:41:  "claimSweep",            <- the exported CHECK_ORDER array (render order)
lib/specLint/run.ts:52:  claimSweep: 7,            <- the Record<Check, number> ordering map
tests/specLint/cli.test.ts:1229: expect(CHECK_ORDER).toContain("claimSweep");
```

Three of the four are COMPILE-enforced and cannot be forgotten silently: the union is the declaration, the array is pinned by `_ChecksAreOrdered` at `lib/specLint/types.ts:45`, and the map is a `Record<Check, number>` whose missing key is a type error. The fourth is a test that must be extended. Tasks 1 and 7 split them: the union and the array land in Task 1 with the module that emits the check, the ordering map lands here with the invocation.

**`pnpm typecheck` is an explicit step of this task, not an afterthought.** Vitest strips types, so all three compile-enforced sites can be missing while every task-level `pnpm vitest run` passes, and the omission surfaces only at typecheck or in CI. That is exactly the consequence round 4 named.

**`runLint`'s parameter list is a KNOWN collision site and the new parameter goes LAST.** `lib/specLint/run.ts:105-112` carries the history in a comment: two arms once appended to the same slot on their own branches, and the one that had not yet merged is the one that moved. Measured at plan time by AST walk, because round-3 finding 2 caught the first attempt mixing textual occurrences with call expressions and undercounting by three:

```
$ node -e '<ts.createSourceFile over lib/ scripts/ tests/; count CallExpressions named runLint>'
textual occurrences: 23 across 9 files
AST call expressions: 22 across 8 files
calls passing MORE than two arguments: 17
```

**22 call expressions across 8 files, 17 of them passing more than two arguments.** The textual count is 23 because it also matches the `export function runLint(` definition, and the ninth file is `lib/specLint/run.ts` itself, which declares rather than calls. The arm therefore takes ONE new trailing parameter, not two — `acCoverage?: { blocks: AcBlocks; parse: AcParseResults | null } | null` — because two slots double the collision surface against any sibling arc doing this in the same week.

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
The `CHECK_ORDER` entry is compiler-enforced (`lib/specLint/types.ts:45`); the `runLint` invocation is not, and that is the half this task's red pins. `tests/specLint/acCoverageCli.test.ts` runs the CLI over a document with a prose cell and asserts both that the finding appears in the rendered report and that the process exits 1 — the exact defect `lib/specLint/types.ts:12-33` records for `claimSweep`.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverageCli.test.ts` red-state=authored red-target=`lib/specLint/run.ts:47` why=`CHECK_ORDER carries no acCoverage entry and runLint never calls the arm, so the CLI renders nothing and exits 0 on a document with a prose command cell` ac=AC-8 -->

## Task 8 — the pure core admits no third-party import

Round-1 finding 3: AC-15 was claimed by two commands that cannot enforce it. `tests/specLint/_metaPureCore.test.ts:15` forbids exactly three `node:` modules, so a direct `remark` import in the arm passes it, and the CLI suite checks rendering rather than imports. The settled adapter/core boundary (spec §8.3) had no guard at all.

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
This task EXTENDS that walker with a second assertion: every import specifier in `lib/specLint/**` is relative. The guard is green the moment it is authored, so the red is PLANTED — add a `remark` import to `lib/specLint/acCoverage.ts`, observe the new assertion fail, remove it — and both directions land in the commit.

<!-- task: red=`pnpm vitest run tests/specLint/_metaPureCore.test.ts` red-state=authored red-target=`tests/specLint/_metaPureCore.test.ts:15` why=`FORBIDDEN matches only node:fs, node:child_process and node:process, so the planted remark import in the arm passes every existing assertion and the new relative-import assertion is the only thing that can fail` ac=AC-15 -->

## Task 9 — the `--` repair to the shared shell seam

One token at `scripts/spec-lint.ts:902`. Tested in both directions: a command beginning with `-` no longer reports unparsable, and a genuinely malformed command still does. `red-state` is `authored` and not `live`, because the suite passes today (88 tests, run at plan time) and the failing case is one this task writes.

<!-- task: red=`pnpm vitest run tests/specLint/redExec.test.ts` red-state=authored red-target=`scripts/spec-lint.ts:902` why=`the spawnSync("sh", …) parse invocation passes no --, so sh reads a command beginning with a dash as an option and exits 2, which the arm reports as a syntax error` ac=AC-2 -->

## Task 10 — the fixture declares

Adds the one declaration line above the AC coverage table in `docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md`, and adds the case to the corpus suite that both declaring plans report zero. Sweep B is re-run and its output pasted into the commit.

<!-- task: red=`pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` red-state=authored red-target=`docs/superpowers/plans/2026-08-21-pane-compaction-send-authorization.md:363` why=`this line was the table's header row with no declaration above it, so the arm read nothing here and the two-declaring-plans assertion found one; the declaration that closed the red now occupies this line` ac=AC-10 -->

## Task 11 — mutation enrolment and the scored run

Adds the registry row, the `EXPECTED_LEDGER_KINDS` entry, and the `_metaPremiseContract` rows, then runs the score under `pnpm heavy`, coordinated with the orchestrator so only one fleet-wide score runs at a time.

**`EXPECTED_LEDGER_KINDS` is a THIRD registry and round 1 found it missing** (finding 4). `tests/mutation/_metaLedgerKindsDeclarationParity.test.ts:94` asserts SET EQUALITY in both directions between its keys and `GUARD_SURFACES` ids, so a new surface without an entry fails and a stale entry for a deleted surface fails too. Probing `claimSweep` shows the full fan-out for this artifact kind: the mutation registry, `EXPECTED_LEDGER_KINDS`, the premise-count map, and a suite-derivation meta-test.

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
`suitePaths` is DERIVED as every `tests/specLint/acCoverage*.test.ts`, and the derivation is asserted in BOTH directions by a file this task CREATES: `tests/mutation/_metaAcCoverageSuiteDerivation.test.ts`. The list EQUALS the glob (containment either way alone passes a phantom path or a dropped suite), and no file importing the module sits outside the glob. It is named outside its own glob deliberately, following its `claimSweep` sibling, because otherwise it would match its own rule and have to enrol itself while deciding nothing about the surface.

Without that file the enrolment is a promise: four suites score, a fifth added later is silently unscored, and nothing reds. Round-2 finding 2 is that the plan asserted the derivation and gave it no destination. `EXPECTED_ENV_TOUCHING` (`tests/mutation/_metaPremiseContract.test.ts:37`) declares a per-suite count MEASURED against this tree, and the scanner reads the test BODY, so each environment-touching case carries its OWN premise naming that case's population — binding on Task 2's corpus walk and Task 10's fixture case, both of which read from disk.

The scored run is SLOT-TURN PREFLIGHTED before it queues: the invocation is derived from the `package.json` script definition so every `VAR=value` prefix survives, and it is proved cold in a dry mode first.

<!-- task: red=`pnpm vitest run tests/mutation/_metaLedgerKindsDeclarationParity.test.ts` red-state=authored red-target=`tests/mutation/source/expectedLedgerKinds.ts:24` why=`EXPECTED_LEDGER_KINDS has no acCoverage key, so the set-equality assertion against GUARD_SURFACES ids fails the moment the registry row lands` ac=AC-11 -->

## Task 12 — re-point every invalidated citation, by reading

<!-- spec-lint: ignore — created by this plan's implementation; not yet tracked -->
Task 1 tracked `lib/specLint/acCoverage.ts`, so the path-only citations counted in §3 are now hard `RED_TARGET_INVALID`. Re-point each to `path:line`, and verify by READING the cited line and matching it against the symbol its `why=` names. Fill the anchor table's HEAD column, INCLUDING this task's own row. Confirming a citation resolves establishes nothing.

<!-- task: red=`pnpm spec:lint docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md` red-state=authored red-target=`lib/specLint/redContract.ts:169` why=`the tracked-path-only branch reports "is tracked; cite the defective line instead of the bare path" once Task 1 lands, so this plan fails its own lint until every citation is re-pointed` ac=AC-12 -->

<!-- tasks: end -->

## 7. AC coverage

**AC-9 is claimed by no task marker, deliberately, and it is the ONLY one.** Fourteen of the spec's fifteen criteria are claimed by an `ac=` field below. Round-1 finding 5 caught this paragraph claiming thirteen criteria and one exception while AC-14 and AC-15 were silently unowned; both are now claimed, by Tasks 3 and 8.

AC-9 (`lib/specLint/**` imports no `node:fs`, `node:child_process` or `node:process`) is discharged by a STANDING GATE that predates this arc: the walker at `tests/specLint/_metaPureCore.test.ts:11` puts the new module in its population the moment it exists. It has no task and no red BY DESIGN — a guard that passes the moment it is authored is rejected by the red contract, and manufacturing a red would mean deliberately shipping an impure module first.

**AC-15 is the neighbouring criterion and it is NOT discharged that way**, which is round-1 finding 3 and worth keeping distinct: no third-party import in the pure core is a DIFFERENT claim from no `node:` I/O, the existing walker asserts only the second, and Task 8 adds the first with a planted `remark` import as its red. Verified mechanically at plan time: the whole `Object.keys` of the spec's criteria minus the markers' `ac=` union is exactly `{AC-9}`.


This plan declares its own AC coverage table, so the arm's second live customer is this arc's own plan. The declaration is the one this arc ships.

<!-- ac-coverage: command-col=3 -->

| AC | Proved by | Producing command |
| --- | --- | --- |
| AC-1 (prose command cell is a hard finding, and so is a cell whose only spans are comment-only) | Task 5 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-2 (EVERY non-blank span must parse, in EITHER order; a leading-dash command is not misreported) | Task 5 + Task 9 | `pnpm vitest run tests/specLint/acCoverage.test.ts tests/specLint/redExec.test.ts` |
| AC-3 (an undeclared table draws nothing, over the whole walked corpus) | Task 2 | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-4 (malformed, table-less, out-of-range, empty-table and not-a-plan declarations each draw their own code) | Task 1 + Task 3 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-5 (a `tests/`-rooted pin the command cannot reach advises; a source-file pin does not; neither an appended character nor a prepended path segment satisfies the path-boundary match) | Task 6 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-6 (the four historical blobs score 4/1/0/0 hard) | Task 4 | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-7 (plant-both: each of the NINE plants moves the criterion for the reason it names, each correct form does not) | Task 6, with the `premiseHolds` pin in the `acCoverageIncidents` suite | `pnpm vitest run tests/specLint/acCoverageIncidents.test.ts` |
| AC-8 (the arm reaches the CLI's rendered report and its exit code) | Task 7 | `pnpm vitest run tests/specLint/acCoverageCli.test.ts tests/specLint/cli.test.ts` |
| AC-9 (the `acCoverage` module stays pure) | the existing recursive walker | `pnpm vitest run tests/specLint/_metaPureCore.test.ts` |
| AC-10 (the fixture plan declares, and the arm reports zero over it) | Task 10 | `pnpm vitest run tests/specLint/acCoverageCorpus.test.ts` |
| AC-11 (mutation score at or above the registry floor, unaccepted survivors empty) | Task 11 | `pnpm heavy pnpm mutation:guards` |
| AC-12 (every `red-target=` resolves AND its cited line matches the symbol its `why=` names) | Task 12, verified by reading, not by the citation resolving | `pnpm spec:lint docs/superpowers/plans/2026-08-25-planlint-ac-command-observability.md` |
| AC-13 (every code named anywhere in the spec is in its section 8.2 catalog, and vice versa) | Task 3 | `pnpm vitest run tests/specLint/acCoverage.test.ts` |
| AC-14 (the arm hand-rolls no markdown grammar: a row without a leading pipe, a doubled backslash before a pipe, and a span crossing a cell boundary all behave as remark parses them) | Task 3, with plants (f) and (g) | `pnpm vitest run tests/specLint/acCoverage.test.ts tests/specLint/acCoverageIncidents.test.ts` |
| AC-15 (`lib/specLint/` gains no third-party import; the adapter parses and injects) | Task 8 | `pnpm vitest run tests/specLint/_metaPureCore.test.ts tests/specLint/acCoverageCli.test.ts` |
