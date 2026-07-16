// @vitest-environment jsdom
/**
 * BellPanel — shell, sections, and states (bell notification center Task 13,
 * spec §7.2/§7.3). jsdom + RTL. `global.fetch` is stubbed per test.
 *
 * Anti-tautology (AGENTS.md): every "panel shows X" assertion scopes its
 * extraction to `within(getByTestId("bell-panel"))` — the panel is rendered
 * standalone (no AdminNav / AppHealthIndicator siblings), so a sibling surface
 * cannot satisfy an assertion. Expected values (feedCap, historyDays, unseen
 * set) are derived from the MOCKED feed response, never hardcoded independently.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { BellPanel } from "@/components/admin/BellPanel";
import { getRequiredDougFacing } from "@/lib/messages/lookup";
import type { BellEntry } from "@/lib/admin/bellFeed";

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
    action: null,
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

/** Route fetch by URL; feed resolves to `body`, open/read resolve ok. */
function routeFetch(body: unknown, opts: { feedResponse?: () => Response } = {}) {
  fetchMock.mockImplementation((url: string) => {
    if (url.includes("/bell/feed")) {
      return Promise.resolve(opts.feedResponse ? opts.feedResponse() : jsonOk(body));
    }
    if (url.includes("/bell/open")) return Promise.resolve(jsonOk({ ok: true }));
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

describe("BellPanel — sections (spec §7.3)", () => {
  it("feed 200 → active rows carry unread dots only where entry.unread; history rows are dimmed, dotless, buttonless", async () => {
    const entries = [
      makeEntry({ alertId: "a-unread", state: "active", unread: true }),
      makeEntry({ alertId: "a-read", state: "active", unread: false }),
      makeEntry({
        alertId: "h-1",
        state: "history",
        unread: false,
        resolvedAt: "2026-07-04T09:00:00.000Z",
      }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();

    const panel = getByTestId("bell-panel");
    const active = await within(panel).findByTestId("bell-section-active");
    const history = within(panel).getByTestId("bell-section-history");

    // Unread active row: dot present and opaque; read active row: dot present but transparent.
    expect(within(active).getByTestId("bell-unread-dot-a-unread").className).toContain(
      "opacity-100",
    );
    expect(within(active).getByTestId("bell-unread-dot-a-read").className).toContain("opacity-0");

    // Accent-contrast token pass (spec 2026-07-16 §4.1b B4): the pip is a
    // load-bearing graphical unread indicator (title weight is deliberately
    // constant), so it must clear 3:1 vs the white ring/surface — raw
    // bg-accent is 2.33:1; the darkened bg-accent-on-bg (4.9:1) is mandated.
    const pipTokens = new Set(
      within(active).getByTestId("bell-unread-dot-a-unread").className.split(/\s+/),
    );
    expect(pipTokens.has("bg-accent-on-bg")).toBe(true);
    expect(pipTokens.has("bg-accent")).toBe(false);

    // History rows have NO unread dot at all (mode boundary §7.3) and no action buttons.
    expect(within(history).queryByTestId("bell-unread-dot-h-1")).toBeNull();
    expect(within(history).queryByRole("button")).toBeNull();
    // History section is dimmed.
    expect(history.className).toContain("text-text-subtle");
  });

  it('occurrences>1 renders a "Seen N×" chip; occurrences===1 renders none', async () => {
    const entries = [
      makeEntry({ alertId: "many", state: "active", occurrences: 3 }),
      makeEntry({ alertId: "one", state: "active", occurrences: 1 }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();

    await within(getByTestId("bell-panel")).findByTestId("bell-section-active");
    expect(within(getByTestId("bell-entry-many")).getByText(/Seen 3×/)).toBeTruthy();
    expect(within(getByTestId("bell-entry-one")).queryByText(/Seen/)).toBeNull();
  });

  it("interpolates entry.context into catalog copy — the value renders, the raw <placeholder> never (Finding 1)", async () => {
    // MI-2_TITLE_MISSING's dougFacing template is "_<sheet-name>_ doesn't have a
    // recognizable show title. …" (lib/messages/catalog.ts). With a context
    // supplying <sheet-name>, the interpolated value must render and the raw
    // marker must not; with null context the row still renders (template text
    // is acceptable there, same as the retired banner — assert no crash + title).
    const CODE = "MI-2_TITLE_MISSING";
    const sheetName = "East Coast Spectacular";
    // Finding 2 (R2): a producer value carrying its OWN markdown metacharacters.
    // Emphasis must be parsed on the raw catalog TEMPLATE only; the param value
    // is interpolated as opaque text, so its `*draft*` / `_x_` must NOT spawn
    // their own <em>/<strong> nodes and must survive byte-for-byte.
    const metaValue = "East *draft*_x_";
    const entries = [
      makeEntry({
        alertId: "ctx",
        state: "active",
        code: CODE,
        context: { "sheet-name": sheetName },
      }),
      makeEntry({ alertId: "noctx", state: "active", code: CODE, context: null }),
      makeEntry({
        alertId: "meta",
        state: "active",
        code: CODE,
        context: { "sheet-name": metaValue },
      }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();

    const panel = getByTestId("bell-panel");
    const ctxRow = await within(panel).findByTestId("bell-entry-ctx");
    // Interpolated producer value present; raw template marker gone (scoped to
    // THIS row — the null-context sibling legitimately still carries the marker).
    expect(ctxRow.textContent).toContain(sheetName);
    expect(ctxRow.textContent).not.toContain("<sheet-name>");

    // Null-context row renders without throwing; its catalog title is present.
    const nullRow = within(panel).getByTestId("bell-entry-noctx");
    expect(nullRow.textContent).toContain("Show title missing");

    // Metacharacter row: the value renders LITERALLY (asterisks + underscores
    // intact — an interpolate-then-parse implementation would consume `*draft*`
    // into <em>draft</em> and lose the raw characters), and the value's own
    // markers spawn NO emphasis nodes (the template's authored `_…_` around the
    // placeholder is allowed; the value's own `*draft*` is not).
    const metaRow = within(panel).getByTestId("bell-entry-meta");
    expect(metaRow.textContent).toContain(metaValue);
    expect(Array.from(metaRow.querySelectorAll("em")).some((e) => e.textContent === "draft")).toBe(
      false,
    );
    expect(metaRow.querySelector("strong")).toBeNull();
  });

  it("uncataloged entry code renders a generic fallback, never the raw code, without throwing (§6.2)", async () => {
    const entries = [
      makeEntry({ alertId: "x", state: "active", code: "TOTALLY_UNKNOWN_CODE_XYZ" }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();

    const row = await within(getByTestId("bell-panel")).findByTestId("bell-entry-x");
    expect(row).toBeTruthy();
    // Invariant 5: no raw code string leaks into the DOM.
    expect(getByTestId("bell-panel").textContent).not.toContain("TOTALLY_UNKNOWN_CODE_XYZ");
  });
});

describe("BellPanel — open gesture (spec §7.2 snapshot safety)", () => {
  it("POSTs /bell/open exactly once with the feed's seenThrough, only AFTER the feed resolves", async () => {
    const seenThrough = "2026-07-05T11:22:33.000Z";
    routeFetch(feedBody({ entries: [makeEntry({ alertId: "a", state: "active" })], seenThrough }));
    const { getByTestId, onOpened } = renderPanel();

    // Await the READY state before asserting call order (plan-review R2 candidate 4).
    await within(getByTestId("bell-panel")).findByTestId("bell-section-active");

    const feedCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/bell/feed"));
    const openIdx = fetchMock.mock.calls.findIndex((c) => String(c[0]).includes("/bell/open"));
    expect(feedCalls).toHaveLength(1);
    const openCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/bell/open"));
    expect(openCalls).toHaveLength(1);

    const feedIdx = fetchMock.mock.calls.findIndex((c) => String(c[0]).includes("/bell/feed"));
    expect(openIdx).toBeGreaterThanOrEqual(0);
    expect(feedIdx).toBeGreaterThanOrEqual(0);

    // Body carries exactly the feed's seenThrough (server truth, not client Date.now).
    const openInit = fetchMock.mock.calls[openIdx]![1] as RequestInit;
    expect(openInit.method).toBe("POST");
    expect(JSON.parse(String(openInit.body))).toEqual({ seenThrough });

    // Order: feed resolved BEFORE open (invocationCallOrder is monotonic across all mock calls).
    const openOrder = fetchMock.mock.invocationCallOrder[openIdx]!;
    const feedOrder = fetchMock.mock.invocationCallOrder[feedIdx]!;
    expect(openOrder).toBeGreaterThan(feedOrder);

    await waitFor(() => expect(onOpened).toHaveBeenCalledTimes(1));
  });
});

describe("BellPanel — states (spec §7.3)", () => {
  it("feed 503 → bell-error renders ALERT_BELL_FEED_FAILED catalog copy + a Retry that refires the feed", async () => {
    let calls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/bell/feed")) {
        calls += 1;
        return Promise.resolve(jsonErr(503));
      }
      return Promise.resolve(jsonOk({}));
    });
    const { getByTestId } = renderPanel();

    const err = await within(getByTestId("bell-panel")).findByTestId("bell-error");
    expect(err.textContent).toContain(getRequiredDougFacing("ALERT_BELL_FEED_FAILED"));

    const retry = within(err).getByRole("button", { name: /retry/i });
    expect(calls).toBe(1);
    fireEvent.click(retry);
    await waitFor(() => expect(calls).toBe(2));
  });

  it("entries [] → bell-empty ('You're all caught up.' + history window subline from historyDays)", async () => {
    routeFetch(feedBody({ entries: [], historyDays: 21 }));
    const { getByTestId } = renderPanel();

    const empty = await within(getByTestId("bell-panel")).findByTestId("bell-empty");
    // Curly-apostrophe tolerant (the component renders `&rsquo;` for lint).
    expect(empty.textContent).toMatch(/You.?re all caught up\./);
    expect(empty.textContent).toContain("21");
  });

  it("truncated:true → bell-truncation-row includes the response's feedCap", async () => {
    routeFetch(
      feedBody({
        entries: [makeEntry({ alertId: "a", state: "active" })],
        truncated: true,
        feedCap: 37,
      }),
    );
    const { getByTestId } = renderPanel({ viewerIsDeveloper: true });

    const row = await within(getByTestId("bell-panel")).findByTestId("bell-truncation-row");
    expect(row.textContent).toContain("37");
  });
});

describe("BellPanel — ping refetch (spec §5.4 — realtime refreshes the OPEN feed)", () => {
  it("bumping pingSignal refetches the feed in place, surfaces new rows, preserves read-cleared dots, and does not re-POST /bell/open for the same snapshot", async () => {
    // Same snapshot stamp across both reads: the ping brings a new entry but the
    // watermark is already stamped, so the openedForRef guard must suppress a
    // second /bell/open (the established resolve-refetch contract §7.2).
    const seenThrough = "2026-07-05T10:00:00.000Z";
    const first = feedBody({
      entries: [makeEntry({ alertId: "a", state: "active", unread: true })],
      seenThrough,
    });
    const second = feedBody({
      entries: [
        makeEntry({ alertId: "a", state: "active", unread: true }),
        makeEntry({ alertId: "b", state: "active", unread: true }),
      ],
      seenThrough,
    });
    let feedCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/bell/feed")) {
        feedCalls += 1;
        return Promise.resolve(jsonOk(feedCalls === 1 ? first : second));
      }
      return Promise.resolve(jsonOk({}));
    });

    const onClose = vi.fn();
    const onOpened = vi.fn();
    const { getByTestId, queryByTestId, rerender } = render(
      <BellPanel viewerIsDeveloper={false} onClose={onClose} onOpened={onOpened} pingSignal={0} />,
    );
    const panel = getByTestId("bell-panel");

    // Initial snapshot: row a present, row b absent.
    await within(panel).findByTestId("bell-entry-a");
    expect(queryByTestId("bell-entry-b")).toBeNull();

    // Expand row a → read-clears its dot (session-scoped Set; must survive refetch).
    fireEvent.click(within(panel).getByTestId("bell-entry-toggle-a"));
    await waitFor(() =>
      expect(within(panel).getByTestId("bell-unread-dot-a").className).toContain("opacity-0"),
    );

    // Ping: a realtime `changed` on the OPEN panel bumps pingSignal → in-place
    // feed refetch via the SAME path the resolve/save settle uses.
    rerender(
      <BellPanel viewerIsDeveloper={false} onClose={onClose} onOpened={onOpened} pingSignal={1} />,
    );

    // New row surfaces on the refetch (fetch fired a SECOND time at /bell/feed).
    await within(panel).findByTestId("bell-entry-b");
    expect(feedCalls).toBe(2);

    // Read-cleared dot for row a survived the ping refetch (no un-clear).
    expect(within(panel).getByTestId("bell-unread-dot-a").className).toContain("opacity-0");

    // Same seenThrough → exactly ONE /bell/open across mount + ping refetch.
    const openCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/bell/open"));
    expect(openCalls).toHaveLength(1);

    // BELL-3: a ping refetch announces completion like the resolve path.
    expect(getByTestId("bell-live-region").textContent).toBe("Notifications updated");
  });

  it("an unchanged pingSignal (initial mount value) triggers no refetch", async () => {
    routeFetch(feedBody({ entries: [makeEntry({ alertId: "a", state: "active" })] }));
    const onClose = vi.fn();
    const onOpened = vi.fn();
    const { getByTestId } = render(
      <BellPanel viewerIsDeveloper={false} onClose={onClose} onOpened={onOpened} pingSignal={3} />,
    );
    await within(getByTestId("bell-panel")).findByTestId("bell-entry-a");
    const feedCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/bell/feed"));
    expect(feedCalls).toHaveLength(1);
  });
});

describe("BellPanel — load race (Finding 1: a stale response must not overwrite a newer one)", () => {
  it("an earlier load that resolves AFTER a newer one is discarded; only the newer snapshot renders and stamps /bell/open", async () => {
    const firstSeen = "2026-07-05T10:00:00.000Z";
    const secondSeen = "2026-07-05T10:05:00.000Z";
    // Stale snapshot lacks row b; newer snapshot has it. If the stale response
    // wins, b disappears and a second /bell/open stamps the stale watermark.
    const firstBody = feedBody({
      entries: [makeEntry({ alertId: "a", state: "active" })],
      seenThrough: firstSeen,
    });
    const secondBody = feedBody({
      entries: [
        makeEntry({ alertId: "a", state: "active" }),
        makeEntry({ alertId: "b", state: "active" }),
      ],
      seenThrough: secondSeen,
    });

    // Defer each /bell/feed response so the test controls resolution order;
    // open/read resolve ok immediately.
    const feedResolvers: Array<(r: Response) => void> = [];
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/bell/feed")) {
        return new Promise<Response>((resolve) => feedResolvers.push(resolve));
      }
      return Promise.resolve(jsonOk({}));
    });

    const onClose = vi.fn();
    const onOpened = vi.fn();
    const { getByTestId, rerender } = render(
      <BellPanel viewerIsDeveloper={false} onClose={onClose} onOpened={onOpened} pingSignal={0} />,
    );

    // Mount load fires the first /bell/feed (still pending).
    await waitFor(() => expect(feedResolvers).toHaveLength(1));

    // A realtime ping starts a SECOND load before the first resolves.
    rerender(
      <BellPanel viewerIsDeveloper={false} onClose={onClose} onOpened={onOpened} pingSignal={1} />,
    );
    await waitFor(() => expect(feedResolvers).toHaveLength(2));

    // The NEWER (second) load resolves first → row b surfaces.
    const panel = getByTestId("bell-panel");
    feedResolvers[1]!(jsonOk(secondBody));
    await within(panel).findByTestId("bell-entry-b");

    // The STALE (first) load resolves late → must be discarded (no clobber).
    feedResolvers[0]!(jsonOk(firstBody));
    // Flush the stale response's full then-chain (fetch → seq guard → return).
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Newer snapshot still rendered: row b survived (the stale load did not win).
    expect(within(panel).queryByTestId("bell-entry-b")).not.toBeNull();

    // Exactly ONE /bell/open, stamping the NEWER seenThrough (never the stale one).
    const openCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/bell/open"));
    expect(openCalls).toHaveLength(1);
    expect(JSON.parse(String((openCalls[0]![1] as RequestInit).body))).toEqual({
      seenThrough: secondSeen,
    });
  });
});

describe("BellPanel — unmount invalidation (R4 Finding 1: a load in flight at close must not stamp /bell/open)", () => {
  it("closing the panel before /bell/feed resolves discards the load — no /bell/open POST, no post-unmount onOpened", async () => {
    // Slow connection: the viewer opens the bell, then closes (Esc/scrim →
    // unmount) before the feed resolves. When the deferred /bell/feed later
    // settles, the resumed load must bail at its seq guard — no setState on the
    // unmounted panel, and (the spec §7.2 watermark hazard) no /bell/open
    // advancing opened_at to a snapshot the viewer never saw.
    const feedResolvers: Array<(r: Response) => void> = [];
    fetchMock.mockImplementation((url: string) => {
      if (url.includes("/bell/feed")) {
        return new Promise<Response>((resolve) => feedResolvers.push(resolve));
      }
      return Promise.resolve(jsonOk({}));
    });

    const onClose = vi.fn();
    const onOpened = vi.fn();
    const { getByTestId, unmount } = render(
      <BellPanel viewerIsDeveloper={false} onClose={onClose} onOpened={onOpened} pingSignal={0} />,
    );

    // Mount load fired the feed (still pending); panel sits in its loading shell.
    await waitFor(() => expect(feedResolvers).toHaveLength(1));
    getByTestId("bell-loading");

    // Viewer closes before the feed resolves → the panel unmounts.
    unmount();

    // The deferred feed resolves AFTER unmount with a real snapshot.
    feedResolvers[0]!(
      jsonOk(feedBody({ entries: [makeEntry({ alertId: "a", state: "active" })] })),
    );
    // Flush the late response's full then-chain (fetch → seq guard → return).
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // No watermark stamped for a snapshot the viewer never saw, and the badge
    // refetch callback never fired post-unmount.
    const openCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes("/bell/open"));
    expect(openCalls).toHaveLength(0);
    expect(onOpened).not.toHaveBeenCalled();
  });
});
