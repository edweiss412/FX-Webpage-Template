import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDBFactory as FakeIDBFactory, IDBObjectStore as FakeIDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, test, vi } from "vitest";
import { premise, premiseHolds } from "@/tests/_shared/premise";
import { createIdbStore } from "@/lib/offline/idbStore";
import { requiredStaticUrls } from "@/lib/offline/completeness";
import { formatSavedTime } from "@/lib/offline/format";
import { injectSavedCopyHead } from "@/lib/offline/inject";
import { markerAttributes, type Marker, type SaveMarker } from "@/lib/offline/marker";
import { notSavedPageHtml } from "@/lib/offline/notSavedPage";
import {
  OUTCOME_OF,
  parsePageMessage,
  savedCopyStatusUrl,
  statusOutcomeOf,
} from "@/lib/offline/protocol";
import { createMemoryStore, type SavedCopyStore, type StoredCopy } from "@/lib/offline/store";
import {
  ASSET_CACHE,
  COPIES_STORE,
  DB_NAME,
  META_STORE,
  STATIC_CACHE,
} from "@/lib/offline/storeSchema";
import { installWorker } from "@/lib/offline/worker/install";
import type {
  CacheLike,
  CacheStorageLike,
  Clients,
  Timers,
  WindowClient,
  WorkerScope,
} from "@/lib/offline/worker/swTypes";

// The worker's handlers, driven end to end: real Request, Response, Headers,
// AbortController and MessageChannel; fake event objects, caches, network,
// clock and clients. Every expected value is written from a spec section
// (4.2, 4.4, 4.5, 4.6, 4.7.1, 4.7.3, 4.8, 4.9), never read back from the
// handlers. Timings are spec literals: 8 s page budget, 60 s continuation,
// 5 s status route and asset timeout.
//
// U is the request path; S(U) the copy saved at U; C(X) show X's one copy.

const ORIGIN = "https://crew.example";
const U = "/show/east-coast/tok-current";
const U_OLD = "/show/east-coast/tok-before-reset";
const B_URL = "/show/rpas/tok-rpas";
const SHOW = "3f2b8c1e-9d4a-4e6b-8a57-1c2d3e4f5a6b";
const SHOW_B = "9a7c1d20-5b3e-4f18-9c64-0e2b7a8d1f35";
const VIEWER = "q3Xk-9_LmZpRt2VbYw0aGhJ4";
const OTHER_VIEWER = "Zp0-mN4_rTq8sWx2yB6cDe1F";
const RENDERED = "2026-10-27T10:00:00.000Z";
const LATER = "2026-10-27T11:30:00.000Z";
const START = Date.parse("2026-10-27T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const MB = 1024 * 1024;

const CSS = "/_next/static/css/app.css";
const CHUNK = "/_next/static/chunks/main.js";
const FONT = "/fonts/inter.woff2";
const CSS_BODY = `@font-face{font-family:Inter;src:url(${FONT}) format("woff2")}`;
const DIAGRAM = `/api/asset/diagram/${SHOW}/rev-1/stage.png`;
const AGENDA = `/api/asset/agenda/${SHOW}/file-1`;
const STATUS = "/api/saved-copy/status";

/**
 * A post-stream notFound() as production sends it (fix-task-25 D1): HTTP 200, no
 * marker element, Next's not-found digest in the payload. Capture and trim are
 * recorded in tests/lib/offline/marker.test.ts.
 */
const STREAMED_NOT_FOUND = readFileSync(
  join(process.cwd(), "tests", "lib", "offline", "fixtures", "crew-not-found-streamed.html"),
  "utf8",
);

// --- Fixtures -------------------------------------------------------------------

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/** A crew-route document: two static files in the head and, when given, the marker. */
function page(marker: Marker | null, label = "live page"): string {
  const template =
    marker === null
      ? ""
      : `<template ${Object.entries(markerAttributes(marker))
          .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
          .join(" ")}></template>`;
  return (
    `<!doctype html><html lang="en"><head><link rel="stylesheet" href="${CSS}">` +
    `<script src="${CHUNK}" async></script></head>` +
    `<body><main>${label}</main>${template}</body></html>`
  );
}

function save(overrides: Partial<SaveMarker> = {}): SaveMarker {
  return {
    disposition: "save",
    showId: SHOW,
    renderedAt: RENDERED,
    epoch: 3,
    viewer: VIEWER,
    assets: [],
    ...overrides,
  };
}

function savedLabel(showId: string, url: string): string {
  return `saved copy of ${showId} at ${url}`;
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Lets every queued promise, port message and timer-free continuation run. */
async function settle(): Promise<void> {
  for (let round = 0; round < 25; round += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

function htmlResponse(html: string, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...headers },
  });
}

/** What a browser's fetch with `redirect: "manual"` returns for a redirect. */
function opaqueRedirect(): Response {
  const response = new Response(null, { status: 302, headers: { location: "/elsewhere" } });
  Object.defineProperty(response, "type", { value: "opaqueredirect" });
  return response;
}

/** A body that sends some bytes and then fails, as a dropped connection does. */
function brokenBody(): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("<!doctype html><html><head>"));
      controller.error(new TypeError("connection reset"));
    },
  });
  return new Response(stream, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** A body that sends some bytes and then nothing more, never ending, as a stalled connection does. */
function stalledBody(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("partial"));
    },
  });
}

/** `totalBytes` of zeros in `chunkBytes` pieces, counting how often the reader pulled. */
function counted(
  totalBytes: number,
  chunkBytes: number,
): { body: ReadableStream; pulls: () => number } {
  const chunk = new Uint8Array(chunkBytes);
  let sent = 0;
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      if (sent >= totalBytes) {
        controller.close();
        return;
      }
      const size = Math.min(chunkBytes, totalBytes - sent);
      controller.enqueue(size === chunkBytes ? chunk : chunk.subarray(0, size));
      sent += size;
    },
  });
  return { body, pulls: () => pulls };
}

// --- Fakes ------------------------------------------------------------------------

type Call = {
  url: string;
  path: string;
  pathname: string;
  request: Request | null;
  init: RequestInit | undefined;
};
type Route = (call: Call) => Promise<Response>;

const refuse: Route = () => Promise.reject(new TypeError("Failed to fetch"));
const hang: Route = () => new Promise<Response>(() => undefined);
const reply =
  (make: () => Response): Route =>
  () =>
    Promise.resolve(make());
const later =
  (gate: Deferred<Response>): Route =>
  () =>
    gate.promise;

class FakeNetwork {
  private readonly routes = new Map<string, Route>();
  readonly calls: Call[] = [];
  readonly unrouted: string[] = [];

  /** Routes by path plus query first, then by path alone. */
  on(path: string, route: Route): void {
    this.routes.set(path, route);
  }

  callsTo(pathname: string): Call[] {
    return this.calls.filter((call) => call.pathname === pathname);
  }

  readonly fetch = (input: Request | string, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? new URL(input, ORIGIN).href : input.url;
    const parsed = new URL(url);
    const call: Call = {
      url,
      path: parsed.pathname + parsed.search,
      pathname: parsed.pathname,
      request: typeof input === "string" ? null : input,
      init,
    };
    this.calls.push(call);
    const route = this.routes.get(call.path) ?? this.routes.get(call.pathname);
    if (route === undefined) {
      this.unrouted.push(call.path);
      return Promise.reject(new TypeError(`unrouted: ${call.path}`));
    }
    const result = route(call);
    const signal = init?.signal ?? call.request?.signal;
    if (signal === undefined || signal === null) return result;
    return new Promise<Response>((resolve, reject) => {
      const abort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      if (signal.aborted) {
        abort();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      result.then(resolve, reject);
    });
  };
}

type Entry = { bytes: Uint8Array; status: number; headers: [string, string][] };

class FakeCache implements CacheLike {
  readonly entries = new Map<string, Entry>();
  failPut: ((url: string) => boolean) | null = null;
  failMatch = false;
  /** While set, `keys` waits on it and then lists the entries as they are by then. */
  keysGate: Promise<void> | null = null;
  /** While set, `delete` removes the entry at once and settles only when the gate opens. */
  deleteGate: Promise<void> | null = null;
  /** While set, `match` reads the entry at once and answers only when the gate opens. */
  matchGate: Promise<void> | null = null;

  async match(url: string): Promise<Response | undefined> {
    if (this.failMatch) throw new DOMException("The cache could not be read.", "UnknownError");
    const entry = this.entries.get(url);
    if (this.matchGate !== null) await this.matchGate;
    if (entry === undefined) return undefined;
    return new Response(entry.bytes.slice(), { status: entry.status, headers: entry.headers });
  }

  async put(url: string, response: Response): Promise<void> {
    if (this.failPut?.(url)) {
      throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    this.entries.set(url, { bytes, status: response.status, headers: [...response.headers] });
  }

  async delete(url: string): Promise<boolean> {
    const had = this.entries.delete(url);
    if (this.deleteGate !== null) await this.deleteGate;
    return had;
  }

  async keys(): Promise<readonly Request[]> {
    if (this.keysGate !== null) await this.keysGate;
    return [...this.entries.keys()].map((url) => new Request(url));
  }

  /** Root-relative path plus query of every entry, sorted. */
  paths(): string[] {
    return [...this.entries.keys()]
      .map((url) => {
        const parsed = new URL(url);
        return parsed.pathname + parsed.search;
      })
      .sort();
  }

  seed(path: string, body: string | Uint8Array, headers: Record<string, string> = {}): void {
    this.entries.set(ORIGIN + path, {
      bytes: typeof body === "string" ? new TextEncoder().encode(body) : body,
      status: 200,
      headers: Object.entries(headers),
    });
  }
}

class FakeCacheStorage implements CacheStorageLike {
  readonly caches = new Map<string, FakeCache>();
  failOpen = false;

  cache(name: string): FakeCache {
    let cache = this.caches.get(name);
    if (cache === undefined) {
      cache = new FakeCache();
      this.caches.set(name, cache);
    }
    return cache;
  }

  async open(name: string): Promise<CacheLike> {
    if (this.failOpen) throw new DOMException("Cache Storage is unavailable.", "UnknownError");
    return this.cache(name);
  }

  async keys(): Promise<readonly string[]> {
    return [...this.caches.keys()];
  }

  async delete(name: string): Promise<boolean> {
    return this.caches.delete(name);
  }
}

class Clock implements Timers {
  t = START;
  private nextId = 1;
  private readonly due = new Map<number, { at: number; run: () => void }>();

  readonly now = (): number => this.t;

  setTimeout(run: () => void, ms: number): number {
    const id = this.nextId;
    this.nextId += 1;
    this.due.set(id, { at: this.t + ms, run });
    return id;
  }

  clearTimeout(handle: number): void {
    this.due.delete(handle);
  }

  /** Moves time forward, firing each timer due on the way in order, settling in between. */
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      await settle();
      let nextId = -1;
      let nextAt = Number.POSITIVE_INFINITY;
      for (const [id, timer] of this.due) {
        if (timer.at <= target && timer.at < nextAt) {
          nextId = id;
          nextAt = timer.at;
        }
      }
      const timer = this.due.get(nextId);
      if (timer === undefined) break;
      this.due.delete(nextId);
      this.t = timer.at;
      timer.run();
    }
    this.t = target;
    await settle();
  }
}

class FakePage implements WindowClient {
  readonly received: unknown[] = [];
  constructor(readonly url: string) {}
  postMessage(message: unknown): void {
    this.received.push(message);
  }
}

class FakeClients implements Clients {
  readonly pages: FakePage[] = [];
  claims = 0;

  open(path: string): FakePage {
    const page = new FakePage(ORIGIN + path);
    this.pages.push(page);
    return page;
  }

  async matchAll(): Promise<readonly WindowClient[]> {
    return this.pages;
  }

  async claim(): Promise<void> {
    this.claims += 1;
  }
}

// --- The worker under test ------------------------------------------------------

type Dispatched = {
  responded: Promise<Response> | null;
  /** The event's waitUntil promises, settled, then every queued continuation. */
  settled: () => Promise<void>;
  /** The event's waitUntil promises alone: when the browser may stop the worker. */
  extended: () => Promise<void>;
};

type Sent = {
  replies: unknown[];
  settled: () => Promise<void>;
  extended: () => Promise<void>;
  close: () => void;
};

const NO_REPLY = { outcome: "no reply on the port" };

function navRequest(
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {},
) {
  const request = new Request(ORIGIN + path, {
    method: init.method ?? "GET",
    ...(init.headers === undefined ? {} : { headers: init.headers }),
    redirect: "manual",
  });
  // Node's Request refuses mode "navigate"; the worker only reads the property.
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
}

