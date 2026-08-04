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
 * against the font the app loads. If this file named `assets/fonts/…` directly, it
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
import valueParser from "postcss-value-parser";
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

/**
 * Decode CSS escape sequences, per CSS Syntax §4.3.7 and §4.3.5.
 *
 * Three rules, and rounds 5–6 each shipped a mutant exploiting one of them:
 *
 *   `\\2c ` → `,`    a hex escape, optionally followed by ONE whitespace which is
 *                    consumed as part of the escape
 *   `\\<newline>`     a STRING CONTINUATION: the backslash and the newline both
 *                    vanish, so `"ZZ\\<LF>-Z"` is the tag `ZZ-Z`. LF, CR, FF and
 *                    CRLF all spell it.
 *   `\\n` → `n`      any other escaped character is itself
 *
 * Applied to identifiers as well as strings, because CSS consumes escapes while
 * consuming a NAME too — round 6's `o\\6e` is the keyword `on`, which CSS Fonts 4
 * §6.12 defines as synonymous with `1`.
 */
export function decodeCssEscapes(raw: string): string {
  return raw.replace(
    /\\(?:([0-9a-fA-F]{1,6})[ \t\n\r\f]?|(\r\n|[\n\r\f])|([\s\S]))/g,
    (_all, hex: string | undefined, newline: string | undefined, ch: string | undefined) => {
      if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
      if (newline !== undefined) return ""; // string continuation: both characters vanish
      return ch ?? "";
    },
  );
}

/**
 * Parse a `font-feature-settings` VALUE per CSS Fonts 4 §6.12.
 *
 * TOKENIZED BY `postcss-value-parser`, NOT BY HAND. Three consecutive review
 * rounds defeated hand-written scanners here — commas inside tags, comments
 * inside the value, escapes inside the tag, escapes inside the KEYWORD, escaped
 * newlines continuing a string. Each fix answered one more spelling in an open
 * space, which is the shape `AGENTS.md`'s same-vector rule says to stop
 * patching. A real value tokenizer closes the class: it already knows what a
 * string is, what a word is, and where a comma separates. What remains hand-
 * written is escape DECODING, which is a closed, three-rule function with its
 * own test table below.
 *
 * Semantics: an omitted value means 1; `on` is 1 and `off` is 0; the integer
 * must be non-negative, and CSS Syntax permits a leading `+`. Duplicates are
 * last-value-wins. Anything unparseable FAILS CLOSED — recorded as not
 * confidently enabled rather than silently on.
 */
