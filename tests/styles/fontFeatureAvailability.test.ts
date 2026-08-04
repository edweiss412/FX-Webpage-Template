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
 * A `font-feature-settings` value this guard is willing to reason about.
 *
 * STRICT BY CONSTRUCTION, AND THAT IS THE POINT. Four consecutive review rounds
 * defeated attempts to PARSE this property the way a browser does:
 *
 *   r3  comments inside the value, positional rule matching
 *   r5  commas inside tags, hex escapes, comments postcss keeps in `decl.value`
 *   r6  escapes inside the KEYWORD (`o\\6e` is `on`), escaped-newline continuation
 *   r7  whitespace-TERMINATED hex escapes (`\\6f n` is `on`), which even
 *       `postcss-value-parser` splits into two words where a browser does not
 *
 * Each fix answered one more spelling in an open space. CSS tokenization is not
 * a thing worth reimplementing in a test, and every attempt to approximate it
 * has been a place for a real feature to hide.
 *
 * So the guard stops approximating and starts REFUSING. It recognises exactly
 * the canonical form the product uses — `"abcd" <integer|on|off>`, comma
 * separated — and treats anything else as a hard failure rather than as
 * something to interpret. An escape, a comment, a `var()`, an exotic tag: the
 * build fails and says extend this guard deliberately.
 *
 * That inverts the failure mode this whole change exists to kill. Previously an
 * unrecognised spelling meant the guard shrugged and a dead declaration shipped.
 * Now an unrecognised spelling stops the build. The guard cannot be fooled by a
 * tokenization subtlety, because it no longer claims to tokenize.
 */
const CANONICAL_ENTRY = /^"([A-Za-z0-9]{4})"(?:[ \t\n\r]+(on|off|\+?\d+))?$/;

/** `normal` is the initial value and declares no features. */
const IS_NORMAL = /^normal$/i;

export type ParsedValue =
  | { recognized: true; settings: FeatureSetting[] }
  | { recognized: false; reason: string };

/** Parse a value, or REFUSE it. Refusal is a build failure, not a shrug. */
export function parseFeatureValue(value: string): ParsedValue {
  const trimmed = value.trim();
  if (IS_NORMAL.test(trimmed)) return { recognized: true, settings: [] };

  const bySpelling = new Map<string, boolean>();
  for (const rawEntry of trimmed.split(",")) {
    const entry = rawEntry.trim();
    const m = CANONICAL_ENTRY.exec(entry);
    if (!m) {
      return {
        recognized: false,
        reason:
          `\`${entry}\` is not the canonical \`"abcd" <integer|on|off>\` form this guard ` +
          `recognises. It refuses rather than guesses: CSS escapes, comments and ` +
          `runtime values all have spellings that look inert and are not, and four ` +
          `review rounds found one hiding in each approximation. If this spelling is ` +
          `genuinely needed, extend CANONICAL_ENTRY deliberately and say why.`,
      };
    }
    const tag = m[1]!;
    const setting = (m[2] ?? "1").toLowerCase();
    const enabled = setting === "on" ? true : setting === "off" ? false : !/^\+?0+$/.test(setting);
    bySpelling.set(tag, enabled); // later entry wins
  }
  return {
    recognized: true,
    settings: [...bySpelling].map(([tag, enabled]) => ({ tag, enabled })),
  };
}

/** The enabled tags of a value, or `[]` when the value is refused. */
function enabledOf(value: string): string[] {
  const parsed = parseFeatureValue(value);
  return parsed.recognized ? parsed.settings.filter((f) => f.enabled).map((f) => f.tag) : [];
}

