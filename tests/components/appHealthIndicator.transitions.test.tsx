// @vitest-environment jsdom
// alert-audience-split Task 5 transition audit (spec §9 verbatim):
//   - indicator states ok/notice/degraded/unknown — all 6 pairs INSTANT: the
//     dot carries NO animation props across the 4 kinds (SSR re-render, no
//     client morph, no AnimatePresence);
//   - popover closed↔open uses the shared sheet pattern's enter/exit and
//     respects prefers-reduced-motion (`motion-reduce`);
//   - compound: changing `rollup` while the popover is OPEN does not remount /
//     mutate the open panel mid-flight (it reads the snapshot it opened with).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { HealthStatus } from "@/lib/admin/healthRollup";
import { AppHealthIndicator } from "@/components/admin/nav/AppHealthIndicator";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

afterEach(() => cleanup());

const indicatorSrc = readFileSync(
  join(process.cwd(), "components/admin/nav/AppHealthIndicator.tsx"),
  "utf8",
);
const popoverSrc = readFileSync(
  join(process.cwd(), "components/admin/AppHealthPopover.tsx"),
  "utf8",
);

const degraded: HealthStatus = {
  kind: "degraded",
  count: 2,
  summaries: [{ text: "A thing.", count: 1 }],
  overflowCount: 0,
};
const notice: HealthStatus = {
  kind: "notice",
  count: 1,
  summaries: [{ text: "Another thing.", count: 1 }],
  overflowCount: 0,
};

describe("indicator dot is INSTANT across all states (spec §9)", () => {
  test("no framer-motion / AnimatePresence anywhere in the indicator", () => {
    expect(indicatorSrc).not.toMatch(/framer-motion|AnimatePresence/);
  });

  test.each(["degraded", "notice", "ok", "infra_error"] as const)(
    "%s dot carries no animation utility class",
    (kind) => {
      const rollup =
        kind === "degraded" ? degraded : kind === "notice" ? notice : ({ kind } as HealthStatus);
      const { getByTestId } = render(<AppHealthIndicator rollup={rollup} isDeveloper={false} />);
      const dot = getByTestId(`app-health-dot-${kind}`);
      // No transition/animation utilities on the dot (instant SSR swap).
      expect(dot.className).not.toMatch(/animate-|transition|motion-safe:animate/);
    },
  );
});

describe("popover honors prefers-reduced-motion (spec §9)", () => {
  test("the popover source scopes its enter/exit animation behind motion-reduce/motion-safe", () => {
    expect(popoverSrc).toMatch(/motion-reduce:|motion-safe:/);
  });
});

describe("compound: rollup change while popover OPEN does not remount the panel", () => {
  test("the open panel persists (same node) across a rollup prop change", () => {
    const { getByTestId, rerender } = render(
      <AppHealthIndicator rollup={degraded} isDeveloper={false} />,
    );
    fireEvent.click(getByTestId("app-health-indicator"));
    const panelBefore = getByTestId("app-health-popover");
    // A background re-render changes the rollup while the popover is open.
    rerender(<AppHealthIndicator rollup={notice} isDeveloper={false} />);
    const panelAfter = getByTestId("app-health-popover");
    // Still open, and it is the SAME DOM node (no unmount/remount churn).
    expect(panelAfter).toBe(panelBefore);
  });
});
