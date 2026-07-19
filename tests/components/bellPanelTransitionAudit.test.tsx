// @vitest-environment jsdom
/**
 * BellPanel transition audit (spec §6 Transition Inventory).
 *
 * Every conditional surface in the panel body is an INSTANT conditional render —
 * no AnimatePresence, no framer exit. (The WI-5 chevron-hint banner, the one
 * surface this audit was originally written for, was removed: a self-referential
 * "now opens its show page" onboarding note goes stale the moment it ships. The
 * chevron affordance itself is unchanged.)
 *
 * jsdom is sufficient for prop-presence / instant-render; the geometry
 * (right-flush columns, tap-target, no-overflow) lives in the real-browser layout
 * spec (tests/e2e/bell-panel-layout.spec.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { BellPanel } from "@/components/admin/BellPanel";
import type { BellEntry } from "@/lib/admin/bellFeed";

const fetchMock = vi.fn();
beforeEach(() => {
  window.localStorage.clear();
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

describe("BellPanel transition audit", () => {
  it("BellPanel source uses NO AnimatePresence / framer exit (instant is deliberate)", () => {
    const src = readFileSync(join(process.cwd(), "components/admin/BellPanel.tsx"), "utf8");
    expect(src).not.toContain("AnimatePresence");
    expect(src).not.toContain("framer-motion");
  });

  it("the removed WI-5 chevron-hint banner does not come back", async () => {
    const src = readFileSync(join(process.cwd(), "components/admin/BellPanel.tsx"), "utf8");
    expect(src).not.toContain("bell-chevron-hint");
    expect(src).not.toContain("useDismissibleOnce");
    renderPanel([makeEntry({ alertId: "c1", slug: "east-coast", unread: true })]);
    await waitFor(() => expect(screen.getByTestId("bell-entry-c1")).toBeTruthy());
    expect(screen.queryByTestId("bell-chevron-hint")).toBeNull();
  });

  it("chevron slot is reserved exactly once per row, whichever branch renders", async () => {
    renderPanel([
      makeEntry({ alertId: "withSlug", slug: "east-coast" }),
      makeEntry({ alertId: "noSlug", slug: null }),
    ]);
    await waitFor(() => expect(screen.getByTestId("bell-entry-noSlug")).toBeTruthy());
    // Chevron-present row: real link, no reserved spacer.
    expect(screen.getByTestId("bell-caret-withSlug")).toBeTruthy();
    expect(screen.queryByTestId("bell-caret-slot-withSlug")).toBeNull();
    // Chevron-absent row: spacer stands in, and it is out of the a11y tree so the
    // reservation never reads as an interactive affordance.
    expect(screen.queryByTestId("bell-caret-noSlug")).toBeNull();
    const slot = screen.getByTestId("bell-caret-slot-noSlug");
    expect(slot.getAttribute("aria-hidden")).toBe("true");
    expect(slot.textContent).toBe("");
  });

  it("empty list renders the empty state; no crash", async () => {
    renderPanel([]);
    await waitFor(() => expect(screen.getByTestId("bell-empty")).toBeTruthy());
  });
});