function boot(
  options: { store?: SavedCopyStore; indexedDB?: Pick<IDBFactory, "deleteDatabase"> } = {},
) {
  const listeners = new Map<string, (event: unknown) => void>();
  let skipWaitingCalls = 0;
  const scope: WorkerScope = {
    location: { origin: ORIGIN },
    addEventListener(type, listener) {
      listeners.set(type, listener as unknown as (event: unknown) => void);
    },
    async skipWaiting() {
      skipWaitingCalls += 1;
    },
  };
  const store = options.store ?? createMemoryStore();
  const caches = new FakeCacheStorage();
  const net = new FakeNetwork();
  const clock = new Clock();
  const clients = new FakeClients();
  net.on(
    CSS,
    reply(() => new Response(CSS_BODY, { headers: { "content-type": "text/css" } })),
  );
  net.on(
    CHUNK,
    reply(() => new Response("console.log(1)", { headers: { "content-type": "text/javascript" } })),
  );
  net.on(
    FONT,
    reply(
      () =>
        new Response(new Uint8Array([119, 79, 70, 50]), {
          headers: { "content-type": "font/woff2" },
        }),
    ),
  );

  installWorker(scope, {
    store,
    cacheStorage: caches,
    // A database of its own, so a case that never escalates deletes nothing it reads.
    indexedDB: options.indexedDB ?? new FakeIDBFactory(),
    fetch: net.fetch,
    now: clock.now,
    clients,
    timers: clock,
  });

  function dispatchFetch(request: Request): Dispatched {
    const out: Dispatched = {
      responded: null,
      settled: async () => undefined,
      extended: async () => undefined,
    };
    const waits: Promise<unknown>[] = [];
    listeners.get("fetch")?.({
      request,
      respondWith(response: Response | Promise<Response>) {
        out.responded = Promise.resolve(response);
      },
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
    });
    out.extended = async () => {
      await Promise.all(waits);
    };
    out.settled = async () => {
      await Promise.all(waits);
      await settle();
    };
    return out;
  }

  function post(data: unknown): Sent {
    const channel = new MessageChannel();
    const replies: unknown[] = [];
    channel.port1.onmessage = (event: MessageEvent) => {
      replies.push(event.data);
    };
    const waits: Promise<unknown>[] = [];
    listeners.get("message")?.({
      data,
      ports: [channel.port2],
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
    });
    return {
      replies,
      settled: async () => {
        await Promise.all(waits);
        await settle();
      },
      extended: async () => {
        await Promise.all(waits);
      },
      close: () => channel.port1.close(),
    };
  }

  async function lifecycle(type: "install" | "activate"): Promise<void> {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({
      waitUntil(promise: Promise<unknown>) {
        waits.push(promise);
      },
    });
    await Promise.all(waits);
    await settle();
  }

  return {
    store,
    caches,
    net,
    clock,
    clients,
    staticCache: () => caches.cache(STATIC_CACHE),
    assetCache: () => caches.cache(ASSET_CACHE),
    skipWaitingCalls: () => skipWaitingCalls,
    listens: (type: string) => listeners.has(type),
    dispatchFetch,
    navigate: (path: string, init?: { method?: string; headers?: Record<string, string> }) =>
      dispatchFetch(navRequest(path, init)),
    post,
    /** Posts, waits for the worker's work, and returns its reply or NO_REPLY. */
    async ask(data: unknown): Promise<unknown> {
      const sent = post(data);
      await sent.settled();
      sent.close();
      return sent.replies[0] ?? NO_REPLY;
    },
    lifecycle,
    /** Commits a copy directly through the store, as an earlier visit would have. */
    async seed(
      copy: Partial<StoredCopy> & Pick<StoredCopy, "showId" | "url">,
    ): Promise<StoredCopy> {
      const token = await store.beginSave();
      const full: StoredCopy = {
        html: page(save({ showId: copy.showId }), savedLabel(copy.showId, copy.url)),
        viewer: VIEWER,
        epoch: 3,
        savedAt: RENDERED,
        ordinal: 0,
        assets: [],
        statics: [],
        endedAt: null,
        lastOpenedAt: START - DAY_MS,
        ...copy,
      };
      const outcome = await store.commitIfCurrent(token, full);
      if (outcome !== "committed") throw new Error(`seed did not commit: ${outcome}`);
      return { ...full, ordinal: token.ordinal };
    },
  };
}

type Worker = ReturnType<typeof boot>;

function responseOf(dispatched: Dispatched): Promise<Response> {
  if (dispatched.responded === null) throw new Error("the worker did not call respondWith");
  return dispatched.responded;
}

/** Navigates, waits for the served response and for every background step. */
async function open(
  worker: Worker,
  path: string,
  init?: { method?: string; headers?: Record<string, string> },
): Promise<Response> {
  const nav = worker.navigate(path, init);
  const response = await responseOf(nav);
  await nav.settled();
  return response;
}

function servedMode(html: string): string | null {
  return /<meta name="fxav-served" content="([^"]*)"/.exec(html)?.[1] ?? null;
}

/** Tracks whether a promise has settled yet, without awaiting it. */
function watch<T>(promise: Promise<T>): { done: () => boolean } {
  let done = false;
  promise.then(
    () => {
      done = true;
    },
    () => {
      done = true;
    },
  );
  return { done: () => done };
}

function statusAnswer(state: "ended" | "gone"): Route {
  return reply(() => Response.json({ state }, { headers: { "cache-control": "no-store" } }));
}

/** The memory store, with the named methods rejecting as a full phone's store does once `broken`. */
function faultyStore(methods: readonly (keyof SavedCopyStore)[]) {
  const inner = createMemoryStore();
  const state = { broken: false };
  const store: SavedCopyStore = { ...inner };
  const writable = store as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  for (const name of methods) {
    const original = inner[name] as (...args: unknown[]) => Promise<unknown>;
    writable[name] = (...args: unknown[]) =>
      state.broken
        ? Promise.reject(new DOMException("The quota has been exceeded.", "QuotaExceededError"))
        : original(...args);
  }
  return { store, state };
}

/** A store whose staticIndex reads the index, then waits, then answers with that read. */
function gatedStaticIndex() {
  const inner = createMemoryStore();
  const gate = deferred<void>();
  let calls = 0;
  const store: SavedCopyStore = {
    ...inner,
    async staticIndex() {
      calls += 1;
      const snapshot = await inner.staticIndex();
      await gate.promise;
      return snapshot;
    },
  };
  return { store, gate, calls: () => calls };
}

/** A store whose touchOpened waits on a gate: the last wait inside serveCopy before it re-reads S(U). */
function gatedTouch() {
  const inner = createMemoryStore();
  const gate = deferred<void>();
  let calls = 0;
  const store: SavedCopyStore = {
    ...inner,
    async touchOpened(ref, openedAt) {
      calls += 1;
      await gate.promise;
      return inner.touchOpened(ref, openedAt);
    },
  };
  return { store, gate, calls: () => calls };
}

// --- The wire contract -----------------------------------------------------------

describe("protocol", () => {
  test("the status-route URL carries the four parameters of spec 4.5 and nothing else", () => {
    const url = new URL(
      savedCopyStatusUrl({ showId: SHOW, epoch: 7, viewer: VIEWER, savedAt: RENDERED }),
      ORIGIN,
    );
    expect(url.origin).toBe(ORIGIN);
    expect(url.pathname).toBe("/api/saved-copy/status");
    expect([...url.searchParams.keys()].sort()).toEqual(["epoch", "saved", "show", "viewer"]);
    expect(url.searchParams.get("show")).toBe(SHOW);
    expect(url.searchParams.get("epoch")).toBe("7");
    expect(url.searchParams.get("viewer")).toBe(VIEWER);
    expect(url.searchParams.get("saved")).toBe(RENDERED);
  });

  test.each([
    [200, '{"state":"ended"}', "ended"],
    [200, '{"state":"gone"}', "gone"],
    [500, '{"error":"SAVED_COPY_STATUS_LOOKUP_FAILED"}', "no-verdict"],
    [502, "", "no-verdict"],
    [503, "<html>Service Unavailable</html>", "no-verdict"],
    [404, "<html>Not Found</html>", "no-verdict"],
    [200, "<!doctype html><html>sign in</html>", "no-verdict"],
    [200, '{"state":"ENDED"}', "no-verdict"],
    [200, '{"state":"maybe"}', "no-verdict"],
    [200, "null", "no-verdict"],
    [200, '["ended"]', "no-verdict"],
    [201, '{"state":"ended"}', "no-verdict"],
  ] as const)("status %i with body %s reads as %s", (status, body, expected) => {
    expect(statusOutcomeOf(status, body)).toBe(expected);
  });

  test("one outcome table maps every run result to the six page outcomes (ruling D4)", () => {
    expect(OUTCOME_OF).toEqual({
      committed: "saved",
      "commit-failed": "failed",
      purged: "purged",
      "marked-ended": "ended",
      unchanged: "kept",
      "no-response": "failed",
      skipped: "skipped",
    });
    expect(new Set(Object.values(OUTCOME_OF))).toEqual(
      new Set(["saved", "purged", "ended", "failed", "skipped", "kept"]),
    );
  });

  test.each([
    [{ type: "marker", disposition: "purge", showId: SHOW, url: U }],
    [{ type: "marker", disposition: "purge", showId: null, url: U }],
    [{ type: "marker", disposition: "check", url: U }],
    [{ type: "ensure-saved", url: U, renderedAt: RENDERED }],
    [{ type: "probe", url: U }],
    [{ type: "purge-show", showId: SHOW }],
  ])("reads the page message %j", (message) => {
    expect(parsePageMessage(message)).toEqual(message);
  });

  test.each([
    [null],
    ["probe"],
    [{ type: "probe" }],
    [{ type: "probe", url: 7 }],
    [{ type: "probe", url: "" }],
    [{ type: "marker", disposition: "save", url: U }],
    [{ type: "marker", disposition: "purge", url: U }],
    [{ type: "marker", disposition: "purge", showId: 3, url: U }],
    [{ type: "ensure-saved", url: U }],
    [{ type: "purge-show", showId: "" }],
    [{ type: "purge-all" }],
  ])("refuses %j", (message) => {
    expect(parsePageMessage(message)).toBeNull();
  });
});

// --- Scope (spec 4.2) -----------------------------------------------------------------

describe("requests the worker leaves alone", () => {
  test.each([
    ["an RSC request", new Request(ORIGIN + U, { headers: { RSC: "1" } })],
    ["an _rsc request", new Request(`${ORIGIN}${U}?_rsc=abc12`)],
    [
      "a Server Action POST",
      new Request(ORIGIN + U, { method: "POST", headers: { "Next-Action": "a1b2" } }),
    ],
    ["the admin page", navRequest("/admin")],
    ["a report POST", new Request(`${ORIGIN}/api/report`, { method: "POST", body: "{}" })],
    ["the picker bootstrap", navRequest("/api/auth/picker-bootstrap?show=x")],
    ["a crew URL with a trailing slash", navRequest(`${U}/`)],
    ["the unpublish page", navRequest("/show/east-coast/unpublish")],
  ])("%s gets no respondWith", async (_label, request) => {
    const worker = boot();
    premiseHolds("the worker registered a fetch listener", worker.listens("fetch"));
    const dispatched = worker.dispatchFetch(request);
    await dispatched.settled();
    expect(dispatched.responded).toBeNull();
    expect(worker.net.calls).toEqual([]);
  });

  test("a crew navigation in the same harness is answered (positive control)", async () => {
    const worker = boot();
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "hold", showId: null }))),
    );
    const response = await open(worker, U);
    expect(await response.text()).toContain("live page");
  });
});

// --- Step 3, served (spec 4.4) ------------------------------------------------------

describe("step 3: a complete response decides by its marker", () => {
  test("save: serves the network response and commits it as the show's copy", async () => {
    const worker = boot();
    const html = page(save(), "fresh page");
    worker.net.on(
      U,
      reply(() => htmlResponse(html)),
    );
    const response = await open(worker, `${U}?s=crew`);
    expect(await response.text()).toBe(html);
    expect(response.status).toBe(200);
    // The fetch used the full request URL, query included.
    expect(worker.net.callsTo(U).map((call) => call.path)).toEqual([`${U}?s=crew`]);
    const copy = await worker.store.copyAtUrl(U);
    expect(copy).toMatchObject({
      showId: SHOW,
      url: U,
      html,
      viewer: VIEWER,
      savedAt: RENDERED,
      epoch: 3,
      endedAt: null,
    });
  });

  test("keep for the saved viewer: serves S(U) in server-error mode", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, viewer: VIEWER });
    worker.net.on(
      U,
      reply(() =>
        htmlResponse(
          page({ disposition: "keep", showId: SHOW, viewer: VIEWER }, "terminal failure"),
        ),
      ),
    );
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBe("server-error");
    expect(text).toContain(savedLabel(SHOW, U));
    expect(text).not.toContain("terminal failure");
    expect(await worker.store.copyByShow(SHOW)).not.toBeNull();
  });

  test.each([
    ["at another link", U_OLD],
    ["at U itself", U],
  ])(
    "keep for another viewer while C(show) is %s: serves the network and purges C(show)",
    async (_label, at) => {
      const worker = boot();
      await worker.seed({ showId: SHOW, url: at, viewer: OTHER_VIEWER });
      worker.net.on(
        U,
        reply(() =>
          htmlResponse(
            page({ disposition: "keep", showId: SHOW, viewer: VIEWER }, "terminal failure"),
          ),
        ),
      );
      const text = await (await open(worker, U)).text();
      expect(servedMode(text)).toBeNull();
      expect(text).toContain("terminal failure");
      expect(await worker.store.copyByShow(SHOW)).toBeNull();
    },
  );

  test("keep with no copy of the show: serves the network and leaves other shows alone", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW_B, url: B_URL });
    worker.net.on(
      U,
      reply(() =>
        htmlResponse(
          page({ disposition: "keep", showId: SHOW, viewer: VIEWER }, "terminal failure"),
        ),
      ),
    );
    expect(await (await open(worker, U)).text()).toContain("terminal failure");
    expect(await worker.store.copyByShow(SHOW_B)).not.toBeNull();
  });

  test("hold: serves the network and keeps S(U)", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "hold", showId: null }, "infra failure"))),
    );
    expect(await (await open(worker, U)).text()).toContain("infra failure");
    expect(await worker.store.copyAtUrl(U)).not.toBeNull();
  });

  test("check with S(U), status ended: marks S(U) ended and serves it in ended mode", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }, "not found"), 404)),
    );
    worker.net.on(STATUS, statusAnswer("ended"));
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBe("ended");
    expect(text).toContain(savedLabel(SHOW, U));
    expect((await worker.store.copyAtUrl(U))?.endedAt).toBe(START);
  });

  test("check with S(U), status gone: purges and serves the network", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }, "not found"), 404)),
    );
    worker.net.on(STATUS, statusAnswer("gone"));
    const response = await open(worker, U);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("not found");
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
  });

  test("check with S(U), status 500: serves the network and keeps S(U) as it was", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }, "not found"), 404)),
    );
    worker.net.on(
      STATUS,
      reply(() => Response.json({ error: "X" }, { status: 500 })),
    );
    expect(await (await open(worker, U)).text()).toContain("not found");
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ endedAt: null });
  });

  test("check with S(U), status silent for 5 s: serves the network at 5 s and keeps S(U)", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }, "not found"), 404)),
    );
    worker.net.on(STATUS, hang);
    const nav = worker.navigate(U);
    const served = watch(responseOf(nav));
    await worker.clock.advance(4_999);
    expect(served.done()).toBe(false);
    await worker.clock.advance(1);
    expect(served.done()).toBe(true);
    expect(await (await responseOf(nav)).text()).toContain("not found");
    await nav.settled();
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ endedAt: null });
  });

  test("check with no S(U): serves the network and never asks the status route", async () => {
    const worker = boot();
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }, "not found"), 404)),
    );
    expect(await (await open(worker, U)).text()).toContain("not found");
    expect(worker.net.callsTo(STATUS)).toEqual([]);
  });

  // The client renders not-found.tsx for that body, and its marker is check (spec 4.4).
  test("a streamed not-found page with S(U), status ended: marks S(U) ended and serves it in ended mode", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(STREAMED_NOT_FOUND)),
    );
    worker.net.on(STATUS, statusAnswer("ended"));
    const text = await (await open(worker, U)).text();
    expect(worker.net.callsTo(STATUS)).toHaveLength(1);
    expect(servedMode(text)).toBe("ended");
    expect(text).toContain(savedLabel(SHOW, U));
    expect((await worker.store.copyAtUrl(U))?.endedAt).toBe(START);
  });

  test("a streamed not-found page with S(U), status gone: purges and serves the network", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(STREAMED_NOT_FOUND)),
    );
    worker.net.on(STATUS, statusAnswer("gone"));
    const response = await open(worker, U);
    expect(worker.net.callsTo(STATUS)).toHaveLength(1);
    expect(await response.text()).toBe(STREAMED_NOT_FOUND);
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
  });

  test("purge naming a show: serves the network and purges C(show) wherever it was saved", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U_OLD });
    await worker.seed({ showId: SHOW_B, url: B_URL });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "purge", showId: SHOW }, "picker"))),
    );
    expect(await (await open(worker, U)).text()).toContain("picker");
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
    expect(await worker.store.copyByShow(SHOW_B)).not.toBeNull();
  });

  test("purge without a show: purges S(U) only", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    await worker.seed({ showId: SHOW_B, url: B_URL });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "purge", showId: null }, "unavailable"))),
    );
    expect(await (await open(worker, U)).text()).toContain("unavailable");
    expect(await worker.store.copyAtUrl(U)).toBeNull();
    expect(await worker.store.copyByShow(SHOW_B)).not.toBeNull();
  });

  test.each([200, 404])("no marker with status %i: treated as purge of S(U)", async (status) => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse("<!doctype html><html><body>redirecting</body></html>", status)),
    );
    expect(await (await open(worker, U)).text()).toContain("redirecting");
    expect(await worker.store.copyAtUrl(U)).toBeNull();
  });

  test("an invalid marker naming a show: purges C(show)", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U_OLD });
    const invalid = `<html><body><template id="fxav-saved-copy" data-v="2" data-disposition="save" data-show-id="${SHOW}"></template></body></html>`;
    worker.net.on(
      U,
      reply(() => htmlResponse(invalid)),
    );
    expect(await (await open(worker, U)).text()).toBe(invalid);
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
  });

  test("an opaque redirect is served as is and changes nothing", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    const redirect = opaqueRedirect();
    worker.net.on(
      U,
      reply(() => redirect),
    );
    expect(await open(worker, U)).toBe(redirect);
    expect(await worker.store.copyAtUrl(U)).not.toBeNull();
  });

  test("a 5xx with no marker serves S(U) in server-error mode when it exists", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse("<html><body>Bad Gateway</body></html>", 502)),
    );
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBe("server-error");
    expect(text).toContain(savedLabel(SHOW, U));
    expect(await worker.store.copyAtUrl(U)).not.toBeNull();
  });

  test("a 5xx with no marker and no S(U) serves the network response", async () => {
    const worker = boot();
    worker.net.on(
      U,
      reply(() => htmlResponse("<html><body>Bad Gateway</body></html>", 502)),
    );
    const response = await open(worker, U);
    expect(response.status).toBe(502);
    expect(await response.text()).toContain("Bad Gateway");
  });
});

