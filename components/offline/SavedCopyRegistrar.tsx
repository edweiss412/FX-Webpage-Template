"use client";

/**
 * components/offline/SavedCopyRegistrar.tsx
 *
 * Puts the saved-copy worker on the phone and keeps the saved copy current
 * (spec 4.7.7, 4.7.3, 4.8, 4.10). Renders nothing.
 *
 * - Once the page is idle it registers /sw.js for the whole origin, with
 *   `updateViaCache: 'none'` so every update check reaches the server (spec
 *   4.9), and asks once per page load for persistent storage (best effort).
 *   With the kill switch on (`disabled`, read by the server per request) it
 *   unregisters every registration instead and does nothing else. Idle is
 *   `requestIdleCallback`, or on WebKit, which lacks it, a timer after `load`.
 * - On a live page that a worker controls, it posts `ensure-saved` with the
 *   path and the render time: when the worker takes control, and again
 *   whenever an RSC refresh brings a new render time, at most once per 10
 *   seconds. Live is read as the bar reads it (spec 4.7.2): no `fxav-served`
 *   meta (spec 4.7.1), or a render time other than the one the page mounted
 *   with, since a saved copy that an RSC refresh brought server content to is
 *   live even though the meta stays in its document. An empty render time is
 *   never sent; the worker's protocol rejects it. A render time that arrives inside the window
 *   is sent when the window ends, and a later one replaces it, because the
 *   worker saves the page as the server renders it now, not as it was. This is
 *   the client action of the `save` marker (plan section 1, item 5): the first
 *   visit's save and every later one.
 * - When the show has an agenda it loads the agenda viewer's code and the
 *   pdf.js worker that code configures, online, idle and once a worker controls
 *   the page, so both pass through the worker into its static cache and an
 *   agenda nobody opened still opens offline (spec 4.8).
 * - A failed registration and a `save-failed` broadcast from the worker are
 *   logged with source `client.crew` (spec 6), the source crew components use
 *   and the client-error route accepts. Neither is shown: nothing here renders
 *   (invariant 5).
 *
 * With no usable `navigator.serviceWorker` it does nothing at all.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { postToWorker, serviceWorkerContainer } from "@/lib/offline/client/messaging";
import { readServedCopy } from "@/lib/offline/client/servedCopy";
import type { EnsureSavedMessage } from "@/lib/offline/protocol";
import { clientLog } from "@/lib/observe/clientLog";

export type SavedCopyRegistrarProps = {
  /** CrewShell's render time, ISO 8601 UTC. A new value means an RSC refresh brought server content. */
  renderedAt: string;
  /** The kill switch, `CREW_OFFLINE_DISABLED` (spec 4.10). */
  disabled: boolean;
  /** The saved copy lists an agenda (spec 4.8). */
  hasAgenda: boolean;
};

const WORKER_URL = "/sw.js";

const REGISTRATION_OPTIONS: RegistrationOptions = { scope: "/", updateViaCache: "none" };

/** At most one `ensure-saved` per this window (spec 4.7.3). */
const ENSURE_SAVED_THROTTLE_MS = 10_000;

/**
 * How long a post waits for the worker's reply. Nothing here reads the reply,
 * so the bound only frees the message channel; it matches the bar's
 * PROBE_TIMEOUT_MS because an `ensure-saved` runs the same fetch and status
 * check a probe runs.
 */
const ENSURE_SAVED_REPLY_TIMEOUT_MS = 20_000;

/**
 * Where there is no requestIdleCallback (WebKit), the work runs in the first
 * task after `load` rather than inside it.
 */
const IDLE_FALLBACK_DELAY_MS = 0;

/** Once per page load, however often the registrar mounts (spec 4.7.7, 4.8). */
let persistRequested = false;
let agendaPrefetchStarted = false;

/** Test seam: a new page load. */
export function __resetSavedCopyRegistrarForTests(): void {
  persistRequested = false;
  agendaPrefetchStarted = false;
}

/** Runs `work` when the page is idle; the returned function cancels it. */
function whenIdle(work: () => void): () => void {
  // Typed as always present, but WebKit has neither function.
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(() => work());
    return () => window.cancelIdleCallback(handle);
  }
  let timer: number | undefined;
  const afterLoad = (): void => {
    timer = window.setTimeout(work, IDLE_FALLBACK_DELAY_MS);
  };
  if (document.readyState === "complete") afterLoad();
  else window.addEventListener("load", afterLoad, { once: true });
  return () => {
    window.removeEventListener("load", afterLoad);
    window.clearTimeout(timer);
  };
}

/**
 * The rejection's name and message, for the log's bounded detail field. Read by
 * shape rather than `instanceof Error`: `register` rejects with a DOMException,
 * which is not an Error in every realm.
 */
function describeError(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const { name, message } = error as { name?: unknown; message?: unknown };
  return typeof name === "string" && typeof message === "string"
    ? `${name}: ${message}`
    : undefined;
}

function registerWorker(container: ServiceWorkerContainer): void {
  // A register that throws instead of rejecting lands in the same catch.
  void Promise.resolve()
    .then(() => container.register(WORKER_URL, REGISTRATION_OPTIONS))
    .catch((error: unknown) => {
      clientLog(
        "warn",
        "client.crew",
        "service worker registration failed",
        undefined,
        "CREW_OFFLINE_SW_REGISTER_FAILED",
        describeError(error),
      );
    });
}

/** Best effort: each registration is removed on its own, and nothing is reported. */
function unregisterAll(container: ServiceWorkerContainer): void {
  void Promise.resolve()
    .then(() => container.getRegistrations())
    .then((registrations) =>
      Promise.all(
        registrations.map((registration) => registration.unregister().catch(() => false)),
      ),
    )
    .catch(() => undefined);
}

