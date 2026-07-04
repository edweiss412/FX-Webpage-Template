// @vitest-environment jsdom
/**
 * tests/components/ResetPickerEpochButton.test.tsx (M11.5 §B Task F2)
 *
 * Pins the two-tap state machine + success/failure feedback for the
 * Reset picker selections admin button.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/auth/picker/resetPickerEpoch", () => ({
  resetPickerEpoch: vi.fn(),
}));

import { ResetPickerEpochButton } from "@/app/admin/show/[slug]/ResetPickerEpochButton";
import { resetPickerEpoch } from "@/lib/auth/picker/resetPickerEpoch";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

const idleBtn = () => screen.getByTestId("admin-reset-picker-epoch-button") as HTMLButtonElement;
const confirmBtn = () =>
  screen.getByTestId("admin-reset-picker-epoch-confirm-button") as HTMLButtonElement;
const cancelBtn = () =>
  screen.getByTestId("admin-reset-picker-epoch-cancel-button") as HTMLButtonElement;

describe("ResetPickerEpochButton — two-tap state machine", () => {
  test("idle: shows 'Reset picker selections' label", () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    expect(idleBtn().textContent).toContain("Reset picker selections");
  });

  // PCR-1 item (c): DESIGN §focus specifies a ring PLUS a 2px offset. Every
  // focusable control (idle + confirm) must carry the offset, not just the ring.
  test("(c) every focusable control carries the DESIGN focus-ring offset", () => {
    const { container } = render(
      <ResetPickerEpochButton
        showId={SHOW_ID}
        compact
        rowLabel="Reset name picker"
        rowDescription="Everyone re-picks who they are on their next visit."
      />,
    );
    const checkAll = () => {
      const focusables = container.querySelectorAll("button, select");
      expect(focusables.length).toBeGreaterThan(0);
      focusables.forEach((el) =>
        expect((el as HTMLElement).className).toContain("focus-visible:ring-offset-2"),
      );
    };
    checkAll(); // idle button
    fireEvent.click(idleBtn()); // → confirm
    checkAll(); // confirm + cancel
  });

  // PCR-1 item (b): the compact row label is a heading (sits under the panel's
  // <h3>), not a plain <p>, so the control appears in the SR heading outline.
  test("(b) the compact row label is a heading", () => {
    render(
      <ResetPickerEpochButton
        showId={SHOW_ID}
        compact
        rowLabel="Reset name picker"
        rowDescription="Everyone re-picks who they are on their next visit."
      />,
    );
    expect(screen.getByRole("heading", { name: /Reset name picker/i })).toBeTruthy();
  });

  // PCR-1 item (a): the OK banner announces from a live region that is ALREADY
  // mounted (and empty) before the success — SRs that skip insert-time announces
  // on a freshly-mounted region still fire. Present in idle AND confirm so the
  // region is a stable node across the resolving → idle transition.
  test("(a) a persistent, empty aria-live=polite status region exists at mount (compact)", () => {
    const { container } = render(
      <ResetPickerEpochButton
        showId={SHOW_ID}
        compact
        rowLabel="Reset name picker"
        rowDescription="Everyone re-picks who they are on their next visit."
      />,
    );
    const region = container.querySelector('[role="status"][aria-live="polite"]');
    expect(region).not.toBeNull();
    expect(screen.queryByTestId("admin-reset-picker-epoch-ok")).toBeNull();
  });

  test("(a) the status region persists through the confirm state (stable node)", () => {
    const { container } = render(
      <ResetPickerEpochButton
        showId={SHOW_ID}
        compact
        rowLabel="Reset name picker"
        rowDescription="Everyone re-picks who they are on their next visit."
      />,
    );
    fireEvent.click(idleBtn()); // → confirm
    expect(container.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });

  // M12.6 — compact share-card variant: visible text "Reset" → needs a
  // descriptive accessible name + aria-describedby (adversarial review). aria-label
  // contains the visible "Reset" (WCAG 2.5.3 Label-in-Name).
  test("compact: descriptive accessible name + aria-describedby to the row description", () => {
    render(
      <ResetPickerEpochButton
        showId={SHOW_ID}
        compact
        rowLabel="Reset name picker"
        rowDescription="Everyone re-picks who they are on their next visit."
      />,
    );
    const btn = screen.getByRole("button", { name: /reset name picker/i });
    expect(btn).toBe(idleBtn());
    expect(btn.textContent).toContain("Reset");
    const descId = btn.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)?.textContent ?? "").toMatch(/re-picks/i);
  });

  // M12.7 (adversarial) — Confirm/Cancel render FULL-WIDTH below the label row.
  test("compact confirm: Confirm/Cancel render full-width below the label, not beside it", () => {
    render(
      <ResetPickerEpochButton
        showId={SHOW_ID}
        compact
        rowLabel="Reset name picker"
        rowDescription="Everyone re-picks who they are on their next visit."
      />,
    );
    fireEvent.click(screen.getByTestId("admin-reset-picker-epoch-button"));
    const confirmRow = screen.getByTestId("admin-reset-picker-epoch-confirm-row");
    const confirmBtn = screen.getByTestId("admin-reset-picker-epoch-confirm-button");
    expect(confirmRow.contains(confirmBtn)).toBe(true);
    expect(confirmRow.textContent).toMatch(/reset name picker/i);
    expect(confirmBtn.closest('[class*="justify-between"]')).toBeNull();
  });

  test("idle → confirm: tap reveals confirm + cancel + count-free preview copy", () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    const group = screen.getByTestId("admin-reset-picker-epoch-confirm-row");
    expect(group.getAttribute("role")).toBe("group");
    expect(confirmBtn()).toBeTruthy();
    expect(cancelBtn()).toBeTruthy();
    // R27 count-free copy: no literal number-of-devices promise.
    expect(group.textContent).not.toMatch(/\b\d+\s+device/);
  });

  test("confirm → cancel: returns to idle without invoking the action", () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    fireEvent.click(cancelBtn());
    expect(idleBtn()).toBeTruthy();
    expect(resetPickerEpoch).not.toHaveBeenCalled();
  });

  test("confirm → 3s auto-revert: returns to idle without invoking the action", () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    expect(confirmBtn()).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(3_001);
    });
    expect(idleBtn()).toBeTruthy();
    expect(resetPickerEpoch).not.toHaveBeenCalled();
  });

  test("confirm-click → invokes resetPickerEpoch with the showId; success banner renders", async () => {
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      new_epoch: 2,
    });
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(resetPickerEpoch).toHaveBeenCalledWith({ showId: SHOW_ID });
    await waitFor(() => {
      expect(screen.getByTestId("admin-reset-picker-epoch-ok").textContent).toContain(
        "Picker selections reset.",
      );
    });
  });

  test("confirm-click → failure result renders the refused banner with role=alert", async () => {
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      code: "PICKER_RESET_FORBIDDEN",
    });
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => {
      const refused = screen.getByTestId("admin-reset-picker-epoch-refused");
      expect(refused.getAttribute("role")).toBe("alert");
      expect(refused.textContent).toContain("Couldn't reset");
    });
  });

  test("refused banner has no 'Last attempt:' prefix (parity with OK banner per attestation)", async () => {
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      code: "PICKER_RESET_FORBIDDEN",
    });
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    const refused = await waitFor(() => screen.getByTestId("admin-reset-picker-epoch-refused"));
    expect(refused.textContent).not.toMatch(/last attempt/i);
  });

  test("re-entering confirm clears any stale OK/refused banner (no zombie state)", async () => {
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      code: "PICKER_RESET_FORBIDDEN",
    });
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByTestId("admin-reset-picker-epoch-refused")).toBeTruthy(),
    );
    vi.useFakeTimers();
    // Re-enter confirm — the prior refused banner must NOT persist.
    fireEvent.click(idleBtn());
    expect(screen.queryByTestId("admin-reset-picker-epoch-refused")).toBeNull();
  });
});
