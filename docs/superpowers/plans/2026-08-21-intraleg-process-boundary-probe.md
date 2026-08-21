# Plan — intra-leg process-boundary probe (BL-MUTATION-VERDICT-MECHANISM-INTRA-LEG)

**Spec:** `docs/superpowers/specs/ci/2026-08-21-intraleg-process-boundary-probe-design.md` — converged over 5 review rounds (findings 5/3/4/2/1, all fifteen accepted and repaired, zero refuted), stage closed DISPOSITIONED on the orchestrator's scoped-confirmation ruling; corpus and filing at `docs/review-rounds/feat/mutation-verdict-intraleg-probe/`. **Branch:** `feat/mutation-verdict-intraleg-probe`. **Implementer:** a fresh Opus pane per the handover doc (this plan's author does not implement). **impeccable-gate: N/A — no UI surface.**

## 0. Goal and shape

Ship the across-process probe instrument the spec designs — importable core + two thin adapters + control fixtures — then run the pre-registered campaign and graduate the row per spec §3. Composition only: zero edits to `determinism.ts`, `runner.ts`, `gate.ts`, `records.ts`, `registry.ts`, `guardSurfaces.*` shard files, or workflows — spec AC-13's freeze diff is the closeout gate and its pathspec is the authority.

## 1. Code-verification transcript (run at authoring; re-run any figure a task depends on)

Verified against this tree at plan authoring (commands and outputs in the arc transcript; the two derived figures are re-derived at campaign time by the same commands per spec §5.2):

- Eleven file:line claims checked mechanically, 11/11 OK (`tests/mutation/source/registry.ts:2388`, `tests/mutation/source/registry.ts:2585`, `tests/mutation/source/spawnBounded.ts:67`, `tests/mutation/source/determinism.ts:111`, `tests/mutation/source/determinism.ts:158`, `tests/mutation/source/runner.ts:40`, `tests/mutation/source/runner.ts:113`, `tests/mutation/source/records.ts:56`, `scripts/mutation-determinism.ts:36`, `vitest.projects.ts:148`, `.github/workflows/mutation-harness.yml:195`).
- `pnpm mutation:sites` reports `ok relational-boundary:3578:35:<><=` on `psqlStartupScan` (no STALE).
- Position derivation through the shipped `enumerateSites`/`generateMutants`/`siteId`: 74 mutants, target one-based position 70, 69 generation-order predecessors.
- New-suite collection: `vitest.projects.ts:148` includes `tests/mutation/**/*.test.{ts,tsx}` in the fast unit project; only the named nightly gate files are excluded (`vitest.projects.ts:98-101`).
- Every composed export exists: `enumerateSites`, `siteId` (`tests/mutation/source/operators.ts`), `generateMutants` (`tests/mutation/source/generate.ts`), `runMutantRecorded`, `MutantRunInfraError`, `ChildRecord` (`tests/mutation/source/runner.ts`), `stampInputs`, `parseRuns` (`tests/mutation/source/determinism.ts`), `recordDir`, `writeRunRecord` (`tests/mutation/source/records.ts`).

## 2. Meta-test inventory (declared)

This plan CREATES no new registry meta-test — the instrument is deliberately unenrolled (spec §8). Adjacent obligations: `_metaSourceShardIntegrity` must stay green (the new suites use the processProbe stem and are never guardSurfaces-named); `_metaReviewRoundEconomy` (spec-stage filing committed; plan/diff stages file if they reach four counted rounds at one base); `_metaPremiseContract` — before authoring the live suite, read the contract's env-gating treatment in `tests/mutation/_metaPremiseContract.test.ts` and either enrol the suite in `EXPECTED_ENV_TOUCHING` with per-case premises or verify the walker's handling of `describe.skipIf`-gated cases; the decision and its evidence go in the task's commit message, not assumed.

## 3. Tasks — code region (red-contract)

Every `-t`-filtered red below carries a standing obligation at its task's RED step: observe the failure WITH a matched case count (a name filter matching nothing exits 0 and reports green from the moment it is written), and confirm the failure is for the `why=`'s asserted reason, never merely non-zero.

<!-- tasks: depth=3 red-contract -->

### task:core-refusals — accept-sets and refusal outcomes (pure core)

