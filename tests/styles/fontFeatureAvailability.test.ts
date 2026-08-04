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
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import * as fontkit from "fontkit";
import postcss from "postcss";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import { stripCommentsForFile } from "../_shared/stripComments";

const REPO_ROOT = resolve(__dirname, "..", "..");

/**
 * The stylesheet the BROWSER gets, not the one we wrote.
 *
 * `app/globals.css` begins `@import "tailwindcss"`, so the shipped cascade
 * contains rules this repo never typed. Round 10 found two consequences at once:
 * Tailwind's preflight emits `code, kbd, samp, pre { font-feature-settings: … }`,
 * which overrides the inherited `html { "ss04" 1 }` on every `<code>` in the
 * product; and an arbitrary utility like `[font-feature-settings:'ZZ-Z'_1]` in a
 * className compiles to a real declaration that raw parsing cannot see at all.
 *
 * Analysing the source was answering "what did we write?" when the question is
 * "what ships?". Compilation is ~250ms once per file.
 */
let compiledCssCache: string | null = null;
function compiledCss(): string {
  if (compiledCssCache !== null) return compiledCssCache;
  const out = resolve(tmpdir(), `fxav-tw-${process.pid}.css`);
  execFileSync(
    "npx",
    [
      "@tailwindcss/cli",
      "-i",
      "app/globals.css",
      "-o",
      out,
      // EVERY product tree, not just `app/`. Tailwind only emits a utility it
      // finds in scanned content, so a `--content` glob narrower than the code
      // makes the compiled sheet a partial view — and round 19's `oldstyle-nums`
      // mutant, placed in `components/`, compiled to nothing at all under an
      // `app/**` glob. A guard reading a partial sheet is a guard with a hole
      // shaped like whatever it forgot to scan.
      "--content",
      "{app,components,lib}/**/*.{tsx,ts,jsx,js,mdx}",
    ],
    { cwd: REPO_ROOT, stdio: "pipe" },
  );
  compiledCssCache = readFileSync(out, "utf8");
  rmSync(out, { force: true });
  return compiledCssCache;
}

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

/** Tailwind preflight's own spelling: a custom property defaulting to `normal`. */
const DECLARES_NOTHING = /^var\(\s*--[\w-]+\s*,\s*normal\s*\)$/i;

export type ParsedValue =
  | { recognized: true; settings: FeatureSetting[] }
  | { recognized: false; reason: string };

