// @vitest-environment jsdom
/**
 * BellPanel — row actions (bell notification center Task 14, spec §7.3/§7.4).
 * The interaction layer on top of Task 13's shell: resolve wiring, retry
 * carry-over, per-row read marks, and the developer config footer.
 *
 * Anti-tautology (AGENTS.md): every assertion scopes its extraction to
 * `within(getByTestId("bell-panel"))` (the panel renders standalone, no
 * sibling admin surfaces) and derives its fixture code/note from the live
 * audience helpers (`AUTO_RESOLVING_CODES`, `HEALTH_CODES`, `autoResolveNote`)
 * so a broken component cannot satisfy an assertion by coincidence. The
 * retry Server Action is mocked so the client component never pulls the
 * server-only `app/admin/actions` dependency chain into jsdom.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { BellPanel } from "@/components/admin/BellPanel";
import type { BellEntry } from "@/lib/admin/bellFeed";
import { AUTO_RESOLVING_CODES, HEALTH_CODES, autoResolveNote } from "@/lib/adminAlerts/audience";
import { MESSAGE_CATALOG, type MessageCode } from "@/lib/messages/catalog";
import { lookupHelpfulContext } from "@/lib/messages/lookup";

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

// A live manual (non-health, non-auto) code that carries helpfulContext — used
// for the resolve + expand cases. Derived from the catalog so the fixture can
// never silently drift into the health/auto sets.
const MANUAL_CODE = "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE";
const AUTO_CODE = AUTO_RESOLVING_CODES.find((c) => c !== "WATCH_CHANNEL_ORPHANED")!;
const HEALTH_CODE =
  HEALTH_CODES.find((c) => MESSAGE_CATALOG[c as MessageCode]?.title) ?? HEALTH_CODES[0]!;

function makeEntry(over: Partial<BellEntry> & { alertId: string }): BellEntry {
  return {
    code: MANUAL_CODE,
    showId: null,
    slug: null,
    state: "active",
    activityAt: "2026-07-05T10:00:00.000Z",
    resolvedAt: null,
    occurrences: 1,
    unread: false,
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

type RouteOpts = {
  feed?: () => unknown; // returns a feed BODY; wrapped ok. Called per /bell/feed hit.
  read?: () => Response;
  config?: () => Response;
  resolve?: () => Response;
};

/** Route fetch by URL. Records every call on fetchMock for assertions. */
function routeFetch(opts: RouteOpts) {
  fetchMock.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/bell/feed")) {
      return Promise.resolve(jsonOk(opts.feed ? opts.feed() : feedBody()));
    }
    if (u.includes("/bell/open")) return Promise.resolve(jsonOk({ ok: true }));
    if (u.includes("/bell/read")) {
      return Promise.resolve(opts.read ? opts.read() : jsonOk({ ok: true }));
    }
    if (u.includes("/bell/config")) {
      return Promise.resolve(opts.config ? opts.config() : jsonOk({ ok: true }));
    }
    if (u.includes("/resolve")) {
      return Promise.resolve(opts.resolve ? opts.resolve() : jsonOk({ status: "resolved" }));
    }
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

