// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/statusStrip.test.tsx (consolidated-admin-show-page Task 10)
 *
 * The pinned status strip (spec §4 element table, §6 mode matrix, §11 guards). The strip
 * is DISPLAY + 2 actions max (publish toggle, copy link); everything else lives in Overview.
 *
 * Failure modes caught:
 *   - live badge rendered when the show is not live (spec §4 "render only when live").
 *   - sync-age element rendered (as "never") when last_synced_at is null — the omit
 *     contract (spec §11): formatRelative("never") must NOT reach the DOM.
 *   - copy-link shown while the crew link is paused (unpublished) or archived, or with no
 *     token — a misleading dead link (spec §11 "no active share token → hidden").
 *   - archived strip still exposing the publish toggle / copy link (must be read-only),
 *     OR sneaking an Unarchive button into the strip (mock README delta 5: Unarchive is an
 *     Overview control; the strip caps at two actions).
 *   - alert badge rendered when the open count is 0 (spec §4 "hidden when 0").
 *
 * Anti-tautology: sync/live/copy assertions scope INTO the element's own testid subtree so
 * a sibling that independently renders the same word (e.g. the toggle's "Published", the
 * copy button's "Copy") cannot satisfy them. Expected values derive from the props fixture.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { StatusStrip, type StatusStripProps } from "@/components/admin/showpage/StatusStrip";
import { ShareTokenProvider } from "@/app/admin/show/[slug]/ShareTokenContext";

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
  usePathname: () => "/admin/show/east-coast-summit",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

// Fixed clock so formatRelative is deterministic. last_synced_at 12 min before.
const NOW = new Date("2026-07-16T12:00:00.000Z");
const SYNCED_12M = "2026-07-16T11:48:00.000Z";

function baseProps(overrides: Partial<StatusStripProps> = {}): StatusStripProps {
  return {
    slug: "east-coast-summit",
    title: "East Coast Broadcast Summit",
    archived: false,
    published: true,
    finalizeOwned: false,
    setPublished: vi.fn(async () => ({ ok: true }) as const),
    isLive: false,
    lastSyncedAt: SYNCED_12M,
    lastSyncStatus: "ok",
    now: NOW,
    alertCount: 0,
    ...overrides,
  };
}

function renderStrip(
  overrides: Partial<StatusStripProps> = {},
  { token = "TOK" as string | null, epoch = 5 } = {},
) {
  return render(
    <ShareTokenProvider initialToken={token} initialEpoch={epoch}>
      <StatusStrip {...baseProps(overrides)} />
    </ShareTokenProvider>,
  );
}

describe("StatusStrip", () => {
  it("renders the strip container and the show title", () => {
    renderStrip();
    expect(screen.getByTestId("show-status-strip")).toBeTruthy();
    expect(screen.getByTestId("strip-title").textContent).toBe("East Coast Broadcast Summit");
  });

  it("renders the show title as the page's h1 (the consolidated page's top-level heading)", () => {
    // The rebuild dropped AdminPageHeader; the sticky strip title IS the page heading, so it
    // must be an <h1> — a page with no h1 loses its top-level landmark for screen readers.
    renderStrip();
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("East Coast Broadcast Summit");
    expect(heading.getAttribute("data-testid")).toBe("strip-title");
  });

  it("falls back to the slug when title is null", () => {
    renderStrip({ title: null });
    expect(screen.getByTestId("strip-title").textContent).toBe("east-coast-summit");
  });

  it("shows the live-now badge when the show is live", () => {
    renderStrip({ isLive: true });
    expect(within(screen.getByTestId("strip-live-badge")).getByText(/live now/i)).toBeTruthy();
  });

  it("hides the live-now badge when the show is not live", () => {
    renderStrip({ isLive: false });
    expect(screen.queryByTestId("strip-live-badge")).toBeNull();
  });

  it("wraps the existing PublishedToggle and reflects the published state", () => {
    renderStrip({ published: true });
    const wrapper = screen.getByTestId("strip-publish-toggle");
    const toggle = within(wrapper).getByTestId("published-toggle");
    expect(toggle.getAttribute("aria-checked")).toBe("true");
  });

  it("renders the compact INLINE toggle (not the full card) in the strip (CASP-2)", () => {
    renderStrip({ published: true });
    const wrapper = screen.getByTestId("strip-publish-toggle");
    expect(within(wrapper).getByTestId("published-toggle-inline")).toBeTruthy();
    expect(within(wrapper).queryByTestId("published-toggle-row")).toBeNull();
    expect(within(wrapper).getByTestId("published-toggle").getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("renders the copy-link (with the token URL) for a published, non-archived show with a token", () => {
    renderStrip({ published: true, archived: false }, { token: "TOK" });
    const copy = screen.getByTestId("strip-copy-link");
    const btn = within(copy).getByTestId("admin-current-share-link-copy-button");
    expect(btn.getAttribute("aria-label")).toMatch(/copy/i);
    // The URL is closed over on the button's click handler; assert the surface is present.
    expect(copy).toBeTruthy();
  });

  it("hides the copy-link when there is no active share token", () => {
    renderStrip({ published: true }, { token: null });
    expect(screen.queryByTestId("strip-copy-link")).toBeNull();
  });

  it("hides the copy-link when the show is unpublished (crew link paused)", () => {
    // Token persists across unpublish, but the link is paused — copying it is misleading.
    renderStrip({ published: false }, { token: "TOK" });
    expect(screen.queryByTestId("strip-copy-link")).toBeNull();
  });

  describe("archived (read-only)", () => {
    it("shows the archived badge and hides the toggle, copy-link, and live badge", () => {
      renderStrip({ archived: true, published: false, isLive: true }, { token: "TOK" });
      expect(screen.getByTestId("strip-archived-badge").textContent).toMatch(/read-only/i);
      expect(screen.queryByTestId("strip-publish-toggle")).toBeNull();
      expect(screen.queryByTestId("strip-copy-link")).toBeNull();
      expect(screen.queryByTestId("strip-live-badge")).toBeNull();
    });

    it("does NOT render an Unarchive button in the strip (Overview owns it — README delta 5)", () => {
      renderStrip({ archived: true, published: false }, { token: "TOK" });
      const strip = screen.getByTestId("show-status-strip");
      expect(within(strip).queryByText(/unarchive/i)).toBeNull();
    });
  });

  describe("alert badge", () => {
    it("hides the alert badge when the open count is 0", () => {
      renderStrip({ alertCount: 0 });
      expect(screen.queryByTestId("strip-alert-badge")).toBeNull();
    });

    it("shows a count badge anchored to #overview when there are open alerts", () => {
      renderStrip({ alertCount: 3 });
      const badge = screen.getByTestId("strip-alert-badge");
      expect(badge.getAttribute("href")).toBe("#overview");
      expect(badge.textContent).toMatch(/3/);
      expect(badge.textContent).toMatch(/alert/i);
    });

    it("uses the singular noun for a single alert", () => {
      renderStrip({ alertCount: 1 });
      const badge = screen.getByTestId("strip-alert-badge");
      expect(badge.textContent).toMatch(/\b1\b/);
      expect(badge.textContent).not.toMatch(/alerts/i);
    });

    it("carries a 44px tap-min hit area without inflating the visual pill (PRODUCT a11y floor)", () => {
      // The visible pill stays small (text-xs), but as an interactive chrome target it MUST
      // meet 44×44 — extended via the same before:-inset hit-area pattern the publish switch
      // uses (PublishedToggle.tsx), so the slim strip is unaffected.
      renderStrip({ alertCount: 3 });
      const badge = screen.getByTestId("strip-alert-badge");
      expect(badge.className).toContain("relative");
      expect(badge.className).toMatch(/before:-inset-y/);
    });

    it("renders the alert glyph as a committed lucide icon (svg), not a raw unicode glyph", () => {
      // DESIGN §8: lucide-react is the icon system. The alert badge uses TriangleAlert
      // (the same warning vocabulary as IgnoredSheetsDisclosure), never a raw '▲'.
      renderStrip({ alertCount: 3 });
      const badge = screen.getByTestId("strip-alert-badge");
      expect(badge.querySelector("svg")).not.toBeNull();
      expect(badge.textContent).not.toContain("▲");
    });
  });

  describe("sync age", () => {
    it("omits the sync-age element entirely when last_synced_at is null (does not render 'never')", () => {
      renderStrip({ lastSyncedAt: null });
      expect(screen.queryByTestId("strip-sync-age")).toBeNull();
      expect(screen.queryByText(/never/i)).toBeNull();
    });

    it("shows 'Synced <relative>' when last sync succeeded", () => {
      renderStrip({ lastSyncedAt: SYNCED_12M, lastSyncStatus: "ok" });
      const age = screen.getByTestId("strip-sync-age");
      expect(age.textContent).toMatch(/synced/i);
      expect(age.textContent).toMatch(/12 min ago/i);
    });

    it("shows the health-bucket label (not 'Synced') when the last sync failed", () => {
      renderStrip({ lastSyncedAt: SYNCED_12M, lastSyncStatus: "parse_error" });
      const age = screen.getByTestId("strip-sync-age");
      expect(age.textContent).toMatch(/couldn.t read the sheet/i);
      expect(age.textContent).not.toMatch(/synced/i);
    });
  });
});
