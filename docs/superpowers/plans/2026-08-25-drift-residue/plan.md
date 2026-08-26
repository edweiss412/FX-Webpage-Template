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

<!-- tasks: depth=2 red-contract -->

## Task 1 — widen the server-time guard by direct render import, repair the survivor, waive the twelve

<!-- task: red=`pnpm vitest run tests/help/_metaServerTimeGuard.test.ts` red-state=authored red-target=`tests/help/_metaServerTimeGuard.test.ts:12` why=`discoverScanRoots seeds its population with new Set(["components"]) plus manifest-derived app/<segment> roots at tests/help/_metaServerTimeGuard.test.ts:12, so lib/** is never walked and a new case asserting the computed file population CONTAINS lib/admin/loadAppEvents.ts fails until the import-derived widening lands` ac=AC-1.1,AC-1.2,AC-1.3,AC-1.4,AC-1.5,AC-1.6 -->

**What is red and why.** New cases assert the guard's computed file population contains `lib/admin/loadAppEvents.ts`. On the live tree the population is `components` plus manifest-derived `app/<segment>` roots (`tests/help/_metaServerTimeGuard.test.ts:11-38`), so `lib/**` is absent and the containment case fails.

**Acceptance criteria.**

- AC-1.1: the computed population CONTAINS `lib/admin/loadAppEvents.ts`, asserted by direct containment on the file list. Not by a root count: the existing case at `tests/help/_metaServerTimeGuard.test.ts:115` counts roots and passes over an empty widening.
- AC-1.2: two premises via `tests/_shared/premise.ts` — the derived `lib/**` population is non-empty, and it contains the survivor. Without these, a widening whose resolver returns nothing passes unconditionally forever.
- AC-1.3: `resolveSpecifier` is exported from `tests/help/_renderFaultScan.ts` and its own cases live in this suite: a `@/`-aliased specifier resolves to a path ending `lib/time/now.ts`, a relative specifier resolves against the importing file's directory, and a bare package specifier (`react`) plus an unresolvable specifier each return `null`. Derived from the tree, not hardcoded.
- AC-1.4: the violation list is empty.
- AC-1.5: `lib/admin/loadAppEvents.ts:45` reads its instant from `lib/time/now.ts` and carries no waiver. It is genuinely render-side: `app/admin/dev/telemetry/page.tsx` imports it (`app/admin/dev/telemetry/page.tsx:6`) and awaits it during SSR (`app/admin/dev/telemetry/page.tsx:30`), and that page already calls `nowDate()` itself (`app/admin/dev/telemetry/page.tsx:27`), so the repair follows a pattern the caller has established.
- AC-1.6: exactly 12 new `// not-render-side:` waivers, each naming one of three reason families — mutation write timestamp, dependency-injection default on a non-render path, CLI read-path window. Asserted as a count derived from the diff, not a hardcoded site list.

**Failure mode this catches.** A widening that resolves nothing, or reaches `lib/**` but drops the survivor's importer, would leave the guard green over the same blind population it has today. AC-1.1 names the survivor; AC-1.2 makes the premise executable.

**Derivation, not a directory.** The population becomes the existing root walk PLUS every `lib/**` module those files import DIRECTLY at runtime. Type-only edges are excluded: `import type` declarations, and named-import groups where every specifier is `isTypeOnly()` with no default and no namespace binding. A type edge is erased at build and carries no render.

**Why depth 1 and not the transitive closure.** Measured: depth 1 is 211 `lib/**` files and 13 true violations; unbounded is 396 and 31; the whole directory is 532 and 55. All three reach the survivor. Probed 2026-08-25: every one of the 18 violations unbounded depth adds sits in a module whose only `app/` importers are under `app/api/**` route handlers or cron paths, and `grep -rl` over `app/` and `components/` returns no render-side importer for any of them. The one `components/` hit is a comment at `components/admin/undoAnnounceContext.ts:34`, not an import.

**RED.** Add the containment case, the two premises, the four resolver cases, and the waiver-count case. Run the command; observe containment failing.

**GREEN.** Export `resolveSpecifier` from `tests/help/_renderFaultScan.ts:83`. Add the import-derived `lib/**` population to the guard's file list. Repair `lib/admin/loadAppEvents.ts:45`. Add the 12 waivers.

