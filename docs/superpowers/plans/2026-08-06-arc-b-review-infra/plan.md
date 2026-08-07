# Arc B implementation plan — review-infra pair

> **For agentic workers:** execute task-by-task per `HANDOFF.md` in this directory (the Opus pane's entry point, reached after arc C completes). The spec is `docs/superpowers/specs/2026-08-06-arc-b-review-infra.md`; this plan carries its own adversarial-review gate below.

**Goal:** land both entry dispositions — the five-shape plan-fence gate (blocking, baseline-ratcheted, waiver-capable) and the vendored block-level CommonMark parse replacing codex-guard's recognizer — on one implementation branch to a merged PR. **Claude implements (user routing 2026-08-06); Codex reviews.**

**Architecture:** `docs/arc-b-spec` (this branch: spec + plan + HANDOFF + probe artifacts + claim handoff) merges first; then `feat/review-infra-gates` (worktree `../FX-worktrees/review-infra-gates`, created off `origin/main` with claims pushed BEFORE this branch merges, per spec §3) implements G1–G3 in order.

**Date:** 2026-08-06 · **Spec:** `docs/superpowers/specs/2026-08-06-arc-b-review-infra.md` · **Status:** DRAFT

## Global constraints

- AGENTS.md invariants this arc exercises: 1 (TDD), 6 (conventional commits), 11 (worktree-only), 12 (claims). No UI surface: `impeccable-gate: N/A — no UI surface`.
- The archive RED for both archive steps: move the entry body to `BACKLOG-archive.md` WITH its flight marker, observe `tests/docs/_metaLedgerInProgress.test.ts` fail by name, strip, green.
- Guard-premise rule (`tests/_shared/premise.ts`) binds both new guard surfaces: the fence gate's planted fixtures execute unconditionally; the codex-guard fixtures run through the CLI harness (behavioral, not `.each`-gated).
- No code snippet in this plan is a paste-ready module — task bodies name symbols and contracts; the implementer writes code against the spec's accept-sets (this satisfies the typecheck-pasted-snippets rule by carrying no pasted snippets).

## Pre-draft verification pass (writing-plans rule)

Grep-verified 2026-08-06 (citation pass at `a0e41551c` + the committed probe); anchors file + symbol, line numbers drafting-time locators.

- `lib/specLint/parse.ts` `WAIVER` regex :35 (`spec-lint: (ignore|not-ui) — reason`); empty reason → `WAIVER_MISSING_REASON` (:115-131). Coverage semantics in `lib/specLint/run.ts`: `targetOf` :57 (walks past blanks/waivers to the next real line), `coverageOf` :66 (a waiver targeting a fence OPENING delimiter covers the whole block to the closer or EOF); `UNSUPPRESSIBLE` set; unused waiver emits "waiver suppressed nothing".
- CI wiring: `tests/docs/**/*.test.{ts,tsx}` in the `parallel` project (`vitest.projects.ts` :134), run by `.github/workflows/unit-suite.yml` `unit-suite-nodb` (`--project=parallel --shard=N/3`, :146/:176), aggregated by the required `unit-suite` job (:178). A new test under `tests/docs/` is wired by existence.
- `pnpm spec:lint` = `tsx scripts/spec-lint.ts` (`package.json` :27); `tests/specLint/` (13 files) tests the lib core + CLI against fixtures; `tests/specLint/_metaPureCore.test.ts` pins lib-core I/O purity — the model for `lib/planFences/` purity.
- Corpus (probe of record v2, container-aware and untruncated per spec R1 F3, committed in this directory: fence-gate-probe.mjs + fence-gate-probe-2026-08-06.txt): 396 plan files with fences, 5,515 fences, 3,631 module-ish code fences; raw hits UNIMPORTED_IDENTIFIER 325 / DUPLICATE_IMPORT 5 / MANGLED_TEMPLATE 17 / UNCHECKED_INDEX 146 (candidates) / FENCE_EM_DASH 1,399 (all-fence scope; ships code-fence-scoped). The gate's extraction is container-aware with unplaced fences REPORTED (spec §2.1).
- Prototype remnants: zero hits for the five rule names outside the backlog entry — rebuild is from the entry's rule list + the probe, nothing else exists.
- `stripCodeBlocks` (`scripts/codex-guard.mjs` :537-603, doc comment :505-536): state machine over fence/indented blocks with single-column list approximation (`listCol`); blanks lines only on close (open-at-EOF strips nothing); helpers `FENCE_OPEN` :417, `FENCE_CLOSE` :419, `TAB_STOP` :420, `advance` :423, `indentColumns` :430, `scanContainers` :458, `MARKER_HEAD` :415. Exactly two callers: `parseVerdict` :663, `parseFindingCount` :737. Not exported; no direct unit test.
- codex-guard behavioral harness: `tests/codexGuard/harness.ts` :14 (`GUARD` = the script; CLI-driven). Fence suites in `tests/codexGuard/verdictEmphasis.test.ts`: describes at :94 (fenced example not a verdict), :214 (every block kind), :344 (list-marker-line opener), :431 (unclosed strips nothing), :559 (closer at 4+ columns is content), :611 (closes at 3), :631 (opener past 3 in a container hides). Also `lintDoc.test.ts` :21, `reviewRounds.test.ts`.
- Import surface of `scripts/codex-guard.mjs`: node builtins (:4, :17-19) plus sibling `scripts/reviewRoundEmit.mjs` (:21). No `require`, no `node_modules` specifier.
- Limit 12 lives at `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` §8.3 (heading :257, limit text :270); the codex-guard spec (`docs/superpowers/specs/2026-07-19-codex-guard.md`) has NO §8.3 — the entry's citation is drifted (spec §2.2 records the repair).
- `tests/docs/_ledgerMdast.ts` header: reference-only mdast walker for the deferral-ledger guard (remark/remark-gfm imports :18-20); its RATIFIED SCOPE note is the reject-regex-grammar precedent. NOT a dependency source for codex-guard (spec §1.1 item 4).

## Meta-test inventory (declared per writing-plans rule)

- **CREATES:** the _metaPlanSnippetFences meta-test under `tests/docs/` (walks plans from disk; auto-wired by the `tests/docs/**` glob — a rename out of that glob is forbidden); `lib/planFences/**` pure read-core (+ a purity assertion following `_metaPureCore`); the plan-fences CLI under `scripts/` + `plan:fences` npm script; the shrink-only baseline module beside the meta-test; planted premise fixture plans (one per rule) under the meta-test's fixture tree; codex-guard grammar fixtures.
- **EXTENDS:** `tests/codexGuard/verdictEmphasis.test.ts` (entry-probe regression fixtures + new grammar fixtures); the codex-guard tree gains the import-surface structural assertion.
- **Registries:** invariant-9/10 — none (scripts, lib, tests, docs). Advisory locks, §12.4 — untouched.

## Unit tasks — `feat/review-infra-gates`

### Task G1 — the plan-fence gate (spec §2.1)

1. **G1a — read-core, TDD per rule:** RED — unit suite for `lib/planFences/` with per-rule fixture strings: each of the five rules gets a positive case (the violation fires with file/fence-line/rule/INSTANCE named — spec §2.1's four-field identity) and boundary negatives (non-code fence skipped by the pinned eligibility predicate; unattributed fence still checked per-fence but exempt from DUPLICATE_IMPORT with attribution coverage reported; a `plan-fences: ignore RULE — reason` waiver suppressing exactly its named rule with the waived finding still REPORTED as waived; unknown rule name rejected; empty reason rejected; a waiver suppressing nothing rejected — the gate's own rule-scoped token per spec §2.1 R1 F2, spec-lint's region token deliberately not overloaded). The UNCHECKED_INDEX pattern is the spec's pinned regex; the sample-review here classifies a ≥20-hit sample of the 146 committed candidates and may only NARROW via named structural exclusions in the rule header, sample table in the commit message. GREEN — implement extraction, attribution (spec accept-set: nearest preceding non-blank prose line in a bounded window with exactly one backticked source-path token), the five rules, the known-API registry (closed list). Commit `feat(infra): plan-fence read-core with the five decidable shapes`.
2. **G1b — the gate + baseline:** RED — the meta-test walks BOTH the real plans tree and the planted fixture tree; against the planted tree it must fail naming every planted violation (premise: executes unconditionally, one planted plan per rule); against the real tree, its first run's hit list IS the baseline-generation input. GREEN — commit the generated baseline (rows `{path, fenceLine, rule, instance}` + occurrence count, spec §2.1 R1 F1); the meta-test passes exact-row matches within count, fails non-baseline hits INCLUDING a new same-rule instance in a baselined fence, and fails STALE baseline rows (shrink-only — same contract as the mutation harness's `staleRows`). Record the baseline row count in the task record. Commit `feat(infra): blocking plan-fence meta-test with shrink-only legacy baseline`.
3. **G1c — CLI:** `pnpm plan:fences` adapter reporting identical findings to the meta-test over the same tree (one shared core, two frontends — asserted by a test comparing both outputs on the fixture tree). Commit `feat(infra): plan:fences CLI adapter`.
4. **G1d —** archive the entry (archive RED) with accept-sets, baseline count, probe cross-ref. Commit `docs(backlog): archive BL-PLAN-SNIPPET-FENCE-GATE — gate live, baseline ratcheted`.

### Task G2 — the vendored CommonMark block parse (spec §2.2)

1. **G2a — feature probes become REDs:** for each grammar feature in the spec's MUST-cover core (fences-relative-indent [already shipped — regression only], indented blocks, list-container STACK with dedent pop, block-quote containers, lazy continuation) AND the MAY set (HTML blocks, link reference definitions, setext headings — the six limit-12 misses split per spec §2.2 R1 F5/F6), write a CLI-harness fixture asserting the CORRECT classification; run against the SHIPPED recognizer; record which fail (the probe run is the evidence, not limit 12's prose). A feature whose fixture already passes is a regression pin, not a miss. Also port the entry's shipped probes as named regression fixtures (indented closers 4/4 shape, indented openers 18/18 shape, nested marker-line 2/2). Commit `test(infra): commonmark grammar fixtures — misses red, shipped fixes pinned`.
2. **G2b — the parser:** replace `stripCodeBlocks` with the vendored block-level pass (inline in `scripts/codex-guard.mjs`; container stack with content-column arithmetic; open-at-EOF strips nothing preserved; callers `parseVerdict`/`parseFindingCount` untouched). All MUST-core G2a fixtures green (no documented-limit arm exists for the core — spec §2.2 R1 F5); existing `tests/codexGuard/` suites green, including the unclosed-fence acceptance pins (the ADMIT-direction open-at-EOF posture is PRESERVED, spec R1 F7). A MAY-set feature not covered lands as a documented-limit rewrite WITH its still-red fixture converted to a pinned-limit probe. Commit `feat(infra): vendor a block-level commonmark pass into codex-guard, retiring the recognizer`.
3. **G2c — contract pins:** the import-surface assertion pins the EXACT list — the four node builtins plus `scripts/reviewRoundEmit.mjs`, nothing else; ANY new specifier fails, relative siblings included (spec §2.2 R1 F8). Commit `test(infra): pin codex-guard's dependency-free import surface`.
4. **G2d — docs lockstep:** rewrite §8.3 limit 12 in `docs/superpowers/specs/ci/2026-08-04-review-round-economy.md` to the post-parse residue (each residual claim carries its probe fixture name); archive the entry (archive RED) with the citation repair (the entry's pathless "Spec §8.3" pointer → the round-economy spec) recorded. Commit `docs(backlog): archive BL-CODEX-GUARD-COMMONMARK-PARSE — parser vendored, limit 12 rewritten`.

### Task G3 — close the branch

1. Whole-diff codex-guard review `--stage diff` to APPROVE (round cap 4; REVIEWER ONLY; CONSEQUENCE BOUND / THREAT MODEL FENCE with the literal phrase "never silently wrong"; VERDICT + FINDINGS lines; spec §1.1 do-not-relitigate list — notably: five shapes closed, tsc rejected, vendor-inline ratified, new escaping shape needs a live mutant against the SHIPPED parser). Note the recursion wrinkle: the diff under review modifies the wrapper doing the reviewing — the dispatch runs the COMMITTED main-checkout `codex-guard.mjs` via the shim, not the branch copy; state this in the brief so the reviewer does not flag it.
2. Merge `origin/main`; strip surviving markers in the last pre-merge commit (both entries archive in G1d/G2d — terminal check `grep -c 'Branch:\*\* feat/review-infra-gates' BACKLOG.md DEFERRED.md` returns 0). PR (preflight ran — the branch runs test suites); real CI green; `gh pr merge --merge` same turn; ff main `0 0`.

## Adversarial review (cross-model)

- This plan: self-review (below) → codex-guard `--stage plan --round <n>` to APPROVE before the HANDOFF is finalized.
- Implementation branch: whole-diff `--stage diff` per G3.

## Execution handoff

Per spec §3: impl worktree + branch + claims land BEFORE this branch's PR merges; this branch strips its two markers in its last pre-merge commit; the Opus pane executes G1–G3 from `HANDOFF.md` here, LAST in the batch (A → C → B), with the arc-transition protocol at the boundary.

## Impeccable gate (this authoring branch)

impeccable-gate: N/A — no UI surface

## Self-review checklist (run before dispatching the plan review)

- [ ] Every named file/symbol re-grepped (pre-draft pass above).
- [ ] Anti-tautology: G1a fixtures assert named findings, not "the function ran"; G1b's planted-tree premise executes unconditionally; G2a fixtures observed against the SHIPPED recognizer before the parser lands; the baseline cannot pardon a NEW hit (only exact `{path, fenceLine, rule}` rows pass).
- [ ] No snippet pasted — nothing to typecheck; new-file wiring: the meta-test is glob-wired (verified above), the CLI needs only the `package.json` script line.
- [ ] `pnpm spec:lint docs/superpowers/plans/2026-08-06-arc-b-review-infra/plan.md` 0 hard.
- [ ] Numeric sweep after every repair round (probe counts 325/5/14/145/1378; corpus 395/5,434/3,585; five rules; six grammar features; two callers).
