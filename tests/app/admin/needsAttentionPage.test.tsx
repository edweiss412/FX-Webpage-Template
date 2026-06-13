// @vitest-environment jsdom
// Mobile needs-attention Task 5 — /admin/needs-attention page (spec §4.3).
// Full async-page render with the loader mocked: success → header + #alerts +
// real NeedsAttentionInbox with the loader's data; loader infra_error →
// catalog-safe degraded copy (NO raw code text), alerts section STILL present;
// loader is called with { cap: PAGE_RENDER_CAP } and WITHOUT an injected
// `supabase` client (pins the no-injected-client rule, spec §4.3).
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
vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: async () => {},
  requireAdminIdentity: async () => ({ email: "doug@example.com" }),
}));
// AlertBanner is an async server component that self-fetches admin_alerts —
// stub it; the page contract under test is the `div#alerts` mount slot.
vi.mock("@/components/admin/AlertBanner", async () => {
  const React = await import("react");
  return {
    AlertBanner: () => React.createElement("div", { "data-testid": "alert-banner-stub" }),
  };
});
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
});
afterEach(() => {
  cleanup();
  vi.resetModules();
});

describe("/admin/needs-attention page (spec §4.3)", () => {
  it("success: wrapper + header + #alerts + the real inbox rendering the loader's data", async () => {
    const { container } = await renderPage();

    expect(screen.getByTestId("admin-needs-attention-page")).toBeInTheDocument();
    expect(screen.getByTestId("admin-page-header-title").textContent).toBe("Needs attention");
    expect(screen.getByText("Everything waiting on you, across all shows.")).toBeInTheDocument();

    // Banner mount slot (D-5 amendment): div#alerts wraps the AlertBanner.
    const alerts = container.querySelector("div#alerts");
    expect(alerts).not.toBeNull();
    expect(alerts!.querySelector("[data-testid=alert-banner-stub]")).not.toBeNull();

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

  it("loader infra_error: degraded copy block, NO raw code text, alerts section STILL present", async () => {
    state.result = { kind: "infra_error", message: RAW_INFRA_MESSAGE };
    const { container } = await renderPage();

    const degraded = screen.getByTestId("needs-attention-page-degraded");
    expect(degraded).toHaveTextContent(/We could not load this list right now/);

    // Invariant 5: no raw code / raw infra message anywhere in the DOM.
    const domText = container.textContent ?? "";
    expect(domText).not.toContain("XYZ_RAW_CODE_57");
    expect(domText).not.toContain("infra_error");
    expect(domText).not.toContain(RAW_INFRA_MESSAGE);

    // The alerts slot is independent of the loader result — still mounted.
    expect(container.querySelector("div#alerts")).not.toBeNull();
    // And the inbox is NOT rendered in the degraded state.
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
});
