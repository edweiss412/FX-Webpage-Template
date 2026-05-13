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
};

export function WrappedTile<P>({ tileId, showId, load, View, fallback }: WrappedTileProps<P>) {
  // With strict exactOptionalPropertyTypes, conditionally include `fallback`
  // only when the caller supplied one. Passing undefined to a required-ish
  // ReactElement prop is a type error under strict settings.
  return (
    <TileErrorBoundary tileId={tileId} {...(fallback ? { fallback } : {})}>
      <TileServerFallback
        load={load}
        render={(data) => <View {...(data as P & object)} />}
        tileId={tileId}
        showId={showId}
        {...(fallback ? { fallback } : {})}
      />
    </TileErrorBoundary>
  );
}