/** Parse a value, or REFUSE it. Refusal is a build failure, not a shrug. */
export function parseFeatureValue(value: string): ParsedValue {
  const trimmed = value.trim();
  // `normal` is the initial value; `inherit` takes the parent's; and Tailwind's
  // preflight writes `var(--default-…-font-feature-settings, normal)`. None of
  // the three declares a feature, and all three are legitimate in the compiled
  // sheet, so they are recognised as declaring nothing rather than refused.
  if (IS_NORMAL.test(trimmed) || /^inherit$/i.test(trimmed) || DECLARES_NOTHING.test(trimmed)) {
    return { recognized: true, settings: [] };
  }

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

/**
 * Property names, normalised — and ESCAPED ones refused outright.
 *
 * A CSS property name is an identifier sequence, so `f\\6f nt-feature-settings` is
 * `font-feature-settings` to a browser (CSS Syntax §2.1). Round 9's mutant used
 * exactly that: postcss preserved the escaped spelling in `decl.prop`, the walk
 * never matched, and an unsupported tag was never refused because the
 * declaration was never seen. Round 8's mutant was the same idea in ASCII case.
 *
 * Decoding property names correctly is the round-3-through-7 mistake in a new
 * position, and the answer is the one §12.7 settled on: do not interpret the
 * exotic form, REFUSE it. An escaped property name has no legitimate use in this
 * stylesheet — it is an obfuscation, not a style — so any backslash in a
 * property name fails the build. Case is genuinely legitimate, so it is
 * normalised rather than refused.
 */
export function normalizeProp(prop: string): { name: string; escaped: boolean } {
  return { name: prop.trim().toLowerCase(), escaped: prop.includes("\\") };
}

/** Property names carrying an escape. Non-empty is a build failure. */
export function escapedPropertyNames(cssSource: string): string[] {
  const out: string[] = [];
  postcss.parse(cssSource).walkDecls((decl) => {
    if (normalizeProp(decl.prop).escaped) out.push(decl.prop);
  });
  return out;
}

/**
 * Every rule in `cssSource` that declares `font-feature-settings`.
 *
 * Walks EVERY declaration and compares the normalised name, rather than asking
 * postcss to match one — a matcher only ever finds the spellings it was told
 * about, and rounds 8 and 9 each supplied one it had not been told about.
 */
export function featureRules(
  cssSource: string,
): { selectors: string[]; settings: FeatureSetting[]; refusal: string | null; raw: string }[] {
  const rules: {
    selectors: string[];
    settings: FeatureSetting[];
    refusal: string | null;
    raw: string;
  }[] = [];
  postcss.parse(cssSource).walkDecls((decl) => {
    if (normalizeProp(decl.prop).name !== "font-feature-settings") return;
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
 * Shorthands that reset `font-feature-settings` to its initial value while naming
 * neither property. `font` per CSS Fonts 4 §2.7; `all` per CSS Cascade — round 10
 * mutation-proved `all: initial` on a real transcribe-back surface.
 */
const RESETTING_SHORTHANDS = new Set(["font", "all"]);

/**
 * The only selectors where `inherit` is not lossy: Tailwind preflight's, which
 * sit at the top of the cascade and hand elements the page's own typography.
 */
const INHERIT_IS_SAFE = new Set([
  "button, input, select, optgroup, textarea, ::file-selector-button",
]);

/**
 * Rules using a RESETTING SHORTHAND, which silently resets `font-feature-settings`
 * and `font-variant-numeric` to their initial values (CSS Fonts 4 §2.7).
 *
 * Round 3's mutant was `main .code-value { font: 400 16px var(--font-sans); }` —
 * a declaration that names neither property, so walking `font-feature-settings`
 * declarations could never see it, while every real `.code-value` surface (all
 * four are under `<main>`) silently lost `zero`.
 */
export function fontShorthandRules(cssSource: string): string[] {
  const out: string[] = [];
  postcss.parse(cssSource).walkDecls((decl) => {
    if (!RESETTING_SHORTHANDS.has(normalizeProp(decl.prop).name)) return;
    // `font: inherit` INHERITS rather than resets — but only Tailwind preflight's
    // form-control rule earns the exemption. Round 19: a rule scoped to a real
    // element with `font: inherit` makes `.code-value` inherit the ROOT's `ss04`
    // alone, silently dropping `tnum` and `zero` while every tag count stays
    // green. Inheriting is safe at the top of the cascade and lossy below it.
    const parentSel =
      decl.parent && "selector" in decl.parent ? String(decl.parent.selector).trim() : "";
    if (/^inherit$/i.test(decl.value.trim()) && INHERIT_IS_SAFE.has(parentSel)) return;
    const parent = decl.parent;
    out.push(parent && "selector" in parent ? String(parent.selector) : "(unknown)");
  });
  return out;
}

/**
 * Selectors allowed to RESET `font-feature-settings` — i.e. to declare it while
 * enabling nothing, overriding what they inherit.
 *
 * Round 10's finding: Tailwind preflight emits these, they are invisible in the
 * source we wrote, and one of them means every bare `<code>` in the product
 * renders WITHOUT `ss04`. That is acceptable — preflight also gives those
 * elements a monospace family, where `I`/`l`/`1` are already distinct by design,
 * so the disambiguation has nothing to add — but it is a real exception to
 * DESIGN.md §2.4's reach, and it is pinned here rather than left to be
 * rediscovered. A NEW reset, from any source, fails the build.
 */
const ALLOWED_FEATURE_RESETS = new Map<string, string>([
  ["html, :host", "Tailwind preflight's own root default; our later `html` rule wins the cascade."],
  [
    "code, kbd, samp, pre",
    "Tailwind preflight. These render in a monospace family where I/l/1 are already " +
      "distinct, so ss04 has nothing to add. `.code-value` is a class and still wins " +
      "on any element that opts in.",
  ],
]);

/**
 * Selectors allowed to set `font-family`, and why.
 *
 * Family 9's other half. Round 17 closed the INLINE face swap; round 18 showed a
 * plain rule does the same thing — `[data-testid="…"] { font-family: ui-monospace }`
 * changes the face beneath a perfectly valid feature declaration, and the
 * compiled analyser checked values, resets, shorthands, tags, axes and payload
 * but never the family.
 *
 * The product sets the family in exactly two places, and Tailwind's preflight in
 * three more. Anything else fails the build: a face swap is how a correct
 * declaration renders nothing, which is this whole change's subject.
 */
const ALLOWED_FONT_FAMILY_RULES = new Map<string, string>([
  ["html", "the app's own root binding: `var(--font-sans)`, which reads `--font-inter`."],
  [".code-value", "binds the UI family so the features are not inert on a <code> (§12.2)."],
  [
    "html, :host",
    "Tailwind preflight's root default; the app's later `html` rule wins the cascade.",
  ],
  [
    "code, kbd, samp, pre",
    "Tailwind preflight's monospace default — the §2.4 documented exception.",
  ],
  [
    "button, input, select, optgroup, textarea, ::file-selector-button",
    "Tailwind preflight: `font-family: inherit`, so controls keep the page's typography.",
  ],
  ["::backdrop", "Tailwind preflight's root-variable mirror for the backdrop pseudo-element."],
  [
    ":root, :host",
    "the `@theme` token block itself, where `--font-sans` is DEFINED. Defining the " +
      "token is the binding; a rule that REASSIGNS it lower in the cascade is the " +
      "face swap this list exists to catch.",
  ],
  [
    ".font-mono",
    "Tailwind's `font-mono` utility, used deliberately on sheet ids, warning payloads " +
      "and the shows-table heading. Same disposition as the preflight mono rule: those " +
      "surfaces render in a monospace face where I/l/1 are already distinct, so ss04 has " +
      "nothing to add. A `.code-value` on such an element still wins, being later and " +
      "equally specific.",
  ],
]);

/**
 * Every rule that sets `font-family` OR the tokens it resolves through.
 *
 * `html { font-family: var(--font-sans) }`, so a rule setting `--font-sans` swaps
 * the active face without ever writing `font-family` — round 19's mutant was
 * Tailwind's ordinary arbitrary-property class `[--font-sans:ui-monospace]`,
 * which emits exactly that and nothing else.
 */
const FACE_PROPERTIES = new Set(["font-family", "--font-sans", "--font-inter"]);

/**
 * FAMILY 11 — the semantic `font-variant-*` properties.
 *
 * `font-feature-settings` is the low-level door; `font-variant-numeric` and its
 * siblings are the one an ordinary developer actually walks through, usually via
 * a Tailwind utility. Round 19's mutant is as ordinary as it gets: the class
 * `oldstyle-nums` compiles to `font-variant-numeric: oldstyle-nums`, requesting
 * OpenType `onum` — and a fontkit probe produced IDENTICAL glyph ids and advances
 * with `onum` on or off, because the shipped font has no such feature. Silent,
 * exactly like `cv11`, and squarely inside §13.1's threat model.
 */
const FONT_VARIANT_KEYWORD_TAGS = new Map<string, string>([
  ["ordinal", "ordn"],
  ["slashed-zero", "zero"],
  ["lining-nums", "lnum"],
  ["oldstyle-nums", "onum"],
  ["proportional-nums", "pnum"],
  ["tabular-nums", "tnum"],
  ["diagonal-fractions", "frac"],
  ["stacked-fractions", "afrc"],
  ["small-caps", "smcp"],
  ["all-small-caps", "c2sc"],
  ["petite-caps", "pcap"],
  ["all-petite-caps", "c2pc"],
  ["unicase", "unic"],
  ["titling-caps", "titl"],
  ["common-ligatures", "liga"],
  ["discretionary-ligatures", "dlig"],
  ["historical-ligatures", "hlig"],
  ["contextual", "calt"],
]);

/**
 * The properties that can CARRY a font-variant keyword.
 *
 * The obvious ones, plus Tailwind v4's indirection: `.oldstyle-nums` does not
 * emit `font-variant-numeric: oldstyle-nums`. It emits
 * `--tw-numeric-figure: oldstyle-nums` and composes the longhand from five
 * `var()`s, so reading the longhand's VALUE sees only `var(…)` and never the
 * keyword. Round 19's mutant compiled to exactly that and sailed past a scan
 * that only looked at `font-variant-*`.
 */
const FONT_VARIANT_PROPS =
  /^(font-variant(-numeric|-caps|-ligatures|-east-asian|-alternates)?|--tw-[a-z-]*(ordinal|zero|numeric|caps|ligatures)[a-z-]*)$/;

/**
 * Class tokens that actually appear in a `className` / `class` attribute.
 *
 * Tailwind's content scanner is TEXT-based: it emits `.ordinal` because the word
 * `ordinal` appears in `components/crew/DiagramsBlock.tsx` as a JS PARAMETER
 * NAME, not because any element uses the class. So "present in the compiled
 * sheet" is not "reaches an element", and checking every emitted utility reports
 * features nothing requests.
 *
 * A utility rule is only checked when its class is genuinely applied somewhere.
 * Non-class selectors — elements, attributes, our own hand-written rules — are
 * always checked, since those apply by construction.
 */
function appliedClassTokens(): Set<string> {
  const tokens = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(path);
        continue;
      }
      if (!SCANNED_EXTENSIONS.test(entry.name)) continue;
      const source = readFileSync(path, "utf8");
      for (const attr of source.matchAll(
        /class(?:Name)?\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g,
      )) {
        for (const token of (attr[1] ?? attr[2] ?? attr[3] ?? "").split(/\s+/)) {
          if (token !== "") tokens.add(token.replace(/^[a-z-]+:/, ""));
        }
      }
    }
  };
  for (const root of PRODUCT_ROOTS) walk(resolve(REPO_ROOT, root));
  return tokens;
}

/** Every OpenType tag the sheet requests through a `font-variant-*` keyword. */
export function fontVariantTags(cssSource: string): { tag: string; selector: string }[] {
  const out: { tag: string; selector: string }[] = [];
  postcss.parse(cssSource).walkDecls((decl) => {
    if (!FONT_VARIANT_PROPS.test(normalizeProp(decl.prop).name)) return;
    const selector =
      decl.parent && "selector" in decl.parent ? String(decl.parent.selector) : "(unknown)";
    for (const word of decl.value.toLowerCase().split(/\s+/)) {
      const tag = FONT_VARIANT_KEYWORD_TAGS.get(word.trim());
      if (tag) out.push({ tag, selector });
    }
  });
  return out;
}

export function fontFamilyRules(cssSource: string): string[] {
  const out: string[] = [];
  postcss.parse(cssSource).walkDecls((decl) => {
    if (!FACE_PROPERTIES.has(normalizeProp(decl.prop).name)) return;
    const parent = decl.parent;
    out.push(parent && "selector" in parent ? String(parent.selector) : "(unknown)");
  });
  return out;
}

/** Rules that declare the property but enable nothing — i.e. that RESET it. */
export function featureResetRules(cssSource: string): string[] {
  return featureRules(cssSource)
    .filter(
      (r) =>
        r.refusal === null &&
        r.settings.every((f) => !f.enabled) &&
        // `inherit` is only non-lossy where preflight uses it — form controls, at
        // the top of the cascade, taking the page's typography. Scoped LOWER it
        // drops whatever the element would otherwise have declared: round 19's
        // mutant put it on the real transcribe-back element, which then inherited
        // the root's `ss04` alone and silently lost `tnum` and `zero`.
        !(/^inherit$/i.test(r.raw.trim()) && INHERIT_IS_SAFE.has(r.selectors.join(", "))),
    )
    .map((r) => r.selectors.join(", "));
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

/**
 * INLINE STYLES ARE THE LAST DECLARATION PATH, AND THEY ARE REFUSED.
 *
 * The guard reads the compiled stylesheet, which is what the browser gets — but
 * a React `style={{ fontFeatureSettings: '"ZZ-Z" 1' }}` never appears in any
 * stylesheet at all, and inline precedence beats every class. Round 11 proved it
 * against the wizard's real transcribe-back surface: the compiled sheet still
 * held exactly six declarations while the browser honoured a seventh.
 *
 * There is no legitimate use for setting these properties inline in this
 * codebase — the whole design is two classes and a root rule — so rather than
 * try to VALIDATE an inline value (the mistake rounds 3–7 kept making), any
 * occurrence in product source fails the build. That is the same fail-closed
 * posture §12.7 settled on, applied to the one path left.
 *
 * Walked from disk over `app/`, `components/` and `lib/`, so a new file is
 * covered by default rather than silently exempt.
 */
/**
 * Every spelling by which a font-feature declaration can reach the browser
 * WITHOUT passing through the compiled stylesheet.
 *
 * Round 11 banned the bare object-property spelling. Round 12 demonstrated three
 * families it missed, each with live emitted HTML: the repository's 13 routed
 * `.mdx` help pages were not scanned at all; quoted and computed property
 * spellings (`"fontFeatureSettings"`, `["fontFeatureSettings"]`,
 * `.style.fontFeatureSettings =`, `.style.setProperty("font-feature-settings")`)
 * slipped past a pattern anchored on a bare identifier; and inline `font` and
 * `all` RESETTERS were not covered at all, though they are precisely what the
 * compiled-CSS shorthand ban exists to stop.
 *
 * So the property scan matches the NAME in any spelling, camel or kebab, quoted
 * or not — the baseline is zero occurrences, so there is nothing to be precise
 * about — and the resetter scan is scoped to inline style regions, where `font`
 * and `all` mean what they mean in CSS.
 */
const FEATURE_PROP_SPELLINGS =
  /fontFeatureSettings|fontVariantNumeric|font-feature-settings|font-variant-numeric|fontFamily|font-family/i;

/**
 * CSSOM writes that can set or reset the guarded features.
 *
 * Round 13 claimed "CSSOM writes are matched directly"; round 14 produced EIGHT
 * decidable literal forms that escaped, all live in a JSDOM probe. They fall in
 * two groups.
 *
 * NAME-TARGETED — `.style` has legitimate uses in this codebase (`overflow`,
 * `maxHeight`, `visibility`), so these match the guarded property specifically:
 * `.style.font =`, `.style.all =`, `.style["font"] =`, `.setProperty("font", …)`
 * in any spelling including a bracketed method name, and across line breaks
 * (matched against the whole file, not line by line — a multiline call was one
 * of the escapes).
 *
 * WHOLESALE — these carry ARBITRARY CSS, so no name-targeting is possible and
 * none has a legitimate use here (baseline: zero occurrences): `.style.cssText =`,
 * `setAttribute("style", …)`, and `Object.assign(el.style, …)`.
 */
const GUARDED_CSS_NAME = String.raw`font-feature-settings|font-variant-numeric|font-family|font|all`;
const GUARDED_JS_NAME = String.raw`fontFeatureSettings|fontVariantNumeric|fontFamily|font|all`;

/**
 * Access and assignment are GENERALISED, not enumerated.
 *
 * Round 14 closed eight spellings; round 15 produced five more — `cssText +=`,
 * `["cssText"] =`, `font ||=`, `setProperty?.(…)`, `setAttribute?.(…)` — every
 * one of them the same write through a form the patterns had not been told
 * about. Enumerating spellings is the mistake this file has now made in four
 * different positions, so these three fragments cover the shapes instead:
 *
 *   ACCESS      `.x`, `?.x`, `["x"]`, `?.["x"]`
 *   ASSIGN      `=` and every compound form (`+=`, `||=`, `&&=`, `??=`, …)
 *   CALL        `.f(`, `?.f(`, `["f"](`
 *
 * `.style` itself is NOT bannable — `overflow`, `maxHeight` and `visibility` are
 * legitimate uses in this codebase — so writes are matched by PROPERTY NAME,
 * except the three forms carrying arbitrary CSS, which are banned outright.
 */
const ACCESS = String.raw`(?:\??\.\s*|\??\[\s*["'\`]\s*)`;
const ACCESS_END = String.raw`(?:\s*["'\`]\s*\])?`;
const ASSIGN = String.raw`\s*(?:[-+*/%&|^?]{0,2}=)(?!=)`;
const CALL = String.raw`(?:\??\.\s*|\[\s*["'\`])`;
/** `(`, or the optional-chaining call form `?.(`. */
const CALL_OPEN = String.raw`\s*\??\.?\s*\(`;

const CSSOM_WRITES: [RegExp, string][] = [
  [
    new RegExp(
      String.raw`\bstyle\s*${ACCESS}(?:${GUARDED_JS_NAME}|${GUARDED_CSS_NAME})${ACCESS_END}${ASSIGN}`,
      "i",
    ),
    "CSSOM property write",
  ],
  [
    new RegExp(String.raw`\bstyle\s*${ACCESS}cssText${ACCESS_END}${ASSIGN}`, "i"),
    "cssText write (arbitrary CSS)",
  ],
  [
    new RegExp(
      String.raw`${CALL}setProperty["'\`]?\s*\]?${CALL_OPEN}\s*["'\`]\s*(?:${GUARDED_CSS_NAME})\s*["'\`]`,
      "i",
    ),
    "CSSOM setProperty",
  ],
  [
    new RegExp(
      String.raw`${CALL}setAttribute["'\`]?\s*\]?${CALL_OPEN}\s*["'\`]\s*style\s*["'\`]`,
      "i",
    ),
    "setAttribute('style') (arbitrary CSS)",
  ],
  [/Object\.assign\s*\([^)]*\.style\b/i, "Object.assign onto .style (arbitrary CSS)"],
  // Assignment to the STYLE OBJECT itself, not to a member of it:
  // `el.style = "font: 16px Arial"`. Round 16's escape, and a genuinely different
  // shape — every pattern above models a write THROUGH `.style` to a named
  // property, so none of them saw a write TO `.style`. Carries arbitrary CSS, so
  // it is banned outright; baseline is zero.
  // MEMBER ACCESS REQUIRED. A bare `style\s*=` also matches JSX's `style={{ … }}`
  // attribute — not a CSSOM write, and present on 19 files here. The leading
  // `.`/`["…"]` is what distinguishes a write to the style OBJECT from an
  // attribute that happens to share its name.
  [
    new RegExp(String.raw`${ACCESS}style${ACCESS_END}${ASSIGN}`, "i"),
    "assignment to .style itself (arbitrary CSS)",
  ],
  // …and the same thing through a spread/assign onto the ELEMENT.
  [/Object\.assign\s*\([^)]*\{[^}]*\bstyle\s*:/i, "Object.assign setting .style (arbitrary CSS)"],
];

/** `style={{ … }}` and `style="…"` regions, where `font`/`all` are CSS resetters. */
const INLINE_STYLE_REGION = /style\s*=\s*(\{\{[\s\S]*?\}\}|"[^"]*"|'[^']*')/g;
const INLINE_RESETTER = /\b(font|all|fontFamily|font-family)\s*:/i;

const PRODUCT_ROOTS = ["app", "components", "lib"] as const;
const SCANNED_EXTENSIONS = /\.(tsx?|jsx?|mdx?)$/;

export function inlineFeatureStyles(): string[] {
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") walk(path);
        continue;
      }
      if (!SCANNED_EXTENSIONS.test(entry.name)) continue;
      // Comments stripped via THE shared module — a doc comment describing
      // `font-variant-numeric` is prose, not a declaration, and
      // components/atoms/KeyValue.tsx wraps exactly that across a line break.
      // tests/cross-cutting/_metaStripCommentsSingleSource.test.ts forbids a
      // local copy, and it handles every extension scanned here.
      const source = stripCommentsForFile(readFileSync(path, "utf8"), path);
      const rel = path.slice(REPO_ROOT.length + 1);

      for (const [i, line] of source.split("\n").entries()) {
        if (FEATURE_PROP_SPELLINGS.test(line)) hits.push(`${rel}:${i + 1} (feature property)`);
      }
      // Whole-file, because a `setProperty(` call can straddle a line break.
      // Newlines collapsed for the CSSOM scan: a call can straddle lines, and
      // round 14's multiline `setProperty(` escape was exactly that.
      const flat = source.replace(/\s+/g, " ");
      for (const [pattern, label] of CSSOM_WRITES) {
        const m = pattern.exec(flat);
        if (m) hits.push(`${rel} (${label})`);
      }
      for (const region of source.matchAll(INLINE_STYLE_REGION)) {
        if (!INLINE_RESETTER.test(region[1] ?? "")) continue;
        const line = source.slice(0, region.index).split("\n").length;
        hits.push(`${rel}:${line} (inline font/all resetter)`);
      }
    }
  };
  for (const root of PRODUCT_ROOTS) walk(resolve(REPO_ROOT, root));
  return hits;
}

