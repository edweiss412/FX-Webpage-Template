// Static guard over app/fonts.css — the one place this repo declares a face.
//
// Parsed with Lightning CSS, the parser @tailwindcss/cli and @tailwindcss/postcss
// already use to compile app/globals.css and every harness entry. It runs in
// Node, which is what keeps this guard in the merge-blocking unit suite.
//
// WHICH ARTIFACT EACH ROW READS, because getting this wrong fails a correct
// tree: every row parses AUTHORED source — app/fonts.css and app/globals.css —
// never compiled output. `app/globals.css:1` is `@import "tailwindcss"`, so the
// compiled artifact carries Tailwind's own theme tokens including a second
// `--font-sans`, and the "defined exactly once" row would count two on a
// perfectly correct tree. Measured: authored 1, compiled 2.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import {
  descriptorNames,
  displayOf,
  familyOf,
  firstVarFallbackFamily,
  overridesOf,
  parseFontFaces,
  srcOf,
  styleOf,
  tokenDeclarations,
  weightOf,
} from "../helpers/fontCss";
import {
  EXPECTED_SHA256,
  FALLBACK_FAMILY,
  FONT_FAMILY,
  PUBLIC_FONT_PATH,
  PUBLIC_FONT_URL,
} from "../helpers/fontManifest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FONTS_CSS = readFileSync(resolve(REPO_ROOT, "app/fonts.css"), "utf8");
const GLOBALS_CSS = readFileSync(resolve(REPO_ROOT, "app/globals.css"), "utf8");

/**
 * Measured 2026-08-04 from a clean production build of the pre-swap tree, which
 * emitted exactly one .woff2. These reproduce what `next/font/local` generated
 * from THIS binary, so PR #676's reflow fix survives the mechanism swap
 * unchanged. Do not derive a second answer: running Next's own metric helper
 * against the subset gives different figures, and the family-level fallback can
 * only honour one.
 */
const MEASURED_OVERRIDES = {
  "ascent-override": 89.79,
  "descent-override": 22.36,
  "line-gap-override": 0,
  "size-adjust": 107.89,
} as const;

/** Five, not six: one file covering its whole range declares no unicode-range. */
const EXPECTED_DESCRIPTORS = [
  "font-display",
  "font-family",
  "font-style",
  "font-weight",
  "src",
] as const;

const EXPECTED_FALLBACK_DESCRIPTORS = [
  "ascent-override",
  "descent-override",
  "font-family",
  "line-gap-override",
  "size-adjust",
  "src",
] as const;

const faces = parseFontFaces(FONTS_CSS);
const interFaces = faces.filter((f) => familyOf(f) === FONT_FAMILY);
const fallbackFaces = faces.filter((f) => familyOf(f) === FALLBACK_FAMILY);

