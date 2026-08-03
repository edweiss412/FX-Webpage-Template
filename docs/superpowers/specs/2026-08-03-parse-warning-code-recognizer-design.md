# Parse-warning code recognizer — design

**Date:** 2026-08-03
**Closes:** `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` (BACKLOG.md)
**Class:** generated-registry completeness
**Surface:** generator script + one new lib-internal module + one structural guard test. No UI, no DB, no migration, no advisory-lock path.

---

## 1. Problem

`extractInternalCodeEnums` builds the `parse_warnings.code` bucket of the generated internal-code manifest by reading every file under `lib/parser`, filtering them by the content regex `/\bParseWarning\b|\bwarnings\b|hardErrors/`, and harvesting `code: "LITERAL"` matches (`scripts/extract-internal-code-enums.ts:70-74`).

Because no runtime module enumerates the parse-warning universe, the attention-scenario gallery unions that generated bucket with a hand-maintained residue, `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`), whose four rows are re-joined in `warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:138-143`). The union de-duplicates, so a generator fix that absorbs one of the four shrinks the residue silently rather than double-rendering it — which is exactly why the residue can rot invisibly.

The bucket has two live readers, so its contents are not cosmetic:

- `lib/dev/attentionScenarios/tier1.ts:140` — strict `v.source === "parse_warnings.code"`, drives one gallery scenario per code.
- `lib/observe/query/serializeWarning.ts:29` — `entry.source.includes("parse_warnings.code")`, decides whether the observe CLI treats a persisted code as a parse warning.

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| The backlog row's literal prescription ("widen the scan roots (and the content predicate…)") is **superseded by this spec**, on probe evidence in §2. Root-widening is rejected; type-aware extraction replaces the roots list entirely. | §2.1, §2.2 below; row text at `BACKLOG.md` under `## BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` |
| The row's **Effort: S** estimate is superseded by **M**. The row was written before the emit-shape taxonomy was known. | §2.3 |
| Only the `parse_warnings.code` bucket changes. The `shows.last_sync_status`, `pending_ingestions.last_error_code`, and `admin_alerts.code` buckets keep their existing root+regex extraction verbatim (`scripts/extract-internal-code-enums.ts:76-112`). Widening those is out of scope. | §3.2 |
| `VERSION_AMBIGUOUS` leaving the bucket is a **correction, not a regression**. It is a `ParseError` (`lib/parser/types.ts:118`), attached to `hardErrors` at `lib/parser/index.ts:578`, and is in the bucket today only because the current content predicate matches the token `hardErrors`. | §4.2 |
| `ParseWarning["code"]` stays `string` (`lib/parser/types.ts:69`). Narrowing it to a union was probed and rejected: `buildWarning(code: string)` (`lib/dev/attentionScenarios/tier1.ts:152`), `crewScopedWarning(code: string)` (`lib/dev/attentionScenarios/tier2.ts:590`), and DB-read paths that carry an unconstrained string (`lib/admin/needsAttention.ts:117`) all legitimately hold non-literal codes. | §4.4 |
| `GAP_CLASSES` (`lib/parser/dataGaps.ts:30`) is **not** the warning universe and is not promoted to one. Probed: it holds 2 codes the recognizer does not reach and misses 17 the recognizer does, including every `*_AUTOCORRECTED` code. It is a data-quality *gap* subset. | §2.2 |
| The gallery fixture tree `lib/dev/attentionScenarios/**` is **excluded** from the scan. Its `buildWarning(...)` / `crewScopedWarning(...)` calls consume the universe; letting them define it would let a fixture typo mint a code. Probed: excluding it removes zero codes. | §3.1, §4.3 |
| The guard fails on an **unrecognized emit shape**, not merely on a missing code. Fail-loud on the unknown is the whole mechanism by which the next out-of-model emitter cannot land silently. | §5 |

---

## 2. Probe findings (draft-time evidence)

Per the probe-before-argue rule for detector surfaces (`docs/agents/spec-self-review.md:23`), every claim below was settled by running code against the tree at `origin/main` (`6a6ea124f`), not by argument. Prototypes are throwaway; the numbers are the design inputs.

### 2.1 Root-widening over-selects

Running the **current** content predicate over roots `["lib", "app", "components", "scripts"]` grows the bucket from 46 to 66. The 20 extra codes are admin-alert, report, and gallery-fixture codes — `SHEET_UNAVAILABLE`, `IDEMPOTENCY_IN_FLIGHT`, `MI11_TARGET_MOVED`, `UNDO_NOT_FOUND`, `REPORT_HORIZON_EXPIRED` among them. Nothing textual separates `code: "X"` on a `ParseWarning` from `code: "X"` on an admin alert inside the same file (`lib/sync/runScheduledCronSync.ts` emits both). Both readers in §1 would consume the pollution.

