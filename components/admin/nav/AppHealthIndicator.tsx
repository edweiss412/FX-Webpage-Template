"use client";
/**
 * components/admin/nav/AppHealthIndicator.tsx (alert-audience-split §6.3)
 *
 * The escalating app-health dot rendered beside `NotifBell` in the admin nav
 * (and onboarding chrome). Health-audience admin_alerts no longer surface on
 * Doug's amber banner/bell/per-show; this indicator is where they escalate, so
 * "nothing goes dark."
 *
 * Color+label pairing (never color-only — the color-blind floor, cf.
 * StatusIndicator): the dot's hue is ALWAYS paired with an `aria-label`/`title`
 * naming the state.
 *   degraded → bg-status-degraded (red; DESIGN.md §1.1/§1.2 token) · notice → bg-status-warn
 *   (amber) · ok → bg-status-positive (green) · infra_error → bg-status-idle
 *   (neutral "status unknown").
 *
 * Presentation split (§6.3): Doug (`isDeveloper === false`) gets a <button>
 * that opens the plain-language `AppHealthPopover`; the developer gets a
 * <Link href="/admin/dev/telemetry#health"> deep-link to the uncapped
 * `HealthAlertsPanel`. `isDeveloper` drives ONLY presentation, never access
 * (rows are already admin-gated).
 *
 * Dimensional invariant (§8): the trigger is `min-h-tap-min min-w-tap-min`
 * (44×44) and shares NotifBell's exact tap-target class so both center
 * identically in the fixed-height nav bar. Transitions (§9): the dot is INSTANT
 * (recomputed server-side each render — no animation utilities, no motion
 * presence wrapper). Icon: `Activity` (lucide), distinct from NotifBell's `Bell`.
 */
import { useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";

import type { HealthStatus } from "@/lib/admin/healthRollup";
import { AppHealthPopover } from "@/components/admin/AppHealthPopover";

// Shared with NotifBell (NotifBell.tsx) — dimensional parity is the §8 contract.
const TAP_TARGET =
  "relative inline-flex min-h-tap-min min-w-tap-min items-center justify-center rounded-sm text-text-subtle hover:bg-surface-raised hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring";

// Literal class strings (never template-constructed) so Tailwind v4's content
// scan emits each utility into the built CSS.
type Kind = HealthStatus["kind"];
const DOT_BG: Record<Kind, string> = {
  degraded: "bg-status-degraded",
  notice: "bg-status-warn",
  ok: "bg-status-positive",
  infra_error: "bg-status-idle",
};
const LABEL: Record<Kind, string> = {
  degraded: "System health: needs attention",
  notice: "System health: needs attention",
  ok: "All systems normal",
  infra_error: "System health status unknown",
};
// infra_error gets a distinct tooltip (§6.2); others reuse the aria-label.
const TITLE: Record<Kind, string> = {
  degraded: LABEL.degraded,
  notice: LABEL.notice,
  ok: LABEL.ok,
  infra_error: "Couldn't check system health right now.",
};

function IndicatorContents({ kind }: { kind: Kind }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span
        data-testid={`app-health-dot-${kind}`}
        aria-hidden="true"
        className={`relative inline-block size-2 rounded-full ${DOT_BG[kind]}`}
      />
      <Activity className="size-5" aria-hidden="true" />
    </span>
  );
}

export function AppHealthIndicator({
  rollup,
  isDeveloper,
}: {
  rollup: HealthStatus;
  isDeveloper: boolean;
}) {
  const [open, setOpen] = useState(false);
  const kind = rollup.kind;

  if (isDeveloper) {
    return (
      <Link
        href="/admin/dev/telemetry#health"
        data-testid="app-health-indicator"
        aria-label={LABEL[kind]}
        title={TITLE[kind]}
        className={TAP_TARGET}
      >
        <IndicatorContents kind={kind} />
      </Link>
    );
  }

  return (
    <>
      <button
        type="button"
        data-testid="app-health-indicator"
        aria-label={LABEL[kind]}
        title={TITLE[kind]}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={TAP_TARGET}
      >
        <IndicatorContents kind={kind} />
      </button>
      {open ? <AppHealthPopover rollup={rollup} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
