// @vitest-environment jsdom
// Mobile needs-attention Task 5 — /admin/needs-attention page (spec §4.3).
// Full async-page render with the loader mocked: success → header + real
// NeedsAttentionInbox with the loader's data; loader infra_error → catalog-safe
// degraded copy (NO raw code text); loader is called with { cap: PAGE_RENDER_CAP }
// and WITHOUT an injected `supabase` client (pins the no-injected-client rule,
// spec §4.3). bell notification center §8: the AlertBanner + `div#alerts` slot
// are retired — alerts now surface in the nav <NotifBell> panel.
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PAGE_RENDER_CAP, type NeedsAttention } from "@/lib/admin/needsAttention";
import type { LoadNeedsAttentionResult } from "@/lib/admin/loadNeedsAttention";

const state = vi.hoisted(() => ({
  result: null as unknown,
  loadCalls: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/admin/loadNeedsAttention", () => ({
  loadNeedsAttention: async (opts: Record<string, unknown>) => {
    state.loadCalls.push(opts);
    return state.result;
  },
}));
// Mobile auto-applied parity (Task 2): the page now mounts RecentAutoAppliedStrip.
// Default result is an EMPTY-OK strip payload, NOT null — the page passes it
// straight to the strip (which reads data.kind), so pre-existing tests that set
// only state.result must still receive a valid RecentAutoApplied. Empty groups →
// the strip renders null (no visible change to those tests).
const EMPTY_OK_AUTOAPPLIED = {
  kind: "ok" as const,
  groups: [],
  renderedCount: 0,
  overflowCount: 0,
  rosterShiftByShow: {},
};
const raState = vi.hoisted(() => ({
  result: null as unknown,
  calls: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/admin/loadRecentAutoApplied", () => ({
  loadRecentAutoApplied: async (deps: Record<string, unknown>) => {
    raState.calls.push(deps);
    return raState.result;
  },
}));
vi.mock("@/app/admin/_actions/autoApplied", () => ({
  acceptChangeAction: vi.fn(),
  acceptAllAction: vi.fn(),
  undoFromDashboardAction: vi.fn(),
}));
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {},
  requireAdminIdentity: async () => ({ email: "doug@example.com" }),
}));
// Same clock-helper path Dashboard.tsx uses (components/admin/Dashboard.tsx:20).
vi.mock("@/lib/time/now", () => ({
  nowDate: async () => new Date("2026-06-10T12:00:00.000Z"),
}));
// The REAL NeedsAttentionInbox renders PendingPanelRetryButton (useRouter) —
// jsdom has no app router mounted, so stub navigation (perShowPage convention).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin/needs-attention",
}));

const successResult: NeedsAttention = {
  items: [
    {
      variant: "pending_ingestion",
      key: "pi:p1",
      id: "p1",
      driveFileId: "d1",
      driveFileName: "Spring Gala.xlsx",
      copy: "Couldn't read this sheet. Check the layout and try again.",
      activityAt: "2026-06-09T18:00:00.000Z",
    },
    {
      variant: "existing_staged",
      key: "es:stg-1",
      stagedId: "stg-1",
      driveFileId: "d2",
      slug: "spring-gala",
      title: "Spring Gala",
      activityAt: "2026-06-09T19:00:00.000Z",
    },
  ],
  renderedCount: 2,
  totalCount: 2,
  overflowCount: 0,
  ingestionTotal: 1,
  syncTotal: 1,
  syncProblemTotal: 0,
};

// A raw infra message that must NEVER surface in the DOM (invariant 5 — the
// degraded block renders fixed catalog-safe copy, not the typed message).
const RAW_INFRA_MESSAGE = "pending_ingestions query failed: XYZ_RAW_CODE_57 boom";

async function renderPage() {
  const mod = await import("@/app/admin/needs-attention/page");
  const ui = await mod.default();
  return render(ui);
}

