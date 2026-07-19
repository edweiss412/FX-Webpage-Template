// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/overviewSection.test.tsx (consolidated-admin-show-page Task 11)
 *
 * The Overview rail section (spec §5.1 composition, §6 mode matrix). Overview is the
 * first rail section: it relocates the per-show alert detail, the share-&-access cluster,
 * the sheet/sync cluster (Re-sync + correction-loop callout + open-sheet link), and the
 * archive lifecycle control — INTACT (wrap, don't reimplement). The server-only pieces
 * (`PerShowAlertSection`, `CurrentShareLinkPanel`) arrive as pre-rendered ReactNode slots
 * because Overview renders inside the CLIENT `ShowReviewSurface`; the client controls
 * (`ReSyncButton`, `ArchiveShowButton`, `UnarchiveShowButton`, `CorrectionLoopCallout`)
 * are rendered directly with their server actions passed through as props.
 *
 * Failure modes caught (spec §6):
 *   - Archived show still exposing a mutating control (Re-sync / Archive / rotate) instead
 *     of the read-only Unarchive affordance — an archived show must be read-only.
 *   - Unpublished show not showing the inactive-share notice (a live-looking share panel on
 *     a paused link).
 *   - Overview dropping the correction-loop callout when there ARE actionable warnings.
 *   - Open-sheet link rendered with no href (a dead "Open sheet ↗").
 *
 * Anti-tautology: the inactive-notice wording is asserted INSIDE the notice's own testid
 * subtree (a sibling that also says "archived" cannot satisfy it); the Re-sync-inside-callout
 * assertion scopes `within` the callout so the archived-case standalone-absent check is
 * independent; every expected value derives from the props fixture.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import {
  OverviewSection,
  type OverviewSectionProps,
} from "@/components/admin/showpage/OverviewSection";

const routerRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh, push: vi.fn() }),
  usePathname: () => "/admin/show/east-coast-summit",
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(() => {
  cleanup();
  routerRefresh.mockClear();
});

const SHOW_ID = "22222222-2222-2222-2222-222222222222";
const SHEET_HREF = "https://docs.google.com/spreadsheets/d/DRIVE_PUB/edit";

function baseProps(overrides: Partial<OverviewSectionProps> = {}): OverviewSectionProps {
  return {
    showId: SHOW_ID,
    archived: false,
    published: true,
    finalizeOwned: false,
    openSheetHref: SHEET_HREF,
    hasActionableWarnings: false,
    archiveAction: vi.fn(async () => ({ ok: true }) as const),
    unarchiveAction: vi.fn(async () => {}),
    alertSlot: <div data-testid="mock-alert-slot">alert</div>,
    shareSlot: <div data-testid="mock-share-slot">share panel</div>,
    ...overrides,
  };
}

