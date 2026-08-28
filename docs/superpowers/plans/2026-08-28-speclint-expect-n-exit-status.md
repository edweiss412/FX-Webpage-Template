# spec:lint expect-N exit-status arms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `EXPECT_N_UNENFORCED` (static Arm A) and `PLAYWRIGHT_COLLECTS_NOTHING` / `PLAYWRIGHT_COLLECTION_UNVERIFIED` (observed Arm B) in a new pure module, wire Arm B under the existing `--exec-red` flag, enrol the module in the source-mutation registry, and graduate `BL-SPECLINT-EXPECT-N-EXIT-STATUS`.

**Spec:** `docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md` (APPROVED r3) — read in full first; §4 (Arm A grammar + measured accept-set), §5 (Arm B rules 1–4, config set, normalization, verdicts, measured verdict-set), §6 (surface and wiring), §7 (documented limits), §8 (test plan) are the contract every task argues from. Spec §1.1 is binding — do not relitigate any bullet there.

**Tech stack:** TypeScript, vitest, the pure `lib/specLint/**` core + `scripts/spec-lint.ts` adapter, the in-repo source-mutation harness.

## Global constraints

- Worktree-only (invariant 11); TDD per task (invariant 1); commit per task, conventional commits (invariant 6); push after every commit.
- Full-suite vitest and every `pnpm mutation:guards` run go under the semaphore: `pnpm heavy <cmd>` / `pnpm heavy:mutation <cmd>`. Scoped vitest runs with explicit file lists stay unwrapped. The two `--list` spawns in Task 3's manual verification boot no `webServer` and are cheap; the corpus SUITE never spawns Playwright.
- No `Check` union member, no `CHECK_ORDER` row, no render-`checks` edit: both arms report under `taskContract` (spec §6). The wiring diff is ONE appended `runLint` parameter plus the adapter's spawn-and-inject block.
- Fixture discipline: each fixture states its expected finding count and code; each gate-rejection fixture names the single §4.1/§5.1 rule it exercises, so a rule deletion fails exactly its fixture — with ONE documented exception: §4.1 rule 2 (non-empty command) is unreachable through the anchored rule-1 pattern, whose `(?<cmd>.*\S)` group already requires a non-blank command (probed at plan review R1: zero corpus lines match rule 1 and fail rule 2; a comment-only line fails rule 1 outright). Rule 2 is defense-in-depth in the implementation, carries NO deletion-sensitivity fixture, and the comment-only-line fixture documents the §4.4 taxonomy instead. Premises execute unconditionally via `tests/_shared/premise.ts`.
- impeccable-gate: N/A — no UI surface.

**Meta-test inventory (writing-plans rule):** this plan EXTENDS `tests/mutation/source/registry.ts` (one `GuardSurface` row), `tests/mutation/source/expectedLedgerKinds.ts` (one row), `tests/mutation/_metaPremiseContract.test.ts` (one suite-path declaration), and `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED` — one row). It CREATES no new meta-test. `tests/specLint/_metaPureCore.test.ts` covers the new module automatically (recursive walk over `lib/specLint/`). No Supabase call boundary, no admin alert, no tile, no advisory lock registry applies.

