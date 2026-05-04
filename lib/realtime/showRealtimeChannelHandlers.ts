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

export type SystemEvent = { event: string };

/**
 * Attach a `system`-event handler to the channel. Reconnect / disconnect
 * notifications arrive through this callback.
 */
export function attachSystemHandler(
  channel: ShowInvalidationChannel,
  handler: (e: SystemEvent) => void,
): void {
  // The Supabase Realtime channel `.on('system', {}, handler)` overload —
  // empty filter object is the convention for catch-all.
  (channel as unknown as {
    on: (
      type: string,
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