describe("BellPanel — resolve wiring (spec §7.3)", () => {
  it("manual global row (showId null) → Resolve button POSTs the GLOBAL resolve route, then refetches", async () => {
    const entry = makeEntry({ alertId: "g-1", state: "active", showId: null, slug: null });
    let feedHits = 0;
    routeFetch({
      feed: () => {
        feedHits += 1;
        return feedBody({ entries: [entry] });
      },
    });
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    const resolve = await within(panel).findByTestId("bell-resolve-g-1");

    const before = feedHits;
    fireEvent.click(resolve);

    await waitFor(() => {
      expect(callsTo("/resolve")).toHaveLength(1);
    });
    const [url, init] = callsTo("/resolve")[0]!;
    expect(url).toBe("/api/admin/admin-alerts/g-1/resolve");
    expect((init as RequestInit).method).toBe("POST");
    // A refetch follows the resolve (the snapshot is re-read; §7.3).
    await waitFor(() => expect(feedHits).toBeGreaterThan(before));
  });

  it("manual show-scoped row (slug present) → Resolve POSTs the SHOW-SCOPED route", async () => {
    const entry = makeEntry({
      alertId: "s-1",
      state: "active",
      showId: "show-uuid",
      slug: "east-coast",
    });
    routeFetch({ feed: () => feedBody({ entries: [entry] }) });
    const { getByTestId } = renderPanel();
    const resolve = await within(getByTestId("bell-panel")).findByTestId("bell-resolve-s-1");

    fireEvent.click(resolve);
    await waitFor(() => expect(callsTo("/resolve")).toHaveLength(1));
    expect(callsTo("/resolve")[0]![0]).toBe("/api/admin/show/east-coast/alerts/s-1/resolve");
  });

  it("409 (raced to auto) still refetches so the auto note can appear", async () => {
    const entry = makeEntry({ alertId: "r-1", state: "active" });
    let feedHits = 0;
    routeFetch({
      feed: () => {
        feedHits += 1;
        return feedBody({ entries: [entry] });
      },
      resolve: () => jsonErr(409, { ok: false, code: "ALERT_AUTO_RESOLVE_ONLY" }),
    });
    const { getByTestId } = renderPanel();
    const resolve = await within(getByTestId("bell-panel")).findByTestId("bell-resolve-r-1");

    const before = feedHits;
    fireEvent.click(resolve);
    await waitFor(() => expect(feedHits).toBeGreaterThan(before));
    // Invariant 5: the raw structural code never lands in the DOM.
    expect(getByTestId("bell-panel").textContent).not.toContain("ALERT_AUTO_RESOLVE_ONLY");
  });
});

describe("BellPanel — non-resolve action cells (spec §7.3)", () => {
  it("auto-resolving row → NO Resolve button; renders the exact autoResolveNote(code)", async () => {
    const entry = makeEntry({
      alertId: "a-1",
      state: "active",
      code: AUTO_CODE,
      isAutoResolving: true,
      autoResolveNote: autoResolveNote(AUTO_CODE),
    });
    routeFetch({ feed: () => feedBody({ entries: [entry] }) });
    const { getByTestId } = renderPanel();
    const row = await within(getByTestId("bell-panel")).findByTestId("bell-entry-a-1");

    expect(within(row).queryByTestId("bell-resolve-a-1")).toBeNull();
    expect(within(row).getByTestId("bell-auto-note-a-1").textContent).toBe(
      autoResolveNote(AUTO_CODE),
    );
  });

  it("health row (dev view) → NO Resolve button; a 'View in telemetry' deep link", async () => {
    const entry = makeEntry({
      alertId: "h-1",
      state: "active",
      code: HEALTH_CODE,
      isHealth: true,
    });
    routeFetch({ feed: () => feedBody({ entries: [entry] }) });
    const { getByTestId } = renderPanel({ viewerIsDeveloper: true });
    const row = await within(getByTestId("bell-panel")).findByTestId("bell-entry-h-1");

    expect(within(row).queryByTestId("bell-resolve-h-1")).toBeNull();
    const link = within(row).getByTestId("bell-telemetry-h-1");
    expect(link.getAttribute("href")).toBe("/admin/dev/telemetry#health");
  });

  it("WATCH_CHANNEL_ORPHANED row → Retry affordance carried over from the banner", async () => {
    const entry = makeEntry({
      alertId: "w-1",
      state: "active",
      code: "WATCH_CHANNEL_ORPHANED",
      isAutoResolving: true,
      autoResolveNote: autoResolveNote("WATCH_CHANNEL_ORPHANED"),
    });
    routeFetch({ feed: () => feedBody({ entries: [entry] }) });
    const { getByTestId } = renderPanel();
    const row = await within(getByTestId("bell-panel")).findByTestId("bell-entry-w-1");

    // The Retry form + button (RetryWatchButton, testid admin-alert-retry-button).
    expect(within(row).queryByTestId("bell-resolve-w-1")).toBeNull();
    expect(within(row).getByTestId("admin-alert-retry-button")).toBeTruthy();
  });

  it("action chip renders when entry.action is non-null; absent when null", async () => {
    const withAction = makeEntry({
      alertId: "act-1",
      state: "active",
      action: { href: "/admin/settings", label: "Open settings", external: false },
    });
    const noAction = makeEntry({ alertId: "act-0", state: "active", action: null });
    routeFetch({ feed: () => feedBody({ entries: [withAction, noAction] }) });
    const { getByTestId } = renderPanel();

    const chip = await within(getByTestId("bell-panel")).findByTestId("bell-action-act-1");
    expect(chip.getAttribute("href")).toBe("/admin/settings");
    expect(chip.textContent).toContain("Open settings");
    expect(within(getByTestId("bell-entry-act-0")).queryByTestId("bell-action-act-0")).toBeNull();
  });
});

