/**
 * lib/realtime/subscribeToShow.ts (M4 Task 4.16 lib — Broadcast subscriber)
 *
 * Pure helper consumed by the Checkpoint B `<ShowRealtimeBridge>` client
 * island. NOT a client component itself ('use client' is intentionally
 * absent so the helper can also be imported by a Vitest unit test running
 * in the node environment).
 *
 * Wires a Supabase Realtime Broadcast subscription to the channel
 * `show:<showId>:invalidation`. The matching server-side publishers are:
 *
 *   - public.publish_show_invalidation_after_statement() statement triggers
 *     on crew_member_auth + crew_members
 *     (supabase/migrations/20260501001000_internal_and_admin.sql:58-104).
 *   - public.publish_show_invalidation(uuid) explicit application helper
 *     (supabase/migrations/20260503000000_publish_show_invalidation_helper.sql)
 *     wrapped by lib/realtime/showInvalidation.ts.
 *
 * Both publishers emit a JSON envelope with shape:
 *   { topic: 'show:<id>:invalidation', event: 'invalidate',
 *     payload: { show_id: <id>, version_token: <text> } }
 *
 * The helper:
 *   1. Calls supabase.realtime.setAuth(jwt) — required for Realtime
 *      Authorization on private channels. The JWT is minted by
 *      /api/realtime/subscriber-token after a 5-arm resolveShowViewer pass.
 *   2. Opens the channel with `broadcast: { self: false }` so a publisher
 *      that also subscribes (not our case, but defense-in-depth) doesn't
 *      echo its own events back to itself.
 *   3. Listens for event === 'invalidate' broadcasts and forwards
 *      payload.version_token to onInvalidate.
 *   4. .subscribe()s and returns the channel handle so the caller can call
 *      supabase.removeChannel(handle) on cleanup.
 *
 * onInvalidate is invoked with the raw version_token string. The caller
 * (Checkpoint B `<ShowRealtimeBridge>`) is responsible for comparing it to
 * the snapshot's token and triggering router.refresh() on mismatch.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ShowInvalidationChannel = ReturnType<SupabaseClient["channel"]>;

export function subscribeToShow(
  supabase: SupabaseClient,
  showId: string,
  jwt: string,
  onInvalidate: (versionToken: string) => void,
): ShowInvalidationChannel {
  // (1) JWT must be set before .channel() is called — Realtime authenticates
  // the subscription with the most-recently-set auth token at subscribe time.
  supabase.realtime.setAuth(jwt);

  // (2) Open the per-show invalidation channel.
  const channel = supabase.channel(`show:${showId}:invalidation`, {
    config: { broadcast: { self: false } },
  });

  // (3) Forward invalidate events to the caller's callback. The narrow
  // `event: 'invalidate'` filter ensures we ignore any future event types
  // the server might add to the same channel.
  channel
    .on(
      "broadcast",
      { event: "invalidate" },
      (msg: { event: string; payload: { version_token: string } }) => {
        const token = msg.payload?.version_token;
        if (typeof token === "string") {
          onInvalidate(token);
        }
      },
    )
    .subscribe();

  return channel;
}
