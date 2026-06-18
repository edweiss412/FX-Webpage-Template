/**
 * app/show/[slug]/[shareToken]/_CrewShell.tsx (MINIMAL — Task 8)
 *
 * The crew-page section shell. THIS IS THE MINIMAL SEED: it owns the
 * projection-fetch observability alert (Task 8) and the active-section
 * resolution, and renders an empty placeholder. Task 11 EXTENDS it with the
 * Header / sub-nav / per-section body / Footer and wraps resolveViewerContext
 * in the fail-closed MalformedProjectionError try/catch (see _ShowBody.tsx).
 * Do NOT build that body here.
 *
 * Producer contract (Task 8 / R5-HIGH-1 / R3-HIGH-1 / R7-HIGH):
 *   When the projection carries one or more tileErrors (per-domain sub-query
 *   failures recorded by getShowForViewer), the shell fires ONE best-effort
 *   admin_alerts write with code TILE_PROJECTION_FETCH_FAILED. The per-domain
 *   detail lives in context.failedKeys (sorted, rendered separately by the
 *   admin PerShowAlertSection); the message itself is a viewer-independent
 *   CONSTANT so the alert is dedupe-stable and carries no viewer/version
 *   identifiers. The write uses the showId PROP (ShowRow has no id field).
 */
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { resolveActiveSection } from "@/lib/crew/resolveActiveSection";
import { financialsVisible } from "@/lib/visibility/scopeTiles";
import { resolveViewerContext } from "@/lib/data/viewerContext";
import type { ShowForViewer, Viewer } from "@/lib/data/getShowForViewer";

export type CrewShellProps = {
  data: ShowForViewer;
  viewer: Viewer;
  showId: string;
  rawSection: string | undefined;
  slug?: string;
  shareToken?: string;
  identityChip?: {
    name: string;
    role: string;
    shareToken: string;
  } | null;
};

// R3-HIGH-1: viewer-independent CONSTANT message — the per-domain detail lives
// in context.failedKeys. Keeping the message constant makes the alert
// dedupe-stable (the upsert keys on show_id + code) and carries no
// viewer/version identifiers.
const PROJECTION_ALERT_MESSAGE =
  "One or more crew-page data sources failed to load; the affected domains are listed in the alert detail.";

export async function CrewShell({ data, viewer, showId, rawSection }: CrewShellProps) {
  const failedKeys = Object.keys(data.tileErrors).sort();
  if (failedKeys.length > 0) {
    try {
      // not-subject-to-meta: best-effort observability write, fail-quiet
      await upsertAdminAlert({
        showId, // R7-HIGH: the showId PROP, never data.show.id (ShowRow has no id)
        code: "TILE_PROJECTION_FETCH_FAILED",
        context: {
          sheet_name: data.show.title,
          tileId: "crew:projection-alert",
          message: PROJECTION_ALERT_MESSAGE,
          failedKeys,
        },
      });
    } catch (e) {
      console.warn("[CrewShell] projection-alert upsert failed (fail-quiet):", e);
    }
  }

  const ctx = resolveViewerContext(viewer, data); // Task 11 wraps in the fail-closed try/catch
  const activeSection = resolveActiveSection(rawSection, {
    budgetVisible: financialsVisible(ctx.viewerFlags, ctx.isAdmin),
  });

  return <div data-testid="crew-shell" data-active-section={activeSection} />; // Task 11 fills the body
}
