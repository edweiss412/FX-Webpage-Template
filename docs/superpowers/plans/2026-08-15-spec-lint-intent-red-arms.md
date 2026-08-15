# spec:lint intent + red-executability arms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two approved spec:lint arms — tiered citation-intent advisories with relocation hints, and the declared red-contract marker grammar with static checks plus an opt-in `--exec-red` execution mode.

**Architecture:** Two new pure modules under `lib/specLint/` (citationIntent and redContract) wired through the existing orchestrator (`lib/specLint/run.ts`); the CLI adapter (`scripts/spec-lint.ts`) alone gains subprocess execution. The shipped `taskContract.ts` grammar widens in place (region attribute + optional v2 marker fields) and is an enrolled mutation surface, so its accepted-survivor ledger re-anchors in the same task.

**Tech Stack:** TypeScript (strict; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest, tsx; no new dependencies (spec §1.1 item 12).

**Spec:** `docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md` (APPROVED, adversarial R8). The spec is normative for every code, tier, precedence, and scope decision; this plan cites its sections instead of restating rationale.

## Global Constraints

- Purity: nothing under `lib/specLint/**` imports `node:fs` / `node:child_process` / `node:process` — `tests/specLint/_metaPureCore.test.ts` walks the directory and covers new files by default.
- Finding plumbing: red-contract findings report `check: "taskContract"`; citation-intent findings report `check: "citations"`; no new check groups (spec §5).
- Matching discipline everywhere identifiers are compared: word-boundary, regex-escaped, dotted-segment (segments ≥3 chars), case-sensitive — ONE shared implementation (spec §3.2, AC-3).
- Severity law: both citation-intent tiers are ADVISORY (spec §1.1 item 1); red-contract presence/validity/gate codes are hard except `RED_TARGET_RETIRED`, `RED_CONJUNCTION`, `GATE_UNPROBED`, `RED_EXEC_ERROR`, `RED_EXEC_TIMEOUT` (spec §4.3-§4.6).
- Scope law: presence checks are red-contract-region-scoped; `RED_TARGET_INVALID` is global on plan-kind v2 markers carrying the field; execution population = presence-check population only (spec §4.3/§4.4).
- Heavy phases (full-suite runs in Task 8) go under `pnpm heavy` per AGENTS.md; scoped vitest file runs stay unwrapped.
- Conventional commits, one commit per task, TDD per task (invariant 1); commit scope for this arc: `feat(spec-lint)` / `test(spec-lint)` / `docs(spec-lint)`.

## Acceptance criteria (quoted from spec §10, resolved here for marker `ac=` references)

- AC-1: ground-truth fixture suite pins 15 wrong-instance findings at exact tiers, 2 premise-guarded silent escapes, clean negatives.
- AC-2: `CITATION_SYMBOL_ABSENT` relocation detail names the wrong-site's true home when the doc cites it elsewhere, capped at 3.
- AC-3: one shared matching implementation (boundary + segments + escaping), pinned against substring and unescaped-metacharacter semantics.
- AC-4: every §4.3/§4.4/§4.5/§4.6 code fires and not-fires; presence regional, `RED_TARGET_INVALID` global; v1 task-contract byte-identity on legacy fixtures; span-exact §5 exclusion.
- AC-5: `--exec-red` executes only presence-population live markers on plans with §4.4's outcome mapping; adapter boundary cases pass.
- AC-6: `_metaPureCore` passes; both new surfaces enrolled, floor 0.95, empty unaccepted-survivor set, scores in the round-1 brief.
- AC-7: spec and this plan lint clean (`0 hard`) at dispatch time.

## Meta-test inventory (declared per writing-plans rule)

- EXTENDS by construction: `tests/specLint/_metaPureCore.test.ts` (directory walk covers the two new modules automatically — no edit needed, but Task 1/Task 5 run it to prove coverage).
- EXTENDS: `tests/mutation/source/registry.ts` (+2 rows, Task 7) — enrolled suites fall under `tests/mutation/_metaPremiseContract.test.ts` automatically.
- None of the auth/DB/admin registries apply: no Supabase call, no advisory lock, no §12.4 code, no mutation HTTP surface (spec §1.1 header + governing spec §7 invariant declaration).

## File structure

```
lib/specLint/citationIntent.ts      # Task 1 — matching, enclosing-name, tier classify, relocation (pure)
lib/specLint/citations.ts           # Task 2 — tier reporting via citationIntent; excludedSpans param
lib/specLint/run.ts                 # Task 2 + Task 5 — plumb tiers; compute red-target span exclusion
lib/specLint/taskContract.ts        # Task 4 — grammar widening only; exports shared fragments + topology
lib/specLint/redContract.ts         # Task 5 — v2 fields, static checks, gates; Task 6 — exec plan/synthesis
lib/specLint/types.ts               # Task 6 — ExecOutcome types
scripts/spec-lint.ts                # Task 6 — --exec-red, env grammar, classifySpawnResult (exported)
tests/specLint/citationIntent.test.ts        # Task 1
tests/specLint/citationIntentWiring.test.ts  # Task 2
tests/specLint/citationIntentCorpus.test.ts  # Task 3 (+ fixtures/citationIntent/)
tests/specLint/taskContractV2Grammar.test.ts # Task 4 (+ fixtures/legacyPlans/)
tests/specLint/redContract.test.ts           # Task 5
tests/specLint/redExec.test.ts               # Task 6 (pure) + cli.test.ts extensions (adapter)
tests/mutation/source/registry.ts            # Task 7 (+2 rows)
```

<!-- tasks: depth=3 -->

### Task 1: citationIntent core module

**Files:**
- Create: lib/specLint/citationIntent.ts
- Test: tests/specLint/citationIntent.test.ts

**Interfaces (Produces):**

```ts
export function idPatterns(rawId: string): RegExp[];
// boundary-anchored, regex-escaped pattern for the raw id, plus one per dotted
// segment of length >= 3. Boundary: (?<![A-Za-z0-9_$])id(?![A-Za-z0-9_$]).
export function enclosingName(lines: string[], startLine: number): string | null;
// upward scan per spec §3.3 step 2: TS decl shape, SQL create shape, ATX heading.
export type IntentTier = "clean" | "unmatched" | "absent";
export interface IntentResult { tier: IntentTier; enclosing: string | null; }
export function classifyIntent(
  lines: string[], start: number, end: number, rawIds: string[],
): IntentResult;
// spec §3.3 order: window ±5 hit -> clean; enclosing-name hit -> clean;
// file hit -> "unmatched"; else "absent".
export function relocationHints(
  rawIds: string[], peers: { path: string; lines: string[] | null }[], cap: number,
): string[];
// peers with null lines skipped (spec §3.4); doc order; cap names.
```

<!-- task: red=`pnpm vitest run tests/specLint/citationIntent.test.ts` ac=AC-3 -->

- [ ] **Step 1: Write the failing suite.** Cases (each derived from the fixture's construction, exact tier asserted): boundary hit vs substring near-miss both directions (`deps` must NOT match `depsWithStart`-only content, and `SyncLogDeps.logSync` MUST match via its `logSync` segment); escaping (`foo.bar` must NOT match `fooXbar`; `$var` literal); segment length floor (`a.of` contributes no `of` pattern); enclosing-name for `export async function NAME`, `const NAME`, `interface NAME`, SQL `create or replace function public.NAME`, `## Heading`, and no-match-by-line-1 → null; tier boundaries crossed both ways at exactly ±5 (window line `start-5` hits, `start-6` misses); enclosing rescue (id only in decl name 40 lines up → clean); file-hit → `"unmatched"`; nowhere → `"absent"`; relocation (found in peer, cap honored at 3, null-lines peer skipped, empty peers → []).
- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/specLint/citationIntent.test.ts` — RED because lib/specLint/citationIntent.ts does not exist (the production surface this task creates).
- [ ] **Step 3: Implement the module** per the interface block above; the §3.3 regexes verbatim from the spec.
- [ ] **Step 4: Run to verify green**, then `pnpm vitest run tests/specLint/_metaPureCore.test.ts` (new file swept, no node imports).
- [ ] **Step 5: Commit** `feat(spec-lint): citation-intent matching, enclosing-name, and tier core`.

### Task 2: citation tiers wired through checkCitations and runLint

**Files:**
- Modify: `lib/specLint/citations.ts` (the advisory branch at the end of `checkCitations`, currently `citations.ts:198-224`; hard paths untouched — spec §3.1)
- Modify: `lib/specLint/run.ts` (`checkCitations` call at `run.ts:33`)
- Test: tests/specLint/citationIntentWiring.test.ts

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `checkCitations(model, resolver, excludedSpans?: ReadonlySet<string>)` — keys `` `${line}:${column}` `` of spans to skip entirely (never candidates); Task 5 supplies the real set, this task threads an empty default. Tier findings per spec §3.5: tier `"unmatched"` → `CITATION_SYMBOL_UNMATCHED`, message unchanged, detail `cited line: <trimmed 160> · enclosing: <name or "(none)">`; tier `"absent"` → `CITATION_SYMBOL_ABSENT`, message `same-line identifiers absent from <path>`, detail `enclosing: <...> · identifiers: <list> · found in: <up to 3 paths | "none of the doc's other cited files">`. Relocation peers = deduped `resolvedPaths` minus the cited file, read through the resolver.

<!-- task: red=`pnpm vitest run tests/specLint/citationIntentWiring.test.ts` ac=AC-2 -->

- [ ] **Step 1: Write the failing suite** (fixture resolver, in-memory docs — mirror the harness shape of `tests/specLint/run.test.ts:138` "cross-checker plumbing"): UNMATCHED detail carries enclosing name; ABSENT fires with relocation naming a peer the doc cites elsewhere (fixture: the doc cites fixture file a/wrong.ts line 5 with id `target` on the line, and cites b/right.ts elsewhere; `target` lives only in b/right.ts, so the detail must contain the b/right.ts relocation entry); cap at 3 peers (5-peer fixture); no-peer fallback string exact; id-less citation stays silent (spec §8 item 11); `excludedSpans` containing a span key removes that span from candidacy entirely (no finding, no anchor, no relocation feed); relocation peer with `readFileLines → null` skipped.
- [ ] **Step 2: Run to verify RED** — `CITATION_SYMBOL_ABSENT` is emitted nowhere in the live tree (`grep -rn CITATION_SYMBOL_ABSENT lib/` is empty today), so the new cases fail against shipped `citations.ts`.
- [ ] **Step 3: Implement** — replace the naive `includes` advisory branch with Task 1's `classifyIntent` + `relocationHints`; add the `excludedSpans` parameter (default empty set) consulted at the top of the span loop; `run.ts` passes an empty set until Task 5.
- [ ] **Step 4: Green** on the new suite AND `pnpm vitest run tests/specLint/citations.test.ts tests/specLint/run.test.ts tests/specLint/cli.test.ts` — existing hard-path cases must be untouched; the shipped UNMATCHED cases may need their expected DETAIL strings extended (message stays byte-identical), nothing else.
- [ ] **Step 5: Commit** `feat(spec-lint): tiered citation-intent advisories with relocation hints`.

### Task 3: ground-truth corpus fixture suite

**Files:**
- Create: `tests/specLint/fixtures/citationIntent/` (fixture doc + small cited files)
- Test: tests/specLint/citationIntentCorpus.test.ts

**Interfaces:** Consumes Task 2's tier behavior end-to-end via `runLint` with a fixture resolver.

Structure-preserving distillation per spec §6: for each of the 17 classifiable wrong instances of the measured corpus (`docs/review-rounds/feat/spec-lint-intent-red/ecbddfa1aac4.md` records the derivation; the case table lives in the arc scratchpad and is reproduced below as the fixture's source of truth), one fixture doc line + fixture cited-files reproducing window/enclosing/file-presence structure at small line numbers. Truth table (badplan `docLine:anchor` → expected):

```
FIRES (15): 221:{740,826,842,863,896,922,1019} ids scanPreparedFileWithTx/recordLiveRowConflict/file.driveFileId
            223:1134 RUN_LEVEL_SYNC_LOG_SITES · 229:147 runManualStageForFirstSeen,runManualSyncForShow,runOne
            309:53-64 sync_log_prune · 317:60-62 test.each · 319:{35,39-41,60-62} EXECUTES_WIPE,ENABLES_WIPE_GATE
            329:42-43 CALLS_LOCAL_GUARD,postgres,assertLocalDbUrl
SILENT (2, premise-guarded): 221:719, 221:1001 — vocabulary-sharing sibling window-hits (spec §1.1 item 2)
NEGATIVES: >=6 rows modeled on the merged plan's correct citations incl. two future-code
            ABSENT-tier rows (durationMs-style) asserted as ADVISORY not hard
```

<!-- task: red=`pnpm vitest run tests/specLint/citationIntentCorpus.test.ts` ac=AC-1 -->

- [ ] **Step 1: Build fixtures + failing suite.** Each FIRES case asserts its exact code (`CITATION_SYMBOL_UNMATCHED` when the id set exists elsewhere in the fixture wrong-file, `CITATION_SYMBOL_ABSENT` otherwise — derive per case from the fixture file you construct, comment each with its badplan anchor). Each SILENT case carries `premise(...)` from `tests/_shared/premise.ts` proving the fixture's wrong-file DOES boundary-match an id within ±5 (the condition that makes silence the designed outcome) immediately above the zero-finding assertion. Negatives assert zero intent findings (and for the two ABSENT-tier future-code rows: advisory severity, exit-relevant `severity: "advisory"`).
- [ ] **Step 2: RED** — suite file absent until now; cases then fail if any tier misclassifies.
- [ ] **Step 3/4: Adjust fixtures only, never thresholds** (the tiers are spec-fixed); green.
- [ ] **Step 5: Commit** `test(spec-lint): ground-truth citation-intent corpus fixture suite`.

### Task 4: task-contract grammar widening (enrolled surface)

**Files:**
- Modify: `lib/specLint/taskContract.ts` (`OPEN` at `lib/specLint/taskContract.ts:25`, `MARKER` at `taskContract.ts:39`, `MARKER_AC_ABSENT` at `taskContract.ts:45`; export shared fragments)
- Test: tests/specLint/taskContractV2Grammar.test.ts; Create `tests/specLint/fixtures/legacyPlans/` holding verbatim copies of `docs/superpowers/plans/2026-08-10-promote-identity-validation.md` and `docs/superpowers/plans/2026-08-09-libdata-call-boundary-metatest.md` (chosen at plan time: the two smallest enrolled legacy plans, 53 and 89 lines)

**Interfaces (Produces, consumed by Task 5):**

```ts
export const OPEN: RegExp;        // now /^ {0,3}<!-- tasks: depth=([1-6])( red-contract)? -->[ \t]*$/
export const MARKER_ANY: RegExp;  // unchanged, exported
export const V2_FIELDS: string;   // regex source fragment for the optional field block
export interface TaskTopology {
  regions: { depth: number; start: number; end: number; redContract: boolean }[];
  extents: { start: number; end: number; redContract: boolean }[];
  owned: Map<number, number[]>;   // extent start -> marker lines
  orphaned: number[];
}
export function taskTopology(model: DocModel): TaskTopology;  // pure re-derivation used by redContract
```

Marker grammar (spec §4.2, fixed order, single spaces): `red=` … optional `` red-state=live|authored ``, optional `` red-target=`<non-backtick>` ``, optional `` why=`<non-backtick>` ``, then `ac=`. All captures non-backtick (`[^`]*`); blankness is semantic, never grammatical (spec §4.2 as repaired in review R6).

<!-- task: red=`pnpm vitest run tests/specLint/taskContractV2Grammar.test.ts` ac=AC-4 -->

- [ ] **Step 1: Failing suite.** `red-contract` region attribute recognized; bare form unchanged; `<!-- tasks: depth=2 red-contract=1 -->` and other attribute misspellings → `TASK_ENROLL_MALFORMED`; every v2 field combination parses as a well-formed marker (no `TASK_MARKER_MALFORMED`); reordered fields → `TASK_MARKER_MALFORMED`; v1 semantics preserved ON v2 forms — empty v2 `red=` → `TASK_RED_EMPTY`, absent `ac=` on otherwise-well-formed v2 marker → `TASK_AC_MISSING` incl. the double-defect precedence (`red=`` ` with no ac → `TASK_MARKER_MALFORMED`, mirroring `tests/specLint/taskContract.test.ts:460-462`), v2 `ac=` ids resolve with self-resolution exclusion, v2 markers count for duplicate/cardinality; byte-identity corpus regression: `runLint` over both `fixtures/legacyPlans/` files with the real-repo resolver substitute (fixture resolver listing the files those plans cite is NOT needed — assert on the `check: "taskContract"` findings subset only, compared to a committed JSON snapshot generated in this step from the SHIPPED code before the grammar edit).
- [ ] **Step 2: RED** — the production line rejecting v2 fields is the exact `MARKER` regex at `lib/specLint/taskContract.ts:39` (no optional-field branch), so every v2-form case fails.
- [ ] **Step 3: Widen** `OPEN`/`MARKER`/`MARKER_AC_ABSENT` with the optional field block; add `taskTopology` (extract of the existing pass-1/pass-2 logic, no behavior change); keep `compareFindings` untouched.
- [ ] **Step 4: Green** on the new suite + `pnpm vitest run tests/specLint/taskContract.test.ts tests/specLint/taskContractFindingOrder.test.ts tests/specLint/taskContractWiring.test.ts`.
- [ ] **Step 5: Re-anchor the mutation ledger** for the `taskContract` surface: `pnpm mutation:guards` (heavy-adjacent but scoped: it is the registered gate suite — run it as-is); moved accepted-survivor rows re-anchor 1:1 preserving operator AND `from>to` text (registry comment, `tests/mutation/source/registry.ts:170-180` precedent); score must stay ≥0.95 with empty unaccepted set.
- [ ] **Step 6: Commit** `feat(spec-lint): widen task-contract grammar for red-contract regions and v2 marker fields`.

### Task 5: redContract static checks, gate markers, span exclusion

**Files:**
- Create: lib/specLint/redContract.ts
- Modify: `lib/specLint/run.ts` (compute exclusion set from `redTargetSpans`, pass to `checkCitations`; append `checkRedContract` findings)
- Test: tests/specLint/redContract.test.ts; extend tests/specLint/citationIntentWiring.test.ts exclusion cases

**Interfaces (Produces):**

```ts
export interface V2Marker {
  line: number; red: string; redState: "live" | "authored" | null;
  redTarget: { raw: string; column: number } | null; why: string | null; acRaw: string;
}
export function parseV2Marker(lineText: string, lineNo: number): V2Marker | null; // null = not marker-shaped or not well-formed
export function redTargetSpans(model: DocModel): ReadonlySet<string>; // `${line}:${column}` for well-formed plan markers
export function checkRedContract(model: DocModel, kind: "spec" | "plan", resolver: FileResolver): Finding[];
export function planExecutions(model: DocModel): { line: number; command: string }[]; // presence-population live markers only
```

Codes implemented here (spec §4.3/§4.5/§4.6; check `"taskContract"`): hard `RED_STATE_MISSING`, `RED_WHY_MISSING`, `RED_TARGET_MISSING`, `RED_TARGET_INVALID` (per-form: colon = malformed/bare/untracked/unreadable/out-of-range/inverted; path-only = tracked), `GATE_CMD_EMPTY`, `GATE_MALFORMED`; advisory `RED_TARGET_RETIRED` (same-extent fenced `git mv|git rm` exact token), `RED_CONJUNCTION` (`&&`), `GATE_UNPROBED`. Presence codes: region-scoped via `taskTopology`. `RED_TARGET_INVALID`: every well-formed plan-kind v2 marker carrying the field (spec §4.3 validity-global).

<!-- task: red=`pnpm vitest run tests/specLint/redContract.test.ts` ac=AC-4 -->

- [ ] **Step 1: Failing suite.** Every code above fired and not-fired: presence codes only inside `red-contract` regions (v1 marker inside contract region → exactly the presence codes; v2 fields in a bare region → no presence findings); `RED_TARGET_INVALID` on an OUTSIDE-region invalid target (the review-R5 case) and inside; both target forms positive (colon on tracked in-range fixture line; path-only on untracked path) and each invalid reason per form; blank-capture matrix — all four fields (`why=`, `red-target=`, gate `cmd=`, gate `probed=`), each PRESENT-but-blank in empty AND whitespace-only spellings, distinct from the absent-field cases; retired-target advisory same-extent via fenced `git mv` and `git rm`, cross-extent move and non-fenced mention each NOT firing; `RED_CONJUNCTION` on `&&` only; gate shapes well-formed with/without probed; `GATE_MALFORMED` prefix mismatch; gate lines inert in spec-kind docs; mixed plan (bare + red-contract regions) proving region-locality of presence and of `planExecutions` (live marker in the bare region absent from the plan list).
- [ ] **Step 2: RED** — lib/specLint/redContract.ts does not exist.
- [ ] **Step 3: Implement**; wire `run.ts`: exclusion set = `redTargetSpans(model)` when kind is plan; findings appended before the sort.
- [ ] **Step 4: Green** + exclusion wiring cases in citationIntentWiring.test.ts: excluded `red-target=` span draws no citation finding and cannot anchor; citation-shaped spans in `red=`/`why=`/gate `cmd=`/gate `probed=` and on spec-kind marker lines still draw `CITATION_FILE_MISSING` (pin the review-R3/R4 probe outputs as expected behavior). Run `pnpm vitest run tests/specLint/_metaPureCore.test.ts`.
- [ ] **Step 5: Commit** `feat(spec-lint): red-contract static checks, gate markers, span-exact citation exclusion`.

### Task 6: execution mode (--exec-red)

**Files:**
- Modify: `lib/specLint/types.ts` (ExecOutcome), lib/specLint/redContract.ts (synthesis), `lib/specLint/run.ts` (accept optional outcomes map)
- Modify: `scripts/spec-lint.ts` (flag, env grammar, subprocess, exported `classifySpawnResult`)
- Test: tests/specLint/redExec.test.ts (pure), `tests/specLint/cli.test.ts` (adapter)

**Interfaces:**

```ts
// types.ts
export type ExecOutcome =
  | { kind: "exit"; code: number }
  | { kind: "timeout" }
  | { kind: "signal"; signal: string }
  | { kind: "spawn-error"; message: string };
// redContract.ts
export function synthesizeExecFindings(
  plan: { line: number; command: string }[],
  outcomes: ReadonlyMap<number, ExecOutcome> | null,
  stderrTails: ReadonlyMap<number, string>,
): Finding[];
// scripts/spec-lint.ts (exported for unit tests)
export function classifySpawnResult(r: {
  status: number | null; signal: NodeJS.Signals | string | null; error?: { code?: string; message?: string };
}): ExecOutcome;
```

`classifySpawnResult` precedence is error-first per spec §4.4: `error` present → `ETIMEDOUT` = timeout, else spawn-error, regardless of status/signal; else signal; else exit. Synthesis: exit 0 → hard `RED_ALREADY_GREEN`; 126/127 → advisory `RED_EXEC_ERROR` (stderr tail ≤200 in detail); timeout → advisory `RED_EXEC_TIMEOUT`; signal/spawn-error → advisory `RED_EXEC_ERROR` naming which; other exits → no finding; null map → no findings. Adapter: `--exec-red` usage-error on kind spec and on duplicate; env `SPEC_LINT_EXEC_TIMEOUT_SECS` must match `[1-9][0-9]*` when set, else exit 2 naming it; `sh -c`, cwd repo root, env inherited, stdout discarded, sequential doc order.

<!-- task: red=`pnpm vitest run tests/specLint/redExec.test.ts` ac=AC-5 -->

- [ ] **Step 1: Failing pure suite** (redExec.test.ts): synthesis table incl. the review-R4 hybrid `{status: 0, error: {code: "ETIMEDOUT"}}` → timeout via `classifySpawnResult`… (classifier cases live in the CLI suite since the export is adapter-side; here: fake outcome maps per spec §6 execution suite, `planExecutions` ordering and authored-exclusion asserted on the plan itself).
- [ ] **Step 2: RED** — `synthesizeExecFindings` unexported (production absence: no such symbol in lib/specLint/redContract.ts after Task 5).
- [ ] **Step 3: Implement core; then adapter** — flag parse (mirror the `--json` duplicate-detection shape at `scripts/spec-lint.ts:78-97`), env validation, `spawnSync("sh", ["-c", cmd], { cwd: root, timeout: secs * 1000, encoding: "utf8" })`, classification, outcome map into `runLint`.
- [ ] **Step 4: CLI adapter cases** (extend `cli.test.ts`; committed fixture plan with live markers; trivial commands only): `--exec-red` on spec → 2; duplicate → 2; `exit 0` → exit 1 + `RED_ALREADY_GREEN`; `exit 1` → exit 0; `exit 126`/`exit 127` → advisory each; `SPEC_LINT_EXEC_TIMEOUT_SECS=1` + `sleep 5` → `RED_EXEC_TIMEOUT`; env values `0`/`-1`/`abc`/empty → exit 2 each; `pwd > "$SCRATCH/cwd.txt"` fixture proves repo-root cwd; `exit $((125+2))` proves `sh -c`; >200-char stderr then exit 127 → trimmed tail; `kill -TERM $$` → `RED_EXEC_ERROR` naming SIGTERM. Unit-test `classifySpawnResult` with constructed results: ENOENT, SIGTERM, `{status:0}`, the ETIMEDOUT hybrid.
- [ ] **Step 5: Commit** `feat(spec-lint): opt-in --exec-red execution mode with error-first outcome classification`.

### Task 7: mutation enrolment for both new surfaces

**Files:**
- Modify: `tests/mutation/source/registry.ts`

**Registry reconciliation (authored AND run at plan time — the two rows to add, no removals; current row ids: taskContract, ledgerClaimsCore, ledgerGit, reviewRoundCount, reviewRoundCorpus, phantomGapExecuted, popoverOverlayExtract, renderedTextHaystack, interactionTimingScan — verified against `tests/mutation/source/registry.ts` grep `id:` 2026-08-15):**

```ts
{
  id: "citationIntent",
  sourcePath: "lib/specLint/citationIntent.ts",
  suitePaths: ["tests/specLint/citationIntent.test.ts", "tests/specLint/citationIntentCorpus.test.ts"],
  operators: [...OPERATOR_NAMES],
  scoreFloor: 0.95,
  control: { from: 'const lo = Math.max(1, start - 5);', to: 'const lo = Math.max(1, start - 4);' },
  accepted: [],
},
{
  id: "redContract",
  sourcePath: "lib/specLint/redContract.ts",
  suitePaths: ["tests/specLint/redContract.test.ts", "tests/specLint/redExec.test.ts"],
  operators: [...OPERATOR_NAMES],
  scoreFloor: 0.95,
  control: { from: 'kind !== "plan"', to: 'kind === "plan"' },
  accepted: [],
},
```

(Control `from` strings must exist verbatim in the implemented modules — Task 1/Task 5 implementers keep those exact spellings; if an implementation legitimately drifts, update the control in the same commit and say so.)

<!-- task: red=`pnpm exec tsx -e 'import { GUARD_SURFACES } from "./tests/mutation/source/registry"; process.exit(GUARD_SURFACES.some(s => s.id === "citationIntent") && GUARD_SURFACES.some(s => s.id === "redContract") ? 0 : 1)'` ac=AC-6 -->

- [ ] **Step 1: RED** — the command above exits 1 (rows absent; the production surface is the registry array itself).
- [ ] **Step 2: Add both rows; run `pnpm heavy pnpm mutation:guards`.** Both scores ≥0.95; every survivor either killed by a strengthened test (preferred) or argued into `accepted` with a reason row (equivalent/accepted-gap per the registry's ledger contract) — an `accepted` row added here must cite its argument; unaccepted set must be EMPTY.
- [ ] **Step 3: Commit** `test(spec-lint): enroll citationIntent and redContract in the source-mutation gate` — state both scores in the commit body; they also go in the implementation arc's round-1 review brief (AC-6).

### Task 8: docs wiring + close-out gates

**Files:**
- Modify: `docs/agents/writing-plans.md` (red-executability bullet: replace "Mechanical arm filed as `BL-SPECLINT-RED-EXECUTABILITY-ARM`." with one sentence naming the landed mechanism: red-contract regions, v2 fields, `--exec-red`, pointer to the spec)
- Modify: `docs/agents/spec-self-review.md` (task-contract block: one sentence noting the optional `red-contract` region attribute + v2 marker fields, pointer to the spec)
- Modify: `docs/superpowers/specs/README.md` (one index row for the spec)

<!-- task: red=`sh -c 'grep -q "red-contract" docs/agents/spec-self-review.md'` ac=AC-7 -->

- [ ] **Step 1: RED** — the grep exits 1 (neither agent doc mentions `red-contract` yet; the production lines are the two doc sentences this task adds).
- [ ] **Step 2: Make the three edits; grep goes green.**
- [ ] **Step 3: Close-out gates** (pre-push discipline): `pnpm heavy pnpm test:fast` (full suite), `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, and dogfood `pnpm spec:lint` on BOTH the spec and this plan (0 hard each, AC-7).
- [ ] **Step 4: Commit** `docs(spec-lint): wire the landed red-contract and intent arms into the agent docs`.

<!-- tasks: end -->

## Deferred to the merge step (not tasks)

- BACKLOG archival of `BL-SPEC-LINT-CITATION-INTENT` + `BL-SPECLINT-RED-EXECUTABILITY-ARM` and removal of their `**Status:** IN PROGRESS` markers happen in the PR's LAST commit per invariant 12 (archives reject in-flight entries).
- Impeccable gate: `impeccable-gate: N/A — no UI surface` (no file under `app/` or `components/` is touched; closeout marker line to be carried in the arc's closeout doc per invariant 8).

## Self-review notes (run at authoring)

- Spec coverage: §3 → Tasks 1-3; §4.1-§4.3/§4.5/§4.6 → Tasks 4-5; §4.4 → Task 6; §7 → Task 7; §9 → Task 8; §6 test shapes distributed per task; §5 architecture respected (purity, outcome-injection, span exclusion).
- Anti-tautology: every RED names its production line (absent module, absent export, exact regex line `taskContract.ts:39`, registry array, doc sentences); corpus suite derives expectations from fixture construction with premise guards on the two silent cases; byte-identity snapshot generated from SHIPPED code before the grammar edit so the regression discriminates.
- Type consistency: `ExecOutcome`, `V2Marker`, `TaskTopology`, `classifySpawnResult` signatures appear once each and are consumed by name in later tasks.
