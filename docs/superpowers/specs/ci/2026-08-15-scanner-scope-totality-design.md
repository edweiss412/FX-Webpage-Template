# Scanner scope/totality fidelity — premiseScan scope-aware extents + timing-scan property totality

**Date:** 2026-08-15 · **Arc branch:** `docs/scanner-scope-totality-spec` (authoring) → `fix/scanner-scope-totality` (implementation) · **Status:** DRAFT

## §0 Why

Two probed recognizer-fidelity gaps, each with its ledger entry as the spec-of-record for mechanics:

1. **`BL-PREMISESCAN-NESTED-HELPER-SCOPE`** (BACKLOG.md, filed 2026-08-14; MEDIUM — a false NEGATIVE, the direction that does not announce itself). `premiseScan` registers declaration extents at MODULE SCOPE ONLY (`tests/mutation/source/premiseScan.ts`, the `isModuleScope` gate on the declaration walk), and a `describe("…", () => { … })` body is an arrow function — so a helper declared inside it has no registered extent, its `node:child_process` reach is invisible, and every test calling it classifies `environment-free`. Probed in the entry with two sources differing ONLY in helper placement: module scope → `["environment-touching"]`, describe scope → `["environment-free"]`. Live cost already paid: `tests/ci/phantomGapExecuted.test.ts` declared its spawning `runCli` inside the `describe` body and `EXPECTED_ENV_TOUCHING` recorded a truthful-looking `0`; hoisting moved it to `3` with nothing failing in between.
2. **`BL-TIMING-SCAN-PROPERTY-TOTALITY`** (BACKLOG.md, filed 2026-08-15). `scripts/scan-interaction-timings.ts` is complete for TIMER DELAYS — every delay argument is walked and one it cannot classify is reported `unclassified`, failing the guard unless a reasons-required `UNCLASSIFIED_DISPOSITIONS` row covers it. Its PROPERTY form (form 3) is not: a timing-named property whose value is not a numeric literal is dropped silently — the `numericValue(...) !== null` guard pushes nothing on the else path — so it appears in neither `DESIGN.md` §5.5 nor the unclassified list. Five live sites are invisible today (re-verified 2026-08-15): `components/admin/telemetry/EventRow.tsx:122` (`duration: reduce ? 0 : 0.22`), `components/crew/RightNowHero.tsx:456` (`duration: prefersReducedMotion === true ? 0 : 0.22`), `components/diagrams/GalleryLightbox.tsx:243` and `components/diagrams/GalleryLightbox.tsx:370` (`duration: emblaDuration(prefersReducedMotion)`, live value 22), and `components/diagrams/GalleryLightbox.tsx:542` (`duration: motionDuration`, live value 0.22). The scanner's own header records this as "a REAL GAP rather than a principled fence".

## §1.1 Resolved scope — do not relitigate

1. **The premiseScan module-scope restriction was a deliberate trade, and the repair direction is fixed by the entry:** scope-AWARE extent resolution (extents keyed by declaring scope, resolved innermost-out), NOT scope-blind registration. The restriction exists because a flat all-scopes name map collided `reportEnvelope`'s parameter `res` with an unrelated `const res` inside `main()` and every test importing `reportEnvelope` went environment-touching (spec AC-10b of the guard-premise design; the probe is recorded in the comment above the declaration walk in `premiseScan.ts`). Any alternative that re-opens that false positive is out; the AC-10b collision stays as a regression case.
2. **The timing-scan repair is totality, not resolution.** A non-literal timing-named property value is reported `unclassified` exactly as a delay argument already is — then the five known sites are dispositioned. Extending form-2 NAME resolution to property values is out of scope: identifier-by-name resolution is the documented defect surface of `BL-TIMING-SCAN-NAME-VS-BINDING` (BACKLOG.md, effort M, separate row — explicitly NOT folded into this arc), and widening it to a second syntactic position before that row's scope-aware fix lands would grow the defect, not the coverage.
3. **Autonomy:** user grant 2026-08-15 (Eric), both user review gates WAIVED for this batch. Stop only for a genuinely new question.

## §2 Design

### §2.1 premiseScan: scope-aware extent resolution

**Model.** Extents are keyed by DECLARING SCOPE — the nearest enclosing function-like node (function declaration/expression, arrow, method) or the source file — instead of one flat module-scope map. A reference resolves innermost-out from the REFERENCE's own position: the innermost enclosing scope that declares the name wins; module scope is the final fallback; imports resolve as today. Parameter names register as shadow entries in their function's scope — a parameter carries no extent, but it BLOCKS fallthrough to an outer binding of the same name, because that is what the language does and because the AC-10b class is precisely an outer extent leaking into a scope that shadows it.

