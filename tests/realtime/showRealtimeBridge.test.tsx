// @vitest-environment jsdom
/**
 * tests/realtime/showRealtimeBridge.test.tsx (M4 Task 4.16 Checkpoint B)
 *
 * Pins the public contract of `<ShowRealtimeBridge>` — the only new client
 * surface added in Checkpoint B. The bridge mounts inside the per-show page,
 * subscribes to Realtime Broadcast `show:<id>:invalidation`, and on each
 * invalidate event triggers a debounced `router.refresh()` so the parent
 * Server Component re-fetches `getShowForViewer` and re-renders the page.
 *
 * Plan-required cases (03-04-tiles.md:823-826):
 *   1. Single Apply emits 8 invalidations within a 50ms window → exactly ONE
 *      `router.refresh` call is made within the 100ms debounce window
 *      (+100ms jitter tolerance). Without the debounce, the test would see 8
 *      calls and fail.
 *   2. Negative regression: re-run with a 1-second gap between events;
 *      assert `router.refresh` is called 8 times.
 *   3. Catch-up `router.refresh` BYPASSES the debounce on the post-subscribe
 *      version-mismatch path — refresh is synchronous, NOT delayed by 100ms.
 *   4. Same for `system.reconnected` — version-mismatch catch-up refresh is
 *      synchronous.
 *   5. Unmount during a pending debounce CANCELS the timer — no
 *      `router.refresh` call ever fires.
 *
 * Additional contract (Checkpoint B spec, plan §823 + §824):
 *   - 4-step cleanup ordering: isMountedRef=false → currentChannelGenerationRef++
 *     → clearTimeout(pendingRefreshTimer) → removeChannel(currentChannel).
 *   - Stale-generation guards on every status / system / disconnect callback.
 *   - JWT-renewal sequence on `system.disconnected` (also CHANNEL_ERROR /
 *     TIMED_OUT / CLOSED): mint new JWT → setAuth → removeChannel → re-subscribe
 *     → version catch-up; logs `SHOW_REALTIME_JWT_RENEWED outcome:'success'`.
 *   - Renewal mint failure: log `SHOW_REALTIME_BROADCAST_AUTH_FAILED`, no
 *     retry-loop, single failed initial subscribe also no retry-loop.
 *   - The bridge renders `null` (no visual deliverable; bridge is invisible).
 *
 * Test approach:
 *
 *   We mock `next/navigation`'s `useRouter` to capture `router.refresh()`
 *   calls. We mock `lib/realtime/subscribeToShow` so the test drives both
 *   broadcast `onInvalidate` payloads AND the `system` / status callbacks
 *   that the bridge attaches to the channel via subsequent `.on('system', ...)`
 *   chains. We mock `global.fetch` so the JWT mint POST and the version
 *   GET return controllable shapes. Vitest fake timers drive the 100ms
 *   debounce.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { ShowRealtimeBridge } from "@/components/realtime/ShowRealtimeBridge";

// Mirror the production discriminated union from
// lib/realtime/showRealtimeChannelHandlers.ts. Tests that need to fire
// an unknown event to exercise the consumer's `default`-branch warning
// cast via `as unknown as SystemEvent` at the call site.
type SystemEvent = { event: "reconnected" } | { event: "disconnected" };

// In-memory state shared by `vi.mock` factories AND each test.
const subscribeMock = vi.hoisted(() => {
  type ChannelHandle = {
    invalidate: (token: string, showId?: string) => void;
    fireSystem: (e: SystemEvent) => void;
    fireStatus: (s: string) => void;
    onSystemHandlers: Array<(e: SystemEvent) => void>;
    onStatusHandlers: Array<(s: string) => void>;
    removed: boolean;
  };
  return {
    state: {
      subscribeCalls: [] as Array<{ showId: string; jwt: string }>,
      currentChannel: null as ChannelHandle | null,
      channels: [] as ChannelHandle[],
      // When set true, the next subscribeToShow call will throw synchronously
      // — emulates an initial subscribe failure.
      throwOnNext: false,
    },
  };
});

const routerMock = vi.hoisted(() => {
  return {
    state: { refreshCalls: 0 },
    reset: () => {
      // populated below
    },
  };
});

const fetchMock = vi.hoisted(() => {
  return {
    state: {
      // Each entry: { matcher: (url: string) => boolean, response: () => Response | Promise<Response> }
      handlers: [] as Array<{
        match: (url: string) => boolean;
        respond: (req: { url: string; init?: RequestInit }) => Promise<Response>;
      }>,
      calls: [] as Array<{ url: string; method: string; body: unknown }>,
    },
  };
});

vi.mock("next/navigation", () => {
  return {
    useRouter: () => ({
      refresh: () => {
        routerMock.state.refreshCalls += 1;
      },
    }),
  };
});

vi.mock("@/lib/realtime/subscribeToShow", () => {
  return {
    subscribeToShow: vi.fn(
      (
        _supabase: unknown,
        showId: string,
        jwt: string,
        onInvalidate: (token: string) => void,
        onStatus?: (status: string) => void,
      ) => {
        if (subscribeMock.state.throwOnNext) {
          subscribeMock.state.throwOnNext = false;
          throw new Error("subscribe failed");
        }
        subscribeMock.state.subscribeCalls.push({ showId, jwt });
        const onSystemHandlers: Array<(e: SystemEvent) => void> = [];
        const onStatusHandlers: Array<(s: string) => void> = [];
        // The new subscribeToShow contract calls .subscribe(statusCallback);
        // the bridge passes its handleStatusCallback through `onStatus`. We
        // register that here so existing `channel.fireStatus(s)` test
        // helpers continue to drive the bridge's status-handling code path.
        if (onStatus) {
          onStatusHandlers.push(onStatus);
        }
        // The readiness Promise mirrors the round-2 production contract:
        // RESOLVES on 'SUBSCRIBED', REJECTS on 'CHANNEL_ERROR' /
        // 'TIMED_OUT' / 'CLOSED'. Any other status leaves it pending.
        // Tests that pre-date the readiness gate use
        // `mountBridgeAndAwaitSubscribe` which fires 'SUBSCRIBED' below.
        let resolveSubscribed: () => void = () => {};
        let rejectSubscribed: (err: Error) => void = () => {};
        const subscribed = new Promise<void>((resolve, reject) => {
          resolveSubscribed = resolve;
          rejectSubscribed = reject;
        });
        // Defang unhandled-rejection warnings for the case where a test
        // fires a failure status but the bridge does not await (e.g.,
        // the bridge's await happens before the status fires and gets
        // ordered against an early return).
        subscribed.catch(() => {});
        let subscribedSettled = false;
        const handle: {
          invalidate: (token: string, showIdArg?: string) => void;
          fireSystem: (e: SystemEvent) => void;
          fireStatus: (s: string) => void;
          onSystemHandlers: typeof onSystemHandlers;
          onStatusHandlers: typeof onStatusHandlers;
          removed: boolean;
        } = {
          invalidate: (token, showIdArg) => {
            // The real helper guards on payload.show_id; the bridge's
            // onInvalidate callback only receives the token (helper has
            // already filtered). We mirror that contract here — the
            // showIdArg is informational so tests can document intent.
            void showIdArg;
            onInvalidate(token);
          },
          fireSystem: (e) => {
            onSystemHandlers.forEach((fn) => fn(e));
          },
          fireStatus: (s) => {
            // Settle the readiness Promise per the round-2 contract:
            // resolve on 'SUBSCRIBED', reject on the three failure
            // statuses, leave pending otherwise. Settles once.
            if (!subscribedSettled) {
              if (s === "SUBSCRIBED") {
                subscribedSettled = true;
                resolveSubscribed();
              } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
                subscribedSettled = true;
                rejectSubscribed(
                  new Error(
                    `subscribeToShow readiness failed: first status was '${s}' (expected 'SUBSCRIBED')`,
                  ),
                );
              }
            }
            onStatusHandlers.forEach((fn) => fn(s));
          },
          onSystemHandlers,
          onStatusHandlers,
          removed: false,
        };
        subscribeMock.state.currentChannel = handle;
        subscribeMock.state.channels.push(handle);
        return { channel: handle, subscribed };
      },
    ),
  };
});

// Hoisted state for the channel-handlers mock. The `removeChannelGate`
// lets a test inject a Promise that `removeChannel` must await before
// resolving — used to simulate the "removeChannel held across an
// unmount/remount" scenario in Test F (Codex round 4 HIGH).
const channelHandlersMock = vi.hoisted(() => {
  return {
    state: {
      // When non-null, every removeChannel call awaits this Promise
      // BEFORE marking the channel as removed and resolving. Tests
      // stuff a manually-controlled Promise here to hold the renewal's
      // failed-channel teardown across an unmount.
      removeChannelGate: null as Promise<void> | null,
    },
  };
});

vi.mock("@/lib/realtime/showRealtimeChannelHandlers", () => {
  // The bridge wires `system` + status callbacks via this small adapter so
  // tests can attach handlers to the mocked channel. Real implementation
  // calls `channel.on('system', ...)` and surfaces the subscribe-status
  // callback. The adapter signature is the same in both test + prod paths.
  return {
    attachSystemHandler: (
      channel: { onSystemHandlers: Array<(e: SystemEvent) => void> },
      handler: (e: SystemEvent) => void,
    ) => {
      channel.onSystemHandlers.push(handler);
    },
    attachStatusHandler: (
      channel: { onStatusHandlers: Array<(s: string) => void> },
      handler: (s: string) => void,
    ) => {
      channel.onStatusHandlers.push(handler);
    },
    removeChannel: vi.fn(async (_client: unknown, channel: { removed: boolean }) => {
      const gate = channelHandlersMock.state.removeChannelGate;
      if (gate !== null) {
        await gate;
      }
      channel.removed = true;
      return "ok";
    }),
  };
});

const supabaseMock = vi.hoisted(() => {
  // A stable singleton client — tests need to spy on / override
  // `realtime.setAuth` between mount and a renewal event, which requires
  // the same `setAuth` reference across all `getSupabaseBrowserClient()`
  // calls within a single test.
  return {
    state: {
      setAuth: vi.fn() as ReturnType<typeof vi.fn>,
    },
  };
});

vi.mock("@/lib/supabase/browser", () => {
  return {
    // The bridge only reads `.realtime.setAuth`; the rest is delegated
    // to subscribeToShow which is itself mocked above.
    getSupabaseBrowserClient: () => ({
      realtime: { setAuth: supabaseMock.state.setAuth },
    }),
  };
});

beforeEach(() => {
  vi.useFakeTimers();
  routerMock.state.refreshCalls = 0;
  subscribeMock.state.subscribeCalls = [];
  subscribeMock.state.currentChannel = null;
  subscribeMock.state.channels = [];
  subscribeMock.state.throwOnNext = false;
  supabaseMock.state.setAuth.mockReset();
  supabaseMock.state.setAuth.mockImplementation(() => undefined);
  channelHandlersMock.state.removeChannelGate = null;
  fetchMock.state.handlers = [];
  fetchMock.state.calls = [];

  // Default fetch handlers: JWT mint returns a stable jwt; version GET
  // returns a baseline token matching the renderVersion the test passes
  // unless the test overrides it.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      fetchMock.state.calls.push({
        url,
        method: init?.method ?? "GET",
        body: init?.body,
      });
      // Allow tests to override via `pushFetchHandler`.
      for (const h of fetchMock.state.handlers) {
        if (h.match(url)) {
          return init === undefined ? h.respond({ url }) : h.respond({ url, init });
        }
      }
      if (url.includes("/api/realtime/subscriber-token")) {
        return new Response(JSON.stringify({ jwt: "default-jwt", exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.match(/\/api\/show\/[^/]+\/version/)) {
        return new Response(JSON.stringify({ version_token: "BASELINE" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function pushFetchHandler(
  match: (url: string) => boolean,
  respond: (req: { url: string; init?: RequestInit }) => Promise<Response>,
) {
  fetchMock.state.handlers.push({ match, respond });
}

async function flushPromises() {
  // Run the microtask queue without advancing fake timers. `act` ensures
  // React effects + state updates are committed.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function mountBridgeAndAwaitSubscribe(opts?: { fireSubscribed?: boolean }) {
  const fireSubscribed = opts?.fireSubscribed ?? true;
  const utils = render(
    <ShowRealtimeBridge showId="show-uuid-1" slug="some-slug" renderVersion="BASELINE" />,
  );
  // Initial mount kicks off the JWT mint then subscribeToShow.
  // Drain microtasks until the channel is registered (we run a small loop
  // because the initial mount = mint POST → fetch.then() → subscribe).
  for (let i = 0; i < 10; i += 1) {
    if (subscribeMock.state.currentChannel) break;
    await flushPromises();
  }
  // Fire SUBSCRIBED so the bridge's readiness Promise resolves and the
  // post-subscribe catch-up runs. Tests that need to exercise the
  // pre-subscribed (race) window pass `fireSubscribed: false` and drive
  // the status manually.
  if (fireSubscribed && subscribeMock.state.currentChannel) {
    await act(async () => {
      subscribeMock.state.currentChannel?.fireStatus("SUBSCRIBED");
    });
    await flushPromises();
  }
  return utils;
}

describe("ShowRealtimeBridge — Checkpoint B", () => {
  test("renders nothing visible (returns null)", async () => {
    const utils = await mountBridgeAndAwaitSubscribe();
    // The bridge container body must be empty.
    expect(utils.container.firstChild).toBeNull();
  });

  test("Plan test 1 — 8 invalidations within 50ms coalesce to exactly ONE router.refresh", async () => {
    await mountBridgeAndAwaitSubscribe();
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    // Fire 8 broadcasts within 50ms.
    for (let i = 0; i < 8; i += 1) {
      channel.invalidate(`TOKEN-${i}`, "show-uuid-1");
      await act(async () => {
        vi.advanceTimersByTime(5); // 5ms × 8 = 40ms < 50ms window
      });
    }
    expect(routerMock.state.refreshCalls).toBe(0); // still pending

    // Advance past the 100ms debounce. The plan allows +100ms jitter
    // tolerance — we use 200ms to be deterministic.
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await flushPromises();

    expect(routerMock.state.refreshCalls).toBe(1);
  });

  test("Plan test 2 — 8 invalidations with 1-second gaps result in 8 separate router.refresh calls (negative regression)", async () => {
    await mountBridgeAndAwaitSubscribe();
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    for (let i = 0; i < 8; i += 1) {
      channel.invalidate(`TOKEN-${i}`, "show-uuid-1");
      // 1-second gap is well past the 100ms debounce, so each invalidate
      // resolves to its own router.refresh.
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      await flushPromises();
    }

    expect(routerMock.state.refreshCalls).toBe(8);
  });

  test("Plan test 3 — post-subscribe version mismatch triggers SYNCHRONOUS router.refresh (bypasses 100ms debounce)", async () => {
    pushFetchHandler(
      (url) => /\/api\/show\/[^/]+\/version/.test(url),
      async () =>
        new Response(JSON.stringify({ version_token: "T1-NEW" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await mountBridgeAndAwaitSubscribe();
    // After subscribe, the bridge calls /api/show/[slug]/version. The
    // baseline rendered version is BASELINE; version GET returns T1-NEW
    // → mismatch. Bridge MUST refresh synchronously, no debounce.
    await flushPromises();
    // No vi.advanceTimersByTime call — refresh is synchronous on the
    // catch-up path.
    expect(routerMock.state.refreshCalls).toBe(1);
  });

  test("Plan test 4 — system.reconnected triggers SYNCHRONOUS catch-up refresh on version mismatch (bypasses debounce)", async () => {
    let versionTokenToReturn = "BASELINE";
    pushFetchHandler(
      (url) => /\/api\/show\/[^/]+\/version/.test(url),
      async () =>
        new Response(JSON.stringify({ version_token: versionTokenToReturn }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await mountBridgeAndAwaitSubscribe();
    await flushPromises();
    // Initial post-subscribe catch-up: token matches → no refresh.
    expect(routerMock.state.refreshCalls).toBe(0);

    // Now flip the version token AND fire system.reconnected.
    versionTokenToReturn = "T1-RECONNECT";
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");
    // Explicitly assert the system handler was attached BEFORE we fire
    // the event. Currently attachment is synchronous so this passes
    // trivially, but a future refactor that defers attachment (e.g.,
    // wires the handler inside the post-subscribe catch-up) would
    // silently regress this test without this guard — fireSystem would
    // be a no-op against the empty handler array, and the test would
    // pass only because routerMock.state.refreshCalls happens to be 0
    // for unrelated reasons.
    expect(channel.onSystemHandlers).toHaveLength(1);
    await act(async () => {
      channel.fireSystem({ event: "reconnected" });
    });
    await flushPromises();

    expect(routerMock.state.refreshCalls).toBe(1);
  });

  test("Plan test 5 — unmount during pending 100ms debounce cancels the timer (router.refresh NOT called)", async () => {
    const utils = await mountBridgeAndAwaitSubscribe();
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    channel.invalidate("TOKEN-CANCELLED", "show-uuid-1");
    // Mid-debounce — only 50ms in.
    await act(async () => {
      vi.advanceTimersByTime(50);
    });
    expect(routerMock.state.refreshCalls).toBe(0);

    // Unmount BEFORE the 100ms timer would have fired.
    utils.unmount();

    // Advance past where the debounced refresh would have fired.
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    await flushPromises();

    expect(routerMock.state.refreshCalls).toBe(0);
  });

  test("4-step cleanup ordering on unmount: isMountedRef=false → generation++ → clearTimeout → removeChannel", async () => {
    const utils = await mountBridgeAndAwaitSubscribe();
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    // Schedule a pending debounce so step 3 has work to do.
    channel.invalidate("TOKEN-PENDING", "show-uuid-1");
    await act(async () => {
      vi.advanceTimersByTime(20);
    });

    // Unmount.
    utils.unmount();
    await flushPromises();

    // Step 4: removeChannel was called.
    expect(channel.removed).toBe(true);

    // Step 1+3: A late callback fired after unmount must NOT call refresh
    // (isMountedRef guard). Drain past the debounce window to confirm.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(routerMock.state.refreshCalls).toBe(0);
  });

  test("stale-generation guard: callbacks fired AFTER unmount return early (no refresh)", async () => {
    const utils = await mountBridgeAndAwaitSubscribe();
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    utils.unmount();
    await flushPromises();

    // Late `system.reconnected` and a late invalidate after unmount.
    await act(async () => {
      channel.fireSystem({ event: "reconnected" });
    });
    channel.invalidate("LATE-TOKEN", "show-uuid-1");
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    await flushPromises();

    expect(routerMock.state.refreshCalls).toBe(0);
  });

  test("renewal flow on system.disconnected: mint → setAuth → removeChannel → re-subscribe → version catch-up; logs SHOW_REALTIME_JWT_RENEWED outcome:success", async () => {
    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);

    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    expect(subscribeMock.state.subscribeCalls).toHaveLength(1);
    expect(subscribeMock.state.subscribeCalls[0]?.jwt).toBe("jwt-mint-1");

    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");

    // Fire disconnect.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    await flushPromises();
    await flushPromises();

    // After renewal: a NEW channel was created with the freshly minted JWT.
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThanOrEqual(2);
    const renewedCall =
      subscribeMock.state.subscribeCalls[subscribeMock.state.subscribeCalls.length - 1];
    expect(renewedCall?.jwt).toBe("jwt-mint-2");
    // Old channel was removed.
    expect(firstChannel.removed).toBe(true);
    // Fire SUBSCRIBED on the NEW channel so the renewal's readiness gate
    // resolves and the success log fires (the catch-up + success log are
    // now gated on the new channel reaching SUBSCRIBED — Codex HIGH 2).
    const newChannel = subscribeMock.state.currentChannel;
    if (!newChannel) throw new Error("renewal channel not registered");
    await act(async () => {
      newChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();
    await flushPromises();
    // Renewal log was emitted.
    const loggedRenewal = consoleInfoSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === "string" && a.includes("SHOW_REALTIME_JWT_RENEWED")),
    );
    expect(loggedRenewal).toBe(true);

    consoleInfoSpy.mockRestore();
  });

  test("Codex round-24 MEDIUM — renewal setAuth-throw MUST schedule bounded backoff retry", async () => {
    // Codex round-24: round-21 wired the retry on transient mint
    // failures, but missed setAuth-throw. If renewal mint succeeds
    // and setAuth then throws (cold socket / Supabase client
    // misbehavior), the function logged + returned without
    // pendingRenewalRef = true, leaving the page silent until a
    // manual refresh or another status event. Fix: setAuth-throw
    // also sets pendingRenewalRef so the bounded backoff retries.
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () =>
        new Response(JSON.stringify({ jwt: "ok", exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    // setAuth: first call (initial mount) succeeds, second call
    // (renewal) throws once, third call (retry) succeeds.
    let setAuthCalls = 0;
    supabaseMock.state.setAuth.mockImplementation(() => {
      setAuthCalls += 1;
      if (setAuthCalls === 2) {
        throw new Error("META: simulated setAuth fault");
      }
    });

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    const baselineSubscribes = subscribeMock.state.subscribeCalls.length;

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 20; i += 1) {
      await flushPromises();
      vi.advanceTimersByTime(2000);
    }
    await flushPromises();

    // Bug-pinning: the backoff retry produced a NEW subscribe call
    // beyond the initial. Pre-fix this would equal baselineSubscribes
    // (no retry fired after setAuth-throw).
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThan(baselineSubscribes);
    const loggedSetAuthThrew = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { reason?: unknown }).reason === "set_auth_threw",
      ),
    );
    expect(loggedSetAuthThrew).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  test("Codex round-24 MEDIUM — renewal subscribe-throw MUST schedule bounded backoff retry", async () => {
    // Same shape as setAuth-throw, but the subscribe_threw branch.
    // Pre-fix this branch logged + returned without flagging retry
    // even though the old channel was already removed — leaving the
    // bridge truly dead until manual intervention.
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () =>
        new Response(JSON.stringify({ jwt: "ok", exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    const baselineSubscribes = subscribeMock.state.subscribeCalls.length;

    // Make subscribeToShow throw ONCE (the renewal subscribe).
    // Subsequent calls (the backoff retry) succeed normally.
    subscribeMock.state.throwOnNext = true;

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 20; i += 1) {
      await flushPromises();
      vi.advanceTimersByTime(2000);
    }
    await flushPromises();

    // Bug-pinning: subscribeToShow was called more than once after
    // the disconnect (one threw, the retry succeeded).
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThan(baselineSubscribes);
    const loggedSubscribeThrew = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { reason?: unknown }).reason === "subscribe_threw",
      ),
    );
    expect(loggedSubscribeThrew).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  test("Codex round-21 MEDIUM — renewal mint transient 5xx MUST schedule bounded backoff retry (no manual refresh required)", async () => {
    // Codex round-21: my round-20 refactor missed wiring
    // pendingRenewalRef on transient_failure, so a 5xx during tab
    // foregrounding left the bridge stuck on the disconnected
    // channel until a manual refresh or another status event. The
    // existing bounded-backoff retry only runs when pendingRenewalRef
    // is set; the round-20 path returned without flagging it. Fix:
    // set pendingRenewalRef.current = true in the transient branch
    // so the next backoff attempt fires.
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        // Initial mint succeeds; renewal mint #1 transient 5xx;
        // renewal mint #2 (the backoff retry) succeeds.
        if (mintCount === 1) {
          return new Response(JSON.stringify({ jwt: "ok-1", exp: 9999999999 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (mintCount === 2) {
          return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ jwt: `ok-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    const baselineSubscribes = subscribeMock.state.subscribeCalls.length;

    // Disconnect → first renewal mint (#2) fails 5xx. Pre-fix, the
    // bridge would log the failure and STAY DEAD without a second
    // disconnect. Post-fix, pendingRenewalRef is set, the finally
    // block schedules the backoff retry, and a subsequent mint #3
    // succeeds → new subscribe call.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    // Drain microtasks AND advance timers to fire the bounded backoff.
    for (let i = 0; i < 20; i += 1) {
      await flushPromises();
      vi.advanceTimersByTime(2000);
    }
    await flushPromises();

    // Bug-pinning: the backoff retry produced a NEW subscribe call
    // beyond the initial. Pre-fix this would equal baselineSubscribes
    // (no retry fired).
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThan(baselineSubscribes);

    consoleWarnSpy.mockRestore();
  });

  test("Codex round-20 HIGH — renewal mint 401 (auth_denied) MUST force router.refresh", async () => {
    // Codex round-20 HIGH: auth-deny on the realtime endpoints means
    // the viewer's session was revoked while disconnected. Pre-fix,
    // the bridge silently swallowed the 401 (collapsed to null) and
    // the page kept showing stale show data. Post-fix, the bridge
    // forces router.refresh() so the Server Component auth chain
    // re-evaluates and routes the revoked viewer appropriately.
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        // Initial mint succeeds; renewal mint returns 401.
        if (mintCount === 1) {
          return new Response(JSON.stringify({ jwt: "ok-1", exp: 9999999999 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "SHOW_REALTIME_BROADCAST_AUTH_FAILED" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    routerMock.state.refreshCalls = 0;

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // Bug-pinning assertion: refresh fired on auth_denied.
    expect(routerMock.state.refreshCalls).toBeGreaterThanOrEqual(1);
    // The auth_denied log was emitted (different reason tag than
    // the transient mint_failed path, so dashboards can disambiguate).
    const loggedAuthDenied = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { reason?: unknown }).reason === "mint_auth_denied",
      ),
    );
    expect(loggedAuthDenied).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  test("Codex round-20 HIGH — version endpoint 401 on catch-up MUST force router.refresh", async () => {
    // Same auth-deny logic but on the /version endpoint (the catch-up
    // fetch). Pre-fix, fetchCurrentVersion collapsed every non-OK to
    // null, refreshSyncIfMismatch saw "no token" and skipped refresh,
    // page stayed stale. Post-fix, the discriminated result surfaces
    // auth_denied and refreshSyncIfMismatch forces refresh.
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    pushFetchHandler(
      (url) => /\/api\/show\/[^/]+\/version/.test(url),
      async () =>
        new Response(JSON.stringify({ error: "SHOW_VERSION_AUTH_FAILED" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    );

    await mountBridgeAndAwaitSubscribe();
    routerMock.state.refreshCalls = 0;

    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    // Trigger system.reconnected → catch-up runs.
    await act(async () => {
      channel.fireSystem({ event: "reconnected" });
    });
    await flushPromises();
    await flushPromises();

    expect(routerMock.state.refreshCalls).toBeGreaterThanOrEqual(1);
    const loggedAuthDenied = consoleWarnSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === "string" && a.includes("auth_denied")),
    );
    expect(loggedAuthDenied).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  test("M11.5 D3.5 / R11-F1 — version endpoint 410 (show_unavailable / session_mismatch) MUST force router.refresh", async () => {
    // R11-F1: 410 is the terminal auth-loss wire code introduced in
    // M11.5 — emitted by §6 data APIs when a show becomes archived
    // (show_unavailable) AND by the picker-cookie identity-consistency
    // check (P-R29 Fix-1 session_mismatch). Pre-fix the bridge only
    // recognised 401/403 as auth_denied, so a 410 fell through to
    // transient_failure and the page silently kept stale data.
    // Post-fix the discriminated arm widens to 401 | 403 | 410 and
    // the catch-up forces router.refresh().
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    pushFetchHandler(
      (url) => /\/api\/show\/[^/]+\/version/.test(url),
      async () =>
        new Response(JSON.stringify({ error: "SHOW_UNAVAILABLE" }), {
          status: 410,
          headers: { "content-type": "application/json" },
        }),
    );

    await mountBridgeAndAwaitSubscribe();
    routerMock.state.refreshCalls = 0;

    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    await act(async () => {
      channel.fireSystem({ event: "reconnected" });
    });
    await flushPromises();
    await flushPromises();

    expect(routerMock.state.refreshCalls).toBeGreaterThanOrEqual(1);
    consoleWarnSpy.mockRestore();
  });

  test("M11.5 D3.5 / R11-F1 — subscriber-token 410 MUST force router.refresh + not retry-loop", async () => {
    // Pair regression: the renewal mint path must also recognise 410.
    // Also pins the no-retry-loop contract — after auth_denied we
    // expect a finite number of mint attempts; subsequent reconnects
    // do not keep hammering the token endpoint indefinitely (the
    // bridge defers re-evaluation to the Server Component resolver
    // that router.refresh() drives).
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        if (mintCount === 1) {
          return new Response(JSON.stringify({ jwt: "ok-1", exp: 9999999999 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: "SHOW_UNAVAILABLE" }), {
          status: 410,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    routerMock.state.refreshCalls = 0;
    const mintsBefore = mintCount;

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    expect(routerMock.state.refreshCalls).toBeGreaterThanOrEqual(1);
    // Not-retry-loop: after the 410 surfaces auth_denied the bridge
    // hands off to router.refresh() rather than spinning on more
    // renewal mints. A small fixed number of post-disconnect mints
    // is acceptable (initial reconnect attempt), but the count must
    // be bounded — not a runaway loop.
    expect(mintCount - mintsBefore).toBeLessThanOrEqual(3);

    consoleWarnSpy.mockRestore();
  });

  test("Codex round-18 HIGH — invalidate + disconnect mid-debounce: renewal catch-up MUST still refresh", async () => {
    // Race scenario from Codex round-18 finding:
    //   1. Channel receives invalidate(T1) → schedules 100ms debounced refresh.
    //   2. Socket disconnects BEFORE the 100ms timer fires.
    //   3. Renewal advances generation; pending debounce bails on gen check.
    //   4. New channel reaches SUBSCRIBED → catch-up runs.
    //   5. Catch-up MUST detect that current /version (T1) differs from the
    //      last SSR-rendered token (BASELINE) and call router.refresh().
    //
    // Pre-fix bug: the invalidate callback optimistically advanced
    // `renderVersionRef.current = T1` BEFORE the debounce fired. So at
    // step 5, refreshSyncIfMismatch fetched "T1-PENDING" and compared
    // it to renderVersionRef.current (also "T1-PENDING") — no mismatch
    // detected, refresh skipped, page silently kept stale data.
    //
    // Post-fix: the ref is left untouched in the broadcast callback;
    // it represents only the last SSR-rendered prop. So the comparison
    // (T1-PENDING vs BASELINE) detects the mismatch and refreshes.
    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    // /version returns T1-PENDING — the token the broadcast invalidated
    // for. After the disconnect+renewal, the catch-up MUST detect this
    // differs from BASELINE and trigger refresh.
    pushFetchHandler(
      (url) => /\/api\/show\/[^/]+\/version/.test(url),
      async () =>
        new Response(JSON.stringify({ version_token: "T1-PENDING" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    await mountBridgeAndAwaitSubscribe();
    // Drain the post-mount catch-up's refresh (BASELINE === BASELINE,
    // no mismatch, so it should not have refreshed; reset just in case).
    await flushPromises();
    routerMock.state.refreshCalls = 0;

    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");

    // Step 1: invalidate(T1-PENDING) schedules the 100ms debounce.
    await act(async () => {
      firstChannel.invalidate("T1-PENDING", "show-uuid-1");
    });
    // Do NOT advance fake timers — the debounce timer must NOT fire
    // before the disconnect interrupts it. That's the race condition.

    // Step 2: disconnect interrupts mid-debounce. Renewal kicks in.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    await flushPromises();
    await flushPromises();

    // Step 3: renewal opened a new channel; fire SUBSCRIBED so catch-up
    // runs. Catch-up fetches /version (T1-PENDING) and compares to the
    // ref (must be BASELINE post-fix).
    const newChannel = subscribeMock.state.currentChannel;
    if (!newChannel || newChannel === firstChannel) {
      throw new Error("renewal channel not registered");
    }
    await act(async () => {
      newChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();
    await flushPromises();

    // Bug-pinning assertion: catch-up DID call router.refresh (≥ 1).
    // Pre-fix this would be 0 because the optimistic ref-advance
    // would have hidden the mismatch.
    expect(routerMock.state.refreshCalls).toBeGreaterThanOrEqual(1);
  });

  test("renewal mint failure: logs SHOW_REALTIME_BROADCAST_AUTH_FAILED, no retry-loop", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        if (mintCount === 1) {
          return new Response(JSON.stringify({ jwt: "ok-1", exp: 9999999999 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // Codex round-20 HIGH refactor: 401/403 now route through
        // the auth_denied branch which forces refresh. To preserve
        // the original "transient mint failure stays fail-open"
        // semantic, this test uses status 500 — a true transient
        // failure (server fault, not auth deny). New tests below
        // exercise the 401/403 auth_denied path explicitly.
        return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    const baselineSubscribeCount = subscribeMock.state.subscribeCalls.length;

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    // Drain renewal microtasks AND any potential retry timers.
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
      vi.advanceTimersByTime(1000);
    }
    await flushPromises();

    // No new subscribe calls beyond the initial one.
    expect(subscribeMock.state.subscribeCalls.length).toBe(baselineSubscribeCount);
    const loggedFailure = consoleWarnSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === "string" && a.includes("SHOW_REALTIME_BROADCAST_AUTH_FAILED")),
    );
    expect(loggedFailure).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  test("initial subscribe failure: console.warn fires, bridge does NOT retry-loop, returns null without crashing", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    subscribeMock.state.throwOnNext = true;

    const utils = render(
      <ShowRealtimeBridge showId="show-uuid-1" slug="some-slug" renderVersion="BASELINE" />,
    );
    // Drain mint + subscribe attempts.
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
      vi.advanceTimersByTime(500);
    }
    await flushPromises();

    // Container is still empty.
    expect(utils.container.firstChild).toBeNull();
    // Bridge logged a warn but did NOT retry repeatedly.
    expect(subscribeMock.state.subscribeCalls.length).toBeLessThanOrEqual(1);
    const loggedWarn = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) => typeof a === "string" && a.includes("[ShowRealtimeBridge] subscription failed"),
      ),
    );
    expect(loggedWarn).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  test("renderVersion ref tracks LATEST SSR'd token, not the T0 mount value (system.reconnected reads current ref)", async () => {
    let versionTokenToReturn = "T2-LATEST";
    pushFetchHandler(
      (url) => /\/api\/show\/[^/]+\/version/.test(url),
      async () =>
        new Response(JSON.stringify({ version_token: versionTokenToReturn }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const utils = render(
      <ShowRealtimeBridge showId="show-uuid-1" slug="some-slug" renderVersion="T0-INITIAL" />,
    );
    for (let i = 0; i < 10; i += 1) {
      if (subscribeMock.state.currentChannel) break;
      await flushPromises();
    }
    // Fire SUBSCRIBED so the bridge's readiness gate releases the
    // post-subscribe catch-up (Codex HIGH 2 — catch-up no longer races
    // the Realtime join).
    const initialChannel = subscribeMock.state.currentChannel;
    if (!initialChannel) throw new Error("channel not registered");
    await act(async () => {
      initialChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();
    // Initial post-subscribe catch-up: T0-INITIAL vs T2-LATEST → refresh.
    expect(routerMock.state.refreshCalls).toBe(1);

    // Server re-renders with new SSR'd token T2-LATEST. The ref must update
    // so a subsequent reconnect catch-up reads T2-LATEST and does NOT refresh
    // when the server returns the same value.
    utils.rerender(
      <ShowRealtimeBridge showId="show-uuid-1" slug="some-slug" renderVersion="T2-LATEST" />,
    );
    await flushPromises();

    versionTokenToReturn = "T2-LATEST";
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");
    await act(async () => {
      channel.fireSystem({ event: "reconnected" });
    });
    await flushPromises();

    // No additional refresh — ref reads T2-LATEST, server returns T2-LATEST.
    expect(routerMock.state.refreshCalls).toBe(1);
  });

  // === Important 1 (Task 4.16 Checkpoint B code-quality review) ===
  // The component's file-header doc promises that every renewal-failure
  // path emits `SHOW_REALTIME_JWT_RENEWED outcome: 'failed'`. These three
  // tests pin the contract — without them, a future refactor that drops
  // the failed-outcome log would silently regress the logging contract
  // (the prior renewal-mint-failure test only asserted the
  // `BROADCAST_AUTH_FAILED` log fired, leaving the `outcome: failed` peer
  // unverified).

  test("renewal mint failure emits SHOW_REALTIME_JWT_RENEWED outcome: failed log", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        if (mintCount === 1) {
          return new Response(JSON.stringify({ jwt: "ok-1", exp: 9999999999 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        // Codex round-20 HIGH refactor: 401/403 now route through
        // the auth_denied branch which forces refresh. To preserve
        // the original "transient mint failure stays fail-open"
        // semantic, this test uses status 500 — a true transient
        // failure (server fault, not auth deny). New tests below
        // exercise the 401/403 auth_denied path explicitly.
        return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 5; i += 1) {
      await flushPromises();
    }

    const loggedFailedOutcome = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) => typeof a === "string" && a.includes("SHOW_REALTIME_JWT_RENEWED outcome: failed"),
      ),
    );
    expect(loggedFailedOutcome).toBe(true);
    // Reason tag specifically identifies mint failure.
    const taggedMintFailed = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { reason?: unknown }).reason === "mint_failed",
      ),
    );
    expect(taggedMintFailed).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  test("renewal setAuth failure emits SHOW_REALTIME_JWT_RENEWED outcome: failed log", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Force setAuth to throw on the SECOND call (the renewal call;
    // the first call is the initial subscribe path).
    let setAuthCalls = 0;
    supabaseMock.state.setAuth.mockImplementation(() => {
      setAuthCalls += 1;
      if (setAuthCalls >= 2) {
        throw new Error("setAuth boom");
      }
    });

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 5; i += 1) {
      await flushPromises();
    }

    const loggedFailedOutcome = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) => typeof a === "string" && a.includes("SHOW_REALTIME_JWT_RENEWED outcome: failed"),
      ),
    );
    expect(loggedFailedOutcome).toBe(true);
    const taggedSetAuthThrew = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { reason?: unknown }).reason === "set_auth_threw",
      ),
    );
    expect(taggedSetAuthThrew).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  test("renewal subscribe failure emits SHOW_REALTIME_JWT_RENEWED outcome: failed log", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");

    // Arm the subscribe mock to throw on the NEXT call — that is the
    // renewal-time re-subscribe.
    subscribeMock.state.throwOnNext = true;

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 5; i += 1) {
      await flushPromises();
    }

    const loggedFailedOutcome = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) => typeof a === "string" && a.includes("SHOW_REALTIME_JWT_RENEWED outcome: failed"),
      ),
    );
    expect(loggedFailedOutcome).toBe(true);
    const taggedSubscribeThrew = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { reason?: unknown }).reason === "subscribe_threw",
      ),
    );
    expect(taggedSubscribeThrew).toBe(true);

    consoleWarnSpy.mockRestore();
  });

  // === Codex HIGH 2 regression — readiness gate before catch-up ===
  // Without the readiness gate, the post-subscribe catch-up runs the
  // version GET BEFORE Realtime accepts the subscription. An update that
  // lands AFTER the version GET but BEFORE SUBSCRIBED is then missed:
  // catch-up sees the old token, Broadcast has not started delivering,
  // and the page renders stale data forever.
  //
  // This test mounts the bridge, lets the version GET resolve and then
  // simulates an update landing in the race window. After SUBSCRIBED
  // fires the bridge is now receiving Broadcast — the simulated update
  // is delivered as an `invalidate` event and triggers a refresh.
  // Without the gate, refreshCalls would be observed at 0 even after the
  // late broadcast (race never closes).
  test("HIGH 2 — catch-up runs only AFTER SUBSCRIBED; updates arriving in the race window are delivered post-subscribe", async () => {
    // Version GET returns the SAME token as the SSR'd renderVersion so a
    // catch-up that runs would NOT refresh (no mismatch). The only way
    // refreshCalls reaches 1 in this test is via a Broadcast event
    // delivered AFTER SUBSCRIBED — which is the fix HIGH 2 enforces.
    pushFetchHandler(
      (url) => /\/api\/show\/[^/]+\/version/.test(url),
      async () =>
        new Response(JSON.stringify({ version_token: "BASELINE" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );

    const utils = await mountBridgeAndAwaitSubscribe({
      fireSubscribed: false,
    });
    void utils;
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    // BEFORE SUBSCRIBED fires: confirm catch-up has not yet run by
    // observing that no refresh has fired even after a long drain.
    await flushPromises();
    expect(routerMock.state.refreshCalls).toBe(0);

    // Now SUBSCRIBED fires — readiness Promise resolves, catch-up runs
    // (no mismatch, no refresh).
    await act(async () => {
      channel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();
    await flushPromises();
    expect(routerMock.state.refreshCalls).toBe(0);

    // Simulate an update arriving via Broadcast (post-subscribe — the
    // race window has closed because we are now subscribed). The bridge
    // schedules a debounced refresh.
    channel.invalidate("TOKEN-LATE", "show-uuid-1");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    await flushPromises();
    expect(routerMock.state.refreshCalls).toBe(1);
  });

  // === Codex HIGH 3 — single-flight gate for renewSubscription ===
  // Multiple CHANNEL_ERROR / TIMED_OUT / CLOSED / system.disconnected
  // callbacks can arrive in rapid succession with the SAME generation
  // BEFORE the first mint completes. Without `isRenewingRef`, every
  // disconnect kicks off its own mint → setAuth → re-subscribe sequence
  // and the network thrash is observable as multiple JWT mints + multiple
  // new channels for a single fault.

  test("HIGH 3 — 5 rapid disconnect events trigger EXACTLY ONE renewSubscription / mint / re-subscribe sequence", async () => {
    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    expect(subscribeMock.state.subscribeCalls).toHaveLength(1);
    // Reset the mint counter to ignore the initial mint.
    const baselineMints = mintCount;
    const baselineSubscribes = subscribeMock.state.subscribeCalls.length;

    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");

    // Fire FIVE disconnect events back-to-back BEFORE any mint can
    // complete. Without the single-flight guard, all five enter
    // renewSubscription concurrently and each calls mintSubscriberToken,
    // setAuth, removeChannel, subscribeToShow.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
      firstChannel.fireSystem({ event: "disconnected" });
      firstChannel.fireSystem({ event: "disconnected" });
      firstChannel.fireSystem({ event: "disconnected" });
      firstChannel.fireSystem({ event: "disconnected" });
    });
    // Drain the renewal microtasks fully.
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // EXACTLY ONE additional mint and ONE additional subscribe call —
    // the four redundant disconnect events were swallowed by the lock.
    expect(mintCount - baselineMints).toBe(1);
    expect(subscribeMock.state.subscribeCalls.length - baselineSubscribes).toBe(1);
  });

  test("HIGH 3 — failed mint releases the single-flight lock; a subsequent disconnect can retry", async () => {
    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        // Initial mint: success. First renewal mint: FAIL.
        // Second renewal mint: success.
        if (mintCount === 1) {
          return new Response(JSON.stringify({ jwt: "ok-1", exp: 9999999999 }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }
        if (mintCount === 2) {
          // Codex round-20 HIGH refactor: status 500 (transient
          // failure) preserves the original test intent of "renewal
          // mint failure releases the single-flight lock."
          return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ jwt: `ok-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    const baselineSubscribes = subscribeMock.state.subscribeCalls.length;

    // Disconnect 1 — mint fails, lock must be released.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    // No new subscribe yet (mint failed).
    expect(subscribeMock.state.subscribeCalls.length).toBe(baselineSubscribes);
    // The mint-failed log fired (proves the renewal path executed and
    // returned, NOT that it was silently swallowed by the lock).
    const loggedFailedOnce = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { reason?: unknown }).reason === "mint_failed",
      ),
    );
    expect(loggedFailedOnce).toBe(true);

    // Disconnect 2 — lock should be released, so the new disconnect
    // triggers ANOTHER renewSubscription. Mint 3 succeeds → new
    // subscribe call.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    // A new subscribe was attempted — proves the lock released.
    expect(subscribeMock.state.subscribeCalls.length - baselineSubscribes).toBe(1);

    consoleWarnSpy.mockRestore();
  });

  // === Codex round 2 HIGH — readiness Promise resolves only on SUBSCRIBED ===
  // The previous contract resolved the readiness Promise on the FIRST status
  // regardless of value. CHANNEL_ERROR / TIMED_OUT / CLOSED satisfied the
  // gate, so the bridge would log `outcome:'success'`, run catch-up against
  // an unjoined channel, and release the single-flight lock while
  // `currentChannelRef` pointed at a failed channel — leaving the page
  // without realtime invalidations until a later natural status event. The
  // round 2 fix REJECTS the Promise on the three failure statuses; the
  // bridge skips success logging + catch-up and lets the lock release via
  // its existing finally block.
  //
  // Test A — Initial subscribe failure: first status is CHANNEL_ERROR. The
  // post-subscribe catch-up (refreshSyncIfMismatch) MUST NOT run, even when
  // the version GET would have indicated a mismatch. The bridge then enters
  // the renewal path (CHANNEL_ERROR → handleStatusCallback →
  // renewSubscription), which is the recovery channel. The test pins the
  // negative property: no version-mismatch refresh in the failure window.
  test("HIGH (round 2) Test A — initial subscribe with first-status CHANNEL_ERROR: post-subscribe catch-up does NOT run (no version-mismatch refresh)", async () => {
    // Version GET returns a token DIFFERENT from the SSR'd renderVersion.
    // If the catch-up incorrectly ran on a CHANNEL_ERROR readiness, this
    // mismatch would trigger router.refresh — the test's failure mode.
    pushFetchHandler(
      (url) => /\/api\/show\/[^/]+\/version/.test(url),
      async () =>
        new Response(JSON.stringify({ version_token: "T-MISMATCH" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    // The renewal path will try to mint again — keep mints succeeding so
    // the test isolates the readiness-rejection branch (not mint failure).
    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    // Mount WITHOUT firing SUBSCRIBED — we drive the failure status by hand.
    const utils = await mountBridgeAndAwaitSubscribe({
      fireSubscribed: false,
    });
    void utils;
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");

    // Fire CHANNEL_ERROR as the FIRST status. The readiness Promise rejects;
    // the bridge's status-callback handler also sees CHANNEL_ERROR and
    // schedules a renewal via void renewSubscription(closureGen).
    await act(async () => {
      channel.fireStatus("CHANNEL_ERROR");
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // Post-subscribe catch-up did NOT run against the failed initial
    // subscribe — even though /version returned a mismatched token, no
    // refresh was issued before the renewal path took over. (The renewal
    // path itself will fire its own catch-up when the NEW channel reaches
    // SUBSCRIBED; we leave the new channel pending here so we observe the
    // initial-failure window in isolation.)
    //
    // ANY refresh observed during this window means the catch-up ran on
    // the failed channel — the failure mode this test catches.
    expect(routerMock.state.refreshCalls).toBe(0);

    // No SHOW_REALTIME_JWT_RENEWED outcome:success log fired (renewal is
    // still in flight; the new channel has not reached SUBSCRIBED).
    const loggedSuccess = consoleInfoSpy.mock.calls.some((args) =>
      args.some(
        (a) => typeof a === "string" && a.includes("SHOW_REALTIME_JWT_RENEWED outcome: success"),
      ),
    );
    expect(loggedSuccess).toBe(false);

    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // Test B — Renewal status-failure: existing channel disconnects → renewal
  // fires → new channel's first status is TIMED_OUT. The bridge MUST NOT
  // log renewal as successful, MUST NOT run catch-up, and (Codex round 3
  // HIGH) the bridge MUST automatically schedule a follow-on renewal
  // attempt via the pendingRenewalRef path — without requiring an
  // artificial second disconnect.
  test("HIGH (round 2) Test B — renewal new-channel first-status TIMED_OUT: no success log, no catch-up, follow-on retry fires automatically (round 3 pendingRenewalRef path)", async () => {
    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    const initialSubscribeCount = subscribeMock.state.subscribeCalls.length;

    // Trigger renewal via system.disconnected.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // Renewal opened a NEW channel.
    expect(subscribeMock.state.subscribeCalls.length).toBe(initialSubscribeCount + 1);
    const renewalChannel = subscribeMock.state.currentChannel;
    if (!renewalChannel) throw new Error("renewal channel not registered");
    expect(renewalChannel).not.toBe(firstChannel);

    // Fire TIMED_OUT as the FIRST status of the NEW channel — the
    // readiness Promise rejects.
    await act(async () => {
      renewalChannel.fireStatus("TIMED_OUT");
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // No success log fired — the renewal did NOT mark itself successful.
    const loggedSuccess = consoleInfoSpy.mock.calls.some((args) =>
      args.some(
        (a) => typeof a === "string" && a.includes("SHOW_REALTIME_JWT_RENEWED outcome: success"),
      ),
    );
    expect(loggedSuccess).toBe(false);

    // The failed-outcome log fired with reason 'readiness_failed'.
    const loggedFailedReadiness = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "object" &&
          a !== null &&
          (a as { reason?: unknown }).reason === "readiness_failed",
      ),
    );
    expect(loggedFailedReadiness).toBe(true);

    // Codex round 3 HIGH — the failed channel was torn down (no
    // stranded `currentChannelRef`), the pendingRenewalRef path queued
    // a backoff retry, and that retry fires AUTOMATICALLY within the
    // first backoff bucket (250ms). No artificial second disconnect
    // required.
    expect(renewalChannel.removed).toBe(true);
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    // A NEW subscribe was attempted automatically — proves the
    // pendingRenewalRef path drove follow-on recovery without a fresh
    // natural event.
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThanOrEqual(
      initialSubscribeCount + 2,
    );

    // Sanity: the test observed NO router.refresh from the failed
    // renewal's catch-up (we never ran refreshSyncIfMismatch on the
    // unjoined channel). The freshly-spawned renewal opens a new channel
    // that we leave pending, so no catch-up fires there either.
    expect(routerMock.state.refreshCalls).toBe(0);

    consoleInfoSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  // === Codex round 3 HIGH — pendingRenewalRef-driven retry ===
  // Without this flag, when a renewed channel's first status is a
  // failure (TIMED_OUT / CHANNEL_ERROR / CLOSED), the synchronous
  // status callback's renewSubscription invocation returns at the
  // single-flight lock (lock is still held during `await newSubscribed`).
  // The catch path logs and returns; finally releases the lock AFTER
  // the failure status was already discarded. If no further natural
  // event arrives, currentChannelRef stays pointed at the failed
  // channel and the page is stranded.

  // Test C — TIMED_OUT is the LAST event: no subsequent natural status
  // event fires, but the bridge still triggers another renewal via the
  // pendingRenewalRef path within the bounded backoff window. The
  // failed channel is also torn down (currentChannelRef does not point
  // at it).
  test("HIGH (round 3) Test C — renewal TIMED_OUT as the LAST event: bridge auto-retries via pendingRenewalRef within backoff window; failed channel torn down", async () => {
    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    const initialSubscribeCount = subscribeMock.state.subscribeCalls.length;

    // Trigger renewal via system.disconnected.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    expect(subscribeMock.state.subscribeCalls.length).toBe(initialSubscribeCount + 1);
    const renewalChannel = subscribeMock.state.currentChannel;
    if (!renewalChannel) throw new Error("renewal channel not registered");

    // Fire TIMED_OUT as the FIRST and LAST status — no further natural
    // event ever arrives.
    await act(async () => {
      renewalChannel.fireStatus("TIMED_OUT");
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // Failed channel was torn down — currentChannelRef does NOT
    // reference it. (We can't read the ref directly, but if it stayed
    // pointed at the renewalChannel, the next retry would not open a
    // fresh handle. The downstream auto-retry assertion below proves
    // the new attempt happens.)
    expect(renewalChannel.removed).toBe(true);

    // Within the bounded backoff window (250ms first step, with
    // generous tolerance), the bridge AUTO-fires a follow-on
    // renewSubscription via the pendingRenewalRef path.
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThanOrEqual(
      initialSubscribeCount + 2,
    );
  });

  // Test D — Bounded retry: 5 consecutive renewal failures all surface
  // as TIMED_OUT first-statuses. Each failure schedules a backoff retry
  // that is monotonically non-decreasing, capped at 5s. We assert the
  // exponential schedule (250 / 500 / 1000 / 2000 / 5000ms) is observed:
  // an early advance of the timers (e.g., 100ms) does NOT trigger the
  // next retry.
  test("HIGH (round 3) Test D — exponential backoff: 5 consecutive failures observe 250 → 500 → 1000 → 2000 → 5000ms schedule (no tight-loop)", async () => {
    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");
    const initialSubscribeCount = subscribeMock.state.subscribeCalls.length;

    // Kick off the first renewal sequence.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    const expectedDelays = [250, 500, 1000, 2000, 5000];
    let cumulativeNew = 0;
    for (let step = 0; step < expectedDelays.length; step += 1) {
      // Fire TIMED_OUT on the latest channel — readiness rejects.
      const ch = subscribeMock.state.currentChannel;
      if (!ch) throw new Error("expected current channel");
      await act(async () => {
        ch.fireStatus("TIMED_OUT");
      });
      for (let i = 0; i < 10; i += 1) {
        await flushPromises();
      }

      const before = subscribeMock.state.subscribeCalls.length;

      // Tight-loop guard: advancing by less than the expected delay
      // must NOT fire the retry.
      const earlyDelay = Math.max(1, expectedDelays[step]! - 50);
      await act(async () => {
        vi.advanceTimersByTime(earlyDelay);
      });
      for (let i = 0; i < 5; i += 1) {
        await flushPromises();
      }
      expect(subscribeMock.state.subscribeCalls.length).toBe(before);

      // Now advance past the expected delay — retry fires.
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      for (let i = 0; i < 10; i += 1) {
        await flushPromises();
      }
      expect(subscribeMock.state.subscribeCalls.length).toBe(before + 1);
      cumulativeNew += 1;
    }

    // Five renewal attempts after the initial subscribe + initial
    // disconnect-driven renewal (= initialSubscribeCount + 1 new
    // channel, then 5 retries).
    expect(subscribeMock.state.subscribeCalls.length - initialSubscribeCount).toBe(
      1 + cumulativeNew,
    );
  });

  // Test E — Cleanup cancels pending retry: renewal failure scheduled a
  // backoff retry; unmount BEFORE the timeout fires. The retry must NOT
  // call renewSubscription post-unmount (no new mint, no new subscribe).
  test("HIGH (round 3) Test E — unmount during pending backoff retry cancels the retry (no post-unmount renewSubscription)", async () => {
    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    const utils = await mountBridgeAndAwaitSubscribe();
    const firstChannel = subscribeMock.state.currentChannel;
    if (!firstChannel) throw new Error("channel not registered");

    // Trigger renewal.
    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    const renewalChannel = subscribeMock.state.currentChannel;
    if (!renewalChannel) throw new Error("renewal channel not registered");
    const subscribeCountBeforeFailure = subscribeMock.state.subscribeCalls.length;
    const mintCountBeforeFailure = mintCount;

    // Renewal channel's first status is TIMED_OUT → readiness rejects,
    // pendingRenewalRef set, retry scheduled with 250ms first delay.
    await act(async () => {
      renewalChannel.fireStatus("TIMED_OUT");
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // Unmount BEFORE the 250ms backoff timer would have fired.
    utils.unmount();

    // Advance well past the backoff delay — no retry should fire.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // No new subscribe and no new mint after unmount.
    expect(subscribeMock.state.subscribeCalls.length).toBe(subscribeCountBeforeFailure);
    expect(mintCount).toBe(mintCountBeforeFailure);
  });

  // === Important 3 (default-branch warn for unknown system events) ===
  test("unknown system event hits the default branch and warns without crashing", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await mountBridgeAndAwaitSubscribe();
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");
    expect(channel.onSystemHandlers).toHaveLength(1);

    await act(async () => {
      // Cast through unknown — the type rejects this on purpose;
      // production code defends against it via the runtime fence.
      channel.fireSystem({ event: "rebalanced" } as unknown as SystemEvent);
    });
    await flushPromises();

    const warned = consoleWarnSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === "string" && a.includes("unknown system event")),
    );
    expect(warned).toBe(true);
    // No refresh and no renewal — unknown events are inert.
    expect(routerMock.state.refreshCalls).toBe(0);
    expect(subscribeMock.state.subscribeCalls.length).toBe(1);

    consoleWarnSpy.mockRestore();
  });

  // === Codex round 4 HIGH — stale-renewal-after-cleanup ABA race ===
  // Scenario: a renewal's `await newSubscribed` rejects (TIMED_OUT) and
  // the bridge enters its catch path. Inside the catch we tear down the
  // failed channel via `await removeChannel(...)`. If the effect is
  // CLEANED UP and RE-CREATED with a different slug/showId WHILE that
  // removeChannel is still resolving, the old effect's catch resumes
  // post-cleanup. Without a per-effect abort token, the old catch sets
  // `pendingRenewalRef.current = true`; the old finally then reads the
  // generation counter (which has advanced AND been advanced again by
  // the new mount, so it could ABA-match the saved comparand) and
  // schedules a backoff setTimeout that calls renewSubscription against
  // the OLD effect's `slug`/`showId` closures — minting and subscribing
  // for the wrong show, and removing the new effect's healthy channel.
  //
  // The fix is the per-effect abort token: cleanup sets
  // `effectToken.aborted = true`; every async path in the renewal
  // closes over THIS effect's token and bails on `aborted` BEFORE
  // mutating shared refs or scheduling work. Test F pins this fix by
  // simulating the exact race Codex flagged.
  test("HIGH (round 4) Test F — held removeChannel + remount with different slug: stale renewal does NOT mint, subscribe, or remove the new channel", async () => {
    let mintCount = 0;
    const mintCallsBySlug: string[] = [];
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async ({ init }) => {
        mintCount += 1;
        // Capture the slug body so we can assert later that NO mint
        // POSTed for show-A's slug after the remount.
        let slug = "";
        try {
          const body =
            init && typeof init.body === "string"
              ? (JSON.parse(init.body) as { slug?: unknown })
              : null;
          slug = typeof body?.slug === "string" ? body.slug : "";
        } catch {
          slug = "";
        }
        mintCallsBySlug.push(slug);
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    // Step 1: Mount with slug=show-A.
    const utils = render(
      <ShowRealtimeBridge showId="show-A-uuid" slug="show-A" renderVersion="BASELINE" />,
    );
    for (let i = 0; i < 10; i += 1) {
      if (subscribeMock.state.currentChannel) break;
      await flushPromises();
    }
    const showAFirstChannel = subscribeMock.state.currentChannel;
    if (!showAFirstChannel) throw new Error("show-A channel not registered");
    await act(async () => {
      showAFirstChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();
    await flushPromises();

    // Step 2: Trigger renewal on show-A via system.disconnected.
    // (The renewal is the path that ultimately calls
    // `await removeChannel(failedChannel)` in its readiness-failed
    // catch — the line we need to hold across the unmount/remount.)
    await act(async () => {
      showAFirstChannel.fireSystem({ event: "disconnected" });
    });
    // Drain the renewal microtasks until the NEW (post-renewal)
    // channel for show-A is registered.
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    const showARenewalChannel = subscribeMock.state.currentChannel;
    if (!showARenewalChannel) {
      throw new Error("show-A renewal channel not registered");
    }
    expect(showARenewalChannel).not.toBe(showAFirstChannel);

    // Step 3: Install the removeChannel gate BEFORE firing the
    // failure status. The renewal's catch will call removeChannel on
    // the failed channel; that call now blocks until we resolve the
    // gate manually.
    let resolveGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      resolveGate = resolve;
    });
    channelHandlersMock.state.removeChannelGate = gate;

    // Step 4: Fire TIMED_OUT on the renewal channel → readiness
    // rejects → bridge enters the catch path → calls
    // `await removeChannel(failedChannel)` which now blocks on the
    // gate. The bridge's catch is suspended at that await.
    await act(async () => {
      showARenewalChannel.fireStatus("TIMED_OUT");
    });
    // Drain microtasks WITHOUT resolving the gate. The catch's
    // `await removeChannel` is parked here.
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // Snapshot the relevant state BEFORE the remount: capture the
    // mint-count and the subscribe-count that the OLD effect's
    // stale renewal could perturb if the abort token isn't honored.
    const subscribesBeforeRemount = subscribeMock.state.subscribeCalls.length;
    const mintsBeforeRemount = mintCount;

    // Step 5: Re-mount with slug=show-B, showId=show-B-uuid.
    // React will run the cleanup of the show-A effect (which sets
    // effectToken.aborted = true on the old token) and then run a
    // fresh effect for show-B. The show-A effect's catch is STILL
    // parked at `await removeChannel`.
    //
    // For the show-B mount the gate is also active (the same gate
    // applies to all removeChannel calls). The show-B initial mount
    // does not call removeChannel (no old channel to tear down), so
    // its subscribe path runs fine. Drop the gate AFTER show-B's
    // channel is registered so the show-B side never blocks.
    utils.rerender(
      <ShowRealtimeBridge showId="show-B-uuid" slug="show-B" renderVersion="BASELINE" />,
    );
    // Drain enough microtasks for show-B's mint + subscribe to land.
    for (let i = 0; i < 15; i += 1) {
      if (
        subscribeMock.state.currentChannel &&
        subscribeMock.state.currentChannel !== showARenewalChannel
      ) {
        break;
      }
      await flushPromises();
    }
    const showBChannel = subscribeMock.state.currentChannel;
    if (!showBChannel) throw new Error("show-B channel not registered");
    expect(showBChannel).not.toBe(showARenewalChannel);
    // Resolve SUBSCRIBED on show-B so its readiness gate releases
    // (we don't strictly need it for the assertion, but it makes
    // the bridge state realistic).
    await act(async () => {
      showBChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();

    // Capture the subscribe sequence so we can assert no show-A
    // slug mints / subscribes after the remount.
    const subscribesByShow = subscribeMock.state.subscribeCalls.map((c) => c.showId);
    const mintsBySlugBeforeStaleResume = [...mintCallsBySlug];

    // === Snapshot AFTER remount, BEFORE resolveGate + timer drain ===
    // `mintCount` and the subscribe array at this point already
    // include show-B's initial mint/subscribe; any increase past
    // these values would prove a stale renewal fired.
    const mintCountAtSnapshot = mintCount;
    const subscribesAtSnapshot = subscribeMock.state.subscribeCalls.length;
    void mintsBeforeRemount;
    void subscribesByShow;
    void mintsBySlugBeforeStaleResume;

    // Step 6: Resolve the held removeChannel — the show-A effect's
    // catch resumes. This is the ABA window: with the round-4 fix,
    // `effectToken.aborted` is true, so:
    //   - The catch does NOT set pendingRenewalRef.current = true.
    //   - The finally observes effectToken.aborted and skips
    //     scheduling the retry setTimeout.
    // Without the fix, the catch sets the flag, the finally schedules
    // a retry against the live (show-B's) generation counter, the
    // setTimeout fires renewSubscription with the OLD slug='show-A',
    // mints a token for show-A, opens a show-A channel, and removes
    // the live show-B channel.
    await act(async () => {
      resolveGate();
      // Drain the resumed-catch + finally microtasks so any
      // setTimeout the OLD finally schedules is actually scheduled
      // before we advance fake timers below.
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // Step 7: Advance well past the longest backoff bucket (5s).
    // If the abort-token fence is missing, a stale retry would fire
    // somewhere in this window.
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // === Assertions ===

    // No NEW mint POSTed to /api/realtime/subscriber-token for
    // show-A's slug after the remount. The only legal mint between
    // remount and end-of-test is show-B's initial mint.
    const mintsAfterRemountSlugs = mintCallsBySlug.slice(
      // The first `mintsBeforeRemount` entries are show-A's initial
      // and show-A's renewal mints — pre-remount.
      mintsBeforeRemount,
    );
    // After the remount, exactly one mint for show-B is legal. Any
    // mint for show-A would prove the stale renewal fired.
    expect(mintsAfterRemountSlugs).not.toContain("show-A");

    // The current (show-B) channel was NOT removed by a stale
    // renewSubscription. The bug would call removeChannel on
    // currentChannelRef, which is now show-B's channel.
    expect(showBChannel.removed).toBe(false);

    // No new mint and no new subscribe fired AFTER the stale-resume
    // window. Snapshot was taken just before resolveGate + 10s drain
    // — these counts must be unchanged.
    expect(mintCount).toBe(mintCountAtSnapshot);
    expect(subscribeMock.state.subscribeCalls.length).toBe(subscribesAtSnapshot);

    // The stale renewal did not subscribe against show-A's showId
    // post-remount.
    const subscribesAfterRemountIds = subscribeMock.state.subscribeCalls
      .slice(subscribesBeforeRemount)
      .map((c) => c.showId);
    expect(subscribesAfterRemountIds).not.toContain("show-A-uuid");
  });

  // === Codex round 5 HIGH — owner-token lock vs boolean lock ===
  // Scenario: show-A is mid-renewal — its `renewSubscription` has
  // acquired the single-flight lock and is parked at `await
  // mintSubscriberToken` inside the try block. The effect cleans up
  // (sets effectToken.aborted=true) and a new effect for show-B mounts.
  //
  // With a BOOLEAN lock (`isRenewingRef.current = true`), show-B's
  // first failure-driven `renewSubscription` returns immediately at
  // `if (isRenewingRef.current) return` — show-A's stale renewal is
  // suppressing show-B's recovery flow even though show-A is dead.
  // Worse, when show-A's mint eventually resolves and it walks through
  // its finally, it unconditionally clears the boolean — which can
  // race a (later) show-B renewal that has since acquired the lock,
  // re-opening the overlapping-renewal race the lock was meant to
  // prevent.
  //
  // With an OWNER-TOKEN lock, show-A's stale acquire stamps the lock
  // with show-A's token. Cleanup nulls the lock for the unmounting
  // owner so show-B can acquire cleanly. Show-A's resumed finally
  // checks `renewalOwnerRef.current === effectToken` — show-B's token
  // is now the owner, so the stale finally is a no-op against the
  // live owner.
  //
  // Tests G + H pin the owner-token contract end-to-end. Round-6 review
  // strengthened both tests so the failure modes are actually exercised:
  // Test G now holds show-B's renewal mint WHILE show-A's stale finally
  // runs (so the lock is genuinely owned by a live, non-show-A holder),
  // and Test H now drives show-B's renewal channel to TIMED_OUT to
  // exercise the readiness-failure → pendingRenewalRef → 250ms-backoff
  // recovery path end-to-end.
  test("HIGH (round 5/6) Test G — stale show-A finally does NOT clear show-B's live renewal lock; second show-B renewal during held first is suppressed", async () => {
    // Three held promises. The fetch handler parks the SHOW-A renewal
    // mint (call #2) AND the FIRST SHOW-B renewal mint (call #4).
    // Round-6 fix: holding the show-B renewal mint keeps the
    // owner-token lock OWNED BY show-B at the moment show-A's stale
    // finally runs — so the assertion that the stale finally does
    // NOT clear the lock is genuinely load-bearing. Without this,
    // the prior round-5 test let show-B's renewal complete (which
    // already cleared the lock to null) before show-A's finally ran,
    // making the equality check in production untestable.
    let mintCount = 0;
    let releaseShowARenewalMint: () => void = () => {};
    let releaseShowBRenewalMint: () => void = () => {};
    const showARenewalMintHeld = new Promise<void>((resolve) => {
      releaseShowARenewalMint = resolve;
    });
    const showBRenewalMintHeld = new Promise<void>((resolve) => {
      releaseShowBRenewalMint = resolve;
    });
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        // CRITICAL: capture the per-call counter NOW. After we await
        // a held promise and resume, the global mintCount has
        // already advanced (later calls have run). Re-evaluating
        // `mintCount === 4` post-await would cause mint #2 (show-A's
        // parked renewal mint) to ALSO park on showBRenewalMintHeld
        // when it resumes — defeating the intended ordering.
        const myCall = mintCount;
        if (myCall === 2) {
          // show-A's renewal mint: park here.
          await showARenewalMintHeld;
        } else if (myCall === 4) {
          // show-B's FIRST renewal mint: park here so the
          // owner-token lock stays owned by show-B's effect token
          // while show-A's stale finally runs.
          await showBRenewalMintHeld;
        }
        return new Response(JSON.stringify({ jwt: `jwt-mint-${myCall}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    // Step 1: Mount with slug=show-A. Drive through SUBSCRIBED.
    const utils = render(
      <ShowRealtimeBridge showId="show-A-uuid" slug="show-A" renderVersion="BASELINE" />,
    );
    for (let i = 0; i < 10; i += 1) {
      if (subscribeMock.state.currentChannel) break;
      await flushPromises();
    }
    const showAFirstChannel = subscribeMock.state.currentChannel;
    if (!showAFirstChannel) throw new Error("show-A channel not registered");
    await act(async () => {
      showAFirstChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();

    // Step 2: Trigger renewal on show-A. Its renewSubscription
    // acquires the lock with show-A's effect token and parks at the
    // mint await. The mint Promise is held by showARenewalMintHeld.
    await act(async () => {
      showAFirstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 5; i += 1) {
      await flushPromises();
    }
    expect(mintCount).toBe(2);
    expect(subscribeMock.state.subscribeCalls.length).toBe(1);

    // Step 3: Re-mount with slug=show-B. React runs cleanup of show-A
    // (aborts show-A's effect token; releases the owner-token lock
    // because the cleaning-up effect IS the owner) then mounts a
    // fresh show-B effect. show-B's initial mint (call #3) resolves
    // immediately and show-B subscribes.
    utils.rerender(
      <ShowRealtimeBridge showId="show-B-uuid" slug="show-B" renderVersion="BASELINE" />,
    );
    for (let i = 0; i < 15; i += 1) {
      if (
        subscribeMock.state.currentChannel &&
        subscribeMock.state.currentChannel !== showAFirstChannel
      ) {
        break;
      }
      await flushPromises();
    }
    const showBChannel = subscribeMock.state.currentChannel;
    if (!showBChannel) throw new Error("show-B channel not registered");
    expect(showBChannel).not.toBe(showAFirstChannel);
    await act(async () => {
      showBChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();
    expect(mintCount).toBe(3);

    // Step 4: Trigger renewal on show-B (system.disconnected). The
    // cleanup of show-A nulled the lock, so show-B's renewSubscription
    // acquires cleanly with show-B's effect token, then PARKS at the
    // mint await (call #4 is held). The owner-token lock is now
    // OWNED by show-B's live token.
    await act(async () => {
      showBChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 5; i += 1) {
      await flushPromises();
    }
    expect(mintCount).toBe(4);
    // No new subscribe yet — show-B's renewal is parked at the mint
    // await before subscribeToShow is invoked.
    expect(subscribeMock.state.subscribeCalls.length).toBe(2);

    // Step 5: NOW release show-A's held mint. show-A's stale renewal
    // resumes from the await. The post-await `if (effectToken.aborted)
    // return` short-circuits BEFORE any setAuth / removeChannel /
    // subscribeToShow / await newSubscribed work. Control falls
    // through to finally.
    //
    // === CORE ASSERTION (round-6 strengthening) ===
    // The stale show-A finally MUST NOT clear the lock — the lock is
    // currently owned by show-B's live, parked-at-mint renewal. The
    // production guard `if (renewalOwnerRef.current === effectToken)`
    // is what prevents the stale clear; with an unconditional
    // `renewalOwnerRef.current = null` in the finally, the lock would
    // be wrongly nulled and step 6's second show-B disconnect would
    // proceed to mint — which we assert against below.
    // Resolve show-A's parked mint OUTSIDE act so the resumed
    // microtask chain (fetch → Response.json → mintSubscriberToken
    // → renewSubscription line 316 → finally) drains naturally
    // through the test's microtask cycles. We then drain liberally
    // inside act so any React state from the stale finally (none
    // expected, but defensive) is committed.
    releaseShowARenewalMint();
    for (let i = 0; i < 50; i += 1) {
      // Bare Promise.resolve() outside act — pure microtask drain.
      await Promise.resolve();
    }
    for (let i = 0; i < 20; i += 1) {
      await flushPromises();
    }
    // Belt-and-suspenders: advance fake timers a tick in case any
    // stray Promise resolution scheduled a 0ms task.
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    for (let i = 0; i < 20; i += 1) {
      await flushPromises();
    }

    // Step 6: Fire ANOTHER system.disconnected on show-B's initial
    // channel. The handler invokes renewSubscription, which checks
    // `renewalOwnerRef.current !== null`. If the lock is still owned
    // by show-B's first (held) renewal, this second call MUST be
    // suppressed — no new mint, no new subscribe.
    //
    // Negative-regression hook: if production were `renewalOwnerRef
    // = null` in the finally (no equality check), step 5 above would
    // have nulled the lock, this second call would acquire cleanly,
    // proceed past the held mint via call #5 (which the fetch handler
    // resolves immediately), and advance both mintCount and
    // subscribeCalls.length here.
    const mintCountBeforeSecondDisconnect = mintCount;
    const subscribesBeforeSecondDisconnect = subscribeMock.state.subscribeCalls.length;
    await act(async () => {
      showBChannel.fireSystem({ event: "disconnected" });
    });
    // Drain microtasks so any erroneous-acquire mint POST + subscribe
    // would have landed by now.
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    // === ROUND-6 CORE ASSERTION ===
    // The owner-token lock is still held by show-B's first renewal,
    // so the second renewal call bails. mintCount and subscribeCalls
    // both unchanged.
    expect(mintCount).toBe(mintCountBeforeSecondDisconnect);
    expect(subscribeMock.state.subscribeCalls.length).toBe(subscribesBeforeSecondDisconnect);

    // Step 7: Release show-B's first renewal mint. show-B's first
    // renewal proceeds: setAuth → removeChannel(showB initial) →
    // subscribeToShow → new renewal channel → await newSubscribed.
    // Drive the renewal channel to SUBSCRIBED so the finally runs
    // its lock-release path (owner === effectToken_B → clears).
    await act(async () => {
      releaseShowBRenewalMint();
      for (let i = 0; i < 15; i += 1) {
        await Promise.resolve();
      }
    });
    for (let i = 0; i < 15; i += 1) {
      await flushPromises();
    }
    // A new renewal channel is now registered.
    const showBRenewalChannel = subscribeMock.state.currentChannel;
    if (!showBRenewalChannel) {
      throw new Error("show-B renewal channel not registered");
    }
    expect(showBRenewalChannel).not.toBe(showBChannel);
    expect(subscribeMock.state.subscribeCalls.length).toBe(3);
    await act(async () => {
      showBRenewalChannel.fireStatus("SUBSCRIBED");
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }

    // Step 8: Verify the lock IS now releasable by show-B's owner.
    // Fire a fresh disconnect on the renewal channel — a new
    // renewSubscription call should pass the lock check (owner is
    // null now), mint a NEW token (call #5), and open a fresh
    // channel. This proves the owner-token release worked correctly
    // when the owner matched.
    const mintCountBeforeThirdDisconnect = mintCount;
    const subscribesBeforeThirdDisconnect = subscribeMock.state.subscribeCalls.length;
    await act(async () => {
      showBRenewalChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 15; i += 1) {
      await flushPromises();
    }
    expect(mintCount).toBeGreaterThan(mintCountBeforeThirdDisconnect);
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThan(
      subscribesBeforeThirdDisconnect,
    );
  });

  // Test H — show-B's renewal channel reports TIMED_OUT while show-A's
  // mint is still held. The readiness-failure path sets
  // pendingRenewalRef, the owner-token finally clears the lock, and the
  // 250ms backoff timer fires the retry. Round-6 fix: the prior version
  // drove show-B's renewal to SUBSCRIBED, which never entered the
  // readiness-failure catch — making the pendingRenewalRef + backoff
  // contract untested. This rewrite drives TIMED_OUT, advances the
  // 250ms timer, and asserts the retry actually fires.
  test("HIGH (round 5/6) Test H — show-B's renewal TIMED_OUT during stale show-A renewal: pendingRenewalRef + 250ms backoff retry mints/subscribes a fresh channel", async () => {
    let mintCount = 0;
    let releaseShowARenewalMint: () => void = () => {};
    const showARenewalMintHeld = new Promise<void>((resolve) => {
      releaseShowARenewalMint = resolve;
    });
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        if (mintCount === 2) {
          await showARenewalMintHeld;
        }
        return new Response(JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );

    // Step 1: Mount show-A → SUBSCRIBED. mintCount=1.
    const utils = render(
      <ShowRealtimeBridge showId="show-A-uuid" slug="show-A" renderVersion="BASELINE" />,
    );
    for (let i = 0; i < 10; i += 1) {
      if (subscribeMock.state.currentChannel) break;
      await flushPromises();
    }
    const showAFirstChannel = subscribeMock.state.currentChannel;
    if (!showAFirstChannel) throw new Error("show-A channel not registered");
    await act(async () => {
      showAFirstChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();

    // Step 2: Trigger renewal on show-A → parked at held mint #2.
    await act(async () => {
      showAFirstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 5; i += 1) {
      await flushPromises();
    }
    expect(mintCount).toBe(2);

    // Step 3: Re-mount with show-B; cleanup releases show-A's lock
    // ownership; show-B initial mint #3 + subscribe; SUBSCRIBED.
    utils.rerender(
      <ShowRealtimeBridge showId="show-B-uuid" slug="show-B" renderVersion="BASELINE" />,
    );
    for (let i = 0; i < 15; i += 1) {
      if (
        subscribeMock.state.currentChannel &&
        subscribeMock.state.currentChannel !== showAFirstChannel
      ) {
        break;
      }
      await flushPromises();
    }
    const showBChannel = subscribeMock.state.currentChannel;
    if (!showBChannel) throw new Error("show-B channel not registered");
    await act(async () => {
      showBChannel.fireStatus("SUBSCRIBED");
    });
    await flushPromises();
    expect(mintCount).toBe(3);

    // Step 4: Trigger show-B renewal via system.disconnected. show-B's
    // renewSubscription acquires the lock (show-A's stale ownership
    // was released by cleanup), mints (call #4), advances generation,
    // removeChannel(showB initial), and subscribeToShow opens the
    // renewal channel. Then `await newSubscribed` parks until the
    // renewal channel reports a status.
    const subscribesBeforeRenewal = subscribeMock.state.subscribeCalls.length;
    await act(async () => {
      showBChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 15; i += 1) {
      await flushPromises();
    }
    expect(mintCount).toBe(4);
    // A renewal channel is now registered.
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThan(subscribesBeforeRenewal);
    const showBRenewalChannel = subscribeMock.state.currentChannel;
    if (!showBRenewalChannel) {
      throw new Error("show-B renewal channel not registered");
    }
    expect(showBRenewalChannel).not.toBe(showBChannel);

    // Step 5: Drive the renewal channel to TIMED_OUT. The
    // `await newSubscribed` REJECTS → catch path: removeChannel(failed),
    // `pendingRenewalRef.current = true` (because !effectToken.aborted).
    // Falls through finally: `renewalOwnerRef.current === effectToken`
    // (show-B's token IS the current owner) → lock cleared.
    // pendingRenewalRef is set + isMounted + !aborted → schedule
    // setTimeout at backoffSchedule[0] = 250ms.
    const mintCountBeforeBackoff = mintCount;
    const subscribesBeforeBackoff = subscribeMock.state.subscribeCalls.length;
    await act(async () => {
      showBRenewalChannel.fireStatus("TIMED_OUT");
    });
    // Drain microtasks so the catch + finally have run and the
    // 250ms setTimeout is enqueued.
    for (let i = 0; i < 15; i += 1) {
      await flushPromises();
    }
    // The TIMED_OUT readiness-failure must NOT have fired a NEW
    // mint/subscribe yet — the retry is gated on the 250ms timer.
    expect(mintCount).toBe(mintCountBeforeBackoff);
    expect(subscribeMock.state.subscribeCalls.length).toBe(subscribesBeforeBackoff);
    // The failed renewal channel was torn down by the catch's
    // removeChannel call.
    expect(showBRenewalChannel.removed).toBe(true);

    // Step 6: Advance fake timers PAST the 250ms backoff window.
    // The pendingRenewalRef setTimeout fires → re-enters
    // renewSubscription → acquires lock (now released) → mints (call
    // #5) → opens a fresh renewal channel.
    //
    // Negative-regression hook: if the production finally OMITTED the
    // pendingRenewalRef setTimeout scheduling block, no retry fires.
    // mintCount and subscribeCalls.length stay at their step-5 values
    // and the assertions below fail.
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    for (let i = 0; i < 15; i += 1) {
      await flushPromises();
    }

    // === ROUND-6 CORE ASSERTION ===
    // The pendingRenewalRef + 250ms backoff retry actually fired. A
    // NEW mint POSTed; a NEW subscribeToShow opened a fresh channel.
    expect(mintCount).toBeGreaterThan(mintCountBeforeBackoff);
    expect(subscribeMock.state.subscribeCalls.length).toBeGreaterThan(subscribesBeforeBackoff);
    const showBRetryChannel = subscribeMock.state.currentChannel;
    if (!showBRetryChannel) {
      throw new Error("show-B retry channel not registered");
    }
    expect(showBRetryChannel).not.toBe(showBRenewalChannel);
    expect(showBRetryChannel).not.toBe(showBChannel);

    // Step 7: Release show-A's held mint AFTER the retry has fired.
    // show-A's stale renewal still walks finally as a no-op (owner
    // is now show-B's retry token; aborted token blocks any
    // pendingRenewalRef scheduling). No additional mints/subscribes.
    const mintCountAtSnapshot = mintCount;
    const subscribesAtSnapshot = subscribeMock.state.subscribeCalls.length;
    await act(async () => {
      releaseShowARenewalMint();
      for (let i = 0; i < 15; i += 1) {
        await Promise.resolve();
      }
    });
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    for (let i = 0; i < 10; i += 1) {
      await flushPromises();
    }
    expect(mintCount).toBe(mintCountAtSnapshot);
    expect(subscribeMock.state.subscribeCalls.length).toBe(subscribesAtSnapshot);
  });
});
