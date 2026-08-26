/**
 * tests/styles/interactiveScanCore.ts
 *
 * The ONE in-scope predicate + className resolver shared by the two structural
 * guards this arc ships: the subtle-on-interactive policy guard
 * (`_metaSubtleOnInteractive`) and the repo-wide tap-height floor guard
 * (`_metaTapTargetFloor`). Spec:
 * `docs/superpowers/specs/2026-08-14-ui-interactive-token-policy-design.md`
 * §2.3 (corpus + resolution procedure), §2.4 (in-scope predicate), §5.1 (the
 * height-floor claim), §5.2 (resolver rules 1-8).
 *
 * Why one module and not two: the two guards make claims about the SAME set of
 * elements. Two copies of "what counts as interactive" drift, and the drift is
 * silent — one guard policing a site the other has never heard of. The shared
 * core closes that class by derivation rather than by keeping two lists
 * reconciled (spec §4.4).
 *
 * THE PATH-SET MODEL. `ScanElement.paths` is the complete set of render
 * alternatives: one entry per full branch assignment of the className
 * expression. An unconditional className has exactly one path; a ternary has
 * two; a nested ternary has four. This is deliberately NOT a flat union of
 * every string seen, because a flat union loses branch ANCESTRY:
 * `outer ? (inner ? floor : floor) : ""` would show a floor "in both branches"
 * of the inner conditional while the outer false path carries none. A path IS a
 * full assignment, so ancestry cannot be lost.
 *
 * CONSERVATIVE DIRECTION. Anything the resolver cannot read sets
 * `unresolved`, and an unresolved element never clears (spec §5.2 rule 2): an
 * unread span can carry a defeater. A false UNCLASSIFIED is a census row; a
 * false CLEAR is a silent hole.
 *
 * Recipe-scoped defeaters (spec §5.2 rule 8, families 3 and 4) are enforced
 * structurally rather than as separate defeater tokens: both recipes are
 * ARITHMETIC over `ASSUMED_TEXT_ROW_PX`, so a token that shrinks one — `py-1`
 * after `p-3`, a bleed too small, a horizontal-only bleed — removes the floor it
 * was scoped to rather than needing its own defeater rule.
 *
 * WHAT "PROVES" MEANS HERE, made explicit after a whole-diff review found four
 * shapes that cleared without proving anything (R1 F2/F3): the claim is at-rest
 * height on every viewport, so a `hover:`/`sm:` variant cannot supply it, a
 * `max-h-*` ceiling cannot supply it, an `[&:hover]` variant is the element
 * itself rather than a descendant, and a pseudo bleed only counts on the
 * VERTICAL axis and only when the arithmetic reaches 44.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve as resolvePath } from "node:path";
import ts from "typescript";
import { stripCommentsForFile } from "../_shared/stripComments";

export type ScanElement = {
  file: string; // repo-relative
  line: number; // 1-based
  tag: string;
  paths: string[][]; // the COMPLETE set of render alternatives (see header)
  unresolved: boolean; // any part unreadable, or path cap exceeded
  hasClassName: boolean;
  /**
   * This element IS the allowlisted floor-carrying component, resolved by
   * IMPORT rather than by tag spelling.
   *
   * A name is not an identity: a locally defined `AccentButton` would otherwise
   * inherit the canonical component's guarantee for free (whole-diff R1 F4).
   */
  allowlisted: boolean;
};

export const FLOOR_COMPONENT_ALLOWLIST: ReadonlyArray<{
  tag: string;
  file: string;
  mustContain: string;
}> = [
  { tag: "AccentButton", file: "components/shared/AccentButton.tsx", mustContain: "min-h-tap-min" },
];

/** Corpus roots, by declaration (spec §10: non-`.tsx` renderers are out of scope). */
const CORPUS_DIRS = ["app", "components"] as const;

/** Resolver bounds. Exceeding any of them demotes, never guesses. */
const MAX_RESOLVE_DEPTH = 6;
const MAX_PATHS = 64;
const MAX_IMPORT_HOPS = 3;

/** The tap-target height floor, in px. Named spacing tokens and the 4px
 *  numeric scale are both measured against it. */
const FLOOR_PX = 44;

/** Class-composition helpers whose arguments concatenate into one class string. */
const COMPOSER_NAMES = new Set(["cn", "clsx", "classNames", "cx", "twMerge", "twJoin"]);

const ALLOWLIST_TAGS = new Set(FLOOR_COMPONENT_ALLOWLIST.map((row) => row.tag));

type Resolution = { paths: string[][]; unresolved: boolean };

