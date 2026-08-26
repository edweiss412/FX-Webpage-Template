<!-- spec-lint: not-ui — no rendered surface changes; the components/ and app/ paths named are guard POPULATION, never edited. -->

# Plan — drift residue: reach the survivor, decline the fallback, report the population

**Spec:** `docs/superpowers/specs/ci/2026-08-25-drift-residue-design.md` · **Branch:** `fix/screenshots-drift-residue` · **Date:** 2026-08-25

Five tasks, one commit each, TDD per invariant 1. Tasks 1 to 3 carry a red-then-green contract on the same command. Tasks 4 and 5 are documentation and ledger work with no executable red; they sit in their own region rather than being given a manufactured assertion, because a guard that greps prose is the process-guard growth this arc is directed away from.

**The specifier resolver does not get its own task.** An earlier draft split "export the resolver" from "use it", with the resolver's cases in a new suite. Exporting one function in service of the widening that needs it is not a task, and `pnpm spec:lint` will not accept a `red=` naming a file the task has yet to create. The resolver's cases live in the guard's own suite, next to the premise they support.

## Resolved scope — do not relitigate

Carried from spec section 1.6. No new `BL-`/`DEF-` row of any facing. Narrowing under recurrence, never recognizer growth. The screenshots row's own fence stands. The already-repaired Dashboard prose is not a finding. The 2026-08-24 class-sweep exception (c) notes are history.

The spec closed at the round cap with 11 findings repaired across four counted rounds; its filing is `docs/review-rounds/fix/screenshots-drift-residue/d04d6370985f.md`. Decisions ratified there — depth 1, the two-cause taxonomy, the `<= 7` trigger, the UNTESTED screenshots reading — are settled and are not re-opened by this plan.

## Preconditions

- Worktree `/Users/ericweiss/FX-worktrees/driftresidue`, `pnpm install` + `pnpm worktree:link-env` + `pnpm preflight` done at Stage 0. `origin/main` absorbed at `e381de76e`.
- Directory-scoped vitest runs are heavy phases. Every command below naming a DIRECTORY runs under `pnpm heavy`; an explicit FILE list runs unwrapped.
- Never `git add -A` while a suite runs: `tests/specLint/cli.test.ts` writes scratch inside the tracked fixture tree during a full run. Stage explicit paths only.
- No file under `components/` or `app/` outside `app/api/**` is edited, so `impeccable-gate: N/A — no UI surface`.
- `scripts/capture-render-fault.ts` is not touched, so the enrolled mutation score at `tests/mutation/source/registry.ts:177-191` is untouched and needs no re-run.

## Task order, and which orderings are forced

Stated because two of the five are load-bearing and a plan that leaves them implicit invites the wrong sequence.

- **Task 2 before task 3 — FORCED.** They share a red command. Task 2 greens `tests/help/_metaRenderFaultMarking.test.ts`; task 3's missing `cause` field re-reddens it. Reversed, task 3's GREEN would leave task 2 with no observable red on that command.
- **Task 5 before the whole-diff review — FORCED**, for the reason argued at task 5.
- **Task 1 before task 3 — NOT forced, but preferred.** Task 3's derivation uses `scanCandidates()`, which does not depend on task 1's export; the numbering follows the spec's section order rather than a dependency. Task 1 does extend `resolveSpecifier`, and AC-1.3b asserts that extension leaves the scanner's candidate set unmoved, so running task 1 first means task 3 derives against a candidate set already proven stable.
- **Task 4 is independent** of all four others and may land anywhere before the review.

<!-- tasks: depth=2 red-contract -->

## Task 1 — widen the server-time guard by direct render import, repair the survivor, waive the twelve

<!-- task: red=`pnpm vitest run tests/help/_metaServerTimeGuard.test.ts` red-state=authored red-target=`tests/help/_metaServerTimeGuard.test.ts:12` why=`discoverScanRoots seeds its population with new Set(["components"]) plus manifest-derived app/<segment> roots at tests/help/_metaServerTimeGuard.test.ts:12, so lib/** is never walked and a new case asserting the computed file population CONTAINS lib/admin/loadAppEvents.ts fails until the import-derived widening lands` ac=AC-1.1,AC-1.2,AC-1.3,AC-1.3a,AC-1.3b,AC-1.4,AC-1.5,AC-1.6 -->

