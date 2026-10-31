/**
 * The service worker's handlers (spec 4.2, 4.4, 4.6, 4.8, 4.9), with every
 * dependency injected so Vitest drives the same code the worker bundle runs.
 *
 * This is glue. What to serve, what to purge and what to evict is decided by
 * the pure tables (navigation.ts, store.ts, caps.ts, completeness.ts); this
 * file fetches, times, stores and asks them. Three rules hold everywhere:
 *
 * - A copy is only ever served through `serveCopy`, which injects the notice,
 *   and only at the URL it was saved under (S(U)) on a table's say-so. Its last
 *   await re-reads S(U), and it serves nothing unless the copy a caller read
 *   before any wait (a status check, a page fetch) is still stored there.
 * - Every save takes its generation and ordinal (`beginSave`) before its fetch
 *   is sent, so a purge that lands while the fetch is in flight voids it.
 * - A purge the store cannot write fails closed: the worker quarantines itself,
 *   in memory and in a Cache Storage marker, serving no copy and committing no
 *   save, and escalates at once, until a purge or the escalation succeeds
 *   (spec 4.6).
 * - A fault inside the handlers serves the network, or the not-saved page when
 *   the network fails too; never a copy. Bookkeeping writes (`touchOpened`, the
 *   sweep, broadcasts) are best effort, so a full or failing store cannot stop
 *   a copy from being served with its notice.
 */
import {
  ASSET_MAX_BYTES,
  SHOW_PREFETCH_MAX_BYTES,
  admitAsset,
  evictionVictims,
  staticEvictions,
} from "@/lib/offline/caps";
import { fontUrlsFromCss, requiredStaticUrls } from "@/lib/offline/completeness";
import { classifyRequest, crewPath } from "@/lib/offline/crewUrl";
import { formatSavedTime } from "@/lib/offline/format";
import { injectSavedCopyHead } from "@/lib/offline/inject";
import { readNavigationMarker, type MarkerRead, type SaveMarker } from "@/lib/offline/marker";
import {
  NAV_BUDGET_MS,
  STATUS_TIMEOUT_MS,
  decideCheckOutcome,
  decideEndedFetch,
  decideEndedStep1,
  decideNoResponse,
  decideStep3,
  type CompleteResponse,
  type FetchResult,
  type SavedView,
  type ServeMode,
  type StatusOutcome,
} from "@/lib/offline/navigation";
import { notSavedPageHtml } from "@/lib/offline/notSavedPage";
import {
  OUTCOME_OF,
  parsePageMessage,
  savedCopyStatusUrl,
  statusOutcomeOf,
  type PageMessage,
  type SilentResult,
  type WorkerBroadcast,
  type WorkerReply,
} from "@/lib/offline/protocol";
import type {
  CopyRef,
  PurgeScope,
  SaveToken,
  SavedCopyStore,
  StoredCopy,
} from "@/lib/offline/store";
import {
  ASSET_CACHE,
  CACHE_PREFIX,
  DB_NAME,
  QUARANTINE_CACHE,
  QUARANTINE_KEY,
  STATIC_CACHE,
} from "@/lib/offline/storeSchema";
import type {
  CacheLike,
  CacheStorageLike,
  Clients,
  ExtendableEvent,
  ExtendableMessageEvent,
  FetchEvent,
  Timers,
  WorkerScope,
} from "@/lib/offline/worker/swTypes";

export type WorkerDeps = {
  store: SavedCopyStore;
  /** Static and asset caches are opened from here when first needed (ruling D3). */
  cacheStorage: CacheStorageLike;
  /**
   * The factory the store's database lives in (entry.ts opens the store over the
   * same one). A purge the store cannot write, retried and failing again,
   * escalates to deleting that database (spec 4.6).
   */
  indexedDB: Pick<IDBFactory, "deleteDatabase">;
  fetch: (input: Request | string, init?: RequestInit) => Promise<Response>;
  /** Epoch milliseconds. */
  now: () => number;
  clients: Clients;
  timers: Timers;
};

/**
 * An asset request waits this long for the network's whole response, headers
 * and body, before a stored copy may answer (spec 4.8).
 */
const ASSET_TIMEOUT_MS = 5_000;

/**
 * A save waits this long for one listed asset, headers and body together,
 * before it aborts the fetch and skips the asset (spec 4.8): assets are
 * optional, so one that hangs must not hold back the page's own copy.
 */
const ASSET_FETCH_BUDGET_MS = 30_000;

/** Every document the worker builds: a saved copy, the not-saved page (spec 4.7.1, 4.7.5). */
const HTML_HEADERS: Readonly<Record<string, string>> = {
  "content-type": "text/html; charset=utf-8",
};

/** The body was decoded when it was read, so these describe bytes that no longer exist. */
const TRANSPORT_HEADERS: readonly string[] = ["content-encoding", "content-length"];

/** Statuses a Response cannot be constructed with a body for. */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([101, 103, 204, 205, 304]);

const ACK: WorkerReply = Object.freeze({ outcome: "ack" });

/** A response read to its end, or an opaque redirect, which has no body and is served as is. */
type Fetched =
  | { kind: "opaque-redirect"; response: Response }
  | {
      kind: "body";
      status: number;
      statusText: string;
      headers: Headers;
      bytes: Uint8Array<ArrayBuffer>;
      text: string;
      marker: MarkerRead;
    };

/** A fetch in flight. `result` is null for a network error, including a body that fails mid-stream. */
type Attempt = { result: Promise<Fetched | null>; abort: () => void };

type Timed<T> = { kind: "done"; value: T } | { kind: "timeout" };

/** One listed asset as a save fetched it: its bytes, or skip it, or stop the show's prefetch. */
type FetchedAsset =
  | { kind: "read"; bytes: Uint8Array<ArrayBuffer>; headers: Headers }
  | { kind: "skip" }
  | { kind: "stop" };

const SKIP: FetchedAsset = Object.freeze({ kind: "skip" });
const STOP: FetchedAsset = Object.freeze({ kind: "stop" });

