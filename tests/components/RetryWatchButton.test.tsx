// @vitest-environment jsdom
/**
 * tests/components/RetryWatchButton.test.tsx — single-tap Retry submit button
 * for the WATCH_CHANNEL_ORPHANED action slot (spec §3.4.2).
 *
 * Contract pinned here:
 *   idle    → [ Retry now ] submit button (type="submit", not disabled).
 *   pending → [ Retrying… ] + disabled + aria-busy, derived ONLY from
 *             useFormStatus() (child-of-form) — NO local flag.
 *
 * The pending state is load-bearing: unlike ResolveAlertButton there is no
 * two-tap confirm here (retry is idempotent/safe), so the ONLY dynamic state
 * is the form-submission lifecycle. The M9-D-C4-1 regression guard applies:
 * pending must flip back to false when the Server Action returns WITHOUT a
 * revalidate (a local `submitting` flag would stick "Retrying…" forever).
 */
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

import { RetryWatchButton } from "@/components/admin/RetryWatchButton";

afterEach(() => {
  cleanup();
});

describe("RetryWatchButton", () => {
  it("idle: renders 'Retry now' as a submit button, not disabled, aria-busy false", () => {
    const { getByTestId } = render(
      <form action={() => {}}>
        <RetryWatchButton />
      </form>,
    );
    const btn = getByTestId("admin-alert-retry-button") as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe("Retry now");
    expect(btn.getAttribute("type")).toBe("submit");
    expect(btn.disabled).toBe(false);
    expect(btn.getAttribute("aria-busy")).toBe("false");
  });

  it("custom idleLabel + testId props override the banner defaults (Settings reuse)", () => {
    const { getByTestId } = render(
      <form action={() => {}}>
        <RetryWatchButton idleLabel="Retry connection" testId="drive-connection-retry-button" />
      </form>,
    );
    const btn = getByTestId("drive-connection-retry-button");
    expect(btn.textContent?.trim()).toBe("Retry connection");
  });

  it("pending: submitting the form flips label to 'Retrying…' + disabled + aria-busy (useFormStatus)", async () => {
    // A controlled promise holds the action open so the pending paint is
    // observable mid-flight before the action resolves.
    let resolveAction: () => void = () => {};
    const actionPromise = new Promise<void>((resolve) => {
      resolveAction = resolve;
    });
    const action = async () => {
      await actionPromise;
    };
    const { getByTestId } = render(
      <form action={action}>
        <RetryWatchButton />
      </form>,
    );
    await act(async () => {
      fireEvent.click(getByTestId("admin-alert-retry-button"));
      // Yield to React so useFormStatus observes the submission.
      await Promise.resolve();
    });
    const btn = getByTestId("admin-alert-retry-button") as HTMLButtonElement;
    expect(btn.textContent?.trim()).toBe("Retrying…");
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("aria-busy")).toBe("true");
    // Resolve so the test exits cleanly.
    await act(async () => {
      resolveAction();
      await actionPromise;
    });
  });

  it("M9-D-C4-1: pending flips back to false when the action returns without revalidate (no stuck 'Retrying…')", async () => {
    let rejectAction: (err: Error) => void = () => {};
    const actionPromise = new Promise<void>((_resolve, reject) => {
      rejectAction = reject;
    });
    const action = async () => {
      try {
        await actionPromise;
      } catch {
        // Server Action contract on failure: return without revalidating.
      }
    };
    const { getByTestId } = render(
      <form action={action}>
        <RetryWatchButton />
      </form>,
    );
    await act(async () => {
      fireEvent.click(getByTestId("admin-alert-retry-button"));
      await Promise.resolve();
    });
    // Mid-flight: pending=true.
    expect((getByTestId("admin-alert-retry-button") as HTMLButtonElement).disabled).toBe(true);
    // Action returns (rejected/handled) without revalidatePath.
    await act(async () => {
      rejectAction(new Error("simulated retry infra fault"));
      await actionPromise.catch(() => {});
    });
    // Post-return: pending=false, label reverts, button re-enabled. A local
    // `submitting` flag would keep it disabled + "Retrying…" forever.
    const after = getByTestId("admin-alert-retry-button") as HTMLButtonElement;
    expect(after.disabled).toBe(false);
    expect(after.textContent?.trim()).toBe("Retry now");
    expect(after.getAttribute("aria-busy")).toBe("false");
  });

  it("tap-target: emits min-h-tap-min + min-w-tap-min token floor", () => {
    const { getByTestId } = render(
      <form action={() => {}}>
        <RetryWatchButton />
      </form>,
    );
    const cls = getByTestId("admin-alert-retry-button").className;
    expect(cls).toMatch(/\bmin-h-tap-min\b/);
    expect(cls).toMatch(/\bmin-w-tap-min\b/);
  });

  it("ring-offset matches the host surface (default warning-bg; surface override)", () => {
    // impeccable audit P2: hardcoded warning-bg offset painted a warm gap on
    // the Settings surface card. The offset must follow the AccentButton
    // contract ("match the surface the button sits on").
    const { getByTestId, unmount } = render(
      <form action={() => {}}>
        <RetryWatchButton />
      </form>,
    );
    expect(getByTestId("admin-alert-retry-button").className).toContain("ring-offset-warning-bg");
    unmount();
    const { getByTestId: get2 } = render(
      <form action={() => {}}>
        <RetryWatchButton testId="drive-connection-retry-button" ringOffset="surface" />
      </form>,
    );
    expect(get2("drive-connection-retry-button").className).toContain("ring-offset-surface");
  });
});
