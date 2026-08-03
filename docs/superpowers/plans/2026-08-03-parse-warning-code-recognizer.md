# Plan — parse-warning code recognizer

**Spec:** `docs/superpowers/specs/2026-08-03-parse-warning-code-recognizer-design.md`
**Closes:** `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`
**Branch:** `fix/parse-warning-code-recognizer`

impeccable-gate: N/A — no UI surface

---

## 0. Pre-draft declarations

### 0.1 Meta-test inventory

**CREATES:** `tests/messages/_metaParseWarningCodeSites.test.ts (new)` — structural guard over the parse-warning emit surface. Discovery is program-walked (the TypeScript program, not a file list), so a new emitter in an unlisted directory fails by default rather than being silently exempt.

**EXTENDS:** none.

**Does not apply:** `tests/auth/_metaInfraContract.test.ts` (no Supabase call boundary added), `tests/auth/advisoryLockRpcDeadlock.test.ts` (no `pg_advisory*` path touched — see §0.2), `tests/messages/_metaAdminAlertCatalog.test.ts` (no `admin_alerts.upsert` site added), `tests/log/_metaMutationSurfaceObservability.test.ts` (no mutating route or `"use server"` action added), `tests/components/tiles/_metaSentinelHidingContract.test.ts` (no tile rendering).

### 0.2 Advisory-lock holder topology

**N/A.** No task in this plan touches `pg_advisory_xact_lock`, `pg_try_advisory_xact_lock`, or any RPC. The diff is a generator script, one lib-internal module, one test file, one generated manifest, and one fixture-tree deletion. Verified: `rg -l 'pg_(try_)?advisory' lib/messages lib/dev scripts/extract-internal-code-enums.ts` returns nothing.

### 0.3 Mutation-family closure set (guard surface)

Per `docs/agents/writing-plans.md:24`, the guard's mutation families are enumerated here up front; this enumeration IS the closure set the review converges against. A reviewer-proposed new family is admissible only with a live escaping mutant demonstrated against the shipped guard.

| # | Family | Mutant | Caught by |
| --- | --- | --- | --- |
| M1 | Emitter lands, manifest not regenerated | add a `ParseWarning` literal with a fresh code; do not run `pnpm gen:internal-code-enums` | assertion 1 (recognized ⊄ committed manifest) |
| M2 | Emitter lands with an unmodelled `code` shape | `code: \`PREFIX_${x}\`` ; `code: MAP[k]` ; a two-hop factory | assertion 2 (`unresolved` non-empty) |
| M3 | Emitter lands in a directory nobody listed | new file under `lib/reports/` emitting a `ParseWarning` | covered by construction (program-wide scan); regression-pinned by the Task 6 planted mutant |
| M4 | Exemption outlives its site | exemption row whose `file` no longer exists or no longer holds an unresolved site | assertion 3 (stale exemption) |
| M5 | **Collector silently degrades to empty** | `ParseWarning` type lookup fails / tsconfig path changes / all files filtered out — assertions 1 and 3 then pass **vacuously** | assertion 0, the anti-tautology floor: `sites.length >= 60` and three named codes of distinct provenance are present |

M5 is the anti-tautology requirement from `docs/agents/writing-plans.md:10-14`: without a floor, a collector that returns `{sites: [], unresolved: []}` makes the whole guard green. The floor is asserted against *provenance-distinct* codes (one `literal`, one `const`, one `union`), so a partial regression that keeps only the easy rule still fails.

### 0.4 Snippet typecheck posture

Every snippet in this plan is written against the repo's strict tsconfig (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). Non-null assertions on array indexing are deliberate and marked. Task 1 lands the module and the first test together, so every later snippet compiles against a real module rather than a described one.

### 0.5 Test wiring

`tests/messages/_metaParseWarningCodeSites.test.ts (new)` lands in an existing test directory (`tests/messages/` already holds `warningCardCopyRegistry.ts` and `inlineLaterGroupCopy.test.ts`), so it is picked up by the default vitest include with no config change. Verified: no per-file `testMatch` list exists that would need an entry. No workflow path-filter change is needed — the file is under `tests/`, which every relevant workflow already globs.

