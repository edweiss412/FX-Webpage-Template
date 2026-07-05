/**
 * tests/realtime/subscribeToBell.test.ts (bell notification center Task 12)
 *
 * Cloned from tests/realtime/subscribeToShow.test.ts's fake-client harness.
 * Asserts lib/realtime/subscribeToBell.ts wires up the admin-only
 * `admin:alerts` private Broadcast channel correctly:
 *   - Calls supabase.realtime.setAuth(jwt) before opening the channel.
 *   - Opens channel `admin:alerts` with config.private=true and
 *     broadcast.self=false.
 *   - Any 'changed' broadcast (contentless ping) invokes onChanged — no
 *     payload guard, unlike subscribeToShow's show_id fence.
 *   - `subscribed` resolves on first status SUBSCRIBED, rejects with
 *     BellSubscribeReadinessError on first CHANNEL_ERROR/TIMED_OUT/CLOSED,
 *     settles at most once.
 *   - Optional onStatus receives every status transition.
 */
import { describe, expect, test } from "vitest";
import { subscribeToBell, BellSubscribeReadinessError } from "@/lib/realtime/subscribeToBell";

function makeFakeSupabase() {
  const setAuthCalls: string[] = [];
  const channelCalls: Array<{ name: string; config: unknown }> = [];
  const onCalls: Array<{ event: string; config: { event: string } }> = [];
  let registeredHandler: (() => void) | null = null;
  let registeredStatusHandler: ((status: string) => void) | null = null;
  let subscribed = false;

  const channelHandle = {
    on(event: string, config: { event: string }, handler: () => void) {
      onCalls.push({ event, config });
      registeredHandler = handler;
      return channelHandle;
    },
    subscribe(statusCallback?: (status: string) => void) {
      subscribed = true;
      if (statusCallback) {
        registeredStatusHandler = statusCallback;
      }
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
    fire: () => {
      if (!registeredHandler) throw new Error("no handler registered");
      registeredHandler();
    },
    fireStatus: (status: string) => {
      if (!registeredStatusHandler) throw new Error("no status handler registered");
      registeredStatusHandler(status);
    },
    subscribed: () => subscribed,
    handle: channelHandle,
  };
}

describe("subscribeToBell", () => {
  test("calls realtime.setAuth(jwt) before opening the channel", () => {
    const fake = makeFakeSupabase();
    subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    expect(fake.state.setAuthCalls).toEqual(["fake.jwt.value"]);
  });

  test("opens channel `admin:alerts` with config.private=true and broadcast.self=false", () => {
    const fake = makeFakeSupabase();
    subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    expect(fake.state.channelCalls).toHaveLength(1);
    expect(fake.state.channelCalls[0]?.name).toBe("admin:alerts");
    const cfg = fake.state.channelCalls[0]?.config as {
      config?: { private?: boolean; broadcast?: { self?: boolean } };
    };
    expect(cfg?.config?.private).toBe(true);
    expect(cfg?.config?.broadcast?.self).toBe(false);
  });

  test("registers a 'broadcast' listener for event 'changed'", () => {
    const fake = makeFakeSupabase();
    subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    expect(fake.state.onCalls).toHaveLength(1);
    expect(fake.state.onCalls[0]?.event).toBe("broadcast");
    expect(fake.state.onCalls[0]?.config.event).toBe("changed");
  });

  test("fires onChanged on every 'changed' broadcast (contentless ping — no payload guard)", () => {
    const fake = makeFakeSupabase();
    let calls = 0;
    subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {
        calls += 1;
      },
    );
    fake.fire();
    fake.fire();
    expect(calls).toBe(2);
  });

  test("returns the channel handle for caller cleanup via removeChannel", () => {
    const fake = makeFakeSupabase();
    const result = subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    expect(result.channel).toBe(fake.handle);
  });

  test("subscribed Promise resolves only when first status is SUBSCRIBED", async () => {
    const fake = makeFakeSupabase();
    const result = subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    let resolved = false;
    let rejected = false;
    void result.subscribed.then(
      () => {
        resolved = true;
      },
      () => {
        rejected = true;
      },
    );
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(rejected).toBe(false);

    fake.fireStatus("SUBSCRIBED");
    await result.subscribed;
    expect(resolved).toBe(true);
    expect(rejected).toBe(false);
  });

  test("subscribed Promise REJECTS with BellSubscribeReadinessError on first-status CHANNEL_ERROR", async () => {
    const fake = makeFakeSupabase();
    const result = subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    fake.fireStatus("CHANNEL_ERROR");
    await expect(result.subscribed).rejects.toBeInstanceOf(BellSubscribeReadinessError);
    await result.subscribed.catch((err: BellSubscribeReadinessError) => {
      expect(err.status).toBe("CHANNEL_ERROR");
    });
  });

  test("subscribed Promise REJECTS on first-status TIMED_OUT", async () => {
    const fake = makeFakeSupabase();
    const result = subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    fake.fireStatus("TIMED_OUT");
    await expect(result.subscribed).rejects.toBeInstanceOf(BellSubscribeReadinessError);
  });

  test("subscribed Promise REJECTS on first-status CLOSED", async () => {
    const fake = makeFakeSupabase();
    const result = subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    fake.fireStatus("CLOSED");
    await expect(result.subscribed).rejects.toBeInstanceOf(BellSubscribeReadinessError);
  });

  test("subscribed Promise settles at most once: SUBSCRIBED then later CHANNEL_ERROR stays RESOLVED", async () => {
    const fake = makeFakeSupabase();
    const result = subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
    );
    fake.fireStatus("SUBSCRIBED");
    fake.fireStatus("CHANNEL_ERROR");
    await result.subscribed;
  });

  test("optional onStatus callback receives every status transition", () => {
    const fake = makeFakeSupabase();
    const seen: string[] = [];
    subscribeToBell(
      fake.supabase as unknown as Parameters<typeof subscribeToBell>[0],
      "fake.jwt.value",
      () => {},
      (s) => {
        seen.push(s);
      },
    );
    fake.fireStatus("SUBSCRIBED");
    fake.fireStatus("CHANNEL_ERROR");
    expect(seen).toEqual(["SUBSCRIBED", "CHANNEL_ERROR"]);
  });
});
