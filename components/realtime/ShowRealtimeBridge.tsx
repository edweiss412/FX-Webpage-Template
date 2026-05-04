"use client";

/**
 * components/realtime/ShowRealtimeBridge.tsx (M4 Task 4.16 Checkpoint B)
 *
 * Thin client island that wires a Supabase Realtime Broadcast subscription
 * to `router.refresh()` so the parent Server Component re-fetches
 * `getShowForViewer` and re-renders the page when the underlying data
 * changes — without introducing any client-side data cache, TanStack Query,
 * or custom fetch path.
 *
 * The bridge is the ONLY new client surface added by Checkpoint B. It
 * renders `null` — there is no visual deliverable. All UI continues to
 * be server-rendered.
 *
 * Architecture (plan 03-04-tiles.md:727-828):
 *
 *   Server-rendered + thin client bridge calling router.refresh.
 *
 *   (a) `app/show/[slug]/page.tsx` stays a Server Component. It calls
 *       `getShowForViewer` directly server-side; no client-side data
 *       fetch is introduced.
 *   (b) The bridge mounts inside that page. On mount it (1) POSTs to
 *       /api/realtime/subscriber-token to mint a short-lived JWT,
 *       (2) calls subscribeToShow(showId, jwt, onInvalidate) from
 *       lib/realtime/subscribeToShow.ts.
 *   (c) On each `onInvalidate` callback the bridge schedules a debounced
 *       (100ms) `router.refresh()` — Next.js re-executes the Server
 *       Component which re-fetches getShowForViewer.
 *   (d) On unmount, the bridge cleans up in a strict 4-step order
 *       (see CLEANUP CONTRACT below) AND aborts any pending debounce.
 *
 * Hard contract (plan §823 + §824):
 *
 *   100ms debounce on broadcast-driven refresh: every onInvalidate clears
 *   any prior `pendingRefreshTimer` and schedules a fresh 100ms timeout.
 *   A burst of 8 invalidations within a 50ms window therefore coalesces
 *   to exactly ONE router.refresh — proven by Plan test 1 in the unit
 *   suite. The negative regression (1-second gap between events → 8
 *   refreshes) is Plan test 2.
 *
 *   Catch-up paths bypass the debounce: post-subscribe version-mismatch
 *   AND `system.reconnected` version-mismatch trigger SYNCHRONOUS
 *   router.refresh — no 100ms timer. The reasoning: a catch-up is the
 *   resolution of a known-stale-window state; delaying the refresh would
 *   leave the page rendering known-stale data for an extra 100ms with no
 *   coalescing benefit (catch-up fires at most once per reconnect).
 *
 *   Render-version REF (not closure-captured): the bridge maintains
 *   `renderVersionRef` updated via a render-time effect so reconnect
 *   handlers ALWAYS read the LATEST SSR'd token, never the T0 value
 *   from the initial mount. Without this, a server re-render with a
 *   newer token would still see a reconnect catch-up compare against
 *   the stale T0 and incorrectly conclude "no mismatch" → leak stale
 *   data across reconnects.
 *
 *   CLEANUP CONTRACT (mandatory 4-step order, plan §824):
 *     1. isMountedRef.current = false
 *     2. currentChannelGenerationRef.current += 1
 *     3. clearTimeout(pendingRefreshTimer.current)
 *     4. removeChannel(currentChannel)
 *
 *   Generation BEFORE removeChannel because some Realtime drivers fire a
 *   synchronous CLOSED status callback inside removeChannel; that
 *   callback's first guard MUST find the generation already advanced so
 *   it short-circuits. Cleanup runs synchronously inside the React
 *   useEffect teardown.
 *
 *   Stale-generation guards: every status / system / disconnect /
 *   renewal-step callback's FIRST guard is
 *   `if (!isMountedRef.current || closureGen !== currentGen) return;`.
 *   The renewal flow ALSO checks isMountedRef after each `await` so a
 *   late renewal can't race a fresh unmount.
 *
 *   JWT renewal sequence on `system.disconnected` / CHANNEL_ERROR /
 *   TIMED_OUT / CLOSED:
 *     (a) re-POST /api/realtime/subscriber-token
 *     (b) supabase.realtime.setAuth(newJwt)
 *     (c) removeChannel(oldChannel)
 *     (d) re-create via subscribeToShow(showId, newJwt, onInvalidate)
 *     (e) AFTER new subscribe resolves, run the version catch-up
 *     (f) log SHOW_REALTIME_JWT_RENEWED outcome:'success'
 *
 *   Renewal mint failure → log SHOW_REALTIME_BROADCAST_AUTH_FAILED, no
 *   retry-loop. Initial subscribe failure → console.warn, no retry-loop.
 *   Bounded backoff retry is a v2 enhancement; v1 fails open.
 *
 * Defense-in-depth note:
 *
 *   Auth happens at server fetch time inside getShowForViewer (per
 *   spec §7.2). A revoked-mid-session user still triggers
 *   router.refresh, but the subsequent server render hits the 410 path
 *   and navigates away — the bridge does not need its own auth check.
 */
