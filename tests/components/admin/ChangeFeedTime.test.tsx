// @vitest-environment jsdom
//
// Phase 6 T6.2 — ChangeFeedTime wraps the existing formatRelative helper in a
// <time dateTime> element. Failure mode: raw ISO leaks into the DOM, or the
// machine-readable dateTime attribute is dropped.
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ChangeFeedTime } from "@/components/admin/ChangeFeedTime";

afterEach(cleanup);

it("renders a relative label and preserves the ISO in dateTime", () => {
  const now = new Date("2026-06-09T12:00:00Z");
  const { container } = render(<ChangeFeedTime occurredAt="2026-06-09T11:00:00Z" now={now} />);
  const el = container.querySelector("time");
  expect(el).not.toBeNull();
  expect(el!.getAttribute("dateTime")).toBe("2026-06-09T11:00:00Z");
  // does NOT render the raw ISO as visible text
  expect(el!.textContent).not.toBe("2026-06-09T11:00:00Z");
  // a relative label IS rendered
  expect(el!.textContent).toMatch(/1h ago/);
});
