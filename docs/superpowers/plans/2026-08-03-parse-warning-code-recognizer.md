# Plan — parse-warning code recognizer

**Spec:** `docs/superpowers/specs/2026-08-03-parse-warning-code-recognizer-design.md`
**Closes:** `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`
**Branch:** `fix/parse-warning-code-recognizer`

impeccable-gate: N/A — no UI surface

**Revision history:** R1 returned BLOCKING (2 P0, 2 P1, 1 P2) and R2 returned BLOCKING (2 P0, 2 P1, 1 P2). All ten confirmed by independent probe. R2 forced three structural changes: Tasks 7 and 8 merge (their split left Task 8 with no possible RED), the exemption mechanism is deleted rather than repaired (two schemas, two escaping mutants), and **set equality is conceded not to close M5** — the guard needs an independent anchor. The first anchor tried, an emitter-file set, was then refuted by a within-file narrowing and replaced with `EXPECTED_PARSE_WARNING_CODES`, a golden snapshot of the code set. Task counts: 9 → 8 (R1) → 7 (R2).

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
| M1 | Emitter lands, manifest not regenerated | a `ParseWarning` literal with a fresh code, no `pnpm gen:internal-code-enums` | assertion 1 (manifest set equality) |
| M2 | Unmodelled `code` shape | `` code: `PREFIX_${x}` ``; `code: MAP[k]`; a two-hop factory | assertion 2 — probed: `why: "code initializer is TemplateExpression"` |
| M3 | Emitter in a directory nobody listed | a literal under `lib/reports/` | program-wide scan; probed present |
| M4 | — | — | **removed by construction**: no exemption mechanism ships (see Task 6 deletion below) |
| M5 | **Collector narrows**, at file OR site granularity | tighten the file predicate; or tighten the pre-filter so sites drop *within* files | assertion 3 (`EXPECTED_PARSE_WARNING_CODES`) — **not** assertion 1, and **not** an emitter-file anchor |
| M6 | Test or fixture call site mints a code | export `lib/sync/enrichAgenda.ts:45`'s factory, call it from a test | scanned-file predicate on recorded sites; probed `false` after fix, `true` before |
| M7 | Non-object-literal construction | class implementing `ParseWarning`; `Object.assign` composition | assertion 4, with `any`/`unknown` rejected first |
| M8 | **Spread composition** | `const p = {code:"X"}; const w: ParseWarning = {...p, severity, message}` | pre-filter's spread-source discriminator — probed signaled, propagation site still clean |

**M5 is the concession this round forced.** R1 showed a numeric floor missing a partial scan, and the repair was set equality. R2 then showed set equality *also* fails to close M5, because the generator and the guard share the collector: narrow the collector, regenerate the manifest as Task 7 requires, and both shrink together.

```json
{"correctCodes":57,"degradedCodes":51,"manifestAfterRegenCodes":51,"setEqualityPasses":true,"namedPass":true}
```

No assertion derived from the collector's own artifact can detect this. Assertion 3 is therefore an **independent anchor**.

An emitter-file anchor was the first attempt and it fails a second mutant: sixteen of the twenty-two contributing files hold more than one site, so tightening the pre-filter *within* files drops 22 of 57 codes while the file set is untouched (`codes 35, sites 44, unresolved 0`). The anchor is therefore the **code set itself**, `EXPECTED_PARSE_WARNING_CODES`, a golden snapshot of 57 codes compared by equality. The plan trades a hand-maintained 4-code residue for a hand-maintained 57-code snapshot, justified on failure mode rather than size — see spec §3.5 — and §3 carries that trade as a risk row rather than hiding it.

**M4 is removed rather than defended.** R1 rejected `{file, reason}` as colliding file-wide; the `{file, why, reason}` repair was refuted in turn — replacing an exempted site with a different site in the same file drawing the same classifier leaves the multiset unchanged (`{"beforeEqual":true,"afterReplacementEqual":true,"escapedMutant":true}`). The list would be empty at ship time regardless, so the mechanism is dropped and `unresolved` must simply be empty.

### 0.4 Snippet typecheck posture

Snippets are written against the repo's strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) and every one is compiled before dispatch. R2 P2 found the Task 5 mutant snippet referencing an undeclared `base` (`TS2304`); it now declares it. The manifest lookup uses an explicit widening rather than a `keyof typeof` cast — the cast compiles and is runtime-correct, but it tells the compiler a lookup always succeeds when the assertion's whole purpose is the case where it does not:

```ts
const manifest: Record<string, { source: string } | undefined> = INTERNAL_CODE_ENUMS;
```

### 0.5 Test wiring

