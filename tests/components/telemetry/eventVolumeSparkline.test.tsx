// @vitest-environment jsdom
// tests/components/telemetry/eventVolumeSparkline.test.tsx
import { afterEach, describe, expect, test } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EventVolumeSparkline } from "@/components/admin/telemetry/EventVolumeSparkline";

afterEach(cleanup);

function bars() {
  return Array.from(screen.getByTestId("event-sparkline").querySelectorAll("span[data-bar]"));
}

describe("EventVolumeSparkline", () => {
  test("one bar per bucket; heights scale to [3,22] against the max", () => {
    render(<EventVolumeSparkline buckets={[0, 2, 4, 0, 8]} />);
    const b = bars();
    expect(b).toHaveLength(5);
    // max = 8 → height(v) = 3 + (v/8)*(22-3)
    expect((b[4] as HTMLElement).style.height).toBe("22px"); // max
    expect((b[0] as HTMLElement).style.height).toBe("3px"); // zero → baseline
  });

  test("the last bar (current hour) is accented; the rest are neutral", () => {
    render(<EventVolumeSparkline buckets={[1, 2, 3]} />);
    const b = bars();
    expect((b[2] as HTMLElement).className).toContain("bg-accent");
    expect((b[0] as HTMLElement).className).not.toContain("bg-accent");
    expect((b[0] as HTMLElement).className).toContain("bg-border-strong");
  });

  test("all-zero → every bar at the 3px baseline, still renders", () => {
    render(<EventVolumeSparkline buckets={[0, 0, 0]} />);
    for (const bar of bars()) expect((bar as HTMLElement).style.height).toBe("3px");
    expect(screen.getByTestId("event-sparkline")).toBeInTheDocument();
  });

  test("empty buckets (infra/no-data) → a flat 24-bar baseline, never zero bars (spec §7.3)", () => {
    render(<EventVolumeSparkline buckets={[]} />);
    const b = bars();
    expect(b).toHaveLength(24); // never collapses to zero bars
    for (const bar of b) expect((bar as HTMLElement).style.height).toBe("3px");
  });

  test("has an accessible label", () => {
    render(<EventVolumeSparkline buckets={[1]} />);
    expect(screen.getByTestId("event-sparkline")).toHaveAttribute("role", "img");
    expect(screen.getByTestId("event-sparkline").getAttribute("aria-label")).toMatch(/24 hours/i);
  });
});