**What is red and why.** New cases assert the guard's computed file population contains `lib/admin/loadAppEvents.ts`. On the live tree the population is `components` plus manifest-derived `app/<segment>` roots (`tests/help/_metaServerTimeGuard.test.ts:11-38`), so `lib/**` is absent and the containment case fails.

**Acceptance criteria.**

- AC-1.1: the computed population CONTAINS `lib/admin/loadAppEvents.ts`, asserted by direct containment on the file list. Not by a root count: the existing case at `tests/help/_metaServerTimeGuard.test.ts:115` counts roots and passes over an empty widening.
- AC-1.2: two premises via `tests/_shared/premise.ts` — the derived `lib/**` population is non-empty, and it contains the survivor. Without these, a widening whose resolver returns nothing passes unconditionally forever.
- AC-1.3: `resolveSpecifier` is exported from `tests/help/_renderFaultScan.ts` and EXTENDED to resolve directory-index imports, trying an index file under the resolved base directory after the two plain extensions it tries today. Its cases live in this suite: a `@/`-aliased specifier resolves to a path ending `lib/time/now.ts`; a directory specifier resolves to its `index.ts`; a relative specifier resolves against the importing file's directory; a bare package specifier (`react`) and an unresolvable specifier each return `null`. Derived from the tree, not hardcoded.
- AC-1.3a: the derived `lib/**` population has exactly 211 members, and both `lib/log/index.ts` and `lib/parser/index.ts` are among them.

**Why the resolver needs extending, measured.** Plan review round 2 probed the shipped resolver against TypeScript's own resolution over the same runtime imports: 209 files against 211. The shipped loop tries only the two plain extensions (`tests/help/_renderFaultScan.ts:92`), and five live imports in the scan roots go through a directory index — four of `@/lib/log` and one of `@/lib/parser`, where only `lib/log/index.ts` and `lib/parser/index.ts` exist. Neither missed module holds a time violation, so the count of 13 is unaffected, but AC-1.1 and AC-1.2 would both pass over a population two files smaller than the one the spec's ladder measured. A guard reporting clean over a population smaller than the one it claims is the defect this arc exists to close, so the count is asserted directly rather than left implied.

- AC-1.3b: extending the resolver does not move the render-fault scanner. `scanCandidates()` returns the same candidate count and the same `file:line` set as before the change, and `tests/help/_metaRenderFaultMarking.test.ts` stays green. Index resolution can only ADD resolutions, and the scanner uses the resolver for two cross-file hops, so a changed candidate set would mean the scanner had been silently missing a predicate — worth knowing either way, and not something to discover after the fact.

**AC-1.3 and AC-1.3b are jointly satisfiable, probed rather than assumed.** Round 3 blocked task 3 on two criteria that could not both hold, so the same question was put to this pair before it could repeat: the scanner was run against a copy of itself carrying the extended resolution loop, and both produce 35 candidates with identical `file:line:form:marked` sets — no candidate appears in one and not the other. The extension is therefore inert for the scanner on the current corpus, which is what AC-1.3b pins going forward.
- AC-1.4: the violation list is empty. This assertion is green in the wrong direction on its own — a population that collapsed to nothing also has no violations — which is precisely why AC-1.2's two premises are not optional decoration. The pair is the assertion; neither half stands alone.
- AC-1.5: `lib/admin/loadAppEvents.ts` is REPAIRED, not waived, and the assertion is site-bound rather than count-bound: the file contains no forbidden-pattern occurrence at all, it imports from `lib/time/now`, and it appears in NO waived-site set. It is genuinely render-side — `app/admin/dev/telemetry/page.tsx` imports it (`app/admin/dev/telemetry/page.tsx:6`) and awaits it during SSR (`app/admin/dev/telemetry/page.tsx:30`), and that page already calls `nowDate()` itself (`app/admin/dev/telemetry/page.tsx:27`), so the repair follows a pattern its own caller established.
- AC-1.6: the set of WAIVED sites inside the derived `lib/**` population equals exactly the twelve expected sites, asserted as a set of `path:line` against a registry constant, and each site's waiver comment is READ AT THAT LINE and matched to the reason family the site is registered under. Reading the comment at the coordinate is what verifies the coordinate: a registry row whose line has drifted has no waiver comment there and fails, rather than being trusted. Not a count, and not a diff.

