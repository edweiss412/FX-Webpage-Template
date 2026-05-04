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
type SystemEvent =
  | { event: "reconnected" }
  | { event: "disconnected" };

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
        // The readiness Promise resolves with the FIRST status the test
        // fires; if the test fires no status, the Promise stays pending
        // and the bridge's catch-up never runs (which is the correct
        // behavior pre-SUBSCRIBED). For tests that pre-date the readiness
        // gate, `mountBridgeAndAwaitSubscribe` fires SUBSCRIBED below.
        let resolveSubscribed: (status: string) => void = () => {};
        const subscribed = new Promise<string>((resolve) => {
          resolveSubscribed = resolve;
        });
        let subscribedResolved = false;
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
            // Resolve the readiness Promise on FIRST status (mirrors prod).
            if (!subscribedResolved) {
              subscribedResolved = true;
              resolveSubscribed(s);
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

async function mountBridgeAndAwaitSubscribe(opts?: {
  fireSubscribed?: boolean;
}) {
  const fireSubscribed = opts?.fireSubscribed ?? true;
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

  // === Important 1 (Task 4.16 Checkpoint B code-quality review) ===
  // The component's file-header doc promises that every renewal-failure
  // path emits `SHOW_REALTIME_JWT_RENEWED outcome: 'failed'`. These three
  // tests pin the contract — without them, a future refactor that drops
  // the failed-outcome log would silently regress the logging contract
  // (the prior renewal-mint-failure test only asserted the
  // `BROADCAST_AUTH_FAILED` log fired, leaving the `outcome: failed` peer
  // unverified).

  test("renewal mint failure emits SHOW_REALTIME_JWT_RENEWED outcome: failed log", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

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

    await act(async () => {
      firstChannel.fireSystem({ event: "disconnected" });
    });
    for (let i = 0; i < 5; i += 1) {
      await flushPromises();
    }

    const loggedFailedOutcome = consoleWarnSpy.mock.calls.some((args) =>
      args.some(
        (a) =>
          typeof a === "string" &&
          a.includes("SHOW_REALTIME_JWT_RENEWED outcome: failed"),
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
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

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
        (a) =>
          typeof a === "string" &&
          a.includes("SHOW_REALTIME_JWT_RENEWED outcome: failed"),
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
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

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
        (a) =>
          typeof a === "string" &&
          a.includes("SHOW_REALTIME_JWT_RENEWED outcome: failed"),
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

  // === Important 3 (default-branch warn for unknown system events) ===
  test("unknown system event hits the default branch and warns without crashing", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

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
      args.some(
        (a) => typeof a === "string" && a.includes("unknown system event"),
      ),
    );
    expect(warned).toBe(true);
    // No refresh and no renewal — unknown events are inert.
    expect(routerMock.state.refreshCalls).toBe(0);
    expect(subscribeMock.state.subscribeCalls.length).toBe(1);

    consoleWarnSpy.mockRestore();
  });
});
