import { Activity, FileX, Inbox, LayoutGrid, Settings } from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
  id: "dashboard" | "attention" | "ignored-sheets" | "settings" | "observability";
  label: string;
  short: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  /** Excluded from the desktop top bar (spec D-2: desktop nav unchanged). */
  mobileOnly?: true;
  /** Excluded from the mobile bottom tab bar (desktop-nav destination). */
  desktopOnly?: true;
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
  // Task E2 (spec §6.3) — durably-ignored sheets, with a per-row un-ignore.
  // A management/recovery surface reachable on both desktop and mobile (Doug
  // works mostly on desktop). Unpublished (Held) shows are no longer a separate
  // destination — they appear in the dashboard's Active-shows list with a "Held"
  // status pill (fetchDashboardData reads archived=false, incl. unpublished).
  {
    id: "ignored-sheets",
    label: "Ignored sheets",
    short: "Ignored",
    href: "/admin/ignored-sheets",
    Icon: FileX,
  },
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
  },
];

export const NAV_BREAKPOINT_PX = 720;
export const OVERFLOW_THRESHOLD = 5;

export function shouldRenderOverflow(destinationCount: number): boolean {
  return destinationCount > OVERFLOW_THRESHOLD;
}

// Settings owns /admin/settings*; Attention owns /admin/needs-attention*;
// Dashboard owns /admin and everything else under /admin (incl. /admin/show/*).
export function isNavItemActive(id: NavItem["id"], pathname: string): boolean {
  const inSettings = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");
  const inAttention =
    pathname === "/admin/needs-attention" || pathname.startsWith("/admin/needs-attention/");
  const inIgnoredSheets =
    pathname === "/admin/ignored-sheets" || pathname.startsWith("/admin/ignored-sheets/");
  const inObservability =
    pathname === "/admin/observability" || pathname.startsWith("/admin/observability/");
  if (id === "settings") return inSettings;
  if (id === "attention") return inAttention;
  if (id === "ignored-sheets") return inIgnoredSheets;
  if (id === "observability") return inObservability;
  return !inSettings && !inAttention && !inIgnoredSheets && !inObservability;
}