describe("BellPanel — read gesture (spec §7.3 / D3)", () => {
  it("first expand → helpfulContext discloses AND POST /bell/read with the SERVER activityAt; dot clears with no layout shift", async () => {
    const activityAt = "2026-07-05T09:15:00.000Z";
    const entry = makeEntry({
      alertId: "u-1",
      state: "active",
      code: MANUAL_CODE,
      unread: true,
      activityAt,
    });
    routeFetch({ feed: () => feedBody({ entries: [entry] }) });
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    const toggle = await within(panel).findByTestId("bell-entry-toggle-u-1");

    // Dot starts opaque; its fixed slot is present.
    const dot = within(panel).getByTestId("bell-unread-dot-u-1");
    expect(dot.className).toContain("opacity-100");

    fireEvent.click(toggle);

    // Disclosure opens with the catalog helpfulContext.
    await within(panel).findByTestId("bell-context-u-1");
    expect(within(panel).getByTestId("bell-context-u-1").textContent).toContain(
      lookupHelpfulContext(MANUAL_CODE as MessageCode)!,
    );

    // Read POST fires exactly once with the server-provided activityAt (never Date.now()).
    await waitFor(() => expect(callsTo("/bell/read")).toHaveLength(1));
    const init = callsTo("/bell/read")[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ alertId: "u-1", seenActivityAt: activityAt });

    // Optimistic clear: opacity flipped; the slot span is still in the DOM (no layout shift).
    await waitFor(() =>
      expect(within(panel).getByTestId("bell-unread-dot-u-1").className).toContain("opacity-0"),
    );
    expect(within(panel).getByTestId("bell-unread-dot-u-1")).toBeTruthy();
  });

  it("read POST failure → dot stays cleared this session, no error UI (fail-quiet, spec §4)", async () => {
    const entry = makeEntry({ alertId: "u-2", state: "active", unread: true });
    routeFetch({ feed: () => feedBody({ entries: [entry] }), read: () => jsonErr(503) });
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    const toggle = await within(panel).findByTestId("bell-entry-toggle-u-2");

    fireEvent.click(toggle);
    await waitFor(() => expect(callsTo("/bell/read")).toHaveLength(1));

    // Dot stays cleared despite the failed POST; no error surface appears.
    await waitFor(() =>
      expect(within(panel).getByTestId("bell-unread-dot-u-2").className).toContain("opacity-0"),
    );
    expect(within(panel).queryByTestId("bell-error")).toBeNull();
  });

  it("re-collapsing then re-expanding fires the read POST only once (first expand only)", async () => {
    const entry = makeEntry({ alertId: "u-3", state: "active", unread: true });
    routeFetch({ feed: () => feedBody({ entries: [entry] }) });
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    const toggle = await within(panel).findByTestId("bell-entry-toggle-u-3");

    fireEvent.click(toggle); // expand
    await waitFor(() => expect(callsTo("/bell/read")).toHaveLength(1));
    fireEvent.click(toggle); // collapse
    fireEvent.click(toggle); // expand again
    // Still exactly one read POST.
    await waitFor(() => expect(callsTo("/bell/read")).toHaveLength(1));
  });
});