<!-- task: red=`pnpm vitest run tests/mutation/source/processProbe.test.ts` red-state=authored red-target=`tests/mutation/source/processProbe.ts` why=`the refusal cases assert outcomes naming WHICH input failed for every complement member, and fail while the core module and its accept-set branches do not exist` ac=AC-1 -->

The new core module (stem processProbe, under `tests/mutation/source/`): input parsing per spec AC-1 — accept-sets with the complement default-denied, the `parseRuns` shape (`tests/mutation/source/determinism.ts:111`) — and a refusal outcome type naming the failed input. Suite cases: every invalid form the AC row lists, each asserting the refusal's DETAIL names that input (not merely `ok:false`), plus an assertion that no distribution text is emitted on any refusal path.

### task:planner-seeded — deterministic trial plans

<!-- task: red=`pnpm vitest run tests/mutation/source/processProbe.test.ts -t planner` red-state=authored red-target=`tests/mutation/source/processProbe.ts` why=`the planner property cases assert same-seed byte-identical plans and seed presence in every plan object, and fail while the plan builder is absent` ac=AC-11 -->

Seeded PRNG (explicit committed algorithm, e.g. mulberry32) and a plan builder for arms A/B/C: trial list carrying arm, prefix site list (seeded shuffle for prefix-8/24; the generation-order predecessor slice for the gate-order-prefix trial), position, and the seed in every plan object. Property cases (spec AC-11): same seed → deep-equal plans; different seeds → different shuffles, with the shuffle-domain premise stated executably above the assertion (`tests/_shared/premise.ts`).

### task:trial-child — runTrial composition and the child entry

<!-- task: red=`pnpm vitest run tests/mutation/source/processProbe.test.ts -t trial` red-state=authored red-target=`tests/mutation/source/processProbe.ts` why=`the in-process trial cases drive runTrial with injected writer and spawn seams, and fail while runTrial is absent` ac=AC-3,AC-8,AC-12,AC-14 -->

`runTrial` composes the shipped primitives: green-baseline check first (red baseline → REFUSE, composing the determinism core's rule), then prefix steps and target via `runMutantRecorded`, per-step READ-BACK receipts (sha-256 of bytes read back from the mutant file immediately before each spawn — spec §5.1), per-trial stamp pair via `stampInputs`, infra-fault catch → excluded and reported (spec AC-8). Injectable seams: writer, spawner, clock. In-process cases: the order-mismatch seam fixture (loud plan/executed mismatch); the missing-write fixture — the WRITER elided via its seam against the shipped read-back path → refusal naming the site whose read-back hashed to ORIGINAL bytes (spec AC-3); infra-fault exclusion with the reported list; per-step whole-entry serialization round-trip with DISTINGUISHABLE children plus the rotation fixture REFUSED naming the first mis-bound step (spec AC-14). The child entry adapter (stem mutation-process-probe-child, under `scripts/`) is thin — one trial plan in, core calls, JSON report to a file in the trial's scratch dir (never stdout prose), no decisions.

### task:aggregator — eligibility, derived claims, render

<!-- task: red=`pnpm vitest run tests/mutation/source/processProbe.test.ts -t aggregator` red-state=authored red-target=`tests/mutation/source/processProbe.ts` why=`the aggregation fixtures assert eligibility partitions, derived bounds and refusal floors, and fail while the aggregate and render functions are absent` ac=AC-7,AC-8,AC-10,AC-12,AC-14,AC-16 -->

Aggregation per the spec's eligibility machinery: eligible = completed AND same-stamp (campaign anchor = first completed trial's stamp; minority-stamp trials excluded and named — AC-12); produced-vs-planned reconciliation per arm, shortfalls refused by name (AC-14); a zero-eligible arm's claim REFUSED naming "0 eligible of N planned", never the N=0 formula (AC-16); **the graduation precondition: while ANY arm is at zero eligible, the renderer emits NO graduation text at all, naming the arm — the fixture asserts the graduation text's ABSENCE alongside the refusal's presence, both directions** (spec §3, review r5); bounds recomputed over the eligible N with the statistic named, one-sided primary; the load pair adjudicated only on timestamped IN-WINDOW samples, at least two per half, SAME-STAMP halves, and the fixed margins as core LITERALS asserted equal to spec §5.2's values (AC-10); render carries population sizes beside every aggregate and contains no exclusion vocabulary — comment-stripped, use-versus-mention-safe scan (AC-7). Fixtures follow the AC rows' fourth columns exactly, including: the cross-stamp internally-stable pair excluded; the out-of-window loaded half refused; the cross-stamp load pair refused naming both digests; the planned-numbers renderer shown REFUSED against the 11-of-12 input.

