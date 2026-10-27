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
 * - Anything that fails inside the handlers falls back to the network, never
 *   to a copy.
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
    await store.touchOpened(refOf(copy), now);
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

  async function broadcast(message: WorkerBroadcast, onlyAtPath?: string): Promise<void> {
    const pages = await deps.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const page of pages) {
      if (onlyAtPath === undefined || pathOf(page.url) === onlyAtPath) page.postMessage(message);
    }
  }

  // --- Purging and cleanup ----------------------------------------------------------

  /** Advances G, removes what the scope names, and drops the files only those copies used. */
  async function purge(scope: PurgeScope): Promise<readonly StoredCopy[]> {
    const removed = await store.purge(scope);
    await sweep();
    return removed;
  }

  async function announcePurged(removed: readonly StoredCopy[]): Promise<void> {
    for (const showId of new Set(removed.map((copy) => copy.showId))) {
      await broadcast({ type: "purged", showId });
    }
  }

  /**
   * Removes every stored asset no copy lists, and every static file the 14-day
   * rule releases (spec 4.8). Files an in-progress save depends on are treated
   * as referenced. Best effort: a failed sweep leaves files for the next one.
   */
  async function sweep(): Promise<void> {
    try {
      const copies = await store.listCopies();
      const assetRefs = new Set([...copies.flatMap((copy) => copy.assets), ...pinned.keys()]);
      const assets = await assetCache();
      for (const request of await assets.keys()) {
        if (!assetRefs.has(rootRelative(request.url))) await assets.delete(request.url);
      }
      const staticRefs = new Set([...copies.flatMap((copy) => copy.statics), ...pinned.keys()]);
      const expired = staticEvictions(await store.staticIndex(), staticRefs, deps.now());
      if (expired.length > 0) {
        const statics = await staticCache();
        for (const path of expired) await statics.delete(absolute(path));
        await store.deleteStatics(expired);
      }
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
   * total would pass 75 MB. An asset within the caps that cannot be fetched
   * throws, because the save then cannot commit (spec 4.6). Returns the assets
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

      const response = await deps.fetch(url);
      if (response.status !== 200) throw new Error(`asset unavailable: ${path}`);
      const declared = admitAsset(total, declaredLength(response));
      if (declared !== "admit") {
        await response.body?.cancel();
        if (declared === "stop") break;
        continue;
      }
      const body = await readCapped(
        response,
        Math.min(ASSET_MAX_BYTES, SHOW_PREFETCH_MAX_BYTES - total),
      );
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
   * anywhere abandons the save and tells the pages of U. True when committed.
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
      if (isQuotaError(error)) await broadcast({ type: "save-failed", url, reason: "quota" }, url);
      return false;
    } finally {
      for (const path of held) release(pinned, path);
      release(saving, key);
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
          await store.markEnded(refOf(copy), deps.now());
          return served(await serveCopy(copy, check.mode));
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

  async function serveStatic(request: Request): Promise<Handled> {
    const cache = await staticCache();
    const hit = await cache.match(request.url);
    if (hit !== undefined) return served(hit);
    const response = await deps.fetch(request);
    if (response.status !== 200 || response.type === "opaque") return served(response);
    const copy = response.clone();
    const background = (async () => {
      await cache.put(request.url, copy);
      await store.recordStatics([rootRelative(request.url)], deps.now());
    })();
    return { response, background };
  }

  /** A stored asset, only when a saved copy lists it. */
  async function listedAsset(url: string): Promise<Response | undefined> {
    const path = rootRelative(url);
    const copies = await store.listCopies();
    if (!copies.some((copy) => copy.assets.includes(path))) return undefined;
    return (await assetCache()).match(absolute(path));
  }

  /** Network first; after a network error or 5 s, the stored asset when a copy lists it. */
  async function serveAsset(request: Request): Promise<Response> {
    const network = deps.fetch(request);
    const first = await within(
      network.catch(() => null),
      ASSET_TIMEOUT_MS,
    );
    if (first.kind === "done" && first.value !== null) return first.value;
    const stored = await listedAsset(request.url);
    // Otherwise keep waiting on the network, or pass its error on.
    return stored ?? network;
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

  function answerWith(event: FetchEvent, handled: Promise<Handled>): void {
    event.respondWith(handled.then((result) => result.response));
    event.waitUntil(handled.then((result) => result.background).catch(() => undefined));
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
        // A fault inside the worker serves the network, which is never a copy.
        answerWith(
          event,
          navigate(request).catch(async () => served(await deps.fetch(request))),
        );
        return;
      case "bracket-nav":
        event.respondWith(passThroughBracketed(request));
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
        .then((reply) => port?.postMessage(reply)),
    );
  });
}
