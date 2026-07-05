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
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useBellBadge } from "@/components/admin/nav/useBellBadge";
import type { BellCountResult } from "@/lib/admin/bellFeed";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    removeChannel: vi.fn(),
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
});
