// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import type { ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => cleanup());

function baseRow(over: Partial<StagedRow> = {}): StagedRow {
  return {
    driveFileId: "df1",
    stagedId: "s1",
    sourceKind: "cron",
    stagedModifiedTime: "2026-01-01T00:00:00.000Z",
    baseModifiedTime: null,
    warningSummary: "",
    triggeredReviewItems: [],
    ...over,
  };
}

describe("StagedReviewCard operator-actionable warnings", () => {
  it("renders the title + Open-in-Sheet link for an anchored UNKNOWN_ROLE_TOKEN", () => {
    const actionable: ParseWarning[] = [
      { severity: "warn", code: "UNKNOWN_ROLE_TOKEN", message: "x", sourceCell: { title: "INFO", gid: 0, a1: "C3" } },
    ];
    render(<StagedReviewCard row={baseRow({ operatorActionable: actionable })} />);
    expect(screen.getByText("Role we didn't recognize")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /open in sheet/i }).getAttribute("href"),
    ).toContain("range=C3");
  });

  it("renders nothing extra when operatorActionable is empty/absent", () => {
    render(<StagedReviewCard row={baseRow()} />);
    expect(screen.queryByText("Role we didn't recognize")).toBeNull();
  });
});
