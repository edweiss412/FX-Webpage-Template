/**
 * tests/_shared/actionAffordance.ts
 *
 * DESIGN.md §1.1 documents `--color-text-subtle` as "Labels, captions, 'as of …'
 * timestamps. Never used for action targets." `SheetIconLink` was brought onto
 * that footing in 2026-07-26; SHEETLINK-SUBTLE-ACTION-CLASS-1 recorded that four
 * icon-only siblings were left behind, one of them in the SAME modal header —
 * which made the secondary sheet link render DARKER at rest than the primary
 * dismiss beside it.
 *
 * One helper rather than four hand-written assertions, so the five sites cannot
 * drift apart again the way they did the first time: whatever the contract is,
 * they all state it in the same words.
 */
import { expect } from "vitest";

/**
 * The painted element must sit at `text-text` at rest and lift to
 * `text-text-strong` on hover (directly or through a `group`).
 *
 * `el` is the element that PAINTS, which is not always the element that
 * receives the pointer: an icon-only control whose hit box is a bare
 * `size-tap-min` button paints through an inner span, and asserting on the
 * button would pass while the visible glyph stayed subtle.
 */
export function expectActionAffordanceColour(el: Element | null, label: string): void {
  const className = el?.getAttribute("class") ?? "";
  const tokens = className.split(/\s+/).filter(Boolean);
  expect(tokens, `${label}: renders with classes`).not.toHaveLength(0);
  expect(
    tokens.includes("text-text-subtle"),
    `${label}: carries text-text-subtle, which DESIGN.md §1.1 bans on action targets`,
  ).toBe(false);
  expect(tokens.includes("text-text"), `${label}: sits at text-text at rest`).toBe(true);
  expect(
    tokens.includes("hover:text-text-strong") || tokens.includes("group-hover:text-text-strong"),
    `${label}: lifts to text-text-strong on hover`,
  ).toBe(true);
}
