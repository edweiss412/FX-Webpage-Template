/**
 * lib/crew/avatarColor.ts — deterministic per-name avatar swatch.
 *
 * DESIGN.md §1 amendment (2026-06-19): identity avatars (crew/contacts) carry a
 * per-person color from this fixed palette; the single-orange accent rule still
 * governs all other chrome. Every swatch is pre-measured ≥4.5:1 against #FFFFFF
 * white avatar text (the avatarColor.test.ts contrast assertion is the CI guard).
 * The color is derived from the NAME (stable per person across renders/sessions),
 * never from a render index. Blank/whitespace → the slate swatch.
 */
export const AVATAR_PALETTE = [
  "#9A4A00", // orange  6.26
  "#1B6B43", // green   6.50
  "#2657B0", // blue    6.83
  "#6A40C0", // violet  6.76
  "#A1322C", // rose    6.98
  "#136B6B", // teal    6.28
  "#86591A", // amber   6.07
  "#515763", // slate   7.26 (also the blank-name fallback)
] as const;

const SLATE = "#515763";

function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function avatarColor(name: string): string {
  const n = normalize(name);
  if (n.length === 0) return SLATE;
  // FNV-1a-ish stable string hash → palette index.
  let h = 2166136261;
  for (let i = 0; i < n.length; i += 1) {
    h ^= n.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const idx = (h >>> 0) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx]!;
}
