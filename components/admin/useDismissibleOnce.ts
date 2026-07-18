"use client";
/**
 * components/admin/useDismissibleOnce.ts (WI-5, spec 2026-07-18-alert-surface-ui §4)
 *
 * A one-time dismissible affordance backed by `localStorage`. Used by the
 * BellPanel chevron hint (a cosmetic, returning-user affordance).
 *
 * Fail-safe by construction (Safari private mode / hardened-privacy browsers
 * throw on the `localStorage` accessor itself, not just return null):
 *   - `status` is a 3-state machine: "checking" (SSR + pre-effect) → after the
 *     mount effect probes storage, "available" (probe succeeded) or "unavailable"
 *     (ANY throw — accessor OR getItem). The consumer renders the affordance ONLY
 *     when `status === "available" && !dismissed`, so both "checking" (avoids a
 *     hydration flash) and "unavailable" (storage blocked) suppress it silently.
 *   - `dismiss()` records the key in a MODULE-LEVEL in-memory set BEFORE the
 *     `setItem` attempt, so a `setItem` throw (or a private-mode browser that
 *     never persists) still keeps the affordance dismissed for the JS session,
 *     surviving a BellPanel remount (NotifBell conditionally mounts BellPanel on
 *     open → close/reopen remounts this hook).
 */
import { useEffect, useState } from "react";

// Module scope — survives BellPanel remount within the JS session so a dismissal
// (even one whose setItem threw) never reappears on reopen.
const memDismissed = new Set<string>();

export type DismissStatus = "checking" | "available" | "unavailable";

export function useDismissibleOnce(key: string): {
  status: DismissStatus;
  dismissed: boolean;
  dismiss: () => void;
} {
  const [status, setStatus] = useState<DismissStatus>("checking");
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (memDismissed.has(key)) {
      // Remount fallback: a prior dismissal (possibly setItem-throwing) is
      // remembered in-memory. status="available" so the render gate short-circuits
      // on `dismissed` (never shows the affordance).
      setDismissed(true);
      setStatus("available");
      return;
    }
    try {
      const v = window.localStorage.getItem(key);
      setDismissed(v != null);
      setStatus("available");
    } catch {
      // Accessor or getItem threw (private mode / blocked) → suppress, never crash.
      setStatus("unavailable");
    }
  }, [key]);

  const dismiss = () => {
    // In-memory FIRST, so a setItem throw can't lose the dismissal this session.
    setDismissed(true);
    memDismissed.add(key);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Write throw swallowed — still dismissed for the session (memDismissed).
    }
  };

  return { status, dismissed, dismiss };
}

/** Test-only: clear the module-level fallback set between tests. */
export function __resetDismissMemory(): void {
  memDismissed.clear();
}
