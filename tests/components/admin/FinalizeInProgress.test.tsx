// @vitest-environment jsdom
/**
 * tests/components/admin/FinalizeInProgress.test.tsx
 *
 * Pins the finalize-resume re-entry surface's unresolved-sheet recovery list
 * (spec 2026-07-05-finalize-resume-deadlock §3). Before this, the in_progress
 * screen offered only Resume (→ ONBOARDING_NOT_RESOLVED dead-end) and Discard
 * (→ 24h gate), with no path to resolve the demoted sheet. The list surfaces
 * each unresolved sheet with catalog copy + a recovery link.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The nested <ResumeFinalizeButton> / <CleanupAbandonedFinalizeButton> /
// <HelpAffordance> call useRouter()/usePathname(); jsdom has no App Router
// context, so stub them (same idiom as the wizard component tests).
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

import { FinalizeInProgress } from "@/components/admin/FinalizeInProgress";

describe("FinalizeInProgress unresolved-sheet list", () => {
  afterEach(() => cleanup());

  it("lists an unresolved sheet with catalog copy + a recovery link", () => {
    render(
      <FinalizeInProgress
        sessionId="s1"
        batchesCompleted={1}
        unresolved={[
          {
            driveFileId: "D1",
            failureCode: "STAGED_PARSE_REVISION_RACE_DURING_FINALIZE",
            displayName: "East Coast",
            reApplyHref: "/admin/onboarding/staged/s1/D1",
          },
        ]}
      />,
    );
    expect(screen.getByText("East Coast")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /review and resolve/i });
    expect(link).toHaveAttribute("href", "/admin/onboarding/staged/s1/D1");
    // copy routes through the catalog dougFacing, never the raw code (invariant 5)
    expect(
      screen.queryByText("STAGED_PARSE_REVISION_RACE_DURING_FINALIZE"),
    ).not.toBeInTheDocument();
  });

  it("uses neutral copy for a blocking row with a null failure code", () => {
    render(
      <FinalizeInProgress
        sessionId="s1"
        batchesCompleted={1}
        unresolved={[
          {
            driveFileId: "D2",
            failureCode: null,
            displayName: "D2",
            reApplyHref: "/admin/onboarding/staged/s1/D2",
          },
        ]}
      />,
    );
    expect(screen.getByText("D2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review and resolve/i })).toBeInTheDocument();
  });

  it("renders no list section when unresolved is empty", () => {
    render(<FinalizeInProgress sessionId="s1" batchesCompleted={1} unresolved={[]} />);
    expect(screen.queryByTestId("finalize-in-progress-unresolved")).toBeNull();
  });

  it("shows a soft note on infra_error without hiding Resume", () => {
    render(
      <FinalizeInProgress
        sessionId="s1"
        batchesCompleted={1}
        unresolved={{ kind: "infra_error", message: "boom" }}
      />,
    );
    expect(screen.getByTestId("resume-finalize-button")).toBeInTheDocument();
    expect(screen.getByText(/couldn.t load the blocked sheets/i)).toBeInTheDocument();
  });
});
