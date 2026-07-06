"use client";
/**
 * components/admin/nav/NotifBell.tsx (bell notification center Task 13, spec §7.1)
 *
 * The admin-nav bell. Badge freshness comes from `useBellBadge` (four commit
 * sources — initial prop, prop change, pathname, realtime; spec §4/§5). The
 * button now OPENS the `BellPanel` overlay instead of linking to `/admin#alerts`
 * (the banner + `#alerts` anchor retire together, spec §8).
 *
 * The badge/degraded testids + a11y contract are preserved from the prior Link
 * implementation: `admin-notif-bell` / `admin-notif-badge` /
 * `admin-notif-bell-degraded`, the `9+` display cap, badge hidden at 0, and the
 * degraded `!` chip carrying `ADMIN_ALERT_COUNT_FAILED`'s dougFacing label. Both
 * branches are now `<button aria-haspopup="dialog" aria-expanded>` — the
 * degraded bell stays openable (spec §12: the feed route is authoritative once
 * the panel is open, so a degraded count never blocks the panel).
 */
import { useState } from "react";
import { Bell } from "lucide-react";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { BellCountResult } from "@/lib/admin/bellFeed";
import { BellPanel } from "@/components/admin/BellPanel";
import { useBellBadge } from "./useBellBadge";

export function NotifBell({
  initialCount,
  viewerIsDeveloper,
}: {
  initialCount: BellCountResult;
  viewerIsDeveloper: boolean;
}) {
  const { count, degraded, refetch, pingSignal } = useBellBadge(initialCount);
  const [open, setOpen] = useState(false);

  const trigger = degraded ? (
    <button
      type="button"
      data-testid="admin-notif-bell-degraded"
      aria-label={getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED")}
      title={getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className="relative inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm text-warning-text hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <Bell className="size-5" aria-hidden="true" />
      <span
        aria-hidden="true"
        className="absolute -right-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-pill bg-warning-bg text-xs font-semibold text-warning-text"
      >
        !
      </span>
    </button>
  ) : (
    <button
      type="button"
      data-testid="admin-notif-bell"
      aria-label={
        typeof count === "number" && count > 0
          ? `${count} unresolved alerts`
          : "No unresolved alerts"
      }
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={() => setOpen(true)}
      className="relative inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm text-text-subtle hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <Bell className="size-5" aria-hidden="true" />
      {typeof count === "number" && count > 0 ? (
        <span
          data-testid="admin-notif-badge"
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-xs font-semibold tabular-nums text-accent-text"
        >
          {count > 9 ? "9+" : String(count)}
        </span>
      ) : null}
    </button>
  );

  return (
    <>
      {trigger}
      {open ? (
        <BellPanel
          viewerIsDeveloper={viewerIsDeveloper}
          onClose={() => setOpen(false)}
          onOpened={refetch}
          pingSignal={pingSignal}
        />
      ) : null}
    </>
  );
}