/** Every rule in `cssSource` that declares `font-feature-settings`. */
export function featureRules(
  cssSource: string,
): { selectors: string[]; settings: FeatureSetting[]; refusal: string | null; raw: string }[] {
  const rules: {
    selectors: string[];
    settings: FeatureSetting[];
    refusal: string | null;
    raw: string;
  }[] = [];
  postcss.parse(cssSource).walkDecls("font-feature-settings", (decl) => {
    const parent = decl.parent;
    const selector = parent && "selector" in parent ? String(parent.selector) : "";
    const parsed = parseFeatureValue(decl.value);
    rules.push({
      selectors: selector.split(",").map((sel) => sel.trim()),
      settings: parsed.recognized ? parsed.settings : [],
      refusal: parsed.recognized ? null : parsed.reason,
      raw: decl.value,
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

/** Declarations the guard refused to interpret. Non-empty is a build failure. */
export function refusedValues(cssSource: string): { raw: string; reason: string }[] {
  return featureRules(cssSource)
    .filter((r) => r.refusal !== null)
    .map((r) => ({ raw: r.raw, reason: r.refusal! }));
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
 * THE RECOGNISER'S OWN TEST TABLE.
 *
 * Rounds 3, 5, 6 and 7 each landed a mutant on this function, and each fix
 * answered one more spelling. The table below is the closure: every accepted
 * form is named, and every mutant those rounds produced is asserted to be
 * REFUSED — not parsed correctly, refused. A refusal fails the build, which is
 * strictly safer than a correct parse and cannot be defeated by a tokenization
 * subtlety, because it makes no tokenization claim.
 */
describe("parseFeatureValue — recognises the canonical form, refuses everything else", () => {
  const enabled = (value: string): string[] => {
    const parsed = parseFeatureValue(value);
    if (!parsed.recognized) throw new Error(`refused: ${value}`);
    return parsed.settings
      .filter((f) => f.enabled)
      .map((f) => f.tag)
      .sort();
  };

  test.each([
    ['"ss04" 1', ["ss04"], "the ordinary case"],
    ['"ss04"', ["ss04"], "an omitted value means 1"],
    ['"ss04" on', ["ss04"], "`on` is 1"],
    ['"ss04" off', [], "`off` is 0"],
    ['"ss04" 0', [], "r2 mutant: a present tag is not an enabled tag"],
    ['"ss04" +1', ["ss04"], "CSS Syntax permits a leading + on an integer"],
    ['"ss04" +0', [], "…and +0 is still zero"],
    ['"ss04" 1, "tnum" 1', ["ss04", "tnum"], "comma separated"],
    ['"ss04" 1, "ss04" 0', [], "r3 mutant: duplicates are last-value-wins"],
    ['"ss04" 0, "ss04" 1', ["ss04"], "…in both directions"],
    ["normal", [], "the initial value declares no features"],
  ])("accepts %s → %j (%s)", (value, expectedTags) => {
    expect(enabled(value as string)).toEqual(expectedTags);
  });

  test.each([
    ['"ss04" -1', "a negative integer is invalid per CSS Fonts 4 §6.12"],
    ['"ss04" var(--x)', "r3 mutant: a runtime value cannot be resolved statically"],
    ['"A,B!" 1', "r4 mutant: a comma is a legal tag character, so this is ambiguous here"],
    ['"A\\2c B!" 1', "r5 mutant: a hex escape"],
    ['"ZZ-Z"/**/1', "r5 mutant: a comment inside the value"],
    ['"ZZ-Z" o\\6e', "r6 mutant: an escape inside the keyword"],
    ['"ZZ\\\n-Z" 1', "r6 mutant: an escaped-newline string continuation"],
    ['"ZZ-Z" \\6f n', "r7 mutant: a whitespace-TERMINATED hex escape"],
    ['"toolong" 1', "a tag is exactly four characters"],
    ['"ab" 1', "…in both directions"],
  ])("REFUSES %s (%s)", (value) => {
    const parsed = parseFeatureValue(value as string);
    expect(parsed.recognized, `expected a refusal for ${value}`).toBe(false);
  });

  test("every whitespace spelling of a terminated escape is refused", () => {
    // Round 7 showed all six spellings tokenize differently from a browser in
    // postcss-value-parser. None of them is interpreted now; all are refused.
    for (const ws of [" ", "\t", "\n", "\r", "\f", "\r\n"]) {
      const value = `"ZZ-Z" \\6f${ws}n`;
      expect(
        parseFeatureValue(value).recognized,
        `escape terminated by ${JSON.stringify(ws)}`,
      ).toBe(false);
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

  test("every font-feature-settings value in the sheet is one the guard understands", () => {
    // The load-bearing half of the strict recogniser. Without this, an exotic
    // spelling would simply contribute no tags and every other assertion would
    // stay green — which is the shrug this whole change exists to eliminate.
    // With it, a spelling the guard cannot interpret STOPS THE BUILD.
    const refused = refusedValues(css);
    expect(refused, refused.map((r) => `${JSON.stringify(r.raw)}: ${r.reason}`).join("\n")).toEqual(
      [],
    );
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
