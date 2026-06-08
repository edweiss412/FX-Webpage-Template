// @vitest-environment jsdom
/**
 * tests/components/ResetPickerEpochButton.test.tsx (M11.5 §B Task F2)
 *
 * Pins the two-tap state machine + success/failure feedback for the
 * Reset picker selections admin button.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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

const idleBtn = () =>
  screen.getByTestId("admin-reset-picker-epoch-button") as HTMLButtonElement;
const confirmBtn = () =>
  screen.getByTestId(
    "admin-reset-picker-epoch-confirm-button",
  ) as HTMLButtonElement;
const cancelBtn = () =>
  screen.getByTestId(
    "admin-reset-picker-epoch-cancel-button",
  ) as HTMLButtonElement;

describe("ResetPickerEpochButton — two-tap state machine", () => {
  test("idle: shows 'Reset picker selections' label", () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    expect(idleBtn().textContent).toContain("Reset picker selections");
  });

  // M12.6 — compact share-card variant: visible text "Reset" → needs a
  // descriptive accessible name + aria-describedby (adversarial review). aria-label
  // contains the visible "Reset" (WCAG 2.5.3 Label-in-Name).
  test("compact: descriptive accessible name + aria-describedby to the row description", () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} compact describedById="row-desc" />);
    const btn = screen.getByRole("button", { name: /reset name picker/i });
    expect(btn).toBe(idleBtn());
    expect(btn.textContent).toContain("Reset");
    expect(btn.getAttribute("aria-describedby")).toBe("row-desc");
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
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: true, new_epoch: 2 },
    );
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
      expect(
        screen.getByTestId("admin-reset-picker-epoch-ok").textContent,
      ).toContain("Picker selections reset.");
    });
  });

  test("confirm-click → failure result renders the refused banner with role=alert", async () => {
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: false, code: "PICKER_RESET_FORBIDDEN" },
    );
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
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: false, code: "PICKER_RESET_FORBIDDEN" },
    );
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    const refused = await waitFor(() =>
      screen.getByTestId("admin-reset-picker-epoch-refused"),
    );
    expect(refused.textContent).not.toMatch(/last attempt/i);
  });

  test("re-entering confirm clears any stale OK/refused banner (no zombie state)", async () => {
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { ok: false, code: "PICKER_RESET_FORBIDDEN" },
    );
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      vi.useRealTimers();
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(
        screen.getByTestId("admin-reset-picker-epoch-refused"),
      ).toBeTruthy(),
    );
    vi.useFakeTimers();
    // Re-enter confirm — the prior refused banner must NOT persist.
    fireEvent.click(idleBtn());
    expect(
      screen.queryByTestId("admin-reset-picker-epoch-refused"),
    ).toBeNull();
  });
});