// --- What a served copy and the not-saved page look like (spec 4.7.1, 4.7.5) -------

describe("serving a saved copy", () => {
  test("drops the stored transport headers and serves the injected HTML as UTF-8 HTML", async () => {
    const worker = boot();
    const html = page(save(), "café crew page");
    const encoded = new TextEncoder().encode(html);
    worker.net.on(
      U,
      reply(
        () =>
          new Response(encoded, {
            headers: {
              "content-type": "text/html; charset=utf-8",
              "content-encoding": "gzip",
              "content-length": "9999",
            },
          }),
      ),
    );
    await open(worker, U);
    premiseHolds(
      "the copy was saved from the network response",
      (await worker.store.copyAtUrl(U)) !== null,
    );

    worker.net.on(U, refuse);
    const response = await open(worker, U);
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("content-length")).toBeNull();
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    const expected = injectSavedCopyHead(html, {
      mode: "offline",
      savedAt: RENDERED,
      noticeText: `Saved copy from ${formatSavedTime(RENDERED, START)}`,
    });
    const body = new Uint8Array(await response.arrayBuffer());
    expect(body.byteLength).toBe(new TextEncoder().encode(expected).byteLength);
    expect(new TextDecoder().decode(body)).toBe(expected);
    expect(servedMode(expected)).toBe("offline");
  });

  test("the meta carries the saved time for the bar", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, savedAt: RENDERED });
    worker.net.on(U, refuse);
    const text = await (await open(worker, U)).text();
    expect(text).toContain(
      `<meta name="fxav-served" content="offline" data-saved-at="${RENDERED}">`,
    );
  });

  test("the not-saved page is served as UTF-8 HTML with no Content-Security-Policy", async () => {
    const worker = boot();
    worker.net.on(U, refuse);
    const response = await open(worker, U);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(await response.text()).toBe(notSavedPageHtml());
  });
});

// --- Step 1 (spec 4.4, v7) -----------------------------------------------------------

describe("step 1: S(U) marked ended", () => {
  async function endedWorker() {
    const worker = boot();
    const copy = await worker.seed({ showId: SHOW, url: U, endedAt: START - DAY_MS, epoch: 4 });
    return { worker, copy };
  }

  test("asks the status route with the copy's own ids", async () => {
    const { worker, copy } = await endedWorker();
    worker.net.on(STATUS, statusAnswer("ended"));
    await open(worker, U);
    const calls = worker.net.callsTo(STATUS);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe(savedCopyStatusUrl(copy));
    const params = new URL(calls[0]?.url ?? "").searchParams;
    expect(params.get("show")).toBe(SHOW);
    expect(params.get("epoch")).toBe("4");
    expect(params.get("viewer")).toBe(VIEWER);
    expect(params.get("saved")).toBe(RENDERED);
  });

  test("ended: serves S(U) in ended mode without fetching the page", async () => {
    const { worker } = await endedWorker();
    worker.net.on(STATUS, statusAnswer("ended"));
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBe("ended");
    expect(text).toContain(savedLabel(SHOW, U));
    expect(worker.net.callsTo(U)).toEqual([]);
  });

  test("gone: purges and continues at step 2", async () => {
    const { worker } = await endedWorker();
    worker.net.on(STATUS, statusAnswer("gone"));
    const fresh = page(save({ renderedAt: LATER }), "unarchived page");
    worker.net.on(
      U,
      reply(() => htmlResponse(fresh)),
    );
    expect(await (await open(worker, U)).text()).toBe(fresh);
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: LATER, endedAt: null });
  });

  test("gone, then a network error at step 2: the purged copy is not served", async () => {
    const { worker } = await endedWorker();
    worker.net.on(STATUS, statusAnswer("gone"));
    worker.net.on(U, refuse);
    expect(await (await open(worker, U)).text()).toBe(notSavedPageHtml());
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
  });

  test("no answer (network error): serves S(U) in ended mode", async () => {
    const { worker } = await endedWorker();
    worker.net.on(STATUS, refuse);
    expect(servedMode(await (await open(worker, U)).text())).toBe("ended");
    expect(worker.net.callsTo(U)).toEqual([]);
  });

  test("no answer in 5 s: serves S(U) in ended mode at 5 s", async () => {
    const { worker } = await endedWorker();
    worker.net.on(STATUS, hang);
    const nav = worker.navigate(U);
    const served = watch(responseOf(nav));
    await worker.clock.advance(4_999);
    expect(served.done()).toBe(false);
    await worker.clock.advance(1);
    expect(servedMode(await (await responseOf(nav)).text())).toBe("ended");
    await nav.settled();
    expect(worker.net.callsTo(U)).toEqual([]);
  });

  test("no verdict (500): a complete page is served byte for byte and its purge marker is not read", async () => {
    const { worker } = await endedWorker();
    worker.net.on(
      STATUS,
      reply(() => Response.json({ error: "X" }, { status: 500 })),
    );
    const html = page({ disposition: "purge", showId: SHOW }, "server page");
    worker.net.on(
      U,
      reply(() => htmlResponse(html, 200, { "x-from": "network" })),
    );
    const response = await open(worker, U);
    expect(await response.text()).toBe(html);
    expect(response.headers.get("x-from")).toBe("network");
    expect(await worker.store.copyByShow(SHOW)).toMatchObject({ endedAt: START - DAY_MS });
  });

  test("no verdict, then a network error: serves S(U) in ended mode and keeps it", async () => {
    const { worker } = await endedWorker();
    worker.net.on(
      STATUS,
      reply(() => Response.json({ error: "X" }, { status: 500 })),
    );
    worker.net.on(U, refuse);
    expect(servedMode(await (await open(worker, U)).text())).toBe("ended");
    expect(await worker.store.copyByShow(SHOW)).not.toBeNull();
  });

  test("no verdict, then a page still pending at 8 s: serves S(U) in ended mode at 8 s", async () => {
    const { worker } = await endedWorker();
    worker.net.on(
      STATUS,
      reply(() => Response.json({ error: "X" }, { status: 500 })),
    );
    worker.net.on(U, hang);
    const nav = worker.navigate(U);
    const served = watch(responseOf(nav));
    await worker.clock.advance(7_999);
    expect(served.done()).toBe(false);
    await worker.clock.advance(1);
    expect(servedMode(await (await responseOf(nav)).text())).toBe("ended");
    await nav.settled();
    expect(await worker.store.copyByShow(SHOW)).not.toBeNull();
  });

  test.each([
    ["502", () => new Response("", { status: 502 })],
    ["503", () => new Response("<html>down</html>", { status: 503 })],
    ["404", () => new Response("<html>missing</html>", { status: 404 })],
    ["an unreadable 200", () => htmlResponse("<html>sign in</html>")],
  ])("a status answer of %s is no verdict: the page is fetched", async (_label, make) => {
    const { worker } = await endedWorker();
    worker.net.on(STATUS, reply(make));
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "hold", showId: null }, "live"))),
    );
    expect(await (await open(worker, U)).text()).toContain("live");
    expect(worker.net.callsTo(U)).toHaveLength(1);
    expect(await worker.store.copyByShow(SHOW)).not.toBeNull();
  });
});

// --- Steps 4 and 5 (spec 4.4) --------------------------------------------------------

describe("steps 4 and 5: no complete response", () => {
  test("a network error serves S(U) in offline mode", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, refuse);
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBe("offline");
    expect(text).toContain(savedLabel(SHOW, U));
  });

  test("a network error with no S(U) serves the not-saved page", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U_OLD });
    worker.net.on(U, refuse);
    expect(await (await open(worker, U)).text()).toBe(notSavedPageHtml());
  });

  test.each([
    ["with S(U)", true],
    ["without S(U)", false],
  ])(
    "a body that fails mid-stream is a network error, never a partial page (%s)",
    async (_label, withCopy) => {
      const worker = boot();
      if (withCopy) await worker.seed({ showId: SHOW, url: U });
      worker.net.on(U, reply(brokenBody));
      const text = await (await open(worker, U)).text();
      if (withCopy) {
        expect(servedMode(text)).toBe("offline");
        expect(text).toContain(savedLabel(SHOW, U));
      } else {
        expect(text).toBe(notSavedPageHtml());
      }
    },
  );

  test("a page still pending at 8 s serves S(U) in slow mode", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, hang);
    const nav = worker.navigate(U);
    const served = watch(responseOf(nav));
    await worker.clock.advance(7_999);
    expect(served.done()).toBe(false);
    await worker.clock.advance(1);
    expect(served.done()).toBe(true);
    const text = await (await responseOf(nav)).text();
    expect(servedMode(text)).toBe("slow");
    expect(text).toContain(savedLabel(SHOW, U));
  });

  test("the continuation completing with save commits and posts fresh-ready to pages of U", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    const onU = worker.clients.open(`${U}?s=crew`);
    const elsewhere = worker.clients.open(B_URL);
    const gate = deferred<Response>();
    worker.net.on(U, later(gate));
    const nav = worker.navigate(U);
    await worker.clock.advance(8_000);
    expect(servedMode(await (await responseOf(nav)).text())).toBe("slow");
    await worker.clock.advance(30_000);
    gate.resolve(htmlResponse(page(save({ renderedAt: LATER }), "late page")));
    await nav.settled();
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: LATER });
    expect(onU.received).toEqual([{ type: "fresh-ready", url: U }]);
    expect(elsewhere.received).toEqual([]);
  });

  test("the continuation completing with a purge naming the show posts purged to every page", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    const pages = [worker.clients.open(U), worker.clients.open(B_URL)];
    const gate = deferred<Response>();
    worker.net.on(U, later(gate));
    const nav = worker.navigate(U);
    await worker.clock.advance(8_000);
    await responseOf(nav);
    gate.resolve(htmlResponse(page({ disposition: "purge", showId: SHOW }, "picker")));
    await nav.settled();
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
    for (const open of pages) expect(open.received).toEqual([{ type: "purged", showId: SHOW }]);
  });

  test("a continuation past 60 s is abandoned: the fetch is aborted and nothing commits", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    const onU = worker.clients.open(U);
    const gate = deferred<Response>();
    worker.net.on(U, later(gate));
    const nav = worker.navigate(U);
    await worker.clock.advance(8_000);
    await responseOf(nav);
    await worker.clock.advance(59_999);
    const call = worker.net.callsTo(U)[0];
    const signal = call?.init?.signal ?? call?.request?.signal;
    expect(signal?.aborted).toBe(false);
    await worker.clock.advance(1);
    expect(signal?.aborted).toBe(true);
    gate.resolve(htmlResponse(page(save({ renderedAt: LATER }), "too late")));
    await nav.settled();
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: RENDERED });
    expect(onU.received).toEqual([]);
  });

  test("with no S(U) there is no 8-second cut-off: the page is served whenever it completes", async () => {
    const worker = boot();
    const gate = deferred<Response>();
    worker.net.on(U, later(gate));
    const nav = worker.navigate(U);
    const served = watch(responseOf(nav));
    await worker.clock.advance(120_000);
    expect(served.done()).toBe(false);
    const html = page(save(), "very slow page");
    gate.resolve(htmlResponse(html));
    expect(await (await responseOf(nav)).text()).toBe(html);
    await nav.settled();
    expect(await worker.store.copyAtUrl(U)).not.toBeNull();
  });

  test("with no S(U), a network error after the budget serves the not-saved page", async () => {
    const worker = boot();
    const gate = deferred<Response>();
    worker.net.on(U, later(gate));
    const nav = worker.navigate(U);
    await worker.clock.advance(20_000);
    gate.reject(new TypeError("Failed to fetch"));
    expect(await (await responseOf(nav)).text()).toBe(notSavedPageHtml());
    await nav.settled();
  });
});

