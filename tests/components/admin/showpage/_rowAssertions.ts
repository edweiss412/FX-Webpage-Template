/**
 * tests/components/admin/showpage/_rowAssertions.ts
 *
 * Shared row-assertion helpers (spec 2026-07-20-share-hub-fidelity-fixes §7.0).
 *
 * Structural defense, not convenience: three consecutive adversarial-review
 * rounds found the same class of defect — an assertion form a WRONG
 * implementation could still satisfy (substring class matching; co-presence
 * instead of containment; uniqueness without containment). Patching instances
 * per round did not converge, so the rigor lives here, in one reviewed place,
 * and every row assertion goes through it.
 */
import { within } from "@testing-library/react";
import { expect } from "vitest";

/** Class tokens as a Set. NEVER assert against `className` directly:
 *  `.toContain("w-full")` also passes for `sm:w-full` / `max-w-full`. */
export const tokensOf = (el: Element): Set<string> =>
  new Set(el.getAttribute("class")?.split(/\s+/).filter(Boolean) ?? []);

/** No UNPREFIXED `bg-*` token. A regex over the whole class string cannot tell
 *  `hover:bg-surface-sunken` (allowed) from `bg-surface-sunken` (forbidden). */
export const NO_REST_BACKGROUND = /^bg-/;
export const NO_BORDER = /^border/;

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
  if (spec.exactly) expect([...t].sort()).toEqual([...spec.exactly].sort());
}

export function expectRowText(
  button: HTMLElement,
  scope: HTMLElement,
  { label, description }: { label: string; description: string },
): void {
  const labelEl = within(button).getByText(label);
  expect(button.contains(labelEl)).toBe(true);
  expect(within(scope).getAllByText(label)).toHaveLength(1);
  expect(button.getAttribute("aria-label")).toBe(label);

  const descEl = document.getElementById(button.getAttribute("aria-describedby") ?? "");
  expect(descEl).not.toBeNull();
  expect(button.contains(descEl)).toBe(true);
  expect(descEl!.textContent).toBe(description);
  expect(within(scope).getAllByText(description)).toHaveLength(1);
}