`tests/messages/_metaParseWarningCodeSites.test.ts (new)` lands in the **PARALLEL** vitest project — `vitest.config.ts` splits the suite via `vitest.projects.ts`, and `tests/messages/**/*.test.{ts,tsx}` is listed in `PARALLEL_TEST_GLOBS` (`vitest.projects.ts:89`). It is concurrency-safe there: the partition's stated hazard is on-disk state mutated mid-run (`vitest.projects.ts:130`), and this test only reads source files. Its cost is one TypeScript program (~19 s end-to-end, see §3), measured on the first real CI run. No workflow path filter needs an entry (R1 confirmed this independently).

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
import type { ParseWarning } from "@/lib/parser/types";

export class MutantWarning implements ParseWarning {
  severity: "warn" = "warn";
  code = "MUTANT_CLASS_INSTANCE";
  message = "x";
}

const base = { severity: "warn" as const, message: "x" };
export const assigned: ParseWarning = Object.assign({}, base, { code: "MUTANT_OBJECT_ASSIGN" });
```

Assert the guard fails while they are present. Measured at plan time: both are detected, and the tree is clean without them.

**GREEN.** Assertion 4 — fail when the program holds a class whose instance type is assignable to `ParseWarning`, or an `Object.assign` call whose result type is. **`any` and `unknown` are rejected before the assignability test**, or `Object.assign(Object.create(null), {…})` at `components/admin/review/PublishedArchivedTabOffer.tsx:26` false-positives (its result type is `any`, and `any` is assignable to everything). That false positive is the concrete failure mode this exclusion prevents.

Also lands **M8**, the spread-composition family R2 found (spec §3.3): plant

```ts
const codePart = { code: "MUTANT_SPREAD_CODE" };
export const w: ParseWarning = { ...codePart, severity: "warn", message: "x" };
```

and assert it reaches `unresolved`. Under a naive pre-filter neither literal is a candidate — the fragment has no `severity`/`message`, the enclosing literal has no own `code` — so the code is silently missed with nothing signaled. GREEN adds the spread-source discriminator: skip only when some spread source is itself assignable to `ParseWarning`. Probed both ways — mutant signaled (`why: "code composed via a non-ParseWarning spread"`), and the live propagation site at `lib/parser/blocks/crew.ts:380-390` still clean at 0 unresolved.

**Commit:** `test(codes): signal non-object-literal and spread-composed construction`

### Task 6 — the golden code set (assertion 3)

**RED, two mutants, because the first anchor design failed the second one:**

1. Narrow the collector's file predicate to exclude `lib/sync/enrichWithDrivePins.ts`, regenerate the manifest, assert the guard fails. Assertion 1 alone does not catch it — recognized and manifest both drop to 51 and set equality passes.
2. Narrow *within* files — tighten the pre-filter to also require `blockRef` — and assert the guard fails. Probed: `codes 35 (baseline 57), sites 44 (baseline 73), unresolved 0`. **An emitter-file anchor does not catch this**, because sixteen of the twenty-two contributing files hold more than one site, so the file set is unchanged while 22 of 57 codes vanish.

**GREEN.** Pin the code set itself — an ordinary golden snapshot, independent of anything the collector produces:

```ts
export const EXPECTED_PARSE_WARNING_CODES = [ /* 57 entries, alphabetical */ ] as const;
```

Assertion 3 compares the recognized set to it by equality. Both mutants fail against it, because the pinned list does not move when the collector does.

The emitter-file variant is recorded in spec §3.5 as tried-and-rejected so it is not re-proposed. The original Task 6 (exemption registry) is deleted — see §0.3's M4 row.

**Commit:** `test(codes): pin the parse-warning universe as a golden set`

### Task 7 — generator swap, gallery filter, residue deletion, manifest, and guard assertions 0/1/2/5

R1 merged the original Tasks 6 and 7; R2 showed Task 8 must merge in too. **These are not separable.** After a generator swap alone, the old strict filter plus the surviving residue already returns 57 and already contains `PULL_SHEET_ON_ARCHIVED_TAB`, so the planned Task 8 RED is green before its own GREEN:

```json
{"currentBucket":46,"plannedEntering":13,"plannedBucket":57,"strictAfterTask7":55,
 "oldFilterPlusResidueAfterTask7":57,"containsPull":true}
