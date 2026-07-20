// @vitest-environment jsdom
/**
 * tests/components/admin/showpage/overviewSection.test.tsx (consolidated-admin-show-page Task 11)
 *
 * The Overview rail section (spec §5.1 composition, §6 mode matrix). Overview is the
 * first rail section: it relocates the per-show alert detail, the share-&-access cluster,
 * the sheet/sync cluster (Re-sync + correction-loop callout + open-sheet link), and the
 * archive lifecycle control — INTACT (wrap, don't reimplement). The server-only pieces
 * (`PerShowAlertSection`) arrive as pre-rendered ReactNode slots (share-hub T4 retired the share slot)
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

function baseProps(overrides: Partial<OverviewSectionProps> = {}): OverviewSectionProps {
  return {
    archived: false,
    hasActionableWarnings: false,
    attentionSlot: <div data-testid="mock-attention-slot">alert</div>,
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

  it("published + active: relocates the alert slot; no lifecycle control of its own", () => {
    render(<OverviewSection {...baseProps()} />);
    expect(screen.getByTestId("mock-attention-slot")).toBeTruthy();
    expect(screen.queryByTestId("admin-show-resync-archived")).toBeNull();
  });

  it("published + actionable warnings: the correction-loop callout renders as bare guidance", () => {
    render(<OverviewSection {...baseProps({ hasActionableWarnings: true })} />);
    expect(screen.getByTestId("correction-loop-callout")).toBeTruthy();
  });

  it("published + no warnings: no callout (and, post-move, no Re-sync either)", () => {
    render(<OverviewSection {...baseProps({ hasActionableWarnings: false })} />);
    expect(screen.queryByTestId("correction-loop-callout")).toBeNull();
  });

  it("archived: the Re-sync-paused notice replaces the callout", () => {
    render(<OverviewSection {...baseProps({ archived: true })} />);
    expect(screen.getByTestId("admin-show-resync-archived")).toBeTruthy();
    expect(screen.queryByTestId("correction-loop-callout")).toBeNull();
  });

  // share-hub T4 moved the share cluster to the status band; this change moved
  // the OPEN-SHEET link and the ARCHIVE/UNARCHIVE lifecycle controls out too —
  // the link duplicated the header's sheet anchor
  // (PublishedReviewModal.tsx `*-sheetlink`), and the lifecycle controls now
  // live in the band's hub popover. Overview must not resurrect any of them: a
  // second copy is exactly the duplicate-control state each relocation removed.
  it("renders NO share, sheet-link or lifecycle control in ANY lifecycle", () => {
    for (const props of [
      { archived: false },
      { archived: false, hasActionableWarnings: true },
      { archived: true },
    ]) {
      const { unmount } = render(<OverviewSection {...baseProps(props)} />);
      expect(screen.queryByTestId("overview-open-sheet")).toBeNull();
      expect(screen.queryByTestId("overview-archive-row")).toBeNull();
      expect(screen.queryByTestId("archive-show-button")).toBeNull();
      expect(screen.queryByTestId(`unarchive-show-button-${SHOW_ID}`)).toBeNull();
      expect(screen.queryByTestId("admin-share-link-inactive")).toBeNull();
      expect(screen.queryByTestId("admin-current-share-link-url")).toBeNull();
      expect(screen.queryByTestId("admin-rotate-share-token-button")).toBeNull();
      expect(screen.queryByTestId("picker-reset-all-button")).toBeNull();
      expect(document.querySelector("#share-access")).toBeNull();
      unmount();
    }
  });
});