beforeEach(() => {
  state.result = successResult satisfies LoadNeedsAttentionResult;
  state.loadCalls = [];
  raState.result = EMPTY_OK_AUTOAPPLIED;
  raState.calls = [];
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("/admin/needs-attention page (spec §4.3)", () => {
  it("success: wrapper + header + the real inbox rendering the loader's data", async () => {
    await renderPage();

    expect(screen.getByTestId("admin-needs-attention-page")).toBeInTheDocument();
    expect(screen.getByTestId("admin-page-header-title").textContent).toBe("Needs attention");
    expect(screen.getByText("Everything waiting on you, across all shows.")).toBeInTheDocument();

    // The REAL NeedsAttentionInbox renders the loader items (not a stub) —
    // assert against the loader data source, not hardcoded duplicates.
    expect(screen.getByTestId("needs-attention-inbox")).toBeInTheDocument();
    expect(screen.getByTestId("needs-attention-item-pending-p1")).toHaveTextContent(
      "Couldn't read this sheet. Check the layout and try again.",
    );
    expect(screen.getByTestId("needs-attention-item-existing-stg-1")).toHaveTextContent(
      "Spring Gala",
    );
    // No degraded block in the success state.
    expect(screen.queryByTestId("needs-attention-page-degraded")).toBeNull();
  });

  it("loader infra_error: degraded copy block, NO raw code text", async () => {
    state.result = { kind: "infra_error", message: RAW_INFRA_MESSAGE };
    const { container } = await renderPage();

    const degraded = screen.getByTestId("needs-attention-page-degraded");
    expect(degraded).toHaveTextContent(/We could not load this list right now/);

    // Invariant 5: no raw code / raw infra message anywhere in the DOM.
    const domText = container.textContent ?? "";
    expect(domText).not.toContain("XYZ_RAW_CODE_57");
    expect(domText).not.toContain("infra_error");
    expect(domText).not.toContain(RAW_INFRA_MESSAGE);

    // The inbox is NOT rendered in the degraded state.
    expect(screen.queryByTestId("needs-attention-inbox")).toBeNull();
  });

  // M12.12 matrix row 3 — failure mode caught: a header redesign drops the
  // HoverHelp from titleAppendSlot → the matrix root testid vanishes (the
  // M12.x drift class, caught at unit speed).
  it("page header help carries matrix root testid + first-seen link", async () => {
    await renderPage();

    const root = screen.getByTestId("help-affordance--needs-attention-page--tooltip");
    expect(within(root).getByRole("link", { hidden: true })).toHaveAttribute(
      "href",
      "/help/admin/review-queues#first-seen",
    );
  });

  it("calls loadNeedsAttention with { cap: PAGE_RENDER_CAP } and WITHOUT an own `supabase` property", async () => {
    await renderPage();

    expect(state.loadCalls).toHaveLength(1);
    const arg = state.loadCalls[0]!;
    expect(arg.cap).toBe(PAGE_RENDER_CAP);
    // No injected client (spec §4.3): the page must let the loader construct
    // its own server client. Assert the property is absent OUTRIGHT, not just
    // undefined — `{ supabase: undefined }` would still pin the wrong shape.
    expect(Object.prototype.hasOwnProperty.call(arg, "supabase")).toBe(false);
  });

  // ── Mobile auto-applied parity (Task 2): the strip on the page ──────────────

  const okAutoApplied = {
    kind: "ok" as const,
    renderedCount: 1,
    overflowCount: 0,
    rosterShiftByShow: {},
    groups: [
      {
        showId: "s1",
        slug: "spring-gala",
        showName: "Spring Gala",
        rows: [
          {
            id: "r1",
            changeKind: "crew_added",
            summary: "Added",
            occurredAt: "2026-06-09T18:00:00.000Z",
            undoable: true,
            diff: { kind: "none" as const },
          },
        ],
        acceptableIds: ["r1"],
        undoableIds: ["r1"],
      },
    ],
  };

  it("renders the auto-applied strip below the inbox with an h2 heading", async () => {
    raState.result = okAutoApplied;
    await renderPage();
    expect(
      screen.getByRole("heading", { level: 2, name: "Recently auto-applied" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("recent-auto-applied-strip")).toBeInTheDocument();
  });

  it("passes publishedShowIds:[] to loadRecentAutoApplied", async () => {
    raState.result = okAutoApplied;
    await renderPage();
    expect(raState.calls[0]).toEqual({ publishedShowIds: [] });
  });

  it("strip is a SIBLING AFTER the needs-attention section (DOM order, not nested)", async () => {
    raState.result = okAutoApplied;
    await renderPage();
    // The inbox <section aria-label="Needs attention"> has implicit role=region.
    const inbox = screen.getByRole("region", { name: "Needs attention" });
    const strip = screen.getByTestId("recent-auto-applied-strip");
    // Strip is NOT nested inside the inbox section (it sits in its own max-w-3xl
    // wrapper, a sibling of the inbox — separate concept).
    expect(inbox.contains(strip)).toBe(false);
    // strip follows the inbox in document order (below, not above). Bare `Node` is
    // the established repo convention (tests/components/admin/ShowsTable.test.tsx:288).
    expect(inbox.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("strip infra_error renders degraded copy while the inbox is healthy", async () => {
    raState.result = { kind: "infra_error", message: "boom" };
    await renderPage();
    expect(screen.getByTestId("auto-applied-error")).toBeInTheDocument();
    // Inbox still rendered (independent branches).
    expect(screen.getByTestId("needs-attention-inbox")).toBeInTheDocument();
  });

  it("inbox degraded + strip populated: both render independently", async () => {
    state.result = { kind: "infra_error", message: "boom" };
    raState.result = okAutoApplied;
    await renderPage();
    expect(screen.getByTestId("needs-attention-page-degraded")).toBeInTheDocument();
    expect(screen.getByTestId("recent-auto-applied-strip")).toBeInTheDocument();
  });

  it("empty groups: no strip section (inbox only)", async () => {
    raState.result = EMPTY_OK_AUTOAPPLIED;
    await renderPage();
    expect(screen.queryByTestId("recent-auto-applied-strip")).toBeNull();
  });
});
