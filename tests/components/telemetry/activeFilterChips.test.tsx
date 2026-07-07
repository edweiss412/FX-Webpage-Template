// @vitest-environment jsdom
// tests/components/telemetry/activeFilterChips.test.tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const push = vi.fn();
const spHolder = { value: "" };
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(spHolder.value),
}));

import { ActiveFilterChips } from "@/components/admin/telemetry/ActiveFilterChips";

afterEach(cleanup);
beforeEach(() => {
  push.mockClear();
  spHolder.value = "";
});

describe("ActiveFilterChips", () => {
  test("empty filter set → renders nothing", () => {
    const { container } = render(<ActiveFilterChips filters={{}} />);
    expect(container.firstChild).toBeNull();
  });

  test("one chip per active level + a source chip", () => {
    spHolder.value = "level=warn,error&source=cron.x";
    render(<ActiveFilterChips filters={{ levels: ["warn", "error"], source: "cron.x" }} />);
    expect(screen.getByTestId("chip-remove-level-warn")).toBeInTheDocument();
    expect(screen.getByTestId("chip-remove-level-error")).toBeInTheDocument();
    expect(screen.getByTestId("chip-remove-source")).toBeInTheDocument();
  });

  test("removing the source chip pushes an href without source", () => {
    spHolder.value = "level=warn,error&source=cron.x";
    render(<ActiveFilterChips filters={{ levels: ["warn", "error"], source: "cron.x" }} />);
    fireEvent.click(screen.getByTestId("chip-remove-source"));
    expect(push).toHaveBeenCalledWith(expect.not.stringContaining("source=cron.x"));
  });

  test("removing one of two levels keeps the other in the pushed level csv", () => {
    spHolder.value = "level=warn,error";
    render(<ActiveFilterChips filters={{ levels: ["warn", "error"] }} />);
    fireEvent.click(screen.getByTestId("chip-remove-level-warn"));
    const href = push.mock.calls[0]![0] as string;
    expect(href).toContain("level=error");
    expect(href).not.toContain("warn");
  });

  test("since ≠ 24h renders a chip; 24h (default) does not", () => {
    spHolder.value = "since=7d";
    const { rerender } = render(<ActiveFilterChips filters={{ sinceHours: 168 }} />);
    expect(screen.getByTestId("chip-remove-since")).toBeInTheDocument();
    spHolder.value = "";
    rerender(<ActiveFilterChips filters={{ sinceHours: 24 }} />);
    expect(screen.queryByTestId("chip-remove-since")).not.toBeInTheDocument();
  });

  test("Clear filters pushes BASE", () => {
    spHolder.value = "source=cron.x";
    render(<ActiveFilterChips filters={{ source: "cron.x" }} />);
    fireEvent.click(screen.getByTestId("clear-filters"));
    expect(push).toHaveBeenCalledWith("/admin/dev/telemetry");
  });
});
