// @vitest-environment jsdom
// M12.2 Phase A Task 4 — StatStrip (spec §5.1). 4 tokenized stat cells;
// tabular-nums on every number; live dot only when liveCount>0; Need-review
// tinted only when >0; degraded (statsScope='shown') labels qualify Live/Crew
// as not-global. Counts render "0", never blank.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { StatStrip } from "@/components/admin/StatStrip";

afterEach(cleanup);

describe("StatStrip", () => {
  it("renders 4 stats with tabular-nums; live dot only when liveCount>0", () => {
    const { rerender } = render(
      <StatStrip
        activeCount={5}
        liveCount={2}
        needReviewCount={3}
        crewTotal={40}
        statsScope="global"
      />,
    );
    for (const id of [
      "stat-value-active",
      "stat-value-live",
      "stat-value-review",
      "stat-value-crew",
    ]) {
      const el = screen.getByTestId(id);
      expect(el.className).toMatch(/tabular-nums/);
    }
    expect(screen.getByTestId("stat-value-live").textContent).toBe("2");
    expect(screen.getByTestId("stat-live-dot")).toBeInTheDocument();

    rerender(
      <StatStrip
        activeCount={5}
        liveCount={0}
        needReviewCount={0}
        crewTotal={40}
        statsScope="global"
      />,
    );
    expect(screen.queryByTestId("stat-live-dot")).toBeNull();
  });

  it("renders 0 (not blank) for zero counts", () => {
    render(
      <StatStrip
        activeCount={0}
        liveCount={0}
        needReviewCount={0}
        crewTotal={0}
        statsScope="global"
      />,
    );
    expect(screen.getByTestId("stat-value-active").textContent).toBe("0");
    expect(screen.getByTestId("stat-value-crew").textContent).toBe("0");
    expect(screen.getByTestId("stat-value-review").textContent).toBe("0");
  });

  it("coerces a non-finite count to 0 defensively", () => {
    render(
      <StatStrip
        activeCount={Number.NaN}
        liveCount={0}
        needReviewCount={0}
        crewTotal={0}
        statsScope="global"
      />,
    );
    expect(screen.getByTestId("stat-value-active").textContent).toBe("0");
  });

  it("statsScope='shown' labels Live + Crew as not-global (degraded); global does not", () => {
    const { rerender } = render(
      <StatStrip
        activeCount={600}
        liveCount={3}
        needReviewCount={1}
        crewTotal={50}
        statsScope="shown"
      />,
    );
    expect(
      within(screen.getByTestId("stat-cell-live")).getByText(/shown shows/i),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("stat-cell-crew")).getByText(/shown shows/i),
    ).toBeInTheDocument();

    rerender(
      <StatStrip
        activeCount={5}
        liveCount={3}
        needReviewCount={1}
        crewTotal={50}
        statsScope="global"
      />,
    );
    expect(within(screen.getByTestId("stat-cell-live")).queryByText(/shown shows/i)).toBeNull();
    expect(within(screen.getByTestId("stat-cell-crew")).queryByText(/shown shows/i)).toBeNull();
  });
});