// --- Identity brackets (spec 4.6) -------------------------------------------------------

describe("identity transitions are bracketed", () => {
  test.each([
    ["a POST to /auth/sign-out", "/auth/sign-out", "POST"],
    ["a GET to /auth/callback", "/auth/callback", "GET"],
  ])("%s purges every copy before the request is sent", async (_label, path, method) => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    await worker.seed({ showId: SHOW_B, url: B_URL });
    let heldWhenSent = -1;
    worker.net.on(path, async () => {
      heldWhenSent = (await worker.store.listCopies()).length;
      return new Response(null, { status: 303, headers: { location: "/" } });
    });
    await open(worker, path === "/auth/callback" ? `${path}?code=abc` : path, { method });
    expect(heldWhenSent).toBe(0);
  });

  test.each([
    ["a POST to /auth/sign-out", "/auth/sign-out", "POST"],
    ["a GET to /auth/callback", "/auth/callback", "GET"],
  ])(
    "%s purges again once the response arrives, and passes the response through",
    async (_label, path, method) => {
      const worker = boot();
      const answer = new Response(null, { status: 303, headers: { location: "/" } });
      worker.net.on(path, async () => {
        // A copy that lands while the request is in flight.
        await worker.seed({ showId: SHOW, url: U });
        return answer;
      });
      const response = await open(worker, path, { method });
      expect(response).toBe(answer);
      expect(await worker.store.listCopies()).toEqual([]);
    },
  );

  test.each([
    ["/auth/sign-out", "POST"],
    ["/auth/callback", "GET"],
  ])("a save begun between the two purges of %s never commits", async (path, method) => {
    const worker = boot();
    const transition = deferred<Response>();
    worker.net.on(path, later(transition));
    const crewPage = deferred<Response>();
    worker.net.on(U, later(crewPage));

    const bracket = worker.navigate(path, { method });
    await settle();
    const crew = worker.navigate(U);
    await settle();
    premise("the crew fetch started after the first purge", worker.net.callsTo(U).length, 0);
    transition.resolve(new Response(null, { status: 303, headers: { location: "/" } }));
    await responseOf(bracket);
    await bracket.settled();
    crewPage.resolve(htmlResponse(page(save(), "old identity's page")));
    await responseOf(crew);
    await crew.settled();
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
  });
});

describe("a save takes its generation before its fetch is sent (spec 4.6)", () => {
  // With the memory store, beginSave resolves within a microtask, so a fetch sent
  // first and a token taken after it would pass every bracket case above. A store
  // whose beginSave waits makes the order observable.
  function gatedBeginSave() {
    const inner = createMemoryStore();
    const gate = deferred<void>();
    const store: SavedCopyStore = {
      ...inner,
      async beginSave() {
        await gate.promise;
        return inner.beginSave();
      },
    };
    return { store, gate };
  }

  test.each([
    ["a navigation", (worker: Worker) => void worker.navigate(U)],
    [
      "an ensure-saved",
      (worker: Worker) => worker.post({ type: "ensure-saved", url: U, renderedAt: RENDERED }).close,
    ],
    ["a probe", (worker: Worker) => worker.post({ type: "probe", url: U }).close],
  ])("%s", async (_label, start) => {
    const { store, gate } = gatedBeginSave();
    const worker = boot({ store });
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    const closePort = start(worker);
    await settle();
    expect(worker.net.callsTo(U)).toEqual([]);
    gate.resolve();
    await settle();
    expect(worker.net.callsTo(U)).toHaveLength(1);
    closePort?.();
  });
});

describe("purge-show (AvatarMenu, spec 4.6)", () => {
  test("removes C(show) wherever it was saved and replies ack", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U_OLD });
    await worker.seed({ showId: SHOW_B, url: B_URL });
    expect(await worker.ask({ type: "purge-show", showId: SHOW })).toEqual({ outcome: "ack" });
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
    expect(await worker.store.copyByShow(SHOW_B)).not.toBeNull();
  });

  test("a save of the show begun before it never commits", async () => {
    const worker = boot();
    const crewPage = deferred<Response>();
    worker.net.on(U, later(crewPage));
    const crew = worker.navigate(U);
    await settle();
    premise("the crew fetch started before the purge", worker.net.callsTo(U).length, 0);
    expect(await worker.ask({ type: "purge-show", showId: SHOW })).toEqual({ outcome: "ack" });
    crewPage.resolve(htmlResponse(page(save(), "before the switch")));
    await responseOf(crew);
    await crew.settled();
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
  });

  test("replies ack only after the purge has completed", async () => {
    const inner = createMemoryStore();
    const gate = deferred<void>();
    const store: SavedCopyStore = {
      ...inner,
      async purge(scope) {
        await gate.promise;
        return inner.purge(scope);
      },
    };
    const worker = boot({ store });
    await worker.seed({ showId: SHOW, url: U });
    const sent = worker.post({ type: "purge-show", showId: SHOW });
    await settle();
    expect(sent.replies).toEqual([]);
    gate.resolve();
    await sent.settled();
    sent.close();
    expect(sent.replies).toEqual([{ outcome: "ack" }]);
    expect(await inner.copyByShow(SHOW)).toBeNull();
  });
});

// --- One copy per show and the picker bootstrap (spec 4.6, 7) -------------------------

describe("one copy per show", () => {
  test("bootstrap: a markerless 200 at a new link leaves C(X) at the old link, and the next save replaces it", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U_OLD });
    worker.net.on(
      U,
      reply(() =>
        htmlResponse(
          '<html><head><meta http-equiv="refresh" content="0;url=/api/auth/picker-bootstrap"></head></html>',
        ),
      ),
    );
    await open(worker, U);
    expect(await worker.store.copyByShow(SHOW)).toMatchObject({ url: U_OLD });

    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ renderedAt: LATER }), "after bootstrap"))),
    );
    await open(worker, U);
    expect(await worker.store.copyByShow(SHOW)).toMatchObject({ url: U, savedAt: LATER });
    expect(await worker.store.copyAtUrl(U_OLD)).toBeNull();

    worker.net.on(U_OLD, refuse);
    expect(await (await open(worker, U_OLD)).text()).toBe(notSavedPageHtml());
  });

  test("a show-named purge at the new link removes the old-link copy; the old link then gets the not-saved page", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U_OLD });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "purge", showId: SHOW }, "admin view"))),
    );
    await open(worker, U);
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
    worker.net.on(U_OLD, refuse);
    expect(await (await open(worker, U_OLD)).text()).toBe(notSavedPageHtml());
  });
});

// --- ensure-saved, probe, marker messages (spec 4.3, 4.4, 4.7.3) ---------------------

describe("ensure-saved", () => {
  test("skipped when S(U) already has that renderedAt, without a fetch", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, savedAt: RENDERED });
    expect(await worker.ask({ type: "ensure-saved", url: U, renderedAt: RENDERED })).toEqual({
      outcome: "skipped",
    });
    expect(worker.net.callsTo(U)).toEqual([]);
  });

  test("otherwise fetches U with redirect manual and the page's cookies, and saves without serving", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, savedAt: RENDERED });
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ renderedAt: LATER }), "refreshed"))),
    );
    expect(
      await worker.ask({ type: "ensure-saved", url: `${U}?s=crew`, renderedAt: LATER }),
    ).toEqual({ outcome: "saved" });
    const calls = worker.net.callsTo(U);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe(U);
    expect(calls[0]?.init?.redirect ?? calls[0]?.request?.redirect).toBe("manual");
    expect(calls[0]?.init?.credentials ?? calls[0]?.request?.credentials).not.toBe("omit");
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: LATER });
  });

  test("skipped while a save of the same renderedAt is in flight", async () => {
    const worker = boot();
    const gate = deferred<Response>();
    worker.net.on(U, later(gate));
    const first = worker.post({ type: "ensure-saved", url: U, renderedAt: RENDERED });
    await settle();
    expect(await worker.ask({ type: "ensure-saved", url: U, renderedAt: RENDERED })).toEqual({
      outcome: "skipped",
    });
    gate.resolve(htmlResponse(page(save(), "first visit")));
    await first.settled();
    first.close();
    expect(first.replies).toEqual([{ outcome: "saved" }]);
    expect(worker.net.callsTo(U)).toHaveLength(1);
  });

  test("skipped while a navigation is storing a copy with that renderedAt", async () => {
    const worker = boot();
    const css = deferred<Response>();
    worker.net.on(CSS, later(css));
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save(), "first visit"))),
    );
    const nav = worker.navigate(U);
    await responseOf(nav);
    await settle();
    premise("the save is waiting on its stylesheet", worker.net.callsTo(CSS).length, 0);
    expect(await worker.ask({ type: "ensure-saved", url: U, renderedAt: RENDERED })).toEqual({
      outcome: "skipped",
    });
    css.resolve(new Response(CSS_BODY, { headers: { "content-type": "text/css" } }));
    await nav.settled();
    expect(await worker.store.copyAtUrl(U)).not.toBeNull();
    expect(worker.net.callsTo(U)).toHaveLength(1);
  });

  test("runs the purge row too: a purge marker purges and replies purged", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "purge", showId: SHOW }, "picker"))),
    );
    expect(await worker.ask({ type: "ensure-saved", url: U, renderedAt: LATER })).toEqual({
      outcome: "purged",
    });
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
  });

  test("a URL that is not a crew URL is skipped without a fetch", async () => {
    const worker = boot();
    expect(await worker.ask({ type: "ensure-saved", url: "/me", renderedAt: RENDERED })).toEqual({
      outcome: "skipped",
    });
    expect(worker.net.calls).toEqual([]);
  });
});

describe("probe", () => {
  test.each([
    [
      "a save marker",
      () => htmlResponse(page(save({ renderedAt: LATER }), "back online")),
      "saved",
    ],
    ["a hold marker", () => htmlResponse(page({ disposition: "hold", showId: null })), "kept"],
    [
      "a keep marker for the saved viewer",
      () => htmlResponse(page({ disposition: "keep", showId: SHOW, viewer: VIEWER })),
      "kept",
    ],
    ["a purge marker", () => htmlResponse(page({ disposition: "purge", showId: SHOW })), "purged"],
    ["an opaque redirect", opaqueRedirect, "kept"],
  ])("runs steps 2 and 3 silently: %s replies %s", async (_label, make, outcome) => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, reply(make));
    expect(await worker.ask({ type: "probe", url: U })).toEqual({ outcome });
  });

  test("a check marker whose status route says ended replies ended", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }), 404)),
    );
    worker.net.on(STATUS, statusAnswer("ended"));
    expect(await worker.ask({ type: "probe", url: U })).toEqual({ outcome: "ended" });
    expect((await worker.store.copyAtUrl(U))?.endedAt).toBe(START);
  });

  test("a streamed not-found page whose status route says ended replies ended", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(STREAMED_NOT_FOUND)),
    );
    worker.net.on(STATUS, statusAnswer("ended"));
    expect(await worker.ask({ type: "probe", url: U })).toEqual({ outcome: "ended" });
    expect((await worker.store.copyAtUrl(U))?.endedAt).toBe(START);
  });

  test("two probes that each find the show ended both reply ended", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }), 404)),
    );
    worker.net.on(STATUS, statusAnswer("ended"));
    expect(await worker.ask({ type: "probe", url: U })).toEqual({ outcome: "ended" });
    expect(await worker.ask({ type: "probe", url: U })).toEqual({ outcome: "ended" });
    expect((await worker.store.copyAtUrl(U))?.endedAt).toBe(START);
  });

  test("an archive the slow fallback's continuation found is ended for the next probe too", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    const onU = worker.clients.open(U);
    const gate = deferred<Response>();
    worker.net.on(U, later(gate));
    worker.net.on(STATUS, statusAnswer("ended"));
    const nav = worker.navigate(U);
    await worker.clock.advance(8_000);
    expect(servedMode(await (await responseOf(nav)).text())).toBe("slow");
    // The page answers late: the show was archived meanwhile.
    gate.resolve(htmlResponse(page({ disposition: "check", showId: null }), 404));
    await nav.settled();
    expect((await worker.store.copyAtUrl(U))?.endedAt).toBe(START + 8_000);
    // The continuation broadcasts nothing for an ended mark; the next probe says ended.
    expect(onU.received).toEqual([]);
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }), 404)),
    );
    expect(await worker.ask({ type: "probe", url: U })).toEqual({ outcome: "ended" });
  });

  test("a check that finds the show ended after its copy was replaced replies kept", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    const gate = deferred<Response>();
    worker.net.on(STATUS, later(gate));
    const sent = worker.post({ type: "marker", disposition: "check", url: U });
    await settle();
    // A newer save lands while the status route is out.
    await worker.seed({ showId: SHOW, url: U, savedAt: LATER });
    gate.resolve(Response.json({ state: "ended" }));
    await sent.settled();
    sent.close();
    expect(sent.replies).toEqual([{ outcome: "kept" }]);
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: LATER, endedAt: null });
  });

  test("a network error replies failed and keeps S(U)", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, refuse);
    expect(await worker.ask({ type: "probe", url: U })).toEqual({ outcome: "failed" });
    expect(await worker.store.copyAtUrl(U)).not.toBeNull();
  });

  test("a page still pending at 8 s replies failed", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, hang);
    const sent = worker.post({ type: "probe", url: U });
    await worker.clock.advance(7_999);
    expect(sent.replies).toEqual([]);
    await worker.clock.advance(1);
    await sent.settled();
    sent.close();
    expect(sent.replies).toEqual([{ outcome: "failed" }]);
  });
});

