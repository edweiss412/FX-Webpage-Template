/**
 * tests/components/admin/showpage/_rowAssertions.ts
 *
 * Shared row-assertion helpers (spec 2026-07-20-share-hub-fidelity-fixes §7.0).
 *
 * Structural defense, not convenience: four consecutive adversarial-review
 * rounds found the same class of defect, an assertion form a WRONG
 * implementation could still satisfy (substring class matching; co-presence
 * instead of containment; uniqueness without containment; a required token
 * coexisting with a token that overrides it). Patching instances per round did
 * not converge, so the rigor lives here, in one place, and every row assertion
 * goes through it.
 *
 * Round-4 hardening, each closing a specific escape the previous form allowed:
 *   - `exactly` is the DEFAULT posture for a fully-prescribed class list.
 *     `has` alone permits `sm:w-auto` / `items-start` / `px-0` to ride along and
 *     override the token that was asserted.
 *   - forbid patterns are anchored to allow a variant prefix, so `sm:border`
 *     and `hover:border-accent` are caught, not just a bare `border`.
 *   - text assertions reject hidden carriers, and count occurrences over
 *     COMPOSED text so a duplicate split across sibling elements is caught
 *     (Testing Library's exact getAllByText does not match broken-up text).
 */
import { within } from "@testing-library/react";
import { expect } from "vitest";

/** Class tokens as a Set. NEVER assert against `className` directly:
 *  `.toContain("w-full")` also passes for `sm:w-full` / `max-w-full`. */
/** Class-based hiding mechanisms. `invisible` and `collapse` hide as
 *  thoroughly as `hidden` does; omitting them left a decidable escape. */
const HIDING_TOKENS = ["sr-only", "hidden", "invisible", "collapse"] as const;

export const tokensOf = (el: Element): Set<string> =>
  new Set(el.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? []);

/** Anchored to the token start OR just past a variant prefix, so `sm:border`
 *  and `hover:border-accent` are caught alongside a bare `border`. An unanchored
 *  /^border/ misses every variant-prefixed form. The negative lookahead excludes
 *  the table utilities that merely SHARE the prefix (`border-spacing-*`,
 *  `border-collapse`, `border-separate`) that declare no border of their own.
 *  A probe caught this helper flagging `border-spacing-0`. */
export const NO_BORDER = /(?:^|:)border(?!-(?:spacing|collapse|separate))(?:-|$)/;
/** No `bg-*` at REST. A variant-prefixed `hover:bg-*` is allowed by design; a
 *  regex over the whole class string cannot tell the two apart. */
export const NO_REST_BACKGROUND = /^bg-/;

export function expectClasses(
  el: Element,
  spec: { has?: readonly string[]; forbids?: readonly RegExp[]; exactly?: readonly string[] },
): void {
  const t = tokensOf(el);
  for (const c of spec.has ?? []) expect([...t], `missing token ${c}`).toContain(c);
  for (const re of spec.forbids ?? []) {
    expect(
      [...t].filter((x) => re.test(x)),
      `forbidden token matching ${re}`,
    ).toEqual([]);
  }
  // `exactly` is what stops a conflicting extra (sm:w-auto, items-start, px-0)
  // from overriding a token that `has` already matched.
  if (spec.exactly) expect([...t].sort()).toEqual([...spec.exactly].sort());
}

/** Whitespace-normalized text of an element and all its descendants, with a
 *  SEPARATOR inserted at every element boundary. Plain `textContent` concatenates
 *  with no gap, so `<span>Old link</span><span>stops working</span>` yields
 *  "Old linkstops working": a duplicate that reads identically on screen, with
 *  the gap supplied by `gap-1` rather than a text node, would go uncounted. */
const composedText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? "";
  return [...node.childNodes].map(composedText).join(" ");
};
const normalize = (s: string): string => s.replace(/\s+/g, " ").trim();

/** jsdom loads no CSS, so real visibility belongs to the Playwright specs. What
 *  IS provable here: the carrier is not deliberately hidden from sight or from
 *  the a11y tree. Without this, `sr-only` / `hidden` text satisfies every
 *  containment assertion while rendering nothing a sighted user sees. */
