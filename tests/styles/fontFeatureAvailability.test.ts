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
import postcss from "postcss";
import ts from "typescript";
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
 * CSS — today's CSS no longer contains `cv11`, which is the whole point.
 */
const HISTORICAL_TAGS = ["tnum", "cv11"] as const;

/**
 * WHY THIS FILE PARSES WITH REAL PARSERS RATHER THAN REGEXES.
 *
 * Two rounds of whole-diff review defeated regex-based versions of these
 * helpers, and both escapes were the same shape: a regex cannot tell code from
 * text that merely looks like code.
 *
 *   round 1  a COMMENTED decoy `src:` was picked as the live one
 *   round 2  `--guard-open: "/*"` and `--guard-close: "*\/"` custom properties
 *            made a naive comment-stripper swallow a live `font-feature-settings:
 *            normal` reset sitting between them; the same trick hid a live
 *            loader in fonts.ts
 *
 * Patching the stripper a third time would be answering a specific spelling in
 * an open space. So the CSS goes through `postcss` and the TypeScript through
 * the compiler's own AST — the parsers the app itself is built with. A string
 * that looks like a comment is a string to both of them, which is the property
 * the regexes could never have.
 */

/** A `font-feature-settings` entry: the tag, and whether it is ON. */
export type FeatureSetting = { tag: string; enabled: boolean };

/** Parse a `font-feature-settings` VALUE into its settings. */
export function parseFeatureValue(value: string): FeatureSetting[] {
  const out: FeatureSetting[] = [];
  for (const m of value.matchAll(/["']([A-Za-z0-9]{4})["']\s*(on|off|-?\d+)?/g)) {
    const raw = (m[2] ?? "").trim().toLowerCase();
    // Per spec, an omitted value means 1. `0`/`off` DISABLES the feature while
    // leaving the tag present — round 2's mutant, which every name-only check
    // passed while fontkit measured real shaping corruption (ss04 enabled:
    // 111/459 glyphs, advance 5868; disabled: 94/444, advance 4184).
    out.push({ tag: m[1]!, enabled: raw !== "0" && raw !== "off" });
  }
  return out;
}

/** Every rule in `cssSource` that declares `font-feature-settings`. */
export function featureRules(
  cssSource: string,
): { selectors: string[]; settings: FeatureSetting[] }[] {
  const rules: { selectors: string[]; settings: FeatureSetting[] }[] = [];
  postcss.parse(cssSource).walkDecls("font-feature-settings", (decl) => {
    const parent = decl.parent;
    const selector = parent && "selector" in parent ? String(parent.selector) : "";
    rules.push({
      selectors: selector.split(",").map((sel) => sel.trim()),
      settings: parseFeatureValue(decl.value),
    });
  });
  return rules;
}

/** The ENABLED tags declared by the rule whose selector list contains `selector`. */
export function tagsForSelector(cssSource: string, selector: string): string[] | null {
  const rule = featureRules(cssSource).find((r) => r.selectors.includes(selector));
  if (!rule) return null;
  return rule.settings
    .filter((f) => f.enabled)
    .map((f) => f.tag)
    .sort();
}

/** Every ENABLED tag anywhere in the sheet. */
export function extractFeatureTags(cssSource: string): string[] {
  const tags = new Set<string>();
  for (const rule of featureRules(cssSource)) {
    for (const f of rule.settings) if (f.enabled) tags.add(f.tag);
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
 * The font `app/fonts.ts` loads, read off the TypeScript AST.
 *
 * Finds the `src` property of every object literal argument in the module and
 * requires exactly one. The compiler's parser sees a commented decoy as a
 * comment and a `"src: ..."` string constant as a string, so neither reaches
 * this list — which is precisely what the regex version could not manage.
 */
export function resolveLoadedFontPath(): string {
  const source = ts.createSourceFile(
    FONTS_MODULE,
    readFileSync(FONTS_MODULE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAssignment(node) &&
      ((ts.isIdentifier(node.name) && node.name.text === "src") ||
        (ts.isStringLiteral(node.name) && node.name.text === "src")) &&
      ts.isStringLiteralLike(node.initializer)
    ) {
      found.push(node.initializer.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (found.length === 0) {
    throw new Error(
      `app/fonts.ts declares no font \`src\` property. If the loader moved back to ` +
        `next/font/google, this guard can no longer see the font the app loads — ` +
        `fix the guard, do not delete it.`,
    );
  }
  if (found.length > 1) {
    throw new Error(
      `app/fonts.ts declares ${found.length} font \`src\` values (${found.join(", ")}). ` +
        `This guard checks ONE font; with several it cannot know which the app loads.`,
    );
  }
  return resolve(dirname(FONTS_MODULE), found[0]!);
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
    const rules = featureRules(css).map((r) =>
      r.settings
        .filter((f) => f.enabled)
        .map((f) => f.tag)
        .sort(),
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
      const zeroRules = featureRules(css).filter((r) =>
        r.settings.some((f) => f.tag === "zero" && f.enabled),
      );
      expect(zeroRules.length, "only `.code-value` slashes zeros").toBe(1);
    });
  });
});
