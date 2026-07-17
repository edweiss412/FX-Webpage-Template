// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CollapsePanel } from "@/components/admin/CollapsePanel";

afterEach(cleanup);

it("open: region grid-item is present, labeled, not inert; track is 1fr", () => {
  render(
    <CollapsePanel open id="p1" label="Panel one">
      <div data-testid="child">body</div>
    </CollapsePanel>,
  );
  const region = screen.getByTestId("p1");
  expect(region).toHaveAttribute("role", "region");
  expect(region).toHaveAttribute("aria-label", "Panel one");
  expect(region).not.toHaveAttribute("inert");
  expect(region.parentElement?.className).toContain("grid-rows-[1fr]");
  expect(screen.getByTestId("child")).toBeInTheDocument();
});

it("closed: children still mounted, region is inert; track is 0fr", () => {
  render(
    <CollapsePanel open={false} id="p2" label="Panel two">
      <div data-testid="child2">body</div>
    </CollapsePanel>,
  );
  const region = screen.getByTestId("p2");
  expect(region).toHaveAttribute("inert");
  expect(region.parentElement?.className).toContain("grid-rows-[0fr]");
  // always-mounted: child present even when closed
  expect(screen.getByTestId("child2")).toBeInTheDocument();
});
