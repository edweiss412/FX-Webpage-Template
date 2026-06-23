"use client";

/**
 * components/shared/AccentButton.tsx — shared accent-button atom (M5-D7).
 *
 * The primary-action "accent fill" button chrome had drifted across ~8
 * admin call sites (ResolveAlertButton, PendingPanelRetryButton,
 * ReSyncButton, PublishShowButton, RunFinalCASButton,
 * ResumeFinalizeButton, FinalizeButton, StagedReviewCard). Each had
 * hand-copied the same `bg-accent`/`text-accent-text`/`hover:bg-accent-hover`/
 * focus-ring stack with small, accreted differences (padding, font
 * weight, ring-offset color, inline-flex vs block, shadow). The 4th-
 * variant YAGNI gate is well past, so M5-D7 extracts the canonical
 * composition here.
 *
 * Contract:
 *   - The canonical shared chrome (rounded-sm bg-accent text-accent-text
 *     transition-colors duration-fast hover:bg-accent-hover focus-ring +
 *     disabled treatment) is ALWAYS emitted.
 *   - Variant props reproduce each migrated site's exact class string:
 *       size       — padding + text size tier (sm/md/lg)
 *       fontWeight — medium | semibold
 *       ringOffset — colored focus ring-offset to match the surface the
 *                    button sits on (bg / warning-bg / surface-raised /
 *                    surface); omit for the default uncolored offset
 *       inline     — inline-flex items-center justify-center
 *       selfStart  — self-start (flex-column parents)
 *       shadow     — shadow-(--shadow-tile)
 *       minWidthTap— min-w-tap-min (square tap floor)
 *   - All native <button> props pass through (type, onClick, disabled,
 *     aria-busy, data-testid, children, …). `type` defaults to "button"
 *     so the atom is safe outside a <form>; submit sites pass type="submit".
 *   - `className` is the escape hatch — appended LAST so per-site overrides
 *     (e.g. ResolveAlertButton's `disabled:hover:bg-accent`) win in cascade
 *     order without forking the atom.
 *
 * Tokens only (DESIGN.md §"single source of executable tokens"): every
 * utility here resolves to an @theme token in app/globals.css. No inline
 * hex / px / arbitrary [..] values. The structural meta-test at
 * tests/styles/accent-button-atom.test.ts bans raw accent-button
 * compositions in the migrated files outside this atom so the class can't
 * re-drift.
 */
import type { ButtonHTMLAttributes } from "react";

export type AccentButtonSize = "sm" | "md" | "lg";
export type AccentButtonWeight = "medium" | "semibold";
/**
 * Surface the button visually sits on — selects the focus ring-offset
 * color so the 2px offset matches the backdrop. Omit for the default
 * uncolored `ring-offset-2` (button on the page/`bg` default backdrop
 * where no explicit offset color was previously set).
 */
export type AccentButtonRingOffset = "bg" | "warning-bg" | "surface-raised" | "surface";

export type AccentButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Padding + text-size tier. Default "md" (px-4 py-2). */
  size?: AccentButtonSize;
  /** Label weight. Default "semibold". */
  fontWeight?: AccentButtonWeight;
  /** Colored focus ring-offset to match the host surface. */
  ringOffset?: AccentButtonRingOffset;
  /** inline-flex items-center justify-center (vs default block button). */
  inline?: boolean;
  /** self-start, for flex-column parents that would otherwise stretch. */
  selfStart?: boolean;
  /** shadow-(--shadow-tile) raised treatment. */
  shadow?: boolean;
  /** min-w-tap-min square-ish tap floor (in addition to the always-on min-h). */
  minWidthTap?: boolean;
};

const SIZE_CLASS: Record<AccentButtonSize, string> = {
  // sm/lg deliberately omit `py-*` — the migrated sites that use them rely
  // on min-h-tap-min for vertical sizing (single-line height). md keeps py-2.
  sm: "px-4 text-sm",
  md: "px-4 py-2",
  lg: "px-6 text-base",
};

const WEIGHT_CLASS: Record<AccentButtonWeight, string> = {
  medium: "font-medium",
  semibold: "font-semibold",
};

const RING_OFFSET_CLASS: Record<AccentButtonRingOffset, string> = {
  bg: "focus-visible:ring-offset-bg",
  "warning-bg": "focus-visible:ring-offset-warning-bg",
  "surface-raised": "focus-visible:ring-offset-surface-raised",
  surface: "focus-visible:ring-offset-surface",
};

// Canonical shared chrome — never varies across sites.
const BASE_CLASS =
  "min-h-tap-min rounded-sm bg-accent text-accent-text transition-colors duration-fast hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export function AccentButton({
  size = "md",
  fontWeight = "semibold",
  ringOffset,
  inline = false,
  selfStart = false,
  shadow = false,
  minWidthTap = false,
  className,
  type,
  children,
  ...rest
}: AccentButtonProps) {
  const classes = [
    inline ? "inline-flex items-center justify-center" : null,
    selfStart ? "self-start" : null,
    BASE_CLASS,
    minWidthTap ? "min-w-tap-min" : null,
    SIZE_CLASS[size],
    WEIGHT_CLASS[fontWeight],
    shadow ? "shadow-(--shadow-tile)" : null,
    ringOffset ? RING_OFFSET_CLASS[ringOffset] : null,
    // Escape hatch LAST so per-site overrides win cascade order.
    className ?? null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    // type defaults to "button" so the atom never accidentally submits a
    // surrounding <form>; submit sites pass type="submit" explicitly.
    <button type={type ?? "button"} className={classes} {...rest}>
      {children}
    </button>
  );
}