describe("OverviewSection", () => {
  it("renders the section wrapper with the #overview hash anchor", () => {
    const { container } = render(<OverviewSection {...baseProps()} />);
    const section = screen.getByTestId("overview-section");
    // Strip alert badge (StatusStrip) links to #overview — the anchor must exist here.
    expect(section.id).toBe("overview");
    expect(container.querySelector("#overview")).toBe(section);
  });

  // T-RESYNC-MOVED, Overview half (modal-header-reconciliation §4.3 / §6.7,
  // Task 7). The ratified amendment moves Re-sync to the control strip and
  // says "exactly one Re-sync" — duplicating it was explicitly REJECTED, so
  // the negative here is the half that catches a half-done move. The strip
  // half lives in statusStrip.test.tsx.
  it("T-RESYNC-MOVED: NO Re-sync button remains in Overview, in ANY of its modes", () => {
    for (const overrides of [
      {},
      { hasActionableWarnings: true },
      { published: false },
      { finalizeOwned: true },
      { archived: true },
    ] as Partial<OverviewSectionProps>[]) {
      cleanup();
      render(<OverviewSection {...baseProps(overrides)} />);
      expect(
        screen.queryByTestId("admin-resync-button"),
        `Re-sync must not render in Overview for ${JSON.stringify(overrides)}`,
      ).toBeNull();
    }
  });

  // T-RESYNC-GUIDANCE: the guidance copy is NOT the affordance. Deleting the
  // callout along with the button is the documented failure mode (§6.7) — its
  // `children` slot was already optional (CorrectionLoopCallout.tsx:43).
  it("T-RESYNC-GUIDANCE: the correction-loop callout still renders its copy, now with no child button", () => {
    render(<OverviewSection {...baseProps({ hasActionableWarnings: true })} />);
    const callout = screen.getByTestId("correction-loop-callout");
    expect(within(callout).getByText(/then re-sync/i)).toBeTruthy();
    expect(callout.querySelector("button")).toBeNull();
  });

  // §6.7 post-move shape: the third arm empties to `null`, but the
  // `overview-sheet-sync` WRAPPER stays — it still hosts the Open-sheet link,
  // so deleting it because its first child can now be null would silently drop
  // `openSheetHref`.
  it("the sheet/sync wrapper survives the move and still hosts the Open sheet link", () => {
    render(<OverviewSection {...baseProps({ hasActionableWarnings: false })} />);
    const wrapper = screen.getByTestId("overview-sheet-sync");
    expect(within(wrapper).getByTestId("overview-open-sheet")).toBeTruthy();
    // Non-archived + no warnings → the first arm is genuinely empty, not an
    // empty element standing in for the deleted button.
    expect(screen.queryByTestId("correction-loop-callout")).toBeNull();
    expect(screen.queryByTestId("admin-show-resync-archived")).toBeNull();
  });

  it("published + active: relocates alert, share panel, Archive, and open-sheet link", () => {
    render(<OverviewSection {...baseProps()} />);
    expect(screen.getByTestId("mock-alert-slot")).toBeTruthy();
    expect(screen.getByTestId("mock-share-slot")).toBeTruthy();
    expect(screen.getByTestId("archive-show-button")).toBeTruthy();
    const openSheet = screen.getByTestId("overview-open-sheet");
    expect(openSheet.getAttribute("href")).toBe(SHEET_HREF);
    // Standalone block affordance (own row in the sheet/sync cluster), NOT an inline-in-prose
    // link, so it is subject to the PRODUCT 44px tap-min floor for Doug-on-the-floor.
    expect(openSheet.className).toContain("min-h-tap-min");
    // Not archived, not unpublished → none of the read-only / paused states.
    expect(screen.queryByTestId("admin-share-link-inactive")).toBeNull();
    expect(screen.queryByTestId("admin-show-resync-archived")).toBeNull();
    expect(screen.queryByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeNull();
  });

  it("published + actionable warnings: the correction-loop callout renders as bare guidance", () => {
    render(<OverviewSection {...baseProps({ hasActionableWarnings: true })} />);
    expect(screen.getByTestId("correction-loop-callout")).toBeTruthy();
  });

  it("published + no warnings: no callout (and, post-move, no Re-sync either)", () => {
    render(<OverviewSection {...baseProps({ hasActionableWarnings: false })} />);
    expect(screen.queryByTestId("correction-loop-callout")).toBeNull();
  });

  it("archived: read-only — Unarchive shown; Archive / share panel hidden", () => {
    render(<OverviewSection {...baseProps({ archived: true, published: true })} />);
    expect(screen.getByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeTruthy();
    // Every mutating affordance is gone.
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
    expect(screen.queryByTestId("correction-loop-callout")).toBeNull();
    expect(screen.queryByTestId("mock-share-slot")).toBeNull();
    // The Re-sync-paused notice replaces the button.
    expect(screen.getByTestId("admin-show-resync-archived")).toBeTruthy();
    // Inactive-share notice says "archived" (scoped inside its own subtree — anti-tautology).
    const notice = screen.getByTestId("admin-share-link-inactive");
    expect(within(notice).getByText(/archived/i)).toBeTruthy();
  });

  it("unpublished (held): inactive-share notice says unpublished; Archive + Re-sync still available", () => {
    render(<OverviewSection {...baseProps({ archived: false, published: false })} />);
    const notice = screen.getByTestId("admin-share-link-inactive");
    expect(within(notice).getByText(/unpublished/i)).toBeTruthy();
    expect(screen.queryByTestId("mock-share-slot")).toBeNull();
    // Held is not archived → still archivable (Re-sync now lives in the strip).
    expect(screen.getByTestId("archive-show-button")).toBeTruthy();
    expect(screen.queryByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeNull();
    expect(screen.queryByTestId("admin-show-resync-archived")).toBeNull();
  });

  it("Publishing… (finalize-owned, !archived): Archive suppressed; Re-sync + share panel stay", () => {
    render(<OverviewSection {...baseProps({ finalizeOwned: true })} />);
    // Immutable window (spec §6): the Archive control is hidden — not merely disabled.
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
    // The row wrapper still renders (empty), and no Unarchive leaks in (show is not archived).
    expect(screen.getByTestId("overview-archive-row")).toBeTruthy();
    expect(screen.queryByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeNull();
    // Every other affordance is unaffected by the finalize window.
    expect(screen.getByTestId("mock-share-slot")).toBeTruthy();
  });

  it("finalize-owned is ignored once archived: Unarchive shown, Archive still absent", () => {
    render(
      <OverviewSection {...baseProps({ archived: true, published: false, finalizeOwned: true })} />,
    );
    expect(screen.getByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeTruthy();
    expect(screen.queryByTestId("archive-show-button")).toBeNull();
  });

  it("null open-sheet href: the open-sheet link is omitted (no dead link)", () => {
    render(<OverviewSection {...baseProps({ openSheetHref: null })} />);
    expect(screen.queryByTestId("overview-open-sheet")).toBeNull();
  });
});
