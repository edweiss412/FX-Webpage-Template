# Parse-warning code recognizer — design

**Date:** 2026-08-03
**Closes:** `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` (BACKLOG.md)
**Class:** generated-registry completeness
**Surface:** generator script + one new lib-internal module + one structural guard test + one gallery filter fix. No UI, no DB, no migration, no advisory-lock path.

<!-- spec-lint: not-ui — no rendered surface; the components/ and app/ paths cited here are probe evidence about existing code, not files this change touches -->

**Result as shipped: 58 codes, 77 sites, 0 unresolved.** A whole-diff cross-model review after implementation found the recognizer was missing a live persisted code and several escaping mutants; §2.6 records what changed and why the numbers below moved.

**Revision history:** R1 returned NEEDS-ATTENTION (4 findings) and R2 returned NEEDS-ATTENTION (3 HIGH). All seven were confirmed by independent probe and repaired. Two of them overturned claims this document made: R1 finding 1 inverted §2.3's central claim, and R2 finding 2 refuted the assertion-5 clean-tree claim. §2.5 records both, plus the M5 concession forced by the plan's R2.

---

## 1. Problem

`extractInternalCodeEnums` builds the `parse_warnings.code` bucket of the generated internal-code manifest by reading every file under `lib/parser`, filtering them by the content regex `/\bParseWarning\b|\bwarnings\b|hardErrors/`, and harvesting `code: "LITERAL"` matches (`scripts/extract-internal-code-enums.ts:70-74`).

Because no runtime module enumerates the parse-warning universe, the attention-scenario gallery unions that generated bucket with a hand-maintained residue, `EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`), re-joined in `warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:138-143`).

The bucket has two live readers, and **they disagree about what membership means** — which turns out to be load-bearing:

| Reader | Predicate | Bucket size today |
| --- | --- | --- |
| `lib/dev/attentionScenarios/tier1.ts:140` | `v.source === "parse_warnings.code"` (strict) | 43 |
| `lib/observe/query/serializeWarning.ts:29` | `entry.source.includes("parse_warnings.code")` | 46 |

The three codes in the gap carry a comma-joined multi-provenance string and are therefore invisible to the gallery but visible to the observe CLI: `MI-1_VERSION_DETECTION_FAILED`, `PULL_SHEET_ON_ARCHIVED_TAB`, `VERSION_AMBIGUOUS`.

---

### 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
| --- | --- |
| The backlog row's literal prescription ("widen the scan roots (and the content predicate…)") is **superseded by this spec**, on probe evidence in §2. Root-widening is rejected; type-aware extraction replaces the roots list entirely. | §2.1, §2.2; row text at `BACKLOG.md` under `## BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` |
| The row's **Effort: S** estimate is superseded by **M**. | §2.3 |
| Only the `parse_warnings.code` bucket changes. The other three buckets keep their existing root+regex extraction verbatim (`scripts/extract-internal-code-enums.ts:76-112`). | §3.2 |
| **`warningCodes()` moves from strict equality to `.includes(...)`**, matching the observe CLI. This is a required part of the change, not an incidental cleanup: without it, deleting the residue removes live gallery scenarios (§2.3). | §3.7 |
| `VERSION_AMBIGUOUS` and `MI-1_VERSION_DETECTION_FAILED` losing their `parse_warnings.code` attribution is a **correction, not a regression**. Both are `ParseError`-shaped (`lib/parser/types.ts:118`), constructed as `{code, message}` at `lib/parser/index.ts:550`, `lib/parser/index.ts:559`, and `lib/parser/index.ts:578`, and are in the bucket today only because the current content predicate matches the token `hardErrors`. | §4.2 |
| `ParseWarning["code"]` stays `string` (`lib/parser/types.ts:69`). Union-narrowing was probed and rejected: `buildWarning(code: string)` (`lib/dev/attentionScenarios/tier1.ts:152`), `crewScopedWarning(code: string)` (`lib/dev/attentionScenarios/tier2.ts:590`), and DB-read paths carrying an unconstrained string (`lib/admin/needsAttention.ts:117`). | §4.4 |
| `GAP_CLASSES` (`lib/parser/dataGaps.ts:30`) is **not** the warning universe. Probed: it misses 17 recognizer codes including every `*_AUTOCORRECTED` code. | §2.2 |
| The gallery fixture tree `lib/dev/attentionScenarios/**` is excluded from the scan, and **the exclusion is a property of recorded SITES, not of the file walk** — see §3.1, where the factory rule would otherwise leak. | §3.1, §4.3 |
| The guard fails on an **unrecognized construction**, not merely on a missing code. | §3.4, §5 |
| The **scoped-`Project` optimization is rejected.** Globbing `lib|app|components|scripts` yields byte-identical output ~30% faster, but silently drops twelve root-level source files including the live Next.js entry point `instrumentation.ts` — reintroducing the maintained-list silent miss this design exists to remove. | §2.5 |
| **No exemption mechanism ships.** Two schemas were tried and both admitted an escaping mutant; the list would be empty at ship time regardless. Adding an exemption is a deliberate guard code change. | §2.5 |
| The guard carries **one hand-maintained anchor**, `EXPECTED_PARSE_WARNING_CODES`, because no check derived from the collector's own artifact can detect the collector narrowing. This is an accepted trade, stated plainly, not an oversight. | §3.5 |

