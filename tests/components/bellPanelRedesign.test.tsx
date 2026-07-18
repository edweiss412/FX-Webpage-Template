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
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { BellPanel } from "@/components/admin/BellPanel";
import { lookupHelpfulContext, messageFor, type MessageCode } from "@/lib/messages/lookup";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";
import { DEGRADED_HEALTH_CODES, NOTICE_HEALTH_CODES } from "@/lib/adminAlerts/audience";
import { GROUP_THRESHOLD, groupActiveBySeverity } from "@/lib/admin/bellTriage";
import type { BellEntry } from "@/lib/admin/bellFeed";

const ALL_CODES = Object.keys(MESSAGE_CATALOG) as MessageCode[];
// An info-severity code (drives the "info" tone) and a default/no-severity code
// (drives "notice"). Derived from the live catalog so they can't drift.
const INFO_CODE = ALL_CODES.find((c) => messageFor(c).severity === "info")!;
const NOTICE_CODE = "ADMIN_ALERT_COUNT_FAILED"; // no `severity` → notice tone
// Health codes by weight (isHealth + degraded → critical; isHealth + notice →
// notice, §1.6). Strict tsconfig: narrow the [0] index to a `string`.
const DEGRADED0: string = DEGRADED_HEALTH_CODES[0]!;
const NOTICE_HEALTH0: string = NOTICE_HEALTH_CODES[0]!;
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
    action: null,
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
      makeEntry({ alertId: "crit", state: "active", isHealth: true, code: DEGRADED0 }),
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
      (c) => messageFor(c).dougFacing != null && lookupHelpfulContext(c) === null,
    );
    // Every code that renders a message also carries a caret-gated helpful
    // context, so even without the no-clamp guarantee there is no row whose only
    // content is a hidden (clamped) message with no affordance. This pins the
    // premise behind dropping message clamping from scope.
    expect(orphans).toEqual([]);
  });
});

