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

/** Whitespace-normalized text of an element and all its descendants. */
const composedText = (el: Element): string => (el.textContent ?? "").replace(/\s+/g, " ").trim();

/** jsdom loads no CSS, so real visibility belongs to the Playwright specs. What
 *  IS provable here: the carrier is not deliberately hidden from sight or from
 *  the a11y tree. Without this, `sr-only` / `hidden` text satisfies every
 *  containment assertion while rendering nothing a sighted user sees. */
function expectNotHidden(el: Element, what: string): void {
  const t = tokensOf(el);
  expect(t.has("sr-only"), `${what} must not be sr-only`).toBe(false);
  expect(t.has("hidden"), `${what} must not be class-hidden`).toBe(false);
  expect(el.hasAttribute("hidden"), `${what} must not carry the hidden attribute`).toBe(false);
  expect(el.getAttribute("aria-hidden"), `${what} must not be aria-hidden`).not.toBe("true");
}

/** Counts occurrences of `needle` in the scope's COMPOSED text. Testing
 *  Library's exact getAllByText only matches text held by a single element, so
 *  a duplicate split across siblings (<p><span>Old link</span><span> stops…</span></p>)
 *  slips past it. Composed counting catches that. */
function countComposed(scope: HTMLElement, needle: string): number {
  return composedText(scope).split(needle.replace(/\s+/g, " ").trim()).length - 1;
}

/**
 * The label/description contract, in ONE place. Proves, for a row button:
 * the text is rendered INSIDE the button (not left outside in a surviving old
 * block), is not hidden, the `aria-describedby` target is a DESCENDANT of the
 * button, its text matches EXACTLY, and each string appears exactly once in the
 * scope, counted over composed text.
 */
export function expectRowText(
  button: HTMLElement,
  scope: HTMLElement,
  { label, description }: { label: string; description: string },
): void {
  const labelEl = within(button).getByText(label);
  expect(button.contains(labelEl)).toBe(true);
  expectNotHidden(labelEl, "row label");
  expect(button.getAttribute("aria-label")).toBe(label);
  expect(countComposed(scope, label), `label "${label}" must appear exactly once`).toBe(1);

  const descEl = document.getElementById(button.getAttribute("aria-describedby") ?? "");
  expect(descEl, "aria-describedby must resolve").not.toBeNull();
  expect(button.contains(descEl)).toBe(true);
  expectNotHidden(descEl!, "row description");
  expect(composedText(descEl!)).toBe(description);
  expect(
    countComposed(scope, description),
    `description "${description}" must appear exactly once`,
  ).toBe(1);
}