const EMPTY_RESOLUTION: Resolution = { paths: [[]], unresolved: false };
const UNRESOLVED: Resolution = { paths: [[]], unresolved: true };

/**
 * Collapse a resolution that blew the path cap into ONE path holding every
 * string, marked unresolved.
 *
 * Keeping the strings matters: the subtle-policy scan reads `allStrings`, and
 * dropping paths would hide a live `text-text-subtle` hit. Keeping `unresolved`
 * matters just as much: the tap guard must not clear an element whose branch
 * structure it stopped tracking.
 */
function collapse(res: Resolution): Resolution {
  const seen = new Set<string>();
  for (const path of res.paths) for (const str of path) seen.add(str);
  return { paths: [[...seen]], unresolved: true };
}

function capped(res: Resolution): Resolution {
  return res.paths.length > MAX_PATHS ? collapse(res) : res;
}

/** Concatenation: every alternative of `a` composed with every alternative of `b`. */
function concat(a: Resolution, b: Resolution): Resolution {
  const paths: string[][] = [];
  for (const pa of a.paths) {
    for (const pb of b.paths) {
      paths.push([...pa, ...pb]);
      if (paths.length > MAX_PATHS) {
        return collapse({ paths: [...a.paths, ...b.paths], unresolved: true });
      }
    }
  }
  return capped({ paths, unresolved: a.unresolved || b.unresolved });
}

/** Fork: the alternatives of `a` PLUS the alternatives of `b`. */
function union(a: Resolution, b: Resolution): Resolution {
  return capped({ paths: [...a.paths, ...b.paths], unresolved: a.unresolved || b.unresolved });
}

// ---------------------------------------------------------------------------
// Token grammar (spec §5.1 floor tokens, §5.2 rule 8 defeaters)
// ---------------------------------------------------------------------------

/** Split a class string into raw tokens. Tailwind forbids literal spaces inside `[...]`. */
function tokenize(str: string): string[] {
  return str.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Strip variant prefixes and `!` importance, leaving the utility itself.
 *
 * Prefix splitting happens at bracket depth 0 only: `supports-[display:grid]:flex`
 * and `[min-height:0]` both contain a `:` that is not a variant separator.
 */
function baseToken(raw: string): string {
  let depth = 0;
  let lastSep = -1;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[" || ch === "(") depth += 1;
    else if (ch === "]" || ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) lastSep = i;
  }
  return raw
    .slice(lastSep + 1)
    .replace(/^!+/, "")
    .replace(/!+$/, "");
}

/**
 * What an element's own box a token can speak for.
 *
 * `[&_svg]:size-4` sizes a DESCENDANT and `before:h-4` sizes a PSEUDO-ELEMENT;
 * neither can prove or destroy the element's own height, so both are excluded
 * from the element-level grammar. Pseudo tokens are read again, on their own
 * terms, by the expansion recipes in `pathHasFloor` — that is the one place a
 * `before:` token legitimately speaks about the hit area.
 */
type TokenScope = "element" | "pseudo" | "descendant";

function variantPrefixes(raw: string): string[] {
  const prefixes: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "[" || ch === "(") depth += 1;
    else if (ch === "]" || ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) {
      prefixes.push(raw.slice(start, i));
      start = i + 1;
    }
  }
  return prefixes;
}

/**
 * `[&…]` selects a DESCENDANT only when what follows `&` starts a new compound —
 * a combinator (`_`, `>`, `+`, `~`). `[&:hover]`, `[&:not(:disabled)]` and
 * `[&.is-open]` are the element ITSELF in another state, so their heights are
 * its heights, and reading them as somebody else's box is a false clear
 * (whole-diff R1 F2).
 */
