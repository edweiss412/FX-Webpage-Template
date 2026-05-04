/**
 * lib/realtime/showRealtimeChannelHandlers.ts (M4 Task 4.16 Checkpoint B)
 *
 * Tiny adapter layer that lets `<ShowRealtimeBridge>` attach `system` and
 * subscribe-status callbacks to a Realtime channel and tear the channel
 * down without exposing the raw Supabase Realtime API surface to the
 * bridge — AND lets unit tests substitute the same shape with a
 * hand-rolled fake (the test mocks this module wholesale, so the
 * exported function shapes here ARE the contract).
 *
 * Why an adapter?
 *
 *   The bridge needs to:
 *     1. React to `system` events (`reconnected` / `disconnected`) AFTER
 *        the channel is open.
 *     2. React to subscribe-status callbacks (`SUBSCRIBED`,
 *        `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`) at subscribe time.
 *     3. Tear down the channel via `removeChannel`.
 *
 *   Centralizing those binding mechanics here keeps the bridge focused on
 *   debounce / generation / version-catch-up logic, and lets the test
 *   double provide simple `onSystemHandlers` / `onStatusHandlers` arrays.
 *
 * The adapter takes the Supabase client as a parameter to `removeChannel`
 * so the function stays pure (no module-level state); the bridge threads
 * its singleton client through.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ShowInvalidationChannel } from "./subscribeToShow";

/**
 * The `system` events the bridge handles. Narrowed to a discriminated
 * union so the consumer's switch is exhaustive — if Supabase Realtime
 * adds a new system event in a future release, the consumer's `default`
 * branch logs a warning rather than silently dropping it (the previous
 * `{ event: string }` shape made the silent-drop indistinguishable from
 * "we deliberately ignored this").
 *
 * Cast through `unknown as SystemEvent` at the call site if Supabase
 * delivers something the union doesn't enumerate at runtime — the
 * consumer's `default` branch is the runtime fence; this type is the
 * compile-time fence.
 */
export type SystemEvent =
  | { event: "reconnected" }
  | { event: "disconnected" };

/**
 * Attach a `system`-event handler to the channel. Reconnect / disconnect
 * notifications arrive through this callback.
 *
 * Why the cast?
 *   `RealtimeChannel.on()` has many overloads, one per event type
 *   (`"presence"`, `"postgres_changes"`, `"broadcast"`, `"system"`, …),
 *   each with a strictly-typed filter object. Targeting the `"system"`
 *   overload directly through `RealtimeChannel`'s own typings would
 *   require importing the internal `RealtimeChannelSendResponse` /
 *   `REALTIME_LISTEN_TYPES` types from `@supabase/realtime-js`, which
 *   are not part of `@supabase/supabase-js`'s public surface and
 *   change between minor releases. We cast to the minimal local shape
 *   (one specific overload: `(type='system', filter={}, cb)`) — the
 *   integration test in tests/realtime/subscribeToShow.test.ts pins
 *   the runtime shape, and tests/realtime/showRealtimeBridge.test.tsx
 *   pins the bridge's call sites.
 */
export function attachSystemHandler(
  channel: ShowInvalidationChannel,
  handler: (e: SystemEvent) => void,
): void {
  // Targeted overload: `.on('system', {}, handler)`. Empty filter is the
  // documented Supabase Realtime convention for catch-all on the `system`
  // event channel; see https://supabase.com/docs/reference/javascript/subscribe.
  (channel as unknown as {
    on: (
      type: "system",
      filter: Record<string, never>,
      cb: (e: SystemEvent) => void,
    ) => void;
  }).on("system", {}, handler);
}

/**
 * Attach a subscribe-status callback. Supabase Realtime calls this with a
 * status string (`SUBSCRIBED`, `CHANNEL_ERROR`, `TIMED_OUT`, `CLOSED`)
 * once the underlying socket transitions. The bridge relies on this for
 * the post-subscribe version-catch-up trigger AND for the renewal flow
 * on non-success statuses.
 *
 * The Supabase Realtime API binds a status callback by calling
 * `channel.subscribe(handler)`. Calling `.subscribe` a second time on
 * an already-subscribed channel updates its status-callback binding
 * (the channel does not re-open).
 */
export function attachStatusHandler(
  channel: ShowInvalidationChannel,
  handler: (status: string) => void,
): void {
  // Targeted overload: `.subscribe(callback)` — the single-argument form
  // re-binds the status callback on an already-subscribed channel without
  // re-opening the socket. The other overload `.subscribe()` (no args)
  // returns a Promise; we don't use that one. See `@supabase/realtime-js`
  // `RealtimeChannel.subscribe` for both signatures.
  (channel as unknown as {
    subscribe: (cb: (status: string) => void) => unknown;
  }).subscribe(handler);
}

/**
 * Tear down a channel via the Supabase client. Returns the underlying
 * promise so the bridge can await teardown when ordering matters.
 *
 * The function takes the client as a parameter (not a module-level
 * singleton) so the bridge stays trivially testable and so a future
 * caller from a different surface can supply its own client without
 * coupling to lib/supabase/browser.ts.
 */
export function removeChannel(
  client: SupabaseClient,
  channel: ShowInvalidationChannel,
): Promise<"ok" | "timed out" | "error"> {
  return client.removeChannel(channel);
}
