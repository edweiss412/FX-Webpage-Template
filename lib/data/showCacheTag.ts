/**
 * lib/data/showCacheTag.ts (nav-perf tag-caching, spec §4.2)
 *
 * The SOLE producer of the per-show cache tag string and the post-commit
 * revalidation helpers. `getShowForViewer`'s data fan-out is wrapped in
 * `unstable_cache({ tags: [showCacheTag(showId)], revalidate: 300 })`
 * (lib/data/getShowForViewer.ts); every Next-runtime write to a
 * getShowForViewer-read table calls `revalidateShow(showId)` /
 * `revalidateOnApplied(result)` POST-COMMIT (after the outermost apply
 * tx/lock resolves — NEVER inside the tx, and NEVER inside the
 * `unstable_cache` callback). See spec §4.2 / §4.3 and the write-site
 * registry at docs/superpowers/plans/2026-06-23-nav-perf-tag-caching/01-write-site-registry.md.
 */
import { revalidateTag } from "next/cache";

export function showCacheTag(showId: string): string {
  return `show-${showId}`;
}

// Next 16's `revalidateTag(tag, profile)` requires a 2nd `profile`
// (`string | { expire?: number }`) argument; the 1-arg form is deprecated.
// `profile="max"` is STALE-WHILE-REVALIDATE (serves stale for a window) — WRONG
// for our near-zero-staleness contract (spec §4.2): with the LIVE version token,
// a stale-while-revalidate read would render stale data + a fresh token, the
// realtime bridge would then see a token match and stop refreshing → page stuck
// stale. The Next 16 docs prescribe `{ expire: 0 }` for IMMEDIATE expiration from
// Route Handlers (webhooks/external): the next read is a blocking cache miss =
// fresh. So we use `{ expire: 0 }` (immediate). This is INDEPENDENT of the
// `unstable_cache({ revalidate: 300 })` periodic TTL backstop (spec §4.3): 300s is
// the auto-refresh floor; `{ expire: 0 }` is the on-demand immediate bust.
const SHOW_CACHE_LIFE = { expire: 0 } as const;

/** Revalidate the show's cache tag. Call ONLY post-commit (after the apply tx resolves). */
export function revalidateShow(showId: string): void {
  revalidateTag(showCacheTag(showId), SHOW_CACHE_LIFE);
}

/** Sync convenience: revalidate iff a ProcessOneFileResult applied. Caller MUST be post-commit. */
export function revalidateOnApplied(
  result: { outcome?: string; showId?: string } | null | undefined,
): void {
  if (result && result.outcome === "applied" && result.showId) revalidateShow(result.showId);
}
