/**
 * Storage limits for saved copies (spec 4.8), as pure functions over plain
 * records. The worker glue reads what it needs, calls one of these, and acts on
 * the answer, so the numbers live here and nowhere else.
 *
 * Pure and dependency-free: the worker bundle imports this file, and Vitest
 * imports the same source.
 */

import type { StaticIndex, StoredCopy } from "./store";

/** One asset over this is skipped; a skipped asset fails offline the way it does today. */
export const ASSET_MAX_BYTES = 25 * 1024 * 1024;
/** Asset prefetch for one show stops before the show's assets pass this. */
export const SHOW_PREFETCH_MAX_BYTES = 75 * 1024 * 1024;
/** An 11th saved show evicts the least recently opened one. */
export const MAX_SAVED_SHOWS = 10;
/** A static file is deleted only when no copy references it and it was stored longer ago than this. */
export const STATIC_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * What to do with one asset: `admit` it, `skip` it and go on to the next, or
 * `stop` the show's prefetch.
 */
export type AssetAdmission = "admit" | "skip" | "stop";

/**
 * Whether an asset of `contentLength` bytes fits, given the `bytesSoFar` already
 * admitted for this show. The total counts the asset itself, so admitting never
 * takes the show past the cap; a show that would pass it stops the prefetch.
 *
 * An unknown length (`null`, or a header that is not a usable number) is
 * admitted. The caller reads the body, then asks again with the bytes it
 * actually read, which gives the same answer a declared length would have.
 * A running total that is not a usable number stops the prefetch: the
 * accounting is broken, and no more bytes should follow it.
 */
export function admitAsset(bytesSoFar: number, contentLength: number | null): AssetAdmission {
  if (!Number.isFinite(bytesSoFar) || bytesSoFar < 0) return "stop";
  if (bytesSoFar > SHOW_PREFETCH_MAX_BYTES) return "stop";
  if (contentLength === null || !Number.isFinite(contentLength) || contentLength < 0) {
    return "admit";
  }
  if (contentLength > ASSET_MAX_BYTES) return "skip";
  return bytesSoFar + contentLength > SHOW_PREFETCH_MAX_BYTES ? "stop" : "admit";
}

/** The fields eviction orders by; a `StoredCopy` has them all. */
export type EvictionCandidate = Pick<StoredCopy, "showId" | "ordinal" | "lastOpenedAt">;

/** A time that is not a usable number sorts as the longest ago, so a damaged record goes first. */
function openedAt(copy: EvictionCandidate): number {
  return Number.isFinite(copy.lastOpenedAt) ? copy.lastOpenedAt : Number.NEGATIVE_INFINITY;
}

/** Least recently opened first; ties go to the older save, then the show id, so the order is stable. */
function leastRecentlyOpenedFirst(a: EvictionCandidate, b: EvictionCandidate): number {
  const aOpened = openedAt(a);
  const bOpened = openedAt(b);
  if (aOpened < bOpened) return -1;
  if (aOpened > bOpened) return 1;
  if (a.ordinal < b.ordinal) return -1;
  if (a.ordinal > b.ordinal) return 1;
  return a.showId < b.showId ? -1 : a.showId > b.showId ? 1 : 0;
}

/**
 * The copies to evict so that saving `incomingShowId` leaves at most
 * MAX_SAVED_SHOWS shows: the least recently opened ones, oldest first. The
 * incoming show counts as one of the ten whether or not it is in `copies`, and
 * its own copy is never a victim, because the save replaces it. A copy is
 * ranked by when it was last opened, never by when it was saved. Returns the
 * given copy objects so the caller can read what each lists.
 */
export function evictionVictims<T extends EvictionCandidate>(
  copies: readonly T[],
  incomingShowId: string,
): readonly T[] {
  const others = copies.filter((copy) => copy.showId !== incomingShowId);
  const excess = others.length - (MAX_SAVED_SHOWS - 1);
  if (excess <= 0) return [];
  return others.sort(leastRecentlyOpenedFirst).slice(0, excess);
}

/**
 * The static files to delete: those no saved copy references (`referenced`)
 * that were stored more than STATIC_RETENTION_MS before `nowMs`, in the index's
 * order. A file stored in the future (a clock that moved back) is not old. An
 * unreferenced entry whose stored time is not a usable number cannot be aged and
 * would never leave, so it goes. A `nowMs` that is not a usable number evicts
 * nothing.
 */
export function staticEvictions(
  index: StaticIndex,
  referenced: Iterable<string>,
  nowMs: number,
): readonly string[] {
  if (!Number.isFinite(nowMs)) return [];
  const kept = new Set(referenced);
  const evicted: string[] = [];
  for (const [url, storedAt] of index) {
    if (kept.has(url)) continue;
    if (!Number.isFinite(storedAt) || nowMs - storedAt > STATIC_RETENTION_MS) evicted.push(url);
  }
  return evicted;
}
