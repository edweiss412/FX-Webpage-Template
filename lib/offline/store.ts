/**
 * The saved-copy store (spec 4.6, 4.8): one copy per show, a generation counter
 * bumped by every purge, and a request ordinal per save.
 *
 * Every decision is a pure function over plain records here. The memory store
 * below and the IndexedDB adapter (idbStore.ts) both read the records a plan
 * function needs, call it, and write what it returns, so the two stores cannot
 * disagree about the rules.
 *
 * The ordering rule: a save captures G and an ordinal when its fetch starts
 * (planBeginSave) and commits only if G is unchanged and its ordinal beats the
 * stored copy's (planCommit). Only purges move G, because only purges are
 * identity events; eviction, the ended mark and lastOpenedAt do not, so they
 * never void an unrelated save in flight.
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

/** Names one committed copy: a show and the ordinal of the save that committed it. */
export type CopyRef = Pick<StoredCopy, "showId" | "ordinal">;

/** Static file URL to the time it was stored, for the 14-day rule (spec 4.8). */
export type StaticIndex = ReadonlyMap<string, number>;

/**
 * The async store the service worker uses. Each method is atomic: it reads,
 * decides through the plan function of the same name, and writes as one step.
 * Records are the store's own: what a caller passes in or reads out is a copy.
 */
export interface SavedCopyStore {
  /** Captures G and the next ordinal as a save's fetch starts. */
  beginSave(): Promise<SaveToken>;
  /** Commits `copy` as its show's one copy if the token is still current (planCommit). */
  commitIfCurrent(token: SaveToken, copy: StoredCopy): Promise<CommitOutcome>;
  /** Advances G, removes C(show), S(url) or every copy, and returns what it removed. */
  purge(scope: PurgeScope): Promise<readonly StoredCopy[]>;
  /** S(U): the copy saved under this URL. */
  copyAtUrl(url: string): Promise<StoredCopy | null>;
  /** C(X): the show's one copy, wherever it was saved. */
  copyByShow(showId: string): Promise<StoredCopy | null>;
  /** Every copy, ordered by show id. */
  listCopies(): Promise<readonly StoredCopy[]>;
  /** Marks the referenced copy ended; true only when this call changed it (spec 4.4 step 1). */
  markEnded(ref: CopyRef, endedAt: number): Promise<boolean>;
  /** Sets the referenced copy's lastOpenedAt, the eviction order (spec 4.8). */
  touchOpened(ref: CopyRef, openedAt: number): Promise<void>;
  /** Removes the referenced copy without advancing G, and returns it (spec 4.8). */
  evict(ref: CopyRef): Promise<StoredCopy | null>;
  /** Records that these static URLs were stored at `storedAt`, replacing earlier times. */
  recordStatics(urls: readonly string[], storedAt: number): Promise<void>;
  staticIndex(): Promise<StaticIndex>;
  deleteStatics(urls: readonly string[]): Promise<void>;
}

/** A store that has never saved or purged; also what a missing `meta` record reads as. */
export function emptyState(): StoreState {
  return { generation: 0, nextOrdinal: 0, copies: new Map() };
}

/** The current generation and the next ordinal; the ordinal advances, nothing else does. */
export function planBeginSave(state: StoreState): { token: SaveToken; next: StoreState } {
  return {
    token: { generation: state.generation, ordinal: state.nextOrdinal },
    next: { ...state, nextOrdinal: state.nextOrdinal + 1 },
  };
}

/**
 * Commits a save as its show's one copy, replacing C(show) wherever it was
 * saved, unless a purge happened since the save began (`stale-generation`) or
 * the show's copy came from a save that began no earlier (`stale-ordinal`).
 *
 * The token is the authority for the stored ordinal; the copy's own `ordinal`
 * field is overwritten. URLs stay unique: a copy of another show already at
 * `copy.url` is displaced by a newer save and makes an older one stale, the
 * same ordering the show's own copy gets.
 */
export function planCommit(
  state: StoreState,
  token: SaveToken,
  copy: StoredCopy,
): { outcome: CommitOutcome; next: StoreState } {
  if (token.generation !== state.generation) return { outcome: "stale-generation", next: state };
  const byShow = copyByShow(state, copy.showId);
  const atUrl = copyAtUrl(state, copy.url);
  for (const held of [byShow, atUrl]) {
    if (held !== null && held.ordinal >= token.ordinal) {
      return { outcome: "stale-ordinal", next: state };
    }
  }
  const copies = new Map(state.copies);
  if (atUrl !== null) copies.delete(atUrl.showId);
  copies.set(copy.showId, { ...copy, ordinal: token.ordinal });
  return { outcome: "committed", next: { ...state, copies } };
}

