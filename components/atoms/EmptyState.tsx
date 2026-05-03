/**
 * components/atoms/EmptyState.tsx — the canonical "Doug hasn't filled
 * this in yet" placeholder (M4 Task 4.4 shared atoms; spec §8.3).
 *
 * Empty-state discipline (spec §8.3, AGENTS.md §1.5):
 *
 *   • required-field missing inside a rendered tile → this atom, with
 *     `variant="required-field"`. The placeholder reads italic + faint
 *     on a `--color-surface-sunken` plate so it reads as "this is
 *     missing" at a glance, never confused for real content.
 *
 *   • optional-field missing → tiles omit the field entirely. NOT
 *     this atom — there's nothing to render at all.
 *
 *   • whole-tile missing → the tile component returns `null`. The grid
 *     reflows (§8.4). Tiles are responsible for that short-circuit;
 *     EmptyState never renders in this branch.
 *
 * Copy: hard-coded to the literal "Doug hasn't filled this in yet" at
 * M4 baseline. A future Task 4.14 will route through
 * `lib/messages/lookup.ts` so a single i18n / copy-tweak point exists;
 * the atom is the single emit-point so that refactor only touches one
 * file. Tiles MUST NOT inline the literal — always go through this
 * atom.
 *
 * Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";

type EmptyStateProps = {
  /**
   * Discriminant per §8.3. Today only `'required-field'` is supported;
   * the discriminant is a forward-compat anchor for variants like
   * `'optional-field'` (used inside tile bodies for sub-sections that
   * are optional but present-but-empty in the source data) without
   * forcing a callsite refactor when they land.
   */
  variant: "required-field";

  /**
   * Optional override for the canonical "Doug hasn't filled this in
   * yet" copy. Pass a more specific message when the missing piece
   * has a clear name (e.g., "Doug hasn't added a venue address yet").
   * Default copy is preserved at M4 baseline so the §8.3 invariant
   * holds across every tile that doesn't customize.
   */
  label?: string;

  /** Optional decorative slot rendered above the copy. Rare. */
  children?: ReactNode;
};

const DEFAULT_COPY = "Doug hasn't filled this in yet";

export function EmptyState({ variant, label, children }: EmptyStateProps) {
  // The discriminant exists for forward-compat; today every code path
  // resolves the same way, but the type makes future variants
  // explicit at every callsite.
  void variant;

  return (
    <div
      data-testid="empty-state"
      data-variant="required-field"
      className="rounded-sm bg-surface-sunken px-3 py-2 text-sm italic text-text-faint"
    >
      {children}
      <span>{label ?? DEFAULT_COPY}</span>
    </div>
  );
}
