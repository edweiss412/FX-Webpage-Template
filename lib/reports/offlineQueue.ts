/**
 * lib/reports/offlineQueue.ts
 *
 * The phone-wide queue of reports written with no signal (crew offline spec
 * 2026-10-26 §5.1). One record per report, keyed by its idempotency key, holding
 * everything the request needs, so any crew page on the phone can send it.
 *
 * IndexedDB, because `sessionStorage` dies with the tab and a single
 * `localStorage` value would let two tabs overwrite each other. Every change is
 * one record in one transaction, and the cap check shares a transaction with the
 * `add`, so two tabs enqueueing at once both keep their reports and neither can
 * pass the cap.
 *
 * Its own database, not `fxav-offline`: the kill switch deletes that one by name,
 * and a held report must not go down with a saved copy.
 *
 * Nothing here rejects. Private browsing or a storage refusal reads as
 * `unavailable` or an empty queue, and the modal falls back to its ordinary
 * failure copy with the draft intact.
 */
import { crewPath } from "@/lib/offline/crewUrl";
import { MARKER_ID, readMarker } from "@/lib/offline/marker";

const DB_NAME = "fxav-report-queue";
const DB_VERSION = 1;
const STORE = "reports";

/** Queued or failed records per phone (spec 5.1). */
export const QUEUE_CAP = 10;

export type QueuedReportStatus = "queued" | "failed";

export type QueuedReport = {
  /** The idempotency key. */
  id: string;
  showId: string;
  slug: string | null;
  surface: "crew";
  surfaceId: string;
  /** The autocaptured context the modal would have sent. */
  context: Record<string, unknown>;
  message: string;
  writtenAt: string;
  pageRenderedAt: string | null;
  /** The page's opaque viewer key (spec 4.3); null when it had no `save` marker. */
  writer: string | null;
  status: QueuedReportStatus;
  /** The refusal's code, when it carried one. */
  errorCode: string | null;
};

export type HoldResult = "held" | "full" | "unavailable";
export type RequeueResult = "held" | "stale" | "unavailable";

const CHANNEL_NAME = "fxav-report-queue";

const listeners = new Set<() => void>();
let receiver: BroadcastChannel | null = null;

function openChannel(): BroadcastChannel | null {
  return typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME);
}

function callListeners(): void {
  for (const listener of listeners) listener();
}

/**
 * Calls `listener` after every change to the queue, from this page or, where
 * the browser has `BroadcastChannel`, from another one. Without it another tab
 * catches up when it next becomes visible.
 */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  if (receiver === null) {
    receiver = openChannel();
    if (receiver !== null) receiver.onmessage = callListeners;
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      receiver?.close();
      receiver = null;
    }
  };
}

function notify(): void {
  callListeners();
  // A channel never hears its own post, so this page is not told twice.
  const channel = receiver ?? openChannel();
  channel?.postMessage("changed");
  if (channel !== receiver) channel?.close();
}

