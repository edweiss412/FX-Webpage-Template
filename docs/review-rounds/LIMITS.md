# LIMITS.md — parked mechanizable classes (LIM- index)

A `LIM-<UPPER-KEBAB>` slug is a stable name for a mechanizable defect class that a review-round filing named and then parked without minting a `BL-`/`DEF-` row, under the 2026-08-04 filing bar, the 2026-08-18 mint bar, or the 2026-08-25 process mint freeze. This index retro-covers the parked classes identified so far; it is advisory, makes no completeness claim, and a parked class missing here gains a section when next named. The filings that named the classes are immutable evidence and are never edited to add a slug; new filings cite a slug inline in their `declined:` entries. The recurrence check for any class is `rg "LIM-<NAME>" docs/review-rounds`. The round-economy gate ignores this file: per the README.md contract, a non-`<baseSha12>` markdown file in this tree is prose, not a tracked filing.

Sections are ordered by how many distinct arcs have named the class, descending. Filing paths are repo relative under `docs/review-rounds/`, stage in parens.

## LIM-AUTHORED-RED

**Shape:** A declared `red=` that cannot be red for its stated reason, and nothing executes it to find out: a new killing case that passes against clean production the moment it is written, a red satisfied by an unresolved import or by a surface an earlier task creates, or a red that already exits zero at the merge base. Parts of collectability are mechanized in `lib/specLint/redContract.ts` (collection probes over eligible markers of both states, with findings such as `RED_COLLECTS_NOTHING` and `RED_SUITE_UNCOLLECTED`, and `--exec-red` execution of eligible live reds; eligibility rules and per-state finding routing live in that file). What remains parked is truth of the red itself: a collectable red that already passes at the merge base, or a new killing case green against clean production the moment it is written.

**Named by:** 6 arcs — docs/quick-wins-2-specs/97e179d831aa.md (plan), feat/planlint-declared-limit-pin-collision/03953337388b.md (spec), fix/replacement-string-class-sweep/bcd3d088ec76.md (plan), feat/review-modal-strip-dock/d4cd838727a3.md (plan), fix/mutation-gate-fidelity/75b8f7a3ec76.md (plan), feat/nearmiss-surface/b30413cf5e51.md (plan)

**Owning record:** the out-of-scope fence in docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md (mechanizing existence-of-declaration is that arm; truth-of-claim is not), plus this index

**Re-file trigger:** a product-facing arc measurably blocked by a red that could not fire (stated verbatim in the review-modal-strip-dock and nearmiss-surface filings)

**Filed 2026-08-27** as `BL-SPECLINT-RED-TRUTH-PROBE` (owner-directed; incident: `fix/mi11-removal-fallback-live-row` plan round 1).

## LIM-NUMERIC-TABLE-PROVENANCE

**Shape:** A numeric table or blast-radius transcript stated in a spec with no command producing it, so nothing can compare the table to the tree: `spec:lint` parses numerics and parses fenced commands without relating them, and a hand-maintained transcript of a command's output drifts in every direction. The sibling form is a plan that quotes a command's output without that command being re-run (a claimed 106 enrolled plans where the quoted command returns 108).

**Named by:** 3 arcs — fix/mutation-shard-budget-six/9a621a5792ea.md (spec), feat/review-modal-strip-dock/ae8e9544b55a.md (spec, its second candidate; that arc's repair deleted the transcript outright), feat/speclint-ac-unclaimed-arm/44b0d74b1107.md (plan, its third shape)

**Owning record:** none — this index is the record

**Re-file trigger:** "a spec whose stated table cannot be reproduced from its own commands reaching a review round again" (mutation-shard-budget-six filing)

## LIM-EXPECT-N-COMMENT

**Shape:** A plan command whose stated expectation is not enforced by its exit status: a `# expect 0` comment beside a `grep -c` that prints and moves on, a deliberately red proof whose nonzero exit is masked by a pipe, or a measurement selector that can print nothing and exit zero.

**Named by:** 2 arcs — fix/premisescan-registrar-accept-sets/0820436cf4dd.md (plan), ci/app-e2e-batch2/0ba72c23774f.md (plan)

**Owning record:** none — this index is the record (the premisescan filing recorded it as that surface's documented limit)

**Re-file trigger:** the premisescan filing stated "if a second arc burns review rounds on this class, it has an incident and it should be filed then"; the app-e2e-batch2 filing (2026-08-22) is arguably that second arc, so the trigger may already be met

**Filed 2026-08-27** as `BL-SPECLINT-EXPECT-N-EXIT-STATUS` (owner-directed; incident: `fix/fitwithinclip-stale-clip-subscription` plan round 2).

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

**Named by:** 2 arcs — feat/speclint-ac-unclaimed-arm/44b0d74b1107.md (diff), feat/private-image-pipeline/d2a31e4aa021.md (diff, the `alertProducerScope.registry.ts` instance: one hoisted emit invalidated 19 rows across three files)

**Owning record:** the documented-limit note at the head of `tests/mutation/source/registry.ts` (placed by the ac-unclaimed arc), plus this index

**Re-file trigger:** a third arc hitting it or a product arc blocked by it (stated in the ac-unclaimed filing)

## LIM-PLANT-ANCHOR-UNIQUENESS

**Shape:** A mutation-plant anchor that is not unique in its file, is not a literal, or is orphaned when a repair moves the code out from under it; decidable without judgment because the harness refuses anything not occurring exactly once. The arc's in-branch repair (Form A/B rule, `--anchors` resolution in CI) covers its own corpus; the generalizing `spec:lint` arm was demoted from the ledger under the freeze.

**Named by:** 1 arc, 2 filings — fix/mutation-shard-weight-seconds/300a9f937b8a.md (plan), fix/mutation-shard-weight-seconds/d4324ba0a269.md (diff)

**Owning record:** none — this index is the record (the pre-freeze ledger row was demoted and removed)

**Re-file trigger:** a second arc burns a review round on a non-executable plant anchor, or a plant silently orphaned by a repair reaches `main` (stated in the plan filing; the diff filing adds "a second arc loses a plant to a repair")

## LIM-PLAYWRIGHT-RED-TESTMATCH

**Shape:** A playwright `red=` naming a file outside the config's testMatch alternation matches nothing and exits zero, reporting success; strictly worse than unrunnable because it fails green. One membership check per playwright red against the config it names, decidable statically.

**Named by:** 1 arc — feat/review-modal-strip-dock/d4cd838727a3.md (plan)

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

## LIM-INDEX-RESTATEMENT-DRIFT

**Shape:** Advisory index or pointer prose restating a cited artifact (an implementation file, a filing, a note) and misstating it: an overstated coverage claim, a miscounted line count, two source instances fused into one. The convention that owns this index declines any index-vs-artifact comparison lint by design, so the class is repaired by narrowing claims and citing rather than restating.

**Named by:** 1 arc — docs/lim-slug-convention/4cb585b3508a.md (diff)

**Owning record:** the no-gate fence in the README's parked-class-slugs paragraph, plus this index

**Re-file trigger:** named by a 3rd distinct arc
