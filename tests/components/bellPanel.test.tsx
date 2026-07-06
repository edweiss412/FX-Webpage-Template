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

    // History rows have NO unread dot at all (mode boundary §7.3) and no action buttons.
    expect(within(history).queryByTestId("bell-unread-dot-h-1")).toBeNull();
    expect(within(history).queryByRole("button")).toBeNull();
    // History section is dimmed.
    expect(history.className).toContain("text-text-subtle");
  });

  it("occurrences>1 renders a ×N chip; occurrences===1 renders none", async () => {
    const entries = [
      makeEntry({ alertId: "many", state: "active", occurrences: 3 }),
      makeEntry({ alertId: "one", state: "active", occurrences: 1 }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();

    await within(getByTestId("bell-panel")).findByTestId("bell-section-active");
    expect(within(getByTestId("bell-entry-many")).getByText("×3")).toBeTruthy();
    expect(within(getByTestId("bell-entry-one")).queryByText(/×/)).toBeNull();
  });

  it("interpolates entry.context into catalog copy — the value renders, the raw <placeholder> never (Finding 1)", async () => {
    // MI-2_TITLE_MISSING's dougFacing template is "_<sheet-name>_ doesn't have a
    // recognizable show title. …" (lib/messages/catalog.ts). With a context
    // supplying <sheet-name>, the interpolated value must render and the raw
    // marker must not; with null context the row still renders (template text
    // is acceptable there, same as the retired banner — assert no crash + title).
    const CODE = "MI-2_TITLE_MISSING";
    const sheetName = "East Coast Spectacular";
    const entries = [
      makeEntry({
        alertId: "ctx",
        state: "active",
        code: CODE,
        context: { "sheet-name": sheetName },
      }),
      makeEntry({ alertId: "noctx", state: "active", code: CODE, context: null }),
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