function arbitraryVariantIsDescendant(prefix: string): boolean {
  return /^\[&[_>+~]/.test(prefix);
}

function tokenScope(raw: string): TokenScope {
  const prefixes = variantPrefixes(raw);
  if (prefixes.some(arbitraryVariantIsDescendant)) return "descendant";
  if (prefixes.some((p) => p === "before" || p === "after")) return "pseudo";
  return "element";
}

/**
 * The `@theme` block(s) of a stylesheet, comments removed.
 *
 * Tailwind only emits a `--spacing-*` utility for a token DECLARED IN `@theme`,
 * so a declaration in prose, in a commented-out block, or under an ordinary
 * selector is a name the browser never sees. Reading the whole file let such a
 * name make a non-existent `min-h-*` utility clear (whole-diff R1 F6).
 *
 * EXPORTED for its own tests. Its only caller reads the real `app/globals.css`
 * from `process.cwd()`, so every case that matters — a nested block, an
 * unterminated one, a `@theme` inside a comment — is unreachable through the
 * public predicates, and eight of its mutants survived on exactly that.
 */
export function themeBlocks(css: string): string {
  // The shared stripper, not a local regex: comment handling has ONE
  // implementation in this repo by structural rule
  // (`tests/cross-cutting/_metaStripCommentsSingleSource.test.ts`), and it
  // blanks comments in place so every offset below still lines up.
  const withoutComments = stripCommentsForFile(css, "globals.css");
  let out = "";
  let index = withoutComments.indexOf("@theme");
  while (index !== -1) {
    const open = withoutComments.indexOf("{", index);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (; end < withoutComments.length; end += 1) {
      const ch = withoutComments[end];
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out += withoutComments.slice(open, end);
    index = withoutComments.indexOf("@theme", end);
  }
  return out;
}

/**
 * Named spacing tokens, read from the app's own `@theme` block.
 *
 * `min-h-tap-min` is not a special case — it is one row of this map. Reading
 * the map means a spacing token added tomorrow is measured, not ignored,
 * without anyone remembering to extend a list here.
 */
const spacingTokens = (() => {
  let cache: Map<string, number> | null = null;
  return (): Map<string, number> => {
    if (cache) return cache;
    const map = new Map<string, number>();
    const cssPath = join(process.cwd(), "app", "globals.css");
    if (existsSync(cssPath)) {
      for (const m of themeBlocks(readFileSync(cssPath, "utf8")).matchAll(
        /--spacing-([a-z0-9-]+):\s*([^;]+);/g,
      )) {
        const px = lengthPx(m[2]!.trim());
        if (px !== null) map.set(m[1]!, px);
      }
    }
    // The floor token itself, so a fixture root with no stylesheet still
    // measures the one value every recipe is written against.
    if (!map.has("tap-min")) map.set("tap-min", FLOOR_PX);
    cache = map;
    return cache;
  };
})();

/** px value of an arbitrary Tailwind length, or null when it is not a plain length. */
function lengthPx(value: string): number | null {
  const px = value.match(/^(\d+(?:\.\d+)?)px$/);
  if (px?.[1]) return Number(px[1]);
  const rem = value.match(/^(\d+(?:\.\d+)?)rem$/);
  if (rem?.[1]) return Number(rem[1]) * 16;
  if (/^0+$/.test(value)) return 0;
  return null;
}

/** Height keywords that compute under the floor (spec §5.2 rule 8). */
const SUB_FLOOR_KEYWORDS = new Set(["0", "auto", "none", "fit", "min", "max", "px"]);

/** The height a height-affecting utility computes to, or null when unreadable. */
function utilityPx(base: string): number | null {
  const utility = base.match(/^(?:min-h|max-h|h|size)-(.+)$/);
  if (!utility?.[1]) return null;
  const value = utility[1];
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value) * 4; // the 4px scale
  const arbitrary = value.match(/^\[(.+)\]$/);
  if (arbitrary?.[1]) return lengthPx(arbitrary[1]);
  const named = spacingTokens().get(value);
  return named ?? null;
}

/** Does this single token PROVE a >= 44px height for the element's OWN box? */
function tokenIsFloor(raw: string, allowPseudo = false): boolean {
  const scope = tokenScope(raw);
  if (scope === "descendant") return false;
  if (scope === "pseudo" && !allowPseudo) return false;
  // A state or breakpoint variant proves a height in that state, which is not
  // the claim (whole-diff R1 F2). Pseudo recipes are read on their own terms
  // below, so `before:` is allowed to keep its one prefix there.
  if (variantPrefixes(raw).length > (allowPseudo && scope === "pseudo" ? 1 : 0)) return false;
  const t = baseToken(raw);
  // `sr-only`: the visible target is the parent label, per the 2026-08-07 baseline.
  if (t === "sr-only") return true;
  // `max-h-*` is a CEILING. It can defeat a floor and can never establish one,
  // so it is excluded here and left to `tokenIsDefeater` (whole-diff R1 F2).
  if (/^max-h-/.test(t)) return false;
  const px = utilityPx(t);
  return px !== null && px >= FLOOR_PX;
}

/** Does this single token push the element's OWN height back under the floor? */
function tokenIsDefeater(raw: string): boolean {
  if (tokenScope(raw) !== "element") return false;
  const t = baseToken(raw);
  const utility = t.match(/^(?:min-h|max-h|h|size)-(.+)$/);
  if (utility?.[1]) {
    if (SUB_FLOOR_KEYWORDS.has(utility[1])) return true;
    const px = utilityPx(t);
    return px !== null && px < FLOOR_PX;
  }
  const property = t.match(/^\[(min-height|max-height|height):(.+)\]$/);
  if (property?.[2]) {
    const px = lengthPx(property[2]);
    return px !== null && px < FLOOR_PX;
  }
  return false;
}

/**
 * The row height the expansion recipes are measured against when the element
 * declares no height of its own.
 *
 * Spec §5.3 ratified the `p-3` threshold on exactly this assumption — 12px of
 * padding each side around a single-line text row clears 44px. It is stated as
 * a NAMED constant here because both recipes rest on it, and because a review
 * round showed the two had drifted into different, unstated versions of it
 * (whole-diff R1 F3: a 4px bleed cleared while the same arithmetic in the
 * padding recipe would not have).
 *
 * It is the recipes' ONLY base, and that is a consequence rather than a
 * simplification. Rule 8 runs first, so an element that declares a height under
 * 44px is already demoted as a defeater and one that declares 44px or more has
 * already cleared as a floor token — a recipe is only ever consulted for an
 * element whose height is its CONTENT's. A `declaredHeightPx` helper that read
 * the declared height here was therefore unreachable through the exported
 * predicates, which is how the mutation gate found it: six of its mutants
 * survived because nothing they changed could reach a verdict.
 */
const ASSUMED_TEXT_ROW_PX = 20;

/**
 * Vertical padding on EVERY side, last-wins per axis.
 *
 * `p-3 py-1` is 4px, not 12px: the later utility wins in the cascade. Reading
 * this existentially cleared `-my-1 p-3 py-1` (whole-diff R1 F3).
 */
function verticalPaddingPx(tokens: readonly string[]): number {
  let top: number | null = null;
  let bottom: number | null = null;
  for (const raw of tokens) {
    if (tokenScope(raw) !== "element" || variantPrefixes(raw).length > 0) continue;
    const m = baseToken(raw).match(/^p([ytb]?)-(\d+(?:\.\d+)?)$/);
    if (!m?.[2]) continue;
    const px = Number(m[2]) * 4;
    if (m[1] === "" || m[1] === "y") {
      top = px;
      bottom = px;
    } else if (m[1] === "t") top = px;
    else bottom = px;
  }
  return Math.min(top ?? 0, bottom ?? 0) * 2;
}

/**
 * Vertical bleed, per side, from an absolutely-positioned pseudo's NEGATIVE
 * inset — last-wins, and horizontal-only forms contribute nothing.
 *
 * `before:-inset-x-2` bleeds sideways and proves no height at all; two live
 * sites wore exactly that and cleared on it (whole-diff R1 F3).
 */
function pseudoVerticalBleedPx(tokens: readonly string[]): number {
  let bleed = 0;
  for (const raw of tokens) {
    const m = raw.match(/^before:-inset(-[xy])?-(\d+(?:\.\d+)?)$/);
    if (!m?.[2]) continue;
    if (m[1] === "-x") continue;
    bleed = Number(m[2]) * 4;
  }
  return bleed;
}

/**
 * Does ONE render alternative carry a height floor?
 *
 * The two recipe families are path-scoped, not token-scoped: they need two
 * cooperating tokens, and they only floor in the form whose ARITHMETIC reaches
 * the floor. Both are measured against the element's declared height when it
 * has one and against `ASSUMED_TEXT_ROW_PX` when it does not.
 */
function pathHasFloor(path: readonly string[]): boolean {
  const tokens = path.flatMap(tokenize);
  if (tokens.some((t) => tokenIsFloor(t))) return true;

  const base = ASSUMED_TEXT_ROW_PX;

  // The pseudo-element expansion recipe. It needs `before:absolute` — an
  // absolutely-positioned pseudo inside the control IS part of its hit area —
  // plus either a pseudo that already clears the floor by its own height, or a
  // negative VERTICAL inset whose arithmetic reaches it. A non-negative
  // `before:inset-*` does not expand and grants no floor, which is rule 8's
  // inset-narrowing family enforced structurally rather than as a defeater.
  if (tokens.some((t) => t === "before:absolute")) {
    if (tokens.some((t) => t.startsWith("before:") && tokenIsFloor(t, true))) return true;
    if (base + 2 * pseudoVerticalBleedPx(tokens) >= FLOOR_PX) return true;
  }

  // Negative-margin + padding recipe (spec §5.3). `p-3` around a single-line
  // row is the ratified boundary and falls out of the same arithmetic; below it
  // the site lands in the census under `padding-arithmetic`.
  const negativeMargin = tokens.some((t) => /^-m(?:[ytb])?-\d+$/.test(baseToken(t)));
  return negativeMargin && base + verticalPaddingPx(tokens) >= FLOOR_PX;
}

// ---------------------------------------------------------------------------
// Public predicates
// ---------------------------------------------------------------------------

/** Every class string the element can render, across every alternative. */
export function allStrings(el: ScanElement): string[] {
  const seen = new Set<string>();
  for (const path of el.paths) for (const str of path) seen.add(str);
  return [...seen];
}

/** Spec §5.2 rule 8, existential: a defeater on ANY alternative demotes. */
export function defeaterPresent(el: ScanElement): boolean {
  return allStrings(el).flatMap(tokenize).some(tokenIsDefeater);
}

/**
 * Spec §5.2 rules 1-4 and 7, universal: the floor must hold on EVERY
 * alternative — or the tag is a registered floor-carrying component.
 */
export function heightFloorSatisfied(el: ScanElement): boolean {
  if (el.unresolved) return false;
  if (defeaterPresent(el)) return false;
  // `allowlisted`, not the tag's spelling: the scanner resolves the import.
  if (el.allowlisted) return true;
  return el.paths.length > 0 && el.paths.every((path) => pathHasFloor(path));
}

// ---------------------------------------------------------------------------
// Corpus walk + resolver
// ---------------------------------------------------------------------------

function walkTsx(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return entry === "node_modules" ? [] : walkTsx(path);
    }
    return entry.endsWith(".tsx") ? [path] : [];
  });
}