describe("marker messages", () => {
  test("purge with a show id purges C(show) wherever it was saved, and its assets", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U_OLD, assets: [DIAGRAM] });
    worker.assetCache().seed(DIAGRAM, "png");
    expect(
      await worker.ask({ type: "marker", disposition: "purge", showId: SHOW, url: U }),
    ).toEqual({ outcome: "ack" });
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
    expect(worker.assetCache().paths()).toEqual([]);
  });

  test("purge without a show id purges S(url) only", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    await worker.seed({ showId: SHOW_B, url: B_URL });
    expect(
      await worker.ask({ type: "marker", disposition: "purge", showId: null, url: `${U}?s=crew` }),
    ).toEqual({ outcome: "ack" });
    expect(await worker.store.copyAtUrl(U)).toBeNull();
    expect(await worker.store.copyByShow(SHOW_B)).not.toBeNull();
  });

  test("check replies ended every time the status route says ended, not only when it marked the copy", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    const onU = worker.clients.open(U);
    worker.net.on(STATUS, statusAnswer("ended"));
    expect(await worker.ask({ type: "marker", disposition: "check", url: U })).toEqual({
      outcome: "ended",
    });
    expect((await worker.store.copyAtUrl(U))?.endedAt).toBe(START);
    // A second tab, or the same one later: the copy is already marked, and the
    // reply still says ended. The first mark stays as it was.
    await worker.clock.advance(1_000);
    expect(await worker.ask({ type: "marker", disposition: "check", url: U })).toEqual({
      outcome: "ended",
    });
    expect((await worker.store.copyAtUrl(U))?.endedAt).toBe(START);
    expect(worker.net.callsTo(STATUS)).toHaveLength(2);
    expect(onU.received).toEqual([]);
  });

  test("check with status gone purges and replies purged", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(STATUS, statusAnswer("gone"));
    expect(await worker.ask({ type: "marker", disposition: "check", url: U })).toEqual({
      outcome: "purged",
    });
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
  });

  test("check with no verdict keeps the copy", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      STATUS,
      reply(() => Response.json({ error: "X" }, { status: 500 })),
    );
    expect(await worker.ask({ type: "marker", disposition: "check", url: U })).toEqual({
      outcome: "kept",
    });
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ endedAt: null });
  });

  test("check with no S(url) is skipped and asks nothing", async () => {
    const worker = boot();
    expect(await worker.ask({ type: "marker", disposition: "check", url: U })).toEqual({
      outcome: "skipped",
    });
    expect(worker.net.calls).toEqual([]);
  });
});

// --- Completeness and caps (spec 4.6 as amended, 4.8) ---------------------------------

describe("completeness", () => {
  test("a commit stores every static file the HTML names and every font its CSS names", async () => {
    const worker = boot();
    const html = page(save());
    premise("the page names static files", requiredStaticUrls(html, ORIGIN).length, 1);
    worker.net.on(
      U,
      reply(() => htmlResponse(html)),
    );
    await open(worker, U);
    expect(worker.staticCache().paths()).toEqual([CHUNK, CSS, FONT].sort());
    expect([...(await worker.store.staticIndex()).keys()].sort()).toEqual(
      [CHUNK, CSS, FONT].sort(),
    );
    expect([...((await worker.store.copyAtUrl(U))?.statics ?? [])].sort()).toEqual(
      [CHUNK, CSS, FONT].sort(),
    );
  });

  test("a stylesheet already cached is read from the cache, and the font it names is fetched", async () => {
    const worker = boot();
    const otherFont = "/fonts/other.woff2";
    worker
      .staticCache()
      .seed(CSS, `@font-face{src:url("${otherFont}")}`, { "content-type": "text/css" });
    worker.net.on(
      otherFont,
      reply(() => new Response(new Uint8Array([1, 2]))),
    );
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    await open(worker, U);
    expect(worker.net.callsTo(CSS)).toEqual([]);
    expect(worker.net.callsTo(otherFont)).toHaveLength(1);
    expect(worker.staticCache().paths()).toContain(otherFont);
    // A cache hit is recorded too, so the 14-day sweep cannot take a file a save depends on.
    expect((await worker.store.staticIndex()).get(CSS)).toBe(START);
  });

  // Controller ruling (Task 10): only the files a copy needs to hydrate are
  // mandatory. A static file that cannot be had abandons the save; a listed asset
  // that cannot be had is skipped like an asset over the caps (spec 4.8).
  test.each([
    ["a font that answers 404", FONT, () => new Response("missing", { status: 404 })],
    ["a font that cannot be fetched", FONT, "refuse"],
    ["a chunk that answers 404", CHUNK, () => new Response("missing", { status: 404 })],
    ["a chunk that cannot be fetched", CHUNK, "refuse"],
  ] as const)(
    "a static file: %s abandons the save and the previous copy stays",
    async (_label, path, failure) => {
      const worker = boot();
      await worker.seed({ showId: SHOW, url: U, savedAt: RENDERED });
      worker.net.on(path, failure === "refuse" ? refuse : reply(failure));
      worker.net.on(
        U,
        reply(() => htmlResponse(page(save({ renderedAt: LATER, assets: [AGENDA] }), "new"))),
      );
      worker.net.on(
        AGENDA,
        reply(() => new Response("%PDF")),
      );
      expect(await (await open(worker, U)).text()).toContain("new");
      expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: RENDERED });
    },
  );

  test.each([
    ["answers 404", () => Promise.resolve(new Response("gone", { status: 404 }))],
    ["answers 502", () => Promise.resolve(new Response("bad gateway", { status: 502 }))],
    ["cannot be fetched", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["fails mid-stream", () => Promise.resolve(brokenBody())],
  ] as const)(
    "a listed asset that %s is skipped: the save commits without it",
    async (_label, failure) => {
      const worker = boot();
      await worker.seed({ showId: SHOW, url: U, savedAt: RENDERED });
      worker.net.on(DIAGRAM, () => failure());
      worker.net.on(
        AGENDA,
        reply(() => new Response("%PDF")),
      );
      worker.net.on(
        U,
        reply(() => htmlResponse(page(save({ renderedAt: LATER, assets: [DIAGRAM, AGENDA] })))),
      );
      await open(worker, U);
      premise("the failing asset was requested", worker.net.callsTo(DIAGRAM).length, 0);
      expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: LATER, assets: [AGENDA] });
      expect(worker.assetCache().paths()).toEqual([AGENDA]);
    },
  );

  // Spec 4.8: an asset that has not arrived whole 30 s after its request is
  // skipped like one that failed, so an optional asset never holds back the save.
  test.each([
    ["whose headers never arrive", hang],
    ["whose body stalls after the headers", reply(() => new Response(stalledBody()))],
  ] as const)(
    "a listed asset %s is abandoned at 30 s: its fetch is aborted and the save commits without it",
    async (_label, route) => {
      const worker = boot();
      await worker.seed({ showId: SHOW, url: U, savedAt: RENDERED });
      worker.net.on(DIAGRAM, route);
      worker.net.on(
        AGENDA,
        reply(() => new Response("%PDF")),
      );
      worker.net.on(
        U,
        reply(() => htmlResponse(page(save({ renderedAt: LATER, assets: [DIAGRAM, AGENDA] })))),
      );
      const nav = worker.navigate(U);
      await responseOf(nav);
      await worker.clock.advance(29_999);
      premise("the hanging asset was requested", worker.net.callsTo(DIAGRAM).length, 0);
      const call = worker.net.callsTo(DIAGRAM)[0];
      const signal = call?.init?.signal ?? call?.request?.signal;
      const abortedEarly = signal?.aborted;
      expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: RENDERED });

      await worker.clock.advance(1);
      expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: LATER, assets: [AGENDA] });
      expect(worker.assetCache().paths()).toEqual([AGENDA]);
      expect(abortedEarly).toBe(false);
      expect(signal?.aborted).toBe(true);
      await nav.settled();
    },
  );

  test("a quota error on put abandons the save and posts save-failed to every open page", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, savedAt: RENDERED });
    const onU = worker.clients.open(U);
    const elsewhere = worker.clients.open(B_URL);
    worker.staticCache().failPut = (url) => url === ORIGIN + CHUNK;
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ renderedAt: LATER })))),
    );
    await open(worker, U);
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: RENDERED });
    expect(onU.received).toEqual([{ type: "save-failed", url: U, reason: "quota" }]);
    expect(elsewhere.received).toEqual([{ type: "save-failed", url: U, reason: "quota" }]);
  });

  test("listed assets are stored with the copy; one already cached is not fetched again", async () => {
    const worker = boot();
    worker.assetCache().seed(AGENDA, "%PDF-1.7", { "content-type": "application/pdf" });
    worker.net.on(
      DIAGRAM,
      reply(
        () =>
          new Response(new Uint8Array([137, 80, 78, 71]), {
            headers: { "content-type": "image/png" },
          }),
      ),
    );
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ assets: [DIAGRAM, AGENDA] })))),
    );
    await open(worker, U);
    expect((await worker.store.copyAtUrl(U))?.assets).toEqual([DIAGRAM, AGENDA]);
    expect(worker.assetCache().paths()).toEqual([AGENDA, DIAGRAM].sort());
    expect(worker.net.callsTo(AGENDA)).toEqual([]);
  });

  test("an asset declaring more than 25 MB is skipped without reading it, and the commit goes ahead", async () => {
    const worker = boot();
    worker.net.on(
      DIAGRAM,
      reply(() => new Response("tiny", { headers: { "content-length": String(25 * MB + 1) } })),
    );
    worker.net.on(
      AGENDA,
      reply(() => new Response("%PDF")),
    );
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ assets: [DIAGRAM, AGENDA] })))),
    );
    await open(worker, U);
    expect((await worker.store.copyAtUrl(U))?.assets).toEqual([AGENDA]);
    expect(worker.assetCache().paths()).toEqual([AGENDA]);
  });

  test("an asset of unknown length is counted as it streams and skipped once past 25 MB", async () => {
    const worker = boot();
    const big = counted(40 * MB, MB);
    worker.net.on(
      DIAGRAM,
      reply(() => new Response(big.body)),
    );
    worker.net.on(
      AGENDA,
      reply(() => new Response("%PDF")),
    );
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ assets: [DIAGRAM, AGENDA] })))),
    );
    await open(worker, U);
    expect((await worker.store.copyAtUrl(U))?.assets).toEqual([AGENDA]);
    expect(worker.assetCache().paths()).toEqual([AGENDA]);
    // The body was not buffered whole: reading stopped soon after 25 MB.
    expect(big.pulls()).toBeLessThan(30);
  });

  test("prefetch for one show stops before its assets pass 75 MB", async () => {
    const worker = boot();
    const assets = [1, 2, 3, 4].map((n) => `/api/asset/diagram/${SHOW}/rev-1/big-${n}.png`);
    const small = `/api/asset/diagram/${SHOW}/rev-1/small.png`;
    for (const path of assets) {
      worker.net.on(
        path,
        reply(
          () =>
            new Response(counted(20 * MB, 4 * MB).body, {
              headers: { "content-length": String(20 * MB) },
            }),
        ),
      );
    }
    worker.net.on(
      small,
      reply(() => new Response("small")),
    );
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ assets: [...assets, small] })))),
    );
    await open(worker, U);
    expect((await worker.store.copyAtUrl(U))?.assets).toEqual(assets.slice(0, 3));
    expect(worker.net.callsTo(small)).toEqual([]);
  });
});

describe("asset requests (spec 4.8)", () => {
  async function withListedDiagram() {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, assets: [DIAGRAM] });
    worker.assetCache().seed(DIAGRAM, "stored diagram");
    return worker;
  }

  test("go to the network first", async () => {
    const worker = await withListedDiagram();
    worker.net.on(
      DIAGRAM,
      reply(() => new Response("network diagram")),
    );
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)));
    expect(await response.text()).toBe("network diagram");
  });

  test("fall back to the stored asset on a network error", async () => {
    const worker = await withListedDiagram();
    worker.net.on(DIAGRAM, refuse);
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)));
    expect(await response.text()).toBe("stored diagram");
  });

  test("fall back to the stored asset after 5 s without an answer", async () => {
    const worker = await withListedDiagram();
    worker.net.on(DIAGRAM, hang);
    const dispatched = worker.dispatchFetch(new Request(ORIGIN + DIAGRAM));
    const served = watch(responseOf(dispatched));
    await worker.clock.advance(4_999);
    expect(served.done()).toBe(false);
    await worker.clock.advance(1);
    expect(await (await responseOf(dispatched)).text()).toBe("stored diagram");
  });

  // The 5 s budget covers the body too: a 200 is served only once it has arrived whole.
  test("fall back to the stored asset when the network's body stalls past 5 s", async () => {
    const worker = await withListedDiagram();
    worker.net.on(
      DIAGRAM,
      reply(() => new Response(stalledBody())),
    );
    const dispatched = worker.dispatchFetch(new Request(ORIGIN + DIAGRAM));
    const served = watch(responseOf(dispatched));
    await worker.clock.advance(4_999);
    expect(served.done()).toBe(false);
    await worker.clock.advance(1);
    expect(await (await responseOf(dispatched)).text()).toBe("stored diagram");
    const call = worker.net.callsTo(DIAGRAM)[0];
    expect((call?.init?.signal ?? call?.request?.signal)?.aborted).toBe(true);
  });

  test("fall back to the stored asset when the network's body fails mid-stream", async () => {
    const worker = await withListedDiagram();
    worker.net.on(DIAGRAM, reply(brokenBody));
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)));
    expect(await response.text()).toBe("stored diagram");
  });

  test("a network answer read whole is served with its own status and headers", async () => {
    const worker = await withListedDiagram();
    worker.net.on(
      DIAGRAM,
      reply(
        () =>
          new Response("bytes 2 to 5", {
            status: 206,
            headers: { "content-type": "image/png", "content-range": "bytes 2-5/10" },
          }),
      ),
    );
    const response = await responseOf(
      worker.dispatchFetch(new Request(ORIGIN + DIAGRAM, { headers: { range: "bytes=2-5" } })),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-range")).toBe("bytes 2-5/10");
    expect(await response.text()).toBe("bytes 2 to 5");
  });

  test("the page's own abort reaches the network fetch", async () => {
    const worker = await withListedDiagram();
    const gate = deferred<Response>();
    worker.net.on(DIAGRAM, later(gate));
    const page = new AbortController();
    worker.dispatchFetch(new Request(ORIGIN + DIAGRAM, { signal: page.signal }));
    await settle();
    const call = worker.net.callsTo(DIAGRAM)[0];
    const signal = call?.init?.signal ?? call?.request?.signal;
    expect(signal?.aborted).toBe(false);
    page.abort();
    expect(signal?.aborted).toBe(true);
  });

  test("never fall back to a stored asset no saved copy lists", async () => {
    const worker = boot();
    worker.assetCache().seed(DIAGRAM, "orphan");
    worker.net.on(DIAGRAM, refuse);
    await expect(responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)))).rejects.toThrow();
  });

  // Codex R2 A2: listed-ness is decided before anything is buffered, so an asset
  // no saved copy lists streams exactly as it would without the worker.
  test.each([
    ["a diagram", DIAGRAM],
    ["an agenda", AGENDA],
  ])(
    "%s no saved copy lists passes through untouched: its headers reach the page while its body is still arriving",
    async (_label, path) => {
      const worker = boot();
      // Stored, but listed by no copy (skipped by a cap, say): still unlisted.
      worker.assetCache().seed(path, "orphan");
      const network = new Response(stalledBody(), {
        status: 200,
        headers: { "content-type": "application/pdf", "content-length": "4096" },
      });
      worker.net.on(
        path,
        reply(() => network),
      );
      const dispatched = worker.dispatchFetch(new Request(ORIGIN + path));
      const served = watch(responseOf(dispatched));
      await settle();
      expect(served.done()).toBe(true);
      const response = await responseOf(dispatched);
      expect(response).toBe(network);
      const reader = response.body?.getReader();
      const first = await reader?.read();
      expect(new TextDecoder().decode(first?.value)).toBe("partial");
      await reader?.cancel();
    },
  );

  test("an unlisted asset keeps waiting on the network past 5 s", async () => {
    const worker = boot();
    const gate = deferred<Response>();
    worker.net.on(DIAGRAM, later(gate));
    const dispatched = worker.dispatchFetch(new Request(ORIGIN + DIAGRAM));
    const served = watch(responseOf(dispatched));
    await worker.clock.advance(10_000);
    expect(served.done()).toBe(false);
    gate.resolve(new Response("slow diagram"));
    expect(await (await responseOf(dispatched)).text()).toBe("slow diagram");
  });
});

