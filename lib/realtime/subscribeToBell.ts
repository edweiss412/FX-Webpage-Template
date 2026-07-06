/**
 * lib/realtime/subscribeToBell.ts (bell notification center Task 12)
 *
 * Sibling of lib/realtime/subscribeToShow.ts, wired to the admin-only
 * `admin:alerts` private Broadcast channel (spec §5) instead of a per-show
 * invalidation topic. NOT a client component itself — 'use client' is
 * intentionally absent so the helper stays node-testable (mirrors
 * subscribeToShow's DI shape: the caller injects the Supabase client rather
 * than reading a module-level browser singleton).
 *
 * The matching server-side publisher is
 * public.publish_admin_alerts_bell_ping() (supabase/migrations/
 * 20260705100002_bell_realtime.sql), a statement trigger on admin_alerts
 * insert/update that emits a CONTENTLESS `'{}'::jsonb` payload on event
 * 'changed' — realtime here is an invalidation ping, never a data carrier
 * (the identity sanitizer chokepoint in lib/admin/bellFeed stays the sole
 * owner of what reaches the browser). Because the payload carries no
 * fields, there is no payload guard to apply (unlike subscribeToShow's
 * show_id fence) — ANY 'changed' broadcast triggers onChanged().
 *
 * Deviations from subscribeToShow:
 *   - Topic is the fixed `admin:alerts` (no showId scoping — the bell is a
 *     single global admin surface, not per-show).
 *   - onChanged takes no arguments (contentless ping).
 *
 * Shared structure with subscribeToShow (mirrored deliberately):
 *   1. supabase.realtime.setAuth(jwt) before opening the channel.
 *   2. Channel opened as PRIVATE (`config: { private: true, broadcast:
 *      { self: false } }`) — Realtime Authorization (RLS on
 *      realtime.messages) only protects private channels; the matching
 *      policy is fxav_admin_bell_subscriber_select (same migration),
 *      gated on viewer_kind = 'admin' from the JWT minted by
 *      /api/admin/alerts/bell/token.
 *   3. .subscribe(statusCallback) resolves `subscribed` on the FIRST
 *      'SUBSCRIBED' status and rejects with a BellSubscribeReadinessError
 *      on the first 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' — settles at
 *      most once. Every status (including ones after settlement) is also
 *      forwarded to the optional `onStatus` callback, which is the
 *      caller's signal to drive reconnect logic.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type BellChannel = ReturnType<SupabaseClient["channel"]>;

/** Rejection error for the `subscribed` readiness Promise. Mirrors
 * subscribeToShow's SubscribeReadinessError (kept as a distinct class here
 * so the two topics' failure types never get confused if both modules are
 * imported side by side). */
export class BellSubscribeReadinessError extends Error {
  readonly status: "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";
  constructor(status: "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED") {
    super(`subscribeToBell readiness failed: first status was '${status}' (expected 'SUBSCRIBED')`);
    this.name = "BellSubscribeReadinessError";
    this.status = status;
  }
}

export type SubscribeToBellResult = {
  channel: BellChannel;
  subscribed: Promise<void>;
};

export function subscribeToBell(
  supabase: SupabaseClient,
  jwt: string,
  onChanged: () => void,
  onStatus?: (status: string) => void,
): SubscribeToBellResult {
  // (1) JWT must be set before .channel() is called — Realtime authenticates
  // the subscription with the most-recently-set auth token at subscribe time.
  supabase.realtime.setAuth(jwt);

  // (2) Open the fixed admin:alerts channel as PRIVATE. See file header for
  // why `private: true` is mandatory (Realtime Authorization only fences
  // private channels) and why `broadcast.self = false` is defense-in-depth.
  const channel = supabase.channel("admin:alerts", {
    config: { private: true, broadcast: { self: false } },
  });

  // (3) Contentless ping: any 'changed' broadcast triggers onChanged(). No
  // payload guard is needed (unlike subscribeToShow's show_id fence) because
  // the publisher emits '{}'::jsonb — there is no field to misroute on.
  channel.on("broadcast", { event: "changed" }, () => {
    onChanged();
  });

  // (4) Readiness Promise: resolves ONLY on 'SUBSCRIBED', rejects on
  // 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED', settles at most once. Later
  // transitions are delivered only through the optional `onStatus` callback.
  let resolveSubscribed: () => void = () => {};
  let rejectSubscribed: (err: BellSubscribeReadinessError) => void = () => {};
  const subscribed = new Promise<void>((resolve, reject) => {
    resolveSubscribed = resolve;
    rejectSubscribed = reject;
  });
  // Defang unhandled-rejection warnings for callers that don't await.
  subscribed.catch(() => {});
  let settled = false;

  channel.subscribe((status: string) => {
    if (!settled) {
      if (status === "SUBSCRIBED") {
        settled = true;
        resolveSubscribed();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        settled = true;
        rejectSubscribed(new BellSubscribeReadinessError(status));
      }
    }
    if (onStatus) {
      onStatus(status);
    }
  });

  return { channel, subscribed };
}
