"use client";

import { useEffect, type RefObject } from "react";

/**
 * lib/offline/client/scrollPadding.ts
 *
 * Keeps `scroll-padding-top` on `<html>` equal to a sticky element's height
 * while `active`. A browser scrolling an element into view (keyboard focus,
 * `scrollIntoView`, a fragment) keeps it inside the scrollport minus that
 * padding, so a control focused from the keyboard lands below the sticky
 * element instead of behind it (WCAG 2.4.11, Focus Not Obscured).
 *
 * The height follows the element through a ResizeObserver, because the saved-
 * copy bar's height changes with its copy and with the width. Where the
 * observer is missing the first height holds until the next activation. The
 * padding is removed when `active` turns false and when the component
 * unmounts, so nothing offsets the page's scrolling once the element is gone.
 */
export function useScrollPaddingTop(target: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const element = target.current;
    if (!active || element === null) return;
    const root = document.documentElement.style;
    const follow = (): void => {
      root.scrollPaddingTop = `${element.getBoundingClientRect().height}px`;
    };
    follow();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(follow) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.removeProperty("scroll-padding-top");
    };
  }, [target, active]);
}
