// @vitest-environment jsdom
/**
 * tests/components/admin/hoverHelpEscapeContainment.test.tsx
 * (spec 2026-07-20-show-alert-compact §3.2)
 *
 * A help popover inside the review modal must swallow its own Escape. Without
 * containment, one Escape closes BOTH the popover and the whole modal.
 *
 * What makes this test load-bearing: it asserts the shell's close callback is
 * NOT called, exercising the real document-level native listener that
 * `ReviewModalShell` installs (ReviewModalShell.tsx:238-250). Two weaker
 * assertions are deliberately avoided:
 *
 *   - `defaultPrevented` proves nothing — the shell's handler never inspects
 *     it and closes unconditionally.
 *   - a spy on a React parent handler proves only synthetic-tree containment,
 *     not that the native document boundary was respected.
 *
 * Containment rests entirely on `stopPropagation`: React attaches synthetic
 * handlers at the root container, which sits BELOW `document`, so stopping
 * propagation there keeps the native event from ever reaching the shell.
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { HoverHelp } from "@/components/admin/HoverHelp";
import { ReviewModalShell } from "@/components/admin/review/ReviewModalShell";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(""),
}));

/** Exit-transition settle window; see the negative assertion below. */
const SETTLE_MS = 600;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Harness({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  return (
    <ReviewModalShell
      open
      onClose={onClose}
      labelledBy="harness-heading"
      dataAttrPrefix="review-modal"
      testIdBase="harness"
      initialFocusRef={closeRef}
      header={
        <h2 id="harness-heading">
          Harness
          <button type="button" ref={closeRef}>
            Close
          </button>
        </h2>
      }
    >
      <HoverHelp label="What does this mean?" testId="harness-help">
        Body copy for the popover.
      </HoverHelp>
    </ReviewModalShell>
  );
}

describe("HoverHelp Escape containment inside ReviewModalShell (§3.2)", () => {
  test("Escape from an OPEN popover closes the popover and NOT the modal", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const trigger = screen.getByTestId("harness-help-trigger");
    fireEvent.click(trigger);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));

    // Dispatch from inside the popover subtree, the way a real keypress
    // arrives while focus sits on the trigger.
    fireEvent.keyDown(trigger, { key: "Escape" });

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));

    // The shell's close is NOT synchronous: `requestClose` commits a dismiss and
    // fires `onClose` at the end of an exit transition. Asserting immediately
    // after the popover closes therefore passes even when the modal IS closing —
    // a vacuous green this test hit on its first run. Settle past the exit
    // window before the negative assertion (measured: the shell fires onClose
    // within ~400ms in jsdom; SETTLE_MS is comfortably beyond it).
    await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

    // THE load-bearing assertion: the modal survived.
    expect(onClose).not.toHaveBeenCalled();
  });

  test("Escape with the popover CLOSED still reaches the modal", async () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    const trigger = screen.getByTestId("harness-help-trigger");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(document, { key: "Escape" });

    // Regression guard: containment must not become a blanket Escape swallow.
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});
