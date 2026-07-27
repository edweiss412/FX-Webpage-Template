# Shared comment-stripper for structural guards — design

**Date:** 2026-07-26 · **Backlog:** `BL-STRIPCOMMENTS-DUPLICATED-AND-FAIL-OPEN` (BACKLOG.md:904) · **Branch:** `refactor/stripcomments-shared`

<!-- spec-lint: not-ui — tests-only refactor; app/admin/layout.tsx appears only as the measured-impact example, no UI file changes -->

## 1. Problem

Structural guards across the test suite strip (or skip) comments before scanning source. The R1+R2 adversarial sweeps (2026-07-26) found the duplication far wider than the backlog row's 17: **54 inventory rows across 52 files** in `tests/` (§2 — named strippers, inline `.replace()` idioms, char-scanners, line-start skip filters, SQL/CSS/YAML/dotenv variants). The dominant JS/TS form is the naive pair

```ts
src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
```

which lets **any** `/*` open a block span — including one inside a string literal or a path. Measured impact (BACKLOG.md:910): the JSDoc line `* Wraps every route under /admin/*` in `app/admin/layout.tsx` opens a span running to the next `*/` far below, so all six live `className` sites in that file vanish from any scan using the naive helper — the guard silently reports nothing. A fail-open structural guard: green while blind.

