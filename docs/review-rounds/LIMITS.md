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

**Named by:** 11 arcs before this one, each enumerated below, and `feat/speclint-table-provenance` itself became the TWELFTH naming while declining to mechanize the class — its own census carried four wrong adjacency figures for four review rounds, inside the probe whose subject is unverifiable numbers (that arc's filing records it). The eleven are the predecessor population the measurement ranges over; twelve is the running total (the population is PRODUCED by §5 of `docs/superpowers/specs/ci/probes/2026-08-28-table-provenance-census.mts` and classified in that spec's §2 with a per-arc reason; the original count of 4 came from citations of this slug, which counts arcs that knew the slug rather than arcs that paid, and an intermediate count of 7 was a hand enumeration that omitted arcs without saying why) — fix/mutation-shard-budget-six/9a621a5792ea.md (1 round), feat/review-modal-strip-dock/ae8e9544b55a.md (3), feat/speclint-ac-unclaimed-arm/44b0d74b1107.md (1), fix/severityless-warning-filters/b608e71b32b5.md (1), fix/sync-log-show-id-duration/d2a31e4aa021.md (3), fix/shell-brace-cross-construct/50ca72a566b0.md (4), docs/quick-wins-2-specs/97e179d831aa.md (1), feat/speclint-red-reason-verification/c9c71b947a85.md (1), docs/sync-log-emit-guard-spec/fafa354accf0.md (2), fix/supabase-upstream-fault-class/d04d6370985f.md (2), fix/mutation-shard-weight-seconds/300a9f937b8a.md (1) — about **20 rounds**. **Trigger FIRED at the fourth naming; filed as `BL-SPECLINT-NUMERIC-TABLE-UNREPRODUCIBLE` under the process freeze's `recurrence` exception.**

**Owning record:** `docs/superpowers/specs/ci/2026-08-28-table-provenance.md` (measured refutation, 2026-08-28)

**MEASURED AND DECLINED 2026-08-28** by `feat/speclint-table-provenance`. The row's narrowing was a `<!-- table: cmd=`…` -->` marker checked the way `gate:` markers are. Neither arm ships, on two grounds, neither economic.

**First, structural.** The corpus had already ratified, six days earlier, that naming a producing command is not a binding (`docs/superpowers/specs/ci/probes/README.md`, `## Stating a figure`), so a table can satisfy the existence check on every line and remain exactly as drifted. Demonstrated live at `docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md:394`, which carries its producing command and states 53 where the command's comment says 56 and the command returns 55 today.

**Supporting observation (one instance, not a survey).** `docs/superpowers/plans/2026-07-20-show-scoped-alert-copy/00-plan.md:394` places its producing command directly above its table and drifted anyway, stating 53 where that command's comment says 56 and where it returns 55 today. The practice a marker would formalize does not hold the property. Two earlier framings were withdrawn under review: "zero of eleven used a pointer" (tautological — eight of eleven do relate their table to a named script or command) and "the practice is already widespread" (the records show only one cited repair explicitly placing a producer beside its table, and the census measures adjacency, not prevalence). The disposition rests on the structural argument above; that arc's spec review round 5 confirmed it survives subtracting this observation entirely.

**The economics do NOT support the declination, and the spec says so.** Correcting the naming count from 4 to 11 takes the class cost from 6 rounds to ~20; the nearest precedent (`feat/planlint-ac-command-observability`) cost 14 rounds and 37 findings, of which roughly 7 transfer. That is break-even to favourable for building, and it is reported rather than dropped.

Other measurements at `8b4d521cac00`: this corpus's two shipped opt-in doc markers have **4 live uses between them** across 3425 tables; an executing arm reaches **at most 10 of 3425** (the purity screen prints 8, and under-reports by two because it reads a command's search text as shell), and **at most 7** once three commands that produce no table are removed. That chain moved twice under review, so it is stated ONCE, in that spec's §6; this index deliberately does not restate the intermediate figures. Full disposition, documented limits and declinations in that spec §5-§9, including the one narrower candidate (row count versus live hit count) whose population is measured at ONE: four tables sit near a list-producing sweep and three have a column that is not a hit count, one of them because its rows are grouped dispositions where a single row stands for 35 files.

**Re-file trigger (narrowed 2026-08-28, superseding the original):** the original trigger, "a spec whose stated table cannot be reproduced from its own commands reaching a review round again", has now fired and been answered, so re-firing it changes nothing. What would change the answer is a population shift: **a single document accumulating four or more tables whose producing commands are pure, repo-local and inside the repo** — that takes the executable population off 8 and gives a scoped arm a subject. Secondary trigger: **`ac-coverage` reaching 15 live uses** without a lint requiring it, which would refute the adoption argument on this corpus's own evidence.

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

**Owning record:** `docs/superpowers/specs/2026-08-28-line-keyed-registry-durable-keys-design.md` §7 (the refutation record; supersedes this index as the primary), plus the documented-limit note at the head of `tests/mutation/source/registry.ts` (placed by the ac-unclaimed arc)

