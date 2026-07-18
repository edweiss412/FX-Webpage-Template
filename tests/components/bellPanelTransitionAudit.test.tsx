// @vitest-environment jsdom
/**
 * WI-5 transition audit (spec §6 Transition Inventory).
 *
 * The only animated surface added by this pass is the chevron-hint banner, and
 * its treatment is INSTANT (no AnimatePresence / exit): dismiss removes it in the
 * same tick, its mount is silent (no entrance animation). The message-block /
 * <ul> toggles are instant conditional renders. Compound: dismissing the banner
 * is independent of a row's read state.
 *
 * jsdom is sufficient for prop-presence / instant-removal; the geometry
 * (no-overlap, tap-target, in-flow non-clip) lives in the real-browser layout
 * spec (tests/e2e/bell-panel-layout.spec.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BellPanel } from "@/components/admin/BellPanel";
import { __resetDismissMemory } from "@/components/admin/useDismissibleOnce";
import type { BellEntry } from "@/lib/admin/bellFeed";

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
function renderPanel(entries: BellEntry[]) {
  fetchMock.mockImplementation((url: string) =>
    Promise.resolve(jsonOk(url.includes("/bell/feed") ? feedBody({ entries }) : {})),
  );
  return render(<BellPanel viewerIsDeveloper={false} onClose={vi.fn()} onOpened={vi.fn()} />);
}

describe("WI-5 transition audit", () => {
  it("BellPanel source uses NO AnimatePresence / framer exit for the hint (instant is deliberate)", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/BellPanel.tsx"), "utf8");
    expect(src).not.toContain("AnimatePresence");
    expect(src).not.toContain("framer-motion");
  });

  it("dismiss removes the banner in the same tick, no error, no exit animation", async () => {
    renderPanel([makeEntry({ alertId: "c1", slug: "east-coast", unread: true })]);
    const dismiss = await screen.findByTestId("bell-chevron-hint-dismiss");
    expect(() => fireEvent.click(dismiss)).not.toThrow();
    // Instant removal — no waitFor needed.
    expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
  });

  it("compound: dismissing the banner leaves a row's unread read-state unaffected", async () => {
    renderPanel([makeEntry({ alertId: "c1", slug: "east-coast", unread: true })]);
    const dismiss = await screen.findByTestId("bell-chevron-hint-dismiss");
    expect(screen.getByTestId("bell-entry-c1").getAttribute("data-unread")).toBe("true");
    fireEvent.click(dismiss);
    // The row keeps its unread state — the banner dismiss touched only the hint.
    expect(screen.getByTestId("bell-entry-c1").getAttribute("data-unread")).toBe("true");
  });

  it("message-block / <ul> are instant conditional renders (role=note banner, no motion attrs)", async () => {
    renderPanel([makeEntry({ alertId: "c1", slug: "east-coast" })]);
    const banner = await screen.findByTestId("bell-chevron-hint");
    expect(banner.getAttribute("role")).toBe("note");
    // No framer-motion runtime attributes on the banner.
    expect(banner.getAttribute("data-projection-id")).toBeNull();
    expect(banner.style.opacity).toBe("");
  });

  it("banner absent on empty list; no crash", async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByTestId("bell-empty")).toBeTruthy());
    expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
  });
});
