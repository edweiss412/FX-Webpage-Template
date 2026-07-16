"use client";
import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export const AUTO_REFRESH_MS = 20_000;
export const AUTO_REFRESH_TOP_PX = 200;
const KEY = "fxav.telemetry.autorefresh";

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
    <div className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-surface px-3 py-1.5 shadow-tile">
      {/* Pulse dot: live ping ring only when ON; static faint dot when OFF. */}
      <span aria-hidden className="relative inline-flex size-2 shrink-0">
        {on && (
          <span
            data-testid="autorefresh-ping"
            className="telemetry-ping absolute inset-0 rounded-full bg-accent"
          />
        )}
        <span
          className={`relative inline-block size-2 rounded-full ${on ? "bg-accent" : "bg-text-faint"}`}
        />
      </span>
      <span className="text-sm text-text">Auto-refresh</span>
      {/* Switch: 34×20 track, thumb translateX. A toggle BUTTON (aria-pressed) — not
          role="switch" (which would require aria-checked). min-h/w-tap-min keeps a ≥44px
          tap target around the 34×20 visible track (WCAG 2.5.5). */}
      <button
        type="button"
        data-testid="autorefresh-toggle"
        aria-pressed={on}
        aria-label={`Auto-refresh ${on ? "on" : "off"}`}
        onClick={toggle}
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center"
      >
        <span
          className={`relative inline-flex h-5 w-[34px] items-center rounded-full border transition-colors ${on ? "border-accent-edge bg-accent" : "border-border-strong bg-surface-sunken"}`}
        >
          <span
            className={`absolute size-4 rounded-full bg-surface shadow-tile transition-transform ${on ? "translate-x-[16px]" : "translate-x-[2px]"}`}
          />
        </span>
      </button>
      <span aria-hidden className="h-[18px] w-px bg-border" />
      {agoLabel != null && (
        <span data-testid="autorefresh-updated" className="text-xs tabular-nums text-text-faint">
          {agoLabel}
        </span>
      )}
      <button
        type="button"
        data-testid="autorefresh-manual"
        aria-label="Refresh now"
        onClick={doRefresh}
        className="inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm border border-border p-1.5 text-text-subtle hover:bg-surface-sunken hover:text-text"
      >
        <RotateCw className="size-4" aria-hidden />
      </button>
    </div>
  );
}