**Re-file trigger:** SUPERSEDED 2026-08-28. The original trigger (a third arc, or a product arc blocked) fired, `BL-LINE-KEYED-REGISTRY-ROWS` was raised, and `feat/line-keyed-registry-durable-keys` measured the class repair and refuted it: 41.5% of attributed re-keys land on rows whose anchor is site-derivable, against a 42.6% registry share, so churn is proportional and there is no pocket of value. **A further arc merely HITTING this limit is therefore no longer sufficient to re-file** — that question is settled and re-asking it costs an arc. The two arms that would change the answer are in the spec's §8: an anchor design that derives the 27 hand-authored rows, or churn concentration rising above half, re-measured. Correction carried from that arc: the class repair named above (`operator + from-text + to-text`) leaves only 28% of ledger rows uniquely resolvable, not the 45% first measured — 121 is the count of distinct scoped keys, and only 76 of 268 rows sit in a cardinality-one group. Printed by `npx tsx scripts/ledger-key-census.mts`, which IMPORTS `GUARD_SURFACES` rather than parsing it; the regex parse used first undercounted every figure (57 surfaces read as 58, 268 rows as 265).

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

## LIM-REMOVAL-ONLY-VIOLATION-SET

**Shape:** A violation inventory whose staged perturbations are uniform in DIRECTION — every one removes a carrier (a declaration, a class, a wrapper, an element) and none alters a value — so it cannot catch a criterion's value being wrong rather than absent. Distinct from LIM-SWEEP-POSITIVE-CONTROL, where the instrument was never shown to find a known member at all: here every row IS such a demonstration, which is why the gap survives a rigorous-looking table. Measured: seventeen staged violations, all removals, and a one-line `70ch` to `69ch` edit passed every one of them while moving every capped child on every help page. The mechanical form of the repair is that any criterion naming a VALUE owes two violations, one removing the carrier and one altering the value; the arc that named it also demonstrated the pair is irreducible, staging one override against both guards and observing the effect assertion red while the token pins stayed green.

**Named by:** 1 arc — fix/help-tour-grid-and-settings-card/066c034c9a3e.md (diff)

**Owning record:** the filing is the documented limit; the worked pair (token pin plus cascade-proof effect equality) is committed in `tests/help/help-prose-layer.test.ts`, `tests/help/page-tour.test.tsx` and `tests/e2e/help-tour-layout-dimensions.spec.ts`, with both staged violations transcribed in that arc's violation inventory

**Re-file trigger:** named by a 2nd distinct arc, or a product arc blocked by a wrong-value regression a removal-only inventory passed

## LIM-NONDISCRIMINATING-FIXTURE

**Shape:** An assertion whose extraction is narrower than the property in its own test name, so it passes for a reason unrelated to the behaviour: eight instances across two rounds, three proven by mutant. The general repair is to give the assertion a contest it can lose, a negative control, a premise on the fixture, or a bound derived from the same quantity the implementation uses; the sketched guard fails any case whose fixture cannot discriminate.

**Named by:** 7 arcs — feat/diagram-failure-retry/6bfb58e4f66b.md (diff: FIVE instances in one arc, and the instructive part is that not one was caught by re-reading the assertion — a `tabIndex >= 0` filter that excluded the very element under test, nine call sites passing a prop name the component does not take so it received no revision at all, four focus guards that focused a control on the item that SURVIVES while removing a different one, a modal-close test measuring mid-exit-animation state, and a hook test passing an options-object argument positionally so the override under test was never set. Two were caught by typecheck, one by the reviewer, two by negative controls. The narrow mechanizable form: an assertion that focus is not on `<body>` must also assert the previously focused node actually LEFT the document, since without that premise it passes on any test that removed the wrong element); fix/help-tour-grid-and-settings-card/066c034c9a3e.md (diff; three instances in one arc — a grid element compared to its container, an assertion sampled only where padding kept it under its own bound, and a value pin matching any integer — all three caught by staging the violation, one of them written three commits after the finding that taught the class); feat/ref-error-cell-anchors/e7751f61de2c.md (diff: a committed comparison script with no premises, so two empty sets — a missing extractor or a failed log download — would have compared equal and reported SAME inside AC-2 evidence; repaired with five per-shard premises plus a negative control proving the abort fires); feat/review-modal-strip-dock/75b8f7a3ec76.md (diff); fix/nearmiss-non-field-blocks/31beee5de40e.md (spec; an emission check reading a field the emitter does not set, so every case read "not emitted", and an injected label that was itself a corpus label and so ambiguous in nine blocks); fix/published-attention-escape-race/60dece4d5722.md (diff: four findings across three consecutive rounds, every one an assertion aimed at a branch reachable only in a state jsdom cannot stage. Its repair is the one to copy and it is not a test change: the decision moved into a pure function so the branch became reachable, after three rounds spent writing better proxies for it); fix/attention-autoopen-suppress-phone/e7751f61de2c.md (spec: seven instances across all four rounds of one stage, and the arc that extends this shape from a WRITTEN fixture to a SPECIFIED one — an oracle described in a spec fails the same way and is cheaper to fix there). The two 2026-08-27 arcs each bumped this count from 1 to 2 on the same day without seeing the other, and their edits conflicted on this line; whichever an auto-merge had taken, the number would have read 2 with three arcs listed underneath it. Recorded because this index's counts are hand-maintained and that is the shape in which they go wrong. **It has now happened three times in one day** — 2 against 2 on 2026-08-27, then 4 against 4 and 5 against 5 on 2026-08-29, each time two arcs landing different namings while both sides displayed the SAME total. The number agreeing is what makes it dangerous: an auto-merge or a hurried resolver takes one side, the count looks deliberate, and a naming is silently lost. The union is the only safe resolution on this line.

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

