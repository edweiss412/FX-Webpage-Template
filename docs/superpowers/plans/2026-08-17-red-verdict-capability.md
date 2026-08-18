# Plan — red verdict-capability contract (shape + collection)

**Spec:** `docs/superpowers/specs/2026-08-17-spec-lint-red-verdict-capability.md` (canonical; this plan restates no design rationale — section references below are into that spec unless marked "arms spec" = `docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md`). **Branch:** `fix/red-contract-shape-execution`. **Backlog:** `BL-SPECLINT-RED-COMMAND-SHAPE` + `BL-PLANLINT-RED-CLAIM-EXECUTION`. TDD per task (invariant 1); commit per task (invariant 6 — spec-lint work uses the `infra` scope per the arms-spec arc's commit history: `feat(infra)`/`test(infra)`/`docs(...)` as marked per task).

## 1. Diff scope

- `lib/specLint/redContract.ts` — new pure functions (parse plan, vitest-shape recognition, probe derivation, tracked-arg extraction, two synthesis passes) + the `RED_TEST_NAME_FILTER` advisory + one exclusion in the exec population. Enrolled mutation surface (registry id `redContract`, floor 0.95).
- `lib/specLint/types.ts` — outcome-map types for parse checks and collection probes (no runner type crosses the purity boundary, arms spec §5 pattern).
- `lib/specLint/run.ts` — carries the new outcome maps into `checkRedContract`'s synthesis siblings; findings join the `taskContract` check group.
- `scripts/spec-lint.ts` — adapter: `sh -nc` parse spawns on the DEFAULT plan-kind invocation; collection-probe spawns under `--exec-red`; `SpawnResult` gains captured `stdout` (probes read it; red executions keep discarding theirs).
- Tests: `tests/specLint/redContract.test.ts`, `tests/specLint/redExec.test.ts` (both inside the enrolled surface's `suitePaths` — assertions outside `suitePaths` buy zero mutation score, the #831 lesson), `tests/specLint/cli.test.ts`, new fixture files under `tests/specLint/fixtures/`.
- Docs: `docs/agents/writing-plans.md` (one sentence), `docs/superpowers/specs/README.md` (one row), `BACKLOG.md` (+archive) at closeout.

**Not touched:** `lib/specLint/taskContract.ts` (spec §1.1 item 11 — no grammar change), `lib/specLint/citations.ts`, `lib/specLint/citationIntent.ts`, `tests/mutation/source/registry.ts` row membership (see §2).

## 2. Meta-test inventory & registry reconciliation (declared up front, per `docs/agents/writing-plans.md`)

- **Created:** none. **Extended:** none. Structural coverage is inherited by construction: `tests/specLint/_metaPureCore.test.ts` walks `lib/specLint/**` and covers the edited module by default; `tests/docs/_metaLedgerInProgress.test.ts` and `tests/docs/_metaReviewRoundEconomy.test.ts` discover their corpora from disk. No auth/DB/admin-alert/tile surface is touched, so no candidate registry from the inventory list applies — declared explicitly as "none applies because the diff is a pure lint-core + CLI-adapter change."
- **Mutation registry reconciliation (run at plan time):** zero rows added, zero removed. The `redContract` row's `suitePaths` already lists both deciding suites this plan extends; `accepted` holds 7 `equivalent` rows whose `siteId` line anchors will shift under this diff — Task 7 re-anchors them 1:1 (operator + `from>to` preserved) and re-measures. `git diff` of `tests/mutation/source/registry.ts` at PR end must show ONLY `siteId` line-number edits inside the `redContract` row; the closeout gate below pins that.
- **Invariant-8 marker:** see §12.

## 3. Plan-time verification record

- Every named symbol/line verified against this branch at draft time: `parseMarker`/`taskTopology` exports (`lib/specLint/taskContract.ts:83` and `lib/specLint/taskContract.ts:309`), `planExecutions` population rule (`lib/specLint/redContract.ts:273`), non-zero-is-red classification (`lib/specLint/redContract.ts:339`), gate grammar (`lib/specLint/redContract.ts:29-30`), tracked-token device (`lib/specLint/redContract.ts:217`), adapter spawn (`scripts/spec-lint.ts:311`), timeout seam (`scripts/spec-lint.ts:35-36`), `ExecOutcome`/`ExecResults` (`lib/specLint/types.ts:45-56`), `CHECK_ORDER` (`lib/specLint/run.ts:16`).
- The spec's §2 calibration numbers were measured on this branch's tree (probe harness `probe-collection.pl`, arc scratchpad); the fixture distillations in the tasks below reproduce those shapes at small line numbers rather than relinting live plans (governing-spec §8 posture).
- The plan's one executable fenced block (Task 1) was spliced into a live suite and executed before this plan's review dispatch; the observed red, and the grep-verified missing-surface causes for Tasks 2-5's prose-described REDs, are recorded in §11.

## 4. Acceptance criteria (ids resolve the task markers below)

From spec §11, verbatim ids: AC-1 (parse capability codes), AC-2 (name-filter advisory), AC-3 (shape grammar + derivation + strip), AC-4 (exec semantics live/authored/probe-failure), AC-5 (population exclusions + static-invocation silence + spec-kind silence), AC-6 (purity + mutation score ≥ 0.95, empty unaccepted set, re-anchored rows), AC-7 (corpus calibration reproduced by fixtures), AC-8 (spec + plan lint 0 hard at dispatch).

<!-- tasks: depth=2 red-contract -->

## Task 1 — parse-plan derivation (pure core)

<!-- task: red=`pnpm vitest run tests/specLint/redContract.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:273` why=`the module exports planExecutions but no parseCheckPlan; the new describe block asserts parseCheckPlan enumerates non-empty red= and gate cmd= commands and the import fails until the export exists at the cited sibling's module` ac=AC-1,AC-5 -->

**RED:** add to `tests/specLint/redContract.test.ts` a `describe("parseCheckPlan")` asserting, over one fixture plan built in-test: (a) every well-formed marker with non-empty `red=` yields `{line, command, source: "red"}` — v1 AND v2 markers, inside and outside regions (global validity, spec §3); (b) every well-formed gate marker with non-empty `cmd=` yields `{line, command, source: "gate"}`; (c) excluded: empty `red=` (its line absent from the plan — `sh -nc ''` exits 0 and would prove nothing), malformed markers, fenced marker-shaped lines, malformed gate lines. Failure mode caught: a plan derivation that silently drops v1 markers or includes empty commands (which would manufacture clean parses for `TASK_RED_EMPTY` lines). Expected values derived from the fixture's own line construction, never hardcoded row counts.

```ts
// splice target: tests/specLint/redContract.test.ts (executable at plan time - fails on missing export)
import { describe, it, expect } from "vitest";
import { parseCheckPlan } from "../../lib/specLint/redContract";
import { parseDoc } from "../../lib/specLint/parse";

describe("parseCheckPlan", () => {
  it("enumerates non-empty red= (v1 and v2) and gate cmd=, and nothing else", () => {
    const lines = [
      "<!-- tasks: depth=2 red-contract -->",
      "## Task A",
      "<!-- task: red=`echo one` ac=AC-1 -->",
      "AC-1 appears here.",
      "<!-- tasks: end -->",
      "<!-- task: red=`echo two` red-state=live why=`x` ac=AC-1 -->", // outside region: still in plan
      "<!-- task: red=`` ac=AC-1 -->", // empty: excluded
      "<!-- gate: cmd=`echo gate` probed=`yes` -->",
      "```",
      "<!-- task: red=`echo fenced` ac=AC-1 -->", // fenced: inert
      "```",
    ];
    const plan = parseCheckPlan(parseDoc(lines.join("\n")));
    expect(plan).toEqual([
      { line: 3, command: "echo one", source: "red" },
      { line: 6, command: "echo two", source: "red" },
      { line: 8, command: "echo gate", source: "gate" },
    ]);
  });
});
```

**GREEN:** implement `parseCheckPlan(model: DocModel)` in `lib/specLint/redContract.ts` over `wellFormedMarkers` + the existing gate scan; export `parseCheckPlanForText(text)` beside `planExecutionsForText` for the adapter. Commit `feat(infra): parse-plan derivation for red verdict capability`.

## Task 2 — parse-outcome synthesis (`RED_UNPARSEABLE`, `GATE_CMD_UNPARSEABLE`, `RED_PROBE_UNVERIFIED`)

<!-- task: red=`pnpm vitest run tests/specLint/redExec.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:302` why=`synthesizeExecFindings at the cited line is the only outcome-to-finding synthesis in the module; no function maps parse outcomes to RED_UNPARSEABLE or GATE_CMD_UNPARSEABLE, so the new cases fail until synthesizeParseFindings exists` ac=AC-1,AC-5 -->

**RED:** add to `tests/specLint/redExec.test.ts` a `describe("synthesizeParseFindings")` with constructed outcome maps: non-zero exit on a `source:"red"` entry → hard `RED_UNPARSEABLE` at that line with the stderr tail in `detail`, and a tail constructed LONGER than 200 characters arrives already trimmed to exactly 200 by the adapter contract (the synthesis asserts the length it renders — probed live: a 500-character invalid token produces a 581-byte `sh -nc` diagnostic, so the bound discriminates); non-zero on `source:"gate"` → hard `GATE_CMD_UNPARSEABLE`; exit 0 → no finding; timeout / signal / spawn-error → advisory `RED_PROBE_UNVERIFIED` naming the probe kind and reason; a null map (static invocation without the adapter's parse pass — spec-kind or non-plan) → `[]`. Failure modes caught: the wrong code on the wrong source (gate defect reported as red defect), a spawn failure read as a verdict (the §4.4-class silent corruption), findings on exit 0.

**GREEN:** implement `synthesizeParseFindings(plan, outcomes)` mirroring `synthesizeExecFindings`'s shape (severity helpers reused). Commit `feat(infra): parse-capability findings`.

## Task 3 — vitest-shape recognition, probe derivation, filter strip, tracked-arg extraction (pure)

<!-- task: red=`pnpm vitest run tests/specLint/redContract.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:32` why=`the module's only command-text analysis today is the GIT_MOVE regex at the cited line; no export recognizes vitest-shaped commands or derives a list probe, so the new describe fails on the missing exports` ac=AC-3 -->

