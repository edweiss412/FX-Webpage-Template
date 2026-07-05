// @vitest-environment jsdom
import { afterEach, describe, expect, test } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { NeedsAttentionSummaryCard } from "@/components/admin/NeedsAttentionSummaryCard";

afterEach(cleanup);

describe("NeedsAttentionSummaryCard sync-problem breakdown", () => {
  test("renders the sync-problem line when syncProblemTotal > 0", () => {
    render(
      <NeedsAttentionSummaryCard
        totalCount={3}
        ingestionTotal={0}
        syncTotal={0}
        syncProblemTotal={3}
      />,
    );
    expect(screen.getByTestId("summary-chip-sync-problems")).toHaveTextContent("3 sync problems");
  });

  test("singular label for exactly one", () => {
    render(
      <NeedsAttentionSummaryCard
        totalCount={1}
        ingestionTotal={0}
        syncTotal={0}
        syncProblemTotal={1}
      />,
    );
    expect(screen.getByTestId("summary-chip-sync-problems")).toHaveTextContent("1 sync problem");
  });

  test("no sync-problem line when zero", () => {
    render(
      <NeedsAttentionSummaryCard
        totalCount={1}
        ingestionTotal={1}
        syncTotal={0}
        syncProblemTotal={0}
      />,
    );
    expect(screen.queryByTestId("summary-chip-sync-problems")).toBeNull();
  });
});
