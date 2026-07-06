// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3CheckpointAffordance.test.tsx
 * (Phase 3 Task 3.3 — spec §4.2 rule 7)
 *
 * The editable publish checkbox + Select-all exist ONLY at checkpoint null.
 * Post-finalize (in_progress / all_batches_complete) rows are badge-only. Asserts
 * against the derived displayState (badge text), never a restated literal.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

import { Step3Review, type Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";

const WSID = "11111111-1111-1111-1111-111111111111";
const PARSE = { show: { title: "A Show" } } as unknown as ParseResult;

function readyRow(dfid = "d-ready"): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "staged",
    parseResult: PARSE,
    displayState: "ready",
  };
}
function readyToPublishRow(dfid = "d-rtp"): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "applied",
    parseResult: PARSE,
    displayState: "ready_to_publish",
  };
}
function heldRow(dfid = "d-held"): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "applied",
    parseResult: PARSE,
    displayState: "held",
  };
}

// Post-finalize the finalize batch DELETES the pending_syncs preview for every
// clean row (route `deleteApprovedPending`), so a Live/Held/Ready-to-publish row
// legitimately arrives with NO parseResult. It must still render badge-only.
function heldRowNoPreview(dfid = "d-held-np"): Step3Row {
  return {
    driveFileId: dfid,
    driveFileName: `${dfid}.gsheet`,
    status: "applied",
    displayState: "held",
  };
}

afterEach(() => cleanup());

describe("Step-3 checkpoint affordance (spec §4.2 rule 7)", () => {
  test("checkpoint null → Select-all + per-row publish checkbox present", () => {
    render(<Step3Review wizardSessionId={WSID} rows={[readyRow()]} checkpointStatus={null} />);
    expect(screen.getByTestId("wizard-step3-select-all")).toBeInTheDocument();
    expect(screen.getByTestId("wizard-step3-checkbox-d-ready")).toBeInTheDocument();
  });

  test("checkpoint in_progress → NO Select-all, NO per-row checkbox; badge-only", () => {
    render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[readyToPublishRow(), heldRow()]}
        checkpointStatus="in_progress"
      />,
    );
    expect(screen.queryByTestId("wizard-step3-select-all")).toBeNull();
    expect(screen.queryByTestId("wizard-step3-checkbox-d-rtp")).toBeNull();
    expect(screen.queryByTestId("wizard-step3-checkbox-d-held")).toBeNull();
    // Badge-only, derived from displayState.
    expect(screen.getByText("Ready to publish")).toBeInTheDocument();
    expect(screen.getByText("Held")).toBeInTheDocument();
  });

  test("post-finalize suppresses the pre-finalize summary (impeccable P2 — 'Nothing publishes…' would contradict badges)", () => {
    const { queryByTestId, rerender } = render(
      <Step3Review wizardSessionId={WSID} rows={[readyRow()]} checkpointStatus={null} />,
    );
    // Pre-finalize: the summary is present.
    expect(queryByTestId("wizard-step3-summary")).not.toBeNull();
    // Post-finalize: suppressed (badges + footer carry the state).
    rerender(
      <Step3Review
        wizardSessionId={WSID}
        rows={[readyToPublishRow()]}
        checkpointStatus="in_progress"
      />,
    );
    expect(queryByTestId("wizard-step3-summary")).toBeNull();
  });

  test("post-finalize row with NO parse preview renders badge-only, NOT no-details recovery (Codex R3 HIGH)", () => {
    // Regression: the §4.6 no-details guard fired BEFORE the checkpoint branch, so
    // a consumed-preview Held row showed "couldn't read the details" + Re-scan.
    render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[heldRowNoPreview()]}
        checkpointStatus="in_progress"
      />,
    );
    expect(screen.getByText("Held")).toBeInTheDocument();
    expect(
      screen.queryByTestId("wizard-step3-card-d-held-np")?.getAttribute("data-no-details"),
    ).not.toBe("true");
    expect(screen.queryByText(/couldn.t read the details/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /re-scan this sheet/i })).toBeNull();
  });

  // The badge sits in the row's right-side cluster (AFTER the title) in BOTH card
  // variants. Regression: the detailed variant (a row whose pending_syncs parse
  // preview SURVIVED finalize — e.g. the resume checkpoint's next batch item)
  // rendered the badge as the FIRST flex child, LEFT of the title, while every
  // consumed-preview row rendered the compact badge-only card with the badge on
  // the right. Same "Live" state, two placements. Pin badge-after-title so the
  // badge column is consistent across all rows.
  function badgeFollowsTitle(cardTestId: string, titleTestId: string): boolean {
    const card = screen.getByTestId(cardTestId);
    const title = within(card).getByTestId(titleTestId);
    const badge = within(card).getByTestId("wizard-step3-badge");
    return Boolean(title.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  test("detailed variant (preview survived) renders badge AFTER title, not left of it", () => {
    render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[readyToPublishRow("d-detailed")]}
        checkpointStatus="in_progress"
      />,
    );
    expect(
      badgeFollowsTitle("wizard-step3-card-d-detailed", "wizard-step3-card-d-detailed-title"),
    ).toBe(true);
  });

  test("compact variant (preview consumed) also renders badge AFTER title — placement is consistent", () => {
    render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[heldRowNoPreview("d-compact")]}
        checkpointStatus="in_progress"
      />,
    );
    // The compact card uses the title link as its heading; there is no `-title`
    // testid, so assert the badge is DOM-last within the card (right cluster).
    const card = screen.getByTestId("wizard-step3-card-d-compact");
    const badge = within(card).getByTestId("wizard-step3-badge");
    const heading = within(card).getByText("d-compact.gsheet");
    expect(Boolean(heading.compareDocumentPosition(badge) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(
      true,
    );
  });

  test("checkpoint all_batches_complete → same badge-only contract", () => {
    render(
      <Step3Review
        wizardSessionId={WSID}
        rows={[heldRow()]}
        checkpointStatus="all_batches_complete"
      />,
    );
    expect(screen.queryByTestId("wizard-step3-select-all")).toBeNull();
    expect(screen.queryByTestId("wizard-step3-checkbox-d-held")).toBeNull();
    expect(screen.getByText("Held")).toBeInTheDocument();
  });
});
