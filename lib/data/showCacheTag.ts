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

// Next 16.2.4's `revalidateTag(tag, profile)` requires a 2nd `profile`
// (`string | CacheLifeConfig`) argument (node_modules/next/dist/server/web/
// spec-extension/revalidate.d.ts) — the plan's 1-arg form predates this. We
// pass `{ expire: 300 }` so the on-demand revalidation aligns with the
// `unstable_cache({ revalidate: 300 })` backstop TTL (spec §4.3).
const SHOW_CACHE_LIFE = { expire: 300 } as const;

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
