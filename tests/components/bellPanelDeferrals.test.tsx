// @vitest-environment jsdom
/**
 * BellPanel — impeccable dual-gate deferrals BELL-1..3 (bell notification center,
 * user-directed ship 2026-07-05). jsdom + RTL. `global.fetch` is stubbed per test.
 *
 *  - BELL-1 (spec §4.1, Task 7 chevron rework): the show-page chevron
 *    (`bell-caret-{id}`) is a plain nav `<a>` rendered iff `entry.slug` is
 *    non-null — a slug predicate, independent of the row's catalog copy. No
 *    expand/collapse state remains; the full-row toggle is mark-read-only.
 *  - BELL-2: a visible "Active (N)" count heading on the active section,
 *    mirroring the history heading style. Count derived from active length.
 *  - BELL-3: a persistent sr-only role=status live region present from mount in
 *    every panel state, announcing the load count and post-refetch completion.
 *
 * Anti-tautology (AGENTS.md): assertions scope to `within(getByTestId("bell-panel"))`
 * (the panel renders standalone, no sibling admin surfaces); the BELL-2 count is
 * derived from the seeded active length.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { BellPanel } from "@/components/admin/BellPanel";
import type { BellEntry } from "@/lib/admin/bellFeed";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";

// The retry Server Action is an RPC reference at runtime — stub it so importing
// BellPanel does not drag `app/admin/actions` (server-only) into jsdom.
vi.mock("@/app/admin/actions", () => ({
  retryWatchSubscriptionFormAction: vi.fn(async () => {}),
}));

const fetchMock = vi.fn();

beforeEach(() => {
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
function jsonErr(status: number, body: unknown = { error: "unavailable" }) {
  return { ok: false, status, json: async () => body } as unknown as Response;
}

// A generic live code — the chevron is a slug predicate (spec §4.1), not
// code-driven, so this file no longer needs a with/without-helpfulContext pair.
const ALL_CODES = Object.keys(MESSAGE_CATALOG) as MessageCode[];
const DEFAULT_CODE = ALL_CODES[0]!;

function makeEntry(over: Partial<BellEntry> & { alertId: string }): BellEntry {
  return {
    code: DEFAULT_CODE,
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
  };
}

type FeedOver = Partial<{
  entries: BellEntry[];
  unseenCount: number;
  truncated: boolean;
  historyDays: number;
  feedCap: number;
  seenThrough: string;
}>;
function feedBody(over: FeedOver = {}) {
  return {
    entries: [],
    unseenCount: 0,
    truncated: false,
    historyDays: 14,
    feedCap: 50,
    seenThrough: "2026-07-05T10:00:00.000Z",
    ...over,
  };
}

function routeFetch(body: unknown) {
  fetchMock.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/bell/feed")) return Promise.resolve(jsonOk(body));
    if (u.includes("/bell/open")) return Promise.resolve(jsonOk({ ok: true }));
    if (u.includes("/resolve")) return Promise.resolve(jsonOk({ status: "resolved" }));
    return Promise.resolve(jsonOk({}));
  });
}

function renderPanel(props: Partial<Parameters<typeof BellPanel>[0]> = {}) {
  const onClose = vi.fn();
  const onOpened = vi.fn();
  const utils = render(
    <BellPanel
      viewerIsDeveloper={props.viewerIsDeveloper ?? false}
      onClose={props.onClose ?? onClose}
      onOpened={props.onOpened ?? onOpened}
    />,
  );
  return { ...utils, onClose, onOpened };
}

function callsTo(fragment: string) {
  return fetchMock.mock.calls.filter((c) => String(c[0]).includes(fragment));
}

describe("BellPanel — BELL-1 show-page chevron (spec §4.1, Task 7)", () => {
  it("chevron renders for a row WITH a slug, absent for one WITHOUT — independent of code", async () => {
    const entries = [
      makeEntry({ alertId: "with", state: "active", slug: "east-coast" }),
      makeEntry({ alertId: "without", state: "active", slug: null }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    const chevron = within(panel).getByTestId("bell-caret-with");
    expect(chevron.tagName).toBe("A");
    expect(chevron.getAttribute("href")).toBe("/admin/show/east-coast");
    expect(within(panel).queryByTestId("bell-caret-without")).toBeNull();
  });

  it("the toggle fires the read POST regardless of whether the row carries a chevron (mark-read is unaffected by slug)", async () => {
    // The chevron is a plain nav link with no state of its own (spec §4.1) — it
    // must never gate or interfere with the toggle's read gesture (spec D3).
    const entries = [
      makeEntry({ alertId: "with", state: "active", slug: "east-coast", unread: true }),
      makeEntry({ alertId: "without", state: "active", slug: null, unread: true }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    fireEvent.click(within(panel).getByTestId("bell-entry-toggle-with"));
    fireEvent.click(within(panel).getByTestId("bell-entry-toggle-without"));
    await waitFor(() => expect(callsTo("/bell/read")).toHaveLength(2));

    // Clicking the toggle never mutates the chevron: still present/absent exactly
    // as the fixture's slug dictates.
    expect(within(panel).getByTestId("bell-caret-with")).toBeTruthy();
    expect(within(panel).queryByTestId("bell-caret-without")).toBeNull();
  });

  it("clicking the chevron link itself does NOT fire the toggle's mark-read POST (sibling placement, not nested)", async () => {
    const entries = [
      makeEntry({ alertId: "c1", state: "active", slug: "east-coast", unread: true }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    fireEvent.click(within(panel).getByTestId("bell-caret-c1"));
    // jsdom does not navigate on an <a> click, so this only proves the click
    // never bubbles into a mark-read POST (the chevron is a DOM sibling of the
    // toggle button, not nested inside it — no shared click handler to fire).
    expect(callsTo("/bell/read")).toHaveLength(0);
  });
});

describe("BellPanel — BELL-2 active count heading", () => {
  it("active section renders 'Active (N)' with N derived from the active length", async () => {
    const entries = [
      makeEntry({ alertId: "a1", state: "active" }),
      makeEntry({ alertId: "a2", state: "active" }),
      makeEntry({ alertId: "a3", state: "active" }),
      makeEntry({ alertId: "h1", state: "history", resolvedAt: "2026-07-04T09:00:00.000Z" }),
    ];
    const activeCount = entries.filter((e) => e.state === "active").length;
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");

    const heading = await within(panel).findByTestId("bell-section-active-heading");
    expect(heading.textContent).toContain("Active");
    expect(heading.textContent).toContain(String(activeCount));
    // The heading sits INSIDE the active section (not the history section).
    expect(within(getByTestId("bell-section-active")).getByTestId("bell-section-active-heading"));
  });

  it("no active entries (history only) → no active section, no active heading", async () => {
    const entries = [
      makeEntry({ alertId: "h1", state: "history", resolvedAt: "2026-07-04T09:00:00.000Z" }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-history");
    expect(within(panel).queryByTestId("bell-section-active")).toBeNull();
    expect(within(panel).queryByTestId("bell-section-active-heading")).toBeNull();
  });
});

describe("BellPanel — BELL-3 persistent sr-only live region", () => {
  it("region present at mount (loading), announces count after load, 'Notifications updated' after refetch", async () => {
    let releaseFeed: () => void = () => {};
    const feedGate = new Promise<void>((r) => {
      releaseFeed = r;
    });
    const entry = makeEntry({ alertId: "g-1", state: "active" });
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/bell/feed"))
        return feedGate.then(() => jsonOk(feedBody({ entries: [entry] })));
      if (u.includes("/bell/open")) return Promise.resolve(jsonOk({ ok: true }));
      if (u.includes("/resolve")) return Promise.resolve(jsonOk({ status: "resolved" }));
      return Promise.resolve(jsonOk({}));
    });
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");

    // Present at mount, before the feed resolves (loading state visible).
    const region = within(panel).getByTestId("bell-live-region");
    expect(region.getAttribute("role")).toBe("status");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.className).toContain("sr-only");
    expect(within(panel).getByTestId("bell-loading")).toBeTruthy();

    // After load: announces the active count (one active → singular).
    releaseFeed();
    await waitFor(() => expect(region.textContent).toBe("1 active notification"));

    // After a resolve refetch: the region announces completion (stable node).
    fireEvent.click(within(panel).getByTestId("bell-resolve-g-1"));
    await waitFor(() => expect(region.textContent).toBe("Notifications updated"));
  });

  it("empty feed → 'No notifications'; feed error → 'Notifications didn't load'", async () => {
    routeFetch(feedBody({ entries: [] }));
    const { getByTestId, unmount } = renderPanel();
    const region = within(getByTestId("bell-panel")).getByTestId("bell-live-region");
    await waitFor(() => expect(region.textContent).toBe("No notifications"));
    unmount();

    fetchMock.mockImplementation((url: string) => {
      if (String(url).includes("/bell/feed")) return Promise.resolve(jsonErr(503));
      return Promise.resolve(jsonOk({}));
    });
    const { getByTestId: getByTestId2 } = renderPanel();
    const region2 = within(getByTestId2("bell-panel")).getByTestId("bell-live-region");
    await waitFor(() => expect(region2.textContent).toBe("Notifications didn't load"));
  });
});