```

Splitting them the other way is no better: deleting the residue before the generator swap drops `AGENDA_SCHEDULE_LOW_CONFIDENCE`, `AGENDA_SCHEDULE_TIME_ADJUSTED`, and `PULL_SHEET_OVERRIDE_CONTENT_CHANGED` from the gallery, because the manifest does not carry them yet. Either split leaves a commit where the gallery is wrong. One task, one atomic behavioural change.

**RED.** Assertion 1 as set equality: the collector recognizes 57 codes, the committed manifest attributes `parse_warnings.code` to 46. Fails in both directions.

**GREEN.**

- Replace `scripts/extract-internal-code-enums.ts:70-74` with a `collectParseWarningCodeSites()` call; leave `scripts/extract-internal-code-enums.ts:76-112`, `readFiles`, `addCodeLiteralsFromSource`, and the render/write path untouched.
- `warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:138-143`) moves to `v.source.includes("parse_warnings.code")`, matching `lib/observe/query/serializeWarning.ts:29`.
- Delete `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`) and its explanatory block (`lib/dev/attentionScenarios/tier1.ts:114-129`); delete the residue assertions at `tests/dev/attentionScenariosWarnings.test.ts:36-38`.
- Add assertion 5, narrowed per spec §3.4: no file outside `tests/**` and `lib/dev/attentionScenarios/**` imports a warning **factory** (`buildWarning`, `crewScopedWarning`) from the fixture tree. R2 refuted the all-imports form — ten production files legitimately import types and scenario data from that tree, four as value imports.
- Run `pnpm gen:internal-code-enums`; commit the regenerated manifest in this same commit; verify `git diff --exit-code lib/messages/__generated__/internal-code-enums.ts`.

Expected delta, re-derived at implementation rather than trusted: **13 codes enter** the manifest bucket, **2 leave** (`VERSION_AMBIGUOUS`, `MI-1_VERSION_DETECTION_FAILED`), 46 → 57. The gallery separately goes 47 → 57, a net gain of 10 scenarios — a different set from the 13, since three of the entering codes were already shown via the residue.

**Commit:** `feat(codes): extract parse-warning codes by type, not by directory`

### Task 8 — verification sweep and ledger graduation

**RED — and it is a real one.** Move the `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` entry from `BACKLOG.md` to `BACKLOG-archive.md` **while leaving its `IN PROGRESS` marker in place**, then run `pnpm test tests/docs/_metaLedgerInProgress.test.ts`. It fails: `tests/docs/_metaLedgerInProgress.test.ts:149-153` forbids an archived entry from being in flight. R2 P0-4 was right that the original ordering ran the ledger test *before* the mutation, so its green transcript never exercised the state R1's repair depends on. Mutating first makes the guard do real work.

**GREEN.** Clear the marker. Re-run the meta-test — green.

Then the rest of the sweep, recording output in the commit body:

- `pnpm test` (full suite)
- `pnpm test:audit:x2-no-raw-codes`, **then `git diff --exit-code lib/messages/__generated__/internal-code-enums.ts`** — that audit regenerates the manifest, and the canonical CI job treats regeneration and cleanliness as two steps (`.github/workflows/x-audits.yml:121-125`)
- `pnpm typecheck`, `pnpm lint`
- `pnpm test tests/docs/_metaInvariant8Closeout.test.ts` — grammar pinned by `NA_FORM` at `tests/docs/_invariant8Closeout.ts:46`

The archive entry records (a) the prescribed fix superseded on probe evidence, (b) Effort S→M, (c) that the residue was **load-bearing, not rotted** — the spec's original claim was inverted, and the strict-vs-`includes` reader disagreement was the cause. Add the reconciliation-log line at `BACKLOG.md:7`.

Stage 4.4 then has no ledger work for this branch.

**Commit:** `docs(plan): graduate BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`

---

## 2. Checklist

- [ ] Task 1 — literal rule + program-wide plant
- [ ] Task 2 — const rule
- [ ] Task 3 — factory rule + M6 call-site exclusion
- [ ] Task 4 — union-parameter rule
- [ ] Task 5 — non-object-literal + spread-composition detectors
- [ ] Task 6 — golden code set
- [ ] Task 7 — generator swap + gallery filter + residue deletion + manifest
- [ ] Task 8 — ledger graduation + verification sweep
- [ ] Self-review
- [ ] Adversarial review (cross-model, Codex) — to APPROVE
- [ ] Whole-diff cross-model review — to APPROVE
- [ ] Push, real CI green, merge, fast-forward `main` to `0  0`

---

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Full-program TS load costs **~19 s**, paid once by the generator and once by the guard | Measured end-to-end: ~11.7 s program construction, ~2.8 s checker warm-up, ~4.5 s walk, 2882 files. An earlier draft's "~2.1 s" timed only the walk. The scoped-`Project` variant (~13 s, byte-identical output) is rejected in spec §1.1: its globs miss twelve root-level files including `instrumentation.ts`, reintroducing the silent miss the design removes. Measure on the first CI run; do not pre-optimize further. |
| `checker.isTypeAssignableTo` is a TypeScript-internal API | `typescript@^5` and `ts-morph@^28` are already dependencies. The call sits behind one function in one module; the `OrThrow` posture makes a break loud. |
| Recognizer and generator drift apart | Structurally impossible — same exported function. This is the design's central property. |
| Set equality makes the guard brittle against legitimate churn | Intended. A new emitter changes the recognized set; regenerating the manifest is one command. |
| `EXPECTED_PARSE_WARNING_CODES` is a hand-maintained list, the very thing this change deletes elsewhere | Stated as a trade, not hidden: 4 hand-maintained codes out, 57 in. The justification is failure mode, not size — the residue rotted silently (a code absorbed into the bucket left a dead row no test could see), whereas a golden set fails loud in both directions and its diff is the review artifact. R2 proved no artifact-derived check can replace it, and the cheaper emitter-file variant was probed and rejected. |