describe("static files (spec 4.2, 4.8)", () => {
  test("cache first, stored on first fetch with its time", async () => {
    const worker = boot();
    const first = await responseOf(worker.dispatchFetch(new Request(ORIGIN + CHUNK)));
    expect(await first.text()).toBe("console.log(1)");
    await settle();
    expect(worker.staticCache().paths()).toEqual([CHUNK]);
    expect((await worker.store.staticIndex()).get(CHUNK)).toBe(START);
    worker.net.on(CHUNK, refuse);
    const second = await responseOf(worker.dispatchFetch(new Request(ORIGIN + CHUNK)));
    expect(await second.text()).toBe("console.log(1)");
    expect(worker.net.callsTo(CHUNK)).toHaveLength(1);
  });
});

// --- Eviction and retention (spec 4.8) -------------------------------------------------

describe("eviction and retention", () => {
  const showN = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const linkN = (n: number) => `/show/show-${n}/tok-${n}`;

  test("serving a copy updates its lastOpenedAt", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, lastOpenedAt: START - DAY_MS });
    worker.net.on(U, refuse);
    await worker.clock.advance(1_000);
    await open(worker, U);
    expect((await worker.store.copyAtUrl(U))?.lastOpenedAt).toBe(START + 1_000);
  });

  test("saving a copy sets its lastOpenedAt", async () => {
    const worker = boot();
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    await open(worker, U);
    expect((await worker.store.copyAtUrl(U))?.lastOpenedAt).toBe(START);
  });

  test("an 11th show evicts the least recently opened show and the assets only it listed", async () => {
    const worker = boot();
    const unique = `/api/asset/diagram/${showN(0)}/rev-1/only-mine.png`;
    const shared = `/api/asset/diagram/${showN(0)}/rev-1/shared.png`;
    for (let n = 0; n < 10; n += 1) {
      const assets = n === 0 ? [unique, shared] : n === 1 ? [shared] : [];
      await worker.seed({
        showId: showN(n),
        url: linkN(n),
        lastOpenedAt: START - (10 - n) * DAY_MS,
        assets,
      });
    }
    worker.assetCache().seed(unique, "a");
    worker.assetCache().seed(shared, "b");
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    await open(worker, U);
    const shows = (await worker.store.listCopies()).map((copy) => copy.showId);
    expect(shows).toHaveLength(10);
    expect(shows).toContain(SHOW);
    expect(shows).not.toContain(showN(0));
    expect(worker.assetCache().paths()).toEqual([shared]);
  });

  test("re-saving a show already held never evicts it, even when it is the least recently opened", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, lastOpenedAt: START - 30 * DAY_MS });
    for (let n = 1; n < 10; n += 1) {
      await worker.seed({ showId: showN(n), url: linkN(n), lastOpenedAt: START - n * 1000 });
    }
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ renderedAt: LATER })))),
    );
    await open(worker, U);
    const copies = await worker.store.listCopies();
    expect(copies).toHaveLength(10);
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: LATER });
  });

  async function withAgedStatics() {
    const worker = boot();
    const referenced = "/_next/static/chunks/old-referenced.js";
    const orphan = "/_next/static/chunks/old-orphan.js";
    const recent = "/_next/static/chunks/recent-orphan.js";
    await worker.seed({ showId: SHOW_B, url: B_URL, statics: [referenced] });
    for (const path of [referenced, orphan, recent]) worker.staticCache().seed(path, path);
    await worker.store.recordStatics([referenced, orphan], START - 15 * DAY_MS);
    await worker.store.recordStatics([recent], START - DAY_MS);
    return { worker, referenced, orphan, recent };
  }

  test("after a commit, unreferenced statics past 14 days leave the cache and the index", async () => {
    const { worker, referenced, orphan, recent } = await withAgedStatics();
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    await open(worker, U);
    expect(worker.staticCache().paths()).not.toContain(orphan);
    expect(worker.staticCache().paths()).toEqual(expect.arrayContaining([referenced, recent]));
    const index = await worker.store.staticIndex();
    expect(index.has(orphan)).toBe(false);
    expect(index.has(referenced)).toBe(true);
    expect(index.has(recent)).toBe(true);
  });

  test("on activate, unreferenced statics past 14 days leave the cache and the index", async () => {
    const { worker, referenced, orphan, recent } = await withAgedStatics();
    premiseHolds("the orphan starts in the cache", worker.staticCache().paths().includes(orphan));
    await worker.lifecycle("activate");
    expect(worker.staticCache().paths()).toEqual([referenced, recent].sort());
    const index = await worker.store.staticIndex();
    expect([...index.keys()].sort()).toEqual([referenced, recent].sort());
  });

  test("a sweep while a save is in progress keeps the assets that save has stored", async () => {
    const worker = boot();
    const agenda = deferred<Response>();
    worker.net.on(
      DIAGRAM,
      reply(() => new Response("diagram")),
    );
    worker.net.on(AGENDA, later(agenda));
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ assets: [DIAGRAM, AGENDA] })))),
    );
    const nav = worker.navigate(U);
    await responseOf(nav);
    await settle();
    premiseHolds(
      "the diagram is stored and the save waits on the agenda",
      worker.assetCache().paths().includes(DIAGRAM) && worker.net.callsTo(AGENDA).length === 1,
    );
    await worker.lifecycle("activate");
    agenda.resolve(new Response("%PDF"));
    await nav.settled();
    expect((await worker.store.copyAtUrl(U))?.assets).toEqual([DIAGRAM, AGENDA]);
    expect(worker.assetCache().paths()).toEqual([AGENDA, DIAGRAM].sort());
  });

  test("a sweep while a save is in progress keeps an old cached stylesheet that save depends on", async () => {
    const worker = boot();
    worker.staticCache().seed(CSS, CSS_BODY, { "content-type": "text/css" });
    await worker.store.recordStatics([CSS], START - 30 * DAY_MS);
    const font = deferred<Response>();
    worker.net.on(FONT, later(font));
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    const nav = worker.navigate(U);
    await responseOf(nav);
    await settle();
    premise(
      "the save waits on the font its cached stylesheet names",
      worker.net.callsTo(FONT).length,
      0,
    );
    await worker.lifecycle("activate");
    font.resolve(new Response(new Uint8Array([1])));
    await nav.settled();
    expect(await worker.store.copyAtUrl(U)).not.toBeNull();
    expect(worker.staticCache().paths()).toContain(CSS);
  });
});

// --- Worker updates (spec 4.9) --------------------------------------------------------

describe("install and activate", () => {
  test("install calls skipWaiting", async () => {
    const worker = boot();
    await worker.lifecycle("install");
    expect(worker.skipWaitingCalls()).toBe(1);
  });

  test("activate drops caches of another schema version and claims the open pages", async () => {
    const worker = boot();
    for (const name of [
      "fxav-static-v0",
      "fxav-assets-v0",
      STATIC_CACHE,
      ASSET_CACHE,
      "someone-else",
    ]) {
      worker.caches.cache(name);
    }
    premiseHolds(
      "the version-0 caches are not the current ones",
      ![STATIC_CACHE, ASSET_CACHE].some((name) => name.endsWith("-v0")),
    );
    await worker.lifecycle("activate");
    expect([...worker.caches.caches.keys()].sort()).toEqual(
      [ASSET_CACHE, STATIC_CACHE, "someone-else"].sort(),
    );
    expect(worker.clients.claims).toBe(1);
  });
});

// --- Review round 1 -----------------------------------------------------------------

describe("faults never cost a served page", () => {
  test("a touchOpened that fails still serves the copy with its notice", async () => {
    const { store, state } = faultyStore(["touchOpened"]);
    const worker = boot({ store });
    await worker.seed({ showId: SHOW, url: U });
    state.broken = true;
    worker.net.on(U, refuse);
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBe("offline");
    expect(text).toContain(savedLabel(SHOW, U));
    expect(text).toContain('html:not([data-fxav-bar="mounted"]) body::before');
  });

  test("a store that fails: an online navigation gets the network page", async () => {
    const { store, state } = faultyStore(["copyAtUrl", "listCopies", "beginSave"]);
    const worker = boot({ store });
    state.broken = true;
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "hold", showId: null }, "live page"))),
    );
    const response = await open(worker, U);
    expect(await response.text()).toContain("live page");
  });

  test("a store that fails with no network: the not-saved page, never an error page", async () => {
    const { store, state } = faultyStore(["copyAtUrl", "listCopies", "beginSave"]);
    const worker = boot({ store });
    await worker.seed({ showId: SHOW, url: U });
    state.broken = true;
    worker.net.on(U, refuse);
    expect(await (await open(worker, U)).text()).toBe(notSavedPageHtml());
  });

  test("a static cache that cannot be opened: the file comes from the network", async () => {
    const worker = boot();
    worker.caches.failOpen = true;
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + CHUNK)));
    expect(await response.text()).toBe("console.log(1)");
  });

  test("a static cache that cannot be read: the file comes from the network", async () => {
    const worker = boot();
    worker.staticCache().seed(CHUNK, "stale");
    worker.staticCache().failMatch = true;
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + CHUNK)));
    expect(await response.text()).toBe("console.log(1)");
  });

  test("a listing that fails reads as unlisted: an asset gets the network's own answer", async () => {
    const { store, state } = faultyStore(["listCopies"]);
    const worker = boot({ store });
    state.broken = true;
    worker.net.on(
      DIAGRAM,
      reply(() => new Response("refused", { status: 404 })),
    );
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)));
    expect(response.status).toBe(404);
  });

  test("a listing that fails reads as unlisted: a slow asset keeps waiting on the network", async () => {
    const { store, state } = faultyStore(["listCopies"]);
    const worker = boot({ store });
    state.broken = true;
    const gate = deferred<Response>();
    worker.net.on(DIAGRAM, later(gate));
    const dispatched = worker.dispatchFetch(new Request(ORIGIN + DIAGRAM));
    const served = watch(responseOf(dispatched));
    await worker.clock.advance(6_000);
    expect(served.done()).toBe(false);
    gate.resolve(new Response("slow diagram"));
    expect(await (await responseOf(dispatched)).text()).toBe("slow diagram");
  });

  test("an asset cache that cannot be opened: a listed asset gets the network's own answer", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, assets: [DIAGRAM] });
    worker.caches.failOpen = true;
    worker.net.on(
      DIAGRAM,
      reply(() => new Response("refused", { status: 404 })),
    );
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)));
    expect(response.status).toBe(404);
  });
});

describe("a listed asset falls back to storage on a non-2xx answer (controller ruling)", () => {
  test("a 401 from the asset route (an archived show) serves the stored asset", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, assets: [DIAGRAM] });
    worker.assetCache().seed(DIAGRAM, "stored diagram");
    worker.net.on(
      DIAGRAM,
      reply(() => Response.json({ error: "epoch_stale" }, { status: 401 })),
    );
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("stored diagram");
  });

  test("an unlisted asset gets the network's non-2xx answer as is", async () => {
    const worker = boot();
    worker.assetCache().seed(DIAGRAM, "orphan");
    worker.net.on(
      DIAGRAM,
      reply(() => Response.json({ error: "epoch_stale" }, { status: 401 })),
    );
    const response = await responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)));
    expect(response.status).toBe(401);
  });
});

describe("a stored agenda answers Range requests (pdf.js range loading)", () => {
  const SIZE = 200 * 1024;
  const bytes = Uint8Array.from({ length: SIZE }, (_, index) => index % 251);

  async function offlineAgenda() {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, assets: [AGENDA] });
    worker.assetCache().seed(AGENDA, bytes, {
      "content-type": "application/pdf",
      "accept-ranges": "bytes",
      "content-length": String(SIZE),
    });
    worker.net.on(AGENDA, refuse);
    return worker;
  }

  async function get(worker: Worker, range?: string): Promise<Response> {
    const headers: Record<string, string> = range === undefined ? {} : { range };
    return responseOf(worker.dispatchFetch(new Request(ORIGIN + AGENDA, { headers })));
  }

  test("premise: the agenda is past pdf.js's 128 KiB range threshold", () => {
    premise("the stored agenda is over 128 KiB", bytes.byteLength, 128 * 1024);
  });

  test("no Range: the whole stored body, still offering ranges", async () => {
    const response = await get(await offlineAgenda());
    expect(response.status).toBe(200);
    expect(response.headers.get("accept-ranges")).toBe("bytes");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  test.each([
    ["bytes=131072-196607", 131072, 196607],
    ["bytes=200000-", 200000, SIZE - 1],
    ["bytes=-1024", SIZE - 1024, SIZE - 1],
    ["bytes=204000-300000", 204000, SIZE - 1],
    ["bytes=0-0", 0, 0],
  ])("%s answers 206 with the slice", async (range, start, end) => {
    const response = await get(await offlineAgenda(), range);
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe(`bytes ${start}-${end}/${SIZE}`);
    expect(response.headers.get("content-length")).toBe(String(end - start + 1));
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes.slice(start, end + 1));
  });

  test.each(["bytes=999999-", "bytes=-0"])("%s is unsatisfiable: 416", async (range) => {
    const response = await get(await offlineAgenda(), range);
    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe(`bytes */${SIZE}`);
  });
});

