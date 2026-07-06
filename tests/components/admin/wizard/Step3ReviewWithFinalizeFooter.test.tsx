// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/Step3ReviewWithFinalizeFooter.test.tsx
 * (Phase 3 Task 3.2 — spec §4.5)
 *
 * The footer primary follows the finalize checkpoint: null → Publish, in_progress
 * → Resume + Cleanup, all_batches_complete → Finish (+ stale note + Cleanup when
 * stale). Replaces the three standalone interstitials.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";
import type { Step3Row } from "@/components/admin/wizard/Step3Review";
import type { ParseResult } from "@/lib/parser/types";

const WSID = "11111111-1111-1111-1111-111111111111";
const PARSE = { show: { title: "A Show" } } as unknown as ParseResult;

function row(): Step3Row {
  return {
    driveFileId: "d1",
    driveFileName: "d1.gsheet",
    status: "applied",
    parseResult: PARSE,
    displayState: "held",
  };
}

function renderFooter(over: Partial<Parameters<typeof Step3ReviewWithFinalize>[0]> = {}) {
  return render(
    <Step3ReviewWithFinalize
      wizardSessionId={WSID}
      rows={[row()]}
      finishable
      initialPublishCount={0}
      initialUncheckedCleanCount={0}
      {...over}
    />,
  );
}

afterEach(() => cleanup());

describe("Step3ReviewWithFinalize footer by checkpoint (spec §4.5)", () => {
  test("null → Publish trigger, NO cleanup control", () => {
    renderFooter({ checkpointStatus: null });
    expect(screen.getByTestId("wizard-finalize-button").textContent).toMatch(/publish/i);
    expect(screen.queryByTestId("cleanup-abandoned-finalize")).toBeNull();
  });

  test("in_progress → Resume trigger + Cleanup control", () => {
    renderFooter({ checkpointStatus: "in_progress" });
    expect(screen.getByTestId("wizard-finalize-button").textContent).toMatch(/resume/i);
    expect(screen.getByTestId("cleanup-abandoned-finalize")).toBeInTheDocument();
  });

  test("all_batches_complete → Finish trigger; NOT stale → no stale note, no cleanup", () => {
    renderFooter({ checkpointStatus: "all_batches_complete", isStale: false });
    expect(screen.getByTestId("wizard-finalize-button").textContent).toMatch(/finish/i);
    expect(screen.queryByTestId("wizard-step3-stale-note")).toBeNull();
    expect(screen.queryByTestId("cleanup-abandoned-finalize")).toBeNull();
  });

  test("all_batches_complete + stale → Finish trigger + stale note + Cleanup", () => {
    renderFooter({ checkpointStatus: "all_batches_complete", isStale: true });
    expect(screen.getByTestId("wizard-finalize-button").textContent).toMatch(/finish/i);
    expect(screen.getByTestId("wizard-step3-stale-note")).toBeInTheDocument();
    expect(screen.getByTestId("cleanup-abandoned-finalize")).toBeInTheDocument();
  });
});
