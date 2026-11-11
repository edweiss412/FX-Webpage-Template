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

Browser: a case in `tests/e2e/crew-wide-nav.spec.ts` reads the header's inner row, the body row, the footer's inner row and, on the preview route, the preview banner's inner row. For each it takes the border box and the computed left and right padding. At 1728 each border box is 1440px wide, and each content edge (left plus padding-left, right minus padding-right) matches the body row's within 0.5px. At 1280, 1200 and 1024 each border box fills the space the page has, the window less the admin layout's 64px of padding on this preview route, with the same content-edge match. Failure caught: one surface left at the old limit, or a surface whose gutter differs, which moves its content edge while its box stays put. Mutants: leave the footer at `max-w-300` (the 1728 width check fails); change the footer's `sm:px-8` to `sm:px-4` (the content-edge check fails).

## Task 2: Rooms thumbnails at the new width

<!-- task: red=`pnpm vitest run tests/components/crew/sections/RoomsSection.test.tsx` ac=AC-4 -->

RED: `tests/components/crew/sections/RoomsSection.test.tsx` asserts the gallery's `sizes` attribute is spec §2's declaration exactly. Fails today: the declaration is `(min-width: 1024px) 200px, (min-width: 640px) 100px, 26vw`.

GREEN: measure the column's inset at 1280 and 1728 in a browser first (rendered thumbnail width against `100vw`), then write `components/crew/sections/RoomsSection.tsx:52` from it; `components/diagrams/Gallery.tsx:116-118`'s comment drops the old limit.

Browser: a case in `tests/e2e/crew-wide-nav.spec.ts`, on a show with diagrams, reads a rendered Rooms thumbnail's width at 1280 and at 1728 and asserts each is within 8px of the declared size evaluated at that width (the `calc` at 1280, 256 at 1728). Failure caught: a declared size that drifts from the layout it describes. Below 1024px the declaration's entries are unchanged, which the unit RED pins.

<!-- tasks: end -->

## Closeout

In order: the full unit suite and the crew e2e specs; the invariant-8 UI gate on the diff, recorded in this plan's §12; any moved help screenshots regenerated through `screenshots-regen.yml`; whole-diff cross-model review to APPROVE; push, CI green, merge, fast-forward `main`, verify `0  0`.

## 12. Invariant-8 UI quality gate

Run on 2026-11-11 against `e4f1d80de` to `26eacc4cf`, on this branch's diff (`git diff origin/main..HEAD -- app components lib DESIGN.md`). Both passes ran with their setup gates: the context load of `PRODUCT.md` and `DESIGN.md`, then the register read. The critique ran as two isolated assessments, a design review and the detector with browser evidence, and scored 30/40; the audit scored 17/20. Together they raised 0 P0 and 0 P1. Measured in Chromium at 1024, 1280, 1440, 1728 and 2048, light and dark: header, body, footer and banner rows aligned to 0.0px, no overflow at any width or at 200% zoom on a 1440 window, Rooms thumbnails within 2.5px of their declared size, detector 0 findings on the changed files. Not reached: Safari and iOS, the staged wizard preview, the live admin preview banner (its row was measured as a copy inside the page, and `tests/e2e/crew-wide-nav.spec.ts` measures it on the preview route).

| # | Pass | Tier | Where | Finding | Disposition |
| --- | --- | --- | --- | --- | --- |
| 1 | both | P2 | `components/crew/sections/HomeSection.tsx`, `components/crew/sections/VenueSection.tsx` | Show and venue notes ran about 150 characters a line at 1440px, past DESIGN.md's 65 to 75 character measure. | Fixed, `08c6f164a`: the note text caps at 75ch; the card still fills the column. |
| 2 | both | P2 | `components/show-panels/RoomsBody.tsx` | A room's equipment list runs up to 144 characters a line from 1440px. | Accepted: the body is shared with the admin popup, whose DOM is pinned, and the owner chose the width knowing rows lengthen. Recorded in spec §5. |
| 3 | critique | P2 | fact rows, crew roster | Labels sit up to 580px from their values, and call buttons about 680px from names. | Accepted, recorded in spec §5: the owner declined the two-column layout that would have shortened rows. |
| 4 | critique | P3 | `components/crew/sections/RoomsSection.tsx` | Above about 1427px a 1x screen fetched the 512 image tier for a 259.5px thumbnail. | Fixed, `08c6f164a`: 256px declared above 1440, within the 8px check. |
| 5 | both | P3 | `components/crew/sections/RoomsSection.tsx`, `components/crew/CrewPass.tsx`, `DESIGN.md` | Comments and the section-width table named the old geometry. | Fixed, `08c6f164a`. |
| 6 | audit | P3 | `components/crew/CrewPass.tsx` | The pass's fact grid turns three-column from about 1388px, a state the tests cover only at phone widths. | Accepted: the pass's own container query, unchanged; the gate measured 158px cells at 1440, readable. |
| 7 | audit | P3 | `components/crew/CrewLoadingSkeleton.tsx` | Skeleton day-row slots stretch to 129px at 1440 against loaded buttons of 64 to 76px. | Accepted: a placeholder for under a second. |
| 8 | critique | P3 | single-fact cards, the header status pill | Billing and Venue status read mostly empty at 1104px; the status pill sits by the search box. | Accepted: the owner declined two columns; the pill predates this. |
| 9 | critique | P3 | `components/offline/SavedCopyBar.tsx` | The saved-copy bar is full width, not on the 1440 column. | Outside this diff; it was full width before too. |

impeccable-gate: critique=RAN audit=RAN p0=0 p1=0 dispositions=none
