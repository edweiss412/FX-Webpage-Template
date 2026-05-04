/**
 * Unit tests for the EmptyState atom (M4 Task 4.4 shared atoms commit;
 * hardened in Task 4.14 per /impeccable critique Finding 3).
 *
 * Spec §8.3 empty-state discipline:
 *   - required-field missing (inside a rendered tile) → render the
 *     placeholder, with per-tile `label` overrides supplying crew-
 *     facing copy ("No hotel reservations on file yet" / "Show dates
 *     haven't been confirmed yet" / etc.). The atom keeps a neutral
 *     fallback string for tiles that don't customize.
 *   - whole-tile missing (no content at all) → the parent tile returns
 *     `null` and the grid reflows. The atom does NOT render in this
 *     case; tiles are responsible for short-circuiting before mounting
 *     EmptyState.
 *
 * Critique Finding 3 (regression guards):
 *   3a. Default copy must NOT personify Doug. PRODUCT.md voice rule:
 *       no jargon, no workflow-leakage. The default falls back to a
 *       neutral crew-facing string.
 *   3b. The placeholder is THE CONTENT of the missing-field branch, so
 *       it MUST clear AA-body contrast — `text-text-subtle` (7.8:1
 *       light / 6.4:1 dark) replaces the original `text-text-faint`
 *       (3:1, fails AA-body when used as content).
 *
 * The atom tests deliberately stop at presence + semantic shape. Real-
 * browser layout assertions are Task 4.13's job.
 */
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "@/components/atoms/EmptyState";

describe("EmptyState atom", () => {
  test("default copy is a neutral crew-facing fallback (no Doug personification)", () => {
    const html = renderToStaticMarkup(<EmptyState />);
    // Critique Finding 3a: the placeholder must NOT mention Doug or
    // any internal workflow detail. Crew-facing voice only.
    expect(html).not.toMatch(/Doug/i);
    // The exact fallback string is "Information missing." — neutral,
    // crew-facing, valid in any tile context that doesn't override.
    expect(html).toContain("Information missing.");
  });

  test("uses the surface-sunken background per DESIGN.md §1.1", () => {
    const html = renderToStaticMarkup(<EmptyState />);
    // The empty-state plate is visually distinct from real content.
    // §1.1 names `--color-surface-sunken` as the empty-state backdrop;
    // we apply via Tailwind's `bg-surface-sunken` utility.
    expect(html).toMatch(/bg-surface-sunken/);
  });

  test("carries italic weight (visual 'missing' affordance) AND clears AA-body contrast", () => {
    const html = renderToStaticMarkup(<EmptyState />);
    // The placeholder text MUST read as 'this is missing' at a glance.
    // Italic supplies the visual affordance; `text-text-subtle` (NOT
    // `text-text-faint`) clears AA-body so the copy is legible as
    // CONTENT, not just decoration.
    expect(html).toMatch(/italic/);
    expect(html).toMatch(/text-text-subtle/);
    // Critique Finding 3b regression guard: the prior 3:1 swatch must
    // NOT be in use anywhere on the empty-state plate.
    expect(html).not.toMatch(/text-text-faint/);
  });

  test("custom label arg overrides the default placeholder copy", () => {
    // Tiles pass a per-field `label` to give the missing-piece a name
    // (e.g., "No hotel reservations on file yet"). Task 4.14 wired
    // every M4 tile to pass an override; the default is reserved as
    // a safety net for tiles that omit one.
    const html = renderToStaticMarkup(
      <EmptyState label="No hotel reservations on file yet." />,
    );
    expect(html).toContain("No hotel reservations on file yet.");
  });
});
