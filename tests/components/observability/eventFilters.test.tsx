// @vitest-environment jsdom
// tests/components/observability/eventFilters.test.tsx
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

afterEach(cleanup);

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () =>
    new URLSearchParams(
      "level=error&cursorAt=2026-06-29T00:00:00.000Z&cursorId=00000000-0000-0000-0000-000000000001",
    ),
}));

import { EventFilters, buildFilterHref } from "@/components/admin/observability/EventFilters";

describe("buildFilterHref drops cursor on every mutation", () => {
  test("changing a filter removes cursorAt/cursorId", () => {
    const cur = new URLSearchParams(
      "level=error&cursorAt=2026-06-29T00:00:00.000Z&cursorId=00000000-0000-0000-0000-000000000001",
    );
    const href = buildFilterHref(cur, { source: "cron.sync" });
    const out = new URLSearchParams(href.split("?")[1]);
    expect(out.get("cursorAt")).toBeNull();
    expect(out.get("cursorId")).toBeNull();
    expect(out.get("source")).toBe("cron.sync");
    expect(out.get("level")).toBe("error");
  });
  test("patch value null removes the key", () => {
    const cur = new URLSearchParams("source=x&since=7d");
    const out = new URLSearchParams(buildFilterHref(cur, { source: null }).split("?")[1]);
    expect(out.get("source")).toBeNull();
    expect(out.get("since")).toBe("7d");
  });
});

describe("EventFilters surface (spec §6.2 / AC2)", () => {
  beforeEach(() => push.mockClear());
  test("renders level + since + source/code/show/request + message inputs", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    for (const id of [
      "filter-source",
      "filter-code",
      "filter-showId",
      "filter-requestId",
      "filter-q",
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });
  test("changing the source filter navigates and DROPS the cursor", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    const input = screen.getByTestId("filter-source") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "cron.sync" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledTimes(1);
    const href = push.mock.calls[0]![0] as string;
    expect(href).toContain("source=cron.sync");
    expect(href).not.toContain("cursorAt");
    expect(href).not.toContain("cursorId");
  });
  test("blur commits a changed text filter (non-keyboard mobile path)", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    const input = screen.getByTestId("filter-source") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "cron.sync" } });
    fireEvent.blur(input);
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]![0] as string).toContain("source=cron.sync");
  });
  test("blur with an UNCHANGED text filter does not navigate (no redundant commit)", () => {
    render(<EventFilters filters={{ sinceHours: 24, source: "cron.sync" }} />);
    fireEvent.blur(screen.getByTestId("filter-source"));
    expect(push).not.toHaveBeenCalled();
  });
  test("level toggle drops the cursor (every mutation resets pagination)", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    fireEvent.click(screen.getByRole("button", { name: "error" }));
    const href = push.mock.calls[0]![0] as string;
    expect(href).toContain("level=error");
    expect(href).not.toContain("cursorAt");
    expect(href).not.toContain("cursorId");
  });
  test("since preset drops the cursor", () => {
    render(<EventFilters filters={{ sinceHours: 24 }} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "7d" } });
    const href = push.mock.calls[0]![0] as string;
    expect(href).toContain("since=7d");
    expect(href).not.toContain("cursorAt");
  });
  test("typed-but-uncommitted text survives an auto-refresh re-render with SAME filters (§7 compound)", () => {
    const { rerender } = render(<EventFilters filters={{ sinceHours: 24 }} />);
    const input = screen.getByTestId("filter-source") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "cron.partial-typing" } });
    rerender(<EventFilters filters={{ sinceHours: 24 }} />); // simulates router.refresh() — same committed filters
    expect((screen.getByTestId("filter-source") as HTMLInputElement).value).toBe(
      "cron.partial-typing",
    );
  });
  test("an external committed-filter change re-syncs the displayed value (no stale default)", () => {
    const { rerender } = render(<EventFilters filters={{ sinceHours: 24 }} />);
    rerender(<EventFilters filters={{ source: "cron.sync", sinceHours: 24 }} />);
    expect((screen.getByTestId("filter-source") as HTMLInputElement).value).toBe("cron.sync");
  });
  test("requestId mode shows the 'Showing one request' chip", () => {
    render(<EventFilters filters={{ requestId: "req-9", sinceHours: null }} />);
    expect(screen.getByText(/Showing one request/)).toBeInTheDocument();
  });
});
