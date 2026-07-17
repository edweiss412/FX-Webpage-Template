// @vitest-environment jsdom
//
// M12.2 Phase A Task 1 — StatusIndicator pins the dot+text-paired contract
// (DESIGN.md §1.3 color-blind floor: never color-only) and the no-inline-hex
// token discipline (§10). The defensive idle fallback guards against an
// out-of-set status string reaching the component during partial render.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatusDot, StatusIndicator } from "@/components/admin/StatusIndicator";

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

// Sync-indicator "subtle heartbeat" — opt-in pulse behind the positive/synced dot
// only (Model 1: synced pulses subtle, live keeps its stronger/faster animate-ping).
// The halo is decorative (aria-hidden) and hides under prefers-reduced-motion.
describe("StatusDot subtle heartbeat pulse", () => {
  it("renders a heartbeat halo for a positive dot when pulse is set", () => {
    render(<StatusDot status="positive" pulse />);
    const halo = screen.getByTestId("status-pulse-positive");
    expect(halo).toBeInTheDocument();
    expect(halo.className).toMatch(/sync-heartbeat/);
    // reduced-motion floor: the halo is suppressed for motion-averse users
    expect(halo.className).toMatch(/motion-reduce:hidden/);
    // decorative-only — the text label (not this) carries meaning (color-blind floor)
    expect(halo).toHaveAttribute("aria-hidden", "true");
  });

  it("does NOT pulse a positive dot without the flag (published pills etc. stay static)", () => {
    render(<StatusDot status="positive" />);
    expect(screen.queryByTestId("status-pulse-positive")).not.toBeInTheDocument();
  });

  it("does NOT pulse a non-positive dot even with the flag (pulse == healthy-sync only)", () => {
    render(<StatusDot status="warn" pulse />);
    expect(screen.queryByTestId("status-pulse-positive")).not.toBeInTheDocument();
  });

  it("passes pulse through StatusIndicator to the dot", () => {
    render(<StatusIndicator status="positive" label="Synced" pulse />);
    expect(screen.getByTestId("status-pulse-positive")).toBeInTheDocument();
  });

  it("keeps live's stronger ping independent of the pulse flag (Model 1 distinction)", () => {
    const { container } = render(<StatusIndicator status="live" label="Live now" />);
    // live keeps its own faster/stronger animate-ping...
    expect(container.querySelector(".animate-ping")).toBeInTheDocument();
    // ...and never wears the subtle heartbeat halo
    expect(screen.queryByTestId("status-pulse-positive")).not.toBeInTheDocument();
  });
});
