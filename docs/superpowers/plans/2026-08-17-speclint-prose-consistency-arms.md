# spec:lint prose-consistency arms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the advisory `ENUMERATED_UNIVERSAL_NO_PROBE` and the `universal-claims` / `scope-fences` inventory groups in a new pure module, wire them into `spec:lint`, enrol the module in the source-mutation registry, commit the layer-3 corpus record, and graduate both ledger rows.

**Spec:** `docs/superpowers/specs/2026-08-17-speclint-prose-consistency-arms.md` — read in full first; §3.2 (advisory gate stack), §3.4 (inventory groups), §4 (wiring + coordination fence), §6 (verification), §8 (ACs) are the contract every task argues from.

**Tech stack:** TypeScript, vitest, the pure `lib/specLint/**` core + `scripts/spec-lint.ts` adapter, the in-repo source-mutation harness.

## Global constraints

- **Serialization order (bl-orch ruling, 2026-08-17): arc B (`fix/red-contract-shape-execution`) implements FIRST on the shared files. The implementation session for THIS plan launches only after arc B's branch merges to main.** Plan-stage review may run before that; only implementation serializes.
- **Expected-textual-conflict sites:** `lib/specLint/run.ts`, `lib/specLint/types.ts`, `scripts/spec-lint.ts` are also named by arc B's spec (`docs/superpowers/specs/2026-08-15-spec-lint-intent-red-arms.md`). This arc's edits there are ADDITIVE ROWS (one `Check` union member, one `CHECK_ORDER` row, one `runLint` call, one render-`checks` row). Any merge conflict on them resolves as union-of-additive-rows, followed by MANDATORY `pnpm typecheck` — a clean auto-merge can still split a row mid-body (measured, _briefs/2026-08-17-bl-mediums-lessons.md — untracked ops file, plain text — registry.ts trap). lib/specLint/universals.ts (plain text: created by this arc) is disjoint — no constraint.
- Worktree-only (invariant 11); TDD per task (invariant 1); commit per task, conventional commits (invariant 6); push after every commit.
- Full-suite vitest and every `pnpm mutation:guards` run go under the machine-wide semaphore: `pnpm heavy <cmd>`. Scoped vitest runs with explicit file lists stay unwrapped.
- Spec §1.1 is binding — do not relitigate: advisory+inventory only; digit-only cardinal accept-set; truth evaluation out of scope; spec-kind docs only; `BL-SPECLINT-BL-DISPOSITION-CLOSEOUT-ARM` untouched.
- Fixture discipline (spec §6): each fixture states its expected finding count and code; each gate-rejection fixture names the single gate it exercises, so a gate deletion fails exactly its fixture. Every premise that a fixture rests on executes unconditionally (`tests/_shared/premise.ts` where a guard's discriminating condition needs stating).
- impeccable-gate: N/A — no UI surface.

**Meta-test inventory (writing-plans rule):** this plan EXTENDS `tests/mutation/source/registry.ts` (one `GuardSurface` row), `tests/mutation/source/expectedLedgerKinds.ts` (one row), `tests/mutation/_metaPremiseContract.test.ts` (one suite-path declaration), and `tests/docs/_metaDeferralLedgerGraduation.test.ts` (`BACKLOG_GRADUATED` — two rows). It CREATES no new meta-test. The shard partition (`tests/mutation/source/shardPartition.ts`) is a pure function of the registry — no shard file edits. No Supabase call boundary, no admin alert, no tile, no advisory lock registry applies.

**Registry count reconciliation (authored AND run):** `pnpm tsx -e "import { GUARD_SURFACES } from './tests/mutation/source/registry'; console.log(GUARD_SURFACES.length)"` → 36 surfaces at plan time (base `d2d602588`; run 2026-08-17). This plan adds exactly one (`specLintUniversals`) → 37. (A text-level `rg -c 'id: "'` count is NOT the oracle — the import is; the text form was the drafting mistake this run corrected.) `EXPECTED_LEDGER_KINDS` gains exactly the row the final accepted-ledger holds (starting claim `{}`; updated in Task 5 if disposition adds equivalent rows — the AC-13 lesson: the two must match at commit time, never aspirationally).

**Mutation-family closure (writing-plans rule):** operators are the registry's full `[...OPERATOR_NAMES]` set, matching the `specLintNumerics` row (`tests/mutation/source/registry.ts:964`). A reviewer-proposed NEW family is a registry change with its own numbers, not a finding against this plan.

---

### Task 0 (setup, outside the checked task region): serialization gate + fresh base

- [ ] Confirm arc B has merged: `git fetch origin && git log origin/main --oneline | head -20` shows the `fix/red-contract-shape-execution` merge (or bl-orch confirms it landed under another subject line). If it has NOT merged, STOP — this plan's implementation is not authorized to start (bl-orch ruling above).
- [ ] `git merge origin/main --no-edit` in this worktree; on any conflict in the three expected-conflict files apply union-of-additive-rows; then `pnpm typecheck` (mandatory regardless of conflict), `pnpm install` if the lockfile moved, `pnpm preflight`.
- [ ] Re-verify the drafting-time anchors this plan cites on the merged tree (they move if arc B refactored): `rg -n "CHECK_ORDER" lib/specLint/run.ts`, `rg -n "export type Check" lib/specLint/types.ts`, `rg -n 'const checks = \[' scripts/spec-lint.ts` (drafting locators :16 / :2 / :88). Update task bodies' locators if drifted — the claims, not the numbers, are the contract.

<!-- tasks: depth=3 red-contract -->

### Task 1: lib/specLint/universals.ts (new module) — advisory arm `ENUMERATED_UNIVERSAL_NO_PROBE`

<!-- task: red=`pnpm vitest run tests/specLint/universals.test.ts` red-state=authored red-target=`lib/specLint/universals.ts:123` why=`module absent; every case fails on the unresolved production import, and after the Step-2 skeleton lands the fixture cases still fail because the skeleton emits no findings - green arrives only with the Step-3 gate stack` ac=AC-1,AC-3 -->

**Files:**

- Create: lib/specLint/universals.ts (plain text: not tracked yet)
- Create: tests/specLint/universals.test.ts

**Interfaces:**

- Produces: `checkUniversals(model: DocModel, kind: "spec" | "plan"): { findings: Finding[]; inventory: InventoryGroup[] }` — pure, no I/O, `check: "universals"` on every finding (the `numerics.ts` posture; `DocModel` from `lib/specLint/parse.ts`, `Finding`/`InventoryGroup` from `lib/specLint/types.ts`).
- Consumes: `DocModel.lines/fencedInfo/headings/spans` only.

**Steps:**

- [ ] **Step 1 (RED):** Write tests/specLint/universals.test.ts (new file, plain text) — the ADVISORY half of spec §6's fixture contract, each fixture a literal doc string driven through `parseDoc` then `checkUniversals(model, "spec")`, asserting exact FINDING count + code + docLine. **This task's suite asserts findings only — every inventory-membership assertion (including the word-form and heading fixtures' `universal-claims` rows) lives in Task 2's suite, so Task 1's command greens on the advisory implementation alone and Task 2's red reason stays intact (plan review R1 F1).** The fixture list mirrors spec §6 verbatim (plan review R1 F2 — all four omissions repaired):
  - E1 retro-fixture: the verbatim `cc7942d4e:181` line in one section, cardinal `21` on a non-table line of another section, no command span in the claim's section → exactly one `ENUMERATED_UNIVERSAL_NO_PROBE`.
  - Corrected-current-main regression fixture: the live repaired form — a "Twenty of the 21 land …" partition sentence replacing the universal, per `docs/superpowers/specs/2026-08-16-control-outline-surface-fills-design.md:225`-region — → 0 findings (no universal+cardinal match survives; pins the repair direction the originating arc validated).
  - Same E1 doc with `rg` inline code added to the claim's section → 0 (gate 5, synthetic single-gate case).
  - Cardinal-only-in-own-section → 0 (gate 4).
  - Table-row form → 0; ISO-dated line → 0; fenced → 0; HEADING line carrying a universal + cardinal → 0 (all gate 1, one fixture each).
  - Word-form cardinal ("all twenty-one sites") → 0 findings (accept-set limit; its inventory presence is Task 2's assertion).
  - Compound nearest-binding case `all 37 sites (36 at plan time)` with enumeration+no-probe held → exactly one finding on the 37 claim (NOT a single-gate discriminator).
  - Gate-3 discriminator `all 36 sites at plan time` → 0 findings (the qualifier's nearest predecessor IS the claim cardinal; deleting gate 3 yields one finding — fails exactly this fixture).
  - Time-unit exclusion, both separators: "every 5 min" AND "every 5-min check" → 0 each.
  - Inline-span discriminator: backticked "`applies to all 21 rows`" with 21 enumerated elsewhere → 0 (the inline-span gate is the ONLY rejecting gate; spec §6 replaced the value-gate-shadowed `Ignore all 1` form).
  - Value bound, one fixture per half: "all 0" (the ≥ 2 check) and "all 2025" (the 3-digit width) → 0 each.
  - `kind: "plan"` with the E1 doc → 0 findings (spec-kind gate).
  Run the command; observe red (unresolved import).
- [ ] **Step 2:** Create the module skeleton exporting `checkUniversals` returning `{ findings: [], inventory: [] }`. Re-run; observe the cases now fail on ASSERTIONS (finding expected, none emitted) — the red the marker names.
- [ ] **Step 3 (GREEN):** Implement the §3.2 gate stack exactly: non-fenced/non-table/non-heading/non-ISO line; `every|each|all` (initial letter either case) + optional `one of the `/`of the ` + 1–3-digit cardinal of value ≥ 2; the closed time-unit exclusion; the inline-span exclusion; nearest-predecessor dated-qualifier exclusion within 40 chars reusing the closed stage-noun set (import the existing constant from `lib/specLint/numerics.ts` if exported, else lift per spec §3.2 note 3 citing `QUALIFIER_STAGES`); enumeration evidence = same cardinal string on a non-fenced non-table line of a different section; probe-command gate over the owning section (closed command set, inline spans + `sh`/`bash`/info-less fence first tokens). Message per spec §3.2. Re-run → green.
- [ ] **Step 4:** `pnpm typecheck`; commit `feat(spec-lint): ENUMERATED_UNIVERSAL_NO_PROBE advisory arm`; push.

### Task 2: inventory groups `universal-claims` + `scope-fences`

<!-- task: red=`pnpm vitest run tests/specLint/universalsInventory.test.ts` red-state=authored red-target=`lib/specLint/universals.ts:251` why=`checkUniversals emits findings only after Task 1; the inventory-group cases fail because the function returns empty inventory for docs whose universal lines and scope regions the fixtures enumerate - green arrives with the group recognizers` ac=AC-2,AC-3 -->

**Files:**

- Create: tests/specLint/universalsInventory.test.ts
- Modify: lib/specLint/universals.ts (plain text: created in Task 1)

**Steps:**

- [ ] **Step 1 (RED):** Fixtures per spec §3.4/§6 — ALL inventory-membership assertions live here, including the Task-1 word-form and heading fixtures' group-side halves (word-form line PRESENT in `universal-claims`; heading line ABSENT — plan review R1 F1 ownership split): a doc with clause-initial universals (line start; after period/semicolon/colon+space; behind list-marker and bold prefixes), an "Out of scope" region, a "Ledger closeout" region; asserts BOTH groups' exact line sets. E4 fixture (verbatim `a045c53d1:235` bullet under an `## Out of scope` heading) lands in BOTH groups; E5 fixture (verbatim `65641604f:235` line under a `### Ledger closeout` heading) lands in BOTH groups. Region-boundary fixture: a deeper heading inside the region does not close it; an equal-depth heading does. Depth-bound fixture: a depth-1 "close-out" TITLE opens NO region (spec §3.4 R1 repair). No-re-anchor fixture: a MATCHING heading nested inside an open region does not re-anchor it — the parent region runs to its own terminator (spec §3.4 R3 rule). Structural-line fixture: a thematic break and a table delimiter row inside a region are excluded while a table CONTENT row stays (spec §3.4 R4 rule). Heading-exclusion fixture: a heading line carrying a universal draws no `universal-claims` row and no advisory (spec §3.2 gate 1 / §3.4 R3 rule). Negative fixtures: fenced universal, table-row universal, quantifier mid-clause ("closes every gap") → excluded from `universal-claims`; blank lines excluded from `scope-fences`; empty doc and plan-kind doc → no groups. Observe red.
- [ ] **Step 2 (GREEN):** Implement the two group recognizers per §3.4 (closed quantifier set `Every|Each|All|Any|No|Never|Nothing`; heading accept-sets `/out of scope|non-goals?/i`, `/clos(e-?out|eout)|graduation/i`; region = heading to next heading of ≤ its depth). Groups appended only when non-empty. Green.
- [ ] **Step 3:** `pnpm typecheck`; commit `feat(spec-lint): universal-claims + scope-fences inventory groups`; push.

### Task 3: wiring — `Check` member, `runLint` call, render row (expected-conflict files)

<!-- task: red=`pnpm vitest run tests/specLint/universalsWiring.test.ts` red-state=authored red-target=`lib/specLint/run.ts:80` why=`runLint composes citations/numerics/copy/sections/taskContract/redContract only - checkUniversals is not called, so a wiring test driving runCli over a fixture doc finds neither the advisory in the text render nor the groups in --json; green arrives with the three additive rows` ac=AC-1,AC-2 -->

**Files:**

- Modify: lib/specLint/types.ts (add `"universals"` to `Check`, drafting locator :2)
- Modify: lib/specLint/run.ts (CHECK_ORDER row, drafting locator :16; call beside `checkNumerics`, drafting locator :80; concatenate inventory groups after the numeric groups)
- Modify: scripts/spec-lint.ts (render `checks` row, drafting locator :88)
- Create: tests/specLint/universalsWiring.test.ts

**Steps:**

- [ ] **Step 1 (RED):** Wiring test drives `runCli` (injected `CliDeps`, the `tests/specLint/` in-memory resolver idiom) over a spec-kind fixture doc containing the E1 shape and an out-of-scope region: asserts the advisory line appears in the text render under a `universals:` check header, the two groups appear in the `INVENTORY` block, the same appear in `--json` output, and exit code stays 0 (advisory-only). A plan-kind fixture asserts absence. Observe red (no `universals` output).
- [ ] **Step 2 (GREEN):** Add the three additive rows + inventory concatenation. Green.
- [ ] **Step 3:** Confirm advisory severity end-to-end: `exitCodeForResult` unaffected (no `fail` findings emitted by this module — assert in the wiring test that every emitted finding has `severity: "advisory"`).
- [ ] **Step 4:** `pnpm typecheck`; scoped regression `pnpm vitest run tests/specLint`; commit `feat(spec-lint): wire universals check + inventory groups`; push.

### Task 4: layer-3 corpus record + survivor classification

<!-- task: red=`pnpm vitest run tests/specLint/universalsCorpusRecord.test.ts` red-state=authored red-target=`docs/superpowers/specs/probes/2026-08-17-prose-consistency-arms.survivors.txt:6` why=`the record file does not exist, so the freshness pin (record parses, carries the shipped-arm header, and its advisory count equals the count the committed classification file claims) fails on the missing artifact; green arrives when the corpus run commits the record + classification` ac=AC-4 -->

**Files:**

- Create: docs/superpowers/specs/probes/2026-08-17-prose-consistency-arms.survivors.txt (plain text: the shipped arm's own corpus run — layer 3, spec §3.3)
- Create: docs/superpowers/specs/probes/2026-08-17-prose-consistency-arms.classification.md
- Create: tests/specLint/universalsCorpusRecord.test.ts

**Steps:**

- [ ] **Step 1 (RED):** The record test pins record↔classification consistency: the survivors file exists, each row is `path:line <snippet>`, and the classification file's per-class counts sum to the record's row count (premise: record non-empty — assert with `premise` from `tests/_shared/premise.ts`, since a zero-row record would make the sum vacuous). Observe red (missing artifact).
- [ ] **Step 2:** Run the SHIPPED recognizer over the corpus — extend the committed instrument's runner or a 20-line tsx driver calling `runLint` per tracked spec-kind doc, filtering `check === "universals"` findings — writing every advisory row to the survivors file, untruncated ("a sweep that truncates its output has not been run").
- [ ] **Step 3:** Hand-classify the survivor rows in one bounded pass (classes: genuine drift candidate / benign restatement / historical record residue — copy informing ONLY advisory copy + spec §7 documented limits; gates frozen per §3.3). Observe the record test green (plan review R2 F3: green precedes the commit; this task has exactly ONE commit, at Step 4).
- [ ] **Step 4:** Corpus regression: `pnpm spec:lint` on this spec and this plan → 0 hard each. Single commit `docs(spec-lint): layer-3 corpus record + survivor classification`; push.

### Task 5: mutation enrolment — registry row + ledger-kind + premise declarations, scored run

<!-- task: red=`pnpm vitest run tests/mutation/_metaPremiseContract.test.ts tests/mutation/_metaGuardSurfaceRegistry.test.ts` red-state=authored red-target=`tests/mutation/_metaPremiseContract.test.ts:32` why=`adding the specLintUniversals registry row WITHOUT the suite-path declaration reds the premise-contract walk (fail-by-default on a newly enrolled suite) - red observed after the registry edit at Step 1 and before the Step-2 declarations; the SAME command greens at Step 3` ac=AC-5 -->

**Files:**

- Modify: tests/mutation/source/registry.ts (row `specLintUniversals`, `sourcePath: "lib/specLint/universals.ts"`, `suitePaths: ["tests/specLint/universals.test.ts", "tests/specLint/universalsInventory.test.ts"]`, `operators: [...OPERATOR_NAMES]`, `scoreFloor` set from the measured run, `control` naming a hand-verified killable mutant of the gate stack, `accepted: []` initially)
- Modify: tests/mutation/source/expectedLedgerKinds.ts (row matching the final accepted-ledger — the AC-13 mismatch class)
- Modify: tests/mutation/_metaPremiseContract.test.ts (suite-path declarations in `EXPECTED_ENV_TOUCHING`, drafting locator :32; the `specLintNumerics` comment idiom at :196)

**Steps:**

- [ ] **Step 1 (RED):** Add the registry row alone; run the marker command; observe the premise-contract red.
- [ ] **Step 2:** Add the ledger-kind + premise declarations.
- [ ] **Step 3 (GREEN):** Marker command greens.
- [ ] **Step 4 (score, FOREGROUND):** Scoped run — write a temporary shard-filter file tests/mutation/guardSurfaces.shardX.test.ts (plain text; never committed) with exactly this body (plan review R1 F3 — the invocation is spelled out because the mutation project exists only under the env gate):

```ts
import { GUARD_SURFACES } from "./source/registry";
import { registerSurfaceCases } from "./source/surfaceCases";
registerSurfaceCases(GUARD_SURFACES.filter((s) => s.id === "specLintUniversals"));
```

  Run it FOREGROUND as `VITEST_INCLUDE_MUTATION_HARNESS=1 pnpm heavy pnpm vitest run --project mutation tests/mutation/guardSurfaces.shardX.test.ts` (the env gate is load-bearing — without it vitest exits 1 with `No projects matched the filter "mutation"`; probed at plan review R1). Then DELETE the temp file (`_metaSourceShardIntegrity` pins shard files byte-for-byte). Disposition survivors: kill with new cases in the deciding suites, or ledger `equivalent` rows with reachability arguments (never "hard to test"). Update `scoreFloor` + `EXPECTED_LEDGER_KINDS` to the measured end state.
- [ ] **Step 5 (acceptance):** `pnpm heavy pnpm mutation:guards` — full gate, foreground; unaccepted-survivor set EMPTY. Record score + survivor ledger in the commit message; the round-1 diff-review brief states both (AGENTS.md enrolment-precedes-review).
- [ ] **Step 6:** Commit `test(spec-lint): enrol specLintUniversals in the source-mutation gate`; push.

### Task 6: ledger graduation (the PR's LAST commit)

<!-- task: red=`pnpm vitest run tests/docs/_metaLedgerInProgress.test.ts tests/docs/_metaDeferralLedgerGraduation.test.ts` red-state=authored red-target=`tests/docs/_metaDeferralLedgerGraduation.test.ts:660` why=`the archive-only walk iterates BACKLOG_GRADUATED rows: adding the two rows FIRST, before the archive moves, reds "every graduated id is archive-only" at :664 (id missing from BACKLOG-archive.md) - a real fail-by-default on the named rows, probed at plan review R2 F1 (the earlier claim that absent rows red the walk was backwards and is repaired); the SAME command greens when the archive sections land with markers stripped in the same edit session (in-progress meta at :1289 additionally rejects a surviving marker)` ac=AC-7 -->

**Files:**

- Modify: tests/docs/_metaDeferralLedgerGraduation.test.ts (two `BACKLOG_GRADUATED` rows — added FIRST, the red)
- Modify: BACKLOG.md (remove both entries), BACKLOG-archive.md (add both, `— CLOSED` headings, provenance `fix/speclint-prose-consistency-arms`; marker stripped in the SAME commit — the graduating-entry rule, invariant 12)

**Steps:**

- [ ] **Step 1 (RED):** Add both `BACKLOG_GRADUATED` rows (id + provenance `fix/speclint-prose-consistency-arms`) with NO archive edit; run the marker command; observe `every graduated id is archive-only` red on both ids.
- [ ] **Step 2 (GREEN):** Move both entries to BACKLOG-archive.md with `— CLOSED` headings naming the branch, strip the IN PROGRESS markers in the same edit session; same command greens (archive-only walk, provenance walk, and the no-IN-PROGRESS meta all pass).
- [ ] **Step 3:** Full gate sweep before the last push: `pnpm typecheck && pnpm heavy pnpm test:fast`; `pnpm spec:lint` on spec + plan → 0 hard. Commit `docs(plan): graduate both prose-consistency ledger rows`; push. This is the intended LAST commit — auto-merge arms only after it (lessons file, #838 incident).

<!-- tasks: end -->

### Task 7 (docs consumption edit, outside the checked task region — AC-6)

No meta-test reads `docs/agents/spec-self-review.md`, so this edit sits outside the red-contract region rather than wearing a marker whose command cannot observe it (plan review R2 F2).

- [ ] Edit docs/agents/spec-self-review.md, the self-consistency-sweep bullet (drafting locator :18): add one sentence naming the `universal-claims` and `scope-fences` inventory groups as the post-repair sweep's derived cover.
- [ ] Verify mechanically and paste the output into the commit message: `rg -n "universal-claims" docs/agents/spec-self-review.md` returns exactly one line, inside the self-consistency-sweep bullet. Commit `docs(agents): name the inventory groups as the post-repair sweep's derived cover`; push. Ordering: lands BEFORE Task 6 (Task 6 stays the PR's last commit).

## Verification (whole-arc)

- All §6 spec fixtures live in Tasks 1–3 suites; red observed per marker; green on the SAME command.
- AC-1..AC-7 all covered: AC-1/AC-3 (Task 1), AC-2 (Tasks 2–3), AC-4 (Task 4), AC-5 (Task 5), AC-6 (Task 7, outside the region, grep-verified), AC-7 (Task 6).
- Cross-model diff review runs even though parts are docs-only (lessons file: 10 real defects on a docs diff that had passed 621 meta-tests); round-1 diff brief carries the mutation score + empty unaccepted-survivor set + GUARD SURFACE line per the codex-guard dispatch contract.
