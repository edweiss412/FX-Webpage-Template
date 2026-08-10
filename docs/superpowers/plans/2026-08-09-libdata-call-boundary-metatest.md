# Plan — `lib/data` Supabase call-boundary meta-test

**Spec:** `docs/superpowers/specs/ci/2026-08-09-libdata-call-boundary-metatest-design.md` (converged R4-repaired; round record `docs/review-rounds/test/libdata-call-boundary-metatest/b2a9122935c8.md`) · **Branch:** `test/libdata-call-boundary-metatest` · **Ledger:** `BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST`

Implementer: Opus / Claude Code (test-only arc; no UI surface). `impeccable-gate: N/A — no UI surface`

## Meta-test inventory (mandatory declaration)

CREATES: `tests/data/_metaLibDataCallBoundary.test.ts` (this arc's deliverable). EXTENDS: none — `tests/auth/_metaInfraContract.test.ts` stays byte-identical (spec §1.1); no other registry-bearing meta-test changes. The new suite self-registers by existing: vitest's default globs pick up `tests/data/*.test.ts` (siblings run in CI today — no `testMatch`/workflow wiring change needed; verified: sibling `tests/data/listShowsForCrew.test.ts` runs in the unit suite).

## Pre-draft verification transcript (run 2026-08-09)

- Corpus: `grep -rn '\.\(from\|rpc\)("' lib/data/*.ts` → 17 hits / 4 files (spec §4 table); complement probe → 2 non-Supabase lines (`Array.from(`, doc-comment prose).
- Result variables read from source: `lookup`(:359) `showRes`(:387) `crewRes`(:470) `hotelRes`(:527) `roomRes`(:556) `transRes`(:590) `contactsRes`(:659) `r`(:689) `internalRes`(:731) `versionRpc`(:894) in `lib/data/getShowForViewer.ts`; `tokens/tokenErr`+`shows/showErr` in `listShowsForCrew.ts`; try/catch + `const { data, error } = result` in `loadShowShareToken.ts`.
- Exports: `rg '^export async function' lib/data/adminEmails.ts` → `listAdminEmails`(:91) `addAdminEmail`(:112) `revokeAdminEmail`(:149) `setAdminDeveloper`(:189); wrapper `wrapInfra`(:380).
- Suite symbols: `listAdminEmails` ×7 in `tests/data/adminEmails.test.ts`; `upsert_admin_email_rpc`/`revoke_admin_email_rpc` literals present there; `setAdminDeveloper` ×16 in `tests/data/setAdminDeveloper.test.ts`.
- Helpers exist: `tests/_shared/stripComments.ts` (`stripCommentsForFile`), `tests/_shared/premise.ts` (`premise`).

## Registry (authoritative snippet — typechecked with `tsc --noEmit` before dispatch)

```ts
type SiteRow = { kind: "from" | "rpc"; literal: string } & (
  | { pin: [RegExp, ...RegExp[]] }
  | { coveredBy: [string, ...string[]]; via: string }
);

const REGISTRY: Record<string, SiteRow[]> = {
  "lib/data/adminEmails.ts": [
    { kind: "from", literal: "admin_emails", coveredBy: ["tests/data/adminEmails.test.ts"], via: "listAdminEmails" },
    { kind: "rpc", literal: "upsert_admin_email_rpc", coveredBy: ["tests/data/adminEmails.test.ts"], via: "addAdminEmail" },
    { kind: "rpc", literal: "revoke_admin_email_rpc", coveredBy: ["tests/data/adminEmails.test.ts"], via: "revokeAdminEmail" },
    { kind: "rpc", literal: "set_admin_developer_rpc", coveredBy: ["tests/data/setAdminDeveloper.test.ts"], via: "setAdminDeveloper" },
  ],
  "lib/data/loadShowShareToken.ts": [
    { kind: "rpc", literal: "admin_read_share_token",
      pin: [/supabase\.rpc\("admin_read_share_token"/, /const \{ data, error \} = result/, /if \(error\)/] },
  ],
  "lib/data/listShowsForCrew.ts": [
    { kind: "rpc", literal: "my_share_tokens_for_email",
      pin: [/const \{ data: tokens, error: tokenErr \} = await supabase\.rpc\("my_share_tokens_for_email"\)/, /if \(tokenErr\)/] },
    { kind: "from", literal: "shows",
      pin: [/const \{ data: shows, error: showErr \} = await supabase\s*\n?\s*\.from\("shows"\)/, /if \(showErr\)/] },
  ],
  "lib/data/getShowForViewer.ts": [
    { kind: "from", literal: "crew_members", pin: [/const lookup = await supabase[\s\S]{0,80}?\.from\("crew_members"\)/, /if \(lookup\.error\)/] },
    { kind: "from", literal: "shows", pin: [/const showRes = await supabase\.from\("shows"\)/, /if \(showRes\.error\)/] },
    { kind: "from", literal: "crew_members", pin: [/const crewRes = await supabase[\s\S]{0,80}?\.from\("crew_members"\)/, /if \(crewRes\.error\)/] },
    { kind: "from", literal: "hotel_reservations", pin: [/const hotelRes = await supabase[\s\S]{0,80}?\.from\("hotel_reservations"\)/, /if \(hotelRes\.error\)/] },
    { kind: "from", literal: "rooms", pin: [/const roomRes = await supabase\.from\("rooms"\)/, /if \(roomRes\.error\)/] },
    { kind: "from", literal: "transportation", pin: [/const transRes = await supabase[\s\S]{0,80}?\.from\("transportation"\)/, /if \(transRes\.error\)/] },
    { kind: "from", literal: "contacts", pin: [/const contactsRes = await supabase\.from\("contacts"\)/, /if \(contactsRes\.error\)/] },
    { kind: "from", literal: "shows_internal", pin: [/const r = await supabase[\s\S]{0,80}?\.from\("shows_internal"\)[\s\S]{0,80}?\.select\("run_of_show"\)/, /if \(r\.error\)/] },
    { kind: "from", literal: "shows_internal", pin: [/const internalRes = await supabase[\s\S]{0,80}?\.from\("shows_internal"\)[\s\S]{0,80}?\.select\("financials"\)/, /if \(internalRes\.error\)/] },
    { kind: "rpc", literal: "viewer_version_token", pin: [/const versionRpc = await supabase\.rpc\("viewer_version_token"/, /if \(versionRpc\.error\)/] },
  ],
};
```

Registry count reconciliation (authored AND run): rows per file 4/1/2/10 = 17 total, matching the §4 probe's 17 extracted sites; the two same-literal pairs (`crew_members`, `shows_internal`) are order-distinguished and their pins name distinct result variables (spec §6.6). Every `pin` row's first element embeds its literal (validateRows rule 2); every `coveredBy` row's suite contains literal-or-via (verified above).

<!-- tasks: depth=2 -->

## Task 1 — scanner + validation self-tests (Layer 3 first, RED)

<!-- task: red=`pnpm vitest run tests/data/_metaLibDataCallBoundary.test.ts` ac=AC-5,AC-7 -->

Create `tests/data/_metaLibDataCallBoundary.test.ts` starting with the planted self-test describes (spec §3.5): scanner positives (`.from("x")`, `.rpc('x')`, `` .from(`x`) ``, `.rpc<T>("x")`, `.from<A, B>("x")` incl. multi-line generic), scanner negatives (`Array.from(iterable)`, `Array.from({length:n})`, commented call, `.from(tableVar)`, `` .from(`${t}`) ``, parenthesized generic), `validateRows()` rejections (empty `pin`/`coveredBy`, pins lacking the literal, empty/prefix-typo `via`, suites mentioning neither literal nor via), waiver recognition (blank-reason NO, in-string NO, well-formed comment YES). RED: the scanner/validateRows/waiver functions don't exist yet — the import fails, then each planted assertion fails against a stub. Implement `SUPABASE_CALL_RE` (spec §3.2 final form with generic segment), `extractSites()`, `validateRows()`, `isWaived()` in the same file until green. Both premises (`premise("lib/data files walked", files.length, 3)`, `premise("Supabase call sites found", totalSites, 10)`) execute unconditionally in the suite body — NOT inside `.each` callbacks. Anti-tautology: each planted negative states the concrete failure mode it catches (comment-strip removal, `$`-class removal, generic-segment removal).

## Task 2 — registry + reconciliation + orphan scan (RED against live corpus)

<!-- task: red=`pnpm vitest run tests/data/_metaLibDataCallBoundary.test.ts` ac=AC-1,AC-2,AC-3,AC-4 -->

Add the disk walk (extension set `/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/`), Layer 1 orphan scan, and Layer 2 reconciliation with an EMPTY registry first — RED names all four live files as undischarged (a real-corpus RED: it fails because `lib/data/getShowForViewer.ts` etc. contain live call sites the registry doesn't cover, not because of any test-local fixture). Then paste the authoritative REGISTRY snippet above; green. Assert ordered deep-equality both directions per file; `coveredBy` executable checks (path exists, contains literal-or-via as whole word, `via` ∈ anchored export set of the source file). During this task's RED verification, also delete one registry row and confirm red (AC-2's self-test), restoring it before commit.

## Task 3 — stale-waiver reword (only production-file edit)

<!-- task: red=`pnpm vitest run tests/data/_metaLibDataCallBoundary.test.ts tests/data/getShowForViewerRunOfShow.test.ts` ac=AC-6 -->

In `lib/data/getShowForViewer.ts`, reword the `run_of_show` waiver comment (currently `// not-subject-to-meta: lib/data is outside _metaInfraContract's auth-domain scan …`) to name the real discharge: registry-pinned by `tests/data/_metaLibDataCallBoundary.test.ts`, behaviorally covered by `tests/data/getShowForViewerRunOfShow.test.ts`. RED step: first ADD a temporary assertion to the meta-test that the file's waiver text does not contain the stale phrase "outside _metaInfraContract" — red against current tree; reword; green. (The assertion stays: it pins the reword.) The second waiver comment (`projected from the already-fetched shows row`, non-call site) is untouched. Comment-only diff to production; `tests/data/getShowForViewerRunOfShow.test.ts` must stay green (fail-soft behavior unchanged).

## Task 4 — gates + ship

<!-- task: red=`pnpm test` ac=AC-8 -->

Full local gates before push: `pnpm test` (full suite), `pnpm exec tsc --noEmit` (typecheck incl. the test file), `pnpm exec eslint tests/data/_metaLibDataCallBoundary.test.ts lib/data/getShowForViewer.ts`, `pnpm format:check`. Whole-diff codex review (fresh-eyes brief; REVIEWER ONLY; consequence bound + fence from spec §1.3-1.4; convergence = the §5 F1-F12 family table, each family's kill mechanism demonstrated by the planted self-tests). Push → real CI green (all 12 required contexts) → invariant-12 marker off in the last commit → `gh pr merge --merge` → fast-forward main, verify `0  0`.

<!-- tasks: end -->

## Invariant checklist

- Invariant 1 (TDD): every task above has a RED naming the production/corpus condition that fails it.
- Invariant 2 (advisory locks): N/A — no mutation path touched; zero lock code.
- Invariant 9: the meta-test IS the invariant-9 enforcement for `lib/data`; its own Supabase usage is nil.
- Invariant 10: N/A — no mutation surface.
- Invariant 11: work in `../FX-worktrees/libdata-call-boundary-metatest` (this worktree).
- Invariant 12: marker on `BL-LIBDATA-SUPABASE-CALL-BOUNDARY-METATEST` comes off in the PR's last commit.
- AC map (spec §7): AC-1 (suite exists, unit-suite wired, green on tree — Task 2); AC-2 (disk discovery + row-deletion red — Task 2); AC-3 (17 rows, 13 pins + 4 coveredBy with via symbols — Task 2); AC-4 (ordered deep-equality both directions, no authored count, executable coveredBy — Task 2); AC-5 (planted positives/negatives incl. documented-limit shapes — Task 1); AC-6 (stale waiver reworded — Task 3); AC-7 (both premises unconditional — Task 1); AC-8 (full suite + real CI green — Task 4).
