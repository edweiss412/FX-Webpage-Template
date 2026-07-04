// @vitest-environment jsdom
// alert-audience-split Task 5 (spec §6.3/§6.4): behavior contract for the nav
// app-health indicator + Doug popover.
//   - dot color+label pairing per state (AC3 exact class mapping);
//   - Doug renders a <button> opening the popover; developer renders a <Link>
//     deep-linking to /admin/observability#health;
//   - popover lists the plain-language summaries, a "+N more" overflow note,
//     and the literally-true closing reassurance line — never "notified".
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import type { HealthStatus } from "@/lib/admin/healthRollup";
import { AppHealthIndicator } from "@/components/admin/nav/AppHealthIndicator";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/admin",
}));

afterEach(() => cleanup());

const degraded: HealthStatus = {
  kind: "degraded",
  count: 4,
  summaries: [
    { text: "A push notification failed a security check.", count: 3 },
    { text: "A background report lease is thrashing.", count: 1 },
  ],
  overflowCount: 2,
};
const notice: HealthStatus = {
  kind: "notice",
  count: 1,
  summaries: [{ text: "A picker selection raced.", count: 1 }],
  overflowCount: 0,
};
const ok: HealthStatus = { kind: "ok" };
const infra: HealthStatus = { kind: "infra_error" };

describe("AppHealthIndicator — dot color + label pairing (AC3)", () => {
  test.each([
    [
      "degraded",
      degraded,
      "app-health-dot-degraded",
      "bg-status-degraded",
      "System health: needs attention",
    ],
    ["notice", notice, "app-health-dot-notice", "bg-status-warn", "System health: needs attention"],
    ["ok", ok, "app-health-dot-ok", "bg-status-positive", "All systems normal"],
    [
      "infra_error",
      infra,
      "app-health-dot-infra_error",
      "bg-status-idle",
      "System health status unknown",
    ],
  ] as const)(
    "%s → dot testid + exact bg class + aria-label",
    (_name, rollup, dotTestId, bgClass, label) => {
      const { getByTestId } = render(<AppHealthIndicator rollup={rollup} isDeveloper={false} />);
      const dot = getByTestId(dotTestId);
      expect(dot.className).toContain(bgClass);
      // Color is paired with a text label naming the state (color-blind floor).
      const trigger = getByTestId("app-health-indicator");
      expect(trigger.getAttribute("aria-label")).toBe(label);
    },
  );
});

describe("AppHealthIndicator — Doug button vs developer deep-link", () => {
  test("Doug (isDeveloper=false) renders a <button> that opens the popover", () => {
    const { getByTestId, queryByTestId } = render(
      <AppHealthIndicator rollup={degraded} isDeveloper={false} />,
    );
    const trigger = getByTestId("app-health-indicator");
    expect(trigger.tagName).toBe("BUTTON");
    expect(queryByTestId("app-health-popover")).toBeNull();
    fireEvent.click(trigger);
    expect(getByTestId("app-health-popover")).toBeTruthy();
  });

  test("developer (isDeveloper=true) renders an anchor to /admin/observability#health", () => {
    const { getByTestId } = render(<AppHealthIndicator rollup={degraded} isDeveloper={true} />);
    const trigger = getByTestId("app-health-indicator");
    expect(trigger.tagName).toBe("A");
    expect(trigger.getAttribute("href")).toBe("/admin/observability#health");
  });
});

describe("AppHealthPopover (Doug) — summaries, overflow, closing line", () => {
  test("lists each summary line, a '+N more' overflow note, and the exact closing reassurance", () => {
    const { getByTestId } = render(<AppHealthIndicator rollup={degraded} isDeveloper={false} />);
    fireEvent.click(getByTestId("app-health-indicator"));
    const pop = getByTestId("app-health-popover");
    const body = within(pop);
    expect(pop.textContent).toContain("A push notification failed a security check.");
    expect(pop.textContent).toContain("A background report lease is thrashing.");
    // overflowCount=2 → "+2 more background items"
    expect(pop.textContent).toContain("2 more");
    // The literally-true closing reassurance — no outbound notification path exists.
    expect(pop.textContent).toContain(
      "No action needed from you — the developer can see this in system health.",
    );
    // R1 finding 2: never claim the developer "has been notified".
    expect(pop.textContent).not.toContain("notified");
    // A per-line ×count multiplier renders for count>1.
    expect(body.getByText(/×3/)).toBeTruthy();
    // Title present.
    expect(pop.textContent).toContain("System status");
  });

  test("no overflow note when overflowCount is 0", () => {
    const { getByTestId, queryByText } = render(
      <AppHealthIndicator rollup={notice} isDeveloper={false} />,
    );
    fireEvent.click(getByTestId("app-health-indicator"));
    expect(queryByText(/more background items/)).toBeNull();
  });
});
