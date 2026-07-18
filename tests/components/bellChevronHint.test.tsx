// @vitest-environment jsdom
/**
 * WI-5 — one-time dismissible chevron-hint banner + throwing-safe useDismissibleOnce.
 *
 * The banner is a single panel-level in-flow note (top of the active-rows list)
 * shown only when at least one active row carries a chevron (slug non-null), the
 * storage probe succeeded (status "available"), and it has not been dismissed.
 * Every localStorage access (accessor / getItem / setItem) is try/catch guarded:
 * a read throw suppresses the banner (fail-safe), a write throw still unmounts it
 * for the session (module-level memDismissed fallback survives remount).
 *
 * Test isolation: memDismissed is module-scoped, so a dismiss in one test would
 * pollute later positive tests — beforeEach clears localStorage AND calls
 * __resetDismissMemory().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BellPanel } from "@/components/admin/BellPanel";
import { __resetDismissMemory } from "@/components/admin/useDismissibleOnce";
import type { BellEntry } from "@/lib/admin/bellFeed";

const HINT_KEY = "fxav:bell-chevron-hint:v1";

const fetchMock = vi.fn();
beforeEach(() => {
  window.localStorage.clear();
  __resetDismissMemory();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonOk(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function makeEntry(over: Partial<BellEntry> & { alertId: string }): BellEntry {
  return {
    code: "ADMIN_ALERT_COUNT_FAILED",
    showId: null,
    slug: null,
    state: "active",
    activityAt: "2026-07-05T10:00:00.000Z",
    resolvedAt: null,
    occurrences: 1,
    unread: false,
    context: null,
    identity: null,
    isAutoResolving: false,
    autoResolveNote: null,
    actions: [],
    messageParams: {},
    isHealth: false,
    ...over,
  } as BellEntry;
}

function feedBody(over: Record<string, unknown> = {}) {
  return {
    entries: [],
    unseenCount: 0,
    truncated: false,
    activeTruncated: false,
    historyDays: 14,
    feedCap: 50,
    seenThrough: "2026-07-05T10:00:00.000Z",
    ...over,
  };
}

function routeFetch(body: unknown) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(jsonOk(url.includes("/bell/feed") ? body : {})),
  );
}

function feedWithChevronRows() {
  return feedBody({
    entries: [
      makeEntry({ alertId: "c1", slug: "east-coast", unread: true }),
      makeEntry({ alertId: "c2", slug: null }),
    ],
  });
}
function feedNoSlugs() {
  return feedBody({ entries: [makeEntry({ alertId: "n1", slug: null })] });
}

function renderPanel(feed: Record<string, unknown>) {
  routeFetch(feed);
  return render(
    <BellPanel viewerIsDeveloper={false} onClose={vi.fn()} onOpened={vi.fn()} />,
  );
}

describe("WI-5 chevron-hint banner", () => {
  it("shows one in-flow hint banner after mount", async () => {
    renderPanel(feedWithChevronRows());
    expect(await screen.findByTestId("bell-chevron-hint")).toBeTruthy();
    expect(screen.getAllByTestId("bell-chevron-hint")).toHaveLength(1);
  });

  it("absent when all rows lack a slug (asserted AFTER the storage effect runs)", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem");
    renderPanel(feedNoSlugs());
    await waitFor(() => expect(spy).toHaveBeenCalled()); // effect ran (status=available)
    await act(async () => {});
    expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
    spy.mockRestore();
  });

  it("dismiss unmounts + persists; dismiss button not inside any chevron <a>", async () => {
    renderPanel(feedWithChevronRows());
    const dismiss = await screen.findByTestId("bell-chevron-hint-dismiss");
    for (const caret of screen.queryAllByTestId(/^bell-caret-/)) {
      expect(caret.contains(dismiss)).toBe(false);
    }
    fireEvent.click(dismiss);
    expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
    expect(window.localStorage.getItem(HINT_KEY)).toBeTruthy();
  });

  it("already-dismissed → no banner (asserted AFTER the storage read)", async () => {
    window.localStorage.setItem(HINT_KEY, "1");
    const spy = vi.spyOn(Storage.prototype, "getItem");
    renderPanel(feedWithChevronRows());
    await waitFor(() => expect(spy).toHaveBeenCalledWith(HINT_KEY));
    await act(async () => {});
    expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
    spy.mockRestore();
  });

  it("positive control: working storage + not dismissed → banner appears after effect", async () => {
    renderPanel(feedWithChevronRows());
    expect(await screen.findByTestId("bell-chevron-hint")).toBeTruthy();
  });

  it("accessor throw: effect runs, hits storage, throws → status=unavailable, banner stays absent", async () => {
    const orig = Object.getOwnPropertyDescriptor(window, "localStorage");
    const getter = vi.fn(() => {
      throw new Error("blocked");
    });
    Object.defineProperty(window, "localStorage", { configurable: true, get: getter });
    try {
      expect(() => renderPanel(feedWithChevronRows())).not.toThrow();
      await waitFor(() => expect(getter).toHaveBeenCalled());
      await act(async () => {});
      expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
    } finally {
      if (orig) Object.defineProperty(window, "localStorage", orig);
    }
  });

  it("getItem throw: probe called, banner absent after effect", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("x");
    });
    try {
      renderPanel(feedWithChevronRows());
      await waitFor(() => expect(spy).toHaveBeenCalledWith(HINT_KEY));
      await act(async () => {});
      expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("setItem throw on dismiss: unmounts locally, no crash, no navigation", async () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("x");
    });
    try {
      renderPanel(feedWithChevronRows());
      const dismiss = await screen.findByTestId("bell-chevron-hint-dismiss");
      expect(() => fireEvent.click(dismiss)).not.toThrow();
      expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  it("dismissal is session-sticky across remount even when setItem throws (module fallback)", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("x");
    });
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null); // storage never persists the key
    try {
      const first = renderPanel(feedWithChevronRows());
      fireEvent.click(await screen.findByTestId("bell-chevron-hint-dismiss"));
      expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
      first.unmount(); // simulate NotifBell close
      renderPanel(feedWithChevronRows()); // reopen → remount
      await act(async () => {}); // flush the mount effect
      expect(screen.queryByTestId("bell-chevron-hint")).toBeNull(); // stays dismissed via memDismissed
    } finally {
      vi.restoreAllMocks();
    }
  });
});
