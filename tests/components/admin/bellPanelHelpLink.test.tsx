// @vitest-environment jsdom
/**
 * BellPanel — "Learn more" help wayfinding link (impeccable critique P1,
 * alert-copy full-sweep). Longform education for a code now lives at
 * /help/errors#<CODE> (or the PARSE_ERROR_LAST_GOOD carve-out at
 * /help/admin/parse-warnings#PARSE_ERROR_LAST_GOOD), but alert rows had no
 * route to it. Rendered as the last item in the leading actions group,
 * low-emphasis so it never competes with the row's real actions
 * (Dismiss/Retry/View in telemetry).
 *
 * Anti-tautology: the href assertion is derived from the catalog's own
 * `helpHref` field (not hardcoded), and the absence case uses a real
 * cataloged code whose `helpHref` is null (GOOGLE_NO_CREW_MATCH) rather than
 * an uncataloged code, so a broken `isMessageCode` guard can't accidentally
 * pass.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
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

const HELP_CODE: MessageCode = "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE";
const NO_HELP_CODE: MessageCode = "GOOGLE_NO_CREW_MATCH";
const CARVEOUT_CODE: MessageCode = "PARSE_ERROR_LAST_GOOD";

function makeEntry(over: Partial<BellEntry> & { alertId: string }): BellEntry {
  return {
    code: HELP_CODE,
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

function feedBody(entries: BellEntry[]) {
  return {
    entries,
    unseenCount: 0,
    truncated: false,
    historyDays: 14,
    feedCap: 50,
    seenThrough: "2026-07-05T10:00:00.000Z",
  };
}

function routeFetch(entries: BellEntry[]) {
  fetchMock.mockImplementation((url: string) => {
    const u = String(url);
    if (u.includes("/bell/feed")) return Promise.resolve(jsonOk(feedBody(entries)));
    if (u.includes("/bell/open")) return Promise.resolve(jsonOk({ ok: true }));
    return Promise.resolve(jsonOk({}));
  });
}

function renderPanel() {
  return render(<BellPanel viewerIsDeveloper={false} onClose={vi.fn()} onOpened={vi.fn()} />);
}

describe("BellPanel — Learn more help link (impeccable P1)", () => {
  it("renders when the code's catalog helpHref is non-null, with the exact href + 'Learn more' text, as an internal (non-target) link", async () => {
    const entry = makeEntry({ alertId: "h-1", code: HELP_CODE });
    routeFetch([entry]);
    const { getByTestId } = renderPanel();
    const row = await within(getByTestId("bell-panel")).findByTestId("bell-entry-h-1");
    const link = within(row).getByTestId("bell-help-h-1");
    expect(link.getAttribute("href")).toBe(MESSAGE_CATALOG[HELP_CODE].helpHref as string);
    expect(link.textContent).toBe("Learn more");
    expect(link.tagName).toBe("A");
    expect(link.hasAttribute("target")).toBe(false);
  });

  it("is absent when the code's catalog helpHref is null", async () => {
    const entry = makeEntry({ alertId: "h-2", code: NO_HELP_CODE });
    routeFetch([entry]);
    const { getByTestId, queryByTestId } = renderPanel();
    await within(getByTestId("bell-panel")).findByTestId("bell-entry-h-2");
    expect(queryByTestId("bell-help-h-2")).toBeNull();
  });

  it("PARSE_ERROR_LAST_GOOD carve-out: links to /help/admin/parse-warnings, link text still 'Learn more'", async () => {
    const entry = makeEntry({ alertId: "h-3", code: CARVEOUT_CODE });
    routeFetch([entry]);
    const { getByTestId } = renderPanel();
    const row = await within(getByTestId("bell-panel")).findByTestId("bell-entry-h-3");
    const link = within(row).getByTestId("bell-help-h-3");
    expect(link.getAttribute("href")).toBe("/help/admin/parse-warnings#PARSE_ERROR_LAST_GOOD");
    expect(link.textContent).toBe("Learn more");
  });
});