### task:control-surface — the manufactured correlated mechanism (two suites)

<!-- task: red=`pnpm vitest run tests/mutation/source/processProbe.test.ts -t control` red-state=authored red-target=`tests/mutation/source/fixtures/processProbe/source.ts` why=`the control schedule cases fail while the fixture surface and its two deciding suites are absent` ac=AC-4 -->

Fixture source plus TWO deciding suites under `tests/mutation/source/fixtures/processProbe/`: suite 1 green throughout; suite 2 carries the state mechanism (env-var-named state directory, flip at an authored run index). The baseline-consumption hazard is handled explicitly (spec §5.3): the schedule accounts for the baseline check's own suite runs, and every case asserts WHICH rule decided its observation (schedule index versus baseline effect). One control mutant is authored DETERMINISTICALLY KILLED by suite bytes alone, for the prefix-bearing behavioral case.

### task:cli — operator adapter

<!-- task: red=`pnpm vitest run tests/mutation/source/processProbe.test.ts -t cli` red-state=authored red-target=`scripts/mutation-process-probe.ts` why=`the wiring-spy and DEFAULT_DEPS identity cases fail while the adapter is absent` ac=AC-9 -->

The operator adapter (stem mutation-process-probe, under `scripts/`) mirrors `scripts/mutation-determinism.ts`'s documented shape: `main(deps)`, a spy proving the collaborator calls carry the operator's arguments, `DEFAULT_DEPS` identity asserted AND proven discriminating via an impostor (spec AC-9). `package.json` gains `mutation:process-probe`. Every refusal exits 2.

### task:live-integration — env-gated real-child proofs

<!-- task: red=`RUN_PROCESS_PROBE_LIVE=1 pnpm vitest run tests/mutation/source/processProbe.live.test.ts` red-state=authored red-target=`tests/mutation/source/processProbe.live.test.ts` why=`the live cases fail while the live suite and the real-spawn paths it exercises are absent` ac=AC-2,AC-4,AC-5 -->

Env-gated live suite (`RUN_PROCESS_PROBE_LIVE=1`, `describe.skipIf` — the `build-artifact-gate` precedent): N distinct PARENT-observed spawn pids with parent-pid == child-reported-pid per trial (AC-2); the two-suite control run in both configurations, flip at the authored index, deciding child asserted to be suite 2's (AC-4); the prefix-bearing control trial — the deterministically-killed prefix mutant asserts KILLED, killing the skip-prefix-writes implementation (AC-4); `spawnBounded` AND `premiseScan` agreement controls with the per-child suite-sequence assertion on the multi-suite surface (AC-5). Placement verified by collection probe: `VITEST_EXCLUDE_ENV_BOUND=1` collection and the default unit project must both skip the gated cases; the probe output goes in the task's commit message.

<!-- tasks: end -->

## 4. Tasks — measurement and closeout region

The tasks below are MEASUREMENT and CLOSEOUT work, deliberately OUTSIDE the red-contract region: a task that measures, moves docs, or edits a ledger ASSERTS a red rather than observing one (a red contract is a contract about production behaviour), so these carry stated acceptance instead.

<!-- tasks: depth=3 -->

### task:campaign — execute the pre-registered campaign

<!-- task: red=`bash -c 'test -f docs/superpowers/specs/ci/probes/2026-08-21-intraleg-process-probe.md'` ac=AC-6,AC-10,AC-16 -->

