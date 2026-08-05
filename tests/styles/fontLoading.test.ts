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
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
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

import {
  discoverShippedStylesheets as walkForStylesheets,
  type Stylesheet,
} from "./_sourceStylesheetWalk";

const REPO_ROOT = resolve(__dirname, "..", "..");
const FONTS_CSS = readFileSync(resolve(REPO_ROOT, "app/fonts.css"), "utf8");
const GLOBALS_CSS = readFileSync(resolve(REPO_ROOT, "app/globals.css"), "utf8");

/**
 * Every stylesheet that reaches a browser, found by walking rather than listing.
 *
 * ONE entry point: something IMPORTS it. Every `import` / `require` /
 * `import()` of a `.css` from this repo's source roots is followed, and each
 * stylesheet found is then followed through its own `@import` graph, so a face
 * reachable two hops away is still in scope. (An earlier version ALSO seeded
 * every `.css` under `app/` by placement; that failed a correct tree carrying
 * an unreferenced file, since Next ships CSS because it is imported, not
 * because of where it sits.)
 *
 * Unresolvable specifiers are skipped rather than failed: this row's job is to
 * catch a face someone added, and a specifier this resolver cannot follow is a
 * limit of the resolver. `app/globals.css` is asserted present by the caller,
 * so a discovery that silently collapses to nothing cannot pass as clean.
 *
 * ROUTES PROVEN CLOSED, each by a probe that plants a real `@font-face` and
 * confirms this row turns red: static `import` from `.ts/.tsx/.js/.jsx/.mjs`,
 * `require()` from `.cjs`, dynamic `import()`, the `@/` alias from
 * `tsconfig.json` paths, a transitive sheet reached only through `lib/`, and
 * `@import url(x.css)` UNQUOTED. Every one escaped the first version of this
 * resolver.
 *
 * WHAT "SHIPPED" MEANS HERE, stated exactly, because the honest bound matters
 * more than a wider one: this finds stylesheets reachable by IMPORT SYNTAX from
 * this repo's own source roots. That is deliberately not a bundler's module
 * graph, and it differs in two known directions.
 *
 * It can OVER-report: a stylesheet imported by a component that nothing else
 * imports is included, though no page ships it. That is a considered choice
 * rather than an oversight — a competing `@font-face` checked into this repo is
 * worth surfacing whether or not today's route table reaches it, and dormant
 * modules are separately policed by the zero-production-importer guard
 * (`BL-ORPHANED-COMPONENTS-ZERO-PROD-IMPORTERS`). The worst case is a signal on
 * a real file, never a silent wrong answer.
 *
 * It can UNDER-report: a dependency whose JS entry imports its own CSS
 * internally, or a stylesheet reached through a package `exports` subpath, is
 * not followed — that needs node_modules module resolution, which is a
 * different tool than a source walk. `BL-FONT-STYLESHEET-GRAPH-FIDELITY` tracks
 * it. The runtime oracle is what covers a face from ANY origin, per the
 * CSS-in-JS note below, and it is the reason this gap is bounded rather than
 * open.
 *
 * DOCUMENTED LIMIT — CSS-in-JS. A face built as a JS template string and
 * injected at runtime is not a stylesheet file and no file walk will find it.
 * That is not left uncovered: runtime face registration is mutation family M17,
 * and the surface that owns it is the runtime oracle, which reads
 * `document.fonts` from the live page and so sees a face however it arrived
 * (`tests/e2e/harness-font-face.spec.ts`, `tests/e2e/font-rendering-census.spec.ts`).
 * A static file walk and a runtime face-set read are complementary by
 * construction; widening this one to parse JS string literals would chase what
 * the other already catches.
 */
/**
 * THE SOURCE WALK IS THE FAST PRE-CHECK, NOT THE ORACLE
 * (BL-FONT-STYLESHEET-GRAPH-FIDELITY, ratified spec §1.1 item 3).
 *
 * It follows `@import` chains from source CSS, which cannot reach a stylesheet
 * that no CSS names: a dependency whose JS entry imports its own stylesheet, or
 * a stylesheet resolved through a package `exports` subpath. Both escapes are
 * committed as fixtures and PROVEN invisible by pointing THIS FUNCTION at them
 * in `tests/styles/fontBuiltArtifact.test.ts` — which is why the walk now lives
 * in `_sourceStylesheetWalk.ts` with its roots as a parameter instead of being a
 * private local bound to the repo root.
 *
 * Keep both. This one runs everywhere and is instant; the oracle needs a build.
 */
