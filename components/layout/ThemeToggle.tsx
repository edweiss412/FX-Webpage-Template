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
 *   visual flash, no hydration mismatch (we render an SSR-stable Moon
 *   placeholder and let `useEffect` swap to the correct icon on first
 *   client tick; `aria-label` and `aria-pressed` are the source of truth
 *   for the accessibility tree).
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
 *   • Tap target ≥44×44px via `min-h-(--spacing-tap-min)
 *     min-w-(--spacing-tap-min)` (DESIGN.md §3 spacing-tap-min token,
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
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "fxav-theme";

/**
 * Resolve the currently-applied theme on the client. Reads the dataset
 * attribute first (set pre-hydration by the no-FOUC script) and falls
 * back to the system preference. localStorage is the persistence layer
 * but the dataset attribute is always the live truth post-hydration.
 */
function readAppliedTheme(): Theme {
  if (typeof document !== "undefined") {
    const ds = document.documentElement.dataset.theme;
    if (ds === "light" || ds === "dark") return ds;
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

type ToggleState = { mounted: false; theme: "light" } | { mounted: true; theme: Theme };

export function ThemeToggle() {
  // SSR + first-client-render fallback: { mounted: false, theme: 'light' }.
  // The post-mount useEffect rewrites this to { mounted: true, theme:
  // <actually-applied> } in ONE setState call so we don't trigger a
  // cascading-renders lint error. Markup stays stable across SSR/CSR —
  // only the icon glyph inside the button can change, and that span
  // carries `suppressHydrationWarning`.
  const [state, setState] = useState<ToggleState>({ mounted: false, theme: "light" });

  useEffect(() => {
    // Post-mount sync of SSR-stable placeholder ('light') with the
    // actually-applied theme. This is the canonical "read DOM/window
    // post-hydration" pattern — the no-FOUC inline script in
    // app/layout.tsx already wrote the correct data-theme to <html>
    // before React hydrated, so this setState happens at most once
    // per mount. The rule below would prefer useSyncExternalStore,
    // but the dataset attribute is one-shot (set pre-hydration, never
    // mutated by anything except this component's flip()), so a sub-
    // scription model would only add ceremony.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ mounted: true, theme: readAppliedTheme() });
  }, []);

  const { mounted, theme } = state;
  const isDark = theme === "dark";

  function flip() {
    const next: Theme = isDark ? "light" : "dark";
    setState({ mounted: true, theme: next });
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private browsing, storage
      // quota, third-party-cookie blocks). Silent fail: the theme
      // still applies for this tab via the dataset write above; only
      // persistence across reloads is lost.
    }
  }

  return (
    <button
      type="button"
      data-testid="theme-toggle"
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      aria-pressed={isDark}
      onClick={flip}
      className="inline-flex min-h-(--spacing-tap-min) min-w-(--spacing-tap-min) items-center justify-center rounded-sm border border-border bg-surface text-text-subtle transition-colors duration-(--duration-fast) hover:border-border-strong hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--color-focus-ring) focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
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
