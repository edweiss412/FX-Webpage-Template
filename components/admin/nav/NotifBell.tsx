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
import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { BellCountResult } from "@/lib/admin/bellFeed";
import { BellPanel } from "@/components/admin/BellPanel";
import { useBellBadge } from "./useBellBadge";
import { bellAccessibleName, bellAnnounceableCount } from "./navArrivalAnnounce";

export function NotifBell({
  initialCount = null,
  countPromise = null,
  onBellState,
  viewerIsDeveloper,
}: {
  /**
   * Synchronous first-paint count, or `null` for the PENDING shape — the bell
   * button renders in its normal branch with no chip and NOT degraded, because
   * "count unknown" is neither zero nor a failed read (admin-nav-badge-streaming
   * §3.2). Callers holding a resolved result still pass it.
   */
  initialCount?: BellCountResult | null;
  /** §3.2: the layout's un-awaited read; the hook commits it on arrival. */
  countPromise?: Promise<BellCountResult> | null;
  /**
   * nav-badge-arrival-announce §3.2: report `{settled, announceable}` to the
   * parent whenever that tuple changes. NOT once-only — a report frozen at
   * first settle goes stale for the same reason the promise does, and the
   * parent reads the value live at announce time.
   *
   * Optional: the four existing call sites pass nothing and are unaffected.
   */
  onBellState?: (state: { settled: boolean; announceable: number | null }) => void;
  viewerIsDeveloper: boolean;
}) {
  const { count, degraded, refetch, zeroNow, pingSignal } = useBellBadge(
    initialCount,
    countPromise,
  );
  const [open, setOpen] = useState(false);

  // The bell has settled once it holds a number, or is degraded, or nothing
  // will ever arrive (neither input supplied). What it would ANNOUNCE is the
  // same selector the accessible name below reads, so the sentence and the name
  // cannot drift (§3.3).
  const settled =
    typeof count === "number" || degraded || (initialCount === null && countPromise === null);
  const announceable = bellAnnounceableCount(count, degraded);

  const lastReport = useRef<string | null>(null);
  useEffect(() => {
    if (!onBellState) return;
    const key = `${settled}:${announceable}`;
    if (lastReport.current === key) return;
    lastReport.current = key;
    onBellState({ settled, announceable });
  }, [onBellState, settled, announceable]);

  // Open gesture: zero the badge immediately client-side (spec §7.2 — a quick
  // open/close on a slow network must not leave a stale count visible), then
  // mount the panel. The panel's onOpened={refetch} restores post-snapshot
  // arrivals once /bell/feed → /bell/open settle to server truth.
  const openPanel = () => {
    zeroNow();
    setOpen(true);
  };

  const trigger = degraded ? (
    <button
      type="button"
      data-testid="admin-notif-bell-degraded"
      aria-label={getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED")}
      title={getRequiredDougFacing("ADMIN_ALERT_COUNT_FAILED")}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={openPanel}
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
      aria-label={bellAccessibleName(count, degraded)}
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={openPanel}
      className="relative inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm text-text hover:bg-surface-raised hover:text-text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
    >
      <Bell className="size-5" aria-hidden="true" />
      {typeof count === "number" && count > 0 ? (
        <span
          data-testid="admin-notif-badge"
          className="absolute -right-0.5 -top-0.5 inline-flex min-w-4 items-center justify-center rounded-pill bg-badge-count px-1 text-xs font-semibold tabular-nums text-badge-count-text"
        >
          {count > 9 ? "9+" : String(count)}
        </span>
      ) : null}
    </button>
  );

  // Fragment (NOT a wrapper div): the trigger stays a DIRECT child of the
  // AdminNav action cluster so it remains a sibling of <AppHealthIndicator>
  // (the "indicator beside bell" DOM contract in AdminNav.test). The desktop
  // dropdown's positioning context is the cluster's own `relative`
  // (AdminNav.tsx); on mobile BellPanel is a `fixed` bottom sheet, so no
  // positioned ancestor is needed there.
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
