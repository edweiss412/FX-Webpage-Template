/**
 * tests/components/admin/showpage/_rowWrapperScan.ts
 *
 * Pure source scanner for the Careful row wrappers. Extracted from the
 * meta-test so the SCANNER ITSELF can be unit-tested against fixture strings —
 * adversarial review found a false-positive risk in an earlier inline version
 * (it recognised only one source spelling), and a scanner that silently matches
 * nothing is worse than no scanner at all.
 */

/** The wrapper's prescribed SOURCE spelling. This is a deliberate source-form
 *  contract, documented in the plan: the wrapper is written with the literal
 *  class string, never assembled (`WRAPPER_CLASSES.join(" ")`) or conditional,
 *  so a source scan can find it. */
export const WRAPPER_LITERAL = 'className="flex w-full flex-col gap-2"';

export type WrapperScan = {
  /** Every `<div …>` opening carrying the wrapper's literal class string. */
  openings: string[];
  /** Openings that carry an `on*` event prop. */
  withHandlers: string[];
  /** Openings that carry a JSX spread, which can smuggle handlers past a
   *  prop-name scan (`const p = { onDoubleClick: … }; <div {...p} …>`). */
  withSpreads: string[];
};

export function scanRowWrappers(src: string): WrapperScan {
  const openings = [...src.matchAll(/<div\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => tag.includes(WRAPPER_LITERAL));

  return {
    openings,
    withHandlers: openings.filter((tag) => /\bon[A-Z][A-Za-z]*\s*=/.test(tag)),
    withSpreads: openings.filter((tag) => /\{\s*\.\.\./.test(tag)),
  };
}
