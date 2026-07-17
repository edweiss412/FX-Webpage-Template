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

// COLLAPSE-REGION-1: region={false} opt-out drops the landmark role + its
// label (meaningless on a generic element) so callers that render many panels
// don't proliferate region landmarks (WAI-APG ~>6 caution). Everything else —
// stable id/testid (aria-controls target), overflow-hidden clip, inert-when-
// closed — is preserved.
it("region=false: no landmark role or aria-label, but id/testid/inert preserved", () => {
  render(
    <CollapsePanel open={false} region={false} id="p-noregion" label="Group panel">
      <div data-testid="child-nr">body</div>
    </CollapsePanel>,
  );
  const panel = screen.getByTestId("p-noregion");
  expect(panel).not.toHaveAttribute("role");
  expect(panel).not.toHaveAttribute("aria-label");
  // still the aria-controls target + still clipped + still inert when closed
  expect(panel).toHaveAttribute("id", "p-noregion");
  expect(panel.className).toContain("overflow-hidden");
  expect(panel).toHaveAttribute("inert");
  expect(screen.getByTestId("child-nr")).toBeInTheDocument();
});

it("region defaults to true (unspecified prop keeps the landmark)", () => {
  render(
    <CollapsePanel open id="p-default" label="Default panel">
      <div>body</div>
    </CollapsePanel>,
  );
  const panel = screen.getByTestId("p-default");
  expect(panel).toHaveAttribute("role", "region");
  expect(panel).toHaveAttribute("aria-label", "Default panel");
});

// Transition-audit: the morph is animated (grid-template-rows over --duration-normal)
// with a reduced-motion escape — NOT an instant mount/unmount.
it("outer track animates grid-template-rows with a reduced-motion fallback", () => {
  render(
    <CollapsePanel open id="p3" label="Panel three">
      <div>body</div>
    </CollapsePanel>,
  );
  const track = screen.getByTestId("p3").parentElement;
  const cls = track?.className ?? "";
  expect(cls).toContain("transition-[grid-template-rows]");
  expect(cls).toContain("duration-normal");
  expect(cls).toContain("motion-reduce:transition-none");
});
