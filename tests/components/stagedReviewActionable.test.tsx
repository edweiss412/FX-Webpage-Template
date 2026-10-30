// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StagedReviewCard, type StagedRow } from "@/components/admin/StagedReviewCard";
import type { ParseWarning } from "@/lib/parser/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  // admin-show-modal Task 11: StagedReviewCard builds param-preserving modal hrefs.
  useSearchParams: () => new URLSearchParams(),
}));

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
  it("renders the title + the sheet icon link for an anchored UNKNOWN_ROLE_TOKEN", () => {
    const actionable: ParseWarning[] = [
      {
        severity: "warn",
        code: "UNKNOWN_ROLE_TOKEN",
        message: "x",
        sourceCell: { title: "INFO", gid: 0, a1: "C3" },
      },
    ];
    render(<StagedReviewCard row={baseRow({ operatorActionable: actionable })} />);
    expect(screen.getByText("Role we didn't recognize")).toBeTruthy();
    // warning-card-fixes §3.6 (R11): the link is the card's message-row icon, whose
    // accessible name names the card title rather than reading "Open in Sheet".
    const link = screen.getByRole("link", { name: /Role we didn.t recognize/ });
    expect(link).toBe(screen.getByTestId("per-show-actionable-sheetlink"));
    expect(link.getAttribute("href")).toContain("range=C3");
  });

  it("renders nothing extra when operatorActionable is empty/absent", () => {
    render(<StagedReviewCard row={baseRow()} />);
    expect(screen.queryByText("Role we didn't recognize")).toBeNull();
  });
});