---

## 1. Tasks

Every task is TDD: failing test → minimal implementation → passing test → commit. Commit style per AGENTS.md invariant 6.

### Task 1 — recognizer skeleton + literal rule

**RED.** `tests/messages/_metaParseWarningCodeSites.test.ts (new)`:

```ts
import { describe, expect, it } from "vitest";
import { collectParseWarningCodeSites } from "@/lib/messages/__internal__/parseWarningCodeSites";

describe("parse-warning code sites", () => {
  it("finds a plain object-literal emit", () => {
    const { sites } = collectParseWarningCodeSites();
    const hit = sites.find((s) => s.code === "SECTION_HEADER_NO_FIELDS");
    expect(hit?.file).toBe("lib/parser/warnings.ts");
    expect(hit?.via).toBe("literal");
  });
});
```

Failure mode this catches: the collector does not see the single most conventional emit shape in the repo. `emitEmptySection` pushes `{ severity: "warn", code: "SECTION_HEADER_NO_FIELDS", ... }` into `agg.warnings` at `lib/parser/warnings.ts:44-51`, so a passing assertion proves both the candidate pre-filter and the assignability test work end to end. Asserting `file` and `via` (not merely "the code is present") is what stops a future rule from satisfying this test through the wrong path.

**GREEN.** `lib/messages/__internal__/parseWarningCodeSites.ts (new)`:

- ts-morph `Project` over the repo `tsconfig.json`.
- Resolve `ParseWarning` by asking the project for `lib/parser/types.ts`, then for its `ParseWarning` type alias, using the `OrThrow` variants of both ts-morph accessors. `OrThrow` deliberately: a rename must crash, not silently empty the result (family M5).
- File filter: inside repo root; not `node_modules`; not any `__generated__` segment; not `tests/`; not `lib/dev/attentionScenarios/`.
- Candidate pre-filter, then `checker.compilerObject.isTypeAssignableTo(literalType, parseWarningType)`.
- Rule 1 only (`code: "LITERAL"`, unwrapping `as` expressions). Everything else → `unresolved`.

**Commit:** `feat(codes): recognize object-literal ParseWarning emit sites`

### Task 2 — const rule

**RED.** Assert `BLOCK_DISAPPEARED` is found with `via === "const"`. Its emit reads `code: BLOCK_DISAPPEARED` (`lib/sync/blockDisappearance.ts:79`) where the identifier is *imported* from `lib/parser/warnings.ts:67`. Failure mode: an implementation that reads the local symbol without following the import alias resolves nothing — the exact defect the third prototype iteration had.

**GREEN.** Rule 2: identifier → symbol → `getAliasedSymbol()` when present → variable declaration with a string-literal initializer.

**Commit:** `feat(codes): resolve const-referenced warning codes`

### Task 3 — factory-argument rule

**RED.** Assert `AGENDA_SCHEDULE_TIME_ADJUSTED` is found with `via === "factory"` and `file === "lib/sync/enrichAgenda.ts"`. This is one of the four `EXTRA_WARNING_CODES` rows and the reason the residue exists at all: `warn(code, message)` (`lib/sync/enrichAgenda.ts:45-47`) takes the code as an argument (`lib/sync/enrichAgenda.ts:433`), invisible to any `code:` regex.

**GREEN.** Rule 4: shorthand `code` → enclosing `FunctionDeclaration` → parameter index → `findReferencesAsNodes()` → literal argument at that index. Record the **call site's** file and line, not the factory's — the call site is where the code is chosen.

**Commit:** `feat(codes): resolve factory-argument warning codes`

### Task 4 — union-parameter rule

**RED.** Assert all three of `REEL_DRIFTED`, `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO` are found with `via === "union"`. `reelWarning(code: ReelWarningCode)` (`lib/sync/phase2.ts:337-339`) has exactly one call site, and it passes `reel.warningCode` dynamically (`lib/sync/phase2.ts:385`) — so Task 3's rule finds **zero** literals here and reports an unresolved site. The union at `lib/sync/verifyReelOnApply.ts:17-20` is the enumeration.

