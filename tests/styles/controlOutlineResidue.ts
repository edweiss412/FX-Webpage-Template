/**
 * The control-outline RESIDUE CENSUS — every interactive element whose own Tailwind
 * utilities paint a weak outline, keyed by CONTENT, each registered with a reason whose
 * FORM a test can check.
 *
 * Spec: docs/superpowers/specs/2026-08-21-control-outline-forward-guard-design.md
 *   §1.4 the mechanism · §1.5 the bars · §3.2 the oracle · §3.3 the key · §6 the limits.
 *
 * DO NOT grow a predicate here. Five mechanisms tried to recover STRUCTURE from the
 * scanner's projection and each was escaped structurally (`BACKLOG.md`, heading
 * `## BL-CONTROL-OUTLINE-FORWARD-GUARD`, the five-escape table). This module decides
 * nothing about structure. It asks Tailwind's own compiler what an element's tokens paint,
 * and then asks one question: did the set of weak-outline carriers change.
 *
 * It models NO SPELLING. Spec rounds 2, 3 and 4 each found a Tailwind spelling that a
 * hand-written token grammar failed to classify; the repair that ENDED that axis was to
 * delete the grammar and call the engine that paints production (§3.2). No token string is
 * read below except to split it at whitespace and to read its variant chain.
 *
 * What the bars do NOT decide (§6, "A false switch-track row"): whether a residue element
 * is really a switch track. Trackness is a RULING (`DESIGN.md` §1.2a), not a property the
 * scanner could project. A row that cites the ruling falsely passes its form bar, and costs
 * its author a false citation, a bump of a pinned literal, and a diff a reviewer reads.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { __unstable__loadDesignSystem } from "tailwindcss";
import { allStrings, scanInteractiveElements, type ScanElement } from "./interactiveScanCore";

/* ------------------------------------------------------------------- tokens */

/**
 * The utility: variants and one important marker removed.
 *
 * Replicates the `normalizeToken` contract of `./_childlessGrowableScan` rather than
 * importing it, so this module stays free of that module's scan. The suite pins the two
 * against each other on every live residue token BY EQUALITY (AC-13), which is what keeps
 * the replication honest.
 */
export function utilityOf(token: string): string {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) cut = i;
  }
  let u = cut === -1 ? token : token.slice(cut + 1);
  if (u.startsWith("!")) u = u.slice(1);
  else if (u.endsWith("!")) u = u.slice(0, -1);
  return u;
}

/** The variant chain: everything before the last depth-0 colon, a leading `!` dropped first. */
export function variantsOf(token: string): string[] {
  const raw = token.startsWith("!") ? token.slice(1) : token;
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === "[" || c === "(") depth++;
    else if (c === "]" || c === ")") depth--;
    else if (c === ":" && depth === 0) cut = i;
  }
  if (cut === -1) return [];
  // Split the chain at DEPTH-0 colons only, the same rule that found the cut. A plain `.split(":")`
  // here reads the depth walk's own answer and then discards it: `[&:hover]:border-border` came back
  // as ["[&", "hover]"] rather than ["[&:hover]"]. Grouping survived that, because `weakSides`
  // rejoins the segments with a colon, but the category bars compare SEGMENTS — `some(v => v ===
  // "focus")`, `/^(max-)?(sm|md|lg|xl|2xl)$/` — so a bracketed variant reached them as fragments and
  // was refused. Conservative, never a false clear, and still the "one predicate read two ways"
  // shape that spec §6 forbids and that the accept-set fix removed elsewhere.
  const chain = raw.slice(0, cut);
  const segments: string[] = [];
  let chainDepth = 0;
  let start = 0;
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    if (c === "[" || c === "(") chainDepth++;
    else if (c === "]" || c === ")") chainDepth--;
    else if (c === ":" && chainDepth === 0) {
      segments.push(chain.slice(start, i));
      start = i + 1;
    }
  }
  segments.push(chain.slice(start));
  return segments;
}

/* ------------------------------------------------------------------- oracle */

export type Side = "top" | "right" | "bottom" | "left";
const ALL_SIDES: readonly Side[] = ["top", "right", "bottom", "left"];

/** Every border-colour property Tailwind emits, mapped to the physical sides it sets. */
const PROP_SIDES: Readonly<Record<string, readonly Side[]>> = {
  "border-color": ALL_SIDES,
  "border-top-color": ["top"],
  "border-right-color": ["right"],
  "border-bottom-color": ["bottom"],
  "border-left-color": ["left"],
  "border-inline-color": ["left", "right"],
  "border-block-color": ["top", "bottom"],
  // §6: logical sides are read as left-to-right physical sides. A weak winner on ANY side is
  // residue, so a right-to-left document loses nothing by the mapping.
  "border-inline-start-color": ["left"],
  "border-inline-end-color": ["right"],
  "border-block-start-color": ["top"],
  "border-block-end-color": ["bottom"],
};

/**
 * The two colours the rulings named. A THIRD theme colour appearing as a resting outline is
 * a new ruling, not a spelling (§6): it joins this list as a deliberate edit carrying its own
 * seeded rows, and the census equality reds until it does.
 */
