// @vitest-environment jsdom
// tests/help/step.test.tsx
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Step } from "@/app/help/_components/Step";

afterEach(() => cleanup());

describe("<Step>", () => {
  it("renders the step number prominently", () => {
    render(<Step n={3}>Click Share.</Step>);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Click Share.")).toBeInTheDocument();
  });

  it("uses tabular figures for the number", () => {
    render(<Step n={10}>x</Step>);
    const num = screen.getByText("10");
    expect(num.className).toMatch(/tabular-nums/);
  });
});