/** Advances G (every purge, even one that removes nothing) and removes C(show), S(url), or every copy. */
export function planPurge(state: StoreState, scope: PurgeScope): StoreState {
  const copies = new Map(state.copies);
  switch (scope.by) {
    case "show":
      copies.delete(scope.showId);
      break;
    case "url": {
      const atUrl = copyAtUrl(state, scope.url);
      if (atUrl !== null) copies.delete(atUrl.showId);
      break;
    }
    case "all":
      copies.clear();
      break;
    default: {
      const unhandled: never = scope;
      throw new Error(`unhandled purge scope: ${JSON.stringify(unhandled)}`);
    }
  }
  return { ...state, generation: state.generation + 1, copies };
}

export function copyAtUrl(state: StoreState, url: string): StoredCopy | null {
  for (const copy of state.copies.values()) {
    if (copy.url === url) return copy;
  }
  return null;
}

export function copyByShow(state: StoreState, showId: string): StoredCopy | null {
  return state.copies.get(showId) ?? null;
}

/** Ordered by show id, in UTF-16 code units: the order IndexedDB keeps its keys in. */
export function listCopies(state: StoreState): readonly StoredCopy[] {
  return [...state.copies.values()].sort((a, b) =>
    a.showId < b.showId ? -1 : a.showId > b.showId ? 1 : 0,
  );
}

/** The copies `before` holds and `next` does not, ordered by show id. */
export function removedCopies(before: StoreState, next: StoreState): readonly StoredCopy[] {
  return listCopies(before).filter((copy) => !next.copies.has(copy.showId));
}

/** The show's copy if it is still the one the ref names; null once a newer save replaced it. */
function referenced(state: StoreState, ref: CopyRef): StoredCopy | null {
  const copy = copyByShow(state, ref.showId);
  return copy !== null && copy.ordinal === ref.ordinal ? copy : null;
}

function withCopies(
  state: StoreState,
  update: (copies: Map<string, StoredCopy>) => void,
): StoreState {
  const copies = new Map(state.copies);
  update(copies);
  return { ...state, copies };
}

export function planMarkEnded(
  state: StoreState,
  ref: CopyRef,
  endedAt: number,
): { marked: boolean; next: StoreState } {
  const copy = referenced(state, ref);
  if (copy === null || copy.endedAt !== null) return { marked: false, next: state };
  return {
    marked: true,
    next: withCopies(state, (copies) => copies.set(copy.showId, { ...copy, endedAt })),
  };
}

export function planTouchOpened(state: StoreState, ref: CopyRef, openedAt: number): StoreState {
  const copy = referenced(state, ref);
  if (copy === null) return state;
  return withCopies(state, (copies) =>
    copies.set(copy.showId, { ...copy, lastOpenedAt: openedAt }),
  );
}

/** Removes the referenced copy. G stays: eviction is not an identity event. */
export function planEvict(
  state: StoreState,
  ref: CopyRef,
): { evicted: StoredCopy | null; next: StoreState } {
  const copy = referenced(state, ref);
  if (copy === null) return { evicted: null, next: state };
  return { evicted: copy, next: withCopies(state, (copies) => copies.delete(copy.showId)) };
}

export function planRecordStatics(
  index: StaticIndex,
  urls: readonly string[],
  storedAt: number,
): StaticIndex {
  const next = new Map(index);
  for (const url of urls) next.set(url, storedAt);
  return next;
}

export function planDeleteStatics(index: StaticIndex, urls: readonly string[]): StaticIndex {
  const next = new Map(index);
  for (const url of urls) next.delete(url);
  return next;
}

/**
 * The store over plain memory, for the worker's unit tests. It clones every
 * record on the way in and out, as IndexedDB's structured clone does, so a
 * caller that mutates a record behaves the same against both stores.
 */
export function createMemoryStore(): SavedCopyStore {
  let state = emptyState();
  let statics: StaticIndex = new Map();
  const clone = <T>(value: T): T => structuredClone(value);

  return {
    async beginSave() {
      const { token, next } = planBeginSave(state);
      state = next;
      return token;
    },
    async commitIfCurrent(token, copy) {
      const { outcome, next } = planCommit(state, token, clone(copy));
      state = next;
      return outcome;
    },
    async purge(scope) {
      const next = planPurge(state, scope);
      const removed = removedCopies(state, next);
      state = next;
      return clone(removed);
    },
    async copyAtUrl(url) {
      return clone(copyAtUrl(state, url));
    },
    async copyByShow(showId) {
      return clone(copyByShow(state, showId));
    },
    async listCopies() {
      return clone(listCopies(state));
    },
    async markEnded(ref, endedAt) {
      const { marked, next } = planMarkEnded(state, ref, endedAt);
      state = next;
      return marked;
    },
    async touchOpened(ref, openedAt) {
      state = planTouchOpened(state, ref, openedAt);
    },
    async evict(ref) {
      const { evicted, next } = planEvict(state, ref);
      state = next;
      return clone(evicted);
    },
    async recordStatics(urls, storedAt) {
      statics = planRecordStatics(statics, urls, storedAt);
    },
    async staticIndex() {
      return new Map(statics);
    },
    async deleteStatics(urls) {
      statics = planDeleteStatics(statics, urls);
    },
  };
}
