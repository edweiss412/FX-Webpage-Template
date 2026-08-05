// Pure core for the static font guard: parse a stylesheet with Lightning CSS
// and expose the descriptor accessors the rows assert over.
//
// NO TEST-FRAMEWORK IMPORT. `tests/e2e/helpers/liveEntryToolchain.ts` imports
// `parseFontFaces` to check its own emitted output, and that runs inside
// Playwright processes.
//
// WHY LIGHTNING CSS, and not a regex or the browser CSSOM. It is the parser
// `@tailwindcss/cli` and `@tailwindcss/postcss` already use to compile
// `app/globals.css` and every harness entry, so checking the stylesheet with the
// compiler's own front end is a stronger claim than checking it with an
// arbitrary engine. Two earlier instruments failed for structural reasons: a
// regex over a formal grammar was broken twice (`SRC:` and `s\72 c:`, both valid
// spellings), and CSSOM does not exist in Node, so a guard built on it could not
// run in the merge-blocking unit suite that is supposed to run it.
import { transform } from "lightningcss";

export interface ParsedFace {
  /** Descriptor name to parsed value, LAST-WINS as CSS specifies. */
  readonly descriptors: ReadonlyMap<string, unknown>;
  /** Descriptor names declared more than once on this face. */
  readonly duplicated: readonly string[];
}

export interface ParseOptions {
  /**
   * Tolerate unparseable rules instead of throwing.
   *
   * REQUIRED when parsing `compileEntryCss` output, and never wanted when
   * parsing a stylesheet this repo authors. Tailwind emits
   * `.data-\[a\:b\]\:text-accent { &[data-a:b] { … } }` — generated from a
   * literal string its content scanner picks out of
   * `tests/styles/_metaRawAccentText.test.ts` — and `[data-a:b]` is an invalid
   * attribute selector. Lightning CSS REFUSES THE WHOLE SHEET rather than
   * skipping that one rule:
   *
   *   SyntaxError: Unexpected token in attribute selector: Colon
   *
   * Browsers skip the invalid rule harmlessly; a strict parser cannot. So the
   * app-side guard parses strictly (a syntax error in a file we wrote is a real
   * defect) and the harness-side guard passes `true`.
   */
  readonly errorRecovery?: boolean;
}

/**
 * Every `@font-face` rule in `css`, in source order.
 *
 * Descriptor names come from `property.type`, NOT from a `property` field —
 * `FontFaceProperty` exposes only `type` and `value`. Reading `.property` yields
 * `undefined` for every descriptor, collapsing them onto one key and leaving the
 * face empty. Two names are special-cased, matching the CSS grammar:
 *   { type: "source", … }                  -> "src"
 *   { type: "custom", value: { name, … } }  -> value.name
 */
export function parseFontFaces(css: string, opts: ParseOptions = {}): ParsedFace[] {
  const faces: ParsedFace[] = [];
  transform({
    filename: "fonts.css",
    code: Buffer.from(css),
    minify: false,
    errorRecovery: opts.errorRecovery ?? false,
    visitor: {
      Rule: {
        "font-face"(rule) {
          const descriptors = new Map<string, unknown>();
          const duplicated: string[] = [];
          for (const property of rule.value.properties as ReadonlyArray<{
            type: string;
            value: unknown;
          }>) {
            const name =
              property.type === "custom"
                ? (property.value as { name: string }).name
                : property.type === "source"
                  ? "src"
                  : property.type;
            if (descriptors.has(name)) duplicated.push(name);
            descriptors.set(name, property.value);
          }
          faces.push({ descriptors, duplicated });
          return undefined;
        },
      },
    },
  });
  return faces;
}

/** The declared `font-family`, or `""` when absent. */
export function familyOf(face: ParsedFace): string {
  const value = face.descriptors.get("font-family");
  return typeof value === "string" ? value : "";
}

export interface ParsedSource {
  readonly kind: "url" | "local";
  /**
   * URL as authored, for `kind: "url"`.
   *
   * The `| undefined` is required, not decorative: this repo compiles with
   * `exactOptionalPropertyTypes`, under which `url?: string` means "absent or a
   * string" and REJECTS an explicit `undefined`. The parse can legitimately
   * yield one when a malformed source reaches it, and a row asserting
   * `url === PUBLIC_FONT_URL` should see that rather than fail to compile.
   */
  readonly url?: string | undefined;
  /** Family name, for `kind: "local"`. */
  readonly local?: string | undefined;
  /** `format()` hint type, e.g. `"woff2"`. */
  readonly format?: string | undefined;
  /** `tech()` values; a non-empty list excludes the source in some engines. */
  readonly tech: readonly string[];
}

