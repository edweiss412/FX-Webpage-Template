import {
  IDBDatabase as FakeIDBDatabase,
  IDBFactory,
  IDBIndex as FakeIDBIndex,
  IDBObjectStore as FakeIDBObjectStore,
} from "fake-indexeddb";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createIdbStore } from "@/lib/offline/idbStore";
import {
  createMemoryStore,
  type PurgeScope,
  type SavedCopyStore,
  type SaveToken,
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

// The SavedCopyStore contract (spec 4.6, 4.8) through the async API the worker
// uses, run as one parameterized suite over the memory store and the IndexedDB
// adapter, then the cases only the adapter can fail: persistence across a
// worker restart, one transaction per method, the url index, and closing on a
// version change. Each case gets its own IDBFactory, so nothing leaks between
// cases. Expected values come from the spec rules, never from the module.

const SHOW_A = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const SHOW_B = "9a7c1d20-5b3e-4f18-9c64-0e2b7a8d1f35";

const OLD_LINK = "/show/east-coast/tok-before-reset";
const NEW_LINK = "/show/east-coast/tok-current";
const B_LINK = "/show/rpas/tok-rpas";
const UNRELATED_LINK = "/show/nobody/tok-nobody";

const VIEWER_1 = "q3Xk-9_LmZpRt2VbYw0aGhJ4";
const VIEWER_2 = "Zp0-mN4_rTq8sWx2yB6cDe1F";

function copyOf(
  showId: string,
  url: string,
  viewer: string,
  ordinal: number,
  extra: Partial<StoredCopy> = {},
): StoredCopy {
  return {
    showId,
    url,
    html: `<html data-show="${showId}" data-viewer="${viewer}"></html>`,
    viewer,
    epoch: 3,
    savedAt: "2026-10-27T14:00:00.000Z",
    ordinal,
    assets: [`/api/asset/agenda/${showId}/file-1`],
    statics: ["/_next/static/chunks/main.js", "/fonts/inter.woff2"],
    endedAt: null,
    lastOpenedAt: 1_000,
    ...extra,
  };
}

/** Begins and commits one save, the way the worker does when nothing races it. */
async function save(store: SavedCopyStore, showId: string, url: string, viewer: string) {
  const token = await store.beginSave();
  const outcome = await store.commitIfCurrent(token, copyOf(showId, url, viewer, token.ordinal));
  expect(outcome).toBe("committed");
  return { token, ref: { showId, ordinal: token.ordinal } };
}

async function viewerOf(store: SavedCopyStore, showId: string): Promise<string | null> {
  return (await store.copyByShow(showId))?.viewer ?? null;
}

const STORES: ReadonlyArray<readonly [string, () => SavedCopyStore]> = [
  ["memory", () => createMemoryStore()],
  ["indexeddb", () => createIdbStore(new IDBFactory())],
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(STORES)("the %s store", (_name, makeStore) => {
  test("hands out increasing ordinals, and each purge of any scope advances the generation by one", async () => {
    const store = makeStore();
    const first = await store.beginSave();
    const second = await store.beginSave();
    expect(second.ordinal).toBeGreaterThan(first.ordinal);
    expect(second.generation).toBe(first.generation);

    // A purge that removes nothing still counts.
    await store.purge({ by: "url", url: UNRELATED_LINK });
    const third = await store.beginSave();
    expect(third.generation).toBe(first.generation + 1);
    expect(third.ordinal).toBeGreaterThan(second.ordinal);
  });

  test("a first save begun before a purge never commits after it", async () => {
    const store = makeStore();
    const token = await store.beginSave();
    expect(await store.purge({ by: "show", showId: SHOW_A })).toEqual([]);

    expect(
      await store.commitIfCurrent(token, copyOf(SHOW_A, NEW_LINK, VIEWER_2, token.ordinal)),
    ).toBe("stale-generation");
    expect(await store.copyByShow(SHOW_A)).toBeNull();
    expect(await store.copyAtUrl(NEW_LINK)).toBeNull();
  });

  test("a replacement begun before a purge never commits after it, and the previous copy stays", async () => {
    const store = makeStore();
    await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    const token = await store.beginSave();
    await store.purge({ by: "url", url: UNRELATED_LINK });

    expect(
      await store.commitIfCurrent(token, copyOf(SHOW_A, NEW_LINK, VIEWER_2, token.ordinal)),
    ).toBe("stale-generation");
    expect(await viewerOf(store, SHOW_A)).toBe(VIEWER_1);
    expect((await store.copyAtUrl(OLD_LINK))?.viewer).toBe(VIEWER_1);
  });

  test("a purge of show A voids an in-flight save of show B, and a save begun after it commits", async () => {
    const store = makeStore();
    const voided = await store.beginSave();
    await store.purge({ by: "show", showId: SHOW_A });

    expect(
      await store.commitIfCurrent(voided, copyOf(SHOW_B, B_LINK, VIEWER_1, voided.ordinal)),
    ).toBe("stale-generation");
    expect(await store.copyByShow(SHOW_B)).toBeNull();
    await save(store, SHOW_B, B_LINK, VIEWER_1);
    expect(await viewerOf(store, SHOW_B)).toBe(VIEWER_1);
  });

  test("a purge issued before a commit, with neither awaited, still voids it", async () => {
    const store = makeStore();
    const token = await store.beginSave();
    const purging = store.purge({ by: "show", showId: SHOW_A });
    const committing = store.commitIfCurrent(
      token,
      copyOf(SHOW_A, NEW_LINK, VIEWER_1, token.ordinal),
    );

    expect(await committing).toBe("stale-generation");
    await purging;
    expect(await store.copyByShow(SHOW_A)).toBeNull();
  });

  test("a commit issued before a purge of its show lands and is then removed by it", async () => {
    const store = makeStore();
    const token = await store.beginSave();
    const committing = store.commitIfCurrent(
      token,
      copyOf(SHOW_A, NEW_LINK, VIEWER_1, token.ordinal),
    );
    const purging = store.purge({ by: "show", showId: SHOW_A });

    expect(await committing).toBe("committed");
    expect((await purging).map((c) => c.viewer)).toEqual([VIEWER_1]);
    expect(await store.copyByShow(SHOW_A)).toBeNull();
  });

  test.each([
    ["the newer save finishes last", "newer-last"],
    ["the older save finishes last", "older-last"],
  ] as const)("two saves of one show keep the newer one when %s", async (_label, order) => {
    const store = makeStore();
    const olderToken = await store.beginSave();
    const newerToken = await store.beginSave();
    const older = copyOf(SHOW_A, NEW_LINK, VIEWER_1, olderToken.ordinal);
    const newer = copyOf(SHOW_A, NEW_LINK, VIEWER_2, newerToken.ordinal);

    const outcomes =
      order === "newer-last"
        ? [
            await store.commitIfCurrent(olderToken, older),
            await store.commitIfCurrent(newerToken, newer),
          ]
        : [
            await store.commitIfCurrent(newerToken, newer),
            await store.commitIfCurrent(olderToken, older),
          ];

    expect(outcomes).toEqual(
      order === "newer-last" ? ["committed", "committed"] : ["committed", "stale-ordinal"],
    );
    expect(await viewerOf(store, SHOW_A)).toBe(VIEWER_2);
  });

  const BRACKETS: ReadonlyArray<readonly [string, PurgeScope]> = [
    ['"Not you? Switch person"', { by: "show", showId: SHOW_A }],
    ["/me sign-out", { by: "all" }],
    ["Google sign-in completing", { by: "all" }],
  ];
  for (const [transition, scope] of BRACKETS) {
    test.each([
      ["the show's first save", false],
      ["a show with a previous viewer's copy", true],
    ])(
      `the ${transition} bracket refuses a save that starts inside it, for %s`,
      async (_label, hasPrior) => {
        const store = makeStore();
        if (hasPrior) await save(store, SHOW_A, OLD_LINK, VIEWER_1);
        await store.purge(scope);
        const token = await store.beginSave();
        await store.purge(scope);

        expect(
          await store.commitIfCurrent(token, copyOf(SHOW_A, NEW_LINK, VIEWER_1, token.ordinal)),
        ).toBe("stale-generation");
        expect(await store.copyByShow(SHOW_A)).toBeNull();
        expect(await store.listCopies()).toEqual([]);
      },
    );
  }

  test("one copy per show: a save at a new link replaces the copy saved at an old link", async () => {
    const store = makeStore();
    await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    await save(store, SHOW_A, NEW_LINK, VIEWER_2);

    expect(await store.copyAtUrl(OLD_LINK)).toBeNull();
    expect((await store.copyAtUrl(NEW_LINK))?.viewer).toBe(VIEWER_2);
    expect((await store.listCopies()).map((c) => [c.showId, c.url])).toEqual([[SHOW_A, NEW_LINK]]);
  });

  test("a show-scoped purge at a new link removes the copy saved at an old link", async () => {
    const store = makeStore();
    await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    await save(store, SHOW_B, B_LINK, VIEWER_1);

    const removed = await store.purge({ by: "show", showId: SHOW_A });
    expect(removed.map((c) => [c.showId, c.url])).toEqual([[SHOW_A, OLD_LINK]]);
    expect(await store.copyAtUrl(OLD_LINK)).toBeNull();
    expect(await store.copyByShow(SHOW_A)).toBeNull();
    expect((await store.copyByShow(SHOW_B))?.url).toBe(B_LINK);
  });

  test("a url-scoped purge at a new link leaves the older-link copy of the same show in place", async () => {
    const store = makeStore();
    await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    const inFlight = await store.beginSave();

    expect(await store.purge({ by: "url", url: NEW_LINK })).toEqual([]);
    expect((await store.copyAtUrl(OLD_LINK))?.viewer).toBe(VIEWER_1);
    expect((await store.copyByShow(SHOW_A))?.url).toBe(OLD_LINK);
    // It is still a purge: the in-flight save is voided.
    expect(
      await store.commitIfCurrent(inFlight, copyOf(SHOW_A, NEW_LINK, VIEWER_2, inFlight.ordinal)),
    ).toBe("stale-generation");
  });

  test("two copies cannot share a URL: a newer save at an occupied URL displaces the copy there", async () => {
    const store = makeStore();
    const olderToken = await store.beginSave();
    await save(store, SHOW_A, NEW_LINK, VIEWER_1);
    await save(store, SHOW_B, NEW_LINK, VIEWER_2);

    expect((await store.listCopies()).map((c) => [c.showId, c.url])).toEqual([[SHOW_B, NEW_LINK]]);
    // A save that started before the copy now at the URL is stale there.
    expect(
      await store.commitIfCurrent(
        olderToken,
        copyOf(SHOW_A, NEW_LINK, VIEWER_1, olderToken.ordinal),
      ),
    ).toBe("stale-ordinal");
    expect((await store.copyAtUrl(NEW_LINK))?.showId).toBe(SHOW_B);
  });

  test("the stored ordinal is the token's, whatever the copy says", async () => {
    const store = makeStore();
    const token = await store.beginSave();
    await store.commitIfCurrent(token, copyOf(SHOW_A, NEW_LINK, VIEWER_1, token.ordinal + 1000));

    expect((await store.copyByShow(SHOW_A))?.ordinal).toBe(token.ordinal);
  });

  test("purge returns the copies it removed, for every scope", async () => {
    const store = makeStore();
    await save(store, SHOW_B, B_LINK, VIEWER_1);
    await save(store, SHOW_A, OLD_LINK, VIEWER_1);

    expect(await store.purge({ by: "url", url: UNRELATED_LINK })).toEqual([]);
    expect((await store.purge({ by: "url", url: B_LINK })).map((c) => c.showId)).toEqual([SHOW_B]);
    await save(store, SHOW_B, B_LINK, VIEWER_2);
    expect((await store.purge({ by: "all" })).map((c) => c.showId)).toEqual([SHOW_A, SHOW_B]);
    expect(await store.listCopies()).toEqual([]);
  });

  test("reads: copyAtUrl, copyByShow and listCopies (ordered by show id) return the stored copies", async () => {
    const store = makeStore();
    expect(await store.listCopies()).toEqual([]);
    // B is saved first; A's id sorts first.
    const b = await save(store, SHOW_B, B_LINK, VIEWER_1);
    const a = await save(store, SHOW_A, OLD_LINK, VIEWER_2);

    expect(await store.copyAtUrl(OLD_LINK)).toEqual(
      copyOf(SHOW_A, OLD_LINK, VIEWER_2, a.token.ordinal),
    );
    expect(await store.copyByShow(SHOW_B)).toEqual(
      copyOf(SHOW_B, B_LINK, VIEWER_1, b.token.ordinal),
    );
    expect((await store.listCopies()).map((c) => c.showId)).toEqual([SHOW_A, SHOW_B]);
  });

  test("markEnded marks the referenced copy once and reports only the transition", async () => {
    const store = makeStore();
    const { ref } = await save(store, SHOW_A, OLD_LINK, VIEWER_1);

    expect(await store.markEnded(ref, 42_000)).toBe(true);
    expect((await store.copyByShow(SHOW_A))?.endedAt).toBe(42_000);
    expect(await store.markEnded(ref, 99_000)).toBe(false);
    expect((await store.copyByShow(SHOW_A))?.endedAt).toBe(42_000);
    expect(await store.markEnded({ showId: SHOW_B, ordinal: ref.ordinal }, 42_000)).toBe(false);
  });

  test("markEnded, touchOpened and evict leave a copy replaced since the caller read it", async () => {
    const store = makeStore();
    const { ref: staleRef } = await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    await save(store, SHOW_A, NEW_LINK, VIEWER_2);
    const current = await store.copyByShow(SHOW_A);

    expect(await store.markEnded(staleRef, 42_000)).toBe(false);
    await store.touchOpened(staleRef, 7_000);
    expect(await store.evict(staleRef)).toBeNull();
    expect(await store.copyByShow(SHOW_A)).toEqual(current);
    expect(current?.viewer).toBe(VIEWER_2);
  });

  test("touchOpened updates the referenced copy's lastOpenedAt", async () => {
    const store = makeStore();
    const { ref } = await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    await store.touchOpened(ref, 7_000);

    expect((await store.copyByShow(SHOW_A))?.lastOpenedAt).toBe(7_000);
  });

  test("evict removes the referenced copy, returns it, and leaves the others", async () => {
    const store = makeStore();
    const { ref } = await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    await save(store, SHOW_B, B_LINK, VIEWER_1);

    expect((await store.evict(ref))?.url).toBe(OLD_LINK);
    expect(await store.copyByShow(SHOW_A)).toBeNull();
    expect((await store.listCopies()).map((c) => c.showId)).toEqual([SHOW_B]);
  });

  // Only purges are identity events (spec 4.6). Each of these runs between a
  // save's begin and its commit, which must still land; a purge in the same
  // position is the positive control.
  const NON_IDENTITY: ReadonlyArray<
    readonly [
      string,
      (store: SavedCopyStore, ref: { showId: string; ordinal: number }) => Promise<unknown>,
    ]
  > = [
    ["markEnded", (store, ref) => store.markEnded(ref, 42_000)],
    ["touchOpened", (store, ref) => store.touchOpened(ref, 7_000)],
    ["evict", (store, ref) => store.evict(ref)],
    ["recordStatics", (store) => store.recordStatics(["/_next/static/a.js"], 100)],
    ["deleteStatics", (store) => store.deleteStatics(["/_next/static/a.js"])],
  ];
  test.each(NON_IDENTITY)(
    "%s does not void an in-flight save; a purge in its place does",
    async (_label, op) => {
      const store = makeStore();
      const { ref } = await save(store, SHOW_A, OLD_LINK, VIEWER_1);

      const kept = await store.beginSave();
      await op(store, ref);
      expect(
        await store.commitIfCurrent(kept, copyOf(SHOW_B, B_LINK, VIEWER_1, kept.ordinal)),
      ).toBe("committed");

      const voided = await store.beginSave();
      await store.purge({ by: "url", url: UNRELATED_LINK });
      expect(
        await store.commitIfCurrent(voided, copyOf(SHOW_B, B_LINK, VIEWER_2, voided.ordinal)),
      ).toBe("stale-generation");
    },
  );

  test("the static index records stored-at times, replaces them, deletes, and survives a purge of everything", async () => {
    const store = makeStore();
    expect(await store.staticIndex()).toEqual(new Map());

    await store.recordStatics(["/_next/static/a.js", "/fonts/inter.woff2"], 100);
    await store.recordStatics(["/_next/static/a.js"], 500);
    expect(await store.staticIndex()).toEqual(
      new Map([
        ["/_next/static/a.js", 500],
        ["/fonts/inter.woff2", 100],
      ]),
    );

    await store.deleteStatics(["/fonts/inter.woff2", "/_next/static/never.js"]);
    // Static files are the same for every viewer: identity purges leave them.
    await store.purge({ by: "all" });
    expect(await store.staticIndex()).toEqual(new Map([["/_next/static/a.js", 500]]));
  });

  test("records are the store's own: mutating an object passed in or read out changes nothing stored", async () => {
    const store = makeStore();
    const token = await store.beginSave();
    const passed = copyOf(SHOW_A, OLD_LINK, VIEWER_1, token.ordinal);
    await store.commitIfCurrent(token, passed);
    // Nested arrays too: a shallow copy on the way in or out would still share them.
    passed.viewer = VIEWER_2;
    (passed.assets as string[]).push("/api/asset/agenda/added-after-commit");

    const read = await store.copyByShow(SHOW_A);
    if (read === null) throw new Error("premise: the committed copy is readable");
    read.lastOpenedAt = 99_999;
    read.endedAt = 1;
    (read.statics as string[]).push("/_next/static/added-after-read.js");

    expect(await store.copyByShow(SHOW_A)).toEqual(
      copyOf(SHOW_A, OLD_LINK, VIEWER_1, token.ordinal),
    );
  });
});

describe("the IndexedDB adapter", () => {
  test("the generation survives a restart: a save begun before it cannot commit after a purge made after it", async () => {
    const factory = new IDBFactory();
    const before = createIdbStore(factory);
    // Exactly one purge, so the token's generation equals what an unpersisted
    // counter (starting over at its initial value) would reach after the one
    // purge below; only a persisted counter refuses the commit.
    await before.purge({ by: "all" });
    const token = await before.beginSave();
    before.close();

    const after = createIdbStore(factory);
    await after.purge({ by: "show", showId: SHOW_A });
    expect(
      await after.commitIfCurrent(token, copyOf(SHOW_A, NEW_LINK, VIEWER_1, token.ordinal)),
    ).toBe("stale-generation");
    expect((await after.beginSave()).generation).toBe(token.generation + 1);
  });

  test("the next ordinal survives a restart, so a new save can replace a copy committed before it", async () => {
    const factory = new IDBFactory();
    const before = createIdbStore(factory);
    const older: SaveToken = await before.beginSave();
    await save(before, SHOW_A, OLD_LINK, VIEWER_1);
    before.close();

    const after = createIdbStore(factory);
    expect(
      await after.commitIfCurrent(older, copyOf(SHOW_A, OLD_LINK, VIEWER_2, older.ordinal)),
    ).toBe("stale-ordinal");
    await save(after, SHOW_A, NEW_LINK, VIEWER_2);
    expect((await after.copyByShow(SHOW_A))?.url).toBe(NEW_LINK);
  });

  test.each(["committed", "stale-generation", "stale-ordinal"] as const)(
    "a commit that ends %s is exactly one read-write transaction over copies and meta",
    async (expected) => {
      const store = createIdbStore(new IDBFactory());
      const older = await store.beginSave();
      await save(store, SHOW_A, OLD_LINK, VIEWER_1);
      const fresh = await store.beginSave();
      if (expected === "stale-generation") await store.purge({ by: "url", url: UNRELATED_LINK });
      const token = expected === "stale-ordinal" ? older : fresh;

      const transaction = vi.spyOn(FakeIDBDatabase.prototype, "transaction");
      const outcome = await store.commitIfCurrent(
        token,
        copyOf(SHOW_A, NEW_LINK, VIEWER_2, token.ordinal),
      );

      expect(outcome).toBe(expected);
      expect(transaction).toHaveBeenCalledTimes(1);
      const [scope, mode] = transaction.mock.calls[0] ?? [];
      expect([scope].flat().sort()).toEqual([COPIES_STORE, META_STORE].sort());
      expect(mode).toBe("readwrite");
    },
  );

  const METHODS: ReadonlyArray<
    readonly [string, IDBTransactionMode, (store: SavedCopyStore) => Promise<unknown>]
  > = [
    ["beginSave", "readwrite", (s) => s.beginSave()],
    ["purge", "readwrite", (s) => s.purge({ by: "all" })],
    ["copyAtUrl", "readonly", (s) => s.copyAtUrl(OLD_LINK)],
    ["copyByShow", "readonly", (s) => s.copyByShow(SHOW_A)],
    ["listCopies", "readonly", (s) => s.listCopies()],
    ["markEnded", "readwrite", (s) => s.markEnded({ showId: SHOW_A, ordinal: 0 }, 1)],
    ["touchOpened", "readwrite", (s) => s.touchOpened({ showId: SHOW_A, ordinal: 0 }, 1)],
    ["evict", "readwrite", (s) => s.evict({ showId: SHOW_A, ordinal: 0 })],
    ["recordStatics", "readwrite", (s) => s.recordStatics(["/_next/static/a.js"], 1)],
    ["staticIndex", "readonly", (s) => s.staticIndex()],
    ["deleteStatics", "readwrite", (s) => s.deleteStatics(["/_next/static/a.js"])],
  ];
  test.each(METHODS)("%s is one %s transaction", async (_label, mode, call) => {
    const store = createIdbStore(new IDBFactory());
    await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    const transaction = vi.spyOn(FakeIDBDatabase.prototype, "transaction");
    await call(store);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[1]).toBe(mode);
  });

  test("copyAtUrl reads through the unique url index, not a scan of every copy", async () => {
    const store = createIdbStore(new IDBFactory());
    await save(store, SHOW_A, OLD_LINK, VIEWER_1);
    await save(store, SHOW_B, B_LINK, VIEWER_1);
    const indexGet = vi.spyOn(FakeIDBIndex.prototype, "get");
    const getAll = vi.spyOn(FakeIDBObjectStore.prototype, "getAll");
    const openCursor = vi.spyOn(FakeIDBObjectStore.prototype, "openCursor");

    expect((await store.copyAtUrl(B_LINK))?.showId).toBe(SHOW_B);
    expect(indexGet).toHaveBeenCalledTimes(1);
    expect(indexGet.mock.calls[0]?.[0]).toBe(B_LINK);
    const index = indexGet.mock.contexts[0] as IDBIndex;
    expect(index.name).toBe(URL_INDEX);
    expect(index.unique).toBe(true);
    expect(getAll).not.toHaveBeenCalled();
    expect(openCursor).not.toHaveBeenCalled();
  });

  test("the database has the schema's stores, a meta record, and refuses two copies at one URL", async () => {
    const factory = new IDBFactory();
    const store = createIdbStore(factory);
    await save(store, SHOW_A, OLD_LINK, VIEWER_1);

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = factory.open(DB_NAME);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    expect(db.version).toBe(SCHEMA_VERSION);
    expect(Array.from(db.objectStoreNames).sort()).toEqual(
      [COPIES_STORE, META_STORE, STATICS_STORE].sort(),
    );

    const read = db.transaction([COPIES_STORE, META_STORE], "readonly");
    const copies = read.objectStore(COPIES_STORE);
    expect(copies.keyPath).toBe("showId");
    expect(copies.index(URL_INDEX).keyPath).toBe("url");
    expect(copies.index(URL_INDEX).unique).toBe(true);
    const meta = await new Promise((resolve) => {
      const request = read.objectStore(META_STORE).get(META_KEY);
      request.onsuccess = () => resolve(request.result);
    });
    expect(meta).toEqual({ generation: 0, nextOrdinal: 1, schemaVersion: SCHEMA_VERSION });

    const write = db.transaction(COPIES_STORE, "readwrite");
    const refused = await new Promise<string | undefined>((resolve) => {
      const request = write.objectStore(COPIES_STORE).put(copyOf(SHOW_B, OLD_LINK, VIEWER_2, 5));
      request.onerror = (event) => {
        event.preventDefault();
        resolve(request.error?.name);
      };
      request.onsuccess = () => resolve("stored");
    });
    expect(refused).toBe("ConstraintError");
    db.close();
  });

  test("deleting the database from another context is not blocked by the adapter, which then refuses calls", async () => {
    const factory = new IDBFactory();
    const store = createIdbStore(factory);
    await store.beginSave();

    const outcome = await new Promise<string>((resolve) => {
      const request = factory.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve("deleted");
      request.onblocked = () => resolve("blocked");
      request.onerror = () => resolve("error");
    });
    expect(outcome).toBe("deleted");
    // A worker whose database was deleted or upgraded under it is obsolete; it
    // must not recreate the database and commit into it.
    await expect(store.beginSave()).rejects.toThrow();
  });
});