Failure mode this catches: an implementation that orders rule 4 before rule 3 records nothing for all three codes and leaves an unresolved site that never clears.

**GREEN.** Rule 3, ordered **before** rule 4: if the `code` parameter's declared type is a string-literal union (or a single string literal), enumerate its members and skip call-site analysis.

**Commit:** `feat(codes): enumerate union-typed warning code parameters`

### Task 5 — propagation skip, exclusions, exemptions

**RED.** Three assertions:

1. `sites.filter((s) => s.file === "lib/parser/blocks/crew.ts" && s.code === "ROLE_TOKEN_AUTOCORRECTED")` — the re-stamp at `lib/parser/blocks/crew.ts:380-390` spreads an existing warning and adds `blockRef`; it must NOT register a site, because it emits nothing new. Assert the site count attributable to that re-stamp is zero while `ROLE_TOKEN_AUTOCORRECTED` is still present from its real emitter.
2. No site has a `file` starting `lib/dev/attentionScenarios/`.
3. `PARSE_WARNING_SITE_EXEMPTIONS` is exported and every row has a non-empty `reason`.

**GREEN.** Rule 5 (spread + no own `code` → skip), the fixture-tree exclusion, and the exported exemption array (empty at ship time, per spec §4.3).

**Commit:** `feat(codes): skip propagation sites and export the exemption registry`

### Task 6 — the guard's three assertions + anti-tautology floor + planted mutant

**RED.** Extend the test file with assertions 0–3 from spec §3.4 plus §0.3 M5's floor:

```ts
it("has not silently degraded to an empty scan", () => {
  const { sites } = collectParseWarningCodeSites();
  expect(sites.length).toBeGreaterThanOrEqual(60);
  const vias = new Map(sites.map((s) => [s.code, s.via]));
  expect(vias.get("SECTION_HEADER_NO_FIELDS")).toBe("literal");
  expect(vias.get("BLOCK_DISAPPEARED")).toBe("const");
  expect(vias.get("REEL_DRIFTED")).toBe("union");
});

it("every recognized code is in the committed manifest", () => {
  const { sites } = collectParseWarningCodeSites();
  const missing = [...new Set(sites.map((s) => s.code))].filter(
    (c) => !INTERNAL_CODE_ENUMS[c as InternalCodeEnum]?.source.includes("parse_warnings.code"),
  );
  expect(missing, "run `pnpm gen:internal-code-enums`").toEqual([]);
});

it("recognizes every ParseWarning construction shape in the tree", () => {
  const { unresolved } = collectParseWarningCodeSites();
  expect(unresolved).toEqual([]);
});
```

The floor of 60 is derived from the measured 73 sites, with headroom below it so ordinary churn does not trip it; it is not a hardcoded expected value for the code count, which stays asserted only through the manifest comparison.

**Planted-mutant proof (M2, M3).** In the same task, temporarily add a scratch file emitting `{ severity: "warn", code: \`X_${n}\`, message: "" }` typed as `ParseWarning`, confirm the `unresolved` assertion goes RED, then delete it. Record the observed failure text in the commit body. This is the live escaping mutant the closure set requires, and it simultaneously proves M3 (the file is in a directory no list names).

**Commit:** `test(codes): pin the parse-warning recognizer's guard contract`

### Task 7 — generator swap

**RED.** The Task 6 manifest assertion already fails for the 10 codes the recognizer finds and the committed manifest lacks. That is this task's RED.

**GREEN.** Replace `scripts/extract-internal-code-enums.ts:70-74` with a `collectParseWarningCodeSites()` call adding each code under `"parse_warnings.code"`. Leave `scripts/extract-internal-code-enums.ts:76-112`, `readFiles`, `addCodeLiteralsFromSource`, and the render/write path untouched. Run `pnpm gen:internal-code-enums` and commit the regenerated manifest **in the same commit** — `git diff --exit-code lib/messages/__generated__/internal-code-enums.ts` must be clean afterwards.

