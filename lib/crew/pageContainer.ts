/**
 * lib/crew/pageContainer.ts — the single source of truth for the crew page's
 * horizontal centering container.
 *
 * The crew section controller (`components/crew/CrewSections.tsx`) composes
 * this string on the row that holds the wide nav and the
 * `<main data-testid="page-container">` column, and the header uses the same
 * gutter, so the page content's left edge lines up with the header's (Task 8.5,
 * the "desktop off-center" fix). One constant means the surfaces can never
 * drift: change the gutter / max-width here once.
 *
 * Centering utilities ONLY — `mx-auto` (horizontal center), `w-full` (fill up
 * to the cap), `max-w-300` (the project's ~1200px container token), and the
 * `px-4 sm:px-8` gutter. Surface-specific utilities (the shell's flex/padding,
 * the nav's flex/gap) are appended by each consumer, NOT baked in here.
 */
export const CREW_PAGE_CONTAINER = "mx-auto w-full max-w-300 px-4 sm:px-8";
