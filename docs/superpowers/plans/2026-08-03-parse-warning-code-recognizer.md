# Plan — parse-warning code recognizer

**Spec:** `docs/superpowers/specs/2026-08-03-parse-warning-code-recognizer-design.md`
**Closes:** `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`
**Branch:** `fix/parse-warning-code-recognizer`

impeccable-gate: N/A — no UI surface

**Revision history:** plan R1 (Codex) returned BLOCKING with two P0s, two P1s, and one P2. All five confirmed by independent probe and repaired here. The two P1s collapsed into a single change — assertion 1 is now **set equality** rather than a subset check — which closes both. R1's P0-2 forced a task restructure: nine tasks became eight, because three of the original REDs could not fail.

---

## 0. Pre-draft declarations

### 0.1 Meta-test inventory

**CREATES:** `tests/messages/_metaParseWarningCodeSites.test.ts (new)` — structural guard over the parse-warning emit surface. Discovery is program-walked (the TypeScript program, not a file list), so a new emitter in an unlisted directory fails by default.

**EXTENDS:** none.

**Does not apply:** `tests/auth/_metaInfraContract.test.ts` (no Supabase call boundary), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*` path — §0.2), `tests/messages/_metaAdminAlertCatalog.test.ts` (no `admin_alerts.upsert` site), `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutating route or `"use server"` action), `tests/components/tiles/_metaSentinelHidingContract.test.ts` (no tile rendering).

### 0.2 Advisory-lock holder topology

**N/A.** Ran `rg -l 'pg_(try_)?advisory' lib/messages lib/dev scripts/extract-internal-code-enums.ts` — no matches. The diff is a generator script, one lib-internal module, one test file, one generated manifest, one gallery filter, and one fixture deletion.

### 0.3 Mutation-family closure set

Per `docs/agents/writing-plans.md:24`, this enumeration IS the closure set the review converges against. A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| # | Family | Mutant | Caught by |
| --- | --- | --- | --- |
| M1 | Emitter lands, manifest not regenerated | add a `ParseWarning` literal with a fresh code, skip `pnpm gen:internal-code-enums` | assertion 1 (set equality) |
| M2 | Emitter lands with an unmodelled `code` shape | `` code: `PREFIX_${x}` ``; `code: MAP[k]`; a two-hop factory | assertion 2 (`unresolved` non-empty) |
| M3 | Emitter lands in a directory nobody listed | a `ParseWarning` literal under `lib/reports/` | covered by construction (program-wide scan); pinned by Task 1's planted mutant |
| M4 | Exemption outlives its site | an exemption row whose site no longer exists | assertion 3 (set equality) |
| M5 | **Collector degrades to a partial or empty scan** | `{sites: [], unresolved: []}`; or a narrowed file filter that silently drops live sites | assertion 1 (set equality) — see below |
| M6 | **Fixture or test call site mints a code** | export the factory at `lib/sync/enrichAgenda.ts:45`, call it from a test with a literal | Task 3's scanned-file predicate on recorded sites |
| M7 | **Non-object-literal construction** | a class implementing `ParseWarning`; `Object.assign` composition | assertion 4 (§ Task 5) |

**M5 is why assertion 1 is set equality, not a subset check** (R1 P1-1). The original design asserted only "every recognized code is in the manifest" plus a numeric floor of 60. R1 demonstrated that excluding a single file (`lib/sync/enrichWithDrivePins.ts`) silently drops **nine live sites** while `sites.length >= 60`, all three provenance sentinels, and `unresolved === []` all stay green:

```json
{"mutation":"exclude lib/sync/enrichWithDrivePins.ts","sites":64,"unresolved":0,"floorPass":true,"namedPass":true}
```

Set equality catches it: the recognized code set shrinks, the committed manifest does not, and the assertion fails. **The numeric floor is deleted** — R1 is right that 60 encodes a nonsemantic corpus count that would start failing after fourteen legitimate net site removals, and set equality makes it redundant. The three provenance sentinels survive as a fast, readable canary that names which rule broke, not as the load-bearing check.

Set equality also closes R1 P1-2 in the other direction: an additive implementation that *retains* the old regex scan alongside the collector adds `parse_warnings.code` provenance the collector never produced, so the manifest set exceeds the recognized set and the assertion fails. R1's probe showed the old subset assertion passing under exactly that mutant:

```json
{"mutation":"retain old scan + add collector output","missing":[],"VERSION_AMBIGUOUS":"parse_warnings.code,pending_ingestions.last_error_code"}
```

### 0.4 Snippet typecheck posture

