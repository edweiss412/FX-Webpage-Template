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
// Deterministic clock for the per-card relative timestamp (M12.4 item D3).
const NOW = new Date("2026-06-01T12:00:00.000Z");
const ONE_HR_AGO = new Date("2026-06-01T11:00:00.000Z").toISOString();

describe("NeedsAttentionInbox", () => {
  it("empty items -> 'Nothing waiting on you' empty state", () => {
    render(<NeedsAttentionInbox items={[]} totalCount={0} renderedCount={0} overflowCount={0} now={NOW} />);
    expect(screen.getByTestId("admin-needs-attention-empty").textContent ?? "").toMatch(
      /nothing waiting on you/i,
    );
  });

  it("renders a tone pill + action per item variant", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "pending_ingestion", key: "ingestion:i1", id: "i1", driveFileId: "d1", driveFileName: "Bad Sheet", copy: GENERIC, activityAt: ONE_HR_AGO },
      { variant: "first_seen", key: "sync:s1", stagedId: "s1", driveFileId: "d2", candidateTitle: "New Show", activityAt: ONE_HR_AGO },
      { variant: "existing_staged", key: "sync:s2", stagedId: "s2", driveFileId: "d3", slug: "known-show", title: "Known Show", activityAt: ONE_HR_AGO },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={3} renderedCount={3} overflowCount={0} now={NOW} />);
    // pending_ingestion → retry/discard action buttons (existing PendingPanel)
    expect(screen.getByTestId("admin-pending-retry-i1")).toBeInTheDocument();
    // first_seen → onboarding staged review link
    const fs = screen.getByTestId("needs-attention-link-first-seen-s1");
    expect(fs.getAttribute("href")).toBe("/admin/show/staged/s1");
    // existing_staged → per-show review link
    const es = screen.getByTestId("needs-attention-link-known-show");
    expect(es.getAttribute("href")).toBe("/admin/show/known-show");
  });

  // M12.12 follow-up + Codex R2 MEDIUM — the "Review →" / "Open show →"
  // arrows are decorative; aria-label carries the arrow-free accessible
  // name (text runs stay UNSPLIT — splitting them drops the inline-flex
  // inter-item space / shifts text-decoration paint, byte-level screenshot
  // drift). Names are ROW-SPECIFIC per WCAG 2.4.4 (a repeated list — incl.
  // the 100-item page — must not announce N identical "Review" links).
  // Codex R4: the UNIQUE discriminator (driveFileId / slug) is suffixed
  // unconditionally when a title is present — titles alone can collide.
  it("Review/Open-show accessible names are row-specific (aria-label), visible text keeps →", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "first_seen", key: "sync:s1", stagedId: "s1", driveFileId: "d2", candidateTitle: "New Show", activityAt: ONE_HR_AGO },
      { variant: "existing_staged", key: "sync:s2", stagedId: "s2", driveFileId: "d3", slug: "known-show", title: "Known Show", activityAt: ONE_HR_AGO },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={2} renderedCount={2} overflowCount={0} now={NOW} />);
    const review = screen.getByRole("link", { name: "Review New Show (d2)" });
    expect(review).toHaveAttribute("data-testid", "needs-attention-link-first-seen-s1");
    expect(review.textContent).toBe("Review →");
    expect(review.firstElementChild).toBeNull();
    const openShow = screen.getByRole("link", { name: "Open show Known Show (known-show)" });
    expect(openShow).toHaveAttribute("data-testid", "needs-attention-link-known-show");
    expect(openShow.textContent).toBe("Open show →");
    expect(openShow.firstElementChild).toBeNull();
  });

  // Codex R2 MEDIUM — two same-variant rows with different targets must get
  // DISTINCT accessible names (the whole point of row-specific labels), and
  // the title-less fallbacks (driveFileId / slug) must keep them distinct.
  it("two same-variant rows expose distinct accessible names (incl. null-title fallbacks)", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "first_seen", key: "sync:f1", stagedId: "f1", driveFileId: "drive-a", candidateTitle: "Alpha Gala", activityAt: ONE_HR_AGO },
      { variant: "first_seen", key: "sync:f2", stagedId: "f2", driveFileId: "drive-b", candidateTitle: null, activityAt: ONE_HR_AGO },
      { variant: "existing_staged", key: "sync:e1", stagedId: "e1", driveFileId: "d-e1", slug: "beta-show", title: "Beta Show", activityAt: ONE_HR_AGO },
      { variant: "existing_staged", key: "sync:e2", stagedId: "e2", driveFileId: "d-e2", slug: "gamma-show", title: null, activityAt: ONE_HR_AGO },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={4} renderedCount={4} overflowCount={0} now={NOW} />);
    expect(screen.getByRole("link", { name: "Review Alpha Gala (drive-a)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review drive-b" })).toBeInTheDocument(); // candidateTitle null → driveFileId alone
    expect(screen.getByRole("link", { name: "Open show Beta Show (beta-show)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open show gamma-show" })).toBeInTheDocument(); // title null → slug alone
    // No two links share an accessible name (the WCAG 2.4.4 failure mode).
    const names = screen.getAllByRole("link").map((l) => l.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
  });

  // Codex R4 MEDIUM — DUPLICATE titles are the residual collapse vector:
  // two first-seen sheets can parse the same title, and two staged shows
  // can share a title with different slugs. The unconditional unique-id
  // suffix keeps the names distinct.
  it("two same-TITLE rows still expose distinct accessible names (unconditional discriminator)", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "first_seen", key: "sync:f1", stagedId: "f1", driveFileId: "drive-a", candidateTitle: "Spring Gala", activityAt: ONE_HR_AGO },
      { variant: "first_seen", key: "sync:f2", stagedId: "f2", driveFileId: "drive-b", candidateTitle: "Spring Gala", activityAt: ONE_HR_AGO },
      { variant: "existing_staged", key: "sync:e1", stagedId: "e1", driveFileId: "d-e1", slug: "gala-2026-east", title: "Gala", activityAt: ONE_HR_AGO },
      { variant: "existing_staged", key: "sync:e2", stagedId: "e2", driveFileId: "d-e2", slug: "gala-2026-west", title: "Gala", activityAt: ONE_HR_AGO },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={4} renderedCount={4} overflowCount={0} now={NOW} />);
    expect(screen.getByRole("link", { name: "Review Spring Gala (drive-a)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review Spring Gala (drive-b)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open show Gala (gala-2026-east)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open show Gala (gala-2026-west)" })).toBeInTheDocument();
    const names = screen.getAllByRole("link").map((l) => l.getAttribute("aria-label"));
    expect(new Set(names).size).toBe(names.length);
  });

  // M12.4 item D3 — each card shows a relative activity timestamp top-right when
  // the item carries one; the bare "never" placeholder is never rendered for a
  // null activityAt (the <time> is omitted entirely). Failure mode this catches:
  // a missing/garbled timestamp, or "never" leaking onto timeless items.
  it("renders a relative timestamp from activityAt; omits it when null", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "existing_staged", key: "sync:withTime", stagedId: "s1", driveFileId: "d1", slug: "with-time", title: "With Time", activityAt: ONE_HR_AGO },
      { variant: "existing_staged", key: "sync:noTime", stagedId: "s2", driveFileId: "d2", slug: "no-time", title: "No Time", activityAt: null },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={2} renderedCount={2} overflowCount={0} now={NOW} />);
    const withTime = screen.getByTestId("needs-attention-time-sync:withTime");
    expect(withTime.textContent).toBe("1h ago");
    expect(withTime).toHaveAttribute("dateTime", ONE_HR_AGO);
    // The timeless card renders NO <time> element and never the "never" string.
    expect(screen.queryByTestId("needs-attention-time-sync:noTime")).toBeNull();
    const noTimeCard = screen.getByTestId("needs-attention-item-existing-s2");
    expect(noTimeCard.textContent ?? "").not.toMatch(/never/i);
  });

  it("existing_staged routes to /admin/show/{slug} (incl archived/unpublished existing shows)", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "existing_staged", key: "sync:s9", stagedId: "s9", driveFileId: "d9", slug: "archived-one", title: null, activityAt: ONE_HR_AGO },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={1} renderedCount={1} overflowCount={0} now={NOW} />);
    expect(screen.getByTestId("needs-attention-link-archived-one").getAttribute("href")).toBe(
      "/admin/show/archived-one",
    );
  });

  it("'+N more' affordance uses the REAL overflowCount, not items.length", () => {
    const items: NeedsAttentionItem[] = [
      { variant: "existing_staged", key: "sync:s1", stagedId: "s1", driveFileId: "d1", slug: "a", title: "A", activityAt: ONE_HR_AGO },
    ];
    render(<NeedsAttentionInbox items={items} totalCount={25} renderedCount={1} overflowCount={24} now={NOW} />);
    const more = screen.getByTestId("needs-attention-more");
    expect(more.textContent).toMatch(/24/);
  });

  it("no '+N more' when overflowCount=0", () => {
    render(<NeedsAttentionInbox items={[]} totalCount={0} renderedCount={0} overflowCount={0} now={NOW} />);
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
    const { container } = render(<NeedsAttentionInbox {...na} now={NOW} />);
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
    const { container } = render(<NeedsAttentionInbox {...na} now={NOW} />);
    expect(container.textContent).toContain(GENERIC);
    expect(container.textContent).not.toContain(raw);
  });
});