---

## 2. Probe findings (draft-time evidence)

Per the probe-before-argue rule for detector surfaces (`docs/agents/spec-self-review.md:23`), every claim below was settled by running code against the tree at `origin/main` (`6a6ea124f`).

### 2.1 Root-widening over-selects

The current content predicate over roots `["lib", "app", "components", "scripts"]` grows the bucket from 46 to 66. The 20 extra codes are admin-alert, report, and gallery-fixture codes — `SHEET_UNAVAILABLE`, `IDEMPOTENCY_IN_FLIGHT`, `MI11_TARGET_MOVED`, `UNDO_NOT_FOUND`, `REPORT_HORIZON_EXPIRED` among them. Nothing textual separates `code: "X"` on a `ParseWarning` from `code: "X"` on an admin alert in the same file (`lib/sync/runScheduledCronSync.ts` emits both).

### 2.2 Root-widening also under-selects

Three of the four residue rows stay missed at any root, because the emit site is a factory call, not a `code:` property:

```ts
// lib/sync/enrichAgenda.ts:45-47
function warn(code: string, message: string): ParseWarning {
  return { severity: "warn", code, message };
}
```

`AGENDA_SCHEDULE_LOW_CONFIDENCE` and `AGENDA_SCHEDULE_TIME_ADJUSTED` reach that helper as *arguments* (`lib/sync/enrichAgenda.ts:425`, `lib/sync/enrichAgenda.ts:433`).

`GAP_CLASSES` was evaluated as a ready-made registry and rejected: it misses 17 recognizer codes including all five `*_AUTOCORRECTED` codes and every `DIAGRAMS_*` code.

### 2.3 The residue is fully load-bearing — correcting this document's original claim

This spec originally asserted that `PULL_SHEET_ON_ARCHIVED_TAB`'s residue row had "already rotted to a no-op," on the evidence that the code appears in the generated manifest at `lib/messages/__generated__/internal-code-enums.ts:224`. **That was wrong, and backwards.** Manifest membership is not gallery membership: the entry's source is the comma-joined `"parse_warnings.code,pending_ingestions.last_error_code"`, which the gallery's *strict equality* filter rejects. The residue row is the only thing putting that code in the gallery.

Probed:

```
strict-equality bucket: 43   residue: 4   overlap: []   => warningCodes() today: 47
```

Zero overlap. All four residue rows are load-bearing, none has rotted, and the original claim inverted the finding. Deleting the residue while keeping strict equality would **remove** a live gallery scenario, not shrink a no-op. §3.7 is the fix that makes the deletion safe.

The row remains worth closing — the residue is hand-maintained and the generator cannot see three of its four codes at any root — but the justification is completeness, not rot.

### 2.4 Type-aware extraction converges