const sourceCache = new Map<string, ts.SourceFile>();

function parse(file: string): ts.SourceFile | null {
  const cached = sourceCache.get(file);
  if (cached) return cached;
  if (!existsSync(file)) return null;
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TSX,
  );
  sourceCache.set(file, sf);
  return sf;
}

type Ctx = { root: string; file: string; sf: ts.SourceFile; depth: number; hops: number };

function resolveModulePath(spec: string, ctx: Ctx): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ctx.root, spec.slice(2));
  else if (spec.startsWith(".")) base = resolvePath(dirname(ctx.file), spec);
  else return null;
  for (const candidate of [
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * Only a `const` binding can be read from its initializer.
 *
 * `let cls = "min-h-tap-min"; if (f) cls = "min-h-0";` renders the second value
 * on a real path, and reading the initializer alone cleared it (whole-diff R1
 * F4). Tracking assignments is a dataflow problem; declining to read `let` at
 * all is a demotion, which is the safe direction and lands the site in the
 * census with a reason.
 */
function isConstDeclaration(declaration: ts.VariableDeclaration): boolean {
  const list = declaration.parent;
  return ts.isVariableDeclarationList(list) && (list.flags & ts.NodeFlags.Const) !== 0;
}

/** Statement containers that introduce a lexical scope for `const` lookup. */
function statementsOf(node: ts.Node): readonly ts.Statement[] | null {
  if (ts.isSourceFile(node) || ts.isBlock(node) || ts.isModuleBlock(node)) return node.statements;
  if (ts.isCaseClause(node) || ts.isDefaultClause(node)) return node.statements;
  return null;
}

type LocalBinding =
  | { kind: "variable"; declaration: ts.VariableDeclaration }
  | { kind: "function"; declaration: ts.FunctionDeclaration }
  /** Found, and deliberately not read (a reassignable `let`/`var`). */
  | { kind: "unreadable" };

/** Innermost-wins lookup (spec §2.3): the nearest enclosing scope's binding shadows outer ones. */
function findLocalBinding(name: string, from: ts.Node): LocalBinding | null {
  let cursor: ts.Node | undefined = from;
  while (cursor) {
    const statements = statementsOf(cursor);
    if (statements) {
      for (const statement of statements) {
        if (ts.isVariableStatement(statement)) {
          for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
              // A `let`/`var` binding is FOUND but not readable — a distinct
              // answer from "not found", which would fall through to the import
              // lookup and resolve some other module's export of that name.
              return isConstDeclaration(declaration)
                ? { kind: "variable", declaration }
                : { kind: "unreadable" };
            }
          }
        }
        if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) {
          return { kind: "function", declaration: statement };
        }
      }
    }
    cursor = cursor.parent;
  }
  return null;
}

