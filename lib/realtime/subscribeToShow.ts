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
 *   3. Listens for event === 'invalidate' broadcasts and — only when
 *      payload.show_id matches the subscribed showId — forwards
 *      payload.version_token to onInvalidate. The payload guard is a
 *      defense-in-depth fence per plan §827: the channel name already
 *      includes the show id, but a misrouted broadcast or a future server
 *      bug that publishes to the wrong topic would otherwise trigger a
 *      spurious router.refresh() on the wrong show. The guard makes the
 *      helper inert against misrouted messages.
 *   4. .subscribe()s and returns the channel handle so the caller can call
 *      supabase.removeChannel(handle) on cleanup.
 *
 * onInvalidate is invoked with the raw version_token string. The caller
 * (Checkpoint B `<ShowRealtimeBridge>`) is responsible for comparing it to
 * the snapshot's token and triggering router.refresh() on mismatch.
 *
 * Param order rationale (plan §827 specifies `(showId, jwt, onInvalidate)`
 * — three params; this implementation uses four with `supabase` first):
 *   The supabase client is injected as the first parameter rather than
 *   read from a module-level browser singleton so the helper is trivially
 *   testable from a node-environment Vitest run — the test fakes the
 *   client shape inline (see tests/realtime/subscribeToShow.test.ts).
 *   The Checkpoint B `<ShowRealtimeBridge>` constructs the browser client
 *   via @supabase/ssr's createBrowserClient and threads it in. This DI
 *   shape is a deliberate deviation from the plan's three-arg signature;
 *   keep it documented here so a future reviewer doesn't re-flag it as a
 *   spec drift.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ShowInvalidationChannel = ReturnType<SupabaseClient["channel"]>;

/**
 * Shape of the `invalidate` broadcast payload emitted by both server-side
 * publishers (the statement triggers in
 * supabase/migrations/20260501001000_internal_and_admin.sql:58-104 and the
 * explicit helper in 20260503000000_publish_show_invalidation_helper.sql).
 *
 * Exported so test fakes (and any future consumer that needs to construct or
 * narrow these payloads) can import a single type rather than redeclaring
 * the same literal — the inline redeclaration was a Minor finding from the
 * Task 4.16 Checkpoint A code-quality review.
 *
 * `show_id` is optional in the type because the runtime guard at line ~92
 * defends against payloads that omit it (a misrouted broadcast or a future
 * publisher bug); narrowing here would defeat the negative-control test
 * that fires `{ payload: { version_token } }` (no show_id) and asserts the
 * handler ignores it.
 */
export type InvalidatePayload = { show_id?: string; version_token: string };

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
  // the server might add to the same channel. The payload.show_id guard
  // is the defense-in-depth fence required by plan §827: a misrouted
  // broadcast (or a future publisher bug) that lands on this channel but
  // carries a different show_id MUST NOT trigger onInvalidate, since the
  // bridge would then issue a router.refresh() on the wrong show and
  // potentially leak version tokens across shows.
  channel
    .on(
      "broadcast",
      { event: "invalidate" },
      (msg: { event: string; payload: InvalidatePayload }) => {
        if (msg.payload?.show_id !== showId) {
          return;
        }
        const token = msg.payload?.version_token;
        if (typeof token === "string") {
          onInvalidate(token);
        }
      },
    )
    .subscribe();

  return channel;
}