### 2.2 Root-widening also under-selects

Three of the four `EXTRA_WARNING_CODES` rows stay missed at any root, because the emit site is a factory call, not a `code:` property:

```ts
// lib/sync/enrichAgenda.ts:45-47
function warn(code: string, message: string): ParseWarning {
  return { severity: "warn", code, message };
}
```

`AGENDA_SCHEDULE_LOW_CONFIDENCE` and `AGENDA_SCHEDULE_TIME_ADJUSTED` reach that helper as *arguments* (`lib/sync/enrichAgenda.ts:425`, `lib/sync/enrichAgenda.ts:433`). No `code: "..."` regex reaches them from any directory.

Separately, `GAP_CLASSES` was evaluated as a candidate ready-made registry and rejected: it holds `UNKNOWN_DAY_RESTRICTION` and `PULL_SHEET_ON_ARCHIVED_TAB` that the recognizer reaches by other means, and misses 17 recognizer codes including all five `*_AUTOCORRECTED` codes and every `DIAGRAMS_*` code.

### 2.3 The residue is already rotting, as the row predicted

`PULL_SHEET_ON_ARCHIVED_TAB` is **already** in the generated bucket (`lib/messages/__generated__/internal-code-enums.ts:224`, source `parse_warnings.code,pending_ingestions.last_error_code`). Its `EXTRA_WARNING_CODES` row (`lib/dev/attentionScenarios/tier1.ts:134`) is a no-op today. One of four rows has rotted since the residue was written, with nothing to signal it.

### 2.4 Type-aware extraction converges to zero unknowns

A ts-morph prototype using assignability to `ParseWarning` plus the four resolution rules in §3.3 yields, over 887 source files:

| Metric | Value |
| --- | --- |
| Candidate object literals (syntactic pre-filter) | 118 |
| Recognized emit sites | 73 |
| Distinct codes | **57** |
| Unresolved sites | **0** |
| Wall clock | ~2.1 s |

Site provenance: 50 literal, 19 factory-argument, 3 union-parameter, 1 imported const.

The prototype was built in three iterations, and each iteration's *unresolved* list was the discovery mechanism for the next rule — which is the same mechanism the shipped guard uses to catch a future emitter. Iteration 1 (contextual-type name match) left 10 unresolved; iteration 2 (const + factory resolution) left 4; iteration 3 (assignability + union parameters) left 0.

---

## 3. Design

### 3.1 Unit 1 — `lib/messages/__internal__/parseWarningCodeSites.ts (new)`

Sits beside the existing generator internals `walkSourceFiles.ts` and `stripLogEmissionCalls.ts` in the same directory, which both the generator script and tests already import (`scripts/extract-internal-code-enums.ts:5-6`).

```ts
export type ParseWarningCodeSite = {
  code: string;
  file: string;   // repo-relative
  line: number;
  via: "literal" | "const" | "factory" | "union";
};

export type UnresolvedCodeSite = { file: string; line: number; why: string };

export function collectParseWarningCodeSites(): {
  sites: ParseWarningCodeSite[];
  unresolved: UnresolvedCodeSite[];
};
```

**Program construction.** A ts-morph `Project` over the repo `tsconfig.json`. Unlike the shallow `noResolve: true` program at `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:165-178`, this one needs full cross-file resolution — the `ParseWarning` type is imported from `lib/parser/types.ts` into every emitter.

**Files scanned.** Every source file in the program except: anything outside the repo root, `node_modules`, any `__generated__` directory, `tests/**`, and `lib/dev/attentionScenarios/**`. The last exclusion is the §1.1 fixture-tree decision.

**No roots list exists.** The scanned set is "the TypeScript program," so a new emitter in a directory nobody thought of is covered by construction. This is the property root-widening cannot have.

### 3.2 Unit 2 — generator change

`scripts/extract-internal-code-enums.ts` replaces its `parse_warnings.code` block (`scripts/extract-internal-code-enums.ts:70-74`) with a call to `collectParseWarningCodeSites()`, adding each returned `code` under provenance `"parse_warnings.code"`. The other three bucket blocks (`scripts/extract-internal-code-enums.ts:76-112`) are untouched, as are `readFiles`, `addCodeLiteralsFromSource`, and the render/write functions.

Cost: `pnpm gen:internal-code-enums` (`package.json`) gains ~2.1 s. The same script is a prerequisite of `pnpm test:audit:x2-no-raw-codes`.

### 3.3 Recognition rules

**Candidate pre-filter (syntactic, cheap).** An object literal is a candidate when it has an own property named `code` AND either (own `severity` AND own `message`) or a spread element. Sound because `severity`, `code`, and `message` are all required on `ParseWarning` (`lib/parser/types.ts:67-71`), so anything assignable must supply all three directly or through a spread. Measured: 118 candidates out of the whole program, which is what keeps the pass at ~2 s.