**RED:** `describe("collectionProbePlan")` in `tests/specLint/redContract.test.ts` pinning, per spec §5.1: the four measured runner spellings recognized (`pnpm vitest run`, `pnpm exec vitest run`, `npx vitest run`, bare `vitest run`); leading `NAME=value` env tokens preserved through derivation; first-occurrence-only rewrite pinned WITHOUT an operator (a live marker whose intact `-t` pattern contains the literal text vitest run — the rewrite must touch the leading token pair and leave the quoted occurrence byte-identical; the operator-bearing spelling is unreachable for rewriting because the compound guard declines it first, asserted as its own case below); non-vitest commands (`pnpm tsx scripts/x.ts`, `rg -n foo`, `pnpm test:fast`) derive nothing; authored strip removes `-t 'a b'`, `-t "a b"`, `-t bare`, `--testNamePattern=x`, `--testNamePattern y` and leaves every other byte identical; an unstrippable filter (`-t` present, none of the declared forms — e.g. `-t$'\t'x`) yields a `{skipped: "unstrippable-filter"}` entry, never a guessed probe; a marker line in a supplied `excludeLines: ReadonlySet<number>` (the parse-failed set — spec §3's exclusion, mirrored from `planExecutions`) derives NO entry at all, asserted directly; the population is the red-contract-OWNED marker set (same `taskTopology` ownership as `planExecutions`, spec §5.2): an authored v2 marker in a bare region, an orphaned one, and one in a plan with no well-formed region each derive NO entry — not a probe, not a skip record — asserted per position; each control/substitution token (`&&`, `||`, `;`, `|`, `$(`, backquote) on an otherwise vitest-shaped command yields a `{skipped: "compound-command"}` entry carrying NO probe text (asserted structurally — spec §5.1 probe-eligibility, the never-execute-trailing-clauses guarantee), including when the token sits inside quotes (conservative over-decline pinned deliberately); a mid-command `vitest run` (`pnpm heavy` wrapper shape, spec §2.2) is NOT recognized at all; live markers keep filters intact; tracked-arg extraction returns exactly the command tokens that are members of a supplied tracked set AND end in .test.ts or .test.tsx (a tracked non-test path and an untracked test path both excluded from `trackedTestArgs` — assert both directions) and separately reports untracked test-file tokens as `untrackedTestArgs` for the `RED_SUITE_UNVERIFIED` advisory. Failure modes caught: a rewrite that touches quoted text; a strip that guesses; a declined entry that still carries something spawnable; extraction keyed on spelling instead of tracked-set membership.

**GREEN:** implement `collectionProbePlan(model, tracked, excludeLines)` returning per-marker `{line, state, probe, trackedTestArgs, untrackedTestArgs}` (or a skip record), consuming `parseMarker` fields only. Commit `feat(infra): vitest collection-probe derivation`.

## Task 4 — collection synthesis (`RED_COLLECTS_NOTHING`, `RED_SUITE_UNCOLLECTED`)

<!-- task: red=`pnpm vitest run tests/specLint/redExec.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:339` why=`the classifier at the cited line reads every non-126/127 non-zero exit as red observed with no collection consultation; the new cases assert a live marker with non-zero red plus empty collected output draws RED_COLLECTS_NOTHING and fail until the synthesis exists` ac=AC-4 -->

**RED:** `describe("synthesizeCollectionFindings")` with fake outcome/output maps, asserting the spec §5.2 matrix exactly: live + red exit 0 → `synthesizeCollectionFindings` emits NOTHING and never consults the collection maps (spy-free proof: pass a poisoned Proxy map whose `get` throws — the test fails if the code reads it); `RED_ALREADY_GREEN` stays owned by the SHIPPED `synthesizeExecFindings` alone (`lib/specLint/redContract.ts:314`), never re-emitted here — the end-to-end cardinality assertion lives in Task 6; live + non-zero + empty output → hard `RED_COLLECTS_NOTHING`; live + non-zero + non-empty → no new finding; authored + a `trackedTestArgs` member absent from output lines → hard `RED_SUITE_UNCOLLECTED` naming each missing file in `detail`; authored + all tracked present + no untracked tokens → nothing; authored + zero test-file tokens + non-empty output → nothing (directory-selector shape, calibrated on the live step3 instance, spec §2.4); authored + zero test-file tokens + EMPTY output → advisory `RED_SUITE_UNVERIFIED` (directory-typo case — never silence, spec §5.2); authored + collectible tracked args beside an untracked token → `RED_SUITE_UNVERIFIED` naming the untracked token (multi-file-typo case); authored + an ABSENT tracked arg AND an untracked token in one command → BOTH `RED_SUITE_UNCOLLECTED` and `RED_SUITE_UNVERIFIED` (independence proof — an early-return `if (untracked) advisory else membership` implementation fails exactly this case; spec §5.2 requires both verdicts); probe outcome non-zero/timeout/signal/spawn-error → advisory `RED_PROBE_UNVERIFIED` whose `detail` carries the discriminating fact (exit code, signal name, or spawn reason) plus the stderr tail, with an over-200-character tail asserted trimmed to exactly 200 (spec §5.2's diagnostics contract, not a generic advisory); skip records (`unstrippable-filter`, `compound-command`) → the same advisory naming the reason; null maps → `[]`. Failure modes caught: consulting the probe on a green red (would mint findings `--exec-red` never earned), reading a failed probe as a verdict, membership tested against the wrong universe (output lines vs command tokens).

**GREEN:** implement `synthesizeCollectionFindings(plan, outcomes, outputs)`. Commit `feat(infra): collection-capability findings`.

## Task 5 — name-filter advisory + exec-population exclusion

<!-- task: red=`pnpm vitest run tests/specLint/redContract.test.ts` red-state=authored red-target=`lib/specLint/redContract.ts:206` why=`the advisory block at the cited line emits RED_CONJUNCTION only; no code emits RED_TEST_NAME_FILTER, and planExecutions has no parse-failure exclusion parameter, so both new describes fail on the live module` ac=AC-2,AC-5 -->

**RED:** two describes. (1) `RED_TEST_NAME_FILTER`: fires (advisory) on ` -t ` and on `--testNamePattern` space/`=` forms in a red-contract-region marker's `red=`; NOT outside a region; NOT when `-t` sits inside a quoted pattern (`grep "x -t y"`) or as a substring of a longer hyphenated token such as a filename ending in -t.ts; NOT on gate `cmd=`. (2) exec exclusion: `planExecutions` (gaining an optional `excludeLines: ReadonlySet<number>` argument, default empty — existing call sites unchanged) drops a live marker whose line is in the set; the CLI passes the parse-failed lines (Task 6). Failure modes caught: substring matching on `-t` (false fire on paths), an excluded marker still spawning.

**GREEN:** advisory emission beside `RED_CONJUNCTION`; the one-parameter widening of `planExecutions`/`planExecutionsForText`. Commit `feat(infra): name-filter advisory and parse-failure exec exclusion`.

## Task 6 — types + run.ts wiring + adapter

<!-- task: red=`pnpm vitest run tests/specLint/cli.test.ts tests/specLint/redExec.test.ts` red-state=authored red-target=`lib/specLint/run.ts:84` why=`runLint at the cited line wires checkRedContract with no parse or collection outcome maps, and the adapter's only spawn site is the exec-red loop; every end-to-end case below - the default-invocation RED_UNPARSEABLE, the spawn-authorization matrix, and the corpus distillations through runLint - fails until the threading and the adapter passes exist` ac=AC-1,AC-4,AC-5,AC-7 -->

**RED (three groups, all failing until this task's GREEN):**

(1) *CLI end-to-end* — extend `tests/specLint/cli.test.ts` with committed fixture docs (real subprocesses, trivial commands only, no heavy phases): a fixture plan whose `red=` is the `<><=` mutation-site shape → DEFAULT invocation exits 1 with `RED_UNPARSEABLE` (this is the §2.1 distillation); the same doc passed `--kind spec` → exit 0, no new codes (spec-kind silence, AC-5); a parseable fixture plan → exit 0; a gate `cmd=` carrying the same shape → `GATE_CMD_UNPARSEABLE`; under `--exec-red` against a committed mini vitest fixture project (`tests/specLint/fixtures/redVerdict/` with its own `vitest.config.ts`, one always-failing suite, one passing suite): live marker with a nonexistent-path red → `RED_COLLECTS_NOTHING`; live marker running the failing suite → clean (red observed, non-empty collection); authored marker naming the tracked fixture suite excluded by the fixture config → `RED_SUITE_UNCOLLECTED`; probe stdout captured while red-command stdout stays discarded (assert via a red command that writes a sentinel to stdout — the sentinel must appear nowhere in the report).

(2) *Spawn-authorization matrix (fake-deps unit tests over `runCli` — the adapter is injectable by construction, `scripts/spec-lint.ts:19`):* the spawn seam gains an explicit MODE — `spawn(command, cwd, timeoutMs, mode: "parse" | "exec")`, with production mapping `"parse"` to `sh -nc` and `"exec"` to `sh -c` — and a recording `CliDeps.spawn` captures `(command, mode)` pairs, so the suite asserts the EXACT spawn set AND MODE per cell. Mode is load-bearing: without it a defective default path running `sh -c` is spawn-indistinguishable from the intended `sh -nc` (probed: `sh -nc 'printf EXECUTED'` writes 0 bytes, `sh -c` writes 8) — and the fake-seam mode assertion is paired with one REAL-subprocess CLI case in group (1) proving the production mapping: a committed fixture plan whose parseable `red=` would write a sentinel file if executed, default invocation, sentinel asserted absent after the run. Cells: DEFAULT invocation (parse-mode spawns only — zero exec-mode spawns of any kind); `--exec-red` live marker whose red exits 0 (no probe spawn — spec §5.2 "probe never consulted"); exits 126 and 127 (no probe); RED-EXECUTION timeout / signal / spawn-error outcomes (no probe); PARSE-outcome timeout / signal / spawn-error (advisory `RED_PROBE_UNVERIFIED` AND zero exec-mode spawns for that marker — the spec §3 non-observation exclusion, all three cells); live markers in bare regions, orphaned markers, and v1 markers (no red execution and no probe — the arms-spec §4.4 population rule, now spawn-proven); authored marker → list probe spawned but the red command NEVER spawned (the never-run-authored guarantee at the spawn boundary); vitest-shaped-but-unparseable red (`pnpm vitest run tests/x.test.ts >` — `sh -nc` exit 2, probed at plan time) under `--exec-red` → `RED_UNPARSEABLE` only, zero exec spawns and zero probe spawns for that marker (the parse-failed exclusion at the adapter boundary, AC-5); compound vitest-shaped red → declined, zero probe spawns; AUTHORED markers in bare regions, orphaned positions, and no-region plans → zero probe spawns AND zero advisories of any kind (the ownership rule spawn-proven for the authored population too — a compound or unstrippable authored marker in those positions draws nothing, not an unauthorized decline advisory); the PHASE-ORDERING cell: a plan with two live markers and probe-triggering outcomes records the exact sequence — every parse-mode spawn, then both red executions in doc order, then both probes in doc order (interleaved `red A, probe A, red B, probe B` fails; probes reversed fails — spec §5.2's ordering, load-bearing because collection executes module scope); the PROBE-CEILING cell: a probe exceeding `SPEC_LINT_EXEC_TIMEOUT_SECS=1` (real subprocess, `sleep`-based, group (1)) → `RED_PROBE_UNVERIFIED` timeout, proving the ceiling and env seam bind probes too; the PROBE-CWD assertion folded into the existing repo-root case (a probe command writing `$PWD` to a scratch file proves probes inherit repo-root cwd exactly as reds do); and the end-to-end cardinality cell: a live exit-0 marker through the real CLI yields EXACTLY ONE `RED_ALREADY_GREEN` finding (the code stays owned by `synthesizeExecFindings`; additive threading that duplicated it fails this count). A probe-failure stderr over 200 characters is asserted trimmed at the CLI boundary in group (1), mirroring the shipped red-execution trim case.

(3) *Corpus distillations through `runLint`* (in `tests/specLint/redExec.test.ts`, constructed outcome maps, no live-corpus relint — governing-spec §8): the prose-red shape (`none (closeout gate task)`) → `RED_UNPARSEABLE`; a merged-corpus-shaped clean marker set → zero new findings (premise via `tests/_shared/premise.ts`: the fixture contains at least one vitest-shaped v2 marker, so the zero-findings assertion has discriminating power); the premisescan-shaped authored `-t` marker → `RED_TEST_NAME_FILTER` advisory only; the serialize-error one-edit typo shape → `RED_SUITE_UNVERIFIED` naming it; the step3 directory-selector shape (zero test-file tokens, non-empty collection) → clean, and its directory-typo variant (empty) → `RED_SUITE_UNVERIFIED`; the `pnpm heavy` wrapper shape → not recognized, no collection finding; the compound shape → declined, `RED_PROBE_UNVERIFIED`, no probe text. Each fixture states in a comment which corpus measurement it distills (AC-7).

Failure modes caught: parse pass gated behind `--exec-red`; unauthorized probe spawns invisible to report-level assertions; parse-failed markers executed or probed; adapter passing probe output through the stderr channel; fixture-project leakage into the repo root config.

**GREEN:** `lib/specLint/types.ts` gains the parse/collection outcome-map types; `lib/specLint/run.ts` threads them (null-safe: absent maps = static invocation, zero §5 findings — AC-5; `RED_ALREADY_GREEN` emission stays solely in `synthesizeExecFindings`); `scripts/spec-lint.ts` runs the parse pass on every plan-kind invocation (`sh -nc` via the mode-carrying spawn seam, repo-root cwd, existing ceiling + `SPEC_LINT_EXEC_TIMEOUT_SECS` seam) and the probe pass under `--exec-red` (populations filtered by the set of marker lines whose parse outcome was anything other than exit 0 — failures AND non-observations, spec §3 — for BOTH executions and probes), `SpawnResult` gaining `stdout`. Commit `feat(infra): wire parse and collection probes through the CLI`.

## Task 7 — mutation re-run + ledger re-anchor

<!-- task: red=`pnpm heavy pnpm mutation:guards` red-state=authored red-target=`tests/mutation/source/registry.ts:509` why=`Tasks 1-6 shift lib/specLint/redContract.ts lines, so the seven accepted-row siteIds anchored at the cited registry line and below go stale and the gate reds on stale-ledger plus survivor rows until the 1:1 re-anchor and re-measure land; red observed mid-task after the source diff, green after re-anchoring` ac=AC-6 -->


Re-anchor the 7 `equivalent` rows of the `redContract` registry entry to their post-diff lines (operator + `from>to` preserved, 1:1, the documented 2026-08-09 precedent), then run the scoped gate per the shard-filter procedure (filter `GUARD_SURFACES` to `redContract` in a temporary shard-filter test file (the guardSurfaces.shard pattern), run, DELETE the file — `_metaSourceShardIntegrity` pins shard files byte-for-byte), foreground, under `pnpm heavy`. Land only with score ≥ 0.95 and an empty unaccepted-survivor set; state both in the diff-review round-1 brief (AGENTS.md guard-surface brief rule).

<!-- gate: cmd=`pnpm heavy pnpm mutation:guards` probed=`a deliberately broken accepted-row siteId (off-by-one line) run before the re-anchor reports a stale ledger row and a surviving mutant, non-zero exit — observed during the arms-spec arc and re-probed at this task before trusting the green` -->

Commit `test(infra): re-anchor redContract mutation ledger and re-measure`.

## Task 8 — docs wiring + closeout

<!-- task: red=`sh -c "grep -q red-verdict-capability docs/agents/writing-plans.md"` red-state=live why=`grep -q exits 1 today because the red-executability bullet does not yet name this arc's landed arms; it exits 0 once the bullet gains the landed-arm sentence, which cites the 2026-08-17-spec-lint-red-verdict-capability spec by its slug` ac=AC-8 -->

`docs/agents/writing-plans.md` red-executability bullet gains one landed-arm sentence that MUST cite the spec by its slug (`2026-08-17-spec-lint-red-verdict-capability`), which is what the red command greps for; `docs/superpowers/specs/README.md` gains one row; run `pnpm spec:lint` on spec + this plan (0 hard, AC-8); ledger rows archived with markers removed in the PR's LAST commit (invariant 12 — archive move + `**Status:**` marker off in the same commit, set-arithmetic check per the ledger-conflict procedure).

Four-mutant record for this string-presence red, run at plan time per `docs/agents/writing-plans.md:16`: (a) emptied value — `grep -q '' <doc>` exits 0 on any file, which is why the red greps the SLUG, not an empty or generic phrase; (b) appended suffix — `grep -q red-verdict-capabilityXX` exits 1, so a corrupted spelling cannot satisfy the green; (c) present-but-not-live — the slug inside an HTML comment or unrelated paragraph WOULD satisfy the grep: accepted residual, dispositioned by the whole-diff cross-model review reading the actual bullet text (a docs-edit red command cannot see markdown semantics, and building a comment-aware grep here is the recognizer growth this arc forbids); (d) parameter varied — `grep -q red-verdict-capability docs/agents/spec-self-review.md` exits 1 today, so the green cannot be satisfied by editing the wrong doc. Probes (a), (b), (d) run 2026-08-18; (c) recorded as the declared residual.

Commit `docs(infra): wire the verdict-capability arms; archive the closed rows`.

<!-- tasks: end -->

## 12. Closeout

impeccable-gate: N/A — no UI surface

Gates before PR-final: `pnpm typecheck`; `pnpm exec eslint lib/specLint scripts/spec-lint.ts tests/specLint`; `pnpm vitest run tests/specLint/` (scoped, unwrapped); Task 7's mutation gate (wrapped, foreground); `pnpm spec:lint` on both artifacts (0 hard); registry diff confined to `siteId` re-anchors (§2). Cross-model whole-diff review to APPROVE precedes merge per the autonomous pipeline; CI green precedes `gh pr merge`.

## 11. Plan-time execution record (run 2026-08-17, before plan review dispatch)

The Task 1 fenced block was spliced into a temporary untracked file (tests/specLint/plantimeRedCheck.test.ts, deleted after the run) on this branch (verbatim, plus a plan-time-only `@ts-expect-error` on the missing import so the strict tsconfig admits the splice; that pragma is removed when Task 1 lands) and executed scoped:

```
FAIL tests/specLint/plantimeRedCheck.test.ts > parseCheckPlan > enumerates non-empty red= …
TypeError: parseCheckPlan is not a function
Test Files 1 failed (1) · Tests 1 failed (1)
```

Red observed for exactly the `red-target=` reason (the export does not exist on the live module); the splice was then deleted (nothing committed). Tasks 2-5 name their RED describes in prose with the same missing-export/missing-emission causes verified by grep at draft time (`parseCheckPlan`, `synthesizeParseFindings`, `collectionProbePlan`, `synthesizeCollectionFindings`, `RED_TEST_NAME_FILTER`, `RED_SUITE_UNVERIFIED` — zero hits in `lib/specLint/` today); their executable red lands in each task's own RED step per the ordinary invariant-1 shape. Task 8's live red and its four-mutant record were run at plan time (2026-08-18): baseline `grep -q red-verdict-capability docs/agents/writing-plans.md` exits 1; mutants (a)/(b)/(d) probed with the outputs recorded in the task body; (c) is the declared residual.

Plan review round 3 (2026-08-18) repaired three findings and, per the same-vector-recurrence rule (three rounds on the execution-matrix axis), closed the axis by checklist rather than per-cell: every normative execution requirement of spec §3/§5.1/§5.2 was enumerated and audited against the plan in one pass — (1) parse pass on default, mode-carried; (2) exclusion of parse failures AND non-observations; (3) live-exec population spawn-proven; (4) authored probe population OWNED-only (r3 F1 — Task 3 population assertion + Task 6 authored-position cells, zero spawns and zero advisories); (5) phase ordering, reds-then-probes each in doc order (r3 F2 — ordering cell); (6) probe only after non-zero red; (7) no probe on 0/126/127/timeout/signal; (8) probe stdout captured, red stdout discarded (sentinel); (9) stderr tails trimmed to 200 on BOTH new passes (r3 F3 — synthesis-level and CLI-boundary assertions; live probe: a 500-character invalid token yields a 581-byte `sh -nc` diagnostic, so the bound discriminates); (10) `RED_ALREADY_GREEN` cardinality exactly one; (11) authored reds never spawned; (12) compound/unstrippable declined with no probe text; (13) ambient env inheritance rides the shipped spawn seam unchanged (no new assertion owed); (14) the per-command ceiling and env seam bind probes (probe-ceiling cell, added by this audit, not by a finding); (15) probes inherit repo-root cwd (folded into the shipped `$PWD` case, likewise audit-added). Cells 14-15 are the audit's own product — added now precisely so the next round cannot drip them.

Plan review round 2 (2026-08-18) repaired four findings: the Task 3 rewrite example no longer contradicts the compound guard (first-occurrence pinned via a quoted occurrence, operator spellings shown declined); the spawn seam carries an explicit parse/exec MODE with a real-subprocess sentinel case proving the production `sh -nc` mapping (probed live: `sh -nc 'printf EXECUTED'` writes 0 bytes, `sh -c` writes 8); parse non-observations (timeout/signal/spawn error) now exclude the marker from execution and probing (spec §3 sentence tightened accordingly — the conservative §1.1 item 9 direction); and `RED_ALREADY_GREEN` ownership is pinned to `synthesizeExecFindings` with an end-to-end exactly-one cardinality cell in Task 6.

Plan review round 1 (2026-08-18) repaired five findings: the former fixture-distillation task was folded into Task 6's RED groups (its own red could not fail for a production reason once Tasks 1-6 had landed); Task 6 gained the fake-deps spawn-authorization matrix (spawn-set assertions per population cell, including the never-run-authored and parse-failed-exclusion cells); `collectionProbePlan` gained `excludeLines` with a direct exclusion assertion (Task 3); the combined absent-tracked-plus-untracked case asserting BOTH authored verdicts landed in Task 4; and Task 8's docs red was re-anchored to the spec slug with the four-mutant record above.
