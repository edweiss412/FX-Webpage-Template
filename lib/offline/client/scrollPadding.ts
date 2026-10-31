"use client";

import { useEffect, type RefObject } from "react";

/** The property the bar's height is published under, on `<html>`. */
export const BAR_HEIGHT_PROPERTY = "--saved-copy-bar-h";

/**
 * lib/offline/client/scrollPadding.ts
 *
 * Keeps `--saved-copy-bar-h` on `<html>` equal to the saved-copy bar's height
 * while `active`. The crew layout adds it into `--crew-sticky-bottom`, the
 * bottom edge of everything that sticks (app/globals.css), and from there into
 * the page's `scroll-padding-top` and every section's scroll margin
 * (`--crew-scroll-clearance`) and the wide nav's sticky offset. A browser
 * scrolling an element into view (keyboard focus, `scrollIntoView`, a
 * fragment) keeps it inside the scrollport minus that padding, so a control
 * focused from the keyboard lands below the sticky bar instead of behind it
 * (WCAG 2.4.11, Focus Not Obscured), and below the sticky header above the bar
 * from 1024px. The bar's share is a property rather than the padding itself
 * because the padding has other terms (the header, the focus ring's reach)
 * that the layout owns.
 *
 * The height follows the element through a ResizeObserver, because the saved-
 * copy bar's height changes with its copy and with the width. Where the
 * observer is missing the first height holds until the next activation. The
 * property is removed when `active` turns false and when the component
 * unmounts, so nothing offsets the page's scrolling once the element is gone.
 */
export function useBarHeightProperty(target: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    const element = target.current;
    if (!active || element === null) return;
    const root = document.documentElement.style;
    const follow = (): void => {
      root.setProperty(BAR_HEIGHT_PROPERTY, `${element.getBoundingClientRect().height}px`);
    };
    follow();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(follow) : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.removeProperty(BAR_HEIGHT_PROPERTY);
    };
  }, [target, active]);
}
