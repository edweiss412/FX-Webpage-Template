// @vitest-environment jsdom
/**
 * tests/components/ResetPickerEpochButton.test.tsx (M11.5 §B Task F2)
 *
 * Pins the two-tap state machine + success/failure feedback for the
 * Reset picker selections admin button.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

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

  // PCR-1 (a) regression (Codex R3): the visible outcome banner must never
  // render beside the still-"resolving" confirm row — it appears only at rest.
  test("(regression) success banner does not render beside the resolving confirm row", async () => {
    let resolve!: (v: unknown) => void;
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      await Promise.resolve();
    });
    // resolving: the "Resetting…" confirm button is present; NO banner yet
    expect(screen.getByTestId("admin-reset-picker-epoch-confirm-button")).toBeTruthy();
    expect(screen.queryByTestId("admin-reset-picker-epoch-ok")).toBeNull();
    await act(async () => {
      resolve({ ok: true, new_epoch: 9 });
      await vi.advanceTimersByTimeAsync(0);
    });
    // settled: confirm row gone, banner shown
    expect(screen.queryByTestId("admin-reset-picker-epoch-confirm-button")).toBeNull();
    expect(screen.getByTestId("admin-reset-picker-epoch-ok")).toBeTruthy();
  });

  // PCR-1 item (d): the SUCCESS banner auto-dismisses after its window; the
  // refused banner persists until the admin acts on it.
  test("(d) success banner auto-dismisses after the window", async () => {
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      new_epoch: 3,
    });
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("admin-reset-picker-epoch-ok")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_001);
    });
    expect(screen.queryByTestId("admin-reset-picker-epoch-ok")).toBeNull();
  });

  test("(d) refused banner does NOT auto-dismiss", async () => {
    (resetPickerEpoch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      code: "PICKER_RESET_FORBIDDEN",
    });
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await act(async () => {
      fireEvent.click(confirmBtn());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByTestId("admin-reset-picker-epoch-refused")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(screen.getByTestId("admin-reset-picker-epoch-refused")).toBeTruthy();
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

  test("confirm → 4s auto-revert: returns to idle without invoking the action", () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    expect(confirmBtn()).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4_001);
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

// ---- Destructive-confirm pass (spec 2026-07-16-destructive-confirm-pass R3/F4) ----

function expectDestructiveRecipe(el: HTMLElement) {
  const tokens = el.className.split(/\s+/);
  for (const t of ["bg-warning-text", "text-warning-bg", "font-semibold", "hover:opacity-90"]) {
    expect(tokens).toContain(t);
  }
  for (const t of ["bg-accent", "bg-surface", "bg-bg"]) {
    expect(tokens).not.toContain(t);
  }
  expect(
    tokens
      .filter((t) => t.split(":").slice(0, -1).includes("hover"))
      .filter((t) => t.split(":").at(-1)!.startsWith("bg-")),
  ).toEqual([]);
}

describe("ResetPickerEpochButton — destructive recipe + focus-safe open/close (R3, F4)", () => {
  test("confirm-go carries the destructive recipe; cancel rejects both recipe tokens (C1/C2)", () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    expectDestructiveRecipe(confirmBtn());
    const cancelTokens = cancelBtn().className.split(/\s+/);
    expect(cancelTokens).not.toContain("bg-warning-text");
    expect(cancelTokens).not.toContain("text-warning-bg");
  });

  test("open focus (C3): entering confirm moves focus to the cancel button", async () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await vi.waitFor(() => expect(cancelBtn()).toHaveFocus());
  });

  test("close focus (C5): cancel activation returns focus to the re-mounted idle trigger", async () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await vi.waitFor(() => expect(cancelBtn()).toHaveFocus());
    fireEvent.click(cancelBtn());
    await vi.waitFor(() => expect(idleBtn()).toHaveFocus());
  });

  test("close focus (C5): auto-revert with focus inside the confirm row restores the trigger", async () => {
    render(<ResetPickerEpochButton showId={SHOW_ID} />);
    fireEvent.click(idleBtn());
    await vi.waitFor(() => expect(cancelBtn()).toHaveFocus());
    act(() => {
      vi.advanceTimersByTime(4_001);
    });
    await vi.waitFor(() => expect(idleBtn()).toHaveFocus());
  });

  test("close focus (C5): auto-revert with focus planted outside does NOT steal focus", async () => {
    render(
      <>
        <ResetPickerEpochButton showId={SHOW_ID} />
        <button type="button" data-testid="external-btn">
          elsewhere
        </button>
      </>,
    );
    fireEvent.click(idleBtn());
    await vi.waitFor(() => expect(cancelBtn()).toHaveFocus());
    const external = screen.getByTestId("external-btn");
    act(() => external.focus());
    act(() => {
      vi.advanceTimersByTime(4_001);
    });
    expect(external).toHaveFocus();
    expect(idleBtn()).not.toHaveFocus();
  });
});
