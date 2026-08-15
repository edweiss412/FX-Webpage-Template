# Scanner scope/totality fidelity — implementation plan

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point). The spec is `docs/superpowers/specs/ci/2026-08-15-scanner-scope-totality-design.md`; this plan carries its own adversarial-review gate below.

**Goal:** ship scope-aware extent resolution in `premiseScan` and property-form totality in the interaction-timing scanner, graduating `BL-PREMISESCAN-NESTED-HELPER-SCOPE` and `BL-TIMING-SCAN-PROPERTY-TOTALITY`.

**Architecture:** one implementation branch, `fix/scanner-scope-totality`, off `origin/main` (worktree + claims created by the authoring session per spec §3). Tasks in order; TDD per task; conventional commits; cross-model diff review; real CI green; merge; `0 0`.

**Date:** 2026-08-15 · **Spec:** `docs/superpowers/specs/ci/2026-08-15-scanner-scope-totality-design.md` · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants bind; exercised here: 1 (TDD), 6 (commits), 11 (worktree-only), 12 (claims). No UI surface and NO `DESIGN.md` edit of any kind (spec §2.2 — §5.5 stays byte-identical; an edit would flip the invariant-8 gate), no DB, no advisory locks, no §12.4 rows, no invariant-9/10 registry rows.
- Heavy-slot discipline: `pnpm heavy` wraps `pnpm mutation:guards` and any full-suite run; scoped single-file vitest runs stay unwrapped.
- Guard-premise rule (`tests/_shared/premise.ts`) applies to new fixture cases whose discriminating power rests on constructed conditions.

## Pre-draft verification pass (probes recorded; no task re-derives them)

- The five invisible timing sites re-verified 2026-08-15 by `rg` (spec §0 list: `components/admin/telemetry/EventRow.tsx:122`, `components/crew/RightNowHero.tsx:456`, and the three `components/diagrams/GalleryLightbox.tsx` sites at lines 243, 370, and 542); the boundary-predicate census (spec §2.2) additionally surfaced `components/crew/CrewSectionTransition.tsx:54` (shorthand `duration`) and the two auto-resolving `ttlMs: ANNOUNCE_LOG_TTL_MS` pass-throughs (`AdminAnnounceProvider.tsx:51`, `CopyFactValue.tsx:330`). Live population under the boundary predicate: 7 `PropertyAssignment` + 1 shorthand + 0 JSX attributes; numeric-property population delta between predicates: ZERO (both probes 2026-08-15).
- Spec-R1 import-form and unclassifiable-propagation probe tables live in `BL-PREMISESCAN-IMPORT-EDGE-FIDELITY` (filed on the authoring branch); the ALIAS half is Task 1's in-arc repair, the rest is fenced OUT.
- `premiseScan` deciding-suite runtimes (2026-08-15): `tests/mutation/source/premiseScan.test.ts` alone → 22 passed, **10.76s**; together with `tests/mutation/_metaPremiseContract.test.ts` → 32 passed, **52.20s** (the meta suite walks the live corpus).
- `enumerateSites` over `tests/mutation/source/premiseScan.ts` (pre-edit): relational-boundary 3, equality-flip 15, logical-connector 45, integer-literal 11, regex-quantifier-bound 0, statement-removal 56 — total 130.
- `enumerateSites` over `scripts/scan-interaction-timings.ts` (pre-edit): total 95 across the six operators; its two deciding suites run in **11.66s** (42 passed) — the enrolled surface's per-mutant cost.
- `interactionTimingScan` registry row: all six operators, `scoreFloor: 0.95`, LINE-keyed accepted siteIds with the row's own re-derive instruction.
- `UNCLASSIFIED_DISPOSITIONS` rows key on `{file, name, reason}` (scan-interaction-timings.ts registry doc); the inventory gate is `tests/docs/_metaInteractionTimingInventory.test.ts` deriving §5.5 in both directions.
- `_metaPremiseContract.test.ts:89-90` documents the module-scope-only restriction (the stale comment Task 1 updates); the AC-10b probe comment sits above the declaration walk in `premiseScan.ts` (symbol `moduleFacts`, the `isModuleScope` gate).

## Registry reconciliation (writing-plans rule — run at plan time, 2026-08-15)

Current state, extracted mechanically from both registries: `GUARD_SURFACES` ids = `taskContract, ledgerClaimsCore, ledgerGit, destructiveFileAnalysis, pgCronSmokes, reviewRoundCount, reviewRoundCorpus, phantomGapExecuted, popoverOverlayExtract, renderedTextHaystack, interactionTimingScan` (11); `EXPECTED_LEDGER_KINDS` keys = the identical 11 (order differs, sets equal). Declared delta for this arc: **+`premiseScan` in BOTH registries, nothing removed, nothing else renamed** — post-arc both hold exactly 12 ids and the gate's parity assertion is the executable check. Any other delta in the diff is a defect.

