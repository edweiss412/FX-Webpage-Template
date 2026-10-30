/**
 * The service worker's handlers (spec 4.2, 4.4, 4.6, 4.8, 4.9), with every
 * dependency injected so Vitest drives the same code the worker bundle runs.
 *
 * This is glue. What to serve, what to purge and what to evict is decided by
 * the pure tables (navigation.ts, store.ts, caps.ts, completeness.ts); this
 * file fetches, times, stores and asks them. Three rules hold everywhere:
 *
 * - A copy is only ever served through `serveCopy`, which injects the notice,
 *   and only at the URL it was saved under (S(U)) on a table's say-so.
 * - Every save takes its generation and ordinal (`beginSave`) before its fetch
 *   is sent, so a purge that lands while the fetch is in flight voids it.
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
import { readMarker, type MarkerRead, type SaveMarker } from "@/lib/offline/marker";
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
import { ASSET_CACHE, CACHE_PREFIX, STATIC_CACHE } from "@/lib/offline/storeSchema";
import type {
  CacheLike,
  CacheStorageLike,
  Clients,
  ExtendableMessageEvent,
  FetchEvent,
  Timers,
  WorkerScope,
} from "@/lib/offline/worker/swTypes";

export type WorkerDeps = {
  store: SavedCopyStore;
  /** Static and asset caches are opened from here when first needed (ruling D3). */
  cacheStorage: CacheStorageLike;
  fetch: (input: Request | string, init?: RequestInit) => Promise<Response>;
  /** Epoch milliseconds. */
  now: () => number;
  clients: Clients;
  timers: Timers;
};

/** An asset request waits this long for the network before a stored copy may answer (spec 4.8). */
const ASSET_TIMEOUT_MS = 5_000;

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