describe("a sweep never takes a file a save holds, even when the save starts mid-sweep", () => {
  test("a static cache hit pinned after the sweep read the index is kept", async () => {
    const { store, gate, calls } = gatedStaticIndex();
    const worker = boot({ store });
    worker.staticCache().seed(CSS, CSS_BODY, { "content-type": "text/css" });
    await store.recordStatics([CSS], START - 30 * DAY_MS);
    const font = deferred<Response>();
    worker.net.on(FONT, later(font));
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    const activated = worker.lifecycle("activate");
    await settle();
    premise("the sweep is waiting with an index that calls the stylesheet old", calls(), 0);
    const nav = worker.navigate(U);
    await responseOf(nav);
    await settle();
    premise(
      "the save holds the stylesheet and waits on its font",
      worker.net.callsTo(FONT).length,
      0,
    );
    gate.resolve();
    await settle();
    expect(worker.staticCache().paths()).toContain(CSS);
    font.resolve(new Response(new Uint8Array([1])));
    await nav.settled();
    await activated;
    expect(await worker.store.copyAtUrl(U)).not.toBeNull();
    expect(worker.staticCache().paths()).toContain(CSS);
    expect((await worker.store.staticIndex()).has(CSS)).toBe(true);
  });

  test("a save that commits while an older sweep waits keeps its static files", async () => {
    const { store, gate, calls } = gatedStaticIndex();
    const worker = boot({ store });
    worker.staticCache().seed(CSS, CSS_BODY, { "content-type": "text/css" });
    await store.recordStatics([CSS], START - 30 * DAY_MS);
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    const activated = worker.lifecycle("activate");
    await settle();
    premise("the sweep is waiting with an index that calls the stylesheet old", calls(), 0);
    const nav = worker.navigate(U);
    await responseOf(nav);
    await settle();
    premiseHolds(
      "the save committed while the sweep waited",
      (await worker.store.copyAtUrl(U)) !== null,
    );
    gate.resolve();
    await nav.settled();
    await activated;
    expect(worker.staticCache().paths()).toContain(CSS);
    expect((await worker.store.staticIndex()).has(CSS)).toBe(true);
  });

  test("an asset stored after the sweep read the copies is kept", async () => {
    const worker = boot();
    const gate = deferred<void>();
    worker.assetCache().keysGate = gate.promise;
    const agenda = deferred<Response>();
    worker.net.on(
      DIAGRAM,
      reply(() => new Response("diagram")),
    );
    worker.net.on(AGENDA, later(agenda));
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ assets: [DIAGRAM, AGENDA] })))),
    );
    const activated = worker.lifecycle("activate");
    await settle();
    const nav = worker.navigate(U);
    await responseOf(nav);
    await settle();
    premiseHolds(
      "the diagram is stored and the save waits on the agenda",
      worker.assetCache().paths().includes(DIAGRAM) && worker.net.callsTo(AGENDA).length === 1,
    );
    gate.resolve();
    await settle();
    expect(worker.assetCache().paths()).toContain(DIAGRAM);
    agenda.resolve(new Response("%PDF"));
    await nav.settled();
    await activated;
    expect((await worker.store.copyAtUrl(U))?.assets).toEqual([DIAGRAM, AGENDA]);
    expect(worker.assetCache().paths()).toEqual([AGENDA, DIAGRAM].sort());
  });

  test("a save that commits while an older sweep waits keeps its assets", async () => {
    const worker = boot();
    const gate = deferred<void>();
    worker.assetCache().keysGate = gate.promise;
    worker.net.on(
      DIAGRAM,
      reply(() => new Response("diagram")),
    );
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save({ assets: [DIAGRAM] })))),
    );
    const activated = worker.lifecycle("activate");
    await settle();
    const nav = worker.navigate(U);
    await responseOf(nav);
    await settle();
    premiseHolds(
      "the save committed while the sweep waited",
      (await worker.store.copyAtUrl(U)) !== null,
    );
    gate.resolve();
    await nav.settled();
    await activated;
    expect(worker.assetCache().paths()).toEqual([DIAGRAM]);
  });
});

describe("a sweep that is mid-delete when a save stores the same file again", () => {
  test("keeps the index row the save wrote", async () => {
    const worker = boot();
    worker.staticCache().seed(CSS, CSS_BODY, { "content-type": "text/css" });
    await worker.store.recordStatics([CSS], START - 30 * DAY_MS);
    const gate = deferred<void>();
    worker.staticCache().deleteGate = gate.promise;
    worker.net.on(
      U,
      reply(() => htmlResponse(page(save()))),
    );
    const activated = worker.lifecycle("activate");
    await settle();
    premiseHolds(
      "the sweep has deleted the old stylesheet and waits",
      !worker.staticCache().paths().includes(CSS),
    );
    const nav = worker.navigate(U);
    await responseOf(nav);
    await settle();
    premiseHolds(
      "the save stored the stylesheet again and committed",
      worker.staticCache().paths().includes(CSS) && (await worker.store.copyAtUrl(U)) !== null,
    );
    gate.resolve();
    await nav.settled();
    await activated;
    expect(worker.staticCache().paths()).toContain(CSS);
    expect((await worker.store.staticIndex()).get(CSS)).toBe(START);
  });
});

describe("a navigation's sweep runs under the navigation's waitUntil", () => {
  test.each([
    [
      "a purge marker",
      U,
      "GET",
      () => htmlResponse(page({ disposition: "purge", showId: SHOW }, "picker")),
    ],
    [
      "the sign-out bracket",
      "/auth/sign-out",
      "POST",
      () => new Response(null, { status: 303, headers: { location: "/" } }),
    ],
  ])("%s", async (_label, path, method, make) => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, assets: [DIAGRAM] });
    worker.assetCache().seed(DIAGRAM, "png");
    const gate = deferred<void>();
    worker.assetCache().keysGate = gate.promise;
    worker.net.on(path, reply(make));
    const nav = worker.navigate(path, { method });
    await responseOf(nav);
    const finished = watch(nav.extended());
    await settle();
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
    expect(finished.done()).toBe(false);
    gate.resolve();
    await nav.settled();
    expect(worker.assetCache().paths()).toEqual([]);
  });
});

describe("purges reply once the store has purged; the sweep runs after, under waitUntil", () => {
  test.each([
    ["purge-show", { type: "purge-show", showId: SHOW }],
    ["a marker purge", { type: "marker", disposition: "purge", showId: SHOW, url: U }],
  ])("%s acks before its sweep has run", async (_label, message) => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, assets: [DIAGRAM] });
    worker.assetCache().seed(DIAGRAM, "png");
    const gate = deferred<void>();
    worker.assetCache().keysGate = gate.promise;
    const sent = worker.post(message);
    const finished = watch(sent.extended());
    await settle();
    expect(sent.replies).toEqual([{ outcome: "ack" }]);
    expect(await worker.store.copyByShow(SHOW)).toBeNull();
    expect(worker.assetCache().paths()).toEqual([DIAGRAM]);
    expect(finished.done()).toBe(false);
    gate.resolve();
    await sent.settled();
    sent.close();
    expect(worker.assetCache().paths()).toEqual([]);
  });
});

describe("the check row never serves a copy that changed during the status check", () => {
  function checkPage() {
    return reply(() =>
      htmlResponse(page({ disposition: "check", showId: null }, "not found"), 404),
    );
  }

  test("purged during the check: the network page is served", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, checkPage());
    worker.net.on(STATUS, async () => {
      await worker.store.purge({ by: "show", showId: SHOW });
      return Response.json({ state: "ended" });
    });
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBeNull();
    expect(text).toContain("not found");
  });

  test("replaced during the check: the network page is served, not the old copy", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, checkPage());
    worker.net.on(STATUS, async () => {
      await worker.seed({
        showId: SHOW,
        url: U,
        html: "<html><head></head><body>newer</body></html>",
      });
      return Response.json({ state: "ended" });
    });
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBeNull();
    expect(text).toContain("not found");
  });

  test("marked ended by another check meanwhile: the same copy is served ended", async () => {
    const worker = boot();
    const copy = await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, checkPage());
    worker.net.on(STATUS, async () => {
      await worker.store.markEnded({ showId: SHOW, ordinal: copy.ordinal }, START - 1);
      return Response.json({ state: "ended" });
    });
    const text = await (await open(worker, U)).text();
    expect(servedMode(text)).toBe("ended");
    expect(text).toContain(savedLabel(SHOW, U));
  });
});

// --- Review round 2: a copy read before a wait is served only if it is still S(U) ---

describe("a copy read before a wait is served only while it is still S(U)", () => {
  const purgeShow = { type: "purge-show", showId: SHOW };
  const livePage = () => htmlResponse(page({ disposition: "hold", showId: null }, "live page"));

  async function endedCopy(worker: Worker) {
    return worker.seed({ showId: SHOW, url: U, endedAt: START - DAY_MS });
  }

  test("step 1, status ended: purged during the status check, the page is fetched instead", async () => {
    const worker = boot();
    await endedCopy(worker);
    const status = deferred<Response>();
    worker.net.on(STATUS, later(status));
    worker.net.on(U, reply(livePage));
    const nav = worker.navigate(U);
    await settle();
    premise("the status check is in flight", worker.net.callsTo(STATUS).length, 0);
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    status.resolve(Response.json({ state: "ended" }));
    const text = await (await responseOf(nav)).text();
    await nav.settled();
    expect(servedMode(text)).toBeNull();
    expect(text).toContain("live page");
  });

  test("step 1, no answer: purged during the status wait, no signal gets the not-saved page", async () => {
    const worker = boot();
    await endedCopy(worker);
    worker.net.on(STATUS, hang);
    worker.net.on(U, refuse);
    const nav = worker.navigate(U);
    await settle();
    premise("the status check is in flight", worker.net.callsTo(STATUS).length, 0);
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    await worker.clock.advance(5_000);
    expect(await (await responseOf(nav)).text()).toBe(notSavedPageHtml());
    await nav.settled();
  });

  test("step 1 no-verdict, network error: purged during the page fetch, the not-saved page", async () => {
    const worker = boot();
    await endedCopy(worker);
    worker.net.on(
      STATUS,
      reply(() => Response.json({ error: "X" }, { status: 500 })),
    );
    const pageFetch = deferred<Response>();
    worker.net.on(U, later(pageFetch));
    const nav = worker.navigate(U);
    await settle();
    premise("the page fetch is in flight", worker.net.callsTo(U).length, 0);
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    pageFetch.reject(new TypeError("Failed to fetch"));
    expect(await (await responseOf(nav)).text()).toBe(notSavedPageHtml());
    await nav.settled();
  });

  test("step 1 no-verdict, 8 s pass: purged during the page fetch, the page is waited for", async () => {
    const worker = boot();
    await endedCopy(worker);
    worker.net.on(
      STATUS,
      reply(() => Response.json({ error: "X" }, { status: 500 })),
    );
    const pageFetch = deferred<Response>();
    worker.net.on(U, later(pageFetch));
    const nav = worker.navigate(U);
    await settle();
    premise("the page fetch is in flight", worker.net.callsTo(U).length, 0);
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    const served = watch(responseOf(nav));
    await worker.clock.advance(8_000);
    expect(served.done()).toBe(false);
    pageFetch.resolve(livePage());
    const text = await (await responseOf(nav)).text();
    await nav.settled();
    expect(servedMode(text)).toBeNull();
    expect(text).toContain("live page");
  });

  test("step 3 server-error row: purged before the copy is served, the network page instead", async () => {
    const { store, gate, calls } = gatedTouch();
    const worker = boot({ store });
    await worker.seed({ showId: SHOW, url: U, viewer: VIEWER });
    worker.net.on(
      U,
      reply(() =>
        htmlResponse(
          page({ disposition: "keep", showId: SHOW, viewer: VIEWER }, "terminal failure"),
        ),
      ),
    );
    const nav = worker.navigate(U);
    await settle();
    premise("the serve is waiting inside serveCopy", calls(), 0);
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    gate.resolve();
    const text = await (await responseOf(nav)).text();
    await nav.settled();
    expect(servedMode(text)).toBeNull();
    expect(text).toContain("terminal failure");
  });

  test("step 3 check row: purged during the status check, the network page instead", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(
      U,
      reply(() => htmlResponse(page({ disposition: "check", showId: null }, "not found"), 404)),
    );
    const status = deferred<Response>();
    worker.net.on(STATUS, later(status));
    const nav = worker.navigate(U);
    await settle();
    premise("the status check is in flight", worker.net.callsTo(STATUS).length, 0);
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    status.resolve(Response.json({ state: "ended" }));
    const text = await (await responseOf(nav)).text();
    await nav.settled();
    expect(servedMode(text)).toBeNull();
    expect(text).toContain("not found");
  });

  test("step 4: purged before the offline copy is served, the not-saved page instead", async () => {
    const { store, gate, calls } = gatedTouch();
    const worker = boot({ store });
    await worker.seed({ showId: SHOW, url: U });
    worker.net.on(U, refuse);
    const nav = worker.navigate(U);
    await settle();
    premise("the serve is waiting inside serveCopy", calls(), 0);
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    gate.resolve();
    expect(await (await responseOf(nav)).text()).toBe(notSavedPageHtml());
    await nav.settled();
  });

  test("step 4: replaced by a newer save before the old copy is served, that old copy is not served", async () => {
    const { store, gate, calls } = gatedTouch();
    const worker = boot({ store });
    await worker.seed({ showId: SHOW, url: U, html: page(save(), "old copy") });
    worker.net.on(U, refuse);
    const nav = worker.navigate(U);
    await settle();
    premise("the serve is waiting inside serveCopy", calls(), 0);
    await worker.seed({ showId: SHOW, url: U, html: page(save(), "newer copy") });
    gate.resolve();
    const text = await (await responseOf(nav)).text();
    await nav.settled();
    expect(text).not.toContain("old copy");
    expect(text).toBe(notSavedPageHtml());
  });

  test("step 5: purged before the slow copy is served, the page is waited for", async () => {
    const { store, gate, calls } = gatedTouch();
    const worker = boot({ store });
    await worker.seed({ showId: SHOW, url: U });
    const pageFetch = deferred<Response>();
    worker.net.on(U, later(pageFetch));
    const nav = worker.navigate(U);
    const served = watch(responseOf(nav));
    await worker.clock.advance(8_000);
    premise("the slow serve is waiting inside serveCopy", calls(), 0);
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    gate.resolve();
    await worker.clock.advance(30_000);
    expect(served.done()).toBe(false);
    pageFetch.resolve(livePage());
    const text = await (await responseOf(nav)).text();
    await nav.settled();
    expect(servedMode(text)).toBeNull();
    expect(text).toContain("live page");
  });

  test("a stored asset whose copy is purged while the cache is read is not served", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, assets: [DIAGRAM] });
    worker.assetCache().seed(DIAGRAM, "stored diagram");
    const gate = deferred<void>();
    worker.assetCache().matchGate = gate.promise;
    worker.net.on(DIAGRAM, refuse);
    const dispatched = worker.dispatchFetch(new Request(ORIGIN + DIAGRAM));
    await settle();
    expect(await worker.ask(purgeShow)).toEqual({ outcome: "ack" });
    gate.resolve();
    await expect(responseOf(dispatched)).rejects.toThrow();
  });
});