**Membership test.** `checker.isTypeAssignableTo(literalType, parseWarningType)`. Assignability rather than contextual-type name matching, because the decisive real-world site has no contextual type at all:

```ts
// lib/parser/blocks/crew.ts:417-424 - bare const, no annotation
const tripleAsteriskWarning = {
  severity: "warn" as const,
  code: "UNKNOWN_DAY_RESTRICTION",
  ...
};
```

A contextual-type approach silently drops `UNKNOWN_DAY_RESTRICTION`; assignability recovers it. The same fix recovers `PULL_SHEET_ON_ARCHIVED_TAB`, whose emit is an arrow-returned literal inside `.map()` (`lib/sync/pullSheetOverride.ts:118-128`).

**Resolution of the `code` value**, in order. `as const` / `as T` wrappers are unwrapped before each test.

| # | Shape | Rule | Live example |
| --- | --- | --- | --- |
| 1 | `code: "LITERAL"` | record the literal | `lib/sync/pullSheetOverride.ts:123` |
| 2 | `code: IDENT` | resolve the symbol, following import aliases, to a `const X = "LITERAL"` declaration | `BLOCK_DISAPPEARED` at `lib/parser/warnings.ts:67`, used at `lib/sync/blockDisappearance.ts:79` |
| 3 | shorthand `code`, where `code` is a parameter whose declared type is a **string-literal union** (or a single string literal) | enumerate the union members — the type IS the universe, and no call site needs inspecting | `reelWarning(code: ReelWarningCode)` at `lib/sync/phase2.ts:337-339`, union at `lib/sync/verifyReelOnApply.ts:17-20` |
| 4 | shorthand `code`, where `code` is a `string`-typed parameter | resolve the enclosing function's references; record every call site passing a string literal at that parameter index | `warn` at `lib/sync/enrichAgenda.ts:45-47`; `warning` at `lib/sync/applyStaged.ts:1017-1019` |
| 5 | spread present, no own `code` | **propagation, not emission** — skip without recording | `lib/parser/blocks/crew.ts:380-390` re-stamps `blockRef` onto an existing warning |
| — | anything else | push to `unresolved` | none at `6a6ea124f` |

Rule 3 precedes rule 4 deliberately: when a parameter is union-typed, the type enumerates the universe exhaustively, whereas call sites enumerate only what is currently called. `reelWarning`'s single call site passes `reel.warningCode` dynamically (`lib/sync/phase2.ts:385`), so rule 4 alone would record nothing and report an unresolved site; rule 3 records all three members.

### 3.4 Unit 3 — guard test `tests/messages/_metaParseWarningCodeSites.test.ts (new)`

Runs the same collector the generator runs, so the two can never disagree about what a parse-warning code is. Three assertions:

1. **Regen-forgotten.** Every recognized code appears in the committed `lib/messages/__generated__/internal-code-enums.ts` with a source containing `parse_warnings.code`. Catches an emitter landing without `pnpm gen:internal-code-enums`.
2. **New shape.** `unresolved` is empty. Catches a `ParseWarning` construction whose `code` the four rules cannot resolve — the drift the backlog row asked for a guard against, generalized from "file outside the scanned roots" (which no longer exists as a concept) to "shape outside the model."
3. **Stale exemption.** Every entry in the exemption list (§4.3) still matches a live site. An exemption that no longer applies fails rather than lingering.

The test is a structural meta-test in the established style (registry + filesystem-walked discovery, so a new surface fails by default) — the same posture as `tests/auth/_metaInfraContract.test.ts` and `tests/log/_metaMutationSurfaceObservability.test.ts` per AGENTS.md invariants 9 and 10.

### 3.5 Unit 4 — delete the residue

- `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`) deleted, along with the explanatory comment block at `lib/dev/attentionScenarios/tier1.ts:114-129` that describes the union mechanism, which is replaced by a short note pointing at the recognizer.
- `warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:138-143`) becomes the generated filter alone, still sorted.
- The residue assertions at `tests/dev/attentionScenariosWarnings.test.ts:36-38` are deleted with it. The surrounding test that every generated `parse_warnings.code` entry appears in `warningCodes()` stays.

---

## 4. Consequences

### 4.1 Codes entering the bucket (10)

`DIAGRAMS_TAB_MISSING`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `DIAGRAMS_EMBEDDED_NONE_FOUND`, `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE`, `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`, `EMBEDDED_ASSET_DRIFTED`, `LINKED_FOLDER_OVERFLOW_TRUNCATED`, `REEL_DRIFTED`, `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO`.

