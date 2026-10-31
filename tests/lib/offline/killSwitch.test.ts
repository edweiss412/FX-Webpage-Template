import vm from "node:vm";
import { describe, expect, test } from "vitest";
import { premiseHolds } from "@/tests/_shared/premise";
import { KILL_SWITCH_SOURCE, crewOfflineDisabled } from "@/lib/offline/killSwitch";
import { ASSET_CACHE, CACHE_PREFIX, DB_NAME, STATIC_CACHE } from "@/lib/offline/storeSchema";

// The self-removing worker (spec 4.10), run as a worker would run it: as a
// script in a global scope, against fakes that record what it touches. The same
// source runs in a real browser in the end-to-end suite; this is the fast check
// of what it asks for.

type Listener = (event: FakeEvent) => void;
type FakeEvent = { waitUntil: (work: Promise<unknown>) => void };

type Scenario = {
  /** Cache Storage names present when the worker runs. */
  cacheNames?: readonly string[];
  /** Make `caches.keys()` reject. */
  cachesKeysFails?: boolean;
  /** Make `caches.delete(name)` reject for these names. */
  cachesDeleteFails?: readonly string[];
  /** How the database delete settles. */
  deleteDatabase?: "success" | "error" | "blocked" | "throws";
  /** Make `registration.unregister()` reject. */
  unregisterFails?: boolean;
};

/** A cache name the worker must leave alone, whatever the harness. */
const FOREIGN_NAMES = [
  "workbox-precache-v2",
  "next-static",
  "x-fxav-assets-v1",
  "FXAV-assets-v1",
  "fxav",
] as const;

function runWorker(source: string, scenario: Scenario = {}) {
  const listeners = new Map<string, Listener[]>();
  const deletedCaches: string[] = [];
  const deletedDatabases: string[] = [];
  const calls = { skipWaiting: 0, unregister: 0 };
  let names = [...(scenario.cacheNames ?? [])];

  const scope = {
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    skipWaiting() {
      calls.skipWaiting += 1;
      return Promise.resolve();
    },
    registration: {
      unregister() {
        calls.unregister += 1;
        return scenario.unregisterFails
          ? Promise.reject(new Error("unregister refused"))
          : Promise.resolve(true);
      },
    },
  };
  const caches = {
    keys() {
      return scenario.cachesKeysFails
        ? Promise.reject(new Error("keys refused"))
        : Promise.resolve([...names]);
    },
    delete(name: string) {
      if (scenario.cachesDeleteFails?.includes(name)) {
        return Promise.reject(new Error(`delete refused: ${name}`));
      }
      deletedCaches.push(name);
      names = names.filter((existing) => existing !== name);
      return Promise.resolve(true);
    },
  };
  const indexedDB = {
    deleteDatabase(name: string) {
      deletedDatabases.push(name);
      if (scenario.deleteDatabase === "throws") throw new Error("indexedDB unavailable");
      const request: { onsuccess?: () => void; onerror?: () => void; onblocked?: () => void } = {};
      const settle = scenario.deleteDatabase ?? "success";
      // Handlers are assigned synchronously after the call returns, so settle later.
      setTimeout(() => {
        if (settle === "success") request.onsuccess?.();
        else if (settle === "error") request.onerror?.();
        else request.onblocked?.();
      }, 0);
      return request;
    },
  };

  vm.runInNewContext(source, { self: scope, caches, indexedDB });

  /** Fire one event and wait for everything the worker handed to `waitUntil`. */
  async function dispatch(type: string): Promise<void> {
    const pending: Promise<unknown>[] = [];
    for (const listener of listeners.get(type) ?? []) {
      listener({ waitUntil: (work) => pending.push(work) });
    }
    await Promise.all(pending);
  }

  return {
    registeredTypes: () => [...listeners.keys()].sort(),
    deletedCaches,
    deletedDatabases,
    calls,
    dispatch,
  };
}

describe("crewOfflineDisabled", () => {
  test("is true only for the exact value 1", () => {
    expect(crewOfflineDisabled({ CREW_OFFLINE_DISABLED: "1" })).toBe(true);
  });

  test.each([
    ["unset", {}],
    ["undefined", { CREW_OFFLINE_DISABLED: undefined }],
    ["empty", { CREW_OFFLINE_DISABLED: "" }],
    ["0", { CREW_OFFLINE_DISABLED: "0" }],
    ["true", { CREW_OFFLINE_DISABLED: "true" }],
    ["yes", { CREW_OFFLINE_DISABLED: "yes" }],
    ["11", { CREW_OFFLINE_DISABLED: "11" }],
  ])("is false when the variable is %s", (_label, env) => {
    expect(crewOfflineDisabled(env)).toBe(false);
  });

  test("ignores every other variable", () => {
    expect(crewOfflineDisabled({ OTHER: "1", CREW_OFFLINE_DISABLE: "1" })).toBe(false);
  });
});