Snippets are written against the repo's strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). The manifest lookup uses an explicit widening rather than a `keyof typeof` cast — the cast compiles and is runtime-correct, but it tells the compiler a lookup always succeeds when the assertion's whole purpose is the case where it does not:

```ts
const manifest: Record<string, { source: string } | undefined> = INTERNAL_CODE_ENUMS;
```

### 0.5 Test wiring

`tests/messages/_metaParseWarningCodeSites.test.ts (new)` lands in the **PARALLEL** vitest project — `vitest.config.ts` splits the suite via `vitest.projects.ts`, and `tests/messages/**/*.test.{ts,tsx}` is listed in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:89`). It is concurrency-safe there: the partition's stated hazard is on-disk state mutated mid-run (`vitest.projects.ts:130`), and this test only reads source files. Its cost is one TypeScript program (~2.1 s locally), measured on the first real CI run per §3. No workflow path filter needs an entry (R1 confirmed this independently).

### 0.6 Probes run at plan time

| Question | Result |
| --- | --- |
| Is assertion 4 implementable against the TS API? | Yes. Class mutant and `Object.assign` mutant both detected; tree clean without them. |
| Does assertion 4 false-positive on live code? | **Yes, until `any`/`unknown` are excluded.** `Object.assign(Object.create(null), {…})` at `components/admin/review/PublishedArchivedTabOffer.tsx:26` has result type `any`, and `any` is assignable to everything. Excluding `any`/`unknown` makes the tree clean. |
| Do dot-directories participate in the program? | **No.** TypeScript's `**/*` glob does not match dot-directories, so a probe fixture under `.probe/` is invisible. Planted mutants must live in a non-dot directory. |
| Can a test file mint a code through the factory rule? | Yes, if the factory is exported — see M6. |

---

## 1. Tasks

Every task is TDD: failing test → minimal implementation → passing test → commit. Commit style per AGENTS.md invariant 6. **Every RED below was checked for whether it can actually fail** — R1 P0-2 found three that could not.

### Task 1 — recognizer skeleton, literal rule, program-wide scan

**RED.** `tests/messages/_metaParseWarningCodeSites.test.ts (new)` asserts `SECTION_HEADER_NO_FIELDS` is found with `file === "lib/parser/warnings.ts"` and `via === "literal"`. Fails because the module does not exist (compile error), then because the rule does not.

Also plants the **M3** mutant in this task: a `ParseWarning` literal in a directory no list names (`lib/reports/`), asserted present, then removed. This is the only proof that "program-wide" is real rather than an accident of the current emitter distribution.

**GREEN.** `lib/messages/__internal__/parseWarningCodeSites.ts (new)`:

- ts-morph `Project` over the repo `tsconfig.json`.
- Resolve `ParseWarning` by asking the project for `lib/parser/types.ts`, then for its `ParseWarning` type alias, using the `OrThrow` variants of both accessors — a rename must crash, not silently empty the result.
- `isScannedFile(path)`: inside repo root; not `node_modules`; not any `__generated__` segment; not `tests/`; not `lib/dev/attentionScenarios/`.
- Candidate pre-filter (own `code`, plus own `severity`+`message` or a spread), then assignability to `ParseWarning`, with `any`/`unknown` rejected.
- Rule 1 only. Everything else → `unresolved`.

**Commit:** `feat(codes): recognize object-literal ParseWarning emit sites`

### Task 2 — const rule

**RED.** `BLOCK_DISAPPEARED` found with `via === "const"`. Its emit reads `code: BLOCK_DISAPPEARED` (`lib/sync/blockDisappearance.ts:79`) where the identifier is *imported* from `lib/parser/warnings.ts:67`. Fails without alias following — the defect the third prototype iteration actually had.

**GREEN.** Identifier → symbol → `getAliasedSymbol()` when present → variable declaration with a string-literal initializer.

**Commit:** `feat(codes): resolve const-referenced warning codes`

### Task 3 — factory rule, with the scanned-file predicate on recorded sites

**RED, two assertions, both genuinely failing:**

1. `AGENDA_SCHEDULE_TIME_ADJUSTED` found with `via === "factory"`, `file === "lib/sync/enrichAgenda.ts"`. One of the four residue codes; `warn(code, message)` (`lib/sync/enrichAgenda.ts:45-47`) takes the code as an argument (`lib/sync/enrichAgenda.ts:433`), invisible to any `code:` regex.
2. **M6.** Export that factory and call it from `tests/messages/__m6Plant.test.ts (temporary)` with a literal; assert the planted code does **not** appear. Fails against a naive implementation — measured, the unpatched recognizer minted it:

```
total codes: 58   PLANTED_FROM_TEST_FILE minted? true
sites from tests/: [{"code":"PLANTED_FROM_TEST_FILE","file":"tests/messages/__m6Plant.test.ts","line":6,"via":"factory:warn"}]
```

Both the export and the plant are reverted after the assertion is confirmed red. A companion mutant that defines a *local* factory inside the test file does not escape and is not used.

**GREEN.** Shorthand `code` → enclosing `FunctionDeclaration` → parameter index → `findReferencesAsNodes()` → literal argument, **filtered through `isScannedFile()`**, recording the call site's file and line.

**Commit:** `feat(codes): resolve factory-argument codes, excluding unscanned call sites`

### Task 4 — union-parameter rule

**RED.** All three of `REEL_DRIFTED`, `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO` found with `via === "union"`. `reelWarning(code: ReelWarningCode)` (`lib/sync/phase2.ts:337-339`) has exactly one call site and it passes `reel.warningCode` dynamically (`lib/sync/phase2.ts:385`) — R1 confirmed independently that no literal call site exists — so Task 3's rule finds zero and reports an unresolved site.

**GREEN.** Rule 3, ordered **before** rule 4: a string-literal-union (or single-literal) `code` parameter enumerates its members and skips call-site analysis.

**Commit:** `feat(codes): enumerate union-typed warning code parameters`

### Task 5 — non-object-literal construction detector (assertion 4)

**RED.** Plant both mutants in a non-dot directory (`lib/__m7probe/`, deleted after):

```ts
export class MutantWarning implements ParseWarning { severity: "warn" = "warn"; code = "MUTANT_CLASS_INSTANCE"; message = "x"; }
export const assigned: ParseWarning = Object.assign({}, base, { code: "MUTANT_OBJECT_ASSIGN" });
```

Assert the guard fails while they are present. Measured at plan time: both are detected, and the tree is clean without them.

**GREEN.** Assertion 4 — fail when the program holds a class whose instance type is assignable to `ParseWarning`, or an `Object.assign` call whose result type is. **`any` and `unknown` are rejected before the assignability test**, or `Object.assign(Object.create(null), {…})` at `components/admin/review/PublishedArchivedTabOffer.tsx:26` false-positives (its result type is `any`, and `any` is assignable to everything). That false positive is the concrete failure mode this exclusion prevents.

**Commit:** `test(codes): signal non-object-literal ParseWarning construction`

### Task 6 — exemption registry with set-equality integrity

**RED.** Assert that a planted unresolved site in a file that already holds an *approved* exemption still fails the guard. R1's P1 probe showed a `{file, reason}` schema hiding it:

```json
{"visibleAfterOnlyRepresentableFileMatch":[],"assertion2Passes":true,"assertion3Passes":true,"silentlyHidden":[10,40]}
```

**GREEN.** `PARSE_WARNING_SITE_EXEMPTIONS` rows are `{file, why, reason}`, and assertion 3 compares the unresolved multiset against the exemption multiset by **equality**. With the list empty at ship time this degenerates to `unresolved === []`, so it is not vacuous before the first exemption — the defect R1 named.

**Commit:** `test(codes): make exemptions site-scoped and non-vacuous`

### Task 7 — generator swap, guard assertions 0-2, regenerated manifest

Tasks 6 and 7 of the original plan are merged. R1 P0-2 was right that the original Task 6 committed a knowingly-failing assertion and deferred its GREEN to Task 7, which violates invariant 1's "passing test → commit."

**RED.** Assertion 1 as set equality: the collector recognizes 57 codes, the committed manifest attributes `parse_warnings.code` to 46. Fails in both directions at once.

**GREEN.** Replace `scripts/extract-internal-code-enums.ts:70-74` with a `collectParseWarningCodeSites()` call. Leave `scripts/extract-internal-code-enums.ts:76-112`, `readFiles`, `addCodeLiteralsFromSource`, and the render/write path untouched. Run `pnpm gen:internal-code-enums`; commit the regenerated manifest in the **same** commit; verify `git diff --exit-code lib/messages/__generated__/internal-code-enums.ts` is clean.

Also lands assertion 0 (three provenance sentinels — `literal`, `const`, `union` — as a rule-level canary, no numeric floor) and assertion 2 (`unresolved` empty).

Expected manifest delta, to be re-derived rather than trusted: +10 codes gain `parse_warnings.code`; `VERSION_AMBIGUOUS` and `MI-1_VERSION_DETECTION_FAILED` lose it while keeping their other provenances.

**Commit:** `feat(codes): extract parse-warning codes by type, not by directory`

### Task 8 — gallery filter, residue deletion, mirror-class guard

**RED.** `expect(warningCodes()).toHaveLength(57)` and `expect(warningCodes()).toContain("PULL_SHEET_ON_ARCHIVED_TAB")`. Before the change `warningCodes()` returns 47 — genuinely red, and it is red for the reason spec §2.3 records: the strict-equality filter excludes the three multi-provenance codes, so the residue is load-bearing rather than rotted.

**GREEN.**

- `warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:138-143`) moves to `v.source.includes("parse_warnings.code")`, matching `lib/observe/query/serializeWarning.ts:29`.
- Delete `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`) and its explanatory block (`lib/dev/attentionScenarios/tier1.ts:114-129`), replaced by a two-line note pointing at `lib/messages/__internal__/parseWarningCodeSites.ts (new)`.
- Delete the residue assertions at `tests/dev/attentionScenariosWarnings.test.ts:36-38`. Keeping the surrounding test that every generated entry appears in `warningCodes()`.
- Add assertion 5: no file outside `tests/**` and `lib/dev/attentionScenarios/**` imports from `lib/dev/attentionScenarios/`. This closes the mirror class the fixture-tree exclusion opens — a factory whose body lives in that tree would have its production call sites silently dropped. Probed: no production file imports from it today.

R1 P0-2 correctly rejected the original Task 8 RED (deleting test assertions leaves a valid export and only an unused import). The filter change supplies a real one.

**Commit:** `refactor(codes): align the gallery filter and delete the code residue`

### Task 9 — verification sweep and ledger graduation

Run, recording output in the commit body:

- `pnpm test` (full suite)
- `pnpm test:audit:x2-no-raw-codes`, **then `git diff --exit-code lib/messages/__generated__/internal-code-enums.ts`** — that audit regenerates the manifest, and the canonical CI job treats regeneration and cleanliness as two steps (`.github/workflows/x-audits.yml:121-125`). R1 P2 caught the omission.
- `pnpm typecheck`, `pnpm lint`
- `pnpm test tests/docs/_metaInvariant8Closeout.test.ts` — this plan carries `impeccable-gate: N/A — no UI surface`, grammar pinned by `NA_FORM` at `tests/docs/_invariant8Closeout.ts:46`
- `pnpm test tests/docs/_metaLedgerInProgress.test.ts`

Then graduate `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` from `BACKLOG.md` to `BACKLOG-archive.md`, recording (a) the prescribed fix superseded on probe evidence, (b) Effort S→M, (c) that the residue was **load-bearing, not rotted** — the spec's original claim was inverted, and the strict-vs-`includes` reader disagreement was the cause.

**The `IN PROGRESS` marker is cleared in THIS commit, as part of the graduation** — not at Stage 4.4. R1 P0-1: `tests/docs/_metaLedgerInProgress.test.ts:149-153` forbids an archived entry from being in flight, and CI runs before merge, so deferring the clear to Stage 4.4 would ship a PR that required CI rejects. AGENTS.md invariant 12 already says an entry graduating to an archive "takes its marker with it by construction"; the original plan misread it. Stage 4.4 then has no ledger work for this branch.

Add the reconciliation-log line at `BACKLOG.md:7`.

**Commit:** `docs(plan): graduate BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`

---

## 2. Checklist

- [ ] Task 1 — literal rule + program-wide plant
- [ ] Task 2 — const rule
- [ ] Task 3 — factory rule + M6 call-site exclusion
- [ ] Task 4 — union-parameter rule
- [ ] Task 5 — non-object-literal detector
- [ ] Task 6 — exemption set-equality
- [ ] Task 7 — generator swap + manifest
- [ ] Task 8 — gallery filter + residue deletion + mirror guard
- [ ] Task 9 — verification sweep + graduation
- [ ] Self-review
- [ ] Adversarial review (cross-model, Codex) — to APPROVE
- [ ] Whole-diff cross-model review — to APPROVE
- [ ] Push, real CI green, merge, fast-forward `main` to `0  0`

---

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Full-program TS load slower in CI than 2.1 s locally | One program over 887 files, syntactic pre-filter to 118 candidates. Memoizable per process if needed — measure on the first CI run, do not pre-optimize. |
| `checker.isTypeAssignableTo` is a TypeScript-internal API | `typescript@^5` and `ts-morph@^28` are already dependencies. The call sits behind one function in one module; the `OrThrow` posture makes a break loud. |
| Recognizer and generator drift apart | Structurally impossible — same exported function. This is the design's central property. |
| Set equality makes the guard brittle against legitimate churn | Intended. A legitimate new emitter changes the recognized set, and regenerating the manifest is one command. That coupling is the point of the guard. |
