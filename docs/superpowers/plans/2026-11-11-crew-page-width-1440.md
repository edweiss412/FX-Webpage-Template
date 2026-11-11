# Crew page desktop width 1440px: implementation plan

**Spec:** `docs/superpowers/specs/2026-11-11-crew-page-width-1440-design.md`. **Branch:** `feat/crew-page-width-1440`, a worktree off `origin/main` at `5b240e09e`. **Implementer:** Opus / Claude Code (UI work).

Spec §3's criteria, by task: AC-1, AC-2 and AC-3 in Task 1, AC-4 in Task 2.

## Meta-test inventory

Creates none and extends none. `tests/help/_metaRenderFaultMarking.test.ts` runs in each commit gate in case a line moves above a fault branch.

## Commit gate (every task)

`pnpm typecheck`, eslint and prettier on the touched files, the task's `red=` command, `pnpm vitest run tests/components/admin/wizard/adminSectionDom.test.tsx` with no golden changed, and `pnpm vitest run tests/help/_metaRenderFaultMarking.test.ts`.

## E2E harness rules

`CI=1 BASELINE_SERVER_ONLY=1 TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres pnpm heavy pnpm exec playwright test <files> --retries=0`, port 3000 free, the seed fresh from `pnpm db:seed` under the same variable. The existing helpers await `data-crew-controller-ready=true`.

<!-- tasks: depth=2 -->

## Task 1: One 1440px limit for the crew page and its chrome

<!-- task: red=`pnpm vitest run tests/components/layout/Header.search.test.tsx tests/components/crew/loading.test.tsx tests/components/layout/crewWidth.test.tsx` ac=AC-1,AC-2,AC-3 -->

RED: tests/components/layout/crewWidth.test.tsx (new) renders the header, footer, preview banner and staged preview banner, and asserts each width row carries `max-w-360` and none carries `max-w-300` or `max-w-[1200px]`, and that `CREW_PAGE_CONTAINER` carries `max-w-360`. `tests/components/layout/Header.search.test.tsx:61` and `tests/components/layout/Header.search.test.tsx:166` pin the header's class string and move with it. Fails today: every surface carries the old limit.

GREEN: spec §2's table, each class replaced; `lib/crew/pageContainer.ts`'s comment names the new limit; `DESIGN.md:906` corrected.

Browser: a case in `tests/e2e/crew-wide-nav.spec.ts` at 1728 reads the rects of the header's inner row, the body row, the footer's inner row and, on the preview route, the preview banner's inner row, and asserts each is 1440px wide and all share a left edge within 0.5px; at 1280 each equals the window width. Failure caught: one surface left at 1200px, or a surface whose padding differs so its edge moves. Mutant: leave the footer at `max-w-300` (fails the 1440 check).

## Task 2: Rooms thumbnails at the new width

<!-- task: red=`pnpm vitest run tests/components/crew/sections/RoomsSection.test.tsx` ac=AC-4 -->

RED: `tests/components/crew/sections/RoomsSection.test.tsx` asserts the gallery's `sizes` attribute starts with `(min-width: 1440px) 264px`. Fails today: the declaration starts at 1024px.

GREEN: `components/crew/sections/RoomsSection.tsx:52` gains the entry; `components/diagrams/Gallery.tsx:116-118`'s comment drops the old limit.

Browser: at 1728 a case in `tests/e2e/crew-wide-nav.spec.ts` reads a rendered Rooms thumbnail's width and asserts it is within 8px of 264, on a show with diagrams; at 390 the declared size the phone uses is unchanged. Failure caught: a declared size that drifts from the layout it describes.

<!-- tasks: end -->

## Closeout

In order: the full unit suite and the crew e2e specs; the invariant-8 UI gate on the diff, recorded in this plan's §12; any moved help screenshots regenerated through `screenshots-regen.yml`; whole-diff cross-model review to APPROVE; push, CI green, merge, fast-forward `main`, verify `0  0`.
