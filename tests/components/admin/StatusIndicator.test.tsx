// @vitest-environment jsdom
//
// M12.2 Phase A Task 1 — StatusIndicator pins the dot+text-paired contract
// (DESIGN.md §1.3 color-blind floor: never color-only) and the no-inline-hex
// token discipline (§10). The defensive idle fallback guards against an
// out-of-set status string reaching the component during partial render.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusIndicator } from "@/components/admin/StatusIndicator";

afterEach(cleanup);

describe("StatusIndicator", () => {
  it("renders a dot and the text label paired (no color-only)", () => {
    render(<StatusIndicator status="positive" label="Synced 2h ago" />);
    expect(screen.getByText("Synced 2h ago")).toBeInTheDocument();
    // dot present + carries the status class, never a raw hex (token discipline §10)
    const dot = screen.getByTestId("status-dot-positive");
    expect(dot.className).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it("falls back to idle for an unknown status (no crash)", () => {
    // @ts-expect-error exercising the defensive default
    render(<StatusIndicator status="bogus" label="?" />);
    expect(screen.getByTestId("status-dot-idle")).toBeInTheDocument();
  });
});
