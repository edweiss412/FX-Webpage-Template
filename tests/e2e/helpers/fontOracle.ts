// The byte-derived font oracle.
//
// WHY A WIDTH ORACLE AT ALL. Three cheaper formulations were measured against a
// real Arial aliased as `Inter`, and all three are worthless alone:
//
//   computed font-family        `Inter, "Inter Fallback", ...`  IDENTICAL
//   document.fonts family set   `Inter:loaded`                  IDENTICAL
//   width vs a TOKEN-derived reference                          tautological
//   width vs an expectation from the COMMITTED BYTES   delta 9.774 vs 0.008
//
// Only the last discriminates, at roughly a 1200x margin. It is also
// environment-independent by construction: the expectation derives from the
// same bytes the browser renders, so there is no pinned literal to rot across
// platforms, Chromium builds or CI images -- the failure mode the byte-gate
// discipline in AGENTS.md exists to prevent.
//
// NO TEST-FRAMEWORK IMPORT: Playwright specs and the shared fixture both import
// this.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// fontkit exports NAMED functions and no default; `import fontkit from "fontkit"`
// resolves to undefined under ESM.
import { create, type Font } from "fontkit";

import { PUBLIC_FONT_PATH } from "../../helpers/fontManifest";

const REPO_ROOT = resolve(__dirname, "..", "..", "..");

let cached: Font | undefined;

/** The committed binary, opened once. */
function font(): Font {
  if (!cached) {
    const opened = create(readFileSync(resolve(REPO_ROOT, PUBLIC_FONT_PATH)));
    // A .ttc collection would need an index; this repo commits a single face.
    cached = "unitsPerEm" in opened ? (opened as Font) : (opened as { fonts: Font[] }).fonts[0]!;
  }
  return cached;
}

/** Design units per em, 2048 for this binary. */
export function unitsPerEm(): number {
  return font().unitsPerEm;
}

/**
 * The glyph a codepoint maps to.
 *
 * `glyphForCodePoint` is the real fontkit API — there is no `glyphFor` on a
 * font — so this is the thin wrapper the probe filters call.
 */
export function glyphFor(codePoint: number): { id: number; advanceWidth: number } {
  const glyph = font().glyphForCodePoint(codePoint);
  return { id: glyph.id, advanceWidth: glyph.advanceWidth };
}

/** Advance width of a codepoint, in design units. */
export function advanceOf(codePoint: number): number {
  return glyphFor(codePoint).advanceWidth;
}

/**
 * Expected rendered advance width, in CSS pixels.
 *
 * Never instances the variable font: `getVariation` throws on this WOFF2 at
 * every weight including the default, which is why the probe is forced to
 * weight 400 and bold elements are covered by the non-bold probe inside them.
 */
export function expectedWidth(text: string, fontSize: number): number {
  const f = font();
  return (f.layout(text).advanceWidth / f.unitsPerEm) * fontSize;
}

/**
 * Probe text derived from the font's own coverage, never hand-written.
 *
 * TWO FILTERS, and the committed binary proves neither alone is enough:
 *
 *   U+0301 combining acute   id=0    advance=1344   unmapped, NON-zero
 *   U+0041 A                 id=2    advance=1413
 *   U+0021 !                 id=764  advance=589
 *
 * Rejecting `id === 0` removes characters the face cannot DRAW. It does NOT
 * remove characters it draws with no advance -- combining marks -- and those
 * defeat a width oracle completely, because a zero-width string measures zero
 * under every font. But U+0301 shows the converse too: it is `.notdef` here AND
 * carries a real advance, so an advance-only filter accepts a missing-glyph box
 * and silently poisons the expectation.
 *
 * The derived string looks odd (`!"#$%&'(`) because the walk takes the first
 * qualifying codepoints in range order. That is a feature: nothing is
 * hand-maintained, and a font revision that drops a glyph shifts the probe
 * automatically rather than quietly measuring `.notdef`.
 */
