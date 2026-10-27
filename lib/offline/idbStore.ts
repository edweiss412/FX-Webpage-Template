/**
 * The saved-copy store over IndexedDB: the one the service worker uses (spec 4.6).
 *
 * Every method is one IndexedDB transaction. It reads the records the plan
 * function of the same name (store.ts) needs, calls it, and writes what
 * changed, all in request callbacks with no other await between the read and
 * the write. A commit is therefore one read-write transaction over `copies` and
 * `meta`: the generation check and the write cannot be split by a purge.
 *
 * The generation counter and the next ordinal live in `meta`, so they survive a
 * worker restart, and a save begun before a restart cannot commit after a purge
 * made after it.
 *
 * A version change (another context deleting or upgrading the database) closes
 * the connection, so the kill switch and a newer schema are never blocked, and
 * retires the store: every later call rejects. A worker whose database changed
 * under it is obsolete, and must not recreate the database and commit into it.
 */
import {
  copyAtUrl,
  copyByShow,
  emptyState,
  listCopies,
  planBeginSave,
  planCommit,
  planDeleteStatics,
  planEvict,
  planMarkEnded,
  planPurge,
  planRecordStatics,
  planTouchOpened,
  removedCopies,
  type PurgeScope,
  type SavedCopyStore,
  type StaticIndex,
  type StoreState,
  type StoredCopy,
} from "@/lib/offline/store";
import {
  COPIES_STORE,
  DB_NAME,
  META_KEY,
  META_STORE,
  SCHEMA_VERSION,
  STATICS_STORE,
  URL_INDEX,
} from "@/lib/offline/storeSchema";

export type IdbSavedCopyStore = SavedCopyStore & {
  /** Closes the connection and retires the store; later calls reject. */
  close(): void;
};

type MetaRecord = { generation: number; nextOrdinal: number; schemaVersion: number };

/** The copies a plan function reads: by show id, through the url index, or all of them. */
type CopyReads = { showIds?: readonly string[]; urls?: readonly string[]; all?: boolean };

/** Decides from what was read: the records to write back and the method's result. */
type Step<T, R> = (before: T) => { next: T; result: R };

/** Drops every store an older schema left and creates the current ones, empty (spec 4.9). */
function upgrade(db: IDBDatabase): void {
  for (const name of Array.from(db.objectStoreNames)) db.deleteObjectStore(name);
  db.createObjectStore(META_STORE);
  db.createObjectStore(COPIES_STORE, { keyPath: "showId" }).createIndex(URL_INDEX, "url", {
    unique: true,
  });
  db.createObjectStore(STATICS_STORE);
}

/**
 * Calls `done` with every request's result once the last one succeeds. The
 * requests are all issued before any can succeed. A failed request aborts the
 * transaction, which rejects the caller's promise.
 */
function whenAllRead(requests: readonly IDBRequest[], done: (results: unknown[]) => void): void {
  if (requests.length === 0) {
    done([]);
    return;
  }
  let pending = requests.length;
  for (const request of requests) {
    request.onsuccess = () => {
      pending -= 1;
      if (pending === 0) done(requests.map((r) => r.result));
    };
  }
}

/** Reads `meta` and the copies `reads` names into a state holding exactly those copies. */
function readState(tx: IDBTransaction, reads: CopyReads, done: (state: StoreState) => void): void {
  const requests: IDBRequest[] = [tx.objectStore(META_STORE).get(META_KEY)];
  if (reads.all === true || reads.showIds !== undefined || reads.urls !== undefined) {
    const copies = tx.objectStore(COPIES_STORE);
    if (reads.all === true) requests.push(copies.getAll());
    for (const showId of reads.showIds ?? []) requests.push(copies.get(showId));
    for (const url of reads.urls ?? []) requests.push(copies.index(URL_INDEX).get(url));
  }
  whenAllRead(requests, ([meta, ...found]) => {
    const initial = emptyState();
    const record = meta as MetaRecord | undefined;
    const copies = new Map<string, StoredCopy>();
    for (const value of found.flat()) {
      const copy = value as StoredCopy | undefined;
      if (copy !== undefined) copies.set(copy.showId, copy);
    }
    done({
      generation: record?.generation ?? initial.generation,
      nextOrdinal: record?.nextOrdinal ?? initial.nextOrdinal,
      copies,
    });
  });
}