export const WEAK_COLOURS = ["border", "border-strong"] as const;
const WEAK_VAR = new RegExp(`var\\(--color-(?:${WEAK_COLOURS.join("|")})\\)`);
const ANY_COLOUR_VAR = /var\(--color-[a-z0-9-]+\)/;

export type Oracle = { readonly ds: Awaited<ReturnType<typeof __unstable__loadDesignSystem>> };

/**
 * Tailwind's design system, loaded from the PRODUCTION stylesheet.
 *
 * The theme is production's theme, never a fixture: AC-16 plants its defect by removing one
 * declaration from a COPY of this file, so the oracle under test differs from the real one by
 * exactly that line (W20).
 */
export async function loadOracle(cssPath: string): Promise<Oracle> {
  const require = createRequire(import.meta.url);
  const ds = await __unstable__loadDesignSystem(readFileSync(cssPath, "utf8"), {
    base: dirname(cssPath),
    loadStylesheet: async (id: string, base: string) => {
      const path =
        id.startsWith(".") || id.startsWith("/")
          ? resolve(base, id)
          : require.resolve(id.includes("/") ? id : `${id}/index.css`);
      return { base: dirname(path), content: readFileSync(path, "utf8"), path };
    },
  });
  return { ds };
}

export type ValueClass = "weak" | "strong" | "none" | "unclassified";

/**
 * Four classes, NO notation modelled.
 *
 * Spec round 5 is why there is no literal list: the oracle once carried four hex strings, and
 * because Tailwind keeps an arbitrary value verbatim, `border-[rgb(207_205_199)]` painted the
 * weak colour and cleared. Comparing colours is a recognizer over CSS colour notation and
 * reopens the axis at the next notation; declining to classify a literal closes it, and a
 * literal outline is residue FAIL-CLOSED (W22).
 */
export function classifyValue(value: string): ValueClass {
  const v = value.replace(/!important/g, "").trim();
  if (WEAK_VAR.test(v)) return "weak";
  if (ANY_COLOUR_VAR.test(v)) return "strong";
  if (v === "transparent") return "none";
  return "unclassified";
}

/**
 * The theme colour a declaration references, read off the COMPILED VALUE.
 *
 * Never derived from the token string: `border-t-border-strong` and
 * `![border-color:var(--color-border-strong)]` name the same colour and share no prefix, which is
 * the r7 finding in miniature. `null` for a literal, a keyword, or a non-colour `var()`.
 */
function colourVarOf(value: string): string | null {
  const m = /var\(--color-([a-z0-9-]+)\)/.exec(value);
  return m ? (m[1] ?? null) : null;
}

/** Weak OR unclassified: a literal costs the author a ledger-backed row, or the token repair. */
export function isWeakValue(value: string): boolean {
  const c = classifyValue(value);
  return c === "weak" || c === "unclassified";
}

/**
 * The ONE selector rule every consumer reads (spec round 8, W26).
 *
 * A token's compiled CSS is its class rule plus nested rules. A nested rule paints THE ELEMENT
 * when `&` is the selector's subject (`&:hover`, `:where(*:hover) &` for `in-hover:`,
 * `&:is(:where(.group):hover *)` for `group-hover:`, `&:has(…)`), and paints a CHILD or a
 * DESCENDANT when a combinator follows `&` (`:is(& > *)` for `*:`, `:is(& *)` for `**:`,
 * `&>span`, `:where(& > :not(:last-child))` for `divide-*`). Only element-painting declarations
 * come back.
 *
 * Round 8 found the fork this closes: a textual `where(` exclusion dropped
 * `in-hover:border-border-strong` from the KEY while the oracle still scanned it. A second
 * definition would fork again, so there is one — and `classify` is its only caller, so every
 * consumer downstream reads one answer rather than re-deriving it. The closeout gate counts
 * both on the parsed source.
 */
