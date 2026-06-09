"use client";

import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reliable `prefers-reduced-motion` detection. framer-motion's own
 * `useReducedMotion()` misses the INITIAL value — it returns false until a
 * matchMedia `change` event fires, so a visitor who already has reduced motion
 * on (no change event) would wrongly get animations (verified: matchMedia
 * reports reduce=true while framer's hook returned false). This hook reads
 * `matchMedia(...).matches` on mount and subscribes to changes. SSR-safe: it
 * starts `false` (the server can't know the preference) and updates on mount,
 * which is fine because the wrapper's DOM shape never depends on this value.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * components/layout/PageTransition.tsx (M12.11)
 *
 * Animates the page-content area on every route change so navigating between
 * URLs feels like a cohesive app instead of a hard document swap. The new
 * route's content — or its `loading.tsx` skeleton while the server work is in
 * flight — fades and rises in.
 *
 * Persistent chrome (the admin nav, the crew-page header) lives OUTSIDE this
 * wrapper in the layout, so ONLY the content transitions; the nav stays put.
 * Keyed on `pathname`: each navigation changes the key, React re-mounts the
 * motion element, and the enter animation replays.
 *
 * Reduced motion (DESIGN §5.3 is non-negotiable): when the visitor prefers
 * reduced motion, the content is shown with NO animation. Duration/ease mirror
 * the `--duration-normal` (220ms) / `--ease-out-expo` design tokens.
 *
 * STRUCTURAL STABILITY (no hydration mismatch): the wrapper element is ALWAYS
 * rendered — we never branch the returned tree shape on `useReducedMotion()`.
 * SSR can't know the motion preference and renders the wrapper; if the client's
 * first render returned a bare fragment instead (for reduced-motion users),
 * React would hit a root-shape mismatch and remount the admin content during
 * hydration. Keeping one stable wrapper and toggling only the ANIMATION (not the
 * DOM shape) avoids that.
 *
 * FIRST PAINT IS AT REST (not opacity:0). framer-motion SSRs `initial` inline,
 * so animating the first render would ship `opacity:0` HTML — invisible until
 * hydration (and with JS disabled). The animation runs ONLY when (a) motion is
 * allowed AND (b) the component has already mounted — i.e. on client
 * NAVIGATIONS. SSR / first paint / no-JS therefore render fully-visible content
 * (`opacity:1;transform:none`); reduced-motion users never animate.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const prefersReducedMotion = usePrefersReducedMotion();
  const hasMounted = useRef(false);
  useEffect(() => {
    hasMounted.current = true;
  }, []);

  // Animate only on post-mount client navigations, and never for reduced motion.
  // `initial={false}` renders the element AT the settled state with no enter
  // animation (used for SSR/first-paint and for every reduced-motion render).
  const animate = !prefersReducedMotion && hasMounted.current;

  return (
    <motion.div
      key={pathname}
      data-testid="page-transition"
      // The motion preference is client-only (SSR can't read matchMedia), so the
      // server renders "false" and a reduced-motion client may render "true".
      // The DOM SHAPE is identical either way (always this wrapper), so there's
      // no remount; suppressHydrationWarning silences the benign attribute diff
      // — same posture as the theme attribute on <html> in app/layout.tsx.
      suppressHydrationWarning
      data-reduced-motion={prefersReducedMotion ? "true" : "false"}
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
