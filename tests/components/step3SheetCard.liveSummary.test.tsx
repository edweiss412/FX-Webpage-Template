// @vitest-environment jsdom
/**
 * tests/components/step3SheetCard.liveSummary.test.tsx (owner decision 2026-07-06)
 *
 * Post-finalize (checkpointStatus !== null) an APPLIED row has had its
 * pending_syncs parse preview deleted by the finalize batch, so the card falls to
 * the badge-only branch. Previously that rendered a BARE title + badge, which read
 * as broken. The card now backfills a client · dates · venue line from
 * `row.linkedShowSummary` (the linked live show). These tests pin:
 *   - the summary line renders the live show's client + venue (derived from jsonb);
 *   - with NO linkedShowSummary the card degrades to a bare title (no empty line);
 *   - the "Live" badge still renders alongside.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Step3SheetCard } from "@/components/admin/wizard/Step3SheetCard";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => cleanup());

const DFID = "drive-live-001";
const WSID = "00000000-1111-4222-8333-444444444444";

function appliedRow(overrides: Partial<Step3Row> = {}): Step3Row {
  return {
    driveFileId: DFID,
    driveFileName: "rfi-pc-chicago.sheet",
    status: "applied",
    parseResult: null, // finalize deleted the preview
    displayState: "live",
    ...overrides,
  };
}

describe("Step3SheetCard post-finalize live-summary backfill", () => {
  test("renders the linked show's client + venue in a summary line", () => {
    const row = appliedRow({
      linkedShowSummary: {
        title: "RFI & PC Chicago",
        clientLabel: "Institutional Investor",
        venue: { name: "Four Seasons Hotel" },
        dates: { travelIn: "May 11", set: "May 12", showDays: ["May 13"], travelOut: "May 15" },
      },
    });
    const q = render(
      <Step3SheetCard row={row} wizardSessionId={WSID} checkpointStatus="all_batches_complete" />,
    );
    const summary = q.getByTestId(`wizard-step3-card-${DFID}-live-summary`).textContent ?? "";
    expect(summary).toContain("Institutional Investor");
    expect(summary).toContain("Four Seasons Hotel");
    // The backfilled title becomes the source-sheet deep link.
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title-link`).textContent ?? "").toContain(
      "RFI & PC Chicago",
    );
    // The derived badge still renders.
    expect(q.getByTestId("wizard-step3-badge").textContent ?? "").toMatch(/live/i);
  });

  test("no linkedShowSummary → bare title, NO empty summary line", () => {
    const row = appliedRow();
    const q = render(
      <Step3SheetCard row={row} wizardSessionId={WSID} checkpointStatus="all_batches_complete" />,
    );
    expect(q.queryByTestId(`wizard-step3-card-${DFID}-live-summary`)).toBeNull();
    // Falls back to the drive file name as the title.
    expect(q.getByTestId(`wizard-step3-card-${DFID}-title-link`).textContent ?? "").toContain(
      "rfi-pc-chicago.sheet",
    );
  });

  // ── Finalize race (bug 2026-07-17): during "Applying your edits…" the finalize
  // batch has already DELETED the row's pending_syncs preview (pr → null) but the
  // client still holds the PRE-finalize checkpoint snapshot (checkpointStatus ===
  // null). A linked live show is proof the sheet read fine, so the card MUST show
  // the backfilled badge, NOT the generic "couldn't read the details" error which
  // healthy shows were wrongly rendering. ──
  describe("checkpointStatus === null race with a linked live show", () => {
    test("linkedShowSummary present → backfill card, NOT the couldn't-read error", () => {
      const row = appliedRow({
        linkedShowSummary: {
          title: "RFI & PC Chicago",
          clientLabel: "Institutional Investor",
          venue: { name: "Four Seasons Hotel" },
          dates: { travelIn: "May 11", set: "May 12", showDays: ["May 13"], travelOut: "May 15" },
        },
      });
      const q = render(<Step3SheetCard row={row} wizardSessionId={WSID} checkpointStatus={null} />);
      // Not the generic no-details error.
      expect(q.queryByText(/couldn.t read the details/i)).toBeNull();
      // The live summary backfill renders instead.
      const summary = q.getByTestId(`wizard-step3-card-${DFID}-live-summary`).textContent ?? "";
      expect(summary).toContain("Institutional Investor");
      expect(summary).toContain("Four Seasons Hotel");
    });

    test("no linkedShowSummary AND checkpoint null → genuine couldn't-read error preserved", () => {
      const row = appliedRow(); // pr null, no linked show, no checkpoint
      const q = render(<Step3SheetCard row={row} wizardSessionId={WSID} checkpointStatus={null} />);
      // The genuine null-parse case still shows the error + recovery affordance.
      expect(q.getByText(/couldn.t read the details/i)).toBeTruthy();
    });
  });
});