export function deriveProbeText(length = 8): string {
  const picked: number[] = [];
  // Start above U+0020: spaces and controls pull in unrelated behaviour and
  // make a baseline fire even when everything is genuine.
  for (let cp = 0x21; cp < 0x2000 && picked.length < length; cp += 1) {
    let glyph: { id: number; advanceWidth: number };
    try {
      glyph = glyphFor(cp);
    } catch {
      continue;
    }
    if (glyph.id === 0) continue;
    if (!(glyph.advanceWidth > 0)) continue;
    picked.push(cp);
  }
  return String.fromCodePoint(...picked);
}

/**
 * Styling for the inserted probe.
 *
 * It inherits `font-family` from its parent BY DESIGN -- that is how it catches
 * a descendant override -- and neutralises everything else that changes the
 * glyph run. Measuring the walked element directly instead fails on ordinary
 * page styling: with `text-transform: uppercase` (96 tokens across 55 files),
 * `font-weight: 700`, `.12em` tracking and `tnum`, an element measures
 * 276.531px against a 194.133px expectation, roughly 69x the tolerance. A
 * synthetic probe placed elsewhere in the document fails the opposite way: it
 * does not inherit the cascade of the element under test, so a descendant
 * override never reaches it.
 */
export const PROBE_STYLE = [
  "text-transform: none",
  "font-variant: normal",
  "font-feature-settings: normal",
  "font-stretch: normal",
  "letter-spacing: normal",
  "word-spacing: normal",
  "font-weight: 400",
  // The binary carries an `opsz` axis, and `font-optical-sizing: auto` is the
  // CSS DEFAULT -- so Chromium instances the font at the probe's px size while
  // fontkit lays out the default instance. Measured: that alone puts
  // "Hamburgefonstiv" 1.125px off a 130px expectation, more than twice the
  // 0.5px contract, on a completely correct face. Neutralising it is not a
  // tolerance concession; it is the same class as `font-feature-settings:
  // normal` -- switch off everything that changes the glyph run so the
  // comparison is about WHICH FACE rendered, not how it was instanced.
  "font-optical-sizing: none",
  "font-variation-settings: normal",
  // ASK FOR GEOMETRIC ADVANCES, not the platform's hinted rendering.
  //
  // This is the local-passes-CI-fails class, caught by CI: macOS Chromium uses
  // subpixel positioning and measured 130.09375px (delta ~0.0), while Linux
  // Chromium applies full hinting and snapped the same string to a round 132px
  // -- delta 1.906px, on a face that had already asserted request-200 and
  // status "loaded". A 1.5% platform difference, not a wrong face.
  //
  // `geometricPrecision` tells the engine to use the font's own advances
  // without hinting or integer snapping, which is exactly what fontkit's
  // layout() computes. Neutralising it belongs with the other glyph-run
  // neutralisations above, for the same reason: the comparison is about WHICH
  // FACE rendered, never about how a platform rasterises it.
  "text-rendering: geometricPrecision",
  "position: absolute",
  "visibility: hidden",
  "white-space: pre",
  "line-height: normal",
].join("; ");

/** Tolerance for a rendered-vs-expected width comparison, in CSS pixels. */
export const WIDTH_TOLERANCE_PX = 0.5;

/** Font size the probe is measured at. */
export const PROBE_FONT_SIZE_PX = 16;

/**
 * Elements that render text but CANNOT host a child probe, as a selector.
 *
 * Defined by the property rather than by an element list, because a list is what
 * leaves `<option>` out: it is not void, so "void/replaced" misses it, and
 * Tailwind preflight's own rule stops at `optgroup`. Probed rather than
 * reasoned about -- `option` inherits anyway, since `font-family` is inherited
 * and no UA rule overrides it there.
 *
 * These get a computed-family assertion instead of a byte-derived one, which is
 * a real narrowing: it catches a family override, the demonstrated attack, but
 * not an alias impostor confined to a placeholder. Recorded as a documented
 * limit rather than papered over.
 */
export const CANNOT_HOST_PROBE = "button, input, select, optgroup, option, textarea";

/** Pseudo-elements that can carry their own family, checked on the parent. */
export const CHECKED_PSEUDOS = ["::placeholder", "::marker", "::before", "::after"] as const;
