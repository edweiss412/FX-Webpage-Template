// @vitest-environment jsdom
/**
 * tests/components/admin/CleanupAbandonedFinalizeButton.test.tsx
 *
 * Pins the discard-confirm copy for the finalize-resume deadlock feature
 * (spec 2026-07-05-finalize-resume-deadlock §5.3). Thread 2's cleanup deletes
 * ONLY the unpublished remainder of this run (the provenance delete is
 * `s.published = false`); shows already published in this run STAY LIVE. The
 * prior copy claimed the opposite ("deletes every show that was published as
 * part of this wizard run") — factually wrong once immediate stuck-discard
 * ships. This test locks the corrected promise.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

import { CleanupAbandonedFinalizeButton } from "@/components/admin/CleanupAbandonedFinalizeButton";

function openConfirm() {
  render(<CleanupAbandonedFinalizeButton sessionId="s1" />);
  fireEvent.click(screen.getByTestId("cleanup-abandoned-finalize-button"));
}

describe("CleanupAbandonedFinalizeButton discard-confirm copy", () => {
  afterEach(() => cleanup());

  it("states that already-published shows stay live", () => {
    openConfirm();
    const dialog = screen.getByTestId("cleanup-abandoned-finalize-confirm");
    expect(dialog).toHaveTextContent(/already published/i);
    expect(dialog).toHaveTextContent(/stay live/i);
  });

  it("does NOT claim the discard deletes published shows", () => {
    openConfirm();
    const dialog = screen.getByTestId("cleanup-abandoned-finalize-confirm");
    // The old, now-wrong promise: discarding wipes published shows.
    expect(dialog).not.toHaveTextContent(/deletes every show that was published/i);
  });

  it("still keeps the destructive confirm/cancel affordances", () => {
    openConfirm();
    expect(screen.getByTestId("cleanup-abandoned-finalize-confirm-yes")).toBeInTheDocument();
    expect(screen.getByTestId("cleanup-abandoned-finalize-confirm-cancel")).toBeInTheDocument();
  });
});
