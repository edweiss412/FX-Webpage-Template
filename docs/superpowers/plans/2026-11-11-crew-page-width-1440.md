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

Browser: a case in `tests/e2e/crew-wide-nav.spec.ts` reads the header's inner row, the body row, the footer's inner row and, on the preview route, the preview banner's inner row. For each it takes the border box and the computed left and right padding. At 1728 each border box is 1440px wide, and each content edge (left plus padding-left, right minus padding-right) matches the body row's within 0.5px. At 1280 each border box is 1280px wide with the same content-edge match; at 1200 and 1024 each is the window's width, as today. Failure caught: one surface left at the old limit, or a surface whose gutter differs, which moves its content edge while its box stays put. Mutants: leave the footer at `max-w-300` (the 1728 width check fails); change the footer's `sm:px-8` to `sm:px-4` (the content-edge check fails).

## Task 2: Rooms thumbnails at the new width

<!-- task: red=`pnpm vitest run tests/components/crew/sections/RoomsSection.test.tsx` ac=AC-4 -->

RED: `tests/components/crew/sections/RoomsSection.test.tsx` asserts the gallery's `sizes` attribute is spec §2's declaration exactly. Fails today: the declaration is `(min-width: 1024px) 200px, (min-width: 640px) 100px, 26vw`.

GREEN: measure the column's inset at 1280 and 1728 in a browser first (rendered thumbnail width against `100vw`), then write `components/crew/sections/RoomsSection.tsx:52` from it; `components/diagrams/Gallery.tsx:116-118`'s comment drops the old limit.

Browser: a case in `tests/e2e/crew-wide-nav.spec.ts`, on a show with diagrams, reads a rendered Rooms thumbnail's width at 1280 and at 1728 and asserts each is within 8px of the declared size evaluated at that width (the `calc` at 1280, 256 at 1728). Failure caught: a declared size that drifts from the layout it describes. Below 1024px the declaration's entries are unchanged, which the unit RED pins.

<!-- tasks: end -->

## Closeout

In order: the full unit suite and the crew e2e specs; the invariant-8 UI gate on the diff, recorded in this plan's §12; any moved help screenshots regenerated through `screenshots-regen.yml`; whole-diff cross-model review to APPROVE; push, CI green, merge, fast-forward `main`, verify `0  0`.