**Named by:** 3 arcs — docs/lim-slug-convention/4cb585b3508a.md (diff); fix/published-attention-escape-race/60dece4d5722.md (spec and plan, one arc naming it at two stages); fix/popover-clip-fit-stale-viewport/8171e7bb0103.md (diff, 2026-08-30)

**The third naming fires the default trigger, and it does not mint a row.** No product arc was blocked, so the 2026-08-25 freeze admits nothing under `invariant` or `product-blocked`; the count is recorded here so recurrence stays one grep. What that arc adds to the shape is where the class lives. Eleven of its twelve diff findings were this class, across four rounds, and sweeping every site in the cited artifact did not end it: each repair produced NEW derived prose — an index entry, a design doc's trigger, a PR body — and the next round's finding was in text that had not existed when the sweep ran. **The class lives in the derivation step, not in a location**, which is why a location sweep cannot close it and why the entry's stated repair (narrow the claim, cite rather than restate) is the one that works. The hedge is precisely the part that does not survive compression.

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

**Named by:** 2 arcs — fix/severityless-warning-filters/b608e71b32b5.md (diff), fix/local-e2e-validation-pooler/60dece4d5722.md (spec AND plan, one arc: six instances across two stages, from a guard's config-FILE set and its `@next/env` load-MODE set through four successive miscounts of the CI workflow population. Counted ONCE, per the recurrence exception's rule that one arc hitting its own limit repeatedly is that arc failing to route around a known hazard rather than evidence the hazard is general. Its repair is the one to copy: stop asserting the count, print the population with a command and assert a conclusion that holds whatever the totals are)

**Owning record:** the filing is the documented limit; the repair that held is deriving the column set from `information_schema` and writing the re-derivation into the re-file procedure, at `docs/superpowers/specs/2026-08-27-wizard-review-attention-menu-design.md` §10.1. The second naming's repair is the same move in a different medium: discover config files from disk and read the mode set off the artifact, rather than listing either.

**Re-file trigger:** named by a 3rd distinct arc. Note the second naming produced TWO instances inside one review stage, which is evidence about the class's rate rather than about its reach; the trigger stays at distinct arcs deliberately, since two axes in one arc is one author's blind spot, not a general hazard.


## LIM-PROD-POSTURE-INVISIBLE-LOCALLY

**Shape:** A code path whose behavior branches on `NODE_ENV` is exercised by a test that runs green in every local run and red in CI, because the two run under different postures and nothing reports the difference. The instance: 40 sites resolve `TEST_DATABASE_URL ?? process.env.DATABASE_URL` and, when neither is set, THROW under production instead of reaching their `127.0.0.1:54322` fallback (e.g. `app/api/admin/show/[slug]/alerts/[id]/resolve/route.ts:34-40`). A local Playwright run boots `pnpm dev`, where the fallback is live; a CI job boots `pnpm build && pnpm start`, where it is not (`playwright.config.ts:263-267`). So an arc that enables a test reaching such a path for the first time in a workflow that sets no DSN cannot observe the failure locally, at any number of runs. Distinct from an ordinary missing-env defect, which fails everywhere: this one fails only where nobody is looking, and the local greens actively argue against the defect existing.

**Named by:** 1 arc — fix/published-attention-resolve-red/b608e71b32b5.md (diff), where it was round 2's P1. The arc held 6 consecutive green local runs and had written into a ledger row that CI "falls through to the loopback default"; the claim and the shipping defect were one error. `.github/workflows/app-e2e.yml:176-187` already carried the corrective DSN and a comment naming the production throw, and the arc did not find it until the reviewer named the failure.

**Owning record:** none — this index is the record. The mechanizable form would relate a workflow's server-start posture to the env-gated paths its named specs can reach, which needs a reachability model no lint here has.

**Re-file trigger:** a second arc charged a review finding, or a red CI run, for a test that passes locally and fails in CI on an `NODE_ENV`-gated branch

## LIM-PROBE-PERTURBS-SUBJECT

**Shape:** A probe or guard whose own CONSTRUCTION changes the property it is measuring, so it decides against a subject the rule would classify differently from the one it computed its expectation against. Distinct from `LIM-NONDISCRIMINATING-FIXTURE`, where the assertion's extraction is too narrow: here the assertion is right and the subject moved under it, and the repair is an invariance assertion rather than a negative control. Measured instance: a binding probe appended a one-value-cell row to every corpus block to establish "does this block emit", which dropped each block's minimum value-cell count below the rule's threshold — 151 of 514 blocks perturbed, 18 across the decision boundary, making the criterion unsatisfiable without violating the rule it tested. The repair pads the injected row to the block's own minimum and re-derives the classification inputs FROM the constructed input, asserting they match the originals.

**Named by:** 1 arc — fix/nearmiss-non-field-blocks/31beee5de40e.md (spec)

