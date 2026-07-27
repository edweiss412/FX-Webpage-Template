# Shared comment-stripper for structural guards — design

**Date:** 2026-07-26 · **Backlog:** `BL-STRIPCOMMENTS-DUPLICATED-AND-FAIL-OPEN` (BACKLOG.md:904) · **Branch:** `refactor/stripcomments-shared`

<!-- spec-lint: not-ui — tests-only refactor; app/admin/layout.tsx appears only as the measured-impact example, no UI file changes -->


## 1. Problem

Structural guards across the test suite strip comments before scanning source. Nineteen files define their own stripper (inventory, §2). The dominant form is the naive pair of regexes

```ts
src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
```

which lets **any** `/*` open a block span — including one inside a string literal or a path. Measured impact (BACKLOG.md:910): the JSDoc line `* Wraps every route under /admin/*` in `app/admin/layout.tsx` opens a span running to the next `*/` far below, so all six live `className` sites in that file vanish from any scan using the naive helper — the guard silently reports nothing. That is a fail-open structural guard: it stays green while blind.

One copy was already fixed (`tests/styles/_classScanUtils.ts:60`, line-based heuristic, destruct-thumb-order PR). The other copies are untouched, and the repo's strongest implementation — a TypeScript-parser-backed stripper that cannot be fooled by strings, template literals, regex literals, or JSX text — sits unshared inside `tests/styles/_newTabScan.ts` (`commentRanges` at `tests/styles/_newTabScan.ts:2747`, `stripCommentsSafely` at `tests/styles/_newTabScan.ts:2800`).

## 1.1 Resolved scope — do not relitigate

