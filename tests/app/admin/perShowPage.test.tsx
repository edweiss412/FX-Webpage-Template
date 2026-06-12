// @vitest-environment jsdom
// M12.2 Phase A Task 9 — per-show page rework (spec §6). Archived-first status
// pill; crew-link surfaces gated on published && !archived && token; preview-as
// + rotate/reset gated on published && !archived; archived ParsePanel read-only;
// quiet sync footer. Full async-page render with mocked data layer.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const state = vi.hoisted(() => ({
  show: {} as Record<string, unknown>,
  crew: [] as Array<Record<string, unknown>>,
  pending: [] as Array<Record<string, unknown>>,
  token: null as string | null,
  // Phase 6 — the per-show changes feed (replaces the retired ParsePanel mount).
  feed: {
    entries: [] as Array<Record<string, unknown>>,
    truncated: false,
    totalShown: 0,
  } as { entries: Array<Record<string, unknown>>; truncated: boolean; totalShown: number },
  feedThrows: false as boolean,
  selectColsByTable: {} as Record<string, string>,
  // §3.2 finalize-owned predicate result (readfinalizeowned_b2). Default false
  // → a !published row reads "Held"; set true to exercise the "Publishing…" pill.
  finalizeOwned: false as boolean,
}));

// Async Server Component children can't be client-rendered by RTL — stub them.
vi.mock("@/components/admin/PerShowAlertSection", () => ({
  PerShowAlertSection: () => null,
}));
vi.mock("@/app/admin/show/[slug]/CurrentShareLinkPanel", async () => {
  const React = await import("react");
  return {
    // M12.5: Rotate/Reset are folded INTO this panel via the `actions` prop, so
    // the stub MUST render props.actions — otherwise the rotate/reset visibility
    // assertions below would stop exercising the real composition (adversarial R4).
    CurrentShareLinkPanel: (props: { actions?: React.ReactNode }) =>
      React.createElement(
        "div",
        { "data-testid": "admin-current-share-link-panel" },
        props.actions,
      ),
    resolveOrigin: () => "https://crew.example.com",
  };
});

// Phase 6 — the changes feed is the server-only (service-role) data layer; the
// page calls it after requireAdmin. Mock it so the per-show page render exercises
// the ChangesFeed mount (a thrown SyncInfraError degrades to a calm notice).
vi.mock("@/lib/sync/feed/readShowChangeFeed", async () => {
  // Import the REAL perFileProcessor through the normal module graph (it is not
  // mocked) so the thrown SyncInfraError is the SAME class the page's
  // `instanceof SyncInfraError` check uses — vi.importActual would yield a
  // distinct evaluation and the instanceof would miss.
  const { SyncInfraError } = await import("@/lib/sync/perFileProcessor");
  return {
    readShowChangeFeed: async () => {
      if (state.feedThrows) {
        throw new SyncInfraError("readShowChangeFeed.test", "thrown_error", null);
      }
      return state.feed;
    },
  };
});

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-03T12:00:00.000Z") }));
vi.mock("@/lib/data/loadShowShareToken", () => ({
  loadShowShareToken: async () => state.token,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/x",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = (cols?: string) => {
        if (typeof cols === "string") state.selectColsByTable[table] = cols;
        return builder;
      };
      builder.eq = pass;
      builder.is = pass;
      builder.order = pass;
      builder.returns = pass;
      builder.maybeSingle = async () => ({
        data: table === "shows" ? state.show : null,
        error: null,
      });
      (builder as { then: unknown }).then = (onf: (v: unknown) => unknown) => {
        const data =
          table === "crew_members" ? state.crew : table === "pending_syncs" ? state.pending : [];
        return onf({ data, error: null });
      };
      return builder;
    },
    rpc: async (fn: string) =>
      fn === "readfinalizeowned_b2"
        ? { data: state.finalizeOwned, error: null }
        : { data: null, error: null },
  }),
}));

const baseShow = {
  id: "s1",
  slug: "rpas",
  title: "RPAS Central",
  client_label: "Northwind Bank",
  dates: {
    travelIn: "2026-06-14",
    set: null,
    showDays: ["2026-06-14", "2026-06-15"],
    travelOut: "2026-06-15",
  },
  drive_file_id: "d1",
  published: true,
  archived: false,
  last_synced_at: "2026-06-03T10:00:00.000Z",
  last_sync_status: "ok",
};

const pendingRow = {
  staged_id: "stg-1",
  drive_file_id: "d1",
  source_kind: "manual",
  staged_modified_time: "2026-06-02T00:00:00.000Z",
  base_modified_time: null,
  warning_summary: "needs review",
  triggered_review_items: [],
  parse_result: { show: { title: "RPAS Central" } },
};

