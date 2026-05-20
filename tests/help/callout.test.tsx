// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Callout } from "@/app/help/_components/Callout";

afterEach(() => cleanup());

describe("<Callout>", () => {
  it("renders children", () => {
    render(<Callout type="note">Hello world</Callout>);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it.each(["note", "warning", "tip"] as const)("variant '%s' renders with role status", (t) => {
    render(<Callout type={t}>x</Callout>);
    expect(screen.getByRole(t === "warning" ? "alert" : "note")).toBeInTheDocument();
  });

  it("defaults to 'note' for unknown type (spec §6.3 guard)", () => {
    // @ts-expect-error — intentionally passing an invalid type for the runtime guard.
    render(<Callout type="bogus">x</Callout>);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });

  it("renders an icon per variant", () => {
    render(<Callout type="warning">x</Callout>);
    expect(screen.getByTestId("callout-icon-warning")).toBeInTheDocument();
  });
});