All ten are real parse warnings the gallery is blind to today. **All ten already carry a `lib/messages/catalog.ts` row and a §12.4 entry in `lib/messages/__generated__/spec-codes.ts`** — verified by probe — so the three-way §12.4 lockstep (AGENTS.md cross-cutting discipline) does **not** apply to this change. No spec prose edit, no `pnpm gen:spec-codes` run, no catalog row is required.

### 4.2 Code leaving the bucket (1)

`VERSION_AMBIGUOUS`, per the §1.1 ratification. It remains in the manifest under its other provenances; only its `parse_warnings.code` attribution is dropped. Two consequences to verify at implementation: it stops producing a gallery scenario, and `isParseWarningCode` (`lib/observe/query/serializeWarning.ts:26-30`) starts returning `false` for it.

### 4.3 Exemptions

The recognizer needs no exemption entries at `6a6ea124f` — `unresolved` is empty. The mechanism ships anyway, because rule 5 (propagation) and the fixture-tree exclusion are policy choices that a future reader must be able to see and challenge:

- A module-level `PARSE_WARNING_SITE_EXEMPTIONS` array in the collector, each row `{ file, reason }`, in the style of the `// not-subject-to-meta:` convention (AGENTS.md invariant 9).
- Assertion 3 of §3.4 keeps the list honest.

The two dynamic-by-design consumers that motivated the fixture-tree exclusion — `buildWarning` (`lib/dev/attentionScenarios/tier1.ts:152`) and `crewScopedWarning` (`lib/dev/attentionScenarios/tier2.ts:590`) — are covered by the directory exclusion, not by individual rows.

### 4.4 Blast radius to verify

| Surface | Why it moves | Check |
| --- | --- | --- |
| `tests/dev/attentionScenariosWarnings.test.ts` | scenario count changes 48 → 57 | full suite |
| `tests/observe/serializeWarning.test.ts` | bucket membership changes for `VERSION_AMBIGUOUS` and the 10 additions | full suite |
| `tests/cross-cutting/no-raw-codes.test.ts` (x2) | consumes the regenerated manifest | `pnpm test:audit:x2-no-raw-codes` |
| `tests/cross-cutting/codes.test.ts` (x1 catalog parity) | unaffected — no §12.4 prose or catalog row changes (§4.1) | full suite |
| `lib/messages/__generated__/internal-code-enums.ts` | regenerated; must be committed in the same commit as the generator change | `pnpm gen:internal-code-enums` + `git diff --exit-code` |

No DB, no migration, no RPC, no advisory-lock path, no UI surface. AGENTS.md invariant 8 (impeccable dual gate) does not apply — closeout marker will read `impeccable-gate: N/A — no UI surface`.

---

## 5. Documented limits

The recognizer is a static analyzer over an open input space; the acceptance posture is the preparedness-audit standard — every emitter is recognized or **signaled**, never silently dropped (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`). These are the known boundaries, each of which surfaces as a guard failure rather than a silent miss:

1. **Two-hop factories.** A helper that calls another helper which builds the literal is unresolved at hop 2. It fails assertion 2, loudly. Deliberately not modeled: no such site exists at `6a6ea124f`, and speculative depth is the tightening this project's round-economy retrospective warns against.
2. **Computed codes.** `code: \`PREFIX_${x}\`` or a `code` read from a map is unresolvable in principle. It fails assertion 2 and forces an explicit decision — an exemption row or a refactor to a union-typed parameter (rule 3) — rather than a silent gap.
3. **Rule 4 records only what is called.** A `string`-typed factory parameter enumerates its literal call sites, so a code that exists only as an uncalled possibility is not recorded. Rule 3 is the escape hatch: type the parameter as a union and the type becomes the enumeration.
4. **Dynamic-code consumers must be excluded by directory or exemption**, or their fixtures mint codes. Today that is the `lib/dev/attentionScenarios/**` tree; a second such consumer elsewhere would need its own row.
5. **The guard is only as fresh as the committed manifest.** Assertion 1 compares against the checked-in generated file, so it catches "forgot to regenerate" but cannot catch "regenerated against a dirty tree." Existing CI regeneration already covers that.

Limit 1 and limit 2 are fenced in both directions on purpose: they are *not* defects to be pre-solved, and a reviewer proposing to model them must show a live escaping site, per the finding-admissibility contract in AGENTS.md.

---

## 6. Success criteria

- `pnpm gen:internal-code-enums` produces a manifest whose `parse_warnings.code` bucket holds exactly the 57 recognized codes.
- `EXTRA_WARNING_CODES` no longer exists in the tree.
- `tests/messages/_metaParseWarningCodeSites.test.ts (new)` passes, and fails when a synthetic unresolvable emitter is planted (RED proof per AGENTS.md invariant 1).
- Full suite green; real CI green.
- `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` graduates to `BACKLOG-archive.md` with the superseded-prescription and Effort S→M corrections recorded.
