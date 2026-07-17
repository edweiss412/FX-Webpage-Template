// @vitest-environment jsdom
/**
 * tests/app/admin/perShowPage.test.tsx
 * (consolidated-admin-show-page spec §4–§6, §10–§11 — Task 13 page rebuild)
 *
 * The consolidated per-show admin page: the snapshot-RPC read path
 * (`readShowReviewSnapshot`) feeds the mode-agnostic PublishedSectionData; the
 * page renders the pinned StatusStrip over the shared ShowReviewSurface with
 * Overview first / Changes last. This replaces the pre-consolidation page tests
 * (AdminPageHeader + per-show-crew-col + flat data-quality panel), preserving the
 * load-bearing behaviors the old suite pinned:
 *   - auth/lookup gates: missing show → notFound; snapshot not_admin_or_missing →
 *     notFound; snapshot infra_error → throw (error boundary, no raw code in UI).
 *   - archived read-only posture (strip archived badge, no toggle, Overview
 *     Unarchive + inactive share notice).
 *   - share-panel gating on published && !archived (shareSlot vs inactive notice).
 *   - Preview-As gating on published && !archived.
 *   - the ADMIN_SHOW_* slug-correlation structural guard.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CREW_ROSTER_READ_CAP } from "@/app/admin/show/[slug]/crewLinkMailto";
import type { ShowReviewSnapshot } from "@/lib/admin/readShowReviewSnapshot";

const state = vi.hoisted(() => ({
  // slug→id lookup on shows.
  showIdRow: { id: "s1" } as { id: string } | null,
  showIdError: null as { message: string } | null,
  // snapshot RPC result.
  snapshotKind: "ok" as "ok" | "not_admin_or_missing" | "infra_error",
  snapshot: null as ShowReviewSnapshot | null,
  finalizeOwned: false as boolean,
  token: "tok-123" as string | null,
  tokenThrows: false as boolean,
  feed: { entries: [], truncated: false, totalShown: 0 } as {
    entries: Array<Record<string, unknown>>;
    truncated: boolean;
    totalShown: number;
  },
  feedThrows: false as boolean,
  ignoredFingerprints: [] as string[],
  ignoredInfraError: false as boolean,
  alerts: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth/requireAdmin", () => ({ requireAdmin: async () => {} }));
vi.mock("@/lib/time/now", () => ({ nowDate: async () => new Date("2026-06-14T18:00:00.000Z") }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/show/rpas",
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from(_table: string) {
      const builder: Record<string, unknown> = {};
      const pass = () => builder;
      builder.select = pass;
      builder.eq = pass;
      builder.limit = pass;
      builder.maybeSingle = async () => ({ data: state.showIdRow, error: state.showIdError });
      return builder;
    },
    rpc: async (fn: string) => {
      if (fn === "readfinalizeowned_b2") return { data: state.finalizeOwned, error: null };
      return { data: null, error: null };
    },
  }),
}));

vi.mock("@/lib/admin/readShowReviewSnapshot", () => ({
  readShowReviewSnapshot: async () => {
    if (state.snapshotKind === "not_admin_or_missing") return { kind: "not_admin_or_missing" };
    if (state.snapshotKind === "infra_error") return { kind: "infra_error", message: "boom" };
    return { kind: "ok", snapshot: state.snapshot };
  },
}));

vi.mock("@/lib/data/loadShowShareToken", () => ({
  loadShowShareToken: async () => {
    if (state.tokenThrows) throw new Error("META: token read fault");
    return { token: state.token, epoch: 7 };
  },
}));

vi.mock("@/lib/sync/feed/readShowChangeFeed", async () => {
  const { SyncInfraError } = await import("@/lib/sync/perFileProcessor");
  return {
    readShowChangeFeed: async () => {
      if (state.feedThrows)
        throw new SyncInfraError("readShowChangeFeed.test", "thrown_error", null);
      return state.feed;
    },
  };
});

vi.mock("@/lib/admin/loadIgnoredWarnings", () => ({
  loadIgnoredWarnings: async () =>
    state.ignoredInfraError
      ? { kind: "infra_error", message: "boom" }
      : { kind: "ok", fingerprints: new Set(state.ignoredFingerprints) },
}));

// Server child components: PerShowAlertSection is an async Server Component (stub
// to null); fetchPerShowAlerts is the count source (returns the seeded rows).
vi.mock("@/components/admin/PerShowAlertSection", () => ({
  PerShowAlertSection: () => null,
  fetchPerShowAlerts: async () => state.alerts,
}));

// CurrentShareLinkPanel is an async Server shell — stub it, exposing the wired
// props so the page's threading (crewEmails/showTitle/isCrewLinkActive) is
// assertable and the resetSlot passthrough is observable.
vi.mock("@/app/admin/show/[slug]/CurrentShareLinkPanel", async () => {
  const React = await import("react");
  return {
    CurrentShareLinkPanel: (props: {
      resetSlot?: React.ReactNode;
      isCrewLinkActive?: boolean;
      crewEmails?: readonly string[];
      showTitle?: string;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "admin-current-share-link-panel",
          "data-crew-emails": JSON.stringify(props.crewEmails ?? null),
          "data-show-title": props.showTitle ?? "",
          "data-is-crew-link-active": String(props.isCrewLinkActive ?? ""),
        },
        props.resetSlot,
      ),
  };
});

function baseSnapshot(overrides: Partial<Record<string, unknown>> = {}): ShowReviewSnapshot {
  return {
    show: {
      id: "s1",
      slug: "rpas",
      title: "RPAS Central",
      client_label: "Northwind Bank",
      client_contact: null,
      dates: {
        travelIn: "2026-06-14",
        set: null,
        showDays: ["2026-06-14", "2026-06-15"],
        travelOut: "2026-06-15",
      },
      venue: { name: "Hall A", address: "1 Main St" },
      event_details: null,
      agenda_links: [],
      coi_status: "received",
      diagrams: null,
      pull_sheet: [],
      source_anchors: {},
      drive_file_id: "d1",
      published: true,
      archived: false,
      picker_epoch: 7,
      last_synced_at: "2026-06-14T10:00:00.000Z",
      last_sync_status: "ok",
      ...overrides,
    },
    internal: {
      financials: null,
      parse_warnings: [],
      raw_unrecognized: null,
      run_of_show: {},
      use_raw_decisions: [],
      show_id: "s1",
    },
    crew_members: [{ id: "c1", name: "Alex Lee", role: "A1", email: "alex@example.com" }],
    rooms: [],
    hotel_reservations: [],
    transportation: [],
    contacts: [],
  };
}

async function renderPage() {
  const mod = await import("@/app/admin/show/[slug]/page");
  const ui = await mod.default({
    params: Promise.resolve({ slug: "rpas" }),
    searchParams: Promise.resolve({}),
  });
  render(ui);
}

beforeEach(() => {
  state.showIdRow = { id: "s1" };
  state.showIdError = null;
  state.snapshotKind = "ok";
  state.snapshot = baseSnapshot();
  state.finalizeOwned = false;
  state.token = "tok-123";
  state.tokenThrows = false;
  state.feed = { entries: [], truncated: false, totalShown: 0 };
  state.feedThrows = false;
  state.ignoredFingerprints = [];
  state.ignoredInfraError = false;
  state.alerts = [];
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("consolidated per-show page — lookup + snapshot gates (§6/§11)", () => {
  it("missing show (slug lookup returns no row) → notFound()", async () => {
    state.showIdRow = null;
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("slug lookup returned error → throws (error boundary), not a silent render", async () => {
    state.showIdError = { message: "db down" };
    await expect(renderPage()).rejects.toThrow("show_lookup_failed");
  });

  it("snapshot not_admin_or_missing → notFound()", async () => {
    state.snapshotKind = "not_admin_or_missing";
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("snapshot infra_error → throws to the error boundary (no raw code rendered)", async () => {
    state.snapshotKind = "infra_error";
    await expect(renderPage()).rejects.toThrow("show_review_snapshot_failed");
  });
});

describe("consolidated per-show page — shell + rail sections (§4/§5)", () => {
  it("renders the status strip with the show title and the page container", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-show-page")).toBeTruthy();
    expect(screen.getByTestId("strip-title").textContent).toBe("RPAS Central");
  });

  it("mounts Overview first and Changes last as rail sections", async () => {
    await renderPage();
    const overview = screen.getByTestId("overview-section");
    const changes = screen.getByTestId("changes-section");
    expect(overview).toBeTruthy();
    expect(changes).toBeTruthy();
    // Every registry section sits between Overview and Changes.
    const registry = Array.from(
      document.querySelectorAll<HTMLElement>('[data-testid*="review-section-"]'),
    );
    expect(registry.length).toBeGreaterThan(0);
    const after = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    for (const s of registry) {
      expect(after(overview, s)).toBe(true);
      expect(after(s, changes)).toBe(true);
    }
  });

  it("published+active: strip publish toggle present, no archived badge", async () => {
    await renderPage();
    expect(screen.getByTestId("strip-publish-toggle")).toBeTruthy();
    expect(screen.queryByTestId("strip-archived-badge")).toBeNull();
  });
});

describe("consolidated per-show page — share panel gating (§5.1/§6)", () => {
  it("published+active: Overview shows the share panel, NOT the inactive notice", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-current-share-link-panel")).toBeTruthy();
    expect(screen.queryByTestId("admin-share-link-inactive")).toBeNull();
  });

  it("unpublished (held): Overview shows the inactive notice, no share panel", async () => {
    state.snapshot = baseSnapshot({ published: false, archived: false });
    await renderPage();
    expect(screen.queryByTestId("admin-current-share-link-panel")).toBeNull();
    expect(screen.getByTestId("admin-share-link-inactive")).toBeTruthy();
  });

  it("threads fixture-derived non-null emails + title into the share panel", async () => {
    state.snapshot = baseSnapshot();
    state.snapshot.crew_members = [
      { id: "c1", name: "Ann", role: "A1", email: "ann@example.com" },
      { id: "c2", name: "Bob", role: "A2", email: null },
      { id: "c3", name: "Cal", role: "V1", email: "cal@example.com" },
    ];
    await renderPage();
    const panel = screen.getByTestId("admin-current-share-link-panel");
    expect(JSON.parse(panel.getAttribute("data-crew-emails")!)).toEqual([
      "ann@example.com",
      "cal@example.com",
    ]);
    expect(panel.getAttribute("data-show-title")).toBe("RPAS Central");
  });

  it("ineligible (unpublished) show never serializes the real token to the client", async () => {
    state.snapshot = baseSnapshot({ published: false, archived: false });
    state.token = "s3cr3ttokenvalue9f8e7d6c5b4a";
    await renderPage();
    expect(document.body.innerHTML).not.toContain(state.token);
  });
});

describe("consolidated per-show page — archived read-only posture (§6)", () => {
  it("archived: strip archived badge, no publish toggle, Overview Unarchive + inactive notice", async () => {
    state.snapshot = baseSnapshot({ archived: true, published: true });
    await renderPage();
    expect(screen.getByTestId("strip-archived-badge")).toBeTruthy();
    expect(screen.queryByTestId("strip-publish-toggle")).toBeNull();
    expect(screen.getByTestId("admin-share-link-inactive")).toBeTruthy();
    // Re-sync paused on the read-only surface (no re-sync button in Overview).
    expect(screen.getByTestId("admin-show-resync-archived")).toBeTruthy();
  });

  it("archived: no Preview-As links (gate published && !archived)", async () => {
    state.snapshot = baseSnapshot({ archived: true, published: true });
    await renderPage();
    expect(screen.queryByTestId("admin-show-preview-as-link-c1")).toBeNull();
  });
});

describe("consolidated per-show page — Preview-As gating (§5.5)", () => {
  it("published+!archived: crew row shows a Preview-As link", async () => {
    await renderPage();
    expect(screen.getByTestId("admin-show-preview-as-link-c1")).toBeTruthy();
  });

  it("roster over CREW_ROSTER_READ_CAP → Preview-As links blanked + empty crewEmails", async () => {
    state.snapshot = baseSnapshot();
    state.snapshot.crew_members = Array.from({ length: CREW_ROSTER_READ_CAP + 5 }, (_, i) => ({
      id: `c${i}`,
      name: `Crew ${i}`,
      role: "A1",
      email: `crew${i}@example.com`,
    }));
    await renderPage();
    expect(screen.queryByTestId("admin-show-preview-as-link-c0")).toBeNull();
    const panel = screen.getByTestId("admin-current-share-link-panel");
    expect(JSON.parse(panel.getAttribute("data-crew-emails")!)).toEqual([]);
  });
});

describe("consolidated per-show page — Changes + alerts (§5.4/§5.1)", () => {
  it("Changes section renders the calm empty state when there are no changes", async () => {
    await renderPage();
    expect(screen.getByTestId("changes-section")).toBeTruthy();
    expect(screen.getByTestId("change-feed-empty")).toBeTruthy();
  });

  it("feed SyncInfraError degrades to a calm notice inside Changes", async () => {
    state.feedThrows = true;
    await renderPage();
    expect(screen.getByTestId("change-feed-infra-error")).toBeTruthy();
    expect(screen.queryByTestId("change-feed-empty")).toBeNull();
  });

  it("open alerts → strip alert badge shows the count; zero → no badge", async () => {
    state.alerts = [{ id: "a1" }, { id: "a2" }];
    await renderPage();
    const badge = screen.getByTestId("strip-alert-badge");
    expect(badge.textContent).toMatch(/2/);
  });

  it("no open alerts → no strip alert badge", async () => {
    state.alerts = [];
    await renderPage();
    expect(screen.queryByTestId("strip-alert-badge")).toBeNull();
  });
});

// Structural guard (carried over): every ADMIN_SHOW_* read-fault emit carries a
// top-level slug correlator, so a future edit that drops it fails here.
describe("consolidated per-show page — ADMIN_SHOW_* emits all carry slug (structural)", () => {
  it("every ADMIN_SHOW_* read-fault log call has a top-level slug field", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const ts = (await import("typescript")).default;
    const file = join(process.cwd(), "app/admin/show/[slug]/page.tsx");
    const src = readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    const offenders: string[] = [];
    const allCodes: string[] = [];
    const visit = (node: import("typescript").Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "log" &&
        (node.expression.name.text === "error" || node.expression.name.text === "warn")
      ) {
        const arg2 = node.arguments[1];
        if (arg2 && ts.isObjectLiteralExpression(arg2)) {
          let code: string | null = null;
          let hasSlug = false;
          for (const p of arg2.properties) {
            if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) {
              if (p.name.text === "code" && ts.isStringLiteralLike(p.initializer))
                code = p.initializer.text;
              if (p.name.text === "slug") hasSlug = true;
            } else if (ts.isShorthandPropertyAssignment(p) && p.name.text === "slug") {
              hasSlug = true;
            }
          }
          if (code && code.startsWith("ADMIN_SHOW_")) {
            allCodes.push(code);
            if (!hasSlug) offenders.push(code);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);

    expect(allCodes.length).toBeGreaterThanOrEqual(5);
    expect(
      offenders,
      `these ADMIN_SHOW_* emits are missing a slug field: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