describe("app/fonts.css", () => {
  test("declares exactly one Inter face", () => {
    expect(interFaces).toHaveLength(1);
  });

  test("declares exactly one Inter Fallback face", () => {
    // Round 19's mutant: a second, ordinary `Inter Fallback` at font-weight 700
    // sourcing local("Times New Roman"). During the swap frame every bold
    // element selects the exact-weight Times face, so Arial's metric overrides
    // scale the wrong glyphs and the reflow fix is undone -- with every
    // post-font-load runtime check still green.
    expect(fallbackFaces).toHaveLength(1);
  });

  test("no face declares any descriptor twice", () => {
    // CSS applies the LAST declaration. A guard that reads the first checks
    // behaviour the browser never exhibits, so appending a second `src` (or
    // `font-display`, or a `size-adjust` on the fallback) made the shipped
    // behaviour differ from the checked behaviour.
    for (const face of faces) expect(face.duplicated).toEqual([]);
  });

  test("the Inter face's descriptor inventory is exactly the expected set", () => {
    // Set equality, not a count: swapping `font-style` for `size-adjust: 200%`
    // keeps the count at five while the face renders at twice its intended size.
    expect(descriptorNames(interFaces[0]!)).toEqual([...EXPECTED_DESCRIPTORS]);
  });

  test("font-weight is the parsed pair 100 900, not a collapsed single value", () => {
    // Inventory equality proves a descriptor EXISTS; it never proved its value.
    // Collapsing this to 400 passed all fifteen rows of an earlier guard, and
    // 56 `font-bold` sites across 29 files would then render a SYNTHETIC bold
    // off a face that no longer advertises the axis.
    expect(weightOf(interFaces[0]!)).toEqual([100, 900]);
  });

  test("font-style is normal", () => {
    expect(styleOf(interFaces[0]!)).toBe("normal");
  });

  test("the app face declares font-display: swap", () => {
    // The harness emits `block` instead, deliberately: a reader must never
    // stare at invisible text, and a measurement harness must never measure the
    // wrong face. Each value is wrong in the other place.
    expect(displayOf(interFaces[0]!)).toBe("swap");
  });

  test("src is exactly one url() with format woff2, no local(), no tech(), no second source", () => {
    // Per CSS Fonts Level 4 an unsupported format()/tech() EXCLUDES that source,
    // so a later comma-separated source silently selects a different file --
    // and none of it is visible to an ASCII probe.
    const sources = srcOf(interFaces[0]!);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.kind).toBe("url");
    expect(sources[0]!.format).toBe("woff2");
    expect(sources[0]!.tech).toEqual([]);
  });

  test("the src URL resolves to the committed file, with no path traversal", () => {
    // Resolved, not string-inspected: an earlier escape kept a correct basename
    // and a correct hash while pointing one directory deeper, and no runtime
    // probe exposes it because the app renders no text outside the subset.
    const url = srcOf(interFaces[0]!)[0]!.url;
    expect(url).toBe(PUBLIC_FONT_URL);
    const bytes = readFileSync(resolve(REPO_ROOT, PUBLIC_FONT_PATH));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(EXPECTED_SHA256);
  });

  test('the fallback src equals local("Arial") exactly', () => {
    // A substring test accepts `local("Times New Roman"), local("Arial")`, where
    // source order makes Times render. Repointing the fallback leaves the
    // overrides correct for a face they no longer describe, which is worse than
    // having no fallback at all.
    const sources = srcOf(fallbackFaces[0]!);
    expect(sources).toHaveLength(1);
    expect(sources[0]!.kind).toBe("local");
    expect(sources[0]!.local).toBe("Arial");
  });

  test("the fallback's four override values equal the measured figures", () => {
    // Parsed and compared, not `includes()`: wrong values pass a substring check
    // when the RIGHT values survive in a comment beside them.
    expect(overridesOf(fallbackFaces[0]!)).toEqual(MEASURED_OVERRIDES);
  });

  test("the fallback's descriptor inventory is exhaustive", () => {
    // Round 18: adding a valid `unicode-range: U+0370-03FF` excludes the
    // fallback from Latin text entirely, so the swap frame reverts to the
    // unadjusted system stack -- every pinned field unchanged, no row firing.
    expect(descriptorNames(fallbackFaces[0]!)).toEqual([...EXPECTED_FALLBACK_DESCRIPTORS]);
  });

  test("--font-inter is declared exactly once, with both families in order", () => {
    // Declared-once AND parsed-equality. Defining `--font-inter: "Inter"` alone
    // passes every other row -- the fallback face still exists and globals.css
    // still carries its inline var() pair -- while the metric-matched face
    // becomes unreachable through the token.
    expect(tokenDeclarations(FONTS_CSS, "--font-inter")).toEqual([
      `${FONT_FAMILY}, ${FALLBACK_FAMILY}`,
    ]);
  });

  test("globals.css's var() fallback literal names the family this stylesheet declares", () => {
    // THE RENAME ESCAPE, and it is live. The app resolves the face through the
    // TOKEN; every harness resolves it through this LITERAL, because
    // compileEntryCss emits no token definition at all -- probed: 0 definitions
    // of --font-inter in the compiled output, and all 32 callers read
    // app/globals.css into their entry, so it is uniform.
    //
    // Rename the family on BOTH sides and cross-block equality, descriptor
    // inventory, hashes, URLs and the app's own rendering all stay green, while
    // every harness resolves var(--font-inter, "Inter", ...) to a face that no
    // longer exists and falls through to ui-sans-serif -- the ambient host font
    // this whole change exists to eliminate.
    expect(firstVarFallbackFamily(GLOBALS_CSS, "--font-inter")).toBe(familyOf(interFaces[0]!));
  });

  test("app/globals.css declares no @font-face of its own", () => {
    // compileEntryCss compiles this file for all 32 harnesses. A face here would
    // emit absolute /fonts/ URLs into every harness output, which 404 against
    // each caller's local static server -- and a wrong url() 404s and renders
    // identically, so no pixel gate can see it.
    expect(parseFontFaces(GLOBALS_CSS)).toHaveLength(0);
  });
});
