"use client";

/**
 * components/admin/nav/AdminNav.tsx (M12.2 B1 Task 3.4)
 *
 * The admin shell chrome: a responsive top bar (brand + inline nav on
 * desktop, brand + actions on mobile) plus a fixed bottom tab bar on
 * mobile. Active state is derived from the live pathname via
 * isNavItemActive (navConfig), so this is a client island.
 *
 * Responsive strategy uses `min-[720px]:` arbitrary variants ONLY — no
 * global `md` breakpoint (Phase A blast-radius lesson). The inline desktop
 * nav links are `hidden min-[720px]:flex`; the bottom tab bar is
 * `min-[720px]:hidden`.
 *
 * The "More" overflow tab is reserved only when shouldRenderOverflow(NAV
 * .length) is true (false at 2 destinations → not rendered).
 *
 * Tokens only.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AlertCountResult } from "@/lib/admin/alertCount";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { NAV, isNavItemActive, shouldRenderOverflow } from "./navConfig";
import { NotifBell } from "./NotifBell";
import { useNeedsAttentionBadge } from "./useNeedsAttentionBadge";
import { UserMenu } from "./UserMenu";

export function AdminNav({
  email,
  alertCount,
  initialBadgeCount = null,
}: {
  email: string;
  alertCount: AlertCountResult;
  initialBadgeCount?: number | null;
}) {
  const pathname = usePathname();
  const badgeCount = useNeedsAttentionBadge(initialBadgeCount);
  const overflow = shouldRenderOverflow(NAV.length);

  return (
    <>
      <nav
        data-testid="admin-nav-topbar"
        aria-label="Admin"
        /* M12.8: tighter top-nav → page-header gap to MATCH the design bundle's
           .pagehead 16px top padding (was mb-section-gap 32px). */
        className="mb-4 flex items-center gap-3 border-b border-border pb-3"
      >
        <Link
          href="/admin"
          data-testid="admin-nav-brand"
          className="flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
        >
          <Image
            src="/brand/fxav-icon.png"
            alt=""
            aria-hidden
            width={28}
            height={28}
            className="size-7 shrink-0"
          />
          <span className="text-lg font-semibold tracking-tight text-text-strong">FXAV</span>
          <span className="rounded-pill border border-border bg-surface-raised px-2 text-xs font-semibold text-text-subtle">
            Admin
          </span>
        </Link>

        {/* Inline desktop nav links (hidden on mobile). mobileOnly items
            (the Needs-attention tab) are excluded — spec D-2: desktop nav
            unchanged. */}
        <div className="hidden items-center gap-1 min-[720px]:flex">
          {NAV.filter((item) => !item.mobileOnly).map((item) => {
            const active = isNavItemActive(item.id, pathname);
            return (
              <Link
                key={item.id}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-tap-min items-center gap-2 rounded-sm px-3 text-sm font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                  active
                    ? "bg-surface-raised text-text-strong"
                    : "text-text-subtle hover:bg-surface-raised hover:text-text"
                }`}
              >
                <item.Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          <NotifBell alertCount={alertCount} />
          <ThemeToggle />
          <UserMenu email={email} />
        </div>
      </nav>

      {/* Fixed mobile bottom tab bar. */}
      <nav
        data-testid="admin-bottom-tabs"
        aria-label="Admin (mobile)"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-surface min-[720px]:hidden"
      >
        {NAV.map((item) => {
          const active = isNavItemActive(item.id, pathname);
          // Badge only on the attention tab, only for a finite positive count
          // (null/0/NaN/negative → hidden; spec §4.2 guard conditions).
          const showBadge =
            item.id === "attention" &&
            typeof badgeCount === "number" &&
            Number.isFinite(badgeCount) &&
            badgeCount > 0;
          const badgeDisplay = !showBadge ? null : badgeCount > 9 ? "9+" : String(badgeCount);
          return (
            <Link
              key={item.id}
              href={item.href}
              data-testid={`admin-bottom-tab-${item.id}`}
              aria-current={active ? "page" : undefined}
              aria-label={
                item.id === "attention"
                  ? showBadge
                    ? `Needs attention, ${badgeCount} item${badgeCount === 1 ? "" : "s"}`
                    : "Needs attention"
                  : undefined
              }
              className={`flex flex-1 flex-col items-center justify-center gap-1 self-stretch py-2 text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring ${
                active ? "text-accent-on-bg" : "text-text-subtle"
              }`}
            >
              <span className="relative">
                <item.Icon className="size-5" />
                {showBadge && (
                  <span
                    data-testid="admin-attention-badge"
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-1.5 inline-flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-xs font-semibold tabular-nums text-accent-text"
                  >
                    {badgeDisplay}
                  </span>
                )}
              </span>
              <span>{item.short}</span>
            </Link>
          );
        })}
        {overflow && (
          <span
            data-testid="admin-bottom-tab-more"
            className="flex flex-1 flex-col items-center justify-center gap-1 self-stretch py-2 text-xs font-medium text-text-subtle"
          >
            More
          </span>
        )}
      </nav>
    </>
  );
}