| Decision | Ratification |
|---|---|
| Approach: promote the **TS-parser** implementation (`commentRanges`/`stripCommentsSafely`), NOT the line-based `_classScanUtils` heuristic, as the canonical JS/TS stripper. | Owner-approved in the 2026-07-26 brainstorming session (this spec's branch); backlog's "promote the corrected implementation" (BACKLOG.md:914) is superseded on the *which implementation* point only — the strictly stronger one already in-tree wins. |
| Packaging: **one PR, one commit per migrated caller**, triage inline. | Owner answer, same session ("One PR, per-caller commits"). |
| Autonomous ship through merged PR; spec/plan user gates waived. | Owner answer, same session (AGENTS.md brainstorming gate). |
| Non-trivial pre-existing violations surfaced by a newly-sighted guard get a **BACKLOG row + explicit per-guard allowlist entry citing it**, not an in-PR fix. Trivial ones (dead class, stale comment, mechanical rename) are fixed in the migration commit that surfaced them. | Backlog fix-shape (BACKLOG.md:914: "triage whatever each newly sees … Doing that inside an unrelated PR would bury them") + owner packaging answer. |
| The YAML stripper (`tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:47`) **stays local** — different comment grammar (`#`), already quote-aware, not in the fail-open class. Allowlisted in the meta-test. | This spec. |
| MDX line-comment policy is preserved exactly: line comments are NOT stripped in `.mdx` (a bare `//` there is prose/URL more often than a comment; a missed comment is a noisy false positive, a truncated line is a silent miss). | `tests/styles/_classScanUtils.ts:51-58` (R20 F1 / R22 lineage). |
| No guard's *scanning* logic changes beyond the comment-stripping step. Behavior changes are limited to what the corrected stripper newly reveals. | This spec, §5 procedure. |

## 2. Inventory (canonical — every other section references this table)

19 definition sites. Line numbers verified against `origin/main` (2411d4450) on 2026-07-26 via `rg -n "function stripComments|const stripComments|stripCommentsSafely|function commentRanges" tests/`.

| # | Site | Shape | Action |
|---|---|---|---|
| 1 | `tests/styles/_newTabScan.ts:2747` (`commentRanges`) + `tests/styles/_newTabScan.ts:2800` (`stripCommentsSafely`) | TS-parser, offset-preserving space-blanking, shebang-aware, all JS line terminators (`LINE_TERMINATORS`, `tests/styles/_newTabScan.ts:45`) | **Canonical source.** Extract to shared module; `_newTabScan.ts` imports (or re-exports) from it. |
| 2 | `tests/styles/_classScanUtils.ts:60` (`stripComments`) + `tests/styles/_classScanUtils.ts:56` (`stripCommentsForFile`) + `tests/styles/_classScanUtils.ts:33` (`stripLineComment`) | Line-based heuristic (the prior PR's fix) | TS/TSX path switches to shared TS-parser stripper; the MDX line-based logic **moves into the shared module** as `stripMdxComments`. `_classScanUtils` keeps `walk`/`tokensOf`, imports strippers. |
| 3 | `tests/help/_metaServerTimeGuard.test.ts:54` | Hand-rolled quote-aware state machine (~100 lines) | Migrate; delete state machine. |
| 4 | `tests/admin/no-inline-email-normalization.test.ts:41` | Naive + `canonicalize-exempt:` line filter | Migrate stripping; keep exempt-line filter local (compose: filter, then strip). |
| 5 | `tests/admin/serverNoClientValueCall.test.ts:48` | Naive | Migrate. |
| 6 | `tests/messages/_metaAdminAlertProducer.test.ts:33` | Naive (line-anchored `//`) | Migrate. |
| 7 | `tests/admin/dev-requires-developer.test.ts:32` | Naive (`//.*$` — also eats URLs) | Migrate. |
| 8 | `tests/help/_metaUiLabelCrosswalk.test.ts:262` | Naive, **exported** | Migrate; update any importers of the export in the same commit. |
| 9 | `tests/help/_metaAffordanceMatrixParity.test.ts:32` | Naive but offset-preserving (space replacement) | Migrate — shared blanking preserves offsets, drop-in. |
| 10 | `tests/crew/stageRestrictionThreading.test.ts:20` | Naive | Migrate. |
| 11 | `tests/sync/_livePartitionClassificationContract.test.ts:48` | Naive | Migrate. |
| 12 | `tests/sync/no-direct-drive-folder-env.test.ts:8` | Naive | Migrate. |
| 13 | `tests/components/admin/_metaPopoverViewportSource.test.ts:77` | Naive | Migrate. |
| 14 | `tests/components/admin/review/reviewModalShell.test.tsx:535` | Naive, space-replacing | Migrate. |
| 15 | `tests/components/admin/wizard/venueTransitionAudit.test.ts:10` | Naive | Migrate. |
| 16 | `tests/db/undo-change-lock-order.test.ts:16` | SQL: naive block regex + `--` line strip | Migrate to shared `stripSqlComments`. |
| 17 | `tests/auth/advisoryLockRpcDeadlock.test.ts:10` | SQL+JS mixed: naive block regex + `--` + `//` | Migrate: `stripSqlComments` for `.sql` inputs; TS stripper for `.ts` inputs (implementation confirms what it scans and composes accordingly). |
| 18 | `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts:47` | YAML `#`, quote-aware line loop | **Keep local**; allowlist in meta-test (§1.1). |
| 19 | `tests/admin/stagedPageRefScan.ts:49` (`commentRanges(src, sourceFile)`) | TS-parser variant, caller-supplied `SourceFile` | Migrate to shared `commentRanges` if drop-in (it may reuse its already-parsed `SourceFile`; if keeping that is materially cheaper, allowlist with a `parser-based, safe` reason instead). |

Counts used elsewhere: **19 sites**, **16 migrating callers** (#2–#17, counting #2's file once), **1 canonical source** (#1), **1 keep-local** (#18), **1 migrate-or-allowlist** (#19).

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
## 3. Shared module — `tests/_shared/stripComments.ts`

<!-- spec-lint: ignore — files created BY this spec; not tracked until implementation lands -->
New directory `tests/_shared/`. Vitest collects only `tests/**/*.test.ts(x)` (`BASE_INCLUDE`, `vitest.projects.ts:34`), so the module itself is never collected as a test; its self-test (`tests/_shared/stripComments.test.ts`) is.

Exports:

- `commentRanges(src: string): [number, number][]` — moved verbatim from `tests/styles/_newTabScan.ts:2747` (parses with `ts.createSourceFile(..., ts.ScriptKind.TSX)`, protects string/template/regex/JSX-text ranges, shebang carve-out, all four JS line terminators).
- `stripCommentsSafely(src: string): string` — moved verbatim from `tests/styles/_newTabScan.ts:2800` (blanks comment ranges with spaces, preserving newlines — offsets and line numbers survive, so both deletion-style and offset-style callers can adopt it).
- `stripMdxComments(src: string): string` — the line-based block-comment logic currently in `tests/styles/_classScanUtils.ts:60` with `lineComments: false` semantics baked in (MDX has JSX block comments but bare `//` is prose; §1.1).
- `stripSqlComments(src: string): string` — new, small: single-quote-aware scan removing `-- …` to end of line and `/* … */` blocks outside quoted strings. Standard-SQL quote escaping (`''`) honored. Dollar-quoted bodies are NOT protected — plpgsql function bodies are code whose comments should strip; the guards scanning them (#16, #17) depend on that.
- `LINE_TERMINATORS` — moved from `tests/styles/_newTabScan.ts:45`; `_newTabScan.ts` re-imports it (it has three other internal uses).

`tests/styles/_newTabScan.ts` and `tests/styles/_metaNewTabAnnouncement.test.ts` (which imports `commentRanges`/`stripCommentsSafely` from `_newTabScan`, `tests/styles/_metaNewTabAnnouncement.test.ts:12-17`) switch to the shared import path; `_newTabScan` may re-export for compatibility during the migration commits but the end state has one definition.

Guard-conditions note (spec-self-review): all four strippers are total functions on strings — empty string returns empty string; input with no comments returns input unchanged (modulo nothing — blanking only touches comment ranges). None throw on malformed source: `ts.createSourceFile` never throws on parse errors (it produces a best-effort tree), and the SQL/MDX scanners are plain loops.

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
## 4. Structural guard — `tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
Filesystem-walked (fails-by-default on NEW files, per invariant-10 discovery style and the class-sweep rule): walk `tests/**/*.{ts,tsx}`, flag any file outside `tests/_shared/stripComments.ts` that defines a comment stripper — detection regex `/(function|const)\s+(stripComments\w*|commentRanges)\b/` on comment-stripped source (using the shared stripper, naturally). Allowlist (each row carries a reason):

- `tests/cross-cutting/picker-flow-e2e-ci-wiring.test.ts` — YAML grammar, quote-aware, not in the fail-open class (§1.1).
- `tests/admin/stagedPageRefScan.ts` — only if #19 lands as allowlist-not-migrate.

The meta-test also pins the inverse: the shared module file EXISTS and exports the four strippers (protects against a future "simplification" deleting the module while the allowlist still references it).

## 5. Migration procedure (per caller — one commit each)

For each row of §2 marked Migrate, in its own commit:

1. Replace the local definition with an import from `tests/_shared/stripComments`. Deletion-style callers take `stripCommentsSafely` output as-is (blanking is a superset: anything they matched on stripped text they still match; they never assert on comment content).
2. Run that guard file (`pnpm vitest run <file>`).
3. Triage anything it newly reports, per §1.1: trivial → fix in this commit; non-trivial → BACKLOG row + per-guard allowlist entry citing it. The suite is never left red.
4. Commit `test(<area>): migrate <file> to shared stripComments` (+ triage notes in body).

Expected-findings caution (BACKLOG.md:914): the prior fix immediately surfaced two apparent violations that were artifacts of an incomplete first fix — so step 3 verifies each new finding against the raw source by hand before classifying it. This is deliberately not a bulk sed.

Commit order: shared module + self-test first (TDD: self-test red → module → green), then callers in §2 order, meta-test last (it can only pass once all locals are gone).

## 6. Test plan

<!-- spec-lint: ignore — file created BY this spec; not tracked until implementation lands -->
- **Self-test `tests/_shared/stripComments.test.ts`** (TDD-first) pins, for the TS stripper: the measured `app/admin/layout.tsx` JSDoc case (a `/admin/*` path inside a comment does not swallow following code — the six-className regression from BACKLOG.md:910); `/*` inside a string literal does NOT open a block; `//` inside a string (protocol-relative `href="//cdn/x"`) survives; `https://` in code survives; regex literal containing `//` survives; shebang survives; offsets/line numbers preserved (a token after a stripped block sits at its original index). For MDX: `[CDN](https://cdn/x)` prose survives; JSX block comment strips. For SQL: `--` strips; `--` inside `'a -- b'` survives; `/* */` strips; `''` escaping honored. Existing pins in `tests/styles/_metaDoublePrefixColorToken.test.ts` (the `_classScanUtils` self-test) migrate or stay green as-is.
- **Per-caller green** after each migration commit (§5 step 2).
- **Meta-test fails-by-default proof:** during development, plant a scratch local `stripComments` copy in a temp test file and confirm the meta-test reds on it (anti-tautology: the guard must be shown to fire, not just to pass).
- **Full suite green** before the whole-diff review.

## 7. Out of scope

- Guard scanning logic beyond comment stripping (tokenizers, walkers, allowlists of the guards themselves).
- The YAML stripper's internals (#18).
- Non-trivial app-code violations a newly-sighted guard reveals (BACKLOG rows, §1.1).
- `scripts/**` or app-side comment handling — this is a `tests/**` refactor.

## 8. Risks

- **A migrated guard reds on real violations** — the point of the exercise; bounded by the §5 triage rule so the PR does not absorb unbounded app fixes.
- **`ts.createSourceFile` cost per scanned file** — these guards already run filesystem walks with regex passes; `_newTabScan`/`stagedPageRefScan` already pay full parses today across the same trees with no suite-time complaint. Accepted.
- **Behavioral deltas from blanking vs deletion** — deletion-style callers that split on `\n` afterward see identical line counts (blanking preserves newlines); callers that matched across a deleted-comment seam (`a/*x*/b` → naive `ab`, blanked `a  b`) could in principle lose a match — no current guard matches tokens spanning a comment (verified per caller at migration time, step 3's by-hand check).
