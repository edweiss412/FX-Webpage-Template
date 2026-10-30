"use client";

/**
 * components/offline/SavedCopyMarker.tsx
 *
 * The saved-copy marker (spec 4.3). It renders the `<template>` the service
 * worker reads from a complete document body, and on mount, and again on each
 * new path, posts the same disposition to the worker, because many renders
 * never reach the worker as a document: `router.refresh()` after a realtime
 * invalidation, and soft navigations such as TerminalFailure's retry link. One
 * component therefore covers a document load and an RSC render alike, and the
 * client-render purge triggers of spec 4.6 follow from it rather than being
 * separate code paths.
 *
 * - `purge` purges the marker's show, or the copy stored at this path when the
 *   marker names no show.
 * - `check` asks the worker to run the status check for the copy at this path,
 *   and reloads on `ended` so the worker serves that copy in ended mode.
 * - `keep`, `hold` and `save` post nothing. The live page's `ensure-saved` is
 *   `<SavedCopyRegistrar>`'s (plan section 1, item 5).
 *
 * It also reloads the page when the worker announces `purged` for the marker's
 * show (spec 4.4 step 5): every page has a marker, only crew pages have the
 * bar (plan section 1, item 6).
 *
 * Renders no visible UI. With no usable `navigator.serviceWorker` it renders the
 * template and does nothing else.
 */
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { postToWorker, serviceWorkerContainer } from "@/lib/offline/client/messaging";
import { reloadPage } from "@/lib/offline/client/reload";
import { markerAttributes, type Marker } from "@/lib/offline/marker";
import { STATUS_TIMEOUT_MS } from "@/lib/offline/navigation";
import type { MarkerMessage } from "@/lib/offline/protocol";

/**
 * How long the page waits for the worker's answer. The worker's check waits up
 * to STATUS_TIMEOUT_MS for the status route and then writes to its store, so a
 * page that gave up sooner would miss an `ended` answer.
 */
const REPLY_TIMEOUT_MS = 2 * STATUS_TIMEOUT_MS;

function isPurgedFor(data: unknown, showId: string): boolean {
  if (typeof data !== "object" || data === null) return false;
  const message = data as { type?: unknown; showId?: unknown };
  return message.type === "purged" && message.showId === showId;
}

export function SavedCopyMarker({ marker }: { marker: Marker }) {
  const { disposition, showId } = marker;
  // A soft navigation can keep this instance mounted with identical props, so
  // a new path is a new render to post for.
  const pathname = usePathname();

  useEffect(() => {
    const container = serviceWorkerContainer();
    if (container === null || showId === null) return;
    // Relies on the client message queue the browser enables at DOMContentLoaded;
    // startMessages() is deliberately not called.
    const onMessage = (event: MessageEvent) => {
      if (isPurgedFor(event.data, showId)) reloadPage();
    };
    container.addEventListener("message", onMessage);
    return () => container.removeEventListener("message", onMessage);
  }, [showId]);

  useEffect(() => {
    if (disposition !== "purge" && disposition !== "check") return;
    const container = serviceWorkerContainer();
    if (container === null) return;

    const url = window.location.pathname;
    const message: MarkerMessage =
      disposition === "purge"
        ? { type: "marker", disposition, showId, url }
        : { type: "marker", disposition, url };
    let mounted = true;
    // `ready`, not `controller`: a hard-reloaded page is uncontrolled but still
    // reaches the registration's worker. With no registration `ready` never
    // settles, and nothing happens.
    void container.ready
      .then(async ({ active }) => {
        // StrictMode runs the effect twice; only the run still mounted posts.
        if (!mounted || active === null) return;
        const reply = await postToWorker(message, { timeoutMs: REPLY_TIMEOUT_MS, worker: active });
        if (mounted && message.disposition === "check" && reply.outcome === "ended") reloadPage();
      })
      // A ready or a post that rejects leaves the page as it is; it must not
      // surface as an unhandled rejection.
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [disposition, showId, pathname]);

  return <template {...markerAttributes(marker)} />;
}