**Verify.** `pnpm vitest run tests/help/_metaServerTimeGuard.test.ts tests/help/_metaRenderFaultMarking.test.ts` green, then `pnpm heavy pnpm vitest run tests/help` green.

**Commit.** `test(help): widen the server-time guard population by direct render import`

## Task 2 — pin the ternary decline and make every document that claims coverage tell the truth

<!-- task: red=`pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` red-state=authored red-target=`tests/help/_renderFaultScan.ts:749` why=`the ConditionalExpression arm's standing comment states 714 ternaries and 91 on a fault-vocabulary guard at tests/help/_renderFaultScan.ts:749, and the live tree computes 719 and 79, so a new case asserting the documented numbers equal the computed ones fails until the comment is restated` ac=AC-2.1,AC-2.2,AC-2.3,AC-2.4 -->

**What is red and why.** A new case computes the two populations the arm's comment declares and asserts the comment's own numbers match. The comment says 714 and 91 (`tests/help/_renderFaultScan.ts:749`); the live tree computes 719 and 79, so the case fails.

**Acceptance criteria.**

- AC-2.1: the numbers written at the arm equal the numbers computed from the live tree — JSX-bearing ternaries under the derived roots, and unclassified ones carrying a fault-vocabulary guard.
- AC-2.2: the re-file trigger is computed, not promised. The count of server-component ternaries that are unclassified, fault-vocabulary AND not already registered is asserted `<= 7`, its resting value today, with NO unstated exclusion. Spec round 2 caught an earlier draft at `<= 3`, which discounted four emptiness checks by a rule the assertion never applied and was tripped the moment it was written. The four are named in the comment as why the resting value is 7 rather than 3.
- AC-2.3: the arm keeps its bare `continue`. `classifyExpression` gains no grammar case and no `whenFalse` arm is added, asserted by the candidate set carrying no `unknown`-form entry originating in a `ConditionalExpression`.
- AC-2.4: none of the four normative coverage claims in the prior design still asserts coverage of every JSX-returning fault branch. Verified by re-reading each of the four, not by grepping for a phrase.

**Failure mode this catches.** The documented limit going stale, which is what happened to the 714/91 figures in eight days, and the decline silently becoming wrong if the server-side population grows.

**Anti-tautology note.** AC-2.1 does not assert "the comment exists". It re-derives both numbers and compares, so a comment edited without a re-probe fails.

**RED.** Add the cases for AC-2.1, AC-2.2 and AC-2.3. Run; observe AC-2.1 failing on 714 against 719.

**GREEN.** Three edits, all consequences of one decision.

1. Restate the arm's comment at `tests/help/_renderFaultScan.ts:744-753` with the live numbers, the 70-of-79 client-side split, and the trigger at 7. Correct the stale scanner citation there and at `tests/help/_metaRenderFaultMarking.test.ts:57` to line 754.
2. Add the live numbers and the trigger to the prior design's COVERAGE limit — `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md` section 8, the item beginning "Layer 1 covers branches that directly return JSX". Not the geometry-refusal limit in that same section, which is about attribution; spec round 4 caught an earlier draft sending it there, and that section's list is labelled 1, 2, 3, 5, 4 in source order, so a bare number is an unreliable address.
3. Qualify the four normative coverage claims in that design — `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md:143`, `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md:233`, `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md:245-246` and `docs/superpowers/specs/ci/2026-08-22-screenshots-drift-degraded-render-design.md:260` — to the `IfStatement`, `CaseClause` and `CatchClause` arms, each naming the `ConditionalExpression` arm's silent drop. Spec round 5's finding: a ternary whose `whenTrue` is JSX directly returns JSX and is reachable from the manifest, so "covers every JSX-returning fault branch" and "never silently dropped" are false at HEAD and would stay false with the row archived.

**Verify.** `pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` green, and `rg -n '_renderFaultScan\.ts:[0-9]+'` returns only live line numbers.

**Commit.** `test(help): pin the ternary residue decline with computed numbers`

## Task 3 — re-key the residue registry so every declared cause is computed