A ts-morph prototype using assignability to `ParseWarning` plus the resolution rules in §3.3, over 887 source files:

| Metric | Value |
| --- | --- |
| Candidate object literals (syntactic pre-filter) | 118 |
| Candidates accepted by assignability | 56 |
| Recognized emit sites (at spec time; **77** as shipped) | 73 |
| Distinct codes (at spec time; **58** as shipped, see §2.6) | **57** |
| Unresolved sites | **0** |
| Wall clock, AST walk only | ~4.5 s |
| Wall clock, end to end incl. program construction | **~19 s** (see §5 limit 8) |

Site provenance: 50 literal, 19 factory-argument, 3 union-parameter, 1 imported const.

Every one of the 62 rejected candidates was inspected for a false negative. All are genuine non-warnings: `lib/log/logger.ts:58` telemetry records, the eleven `lib/specLint/**` finding objects, admin-alert emits, route response bodies, and DB-read deserialization at `lib/observe/query/serializeWarning.ts:37` and `lib/observe/query/serializeWarning.ts:43` (rejected because `severity: string` is not `"info" | "warn"`). Two spread-plus-`code` cases were checked specifically — `lib/sync/runOnboardingScan.ts:669` and `lib/sync/syncLog.ts:31` — and both write a diagnostic **payload row** into the `sync_log.parse_warnings` jsonb column, where `entry.code` is a sync-log status, not a warning code. Correct rejections.

### 2.5 Claims this document got wrong, and what refuted them

Recorded so no later round re-derives them, per the AGENTS.md triage-record rule.

| Claim | Refutation |
| --- | --- |
| "The residue has already rotted to a no-op" (original §2.3) | Inverted. The gallery filters on strict equality, so a multi-provenance entry is invisible to it; the residue row was the only thing supplying that code. Probed: strict 43, residue 4, overlap 0, gallery 47. |
| "No production file imports from `lib/dev/attentionScenarios/`" | False — **ten** do (`app/admin/dev/page.tsx:45`, `app/admin/dev/actions.ts:89`, `app/admin/dev/attention-gallery/buildSwitcherScenarios.ts:23`, `lib/dev/deriveScenarioAttention.ts:20`, `lib/dev/buildScenarioModalData.ts:23`, `lib/dev/materialize/run.ts:39`, `lib/dev/materialize/plan.ts:16`, `lib/dev/galleryActionScripts.ts:23`, `lib/dev/galleryModalTypes.ts:17`, `lib/dev/publishedModalFixture.ts:26`). My probe searched for factory *call sites*, not module imports. Every one imports a type or scenario data; **none imports a warning factory**, which is the narrower assertion that actually closes the mirror class. |
| "The recognizer costs ~2.1 s" | Off by ~9x. That timer started after `new Project()` returned. End-to-end is ~19 s: ~11.7 s program construction, ~2.8 s checker warm-up, ~4.5 s walk, over a 2882-file program. |
| "10 codes enter the bucket" | 13 enter the manifest bucket (46 → 57, with 2 leaving). The 10 figure counted additions against the gallery's *union* of manifest and residue, not against the bucket. The gallery separately gains 10 net scenarios, 47 → 57. Both numbers are real and §4.1 now labels them distinctly. |
| "Set equality closes M5" | It does not. The generator and the guard share the collector, so a narrowed collector plus its normally-regenerated manifest stay equal and both pass. This is the cost of the shared-recognizer design, and §3.6 is the independent anchor it forces. |

### 2.6 What the post-implementation review changed

Two whole-diff cross-model rounds ran after the tasks landed. Both returned BLOCKING, and both were right. Recorded here because the numbers in §2.4 and §4 are spec-time values that the repairs moved.