**Why a registry and not a count, and not a diff.** Plan review round 1 refuted both weaker forms. A diff-derived count has no durable base: a three-dot range against the main branch yields 12 on this PR and 0 the moment it merges, so the shipped assertion either breaks or stops proving anything. A bare count of 12 passes when a contributor repairs any one of the thirteen violations and waives the survivor instead — the guard reports empty while AC-1.5 is violated, which is the exact defect this row exists to close. Checking only that a comment names one of three families likewise accepts a family copied onto the wrong site. The set-plus-family registry binds each waiver to its site and its reason, and a thirteenth waiver appearing anywhere in the derived population fails loudly, which is the correct outcome: a new render-side waiver deserves review.

**Failure mode this catches.** A widening that resolves nothing, or reaches `lib/**` but drops the survivor's importer, would leave the guard green over the same blind population it has today. AC-1.1 names the survivor; AC-1.2 makes the premise executable.

**Derivation, not a directory.** The population becomes the existing root walk PLUS every `lib/**` module those files import DIRECTLY at runtime. Type-only edges are excluded: `import type` declarations, and named-import groups where every specifier is `isTypeOnly()` with no default and no namespace binding. A type edge is erased at build and carries no render.

**Why depth 1 and not the transitive closure.** Measured: depth 1 is 211 `lib/**` files and 13 true violations; unbounded is 396 and 31; the whole directory is 532 and 55. All three reach the survivor. Probed 2026-08-25: every one of the 18 violations unbounded depth adds sits in a module whose only `app/` importers are under `app/api/**` route handlers or cron paths, and `grep -rl` over `app/` and `components/` returns no render-side importer for any of them. The one `components/` hit is a comment at `components/admin/undoAnnounceContext.ts:34`, not an import.

**RED.** Add the containment case, the two premises, the four resolver cases, and the waiver-count case. Run the command; observe containment failing.

**GREEN.** Export `resolveSpecifier` from `tests/help/_renderFaultScan.ts:83` and add the two index extensions to its resolution loop. Add the import-derived `lib/**` population to the guard's file list. Repair `lib/admin/loadAppEvents.ts:45`. Add the 12 waivers.

**Verify.** `pnpm vitest run tests/help/_metaServerTimeGuard.test.ts tests/help/_metaRenderFaultMarking.test.ts` green, then `pnpm heavy pnpm vitest run tests/help` green.

**Commit.** `test(help): widen the server-time guard population by direct render import`

## Task 2 — pin the ternary decline and make every document that claims coverage tell the truth

<!-- task: red=`pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` red-state=authored red-target=`tests/help/_renderFaultScan.ts:749` why=`the ConditionalExpression arm's standing comment states 714 ternaries and 91 on a fault-vocabulary guard at tests/help/_renderFaultScan.ts:749, and the live tree computes 719 and 79, so a new case asserting the documented numbers equal the computed ones fails until the comment is restated` ac=AC-2.1,AC-2.2,AC-2.3,AC-2.4 -->

**What is red and why.** A new case computes the two populations the arm's comment declares and asserts the comment's own numbers match. The comment says 714 and 91 (`tests/help/_renderFaultScan.ts:749`); the live tree computes 719 and 79, so the case fails.

**Acceptance criteria.**