<!-- task: red=`pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts` red-state=authored red-target=`tests/help/_metaRenderFaultMarking.test.ts:68` why=`FLAG_RESIDUE is declared Record<string, string> at tests/help/_metaRenderFaultMarking.test.ts:68 with the cause carried only in prose, so a new case reading each entry's declared cause field and comparing it to a cause derived from the AST fails until the typed re-key lands` ac=AC-3.1,AC-3.2,AC-3.3,AC-3.4,AC-3.5 -->

**What is red and why.** New cases read a `cause` field off each residue entry and compare it to a cause derived from the node at the entry's line. `FLAG_RESIDUE` is `Record<string, string>` (`tests/help/_metaRenderFaultMarking.test.ts:68`); there is no `cause` field, so the cases fail.

**Acceptance criteria.**

- AC-3.1: the registry is renamed `UNREACHED_RESIDUE`, each entry declares `cause: "unreached-no-ternary" | "unreached-ternary"`, and entries are keyed `file:line:flag`.
- AC-3.2: ONE derivation function returns exactly one cause per site, and the suite asserts the declared cause EQUALS the derived one. Mutual exclusivity is by construction, not by independent predicates agreeing.
- AC-3.3: `unreached-no-ternary` requires BOTH conjuncts — no `ConditionalExpression` begins at the entry's line AND `scanCandidates()` reports no candidate at that line. The structural half alone would label `components/admin/settings/AdministratorsSection.tsx:54`, a reached and marked `IfStatement` candidate, unreached (spec round 3). The candidate half alone accepted all four ternary entries (spec round 2). Only the conjunction establishes unreachedness.
- AC-3.4: `unreached-ternary` requires a `ConditionalExpression` at the line AND `classifyExpression` returning `null` for its condition. The count of entries whose declared cause is false is 0, computed.
- AC-3.5: the `OnboardingWizard` entry's citation is corrected. It names line 818, which at HEAD is a JSX attribute-list close; the ternary opens at `components/admin/OnboardingWizard.tsx:803` and `<OperatorErrorBlock />` renders at `components/admin/OnboardingWizard.tsx:828`. Spec round 3 swept every live file-and-line citation in the registry and reports this as the only false one.

**Failure mode this catches.** The exact defect the row is about: four of seven entries filed under a cause they do not have, in a registry read as settled. Prose cannot fail; a derivation compared against a declaration can.

**Which arm holds the fault is not asserted, deliberately.** No AST predicate decides it without a fault oracle the scanner does not have. `OnboardingWizard`'s false-arm blind spot stays in that entry's prose. A true statement no checker can settle belongs in prose, and inventing a checker for it is the recognizer growth this arc is directed away from.

**RED.** Add the cases for AC-3.1 to AC-3.5. Run; observe the missing `cause` field.

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

**Last commit before the merge.** Per invariant 12 the markers come off in the PR's last commit, never a post-merge one, and a graduating row's marker comes off in the same commit that archives it.

**Content.** Move all three rows to `BACKLOG-archive.md` with their measured numbers: 55 to 13 on the server-time population with 1 repair and 12 waivers; 719 / 79 / 70 / 9 on the ternary decline plus the trigger at 7; 8 records across both triggers, 4 `cpuModel` values, no reproducing run, on the screenshots row. Correct the stale scanner citation in the residue row's archived text to line 754. The screenshots row's archive entry cites the spec's per-run table rather than restating aggregates. File no new row.

**Ledger arithmetic, not a text merge.** Open becomes main's open minus these three; the archive becomes the exact union. Assert zero rows appear in both sets and zero are lost, cutting each row heading-to-any-next-heading.

**Verify.** `pnpm heavy pnpm vitest run tests/docs` green — the ledger meta-tests check that archives hold no in-flight work and that no marker survives.

**Commit.** `docs(ledger): archive the three drift-residue rows with their measured numbers`

<!-- tasks: end -->

## Close-out

- `impeccable-gate: N/A — no UI surface`
- Whole-diff Codex review at `--stage diff` to APPROVE, cap four rounds, reporting at four.
- Real CI green on all twelve required checks by name, then READINESS to `bl-orch` at `wY:p8`. The arc does not merge.