/** What a fetch handler serves, and the work that continues after it (kept alive by waitUntil). */
type Handled = { response: Response; background: Promise<unknown> };

/**
 * What a save began with: the store's token, and G in memory at that moment
 * (spec 4.6). G in memory is null for a save begun in quarantine, which never
 * commits.
 */
type Ticket = { token: SaveToken; memoryGeneration: number | null };

const NOTHING_MORE: Promise<void> = Promise.resolve();

function served(response: Response): Handled {
  return { response, background: NOTHING_MORE };
}

function refOf(copy: StoredCopy): CopyRef {
  return { showId: copy.showId, ordinal: copy.ordinal };
}

function hold(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function release(counts: Map<string, number>, key: string): void {
  const left = (counts.get(key) ?? 0) - 1;
  if (left > 0) counts.set(key, left);
  else counts.delete(key);
}

function isQuotaError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "QuotaExceededError"
  );
}

function withoutTransportHeaders(headers: Headers): Headers {
  const kept = new Headers(headers);
  for (const name of TRANSPORT_HEADERS) kept.delete(name);
  return kept;
}

function completeOf(fetched: Fetched): CompleteResponse {
  return fetched.kind === "opaque-redirect"
    ? { kind: "opaque-redirect" }
    : { kind: "body", status: fetched.status, marker: fetched.marker };
}

function saveMarkerOf(fetched: Fetched): SaveMarker | null {
  if (fetched.kind !== "body" || fetched.marker.kind !== "valid") return null;
  const marker = fetched.marker.marker;
  return marker.disposition === "save" ? marker : null;
}

/** The network response as it was, minus the transport headers its decoded body no longer matches. */
function networkResponse(fetched: Fetched): Response {
  if (fetched.kind === "opaque-redirect") return fetched.response;
  return new Response(NULL_BODY_STATUSES.has(fetched.status) ? null : fetched.bytes, {
    status: fetched.status,
    statusText: fetched.statusText,
    headers: withoutTransportHeaders(fetched.headers),
  });
}

async function readFetched(response: Response): Promise<Fetched> {
  if (response.type === "opaqueredirect") return { kind: "opaque-redirect", response };
  const bytes = new Uint8Array(await response.arrayBuffer());
  const text = new TextDecoder().decode(bytes);
  return {
    kind: "body",
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
    bytes,
    text,
    // A streamed not-found page reads as its check marker (readNavigationMarker).
    marker: readNavigationMarker(text),
  };
}

/**
 * A response read to its end, as a fresh one with the same status and headers
 * over the bytes read. The bytes are decoded, so the encoding header goes and
 * the length is the decoded one; rejects when the body fails mid-stream.
 */
