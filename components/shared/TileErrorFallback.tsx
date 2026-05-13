/**
 * components/shared/TileErrorFallback.tsx — fallback UI rendered inside
 * <TileServerFallback> when a tile's data loader throws on the server,
 * and inside <TileErrorBoundary> when a descendant render throws on the
 * client. Spec §12.1 / AC-9.3.
 *
 * The copy comes from §12.4 `TILE_SERVER_RENDER_FAILED.crewFacing` —
 * "This section couldn't load — last good data shown." Catalog-bound
 * so the X.1 parity test covers it (invariant 5).
 *
 * Server Component (no `'use client'`). The optional Report-button slot
 * lives at this surface in M8/M9 polish but is not wired here yet — the
 * footer's `ReportButton` covers the per-page "Something looks wrong?"
 * affordance, and a tile-scoped report surface is deferred per the
 * M9 close-out review.
 */
import { messageFor } from "@/lib/messages/lookup";

type TileErrorFallbackProps = {
  /** Optional override; defaults to the §12.4 catalog crew copy. */
  message?: string;
};

export function TileErrorFallback({ message }: TileErrorFallbackProps = {}) {
  const text = message ?? messageFor("TILE_SERVER_RENDER_FAILED").crewFacing ?? "";
  return (
    <div
      data-testid="tile-error-fallback"
      role="status"
      aria-live="polite"
      className="rounded-md border border-border bg-bg-elev p-4 text-sm text-muted"
    >
      {text}
    </div>
  );
}
