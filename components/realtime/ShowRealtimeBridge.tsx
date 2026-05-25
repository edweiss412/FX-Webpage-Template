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

/**
 * Discriminated fetch result for the bridge's auth-bearing endpoints.
 * Codex round-20 HIGH: collapsing every non-OK response to `null`
 * silently swallowed 401/403 auth-deny responses. A revoked-while-
 * offline viewer would reconnect, hit 401, the bridge would skip
 * refresh, and the user would keep seeing stale show data instead
 * of being denied/redirected by the Server Component auth chain.
 *
 * The fix is to discriminate auth-deny from transient/server failure
 * so callers can route auth-deny to a forced refresh (which lets the
 * page's auth resolver redirect/clear-session) while still treating
 * 5xx / network failure as silent fail-open.
 */
type AuthFetchResult<T> =
  | { kind: "ok"; value: T }
  // M11.5 R11-F1 / D3.5: 410 is the picker-cookie identity-consistency
  // wire code (P-R29 Fix-1 shared-device defense) and the show-archived
  // wire code on §6 data APIs. Both are terminal auth-loss states —
  // recovery is the same as 401/403: drive the page through the Server
  // Component resolver via router.refresh() so the chain re-evaluates
  // and renders the appropriate terminal state (sign-in, notFound, etc).
  | { kind: "auth_denied"; status: 401 | 403 | 410 }
  | { kind: "transient_failure" };

async function mintSubscriberToken(slug: string): Promise<AuthFetchResult<string>> {
  let res: Response;
  try {
    res = await fetch("/api/realtime/subscriber-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug }),
    });
  } catch {
    return { kind: "transient_failure" };
  }
  if (res.status === 401 || res.status === 403 || res.status === 410) {
    return { kind: "auth_denied", status: res.status as 401 | 403 | 410 };
  }
  if (!res.ok) {
    return { kind: "transient_failure" };
  }
  const body = (await res.json()) as { jwt?: unknown };
  if (typeof body.jwt !== "string") {
    return { kind: "transient_failure" };
  }
  return { kind: "ok", value: body.jwt };
}

async function fetchCurrentVersion(slug: string): Promise<AuthFetchResult<string>> {
  let res: Response;
  try {
    res = await fetch(`/api/show/${encodeURIComponent(slug)}/version`, {
      method: "GET",
    });
  } catch {
    return { kind: "transient_failure" };
  }
  if (res.status === 401 || res.status === 403 || res.status === 410) {
    return { kind: "auth_denied", status: res.status as 401 | 403 | 410 };
  }
  if (!res.ok) {
    return { kind: "transient_failure" };
  }
  const body = (await res.json()) as { version_token?: unknown };
  if (typeof body.version_token !== "string") {
    return { kind: "transient_failure" };
  }
  return { kind: "ok", value: body.version_token };
}