| Finding | Consequence |
| --- | --- |
| A literal factory call site masked its dynamic siblings — rule 4 only reported "unresolved" when a factory had ZERO literal calls | `EMBEDDED_RECOVERY_REQUIRES_RESTAGE` reached `shows_internal.parse_warnings` with no provenance and no gallery scenario. Call sites are now judged **per site**; const-identifier and union-typed arguments resolve. **+1 code** |
| The M8 spread discriminator asked whether ANY spread was a warning | `{...priorWarning, ...codePart}` skipped as propagation while overwriting `code`. Now positional, and "can carry `code`" includes index signatures and `any`, not just a named property |
| `resolveStringConst` accepted any variable declaration | a `let` rebound after its initializer was certified at its initial value. Now requires `const` |
| Factory references reached only through `getParent()` | namespace-import and aliased calls were invisible. Now resolved through the nearest enclosing call, with the reference confirmed in callee position |
| Assertion 5 shelled out to `rg` | it scanned Markdown (reading a historical plan snippet as a production import) and its `\|\| true` turned any shell/PATH failure into a silent pass. Now computed in-process from the TypeScript program |

**Shipped totals: 58 codes, 77 sites, 0 unresolved, 0 non-literal constructions.** Mutation families M1-M9.

---

## 3. Design

### 3.1 Unit 1 — `lib/messages/__internal__/parseWarningCodeSites.ts (new)`

Sits beside the existing generator internals `lib/messages/__internal__/walkSourceFiles.ts` and `lib/messages/__internal__/stripLogEmissionCalls.ts`, which the generator already imports (`scripts/extract-internal-code-enums.ts:5-6`).

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

**Program construction.** A ts-morph `Project` over the repo `tsconfig.json`. Unlike the shallow `noResolve: true` program at `tests/components/admin/showpage/_metaSharedHelperAdoption.test.ts:165-178`, this one needs full cross-file resolution.

**Scanned-file predicate.** Inside repo root; not `node_modules`; not any `__generated__` segment; not `tests/`; not `lib/dev/attentionScenarios/`.

**The predicate governs recorded SITES, not just the walk.** `tsconfig.json` includes `**/*.ts`, so `tests/**` is in the program, and the factory rule finds call sites via `findReferencesAsNodes()`, which searches the whole program. Applying the filter only to the walk leaks. Demonstrated with a live escaping mutant: exporting the factory at `lib/sync/enrichAgenda.ts:45` and calling it from a test with a literal minted the code into the production manifest —

```
total codes: 58   PLANTED_FROM_TEST_FILE minted? true
sites from tests/: [{"code":"PLANTED_FROM_TEST_FILE","file":"tests/messages/__sf4Plant.test.ts","line":6,"via":"factory:warn"}]
```

The precondition is that the factory be **exported**. All four factories today are module-private, so the leak is structurally unreachable at `6a6ea124f` — but exporting a helper is an ordinary refactor with nothing to signal the regression. A companion mutant that defines its own local factory inside the test file does **not** escape (the factory body is the candidate literal, and it lives in the excluded file), which is why the exported-factory shape is the one the guard must pin.

**No roots list exists.** The scanned set is the TypeScript program minus the predicate, so a new emitter in an unanticipated directory is covered by construction.

### 3.2 Unit 2 — generator change

`scripts/extract-internal-code-enums.ts` replaces its `parse_warnings.code` block (`scripts/extract-internal-code-enums.ts:70-74`) with a call to `collectParseWarningCodeSites()`. The other three bucket blocks (`scripts/extract-internal-code-enums.ts:76-112`), `readFiles`, `addCodeLiteralsFromSource`, and the render/write path are untouched. Cost: `pnpm gen:internal-code-enums` gains ~19 s end to end (§5 limit 8).

### 3.3 Recognition rules

**Candidate pre-filter (syntactic, cheap).** An object literal is a candidate when it has an own property named `code` AND either (own `severity` AND own `message`) or a spread element. Sound for object literals because `severity`, `code`, and `message` are all required on `ParseWarning` (`lib/parser/types.ts:67-71`). Measured: 118 candidates program-wide, which is what keeps the pass at ~2 s.

**Spread without an own `code` is two different things, and the pre-filter must tell them apart** (R2 finding 1). A literal may lack an own `code` because it *propagates* an existing warning, or because the code arrives through a *composition* fragment:

```ts
// propagation - skip (lib/parser/blocks/crew.ts:380-390 re-stamps blockRef)
return { ...w, blockRef: crewBlockRef };

// composition - MUST NOT be skipped: neither literal is a candidate under a naive rule,
// so the code would be silently missed with nothing reaching `unresolved`
const codePart = { code: "MUTANT_SPREAD_CODE" };
const warning: ParseWarning = { ...codePart, severity: "warn", message: "x" };
```

The discriminator is whether **any spread source is itself assignable to `ParseWarning`**. If one is, the literal propagates an existing warning and is skipped. If none is, the code entered from a non-warning fragment and the literal goes to `unresolved`. Probed: the composition mutant is signaled (`why: "code composed via a non-ParseWarning spread"`) while the live `lib/parser/blocks/crew.ts` propagation site stays clean, 0 unresolved tree-wide.

**Membership test.** `checker.isTypeAssignableTo(literalType, parseWarningType)` — assignability, not contextual-type name matching, because the decisive site has no contextual type:

```ts
// lib/parser/blocks/crew.ts:417-424 - bare const, no annotation
const tripleAsteriskWarning = {
  severity: "warn" as const,
  code: "UNKNOWN_DAY_RESTRICTION",
  ...
};
```

Name matching silently drops `UNKNOWN_DAY_RESTRICTION`; assignability recovers it, and also recovers `PULL_SHEET_ON_ARCHIVED_TAB`, whose emit is an arrow-returned literal inside `.map()` (`lib/sync/pullSheetOverride.ts:118-128`).

**Resolution of the `code` value**, in order. `as const` / `as T` wrappers are unwrapped before each test.

| # | Shape | Rule | Live example |
| --- | --- | --- | --- |
| 1 | `code: "LITERAL"` | record the literal | `lib/sync/pullSheetOverride.ts:123` |
| 2 | `code: IDENT` | resolve the symbol, following import aliases, to a `const X = "LITERAL"` | `BLOCK_DISAPPEARED` (`lib/parser/warnings.ts:67`), used at `lib/sync/blockDisappearance.ts:79` |
| 3 | shorthand `code`, parameter typed as a **string-literal union** (or single literal) | enumerate the union members; the type IS the universe | `reelWarning(code: ReelWarningCode)` (`lib/sync/phase2.ts:337-339`), union at `lib/sync/verifyReelOnApply.ts:17-20` |
| 4 | shorthand `code`, `string`-typed parameter | resolve the function's references; record every call site passing a literal, **subject to the scanned-file predicate** | `warn` (`lib/sync/enrichAgenda.ts:45-47`); `warning` (`lib/sync/applyStaged.ts:1017-1019`) |
| — | anything else | push to `unresolved` | none at `6a6ea124f` |

Rule 3 precedes rule 4 deliberately: a union-typed parameter enumerates the universe exhaustively, whereas call sites enumerate only what is currently called. `reelWarning`'s single call site passes `reel.warningCode` dynamically (`lib/sync/phase2.ts:385`), so rule 4 alone records nothing and reports an unresolved site; rule 3 records all three members.

### 3.4 Unit 3 — guard test `tests/messages/_metaParseWarningCodeSites.test.ts (new)`

Runs the same collector the generator runs. Assertions:

0. **Provenance sentinels.** Three named codes of distinct provenance resolve through their intended rule (`SECTION_HEADER_NO_FIELDS` literal, `BLOCK_DISAPPEARED` const, `REEL_DRIFTED` union). A fast canary that names which rule broke.
1. **Manifest agreement.** The recognized code set equals the set the committed manifest attributes to `parse_warnings.code`. Catches a stale manifest in both directions — a forgotten regeneration, and an additive implementation that retains the old regex scan.
2. **Unrecognized construction.** `unresolved` is empty.
3. **Golden code set.** See §3.5 — the independent oracle, and the only assertion that can detect the collector itself narrowing.
4. **Non-object-literal construction.** See §3.6.
5. **Mirror-class closure.** No file outside `tests/**` and `lib/dev/attentionScenarios/**` imports a **warning-producing factory** (`buildWarning`, `crewScopedWarning`) from the fixture tree. R2 finding 2 refuted the broader form of this assertion: ten production files legitimately import types and scenario data from that tree, so an all-imports ban is unpassable. The narrow form closes the actual mirror class — a factory whose body sits in an excluded tree would have its production call sites silently dropped — and passes today.