export function ownDeclarations(css: string): string {
  const out: string[] = [];
  const body = css.replace(/^[^{]*\{/, "").replace(/\}\s*$/, "");
  const paintsAChild: boolean[] = [];
  let buf = "";
  for (const ch of body) {
    if (ch === "{") {
      const selector = buf.trim();
      buf = "";
      paintsAChild.push(/&\s*(?:[>+~]|\s+(?=[^\s{]))/.test(selector) && !/&\s*$/.test(selector));
      continue;
    }
    if (ch === "}") {
      if (!paintsAChild.pop()) out.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  out.push(buf); // the class rule's own declarations
  return out.join(";");
}

/** Every paint property: the border family minus the radii (shape, not paint), and background. */
const PAINT_PROP = /(?:^|[;{\s])((?:border(?!-[a-z-]*radius)[a-z-]*|background[a-z-]*))\s*:/g;
const BORDER_COLOUR_DECL =
  /(border(?:-(?:top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end))?-color)\s*:\s*([^;}]+)/g;
const BACKGROUND_COLOUR_DECL = /background-color\s*:\s*([^;}]+)/g;

export type TokenPaint = {
  /** Position in the generated stylesheet: Tailwind's own cascade order. */
  readonly order: bigint;
  readonly important: boolean;
  /** Per side this token sets: true when its declaration for that side is weak. */
  readonly sides: ReadonlyMap<Side, boolean>;
  /** The paint properties its OWN rule declares. Non-empty means "in the key" (§3.3). */
  readonly props: readonly string[];
  /** The `--color-*` name its own `background-color` declaration references (a `switch-track` fill). */
  readonly fillColourVar: string | null;
  /** The `--color-*` name its own border-colour declaration references (a `switch-track` outline). */
  readonly outlineColourVar: string | null;
  /** Its own border-colour values the oracle declines to classify (the `literal-outline` input). */
  readonly unclassified: readonly string[];
};

/**
 * Per token: what it paints, how weak, and where it sits in the cascade.
 *
 * `null` when Tailwind compiles the token to nothing. A token that compiles to nothing paints
 * nothing in production either, so the oracle's silence about it is the TRUTH about that token
 * and not a gap (§3.2, §6): `group`, `peer` and a typo are all non-reports.
 *
 * This is the ONLY reader of compiled CSS in the module. Weakness, key membership, the
 * `switch-track` fill count and the `literal-outline` values all come off ONE
 * `ownDeclarations` pass, so no two of them can disagree about which rules target the
 * element — which is exactly the fork spec rounds 7 and 8 each found (W25, W26).
 */
export function classify(oracle: Oracle, tokens: string[]): Map<string, TokenPaint | null> {
  const uniq = [...new Set(tokens)];
  const css = oracle.ds.candidatesToCss(uniq);
  const order = new Map(oracle.ds.getClassOrder(uniq));
  const out = new Map<string, TokenPaint | null>();
  uniq.forEach((token, i) => {
    const compiled = css[i];
    if (compiled == null) {
      out.set(token, null);
      return;
    }
    const own = ownDeclarations(compiled);
    const sides = new Map<Side, boolean>();
    const unclassified: string[] = [];
    let important = false;
    let outlineColourVar: string | null = null;
    for (const m of own.matchAll(BORDER_COLOUR_DECL)) {
      const prop = m[1];
      const value = m[2];
      if (prop === undefined || value === undefined) continue;
      if (/!important/.test(value)) important = true;
      if (classifyValue(value) === "unclassified") unclassified.push(value.trim());
      outlineColourVar = outlineColourVar ?? colourVarOf(value);
      const weak = isWeakValue(value);
      for (const side of PROP_SIDES[prop] ?? [])
        sides.set(side, (sides.get(side) ?? false) || weak);
    }
    let fillColourVar: string | null = null;
    for (const m of own.matchAll(BACKGROUND_COLOUR_DECL))
      if (m[1] !== undefined) fillColourVar = fillColourVar ?? colourVarOf(m[1]);
    const props: string[] = [];
    for (const m of own.matchAll(PAINT_PROP)) {
      const prop = m[1];
      if (prop !== undefined && !props.includes(prop)) props.push(prop);
    }
    out.set(token, {
      order: order.get(token) ?? BigInt(0),
      important,
      sides,
      props,
      fillColourVar,
      outlineColourVar,
      unclassified: [...new Set(unclassified)],
    });
  });
  return out;
}

/** Every whitespace-split token of every readable string of every element. */
export function tokensOf(elements: readonly ScanElement[]): string[] {
  return elements.flatMap((el) => allStrings(el).flatMap((s) => s.split(/\s+/))).filter(Boolean);
}

/**
 * The cascade winners: per render alternative, per variant group, per side.
 *
 * Within a group the winner is the token Tailwind marked `!important`, else the token with the
 * highest stylesheet order. Class-attribute order plays no part, which is the R3 control: a
 * reorder is semantically null and must stay green. Groups do not compete with each other — a
 * `focus:` winner and a rest winner are two states, and either being weak is residue, the
 * conservative direction (§6).
 *
 * Weakness is already decided per side in `paint`, so this reads no oracle and no spelling.
 */
export function weakSides(
  el: ScanElement,
  paint: ReadonlyMap<string, TokenPaint | null>,
): string[] {
  const hits: string[] = [];
  el.paths.forEach((path, alternative) => {
    const groups = new Map<string, Map<Side, { token: string; paint: TokenPaint }>>();
    for (const token of path.flatMap((s) => s.split(/\s+/)).filter(Boolean)) {
      const p = paint.get(token);
      if (!p || p.sides.size === 0) continue;
      const name = variantsOf(token).join(":");
      let group = groups.get(name);
      if (!group) {
        group = new Map();
        groups.set(name, group);
      }
      for (const side of p.sides.keys()) {
        const held = group.get(side);
        const wins =
          !held ||
          (p.important && !held.paint.important) ||
          (p.important === held.paint.important && p.order > held.paint.order);
        if (wins) group.set(side, { token, paint: p });
      }
    }
    for (const [name, sides] of groups)
      for (const [side, winner] of sides)
        if (winner.paint.sides.get(side))
          hits.push(`alt${alternative}:${name || "rest"}:${side}=${winner.token}`);
  });
  return hits;
}

/**
 * Residue when any group on any alternative has a weak winner on any side.
 *
 * `unresolved` does NOT exempt: an unread span can only ADD paint, never remove a token already
 * seen, so an unresolved element carrying a readable weak token is residue like any other.
 */
export function isResidue(el: ScanElement, paint: ReadonlyMap<string, TokenPaint | null>): boolean {
  return weakSides(el, paint).length > 0;
}

/* ---------------------------------------------------------------------- key */

/**
 * A render alternative's projection: its SORTED tokens that PAINT.
 *
 * Membership is by COMPILED DECLARATION, never by prefix (§3.3, spec round 7):
 * `![border-color:var(--color-border-strong)]` is an arbitrary property that compiles to a weak
 * `!important` border colour and begins with neither `border` nor `bg-`, so under a prefix key a
 * track's ON alternative went weak with its key AND its bar unchanged. A token that compiles to
 * nothing has no props and is outside the key, so a typo beside a live recipe reds nothing.
 *
 * Sorted, because Tailwind resolves conflicting utilities by stylesheet order and never by class
 * order, so a reorder is semantically null and must not red the guard (the R3 control).
 */
export function paintProjection(
  path: readonly string[],
  paint: ReadonlyMap<string, TokenPaint | null>,
): string {
  return path
    .flatMap((s) => s.split(/\s+/))
    .filter((t) => t.length > 0 && (paint.get(t)?.props.length ?? 0) > 0)
    .sort()
    .join(" ");
}

/**
 * Every alternative's projection, sorted — the ONE site that attaches an element to its paint.
 *
 * The key and the printed row read the same list, so a paste-ready row can never describe a
 * projection the key did not use. It is also the mutation registry's liveness control: detach
 * this and every residue element collapses to one key, which is the failure a census reader can
 * actually have.
 */
export function projectionsOf(
  el: ScanElement,
  paint: ReadonlyMap<string, TokenPaint | null>,
): string[] {
  return el.paths.map((p) => paintProjection(p, paint)).sort();
}

/** `(file, tag, every alternative's projection, sorted)`. No line number is part of the key. */
export function residueKey(el: ScanElement, paint: ReadonlyMap<string, TokenPaint | null>): string {
  return JSON.stringify([el.file, el.tag, projectionsOf(el, paint)]);
}

export type Residue = {
  readonly elements: readonly ScanElement[];
  /** key -> multiplicity. Two identical elements in one file are one key with count two (§3.4). */
  readonly keys: Map<string, number>;
  readonly universe: number;
  readonly paint: Map<string, TokenPaint | null>;
};

export function residueOf(rootDir: string, oracle: Oracle): Residue {
  const admitted = scanInteractiveElements(rootDir);
  const paint = classify(oracle, tokensOf(admitted));
  const elements = admitted.filter((el) => isResidue(el, paint));
  const keys = new Map<string, number>();
  for (const el of elements) {
    const key = residueKey(el, paint);
    keys.set(key, (keys.get(key) ?? 0) + 1);
  }
  return { elements, keys, universe: admitted.length, paint };
}

/* --------------------------------------------------------------------- rows */

export type ResidueCategory =
  | "switch-track"
  | "side-divider"
  | "focus-state-chrome"
  | "responsive-skin-filed"
  | "filed-defect"
  | "literal-outline";

export const RESIDUE_CATEGORIES: readonly ResidueCategory[] = [
  "switch-track",
  "side-divider",
  "focus-state-chrome",
  "responsive-skin-filed",
  "filed-defect",
  "literal-outline",
];

export type ResidueRow = {
  /** Repo-relative path, exactly as `scanInteractiveElements` reports it. */
  readonly file: string;
  /** Tag, exactly as `scanInteractiveElements` reports it. */
  readonly tag: string;
  /** One entry per render alternative: that alternative's projection; the array itself sorted. */
  readonly paint: readonly string[];
  readonly category: ResidueCategory;
  /** Category-bound FORM, validated. Never blank. */
  readonly reason: string;
  /** Required for `responsive-skin-filed`, `filed-defect` and `literal-outline`. */
  readonly backlogRef?: string;
};

export function rowKey(row: ResidueRow): string {
  return JSON.stringify([row.file, row.tag, [...row.paint].sort()]);
}

/* --------------------------------------------------------------------- bars */

/** WCAG relative luminance, the six-line form of `tests/styles/secondary-action-contrast.test.ts`
 *  replicated here: exporting it from a test file would make a suite a module dependency. */
function relLuminance(hex: string): number {
  const c = hex.replace("#", "");
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16) / 255;
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(ch(0)) + 0.7152 * lin(ch(2)) + 0.0722 * lin(ch(4));
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relLuminance(a), relLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function tokenIn(block: string, name: string): string {
  const m = block.match(new RegExp(`${name}-runtime:\\s*(#[0-9a-fA-F]{6})`));
  if (!m || !m[1]) throw new Error(`token ${name} not found`);
  return m[1];
}

/**
 * The ONE number in a reason that is derived rather than typed.
 *
 * Sound here and not in general for the reason R3 gave: an alternative with exactly one fill and
 * one outline token has no cascade to resolve, and an alternative with TWO fills is refused at
 * validation with the R2 shape named, rather than evaluated.
 */
export function recordedRatio(
  outlineToken: string,
  fillToken: string,
  css: string,
): { light: number; dark: number } {
  const anchor = (re: RegExp) => {
    const m = css.match(re);
    if (!m || m.index === undefined) throw new Error(`anchor ${String(re)} not found`);
    return m.index;
  };
  const light = css.slice(anchor(/^:root \{/m), anchor(/^@media \(prefers-color-scheme: dark\)/m));
  const dark = css.slice(anchor(/^\[data-theme="dark"\] \{/m));
  return {
    light: contrast(
      tokenIn(light, `--color-${outlineToken}`),
      tokenIn(light, `--color-${fillToken}`),
    ),
    dark: contrast(tokenIn(dark, `--color-${outlineToken}`), tokenIn(dark, `--color-${fillToken}`)),
  };
}

/**
 * A `^## <id>` heading's body, or null. A mention in ANOTHER entry's prose is not a declaration.
 *
 * The id must END where the ref ends. `\b` is NOT sufficient: a ledger id's charset is
 * `[A-Z0-9-]`, and `-` is a non-word character, so `\b` puts a boundary between `BL-OPS-LOG` and
 * the `-` of `## BL-OPS-LOG-OAUTH-EMITS`, and a ref to the SHORTER id resolves against the LONGER
 * entry — then reads that entry's body for the names-this-file check, which is a false PASS
 * whenever the wrong entry happens to name the file. Six strict-prefix pairs are live in the ledger
 * today (`BL-OPS-LOG` before three `BL-OPS-LOG-*` rows, `BL-SPEC-LINT` before
 * `BL-SPEC-LINT-CITATION-INTENT`, `BL-COPY-CRON-SWEEP` before `BL-COPY-CRON-SWEEP-2`,
 * `BL-SERVER-ACTION-ORIGIN-GATE` before its `-SWEEP`), so this is live-corpus reachable rather than
 * a constructed hazard.
 */
function ledgerEntryBody(ledgerText: string, ref: string): string | null {
  const esc = ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(
    `^## ${esc}(?![A-Z0-9-])[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`,
    "m",
  ).exec(ledgerText);
  return m ? (m[1] ?? "") : null;
}

/**
 * The six bars of §1.5, default-denied.
 *
 * A row's weak tokens are the tokens `classify` marks weak on some side, NEVER a spelling. The
 * live element is an input because the focus-ring check reads its FULL class strings (ring tokens
 * sit outside the paint projection by construction, §3.4), and a failure there names the
 * occurrence by line so a duplicate key cannot be validated once and counted twice. The ledger
 * text is an input because a `backlogRef` must resolve to a heading whose body names the file.
 */
export function validateRow(
  row: ResidueRow,
  el: ScanElement,
  oracle: Oracle,
  ledgerText: string,
): string[] {
  const problems: string[] = [];
  if (!RESIDUE_CATEGORIES.includes(row.category)) {
    problems.push(`${row.file}: unknown category ${String(row.category)}`);
    return problems;
  }
  if (row.reason.trim().length === 0) problems.push(`${row.file}: reason is blank`);

  const alternatives = row.paint.map((p) => p.split(" ").filter((t) => t.length > 0));
  const rowPaint = classify(oracle, alternatives.flat());
  const weakOn = (t: string) => {
    const p = rowPaint.get(t);
    return p != null && [...p.sides.values()].some(Boolean);
  };
  const weakTokens = alternatives.flat().filter(weakOn);
  if (weakTokens.length === 0)
    problems.push(`${row.file}: no weak outline token in paint; not residue`);

  const literals = [
    ...new Set(alternatives.flat().flatMap((t) => rowPaint.get(t)?.unclassified ?? [])),
  ];
  if (row.category === "literal-outline") {
    if (literals.length === 0)
      problems.push(
        `${row.file}: literal-outline row has no unclassified border-colour value; not this category`,
      );
    if (row.backlogRef === undefined) {
      problems.push(
        `${row.file}: replace ${literals.join(", ")} with a theme token, or file the literal as a BL-/DEF- entry and cite it (literal-outline requires backlogRef)`,
      );
      return problems;
    }
  } else if (literals.length > 0) {
    problems.push(
      `${row.file}: replace ${literals.join(", ")} with a theme token; a literal outline is registered only as literal-outline`,
    );
  }

  if (
    row.category === "responsive-skin-filed" ||
    row.category === "filed-defect" ||
    row.category === "literal-outline"
  ) {
    if (row.backlogRef === undefined) {
      problems.push(`${row.file}: ${row.category} requires backlogRef`);
    } else {
      const body = ledgerEntryBody(ledgerText, row.backlogRef);
      if (body === null) {
        problems.push(
          `${row.file}: backlogRef ${row.backlogRef} does not resolve to a ledger heading`,
        );
      } else {
        if (!body.includes(row.file))
          problems.push(
            `${row.file}: backlogRef ${row.backlogRef} resolves but its entry does not name this file`,
          );
        if (row.category === "literal-outline")
          for (const value of literals)
            if (!body.includes(value))
              problems.push(
                `${row.file}: backlogRef ${row.backlogRef} resolves but its entry does not name the compiled value ${value}`,
              );
      }
    }
  }

  if (row.category === "switch-track") {
    if (alternatives.length !== 2)
      problems.push(
        `${row.file}: switch-track needs exactly two render alternatives, has ${alternatives.length}`,
      );
    // Fills and outlines by COMPILED DECLARATION (§1.5, spec round 7), never derived from the
    // token string: `border`, `border-t` and `border-2` are neither, and an arbitrary property
    // `![border-color:…]` beside `border-accent-edge` is a SECOND outline, refused by name.
    for (const alternative of alternatives) {
      const fills = alternative.filter((t) => rowPaint.get(t)?.fillColourVar != null).length;
      const outlines = alternative.filter((t) => (rowPaint.get(t)?.sides.size ?? 0) > 0).length;
      if (fills !== 1 || outlines !== 1)
        problems.push(
          `${row.file}: switch-track alternative must carry exactly one fill and one outline colour declaration, has fills=${fills} outlines=${outlines} (${alternative.join(" ")})`,
        );
    }
    if (!/DESIGN\.md §1\.2a/.test(row.reason))
      problems.push(`${row.file}: switch-track reason must cite DESIGN.md §1.2a`);
    if (!/\d\.\d\d:1 light \/ \d\.\d\d:1 dark/.test(row.reason))
      problems.push(
        `${row.file}: switch-track reason must record the OFF ring ratio as n.nn:1 light / n.nn:1 dark`,
      );
  }

  if (row.category === "side-divider") {
    for (const alternative of alternatives) {
      if (!alternative.some(weakOn)) continue;
      // The SAME shape the accept-set below admits. They disagreed: the accept-set allowed
      // `border-[tblr]-<n>` while this list required a bare `border-[tblr]`, so a divider drawn with
      // only `border-t-2` was refused for "no side utility" while its token was perfectly
      // acceptable two lines down. Conservative, so not a silent clear, but the two readings of one
      // accept-set are exactly the fork §6 says there must not be.
      const sides = alternative.filter((t) => /^border-[tblr](-\d+)?$/.test(utilityOf(t)));
      if (sides.length === 0)
        problems.push(
          `${row.file}: side-divider alternative carries the weak token without a side utility (${alternative.join(" ")})`,
        );
      // ACCEPT-SET, default-denied: every `border*` token is a side width (`border-[tblr]`, or
      // `border-[tblr]-<n>`, so `last:border-b-0` passes) or THE weak colour token itself. A bare
      // `border`, a `border-2`, a `border-x` or a second colour makes it an outline, not a divider.
      const foreign = alternative.filter((t) => {
        const u = utilityOf(t);
        return u.startsWith("border") && !/^border-[tblr](-\d+)?$/.test(u) && !weakOn(t);
      });
      if (foreign.length > 0)
        problems.push(
          `${row.file}: side-divider alternative carries a border token outside the divider accept-set: ${foreign.join(" ")}`,
        );
      if (!sides.some((s) => row.reason.includes(utilityOf(s))))
        problems.push(`${row.file}: side-divider reason must name the side utility`);
    }
  }

  if (row.category === "focus-state-chrome") {
    for (const token of weakTokens)
      if (!variantsOf(token).some((v) => v === "focus" || v === "focus-visible"))
        problems.push(`${row.file}: focus-state-chrome weak token lacks a focus variant: ${token}`);
    // Read from the LIVE element's full strings: a ring token is outside the paint projection by
    // construction, so the row alone cannot answer this. Every alternative that carries a weak
    // token must carry the ring that makes the focus state perceptible.
    const livePaint = classify(oracle, tokensOf([el]));
    const unringed = el.paths.some((path) => {
      const tokens = path.flatMap((s) => s.split(/\s+/)).filter(Boolean);
      const carriesWeak = tokens.some((t) => {
        const p = livePaint.get(t);
        return p != null && [...p.sides.values()].some(Boolean);
      });
      return carriesWeak && !tokens.some((t) => /^focus(-visible)?:ring-/.test(t));
    });
    if (unringed)
      problems.push(`${el.file}:${el.line}: focus-state-chrome element lacks a focus ring token`);
  }

  if (row.category === "responsive-skin-filed") {
    for (const token of weakTokens)
      if (!variantsOf(token).some((v) => /^(max-)?(sm|md|lg|xl|2xl)$/.test(v)))
        problems.push(
          `${row.file}: responsive-skin-filed weak token lacks a responsive variant: ${token}`,
        );
  }

  return problems;
}

/* ------------------------------------------------------------- the messages */

/** One line per category, naming its bar. The failure message is the guard's whole interface. */
export const CATEGORY_BARS: readonly string[] = [
  "switch-track: exactly two alternatives, each with exactly one fill and one outline colour declaration; reason cites DESIGN.md §1.2a and records the OFF ring ratio as n.nn:1 light / n.nn:1 dark",
  "side-divider: every border token is a side width (border-t/b/l/r, optionally -<n>) or the weak colour itself; reason names the side utility",
  "focus-state-chrome: every weak token carries focus: or focus-visible:, and the element carries a focus ring token; reason states what carries the focus indication",
  "responsive-skin-filed: every weak token carries a responsive variant; backlogRef resolves to a ## heading whose body names this file",
  "filed-defect: backlogRef resolves to a ## heading whose body names this file; reason is non-blank",
  "literal-outline: the residue is an unclassified border-colour value; backlogRef resolves to a ## heading whose body names this file AND the value",
];

/**
 * The row to paste, printed by the module rather than typed by a human (§3.6).
 *
 * When the residue comes from an unclassified value the FIRST line is the intended repair and the
 * second is the priced alternative, so the cheapest path a reader sees is tokenising.
 */
export function printPasteReadyRow(
  el: ScanElement,
  paint: ReadonlyMap<string, TokenPaint | null>,
): string {
  const projections = projectionsOf(el, paint);
  const literals = [
    ...new Set(
      el.paths
        .flat()
        .flatMap((s) => s.split(/\s+/))
        .flatMap((t) => paint.get(t)?.unclassified ?? []),
    ),
  ];
  const lines: string[] = [];
  if (literals.length > 0) {
    lines.push(`replace ${literals.join(", ")} with a theme token`);
    lines.push(
      `or file it as a BL-/DEF- entry naming this file and ${literals.join(", ")}, and cite it`,
    );
  }
  const category = literals.length > 0 ? `"literal-outline"` : `"TODO"`;
  const ref = literals.length > 0 ? `, backlogRef: "TODO"` : "";
  lines.push(
    `{ file: ${JSON.stringify(el.file)}, tag: ${JSON.stringify(el.tag)}, paint: ${JSON.stringify(projections)}, category: ${category}, reason: "TODO"${ref} },`,
  );
  lines.push(...CATEGORY_BARS);
  return lines.join("\n");
}

/**
 * The suite's ONE problem list (§3.6), produced once and asserted by equality.
 *
 * Both directions as MULTISETS: an unregistered key names the element and prints its row, a stale
 * row names the nearest live key in its file by tag (so a token edit reads as "this row moved"
 * rather than "this row vanished"), and every row's bar runs against EVERY live element sharing
 * its key rather than against the first match (§3.4, W15).
 */
export function validateCensus(
  rows: readonly ResidueRow[],
  residue: Residue,
  oracle: Oracle,
  ledgerText: string,
): string[] {
  const problems: string[] = [];
  const registered = new Map<string, number>();
  for (const row of rows) registered.set(rowKey(row), (registered.get(rowKey(row)) ?? 0) + 1);

  for (const key of [...new Set([...residue.keys.keys(), ...registered.keys()])].sort()) {
    const live = residue.keys.get(key) ?? 0;
    const held = registered.get(key) ?? 0;
    if (live > held) {
      const el = residue.elements.find((e) => residueKey(e, residue.paint) === key);
      if (el === undefined) continue;
      problems.push(
        `unregistered: ${el.file} <${el.tag}> live ${live}, registered ${held}\n${printPasteReadyRow(el, residue.paint)}`,
      );
    }
    if (held > live) {
      const row = rows.find((r) => rowKey(r) === key);
      if (row === undefined) continue;
      // Rendered in the SAME shape as the registered paint beside it. These two strings exist to
      // be COMPARED — "this row moved" versus "this row vanished" is the whole point of printing
      // the nearest key — and a reader cannot diff a readable `A || B` against a JSON array. §3.6
      // names the message the guard's entire user interface, so the two halves match.
      const nearest = residue.elements
        .filter((e) => e.file === row.file && e.tag === row.tag)
        .map((e) => projectionsOf(e, residue.paint).join(" || "));
      problems.push(
        `stale: ${row.file} <${row.tag}> ${row.paint.join(" || ")} — registered ${held}, live ${live}; nearest live key in this file by tag: ${nearest[0] ?? "(none)"}`,
      );
    }
  }

  const categoryByKey = new Map<string, ResidueCategory>();
  for (const row of rows) {
    const key = rowKey(row);
    const seen = categoryByKey.get(key);
    if (seen !== undefined && seen !== row.category)
      problems.push(
        `${row.file}: rows sharing a key disagree about category: ${seen} vs ${row.category}`,
      );
    categoryByKey.set(key, row.category);
    for (const el of residue.elements)
      if (residueKey(el, residue.paint) === key)
        problems.push(...validateRow(row, el, oracle, ledgerText));
  }
  return problems;
}

/* ------------------------------------------------------------- the register */

// classified under tailwindcss 4.2.4 (AC-17): a red after an upgrade is re-decided row by row,
// never re-seeded. A classification change IS the design-system event this guard exists to surface.
export const RESIDUE_CENSUS: readonly ResidueRow[] = [
  {
    file: "app/help/errors/page.tsx",
    tag: "a",
    paint: ["focus:bg-surface-raised focus:border focus:border-border-strong sr-only"],
    category: "focus-state-chrome",
    reason:
      "the token paints only while the skip link is focused; focus-visible:ring-2 with ring-focus-ring carries the focus indication (WCAG 2.4.1)",
  },
  {
    file: "app/help/layout.tsx",
    tag: "a",
    paint: ["focus:bg-surface-raised focus:border focus:border-border-strong sr-only"],
    category: "focus-state-chrome",
    reason:
      "the token paints only while the skip link is focused; focus-visible:ring-2 with ring-focus-ring carries the focus indication (WCAG 2.4.1)",
  },
  {
    file: "components/admin/BellPanel.tsx",
    tag: "a",
    paint: ["border-border border-t"],
    category: "side-divider",
    reason:
      "border-t separates the panel footer link from the list above it; a divider, not a control outline",
  },
  {
    file: "components/admin/PublishedToggle.tsx",
    tag: "button",
    paint: ["bg-accent border border-accent-edge", "bg-surface-sunken border border-border-strong"],
    category: "switch-track",
    reason:
      "the OFF state's ring is the ruled exemption for switch tracks (DESIGN.md §1.2a); it measures 1.43:1 light / 1.75:1 dark, and the ruling keeps the recipe in both states",
  },
  {
    file: "components/admin/RecentAutoAppliedStrip.tsx",
    tag: "button",
    paint: [
      "bg-surface-sunken border-b border-border hover:bg-surface",
      "bg-surface-sunken hover:bg-surface",
    ],
    category: "side-divider",
    reason: "border-b separates the rows of the open strip; a divider, not a control outline",
  },
  {
    file: "components/admin/settings/AutoPublishToggle.tsx",
    tag: "button",
    paint: ["bg-accent border border-accent-edge", "bg-surface-sunken border border-border-strong"],
    category: "switch-track",
    reason:
      "the OFF state's ring is the ruled exemption for switch tracks (DESIGN.md §1.2a); it measures 1.43:1 light / 1.75:1 dark, and the ruling keeps the recipe in both states",
  },
  {
    file: "components/admin/settings/NotifyToggle.tsx",
    tag: "button",
    paint: ["bg-accent border border-accent-edge", "bg-surface-sunken border border-border-strong"],
    category: "switch-track",
    reason:
      "the OFF state's ring is the ruled exemption for switch tracks (DESIGN.md §1.2a); it measures 1.43:1 light / 1.75:1 dark, and the ruling keeps the recipe in both states",
  },
  {
    file: "components/admin/showpage/AttentionMenu.tsx",
    tag: "button",
    paint: ["border-b border-border hover:bg-surface-sunken last:border-b-0"],
    category: "side-divider",
    reason:
      "border-b separates menu rows and last:border-b-0 drops it on the final one; a divider, not a control outline",
  },
  {
    file: "components/admin/showpage/ShareHub.tsx",
    tag: "button",
    paint: [
      "bg-surface border border-text-faint hover:bg-surface-sunken max-sm:border max-sm:border-border",
      "bg-surface border border-text-faint hover:bg-surface-sunken max-sm:border max-sm:border-border",
      "bg-surface border border-text-faint hover:bg-surface-sunken max-sm:border max-sm:border-border",
      "bg-surface border border-text-faint hover:bg-surface-sunken max-sm:border max-sm:border-border",
    ],
    category: "responsive-skin-filed",
    reason:
      "the phone skin's outline weight is filed and fenced by a ratified decision; the desktop rest state is border-text-faint",
    backlogRef: "BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT",
  },
  {
    file: "components/admin/showpage/ShareHub.tsx",
    tag: "button",
    paint: [
      "bg-surface-sunken max-sm:border max-sm:border-border",
      "bg-surface-sunken max-sm:border max-sm:border-border",
      "bg-transparent max-sm:border max-sm:border-border",
      "bg-transparent max-sm:border max-sm:border-border",
    ],
    category: "responsive-skin-filed",
    reason:
      "the phone skin's outline weight is filed and fenced by a ratified decision; the desktop rest state is border-text-faint",
    backlogRef: "BL-CONTROL-OUTLINE-SHAREHUB-MOBILE-SKIN-WEIGHT",
  },
  {
    file: "components/admin/telemetry/EventFilters.tsx",
    tag: "button",
    paint: ["", "bg-text", "bg-text border-border border-l", "border-border border-l"],
    category: "side-divider",
    reason:
      "border-l separates the segmented filter's non-first segments; a divider, not a control outline",
  },
  {
    file: "components/crew/primitives/KeyTimesStrip.tsx",
    tag: "summary",
    paint: ["border-border border-t"],
    category: "side-divider",
    reason:
      "border-t separates the strip from the content above it; a divider, not a control outline",
  },
];
