// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
const h = vi.hoisted(() => ({ captureBoundaryError: vi.fn() }));
vi.mock("@/lib/observe/captureBoundaryError", () => ({ captureBoundaryError: h.captureBoundaryError }));
import CrewError from "@/app/show/[slug]/[shareToken]/error";
const { captureBoundaryError } = h;
afterEach(() => {
  cleanup();
  captureBoundaryError.mockReset();
});

describe("crew error boundary", () => {
  test("captures with area=crew on mount and renders crew copy + try-again", () => {
    const reset = vi.fn();
    const err = Object.assign(new Error("boom"), { digest: "d2" });
    render(<CrewError error={err} reset={reset} />);
    expect(captureBoundaryError).toHaveBeenCalledWith(err, "crew");
    expect(screen.getByText(/try reloading/i)).toBeInTheDocument(); // PAGE_RENDER_FAILED crewFacing
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(reset).toHaveBeenCalled();
  });
});
