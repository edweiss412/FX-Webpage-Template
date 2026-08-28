# spec:lint expect-N exit-status arms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land `EXPECT_N_UNENFORCED` (static Arm A) and `PLAYWRIGHT_COLLECTS_NOTHING` / `PLAYWRIGHT_COLLECTION_UNVERIFIED` (observed Arm B) in a new pure module, wire Arm B under the existing `--exec-red` flag, enrol the module in the source-mutation registry, and graduate `BL-SPECLINT-EXPECT-N-EXIT-STATUS`.

**Spec:** `docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md` (APPROVED r3) — read in full first; §4 (Arm A grammar + measured accept-set), §5 (Arm B rules 1–4, config set, normalization, verdicts, measured verdict-set), §6 (surface and wiring), §7 (documented limits), §8 (test plan) are the contract every task argues from. Spec §1.1 is binding — do not relitigate any bullet there.

**Tech stack:** TypeScript, vitest, the pure `lib/specLint/**` core + `scripts/spec-lint.ts` adapter, the in-repo source-mutation harness.

## Global constraints

- Worktree-only (invariant 11); TDD per task (invariant 1); commit per task, conventional commits (invariant 6); push after every commit.
- Full-suite vitest and every `pnpm mutation:guards` run go under the semaphore: `pnpm heavy <cmd>` / `pnpm heavy:mutation <cmd>`. Scoped vitest runs with explicit file lists stay unwrapped. The two `--list` spawns in Task 3's manual verification boot no `webServer` and are cheap; the corpus SUITE never spawns Playwright.
- No `Check` union member, no `CHECK_ORDER` row, no render-`checks` edit: both arms report under `taskContract` (spec §6). The wiring diff is ONE appended `runLint` parameter plus the adapter's spawn-and-inject block.
- Fixture discipline: each fixture states its expected finding count and code; each gate-rejection fixture names the single §4.1/§5.1 rule it exercises, so a rule deletion fails exactly its fixture. Premises execute unconditionally via `tests/_shared/premise.ts`.
- impeccable-gate: N/A — no UI surface.

**Meta-test inventory (writing-plans rule):** this plan EXTENDS `tests/mutation/source/registry.ts` (one `GuardSurface` row), `tests/mutation/source/expectedLedgerKinds.ts` (one row), `tests/mutation/_metaPremiseContract.test.ts` (one suite-path declaration), and `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED` — one row). It CREATES no new meta-test. `tests/specLint/_metaPureCore.test.ts` covers the new module automatically (recursive walk over `lib/specLint/`). No Supabase call boundary, no admin alert, no tile, no advisory lock registry applies.

