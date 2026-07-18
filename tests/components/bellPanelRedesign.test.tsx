// @vitest-environment jsdom
/**
 * BellPanel — visual redesign behaviors (spec 2026-07-06-bell-notification-redesign).
 * Covers the NEW contracts the restyle introduces on top of the existing panel:
 *   - severity tone (`bell-sev-{id}` `data-tone`) derived CLIENT-SIDE from
 *     `isHealth` + the catalog per-code `severity` (D2);
 *   - the `data-unread` row attribute driving the row tint (D4);
 *   - "Mark all read" (`bell-mark-all-read`) — three visibility cases + the
 *     decoupled markRead that must NOT clobber expand state (D3 / R3 / R4 / R7);
 *   - message is NEVER clamped, and the caret stays gated on helpful context (R4).
 *
 * jsdom + RTL, `global.fetch` stubbed per test. Anti-tautology: every assertion
 * scopes to `within(getByTestId("bell-panel"))` or a specific row testid; the
 * panel renders standalone so no sibling can satisfy an assertion.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { BellPanel } from "@/components/admin/BellPanel";
import { lookupHelpfulContext, messageFor, type MessageCode } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { INLINE_IDENTITY_CODES } from "@/lib/adminAlerts/alertIdentityMap";
import type { BellEntry } from "@/lib/admin/bellFeed";

const ALL_CODES = Object.keys(MESSAGE_CATALOG) as MessageCode[];
// An info-severity code (drives the "info" tone) and a default/no-severity code
// (drives "notice"). Derived from the live catalog so they can't drift.
const INFO_CODE = ALL_CODES.find((c) => messageFor(c).severity === "info")!;
const NOTICE_CODE = "ADMIN_ALERT_COUNT_FAILED"; // no `severity` → notice tone
// A code WITH helpful context (caret present) — for the message/clamp test.
const CODE_WITH_HELP = ALL_CODES.find((c) => lookupHelpfulContext(c) !== null)!;

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

function makeEntry(over: Partial<BellEntry> & { alertId: string }): BellEntry {
  return {
    code: NOTICE_CODE,
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
    historyDays: 14,
    feedCap: 50,
    seenThrough: "2026-07-05T10:00:00.000Z",
    ...over,
  };
}

const calls: Array<[string, RequestInit | undefined]> = [];
function routeFetch(body: unknown) {
  calls.length = 0;
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    calls.push([url, init]);
    return Promise.resolve(jsonOk(url.includes("/bell/feed") ? body : {}));
  });
}
const readCalls = () => calls.filter(([u]) => u.includes("/bell/read"));

function renderPanel(props: Partial<Parameters<typeof BellPanel>[0]> = {}) {
  return render(
    <BellPanel
      viewerIsDeveloper={props.viewerIsDeveloper ?? false}
      onClose={props.onClose ?? vi.fn()}
      onOpened={props.onOpened ?? vi.fn()}
    />,
  );
}

describe("BellPanel redesign — severity tone (D2)", () => {
  it("derives data-tone: critical (isHealth) / info (catalog severity:info) / notice (default)", async () => {
    const entries = [
      makeEntry({ alertId: "crit", state: "active", isHealth: true }),
      makeEntry({ alertId: "info", state: "active", code: INFO_CODE }),
      makeEntry({ alertId: "note", state: "active", code: NOTICE_CODE }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    expect(within(panel).getByTestId("bell-sev-crit").getAttribute("data-tone")).toBe("critical");
    expect(within(panel).getByTestId("bell-sev-info").getAttribute("data-tone")).toBe("info");
    expect(within(panel).getByTestId("bell-sev-note").getAttribute("data-tone")).toBe("notice");
  });
});

describe("BellPanel redesign — unread row attribute (D4)", () => {
  it("data-unread reflects the entry's unread state on the active row", async () => {
    const entries = [
      makeEntry({ alertId: "u", state: "active", unread: true }),
      makeEntry({ alertId: "r", state: "active", unread: false }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    await within(getByTestId("bell-panel")).findByTestId("bell-section-active");

    expect(getByTestId("bell-entry-u").getAttribute("data-unread")).toBe("true");
    expect(getByTestId("bell-entry-r").getAttribute("data-unread")).toBe("false");
  });
});

describe("BellPanel redesign — mark all read (D3)", () => {
  it("(a) unread + non-truncated: fires /bell/read once per unread active row; dedupes; hides after", async () => {
    const entries = [
      makeEntry({ alertId: "m1", state: "active", unread: true }),
      makeEntry({ alertId: "m2", state: "active", unread: true }),
      makeEntry({ alertId: "m3", state: "active", unread: false }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId, queryByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    const btn = within(panel).getByTestId("bell-mark-all-read");
    fireEvent.click(btn);

    // One read POST per still-unread active row (m1, m2) — not the read m3.
    await waitFor(() => expect(readCalls()).toHaveLength(2));
    const ids = readCalls()
      .map(([, init]) => JSON.parse(String(init!.body)).alertId)
      .sort();
    expect(ids).toEqual(["m1", "m2"]);

    // The button hides once the markers clear (no unread rows remain).
    await waitFor(() => expect(queryByTestId("bell-mark-all-read")).toBeNull());

    // Dot markers cleared optimistically.
    expect(getByTestId("bell-entry-m1").getAttribute("data-unread")).toBe("false");
    expect(getByTestId("bell-entry-m2").getAttribute("data-unread")).toBe("false");
  });

  it("(a) preserves expand/collapse state — mark-all does not clobber expandedIds (R7)", async () => {
    const entries = [
      makeEntry({ alertId: "e1", state: "active", unread: true, code: CODE_WITH_HELP }),
      makeEntry({ alertId: "e2", state: "active", unread: true, code: CODE_WITH_HELP }),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId, queryByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    // Pre-expand e1 (reveals its helpful-context box); e2 stays collapsed.
    fireEvent.click(within(panel).getByTestId("bell-entry-toggle-e1"));
    await within(panel).findByTestId("bell-context-e1");
    expect(queryByTestId("bell-context-e2")).toBeNull();

    fireEvent.click(within(panel).getByTestId("bell-mark-all-read"));
    await waitFor(() =>
      expect(getByTestId("bell-entry-e2").getAttribute("data-unread")).toBe("false"),
    );

    // e1 STILL expanded, e2 STILL collapsed — mark-all only cleared markers.
    expect(within(panel).getByTestId("bell-context-e1")).toBeTruthy();
    expect(queryByTestId("bell-context-e2")).toBeNull();
  });

  it("(b) no unread active rows → button absent", async () => {
    const entries = [makeEntry({ alertId: "r1", state: "active", unread: false })];
    routeFetch(feedBody({ entries }));
    const { getByTestId, queryByTestId } = renderPanel();
    await within(getByTestId("bell-panel")).findByTestId("bell-section-active");
    expect(queryByTestId("bell-mark-all-read")).toBeNull();
  });

  it("(c) truncated feed → button absent even with unread; truncation row present; no header read POST", async () => {
    const entries = [
      makeEntry({ alertId: "t1", state: "active", unread: true }),
      makeEntry({ alertId: "t2", state: "active", unread: true }),
    ];
    routeFetch(feedBody({ entries, truncated: true }));
    const { getByTestId, queryByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    expect(queryByTestId("bell-mark-all-read")).toBeNull();
    expect(within(panel).getByTestId("bell-truncation-row")).toBeTruthy();
    // No mark-all control exists → no bulk read POST is reachable from the header.
    expect(readCalls()).toHaveLength(0);
  });
});

describe("BellPanel redesign — message never clamped (R4)", () => {
  it("message row renders full text with NO line-clamp; caret present when helpful exists", async () => {
    const entry = makeEntry({ alertId: "mc", state: "active", code: CODE_WITH_HELP });
    routeFetch(feedBody({ entries: [entry] }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    const row = getByTestId("bell-entry-mc");
    const title = messageFor(CODE_WITH_HELP).title ?? "";
    // The full Doug-facing message is rendered (row text is well beyond the title).
    expect(row.textContent!.length).toBeGreaterThan(title.length + 20);
    // No element in the row applies a CSS line-clamp — the remediation copy can
    // NEVER be visually truncated (R4). The message is always fully visible; only
    // the helpful-context box is gated behind the caret.
    expect(row.querySelector('[class*="line-clamp"]')).toBeNull();
    expect(within(panel).getByTestId("bell-caret-mc")).toBeTruthy();
  });

  it("catalog invariant: no message-bearing code lacks helpful context — the orphaned-hidden-message case (R4) cannot arise", () => {
    const orphans = (Object.keys(MESSAGE_CATALOG) as MessageCode[]).filter(
      (c) =>
        messageFor(c).dougFacing != null &&
        lookupHelpfulContext(c) === null &&
        // Spec 2026-07-17 §D3: INLINE_IDENTITY_CODES weave identity directly
        // into dougFacing, so the caret-gated helpfulContext box is redundant
        // for them by design (ROLE_FLAGS_NOTICE is the one live case that
        // actually drops helpfulContext to null). Excluded here, not an
        // orphan — the message itself carries the full context, never hidden.
        !INLINE_IDENTITY_CODES.has(c),
    );
    // Every OTHER code that renders a message also carries a caret-gated
    // helpful context, so even without the no-clamp guarantee there is no row
    // whose only content is a hidden (clamped) message with no affordance.
    // This pins the premise behind dropping message clamping from scope.
    expect(orphans).toEqual([]);
  });
});

describe("condensed inline-context rows (spec 2026-07-17)", () => {
  const roleFlagsEntry = makeEntry({
    alertId: "role-1",
    code: "ROLE_FLAGS_NOTICE",
    context: {
      changes: [{ crew_name: "Doug Larson", prior_flags: ["A1"], new_flags: ["A1", "LEAD"] }],
    },
    messageParams: {
      "sheet-name": "'II - RIA Investment Forum'",
      "role-changes": "Doug Larson's role changed from A1 to A1 + LEAD.",
      "lead-hint": " Lead changes must be confirmed in the show page.",
    },
    actions: [
      { label: "Review in show page", href: "/admin/show/ria-forum", external: false },
      { label: "Open in Sheet", href: "https://docs.google.com/x", external: true },
    ],
  });

  async function renderPanelWith(entries: BellEntry[]) {
    routeFetch(feedBody({ entries }));
    const utils = renderPanel();
    await within(utils.getByTestId("bell-panel")).findByTestId("bell-section-active");
    return utils;
  }

  it("renders the interpolated one-line message and suppresses the identity chip", async () => {
    await renderPanelWith([roleFlagsEntry]);
    expect(
      screen.getByText(
        "In 'II - RIA Investment Forum', Doug Larson's role changed from A1 to A1 + LEAD. Lead changes must be confirmed in the show page.",
      ),
    ).toBeTruthy();
    expect(screen.queryByTestId(`bell-identity-${roleFlagsEntry.alertId}`)).toBeNull();
    expect(screen.queryByTestId(`bell-caret-${roleFlagsEntry.alertId}`)).toBeNull(); // helpfulContext now null
  });

  it("renders both action links in order", async () => {
    await renderPanelWith([roleFlagsEntry]);
    const first = screen.getByTestId(`bell-action-${roleFlagsEntry.alertId}-0`);
    const second = screen.getByTestId(`bell-action-${roleFlagsEntry.alertId}-1`);
    expect(first.textContent).toContain("Review in show page");
    expect(first.getAttribute("href")).toBe("/admin/show/ria-forum");
    expect(first.hasAttribute("target")).toBe(false);
    expect(second.textContent).toContain("Open in Sheet");
    expect(second.getAttribute("target")).toBe("_blank");
  });

  it("guard path: unresolved placeholder drops the message line and KEEPS the chip", async () => {
    const broken = makeEntry({
      alertId: "broken-1",
      code: "ROLE_FLAGS_NOTICE",
      messageParams: {}, // sheet-name/role-changes missing → template unresolved
      identity: {
        segments: [{ label: "Sheet", value: "II - RIA Investment Forum" }],
        global: false,
      },
      actions: [],
    });
    await renderPanelWith([broken]);
    expect(screen.queryByText(/In <sheet-name>/)).toBeNull();
    expect(screen.getByTestId(`bell-identity-${broken.alertId}`)).toBeTruthy();
  });

  it("multi-line message span carries whitespace-pre-line", async () => {
    const multi = makeEntry({
      alertId: "multi-1",
      code: "ROLE_FLAGS_NOTICE",
      messageParams: {
        "sheet-name": "'X'",
        "role-changes": "2 role changes:\n• A: A1 → LEAD + A1\n• B: added with FINANCIALS",
        "lead-hint": "",
      },
      actions: [],
    });
    await renderPanelWith([multi]);
    const span = screen.getByText(/2 role changes:/);
    expect(span.className).toContain("whitespace-pre-line");
  });

  it("non-member codes keep their chip exactly as before", async () => {
    const watch = makeEntry({
      alertId: "watch-1",
      code: "WATCH_CHANNEL_ORPHANED",
      messageParams: {},
      identity: { segments: [{ label: "Folder", value: "fxav-test-shows" }], global: false },
      actions: [],
    });
    await renderPanelWith([watch]);
    expect(screen.getByTestId(`bell-identity-${watch.alertId}`)).toBeTruthy();
  });
});
