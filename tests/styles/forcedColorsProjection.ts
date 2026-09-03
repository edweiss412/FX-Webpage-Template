/**
 * Arm 1: state collapse under forced colors. Spec §4.1, §4.2, §4.4.
 *
 * INVENTORY, NOT A GATE. Whether a repair WORKS is a question about rendered
 * output and only a browser answers it; this arm answers "which elements state
 * themselves only in properties forced colors flattens", which is a question about
 * the source. Plan review R1 finding 3 is why that division is written down: an
 * earlier plan made this suite the gate for the CSS repair, and since the repair
 * adds unlayered selectors to globals.css and changes no element's class list, the
 * command could never have gone green from its own repair.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import { __unstable__loadDesignSystem } from "tailwindcss";

import type { ScanElement } from "./interactiveScanCore";

/** What a token EMITS is the compiler's answer, never a grammar over token names. */
export type TokenSurvival = ReadonlyMap<string, boolean>;

export type Collision = {
  readonly file: string;
  readonly line: number;
  readonly tag: string;
  /** The two paths that share a forced projection, as class strings. */
  readonly pair: readonly [string, string];
  /** Tokens present in one of the pair and not the other. Sorted. */
  readonly differing: readonly string[];
};

/**
 * The forced projection of one path: the tokens whose emitted declarations include
 * at least one property the author still controls under forced colors.
 *
 * A token that emits NOTHING counts as surviving, conservatively — it cannot be
 * shown to collapse. That conservatism has a cost the census must carry rather than
 * the projection: an undefined class makes two paths differ here while painting
 * nothing, so a collision that DISAPPEARS after an edit is not by itself evidence
 * the states became distinguishable. The browser assertion is what settles that.
 */
export function projectPath(path: readonly string[], survival: TokenSurvival): string {
  return path
    .flatMap((chunk) => chunk.split(/\s+/))
    .filter((t) => t.length > 0 && survival.get(t) !== false)
    .sort()
    .join(" ");
}

/**
 * Report every element two of whose distinct render paths share a projection.
 *
 * The unit is the PAIR, not the element: an element with eight paths can have one
 * colliding pair and twenty-seven distinguishable ones, and a union over all eight
 * describes tokens that have nothing to do with the collision. The census
 * dispositions pairs, so the pair is what this returns.
 */
export function findCollisions(
  elements: readonly ScanElement[],
  survival: TokenSurvival,
): Collision[] {
  const out: Collision[] = [];
  for (const el of elements) {
    const distinct = [...new Set(el.paths.map((p) => p.join(" ")))];
    if (distinct.length < 2) continue;
    const grouped = new Map<string, string[]>();
    for (const path of distinct) {
      const key = projectPath(path.split(/\s+/), survival);
      grouped.set(key, [...(grouped.get(key) ?? []), path]);
    }
    for (const group of grouped.values()) {
      if (group.length < 2) continue;
      // EVERY pair in the group, not the first two. A group of three paths sharing
      // one projection is three indistinguishable pairs, and keeping `[0], [1]`
      // dropped the rest — whole-diff review R1 counted five such groups live,
      // including both `meShowSections` chips and the wizard pill. The unit is the
      // pair, and a unit that silently keeps one member of a set is not that unit.
      for (let i = 0; i < group.length; i += 1) {
        for (let j = i + 1; j < group.length; j += 1) {
          const first = group[i]!;
          const second = group[j]!;
          const a = new Set(first.split(/\s+/).filter(Boolean));
          const b = new Set(second.split(/\s+/).filter(Boolean));
          const differing = [...new Set([...a, ...b])]
            .filter((t) => !(a.has(t) && b.has(t)))
            .sort();
          out.push({ file: el.file, line: el.line, tag: el.tag, pair: [first, second], differing });
        }
      }
    }
  }
  return out;
}

/**
 * The CANNOT-DECIDE set (spec AC-4c). Two shapes, both REPORTED rather than passed:
 * a component the resolver could not name, and a single-path element whose one
 * class string carries state variants, which expresses two states the projection
 * comparison never sees because `paths` has one entry.
 */
