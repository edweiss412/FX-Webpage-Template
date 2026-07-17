/**
 * The render SITE a warning control is mounted at (spec 2026-07-17
 * §4). Orthogonal to `surface` (which picks the server action): one
 * surface (wizard) hosts two sites (`callout` preview + full `list`).
 * Threaded mount → boundary → shared control to disambiguate the leaf
 * testids of a warning that renders at more than one site.
 */
export type WarningControlSite = "callout" | "list" | "showpage";