export function parseFeatureValue(value: string): FeatureSetting[] {
  const bySpelling = new Map<string, boolean>();
  const groups: valueParser.Node[][] = [[]];
  for (const node of valueParser(value).nodes) {
    if (node.type === "div" && node.value === ",") groups.push([]);
    else if (node.type !== "space" && node.type !== "comment")
      groups[groups.length - 1]!.push(node);
  }

  for (const group of groups) {
    const [tagNode, valueNode, ...rest] = group;
    if (!tagNode || tagNode.type !== "string") continue; // `normal`, or declares no tag
    if (rest.length > 0) continue; // more tokens than the grammar allows — fail closed
    const tag = decodeCssEscapes(tagNode.value);
    // A tag is exactly four characters in the printable-ASCII range, measured
    // AFTER decoding, so the length check cannot precede it.
    if (!/^[\u0020-\u007E]{4}$/.test(tag)) continue;

    let enabled: boolean;
    if (!valueNode)
      enabled = true; // omitted means 1
    else if (valueNode.type !== "word") enabled = false;
    else {
      const keyword = decodeCssEscapes(valueNode.value).toLowerCase();
      if (keyword === "on") enabled = true;
      else if (keyword === "off") enabled = false;
      else if (/^\+?\d+$/.test(keyword)) enabled = !/^\+?0+$/.test(keyword);
      else enabled = false; // negative, var(), or anything unparseable
    }
    bySpelling.set(tag, enabled); // later entry wins
  }
  return [...bySpelling].map(([tag, enabled]) => ({ tag, enabled }));
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

/**
 * Rules using the `font` SHORTHAND, which silently resets `font-feature-settings`
 * and `font-variant-numeric` to their initial values (CSS Fonts 4 §2.7).
 *
 * Round 3's mutant was `main .code-value { font: 400 16px var(--font-sans); }` —
 * a declaration that names neither property, so walking `font-feature-settings`
 * declarations could never see it, while every real `.code-value` surface (all
 * four are under `<main>`) silently lost `zero`.
 */
export function fontShorthandRules(cssSource: string): string[] {
  const out: string[] = [];
  postcss.parse(cssSource).walkDecls("font", (decl) => {
    const parent = decl.parent;
    out.push(parent && "selector" in parent ? String(parent.selector) : "(unknown)");
  });
  return out;
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
 * ANCHORED TO THE `localFont()` CALL, not to any `src` property in the module.
 * Round 3's mutant proved the difference: a decoy object literal
 * `const guardOnly = { src: "…/InterVariable-latin.woff2" }` alongside a real
 * `localFont({ src: [{ path: "…/inter-google-latin-v20.woff2" }] })` had the
 * guard resolving the vendored file while Next loaded the Google fixture.
 *
 * Both `src` spellings the loader accepts are handled — a bare string, and the
 * array-of-`{path}` form for multi-file families. The array form must resolve to
 * exactly one path here, since this guard checks one font.
 */
export function resolveLoadedFontPath(): string {
  const source = ts.createSourceFile(
    FONTS_MODULE,
    readFileSync(FONTS_MODULE, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );

  const calls: ts.ObjectLiteralExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? callee.name.text
          : "";
      // The loader is imported as a default binding, conventionally `localFont`.
      // Matching the CALL rather than a property name is the whole point.
      if (/^(localFont|.*Font)$/.test(name) && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (arg && ts.isObjectLiteralExpression(arg)) calls.push(arg);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  if (calls.length !== 1) {
    throw new Error(
      `app/fonts.ts contains ${calls.length} font-loader calls with an object ` +
        `literal argument; this guard checks exactly one.`,
    );
  }

  const srcProp = calls[0]!.properties.find(
    (prop): prop is ts.PropertyAssignment =>
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === "src") ||
        (ts.isStringLiteral(prop.name) && prop.name.text === "src")),
  );
  if (!srcProp) {
    throw new Error(
      `the font-loader call in app/fonts.ts has no \`src\`. If it moved back to ` +
        `next/font/google, this guard can no longer see the font the app loads — ` +
        `fix the guard, do not delete it.`,
    );
  }

  const paths: string[] = [];
  const init = srcProp.initializer;
  if (ts.isStringLiteralLike(init)) {
    paths.push(init.text);
  } else if (ts.isArrayLiteralExpression(init)) {
    for (const el of init.elements) {
      if (!ts.isObjectLiteralExpression(el)) continue;
      for (const prop of el.properties) {
        if (
          ts.isPropertyAssignment(prop) &&
          ts.isIdentifier(prop.name) &&
          prop.name.text === "path" &&
          ts.isStringLiteralLike(prop.initializer)
        ) {
          paths.push(prop.initializer.text);
        }
      }
    }
  }

  if (paths.length !== 1) {
    throw new Error(
      `the font-loader call in app/fonts.ts resolves to ${paths.length} font files ` +
        `(${paths.join(", ") || "none"}); this guard checks exactly one.`,
    );
  }
  return resolve(dirname(FONTS_MODULE), paths[0]!);
}

/**
 * THE PARSER'S OWN TEST TABLE.
 *
 * Rounds 3, 5 and 6 all landed mutants on `parseFeatureValue`, and every one was
 * found by mutating `app/globals.css` and watching the guard — an expensive,
 * indirect oracle that only ever tested the spellings someone thought to try.
 * `AGENTS.md`'s same-vector rule says that after three rounds on one vector you
 * stop patching and close the class structurally. This table is that closure:
 * the parser is now specified directly, case by case, against CSS Syntax and
 * CSS Fonts 4 §6.12. Every row below was a live escaping mutant or its control.
 */
describe("parseFeatureValue — CSS Fonts 4 §6.12 semantics", () => {
  const enabledTags = (value: string): string[] =>
    parseFeatureValue(value)
      .filter((f) => f.enabled)
      .map((f) => f.tag)
      .sort();

  test.each([
    // [value, enabled tags, why this row exists]
    ['"ss04" 1', ["ss04"], "the ordinary case"],
    ['"ss04"', ["ss04"], "an omitted value means 1"],
    ['"ss04" on', ["ss04"], "`on` is 1"],
    ['"ss04" off', [], "`off` is 0"],
    ['"ss04" 0', [], "r2 mutant: a present tag is not an enabled tag"],
    ['"ss04" +1', ["ss04"], "r5 mutant: CSS Syntax permits a leading + on an integer"],
    ['"ss04" +0', [], "…and +0 is still zero"],
    ['"ss04" -1', [], "CSS Fonts requires non-negative; fail closed"],
    ['"ss04" var(--x)', [], "r3 mutant: a runtime token is not an omitted value"],
    ['"ss04" 1, "ss04" 0', [], "r3 mutant: duplicates are last-value-wins"],
    ['"ss04" 0, "ss04" 1', ["ss04"], "…in both directions"],
    ['"A,B!" 1', ["A,B!"], "r4 mutant: a comma is a legal tag character"],
    ['"A\\2c B!" 1', ["A,B!"], "r5 mutant: a hex escape is the same tag as its literal"],
    ['"ZZ-Z"/**/1', ["ZZ-Z"], "r5 mutant: a comment is consumed before grammar matching"],
    ['"ZZ-Z" o\\6e', ["ZZ-Z"], "r6 mutant: escapes are decoded in the KEYWORD too"],
    ['"ZZ\\\n-Z" 1', ["ZZ-Z"], "r6 mutant: an escaped newline continues the string"],
    ["normal", [], "the initial value declares no tag"],
    ['"toolong" 1', [], "a tag is exactly four characters"],
    ['"ab" 1', [], "…in both directions"],
  ])("%s → %j (%s)", (value, expected) => {
    expect(enabledTags(value as string)).toEqual(expected);
  });

  test("an escaped newline is consumed in every spelling CSS allows", () => {
    // LF, CR, FF and CRLF all continue a string. Round 6 found the helper
    // handling none of them.
    for (const nl of ["\n", "\r", "\f", "\r\n"]) {
      expect(enabledTags(`"ZZ\\${nl}-Z" 1`), `escaped ${JSON.stringify(nl)}`).toEqual(["ZZ-Z"]);
    }
  });
});

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

  test("the font the app loads stays within its payload budget", () => {
    // The features and axes survive a swap back to the 344 KB verbatim release,
    // so nothing above notices the exact regression the subset exists to prevent:
    // measured cold on slow 4G, the verbatim file cost FCP +136-164ms and pushed
    // the fallback->Inter swap to 3720ms after navigation (8049ms on regular 3G).
    // The font is PRELOADED, so its weight is on the first-visit critical path —
    // the venue-floor visit PRODUCT.md cares about. Whole-diff review R4 P1.
    //
    // The bound is deliberately loose: it is a tripwire against a category change
    // (dropping the subset step, adding italics), not a byte pin. Raising it is a
    // payload decision of the kind recorded in the spec's §2.6, not a maintenance
    // step — say why in the commit.
    const BUDGET_BYTES = 220_000;
    const bytes = readFileSync(resolveLoadedFontPath()).byteLength;
    expect(
      bytes,
      `the loaded font is ${bytes} bytes, over the ${BUDGET_BYTES}-byte budget. It is ` +
        `preloaded, so this lands on first paint for crew on venue-floor connections.`,
    ).toBeLessThanOrEqual(BUDGET_BYTES);
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

    test("no rule uses the `font` shorthand, which would silently reset the features", () => {
      // CSS Fonts 4 §2.7: the `font` shorthand resets font-feature-settings and
      // font-variant-numeric to their INITIAL values. A rule using it names
      // neither property, so walking font-feature-settings declarations cannot
      // see it — round 3's mutant was `main .code-value { font: 400 16px ... }`,
      // which silently stripped `zero` from every real .code-value surface (all
      // four are under <main>) while every guard stayed green.
      const shorthand = fontShorthandRules(css);
      expect(
        shorthand,
        `these rules use the \`font\` shorthand, which resets font-feature-settings ` +
          `to its initial value and would silently undo ss04/tnum/zero: ` +
          `${shorthand.join(", ")}. Set the longhands instead.`,
      ).toEqual([]);
    });

    test("`zero` is declared in exactly one rule", () => {
      const zeroRules = featureRules(css).filter((r) =>
        r.settings.some((f) => f.tag === "zero" && f.enabled),
      );
      expect(zeroRules.length, "only `.code-value` slashes zeros").toBe(1);
    });
  });
});