/**
 * Writes what a plan function changed. Plan functions keep the object of every
 * copy they leave alone, so a copy is written only when its object changed.
 * Deletes go first, so a URL can move from one show's record to another's
 * inside one transaction without tripping the unique index.
 */
function writeState(tx: IDBTransaction, before: StoreState, next: StoreState): void {
  if (next.generation !== before.generation || next.nextOrdinal !== before.nextOrdinal) {
    const meta: MetaRecord = {
      generation: next.generation,
      nextOrdinal: next.nextOrdinal,
      schemaVersion: SCHEMA_VERSION,
    };
    tx.objectStore(META_STORE).put(meta, META_KEY);
  }
  const deleted = [...before.copies.keys()].filter((showId) => !next.copies.has(showId));
  const written = [...next.copies.values()].filter(
    (copy) => before.copies.get(copy.showId) !== copy,
  );
  if (deleted.length === 0 && written.length === 0) return;
  const copies = tx.objectStore(COPIES_STORE);
  for (const showId of deleted) copies.delete(showId);
  for (const copy of written) copies.put(copy);
}

function readStatics(
  tx: IDBTransaction,
  urls: readonly string[] | "all",
  done: (index: StaticIndex) => void,
): void {
  const statics = tx.objectStore(STATICS_STORE);
  if (urls === "all") {
    whenAllRead([statics.getAllKeys(), statics.getAll()], ([keys, values]) => {
      const storedAt = values as number[];
      done(new Map((keys as string[]).map((url, i) => [url, storedAt[i] as number])));
    });
    return;
  }
  whenAllRead(
    urls.map((url) => statics.get(url)),
    (values) => {
      const index = new Map<string, number>();
      urls.forEach((url, i) => {
        if (values[i] !== undefined) index.set(url, values[i] as number);
      });
      done(index);
    },
  );
}

function writeStatics(tx: IDBTransaction, before: StaticIndex, next: StaticIndex): void {
  const statics = tx.objectStore(STATICS_STORE);
  for (const url of before.keys()) if (!next.has(url)) statics.delete(url);
  for (const [url, storedAt] of next) if (before.get(url) !== storedAt) statics.put(storedAt, url);
}

function purgeReads(scope: PurgeScope): CopyReads {
  switch (scope.by) {
    case "show":
      return { showIds: [scope.showId] };
    case "url":
      return { urls: [scope.url] };
    case "all":
      return { all: true };
  }
}

/** A read-only step: nothing to write, the result read from the state. */
function view<R>(read: (state: StoreState) => R): Step<StoreState, R> {
  return (state) => ({ next: state, result: read(state) });
}

