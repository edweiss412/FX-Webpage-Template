/**
 * lib/crew/pageContainer.ts — the single source of truth for the crew page's
 * horizontal centering container.
 *
 * Both the crew shell's `<main data-testid="page-container">`
 * (`app/show/[slug]/[shareToken]/_CrewShell.tsx`) AND the desktop sub-nav row
 * (`components/crew/CrewSubNav.tsx`) compose this string so the first sub-nav
 * tab's left edge aligns pixel-for-pixel with the section content's left edge
 * (Task 8.5 — the "desktop off-center" fix). Extracting the constant means the
 * two surfaces can never drift: change the gutter / max-width here once.
 *
 * Centering utilities ONLY — `mx-auto` (horizontal center), `w-full` (fill up
 * to the cap), `max-w-300` (the project's ~1200px container token), and the
 * `px-4 sm:px-8` gutter. Surface-specific utilities (the shell's flex/padding,
 * the nav's flex/gap) are appended by each consumer, NOT baked in here.
 */
export const CREW_PAGE_CONTAINER = "mx-auto w-full max-w-300 px-4 sm:px-8";
