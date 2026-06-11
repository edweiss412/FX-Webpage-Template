// @vitest-environment jsdom
/**
 * useNeedsAttentionBadge — badge freshness mechanism (spec §4.2 tests 4 + 4c).
 *
 * Concrete failure modes pinned:
 *  - hook fetching on initial mount (server prop is already fresh) → wasted
 *    request + races the first paint
 *  - non-OK / network-fault / malformed body committing garbage instead of
 *    hiding the badge (null)
 *  - R5-F1 stale-fetch suppression: an in-flight pathname fetch resolving
 *    AFTER a router.refresh prop sync must NOT clobber the newer prop value,
 *    and its AbortController must be aborted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { useNeedsAttentionBadge } from "@/components/admin/nav/useNeedsAttentionBadge";

let mockPathname = "/admin";
vi.mock("next/navigation", () => ({ usePathname: () => mockPathname }));

const fetchSpy = vi.fn();

beforeEach(() => {
  mockPathname = "/admin";
  fetchSpy.mockReset();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderBadgeHook(initial: number | null) {
  return renderHook(({ value }: { value: number | null }) => useNeedsAttentionBadge(value), {
    initialProps: { value: initial },
  });
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

describe("useNeedsAttentionBadge", () => {
  it("returns the initial server prop and does NOT fetch on mount", () => {
    const { result } = renderBadgeHook(5);
    expect(result.current).toBe(5);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("prop change (router.refresh path) commits immediately, no fetch", () => {
    const { result, rerender } = renderBadgeHook(5);
    rerender({ value: 8 });
    expect(result.current).toBe(8);
    rerender({ value: null });
    expect(result.current).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("pathname change fetches the count route; ok {count: 7} commits 7", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ count: 7 }));
    const { result, rerender } = renderBadgeHook(2);
    mockPathname = "/admin/settings";
    rerender({ value: 2 });
    await waitFor(() => expect(result.current).toBe(7));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/admin/needs-attention-count");
  });

  it("non-OK response → commits null (badge hidden, fail-quiet D-4)", async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) });
    const { result, rerender } = renderBadgeHook(6);
    mockPathname = "/admin/show/abc";
    rerender({ value: 6 });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("rejected fetch → commits null", async () => {
    fetchSpy.mockRejectedValueOnce(new Error("network down"));
    const { result, rerender } = renderBadgeHook(6);
    mockPathname = "/admin/show/abc";
    rerender({ value: 6 });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("malformed body {count: 'x'} → commits null", async () => {
    fetchSpy.mockResolvedValueOnce(okResponse({ count: "x" }));
    const { result, rerender } = renderBadgeHook(6);
    mockPathname = "/admin/show/abc";
    rerender({ value: 6 });
    await waitFor(() => expect(result.current).toBeNull());
  });

  it("R5-F1 stale-fetch suppression: prop sync invalidates an in-flight pathname fetch and aborts it", async () => {
    // Deferred fetch A: resolve manually after the prop sync lands.
    let resolveA!: (value: unknown) => void;
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveA = resolve;
        }),
    );
    const { result, rerender } = renderBadgeHook(5);

    // Pathname change starts fetch A.
    mockPathname = "/admin/settings";
    rerender({ value: 5 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestInit = fetchSpy.mock.calls[0]?.[1] as { signal: AbortSignal };
    expect(requestInit.signal.aborted).toBe(false);

    // router.refresh prop sync delivers newer server truth.
    rerender({ value: 9 });
    expect(result.current).toBe(9);
    expect(requestInit.signal.aborted).toBe(true);

    // Fetch A resolves late with an OLDER count — must NOT clobber the prop.
    resolveA(okResponse({ count: 3 }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(result.current).toBe(9);
  });
});
