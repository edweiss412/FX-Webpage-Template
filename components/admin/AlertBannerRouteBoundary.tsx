"use client";
/**
 * components/admin/AlertBannerRouteBoundary.tsx (M12.2 RECON-1, spec §3.2)
 *
 * Remount boundary for the admin AlertBanner. The banner lives in the
 * PERSISTENT app/admin/layout.tsx, which Next.js does NOT remount on
 * client-side navigation. Native <details open> is browser-owned state, so
 * without a remount it would persist across alert changes (F9) and route /
 * query changes (F17/F19). Keying the subtree by pathname + search + alertId
 * forces React to unmount/mount a fresh collapsed <details> on any of those.
 *
 * Children are the SERVER-rendered banner, passed through opaquely — no copy
 * or message codes cross into this client component (only the alertId scalar).
 * No-JS: every navigation is a full document load that already renders
 * collapsed, so this boundary only matters under client-side nav.
 */
import { Fragment, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export function AlertBannerRouteBoundary({
  alertId,
  children,
}: {
  alertId: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const routeKey = `${pathname}?${search}:${alertId}`;
  // `data-banner-route-key` mirrors the key for tests (the React `key` itself
  // is not observable in the DOM). The keyed Fragment is the remount unit.
  return (
    <Fragment key={routeKey}>
      <div data-banner-route-key={routeKey} hidden />
      {children}
    </Fragment>
  );
}