async function renderPage() {
  const mod = await import("@/app/admin/show/[slug]/page");
  const ui = await mod.default({
    params: Promise.resolve({ slug: "rpas" }),
    searchParams: Promise.resolve({}),
  });
  render(ui);
}

beforeEach(() => {
  state.show = { ...baseShow };
  state.crew = [{ id: "c1", name: "Alex Lee", role: "A1" }];
  state.pending = [];
  state.token = "tok-123";
  state.feed = { entries: [], truncated: false, totalShown: 0 };
  state.feedThrows = false;
  state.selectColsByTable = {};
  state.finalizeOwned = false;
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("per-show page (§6)", () => {
  it("select adds last_synced_at, last_sync_status, archived (V2) + client_label, dates (M12.3 #16 subtitle)", async () => {
    await renderPage();
    const cols = state.selectColsByTable.shows ?? "";
    expect(cols).toMatch(/archived/);
    expect(cols).toMatch(/last_synced_at/);
    expect(cols).toMatch(/last_sync_status/);
    expect(cols).toMatch(/client_label/);
    expect(cols).toMatch(/dates/);
  });

  // Task 4.3 (B1): the back affordance moved into AdminPageHeader. There is
  // exactly ONE back link (admin-page-header-back → "Back to dashboard") and NO
  // standalone in-body "← Admin home" link. Supersedes the Phase-A
  // "keeps ← Admin home" assertion (the in-body link was removed).
  it("renders AdminPageHeader back link, NOT a duplicate in-body '← Admin home'", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-page-header-back")).toBeInTheDocument();
    expect(screen.queryByText(/Admin home/)).toBeNull();
    // exactly one back affordance overall
    expect(screen.getAllByRole("link", { name: /Back to dashboard/ })).toHaveLength(1);
  });

  it("renders the AdminPageHeader breadcrumb 'Admin › Active shows'", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-page-header-crumb").textContent).toBe("Admin › Active shows");
  });

  it("title + pill + chip live in the AdminPageHeader (single source, rendered once)", async () => {
    await renderPage();
    // title is the header's title node
    expect(screen.getByTestId("admin-page-header-title").textContent).toBe("RPAS Central");
    // M12.9: the status pill is APPENDED inline after the title
    // (admin-page-header-title-append); the share chip is the right slot.
    const titleAppend = screen.getByTestId("admin-page-header-title-append");
    const right = screen.getByTestId("admin-page-header-right");
    const pill = screen.getByTestId("admin-show-status-pill");
    const chip = screen.getByTestId("admin-show-share-chip");
    expect(titleAppend).toContainElement(pill);
    expect(right).toContainElement(chip);
    // the pill is NOT in the right slot anymore (it moved next to the title)
    expect(right).not.toContainElement(pill);
    expect(screen.getAllByTestId("admin-show-status-pill")).toHaveLength(1);
    expect(screen.getAllByTestId("admin-show-share-chip")).toHaveLength(1);
  });

  it("status pill: published+!archived -> Published", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-show-status-pill").textContent).toMatch(/Published/);
  });

  it("status pill archived-first: archived+published drift -> Archived (not Published)", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    const pill = screen.getByTestId("admin-show-status-pill").textContent ?? "";
    expect(pill).toMatch(/Archived/);
    expect(pill).not.toMatch(/Published/);
  });

  // §3.2 precedence: finalize-owned !published → "Publishing…" (the warn pill).
  it("status pill: !published + finalize-owned -> Publishing…", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    state.finalizeOwned = true;
    await renderPage();
    expect(screen.getByTestId("admin-show-status-pill").textContent).toMatch(/Publishing/);
  });

  // §3.2 precedence: !published + NOT finalize-owned → "Held — not published"
  // (the neutral idle pill, distinct from the warn "Publishing…").
  it("status pill: !published + NOT finalize-owned -> Held — not published", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    state.finalizeOwned = false;
    await renderPage();
    const pill = screen.getByTestId("admin-show-status-pill").textContent ?? "";
    expect(pill).toMatch(/Held/);
    expect(pill).not.toMatch(/Publishing/);
  });

  it("crew-link surfaces present when published && !archived && token", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-show-share-chip")).toBeInTheDocument();
    expect(screen.getByTestId("admin-show-open-crew")).toBeInTheDocument();
    expect(screen.getByTestId("admin-current-share-link-panel")).toBeInTheDocument();
  });

  // M12.12 follow-up — the "Open crew page →" arrow is decorative; aria-hiding
  // it keeps it out of the accessible name. Failure mode caught: someone
  // inlines the arrow back into the accessible name.
  it("Open-crew-page accessible name drops the decorative → (aria-label), visible text keeps it", async () => {
    await renderPage();
    const link = screen.getByRole("link", { name: "Open crew page" });
    expect(link).toHaveAttribute("data-testid", "admin-show-open-crew");
    expect(link).toHaveAttribute("aria-label", "Open crew page");
    // Visible text run stays UNSPLIT — splitting it drops the inline-flex
    // inter-item space / shifts text-decoration paint (byte-level screenshot
    // drift).
    expect(link.textContent).toBe("Open crew page →");
    expect(link.firstElementChild).toBeNull();
  });

  it("crew-link surfaces hidden for archived show (incl archived+published drift)", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    expect(screen.queryByTestId("admin-show-share-chip")).toBeNull();
    expect(screen.queryByTestId("admin-show-open-crew")).toBeNull();
    expect(screen.getByTestId("admin-share-link-inactive")).toBeInTheDocument();
    // ineligible show → the inactive notice REPLACES CurrentShareLinkPanel
    expect(screen.queryByTestId("admin-current-share-link-panel")).toBeNull();
  });

  it("token-read failure on a PUBLISHED ACTIVE show: token surfaces hidden but Share panel recovers (NOT the unpublished/archived notice) — Codex R1", async () => {
    // A transient loadShowShareToken null/throw must NOT make a published+active
    // show read as unpublished/archived. The token-dependent chip/open-crew are
    // hidden (no real URL), but CurrentShareLinkPanel renders (its own
    // unavailable/recovery state), and the inactive notice is NOT shown.
    state.token = null;
    await renderPage();
    expect(screen.queryByTestId("admin-show-share-chip")).toBeNull();
    expect(screen.queryByTestId("admin-show-open-crew")).toBeNull();
    expect(screen.getByTestId("admin-current-share-link-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-share-link-inactive")).toBeNull();
    // rotate still rendered for the eligible show (its success URL must show)
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeInTheDocument();
  });

  it("preview-as links rendered only when published && !archived", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-show-preview-as-link-c1")).toBeInTheDocument();
  });

  it("preview-as links absent + unavailable notice for archived show", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    expect(screen.queryByTestId("admin-show-preview-as-link-c1")).toBeNull();
    expect(screen.getByTestId("admin-show-preview-as-unavailable")).toBeInTheDocument();
  });

  it("rotate + reset rendered only when published && !archived", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeInTheDocument();
    expect(screen.getByTestId("admin-reset-picker-epoch-button")).toBeInTheDocument();
  });

  it("rotate + reset hidden for a publishing (unpublished) show", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    await renderPage();
    expect(screen.queryByTestId("admin-rotate-share-token-button")).toBeNull();
    expect(screen.queryByTestId("admin-reset-picker-epoch-button")).toBeNull();
  });

  // Phase 6 — the legacy live whole-parse review mount (ParsePanel) is RETIRED on
  // the per-show page (§8 / resolution #21 cutover): no invariant stages a whole
  // parse anymore. The page mounts the ChangesFeed instead, and never the
  // staged-review apply/read-only affordances.
  it("does NOT mount the retired live whole-parse ParsePanel review (archived)", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    expect(screen.queryByTestId("staged-review-read-only")).toBeNull();
    expect(screen.queryByTestId("staged-review-apply")).toBeNull();
    expect(screen.queryByTestId("admin-show-parse-warnings-section")).toBeNull();
  });

  it("does NOT mount the retired live whole-parse ParsePanel review (non-archived)", async () => {
    await renderPage();
    expect(screen.queryByTestId("staged-review-apply")).toBeNull();
    expect(screen.queryByTestId("staged-review-read-only")).toBeNull();
    expect(screen.queryByTestId("admin-show-parse-warnings-section")).toBeNull();
  });

  it("mounts the changes feed (calm empty state when no changes)", async () => {
    await renderPage();
    expect(screen.getByTestId("change-feed-empty")).toBeInTheDocument();
  });

  it("renders the changes-feed entries when present", async () => {
    state.feed = {
      entries: [
        {
          id: "e1",
          occurredAt: "2026-06-03T09:00:00.000Z",
          status: "applied",
          action: "none",
          summary: "Section shrank",
          entityRef: null,
        },
      ],
      truncated: false,
      totalShown: 1,
    };
    await renderPage();
    expect(screen.getByTestId("change-feed-entry-e1")).toBeInTheDocument();
  });

  it("degrades to a calm notice when the feed read throws a SyncInfraError", async () => {
    state.feedThrows = true;
    await renderPage();
    expect(screen.getByTestId("change-feed-infra-error")).toBeInTheDocument();
    expect(screen.queryByTestId("change-feed-empty")).toBeNull();
  });

  it("sync footer shows 'Last synced {rel}' + StatusIndicator", async () => {
    await renderPage();
    const footer = screen.getByTestId("admin-show-sync-footer");
    expect(footer.textContent).toMatch(/Last synced/);
    expect(footer.querySelector("[data-testid^='status-dot-']")).not.toBeNull();
  });

  it("sync footer 'Not synced yet' when last_synced_at is null", async () => {
    state.show = { ...baseShow, last_synced_at: null, last_sync_status: null };
    await renderPage();
    expect(screen.getByTestId("admin-show-sync-footer").textContent).toMatch(/Not synced yet/);
  });

  // Codex impl-diff finding (M12.2-A close-out): a non-ok sync status with a
  // non-null last_synced_at must surface its TEXTUAL health label, not just a
  // color dot (the dot is aria-hidden — color-only would be an a11y/observability
  // regression and contradicts ShowsTable's SyncCell + syncStatus.ts intent).
  it.each([
    ["drive_error", /Couldn't reach Drive/],
    ["parse_error", /Couldn't read the sheet/],
    ["pending_review", /Changes to review/],
    ["pending", /Sync in progress/],
  ])("sync footer surfaces the textual label for non-ok status %s", async (status, labelRe) => {
    state.show = {
      ...baseShow,
      last_sync_status: status,
      last_synced_at: "2026-06-03T08:00:00.000Z",
    };
    await renderPage();
    const footer = screen.getByTestId("admin-show-sync-footer");
    // The descriptive health label appears (not color-only)…
    expect(footer.textContent).toMatch(labelRe);
    // …and the relative timestamp stays as secondary context.
    expect(footer.textContent).toMatch(/Last synced/);
  });

  // Codex impl-diff finding [high] (M12.2-A close-out): the per-show page is the
  // archived-safe READ-ONLY surface (ParsePanel readOnly, share/rotate/preview
  // gated on !archived), but the sync footer's Re-sync CTA mutates shows/
  // pending_syncs via /api/admin/sync — and the server's only gate is
  // finalize-ownership, NOT archived. So Re-sync must be suppressed for archived
  // shows (UI mitigation; the server-side archived guard is DEFERRED — DEF-3).
  it("archived show: Re-sync CTA suppressed + read-only note shown", async () => {
    state.show = { ...baseShow, archived: true, published: true };
    await renderPage();
    expect(screen.queryByTestId("admin-resync-button")).toBeNull();
    expect(screen.getByTestId("admin-show-resync-archived")).toBeInTheDocument();
  });

  it("non-archived show: Re-sync CTA present", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-resync-button")).toBeInTheDocument();
    expect(screen.queryByTestId("admin-show-resync-archived")).toBeNull();
  });

  // M12.12 matrix row 7 — failure mode caught: a footer redesign drops the
  // HoverHelp (or its learnMore deep link) → the matrix root testid or the
  // hidden help-link href vanishes; the drift surfaces at unit speed instead
  // of via the e2e affordance walker.
  it("sync footer help carries matrix root testid + sync-health deep link (row 7)", async () => {
    await renderPage();
    const footer = screen.getByTestId("admin-show-sync-footer");
    const root = within(footer).getByTestId("help-affordance--per-show-sync-footer--tooltip");
    expect(within(root).getByRole("link", { hidden: true })).toHaveAttribute(
      "href",
      "/help/admin/per-show-panel#sync-health",
    );
  });

  // M12.12 matrix row 9 — same drift class, Crew section header.
  it("Crew header help carries matrix root testid + preview-as-crew link (row 9)", async () => {
    await renderPage();
    const crewCol = screen.getByTestId("per-show-crew-col");
    const root = within(crewCol).getByTestId("help-affordance--per-show-crew--tooltip");
    expect(within(root).getByRole("link", { hidden: true })).toHaveAttribute(
      "href",
      "/help/admin/preview-as-crew",
    );
  });

  // M12.12 follow-up — per-row "Preview as" links render only when
  // published && !archived, so the Crew help body must not promise them
  // unconditionally. Failure modes caught: (a) the copy reverts to the
  // present-tense "Use a row's Preview as link" while an unpublished render
  // contains no such link; (b) the publish-gated phrasing drifts out.
  it("Crew help copy stays truthful for an unpublished show — publish-gated phrasing, no dangling promise", async () => {
    state.show = { ...baseShow, published: false, archived: false };
    await renderPage();
    const crewCol = screen.getByTestId("per-show-crew-col");
    // No per-row Preview as link in this state (live gate at page.tsx)…
    expect(within(crewCol).queryByTestId("admin-show-preview-as-link-c1")).toBeNull();
    // …so the help copy must scope the promise to the published state —
    // including published-then-archived (published stays true after archive;
    // the render gate is published && !archived).
    const body = within(crewCol).getByTestId("per-show-crew-help-body");
    expect(body.textContent).toMatch(/once the show is published \(and not archived\)/i);
    expect(body.textContent).not.toMatch(/use a row/i);
  });

  it("sync footer keeps plain 'Last synced {rel}' for ok status (no redundant label)", async () => {
    state.show = {
      ...baseShow,
      last_sync_status: "ok",
      last_synced_at: "2026-06-03T08:00:00.000Z",
    };
    await renderPage();
    const footer = screen.getByTestId("admin-show-sync-footer");
    expect(footer.textContent).toMatch(/Last synced/);
    expect(footer.textContent).not.toMatch(/Synced\b.*Last synced/); // no "Synced · Last synced" doubling
  });
});