describe("a range answer slices the stored body instead of copying it whole", () => {
  test("no arrayBuffer read of the stored agenda", async () => {
    const worker = boot();
    await worker.seed({ showId: SHOW, url: U, assets: [AGENDA] });
    const bytes = Uint8Array.from({ length: 200 * 1024 }, (_, index) => index % 251);
    worker.assetCache().seed(AGENDA, bytes, { "accept-ranges": "bytes" });
    worker.net.on(AGENDA, refuse);
    const arrayBuffer = vi.spyOn(Response.prototype, "arrayBuffer");
    try {
      const response = await responseOf(
        worker.dispatchFetch(
          new Request(ORIGIN + AGENDA, { headers: { range: "bytes=1024-2047" } }),
        ),
      );
      expect(response.status).toBe(206);
      expect(arrayBuffer).not.toHaveBeenCalled();
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes.slice(1024, 2048));
    } finally {
      arrayBuffer.mockRestore();
    }
  });
});

// --- A purge the store cannot write fails closed (spec 4.6, Codex R2 A1) -----------------

describe("a purge the store cannot write fails closed (spec 4.6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * The real IndexedDB store over fake-indexeddb, with a switch that aborts every
   * purge transaction, as Codex's probe did. A purge is the only read-write
   * transaction over the copies that writes the generation counter (idbStore.ts
   * writes `meta` only when G or the next ordinal moves, and beginSave's
   * transaction covers `meta` alone), so the abort lands on purges and nothing
   * else: reads, commits, touches and marks keep working.
   */
  function abortingPurges() {
    const factory = new FakeIDBFactory();
    const store = createIdbStore(factory);
    const state = { failing: false, aborted: 0 };
    type ObjectStore = InstanceType<typeof FakeIDBObjectStore>;
    const put = FakeIDBObjectStore.prototype.put;
    vi.spyOn(FakeIDBObjectStore.prototype, "put").mockImplementation(function (
      this: ObjectStore,
      ...args: Parameters<ObjectStore["put"]>
    ) {
      const request = put.apply(this, args);
      const purging =
        this.name === META_STORE && this.transaction.objectStoreNames.contains(COPIES_STORE);
      if (state.failing && purging) {
        state.aborted += 1;
        this.transaction.abort();
      }
      return request;
    });
    return { factory, store, state };
  }

  /** A factory whose deleteDatabase fails, so the escalation cannot clear storage either. */
  function failingDeletes() {
    const names: string[] = [];
    const factory: Pick<IDBFactory, "deleteDatabase"> = {
      deleteDatabase(name: string): IDBOpenDBRequest {
        names.push(name);
        const request = {
          onsuccess: null,
          onerror: null,
          onblocked: null,
          error: new DOMException("The database could not be deleted.", "UnknownError"),
        } as unknown as IDBOpenDBRequest;
        setImmediate(() => {
          (request.onerror as ((event: Event) => void) | null)?.(new Event("error"));
        });
        return request;
      },
    };
    return { factory, names };
  }

  /** A worker whose purges abort and whose escalation fails: storage refuses writes, reads still work. */
  async function brokenStorage(seed: Partial<StoredCopy> = {}) {
    const { store, state } = abortingPurges();
    const deletes = failingDeletes();
    const worker = boot({ store, indexedDB: deletes.factory });
    await worker.seed({ showId: SHOW, url: U, ...seed });
    state.failing = true;
    return { worker, state, deletes };
  }

  const purgePage = () => htmlResponse(page({ disposition: "purge", showId: SHOW }, "purged"));

  // Every purge path Codex probed: the identity brackets, the purge-show message,
  // a purge marker message, a purge document, a status route answering gone, a
  // silent probe, an ensure-saved, the step 5 continuation, and step 1's gone.
  const PATHS: ReadonlyArray<readonly [string, (worker: Worker) => Promise<unknown>]> = [
    [
      "the sign-out bracket",
      (worker) => {
        worker.net.on(
          "/auth/sign-out",
          reply(() => new Response(null, { status: 303, headers: { location: "/" } })),
        );
        return open(worker, "/auth/sign-out", { method: "POST" });
      },
    ],
    [
      "the Google callback bracket",
      (worker) => {
        worker.net.on(
          "/auth/callback",
          reply(() => new Response(null, { status: 303, headers: { location: "/" } })),
        );
        return open(worker, "/auth/callback?code=abc");
      },
    ],
    ["purge-show", (worker) => worker.ask({ type: "purge-show", showId: SHOW })],
    [
      "a purge marker message",
      (worker) => worker.ask({ type: "marker", disposition: "purge", showId: SHOW, url: U }),
    ],
    [
      "a purge document",
      (worker) => {
        worker.net.on(U, reply(purgePage));
        return open(worker, U);
      },
    ],
    [
      "a status route answering gone to a check",
      (worker) => {
        worker.net.on(STATUS, statusAnswer("gone"));
        return worker.ask({ type: "marker", disposition: "check", url: U });
      },
    ],
    [
      "a silent probe",
      (worker) => {
        worker.net.on(U, reply(purgePage));
        return worker.ask({ type: "probe", url: U });
      },
    ],
    [
      "an ensure-saved",
      (worker) => {
        worker.net.on(U, reply(purgePage));
        return worker.ask({ type: "ensure-saved", url: U, renderedAt: LATER });
      },
    ],
    [
      "the step 5 continuation",
      async (worker) => {
        const gate = deferred<Response>();
        worker.net.on(U, later(gate));
        const nav = worker.navigate(U);
        await worker.clock.advance(8_000);
        premiseHolds(
          "the slow fallback served the copy",
          servedMode(await (await responseOf(nav)).text()) === "slow",
        );
        gate.resolve(purgePage());
        await nav.settled();
      },
    ],
  ];

  test.each(PATHS)(
    "%s: the copy the purge could not remove is never served afterwards",
    async (_label, run) => {
      const { worker, state } = await brokenStorage();
      await run(worker);
      premiseHolds("the purge transaction aborted", state.aborted > 0);
      premiseHolds(
        "the copy is still stored, so only the worker can keep it from being served",
        (await worker.store.copyAtUrl(U))?.url === U,
      );
      worker.net.on(U, refuse);
      worker.net.on(STATUS, refuse);
      expect(await (await open(worker, U)).text()).toBe(notSavedPageHtml());
    },
  );

  test("step 1's gone: the ended copy the purge could not remove is never served afterwards", async () => {
    const { worker, state } = await brokenStorage({ endedAt: START - DAY_MS });
    worker.net.on(STATUS, statusAnswer("gone"));
    worker.net.on(U, reply(purgePage));
    await open(worker, U);
    premiseHolds("the purge transaction aborted", state.aborted > 0);
    premiseHolds(
      "the ended copy is still stored",
      (await worker.store.copyAtUrl(U))?.endedAt === START - DAY_MS,
    );
    // No answer from the status route would serve an ended copy on the phone's own judgement.
    worker.net.on(STATUS, refuse);
    worker.net.on(U, refuse);
    expect(await (await open(worker, U)).text()).toBe(notSavedPageHtml());
  });

  test("online, a page whose copy could not be purged gets the network's page", async () => {
    const { worker } = await brokenStorage();
    await worker.ask({ type: "purge-show", showId: SHOW });
    // A keep marker for the saved viewer would serve the copy in server-error mode.
    worker.net.on(
      U,
      reply(() =>
        htmlResponse(page({ disposition: "keep", showId: SHOW, viewer: VIEWER }, "server page")),
      ),
    );
    const text = await (await open(worker, U)).text();
    expect(text).toContain("server page");
    expect(servedMode(text)).toBeNull();
  });

  test("a stored asset of a copy that could not be purged is never served", async () => {
    const { worker } = await brokenStorage({ assets: [DIAGRAM] });
    worker.assetCache().seed(DIAGRAM, "stored diagram");
    await worker.ask({ type: "purge-show", showId: SHOW });
    premiseHolds(
      "the copy still lists the asset",
      (await worker.store.copyAtUrl(U))?.assets.includes(DIAGRAM) === true,
    );
    worker.net.on(DIAGRAM, refuse);
    await expect(responseOf(worker.dispatchFetch(new Request(ORIGIN + DIAGRAM)))).rejects.toThrow();
  });

  test.each([
    ["begun before the failed purge", true],
    ["begun after it", false],
  ])("a save %s never commits", async (_label, startFirst) => {
    const { worker } = await brokenStorage({ savedAt: RENDERED });
    const crewPage = deferred<Response>();
    worker.net.on(U, later(crewPage));
    const startSave = async () => {
      const nav = worker.navigate(U);
      await settle();
      premise("the save's page fetch went out", worker.net.callsTo(U).length, 0);
      return nav;
    };
    const nav = startFirst ? await startSave() : null;
    expect(await worker.ask({ type: "purge-show", showId: SHOW })).toEqual({ outcome: "ack" });
    const saving = nav ?? (await startSave());
    crewPage.resolve(htmlResponse(page(save({ renderedAt: LATER }), "new page")));
    await responseOf(saving);
    await saving.settled();
    expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: RENDERED });
  });

  test.each([
    [
      "a fetch event",
      (worker: Worker) => worker.dispatchFetch(new Request(ORIGIN + CHUNK)).settled(),
    ],
    ["a message", (worker: Worker) => worker.ask({ type: "not a message" })],
  ])(
    "%s retries the purge; once it succeeds the quarantine ends and a new save is served",
    async (_label, next) => {
      const { store, state } = abortingPurges();
      const worker = boot({ store });
      await worker.seed({ showId: SHOW, url: U, savedAt: RENDERED });
      state.failing = true;
      await worker.ask({ type: "purge-show", showId: SHOW });
      premiseHolds(
        "the purge left the copy",
        (await worker.store.copyAtUrl(U))?.savedAt === RENDERED,
      );

      state.failing = false;
      await next(worker);
      expect(await worker.store.copyAtUrl(U)).toBeNull();

      worker.net.on(
        U,
        reply(() => htmlResponse(page(save({ renderedAt: LATER }), "after the retry"))),
      );
      await open(worker, U);
      expect(await worker.store.copyAtUrl(U)).toMatchObject({ savedAt: LATER });
      worker.net.on(U, refuse);
      const text = await (await open(worker, U)).text();
      expect(servedMode(text)).toBe("offline");
      expect(text).toContain("after the retry");
    },
  );

  test("a retry that fails escalates: the database and every fxav- cache go, other caches stay, and the quarantine ends", async () => {
    const { factory, store, state } = abortingPurges();
    const deleteDatabase = vi.spyOn(factory, "deleteDatabase");
    const worker = boot({ store, indexedDB: factory });
    await worker.seed({ showId: SHOW, url: U, assets: [DIAGRAM] });
    worker.assetCache().seed(DIAGRAM, "stored diagram");
    worker.staticCache().seed(CHUNK, "stored chunk");
    worker.caches.cache("another-app").seed("/elsewhere.js", "theirs");
    // The worker has its static cache open before the escalation deletes it.
    await worker.dispatchFetch(new Request(ORIGIN + CHUNK)).settled();
    premise("the chunk came from the stored cache", 1, worker.net.callsTo(CHUNK).length);
    state.failing = true;
    await worker.ask({ type: "purge-show", showId: SHOW });
    premiseHolds("the purge left the copy", (await worker.store.copyAtUrl(U))?.url === U);

    await worker.ask({ type: "not a message" });
    expect(deleteDatabase.mock.calls).toEqual([[DB_NAME]]);
    expect((await factory.databases()).map((db) => db.name)).not.toContain(DB_NAME);
    expect([...worker.caches.caches.keys()]).toEqual(["another-app"]);

    // The quarantine is over: the next event escalates nothing, and a static file
    // is stored in the cache that now exists rather than the deleted one.
    worker.net.on(
      CHUNK,
      reply(() => new Response("fresh chunk")),
    );
    await worker.dispatchFetch(new Request(ORIGIN + CHUNK)).settled();
    expect(deleteDatabase).toHaveBeenCalledTimes(1);
    expect(worker.staticCache().paths()).toEqual([CHUNK]);

    worker.net.on(U, refuse);
    expect(await (await open(worker, U)).text()).toBe(notSavedPageHtml());
  });

  test("an escalation that fails keeps the quarantine, and the next event escalates again", async () => {
    const { worker, deletes } = await brokenStorage();
    await worker.ask({ type: "purge-show", showId: SHOW });
    await worker.ask({ type: "not a message" });
    expect(deletes.names).toEqual([DB_NAME]);
    await worker.ask({ type: "not a message" });
    expect(deletes.names).toEqual([DB_NAME, DB_NAME]);
    worker.net.on(U, refuse);
    expect(await (await open(worker, U)).text()).toBe(notSavedPageHtml());
  });
});
