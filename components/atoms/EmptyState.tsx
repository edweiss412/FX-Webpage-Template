/**
 * components/atoms/EmptyState.tsx — required-field empty-state placeholder
 * (M4 Task 4.4 shared atoms; spec §8.3; hardened in Task 4.14 per
 * /impeccable critique Finding 3).
 *
 * Empty-state discipline (spec §8.3, AGENTS.md §1.5):
 *
 *   • required-field missing inside a rendered tile → this atom. The
 *     placeholder reads italic on a `--color-surface-sunken` plate so
 *     it reads as "this is missing" at a glance, never confused for
 *     real content.
 *
 *   • optional-field missing → tiles omit the field entirely. NOT
 *     this atom — there's nothing to render at all. Optional-field
 *     visibility is decided by the per-field predicate table in
 *     `lib/visibility/emptyState.ts`.
 *
 *   • whole-tile missing → the tile component returns `null`. The grid
 *     reflows (§8.4). Tiles are responsible for that short-circuit;
 *     EmptyState never renders in this branch.
 *
 * Critique Finding 3 — hardening (Task 4.14):
 *
 *   3a. Default copy MUST NOT personify Doug. PRODUCT.md voice rule:
 *       no jargon, no workflow-leakage, "the page replaces a dense
 *       spreadsheet — the job is making information beautifully
 *       presentable, not surfacing every field." Telling a crew member
 *       "Doug hasn't filled this in yet" leaks the admin's internal
 *       workflow into the crew-facing surface. The default fallback
 *       collapses to a neutral crew-facing string ("Information
 *       missing.") and EVERY M4 tile passes a per-field `label`
 *       override that names what's missing in human language
 *       ("No hotel reservations on file yet." / "Show dates haven't
 *       been confirmed yet." / etc.). The default exists only as a
 *       safety net.
 *
 *   3b. The placeholder IS the content of the missing-field branch, so
 *       it MUST clear AA-body contrast. Previous M4 baseline used
 *       `text-text-faint` (#8b8c92, 3:1 against `--color-surface-sunken`)
 *       which is the documented "decorative-only" swatch. Replaced
 *       with `text-text-subtle` (7.8:1 light / 6.4:1 dark) — the
 *       canonical body-secondary swatch. Italic supplies the visual
 *       "missing" affordance; subtle gives legible content contrast.
 *
 * Variant discriminant removed when the second variant didn't ship;
 * re-add when needed (review 2026-05-03).
 *
 * Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";

type EmptyStateProps = {
  /**
   * Per-field override for the placeholder copy. Tiles MUST pass a
   * crew-facing override that names what's missing
   * (e.g., "No hotel reservations on file yet."). The default is a
   * neutral fallback for tiles that don't customize.
   */
  label?: string;

  /** Optional decorative slot rendered above the copy. Rare. */
  children?: ReactNode;
};

/**
 * Neutral crew-facing fallback. Tiles SHOULD always pass a
 * per-field `label` so the missing-piece is named; this default is the
 * safety-net copy when no override is supplied. Replaces the prior
 * "Doug hasn't filled this in yet" string per Critique Finding 3a.
 */
// not-subject:M5-D8 — empty-state placeholder, not an error message
const DEFAULT_COPY = "Information missing.";

export function EmptyState({ label, children }: EmptyStateProps) {
  return (
    <div
      data-testid="empty-state"
      data-variant="required-field"
      // §1.1: surface-sunken backdrop visually distinguishes the plate
      // from real content. Italic supplies the "this is missing" cue.
      // text-text-subtle clears AA-body (Finding 3b) — the placeholder
      // IS the content, not decoration, and must be legible as such.
      className="rounded-sm bg-surface-sunken px-3 py-2 text-sm italic text-text-subtle"
    >
      {children}
      <span>{label ?? DEFAULT_COPY}</span>
    </div>
  );
}
