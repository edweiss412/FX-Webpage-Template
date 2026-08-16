"use client";
/**
 * components/layout/useAppliedTheme.ts — the ONE theme handshake.
 *
 * Extracted 2026-08-09 (crew-chrome arc) when the theme switch moved into the
 * header avatar menu while the standalone toggle stayed for identity-less
 * pages. Two controls now flip the theme, and a second copy of this handshake
 * is how they end up disagreeing about what "dark" means — the product
 * register's "if the save button looks different in two places, one is wrong",
 * applied to behavior rather than paint.
 *
 * THE HANDSHAKE, unchanged from the shipped ThemeToggle:
 *
 *   The no-FOUC inline script in `app/layout.tsx` runs synchronously before
 *   React hydrates and stamps `<html data-theme>` from localStorage (or from
 *   `matchMedia` when there is no stored choice). This hook reads that dataset
 *   attribute on mount, so the rendered affordance agrees with the
 *   already-applied theme: no flash, no hydration mismatch. SSR and the first
 *   client render both report `{ mounted: false, theme: "light" }` so the markup
 *   is stable; the post-mount effect rewrites it in ONE setState.
 *
 * A caller that renders differently before and after mount must mark the
 * changing node `suppressHydrationWarning` — `mounted` is exposed for exactly
 * that, and the ACCESSIBILITY tree (aria-label, aria-checked, aria-pressed) is
 * the source of truth either way.
 */
import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "fxav-theme";

/**
 * The currently-applied theme, read from the DOM.
 *
 * The no-FOUC script stamps `data-theme` UNCONDITIONALLY, so post-hydration the
 * dataset attribute is the live truth. The `matchMedia` branch is defensive
 * only — for the pathological case where that script threw before its write
 * (a synchronous storage exception in a sandboxed iframe). It never fires in
 * normal operation.
 */
export function readAppliedTheme(): Theme {
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

export type AppliedTheme =
  | {
      mounted: false;
      theme: "light";
      isDark: false;
      persistFailed: false;
      setTheme: (next: Theme) => void;
    }
  | {
      mounted: true;
      theme: Theme;
      isDark: boolean;
      persistFailed: boolean;
      setTheme: (next: Theme) => void;
    };

export function useAppliedTheme(): AppliedTheme {
  const [state, setState] = useState<{
    mounted: boolean;
    theme: Theme;
    persistFailed: boolean;
  }>({
    mounted: false,
    theme: "light",
    persistFailed: false,
  });

  useEffect(() => {
    // Post-mount sync of the SSR-stable placeholder with the actually-applied
    // theme.
    //
    // FUNCTIONAL update, not a wholesale replace: the standalone toggle has a
    // reachable pre-mount click window (`ThemeToggle.tsx`, the read-the-DOM-at-
    // click-time comment), so a blocked write can already have set
    // `persistFailed` by the time this runs. Replacing state here would clear a
    // true report the user never saw.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((prev) => ({
      mounted: true,
      theme: readAppliedTheme(),
      persistFailed: prev.persistFailed,
    }));

    // AND a live subscription, which an earlier version argued was "ceremony
    // without correctness". Measured otherwise: with no stored choice, a phone
    // rolling into scheduled dark mode left the page in light with no signal
    // that it was stale, until a reload. A visitor who has never touched the
    // toggle is FOLLOWING the OS, so the OS changing its mind is a real input
    // this has to answer.
    //
    // Guarded on there being no stored choice, and re-read on every event
    // rather than captured: an explicit pick must keep winning over the OS, and
    // the pick can happen while this listener is alive.
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsChange = (event: MediaQueryListEvent): void => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        // Unreadable storage is treated as "no stored choice": following the OS
        // is the conservative answer when we cannot know the user picked.
      }
      if (stored === "light" || stored === "dark") return;
      const next: Theme = event.matches ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      // This path writes no storage, so it says nothing about persistence:
      // whatever the last write reported stays reported.
      setState((prev) => ({ mounted: true, theme: next, persistFailed: prev.persistFailed }));
    };
    query.addEventListener("change", onOsChange);
    return () => query.removeEventListener("change", onOsChange);
  }, []);

  function setTheme(next: Theme): void {
    document.documentElement.dataset.theme = next;
    let persistFailed = false;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage may be unavailable (private browsing, quota,
      // third-party-cookie blocks). Silent fail is deliberate: the dataset write
      // above still applies the theme for this tab; only persistence across
      // reloads is lost, and a thrown error here would take the whole control
      // down over a preference.
      //
      // What changed 2026-08-15: the absorb stays, but it no longer stays
      // QUIET. The controls render a small note from this flag, because "the
      // page turned dark and the next load is light again" is the user finding
      // out by being surprised.
      persistFailed = true;
    }
    // A later successful write CLEARS a previous failure: storage can come
    // back, and a stale warning would then be a lie.
    setState({ mounted: true, theme: next, persistFailed });
  }

  return state.mounted
    ? {
        mounted: true,
        theme: state.theme,
        isDark: state.theme === "dark",
        persistFailed: state.persistFailed,
        setTheme,
      }
    : { mounted: false, theme: "light", isDark: false, persistFailed: false, setTheme };
}