- AC-2.1: the numbers written at the arm equal the numbers computed from the live tree — JSX-bearing ternaries under the derived roots, and unclassified ones carrying a fault-vocabulary guard.
- AC-2.2: the re-file trigger is computed, not promised. The count of server-component ternaries that are unclassified, fault-vocabulary AND not already registered is asserted `<= 7`, its resting value today, with NO unstated exclusion. Spec round 2 caught an earlier draft at `<= 3`, which discounted four emptiness checks by a rule the assertion never applied and was tripped the moment it was written. The four are named in the comment as why the resting value is 7 rather than 3.

**Documented limit of AC-2.2, stated so it is not re-raised as a finding.** A bound on a COUNT does not pin site identity: swapping a registered site for a new one leaves the count at 7 and passes. That is deliberate. This trigger asks one question — has the unreached server-side population grown — and a count is the right instrument for it. Binding site identity here would mean a second registry over a population this arc has just declined to enumerate, which is the guard growth the narrowing rule forbids. Site identity IS pinned where it matters, in task 3's registry, for the entries that carry a declared cause.
- AC-2.3: the arm keeps its bare `continue`, asserted POSITIVELY on the sites the decline is about: `classifyExpression` still returns `null` for each of the four registered ternary conditions, and `scanCandidates()` reports no candidate of ANY form at those lines.

**Why positively, and not by the absence of an `unknown` entry.** Plan review round 1 built a live mutant against `components/admin/Dashboard.tsx:858` showing the weaker form is green in both directions: today the site yields no candidate at all, and if a contributor teaches `classifyExpression` to recognise `result.ignoredDegraded` the site becomes an ACCEPTED candidate rather than an `unknown` one — so "no `unknown` originates from a ternary" holds before and after exactly the growth it claims to forbid. Asserting `classifyExpression(condition) === null` per registered site detects that growth on the first site it reaches.
- AC-2.4: none of the four normative coverage claims in the prior design still asserts coverage of every JSX-returning fault branch. Verified by re-reading each of the four, not by grepping for a phrase.

**Failure mode this catches.** The documented limit going stale, which is what happened to the 714/91 figures in eight days, and the decline silently becoming wrong if the server-side population grows.

**Anti-tautology note.** AC-2.1 does not assert "the comment exists". It re-derives both numbers and compares, so a comment edited without a re-probe fails.

**RED.** Add the cases for AC-2.1, AC-2.2 and AC-2.3. Run; observe AC-2.1 failing on 714 against 719.

**GREEN.** Three edits, all consequences of one decision.

1. Restate the arm's comment at `tests/help/_renderFaultScan.ts:744-753` with the live numbers, the 70-of-79 client-side split, and the trigger at 7. Correct the stale scanner citation at ALL THREE live sites in the same commit — here, at `tests/help/_metaRenderFaultMarking.test.ts:57`, and in the `BACKLOG.md` row at `BACKLOG.md:54` — to line 754. Plan review round 1 caught an earlier draft leaving the backlog hit for task 5, which made this task's own global sweep depend on a later task; the class-sweep default repairs every instance of one shape in one commit anyway.
2. Add the live numbers and the trigger to the prior design's COVERAGE limit — `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md` section 8, the item beginning "Layer 1 covers branches that directly return JSX". Not the geometry-refusal limit in that same section, which is about attribution; spec round 4 caught an earlier draft sending it there, and that section's list is labelled 1, 2, 3, 5, 4 in source order, so a bare number is an unreliable address.
3. Qualify the four normative coverage claims in that design — `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md:143`, `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md:233`, `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md:245-246` and `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md:260` — to the `IfStatement`, `CaseClause` and `CatchClause` arms, each naming the `ConditionalExpression` arm's silent drop. Spec round 5's finding: a ternary whose `whenTrue` is JSX directly returns JSX and is reachable from the manifest, so "covers every JSX-returning fault branch" and "never silently dropped" are false at HEAD and would stay false with the row archived.

**Verify.** `pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` green, and `rg -n '_renderFaultScan\.ts:[0-9]+'` returns only live line numbers.