function expectNotHidden(el: Element, root: Element, what: string): void {
  // Walk from the carrier UP THROUGH the root INCLUSIVE. Two escapes this
  // closes, both found by review: checking the carrier alone lets a `hidden`
  // row BUTTON hide everything, and stopping AT the button lets a hidden
  // wrapper ABOVE it do the same while every token, containment, and composed
  // -text assertion still passes. `root` is therefore the popover scope, not
  // the button.
  let cur: Element | null = el;
  while (cur) {
    const t = tokensOf(cur);
    const where = cur === el ? what : `${what} ancestor <${cur.tagName.toLowerCase()}>`;
    // Class-based hiding.
    for (const token of HIDING_TOKENS) {
      expect(t.has(token), `${where} must not be ${token}`).toBe(false);
    }
    expect(cur.hasAttribute("hidden"), `${where} must not carry the hidden attribute`).toBe(false);
    expect(cur.getAttribute("aria-hidden"), `${where} must not be aria-hidden`).not.toBe("true");
    // INLINE style hiding. jsdom cannot resolve stylesheets, but it parses the
    // style attribute perfectly well, so `style={{ display: "none" }}` is
    // decidable here and must not be waved off as "a rendering property".
    const style = (cur as HTMLElement).style;
    expect(style?.display, `${where} must not be display:none`).not.toBe("none");
    expect(style?.visibility, `${where} must not be visibility:hidden`).not.toBe("hidden");
    expect(style?.visibility, `${where} must not be visibility:collapse`).not.toBe("collapse");
    if (cur === root) break;
    cur = cur.parentElement;
  }
}

/** Counts occurrences of `needle` in the scope's COMPOSED text. Testing
 *  Library's exact getAllByText only matches text held by a single element, so
 *  a duplicate split across siblings (<p><span>Old link</span><span> stops…</span></p>)
 *  slips past it. Composed counting catches that. */
function countComposed(scope: HTMLElement, needle: string): number {
  return normalize(composedText(scope)).split(normalize(needle)).length - 1;
}

/**
 * The label/description contract, in ONE place. Proves, for a row button:
 * the text is rendered INSIDE the button (not left outside in a surviving old
 * block), is not hidden, the `aria-describedby` target is a DESCENDANT of the
 * button, its text matches EXACTLY, and each string appears exactly once in the
 * scope, counted over composed text.
 */
/** The row's prescribed typography (spec §4.1). Asserted with `exactly` so a
 *  row that renders the right STRINGS at the wrong size/weight/colour fails. */
export const LABEL_CLASSES = ["text-sm", "font-medium", "text-text-strong"] as const;
export const DESCRIPTION_CLASSES = ["text-xs", "text-text-subtle"] as const;

export function expectRowText(
  button: HTMLElement,
  scope: HTMLElement,
  { label, description }: { label: string; description: string },
): void {
  // The button must itself be inside the scope, or the visibility walk below
  // would terminate without ever reaching the scope boundary.
  expect(scope.contains(button), "row button must be inside the asserted scope").toBe(true);
  const labelEl = within(button).getByText(label);
  expect(button.contains(labelEl)).toBe(true);
  expectNotHidden(labelEl, scope, "row label");
  expect(button.getAttribute("aria-label")).toBe(label);
  expect(countComposed(scope, label), `label "${label}" must appear exactly once`).toBe(1);
  expectClasses(labelEl, { exactly: LABEL_CLASSES });

  const descEl = document.getElementById(button.getAttribute("aria-describedby") ?? "");
  expect(descEl, "aria-describedby must resolve").not.toBeNull();
  expect(button.contains(descEl)).toBe(true);
  expectNotHidden(descEl!, scope, "row description");
  expect(normalize(composedText(descEl!))).toBe(description);
  expect(
    countComposed(scope, description),
    `description "${description}" must appear exactly once`,
  ).toBe(1);
  expectClasses(descEl!, { exactly: DESCRIPTION_CLASSES });
}

/**
 * Asserts a row renders NO description carrier at all: the §4.5 contract for an
 * absent or whitespace-only `rowDescription`.
 *
 * Structural and TAG-AGNOSTIC by design. A span count is neither: an empty
 * `<p id={descId} class="text-xs text-text-subtle">` survives a
 * `querySelectorAll("span")` check while still leaving the forbidden empty
 * described node in the tree. The column holds the label and nothing else, so
 * `childElementCount === 1` is the contract regardless of what tag the escape
 * reaches for.
 */
export function expectNoDescriptionNode(
  button: HTMLElement,
  scope: HTMLElement,
  label: string,
): void {
  expect(button.getAttribute("aria-describedby"), "no described node when absent").toBeNull();

  const labelEl = within(button).getByText(label);

  // The LABEL's own contract must survive the description being absent. Without
  // this, `aria-label={rowDescription?.trim() ? rowLabel : undefined}` passes:
  // the normal-description tests still see the right name, while a row with no
  // description silently loses its accessible name entirely.
  expect(button.getAttribute("aria-label"), "label survives an absent description").toBe(label);
  expectNotHidden(labelEl, scope, "row label");
  expectClasses(labelEl, { exactly: LABEL_CLASSES });

  const column = labelEl.parentElement;
  expect(column, "label must sit in the row column").not.toBeNull();
  expect(
    column!.childElementCount,
    "the column must hold the label and NOTHING else - any tag, not just a span",
  ).toBe(1);

  // Belt and braces: nothing anywhere in the row carries the description styling.
  expect(
    [...button.querySelectorAll("*")].filter((el) =>
      DESCRIPTION_CLASSES.every((c) => tokensOf(el).has(c)),
    ),
    "no element may carry the description class set",
  ).toEqual([]);
}
