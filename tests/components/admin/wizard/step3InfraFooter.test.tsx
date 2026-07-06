// @vitest-environment jsdom
/**
 * tests/components/admin/wizard/step3InfraFooter.test.tsx (Phase 3 Task 3.4)
 *
 * Checkpoint footer preservation (plan-R2 MEDIUM): at a non-null checkpoint the
 * Resume/Finish footer + Cleanup MUST render even when the sheet list is empty —
 * the degraded-read (Step3Container infra_error) path renders Step3ReviewWithFinalize
 * with rows=[] so a failed sheets read never strands the operator without a way to
 * finish. At checkpoint null, an empty list renders NO footer (pre-finalize).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import { Step3ReviewWithFinalize } from "@/components/admin/wizard/Step3ReviewWithFinalize";

function renderEmpty(over: Partial<Parameters<typeof Step3ReviewWithFinalize>[0]> = {}) {
  return render(
    <Step3ReviewWithFinalize
      wizardSessionId="11111111-1111-1111-1111-111111111111"
      rows={[]}
      finishable
      initialPublishCount={0}
      initialUncheckedCleanCount={0}
      {...over}
    />,
  );
}

afterEach(() => cleanup());

describe("Step-3 checkpoint footer preservation with empty rows (Task 3.4)", () => {
  test("checkpoint null + empty rows → NO footer", () => {
    renderEmpty({ checkpointStatus: null });
    expect(screen.queryByTestId("wizard-finalize-button")).toBeNull();
  });

  test("in_progress + empty rows → Resume footer + Cleanup (infra-error preservation)", () => {
    renderEmpty({ checkpointStatus: "in_progress" });
    expect(screen.getByTestId("wizard-finalize-button").textContent).toMatch(/resume/i);
    expect(screen.getByTestId("cleanup-abandoned-finalize")).toBeInTheDocument();
  });

  test("all_batches_complete + stale + empty rows → Finish footer + stale note + Cleanup", () => {
    renderEmpty({ checkpointStatus: "all_batches_complete", isStale: true });
    expect(screen.getByTestId("wizard-finalize-button").textContent).toMatch(/finish/i);
    expect(screen.getByTestId("wizard-step3-stale-note")).toBeInTheDocument();
    expect(screen.getByTestId("cleanup-abandoned-finalize")).toBeInTheDocument();
  });
});
