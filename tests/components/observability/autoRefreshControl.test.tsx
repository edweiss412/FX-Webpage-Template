// @vitest-environment jsdom
// tests/components/observability/autoRefreshControl.test.tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { AutoRefreshControl } from "@/components/admin/observability/AutoRefreshControl";

beforeEach(() => {
  vi.useFakeTimers();
  refresh.mockClear();
  localStorage.clear();
  Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); // reset per test
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AutoRefreshControl", () => {
  test("default ON: a tick at scrollY<=200 calls router.refresh", () => {
    render(<AutoRefreshControl />);
    vi.advanceTimersByTime(20_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("scrolled past 200px: tick is skipped (no refresh)", () => {
    (window as unknown as { scrollY: number }).scrollY = 500;
    render(<AutoRefreshControl />);
    vi.advanceTimersByTime(20_000);
    expect(refresh).not.toHaveBeenCalled();
  });
  test("toggling OFF stops ticks; manual Refresh still works", () => {
    render(<AutoRefreshControl />);
    fireEvent.click(screen.getByTestId("autorefresh-toggle")); // → OFF
    vi.advanceTimersByTime(40_000);
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("autorefresh-manual"));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("OFF + becoming visible does NOT refresh", () => {
    render(<AutoRefreshControl />);
    fireEvent.click(screen.getByTestId("autorefresh-toggle")); // OFF
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
  });
  test("toggling OFF then ON fires an immediate refresh on the ON transition (§6.3)", () => {
    render(<AutoRefreshControl />);
    fireEvent.click(screen.getByTestId("autorefresh-toggle")); // ON→OFF (no refresh)
    expect(refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("autorefresh-toggle")); // OFF→ON → immediate refresh
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("manual refresh shows the 'Updated …s ago' indicator", () => {
    render(<AutoRefreshControl />);
    expect(screen.queryByTestId("autorefresh-updated")).toBeNull();
    fireEvent.click(screen.getByTestId("autorefresh-manual"));
    expect(screen.getByTestId("autorefresh-updated")).toBeInTheDocument();
  });
  test("persisted OFF: initial localStorage=off → no tick, toggle shows off", () => {
    localStorage.setItem("fxav.observability.autorefresh", "off");
    render(<AutoRefreshControl />);
    vi.advanceTimersByTime(40_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByTestId("autorefresh-toggle").getAttribute("aria-pressed")).toBe("false");
  });
  test("hidden tab: tick is SKIPPED even when ON", () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    render(<AutoRefreshControl />);
    vi.advanceTimersByTime(20_000);
    expect(refresh).not.toHaveBeenCalled();
  });
  test("hidden→visible fires one immediate refresh when ON", () => {
    render(<AutoRefreshControl />); // ON
    document.dispatchEvent(new Event("visibilitychange")); // visibilityState is 'visible' (beforeEach)
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  test("hidden→visible while scrolled past 200px does NOT refresh (scroll gate applies to resume)", () => {
    (window as unknown as { scrollY: number }).scrollY = 500;
    render(<AutoRefreshControl />); // ON, but scrolled down reading older events
    document.dispatchEvent(new Event("visibilitychange")); // visibilityState is 'visible' (beforeEach)
    expect(refresh).not.toHaveBeenCalled();
  });
  test("unmount clears the interval + visibility listener (no refresh after unmount)", () => {
    const { unmount } = render(<AutoRefreshControl />);
    unmount();
    vi.advanceTimersByTime(60_000);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(refresh).not.toHaveBeenCalled();
  });
});
