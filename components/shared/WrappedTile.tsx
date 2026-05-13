/**
 * components/shared/WrappedTile.tsx — convenience wrapper that composes
 * <TileErrorBoundary> (client) around <TileServerFallback> (server). Keeps
 * the page chrome readable; each per-tile call site goes from ~7 lines of
 * JSX to ~5 plus props. Task 9.2 / §12.1.
 *
 * The component itself is a Server Component (no `'use client'`); only
 * <TileErrorBoundary>'s `'use client'` directive crosses into the browser.
 */
import type { ReactElement } from "react";

import { TileErrorBoundary } from "./TileErrorBoundary";
import { TileServerFallback } from "./TileServerFallback";

type WrappedTileProps<P> = {
  /** Stable identifier — used for admin_alerts.context.tileId + log tagging. */
  tileId: string;
  /** Show id for the admin_alerts row's `show_id`. */
  showId: string | null;
  /** Async data loader. Runs inside try/catch — may throw. */
  load: () => Promise<P>;
  /** Pure View component. Must NOT call throwing helpers internally. */
  View: (props: P) => ReactElement | null;
  /** Optional custom fallback element (defaults to <TileErrorFallback />). */
  fallback?: ReactElement;
  /**
   * Show title (sheet name) — passed through to TileServerFallback's
   * admin_alerts.context so AlertBanner can interpolate the
   * §12.4 `<sheet-name>` placeholder in TILE_SERVER_RENDER_FAILED.
   */
  sheetName?: string | null;
};

export function WrappedTile<P>({
  tileId,
  showId,
  load,
  View,
  fallback,
  sheetName,
}: WrappedTileProps<P>) {
  // With strict exactOptionalPropertyTypes, conditionally include `fallback`
  // only when the caller supplied one. Passing undefined to a required-ish
  // ReactElement prop is a type error under strict settings.
  //
  // CRITICAL: `render` must invoke `View(data)` as a function call (not
  // `<View {...data} />`). The JSX element form returns a React element whose
  // component function is called LATER by the RSC renderer, outside the
  // wrapper's try/catch — so synchronous throws inside View's body escape the
  // boundary (M9 Codex round-1 H2). Direct invocation runs the body NOW,
  // inside <TileServerFallback>'s try/catch.
  return (
    <TileErrorBoundary tileId={tileId} {...(fallback ? { fallback } : {})}>
      <TileServerFallback
        load={load}
        render={(data) => View(data) ?? <></>}
        tileId={tileId}
        showId={showId}
        {...(sheetName !== undefined ? { sheetName } : {})}
        {...(fallback ? { fallback } : {})}
      />
    </TileErrorBoundary>
  );
}
