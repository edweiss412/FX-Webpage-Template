import { LayoutGrid, Settings } from "lucide-react";
import type { ComponentType } from "react";

export type NavItem = { id: "dashboard" | "settings"; label: string; short: string; href: string; Icon: ComponentType<{ className?: string }> };

export const NAV: NavItem[] = [
  { id: "dashboard", label: "Dashboard", short: "Home", href: "/admin", Icon: LayoutGrid },
  { id: "settings", label: "Settings", short: "Settings", href: "/admin/settings", Icon: Settings },
];

export const NAV_BREAKPOINT_PX = 720;
export const OVERFLOW_THRESHOLD = 5;

export function shouldRenderOverflow(destinationCount: number): boolean {
  return destinationCount > OVERFLOW_THRESHOLD;
}

// Settings owns /admin/settings*; Dashboard owns /admin and everything else under /admin
// (incl. /admin/show/*) so a show-detail route keeps Dashboard active (app.jsx:92,114,141).
export function isNavItemActive(id: NavItem["id"], pathname: string): boolean {
  const inSettings = pathname === "/admin/settings" || pathname.startsWith("/admin/settings/");
  return id === "settings" ? inSettings : !inSettings;
}
