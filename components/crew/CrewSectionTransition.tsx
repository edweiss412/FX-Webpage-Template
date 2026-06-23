"use client";

/**
 * components/crew/CrewSectionTransition.tsx — crew-redesign section crossfade.
 *
 * Wraps the active section body in an `AnimatePresence mode="wait"` keyed on
 * `sectionId`, so switching sections crossfades the outgoing body out before
 * the incoming body fades + rises in (4px translateY). Duration/ease mirror the
 * `--duration-normal` (220ms) / `--ease-out-quart` design tokens.
 *
 * Reduced motion (DESIGN §5.3, non-negotiable): the visitor's preference comes
 * from the shared `usePrefersReducedMotion()` hook (reads matchMedia on mount —
 * fixes framer-motion's missed-initial-value trap). When reduced motion is on,
 * the transition DURATION collapses to 0; the wrapper is ALWAYS rendered and
 * the tree SHAPE never branches on the preference (M12.11 hydration trap — a
 * fragment-vs-motion.div fork would force an SSR↔client remount). We toggle the
 * animation params only, and `suppressHydrationWarning` silences the benign
 * `data-*` diff between the server's `null` and the client's resolved value.
 *
 * On every `sectionId` change the key changes, so React re-mounts the keyed
 * `motion.div`. The wrapper is the keyed section boundary; the focusable region
 * (heading, first control) lives inside `children` — we keep this component
 * minimal and jsdom-safe and do not reach into the DOM here.
 *
 * data-testid="crew-section-transition".
 */

import { AnimatePresence, motion } from "framer-motion";
import { type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/lib/a11y/usePrefersReducedMotion";
import { type SectionId } from "@/lib/crew/resolveActiveSection";

export interface CrewSectionTransitionProps {
  sectionId: SectionId;
  children: ReactNode;
}

export function CrewSectionTransition({ sectionId, children }: CrewSectionTransitionProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  // --duration-normal is 220ms; reduced motion (or its 0ms token) → instant.
  const duration = prefersReducedMotion ? 0 : 0.22;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={sectionId}
        data-testid="crew-section-transition"
        suppressHydrationWarning
        data-reduced-motion={prefersReducedMotion ? "true" : "false"}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        // --ease-out-quart: cubic-bezier(0.25, 1, 0.5, 1).
        transition={{ duration, ease: [0.25, 1, 0.5, 1] }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
