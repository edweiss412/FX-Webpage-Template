# LIMITS.md — parked mechanizable classes (LIM- index)

A `LIM-<UPPER-KEBAB>` slug is a stable name for a mechanizable defect class that a review-round filing named and then parked without minting a `BL-`/`DEF-` row, under the 2026-08-04 filing bar, the 2026-08-18 mint bar, or the 2026-08-25 process mint freeze. This index retro-covers the classes parked before the convention existed. The filings that named them are immutable evidence and are never edited to add a slug; new filings cite a slug inline in their `declined:` entries. The recurrence check for any class is `rg "LIM-<NAME>" docs/review-rounds`. The round-economy gate ignores this file: per the README.md contract, a non-`<baseSha12>` markdown file in this tree is prose, not a tracked filing.

Sections are ordered by how many distinct arcs have named the class, descending. Filing paths are repo relative under `docs/review-rounds/`, stage in parens.

## LIM-AUTHORED-RED

**Shape:** A declared `red=` that cannot be red for its stated reason, and nothing executes it to find out: an `authored` marker whose command cannot collect on the current tree, a new killing case that passes against clean production the moment it is written, a red satisfied by an unresolved import or by a surface an earlier task creates, or a red that already exits zero at the merge base. The live-marker half shipped as `spec:lint --exec-red`; the authored-marker and merge-base halves remain unmechanized (`lib/specLint/redContract.ts` probes live-declared markers only).

**Named by:** 6 arcs — docs/quick-wins-2-specs/97e179d831aa.md (plan), feat/planlint-declared-limit-pin-collision/03953337388b.md (spec), fix/replacement-string-class-sweep/bcd3d088ec76.md (plan), feat/review-modal-strip-dock/d4cd838727a3.md (plan), fix/mutation-gate-fidelity/75b8f7a3ec76.md (plan), feat/nearmiss-surface/b30413cf5e51.md (plan)

**Owning record:** the out-of-scope fence in docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md (mechanizing existence-of-declaration is that arm; truth-of-claim is not), plus this index

**Re-file trigger:** a product-facing arc measurably blocked by a red that could not fire (stated verbatim in the review-modal-strip-dock and nearmiss-surface filings)

## LIM-EXPECT-N-COMMENT

**Shape:** A plan command whose stated expectation is not enforced by its exit status: a `# expect 0` comment beside a `grep -c` that prints and moves on, a deliberately red proof whose nonzero exit is masked by a pipe, or a measurement selector that can print nothing and exit zero.

**Named by:** 2 arcs — fix/premisescan-registrar-accept-sets/0820436cf4dd.md (plan), ci/app-e2e-batch2/0ba72c23774f.md (plan)

**Owning record:** none — this index is the record (the premisescan filing recorded it as that surface's documented limit)

**Re-file trigger:** the premisescan filing stated "if a second arc burns review rounds on this class, it has an incident and it should be filed then"; the app-e2e-batch2 filing (2026-08-22) is arguably that second arc, so the trigger may already be met

## LIM-TASK-MENTION-RESOLUTION

**Shape:** An intra-document task or step reference left stale by a restructure: a `Task <n>` mention that resolves to no `## Task <n>` heading (or a checklist naming a `red-state=live` marker the plan does not contain), and the sibling form, a `Step <n>` reference invalidated by renumbering. `spec:lint` already parses task topology and compares nothing.

**Named by:** 2 arcs — fix/mutation-shard-budget-six/9a621a5792ea.md (plan), test/execution-methods-driver-derived/119895a7c756.md (plan)

**Owning record:** none — this index is the record

**Re-file trigger:** "a fourth arc losing a round to a stale intra-document task reference" (mutation-shard-budget-six filing); the execution-methods filing wants a frequency probe of step-renumbering repairs first

## LIM-NUMERIC-TABLE-PROVENANCE

**Shape:** A numeric table or blast-radius transcript stated in a spec with no command producing it, so nothing can compare the table to the tree: `spec:lint` parses numerics and parses fenced commands without relating them, and a hand-maintained transcript of a command's output drifts in every direction.

**Named by:** 2 arcs — fix/mutation-shard-budget-six/9a621a5792ea.md (spec), feat/review-modal-strip-dock/ae8e9544b55a.md (spec, its second candidate; that arc's repair deleted the transcript outright)

**Owning record:** none — this index is the record

**Re-file trigger:** "a spec whose stated table cannot be reproduced from its own commands reaching a review round again" (mutation-shard-budget-six filing)

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