## Meta-test inventory (declared)

- **CREATES:** registry row `premiseScan` in `tests/mutation/source/registry.ts`; the four scope/import fixtures (describe-scope fires / aliased-import fires / AC-10b stays-quiet / parameter-shadow stays-quiet); property-totality fixture rows across the three node kinds + boundary-predicate rejection rows; five `UNCLASSIFIED_DISPOSITIONS` rows (six census sites; the GalleryLightbox pair shares a key); a stays-quiet §5.5-population pin.
- **EXTENDS:** `tests/mutation/source/premiseScan.test.ts`, `tests/mutation/_metaPremiseContract.test.ts` (comment refresh; corpus counts if any suite reclassifies), `tests/docs/interactionTimingScan.test.ts`, `tests/docs/_metaInteractionTimingInventory.test.ts` (stays-quiet §5.5-population pin; the §5.5 prose itself untouched), `interactionTimingScan`'s accepted-survivor set (re-derived).

<!-- tasks: depth=3 -->

### Task 1 — premiseScan scope-aware extent resolution

<!-- task: red=`pnpm vitest run tests/mutation/source/premiseScan.test.ts` ac=AC-1,AC-2,AC-3 -->

RED is the ordinary new-case shape: the fires fixture (helper inside `describe`) classifies `environment-free` on the unfixed tree — the production line whose defect makes it fail is the `isModuleScope` gate on the declaration walk in `tests/mutation/source/premiseScan.ts` (`moduleFacts`), which registers no extent for a nested helper. Observe the red, implement, same command green.