**Registry count reconciliation (authored AND run):** `pnpm tsx -e "import { GUARD_SURFACES } from './tests/mutation/source/registry'; console.log(GUARD_SURFACES.length)"` → 56 surfaces at plan time (base `6441d5e4cc1e`; run 2026-08-28). This plan adds exactly one (`specLintExpectContract`) → 57. `EXPECTED_LEDGER_KINDS` gains exactly the row the final accepted-ledger holds (starting claim `{}`; updated in Task 4 if the scored run's disposition adds `equivalent` rows — the two must match at commit time, never aspirationally).

**Mutation-family closure (writing-plans rule):** operators are the registry's full `[...OPERATOR_NAMES]` set (`tests/mutation/source/operators.ts:17-24`: relational-boundary, equality-flip, logical-connector, integer-literal, regex-quantifier-bound, statement-removal), matching the `specLintNumerics` row (`tests/mutation/source/registry.ts:1691`). A reviewer-proposed NEW family is a registry change with its own numbers, not a finding against this plan.

**Calibration inputs (probed at spec stage, 2026-08-28, base `6441d5e4cc1e`):** Arm A — 23 corpus lines contain `# expect `, grammar fires on exactly 10 (spec §4.4 table), 13 decline; end-anchor-removed mutant fires the two §4.2 prose sites. Arm B — 253 candidates, 22 multi-file, 301 file tokens, configs `(default)`=177 / `tests/e2e/standalone.config.ts`=76, one rule-3 decline (`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:173`), one rule-4 decline (`docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138`); verdict measurement 274 present / 27 absent across 26 candidates / zero false. The corpus suite re-derives the SETS; the scalars are dated.

## Acceptance criteria

- AC-1 Arm A grammar: §4.1 rules 1–3 each independently exercised; the two §4.2 prose shapes decline; every §4.4 decline-reason class has a fixture; finding shape per §4.5 (`taskContract` / `EXPECT_N_UNENFORCED` / advisory / anchored at the `#` column).
- AC-2 Arm B extraction: §5.1 rules 1–4 each independently exercised (global file tokens; the `-c` alias; a `sh -c` wrapper NOT read as config; continuation decline; multi-invocation decline); config sentinel `(default)`.
- AC-3 Arm B observation contract: the ADAPTER export `buildCollectedSets` (scripts/spec-lint.ts — the tested-adapter precedent of `classifySpawnResult`/`runCli`) parses captured real reporter JSON, joins each `file` to that report's own `config.rootDir`, repo-relativizes into §5.1 token spelling (raw passthrough fails the fixture assertion), keys by config with one entry per DISTINCT config, and converts a failed spawn outcome into `{ unavailable }`; `configsToProbe` returns distinct configs only; an `unavailable` config yields `PLAYWRIGHT_COLLECTION_UNVERIFIED` (advisory) and NEVER the fail. The pure module keeps EXACTLY the spec §6 four exports — normalization lives in the adapter, as spec §5.2 assigns it.
- AC-4 Arm B verdicts: one fail per absent token (first-present-later-absent multi-file case draws exactly one, naming the absent file); every-file-present draws nothing; the incident line (`docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md:100`) draws `PLAYWRIGHT_COLLECTS_NOTHING` under `(default)` when its file is injected absent.
- AC-5 CLI wiring: Arm A runs unconditionally on plan-kind docs; Arm B emits NOTHING without `--exec-red`; with it, both codes render through the existing `taskContract` group.
- AC-6 Corpus measurement: a suite walking `git ls-files docs/superpowers/plans` asserts the Arm A fire-set equals the §4.4 ten by equality, and the Arm B extraction finds the incident line with config `(default)`, exactly 2 distinct configs corpus-wide, the `-c` candidate resolving standalone, the multi-file absent-second-file candidate carrying both tokens, and the rule-3/rule-4 decline instances declining — with executable premises (a known-positive fire site, a non-empty candidate set).
- AC-7 Mutation enrolment: `specLintExpectContract` registry row (full operator set, measured `millisPerBoot`, live control edit), premise-contract declaration, scored `pnpm heavy:mutation pnpm mutation:guards` run with an EMPTY unaccepted-survivor set at the row's floor, and the score + operators recorded for the diff-review brief's `GUARD SURFACE:` line.

### Task 0 (setup, outside the checked task region): fresh base + anchor re-verification

- [ ] `git fetch origin && git merge origin/main --no-edit`; on lockfile movement `pnpm install`; `pnpm preflight`.
- [ ] Re-verify drafting-time anchors on the merged tree: `rg -n "export function runLint" lib/specLint/run.ts` (locator :102), `rg -n "acCoverage\?:" lib/specLint/run.ts` (current last appended slot, :125), `rg -n "ExecOutcome" lib/specLint/types.ts` (:173), `rg -n "deriveCollectionProbe" lib/specLint/redContract.ts` (:648). Update task-body locators if drifted — the claims, not the numbers, are the contract.

<!-- tasks: depth=3 red-contract -->

### Task 1: lib/specLint/expectContract.ts (new module) — Arm A `EXPECT_N_UNENFORCED`

<!-- task: red=`pnpm vitest run tests/specLint/expectContract.test.ts tests/specLint/expectContractCorpus.test.ts` red-state=authored red-target=`lib/specLint/expectContract.ts` why=`module absent; every case fails on the unresolved production import, and after the export skeleton lands the fixture cases still fail because checkExpectN returns [] - green arrives only with the §4.1 grammar (pattern, non-empty command, assertion-opener rejection, end anchoring)` ac=AC-1,AC-6 -->

**Files:**

- Create: lib/specLint/expectContract.ts (plain text: not tracked yet)
- Create: tests/specLint/expectContract.test.ts
- Create: tests/specLint/expectContractCorpus.test.ts (Arm A half; Task 2 extends it)

**Interfaces:**

- Produces: `checkExpectN(model: DocModel, kind: "spec" | "plan"): Finding[]` — pure, no `node:` imports (`tests/specLint/_metaPureCore.test.ts` walks the dir), `check: "taskContract"`, `code: "EXPECT_N_UNENFORCED"`, `severity: "advisory"`, anchored at the line and the `#` column (spec §4.5). Plan-kind only: `kind === "spec"` returns `[]`.
- Consumes: `DocModel.lines` only (fence membership deliberately unread — spec §4.3).

**Steps:**

- [ ] RED: author tests/specLint/expectContract.test.ts (new) — per-rule fixtures, each naming the single §4.1 rule it exercises: the pattern match (rule 1) with a bare-integer comment; the comment-only line `# expect 72` failing rule 1's pattern outright (the §4.4 taxonomy row; rule 2 has no independent fixture — see the fixture-discipline exception above); assertion openers `test ` / `[ ` / `[[ ` declining (rule 3); the two §4.2 prose shapes (inline-span quote with trailing prose; table-cell quote) NOT firing on their raw lines; the parenthetical form `# expect 2 (…)` firing; trailing unparenthesised prose (`# expect 0 before a run`) declining; non-integer expectations (`green`, `empty`) declining; spec-kind doc returning `[]`; finding anchored at the `#` column. Derive every expected value from the fixture text in the test body, never from a hand-copied literal.
- [ ] RED: author the Arm A half of tests/specLint/expectContractCorpus.test.ts (new) — walk `git ls-files docs/superpowers/plans` from the repo root, run `checkExpectN` over each parsed doc, assert the fire-set EQUALS (set equality on `path:line`) the §4.4 ten. `premise(fireSet.size > 0, …)` and `premise` that the known-positive `docs/superpowers/plans/2026-08-18-control-outline-border-token.md` is among the walked files — the empty-sweep guard (`tests/_shared/premise.ts`).
- [ ] Observe RED: both suites fail on the unresolved import of the new module.
- [ ] GREEN: implement `checkExpectN` exactly as spec §4.1 — the end-anchored pattern, rule 2, the CLOSED opener list. Nothing else.
- [ ] Pre-dispatch mutants (recorded in the commit message). String-presence quartet on the §4.5 message/code assertions: (a) the message string emptied; (b) the expected message plus an appended suffix; (c) the code present in the module but not live on the emit path (behind a false condition) — the fixture asserting the emitted finding carries `EXPECT_N_UNENFORCED` must fail; (d) each discriminating parameter varied in turn — the anchored line, the `#` column, the captured N. Grammar mutants on top: (e) end-anchor removed — the corpus suite must fail with the two §4.2 sites appearing in the fire-set; (f) opener list emptied — the opener fixture must fail; (g) `\d+` swapped to `.+` — the non-integer fixtures (`green`, `empty`) must fail by FIRING (probed at plan review R1: `\d*` is NOT killed by them — `[ \t]+` still refuses the non-integer tail — so `.+` is the discriminating mutant). Run each against the suites; all must go red; revert.
- [ ] `pnpm exec tsx scripts/spec-lint.ts docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md` still 0 hard (no wiring yet — Arm A is not called by `runLint` until Task 3; the suites drive the module directly).
- [ ] Commit `feat(infra): specLint Arm A EXPECT_N_UNENFORCED — grammar + corpus fire-set` (scope note: `lib/specLint` tooling lands under the `infra`-adjacent scope used by prior specLint arcs; match `git log --oneline -- lib/specLint` conventions), push.

### Task 2: Arm B pure core — extraction, config resolution, normalization, verdicts

<!-- task: red=`pnpm vitest run tests/specLint/expectPlaywright.test.ts tests/specLint/expectContractCorpus.test.ts` red-state=authored red-target=`lib/specLint/expectContract.ts` why=`playwrightCollectionPlan, configsToProbe and synthesizeCollectionVerdicts are absent from the Task-1 module - the new suite fails on missing exports, and the corpus suite's new Arm B assertions (incident line as candidate, 2 distinct configs, -c resolving standalone, rule-3/rule-4 declines) fail against an extraction that does not exist` ac=AC-2,AC-3,AC-4,AC-6 -->

**Files:**

- Modify: lib/specLint/expectContract.ts (plain text: created by Task 1)
- Create: tests/specLint/expectPlaywright.test.ts
- Modify: tests/specLint/expectContractCorpus.test.ts (Arm B half)

**Interfaces (spec §6 table):**

- `playwrightCollectionPlan(model, kind): PlaywrightCandidate[]` — `{ line, files: string[], config: string }`, §5.1 rules 1–4, spans + fenced lines, config from the closed `{--config, -c}` set searched from the `playwright test` match onward.
- `configsToProbe(plan): string[]` — distinct config values.
- `synthesizeCollectionVerdicts(plan, collected): Finding[]` — `collected: ReadonlyMap<string, ReadonlySet<string> | { unavailable: string }>`; trichotomy per §5.3, one fail per absent token, `PLAYWRIGHT_COLLECTION_UNVERIFIED` advisory for unavailable, nothing without an entry consulted (the caller passes only observed configs).

**Steps:**

- [ ] Implementation contract for rule isolation (plan review R1 F2): rule 1 is an AT-LEAST-ONE gate (`match count >= 1`) and rule 4 is a MORE-THAN-ONE decline (`match count > 1`), two separate checks — so the zero-invocation fixture isolates rule 1 (deleting rule 1 admits it; rule 4 as a `>1` check passes count 0) and the `&&` fixture isolates rule 4.
- [ ] RED: author tests/specLint/expectPlaywright.test.ts (new) — one fixture per §5.1 rule (rule 1 absent → non-candidate, isolated per the contract above; rule 2 global: multi-file candidate carries ALL tokens, AND a rule-2 rejection fixture — a `playwright test --project=x` invocation naming NO spec-file token is not a candidate; rule 3: continuation line declined; rule 4: two `playwright test` pairs joined by `&&` declined whole — the `docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138` shape); the `-c` alias resolving (the `docs/superpowers/plans/2026-07-18-modal-close-exit-anim/01-tasks.md:1003` shape); a `sh -c '…'`-wrapped command whose config stays `(default)` (wrapper flag precedes `playwright test`); `--config=` equals-form; verdict trichotomy incl. the first-present-later-absent multi-file candidate drawing exactly ONE fail naming the absent file (the `01-shell-and-strip.md:171` shape), and `unavailable` yielding the advisory NEVER the fail. Adapter normalization is Task 3's surface, not this task's.
- [ ] RED: extend the corpus suite — Arm B extraction over the walked corpus: the incident line (`docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md:100`) is a candidate with config `(default)`; exactly 2 distinct configs corpus-wide; the `-c` candidate resolves `tests/e2e/standalone.config.ts`; the multi-file candidate at `01-shell-and-strip.md:171` carries both its tokens; `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:173` and `docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138` are NOT candidates (rules 3/4). `premise(candidates.length > 0, …)`. Scalar totals (253/301) are NOT asserted (spec §8).
- [ ] Observe RED: missing exports; corpus Arm B assertions fail.
- [ ] GREEN: implement the four exports per spec §5.1–§5.3.
- [ ] Pre-dispatch mutants (recorded in the commit message). String-presence quartet on the fail-verdict message assertions (file + config named): (a) the named file emptied from the message; (b) message plus appended suffix; (c) the file name present in the finding detail but not in the asserted message position; (d) discriminating parameters swapped in turn — file for config, line for column. Extraction mutants on top: (e) file-token regex made non-global — multi-file fixture + corpus both-tokens assertion fail; (f) `-c` dropped from the flag set — alias fixture + corpus `-c` assertion fail; (g) position rule dropped (search whole text) — `sh -c` fixture fails; (h) rule 4 dropped — multi-invocation fixture + corpus non-candidate assertion fail. All red; revert.
- [ ] Commit, push.

### Task 3: wiring — `runLint` appended slot + adapter spawns under `--exec-red`

<!-- task: red=`pnpm vitest run tests/specLint/expectContractCli.test.ts` red-state=authored red-target=`lib/specLint/run.ts:102` why=`runLint composes the existing checks only - checkExpectN is never called, so a CLI-driving test over a fixture plan doc finds no EXPECT_N_UNENFORCED in the text render; and with --exec-red plus an injected collection the PLAYWRIGHT_COLLECTS_NOTHING verdict never appears because no parameter carries the observation - green arrives with the ONE appended optional parameter (after acCoverage, run.ts:125 slot rule) and the adapter block` ac=AC-5 -->

**Files:**

- Modify: lib/specLint/run.ts (ONE appended optional parameter after `acCoverage` — the slot-rule comment at `lib/specLint/run.ts:109-125` governs; one parameter carrying `{ plan, collected }` for Arm B; Arm A called unconditionally for plan-kind)
- Modify: scripts/spec-lint.ts — TWO pieces, both TESTED (plan review R1 F4; the tested-adapter precedent is `classifySpawnResult` (`scripts/spec-lint.ts:135`), `runCli` (`scripts/spec-lint.ts:455`) and `nodeDeps` (`scripts/spec-lint.ts:838`), imported by `tests/specLint/redExec.test.ts:6`):
  - a new EXPORTED adapter function `buildCollectedSets(results, repoRoot)` — input one record per distinct config `{ config, outcome, stdout }`; parses reporter JSON, reads that report's own `config.rootDir`, joins + repo-relativizes each `file` into §5.1 token spelling, returns the `ReadonlyMap<string, ReadonlySet<string> | { unavailable: string }>` the pure core consumes; a non-exit-0 or unparseable outcome becomes `{ unavailable }` with the reason (reusing `ExecOutcome` classification, `lib/specLint/types.ts:173`);
  - the `--exec-red` block: `playwrightCollectionPlan` over the doc, `configsToProbe` dedup, ONE spawn per distinct config through the existing `CliDeps` spawn seam, then `buildCollectedSets`, then inject into `runLint`.
- Create: tests/specLint/expectContractCli.test.ts
- Create: tests/specLint/__fixtures__/playwright-list-report.json (captured real `--list --reporter=json` output, trimmed; carries a real `config.rootDir` and ≥1 spec entry — the AC-3 fixture)

**Steps:**

- [ ] RED (adapter unit, the R1 F4 executable proof): `buildCollectedSets` over the committed reporter fixture yields keys in repo-relative token spelling (assert a known token IS in the set and its raw basename spelling is NOT); a constructed timeout outcome yields `{ unavailable }` carrying the reason; a constructed exit-1 outcome likewise; an unparseable-stdout record likewise; one input record per config in, one map entry per config out. `premise` that the fixture holds ≥1 spec entry and a non-repo-relative raw `file` value.
- [ ] RED (spawn-plan dedup): with an injected `CliDeps` spawn recorder (the `runCli(argv, deps)` seam), a fixture doc naming three candidates across two configs spawns EXACTLY TWO `--list` commands, each carrying `--reporter=json` and the right `--config` flag presence/absence — this fails while the `--exec-red` block does not exist, and catches wrong command construction and missing dedup.
- [ ] RED (render): a fixture plan doc with an Arm A site renders `EXPECT_N_UNENFORCED` in the default (no-flag) run; the same doc with a Playwright candidate renders NO Arm B code without `--exec-red`; with `--exec-red` and the recorder deps returning the fixture report, the absent-file case renders `PLAYWRIGHT_COLLECTS_NOTHING` and the unavailable case renders `PLAYWRIGHT_COLLECTION_UNVERIFIED`. Silent-drop of the codes in the render path is the `CHECK_ORDER` incident class (`lib/specLint/types.ts:14-33`) — both arms report under `taskContract`, so no renderer edit is needed and the test proves it.
- [ ] Observe RED on the unwired tree (no appended parameter, no adapter exports).
- [ ] GREEN: wire per spec §6. No new flag; no `Check` member; the pure module keeps exactly the spec's four exports.
- [ ] Pre-dispatch mutants (recorded in the commit message). String-presence quartet on the rendered-code assertions: (a) rendered code string emptied; (b) code plus appended suffix; (c) code present in `--json` output but dropped from the text render — the text-render assertion must fail; (d) discriminating parameters varied — the two codes swapped, the config name dropped from the message. All red; revert.
- [ ] Manual verification (recorded in commit message, not a suite): `pnpm exec tsx scripts/spec-lint.ts --exec-red docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md` names `popover-clip-fit.spec.ts` under `(default)` — the row's done condition, observed live (two `--list` spawns, no webServer).
- [ ] Commit, push.

### Task 4: mutation enrolment — registry row + declarations, scored run

<!-- task: red=`pnpm vitest run tests/mutation/_metaPremiseContract.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/_metaPremiseContract.test.ts:32` why=`adding the specLintExpectContract registry row WITHOUT the suite-path declaration reds the premise-contract walk (fail-by-default on a newly enrolled suite) - red observed after the registry edit and before the declaration; the SAME command greens with the declaration row` ac=AC-7 -->

**Files:**

- Modify: tests/mutation/source/registry.ts (`specLintExpectContract`: sourcePath = the new module (plain text: lib/specLint/expectContract.ts); suitePaths = the three deciding suites from Tasks 1–2 (plain text: expectContract.test.ts, expectPlaywright.test.ts, expectContractCorpus.test.ts); operators `[...OPERATOR_NAMES]`; scoreFloor matching the specLint sibling rows; `millisPerBoot` MEASURED from a timed scoped run, never estimated; control edit: flip the Arm A message string — the §4.5 literal — which the message fixture must notice)
- Modify: tests/mutation/source/expectedLedgerKinds.ts (`specLintExpectContract: {}` — updated in the same commit as any accepted/equivalent disposition the scored run produces)
- Modify: tests/mutation/_metaPremiseContract.test.ts (suite-path declaration row)

**Steps:**

- [ ] Registry row first; observe RED on the premise-contract walk; add the declaration; GREEN.
- [ ] `pnpm heavy:mutation pnpm mutation:guards` scoped to the surface; classify every survivor: repair the suite, or ledger a genuine `equivalent` with its reason. The task is done ONLY at an empty unaccepted-survivor set at the row's floor.
- [ ] Record score, survivor dispositions, and the `OPERATORS: all` tail in the commit message — these are the diff-review brief's `GUARD SURFACE:` line inputs.
- [ ] Commit, push.

### Task 5: ledger graduation (the PR's LAST commit)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:660` why=`the archive-only walk iterates BACKLOG_GRADUATED rows: adding the BL-SPECLINT-EXPECT-N-EXIT-STATUS row FIRST, before the archive move, reds the walk (id still present in BACKLOG.md, missing from BACKLOG-archive.md); the SAME command greens when the archive section lands with the IN PROGRESS marker stripped in the same edit session` ac=AC-8 -->

**Files:**

- Modify: BACKLOG.md (remove the `BL-SPECLINT-EXPECT-N-EXIT-STATUS` body + its `**Status:** IN PROGRESS · **Branch:** feat/speclint-expect-n-exit-status` marker — invariant 12: the marker never reaches main)
- Modify: BACKLOG-archive.md (graduated entry: what shipped, the two codes, the zero-false measurement, the mutation score)
- Modify: tests/docs/_metaDeferralLedgerGraduation.test.ts (`BACKLOG_GRADUATED` — one row)
- Modify: docs/review-rounds/LIMITS.md (`LIM-EXPECT-N-COMMENT` entry: mark the `# expect N` + Playwright-collection shapes MECHANIZED by this arc, pointing at the spec; the non-integer/trailing-prose/whole-line residue stays parked under the spec's §7 with its re-file triggers)

**Steps:**

- [ ] Add the graduation row; observe RED; move the ledger body to the archive with the marker stripped; GREEN.
- [ ] This is the PR's last commit before the diff-stage review of the final head. Push.

<!-- tasks: end -->

- AC-8 Ledger graduation: the BL row is archived with the in-progress marker stripped in the same commit, the graduation meta-suite green.

## Verification (whole-arc)

- Scoped (unwrapped): `pnpm exec vitest run tests/specLint/expectContract.test.ts tests/specLint/expectPlaywright.test.ts tests/specLint/expectContractCorpus.test.ts tests/specLint/expectContractCli.test.ts tests/specLint/_metaPureCore.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts tests/mutation/_metaPremiseContract.test.ts tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts`
- `pnpm typecheck` and `pnpm exec eslint lib/specLint/expectContract.ts tests/specLint scripts/spec-lint.ts` (unwrapped).
<!-- gate: cmd=`pnpm exec tsx scripts/spec-lint.ts docs/superpowers/plans/2026-08-28-speclint-expect-n-exit-status.md` probed=`constructed failing input observed: the 15-hard draft of this file exited 1 (2026-08-28); exits 0 after repairs` -->

- The gate above: this plan lints 0 hard at every commit.
- Full suite before handing to bl-orch: `pnpm heavy pnpm test:fast` (or CI unit-suite green at the shipping SHA per the arc brief — readiness is CI's, not local's).
- Round-1 diff brief carries: `GUARD SURFACE: lib/specLint/expectContract.ts, MUTATION SCORE: <n>/<m>, 0 unaccepted survivors, OPERATORS: all` — the Task 4 outputs, stated verbatim in the conforming grammar.

## 12. Closeout

impeccable-gate: N/A — no UI surface