describe("per-show header — M12.3 #16/#18/#15a", () => {
  // #18 — the standalone "Slug: <slug>" line is removed from the header chrome.
  it("does NOT render a 'Slug:' line in the header (#18)", async () => {
    await renderPage();
    expect(screen.queryByText(/Slug:/)).toBeNull();
    // and the slug value is not rendered as header chrome text
    expect(screen.queryByText("rpas")).toBeNull();
  });

  // #16 — subtitle = client · dates (Northwind Bank · <range>). Non-tautological:
  // assert the LITERAL calendar range from the fixture showDays
  // (["2026-06-14","2026-06-15"]), NOT a value re-derived from formatDateRange.
  // The buggy local-getter formatter rendered "6/13/26 → 6/14/26" in US zones
  // (M12.3 adversarial R3); the UTC-getter fix renders the true calendar dates.
  it("renders the client · dates subtitle with timezone-correct calendar dates (#16)", async () => {
    await renderPage();
    const sub = screen.getByTestId("admin-show-subtitle");
    expect(sub.textContent).toBe(`${baseShow.client_label} · 6/14/26 → 6/15/26`);
    expect(sub.textContent).toMatch(/·/);
    expect(sub.textContent).toMatch(/→/);
  });

  it("subtitle shows client alone when dates are absent (#16 guard)", async () => {
    state.show = { ...baseShow, dates: null };
    await renderPage();
    const sub = screen.getByTestId("admin-show-subtitle");
    expect(sub.textContent).toContain("Northwind Bank");
    expect(sub.textContent).not.toMatch(/→/);
  });

  it("no subtitle node when neither client nor dates present (#16 guard)", async () => {
    state.show = { ...baseShow, client_label: "", dates: null };
    await renderPage();
    expect(screen.queryByTestId("admin-show-subtitle")).toBeNull();
  });

  // #16 — compact crew chip: a short/host-stripped display + Copy, NOT the full
  // URL splayed inline. The full URL stays available via copy + title attr.
  it("crew chip is compact: short path + copy, NOT the full URL inline (#16)", async () => {
    await renderPage();
    const chip = screen.getByTestId("admin-show-share-chip");
    // copy affordance present (load-bearing — full URL goes to clipboard)
    expect(
      chip.querySelector("[data-testid='admin-current-share-link-copy-button']"),
    ).not.toBeNull();
    // the host-stripped compact path IS shown as the chip text…
    expect(chip.textContent).toMatch(/\/show\/rpas\/tok-123/);
    // …but the chip text is NOT the full absolute URL (no scheme://host inline)
    expect(chip.textContent).not.toMatch(/https?:\/\//);
    // the full URL is preserved verbatim in a title attribute (origin + path) for
    // hover/recovery — and it ends with the real crew path
    const title = chip.getAttribute("title") ?? "";
    expect(title).toMatch(/^https?:\/\//);
    expect(title).toMatch(/\/show\/rpas\/tok-123$/);
    // no <input> rendering the whole URL across the header
    expect(chip.querySelector("input")).toBeNull();
  });

  // Phase 6 — the legacy "Parse warnings" / live whole-parse review section is
  // retired (§8). The per-show page never renders it regardless of legacy
  // pending_syncs state; the changes feed is the replacement surface.
  it("never renders the retired Parse warnings section (#15a superseded by Phase 6)", async () => {
    state.pending = [pendingRow];
    await renderPage();
    expect(screen.queryByTestId("admin-show-parse-warnings-section")).toBeNull();
    expect(screen.queryByText(/Parse warnings/)).toBeNull();
  });
});
