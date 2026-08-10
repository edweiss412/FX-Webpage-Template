"use client";

/**
 * components/layout/ThemeToggle.tsx — the only `'use client'` boundary in
 * the page-chrome footer (impeccable v3 critique Finding 4 wire-up).
 *
 * Why a client island:
 *
 *   The toggle reads `<html data-theme>` (set pre-hydration by the
 *   no-FOUC inline script in `app/layout.tsx`), localStorage, and
 *   `prefers-color-scheme` to render the icon for the OPPOSITE theme
 *   (affordance: "this is what you'll get if you tap"). Click flips
 *   `<html data-theme>` and writes localStorage. None of that is
 *   server-renderable.
 *
 * No-FOUC handshake:
 *
 *   The inline script in `app/layout.tsx` runs synchronously before
 *   React hydrates and stamps `<html data-theme="…">` from localStorage
 *   when present. This component reads that dataset attribute on mount
 *   so the rendered icon agrees with the already-applied theme — no
 *   visual flash, no hydration mismatch. That read lives in
 *   `useAppliedTheme` now, shared with the header avatar menu: we render
 *   an SSR-stable Moon placeholder and the hook swaps to the correct icon
 *   on the first client tick; `aria-label` and `aria-pressed` are the
 *   source of truth for the accessibility tree.
 *
 * Hydration mismatch handling:
 *
 *   The button markup is stable across SSR + CSR (same role, same
 *   onClick, same aria-pressed=false initial). The icon swap inside is
 *   suppressed via `suppressHydrationWarning` on the icon-bearing span
 *   so React doesn't warn when an OS dark-mode user lands and the post-
 *   mount icon differs from the SSR fallback.
 *
 * DESIGN.md compliance:
 *
 *   • Tap target ≥44×44px via `min-h-tap-min min-w-tap-min`
 *     (DESIGN.md §3 spacing-tap-min token,
 *     globals.css line 75).
 *   • All colors via tokens — `border-border`, `bg-surface`,
 *     `text-text-subtle`, `hover:bg-surface-raised`, `hover:text-text`.
 *     No hex literals.
 *   • Focus ring via `--color-focus-ring` token.
 *   • Sun/Moon glyphs via lucide-react (ratified at distill;
 *     package.json:lucide-react ^1.14.0). `aria-hidden="true"` keeps
 *     them out of the AT tree — `aria-label` carries the meaning.
 */

import { Moon, Sun } from "lucide-react";

import { useAppliedTheme } from "./useAppliedTheme";

/**
 * The standalone theme control.
 *
 * Since 2026-08-09 this is the IDENTITY-LESS form: crew pages with a resolved
 * identity carry the switch inside the header avatar menu instead (UI spec
 * §2.3), and admin surfaces keep their own instance. The dataset/localStorage
 * handshake it used to own now lives in `useAppliedTheme` so the two controls
 * cannot drift apart on what "dark" means.
 */
export function ThemeToggle() {
  const { mounted, theme, isDark, setTheme } = useAppliedTheme();
  void theme;

  function flip() {
    setTheme(isDark ? "light" : "dark");
  }

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      onClick={flip}
      className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border bg-surface text-text-subtle transition-colors duration-fast hover:border-border-strong hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      {/*
        Show the icon for the OTHER theme — affordance is "this is
        what you'll get if you tap." Pre-mount we render Moon as the
        SSR-stable placeholder; post-mount we swap based on the
        actually-applied theme. suppressHydrationWarning silences the
        expected SSR/CSR icon divergence for OS-dark-mode visitors.
      */}
      <span aria-hidden="true" suppressHydrationWarning>
        {mounted && isDark ? (
          <Sun className="size-4" aria-hidden="true" />
        ) : (
          <Moon className="size-4" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}
