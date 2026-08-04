/**
 * tests/styles/fontFeatureAvailability.test.ts
 *
 * Every OpenType feature tag `app/globals.css` declares MUST exist in the font
 * the app actually loads. This guard exists because for three months it did not:
 * `"cv11" 1` was written into the tabular rule at `78662acb5` (2026-05-03) and
 * never rendered a single glyph on any route, because the Inter build Google
 * Fonts serves has the character variants stripped. A declaration that names a
 * feature the font cannot honor is silent — it looks deliberate, it reviews
 * clean, and it does nothing. Nothing in the codebase could see the difference.
 *
 * Spec: docs/superpowers/specs/2026-08-03-inter-numeral-disambiguation-design.md §4.1
 *
 * WHY THE FONT PATH IS DERIVED, NEVER HARDCODED. The check is only meaningful
 * against the font the app loads. If this file named `app/_fonts/…` directly, it
 * would keep passing after someone repointed `app/fonts.ts` somewhere else —
 * reintroducing exactly the CSS-says-one-thing/font-does-another split the guard
 * exists to close. So the `src` is parsed out of `app/fonts.ts` and resolved
 * relative to that module, the same way the bundler resolves it.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as fontkit from "fontkit";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const GLOBALS_CSS = resolve(REPO_ROOT, "app", "globals.css");
const FONTS_MODULE = resolve(REPO_ROOT, "app", "fonts.ts");
const GOOGLE_FIXTURE = resolve(__dirname, "fixtures", "inter-google-latin-v20.woff2");
/** The exact latin subset fonts.gstatic.com served on 2026-08-03, pinned by identity. */
const GOOGLE_FIXTURE_SHA256 = "c940764593d0fe5d596be327ca7558855e018039fb78509aa21921fd3644c3e4";

/**
 * The literal tag set `app/globals.css` carried before this change, frozen.
 *
 * Hardcoded ON PURPOSE, and the only hardcoded tag list here. It is a fact about
 * commit `78662acb5`, not a moving target, and it CANNOT be derived from today's
 * CSS — today's CSS no longer contains `cv11`, which is the whole point. Asking
 * the extracted current list to prove the historical bug is unsatisfiable: the
 * current list is {ss04, tnum, zero} and `cv11` is not in it.
 */
const HISTORICAL_TAGS = ["tnum", "cv11"] as const;

/** CSS comments removed, so a commented-out declaration cannot be mistaken for a live one. */
export function stripCssComments(cssSource: string): string {
  return cssSource.replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * The `font-feature-settings` tags declared by the rule whose selector list
 * contains `selector`, or null when that rule declares none.
 *
 * SELECTOR-ADDRESSED, NOT POSITIONAL. Whole-diff review round 1 landed a live
 * mutant against the previous version, which took the first declaration in the
 * file as "the root rule": with the real `html` declaration commented out, every
 * assertion still passed while ordinary prose lost `ss04` product-wide.
 */
export function tagsForSelector(cssSource: string, selector: string): string[] | null {
  const css = stripCssComments(cssSource);
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = (rule[1] ?? "").split(",").map((sel) => sel.trim());
    if (!selectors.includes(selector)) continue;
    if (!/font-feature-settings\s*:/.test(rule[2] ?? "")) continue;
    return extractFeatureTags(rule[2] ?? "");
  }
  return null;
}

