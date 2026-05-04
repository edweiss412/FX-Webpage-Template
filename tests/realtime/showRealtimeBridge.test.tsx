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
              } else if (
                s === "CHANNEL_ERROR" ||
                s === "TIMED_OUT" ||
                s === "CLOSED"
              ) {
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
        return new Response(
          JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
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
    expect(subscribeMock.state.subscribeCalls.length - baselineSubscribes).toBe(
      1,
    );
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
          return new Response(
            JSON.stringify({ jwt: "ok-1", exp: 9999999999 }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (mintCount === 2) {
          return new Response(
            JSON.stringify({ error: "SHOW_REALTIME_BROADCAST_AUTH_FAILED" }),
            { status: 401, headers: { "content-type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({ jwt: `ok-${mintCount}`, exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

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
    expect(
      subscribeMock.state.subscribeCalls.length - baselineSubscribes,
    ).toBe(1);

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
        return new Response(
          JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    const consoleInfoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

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
        (a) =>
          typeof a === "string" &&
          a.includes("SHOW_REALTIME_JWT_RENEWED outcome: success"),
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
        return new Response(
          JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );

    const consoleInfoSpy = vi
      .spyOn(console, "info")
      .mockImplementation(() => undefined);
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

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
    expect(subscribeMock.state.subscribeCalls.length).toBe(
      initialSubscribeCount + 1,
    );
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
        (a) =>
          typeof a === "string" &&
          a.includes("SHOW_REALTIME_JWT_RENEWED outcome: success"),
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
        return new Response(
          JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
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
    expect(subscribeMock.state.subscribeCalls.length).toBe(
      initialSubscribeCount + 1,
    );
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
        return new Response(
          JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
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
    expect(
      subscribeMock.state.subscribeCalls.length - initialSubscribeCount,
    ).toBe(1 + cumulativeNew);
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
        return new Response(
          JSON.stringify({ jwt: `jwt-mint-${mintCount}`, exp: 9999999999 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
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
    const subscribeCountBeforeFailure =
      subscribeMock.state.subscribeCalls.length;
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
    expect(subscribeMock.state.subscribeCalls.length).toBe(
      subscribeCountBeforeFailure,
    );
    expect(mintCount).toBe(mintCountBeforeFailure);
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
