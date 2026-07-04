import { Activity, Inbox, LayoutGrid, Settings } from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
  id: "dashboard" | "attention" | "settings" | "observability";
  label: string;
  short: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  /** Excluded from the desktop top bar (spec D-2: desktop nav unchanged). */
  mobileOnly?: true;
  /** Excluded from the mobile bottom tab bar (desktop-nav destination). */
  desktopOnly?: true;
  /**
   * developer-tier Task 15 (spec §6 row 8): visible ONLY to developers. A
   * non-developer admin never sees this destination in either nav (AdminNav
   * filters it out when `viewerIsDeveloper` is false).
   */
  developerOnly?: true;
};

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", href: "/admin", Icon: LayoutGrid },
  {
    id: "attention",
    label: "Needs attention",
    short: "Attention",
    href: "/admin/needs-attention",
    Icon: Inbox,
    mobileOnly: true,
  },
  // Ignored sheets are no longer a top-level nav destination. They live in a
  // collapsed-by-default disclosure table BELOW the dashboard's main shows table
  // (components/admin/IgnoredSheetsDisclosure), reachable from /admin directly.
  { id: "settings", label: "Settings", short: "Settings", href: "/admin/settings", Icon: Settings },
  // Observability "Activity" — the app-event log + cron-health diagnostics page.
  // A DESKTOP-nav destination only (desktopOnly): it never appears in the mobile
  // bottom tab bar (which stays at 5 items → no overflow "More"). Mobile reaches
  // it via the Settings-page link.
  {
    id: "observability",
    label: "Activity",
    short: "Activity",
    href: "/admin/observability",
    Icon: Activity,
    desktopOnly: true,
    // developer-tier Task 15 (spec §6 row 8): Activity/observability is a
    // developer-only surface — hidden from normal admins in the nav.
    developerOnly: true,
  },
];

export const NAV_BREAKPOINT_PX = 720;
export const OVERFLOW_THRESHOLD = 5;

export function shouldRenderOverflow(destinationCount: number): boolean {
  return destinationCount > OVERFLOW_THRESHOLD;
}

// Settings owns /admin/settings*; Attention owns /admin/needs-attention*;
// Dashboard owns /admin and everything else under /admin (incl. /admin/show/*
// and the former /admin/ignored-sheets, now a dashboard disclosure).
export function isNavItemActive(id: NavItem["id"], pathname: string): boolean {
  const inSettings = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");
  const inAttention =
    pathname === "/admin/needs-attention" || pathname.startsWith("/admin/needs-attention/");
  const inObservability =
    pathname === "/admin/observability" || pathname.startsWith("/admin/observability/");
  if (id === "settings") return inSettings;
  if (id === "attention") return inAttention;
  if (id === "observability") return inObservability;
  return !inSettings && !inAttention && !inObservability;
}
