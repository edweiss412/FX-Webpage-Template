# spec:lint intent + red-executability arms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two approved spec:lint arms — tiered citation-intent advisories with relocation hints, and the declared red-contract marker grammar with static checks plus an opt-in `--exec-red` execution mode.

**Architecture:** Two new pure modules under `lib/specLint/` (citationIntent and redContract) wired through the existing orchestrator (`lib/specLint/run.ts`); the CLI adapter (`scripts/spec-lint.ts`) alone gains subprocess execution. The shipped `taskContract.ts` owns ALL marker/region recognition (spec §5 one-grammar-one-owner): its grammar widens in place and it exports the structured marker parse the redContract module consumes. It is an enrolled mutation surface, so its accepted-survivor ledger re-anchors in the same task.

**Tech Stack:** TypeScript (strict; `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), vitest, tsx; no new dependencies (spec §1.1 item 12).

**Spec:** `docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md` (APPROVED, adversarial R8). The spec is normative for every code, tier, precedence, and scope decision; this plan cites its sections instead of restating rationale.

## Global Constraints

- Purity: nothing under `lib/specLint/**` imports `node:fs` / `node:child_process` / `node:process` — `tests/specLint/_metaPureCore.test.ts` walks the directory and covers new files by default.
- Finding plumbing: red-contract findings report `check: "taskContract"`; citation-intent findings report `check: "citations"`; no new check groups (spec §5).
- Matching discipline everywhere identifiers are compared: word-boundary, regex-escaped, dotted-segment (segments ≥3 chars), case-sensitive — ONE shared implementation (spec §3.2, AC-3).
- Severity law: both citation-intent tiers are ADVISORY (spec §1.1 item 1); red-contract presence/validity/gate codes are hard except `RED_TARGET_RETIRED`, `RED_CONJUNCTION`, `GATE_UNPROBED`, `RED_EXEC_ERROR`, `RED_EXEC_TIMEOUT` (spec §4.3-§4.6).
- Scope law: presence checks are red-contract-region-scoped; `RED_TARGET_INVALID` is global on plan-kind v2 markers carrying the field; execution population = presence-check population only (spec §4.3/§4.4).
- **Coordinate contract (every new-finding assertion, every suite):** assert `code`, `severity`, `docLine`, AND `column`, each derived from the fixture's construction (count the characters, don't run-and-paste). A finding anchored to the wrong span or off by one column is a failure these suites must catch.
- Heavy phases (full-suite runs in Task 7) go under `pnpm heavy` per AGENTS.md; scoped vitest file runs stay unwrapped.
- Test discovery/CI wiring (verified at plan time): all six new suites match `BASE_INCLUDE = tests/**/*.test.ts` (`vitest.projects.ts:20`) and run in the sharded unit-suite job; `.github/workflows/unit-suite.yml` has no path filter — no workflow edit needed.
- Conventional commits, one commit per task, TDD per task (invariant 1); commit scope: `feat(spec-lint)` / `test(spec-lint)` / `docs(spec-lint)`.

## Acceptance criteria (quoted from spec §10, resolved here for marker `ac=` references)

- AC-1: ground-truth fixture suite pins 15 wrong-instance findings at exact tiers, 2 premise-guarded silent escapes, clean negatives.
- AC-2: `CITATION_SYMBOL_ABSENT` relocation detail names the wrong-site's true home when the doc cites it elsewhere, capped at 3.
- AC-3: one shared matching implementation (boundary + segments + escaping), pinned against substring and unescaped-metacharacter semantics in each of the four consumers.
- AC-4: every §4.3/§4.4/§4.5/§4.6 code fires and not-fires; presence regional, `RED_TARGET_INVALID` global; v1 task-contract byte-identity on legacy fixtures; span-exact §5 exclusion.
- AC-5: `--exec-red` executes only presence-population live markers on plans with §4.4's outcome mapping; adapter boundary cases pass.
- AC-6: `_metaPureCore` passes; both new surfaces enrolled, floor 0.95, empty unaccepted-survivor set, scores in the round-1 brief.
- AC-7: spec and this plan lint clean (`0 hard`) at dispatch time.

## Meta-test inventory (declared per writing-plans rule)

- EXTENDS by construction: `tests/specLint/_metaPureCore.test.ts` (directory walk covers the two new modules automatically — no edit needed, but Tasks 1/4 run it to prove coverage).
- EXTENDS: `tests/mutation/source/registry.ts` — Task 3 widens the existing `taskContract` row's `suitePaths`; Task 6 adds two rows. Enrolled suites fall under `tests/mutation/_metaPremiseContract.test.ts`, whose `EXPECTED_ENV_TOUCHING` map (`tests/mutation/_metaPremiseContract.test.ts:31`) exact-matches the registry's suite set (`_metaPremiseContract.test.ts:92`) — so EVERY enrolment step here also adds a declared env-touching count row: Task 3 declares taskContractV2Grammar (expected 0 — fixture reads are not provenance); Task 6 declares the five other suites — citationIntent 0, citationIntentWiring 0, citationIntentCorpus 0, redContract 0, redExec 0. All six enrolled suites are env-count 0 BY CONSTRUCTION: every real-CLI (subprocess-spawning) case in this plan lives in `tests/specLint/cli.test.ts`, which is NOT an enrolled suite — the enrolled wiring suite holds only in-memory `runLint` cases. (Should an implementer move a spawning test into an enrolled suite anyway, it must carry `premise(...)` from `tests/_shared/premise.ts` or an exemption — `tests/mutation/_metaPremiseContract.test.ts:110-118` rejects enrolled env-touching tests lacking one — and the declared count changes with it.)
- None of the auth/DB/admin registries apply: no Supabase call, no advisory lock, no §12.4 code, no mutation HTTP surface (spec §1.1 header + governing spec §7 invariant declaration).

## Ground-truth tier table (the committed oracle for Task 2's corpus suite)

Derived 2026-08-15 from the measured probes (probe4, boundary-matched, contemporaneous tree; transcripts in the arc scratchpad, derivation narrative in `docs/review-rounds/feat/spec-lint-intent-red/ecbddfa1aac4.md`). Tier is fixed HERE, per case — the fixture must be constructed to realize it, never the other way around. Key = badplan `docLine:anchor`.

```
UNMATCHED (ids exist elsewhere in the wrong file; 10 cases):
  221:740  221:826  221:842  221:863  221:896  221:922  221:1019   ids: scanPreparedFileWithTx, recordLiveRowConflict, file.driveFileId
  229:147   ids: runManualStageForFirstSeen, runManualSyncForShow, runOne
  317:60-62 ids: test.each
  329:42-43 ids: CALLS_LOCAL_GUARD, postgres, assertLocalDbUrl
ABSENT (no id anywhere in the wrong file; 5 cases):
  223:1134  ids: RUN_LEVEL_SYNC_LOG_SITES
  309:53-64 ids: sync_log_prune
  319:35  319:39-41  319:60-62   ids: EXECUTES_WIPE, ENABLES_WIPE_GATE
SILENT (vocabulary-sharing sibling window-hit; premise-guarded; 2 cases):
  221:719  221:1001
NEGATIVES (zero intent findings), modeled on merged-plan correct citations - plus TWO
future-code rows (durationMs-style: id absent from the cited file because the plan
introduces it) pinned as ABSENT-tier ADVISORY findings, proving severity never escalates.
```

## File structure

```
lib/specLint/citationIntent.ts      # Task 1 - matching, enclosing-name, tier classify, relocation (pure)
lib/specLint/citations.ts           # Task 2 - deferred two-pass tier reporting; excludedSpans param
lib/specLint/run.ts                 # Task 2 + Task 4 + Task 5 - plumb tiers, exclusion, exec bundle
lib/specLint/taskContract.ts        # Task 3 - grammar widening + exported marker parse + topology
lib/specLint/redContract.ts         # Task 4 - static checks, gates; Task 5 - exec plan/synthesis
lib/specLint/types.ts               # Task 5 - ExecOutcome types
scripts/spec-lint.ts                # Task 5 - --exec-red, env grammar, classifySpawnResult (exported)
tests/specLint/citationIntent.test.ts        # Task 1
tests/specLint/citationIntentWiring.test.ts  # Task 2 (runLint-only; real-CLI cases live in cli.test.ts)
tests/specLint/citationIntentCorpus.test.ts  # Task 2 (+ fixtures/citationIntent/)
tests/specLint/taskContractV2Grammar.test.ts # Task 3 (+ fixtures/legacyPlans/)
tests/specLint/redContract.test.ts           # Task 4
tests/specLint/redExec.test.ts               # Task 5 (pure) + cli.test.ts extensions (adapter)
tests/mutation/source/registry.ts            # Task 3 (suitePaths widening) + Task 6 (+2 rows)
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
// file hit -> "unmatched"; else "absent". EVERY comparison goes through idPatterns.
export function relocationHints(
  rawIds: string[], peers: { path: string; lines: string[] | null }[], cap: number,
): string[];
// peers with null lines skipped (spec §3.4); doc order; cap names; idPatterns matching.
```

<!-- task: red=`pnpm vitest run tests/specLint/citationIntent.test.ts` ac=AC-3 -->

- [ ] **Step 1: Write the failing suite.** Cases (expected values derived from fixture construction): boundary vs substring BOTH directions and PER CONSUMER — for each of window, enclosing-name, whole-file, and relocation, TWO cases where wrong matching flips the result — a substring case (content holds only `depsWithStart`, id `deps` → no hit) AND an unescaped-metacharacter case (content holds only `fooXbar`, id `foo.bar` → no hit) — so a consumer that keeps `includes`, or interpolates the raw id unescaped, fails its own cases (AC-3 "in any of the four"); escaping (`foo.bar` NOT matching `fooXbar`; `$var` literal); idPatterns unit rows — a dotted id yields the full-id pattern PLUS one per segment of length >=3 (positive: `SyncLogDeps.logSync` yields patterns matching bare `logSync` and bare `SyncLogDeps`), and the floor (`a.of` contributes no `of` pattern); enclosing-name shapes — the FULL ratified grammar, one case per alternative: TS `function`/`const`/`let`/`var`/`class`/`interface`/`type`/`enum` — each keyword bare, and the modifier matrix on `function`: `export function`, `async function` (NO export — the independently-optional case), `export async function` —, SQL `create function`, `create or replace function public.NAME`, and `create table`/`trigger`/`index`/`policy`/`view` incl. an UPPERCASE `CREATE TABLE` case (case-insensitive), markdown `## Heading`, and none-by-line-1 → null; window edges BOTH sides crossed both ways (`start-5` hits / `start-6` misses AND `end+5` hits / `end+6` misses — an asymmetric window bound fails); enclosing rescue (id only in decl name 40 lines up → clean); file-hit → `"unmatched"`; nowhere → `"absent"`; relocation (found in peer, cap at 3, null-lines peer skipped, empty peers → []).
- [ ] **Step 2: Run to verify it fails.** `pnpm vitest run tests/specLint/citationIntent.test.ts` — RED because lib/specLint/citationIntent.ts does not exist (the production surface this task creates).
- [ ] **Step 3: Implement the module** per the interface block; the §3.3 regexes verbatim from the spec.
- [ ] **Step 4: Green**, then `pnpm vitest run tests/specLint/_metaPureCore.test.ts`.
- [ ] **Step 5: Commit** `feat(spec-lint): citation-intent matching, enclosing-name, and tier core`.

### Task 2: citation tiers wired end-to-end + ground-truth corpus

**Files:**
- Modify: `lib/specLint/citations.ts` (advisory branch, `citations.ts:198-224`; hard paths untouched — spec §3.1)
- Modify: `lib/specLint/run.ts` (`checkCitations` call at `run.ts:33`)
- Test: tests/specLint/citationIntentWiring.test.ts (runLint-only), tests/specLint/citationIntentCorpus.test.ts, `tests/specLint/cli.test.ts` (real-CLI cases), fixtures under tests/specLint/fixtures/citationIntent/ (in-memory + committed CLI fixture docs)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: `checkCitations(model, resolver, excludedSpans?: ReadonlySet<string>)` — keys `` `${line}:${column}` `` of spans to skip entirely; empty default until Task 4. **Two-pass advisory structure (review-R1 F6):** the span loop only COLLECTS advisory-eligible citations (resolved, in-range, id-bearing) into a pending list; after the loop — when `resolvedPaths` is complete — a second pass classifies each via `classifyIntent` and, for ABSENT, computes relocation over the FULL deduped `resolvedPaths` minus the cited file, reading each peer at most once through a local memo map over `resolver.readFileLines` (spec §3.4). Tier findings per spec §3.5 exactly (messages, detail formats, fallback string `none of the doc's other cited files`).

<!-- task: red=`pnpm vitest run tests/specLint/citationIntentWiring.test.ts tests/specLint/citationIntentCorpus.test.ts` ac=AC-1,AC-2 -->

- [ ] **Step 1: Write BOTH failing suites.** Both are red for the same production reason: `CITATION_SYMBOL_ABSENT` and the tier logic exist nowhere in `lib/` yet (`grep -rn CITATION_SYMBOL_ABSENT lib/` is empty; the advisory branch at `citations.ts:198-224` is the naive substring pass this task replaces).
  - **Wiring suite** (mirrors `tests/specLint/run.test.ts:138` harness): UNMATCHED detail carries enclosing name; ABSENT with relocation naming a peer cited ELSEWHERE in the doc — including one fixture where the true home is cited LATER in the doc than the wrong citation (the two-pass discriminator: a single-pass implementation misses it); cap at 3 (5-peer fixture); no-peer fallback string exact; id-less citation silent (spec §8 item 11); accept-set regression — identifier-bearing doc lines beside each EXCLUDED citation class (path-only, `CITATION_UNREADABLE`, `CITATION_LINE_OUT_OF_RANGE`, `CITATION_RANGE_INVERTED`) each produce NO intent advisory (a refactor that queues hard-failed or path-only citations for tier classification fails these); `excludedSpans` key removes the span from candidacy (no finding, no anchor, no relocation feed); null-read peer skipped; **peer-read economy**: resolver spy asserts each peer read at most once AND the cited file never read as a peer (read-count assertions — observable, unlike hint-content); **real-CLI wiring** (lives in `tests/specLint/cli.test.ts`, NOT in this enrolled suite — keeps every enrolled suite env-count 0): committed fixture docs under tests/specLint/fixtures/citationIntent/docs/superpowers/plans/ (the house fixture-tree shape — governing spec §8 — so `/plans/` kind inference exercises the real path; no `--kind` needed) driven through `tsx scripts/spec-lint.ts` asserting an ABSENT advisory with relocation detail in the text report (spec §6 wiring bullet — proves adapter plumbing). Every assertion pins code+severity+docLine+column per the coordinate contract.
  - **Corpus suite**: one case per row of the Ground-truth tier table above — the EXPECTED TIER COMES FROM THE TABLE, the fixture is constructed to realize the table's stated structure (ids present-elsewhere vs absent), and each case comments its badplan key. The 2 SILENT cases carry `premise(...)` from `tests/_shared/premise.ts` proving the fixture wrong-file boundary-matches an id within ±5 immediately above the zero-finding assertion. NEGATIVES assert zero intent findings, EXCEPT the two future-code rows which assert an ABSENT-tier finding with `severity: "advisory"` (never hard).
- [ ] **Step 2: Run both to verify RED.**
- [ ] **Step 3: Implement** the two-pass structure + `excludedSpans` param; `run.ts` passes an empty set for now.
- [ ] **Step 4: Green** on both suites AND `pnpm vitest run tests/specLint/citations.test.ts tests/specLint/run.test.ts tests/specLint/cli.test.ts` — existing hard-path cases untouched; shipped UNMATCHED cases may extend expected DETAIL only.
- [ ] **Step 5: Commit** `feat(spec-lint): two-pass tiered citation-intent advisories with relocation and corpus pins`.

### Task 3: task-contract grammar widening + exported marker parse (enrolled surface)

**Files:**
- Modify: `lib/specLint/taskContract.ts` (`OPEN` at `lib/specLint/taskContract.ts:25`, `MARKER` at `taskContract.ts:39`, `MARKER_AC_ABSENT` at `taskContract.ts:45`)
- Modify: `tests/mutation/source/registry.ts` (taskContract row: `suitePaths` gains tests/specLint/taskContractV2Grammar.test.ts; ledger re-anchor)
- Modify: `tests/mutation/_metaPremiseContract.test.ts` (EXPECTED_ENV_TOUCHING gains `"tests/specLint/taskContractV2Grammar.test.ts": 0`)
- Test: tests/specLint/taskContractV2Grammar.test.ts; Create tests/specLint/fixtures/legacyPlans/ (verbatim copies of `docs/superpowers/plans/2026-08-10-promote-identity-validation.md` and `docs/superpowers/plans/2026-08-09-libdata-call-boundary-metatest.md` — the two smallest enrolled legacy plans, 53 and 89 lines, chosen at plan time)

**Interfaces (Produces — taskContract OWNS all recognition, spec §5; redContract consumes, review-R1 F3):**

```ts
export const MARKER_ANY: RegExp;   // existing recognizer, now exported
export interface ParsedMarker {
  line: number;
  red: string;                                   // raw capture, may be blank
  redState: "live" | "authored" | null;
  redTarget: { raw: string; column: number } | null;  // column = 1-based UTF-16 of capture start
  why: string | null;                            // raw capture, may be blank
  acRaw: string | null;                          // null = ac absent
}
export function parseMarker(lineText: string, lineNo: number): ParsedMarker | "malformed" | null;
// null = not marker-shaped; "malformed" = marker-shaped but matching neither v1 nor v2 grammar.
// v1 markers parse with all v2 fields null. THE ONLY marker grammar in the codebase.
export interface TaskTopology {
  regions: { depth: number; start: number; end: number; redContract: boolean }[];
  extents: { start: number; end: number; redContract: boolean }[];
  owned: Map<number, number[]>;    // extent start -> owned marker lines
  orphaned: number[];
}
export function taskTopology(model: DocModel): TaskTopology;  // pure re-derivation of pass 1/2
```

Region grammar: `OPEN` widens to `/^ {0,3}<!-- tasks: depth=([1-6])( red-contract)? -->[ \t]*$/`; other `tasks:` lines stay `TASK_ENROLL_MALFORMED`. Marker grammar per spec §4.2 (fixed order, single spaces, all captures `[^`]*` — blankness is semantic, review-R6).

<!-- task: red=`pnpm vitest run tests/specLint/taskContractV2Grammar.test.ts` ac=AC-4 -->

- [ ] **Step 1: Failing suite.** `red-contract` attribute recognized; bare form unchanged; `red-contract=1` and misspellings → `TASK_ENROLL_MALFORMED`; every v2 field combination well-formed via `parseMarker` AND through `checkTaskContract` (no `TASK_MARKER_MALFORMED`); reordered fields → malformed; single-space strictness (double space between fields, a tab between fields → malformed each); invalid `red-state` literal (`red-state=liv`) → malformed; v1 semantics ON v2 forms — empty v2 `red=` → `TASK_RED_EMPTY`, absent `ac=` → `TASK_AC_MISSING` incl. double-defect precedence (mirror `tests/specLint/taskContract.test.ts:460-462`), v2 `ac=` ids resolve with self-resolution exclusion, v2 markers count for duplicate/cardinality; `parseMarker` unit rows (v1 → nulls; each field captured with its exact column; blank captures returned raw); byte-identity corpus regression: BEFORE touching the grammar, generate (write to fixtures/legacyPlans/, do not commit separately) a JSON snapshot of `runLint(...)`'s `check: "taskContract"` findings for both fixtures/legacyPlans/ files — shipped code produces it, so it is a faithful pre-change oracle; the suite asserts deep equality against it, and snapshot + suite + implementation all ride this task's SINGLE commit (the byte-identity half is a regression pin born green by construction; the task's RED comes from the v2 cases). Coordinate contract on every new-finding assertion.
- [ ] **Step 2: RED** — the production line rejecting v2 fields is the `MARKER` regex at `lib/specLint/taskContract.ts:39` (no optional-field branch).
- [ ] **Step 3: Widen the regexes; add `parseMarker` + `taskTopology`** (extraction of existing pass-1/pass-2 logic, no behavior change); `checkTaskContract` reclassifies through `parseMarker` so there is one grammar.
- [ ] **Step 4: Green** on the new suite + `pnpm vitest run tests/specLint/taskContract.test.ts tests/specLint/taskContractFindingOrder.test.ts tests/specLint/taskContractWiring.test.ts`.
- [ ] **Step 5: Registry: widen `taskContract.suitePaths`** with tests/specLint/taskContractV2Grammar.test.ts (the suite that sees the new grammar and topology — review-R1 F4) AND add its `EXPECTED_ENV_TOUCHING: 0` row in `tests/mutation/_metaPremiseContract.test.ts` (exact key parity at `_metaPremiseContract.test.ts:92` reds otherwise); run `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts`, then run `pnpm heavy pnpm mutation:guards`; re-anchor moved accepted rows 1:1 (operator + `from>to` preserved, registry precedent `tests/mutation/source/registry.ts:170-180`); score ≥0.95, unaccepted empty.
- [ ] **Step 6: Commit** `feat(spec-lint): widen task-contract grammar; export the single marker parse and topology`.

### Task 4: redContract static checks, gate markers, span exclusion

**Files:**
- Create: lib/specLint/redContract.ts
- Modify: `lib/specLint/run.ts` (exclusion set from `redTargetSpans`; append `checkRedContract` findings)
- Test: tests/specLint/redContract.test.ts; extend tests/specLint/citationIntentWiring.test.ts (exclusion cases) and `tests/specLint/cli.test.ts` (real-CLI fixture per spec §6 wiring bullet)

**Interfaces:**
- Consumes: Task 3's `parseMarker`, `taskTopology`, `MARKER_ANY`; Task 2's `excludedSpans` parameter.
- Produces:

```ts
export function redTargetSpans(model: DocModel): ReadonlySet<string>;
// `${line}:${column}` for the red-target capture of every well-formed plan-kind v2 marker.
export function checkRedContract(model: DocModel, kind: "spec" | "plan", resolver: FileResolver): Finding[];
export function planExecutions(model: DocModel): { line: number; command: string }[];
// live markers OWNED by extents of red-contract regions ONLY (spec §4.4 presence population).
```

Codes (spec §4.3/§4.5/§4.6; check `"taskContract"`): hard `RED_STATE_MISSING`, `RED_WHY_MISSING`, `RED_TARGET_MISSING`, `RED_TARGET_INVALID` (per-form), `GATE_CMD_EMPTY`, `GATE_MALFORMED`; advisory `RED_TARGET_RETIRED` (same-extent fenced `git mv|git rm` exact token), `RED_CONJUNCTION`, `GATE_UNPROBED`. Presence region-scoped via `taskTopology`; `RED_TARGET_INVALID` global on plan-kind v2 markers (spec §4.3).

<!-- task: red=`pnpm vitest run tests/specLint/redContract.test.ts` ac=AC-4 -->

- [ ] **Step 1: Failing suite.** Every code fired and not-fired with full coordinates: presence codes only inside `red-contract` regions (v1 marker inside → exactly the presence codes; v2 fields in bare region → no presence findings); `RED_TARGET_INVALID` outside-region (review-R5 case) and inside; a VALID outside-region `red-target=` drawing zero findings (spec §6: 'a valid one draws nothing' — pins that validity-global does not become reject-global); both target forms positive OUTSIDE a contract region as well as inside; each invalid reason per form; blank-capture matrix — all four fields, empty AND whitespace-only, distinct from absent; retired-target same-extent via fenced `git mv` and `git rm`, cross-extent move and non-fenced mention NOT firing; `RED_CONJUNCTION` on `&&` only; gate shapes (well-formed with/without probed, `GATE_MALFORMED` prefix mismatch); gate lines inert in spec-kind docs; FENCED negatives — a v2 marker carrying `red-target=` inside a code fence draws no findings and contributes no exclusion span, and a fenced `gate:` example draws no gate findings (a scan ignoring `model.fencedInfo` fails both); mixed plan (bare + red-contract regions) proving presence region-locality; `planExecutions` unit rows — live-in-contract-extent included in doc order, and EACH exclusion class its own case: authored marker, live in bare region, ORPHANED live marker, live marker in a NO-REGION plan, gate `cmd=` never in the plan, zero live markers → empty list (review-R1 F7).
- [ ] **Step 2: RED** — lib/specLint/redContract.ts does not exist.
- [ ] **Step 3: Implement; wire `run.ts`** (exclusion when kind is plan; findings appended before sort).
- [ ] **Step 4: Green** + wiring extensions in the enrolled runLint-only suite: excluded `red-target=` span draws no citation finding and cannot anchor; citation-shaped spans in `red=`/`why=`/gate `cmd=`/gate `probed=` and on spec-kind marker lines still draw `CITATION_FILE_MISSING` (pin review-R3/R4 probe outputs as expected); **runLint-direct cases per new surface** (spec §6 wiring — the programmatic-caller half): one fixture doc through `runLint` asserting a §4.3 hard code, one asserting a gate code, each under `check: "taskContract"` with full coordinates. THEN the real-CLI half in `tests/specLint/cli.test.ts`: fixture docs (same fixtures/.../docs/superpowers/plans/ shape) through `tsx scripts/spec-lint.ts` asserting the same §4.3 hard code and gate code in the text report with exit 1, AND the span exclusion at adapter level: a fixture marker whose `red-target=` names a missing file yields `RED_TARGET_INVALID` in the report and NO `CITATION_FILE_MISSING` for that span (review-R1 F8). Run `_metaPureCore`.
- [ ] **Step 5: Commit** `feat(spec-lint): red-contract static checks, gate markers, span-exact citation exclusion`.

### Task 5: execution mode (--exec-red)

**Files:**
- Modify: `lib/specLint/types.ts`, lib/specLint/redContract.ts, `lib/specLint/run.ts`
- Modify: `scripts/spec-lint.ts`
- Test: tests/specLint/redExec.test.ts (pure), `tests/specLint/cli.test.ts` (adapter)

**Interfaces (review-R1 F10 — the full plumbing, declared):**

```ts
// types.ts
export type ExecOutcome =
  | { kind: "exit"; code: number }
  | { kind: "timeout" }
  | { kind: "signal"; signal: string }
  | { kind: "spawn-error"; message: string };
export interface ExecResults {
  outcomes: ReadonlyMap<number, ExecOutcome>;   // key = marker line
  stderrTails: ReadonlyMap<number, string>;      // pre-trimmed to 200 by the adapter
}
// redContract.ts
export function synthesizeExecFindings(
  plan: { line: number; command: string }[], results: ExecResults | null,
): Finding[];
// run.ts -- third optional parameter; null/absent = static invocation, no exec findings
export function runLint(doc: LintDoc, resolver: FileResolver, exec?: ExecResults | null): LintResult;
// scripts/spec-lint.ts -- exported pure helpers + injectable spawn seam
export function classifySpawnResult(r: {
  status: number | null; signal: NodeJS.Signals | string | null; error?: { code?: string; message?: string };
}): ExecOutcome;   // error-first per spec §4.4: ETIMEDOUT->timeout / other error->spawn-error, then signal, then exit
// CliDeps gains ONE member (the seam the zero-subprocess spy and exec tests inject).
// It takes the execution cwd explicitly, because runCli discovers the repo root as a
// local (scripts/spec-lint.ts:111) and the contract is cwd = repo root, not caller cwd:
//   spawn(command: string, cwd: string, timeoutMs: number): {
//     status: number | null; signal: string | null; error?: { code?: string; message?: string }; stderr: string;
//   }
// The entry-point implementation wraps node:child_process spawnSync("sh", ["-c", command], { cwd, ... }).
```

Adapter flow (sequential, doc order): read doc → `parseDoc` via the core's exported `planExecutions` wrapper (`planExecutionsForText(text: string)` added to redContract: `parseDoc` + `planExecutions`, pure) → for each planned command `spawnSync("sh", ["-c", cmd], { cwd: root, timeout: secs * 1000, encoding: "utf8" })` → `classifySpawnResult` → build `ExecResults` (stderr tail trimmed to 200 here) → `runLint(doc, resolver, execResults)`. Env `SPEC_LINT_EXEC_TIMEOUT_SECS`: `[1-9][0-9]*` or usage error exit 2 naming it; unset = 600. `--exec-red` on kind spec or duplicated → exit 2 (mirror the duplicate-flag shape at `scripts/spec-lint.ts:78-97`).

<!-- task: red=`pnpm vitest run tests/specLint/redExec.test.ts` ac=AC-5 -->

- [ ] **Step 1: Failing pure suite** (fake `ExecResults` maps): synthesis table with coordinates — exit 0 → hard `RED_ALREADY_GREEN`; 126/127 → advisory `RED_EXEC_ERROR` with stderr tail in detail; timeout → `RED_EXEC_TIMEOUT`; signal / spawn-error → `RED_EXEC_ERROR` naming which; other non-zero → silence; null results → no findings; `planExecutionsForText` ordering + the six exclusion classes from Task 4 re-asserted at this layer.
- [ ] **Step 2: RED** — `synthesizeExecFindings` and `planExecutionsForText` are unexported (absent from Task 4's module by construction).
- [ ] **Step 3: Implement core, then adapter.**
- [ ] **Step 4: CLI adapter cases** (committed fixture plans, trivial commands only): `--exec-red` on spec → 2; duplicate → 2; `exit 0` → exit 1 + `RED_ALREADY_GREEN`; `exit 1` → exit 0; `exit 126` / `exit 127` → advisory each; `SPEC_LINT_EXEC_TIMEOUT_SECS=1` + `sleep 5` → `RED_EXEC_TIMEOUT`; env `0`/`-1`/`abc`/empty → exit 2 each, stderr NAMING `SPEC_LINT_EXEC_TIMEOUT_SECS`, NOTHING executed (the fixture plan's live command writes a sentinel file; assert it does not exist afterwards), and NOTHING linted (stdout empty — no report header — pinning env validation ahead of the lint); `pwd > "$FIXTURE_SCRATCH/cwd.txt"` proves repo-root cwd WITH the CLI itself launched from a SUBDIRECTORY of the repo (an adapter inheriting the caller's cwd fails; the existing cli.test.ts helper defaults to ROOT, so this case passes an explicit non-root cwd to the subprocess helper); `exit $((125+2))` proves `sh -c`; >200-char stderr before exit 127 → trimmed tail; `kill -TERM $$` → `RED_EXEC_ERROR` naming SIGTERM; a plan whose only live markers sit outside contract regions → nothing executes (the injected `deps.spawn` spy records zero calls). Unit-test `classifySpawnResult`: ENOENT, SIGTERM, `{status: 0}`, and the review-R4 hybrid `{status: 0, error: {code: "ETIMEDOUT"}}` → timeout.
- [ ] **Step 5: Commit** `feat(spec-lint): opt-in --exec-red execution mode with error-first outcome classification`.

### Task 6: mutation enrolment for both new surfaces

**Files:**
- Modify: `tests/mutation/source/registry.ts`
- Modify: `tests/mutation/_metaPremiseContract.test.ts` (EXPECTED_ENV_TOUCHING gains the five remaining suite rows, each `: 0`)

**Registry reconciliation (authored AND run at plan time — two rows added, none removed; current ids verified 2026-08-15: taskContract, ledgerClaimsCore, ledgerGit, reviewRoundCount, reviewRoundCorpus, phantomGapExecuted, popoverOverlayExtract, renderedTextHaystack, interactionTimingScan; Task 3 widens taskContract.suitePaths only):**

```ts
{
  id: "citationIntent",
  sourcePath: "lib/specLint/citationIntent.ts",
  suitePaths: [
    "tests/specLint/citationIntent.test.ts",
    "tests/specLint/citationIntentWiring.test.ts",
    "tests/specLint/citationIntentCorpus.test.ts",
  ],
  operators: [...OPERATOR_NAMES],
  scoreFloor: 0.95,
  control: { from: "const lo = Math.max(1, start - 5);", to: "const lo = Math.max(1, start - 4);" },
  accepted: [],
},
{
  id: "redContract",
  sourcePath: "lib/specLint/redContract.ts",
  suitePaths: [
    "tests/specLint/redContract.test.ts",
    "tests/specLint/redExec.test.ts",
    "tests/specLint/citationIntentWiring.test.ts",
  ],
  operators: [...OPERATOR_NAMES],
  scoreFloor: 0.95,
  control: { from: 'kind !== "plan"', to: 'kind === "plan"' },
  accepted: [],
},
```

(citationIntentWiring.test.ts sits in BOTH new rows deliberately: it holds the exclusion-coordinate assertions for redContract and the two-pass/relocation assertions for citationIntent — review-R1 F4. Control `from` strings must exist verbatim in the implemented modules; if implementation drifts, update the control in the same commit and say so.)

<!-- task: red=`pnpm exec tsx -e 'import { GUARD_SURFACES } from "./tests/mutation/source/registry"; process.exit(GUARD_SURFACES.some(s => s.id === "citationIntent") && GUARD_SURFACES.some(s => s.id === "redContract") ? 0 : 1)'` ac=AC-6 -->

- [ ] **Step 1: RED** — the command exits 1 (rows absent; the production surface is the registry array itself).
- [ ] **Step 2: Add both rows AND the five `EXPECTED_ENV_TOUCHING` rows (each 0); `pnpm vitest run tests/mutation/_metaPremiseContract.test.ts` green, then `pnpm heavy pnpm mutation:guards`.** Scores ≥0.95; every survivor killed by a strengthened test (preferred) or argued into `accepted` with its reason row; unaccepted set EMPTY.
- [ ] **Step 3: Commit** `test(spec-lint): enroll citationIntent and redContract in the source-mutation gate` — scores in the commit body and in the implementation arc's round-1 review brief (AC-6).

### Task 7: docs wiring + close-out gates

**Files:**
- Modify: `docs/agents/writing-plans.md` (red-executability bullet: replace "Mechanical arm filed as `BL-SPECLINT-RED-EXECUTABILITY-ARM`." with one sentence naming the landed mechanism — the `red-contract` region attribute, v2 marker fields, `--exec-red` — and the spec path)
- Modify: `docs/agents/spec-self-review.md` (task-contract block: one sentence noting the optional `red-contract` region attribute + v2 marker fields, spec path)
- Modify: `docs/superpowers/specs/README.md` (index row for the spec)

<!-- task: red=`sh -c 'grep -q "red-contract region attribute" docs/agents/spec-self-review.md'` ac=AC-7 -->

- [ ] **Step 1: RED** — the grep exits 1: the exact phrase this task's sentence introduces does not exist (production lines = the two agent-doc sentences + the README row). String-presence mutants per the writing-plans four-mutant rule, recorded here at plan time: (a) emptied value — an edit that deletes the sentence re-reds the grep ✓; (b) appended suffix — grep -q is prefix-insensitive, a suffixed phrase still passes: accepted, the check pins presence not exactness; (c) present-but-not-live — the phrase inside an HTML comment would pass grep: accepted limit, the gate for sentence QUALITY is this plan's review, the grep only sequences the task's red/green; (d) parameter varied — grepping the OTHER file (writing-plans.md) for its own token `--exec-red` is the second step's separate check below.
- [ ] **Step 2: Make the three edits.** Green criteria, one per file: the marker grep; `grep -q -- "--exec-red" docs/agents/writing-plans.md`; `grep -q "2026-08-15-spec-lint-intent-red-arms" docs/superpowers/specs/README.md`.
- [ ] **Step 3: Close-out gates** (pre-push discipline): `pnpm heavy pnpm test:fast`, `pnpm typecheck`, `pnpm exec eslint .`, `pnpm format:check`, and dogfood `pnpm spec:lint` on BOTH the spec and this plan (0 hard each, AC-7).
- [ ] **Step 4: Commit** `docs(spec-lint): wire the landed red-contract and intent arms into the agent docs`.

<!-- tasks: end -->

## Deferred to the merge step (not tasks)

- BACKLOG archival of `BL-SPEC-LINT-CITATION-INTENT` + `BL-SPECLINT-RED-EXECUTABILITY-ARM` and removal of their `**Status:** IN PROGRESS` markers happen in the PR's LAST commit per invariant 12 (archives reject in-flight entries).

## 12 Closeout

impeccable-gate: N/A — no UI surface

## Self-review notes (run at authoring)

- Spec coverage: §3 → Tasks 1-2; §4.1-§4.3/§4.5/§4.6 → Tasks 3-4; §4.4 → Task 5; §7 → Task 6 (+Task 3 suitePaths widening); §9 → Task 7; §6 shapes distributed per task incl. the wiring bullet's runLint AND real-CLI halves (Tasks 2/4); §5 respected (one grammar owner via `parseMarker`, outcome-injection via `ExecResults`, span exclusion).
- All seven red= commands RUN at plan time, each exiting non-zero for the stated production reason (transcript in the plan-authoring session; Task 2's merged red re-verified after the Task-3 merge restructure).
- Anti-tautology: corpus tiers come from the committed table, not fixture-author choice; peer-read exclusion asserted via resolver spy (observable), not hint content; byte-identity snapshot generated from SHIPPED code before the grammar edit; four string-presence mutants dispositioned for the docs grep.
- Type consistency: `ExecOutcome`/`ExecResults`, `ParsedMarker`, `TaskTopology`, `classifySpawnResult`, `planExecutionsForText` defined once, consumed by name.