function openQueue(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      if (typeof indexedDB === "undefined") {
        resolve(null);
        return;
      }
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/**
 * Runs one transaction and settles with what `run` passed to `finish` once it
 * has committed, or with `fallback` when it could not open or did not commit.
 */
async function inTransaction<T>(
  mode: IDBTransactionMode,
  fallback: T,
  run: (store: IDBObjectStore, finish: (value: T) => void) => void,
): Promise<T> {
  const db = await openQueue();
  if (db === null) return fallback;
  return new Promise<T>((resolve) => {
    let result = fallback;
    const settle = (value: T): void => {
      db.close();
      resolve(value);
    };
    try {
      const transaction = db.transaction(STORE, mode);
      transaction.oncomplete = () => settle(result);
      transaction.onabort = () => settle(fallback);
      run(transaction.objectStore(STORE), (value) => {
        result = value;
      });
    } catch {
      settle(fallback);
    }
  });
}

/** Adds a report, unless the phone already holds its cap. */
export async function enqueueReport(report: QueuedReport): Promise<HoldResult> {
  const result = await inTransaction<HoldResult>("readwrite", "unavailable", (store, finish) => {
    const count = store.count();
    count.onsuccess = () => {
      if (count.result >= QUEUE_CAP) {
        finish("full");
        return;
      }
      store.add(report);
      finish("held");
    };
  });
  if (result === "held") notify();
  return result;
}

/**
 * Swaps a failed record for its resend, in one transaction, so the new key is on
 * the phone before anything is sent. `stale` means the failed record is gone,
 * sent or discarded from another tab: nothing is added, so two tabs resending
 * one report cannot both win and a resend can never pass the cap.
 */
export async function requeueReport(
  failedId: string,
  report: QueuedReport,
): Promise<RequeueResult> {
  const result = await inTransaction<RequeueResult>("readwrite", "unavailable", (store, finish) => {
    const read = store.get(failedId);
    read.onsuccess = () => {
      const current = read.result as QueuedReport | undefined;
      if (current?.status !== "failed") {
        finish("stale");
        return;
      }
      store.delete(failedId);
      store.add(report);
      finish("held");
    };
  });
  if (result === "held") notify();
  return result;
}

function oldestFirst(a: QueuedReport, b: QueuedReport): number {
  return a.writtenAt.localeCompare(b.writtenAt) || a.id.localeCompare(b.id);
}

/** Every record on the phone, oldest first. */
export async function listReports(): Promise<readonly QueuedReport[]> {
  const reports = await inTransaction<QueuedReport[]>("readonly", [], (store, finish) => {
    const all = store.getAll();
    all.onsuccess = () => finish(all.result as QueuedReport[]);
  });
  return [...reports].sort(oldestFirst);
}

export async function deleteReport(id: string): Promise<void> {
  await inTransaction<void>("readwrite", undefined, (store) => {
    store.delete(id);
  });
  notify();
}

/**
 * Marks a queued record failed. Read and written in one transaction, and only
 * while it is still queued: two tabs without Web Locks can race, and a plain
 * `put` here would bring back a record the other tab just delivered.
 */
export async function failReport(id: string, errorCode: string | null): Promise<void> {
  const changed = await inTransaction<boolean>("readwrite", false, (store, finish) => {
    const read = store.get(id);
    read.onsuccess = () => {
      const current = read.result as QueuedReport | undefined;
      if (current?.status !== "queued") return;
      store.put({ ...current, status: "failed", errorCode });
      finish(true);
    };
  });
  if (changed) notify();
}

/** The body `POST /api/report` takes for a held report. */
export function queuedRequestBody(report: QueuedReport): Record<string, unknown> {
  return {
    ...report.context,
    idempotency_key: report.id,
    show_id: report.showId,
    message: report.message,
    surface: report.surface,
    ...(report.slug === null ? {} : { showSlug: report.slug }),
    offline: { writtenAt: report.writtenAt, pageRenderedAt: report.pageRenderedAt },
    ...(report.writer === null ? {} : { writer: report.writer }),
  };
}

/**
 * Who this page was rendered for and when, from its saved-copy marker (spec
 * 4.3). A `save` marker has both and a `keep` marker has the viewer. Anything
 * else names nobody: an admin viewing the crew page has a `purge` marker, for one.
 */
export function readPageIdentity(): { writer: string | null; pageRenderedAt: string | null } {
  const none = { writer: null, pageRenderedAt: null };
  if (typeof document === "undefined") return none;
  const element = document.getElementById(MARKER_ID);
  if (element === null) return none;
  const read = readMarker(element.outerHTML);
  if (read.kind !== "valid") return none;
  const { marker } = read;
  if (marker.disposition === "save") {
    return { writer: marker.viewer, pageRenderedAt: marker.renderedAt };
  }
  return marker.disposition === "keep" ? { writer: marker.viewer, pageRenderedAt: null } : none;
}

/** Where the report modal keeps each surface's draft (one `sessionStorage` row per surface). */
export const REPORT_DRAFT_PREFIX = "fxav-report-attempt-";

/**
 * Drops every report draft written for `writer`, on a name switch. The surface
 * scopes outlive the switch, so without this the next person to open a report
 * on that surface after switching back would meet the old draft again.
 */
export function dropDraftsWrittenBy(writer: string): void {
  if (typeof window === "undefined") return;
  const store = window.sessionStorage;
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key !== null && key.startsWith(REPORT_DRAFT_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    try {
      const row = JSON.parse(store.getItem(key) ?? "null") as { writer?: unknown } | null;
      if (row?.writer === writer) store.removeItem(key);
    } catch {
      // Not a draft this code wrote; left alone.
    }
  }
}

/** The show slug in this page's crew URL, or null off a crew page. */
export function pageSlug(): string | null {
  if (typeof location === "undefined") return null;
  const path = crewPath(location.pathname);
  return path === null ? null : (path.split("/")[2] ?? null);
}
