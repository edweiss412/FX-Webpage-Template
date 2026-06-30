"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const AUTO_REFRESH_MS = 20_000;
export const AUTO_REFRESH_TOP_PX = 200;
const KEY = "fxav.observability.autorefresh";

export function AutoRefreshControl() {
  const router = useRouter();
  const [on, setOn] = useState(true); // SSR + first paint = ON
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [agoLabel, setAgoLabel] = useState<string | null>(null);

  const doRefresh = useCallback(() => {
    setLastRefreshedAt(Date.now());
    setAgoLabel("Updated 0s ago");
    router.refresh();
  }, [router]);

  // Reconcile from localStorage after mount (avoid hydration mismatch). Mirrors the
  // ThemeToggle pattern: one-shot post-mount sync of the SSR-stable default.
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(KEY) === "off") setOn(false);
    } catch {
      /* ignore */
    }
  }, []);

  // Interval — scroll-gated, only fires when ON (effect guard), visible, and near the top.
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      if (document.visibilityState !== "hidden" && window.scrollY <= AUTO_REFRESH_TOP_PX)
        doRefresh();
    };
    const id = window.setInterval(tick, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [on, doRefresh]);

  // Visibility resume — only when ON, visible, AND near the top (the SAME scroll gate as the
  // interval). Returning to the tab while scrolled down reading older events must NOT yank the list.
  useEffect(() => {
    const onVis = () => {
      if (on && document.visibilityState === "visible" && window.scrollY <= AUTO_REFRESH_TOP_PX)
        doRefresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [on, doRefresh]);

  // Tick the relative label once per second while a timestamp exists (Date.now() stays OUT of render).
  useEffect(() => {
    if (lastRefreshedAt == null) return;
    const id = window.setInterval(
      () =>
        setAgoLabel(
          `Updated ${Math.max(0, Math.round((Date.now() - lastRefreshedAt) / 1000))}s ago`,
        ),
      1000,
    );
    return () => window.clearInterval(id);
  }, [lastRefreshedAt]);

  const toggle = () => {
    const next = !on;
    try {
      localStorage.setItem(KEY, next ? "on" : "off");
    } catch {
      /* ignore */
    }
    setOn(next);
    if (next) doRefresh(); // OFF→ON fires an immediate refresh (spec §6.3)
  };

  return (
    <div className="flex items-center gap-2 text-xs text-text-subtle">
      <button
        type="button"
        data-testid="autorefresh-toggle"
        aria-pressed={on}
        onClick={toggle}
        className={`inline-flex min-h-tap-min items-center rounded-pill px-3 ${on ? "bg-accent text-accent-text" : "bg-surface-sunken"}`}
      >
        Auto-refresh {on ? "on" : "off"}
      </button>
      <button
        type="button"
        data-testid="autorefresh-manual"
        onClick={doRefresh}
        className="inline-flex min-h-tap-min items-center underline"
      >
        Refresh
      </button>
      {agoLabel != null && <span data-testid="autorefresh-updated">{agoLabel}</span>}
    </div>
  );
}