**Owning record:** the filing is the documented limit; the shipped invariance assertion lives in docs/superpowers/specs/parser/probes/2026-08-28-nearmiss-candidacy-probe.ts (TABLE-L's third control) for reuse

**Re-file trigger:** a 3rd distinct arc naming it, or a product-facing arc blocked by a probe that moved its own subject

## LIM-UNSCORED-GUARD-OFFERED-AS-CLOSURE

**Shape:** A structural guard is built mid-arc as the closure for a recurring finding class,
presented to review as a cover, and never mutation-scored first. Its own fail-open cases then
surface as review findings — the reviewer doing by hand, at a paid round, what
`pnpm mutation:guards` does in about ninety seconds. Distinct from a guard that is simply
absent: here one exists, is asserted to close a class, and is weaker than its claim.

**Named by:** 1 arc — `feat/diagram-failure-retry/e7751f61de2c.md` (plan), where a
registry-plus-scanner built in round 2 to close a per-item-state class was found in round 4 to
miss parenthesized, `as`-cast, non-null-asserted and computed-property hook declarations, plus
a key-alias hole where two declarations sharing a name inherit one row.

**Owning record:** AGENTS.md's convergence criterion, bullet 4 — enrolment precedes review for
a guard surface — which already prescribes the fix. This slug exists so recurrence is one grep
rather than a re-derivation, not because a new rule is needed.

**Re-file trigger:** a second arc losing a review round to fail-open cases in a guard it
offered as a class closure.

## LIM-PLACEHOLDER-SNIPPET-BODY

**Shape:** A plan's fenced `ts`/`tsx` snippet carries a function or test body that is only a comment (`{ /* same shape as above */ }`, `it("...", () => { /* the two arms, verbatim */ })`). It compiles, it passes against the current tree, and a reviewer reads the test name as coverage. Decidable from the document alone: a fenced block whose statement list is empty apart from comments, or a non-void function with no `return`. Distinct from LIM-NONDISCRIMINATING-FIXTURE, where the assertion exists and is too narrow: here there is no assertion.

**Named by:** 1 arc — feat/ref-error-cell-anchors/e7751f61de2c.md (plan), four findings in one round.

**Owning record:** the anti-tautology rule in `docs/agents/writing-plans.md` (every test task states the failure mode it catches), plus this index.

**Re-file trigger:** default (three distinct arcs).
## LIM-SNIPPET-IMPORTS-UNRESOLVED

**Shape:** A plan snippet destined for an EXISTING test file uses identifiers that file does not import (`join`, `premise`, a helper from a sibling suite), and the pre-dispatch snippet typecheck, run on the snippet in a scratch harness, resolves them there and never sees the target file's import block. The RED then fails on a test-local `ReferenceError` instead of the production absence the marker names, and GREEN cannot pass. Distinct from LIM-PLACEHOLDER-SNIPPET-BODY: the code is real, its context is not.

**Named by:** 1 arc — feat/ref-error-cell-anchors/e7751f61de2c.md (plan), one finding, swept over every RED step.

**Owning record:** the snippet-typecheck sentence of `docs/agents/writing-plans.md`, plus this index. The repair that held was an explicit imports sentence at every RED step, checked against the file's current import block at HEAD.

**Re-file trigger:** default (three distinct arcs).
## LIM-CLAIM-WITHOUT-ORACLE

**Shape:** A document states a property, calls it load-bearing in as many words, and its test plan does not mention the property at all. Distinct from LIM-NONDISCRIMINATING-FIXTURE, where an assertion exists and is too weak: here there is nothing to weaken. Five instances in one spec stage, and the last one is the shape's argument for existing — the spec said explicitly that a probe must not "fix" an occlusion by re-anchoring the panel to its trigger, the source file records that exact attempt and the measured breakage it caused, and no assertion covered it, so the arc's own defect stayed reachable by a second route through a fully green suite. Not mechanizable as stated: deciding which sentences of a spec are load-bearing claims ranges over an open grammar, which is the recognizer-growth shape this repo has already measured. The repair that held is structural, an obligations table mapping every claim to the assertion that settles it, which turns the next instance into a visibly missing row rather than a paid review round.

**Named by:** 1 arc — fix/attention-autoopen-suppress-phone/e7751f61de2c.md (spec)

**Owning record:** none — this index is the record (the filing ships the structural repair in its own spec §9.3 and declines a detector)

**Re-file trigger:** named by a 3rd distinct arc

## LIM-OPTIN-GUARD-DORMANT

**Shape:** A guard arm that names the defect exists in the repo, and does not reach the author, for two reasons that compound: it fires only inside a region the document must opt into by a keyword, and inside that region it is ADVISORY, landing in a list the author has usually been told to discount as heuristic noise. The defect then costs review rounds that the existing mechanism was written to prevent, and the post-mortem reads as "we should build a guard" when the guard is already there.

**Named by:** 1 arc — fix/attention-autoopen-suppress-phone/e7751f61de2c.md (plan)

**Measured instance:** `lib/specLint/redContract.ts:259` reports `RED_CONJUNCTION` on a `red=` joined by `&&`, which is the exact shape that cost that arc's plan round 3. It never fired: the arm looks up a `contractExtents` entry and `continue`s when there is none (`lib/specLint/redContract.ts:256`), and that plan's tasks region was opened `<!-- tasks: depth=3 -->` rather than `<!-- tasks: depth=3 red-contract -->`. Had it fired, it is `advise(...)` rather than `fail(...)`, and the plan carried 22 advisories at dispatch, with its own dispatch note telling the reviewer the advisory list is a density heuristic.

**Owning record:** this index, plus the plan section of that arc's filing

**Re-file trigger:** named by a 2nd distinct arc, OR a product-facing arc measurably blocked by a defect whose arm existed and was dormant. Note what would NOT settle it: promoting every advisory to a failure trades this shape for a louder one, and the repo has already measured advisory promotion producing noise that authors route around. A candidate repair has to make opting IN the default, or make the arm's region-gating unnecessary, rather than raise its severity.

---

## LIM-E2E-SPEC-DISCOVERY-GAP

**STATUS: the headline finding was REFUTED 2026-08-30 by `test/e2e-spec-discovery-wiring`. There were never 48 dark specs. The gap was in the census, not in the specs.** The entry is kept, corrected in place rather than deleted, because the wrong version is what an unchecked census looks like and this file is where the next arc will look for the shape.

**What the original entry claimed.** That a spec matching no project's `testMatch` runs nowhere and looks exactly like a spec that passes; that nothing compares the set of spec files on disk against the set any project discovers; and, measured, that **118 spec files exist under `tests/e2e` while 70 are discovered**.

**What is actually true.** The first claim is sound and is the useful part of this entry. The second was already false when it was written. The third measured one config and reported the difference as darkness.

- **All 118 spec files are discovered.** Four configs resolve spec files here, and the original count came from `npx playwright test --list` against `playwright.config.ts` alone. The union partitions cleanly: 61 files in `playwright.config.ts` only, 42 in `tests/e2e/standalone.config.ts` only, 8 in both, 4 in `playwright.config.ts` + `playwright.screenshots.config.ts`, 2 in the screenshots config only, 1 in `tests/e2e/visual.config.ts` only, and **0 in nothing**.
- **The 42 standalone-only files were never dark.** `.github/workflows/standalone-e2e.yml:71` runs the whole standalone config on an unfiltered `pull_request` trigger, and has since `c7c5625c2` (2026-07-26).
- **Every one of the four specs this entry named as its evidence had been executing on every PR.** `step3-review-modal.layout` entered `standalone.config.ts` on 2026-07-03 (`e870595a4`), `attention-pill-focus` on 2026-07-21 (`a794c4124`), `popover-clip-fit` on 2026-08-02 (`434deaf7f`). The fourth, `attention-autoopen-suppress`, was created BY `19716fcd9` (2026-08-29), which added it to the config and regenerated the baseline in the same commit — so it ran from the moment it existed. The evidence set is 0 for 4. The first correction of this entry still allowed that one a day of darkness; that was the same one-sided reading applied to a commit nobody had opened, and diff review round 1 caught it.
- **So the sentence "that assertion has therefore never executed" was wrong for all four**, including `attention-autoopen-suppress`, which ran from the commit that created it.
- **The comparison this entry says nothing performs was already shipped.** `tests/ci/_metaSpecRegistration.test.ts:952` asserts that every test-shaped file under `tests/e2e` resolves in some config, over the same four configs, with `DARK_SPEC_ALLOWLIST` empty (`tests/ci/_metaSpecRegistration.test.ts:184`). `tests/ci/_metaE2eWorkflowCoverage.test.ts:262` asserts the stronger property that every spec is PR-covered, with a reasoned row for every exception.

**The instrument failed twice, in the same direction, and the entry warned about it once.** Its own "measurement caveat" paragraph records a first bad census — a grep returning zero for every spec, "which is indistinguishable from a real finding of total darkness" — and says the numbers were re-measured "against playwright's own `--list` output". They were. Against one config. Checking the instrument is not the same as checking that it ranges over the population, and the second error survived precisely because the first had been caught and the author felt measured.

**What the arc found instead, in the direction nobody had asked about.** The comparison runs disk-to-config and never config-to-disk, and the reverse was broken: `playwright.config.ts` named **nine spec files that do not exist**, each duplicated across `mobile-safari` and `desktop-chromium`, eighteen occurrences.

```
$ ls tests/e2e/ | grep -E "apply-driven-refresh|redeem-link|leaked-link|auth-chain|admin-banner|alert-identity-banner-layout|alert-banner-autoresolve-layout|bootstrap"
$ echo $?
1
```

A dead branch is invisible to `--list` by construction — the resolved set is identical whether or not it is there — which is why both existing guards were blind to it, and it is a hazard rather than litter: these matchers are unanchored alternations of bare stems, so a name outliving its file keeps matching by substring and adopts the next file whose name contains it. `playwright.config.ts:77-78` already records that exact fear about a name chosen carelessly. Repaired and guarded in `db27d5ebf` (`tests/ci/_metaConfigBranchStaleness.test.ts`); the deletion is behavior-neutral, proved by identical `file::project::case` resolution before and after.

**A third variant, mechanism proved and no live instance, recorded here rather than guarded.** Playwright silently drops a positional path whose selected project cannot match it — probed as `--project=desktop-chromium` over one matching and one non-matching file, reporting `Total: 33 tests in 1 file` at exit 0, with no warning and no "no tests found" error because the run is non-empty. All 62 (path, project-set) pairs across `.github/workflows/*.yml` currently resolve, and no instance has ever been observed live. Under the 2026-08-25 process mint freeze that is a documented limit with its probe, not a guard arm and not a row.

**Owning record:** this index, plus `docs/superpowers/specs/ci/2026-08-30-e2e-declared-vs-resolved.md`.

**Re-file trigger:** a spec file that resolves in no config (which `_metaSpecRegistration` now fails on, so this would mean that guard is broken), or a second independent arc finding a config naming files that do not exist. What would NOT settle it, and is the correction this entry most wants carried forward: **a census that enumerates one member of a population and reports the remainder as a finding.** Before believing a count like "118 versus 70", establish what the population of the denominator is, and check that the instrument ranges over all of it.

---
## LIM-SPEC-QUOTES-UNRECONCILED-MEASUREMENT

**What:** A spec quotes a pixel figure for a surface whose ledger row already carries an independently measured one, and nothing compares them. Both numbers sit in the same repository, about the same element, and disagree.

**Measured 2026-08-30** on `fix/pill-size-draft-restored-note`: the spec's first measurement table reported the two-segment attention pill at **66.39px**, from a probe that rebuilt the pill's markup by hand. `DEFERRED.md` had recorded **84.4px** for the same pill on the same surface. The real render measures **84.39px**. Round 1 of spec review caught the reconstruction; nothing mechanical would have.

**Owning record:** this index, plus the spec section of `docs/review-rounds/fix/pill-size-draft-restored-note/53a1fc82fb36.md`.

**Re-file trigger:** a second independent arc shipping a spec figure contradicted by its own ledger row. What would NOT settle it: requiring every spec figure to cite a probe, since the defective probe here DID cite one and was quoted faithfully.

---

## LIM-CITATION-WELLFORMED-BUT-WRONG

**What:** `spec:lint` catches a malformed or out-of-range `file:line` citation and cannot see one that is well-formed and points at the wrong line. The residual risk in a heavily cited document is concentrated entirely in claims that look right.

**Measured 2026-08-30** across five spec rounds on `fix/pill-size-draft-restored-note`, where every other finding class decayed to nothing and this one produced in all five: seven bad anchors in round 1; in round 4, a `T-LAYOUT` equation repeated three times that omitted the sheet-mode grab-strip term, a phantom-gap guard named as protection for a note it cannot render because it drives a different modal, and a clearing-behaviour row attributing a textarea clear to the submit-path helper. `pnpm spec:lint` passed clean on all of them. The `CITATION_SYMBOL_UNMATCHED` advisory fired on four of the seven round-1 anchors, but as an advisory among twenty-plus it does not separate signal from noise.

**Owning record:** this index, plus the spec section of `docs/review-rounds/fix/pill-size-draft-restored-note/53a1fc82fb36.md`.

**Re-file trigger:** a second independent arc measuring the same class as its non-decaying one. What would NOT settle it: promoting `CITATION_SYMBOL_UNMATCHED` to a failure, which this corpus has already measured producing noise authors route around. The one mitigation that did work here is procedural and is recorded in the filing: verify from the code side, opening the cited line and asking whether the sentence is true of it, rather than reading the sentence and looking for confirmation.

---

## LIM-E2E-1280-CONTAINMENT-FLAKE

**What:** `tests/e2e/popover-clip-fit.spec.ts`'s `containment at 1280x800: the menu never crosses the panel's clip edge` fails intermittently, at `menu.right` 1068.625 against `pill.right` 1084, whenever the whole file runs. It passes reliably when run alone.

**Why it is not a geometry defect.** 1068.625 IS the correct placement for that viewport, and the case's own comment says so: `CI measured menu.right 1068.16 against pill.right 1084`. At 1280 the pill extends past the inset bounds, so the core correctly pulls the panel left instead of leaving it flush. The assertion is guarded to skip exactly that situation. What varies between runs is therefore the guard, or the moment of measurement relative to a placement re-pass, not where the menu ends up.

**Measured 2026-08-30** on `fix/pill-size-draft-restored-note`, full-file runs under `tests/e2e/standalone.config.ts`:

| tree | full-file runs | failures |
|---|---|---|
| this head | 7 | 1 |
| control, both modal components at `origin/main` | 7 | 1 |

**Inherited, not caused.** The same rate on both sides is the whole point of the measurement: the first failure appeared on a head run and looked like this arc's, and it took running the control the same number of times to show it is not. One observation is not a rate.

**Why a limit and not a row (2026-08-25 process mint freeze):** the repair is test-infrastructure, its done condition is a property of the suite, and no product surface is blocked. It costs arc wall-clock and, worse, costs credibility: an intermittent red trains readers to retry rather than to read.

**Cross-reference:** [[LIM-E2E-SPEC-DISCOVERY-GAP]]. The two are the same story from opposite ends. This flake lives in a spec that ran under `standalone.config.ts` on every PR from 2026-08-02, so it has been flaking in a CI-visible suite for as long as the file has existed; what the earlier account called darkness was the census's, not the spec's. A second independent arc hitting either slug is the `**Mint-exception:** product-blocked` evidence a row would need.

**Owning record:** this index, plus the diff section of `docs/review-rounds/fix/pill-size-draft-restored-note/53a1fc82fb36.md`.

**It is a CLASS in that file, not one case.** Measured later the same night: `popover-clip-fit.spec.ts:609`, "placement is RE-COMPUTED once the entrance settles (no-preference)", failed once in a full-file run and then passed 5 of 5 in isolation, having already passed 5 consecutive full-file runs at the same commit. Same shape as the 1280 case: a placement measured once, without polling for settle, in a file whose own `settledGeometry` helper exists precisely because "a single sample taken right after a structural change can land on the frame BEFORE the re-apply". Two cases share the defect; the file has more that sample once.

**REPAIRED 2026-08-30 by `test/e2e-spec-discovery-wiring`, in the swept form this trigger asked for.** The population was derived from the mechanism rather than from the two known cases: `components/admin/showpage/AttentionMenu.tsx:479` states that `entered` is the only re-place signal and that the mount measurement runs before the entrance rAF, so any case that opens the menu and asserts on placement-derived geometry from a single sample is in the class. That is SIX cases across four reads, including the three `settled fit` cases which never waited on the entrance scale at all and which a symptom-derived population missed. All four reads now go through `settledSample`, which resamples until two consecutive reads agree on every value and THROWS rather than returning an unsettled sample. Excluded with reasons: the animated case awaits `transitionend` explicitly, and the DOM-descendant case asserts node containment rather than geometry.

**No reproduction was obtained, and none is claimed.** Six full-file runs before the repair were 6 of 6 green, consistent with the ~1 in 7 measured above; six after were also green at 42 passing each. The repair rests on the defect shape and on the component's own comment, not on a red this arc observed.

**Re-file trigger:** a placement read in that file that does not go through the settle poll, or the flake recurring after this repair — which would mean the mechanism is not the one named here.

**The reproduction arrived 2026-08-30, from `fix/popover-clip-fit-stale-viewport`.** This entry states that none was obtained and none claimed, resting the repair on the defect shape plus `components/admin/showpage/AttentionMenu.tsx:479`. That arc got one. Reducing `settledSample` to a single read — pre-repair behaviour at all four call sites at once — and running the full file 33 times produced a failure at `placement is RE-COMPUTED once the entrance settles`, one of the two cases named above by symptom, with a delta of 15.375px. On the shipping tree with the poll intact, 26 full-file runs (13 idle, 13 under deliberate 8-core load on a 12-core host) were 42 of 42 every run. So the mechanism inferred here is the mechanism that fires when the poll is removed, and the repair is confirmed by observation rather than only by shape. Procedure and numbers: `docs/superpowers/plans/2026-08-29-popover-clip-fit-stale-viewport-PARKED.md`.

**One in-class site the swept population missed.** The sweep derived its population from the mechanism rather than from symptoms, which is why it reached six cases where a symptom-derived one would have found two. The anchor-room census (`tests/e2e/popover-clip-fit.spec.ts:1472`) also opens the menu and asserts on placement-derived geometry from a single sample, so it is in-class by that definition, and it is not routed — it still carries a bare `waitForTimeout(80)`. It is not among the two stated exclusions. It therefore satisfies the first arm of the trigger above **literally**, and it is named here rather than filed on a margin rather than on immunity: its sweep shrinks monotonically, and its oracle is a pair of lower bounds where a failure needs a read at or under 96 against a smallest settled value of 185.06. **That is an observed margin, not a proof it cannot fail.** The margin argument assumes a stale read returns the previous cell's settled value, and that premise is untested — the record cited above states it as untested and does not exclude an intermediate value at or under 96. A later arc that routes it closes the last known in-class read; nothing is blocked until then.

**The parked repair for the `settled fit` cases is preserved, not lost.** `docs/superpowers/plans/2026-08-29-popover-clip-fit-settle-cover-design.md` carries the design (one `settleAtViewport` entry point owning viewport, navigation, hydration and a two-sample geometry poll, plus a structural cover over every entry point). It did not ship because the defect it hardens did not reproduce after this repair, across 26 full-file runs on one host (13 idle, 13 under deliberate 8-core load). That rejects the previously measured rate; it does not distinguish "gone" from a rarer or runner-dependent recurrence, and the record cited above declines to claim the stronger thing. If it does recur, that design un-parks with its work already written.

---

## LIM-ORACLE-ROUND-BEFORE-SUBPIXEL-TOLERANCE

**STATUS: CLOSED. Zero open instances.** Indexed here so the next arc finds the shape by one grep rather than by re-deriving it, per the class-sweep order that produced it.

**The shape:** a geometry oracle that rounds, floors, or ceils a measured quantity and THEN compares it under a sub-pixel tolerance. `Math.floor` discards up to 1px; a 0.5px tolerance cannot absorb that. The assertion stops deciding on the fit and starts deciding on the fractional part of the measurement, which no implementation controls.

**Why it is worse than a flake:** it fails in both directions. The floored form accepts a scroller sitting 0.61px SHORT of its room, comparing it against the floored value at zero error, while rejecting a scroller that fills its room exactly. It is simultaneously too loose for the defect it exists to catch and too strict for correct code.

**Measured 2026-08-30** on `fix/pill-size-draft-restored-note`: three instances, all in `tests/e2e/popover-clip-fit.spec.ts`, all repaired in `9e0a9c9e4`. The file's own comment already called the third one "Third site of the same arithmetic", so the duplication was known and the defect in it was not.

**What it cost before it was named:** a reverted repair on an unrelated component, a refuted diagnosis, a discriminating probe, and most of a hold window. It presented as a production regression, and it was not one.

**Sweep, derived rather than enumerated.** For every `Math.floor|round|ceil` in `tests/`, bind the name it assigns and require that name to appear in a sub-pixel assertion (`<= 0.5`, `toBeLessThanOrEqual(0.5)`, `toBeCloseTo(x, 0|1)`) within the next 45 lines. Outside `tests/e2e`: zero. Inside: the three repaired sites plus three matches that are NOT the shape, recorded so a later sweep does not re-raise them:

- `tests/e2e/popover-clip-fit.spec.ts:1274` and `tests/e2e/popover-clip-fit.spec.ts:1289` round to CONSTRUCT the fixture (`Math.ceil(h + 44)` sizing a spacer). The compared values are measured and unrounded, and `spaceAbove`/`spaceBelow` are computed unfloored at `tests/e2e/popover-clip-fit.spec.ts:1200`, mirroring `lib/popover/position.ts:113`.
- `tests/e2e/section-header-layout.layout.spec.ts:849` uses `Math.round(h * 100) / 100`, a two-decimal display round whose 0.005 worst case is two orders below the 0.5 tolerance.

**Re-file trigger:** any new instance. The durable repair is not another sweep but a lint over the shape; that was NOT filed as a row, because the freeze's admission test asks for a number outside the process and a lint's done condition is a property of the lint.

## LIM-WORKFLOW-PATHS-TEST-IMPORT-GAP

**Shape:** A CI workflow carrying a `paths:` filter RUNS a set of specs, but the filter names only some of the components those specs exercise. An edit to an unnamed component then triggers nothing, and the gate reports green having executed none of the cases written for it. The dark half is invisible from either side: the workflow looks complete because it lists real paths, and the spec looks covered because a job with its name exists and passes. The derivable form is the fix -- for each workflow with a `paths:` filter, every component transitively imported by the specs it runs must appear in that filter -- which is a static import walk, not an enumeration.

**Named by:** 1 arc — fix/pill-size-draft-restored-note/1789e76bb82f.md (diff, R2: `.github/workflows/step3-live-bundle.yml` ran the draft-restored-note cases while its filter omitted `components/admin/wizard/DraftRestoredNote.tsx`, so a note-only edit would have got no Chromium coverage; the path was added, the class was not closed)

**Owning record:** this index. The instance repair is in that arc's diff; nothing else pins the class.

**Not filed as a row, deliberately.** Process-facing under the 2026-08-25 freeze, and it fails the admission test on its own terms: the done condition would be a property of the walker (does it resolve every import edge), which is refutable once per review round and finishes never. It earns a row when it blocks a product arc — a component edit that reached `main` with its gate green and its cases unrun — and the `**Incident:**` then names that arc.

**Re-file trigger:** a second arc naming it, OR one measured instance of a component edit merging with its workflow green and its specs unexecuted. A workflow filter merely LOOKING incomplete is not the trigger; the filter legitimately omits paths whose specs it does not run.

## LIM-OUT-OF-RENDER-SNAPSHOT-READ

**Shape:** A spec or component makes state validity a property evaluated during RENDER (an
intersection, a derived predicate, a "stale entries are inert" rule) and then relies on that rule in
code that does not run during render: a `setTimeout` callback, a passive effect, a subscriber
registered once. Each such reader closes over the state of the render that scheduled it, so the rule
governs what the render produces and nothing else. The tempting repair is a ref mirroring the state,
consulted by each reader — and it fails when the mirror is synced in a passive effect, because
React flushes pending passive effects before the next render, so the mirror and the reader learn
about a removal on the same schedule. **A mechanism that learns about a removal on the same schedule
as the reader it protects protects nothing.** The reader set is also open: an inventory of it fails
open by construction, and a criterion scoped to "the readers named in section X" cannot see the ones
the inventory missed.

**Named by:** 1 arc — fix/lightbox-pair-and-retry-checkin/47e9544e65dd.md (spec, R1 finding 3, R3
findings 1 and 2, R4 findings 1 and 3: five of seventeen findings across three of four rounds, and
the axis the stage ended on at the round cap without an APPROVE)

**Owning record:** this index, plus the spec section of that filing. The untested candidate recorded
there is the writer-side twin: every call site that mutates the state also updates the mirror
synchronously, which is a CLOSED and greppable set where the reader set is not. No round proposed it
and that arc did not adopt it.

**Not filed as a row.** Process-facing under the 2026-08-25 freeze; no product arc was blocked, and
the recurrence exception excludes it by name because both hits are inside one arc. It also fails the
admission test on its own terms: a lint would have to decide, per function reachable from an effect
or timer, whether a value it reads is a render snapshot and whether acting on a stale one is
observable, which is dataflow over an open input space with no done condition outside the process.

**Re-file trigger:** a second INDEPENDENT arc measuring this class as its non-decaying axis, with its
corpus row. What would NOT settle it: another mirror synced in an effect, which is the refuted
repair, or a longer reader inventory, which is the fail-open shape.
