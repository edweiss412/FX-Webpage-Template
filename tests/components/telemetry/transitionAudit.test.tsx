// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EventRow } from "@/components/admin/telemetry/EventRow";
import type { AppEventRow } from "@/lib/admin/telemetryTypes";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

import { AutoRefreshControl } from "@/components/admin/telemetry/AutoRefreshControl";

afterEach(cleanup);

const DIR = join(__dirname, "..", "..", "..", "components/admin/telemetry");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
// Every telemetry surface EXCEPT EventRow is instant (no framer-motion). The console
// components (overview strip, sparkline, chips, cron list) are deliberately instant per spec
// §9; the restyled AutoRefreshControl pulse is a CSS keyframe (.telemetry-ping) gated by
// `on` + prefers-reduced-motion, NOT a JS transition.
//
// DERIVED FROM DISK, not written out. The literal nine-name list this replaced could not see
// a component added to the directory, which is exactly how it drifts: it was already missing
// ContextDetail, EventLevelBadge, HealthAlertResolveButton and HealthAlertsPanel, and would
// have missed TelemetryRetryButton too. `EventRow.tsx` is excluded because it is the one
// deliberately animated file and has its own dedicated cases below.
const INSTANT = readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx") && f !== "EventRow.tsx")
  .sort();

const now = new Date("2026-06-29T12:00:00.000Z");
const ev: AppEventRow = {
  id: "x",
  occurredAt: "2026-06-29T11:00:00.000Z",
  level: "info",
  source: "s",
  message: "m",
  code: null,
  requestId: null,
  showId: null,
  driveFileId: null,
  actorHash: null,
  context: { a: 1 },
  showTitle: null,
  showSlug: null,
};

describe("transition inventory (spec §7)", () => {
  // A readdirSync against a mistyped path returns nothing and makes the loop below vacuous,
  // which is the degenerate case a derived population is most exposed to. Both halves are
  // needed: a non-empty list that still contained EventRow would assert the opposite of what
  // this suite means.
  test("the derived population is real and excludes the one animated file", () => {
    expect(INSTANT.length).toBeGreaterThan(5);
    expect(INSTANT).not.toContain("EventRow.tsx");
    expect(INSTANT).toContain("AutoRefreshControl.tsx");
  });

  test("EventRow is the ONE animated transition: a height disclosure with reduced-motion handling", () => {
    const src = read("EventRow.tsx");
    expect(src).toContain("AnimatePresence");
    expect(src).toMatch(/height:\s*["']?auto/); // height disclosure (220ms)
    expect(src).toContain("useReducedMotion"); // instant under reduced-motion
  });
  test("every OTHER telemetry component is instant — no AnimatePresence / motion / exit", () => {
    for (const f of INSTANT) {
      const src = read(f);
      expect(src, `${f} should be instant`).not.toContain("AnimatePresence");
      expect(src, `${f} should be instant`).not.toContain("motion.");
      expect(src, `${f} should be instant`).not.toMatch(/\bexit=\{/);
    }
  });
  test("EventRow expand mounts ContextDetail and flips aria-expanded (the one interactive transition)", () => {
    render(<EventRow event={ev} now={now} />);
    const toggle = screen.getByTestId("event-row-toggle-x");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("event-full-message")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByTestId("event-full-message")).toBeInTheDocument();
    cleanup();
  });
  test("compound: an expanded EventRow survives a re-render (auto-refresh poll) — stays open", () => {
    // open state is client-local (useState), so a soft router.refresh() re-render keeps it expanded.
    const { rerender } = render(<EventRow event={ev} now={now} />);
    fireEvent.click(screen.getByTestId("event-row-toggle-x"));
    expect(screen.getByTestId("event-full-message")).toBeInTheDocument();
    rerender(<EventRow event={ev} now={new Date(now.getTime() + 20_000)} />); // new now, same event
    expect(screen.getByTestId("event-full-message")).toBeInTheDocument();
    cleanup();
  });
  test("the pulse ping is a CSS keyframe gated by `on`, not a JS animation", () => {
    const src = read("AutoRefreshControl.tsx");
    expect(src).toContain("telemetry-ping"); // CSS keyframe class (globals.css @keyframes tping)
    expect(src).toMatch(/on\s*&&/); // ping rendered only when ON
    expect(src).not.toContain("AnimatePresence");
  });
  test("compound: toggling auto-refresh while an event row is expanded — independent subtrees both proceed", () => {
    render(
      <div>
        <AutoRefreshControl />
        <EventRow event={ev} now={now} />
      </div>,
    );
    // expand the row
    fireEvent.click(screen.getByTestId("event-row-toggle-x"));
    expect(screen.getByTestId("event-full-message")).toBeInTheDocument();
    // ping present while ON
    expect(screen.getByTestId("autorefresh-ping")).toBeInTheDocument();
    // toggle auto-refresh OFF mid-expand — the row stays open, the ping disappears
    fireEvent.click(screen.getByTestId("autorefresh-toggle"));
    expect(screen.queryByTestId("autorefresh-ping")).toBeNull();
    expect(screen.getByTestId("event-full-message")).toBeInTheDocument(); // row unaffected
    cleanup();
  });
});
