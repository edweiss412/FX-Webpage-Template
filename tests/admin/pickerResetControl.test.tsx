// @vitest-environment jsdom
/**
 * tests/admin/pickerResetControl.test.tsx — everyone-only surface
 * (crew-row-controls spec §4.6; per-member reset moved to the crew row menu).
 */
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PickerResetControl } from "@/app/admin/show/[slug]/PickerResetControl";

const epochMock = vi.hoisted(() => vi.fn());
const memberMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({ resetPickerEpoch: epochMock }));
vi.mock("@/lib/auth/picker/resetCrewMemberSelection", () => ({
  resetCrewMemberSelection: memberMock,
}));

const SHOW_ID = "11111111-2222-4333-8444-555555555555";
const CREW = [
  { id: "c1111111-1111-4111-8111-111111111111", name: "Alice", role: "A1" },
  { id: "c2222222-2222-4222-8222-222222222222", name: "Bob", role: "BO" },
];

beforeEach(() => {
  epochMock.mockReset();
  memberMock.mockReset();
});
afterEach(cleanup);

const allBtn = () => screen.getByTestId("picker-reset-all-button") as HTMLButtonElement;
const confirmGo = () => screen.getByTestId("picker-reset-confirm-button") as HTMLButtonElement;
const cancelBtn = () => screen.getByTestId("picker-reset-cancel-button") as HTMLButtonElement;