**Registry count reconciliation (authored AND run):** `pnpm tsx -e "import { GUARD_SURFACES } from './tests/mutation/source/registry'; console.log(GUARD_SURFACES.length)"` → 56 surfaces at plan time (base `6441d5e4cc1e`; run 2026-08-28). This plan adds exactly one (`specLintExpectContract`) → 57. `EXPECTED_LEDGER_KINDS` gains exactly the row the final accepted-ledger holds (starting claim `{}`; updated in Task 4 if the scored run's disposition adds `equivalent` rows — the two must match at commit time, never aspirationally).

**Mutation-family closure (writing-plans rule):** operators are the registry's full `[...OPERATOR_NAMES]` set (`tests/mutation/source/operators.ts:17-24`: relational-boundary, equality-flip, logical-connector, integer-literal, regex-quantifier-bound, statement-removal), matching the `specLintNumerics` row (`tests/mutation/source/registry.ts:1691`). A reviewer-proposed NEW family is a registry change with its own numbers, not a finding against this plan.

**Calibration inputs (probed at spec stage, 2026-08-28, base `6441d5e4cc1e`):** Arm A — 23 corpus lines contain `# expect `, grammar fires on exactly 10 (spec §4.4 table), 13 decline; end-anchor-removed mutant fires the two §4.2 prose sites. Arm B — 253 candidates, 22 multi-file, 301 file tokens, configs `(default)`=177 / `tests/e2e/standalone.config.ts`=76, one rule-3 decline (`docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:173`), one rule-4 decline (`docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138`); verdict measurement 274 present / 27 absent across 26 candidates / zero false. The corpus suite re-derives the SETS; the scalars are dated.

## Acceptance criteria

- AC-1 Arm A grammar: §4.1 rules 1–3 each independently exercised; the two §4.2 prose shapes decline; every §4.4 decline-reason class has a fixture; finding shape per §4.5 (`taskContract` / `EXPECT_N_UNENFORCED` / advisory / anchored at the `#` column).
- AC-2 Arm B extraction: §5.1 rules 1–4 each independently exercised (global file tokens; the `-c` alias; a `sh -c` wrapper NOT read as config; continuation decline; multi-invocation decline); config sentinel `(default)`.
- AC-3 Arm B observation contract: `normalizeCollectedFile` maps a captured real reporter JSON fixture into repo-relative token spelling (raw passthrough fails); `configsToProbe` returns distinct configs only; an `unavailable` config yields `PLAYWRIGHT_COLLECTION_UNVERIFIED` (advisory) and NEVER the fail.
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

- [ ] RED: author tests/specLint/expectContract.test.ts (new) — per-rule fixtures, each naming the single §4.1 rule it exercises: the pattern match (rule 1) with a bare-integer comment; empty-command rejection (rule 2 — and the comment-only line `# expect 72` failing rule 1's pattern outright, the §4.4 taxonomy); assertion openers `test ` / `[ ` / `[[ ` declining (rule 3); the two §4.2 prose shapes (inline-span quote with trailing prose; table-cell quote) NOT firing on their raw lines; the parenthetical form `# expect 2 (…)` firing; trailing unparenthesised prose (`# expect 0 before a run`) declining; non-integer expectations (`green`, `empty`) declining; spec-kind doc returning `[]`; finding anchored at the `#` column. Derive every expected value from the fixture text in the test body, never from a hand-copied literal.
- [ ] RED: author the Arm A half of tests/specLint/expectContractCorpus.test.ts (new) — walk `git ls-files docs/superpowers/plans` from the repo root, run `checkExpectN` over each parsed doc, assert the fire-set EQUALS (set equality on `path:line`) the §4.4 ten. `premise(fireSet.size > 0, …)` and `premise` that the known-positive `docs/superpowers/plans/2026-08-18-control-outline-border-token.md` is among the walked files — the empty-sweep guard (`tests/_shared/premise.ts`).
- [ ] Observe RED: both suites fail on the unresolved import of the new module.
- [ ] GREEN: implement `checkExpectN` exactly as spec §4.1 — the end-anchored pattern, rule 2, the CLOSED opener list. Nothing else.
- [ ] Pre-dispatch mutants (string-presence guard rule, recorded in the commit message): (a) message text emptied; (b) end-anchor removed — the corpus suite must fail with the two §4.2 sites appearing in the fire-set; (c) opener list emptied — the opener fixture must fail; (d) the `\d+` swapped to `\d*` — the non-integer fixtures must fail. Run each against the suites; all four must go red; revert.
- [ ] `pnpm exec tsx scripts/spec-lint.ts docs/superpowers/specs/ci/2026-08-28-speclint-expect-n-exit-status.md` still 0 hard (no wiring yet — Arm A is not called by `runLint` until Task 3; the suites drive the module directly).
- [ ] Commit `feat(infra): specLint Arm A EXPECT_N_UNENFORCED — grammar + corpus fire-set` (scope note: `lib/specLint` tooling lands under the `infra`-adjacent scope used by prior specLint arcs; match `git log --oneline -- lib/specLint` conventions), push.

### Task 2: Arm B pure core — extraction, config resolution, normalization, verdicts

<!-- task: red=`pnpm vitest run tests/specLint/expectPlaywright.test.ts tests/specLint/expectContractCorpus.test.ts` red-state=authored red-target=`lib/specLint/expectContract.ts` why=`playwrightCollectionPlan, configsToProbe, normalizeCollectedFile and synthesizeCollectionVerdicts are absent from the Task-1 module - the new suite fails on missing exports, and the corpus suite's new Arm B assertions (incident line as candidate, 2 distinct configs, -c resolving standalone, rule-3/rule-4 declines) fail against an extraction that does not exist` ac=AC-2,AC-3,AC-4,AC-6 -->

**Files:**

- Modify: lib/specLint/expectContract.ts (plain text: created by Task 1)
- Create: tests/specLint/expectPlaywright.test.ts
- Modify: tests/specLint/expectContractCorpus.test.ts (Arm B half)
- Create: tests/specLint/__fixtures__/playwright-list-report.json (captured real `--list --reporter=json` output, trimmed to a handful of suites; committed fixture for AC-3)

**Interfaces (spec §6 table):**

- `playwrightCollectionPlan(model, kind): PlaywrightCandidate[]` — `{ line, files: string[], config: string }`, §5.1 rules 1–4, spans + fenced lines, config from the closed `{--config, -c}` set searched from the `playwright test` match onward.
- `configsToProbe(plan): string[]` — distinct config values.
- `normalizeCollectedFile(rootDir, file, repoRoot): string` — pure string arithmetic (no `node:path`): resolve `file` against `rootDir`, strip `repoRoot` prefix, forward slashes — output in §5.1 token spelling.
- `synthesizeCollectionVerdicts(plan, collected): Finding[]` — `collected: ReadonlyMap<string, ReadonlySet<string> | { unavailable: string }>`; trichotomy per §5.3, one fail per absent token, `PLAYWRIGHT_COLLECTION_UNVERIFIED` advisory for unavailable, nothing without an entry consulted (the caller passes only observed configs).

**Steps:**

- [ ] RED: author tests/specLint/expectPlaywright.test.ts (new) — one fixture per §5.1 rule (rule 1 absent → non-candidate; rule 2 global: multi-file candidate carries ALL tokens; rule 3: continuation line declined; rule 4: two `playwright test` pairs joined by `&&` declined whole — the `docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138` shape); the `-c` alias resolving (the `docs/superpowers/plans/2026-07-18-modal-close-exit-anim/01-tasks.md:1003` shape); a `sh -c '…'`-wrapped command whose config stays `(default)` (wrapper flag precedes `playwright test`); `--config=` equals-form; verdict trichotomy incl. the first-present-later-absent multi-file candidate drawing exactly ONE fail naming the absent file (the `01-shell-and-strip.md:171` shape), and `unavailable` yielding the advisory NEVER the fail; `normalizeCollectedFile` over the committed reporter fixture — assert the normalized set contains the repo-relative spelling and that raw reporter values (basenames) are NOT in token spelling (`premise` that the fixture holds ≥1 spec entry).
- [ ] RED: extend the corpus suite — Arm B extraction over the walked corpus: the incident line (`docs/superpowers/plans/2026-08-27-fitwithinclip-clip-subscription.md:100`) is a candidate with config `(default)`; exactly 2 distinct configs corpus-wide; the `-c` candidate resolves `tests/e2e/standalone.config.ts`; the multi-file candidate at `01-shell-and-strip.md:171` carries both its tokens; `docs/superpowers/plans/2026-08-21-app-e2e-batch2.md:173` and `docs/superpowers/plans/2026-08-26-nearmiss-candidate-render.md:138` are NOT candidates (rules 3/4). `premise(candidates.length > 0, …)`. Scalar totals (253/301) are NOT asserted (spec §8).
- [ ] Observe RED: missing exports; corpus Arm B assertions fail.
- [ ] GREEN: implement the four exports per spec §5.1–§5.3.
- [ ] Pre-dispatch mutants (recorded in the commit message): (a) file-token regex made non-global — multi-file fixture + corpus both-tokens assertion fail; (b) `-c` dropped from the flag set — alias fixture + corpus `-c` assertion fail; (c) position rule dropped (search whole text) — `sh -c` fixture fails; (d) rule 4 dropped — multi-invocation fixture + corpus non-candidate assertion fail. All four red; revert.
- [ ] Commit, push.

### Task 3: wiring — `runLint` appended slot + adapter spawns under `--exec-red`

<!-- task: red=`pnpm vitest run tests/specLint/expectContractCli.test.ts` red-state=authored red-target=`lib/specLint/run.ts:102` why=`runLint composes the existing checks only - checkExpectN is never called, so a CLI-driving test over a fixture plan doc finds no EXPECT_N_UNENFORCED in the text render; and with --exec-red plus an injected collection the PLAYWRIGHT_COLLECTS_NOTHING verdict never appears because no parameter carries the observation - green arrives with the ONE appended optional parameter (after acCoverage, run.ts:125 slot rule) and the adapter block` ac=AC-5 -->

**Files:**

- Modify: lib/specLint/run.ts (ONE appended optional parameter after `acCoverage` — the slot-rule comment at `lib/specLint/run.ts:109-125` governs; one parameter carrying `{ plan, collected }` for Arm B; Arm A called unconditionally for plan-kind)
- Modify: scripts/spec-lint.ts (under `--exec-red` only: derive the candidate plan, spawn `playwright test --list --reporter=json [--config <cfg>]` once per distinct config via the existing exec machinery, classify failures as `{ unavailable }` — reusing `ExecOutcome` classification (`lib/specLint/types.ts:173`) — normalize via `normalizeCollectedFile` with the report's own `config.rootDir`, inject)
- Create: tests/specLint/expectContractCli.test.ts

**Steps:**

- [ ] RED: author the CLI suite — a fixture plan doc with an Arm A site renders `EXPECT_N_UNENFORCED` in the default (no-flag) run; the same doc with a Playwright candidate renders NO Arm B code without `--exec-red`; with `--exec-red` and an injected collected map (test seam at the adapter boundary, not a live spawn — follow the seam pattern of `tests/specLint/redExec.test.ts` / `cliDrain.test.ts`), the absent-file case renders `PLAYWRIGHT_COLLECTS_NOTHING` and the unavailable case renders `PLAYWRIGHT_COLLECTION_UNVERIFIED`. State the failure mode each case catches: silent-drop of the codes in the render path is exactly the `CHECK_ORDER` incident class (`lib/specLint/types.ts:14-33`) — both arms report under `taskContract`, so no renderer edit is needed and the test proves it.
- [ ] Observe RED on the unwired tree.
- [ ] GREEN: wire per spec §6. No new flag; no `Check` member.
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
