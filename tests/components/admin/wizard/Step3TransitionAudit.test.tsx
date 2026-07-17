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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const fetchMock = vi.fn<typeof fetch>();
function mockJsonResponse(body: unknown, init: { status?: number } = {}) {
  return {
    ok: (init.status ?? 200) < 400,
    status: init.status ?? 200,
    json: async () => body,
  } as unknown as Response;
}
function appliedRow(dfid = "d-app"): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "applied",
    parseResult: PARSE,
  };
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

// The finalize BLOCKER MODAL (spec 2026-07-17 §7): running → blocker mounts the
// portaled dialog with a CSS entrance (no framer). Enter = scrim fade + panel
// rise, both token-timed and motion-reduce-collapsed. Exit = instant unmount.
describe("Step-3 finalize blocker modal — entrance transition audit (spec §7)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  async function driveFooterToCasPerRow() {
    fetchMock
      .mockResolvedValueOnce(
        mockJsonResponse({
          status: "all_batches_complete",
          wizard_session_id: WSID,
          remaining_count: 0,
          unresolved_manifest_count: 0,
          per_row: [],
        }),
      )
      .mockResolvedValueOnce(
        mockJsonResponse(
          {
            ok: false,
            code: "SHOW_ARCHIVED_IMMUTABLE",
            per_row: [{ drive_file_id: "d-app", code: "SHOW_ARCHIVED_IMMUTABLE" }],
          },
          { status: 409 },
        ),
      );
    const q = render(
      <Step3ReviewWithFinalize
        wizardSessionId={WSID}
        rows={[appliedRow()]}
        finishable
        initialPublishCount={1}
        initialUncheckedCleanCount={0}
      />,
    );
    await act(async () => {
      fireEvent.click(q.getByTestId("wizard-finalize-button"));
    });
    await waitFor(() => expect(q.getByTestId("wizard-finalize-blocker-modal")).toBeInTheDocument());
    return q;
  }

  test("panel rises + scrim fades on enter (token-timed, motion-reduce collapses; keyframes exist)", async () => {
    const q = await driveFooterToCasPerRow();
    const panel = q.getByTestId("wizard-finalize-blocker-panel");
    expect(panel.className).toMatch(/animate-\[sheet-rise/);
    expect(panel.className).toContain("motion-reduce:animate-none");
    const scrim = q.getByTestId("wizard-finalize-blocker-backdrop");
    expect(scrim.className).toMatch(/animate-\[step3-details-scrim-in/);
    expect(scrim.className).toContain("motion-reduce:animate-none");

    // The referenced keyframes must EXIST in app/globals.css (a rename would
    // silently no-op the entrance).
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    expect(css).toMatch(/@keyframes sheet-rise\b/);
    expect(css).toMatch(/@keyframes step3-details-scrim-in\b/);
  });

  test("exit is instant — no AnimatePresence/exit wrapper and no framer appear id on the panel", async () => {
    const q = await driveFooterToCasPerRow();
    // Deliberately instant unmount: no framer presence machinery around the modal.
    expect(document.querySelector("[data-framer-appear-id]")).toBeNull();
    const panel = q.getByTestId("wizard-finalize-blocker-panel");
    expect(panel.className).not.toMatch(/exit/i);
  });
});