**Acceptance:** the dated probe record this task creates under the probes directory (the exact path is the red command's test target) exists, carrying per-arm eligible-versus-planned counts, seeds, commands and raw outputs; adjudication text quotes spec §3 VERBATIM (no post-hoc readings); every gate command in the campaign driver was probed against a constructed failing input and observed exiting non-zero (transcript pasted in the record).

Execution: under `pnpm heavy`, launched with `run_in_background`; the worktree is FROZEN for the whole campaign — `psqlStartupScan`'s deciding suite walks the repository, so the freeze is NO tree edits at all, not a declared-input list. Arms per spec §5.2 — A: 12 isolated fresh-process trials; B: three prefix-8 seeded shuffles, two prefix-24, one gate-order-prefix trial over the 69 generation-order predecessors (count re-derived by the same command first); C: one pair with the 15-second sampler and one CPU burner per core. `MUTATION_RECORD_DIR` points at a campaign-owned directory (AC-6). Contingencies: queued-versus-running read from the heavy wrapper's own log, never from process existence; a deliberate kill owns its cleanup by PID (ownership = full command line + config dir + age, never a pattern); no pushes while any capture is queued or running.

### task:killer-audit — the three-state split

<!-- task: red=`bash -c 'test -f docs/superpowers/specs/ci/probes/2026-08-21-intraleg-killer-audit.md'` ac=AC-1,AC-2,AC-3,AC-4,AC-5,AC-6,AC-7,AC-8,AC-9,AC-10,AC-11,AC-12,AC-13,AC-14,AC-16 -->

**Acceptance:** the dated audit record this task creates under the probes directory (the red command's test target) exists; the obligation list is DERIVED from the spec AC table's fourth column by a command (pasted), never recalled; every named weaker implementation classified ABSENT / PRESENT-BUT-UNPROVEN / PROVEN, where PROVEN shows the mutant applied, the named case observed red for the asserted reason, and a byte-exact restore; zero ABSENT at closeout. The mutation-score criterion is unavailable to this arc (spec §8) — this audit is the substitute convergence evidence and says so.

### task:ledger-closeout — EARLY, one commit before whole-diff review

<!-- task: red=`bash scripts/intraleg-closeout-check.sh` ac=AC-13 -->

**Acceptance:** the committed, exit-coded closeout script this task creates (the red command's target, stem intraleg-closeout-check under scripts/) passes after the archive move and FAILS when dry-run before it — with the failure REASON staged honestly: before the script exists the red is exit 127 (absent artifact, this task creates it); once created but before the archive move it must red for the ROW-STILL-OPEN reason by name; only after the move does it green. Both pre-states observed and pasted. It checks: the row archived per the adjudicated §3 branch with the re-scope stated FIRST in the entry and the eliminated/bounded table carried WITH methods; set arithmetic anchored on `^## ` headings (never bare id mentions — archive prose cites ids freely): open == union(open) MINUS union(archived), `comm -12` of archived-versus-open EMPTY, in-progress marker count for this branch ZERO; AC-13's freeze diff EMPTY, gated by exit code. The marker comes off IN THIS COMMIT; push immediately.

### task:final-gates

<!-- task: red=`bash -c 'pnpm typecheck && pnpm exec eslint . && pnpm format:check'` ac=AC-13 -->

This task's `red=` is a GATE, not a red — it is green on the pre-change tree by design (measured at plan time), and its meaning is the acceptance below; the red-then-green contract deliberately does not apply in this region.

**Acceptance:** typecheck (vitest AND playwright configs), eslint, format:check green; full `pnpm test` green under `pnpm heavy`; `pnpm mutation:sites` run LAST with zero STALE rows (no enrolled source is touched by this arc — a STALE row here is a defect, not churn); whole-diff codex review to APPROVE — split scoped if the diff exceeds a handful of files (CORE+adapters / SUITES+fixtures, each brief carrying the sibling-boundary instruction, both dispatches at ONE round number per base); real CI green by name across the twelve required contexts, both vocabularies, sha-keyed with `(.check_runs|length) == .total_count`.

<!-- tasks: end -->

## 5. Statistics single-source rule

Every bound, cost figure and count quotes spec §2/§5.2 by reference; this plan repeats none of them, so a spec re-derivation cannot strand a stale copy here.

## 6. Fixture-satisfiability obligations (run during implementation, before the diff review dispatch)

Per fixture: name which rule DECIDES the observation (the spec's §5.3 hazard is the worked example); pair every expect-CLEAN case one variable away from a reporting twin; give every negative assertion a positive twin through the same mechanism; run the four pre-dispatch mutants on any string-presence assertion; state every environment-dependent premise executably with `premise`/`premiseHolds`. The killer-audit (task above) is the derived cover for the AC table's fourth column — these obligations cover the fixtures the fourth column does not name.