**Commit.** `test(help): pin the ternary residue decline with computed numbers`

## Task 3 — re-key the residue registry so every declared cause is computed

<!-- task: red=`pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` red-state=authored red-target=`tests/help/_metaRenderFaultMarking.test.ts:68` why=`FLAG_RESIDUE is declared Record<string, string> at tests/help/_metaRenderFaultMarking.test.ts:68 with the cause carried only in prose, so a new case reading each entry's declared cause field and comparing it to a cause derived from the AST fails until the typed re-key lands` ac=AC-3.1,AC-3.2,AC-3.3,AC-3.4,AC-3.5,AC-3.6,AC-3.7 -->

**What is red and why.** New cases read a `cause` field off each residue entry and compare it to a cause derived from the node at the entry's line. `FLAG_RESIDUE` is `Record<string, string>` (`tests/help/_metaRenderFaultMarking.test.ts:68`); there is no `cause` field, so the cases fail.

**Acceptance criteria.**

- AC-3.1: the registry is renamed `UNREACHED_RESIDUE`, each entry declares `cause: "unreached-no-ternary" | "unreached-ternary"`, and entries are keyed `file:line:flag`.
- AC-3.2: ONE derivation function returns exactly one cause per site, and the suite asserts the declared cause EQUALS the derived one. Mutual exclusivity is by construction, not by independent predicates agreeing.
- AC-3.3: `unreached-no-ternary` requires BOTH conjuncts — no `ConditionalExpression` begins at the entry's line AND `scanCandidates()` reports no candidate at that line. The structural half alone would label `components/admin/settings/AdministratorsSection.tsx:54`, a reached and marked `IfStatement` candidate, unreached (spec round 3). The candidate half alone accepted all four ternary entries (spec round 2). Only the conjunction establishes unreachedness.
- AC-3.4: `unreached-ternary` requires a `ConditionalExpression` at the line AND `classifyExpression` returning `null` for its condition. The count of entries whose declared cause is false is 0, computed.
- AC-3.5: each entry's KEY is verified, not trusted, and the verification is PER CAUSE, because the two causes put their line at different kinds of node. Each half asserts UNIQUENESS within the file rather than mere existence, so an ambiguous coordinate fails instead of resolving to whichever node happens to match first.
  - **`unreached-ternary`:** the line is the start of a `ConditionalExpression` whose node text mentions the flag identifier, and it is the ONLY ternary in that file satisfying all three of — no candidate reported at its line, JSX in either arm, node text mentions the flag. Probed on the live corpus: exactly one qualifying ternary for each of the four entries. Text-mention alone is NOT sufficient and was measured so: `dataGapsDegraded` appears in three of `components/admin/Dashboard.tsx`'s ternaries (lines 492, 495 and 674), and only the conjunction with the cause predicates picks out 674.
  - **`unreached-no-ternary`:** the line DECLARES the flag identifier — a variable, parameter, binding element or property declaration whose name is the flag's last dotted segment — and it is the only such declaration in the file. Probed: `unavailable` declares once at line 101, `isInfra` once at line 230, `inOnboarding` once at line 130, so those are the registered lines.

**Why per cause, and why the previous single rule was unsatisfiable.** Plan review round 1 caught the line being trusted at all. Round 2 caught the text-match repair still admitting several live lines per flag, and the fix swung to requiring a DECLARATION at the line. Round 3 blocked on the consequence: a ternary entry's line is the ternary's start, where the flag is USED, so requiring a declaration there made AC-3.4 and AC-3.5 mutually unsatisfiable for all four ternary entries — the task could never reach green. The live coordinates are simply different kinds of node per cause (`components/admin/Dashboard.tsx` declares at 92, 95, 489 and 491 and renders its ternaries at 674 and 858), so one uniform rule cannot fit both. Splitting the contract by cause dissolves the contradiction without weakening either half, and asserting uniqueness is what makes each half stronger than the text match it replaces.

