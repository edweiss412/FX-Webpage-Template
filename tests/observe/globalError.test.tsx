// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
const h = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({
  captureBoundaryError: h.captureBoundaryError,
}));
import GlobalError from "@/app/global-error";
const { captureBoundaryError } = h;
afterEach(() => {
  cleanup();
  captureBoundaryError.mockReset();
});

describe("global-error", () => {
  test("captures with area=root on mount and renders crew copy + reload", () => {
    const reset = vi.fn();
    const err = Object.assign(new Error("boom"), { digest: "d9" });
    render(<GlobalError error={err} reset={reset} />);
    expect(captureBoundaryError).toHaveBeenCalledWith(err, "root");
    expect(screen.getByText(/try reloading/i)).toBeInTheDocument(); // PAGE_RENDER_FAILED crewFacing
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));
    expect(reset).toHaveBeenCalled();
  });
});