describe("KILL_SWITCH_SOURCE", () => {
  test("harness premise: a source that does register a fetch listener is seen doing so", () => {
    const probe = runWorker('self.addEventListener("fetch", () => {});');
    premiseHolds(
      "the fake worker scope records listeners, or the no-fetch assertion below sees nothing",
      probe.registeredTypes().includes("fetch"),
    );
  });

  test("harness premise: the foreign names are ones a looser prefix test would delete", () => {
    premiseHolds(
      "each foreign name would be deleted by an includes() match, or the only-fxav- case discriminates nothing",
      FOREIGN_NAMES.some((name) => name.toLowerCase().includes(CACHE_PREFIX)) &&
        FOREIGN_NAMES.every((name) => !name.startsWith(CACHE_PREFIX)),
    );
  });

  test("is a non-empty script", () => {
    expect(KILL_SWITCH_SOURCE.length).toBeGreaterThan(0);
  });

  test("registers install and activate handlers and no fetch handler", () => {
    const worker = runWorker(KILL_SWITCH_SOURCE);
    expect(worker.registeredTypes()).toEqual(["activate", "install"]);
  });

  test("install skips waiting so the switch takes effect on the next check", async () => {
    const worker = runWorker(KILL_SWITCH_SOURCE);
    await worker.dispatch("install");
    expect(worker.calls.skipWaiting).toBe(1);
  });

  test("activate deletes every fxav- cache, the database, and unregisters", async () => {
    const owned = [ASSET_CACHE, STATIC_CACHE, `${CACHE_PREFIX}assets-v0`, `${CACHE_PREFIX}other`];
    const worker = runWorker(KILL_SWITCH_SOURCE, {
      cacheNames: [...owned, ...FOREIGN_NAMES],
    });
    await worker.dispatch("activate");

    expect([...worker.deletedCaches].sort()).toEqual([...owned].sort());
    expect(worker.deletedDatabases).toEqual([DB_NAME]);
    expect(worker.calls.unregister).toBe(1);
  });

  test("activate leaves every foreign cache alone", async () => {
    const worker = runWorker(KILL_SWITCH_SOURCE, { cacheNames: [...FOREIGN_NAMES] });
    await worker.dispatch("activate");

    expect(worker.deletedCaches).toEqual([]);
    expect(worker.deletedDatabases).toEqual([DB_NAME]);
    expect(worker.calls.unregister).toBe(1);
  });

  test("install touches no cache, database or registration", async () => {
    const worker = runWorker(KILL_SWITCH_SOURCE, { cacheNames: [ASSET_CACHE] });
    await worker.dispatch("install");

    expect(worker.deletedCaches).toEqual([]);
    expect(worker.deletedDatabases).toEqual([]);
    expect(worker.calls.unregister).toBe(0);
  });

  test.each(["success", "error", "blocked"] as const)(
    "activate finishes and unregisters when the database delete ends in %s",
    async (deleteDatabase) => {
      const worker = runWorker(KILL_SWITCH_SOURCE, { deleteDatabase });
      await worker.dispatch("activate");
      expect(worker.deletedDatabases).toEqual([DB_NAME]);
      expect(worker.calls.unregister).toBe(1);
    },
  );

  // A worker that cannot be switched off is the failure this file exists to
  // prevent, so one failing step must not stop the others, and above all must
  // not stop the unregister.
  test("one failing step does not stop the others", async () => {
    const cases: Array<[string, Scenario]> = [
      ["caches.keys rejects", { cachesKeysFails: true }],
      ["a cache delete rejects", { cachesDeleteFails: [ASSET_CACHE] }],
      ["the database delete throws", { deleteDatabase: "throws" }],
    ];
    for (const [label, scenario] of cases) {
      const worker = runWorker(KILL_SWITCH_SOURCE, {
        cacheNames: [ASSET_CACHE, STATIC_CACHE],
        ...scenario,
      });
      await worker.dispatch("activate");
      expect(worker.calls.unregister, label).toBe(1);
      if (!scenario.cachesKeysFails) expect(worker.deletedCaches, label).toContain(STATIC_CACHE);
      if (scenario.deleteDatabase !== "throws") {
        expect(worker.deletedDatabases, label).toEqual([DB_NAME]);
      }
    }
  });

  test("activate settles even when unregister rejects", async () => {
    const worker = runWorker(KILL_SWITCH_SOURCE, {
      cacheNames: [ASSET_CACHE],
      unregisterFails: true,
    });
    await worker.dispatch("activate");
    expect(worker.deletedCaches).toEqual([ASSET_CACHE]);
    expect(worker.calls.unregister).toBe(1);
  });
});