### 3.5 The golden code set, and why the guard needs an independent anchor

The design's central property is that the generator and the guard call the same collector, so they cannot disagree. That property is also a blind spot. If the collector narrows — a tightened predicate, a broken glob — and the manifest is regenerated in the same commit as the plan requires, **both shrink together and every artifact-derived assertion stays green**. Probed: excluding one file drops the recognized set 57 → 51, the regenerated manifest also reports 51, and set equality passes.

An emitter-**file** anchor was tried first and is **rejected**: sixteen of the twenty-two contributing files hold more than one site, so a narrowing that drops sites *within* files leaves the file set intact. Probed with a pre-filter tightened to require `blockRef`:

```
within-file narrowing: codes 35 (baseline 57), sites 44 (baseline 73), unresolved 0
```

Twenty-two of fifty-seven codes vanish silently, and a file-set anchor never fires.

The anchor is therefore the **code set itself** — an ordinary golden-file snapshot, committed in the guard and independent of anything the collector produces:

```ts
// The parse-warning universe as of this commit. Changing it is a deliberate act:
// a new emitter adds a line, a removed one deletes a line, and the diff is reviewable.
export const EXPECTED_PARSE_WARNING_CODES = [ /* 57 entries */ ] as const;
```

Assertion 3 compares the recognized set to it by equality. Any narrowing that loses a code fails regardless of what the manifest says, because the pinned list does not move when the collector does.

**This is a trade, and it should be read as one.** The change deletes a hand-maintained list of four codes and adds a hand-maintained list of fifty-seven. The justification is not size — it is failure mode and visibility. The residue rotted *silently*: a code absorbed into the generated bucket left a dead row that no test could see, which is how three of its four rows came to be load-bearing without anyone noticing. A golden set cannot rot silently: it fails loud in both directions, its diff is the review artifact, and updating it is one line with a reviewer looking at it. That is the difference between a list that decays and a list that is maintained.

### 3.6 Non-object-literal construction (R1 finding 2)

The pre-filter walks object literals. Two type-correct, runtime-valid ways to produce a `ParseWarning` produce **zero candidates**, and therefore never reach `unresolved` — a silent miss, which defeats the "recognized or signaled" bound:

- `Object.assign({}, base, { code: "X" })` composition
- a `class` whose instances satisfy `ParseWarning`

Both were demonstrated live by R1 with clean type diagnostics and valid runtime warnings. Neither exists in the tree today. Rather than model them (speculative depth is the tightening the round-economy retrospective warns against), the guard **detects and signals** them: assertion 4 fails when the program contains a class whose instance type is assignable to `ParseWarning`, or an `Object.assign` call whose result type is assignable to `ParseWarning`. That restores the bound for both demonstrated families at a fixed cost, and leaves modelling to whoever actually introduces one.

**`any` and `unknown` must be rejected before the assignability test.** `any` is assignable to everything, and `Object.assign(Object.create(null), {…})` at `components/admin/review/PublishedArchivedTabOffer.tsx:26` has result type `any` — so without the exclusion assertion 4 fails on existing production code before any mutant is planted. R2 finding 3 caught this against the spec text; probed clean both with and without planted mutants once the exclusion is in place. A syntactic member pre-filter on classes (skip unless the class declares `severity`, `code`, and `message`) avoids resolving the instance type of every unrelated class in the program.

### 3.7 Unit 4 — the gallery filter (required, not incidental)

`warningCodes()` (`lib/dev/attentionScenarios/tier1.ts:138-143`) moves from `v.source === "parse_warnings.code"` to `v.source.includes("parse_warnings.code")`, matching `lib/observe/query/serializeWarning.ts:29`. Per §2.3 this is what makes the residue deletion safe: three codes carry multi-provenance strings today and would otherwise vanish from the gallery. It also removes the standing disagreement between the bucket's two readers.

