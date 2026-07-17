// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3ReviewModalResolution.test.tsx
 * (Phase 2 — spec §4.4)
 *
 * Pins the folded re-apply resolution behavior in Step3ReviewModal: tiered body
 * (tier-3 radios force a choice; single-action items auto-bind), the corrupt
 * guard (Approve suppressed, Ignore kept), and the behavioral apply/ignore
 * payloads. These are the load-bearing resolution paths — render-only assertions
 * would pass a no-op impl, so we assert the exact ReviewerChoice[] the modal
 * hands its callbacks (item_id shape, rename_value), not just that a callback
 * fired.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TriggeredReviewItem } from "@/lib/parser/types";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import {
  Step3ReviewModal,
  type Step3ReviewResolution,
} from "@/components/admin/wizard/Step3ReviewModal";
import {
  buildStagedSectionData,
  type StagedSectionData,
} from "@/components/admin/review/sectionData";
import { buildParseResult, stagedRow } from "./_step3ReviewFixture";

const DFID = "drive-abc-123";
const WSID = "00000000-1111-4222-8333-444444444444";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function sectionData(): StagedSectionData {
  const pr = buildParseResult({});
  const row = stagedRow(pr);
  return buildStagedSectionData({
    pr,
    row,
    dfid: DFID,
    wizardSessionId: WSID,
    crewMembers: pr.crewMembers,
    rooms: pr.rooms,
    hotels: pr.hotelReservations,
    pullSheet: pr.pullSheet ?? [],
    archivedPullSheetTabs: pr.archivedPullSheetTabs ?? [],
    pullSheetOverride: null,
    ros: pr.runOfShow ?? {},
    warnings: pr.warnings,
    agendaBaseline: [],
    useRawDecisions: [],
  });
}

const mi13Item = {
  id: "mi13-1",
  invariant: "MI-13",
  removed_name: "Old Name",
  added_name: "New Name",
} as unknown as TriggeredReviewItem;
const mi6Item = {
  id: "mi6-1",
  invariant: "MI-6",
  section: "schedule",
} as unknown as TriggeredReviewItem;

function resWith(
  items: TriggeredReviewItem[],
  over: Partial<Step3ReviewResolution> = {},
): Step3ReviewResolution {
  return {
    triggeredReviewItems: items,
    reviewItemsCorrupt: false,
    stagedId: "st1",
    isPublishRunActive: false,
    onApplyResolve: vi.fn(async () => true),
    onRescan: vi.fn(),
    onIgnore: vi.fn(async () => true),
    ...over,
  };
}

function renderModal(resolution: Step3ReviewResolution, onClose = vi.fn()) {
  return render(
    <Step3ReviewModal
      data={sectionData()}
      checked={false}
      isDirtyRescan={false}
      onRequestSetChecked={vi.fn(async () => true)}
      onClose={onClose}
      resolution={resolution}
    />,
  );
}

describe("Step3ReviewModal resolution body (spec §4.4)", () => {
  test("tier-3 (MI-13) forces a choice before Approve enables", () => {
    renderModal(resWith([mi13Item]));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /rename to/i }));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeEnabled();
  });

  test("single-action item (MI-6) renders no radio", () => {
    renderModal(resWith([mi6Item]));
    expect(screen.queryByRole("radio")).toBeNull();
    // auto-bound → Approve immediately enabled
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeEnabled();
  });

  test("corrupt items suppress Approve, keep Ignore", () => {
    renderModal(resWith([], { reviewItemsCorrupt: true }));
    expect(screen.queryByRole("button", { name: /approve & apply/i })).toBeNull();
    expect(screen.getByRole("button", { name: /ignore this sheet/i })).toBeInTheDocument();
  });

  test("footer renders Approve & apply / Re-scan this sheet / Ignore this sheet", () => {
    renderModal(resWith([mi6Item]));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-scan this sheet/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ignore this sheet/i })).toBeInTheDocument();
  });

  test("resolution choices re-derive when items change on a still-open modal (Codex R5 MEDIUM)", () => {
    // In-modal Re-scan → router.refresh delivers NEW triggeredReviewItems while
    // the modal stays mounted. `useState(initialMemo)` ignores the memo after
    // first mount, so without a sync the choices go stale: a fresh single-action
    // item never auto-binds and Approve is stuck disabled until reopen.
    const { rerender } = renderModal(resWith([mi13Item])); // tier-3 → no auto-bind, Approve disabled
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeDisabled();
    rerender(
      <Step3ReviewModal
        data={sectionData()}
        checked={false}
        isDirtyRescan={false}
        onRequestSetChecked={vi.fn(async () => true)}
        onClose={vi.fn()}
        resolution={resWith([mi6Item])} // single-action → must auto-bind after the swap
      />,
    );
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeEnabled();
  });
});

describe("Step3ReviewModal resolution behavioral payloads (HIGH plan-R2/R3)", () => {
  test("Approve & apply sends ReviewerChoice[] with item_id + rename_value for the tier-3 choice", async () => {
    const onApplyResolve = vi.fn(async () => true);
    renderModal(resWith([mi13Item], { onApplyResolve }));
    fireEvent.click(screen.getByRole("radio", { name: /rename to/i }));
    fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
    await waitFor(() =>
      expect(onApplyResolve).toHaveBeenCalledWith([
        expect.objectContaining({
          item_id: mi13Item.id,
          action: "rename",
          rename_value: "New Name",
        }),
      ]),
    );
  });

  test("single-action item auto-bound into the Approve payload (no radio, still a choice)", async () => {
    const onApplyResolve = vi.fn(async () => true);
    renderModal(resWith([mi6Item], { onApplyResolve }));
    fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
    await waitFor(() =>
      expect(onApplyResolve).toHaveBeenCalledWith([
        expect.objectContaining({ item_id: mi6Item.id, action: "apply" }),
      ]),
    );
  });

  test("Ignore this sheet calls onIgnore once", async () => {
    const onIgnore = vi.fn(async () => true);
    renderModal(resWith([mi6Item], { onIgnore }));
    fireEvent.click(screen.getByRole("button", { name: /ignore this sheet/i }));
    await waitFor(() => expect(onIgnore).toHaveBeenCalledTimes(1));
  });

  test("Approve closes the modal on success", async () => {
    const onClose = vi.fn();
    renderModal(resWith([mi6Item], { onApplyResolve: vi.fn(async () => true) }), onClose);
    fireEvent.click(screen.getByRole("button", { name: /approve & apply/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  test("isPublishRunActive freezes Approve / Re-scan / Ignore", () => {
    renderModal(resWith([mi6Item], { isPublishRunActive: true }));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /re-scan this sheet/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /ignore this sheet/i })).toBeDisabled();
  });
});
