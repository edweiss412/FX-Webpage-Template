"use client";
/**
 * components/admin/AppHealthPanelAction.tsx (alert-audience-split §6.5)
 *
 * The interactive affordance in the dashboard `AppHealthPanel` active-state row.
 * Presentation split mirrors `AppHealthIndicator` (§6.3), but as a text control
 * rather than the nav dot:
 *   - developer → a "View details →" deep-link to the uncapped
 *     `HealthAlertsPanel` on /admin/dev/telemetry#health;
 *   - Doug (`isDeveloper === false`) → a button that opens the same
 *     plain-language `AppHealthPopover`.
 * `isDeveloper` drives ONLY presentation, never access (rows are admin-gated).
 * Rendered from the server `AppHealthPanel`, so it carries the client boundary.
 */
import { useState } from "react";
import Link from "next/link";

import type { HealthStatus } from "@/lib/admin/healthRollup";
import { AppHealthPopover } from "@/components/admin/AppHealthPopover";

const LINK_CLASS =
  "inline-flex min-h-tap-min items-center rounded-sm px-1 text-sm font-medium text-text-strong underline underline-offset-2 transition-colors duration-fast hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

export function AppHealthPanelAction({
  rollup,
  isDeveloper,
}: {
  rollup: HealthStatus;
  isDeveloper: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (isDeveloper) {
    return (
      <Link
        href="/admin/dev/telemetry#health"
        data-testid="app-health-panel-details"
        className={LINK_CLASS}
      >
        View details →
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        data-testid="app-health-panel-details"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={LINK_CLASS}
      >
        View details
      </button>
      {open ? <AppHealthPopover rollup={rollup} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