**Writes.** An assignment statement's extent attaches to the binding the target name resolves to (innermost-out from the assignment site); an unresolvable target attaches to module scope, which is today's behavior and the conservative direction (a closure writing module state — `let cache; function init() { cache = spawnSync(…) }` — must extend `cache`'s extent, and does).

**Regression cases, all three shipped as fixtures with both halves:**

- **Fires:** the entry's own two-variant probe — same `spawnSync` import, same call site, helper at module scope vs helper inside the `describe` body — BOTH classify `environment-touching`. The describe-scope variant is the executable RED: on the live tree it classifies `environment-free` today.
- **Stays quiet (AC-10b):** a module shaped like the probed collision — an exported helper with a parameter `res`, an unrelated `const res = <provenance>` inside a different function — and a test importing the helper stays `environment-free`.
- **Stays quiet (shadow):** a module-scope binding whose extent carries provenance, shadowed by a same-named parameter in the helper the test calls — the test stays `environment-free`.

**Expected effect on the corpus.** `tests/ci/phantomGapExecuted.test.ts`-shaped suites classify environment-touching without hoisting helpers to module scope. The stale documentation of the old restriction is updated in the same commit (class-sweep at round 0): the `premiseScan.ts` comment above the declaration walk, and the `tests/mutation/_metaPremiseContract.test.ts` comment that explains a count by citing "premiseScan registers declaration extents at module scope only". The entry's closing line — the recognizer's contract was "module-scope helpers only, which no current caller states" — stops being true by the contract widening, not by a caller starting to state it.

**Verdict lattice unchanged.** `environment-touching` / `environment-free` / `unclassifiable` keep their meanings and precedence (unclassifiable outranks touching within a test's own extent); nothing in this repair adds a new verdict or reclassifies the existing unclassifiable constructs (non-literal dynamic import, computed member access on `process`).

### §2.2 timing scan: property-form totality

**Repair.** Form 3's else path (value is not a numeric literal) pushes a site with `kind: "unclassified"`, the `propertyKey`, and `name` = the value expression's text (same whitespace-collapse and 60-char truncation as the delay form's fallback). The guard contract is then IDENTICAL across both halves, in the scanner's own words for delays: every timing-named property value is classified or named, and an unclassified one fails the inventory test unless a reasons-required `UNCLASSIFIED_DISPOSITIONS` row covers it — never silently absent.

**The five sites, dispositioned** (final row text is implementation's, under the registry's own posture — "a claim that the delay is knowable and fine; not a way to hide one"):

- The two reduced-motion ternaries (`EventRow.tsx:122`, `RightNowHero.tsx:456`) resolve to two constants: 0 under reduced motion, 0.22 otherwise — the standard motion duration that already carries §5.5 presence via its named-constant peers.
- The `GalleryLightbox.tsx` trio resolves in-file: `emblaDuration(prefersReducedMotion)` returns the committed live value 22 (embla's tween-speed unit, not seconds) at `components/diagrams/GalleryLightbox.tsx:243` and `components/diagrams/GalleryLightbox.tsx:370`, and `motionDuration` is the in-file 0.22 binding at `components/diagrams/GalleryLightbox.tsx:542`.

**§5.5 regen rule.** A disposition that establishes a fixed design timing not already represented adds its row to `DESIGN.md` §5.5 (regenerated through `tests/docs/_metaInteractionTimingInventory.test.ts`'s derivation, which pins §5.5 to the scan in both directions); one that names a runtime-derived or already-represented value records the reason only. The implementation settles each of the five per that rule and the inventory test proves the outcome.

**Header honesty.** The scanner header's "PROPERTIES ARE LITERAL-ONLY … a REAL GAP" paragraph is rewritten to state the closed contract (same commit; the pointer to `BL-TIMING-SCAN-NAME-VS-BINDING` at the delay-resolution paragraph stays — that gap remains open by design).

### §2.3 Mutation-registry status (AGENTS.md convergence bullet 4)

- **`scripts/scan-interaction-timings.ts` is ALREADY ENROLLED** (`interactionTimingScan` row: all six operators, `scoreFloor: 0.95`, suites `tests/docs/_metaInteractionTimingInventory.test.ts` + `tests/docs/interactionTimingScan.test.ts`). Accepted-survivor siteIds are LINE-keyed, so this edit shifts every row below it — the registry row's own comment mandates re-derivation via `enumerateSites` rather than hand-adjustment. The implementation branch re-derives the accepted set, reruns `pnpm heavy pnpm mutation:guards`, and states the score plus the unaccepted-survivor set in its round-1 diff brief.
- **`tests/mutation/source/premiseScan.ts` is expressible and not enrolled:** an importable module with two referring suites (`tests/mutation/source/premiseScan.test.ts`, `tests/mutation/_metaPremiseContract.test.ts`). The implementation branch enrols it before its first diff-review dispatch — operator subset and score floor fixed at plan time after a site-count and suite-runtime probe (both suites are pure AST work; no DB) — and states score + unaccepted-survivor set in the round-1 diff brief. If the probe surprises (per-mutant runtime out of budget), the scoped-subset shape from the sibling arc's §2.3 applies, never a symbolic row.

## §3 Sequencing + claim handoff

1. This branch (`docs/scanner-scope-totality-spec`) carries spec + plan + HANDOFF and claims both entries (Stage-0 markers pushed).
2. Before this branch's PR merges, the implementation branch `fix/scanner-scope-totality` is created off `origin/main`, marks both entries `**Status:** IN PROGRESS · **Branch:** fix/scanner-scope-totality`, and pushes — transient dual declaration is the designed handoff state.
3. This branch's last pre-merge commit strips its own markers; at no instant is either entry undeclared on origin.
4. The implementation branch graduates both entries (archive moves, markers stripped inside the moves) when it ships.

## §4 Documented limits

1. **Scope grain is function-like, not block.** Two same-named block-scoped declarations in SIBLING BLOCKS of one function share a scope key and merge extents. The failure direction is over-classification confined to one function (a premise demanded where not strictly needed) — it announces itself, unlike the false negative this arc closes. Block-grain scoping is a future widening carrying its own regression evidence, not drift.
2. **Property values are not name-resolved** (§1.1 item 2). `duration: SOME_CONSTANT` reports `unclassified` with the identifier text rather than resolving the binding; its disposition row (or the `BL-TIMING-SCAN-NAME-VS-BINDING` fix, when that lands with scope-aware resolution) is the path to a resolved row.
3. **premiseScan's existing unclassifiable constructs are untouched.** Non-literal dynamic `import()` and computed member access on `process` still report `unclassifiable`; this arc neither narrows nor widens that set.
4. **The five dispositions are reasoned claims, not suppressions.** Each names where its value actually lives; the inventory test keeps §5.5 pinned to the scan in both directions.

### Dimensional Invariants

This arc introduces no rendered component, no fixed-dimension parent, and no box-model change on any surface: the five timing sites keep their exact values and expressions; the diff is scanner code, test fixtures, disposition registry rows, ledger prose, and (conditionally) generated `DESIGN.md` §5.5 inventory rows. If implementation contradicts this, that task adds the relationship here plus the real-browser assertion per the writing-plans layout-dimensions rule.

### Transition Inventory

No visual state is added or changed: no `AnimatePresence`, no exit/initial/animate props, no conditional render changes — the reduced-motion ternaries and lightbox durations are read by the scanner, not edited. If a task adds a visual state, the inventory gains its pairs first.

## §5 Meta-test / registry inventory

- **CREATES:** the premiseScan registry row (§2.3); the three scope fixtures (fires / AC-10b stays-quiet / shadow stays-quiet); property-totality unit rows (fixture-based) plus the five-site live-tree assertions and their disposition rows.
- **EXTENDS:** `tests/mutation/source/premiseScan.test.ts`, `tests/mutation/_metaPremiseContract.test.ts` (comment + any count derived from the old restriction), `tests/docs/interactionTimingScan.test.ts`, `tests/docs/_metaInteractionTimingInventory.test.ts` (§5.5 derivation, per the regen rule), `UNCLASSIFIED_DISPOSITIONS`.
- No new Supabase call site, no invariant-10 mutation surface (tooling/test code only), no advisory locks, no §12.4 rows, no UI surface. `DESIGN.md` §5.5 edits are generated inventory rows, not design-token or component changes — the invariant-8 UI definition is not triggered.

## §6 Acceptance criteria

- **AC-1:** The two-variant probe ships as fixtures and BOTH variants classify `environment-touching` (executable RED first: the describe-scope variant classifies `environment-free` on the unfixed tree).
- **AC-2:** The AC-10b collision fixture and the parameter-shadow fixture both classify `environment-free` (stays-quiet halves; the AC-10b fixture is the entry's probed shape).
- **AC-3:** A `tests/ci/phantomGapExecuted.test.ts`-shaped suite (spawning helper inside `describe`) classifies environment-touching without hoisting; the two stale restriction comments are updated in the same commits that change the behavior they describe.
- **AC-4:** A timing-named property with a non-literal value yields an `unclassified` site carrying `propertyKey` (executable RED: a fixture with `duration: cond ? 0 : 0.22` yields no site on the unfixed scanner); the five live sites each appear as unclassified-with-disposition or as §5.5 rows per the §2.2 regen rule, and `tests/docs/` is green.
- **AC-5:** `interactionTimingScan` gate green after re-derivation: score ≥ 0.95, unaccepted-survivor set empty-or-accepted, both stated in the round-1 diff brief.
- **AC-6:** `premiseScan` enrolled with stated score and empty-or-accepted survivor set (operator subset per the plan-time budget probe), stated in the round-1 diff brief.
- **AC-7:** Both entries graduated to `BACKLOG-archive.md`, markers handled per §3, `pnpm vitest run tests/docs/` green.

impeccable-gate: N/A — no UI surface
