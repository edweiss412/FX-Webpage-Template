"use client";

import { useSyncExternalStore } from "react";

/**
 * Reliable `prefers-reduced-motion` detection (M12.11 / 2026-06-11 bug-audit).
 *
 * framer-motion's `useReducedMotion()` misses the INITIAL matchMedia value —
 * it can report the preference only after a matchMedia `change` event fires,
 * so a visitor who already has reduced motion enabled at first load is treated
 * as "unknown" and gets full-duration animation. This hook reads
 * `matchMedia(...).matches` and subscribes to changes via
 * `useSyncExternalStore` (the idiomatic external-store pattern — no
 * setState-in-effect).
 *
 * Returns:
 *   - `null` on the server and during the first client render (hydration uses
 *     `getServerSnapshot`, so the value is unknowable pre-mount). Consumers
 *     MUST NOT branch the returned tree SHAPE on this value (SSR↔client
 *     remount); branch only animation params and data attributes.
 *   - `boolean` from mount onward, live-updated on preference changes.
 *
 * Extracted from components/layout/PageTransition.tsx so RightNowCard and
 * future motion surfaces share one verified implementation.
 */
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onStoreChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onStoreChange);
  return () => mq.removeEventListener("change", onStoreChange);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

// Pre-mount (server render + hydration) the preference is unknowable; null
// preserves the documented "null until mount" contract that consumers rely on
// to avoid branching tree shape.
function getServerSnapshot(): null {
  return null;
}

export function usePrefersReducedMotion(): boolean | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