export function ShowRealtimeBridge({ showId, slug, renderVersion }: ShowRealtimeBridgeProps) {
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
  const pendingRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The active channel handle for cleanup (step 4) and renewal.
  const currentChannelRef = useRef<ShowInvalidationChannel | null>(null);
  // Single-flight lock for renewSubscription (Codex HIGH 3 / plan §827,
  // upgraded to owner-token in Codex round 5 HIGH).
  // CHANNEL_ERROR / TIMED_OUT / CLOSED / system.disconnected callbacks can
  // arrive in rapid succession with the SAME generation BEFORE the first
  // mint completes (generation is not advanced until AFTER mintSubscriber
  // resolves). Without this gate, a flaky network triggers overlapping
  // JWT mints, repeated setAuth, and channel create/remove thrash.
  //
  // Round 5 HIGH: a plain boolean lock is unsafe across cleanup/remount.
  // If show-A is mid-renewal (boolean=true) when its effect cleans up
  // and a new effect for show-B mounts, the boolean is still set true,
  // so show-B's renewSubscription returns immediately at the lock check
  // and never schedules its own recovery. Worse, show-A's eventual
  // finally unconditionally clears the boolean — possibly while a
  // (later) show-B renewal is in flight, re-opening the overlapping-
  // renewal race the lock was meant to prevent.
  //
  // The fix is owner-token semantics: the lock holds a reference to the
  // effect token that acquired it, not just a boolean. Acquire stamps
  // the lock with THIS effect's token. Release in the finally clears
  // the lock ONLY if the current owner is the same token — a stale
  // aborted effect's finally is a no-op against the live owner.
  // Cleanup ALSO clears the lock if the unmounting effect owns it, so
  // the next mount can acquire cleanly.
  const renewalOwnerRef = useRef<{ aborted: boolean } | null>(null);
  // Codex round 3 HIGH — renewal-failure retry trigger. Set inside the
  // renewal `catch` when `await newSubscribed` rejects (the readiness
  // Promise rejects on CHANNEL_ERROR / TIMED_OUT / CLOSED). The status
  // callback that triggered the rejection ALSO calls renewSubscription,
  // but it returns at the single-flight lock because `renewalOwnerRef`
  // still owns this effect's token; the lock releases AFTER the status
  // that proved the channel failed has already been discarded. Without this flag, a
  // terminal failure status leaves `currentChannelRef` pointed at the
  // failed channel and the page receives no realtime invalidations until
  // a separate later event or a manual reload. The flag is read AFTER
  // the lock-releasing `finally` and triggers a bounded exponential-
  // backoff retry.
  const pendingRenewalRef = useRef<boolean>(false);
  // Exponential-backoff state for the pendingRenewalRef-driven retry.
  // The delay sequence is 250ms → 500ms → 1s → 2s → 5s (capped). Reset
  // to 0 on the first SUBSCRIBED status of a fresh channel so recovery
  // from a transient blip doesn't punish a healthy reconnect later.
  const renewalBackoffStepRef = useRef<number>(0);
  // Pending setTimeout handle for the backoff retry. Cleared in cleanup
  // step 3 so an unmount that happens during the backoff window doesn't
  // leak a renewSubscription call against a torn-down bridge.
  const pendingRenewalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      const result = await fetchCurrentVersion(slug);
      if (!isMountedRef.current) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      // Codex round-20 HIGH: auth-deny on the catch-up endpoint MUST
      // force a refresh so the Server Component auth chain re-runs
      // and routes the revoked viewer to the appropriate denial /
      // clear-session path. Pre-fix this branch returned null and
      // skipped refresh, leaving stale show data on screen for a
      // viewer whose session was revoked while disconnected.
      if (result.kind === "auth_denied") {
        console.warn(
          "[ShowRealtimeBridge] version endpoint returned auth_denied; forcing refresh to let the auth chain re-evaluate",
          { status: result.status },
        );
        router.refresh();
        return;
      }
      // Transient/server failure stays silent (fail-open posture):
      // a flaky network or 500 should not yank the page. The next
      // invalidation OR reconnect catch-up will retry.
      if (result.kind === "transient_failure") return;
      if (result.value !== renderVersionRef.current) {
        router.refresh();
      }
    },
    [slug, router],
  );

  useEffect(() => {
    isMountedRef.current = true;

    // === Codex round 4 HIGH — per-effect abort token ===
    // Generation comparison alone is ABA-vulnerable: between the moment
    // a renewal observes "readiness failed" and the finally block reads
    // currentChannelGenerationRef to schedule a retry, the effect can
    // be cleaned up (gen advances to N+1) AND re-created (a new effect
    // captures gen N+1 as its starting point). The OLD finally then
    // observes gen still equals N+1 and schedules a retry whose
    // setTimeout calls renewSubscription against the NEW effect's
    // slug/showId — corrupting the live subscription.
    //
    // The abort token is the canonical fix: each useEffect creates a
    // fresh `{ aborted: false }` object; cleanup sets `aborted = true`;
    // every async path that mutates refs / schedules work / calls
    // renewSubscription closes over THIS effect's token and bails on
    // `aborted`. No two effects share a token, so ABA is impossible.
    const effectToken: { aborted: boolean } = { aborted: false };

    const supabase = getSupabaseBrowserClient();

    // Renewal closure — captures `closureGen` at the time the previous
    // channel was opened so a late renewal can't race a newer
    // generation already in flight from a concurrent code path.
    const renewSubscription = async (priorClosureGen: number) => {
      // === Codex HIGH 3 / Round 5 HIGH — owner-token single-flight lock ===
      // Multiple CHANNEL_ERROR / TIMED_OUT / CLOSED / system.disconnected
      // callbacks can arrive in rapid succession with the SAME generation
      // BEFORE the first mint completes (the generation is not advanced
      // until AFTER mintSubscriberToken resolves). Without this gate, a
      // flaky network triggers overlapping JWT mints, repeated setAuth,
      // and channel create/remove thrash.
      //
      // Round 5: the lock is the per-effect token, not a boolean. Two
      // checks before acquire: (1) abort-token short-circuit so a stale
      // aborted effect never re-enters; (2) lock occupancy — if any
      // owner is currently holding the lock (this effect or a stale
      // one), bail. Then stamp the lock with THIS effect's token. The
      // finally below clears the lock ONLY when the current owner is
      // still THIS effect's token — preventing a stale aborted finally
      // from releasing the lock while a fresh effect's renewal is live.
      if (effectToken.aborted) return;
      if (renewalOwnerRef.current !== null) return;
      renewalOwnerRef.current = effectToken;
      try {
        if (effectToken.aborted) return;
        if (!isMountedRef.current) return;
        if (priorClosureGen !== currentChannelGenerationRef.current) return;

        const mintResult = await mintSubscriberToken(slug);
        if (effectToken.aborted) return;
        if (!isMountedRef.current) return;
        if (priorClosureGen !== currentChannelGenerationRef.current) return;

        if (mintResult.kind !== "ok") {
          // Codex round-20 HIGH: discriminate auth_denied (revoked
          // session — force refresh so the Server Component auth
          // chain re-evaluates and reroutes) from transient_failure
          // (network / 5xx — stay silent fail-open).
          if (mintResult.kind === "auth_denied") {
            console.warn(
              "[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: auth_denied — viewer session revoked; forcing refresh",
              { reason: "mint_auth_denied", status: mintResult.status },
            );
            router.refresh();
            return;
          }
          console.warn(
            "[ShowRealtimeBridge] SHOW_REALTIME_BROADCAST_AUTH_FAILED — JWT renewal mint failed; will retry via bounded backoff",
          );
          // Logging contract: the file-header doc (line ~82) promises a
          // `SHOW_REALTIME_JWT_RENEWED outcome: 'failed'` log on every
          // renewal-failure path. The `outcome:'success'` peer fires at
          // line ~298. Each failure branch emits the failed outcome with
          // a distinct `reason` tag so dashboards can disambiguate
          // mint-fail vs setAuth-fail vs subscribe-fail.
          console.warn("[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: failed", {
            reason: "mint_failed",
          });
          // Codex round-21 MEDIUM: a transient mint failure (5xx /
          // network) MUST set pendingRenewalRef so the existing
          // bounded backoff retry path runs. Pre-fix, the round-20
          // refactor returned without flagging the retry, leaving
          // the bridge stuck on the disconnected channel until a
          // manual refresh OR another status event. Wire it through:
          // the finally block at line ~539 reads pendingRenewalRef
          // to decide whether to schedule the next retry attempt.
          pendingRenewalRef.current = true;
          return;
        }
        const newJwt = mintResult.value;

        try {
          supabase.realtime.setAuth(newJwt);
        } catch (err) {
          console.warn(
            "[ShowRealtimeBridge] SHOW_REALTIME_BROADCAST_AUTH_FAILED — setAuth threw during renewal",
            err,
          );
          console.warn("[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: failed", {
            reason: "set_auth_threw",
            err,
          });
          // Codex round-24 MEDIUM: setAuth-throw on renewal must
          // schedule the bounded backoff retry. Pre-fix the
          // function returned with no retry, leaving the page
          // silent until a manual refresh or another status event
          // (e.g., crew member resumes laptop, mint succeeds, but
          // setAuth throws once on the cold socket — page
          // never recovers without intervention).
          pendingRenewalRef.current = true;
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
          // Codex round-24 MEDIUM: clear the ref after teardown so
          // a subscribe_threw branch below doesn't leave a stale
          // pointer to an already-removed channel.
          currentChannelRef.current = null;
        }
        if (effectToken.aborted) return;
        if (!isMountedRef.current) return;
        if (newClosureGen !== currentChannelGenerationRef.current) return;

        let newChannel: ShowInvalidationChannel | null = null;
        let newSubscribed: Promise<void> | null = null;
        try {
          const result = subscribeToShow(
            supabase,
            showId,
            newJwt,
            (token) => {
              if (!isMountedRef.current) return;
              if (newClosureGen !== currentChannelGenerationRef.current) return;
              // Codex round-18 HIGH: do NOT optimistically advance
              // `renderVersionRef` here. The original rationale ("subsequent
              // catch-ups don't re-fire on this same token") was wrong on
              // two counts: (a) duplicate `router.refresh()` calls are
              // idempotent so re-firing was never a problem; (b) advancing
              // the ref here causes a disconnect-during-debounce race —
              // if the socket disconnects before the 100ms timer fires,
              // the renewal advances the channel generation, the debounce
              // bails on the gen check, and the renewal catch-up then
              // sees `currentToken === renderVersionRef.current` (because
              // we already advanced it) and skips refresh. Net result: a
              // received invalidation is silently lost. The fix is to let
              // the ref reflect ONLY the last SSR-rendered prop (synced
              // by the commit-phase effect above).
              void token;
              scheduleDebouncedRefresh();
            },
            (status) => handleStatusCallback(status, newClosureGen),
          );
          newChannel = result.channel;
          newSubscribed = result.subscribed;
        } catch (err) {
          console.warn("[ShowRealtimeBridge] subscription failed during renewal", err);
          console.warn("[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: failed", {
            reason: "subscribe_threw",
            err,
          });
          // Codex round-24 MEDIUM: subscribe-throw on renewal must
          // schedule the bounded backoff retry. Pre-fix this branch
          // returned silent — the old channel was already removed
          // (currentChannelRef cleared above) and the new channel
          // never opened, so the page received no further events
          // until a manual refresh.
          pendingRenewalRef.current = true;
          return;
        }
        currentChannelRef.current = newChannel;
        attachSystemHandler(newChannel, (e) => handleSystemEvent(e, newClosureGen));

        // (e) AFTER the underlying socket reports SUBSCRIBED, run the
        // version catch-up. Codex round 2 HIGH: the readiness Promise
        // now REJECTS on CHANNEL_ERROR / TIMED_OUT / CLOSED. On
        // rejection, do NOT log success and do NOT run catch-up.
        // Codex round 3 HIGH: also set `pendingRenewalRef` and tear
        // down the failed channel here. The synchronous status
        // callback for the same failure already tried to call
        // renewSubscription and returned at the single-flight lock;
        // without `pendingRenewalRef` the failed channel would be
        // stranded as `currentChannelRef` and the page would receive
        // no realtime invalidations until a later natural event.
        let readinessOk = false;
        try {
          await newSubscribed;
          readinessOk = true;
        } catch (err) {
          console.warn("[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: failed", {
            reason: "readiness_failed",
            err,
          });
          // Tear down the failed channel: a future renewal must create
          // a fresh handle, not reuse this one. Generation was already
          // advanced when we opened this channel, so the synchronous
          // CLOSED that removeChannel may emit short-circuits.
          const failedChannel = currentChannelRef.current;
          currentChannelRef.current = null;
          if (failedChannel !== null) {
            try {
              await removeChannel(supabase, failedChannel);
            } catch (teardownErr) {
              // Teardown errors are not actionable client-side.
              void teardownErr;
            }
          }
          // Codex round 4 HIGH — only flag a retry if THIS effect is
          // still the live one. If cleanup ran while removeChannel was
          // resolving, setting pendingRenewalRef would leak across into
          // the new effect's finally schedule, and the retry's
          // setTimeout would fire renewSubscription against the new
          // effect's slug/showId. The abort token is the per-effect
          // owner check that generation comparison alone cannot provide
          // (generation comparison is ABA-vulnerable across cleanup +
          // remount with a different slug).
          if (!effectToken.aborted) {
            pendingRenewalRef.current = true;
          }
        }
        if (effectToken.aborted) return;
        if (!isMountedRef.current) return;
        if (newClosureGen !== currentChannelGenerationRef.current) return;
        if (!readinessOk) return;
        await refreshSyncIfMismatch(newClosureGen);

        // (f) Renewal succeeded — log success. Only fires on the
        // SUBSCRIBED-readiness path; failure path returned above without
        // logging success.
        console.info("[ShowRealtimeBridge] SHOW_REALTIME_JWT_RENEWED outcome: success");
        // Reset backoff on a clean subscribe so a transient blip
        // doesn't poison the next legitimate failure-recovery sequence.
        renewalBackoffStepRef.current = 0;
      } finally {
        // Codex HIGH 3 / Round 5 HIGH — release the owner-token lock on
        // EVERY exit path (success AND every failure branch above that
        // returned early), but ONLY if the current owner is still THIS
        // effect's token. If a stale aborted effect's finally runs after
        // the live effect already acquired the lock, this guard makes
        // the stale release a no-op — preserving the live effect's
        // single-flight protection.
        if (renewalOwnerRef.current === effectToken) {
          renewalOwnerRef.current = null;
        }
        // Codex round 3 HIGH — drain the renewal-pending flag now that
        // the lock has been released. If the catch path above (or any
        // earlier failure branch) flagged a retry-needed state, schedule
        // a bounded exponential-backoff renewal: 250ms → 500ms → 1s →
        // 2s → 5s (capped). The retry honors isMountedRef and the
        // current generation, and its setTimeout handle is tracked so
        // unmount cleanup can clear it.
        // Codex round 4 HIGH — gate the retry-schedule on the abort
        // token BEFORE reading any refs. If this effect was cleaned up
        // while the renewal was in-flight, we MUST NOT mutate
        // pendingRenewalRef, the timer ref, or the backoff step ref —
        // they belong to whichever effect is currently live (which
        // could be a different one if React remounted with a new
        // slug/showId). A late stale renewal whose effect was already
        // torn down exits cleanly here.
        if (!effectToken.aborted && pendingRenewalRef.current && isMountedRef.current) {
          pendingRenewalRef.current = false;
          const step = renewalBackoffStepRef.current;
          // Capped exponential backoff. Step 0..4 → 250/500/1000/2000/5000ms;
          // step >= 4 stays at 5s.
          const backoffSchedule = [250, 500, 1000, 2000, 5000];
          const delay = backoffSchedule[Math.min(step, backoffSchedule.length - 1)];
          renewalBackoffStepRef.current = step + 1;
          // Capture the live generation at schedule time so a cleanup or
          // a concurrent renewal that advances the generation invalidates
          // this retry at fire time.
          const retryGen = currentChannelGenerationRef.current;
          if (pendingRenewalTimerRef.current !== null) {
            clearTimeout(pendingRenewalTimerRef.current);
          }
          pendingRenewalTimerRef.current = setTimeout(() => {
            pendingRenewalTimerRef.current = null;
            // Belt-and-suspenders: the timer's callback re-checks the
            // abort token AND the generation at fire time. Either fence
            // alone would suffice today, but layering them keeps the
            // retry safe against a later refactor that drops one.
            if (effectToken.aborted) return;
            if (!isMountedRef.current) return;
            if (retryGen !== currentChannelGenerationRef.current) return;
            void renewSubscription(retryGen);
          }, delay);
        }
      }
    };

    const handleSystemEvent = (e: SystemEvent, closureGen: number) => {
      if (effectToken.aborted) return;
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
          console.warn("[ShowRealtimeBridge] unknown system event", unknownEvent);
          return;
        }
      }
    };

    const handleStatusCallback = (status: string, closureGen: number) => {
      if (effectToken.aborted) return;
      if (!isMountedRef.current) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      // CHANNEL_ERROR / TIMED_OUT / CLOSED → renewal sequence.
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        void renewSubscription(closureGen);
      }
      // SUBSCRIBED is the success path; the post-subscribe catch-up is
      // run inline below after the initial subscribeToShow resolves.
    };

    // === Initial mount: mint JWT then subscribe ===
    let initialAborted = false;
    (async () => {
      const initialMintResult = await mintSubscriberToken(slug);
      if (effectToken.aborted) return;
      if (!isMountedRef.current || initialAborted) return;
      // Codex round-20 HIGH discrimination: at INITIAL mount we keep
      // the fail-open posture for both auth_denied AND
      // transient_failure. Reasoning: in M4 the documented contract
      // (apply-driven-refresh.spec.ts:38-49) is that the route's
      // picker gate returns 401 because real cookie auth
      // ships in M5; forcing refresh on initial-mount auth_denied
      // would create a render→mint→refresh→render→mint loop. The
      // Server Component already authorized the page render, so we
      // trust SSR's auth decision at mount and only escalate
      // auth_denied responses on RENEWAL (where it definitionally
      // means "viewer was revoked since the page rendered").
      if (initialMintResult.kind !== "ok") {
        const reason =
          initialMintResult.kind === "auth_denied"
            ? `mint_auth_denied_${initialMintResult.status}`
            : "mint_transient";
        console.warn(
          "[ShowRealtimeBridge] subscription failed: initial JWT mint returned no token; falling back to no-op (no retry loop)",
          { reason },
        );
        return;
      }
      const jwt = initialMintResult.value;

      try {
        supabase.realtime.setAuth(jwt);
      } catch (err) {
        console.warn("[ShowRealtimeBridge] subscription failed: setAuth threw", err);
        return;
      }

      const closureGen = currentChannelGenerationRef.current;
      let channel: ShowInvalidationChannel | null = null;
      let subscribedPromise: Promise<void> | null = null;
      try {
        const result = subscribeToShow(
          supabase,
          showId,
          jwt,
          (token) => {
            if (!isMountedRef.current) return;
            if (closureGen !== currentChannelGenerationRef.current) return;
            // Codex round-18 HIGH: see the renewal-side invalidate
            // callback above for the rationale. Do NOT advance
            // `renderVersionRef` here — it must reflect ONLY the last
            // SSR-rendered prop (commit-phase effect handles that),
            // otherwise a disconnect-during-debounce silently loses
            // the invalidation when the renewal catch-up runs.
            void token;
            scheduleDebouncedRefresh();
          },
          (status) => handleStatusCallback(status, closureGen),
        );
        channel = result.channel;
        subscribedPromise = result.subscribed;
      } catch (err) {
        // Single failed subscribe does NOT loop. Bounded-backoff retry
        // is a v2 enhancement; v1 fails open.
        console.warn("[ShowRealtimeBridge] subscription failed", err);
        return;
      }
      currentChannelRef.current = channel;
      attachSystemHandler(channel, (e) => handleSystemEvent(e, closureGen));

      // Post-subscribe catch-up: GATE on the readiness Promise so the
      // catch-up does not run before Realtime accepts the subscription.
      // Codex round 2 HIGH: readiness Promise REJECTS on CHANNEL_ERROR /
      // TIMED_OUT / CLOSED. On rejection, do NOT run the catch-up — the
      // status callback that drove the rejection has already kicked off
      // (or will kick off) a renewal via handleStatusCallback. Without
      // this guard the bridge would refreshSyncIfMismatch against an
      // unjoined channel and silently mask a stuck-stale page until a
      // later natural status event.
      let readinessOk = false;
      try {
        await subscribedPromise;
        readinessOk = true;
      } catch (err) {
        console.warn("[ShowRealtimeBridge] subscription readiness failed", err);
      }
      if (effectToken.aborted) return;
      if (!isMountedRef.current || initialAborted) return;
      if (closureGen !== currentChannelGenerationRef.current) return;
      if (!readinessOk) return;
      // Reset the renewal backoff once the initial subscribe reaches
      // SUBSCRIBED — the channel is healthy, so any future failure
      // should retry from the smallest delay.
      renewalBackoffStepRef.current = 0;
      await refreshSyncIfMismatch(closureGen);
    })();

    return () => {
      // === Cleanup contract — strict 4-step order ===
      // 1. Mark unmounted (every async guard reads this).
      isMountedRef.current = false;
      initialAborted = true;
      // Codex round 4 HIGH — abort the per-effect token so any
      // in-flight async path that resumes AFTER cleanup observes
      // `aborted = true` and bails before mutating refs that now
      // belong to whichever effect React mounted next. The token is
      // captured by every closure created inside this useEffect, so a
      // late finally / setTimeout / status callback from THIS effect
      // can never poison the new effect's state — even when generation
      // counters happen to align (the ABA case Codex round 4 flagged).
      effectToken.aborted = true;
      // 2. Advance generation BEFORE removeChannel so a synchronous
      //    CLOSED callback inside step 4 captures a stale gen.
      currentChannelGenerationRef.current += 1;
      // 3. Cancel any pending debounced refresh AND any pending
      //    renewal-backoff retry (Codex round 3 HIGH). Clearing the
      //    renewal timer here ensures an unmount during the backoff
      //    window doesn't fire renewSubscription against a torn-down
      //    bridge. We also drop the pendingRenewalRef flag so a late
      //    finally that races cleanup can't requeue another retry.
      if (pendingRefreshTimer.current !== null) {
        clearTimeout(pendingRefreshTimer.current);
        pendingRefreshTimer.current = null;
      }
      if (pendingRenewalTimerRef.current !== null) {
        clearTimeout(pendingRenewalTimerRef.current);
        pendingRenewalTimerRef.current = null;
      }
      pendingRenewalRef.current = false;
      // Round 5 HIGH — release the owner-token lock if THIS effect owns
      // it. Without this, an unmount mid-renewal leaves the lock
      // pointing at the (now-aborted) effect's token; the next effect's
      // renewSubscription would still bail at the occupancy check
      // because `renewalOwnerRef.current !== null`, even though the
      // owner is a dead token. The stale renewal's finally would
      // ALSO no-op (its `=== effectToken` check still matches the
      // dead token, so it would clear) — but waiting on a stale
      // finally that may never run (e.g., if the stale path returned
      // before reaching the finally) leaves the new effect stuck.
      // Clearing here unconditionally for the cleaning-up effect
      // resolves that ambiguity.
      if (renewalOwnerRef.current === effectToken) {
        renewalOwnerRef.current = null;
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
    // bridge cleanly. `router` is a stable App Router instance from
    // `useRouter()` but is referenced directly inside the effect (the
    // auth-deny refresh fast paths), so exhaustive-deps requires it.
  }, [showId, slug, scheduleDebouncedRefresh, refreshSyncIfMismatch, router]);

  return null;
}
