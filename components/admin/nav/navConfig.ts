import { EyeOff, Inbox, LayoutGrid, Settings } from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = {
  id: "dashboard" | "attention" | "unpublished" | "settings";
  label: string;
  short: string;
  href: string;
  Icon: ComponentType<{ className?: string }>;
  /** Excluded from the desktop top bar (spec D-2: desktop nav unchanged). */
  mobileOnly?: true;
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
  // Task E1 (spec §5) — the Held-shows view. A first-class top-nav destination
  // (NOT a dashboard segment) so it never drifts the active/archived counts.
  {
    id: "unpublished",
    label: "Unpublished",
    short: "Held",
    href: "/admin/unpublished",
    Icon: EyeOff,
  },
  { id: "settings", label: "Settings", short: "Settings", href: "/admin/settings", Icon: Settings },
];

export const NAV_BREAKPOINT_PX = 720;
export const OVERFLOW_THRESHOLD = 5;

export function shouldRenderOverflow(destinationCount: number): boolean {
  return destinationCount > OVERFLOW_THRESHOLD;
}

// Settings owns /admin/settings*; Attention owns /admin/needs-attention*;
// Unpublished owns /admin/unpublished*; Dashboard owns /admin and everything
// else under /admin (incl. /admin/show/*).
export function isNavItemActive(id: NavItem["id"], pathname: string): boolean {
  const inSettings = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");
  const inAttention =
    pathname === "/admin/needs-attention" || pathname.startsWith("/admin/needs-attention/");
  const inUnpublished =
    pathname === "/admin/unpublished" || pathname.startsWith("/admin/unpublished/");
  if (id === "settings") return inSettings;
  if (id === "attention") return inAttention;
  if (id === "unpublished") return inUnpublished;
  return !inSettings && !inAttention && !inUnpublished;
}
