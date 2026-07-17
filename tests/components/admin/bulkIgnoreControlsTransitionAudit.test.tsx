// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { BulkIgnoreControls, type ActiveWarningGroup } from "@/components/admin/BulkIgnoreControls";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
beforeEach(() => { global.fetch = vi.fn() as unknown as typeof fetch; });
afterEach(() => { cleanup(); vi.useRealTimers(); });

const g = (): ActiveWarningGroup => ({
  code: "UNKNOWN_FIELD",
  label: "Unrecognized row in sheet",
  bulk: { code: "UNKNOWN_FIELD", label: "Unrecognized row in sheet", items: [
    { code: "UNKNOWN_FIELD", rawSnippet: "a | 1" }, { code: "UNKNOWN_FIELD", rawSnippet: "b | 2" },
  ] },
  cards: <ul data-testid="cards" />,
});

describe("BulkIgnoreControls transition audit (spec §5.4)", () => {
  test("idle→armed is an instant class morph (chip is NOT remounted)", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[g()]} />);
    const before = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    fireEvent.click(before);
    expect(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD")).toBe(before); // same identity
    expect(before.className).toContain("transition-opacity");
  });

  test("armed→idle auto-revert is instant and restores the exact idle class (no leftover recipe token)", () => {
    vi.useFakeTimers();
    render(<BulkIgnoreControls slug="rpas" groups={[g()]} />);
    const chip = screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD");
    const idle = chip.className;
    fireEvent.click(chip);
    expect(chip.className).not.toBe(idle);
    act(() => vi.advanceTimersByTime(4_000));
    expect(chip.className).toBe(idle);
    expect(chip.className).not.toContain("bg-warning-text");
  });

  test("eyebrow label + hairline rule are static across the chip morph", () => {
    render(<BulkIgnoreControls slug="rpas" groups={[g()]} />);
    const before = screen.getByTestId("dq-group-label-UNKNOWN_FIELD").className;
    fireEvent.click(screen.getByTestId("dq-bulk-ignore-UNKNOWN_FIELD"));
    expect(screen.getByTestId("dq-group-label-UNKNOWN_FIELD").className).toBe(before);
  });
});