function findImportSpecifier(name: string, sf: ts.SourceFile): string | null {
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      if (element.name.text === name) {
        return ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : null;
      }
    }
  }
  return null;
}

/** Resolve an exported `const` (or a re-export chain) in another module. */
function resolveExported(name: string, file: string, ctx: Ctx): Resolution {
  if (ctx.hops >= MAX_IMPORT_HOPS) return UNRESOLVED;
  const sf = parse(file);
  if (!sf) return UNRESOLVED;
  const next: Ctx = { root: ctx.root, file, sf, depth: ctx.depth + 1, hops: ctx.hops + 1 };

  for (const statement of sf.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name) {
          return declaration.initializer
            ? resolveExpression(declaration.initializer, next)
            : UNRESOLVED;
        }
      }
    }
    // `export { X } from "./y"` and `export * from "./y"` — follow the chain.
    if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      const clause = statement.exportClause;
      const named =
        clause && ts.isNamedExports(clause)
          ? clause.elements.some((e) => e.name.text === name)
          : clause === undefined;
      if (named && ts.isStringLiteral(statement.moduleSpecifier)) {
        const target = resolveModulePath(statement.moduleSpecifier.text, next);
        if (target) {
          const via = resolveExported(name, target, next);
          if (!via.unresolved) return via;
        }
      }
    }
  }
  return UNRESOLVED;
}