/** What a fetch handler serves, and the work that continues after it (kept alive by waitUntil). */
type Handled = { response: Response; background: Promise<unknown> };

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
    marker: readMarker(text),
  };
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

  const bytes = new Uint8Array(await stored.arrayBuffer());
  const size = bytes.byteLength;
  const start = first === "" ? Math.max(0, size - Number(last)) : Number(first);
  const end = first === "" || last === "" ? size - 1 : Math.min(Number(last), size - 1);
  if (start >= size || (first === "" && Number(last) === 0)) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  }
  const headers = new Headers(stored.headers);
  headers.set("content-range", `bytes ${start}-${end}/${size}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
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

  function opener(name: string): () => Promise<CacheLike> {
    let opening: Promise<CacheLike> | null = null;
    return () => {
      opening ??= deps.cacheStorage.open(name).catch((error: unknown) => {
        opening = null;
        throw error;
      });
      return opening;
    };
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

  /** The only way a copy reaches a page: with the meta and the CSS notice, and no stored headers. */
  async function serveCopy(copy: StoredCopy, mode: ServeMode): Promise<Response> {
    const now = deps.now();
    // The eviction order only: a full or failing store must not stop the serve.
    await store.touchOpened(refOf(copy), now).catch(() => undefined);
    const time = formatSavedTime(copy.savedAt, now);
    const html = injectSavedCopyHead(copy.html, {
      mode,
      savedAt: copy.savedAt,
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

  /**
   * Advances G and removes what the scope names; returns once the store has
   * done so. The files only those copies used go in a sweep queued behind it,
   * which every event handler waits for under waitUntil (`sweepsDone`).
   */
  async function purge(scope: PurgeScope): Promise<readonly StoredCopy[]> {
    const removed = await store.purge(scope);
    void sweep();
    return removed;
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
   * Every listed asset within the caps, present in the asset cache, in list
   * order: one over 25 MB is skipped, and the show's prefetch stops before its
   * total would pass 75 MB. An asset that cannot be fetched (a network error, a
   * status other than 200, a body that fails mid-stream) is skipped the same way:
   * it fails offline the way it does today (spec 4.8, controller ruling on Task
   * 10). Only static files are mandatory for a commit. Returns the assets
   * stored, which are the ones the copy lists.
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

      const response = await deps.fetch(url).catch(() => null);
      if (response === null) continue;
      if (response.status !== 200) {
        await response.body?.cancel();
        continue;
      }
      const declared = admitAsset(total, declaredLength(response));
      if (declared !== "admit") {
        await response.body?.cancel();
        if (declared === "stop") break;
        continue;
      }
      const body = await readCapped(
        response,
        Math.min(ASSET_MAX_BYTES, SHOW_PREFETCH_MAX_BYTES - total),
      ).catch(() => null);
      if (body === null) continue;
      const size = body.kind === "read" ? body.bytes.byteLength : body.read;
      const verdict = admitAsset(total, size);
      if (verdict === "stop") break;
      if (verdict === "skip" || body.kind === "over") continue;

      const headers = withoutTransportHeaders(response.headers);
      headers.set("content-length", String(size));
      await cache.put(url, new Response(body.bytes, { status: 200, headers }));
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
    token: SaveToken,
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
  async function decideServed(url: string, token: SaveToken, fetched: Fetched): Promise<Handled> {
    const view = await readView(url);
    const step = decideStep3(url, completeOf(fetched), view);
    switch (step.serve) {
      case "saved":
        return served(
          view.atUrl !== null ? await serveCopy(view.atUrl, step.mode) : networkResponse(fetched),
        );
      case "ask-status": {
        const copy = view.atUrl;
        if (copy === null) return served(networkResponse(fetched));
        const check = decideCheckOutcome(await askStatus(copy), copy);
        if (check.serve === "saved") {
          const ended = await markedEnded(url, copy);
          return served(
            ended !== null ? await serveCopy(ended, check.mode) : networkResponse(fetched),
          );
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
          background: commitSave(url, token, fetched.text, marker),
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
    token: SaveToken,
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
        const committed = await commitSave(url, token, fetched.text, marker);
        if (committed && announce) await broadcast({ type: "fresh-ready", url }, url);
        return committed ? "committed" : "commit-failed";
      }
    }
  }

  /** The `check` row for S(U), or the marker's check message. */
  async function checkCopy(copy: StoredCopy, announce: boolean): Promise<SilentResult> {
    const check = decideCheckOutcome(await askStatus(copy), copy);
    if (check.serve === "saved") {
      return (await store.markEnded(refOf(copy), deps.now())) ? "marked-ended" : "unchanged";
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
    if (decision.serve === "saved" && view.atUrl !== null) {
      return served(await serveCopy(view.atUrl, decision.mode));
    }
    return served(notSavedResponse());
  }

  /** Step 5's continuation: the step 3 table without serving, abandoned after `ms`. */
  async function continueInBackground(
    attempt: Attempt,
    url: string,
    token: SaveToken,
    ms: number,
  ): Promise<void> {
    const outcome = await within(attempt.result, ms);
    if (outcome.kind === "timeout") {
      attempt.abort();
      return;
    }
    if (outcome.value !== null) await decideSilently(url, token, outcome.value, true);
  }

  /** Steps 2 to 5. */
  async function fetchAndDecide(request: Request, url: string): Promise<Handled> {
    const token = await store.beginSave();
    const attempt = startFetch(request);
    const first = await within(attempt.result, NAV_BUDGET_MS);
    if (first.kind === "done") {
      return first.value === null ? noResponse(url) : decideServed(url, token, first.value);
    }
    const view = await readView(url);
    const decision = decideNoResponse("timeout", view);
    if (decision.serve === "saved" && decision.mode === "slow" && view.atUrl !== null) {
      return {
        response: await serveCopy(view.atUrl, decision.mode),
        background: continueInBackground(attempt, url, token, decision.continueForMs),
      };
    }
    // No S(U): nothing better to show, so the worker sets no timeout of its own.
    const fetched = await attempt.result;
    return fetched === null ? noResponse(url) : decideServed(url, token, fetched);
  }

  /**
   * Step 1's no-verdict branch: the page under the step 2 budget, S(U) kept. A
   * complete response is served as it came, its marker unread; no response at
   * all serves S(U) ended.
   */
  async function fetchKeepingEnded(request: Request, copy: StoredCopy): Promise<Response> {
    const attempt = startFetch(request);
    const outcome = await within(attempt.result, NAV_BUDGET_MS);
    if (outcome.kind === "timeout") attempt.abort();
    const fetched = outcome.kind === "done" ? outcome.value : null;
    const result: FetchResult =
      fetched !== null
        ? { kind: "complete", response: completeOf(fetched) }
        : { kind: "no-response", reason: outcome.kind === "timeout" ? "timeout" : "network-error" };
    const decision = decideEndedFetch(result);
    if (decision.serve === "network" && fetched !== null) return networkResponse(fetched);
    return serveCopy(copy, "ended");
  }

  async function navigate(request: Request): Promise<Handled> {
    // U is the path; the fetch keeps the query (spec 4.4).
    const url = pathOf(request.url);
    const held = await store.copyAtUrl(url);
    if (held !== null && held.endedAt !== null) {
      const step1 = decideEndedStep1(await askStatus(held), held);
      if (step1.next === "serve-saved") return served(await serveCopy(held, step1.mode));
      if (step1.next === "fetch-keep") return served(await fetchKeepingEnded(request, held));
      // "step-2": the purge, then steps 2 to 5, which read the store afresh.
      await purge(step1.purge);
    }
    return fetchAndDecide(request, url);
  }

  // --- Identity brackets (spec 4.2, 4.6) ---------------------------------------------

  /**
   * The request passes through with its own redirect mode, every copy purged
   * before it is sent and again once its response arrives. A purge that fails
   * does not stop the request: signing out must keep working.
   */
  async function passThroughBracketed(request: Request): Promise<Response> {
    await purge({ by: "all" }).catch(() => undefined);
    try {
      return await deps.fetch(request);
    } finally {
      await purge({ by: "all" }).catch(() => undefined);
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
   * The stored asset, answering the request's Range, only when a saved copy lists
   * it. A store or cache that fails reads as unlisted, so the network answers.
   */
  async function listedAsset(request: Request): Promise<Response | undefined> {
    try {
      const path = rootRelative(request.url);
      const copies = await store.listCopies();
      if (!copies.some((copy) => copy.assets.includes(path))) return undefined;
      const stored = await (await assetCache()).match(absolute(path));
      return stored === undefined
        ? undefined
        : await answerRange(stored, request.headers.get("range"));
    } catch {
      return undefined;
    }
  }

  /**
   * Network first. A 2xx within 5 s is served. Otherwise (a non-2xx answer, a
   * network error, 5 s with no answer) the stored asset is served when a saved
   * copy lists it: after an archive the asset routes refuse an ended copy's
   * assets, which are still the right ones to show (controller ruling, Task 10).
   * An unlisted asset gets the network's own answer, or its error, or a longer wait.
   */
  async function serveAsset(request: Request): Promise<Response> {
    const network = deps.fetch(request);
    const first = await within(
      network.catch(() => null),
      ASSET_TIMEOUT_MS,
    );
    const answered = first.kind === "done" ? first.value : null;
    if (answered !== null && answered.ok) return answered;
    const stored = await listedAsset(request);
    if (stored !== undefined) {
      void answered?.body?.cancel().catch(() => undefined);
      return stored;
    }
    return answered ?? network;
  }

  // --- Messages (spec 4.3, 4.4, 4.6, 4.7.3) --------------------------------------------

  /** Steps 2 and 3 for U without serving, under the step 2 budget. */
  async function runSilently(url: string): Promise<SilentResult> {
    const token = await store.beginSave();
    const attempt = startFetch(absolute(url), { redirect: "manual", credentials: "same-origin" });
    const outcome = await within(attempt.result, NAV_BUDGET_MS);
    if (outcome.kind === "timeout") {
      attempt.abort();
      return "no-response";
    }
    return outcome.value === null
      ? "no-response"
      : decideSilently(url, token, outcome.value, false);
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
        .then(sweepsDone),
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

  scope.addEventListener("install", (event) => {
    event.waitUntil(scope.skipWaiting());
  });

  scope.addEventListener("activate", (event) => {
    event.waitUntil(
      (async () => {
        try {
          const current = new Set([STATIC_CACHE, ASSET_CACHE]);
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
    const port = event.ports[0];
    event.waitUntil(
      answer(parsePageMessage(event.data))
        .catch((): WorkerReply => ({ outcome: "failed" }))
        .then((reply) => port?.postMessage(reply))
        // A purge replies once the store has removed the copy; its sweep runs after.
        .then(sweepsDone),
    );
  });
}
