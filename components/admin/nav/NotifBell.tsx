import Link from "next/link";
import { Bell } from "lucide-react";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { AlertCountResult } from "@/lib/admin/alertCount";

export function NotifBell({ alertCount }: { alertCount: AlertCountResult }) {
  if (alertCount.kind === "infra_error") {
    const label = getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED"); // string (non-null); see Task 0.7
    return (
      <Link
        href="/admin#alerts"
        data-testid="admin-notif-bell-degraded"
        aria-label={label}
        title={label}
        className="relative inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm text-warning-text hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        <Bell className="size-5" aria-hidden="true" />
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 inline-flex size-4 items-center justify-center rounded-pill bg-warning-bg text-xs font-semibold text-warning-text"
        >
          !
        </span>
      </Link>
    );
  }
  const count = alertCount.count;
  const display = count > 9 ? "9+" : String(count);
  return (
    <Link
      href="/admin#alerts"
      data-testid="admin-notif-bell"
      aria-label={count > 0 ? `${count} unresolved alerts` : "No unresolved alerts"}
      className="relative inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm text-text-subtle hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <Bell className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span
          data-testid="admin-notif-badge"
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-xs font-semibold tabular-nums text-accent-text"
        >
          {display}
        </span>
      )}
    </Link>
  );
}
