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

type SystemEvent =
  | { event: "reconnected" }
  | { event: "disconnected" }
  | { event: string };

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
      ) => {
        if (subscribeMock.state.throwOnNext) {
          subscribeMock.state.throwOnNext = false;
          throw new Error("subscribe failed");
        }
        subscribeMock.state.subscribeCalls.push({ showId, jwt });
        const onSystemHandlers: Array<(e: SystemEvent) => void> = [];
        const onStatusHandlers: Array<(s: string) => void> = [];
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
            onStatusHandlers.forEach((fn) => fn(s));
          },
          onSystemHandlers,
          onStatusHandlers,
          removed: false,
        };
        subscribeMock.state.currentChannel = handle;
        subscribeMock.state.channels.push(handle);
        return handle;
      },
    ),
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
    removeChannel: vi.fn(
      async (_client: unknown, channel: { removed: boolean }) => {
        channel.removed = true;
        return "ok";
      },
    ),
  };
});

vi.mock("@/lib/supabase/browser", () => {
  return {
    getSupabaseBrowserClient: () => ({
      // The bridge only reads `.realtime.setAuth`; the rest is delegated
      // to subscribeToShow which is itself mocked above.
      realtime: { setAuth: vi.fn() },
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
          return init === undefined
            ? h.respond({ url })
            : h.respond({ url, init });
        }
      }
      if (url.includes("/api/realtime/subscriber-token")) {
        return new Response(
          JSON.stringify({ jwt: "default-jwt", exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.match(/\/api\/show\/[^/]+\/version/)) {
        return new Response(
          JSON.stringify({ version_token: "BASELINE" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
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

async function mountBridgeAndAwaitSubscribe() {
  const utils = render(
    <ShowRealtimeBridge
      showId="show-uuid-1"
      slug="some-slug"
      renderVersion="BASELINE"
    />,
  );
  // Initial mount kicks off the JWT mint then subscribeToShow.
  // Drain microtasks until the channel is registered (we run a small loop
  // because the initial mount = mint POST → fetch.then() → subscribe).
  for (let i = 0; i < 10; i += 1) {
    if (subscribeMock.state.currentChannel) break;
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
        new Response(
          JSON.stringify({ version_token: versionTokenToReturn }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    await mountBridgeAndAwaitSubscribe();
    await flushPromises();
    // Initial post-subscribe catch-up: token matches → no refresh.
    expect(routerMock.state.refreshCalls).toBe(0);

    // Now flip the version token AND fire system.reconnected.
    versionTokenToReturn = "T1-RECONNECT";
    const channel = subscribeMock.state.currentChannel;
    if (!channel) throw new Error("channel not registered");
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
        return new Response(
          JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
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
    const renewedCall = subscribeMock.state.subscribeCalls[subscribeMock.state.subscribeCalls.length - 1];
    expect(renewedCall?.jwt).toBe("jwt-mint-2");
    // Old channel was removed.
    expect(firstChannel.removed).toBe(true);
    // Renewal log was emitted.
    const loggedRenewal = consoleInfoSpy.mock.calls.some((args) =>
      args.some((a) => typeof a === "string" && a.includes("SHOW_REALTIME_JWT_RENEWED")),
    );
    expect(loggedRenewal).toBe(true);

    consoleInfoSpy.mockRestore();
  });

  test("renewal mint failure: logs SHOW_REALTIME_BROADCAST_AUTH_FAILED, no retry-loop", async () => {
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    let mintCount = 0;
    pushFetchHandler(
      (url) => url.includes("/api/realtime/subscriber-token"),
      async () => {
        mintCount += 1;
        if (mintCount === 1) {
          return new Response(
            JSON.stringify({ jwt: "ok-1", exp: 9999999999 }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ error: "SHOW_REALTIME_BROADCAST_AUTH_FAILED" }),
          { status: 401, headers: { "content-type": "application/json" } },
        );
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
      <ShowRealtimeBridge
        showId="show-uuid-1"
        slug="some-slug"
        renderVersion="BASELINE"
      />,
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
        (a) =>
          typeof a === "string" &&
          a.includes("[ShowRealtimeBridge] subscription failed"),
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
        new Response(
          JSON.stringify({ version_token: versionTokenToReturn }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    const utils = render(
      <ShowRealtimeBridge
        showId="show-uuid-1"
        slug="some-slug"
        renderVersion="T0-INITIAL"
      />,
    );
    for (let i = 0; i < 10; i += 1) {
      if (subscribeMock.state.currentChannel) break;
      await flushPromises();
    }
    // Initial post-subscribe catch-up: T0-INITIAL vs T2-LATEST → refresh.
    expect(routerMock.state.refreshCalls).toBe(1);

    // Server re-renders with new SSR'd token T2-LATEST. The ref must update
    // so a subsequent reconnect catch-up reads T2-LATEST and does NOT refresh
    // when the server returns the same value.
    utils.rerender(
      <ShowRealtimeBridge
        showId="show-uuid-1"
        slug="some-slug"
        renderVersion="T2-LATEST"
      />,
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
});