describe("PickerResetControl (everyone-only)", () => {
  it("renders heading, description, and NO per-member surface", () => {
    render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
    expect(screen.getByRole("heading", { name: /Reset everyone[’']s pick/ })).toBeTruthy();
    expect(
      screen.getByText("Make everyone pick their name again on their next visit."),
    ).toBeTruthy();
    expect(screen.queryByTestId("picker-reset-member-select")).toBeNull();
    expect(screen.queryByTestId("picker-reset-member-button")).toBeNull();
  });

  it("empty roster: description swaps and the trigger is disabled", () => {
    render(<PickerResetControl showId={SHOW_ID} crew={[]} />);
    expect(screen.getByText("No crew to reset yet.")).toBeTruthy();
    expect(allBtn().disabled).toBe(true);
  });

  it("trigger arms the confirm row with the everyone warning; Cancel focused (C3); C5 restores trigger focus", async () => {
    render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
    fireEvent.click(allBtn());
    expect(screen.getByTestId("picker-reset-confirm-row")).toBeTruthy();
    expect(screen.getByText(/Every device[’']s picker re-prompts on next visit\./)).toBeTruthy();
    await vi.waitFor(() => expect(cancelBtn()).toHaveFocus());
    fireEvent.click(cancelBtn());
    expect(screen.queryByTestId("picker-reset-confirm-row")).toBeNull();
    await vi.waitFor(() => expect(allBtn()).toHaveFocus());
  });

  it("4s auto-revert closes the confirm; stale Confirm cannot fire; member action NEVER called", () => {
    vi.useFakeTimers();
    try {
      render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
      fireEvent.click(allBtn());
      const go = confirmGo();
      act(() => vi.advanceTimersByTime(4_000));
      expect(screen.queryByTestId("picker-reset-confirm-row")).toBeNull();
      fireEvent.click(go);
      expect(epochMock).not.toHaveBeenCalled();
      expect(memberMock).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("confirm calls resetPickerEpoch({showId}); success banner + sr-only announce", async () => {
    epochMock.mockResolvedValue({ ok: true, epoch: 2 });
    render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
    fireEvent.click(allBtn());
    fireEvent.click(confirmGo());
    expect(epochMock).toHaveBeenCalledWith({ showId: SHOW_ID });
    await vi.waitFor(() =>
      expect(screen.getByTestId("picker-reset-ok").textContent).toContain(
        "Everyone will pick again on their next visit.",
      ),
    );
    const region = document.querySelector('[role="status"][aria-live="polite"]')!;
    expect(region.textContent).toContain("Everyone will pick again on their next visit.");
    expect(memberMock).not.toHaveBeenCalled();
  });

  it("a THROWN resetPickerEpoch settles to the generic error banner (no stranded resolving)", async () => {
    epochMock.mockRejectedValue(new Error("network death"));
    render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
    fireEvent.click(allBtn());
    fireEvent.click(confirmGo());
    await vi.waitFor(() =>
      expect(screen.getByTestId("picker-reset-error").textContent).toMatch(
        /Couldn't reset the picker/,
      ),
    );
    expect(screen.queryByTestId("picker-reset-confirm-row")).toBeNull();
  });

  it("failure shows the persistent error banner (survives past the 5s success window)", async () => {
    epochMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
    vi.useFakeTimers();
    try {
      render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
      fireEvent.click(allBtn());
      fireEvent.click(confirmGo());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId("picker-reset-error").textContent).toMatch(
        /Couldn't reset the picker/,
      );
      expect(screen.getByTestId("picker-reset-error").getAttribute("role")).toBe("alert");
      // Errors are NOT auto-dismissed — advance past SUCCESS_DISMISS_MS.
      act(() => vi.advanceTimersByTime(6_000));
      expect(screen.getByTestId("picker-reset-error")).toBeTruthy();
      // Invariant 5: no raw picker code ever reaches the DOM.
      expect(document.body.textContent).not.toMatch(/PICKER_[A-Z_]+/);
    } finally {
      vi.useRealTimers();
    }
  });

  describe("onBusyChange (ShareHub busy contract, spec §6)", () => {
    // The hub gates ALL FOUR dismissal paths on this signal. A missing rising
    // edge leaves the popover dismissible mid-mutation (losing the outcome
    // banner for a destructive action); a missing falling edge wedges it shut.
    it("reports busy true on entering resolving and false on SUCCESS", async () => {
      epochMock.mockResolvedValue({ ok: true, epoch: 2 });
      const onBusyChange = vi.fn();
      render(<PickerResetControl showId={SHOW_ID} crew={CREW} onBusyChange={onBusyChange} />);
      fireEvent.click(allBtn());
      fireEvent.click(confirmGo());
      await vi.waitFor(() => expect(screen.getByTestId("picker-reset-ok")).toBeTruthy());
      const busyEdges = onBusyChange.mock.calls.map((c) => c[0]);
      expect(busyEdges).toContain(true);
      expect(busyEdges[busyEdges.length - 1]).toBe(false);
    });

    it("reports busy false on a RETURNED error", async () => {
      epochMock.mockResolvedValue({ ok: false, code: "PICKER_RESOLVER_LOOKUP_FAILED" });
      const onBusyChange = vi.fn();
      render(<PickerResetControl showId={SHOW_ID} crew={CREW} onBusyChange={onBusyChange} />);
      fireEvent.click(allBtn());
      fireEvent.click(confirmGo());
      await vi.waitFor(() => expect(screen.getByTestId("picker-reset-error")).toBeTruthy());
      const busyEdges = onBusyChange.mock.calls.map((c) => c[0]);
      expect(busyEdges).toContain(true);
      expect(busyEdges[busyEdges.length - 1]).toBe(false);
    });

    it("reports busy false on a THROWN action", async () => {
      epochMock.mockRejectedValue(new Error("network death"));
      const onBusyChange = vi.fn();
      render(<PickerResetControl showId={SHOW_ID} crew={CREW} onBusyChange={onBusyChange} />);
      fireEvent.click(allBtn());
      fireEvent.click(confirmGo());
      await vi.waitFor(() => expect(screen.getByTestId("picker-reset-error")).toBeTruthy());
      const busyEdges = onBusyChange.mock.calls.map((c) => c[0]);
      expect(busyEdges).toContain(true);
      expect(busyEdges[busyEdges.length - 1]).toBe(false);
    });

    it("prop-less usage is unchanged (step3ReviewSections passes nothing)", async () => {
      epochMock.mockResolvedValue({ ok: true, epoch: 2 });
      render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
      fireEvent.click(allBtn());
      fireEvent.click(confirmGo());
      await vi.waitFor(() => expect(screen.getByTestId("picker-reset-ok")).toBeTruthy());
      expect(screen.queryByTestId("picker-reset-confirm-row")).toBeNull();
    });
  });

  it("success banner auto-dismisses after 5s (fake timers)", async () => {
    epochMock.mockResolvedValue({ ok: true, epoch: 2 });
    vi.useFakeTimers();
    try {
      render(<PickerResetControl showId={SHOW_ID} crew={CREW} />);
      fireEvent.click(allBtn());
      fireEvent.click(confirmGo());
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByTestId("picker-reset-ok")).toBeTruthy();
      act(() => vi.advanceTimersByTime(5_000));
      expect(screen.queryByTestId("picker-reset-ok")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
