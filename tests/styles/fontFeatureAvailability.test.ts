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
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import * as fontkit from "fontkit";
import { describe, expect, test } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..");
const GLOBALS_CSS = resolve(REPO_ROOT, "app", "globals.css");
const FONTS_MODULE = resolve(REPO_ROOT, "app", "fonts.ts");
const GOOGLE_FIXTURE = resolve(__dirname, "fixtures", "inter-google-latin-v20.woff2");

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

/** Every `"xxxx" 1`-style tag inside every `font-feature-settings` declaration. */
export function extractFeatureTags(cssSource: string): string[] {
  const tags = new Set<string>();
  const declarations = cssSource.matchAll(/font-feature-settings\s*:([^;}]*)[;}]/g);
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
export function resolveLoadedFontPath(): string {
  const source = readFileSync(FONTS_MODULE, "utf8");
  const match = /\bsrc\s*:\s*["'](\.[^"']+\.woff2?)["']/.exec(source);
  if (!match?.[1]) {
    throw new Error(
      `app/fonts.ts declares no local font \`src\`. If the loader moved back to ` +
        `next/font/google, this guard can no longer see the font the app loads — ` +
        `fix the guard, do not delete it.`,
    );
  }
  return resolve(dirname(FONTS_MODULE), match[1]);
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
    // would silently lose disambiguation. Stated structurally so a third rule
    // added later cannot reintroduce the hole quietly.
    const rules = [...css.matchAll(/font-feature-settings\s*:([^;}]*)[;}]/g)].map((m) =>
      extractFeatureTags(`font-feature-settings:${m[1] ?? ""};`),
    );
    expect(rules.length, "there are multiple rules for this check to compare").toBeGreaterThan(1);
    const rootTags = rules.find((tags) => tags.includes("ss04") && !tags.includes("tnum"));
    expect(rootTags, "the html rule declares ss04 alone").toBeDefined();
    for (const tags of rules) {
      for (const rootTag of rootTags ?? []) {
        expect(tags, `every rule repeats the root tag ${rootTag}`).toContain(rootTag);
      }
    }
  });
});
