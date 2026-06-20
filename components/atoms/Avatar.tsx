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
 * Visual rule (mock-fidelity Task 2 — DESIGN.md §1 amendment 2026-06-19):
 *   - 40px square, fully rounded (rounded-pill).
 *   - Surface = a deterministic per-NAME swatch from `avatarColor`
 *     (lib/crew/avatarColor.ts). Identity avatars (crew/contacts) carry
 *     a per-person color; the single-orange accent rule still governs all
 *     other chrome. Every swatch is pre-measured ≥4.5:1 against the white
 *     initials, so no hairline border is needed — the color is itself a
 *     distinct surface. Blank/whitespace names → the slate swatch.
 *   - Initials = first letter of the first whitespace-split token + (if
 *     present) first letter of the last whitespace-split token,
 *     uppercased. Single-token names emit one letter. Empty / nullish
 *     names emit a single non-empty fallback character so the chip
 *     never collapses to whitespace and the row layout stays stable.
 *   - Text = text-white, text-sm, font-semibold, tabular-nums NOT
 *     applied (initials are letters, not digits).
 *
 * Accessibility: the chip is `aria-hidden="true"` because the name it
 * decorates is rendered as live text in the same row. Screen readers
 * announce the name once, not "JC, John Carleo."
 *
 * Server Component (no `'use client'`).
 */
import type { ReactNode } from "react";

import { avatarColor } from "@/lib/crew/avatarColor";

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
      style={{ backgroundColor: avatarColor(name ?? "") }}
      className={[
        "inline-flex shrink-0 items-center justify-center",
        "size-10 rounded-pill",
        "text-sm font-semibold text-white",
      ].join(" ")}
    >
      {initials}
    </span>
  );
}
