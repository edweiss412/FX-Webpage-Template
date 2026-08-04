// Unit coverage for the byte-derived font oracle.
//
// The oracle's whole claim is that it compares rendered width against an
// expectation computed from the SAME BYTES the browser renders, so there is no
// pinned literal to rot across platforms, Chromium builds or CI images. These
// tests pin the arithmetic and, more importantly, the probe-derivation filters
// -- a probe that measures zero passes under every font, including no font.
import { describe, expect, test } from "vitest";

import {
  PROBE_STYLE,
  advanceOf,
  deriveProbeText,
  expectedWidth,
  glyphFor,
  unitsPerEm,
} from "./fontOracle";

describe("byte-derived expectation", () => {
  test("computes from the committed bytes, not from a pinned literal", () => {
    // layout(text).advanceWidth / unitsPerEm * fontSize, verified against a real
    // browser at delta 0.0000px on latin, greek and cyrillic during the spike.
    //
    // 130.0938 is what THIS binary yields -- and it is exactly the figure the
    // spec measured against the Google build, so the formula survived the byte
    // swap untouched. That agreement is the point of pinning it here.
    expect(expectedWidth("Hamburgefonstiv", 16)).toBeCloseTo(130.0938, 3);
  });

  test("scales linearly with font size", () => {
    // Cheap, but it catches a unitsPerEm mix-up, which would otherwise show up
    // only as a mysterious constant factor in a browser assertion.
    const at16 = expectedWidth("Hamburgefonstiv", 16);
    expect(expectedWidth("Hamburgefonstiv", 32)).toBeCloseTo(at16 * 2, 6);
  });

  test("the binary is the variable font this repo committed", () => {
    expect(unitsPerEm()).toBe(2048);
  });
});

describe("probe derivation", () => {
  test("rejects BOTH unmapped and zero-advance codepoints", () => {
    // TWO filters, and a probe against the committed binary proves neither
    // alone is enough:
    //
    //   U+0301 combining acute   id=0    advance=1344   <- unmapped, NON-zero
    //   U+0041 A                 id=2    advance=1413
    //   U+0021 !                 id=764  advance=589
    //
    // Rejecting id === 0 removes characters the face cannot DRAW; rejecting
    // zero advance removes combining marks, which measure 0.0000px under every
    // font. U+0301 is the live case that defeats an advance-only filter: it is
    // .notdef here AND carries a real advance of 1344, so an advance-only rule
    // accepts it while it renders as a missing-glyph box, silently poisoning
    // the expectation. The spec's cyrillic argument assumed it measured zero,
    // which was true of the Google build and is false of these bytes.
    for (const cp of [...deriveProbeText()].map((c) => c.codePointAt(0)!)) {
      expect(glyphFor(cp).id, `U+${cp.toString(16).toUpperCase()} is .notdef`).not.toBe(0);
      expect(advanceOf(cp), `U+${cp.toString(16).toUpperCase()} has zero advance`).toBeGreaterThan(
        0,
      );
    }
  });

  test("U+0301 is exactly the trap the second filter exists for", () => {
    // Pinned as a regression: if a future subset MAPS this codepoint, the
    // filter still rejects it on advance and this test tells us the premise
    // moved rather than silently passing.
    expect(glyphFor(0x0301).id).toBe(0);
    expect(advanceOf(0x0301)).toBeGreaterThan(0);
  });

  test("the derived probe's expected width exceeds a nonzero floor", () => {
    // A degenerate probe measures zero, and zero equals zero under Inter, under
    // Arial, and under a face that failed to load at all.
    expect(expectedWidth(deriveProbeText(), 16)).toBeGreaterThan(1);
  });

  test("the probe is derived, not hand-written", () => {
    // The odd-looking string is a FEATURE: the walk takes the first qualifying
    // codepoints in range order, so a font revision that drops a glyph shifts
    // the probe automatically rather than quietly measuring .notdef.
    expect(deriveProbeText()).toBe("!\"#$%&'(");
  });
});

describe("probe styling", () => {
  test("neutralises everything that changes the glyph run", () => {
    // Measuring the walked element DIRECTLY fails on ordinary page styling:
    // with uppercase + bold + .12em tracking + tnum, an element measures
    // 276.531px against a 194.133px expectation, because fontkit lays out the
    // SOURCE string and the browser renders a TRANSFORMED one. ~69x tolerance.
    for (const declaration of [
      "text-transform: none",
      "font-variant: normal",
      "font-feature-settings: normal",
      "font-stretch: normal",
      "letter-spacing: normal",
      "word-spacing: normal",
      "font-weight: 400",
    ]) {
      expect(PROBE_STYLE).toContain(declaration);
    }
  });

  test("is invisible and removed from flow", () => {
    expect(PROBE_STYLE).toContain("position: absolute");
    expect(PROBE_STYLE).toContain("visibility: hidden");
  });

  test("does NOT pin font-family, so it inherits the cascade under test", () => {
    // The probe is a CHILD of the walked element precisely so it inherits that
    // element's exact cascade. Pinning a family here would make it measure
    // itself and see no descendant override at all.
    expect(PROBE_STYLE).not.toContain("font-family");
  });
});