/**
 * Can control reach the end of this block without returning or throwing?
 *
 * Approximated by the LAST statement only, which is sound in the direction that
 * matters: anything other than a terminal `return`/`throw` is treated as "yes",
 * so a helper whose returns are all conditional gains an empty alternative
 * rather than clearing on the returns it happens to have (whole-diff R1 F4).
 */
function canCompleteNormally(body: ts.Node): boolean {
  if (!ts.isBlock(body)) return false;
  const last = body.statements[body.statements.length - 1];
  if (!last) return true;
  return !ts.isReturnStatement(last) && !ts.isThrowStatement(last);
}

/**
 * Union over a function's return expressions (spec §5.2 rule 6, the `segClass`
 * shape), INCLUDING the paths that return no class at all.
 *
 * A bare `return;` and a fall-off-the-end both render `undefined`, which React
 * turns into no className — a floorless alternative, and one the first version
 * dropped silently.
 */
function resolveReturns(body: ts.Node, ctx: Ctx): Resolution {
  const returns: ts.Expression[] = [];
  let returnsNothing = false;
  const visit = (node: ts.Node): void => {
    // Do not descend into nested functions: their returns belong to them.
    if (
      node !== body &&
      (ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node))
    ) {
      return;
    }
    if (ts.isReturnStatement(node)) {
      if (node.expression) returns.push(node.expression);
      else returnsNothing = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  if (returns.length === 0) return UNRESOLVED;
  const resolved = returns
    .map((expression) => resolveExpression(expression, { ...ctx, depth: ctx.depth + 1 }))
    .reduce((acc, res, index) => (index === 0 ? res : union(acc, res)));
  return returnsNothing || canCompleteNormally(body) ? union(resolved, EMPTY_RESOLUTION) : resolved;
}

function resolveCallee(callee: ts.Expression, ctx: Ctx): Resolution {
  if (!ts.isIdentifier(callee)) return UNRESOLVED;
  const binding = findLocalBinding(callee.text, callee);
  if (!binding) return UNRESOLVED; // an imported function call: spec §5.2 rule 6, UNCLASSIFIED
  if (binding.kind === "function") {
    return binding.declaration.body ? resolveReturns(binding.declaration.body, ctx) : UNRESOLVED;
  }
  if (binding.kind === "unreadable") return UNRESOLVED;
  const initializer = binding.declaration.initializer;
  if (!initializer) return UNRESOLVED;
  if (ts.isArrowFunction(initializer)) {
    return ts.isBlock(initializer.body)
      ? resolveReturns(initializer.body, ctx)
      : resolveExpression(initializer.body, { ...ctx, depth: ctx.depth + 1 });
  }
  if (ts.isFunctionExpression(initializer)) return resolveReturns(initializer.body, ctx);
  return UNRESOLVED;
}

function resolveExpression(node: ts.Expression, ctx: Ctx): Resolution {
  if (ctx.depth > MAX_RESOLVE_DEPTH) return UNRESOLVED;
  const deeper: Ctx = { ...ctx, depth: ctx.depth + 1 };

  // Rule 1 — literals.
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return { paths: [[node.text]], unresolved: false };
  }

  if (ts.isParenthesizedExpression(node)) return resolveExpression(node.expression, deeper);
  if (ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return resolveExpression(node.expression, deeper);
  }

  // Rule 2 — template with expressions.
  if (ts.isTemplateExpression(node)) {
    let result: Resolution = { paths: [[node.head.text]], unresolved: false };
    for (const span of node.templateSpans) {
      result = concat(result, resolveExpression(span.expression, deeper));
      result = concat(result, { paths: [[span.literal.text]], unresolved: false });
    }
    return result;
  }

  // Rule 3 — conditional: each arm is its own alternative.
  if (ts.isConditionalExpression(node)) {
    return union(
      resolveExpression(node.whenTrue, deeper),
      resolveExpression(node.whenFalse, deeper),
    );
  }

  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    // Rule 4 — `&&`: the right operand is conditional, so the missing arm is an
    // alternative that contributes nothing.
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return union(resolveExpression(node.right, deeper), EMPTY_RESOLUTION);
    }
    // Rule 4 — `||` / `??`: BOTH fallback arms are alternatives.
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      return union(resolveExpression(node.left, deeper), resolveExpression(node.right, deeper));
    }
    if (kind === ts.SyntaxKind.PlusToken) {
      return concat(resolveExpression(node.left, deeper), resolveExpression(node.right, deeper));
    }
    return UNRESOLVED;
  }

  // Rule 5 — `cn()` / `clsx()` / `[...].join()`, and rule 6's helper calls.
  if (ts.isCallExpression(node)) {
    const callee = node.expression;
    if (ts.isIdentifier(callee) && COMPOSER_NAMES.has(callee.text)) {
      return node.arguments.reduce<Resolution>(
        (acc, argument) => concat(acc, resolveExpression(argument, deeper)),
        EMPTY_RESOLUTION,
      );
    }
    if (
      ts.isPropertyAccessExpression(callee) &&
      callee.name.text === "join" &&
      ts.isArrayLiteralExpression(callee.expression)
    ) {
      return callee.expression.elements.reduce<Resolution>(
        (acc, element) => concat(acc, resolveExpression(element, deeper)),
        EMPTY_RESOLUTION,
      );
    }
    return resolveCallee(callee, deeper);
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.reduce<Resolution>(
      (acc, element) => concat(acc, resolveExpression(element, deeper)),
      EMPTY_RESOLUTION,
    );
  }

  // Rule 6 — identifiers: innermost same-file `const`, else a one-hop import.
  if (ts.isIdentifier(node)) {
    const binding = findLocalBinding(node.text, node);
    if (binding?.kind === "variable") {
      return binding.declaration.initializer
        ? resolveExpression(binding.declaration.initializer, deeper)
        : UNRESOLVED;
    }
    if (binding?.kind === "function" || binding?.kind === "unreadable") return UNRESOLVED;
    const specifier = findImportSpecifier(node.text, ctx.sf);
    if (!specifier) return UNRESOLVED;
    const target = resolveModulePath(specifier, ctx);
    return target ? resolveExported(node.text, target, ctx) : UNRESOLVED;
  }

  return UNRESOLVED;
}

