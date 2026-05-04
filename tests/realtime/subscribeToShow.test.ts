/**
 * tests/realtime/subscribeToShow.test.ts (M4 Task 4.16 lib)
 *
 * Asserts lib/realtime/subscribeToShow.ts wires up a Supabase Realtime
 * Broadcast channel correctly:
 *
 *   - Calls supabase.realtime.setAuth(jwt) before opening the channel, so
 *     the JWT minted by /api/realtime/subscriber-token is the one Realtime
 *     authenticates the subscription against.
 *   - Opens a channel named `show:<showId>:invalidation`.
 *   - Configures the channel with broadcast.self = false (so a publisher
 *     does not receive their own events — no relevance to our use-case but
 *     a self-fence prevents echo loops).
 *   - Listens for `event: 'invalidate'` payloads and invokes onInvalidate
 *     with payload.version_token.
 *   - Returns the channel handle for later removeChannel cleanup.
 */
import { describe, expect, test } from "vitest";
import { subscribeToShow } from "@/lib/realtime/subscribeToShow";

function makeFakeSupabase() {
  const setAuthCalls: string[] = [];
  const channelCalls: Array<{ name: string; config: unknown }> = [];
  const onCalls: Array<{
    event: string;
    config: { event: string };
  }> = [];
  let registeredHandler:
    | ((msg: {
        event: string;
        payload: { show_id?: string; version_token: string };
      }) => void)
    | null = null;
  let subscribed = false;

  const channelHandle = {
    on(
      event: string,
      config: { event: string },
      handler: (msg: {
        event: string;
        payload: { show_id?: string; version_token: string };
      }) => void,
    ) {
      onCalls.push({ event, config });
      registeredHandler = handler;
      return channelHandle;
    },
    subscribe() {
      subscribed = true;
      return channelHandle;
    },
  };

  const supabase = {
    realtime: {
      setAuth: (jwt: string) => {
        setAuthCalls.push(jwt);
      },
    },
    channel: (name: string, config: unknown) => {
      channelCalls.push({ name, config });
      return channelHandle;
    },
  };

  return {
    supabase,
    state: { setAuthCalls, channelCalls, onCalls },
    fire: (msg: {
      event: string;
      payload: { show_id?: string; version_token: string };
    }) => {
      if (!registeredHandler) throw new Error("no handler registered");
      registeredHandler(msg);
    },
    subscribed: () => subscribed,
    handle: channelHandle,
  };
}

describe("subscribeToShow", () => {
  test("calls realtime.setAuth(jwt) before opening the channel", () => {
    const fake = makeFakeSupabase();
    subscribeToShow(
      fake.supabase as unknown as Parameters<typeof subscribeToShow>[0],
      "show-uuid-1",
      "fake.jwt.value",
      () => {},
    );
    expect(fake.state.setAuthCalls).toEqual(["fake.jwt.value"]);
  });

  test("opens channel `show:<id>:invalidation` with broadcast.self = false", () => {
    const fake = makeFakeSupabase();
    subscribeToShow(
      fake.supabase as unknown as Parameters<typeof subscribeToShow>[0],
      "show-uuid-1",
      "fake.jwt.value",
      () => {},
    );
    expect(fake.state.channelCalls).toHaveLength(1);
    expect(fake.state.channelCalls[0]?.name).toBe("show:show-uuid-1:invalidation");
    const cfg = fake.state.channelCalls[0]?.config as {
      config?: { broadcast?: { self?: boolean } };
    };
    expect(cfg?.config?.broadcast?.self).toBe(false);
  });

  test("registers a 'broadcast' listener for event 'invalidate'", () => {
    const fake = makeFakeSupabase();
    subscribeToShow(
      fake.supabase as unknown as Parameters<typeof subscribeToShow>[0],
      "show-uuid-1",
      "fake.jwt.value",
      () => {},
    );
    expect(fake.state.onCalls).toHaveLength(1);
    expect(fake.state.onCalls[0]?.event).toBe("broadcast");
    expect(fake.state.onCalls[0]?.config.event).toBe("invalidate");
  });

  test("fires onInvalidate with payload.version_token when an invalidate event arrives WITH MATCHING show_id (positive control)", () => {
    // Positive control for the payload.show_id guard added per plan §827.
    // Payloads with the matching show_id MUST trigger onInvalidate.
    const fake = makeFakeSupabase();
    const seenTokens: string[] = [];
    subscribeToShow(
      fake.supabase as unknown as Parameters<typeof subscribeToShow>[0],
      "show-uuid-1",
      "fake.jwt.value",
      (token) => {
        seenTokens.push(token);
      },
    );
    fake.fire({
      event: "invalidate",
      payload: { show_id: "show-uuid-1", version_token: "TOKEN-A" },
    });
    fake.fire({
      event: "invalidate",
      payload: { show_id: "show-uuid-1", version_token: "TOKEN-B" },
    });
    expect(seenTokens).toEqual(["TOKEN-A", "TOKEN-B"]);
  });

  test("does NOT fire onInvalidate when payload.show_id does not match the subscribed show (negative control — defense in depth against misrouted broadcasts)", () => {
    // Per plan §827: even if a misrouted broadcast or a future server bug
    // delivers a payload to this channel that carries a DIFFERENT show_id,
    // the helper MUST NOT trigger onInvalidate. Otherwise the bridge would
    // call router.refresh() against the wrong show and version tokens
    // could leak across shows.
    //
    // This is the failure mode HIGH 3 of the spec-compliance review
    // pinned: an unguarded handler fires for any invalidate event,
    // regardless of payload.show_id. This test fails on the unguarded
    // implementation and passes on the guarded one.
    const fake = makeFakeSupabase();
    const seenTokens: string[] = [];
    subscribeToShow(
      fake.supabase as unknown as Parameters<typeof subscribeToShow>[0],
      "show-uuid-1",
      "fake.jwt.value",
      (token) => {
        seenTokens.push(token);
      },
    );
    // Mismatched show_id — must be ignored.
    fake.fire({
      event: "invalidate",
      payload: { show_id: "different-show-uuid", version_token: "TOKEN-X" },
    });
    // Missing show_id — also must be ignored (strict equality, no falsy
    // branch that would pass through).
    fake.fire({
      event: "invalidate",
      payload: { version_token: "TOKEN-Y" },
    });
    expect(seenTokens).toEqual([]);
  });

  test("returns the channel handle for caller cleanup via removeChannel", () => {
    const fake = makeFakeSupabase();
    const handle = subscribeToShow(
      fake.supabase as unknown as Parameters<typeof subscribeToShow>[0],
      "show-uuid-1",
      "fake.jwt.value",
      () => {},
    );
    expect(handle).toBe(fake.handle);
  });
});
