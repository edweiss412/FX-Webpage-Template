// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3TransitionAudit.test.tsx (Phase 6 Task 6.2 — spec §7)
 *
 * Transition inventory for the Step-3 CONSOLIDATION surfaces (checkpoint footer +
 * badge-only rows + folded resolution modal). Every state pair below is a
 * server-truth mount/unmount — DELIBERATELY INSTANT (no framer-motion; the page
 * re-renders at each finalize checkpoint, so there is no in-place animation to
 * orchestrate). This suite pins each pair behaviorally + the compound case.
 *
 *   Transition inventory (spec §7):
 *   ┌───────────────────────────────────┬──────────────────────────┐
 *   │ pair                              │ treatment                │
 *   ├───────────────────────────────────┼──────────────────────────┤
 *   │ footer Publish → Resume           │ instant (checkpoint swap) │
 *   │ footer Resume → Finish            │ instant (checkpoint swap) │
 *   │ footer Finish → Finish+stale note │ instant (isStale swap)    │
 *   │ row checkbox → badge (pre→post)   │ instant (checkpoint swap) │
 *   │ needs-review → resolution modal   │ instant dialog mount      │
 *   │ COMPOUND: modal mutators during   │ all disabled (Task 2.4    │
 *   │   an active publish run           │   freeze, re-asserted)    │
 *   └───────────────────────────────────┴──────────────────────────┘
 *
 * The source-level "no animation library" guard for these shell files lives in
 * step3Page.transitions.test.tsx; this suite is the BEHAVIORAL half.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ParseResult, TriggeredReviewItem } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";

const WSID = "11111111-1111-1111-1111-111111111111";
const PARSE = { show: { title: "A Show" }, warnings: [] } as unknown as ParseResult;
const mi6 = {
  id: "mi6-1",
  invariant: "MI-6",
  section: "schedule",
} as unknown as TriggeredReviewItem;

function heldRow(dfid = "d-held"): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "applied",
    parseResult: PARSE,
    displayState: "held",
  };
}
function reapplyRow(dfid = "d-reapply"): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult: PARSE,
    lastFinalizeFailureCode: "RESCAN_REVIEW_REQUIRED",
    displayState: "needs_review_reapply",
    stagedId: "staged-1",
    triggeredReviewItems: [mi6],
    reviewItemsCorrupt: false,
  };
}

function renderFooter(over: Partial<Parameters<typeof Step3ReviewWithFinalize>[0]> = {}) {
  return render(
    <Step3ReviewWithFinalize
      wizardSessionId={WSID}
      rows={[heldRow()]}
      finishable
      initialPublishCount={0}
      initialUncheckedCleanCount={0}
      {...over}
    />,
  );
}

function primaryLabel(): string {
  return screen.getByTestId("wizard-finalize-button").textContent ?? "";
}
function isDisabled(el: Element | null): boolean {
  return el !== null && (el as HTMLButtonElement).disabled === true;
}

afterEach(() => cleanup());

describe("Step-3 consolidation transition inventory (spec §7 — all deliberately instant)", () => {
  test("footer Publish → Resume → Finish swap by checkpoint (instant, no animation wrapper)", () => {
    const { unmount: u1 } = renderFooter({ checkpointStatus: null });
    expect(primaryLabel()).toMatch(/publish/i);
    u1();
    const { unmount: u2 } = renderFooter({ checkpointStatus: "in_progress" });
    expect(primaryLabel()).toMatch(/resume/i);
    u2();
    renderFooter({ checkpointStatus: "all_batches_complete" });
    expect(primaryLabel()).toMatch(/finish/i);
    // Instant: no framer-motion presence wrapper injected around the footer.
    expect(document.querySelector("[data-framer-appear-id]")).toBeNull();
  });

  test("footer Finish → Finish+stale note (isStale swap) is instant", () => {
    const { unmount } = renderFooter({ checkpointStatus: "all_batches_complete", isStale: false });
    expect(screen.queryByTestId("wizard-step3-stale-note")).toBeNull();
    unmount();
    renderFooter({ checkpointStatus: "all_batches_complete", isStale: true });
    expect(screen.getByTestId("wizard-step3-stale-note")).toBeInTheDocument();
  });

  test("row checkbox → badge swap (pre-finalize → post-finalize) is an instant mount swap", () => {
    const { unmount } = render(
      <Step3Review wizardSessionId={WSID} rows={[heldRow()]} checkpointStatus={null} />,
    );
    expect(screen.getByTestId("wizard-step3-checkbox-d-held")).toBeInTheDocument();
    unmount();
    render(
      <Step3Review wizardSessionId={WSID} rows={[heldRow()]} checkpointStatus="in_progress" />,
    );
    expect(screen.queryByTestId("wizard-step3-checkbox-d-held")).toBeNull();
    expect(screen.getByText("Held")).toBeInTheDocument();
  });

  test("needs-review → resolution modal is an instant dialog mount", () => {
    render(<Step3Review wizardSessionId={WSID} rows={[reapplyRow()]} />);
    fireEvent.click(screen.getByTestId("wizard-step3-card-d-reapply-more"));
    expect(screen.getByRole("button", { name: /approve & apply/i })).toBeInTheDocument();
  });

  test("COMPOUND: all resolution-modal mutators disabled while a publish run is active (Task 2.4, §7 compound row)", () => {
    render(<Step3Review wizardSessionId={WSID} rows={[reapplyRow()]} isPublishRunActive />);
    fireEvent.click(screen.getByTestId("wizard-step3-card-d-reapply-more"));
    expect(isDisabled(screen.getByRole("button", { name: /approve & apply/i }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: /re-scan this sheet/i }))).toBe(true);
    expect(isDisabled(screen.getByRole("button", { name: /ignore this sheet/i }))).toBe(true);
  });
});