const discoverShippedStylesheets = (): Stylesheet[] =>
  walkForStylesheets({ repoRoot: REPO_ROOT, roots: ["app", "components", "lib"] });

/**
 * One specifier to one absolute path: relative, `@/`-aliased per
 * `tsconfig.json`'s `paths`, or bare from `node_modules`.
 */
function resolveSpecifier(specifier: string, importer: string): string | null {
  if (specifier.startsWith(".")) return resolve(dirname(importer), specifier);
  // A root-relative `@import "/x.css"` is served from `public/`, which is the
  // one place in this repo where a URL path and a file path differ.
  if (specifier.startsWith("/")) {
    const fromPublic = resolve(REPO_ROOT, "public", specifier.slice(1));
    if (existsSync(fromPublic)) return fromPublic;
    return null;
  }
  if (specifier.startsWith("@/")) return resolve(REPO_ROOT, specifier.slice(2));
  for (const candidate of [specifier, `${specifier}/index.css`, `${specifier}.css`]) {
    const guess = resolve(REPO_ROOT, "node_modules", candidate);
    if (existsSync(guess) && statSync(guess).isFile()) return guess;
  }
  return null;
}

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
    // DEFENSE IN DEPTH, and the honest framing matters here because an earlier
    // version of this comment was WRONG about why the row exists.
    //
    // It claimed the harnesses bind through this literal, "because
    // compileEntryCss emits no token definition at all". That was measured
    // against the compiled globals.css ALONE, and stopped being true the moment
    // the post-step landed: it appends app/fonts.css WHOLE, including
    // `:root { --font-inter }`. Verified against real emitted output -- exactly
    // one definition of the token. Both the app and the harnesses resolve the
    // TOKEN.
    //
    // The row still earns its place. The spec deliberately kept the inline
    // var() fallback so `--font-sans` stays valid at computed-value time on any
    // surface that lacks the token, and if that literal is ever the thing that
    // resolves, it has to name a face that exists. Pinning it to the declared
    // family is what keeps the safety net from being a dead string.
    expect(firstVarFallbackFamily(GLOBALS_CSS, "--font-inter")).toBe(familyOf(interFaces[0]!));
  });

  test("app/fonts.css is the only import-reachable stylesheet declaring a face", () => {
    // compileEntryCss compiles globals.css for all 32 harnesses. A face there
    // would emit absolute /fonts/ URLs into every harness output, which 404
    // against each caller's local static server -- and a wrong url() 404s and
    // renders identically, so no pixel gate can see it.
    //
    // THE SET IS DISCOVERED, NOT LISTED. Naming `app/globals.css` by hand made
    // this row assert something narrower than it claimed: a second stylesheet --
    // a new `app/*.css`, or a third-party sheet pulled in by a side-effect
    // `import "…css"` -- could declare a competing face and every row here would
    // still pass. Discovery makes a new stylesheet fail by default, which is the
    // only version of this row worth having.
    //
    // Third-party sheets are IN SCOPE and not hypothetical: `components/agenda/
    // AgendaPdfViewer.tsx:44-45` ships two react-pdf stylesheets. Probed
    // 2026-08-04 — neither declares a face today, and this row is what notices
    // if a version bump changes that.
    const stylesheets = discoverShippedStylesheets();
    expect(
      stylesheets.map((s) => s.label),
      "discovery found no stylesheets, so this row would pass vacuously",
    ).toContain("app/globals.css");

    const offenders = stylesheets
      .filter((s) => s.label !== "app/fonts.css")
      .filter((s) => parseFontFaces(s.text, { errorRecovery: true }).length > 0)
      .map((s) => s.label);
    expect(
      offenders,
      `these declare a face besides app/fonts.css: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  test("DESIGN.md describes the mechanism that actually ships", () => {
    // Named with DESIGN so `-t "DESIGN"` selects it. Nothing previously held the
    // design document and the live CSS together, so G5 could regress silently.
    //
    // It asserts the CURRENT claim, not the absence of a string: §2.1 carries a
    // deliberate history of the three mechanisms this line has named, and
    // banning "next/font" outright would fail on that record. What must hold is
    // that the sentence describing what ships names the stylesheet, and does not
    // describe the app as LOADING VIA the retired loader.
    const design = readFileSync(resolve(REPO_ROOT, "DESIGN.md"), "utf8");
    expect(design).toContain("app/fonts.css");
    expect(design).not.toMatch(/Loaded via `next\/font/);
  });
});
