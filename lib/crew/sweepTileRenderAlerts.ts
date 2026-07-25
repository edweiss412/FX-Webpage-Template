import { resolveTileAlertsForObserver } from "@/lib/adminAlerts/resolveTileAlertsForObserver";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { cleanTileIds, type TileRenderLedger } from "@/lib/crew/tileRenderLedger";
import { log } from "@/lib/log";

export type SweepTileRenderAlertsArgs = {
  showId: string | null;
  sheetName: string | null;
  /** A crew member id, or "admin" for a plain-admin render. */
  viewerKey: string;
};

/**
 * Post-response reconcile for TILE_SERVER_RENDER_FAILED.
 *
 * Pure with respect to the request: takes the ledger as a parameter so it is
 * testable without an RSC scope. Raise-before-resolve, so a tile raised here is
 * by construction absent from the clean set and cannot be cleared by step 2.
 *
 * Best-effort by contract: a failure here must never affect the crew render, so
 * each half is fail-quiet with its own forensic log code.
 */
export async function sweepTileRenderAlerts(
  ledger: TileRenderLedger,
  args: SweepTileRenderAlertsArgs,
): Promise<void> {
  for (const [tileId, failure] of ledger.failed) {
    const { message, error } = failure;
    // Durable evidence FIRST, and awaited. `lib/log` persists to app_events
    // asynchronously; WrappedSection is synchronous and could not retain that
    // promise, so a freeze there could leave a resolved alert with no record.
    // This runs inside after(), so it CAN await, which is what makes the
    // "a wrong resolve costs a nudge, not evidence" bound actually true.
    try {
      await log.error("crew tile render threw", {
        source: "crew.tileSweep",
        code: "CREW_TILE_RENDER_THREW",
        tileId,
        showId: args.showId,
        viewerKey: args.viewerKey,
        // The Error itself, not just its message: the logger serializes name +
        // stack from this, which is the throwing callsite a crash catcher exists
        // to preserve.
        error,
      });
    } catch {
      // logging must never break the sweep
    }

    try {
      await upsertAdminAlert({
        showId: args.showId,
        code: "TILE_SERVER_RENDER_FAILED",
        context: {
          tileId,
          message,
          sheet_name: args.sheetName,
          viewerKey: args.viewerKey,
        },
      });
    } catch (e) {
      // AWAITED, not voided. log.warn persists to app_events, and this callback
      // runs inside after(); voiding it lets the runtime settle before the
      // persist lands, dropping the forensic record of a sweep failure - the
      // exact case moving to after() exists to protect.
      try {
        await log.warn("tile render alert upsert failed (fail-quiet)", {
          source: "crew.tileSweep",
          code: "CREW_TILE_ALERT_UPSERT_FAILED",
          tileId,
          error: e,
        });
      } catch {
        // logging must never break the sweep
      }
    }
  }

  try {
    await resolveTileAlertsForObserver({
      showId: args.showId,
      viewerKey: args.viewerKey,
      tileIds: cleanTileIds(ledger),
    });
  } catch (e) {
    try {
      await log.warn("tile render alert resolve failed (fail-quiet)", {
        source: "crew.tileSweep",
        code: "CREW_TILE_ALERT_RESOLVE_FAILED",
        error: e,
      });
    } catch {
      // logging must never break the sweep
    }
  }
}