One copy was already fixed (`tests/styles/_classScanUtils.ts:60`, line-based heuristic, destruct-thumb-order PR). The repo's strongest implementation — TypeScript-parser-backed, immune to strings/templates/regex/JSX text — sits unshared inside `tests/styles/_newTabScan.ts` (`commentRanges` at `tests/styles/_newTabScan.ts:2747`, `stripCommentsSafely` at `tests/styles/_newTabScan.ts:2800`). It carries one latent defect fixed on promotion: it hardcodes `ts.ScriptKind.TSX` (`tests/styles/_newTabScan.ts:2748`), which mis-parses plain-`.ts` generic arrows — `const f = <T>(x: T) => x; // comment` reads as JSX, everything after `<T>` becomes protected `JsxText`, zero comment ranges return. That syntax exists in live scanned input at `lib/sync/attachWarningAnchors.ts:40` (R1 F2, probe-verified).

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
|---|---|
| Approach: promote the **TS-parser** implementation, NOT the line-based `_classScanUtils` heuristic, as the canonical JS/TS stripper. | Owner-approved 2026-07-26 brainstorming session; backlog wording (BACKLOG.md:914) superseded on the which-implementation point only. |
| Packaging: **one PR**; one commit per Tier-A/B/D row and per Tier-C/E migrating file. | Owner ratified one-PR/per-caller-commits; grain extended to the R1/R2-expanded inventory as the autonomous run's execution decision under the ratified intent. |
| Autonomous ship through merged PR; spec/plan user gates waived. | Owner answer, same session (AGENTS.md brainstorming gate). |
| Non-trivial pre-existing violations surfaced by a newly-sighted guard: **BACKLOG row + per-guard allowlist entry citing it**, not an in-PR fix. Trivial ones fixed in the surfacing commit. | Backlog fix-shape (BACKLOG.md:914) + owner packaging answer. |
| The YAML `#` stripper at `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:47` stays local — different grammar, quote-aware, not fail-open. Allowlisted **per-symbol** (the same file's `stripTsComments` at `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:72` DOES migrate — R1 F1 killed file-level allowlisting). | This spec, amended R1. |
| MDX line-comment policy preserved: line comments NOT stripped in `.mdx`. | `tests/styles/_classScanUtils.ts:51-58` (R20 F1 / R22 lineage). |
| No guard's *scanning* logic changes beyond the comment-handling step. Behavior changes are limited to what the corrected stripper newly reveals. Tier-C/E migrations use the **pre-strip pattern** (§5) precisely so extraction logic survives verbatim. | This spec, §5. |
| SQL contract (amended R2 F6): **ALL dollar-quoted spans — tagged or untagged — are SQL code**: comments inside strip; single-quoted strings inside stay protected. Rationale: the scanned corpus uses dollar quotes exclusively for SQL (untagged `$$` bodies; tagged `$function$` outer body at `supabase/migrations/20260719000001_undo_change_lifecycle_guard.sql:11-227`; tagged `$body$` cron command strings at `supabase/migrations/20260527000003_schedule_cron_jobs.sql:90-104` — SQL in every case). R1's tag-based data/code distinction was refuted by R2 F6 against this corpus. Residual risk — a future migration embedding NON-SQL data in a dollar span containing `--`/`/*` — is accepted and pinned as a documented limitation in the self-test. | This spec, amended R2. |
| Line-start comment-skip filters (Tier E) are a distinct, structurally block-safe class: no cross-line state, so they cannot fail open the BL-904 way. TS-source instances migrate to the pre-strip pattern (strict improvement); different-grammar (YAML/dotenv), documented-trade-off, comment-READING, and loop-integrated instances stay, each with a standing allowlist row + reason. | This spec, added R2 F1. |

## 2. Inventory (canonical — every other section references this table)

Swept 2026-07-26 against `origin/main` (2411d4450) with the FIVE detector families of §4 (name-shape, block-regex literals, line-comment replace idioms, two-char scanner literals, line-start skip filters); exact commands + full hit lists reproduced in the plan. R2 F1's eight additional sites and the detector-family sweep's five more are all rows below.

**Tier A — named JS/TS strippers over scanned corpora (fail-open class). One commit each; migrate to shared TS-parser stripper.**

| # | Site | Notes / consumers that must run green |
|---|---|---|
| A1 | `tests/styles/_newTabScan.ts:2747` + `tests/styles/_newTabScan.ts:2800` | **Canonical source** — extract; fix `ScriptKind` routing (§3). Consumers: `tests/styles/_metaNewTabAnnouncement.test.ts` (imports at `tests/styles/_metaNewTabAnnouncement.test.ts:12-17`), `tests/components/a11y/newTabAnnouncementBehavior.test.tsx`. |
| A2 | `tests/styles/_classScanUtils.ts:60` (+ `tests/styles/_classScanUtils.ts:56`, `tests/styles/_classScanUtils.ts:33`) | TS/TSX path → shared; MDX logic → shared `stripMdxComments`. Consumers: `tests/styles/_metaDestructiveConfirm.test.ts`, `tests/styles/_metaDoublePrefixColorToken.test.ts`, `tests/styles/_metaBgAccentInventory.test.ts`, `tests/styles/_metaRawAccentText.test.ts`, `tests/components/admin/_metaResolveLabelSingleSource.test.ts`, `tests/admin/_metaAttentionItemsTopology.test.ts` (R1 F5 list). |
| A3 | `tests/help/_metaServerTimeGuard.test.ts:54` | Hand-rolled state machine — delete, import shared. |
| A4 | `tests/admin/no-inline-email-normalization.test.ts:41` | Keep `canonicalize-exempt:` line filter local; compose — and RENAME it (it no longer strips comments, so a family-5 name must not survive, §5.3b). Scans `lib/sync/attachWarningAnchors.ts` — the F2 poison file; scriptKind regression's proof case. |
| A5 | `tests/admin/serverNoClientValueCall.test.ts:48` | Second inline idiom at `tests/admin/serverNoClientValueCall.test.ts:59` migrates in the same commit. |
| A6 | `tests/messages/_metaAdminAlertProducer.test.ts:33` | Blanking FIXES its line-number bug: `tests/messages/_metaAdminAlertProducer.test.ts:46` derives line numbers via `indexOf` + `slice().split("\n").length`; deletion collapses multi-line comments (recon 2026-07-26). |
| A7 | `tests/admin/dev-requires-developer.test.ts:32` | Watch: `tests/admin/dev-requires-developer.test.ts:56-62` 40-char window after `indexOf`; whitespace-normalization mitigates blanking drift — verify at migration. |
| A8 | `tests/help/_metaUiLabelCrosswalk.test.ts:262` | Exported, zero external importers (verified) — drop export. Corpus includes `.js`/`.jsx` (`tests/help/_metaUiLabelCrosswalk.test.ts:72-77`) → §3 router covers them (R2 F4). |
| A9 | `tests/help/_metaAffordanceMatrixParity.test.ts:32` | Scans `.mdx` (`tests/help/_metaAffordanceMatrixParity.test.ts:11-21`) → MUST route via `stripCommentsForFile` (R1 F2). Offset-preserving already. |
| A10 | `tests/crew/stageRestrictionThreading.test.ts:20` | `indexOf` + brace-balance — ordering survives blanking. |
| A11 | `tests/sync/_livePartitionClassificationContract.test.ts:48` | |
| A12 | `tests/sync/no-direct-drive-folder-env.test.ts:8` | |
| A13 | `tests/components/admin/_metaPopoverViewportSource.test.ts:77` | Second symbol: `codeOf` wrapper at `tests/components/admin/_metaPopoverViewportSource.test.ts:127` — after migration it delegates to the shared API and is RENAMED per §5.3b (R3 F3). Corpus includes `.mts`/`.cts` (`tests/components/admin/_metaPopoverViewportSource.test.ts:15`, `tests/components/admin/_metaPopoverViewportSource.test.ts:71`) → §3 router covers them (R2 F4). |
| A14 | `tests/components/admin/review/reviewModalShell.test.tsx:535` | Same commit handles D2 (CSS remover at `tests/components/admin/review/reviewModalShell.test.tsx:444`). |
| A15 | `tests/components/admin/wizard/venueTransitionAudit.test.ts:10` | |
| A16 | `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:72` (`stripTsComments`) | Hand-rolled char scanner — migrate. YAML stripper at `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:47` stays (D1). |
| A17 | `tests/docs/designSevenAEmptyHiddenSites.test.ts:37` (`stripNonCode`) | JSX `{/* */}` comments are real AST comments — handled natively. |
| A18 | `tests/crew/_metaTileProducerTopology.test.ts:65` (`codeOf`) | Retained read-and-strip wrapper delegates to shared and is RENAMED per §5.3b. |
| A19 | `tests/messages/_metaCatalogCopyHygiene.test.ts:164` (`stripCodeNoise`) | Composite: only the comment-strip step migrates; string-blanking replaces stay — retained function RENAMED per §5.3b (e.g. `blankStringNoise`). |
| A20 | `tests/admin/stagedPageRefScan.ts:49` (`commentRanges(src, sourceFile)`) | AST-based already; migrates for single-source. Shared `commentRanges` takes optional pre-parsed `SourceFile`. Consumers: `tests/admin/stagedPageRefScan.test.ts`, `tests/admin/step3DeletionSafety.test.ts` (R1 F5). |

**Tier B — SQL strippers. One commit each; migrate to shared `stripSqlComments`.**

| # | Site | Notes |
|---|---|---|
| B1 | `tests/db/undo-change-lock-order.test.ts:16` | `.search()` index-order assertions — blanking preserves indices. Scans `supabase/migrations/20260608000003_undo_change_rpc.sql` and successors incl. tagged `$function$` bodies — §1.1 SQL contract keeps comment-stripping inside them. |
| B2 | `tests/auth/advisoryLockRpcDeadlock.test.ts:10` | Mixed corpus: `.sql` migrations AND `.ts` lib files (`tests/auth/advisoryLockRpcDeadlock.test.ts:144-156`) — split per file type via `stripCommentsForFile`. |
| B3 | `tests/db/_resetRpcSource.ts:18` (`stripSqlComments`) | Name collision resolves to the shared import. |
| B4 | `tests/cross-cutting/_canonicalEmailCheckContract.test.ts:54` (`stripSqlComments`) | Line-only `--` today; shared adds quote-awareness — strictly safer. Its `migrationSources()` corpus includes the tagged-span files cited in §1.1 (R2 F6). |
| B5 | `tests/sync/runScheduledCronSync.holdWrite.test.ts:129` | Inline per-line `--` strip. |
| B6 | `tests/db/schema.test.ts:408` | Inline per-line `--` strip. |

**Tier C — inline single-use idioms in behavior tests. One commit per file; ALL migrate via the §5 pre-strip pattern (R2 F3 resolved the formerly deferred rows).**

| # | Site(s) | Notes |
|---|---|---|
| C1 | `tests/components/shared/staleFooter-now-prop.test.ts:58` + `tests/components/shared/staleFooter-now-prop.test.ts:106` | |
| C2 | `tests/admin/attentionExclusionSet.test.ts:173` | |
| C3 | `tests/admin/upsertAdminAlert.test.ts:77` + `tests/admin/upsertAdminAlert.test.ts:111` | |
| C4 | `tests/components/admin/showpage/statusStrip.test.tsx:439` | |
| C5 | `tests/components/admin/showpage/warningsPanelTransitions.test.tsx:132` + `tests/components/admin/showpage/warningsPanelTransitions.test.tsx:172` | |
| C6 | `tests/cross-cutting/no-vestigial-middleware.test.ts:37` | |
| C7 | `tests/components/admin/bellRetainsCutCodes.test.tsx:159` | |
| C8 | `tests/messages/showScopedCopy.test.ts:152` | |
| C9 | `tests/onboarding/finalizeNoDriveExport.test.ts:17` | |
| C10 | `tests/admin/dev/filesMembership.test.ts:83` | Pre-strip the whole file, then the existing array-literal extraction runs on stripped text (offsets preserved). |
| C11 | `tests/sync/_phase2ArgsParityContract.test.ts:75` | Same pre-strip shape as C10. |
| C12 | `tests/auth/_metaInfraContract.test.ts:238` (`braceDelta`) | R2 F3 REFUTED the line-scoped-safe claim: `//` inside a string (`"https://x"`) truncates the line and mis-counts braces. Migrate: strip the whole file once with the shared stripper before brace counting; delete the inline strip. |
| C13 | `tests/e2e/pendingDiscardReal.layout.spec.ts:409` | Same refutation shape (protocol-relative attr). Migrate: pre-strip the searched source, then the token/context line match runs unchanged. Playwright specs are plain TS — the `tests/_shared` import is clean. |

**Tier D — different grammar.**

| # | Site | Disposition |
|---|---|---|
| D1 | `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:47` (YAML `#`) | Keep; standing allowlist (grammar). |
| D2 | `tests/components/admin/review/reviewModalShell.test.tsx:444` (CSS `animationContexts`) | Migrate → shared `stripCssComments` (inside A14's commit). |
| D3 | `tests/components/admin/showpage/shareHubFlashTransitions.test.ts:66-70` (CSS char-scan skip inside depth counter) | Migrate: pre-strip CSS with `stripCssComments`, drop the scanner's comment branch. |

**Tier E — line-start comment-skip filters & comment-aware readers (R2 F1). Block-safe by construction; per-row disposition.**

| # | Site | Disposition |
|---|---|---|
| E1 | `tests/styles/_metaDestructiveConfirm.test.ts:243-249` | Migrate (pre-strip; drop filter). |
| E2 | `tests/cross-cutting/test-fast-deferred.test.ts:63-68` | Migrate. |
| E3 | `tests/admin/parseAndStage-auth.test.ts:73-80` | Migrate: pre-strip, then first non-blank line IS the first executable statement (blanked comments trim to empty). |
| E4 | `tests/sync/jsonbBoundaryRepresentation.meta.test.ts:49-52` (`isCommentLine`) | Migrate; delete helper. |
| E5 | `tests/cross-cutting/vitest-projects-partition.test.ts:372-377` | Keep — YAML grammar. Standing allowlist. |
| E6 | `tests/cross-cutting/unit-suite-shard-topology.test.ts:39-46` (`directives`) | Keep — YAML grammar. Standing allowlist. |
| E7 | `tests/cross-cutting/db-test-connection-hygiene.test.ts:110-123` (`commandLines`) | Keep — trailing-comment behavior is a DOCUMENTED loud-error design (`tests/cross-cutting/db-test-connection-hygiene.test.ts:110-114`). Standing allowlist. |
| E8 | `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts:588` + `tests/cross-cutting/reseed-clears-oauth-claim-doc-guard.test.ts:1861` | Keep — loop-integrated `--` doc-line skips; migrating changes doc-scan semantics. Standing allowlist. |
| E9 | `tests/log/mutationSurface/exemptions.ts:24` (`fileHasNoTelemetry`) | Keep — comment-READER: searches leading comments for the `// no-telemetry:` marker; comments are its subject. Standing allowlist. |
| E10 | `tests/drive/loadLocalEnv.ts:15` | Keep — dotenv `#` grammar. Standing allowlist. |
| E11 | `tests/drive/pin15ExportProbe.mjs:18` | Keep — dotenv `#`; `.mjs` is OUTSIDE the meta-test walk (§4), so this row is documentation-only: no allowlist entry exists or is needed (R3 F2). |
| E12 | `tests/auth/oauth-flow.test.ts:42` | Not comment handling at all (`location.startsWith("//")` is a protocol-relative-URL assertion) — standing allowlist as a detector false-positive row. |

Summary counts (single source of truth): **54 rows** (20 A, 6 B, 13 C, 3 D, 12 E) across **52 distinct files** (D1 shares A16's file; D2 shares A14's). Migrating: all A+B+C, D2+D3, E1–E4 = **45 rows**; keep-with-standing-allowlist: D1, E5–E10, E12 = **8 rows**; documentation-only (outside the walk): E11 = **1 row**. Detector coverage claims apply to the 53 walked rows. Commits ≈ shared-module + meta-test + 20 A + 6 B + 13 C + 1 (D3) + 4 (E1–E4) + final-scaffold-removal ≈ **47**.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
## 3. Shared module — `tests/_shared/stripComments.ts`

<!-- spec-lint: ignore — files created BY this spec; not tracked until implementation lands -->
New directory `tests/_shared/`. Vitest collects only `tests/**/*.test.ts(x)` (`BASE_INCLUDE`, `vitest.projects.ts:34`), so the module is never collected as a test; its self-test is.

Exports:

- `commentRanges(src: string, kind: ts.ScriptKind, sourceFile?: ts.SourceFile): [number, number][]` — from `tests/styles/_newTabScan.ts:2747`; **`kind` required** (R1 F2); optional pre-parsed `sourceFile` keeps A20's no-reparse path.
- `stripCommentsSafely(src: string, kind: ts.ScriptKind): string` — from `tests/styles/_newTabScan.ts:2800`; blanks comment ranges with spaces preserving newlines — offsets and line numbers survive.
- `stripCommentsForFile(src: string, filePath: string): string` — **primary caller API**, routes by extension (R2 F4 set): `.tsx`/`.jsx` → `ScriptKind.TSX`/`JSX`; `.ts`/`.mts`/`.cts` → `ScriptKind.TS`; `.js`/`.mjs`/`.cjs` → `ScriptKind.JS`; `.mdx` → `stripMdxComments`; `.sql` → `stripSqlComments`; `.css` → `stripCssComments`. Unknown extension throws (fail-closed). |
- `stripMdxComments(src: string): string` — the line-based block-comment logic from `tests/styles/_classScanUtils.ts:60`, line comments untouched (§1.1).
- `stripSqlComments(src: string): string` — removes `-- …` and `/* … */`; protects single-quoted strings (`''` escaping) everywhere, INCLUDING inside dollar-quoted spans; dollar-quote delimiters (tagged or not) are transparent — span contents are SQL code per the §1.1 contract.
- `stripCssComments(src: string): string` — `/* */` outside single/double-quoted strings; no line comments in CSS.
- `LINE_TERMINATORS` — from `tests/styles/_newTabScan.ts:45`; `_newTabScan.ts` re-imports (3 remaining internal uses: lines 1987, 1991, 2833).

Guard conditions: all strippers total on strings — empty in/empty out; comment-free input unchanged; only `stripCommentsForFile`'s unknown-extension throw is deliberate (`ts.createSourceFile` never throws — best-effort tree).

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
## 4. Structural guard — `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
Filesystem-walked over `tests/**/*.{ts,tsx,mts,cts}` (fails-by-default on NEW files; `.mjs` outside the walk — E11 noted). Detection runs on comment-STRIPPED source (via the shared module — so comment TEXT mentioning these idioms, e.g. `tests/styles/_metaDoublePrefixColorToken.test.ts:46-65`, cannot false-positive). **Five detector families** (R2 F2 widened):

1. **Block-comment regex literals** — the `/\*[\s\S]*?\*\//`, `/\*.*?\*\//`, and `/\*[^]*?\*\//` spelling families (R2 F2's `[^]` variant included).
2. **Line-comment replace idioms** — `//`-to-EOL AND `--`-to-EOL regex used in `.replace` (R3 F1: the SQL line-comment replace shape at B5/B6/C3 is this family's second half; without it those rows had no detector hit and no red-first cycle).
3. **Two-char scanner literals** — a string literal exactly `"//"`, `"/*"`, or `"*/"` (any quote style) in executable code: any hand-rolled char scanner must name its markers (this is what catches A16's `two === "//"` shape and D3's `indexOf("*/")`).
4. **Line-start skip filters** — `startsWith` with argument exactly `"//"`, `"--"`, `"#"`, `"/*"`, or `"*"`, and bare marker-skip regex literals (`/^\s*--/`, `/^\s*#/`, `/^\s*\/\//` — exact shapes only, so `--color-([a-z0-9-]+)` at `tests/styles/_metaDoublePrefixColorToken.test.ts:28` does not hit).
5. **Name family** — definitions matching `strip\w*[Cc]omment\w*|commentRanges|stripNonCode|stripCodeNoise|codeOf` (belt and braces).

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
A hit in a file other than `tests/_shared/stripComments.ts` must appear in one of two lists (R2 F5 split):

- **`STANDING_ALLOWLIST`** — permanent rows, each `{file, marker, reason}`: D1 (YAML grammar), E5–E10, E12, plus any future triage-deferred row with a BACKLOG ref. Never expected to empty.
- **`PENDING_MIGRATIONS`** — the migration-window scaffold: one `{file, site}` entry per detector hit in every not-yet-migrated §2 row, auto-derived at meta-test creation from the sweep. A migration commit deletes **all of its file's entries** (multi-site rows clear atomically — R2 F5), turning the meta-test red until the file's idioms are gone. The final commit deletes the empty constant and its plumbing.

**Honest bound (R2 F2):** static shape detection cannot prove the absence of every conceivable comment-handling implementation — a novel scanner built without regex literals, marker string literals, marker `startsWith`, or a family name would evade all five families. The meta-test's contract is therefore: fails-by-default for the five enumerated idiom families (which cover all 53 walked rows; E11 is outside the walk, §2), making evasion require active novelty rather than a rename. Residual risk accepted; on any future discovery of a sixth family, extend the detector set in the same commit (structural-defense calibration rule).

Anti-tautology proofs (negative tests): plant in a temp walked file (a) a naive regex `stripComments`, (b) a RENAMED char-loop copy (`removeNoise` with `two === "//"` — R2 F2's exact evasion), (c) a bare inline `.replace(/\/\*[^]*?\*\//g, "")` chain (alternate spelling), (d) a `filter((l) => !l.trim().startsWith("//"))` line filter, (e) a `.replace(/--.*$/gm, "")` SQL line-comment idiom — assert all five flagged.

## 5. Migration procedure

Commit order:

1. **Shared module + self-test** — TDD: self-test red (module absent) → implement → green.
2. **Meta-test** with `STANDING_ALLOWLIST` + fully-populated `PENDING_MIGRATIONS` — TDD: negative-proof plants red first; standing green with the scaffold in place.
3. **Per-row migration commits** (grain per §1.1). Each commit:
   a. Delete the file's `PENDING_MIGRATIONS` entries → meta-test **red** (failing-test-first, R1 F3).
   b. Migrate. Named strippers: replace definition with the shared import (`stripCommentsForFile` wherever a path exists). Inline idioms and Tier-C/E rows: **pre-strip pattern** — strip the whole input once (offset-preserving), then the existing extraction/matching logic runs verbatim on stripped text. **Rename rule (R3 F3):** any RETAINED local wrapper or filter whose name matches detector family 5 (`codeOf`, `stripCodeNoise`, A4's exempt-line filter, etc.) is renamed to a non-matching name in the same commit — the family-5 list keeps the OLD names so a re-introduction is caught; a wrapper that merely delegates to the shared API must not carry a stripper's name.
   c. Run the row's guard file AND every consumer named in its §2 row (A1/A2/A20 fan-outs — R1 F5).
   d. Triage new findings per §1.1: trivial → fix here; non-trivial → BACKLOG row + per-guard allowlist entry citing it. Suite never left red at commit boundaries.
   e. Commit `test(<area>): migrate <file> to shared stripComments` with triage notes.
4. **Final commit** removes the emptied `PENDING_MIGRATIONS` scaffold.

Expected-findings caution (BACKLOG.md:914): the prior fix surfaced two apparent violations that were artifacts of an incomplete fix — step 3d verifies each finding against raw source by hand. Not a bulk sed.

## 6. Test plan

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- **Self-test `tests/_shared/stripComments.test.ts`** (TDD-first) pins —
  TS/TSX: the `app/admin/layout.tsx` JSDoc case; `/*` inside a string; `href="//cdn/x"`; `https://` in code; regex literal containing `//`; shebang; **`.ts` generic arrow `const f = <T>(x: T) => x; // c` under `ScriptKind.TS`** (R1 F2, poison shape from `lib/sync/attachWarningAnchors.ts:40`); offset/line preservation.
  Router: every §3 extension maps to its grammar; unknown throws.
  MDX: `[CDN](https://cdn/x)` survives; JSX block comment strips.
  SQL: `--` strips; `--` inside `'a -- b'` survives; `''` escaping; `/*` inside a single-quoted string survives; **comment inside an untagged `$$` body strips; comment inside a tagged `$function$` body strips; single-quoted string inside a dollar span still protected** (R2 F6 contract cases); the documented data-in-dollar-span limitation pinned as an explicit expectation with a comment citing §1.1.
  CSS: block comment strips; `content: "/*"` survives.
- **Meta-test negative proofs** — the five §4 plants (a–e).
- **Per-row green** — guard + listed consumers (§5.3c).
- **Full suite green** before whole-diff review.

## 7. Out of scope

- Guard scanning logic beyond comment handling (tokenizers, walkers).
- Guards' EXISTING allowlist semantics. Adding new entries for §5.3d triage findings is in scope (R1 F5 boundary); a guard with no allowlist mechanism gets a minimal one mirroring its nearest sibling.
- The YAML stripper's internals (D1) and every Tier-E keep row's internals.
- Non-trivial app-code violations a newly-sighted guard reveals (BACKLOG rows).
- `scripts/**` or app-side comment handling — `tests/**` only.

## 8. Risks

- **A migrated guard reds on real violations** — the point; bounded by §5.3d.
- **Parse cost** — `ts.createSourceFile` per scanned file; `_newTabScan`/`stagedPageRefScan` already pay full parses across the same trees. Accepted.
- **Blanking vs deletion deltas** — recon (2026-07-26): 9 callers structurally unaffected; A6 actively fixed; A7's window verified at its commit; A10/A14 index arithmetic survives. The §5 pre-strip pattern keeps Tier-C/E extraction logic byte-compatible (offsets preserved).
- **ScriptKind routing deltas in A1's consumers** — `_newTabScan` currently parses everything as TSX; `.ts` inputs switching to `ScriptKind.TS` may change protected-range maps for previously mis-parsed files. That is the fix working; A1's commit runs both consumers and inspects any finding delta.
- **Meta-test false positives on future legitimate code** (a URL assertion like E12) — the standing allowlist with per-row reasons is the pressure valve; a false positive costs one allowlist row, not a design change.
