/**
 * components/admin/review/attentionMark.ts
 *
 * THE one place an attention-pill leading or segment mark is described.
 *
 * Why this exists as a module rather than as care. Below `sm` the review pills
 * render COUNTS ONLY (Eric's Decision 7), so the mark carries the whole
 * distinction between "3 issues" and "3 sheet warnings" on a phone, and it
 * carries it in SHAPE because no ink can: `--color-status-review` is a mid-tone
 * amber and no token clears the 3:1 non-text floor against it in both modes.
 * The vocabulary is registered as PILLMARK-1 in DESIGN.md.
 *
 * Four review rounds in one arc found the SAME defect: a mark decision applied
 * to one pill and not its twin. Decision 7 itself, then the leading-dot repair,
 * then the middot contrast floor, then the per-segment mark. Each was repaired
 * by hand on both pills, and the next one diverged again. Vigilance failed four
 * times; this module makes divergence impossible by construction, because there
 * is no second place to change.
 *
 * GROUND-AWARENESS is the part that is easy to get wrong, and this arc got it
 * wrong twice. A ring's contrast is a property of the PLATE it paints on, not of
 * the component it lives in:
 *
 *   neutral ring on `warning-bg`      text-faint  1.179* / 2.793  FAILS dark
 *                                     text-subtle 6.128  / 4.717  clears
 *   neutral ring on `surface-sunken`  text-faint  3.02   / 4.11   clears
 *                                     text-subtle 6.094  / 6.941  clears
 *   positive ring on `warning-bg`     status-positive 3.680 / 6.598 clears
 *   positive ring on `surface-sunken` status-positive 3.660 / 9.709 clears
 *
 * (*the 1.179 figure is faint against the status-review FILL, the R3 P0.)
 *
 * So `judgment` takes a different ink on each plate. That is not an
 * inconsistency to tidy away later; it is the correct answer to two different
 * questions, and `tests/components/admin/attentionMarkParity.test.ts` recomputes
 * every row above from `app/globals.css` so a token edit fails here rather than
 * shipping an invisible mark.
 */

/** Which state the mark stands for. */
export type AttentionMarkKind =
  /** Actionable issues. Filled circle: the loudest mark, and the work ink. */
  | "issues"
  /** Sheet warnings. Filled TRIANGLE — a warning silhouette, per KINDDOT-1's
   *  rule that a third shape must carry a semantic rather than merely differ.
   *  Shares the issues fill deliberately, so SHAPE is provably the carrier. */
  | "warnings"
  /** Self-healing / monitoring. Hollow positive ring: present, but not work. */
  | "monitoring"
  /** A judgment call the operator must make. Hollow neutral ring. */
  | "judgment";

/** The surface the mark paints ON, which decides a neutral ring's ink. */
export type AttentionMarkPlate =
  /** The attention plate — the pill when it carries attention. */
  | "warning"
  /** The quiet plate — the pill when there is nothing to act on. */
  | "sunken";

/** Every mark occupies the SAME 8px box so a state flip never reflows a row,
 *  which is KINDDOT-1's standing requirement for a shape channel. */
const BOX = "size-2 shrink-0";

/** A three-point clip. The point COUNT is the whole difference between this and
 *  the four-point square the arc retired, and it is asserted as a count. */
const TRIANGLE = "[clip-path:polygon(50%_0%,100%_100%,0%_100%)]";

const RING = "border-[1.5px]";

/**
 * The complete `className` for one attention mark.
 *
 * Both review pills call this and neither builds a mark string of its own; the
 * parity test walks `components/` and fails on any hand-rolled mark.
 */
export function attentionMarkClass(kind: AttentionMarkKind, plate: AttentionMarkPlate): string {
  switch (kind) {
    case "issues":
      return `${BOX} rounded-pill bg-status-review`;
    case "warnings":
      return `${BOX} bg-status-review ${TRIANGLE}`;
    case "monitoring":
      // `status-positive` clears the non-text floor on BOTH plates, so this ring
      // does not vary; the plate is still taken so every call site states the
      // ground it paints on and a later token change has one place to check.
      return `${BOX} rounded-pill ${RING} border-status-positive bg-transparent`;
    case "judgment":
      return `${BOX} rounded-pill ${RING} ${
        plate === "warning" ? "border-text-subtle" : "border-text-faint"
      } bg-transparent`;
  }
}