describe("BellPanel — triage severity grouping (BELL-2)", () => {
  // n notice rows (default code) with distinct descending activityAt.
  function noticeRows(n: number, prefix = "n"): BellEntry[] {
    return Array.from({ length: n }, (_, i) =>
      makeEntry({
        alertId: `${prefix}${i}`,
        code: NOTICE_CODE,
        activityAt: `2026-07-05T${String(23 - i).padStart(2, "0")}:00:00.000Z`,
      }),
    );
  }
  const tierHeaders = (panel: HTMLElement) =>
    Array.from(panel.querySelectorAll('[data-testid^="bell-section-active-tier-"]'));

  it("a) flat below threshold: GROUP_THRESHOLD-1 active → no tier headers", async () => {
    routeFetch(feedBody({ entries: noticeRows(GROUP_THRESHOLD - 1) }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");
    expect(tierHeaders(panel)).toHaveLength(0);
    expect(within(panel).getByTestId("bell-section-active-heading").textContent).toContain(
      `Active · ${GROUP_THRESHOLD - 1}`,
    );
  });

  it("b) grouped at threshold: tier headers for non-empty tones in critical→notice→info order, counts from the partition", async () => {
    const entries = [
      ...Array.from({ length: 2 }, (_, i) =>
        makeEntry({ alertId: `c${i}`, isHealth: true, code: DEGRADED0 }),
      ),
      ...noticeRows(4),
      ...Array.from({ length: 3 }, (_, i) => makeEntry({ alertId: `i${i}`, code: INFO_CODE })),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");

    // DOM order critical → notice → info.
    expect(tierHeaders(panel).map((h) => h.getAttribute("data-testid"))).toEqual([
      "bell-section-active-tier-critical",
      "bell-section-active-tier-notice",
      "bell-section-active-tier-info",
    ]);
    // Header text/counts derived from the partition (anti-tautology).
    const groups = groupActiveBySeverity(entries);
    const labelFor: Record<string, string> = {
      critical: "Critical",
      notice: "Warning",
      info: "Notice",
    };
    for (const g of groups) {
      expect(
        within(panel).getByTestId(`bell-section-active-tier-${g.tone}`).textContent,
      ).toContain(`${labelFor[g.tone]} · ${g.rows.length}`);
    }
    // Active · N is the TOTAL.
    expect(within(panel).getByTestId("bell-section-active-heading").textContent).toContain(
      `Active · ${entries.length}`,
    );
  });

  it("c) within-tier alertId order equals the fixture (server) order for that tone", async () => {
    const entries = [
      makeEntry({ alertId: "c0", isHealth: true, code: DEGRADED0 }),
      ...noticeRows(8),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");
    const noticeTone = groupActiveBySeverity(entries).find((g) => g.tone === "notice")!;
    const expectedOrder = noticeTone.rows.map((r) => r.alertId);
    const rendered = Array.from(
      within(panel)
        .getByTestId("bell-section-active-tier-notice")
        .parentElement!.querySelectorAll('[data-testid^="bell-entry-"]'),
    )
      .map((el) => el.getAttribute("data-testid")!)
      // exclude the nested bell-entry-toggle-* elements; keep only the row ids
      .filter((tid) => !tid.startsWith("bell-entry-toggle-"))
      .map((tid) => tid.replace("bell-entry-", ""));
    expect(rendered).toEqual(expectedOrder);
  });

  it("d) notice-weight health lands under Warning, NOT Critical (§1.6 at the grouping layer)", async () => {
    const entries = [makeEntry({ alertId: "nh", isHealth: true, code: NOTICE_HEALTH0 }), ...noticeRows(8)];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");
    expect(within(panel).queryByTestId("bell-section-active-tier-critical")).toBeNull();
    const noticeSection = within(panel).getByTestId("bell-section-active-tier-notice").parentElement!;
    expect(noticeSection.querySelector('[data-testid="bell-entry-nh"]')).not.toBeNull();
  });

  it("e) empty tier omitted: no info rows → no info tier header", async () => {
    const entries = [
      makeEntry({ alertId: "c0", isHealth: true, code: DEGRADED0 }),
      ...noticeRows(8),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");
    expect(within(panel).queryByTestId("bell-section-active-tier-info")).toBeNull();
  });

  it("f) single-tier: all notice → one Warning · N header, no flat fallback", async () => {
    routeFetch(feedBody({ entries: noticeRows(GROUP_THRESHOLD) }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");
    const headers = tierHeaders(panel);
    expect(headers).toHaveLength(1);
    expect(headers[0]!.getAttribute("data-testid")).toBe("bell-section-active-tier-notice");
    expect(headers[0]!.textContent).toContain(`Warning · ${GROUP_THRESHOLD}`);
  });

  it("g) boundary: exactly GROUP_THRESHOLD → grouped; GROUP_THRESHOLD-1 → flat", async () => {
    routeFetch(feedBody({ entries: noticeRows(GROUP_THRESHOLD) }));
    const r1 = renderPanel();
    const p1 = r1.getByTestId("bell-panel");
    await within(p1).findByTestId("bell-section-active");
    expect(tierHeaders(p1).length).toBeGreaterThan(0);
    cleanup();

    routeFetch(feedBody({ entries: noticeRows(GROUP_THRESHOLD - 1) }));
    const r2 = renderPanel();
    const p2 = r2.getByTestId("bell-panel");
    await within(p2).findByTestId("bell-section-active");
    expect(tierHeaders(p2)).toHaveLength(0);
  });

  it("h) activeTruncated → flat even at ≥threshold; truncation row present", async () => {
    routeFetch(
      feedBody({ entries: noticeRows(GROUP_THRESHOLD), activeTruncated: true, truncated: true }),
    );
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");
    expect(tierHeaders(panel)).toHaveLength(0);
    expect(within(panel).getByTestId("bell-truncation-row")).toBeTruthy();
  });

  it("i) history-only truncation (activeTruncated false, truncated true) STILL groups", async () => {
    routeFetch(
      feedBody({ entries: noticeRows(GROUP_THRESHOLD), activeTruncated: false, truncated: true }),
    );
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");
    expect(tierHeaders(panel).length).toBeGreaterThan(0);
  });

  it("j) fail-closed: omitted / non-boolean activeTruncated → flat", async () => {
    // omitted
    const body = feedBody({ entries: noticeRows(GROUP_THRESHOLD) }) as Record<string, unknown>;
    delete body.activeTruncated;
    routeFetch(body);
    const r1 = renderPanel();
    const p1 = r1.getByTestId("bell-panel");
    await within(p1).findByTestId("bell-section-active");
    expect(tierHeaders(p1)).toHaveLength(0);
    cleanup();

    // non-boolean
    routeFetch(feedBody({ entries: noticeRows(GROUP_THRESHOLD), activeTruncated: "nope" }));
    const r2 = renderPanel();
    const p2 = r2.getByTestId("bell-panel");
    await within(p2).findByTestId("bell-section-active");
    expect(tierHeaders(p2)).toHaveLength(0);
  });

  // (k) set-preservation across a real grouped→flat transition needs a driven
  // refetch (resolve/realtime) — covered in the real-browser transition audit
  // (tests/e2e/bell-panel-layout.spec.ts, spec §3 compound), not jsdom.

  it("l) mark-all-read leaves tier headers + counts unchanged", async () => {
    const entries = [
      ...Array.from({ length: 2 }, (_, i) =>
        makeEntry({ alertId: `c${i}`, isHealth: true, code: DEGRADED0, unread: true }),
      ),
      ...noticeRows(7).map((e) => ({ ...e, unread: true })),
    ];
    routeFetch(feedBody({ entries }));
    const { getByTestId } = renderPanel();
    const panel = getByTestId("bell-panel");
    await within(panel).findByTestId("bell-section-active");
    const before = tierHeaders(panel).map((h) => h.textContent);
    fireEvent.click(within(panel).getByTestId("bell-mark-all-read"));
    await waitFor(() => {
      expect(tierHeaders(panel).map((h) => h.textContent)).toEqual(before);
    });
  });
});