- AC-3.6: the derivation's two predicates are SEPARATELY ADDRESSABLE functions, each conjunct pinned by its own control, and no control iterates a hand-written parallel list. Two controls are derived from `scanCandidates()`; the no-ternary control is derived from the registry's own keys filtered by the AST, because a ternary entry is by definition NOT a candidate and so cannot come from the candidate set. Whole-diff review round 2 caught both the earlier 'exported' wording, which is meaningless for a test-local function, and a parallel literal list of the four ternary sites that could drift from the registry it was meant to check. Asserting only the combined function's output cannot distinguish a missing conjunct from a lucky branch order.
  - **candidate-absence conjunct:** any candidate the scanner reports at a line where no `ConditionalExpression` begins — an `IfStatement`, `CaseClause` or `CatchClause` candidate such as `components/admin/settings/AdministratorsSection.tsx:54` — must make `isUnreachedNoTernary` FALSE.
  - **no-ternary conjunct:** each of the four registered ternary sites must make `isUnreachedNoTernary` FALSE. Round 2 showed this conjunct was entirely unpinned: a derivation reading `if (conditional && classifyExpression(...) === null) return "unreached-ternary"; if (!candidate) return "unreached-no-ternary";` omits the explicit no-ternary test, routes all seven entries correctly by branch order alone, and passed both previously-proposed controls.
  - **`classifyExpression === null` conjunct:** any candidate whose form is not `unknown` and which originates at a `ConditionalExpression` must make `isUnreachedTernary` FALSE.

- AC-3.7: the `OnboardingWizard` entry's citation is corrected. It names line 818, which at HEAD is a JSX attribute-list close; the ternary opens at `components/admin/OnboardingWizard.tsx:803` and `<OperatorErrorBlock />` renders at `components/admin/OnboardingWizard.tsx:828`. Spec review round 3 swept every live file-and-line citation in the registry and reports this as the only false one.

**Failure mode this catches.** The exact defect the row is about: four of seven entries filed under a cause they do not have, in a registry read as settled. Prose cannot fail; a derivation compared against a declaration can.

**Which arm holds the fault is not asserted, deliberately.** No AST predicate decides it without a fault oracle the scanner does not have. `OnboardingWizard`'s false-arm blind spot stays in that entry's prose. A true statement no checker can settle belongs in prose, and inventing a checker for it is the recognizer growth this arc is directed away from.

**RED.** Add the cases for AC-3.1 to AC-3.7. Run; observe the missing `cause` field.

**GREEN.** Re-key the registry. Preserve every prose reason, correcting only the `OnboardingWizard` citation. Update the docblock with the live numbers and the trigger from Task 2.

**Verify.** `pnpm heavy pnpm vitest run tests/help` green.

**Commit.** `test(help): re-key the residue registry so every declared cause is computed`

<!-- tasks: end -->

<!-- tasks: depth=2 -->

## Task 4 — write the population comparison into the workflow header

<!-- task: red=`pnpm exec prettier --check .github/workflows/screenshots-drift.yml` ac=AC-4.1 -->

**AC-4.1:** the header carries the dated paragraph, the conclusion in its decline form, and the re-file trigger in its reachable form, and the workflow still parses and passes formatting.

**No executable red, deliberately.** The deliverable is a dated prose record in `.github/workflows/screenshots-drift.yml`'s header. A test that greps prose for a date and a keyword catches an authoring slip nobody has made and mints a guard surface this arc is directed not to add. The gate is review plus the numbers being reproducible from the table the spec now carries.

**Content.** A dated 2026-08-25 paragraph stating: 8 evidence records, 6 `pull_request` and 2 `workflow_dispatch`, against the brief's minimum of 4 with at least 2 per trigger; 4 distinct `cpuModel` values; `runnerArch` X64, `runnerOs` Linux and `cpuCount` 4 uniform across all 8; `dashboard-overview/light`, the identity that drifted on 2026-08-18, holding one hash on every record across all four CPU models and both triggers; the 6 `crew-preview-*` identities splitting by head branch, with two CPU models on both sides of that split; and zero cases of `pixelSha256` moving while the source tree held still.

