"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export const AUTO_REFRESH_MS = 20_000;
export const AUTO_REFRESH_TOP_PX = 200;
const KEY = "fxav.observability.autorefresh";

export function AutoRefreshControl() {
  const router = useRouter();
  const [on, setOn] = useState(true); // SSR + first paint = ON
  const onRef = useRef(on);
  onRef.current = on;
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number | null>(null);
  const [, force] = useState(0); // re-render the relative "Updated …s ago" label

  const doRefresh = useCallback(() => {
    setLastRefreshedAt(Date.now());
    router.refresh();
  }, [router]);

  // Reconcile from localStorage after mount (avoid hydration mismatch).
  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "off") setOn(false); } catch { /* ignore */ }
  }, []);

  // Interval — scroll-gated, only fires when ON, visible, and near the top.
  useEffect(() => {
    if (!on) return;
    const tick = () => {
      if (onRef.current && document.visibilityState !== "hidden" && window.scrollY <= AUTO_REFRESH_TOP_PX) doRefresh();
    };
    const id = window.setInterval(tick, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [on, doRefresh]);

  // Visibility resume — only when ON.
  useEffect(() => {
    const onVis = () => { if (onRef.current && document.visibilityState === "visible") doRefresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [doRefresh]);

  // Tick the relative label once per second while a timestamp exists.
  useEffect(() => {
    if (lastRefreshedAt == null) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [lastRefreshedAt]);

  const toggle = () => {
    const next = !onRef.current;
    try { localStorage.setItem(KEY, next ? "on" : "off"); } catch { /* ignore */ }
    setOn(next);
    if (next) doRefresh(); // OFF→ON fires an immediate refresh (spec §6.3)
  };

  return (
    <div className="flex items-center gap-2 text-xs text-text-subtle">
      <button type="button" data-testid="autorefresh-toggle" aria-pressed={on} onClick={toggle}
        className={`inline-flex min-h-tap-min items-center rounded-pill px-3 ${on ? "bg-accent text-accent-text" : "bg-surface-sunken"}`}>
        Auto-refresh {on ? "on" : "off"}
      </button>
      <button type="button" data-testid="autorefresh-manual" onClick={doRefresh} className="inline-flex min-h-tap-min items-center underline">Refresh</button>
      {lastRefreshedAt != null && (
        <span data-testid="autorefresh-updated">
          Updated {Math.max(0, Math.round((Date.now() - lastRefreshedAt) / 1000))}s ago
        </span>
      )}
    </div>
  );
}
