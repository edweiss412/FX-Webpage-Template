"use client";

import { useEffect, useState } from "react";

/**
 * Reliable `prefers-reduced-motion` detection (M12.11 / 2026-06-11 bug-audit).
 *
 * framer-motion's `useReducedMotion()` misses the INITIAL matchMedia value —
 * it can report the preference only after a matchMedia `change` event fires,
 * so a visitor who already has reduced motion enabled at first load is treated
 * as "unknown" and gets full-duration animation. This hook reads
 * `matchMedia(...).matches` on mount and subscribes to changes.
 *
 * Returns:
 *   - `null` on the server and during the first client render (the preference
 *     is unknowable pre-mount). Consumers MUST NOT branch the returned tree
 *     SHAPE on this value (SSR↔client remount); branch only animation params
 *     and data attributes.
 *   - `boolean` from mount onward, live-updated on preference changes.
 *
 * Extracted from components/layout/PageTransition.tsx so RightNowCard and
 * future motion surfaces share one verified implementation.
 */
export function usePrefersReducedMotion(): boolean | null {
  const [reduced, setReduced] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