describe("BellPanel — dev footer (spec §7.4)", () => {
  it("non-developer → footer absent", async () => {
    routeFetch({ feed: () => feedBody({ entries: [makeEntry({ alertId: "a" })] }) });
    const { getByTestId } = renderPanel({ viewerIsDeveloper: false });
    await within(getByTestId("bell-panel")).findByTestId("bell-entry-a");
    expect(within(getByTestId("bell-panel")).queryByTestId("bell-dev-footer")).toBeNull();
  });

  it("developer → footer shows Window/Cap from the feed and Save POSTs typed ints", async () => {
    routeFetch({
      feed: () =>
        feedBody({ entries: [makeEntry({ alertId: "a" })], historyDays: 21, feedCap: 37 }),
    });
    const { getByTestId } = renderPanel({ viewerIsDeveloper: true });
    const footer = await within(getByTestId("bell-panel")).findByTestId("bell-dev-footer");
    expect(footer.textContent).toContain("21");
    expect(footer.textContent).toContain("37");

    const history = within(footer).getByTestId("bell-config-history");
    const cap = within(footer).getByTestId("bell-config-cap");
    fireEvent.change(history, { target: { value: "45" } });
    fireEvent.change(cap, { target: { value: "80" } });
    fireEvent.click(within(footer).getByTestId("bell-config-save"));

    await waitFor(() => expect(callsTo("/bell/config")).toHaveLength(1));
    const init = callsTo("/bell/config")[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ historyDays: 45, feedCap: 80 });
  });

  it("config 400 → bounds message rendered from response.limits (no silent clamp)", async () => {
    const limits = {
      historyDays: { min: 1, max: 365, default: 30 },
      feedCap: { min: 10, max: 200, default: 50 },
    };
    routeFetch({
      feed: () =>
        feedBody({ entries: [makeEntry({ alertId: "a" })], historyDays: 30, feedCap: 50 }),
      config: () => jsonErr(400, { error: "invalid", limits }),
    });
    const { getByTestId } = renderPanel({ viewerIsDeveloper: true });
    const footer = await within(getByTestId("bell-panel")).findByTestId("bell-dev-footer");
    fireEvent.change(within(footer).getByTestId("bell-config-history"), {
      target: { value: "9999" },
    });
    fireEvent.click(within(footer).getByTestId("bell-config-save"));

    const msg = await within(footer).findByTestId("bell-config-error");
    // Bounds come from the response, derived — not hardcoded independently.
    expect(msg.textContent).toContain(String(limits.historyDays.min));
    expect(msg.textContent).toContain(String(limits.historyDays.max));
    expect(msg.textContent).toContain(String(limits.feedCap.min));
    expect(msg.textContent).toContain(String(limits.feedCap.max));
  });
});

describe("BellPanel — compound transition (spec §13)", () => {
  it("resolve clicked while a read POST is in flight → both fire, UI lands on the refetched feed", async () => {
    const entry = makeEntry({ alertId: "c-1", state: "active", unread: true });
    let releaseRead: () => void = () => {};
    const readGate = new Promise<void>((r) => {
      releaseRead = r;
    });
    let feedHits = 0;
    fetchMock.mockImplementation((url: string) => {
      const u = String(url);
      if (u.includes("/bell/feed")) {
        feedHits += 1;
        return Promise.resolve(jsonOk(feedBody({ entries: [entry] })));
      }
      if (u.includes("/bell/open")) return Promise.resolve(jsonOk({ ok: true }));
      if (u.includes("/bell/read")) return readGate.then(() => jsonOk({ ok: true }));
      if (u.includes("/resolve")) return Promise.resolve(jsonOk({ status: "resolved" }));
      return Promise.resolve(jsonOk({}));
    });

    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    const toggle = await within(panel).findByTestId("bell-entry-toggle-c-1");

    fireEvent.click(toggle); // read POST in flight (gated)
    await waitFor(() => expect(callsTo("/bell/read")).toHaveLength(1));

    const before = feedHits;
    fireEvent.click(within(panel).getByTestId("bell-resolve-c-1")); // resolve while read pending
    await waitFor(() => expect(callsTo("/resolve")).toHaveLength(1));
    await waitFor(() => expect(feedHits).toBeGreaterThan(before)); // resolve refetch

    releaseRead(); // let the read settle after the refetch
    await waitFor(() => expect(callsTo("/resolve")).toHaveLength(1)); // no double-resolve
    // No crash; panel still rendered.
    expect(getByTestId("bell-panel")).toBeTruthy();
  });
});
