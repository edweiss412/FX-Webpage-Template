# LIMITS.md — parked mechanizable classes (LIM- index)

A `LIM-<UPPER-KEBAB>` slug is a stable name for a mechanizable defect class that a review-round filing named and then parked without minting a `BL-`/`DEF-` row, under the 2026-08-04 filing bar, the 2026-08-18 mint bar, or the 2026-08-25 process mint freeze. This index retro-covers the parked classes identified so far; it is advisory, makes no completeness claim, and a parked class missing here gains a section when next named. The filings that named the classes are immutable evidence and are never edited to add a slug; new filings cite a slug inline in their `declined:` entries. The recurrence check for any class is `rg "LIM-<NAME>" docs/review-rounds`. The round-economy gate ignores this file: per the README.md contract, a non-`<baseSha12>` markdown file in this tree is prose, not a tracked filing.

Sections are ordered by how many distinct arcs have named the class, descending. Filing paths are repo relative under `docs/review-rounds/`, stage in parens.

## LIM-AUTHORED-RED

**Shape:** A declared `red=` that cannot be red for its stated reason, and nothing executes it to find out: a new killing case that passes against clean production the moment it is written, a red satisfied by an unresolved import or by a surface an earlier task creates, or a red that already exits zero at the merge base. Parts of collectability are mechanized in `lib/specLint/redContract.ts` (collection probes over eligible markers of both states, with findings such as `RED_COLLECTS_NOTHING` and `RED_SUITE_UNCOLLECTED`, and `--exec-red` execution of eligible live reds; eligibility rules and per-state finding routing live in that file). What remains parked is truth of the red itself: a collectable red that already passes at the merge base, or a new killing case green against clean production the moment it is written.

**Named by:** 6 arcs — docs/quick-wins-2-specs/97e179d831aa.md (plan), feat/planlint-declared-limit-pin-collision/03953337388b.md (spec), fix/replacement-string-class-sweep/bcd3d088ec76.md (plan), feat/review-modal-strip-dock/d4cd838727a3.md (plan), fix/mutation-gate-fidelity/75b8f7a3ec76.md (plan), feat/nearmiss-surface/b30413cf5e51.md (plan)

**Owning record:** the out-of-scope fence in docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md (mechanizing existence-of-declaration is that arm; truth-of-claim is not), plus this index

**Re-file trigger (narrowed 2026-08-28):** a product-facing arc measurably blocked by a red that could not fire, **plus an observable that is not the red command's exit status at the merge base** — that one is measured and refuted above, and re-filing it costs another arc for the same answer. A candidate observable must separate honest authoring from the defect on evidence available before the task's test is written; if the proposal is base execution in any form, it is already answered.

**Filed 2026-08-27** as `BL-SPECLINT-RED-TRUTH-PROBE` (owner-directed; incident: `fix/mi11-removal-fallback-live-row` plan round 1). **DEMOTED BACK HERE 2026-08-28** (`feat/speclint-red-truth-probe`) on measurement, before anything was built. The full write-up is the archive entry; the part that matters for anyone meeting this shape again:

- **The incident pair is not a known-positive for base execution.** Three of that plan's six authored reds exit 0 at its merge base `fb464274`, including Task 1, which drew neither finding and whose red the round-1 repair left untouched; the other three exit 1 naming no test files. The rule fires on three markers to catch two, on the very plan the row named as its proof. The two real defects were "a mismatch between where the test writes state and where the code reads it", both living inside a test the task had not written yet, so nothing at the base can see them. The arc's own filing says they "took a reviewer tracing a data path".
- **Exit status cannot carry the signal.** A `red=` naming only an absent file exits 1; the same command with one existing file added exits 0 and silently swallows the absent path; a `-t` matching no case exits 0 with everything skipped. Honest authoring and the defect produce the same exit code in both the path form and the case form.
- **Neither scoping has a population worth firing on.** File-level would fire on 139 of 309 authored markers, almost all of them in merged, review-approved plans (the census reports file existence only; it does not inspect authoring quality). Case-level covers the 23 markers carrying `-t`; the 9 whose file exists at base were each run there and every one matched no case. Zero true positives corpus-wide.
- **Executed-case count, the only observable that separates them, is independently retired** by `BL-SPECLINT-RED-REASON-VERIFICATION`: a module-scope `premise()` failure reports zero cases while an assertion failed, and a `beforeEach` throw reports failed entries whose bodies never ran.