export function createIdbStore(factory: IDBFactory): IdbSavedCopyStore {
  let connection: Promise<IDBDatabase> | null = null;
  let retired = false;

  function retire(): void {
    retired = true;
    const opening = connection;
    connection = null;
    opening?.then(
      (db) => db.close(),
      () => undefined,
    );
  }

  function open(): Promise<IDBDatabase> {
    if (retired) return Promise.reject(new Error("The saved-copy store is closed."));
    connection ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME, SCHEMA_VERSION);
      request.onupgradeneeded = () => upgrade(request.result);
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          retire();
        };
        resolve(db);
      };
      request.onerror = () => {
        connection = null;
        reject(request.error ?? new Error("The saved-copy database did not open."));
      };
    });
    return connection;
  }

  /**
   * One transaction over `scope`: `read` loads what the step needs, `step`
   * decides, and `write` stores what changed (a read-only step changes nothing,
   * and one that did would abort loudly on the read-only transaction). The
   * promise settles when the transaction completes, so a resolved write is
   * durable, and it rejects if the transaction aborts.
   */
  async function transact<T, R>(
    scope: readonly string[],
    mode: IDBTransactionMode,
    read: (tx: IDBTransaction, done: (before: T) => void) => void,
    step: Step<T, R>,
    write: (tx: IDBTransaction, before: T, next: T) => void,
  ): Promise<R> {
    const db = await open();
    return new Promise<R>((resolve, reject) => {
      const tx = db.transaction([...scope], mode);
      let decided: { result: R } | null = null;
      tx.oncomplete = () => {
        if (decided === null) {
          reject(new Error("The saved-copy transaction completed without a result."));
        } else {
          resolve(decided.result);
        }
      };
      tx.onabort = () => reject(tx.error ?? new Error("The saved-copy transaction was aborted."));
      read(tx, (before) => {
        try {
          const { next, result } = step(before);
          write(tx, before, next);
          decided = { result };
        } catch (error) {
          reject(error);
          tx.abort();
        }
      });
    });
  }

  function onCopies<R>(
    mode: IDBTransactionMode,
    reads: CopyReads,
    step: Step<StoreState, R>,
  ): Promise<R> {
    return transact(
      [COPIES_STORE, META_STORE],
      mode,
      (tx, done) => readState(tx, reads, done),
      step,
      writeState,
    );
  }

  function onStatics<R>(
    mode: IDBTransactionMode,
    urls: readonly string[] | "all",
    step: Step<StaticIndex, R>,
  ): Promise<R> {
    return transact(
      [STATICS_STORE],
      mode,
      (tx, done) => readStatics(tx, urls, done),
      step,
      writeStatics,
    );
  }

  return {
    beginSave: () =>
      transact(
        [META_STORE],
        "readwrite",
        (tx, done) => readState(tx, {}, done),
        (state) => {
          const { token, next } = planBeginSave(state);
          return { next, result: token };
        },
        writeState,
      ),
    commitIfCurrent: (token, copy) =>
      onCopies("readwrite", { showIds: [copy.showId], urls: [copy.url] }, (state) => {
        const { outcome, next } = planCommit(state, token, copy);
        return { next, result: outcome };
      }),
    purge: (scope) =>
      onCopies("readwrite", purgeReads(scope), (state) => {
        const next = planPurge(state, scope);
        return { next, result: removedCopies(state, next) };
      }),
    copyAtUrl: (url) =>
      onCopies(
        "readonly",
        { urls: [url] },
        view((state) => copyAtUrl(state, url)),
      ),
    copyByShow: (showId) =>
      onCopies(
        "readonly",
        { showIds: [showId] },
        view((state) => copyByShow(state, showId)),
      ),
    listCopies: () => onCopies("readonly", { all: true }, view(listCopies)),
    markEnded: (ref, endedAt) =>
      onCopies("readwrite", { showIds: [ref.showId] }, (state) => {
        const { marked, next } = planMarkEnded(state, ref, endedAt);
        return { next, result: marked };
      }),
    touchOpened: (ref, openedAt) =>
      onCopies("readwrite", { showIds: [ref.showId] }, (state) => ({
        next: planTouchOpened(state, ref, openedAt),
        result: undefined,
      })),
    evict: (ref) =>
      onCopies("readwrite", { showIds: [ref.showId] }, (state) => {
        const { evicted, next } = planEvict(state, ref);
        return { next, result: evicted };
      }),
    recordStatics: (urls, storedAt) =>
      onStatics("readwrite", urls, (index) => ({
        next: planRecordStatics(index, urls, storedAt),
        result: undefined,
      })),
    staticIndex: () => onStatics("readonly", "all", (index) => ({ next: index, result: index })),
    deleteStatics: (urls) =>
      onStatics("readwrite", urls, (index) => ({
        next: planDeleteStatics(index, urls),
        result: undefined,
      })),
    close: retire,
  };
}