/**
 * The `src` list, decomposed.
 *
 * Lightning CSS hands this back structured, which is what lets the rows check
 * "exactly one source, a URL, woff2, no tech()" as four field reads instead of a
 * pattern — and why the `format()`/`tech()`/extra-comma mutants die on shape
 * rather than on spelling.
 */
export function srcOf(face: ParsedFace): ParsedSource[] {
  const raw = face.descriptors.get("src");
  if (!Array.isArray(raw)) return [];
  return raw.map((entry: Record<string, unknown>) => {
    const value = entry.value as Record<string, unknown> | undefined;
    if (entry.type === "url") {
      const url = value?.url as { url?: string } | string | undefined;
      return {
        kind: "url" as const,
        url: typeof url === "string" ? url : url?.url,
        format: (value?.format as { type?: string } | undefined)?.type,
        tech: (value?.tech as string[] | undefined) ?? [],
      };
    }
    return {
      kind: "local" as const,
      local: typeof value === "string" ? value : ((value?.name as string | undefined) ?? ""),
      tech: [],
    };
  });
}

/** `font-weight` as a numeric pair, e.g. `[100, 900]`. */
export function weightOf(face: ParsedFace): number[] {
  const raw = face.descriptors.get("font-weight");
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry: Record<string, unknown>) => (entry.value as { value?: unknown })?.value)
    .filter((n): n is number => typeof n === "number");
}

/** `font-style` as its parsed type, e.g. `"normal"`. */
export function styleOf(face: ParsedFace): string {
  return ((face.descriptors.get("font-style") as { type?: string } | undefined)?.type ?? "").trim();
}

/**
 * `font-display` as its keyword, e.g. `"swap"` or `"block"`.
 *
 * It arrives as a CUSTOM property (Lightning CSS has no typed descriptor for
 * it), shaped `{ name: "font-display", value: [{ type: "token", value: { type:
 * "ident", value: "swap" } }] }` — measured, not assumed.
 */
export function displayOf(face: ParsedFace): string {
  const raw = face.descriptors.get("font-display") as
    | { value?: ReadonlyArray<{ value?: { value?: unknown } }> }
    | undefined;
  const ident = raw?.value?.[0]?.value?.value;
  return typeof ident === "string" ? ident : "";
}

/**
 * The four metric overrides, as percentage NUMBERS (`89.79`, not `0.8979`).
 *
 * Each is a custom property whose token carries a `percentage` as a fraction:
 * `{ name: "ascent-override", value: [{ type: "token", value: { type:
 * "percentage", value: 0.8978999853134155 } }] }`. The stylesheet and DESIGN.md
 * both speak in percent, and the float carries representation error, so scale
 * by 100 and round to two decimals — which is the precision the CSS declares.
 */
export function overridesOf(face: ParsedFace): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of ["ascent-override", "descent-override", "line-gap-override", "size-adjust"]) {
    const raw = face.descriptors.get(name) as
      | { value?: ReadonlyArray<{ value?: { type?: string; value?: unknown } }> }
      | undefined;
    const token = raw?.value?.[0]?.value;
    if (token?.type !== "percentage" || typeof token.value !== "number") continue;
    out[name] = Math.round(token.value * 10000) / 100;
  }
  return out;
}

/** Descriptor names declared on a face, sorted, for set-equality rows. */
export function descriptorNames(face: ParsedFace): string[] {
  return [...face.descriptors.keys()].sort();
}

/**
 * Every declared value of a custom property, in source order.
 *
 * Declared-COUNT matters as much as the value: a regex over the whole file is
 * satisfied by a correct declaration anywhere, so redeclaring the token later
 * (CSS takes the last) passed an earlier formulation, as did appending trailing
 * families to the value.
 */
export function tokenDeclarations(css: string, token: string): string[] {
  const found: string[] = [];
  transform({
    filename: "tokens.css",
    code: Buffer.from(css),
    minify: false,
    visitor: {
      Declaration(decl) {
        const d = decl as { property?: string; value?: { name?: string; value?: unknown } };
        if (d.property === "custom" && d.value?.name === token) {
          found.push(stringifyTokenValue(d.value.value));
        }
        return undefined;
      },
    },
  });
  return found;
}

