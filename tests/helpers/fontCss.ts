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
  /** URL as authored, for `kind: "url"`. */
  readonly url?: string;
  /** Family name, for `kind: "local"`. */
  readonly local?: string;
  /** `format()` hint type, e.g. `"woff2"`. */
  readonly format?: string;
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
