"use client";

/**
 * components/admin/PreviewBannerHeight.tsx: publishes the admin preview banner's
 * height as `--preview-banner-h` on <html> (crew page redesign invariant-8 audit
 * P1-3, critique F3).
 *
 * The banner is sticky at the top of the preview route, and from 1024px the
 * crew header under it is sticky too. Both sat at top 0, so once the page
 * scrolled the banner covered the header's title, search field and theme
 * switch. The header sticks at `--crew-sticky-top`, which reads this property
 * (app/globals.css), as do the wide nav's offset through `--crew-header-bottom`,
 * and every scroll margin and the page's scroll padding through
 * `--crew-scroll-clearance`, at every width (the banner sticks on phones too).
 *
 * The height is measured, not a token: the banner wraps onto more lines at
 * narrow widths and with a long name. It follows every resize, and the property
 * leaves <html> with the banner, so a client navigation out of the preview
 * carries no stale offset to the crew route.
 *
 * Renders an empty, hidden marker inside the banner and reads the banner from
 * it, so the banner itself stays a Server Component.
 */
import { useEffect, useRef } from "react";

const PROPERTY = "--preview-banner-h";

export function PreviewBannerHeight({ bannerTestId }: { bannerTestId: string }) {
  const markerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const banner = markerRef.current?.closest<HTMLElement>(`[data-testid="${bannerTestId}"]`);
    if (!banner) return;
    const root = document.documentElement;
    const publish = () => {
      root.style.setProperty(PROPERTY, `${banner.getBoundingClientRect().height}px`);
    };
    publish();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(publish) : null;
    observer?.observe(banner);
    return () => {
      observer?.disconnect();
      root.style.removeProperty(PROPERTY);
    };
  }, [bannerTestId]);

  return <span ref={markerRef} hidden />;
}
