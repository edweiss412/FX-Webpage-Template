// @vitest-environment jsdom
/**
 * tests/components/RotateShareTokenButton.test.tsx
 *
 * Pins the two-tap state machine + the CONFIRMATION-ONLY success banner. The
 * new-URL / Copy / email affordances moved to the always-current share-link card
 * (the ShareHub popover, share-hub T4), which this button drives via
 * onRotated(newToken, newEpoch).
 * The action invocation is mocked; the typed return shape (new_share_token +
 * new_epoch) drives the success branch.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

vi.mock("@/lib/auth/picker/rotateShareToken", () => ({
  rotateShareToken: vi.fn(),
}));

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

import { RotateShareTokenButton } from "@/app/admin/show/[slug]/RotateShareTokenButton";
import { rotateShareToken } from "@/lib/auth/picker/rotateShareToken";

const SHOW_ID = "11111111-1111-1111-1111-111111111111";
const SLUG = "sample-show";
const NEW_TOKEN = "a".repeat(64);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

const idleBtn = () => screen.getByTestId("admin-rotate-share-token-button") as HTMLButtonElement;
const confirmBtn = () =>
  screen.getByTestId("admin-rotate-share-token-confirm-button") as HTMLButtonElement;
const cancelBtn = () =>
  screen.getByTestId("admin-rotate-share-token-cancel-button") as HTMLButtonElement;

const mockRotateOk = () =>
  (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    new_share_token: NEW_TOKEN,
    new_epoch: 9,
  });

const clickThroughConfirm = async () => {
  fireEvent.click(idleBtn());
  await act(async () => {
    fireEvent.click(confirmBtn());
    vi.useRealTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe("RotateShareTokenButton — two-tap state machine", () => {
  test("idle: shows 'Rotate share-token' label", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    expect(idleBtn().textContent).toContain("Rotate share-token");
  });

  test("compact: descriptive accessible name + aria-describedby to the row description", () => {
    render(
      <RotateShareTokenButton
        showId={SHOW_ID}
        slug={SLUG}
        compact
        rowLabel="Rotate share link"
        rowDescription="Mint a new link; the old one stops working immediately."
      />,
    );
    const btn = screen.getByRole("button", { name: /rotate share link/i });
    expect(btn).toBe(idleBtn());
    expect(btn.textContent).toContain("Rotate");
    const descId = btn.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    expect(document.getElementById(descId!)?.textContent ?? "").toMatch(/old one stops working/i);
  });

  test("compact confirm: Confirm/Cancel render full-width below the label, not beside it", () => {
    render(
      <RotateShareTokenButton
        showId={SHOW_ID}
        slug={SLUG}
        compact
        rowLabel="Rotate share link"
        rowDescription="Mint a new link; the old one stops working immediately."
      />,
    );
    fireEvent.click(screen.getByTestId("admin-rotate-share-token-button"));
    const confirmRow = screen.getByTestId("admin-rotate-share-token-confirm-row");
    const cBtn = screen.getByTestId("admin-rotate-share-token-confirm-button");
    expect(confirmRow.contains(cBtn)).toBe(true);
    expect(confirmRow.textContent).toMatch(/rotate share link/i);
    expect(cBtn.closest('[class*="justify-between"]')).toBeNull();
  });

  test("idle → confirm: tap reveals confirm + cancel + URL-will-change warning", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    const group = screen.getByTestId("admin-rotate-share-token-confirm-row");
    expect(group.getAttribute("role")).toBe("group");
    expect(group.textContent).toMatch(/existing show URL.*stop working/i);
    expect(confirmBtn()).toBeTruthy();
    expect(cancelBtn()).toBeTruthy();
  });

  test("confirm → cancel: returns to idle without invoking the action", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    fireEvent.click(cancelBtn());
    expect(idleBtn()).toBeTruthy();
    expect(rotateShareToken).not.toHaveBeenCalled();
  });

  test("confirm → 4s auto-revert: returns to idle without invoking the action", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    expect(confirmBtn()).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4_001);
    });
    expect(idleBtn()).toBeTruthy();
    expect(rotateShareToken).not.toHaveBeenCalled();
  });

  test("confirm warning discloses the re-pick consequence", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    const warning = document.getElementById("admin-rotate-share-token-warning");
    expect(warning?.textContent).toBe(
      "The existing show URL will stop working. Every crew member will need the new URL and will have to re-pick their name.",
    );
  });
});

describe("RotateShareTokenButton — confirmation-only success banner + onRotated", () => {
  test("success (active): invokes rotateShareToken, calls onRotated(token, epoch), refreshes, and the banner has NO URL/Copy/email", async () => {
    mockRotateOk();
    const onRotated = vi.fn();
    render(
      <RotateShareTokenButton
        showId={SHOW_ID}
        slug={SLUG}
        isCrewLinkActive
        onRotated={onRotated}
      />,
    );
    await clickThroughConfirm();

    expect(rotateShareToken).toHaveBeenCalledWith({ showId: SHOW_ID });
    await waitFor(() => screen.getByTestId("admin-rotate-share-token-ok"));

    // confirmation-only banner: the re-pick line, no copyable URL, no Copy, no email
    expect(screen.getByTestId("admin-rotate-share-token-ok").textContent).toContain(
      "no longer works and everyone will re-pick their name",
    );
    expect(screen.queryByTestId("admin-rotate-share-token-url")).toBeNull();
    expect(screen.queryByTestId("admin-rotate-share-token-copy-button")).toBeNull();
    expect(screen.queryByTestId("admin-rotate-share-token-copy-announce")).toBeNull();
    expect(screen.queryByTestId("admin-rotate-share-token-email-button")).toBeNull();
    expect(screen.queryByTestId("admin-rotate-share-token-email-note")).toBeNull();

    // the new token+epoch flow to the shared cache, and the server re-renders
    expect(onRotated).toHaveBeenCalledTimes(1);
    expect(onRotated).toHaveBeenCalledWith(NEW_TOKEN, 9);
    await waitFor(() => expect(refreshMock).toHaveBeenCalledTimes(1));
  });

  test("failure result: refused banner (role=alert), onRotated NOT called, no refresh", async () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
    const onRotated = vi.fn();
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} onRotated={onRotated} />);
    await clickThroughConfirm();

    const refused = await waitFor(() => screen.getByTestId("admin-rotate-share-token-refused"));
    expect(refused.getAttribute("role")).toBe("alert");
    expect(refused.textContent).toContain("Couldn't rotate");
    expect(refused.textContent).not.toMatch(/last attempt/i);
    expect(onRotated).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  test("a THROWN action settles to the refused banner (no stranded resolving row)", async () => {
    // Class-sweep gap: PickerResetControl.tsx and CrewRowActions.tsx both carry
    // a try/catch for this ("review R2 class-sweep of the CrewRowActions
    // thrown-action fix"); rotate was missed. Without the guard `result` stays
    // null, so the `ui === "resolving"` exit effect never fires and the control
    // strands forever — and once ShareHub gates dismissal on a busy signal
    // derived from that state, the popover can no longer be closed at all.
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("network death"),
    );
    const onRotated = vi.fn();
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} onRotated={onRotated} />);
    await clickThroughConfirm();

    const refused = await waitFor(() => screen.getByTestId("admin-rotate-share-token-refused"));
    expect(refused.getAttribute("role")).toBe("alert");
    expect(refused.textContent).toContain("Couldn't rotate");
    // Left `resolving`: the idle trigger is back, so the row is usable again.
    expect(screen.getByTestId("admin-rotate-share-token-button")).toBeTruthy();
    expect(screen.queryByTestId("admin-rotate-share-token-confirm-row")).toBeNull();
    expect(onRotated).not.toHaveBeenCalled();
    expect(refreshMock).not.toHaveBeenCalled();
  });

  describe("onBusyChange (ShareHub busy contract, spec §6)", () => {
    // The hub gates ALL FOUR dismissal paths on this signal. A missing rising
    // edge lets a trigger click unmount a rotate mid-flight — the rotation still
    // lands, killing the crew's old link, with no confirmation shown. A missing
    // falling edge wedges the popover shut.
    test("reports busy true on entering resolving and false on SUCCESS", async () => {
      mockRotateOk();
      const onBusyChange = vi.fn();
      render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} onBusyChange={onBusyChange} />);
      await clickThroughConfirm();
      await waitFor(() => screen.getByTestId("admin-rotate-share-token-ok"));
      const busyEdges = onBusyChange.mock.calls.map((c) => c[0]);
      expect(busyEdges).toContain(true);
      expect(busyEdges[busyEdges.length - 1]).toBe(false);
    });

    test("reports busy false on a RETURNED error", async () => {
      (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        code: "PICKER_RESOLVER_LOOKUP_FAILED",
      });
      const onBusyChange = vi.fn();
      render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} onBusyChange={onBusyChange} />);
      await clickThroughConfirm();
      await waitFor(() => screen.getByTestId("admin-rotate-share-token-refused"));
      const busyEdges = onBusyChange.mock.calls.map((c) => c[0]);
      expect(busyEdges).toContain(true);
      expect(busyEdges[busyEdges.length - 1]).toBe(false);
    });

    test("reports busy false on a THROWN action (reachable only because T1 landed)", async () => {
      (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("network death"),
      );
      const onBusyChange = vi.fn();
      render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} onBusyChange={onBusyChange} />);
      await clickThroughConfirm();
      await waitFor(() => screen.getByTestId("admin-rotate-share-token-refused"));
      const busyEdges = onBusyChange.mock.calls.map((c) => c[0]);
      expect(busyEdges).toContain(true);
      expect(busyEdges[busyEdges.length - 1]).toBe(false);
    });

    test("prop-less usage is unchanged", async () => {
      mockRotateOk();
      render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
      await clickThroughConfirm();
      await waitFor(() => screen.getByTestId("admin-rotate-share-token-ok"));
      expect(screen.getByTestId("admin-rotate-share-token-button")).toBeTruthy();
    });
  });

  test("re-entering confirm clears a stale refused banner (no zombie state)", async () => {
    (rotateShareToken as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      code: "PICKER_RESOLVER_LOOKUP_FAILED",
    });
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    await clickThroughConfirm();
    await waitFor(() =>
      expect(screen.getByTestId("admin-rotate-share-token-refused")).toBeTruthy(),
    );
    vi.useFakeTimers();
    fireEvent.click(idleBtn());
    expect(screen.queryByTestId("admin-rotate-share-token-refused")).toBeNull();
  });

  test("inactive crew link (isCrewLinkActive=false): rotated-inactive message, onRotated NOT called", async () => {
    mockRotateOk();
    const onRotated = vi.fn();
    render(
      <RotateShareTokenButton
        showId={SHOW_ID}
        slug={SLUG}
        isCrewLinkActive={false}
        onRotated={onRotated}
      />,
    );
    await clickThroughConfirm();
    await waitFor(() => screen.getByTestId("admin-rotate-share-token-ok-inactive"));
    expect(onRotated).not.toHaveBeenCalled();
    expect(screen.queryByTestId("admin-rotate-share-token-ok")).toBeNull();
  });
});

// ---- Destructive-confirm pass (spec 2026-07-16-destructive-confirm-pass R2/F4) ----

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

describe("RotateShareTokenButton — destructive recipe + focus-safe open/close (R2, F4)", () => {
  test("confirm-go carries the destructive recipe; cancel rejects both recipe tokens (C1/C2)", () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    expectDestructiveRecipe(confirmBtn());
    const cancelTokens = cancelBtn().className.split(/\s+/);
    expect(cancelTokens).not.toContain("bg-warning-text");
    expect(cancelTokens).not.toContain("text-warning-bg");
  });

  test("open focus (C3): entering confirm moves focus to the cancel button", async () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    await vi.waitFor(() => expect(cancelBtn()).toHaveFocus());
  });

  test("close focus (C5): cancel activation returns focus to the re-mounted idle trigger", async () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
    fireEvent.click(idleBtn());
    await vi.waitFor(() => expect(cancelBtn()).toHaveFocus());
    fireEvent.click(cancelBtn());
    await vi.waitFor(() => expect(idleBtn()).toHaveFocus());
  });

  test("close focus (C5): auto-revert with focus inside the confirm row restores the trigger", async () => {
    render(<RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />);
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
        <RotateShareTokenButton showId={SHOW_ID} slug={SLUG} />
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
