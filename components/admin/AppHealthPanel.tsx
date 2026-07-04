/**
 * components/admin/AppHealthPanel.tsx (alert-audience-split §6.5)
 *
 * The ambient app-health strip on the `/admin` dashboard, rendered below
 * `AlertBanner`. Health-audience `admin_alerts` no longer surface on Doug's
 * amber banner/bell/per-show; this panel (plus the nav `AppHealthIndicator`) is
 * where they escalate, so "nothing goes dark."
 *
 * A layout cannot pass props into page `children` (spec §5.1, R5 finding 2), so
 * this panel does its OWN pinned `fetchHealthRollup()` read (a second bounded,
 * exact rollup through the one helper — both reads pinned by _metaInfraContract)
 * and resolves `isCurrentUserDeveloper()` for the presentation split.
 *
 * States (§6.5):
 *   - ok → a quiet "All systems normal" StatusIndicator (positive hue). This
 *     surface is ALLOWED to show the healthy state explicitly (unlike the
 *     banner, which is invisible when clean) — it is the ambient health read.
 *   - notice/degraded → the worst-active label + the exact count, paired with a
 *     colored dot (amber notice / red degraded), plus the `AppHealthPanelAction`
 *     (developer "View details →" deep-link / Doug popover trigger).
 *   - infra_error → a quiet "status unknown" idle row (never a raw error code,
 *     invariant 5).
 *
 * Async Server Component (no 'use client'). Tokens only (DESIGN.md §10).
 */
import { fetchHealthRollup } from "@/lib/admin/healthRollup";
import { isCurrentUserDeveloper } from "@/lib/auth/requireDeveloper";
import { StatusIndicator } from "@/components/admin/StatusIndicator";
import { AppHealthPanelAction } from "@/components/admin/AppHealthPanelAction";

// Literal class strings (never template-constructed) so Tailwind v4's content
// scan emits each utility into the built CSS. Mirrors AppHealthIndicator's map.
const ACTIVE_DOT_BG: Record<"notice" | "degraded", string> = {
  degraded: "bg-status-degraded",
  notice: "bg-status-warn",
};

const PANEL_CLASS =
  "flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-4 py-3";

export async function AppHealthPanel() {
  const [rollup, isDeveloper] = await Promise.all([fetchHealthRollup(), isCurrentUserDeveloper()]);

  if (rollup.kind === "ok") {
    return (
      <section data-testid="app-health-panel" aria-label="System health" className={PANEL_CLASS}>
        <StatusIndicator status="positive" label="All systems normal" />
      </section>
    );
  }

  if (rollup.kind === "infra_error") {
    return (
      <section data-testid="app-health-panel" aria-label="System health" className={PANEL_CLASS}>
        <StatusIndicator status="idle" label="System health status unknown" />
      </section>
    );
  }

  const { kind, count } = rollup;
  const itemLine = `${count} background item${count === 1 ? "" : "s"} need${count === 1 ? "s" : ""} attention`;

  return (
    <section data-testid="app-health-panel" aria-label="System health" className={PANEL_CLASS}>
      <div className="flex items-center gap-3">
        <span
          data-testid={`app-health-dot-${kind}`}
          aria-hidden="true"
          className={`relative inline-block size-2 shrink-0 rounded-full ${ACTIVE_DOT_BG[kind]}`}
        />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-text-strong">
            System health: needs attention
          </span>
          <span className="text-sm text-text-subtle">{itemLine}</span>
        </div>
      </div>
      <AppHealthPanelAction rollup={rollup} isDeveloper={isDeveloper} />
    </section>
  );
}