1. New fixture cases in `premiseScan.test.ts` (write first, observe red): the entry's two-variant probe (module-scope helper vs describe-scope helper, same `spawnSync` import and call site — BOTH must classify `environment-touching`); the ALIASED-IMPORT fixture (`import { helper as h } from "./m"` where `m`'s `helper` spawns — must classify `environment-touching`; today the cross-module lookup uses the local name and misses, spec §2.1); the AC-10b collision fixture (exported helper with parameter `res`, unrelated `const res = <provenance>` inside a different function — importing test stays `environment-free`); the parameter-shadow fixture (module-scope provenance binding shadowed by a same-named parameter — stays `environment-free`); and the ASSIGNMENT pair proving the spec's write semantics in both directions (R1 F1) — fires: `let cache; function init() { cache = spawnSync(…) }` with the test reaching `cache` classifies `environment-touching` (the inner write extends the MODULE binding's extent); stays quiet: a function-local `let cache` receiving the provenance write inside its own function, beside an unrelated module-scope `cache`, leaves a test reaching the module binding `environment-free` (an implementation attaching every nested assignment to module scope fails this half). Fixtures are self-contained temp-dir sources (the suite's existing fixture pattern), with `premise`/`premiseHolds` where an assertion rests on constructed shape.
2. GREEN implementation (spec §2.1 model): extents keyed by nearest enclosing function-like scope or source file; per-reference innermost-out resolution; parameter names as shadow entries (no extent, blocks fallthrough); assignment extents attach to the binding the target resolves to, module scope when unresolved; cross-module extent lookup resolves through the import specifier's `propertyName` when present (the alias repair). Namespace/renamed-default/re-export forms and helper-body unclassifiable propagation are NOT touched (filed row; spec §4.3). Verdict lattice untouched.
3. Same-commit comment refresh (class-sweep at round 0): the AC-10b comment above the declaration walk (now describes scope-keyed registration and keeps the probe record), and `_metaPremiseContract.test.ts`'s module-scope-only explanation. Re-run `pnpm vitest run tests/mutation/` — if any corpus suite's classification counts shift (a nested helper somewhere now classifies), reconcile the affected `EXPECTED_ENV_TOUCHING`-style pins in the same commit and record each shift in the commit message.
4. Commit: `fix(infra): scope-aware extent resolution in premiseScan; keep the AC-10b collision closed`.

### Task 2 — timing-scan property totality + dispositions

<!-- task: red=`pnpm vitest run tests/docs/interactionTimingScan.test.ts tests/docs/_metaInteractionTimingInventory.test.ts` ac=AC-4,AC-5 -->

RED is the ordinary new-case shape: a fixture with `duration: cond ? 0 : 0.22` yields NO site on the unfixed scanner — the production line is form 3's `value !== null` guard in `scripts/scan-interaction-timings.ts`, which pushes nothing on the else path. Observe the red, implement, same command green.

1. New unit rows in `interactionTimingScan.test.ts` (write first): fixture-based, one per NODE KIND of the spec §2.2 accept-set — a `PropertyAssignment` ternary value, a call-expression value, an identifier value, a `ShorthandPropertyAssignment`, a `JsxAttribute` expression-container non-numeric value, and a `JsxAttribute` non-numeric string value — each yields `kind: "unclassified"` with `propertyKey` set and `name` = the value text (60-char collapse; the shorthand's name is its identifier). Positive-predicate rows cover EVERY accept-set form, not just the census spellings (R1 F2): bare `duration`, whole-word `timeout`, camel `ttlMs`, snake `deadline_ms`, camel suffix `fooTimeout`, and `retrySeconds` — each with a non-literal value yields an unclassified site. Stays-quiet rows: a numeric-literal property still yields `motion-duration`; boundary-predicate rejections (`items`, `rooms`, `searchParams` keys with non-literal values) contribute NOTHING.
2. GREEN: the new unclassified paths land behind the boundary-aware key predicate (spec §2.2; `TIMING_NAME` untouched on every existing path). The live sites now surface in the repo scan; the inventory test reds until step 3 dispositions them.
3. Dispositions: FIVE `UNCLASSIFIED_DISPOSITIONS` rows covering the six census sites (rows key by `(file, name)`; the two identical `GalleryLightbox` `emblaDuration(prefersReducedMotion)` expressions share one key), no `DESIGN.md` edit (spec R1 F5/F6 — a `value: null` site cannot reach `inventoryRows`; §5.5 stays byte-identical, proven by a stays-quiet population pin). Row text names where each value lives: the reduced-motion ternaries (`EventRow`, `RightNowHero`, and the binding behind `CrewSectionTransition`'s shorthand) at 0 reduced / 0.22 normal; `emblaDuration(...)` live 22 (embla tween-speed unit) ×2; `motionDuration` 0.22 in-file. Two further executable pins (R1 F3): a SIX-SITE LIVENESS row asserting the repo scan's per-`(file, propertyKey, name)` site COUNTS equal the census multiset — `GalleryLightbox` carries `emblaDuration(prefersReducedMotion)` ×2 and `motionDuration` ×1, the other files ×1 each — so EITHER duplicate occurrence vanishing drops a count and fails, line-independently (plan R2 F1: a mere containment check keyed without counts cannot see one of two identical sites disappear); and a DISPOSITION-USAGE row asserting every `UNCLASSIFIED_DISPOSITIONS` entry matches at least one site in the current scan (`scanRepo` only ever subtracts disposition keys — probed at its `dispositioned` filter — so nothing else notices a stale row). The two `ttlMs: ANNOUNCE_LOG_TTL_MS` pass-throughs must be observed auto-resolving via the covered-names filter (assert, don't assume). `pnpm vitest run tests/docs/` green.
4. Scanner header refresh in the same commit: the "PROPERTIES ARE LITERAL-ONLY … REAL GAP" paragraph becomes the closed contract (node-kind accept-set + predicate split + its §4.4 fence); the `BL-TIMING-SCAN-NAME-VS-BINDING` pointer stays.
5. Commit: `fix(infra): report non-literal timing-named property values as unclassified across all property forms; disposition the live sites`.

### Task 3 — mutation-registry work

<!-- task: red=`pnpm heavy pnpm mutation:guards` ac=AC-5,AC-6 -->

RED is executable on the same command: step 2 adds the `GUARD_SURFACES` row for `premiseScan` ALONE — `tests/mutation/guardSurfaces.gate.test.ts` reds deterministically at its registry-parity assertion (`Object.keys(EXPECTED_LEDGER_KINDS)` must equal every surface id), observed and recorded; the Task 2 source edit additionally stales `interactionTimingScan`'s LINE-keyed accepted rows, which the gate reports by construction. Steps 1-3 complete the work; the SAME command goes green.

1. **Re-derive `interactionTimingScan`'s accepted set** after the Task 2 edit (LINE-keyed ids shift; the row's own comment mandates `enumerateSites` re-derivation, never hand-adjustment).
2. **Enrol `premiseScan`:** row `premiseScan`, `sourcePath: "tests/mutation/source/premiseScan.ts"`, `suitePaths: ["tests/mutation/source/premiseScan.test.ts", "tests/mutation/_metaPremiseContract.test.ts"]` (both — the meta suite is the load-bearing consumer), operators `["relational-boundary", "equality-flip", "integer-literal"]` (29 pre-edit sites × 52.20s ≈ 25 min worst case, inside the ~45-minute ceiling; logical-connector and statement-removal recorded on the row as budget-excluded with these numbers; re-check counts on the post-edit source). Control mutant: a unique-occurrence behavior-changing literal on the POST-edit source, chosen at implementation with `grep -c` uniqueness proof (candidate: the `process.env` prefix string in `extentIsProvenance` flipped to a never-matching prefix — kills via the provenance fixtures); `validateSurface` enforces exactly-once. Add the `EXPECTED_LEDGER_KINDS` companion entry in `tests/mutation/guardSurfaces.gate.test.ts` (the gate's parity assertion reds without it — that red is this task's executable RED).
3. `pnpm heavy pnpm mutation:guards`: `premiseScan`'s `scoreFloor` is FIXED HERE at **0.95** (the `interactionTimingScan` convention — set at plan time, not after observing a run; R1 F5). Record BOTH surfaces' scores; disposition every survivor (suite extension, `equivalent`, or `accepted-gap` with ledger ref) until the gate is green at that floor with zero unaccepted survivors; STATE both scores + survivor sets in the round-1 diff brief (AGENTS.md convergence bullet 4).
4. Commit: `test(infra): enrol premiseScan; re-derive interactionTimingScan accepted set`.

### Task 4 — graduate the two entries

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts` ac=AC-7 -->

Archive-RED per entry: move each body to `BACKLOG-archive.md` WITH its `**Status:** IN PROGRESS · **Branch:** fix/scanner-scope-totality` marker intact → the named command fails BY NAME → strip → green. Resolution paragraphs record: for PREMISESCAN, the scope-aware model and that the AC-10b trade survived as a regression case; for TIMING-SCAN, the totality contract and the five dispositions. `pnpm vitest run tests/docs/` green. Commit: `docs(backlog): graduate the scanner scope/totality entries`.

<!-- tasks: end -->

### Task 5 — close the branch

1. `git merge origin/main` (ledger conflicts per-entry, both sides preserved).
2. Gates: `pnpm heavy pnpm test:fast`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, and the byte gate `git diff --exit-code origin/main -- DESIGN.md` (exit 0 required — AC-4's byte-identity claim proven by diff, not by the parsed-population pin alone; R1 F4).
3. Cross-model diff review to APPROVE — dispatched only after Tasks 1-4 are fully committed, no content commit after the final approving round (review covers what merges): codex-guard `--stage diff --round <n>`, cap 4; brief carries REVIEWER ONLY, CONSEQUENCE BOUND / PROBE DOMAIN / THREAT MODEL FENCE with "never silently wrong", VERDICT + FINDINGS lines, spec §1.1 do-not-relitigate, both mutation scores + survivor sets.
4. Markers: Task 4's archive moves stripped both inside the graduating commits (invariant 12's ratified graduating-entry rule); no separate strip commit, so the diff the final review round examines IS the diff that merges. Task 5 verifies the terminal state with a command whose EXIT CODE is the gate and whose sweep includes the archives the entries graduated into (R1 F7/F8): `! grep -q 'Branch:\*\* fix/scanner-scope-totality' BACKLOG.md DEFERRED.md BACKLOG-archive.md DEFERRED-archive.md` — exit 0 exactly when no marker survives anywhere (bare `grep -c` exits 1 on its own zero-match success state and reads only the open queues). Then PR (preflight ran); real CI green; `gh pr merge --merge`; ff main; `0 0`.

## Acceptance criteria (spec §6, restated for the task markers)

- **AC-1** two-variant scope fixtures: both classify environment-touching (red first: describe-scope variant free on the unfixed tree).
- **AC-2** AC-10b collision + parameter-shadow fixtures stay environment-free; aliased-import fixture fires environment-touching.
- **AC-3** phantomGapExecuted-shaped suites classify without hoisting; both stale restriction comments updated in the behavior-changing commits.
- **AC-4** all three property node kinds report unclassified with propertyKey; boundary-predicate rejections contribute nothing; six census sites covered by five disposition rows; DESIGN.md byte-identical; tests/docs green.
- **AC-5** interactionTimingScan gate green post-re-derivation, score ≥ 0.95, survivors stated in the round-1 diff brief.
- **AC-6** premiseScan enrolled with stated score and empty-or-accepted survivor set.
- **AC-7** both claimed entries graduated; BL-PREMISESCAN-IMPORT-EDGE-FIDELITY filed and OPEN; markers per spec §3; tests/docs green.

## Adversarial review (cross-model)

This plan: self-review → codex-guard `--stage plan --round <n>` to APPROVE before execution handoff.

## Execution handoff

A NEW Opus pane executes from `HANDOFF.md` in this directory after the authoring PR merges. Never end a turn mid-pipeline; 10-minute nudge per Stage-0 semantics.

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [x] Every named file/symbol re-grepped (pre-draft pass above).
- [x] Anti-tautology: fixture expectations derive from fixture-local shapes; the fires fixture's red is observed on the unfixed tree; stays-quiet halves accompany every fires half.
- [x] Reconciliation sweeps authored AND RUN: the five-site verification, the runtime/site-count probes.
- [x] `red=` validity: Tasks 1/2 name the production line for their new cases; Task 4 is the archive-RED; Task 3 sits outside the marker region with its reason stated inline.
- [x] `pnpm spec:lint` on this plan: 0 hard.
- [x] Numeric sweep after every repair round.