import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { subscribeToShow } from "@/lib/realtime/subscribeToShow";
import type { ShowInvalidationChannel } from "@/lib/realtime/subscribeToShow";
import {
  attachSystemHandler,
  removeChannel,
  type SystemEvent,
} from "@/lib/realtime/showRealtimeChannelHandlers";

const DEBOUNCE_MS = 100;

type ShowRealtimeBridgeProps = {
  showId: string;
  slug: string;
  renderVersion: string;
};

async function mintSubscriberToken(slug: string): Promise<string | null> {
  const res = await fetch("/api/realtime/subscriber-token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { jwt?: unknown };
  return typeof body.jwt === "string" ? body.jwt : null;
}

async function fetchCurrentVersion(slug: string): Promise<string | null> {
  const res = await fetch(`/api/show/${encodeURIComponent(slug)}/version`, {
    method: "GET",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { version_token?: unknown };
  return typeof body.version_token === "string" ? body.version_token : null;
}

export function ShowRealtimeBridge({
  showId,
  slug,
  renderVersion,
}: ShowRealtimeBridgeProps) {
  const router = useRouter();

  // === Refs ===
  // isMountedRef — flips to false in step 1 of cleanup. Every async
  // callback's first guard.
  const isMountedRef = useRef<boolean>(true);
  // Channel generation. Incremented in step 2 of cleanup AND on each
  // renewal so a late callback for a removed channel short-circuits.
  const currentChannelGenerationRef = useRef<number>(0);
  // Pending debounced router.refresh handle. Cleared in step 3 of
  // cleanup AND on every fresh onInvalidate.
  const pendingRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // The active channel handle for cleanup (step 4) and renewal.
  const currentChannelRef = useRef<ShowInvalidationChannel | null>(null);
  // Latest SSR'd renderVersion token. Updated on every render via the
  // render-time effect below — reconnect catch-up handlers MUST read this
  // ref, NOT the closure-captured prop, or the comparison silently uses
  // a stale T0 value.
  const renderVersionRef = useRef<string>(renderVersion);

  // Sync renderVersionRef to the latest prop in a commit-phase effect so
  // reconnect / catch-up handlers always read the latest SSR'd token,
  // never a stale T0. We use useEffect (commit-phase) rather than a
  // render-time write because writing refs during render is a React
  // anti-pattern (concurrent renders may discard the work). The latency
  // (one paint) is benign here — catch-up handlers fire on socket
  // reconnect / disconnect, both of which are bounded by the network
  // round-trip and dwarf a single commit cycle.
  useEffect(() => {
    renderVersionRef.current = renderVersion;
  }, [renderVersion]);

  /**
   * Schedule a debounced router.refresh. Each call clears the prior
   * pending timer (the coalesce contract) and starts a fresh 100ms
   * countdown. The actual refresh fires only if the bridge is still
   * mounted at fire time AND the closure-captured generation matches.
   */
  const scheduleDebouncedRefresh = useCallback(() => {
    if (pendingRefreshTimer.current !== null) {
      clearTimeout(pendingRefreshTimer.current);
    }
    // Capture generation at schedule time so a later cleanup that advances
    // the gen invalidates the pending refresh.
    const closureGen = currentChannelGenerationRef.current;
    pendingRefreshTimer.current = setTimeout(() => {
      pendingRefreshTimer.current = null;
      if (!isMountedRef.current) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      router.refresh();
    }, DEBOUNCE_MS);
  }, [router]);

  /**
   * Synchronous (non-debounced) refresh used by the catch-up paths
   * (post-subscribe and system.reconnected). Plan §823 mandates this
   * path bypasses the debounce.
   */
  const refreshSyncIfMismatch = useCallback(
    async (closureGen: number) => {
      if (!isMountedRef.current) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      const currentToken = await fetchCurrentVersion(slug);
      if (!isMountedRef.current) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      if (currentToken !== null && currentToken !== renderVersionRef.current) {
        router.refresh();
      }
    },
    [slug, router],
  );

  useEffect(() => {
    isMountedRef.current = true;

    const supabase = getSupabaseBrowserClient();

    // Renewal closure — captures `closureGen` at the time the previous
    // channel was opened so a late renewal can't race a newer
    // generation already in flight from a concurrent code path.
    const renewSubscription = async (priorClosureGen: number) => {
      if (!isMountedRef.current) return;
      if (priorClosureGen !== currentChannelGenerationRef.current) return;

      const newJwt = await mintSubscriberToken(slug);
      if (!isMountedRef.current) return;
      if (priorClosureGen !== currentChannelGenerationRef.current) return;

      if (newJwt === null) {
        console.warn(
          "[ShowRealtimeBridge] SHOW_REALTIME_BROADCAST_AUTH_FAILED — JWT renewal mint failed; falling back to no-op (no retry loop)",
        );
        // Logging contract: the file-header doc (line ~82) promises a
        // `SHOW_REALTIME_JWT_RENEWED outcome: 'failed'` log on every
        // renewal-failure path. The `outcome:'success'` peer fires at
        // line ~298. Each failure branch emits the failed outcome with
        // a distinct `reason` tag so dashboards can disambiguate
        // mint-fail vs setAuth-fail vs subscribe-fail.
        console.warn(
          "[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: failed",
          { reason: "mint_failed" },
        );
        return;
      }

      try {
        supabase.realtime.setAuth(newJwt);
      } catch (err) {
        console.warn(
          "[ShowRealtimeBridge] SHOW_REALTIME_BROADCAST_AUTH_FAILED — setAuth threw during renewal",
          err,
        );
        console.warn(
          "[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: failed",
          { reason: "set_auth_threw", err },
        );
        return;
      }

      // Tear down the old channel BEFORE opening the new one so an
      // in-flight CLOSED callback fires against the prior generation.
      const oldChannel = currentChannelRef.current;
      // Advance generation BEFORE removeChannel so any synchronous
      // CLOSED callback inside removeChannel reads the advanced
      // generation and short-circuits.
      currentChannelGenerationRef.current += 1;
      const newClosureGen = currentChannelGenerationRef.current;
      if (oldChannel !== null) {
        try {
          await removeChannel(supabase, oldChannel);
        } catch (err) {
          // Swallow — teardown errors are not actionable client-side.
          void err;
        }
      }
      if (!isMountedRef.current) return;
      if (newClosureGen !== currentChannelGenerationRef.current) return;

      let newChannel: ShowInvalidationChannel | null = null;
      let newSubscribed: Promise<string> | null = null;
      try {
        const result = subscribeToShow(
          supabase,
          showId,
          newJwt,
          (token) => {
            if (!isMountedRef.current) return;
            if (newClosureGen !== currentChannelGenerationRef.current) return;
            // Update the renderVersion ref optimistically so subsequent
            // catch-ups don't re-fire on this same token.
            if (typeof token === "string") {
              renderVersionRef.current = token;
            }
            scheduleDebouncedRefresh();
          },
          (status) => handleStatusCallback(status, newClosureGen),
        );
        newChannel = result.channel;
        newSubscribed = result.subscribed;
      } catch (err) {
        console.warn(
          "[ShowRealtimeBridge] subscription failed during renewal",
          err,
        );
        console.warn(
          "[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: failed",
          { reason: "subscribe_threw", err },
        );
        return;
      }
      currentChannelRef.current = newChannel;
      attachSystemHandler(newChannel, (e) =>
        handleSystemEvent(e, newClosureGen),
      );

      // (e) AFTER the underlying socket reports SUBSCRIBED, run the
      // version catch-up. Without this gate the catch-up races the
      // Realtime join: an update that lands AFTER the version GET but
      // BEFORE Realtime accepts the subscription is missed (catch-up
      // sees the old token, Broadcast has not started delivering) and
      // the page renders stale data forever. Codex HIGH 2.
      try {
        await newSubscribed;
      } catch {
        // The Promise only ever resolves (with a status string); guard
        // for completeness in case a future implementation rejects.
      }
      if (!isMountedRef.current) return;
      if (newClosureGen !== currentChannelGenerationRef.current) return;
      await refreshSyncIfMismatch(newClosureGen);

      // (f) Renewal succeeded — log success.
      console.info(
        "[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: success",
      );
    };

    const handleSystemEvent = (e: SystemEvent, closureGen: number) => {
      if (!isMountedRef.current) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      // Exhaustive switch over the SystemEvent discriminated union. The
      // `default` branch is a runtime fence: if a future Supabase Realtime
      // release introduces a new system event the type doesn't yet
      // enumerate, the bridge logs a warning rather than silently dropping
      // it (which made the silent-drop indistinguishable from a
      // deliberate-ignore in the prior `{ event: string }` shape).
      switch (e.event) {
        case "reconnected":
          // Catch-up bypass: synchronous refresh on version mismatch.
          void refreshSyncIfMismatch(closureGen);
          return;
        case "disconnected":
          void renewSubscription(closureGen);
          return;
        default: {
          // Defensive cast through `unknown`: the type system says this
          // branch is unreachable, but Supabase may deliver an unenumerated
          // event at runtime. We log without crashing.
          const unknownEvent = e as unknown as { event?: unknown };
          console.warn(
            "[ShowRealtimeBridge] unknown system event",
            unknownEvent,
          );
          return;
        }
      }
    };

    const handleStatusCallback = (status: string, closureGen: number) => {
      if (!isMountedRef.current) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      // CHANNEL_ERROR / TIMED_OUT / CLOSED → renewal sequence.
      if (
        status === "CHANNEL_ERROR" ||
        status === "TIMED_OUT" ||
        status === "CLOSED"
      ) {
        void renewSubscription(closureGen);
      }
      // SUBSCRIBED is the success path; the post-subscribe catch-up is
      // run inline below after the initial subscribeToShow resolves.
    };

    // === Initial mount: mint JWT then subscribe ===
    let initialAborted = false;
    (async () => {
      const jwt = await mintSubscriberToken(slug);
      if (!isMountedRef.current || initialAborted) return;
      if (jwt === null) {
        console.warn(
          "[ShowRealtimeBridge] subscription failed: initial JWT mint returned no token; falling back to no-op (no retry loop)",
        );
        return;
      }

      try {
        supabase.realtime.setAuth(jwt);
      } catch (err) {
        console.warn(
          "[ShowRealtimeBridge] subscription failed: setAuth threw",
          err,
        );
        return;
      }

      const closureGen = currentChannelGenerationRef.current;
      let channel: ShowInvalidationChannel | null = null;
      let subscribedPromise: Promise<string> | null = null;
      try {
        const result = subscribeToShow(
          supabase,
          showId,
          jwt,
          (token) => {
            if (!isMountedRef.current) return;
            if (closureGen !== currentChannelGenerationRef.current) return;
            if (typeof token === "string") {
              renderVersionRef.current = token;
            }
            scheduleDebouncedRefresh();
          },
          (status) => handleStatusCallback(status, closureGen),
        );
        channel = result.channel;
        subscribedPromise = result.subscribed;
      } catch (err) {
        // Single failed subscribe does NOT loop. Bounded-backoff retry
        // is a v2 enhancement; v1 fails open.
        console.warn(
          "[ShowRealtimeBridge] subscription failed",
          err,
        );
        return;
      }
      currentChannelRef.current = channel;
      attachSystemHandler(channel, (e) => handleSystemEvent(e, closureGen));

      // Post-subscribe catch-up: GATE on the readiness Promise so the
      // catch-up does not run before Realtime accepts the subscription.
      // Without this gate (Codex HIGH 2), an update that lands AFTER the
      // version GET but BEFORE Realtime accepts the subscription is
      // missed: the catch-up sees the old token and Broadcast has not
      // started delivering, leaving the page stale forever. Once
      // SUBSCRIBED fires, compare the server's current version to the
      // SSR'd renderVersion. Synchronous refresh on mismatch.
      try {
        await subscribedPromise;
      } catch {
        // The Promise only ever resolves; guard for completeness.
      }
      if (!isMountedRef.current || initialAborted) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      await refreshSyncIfMismatch(closureGen);
    })();

    return () => {
      // === Cleanup contract — strict 4-step order ===
      // 1. Mark unmounted (every async guard reads this).
      isMountedRef.current = false;
      initialAborted = true;
      // 2. Advance generation BEFORE removeChannel so a synchronous
      //    CLOSED callback inside step 4 captures a stale gen.
      currentChannelGenerationRef.current += 1;
      // 3. Cancel any pending debounced refresh.
      if (pendingRefreshTimer.current !== null) {
        clearTimeout(pendingRefreshTimer.current);
        pendingRefreshTimer.current = null;
      }
      // 4. Tear down the channel.
      const channel = currentChannelRef.current;
      currentChannelRef.current = null;
      if (channel !== null) {
        // Fire-and-forget — cleanup runs synchronously and we don't
        // want to block React's teardown microtask queue.
        void removeChannel(supabase, channel).catch(() => {
          // Teardown errors are not actionable client-side.
        });
      }
    };
    // showId / slug are stable for the lifetime of the page (the URL
    // resolves them once at server-render time); we still list them so
    // a hypothetical future surface that rotates them remounts the
    // bridge cleanly.
  }, [showId, slug, scheduleDebouncedRefresh, refreshSyncIfMismatch]);

  return null;
}
