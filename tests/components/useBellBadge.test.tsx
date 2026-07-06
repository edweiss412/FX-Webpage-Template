// @vitest-environment jsdom
/**
 * useBellBadge — bell badge freshness + realtime wiring (bell notification
 * center Task 12, spec §4/§5). Cloned from
 * tests/components/admin/nav/useNeedsAttentionBadge.test.tsx's race-safe
 * core, with the deviation pinned by spec §5.4 ("bell keeps, not hides"):
 * a fetch fault keeps the last-known count and sets `degraded`, instead of
 * nulling the badge.
 *
 * The realtime source (mount-once POST token + subscribeToBell) is mocked
 * so these tests exercise sources 1-3 (prop/pathname) deterministically;
 * `subscribeToBell` itself is covered by tests/realtime/subscribeToBell.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { useBellBadge } from "@/components/admin/nav/useBellBadge";
import type { BellCountResult } from "@/lib/admin/bellFeed";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

const removeChannelMock = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    removeChannel: (...args: unknown[]) => removeChannelMock(...args),
  }),
}));

const subscribeToBellMock = vi.fn();
vi.mock("@/lib/realtime/subscribeToBell", () => ({
  subscribeToBell: (...args: unknown[]) => subscribeToBellMock(...args),
}));

const fetchSpy = vi.fn();

beforeEach(() => {
  mockPathname = "/admin";
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
  subscribeToBellMock.mockReset();
  removeChannelMock.mockReset();
  // Default: realtime mount-once effect's token POST + subscribe never
  // resolves during these tests (a pending fetch is inert for assertions
  // scoped to sources 1-3). Individual tests override as needed.
  fetchSpy.mockImplementation((url: string) => {
    if (url === "/api/admin/alerts/bell/token") {
      return new Promise(() => {}); // never resolves
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  subscribeToBellMock.mockReturnValue({
    channel: {},
    subscribed: new Promise(() => {}),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBadgeHook(initial: BellCountResult) {
  return renderHook(({ value }: { value: BellCountResult }) => useBellBadge(value), {
    initialProps: { value: initial },
  });
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe("useBellBadge", () => {
  it("initial {kind:'ok', count:3} → count 3, degraded false", () => {
    const { result } = renderBadgeHook({ kind: "ok", count: 3 });
    expect(result.current.count).toBe(3);
    expect(result.current.degraded).toBe(false);
  });

  it("initial {kind:'infra_error'} → count null, degraded true", () => {
    const { result } = renderBadgeHook({ kind: "infra_error" });
    expect(result.current.count).toBeNull();
    expect(result.current.degraded).toBe(true);
  });

  it("prop change to infra_error keeps the last-known count (deviation from useNeedsAttentionBadge) and sets degraded", () => {
    const { result, rerender } = renderBadgeHook({ kind: "ok", count: 5 });
    expect(result.current.count).toBe(5);

    rerender({ value: { kind: "infra_error" } });

    expect(result.current.count).toBe(5); // kept, not nulled
    expect(result.current.degraded).toBe(true);
  });

  it("prop change back to ok clears degraded and commits the new count", () => {
    const { result, rerender } = renderBadgeHook({ kind: "infra_error" });
    expect(result.current.degraded).toBe(true);

    rerender({ value: { kind: "ok", count: 8 } });

    expect(result.current.count).toBe(8);
    expect(result.current.degraded).toBe(false);
  });

  it("pathname change fetches the bell count route; ok {count: 7} commits 7", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/admin/alerts/bell/count") return Promise.resolve(okResponse({ count: 7 }));
      return new Promise(() => {});
    });
    const { result, rerender } = renderBadgeHook({ kind: "ok", count: 2 });
    mockPathname = "/admin/settings";
    rerender({ value: { kind: "ok", count: 2 } });

    await waitFor(() => expect(result.current.count).toBe(7));
    expect(result.current.degraded).toBe(false);
    const countCalls = fetchSpy.mock.calls.filter(
      (call) => call[0] === "/api/admin/alerts/bell/count",
    );
    expect(countCalls).toHaveLength(1);
  });

  it("fetch fault on pathname change keeps the last-known count and sets degraded (spec §5.4 — bell keeps, not hides)", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/admin/alerts/bell/count") return Promise.reject(new Error("network down"));
      return new Promise(() => {});
    });
    const { result, rerender } = renderBadgeHook({ kind: "ok", count: 4 });
    mockPathname = "/admin/settings";
    rerender({ value: { kind: "ok", count: 4 } });

    await waitFor(() => expect(result.current.degraded).toBe(true));
    expect(result.current.count).toBe(4); // kept, not nulled
  });

  it("stale-fetch suppression: an older in-flight pathname fetch resolving AFTER a newer one must NOT clobber the fresher result, and is aborted", async () => {
    let resolveFirst!: (value: unknown) => void;
    let firstSignal: AbortSignal | undefined;
    let callIndex = 0;
    fetchSpy.mockImplementation((url: string, init?: { signal: AbortSignal }) => {
      if (url === "/api/admin/alerts/bell/token") return new Promise(() => {});
      callIndex += 1;
      if (callIndex === 1) {
        firstSignal = init?.signal;
        return new Promise((resolve) => {
          resolveFirst = resolve;
        });
      }
      return Promise.resolve(okResponse({ count: 9 }));
    });

    const { result, rerender } = renderBadgeHook({ kind: "ok", count: 1 });

    // First pathname change starts fetch #1 (deferred).
    mockPathname = "/admin/settings";
    rerender({ value: { kind: "ok", count: 1 } });
    expect(firstSignal?.aborted).toBe(false);

    // Second pathname change starts fetch #2, which resolves immediately
    // with count 9 and aborts fetch #1.
    mockPathname = "/admin/show/abc";
    rerender({ value: { kind: "ok", count: 1 } });

    await waitFor(() => expect(result.current.count).toBe(9));
    expect(firstSignal?.aborted).toBe(true);

    // Fetch #1 resolves late with a STALE count — must NOT clobber.
    resolveFirst(okResponse({ count: 2 }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.count).toBe(9);
  });

  it("refetch() manually triggers the same race-safe fetch", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/admin/alerts/bell/count") return Promise.resolve(okResponse({ count: 11 }));
      return new Promise(() => {});
    });
    const { result } = renderBadgeHook({ kind: "ok", count: 1 });

    result.current.refetch();

    await waitFor(() => expect(result.current.count).toBe(11));
  });

  it("zeroNow zeroes the count client-side without touching degraded, discards a pre-zero in-flight count, and lets a post-zero refetch restore server truth (spec §7.2)", async () => {
    // Immediate-zero-on-open (spec §7.2 — "the numeric badge zeroes immediately
    // client-side; a later /bell/count refresh restores any post-snapshot
    // arrivals"). The pre-zero in-flight count must NOT resurrect the badge
    // (a count response that started before the open gesture is stale); a
    // refetch started AFTER zeroNow legitimately restores post-snapshot arrivals.
    let resolveStale!: (value: unknown) => void;
    let countCalls = 0;
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/admin/alerts/bell/token") return new Promise(() => {});
      if (url === "/api/admin/alerts/bell/count") {
        countCalls += 1;
        if (countCalls === 1) {
          return new Promise((resolve) => {
            resolveStale = resolve;
          });
        }
        return Promise.resolve(okResponse({ count: 6 }));
      }
      return new Promise(() => {});
    });

    const { result } = renderBadgeHook({ kind: "ok", count: 3 });
    expect(result.current.count).toBe(3);

    // A count refetch is already in flight (deferred) when the viewer opens.
    act(() => {
      result.current.refetch();
    });

    // Open gesture zeroes the badge synchronously.
    act(() => {
      result.current.zeroNow();
    });
    expect(result.current.count).toBe(0);
    expect(result.current.degraded).toBe(false);

    // The pre-zero in-flight count resolves late → must be discarded (token bumped).
    resolveStale(okResponse({ count: 9 }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current.count).toBe(0);

    // A refetch started AFTER zeroNow applies (server truth restores arrivals).
    act(() => {
      result.current.refetch();
    });
    await waitFor(() => expect(result.current.count).toBe(6));
    expect(result.current.degraded).toBe(false);
  });

  it("mounts the realtime channel once via token POST + subscribeToBell, and onChanged triggers a refetch", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/admin/alerts/bell/token") {
        return Promise.resolve(okResponse({ jwt: "fake.jwt", exp: 123 }));
      }
      if (url === "/api/admin/alerts/bell/count") {
        return Promise.resolve(okResponse({ count: 42 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    let onChanged: (() => void) | undefined;
    subscribeToBellMock.mockImplementation((_supabase: unknown, _jwt: string, cb: () => void) => {
      onChanged = cb;
      return { channel: {}, subscribed: new Promise(() => {}) };
    });

    const { result } = renderBadgeHook({ kind: "ok", count: 1 });

    await waitFor(() => expect(subscribeToBellMock).toHaveBeenCalledTimes(1));
    expect(subscribeToBellMock.mock.calls[0]?.[1]).toBe("fake.jwt");

    onChanged?.();

    await waitFor(() => expect(result.current.count).toBe(42));
  });

  it("realtime `changed` increments pingSignal AND still schedules the count refetch (open-panel feed refresh signal, spec §5.4)", async () => {
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/admin/alerts/bell/token") {
        return Promise.resolve(okResponse({ jwt: "fake.jwt", exp: 123 }));
      }
      if (url === "/api/admin/alerts/bell/count") {
        return Promise.resolve(okResponse({ count: 5 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });
    let onChanged: (() => void) | undefined;
    subscribeToBellMock.mockImplementation((_supabase: unknown, _jwt: string, cb: () => void) => {
      onChanged = cb;
      return { channel: {}, subscribed: new Promise(() => {}) };
    });

    const { result } = renderBadgeHook({ kind: "ok", count: 1 });
    await waitFor(() => expect(subscribeToBellMock).toHaveBeenCalledTimes(1));

    const before = result.current.pingSignal;
    onChanged?.();

    // Source-4 count refetch is preserved…
    await waitFor(() => expect(result.current.count).toBe(5));
    // …and the ping signal advances so an OPEN BellPanel can refetch its feed.
    expect(result.current.pingSignal).toBeGreaterThan(before);
  });

  it("realtime failure retries exactly ONCE (re-mint + new channel), then gives up silently on a second failure (spec §5.4 bounded retry)", async () => {
    let tokenCallCount = 0;
    fetchSpy.mockImplementation((url: string) => {
      if (url === "/api/admin/alerts/bell/token") {
        tokenCallCount += 1;
        return Promise.resolve(okResponse({ jwt: `jwt-${tokenCallCount}`, exp: 123 }));
      }
      if (url === "/api/admin/alerts/bell/count") {
        return Promise.resolve(okResponse({ count: 99 }));
      }
      return Promise.reject(new Error(`unexpected fetch: ${url}`));
    });

    const statusCallbacks: Array<(status: string) => void> = [];
    const channels: object[] = [];
    subscribeToBellMock.mockImplementation(
      (
        _supabase: unknown,
        _jwt: string,
        _onChanged: () => void,
        onStatus?: (status: string) => void,
      ) => {
        const channel = {};
        channels.push(channel);
        if (onStatus) statusCallbacks.push(onStatus);
        return { channel, subscribed: new Promise(() => {}) };
      },
    );

    const { result, rerender } = renderBadgeHook({ kind: "ok", count: 1 });

    await waitFor(() => expect(subscribeToBellMock).toHaveBeenCalledTimes(1));
    expect(tokenCallCount).toBe(1);

    // First failure → exactly one bounded retry: tear down the failed
    // channel, re-mint a fresh token, open a new channel.
    statusCallbacks[0]?.("CHANNEL_ERROR");

    await waitFor(() => expect(subscribeToBellMock).toHaveBeenCalledTimes(2));
    expect(tokenCallCount).toBe(2);
    expect(subscribeToBellMock.mock.calls[1]?.[1]).toBe("jwt-2");
    expect(removeChannelMock).toHaveBeenCalledTimes(1);
    expect(removeChannelMock).toHaveBeenCalledWith(channels[0]);

    // Second failure (on the retried channel) → NO further re-mint or
    // resubscribe: the hook degrades silently rather than looping.
    statusCallbacks[1]?.("CHANNEL_ERROR");
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(subscribeToBellMock).toHaveBeenCalledTimes(2);
    expect(tokenCallCount).toBe(2);
    expect(removeChannelMock).toHaveBeenCalledTimes(1); // no further teardown attempt

    // Pathname-refetch mode still functions after realtime gives up.
    mockPathname = "/admin/settings";
    rerender({ value: { kind: "ok", count: 1 } });
    await waitFor(() => expect(result.current.count).toBe(99));
    expect(result.current.degraded).toBe(false);
  });
});
