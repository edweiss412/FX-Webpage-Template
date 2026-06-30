// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { EventRow } from "@/components/admin/observability/EventRow";
import type { AppEventRow } from "@/lib/admin/observabilityTypes";

afterEach(cleanup);

const DIR = join(__dirname, "..", "..", "..", "components/admin/observability");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const INSTANT = [
  "CronHealthHeader.tsx",
  "EventTimeline.tsx",
  "EventFilters.tsx",
  "CronRunSummaryCard.tsx",
  "AutoRefreshControl.tsx",
];
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
  test("EventRow is the ONE animated transition: a height disclosure with reduced-motion handling", () => {
    const src = read("EventRow.tsx");
    expect(src).toContain("AnimatePresence");
    expect(src).toMatch(/height:\s*["']?auto/); // height disclosure (220ms)
    expect(src).toContain("useReducedMotion"); // instant under reduced-motion
  });
  test("every OTHER observability component is instant — no AnimatePresence / motion / exit", () => {
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
});
