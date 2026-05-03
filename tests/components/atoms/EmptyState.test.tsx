/**
 * Unit tests for the EmptyState atom (M4 Task 4.4 shared atoms commit).
 *
 * Spec §8.3 empty-state discipline:
 *   - required-field missing (inside a rendered tile) → render the
 *     canonical "Doug hasn't filled this in yet" placeholder. M4 hard-
 *     codes the string at the atom; Task 4.14 will route through
 *     `lib/messages/lookup.ts`. The atom is the single emit-point so
 *     that future refactor only touches one file.
 *   - whole-tile missing (no content at all) → the parent tile returns
 *     `null` and the grid reflows. The atom does NOT render in this
 *     case; tiles are responsible for short-circuiting before mounting
 *     EmptyState. Task 4.4 sets that contract per-tile.
 *
 * The atom tests deliberately stop at presence + semantic shape. Real-
 * browser layout assertions are Task 4.13's job.
 */
import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmptyState } from "@/components/atoms/EmptyState";

describe("EmptyState atom", () => {
  test("variant='required-field' renders the canonical 'Doug' placeholder", () => {
    const html = renderToStaticMarkup(<EmptyState variant="required-field" />);
    // Apostrophe is HTML-encoded by renderToStaticMarkup.
    expect(html).toContain("Doug hasn&#x27;t filled this in yet");
  });

  test("variant='required-field' uses the surface-sunken background per DESIGN.md §1.1", () => {
    const html = renderToStaticMarkup(<EmptyState variant="required-field" />);
    // The "Doug hasn't…" plate is visually distinct from real content.
    // §1.1 names `--color-surface-sunken` as the empty-state backdrop;
    // we apply via Tailwind's `bg-surface-sunken` utility.
    expect(html).toMatch(/bg-surface-sunken/);
  });

  test("variant='required-field' carries an italic + faint visual weight (distinct from real values)", () => {
    const html = renderToStaticMarkup(<EmptyState variant="required-field" />);
    // The placeholder text MUST read as 'this is missing' at a glance.
    // The atom uses `italic` + `text-text-faint` to do that.
    expect(html).toMatch(/italic/);
    expect(html).toMatch(/text-text-faint/);
  });

  test("custom label arg overrides the default placeholder copy", () => {
    // Some tiles may want a more specific placeholder (e.g., "venue
    // address" missing). The atom accepts an optional `label` to
    // tailor the message — but the default ('Doug hasn't…') is the
    // canonical M4 baseline.
    const html = renderToStaticMarkup(
      <EmptyState variant="required-field" label="Doug hasn't added a venue address yet" />,
    );
    expect(html).toContain("Doug hasn&#x27;t added a venue address yet");
  });
});
