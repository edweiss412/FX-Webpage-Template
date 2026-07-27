# Shared comment-stripper for structural guards — design

**Date:** 2026-07-26 · **Backlog:** `BL-STRIPCOMMENTS-DUPLICATED-AND-FAIL-OPEN` (BACKLOG.md:904) · **Branch:** `refactor/stripcomments-shared`

<!-- spec-lint: not-ui — tests-only refactor; app/admin/layout.tsx appears only as the measured-impact example, no UI file changes -->

## 1. Problem

Structural guards across the test suite strip comments before scanning source. The R1 adversarial sweep (2026-07-26) found the duplication is far wider than the backlog row's 17: **41 inventory rows across 39 files** in `tests/` (§2 — named functions, inline `.replace()` idioms, SQL and CSS variants). The dominant JS/TS form is the naive pair

```ts
src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
```

which lets **any** `/*` open a block span — including one inside a string literal or a path. Measured impact (BACKLOG.md:910): the JSDoc line `* Wraps every route under /admin/*` in `app/admin/layout.tsx` opens a span running to the next `*/` far below, so all six live `className` sites in that file vanish from any scan using the naive helper — the guard silently reports nothing. That is a fail-open structural guard: it stays green while blind.

One copy was already fixed (`tests/styles/_classScanUtils.ts:60`, line-based heuristic, destruct-thumb-order PR). The repo's strongest implementation — a TypeScript-parser-backed stripper that cannot be fooled by strings, template literals, regex literals, or JSX text — sits unshared inside `tests/styles/_newTabScan.ts` (`commentRanges` at `tests/styles/_newTabScan.ts:2747`, `stripCommentsSafely` at `tests/styles/_newTabScan.ts:2800`). It carries one latent defect this spec fixes on promotion: it hardcodes `ts.ScriptKind.TSX` (`tests/styles/_newTabScan.ts:2748`), which mis-parses plain-`.ts` generic arrow syntax — `const f = <T>(x: T) => x; // comment` is read as JSX, everything after `<T>` is classified protected `JsxText`, and zero comment ranges return. That syntax exists in live scanned input at `lib/sync/attachWarningAnchors.ts:40` (R1 F2, probe-verified).

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
|---|---|
| Approach: promote the **TS-parser** implementation (`commentRanges`/`stripCommentsSafely`), NOT the line-based `_classScanUtils` heuristic, as the canonical JS/TS stripper. | Owner-approved in the 2026-07-26 brainstorming session (this spec's branch); backlog's "promote the corrected implementation" (BACKLOG.md:914) is superseded on the *which implementation* point only — the strictly stronger one already in-tree wins. |
| Packaging: **one PR**; one commit per Tier-A/B row (named-function strippers); Tier-C inline idioms grouped one commit per file. | Owner ratified one-PR/per-caller-commits for the original 16; the R1 inventory expansion keeps that grain for named strippers and batches the newly-found inline one-liners per file to keep the commit count proportionate. Recorded here as the autonomous run's execution decision under the ratified intent (kill the class, one PR). |
| Autonomous ship through merged PR; spec/plan user gates waived. | Owner answer, same session (AGENTS.md brainstorming gate). |
| Non-trivial pre-existing violations surfaced by a newly-sighted guard get a **BACKLOG row + explicit per-guard allowlist entry citing it**, not an in-PR fix. Trivial ones (dead class, stale comment, mechanical rename) are fixed in the migration commit that surfaced them. | Backlog fix-shape (BACKLOG.md:914) + owner packaging answer. |
| The YAML `#` stripper (`stripYamlComments` shape at `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:47`) **stays local** — different comment grammar, already quote-aware, not in the fail-open class. Allowlisted **per-symbol** (the same file's `stripTsComments` at `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:72` DOES migrate — R1 F1 killed file-level allowlisting). | This spec, amended R1. |
| MDX line-comment policy is preserved exactly: line comments are NOT stripped in `.mdx` (a bare `//` there is prose/URL more often than a comment). | `tests/styles/_classScanUtils.ts:51-58` (R20 F1 / R22 lineage). |
| No guard's *scanning* logic changes beyond the comment-stripping step. Behavior changes are limited to what the corrected stripper newly reveals. | This spec, §5 procedure. |
| SQL dollar-quote contract: untagged `$$` spans are code (comments inside strip); **tagged** `$tag$…$tag$` spans are protected data. | This spec §3, amended R1 F6; reviewer-verified that all currently scanned migrations use only untagged outer `$$` function bodies. |

## 2. Inventory (canonical — every other section references this table)

Swept 2026-07-26 against `origin/main` (2411d4450) with BOTH detectors: name-shape `rg -n "function strip\w*|const strip\w*|function codeOf|function commentRanges|stripCommentsSafely"` AND content-shape `rg -n "[\s\S]*?\*\//-literal and //-strip idioms" tests/` (the exact commands and full hit list are reproduced in the plan; the content-shape sweep is what caught the Tier-C rows the backlog's name-only rg missed).

**Tier A — named JS/TS strippers over scanned corpora (fail-open class). One commit each; migrate to shared TS-parser stripper.**

| # | Site | Notes / consumers that must run green |
|---|---|---|
| A1 | `tests/styles/_newTabScan.ts:2747` + `tests/styles/_newTabScan.ts:2800` | **Canonical source** — extract; fix `ScriptKind` routing (§3). Consumers: `tests/styles/_metaNewTabAnnouncement.test.ts` (imports at `tests/styles/_metaNewTabAnnouncement.test.ts:12-17`), `tests/components/a11y/newTabAnnouncementBehavior.test.tsx`. |
| A2 | `tests/styles/_classScanUtils.ts:60` (+ `tests/styles/_classScanUtils.ts:56`, `tests/styles/_classScanUtils.ts:33`) | TS/TSX path → shared; MDX logic moves to shared `stripMdxComments`. Consumers: `tests/styles/_metaDestructiveConfirm.test.ts`, `tests/styles/_metaDoublePrefixColorToken.test.ts`, `tests/styles/_metaBgAccentInventory.test.ts`, `tests/styles/_metaRawAccentText.test.ts`, `tests/components/admin/_metaResolveLabelSingleSource.test.ts`, `tests/admin/_metaAttentionItemsTopology.test.ts` (R1 F5 list). |
| A3 | `tests/help/_metaServerTimeGuard.test.ts:54` | Hand-rolled state machine — delete, import shared. |
| A4 | `tests/admin/no-inline-email-normalization.test.ts:41` | Keep `canonicalize-exempt:` line filter local; compose. Scans `lib/sync/attachWarningAnchors.ts` — the F2 poison file; this row is the scriptKind regression's proof case. |
| A5 | `tests/admin/serverNoClientValueCall.test.ts:48` | Second inline idiom at `tests/admin/serverNoClientValueCall.test.ts:59` migrates in the same commit. |
| A6 | `tests/messages/_metaAdminAlertProducer.test.ts:33` | Blanking FIXES its line-number bug: `tests/messages/_metaAdminAlertProducer.test.ts:46` derives reported line numbers via `indexOf` + `slice().split("\n").length`, and deletion collapses multi-line comments (recon 2026-07-26). |
| A7 | `tests/admin/dev-requires-developer.test.ts:32` | Watch: `tests/admin/dev-requires-developer.test.ts:56-62` fixed 40-char window after `indexOf`; its whitespace-normalization mitigates blanking drift — verify in migration commit. |
| A8 | `tests/help/_metaUiLabelCrosswalk.test.ts:262` | Exported but zero external importers (verified — `tests/help/_uiLabelExceptions.ts` references it in comments only); drop the export. |
| A9 | `tests/help/_metaAffordanceMatrixParity.test.ts:32` | Scans `.mdx` (`tests/help/_metaAffordanceMatrixParity.test.ts:11-21`) → MUST route through `stripCommentsForFile` so `.mdx` gets MDX policy (R1 F2). Offset-preserving already. |
| A10 | `tests/crew/stageRestrictionThreading.test.ts:20` | `indexOf` + brace-balance extraction — ordering survives blanking. |
| A11 | `tests/sync/_livePartitionClassificationContract.test.ts:48` | |
| A12 | `tests/sync/no-direct-drive-folder-env.test.ts:8` | |
| A13 | `tests/components/admin/_metaPopoverViewportSource.test.ts:77` | |
| A14 | `tests/components/admin/review/reviewModalShell.test.tsx:535` | Same commit also handles the CSS remover `animationContexts` at `tests/components/admin/review/reviewModalShell.test.tsx:444` → shared `stripCssComments` (Tier D). |
| A15 | `tests/components/admin/wizard/venueTransitionAudit.test.ts:10` | |
| A16 | `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:72` (`stripTsComments`) | Hand-rolled char scanner over TS source — migrate. The YAML stripper at `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:47` stays (per-symbol allowlist). |
| A17 | `tests/docs/designSevenAEmptyHiddenSites.test.ts:37` (`stripNonCode`) | Also strips JSX `{/* */}` comments — shared TS-parser handles those natively (they are real comments in the AST). |
| A18 | `tests/crew/_metaTileProducerTopology.test.ts:65` (`codeOf`) | |
| A19 | `tests/messages/_metaCatalogCopyHygiene.test.ts:164` (`stripCodeNoise`) | Composite: comment-strip THEN string-blanking. Only the comment-strip step migrates; its string-blanking replaces stay. |
| A20 | `tests/admin/stagedPageRefScan.ts:49` (`commentRanges(src, sourceFile)`) | AST-based already (safe); migrates for single-source. Shared `commentRanges` accepts an optional pre-parsed `SourceFile` to keep its no-reparse path (recon: re-parse also acceptable). Consumers: `tests/admin/stagedPageRefScan.test.ts`, `tests/admin/step3DeletionSafety.test.ts` (R1 F5). |

**Tier B — SQL strippers. One commit each; migrate to shared `stripSqlComments`.**

| # | Site | Notes |
|---|---|---|
| B1 | `tests/db/undo-change-lock-order.test.ts:16` | `.search()` index-order assertions — blanking preserves indices. |
| B2 | `tests/auth/advisoryLockRpcDeadlock.test.ts:10` | Mixed corpus: `.sql` migrations AND `.ts` lib files (`tests/auth/advisoryLockRpcDeadlock.test.ts:144-156`) through ONE helper — split per file type: `stripSqlComments` for `.sql`, shared TS stripper for `.ts`. |
| B3 | `tests/db/_resetRpcSource.ts:18` (`stripSqlComments`) | Name collision with the shared export resolves to an import. |
| B4 | `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:54` (`stripSqlComments`) | Line-only `--` today; shared adds quote-awareness — strictly safer. |
| B5 | `tests/sync/runScheduledCronSync.holdWrite.test.ts:129` | Inline per-line `--` strip. |
| B6 | `tests/db/schema.test.ts:408` | Inline per-line `--` strip. |

**Tier C — inline single-use idioms in behavior tests (small known inputs; lower blast radius, same idiom). One commit per file; migrate to shared import unless the row's disposition says allowlist.**

| # | Site(s) | Disposition |
|---|---|---|
| C1 | `tests/components/shared/staleFooter-now-prop.test.ts:58` + `tests/components/shared/staleFooter-now-prop.test.ts:106` | Migrate. |
| C2 | `tests/admin/attentionExclusionSet.test.ts:173` | Migrate. |
| C3 | `tests/admin/upsertAdminAlert.test.ts:77` + `tests/admin/upsertAdminAlert.test.ts:111` | Migrate. |
| C4 | `tests/components/admin/showpage/statusStrip.test.tsx:439` | Migrate. |
| C5 | `tests/components/admin/showpage/warningsPanelTransitions.test.tsx:132` + `tests/components/admin/showpage/warningsPanelTransitions.test.tsx:172` | Migrate. |
| C6 | `tests/cross-cutting/no-vestigial-middleware.test.ts:37` | Migrate. |
| C7 | `tests/components/admin/bellRetainsCutCodes.test.tsx:159` | Migrate. |
| C8 | `tests/messages/showScopedCopy.test.ts:152` | Migrate. |
| C9 | `tests/onboarding/finalizeNoDriveExport.test.ts:17` | Migrate. |
| C10 | `tests/admin/dev/filesMembership.test.ts:83` | Per-line `//` strip inside an extracted array-literal body — migrate or allowlist; plan decides with the run-at-plan-time sweep. |
| C11 | `tests/sync/_phase2ArgsParityContract.test.ts:75` | Same shape as C10 — same disposition path. |
| C12 | `tests/auth/_metaInfraContract.test.ts:238` (`braceDelta`) | Per-LINE `//` strip inside brace counting — structurally line-scoped, cannot open a block span; **allowlist** with that reason. |
| C13 | `tests/e2e/pendingDiscardReal.layout.spec.ts:409` | Colon-guarded same-line idiom inside an e2e helper; e2e specs don't import vitest-side helpers freely — **allowlist** with reason, or migrate if the import is clean; plan decides. |

**Tier D — different grammar.**

| # | Site | Disposition |
|---|---|---|
| D1 | `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:47` (YAML `#`) | Keep local; per-symbol allowlist (§1.1). |
| D2 | `tests/components/admin/review/reviewModalShell.test.tsx:444` (CSS block comments in `animationContexts`) | Migrate to new shared `stripCssComments` (trivial: `/* */` outside single/double-quoted strings; CSS has no line comments). |

Summary counts (single source of truth): **41 inventory rows** (20 Tier-A, 6 Tier-B, 13 Tier-C, 2 Tier-D) across **39 distinct files** (D1 shares A16's file, D2 shares A14's); migrating commits ≈ 20 (A) + 6 (B) + ~11 (C, per file, minus allowlisted rows) + shared-module + meta-test, with D2 inside A14's commit.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
## 3. Shared module — `tests/_shared/stripComments.ts`

<!-- spec-lint: ignore — files created BY this spec; not tracked until implementation lands -->
New directory `tests/_shared/`. Vitest collects only `tests/**/*.test.ts(x)` (`BASE_INCLUDE`, `vitest.projects.ts:34`), so the module itself is never collected as a test; its self-test (`tests/_shared/stripComments.test.ts`) is.

Exports:

- `commentRanges(src: string, kind: ts.ScriptKind, sourceFile?: ts.SourceFile): [number, number][]` — from `tests/styles/_newTabScan.ts:2747`, amended per R1 F2: **`kind` is required** (`ts.ScriptKind.TS` for `.ts`, `.TSX` for `.tsx`) — the old TSX hardcode mis-parses `.ts` generic arrows (§1). Optional `sourceFile` keeps A20's no-reparse path.
- `stripCommentsSafely(src: string, kind: ts.ScriptKind): string` — from `tests/styles/_newTabScan.ts:2800`; blanks comment ranges with spaces preserving newlines (offsets and line numbers survive, so deletion-style and offset-style callers both adopt it).
- `stripCommentsForFile(src: string, filePath: string): string` — **the primary caller API**: routes by extension — `.tsx` → TSX, `.ts` → TS, `.mdx` → `stripMdxComments`, `.sql` → `stripSqlComments`, `.css` → `stripCssComments`. Unknown extension throws (fail-closed: a guard passing an unexpected file type must decide explicitly, not silently get the wrong grammar).
- `stripMdxComments(src: string): string` — the line-based block-comment logic currently in `tests/styles/_classScanUtils.ts:60` with line comments untouched (§1.1 MDX policy).
- `stripSqlComments(src: string): string` — new scanner: removes `-- …` to end of line and `/* … */` blocks; protects single-quoted strings (`''` escaping honored) and **tagged** dollar-quoted spans `$tag$…$tag$` (data); treats **untagged** `$$` spans as code — comments inside strip (§1.1 contract; the scanned migrations use untagged `$$` only for function bodies, reviewer-verified R1 F6).
- `stripCssComments(src: string): string` — `/* */` removal outside quoted strings; no line-comment concept.
- `LINE_TERMINATORS` — moved from `tests/styles/_newTabScan.ts:45`; `_newTabScan.ts` re-imports (3 remaining internal uses: lines 1987, 1991, 2833).

Guard conditions: all strippers are total on strings — empty in, empty out; comment-free input returns unchanged; none throw on malformed source except `stripCommentsForFile`'s deliberate unknown-extension throw (`ts.createSourceFile` never throws — best-effort tree).

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
## 4. Structural guard — `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
Filesystem-walked over `tests/**/*.{ts,tsx}` (fails-by-default on NEW files). Detection is **content-shape based**, not name-based (R1 F4 — names are an evasion class; the R1 sweep itself caught `stripTsComments`/`stripNonCode`/`codeOf`/`stripCodeNoise` precisely because names lie):

- flag any **block-comment-matching regex literal** in a file's source (the `/\*[\s\S]*?\*\//`-family and `/\*.*?\*\//`-family patterns),
- flag any **line-comment-strip replace idiom** (`//`-to-EOL regex used in a `.replace`),
- flag any definition matching the name family `strip\w*[Cc]omment\w*|commentRanges|stripNonCode|stripCodeNoise|codeOf` (belt and braces on top of content-shape),

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
…in any file that is not `tests/_shared/stripComments.ts`, unless the (file, symbol-or-line, reason) triple appears in the allowlist. Allowlist is **per-symbol/per-site, never per-file** (R1 F1: file-level allowlisting sheltered `stripTsComments` inside the YAML file). Standing rows: D1 (YAML grammar), C12 (line-scoped by construction), C13 if the plan lands it as allowlist. Every future row requires a reason and (for deferred migrations) a BACKLOG ref.

The meta-test also pins the shared module's existence + its six exports, and — during the migration window — carries a **pending-migrations allowlist** listing every §2 row not yet migrated. That list is the TDD mechanism (§5).

Anti-tautology proofs (negative tests, in the meta-test's own suite): plant, in a temp walked file, (a) a naive `stripComments` copy, (b) a RENAMED copy (`removeNoise`) with the same regex body, (c) a bare inline `.replace(/\/\*[\s\S]*?\*\//g, "")` chain — assert all three are flagged. These are the R1-proven evasion forms.

## 5. Migration procedure

Commit order:

1. **Shared module + self-test** — TDD: self-test red (module absent) → implement → green.
2. **Meta-test** with the full pending-migrations allowlist (every §2 row) — TDD: its negative-proof plants red first; standing green with the allowlist in place.
3. **Per-row migration commits** (grain per §1.1 packaging). Each commit:
   a. Delete the row's pending-allowlist entry → meta-test **red** (the local copy is now flagged). This is the failing-test-first step (R1 F3).
   b. Replace the local idiom with the shared import (`stripCommentsForFile` where a path exists — always, for readFileSync callers).
   c. Run the row's guard file AND every consumer named in its §2 row (fan-out rows A1/A2/A20 — R1 F5).
   d. Triage anything newly reported, per §1.1: trivial → fix here; non-trivial → BACKLOG row + per-guard allowlist entry citing it. Suite never left red.
   e. Commit `test(<area>): migrate <file> to shared stripComments` with triage notes.
4. Final commit removes the (now empty) pending-migrations allowlist scaffolding.

Expected-findings caution (BACKLOG.md:914): the prior fix immediately surfaced two apparent violations that were artifacts of an incomplete first fix — step 3d verifies each new finding against raw source by hand before classifying. Not a bulk sed.

## 6. Test plan

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- **Self-test `tests/_shared/stripComments.test.ts`** (TDD-first) pins, TS/TSX: the `app/admin/layout.tsx` JSDoc case (`/admin/*` in a comment does not swallow code); `/*` inside a string; protocol-relative `href="//cdn/x"`; `https://` in code; regex literal containing `//`; shebang; **`.ts` generic arrow `const f = <T>(x: T) => x; // c` — comment found, code intact under `ScriptKind.TS`** (R1 F2 regression case, poison shape from `lib/sync/attachWarningAnchors.ts:40`); offset/line-number preservation. MDX: `[CDN](https://cdn/x)` prose survives; JSX block comment strips. SQL: `--` strips; `--` inside `'a -- b'` survives; `''` escaping; `/* */` strips; **`/*` inside a single-quoted string survives; `--` inside a tagged `$tag$…$tag$` span survives; comment inside an untagged `$$` body strips** (R1 F6 cases). CSS: block comment strips; `content: "/*"` survives. `stripCommentsForFile`: unknown extension throws.
- **Meta-test negative proofs** per §4 (three evasion plants).
- **Per-row green** for the row's guard + listed consumers (§5.3c).
- **Full suite green** before the whole-diff review.

## 7. Out of scope

- Guard scanning logic beyond comment stripping (tokenizers, walkers).
- Guards' EXISTING allowlist semantics. (Adding new entries for §5.3d triage findings is in scope — R1 F5 flagged the earlier blanket wording as contradicting §1.1; this is the corrected boundary. A guard with no allowlist mechanism that surfaces a non-trivial finding gets a minimal one added in that migration commit, mirroring its nearest sibling's pattern.)
- The YAML stripper's internals (D1).
- Non-trivial app-code violations a newly-sighted guard reveals (BACKLOG rows, §1.1).
- `scripts/**` or app-side comment handling — `tests/**` refactor only.

## 8. Risks

- **A migrated guard reds on real violations** — the point; bounded by §5.3d triage.
- **Parse cost** — `ts.createSourceFile` per scanned file; `_newTabScan`/`stagedPageRefScan` already pay full parses across the same trees without suite-time complaint. Accepted.
- **Blanking vs deletion deltas** — recon (2026-07-26, per-caller): 9 callers unaffected (regex/word-boundary/substring/relative-order consumption); A6 actively FIXED (line-number skew from deletion); A7's 40-char window mitigated by its own whitespace normalization and verified at its commit; A10/A14 index arithmetic survives (ordering + generous windows). No caller matches tokens spanning a comment seam.
- **ScriptKind routing regressions in A1's own consumers** — `_newTabScan` currently parses everything as TSX; switching `.ts` inputs to `ScriptKind.TS` could change its protected-range map for files it previously mis-parsed. That is the bug being fixed, but A1's commit runs both its consumers and eyeballs any delta in reported findings.