async function readWhole(response: Response): Promise<Response> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const empty = NULL_BODY_STATUSES.has(response.status);
  const headers = withoutTransportHeaders(response.headers);
  if (!empty) headers.set("content-length", String(bytes.byteLength));
  return new Response(empty ? null : bytes, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function declaredLength(response: Response): number | null {
  const raw = response.headers.get("content-length")?.trim();
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
}

/**
 * Reads a body while counting, and stops reading as soon as it passes `limit`:
 * an asset of unknown length is never buffered whole before it is judged (Task 7).
 */
async function readCapped(
  response: Response,
  limit: number,
): Promise<{ kind: "read"; bytes: Uint8Array<ArrayBuffer> } | { kind: "over"; read: number }> {
  const reader = response.body?.getReader();
  if (reader === undefined) return { kind: "read", bytes: new Uint8Array(0) };
  const chunks: Uint8Array[] = [];
  let read = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    if (read > limit) {
      await reader.cancel();
      return { kind: "over", read };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(read);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  return { kind: "read", bytes };
}

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

/**
 * A stored asset answering the request's Range header, as the network would:
 * pdf.js reads a large agenda in ranges once the first response says
 * `Accept-Ranges: bytes`, and a full body at a non-zero offset breaks it. One
 * satisfiable range is a 206 with its slice; one that starts past the end is a
 * 416; no Range header, or one that is not a single byte range, is the whole
 * body as stored (a server may ignore a Range it does not support).
 */
async function answerRange(stored: Response, range: string | null): Promise<Response> {
  const match = range === null ? null : SINGLE_RANGE.exec(range.trim());
  if (match === null) return stored;
  const [, first = "", last = ""] = match;
  if (first === "" && last === "") return stored;
  if (first !== "" && last !== "" && Number(last) < Number(first)) return stored;

  // A blob, sliced: a cached body need not be copied whole for every range request.
  const body = await stored.blob();
  const size = body.size;
  const start = first === "" ? Math.max(0, size - Number(last)) : Number(first);
  const end = first === "" || last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size || (first === "" && Number(last) === 0)) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  const headers = new Headers(stored.headers);
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(body.slice(start, end + 1), { status: 206, headers });
}

export function installWorker(scope: WorkerScope, deps: WorkerDeps): void {
  const origin = scope.location.origin;
  const { store } = deps;

  /** Saves in progress, by URL and render time: ensure-saved skips these (spec 4.4). */
  const saving = new Map<string, number>();
  /** Root-relative files an in-progress save has stored or found but not yet committed. */
  const pinned = new Map<string, number>();

  const absolute = (path: string): string => new URL(path, origin).href;
  const pathOf = (url: string): string => new URL(url, origin).pathname;
  /** The form the static index and a copy's lists use (Task 7): path plus query. */
  const rootRelative = (url: string): string => {
    const parsed = new URL(url, origin);
    return parsed.pathname + parsed.search;
  };
  const savingKey = (url: string, renderedAt: string): string => `${url}\n${renderedAt}`;

  /** Opens a cache once; `forget` makes the next call open it again, as after the cache is deleted. */
  function opener(name: string): (() => Promise<CacheLike>) & { forget: () => void } {
    let opening: Promise<CacheLike> | null = null;
    const open = (): Promise<CacheLike> => {
      opening ??= deps.cacheStorage.open(name).catch((error: unknown) => {
        opening = null;
        throw error;
      });
      return opening;
    };
    return Object.assign(open, {
      forget: () => {
        opening = null;
      },
    });
  }
  const staticCache = opener(STATIC_CACHE);
  const assetCache = opener(ASSET_CACHE);

  /** Settles with the work's value, or with `timeout` once `ms` pass first. */
  function within<T>(work: Promise<T>, ms: number): Promise<Timed<T>> {
    return new Promise((resolve, reject) => {
      const handle = deps.timers.setTimeout(() => resolve({ kind: "timeout" }), ms);
      work.then(
        (value) => {
          deps.timers.clearTimeout(handle);
          resolve({ kind: "done", value });
        },
        (error: unknown) => {
          deps.timers.clearTimeout(handle);
          reject(error);
        },
      );
    });
  }

  /** Fetches and reads the whole body; headers and body share whatever budget the caller races. */
  function startFetch(input: Request | string, init: RequestInit = {}): Attempt {
    const controller = new AbortController();
    const result = deps
      .fetch(input, { ...init, signal: controller.signal })
      .then(readFetched)
      .catch(() => null);
    return { result, abort: () => controller.abort() };
  }

  /** S(U) and C(X) as the store holds them now, from one read. */
  async function readView(url: string): Promise<SavedView> {
    const copies = await store.listCopies();
    return {
      atUrl: copies.find((copy) => copy.url === url) ?? null,
      byShow: new Map(copies.map((copy) => [copy.showId, copy])),
    };
  }

  // --- Serving --------------------------------------------------------------------

  /**
   * The only way a copy reaches a page: with the meta and the CSS notice, and no
   * stored headers. `copy` was read before some wait, during which a purge or a
   * newer save may have landed, so the last await re-reads S(U): the response is
   * built only when the same copy (show and ordinal) is still stored at `url`.
   * Null otherwise, and the caller takes its path's outcome for no copy.
   */
  async function serveCopy(
    url: string,
    copy: StoredCopy,
    mode: ServeMode,
  ): Promise<Response | null> {
    const now = deps.now();
    await markerChecked();
    // The eviction order only: a full or failing store must not stop the serve.
    await store.touchOpened(refOf(copy), now).catch(() => undefined);
    const current = await store.copyAtUrl(url);
    if (
      quarantined() ||
      current === null ||
      current.showId !== copy.showId ||
      current.ordinal !== copy.ordinal
    ) {
      return null;
    }
    const time = formatSavedTime(current.savedAt, now);
    const html = injectSavedCopyHead(current.html, {
      mode,
      savedAt: current.savedAt,
      noticeText: time === null ? "Saved copy" : `Saved copy from ${time}`,
    });
    return new Response(html, { status: 200, headers: HTML_HEADERS });
  }

  /** No Content-Security-Policy: the page's one inline script and style must run (Task 9). */
  function notSavedResponse(): Response {
    return new Response(notSavedPageHtml(), { status: 200, headers: HTML_HEADERS });
  }

  /** Best effort: a page that misses a message reloads or probes on its own schedule. */
  async function broadcast(message: WorkerBroadcast, onlyAtPath?: string): Promise<void> {
    try {
      const pages = await deps.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const page of pages) {
        if (onlyAtPath === undefined || pathOf(page.url) === onlyAtPath) page.postMessage(message);
      }
    } catch {
      // Nothing to recover: the store is already in its final state.
    }
  }

  // --- Purging and cleanup ----------------------------------------------------------

  // A purge whose write fails, by a rejected promise or an aborted or errored
  // transaction (idbStore.ts rejects on both), fails closed (spec 4.6).

  /** The scopes whose purge the store could not write, in memory. */
  const unpurged: PurgeScope[] = [];

  /**
   * G in memory: advanced by every purge the store could not write, so a save
   * begun before one never commits, as the stored G advancing would have ensured.
   */
  let memoryGeneration = 0;

  /**
   * The quarantine marker in Cache Storage, as this worker last read or wrote it.
   * `unknown` until the startup read succeeds, and quarantined meanwhile: a
   * worker restarted after a failed purge must not serve before it has looked.
   */
  let marker: "unknown" | "absent" | "present" = "unknown";
  let markerReading: Promise<void> | null = null;

  /** Set by a failed purge: the recovery escalates at once, without retrying first. */
  let escalateNow = false;

  /** The recovery in progress, so events arriving during it do not start another. */
  let recovering: Promise<void> | null = null;

  /** No saved copy or stored asset is served, and no save commits (spec 4.6). */
  function quarantined(): boolean {
    return unpurged.length > 0 || marker !== "absent";
  }

  /**
   * Settles once the marker has been read. Read at startup, and awaited by
   * activate and by every path that serves, saves or lists, so the first fetch
   * waits for it. A read that fails leaves it unknown, and the next caller reads
   * again.
   */
  function markerChecked(): Promise<void> {
    if (marker !== "unknown") return Promise.resolve();
    markerReading ??= readMarker().finally(() => {
      markerReading = null;
    });
    return markerReading;
  }

  async function readMarker(): Promise<void> {
    try {
      const names = await deps.cacheStorage.keys();
      const present =
        names.includes(QUARANTINE_CACHE) &&
        (await (await deps.cacheStorage.open(QUARANTINE_CACHE)).match(absolute(QUARANTINE_KEY))) !==
          undefined;
      // A failed purge in this life may have written it while this read ran.
      if (marker === "unknown") marker = present ? "present" : "absent";
    } catch {
      // Still unknown, so still quarantined.
    }
  }

  /** Records the quarantine outside the database whose writes failed. */
  async function writeMarker(): Promise<void> {
    try {
      const cache = await deps.cacheStorage.open(QUARANTINE_CACHE);
      await cache.put(absolute(QUARANTINE_KEY), new Response("quarantined"));
      marker = "present";
    } catch {
      // Memory still holds the quarantine; a restart now loses it (spec 9).
    }
  }

  /** The marker goes last, once the purges or the escalation have succeeded. */
  async function deleteMarker(): Promise<boolean> {
    try {
      await deps.cacheStorage.delete(QUARANTINE_CACHE);
      marker = "absent";
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Advances G and removes what the scope names; returns once the store has
   * done so. The files only those copies used go in a sweep queued behind it,
   * which every event handler waits for under waitUntil (`backgroundDone`).
   * Never rejects: a write that fails quarantines the worker, removes nothing,
   * and starts the escalation, which the same event's waitUntil waits for.
   */
  async function purge(scope: PurgeScope): Promise<readonly StoredCopy[]> {
    try {
      const removed = await store.purge(scope);
      void sweep();
      return removed;
    } catch {
      memoryGeneration += 1;
      unpurged.push(scope);
      escalateNow = true;
      void recover();
      return [];
    }
  }

  /** While quarantined, every fetch event and message retries: the backstop to an escalation that failed. */
  function retryWhileQuarantined(event: ExtendableEvent): void {
    if (quarantined()) event.waitUntil(recover());
  }

  /**
   * Ends the quarantine if it can. The marker is written first. After a failed
   * purge the escalation runs at once; otherwise each failed purge is retried in
   * order, and one that fails again escalates. Only then is the marker deleted.
   * A quarantine read from the marker names no scope (an earlier life of the
   * worker failed it), so its retry purges every copy.
   */
  function recover(): Promise<void> {
    recovering ??= (async () => {
      try {
        await markerChecked();
        while (quarantined()) {
          if (unpurged.length === 0) unpurged.push({ by: "all" });
          await writeMarker();
          const escalating = escalateNow;
          escalateNow = false;
          const purged = !escalating && (await retryPurges());
          // Every copy lived in the database the escalation deletes.
          if (!purged && !(await escalate())) return;
          unpurged.length = 0;
          // A purge that failed while this ran goes round again.
          if (!(await deleteMarker())) return;
        }
      } finally {
        recovering = null;
      }
    })();
    return recovering;
  }

  /** Retries each failed purge in order; false at the first that fails again. */
  async function retryPurges(): Promise<boolean> {
    while (unpurged.length > 0) {
      try {
        await store.purge(unpurged[0] as PurgeScope);
      } catch {
        return false;
      }
      unpurged.shift();
      void sweep();
    }
    return true;
  }

  /**
   * Deletes the store's database, then every fxav- cache but the marker's. True
   * once both are gone. The store retires on the version change (idbStore.ts),
   * so from then on nothing is read or written until the browser restarts the
   * worker.
   */
  async function escalate(): Promise<boolean> {
    try {
      await deleteDatabase();
      for (const name of await deps.cacheStorage.keys()) {
        if (name.startsWith(CACHE_PREFIX) && name !== QUARANTINE_CACHE) {
          await deps.cacheStorage.delete(name);
        }
      }
      return true;
    } catch {
      return false;
    } finally {
      // A deleted cache's object keeps working on a cache nothing can reach.
      staticCache.forget();
      assetCache.forget();
    }
  }

  /** Settles on success, rejects on error. A blocked delete stays queued until the blocker closes. */
  function deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = deps.indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(request.error ?? new Error("The saved-copy database was not deleted."));
    });
  }

  /** A save's ticket, taken before its fetch is sent: in quarantine it can never commit. */
  async function beginSave(): Promise<Ticket> {
    await markerChecked();
    const generation = quarantined() ? null : memoryGeneration;
    return { token: await store.beginSave(), memoryGeneration: generation };
  }

  async function announcePurged(removed: readonly StoredCopy[]): Promise<void> {
    for (const showId of new Set(removed.map((copy) => copy.showId))) {
      await broadcast({ type: "purged", showId });
    }
  }

  /** The tail of the sweep queue: sweeps run one at a time, in the order asked for. */
  let sweeping: Promise<void> = Promise.resolve();

  /** Queues a sweep; settles once it has run. Never rejects. */
  function sweep(): Promise<void> {
    sweeping = sweeping.then(sweepOnce);
    return sweeping;
  }

  /** Settles once every sweep queued so far has run. */
  function sweepsDone(): Promise<void> {
    return sweeping;
  }

  /** What an event waits for after its handler: the queued sweeps, and a recovery a failed purge started. */
  function backgroundDone(): Promise<unknown> {
    return Promise.all([sweeping, recovering]);
  }

  /**
   * Removes every stored asset no copy lists, and every static file the 14-day
   * rule releases (spec 4.8). The copies are read once, at the start, so a file
   * an in-progress save holds is protected by its pin, and the pin set is read
   * at the moment of each delete, never from a snapshot: a save can pin a file
   * while this runs. A committing save keeps its pins until every sweep that
   * started before its commit has run (`commitSave`). Best effort: a failed
   * sweep leaves files for the next one.
   */
  async function sweepOnce(): Promise<void> {
    try {
      const copies = await store.listCopies();
      const listedAssets = new Set(copies.flatMap((copy) => copy.assets));
      const assets = await assetCache();
      for (const request of await assets.keys()) {
        const path = rootRelative(request.url);
        if (!listedAssets.has(path) && !pinned.has(path)) await assets.delete(request.url);
      }
      const referencedStatics = copies.flatMap((copy) => copy.statics);
      const expired = staticEvictions(await store.staticIndex(), referencedStatics, deps.now());
      if (expired.length === 0) return;
      const statics = await staticCache();
      const deleted: string[] = [];
      for (const path of expired) {
        if (pinned.has(path)) continue;
        await statics.delete(absolute(path));
        deleted.push(path);
      }
      // A save may have pinned one of these, and stored it again, while the deletes
      // ran; its index row is then the save's, not this sweep's to remove.
      const forgotten = deleted.filter((path) => !pinned.has(path));
      if (forgotten.length > 0) await store.deleteStatics(forgotten);
    } catch {
      // Cleanup only; nothing served depends on it.
    }
  }

  // --- The status route (spec 4.5) --------------------------------------------------

  async function askStatus(copy: StoredCopy): Promise<StatusOutcome> {
    const attempt = startFetch(absolute(savedCopyStatusUrl(copy)), {
      cache: "no-store",
      credentials: "same-origin",
    });
    const answer = await within(attempt.result, STATUS_TIMEOUT_MS);
    if (answer.kind === "timeout") {
      attempt.abort();
      return "no-answer";
    }
    const fetched = answer.value;
    if (fetched === null) return "no-answer";
    if (fetched.kind === "opaque-redirect") return "no-verdict";
    return statusOutcomeOf(fetched.status, fetched.text);
  }

  // --- Saving (spec 4.6 completeness, 4.8 caps and eviction) ---------------------------

  /** A required static file from the cache, or fetched and stored; throws when it cannot be had. */
  async function ensureStatic(path: string): Promise<Response> {
    const url = absolute(path);
    const cache = await staticCache();
    const hit = await cache.match(url);
    if (hit !== undefined) return hit;
    const response = await deps.fetch(url);
    if (response.status !== 200) throw new Error(`required static file unavailable: ${path}`);
    await cache.put(url, response.clone());
    await store.recordStatics([path], deps.now());
    return response;
  }

  /**
   * Every static file the HTML names, plus every font its stylesheets name, one
   * level deep, present in the static cache. Each is recorded at commit time,
   * cache hits included, so the 14-day sweep cannot take one a copy depends on.
   */
  async function storeStatics(html: string, pin: (path: string) => void): Promise<string[]> {
    const required = [...requiredStaticUrls(html, origin)];
    required.forEach(pin);
    const responses = await Promise.all(required.map(ensureStatic));
    const fonts = new Set<string>();
    for (const [index, path] of required.entries()) {
      const response = responses[index];
      if (response === undefined || !pathOf(path).endsWith(".css")) continue;
      for (const font of fontUrlsFromCss(await response.text(), origin)) {
        if (!required.includes(font)) fonts.add(font);
      }
    }
    fonts.forEach(pin);
    await Promise.all([...fonts].map(ensureStatic));
    const all = [...required, ...fonts];
    await store.recordStatics(all, deps.now());
    return all;
  }

  /**
   * One listed asset from the network, judged against the caps with `total`
   * already admitted: its bytes and headers, or `skip` it, or `stop` the show's
   * prefetch. Headers and body share ASSET_FETCH_BUDGET_MS; past it the fetch
   * is aborted and the asset skipped. Any failure (a network error, a status
   * other than 200, a body that fails mid-stream) skips it too.
   */
  async function fetchAsset(url: string, total: number): Promise<FetchedAsset> {
    const controller = new AbortController();
    const work = (async (): Promise<FetchedAsset> => {
      const response = await deps.fetch(url, { signal: controller.signal });
      if (response.status !== 200) {
        await response.body?.cancel();
        return SKIP;
      }
      const declared = admitAsset(total, declaredLength(response));
      if (declared !== "admit") {
        await response.body?.cancel();
        return declared === "stop" ? STOP : SKIP;
      }
      const body = await readCapped(
        response,
        Math.min(ASSET_MAX_BYTES, SHOW_PREFETCH_MAX_BYTES - total),
      );
      const size = body.kind === "read" ? body.bytes.byteLength : body.read;
      const verdict = admitAsset(total, size);
      if (verdict === "stop") return STOP;
      if (verdict === "skip" || body.kind === "over") return SKIP;
      return { kind: "read", bytes: body.bytes, headers: response.headers };
    })().catch(() => SKIP);
    const outcome = await within(work, ASSET_FETCH_BUDGET_MS);
    if (outcome.kind === "done") return outcome.value;
    controller.abort();
    return SKIP;
  }

  /**
   * Every listed asset within the caps, present in the asset cache, in list
   * order: one over 25 MB is skipped, and the show's prefetch stops before its
   * total would pass 75 MB. An asset that cannot be fetched (a network error, a
   * status other than 200, a body that fails mid-stream, no whole response
   * within ASSET_FETCH_BUDGET_MS) is skipped the same way: it fails offline the
   * way it does today (spec 4.8, controller ruling on Task 10). Only static
   * files are mandatory for a commit. Returns the assets stored, which are the
   * ones the copy lists.
   */
  async function storeAssets(
    paths: readonly string[],
    pin: (path: string) => void,
  ): Promise<string[]> {
    const cache = await assetCache();
    const stored: string[] = [];
    let total = 0;
    for (const path of new Set(paths)) {
      const url = absolute(path);
      pin(path);
      const held = await cache.match(url);
      if (held !== undefined) {
        const size = declaredLength(held) ?? (await held.arrayBuffer()).byteLength;
        const verdict = admitAsset(total, size);
        if (verdict === "stop") break;
        if (verdict === "admit") {
          total += size;
          stored.push(path);
        }
        continue;
      }

      const fetched = await fetchAsset(url, total);
      if (fetched.kind === "stop") break;
      if (fetched.kind === "skip") continue;
      const size = fetched.bytes.byteLength;
      const headers = withoutTransportHeaders(fetched.headers);
      headers.set("content-length", String(size));
      await cache.put(url, new Response(fetched.bytes, { status: 200, headers }));
      total += size;
      stored.push(path);
    }
    return stored;
  }

  async function evictBeyondCap(incomingShowId: string): Promise<void> {
    for (const victim of evictionVictims(await store.listCopies(), incomingShowId)) {
      await store.evict(refOf(victim));
    }
  }

  /**
   * Stores every file the copy needs, then commits it if its token is still
   * current, then evicts past ten shows (never the incoming one). A quota error
   * anywhere abandons the save and tells every open page (spec 4.7.2). True when
   * committed.
   */
  async function commitSave(
    url: string,
    ticket: Ticket,
    html: string,
    marker: SaveMarker,
  ): Promise<boolean> {
    const key = savingKey(url, marker.renderedAt);
    const held: string[] = [];
    const pin = (path: string) => {
      held.push(path);
      hold(pinned, path);
    };
    hold(saving, key);
    try {
      const statics = await storeStatics(html, pin);
      const assets = await storeAssets(marker.assets, pin);
      // G in memory: every purge the store could not write since this save began
      // advanced it, and a save begun in quarantine holds none, so this one check
      // refuses every commit while the worker is quarantined.
      if (ticket.memoryGeneration !== memoryGeneration) return false;
      const { token } = ticket;
      const outcome = await store.commitIfCurrent(token, {
        showId: marker.showId,
        url,
        html,
        viewer: marker.viewer,
        epoch: marker.epoch,
        savedAt: marker.renderedAt,
        ordinal: token.ordinal,
        assets,
        statics,
        endedAt: null,
        lastOpenedAt: deps.now(),
      });
      if (outcome !== "committed") return false;
      await evictBeyondCap(marker.showId);
      return true;
    } catch (error) {
      if (isQuotaError(error)) await broadcast({ type: "save-failed", url, reason: "quota" });
      return false;
    } finally {
      release(saving, key);
      // A sweep that started before the commit read the copies without this one,
      // so the pins stay until every sweep queued so far has run.
      await sweepsDone();
      for (const path of held) release(pinned, path);
      await sweep();
    }
  }

  // --- Navigation (spec 4.4) ----------------------------------------------------------

  /** Step 3 with serving: the marker decides what the page gets and what happens to the copy. */
  async function decideServed(url: string, ticket: Ticket, fetched: Fetched): Promise<Handled> {
    const view = await readView(url);
    const step = decideStep3(url, completeOf(fetched), view);
    switch (step.serve) {
      case "saved": {
        const saved = view.atUrl === null ? null : await serveCopy(url, view.atUrl, step.mode);
        return served(saved ?? networkResponse(fetched));
      }
      case "ask-status": {
        const copy = view.atUrl;
        if (copy === null) return served(networkResponse(fetched));
        const check = decideCheckOutcome(await askStatus(copy), copy);
        if (check.serve === "saved") {
          const ended = await markedEnded(url, copy);
          const saved = ended === null ? null : await serveCopy(url, ended, check.mode);
          return served(saved ?? networkResponse(fetched));
        }
        if (check.then === "purge") await purge(check.scope);
        return served(networkResponse(fetched));
      }
      case "network": {
        if (step.then === "purge") await purge(step.scope);
        const marker = step.then === "commit" ? saveMarkerOf(fetched) : null;
        if (marker === null || fetched.kind !== "body") return served(networkResponse(fetched));
        return {
          response: networkResponse(fetched),
          background: commitSave(url, ticket, fetched.text, marker),
        };
      }
    }
  }

  /**
   * Marks S(U), `copy`, ended and returns the copy to serve in ended mode, or null
   * when the copy read before the status check is no longer S(U): a purge or a
   * newer save landed in between, and that snapshot must not be served.
   */
  async function markedEnded(url: string, copy: StoredCopy): Promise<StoredCopy | null> {
    if (await store.markEnded(refOf(copy), deps.now())) return copy;
    const current = await store.copyAtUrl(url);
    // Unchanged but already ended: another check marked it first.
    return current !== null && current.ordinal === copy.ordinal && current.endedAt !== null
      ? current
      : null;
  }

  /** Step 3 without serving (a probe, an ensure-saved, a step 5 continuation). */
  async function decideSilently(
    url: string,
    ticket: Ticket,
    fetched: Fetched,
    announce: boolean,
  ): Promise<SilentResult> {
    const view = await readView(url);
    const step = decideStep3(url, completeOf(fetched), view);
    switch (step.serve) {
      case "saved":
        return "unchanged";
      case "ask-status":
        return view.atUrl === null ? "unchanged" : checkCopy(view.atUrl, announce);
      case "network": {
        if (step.then === "purge") {
          const removed = await purge(step.scope);
          if (announce) await announcePurged(removed);
          return "purged";
        }
        if (step.then === "none") return "unchanged";
        const marker = saveMarkerOf(fetched);
        if (marker === null || fetched.kind !== "body") return "commit-failed";
        const committed = await commitSave(url, ticket, fetched.text, marker);
        if (committed && announce) await broadcast({ type: "fresh-ready", url }, url);
        return committed ? "committed" : "commit-failed";
      }
    }
  }

  /**
   * The `check` row for S(U), or the marker's check message. A copy the status
   * route finds ended replies ended every time, whether this call marked it or an
   * earlier one did (a second tab, a later probe, a slow fallback's continuation);
   * nothing is broadcast for it. A copy replaced or purged during the check is
   * left as it is.
   */
  async function checkCopy(copy: StoredCopy, announce: boolean): Promise<SilentResult> {
    const check = decideCheckOutcome(await askStatus(copy), copy);
    if (check.serve === "saved") {
      return (await markedEnded(copy.url, copy)) === null ? "unchanged" : "marked-ended";
    }
    if (check.then === "none") return "unchanged";
    const removed = await purge(check.scope);
    if (announce) await announcePurged(removed);
    return "purged";
  }

  /** Step 4: a network error before a complete response. */
  async function noResponse(url: string): Promise<Handled> {
    const view = await readView(url);
    const decision = decideNoResponse("network-error", view);
    const saved =
      decision.serve === "saved" && view.atUrl !== null
        ? await serveCopy(url, view.atUrl, decision.mode)
        : null;
    return served(saved ?? notSavedResponse());
  }

  /** Step 5's continuation: the step 3 table without serving, abandoned after `ms`. */
  async function continueInBackground(
    attempt: Attempt,
    url: string,
    ticket: Ticket,
    ms: number,
  ): Promise<void> {
    const outcome = await within(attempt.result, ms);
    if (outcome.kind === "timeout") {
      attempt.abort();
      return;
    }
    if (outcome.value !== null) await decideSilently(url, ticket, outcome.value, true);
  }

  /** Steps 2 to 5. */
  async function fetchAndDecide(request: Request, url: string): Promise<Handled> {
    const ticket = await beginSave();
    const attempt = startFetch(request);
    const first = await within(attempt.result, NAV_BUDGET_MS);
    if (first.kind === "done") {
      return first.value === null ? noResponse(url) : decideServed(url, ticket, first.value);
    }
    const view = await readView(url);
    const decision = decideNoResponse("timeout", view);
    if (decision.serve === "saved" && decision.mode === "slow" && view.atUrl !== null) {
      const saved = await serveCopy(url, view.atUrl, decision.mode);
      if (saved !== null) {
        return {
          response: saved,
          background: continueInBackground(attempt, url, ticket, decision.continueForMs),
        };
      }
    }
    // No S(U), or it left the store just now: nothing better to show, so the
    // worker sets no timeout of its own.
    const fetched = await attempt.result;
    return fetched === null ? noResponse(url) : decideServed(url, ticket, fetched);
  }

  /**
   * Step 1's no-verdict branch: the page under the step 2 budget, S(U) kept. A
   * complete response is served as it came, its marker unread; no response at
   * all serves S(U) ended. When S(U) left the store during the fetch there is no
   * copy to fall back to: a network error gets the not-saved page, and a page
   * still pending is waited for, as steps 2 to 5 do with no S(U).
   */
  async function fetchKeepingEnded(
    request: Request,
    url: string,
    copy: StoredCopy,
  ): Promise<Response> {
    const attempt = startFetch(request);
    const outcome = await within(attempt.result, NAV_BUDGET_MS);
    const fetched = outcome.kind === "done" ? outcome.value : null;
    const result: FetchResult =
      fetched !== null
        ? { kind: "complete", response: completeOf(fetched) }
        : { kind: "no-response", reason: outcome.kind === "timeout" ? "timeout" : "network-error" };
    const decision = decideEndedFetch(result);
    if (decision.serve === "network" && fetched !== null) return networkResponse(fetched);
    const saved = await serveCopy(url, copy, "ended");
    if (saved !== null) {
      if (outcome.kind === "timeout") attempt.abort();
      return saved;
    }
    if (outcome.kind === "done") return notSavedResponse();
    const late = await attempt.result;
    return late !== null ? networkResponse(late) : notSavedResponse();
  }

  async function navigate(request: Request): Promise<Handled> {
    // U is the path; the fetch keeps the query (spec 4.4).
    const url = pathOf(request.url);
    const held = await store.copyAtUrl(url);
    if (held !== null && held.endedAt !== null) {
      const step1 = decideEndedStep1(await askStatus(held), held);
      switch (step1.next) {
        case "serve-saved": {
          const saved = await serveCopy(url, held, step1.mode);
          if (saved !== null) return served(saved);
          // S(U) left the store during the status check: steps 2 to 5, as with no copy.
          break;
        }
        case "fetch-keep":
          return served(await fetchKeepingEnded(request, url, held));
        case "step-2":
          // The purge, then steps 2 to 5, which read the store afresh.
          await purge(step1.purge);
          break;
      }
    }
    return fetchAndDecide(request, url);
  }

  // --- Identity brackets (spec 4.2, 4.6) ---------------------------------------------

  /**
   * The request passes through with its own redirect mode, every copy purged
   * before it is sent and again once its response arrives. A purge never
   * rejects (a failed one quarantines the worker), so signing out keeps working.
   */
  async function passThroughBracketed(request: Request): Promise<Response> {
    await purge({ by: "all" });
    try {
      return await deps.fetch(request);
    } finally {
      await purge({ by: "all" });
    }
  }

  // --- Static files and assets (spec 4.2, 4.8) ----------------------------------------

  /** Cache first; a cache that cannot be opened or read is a miss, so the network answers. */
  async function serveStatic(request: Request): Promise<Handled> {
    const cache = await staticCache().catch(() => null);
    const hit = cache === null ? undefined : await cache.match(request.url).catch(() => undefined);
    if (hit !== undefined) return served(hit);
    const response = await deps.fetch(request);
    if (cache === null || response.status !== 200 || response.type === "opaque") {
      return served(response);
    }
    const copy = response.clone();
    const background = (async () => {
      await cache.put(request.url, copy);
      await store.recordStatics([rootRelative(request.url)], deps.now());
    })();
    return { response, background };
  }

  /**
   * Whether a saved copy lists the asset at `path`. False in quarantine, and when
   * the store cannot be read, so the network answers.
   */
  async function isListed(path: string): Promise<boolean> {
    try {
      await markerChecked();
      const copies = await store.listCopies();
      return copies.some((copy) => copy.assets.includes(path)) && !quarantined();
    } catch {
      return false;
    }
  }

  /**
   * The stored asset, answering the request's Range, only when a saved copy lists
   * it. The listing is read again as the last await, so an asset whose copy was
   * purged while the cache was read is not served. A cache that fails reads as
   * no stored asset, so the network answers.
   */
  async function listedAsset(request: Request): Promise<Response | undefined> {
    try {
      const path = rootRelative(request.url);
      if (!(await isListed(path))) return undefined;
      const stored = await (await assetCache()).match(absolute(path));
      if (stored === undefined) return undefined;
      const answer = await answerRange(stored, request.headers.get("range"));
      return (await isListed(path)) ? answer : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Whether a saved copy lists the asset is decided first (Codex R2 A2). One
   * that no copy lists passes through untouched, streaming exactly as it would
   * without the worker: its answer, its error, or its wait.
   *
   * A listed one is network first. A 2xx whose body arrives whole within 5 s is
   * served, as the bytes read with the network's status and headers. Otherwise
   * (a non-2xx answer, a network error, a body that fails mid-stream, 5 s
   * without the whole response) the stored asset is served while a saved copy
   * still lists it, and the network's fetch is aborted: after an archive the
   * asset routes refuse an ended copy's assets, which are still the right ones
   * to show (controller ruling, Task 10). The page's own abort still reaches the
   * fetch.
   */
  async function serveAsset(request: Request): Promise<Response> {
    if (!(await isListed(rootRelative(request.url)))) return deps.fetch(request);
    const controller = new AbortController();
    if (request.signal.aborted) controller.abort();
    else request.signal.addEventListener("abort", () => controller.abort(), { once: true });
    const network = deps
      .fetch(request, { signal: controller.signal })
      .then((response) => (response.ok ? readWhole(response) : response))
      .catch(() => null);
    const first = await within(network, ASSET_TIMEOUT_MS);
    const answered = first.kind === "done" ? first.value : null;
    if (answered !== null && answered.ok) return answered;
    const stored = await listedAsset(request);
    if (stored !== undefined) {
      controller.abort();
      void answered?.body?.cancel().catch(() => undefined);
      return stored;
    }
    if (answered !== null) return answered;
    const late = first.kind === "done" ? null : await network;
    if (late === null) throw new TypeError(`asset unavailable: ${request.url}`);
    return late;
  }

  // --- Messages (spec 4.3, 4.4, 4.6, 4.7.3) --------------------------------------------

  /** Steps 2 and 3 for U without serving, under the step 2 budget. */
  async function runSilently(url: string): Promise<SilentResult> {
    const ticket = await beginSave();
    const attempt = startFetch(absolute(url), { redirect: "manual", credentials: "same-origin" });
    const outcome = await within(attempt.result, NAV_BUDGET_MS);
    if (outcome.kind === "timeout") {
      attempt.abort();
      return "no-response";
    }
    return outcome.value === null
      ? "no-response"
      : decideSilently(url, ticket, outcome.value, false);
  }

  async function ensureSaved(rawUrl: string, renderedAt: string): Promise<SilentResult> {
    const url = crewPath(pathOf(rawUrl));
    if (url === null) return "skipped";
    const key = savingKey(url, renderedAt);
    if (saving.has(key)) return "skipped";
    hold(saving, key);
    try {
      const held = await store.copyAtUrl(url);
      if (held !== null && held.savedAt === renderedAt) return "skipped";
      return await runSilently(url);
    } finally {
      release(saving, key);
    }
  }

  async function probe(rawUrl: string): Promise<SilentResult> {
    const url = crewPath(pathOf(rawUrl));
    return url === null ? "skipped" : runSilently(url);
  }

  async function checkAt(rawUrl: string): Promise<SilentResult> {
    const copy = await store.copyAtUrl(pathOf(rawUrl));
    return copy === null ? "skipped" : checkCopy(copy, false);
  }

  async function answer(message: PageMessage | null): Promise<WorkerReply> {
    if (message === null) return { outcome: "failed" };
    switch (message.type) {
      case "purge-show":
        await purge({ by: "show", showId: message.showId });
        return ACK;
      case "marker":
        if (message.disposition === "check")
          return { outcome: OUTCOME_OF[await checkAt(message.url)] };
        await purge(
          message.showId !== null
            ? { by: "show", showId: message.showId }
            : { by: "url", url: pathOf(message.url) },
        );
        return ACK;
      case "probe":
        return { outcome: OUTCOME_OF[await probe(message.url)] };
      case "ensure-saved":
        return { outcome: OUTCOME_OF[await ensureSaved(message.url, message.renderedAt)] };
    }
  }

  // --- Listeners ------------------------------------------------------------------------

  /** Serves the response, and keeps the worker alive for the background work and queued sweeps. */
  function answerWith(event: FetchEvent, handled: Promise<Handled>): void {
    event.respondWith(handled.then((result) => result.response));
    event.waitUntil(
      handled
        .then((result) => result.background)
        .catch(() => undefined)
        .then(backgroundDone),
    );
  }

  /** A fault inside the worker: the network as it is, or the not-saved page when it fails too. */
  async function afterFault(request: Request): Promise<Handled> {
    try {
      return served(await deps.fetch(request));
    } catch {
      return served(notSavedResponse());
    }
  }

  // At startup: a worker the browser restarted after a failed purge is quarantined
  // from its first event (spec 4.6).
  void markerChecked();

  scope.addEventListener("install", (event) => {
    event.waitUntil(scope.skipWaiting());
  });

  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        try {
          await markerChecked();
          const current = new Set([STATIC_CACHE, ASSET_CACHE, QUARANTINE_CACHE]);
          for (const name of await deps.cacheStorage.keys()) {
            if (name.startsWith(CACHE_PREFIX) && !current.has(name))
              await deps.cacheStorage.delete(name);
          }
          await sweep();
        } finally {
          await deps.clients.claim();
        }
      })(),
    );
  });

  scope.addEventListener("fetch", (event) => {
    // First, so a retried purge reaches the store before this request's own reads.
    retryWhileQuarantined(event);
    const { request } = event;
    const kind = classifyRequest(
      {
        method: request.method,
        mode: request.mode,
        url: request.url,
        rscHeader: request.headers.get("RSC"),
      },
      origin,
    );
    switch (kind) {
      case "ignore":
        return;
      case "crew-nav":
        answerWith(
          event,
          navigate(request).catch(() => afterFault(request)),
        );
        return;
      case "bracket-nav":
        answerWith(event, passThroughBracketed(request).then(served));
        return;
      case "static":
        answerWith(event, serveStatic(request));
        return;
      case "asset":
        event.respondWith(serveAsset(request));
        return;
    }
  });

  scope.addEventListener("message", (event: ExtendableMessageEvent) => {
    retryWhileQuarantined(event);
    const port = event.ports[0];
    event.waitUntil(
      answer(parsePageMessage(event.data))
        .catch((): WorkerReply => ({ outcome: "failed" }))
        .then((reply) => port?.postMessage(reply))
        // A purge replies once the store has removed the copy; its sweep, or the
        // escalation of a purge that failed, runs after.
        .then(backgroundDone),
    );
  });
}