### 3.8 Unit 5 — delete the residue

`EXTRA_WARNING_CODES` (`lib/dev/attentionScenarios/tier1.ts:131-136`) and its explanatory block (`lib/dev/attentionScenarios/tier1.ts:114-129`) are deleted, along with the residue assertions at `tests/dev/attentionScenariosWarnings.test.ts:36-38`. The surrounding test that every generated `parse_warnings.code` entry appears in `warningCodes()` stays.

---

## 4. Consequences

### 4.1 Codes entering the bucket (13), and gallery scenarios gained (10)

`DIAGRAMS_TAB_MISSING`, `DIAGRAMS_EMBEDDED_CAP_EXCEEDED`, `DIAGRAMS_EMBEDDED_NONE_FOUND`, `DIAGRAMS_EMBEDDED_OBJECT_INACCESSIBLE`, `DIAGRAMS_EMBEDDED_REVISIONS_UNAVAILABLE`, `EMBEDDED_ASSET_DRIFTED`, `LINKED_FOLDER_OVERFLOW_TRUNCATED`, `REEL_DRIFTED`, `OPENING_REEL_PERMISSION_DENIED`, `OPENING_REEL_NOT_VIDEO`.

Plus the three codes the gallery already showed via the residue but the manifest bucket never carried: `AGENDA_SCHEDULE_LOW_CONFIDENCE`, `AGENDA_SCHEDULE_TIME_ADJUSTED`, `PULL_SHEET_OVERRIDE_CONTENT_CHANGED`. **Thirteen codes enter the manifest bucket** (46 → 57 with the two departures in §4.2); the **gallery gains ten net scenarios** (47 → 57). Both numbers are real and describe different sets — an earlier draft reported only the 10, having counted against the gallery's union of manifest and residue rather than against the bucket.

All thirteen already carry a `lib/messages/catalog.ts` row and a §12.4 entry in `lib/messages/__generated__/spec-codes.ts` — verified by probe — so the three-way §12.4 lockstep does **not** apply. No spec prose edit, no `pnpm gen:spec-codes` run, no catalog row.

### 4.2 Codes leaving the bucket (2)

`VERSION_AMBIGUOUS` and `MI-1_VERSION_DETECTION_FAILED`, per the §1.1 ratification. Both are `ParseError`-shaped `{code, message}` constructions (`lib/parser/index.ts:550`, `lib/parser/index.ts:559`, `lib/parser/index.ts:578`) that fail the candidate pre-filter for want of a `severity`. Both keep their other provenances in the manifest; only the `parse_warnings.code` attribution is dropped.

