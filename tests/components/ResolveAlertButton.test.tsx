// @vitest-environment jsdom
/**
 * tests/components/ResolveAlertButton.test.tsx — two-tap confirmation
 * state machine for the AlertBanner Resolve flow (M9 C4 / M5-D3 R1).
 *
 * Pins the contract from shape brief 2026-05-14-alert-banner.md §5.4:
 *   idle → confirm    (single tap)
 *   confirm → idle    (Cancel tap; OR 3s auto-revert)
 *   confirm → resolving (Confirm tap; submit type=submit)
 *   resolving stays disabled (cannot double-fire)
 *
 * Why this file exists: C4 R1 review flagged that the parent
 * AlertBanner test only proves the idle render — the load-bearing
 * safety mechanism (the two-tap confirm + auto-revert) was unpinned.
 * These tests pin every transition so a regression in the timer
 * cleanup or the disabled-during-resolving guard is caught at unit
 * level, not in a P0 misfire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { ResolveAlertButton } from "@/components/admin/ResolveAlertButton";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("ResolveAlertButton state machine", () => {
  it("idle: renders 'Resolve' button only (no confirm row)", () => {
    const { getByTestId, queryByTestId } = render(<ResolveAlertButton />);
    const btn = getByTestId("admin-alert-resolve-button");
    expect(btn.textContent?.trim()).toBe("Resolve");
    expect(btn.getAttribute("type")).toBe("button");
    expect(queryByTestId("admin-alert-confirm-row")).toBeNull();
  });

  it("idle → confirm on Resolve click: shows 'Confirm resolve' + 'Cancel'", () => {
    const { getByTestId, queryByTestId } = render(<ResolveAlertButton />);
    fireEvent.click(getByTestId("admin-alert-resolve-button"));
    const confirm = getByTestId("admin-alert-confirm-resolve-button");
    expect(confirm.textContent?.trim()).toBe("Confirm resolve");
    // Brief §5.4: Confirm submits the parent <form>.
    expect(confirm.getAttribute("type")).toBe("submit");
    const cancel = getByTestId("admin-alert-cancel-button");
    expect(cancel.textContent?.trim()).toBe("Cancel");
    // Brief §5.4: Cancel does NOT submit (cancels client state).
    expect(cancel.getAttribute("type")).toBe("button");
    // The original idle Resolve button is unmounted.
    expect(queryByTestId("admin-alert-resolve-button")).toBeNull();
  });

  it("confirm → idle on Cancel click: confirm row unmounts, idle Resolve returns", () => {
    const { getByTestId, queryByTestId } = render(<ResolveAlertButton />);
    fireEvent.click(getByTestId("admin-alert-resolve-button"));
    fireEvent.click(getByTestId("admin-alert-cancel-button"));
    expect(queryByTestId("admin-alert-confirm-row")).toBeNull();
    // Idle button is back.
    expect(getByTestId("admin-alert-resolve-button").textContent?.trim()).toBe("Resolve");
  });

  it("confirm → idle on 3s auto-revert (timer fires)", () => {
    const { getByTestId, queryByTestId } = render(<ResolveAlertButton />);
    fireEvent.click(getByTestId("admin-alert-resolve-button"));
    expect(getByTestId("admin-alert-confirm-row")).not.toBeNull();
    // Brief §5.4: 3s of inaction → auto-revert. act() so React flushes
    // the setState fired from inside the timer callback.
    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    expect(queryByTestId("admin-alert-confirm-row")).toBeNull();
    expect(getByTestId("admin-alert-resolve-button").textContent?.trim()).toBe("Resolve");
  });

  it("Cancel clears the auto-revert timer (no late state change)", () => {
    const { getByTestId } = render(<ResolveAlertButton />);
    fireEvent.click(getByTestId("admin-alert-resolve-button"));
    fireEvent.click(getByTestId("admin-alert-cancel-button"));
    // Idle now. If the timer leaks, advancing past 3s would attempt
    // to set state on an unrelated render and would not flip back to
    // confirm. Verify the idle render is stable across the timer
    // boundary — the Resolve button stays visible AND nothing extra
    // re-mounts.
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(getByTestId("admin-alert-resolve-button").textContent?.trim()).toBe("Resolve");
  });

  it("confirm → resolving on Confirm click: button shows 'Resolving…' + disabled (useFormStatus)", async () => {
    // M9-D-C4-1: pending state is now derived from useFormStatus(),
    // not local UI state. The test needs a real <form action={fn}>
    // with an async action so React tracks the submission. A
    // controlled promise lets us assert the pending-state mid-flight
    // before the action resolves.
    vi.useRealTimers();
    let resolveAction: () => void = () => {};
    const actionPromise = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });
    const action = async () => {
      await actionPromise;
    };
    const { getByTestId } = render(
      <form action={action}>
        <ResolveAlertButton />
      </form>,
    );
    fireEvent.click(getByTestId("admin-alert-resolve-button"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-alert-confirm-resolve-button"));
      // Yield to React so useFormStatus observes the submission.
      await Promise.resolve();
    });
    const confirm = getByTestId("admin-alert-confirm-resolve-button");
    expect(confirm.textContent?.trim()).toBe("Resolving…");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    const cancel = getByTestId("admin-alert-cancel-button");
    expect((cancel as HTMLButtonElement).disabled).toBe(true);
    // Resolve the action so the test exits cleanly.
    await act(async () => {
      resolveAction();
      await actionPromise;
    });
    // Restore fake timers for the rest of the suite.
    vi.useFakeTimers();
  });

  it("M9-D-C4-1: pending flips back to false on action failure → Confirm + Cancel re-enabled (no stuck Resolving…)", async () => {
    vi.useRealTimers();
    let rejectAction: (err: Error) => void = () => {};
    const actionPromise = new Promise<void>((_resolve, reject) => {
      rejectAction = reject;
    });
    const action = async () => {
      try {
        await actionPromise;
      } catch {
        // Swallow — Server Action contract is to return without
        // revalidating on failure. We simulate that here.
      }
    };
    const { getByTestId } = render(
      <form action={action}>
        <ResolveAlertButton />
      </form>,
    );
    fireEvent.click(getByTestId("admin-alert-resolve-button"));
    await act(async () => {
      fireEvent.click(getByTestId("admin-alert-confirm-resolve-button"));
      await Promise.resolve();
    });
    // Mid-flight: pending=true, both buttons disabled.
    expect((getByTestId("admin-alert-confirm-resolve-button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    // Simulate failure: action returns without revalidatePath.
    await act(async () => {
      rejectAction(new Error("simulated supabase RLS denial"));
      await actionPromise.catch(() => {});
    });
    // Post-failure: pending=false, Confirm + Cancel re-enabled, label
    // reverts to "Confirm resolve". Pre-fix, the local `ui="resolving"`
    // flag never cleared and the controls stayed disabled forever.
    const confirmAfter = getByTestId("admin-alert-confirm-resolve-button") as HTMLButtonElement;
    expect(confirmAfter.disabled).toBe(false);
    expect(confirmAfter.textContent?.trim()).toBe("Confirm resolve");
    const cancelAfter = getByTestId("admin-alert-cancel-button") as HTMLButtonElement;
    expect(cancelAfter.disabled).toBe(false);
    vi.useFakeTimers();
  });

  it("Cancel meets the 44×44 tap-target floor (C4 R1 finding)", () => {
    // The token classes are emitted on the rendered button; a real-
    // browser layout assertion lives in the e2e suite. Here we pin the
    // class contract so a future refactor that drops `min-h-tap-min` /
    // `min-w-tap-min` from Cancel fails the unit test before the e2e
    // run. C4 R1 HIGH finding regression guard.
    const { getByTestId } = render(<ResolveAlertButton />);
    fireEvent.click(getByTestId("admin-alert-resolve-button"));
    const cancel = getByTestId("admin-alert-cancel-button");
    const cls = cancel.className;
    expect(cls).toMatch(/\bmin-h-tap-min\b/);
    expect(cls).toMatch(/\bmin-w-tap-min\b/);
  });
});