/** Every `"xxxx" 1`-style tag inside every `font-feature-settings` declaration. */
export function extractFeatureTags(cssSource: string): string[] {
  const tags = new Set<string>();
  const declarations = stripCssComments(cssSource).matchAll(
    /font-feature-settings\s*:([^;}]*)[;}]/g,
  );
  for (const declaration of declarations) {
    for (const tag of (declaration[1] ?? "").matchAll(/["']([A-Za-z0-9]{4})["']/g)) {
      const value = tag[1];
      if (value !== undefined) tags.add(value);
    }
  }
  return [...tags].sort();
}

/** The OpenType features a font binary can actually honor. */
export function availableFeatures(fontPath: string): string[] {
  const font = fontkit.openSync(fontPath);
  if ("availableFeatures" in font) return [...font.availableFeatures].sort();
  throw new Error(`${fontPath} is a font collection, not a single font`);
}

/** Tags declared but absent from the font — the defect this file exists to catch. */
export function missingTags(tags: readonly string[], fontPath: string): string[] {
  const available = new Set(availableFeatures(fontPath));
  return tags.filter((tag) => !available.has(tag)).sort();
}

/**
 * The font `app/fonts.ts` loads, resolved the way the bundler resolves it.
 * Deliberately strict: an unparseable module is a failure, not a skip.
 */
export function stripJsComments(source: string): string {
  // Block and line comments become spaces so offsets stay sane. Naive about
  // comment-like text inside string literals, which is acceptable here: this
  // file is a five-line font loader, and the alternative (a real parser) buys
  // nothing the ONE_SRC assertion below does not already cover.
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

/**
 * The font `app/fonts.ts` loads, resolved the way the bundler resolves it.
 *
 * COMMENTS ARE STRIPPED FIRST, AND EXACTLY ONE `src` MUST REMAIN. Whole-diff
 * review round 1 landed a live mutant against the previous version: it took the
 * FIRST regex-shaped `src:` in the raw source, so a commented decoy pointing at
 * the vendored file let the guard pass while the ACTIVE loader pointed at the
 * feature-stripped Google fixture. The guard reported no missing tags; the real
 * loader was missing `ss04` and `zero`. Deriving the path is only worth doing if
 * it derives the path the app actually uses.
 */
export function resolveLoadedFontPath(): string {
  const source = stripJsComments(readFileSync(FONTS_MODULE, "utf8"));
  const matches = [...source.matchAll(/\bsrc\s*:\s*["'](\.[^"']+\.woff2?)["']/g)];
  if (matches.length === 0) {
    throw new Error(
      `app/fonts.ts declares no local font \`src\` outside comments. If the loader ` +
        `moved back to next/font/google, this guard can no longer see the font the ` +
        `app loads — fix the guard, do not delete it.`,
    );
  }
  if (matches.length > 1) {
    throw new Error(
      `app/fonts.ts declares ${matches.length} font \`src\` values outside comments ` +
        `(${matches.map((m) => m[1]).join(", ")}). This guard checks ONE font; with ` +
        `several it cannot know which the app loads.`,
    );
  }
  return resolve(dirname(FONTS_MODULE), matches[0]![1]!);
}

describe("font feature availability", () => {
  const css = readFileSync(GLOBALS_CSS, "utf8");
  const declaredTags = extractFeatureTags(css);

  test("the loaded font path resolves to a file that exists", () => {
    const path = resolveLoadedFontPath();
    expect(existsSync(path), `app/fonts.ts src resolves to ${path}`).toBe(true);
  });

  test("the extracted tag set is exactly what the spec specifies", () => {
    // Non-vacuity. Without this, a regex that silently stopped matching would
    // satisfy the next test against an empty set and prove nothing at all.
    expect(declaredTags).toEqual(["ss04", "tnum", "zero"]);
  });

  test("every tag app/globals.css declares exists in the font the app loads", () => {
    const missing = missingTags(declaredTags, resolveLoadedFontPath());
    expect(
      missing,
      `app/globals.css declares ${missing.join(", ")}, which the loaded font ` +
        `cannot honor — the declaration would render nothing`,
    ).toEqual([]);
  });

  test("the font the app loads exposes both variation axes DESIGN.md claims", () => {
    const font = fontkit.openSync(resolveLoadedFontPath());
    const axes = "variationAxes" in font ? Object.keys(font.variationAxes).sort() : [];
    // `opsz` is load-bearing for DESIGN.md §2.1's optical-sizing claim, which was
    // false of the Google build and is true only while this axis ships.
    expect(axes).toEqual(["opsz", "wght"]);
  });

  describe("regression proof — the guard would have caught the dead cv11", () => {
    test("the fixture IS the binary this change replaced, not merely a Google Inter", () => {
      // Whole-diff review round 1: the proof below passed against a DIFFERENT
      // Google-served Inter (85,272 bytes), because it only ever checked a
      // feature set. A historical claim has to be pinned to the historical
      // artifact, or it is a claim about a category rather than about what this
      // repo actually shipped. Byte-pinning a committed INPUT fixture is not the
      // byte-comparison trap in AGENTS.md — that is about generated output.
      const bytes = readFileSync(GOOGLE_FIXTURE);
      expect(bytes.byteLength).toBe(48432);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(GOOGLE_FIXTURE_SHA256);
    });

    test("the historical tag set reports cv11 missing from the Google-served font", () => {
      expect(missingTags(HISTORICAL_TAGS, GOOGLE_FIXTURE)).toEqual(["cv11"]);
    });

    test("today's tags would have been inert on the Google-served font too", () => {
      // Why the font had to change at all: the tags this spec adds are no more
      // available in the old binary than `cv11` was.
      expect(missingTags(declaredTags, GOOGLE_FIXTURE)).toEqual(["ss04", "zero"]);
    });
  });

  test("every non-root font-feature-settings rule repeats the root's tags", () => {
    // `font-feature-settings` inherits as a WHOLE VALUE, not as a merged list, so
    // any rule that sets it replaces the root's `ss04` outright. A `.tabular-nums`
    // span containing letters — `A1 · Audio Lead`, a stage label, a plate number —
    // would silently lose disambiguation. Stated structurally so a fourth rule
    // added later cannot reintroduce the hole quietly.
    const rules = [...stripCssComments(css).matchAll(/font-feature-settings\s*:([^;}]*)[;}]/g)].map(
      (m) => extractFeatureTags(`font-feature-settings:${m[1] ?? ""};`),
    );
    expect(rules.length, "there are multiple rules for this check to compare").toBeGreaterThan(1);
    // Addressed by SELECTOR, never by position. Finding the root rule as "the one
    // with ss04 and no tnum" would silently pass if the html rule vanished and
    // some other rule happened to match that shape.
    const rootTags = tagsForSelector(css, "html");
    expect(
      rootTags,
      "the `html` rule declares font-feature-settings — without it, ordinary prose " +
        "loses ss04 product-wide and only the two opt-in classes keep it",
    ).not.toBeNull();
    expect(rootTags).toEqual(["ss04"]);
    for (const tags of rules) {
      for (const rootTag of rootTags ?? []) {
        expect(tags, `every rule repeats the root tag ${rootTag}`).toContain(rootTag);
      }
    }
  });

  describe("the slashed zero is scoped to codes, not to every aligned number", () => {
    // Impeccable critique P1, 2026-08-03. `zero` shipped on the tabular rule for
    // one review round, and `.tabular-nums` is NOT a "this is a code" marker in
    // this codebase — it sits on whole prose sentences, including the Right Now
    // hero's 30px bold <h2>. That rendered "Show day 1(slashed)0 of 12" in the
    // product's single most expressive moment, against PRODUCT.md's explicit
    // "not techie" anti-reference. The split is the fix; these tests are what
    // stop it collapsing back.
    const ruleTags = (selector: string): string[] => {
      const tags = tagsForSelector(css, selector);
      expect(tags, `${selector} declares font-feature-settings in app/globals.css`).not.toBeNull();
      return tags ?? [];
    };

    test("the shared tabular rule does NOT slash zeros", () => {
      const tags = ruleTags(".tabular-nums");
      expect(tags).toContain("ss04");
      expect(tags).toContain("tnum");
      expect(
        tags,
        "`.tabular-nums` is applied to prose in this codebase, so a slashed zero " +
          "there lands in running sentences — use `.code-value` instead",
      ).not.toContain("zero");
    });

    test("the code-value rule DOES slash zeros, and keeps the inherited tags", () => {
      expect(ruleTags(".code-value")).toEqual(["ss04", "tnum", "zero"]);
    });

    test("`zero` is declared in exactly one rule", () => {
      const zeroRules = [...stripCssComments(css).matchAll(/font-feature-settings\s*:([^;}]*)[;}]/g)].filter((m) =>
        extractFeatureTags(`font-feature-settings:${m[1] ?? ""};`).includes("zero"),
      );
      expect(zeroRules.length, "only `.code-value` slashes zeros").toBe(1);
    });
  });
});
