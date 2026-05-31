// @vitest-environment jsdom
// M12.2 Phase A Task 6 — NeedsAttentionInbox (spec §5.3). Consumes the pre-built
// items + exact counts from buildNeedsAttention. Per-variant tone pill + action:
// pending_ingestion → retry/discard; first_seen → onboarding review link;
// existing_staged → /admin/show/{slug} (archived-safe). "+N more" from the REAL
// overflowCount, not items.length. Copy tests derive items from
// buildNeedsAttention (anti-tautology) so a broken resolver shows here.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NeedsAttentionInbox } from "@/components/admin/NeedsAttentionInbox";
import { buildNeedsAttention, type NeedsAttentionItem } from "@/lib/admin/needsAttention";
import { MESSAGE_CATALOG } from "@/lib/messages/catalog";

// PendingPanelRetryButton/DiscardButtons are client components using the
// router; mock next/navigation so they render in jsdom.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

afterEach(cleanup);

const GENERIC = MESSAGE_CATALOG.SHEET_PROCESS_FAILED.dougFacing!;

describe("NeedsAttentionInbox", () => {
  it("empty items -> 'Nothing waiting on you' empty state", () => {
    render(<NeedsAttentionInbox items={[]} totalCount={0} renderedCount={0} overflowCount={0} />);
    expect(screen.getByTestId("admin-needs-attention-empty").textContent ?? "").toMatch(
      /nothing waiting on you/i,
    );
  });

  it("renders a tone pill + action per item variant", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "pending_ingestion", key: "ingestion:i1", id: "i1", driveFileId: "d1", driveFileName: "Bad Sheet", copy: GENERIC },
      { variant: "first_seen", key: "sync:s1", stagedId: "s1", driveFileId: "d2", candidateTitle: "New Show" },
      { variant: "existing_staged", key: "sync:s2", stagedId: "s2", driveFileId: "d3", slug: "known-show", title: "Known Show" },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={3} renderedCount={3} overflowCount={0} />);
    // pending_ingestion → retry/discard action buttons (existing PendingPanel)
    expect(screen.getByTestId("admin-pending-retry-i1")).toBeInTheDocument();
    // first_seen → onboarding staged review link
    const fs = screen.getByTestId("needs-attention-link-first-seen-s1");
    expect(fs.getAttribute("href")).toBe("/admin/show/staged/s1");
    // existing_staged → per-show review link
    const es = screen.getByTestId("needs-attention-link-known-show");
    expect(es.getAttribute("href")).toBe("/admin/show/known-show");
  });

  it("existing_staged routes to /admin/show/{slug} (incl archived/unpublished existing shows)", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "existing_staged", key: "sync:s9", stagedId: "s9", driveFileId: "d9", slug: "archived-one", title: null },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={1} renderedCount={1} overflowCount={0} />);
    expect(screen.getByTestId("needs-attention-link-archived-one").getAttribute("href")).toBe(
      "/admin/show/archived-one",
    );
  });

  it("'+N more' affordance uses the REAL overflowCount, not items.length", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "existing_staged", key: "sync:s1", stagedId: "s1", driveFileId: "d1", slug: "a", title: "A" },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={25} renderedCount={1} overflowCount={24} />);
    const more = screen.getByTestId("needs-attention-more");
    expect(more.textContent).toMatch(/24/);
  });

  it("no '+N more' when overflowCount=0", () => {
    render(<NeedsAttentionInbox items={[]} totalCount={0} renderedCount={0} overflowCount={0} />);
    expect(screen.queryByTestId("needs-attention-more")).toBeNull();
  });

  it("pending-ingestion copy: unknown/non-catalog code -> generic copy, never raw code/message/<…>", () => {
    const na = buildNeedsAttention({
      ingestions: [
        { id: "i1", driveFileId: "d1", driveFileName: "Sheet A", lastErrorCode: "MI-2_EMPTY_TITLE", lastAttemptAt: "2026-06-01T00:00:00Z" },
      ],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 1, syncs: 0 },
    });
    const { container } = render(<NeedsAttentionInbox {...na} />);
    expect(container.textContent).toContain(GENERIC);
    expect(container.textContent).not.toMatch(/MI-2_EMPTY_TITLE/);
    expect(container.textContent).not.toMatch(/<[a-z-]+>/i);
  });

  it("pending-ingestion copy: code-as-message (raw garbage code) -> generic copy", () => {
    const raw = "TypeError: cannot read properties of undefined";
    const na = buildNeedsAttention({
      ingestions: [
        { id: "i2", driveFileId: "d2", driveFileName: "Sheet B", lastErrorCode: raw, lastAttemptAt: "2026-06-01T00:00:00Z" },
      ],
      syncs: [],
      existence: {},
      totalCounts: { ingestions: 1, syncs: 0 },
    });
    const { container } = render(<NeedsAttentionInbox {...na} />);
    expect(container.textContent).toContain(GENERIC);
    expect(container.textContent).not.toContain(raw);
  });
});
