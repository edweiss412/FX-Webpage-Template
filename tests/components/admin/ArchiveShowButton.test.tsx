// @vitest-environment jsdom
/**
 * tests/components/admin/ArchiveShowButton.test.tsx (M12.2 Phase B2 Task 7.2)
 *
 * Two-tap Archive control (spec §2.2). Contract:
 *   - resting: a single [Archive] button.
 *   - tap 1 → morphs the SAME box to the links-dead confirm copy (no dispatch).
 *   - tap 2 (Confirm) → dispatches the form action exactly once.
 *   - one tap alone does NOT dispatch.
 *   - 4s idle reverts armed → resting (no dispatch).
 *   - the submit button disables on useFormStatus().pending, NOT synchronously
 *     in its own onClick — the React 19 form-action cancel lesson (B1 revoke
 *     hang): a self-disabling submit cancels the dispatch (0 POSTs). We assert
 *     the dispatch fires (action called) AND that the button has no synchronous
 *     onClick-disable.
 *   - on a successful action result → router.refresh().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { ArchiveShowButton } from "@/components/admin/ArchiveShowButton";

const CONFIRM_COPY =
  "Confirm archive — crew links stop working now and won't come back until you re-publish and issue a new link.";

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ArchiveShowButton — two-tap, isPending-safe (Task 7.2)", () => {
  it("resting shows [Archive]; tap 1 morphs to the links-dead confirm copy WITHOUT dispatching", async () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} />);

    expect(getByTestId("archive-show-button").textContent).toContain("Archive");

    await act(async () => {
      fireEvent.click(getByTestId("archive-show-button"));
    });

    const confirm = getByTestId("archive-show-confirm-button");
    // Curly apostrophe per DESIGN typography; normalize for the assertion.
    expect((confirm.textContent ?? "").replace(/’/g, "'")).toContain(
      CONFIRM_COPY.replace(/’/g, "'"),
    );
    expect(action).not.toHaveBeenCalled();
  });

  it("tap 2 (Confirm) dispatches the action exactly once and refreshes on success", async () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} />);

    await act(async () => {
      fireEvent.click(getByTestId("archive-show-button"));
    });
    await act(async () => {
      fireEvent.click(getByTestId("archive-show-confirm-button"));
    });

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("4s idle reverts armed → resting and never dispatches", async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId, queryByTestId } = render(<ArchiveShowButton archiveAction={action} />);

    fireEvent.click(getByTestId("archive-show-button"));
    expect(getByTestId("archive-show-confirm-button")).not.toBeNull();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });

    expect(queryByTestId("archive-show-confirm-button")).toBeNull();
    expect(getByTestId("archive-show-button")).not.toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("the confirm submit button has NO synchronous self-disabling onClick (React 19 dispatch safety)", async () => {
    // Negative-regression for the B1 revoke-hang: if the confirm button
    // setState-disabled itself in its own onClick, the form-action dispatch
    // would be cancelled and `action` would never run. We prove the dispatch
    // fires (covered above) AND that the resting button is type=button while
    // the confirm button is type=submit (the dispatch vector).
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} />);

    expect((getByTestId("archive-show-button") as HTMLButtonElement).type).toBe("button");
    fireEvent.click(getByTestId("archive-show-button"));
    expect((getByTestId("archive-show-confirm-button") as HTMLButtonElement).type).toBe("submit");
  });

  // M12.5 — the compact footer variant must still honor the 44px tap-target
  // floor (DESIGN.md) on BOTH the resting and armed confirm buttons; the
  // adversarial review flagged the first compact pass for dropping it.
  it("compact variant keeps the 44px tap-target floor on resting + confirm buttons", () => {
    const action = vi.fn(async () => ({ ok: true }) as const);
    const { getByTestId } = render(<ArchiveShowButton archiveAction={action} compact />);
    const resting = getByTestId("archive-show-button");
    expect(resting.className).toContain("min-h-tap-min");
    expect(resting.className).toContain("min-w-tap-min");
    fireEvent.click(resting);
    const confirm = getByTestId("archive-show-confirm-button");
    expect(confirm.className).toContain("min-h-tap-min");
    expect(confirm.className).toContain("min-w-tap-min");
  });
});
