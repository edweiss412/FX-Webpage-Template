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
 * ONE VALUE FOR EVERY CONTROL (2026-10-26, crew page redesign spec §4.1): the
 * crew header now shows the switch to identified viewers too, so the header
 * switch and the avatar-menu checkbox are mounted together. Each used to keep
 * its own `useState`, so flipping one left the other stale. The theme is now
 * read through `useSyncExternalStore` from one module-level subscription whose
 * snapshot is the `data-theme` attribute itself, notified by `setTheme`, by the
 * OS-following path and by another tab's `storage` event. `mounted` stays a
 * per-instance post-mount flag, so the pre-mount window below is unchanged.
 *
 * A caller that renders differently before and after mount must mark the
 * changing node `suppressHydrationWarning` — `mounted` is exposed for exactly
 * that, and the ACCESSIBILITY tree (aria-label, aria-checked, aria-pressed) is
 * the source of truth either way.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

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
      setTheme: (next: Theme) => void;
    }
  | {
      mounted: true;
      theme: Theme;
      isDark: boolean;
      setTheme: (next: Theme) => void;
    };

const listeners = new Set<() => void>();
let detachSources: (() => void) | null = null;

function notify(): void {
  for (const listener of listeners) listener();
}

function storedChoice(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    // Unreadable storage is treated as "no stored choice": following the OS is
    // the conservative answer when we cannot know the user picked.
    return null;
  }
}

function applyTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  notify();
}

/**
 * The two outside inputs, attached while at least one control is mounted.
 *
 * The OS listener is the live subscription an earlier version argued was
 * "ceremony without correctness". Measured otherwise: with no stored choice, a
 * phone rolling into scheduled dark mode left the page in light with no signal
 * that it was stale, until a reload. A visitor who has never touched the toggle
 * is FOLLOWING the OS, so the OS changing its mind is a real input. Guarded on
 * there being no stored choice, re-read on every event rather than captured: an
 * explicit pick must keep winning over the OS, and the pick can happen while
 * this listener is alive.
 *
 * The `storage` event fires only in OTHER tabs of the same origin, so a pick in
 * one tab reaches the rest. A cleared key is ignored: the tab keeps the theme
 * it is showing rather than flipping under the reader.
 */
function attachSources(): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== THEME_STORAGE_KEY) return;
    if (event.newValue === "light" || event.newValue === "dark") applyTheme(event.newValue);
  };
  window.addEventListener("storage", onStorage);
  if (typeof window.matchMedia !== "function") {
    return () => window.removeEventListener("storage", onStorage);
  }
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const onOsChange = (event: MediaQueryListEvent): void => {
    if (storedChoice() !== null) return;
    applyTheme(event.matches ? "dark" : "light");
  };
  query.addEventListener("change", onOsChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    query.removeEventListener("change", onOsChange);
  };
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  if (listeners.size === 1) detachSources = attachSources();
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && detachSources !== null) {
      detachSources();
      detachSources = null;
    }
  };
}

function serverTheme(): Theme {
  return "light";
}

function setTheme(next: Theme): void {
  document.documentElement.dataset.theme = next;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // localStorage may be unavailable (private browsing, quota,
    // third-party-cookie blocks). Silent fail is deliberate: the dataset write
    // above still applies the theme for this tab; only persistence across
    // reloads is lost, and a thrown error here would take the whole control
    // down over a preference.
    //
    // It stays silent by RULING, not by omission (2026-08-26, spec
    // 2026-08-15-theme-persistence-note §2.2 "Amendment, 2026-08-26"): saving
    // the choice is a convenience, and a device that cannot save it still
    // gets the theme it asked for, for the visit. The 2026-08-15 note that
    // reported this is removed. Do not reintroduce a signal here without
    // reopening that ruling.
  }
  notify();
}

export function useAppliedTheme(): AppliedTheme {
  // The snapshot is the DOM attribute, which is what makes the standalone
  // toggle's reachable pre-mount click window safe: a click in that window has
  // already stamped `data-theme`, and the subscription's post-commit snapshot
  // check picks up the user's real choice even on a device whose write was
  // refused.
  const theme = useSyncExternalStore(subscribe, readAppliedTheme, serverTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Post-mount flip of the SSR-stable placeholder.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return mounted
    ? { mounted: true, theme, isDark: theme === "dark", setTheme }
    : { mounted: false, theme: "light", isDark: false, setTheme };
}