// ---------------------------------------------------------------------------
// In-scope predicate (spec §2.4, operative form)
// ---------------------------------------------------------------------------

const INTRINSIC_TAGS = new Set(["button", "a", "summary"]);

function attributeNamed(attributes: ts.JsxAttributes, name: string): ts.JsxAttribute | null {
  for (const attribute of attributes.properties) {
    if (ts.isJsxAttribute(attribute) && attribute.name.getText() === name) return attribute;
  }
  return null;
}

function staticAttributeValue(attribute: ts.JsxAttribute | null): string | null {
  const initializer = attribute?.initializer;
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) return initializer.text;
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    const inner = initializer.expression;
    if (ts.isStringLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
  }
  return null;
}

/**
 * Can this spread expression put a `className` on the element?
 *
 * Provably NOT, when every reachable value is an object literal whose keys are
 * static and none of them is `className` — the shape
 * `{...(external ? { target, rel } : {})}` that the corpus uses a dozen times.
 * Anything else (an identifier, a computed key, a call) is unreadable and
 * demotes, because a spread can both add and OVERRIDE className.
 */
function spreadCannotCarryClassName(node: ts.Expression): boolean {
  if (ts.isParenthesizedExpression(node)) return spreadCannotCarryClassName(node.expression);
  if (ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return spreadCannotCarryClassName(node.expression);
  }
  if (ts.isConditionalExpression(node)) {
    return spreadCannotCarryClassName(node.whenTrue) && spreadCannotCarryClassName(node.whenFalse);
  }
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    if (kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return spreadCannotCarryClassName(node.right);
    }
    if (kind === ts.SyntaxKind.BarBarToken || kind === ts.SyntaxKind.QuestionQuestionToken) {
      return spreadCannotCarryClassName(node.left) && spreadCannotCarryClassName(node.right);
    }
    return false;
  }
  if (!ts.isObjectLiteralExpression(node)) return false;
  return node.properties.every((property) => {
    if (ts.isSpreadAssignment(property)) return spreadCannotCarryClassName(property.expression);
    if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) {
      const name = property.name;
      if (ts.isComputedPropertyName(name)) return false;
      const text = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null;
      return text !== null && text !== "className";
    }
    return false;
  });
}

