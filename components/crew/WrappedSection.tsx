/**
 * components/crew/WrappedSection.tsx — per-block render-throw containment for
 * the crew §9 sections. The SYNCHRONOUS analog of <WrappedTile> /
 * <TileServerFallback>. Crew-redesign Task 9 (R11-HIGH-1 / §4.13 / wp-13).
 *
 * WHY A SYNCHRONOUS WRAPPER (not <WrappedTile> directly):
 *   The crew sections (components/crew/sections/*Section.tsx) are SYNCHRONOUS
 *   Server Components — they receive an already-loaded `data: ShowForViewer`
 *   and run synchronous throwable transforms (diagrams build, transport
 *   projection, scope aggregation, notes aggregation + hero context build,
 *   schedule day aggregation, crew roster map, budget rows). <WrappedTile>
 *   composes the ASYNC <TileServerFallback> (it `await`s a `load()` and only
 *   then `render`s), so it cannot be embedded inside a synchronous section and
 *   resolved by a synchronous render — and the existing section tests render
 *   each section synchronously and assert inner `data-testid`s immediately.
 *   <WrappedSection> keeps the SAME containment + admin-alert contract but runs
 *   it synchronously so it composes inside the sections without changing the
 *   normal-render DOM those tests assert.
 *
 * H2 "DIRECT INVOCATION" CONTRACT (mirrors TileServerFallback.tsx:8-17):
 *   The throwable block is passed as a `render: () => ReactNode` FUNCTION and
 *   INVOKED inside this component's own try/catch. It MUST NOT be passed as
 *   already-evaluated `children` — a synchronous throw while the PARENT
 *   evaluates the child JSX happens BEFORE this boundary runs and escapes it
 *   (the M9 Codex round-1 H2 bug, applied to the synchronous case). All
 *   throwing work (the transform that can throw) lives inside `render`.
 *
 * ON THROW:
 *   - logs to stderr with surface metadata (parity with TileServerFallback);
 *   - fires the best-effort TILE_SERVER_RENDER_FAILED `admin_alerts` upsert
 *     (fire-and-forget: this surface is synchronous so it cannot await; the
 *     upsert's own failure is swallowed so it never masks the fallback —
 *     AGENTS.md §1.9 best-effort discipline);
 *   - returns the <TileErrorFallback> element (identical fallback to the tiles)
 *     so the rest of the section keeps rendering. The admin_alerts row is what
 *     surfaces the failing block to the admin dashboard / AlertBanner; crew see
 *     only the inline fallback (no raw error code — invariant 5).
 *
 * Synchronous Server Component (no `'use client'`, no `async`).
 */
import type { ReactElement, ReactNode } from "react";

import { TileErrorFallback } from "@/components/shared/TileErrorFallback";
import { upsertAdminAlert } from "@/lib/adminAlerts/upsertAdminAlert";

type WrappedSectionProps = {
  /**
   * Stable crew-namespaced identifier — `crew:<section>:<block>`. Stamped into
   * admin_alerts.context.tileId so the dashboard can tell blocks apart.
   */
  tileId: string;
  /** Show id for the admin_alerts row's `show_id`. */
  showId: string | null;
  /**
   * Show title (sheet name) — stamped into admin_alerts.context.sheet_name so
   * AlertBanner can interpolate the §12.4 `<sheet-name>` placeholder in
   * TILE_SERVER_RENDER_FAILED.dougFacing. Defaults to null.
   */
  sheetName?: string | null;
  /**
   * The throwable block. INVOKED inside try/catch (see the H2 contract above);
   * must be a function, NOT pre-evaluated `children`.
   */
  render: () => ReactNode;
  /** Optional custom fallback element. Defaults to <TileErrorFallback />. */
  fallback?: ReactElement;
};

export function WrappedSection({
  tileId,
  showId,
  sheetName,
  render,
  fallback,
}: WrappedSectionProps): ReactNode {
  try {
    return render();
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error(
      `[WrappedSection] tile=${tileId} show=${showId ?? "n/a"} threw:`,
      err.message,
      err.stack,
    );
    // Best-effort admin_alerts upsert. Fire-and-forget: this synchronous
    // surface cannot await, and the upsert's own failure must NOT mask the
    // fallback render — swallow the rejection.
    void upsertAdminAlert({
      showId: showId ?? null,
      code: "TILE_SERVER_RENDER_FAILED",
      context: {
        tileId,
        message: err.message,
        sheet_name: sheetName ?? null,
      },
    }).catch((alertErr: unknown) => {
      console.error(
        `[WrappedSection] admin_alerts upsert failed (tile=${tileId}):`,
        alertErr instanceof Error ? alertErr.message : String(alertErr),
      );
    });
    return fallback ?? <TileErrorFallback />;
  }
}