function persistStorageOnce(): void {
  if (persistRequested) return;
  persistRequested = true;
  try {
    void navigator.storage.persist().catch(() => false);
  } catch {
    // No StorageManager (an insecure context, an older browser): nothing to ask.
  }
}

/**
 * The viewer module sets the pdf.js worker URL as it loads
 * (components/agenda/AgendaPdfViewer.tsx), so it is imported first, through the
 * same specifier AgendaEmbed loads, and the URL is read after.
 */
async function prefetchAgendaViewer(): Promise<void> {
  await import("@/components/agenda/AgendaPdfViewer");
  const { pdfjs } = await import("react-pdf");
  const workerSrc = pdfjs.GlobalWorkerOptions.workerSrc;
  if (workerSrc === "") return;
  await fetch(workerSrc);
}

function prefetchAgendaViewerOnce(): void {
  if (agendaPrefetchStarted || !navigator.onLine) return;
  agendaPrefetchStarted = true;
  void prefetchAgendaViewer().catch(() => undefined);
}

function isSaveFailed(data: unknown): boolean {
  return (
    typeof data === "object" && data !== null && (data as { type?: unknown }).type === "save-failed"
  );
}

function saveFailedReason(data: unknown): string | undefined {
  const reason: unknown = (data as { reason?: unknown }).reason;
  return typeof reason === "string" ? reason : undefined;
}

function subscribeToController(onChange: () => void): () => void {
  const container = serviceWorkerContainer();
  if (container === null) return () => undefined;
  container.addEventListener("controllerchange", onChange);
  return () => container.removeEventListener("controllerchange", onChange);
}

function isControlled(): boolean {
  return (serviceWorkerContainer()?.controller ?? null) !== null;
}

/** The server cannot know; the hydrating render agrees with it, and the real value follows. */
function isControlledOnServer(): boolean {
  return false;
}

/** The throttle's state: one per registrar, kept across renders. */
type Throttle = {
  /** The render time last sent or waiting to be sent. */
  latest: string | null;
  /** `latest` arrived inside the window and is sent when it ends. */
  waiting: boolean;
  /** Open window: a timer that ends it. */
  timer: number | undefined;
  /** False once the registrar unmounts, so a window ending later sends nothing. */
  mounted: boolean;
};

function send(throttle: Throttle, renderedAt: string): void {
  throttle.waiting = false;
  const message: EnsureSavedMessage = {
    type: "ensure-saved",
    url: window.location.pathname,
    renderedAt,
  };
  // Never rejects; the reply is not needed (the worker reports quota failures
  // by broadcast, below).
  void postToWorker(message, { timeoutMs: ENSURE_SAVED_REPLY_TIMEOUT_MS });
  throttle.timer = window.setTimeout(() => {
    throttle.timer = undefined;
    const next = throttle.latest;
    if (throttle.waiting && throttle.mounted && next !== null) send(throttle, next);
    else throttle.waiting = false;
  }, ENSURE_SAVED_THROTTLE_MS);
}

function requestEnsureSaved(throttle: Throttle, renderedAt: string): void {
  // One render time is one message: a re-render, StrictMode's second effect
  // run, or a new controller does not repeat it. An empty one is no render
  // time at all: parsePageMessage (lib/offline/protocol.ts) refuses it.
  if (renderedAt === "" || renderedAt === throttle.latest) return;
  throttle.latest = renderedAt;
  if (throttle.timer !== undefined) throttle.waiting = true;
  else send(throttle, renderedAt);
}

export function SavedCopyRegistrar({ renderedAt, disabled, hasAgenda }: SavedCopyRegistrarProps) {
  const controlled = useSyncExternalStore(
    subscribeToController,
    isControlled,
    isControlledOnServer,
  );
  // The render time this registrar mounted with. A different one later means
  // an RSC refresh brought server content, so the page is live (spec 4.7.2).
  const [mountRenderedAt] = useState(renderedAt);
  const throttle = useRef<Throttle>({
    latest: null,
    waiting: false,
    timer: undefined,
    mounted: false,
  });

  // An unmount stops a window that ends later from sending; StrictMode's
  // remount sets it back. The window itself is left to run out, so StrictMode's
  // second effect run does not reopen the throttle early.
  useEffect(() => {
    const state = throttle.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
    };
  }, []);

  useEffect(() => {
    const container = serviceWorkerContainer();
    if (container === null) return;
    return whenIdle(() => {
      if (disabled) {
        unregisterAll(container);
        return;
      }
      registerWorker(container);
      persistStorageOnce();
    });
  }, [disabled]);

  useEffect(() => {
    const container = serviceWorkerContainer();
    if (container === null || disabled) return;
    // Relies on the client message queue the browser enables at
    // DOMContentLoaded, as SavedCopyMarker does.
    const onMessage = (event: MessageEvent): void => {
      if (!isSaveFailed(event.data)) return;
      clientLog(
        "warn",
        "client.crew",
        "saved copy could not be stored",
        undefined,
        "CREW_OFFLINE_SAVE_FAILED",
        saveFailedReason(event.data),
      );
    };
    container.addEventListener("message", onMessage);
    return () => container.removeEventListener("message", onMessage);
  }, [disabled]);

  useEffect(() => {
    if (disabled || !controlled) return;
    const live = renderedAt !== mountRenderedAt || readServedCopy().mode === "live";
    if (!live) return;
    requestEnsureSaved(throttle.current, renderedAt);
  }, [disabled, controlled, renderedAt, mountRenderedAt]);

  useEffect(() => {
    if (disabled || !hasAgenda || !controlled) return;
    return whenIdle(prefetchAgendaViewerOnce);
  }, [disabled, hasAgenda, controlled]);

  return null;
}
