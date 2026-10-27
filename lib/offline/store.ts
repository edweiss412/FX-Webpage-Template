/**
 * The saved-copy store's records (spec 4.6): one copy per show, a generation
 * counter bumped by every purge, and a request ordinal per save.
 *
 * Types only for now. The navigation tables (spec 4.4) name a copy and a purge
 * scope; the plan functions and the IndexedDB adapter that act on them come next.
 *
 * Pure and dependency-free: the worker bundle imports this file, and Vitest
 * imports the same source.
 */

export type PurgeScope =
  | { by: "show"; showId: string }
  | { by: "url"; url: string }
  | { by: "all" };

export type SaveToken = { generation: number; ordinal: number };

export type StoredCopy = {
  showId: string;
  url: string;
  html: string;
  viewer: string;
  epoch: number;
  savedAt: string;
  ordinal: number;
  assets: readonly string[];
  statics: readonly string[];
  endedAt: number | null;
  lastOpenedAt: number;
};

export type StoreState = {
  generation: number;
  nextOrdinal: number;
  /** Keyed by show id: one copy per show (spec section 4.6). */
  copies: ReadonlyMap<string, StoredCopy>;
};

export type CommitOutcome = "committed" | "stale-generation" | "stale-ordinal";