/**
 * The guard compiles ONE stylesheet: `app/globals.css`, the entrypoint both Next
 * roots import. A CSS Module or any other first-party sheet imported by a
 * component would never reach that compilation, so a `"cv11"` declaration or a
 * `font` reset inside one escapes every check here — round 17's second finding,
 * and `components/agenda/AgendaPdfViewer.tsx:44` proves component-imported
 * stylesheet entrypoints already exist in this codebase.
 *
 * Today there is exactly one first-party stylesheet, which is why the compiled
 * analysis is sound. This assertion is what keeps that true: adding a second one
 * fails the build and says to extend the guard rather than silently opening a
 * path around it.
 *
 * Third-party CSS (`react-pdf`'s layer stylesheets) is out of scope by
 * declaration — vendor CSS for a PDF viewer cannot meaningfully declare this
 * product's font features, and scanning `node_modules` is not proportionate.
 */
const FIRST_PARTY_STYLESHEETS = ["app/globals.css"];

describe("only one first-party stylesheet exists, so compiling it is sufficient", () => {
  test("no stylesheet under app/, components/ or lib/ escapes the compiled analysis", () => {
    // EVERY STYLESHEET IN THE TREE, tracked or not, walked from the repo root.
    // Next permits a CSS Module to be imported from anywhere, so
    // `styles/Step1Share.module.css` sits outside app/components/lib and was
    // invisible — round 18's second finding. `git ls-files` was the first fix and
    // was itself incomplete: it lists only TRACKED files, so a module that had
    // not been committed yet escaped. A developer writing one will `git add` it,
    // so the walk cannot depend on that having happened.
    const IGNORED_DIRS = new Set([
      "node_modules",
      ".git",
      "docs", // mocks and specs, never served by this app
      "tests", // fixtures
      "playwright-report",
      "test-results",
    ]);
    const found: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith(".next")) continue;
          walk(join(dir, entry.name));
        } else if (/\.(css|scss|sass|less)$/.test(entry.name)) {
          found.push(join(dir, entry.name).slice(REPO_ROOT.length + 1));
        }
      }
    };
    walk(REPO_ROOT);
    expect(
      found.sort(),
      `the guard compiles only ${FIRST_PARTY_STYLESHEETS.join(", ")}. A stylesheet it ` +
        `does not compile can declare a feature the font lacks, or reset one, entirely ` +
        `unseen — extend the compilation deliberately rather than adding a blind spot.`,
    ).toEqual(FIRST_PARTY_STYLESHEETS);
  });
});