Consequences: `isParseWarningCode` (`lib/observe/query/serializeWarning.ts:26-30`) flips from `true` to `false` for both. Neither produces a gallery scenario today (both are multi-provenance, and today's gallery filter is strict), so the gallery is unaffected by their departure.

### 4.3 No exemption mechanism ships

R1 finding 4 showed a `{file, reason}` exemption schema collides file-wide. The repair to `{file, why, reason}` compared by set equality was then refuted in turn: replacing an exempted site with a different site in the same file that draws the same classifier string leaves the multiset unchanged, so the mutant escapes.

Two schemas, two escaping mutants, and an empty list at ship time. **The mechanism is dropped.** `unresolved` must simply be empty. Adding an exemption later is a deliberate change to the guard's own code — reviewable, and impossible to do by accident. This removes mutation family M4 by removing its surface rather than by defending it.

### 4.4 Blast radius to verify

| Surface | Why it moves | Check |
| --- | --- | --- |
| `lib/dev/attentionScenarios/tier1.ts` | gallery filter change (§3.7) plus residue deletion; scenario count 47 → 57 | `tests/dev/attentionScenariosWarnings.test.ts` |
| `tests/observe/serializeWarning.test.ts` | membership flips for the 13 additions and the 2 departures | full suite |
| `tests/cross-cutting/no-raw-codes.test.ts` (x2) | consumes the regenerated manifest | `pnpm test:audit:x2-no-raw-codes` |
| `tests/cross-cutting/codes.test.ts` (x1 catalog parity) | unaffected — no §12.4 or catalog change (§4.1) | full suite |
| `lib/messages/__generated__/internal-code-enums.ts` | regenerated; committed in the same commit as the generator change | `pnpm gen:internal-code-enums` + `git diff --exit-code` |

No DB, no migration, no RPC, no advisory-lock path, no UI surface. Invariant 8 does not apply: `impeccable-gate: N/A — no UI surface`.

---

## 5. Documented limits

The acceptance posture is the preparedness-audit standard — every emitter is recognized or **signaled**, never silently dropped (`docs/audits/edge-case-preparedness-audit-2026-07-04.md:92`). Known boundaries, each surfacing as a guard failure rather than a silent miss:

1. **Two-hop factories.** A helper calling another helper that builds the literal is unresolved at hop 2 — fails assertion 2. Not modelled: no such site exists at `6a6ea124f`.
2. **Computed codes.** `code: \`PREFIX_${x}\`` or a map lookup is unresolvable in principle — fails assertion 2, forcing an explicit decision rather than a silent gap.
3. **Rule 4 records only what is called.** A `string`-typed factory parameter enumerates its literal call sites, so a code existing only as an uncalled possibility is not recorded. Rule 3 is the escape hatch: type the parameter as a union.
4. **Non-object-literal construction** (`Object.assign`, class instances) is detected and signaled by assertion 4, not modelled. Adding one is a deliberate act that fails CI with a pointer to this section.
5. **Dynamic-code consumers must be excluded by directory**, or their fixtures mint codes — today `lib/dev/attentionScenarios/**`. Assertion 5 closes the mirror class that exclusion opens, narrowed to warning factories because ten production files legitimately import types and scenario data from that tree.
6. **The recognizer models the TypeScript type `ParseWarning`, not a database column.** The `sync_log.parse_warnings` jsonb column also carries diagnostic payload rows (`lib/sync/runOnboardingScan.ts:669`, `lib/sync/syncLog.ts:31`) whose `code` is a sync-log status. Those are correctly out of scope.
7. **The guard is only as fresh as the committed manifest.** Assertion 1 compares against the checked-in generated file.
8. **Cost is ~19 s per program construction**, paid once by `pnpm gen:internal-code-enums` and once by the guard test: ~11.7 s program construction, ~2.8 s checker warm-up, ~4.5 s walk, over 2882 files. The scoped-`Project` optimization that would cut this to ~13 s is rejected in §1.1 — it trades the program-wide guarantee for wall clock.
9. **The collector cannot certify its own completeness.** §3.5's `EXPECTED_PARSE_WARNING_CODES` is the one hand-maintained anchor, and it is load-bearing precisely because everything else in the guard derives from the collector. An emitter-file anchor was tried and rejected: a within-file narrowing drops 22 of 57 codes without changing the file set.

Limits 1 and 2 are fenced in both directions on purpose: they are not defects to pre-solve, and a reviewer proposing to model them must show a live escaping site per the finding-admissibility contract in AGENTS.md.

---

## 6. Success criteria

- `pnpm gen:internal-code-enums` produces a manifest whose `parse_warnings.code` bucket holds exactly the 57 recognized codes.
- `warningCodes()` returns 57 (up from 47), with no code lost relative to today's gallery.
- `EXTRA_WARNING_CODES` no longer exists in the tree.
- `tests/messages/_metaParseWarningCodeSites.test.ts (new)` passes, and fails when each of the planted mutants is present: an unresolvable `code` shape, an exported-factory call from a test file, an `Object.assign` composition, and a `ParseWarning` class.
- Full suite green; real CI green.
- `BL-INTERNAL-CODE-ENUM-SCAN-WIDEN` graduates to `BACKLOG-archive.md` recording the superseded prescription, the Effort S→M correction, and the §2.3 inversion.