**Conclusion, and it is a decline rather than a clearance.** No record in the population reproduces the drift, so eight passing runs say nothing about the failing case and the comparison the row schedules cannot be built from them. The runner reading is UNTESTED, not negative, and the trigger hypothesis is likewise untested rather than refuted; spec round 3 caught an earlier draft claiming both as refutations. The pin is extended to nothing. No screenshots repair, no perceptual-tolerance comparator, per the row's own fence.

**Re-file trigger, in the header.** The next drift-check FAILURE, whose uploaded record is the reproducing sample this population lacks. An earlier draft made it "a record showing two `pixelSha256` values for one identity", which cannot occur: a record holds one entry per identity and `scripts/verify-capture-evidence.ts` rejects duplicates. Spec round 3 caught it against a real record.

**The header cites the spec's per-run table rather than restating aggregates.** Artifacts carry `retention-days: 7` (`.github/workflows/screenshots-drift.yml:202`) and the evidence record is never committed, so within a week the runner associations are unrecoverable from GitHub. Section 1.5 of the spec is the durable copy.

**Verify.** `pnpm exec prettier --check .github/workflows/screenshots-drift.yml`, and the workflow still parses.

**Commit.** `docs(ci): record the screenshots-drift runner population comparison`

## Task 5 — archive the three rows and take the in-progress markers off

<!-- task: red=`pnpm heavy pnpm vitest run tests/docs` ac=AC-5.1 -->

**AC-5.1:** all three rows are in `BACKLOG-archive.md` with their measured numbers, no `IN PROGRESS` marker for this branch survives anywhere in the ledger, zero rows appear in both the open and archived sets, and zero rows are lost.

**This task runs BEFORE the whole-diff review, and the ordering is forced by two rules that first look like they conflict.**

Invariant 12 puts the marker removal in the PR's last commit, and archives categorically reject in-progress entries, so a graduating row's marker comes off in the very commit that archives it. Round 1 of the plan review read that as "archive after the review". Round 2 showed where that lands: `docs/agents/writing-plans.md:30` requires that "the diff the final review round examined must be the diff that merges", and an archive commit added after approval means the review never saw the archive contents, the ledger arithmetic, or the marker removal — the whole of spec AC-8.

The rules are reconcilable because they protect different things and one of them binds a different moment. Invariant 12's harm is a stale marker REACHING MAIN; "last commit" is the means, not the end. The reviewed-diff rule binds the FINAL round, not every round. So: this task lands before the diff review, the marker comes off in the commit that archives, and it never goes back on. If a review round produces repairs, those are ordinary commits on top and the next round re-reviews the complete diff — which is exactly how the final round ends up examining what merges. Nothing this arc pushes ever carries an in-progress marker into main, and nothing merges unreviewed.

**Content.** Move all three rows to `BACKLOG-archive.md` with their measured numbers: 55 to 13 on the server-time population with 1 repair and 12 waivers; 719 / 79 / 70 / 9 on the ternary decline plus the trigger at 7; 8 records across both triggers, 4 `cpuModel` values, no reproducing run, on the screenshots row. The screenshots row's archive entry cites the spec's per-run table rather than restating aggregates. File no new row.

**Ledger arithmetic, not a text merge.** Open becomes main's open minus these three; the archive becomes the exact union. Assert zero rows appear in both sets and zero are lost, cutting each row heading-to-any-next-heading.

**Verify.** `pnpm heavy pnpm vitest run tests/docs` green — the ledger meta-tests check that archives hold no in-flight work and that no marker survives.

**Commit.** `docs(ledger): archive the three drift-residue rows with their measured numbers`

<!-- tasks: end -->

## Close-out

- `impeccable-gate: N/A — no UI surface`
- Whole-diff Codex review at `--stage diff` to APPROVE, cap four rounds, reporting at four. The reviewed diff includes task 5, so the final round examines what merges.
- Real CI green on all twelve required checks by name, then READINESS to `bl-orch` at `wY:p8`. The arc does not merge.