Expected manifest delta, from the spec's §4.1/§4.2 (re-derive; do not trust these as inputs): +10 codes gain `parse_warnings.code`, `VERSION_AMBIGUOUS` loses it while keeping its other provenances.

**Commit:** `feat(codes): extract parse-warning codes by type, not by directory`

### Task 8 — delete the residue

**RED.** Delete the `EXTRA_WARNING_CODES` assertions at `tests/dev/attentionScenariosWarnings.test.ts:36-38`; the import at `tests/dev/attentionScenariosWarnings.test.ts:7` then fails to resolve once the export is gone. Run the file to see it red before editing the source.

**GREEN.** Delete `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`), replace the explanatory block at `lib/dev/attentionScenarios/tier1.ts:114-129` with a two-line note pointing at `lib/messages/__internal__/parseWarningCodeSites.ts (new)`, and reduce `warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:138-143`) to the generated filter plus the sort. Keep the surrounding test that every generated `parse_warnings.code` entry appears in `warningCodes()`.

**Commit:** `refactor(codes): delete the hand-maintained warning-code residue`

### Task 9 — verification sweep and ledger graduation

Run, and record output in the commit body:

- `pnpm test` (full suite)
- `pnpm test:audit:x2-no-raw-codes`
- `pnpm typecheck` and `pnpm lint`
- `pnpm test tests/docs/_metaInvariant8Closeout.test.ts` — this plan carries `impeccable-gate: N/A — no UI surface`, whose exact grammar is pinned by `NA_FORM` in `tests/docs/_invariant8Closeout.ts:46`
- `pnpm test tests/docs/_metaLedgerInProgress.test.ts` — invariant 12

Then graduate `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` from `BACKLOG.md` to `BACKLOG-archive.md`, recording (a) that the row's prescribed fix was superseded on probe evidence, (b) the Effort S→M correction, (c) the `PULL_SHEET_ON_ARCHIVED_TAB` residue row already having rotted to a no-op before this work started. Add the reconciliation-log line at `BACKLOG.md:7`.

The IN PROGRESS marker is cleared at Stage 4.4 (after the `0  0` check), not here — per invariant 12 the marker outlives the branch only if it is removed when the PR merges.

**Commit:** `docs(plan): graduate BL-INTERNAL-CODE-ENUM-SCAN-WIDEN`

---

## 2. Checklist

- [ ] Task 1 — literal rule
- [ ] Task 2 — const rule
- [ ] Task 3 — factory-argument rule
- [ ] Task 4 — union-parameter rule
- [ ] Task 5 — propagation, exclusions, exemptions
- [ ] Task 6 — guard contract + planted mutant
- [ ] Task 7 — generator swap + regenerated manifest
- [ ] Task 8 — residue deletion
- [ ] Task 9 — verification sweep + ledger graduation
- [ ] Self-review
- [ ] Adversarial review (cross-model, Codex) — to APPROVE
- [ ] Whole-diff cross-model review — to APPROVE
- [ ] Push, real CI green, merge, fast-forward `main` to `0  0`

---

## 3. Risks

| Risk | Mitigation |
| --- | --- |
| Full-program TS load is slower in CI than the 2.1 s measured locally | The pass is one program over 887 files with a syntactic pre-filter (118 candidates). If CI wall clock regresses materially, the collector is memoizable per process — but do not pre-optimize; measure in the first CI run. |
| `checker.compilerObject.isTypeAssignableTo` is a TypeScript-internal API | Pinned `typescript@^5` and `ts-morph@^28` are already project dependencies. The call is behind one function in one module, so a future TS break is a single-site fix. Task 1's `OrThrow` posture means a break is loud. |
| Recognizer and generator drift apart | Structurally impossible: they call the same exported function. This is the design's central property, not a mitigation. |
| The 10 new gallery scenarios change a snapshot | No snapshot covers the scenario list; `tests/dev/attentionScenariosWarnings.test.ts` asserts membership, not a fixed count. Verify in Task 9. |
