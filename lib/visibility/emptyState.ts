/**
 * lib/visibility/emptyState.ts — per-field empty-state predicate table
 * (M4 Task 4.14, spec §8.3 / §10).
 *
 * Why per-field (and NOT a single blanket predicate):
 *
 *   An earlier draft applied a blanket rule treating `null`, `''`,
 *   `'TBD'`, `'N/A'`, `'TBA'` (case-insensitive) as "not filled in"
 *   for every optional field. That rule is wrong for
 *   `event_details.opening_reel`: spec §10 explicitly says when the
 *   cell is text-only with values like `YES`, `MAYBE`, `N/A` the crew
 *   page renders a small text line `Opening reel: <value>`. Blanket-
 *   hiding `N/A` would erase a documented crew-visible status.
 *
 *   So this module exposes a small dispatch table:
 *
 *     - `shouldHideOpeningReel(value)`  — opening_reel-specific. Hides
 *       only `''` and `TBD` (and any cell whose URL-stripped residue is
 *       empty — i.e. pure-URL cells per §10's render contract).
 *
 *     - `shouldHideGenericOptional(value)` — every other optional field
 *       (power, internet, keynote_requirements, scenic, ...). Hides
 *       `''`, `TBD`, `N/A`, `TBA` (case-insensitive after trim).
 *
 *   When more fields acquire bespoke sentinel rules (e.g., a hypothetical
 *   `dress_code` that wants to keep `N/A` as a status), add a third
 *   exported predicate here. Tiles MUST NOT inline string-list checks —
 *   every visibility decision routes through this module so the rule
 *   lives in one place.
 *
 * Tile usage:
 *
 *   Tiles import `shouldHideOpeningReel` / `shouldHideGenericOptional`
 *   and gate the corresponding `<KeyValue>` row on the predicate's
 *   negation. For opening_reel specifically, the tile additionally
 *   passes the value through `stripOpeningReelText` before rendering
 *   so the `https://` substring never reaches the DOM (§10 invariant).
 *
 * Required-field placeholders (§8.3 — required field missing inside a
 * rendered tile) are a separate concern; tiles render the
 * `<EmptyState />` atom directly with a per-field `label` override.
 *
 * Pure functions — no I/O, deterministic.
 */

import { stripOpeningReelText } from "./openingReelText";

/** opening_reel hide set (case-insensitive after trim, post-strip). */
const OPENING_REEL_HIDE = new Set<string>(["", "TBD"]);

/** Generic optional-field hide set (case-insensitive after trim). */
const GENERIC_OPTIONAL_HIDE = new Set<string>(["", "TBD", "N/A", "TBA"]);

/**
 * §10-aware predicate for `event_details.opening_reel`.
 *
 *   - null / empty / whitespace-only → hide.
 *   - `TBD` (any case) → hide.
 *   - Pure-URL cells (the URL strip leaves nothing) → hide.
 *   - `YES`, `MAYBE`, `N/A`, `TBA`, `BACKUP ONLY`, `LOOP VIDEO`, ... → render.
 *   - Mixed `YES - <url>` → render (residue is `YES`).
 */
export function shouldHideOpeningReel(value: string | null): boolean {
  if (value == null) return true;
  const stripped = stripOpeningReelText(value);
  return OPENING_REEL_HIDE.has(stripped.toUpperCase());
}

/**
 * Generic-optional predicate for fields like `power`, `internet`,
 * `keynote_requirements`, `scenic`, etc. Hides the universally-meaningless
 * sentinels (`''`, `TBD`, `N/A`, `TBA`) so the tile-level field list
 * skips them entirely.
 */
export function shouldHideGenericOptional(value: string | null): boolean {
  if (value == null) return true;
  return GENERIC_OPTIONAL_HIDE.has(value.trim().toUpperCase());
}

/**
 * Whole-tile-missing predicate for `<DiagramsTile>` (M9 C6 / M7-D5).
 *
 * The tile aggregates two media domains:
 *   - `diagrams.embeddedImages` + `diagrams.linkedFolderItems` (the
 *     gallery)
 *   - `agendaLinks[*].fileId` (the inline agenda PDF)
 *
 * The tile only renders when at least ONE of those domains has content;
 * both empty → §8.3 whole-tile-missing reflow (return null). The boolean
 * combination was previously inlined in the View. Extracting it here so:
 *   (a) the visibility decision lives in one place alongside the
 *       sentinel-hiding helpers, and
 *   (b) future surfaces that want to ask "is there ANYTHING to show in
 *       the diagrams/agenda domain?" route through the same predicate.
 *
 * Pure function — no I/O, deterministic.
 */
type DiagramsLike = {
  embeddedImages?: readonly unknown[];
  linkedFolderItems?: readonly unknown[];
} | null;

type AgendaLinkLike = {
  fileId?: string;
  // AgendaLink (components/agenda/AgendaEmbed.tsx) also carries label
  // and url fields. The predicate only cares about fileId presence
  // (PDF embeds need a Drive file id), so other keys are ignored —
  // the loose `unknown` index keeps the type compatible with the
  // real AgendaLink without coupling the visibility module to that
  // component file.
  [key: string]: unknown;
};

export function shouldHideDiagrams(
  diagrams: DiagramsLike,
  agendaLinks: ReadonlyArray<AgendaLinkLike>,
): boolean {
  const embeddedCount = diagrams?.embeddedImages?.length ?? 0;
  const linkedCount = diagrams?.linkedFolderItems?.length ?? 0;
  const hasItems = embeddedCount + linkedCount > 0;
  const hasAgendaPdf = agendaLinks.some((link) => Boolean(link.fileId));
  return !hasItems && !hasAgendaPdf;
}