Reproduce the populations with `python3 scripts/probe/red-truth-census.py`.

## LIM-NUMERIC-TABLE-PROVENANCE

**Shape:** A numeric table or blast-radius transcript stated in a spec with no command producing it, so nothing can compare the table to the tree: `spec:lint` parses numerics and parses fenced commands without relating them, and a hand-maintained transcript of a command's output drifts in every direction. The sibling form is a plan that quotes a command's output without that command being re-run (a claimed 106 enrolled plans where the quoted command returns 108).

**Named by:** 4 arcs — fix/mutation-shard-budget-six/9a621a5792ea.md (spec), feat/review-modal-strip-dock/ae8e9544b55a.md (spec, its second candidate; that arc's repair deleted the transcript outright), feat/speclint-ac-unclaimed-arm/44b0d74b1107.md (plan, its third shape), fix/severityless-warning-filters/b608e71b32b5.md (diff; the published SQL could not produce the published table, and a bare `group by` dropped an empty population). **Trigger FIRED at the fourth naming; filed as `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` under the process freeze's `recurrence` exception.**

**Owning record:** none — this index is the record

**Re-file trigger:** "a spec whose stated table cannot be reproduced from its own commands reaching a review round again" (mutation-shard-budget-six filing)

## LIM-EXPECT-N-COMMENT

**Shape:** A plan command whose stated expectation is not enforced by its exit status: a `# expect 0` comment beside a `grep -c` that prints and moves on, a deliberately red proof whose nonzero exit is masked by a pipe, or a measurement selector that can print nothing and exit zero.

**Named by:** 2 arcs — fix/premisescan-registrar-accept-sets/0820436cf4dd.md (plan), ci/app-e2e-batch2/0ba72c23774f.md (plan)

**Owning record:** none — this index is the record (the premisescan filing recorded it as that surface's documented limit)

**Re-file trigger:** the premisescan filing stated "if a second arc burns review rounds on this class, it has an incident and it should be filed then"; the app-e2e-batch2 filing (2026-08-22) is arguably that second arc, so the trigger may already be met

**Filed 2026-08-27** as `BL-SPECLINT-EXPECT-N-EXIT-STATUS` (owner-directed; incident: `fix/fitwithinclip-stale-clip-subscription` plan round 2).

**MECHANIZED 2026-08-28** by `feat/speclint-expect-n-exit-status` (`docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md`): the `# expect N` and Playwright zero-collection shapes are `EXPECT_N_UNENFORCED` and `PLAYWRIGHT_COLLECTS_NOTHING` in `lib/specLint/expectContract.ts`. The unmechanized residue (non-integer expectations, integer-plus-trailing-prose, whole-line comments, `--project` filtering, continuation and multi-invocation declines) is parked in that spec's §7 documented limits with per-limit re-file triggers; truth-of-claim stays `BL-SPECLINT-RED-TRUTH-PROBE`.

## LIM-TASK-MENTION-RESOLUTION

**Shape:** An intra-document task or step reference left stale by a restructure: a `Task <n>` mention that resolves to no `## Task <n>` heading (or a checklist naming a `red-state=live` marker the plan does not contain), and the sibling form, a `Step <n>` reference invalidated by renumbering. `spec:lint` already parses task topology and compares nothing.

**Named by:** 2 arcs — fix/mutation-shard-budget-six/9a621a5792ea.md (plan), test/execution-methods-driver-derived/119895a7c756.md (plan)

**Owning record:** none — this index is the record

**Re-file trigger:** "a fourth arc losing a round to a stale intra-document task reference" (mutation-shard-budget-six filing); the execution-methods filing wants a frequency probe of step-renumbering repairs first

## LIM-RECOGNIZER-ACCEPT-SET-PARITY

**Shape:** A recognizer's accept-set disagreeing with its peers or its consumers, and nothing in the tree compares them: `lexShellWords` classified `<(` and `>(` as executing while `foreignConstructEnd` did not delegate on them (both literal opener tables in one file, so the comparison is derivable, with a load-bearing exclusion for `doubleQuotedEnd`), and widening `REGISTRARS` adopted nothing because the walk dispatches on the root by name, so the added member was recognized and then dropped.

**Named by:** 2 arcs — fix/shell-brace-cross-construct/d4324ba0a269.md (diff, its second, unlanded arm), fix/premisescan-registrar-accept-sets/c80f844278bd.md (spec)

**Owning record:** BL-ACCEPTSET-CONSUMER-COVERAGE (filed 2026-08-21 with mint-exception `invariant`, now in BACKLOG-archive.md); the shell-brace peer-table arm was declined under the freeze and files to its own record

**Re-file trigger:** new instances attach to the BL row's class; the shell-brace filing routes re-filing through "the trigger above" in its own text, most nearly a second surface adopting the parenthetical convention

## LIM-LINE-KEYED-SITEID

**Shape:** A registry keyed by `file:line` (accepted-survivor siteIds as `operator:line:col:text`, producer sites pinned by line) that any formatter or hoist invalidates wholesale: 37 re-keys across three score runs on one arc, two runs failing before the cause was separated from genuine gaps, and one mis-keyed row costs twice because ledgered equivalents leave the denominator. The class repair is content-keyed ids (`operator + from-text + to-text`), a redesign of a shared surface no single arc otherwise touches.

**Named by:** 3 arcs — feat/speclint-ac-unclaimed-arm/44b0d74b1107.md (diff), feat/private-image-pipeline/d2a31e4aa021.md (diff, the `alertProducerScope.registry.ts` instance: one hoisted emit invalidated 19 rows across three files), feat/wizard-review-attention-menu/66c9857f56a5.md (spec: eight line-keyed rows across `tests/styles/*` and `pageTransitions`/`step3JudgmentChrome` counts moved by a header button; the re-file trigger below has now fired)

**Owning record:** the documented-limit note at the head of `tests/mutation/source/registry.ts` (placed by the ac-unclaimed arc), plus this index

**Re-file trigger:** a third arc hitting it or a product arc blocked by it (stated in the ac-unclaimed filing)

**Fired 2026-08-27:** filed as `BL-LINE-KEYED-REGISTRY-ROWS` (BACKLOG.md, `Mint-exception: recurrence`) on the third naming, `feat/wizard-review-attention-menu`.

## LIM-PLANT-ANCHOR-UNIQUENESS

**Shape:** A mutation-plant anchor that is not unique in its file, is not a literal, or is orphaned when a repair moves the code out from under it; decidable without judgment because the harness refuses anything not occurring exactly once. The arc's in-branch repair (Form A/B rule, `--anchors` resolution in CI) covers its own corpus; the generalizing `spec:lint` arm was demoted from the ledger under the freeze.

**Named by:** 1 arc, 2 filings — fix/mutation-shard-weight-seconds/300a9f937b8a.md (plan), fix/mutation-shard-weight-seconds/d4324ba0a269.md (diff)

**Owning record:** none — this index is the record (the pre-freeze ledger row was demoted and removed)

**Re-file trigger:** a second arc burns a review round on a non-executable plant anchor, or a plant silently orphaned by a repair reaches `main` (stated in the plan filing; the diff filing adds "a second arc loses a plant to a repair")

## LIM-PLAYWRIGHT-RED-TESTMATCH

**Shape:** A playwright `red=` naming a file outside the config's testMatch alternation matches nothing and exits zero, reporting success; strictly worse than unrunnable because it fails green. One membership check per playwright red against the config it names, decidable statically. **Widened by the second arc to any DECLARED playwright command, not only a `red=` marker:** that arc's instance was a regression GATE which omitted `--config` entirely, so the default config's testMatch decided membership and collected nothing. It also measured the two sides, `Total: 0 tests in 0 files` against `Total: 34 tests in 1 file`.

**Named by:** 3 arcs — feat/review-modal-strip-dock/d4cd838727a3.md (plan), fix/fitwithinclip-stale-clip-subscription/4cb585b3508a.md (plan), perf/admin-diagram-next-image/66c9857f56a5.md (plan). At three distinct arcs the re-file trigger has fired; the freeze's admission test still governs whether anything is minted.

**Owning record:** none — this index is the record (the plan closed its own instances by hand: every playwright `red=` names its config)

**Re-file trigger:** same as LIM-AUTHORED-RED per the filing: a product-facing arc measurably blocked

## LIM-AC-PROOF-INVENTORY-DRIFT

**Shape:** A spec naming two different proof mechanisms for one acceptance criterion, the AC's proof column and the meta-test inventory disagreeing after a partial supersession, leaving an implementer free to build the mechanism that does not close the escape.

**Named by:** 1 arc — fix/mutation-gate-fidelity/75b8f7a3ec76.md (spec)

**Owning record:** none — this index is the record (the filing records it on the surface that owns it, under a no-new-rows directive)

**Re-file trigger:** named by a 3rd distinct arc

## LIM-PROBE-DOMAIN-REENUMERATION

**Shape:** A spec that declares a `PROBE DOMAIN:` and then writes acceptance criteria re-enumerating literals from it holds two lists that nothing compares; the pair drifted three times in one arc (under-covering, partial covering, then contradicting its own defense).

**Named by:** 1 arc — feat/review-modal-strip-dock/ae8e9544b55a.md (spec)

**Owning record:** none — this index is the record (the shipped repair was a criterion taxonomy, not a lint)

**Re-file trigger:** named by a 3rd distinct arc

## LIM-GUARD-FILE-TOTALITY-CLAIM

**Shape:** An unqualified totality claim ("every", "never") in a guard's own tree about a population the scanner's arms do not fully cover, sitting in a file that also declares a documented limit; the spec-prose universals arm (`lib/specLint/universals.ts`) does not reach code files.

**Named by:** 1 arc — fix/screenshots-drift-residue/9a621a5792ea.md (diff)

**Owning record:** the filing routes it to the tool's documented limits; this index adds the slug

**Re-file trigger:** named by a 3rd distinct arc

## LIM-AC-RG-SELF-MATCH

**Shape:** An acceptance criterion whose literal text matches its own declared `rg` command, so the verification command can never come back clean; the spec is its own false positive.

**Named by:** 1 arc — fix/screenshots-drift-residue/d04d6370985f.md (spec)

**Owning record:** the filing routes it to spec:lint's documented limits; this index adds the slug

**Re-file trigger:** named by a 3rd distinct arc

## LIM-CROSS-DOC-SECTION-RESOLVE

**Shape:** A `§N.M` reference into another document that resolves to a section but the wrong one; `spec:lint` validates that a cited `path:line` exists (`lib/specLint/citations.ts`) and makes no claim about cross-document section references.

**Named by:** 1 arc — fix/screenshots-drift-residue/d04d6370985f.md (spec)

**Owning record:** the filing routes it to spec:lint's documented limits; this index adds the slug

**Re-file trigger:** named by a 3rd distinct arc

## LIM-APPENDIX-SET-PARITY

**Shape:** Two parse-level set-equality checks over a plan: the `diff --git` headers inside its fenced diff blocks must equal the paths its prose cites as living in that appendix, and the set of new test files named in the meta-test inventory must equal the appendix's new-file headers and each task's GREEN and eslint commands. Both are narrowing checks over structure `lib/specLint/` already parses.

**Named by:** 1 arc — fix/rowactions-submenu-reveal-flake/d2d602588d0e.md (plan)

**Owning record:** none — this index is the record (the filing declined minting an id before the row could exist)

**Re-file trigger:** the filing stated file both under one plan-lint `BL-` id when the shape recurs on another arc

## LIM-HEADING-LIST-CARDINALITY

**Shape:** A count claim contradicted by a heading and its sub-headings rather than by an adjacent list ("the two classes that derive from it", followed by Class A, Class B and Class C); the shape `NUMERIC_NOUN_MISMATCH` exists for, in a structural position (`SIBLING_LIST_CARDINALITY`'s heading form) neither rule in `lib/specLint/numerics.ts` reaches.

**Named by:** 1 arc — fix/mutation-shard-budget-six/9a621a5792ea.md (spec, its second candidate)

**Owning record:** none — this index is the record

**Re-file trigger:** named by a 3rd distinct arc

## LIM-REGISTRY-DIGEST-STALENESS

**Shape:** A probe-backed disposition comment in the mutation registry quoting numbers with nothing tying them to the source they measured, so the comment goes stale silently when the file moves beneath it; a source digest recomputed by a meta-test is the sketched form.

**Named by:** 1 arc — fix/modal-wait-skeleton-tolerant/b24e3ac5f2d8.md (diff)

**Owning record:** none — this index is the record

**Re-file trigger:** the filing wants a survey of how many disposition comments across `tests/mutation/source/registry.ts` quote numbers at all before any design; that survey, or recurrence on another arc

## LIM-SWEEP-POSITIVE-CONTROL

**Shape:** A sweep whose conclusion is "exactly N instances" quoted without the instrument being shown finding a known member first, and still finding it after one ordinary edit to that member; two rounds each killed a spelling-list census whose instrument could not find its own known target (`(el)`, then a named callback value `ref={fitRef}` at five sites inside the arc's own probe domain).

**Named by:** 1 arc — feat/fitwithinclip-measure-class/449f29faba03.md (spec)

**Owning record:** the filing is the documented limit; the repair that held is committed at docs/superpowers/specs/2026-08-25-fitwithinclip-ref-callable-probe.mjs for reuse

**Re-file trigger:** a product arc actually blocked by an over-claiming sweep (stated in the filing)

## LIM-NONDISCRIMINATING-FIXTURE

**Shape:** An assertion whose extraction is narrower than the property in its own test name, so it passes for a reason unrelated to the behaviour: eight instances across two rounds, three proven by mutant. The general repair is to give the assertion a contest it can lose, a negative control, a premise on the fixture, or a bound derived from the same quantity the implementation uses; the sketched guard fails any case whose fixture cannot discriminate.

**Named by:** 1 arc — feat/review-modal-strip-dock/75b8f7a3ec76.md (diff)

**Owning record:** none — this index is the record (the filing notes the done condition ranges over an open space of test shapes, so it is refutable once per round forever)

**Re-file trigger:** a product-facing arc that stalls on a non-discriminating fixture it did not author (stated in the filing)

## LIM-CONTRADICTORY-SIBLING-AC

**Shape:** Two acceptance criteria on one task asserting incompatible node kinds at the same coordinate ("a `ConditionalExpression` begins here" against "a declaration is here"), so they can never both hold; statically detectable in the narrow case without executing anything, and born of an over-correcting repair.

**Named by:** 1 arc — fix/screenshots-drift-residue/e381de76ea87.md (plan)

**Owning record:** the filing routes it to spec:lint's documented limits; this index adds the slug

**Re-file trigger:** named by a 3rd distinct arc

## LIM-TOUCHED-SITE-ASSERTION

**Shape:** An assertion pinned to the identifier or location a change happened to touch rather than to the property the rule requires: a guard written as a list of members fails open on the member nobody named, and a census scoped to a container fails open outside that container (nine instances across four rounds, testid, structural set, container, then component text). The narrow mechanization is a meta-test flagging absence assertions keyed on a string literal in files whose diff deletes that literal.

**Named by:** 1 arc — fix/theme-note-polish/b30413cf5e51.md (diff)

**Owning record:** none — this index is the record (the filing records the diagnosis as a documented limit and leaves building the narrow form to the orchestrator)

**Re-file trigger:** named by a 3rd distinct arc

## LIM-RED-NAME-FILTER-SEVERITY

**Shape:** A `-t` name filter inside a `red-contract` region is a red that cannot be observed (no match is skip, exit 0), and `RED_TEST_NAME_FILTER` already fires on it at ADVISORY while the pre-dispatch gate refuses on HARD only; the advisory carries the reasoning and only the severity is wrong.

**Named by:** 1 arc — feat/speclint-ac-unclaimed-arm/44b0d74b1107.md (plan, its first shape)

**Owning record:** the filing assigns it to whoever next opens `lib/specLint/redContract.ts` with a product-facing reason; this index adds the slug

**Re-file trigger:** named by a 3rd distinct arc

## LIM-SINGLE-FILE-CORPUS-RED

**Shape:** A `red=` naming exactly one corpus-equality file cannot discriminate: an equality between a live set and a committed record is satisfied by both sides being empty and by any regression that empties both, recognisable without understanding the test (a file list of length one whose target is a corpus walk); it wants the suite that pins the producer on the same command.

**Named by:** 1 arc — feat/speclint-ac-unclaimed-arm/44b0d74b1107.md (plan, its second shape; four findings across two rounds)

**Owning record:** none — this index is the record

**Re-file trigger:** named by a 3rd distinct arc

## LIM-AFTEREACH-ASSERT-BEFORE-TEARDOWN

**Shape:** An `expect(...)` evaluated inside an `afterEach` BEFORE that hook's own teardown call. The failure aborts the hook, the teardown never runs, and the NEXT case fails for a reason that has nothing to do with it, so the corruption is not local to the failing case. Statically detectable as one AST walk over `tests/**`; the repair is uniform, tear down first and assert last on a captured copy.

**Named by:** 1 arc — fix/fitwithinclip-stale-clip-subscription/5fccaaac7804.md (diff), where it left a failing case's DOM mounted, killed the next case with `Found multiple elements`, and recorded that case as reddening a mutant it had never detected: a false certificate in the artifact the plan offers as proof

**Owning record:** none — this index is the record

**Re-file trigger:** a second arc whose recorded evidence, a mutant table or a coverage claim, is falsified by a teardown that did not run

## LIM-ADVISORY-UNDISPOSITIONED

**Shape:** A lint advisory whose reasoning is correct is dismissed as noise because nothing requires it to be dispositioned before the artifact is dispatched for review, and it returns as a paid review finding. Distinct from LIM-RED-NAME-FILTER-SEVERITY, where the advisory's severity is the defect: here the severity is arguably right, since the arm genuinely cannot tell a stale claim from a drifted line anchor, and what is missing is a dispatch-time obligation to say which it is. Repairable without a new detector: one line per advisory in the brief, saying why it is noise.

**Named by:** 1 arc — fix/fitwithinclip-stale-clip-subscription/4cb585b3508a.md (spec), where `CITATION_SYMBOL_ABSENT` named the symbol and the file in the round-1 lint output, was read as locator granularity, and came back nine minutes later as that round's fourth finding.

**Near-miss, recorded so it is not miscounted:** perf/admin-diagram-next-image/66c9857f56a5.md (plan) first claimed this slug for its stale-citation finding and then REFUTED itself by probe — restoring the stale citation left the advisory set byte-identical at 35 rows, so no advisory was ever raised and none was dismissed. That arc's instance is LIM-FOREIGN-CITATION-DRIFT. This slug's count stays at 1.

**Owning record:** none — this index is the record

**Re-file trigger:** a second measured instance of an advisory that a dispatch dismissed and a reviewer then charged as a finding

## LIM-INDEX-RESTATEMENT-DRIFT

**Shape:** Advisory index or pointer prose restating a cited artifact (an implementation file, a filing, a note) and misstating it: an overstated coverage claim, a miscounted line count, two source instances fused into one. The convention that owns this index declines any index-vs-artifact comparison lint by design, so the class is repaired by narrowing claims and citing rather than restating.

**Named by:** 1 arc — docs/lim-slug-convention/4cb585b3508a.md (diff)

**Owning record:** the no-gate fence in the README's parked-class-slugs paragraph, plus this index

**Re-file trigger:** named by a 3rd distinct arc

## LIM-GATE-EVIDENCE-SHAPE-ONLY

**Shape:** A declared gate command whose predicate tests the SHAPE of its evidence rather than its presence, so an empty or placeholder section passes. Three sub-forms, all decidable from the gate command alone: a `grep` for a heading, which the heading satisfies while the section under it reads "Pending"; a `grep` for a table pipe, which the table HEADER satisfies with no data row; and a check for the ABSENCE of a placeholder word, which an empty section satisfies vacuously. Distinct from LIM-SWEEP-POSITIVE-CONTROL, which is about a sweep's count being unverified: here the gate reports on evidence that is simply not there. The mutant-red rule for declared gate commands already prescribes the repair — probe each against a constructed failing input — so what is parked is the obligation's placement, not the technique.

**Named by:** 2 arcs — perf/admin-diagram-next-image/66c9857f56a5.md (plan), where two consecutive rounds landed on one close-out gate: the first version passed with both evidence sections reading "Pending" under real headings, and the repaired version passed on the findings table's header row; and fix/severityless-warning-filters/b608e71b32b5.md (diff), where a documented limit's re-file trigger named a condition its published query could not decide, twice in succession, the first repair still answering a different question than the trigger asked. That second naming extends the shape beyond a plan's gate command to any declared check whose command does not decide the condition its prose states.

**Owning record:** none — this index is the record (the plan closed its own instance by hand: the gate now requires a P-tier data row or an explicit no-findings sentence, and names the four checklist items the pre-code section must carry)

**Re-file trigger:** same as LIM-AUTHORED-RED: a product-facing arc measurably blocked

## LIM-FOREIGN-CITATION-DRIFT

**Shape:** A `file:line` citation into a file the branch does not own drifts onto unrelated content when the merge base moves, and NOTHING reports it — not a hard finding and not an advisory. The citation arms report only where same-line identifiers can be extracted from the citing sentence and compared against the cited file; a bare anchor (a ledger row id, a rule bullet) offers none, so the check establishes that the line is IN RANGE and never what is AT it. Same documented limit `RED_TARGET_INVALID` already carries for `red-target=`, extended to prose citations. Distinct from LIM-ADVISORY-UNDISPOSITIONED, which requires an advisory to have been raised and dismissed: here none is raised, which is why the drift survives to a paid review round.

**Named by:** 1 arc — perf/admin-diagram-next-image/66c9857f56a5.md (plan), where three citations (`BACKLOG.md`, two into `docs/agents/writing-plans.md`) drifted across two `origin/main` absorbs and were charged as round 3's finding 7. Probed: restoring the stale `BACKLOG.md:68` against the corrected `:35` leaves the advisory set byte-identical, 35 rows to 35, with no row naming the file.

**Owning record:** none — this index is the record (the arc's own repair is procedural: re-read every foreign line-form citation after the final absorb, matching each cited line to the symbol its sentence names)

**Re-file trigger:** a second arc charged a review finding for a drifted foreign citation that produced no lint signal

## LIM-HAND-LISTED-POPULATION-SET

**Shape:** A measurement whose conclusion quantifies over "every X" while the X-set is hand-listed rather than derived from an authority the tree can be asked for (`information_schema`, a registry, a filesystem walk), so each review round adds one more member and the conclusion is re-falsified rather than converging. Distinct from `LIM-SWEEP-POSITIVE-CONTROL`, which is about an instrument's sensitivity to a known member; this is about the completeness of the set the instrument is pointed at. The arc that named it had a probe over "every table holding a warning array" miss `sync_log` in one round and `pending_ingestions` in the next, and each miss looked like a fresh finding rather than one class.

**Named by:** 1 arc — fix/severityless-warning-filters/b608e71b32b5.md (diff)

**Owning record:** the filing is the documented limit; the repair that held is deriving the column set from `information_schema` and writing the re-derivation into the re-file procedure, at `docs/superpowers/specs/2026-08-27-wizard-review-attention-menu-design.md` §10.1

**Re-file trigger:** named by a 3rd distinct arc


## LIM-PROD-POSTURE-INVISIBLE-LOCALLY

**Shape:** A code path whose behavior branches on `NODE_ENV` is exercised by a test that runs green in every local run and red in CI, because the two run under different postures and nothing reports the difference. The instance: 40 sites resolve `TEST_DATABASE_URL ?? process.env.DATABASE_URL` and, when neither is set, THROW under production instead of reaching their `127.0.0.1:54322` fallback (e.g. `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:34-40`). A local Playwright run boots `pnpm dev`, where the fallback is live; a CI job boots `pnpm build && pnpm start`, where it is not (`playwright.config.ts:263-267`). So an arc that enables a test reaching such a path for the first time in a workflow that sets no DSN cannot observe the failure locally, at any number of runs. Distinct from an ordinary missing-env defect, which fails everywhere: this one fails only where nobody is looking, and the local greens actively argue against the defect existing.

**Named by:** 1 arc — fix/published-attention-resolve-red/b608e71b32b5.md (diff), where it was round 2's P1. The arc held 6 consecutive green local runs and had written into a ledger row that CI "falls through to the loopback default"; the claim and the shipping defect were one error. `.github/workflows/app-e2e.yml:176-187` already carried the corrective DSN and a comment naming the production throw, and the arc did not find it until the reviewer named the failure.

**Owning record:** none — this index is the record. The mechanizable form would relate a workflow's server-start posture to the env-gated paths its named specs can reach, which needs a reachability model no lint here has.

**Re-file trigger:** a second arc charged a review finding, or a red CI run, for a test that passes locally and fails in CI on an `NODE_ENV`-gated branch