/**
 * Is this tag the ALLOWLISTED component, or just a name that matches one?
 *
 * The tag has to be imported into this file from the registered path. A
 * component defined locally under the same name would otherwise inherit a floor
 * guarantee nobody checked, purely by spelling (whole-diff R1 F4).
 */
function resolvesToAllowlistedComponent(tag: string, ctx: Ctx): boolean {
  const row = FLOOR_COMPONENT_ALLOWLIST.find((entry) => entry.tag === tag);
  if (!row) return false;
  const specifier = findImportSpecifier(tag, ctx.sf);
  if (!specifier) return false;
  const target = resolveModulePath(specifier, ctx);
  return target !== null && relative(ctx.root, target) === row.file;
}

/**
 * The declared widening axes, defaulted OFF (spec §4, D1).
 *
 * ONE definition of what counts as interactive, with declared axes a consumer
 * opts into in its own source, rather than two definitions that can drift. The
 * module header argues against the second shape; this is not it. Each consumer
 * of `scanInteractiveElements` states which setting it reads, and spec §7
 * accounts for all six.
 */
export type ScanOptions = {
  /** Admit text-entry element kinds: `<textarea>`, `<select>`, and `<input>` at ANY type. */
  readonly textEntry?: boolean;
};

const TEXT_ENTRY_TAGS = new Set(["textarea", "select"]);

function isInScope(tag: string, attributes: ts.JsxAttributes, options: ScanOptions = {}): boolean {
  if (INTRINSIC_TAGS.has(tag) || tag === "Link") return true;
  if (ALLOWLIST_TAGS.has(tag)) return true;
  if (tag === "input") {
    const type = staticAttributeValue(attributeNamed(attributes, "type"));
    if (type === "checkbox" || type === "radio") return true;
    // Any other type, INCLUDING one the resolver cannot read: the flag admits
    // the kind, and reading the type is not part of that question (spec §5.3).
    if (options.textEntry === true) return true;
  }
  if (options.textEntry === true && TEXT_ENTRY_TAGS.has(tag)) return true;
  if (staticAttributeValue(attributeNamed(attributes, "role")) === "button") return true;
  return attributeNamed(attributes, "onClick") !== null;
}

/**
 * Walk the corpus and return every in-scope interactive element with its
 * resolved className alternatives.
 *
 * `rootDir` is the repo root in production and a temp fixture root in the
 * resolver's own end-to-end tests, so the walk, the `@/` alias base and the
 * reported paths all derive from ONE argument.
 */
export function scanInteractiveElements(rootDir: string, options: ScanOptions = {}): ScanElement[] {
  const elements: ScanElement[] = [];
  const files = CORPUS_DIRS.flatMap((dir) => walkTsx(join(rootDir, dir)));

  for (const file of files) {
    const sf = parse(file);
    if (!sf) continue;
    const ctx: Ctx = { root: rootDir, file, sf, depth: 0, hops: 0 };

    const visit = (node: ts.Node): void => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(sf);
        if (isInScope(tag, node.attributes, options)) {
          const className = attributeNamed(node.attributes, "className");
          // A spread can carry OR override className, so an unreadable one
          // demotes exactly like an unresolved span (rule 2). One whose every
          // reachable value is a static object literal without a `className`
          // key is read rather than feared.
          const hasSpread = node.attributes.properties.some(
            (p) => ts.isJsxSpreadAttribute(p) && !spreadCannotCarryClassName(p.expression),
          );
          let resolution: Resolution = EMPTY_RESOLUTION;
          if (className?.initializer) {
            const initializer = className.initializer;
            if (ts.isStringLiteral(initializer)) {
              resolution = { paths: [[initializer.text]], unresolved: false };
            } else if (ts.isJsxExpression(initializer) && initializer.expression) {
              resolution = resolveExpression(initializer.expression, ctx);
            } else {
              resolution = UNRESOLVED;
            }
          }
          elements.push({
            file: relative(rootDir, file),
            line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
            tag,
            paths: resolution.paths,
            unresolved: resolution.unresolved || hasSpread,
            hasClassName: className !== null,
            allowlisted: resolvesToAllowlistedComponent(tag, ctx),
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }

  return elements;
}
