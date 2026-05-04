/**
 * components/atoms/Avatar.tsx — initial-chip avatar (Task 4.13.distill —
 * Finding 2 / Section `people` variant support).
 *
 * Used by CrewTile + ContactsTile (the two `people`-variant tiles) to
 * render a small leading chip beside each person's name. We do NOT
 * fetch external images (no headshots are stored anywhere in the data
 * model), so the chip is a deterministic initials-on-tinted-surface
 * disc.
 *
 * Visual rule:
 *   - 32px square, fully rounded (rounded-pill).
 *   - Surface = `bg-surface-sunken` (DESIGN.md §1.1) — quiet neutral
 *     plate behind the initials. NO color-rotation per person —
 *     PRODUCT.md / DESIGN.md §1 ban a competing palette ("one accent,
 *     used sparingly"). All chips share the same plate so the orange
 *     accent stays meaningful.
 *   - Initials = first letter of the first whitespace-split token + (if
 *     present) first letter of the last whitespace-split token,
 *     uppercased. Single-token names emit one letter. Empty / nullish
 *     names emit a single non-empty fallback character so the chip
 *     never collapses to whitespace and the row layout stays stable.
 *   - Text = text-text-strong, text-xs, font-semibold, tabular-nums NOT
 *     applied (initials are letters, not digits).
 *
 * Accessibility: the chip is `aria-hidden="true"` because the name it
 * decorates is rendered as live text in the same row. Screen readers
 * announce the name once, not "JC, John Carleo."
 *
 * Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";

type AvatarProps = {
  /**
   * The full name to derive initials from. Null / undefined / empty
   * strings render the fallback glyph (`?`) so the row layout stays
   * stable.
   */
  name: string | null | undefined;
};

/**
 * Derive 1-2 uppercase initials from a name. First letter of the first
 * non-empty whitespace token + first letter of the last token (if it
 * differs from the first). Returns `'?'` for empty / nullish input so
 * the chip never collapses.
 *
 * Exported for unit-test coverage; the logic is small but it's the
 * load-bearing part of the chip and worth pinning.
 */
export function deriveInitials(name: string | null | undefined): string {
  if (typeof name !== "string") return "?";
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return "?";
  if (tokens.length === 1) {
    const first = tokens[0];
    if (!first) return "?";
    return first.charAt(0).toUpperCase();
  }
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (!first || !last) return "?";
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

export function Avatar({ name }: AvatarProps): ReactNode {
  const initials = deriveInitials(name);
  return (
    <span
      aria-hidden="true"
      data-testid="avatar"
      className={[
        "inline-flex shrink-0 items-center justify-center",
        "size-8 rounded-pill",
        "bg-surface-sunken",
        "text-xs font-semibold text-text-strong",
        // Quiet hairline so the chip reads as a distinct surface in
        // light mode where bg-surface-sunken is only one step deeper
        // than bg-surface.
        "border border-border",
      ].join(" ")}
    >
      {initials}
    </span>
  );
}
