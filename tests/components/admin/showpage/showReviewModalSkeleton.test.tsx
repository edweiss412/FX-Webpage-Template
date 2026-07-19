/**
 * @vitest-environment jsdom
 */
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  DRAG_DISMISS_THRESHOLD_PX,
  DURATION_NORMAL_FALLBACK_MS,
  EXIT_FALLBACK_BUFFER_MS,
} from "@/components/admin/review/ReviewModalShell";
import { ShowReviewModalSkeleton } from "@/components/admin/showpage/ShowReviewModalSkeleton";

const TB = "published-show-review";

// useShowModalNav → useRouter/useSearchParams (unified mock, pattern:
// publishedReviewModal.test.tsx). The skeleton's default close must push
// the show-stripped URL with { scroll: false }.
const { routerPush } = vi.hoisted(() => ({ routerPush: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: routerPush }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams("show=some-show&bucket=archived"),
}));

/** Force the reduced-motion branch (tests/setup.ts stubs matchMedia with
 *  matches:false = motion enabled, so exits otherwise resolve on timers). */
function withReducedMotion(run: () => void) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  try {
    run();
  } finally {
    window.matchMedia = original;
  }
}

afterEach(() => {
  vi.useRealTimers();
  routerPush.mockClear();
  cleanup();
});

describe("server-fallback usage (no onClose): default nav-close (spec §2.1)", () => {
  it("Esc under reduced motion hides the dialog and pushes the show-stripped URL", () => {
    withReducedMotion(() => {
      render(<ShowReviewModalSkeleton />);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(document, { key: "Escape" });
      // bucket survives; show (+alert_id) stripped; dashboard stays put.
      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(routerPush).toHaveBeenCalledWith("/admin?bucket=archived", { scroll: false });
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  it("scrim click under reduced motion closes the same way", () => {
    withReducedMotion(() => {
      render(<ShowReviewModalSkeleton />);
      fireEvent.click(screen.getByTestId(`${TB}-backdrop`));
      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });

  // Spec R1 F3 / R2 F1 — the race window itself. Motion enabled (setup.ts
  // default): the nav must be issued at dismiss-COMMIT, not exit-end, for BOTH
  // the requestClose path (Esc) and the drag branch that bypasses it.
  it("Esc with motion enabled pushes IMMEDIATELY (dismiss-commit), hide lands at exit-end", () => {
    vi.useFakeTimers();
    render(<ShowReviewModalSkeleton />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(routerPush).toHaveBeenCalledTimes(1); // BEFORE any timer runs
    expect(screen.getByRole("dialog")).toBeInTheDocument(); // exit in flight
    act(() => vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + EXIT_FALLBACK_BUFFER_MS + 10));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  it("drag past threshold pushes at RELEASE, before the exit transition resolves", () => {
    vi.useFakeTimers();
    render(<ShowReviewModalSkeleton />);
    const grab = screen.getByTestId(`${TB}-grab`);
    const endY = 100 + DRAG_DISMISS_THRESHOLD_PX + 30;
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: endY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: endY });
    expect(routerPush).toHaveBeenCalledTimes(1); // at release
    act(() => vi.advanceTimersByTime(DURATION_NORMAL_FALLBACK_MS + 10));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  it("Suspense swap mid-exit cannot lose the close: push already issued, unmount is clean", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ShowReviewModalSkeleton />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(routerPush).toHaveBeenCalledTimes(1);
    unmount(); // what the fallback→content swap does, before exit-end
    act(() => vi.runAllTimers()); // late fallback timer must not double-close or throw
    expect(routerPush).toHaveBeenCalledTimes(1);
  });

  // Spec §5 (plan-R1 F3): the drag branch bypasses requestClose — its
  // dismiss-commit push must survive an unmount-mid-transition too.
  it("drag dismiss + Suspense swap mid-transition: push already issued, no double push", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ShowReviewModalSkeleton />);
    const grab = screen.getByTestId(`${TB}-grab`);
    const endY = 100 + DRAG_DISMISS_THRESHOLD_PX + 30;
    fireEvent.pointerDown(grab, { pointerId: 1, clientY: 100 });
    fireEvent.pointerMove(grab, { pointerId: 1, clientY: endY });
    fireEvent.pointerUp(grab, { pointerId: 1, clientY: endY });
    expect(routerPush).toHaveBeenCalledTimes(1); // at release (dismiss-commit)
    unmount(); // swap before the translateY transition resolves
    act(() => vi.runAllTimers());
    expect(routerPush).toHaveBeenCalledTimes(1);
  });
});

describe("client optimistic usage (real onClose): prop path unchanged", () => {
  it("Esc calls the passed onClose once and never touches the router", () => {
    withReducedMotion(() => {
      const onClose = vi.fn();
      render(<ShowReviewModalSkeleton onClose={onClose} />);
      fireEvent.keyDown(document, { key: "Escape" });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(routerPush).not.toHaveBeenCalled();
    });
  });
});

describe("real X (spec §2.2)", () => {
  it("renders the shared ModalCloseButton, focused initially, outside any aria-hidden subtree", () => {
    render(<ShowReviewModalSkeleton />);
    const x = screen.getByTestId(`${TB}-close`);
    expect(x).toHaveAttribute("aria-label", "Close");
    expect(x.closest("[aria-hidden]")).toBeNull();
    expect(x).toHaveFocus(); // useDialogFocus initialFocusRef contract
  });

  it("X click closes via the default nav-close in the server-fallback usage", () => {
    withReducedMotion(() => {
      render(<ShowReviewModalSkeleton />);
      fireEvent.click(screen.getByTestId(`${TB}-close`));
      expect(routerPush).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("skeleton owns the closed→open entrance (§6.5)", () => {
  // The loaded modal suppresses the shell entrance (in-place swap, §6.5) —
  // which is only sound because THIS frame plays it.
  it("renders WITHOUT the entrance-suppression attr in both usages", () => {
    render(<ShowReviewModalSkeleton />);
    expect(document.querySelector("[data-review-modal-entrance]")).toBeNull();
    cleanup();
    render(<ShowReviewModalSkeleton onClose={() => {}} />);
    expect(document.querySelector("[data-review-modal-entrance]")).toBeNull();
  });
});
