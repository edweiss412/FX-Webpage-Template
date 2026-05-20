// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ScreenshotPlaceholder } from "@/app/help/_components/ScreenshotPlaceholder";

afterEach(() => cleanup());

describe("<ScreenshotPlaceholder>", () => {
  it("renders the alt text inside an explicit 'screenshot pending' label", () => {
    render(<ScreenshotPlaceholder alt="Dashboard with yellow review badge" />);
    expect(screen.getByText(/screenshot pending/i)).toBeInTheDocument();
    expect(screen.getByText(/dashboard with yellow review badge/i)).toBeInTheDocument();
  });

  it("renders with role='img' and aria-label", () => {
    render(<ScreenshotPlaceholder alt="X" />);
    const el = screen.getByRole("img");
    expect(el).toHaveAttribute("aria-label", "X");
  });
});