export function findUndecidable(
  elements: readonly ScanElement[],
  unresolved: readonly string[],
): string[] {
  const STATE_VARIANT = /(^|:)(aria-\[?[a-z-]+|data-\[?[a-z-]+|checked|open|active|current)[\]:]/;
  const singlePathWithVariants = elements
    .filter((el) => new Set(el.paths.map((p) => p.join(" "))).size === 1)
    .filter((el) =>
      el.paths.flat().some((chunk) => chunk.split(/\s+/).some((t) => STATE_VARIANT.test(t))),
    )
    .map((el) => `${el.file}:${el.line} <${el.tag}> single-path-state-variant`);
  return [...unresolved, ...singlePathWithVariants].sort();
}

/** Dropped outright, or forced onto the palette. Neither stays author-controlled. */
const NOT_AUTHOR_CONTROLLED: ReadonlySet<string> = new Set([
  "color",
  "background-color",
  "background-image",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "column-rule-color",
  "text-decoration-color",
  "-webkit-text-fill-color",
  "fill",
  "stroke",
  "accent-color",
  "caret-color",
  "box-shadow",
  "text-shadow",
]);

/**
 * Tailwind's shadow plumbing. Every `--tw-ring-*`, `--tw-shadow-*` and
 * `--tw-inset-*` custom property exists only to be composed into the `box-shadow`
 * declaration, so a token whose sole effect is to set one has no forced-colors
 * existence even when the property it sets is a WIDTH rather than a colour.
 * `ring-offset-2` is the case that made this a prefix rule rather than a list: it
 * emits `--tw-ring-offset-width: 2px`, which is author-controlled in isolation and
 * feeds nothing but a dropped shadow.
 */
function isShadowPlumbing(property: string): boolean {
  return (
    property.startsWith("--tw-ring") ||
    property.startsWith("--tw-shadow") ||
    property.startsWith("--tw-inset")
  );
}

/**
 * Which tokens survive, answered by the compiler rather than by a grammar over
 * token names. `tests/styles/controlOutlineResidue.ts:15-18` records that
 * hand-written token grammars lost three consecutive spec rounds, and the same
 * trap applies here: `bg-warning-bg` and `ring-offset-warning-bg` differ by which
 * property they set, and only the compiler knows.
 */
export async function loadTokenSurvival(
  elements: readonly ScanElement[],
  cssPath: string,
): Promise<TokenSurvival> {
  const ds = await __unstable__loadDesignSystem(readFileSync(cssPath, "utf8"), {
    base: dirname(cssPath),
    loadStylesheet: async (id: string, base: string) => {
      const path =
        id.startsWith(".") || id.startsWith("/")
          ? resolve(base, id)
          : createRequire(import.meta.url).resolve(id.includes("/") ? id : `${id}/index.css`);
      return { base: dirname(path), content: readFileSync(path, "utf8"), path };
    },
  });

  const tokens = [
    ...new Set(
      elements
        .flatMap((el) => el.paths.flat())
        .flatMap((chunk) => chunk.split(/\s+/))
        .filter((t) => t.length > 0),
    ),
  ];
  const emitted = ds.candidatesToCss(tokens);
  const survival = new Map<string, boolean>();

  tokens.forEach((token, i) => {
    const css = emitted[i] ?? null;
    // A token that emits nothing is unknown to the compiler, so it cannot be shown
    // to collapse. Conservative, and the census carries the cost: a collision that
    // DISAPPEARS after adding an undefined class is not evidence of anything.
    if (css === null) {
      survival.set(token, true);
      return;
    }
    // Scan the candidate's OWN rule. candidatesToCss appends the @property
    // definitions its custom properties depend on, whose `syntax`, `inherits` and
    // `initial-value` declarations would otherwise read as author-controlled and
    // make every shadow and ring utility look like a survivor — which HIDES
    // collapses rather than inventing them.
    const ownRule = css.replace(/@property\s+[^{]*\{[^}]*\}/g, "");
    const properties = [...ownRule.matchAll(/(^|[{;\s])([-a-zA-Z]+)\s*:/g)]
      .map((m) => m[2])
      .filter((p): p is string => p !== undefined);
    survival.set(
      token,
      properties.length === 0 ||
        properties.some((p) => !NOT_AUTHOR_CONTROLLED.has(p) && !isShadowPlumbing(p)),
    );
  });

  return survival;
}
