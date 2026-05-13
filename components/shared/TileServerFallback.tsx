/**
 * components/shared/TileServerFallback.tsx — async Server Component
 * wrapper that runs a per-tile data loader INSIDE a try/catch so a
 * single tile's load/render failure shows a fallback while the rest
 * of the page renders normally. Spec §12.1 / AC-9.3 / Task 9.2.
 *
 * Critical contract: the `render` callback is INVOKED inside the
 * try/catch (not just returned). React then calls the returned
 * element's component function later — outside this try/catch — so
 * the View component MUST be pure (no `await`, no DB calls, no
 * throwing helpers). All throwing work (DB queries, Drive calls,
 * heavy derivation that can throw) MUST live in `load`.
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
};

export async function TileServerFallback<T>({
  load,
  render,
  fallback,
  tileId,
  showId,
}: TileServerFallbackProps<T>): Promise<ReactElement> {
  try {
    const data = await load();
    return render(data);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(
      `[TileServerFallback] tile=${tileId} show=${showId ?? "n/a"} threw:`,
      err.message,
      err.stack,
    );
    // Best-effort admin_alerts upsert. Its failure must NOT mask the
    // original render failure — swallow so the fallback still renders.
    try {
      await upsertAdminAlert({
        showId: showId ?? null,
        code: "TILE_SERVER_RENDER_FAILED",
        context: { tileId, message: err.message },
      });
    } catch (alertErr) {
      console.error(
        `[TileServerFallback] admin_alerts upsert failed (tile=${tileId}):`,
        alertErr instanceof Error ? alertErr.message : String(alertErr),
      );
    }
    return fallback ?? <TileErrorFallback />;
  }
}