describe("inline styles cannot set the font features", () => {
  test("no product source sets fontFeatureSettings or fontVariantNumeric inline", () => {
    const hits = inlineFeatureStyles();
    expect(
      hits,
      `these set a font-feature property inline, where it beats every class and ` +
        `never appears in any stylesheet the guard can read: ${hits.join(", ")}. ` +
        `Use \`.tabular-nums\` or \`.code-value\`, or extend this guard deliberately.`,
    ).toEqual([]);
  });

  test("the walk actually reaches product source", () => {
    // Non-vacuity: a walk that found no files would pass the assertion above
    // while proving nothing, which is the exact shape of the bug this file exists
    // to catch.
    let files = 0;
    const count = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== "node_modules") count(path);
        } else if (SCANNED_EXTENSIONS.test(entry.name)) files += 1;
      }
    };
    for (const root of PRODUCT_ROOTS) count(resolve(REPO_ROOT, root));
    expect(files).toBeGreaterThan(100);
  });
});

describe("font feature availability", () => {
  // The SHIPPED sheet, Tailwind included. Analysing the source we wrote answers
  // "what did we type?"; the question is "what does the browser get?" (§12.10).
  const css = compiledCss();
  const declaredTags = extractFeatureTags(css);

  test("the loaded font path resolves to a file that exists", () => {
    const path = resolveLoadedFontPath();
    expect(existsSync(path), `app/fonts.ts src resolves to ${path}`).toBe(true);
  });

  test("no property name is written with an escape", () => {
    // A property name is an identifier sequence, so `f\\6f nt-feature-settings` is
    // `font-feature-settings` to a browser while postcss keeps the escaped
    // spelling — round 9's mutant hid a whole declaration that way. Escaped
    // property names have no legitimate use here, so rather than decode them
    // (the mistake rounds 3-7 kept making one position over), they fail the build.
    const escaped = escapedPropertyNames(css);
    expect(
      escaped,
      `these property names carry a CSS escape: ${escaped.join(", ")}. A browser ` +
        `decodes them; this guard refuses them. Write the plain name.`,
    ).toEqual([]);
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

  test("every font-variant-* keyword requests a feature the font actually has", () => {
    // The door an ordinary developer walks through. `oldstyle-nums` is a Tailwind
    // utility; it compiles to `font-variant-numeric: oldstyle-nums`, requests
    // `onum`, and renders nothing at all on a font without it — silent, exactly
    // like the `cv11` this whole change exists to kill.
    const applied = appliedClassTokens();
    const reaches = (selector: string): boolean => {
      const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]!);
      // A rule with no class in its selector applies by construction.
      return classes.length === 0 || classes.some((c) => applied.has(c));
    };
    const requested = fontVariantTags(css).filter((r) => reaches(r.selector));
    const available = new Set(availableFeatures(resolveLoadedFontPath()));
    const missing = requested.filter((r) => !available.has(r.tag));
    expect(
      missing.map((m) => `${m.selector} requests ${m.tag}`),
      "these font-variant keywords request OpenType features the loaded font does " +
        "not have, so they render nothing",
    ).toEqual([]);
    // Non-vacuity: the tabular rule alone requests `tnum`, so an empty result
    // would mean the walk stopped finding declarations.
    expect(requested.length, "font-variant declarations are being found at all").toBeGreaterThan(0);
  });

  test("the subset still covers the scripts the coverage decision chose", () => {
    // Round 19 P2: the spec claimed the guard "fails on any lossy regeneration",
    // and it did not — features, axes and a byte budget all survive dropping
    // LATIN_EXT, which would silently lose the Polish/Czech/Turkish coverage the
    // payload decision explicitly bought (§2.6). Codepoints are the only thing
    // that actually pins that decision.
    const font = fontkit.openSync(resolveLoadedFontPath());
    const has = (cp: number): boolean =>
      "hasGlyphForCodePoint" in font && font.hasGlyphForCodePoint(cp);
    const SAMPLES: [string, number][] = [
      ["basic latin 'A'", 0x41],
      ["latin-1 'é'", 0xe9],
      ["latin-ext Polish 'ł'", 0x142],
      ["latin-ext Czech 'č'", 0x10d],
      ["latin-ext Turkish 'ğ'", 0x11f],
      ["latin-ext Romanian 'ș'", 0x219],
      ["latin-ext Hungarian 'ő'", 0x151],
    ];
    const missing = SAMPLES.filter(([, cp]) => !has(cp)).map(([name]) => name);
    expect(
      missing,
      `the subset lost codepoints the coverage decision chose: ${missing.join(", ")}. ` +
        `Narrowing coverage is a payload decision of the kind recorded in §2.6, not a ` +
        `maintenance step.`,
    ).toEqual([]);
    // …and the scripts deliberately DROPPED stay dropped, so this assertion is
    // pinning a decision rather than just asserting a big font.
    expect(has(0x0416), "Cyrillic Ж is deliberately not covered").toBe(false);
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
    // Only rules that ENABLE something. A rule declaring nothing is a RESET, and
    // resets are governed by ALLOWED_FEATURE_RESETS below, not by this invariant.
    const rules = featureRules(css)
      .map((r) =>
        r.settings
          .filter((f) => f.enabled)
          .map((f) => f.tag)
          .sort(),
      )
      .filter((tags) => tags.length > 0);
    expect(rules.length, "there are multiple rules for this check to compare").toBeGreaterThan(1);
    // Addressed by SELECTOR, never by position. Finding the root rule as "the one
    // with ss04 and no tnum" would silently pass if the html rule vanished and
    // some other rule happened to match that shape.
    // Compiled output has TWO `html` feature rules: preflight's, which declares
    // nothing, and ours, which comes later and wins. Take the last.
    const htmlRules = featureRules(css).filter((r) => r.selectors.includes("html"));
    const rootTags = htmlRules.length
      ? htmlRules[htmlRules.length - 1]!.settings.filter((f) => f.enabled)
          .map((f) => f.tag)
          .sort()
      : null;
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
      expect(
        tags,
        `${selector} declares font-feature-settings in the compiled sheet`,
      ).not.toBeNull();
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

    test("every rule that sets font-family is a known, justified one", () => {
      // Family 9's compiled-sheet half. A face swap makes a correct feature
      // declaration render nothing — the failure this whole change is about — and
      // a plain CSS rule does it just as well as an inline style.
      const unknown = fontFamilyRules(css).filter((sel) => !ALLOWED_FONT_FAMILY_RULES.has(sel));
      expect(
        unknown,
        `these rules set font-family without a recorded reason: ${unknown.join(" | ")}. ` +
          `Swapping the face beneath a valid feature declaration makes the features ` +
          `inert — add it to ALLOWED_FONT_FAMILY_RULES with why, or remove it.`,
      ).toEqual([]);
    });

    test("every rule that RESETS the features is a known, justified one", () => {
      // Round 10: preflight resets the property on `code, kbd, samp, pre`, so a
      // bare <code> renders without ss04 — invisible in the source we wrote, and
      // real in the browser. Pinned rather than hidden: each known reset carries
      // its reason, and a new one from any source fails the build.
      const unknown = featureResetRules(css).filter((sel) => !ALLOWED_FEATURE_RESETS.has(sel));
      expect(
        unknown,
        `these rules reset font-feature-settings without a recorded reason: ` +
          `${unknown.join(" | ")}. A reset silently undoes ss04 for everything it ` +
          `matches — add it to ALLOWED_FEATURE_RESETS with why, or remove it.`,
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
