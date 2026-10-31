"use client";

import { useEffect, useState, type RefObject } from "react";

/** Every rect comparison here allows half a pixel, as the layout spec does. */
const TOLERANCE_PX = 0.5;

/**
 * lib/offline/client/scrolledUnder.ts
 *
 * Whether `below`, an element in normal flow, has scrolled up under `cover`, a
 * sticky element above it: true once its bottom is at or above the cover's
 * bottom, so none of it shows beneath the cover. The saved-copy bar uses it to
 * decide which of the two draws the bottom edge (UI gate re-check E4): the
 * in-flow detail while any of it shows under the pinned line, and the pinned
 * line itself once the detail has gone.
 *
 * `content` is what `below` says, or null when it is not rendered. The layout is
 * read on every scroll and resize, and in the first frame after `content`
 * changes, so a page that opens already scrolled, or a detail whose copy (and so
 * height) changes in place, reads right without waiting for a scroll. False
 * while `content` is null, and on the server and the hydrating render, which
 * read no layout.
 */
export function useScrolledUnder(
  below: RefObject<HTMLElement | null>,
  cover: RefObject<HTMLElement | null>,
  content: string | null,
): boolean {
  const [under, setUnder] = useState(false);
  const active = content !== null;

  useEffect(() => {
    const element = below.current;
    const top = cover.current;
    if (!active || element === null || top === null) return;
    const read = (): void => {
      const bottom = element.getBoundingClientRect().bottom;
      setUnder(bottom <= top.getBoundingClientRect().bottom + TOLERANCE_PX);
    };
    const frame = window.requestAnimationFrame(read);
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  }, [below, cover, active, content]);

  return active && under;
}
