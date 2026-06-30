/**
 * components/shared/TileServerFallback.tsx — async Server Component
 * wrapper that runs a per-tile data loader INSIDE a try/catch so a
 * single tile's load/render failure shows a fallback while the rest
 * of the page renders normally. Spec §12.1 / AC-9.3 / Task 9.2.
 *
 * Critical contract: the `render` callback is INVOKED inside the
 * try/catch — but the JSX it RETURNS may contain function components
 * whose bodies React invokes LATER (outside this try/catch). To
 * actually catch synchronous View-body throws, `render` MUST INVOKE
 * the View as a function call: `render: (data) => View(data)`, NOT
 * `render: (data) => <View {...data} />`. The JSX-element form
 * defers the function call to React's renderer; the direct-call form
 * runs the body NOW and lets throws bubble to this wrapper.
 *
 * <WrappedTile> already enforces this pattern. Direct callers of
 * <TileServerFallback> must follow the same rule.
 *
 * The View component MUST be pure (no `await`, no DB calls, no
 * throwing helpers) so the direct invocation is safe. All throwing
 * work (DB queries, Drive calls, heavy derivation that can throw)
 * MUST live in `load`.
 *
 * The "pure-render compliance" static-analysis test (Task 9.2 Step 1c)
 * enforces this on every `*TileView.tsx` in the components/tiles tree.
 *
 * On error: logs to stderr with surface metadata + UPSERTs an
 * `admin_alerts` row with code `TILE_SERVER_RENDER_FAILED` so the
 * dashboard surfaces persistent tile failures (AGENTS.md §1.9
 * Supabase-call-boundary discipline applies — the upsert is best-effort
 * and its failure must NOT mask the original tile render failure).
 *
 * Server Component (no `'use client'`).
 */
import type { ReactElement } from "react";

import { TileErrorFallback } from "./TileErrorFallback";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";
import { log } from "@/lib/log";

type TileServerFallbackProps<T> = {
  /** Async data loader. Runs INSIDE try/catch. May throw. */
  load: () => Promise<T>;
  /** Pure render function. INVOKED inside try/catch; MUST NOT call throwing helpers. */
  render: (data: T) => ReactElement;
  /** React element rendered on throw. Defaults to <TileErrorFallback />. */
  fallback?: ReactElement;
  /**
   * Identifier passed to the admin_alerts upsert so the dashboard can
   * tell tiles apart. Recommended: kebab-case tile name (e.g., "lodging-tile").
   */
  tileId: string;
  /** Show id for the admin_alerts row's `show_id`. Optional for global tiles. */
  showId?: string | null;
  /**
   * Optional show title (sheet name). Stamped into admin_alerts.context
   * so AlertBanner can interpolate the §12.4 catalog placeholder
   * `<sheet-name>` in `TILE_SERVER_RENDER_FAILED.dougFacing` and render
   * Doug the specific show that failed.
   */
  sheetName?: string | null;
};

export async function TileServerFallback<T>({
  load,
  render,
  fallback,
  tileId,
  showId,
  sheetName,
}: TileServerFallbackProps<T>): Promise<ReactElement> {
  try {
    const data = await load();
    return render(data);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    log.error("render threw", {
      source: "crew.tileServerFallback",
      tileId,
      ...(showId !== undefined ? { showId } : {}),
      error: err,
    });
    // Best-effort admin_alerts upsert. Its failure must NOT mask the
    // original render failure — swallow so the fallback still renders.
    try {
      await upsertAdminAlert({
        showId: showId ?? null,
        code: "TILE_SERVER_RENDER_FAILED",
        context: {
          tileId,
          message: err.message,
          // sheet_name supplies the `<sheet-name>` placeholder in
          // TILE_SERVER_RENDER_FAILED.dougFacing so AlertBanner renders
          // the specific show that failed instead of a literal token.
          sheet_name: sheetName ?? null,
        },
      });
    } catch (alertErr) {
      log.error("admin_alerts upsert failed", {
        source: "crew.tileServerFallback",
        tileId,
        error: alertErr,
      });
    }
    return fallback ?? <TileErrorFallback />;
  }
}
