"use client";

/**
 * components/admin/PreviewBannerHeight.tsx: publishes the admin preview banner's
 * height as `--preview-banner-h`, and its bottom edge in the viewport as
 * `--preview-banner-bottom`, on <html> (crew page redesign invariant-8 audit
 * P1-3, critique F3; whole-diff review round 2, 2A-1).
 *
 * The banner is sticky at the top of the preview route, and from 1024px the
 * crew header under it is sticky too. Both sat at top 0, so once the page
 * scrolled the banner covered the header's title, search field and theme
 * switch. The header sticks at `--crew-sticky-top`, which reads the height
 * (app/globals.css), as do the wide nav's offset through `--crew-header-bottom`,
 * and every scroll margin and the page's scroll padding through
 * `--crew-scroll-clearance`, at every width (the banner sticks on phones too).
 *
 * The compact section sheet is fixed to the viewport and stacks under the
 * banner, so its height cap reads the bottom edge instead, through
 * `--crew-sheet-clearance`: at the top of the page the admin nav sits above the
 * banner, so the edge is lower than the height, and it rises to the height once
 * the page has scrolled the nav away. It follows the scroll, at most once a
 * frame and written only when it moved (it stops moving once the banner sticks).
 *
 * Both are measured, not tokens: the banner wraps onto more lines at narrow
 * widths and with a long name. They follow every resize, and the properties
 * leave <html> with the banner, so a client navigation out of the preview
 * carries no stale offset to the crew route.
 *
 * Renders an empty, hidden marker inside the banner and reads the banner from
 * it, so the banner itself stays a Server Component.
 */
import { useEffect, useRef } from "react";

const HEIGHT = "--preview-banner-h";
const BOTTOM = "--preview-banner-bottom";

export function PreviewBannerHeight({ bannerTestId }: { bannerTestId: string }) {
  const markerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const banner = markerRef.current?.closest<HTMLElement>(`[data-testid="${bannerTestId}"]`);
    if (!banner) return;
    const root = document.documentElement;
    const written: Record<string, string> = {};
    const write = (property: string, value: string) => {
      if (written[property] === value) return;
      written[property] = value;
      root.style.setProperty(property, value);
    };
    let frame: number | null = null;
    const publish = () => {
      frame = null;
      const rect = banner.getBoundingClientRect();
      write(HEIGHT, `${rect.height}px`);
      write(BOTTOM, `${Math.max(0, rect.bottom)}px`);
    };
    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(publish);
    };
    publish();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null;
    observer?.observe(banner);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      observer?.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
      root.style.removeProperty(HEIGHT);
      root.style.removeProperty(BOTTOM);
    };
  }, [bannerTestId]);

  return <span ref={markerRef} hidden />;
}
