/**
 * Forced-colors fragility scanner. Two arms, both REPORTING candidates rather than
 * deciding defects — spec `docs/superpowers/specs/2026-09-01-forced-colors-pass.md`
 * §4.1 and §4.4.
 *
 * WHY IT REPORTS RATHER THAN DECIDES. CSS alone cannot say when a rule applies, and
 * it cannot see a glyph. Both gaps are live in this repo: the section-freshness cue
 * animates two endpoints that force to one value, which reads as "paints nothing"
 * while the attribute gating it is present only during a flash and the forced
 * opaque outline IS the cue; and the onboarding wizard's done pill projects equal
 * to its visited and upcoming siblings while a `<Check>` glyph separates it. The
 * spec's first draft specified a repair for the first that would have suppressed a
 * working cue. Teaching the scanner React attribute lifetimes and JSX children is
 * the wrong repair: it grows the recognizer, and a wider recognizer is a bigger
 * target for the next round. So every finding is a candidate, and the census
 * carries the reason a candidate is not a defect.
 */
import { readFileSync } from "node:fs";

import postcss from "postcss";

/** Dropped outright under forced colors. Probe M1, M1b, M11, M12. */
const DROPPED_PROPERTIES: ReadonlySet<string> = new Set(["box-shadow", "text-shadow"]);

/** Forced onto the palette: present, but no longer author-controlled. Probe M2-M9. */
const FORCED_PROPERTIES: ReadonlySet<string> = new Set([
  "color",
  "background-color",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "fill",
  "stroke",
  "column-rule-color",
  "text-decoration-color",
]);

/**
 * A carrier that survives: the author still controls it under forced colors.
 * Style and width only — a colour is forced, a style is not.
 */
function isSurvivingCarrier(property: string): boolean {
  return (
    property === "outline" ||
    property === "border" ||
    /^outline-(style|width|offset)$/.test(property) ||
    /^border(-(top|right|bottom|left))?-(style|width)$/.test(property)
  );
}

function isDroppedGradient(property: string, value: string): boolean {
  return property === "background-image" && /gradient\(/.test(value);
}

export type CarrierLossKind = "a2a-rule" | "a2b-animation";

export type CarrierLoss = {
  /** The rule's selector, or `@keyframes <name>` for an animation. */
  readonly subject: string;
  readonly kind: CarrierLossKind;
  /** The declared properties that do not survive, in source order. */
  readonly carriers: readonly string[];
  /** The at-rule chain the subject sits inside, outermost first. Empty at top level. */
  readonly context: readonly string[];
};

/**
 * Arm 2 over the SOURCE stylesheet.
 *
 * Source and not the compiled sheet, which is a measured choice rather than a
 * convenience: run the same criterion over compiled output and A2a reports an
 * order of magnitude more, every extra one a Tailwind `.shadow-*` or `.ring-*`
 * utility that does declare a shadow and nothing else. That is a fact about
 * Tailwind, not about this app. Whether an ELEMENT wearing `shadow-tile` has a
 * surviving carrier is Arm 1's question, asked where the rest of its classes are
 * visible.
 */
export function scanCarrierLoss(cssSource: string): CarrierLoss[] {
  const root = postcss.parse(cssSource);
  const findings: CarrierLoss[] = [];

  const contextOf = (node: postcss.Node): string[] => {
    const chain: string[] = [];
    for (let p = node.parent; p && p.type === "atrule"; p = p.parent) {
      chain.unshift(`@${(p as postcss.AtRule).name} ${(p as postcss.AtRule).params}`.trim());
    }
    return chain;
  };

  /**
   * A rule scoped to `forced-colors: active` is the TREATMENT, not the affordance.
   * Judging it by the same criterion is a category error: the criterion asks
   * whether an affordance survives forced colors, and such a rule applies only
   * under forced colors, so it is the answer rather than the question.
   *
   * Found by the guard reporting this pass's OWN repair. `[data-quiet]` inside the
   * block declares `border-color: Canvas` and nothing else, which is exactly the
   * shape A2a looks for, and it is correct: naming the off state by its colour is
   * what rule 2 asks for where a width is load-bearing.
   */
  const insideForcedColors = (node: postcss.Node): boolean => {
    for (let p = node.parent; p; p = p.parent) {
      if (p.type === "atrule" && /forced-colors/.test((p as postcss.AtRule).params)) return true;
    }
    return false;
  };

  root.walkRules((rule) => {
    if (insideForcedColors(rule)) return;
    const parent = rule.parent;
    if (parent && parent.type === "atrule" && /keyframes/.test((parent as postcss.AtRule).name)) {
      return; // keyframe steps belong to A2b, judged as a whole animation
    }
    const declarations: postcss.Declaration[] = [];
    rule.walkDecls((d) => {
      declarations.push(d);
    });
    const carriers = declarations.filter(
      (d) =>
        DROPPED_PROPERTIES.has(d.prop) ||
        FORCED_PROPERTIES.has(d.prop) ||
        isDroppedGradient(d.prop, d.value),
    );
    if (carriers.length === 0) return;
    if (declarations.some((d) => isSurvivingCarrier(d.prop))) return;
    findings.push({
      subject: rule.selector,
      kind: "a2a-rule",
      carriers: carriers.map((d) =>
        isDroppedGradient(d.prop, d.value) ? "background-image(gradient)" : d.prop,
      ),
      context: contextOf(rule),
    });
  });

  root.walkAtRules(/^(-\w+-)?keyframes$/, (atRule) => {
    if (insideForcedColors(atRule)) return;
    const animated = new Set<string>();
    atRule.walkDecls((d) => {
      animated.add(isDroppedGradient(d.prop, d.value) ? "background-image(gradient)" : d.prop);
    });
    if (animated.size === 0) return;
    const properties = [...animated];
    const allDropped = properties.every(
      (p) => DROPPED_PROPERTIES.has(p) || p === "background-image(gradient)",
    );
    const allForced = properties.every((p) => FORCED_PROPERTIES.has(p));
    if (!allDropped && !allForced) return;
    findings.push({
      subject: `@keyframes ${atRule.params}`,
      kind: "a2b-animation",
      carriers: properties,
      context: contextOf(atRule),
    });
  });

  return findings;
}

/** Convenience for the suite and the inventory command. */
export function scanCarrierLossAt(cssPath: string): CarrierLoss[] {
  return scanCarrierLoss(readFileSync(cssPath, "utf8"));
}