/** Render a parsed custom-property value as a comparable comma-joined string. */
function stringifyTokenValue(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const parts: string[] = [];
  for (const item of value as ReadonlyArray<{ type?: string; value?: unknown }>) {
    if (item.type !== "token") continue;
    const inner = item.value as { type?: string; value?: unknown } | undefined;
    if (inner?.type === "string" || inner?.type === "ident") parts.push(String(inner.value));
  }
  return parts.join(", ");
}

/**
 * The first LITERAL family inside a `var(<token>, …)` fallback list.
 *
 * New here; the spike never needed it, because it only ever parsed the fonts
 * stylesheet and never the consuming declaration in `app/globals.css`. It exists
 * for the literal-binding row: the app resolves the face through the token, but
 * every harness resolves it through this literal, since `compileEntryCss` emits
 * no token definition at all.
 */
export function firstVarFallbackFamily(css: string, token: string): string {
  // The declaration spans lines and Lightning CSS gives custom-property values
  // back as raw tokens, so read the fallback list textually but anchored to the
  // var() call itself rather than to the whole file.
  const at = css.indexOf(`var(${token},`);
  if (at === -1) return "";
  const tail = css.slice(at + `var(${token},`.length);
  const close = tail.indexOf(")");
  const fallback = close === -1 ? tail : tail.slice(0, close);
  const first = fallback.split(",")[0]?.trim() ?? "";
  return first.replace(/^["']|["']$/g, "");
}

/** Shape of one shipped stylesheet handed to `assertFontsCss`. */
export interface ShippedStylesheet {
  readonly label: string;
  readonly css: string;
}

export interface AssertOptions {
  /**
   * Every OTHER shipped stylesheet — `app/globals.css` plus any imported
   * dependency sheet. Rows 19-21 iterate this, and without the channel the
   * dependency-stylesheet mutants (M16) cannot be driven at all: they mutate a
   * file that is not the fonts stylesheet.
   */
  readonly shipped?: readonly ShippedStylesheet[];
  /** Expected family of the single Inter face. */
  readonly family?: string;
  /** Expected family of the metric-matched companion. */
  readonly fallbackFamily?: string;
  /** Expected metric-override percentages; defaults to the measured figures. */
  readonly overrides?: Readonly<Record<string, number>>;
}

const DEFAULT_DESCRIPTORS = ["font-display", "font-family", "font-style", "font-weight", "src"];

/**
 * Measured from a clean build of the pre-swap tree. These reproduce what the
 * framework loader generated from THIS binary, so the swap-frame reflow fix
 * survives the mechanism change unchanged.
 */
const DEFAULT_OVERRIDES: Readonly<Record<string, number>> = {
  "ascent-override": 89.79,
  "descent-override": 22.36,
  "line-gap-override": 0,
  "size-adjust": 107.89,
};
const DEFAULT_FALLBACK_DESCRIPTORS = [
  "ascent-override",
  "descent-override",
  "font-family",
  "line-gap-override",
  "size-adjust",
  "src",
];

/**
 * Run every structural row against a stylesheet STRING, throwing on the first
 * violation.
 *
 * This is the entry point the mutation matrix drives. Without it the rows are
 * only callable against the file on disk, and no mutant can be fed to them —
 * which would make the matrix assert on a copy of the guard rather than the
 * guard itself.
 *
 * It deliberately does NOT check the committed digest or the DESIGN.md parity:
 * those read the filesystem, are not properties of the string, and belong to the
 * on-disk rows in `tests/styles/fontLoading.test.ts`.
 */
export function assertFontsCss(css: string, opts: AssertOptions = {}): void {
  const family = opts.family ?? "Inter";
  const fallbackFamily = opts.fallbackFamily ?? "Inter Fallback";
  const faces = parseFontFaces(css);
  const inter = faces.filter((f) => familyOf(f) === family);
  const fallback = faces.filter((f) => familyOf(f) === fallbackFamily);

  const fail = (why: string): never => {
    throw new Error(`fonts.css: ${why}`);
  };

  if (inter.length !== 1) fail(`expected exactly one "${family}" face, found ${inter.length}`);
  if (fallback.length !== 1) {
    fail(`expected exactly one "${fallbackFamily}" face, found ${fallback.length}`);
  }
  for (const face of faces) {
    if (face.duplicated.length > 0) {
      fail(`descriptor declared twice: ${face.duplicated.join(", ")} (CSS applies the LAST)`);
    }
  }

  const main = inter[0]!;
  const names = descriptorNames(main);
  if (names.join(",") !== DEFAULT_DESCRIPTORS.join(",")) {
    fail(`descriptor inventory is ${names.join(", ")}, expected ${DEFAULT_DESCRIPTORS.join(", ")}`);
  }
  const weight = weightOf(main);
  if (weight.length !== 2 || weight[0] !== 100 || weight[1] !== 900) {
    fail(`font-weight is [${weight.join(", ")}], expected the variable pair 100 900`);
  }
  if (styleOf(main) !== "normal") fail(`font-style is "${styleOf(main)}", expected normal`);
  if (displayOf(main) !== "swap") fail(`font-display is "${displayOf(main)}", expected swap`);

  const sources = srcOf(main);
  if (sources.length !== 1) fail(`src has ${sources.length} sources, expected exactly one`);
  const only = sources[0]!;
  if (only.kind !== "url") fail(`src is ${only.kind}(), expected a url()`);
  if (only.format !== "woff2") fail(`src format is "${only.format ?? "none"}", expected woff2`);
  if (only.tech.length > 0) fail(`src carries tech(${only.tech.join(", ")}), which can exclude it`);
  if (!only.url || !/^\/fonts\/[A-Za-z0-9._-]+\.woff2$/.test(only.url)) {
    fail(`src url "${only.url ?? ""}" does not resolve to a committed /fonts/ file`);
  }

  const fb = fallback[0]!;
  const fbNames = descriptorNames(fb);
  if (fbNames.join(",") !== DEFAULT_FALLBACK_DESCRIPTORS.join(",")) {
    fail(`fallback inventory is ${fbNames.join(", ")}, expected exactly its six`);
  }
  const fbSources = srcOf(fb);
  if (fbSources.length !== 1 || fbSources[0]!.kind !== "local" || fbSources[0]!.local !== "Arial") {
    fail(`fallback src must be exactly local("Arial")`);
  }

  // The four override VALUES, not merely their presence. Inventory equality
  // proves a descriptor exists; it never proved what it says, and a wrong
  // ascent-override scales Arial's glyphs against figures that describe a
  // different face -- which is worse than shipping no fallback, because the
  // swap frame then reflows MORE rather than less.
  const overrides = overridesOf(fb);
  for (const [name, expected] of Object.entries(opts.overrides ?? DEFAULT_OVERRIDES)) {
    if (overrides[name] !== expected) {
      fail(`fallback ${name} is ${overrides[name] ?? "absent"}%, expected ${expected}%`);
    }
  }

  const tokens = tokenDeclarations(css, "--font-inter");
  if (tokens.length !== 1) fail(`--font-inter declared ${tokens.length} times, expected once`);
  if (tokens[0] !== `${family}, ${fallbackFamily}`) {
    fail(`--font-inter is "${tokens[0] ?? ""}", expected "${family}, ${fallbackFamily}"`);
  }

  // Rows 19-21, over every OTHER shipped stylesheet.
  for (const sheet of opts.shipped ?? []) {
    if (parseFontFaces(sheet.css, { errorRecovery: true }).length > 0) {
      fail(`${sheet.label} declares an @font-face; only the fonts stylesheet may`);
    }
    for (const [token, count] of countFontTokenDefinitions(sheet.css)) {
      if (count > 1) fail(`${sheet.label} defines ${token} ${count} times, expected once`);
    }
    const literal = literalFontFamilies(sheet.css);
    if (literal.length > 0) {
      fail(`${sheet.label} sets a literal font-family (${literal.join(", ")}) outside @font-face`);
    }
  }
}

/** How many times each `--font-*` token is DEFINED in a stylesheet. */
function countFontTokenDefinitions(css: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of css.matchAll(/(--font-[a-z0-9-]+)\s*:/gi)) {
    const name = m[1]!;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/**
 * `font-family` / `font` declarations outside `@font-face` that name a literal
 * family instead of resolving through a `var()` token.
 *
 * Round 32's inversion: a denylist of conditional contexts cannot enumerate CSS
 * — the app's own theme mechanism is an attribute selector, and
 * `[data-theme="dark"] { --font-sans: Arial }` escaped every at-rule-keyed row.
 * Requiring every family to resolve through a token holds under any selector,
 * at-rule, nesting depth or importing stylesheet.
 */
function literalFontFamilies(css: string): string[] {
  const withoutFaces = css.replace(/@font-face\s*\{[^}]*\}/gi, "");
  const hits: string[] = [];
  for (const m of withoutFaces.matchAll(/(?:^|[;{])\s*font-family\s*:\s*([^;}]+)/gi)) {
    const value = m[1]!.trim();
    if (!/var\(/.test(value)) hits.push(value.slice(0, 40));
  }
  return hits;
}
